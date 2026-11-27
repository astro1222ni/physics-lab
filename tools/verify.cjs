#!/usr/bin/env node
/*
 * verify.cjs — 一鍵總檢查（發布前、每日自動優化都用這一支）。
 *
 * 用法：
 *   node tools/verify.cjs            全部：單元測試 → 任務證明 → 靜態稽核 → 介面稽核 → 頁面檢查 → 試玩（約 6–10 分鐘，加上改過的實驗每個約 2 分鐘）
 *   node tools/verify.cjs --quick    只跑單元測試、任務證明、靜態稽核（約 1 分鐘）
 *   node tools/verify.cjs --audit    只跑靜態稽核與介面稽核（約 1 分鐘）
 *   node tools/verify.cjs --fresh    任務證明不用快取、全部重算
 *   省 CPU：任務證明有快取（沒改過就不重算）；瀏覽器用 Intel 內顯（tools/browser.cjs）；整支低於標準優先權。
 *   node tools/verify.cjs kepler     介面稽核、頁面檢查與試玩只看指定頁面
 *   node tools/verify.cjs --accept kepler,atwood   一鍵驗收（11/27 小幫手清單 A3；npm run accept -- 代號）：只跑這幾站要用的
 *                                    單元測試（全部）、任務證明（只跑這幾站的）、靜態稽核（只看這幾站）、導覽與目錄檢查、
 *                                    任務不變檢查 mission-guard（本分支改過的任務檔）、頁面檢查、試玩（改過的重玩；還沒有紀錄的直接玩）、
 *                                    版面自查 layout-audit --font。
 *                                    不跑介面稽核（只有提醒，要看用 --audit）。輸出精簡：只印不合格項目，最後一行是結論。
 *   node tools/verify.cjs --brief    任何模式都可加：不印通過的步驟，只印不合格項目與結論
 *   試玩（tools/playtest.cjs）：只重玩「有改過」的實驗（頁面、它自己的程式、任務檔或排除清單變了），沒改過的沿用上次結果，
 *   和任務證明的快取一樣（紀錄在 .shots/playtest-cache.json）。第一次沒有紀錄時只記下目前版本、不試玩；
 *   要建立或更新全站紀錄：npm run playtest（全部約 1.5–2 小時）。
 *
 * 會失敗（結束碼 1）：單元測試、任務證明、頁面檢查有任何一項沒過，靜態稽核的「錯誤」級問題，或試玩「確定是問題」的項目（含沿用上次結果的）。
 * 只提醒（不擋發布，列進待改清單）：觸控目標小於 44 px、文字對比不足、缺說明文字、頁面太重、試玩「待人工確認」的項目等。
 * 結果另存 .shots/verify-report.json，每日自動優化從這裡挑下一件要改的事。
 * 介面稽核會擋掉所有對外連線（本機連得到正式 Firebase，不可寫入）。
 */
'use strict';
const { spawnSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('./browser.cjs').lowerPriority(); // 整支（含單元測試、任務證明、Chromium）都用「低於標準」優先權，CPU 先讓給影片

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
// --help 與打錯的旗標不可直接開跑全站總檢查（11/27 Antigravity 複查【中】2）
if (args.includes('-h') || args.includes('--help')) { console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]); process.exit(0); }
{ const known = ['--quick', '--fresh', '--audit', '--accept', '--brief']; const bad = args.filter(a => a.startsWith('-') && !known.includes(a) && !a.startsWith('--accept='));
  if (bad.length) { console.error('✗ 不認得的參數：' + bad.join(' ') + '（node tools/verify.cjs --help 看用法）'); process.exit(2); } }
const QUICK = args.includes('--quick');
const FRESH = args.includes('--fresh'); // 任務證明全部重算，不用快取
const AUDIT = args.includes('--audit'); // 只跑靜態稽核與介面稽核（改介面時快速看提醒）
const ACCEPT = args.some(a => a === '--accept' || a.startsWith('--accept='));
const BRIEF = ACCEPT || args.includes('--brief');
const T0 = Date.now();
// 代號可用空格或逗號分開；--accept=a,b 也可以
const only = args.filter(a => !a.startsWith('--')).concat(args.filter(a => a.startsWith('--accept=')).map(a => a.slice(9)))
  .flatMap(a => a.split(',')).map(a => a.trim().replace(/\.html$/, '')).filter(Boolean);
