/* 任務可達成的證明腳本。用法：node tools/mission-proofs/thin-film.js
 * 修改物理核心或任務條件後重跑，確認每個任務仍然做得到、預設狀態不會觸發任務。
 * 數值都在滑桿範圍與打字精度內；量測類任務模擬「十字線只能放在螢幕像素上」（手機與桌機兩種視野大小）。 */
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const C = require(__ROOT + 'js/thin-film-core.js');
const NM = 1e-9, UM = 1e-6, MM = 1e-3, CM = 1e-2, DEG = Math.PI / 180;
let list = null;
global.LabMission = { register: (m, l) => { list = l; } }; global.window = { LabMission: global.LabMission };
require(__ROOT + 'js/missions/thin-film.js');
const mems = {};
const reset = () => { list.forEach(m => { mems[m.id] = {}; }); };
reset();

// ---------- 與頁面 missionData() 相同的資料 ----------
function soapEv(s) {
  s = Object.assign({ white: true, lam: 589, n: 1.33, ang: 0, hb: 1000, z: 0.55, beams: 'multi' }, s);
  const L = C.layer(1, s.n, 1, Math.cos(s.ang * DEG), s.beams);
  const h = s.h != null ? s.h : C.soapThickness(s.z, s.hb), path = L.path(h);
  const col = C.filmColor(L, h), hv = C.hsv(col.srgb), l = s.white ? 550 : s.lam;
  return { type: 'state', data: { mode: 'soap', white: s.white, lam: s.white ? NaN : s.lam, beams: s.beams, n: s.n, ang: s.ang, hb: s.hb, t: 0, h, path,
    ord: s.white ? NaN : path / s.lam, R: s.white ? NaN : L.R(h, s.lam), Rmax: L.Rmax, Rs: L.Rs(h, l), Rp: L.Rp(h, l),
    rgb: col.srgb, hue: hv.h, sat: hv.s, val: hv.v, brewster: Math.atan(s.n) / DEG } };
}
function fit(recs, sq) { return C.fitLine(recs.map(r => r.k), recs.map(r => sq ? r.v * r.v : r.v)); }
function wedgeEv(s) {
  s = Object.assign({ white: false, lam: 589, D: 20, L: 10, n: 1, mys: false, cx: null, recs: [], beams: 'multi' }, s);
  const p = { D: s.D * UM, L: s.L * CM, n: s.n, lambda: s.lam * NM }, w = C.wedge(p), f = fit(s.recs);
  return { type: 'state', data: { mode: 'wedge', white: s.white, lam: s.white ? NaN : s.lam, beams: s.beams, D: s.D, L: s.L, n: s.n, dx: w.dx / MM, count: w.darkCount,
    mys: s.mys, cx: s.cx == null ? NaN : s.cx, nRec: f.n, fitDx: f.slope,
    fitD: s.white || !(f.n >= 2) ? NaN : C.wireFromSpacing(Math.abs(f.slope) * MM, p.L, s.n, p.lambda) / UM } };
}
function newtonEv(s) {
  s = Object.assign({ white: false, lam: 589, R: 1, n: 1, e: 0, view: 'R', mys: false, dust: false, r: null, recs: [], beams: 'multi' }, s);
  const p = { R: s.R, n: s.n, e: s.e * NM, lambda: s.lam * NM }, f = fit(s.recs, true);
  const r = s.r == null ? NaN : s.r * MM, t = isFinite(r) ? C.lensGap(r, p.R, p.e) : NaN;
  return { type: 'state', data: { mode: 'newton', white: s.white, lam: s.white ? NaN : s.lam, beams: s.beams, R: s.R, n: s.n, e: s.e, view: s.view, mys: s.mys, dust: s.dust,
    r5: p.e > 0 ? NaN : C.darkRingRadius(5, p) / MM, r: r / MM, ord: s.white ? NaN : 2 * p.n * t / p.lambda, centre: s.white ? NaN : 2 * p.n * p.e / p.lambda,
    nRec: f.n, slope: f.slope, fitR: s.white ? NaN : f.slope * MM * MM * p.n / p.lambda, fitLam: f.slope * MM * MM * p.n / p.R / NM } };
}
function answerEv(kind, truth, guess, dust, n) { return { type: 'answer', data: { kind, truth, guess, err: (guess - truth) / truth, dust: !!dust, e: 0, revealed: false, n: n || 1 } }; }

