/* 任務可達成的證明腳本（四季與太陽軌跡）。用法：node tools/mission-proofs/seasons.js
 * 修改物理核心或任務條件後重跑，確認每個任務仍然做得到、預設狀態與自動播放不會觸發任務。
 * 做法：只用物理核心 js/seasons-core.js，照頁面 js/seasons.js 的 eventData() 組事件資料
 * （snapshot ＋ loc、season、realTilt、mode、playing），丟進 js/missions/seasons.js 的檢查函式。
 * 頁面的輸入範圍：緯度 −90～90（滑桿間隔 0.01，打字 2 位）；日期 1–365（整數）；時刻 0–24 h（滑桿 0.05，打字 3 位）；
 * 傾角 0–90°（0.01，打字 2 位）；地點按鈕（臺北、臺中、臺南、恆春、嘉義、花蓮、赤道、雪梨、特羅姆瑟、北極點、南極點）；
 * 「正午／日出／日落」按鈕直接把時刻設成計算出的時刻；「一天」播放每格前進 dt × 速度（預設 1.5 h/s）。
 * 頁面只在使用者動手（st.user）之後才回報事件：載入時的自動播放 user = false、userPlay = false，什麼都不回報。 */
'use strict';
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const C = require(__ROOT + 'js/seasons-core.js');
const missions = [];
global.window = { SeasonsCore: C, LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(__ROOT + 'js/missions/seasons.js');

const LOCS = {
  taipei: [25.03, 121.56, 8], taichung: [24.15, 120.68, 8], tainan: [22.99, 120.2, 8], hengchun: [22.0, 120.75, 8],
  chiayi: [23.44, 120.42, 8], hualien: [23.44, 121.51, 8], equator: [0, 109.33, 7], sydney: [-33.87, 151.21, 10],
  tromso: [69.65, 18.96, 1], npole: [90, 0, 0], spole: [-90, 0, 0]
};
const S = C.seasons();
const REAL = 23.44;
function seasonDay(k, zone) { return C.localOf(S[k], zone).day; }
function seasonOf(day, zone) { for (const k of ['mar', 'jun', 'sep', 'dec']) if (seasonDay(k, zone) === day) return k; return null; }
/** 頁面的狀態 → 事件資料（與 js/seasons.js 的 eventData() 相同） */
function data(p) {
  const L = LOCS[p.loc] || null;
  const o = {
    lat: p.lat != null ? p.lat : L[0], lon: p.lon != null ? p.lon : (L ? L[1] : 121.56), zone: p.zone != null ? p.zone : (L ? L[2] : 8),
    day: p.day, clock: p.clock, eps: p.eps == null ? REAL : p.eps, refract: p.refract !== false, atmos: !!p.atmos
  };
  const s = C.snapshot(o);
  return Object.assign({}, s, {
    loc: L && (p.lat == null || p.lat === L[0]) ? p.loc : 'custom', season: seasonOf(o.day, o.zone), realTilt: Math.abs(o.eps - REAL) < 0.005,
    mode: p.mode || 'day', playing: !!p.playing
  }, p.extra || {});
}
// UI 精度
const onGrid = (v, step, min) => Math.abs(Math.round((v - min) / step) * step + min - v) < 1e-9;
const dec = (v, n) => Math.abs(Math.round(v * Math.pow(10, n)) / Math.pow(10, n) - v) < 1e-9;
function uiOK(p) {
  if (p.lat != null && !(p.lat >= -90 && p.lat <= 90 && dec(p.lat, 2))) return 'lat';
  if (!(Number.isInteger(p.day) && p.day >= 1 && p.day <= 365)) return 'day';
  if (!(p.clock >= 0 && p.clock < 24 && (dec(p.clock, 3) || p.button))) return 'clock';
  if (p.eps != null && !(p.eps >= 0 && p.eps <= 90 && dec(p.eps, 2))) return 'eps';
  return null;
}
const r3 = x => Math.round(x * 1000) / 1000;
const hm = h => { const m = Math.round(h * 60); return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
const date = n => { const d = C.dateOfDay(n); return d.m + '/' + d.d; };

function byId(id) { return missions.find(m => m.id === id); }
function passes(id, type, d) { const m = byId(id); return !!m.check({ type: type, data: d }, {}); }
let fail = 0;
const proofs = [];
function prove(id, how, type, p) {
  const bad = uiOK(p);
  const d = data(p);
  const ok = !bad && passes(id, type, d);
  if (!ok) { fail++; console.log('✗ ' + id + '：' + how + (bad ? '（輸入超出範圍：' + bad + '）' : '')); }
  else { proofs.push(id); console.log('✓ ' + id + '（' + byId(id).level + ' 級）：' + how); }
  return d;
}

// ---------- 1. 看日出：按播放，一天模式由 09:30 往後跑，跨過 h0 的那一格回報 'sunrise' ----------
(function () {
  const dt = 1 / 60, rate = 1.5; // 預設速度第 5 級：1.5 h/s
  let c = 9.5, prev = null, found = null;
  for (let i = 0; i < 24 / (dt * rate) + 10 && !found; i++) {
    c += dt * rate; if (c >= 24) c -= 24;
    const d = data({ loc: 'taipei', day: 172, clock: c, playing: true, button: true });
    if (prev != null && prev <= C.H0_REFRACT && d.alt > C.H0_REFRACT) found = d;
    prev = d.alt;
  }
  if (found && passes('seasons-1', 'sunrise', found)) { proofs.push('seasons-1'); console.log('✓ seasons-1（1 級）：臺北預設，按「播放」，播到 ' + hm(found.clock) + ' 太陽升起'); }
  else { fail++; console.log('✗ seasons-1'); }
})();

// ---------- 2. 影子指向正北：臺北 6/21 按「正午」 ----------
(function () {
  const noon = C.transit({ lat: 25.03, lon: 121.56, zone: 8, day: 172, eps: REAL }).clock;
  const d = prove('seasons-2', '臺北 6/21 按「正午」（' + hm(noon) + '），影子方位 ' + d2(data({ loc: 'taipei', day: 172, clock: noon }).shadowAz), 'state', { loc: 'taipei', day: 172, clock: noon, button: true });
  prove('seasons-2', '（打字）臺北 6/21 時刻 ' + r3(noon), 'state', { loc: 'taipei', day: 172, clock: r3(noon) });
})();
function d2(x) { return x == null ? '—' : x.toFixed(2) + '°'; }

// ---------- 3. 臺北冬至的長影 ----------
(function () {
  const day = seasonDay('dec', 8);
  const noon = C.transit({ lat: 25.03, lon: 121.56, zone: 8, day: day, eps: REAL }).clock;
  prove('seasons-3', '臺北，按「冬至」（' + date(day) + '）再按「正午」（' + hm(noon) + '），影長 ' + data({ loc: 'taipei', day: day, clock: noon }).ratio.toFixed(3) + ' 倍竿長', 'state', { loc: 'taipei', day: day, clock: noon, button: true });
  prove('seasons-3', '（滑桿）同一天時刻 11.90（11:54）', 'state', { loc: 'taipei', day: day, clock: 11.9 });
  // 正午影長確實是一年最長
  let best = 0, bd = 0;
  for (let n = 1; n <= 365; n++) { const t = C.transit({ lat: 25.03, lon: 121.56, zone: 8, day: n, eps: REAL }); const r = 1 / Math.tan(t.alt * Math.PI / 180); if (r > best) { best = r; bd = n; } }
  console.log('   （一年中臺北正午影長最長的是 ' + date(bd) + '，' + best.toFixed(3) + ' 倍竿長）');
})();

// ---------- 4. 永晝：特羅姆瑟 6/21（或北極點） ----------
prove('seasons-4', '按「特羅姆瑟」、「夏至」', 'state', { loc: 'tromso', day: 172, clock: 12 });
prove('seasons-4', '按「北極點」、「夏至」', 'state', { loc: 'npole', day: 172, clock: 12 });

// ---------- 5. 影長 = 竿長：臺北 6/21 上午找 h = 45° ----------
(function () {
  let best = null;
  for (let c = 6; c < 12; c += 0.001) { const cc = r3(c); const d = data({ loc: 'taipei', day: 172, clock: cc }); if (d.alt > 0 && (!best || Math.abs(d.ratio - 1) < Math.abs(best.ratio - 1))) best = d; }
  prove('seasons-5', '臺北 6/21 時刻打 ' + best.clock + '（' + hm(best.clock) + '），h = ' + best.alt.toFixed(3) + '°，影長 ' + best.ratio.toFixed(4) + ' 倍', 'state', { loc: 'taipei', day: 172, clock: best.clock });
  // 滑桿（0.05 h = 3 分）也做得到嗎？
  let sl = null;
  for (let c = 6; c < 12; c += 0.05) { const cc = Math.round(c * 20) / 20; const d = data({ loc: 'taipei', day: 172, clock: cc }); if (Math.abs(d.ratio - 1) <= 0.005) { sl = cc; break; } }
  console.log('   （只用滑桿：' + (sl == null ? '這一天剛好沒有，需要打字或換日期' : '時刻 ' + sl + ' 就可以') + '）');
})();

// ---------- 6. 夏至的天頂：嘉義或花蓮（北回歸線）按「正午」 ----------
(function () {
  for (const loc of ['chiayi', 'hualien']) {
    const L = LOCS[loc];
    const noon = C.transit({ lat: L[0], lon: L[1], zone: 8, day: 172, eps: REAL }).clock;
    prove('seasons-6', '按「' + (loc === 'chiayi' ? '嘉義' : '花蓮') + '」、「夏至」、「正午」：影長 ' + data({ loc: loc, day: 172, clock: noon }).ratio.toExponential(2) + ' 倍竿長', 'state', { loc: loc, day: 172, clock: noon, button: true });
  }
  // 臺北做不到（不在北回歸線上）
  const tn = C.transit({ lat: 25.03, lon: 121.56, zone: 8, day: 172, eps: REAL }).clock;
  if (passes('seasons-6', 'state', data({ loc: 'taipei', day: 172, clock: tn }))) { fail++; console.log('✗ seasons-6 臺北不應該成功'); }
})();

// ---------- 7. 南半球的影子：雪梨 12 月冬至按「正午」 ----------
(function () {
  const day = seasonDay('dec', 10);
  const noon = C.transit({ lat: -33.87, lon: 151.21, zone: 10, day: day, eps: REAL }).clock;
  const d = data({ loc: 'sydney', day: day, clock: noon });
  prove('seasons-7', '按「雪梨」、「冬至」（' + date(day) + '）、「正午」（' + hm(noon) + '）：影子方位 ' + d2(d.shadowAz) + '、h = ' + d.alt.toFixed(2) + '°（太陽在北方）', 'state', { loc: 'sydney', day: day, clock: noon, button: true });
})();

// ---------- 8. 真正的晝夜等長：臺北，計入折射 ----------
(function () {
  const hits = [];
  for (let n = 1; n <= 365; n++) { const d = data({ loc: 'taipei', day: n, clock: 12 }); if (Math.abs(d.dayLen - 12) <= 1 / 60) hits.push(n); }
  if (!hits.length) { fail++; console.log('✗ seasons-8：找不到'); return; }
  hits.forEach(n => prove('seasons-8', '臺北 ' + date(n) + '：晝長 ' + (data({ loc: 'taipei', day: n, clock: 12 }).dayLen * 60 - 720).toFixed(2) + ' 分鐘偏差', 'state', { loc: 'taipei', day: n, clock: 12 }));
  const eq = data({ loc: 'taipei', day: seasonDay('mar', 8), clock: 12 });
  console.log('   （春分 ' + date(seasonDay('mar', 8)) + ' 晝長 12 h ' + ((eq.dayLen - 12) * 60).toFixed(1) + ' 分，不算）');
  if (passes('seasons-8', 'state', eq)) { fail++; console.log('✗ seasons-8 春分不應該成功'); }
})();

// ---------- 9. 夏至日照冠軍：不計大氣，北極點（或北緯 76° 以上） ----------
(function () {
  const d = prove('seasons-9', '按「北極點」、「夏至」：Q = ' + data({ loc: 'npole', day: 172, clock: 12 }).Q.toFixed(2) + ' MJ/m²，赤道 ' + data({ loc: 'npole', day: 172, clock: 12 }).Qeq.toFixed(2), 'state', { loc: 'npole', day: 172, clock: 12 });
  let lo = null;
  for (let lat = 60; lat <= 90; lat = Math.round((lat + 0.01) * 100) / 100) { if (passes('seasons-9', 'state', data({ loc: 'custom', lat: lat, lon: 121.56, zone: 8, day: 172, clock: 12 }))) { lo = lat; break; } }
  console.log('   （臺灣時區的夏至，北緯 ' + lo + '° 以上就達成；特羅姆瑟 Q/Q赤道 = ' + (data({ loc: 'tromso', day: 172, clock: 12 }).Q / data({ loc: 'tromso', day: 172, clock: 12 }).Qeq).toFixed(3) + '，不夠）');
  if (passes('seasons-9', 'state', data({ loc: 'tromso', day: 172, clock: 12 }))) console.log('   （注意：特羅姆瑟也可以）');
  if (passes('seasons-9', 'state', data({ loc: 'npole', day: 172, clock: 12, atmos: true }))) { fail++; console.log('✗ seasons-9 計入大氣時不應成功'); }
})();

// ---------- 10. 東北方的日出：高緯度 ----------
(function () {
  let sol = null;
  // 在特羅姆瑟的經度與時區，夏至那天調緯度
  for (let lat = 50; lat <= 66 && !sol; lat = Math.round((lat + 0.01) * 100) / 100) {
    const d = data({ loc: 'custom', lat: lat, lon: 18.96, zone: 1, day: 172, clock: 12 });
    if (passes('seasons-10', 'state', d)) sol = { lat: lat, d: d };
  }
  if (!sol) { fail++; console.log('✗ seasons-10'); }
  else prove('seasons-10', '先按「特羅姆瑟」、「夏至」，緯度打 ' + sol.lat + '：日出方位 ' + sol.d.riseAz.toFixed(3) + '°', 'state', { loc: 'custom', lat: sol.lat, lon: 18.96, zone: 1, day: 172, clock: 12 });
  // 特羅姆瑟本身：找日期
  const days = [];
  for (let n = 1; n <= 365; n++) if (passes('seasons-10', 'state', data({ loc: 'tromso', day: n, clock: 12 }))) days.push(date(n));
  console.log('   （特羅姆瑟不改緯度的日子：' + (days.join('、') || '沒有，須微調緯度') + '）');
  // 臺灣做不到
  let tw = 0;
  for (let n = 1; n <= 365; n++) tw = Math.max(tw, 90 - data({ loc: 'taipei', day: n, clock: 12 }).riseAz);
  console.log('   （臺北日出最北只到方位 ' + (90 - tw).toFixed(1) + '°，做不到）');
})();

// ---------- 11. 傾倒的地軸：臺北夏至，傾角 64.2°～66° ----------
(function () {
  let min = null;
  for (let e = 60; e <= 70; e = Math.round((e + 0.01) * 100) / 100) { if (data({ loc: 'taipei', day: 172, clock: 12, eps: e }).polar === 'day') { min = e; break; } }
  prove('seasons-11', '臺北、「夏至」，傾角打 65：永晝（最小需要 ' + min + '°；不計折射要 ' + minNoRef() + '°）', 'state', { loc: 'taipei', day: 172, clock: 12, eps: 65 });
  if (passes('seasons-11', 'state', data({ loc: 'taipei', day: 172, clock: 12, eps: 70 }))) { fail++; console.log('✗ seasons-11 70° 不應成功'); }
  function minNoRef() { for (let e = 60; e <= 70; e = Math.round((e + 0.01) * 100) / 100) if (data({ loc: 'taipei', day: 172, clock: 12, eps: e, refract: false }).polar === 'day') return e; return null; }
})();

// ---------- 12. 大師：臺北、影長 = 竿長、影子指向東北 ----------
(function () {
  const sols = [];
  for (let n = 1; n <= 365; n++) {
    // 粗掃下午
    let best = null;
    for (let c = 12; c < 18; c += 0.01) {
      const d = data({ loc: 'taipei', day: n, clock: r3(c) });
      if (d.alt <= 0) continue;
      const err = Math.abs(d.ratio - 1) / 0.01 + Math.abs(((d.shadowAz - 45 + 540) % 360) - 180);
      if (!best || err < best.err) best = { c: r3(c), err: err };
    }
    if (best && best.err < 3) {
      for (let c = best.c - 0.02; c <= best.c + 0.02; c += 0.001) {
        const cc = r3(c);
        const d = data({ loc: 'taipei', day: n, clock: cc });
        if (passes('seasons-12', 'state', d)) { sols.push({ n: n, c: cc, d: d }); break; }
      }
    }
  }
  if (!sols.length) { fail++; console.log('✗ seasons-12'); return; }
  const s0 = sols[0];
  prove('seasons-12', '臺北 ' + date(s0.n) + ' 時刻打 ' + s0.c + '（' + hm(s0.c) + '）：影長 ' + s0.d.ratio.toFixed(4) + ' 倍、方位 ' + s0.d.shadowAz.toFixed(2) + '°', 'state', { loc: 'taipei', day: s0.n, clock: s0.c });
  console.log('   （可行的日子：' + sols.map(s => date(s.n) + ' ' + hm(s.c)).join('、') + '）');
})();

// ---------- h1. 8 字形：「一年」模式從 12:00 播放一整年 ----------
(function () {
  const dt = 1 / 60, rate = 18; // 預設速度：18 天／秒
  let dayF = 172.001, day = 172;
  const days = {}, pts = [];
  let found = null;
  function rec(n) {
    if (days[n]) return;
    days[n] = true;
    const d = data({ loc: 'taipei', day: n, clock: 12, mode: 'year', playing: true });
    pts.push(d.alt);
    const cnt = Object.keys(days).length, up = pts.filter(a => a > 0).length;
    if (cnt >= 300 && !found) {
      const ev = Object.assign({}, d, { days: cnt, upDays: up });
      if (passes('seasons-h1', 'analemma', ev)) found = ev;
    }
  }
  rec(day);
  for (let i = 0; i < 2 * 365 / (dt * rate) && !found; i++) {
    dayF += dt * rate; if (dayF >= 366) dayF -= 365;
    const n = Math.floor(dayF);
    if (n !== day) { day = n; rec(n); }
  }
  if (found) { proofs.push('seasons-h1'); console.log('✓ seasons-h1（6 級）：臺北，時刻 12:00，選「一年」按播放，約 ' + Math.round(365 * found.days / 365 / rate) + ' 秒後記錄滿 ' + found.days + ' 天'); }
  else { fail++; console.log('✗ seasons-h1'); }
})();

// ---------- h2. 春分那天的直線竿影：臺北春分，從 07:00 播放到 13:00 以後 ----------
(function () {
  const day = seasonDay('mar', 8);
  const pts = {};
  let found = null;
  for (let c = 7; c <= 16 && !found; c += 1 / 60 * 1.5) {
    const m = Math.round(c * 60);
    const d = data({ loc: 'taipei', day: day, clock: c, playing: true });
    if (d.alt <= 0 || pts[m]) continue;
    pts[m] = true;
    const mins = Object.keys(pts).map(Number);
    const ev = Object.assign({}, d, { span: (Math.max.apply(null, mins) - Math.min.apply(null, mins)) / 60, count: mins.length });
    if (passes('seasons-h2', 'trace', ev)) found = ev;
  }
  if (found) { proofs.push('seasons-h2'); console.log('✓ seasons-h2（5 級）：臺北按「春分」（' + date(day) + '），時刻設 07:00 按播放，播到 ' + hm(found.clock) + ' 記錄滿 ' + found.span.toFixed(2) + ' 小時'); }
  else { fail++; console.log('✗ seasons-h2'); }
  // 夏至不算
  const d = Object.assign(data({ loc: 'taipei', day: 172, clock: 15 }), { span: 8, count: 480 });
  if (passes('seasons-h2', 'trace', d)) { fail++; console.log('✗ seasons-h2 夏至不應成功'); }
})();

// ---------- h3. 午夜的太陽：特羅姆瑟夏至播放一天 ----------
(function () {
  const dt = 1 / 60, rate = 1.5;
  let c = 12, prevH = null, found = null;
  for (let i = 0; i < 24 / (dt * rate) + 10 && !found; i++) {
    c += dt * rate; if (c >= 24) c -= 24;
    const d = data({ loc: 'tromso', day: 172, clock: c, playing: true });
    if (prevH != null && prevH > 150 && d.H < -150 && d.alt > 0) found = d;
    prevH = d.H;
  }
  if (found && passes('seasons-h3', 'midnight', found)) { proofs.push('seasons-h3'); console.log('✓ seasons-h3（4 級）：按「特羅姆瑟」、「夏至」再按播放，' + hm(found.clock) + ' 太陽仍在 h = ' + found.alt.toFixed(1) + '°'); }
  else { fail++; console.log('✗ seasons-h3'); }
})();

// ---------- 預設狀態與自動播放不會觸發任務 ----------
(function () {
  // 頁面載入時 st.user = false：不回報任何事件。這裡再檢查：即使把預設狀態（臺北 6/21 09:30、23.44°、折射開、大氣關）
  // 當成事件送出（例如使用者只勾了「文字標示」），也沒有任務成立；自動播放一天的每一格也都不成立（除了 seasons-1 需要使用者按播放）。
  const types = ['state', 'trace', 'sunrise', 'midnight', 'analemma'];
  const base = data({ loc: 'taipei', day: 172, clock: 9.5 });
  let bad = [];
  missions.forEach(m => types.forEach(tp => {
    if (tp === 'sunrise' || tp === 'midnight' || tp === 'analemma') return; // 這些事件只在使用者按播放時才會出現
    if (m.check({ type: tp, data: Object.assign({}, base, { span: 0, count: 1 }) }, {})) bad.push(m.id + '/' + tp);
  }));
  // 預設設定下播放一天：state 事件（playing = true）
  for (let c = 0; c < 24; c += 0.025) {
    const d = data({ loc: 'taipei', day: 172, clock: c, playing: true });
    missions.forEach(m => { if (m.check({ type: 'state', data: d }, {})) bad.push(m.id + '@' + hm(c)); });
  }
  if (bad.length) { fail++; console.log('✗ 預設狀態觸發了：' + Array.from(new Set(bad)).slice(0, 10).join('、')); }
  else console.log('✓ 預設狀態（與按下播放後的每一格 state 事件）不會完成任何任務；自動播放不回報事件');
})();

const all = missions.map(m => m.id);
const missing = all.filter(id => proofs.indexOf(id) < 0);
if (missing.length) { fail++; console.log('✗ 沒有證明：' + missing.join('、')); }
console.log('\n共 ' + missions.length + ' 個任務（隱藏 ' + missions.filter(m => m.hidden).length + ' 個）' + (fail ? '，' + fail + ' 項失敗' : '，全部做得到'));
process.exit(fail ? 1 : 0);
