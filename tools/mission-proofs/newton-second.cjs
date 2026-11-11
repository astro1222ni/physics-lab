/* 任務可達成的證明腳本（從製作時的暫存資料夾保存下來的快照）。用法：node tools/mission-proofs/newton-second.cjs
 * 修改物理核心或任務條件後重跑，確認每個任務仍然做得到、預設狀態不會觸發任務。 */
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
// 用物理核心證明每個任務都做得到（模擬頁面發出的事件，直接跑任務檔的 check）
const NS = require(__ROOT + 'js/newton-second-core.js');
const defs = {};
global.window = { NewtonSecondCore: NS, LabMission: { register: (id, list) => list.forEach(m => defs[m.id] = m) } };
global.LabMission = global.window.LabMission;
require(__ROOT + 'js/missions/newton-second.js');
const G = 9.8, DEG = Math.PI / 180, D = 0.5;
const r3 = (x) => Math.round(x * 1000) / 1000, r2 = (x) => Math.round(x * 100) / 100;
let mysteryId = 0;
function run(o) {
  const s = Object.assign({ M: 0.5, m: 0.05, mu: 0.02, thDeg: 0, attached: true, v0: 0.3, freq: 60, N: 6, mystery: false, mysteryId: 0, noise: false }, o);
  const p = { M: s.M, m: s.m, mu: s.mu, theta: s.thDeg * DEG, attached: s.attached };
  const d = NS.dynamics(p);
  const r = NS.makeRun(p, { v0: s.attached ? 0 : s.v0, D, hold: 1.2 });
  const dots = NS.dots(r, s.freq, s.noise ? { sigma: 3e-4, seed: 7 } : null);
  const st = NS.strips(dots, s.N, s.freq, r.stopped && r.moves ? r.tStop : null);
  const fit = st.fit;
  return {
    attached: s.attached, M: s.M, m: s.attached ? s.m : 0, Mtot: s.M + (s.attached ? s.m : 0), mu: s.mu, thDeg: s.thDeg,
    tanTheta: Math.tan(s.thDeg * DEG), mystery: s.mystery, mysteryId: s.mysteryId, v0: s.attached ? 0 : s.v0,
    a: d.startsFromRest || !s.attached ? d.aMove : 0, T: s.attached ? (d.startsFromRest ? d.T : d.W) : 0, W: d.W, f: d.f,
    freq: s.freq, noise: s.noise, moved: r.moves, reachedEnd: r.reachedEnd, stopped: r.stopped && r.moves, xEnd: r.xEnd, vEnd: r.vEnd, tEnd: r.tEnd,
    aMeas: fit ? fit.slope : NaN, intercept: fit ? fit.intercept : NaN, r2: fit ? fit.r2 : NaN, nStrips: st.used, nDots: dots.length, N: s.N, tau: s.N / s.freq
  };
}
const point = (e) => ({ M: e.M, m: e.m, Mtot: e.Mtot, F: e.m * G, a: e.aMeas, mu: e.mu, thDeg: e.thDeg, mystery: e.mystery, mysteryId: e.mysteryId, noise: e.noise });
function check(id, type, data) { const m = defs[id]; return m.check({ type, data }, m.mem || (m.mem = {})); }
function series(exp, axis, runs) { return { exp, axis, n: runs.length, points: runs.map(point) }; }
const out = [];
function report(id, ok, how) { out.push((ok ? 'OK  ' : 'FAIL') + ' ' + id.padEnd(18) + ' L' + defs[id].level + '  ' + how); }

// 預設狀態放開：只應完成任務 1
const def = run({});
const trig = Object.keys(defs).filter(id => { const m = defs[id]; return m.check({ type: 'run', data: def }, {}); });
console.log('預設放開觸發：', trig.join(', '), ' a =', def.aMeas.toFixed(4), 'tEnd', def.tEnd.toFixed(3));