function passing(e) { return list.filter(m => m.check(e, mems[m.id])).map(m => m.id); }
let bad = 0;
// run 回傳最後一個事件時成立的任務；run.union 是整串事件中途成立過的所有任務（判斷「順便完成」用）
function run(evs) { reset(); let out = []; const u = new Set(); evs.forEach(e => { out = passing(e); out.forEach(x => u.add(x)); }); run.union = [...u]; return out; }
const HIDDEN = list.filter(m => m.hidden).map(m => m.id);
const NEW_HIDDEN = ['thin-film-h4', 'thin-film-h5', 'thin-film-h6', 'thin-film-h7', 'thin-film-h8', 'thin-film-h9', 'thin-film-h10'];
/** 做得到；而且：隱藏任務的解法不會中途順便完成其他隱藏任務，一般任務的解法不會順便完成新的隱藏任務（h4–h10） */
function expect(id, evs, note) {
  const out = run(evs), ok = out.includes(id);
  const extra = run.union.filter(x => x !== id && HIDDEN.includes(x) && (HIDDEN.includes(id) || NEW_HIDDEN.includes(x)));
  if (!ok || extra.length) bad++;
  console.log((ok && !extra.length ? 'OK   ' : 'FAIL ') + id.padEnd(15), note, '| also:', run.union.filter(x => x !== id).join(',') || '—', extra.length ? '｜✗ 順便完成 ' + extra.join(',') : '');
}
function expectNot(id, evs, note) {
  const out = run(evs), ok = !out.includes(id); if (!ok) bad++;
  console.log((ok ? 'OK   ' : 'FAIL ') + ('not ' + id).padEnd(19), note);
}

// ---------- 預設狀態與單純切換：不可完成任何任務 ----------
const defaults = [
  ['肥皂膜預設（白光、游標 h = 550 nm）', soapEv({})],
  ['肥皂膜換單色光 589 nm', soapEv({ white: false })],
  ['肥皂膜、雙光束近似', soapEv({ beams: 'two' })],
  ['空氣劈預設（沒放游標）', wedgeEv({})],
  ['空氣劈游標放在中間', wedgeEv({ cx: 50 })],
  ['空氣劈白光', wedgeEv({ white: true, cx: 50 })],
  ['空氣劈換成水', wedgeEv({ n: 1.33 })],
  ['牛頓環預設（沒放游標）', newtonEv({})],
  ['牛頓環游標 1 mm', newtonEv({ r: 1 })],
  ['牛頓環透射', newtonEv({ view: 'T', r: 1 })],
  ['牛頓環白光', newtonEv({ white: true, r: 1 })],
  ['肥皂膜單色紅光 650 nm', soapEv({ white: false, lam: 650 })],
  ['空氣劈單色、十字線在細線處（λ 589）', wedgeEv({ cx: 100 })],
  ['空氣劈 n = 1.6、十字線在中間', wedgeEv({ n: 1.6, cx: 50 })],
  ['牛頓環抬高 e = 300 nm', newtonEv({ e: 300, r: 1 })],
  ['牛頓環充水', newtonEv({ n: 1.33, r: 1 })]
];
for (const [name, e] of defaults) { const out = run([e]); console.log('預設 ' + name.padEnd(22), '→', JSON.stringify(out)); if (out.length) bad++; }
// 依序切換三個模式也不會累積出任務
{ const out = run([soapEv({}), wedgeEv({}), newtonEv({}), newtonEv({ view: 'T' }), soapEv({ white: false })]); console.log('依序切換三個模式 →', JSON.stringify(out)); if (out.length) bad++; }

// ---------- 1：最薄處全黑 ----------
expect('thin-film-1', [soapEv({ z: 0 })], '游標拖到最頂端 z = 0（h = 0）');
expect('thin-film-1', [soapEv({ z: 0.015 })], 'h = 15 nm');
console.log('     h = 0 的顏色', JSON.stringify(soapEv({ z: 0 }).data.rgb), '；h = 15 nm', JSON.stringify(soapEv({ z: 0.015 }).data.rgb));
expectNot('thin-film-1', [soapEv({ z: 0, white: false })], '單色光不算');

// ---------- 2：鈉光第 2 條暗紋 h = 2λ/(2n) ----------
const h2 = 2 * 589 / (2 * 1.33);
expect('thin-film-2', [soapEv({ white: false, z: Math.round(h2 / 1000 * 370) / 370 })], 'h ≈ ' + h2.toFixed(1) + ' nm（桌機 370 像素高的膜，取最近像素）');
expect('thin-film-2', [soapEv({ white: false, z: Math.round(h2 / 1000 * 237) / 237 })], '手機 237 像素高的膜');
expectNot('thin-film-2', [soapEv({ white: false, lam: 590, h: h2 })], '590 nm 不算');

