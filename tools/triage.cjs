#!/usr/bin/env node
/**
 * tools/triage.cjs — 第三方全面檢查報告與待修清單分流工具
 *
 * 用途：把外部檢查報告（如 09-全面檢查/*.md）或分流待修清單逐項解析，支援三種分法：
 *   1. --by snippet（預設）：核對程式片段是否仍存在於現行程式碼，分成「仍存在」、
 *      「片段未命中（待人工確認）」、「待查（來源未讀到）」與「待查（無片段）」。
 *   2. --by keyword：依關鍵字與類別分成「文字」「判定」「模型」「版面」「其他」。
 *   3. --blank：產出附前後 N 行（預設 5 行，支援 0）現行程式碼的空白核對表（Markdown）。
 *   亦可加 --all 一次輸出三種視角，或 --json 輸出結構化 JSON。
 *
 * 用法：
 *   node tools/triage.cjs <清單檔...> [--by snippet|keyword] [--blank] [--all]
 *                         [--context 5] [--root <dir>] [--out <file>] [--json]
 *
 * 結束碼：
 *   0 = 執行成功
 *   2 = 參數錯誤、無效選項或清單檔無法讀取
 */
'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_ROOT = path.resolve(__dirname, '..');

const STATUS = {
  PRESENT: '仍存在',
  MISS: '片段未命中（待人工確認）',
  UNREADABLE: '待查（來源未讀到）',
  NO_SNIPPET: '待查（無片段）'
};

const HELP_TEXT = [
  '用法：node tools/triage.cjs <清單檔...> [選項]',
  '選項：',
  '  --by snippet|keyword   依程式片段是否仍在（預設）或依關鍵字（文字／判定／模型／版面）分流',
  '  --blank                輸出附前後 N 行現行程式碼的空白核對表',
  '  --all                  同時輸出片段分流、關鍵字分類與附程式碼的空白核對表',
  '  --context N            空白核對表前後附帶的程式碼行數（預設 5，可設為 0）',
  '  --root DIR             比對程式碼的專案根目錄（預設為 tools 上層目錄）',
  '  --out FILE             將輸出寫入指定檔案（UTF-8）',
  '  --json                 輸出 JSON 結構供其他腳本串接'
].join('\n');

function parseArgs(argv) {
  const opts = {
    files: [],
    by: 'snippet',
    blank: false,
    all: false,
    json: false,
    context: 5,
    root: DEFAULT_ROOT,
    out: null
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') {
      return { help: true };
    } else if (a === '--blank') {
      opts.blank = true;
    } else if (a === '--all') {
      opts.all = true;
    } else if (a === '--json') {
      opts.json = true;
    } else if (a === '--by' || a.startsWith('--by=')) {
      const hasEq = a.includes('=');
      const v = hasEq ? a.slice(5) : argv[i + 1];
      if (!hasEq) {
        if (i + 1 >= argv.length || argv[i + 1].startsWith('-')) return { error: '--by 缺少參數值（應為 snippet 或 keyword）。' };
        i++;
      }
      if (v !== 'snippet' && v !== 'keyword') {
        return { error: `--by 僅支援 snippet 或 keyword（收到：${v}）。` };
      }
      opts.by = v;
    } else if (a === '--context' || a.startsWith('--context=')) {
      const hasEq = a.includes('=');
      const v = hasEq ? a.slice(10) : argv[i + 1];
      if (!hasEq) {
        if (i + 1 >= argv.length) return { error: '--context 缺少參數值（應為非負整數）。' };
        i++;
      }
      if (!/^\d+$/.test(String(v))) {
        return { error: `--context 必須是非負整數（收到：${v}）。` };
      }
      opts.context = Number(v);
    } else if (a === '--root' || a.startsWith('--root=')) {
      const hasEq = a.includes('=');
      const v = hasEq ? a.slice(7) : argv[i + 1];
      if (!hasEq) {
        if (i + 1 >= argv.length || !argv[i + 1] || argv[i + 1].startsWith('-')) return { error: '--root 缺少目錄路徑。' };
        i++;
      }
      if (!v) return { error: '--root 不可為空。' };
      opts.root = path.resolve(v);
    } else if (a === '--out' || a.startsWith('--out=')) {
      const hasEq = a.includes('=');
      const v = hasEq ? a.slice(6) : argv[i + 1];
      if (!hasEq) {
        if (i + 1 >= argv.length || !argv[i + 1] || argv[i + 1].startsWith('-')) return { error: '--out 缺少輸出檔路徑。' };
        i++;
      }
      if (!v) return { error: '--out 不可為空。' };
      opts.out = path.resolve(v);
    } else if (a.startsWith('-')) {
      return { error: '不認得的選項：' + a };
    } else {
      opts.files.push(a);
    }
  }

  if (!opts.files.length) {
    return { error: '請至少提供一個清單檔。' };
  }
  return opts;
}

