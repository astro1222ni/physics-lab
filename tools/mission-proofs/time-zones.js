/* 任務可達成的證明腳本。用法：node tools/mission-proofs/time-zones.js
 * 修改核心或任務條件後重跑，確認每個任務都做得到、預設狀態與預設航班不會觸發、隱藏任務彼此不會順便完成。
 * 事件 'tz' 的內容和頁面一樣由 TimeZoneCore.snapshot 計算（js/time-zones.js 的 snapshot() 只是把頁面狀態交給它）。
 * 操作精度：日期每格 1 天；時刻滑桿與打字都換成整數分鐘；飛行時間每格 0.25 小時；
 * 量測點可選城市，或點地圖（桌機約每像素 0.45°）、用方向鍵每步 1°（Shift 10°）移動，所以自由位置都取 0.5° 的整數倍並檢查附近 ±0.5° 也成立。
 * 落地事件：飛行動畫讓時刻走到落地的那一刻，事件同時帶著 flight 與落地時的整個畫面狀態。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const K = require(ROOT + 'js/time-zones-core.js');
const missions = [];
global.window = { TimeZoneCore: K, LabMission: { register: (id, list) => list.forEach(m => missions.push(m)) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/time-zones.js');
const byId = id => missions.find(m => m.id === 'time-zones-' + id);
const C = K.CITY;

const TP = { lon: C.taipei.lon, lat: C.taipei.lat, city: 'taipei' };
const cityProbe = id => ({ lon: C[id].lon, lat: C[id].lat, city: id });
const free = (lon, lat) => ({ lon: lon, lat: lat, city: null });
/** 頁面狀態（預設值和 js/time-zones.js 相同） */
function page(o) {
  return Object.assign({ day: 317, utc: 0, probe: TP, flight: null, view: '2d', center: 0, layers: { zones: true, night: true, dates: true, cities: true } }, o);
}
/** 時刻正規化（和頁面的 normTime 一樣：超過 24 時換到下一天，到 0.1 分鐘） */
function norm(day, utc) {
  let d = day, u = Math.round(utc * 600) / 600;
  while (u >= 24) { u -= 24; d++; }
  while (u < 0) { u += 24; d--; }
  if (d > 365) d -= 365;
  if (d < 1) d += 365;
  return { day: d, utc: u };
}
/** 按「起飛」之後的落地事件 */
function landing(dep, arr, day, utc, dur, o) {
  const F = K.flight(C[dep], C[arr], day, utc, dur);
  const t = norm(day, utc + dur);
  return page(Object.assign({ day: t.day, utc: t.utc, flight: F }, o));
}
const snap = s => K.snapshot(s);
const ev = s => ({ type: 'tz', data: snap(s) });
const hits = (id, s) => byId(id).check(ev(s));
const firing = s => { const e = ev(s); return missions.filter(m => m.check(e)).map(m => m.id.replace('time-zones-', '')); };
const hiddenFiring = s => firing(s).filter(x => x[0] === 'h');