// ---------- 3：第一道藍 ----------
function blueRange(o) {
  const ok = [];
  for (let h = 0; h <= 1200; h += 1) if (run([soapEv(Object.assign({ h }, o))]).includes('thin-film-3')) ok.push(h);
  if (!ok.length) return '無';
  const seg = []; let a = ok[0], b = ok[0];
  for (let i = 1; i < ok.length; i++) { if (ok[i] === b + 1) b = ok[i]; else { seg.push(a + '–' + b); a = b = ok[i]; } }
  seg.push(a + '–' + b);
  return seg.join(', ') + ' nm';
}
for (const o of [{}, { beams: 'two' }, { n: 1.2 }, { n: 1.6 }, { ang: 30 }, { ang: 60 }]) {
  const r = blueRange(o); if (r === '無') bad++;
  console.log((r === '無' ? 'FAIL ' : 'OK   ') + 'thin-film-3'.padEnd(15), '可通過的厚度', JSON.stringify(o), '→', r);
}
{ const e = soapEv({ h: 240 }).data; console.log('     h = 240 nm：rgb', JSON.stringify(e.rgb), 'hue', e.hue.toFixed(0), 'sat', e.sat.toFixed(2), 'val', e.val.toFixed(2)); }
expect('thin-film-3', [soapEv({ z: 0.24 })], '底部 1000 nm、z = 0.24（h = 240 nm）');
expectNot('thin-film-3', [soapEv({ h: 430 })], '第二道藍（h = 430 nm，光程差 1144 nm）不算');

// ---------- 4：條紋間距 1 mm ----------
expect('thin-film-4', [wedgeEv({ D: 29.5 })], 'λ 589、L 10 cm、D = 29.5 μm → Δx = ' + wedgeEv({ D: 29.5 }).data.dx.toFixed(4) + ' mm');
expect('thin-film-4', [wedgeEv({ lam: 600, D: 30 })], 'λ 600、D 30 → 1.0000 mm');
expectNot('thin-film-4', [wedgeEv({ D: 29.5, mys: true })], '神秘細線時不算');

// ---------- 5：灌水後換細線 ----------
expect('thin-film-5', [wedgeEv({}), wedgeEv({ n: 1.33 }), wedgeEv({ n: 1.33, D: 15 })], '空氣 D 20 → 水 → D 15.0（' + (wedgeEv({ n: 1.33, D: 15 }).data.dx / wedgeEv({}).data.dx * 100 - 100).toFixed(2) + ' %）');
expect('thin-film-5', [wedgeEv({ D: 40, L: 12 }), wedgeEv({ n: 1.33, D: 40, L: 12 }), wedgeEv({ n: 1.33, D: 30.1, L: 12 })], '空氣 D 40 → 水 D 30.1');
expectNot('thin-film-5', [wedgeEv({ n: 1.33, D: 15 })], '沒有先在空氣中量過不算');
expectNot('thin-film-5', [wedgeEv({}), wedgeEv({ n: 1.33, D: 15, lam: 532 })], '換了波長不算');

// ---------- 6：第 5 暗環 2 mm ----------
expect('thin-film-6', [newtonEv({ R: 1.358 })], 'R = 1.358 m → r5 = ' + newtonEv({ R: 1.358 }).data.r5.toFixed(4) + ' mm');
expect('thin-film-6', [newtonEv({ R: 1.36 })], 'R = 1.36 m（滑桿 0.01）→ ' + newtonEv({ R: 1.36 }).data.r5.toFixed(4) + ' mm');
expect('thin-film-6', [newtonEv({ R: 1.2, n: 1, lam: 667 })], 'R 1.2、λ 667 → ' + newtonEv({ R: 1.2, lam: 667 }).data.r5.toFixed(4) + ' mm');
expectNot('thin-film-6', [newtonEv({ R: 1.358, view: 'T' })], '透射光不算');

// ---------- 7：斜看變暗 ----------
expect('thin-film-7', [soapEv({ white: false, lam: 532, z: 0.5 }), soapEv({ white: false, lam: 532, z: 0.5, ang: 52.9 })],
  'λ 532、h 500 nm：0° 時 ' + soapEv({ white: false, lam: 532, z: 0.5 }).data.ord.toFixed(3) + 'λ（亮）→ 52.9° 時 ' + soapEv({ white: false, lam: 532, z: 0.5, ang: 52.9 }).data.ord.toFixed(3) + 'λ（暗）');
{
  const h = 3.5 * 589 / (2 * 1.33); let th = 0;
  for (let a = 15; a <= 60; a += 0.1) { if (Math.abs(soapEv({ white: false, h, ang: a }).data.ord - 3) < 0.005) { th = Math.round(a * 10) / 10; break; } }
  expect('thin-film-7', [soapEv({ white: false, h }), soapEv({ white: false, h, ang: th })], 'λ 589、h ' + h.toFixed(1) + ' nm：3.5λ → ' + th + '° 時 3λ');
}
expectNot('thin-film-7', [soapEv({ white: false, lam: 532, z: 0.5, ang: 52.9 })], '沒有先在垂直入射時放在亮紋上不算');
expectNot('thin-film-7', [soapEv({ white: false, lam: 532, z: 0.5 }), soapEv({ white: false, lam: 532, z: 0.6, ang: 30 })], '換了位置不算');

