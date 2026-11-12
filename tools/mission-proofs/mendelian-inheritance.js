/* 任務可達成的證明腳本。用法：node tools/mission-proofs/mendelian-inheritance.js
 * 用物理（遺傳）核心照頁面的做法模擬：每按一次「產生子代」就累積一批子代，然後判定任務（js/missions/mendelian-inheritance.js 的條件）。
 * 含亂數的任務算出成功率；預設狀態（還沒產生任何子代）不會觸發任務。修改核心或任務條件後重跑。 */
'use strict';
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..') + '/';
const M = require(ROOT + 'js/mendelian-inheritance-core.js');
const fs = require('fs');

// 把任務檔載入一個假的 LabMission，直接用同一份 check 函式判定
const defs = [];
const fakeLM = { register: function (id, list) { list.forEach(m => defs.push(Object.assign({ mem: {} }, m))); } };
new Function('window', 'LabMission', fs.readFileSync(ROOT + 'js/missions/mendelian-inheritance.js', 'utf8'))({ LabMission: fakeLM }, fakeLM);
const byId = {};
defs.forEach(m => { byId[m.id.replace('mendelian-inheritance-', '')] = m; });
const check = (id, ev) => byId[id].check(ev, byId[id].mem);

const rand = M.rng(20261112);
const out = [];
let fail = 0;
function claim(ok, msg) { out.push((ok ? '✓ ' : '✗ ') + msg); if (!ok) fail++; }
const pct = x => (100 * x).toFixed(1) + '%';

/** 頁面的一次雜交實驗：累積子代並在每批之後產生 sow 事件 */
function Lab(traits, g1, g2) {
  const cr = M.cross(g1, g2);
  const s = { N: 0, pheno: new Array(cr.phenoP.length).fill(0), geno: new Array(cr.genoP.length).fill(0), cell: new Array(cr.slots1.length * cr.slots2.length).fill(0) };
  return {
    cr, s,
    sow(n) {
      M.sampleCounts(cr, n, rand, s);
      const t = M.chiSquare(s.pheno, cr.phenoP);
      return { type: 'sow', data: { L: g1.length, traits, g1, g2, mystery: false, kind: M.crossKind(g1, g2), n, N: s.N, pheno: s.pheno.slice(), geno: s.geno.slice(), chi2: t.chi2, df: t.df, p: t.p, impossible: t.impossible, minE: t.minExpected } };
    }
  };
}
/** 重複「全部清除 → 依序產生 batches」直到任務成功，傳回每一次嘗試的成功率 */
function rate(trials, make, batches, id) {
  let ok = 0;
  for (let t = 0; t < trials; t++) {
    const lab = make();
    let hit = false;
    for (const b of batches) { if (check(id, lab.sow(b))) { hit = true; break; } }
    if (hit) ok++;
  }
  return ok / trials;
}
const mono = (g1, g2, tr) => () => Lab([tr || 'shape'], [g1], [g2]);
const di = (g1, g2, tr) => () => Lab(tr || ['shape', 'color'], g1, g2);

// ---------- 預設狀態不會觸發 ----------
{
  const empty = { type: 'sow', data: { L: 2, traits: ['shape', 'color'], g1: [1, 1], g2: [1, 1], mystery: false, kind: 'F2', n: 0, N: 0, pheno: [0, 0, 0, 0], geno: new Array(9).fill(0), chi2: 0, df: 3, p: 1, impossible: false } };
  // 頁面在使用者按下「產生子代」之前不會送出任何事件；這裡再確認：就算收到 N = 0 的事件也沒有任務成立
  const hits = defs.filter(m => m.check(empty, {})).map(m => m.id);
  claim(hits.length === 0, '預設狀態（雙性狀子二代、還沒有子代）不觸發任何任務' + (hits.length ? '：' + hits.join('、') : ''));
}

