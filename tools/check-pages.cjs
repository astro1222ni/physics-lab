#!/usr/bin/env node
/*
 * check-pages.cjs — 用 Playwright 實際打開頁面做發布前檢查（自帶小型網頁伺服器，不必另外開）。
 *
 * 用法：
 *   node tools/check-pages.cjs                 檢查首頁、排行榜與所有已上線的實驗
 *   node tools/check-pages.cjs kepler atwood   只檢查指定的頁面（不加 .html）
 *   node tools/check-pages.cjs --shots         另外存截圖到 ./.shots/（已列入 .gitignore，記得親自看）
 *
 * 每頁檢查 4 種組合：390 px 淺色繁體、390 px 深色簡體特大字、1280 px 深色 English、1280 px 淺色繁體。
 * 回報：頁面錯誤、左右捲動、.katex-error、English 模式殘留的中文（含 aria-label／title／placeholder／alt；齒輪設定面板本身的語言名稱除外）、
 *       Unicode 上標／下標數字字元（部分 Android 字型缺字）。
 * 需要：npm install（playwright）與 npx playwright install chromium。
 * Firebase 連線失敗的訊息會被忽略；任務與留言請改用 tools/mock-backend.js 測試，不要寫入正式資料庫。
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { launch } = require('./browser.cjs'); // Intel 內顯算畫面、低於標準優先權（減少 CPU 負擔）

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const SHOTS = args.includes('--shots');
// 頁面可用空格或逗號分開（npm run check -- a,b,c 也可以）
let pages = args.filter(a => !a.startsWith('--')).flatMap(a => a.split(',')).map(a => a.trim().replace(/\.html$/, '')).filter(Boolean);
const missing = pages.filter(p => !fs.existsSync(path.join(ROOT, p + '.html')));
if (missing.length) { console.error('✗ 找不到頁面：' + missing.join('、') + '（不加 .html，用空格或逗號分開）'); process.exit(1); }
if (!pages.length) {
  const w = {};
  new Function('window', fs.readFileSync(path.join(ROOT, 'js/missions/index.js'), 'utf8'))(w);
  pages = ['index', 'leaderboard'].concat(w.LAB_LIVE_MODULES || []);
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(ROOT, p.endsWith('/') ? p + 'index.html' : p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const COMBOS = [
  { w: 390, scheme: 'light', lang: 'zh-Hant', fs: 1 },
  { w: 390, scheme: 'dark', lang: 'zh-Hans', fs: 1.3 },
  { w: 1280, scheme: 'dark', lang: 'en', fs: 1 },
  { w: 1280, scheme: 'light', lang: 'zh-Hant', fs: 1 }
];
const SUPS = /[⁰⁴-₟⃗]/;

server.listen(0, '127.0.0.1', async () => {
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  if (SHOTS) fs.mkdirSync(path.join(ROOT, '.shots'), { recursive: true });
  const browser = await launch();
  let bad = 0;
  for (const slug of pages) {
    for (const c of COMBOS) {
      const ctx = await browser.newContext({ viewport: { width: c.w, height: 900 }, colorScheme: c.scheme });
      // 本機連得到 Firebase：擋掉所有對外連線（統計、在線心跳、Firebase SDK），只留本機伺服器，避免寫進正式資料庫
      await ctx.route(u => !u.href.startsWith(base), r => r.abort());
      await ctx.addInitScript(o => {
        localStorage.setItem('lab-settings', JSON.stringify({ lang: o.lang, theme: 'auto', fs: o.fs }));
        localStorage.setItem('lab-welcome-v1', 'skip');
      }, c);
      const page = await ctx.newPage();
      const errs = [];
      page.on('pageerror', e => errs.push('pageerror: ' + e.message));
      page.on('console', m => { if (m.type() === 'error' && !/firebase|gstatic|ERR_|Failed to load resource/i.test(m.text())) errs.push('console: ' + m.text()); });
      try {
        await page.goto(base + slug + '.html', { waitUntil: 'load' });
        await page.waitForTimeout(1500);
        const r = await page.evaluate(lang => {
          const out = { sw: document.documentElement.scrollWidth, vw: innerWidth, katex: document.querySelectorAll('.katex-error').length };
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          const cjk = []; const sups = [];
          for (let n; (n = walker.nextNode());) {
            if (n.parentElement && n.parentElement.closest('script, style, .katex-mathml, .lab-set-panel, .lab-settings, .lab-gear')) continue;
            // 刻意保留的中文（人名、頻道名、中文引用範例）要在元素上標 lang="zh-Hant"
            if (lang === 'en' && n.parentElement && n.parentElement.closest('body [lang^="zh"]')) continue;
            const t = n.textContent;
            if (lang === 'en' && /[一-鿿]/.test(t) && cjk.length < 3) cjk.push(t.trim().slice(0, 40));
            if (/[⁰⁴-₟⃗]/.test(t) && sups.length < 3) sups.push(t.trim().slice(0, 40));
          }
          out.cjk = cjk; out.sups = sups;
          // 螢幕報讀器念的文字也要是英文：aria-label、title、placeholder、圖片 alt
          const attrs = [];
          if (lang === 'en') document.querySelectorAll('[aria-label], [title], [placeholder], img[alt]').forEach(el => {
            if (attrs.length >= 3 || el.closest('.lab-set-panel, .lab-settings, .lab-gear, body [lang^="zh"]')) return;
            ['aria-label', 'title', 'placeholder', 'alt'].forEach(a => { const v = el.getAttribute(a); if (v && /[一-鿿]/.test(v) && attrs.length < 3) attrs.push(a + '="' + v.slice(0, 30) + '"'); });
          });
          out.attrs = attrs;
          return out;
        }, c.lang);
        const probs = errs.slice();
        if (r.sw > r.vw + 1) probs.push('左右捲動：scrollWidth ' + r.sw + ' > ' + r.vw);
        if (r.katex) probs.push(r.katex + ' 個 .katex-error');
        if (r.cjk.length) probs.push('English 模式有中文：' + JSON.stringify(r.cjk));
        if (r.attrs.length) probs.push('English 模式的屬性有中文：' + r.attrs.join('、'));
        if (r.sups.length) probs.push('上標／下標數字字元：' + JSON.stringify(r.sups));
        const tag = `${slug} ${c.w}px ${c.scheme} ${c.lang} ×${c.fs}`;
        if (probs.length) { bad++; console.log('✗ ' + tag + '\n    ' + probs.join('\n    ')); } else console.log('✓ ' + tag);
        if (SHOTS) await page.screenshot({ path: path.join(ROOT, '.shots', `${slug}-${c.w}-${c.scheme}-${c.lang}.png`) });
      } catch (e) { bad++; console.log('✗ ' + slug + ' ' + c.w + ' 無法載入：' + e.message); }
      await ctx.close();
    }
  }
  await browser.close();
  server.close();
  console.log(bad ? `\n有 ${bad} 個組合有問題。` : '\n全部通過。' + (SHOTS ? '截圖在 .shots/，請親自看過。' : ''));
  process.exit(bad ? 1 : 0);
});
