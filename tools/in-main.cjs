#!/usr/bin/env node
/*
 * in-main.cjs — 比對某分支或 commit 範圍改過的檔案是否已經以相同內容進了 base（預設 origin/main）。
 *
 * 起因：分支上的提交可能經由 cherry-pick、squash 或整批合併以不同的 commit 編號進入 main，
 *       只比 commit SHA 會誤判為「未合併」。本工具直接逐檔比對「分支版樹物件與內容」與「base 現在的樹物件與內容」。
 *
 * 用法：
 *   node tools/in-main.cjs <分支或 commit 範圍> [--base origin/main] [--json]
 *
 * 範例：
 *   node tools/in-main.cjs lab-bio
 *   node tools/in-main.cjs ag-bugfix-1127 --base origin/main
 *   node tools/in-main.cjs abc1234..def5678 --json
 *
 * 忽略 stamp 差異的正規化規則（嚴格對應 tools/stamp.py，只套用於可無損解碼為 UTF-8 的文字檔）：
 *   1. 換行符統一：\r\n 統一轉為 \n。
 *   2. HTML 檔（*.html）：
 *      - 移除 <meta name="lab-updated" content="..."> 整行。
 *      - 僅移除 tools/stamp.py 實際改寫的站內靜態資源（根目錄 *.css 與 js/**\/*.js）尾端的 ?v=[\w-]+ 版本號；
 *        外站 URL（https://、http://、// 等）與非 stamp 資源之查詢字串一律保留比對。
 *   3. tools/page-updated.json：
 *      - 各頁條目僅比對頁面鍵名與內容指紋 "h"，忽略時間戳欄位 "t"。
 *   若兩邊樹物件權限／類型相同、原始位元組不同，但套用上述規則後完全一致，仍判定為「已上線」，並標記為 stampOnly。
 *
 * 分類規則：
 *   - 已上線（inMain）：分支與 base 的樹物件權限／類型及內容相同（含僅差 stamp），或分支已刪且 base 亦不存在。
 *   - 不同（different）：分支與 base 兩邊皆有此檔，但權限／類型或正規化後內容不同（文字檔印出差幾行，二進位／超大檔印出大小）。
 *   - 未上線（notInMain）：分支新增／修改的檔在 base 不存在，或分支已刪的檔在 base 仍然存在。
 *
 * 結束碼：
 *   0 = 全部已上線（不同 0 且未上線 0）
 *   1 = 有不同或未上線的檔案
 *   2 = 參數錯誤、git 參照不存在或 git 物件讀取失敗
 */
'use strict';

const { execFileSync } = require('child_process');
const path = require('path');

const DEFAULT_MAX_READ_BYTES = 32 * 1024 * 1024; // 32 MiB：大於此值直接依 blob ID 與大小判定，避免超緩衝

const USAGE = [
  '用法：node tools/in-main.cjs <分支或 commit 範圍> [--base origin/main] [--json]',
  '範例：node tools/in-main.cjs lab-bio',
  '      node tools/in-main.cjs abc1234..def5678 --base origin/main --json'
].join('\n');

function parseArgs(argv) {
  let target = null;
  let base = 'origin/main';
  let json = false;
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') {
      help = true;
    } else if (a === '--json') {
      json = true;
    } else if (a === '--base') {
      if (i + 1 >= argv.length || !argv[i + 1] || argv[i + 1].startsWith('-')) {
        return { error: '--base 後面必須提供基準分支或 commit 名稱。' };
      }
      base = argv[++i];
    } else if (a.startsWith('--base=')) {
      base = a.slice('--base='.length);
      if (!base) return { error: '--base= 後面不可為空。' };
    } else if (a.startsWith('-')) {
      return { error: '不認得的選項：' + a };
    } else {
      if (target !== null) return { error: '只能指定一個分支或 commit 範圍（多餘參數：' + a + '）。' };
      target = a;
    }
  }

  if (help) return { help: true };
  if (!target) return { error: '請指定要檢查的分支或 commit 範圍。' };
  return { target, base, json };
}

