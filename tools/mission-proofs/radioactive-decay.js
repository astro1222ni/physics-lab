/* 任務可達成的證明腳本（從製作時的暫存資料夾保存下來的快照）。用法：node tools/mission-proofs/radioactive-decay.js
 * 修改物理核心或任務條件後重跑，確認每個任務仍然做得到、預設狀態不會觸發任務。 */
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
// 用物理核心證明每個任務都做得到（模擬每幀 1/60 s 的時間步進，與網頁相同）
const DC = require(__ROOT + 'js/radioactive-decay-core.js');
const FPS = 60;
const seedRand = DC.rng(20261111);
const seed = () => (seedRand() * 4294967296) >>> 0;
function runNuclei(o, stopFn) {
  // o: N0, half, half2, rate (sim units per anim second), until(sim)
  const s = DC.createSim({ N0: o.N0, halfLife: o.half, halfLife2: o.half2, seed: seed() });
  const dt = o.rate / FPS;
  let frames = 0;
  while (!stopFn(s) && frames < 1e6) { DC.step(s, dt); frames++; }
  return s;
}
const pct = (k, n) => (100 * k / n).toFixed(1) + '%';
const out = [];
// 1: one half-life — trivially: custom T=3 s
{ const s = runNuclei({ N0: 1600, half: 3, rate: 1 }, s => s.t >= 3); out.push(`M1 一個半衰期：t=${s.t.toFixed(3)} s, N=${s.nP}`); }
// 2: dice 400 until N <= 200
{ let rolls = []; for (let k = 0; k < 500; k++) { const s = DC.createDice({ N0: 400, seed: seed() }); while (s.nP * 2 > 400) DC.roll(s); rolls.push(s.t); }
  out.push(`M2 骰子 400 顆：平均 ${(rolls.reduce((a, b) => a + b) / rolls.length).toFixed(2)} 擲剩一半（範圍 ${Math.min(...rolls)}–${Math.max(...rolls)}）`); }
// 3: 10000 at exactly T½ within 75
{ let ok = 0, n = 200; for (let k = 0; k < n; k++) { const s = DC.createSim({ N0: 10000, halfLife: 3, seed: seed() }); while (s.t < 3 - 1e-12) DC.step(s, Math.min(1 / 60, 3 - s.t)); if (Math.abs(s.nP - 5000) <= 75) ok++; }
  out.push(`M3 大數法則：N0=10000 在 t=T½ 時 |N−5000|≤75 的機率 ${pct(ok, n)}`); }
// 4, 1: trivial
out.push('M4 對數座標跑滿 4 個半衰期：任何設定都可以（例如自訂 T½=3 s，跑 12 s）');
// 5: five runs of 100 each ≥ 1 T½ — always possible
out.push('M5 五條 N0=100 的曲線：每輪跑超過 1 個半衰期再按「新的一輪」，共 5 次即可');
// 6: I-131 pause at 24.06 d ±0.3; speed 0.25× → per frame
{ const rate = 8.02 / 4 * 0.25, perFrame = rate / 60; out.push(`M6 碘-131：在 t = 3×8.02 = 24.06 天暫停；0.25× 速度時每幀 ${perFrame.toFixed(4)} 天，±0.3 天的窗口有 ${Math.floor(0.6 / perFrame)} 幀`); }
// 7: C-14, N0 1600: is there a frame where N/N0 in [0.245, 0.255]? with speed 0.25
{ let ok = 0, n = 40, frames = [];
  for (let k = 0; k < n; k++) { const s = DC.createSim({ N0: 1600, halfLife: 5730, seed: seed() }); const dt = 5730 / 4 * 0.25 / 60; let f = 0;
    while (s.nP > 0.245 * 1600 - 1) { DC.step(s, dt); if (Math.abs(s.nP / 1600 - 0.25) <= 0.005) f++; } if (f > 0) ok++; frames.push(f); }
  out.push(`M7 碳-14（N0=1600，0.25×）：有一段時間剩 25.0±0.5% 的機率 ${pct(ok, n)}，平均可暫停的幀數 ${(frames.reduce((a, b) => a + b) / n).toFixed(0)}（約在 ${(2 * 5730)} 年）`); }
