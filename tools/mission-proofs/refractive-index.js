/* 任務可達成的證明腳本。用法：node tools/mission-proofs/refractive-index.js
 * 用物理核心模擬「插針 → 移走透明塊 → 量角器／直尺讀數 → 記錄」，算出頁面會發出的事件，
 * 確認每個任務都做得到、預設狀態與粗心的操作不會觸發任務。修改物理核心或任務條件後重跑。 */
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const C = require(__ROOT + 'js/refractive-index-core.js');
const DEG = Math.PI / 180, v = C.v;
let list = null;
global.LabMission = { register: (m, l) => { list = l; } }; global.window = { LabMission: global.LabMission };
require(__ROOT + 'js/missions/refractive-index.js');
const MAT = {}; C.MATERIALS.forEach(m => { MAT[m.id] = m.n; });
const R = C.GEOM.semiR;
const MARKS = [1, 2, 3, 4, 5].map(k => v(-k, Math.sqrt(R * R - k * k)));

/** 與 js/refractive-index.js 的 measureNow() 相同的計算 */
function measure(o) {
  const n = o.mat === 'unknown' ? o.nUnknown : MAT[o.mat];
  const b = C.makeBlock({ shape: o.shape, t: o.t || 6, w: C.GEOM.rectW, R: R, rot: o.err ? o.rot : 0 });
  const res = o.res || 1, sigA = o.err ? 0.25 : 0, sigL = o.err ? 0.02 : 0, r = o.rng || null;
  const base = { shape: o.shape, dir: o.shape === 'semi' ? (o.dir || 'fwd') : 'fwd', mat: o.mat, nAcc: n, err: !!o.err, res: res, t: o.t || 6, revealed: o.mat !== 'unknown' || !!o.revealed };
  if (o.shape === 'rect') {
    const p = o.pins, g = C.measureRect(b, p.A, p.B, p.C, p.D);
    if (!g.ok) return null;
    const th1 = C.readAngle(g.th1 / DEG, res, sigA, r), th2 = C.readAngle(g.th2 / DEG, res, sigA, r);
    const al = C.alignError(b, n, 'rect', p);
    return Object.assign(base, { side: g.side, th1, th2, nRow: Math.sin(th1 * DEG) / Math.sin(th2 * DEG),
      shift: C.readLength(g.shift, 0.01, sigL, r), shiftF: C.lateralShift(base.t, th1 * DEG, th2 * DEG),
      parallel: g.parallel / DEG, alignAng: al ? al.ang / DEG : NaN, alignOff: al ? al.off : NaN, mark: 0 });
  }
  const p = o.pins, g = C.measureSemi(b, p.P, p.P2, base.dir);
  if (!g.ok) return null;
  const th1 = C.readAngle(g.th1 / DEG, res, sigA, r), th2 = C.readAngle(g.th2 / DEG, res, sigA, r);
  const x1 = C.readLength(g.x1, 0.01, sigL, r), x2 = C.readLength(g.x2, 0.01, sigL, r);
  const al = C.alignError(b, n, 'semi', p, base.dir);
  let mark = 0;
  if (base.dir === 'fwd') MARKS.forEach((m, i) => { if (C.len(C.sub(p.P, m)) < 1e-6) mark = i + 1; });
  return Object.assign(base, { side: g.side, th1, th2, x1, x2, nRow: Math.sin(th1 * DEG) / Math.sin(th2 * DEG), nRuler: x1 / x2,
    alignAng: al && isFinite(al.ang) ? al.ang / DEG : NaN, alignOff: al && isFinite(al.off) ? al.off : NaN, mark });
}
/** 與頁面的 groupStats()＋groupPayload() 相同（量角器方法） */
function group(rows, mat, revealed) {
  rows = rows.filter(r => r.mat === mat);
  const acc = rows.length ? rows[0].nAcc : MAT[mat];
  const fit = list => C.fitOrigin(list.map(r => Math.sin(r.th2 * DEG)), list.map(r => Math.sin(r.th1 * DEG)));
  const sub = f => { const l = rows.filter(f), m = fit(l).m; return { N: l.length, pct: C.pctError(m, acc) }; };
  const m = fit(rows).m, th1s = rows.map(r => r.th1);
  return { mat, nAcc: acc, revealed: mat !== 'unknown' || !!revealed, N: rows.length, slope: m, pct: C.pctError(m, acc),
    errAll: rows.length > 0 && rows.every(r => r.err), th1Min: Math.min(...th1s), th1Max: Math.max(...th1s),
    left: sub(r => r.side < 0).N, right: sub(r => r.side > 0).N, marks: rows.filter(r => r.mark).map(r => r.mark),
    rectN: sub(r => r.shape === 'rect').N, semiN: sub(r => r.shape === 'semi').N,
    rectPct: sub(r => r.shape === 'rect').pct, semiPct: sub(r => r.shape === 'semi').pct,
    rows: rows.map(r => ({ shape: r.shape, dir: r.dir, side: r.side, err: r.err, res: r.res, th1: r.th1, th2: r.th2 })) };
}
/** 長方形：A 在入射角 deg 的方向上（距 O 為 7 cm）、B 在 O 上方 0.8 cm 的入射線上；C、D 沿真正的出射光，再加上 cErr、dErr（cm）的側向偏差 */
function rectPins(o) {
  const n = o.mat === 'unknown' ? o.nUnknown : MAT[o.mat];
  const b = C.makeBlock({ shape: 'rect', t: o.t || 6, w: C.GEOM.rectW, R: R, rot: o.err ? o.rot : 0 });
  const s = o.side || -1, th = o.deg * DEG, x0 = o.x0 == null ? -0.5 * s : o.x0;
  const u = v(-s * Math.sin(th), -Math.cos(th));            // 入射方向（往下）
  const O = v(x0, 0), A = C.sub(O, C.mul(u, 7)), B = C.sub(O, C.mul(u, 1.2));
  const id = C.idealRect(b, n, A, B, 2, 6.5);
  const perp = v(-id.uOut.y, id.uOut.x);
  return { A, B, C: C.add(id.C, C.mul(perp, o.cErr || 0)), D: C.add(id.D, C.mul(perp, o.dErr || 0)) };
}
/** 半圓形：P 在角度 deg（或記號點 mark），P′ 沿真正的折射光、距 O 為 9 cm（再加側向偏差 err cm） */
function semiPins(o) {
  const n = o.mat === 'unknown' ? o.nUnknown : MAT[o.mat];
  const b = C.makeBlock({ shape: 'semi', t: 6, w: C.GEOM.rectW, R: R, rot: o.err ? o.rot : 0 });
  const dir = o.dir || 'fwd', s = o.side || -1;
  let P;
  if (o.mark) P = MARKS[o.mark - 1];
  else { const th = o.deg * DEG, rr = dir === 'rev' ? 9 : 7; P = dir === 'rev' ? v(s * rr * Math.sin(th), -rr * Math.cos(th)) : v(s * rr * Math.sin(th), rr * Math.cos(th)); }
  const id = C.idealSemi(b, n, P, dir, 9);
  if (!id) return { P, P2: null };
  const perp = v(-id.u.y, id.u.x);
  return { P, P2: C.add(id.P2, C.mul(perp, o.pErr || 0)) };
}
function reverseEv(mat, P, rot) {
  const b = C.makeBlock({ shape: 'semi', t: 6, w: C.GEOM.rectW, R: R, rot: rot || 0 });
  const ri = C.reverseInfo(b, MAT[mat], P);
  return { type: 'reverse', data: { mat, thMed: ri.thMed / DEG, crit: ri.crit / DEG, tir: ri.tir, T: ri.T, err: !!rot } };
}
const passing = e => list.filter(m => m.check(e, {})).map(m => m.id);
let bad = 0;
function expect(id, e, note) { const p = passing(e); const ok = p.includes(id); if (!ok) bad++; console.log((ok ? 'OK   ' : 'FAIL ') + id.padEnd(22), note || '', '| also:', p.filter(x => x !== id).join(',')); }
function expectNot(id, e, note) { const p = passing(e); const ok = !p.includes(id); if (!ok) bad++; console.log((ok ? 'OK   ' : 'FAIL ') + ('not ' + id).padEnd(22), note || ''); }
const mEv = m => ({ type: 'measure', data: m });
const rEv = (rows, mat, rev) => ({ type: 'record', data: { row: rows[rows.length - 1], group: group(rows, mat, rev) } });

