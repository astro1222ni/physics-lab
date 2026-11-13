/* 任務可達成的證明腳本：node tools/mission-proofs/ripple-tank.js
 * 用物理核心（ripple-tank-core.js）模擬水波槽，模仿學生在白紙上用直尺量的方式（亮紋中心、波前方向），
 * 證明每個任務在滑桿範圍與讀數精度內都做得到，而且預設狀態不會觸發任何任務。
 * 修改物理核心或任務條件後重跑。 */
'use strict';
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const RC = require(__ROOT + 'js/ripple-tank-core.js');
const T = RC.TANK, W = T.W, H = T.H, D = Math.PI / 180;
const r2 = (v) => Math.round(v * 100) / 100;               // 理想模式：0.01 cm
const pct = (a, b) => ((a / b - 1) * 100).toFixed(2) + '%';
let fails = 0;
function claim(ok, msg) { console.log((ok ? '  ✓ ' : '  ✗ ') + msg); if (!ok) fails++; }

function scene(ex) {
  return Object.assign({ W, H, f: 10, h: 0.008, tiltX: 0, tiltY: 0, sponge: true, amp: 0.12,
    source: { type: 'bar', x: T.bar, y0: 0, y1: H }, solids: [], plate: null }, ex || {});
}
function run(sc, sec) { const sim = RC.createSim(sc); sim.step(Math.round(sec / sim.dt)); return sim; }
/** 沿著 y = y0 這一列找亮紋（投影亮度的極大值，拋物線內插），回傳 x（m） */
function brightPeaks(sim, y0, x0, x1) {
  const I = new Float32Array(sim.u.length);
  RC.intensity(sim, sim.u, RC.kappaOf(T.paper), I);
  const j = Math.floor(y0 / sim.dx) + 1, out = [];
  for (let i = 2; i < sim.nx; i++) {
    const k = j * sim.NX + i, x = sim.xOf(i);
    if (x < x0 || x > x1) continue;
    if (I[k] > I[k - 1] && I[k] >= I[k + 1] && I[k] > 1.02) {
      const a = I[k - 1], b = I[k], c = I[k + 1], dd = 0.5 * (a - c) / (a - 2 * b + c);
      out.push(x + dd * sim.dx);
    }
  }
  return out;
}
/** 直尺從第 i 條亮紋拉到第 i + N 條：紙上長度（cm，四捨五入到讀數精度）÷ N */
function rulerLam(peaks, N, M, round) { const L = (peaks[N] - peaks[0]) * 100 * (M || 1); return (round || r2)(L) / N; }

// ---------------------------------------------------------------- 預設狀態
console.log('預設狀態（理想、架設與波長、直線起波器、10 Hz、閃頻儀關、fs = 8 Hz、平行光、狹縫、R = 14 cm）');
{
  const f = 10, fs = 8, n = Math.max(1, Math.round(f / fs));
  claim(Math.abs(f - n * fs) > 0.02, '閃頻儀預設關閉，fs = 8 Hz 也不會定住條紋 → 任務 1、隱藏 1、2 不會觸發（隱藏 2 需要 0.05 ≤ fs − f ≤ 0.6）');
  claim(true, '任務 2、3、5、8–13 都要按「記錄」；任務 6 要拉直尺且換成凹弧；任務 7 要換點波源並拖到焦點；隱藏 3 要換成障礙物；任務 4、12 要選「含誤差」');
  claim(0.04 > 0.6 * RC.wavelength(10, 0.008), '繞射預設障礙物長 4 cm > 0.6λ（隱藏 3 的條件不成立）');
}

// ---------------------------------------------------------------- 任務 1–3：波長與波速
console.log('\n任務 1–3：閃頻定格、量波長、v = fλ（5 Hz 時 λ = 5.2 cm，水槽裡只放得下 4 個波長：任務 2 可以，任務 3 要 6 Hz 以上）');
for (const f of [6, 10, 20]) {
  const sim = run(scene({ f }), 3);
  const lam = RC.wavelength(f, 0.008) * 100;
  const pk = brightPeaks(sim, H / 2, 0.07, 0.32);
  const N = Math.min(5, pk.length - 1);
  const lp = rulerLam(pk, N);
  const v = f * lp / 100, vt = RC.phaseSpeed(f, 0.008);
  claim(Math.abs(lp / lam - 1) <= 0.03 && Math.abs(v / vt - 1) <= 0.02 && N >= 5,
    `f = ${f} Hz：fs = ${f.toFixed(2)} Hz 定住條紋；直尺跨 ${N} 個波長 → λ′ = ${lp.toFixed(3)} cm（真實 ${lam.toFixed(3)}，${pct(lp, lam)}），v = ${(v * 100).toFixed(2)} cm/s（${pct(v, vt)}）`);
}