report('newton-second-1', check('newton-second-1', 'run', def), '預設：M 0.500、m 0.050 放開 → 撞上擋板');
let e = run({ freq: 50, N: 5 });
report('newton-second-2', check('newton-second-2', 'run', e), `50 Hz、N = 5 → ${e.nStrips} 條紙條`);
e = run({ m: 0.074, mu: 0.02, M: 0.5 });
// 找 a = 1.00：M = 0.5、μ = 0.02 時 m = ?
let best = null;
for (let m = 0.01; m <= 0.5; m = r3(m + 0.001)) { const x = run({ m }); if (!best || Math.abs(x.aMeas - 1) < Math.abs(best.aMeas - 1)) best = x; }
report('newton-second-3', check('newton-second-3', 'run', best), `M 0.500、μ 0.020、m ${best.m} → a = ${best.aMeas.toFixed(4)}`);
e = run({ attached: false, mu: 0.02, thDeg: 1.15, v0: 0.3 });
report('newton-second-4', check('newton-second-4', 'run', e), `取下吊掛物、μ 0.020、θ 1.15°、v0 0.30 → a = ${e.aMeas.toExponential(2)}`);
e = run({ M: 2.0, m: 0.035, mu: 0.02, thDeg: 1.15 });
report('newton-second-5', check('newton-second-5', 'run', e), `M 2.000、m 0.035、θ 1.15° → T/mg = ${(e.T / e.W).toFixed(4)}, a = ${e.aMeas.toFixed(3)}`);
// 6：M 固定 0.5，m 0.05–0.25
let runs = [0.05, 0.1, 0.15, 0.2, 0.25].map(m => run({ M: 0.5, m, thDeg: 1.15 }));
report('newton-second-6', check('newton-second-6', 'series', series(1, 'F', runs)), `M 0.500，m = 0.05…0.25 → 最後一點 a/(mg/M) = ${(runs[4].aMeas / (0.25 * G / 0.5)).toFixed(3)}`);
// 7：M+m = 0.60，用移動槽碼 m = 0.02…0.06
runs = [0.02, 0.03, 0.04, 0.05, 0.06].map(m => run({ M: r3(0.6 - m), m, mu: 0.02, thDeg: 1.15 }));
let f = NS.fitLine(runs.map(x => x.m * G), runs.map(x => x.aMeas));
report('newton-second-7', check('newton-second-7', 'series', series(1, 'F', runs)), `μ 0.020、θ 1.15°，M + m = 0.600，m = 0.02…0.06 → 截距 ${f.intercept.toExponential(2)}, r² ${f.r2.toFixed(6)}`);
// 7 反例：沒平衡摩擦
const bad = [0.02, 0.03, 0.04, 0.05, 0.06].map(m => run({ M: r3(0.6 - m), m, mu: 0.02, thDeg: 0 }));
console.log('  反例（θ = 0）任務 7：', check('newton-second-7', 'series', series(1, 'F', bad)), '截距', NS.fitLine(bad.map(x => x.m * G), bad.map(x => x.aMeas)).intercept.toFixed(4));
// 8：未知 μ（0.015–0.045 全部）都找得到 θ（小數 2 位）讓 |a| ≤ 0.005
let worst8 = 0;
for (let mu = 0.015; mu <= 0.045 + 1e-9; mu = r3(mu + 0.001)) {
  const th = r2(Math.atan(mu) / DEG);
  const x = run({ attached: false, mu, thDeg: th, v0: 0.3, mystery: true, mysteryId: 1 });
  if (!check('newton-second-8', 'run', x)) { worst8 = Infinity; console.log('  8 失敗 μ =', mu); }
  worst8 = Math.max(worst8, Math.abs(x.aMeas));
}
report('newton-second-8', worst8 <= 0.005, `所有 μ ∈ [0.015, 0.045]：θ = atan μ 取到 0.01° → 最大 |a| = ${worst8.toExponential(2)}（也可先推一次量 a = −μg 求 μ）`);
// 9：m 固定 0.05，M = 0.2…1.0
runs = [0.2, 0.3, 0.45, 0.65, 0.95].map(M => run({ M, m: 0.05, mu: 0.02, thDeg: 1.15 }));
f = NS.fitLine(runs.map(x => 1 / x.Mtot), runs.map(x => x.aMeas));
report('newton-second-9', check('newton-second-9', 'series', series(2, 'inv', runs)), `μ 0.020、θ 1.15°、m 0.050，M = 0.20…0.95 → 截距 ${f.intercept.toExponential(2)}, r² ${f.r2.toFixed(6)}`);
// 10：g（橫軸 m）
runs = [0.02, 0.03, 0.04, 0.05].map(m => run({ M: r3(0.6 - m), m, mu: 0.03, thDeg: 1.72 }));
f = NS.fitLine(runs.map(x => x.m), runs.map(x => x.aMeas));
report('newton-second-10', check('newton-second-10', 'series', series(1, 'm', runs)), `μ 0.030、θ 1.72°、M + m 0.600、m 0.02…0.05 → g = ${(f.slope * 0.6).toFixed(4)}`);
const bad10 = [0.02, 0.03, 0.04, 0.05].map(m => run({ M: r3(0.6 - m), m, mu: 0.03, thDeg: 0 }));
console.log('  反例（θ = 0）任務 10：', check('newton-second-10', 'series', series(1, 'm', bad10)), 'g =', (NS.fitLine(bad10.map(x => x.m), bad10.map(x => x.aMeas)).slope * 0.6).toFixed(4));
// 11：未知 μ、θ = 0：所有 μ 都找得到 m（3 位小數）讓 tEnd = 1.00 ± 0.01
let ok11 = true, ex11 = '';
for (let mu = 0.015; mu <= 0.045 + 1e-9; mu = r3(mu + 0.001)) {
  const M = 1.5; // 先推一下量出 μ = −a/g，再算 m = (aM + μMg)/(g − a)，a = 2D/t² = 1
  const push = run({ attached: false, mu, thDeg: 0, v0: 0.5, mystery: true });
  const muEst = -push.aMeas / G;
  const m = r3((1 * M + muEst * M * G) / (G - 1));
  const x = run({ M, m, mu, thDeg: 0, mystery: true, mysteryId: 2 });
  if (!check('newton-second-11', 'run', x)) { ok11 = false; console.log('  11 失敗 μ', mu, x.tEnd); }
  if (Math.abs(mu - 0.03) < 1e-9) ex11 = `μ 0.030：推一下量得 a = ${push.aMeas.toFixed(4)} → μ = ${muEst.toFixed(4)}；M 1.500、m ${m} → t = ${x.tEnd.toFixed(4)} s`;
}
report('newton-second-11', ok11, '所有 μ ∈ [0.015, 0.045] 皆可；例 ' + ex11);
// 12：未知 μ，先平衡（θ 取 0.01°），再固定總質量 1.0，m 0.05…0.10
let ok12 = true, ex12 = '';
for (let mu = 0.015; mu <= 0.045 + 1e-9; mu = r3(mu + 0.001)) {
  const push = run({ attached: false, mu, thDeg: 0, v0: 0.5, mystery: true });
  const th = r2(Math.atan(-push.aMeas / G) / DEG);
  const rs = [0.05, 0.06, 0.07, 0.08, 0.1].map(m => run({ M: r3(1.0 - m), m, mu, thDeg: th, mystery: true, mysteryId: 3 }));
  const ff = NS.fitLine(rs.map(x => x.m), rs.map(x => x.aMeas));
  if (!check('newton-second-12', 'series', series(1, 'm', rs))) { ok12 = false; console.log('  12 失敗 μ', mu, ff.slope); }
  if (Math.abs(mu - 0.03) < 1e-9) ex12 = `μ 0.030 → θ ${th}°，M + m 1.000、m 0.05…0.10 → g = ${(ff.slope * 1.0).toFixed(4)}`;
}
report('newton-second-12', ok12, '所有 μ 皆可；例 ' + ex12);
// 隱藏
e = run({ M: 2.0, m: 0.03, mu: 0.02 });
report('newton-second-h1', check('newton-second-h1', 'run', e), `M 2.000、m 0.030、μ 0.020：mg = ${(0.03 * G).toFixed(3)} N < μMg = ${(0.02 * 2 * G).toFixed(3)} N → 不動`);
e = run({ M: 0.2, m: 0.5, mu: 0.02 });
report('newton-second-h2', check('newton-second-h2', 'run', e), `M 0.200、m 0.500 → a = ${e.aMeas.toFixed(3)} = ${(e.aMeas / G).toFixed(3)} g，${e.nStrips} 條紙條`);
best = null;
for (let v = 0.3; v <= 0.6; v = r3(v + 0.001)) { const x = run({ attached: false, mu: 0.02, thDeg: 0, v0: v }); if (x.stopped && D - x.xEnd <= 0.005 && (!best || x.xEnd > best.xEnd)) best = x; }
report('newton-second-h3', best && check('newton-second-h3', 'run', best), best ? `取下、μ 0.020、θ 0、v0 = ${best.v0} → 停在 ${(best.xEnd * 100).toFixed(2)} cm（擋板 50 cm）` : '找不到');
console.log(out.join('\n'));
// 等級分布
console.log('等級：', Object.values(defs).map(m => m.id.replace('newton-second-', '') + ':' + m.level).join(' '));