if (ACCEPT && !only.length) { console.error('用法：node tools/verify.cjs --accept 代號[,代號…]（npm run accept -- 代號）'); process.exit(2); }
{ const miss = only.filter(s => !fs.existsSync(path.join(ROOT, s + '.html'))); if (miss.length) { console.error('✗ 找不到頁面：' + miss.join('、') + '（不加 .html）'); process.exit(2); } }
const report = { at: new Date().toISOString(), steps: {}, errors: [], warnings: [] };
const err = (area, msg) => report.errors.push({ area, msg });
const warn = (area, page, msg) => report.warnings.push({ area, page, msg });

const w = {};
new Function('window', fs.readFileSync(path.join(ROOT, 'js/missions/index.js'), 'utf8'))(w);
const LIVE = w.LAB_LIVE_MODULES || [];
const ENTRY = ['index', 'labs', ...(w.LAB_SUBJECTS || []).map(s => s.page)];
const PAGES = only.length ? only : ENTRY.concat(['leaderboard', 'about'], LIVE);

function run(label, cmd, cmdArgs) {
  const t = Date.now();
  const r = spawnSync(cmd, cmdArgs, { cwd: ROOT, windowsHide: true, encoding: 'utf8', maxBuffer: 64 << 20 });
  const ok = r.status === 0;
  report.steps[label] = { ok, sec: Math.round((Date.now() - t) / 1000) };
  const all = ((r.stdout || '') + (r.stderr || '')).trim();
  let detail = ok ? '' : all.split('\n').filter(l => /✗|Error|錯|失敗|FAIL|assert/i.test(l)).slice(0, 30).join('\n');
  if (!ok && !detail.trim()) detail = all.split('\n').slice(-10).join('\n'); // 濾完是空的就附最後 10 行，不可只說「沒有通過」（複查【中】4）
  if (!BRIEF) console.log((ok ? '✓ ' : '✗ ') + label + '（' + report.steps[label].sec + ' 秒）');
  if (!ok) { if (!BRIEF) console.log(detail); err(label, '沒有通過' + (BRIEF && detail.trim() ? '\n      ' + detail.trim().split('\n').join('\n      ') : '')); }
  return { ok, out: (r.stdout || '') + (r.stderr || '') };
}

// 1. 單元測試
if (!AUDIT) run('單元測試', process.execPath, [path.join(ROOT, 'tools/run-tests.cjs')]);