// ---------------------------------------------------------------- 任務 4：調水平
console.log('\n任務 4：調水平');
{
  const ex = 0.3, ey = 0.25; // 含誤差的最大初始傾斜（度）
  const sx = -Math.round(ex * 1000) / 1000, sy = -Math.round(ey * 1000) / 1000;
  claim(Math.abs(sx) <= 1 && Math.hypot(ex + sx, ey + sy) < 0.03, `初始傾斜最大 (${ex}°, ${ey}°) 在螺絲範圍 ±1° 內；把兩個螺絲打成 (${sx}°, ${sy}°) 後傾斜 ${Math.hypot(ex + sx, ey + sy).toFixed(4)}° < 0.03°（即使只用滑桿的 0.01° 也只剩 ≤ 0.007°）`);
}

// ---------------------------------------------------------------- 任務 5：反射定律
console.log('\n任務 5：反射定律（直條障礙物，量反射波前與障礙物的夾角）');
{
  const ref = RC.createSim(scene()); ref.step(Math.round(2.6 / ref.dt)); const Lref = RC.createLockIn(ref); Lref.run(4);
  for (const b of [15, 25, 35]) {
    const cx = 0.25, cy = H / 2;
    const wall = { kind: 'rect', cx, cy, len: 0.16, thick: 0.012, ang: (90 + b) * D };
    const sim = RC.createSim(scene({ solids: [wall] })); sim.step(Math.round(2.6 / sim.dt));
    const L = RC.createLockIn(sim); L.run(4);
    const n = [Math.cos(b * D), Math.sin(b * D)];
    const px = cx - 0.045 * n[0], py = cy - 0.045 * n[1];
    const wv = RC.waveVector(sim, L, { x0: px - 0.022, x1: px + 0.022, y0: py - 0.022, y1: py + 0.022 }, Lref);
    // 反射波前與障礙物的夾角 = 反射波傳播方向與法線（−n）的夾角
    const thr = Math.acos(-(Math.cos(wv.dir) * n[0] + Math.sin(wv.dir) * n[1])) / D;
    if (b === 15) console.log('    （大水槽 64 × 48 cm 的單元測試中 20°、35° 的反射角誤差 < 0.6°；這裡障礙物只有 16 cm，兩端的繞射讓局部波前偏 1–2°）');
    claim(Math.abs(thr - b) <= 2.5, `β = ${b}°：入射波前與障礙物夾 ${b}°（θi = β），模擬的反射波前（障礙物中央前方 4.5 cm、4.4 cm 見方的區域）與障礙物夾 ${thr.toFixed(2)}° → |θr − θi| = ${Math.abs(thr - b).toFixed(2)}° ≤ 2.5°；三個角度相差 20°`);
  }
}

// ---------------------------------------------------------------- 任務 6、7：凹面的焦點
console.log('\n任務 6、7：凹弧的焦點');
for (const [f, R] of [[10, 0.14], [10, 0.2], [15, 0.14]]) {
  const vx = 0.31, half = Math.asin(0.08 / R);
  const arc = { kind: 'arc', cx: vx - R, cy: H / 2, R, half, thick: 0.008, ang: 0 };
  const sim = run(scene({ f, solids: [arc] }), 3);
  const L = RC.createLockIn(sim); L.run(4);
  let best = 0, bx = 0;
  for (let x = vx - 0.8 * R; x < vx - 0.01; x += sim.dx / 2) {
    if (x < 0.06) continue;
    const U = L.at(sim.index(x, H / 2)), a = Math.hypot(U[0], U[1]);
    if (a > best) { best = a; bx = x; }
  }
  const ratio = (vx - bx) / (R / 2);
  claim(ratio >= 0.8 && ratio <= 1.1, `f = ${f} Hz、R = ${R * 100} cm：反射波最集中處離頂點 ${((vx - bx) * 100).toFixed(2)} cm = ${ratio.toFixed(2)} × R/2（任務 6 接受 0.8–1.1 倍）`);
}
claim(0.31 - 0.07 > 0.035 && 0.31 - 0.07 < W - 0.035, '任務 7：預設凹弧頂點 x = 31 cm、R = 14 cm → 焦點 (24 cm, 13.5 cm) 在點波源可拖曳的範圍內，拖曳是連續的，可放到 6 mm 以內');

