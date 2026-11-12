/* 任務可達成的證明腳本。用法：node tools/mission-proofs/diffusion-osmosis.js
 * 用物理核心照頁面（js/diffusion-osmosis.js）的做法模擬：每一幀前進 1/60 s × 播放速度 × 模式的時間倍率，
 * 每 0.25 s 送出一次任務事件（資料欄位與頁面的 missionData 相同），再用任務檔（js/missions/diffusion-osmosis.js）的同一份 check 判定。
 * 含亂數的任務（擴散）算出成功率；也確認預設狀態與快速設定按鈕不會直接觸發任務。修改核心或任務條件後重跑。 */
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..', '..') + '/';
const K = require(ROOT + 'js/diffusion-osmosis-core.js');

// 把任務檔載入一個假的 LabMission，直接用同一份 check 函式判定
const defs = [];
const fakeLM = { register: function (id, list) { list.forEach(m => defs.push(Object.assign({ mem: {} }, m))); } };
new Function('window', 'LabMission', fs.readFileSync(ROOT + 'js/missions/diffusion-osmosis.js', 'utf8'))({ LabMission: fakeLM }, fakeLM);
const byId = {};
defs.forEach(m => { byId[m.id.replace('diffusion-osmosis-', '')] = m; });
const check = (id, ev) => byId[id].check(ev, byId[id].mem);
const hitsOf = ev => defs.filter(m => { try { return m.check(ev, {}); } catch (e) { return false; } }).map(m => m.id.replace('diffusion-osmosis-', ''));

const out = [];
let fail = 0;
function claim(ok, msg) { out.push((ok ? '✓ ' : '✗ ') + msg); if (!ok) fail++; }
const pct = x => (100 * x).toFixed(1) + '%';
const SOL = K.SOLUTES;
const FRAME = 1 / 60;            // 頁面一幀（真實秒）
const EMIT_EVERY = 15;           // 每 15 幀（0.25 s）送出一次事件
const BASE = { diff: 1, osmo: 120, cell: 1 };

// =====================================================================
// 擴散：與頁面相同的取樣、擬合與事件
// =====================================================================
function DiffLab(seed, Tc, r) {
  const rand = K.rng(seed);
  const L = { Tc: Tc, r: r, cloud: K.createCloud({}, rand), run: null, history: [], rand: rand };
  L.D = () => K.diffusionUm2(L.Tc, L.r);
  L.remove = function () {
    K.removePartition(L.cloud);
    L.run = { T: L.Tc, r: L.r, D: L.D(), mixed: false, ts: [], ms: [], th: [], Dfit: NaN, complete: false, t: 0 };
  };
  L.putBack = function () {
    if (L.run && L.run.ts.length > 1) { L.history.push(L.run); if (L.history.length > 12) L.history.shift(); }
    L.run = null;
    K.scatterLeft(L.cloud, rand);
  };
  L.set = function (Tc2, r2) {   // 途中改設定 → 這次紀錄標記為 mixed（頁面的 diffParamChanged）
    if (Tc2 != null) L.Tc = Tc2;
    if (r2 != null) L.r = r2;
    if (L.run && !L.cloud.partition && (Math.abs(L.run.T - L.Tc) > 1e-9 || Math.abs(L.run.r - L.r) > 1e-9)) L.run.mixed = true;
  };
  L.sample = function (st) {
    const c = L.cloud, run = L.run;
    if (!run) return;
    run.t = c.t;
    const last = run.ts.length ? run.ts[run.ts.length - 1] : 0;
    if (!run.ts.length || c.t - last >= Math.max(0.004, c.t / 300)) {
      run.ts.push(c.t); run.ms.push(st.msdX); run.th.push(2 * c.theta);
      if (run.ts.length > 700) ['ts', 'ms', 'th'].forEach(k => { run[k] = run[k].filter((_, i) => i % 2 === 0 || i === run[k].length - 1); });
    }
    run.complete = 2 * c.theta >= 2000;
    run.Dfit = run.mixed ? NaN : K.fitSlope(run.ts, run.ms) / 2;
  };
  const summary = rn => ({ T: rn.T, r: rn.r, D: rn.D, Dfit: rn.Dfit, complete: rn.complete, mixed: rn.mixed, t: rn.t });
  L.data = function () {
    const c = L.cloud, st = K.cloudStats(c), run = L.run, Dv = L.D();
    const runs = L.history.map(summary);
    if (run && run.complete && !run.mixed) runs.push(summary(run));
    return { mode: 'diff', partition: c.partition, t: c.t, T: L.Tc, r: L.r, D: Dv, theta: c.theta, msd: st.msdX, theory: 2 * c.theta,
      Dfit: run ? run.Dfit : NaN, fitErr: run && !run.mixed ? run.Dfit / Dv - 1 : NaN, complete: !!(run && run.complete), mixed: !!(run && run.mixed),
      fracR: st.fracR, nR: st.nR, N: st.N, allSeen: !c.partition && st.allSeen, runs: runs };
  };
  /** 播放 seconds 真實秒（播放速度 speed），每 0.25 s 呼叫 onEmit(事件)；onEmit 傳回 true 就提早停 */
  L.play = function (seconds, speed, onEmit) {
    const frames = Math.round(seconds / FRAME);
    for (let f = 1; f <= frames; f++) {
      K.stepCloud(L.cloud, L.D(), (speed || 1) * BASE.diff * FRAME);
      const st = K.cloudStats(L.cloud);
      if (!L.cloud.partition) L.sample(st);
      if (f % EMIT_EVERY === 0 && onEmit && onEmit({ type: 'diff', data: L.data() })) return true;
    }
    return false;
  };
  return L;
}
/** 一次完整的擴散：移除隔板 → 播放直到 2Θ ≥ 2000 μm²（再多播 extra 秒）→ 傳回最後的事件 */
function fullRun(L, extra, speed, onEmit) {
  L.remove();
  let hit = false;
  const need = 2000 / (2 * L.D()) / (speed || 1);
  hit = L.play(need + (extra || 0) + 0.3, speed, onEmit) || hit;
  return hit;
}