function runGit(args, cwd, encoding, maxBufferBytes) {
  return execFileSync('git', ['-c', 'core.quotepath=false'].concat(args), {
    cwd,
    encoding: encoding || 'utf8',
    windowsHide: true,
    maxBuffer: maxBufferBytes || 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

function tryRevParse(ref, cwd) {
  try {
    return runGit(['rev-parse', '--verify', ref + '^{commit}'], cwd).trim();
  } catch (e) {
    return null;
  }
}

/**
 * 查詢 commit 樹物件中指定路徑的 mode、type 與 oid。
 * 路徑不存在時回 null；git 執行失敗或輸出格式異常時直接拋錯（不吞錯）。
 */
function getTreeEntry(commit, filePath, cwd) {
  const raw = runGit(['ls-tree', '-z', commit, '--', filePath], cwd, 'buffer');
  if (!raw.length) return null;
  const first = raw.toString('utf8').split('\0')[0];
  if (!first) return null;
  const tab = first.indexOf('\t');
  if (tab < 0) throw new Error(`無法解析樹物件資訊：${commit}:${filePath}`);
  const meta = first.slice(0, tab).split(' ');
  if (meta.length < 3) throw new Error(`無法解析樹物件欄位：${commit}:${filePath}`);
  return {
    mode: meta[0],
    type: meta[1],
    oid: meta[2],
    path: first.slice(tab + 1)
  };
}

/** 查詢 Git 物件大小（位元組），失敗直接拋錯。 */
function getObjectSize(oid, cwd) {
  const out = runGit(['cat-file', '-s', oid], cwd).trim();
  const n = Number(out);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`無法取得物件大小：${oid}`);
  }
  return n;
}

/** 依 blob oid 讀取完整位元組內容，讀取失敗一律拋錯（不轉成 null）。 */
function readBlobByOid(oid, cwd, maxBufferBytes) {
  try {
    return runGit(['cat-file', 'blob', oid], cwd, 'buffer', maxBufferBytes);
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    throw new Error(`讀取 Git 物件 ${oid.slice(0, 12)} 失敗：${msg}`);
  }
}

function isValidUtf8Text(buf) {
  const len = Math.min(buf.length, 8192);
  for (let i = 0; i < len; i++) {
    if (buf[i] === 0) return false;
  }
  const text = buf.toString('utf8');
  return Buffer.from(text, 'utf8').equals(buf);
}

function isBinaryBuffer(buf) {
  return !isValidUtf8Text(buf);
}

/** 依 tools/stamp.py 實際改寫規則移除 stamp 差異，回傳正規化後的文字（統一 LF）。 */
function normalizeText(filePath, text) {
  let s = text.replace(/\r\n/g, '\n');
  const normPath = filePath.replace(/\\/g, '/');

  if (normPath.endsWith('.html')) {
    s = s.replace(/^[ \t]*<meta name="lab-updated" content="[^"]*">\n?/gm, '');
    // 嚴格對應 tools/stamp.py 第 12 行：只移除站內根目錄 *.css 與 js/**/*.js 的 ?v=[\w-]+
    s = s.replace(
      /((?:href|src)="(?:[\w-]+\.css|js\/(?:[\w-]+\/)*[\w.-]+\.js))\?v=[\w-]+(")/g,
      '$1$2'
    );
  } else if (normPath === 'tools/page-updated.json') {
    try {
      const obj = JSON.parse(s);
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        const cleaned = {};
        for (const k of Object.keys(obj).sort()) {
          const v = obj[k];
          cleaned[k] = v && typeof v === 'object' ? { h: v.h || '' } : v;
        }
        s = JSON.stringify(cleaned, null, 2) + '\n';
      }
    } catch (e) {
      /* 非合法 JSON 就維持原樣比對 */
    }
  }
  return s;
}