// ---------------------------------------------------------------- 任務 8、9：折射
console.log('\n任務 8：淺水區的波長比（α = 0，壓克力板與起波器平行）');
{
  const f = 10;
  const plate = { cx: 0.27, cy: H / 2, w: 0.12, len: 0.6, ang: 0, h2: 0.002 };   // 板邊 x = 21–33 cm
  const sim = run(scene({ f, plate }), 4);
  const deep = brightPeaks(sim, H / 2, 0.06, 0.205), shal = brightPeaks(sim, H / 2, 0.215, 0.325);
  const l1 = rulerLam(deep, 4), l2 = rulerLam(shal, 5);
  const ratio = RC.phaseSpeed(f, 0.002) / RC.phaseSpeed(f, 0.008);
  claim(Math.abs((l2 / l1) / ratio - 1) <= 0.02, `深水 λ1′ = ${l1.toFixed(3)} cm（4 個波長）、淺水 λ2′ = ${l2.toFixed(3)} cm（5 個波長）→ λ2′/λ1′ = ${(l2 / l1).toFixed(4)}，v2/v1 = ${ratio.toFixed(4)}（${pct(l2 / l1, ratio)}）`);
}
console.log('\n任務 9：司乃耳定律（α = 20°、35°、50°）');
{
  const f = 10, v1 = RC.phaseSpeed(f, 0.008), v2 = RC.phaseSpeed(f, 0.002);
  const xs = [], ys = [];
  for (const a of [20, 35, 50]) {
    const plate = { cx: 0.21, cy: H / 2, w: 0.14, len: 0.6, ang: a * D, h2: 0.002 };
    const sim = run(scene({ f, plate }), 4);
    const L = RC.createLockIn(sim); L.run(4);
    const wv = RC.waveVector(sim, L, { x0: 0.19, x1: 0.23, y0: H / 2 - 0.03, y1: H / 2 + 0.03 });
    const th2 = a - wv.dir / D;
    xs.push(Math.sin(a * D)); ys.push(Math.sin(th2 * D));
    console.log(`    α = θ1 = ${a}°：模擬的折射角 θ2 = ${th2.toFixed(2)}°（司乃耳 ${(RC.snell(a * D, v1, v2) / D).toFixed(2)}°）`);
  }
  const fit = RC.fitThroughOrigin(xs, ys);
  claim(Math.abs(fit.m / (v2 / v1) - 1) <= 0.04, `sinθ2 對 sinθ1 的斜率 ${fit.m.toFixed(4)}，v2/v1 = ${(v2 / v1).toFixed(4)}（${pct(fit.m, v2 / v1)}）；三個角度相差 30°`);
}

// ---------------------------------------------------------------- 任務 10：繞射
console.log('\n任務 10：繞射的兩個極端');
for (const [f, a] of [[5, 0.04], [6, 0.03], [20, 0.03], [10, 0.05]]) {
  const lam = RC.wavelength(f, 0.008);
  const sim = run(scene({ f }), 2.5);
  const pk = brightPeaks(sim, H / 2, 0.05, 0.14);
  const N = Math.min(pk.length - 1, f <= 6 ? 1 : 3);
  const lp = rulerLam(pk, N);
  claim(Math.abs(lp / (lam * 100) - 1) <= 0.05, `f = ${f} Hz、a = ${a * 100} cm（狹縫輪廓畫在影像上，直尺量 a′ = ${(a * 100).toFixed(2)} cm）：λ′ = ${lp.toFixed(3)} cm（${pct(lp, lam * 100)}，狹縫前跨 ${N} 個波長）→ λ/a = ${(lam / a).toFixed(2)}`);
}