function decodeSmartBuffer(buf) {
  if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) {
    return buf.slice(2).toString('utf16le');
  }
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    return buf.slice(3).toString('utf8');
  }
  return buf.toString('utf8');
}

function readTextSmart(filePath, readFileFn) {
  const reader = typeof readFileFn === 'function' ? readFileFn : fs.readFileSync;
  const raw = reader(filePath);
  if (Buffer.isBuffer(raw)) return decodeSmartBuffer(raw);
  return String(raw);
}

function normalizeWs(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

/**
 * 建立正規化空白字串與逐字元對應 1-based 原始行號索引，供跨行片段精確定位完整起始行號。
 */
function buildNormalizedIndex(content) {
  const chars = [];
  const charLines = [];
  let line = 1;
  let inSpace = true; // 忽略開頭空白，與 normalizeWs().trim() 一致

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (ch === '\n') {
      line++;
      if (!inSpace) {
        chars.push(' ');
        charLines.push(line - 1);
        inSpace = true;
      }
      continue;
    }
    if (ch === '\r') continue;
    if (/\s/.test(ch)) {
      if (!inSpace) {
        chars.push(' ');
        charLines.push(line);
        inSpace = true;
      }
    } else {
      chars.push(ch);
      charLines.push(line);
      inSpace = false;
    }
  }
  if (chars.length && chars[chars.length - 1] === ' ') {
    chars.pop();
    charLines.pop();
  }
  return { text: chars.join(''), charLines };
}

