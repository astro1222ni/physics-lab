/* 任務可達成的證明腳本（從製作時的暫存資料夾保存下來的快照）。用法：node tools/mission-proofs/elevator.js
 * 修改物理核心或任務條件後重跑，確認每個任務仍然做得到、預設狀態不會觸發任務。 */
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
// 用物理核心證明每個任務在滑桿範圍與精度內做得到
const E = require(__ROOT + 'js/elevator-core.js');
const g = E.G, h = E.BALL_H;
const out = (id, ok, msg) => console.log((ok ? 'OK  ' : 'NO  ') + id.padEnd(13) + msg);

// 1
out('elevator-1', true, '任一趟（例：1F→2F，2√3 = ' + (2 * Math.sqrt(3)).toFixed(3) + ' s）');
// 2：10F、預設 vt = 5、ab = 4.9
{ const y = E.predictStop(27, 0, 5, 4.9); out('elevator-2', y >= 0 && E.reading(60, -g) === 0, `10F 剪斷（預設）：自由落體讀數 0，停在 y = ${y.toFixed(3)} m`); }
// 3：1F→10F 預設，減速段 v > 0、a = −1
{ const tr = E.tripProfile(0, 27, 1, 2.5, 0); const d = tr.find(s => s.kind === 'dec'); const r = E.reading(60, d.a);
  out('elevator-3', d.v0 > 0 && r < 60, `上行減速段：v 由 ${d.v0} 降到 0，讀數 ${r.toFixed(2)} kgw，持續 ${(d.t1 - d.t0).toFixed(2)} s 可按暫停`); }
// 4
{ const r = E.reading(60, 1.96); out('elevator-4', Math.abs(r - 72) <= 0.05, `A = 1.96（打字）→ ${r.toFixed(4)} kgw；或 ab… 最小 2.0 不行（${E.reading(60, 2).toFixed(2)}）`); }
// 5
{ const k = E.springExtension(E.springTension(1, 7.84)) / E.springExtension(E.springTension(1, 0)); out('elevator-5', Math.abs(k - 1.8) <= 0.009, `ab = 7.84（打字）→ 伸長量比 ${k.toFixed(5)}（行程最大 A = 3 只到 ${(1 + 3 / g).toFixed(3)}）`); }
// 6
{ const up = E.tripProfile(0, 9, 0.98, 2.5, 0)[0], dn = E.tripProfile(9, 0, 0.98, 2.5, 0).find(s => s.kind === 'dec');
  out('elevator-6', Math.abs(E.reading(60, up.a) - 66) < 0.1 && Math.abs(E.reading(60, dn.a) - 66) < 0.1 && dn.v0 < 0,
    `A = 0.98：上行加速 ${E.reading(60, up.a).toFixed(3)}、下行減速 ${E.reading(60, dn.a).toFixed(3)} kgw（A 在 0.97–0.99 都可以）`); }
// 7：神秘電梯，讀數顯示到 0.1 kgw，m 30–100 kg
{ let worst = 0;
  for (let m = 30; m <= 100; m++) for (let A = 0.5; A <= 2.5001; A += 0.01) {
    const shown = Math.round(E.reading(m, A) * 10) / 10, est = g * (shown / m - 1);
    worst = Math.max(worst, Math.abs(est - A));
  }
  out('elevator-7', worst <= 0.02, `由顯示的讀數（0.1 kgw）推算：最大誤差 ${worst.toFixed(4)} m/s²（m = 30 kg 時最大），容許 0.02`); }
// 8：A = 2.30，V = 6，1F→10F 的加速段中放開
{ const tr = E.tripProfile(0, 27, 2.3, 6, 0); const s = E.stateAt(tr, 0.5);
  const tl = E.ballLanding(tr, { tr: 0.5, yb: s.y + h, vb: s.v }, 0.5); const ratio = (tl - 0.5) / E.fallTime(h, 0);
  out('elevator-8', Math.abs(ratio - 0.9) <= 0.0045 && tl < tr[0].t1, `A = 2.3、V = 6：加速段 ${tr[0].t1.toFixed(2)} s 內放開，t/t0 = ${ratio.toFixed(5)}（可放開的時間窗 ${(tr[0].t1 - (tl - 0.5)).toFixed(2)} s）`); }
// 9：5F（y = 15）靜止剪斷
{ const sols = [[6.26, 4.9], [7.67, 9.8], [5.42, 2.94]].map(([vt, ab]) => { const y = E.predictStop(15, 0, vt, ab); return `vt ${vt}、ab ${ab} → 停在 ${y.toFixed(4)}（差 ${((y - 9) * 100).toFixed(2)} cm）`; });
  const ok = Math.abs(E.predictStop(15, 0, 6.26, 4.9) - 9) <= 0.03;
  out('elevator-9', ok, '5F 斷纜降到 3F：' + sols.join('；')); }