// ---------- 8：反射暗環 → 透射亮環（十字線在像素上） ----------
function newtonViewMm(R) {
  const r = Math.sqrt(10 * 589e-9 * R), steps = [0.5, 0.8, 1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12];
  for (const s of steps) if (s * MM >= r) return s; return 12;
}
const px = (v, step) => Math.round(v / step) * step;
for (const fr of [140, 216]) {
  const step = newtonViewMm(1) / fr, r3 = px(C.darkRingRadius(3, { R: 1, n: 1, e: 0, lambda: 589 * NM }) / MM, step);
  const a = newtonEv({ r: r3 }), b = newtonEv({ r: r3, view: 'T' });
  expect('thin-film-8', [a, b], '視野半徑 ' + fr + ' 像素：第 3 暗環 r = ' + r3.toFixed(4) + ' mm（2nt/λ = ' + a.data.ord.toFixed(3) + '）→ 透射');
}
expectNot('thin-film-8', [newtonEv({ r: 1.2 }), newtonEv({ r: 1.2, view: 'T' })], '不在暗環上不算');
expectNot('thin-film-8', [newtonEv({ r: C.darkRingRadius(3, { R: 1, n: 1, e: 0, lambda: 589 * NM }) / MM }), newtonEv({ r: 1.5, view: 'T' })], '換了位置不算');

