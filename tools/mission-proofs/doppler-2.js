/* 任務可達成的證明腳本（從製作時的暫存資料夾保存下來的快照）。用法：node tools/mission-proofs/doppler-2.js
 * 修改物理核心或任務條件後重跑，確認每個任務仍然做得到、預設狀態不會觸發任務。 */
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const DC = require(__ROOT + 'js/doppler-core.js');
function P(o) { return { f: o.f || 2, v: o.v || 340, tStart: 0, src: { x: o.sx, y: 0, vx: o.vs, vy: 0 }, obs: { x: o.ox, y: o.oy, vx: o.vo || 0, vy: 0, t0: o.t0 || 0 } }; }
function at(o, t) { const a = DC.arrivals(P(o), t); return { n: a.length, ratio: a[0] ? a[0].fp / (o.f || 2) : null }; }
function windowOf(o, cond, t0, t1, h) { let first = null, last = null; for (let t = t0; t <= t1; t += h) if (cond(at(o, t))) { if (first == null) first = t; last = t; } return first == null ? null : [first, last]; }
// L8
const appr = { vs: 100, sx: -560, ox: 250, oy: -150 };
const A = at(appr, 4).ratio;
console.log('L8 A (vs=100, t=4)', A);
for (let vo = -150; vo <= -50; vo += 0.5) {
  const o = { vs: 0, sx: -250, ox: 560, oy: -150, vo };
  const w = windowOf(o, (m) => m.n && Math.abs(m.ratio - A) <= 0.005 * A, 0, 6, 0.005);
  if (w) { console.log('L8 B vo', vo, w); }
}
// L10：觀察者 (600, −200)、波源起點 −620；第一次 boom 時刻（用解析：計數由 0 變 2）
function tBoom(vs, ox, oy) {
  const p = P({ vs, sx: -620, ox, oy });
  let lo = 0, hi = 20;
  // 找第一個有聲音的時刻（之前都沒有）
  for (let t = 0.001; t < 20; t += 0.001) if (DC.arrivals(p, t).length) { hi = t; lo = t - 0.001; break; }
  for (let k = 0; k < 50; k++) { const m = (lo + hi) / 2; if (DC.arrivals(p, m).length) hi = m; else lo = m; }
  return hi;
}
for (const [ox, oy] of [[600, -200], [650, -250], [550, -300]]) {
  let lo = 408, hi = 700;
  if (tBoom(lo, ox, oy) < 3) { console.log('L10', ox, oy, 'unreachable at M=1.2', tBoom(lo, ox, oy)); continue; }
  for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (tBoom(m, ox, oy) > 3) lo = m; else hi = m; }
  const vs = Math.round((lo + hi) / 2 * 10) / 10;
  console.log('L10', ox, oy, 'vs =', vs, 'M =', (vs / 340).toFixed(3), 'tBoom =', tBoom(vs, ox, oy), 'formula', (ox + 620 + Math.abs(oy) * Math.sqrt((vs / 340) ** 2 - 1)) / vs);
}
// h1：v = 150、靜止的波源在 0，觀察者 (100, −20)；t = 1.5 s 時開始以 +150 跑開
const o = { v: 150, vs: 0, sx: 0, ox: 100, oy: -20, vo: 150, t0: 1.5 };
for (const t of [1.6, 2, 3, 4]) console.log('h1 t', t, at(o, t));
const o2 = { v: 150, vs: 0, sx: 0, ox: 380, oy: -180, vo: 150, t0: 3.5 };
for (const t of [3.6, 4, 5]) console.log('h1 default-pos t', t, at(o2, t));
