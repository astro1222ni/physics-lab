#!/usr/bin/env node
/*
 * make-thumbs.cjs — 產生首頁實驗卡片的縮圖（實際打開每個實驗、啟動動畫後擷取主畫布）。
 *
 * 用法：
 *   npm run thumbs                    全部已上線的實驗
 *   npm run thumbs -- kepler atwood   只重做指定的實驗（改過畫面後重跑）
 *
 * 每個實驗輸出 6 張 WebP（720×405）：img/thumbs/<代號>-<hant|hans|en>-<light|dark>.webp
 * 並同步更新：
 *   - js/thumbs.js 裡的版本表（圖片內容改了才換版本號，避免讀到舊快取）
 *   - index.html：已上線卡片沒有縮圖時自動補上 <img class="module-thumb" data-thumb="<代號>">
 * 擷取時擋掉所有對外連線（Firebase 統計、在線心跳），不會寫進正式資料庫。
 * 新增實驗時，在下面 PREP 加一筆「怎麼讓畫面動起來」；沒有設定的實驗就照預設等 2 秒後擷取。
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { launch } = require('./browser.cjs'); // Intel 內顯算畫面、低於標準優先權（減少 CPU 負擔）

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'img', 'thumbs');
const W = 720, H = 405;

// click：依序點擊的按鈕；wait：擷取前等待的毫秒數；canvas：主畫布（預設頁面第一個 canvas）；
// eval：點擊前先在頁面執行的程式（例如用測試介面直接插針）；anchor：畫布比 16:9 高時，裁切位置（0 = 上緣、0.5 = 置中、1 = 下緣）
const PREP = {
  'projectile':        { click: ['#run'], wait: 2600, anchor: 1 },
  'newton-second':     { click: ['#go'], wait: 1800, anchor: 0 },
  'incline-friction':  { click: ['#play'], wait: 1600 },
  'atwood':            { click: ['#play'], wait: 1500, anchor: 0 },
  'elevator':          { wait: 2000, anchor: 0.3 },
  'collision':         { click: ['#play'], wait: 1300, anchor: 0 },
  'circular-motion':   { wait: 2200, anchor: 0 },
  'oscillation':       { wait: 1800, anchor: 0.5 },
  'kepler':            { click: ['#launch'], wait: 3000 },
  'ideal-gas':         { wait: 2000 },
  'specific-heat':     { click: ['#play'], wait: 2500, anchor: 0 },
  'standing-waves':    { click: ['#modeB', '#steady'], wait: 1200, anchor: 0 },
  'doppler':           { wait: 3000 },
  'refraction':        { wait: 900 },
  'lens-mirror':       { wait: 900 },
  'slit-interference': { wait: 1500, anchor: 0 },
  'electric-field':    { click: ['#run'], wait: 1500 },
  'capacitor':         { wait: 900, region: [0, 0.36, 0.62] },
  'dc-circuit':        { click: ['[data-preset="mixed"]'], wait: 1800, region: [0, 0, 1] },
  'magnetic-particle': { click: ['#run'], wait: 2500 },
  'faraday':           { wait: 2000, anchor: 0 },
  'photoelectric':     { wait: 2200 },
  'hydrogen-spectrum': { click: ['#modeTube'], wait: 3000, anchor: 0 },
  'radioactive-decay': { wait: 3000 },
  'e-over-m':          { click: ['#demo'], wait: 2500 },
  'free-fall':         { click: ['#go', '#go'], wait: 2600, anchor: 0.6 },
  // 512 Hz、25 °C：第二個共鳴約在 L = 49.6 cm，從 40 cm 往下掃，響度曲線會出現尖峰
  'ripple-tank':       { click: ['#part5'], wait: 4000 },
  'equipotential':     { click: ['#power', '#showTheory', '#showStream'], wait: 1500, anchor: 0.6 },
  // 冕牌玻璃 n = 1.52、厚 6 cm：A、B 入射角 34.2°，折射角 21.7°；C、D 插在平行射出的光線上（照司乃耳定律算好）
  'current-balance':   { wait: 1500, anchor: 0 },
  'microwave':         { click: ['[data-mode="standing"]'], wait: 2000, region: [0.035, 0, 0.92] },
  'refractive-index':  { eval: 'window.__ri.place("C", { x: 2.675, y: -8.069 }); window.__ri.place("D", { x: 5.201, y: -11.792 });', click: ['#drawBtn'], wait: 1500 },
  // f = 10 cm、光源屏 5 cm、像屏 95 cm：透鏡移到 83.5 cm 附近，像屏上成清楚的像（共軛位置 83.54 cm）
  'thin-lens':         { click: ['[data-step="-1"]', '[data-step="-1"]', '[data-step="-1"]', '[data-step="-1"]', '[data-step="-1"]', '[data-step="-1"]',
                                 '[data-step="-0.1"]', '[data-step="-0.1"]', '[data-step="-0.1"]', '[data-step="-0.1"]', '[data-step="-0.1"]'], wait: 1500, anchorX: 1 },
  'resonance-tube':    { click: ['#strike', '#dn10', '#dn10', '#dn10', '#dn10', '#dn10', '#dn10', '#dn10', '#dn10', '#dn10', '#dn1', '#dn1', '#dn1', '#dn1', '#dn1', '#dn1'], wait: 1500, anchor: 0.3 },
  'thin-film':         { click: ['#drain'], wait: 2500, anchor: 0.5 },
  'earthquake':        { click: ['[data-mode="earth"]', '#play'], wait: 4500, anchor: 0.5 },
  'molecular-shapes':  { canvas: '#view3 canvas', wait: 3500 },
  'diffusion-osmosis': { click: ['#mCell', '#qSea'], wait: 6000, anchor: 0 },
  'moon-phases':       { wait: 1500 },
  'measurement':       { click: ['#closeBtn'], wait: 1500, anchor: 0 },
  'angular-momentum':  { click: ['#pull'], wait: 3200, anchor: 0.15 },
  'seasons':           { eval: "__seasons.setClock(10.5); document.getElementById('clock').dispatchEvent(new Event('input'));", wait: 1500, region: [0.522, 0.008, 0.478] }, // 只取右半「觀察者的天空」
  'current-magnetic-field': { eval: "LabNum.set(document.getElementById('I'), 3); __cmf.needle.phi = __cmf.ofield().thetaEq * Math.PI / 180;", wait: 1500 },
  'energy-coaster':    { click: ['#presetBox button[data-preset="loop"]'], wait: 2500, anchorX: 1 },
  'torque-balance':    { eval: "__tb.add('adult', 3.5); __tb.add('w5', 1); __tb.add('w1', 1); __tb.add('brick', 0.5);", click: ['#release'], wait: 3200, anchor: 1 },
  // 雙性狀 RrYy × RrYy：先種 100 顆（收成盤有黃綠、圓皺四類），2.4 秒後再種 10 顆，擷取時配子正在飛、受精；
  // 畫布在 1280 寬時約 2 : 1，把實驗區左欄限制在 700 px，畫布就接近 16 : 9，母本、父本兩張卡片都不會被裁掉
  'mendelian-inheritance': { eval: "document.querySelector('.lab').style.gridTemplateColumns = 'minmax(0, 700px) 320px'; document.querySelector('#lSeg [data-l=\"2\"]').click(); document.getElementById('sow100').click(); setTimeout(function () { document.getElementById('sow10').click(); }, 2400);", wait: 2900 },
  // 0.100 M 鹽酸 25.00 mL 加到 25.05 mL（超過當量點一滴）：酚酞剛變粉紅，放大鏡讀數 25.05 mL
  'acid-base-titration': { eval: '__abt.jump(25.05);', wait: 1200, anchor: 0.55 },
  // 單位圓在畫布左側：靠左裁，圓才不會被切掉
  'trig-functions':    { wait: 1500, anchorX: 0 },
  // 3D 容器：往下裁一點，避開上緣的時間與溫度標籤
  'reaction-rate':     { wait: 3000, anchor: 0.7 }
};
// --quick：只做繁體淺色一張，用來快速檢查取景（不更新版本表與首頁）
const QUICK = process.argv.includes('--quick');
const LANGS = QUICK ? [['hant', 'zh-Hant']] : [['hant', 'zh-Hant'], ['hans', 'zh-Hans'], ['en', 'en']];
const THEMES = QUICK ? ['light'] : ['light', 'dark'];

const win = {};
new Function('window', fs.readFileSync(path.join(ROOT, 'js/missions/index.js'), 'utf8'))(win);
const LIVE = win.LAB_LIVE_MODULES || [];
let slugs = process.argv.slice(2).filter(a => !a.startsWith('--'));
if (!slugs.length) slugs = LIVE.slice();
const unknown = slugs.filter(s => !fs.existsSync(path.join(ROOT, s + '.html')));
if (unknown.length) { console.error('找不到頁面：' + unknown.join('、')); process.exit(1); }

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(ROOT, p.endsWith('/') ? p + 'index.html' : p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

// 截圖（2 倍解析度）→ 在瀏覽器裡分兩次縮小、輸出 WebP，不需要額外的影像套件
async function toWebp(page, png) {
  const url = await page.evaluate(async ({ b64, W, H }) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    let src = img, w = img.width, h = img.height;
    while (w / 2 >= W * 1.2) {
      const c = document.createElement('canvas'); c.width = Math.round(w / 2); c.height = Math.round(h / 2);
      const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, c.width, c.height);
      src = c; w = c.width; h = c.height;
    }
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, W, H);
    return c.toDataURL('image/webp', 0.82);
  }, { b64: png.toString('base64'), W, H });
  return Buffer.from(url.split(',')[1], 'base64');
}

server.listen(0, '127.0.0.1', async () => {
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await launch();
  const scratch = await (await browser.newContext()).newPage();
  let bad = 0;
  for (const slug of slugs) {
    const prep = PREP[slug] || { wait: 2000 };
    for (const [lk, lang] of LANGS) {
      for (const theme of THEMES) {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2, colorScheme: theme });
        await ctx.route(u => !u.href.startsWith(base), r => r.abort());
        await ctx.addInitScript(o => {
          localStorage.setItem('lab-settings', JSON.stringify({ lang: o.lang, theme: 'auto', fs: 1 }));
          localStorage.setItem('lab-welcome-v1', 'skip');
          localStorage.setItem('lab-try:' + o.slug, '1'); // 不要「試試看」提示（第一次點擊後才收起，會讓版面移動）
        }, { lang, slug });
        const page = await ctx.newPage();
        const tag = `${slug} ${lk} ${theme}`;
        try {
          await page.goto(base + slug + '.html', { waitUntil: 'load' });
          await page.addStyleTag({ content: '.lab-gear,.lab-settings,.ac-toasts,.ms-celebrate{display:none!important}' });
          await page.waitForTimeout(600);
          if (prep.eval) await page.evaluate(prep.eval);
          for (const sel of prep.click || []) await page.click(sel);
          await page.waitForTimeout(prep.wait);
          const sel = prep.canvas || 'canvas';
          const box = await page.locator(sel).first().boundingBox();
          if (!box) throw new Error('找不到畫布 ' + sel);
          // boundingBox 是相對視窗；按鈕在下方時頁面會捲動，整頁截圖要換成相對頁面的座標
          const [sx, sy] = await page.evaluate(() => [window.scrollX, window.scrollY]);
          box.x += sx; box.y += sy;
          // 只取畫布內部：比 16:9 高就上下裁（anchor），比 16:9 寬就左右裁（anchorX）
          // region: [x0, y0, 寬]（畫布寬高的比例）可只取畫布的一部分，高度依 16:9 自動算
          let clip;
          if (prep.region) {
            const [rx, ry, rw] = prep.region;
            const cw = box.width * rw, ch = cw * H / W;
            clip = { x: box.x + box.width * rx, y: Math.min(box.y + box.height * ry, box.y + box.height - ch), width: cw, height: ch };
          } else {
            let cw = box.width, ch = box.width * H / W;
            if (ch > box.height) { ch = box.height; cw = ch * W / H; }
            const ax = prep.anchorX == null ? 0.5 : prep.anchorX;
            const ay = prep.anchor == null ? 0.5 : prep.anchor;
            clip = { x: box.x + (box.width - cw) * ax, y: box.y + (box.height - ch) * ay, width: cw, height: ch };
          }
          const png = await page.screenshot({ clip, fullPage: true });
          const webp = await toWebp(scratch, png);
          fs.writeFileSync(path.join(OUT, `${slug}-${lk}-${theme}.webp`), webp);
          console.log('✓ ' + tag + '　' + Math.round(webp.length / 1024) + ' KB');
        } catch (e) { bad++; console.log('✗ ' + tag + '　' + e.message); }
        await ctx.close();
      }
    }
  }
  await browser.close();
  server.close();
  if (QUICK) { console.log(bad ? `\n有 ${bad} 張失敗。` : '\n快速檢查完成（只更新圖檔）。'); process.exit(bad ? 1 : 0); }

  // 版本表：每個實驗 6 張圖的內容雜湊
  const ver = {};
  for (const s of LIVE) {
    const files = LANGS.flatMap(([lk]) => THEMES.map(t => path.join(OUT, `${s}-${lk}-${t}.webp`)));
    if (!files.every(f => fs.existsSync(f))) continue;
    const h = crypto.createHash('sha1');
    files.forEach(f => h.update(fs.readFileSync(f)));
    ver[s] = h.digest('hex').slice(0, 8);
  }
  const tjs = path.join(ROOT, 'js', 'thumbs.js');
  const src = fs.readFileSync(tjs, 'utf8');
  const body = '/* VERSIONS-BEGIN（由 tools/make-thumbs.cjs 自動產生，請勿手改） */\n  const V = ' +
    JSON.stringify(ver, null, 2).replace(/\n/g, '\n  ') + ';\n  /* VERSIONS-END */';
  fs.writeFileSync(tjs, src.replace(/\/\* VERSIONS-BEGIN[\s\S]*?VERSIONS-END \*\//, body));

  // 首頁：已上線卡片補上縮圖
  const idx = path.join(ROOT, 'index.html');
  let html = fs.readFileSync(idx, 'utf8');
  let added = 0;
  html = html.replace(/(<a class="module live"[^>]*data-module="([\w-]+)"[^>]*>)(?!\s*<img class="module-thumb")(\s*)/g, (m, open, s, ws) => {
    if (!ver[s]) return m;
    added++;
    return open + ws + `<img class="module-thumb" data-thumb="${s}" alt="" width="${W}" height="${H}" loading="lazy" decoding="async">` + ws;
  });
  if (added) fs.writeFileSync(idx, html);
  console.log(`\n版本表 ${Object.keys(ver).length} 個實驗；首頁新增縮圖 ${added} 張。` + (bad ? `\n有 ${bad} 張失敗。` : ''));
  process.exit(bad ? 1 : 0);
});