// ---------- 量測模擬：十字線只能放在像素上，再加 ±0.5 像素的手抖 ----------
function mulberry(a) { return function () { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rnd = mulberry(20261112);
/** 牛頓環：在半徑 fr 像素的視野中量所有看得到的暗環（最多 maxN 個），序數從 1 開始連續編號 */
function ringRecs(R, e, fr, jitter, maxN, lam, n) {
  lam = lam || 589; n = n || 1;
  const rv = newtonViewMm(R), step = rv / fr, p = { R, n, e: e * NM, lambda: lam * NM }, recs = [];
  const m0 = Math.max(1, Math.ceil(2 * n * e / lam - 1e-9));
  for (let m = m0, k = 1; k <= maxN; m++) {
    const r = C.darkRingRadius(m, p) / MM;
    if (!(r > 3 * step)) continue;          // 太靠近中心、分不出來的不量
    if (r > rv * 0.97) break;
    recs.push({ k: k++, v: px(r + (jitter ? (rnd() - 0.5) * step : 0), step) });
  }
  return recs;
}
// 9：用環量波長（非神秘）
for (const fr of [140, 216]) {
  const recs = ringRecs(1, 0, fr, false, 6);
  expect('thin-film-9', [newtonEv({ recs })], '視野 ' + fr + ' 像素、R 1 m、6 個暗環（最近像素）→ λ = ' + newtonEv({ recs }).data.fitLam.toFixed(2) + ' nm');
  let worst = 0, pass = 0;
  for (let i = 0; i < 400; i++) { const e = newtonEv({ recs: ringRecs(1, 0, fr, true, 8) }); worst = Math.max(worst, Math.abs(e.data.fitLam / 589 - 1)); if (run([e]).includes('thin-film-9')) pass++; }
  console.log('     手抖 ±0.5 像素、量 8 個暗環：400 次中 ' + pass + ' 次通過，最大誤差 ' + (worst * 100).toFixed(2) + ' %');
}
expectNot('thin-film-9', [newtonEv({ recs: ringRecs(1, 0, 216, false, 5) })], '只有 5 筆不算');

// 10：神秘細線（量暗紋位置 → Δx → D，答案取到 0.1 μm）
function wireGuess(D, mw, vw, jitter, n) {
  n = n || 1;
  const p = { D: D * UM, L: 0.1, n, lambda: 589 * NM }, dx = C.wedge(p).dx / MM, x0 = 50, xa = x0 - vw / 2, step = vw / mw;
  const recs = [];
  for (let k = Math.ceil(xa / dx); k * dx <= xa + vw; k++) { const x = k * dx; if (x - xa < 2 * step || xa + vw - x < 2 * step) continue; recs.push({ k, v: xa + px(x - xa + (jitter ? (rnd() - 0.5) * step : 0), step) }); }
  const f = fit(recs), g = Math.round(C.wireFromSpacing(f.slope * MM, 0.1, n, 589 * NM) / UM * 10) / 10;
  return { g, n: recs.length };
}
for (const D of [12, 35.7, 61.2, 89.9]) {
  for (const [mw, vw] of [[370, 10], [1250, 10]]) {
    const a = wireGuess(D, mw, vw, false);
    expect('thin-film-10', [answerEv('wire', D, a.g)], 'D = ' + D + ' μm，視野 ' + vw + ' mm／' + mw + ' 像素，量 ' + a.n + ' 條暗紋 → 答 ' + a.g + ' μm');
    let worst = 0; for (let i = 0; i < 300; i++) worst = Math.max(worst, Math.abs(wireGuess(D, mw, vw, true).g / D - 1));
    console.log('     手抖 ±0.5 像素 300 次的最大誤差 ' + (worst * 100).toFixed(2) + ' %');
  }
}
expectNot('thin-film-10', [{ type: 'answer', data: { kind: 'wire', truth: 40, guess: 40, err: 0, dust: false, revealed: true } }], '先看答案不算');
expectNot('thin-film-10', [answerEv('wire', 40, 41)], '誤差 2.5 % 不算');

// 11、12：神秘透鏡（量暗環 → r² 對 m 的斜率 → R = 斜率·n/λ，答案取到 0.01 m）
function lensGuess(R, e, fr, jitter) {
  const recs = ringRecs(R, e, fr, jitter, 8), f = fit(recs, true);
  return { g: Math.round(f.slope * MM * MM / (589 * NM) * 100) / 100, n: recs.length };
}
for (const R of [0.6, 1.73, 3.5]) {
  for (const fr of [140, 216]) {
    const a = lensGuess(R, 0, fr, false);
    expect('thin-film-11', [answerEv('lens', R, a.g, false)], 'R = ' + R + ' m，視野 ' + fr + ' 像素，量 ' + a.n + ' 個暗環 → 答 ' + a.g + ' m');
    let worst = 0; for (let i = 0; i < 300; i++) worst = Math.max(worst, Math.abs(lensGuess(R, 0, fr, true).g / R - 1));
    console.log('     手抖 ±0.5 像素 300 次的最大誤差 ' + (worst * 100).toFixed(2) + ' %');
  }
}
for (const [R, e] of [[0.6, 400], [1.73, 147], [3.5, 60], [2.2, 300]]) {
  for (const fr of [140, 216]) {
    const a = lensGuess(R, e, fr, false);
    expect('thin-film-12', [answerEv('lens', R, a.g, true)], 'R = ' + R + ' m、灰塵 e = ' + e + ' nm，視野 ' + fr + ' 像素，量 ' + a.n + ' 個暗環 → 答 ' + a.g + ' m');
    let worst = 0; for (let i = 0; i < 300; i++) worst = Math.max(worst, Math.abs(lensGuess(R, e, fr, true).g / R - 1));
    console.log('     手抖 ±0.5 像素 300 次的最大誤差 ' + (worst * 100).toFixed(2) + ' %');
  }
}
{ // 有灰塵時若照 r_m² = mλR 用單一暗環算，會差很多（所以第 12 題要用斜率）
  const R = 1.73, e = 147, recs = ringRecs(R, e, 216, false, 8), r = recs[4].v * MM;
  console.log('     對照：灰塵 147 nm 時把第 5 個看到的暗環當成 m = 5 直接算 R = r²/(5λ) = ' + (r * r / (5 * 589 * NM)).toFixed(3) + ' m（實際 1.73 m）');
}
expectNot('thin-film-11', [answerEv('lens', 1.5, 1.5, true)], '有灰塵時第 11 題不算');
expectNot('thin-film-12', [answerEv('lens', 1.5, 1.5, false)], '沒有灰塵時第 12 題不算');

// ---------- 隱藏任務 ----------
expect('thin-film-h1', [wedgeEv({ n: 1.52 })], '空氣劈：楔中折射率 1.52（與玻璃相同）');
expect('thin-film-h1', [newtonEv({ n: 1.52 })], '牛頓環：間隙折射率 1.52');
{ const L = C.layer(1.52, 1.52, 1.52, 1, 'multi'); console.log('     n = 1.52 時 Rmax =', L.Rmax.toExponential(2), '（條紋消失）'); }
{
  const n = 1.33, thB = Math.round(Math.atan(n) / DEG * 10) / 10, c2 = Math.cos(Math.asin(Math.sin(thB * DEG) / n));
  const h = 1.5 * 589 / (2 * n * c2), e = soapEv({ white: false, h, ang: thB }).data;
  expect('thin-film-h2', [soapEv({ white: false, h, ang: thB })], '肥皂膜 λ 589、θ = ' + thB + '°（布魯斯特角）、h = ' + h.toFixed(1) + ' nm 亮紋：Rs = ' + (e.Rs * 100).toFixed(2) + ' %、Rp = ' + e.Rp.toExponential(1));
  expect('thin-film-h2', [soapEv({ white: false, lam: 450, n: 1.5, h: 1.5 * 450 / (2 * 1.5 * Math.cos(Math.asin(Math.sin(56.3 * DEG) / 1.5))), ang: 56.3 })], 'n 1.5、θ 56.3°、λ 450');
}
expectNot('thin-film-h2', [soapEv({ white: false, lam: 532, z: 0.5, ang: 52.9 })], '第 7 題的暗紋終點（52.9°，接近布魯斯特角但是暗紋）不會順便完成');
expectNot('thin-film-h2', [soapEv({ white: false, lam: 532, z: 0.5, ang: 40 })], '一般角度不算');
expect('thin-film-h3', [newtonEv({ e: 147 })], '牛頓環 λ 589、間隙 e = 147 nm ≈ λ/4：2ne/λ = ' + newtonEv({ e: 147 }).data.centre.toFixed(3) + '（反射光中心變亮）');
expect('thin-film-h3', [newtonEv({ e: 442, view: 'T' })], 'e = 442 nm ≈ 3λ/4（透射光中心變暗）');
expectNot('thin-film-h3', [newtonEv({ e: 295 })], 'e = λ/2：中心仍是暗點');
expectNot('thin-film-h3', [newtonEv({ e: 147, mys: true })], '神秘透鏡的灰塵不算');

// ---------- 新增隱藏任務 h4–h10（11/12 深夜站長：「每一個實驗的隱藏任務增加到十個。」） ----------
// 肥皂膜游標只能停在像素上：膜高 fr 像素（桌機 370、手機 237），h = hb·z
const zAt = (h, fr, hb) => Math.round(h / (hb || 1000) * fr) / fr;

// h4：最薄的亮紋（2nh = λ/2，四分之一波長膜）
for (const fr of [370, 237]) {
  for (const lam of [589, 450, 650]) {
    const z = zAt(lam / (4 * 1.33), fr), e = soapEv({ white: false, lam, z });
    expect('thin-film-h4', [e], 'λ ' + lam + '、膜高 ' + fr + ' 像素：h = ' + e.data.h.toFixed(1) + ' nm（2nh/λ = ' + e.data.ord.toFixed(3) + '）');
  }
}
expectNot('thin-film-h4', [soapEv({ white: false, z: zAt(1.5 * 589 / 2.66, 370) })], '第二條亮紋（2nh/λ = 1.5）不算');
expectNot('thin-film-h4', [soapEv({ white: false, ang: 30, z: zAt(589 / (4 * 1.33 * Math.cos(Math.asin(Math.sin(30 * DEG) / 1.33))), 370) })], '斜射 30° 不算');
expectNot('thin-film-h4', [soapEv({ white: true, z: 0.111 })], '白光不算');

// h5：同一點，λ1 是暗紋、只換波長，λ2 變亮紋
for (const fr of [370, 237]) {
  for (const [lam1, m] of [[650, 2], [600, 3]]) {
    const z = zAt(m * lam1 / 2.66, fr), a = soapEv({ white: false, lam: lam1, z });
    // 找 380–750 nm 中讓同一點變亮紋（2nh/λ = k + 1/2，k ≥ 1）且離 λ1 至少 30 nm 的整數波長
    let lam2 = null;
    for (let l = 380; l <= 750 && lam2 == null; l++) { const o = a.data.path / l; if (Math.abs(l - lam1) >= 30 && o >= 1.5 && Math.abs(o % 1 - 0.5) <= 0.01) lam2 = l; }
    const b = soapEv({ white: false, lam: lam2, z });
    expect('thin-film-h5', [a, b], '膜高 ' + fr + ' 像素、h = ' + a.data.h.toFixed(1) + ' nm：λ ' + lam1 + ' 暗（' + a.data.ord.toFixed(3) + '）→ λ ' + lam2 + ' 亮（' + b.data.ord.toFixed(3) + '）');
  }
}
{
  const z = zAt(2 * 650 / 2.66, 370);
  expectNot('thin-film-h5', [soapEv({ white: false, lam: 520, z })], '沒有先在暗紋上就不算');
  expectNot('thin-film-h5', [soapEv({ white: false, lam: 650, z }), soapEv({ white: false, lam: 520, z: z + 30 / 370 })], '換了位置不算');
  expectNot('thin-film-h5', [soapEv({ white: false, lam: 650, z }), soapEv({ white: false, lam: 650, z: zAt(2.5 * 650 / 2.66, 370) })], '只移游標到亮紋（波長沒換）不算');
  expectNot('thin-film-h5', [soapEv({ white: false, lam: 650, z }), soapEv({ white: false, lam: 650, ang: 33, z })], '改角度不算（那是第 7 題的反向）');
}

// h6：2nD = mλ，最後一條暗紋恰好落在細線上（十字線放在 x = L 驗證）
for (const [mw, vw] of [[370, 10], [1250, 10], [370, 4]]) {
  for (const [D, lam, n] of [[20, 597, 1], [20.03, 589, 1], [30, 600, 1.33]]) {
    const step = vw / mw, xa = 100 - vw / 2, cx = xa + px(100 - xa, step), e = wedgeEv({ D, lam, n, cx });
    expect('thin-film-h6', [e], 'D ' + D + ' μm、λ ' + lam + '、n ' + n + '：2nD/λ = ' + (2 * n * D * 1000 / lam).toFixed(3) + '，十字線 ' + cx.toFixed(3) + ' mm（視野 ' + vw + ' mm／' + mw + ' 像素）');
  }
}
expectNot('thin-film-h6', [wedgeEv({ cx: 100 })], '預設 λ 589、D 20（2nD/λ = 67.91）不算');
expectNot('thin-film-h6', [wedgeEv({ D: 20, lam: 597, cx: 50 })], '十字線不在細線處不算');
expectNot('thin-film-h6', [wedgeEv({ D: 20, lam: 597, cx: 100, mys: true })], '神秘細線不算');

// h7：同序數的暗環，充水後半徑縮為 1/√n（牛頓《光學》第二卷的觀察）
for (const fr of [140, 216]) {
  for (const [R, m] of [[1, 4], [2.5, 3], [0.6, 6]]) {
    const step = newtonViewMm(R) / fr;
    const rA = px(C.darkRingRadius(m, { R, n: 1, e: 0, lambda: 589 * NM }) / MM, step);
    const rW = px(C.darkRingRadius(m, { R, n: 1.33, e: 0, lambda: 589 * NM }) / MM, step);
    const a = newtonEv({ R, r: rA }), w = newtonEv({ R, n: 1.33, r: rA }), b = newtonEv({ R, n: 1.33, r: rW });
    expect('thin-film-h7', [a, w, b], '視野 ' + fr + ' 像素、R ' + R + ' m：第 ' + m + ' 暗環 ' + rA.toFixed(4) + ' mm（' + a.data.ord.toFixed(3) + '）→ 充水 ' + rW.toFixed(4) + ' mm（' + b.data.ord.toFixed(3) + '），比值 ' + (rW / rA).toFixed(3) + '（1/√1.33 = ' + (1 / Math.sqrt(1.33)).toFixed(3) + '）');
  }
}
{
  const R = 1, step = newtonViewMm(R) / 140, dk = (m, n) => px(C.darkRingRadius(m, { R, n, e: 0, lambda: 589 * NM }) / MM, step);
  expectNot('thin-film-h7', [newtonEv({ n: 1.33, r: dk(4, 1.33) })], '沒有先在空氣中量就不算');
  expectNot('thin-film-h7', [newtonEv({ r: dk(4, 1) }), newtonEv({ n: 1.33, r: dk(5, 1.33) })], '充水後放到不同序數的暗環不算');
  expectNot('thin-film-h7', [newtonEv({ r: dk(2, 1) }), newtonEv({ n: 1.33, r: dk(2, 1.33) })], '第 2 暗環太靠中心不算');
  expectNot('thin-film-h7', [newtonEv({ r: dk(4, 1) }), newtonEv({ n: 1.52, r: dk(4, 1.52) })], '換成玻璃（1.52）不算');
}

// h8：神秘細線泡在水裡（D = λL/(2nΔx)，要除以 n）
for (const D of [18.4, 47.3, 80.1]) {
  for (const [mw, vw] of [[370, 10], [1250, 10]]) {
    const a = wireGuess(D, mw, vw, false, 1.33);
    expect('thin-film-h8', [answerEv('wire', D, a.g, false, 1.33)], '充水 n 1.33、D = ' + D + ' μm，視野 ' + vw + ' mm／' + mw + ' 像素，量 ' + a.n + ' 條暗紋 → 答 ' + a.g + ' μm');
    let worst = 0; for (let i = 0; i < 300; i++) worst = Math.max(worst, Math.abs(wireGuess(D, mw, vw, true, 1.33).g / D - 1));
    console.log('     手抖 ±0.5 像素 300 次的最大誤差 ' + (worst * 100).toFixed(2) + ' %');
  }
}
{
  const D = 47.3, a = wireGuess(D, 370, 10, false, 1.33), forgot = Math.round(a.g * 1.33 * 10) / 10;
  expectNot('thin-film-h8', [answerEv('wire', D, forgot, false, 1.33)], '忘了除以 n（答 ' + forgot + ' μm）不算');
}
expectNot('thin-film-h8', [answerEv('wire', 40, 40, false, 1)], '空氣中的神秘細線不算（那是第 10 題）');
expectNot('thin-film-h8', [{ type: 'answer', data: { kind: 'wire', truth: 40, guess: 40, err: 0, dust: false, e: 0, revealed: true, n: 1.33 } }], '先看答案不算');

// h9：抬高透鏡後 r² 對 m 的斜率不變（λR/n）
for (const fr of [140, 216]) {
  for (const [R, e] of [[1, 300], [2, 200], [0.8, 700]]) {
    const a = newtonEv({ R, recs: ringRecs(R, 0, fr, false, 6) }), b = newtonEv({ R, e, recs: ringRecs(R, e, fr, false, 6) });
    expect('thin-film-h9', [a, b], '視野 ' + fr + ' 像素、R ' + R + ' m：密接斜率 ' + a.data.slope.toFixed(5) + ' mm²，抬高 ' + e + ' nm 後 ' + b.data.slope.toFixed(5) + ' mm²');
    let pass = 0;
    for (let i = 0; i < 300; i++) { const A = newtonEv({ R, recs: ringRecs(R, 0, fr, true, 8) }), B = newtonEv({ R, e, recs: ringRecs(R, e, fr, true, 8) }); if (run([A, B]).includes('thin-film-h9')) pass++; }
    console.log('     手抖 ±0.5 像素、各量 8 個暗環：300 次中 ' + pass + ' 次通過');
  }
}
expectNot('thin-film-h9', [newtonEv({ R: 2, recs: ringRecs(2, 0, 216, false, 6) }), newtonEv({ R: 2, e: 150, recs: ringRecs(2, 150, 216, false, 6) })], 'e = 150 nm（中心是亮點，屬於 h3）不算，兩個隱藏任務不會同時完成');
expectNot('thin-film-h9', [newtonEv({ e: 300, recs: ringRecs(1, 300, 216, false, 6) })], '只量抬高後的不算');
expectNot('thin-film-h9', [newtonEv({ recs: ringRecs(1, 0, 216, false, 6) }), newtonEv({ R: 2, e: 300, recs: ringRecs(2, 300, 216, false, 6) })], '換了透鏡不算');
expectNot('thin-film-h9', [newtonEv({ recs: ringRecs(1, 0, 216, false, 6) }), newtonEv({ e: 60, recs: ringRecs(1, 60, 216, false, 6) })], '只抬 60 nm 不算');

// h10：空氣劈與牛頓環，相鄰暗紋的厚度差都是 λ/(2n)
function wedgeRecs(D, L, n, lam, mw, vw, x0, jitter, maxN) {
  const dx = C.wedge({ D: D * UM, L: L * CM, n, lambda: lam * NM }).dx / MM, xa = x0 - vw / 2, step = vw / mw, recs = [];
  for (let k = Math.max(0, Math.ceil(xa / dx)); k * dx <= xa + vw && recs.length < maxN; k++) { const x = k * dx; if (x - xa < 2 * step || xa + vw - x < 2 * step) continue; recs.push({ k, v: xa + px(x - xa + (jitter ? (rnd() - 0.5) * step : 0), step) }); }
  return recs;
}
for (const [mw, fr] of [[370, 140], [1250, 216]]) {
  for (const [lam, n] of [[589, 1], [450, 1.33]]) {
    const w = wedgeEv({ lam, n, recs: wedgeRecs(20, 10, n, lam, mw, 10, 50, false, 6) });
    const k = newtonEv({ lam, n, recs: ringRecs(1, 0, fr, false, 6, lam, n) });
    const sw = Math.abs(w.data.fitDx) * MM * 20 * UM / (10 * CM), sn = k.data.slope * MM * MM / 2;
    expect('thin-film-h10', [w, k], 'λ ' + lam + '、n ' + n + '：空氣劈 Δx·D/L = ' + (sw / NM).toFixed(2) + ' nm，牛頓環 斜率/2R = ' + (sn / NM).toFixed(2) + ' nm（λ/2n = ' + (lam / 2 / n).toFixed(2) + ' nm）');
    let pass = 0;
    for (let i = 0; i < 300; i++) { const A = wedgeEv({ lam, n, recs: wedgeRecs(20, 10, n, lam, mw, 10, 50, true, 5) }), B = newtonEv({ lam, n, recs: ringRecs(1, 0, fr, true, 6, lam, n) }); if (run([A, B]).includes('thin-film-h10')) pass++; }
    console.log('     手抖 ±0.5 像素（空氣劈 5 條、牛頓環 6 個）：300 次中 ' + pass + ' 次通過');
  }
}
expectNot('thin-film-h10', [wedgeEv({ recs: wedgeRecs(20, 10, 1, 589, 370, 10, 50, false, 6) })], '只量空氣劈不算');
expectNot('thin-film-h10', [wedgeEv({ lam: 650, recs: wedgeRecs(20, 10, 1, 650, 370, 10, 50, false, 6) }), newtonEv({ recs: ringRecs(1, 0, 216, false, 6) })], '兩邊波長不同不算');
expectNot('thin-film-h10', [wedgeEv({ n: 1.33, recs: wedgeRecs(20, 10, 1.33, 589, 370, 10, 50, false, 6) }), newtonEv({ recs: ringRecs(1, 0, 216, false, 6) })], '兩邊介質不同不算');
expectNot('thin-film-h10', [wedgeEv({ recs: wedgeRecs(20, 10, 1, 589, 370, 10, 50, false, 3) }), newtonEv({ recs: ringRecs(1, 0, 216, false, 3) })], '各只量 3 筆不算');

// 等級分布（10 個隱藏任務要分散在 3–10 級，至少 3 個在 7 級以上）
{
  const hs = list.filter(m => m.hidden), lv = hs.map(m => m.level), hi = lv.filter(l => l >= 7).length, uniq = new Set(lv).size;
  const ok = hs.length === 10 && lv.every(l => l >= 3 && l <= 10) && hi >= 3 && uniq >= 5;
  if (!ok) bad++;
  console.log((ok ? 'OK   ' : 'FAIL ') + '隱藏任務 ' + hs.length + ' 個，等級 ' + lv.join(',') + '；7 級以上 ' + hi + ' 個；共 ' + uniq + ' 種等級');
}

console.log(bad ? '\n' + bad + ' 項失敗' : '\n全部通過：每個任務都做得到，預設狀態不會觸發任務。');
process.exit(bad ? 1 : 0);