// =====================================================================
// 滲透：與頁面相同（時間 ×120、P 以 kPa 表示、平衡判定）
// =====================================================================
function OsmoLab(o) {
  const L = Object.assign({ solL: 'glucose', solR: 'sucrose', CL: 0, CR: 1, P: 0, Tc: 25 }, o || {});
  L.refill = function () { L.st = K.osmoCreate({ iL: SOL[L.solL].i, CL: L.CL, iR: SOL[L.solR].i, CR: L.CR }); };
  L.refill();
  L.data = function () {
    const r = K.osmoReadout(L.st, L.Tc, L.P * 1000), eq = K.osmoEquilibrium(L.st, L.Tc, L.P * 1000);
    const rate = r.rate * 6000;
    return { mode: 'osmo', t: L.st.t / 60, solL: L.solL, solR: L.solR, iL: SOL[L.solL].i, iR: SOL[L.solR].i, CL0: L.CL, CR0: L.CR,
      osmL0: SOL[L.solL].i * L.CL, osmR0: SOL[L.solR].i * L.CR, T: L.Tc, P: L.P, h: r.h * 100, dpi: r.dpi / 1000, rhogh: r.rhogh / 1000,
      rate: rate, eq: Math.abs(rate) < 0.005 && L.st.t >= 300 && !L.st.limited, heq: eq.h * 100, limited: L.st.limited };
  };
  L.play = function (seconds, speed, onEmit) {
    const frames = Math.round(seconds / FRAME);
    for (let f = 1; f <= frames; f++) {
      K.osmoStep(L.st, L.Tc, L.P * 1000, (speed || 1) * BASE.osmo * FRAME);
      if (f % EMIT_EVERY === 0 && onEmit && onEmit({ type: 'osmo', data: L.data() })) return true;
    }
    return false;
  };
  return L;
}