// 1. 第一顆豌豆
claim(check('1', mono(1, 1)().sow(1)), 'M1 第一顆豌豆：按「+1」就完成');
// 2. 子一代都一樣：RR × rr、RRYY × rryy、RRyy × rrYY 都是 P
{
  const a = mono(2, 0)(), b = di([2, 2], [0, 0])(), c = di([2, 0], [0, 2])();
  const ea = a.sow(10), eb = b.sow(10), ec = c.sow(10);
  claim(check('2', ea) && check('2', eb) && check('2', ec) && ea.data.pheno[1] === 0 && eb.data.pheno[0] === 10,
    'M2 子一代都一樣：RR × rr、RRYY × rryy、RRyy × rrYY 各 10 個子一代全部是顯性（例如全部圓黃）');
}
// 3. 隱性回來了
{
  const p4 = M.binomAtLeast(1, 4, 0.25), p10 = M.binomAtLeast(1, 10, 0.25);
  const sim = rate(4000, mono(1, 1), [1, 1, 1, 1], '3');
  claim(Math.abs(sim - p4) < 0.03, `M3 隱性回來了：子二代 4 個裡至少一個隱性 ${pct(p4)}（模擬 ${pct(sim)}），10 個時 ${pct(p10)}；多按幾次一定會出現`);
}
// 4. 三比一：N ≥ 400、p > 0.05
{
  const r = rate(3000, mono(1, 1), [100, 100, 100, 100], '4');
  claim(r > 0.9, `M4 三比一：單性狀子二代按 4 次「+100」，第 400 個時 p > 0.05 的機率 ${pct(r)}（理論約 95%）`);
  const r2 = rate(1000, mono(1, 1), [100, 100, 100, 100, 100, 100, 100, 100], '4');
  claim(r2 > 0.97, `    繼續累積到 800 個（每 100 個檢查一次）的成功率 ${pct(r2)}`);
}
// 5. 試交 1:1，N ≥ 300，比值 0.95–1.05
{
  let exact = 0;
  for (let d = 0; d <= 300; d++) { const r = d / (300 - d); if (300 - d > 0 && r >= 0.95 && r <= 1.05) exact += M.binomPmf(d, 300, 0.5); }
  const once = rate(4000, mono(1, 0), [100, 100, 100], '5');
  const acc = rate(2000, mono(1, 0), new Array(30).fill(100), '5');
  claim(Math.abs(once - exact) < 0.03 && acc > 0.6, `M5 試交一比一：恰好 300 個時比值在 0.95–1.05 的機率 ${pct(exact)}（模擬 ${pct(once)}）；一直按「+100」到 3000 個之內成功 ${pct(acc)}；不成功就「全部清除」重來`);
  const flip = rate(2000, mono(0, 1), [100, 100, 100], '5');
  claim(Math.abs(flip - exact) < 0.04, `    母本、父本對調（aa × Aa）也算試交：${pct(flip)}`);
}
// 6. 小樣本會騙人：N ≥ 8，隱性 ≥ 顯性
{
  const p8 = M.binomAtLeast(4, 8, 0.25), p10 = M.binomAtLeast(5, 10, 0.25);
  const sim = rate(20000, mono(1, 1), [1, 1, 1, 1, 1, 1, 1, 1], '6');
  claim(Math.abs(sim - p8) < 0.01, `M6 小樣本會騙人：子二代 8 個中隱性 ≥ 4 的機率 ${pct(p8)}（模擬 ${pct(sim)}；10 個時 ${pct(p10)}）；平均約 ${(1 / p8).toFixed(1)} 次「全部清除＋產生 8 個」就成功`);
  const sim10 = rate(20000, mono(1, 1), [10], '6');
  claim(Math.abs(sim10 - p10) < 0.01, `    直接按「+10」：每次 ${pct(sim10)}`);
}
// 7. 9:3:3:1，N ≥ 556，p > 0.05
{
  const r = rate(2000, di([1, 1], [1, 1]), [556], '7');
  const r2 = rate(2000, di([1, 1], [1, 1]), [100, 100, 100, 100, 100, 100], '7');
  claim(r > 0.9 && r2 > 0.9, `M7 九比三比三比一：自訂數量 556 一次產生，p > 0.05 的機率 ${pct(r)}；或按 6 次「+100」（600 個）${pct(r2)}`);
}
// 8. 雙性狀試交：N ≥ 400，四類各 22%–28%
{
  const r = rate(4000, di([1, 1], [0, 0]), [100, 100, 100, 100], '8');
  const acc = rate(2000, di([1, 1], [0, 0]), new Array(20).fill(100), '8');
  const flip = rate(2000, di([0, 0], [1, 1]), [100, 100, 100, 100], '8');
  claim(r > 0.3 && acc > 0.9, `M8 獨立分配：RrYy × rryy 恰好 400 個時四類都在 22%–28% 的機率 ${pct(r)}，累積到 2000 個之內 ${pct(acc)}（rryy × RrYy 也可以：${pct(flip)}）`);
  claim(!check('8', di([2, 1], [0, 0])().sow(1000)), '    RRYy × rryy 只有兩類，不會成立（必須是 AaBb）');
}
// 9、10、12. 偵探：照「每次產生 1 個，直到每個基因座看到隱性、或已經有 8 個都沒有隱性」的策略
function detective(L, budget) {
  const truth = M.mysteryPick(L, rand);
  const cr = M.cross(truth, new Array(L).fill(0));
  const s = { N: 0, pheno: new Array(cr.phenoP.length).fill(0), geno: new Array(cr.genoP.length).fill(0), cell: new Array(cr.slots1.length * cr.slots2.length).fill(0) };
  for (;;) {
    M.sampleCounts(cr, 1, rand, s);
    const rs = M.recessiveSeen(s.pheno, L);
    const doneLoci = rs.every(x => x > 0) || (s.N >= 8);
    if (doneLoci || s.N >= budget) break;
  }
  const rs = M.recessiveSeen(s.pheno, L);
  const guess = rs.map(x => (x > 0 ? 1 : 2));
  return { type: 'guess', data: { L, first: true, correct: guess.join() === truth.join(), guess, truth, N: s.N, pheno: s.pheno.slice(), partnerRec: true, justified: M.guessJustified(guess, s.pheno, 8) } };
}
{
  let ok = 0, n = 20000;
  for (let t = 0; t < n; t++) if (check('9', detective(1, 1e9))) ok++;
  const theory = 1 - 0.5 * Math.pow(0.5, 8);
  claim(ok / n > 0.99, `M9 豌豆偵探：試交後每次產生 1 個，看到隱性就判 Aa、8 個都顯性就判 AA；第一次就對的機率 ${pct(ok / n)}（理論 1 − ½·(½)^8 = ${pct(theory)}）`);
  let ok2 = 0;
  for (let t = 0; t < n; t++) if (check('10', detective(2, 1e9))) ok2++;
  claim(ok2 / n > 0.99, `M10 雙性狀偵探：同樣的策略用在兩對基因，第一次就對 ${pct(ok2 / n)}`);
  // 沒有根據的猜測不算：只看 3 個子代就猜 AA
  const lucky = { type: 'guess', data: { L: 1, first: true, correct: true, guess: [2], truth: [2], N: 3, pheno: [3, 0], partnerRec: true, justified: M.guessJustified([2], [3, 0], 8) } };
  claim(!check('9', lucky), '    只看 3 個子代就猜「同型合子」，即使猜對也不算（沒有根據）');
  // 大師：連續 3 個，每個 ≤ 10 個子代
  byId['12'].mem = {};
  let streakOk = 0;
  const T = 5000;
  for (let t = 0; t < T; t++) {
    byId['12'].mem = {};
    let hit = false;
    for (let k = 0; k < 3; k++) hit = check('12', detective(2, 10));
    if (hit) streakOk++;
  }
  claim(streakOk / T > 0.98, `M12 大師：每個神秘豌豆最多用 10 個子代，連續 3 個都第一次就對的機率 ${pct(streakOk / T)}`);
  byId['12'].mem = {};
  const bad = Object.assign({}, detective(2, 10)); bad.data = Object.assign({}, bad.data, { correct: false });
  check('12', detective(2, 10)); check('12', detective(2, 10)); check('12', bad);
  claim(!check('12', detective(2, 10)), '    中途錯一次就重新計算（錯了之後再對一個不會成立）');
  byId['12'].mem = {};
}
// 11. 比孟德爾更準：χ² < 0.470（df = 3）
{
  const theory = M.chi2Cdf(0.4700239808153477, 3);
  const once = rate(4000, di([1, 1], [1, 1]), [556], '11');
  claim(Math.abs(once - theory) < 0.015, `M11 比孟德爾更準：一次產生 556 個時 χ² < 0.470 的機率 ${pct(once)}（理論 P(χ² < 0.470, df = 3) = ${pct(theory)}），平均約 ${(1 / theory).toFixed(1)} 次「全部清除＋產生 556 個」`);
  const acc = rate(1000, di([1, 1], [1, 1]), [556].concat(new Array(60).fill(100)), '11');
  claim(acc > 0.5, `    或產生 556 個後一直按「+100」（到 6556 個之內）成功 ${pct(acc)}`);
  claim(!check('11', di([1, 1], [1, 1], ['flower', 'height'])().sow(556)), '    限定種子形狀＋子葉顏色（孟德爾的那一組性狀）');
}
// h1. 恰好 9:3:3:1
{
  const theory = M.multinomPmf([9, 3, 3, 1], [9 / 16, 3 / 16, 3 / 16, 1 / 16]);
  const sim = rate(40000, di([1, 1], [1, 1]), [16], 'h1');
  claim(Math.abs(sim - theory) < 0.004, `H1 一字不差：16 個子二代恰好 9:3:3:1 的機率 ${pct(theory)}（模擬 ${pct(sim)}），平均約 ${Math.round(1 / theory)} 次「全部清除＋自訂數量 16」`);
}
// h2. 型一錯誤：真的假說（單性狀）先被拒絕（N ≥ 200、p < 0.05），不清除、繼續種到兩倍以上，p 回到 0.5 以上
{
  const fresh = () => { byId['h2'].mem = {}; };
  const rateM = (trials, make, batches) => { let ok = 0; for (let i = 0; i < trials; i++) { fresh(); const lab = make(); for (const b of batches) if (check('h2', lab.sow(b))) { ok++; break; } } fresh(); return ok / trials; };
  // 刻意的做法：單性狀子二代（或試交）一直按「+100」到 4000 個
  const go = rateM(3000, mono(1, 1), new Array(40).fill(100));
  const goT = rateM(3000, mono(1, 0), new Array(40).fill(100));
  claim(go > 0.08 && goT > 0.08, `H2 說實話沒人信：單性狀子二代一路按「+100」到 4000 個之內成立 ${pct(go)}、試交 ${pct(goT)}（每次「全部清除」重來就是新的一輪）`);
  fresh(); claim(!check('h2', mono(1, 1)().sow(5000)), '    只產生一批（沒有先被拒絕）不會成立');
  // 誤觸檢查：做一般任務的典型路線
  const t11 = rateM(2000, di([1, 1], [1, 1]), [556].concat(new Array(30).fill(100)));
  const t11b = rateM(2000, di([1, 1], [1, 1]), new Array(30).fill(100));
  claim(t11 === 0 && t11b === 0, `    做「比孟德爾更準」（雙性狀子二代 556 個再一路 +100）不會順手完成：${pct(t11)}、${pct(t11b)}`);
  const t4 = rateM(3000, mono(1, 1), [100, 100, 100, 100]);
  const t5 = rateM(3000, mono(1, 0), [100, 100, 100]);
  claim(t4 < 0.01 && t5 < 0.01, `    做「三比一」（+100 到 400 個）${pct(t4)}、「試交的一比一」（+100 到 300 個）${pct(t5)}，都低於 1%`);
  const t6 = rateM(3000, mono(1, 1), [8, 1, 1, 1, 1, 1]);
  claim(t6 === 0, '    做「小樣本會騙人」（8 個左右）不會成立');
}
// h3. 孟德爾數過的 7324 粒（或 8023 粒）
{
  const lab = mono(1, 1, 'shape')();
  let ev = null;
  [1000, 1000, 1000, 1000, 1000, 1000, 1000, 100, 100, 100, 10, 10, 1, 1, 1, 1].forEach(b => { ev = lab.sow(b); });
  const lab2 = mono(1, 1, 'color')();
  let ev2 = null;
  [1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 10, 10, 1, 1, 1].forEach(b => { ev2 = lab2.sow(b); });
  claim(check('h3', ev) && ev.data.N === 7324 && check('h3', ev2) && ev2.data.N === 8023 && !check('h3', mono(1, 1, 'flower')().sow(929)),
    'H3 八個夏天：種子形狀子二代累積到 7324 個（7×1000 + 3×100 + 2×10 + 4×1），或子葉顏色到 8023 個，都會成立');
}

console.log(out.join('\n'));
console.log(fail ? `\n有 ${fail} 項沒有通過。` : '\n全部任務都做得到。');
process.exit(fail ? 1 : 0);