// 2. 任務證明（每支都要結束碼 0）
if (!AUDIT) {
  const dir = path.join(ROOT, 'tools/mission-proofs');
  // 站名本身可能以「-數字」結尾（exam-115）：先比完整檔名，再比去掉「-數字」的（複查【低】5）
  const proofFor = f => { const b = f.replace(/\.c?js$/, ''); return only.includes(b) || only.includes(b.replace(/-\d+$/, '')); };
  const files = fs.readdirSync(dir).filter(f => /\.c?js$/.test(f) && (!ACCEPT || proofFor(f))).sort();
  const bad = [];
  const t = Date.now();
  // 快取：證明腳本、它用到的 js 檔、該實驗的頁面程式都沒變，上次又通過，就不重算（省 CPU；--fresh 全部重算）
  const cacheFile = path.join(ROOT, '.shots/proof-cache.json');
  let cache = {};
  try { if (!FRESH) cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch (e) { cache = {}; }
  const hashOf = f => {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    const slug = f.replace(/\.c?js$/, '').replace(/-\d+$/, '');
    const deps = new Set(['js/' + slug + '.js']);
    for (const m of src.matchAll(/['"`](js\/[\w\/.-]+\.js)['"`]/g)) deps.add(m[1]);
    const h = crypto.createHash('sha1').update(src);
    for (const d of [...deps].sort()) { const fp = path.join(ROOT, d); h.update(d + (fs.existsSync(fp) ? fs.readFileSync(fp) : '')); }
    return h.digest('hex');
  };
  let skipped = 0;
  for (const f of files) {
    const hv = hashOf(f);
    if (cache[f] === hv) { skipped++; continue; }
    const r = spawnSync(process.execPath, [path.join(dir, f)], { cwd: ROOT, windowsHide: true, encoding: 'utf8', maxBuffer: 64 << 20, timeout: 600000 });
    if (r.status !== 0) {
      delete cache[f];
      const tail = (((r.stdout || '') + (r.stderr || '')).trim().split('\n').slice(-3).join(' / ')).slice(0, 300);
      bad.push(f + '：' + (r.error && r.error.code === 'ETIMEDOUT' ? '超過 10 分鐘沒跑完（電腦太忙或腳本卡住）' : tail || ('結束碼 ' + r.status + (r.signal ? '，被中止（' + r.signal + '）' : '') + '，沒有輸出')));
    } else cache[f] = hv;
  }
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 1));
  report.steps['任務證明'] = { ok: !bad.length, sec: Math.round((Date.now() - t) / 1000), n: files.length, cached: skipped };
  if (!BRIEF) console.log((bad.length ? '✗ ' : '✓ ') + `任務證明 ${files.length - bad.length}/${files.length}（${report.steps['任務證明'].sec} 秒` + (skipped ? `，${skipped} 支沒改過、沿用上次結果` : '') + '）');
  bad.forEach(b => { if (!BRIEF) console.log('    ' + b); err('任務證明', b); });
}

// 3. 靜態稽核（不開瀏覽器）
{
  const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const exists = f => fs.existsSync(path.join(ROOT, f));
  const index = read('index.html');
  const subjectHTML = (w.LAB_SUBJECTS || []).map(s => read(s.page + '.html')).join('\n');
  const thumbs = exists('js/thumbs.js') ? read('js/thumbs.js') : '';
  const SUPS = /[⁰⁴-₟⃗]/;
  for (const s of (ACCEPT ? only.filter(x => LIVE.includes(x) || exists('js/missions/' + x + '.js')) : LIVE)) {
    for (const f of [s + '.html', 'js/' + s + '.js', 'js/missions/' + s + '.js']) if (!exists(f)) err('檔案', s + ' 缺少 ' + f);
    if ((subjectHTML.match(new RegExp('data-module="' + s + '"', 'g')) || []).length !== 1) err('首頁', s + ' 的科目頁卡片不是恰好一張');
    if (!new RegExp('data-thumb="' + s + '"').test(subjectHTML)) warn('首頁', s, '卡片沒有縮圖（npm run thumbs -- ' + s + '）');
    if (!new RegExp('["\']' + s + '["\']\\s*:').test(thumbs)) warn('首頁', s, '縮圖版本表沒有這個實驗（npm run thumbs -- ' + s + '）');
    if (!fs.readdirSync(path.join(ROOT, 'tools/mission-proofs')).some(f => f.startsWith(s + '.') || f.startsWith(s + '-'))) warn('任務', s, '沒有任務證明腳本 tools/mission-proofs/');
    if (!(w.LAB_MISSION_MODULES || []).some(m => (m.id || m) === s)) warn('任務', s, '不在 LAB_MISSION_MODULES');
    if (!(w.LAB_MODULE_BRANCH || {})[s]) err('任務', s + ' 不在 LAB_MODULE_BRANCH');
  }
  for (const p of (ACCEPT ? only : ENTRY.concat(['leaderboard', 'about'], LIVE))) {
    const f = p + '.html';
    if (!exists(f)) continue;
    const h = read(f);
    if (!/<html[^>]+lang=/.test(h)) warn('無障礙', p, '<html> 沒有 lang');
    if (!/name="viewport"/.test(h)) err('頁面', p + ' 沒有 viewport');
    if (!/<meta name="description"/.test(h)) warn('國際能見度', p, '沒有 <meta name="description">');
    if (!/property="og:image"/.test(h)) warn('國際能見度', p, '沒有 Open Graph 分享圖（og:image，node tools/seo.cjs）');
    if (!/hreflang="en"/.test(h)) warn('國際能見度', p, '沒有多語言網址 hreflang（node tools/seo.cjs）');
    if (p !== 'index' && p !== 'leaderboard' && !/application\/ld\+json/.test(h)) warn('國際能見度', p, '沒有結構化資料（node tools/seo.cjs）');
    if (!fs.existsSync(path.join(ROOT, 'img/og/' + p + '.jpg'))) warn('國際能見度', p, '沒有分享卡圖片 img/og/' + p + '.jpg（node tools/seo.cjs）');
    if (SUPS.test(h.replace(/<script[\s\S]*?<\/script>/g, ''))) err('字元', p + '.html 有上標／下標數字字元');
    const unstamped = (h.match(/(?:src|href)="(?:js\/|lab\.css)[^"?]*"/g) || []);
    if (unstamped.length) warn('快取', p, '有 ' + unstamped.length + ' 個 CSS/JS 沒有版本號（python tools/stamp.py）');
    if (p !== 'index' && p !== 'leaderboard' && !/data-en-ready/.test(h)) warn('語言', p, '<body> 沒有 data-en-ready');
  }
  // 驗收只看這幾站頁面實際載入的 js（別站的檔有問題不該卡住這站；複查【中】1）
  const accJs = ACCEPT ? new Set(only.flatMap(p => exists(p + '.html') ? [...read(p + '.html').matchAll(/src="js\/([\w.-]+\.js)(?:\?[^"]*)?"/g)].map(m => m[1]) : [])) : null;
  const jsList = ACCEPT ? [...accJs].filter(f => exists('js/' + f)) : fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js'));
  for (const f of jsList.filter(f => f !== 'hans-map.js')) {
    const src = read('js/' + f).replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '');
    if (SUPS.test(src)) err('字元', 'js/' + f + ' 有上標／下標數字字元（畫布要自己畫小字上標）');
  }
  if (!exists('sitemap.xml')) warn('國際能見度', '-', '沒有 sitemap.xml');
  if (!exists('robots.txt')) warn('國際能見度', '-', '沒有 robots.txt');
  const nE = report.errors.filter(e => ['檔案', '首頁', '頁面', '字元', '任務'].includes(e.area)).length;
  report.steps['靜態稽核'] = { ok: !nE };
  if (!BRIEF) console.log((nE ? '✗ ' : '✓ ') + '靜態稽核（錯誤 ' + nE + '、提醒 ' + report.warnings.length + '）');
}

// 試玩：tools/playtest.cjs --changed（像學生一樣從介面玩：任務說明對介面、亂按、預設不觸發任務、數值合理性）
// 確定是問題的列為錯誤（擋發布），待人工確認的列進提醒；沒改過的實驗沿用上次結果
const isLab = s => LIVE.includes(s) || fs.existsSync(path.join(ROOT, 'js/missions/' + s + '.js'));
function playtest() {
  const pages = only.length ? only.filter(isLab) : [];
  if (only.length && !pages.length) return; // 指定的頁面都不是實驗（例如只查首頁）
  const t = Date.now();
  const PT = s => spawnSync(process.execPath, [path.join(ROOT, 'tools/playtest.cjs'), '--quiet'].concat(s), { cwd: ROOT, windowsHide: true, encoding: 'utf8', maxBuffer: 64 << 20, timeout: 4 * 3600 * 1000 });
  const readRep = () => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, '.shots/playtest-report.json'), 'utf8')); } catch (e) { return null; } };
  let r = PT(['--changed'].concat(pages));
  let rep = readRep();
  // 驗收時：只記過版本、還沒真的玩過的站（none），直接玩一次，不可當作通過
  if (ACCEPT && rep && r.status !== 2 && !r.error) {
    const none = pages.filter(s => rep.pages[s] && rep.pages[s].none);
    if (none.length) {
      const r2 = PT(none);
      const rep2 = readRep();
      if (r2.status === 2 || r2.error || !rep2) r = r2;
      else rep = { at: rep.at, pages: Object.assign({}, rep.pages, rep2.pages) };
    }
  }
  const sec = Math.round((Date.now() - t) / 1000);
  if (r.status === 2 || r.error || !rep || Date.parse(rep.at) < t - 1000) {
    const tail = (((r.stdout || '') + (r.stderr || '')).trim().split('\n').slice(-3).join(' / ')).slice(0, 300);
    report.steps['試玩'] = { ok: false, sec };
    console.log('✗ 試玩（' + sec + ' 秒）：沒有跑完');
    err('試玩', '試玩工具沒有跑完：' + (r.error && r.error.code === 'ETIMEDOUT' ? '超過 4 小時' : tail || '結束碼 ' + r.status));
    return;
  }
  let nC = 0, nP = 0, ran = 0, cached = 0, none = 0;
  for (const [slug, p] of Object.entries(rep.pages)) {
    if (p.none) { none++; continue; }
    if (p.cached) cached++; else ran++;
    (p.confirmed || []).forEach(i => { nC++; err('試玩', slug + '：' + i.msg + (i.repro ? '（重現：' + i.repro + '）' : '') + (i.shot ? '（截圖 ' + i.shot + '）' : '')); });
    (p.pending || []).forEach(i => { nP++; warn('試玩', slug, '待人工確認：' + i.msg); });
  }
  report.steps['試玩'] = { ok: !nC, sec, ran, cached, none };
  if (none && ACCEPT) err('試玩', none + ' 站沒有試玩結果');
  const note = (r.stdout || '').split('\n').find(l => /^試玩：/.test(l));
  if (!BRIEF) console.log((nC ? '✗ ' : '✓ ') + '試玩（' + sec + ' 秒；重玩 ' + ran + ' 個、沿用上次結果 ' + cached + ' 個' + (none ? '、還沒有紀錄 ' + none + ' 個' : '') + '）：確定是問題 ' + nC + '、待人工確認 ' + nP +
    (note && !ran ? '\n    ' + note : ''));
}