// =====================================================================
// 細胞與溶液
// =====================================================================
function CellLab(o) {
  const L = Object.assign({ sol: 'nacl', C: 100, Tc: 25 }, o || {});
  L.fresh = function () { L.rbc = K.cellCreate('rbc'); L.plant = K.cellCreate('plant', L.Tc); L.t = 0; };
  L.fresh();
  L.osm = () => SOL[L.sol].i * L.C;
  L.data = function () {
    const osm = L.osm(), eqR = K.cellEquilibrium('rbc', osm, L.Tc), eqP = K.cellEquilibrium('plant', osm, L.Tc);
    return { mode: 'cell', t: L.t, sol: L.sol, i: SOL[L.sol].i, C: L.C, osm: osm, T: L.Tc,
      rbcV: L.rbc.V, rbcLysed: L.rbc.lysed, rbcEq: L.rbc.lysed || (!eqR.lysis && Math.abs(L.rbc.V - eqR.V) < 0.3), rbcEqV: eqR.lysis ? null : eqR.V,
      plantV: L.plant.V, turgor: K.turgor('plant', L.plant.V), plantEq: Math.abs(L.plant.V - eqP.V) < 0.002, plasmolyzed: L.plant.V < 0.995 };
  };
  L.play = function (seconds, speed, onEmit) {
    const frames = Math.round(seconds / FRAME);
    for (let f = 1; f <= frames; f++) {
      const dt = (speed || 1) * BASE.cell * FRAME;
      K.cellStep(L.rbc, L.osm(), L.Tc, dt); K.cellStep(L.plant, L.osm(), L.Tc, dt); L.t += dt;
      if (f % EMIT_EVERY === 0 && onEmit && onEmit({ type: 'cell', data: L.data() })) return true;
    }
    return false;
  };
  return L;
}
/** 播放並收集曾經成立的任務 */
function collect(lab, seconds, speed) {
  const set = new Set();
  lab.play(seconds, speed, ev => { hitsOf(ev).forEach(h => set.add(h)); return false; });
  return [...set];
}
function playUntil(lab, id, seconds, speed) { return lab.play(seconds, speed, ev => check(id, ev)); }

// =====================================================================
// 預設狀態與快速設定按鈕不會觸發任務
// =====================================================================
{
  // 擴散預設：隔板還在（頁面在使用者操作前也不會送出事件）；就算一直播放、按快速半徑鈕也一樣
  const L = DiffLab(1, 25, 0.5);
  const h1 = collect(L, 20, 1);
  L.set(null, 0.38); const h2 = collect(L, 5, 1);
  L.set(null, 3.1); const h3 = collect(L, 5, 1);
  const all = [...new Set(h1.concat(h2, h3))];
  claim(all.length === 0, '擴散預設（隔板還在）播放 30 秒、按「葡萄糖 0.38 nm」「血紅素 3.1 nm」都不觸發任務' + (all.length ? '：' + all.join('、') : ''));
}
{
  // 滲透預設：左純水、右蔗糖 1 mmol/L、P = 0，播到完全平衡（真實 120 秒 ×1 = 240 分鐘）
  const L = OsmoLab();
  const hits = collect(L, 120, 1);
  claim(hits.length === 0, '滲透預設（左純水、右蔗糖 1 mmol/L）一路播到平衡（h = ' + L.data().h.toFixed(1) + ' cm）都不觸發任務' + (hits.length ? '：' + hits.join('、') : ''));
}
{
  const pre = [['預設 NaCl 100 mmol/L', 100], ['「0.9% 生理食鹽水」', K.molarFromPercent(0.9, SOL.nacl.M)], ['「3.5% 食鹽水（約海水）」', K.molarFromPercent(3.5, SOL.nacl.M)]];
  pre.forEach(([name, C]) => {
    const L = CellLab({ C: C });
    const hits = collect(L, 60, 1);
    claim(hits.length === 0, '細胞與溶液：' + name + '（' + (2 * C).toFixed(0) + ' mOsm/L）播放 60 秒都不觸發任務' + (hits.length ? '：' + hits.join('、') : ''));
  });
}