// 8: tau ±1%: custom T½=3, τ=4.328 s; at 0.25× per-frame dt=0.00417 s, window ±0.0433 s
{ const tau = 3 / Math.LN2, per = 0.25 / 60; out.push(`M8 平均壽命：T½=3 s → τ=${tau.toFixed(3)} s，±1% 窗口 ${(0.02 * tau).toFixed(3)} s；0.25× 時每幀 ${per.toFixed(4)} s → ${Math.floor(0.02 * tau / per)} 幀；剩下比例 1/e≈36.8%`); }
// 9: daughter peak ±5%: custom T=3, T'=1: tmax
{ const tm = DC.daughterPeakTime(3, 1); out.push(`M9 子核高峰：自訂 T½=3 s、T½′=1 s → t_max=${tm.toFixed(3)} s，±5% 窗口 ${(0.1 * tm).toFixed(3)} s（1× 下 ${Math.floor(0.1 * tm * 60)} 幀）`); }
// 10: transient equilibrium — Mo-99 preset N0=10000 and custom T=20,T'=2 N0=10000: frames after 2 tmax where ratio within 3%
for (const [T1, T2, N0, rate, name] of [[65.94, 6.01, 10000, 65.94 / 4 * 0.25, '鉬-99 (10000, 0.25×)'], [20, 2, 10000, 0.5, '自訂 20 s / 2 s (10000, 0.5×)'], [20, 2, 1600, 0.5, '自訂 20 s / 2 s (1600, 0.5×)']]) {
  let ok = 0, n = 40, fr = 0; const eq = DC.equilibriumRatio(T1, T2), tm = DC.daughterPeakTime(T1, T2);
  for (let k = 0; k < n; k++) { const s = DC.createSim({ N0, halfLife: T1, halfLife2: T2, seed: seed() }); const dt = rate / 60; let f = 0;
    while (s.t < 6 * T1 && s.nP > 20) { DC.step(s, dt); if (s.t >= 2 * tm && s.nP > 0 && Math.abs(s.nD / s.nP / eq - 1) <= 0.03) f++; } if (f) ok++; fr += f; }
  out.push(`M10 暫態平衡 ${name}：平衡值 ${eq.toFixed(4)}，t≥2t_max=${(2 * tm).toFixed(2)}；出現可暫停時刻的機率 ${pct(ok, n)}，平均 ${(fr / n).toFixed(0)} 幀`); }
// 11: Mo-99 tmax ±1%
{ const tm = DC.daughterPeakTime(65.94, 6.01), per = 65.94 / 4 * 0.1 / 60; out.push(`M11 鉬-99：t_max = ln(λ2/λ1)/(λ2−λ1) = ${tm.toFixed(3)} 小時，±1% 窗口 ±${(0.01 * tm).toFixed(3)} 小時；0.1× 速度每幀 ${per.toFixed(4)} 小時 → ${Math.floor(0.02 * tm / per)} 幀`); }
// 12: mystery: strategy A = pause when N first ≤ 5000 (N0=10000) read t; strategy B = fit (guess curve) over 3 half-lives
{ let okA = 0, okB = 0, n = 150;
  for (let k = 0; k < n; k++) { const T = 2 + seedRand() * 10; const s = DC.createSim({ N0: 10000, halfLife: T, seed: seed() }); const ts = [0], Ns = [10000]; let tA = null;
    while (s.t < 3 * T) { DC.step(s, 1 / 60); ts.push(s.t); Ns.push(s.nP); if (tA == null && s.nP <= 5000) tA = s.t; }
    if (Math.abs(tA / T - 1) <= 0.015) okA++; const f = DC.fitExponential(ts, Ns, 5); if (Math.abs(f.halfLife / T - 1) <= 0.015) okB++; }
  out.push(`M12 神秘核種（N0=10000、1×）：方法 A 讀 N 降到 5000 的時刻，誤差≤1.5% 的機率 ${pct(okA, n)}；方法 B 用猜測曲線貼合 3 個半衰期的資料（等同擬合），機率 ${pct(okB, n)}`); }
// h1: last of 100 survives beyond 10 T½
{ let ok = 0, n = 3000; for (let k = 0; k < n; k++) { const s = DC.createSim({ N0: 100, halfLife: 3, seed: seed() }); const dt = 3 * 8 / 60 / 4; while (s.nP > 0) DC.step(s, dt); if (s.t / 3 > 10) ok++; }
  out.push(`H1 最後一個原子核撐過 10 個半衰期（N0=100，8× 速度）：每輪機率 ${pct(ok, n)}（理論 1−(1−2^−10)^100 = ${(100 * (1 - Math.pow(1 - 1 / 1024, 100))).toFixed(1)}%）`); }
// h2: dice roll with ≥12 dice and no six
{ let ok = 0, n = 2000; for (let k = 0; k < n; k++) { const s = DC.createDice({ N0: 100, seed: seed() }); let hit = false; while (s.nP > 0) { const b = s.nP, d = DC.roll(s); if (b >= 12 && d === 0) hit = true; } if (hit) ok++; }
  out.push(`H2 至少 12 顆骰子卻沒有任何 6 點（N0=100）：每輪出現的機率 ${pct(ok, n)}`); }
// h3: equal half-lives, pause at tmax = τ ±3%
{ const tm = DC.daughterPeakTime(3, 3); out.push(`H3 母子同壽：自訂 T½ = T½′ = 3 s → t_max = τ = ${tm.toFixed(3)} s，±3% 窗口 ${(0.06 * tm).toFixed(3)} s（1× 下 ${Math.floor(0.06 * tm * 60)} 幀）`); }
console.log(out.join('\n'));