// 版面自查（tools/layout-audit.cjs --font，11/27 A2）：驗收時跑，不合格列為錯誤
function layout() {
  const pages = only.filter(isLab);
  if (!pages.length) return;
  const t = Date.now();
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools/layout-audit.cjs'), pages.join(','), '--font'], { cwd: ROOT, windowsHide: true, encoding: 'utf8', maxBuffer: 64 << 20, timeout: 3600 * 1000 });
  const sec = Math.round((Date.now() - t) / 1000);
  const out = ((r.stdout || '') + (r.stderr || '')).trim();
  report.steps['版面自查'] = { ok: r.status === 0, sec };
  if (r.status === 0) { if (!BRIEF) console.log('✓ 版面自查（' + sec + ' 秒）'); return; }
  if (r.status !== 1 || r.error) { err('版面自查', '工具沒有跑完：' + (r.error ? r.error.code : '結束碼 ' + r.status) + '　' + out.split('\n').slice(-3).join(' / ').slice(0, 300)); return; }
  // 「✗ 站名」底下縮排的每一行是一項不合格
  let cur = null;
  for (const l of out.split('\n')) {
    if (/^✗ /.test(l)) cur = l.slice(2).trim();
    else if (cur && /^\s{2,}\S/.test(l)) err('版面自查', cur + '：' + l.trim());
    else cur = null;
  }
  if (!report.errors.some(e => e.area === '版面自查')) err('版面自查', '不合格（' + out.split('\n').pop() + '）');
  if (!BRIEF) console.log('✗ 版面自查（' + sec + ' 秒）');
}