// ---------- 預設狀態 ----------
// 頁面在使用者操作前不發任何事件；預設的弧面入射 P(−4.5, −7.79) 若被回報，也不會觸發任務。
const def = reverseEv('crown', v(-4.5, -7.79));
console.log('預設弧面入射：PO 與法線 ' + def.data.thMed.toFixed(2) + '°、臨界角 ' + def.data.crit.toFixed(2) + '° → 通過：', JSON.stringify(passing(def)));
if (passing(def).length) bad++;
// 預設長方形 A(−6, 7.2)、B(−2.2, 1.6) 但 C、D 隨手插（偏 0.3 cm）：只有「第一筆」之類的記錄任務可能通過
{
  const b = C.makeBlock({ shape: 'rect', t: 6, w: 12, R, rot: 0 });
  const id = C.idealRect(b, 1.52, v(-6, 7.2), v(-2.2, 1.6), 2, 6.5);
  const perp = v(-id.uOut.y, id.uOut.x);
  const m = measure({ shape: 'rect', mat: 'crown', pins: { A: v(-6, 7.2), B: v(-2.2, 1.6), C: C.add(id.C, C.mul(perp, 0.3)), D: C.add(id.D, C.mul(perp, -0.1)) } });
  console.log('預設 A、B、粗心插 C、D：θ1 = ' + m.th1 + '°、θ2 = ' + m.th2 + '°、夾角 ' + m.parallel.toFixed(2) + '° → measure 通過：', JSON.stringify(passing(mEv(m))));
  if (passing(mEv(m)).length) bad++;
}

