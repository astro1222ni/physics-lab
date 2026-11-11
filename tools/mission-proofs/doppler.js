/* 任務可達成的證明腳本（從製作時的暫存資料夾保存下來的快照）。用法：node tools/mission-proofs/doppler.js
 * 修改物理核心或任務條件後重跑，確認每個任務仍然做得到、預設狀態不會觸發任務。 */
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
// 用物理核心證明每個任務都做得到（模擬頁面的逐幀邏輯）
const DC = require(__ROOT + 'js/doppler-core.js');
const WX = 1400;
function P(o) {
  return { f: o.f || 2, v: o.v || 340, tStart: 0, src: { x: o.sx, y: 0, vx: o.vs, vy: 0 }, obs: { x: o.ox, y: o.oy, vx: o.vo || 0, vy: 0, t0: 0 } };
}
/** 模擬一趟：傳回 boom 時刻、統計 */
function run(o, dt) {
  dt = dt || 1 / 60;
  const p = P(o);
  let t = 0, prev = null;
  const r = { ratioMax: -Infinity, ratioMin: Infinity, heardTime: 0, tBoom: null, two: false, minDist: Infinity, theta: null };
  for (let i = 0; i < 200000; i++) {
    t += dt;
    const arr = DC.arrivals(p, t);
    if (prev && arr.length > prev.length && prev.length === 0 && o.vs >= (o.v || 340) && (arr.length === 2 || Math.abs(arr[0].fp) > 5 * p.f) && r.tBoom == null) {
      let lo = t - dt, hi = t;
      for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (DC.arrivals(p, m).length) hi = m; else lo = m; }
      r.tBoom = hi; r.theta = DC.machAngle(p.v, o.vs) * 180 / Math.PI;
    }
    if (arr.length) { const q = arr[0].fp / p.f; r.ratioMax = Math.max(r.ratioMax, q); r.ratioMin = Math.min(r.ratioMin, q); r.heardTime += dt; if (arr.length === 2) r.two = true; }
    const S = DC.sourceAt(p, t), O = DC.observerAt(p, t);
    r.minDist = Math.min(r.minDist, Math.hypot(O.x - S.x, O.y - S.y));
    prev = arr;
    if (o.vs > 0 && S.x > WX / 2 + 0.45 * WX) break;
    if ((o.vo || 0) !== 0 && Math.abs(O.x) > WX / 2 - 8) break;
    if (t > 120) break;
  }
  r.tEnd = t;
  return r;
}
function at(o, t) { const a = DC.arrivals(P(o), t); return { n: a.length, ratio: a[0] ? a[0].fp / (o.f || 2) : null, fp2: a[1] ? a[1].fp : null }; }
/** 找出 cond(t) 成立的時間區間（模擬時間） */
function windowOf(o, cond, t0, t1, h) {
  let first = null, last = null;
  for (let t = t0; t <= t1; t += h) if (cond(at(o, t))) { if (first == null) first = t; last = t; }
  return first == null ? null : [first, last];
}
const out = (k, v) => console.log(k.padEnd(12), JSON.stringify(v));