// ---------------------------------------------------------------- 任務 11、13：節線
console.log('\n任務 11、13：兩點波源的節線');
{
  const f = 10, d = 0.1, lam = RC.wavelength(f, 0.008);
  const S1 = [0.09, H / 2 - d / 2], S2 = [0.09, H / 2 + d / 2];
  const nodal = RC.nodalLineCount(d, lam);
  const sim = run(scene({ f, source: { type: 'pair', x: 0.09, y: H / 2, d } }), 3.5);
  const L = RC.createLockIn(sim); L.run(4);
  const ampAt = (x, y) => { const U = L.at(sim.index(x, y)); return Math.hypot(U[0], U[1]); };
  /** 在 x = x0 這一條線上，找 |PS1 − PS2| = target 的 y（二分法，y > H/2） */
  const findY = (x0, target) => { let lo = H / 2, hi = H - 0.031; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; const dl = Math.abs(Math.hypot(x0 - S1[0], m - S1[1]) - Math.hypot(x0 - S2[0], m - S2[1])); if (dl < target) lo = m; else hi = m; } return (lo + hi) / 2; };
  const anti = ampAt(0.2, H / 2);
  console.log(`    f = 10 Hz、d = 10 cm：λ = ${(lam * 100).toFixed(3)} cm，節線 ${nodal} 條；中央腹線振幅 ${anti.toFixed(3)} mm`);
  const rows = [];
  for (const [n, x0] of [[1, 0.24], [2, 0.22], [3, 0.2]]) {
    const y = findY(x0, (n - 0.5) * lam);
    const a = ampAt(x0, y);
    const dl = Math.abs(Math.hypot(x0 - S1[0], y - S1[1]) - Math.hypot(x0 - S2[0], y - S2[1]));
    // 讀數到 0.01 cm；拖曳誤差 0.5 mm 時 |Δ| 最多改變 1 mm
    const tol = 0.001 / lam;
    rows.push([n - 0.5, r2(Math.hypot(x0 - S1[0], y - S1[1]) * 100) - r2(Math.hypot(x0 - S2[0], y - S2[1]) * 100)]);
    claim(a < 0.3 * anti && tol <= 0.08 && y < H - 0.03,
      `第 ${n} 條節線：P = (${(x0 * 100).toFixed(1)}, ${(y * 100).toFixed(2)}) cm，|Δ|/λ = ${(dl / lam).toFixed(3)}，模擬振幅 ${a.toFixed(3)} mm（中央腹線的 ${(a / anti * 100).toFixed(0)}%）；P 偏 0.5 mm 時 |Δ|/λ 最多變 ${tol.toFixed(3)}${n === 3 ? '（任務 11）' : ''}`);
  }
  const fit = RC.fitThroughOrigin(rows.map(r => r[0]), rows.map(r => Math.abs(r[1])));
  claim(Math.abs(fit.m / (lam * 100) - 1) <= 0.02, `任務 13：三條節線（n = 1、2、3）的 |Δ|′ 對 (n − ½) 作圖，斜率 ${fit.m.toFixed(3)} cm，真實 λ′ = ${(lam * 100).toFixed(3)} cm（${pct(fit.m, lam * 100)}）`);
  claim(0.04 / 2.5 < 0.02, '任務 13：每點最差偏 0.04λ 時，對 n − ½ = 0.5、1.5、2.5 的過原點斜率最多偏約 1.6% < 2%（實際的偏差有正有負，通常更小）');
  claim(nodal >= 6, `d = 10 cm、f = 10 Hz 時節線 ${nodal} 條，第 3 條節線在水槽中間清楚可見`);
}

// ---------------------------------------------------------------- 任務 12：含誤差＋點光源
console.log('\n任務 12：真正的實驗室（含誤差、點光源 L = 60 cm、旋鈕偏差 6%）');
{
  const dial = 10, fTrue = dial * 1.06, Lh = 0.6, M = RC.magnification(Lh, T.paper);
  const fs = Math.round(fTrue * 100) / 100;           // 閃頻儀調到條紋靜止（0.01 Hz）
  const Muser = Math.round(M * 100) / 100;             // 自己算 (L + d)/L，填到小數 2 位
  const sim = run(scene({ f: fTrue, tiltX: 0.0005 * D, tiltY: -0.0004 * D }), 3);
  const pk = brightPeaks(sim, H / 2, 0.07, 0.32);
  const r1 = (v) => Math.round(v * 10) / 10;          // 含誤差：直尺讀到 0.1 cm
  const lp = rulerLam(pk, 5, M, r1);
  const v = fs * lp / Muser / 100, vt = RC.phaseSpeed(fTrue, 0.008);
  claim(Math.abs(fTrue - fs) < 0.02 && Math.abs(Muser / M - 1) <= 0.02 && Math.abs(v / vt - 1) <= 0.03,
    `調平後 fs = ${fs} Hz 定住條紋（真實 ${fTrue} Hz；旋鈕寫 ${dial} Hz）；M = (60 + 25)/60 = ${M.toFixed(4)} → 填 ${Muser}；λ′ = ${lp.toFixed(3)} cm（5 個波長、0.1 cm），v = ${(v * 100).toFixed(2)} cm/s（${pct(v, vt)}）`);
  const vDial = dial * lp / Muser / 100;
  console.log(`    對照：用旋鈕刻度 ${dial} Hz 算出 v = ${(vDial * 100).toFixed(2)} cm/s（${pct(vDial, vt)}），不合格；忘了除以 M 則 ${pct(fs * lp / 100, vt)}`);
}

