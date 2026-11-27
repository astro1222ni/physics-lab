#!/usr/bin/env node
/*
 * layout-audit.cjs — 版面自查五條一次量完（11/27 站長在小幫手串選的第 2 名 A2）
 * 取代各串在 scratchpad 各寫一份的 m2／audit1121／audit2／pitch／between／audit.cjs（重開機就不見）。
 * 準則：G:\physics-lab-wt\規劃\主串-紀錄\11-21-全站自查準則.md（站長 11/21：「到底有沒有確實執行跟確認呢？」）
 *
 * 用法：
 *   node tools/layout-audit.cjs                    量所有已上線的實驗（js/missions/index.js 的 LAB_LIVE_MODULES）
 *   node tools/layout-audit.cjs ohms-law,atwood    只量指定的站
 *   選項：--json 檔名（全部數字存檔）、--shots 資料夾（412 深色、844、1280 各存一張，從畫布頂截）、
 *         --all（合格的站也印一行）、--light（預設深色）、--font（另量第 ⑥ 條橫放字高）
 *   結束碼：0 全部合格；1 有不合格；2 參數錯誤。
 *
 * 量什麼、合格標準（數字都可用環境變數改）：
 *   ① 412×780 直放：deadPx ≤ 80（畫布底到操作台頂，扣掉控制項後的死空白）；
 *      firstSliderBottom ≤ 780（畫布頂捲到螢幕頂時，操作台第一根拉桿〔沒有就第一個鍵〕的底在一屏內）。
 *      演算法類（EXEMPT_FIRST）主鍵和畫布同屏即可，不看 firstSliderBottom。
 *   ② reach ≤ 1170：從主畫布頂到最遠「看得到的」操作控制項（同 tools/reach-audit.cjs 的算法；沒選到的分頁不算）。
 *   ③ 844×390 橫放：主畫布高 ≤ 390（一屏放得下）、操作台在畫布右邊、畫布寬 ≥ 視窗寬 45%（不是郵票）。
 *      畫布縮放倍數 ≥ 0.7（11/27 站長選 A：顯示寬 ÷ 繪圖寬，固定寬繪圖再縮小的畫布字會變小；LA_LAND_SCALE 可調）。
 *   ④ 縮圖：js/thumbs.js 的版本表有這一站。
 *   ⑤ 滑桿間距 ≤ 56：操作台每個分頁逐一點開，量相鄰兩根滑桿的上下距離（中間夾著按鈕、選單、summary 展開標題的那一對不算，11/21 準則：電流天平的「I₁ 反向」）；
 *      412、844、1280 三種寬度都量。
 *   ⑥（加 --font 才量）844×390 橫放時畫布上的字實際顯示高 ≥ 9 px：攔 fillText／strokeText，
 *      字級 × 目前變換倍數 × 畫布顯示寬 ÷ 繪圖寬；每張畫布只算最後一次連續繪製（往回找到超過 50 ms 的空檔就停，最多 0.4 秒；
 *      11/27 數理串：0.4 秒內先畫小字、切成橫放後又整張重畫的頁面，舊的小字已被蓋掉卻被算進去）。
 *   另外三種寬度都查左右捲動（scrollWidth > 視窗寬）。
 * 只用 mock 後端、擋掉所有對外連線，不寫正式資料庫。瀏覽器經 tools/browser.cjs（全機最多 3 組，會自動排隊）。
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const LIM = {
  dead: +(process.env.LA_DEAD || 80), first: +(process.env.LA_FIRST || 780), reach: +(process.env.LA_REACH || 1170),
  pitch: +(process.env.LA_PITCH || 56), landH: +(process.env.LA_LAND_H || 390), landW: +(process.env.LA_LAND_W || 0.45), landScale: +(process.env.LA_LAND_SCALE || 0.7), font: +(process.env.LA_FONT || 9)
};
// 11/21 主串判定：演算法、流程類一直按的是單步／播放主鍵，第一根拉桿只在開頭設一次
const EXEMPT_FIRST = new Set((process.env.LA_EXEMPT_FIRST || 'data-compression,packet-routing,graph-traversal,shortest-path').split(','));

const argv = process.argv.slice(2);
const opt = { light: false, all: false };
let list = null;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--json') opt.json = argv[++i];
  else if (a === '--shots') opt.shots = argv[++i];
  else if (a === '--all') opt.all = true;
  else if (a === '--light') opt.light = true;
  else if (a === '--font') opt.font = true;
  else if (a === '-h' || a === '--help') { console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]); process.exit(0); }
  else if (a.startsWith('--')) { console.error('不認得的參數：' + a); process.exit(2); }
  else list = (list || []).concat(a.split(',').map(s => s.trim().replace(/\.html$/, '')).filter(Boolean));
}
if (!list) {
  const w = {}; new Function('window', fs.readFileSync(path.join(ROOT, 'js/missions/index.js'), 'utf8'))(w);
  list = (w.LAB_LIVE_MODULES || []).slice();
}
const missing = list.filter(m => !fs.existsSync(path.join(ROOT, m + '.html')));
if (missing.length) { console.error('找不到頁面：' + missing.join('、')); process.exit(2); }
const THUMBS = fs.readFileSync(path.join(ROOT, 'js/thumbs.js'), 'utf8');
if (opt.shots) fs.mkdirSync(opt.shots, { recursive: true });

// ── 頁面裡執行的量測（字串，傳給 page.evaluate）──
const PORTRAIT = `(()=>{const Y=e=>e.getBoundingClientRect().top+scrollY;const vis=e=>{if(!e.getClientRects().length)return false;const s=getComputedStyle(e);return s.visibility!=='hidden'&&s.display!=='none'};
const d=document.querySelector('.labdeck');const out={sw:document.documentElement.scrollWidth,vw:innerWidth};
if(d&&vis(d)){const dt=Y(d);const v=c=>c.offsetParent&&c.clientHeight>60;let c=[...document.querySelectorAll('.stage canvas')].filter(v)[0];if(!c||Y(c)>dt)c=[...document.querySelectorAll('canvas')].filter(x=>v(x)&&Y(x)<dt).sort((a,b)=>b.clientWidth*b.clientHeight-a.clientWidth*a.clientHeight)[0];
 if(c){const cb=Y(c)+c.clientHeight,top=Y(c)-8;const iv=[...document.querySelectorAll('button,input,select,canvas,svg,[role=slider]')].filter(e=>e.offsetParent&&!d.contains(e)).map(e=>[Y(e)-6,Y(e)+e.offsetHeight+6]).filter(([a,b])=>b>cb&&a<dt).sort((x,y)=>x[0]-y[0]);let live=0,cur=cb;for(const[a,b]of iv){const s=Math.max(a,cur),e=Math.min(b,dt);if(e>s){live+=e-s;cur=e}}
 const rg=[...d.querySelectorAll('input[type=range]')].filter(x=>x.offsetParent)[0];const ctl=rg||[...d.querySelectorAll('button,select')].filter(x=>x.offsetParent&&!x.closest('.labdeck-tabs'))[0];
 out.canvas=c.id||c.className||'canvas';out.gap=Math.round(dt-cb);out.deadPx=Math.round(Math.max(0,dt-cb-live));out.firstSliderBottom=ctl?Math.round(Y(ctl)+ctl.offsetHeight-top):null}else out.noCanvas=true}else out.noDeck=true;
// reach（同 reach-audit.cjs）
const labs=[...document.querySelectorAll('.lab')].filter(vis);if(labs.length){const big=e=>vis(e)&&e.getBoundingClientRect().width>150&&e.getBoundingClientRect().height>100;
 const skip='.notes, .ms-wrap, .lab-tools, .lp-panel, .lp-strip, footer, .sound-btn, #soundBtn, .lab-num, output, .tablewrap, .readout, [data-deck-anchor]';let far=0,farLab='';
 labs.forEach(l=>{const cv=[...l.querySelectorAll('.stage canvas, .stage svg')].find(big);const top=cv?Y(cv):Y(l);l.querySelectorAll('button, input, select, textarea, [role="slider"], [role="button"]').forEach(e=>{if(!vis(e)||e.closest(skip)||e.type==='hidden')return;if(/下載|複製表格|CSV|Download|Copy table/.test(e.textContent))return;const y=Math.round(Y(e)-top);if(y>far){far=y;farLab=(e.getAttribute('aria-label')||e.textContent||e.id||e.tagName).trim().replace(/\\s+/g,' ').slice(0,20)}})});out.reach=far;out.reachCtl=farLab}
return out})()`;
const LAND = `(()=>{const vis=e=>e&&e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';const c=[...document.querySelectorAll('.stage canvas')].find(x=>x.offsetParent&&x.clientHeight>60)||[...document.querySelectorAll('canvas')].filter(x=>x.offsetParent&&x.clientHeight>60).sort((a,b)=>b.clientWidth*b.clientHeight-a.clientWidth*a.clientHeight)[0];
const out={sw:document.documentElement.scrollWidth,vw:innerWidth};if(!c)return Object.assign(out,{noCanvas:true});const r=c.getBoundingClientRect();out.cw=Math.round(r.width);out.ch=Math.round(r.height);out.canvas=c.id||'canvas';
let sc=9,scId='';[...document.querySelectorAll('.stage canvas')].filter(x=>vis(x)&&x.clientWidth>150&&x.width>0).forEach(x=>{const k=x.getBoundingClientRect().width/(x.width/(devicePixelRatio||1));if(k<sc){sc=k;scId=x.id||'canvas'}});if(sc<9){out.scale=Math.round(sc*100)/100;out.scaleCanvas=scId}
const d=document.querySelector('.labdeck');if(vis(d)){const dr=d.getBoundingClientRect();out.deckRight=dr.left>=r.right-4;out.deckLeft=Math.round(dr.left)}else out.deckRight=null;return out})()`;
const FONT_HOOK = `(()=>{const P=CanvasRenderingContext2D.prototype;const rec=window.__laFont=[];const wrap=n=>{const f=P[n];P[n]=function(t){try{if(t!=null&&String(t).trim()){const m=/(\\d*\\.?\\d+)px/.exec(this.font);if(m){let k=1;try{const T=this.getTransform();k=Math.hypot(T.a,T.b)||1}catch(e){}rec.push([this.canvas,+m[1]*k,performance.now(),String(t).slice(0,12)]);if(rec.length>6000)rec.splice(0,3000)}}}catch(e){}return f.apply(this,arguments)}};wrap('fillText');wrap('strokeText')})()`;
const FONT = `(()=>{const R=window.__laFont||[];const by=new Map();R.forEach(r=>{if(!by.has(r[0]))by.set(r[0],[]);by.get(r[0]).push(r)});let min=99,where='';
by.forEach((a,c)=>{if(!c||!c.isConnected||!c.offsetParent||!c.width||!c.closest('.lab')||c.closest('.labdeck-away'))return;const rc=c.getBoundingClientRect();if(rc.width<60)return;a.sort((x,y)=>x[2]-y[2]);const tmax=a[a.length-1][2];let t0=tmax;for(let i=a.length-1;i>0&&a[i][2]-a[i-1][2]<50&&a[i-1][2]>=tmax-400;i--)t0=a[i-1][2];a.forEach(r=>{if(r[2]<t0)return;const e=r[1]*rc.width/c.width;if(e<min){min=e;where=(c.id||'canvas')+'「'+r[3]+'」'}})});return min<99?{min:Math.round(min*100)/100,where}:null})()`;
const PITCH = `(async()=>{const vis=r=>r.offsetParent&&!r.closest('.labdeck-away,[hidden]')&&getComputedStyle(r).visibility!=='hidden';const root=document.querySelector('.labdeck')||document.querySelector('.panel')||document.body;
const measure=()=>{const rs=[...root.querySelectorAll('input[type=range]')].filter(vis).map(r=>r.getBoundingClientRect()).sort((a,b)=>a.top-b.top);const others=[...root.querySelectorAll('button,select,summary,input:not([type=range]),canvas,textarea')].filter(vis).map(e=>e.getBoundingClientRect());let worst=0;
 for(let i=1;i<rs.length;i++){const a=rs[i-1],b=rs[i];const d=b.top-a.top;if(d<=0||d>=200)continue;if(others.some(o=>o.top>=a.bottom-1&&o.bottom<=b.top+1))continue;if(d>worst)worst=d}return Math.round(worst)};
const tabs=[...document.querySelectorAll('.labdeck-tabs button')].filter(b=>b.offsetParent&&!b.hidden);let best={p:measure(),tab:''};
for(const t of tabs){t.click();await new Promise(r=>setTimeout(r,180));const p=measure();if(p>best.p)best={p,tab:t.textContent.trim().slice(0,12)}}
if(tabs[0]){tabs[0].click();await new Promise(r=>setTimeout(r,100))}return best})()`;

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT)) { r.writeHead(403); r.end(); return; }
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(d); });
});

srv.listen(0, '127.0.0.1', async () => {
  const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const { launch } = require(path.join(ROOT, 'tools', 'browser.cjs'));
  const browser = await launch();
  const mock = fs.readFileSync(path.join(ROOT, 'tools', 'mock-backend.js'), 'utf8');
  const res = [];

  async function open(m, W, H) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, colorScheme: opt.light ? 'light' : 'dark', hasTouch: W < 1000, isMobile: W < 1000 });
    await ctx.addInitScript(() => { try { localStorage.setItem('lab-welcome-v1', 'skip'); } catch (e) {} });
    await ctx.addInitScript(mock);
    if (opt.font && W === 844) await ctx.addInitScript(FONT_HOOK);
    await ctx.route(u => !u.href.startsWith(base), r => r.abort());
    const pg = await ctx.newPage();
    const errs = []; pg.on('pageerror', e => { if (!/about:blank/.test(String(e.stack || ''))) errs.push(String(e.message).slice(0, 80)); });
    const gated = fs.readFileSync(path.join(ROOT, m + '.html'), 'utf8').includes('js/modegate.js');
    await pg.goto(base + m + '.html' + (gated ? '?mode=lab' : ''), { waitUntil: 'load', timeout: 30000 });
    await pg.waitForTimeout(1300);
    return { ctx, pg, errs };
  }
  async function shot(pg, m, tag) {
    if (!opt.shots) return;
    await pg.evaluate(() => { const c = document.querySelector('.stage canvas') || document.querySelector('canvas'); document.documentElement.style.scrollBehavior = 'auto'; if (c) scrollTo(0, c.getBoundingClientRect().top + scrollY - 8); });
    await pg.waitForTimeout(300);
    await pg.screenshot({ path: path.join(opt.shots, m + '-' + tag + '.png') });
  }

  async function one(m) {
    const r = { m, thumb: THUMBS.includes('"' + m + '"') || THUMBS.includes("'" + m + "'"), bad: [] };
    try {
      let s = await open(m, 412, 780);
      r.p = await s.pg.evaluate(PORTRAIT); r.p.pitch = await s.pg.evaluate(PITCH); r.p.errs = s.errs;
      await shot(s.pg, m, '412'); await s.ctx.close();
      s = await open(m, 844, 390);
      r.l = await s.pg.evaluate(LAND); if (opt.font) r.l.font = await s.pg.evaluate(FONT); r.l.pitch = await s.pg.evaluate(PITCH); r.l.errs = s.errs;
      await shot(s.pg, m, '844'); await s.ctx.close();
      s = await open(m, 1280, 800);
      r.d = { sw: await s.pg.evaluate(() => document.documentElement.scrollWidth), vw: 1280, pitch: await s.pg.evaluate(PITCH), errs: s.errs };
      await shot(s.pg, m, '1280'); await s.ctx.close();
    } catch (e) { r.err = String(e.message).slice(0, 120); r.bad.push('無法量：' + r.err); return r; }
    const p = r.p, l = r.l, d = r.d, B = r.bad;
    // ①
    if (p.noDeck) B.push('①沒有分頁操作台（.labdeck）');
    else if (p.noCanvas) B.push('①找不到主畫布');
    else {
      if (p.deadPx > LIM.dead) B.push('①死空白 ' + p.deadPx + ' px（> ' + LIM.dead + '，畫布 ' + p.canvas + '）');
      if (p.firstSliderBottom != null && p.firstSliderBottom > LIM.first && !EXEMPT_FIRST.has(m)) B.push('①第一根拉桿底 ' + p.firstSliderBottom + ' px（> ' + LIM.first + '）');
    }
    // ②
    if (p.reach > LIM.reach) B.push('②最遠控制項 ' + p.reach + ' px（> ' + LIM.reach + '：' + p.reachCtl + '）');
    // ③
    if (l.noCanvas) B.push('③橫放找不到主畫布');
    else {
      if (l.ch > LIM.landH) B.push('③橫放畫布高 ' + l.ch + ' px，一屏放不下');
      if (l.deckRight === false) B.push('③橫放操作台不在畫布右邊');
      if (l.cw < LIM.landW * 844) B.push('③橫放畫布只有 ' + l.cw + '×' + l.ch + '（寬 < ' + Math.round(LIM.landW * 100) + '%，像郵票）');
      if (l.scale != null && l.scale < LIM.landScale) B.push('③橫放畫布 ' + l.scaleCanvas + ' 縮成 ' + l.scale + ' 倍（< ' + LIM.landScale + '，字會變小）');
    }
    // ⑥
    if (opt.font && l.font && l.font.min < LIM.font) B.push('⑥橫放畫布最小字 ' + l.font.min + ' px（< ' + LIM.font + '：' + l.font.where + '）');
    // ④
    if (!r.thumb) B.push('④js/thumbs.js 版本表沒有這站');
    // ⑤
    [['412', p.pitch], ['844', l.pitch], ['1280', d.pitch]].forEach(([w, pt]) => { if (pt && pt.p > LIM.pitch) B.push('⑤' + w + ' 滑桿間距 ' + pt.p + ' px' + (pt.tab ? '（分頁「' + pt.tab + '」）' : '') + '（> ' + LIM.pitch + '）'); });
    // 左右捲動、頁面錯誤
    [['412', p], ['844', l], ['1280', d]].forEach(([w, x]) => { if (x.sw > x.vw + 1) B.push(w + ' 左右捲動（' + x.sw + ' > ' + x.vw + '）'); });
    const errs = [...new Set([].concat(p.errs, l.errs, d.errs))];
    if (errs.length) B.push('頁面錯誤：' + errs.slice(0, 2).join('／'));
    return r;
  }

  const q = list.slice(); const N = Math.min(3, q.length);
  let done = 0;
  await Promise.all(Array.from({ length: N }, async () => {
    while (q.length) {
      const m = q.shift(); const r = await one(m); res.push(r); done++;
      if (r.bad.length) console.log('✗ ' + m + '\n    ' + r.bad.join('\n    '));
      else if (opt.all) console.log('✓ ' + m + '（死空白 ' + r.p.deadPx + '、首拉桿 ' + r.p.firstSliderBottom + '、reach ' + r.p.reach + '、橫放 ' + r.l.cw + '×' + r.l.ch + (r.l.scale != null ? '、' + r.l.scale + ' 倍' : '') + (r.l.font ? '、最小字 ' + r.l.font.min + ' px' : '') + '）');
    }
  }));
  await browser.close(); srv.close();
  if (opt.json) { fs.mkdirSync(path.dirname(path.resolve(opt.json)), { recursive: true }); fs.writeFileSync(opt.json, JSON.stringify(res.sort((a, b) => a.m.localeCompare(b.m)), null, 1)); }
  const bad = res.filter(r => r.bad.length);
  console.log('\n量了 ' + res.length + ' 站，不合格 ' + bad.length + ' 站' + (bad.length ? '：' + bad.map(r => r.m).join('、') : '') + (opt.json ? '。數字在 ' + opt.json : '') + (opt.shots ? '。截圖在 ' + opt.shots + '（請親自看）' : ''));
  process.exit(bad.length ? 1 : 0);
});