function splitLines(text) {
  if (text === '') return [];
  const lines = text.split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/**
 * 計算兩份文字（已正規化）的增刪行數。
 * 以去頭尾共同行後的 Myers O((N+M)D) 算法求最短編輯腳本；
 * 若超大檔或差異過大超過門檻，改以行頻率多重集差異作保守估算，避免記憶體暴漲。
 */
function countDiffLines(baseText, targetText) {
  const a = splitLines(baseText);
  const b = splitLines(targetText);
  let start = 0;
  const minLen = Math.min(a.length, b.length);
  while (start < minLen && a[start] === b[start]) start++;

  let endA = a.length - 1;
  let endB = b.length - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) {
    endA--;
    endB--;
  }

  const x = a.slice(start, endA + 1);
  const y = b.slice(start, endB + 1);
  const n = x.length;
  const m = y.length;
  if (n === 0 && m === 0) return { added: 0, deleted: 0, diffLines: 0, approx: false };
  if (n === 0) return { added: m, deleted: 0, diffLines: m, approx: false };
  if (m === 0) return { added: 0, deleted: n, diffLines: n, approx: false };

  const MAX_D = 2500;
  const maxSteps = Math.min(n + m, MAX_D);
  const offset = maxSteps;
  const v = new Int32Array(2 * maxSteps + 1);
  let foundD = -1;

  for (let d = 0; d <= maxSteps; d++) {
    for (let k = -d; k <= d; k += 2) {
      let row;
      if (k === -d || (k !== d && v[k - 1 + offset] < v[k + 1 + offset])) {
        row = v[k + 1 + offset];
      } else {
        row = v[k - 1 + offset] + 1;
      }
      let col = row - k;
      while (row < n && col < m && x[row] === y[col]) {
        row++;
        col++;
      }
      v[k + offset] = row;
      if (row >= n && col >= m) {
        foundD = d;
        break;
      }
    }
    if (foundD >= 0) break;
  }

  if (foundD >= 0) {
    // D = added + deleted，且 m - n = added - deleted
    const added = (foundD + (m - n)) / 2;
    const deleted = (foundD - (m - n)) / 2;
    return { added, deleted, diffLines: foundD, approx: false };
  }

  // 超大差異退回多重集估算
  const counts = new Map();
  for (const line of x) counts.set(line, (counts.get(line) || 0) + 1);
  let shared = 0;
  for (const line of y) {
    const c = counts.get(line) || 0;
    if (c > 0) {
      shared++;
      counts.set(line, c - 1);
    }
  }
  const deleted = n - shared;
  const added = m - shared;
  return { added, deleted, diffLines: added + deleted, approx: true };
}

/** 解析 <分支或 commit 範圍> 為 { fromSha, toSha, isExplicitRange }。 */
function resolveRange(target, baseSha, cwd) {
  let leftRef = null;
  let rightRef = null;
  let useMergeBase = false;

  if (target.includes('...')) {
    const parts = target.split('...');
    if (parts.length !== 2) throw new Error('無效的 commit 範圍語法：' + target);
    leftRef = parts[0] || 'HEAD';
    rightRef = parts[1] || 'HEAD';
    useMergeBase = true;
  } else if (target.includes('..')) {
    const parts = target.split('..');
    if (parts.length !== 2) throw new Error('無效的 commit 範圍語法：' + target);
    leftRef = parts[0] || 'HEAD';
    rightRef = parts[1] || 'HEAD';
  } else {
    rightRef = target;
    useMergeBase = true;
  }

  const toSha = tryRevParse(rightRef, cwd);
  if (!toSha) throw new Error('找不到目標分支或 commit：' + rightRef);

  let fromSha;
  if (useMergeBase) {
    const leftSha = leftRef ? tryRevParse(leftRef, cwd) : baseSha;
    if (!leftSha) throw new Error('找不到起點參照：' + leftRef);
    try {
      fromSha = runGit(['merge-base', leftSha, toSha], cwd).trim();
    } catch (e) {
      throw new Error('無法找出 ' + (leftRef || 'base') + ' 與 ' + rightRef + ' 的共同祖先（merge-base）。');
    }
  } else {
    fromSha = tryRevParse(leftRef, cwd);
    if (!fromSha) throw new Error('找不到起點 commit：' + leftRef);
  }

  const isExplicitRange = target.includes('..');
  return { fromSha, toSha, isExplicitRange };
}

/** 讀取 fromSha..toSha 變動檔案（-z --no-renames，正確處理中文與空白路徑）。 */
function listChangedFiles(fromSha, toSha, cwd) {
  const raw = runGit(['diff', '--name-status', '-z', '--no-renames', fromSha, toSha], cwd, 'buffer');
  if (!raw.length) return [];
  const tokens = raw.toString('utf8').split('\0');
  const files = [];
  for (let i = 0; i + 1 < tokens.length; i += 2) {
    const status = tokens[i];
    const file = tokens[i + 1];
    if (!status || !file) continue;
    files.push({ status: status[0], file });
  }
  return files;
}