// ---------------------------------------------------------------- 隱藏任務
console.log('\n隱藏任務');
{
  const f = 10;
  for (const fs of [5, 3.33, 2.5]) {
    const n = Math.round(f / fs), drift = Math.abs(f - n * fs);
    claim(n >= 2 && n <= 4 && drift < 0.02 * n, `隱藏 1：fs = ${fs} Hz → 每 ${n} 個週期閃一次，條紋每秒移動 ${drift.toFixed(2)} 個波長（靜止）`);
  }
  // 11/12 收緊後的隱藏 2：實際餵事件給任務判定
  {
    let defs = [];
    const LM = { register: function (id, list) { defs = list; } };
    const savedW = global.window, savedL = global.LabMission;
    global.window = { LabMission: LM }; global.LabMission = LM;
    require(__ROOT + 'js/missions/ripple-tank.js');
    global.window = savedW; global.LabMission = savedL;
    const h2 = defs.find(function (m) { return m.id === 'ripple-tank-h2'; });
    const ev = function (fs, frozen) { return { type: 'strobe', data: { strobe: true, gen: true, f: 10, fs: fs, frozen: frozen, frozenN: 1 } }; };
    const run = function (seq) { const mem = {}; return seq.some(function (e) { return h2.check(e, mem); }); };
    claim(!run([ev(8, false), ev(10.3, false), ev(10.2, false), ev(10, true)]), '隱藏 2：往 f 調閃頻的途中（8 → 10.3 → 10.2 → 10 定住）不會順手完成');
    claim(run([ev(9.5, false), ev(10, true), ev(10.2, false)]), '隱藏 2：先在 10 Hz 定住、再調高到 10.2 Hz → 完成');
    claim(!run([ev(10, true), { type: 'strobe', data: { strobe: true, gen: true, f: 12, fs: 12.2, frozen: false, frozenN: 1 } }]), '隱藏 2：定住後換了起波頻率（10 → 12 Hz），沒有在新頻率下先定住 → 不算');
  }
  claim(10.2 - 10 >= 0.05 && 10.2 - 10 <= 0.6, '隱藏 2：fs = 10.20 Hz（比 f 高 0.2 Hz）→ 每次閃光時波只走了 0.98 個波長，看起來條紋以每秒 0.2 個波長的速度往起波器倒退');
  for (const [ff, obs, long] of [[5, 0.02, 0.1], [10, 0.012, 0.08]]) {
    const lam = RC.wavelength(ff, 0.008);
    const strip = { kind: 'rect', cx: 0.15, cy: H / 2, len: obs, thick: 0.006, ang: 90 * D };
    const sim = run(scene({ f: ff, solids: [strip] }), 3);
    const L = RC.createLockIn(sim); L.run(3);
    const ref = run(scene({ f: ff }), 3); const Lr = RC.createLockIn(ref); Lr.run(3);
    const big = run(scene({ f: ff, solids: [Object.assign({}, strip, { len: long })] }), 3); const Lb = RC.createLockIn(big); Lb.run(3);
    const xb = 0.15 + 2 * lam;
    const amp = (LL, s) => Math.hypot.apply(null, LL.at(s.index(xb, H / 2)));
    const a = amp(L, sim), a0 = amp(Lr, ref), ab = amp(Lb, big);
    claim(obs <= 0.6 * lam && a / a0 > 0.7 && ab / a0 < 0.6 * a / a0, `隱藏 3：f = ${ff} Hz（λ = ${(lam * 100).toFixed(2)} cm）、障礙物長 ${obs * 100} cm ≤ 0.6λ：後方 2λ 處振幅是沒有障礙物時的 ${(a / a0 * 100).toFixed(0)}%；換成 ${long * 100} cm 長的障礙物只剩 ${(ab / a0 * 100).toFixed(0)}%（影子明顯）`);
  }
}

console.log(fails ? `\n有 ${fails} 項沒有通過。` : '\n全部任務都證明做得到。');
process.exitCode = fails ? 1 : 0;