function finish() {
  fs.mkdirSync(path.join(ROOT, '.shots'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, '.shots/verify-report.json'), JSON.stringify(report, null, 1));
  if (BRIEF) {
    const all = Math.round((Date.now() - T0) / 1000);
    const who = ACCEPT ? '驗收 ' + only.join('、') : (QUICK ? '快速檢查' : AUDIT ? '稽核' : '總檢查') + (only.length ? ' ' + only.join('、') : '');
    const nW = report.warnings.length;
    report.errors.forEach(e => console.log('✗ ' + e.area + '：' + e.msg));
    console.log((report.errors.length ? '\n✗ ' + who + '：' + report.errors.length + ' 項不合格，不可上線' : '✓ ' + who + '：全部通過，可以上線') +
      '（' + Object.keys(report.steps).join('、') + '；' + Math.floor(all / 60) + ' 分 ' + (all % 60) + ' 秒）' +
      (nW ? '。另有 ' + nW + ' 項提醒不擋上線，在 .shots/verify-report.json' : ''));
    process.exit(report.errors.length ? 1 : 0);
  }
  const byArea = {};
  report.warnings.forEach(x => { byArea[x.area] = (byArea[x.area] || 0) + 1; });
  console.log('\n提醒（待改清單）：' + (Object.keys(byArea).map(k => k + ' ' + byArea[k]).join('、') || '無'));
  report.errors.forEach(e => console.log('  ✗ ' + e.area + '：' + e.msg));
  console.log(report.errors.length ? `\n有 ${report.errors.length} 個錯誤，不可發布。` : '\n全部通過，可以發布。詳細結果：.shots/verify-report.json');
  process.exit(report.errors.length ? 1 : 0);
}