function compareFile(entry, toSha, baseSha, cwd, opts) {
  const { status, file } = entry;
  const maxReadBytes = opts && Number.isFinite(opts.maxReadBytes) ? opts.maxReadBytes : DEFAULT_MAX_READ_BYTES;
  const targetEntry = getTreeEntry(toSha, file, cwd);
  const baseEntry = getTreeEntry(baseSha, file, cwd);

  // 分支已刪除此檔
  if (targetEntry === null) {
    if (baseEntry === null) {
      return { category: 'inMain', item: { file, status, stampOnly: false, reason: 'deleted-in-both' } };
    }
    return { category: 'notInMain', item: { file, status, reason: 'still-in-base' } };
  }

  // 分支有此檔，但 base 沒有
  if (baseEntry === null) {
    return { category: 'notInMain', item: { file, status, reason: 'missing-in-base' } };
  }

  const modeChanged = targetEntry.mode !== baseEntry.mode || targetEntry.type !== baseEntry.type;
  const modeMeta = modeChanged
    ? {
        modeChanged: true,
        targetMode: targetEntry.mode,
        baseMode: baseEntry.mode,
        targetType: targetEntry.type,
        baseType: baseEntry.type
      }
    : { modeChanged: false };

  // 先比 Git 樹物件的 blob ID（完全一致時無須讀取檔體）
  if (targetEntry.oid === baseEntry.oid) {
    if (!modeChanged) {
      return { category: 'inMain', item: { file, status, stampOnly: false, reason: 'identical' } };
    }
    return {
      category: 'different',
      item: {
        file,
        status,
        ...modeMeta,
        contentSame: true,
        binary: false,
        added: 0,
        deleted: 0,
        diffLines: 0,
        approx: false
      }
    };
  }

  // 非 blob 物件（例如 submodule commit 或 tree）
  if (targetEntry.type !== 'blob' || baseEntry.type !== 'blob') {
    return {
      category: 'different',
      item: {
        file,
        status,
        ...modeMeta,
        nonBlob: true,
        targetOid: targetEntry.oid,
        baseOid: baseEntry.oid
      }
    };
  }

  // 兩邊皆為 blob 且 oid 不同：先查大小，超過安全上限直接依大小與 oid 判不同，不超緩衝
  const targetBytes = getObjectSize(targetEntry.oid, cwd);
  const baseBytes = getObjectSize(baseEntry.oid, cwd);
  if (targetBytes > maxReadBytes || baseBytes > maxReadBytes) {
    return {
      category: 'different',
      item: {
        file,
        status,
        ...modeMeta,
        binary: true,
        largeBlob: true,
        targetBytes,
        baseBytes
      }
    };
  }

  const bufLimit = Math.max(64 * 1024 * 1024, maxReadBytes + 1024 * 1024);
  const targetBuf = readBlobByOid(targetEntry.oid, cwd, bufLimit);
  const baseBuf = readBlobByOid(baseEntry.oid, cwd, bufLimit);

  // 二進位檔（含無 NUL 但非合法 UTF-8 者）不做文字正規化
  if (isBinaryBuffer(targetBuf) || isBinaryBuffer(baseBuf)) {
    return {
      category: 'different',
      item: {
        file,
        status,
        ...modeMeta,
        binary: true,
        targetBytes: targetBuf.length,
        baseBytes: baseBuf.length
      }
    };
  }

  const targetNorm = normalizeText(file, targetBuf.toString('utf8'));
  const baseNorm = normalizeText(file, baseBuf.toString('utf8'));
  if (targetNorm === baseNorm) {
    if (!modeChanged) {
      return { category: 'inMain', item: { file, status, stampOnly: true, reason: 'stamp-only' } };
    }
    return {
      category: 'different',
      item: {
        file,
        status,
        ...modeMeta,
        stampOnly: true,
        contentSame: true,
        binary: false,
        added: 0,
        deleted: 0,
        diffLines: 0,
        approx: false
      }
    };
  }

  const diff = countDiffLines(baseNorm, targetNorm);
  return {
    category: 'different',
    item: {
      file,
      status,
      ...modeMeta,
      binary: false,
      added: diff.added,
      deleted: diff.deleted,
      diffLines: diff.diffLines,
      approx: diff.approx
    }
  };
}

function resolveWorkingDir(explicitCwd) {
  if (explicitCwd) return explicitCwd;
  const cur = process.cwd();
  try {
    runGit(['rev-parse', '--is-inside-work-tree'], cur);
    return cur;
  } catch (e) {
    return path.resolve(__dirname, '..');
  }
}