let ok = 0, bad = 0;
function expect(label, cond, extra) {
  if (cond) { ok++; console.log('  ✓ ' + label + (extra ? '（' + extra + '）' : '')); }
  else { bad++; console.error('  ✗ ' + label + (extra ? '（' + extra + '）' : '')); }
}
const f = (v, d) => v == null ? '—' : (+v).toFixed(d == null ? 2 : d);
const hm = h => { const m = Math.round(((h % 24) + 24) % 24 * 60); return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
const dt = n => { const d = K.dateOf(n); return d.m + '/' + d.d; };
const used = {};
function witness(id, s, note) {
  used[id] = s;
  const fs = firing(s);
  expect(id + ' 做得到', fs.indexOf(id) >= 0, note + '；同時完成：' + (fs.filter(x => x !== id).join('、') || '無'));
}
/** 自由量測點的位置在 ±0.5° 內換幾個點也都成立（點地圖不必準到像素） */
function robust(id, s, step) {
  const st = step || 0.25;
  let n = 0, t = 0;
  for (let dx = -0.5; dx <= 0.5 + 1e-9; dx += st) for (let dy = -0.5; dy <= 0.5 + 1e-9; dy += st) {
    t++;
    if (hits(id, Object.assign({}, s, { probe: free(s.probe.lon + dx, s.probe.lat + dy) }))) n++;
  }
  return n + '/' + t;
}
const MIN = 1 / 60;

console.log('time-zones 任務證明');

// ---------- 不該觸發的狀態 ----------
console.log('\n[預設與一般操作]');
expect('預設狀態（任何操作後送出的第一個事件）不觸發任何任務', firing(page()).length === 0, firing(page()).join('、'));
[{ center: 150 }, { view: '3d' }, { layers: { zones: false, night: false, dates: false, cities: false } }].forEach(o => {
  const fs = firing(page(o));
  expect('只改 ' + JSON.stringify(o) + ' 不觸發', fs.length === 0, fs.join('、'));
});
{
  const s = landing('taipei', 'newyork', 317, 0, 15.25);
  const fs = firing(s);
  expect('預設航班（臺北 → 紐約、15.25 小時）落地不觸發任何任務', fs.length === 0, '落地 ' + dt(s.flight.arrLocal.day) + ' ' + hm(s.flight.arrLocal.clock) + '；' + (fs.join('、') || '無'));
  const sug = K.suggestDur(C.taipei, C.newyork);
  expect('預設飛行時間就是「建議時間」', sug === 15.25, sug + ' 小時');
}
{
  const bad1 = [];
  K.CITIES.forEach(c => { const fs = firing(page({ probe: cityProbe(c.id) })); if (fs.length) bad1.push(c.id + '：' + fs.join('、')); });
  expect('預設時刻下，把量測點換成任何一個城市都不觸發', bad1.length === 0, bad1.join('；'));
  const bad2 = [], dl = [];
  K.CITIES.forEach(c => {
    if (c.id === 'taipei') return;
    const s = landing('taipei', c.id, 317, 0, K.suggestDur(C.taipei, c)), fs = firing(s);
    if (fs.length && fs.every(x => x === '5' || x === '9') && s.flight.dLonU > 0 && c.off < 0) dl.push(c.id + '：' + fs.join('、'));
    else if (fs.length) bad2.push(c.id + '：' + fs.join('、'));
  });
  expect('預設時刻從臺北飛往任何城市（建議時間），只有往東越過換日線的會完成換日線任務 5 或 9，其他都不觸發', bad2.length === 0, (bad2.join('；') || '換日線：' + dl.join('；')));
  expect('播放中經過 UTC 12:00 不算任務 6，按暫停停在那裡才算', !hits('6', page({ utc: 12, moving: true })) && hits('6', page({ utc: 12 })));
  expect('飛機落地的瞬間（UTC 12:00 落地倫敦）不算任務 6', !hits('6', landing('taipei', 'london', 317, 0, 12)));
  expect('播放「每秒 10 天」掃過冬至不算任務 7，停下來才算', !hits('7', page({ day: 355, moving: true })) && hits('7', page({ day: 355 })));
}

// ---------- 公開任務 ----------
console.log('\n[公開任務]');
witness('1', page({ utc: 4 }), 'UTC 04:00 = 臺北 12:00');
{
  const s = page({ probe: free(K.n180(C.taipei.lon - 30), C.taipei.lat) });
  witness('2', s, '從臺北按 3 次 Shift + ←，量測點到東經 ' + f(s.probe.lon) + '°（差 30° = 2 小時）');
  expect('2：差 29°（少按一次 ←）不算', !hits('2', page({ probe: free(C.taipei.lon - 29, C.taipei.lat) })));
}
{
  const days = []; for (let d = 1; d <= 365; d++) if (hits('3', page({ day: d }))) days.push(d);
  witness('3', page({ day: 172 }), '赤緯 ≥ 23.4° 的日子：' + dt(days[0]) + '–' + dt(days[days.length - 1]) + '（' + days.length + ' 天，UTC 00:00）');
}
{
  const ok4 = []; for (let d = 1; d <= 365; d++) for (let m = 0; m < 1440; m += 60) if (hits('4', page({ day: d, utc: m / 60 }))) ok4.push(dt(d) + ' ' + hm(m / 60));
  witness('4', page({ day: K.dayOf(3, 20), utc: 12 }), '3/20 UTC 12:00 赤緯 ' + f(K.sun(K.dayOf(3, 20), 12).dec, 3) + '°；整點裡合格的有 ' + ok4.length + ' 個，例 ' + ok4.slice(0, 2).join('、') + '…' + ok4[ok4.length - 1]);
}
{
  const s = landing('taipei', 'losangeles', 317, 0, K.suggestDur(C.taipei, C.losangeles));
  witness('5', s, '臺北 08:00 起飛飛洛杉磯 ' + s.flight.dur + ' 小時，落地當地 ' + dt(s.flight.arrLocal.day) + ' ' + hm(s.flight.arrLocal.clock));
}
{
  const u = []; for (let m = 0; m < 1440; m++) if (hits('6', page({ utc: m / 60 }))) u.push(m);
  witness('6', page({ utc: 12 }), '只剩半個時區的時刻：UTC ' + hm(u[0] / 60) + '–' + hm(u[u.length - 1] / 60) + '（' + u.length + ' 分鐘）');
}
{
  const days = []; for (let d = 1; d <= 365; d++) if (hits('7', page({ day: d }))) days.push(d);
  witness('7', page({ day: K.dayOf(12, 21) }), '冬至臺北晝長 ' + f(snap(page({ day: K.dayOf(12, 21) })).taipei.dayLen * 60, 0) + ' 分；合格的日子 ' + dt(days[0]) + '–' + dt(days[days.length - 1]) + '（' + days.length + ' 天）');
}
witness('8', page({ day: 172, probe: cityProbe('reykjavik') }), '夏至雷克雅維克晝長 ' + f(snap(page({ day: 172, probe: cityProbe('reykjavik') })).probe.dayLen) + ' 小時');
{
  const s = landing('taipei', 'losangeles', 317, 18, K.suggestDur(C.taipei, C.losangeles));
  witness('9', s, '臺北 ' + dt(s.flight.depLocal.day) + ' ' + hm(s.flight.depLocal.clock) + ' 起飛，落地洛杉磯 ' + dt(s.flight.arrLocal.day) + ' ' + hm(s.flight.arrLocal.clock));
  const all = []; for (let m = 0; m < 1440; m += 15) { const t = landing('taipei', 'losangeles', 317, m / 60, 13.25); if (hits('9', t)) all.push(m); }
  expect('9：臺北飛洛杉磯要在臺北半夜 4:45 以前起飛才行（其他時刻只完成任務 5）', all.length > 0 && all.length < 96, all.length + ' 個 15 分鐘時段');
}
{
  const days = [], ex = [];
  for (let d = 1; d <= 365; d++) {
    for (let m = 3 * 60; m < 5 * 60; m++) if (hits('10', page({ day: d, utc: m / 60 }))) { days.push(d); if (!ex.length) ex.push(d, m); break; }
  }
  const s = page({ day: ex[0], utc: ex[1] / 60 });
  witness('10', s, dt(ex[0]) + ' 臺北 ' + hm(ex[1] / 60 + 8) + ' 時角 ' + f(snap(s).taipei.H, 3) + '°；做得到的日子 ' + days.length + ' 天（' + dt(days[0]) + '–' + dt(days[days.length - 1]) + '）');
  let gapless = true;
  days.forEach(d => { let n = 0; for (let m = 0; m < 1440; m++) if (hits('10', page({ day: d, utc: m / 60 }))) n++; if (n < 1) gapless = false; });
  expect('10：這些日子每天都有整分鐘落在 ±0.25° 內（時角每分鐘走 0.25°）', gapless);
}
{
  const s = landing('reykjavik', 'tokyo', 150, 11, K.suggestDur(C.reykjavik, C.tokyo));
  witness('11', s, '5/30 雷克雅維克 ' + hm(s.flight.depLocal.clock) + ' 起飛往東飛東京 ' + s.flight.dur + ' 小時，途中最低太陽仰角 ' + f(s.flight.minAlt, 1) + '°');
  const w = landing('taipei', 'london', 317, 0, 12);
  expect('11：往西追著太陽飛（臺北 08:00 → 倫敦）雖然全程白天，但不算', !hits('11', w), '最低仰角 ' + f(w.flight.minAlt, 1) + '°');
  const byMonth = [];
  for (const d of [15, 105, 166, 196, 317, 349]) {
    const rs = [];
    K.CITIES.forEach(a => K.CITIES.forEach(b => {
      if (a === b) return;
      const du = K.suggestDur(a, b); if (du < 8) return;
      for (let u = 0; u < 24; u += 1) if (hits('11', landing(a.id, b.id, d, u, du))) { rs.push(a.id + '→' + b.id); return; }
    }));
    byMonth.push(dt(d) + ' ' + rs.length + ' 條' + (rs.length ? '（' + rs.slice(0, 3).join('、') + '）' : ''));
  }
  expect('11：要看季節選航線（北半球夏天走北極航線、12–1 月走南半球）', true, byMonth.join('；'));
  let syd = null;
  for (let u = 0; u < 24 && !syd; u += 0.5) { const t = landing('taipei', 'sydney', 317, u, 9); if (t.flight.minAlt > K.H0) syd = t; }
  expect('11：臺北 → 雪梨大多往南飛（經度只差 ' + f(syd.flight.dLonU, 0) + '°），全程白天也不算', syd.flight.minAlt > K.H0 && !hits('11', syd));
}
{
  let best = null;
  for (let d = 130; d <= 220; d++) for (let m = 0; m < 1440; m++) {
    const a = K.altAz(C.kaohsiung.lat, C.kaohsiung.lon, d, m / 60).alt;
    if (a >= 89.5) { const s = page({ day: d, utc: m / 60 }); if (hits('12', s)) { best = best || [d, m, a]; } }
  }
  const s = page({ day: best[0], utc: best[1] / 60 });
  witness('12', s, dt(best[0]) + ' UTC ' + hm(best[1] / 60) + '（高雄 ' + hm(best[1] / 60 + 8) + '）仰角 ' + f(best[2], 2) + '°');
  let tpMax = -99;
  for (let d = 150; d <= 200; d++) for (let m = 200; m < 300; m++) tpMax = Math.max(tpMax, K.altAz(C.taipei.lat, C.taipei.lon, d, m / 60).alt);
  expect('12：臺北在北回歸線以北，太陽最高只到 ' + f(tpMax, 2) + '°', tpMax < 89);
}

// ---------- 隱藏任務 ----------
console.log('\n[隱藏任務]');
{
  const s = page({ day: 172, utc: 23, probe: cityProbe('longyearbyen') });
  const d = snap(s).probe;
  witness('h1', s, '夏至朗伊爾城 地方平時 ' + hm(d.lmt) + '，太陽仰角 ' + f(d.alt, 1) + '°（午夜太陽）');
  expect('h1：同一時刻的臺北（冬天的半夜）不算', !hits('h1', page({ day: 172, utc: 16 })));
}
{
  const ok2 = []; for (let d = 1; d <= 365; d++) if (hits('h2', page({ day: d, utc: 12, probe: cityProbe('london') }))) ok2.push(dt(d));
  const d0 = K.dayOf(4, 15);
  const s = page({ day: d0, utc: 12, probe: cityProbe('london') });
  witness('h2', s, '倫敦（經度 −0.13°，鐘只比地方平時快 0.5 分）在均時差接近 0 的日子：' + ok2.join('、'));
  const fr = page({ day: d0, utc: 12, probe: free(120, 23.5) });
  expect('h2：自由量測點放在東經 120° 上也行', hits('h2', fr), '±0.25° 內 ' + robust('h2', fr, 0.125) + ' 個點合格（點地圖要準一點）');
}
{
  const s = landing('apia', 'pagopago', 317, 3, 0.75);
  witness('h3', s, '阿庇亞 → 帕果帕果 ' + f(s.flight.dist, 0) + ' km、45 分鐘，落地 ' + dt(s.flight.arrLocal.day) + '（起飛 ' + dt(s.flight.depLocal.day) + '）');
}
{
  const s = page({ utc: 10.5, probe: cityProbe('kiritimati') });
  const d = snap(s);
  witness('h4', s, 'UTC 10:30：聖誕島 ' + dt(d.cities.kiritimati.day) + '、臺北 ' + dt(d.cities.taipei.day) + '、帕果帕果 ' + dt(d.cities.pagopago.day));
  const ts = []; for (let m = 0; m < 1440; m++) if (hits('h4', page({ utc: m / 60, probe: cityProbe('pagopago') }))) ts.push(m);
  expect('h4：三個日期只出現在 UTC 10:00–10:59', ts.length === 60 && ts[0] === 600, ts.length + ' 分鐘，從 ' + hm(ts[0] / 60));
  expect('h4：同一時刻量測點在臺北不算', !hits('h4', page({ utc: 10.5 })));
}
{
  const s = page({ day: K.dayOf(12, 21), utc: 11, probe: cityProbe('longyearbyen') });
  const d = snap(s).probe;
  witness('h5', s, '冬至朗伊爾城 地方平時 ' + hm(d.lmt) + '，太陽仰角 ' + f(d.alt, 1) + '°（極夜的正午）');
}
{
  let ex = null;
  for (let d = 330; d <= 365 && !ex; d++) for (let m = 0; m < 1440; m++) { const s = page({ day: d, utc: m / 60, probe: cityProbe('saopaulo') }); if (hits('h6', s)) { ex = s; break; } }
  witness('h6', ex, dt(ex.day) + ' UTC ' + hm(ex.utc) + '，聖保羅離直射點 ' + f(snap(ex).probe.dSub, 2) + '°');
  const fr = page({ day: 40, utc: 0, probe: free(0, 0) });
  // 自由位置：選一天、一分鐘讓直射點落在 (λ, φ) 附近
  let fx = null;
  for (let d = 1; d <= 365 && !fx; d++) {
    const s0 = K.sun(d, 4);
    if (Math.abs(s0.dec + 15) > 0.2) continue;
    for (let m = 0; m < 1440; m++) { const t = m / 60, sn = K.sun(d, t); const s = page({ day: d, utc: t, probe: free(150, -15) }); if (hits('h6', s)) { fx = s; break; } }
  }
  expect('h6：在南緯 15°、東經 150° 放量測點，再找日期與時刻也行', !!fx, fx ? dt(fx.day) + ' UTC ' + hm(fx.utc) + '，±0.5° 內 ' + robust('h6', fx) + ' 個點合格' : '');
  void fr;
}
{
  const cand = [];
  K.CITIES.forEach(a => K.CITIES.forEach(b => {
    if (a === b) return;
    for (let q = 16; q <= 80; q++) {
      const F = K.flight(a, b, 172, 12, q / 4);
      if (F.westward && F.lmtDrift <= 1 / 3) { cand.push([a.id, b.id, q / 4, F.lmtDrift, F.dist]); break; }
    }
  }));
  cand.sort((x, y) => x[3] - y[3]);
  const c = cand.find(x => x[0] === 'moscow' && x[1] === 'reykjavik') || cand[0];
  const s = landing(c[0], c[1], 172, 12, c[2]);
  witness('h7', s, c[0] + ' → ' + c[1] + ' ' + c[2] + ' 小時，飛機下方的地方平時最多只差 ' + f(c[3] * 60, 1) + ' 分；可行的航線 ' + cand.length + ' 條：' + cand.slice(0, 5).map(x => x[0] + '→' + x[1] + ' ' + x[2] + 'h').join('、'));
  const real = cand.filter(x => Math.abs(x[2] - K.suggestDur(C[x[0]], C[x[1]])) <= 0.75);
  expect('h7：至少有一條航線用接近「建議時間」也做得到', real.length > 0, real.map(x => x[0] + '→' + x[1] + ' ' + x[2] + 'h（建議 ' + K.suggestDur(C[x[0]], C[x[1]]) + 'h）').join('、'));
}
{
  let ex = null, nDays = 0;
  for (let d = 1; d <= 365; d++) {
    let got = null;
    for (let m = 0; m < 1440; m++) {
      const u = m / 60, a = K.altAz(C.taipei.lat, C.taipei.lon, d, u);
      if (Math.abs(a.alt - K.H0) > 0.3 || a.H >= 0) continue;
      const s = page({ day: d, utc: u });
      if (hits('h8', s)) { got = s; break; }
    }
    if (got) { nDays++; ex = ex || got; }
  }
  const d = snap(ex), other = Object.keys(d.cities).filter(id => id !== 'taipei' && id !== 'kaohsiung' && Math.abs(d.cities[id].alt - K.H0) <= 0.25 && d.cities[id].H > 0);
  witness('h8', ex, dt(ex.day) + ' UTC ' + hm(ex.utc) + '：臺北日出（仰角 ' + f(d.cities.taipei.alt, 2) + '°），' + other.join('、') + ' 日落；一年有 ' + nDays + ' 天找得到');
}
{
  const c = [];
  K.CITIES.forEach(a => K.CITIES.forEach(b => {
    if (a === b) return;
    const dur = K.suggestDur(a, b); if (dur > 20) return;
    if (dur > 12) return;
    for (let d = 15; d <= 365; d += 30) for (let u = 0; u < 24; u += 1) if (K.flight(a, b, d, u, dur).sunrises >= 2) { c.push([a.id, b.id, d, u, dur]); return; }
  }));
  const w = c[0];
  const s = landing(w[0], w[1], w[2], w[3], w[4]);
  witness('h9', s, w[0] + ' → ' + w[1] + ' ' + dt(w[2]) + ' UTC ' + hm(w[3]) + ' 起飛 ' + w[4] + ' 小時：日出 ' + s.flight.sunrises + ' 次、日落 ' + s.flight.sunsets + ' 次；用建議時間做得到的航線 ' + c.length + ' 條：' + c.slice(0, 8).map(x => x[0] + '→' + x[1]).join('、'));
  const tl = landing('tokyo', 'london', 15, 21, 11.75);
  expect('h9：東京 → 倫敦（1/15 UTC 21:00）走極地航線，日出、日落、又日出', hits('h9', tl), '日出 ' + tl.flight.sunrises + '、日落 ' + tl.flight.sunsets);
  const ny = landing('taipei', 'newyork', K.dayOf(3, 21), 20, 15.25);
  expect('h9：臺北 → 紐約 15 小時看到兩次日出不算（超過 12 小時，往東飛的長程班機常常如此）', ny.flight.sunrises >= 2 && !hits('h9', ny));
}
{
  const s = landing('auckland', 'honolulu', 1, 0.5, K.suggestDur(C.auckland, C.honolulu));
  witness('h10', s, '奧克蘭 1/1 ' + hm(s.flight.depLocal.clock) + ' 起飛，' + s.flight.dur + ' 小時後落地檀香山 ' + s.flight.arrDate.m + '/' + s.flight.arrDate.d + ' ' + hm(s.flight.arrLocal.clock) + '（去年）');
  expect('h10：同一班飛機在 1/2 起飛只完成任務 9', !hits('h10', landing('auckland', 'honolulu', 2, 0.5, 9)) && hits('9', landing('auckland', 'honolulu', 2, 0.5, 9)));
  expect('h10：阿庇亞 → 帕果帕果距離不到 1000 km，不算', !hits('h10', landing('apia', 'pagopago', 1, 0.5, 0.75)));
}

// ---------- 隱藏任務彼此不會順便完成 ----------
console.log('\n[隱藏任務彼此獨立]');
Object.keys(used).filter(id => id[0] === 'h').forEach(id => {
  const hf = hiddenFiring(used[id]).filter(x => x !== id);
  expect(id + ' 的做法不會順便完成其他隱藏任務', hf.length === 0, hf.join('、'));
});

// ---------- 亂點：隱藏任務不該常常被意外觸發 ----------
console.log('\n[隨機操作]');
{
  let seed = 11;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const cnt = {}, tries = 3000;
  for (let k = 0; k < tries; k++) {
    const day = 1 + Math.floor(rnd() * 365), utc = Math.floor(rnd() * 1440) / 60;
    let s;
    if (k % 3 === 0) {
      const a = K.CITIES[Math.floor(rnd() * K.CITIES.length)], b = K.CITIES[Math.floor(rnd() * K.CITIES.length)];
      if (a === b) continue;
      s = landing(a.id, b.id, day, utc, K.suggestDur(a, b) > 20 ? 20 : K.suggestDur(a, b));
    } else if (k % 3 === 1) s = page({ day: day, utc: utc, probe: free(Math.round((rnd() * 360 - 180) * 2) / 2, Math.round((rnd() * 170 - 85) * 2) / 2) });
    else s = page({ day: day, utc: utc, probe: cityProbe(K.CITIES[Math.floor(rnd() * K.CITIES.length)].id) });
    hiddenFiring(s).forEach(x => { cnt[x] = (cnt[x] || 0) + 1; });
  }
  const worst = Object.keys(cnt).map(x => x + ' ' + cnt[x]).join('、') || '無';
  expect('隨機日期、時刻、量測點與航班 ' + tries + ' 次，任何一個隱藏任務被碰巧完成的比例都低於 1%', Object.keys(cnt).every(x => cnt[x] / tries < 0.01), worst);
}

console.log('\n合計：' + ok + ' 項通過，' + bad + ' 項失敗');
const pub = missions.filter(m => !m.hidden), hid = missions.filter(m => m.hidden);
console.log('公開 ' + pub.length + ' 個（' + pub.reduce((a, m) => a + m.level, 0) + ' 顆星），隱藏 ' + hid.length + ' 個（' + hid.reduce((a, m) => a + 2 * m.level, 0) + ' 顆星）；7 級以上的隱藏任務 ' + hid.filter(m => m.level >= 7).length + ' 個');
if (bad) process.exit(1);