run('科目導覽檢查', process.execPath, [path.join(ROOT, 'tools/fix-crumbs.cjs'), '--check']);
run('科目目錄檢查', process.execPath, [path.join(ROOT, 'tools/apply-directory.cjs'), '--check']);
if (ACCEPT) {
  // 驗收：頁面檢查 → 試玩 → 版面自查（瀏覽器都經 tools/browser.cjs 排隊，一次一個）
  run('任務不變檢查', process.execPath, [path.join(ROOT, 'tools/mission-guard.cjs')]); // A9：本分支改過的任務檔，代號、等級、隱藏與否不可改
  run('頁面檢查', process.execPath, [path.join(ROOT, 'tools/check-pages.cjs')].concat(only));
  playtest();
  layout();
  finish();
} else if (QUICK) finish();
else {
  // 4. 介面稽核（Playwright，390 px 淺色繁體）：觸控目標、文字對比、說明文字、頁面重量
  const { launch } = require('./browser.cjs');
  const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' };
  let bytes = 0;
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(ROOT, p.endsWith('/') ? p + 'index.html' : p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    bytes += fs.statSync(file).size;
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  server.listen(0, '127.0.0.1', async () => {
    const base = 'http://127.0.0.1:' + server.address().port + '/';
    const browser = await launch();
    const t = Date.now();
    for (const slug of PAGES) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'light', hasTouch: true });
      await ctx.route(u => !u.href.startsWith(base), r => r.abort());
      await ctx.addInitScript({ path: path.join(ROOT, 'tools/mock-backend.js') });
      await ctx.addInitScript(() => {
        localStorage.setItem('lab-settings', JSON.stringify({ lang: 'zh-Hant', theme: 'auto', fs: 1 }));
        localStorage.setItem('lab-welcome-v1', 'skip');
      });
      const page = await ctx.newPage();
      bytes = 0;
      try {
        await page.goto(base + slug + '.html', { waitUntil: 'load' });
        await page.waitForTimeout(1200);
        const kb = Math.round(bytes / 1024);
        if (kb > 1500) warn('效能', slug, '首次載入 ' + kb + ' KB（超過 1500 KB）');
        const r = await page.evaluate(() => {
          const out = { small: [], contrast: [], noname: [], noalt: 0 };
          const vis = el => { const s = getComputedStyle(el); const b = el.getBoundingClientRect(); return s.visibility !== 'hidden' && s.display !== 'none' && b.width > 0 && b.height > 0; };
          const label = el => (el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/)[0] : ''));
          // 觸控目標：實際點得到的範圍（含 ::after 擴大的區域）寬、高都要至少 44 px
          const ctrls = [...document.querySelectorAll('button, select, input:not([type=hidden]):not([type=range]), [role=button], .lab-num, .chapter-nav a, .crumbs a')]
            .filter(el => vis(el) && !el.closest('.lab-settings, .lab-set-panel, .katex'));
          for (const el of ctrls) {
            const tgt = el.matches('input[type=checkbox], input[type=radio]') ? (el.closest('label') || el) : el;
            tgt.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }); // 網站有平滑捲動，要立即捲到
            const b = tgt.getBoundingClientRect();
            const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
            const hit = (x, y) => { const h = document.elementFromPoint(x, y); return !!h && tgt.contains(h); };
            // 從中心往兩邊一格一格找，量出連續點得到的長度（::after 擴大的範圍可以不對稱）
            const span = (dx, dy) => { let n = 1; for (const s of [1, -1]) for (let k = 1; k <= 40 && hit(cx + s * k * dx, cy + s * k * dy); k++) n++; return n; };
            if (!hit(cx, cy)) continue; // 被其他東西蓋住（例如固定的工具列），不算
            const sh = span(0, 1), sw = span(1, 0);
            if ((sh < 44 || sw < 44) && out.small.length < 12) out.small.push(label(tgt) + ' ' + sw + '×' + sh);
          }
          // 名稱：按鈕與表單控制項要有可讀的名稱
          for (const el of document.querySelectorAll('button, [role=button], select, input:not([type=hidden])')) {
            if (!vis(el)) continue;
            const name = (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').trim() || (el.labels && el.labels[0] && el.labels[0].textContent.trim()) || (el.closest('label') && el.closest('label').textContent.trim());
            if (!name && out.noname.length < 8) out.noname.push(label(el));
          }
          out.noalt = [...document.querySelectorAll('img:not([alt])')].length;
          // 文字對比（WCAG AA：一般字 4.5、大字 3）
          // color-mix() 算出來是 color(srgb 0–1 …)，要換成 0–255
          const rgb = s => { const m = s.match(/[\d.]+/g); if (!m) return [0, 0, 0, 1]; const v = m.map(Number); if (/^color\(srgb/.test(s)) { v[0] *= 255; v[1] *= 255; v[2] *= 255; } return v; };
          const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
          const bgOf = el => { for (let e = el; e; e = e.parentElement) { const s = getComputedStyle(e); if (s.backgroundImage !== 'none') return null; const c = rgb(s.backgroundColor); if ((c[3] === undefined ? 1 : c[3]) > 0.95) return c; } return [255, 255, 255, 1]; };
          const seen = new Set();
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          for (let n; (n = walker.nextNode());) {
            const el = n.parentElement;
            if (!el || seen.has(el) || !n.textContent.trim() || el.closest('script, style, .katex-mathml, .lab-settings, .lab-set-panel, [aria-hidden=true]') || !vis(el)) continue;
            seen.add(el);
            const s = getComputedStyle(el);
            if (parseFloat(s.opacity) < 1) continue;
            const fg = rgb(s.color); const bg = bgOf(el);
            if (!bg || (fg[3] !== undefined && fg[3] < 1)) continue;
            const L1 = lum(fg), L2 = lum(bg);
            const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
            const px = parseFloat(s.fontSize), big = px >= 24 || (px >= 18.66 && +s.fontWeight >= 700);
            if (ratio < (big ? 3 : 4.5) && out.contrast.length < 8) out.contrast.push(label(el) + '「' + n.textContent.trim().slice(0, 12) + '」' + ratio.toFixed(2));
          }
          return out;
        });
        if (r.small.length) warn('好上手', slug, '觸控目標小於 44 px：' + r.small.join('、'));
        if (r.noname.length) warn('無障礙', slug, '控制項沒有名稱：' + r.noname.join('、'));
        if (r.noalt) warn('無障礙', slug, r.noalt + ' 張圖片沒有 alt');
        if (r.contrast.length) warn('視覺', slug, '文字對比不足（WCAG AA）：' + r.contrast.join('、'));
      } catch (e) { warn('介面稽核', slug, '無法稽核：' + e.message.slice(0, 120)); }
      await ctx.close();
    }
    await browser.close();
    server.close();
    report.steps['介面稽核'] = { ok: true, sec: Math.round((Date.now() - t) / 1000) };
    if (!BRIEF) console.log('✓ 介面稽核（' + report.steps['介面稽核'].sec + ' 秒，結果列在提醒）');
    // 5. 頁面檢查（四種組合：錯誤、左右捲動、KaTeX、英文殘留中文、上標字元）
    if (!AUDIT) run('頁面檢查', process.execPath, [path.join(ROOT, 'tools/check-pages.cjs')].concat(only));
    // 6. 試玩（只重玩有改過的實驗；上一個瀏覽器關掉後才開，同一時間只有一個）
    if (!AUDIT) playtest();
    finish();
  });
}