function normalizeRelPath(p) {
  return String(p || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function isPureFileRef(s) {
  return /^[A-Za-z0-9_.\\/-]+\.(?:js|cjs|html|css)(?::\d+(?:[–-]\d+)?)?$/.test(s);
}

function isFileRefList(s) {
  const tokens = String(s || '').trim().split(/[\s,，、;；]+/).filter(Boolean);
  return tokens.length > 0 && tokens.every(isPureFileRef);
}

/**
 * 從單一欄位萃取獨立的檔案與行號參照（同時支援 POSIX `/` 與 Windows `\` 分隔符）：
 * - 反引號區塊若為純檔案定位（單一或清單）則解析；若為程式碼片段（如 `const SOURCE = "vendor.js"` 或 `load("vendor.js")`）則整段忽略，避免把片段中的檔名字串誤當來源檔。
 * - 反引號外的裸文先剔除 URL 與單／雙引號字串常值，再解析獨立檔案定位。
 */
function extractFileRefs(text) {
  const refs = [];
  const raw = String(text || '');
  const refRe = /([A-Za-z0-9_.\\/-]+\.(?:js|cjs|html|css))(?::(\d+)(?:[–-](\d+))?)?/g;

  const pushMatches = chunk => {
    refRe.lastIndex = 0;
    let m;
    while ((m = refRe.exec(chunk)) !== null) {
      refs.push({
        file: normalizeRelPath(m[1]),
        line: m[2] ? parseInt(m[2], 10) : null,
        endLine: m[3] ? parseInt(m[3], 10) : null
      });
    }
  };

  const scanPlain = chunk => {
    const cleaned = chunk
      .replace(/https?:\/\/\S+/gi, ' ')
      .replace(/"[^"\r\n]*"/g, ' ')
      .replace(/'[^'\r\n]*'/g, ' ');
    pushMatches(cleaned);
  };

  const btRe = /`([^`]+)`/g;
  let last = 0;
  let bm;
  while ((bm = btRe.exec(raw)) !== null) {
    if (bm.index > last) scanPlain(raw.slice(last, bm.index));
    const inner = bm[1].trim();
    if (isFileRefList(inner)) {
      pushMatches(inner);
    }
    last = bm.index + bm[0].length;
  }
  if (last < raw.length) scanPlain(raw.slice(last));
  return refs;
}

function extractBacktickSnippets(text) {
  const out = [];
  const seen = new Set();
  const re = /`([^`]+)`/g;
  let m;
  const raw = String(text || '');
  while ((m = re.exec(raw)) !== null) {
    const s = m[1].trim();
    if (s.length >= 3 && !isFileRefList(s) && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

/**
 * 分離位置欄片段（locSnippets，作為主要判定證據）與描述欄片段（descSnippets，僅於無位置片段時作判定，否則作輔助定位）。
 */
function extractSnippets(locRaw, desc) {
  const locSnippets = extractBacktickSnippets(locRaw);
  // 備援：處理位置欄未加反引號、以全形逗號接在檔案行號後的片段（例如 物理-待修清單）
  if (locSnippets.length === 0 && locRaw) {
    const idx = locRaw.lastIndexOf('，');
    if (idx >= 0) {
      const tail = locRaw.slice(idx + 1).replace(/^[（(]+|[）)]+$/g, '').trim();
      if (tail.length >= 4 && !/^[A-Za-z0-9_.\\/-]+\.(?:js|cjs|html|css)/.test(tail)) {
        locSnippets.push(tail);
      }
    }
  }
  const locSet = new Set(locSnippets);
  const descSnippets = extractBacktickSnippets(desc).filter(s => !locSet.has(s));
  return { locSnippets, descSnippets };
}

function parseReportLine(rawLine, sourceFile, lineNo, idx) {
  const line = rawLine.trim();
  if (!line || !line.includes('｜')) return null;

  // 格式一：【高】station｜5｜問題描述｜位置與片段｜建議｜把握
  // 格式二：- **#12** 【低】station｜L｜問題描述｜位置與片段｜建議｜把握
  // 格式三：- **#3** station｜M｜問題描述｜位置與片段｜建議｜把握
  // 格式四：1. station｜1｜...
  const clean = line.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '');
  const parts = clean.split('｜').map(p => p.trim());
  if (parts.length < 3) return null;

  let head = parts[0];
  let idTag = '#' + idx;
  const idMatch = head.match(/\*\*#(\d+)\*\*/);
  if (idMatch) {
    idTag = '#' + idMatch[1];
    head = head.replace(/\*\*#\d+\*\*/, '').trim();
  }
  let severity = '';
  const sevMatch = head.match(/【([^】]+)】/);
  if (sevMatch) {
    severity = sevMatch[1];
    head = head.replace(/【[^】]+】/, '').trim();
  }
  const slug = head.replace(/[^\w-]/g, '');
  if (!slug) return null;

  const cat = parts[1] || '';
  const desc = parts[2] || '';
  const locRaw = parts[3] || '';
  const advice = parts[4] || '';
  const conf = parts[5] || '';

  // 明確分離位置欄檔案參照（主要來源）與描述欄檔案參照（輔助參考）
  const locRefs = extractFileRefs(locRaw);
  const descRefs = extractFileRefs(desc);
  const refs = locRefs.concat(descRefs);
  const { locSnippets, descSnippets } = extractSnippets(locRaw, desc);
  const snippets = locSnippets.concat(descSnippets);

  return {
    index: idx,
    id: idTag,
    source: path.basename(sourceFile),
    sourceLine: lineNo,
    severity: severity || '未標',
    slug,
    category: cat,
    desc,
    locRaw,
    advice,
    confidence: conf,
    locRefs,
    descRefs,
    refs,
    locSnippets,
    descSnippets,
    snippets
  };
}

function classifyKeyword(item) {
  const cat = item.category.trim();
  if (cat === 'L') return '版面';
  if (cat === 'M') return '判定';
  if (cat === 'P') return '文字';
  if (/^[12345]$/.test(cat)) return '模型';

  const hay = (item.desc + ' ' + item.advice + ' ' + item.locRaw).toLowerCase();
  if (/字級|字體|px|重疊|窄螢幕|橫放|直放|版面|對比/.test(hay)) return '版面';
  if (/任務|判定|題面|謎面|授星|誤觸|missions\//.test(hay)) return '判定';
  if (/說明|文字|措辭|出處|來源|型錄|參考資料|註明|標示|標題|英文|翻譯/.test(hay)) return '文字';
  if (/模型|公式|核心|積分|停播|截斷|捨入|外推|物理|化學|地科|反彈|爆破|衰減/.test(hay)) return '模型';
  return '其他';
}

const fileCache = new Map();

/**
 * 安全載入來源檔：攔截 stat 與 readFileSync 的所有 I/O 例外（例如 Windows FileShare.None 鎖檔 EBUSY、權限不足 EACCES），
 * 回傳 { ok: true, entry } 或 { ok: false, code, message }，絕不讓單一來源檔錯誤中斷整批分流。
 */
function loadSourceLinesSafe(root, relFile, ioOpts) {
  const full = path.join(root, relFile);
  const customReader = ioOpts && typeof ioOpts.readFile === 'function' ? ioOpts.readFile : null;
  let stat;
  try {
    stat = fs.statSync(full);
    if (!stat.isFile()) {
      fileCache.delete(full);
      return { ok: false, code: 'EISDIR', message: '目標不是一般檔案' };
    }
  } catch (e) {
    fileCache.delete(full);
    return {
      ok: false,
      code: (e && e.code) || 'ENOENT',
      message: (e && e.message) || String(e)
    };
  }

  const stamp = `${stat.mtimeMs}:${stat.size}`;
  if (!customReader) {
    const cached = fileCache.get(full);
    if (cached && cached.stamp === stamp) {
      return { ok: true, entry: cached };
    }
  }

  let content;
  try {
    content = readTextSmart(full, customReader);
  } catch (e) {
    fileCache.delete(full);
    return {
      ok: false,
      code: (e && e.code) || 'EIO',
      message: (e && e.message) || String(e)
    };
  }

  const lines = content.split(/\r?\n/);
  const normIndex = buildNormalizedIndex(content);
  const entry = { full, relFile, content, lines, normIndex, stamp };
  if (!customReader) fileCache.set(full, entry);
  return { ok: true, entry };
}

function loadSourceLines(root, relFile, ioOpts) {
  const res = loadSourceLinesSafe(root, relFile, ioOpts);
  return res.ok ? res.entry : null;
}

/** 找出片段在單一來源檔中的所有命中起點 1-based 行號（含單行與跨行完整命中）。 */
function findMatchLines(src, cleanSnip, normSnip) {
  const hits = new Set();
  for (let i = 0; i < src.lines.length; i++) {
    if (src.lines[i].includes(cleanSnip) || normalizeWs(src.lines[i]).includes(normSnip)) {
      hits.add(i + 1);
    }
  }
  const idx = src.normIndex;
  let from = 0;
  while (from <= idx.text.length - normSnip.length) {
    const pos = idx.text.indexOf(normSnip, from);
    if (pos < 0) break;
    hits.add(idx.charLines[pos]);
    from = pos + 1;
  }
  return Array.from(hits).sort((a, b) => a - b);
}

function pickBestLine(hitLines, targetLine) {
  if (!hitLines.length) return -1;
  if (!Number.isFinite(targetLine) || targetLine <= 0) return hitLines[0];
  let best = hitLines[0];
  let bestDist = Math.abs(best - targetLine);
  for (let i = 1; i < hitLines.length; i++) {
    const d = Math.abs(hitLines[i] - targetLine);
    if (d < bestDist) {
      best = hitLines[i];
      bestDist = d;
    }
  }
  return best;
}

function searchSnippetsInFiles(snippets, loadedEntries, refLineByFile) {
  for (const snip of snippets) {
    // 去掉末尾省略號（… 或 ...）以便比對截斷的程式碼片段
    const cleanSnip = snip.replace(/[…]+$/, '').replace(/\.\.\.$/, '').trim();
    const normSnip = normalizeWs(cleanSnip);
    if (normSnip.length < 3) continue;

    for (const { rel, src } of loadedEntries) {
      const hitLines = findMatchLines(src, cleanSnip, normSnip);
      if (hitLines.length) {
        const targetLine = refLineByFile.get(rel) || null;
        return {
          file: rel,
          line: pickBestLine(hitLines, targetLine),
          snippet: snip
        };
      }
    }
  }
  return null;
}

function probeItem(item, root, ctxRadius, ioOpts) {
  // 分離主要來源參照（位置欄）與輔助來源參照（描述欄）；相容未提供 locRefs 的舊物件
  const hasExplicitLocRefs = Array.isArray(item.locRefs);
  const locRefs = hasExplicitLocRefs ? item.locRefs : (item.refs || []);
  const descRefs = Array.isArray(item.descRefs) ? item.descRefs : [];

  const primaryRefs = locRefs.length > 0 ? locRefs : descRefs;
  const primaryRef = primaryRefs[0] || null;

  const primaryCandidateFiles = [];
  const refLineByFile = new Map();
  for (const r of primaryRefs) {
    if (!primaryCandidateFiles.includes(r.file)) primaryCandidateFiles.push(r.file);
    if (r.line && !refLineByFile.has(r.file)) refLineByFile.set(r.file, r.line);
  }
  // 只有在位置欄確實指定檔案時，描述欄額外提到的其他檔案才獨立為輔助來源（不替代主要來源判定）
  const descCandidateFiles = [];
  if (locRefs.length > 0) {
    for (const r of descRefs) {
      if (!primaryCandidateFiles.includes(r.file) && !descCandidateFiles.includes(r.file)) {
        descCandidateFiles.push(r.file);
      }
      if (r.line && !refLineByFile.has(r.file)) refLineByFile.set(r.file, r.line);
    }
  }

  if (primaryCandidateFiles.length === 0) {
    const guesses = [
      'js/' + item.slug + '.js',
      'js/' + item.slug + '-core.js',
      'js/missions/' + item.slug + '.js',
      item.slug + '.html'
    ];
    for (const g of guesses) {
      if (fs.existsSync(path.join(root, g))) primaryCandidateFiles.push(g);
    }
  }

  const primaryLoaded = [];
  const primaryByFile = new Map();
  const missingFiles = [];
  const readErrors = [];
  for (const rel of primaryCandidateFiles) {
    const res = loadSourceLinesSafe(root, rel, ioOpts);
    if (res.ok) {
      primaryLoaded.push({ rel, src: res.entry });
      primaryByFile.set(rel, res.entry);
    } else {
      missingFiles.push(rel);
      if (res.code && res.code !== 'ENOENT') {
        readErrors.push({ file: rel, code: res.code, message: res.message });
      }
    }
  }

  const descLoaded = [];
  for (const rel of descCandidateFiles) {
    const res = loadSourceLinesSafe(root, rel, ioOpts);
    if (res.ok) {
      descLoaded.push({ rel, src: res.entry });
    }
  }

  const locSnippets = Array.isArray(item.locSnippets) ? item.locSnippets : [];
  const descSnippets = Array.isArray(item.descSnippets) ? item.descSnippets : [];
  const primarySnippets = locSnippets.length > 0 ? locSnippets : (descSnippets.length > 0 ? descSnippets : (item.snippets || []));
  const usingLocPrimary = locSnippets.length > 0;

  let status = STATUS.NO_SNIPPET;
  let matchedFile = primaryRef ? primaryRef.file : (primaryCandidateFiles[0] || '');
  let matchedLine = primaryRef && primaryRef.line ? primaryRef.line : null;
  let matchedSnippet = primarySnippets[0] || '';
  let auxMatch = null;

  if (primaryLoaded.length === 0) {
    // 位置欄主要來源全部無法讀取（缺檔或被鎖檔）：主判定維持「待查（來源未讀到）」
    status = STATUS.UNREADABLE;
    if (descLoaded.length > 0) {
      const auxSnips = primarySnippets.length > 0 ? primarySnippets.concat(descSnippets) : descSnippets;
      if (auxSnips.length > 0) {
        auxMatch = searchSnippetsInFiles(auxSnips, descLoaded, refLineByFile);
      }
    }
  } else if (primarySnippets.length > 0) {
    const hit = searchSnippetsInFiles(primarySnippets, primaryLoaded, refLineByFile);
    if (hit) {
      status = STATUS.PRESENT;
      matchedFile = hit.file;
      matchedLine = hit.line;
      matchedSnippet = hit.snippet;
    } else {
      status = STATUS.MISS;
      // 主要片段在主要來源未命中時，僅供輔助定位，絕不蓋過主要判定
      if (usingLocPrimary && descSnippets.length > 0) {
        auxMatch = searchSnippetsInFiles(descSnippets, primaryLoaded, refLineByFile);
      }
      if (!auxMatch && descLoaded.length > 0) {
        const auxSnips = primarySnippets.concat(descSnippets);
        auxMatch = searchSnippetsInFiles(auxSnips, descLoaded, refLineByFile);
      }
    }
  }

  let contextBlock = [];
  const ctxSrc = matchedFile ? primaryByFile.get(matchedFile) : null;
  if (ctxSrc) {
    const ctxCenter = matchedLine || (auxMatch && auxMatch.file === matchedFile ? auxMatch.line : 1);
    const start = Math.max(1, ctxCenter - ctxRadius);
    const end = Math.min(ctxSrc.lines.length, ctxCenter + ctxRadius);
    for (let ln = start; ln <= end; ln++) {
      const mark = ln === ctxCenter ? '>' : ' ';
      contextBlock.push(mark + String(ln).padStart(4, ' ') + ' | ' + ctxSrc.lines[ln - 1]);
    }
  }

  return {
    ...item,
    keywordGroup: classifyKeyword(item),
    status,
    matchedFile,
    matchedLine,
    matchedSnippet,
    auxMatch,
    missingFiles,
    readErrors,
    contextBlock
  };
}

function renderSummaryBySnippet(results) {
  const groups = {
    [STATUS.PRESENT]: [],
    [STATUS.MISS]: [],
    [STATUS.UNREADABLE]: [],
    [STATUS.NO_SNIPPET]: []
  };
  for (const r of results) {
    (groups[r.status] || groups[STATUS.NO_SNIPPET]).push(r);
  }
  const out = [];
  out.push('# 第三方清單分流摘要（依程式片段核對）');
  out.push('');
  out.push('| 分類 | 件數 |');
  out.push('|---|---:|');
  for (const k of Object.keys(groups)) out.push('| ' + k + ' | ' + groups[k].length + ' |');
  out.push('| 合計 | ' + results.length + ' |');
  out.push('');

  for (const k of Object.keys(groups)) {
    if (!groups[k].length) continue;
    out.push('## ' + k + '（' + groups[k].length + ' 件）');
    out.push('| 編號 | 等級 | 站名 | 類別 | 關鍵字組 | 檔案與行號 | 問題摘要 |');
    out.push('|---|---|---|---|---|---|---|');
    for (const r of groups[k]) {
      const loc = r.matchedFile ? (r.matchedFile + (r.matchedLine ? ':' + r.matchedLine : '')) : '—';
      const desc = r.desc.replace(/\|/g, '｜').slice(0, 72);
      out.push('| ' + r.id + ' | ' + r.severity + ' | ' + r.slug + ' | ' + r.category + ' | ' + r.keywordGroup + ' | `' + loc + '` | ' + desc + ' |');
    }
    out.push('');
  }
  return out.join('\n');
}

function renderSummaryByKeyword(results) {
  const order = ['文字', '判定', '模型', '版面', '其他'];
  const groups = Object.fromEntries(order.map(k => [k, []]));
  for (const r of results) groups[r.keywordGroup].push(r);

  const out = [];
  out.push('# 第三方清單分流摘要（依關鍵字分類）');
  out.push('');
  out.push('| 類別 | 件數 | 仍存在 | 片段未命中 | 待查 |');
  out.push('|---|---:|---:|---:|---:|');
  for (const k of order) {
    const arr = groups[k];
    const s1 = arr.filter(x => x.status === STATUS.PRESENT).length;
    const s2 = arr.filter(x => x.status === STATUS.MISS).length;
    const s3 = arr.length - s1 - s2;
    out.push('| ' + k + ' | ' + arr.length + ' | ' + s1 + ' | ' + s2 + ' | ' + s3 + ' |');
  }
  out.push('');

  for (const k of order) {
    if (!groups[k].length) continue;
    out.push('## ' + k + '（' + groups[k].length + ' 件）');
    out.push('| 編號 | 等級 | 站名 | 原類 | 片段狀態 | 檔案與行號 | 問題摘要 |');
    out.push('|---|---|---|---|---|---|---|');
    for (const r of groups[k]) {
      const loc = r.matchedFile ? (r.matchedFile + (r.matchedLine ? ':' + r.matchedLine : '')) : '—';
      const desc = r.desc.replace(/\|/g, '｜').slice(0, 72);
      out.push('| ' + r.id + ' | ' + r.severity + ' | ' + r.slug + ' | ' + r.category + ' | ' + r.status + ' | `' + loc + '` | ' + desc + ' |');
    }
    out.push('');
  }
  return out.join('\n');
}

function renderBlankSheet(results, ctxRadius) {
  const out = [];
  out.push('# 空白核對表（附前後 ' + ctxRadius + ' 行現行程式碼）');
  out.push('');
  for (const r of results) {
    const loc = r.matchedFile ? (r.matchedFile + (r.matchedLine ? ':' + r.matchedLine : '')) : '無定位';
    out.push('### ' + r.id + ' [' + r.severity + '] ' + r.slug + '（' + r.category + '／' + r.keywordGroup + '）— ' + r.status);
    out.push('- 問題：' + r.desc);
    if (r.advice) out.push('- 原建議：' + r.advice);
    out.push('- 定位：`' + loc + '`' + (r.matchedSnippet ? ' · 片段：`' + r.matchedSnippet + '`' : ''));
    if (r.auxMatch) {
      out.push('- 輔助定位（描述片段／檔案）：`' + r.auxMatch.file + ':' + r.auxMatch.line + '` · `' + r.auxMatch.snippet + '`');
    }
    if (r.status === STATUS.UNREADABLE && r.missingFiles && r.missingFiles.length) {
      const errMap = new Map((r.readErrors || []).map(e => [e.file, e.code]));
      const detail = r.missingFiles.map(f => errMap.has(f) ? `\`${f}\`（讀取失敗：${errMap.get(f)}）` : `\`${f}\``).join('、');
      out.push('- 未讀到來源：' + detail);
    }
    out.push('- 核對結論：[ ] 需修　[ ] 已修　[ ] 不修（理由：＿＿＿＿）');
    if (r.contextBlock.length) {
      out.push('```js');
      for (const cl of r.contextBlock) out.push(cl);
      out.push('```');
    }
    out.push('');
  }
  return out.join('\n');
}

function main(argv) {
  const opts = parseArgs(argv || process.argv.slice(2));
  if (opts.help) {
    console.log(HELP_TEXT);
    return 0;
  }
  if (opts.error) {
    console.error('參數錯誤：' + opts.error + '\n' + HELP_TEXT);
    return 2;
  }

  const items = [];
  let seq = 0;
  for (const fp of opts.files) {
    if (!fs.existsSync(fp)) {
      console.error('找不到清單檔：' + fp);
      return 2;
    }
    let text;
    try {
      text = readTextSmart(fp);
    } catch (e) {
      console.error(`無法讀取清單檔 ${fp}：${e && e.message ? e.message : String(e)}`);
      return 2;
    }
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const parsed = parseReportLine(lines[i], fp, i + 1, seq + 1);
      if (parsed) {
        seq++;
        items.push(parsed);
      }
    }
  }
  const results = items.map(it => probeItem(it, opts.root, opts.context));

  let output = '';
  if (opts.json) {
    output = JSON.stringify({ root: opts.root, count: results.length, items: results }, null, 2);
  } else if (opts.all) {
    output = [
      renderSummaryBySnippet(results),
      renderSummaryByKeyword(results),
      renderBlankSheet(results, opts.context)
    ].join('\n---\n\n');
  } else if (opts.blank) {
    output = renderBlankSheet(results, opts.context);
  } else if (opts.by === 'keyword') {
    output = renderSummaryByKeyword(results);
  } else {
    output = renderSummaryBySnippet(results);
  }

  if (opts.out) {
    fs.writeFileSync(opts.out, output, 'utf8');
    console.log('已寫入 ' + opts.out + '（共 ' + results.length + ' 項）');
  } else {
    process.stdout.write(output + '\n');
  }
  return 0;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = {
  STATUS,
  parseArgs,
  extractFileRefs,
  extractSnippets,
  buildNormalizedIndex,
  loadSourceLinesSafe,
  parseReportLine,
  classifyKeyword,
  probeItem,
  renderSummaryBySnippet,
  renderSummaryByKeyword,
  renderBlankSheet,
  readTextSmart,
  main
};