// =====================================================================
// 1. 拿掉隔板
// =====================================================================
{
  const L = DiffLab(11, 25, 0.5);
  L.remove();
  let tHit = null;
  L.play(30, 1, ev => { if (check('1', ev)) { tHit = ev.data.t; return true; } return false; });
  claim(tHit != null, 'M1 拿掉隔板：預設 0.5 nm、25 °C，按「移除隔板」後 ' + (tHit != null ? tHit.toFixed(1) : '—') + ' 秒右半邊達 30%');
}
// =====================================================================
// 2. 水往濃的地方跑：左邊放溶質、右邊純水
// =====================================================================
{
  const L = OsmoLab({ solL: 'sucrose', CL: 1, solR: 'sucrose', CR: 0 });
  let when = null;
  L.play(60, 1, ev => { if (check('2', ev)) { when = ev.data.t; return true; } return false; });
  claim(when != null, 'M2 水往濃的地方跑：左蔗糖 1 mmol/L、右純水，' + (when != null ? when.toFixed(0) : '—') + ' 分鐘（真實約 ' + (when != null ? (when / 2).toFixed(0) : '—') + ' 秒）左管高出 10 cm');
}
// =====================================================================
// 3. 皺縮與質壁分離：外液 480–675 mOsm/L
// =====================================================================
{
  let lo = Infinity, hi = -Infinity;
  for (let osm = 300; osm <= 1200; osm += 1) {
    const eR = K.cellEquilibrium('rbc', osm, 25), eP = K.cellEquilibrium('plant', osm, 25);
    if (!eR.lysis && eR.V >= 60 && eR.V <= 70 && eP.V <= 0.85) { lo = Math.min(lo, osm); hi = Math.max(hi, osm); }
  }
  const L = CellLab({ sol: 'nacl', C: 280 });
  const ok = playUntil(L, '3', 60, 1);
  claim(ok && lo >= 470 && hi <= 680, 'M3 皺縮與質壁分離：平衡時成立的外液 ' + lo + '–' + hi + ' mOsm/L；NaCl 280 mmol/L（560 mOsm/L）播放後成立（紅血球 ' + L.rbc.V.toFixed(1) + ' fL、植物 ' + L.plant.V.toFixed(3) + '）');
}
// =====================================================================
// 4. 均方位移是一條直線（含亂數：統計成功率）
// =====================================================================
{
  const trials = 150;
  let okAtOnce = 0, ok40 = 0;
  const tDone = 2000 / (2 * K.diffusionUm2(25, 1));
  for (let k = 0; k < trials; k++) {
    const L = DiffLab(1000 + k, 25, 1);
    L.remove();
    let first = null;
    L.play(40, 1, ev => { if (check('4', ev)) { first = ev.data.t; return true; } return false; });
    if (first != null) { ok40++; if (first <= tDone + 0.5) okAtOnce++; }
  }
  // 預設半徑 0.5 nm 不成立（要先換成 1 nm 以上）
  const L0 = DiffLab(999, 25, 0.5);
  L0.remove();
  const noDefault = !playUntil(L0, '4', 20, 1);
  claim(ok40 / trials >= 0.9 && noDefault, 'M4 均方位移是一條直線：預設半徑 0.5 nm 不成立；1 nm、25 °C 移除隔板後 40 秒內成立的比例 ' + pct(ok40 / trials) + '（一達到 2000 μm²（' + tDone.toFixed(1) + ' 秒）就成立 ' + pct(okAtOnce / trials) + '；沒成立可放回隔板再做）');
}
// =====================================================================
// 5. 液柱撐住滲透壓：左純水、右 NaCl
// =====================================================================
{
  const L = OsmoLab({ solL: 'glucose', CL: 0, solR: 'nacl', CR: 0.6 });
  let d = null;
  L.play(120, 1, ev => { if (check('5', ev)) { d = ev.data; return true; } return false; });
  const hAna = K.osmoEqPureLeft(2 * 0.6, 25) * 100;
  claim(d != null && Math.abs(d.h - hAna) < 0.1, 'M5 液柱撐住滲透壓：右 NaCl 0.6 mmol/L，' + (d ? d.t.toFixed(0) : '—') + ' 分鐘平衡，h = ' + (d ? d.h.toFixed(2) : '—') + ' cm（解析解 ' + hAna.toFixed(2) + ' cm），ρgh = ' + (d ? d.rhogh.toFixed(3) : '—') + ' kPa、Δπ = ' + (d ? d.dpi.toFixed(3) : '—') + ' kPa');
  // 最小濃度：平衡 h ≥ 20 cm
  let cmin = null;
  for (let C = 0.01; C <= 2; C = Math.round((C + 0.01) * 100) / 100) if (K.osmoEqPureLeft(2 * C, 25) >= 0.2) { cmin = C; break; }
  claim(cmin != null && cmin <= 1, '　　25 °C 時 NaCl 至少 ' + cmin + ' mmol/L 才會有 20 cm');
}
// =====================================================================
// 6. 熱的跑得快：0 °C 與 40 °C（或 0 °C 與 25 °C）
// =====================================================================
function twoRuns(seed, a, b, id) {
  const L = DiffLab(seed, a.T, a.r);
  let hit = false;
  fullRun(L, 0, 1);
  L.putBack();
  L.set(b.T, b.r);
  hit = fullRun(L, 0, 1, ev => check(id, ev));
  return hit;
}
{
  const trials = 100;
  let okA = 0, okB = 0;
  for (let k = 0; k < trials; k++) {
    if (twoRuns(2000 + k, { T: 0, r: 0.5 }, { T: 40, r: 0.5 }, '6')) okA++;
    if (twoRuns(3000 + k, { T: 0, r: 0.5 }, { T: 25, r: 0.5 }, '6')) okB++;
  }
  const ratio = (T1, T2) => K.diffusionUm2(T2, 0.5) / K.diffusionUm2(T1, 0.5);
  claim(okA / trials >= 0.95, 'M6 熱的跑得快：0 °C 與 40 °C 各做一次（理論 D 比 ' + ratio(0, 40).toFixed(2) + '）成功率 ' + pct(okA / trials) + '；0 °C 與 25 °C（理論 ' + ratio(0, 25).toFixed(2) + '）成功率 ' + pct(okB / trials));
}
// =====================================================================
// 7. 逆滲透
// =====================================================================
{
  const L = OsmoLab({ P: 6 });   // 預設溶液、活塞 6 kPa
  let d = null;
  L.play(60, 1, ev => { if (check('7', ev)) { d = ev.data; return true; } return false; });
  claim(d != null, 'M7 逆滲透：預設溶液、活塞壓力 6 kPa，' + (d ? d.t.toFixed(0) : '—') + ' 分鐘右管比左管低 5 cm（平衡 ' + (d ? d.heq.toFixed(1) : '—') + ' cm）');
}
// =====================================================================
// 8. 剛好擋住水：P = Δπ（兩位小數 kPa）
// =====================================================================
{
  const pi0 = K.osmoticPressure(1, 25) / 1000;   // 預設右蔗糖 1 mmol/L
  const P = Math.round(pi0 * 100) / 100;
  const L = OsmoLab({ P: P });
  let d = null;
  L.play(60, 1, ev => { if (check('8', ev)) { d = ev.data; return true; } return false; });
  // 容許範圍：|h| < 0.5 cm ⇔ |P − Δπ| < ρg·0.005 ≈ 49 Pa（滑桿一格 10 Pa）
  claim(d != null, 'M8 剛好擋住水：預設溶液 Δπ = ' + pi0.toFixed(3) + ' kPa，活塞 ' + P.toFixed(2) + ' kPa，' + (d ? d.t.toFixed(0) : '—') + ' 分鐘成立（h = ' + (d ? d.h.toFixed(2) : '—') + ' cm）；容許 ±' + (K.waterDensity(25) * K.G * 0.005 / 1000).toFixed(3) + ' kPa');
}
// =====================================================================
// 9. 初始質壁分離：外液約 386–404 mOsm/L
// =====================================================================
{
  let lo = Infinity, hi = -Infinity;
  for (let osm = 300; osm <= 500; osm += 0.5) {
    const v = K.cellEquilibrium('plant', osm, 25).V;
    if (Math.abs(v - 1) <= 0.01 && K.turgor('plant', v) <= 30) { lo = Math.min(lo, osm); hi = Math.max(hi, osm); }
  }
  const L = CellLab({ sol: 'nacl', C: 198 });
  const ok = playUntil(L, '9', 60, 1);
  const L2 = CellLab({ sol: 'sucrose', C: 395 });
  const ok2 = playUntil(L2, '9', 60, 1);
  claim(ok && ok2, 'M9 初始質壁分離：成立的外液 ' + lo + '–' + hi + ' mOsm/L（NaCl 約 ' + (lo / 2).toFixed(0) + '–' + (hi / 2).toFixed(0) + ' mmol/L）；NaCl 198、蔗糖 395 mmol/L 都成立');
}
// =====================================================================
// 10. 溶血的邊緣：143.2–155.8 mOsm/L
// =====================================================================
{
  const lys = K.RBC.n / (K.RBC.Vlysis - K.RBC.Vb), top = K.RBC.n / (140 - K.RBC.Vb);
  const L = CellLab({ sol: 'nacl', C: 75 });
  const ok = playUntil(L, '10', 60, 1);
  const L2 = CellLab({ sol: 'nacl', C: 70 });
  L2.play(30, 1);
  // 先到太稀的溶液破掉：不可逆，要按「換新細胞」
  L2.C = 75; const still = playUntil(L2, '10', 30, 1);
  L2.fresh(); const again = playUntil(L2, '10', 60, 1);
  claim(ok && L2.rbc && !still && again, 'M10 溶血的邊緣：外液 ' + lys.toFixed(1) + '–' + top.toFixed(1) + ' mOsm/L（NaCl ' + (lys / 2).toFixed(1) + '–' + (top / 2).toFixed(1) + ' mmol/L）；NaCl 75 成立；在 70 破掉後改回 75 不成立，按「換新細胞」才成立');
}
// =====================================================================
// 11. 大的走得慢：0.5 nm 與 2.5 nm（或 0.38 與 3.1 nm）同溫
// =====================================================================
{
  const trials = 60;
  let okA = 0, okB = 0;
  for (let k = 0; k < trials; k++) {
    if (twoRuns(4000 + k, { T: 25, r: 0.5 }, { T: 25, r: 2.5 }, '11')) okA++;
    if (twoRuns(5000 + k, { T: 25, r: 0.38 }, { T: 25, r: 3.1 }, '11')) okB++;
  }
  claim(okA / trials >= 0.6 && okB / trials >= 0.6, 'M11 大的走得慢：25 °C 下 0.5 nm 與 2.5 nm 各做一次成功率 ' + pct(okA / trials) + '；「葡萄糖 0.38 nm」與「血紅素 3.1 nm」成功率 ' + pct(okB / trials) + '（失敗就再做一次，任何兩次配對都算）');
}
// =====================================================================
// 12. 精準的滲透計：搜尋所有可行組合
// =====================================================================
{
  const combos = [];
  ['glucose', 'sucrose', 'nacl', 'cacl2'].forEach(sk => {
    for (let c = 1; c <= 200; c++) {
      const C = c / 100;
      [25, 20, 30, 0, 40].forEach(T => {
        const h = K.osmoEqPureLeft(SOL[sk].i * C, T) * 100;
        if (h >= 50.05 && h <= 50.45) combos.push({ sk, C, T, h });
      });
    }
  });
  const at25 = combos.filter(c => c.T === 25).map(c => c.sk + ' ' + c.C + '（' + c.h.toFixed(2) + ' cm）');
  const pick = combos.find(c => c.T === 25 && c.sk === 'nacl') || combos[0];
  const L = OsmoLab({ solL: 'glucose', CL: 0, solR: pick.sk, CR: pick.C, Tc: pick.T });
  let d = null;
  L.play(240, 2, ev => { if (check('12', ev)) { d = ev.data; return true; } return false; });
  claim(d != null && at25.length >= 1, 'M12 精準的滲透計：25 °C 可行 ' + at25.join('、') + '；其他溫度共 ' + (combos.length - at25.length) + ' 組；模擬 ' + pick.sk + ' ' + pick.C + ' mmol/L 在 ' + (d ? d.t.toFixed(0) : '—') + ' 分鐘平衡 h = ' + (d ? d.h.toFixed(2) : '—') + ' cm');
  // 不經稀釋就照 π0/ρg 算會選錯（教學重點）：π0/ρg = 50 cm 的濃度實際只到約 41 cm
  const Cwrong = 0.5 * K.waterDensity(25) * K.G / K.osmoticPressure(1, 25);
  claim(K.osmoEqPureLeft(Cwrong, 25) < 0.45, '　　照 π0／ρg = 50 cm 選 ' + Cwrong.toFixed(3) + ' mOsm/L 只會得到 ' + (K.osmoEqPureLeft(Cwrong, 25) * 100).toFixed(1) + ' cm（必須考慮稀釋）');
}
// =====================================================================
// 隱藏任務
// =====================================================================
{
  const L = CellLab({ sol: 'nacl', C: 0 });
  const ok = playUntil(L, 'h1', 60, 1);
  let cmax = 0;
  for (let osm = 0; osm <= 300; osm += 0.5) {
    const eR = K.cellEquilibrium('rbc', osm, 25), eP = K.cellEquilibrium('plant', osm, 25);
    if (eR.lysis && eP.P >= 600) cmax = osm;
  }
  claim(ok, 'H1 牆，是溫柔的：清水中紅血球溶血、植物細胞膨壓 ' + K.turgor('plant', L.plant.V).toFixed(0) + ' kPa；外液 ≤ ' + cmax + ' mOsm/L 都成立');
}
{
  const trials = 40, times = [];
  for (let k = 0; k < trials; k++) {
    const L = DiffLab(6000 + k, 25, 0.5);
    L.remove();
    let when = null;
    L.play(240, 1, ev => { if (check('h2', ev)) { when = ev.data.t; return true; } return false; });
    times.push(when == null ? Infinity : when);
  }
  times.sort((a, b) => a - b);
  const fin = times.filter(isFinite).length;
  claim(fin === trials, 'H2 沒有誰永遠只待在故鄉：預設設定下每個粒子都到過右半邊所需時間中位數 ' + times[trials >> 1].toFixed(0) + ' 秒、最長 ' + times[trials - 1].toFixed(0) + ' 秒（' + fin + '/' + trials + ' 次在 4 分鐘內；可加快播放速度）');
}
{
  const L = OsmoLab({ solL: 'nacl', CL: 0.5, solR: 'glucose', CR: 1 });
  let d = null;
  L.play(60, 1, ev => { if (check('h3', ev)) { d = ev.data; return true; } return false; });
  const L2 = OsmoLab({ solL: 'cacl2', CL: 0.4, solR: 'glucose', CR: 1.2 });
  const ok2 = playUntil(L2, 'h3', 60, 1);
  const L3 = OsmoLab({ solL: 'glucose', CL: 1, solR: 'sucrose', CR: 1 });   // 同為 i = 1 不算
  const no3 = !playUntil(L3, 'h3', 60, 1);
  claim(d != null && ok2 && no3, 'H3 勢均力敵的陌生人：左 NaCl 0.5、右葡萄糖 1 mmol/L 在 ' + (d ? d.t.toFixed(0) : '—') + ' 分鐘成立；CaCl2 0.4 對葡萄糖 1.2 也成立；葡萄糖對蔗糖（i 相同）不算');
}

// =====================================================================
console.log(out.join('\n'));
const pub = defs.filter(m => !m.hidden).length, hid = defs.filter(m => m.hidden).length;
console.log('\n公開任務 ' + pub + ' 個、隱藏任務 ' + hid + ' 個；等級：' + defs.map(m => m.id.replace('diffusion-osmosis-', '') + '=' + m.level).join(' '));
if (fail) { console.log('\n有 ' + fail + ' 項沒有通過'); process.exit(1); }
console.log('\n全部任務都證明做得到（' + out.length + ' 項）');