// ---------- 1 第一筆數據 ----------
const r1 = measure({ shape: 'rect', mat: 'crown', pins: rectPins({ mat: 'crown', deg: 40 }) });
expect('refractive-index-1', rEv([r1], 'crown'), '長方形冕牌玻璃 40°，記錄一次');

// ---------- 2 水的折射率 ----------
const w3 = measure({ shape: 'semi', mat: 'water', pins: semiPins({ mat: 'water', mark: 3 }) });
expect('refractive-index-2', mEv(w3), 'P3（θ1 = 30°）：θ2 讀 ' + w3.th2 + '°、n = ' + w3.nRow.toFixed(3) + '、x1/x2 = ' + w3.nRuler.toFixed(3));
const w3bad = measure({ shape: 'semi', mat: 'water', pins: semiPins({ mat: 'water', mark: 3, pErr: 0.4 }) });
expectNot('refractive-index-2', mEv(w3bad), 'P′ 插偏 0.4 cm：n = ' + w3bad.nRow.toFixed(3));
expectNot('refractive-index-2', mEv(measure({ shape: 'semi', mat: 'acrylic', pins: semiPins({ mat: 'acrylic', mark: 3 }) })), '壓克力不算');

// ---------- 3 四針一線 ----------
const a3 = measure({ shape: 'rect', mat: 'crown', pins: rectPins({ mat: 'crown', deg: 45, cErr: 0.01, dErr: -0.01 }) });
expect('refractive-index-3', mEv(a3), 'C、D 各偏 0.01 cm（半個微移步）：夾角 ' + a3.alignAng.toFixed(3) + '°、距離 ' + a3.alignOff.toFixed(3) + ' cm');
const a3b = measure({ shape: 'rect', mat: 'crown', pins: rectPins({ mat: 'crown', deg: 45, cErr: 0.04, dErr: 0.04 }) });
expectNot('refractive-index-3', mEv(a3b), '整條平移 0.04 cm：距離 ' + a3b.alignOff.toFixed(3) + ' cm');
const a3c = measure({ shape: 'rect', mat: 'crown', pins: rectPins({ mat: 'crown', deg: 45, cErr: 0.02, dErr: -0.02 }) });
expectNot('refractive-index-3', mEv(a3c), 'C、D 反向各偏 0.02 cm：夾角 ' + a3c.alignAng.toFixed(3) + '°');

