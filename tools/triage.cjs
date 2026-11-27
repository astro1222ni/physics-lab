#!/usr/bin/env node
/**
 * tools/triage.cjs — 第三方全面檢查報告與待修清單分流工具
 *
 * 用途：把外部檢查報告（如 09-全面檢查/*.md）或分流待修清單逐項解析，支援三種分法：
 *   1. --by snippet（預設）：核對程式片段是否仍存在於現行程式碼，分成「仍存在」與「片段已不存在（多半已修）」。
 *   2. --by keyword：依關鍵字與類別分成「文字」「判定」「模型」「版面」「其他」。
 *   3. --blank：產出附前後 N 行（預設 5 行）現行程式碼的空白核對表（Markdown）。
 *   亦可加 --all 一次輸出三種視角，或 --json 輸出結構化 JSON。
 *
 * 用法：
 *   node tools/triage.cjs <清單檔...> [--by snippet|keyword] [--blank] [--all]
 *                         [--context 5] [--root <dir>] [--out <file>] [--json]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_ROOT = path.resolve(__dirname, '..');

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
    if (a === '--by' && argv[i + 1]) { opts.by = argv[++i]; }
    else if (a === '--blank') { opts.blank = true; }
    else if (a === '--all') { opts.all = true; }
    else if (a === '--json') { opts.json = true; }
    else if (a === '--context' && argv[i + 1]) { opts.context = Math.max(0, parseInt(argv[++i], 10) || 5); }
    else if (a === '--root' && argv[i + 1]) { opts.root = path.resolve(argv[++i]); }
    else if (a === '--out' && argv[i + 1]) { opts.out = path.resolve(argv[++i]); }
    else if (a === '-h' || a === '--help') { printHelp(); process.exit(0); }
    else if (!a.startsWith('-')) { opts.files.push(a); }
  }
  return opts;
}

function printHelp() {
  console.log([
    '用法：node tools/triage.cjs <清單檔...> [選項]',
    '選項：',
    '  --by snippet|keyword   依程式片段是否仍在（預設）或依關鍵字（文字／判定／模型／版面）分流',
    '  --blank                輸出附前後 5 行現行程式碼的空白核對表',
    '  --all                  同時輸出片段分流、關鍵字分類與附程式碼的空白核對表',
    '  --context N            空白核對表前後附帶的程式碼行數（預設 5）',
    '  --root DIR             比對程式碼的專案根目錄（預設為 tools 上層目錄）',
    '  --out FILE             將輸出寫入指定檔案（UTF-8）',
    '  --json                 輸出 JSON 結構供其他腳本串接'
  ].join('\n'));
}

function readTextSmart(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) {
    return buf.slice(2).toString('utf16le');
  }
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    return buf.slice(3).toString('utf8');
  }
  return buf.toString('utf8');
}

function normalizeWs(s) {
  return s.replace(/\s+/g, ' ').trim();
}

function extractFileRefs(text) {
  const refs = [];
  const re = /([A-Za-z0-9_./-]+\.(?:js|cjs|html|css))(?::(\d+)(?:[–-](\d+))?)?/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    refs.push({
      file: m[1].replace(/\\/g, '/'),
      line: m[2] ? parseInt(m[2], 10) : null,
      endLine: m[3] ? parseInt(m[3], 10) : null
    });
  }
  return refs;
}

function extractSnippets(locRaw, desc) {
  const out = [];
  const re = /`([^`]+)`/g;
  let m;
  const both = (locRaw || '') + ' ' + (desc || '');
  while ((m = re.exec(both)) !== null) {
    const s = m[1].trim();
    if (s.length >= 3 && !/^[A-Za-z0-9_./-]+\.(js|cjs|html|css)$/.test(s)) {
      out.push(s);
    }
  }
  // 備援：處理未加反引號、以全形逗號接在檔案行號後的片段（例如 物理-待修清單）
  if (out.length === 0 && locRaw) {
    const idx = locRaw.lastIndexOf('，');
    if (idx >= 0) {
      const tail = locRaw.slice(idx + 1).replace(/^[（(]+|[）)]+$/g, '').trim();
      if (tail.length >= 4 && !/^[A-Za-z0-9_./-]+\.(js|cjs|html|css)/.test(tail)) {
        out.push(tail);
      }
    }
  }
  return out;
}

function parseReportLine(rawLine, sourceFile, lineNo, idx) {
  const line = rawLine.trim();
  if (!line || !line.includes('｜')) return null;

  // 格式一：【高】station｜5｜問題描述｜位置與片段｜建議｜把握
  // 格式二：- **#12** 【低】station｜L｜問題描述｜位置與片段｜建議｜把握
  // 格式三：- **#3** station｜M｜問題描述｜位置與片段｜建議｜把握
  // 格式四：1. station｜1｜... 或 1. station｜1：...
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

  const refs = extractFileRefs(locRaw + ' ' + desc);
  const snippets = extractSnippets(locRaw, desc);

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
    refs,
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
function loadSourceLines(root, relFile) {
  const full = path.join(root, relFile);
  if (fileCache.has(full)) return fileCache.get(full);
  if (!fs.existsSync(full)) {
    fileCache.set(full, null);
    return null;
  }
  const content = readTextSmart(full);
  const lines = content.split(/\r?\n/);
  const entry = { full, relFile, content, lines };
  fileCache.set(full, entry);
  return entry;
}

function probeItem(item, root, ctxRadius) {
  const primaryRef = item.refs[0] || null;
  const candidateFiles = [];
  for (const r of item.refs) {
    if (!candidateFiles.includes(r.file)) candidateFiles.push(r.file);
  }
  if (candidateFiles.length === 0) {
    const guesses = [
      'js/' + item.slug + '.js',
      'js/' + item.slug + '-core.js',
      'js/missions/' + item.slug + '.js',
      item.slug + '.html'
    ];
    for (const g of guesses) {
      if (fs.existsSync(path.join(root, g))) candidateFiles.push(g);
    }
  }

  let status = '待查（無片段）';
  let matchedFile = primaryRef ? primaryRef.file : (candidateFiles[0] || '');
  let matchedLine = primaryRef && primaryRef.line ? primaryRef.line : null;
  let matchedSnippet = item.snippets[0] || '';

  if (item.snippets.length > 0) {
    let found = false;
    for (const snip of item.snippets) {
      // 去掉末尾省略號（… 或 ...）以便比對截斷的程式碼片段
      const cleanSnip = snip.replace(/[…]+$/, '').replace(/\.\.\.$/, '').trim();
      const normSnip = normalizeWs(cleanSnip);
      if (normSnip.length < 3) continue;

      for (const rel of candidateFiles) {
        const src = loadSourceLines(root, rel);
        if (!src) continue;
        // 1. 精確行內包含
        let hitLine = -1;
        for (let i = 0; i < src.lines.length; i++) {
          if (src.lines[i].includes(cleanSnip) || normalizeWs(src.lines[i]).includes(normSnip)) {
            hitLine = i + 1;
            break;
          }
        }
        // 2. 跨行正規化包含
        if (hitLine < 0 && normalizeWs(src.content).includes(normSnip)) {
          const firstToken = normSnip.split(' ')[0];
          for (let i = 0; i < src.lines.length; i++) {
            if (src.lines[i].includes(firstToken)) { hitLine = i + 1; break; }
          }
          if (hitLine < 0) hitLine = 1;
        }
        if (hitLine > 0) {
          found = true;
          matchedFile = rel;
          matchedLine = hitLine;
          matchedSnippet = snip;
          break;
        }
      }
      if (found) break;
    }
    status = found ? '仍存在' : '片段已不存在（多半已修）';
  }

  let contextBlock = [];
  if (matchedFile) {
    const src = loadSourceLines(root, matchedFile);
    if (src) {
      const center = matchedLine || 1;
      const start = Math.max(1, center - ctxRadius);
      const end = Math.min(src.lines.length, center + ctxRadius);
      for (let ln = start; ln <= end; ln++) {
        const mark = ln === matchedLine ? '>' : ' ';
        contextBlock.push(mark + String(ln).padStart(4, ' ') + ' | ' + src.lines[ln - 1]);
      }
    }
  }

  return {
    ...item,
    keywordGroup: classifyKeyword(item),
    status,
    matchedFile,
    matchedLine,
    matchedSnippet,
    contextBlock
  };
}

function renderSummaryBySnippet(results) {
  const groups = {
    '仍存在': [],
    '片段已不存在（多半已修）': [],
    '待查（無片段）': []
  };
  for (const r of results) {
    (groups[r.status] || groups['待查（無片段）']).push(r);
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
  out.push('| 類別 | 件數 | 仍存在 | 片段已不存在 | 待查 |');
  out.push('|---|---:|---:|---:|---:|');
  for (const k of order) {
    const arr = groups[k];
    const s1 = arr.filter(x => x.status === '仍存在').length;
    const s2 = arr.filter(x => x.status === '片段已不存在（多半已修）').length;
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

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.files.length) {
    printHelp();
    process.exit(1);
  }
  const items = [];
  let seq = 0;
  for (const fp of opts.files) {
    const text = readTextSmart(fp);
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
}

if (require.main === module) main();
module.exports = { parseReportLine, classifyKeyword, probeItem, readTextSmart };
