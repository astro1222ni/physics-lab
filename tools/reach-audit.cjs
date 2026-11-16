// 手機操作距離稽核：412×780，從主畫布頂到最遠「看得到的」操作控制項有多遠
// 站長 11/16：「手機頁面的這種『在單一頁或者是鄰近頁就可以操作完整』的這個原則……必須所有的實驗室都要做這樣的優化設定。」
// 標準：≤ 1170 px（約一頁半）。分頁操作台（js/labdeck.js）裡沒選到的分頁不算距離（點一下分頁就到）。下載、複製表格不算操作。
// 用法：node tools/reach-audit.cjs [輸出.json] [代號,代號…]；環境變數 W、H 改尺寸，SHOTS=資料夾 另存畫布＋操作台截圖。
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), OUT = process.argv[2] || path.join(ROOT, '.shots', 'reach-audit.json');
const W = +(process.env.W || 412), H = +(process.env.H || 780);
global.window = {};
eval(fs.readFileSync(ROOT + '/js/missions/index.js', 'utf8').replace(/\bconst\b/g, 'var'));
let mods = (typeof LAB_LIVE_MODULES !== 'undefined' ? LAB_LIVE_MODULES : window.LAB_LIVE_MODULES).slice();
if (process.argv[3]) mods = process.argv[3].split(',');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); }).listen(0, async () => {
  const { launch } = require(path.join(ROOT, 'tools', 'browser.cjs')); const b = await launch();
  const mock = fs.readFileSync(path.join(ROOT, 'tools', 'mock-backend.js'), 'utf8');
  const res = [];
  const one = async (m) => {
    const ctx = await b.newContext({ viewport: { width: W, height: H }, colorScheme: 'dark', hasTouch: W < 768, isMobile: W < 768 });
    await ctx.addInitScript(() => { try { localStorage.setItem('lab-welcome-v1', '1'); } catch (e) {} });
    await ctx.addInitScript(mock);
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    const pg = await ctx.newPage();
    try {
      // 有模式入口（js/modegate.js）的頁面量實驗模式；入口畫面底下的範例鈕等在實驗模式根本不會出現
      const gated = fs.readFileSync(path.join(ROOT, m + '.html'), 'utf8').includes('js/modegate.js');
      await pg.goto('http://127.0.0.1:' + srv.address().port + '/' + m + '.html' + (gated ? '?mode=lab' : ''), { waitUntil: 'load', timeout: 30000 }); await pg.waitForTimeout(1200);
      const r = await pg.evaluate(() => {
        const vis = e => { if (!e.getClientRects().length) return false; const s = getComputedStyle(e); return s.visibility !== 'hidden' && s.display !== 'none'; };
        const Y = e => e.getBoundingClientRect().top + scrollY;
        const labs = [...document.querySelectorAll('.lab')].filter(vis);
        if (!labs.length) return { err: 'no .lab' };
        const big = e => vis(e) && e.getBoundingClientRect().width > 150 && e.getBoundingClientRect().height > 100;
        const skip = '.notes, .ms-wrap, .lab-tools, .lp-panel, .lp-strip, footer, .sound-btn, #soundBtn, .lab-num, output, .tablewrap, .readout, [data-deck-anchor]';
        // 每一段實驗（每個 .lab）各自量：從這一段的主畫布頂（沒有畫布就用這一段的頂）到這一段最遠的控制項
        const ctl = []; let top0 = null;
        labs.forEach((l, li) => {
          const cv = [...l.querySelectorAll('.stage canvas, .stage svg')].find(big);
          const top = cv ? Y(cv) : Y(l); if (li === 0) top0 = top;
          l.querySelectorAll('button, input, select, textarea, [role="slider"], [role="button"]').forEach(e => {
            if (!vis(e) || e.closest(skip)) return; if (e.type === 'hidden') return; if (/下載|複製表格|CSV|Download|Copy table/.test(e.textContent)) return;
            const lab = (e.getAttribute('aria-label') || e.textContent || (e.labels && e.labels[0] && e.labels[0].textContent) || e.id || e.tagName).trim().replace(/\s+/g, ' ').slice(0, 24);
            const card = e.closest('.card, section, .stage'); const h2 = card && card.querySelector('h2, h3');
            ctl.push({ y: Math.round(Y(e) - top), lab, card: (labs.length > 1 ? '第' + (li + 1) + '段 ' : '') + (h2 ? h2.textContent.trim().slice(0, 16) : '') });
          });
        });
        const top = top0;
        ctl.sort((a, b) => b.y - a.y);
        return { top: Math.round(top), n: ctl.length, far: ctl.length ? ctl[0].y : 0, worst: ctl.slice(0, 4), over: ctl.filter(c => c.y > 1170).length, deck: !!document.querySelector('.labdeck'), sw: document.documentElement.scrollWidth };
      });
      if (process.env.SHOTS && !r.err) {
        const dk = await pg.evaluate(() => { const d = document.querySelector('.labdeck'); if (!d || d.hidden) return null; const b = d.getBoundingClientRect(); return { b: Math.round(b.bottom + scrollY), tabs: [...d.querySelectorAll('.labdeck-tabs button')].filter(x => !x.hidden).map(x => x.textContent) }; });
        r.tabs = dk ? dk.tabs : null; r.deckBottom = dk ? dk.b - r.top : null;
        const y0 = Math.max(0, r.top - 8), hh = Math.max(200, Math.min(1500, (dk ? dk.b : r.top + 900) - y0 + 12));
        await pg.screenshot({ path: process.env.SHOTS + '/' + m + '.png', clip: { x: 0, y: y0, width: W, height: hh }, fullPage: true });
      }
      res.push(Object.assign({ m }, r));
      console.log(m, r.err || ('最遠 ' + r.far + ' px、超過一頁半 ' + r.over + '/' + r.n));
    } catch (e) { res.push({ m, err: String(e.message).slice(0, 100) }); console.log(m, '錯誤', String(e.message).slice(0, 80)); }
    await ctx.close();
  };
  const q = mods.slice(); const N = 3;
  await Promise.all(Array.from({ length: N }, async () => { while (q.length) await one(q.shift()); }));
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
  const over = res.filter(x => !x.err && x.far > 1170).sort((a, b) => b.far - a.far);
  console.log('\n超過一頁半（> 1170 px）：' + over.length + ' / ' + res.length);
  over.forEach(x => console.log('  ' + x.m + ' ' + x.far + ' px：' + x.worst.slice(0, 2).map(w => (w.card ? w.card + '／' : '') + w.lab).join('；')));
  await b.close(); srv.close(); process.exit(0);
});