// 10
{ const tr = E.tripProfile(0, 27, 0.98, 6, 0); const T = tr[tr.length - 1].t0;
  const rs = tr.map(s => E.reading(60, s.a)); const lo = Math.min(...rs), hi = Math.max(...rs);
  let range = []; for (let A = 0.95; A <= 1.0001; A += 0.01) { const t = E.tripDuration(27, A, 6); const r1 = E.reading(60, A), r0 = E.reading(60, -A); if (t <= 10.6 && r1 <= 66 + 1e-6 && r0 >= 54 - 1e-6) range.push(A.toFixed(2)); }
  out('elevator-10', T <= 10.6 && hi <= 66 + 1e-6 && lo >= 54 - 1e-6, `A = 0.98、V = 6：T = ${T.toFixed(3)} s，讀數 ${lo.toFixed(2)}–${hi.toFixed(2)}；可行的 A：${range.join(', ')}（V ≥ √(27A) ≈ 5.1）`); }
// 11：手動駕駛 1F → 6F：V = 0.5、A = 3，按住 ▲ 到 V，等速，在 y = 15 − V²/(2A) 按 ▼
{ const A = 3, V = 0.5;
  let tr = E.manualPlan(0, 0, 0, 1, A, V); const s1 = E.stateAt(tr, 1); tr = E.manualPlan(1, s1.y, s1.v, 0, A, V);
  const cr = tr[0]; const yPress = 15 - V * V / (2 * A); const tPress = cr.t0 + (yPress - cr.y0) / V;
  const res = [-0.06, 0, 0.06].map(dt => { const st = E.stateAt(tr, tPress + dt); const p = E.manualPlan(tPress + dt, st.y, st.v, -1, A, V); return p[p.length - 1].y0 - 15; });
  out('elevator-11', res.every(e => Math.abs(e) <= 0.03 + 1e-9) && !tr.slice(0, 1).some(s => s.kind === 'protect'),
    `V = 0.5、A = 3：在 y = ${yPress.toFixed(4)} m 按住 ▼，提早／延後 0.06 s 的停點誤差 ${res.map(e => (e * 100).toFixed(1) + ' cm').join('、')}（慢動作時真實時間容許 ±0.24 s）`); }
// 12：ab = 5.83、vt = 10，煞車段中放開
{ const tr = E.freeFallPlan(0, 27, 0, 10, 5.83); const tb = tr[1].t0 + 0.2; const s = E.stateAt(tr, tb);
  const tl = E.ballLanding(tr, { tr: tb, yb: s.y + h, vb: s.v }, tb);
  const okA = []; for (let ab = 5.7; ab <= 5.95; ab += 0.01) { const t = E.fallTime(h, ab); if (Math.abs(t - 0.4) <= 0.001) okA.push(ab.toFixed(2)); }
  out('elevator-12', Math.abs(tl - tb - 0.4) <= 0.001 && tl < tr[1].t1, `ab = 5.83、vt = 10：煞車段 ${(tr[1].t1 - tr[1].t0).toFixed(2)} s，放開後 t = ${(tl - tb).toFixed(5)} s；可行的 ab：${okA[0]}–${okA[okA.length - 1]}（10F 起始需停在 ${tr[2].y0.toFixed(2)} m ≥ 0）`); }
// h1：vt = 10、ab = 9.8 從 8F（21 m）剪斷，0.1 s 後放開小球
{ const tr = E.freeFallPlan(0, 21, 0, 10, 9.8); const s = E.stateAt(tr, 0.1);
  const ball = { tr: 0.1, yb: s.y + h, vb: s.v }; const tl = E.ballLanding(tr, ball, 0.1);
  const ft = Math.min(tl, tr[0].t1) - 0.1;
  out('elevator-h1', ft >= 0.3 && tr[2].y0 >= 0, `8F、vt = 10、ab = 9.8：剪斷後 0.1 s 放開，漂浮 ${ft.toFixed(3)} s，停在 ${tr[2].y0.toFixed(2)} m`); }
// h2
out('elevator-h2', Math.abs(E.reading(60, 9.8) / 60 - 2) < 1e-12, `ab = 9.8（最大值）：讀數 = 2 × 實重`);
// h3：1F→10F（預設）等速 2.5 m/s 時在 y = 10 m 剪斷
{ const y = E.predictStop(10, 2.5, 5, 4.9); out('elevator-h3', y >= 0, `上行 2.5 m/s 時於 y = 10 m 剪斷：先再上升 ${(2.5 * 2.5 / 2 / g).toFixed(3)} m，最後停在 ${y.toFixed(2)} m`); }
