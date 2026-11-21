/* 首頁與科目頁的本機驗收工具；永遠載入假後端，所有外連一律中止。 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const { ROOT, subjects } = require('./home-data.cjs');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
async function server() {
  const srv = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://local').pathname);
    if (p.startsWith('/__stats/')) {
      let value = null;
      if (p === '/__stats/clock.json') value = Date.now();
      else if (p === '/__stats/stats.json') value = Object.fromEntries(require('./home-data.cjs').W.LAB_LIVE_MODULES.map((s, i) => [s, { views: 1000 + i * 12, ops: 3200 + i * 20, seconds: 8600 + i * 120 }]));
      else if (p.includes('/stats/')) value = { views: 1240, ops: 3800, seconds: 9600 };
      else if (p.includes('/online/')) value = req.method === 'GET' ? 7 : {};
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); return;
    }
    const f = path.resolve(ROOT, '.' + (p === '/' ? '/index.html' : p));
    if (!f.startsWith(ROOT + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', TYPES[path.extname(f)] || 'application/octet-stream'); fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  return { srv, base: 'http://127.0.0.1:' + srv.address().port + '/' };
}
async function context(browser, base, opts = {}) {
  const o = Object.assign({ w: 390, h: 844, lang: 'zh-Hant', theme: 'light', fs: 1, state: 'guest' }, opts);
  const ctx = await browser.newContext({ viewport: { width: o.w, height: o.h }, colorScheme: o.theme, hasTouch: o.w < 720, reducedMotion: 'reduce', javaScriptEnabled: o.js !== false });
  await ctx.route(u => !u.href.startsWith(base), r => r.abort());
  await ctx.addInitScript({ path: path.join(ROOT, 'tools/mock-backend.js') });
  // 狀態先寫入，再由下一頁的 mock-backend 載入；每個 context 都是全新的儲存空間。
  await ctx.addInitScript(o => {
    if (location.protocol !== 'http:') return;
    if (!sessionStorage.getItem('home-fixture')) {
      sessionStorage.setItem('home-fixture', '1');
      localStorage.setItem('lab-settings', JSON.stringify({ lang: o.lang, theme: o.theme, fs: o.fs }));
      localStorage.setItem('lab-welcome-v1', 'skip');
      const uid = o.state === 'admin' ? 'admin1' : 'u1', now = Date.now();
      const mdb = { profiles: { u1: { nickname: 'Explorer 07', pub: false }, admin1: { nickname: 'Astro Ni', pub: false } }, scores: {}, completions: {}, daily: {}, bag: {}, missionDefs: {}, admins: { admin1: true } };
      mdb.scores[uid] = { stars: 136, s: { phy: 108, math: 28 } };
      mdb.bag[uid] = { cu: 18, ag: 7, au: 3, dia: 1, key: 0, used: { cu: 5, ag: 2, au: 1 } };
      mdb.completions[uid] = { 'projectile-1': { stars: 1 }, 'projectile-2': { stars: 2 }, 'projectile-3': { stars: 3 } };
      mdb.daily[uid] = { d: Math.floor((now + 8 * 3600000) / 86400000), n: 4, done: { a: true, b: true, c: true, d: true }, picks: [], at: now };
      localStorage.setItem('mdb', JSON.stringify(mdb)); localStorage.setItem('mocknext', uid);
      if (o.state === 'member' || o.state === 'admin') localStorage.setItem('mockuser', uid);
      localStorage.setItem('labHomeSignedIn', ['member','admin'].includes(o.state) ? '1' : '0');
      if (!o.noHistory && ['member', 'admin', 'history'].includes(o.state)) localStorage.setItem('labHist', JSON.stringify({ projectile: { v: 8, s: 1200, o: 22, t: now }, 'newton-second': { v: 5, s: 600, o: 15, t: now - 86400000 }, 'incline-friction': { v: 2, s: 300, o: 6, t: now - 172800000 } }));
      localStorage.setItem('labRank:' + uid, JSON.stringify({ rank: 12, at: now - 172800000 }));
    }
    window.LAB_STATS_DB = location.origin + '/__stats';
    window.__homeReads = []; window.__privilegeReads = []; window.__statsReads = [];
    // addInitScript 的執行順序由瀏覽器決定，用短微任務等假後端就緒。
    function bind() {
      if (!window.LAB_MISSIONS_BACKEND) { setTimeout(bind, 0); return; }
      const m = window.LAB_MISSIONS_BACKEND, c = window.LAB_COMMENTS_BACKEND, get = m.get.bind(m), admin = c.isAdmin.bind(c);
      m.get = p => { window.__homeReads.push(p); if (o.failHome && p.startsWith('scores/')) return Promise.reject(new Error('test offline')); return get(p); };
      c.isAdmin = uid => { window.__privilegeReads.push('admins/' + uid); return admin(uid); };
      // Fixture 必須在 mock 初始化前生效；重新用它自己的登入 API 同步記憶體身分。
      if ((o.state === 'member' || o.state === 'admin') && localStorage.getItem('mockuser')) m.signIn();
    }
    bind();
    const f = window.fetch.bind(window);
    window.fetch = (url, init) => { if (String(url).includes('/__stats/') && (!init || !init.method || init.method === 'GET')) window.__statsReads.push(String(url)); return f(url, init); };
    const sample = () => { const s=document.querySelector('.my-status'),d=document.querySelector('.daily-banner');if(s)window.__statusHeightBefore=s.getBoundingClientRect().height;if(d)window.__dailyHeightBefore=d.getBoundingClientRect().height; };
    let queued=false;
    const baseline=new MutationObserver(()=>{if(!queued&&document.querySelector('.status-skeleton .status-main')){queued=true;requestAnimationFrame(sample);baseline.disconnect();}});baseline.observe(document,{childList:true,subtree:true});
    document.addEventListener('DOMContentLoaded',()=>{if(!queued){queued=true;requestAnimationFrame(sample);baseline.disconnect();}});
  }, o);
  return ctx;
}
async function ready(page, slug) {
  // 11/21 首頁只留入口＋最新上架十個（實驗與物理自習室混排）；科目大分類在 labs.html
  if (slug === 'index') await page.waitForFunction(() => document.querySelectorAll('#latest-labs .entry-card').length === 10 && document.querySelector('#home-status')?.getAttribute('aria-busy') === 'false' && Number.isFinite(window.__statusHeightBefore) && Number.isFinite(window.__dailyHeightBefore));
  else if (slug === 'labs') await page.waitForFunction(() => document.querySelectorAll('.subject-groups .subject-card').length > 0);
  else await page.waitForFunction(() => document.querySelector('.subject-count')?.textContent.length > 0);
  await page.evaluate(() => document.fonts.ready);
}
async function inspect(page) {
  return page.evaluate(() => {
    const sw = document.documentElement.scrollWidth, vw = innerWidth;
    const smallText=[]; let mutedContrast=null;
    if(document.body.classList.contains('home-page')||document.body.classList.contains('labs-page')) {
      const fs=+getComputedStyle(document.documentElement).getPropertyValue('--fs')||1,walk=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
      for(let n;(n=walk.nextNode());){const e=n.parentElement;if(!n.textContent.trim()||e.closest('svg,script,style,.lab-settings,.lab-set-panel,.lab-gear,[aria-hidden="true"]')||!e.getClientRects().length)continue;const s=getComputedStyle(e);if(s.visibility!=='hidden'&&parseFloat(s.fontSize)+.05<12*fs)smallText.push({text:n.textContent.trim().slice(0,40),px:s.fontSize});}
      const rgb=s=>(s.match(/[\d.]+/g)||[]).slice(0,3).map(Number),lum=c=>c.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0),contrast=(a,b)=>{const x=lum(a),y=lum(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
      if(document.querySelector('.subject-branches')){const fg=rgb(getComputedStyle(document.querySelector('.subject-branches')).color),dark=getComputedStyle(document.body).backgroundColor==='rgb(15, 21, 23)',faces=dark?[[37,44,53],[26,31,38]]:[[255,255,255],[241,244,247]];
      const ratios=[];document.querySelectorAll('.subject-card').forEach(e=>{const wash=getComputedStyle(e).getPropertyValue('--key-wash').match(/[\d.]+/g).map(Number);for(const f of faces){ratios.push(contrast(fg,f),contrast(fg,f.map((n,i)=>n*(1-wash[3])+wash[i]*wash[3])));}});mutedContrast=Math.min(...ratios);}
    }
    const cards = [...document.querySelectorAll('.subject-card')].map(a => { const r = a.getBoundingClientRect(), h = getComputedStyle(a.querySelector('h3')); return { w: r.width, h: r.height, font: h.fontSize, y: r.top, bottom: r.bottom, href: a.getAttribute('href') }; });
    const cjk = []; if (document.documentElement.lang === 'en') { const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); for (let n; (n = walker.nextNode());) if (/[一-鿿]/.test(n.textContent) && !n.parentElement.closest('script,style,.lab-settings,.lab-set-panel,.lab-gear,body [lang^="zh"]')) cjk.push(n.textContent.slice(0, 50)); }
    return { sw, vw, cards, cjk, smallText, mutedContrast, account: window.__homeReads || [], privilege: window.__privilegeReads || [], stats: window.__statsReads || [], statusHeight: document.querySelector('.my-status')?.getBoundingClientRect().height, beforeHeight: window.__statusHeightBefore, dailyHeight:document.querySelector('.daily-banner')?.getBoundingClientRect().height,beforeDailyHeight:window.__dailyHeightBefore, recs: [...document.querySelectorAll('#recommendations .entry-card')].map(a => a.getAttribute('href')), current: document.querySelector('.subject-switch [aria-current]')?.getAttribute('href'), textbookHidden: document.querySelector('.textbook-control')?.hidden };
  });
}
async function primeImages(page) {
  const before = await page.locator('img.module-thumb').evaluateAll(imgs => imgs.filter(i => !i.complete || !i.naturalWidth).length);
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for(let y=0;y<height;y+=Math.max(250,Math.floor(page.viewportSize().height*.8))) { await page.evaluate(y=>scrollTo(0,y),y); await page.waitForTimeout(300); }
  await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight)); await page.waitForTimeout(300);
  const images=await page.locator('img.module-thumb').evaluateAll(async imgs=>{await Promise.all(imgs.map(i=>i.decode().catch(()=>{})));return imgs.map(i=>({slug:i.dataset.thumb,loaded:i.complete&&i.naturalWidth>0,source:i.getAttribute('src')}));});
  await page.evaluate(()=>scrollTo(0,0)); await page.waitForTimeout(50);
  if(images.some(i=>!i.loaded))throw new Error('捲動解碼後仍有空白縮圖：'+images.filter(i=>!i.loaded).map(i=>i.slug).join(','));
  return {before,afterMissing:0,images};
}
module.exports = { server, context, ready, inspect, primeImages, subjects };
