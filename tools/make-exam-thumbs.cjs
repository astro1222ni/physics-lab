'use strict';
/*
 * 學測題目卡縮圖（11/21 站長：「這些圖卡的縮圖不是相關實驗室的圖，是要完全就是那一題的圖」）
 * 每一題打開 exam-<年>.html?q=N，截題目頁上方那張題目圖（#opening-art 的畫布；114 第 49 題是 #printed-graph），
 * 等比放進 720×405（多出來的上下左右補畫布底色），輸出 img/thumbs/exam-<年>-<題>-<hant|hans|en>-<light|dark>.webp，
 * 再把 learn.html 對應題目卡的 <img> 換成 data-exam-thumb＋data-v（內容雜湊），由 js/learn.js 依語言與深淺色挑圖。
 * 用法：node tools/make-exam-thumbs.cjs [114|113 …] [--q=19,20]
 * 113 的題目還沒寫畫面（js/exam/113/qN.js 裡還沒有 ExamScene.add）就先跳過，題目卡保留原本的圖。
 */
const fs = require('fs'), path = require('path'), http = require('http'), crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..');
const { launch } = require('./browser.cjs');
const OUT = path.join(ROOT, 'img', 'thumbs'), W = 720, H = 405;
const LANGS = [['hant', 'zh-Hant'], ['hans', 'zh-Hans'], ['en', 'en']], THEMES = ['light', 'dark'];
const args = process.argv.slice(2);
const years = args.filter(a => /^\d{3}$/.test(a)).map(Number);
const onlyQ = ((args.find(a => a.startsWith('--q=')) || '').slice(4)).split(',').filter(Boolean);
const YEARS = years.length ? years : [115, 114, 113];

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.m4a': 'audio/mp4' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(ROOT, p.endsWith('/') ? p + 'index.html' : p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

function questionsOf(year) {
  const html = fs.readFileSync(path.join(ROOT, 'learn.html'), 'utf8');
  const qs = [...html.matchAll(new RegExp('href="exam-' + year + '\\.html\\?q=(\\d+)"', 'g'))].map(m => m[1]);
  return [...new Set(qs)].filter(q => (!onlyQ.length || onlyQ.includes(q)) && (year !== 113 || /ExamScene\.add\(/.test(fs.existsSync(path.join(ROOT, 'js/exam/113/q' + q + '.js')) ? fs.readFileSync(path.join(ROOT, 'js/exam/113/q' + q + '.js'), 'utf8') : '')));
}

// 在瀏覽器裡把截圖等比放進 720×405：截圖前已拿掉畫布的圓角與邊框，空白處用同一張圖放大模糊當底，看不出接縫、也不會拉出條紋
async function toWebp(page, png) {
  return Buffer.from((await page.evaluate(async ([b64, W, H]) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    const i = 0, sx = i, sy = i, sw = img.width - 2 * i, sh = img.height - 2 * i;
    const k = Math.min(W / sw, H / sh), w = sw * k, h = sh * k, dx = (W - w) / 2, dy = (H - h) / 2;
    x.imageSmoothingQuality = 'high';
    // 空白處：同一張圖放大鋪滿再模糊當底，上下左右的顏色自然接上，貼邊的字也不會被拉成條紋
    if (dx > 0 || dy > 0) { const kc = Math.max(W / sw, H / sh); x.save(); x.filter = 'blur(18px)';
      x.drawImage(img, sx, sy, sw, sh, (W - sw * kc) / 2 - 80, (H - sh * kc) / 2 - 80, sw * kc + 160, sh * kc + 160); x.restore(); }
    x.drawImage(img, sx, sy, sw, sh, dx, dy, w, h);
    return c.toDataURL('image/webp', 0.84);
  }, [png.toString('base64'), W, H])).split(',')[1], 'base64');
}

(async () => {
  await new Promise(o => server.listen(0, '127.0.0.1', o));
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  const browser = await launch();
  const scratch = await (await browser.newContext()).newPage();
  const done = {};
  let bad = 0;
  for (const year of YEARS) {
    const qs = questionsOf(year);
    for (const [lk, lang] of LANGS) for (const theme of THEMES) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2, colorScheme: theme });
      await ctx.route(u => !u.href.startsWith(base), r => r.abort());
      await ctx.addInitScript(o => { localStorage.setItem('lab-settings', JSON.stringify({ lang: o.lang, theme: 'auto', fs: 1 })); localStorage.setItem('lab-welcome-v1', 'skip'); }, { lang });
      await ctx.addInitScript({ path: path.join(ROOT, 'tools/mock-backend.js') });
      const page = await ctx.newPage();
      for (const q of qs) {
        const tag = `${year}-${q} ${lk} ${theme}`;
        try {
          await page.goto(`${base}exam-${year}.html?q=${q}`, { waitUntil: 'load' });
          await page.waitForTimeout(900);
          const sel = await page.evaluate(() => { const o = document.querySelector('#opening-art'); return o && !o.hidden && o.offsetParent ? '#opening-art canvas' : '#printed-graph'; });
          // 題目圖畫布平常是 460:220；截圖時暫時改成 16:9，讓場景自己把背景鋪滿，縮圖就不用補邊
          await page.addStyleTag({ content: '#opening-art canvas{aspect-ratio:16/9!important}#opening-art canvas,#printed-graph{border-radius:0!important;border:0!important;box-shadow:none!important;outline:0!important}' }); await page.waitForTimeout(300);
          const png = await page.locator(sel).first().screenshot();
          const webp = await toWebp(scratch, png);
          fs.writeFileSync(path.join(OUT, `exam-${year}-${q}-${lk}-${theme}.webp`), webp);
          (done[year] = done[year] || new Set()).add(q);
          console.log('✓ ' + tag + '　' + Math.round(webp.length / 1024) + ' KB');
        } catch (e) { bad++; console.log('✗ ' + tag + '　' + e.message); }
      }
      await ctx.close();
    }
  }
  await browser.close(); server.close();

  // learn.html：題目卡換成這一題自己的圖
  const lp = path.join(ROOT, 'learn.html');
  let html = fs.readFileSync(lp, 'utf8'), n = 0;
  for (const year of Object.keys(done)) for (const q of done[year]) {
    const id = `exam-${year}-${q}`, files = LANGS.flatMap(([lk]) => THEMES.map(t => path.join(OUT, `${id}-${lk}-${t}.webp`)));
    if (!files.every(f => fs.existsSync(f))) continue;
    const h = crypto.createHash('sha1'); files.forEach(f => h.update(fs.readFileSync(f))); const v = h.digest('hex').slice(0, 8);
    const re = new RegExp('(<a class="study-link" href="exam-' + year + '\\.html\\?q=' + q + '"><span class="exam-thumb">)<img [^>]*>');
    html = html.replace(re, (m, open) => { n++; return open + `<img class="module-thumb" data-exam-thumb="${id}" data-v="${v}" src="img/thumbs/${id}-hant-light.webp?v=${v}" alt="">`; });
  }
  fs.writeFileSync(lp, html);
  console.log(`\nlearn.html 換了 ${n} 張題目卡縮圖` + (bad ? `；${bad} 張失敗` : ''));
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