// ---------- 4 關在裡面的光、9 臨界角的邊緣 ----------
['water', 'acrylic', 'crown'].forEach(mat => {
  const crit = C.criticalAngle(MAT[mat]);
  const at = deg => v(-9 * Math.sin(deg * DEG), -9 * Math.cos(deg * DEG));
  expect('refractive-index-4', reverseEv(mat, at(crit / DEG + 1)), mat + '：PO 比臨界角 ' + (crit / DEG).toFixed(2) + '° 大 1°');
  const e9 = reverseEv(mat, at(crit / DEG - 0.3));
  expect('refractive-index-9', e9, mat + '：比臨界角小 0.3°（P 距 O 9 cm，弧長 0.05 cm）');
  expectNot('refractive-index-9', reverseEv(mat, at(crit / DEG - 1)), mat + '：小 1° 不算');
  expectNot('refractive-index-4', e9, mat + '：還沒全反射');
});
// 微移 0.02 cm（P 距 O 約 8 cm）每步約 0.14°，一定能停在 0.5° 的窗口內
console.log('     P 距 O 8 cm 時一個微移步的角度：' + (0.02 / 8 / DEG).toFixed(3) + '°');

// ---------- 5 五個記號點 ----------
const rows5 = [1, 2, 3, 4, 5].map(k => measure({ shape: 'semi', mat: 'water', pins: semiPins({ mat: 'water', mark: k }) }));
expect('refractive-index-5', rEv(rows5, 'water'), 'P1–P5 各一次：θ2 = ' + rows5.map(r => r.th2 + '°').join('、'));
expectNot('refractive-index-5', rEv(rows5.slice(0, 4), 'water'), '少了 P5');
const notMark = measure({ shape: 'semi', mat: 'water', pins: semiPins({ mat: 'water', deg: 25 }) });
expectNot('refractive-index-5', rEv(rows5.slice(0, 4).concat([notMark]), 'water'), '第五筆不在記號點上');

// ---------- 6 平行的出射光 ----------
const p6 = measure({ shape: 'rect', mat: 'crown', pins: rectPins({ mat: 'crown', deg: 45, cErr: 0.01, dErr: -0.01 }) });
expect('refractive-index-6', mEv(p6), '45°：夾角 ' + p6.parallel.toFixed(3) + '°、d = ' + p6.shift + ' cm');
const p6b = measure({ shape: 'rect', mat: 'crown', pins: rectPins({ mat: 'crown', deg: 25 }) });
expectNot('refractive-index-6', mEv(p6b), '25°：d = ' + p6b.shift + ' cm 太小');
const p6c = measure({ shape: 'rect', mat: 'crown', pins: rectPins({ mat: 'crown', deg: 45, cErr: 0.04, dErr: -0.04 }) });
expectNot('refractive-index-6', mEv(p6c), 'C、D 反向各偏 0.04 cm：夾角 ' + p6c.parallel.toFixed(3) + '°');

// ---------- 7 側向位移公式（0.5° 量角器、θ1 ≥ 50°） ----------
{
  let okN = 0, tot = 0;
  for (let deg = 50; deg <= 70.001; deg += 0.25) {
    const m = measure({ shape: 'rect', mat: 'crown', res: 0.5, pins: rectPins({ mat: 'crown', deg }) });
    tot++; if (passing(mEv(m)).includes('refractive-index-7')) okN++;
  }
  console.log('     50°–70° 每 0.25° 一次（理想插針）：' + okN + '/' + tot + ' 次通過');
  const m7 = measure({ shape: 'rect', mat: 'crown', res: 0.5, pins: rectPins({ mat: 'crown', deg: 55 }) });
  expect('refractive-index-7', mEv(m7), '55°：d = ' + m7.shift + '、公式 ' + m7.shiftF.toFixed(3) + ' cm');
  const m7a = measure({ shape: 'rect', mat: 'acrylic', res: 0.5, t: 8, pins: rectPins({ mat: 'acrylic', deg: 60, t: 8 }) });
  expect('refractive-index-7', mEv(m7a), '壓克力 t = 8 cm、60°：d = ' + m7a.shift + '、公式 ' + m7a.shiftF.toFixed(3) + ' cm');
  expectNot('refractive-index-7', mEv(measure({ shape: 'rect', mat: 'crown', res: 1, pins: rectPins({ mat: 'crown', deg: 55 }) })), '1° 的量角器不算');
  expectNot('refractive-index-7', mEv(measure({ shape: 'rect', mat: 'crown', res: 0.5, pins: rectPins({ mat: 'crown', deg: 45 }) })), '45° 不算');
}

