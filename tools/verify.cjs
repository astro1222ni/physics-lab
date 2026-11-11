#!/usr/bin/env node
/*
 * verify.cjs — 一鍵總檢查（發布前、每日自動優化都用這一支）。
 *
 * 用法：
 *   node tools/verify.cjs            全部：單元測試 → 任務證明 → 靜態稽核 → 介面稽核 → 頁面檢查（約 6–10 分鐘）
 *   node tools/verify.cjs --quick    只跑單元測試、任務證明、靜態稽核（約 1 分鐘）
 *   node tools/verify.cjs --audit    只跑靜態稽核與介面稽核（約 1 分鐘）
 *   node tools/verify.cjs --fresh    任務證明不用快取、全部重算
 *   省 CPU：任務證明有快取（沒改過就不重算）；瀏覽器用 Intel 內顯（tools/browser.cjs）；整支低於標準優先權。
 *   node tools/verify.cjs kepler     介面稽核與頁面檢查只看指定頁面
 *
 * 會失敗（結束碼 1）：單元測試、任務證明、頁面檢查有任何一項沒過，或靜態稽核的「錯誤」級問題。
 * 只提醒（不擋發布，列進待改清單）：觸控目標小於 44 px、文字對比不足、缺說明文字、頁面太重等。
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
const QUICK = args.includes('--quick');
const FRESH = args.includes('--fresh'); // 任務證明全部重算，不用快取
const AUDIT = args.includes('--audit'); // 只跑靜態稽核與介面稽核（改介面時快速看提醒）
const only = args.filter(a => !a.startsWith('--'));
const report = { at: new Date().toISOString(), steps: {}, errors: [], warnings: [] };
const err = (area, msg) => report.errors.push({ area, msg });
const warn = (area, page, msg) => report.warnings.push({ area, page, msg });

const w = {};
new Function('window', fs.readFileSync(path.join(ROOT, 'js/missions/index.js'), 'utf8'))(w);
const LIVE = w.LAB_LIVE_MODULES || [];
const PAGES = only.length ? only : ['index', 'leaderboard', 'about'].concat(LIVE);

function run(label, cmd, cmdArgs) {
  const t = Date.now();
  const r = spawnSync(cmd, cmdArgs, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
  const ok = r.status === 0;
  report.steps[label] = { ok, sec: Math.round((Date.now() - t) / 1000) };
  console.log((ok ? '✓ ' : '✗ ') + label + '（' + report.steps[label].sec + ' 秒）');
  if (!ok) { console.log(((r.stdout || '') + (r.stderr || '')).split('\n').filter(l => /✗|Error|錯|失敗|FAIL|assert/i.test(l)).slice(0, 30).join('\n')); err(label, '沒有通過'); }
  return { ok, out: (r.stdout || '') + (r.stderr || '') };
}

// 1. 單元測試
if (!AUDIT) run('單元測試', process.execPath, [path.join(ROOT, 'tools/run-tests.cjs')]);

// 2. 任務證明（每支都要結束碼 0）
if (!AUDIT) {
  const dir = path.join(ROOT, 'tools/mission-proofs');
  const files = fs.readdirSync(dir).filter(f => /\.c?js$/.test(f)).sort();
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
    const r = spawnSync(process.execPath, [path.join(dir, f)], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20, timeout: 600000 });
    if (r.status !== 0) {
      delete cache[f];
      const tail = (((r.stdout || '') + (r.stderr || '')).trim().split('\n').slice(-3).join(' / ')).slice(0, 300);
      bad.push(f + '：' + (r.error && r.error.code === 'ETIMEDOUT' ? '超過 10 分鐘沒跑完（電腦太忙或腳本卡住）' : tail || ('結束碼 ' + r.status + (r.signal ? '，被中止（' + r.signal + '）' : '') + '，沒有輸出')));
    } else cache[f] = hv;
  }
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 1));
  report.steps['任務證明'] = { ok: !bad.length, sec: Math.round((Date.now() - t) / 1000), n: files.length, cached: skipped };
  console.log((bad.length ? '✗ ' : '✓ ') + `任務證明 ${files.length - bad.length}/${files.length}（${report.steps['任務證明'].sec} 秒` + (skipped ? `，${skipped} 支沒改過、沿用上次結果` : '') + '）');
  bad.forEach(b => { console.log('    ' + b); err('任務證明', b); });
}

// 3. 靜態稽核（不開瀏覽器）
{
  const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const exists = f => fs.existsSync(path.join(ROOT, f));
  const index = read('index.html');
  const thumbs = exists('js/thumbs.js') ? read('js/thumbs.js') : '';
  const SUPS = /[⁰⁴-₟⃗]/;
  for (const s of LIVE) {
    for (const f of [s + '.html', 'js/' + s + '.js', 'js/missions/' + s + '.js']) if (!exists(f)) err('檔案', s + ' 缺少 ' + f);
    if (!index.includes('data-module="' + s + '"')) err('首頁', s + ' 沒有首頁卡片');
    if (!new RegExp('data-thumb="' + s + '"').test(index)) warn('首頁', s, '卡片沒有縮圖（npm run thumbs -- ' + s + '）');
    if (!new RegExp('["\']' + s + '["\']\\s*:').test(thumbs)) warn('首頁', s, '縮圖版本表沒有這個實驗（npm run thumbs -- ' + s + '）');
    if (!fs.readdirSync(path.join(ROOT, 'tools/mission-proofs')).some(f => f.startsWith(s + '.') || f.startsWith(s + '-'))) warn('任務', s, '沒有任務證明腳本 tools/mission-proofs/');
    if (!(w.LAB_MISSION_MODULES || []).some(m => (m.id || m) === s)) warn('任務', s, '不在 LAB_MISSION_MODULES');
    if (!(w.LAB_MODULE_BRANCH || {})[s]) err('任務', s + ' 不在 LAB_MODULE_BRANCH');
  }
  for (const p of ['index', 'leaderboard', 'about'].concat(LIVE)) {
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
  for (const f of fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js') && f !== 'hans-map.js')) {
    const src = read('js/' + f).replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '');
    if (SUPS.test(src)) err('字元', 'js/' + f + ' 有上標／下標數字字元（畫布要自己畫小字上標）');
  }
  if (!exists('sitemap.xml')) warn('國際能見度', '-', '沒有 sitemap.xml');
  if (!exists('robots.txt')) warn('國際能見度', '-', '沒有 robots.txt');
  const nE = report.errors.filter(e => ['檔案', '首頁', '頁面', '字元', '任務'].includes(e.area)).length;
  report.steps['靜態稽核'] = { ok: !nE };
  console.log((nE ? '✗ ' : '✓ ') + '靜態稽核（錯誤 ' + nE + '、提醒 ' + report.warnings.length + '）');
}

function finish() {
  fs.mkdirSync(path.join(ROOT, '.shots'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, '.shots/verify-report.json'), JSON.stringify(report, null, 1));
  const byArea = {};
  report.warnings.forEach(x => { byArea[x.area] = (byArea[x.area] || 0) + 1; });
  console.log('\n提醒（待改清單）：' + (Object.keys(byArea).map(k => k + ' ' + byArea[k]).join('、') || '無'));
  report.errors.forEach(e => console.log('  ✗ ' + e.area + '：' + e.msg));
  console.log(report.errors.length ? `\n有 ${report.errors.length} 個錯誤，不可發布。` : '\n全部通過，可以發布。詳細結果：.shots/verify-report.json');
  process.exit(report.errors.length ? 1 : 0);
}

if (QUICK) finish();
else {
  // 4. 介面稽核（Playwright，390 px 淺色繁體）：觸控目標、文字對比、說明文字、頁面重量
  const { launch } = require('./browser.cjs'); // Intel 內顯算畫面、低於標準優先權（減少 CPU 負擔）
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
    console.log('✓ 介面稽核（' + report.steps['介面稽核'].sec + ' 秒，結果列在提醒）');
    // 5. 頁面檢查（四種組合：錯誤、左右捲動、KaTeX、英文殘留中文、上標字元）
    if (!AUDIT) run('頁面檢查', process.execPath, [path.join(ROOT, 'tools/check-pages.cjs')].concat(only));
    finish();
  });
}