// 1：波源靠近預設，暫停時 f′/f > 1.01
const appr = { vs: 120, sx: -560, ox: 250, oy: -150 };
out('L1', windowOf(appr, (m) => m.n && m.ratio > 1.01, 0, 15, 0.01));
// 2：觀察者移動預設，v_o 改成 −120：f′/f ≥ 1.30
const obsm = { vs: 0, sx: -250, ox: 560, oy: -150, vo: -120 };
out('L2', windowOf(obsm, (m) => m.n && m.ratio >= 1.3, 0, 12, 0.01));
// 3：λ前 = (340 − 140)/2 = 100 m
out('L3', DC.wavelengthAhead(2, 340, 140));
// 4：音速預設：音障的音爆
const r4 = run({ vs: 340, sx: -600, ox: 200, oy: -170 });
out('L4', { tBoom: r4.tBoom });
// 5：v_s = 170，觀察者拖到道路上（y = 0）前方 → f′ = 2f
const o5 = { vs: 170, sx: -560, ox: 400, oy: 0 };
out('L5 road', windowOf(o5, (m) => m.n && Math.abs(m.ratio - 2) <= 0.01, 0, 6, 0.01));
const o5b = { vs: 175, sx: -560, ox: 250, oy: -150 };
out('L5 offroad', windowOf(o5b, (m) => m.n && Math.abs(m.ratio - 2) <= 0.01, 0, 10, 0.001));
// 6：波源靠近預設，經過時 |f′/f − 1| ≤ 0.005 的時間窗
const w6 = windowOf(appr, (m) => m.n === 1 && Math.abs(m.ratio - 1) <= 0.005, 6, 9, 0.0005);
out('L6 approach', { w: w6, len: w6 && w6[1] - w6[0] });
const o6 = { vs: 100, sx: -560, ox: 200, oy: -340 };
const w6b = windowOf(o6, (m) => m.n === 1 && Math.abs(m.ratio - 1) <= 0.005, 4, 14, 0.0005);
out('L6 far', { w: w6b, len: w6b && w6b[1] - w6b[0], realSlow: w6b && (w6b[1] - w6b[0]) / 0.25 });
// 7：v_s = 680 = 2v → θ = 30°
const r7 = run({ vs: 680, sx: -620, ox: 150, oy: -200 });
out('L7', { tBoom: r7.tBoom, theta: r7.theta });
// 8：A：波源 100 m/s 靠近，B：觀察者靠近；找出 B 的 v_o 讓比值相同
const A = at(appr, 2).ratio; // 波源靠近預設時 t = 2 s 暫停
let best = null;
for (let vo = -150; vo <= -50; vo += 0.1) {
  const o = { vs: 0, sx: -250, ox: 560, oy: -150, vo: vo };
  const w = windowOf(o, (m) => m.n && Math.abs(m.ratio - A) <= 0.005 * A, 0, 6, 0.005);
  if (w && w[1] - w[0] > 0.3) { best = { vo: +vo.toFixed(1), w }; break; }
}
out('L8', { A, best });
// 9：v_o = v_s = 120，觀察者放在 (−400, −150)：整趟 f′ = f
const r9 = run({ vs: 120, sx: -560, ox: -400, oy: -150, vo: 120 });
out('L9', { heardTime: r9.heardTime, max: r9.ratioMax, min: r9.ratioMin });
// 10：觀察者 (150, −200)，起點 −620，找 v_s 使音爆在 t = 3.00 s
function tb(vs) { return run({ vs, sx: -620, ox: 150, oy: -200 }, 1 / 240).tBoom; }
let lo = 408, hi = 700;
for (let k = 0; k < 50; k++) { const m = (lo + hi) / 2; if (tb(m) > 3) lo = m; else hi = m; }
const vs10 = (lo + hi) / 2;
out('L10', { vs: vs10, M: vs10 / 340, check: tb(Math.round(vs10 * 10) / 10), vsRounded: Math.round(vs10 * 10) / 10 });
// 也用解析式：t = (Δx + d·√(M² − 1)) / v_s
out('L10 formula', (770 + 200 * Math.sqrt((vs10 / 340) ** 2 - 1)) / vs10);
// h1：v = 150、v_o = +150，觀察者放在波源旁邊 (−240, −5)
const h1 = { v: 150, vs: 0, sx: -250, ox: -240, oy: -5, vo: 150 };
out('h1', windowOf(h1, (m) => m.n && m.ratio <= 0.02, 0, 7, 0.01));
const h1b = { v: 150, vs: 0, sx: -250, ox: -240, oy: -150, vo: 150 };
out('h1 offroad', windowOf(h1b, (m) => m.n && m.ratio <= 0.02, 0, 7, 0.01));
// h2：超音速預設：同時聽到兩個聲音的時間窗
const sup = { vs: 544, sx: -620, ox: 150, oy: -200 };
out('h2', windowOf(sup, (m) => m.n === 2, 0, 5, 0.001));
// h3：觀察者拖到道路上，波源從身上開過
const r3 = run({ vs: 120, sx: -560, ox: 250, oy: 0 });
out('h3', { minDist: r3.minDist });
const r3b = run({ vs: 120, sx: -560, ox: 250, oy: -150 });
out('h3 default', { minDist: r3b.minDist, ratioMax: r3b.ratioMax, ratioMin: r3b.ratioMin });