// ---------- 8 斜率就是折射率 ----------
const rows8 = [20, 30, 40, 50, 60].map(d => measure({ shape: 'rect', mat: 'crown', pins: rectPins({ mat: 'crown', deg: d }) }));
const g8 = group(rows8, 'crown');
expect('refractive-index-8', rEv(rows8, 'crown'), '冕牌玻璃 20°–60° 五筆：斜率 ' + g8.slope.toFixed(4) + '（' + g8.pct.toFixed(2) + '%）');
const rows8w = [1, 2, 3, 4, 5].map(k => measure({ shape: 'semi', mat: 'water', pins: semiPins({ mat: 'water', mark: k }) }));
expect('refractive-index-8', rEv(rows8w, 'water'), '水 P1–P5：斜率 ' + group(rows8w, 'water').slope.toFixed(4) + '、θ1 範圍 ' + rows8w[0].th1 + '°–' + rows8w[4].th1 + '°');
expectNot('refractive-index-8', rEv(rows8.slice(0, 4), 'crown'), '只有 4 筆');
expectNot('refractive-index-8', rEv([40, 42, 44, 46, 48].map(d => measure({ shape: 'rect', mat: 'crown', pins: rectPins({ mat: 'crown', deg: d }) })), 'crown'), '角度只跨 8°');

// ---------- 10 未知樣品 ----------
[1.42, 1.555, 1.68].forEach(nu => {
  const rows = [20, 30, 40, 50, 60].map(d => measure({ shape: 'rect', mat: 'unknown', nUnknown: nu, res: 0.5, pins: rectPins({ mat: 'unknown', nUnknown: nu, deg: d }) }));
  const g = group(rows, 'unknown');
  expect('refractive-index-10', rEv(rows, 'unknown'), 'n = ' + nu + '、0.5° 量角器 20°–60°：斜率 ' + g.slope.toFixed(4) + '（' + g.pct.toFixed(2) + '%）');
  expectNot('refractive-index-10', rEv(rows, 'unknown', true), '揭曉之後才記錄不算');
});

// ---------- 11 抵銷系統誤差（含誤差：隨機讀數誤差＋透明塊轉了 0.6°–1.4°） ----------
{
  const trial = (rot, seed, res, degs) => {
    const rng = C.rng(seed), rows = [];
    degs.forEach(d => [-1, 1].forEach(side => {
      rows.push(measure({ shape: 'rect', mat: 'crown', err: true, rot, rng, res, pins: rectPins({ mat: 'crown', deg: d, side, err: true, rot }) }));
    }));
    return rows;
  };
  const one = trial(1.4 * DEG, 7, 0.5, [30, 45, 60]);
  const g = group(one, 'crown');
  const gl = group(one.filter(r => r.side < 0), 'crown'), gr = group(one.filter(r => r.side > 0), 'crown');
  expect('refractive-index-11', rEv(one, 'crown'), '轉 1.4°、左右各 30°/45°/60°：左 ' + gl.pct.toFixed(2) + '%、右 ' + gr.pct.toFixed(2) + '%、合併 ' + g.pct.toFixed(2) + '%');
  expectNot('refractive-index-11', rEv(one.filter(r => r.side < 0).concat(one.filter(r => r.side > 0).slice(0, 2)), 'crown'), '右側只有 2 筆');
  const leftOnly = trial(1.4 * DEG, 7, 0.5, [30, 45, 60, 25, 50, 65]).filter(r => r.side < 0);
  console.log('     只做左側 6 筆的誤差：' + group(leftOnly, 'crown').pct.toFixed(2) + '%（系統誤差抵銷不掉）');
  // 成功率：不同的轉角與亂數，左右各 3 筆（0.5° 量角器）／各 5 筆
  [[3, [30, 45, 60]], [5, [20, 32, 44, 56, 68]]].forEach(cfg => {
    let ok = 0, okL = 0; const T = 400;
    for (let i = 0; i < T; i++) {
      const rr = C.rng(1000 + i), rot = C.systematicRot(rr);
      const rows = trial(rot, 5000 + i, 0.5, cfg[1]);
      if (passing(rEv(rows, 'crown')).includes('refractive-index-11')) ok++;
      if (Math.abs(group(rows.filter(r => r.side < 0), 'crown').pct) <= 0.6) okL++;
    }
    console.log('     左右各 ' + cfg[0] + ' 筆，' + T + ' 組亂數：合併後 ' + (100 * ok / T).toFixed(0) + '% 通過；只看左側 ' + (100 * okL / T).toFixed(0) + '% 會在 0.6% 內');
  });
}