function compareTarget(opts) {
  const cwd = resolveWorkingDir(opts.cwd);
  const base = opts.base || 'origin/main';
  const target = opts.target;

  const baseSha = tryRevParse(base, cwd);
  if (!baseSha) throw new Error('找不到基準分支或 commit：' + base);

  const { fromSha, toSha, isExplicitRange } = resolveRange(target, baseSha, cwd);
  const changed = listChangedFiles(fromSha, toSha, cwd);
  const alreadyAncestor = !isExplicitRange && fromSha === toSha;

  const inMain = [];
  const different = [];
  const notInMain = [];

  for (const entry of changed) {
    const res = compareFile(entry, toSha, baseSha, cwd, opts);
    if (res.category === 'inMain') inMain.push(res.item);
    else if (res.category === 'different') different.push(res.item);
    else notInMain.push(res.item);
  }

  return {
    target,
    base,
    baseSha,
    fromSha,
    toSha,
    alreadyAncestor,
    summary: {
      total: changed.length,
      inMain: inMain.length,
      different: different.length,
      notInMain: notInMain.length
    },
    inMain,
    different,
    notInMain
  };
}

function formatDiffDetail(it) {
  const parts = [];
  if (it.modeChanged) {
    parts.push(`權限／類型不同：目標 ${it.targetMode}，基準 ${it.baseMode}`);
  }
  if (it.nonBlob) {
    parts.push(`物件不同：目標 ${it.targetOid.slice(0, 8)}，基準 ${it.baseOid.slice(0, 8)}`);
  } else if (it.largeBlob) {
    parts.push(`超大檔不同：目標 ${it.targetBytes} B，基準 ${it.baseBytes} B`);
  } else if (it.binary) {
    parts.push(`二進位不同：目標 ${it.targetBytes} B，基準 ${it.baseBytes} B`);
  } else if (it.contentSame) {
    parts.push(it.stampOnly ? '僅版本號／時間戳不同' : '內容相同');
  } else {
    const prefix = it.approx ? '約 ' : '';
    parts.push(`差 ${prefix}${it.diffLines} 行：+${it.added} / -${it.deleted}`);
  }
  return parts.join('；');
}

function formatReport(report) {
  const out = [];
  const s = report.summary;
  out.push(
    `比對目標：${report.target}（${report.fromSha.slice(0, 8)}..${report.toSha.slice(0, 8)}）對照 ${report.base}（${report.baseSha.slice(0, 8)}）`
  );
  out.push(`總計 ${s.total} 檔：已上線 ${s.inMain}、不同 ${s.different}、未上線 ${s.notInMain}`);

  if (s.total === 0) {
    if (report.alreadyAncestor) {
      const short = report.toSha.slice(0, 8);
      out.push(
        `（提示：${report.target} 已在 ${report.base} 的歷史中，merge-base 與分支頭皆為 ${short}，因此無法僅憑分支名得知當時改動的檔在 ${report.base} 是否又被修改。若要逐檔核對該提交現況，請改用明確起訖範圍，例如：node tools/in-main.cjs ${short}^..${short} --base ${report.base}）`
      );
    } else {
      out.push('（此範圍相對於基準沒有任何變動檔案）');
    }
    return out.join('\n');
  }

  if (report.inMain.length) {
    out.push(`\n[已上線（${report.inMain.length} 檔）]`);
    for (const it of report.inMain) {
      const note =
        it.reason === 'stamp-only'
          ? '（僅版本號／時間戳不同）'
          : it.reason === 'deleted-in-both'
            ? '（兩邊皆已刪除）'
            : '';
      out.push(`  ✓ ${it.file}${note}`);
    }
  }

  if (report.different.length) {
    out.push(`\n[不同（${report.different.length} 檔）]`);
    for (const it of report.different) {
      out.push(`  ≠ ${it.file}（${formatDiffDetail(it)}）`);
    }
  }

  if (report.notInMain.length) {
    out.push(`\n[未上線（${report.notInMain.length} 檔）]`);
    for (const it of report.notInMain) {
      const why = it.reason === 'still-in-base' ? '分支已刪，但 base 仍有此檔' : 'base 無此檔';
      out.push(`  ✗ ${it.file}（${why}）`);
    }
  }

  return out.join('\n');
}

function main(argv) {
  const parsed = parseArgs(argv);
  if (parsed.help) {
    console.log(USAGE);
    return 0;
  }
  if (parsed.error) {
    console.error('參數錯誤：' + parsed.error + '\n' + USAGE);
    return 2;
  }

  let report;
  try {
    report = compareTarget(parsed);
  } catch (e) {
    console.error('執行失敗：' + (e && e.message ? e.message : String(e)));
    return 2;
  }

  if (parsed.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatReport(report));
  }

  return report.summary.different === 0 && report.summary.notInMain === 0 ? 0 : 1;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = {
  DEFAULT_MAX_READ_BYTES,
  parseArgs,
  getTreeEntry,
  getObjectSize,
  normalizeText,
  countDiffLines,
  compareTarget,
  formatReport,
  main
};