// ---------- 隱藏 h1：垂直入射 ----------
{
  const m = measure({ shape: 'rect', mat: 'crown', pins: rectPins({ mat: 'crown', deg: 0.3, x0: 0.2 }) });
  expect('refractive-index-h1', mEv(m), 'A、B 幾乎垂直（0.3°）：θ1 讀 ' + m.th1 + '°、d = ' + m.shift + ' cm');
  expectNot('refractive-index-h1', mEv(measure({ shape: 'rect', mat: 'crown', pins: rectPins({ mat: 'crown', deg: 3 }) })), '3° 不算');
}
// ---------- 隱藏 h2：兩種形狀都準 ----------
{
  const rows = [25, 40, 55].map(d => measure({ shape: 'rect', mat: 'acrylic', pins: rectPins({ mat: 'acrylic', deg: d }) }))
    .concat([3, 4, 5].map(k => measure({ shape: 'semi', mat: 'acrylic', res: 0.5, pins: semiPins({ mat: 'acrylic', mark: k }) })));
  const g = group(rows, 'acrylic');
  expect('refractive-index-h2', rEv(rows, 'acrylic'), '壓克力長方形 3 筆（' + g.rectPct.toFixed(2) + '%）＋半圓形 P3–P5、0.5° 量角器 3 筆（' + g.semiPct.toFixed(2) + '%）');
  expectNot('refractive-index-h2', rEv(rows.slice(0, 5), 'acrylic'), '半圓形只有 2 筆');
}
// ---------- 隱藏 h3：同一個 θ1，左右的 θ2 不同 ----------
{
  let found = 0, tried = 0;
  for (let i = 0; i < 200; i++) {
    const rr = C.rng(300 + i), rot = C.systematicRot(rr), rng = C.rng(900 + i);
    for (const d of [50, 60, 70]) {
      const L = measure({ shape: 'rect', mat: 'crown', err: true, rot, rng, pins: rectPins({ mat: 'crown', deg: d, side: -1, err: true, rot }) });
      // 右側：找一個讓 θ1 讀數與左側相同的入射角（學生調 A 直到讀數一樣）
      let Rm = null;
      for (let dd = d - 1.5; dd <= d + 1.5; dd += 0.1) {
        const m = measure({ shape: 'rect', mat: 'crown', err: true, rot, rng, pins: rectPins({ mat: 'crown', deg: dd, side: 1, err: true, rot }) });
        if (m.th1 === L.th1) { Rm = m; break; }
      }
      if (!Rm) continue;
      tried++;
      if (passing(rEv([L, Rm], 'crown')).includes('refractive-index-h3')) { found++; break; }
    }
  }
  console.log('     200 組亂數（每組最多試 50°、60°、70° 三次）中有 ' + found + ' 組找得到');
  const rot = 1.2 * DEG, rng = C.rng(42);
  const L = measure({ shape: 'rect', mat: 'crown', err: true, rot, rng: C.rng(1), pins: rectPins({ mat: 'crown', deg: 65, side: -1, err: true, rot }) });
  const Rr = measure({ shape: 'rect', mat: 'crown', err: true, rot, rng: C.rng(2), pins: rectPins({ mat: 'crown', deg: 65, side: 1, err: true, rot }) });
  console.log('     例：轉 1.2°、左右各 65°：左 θ1 ' + L.th1 + '° θ2 ' + L.th2 + '°；右 θ1 ' + Rr.th1 + '° θ2 ' + Rr.th2 + '°');
  if (L.th1 === Rr.th1) expect('refractive-index-h3', rEv([L, Rr], 'crown'), '同一個 θ1 讀數、θ2 相差 ' + Math.abs(L.th2 - Rr.th2) + '°');
  void rng;
  const iL = measure({ shape: 'rect', mat: 'crown', pins: rectPins({ mat: 'crown', deg: 65, side: -1 }) });
  const iR = measure({ shape: 'rect', mat: 'crown', pins: rectPins({ mat: 'crown', deg: 65, side: 1 }) });
  expectNot('refractive-index-h3', rEv([iL, iR], 'crown'), '理想模式左右一樣：θ2 = ' + iL.th2 + '°／' + iR.th2 + '°');
  if (!found) bad++;
}
console.log(bad ? '\n有 ' + bad + ' 項不符' : '\n全部符合');
process.exitCode = bad ? 1 : 0;
