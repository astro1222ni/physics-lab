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
function Lab(traits, g1, g2, gchart) {
  const cr = M.cross(g1, g2);
  const s = { N: 0, pheno: new Array(cr.phenoP.length).fill(0), geno: new Array(cr.genoP.length).fill(0), cell: new Array(cr.slots1.length * cr.slots2.length).fill(0) };
  return {
    cr, s,
    sow(n) {
      M.sampleCounts(cr, n, rand, s);
      const t = M.chiSquare(s.pheno, cr.phenoP);
      return { type: 'sow', data: { L: g1.length, traits, g1, g2, mystery: false, kind: M.crossKind(g1, g2), n, N: s.N, pheno: s.pheno.slice(), geno: s.geno.slice(), chi2: t.chi2, df: t.df, p: t.p, impossible: t.impossible, minE: t.minExpected, gchart: !!gchart } };
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
const di = (g1, g2, tr, gchart) => () => Lab(tr || ['shape', 'color'], g1, g2, gchart);

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

// ---------- 隱藏任務 h4–h10（11/13 加；每個實驗十個隱藏任務） ----------
const HID = defs.filter(m => m.hidden).map(m => m.id.replace('mendelian-inheritance-', ''));
/** 把一串事件依序交給每個隱藏任務（各自全新的 mem），傳回完成的隱藏任務 */
function hitsOf(events, only) {
  const got = [];
  (only || HID).forEach(id => { const mem = {}; if (events.some(ev => byId[id].check(ev, mem))) got.push(id); });
  return got;
}
/** 神秘模式的一顆豌豆：母本真實基因型 truth、父本隱性同型合子；sow(n, hyp) 以「你的假說」計算卡方（同頁面） */
function Mystery(L, truth) {
  truth = truth || M.mysteryPick(L, rand);
  const g2 = new Array(L).fill(0), cr = M.cross(truth, g2);
  const s = { N: 0, pheno: new Array(cr.phenoP.length).fill(0), geno: new Array(cr.genoP.length).fill(0), cell: new Array(cr.slots1.length * cr.slots2.length).fill(0) };
  const traits = ['shape', 'color'].slice(0, L);
  return {
    truth, s,
    sow(n, hyp) {
      M.sampleCounts(cr, n, rand, s);
      const t = M.chiSquare(s.pheno, M.cross(hyp, g2).phenoP);
      return { type: 'sow', data: { L, traits, g1: hyp.slice(), g2, mystery: true, kind: M.crossKind(hyp, g2), n, N: s.N, pheno: s.pheno.slice(), geno: null, chi2: t.chi2, df: t.df, p: t.p, impossible: t.impossible, minE: t.minExpected, gchart: false } };
    },
    guess(hyp) {
      return { type: 'guess', data: { L, first: true, correct: hyp.join() === truth.join(), guess: hyp.slice(), truth, N: s.N, pheno: s.pheno.slice(), partnerRec: true, justified: M.guessJustified(hyp, s.pheno, 8) } };
    }
  };
}
const solutions = {};
// h4. 黑天鵝：單性狀神秘豌豆，假說先設 AA，按「+1」；若是隱性（假說被推翻），改成 Aa 立刻提交
{
  let ok = 0, ex = null;
  const n = 20000;
  for (let t = 0; t < n; t++) {
    const my = Mystery(1);
    const e1 = my.sow(1, [2]);
    const evs = [e1, my.guess(e1.data.impossible ? [1] : [2])];
    if (hitsOf(evs, ['h4']).length) { ok++; if (!ex) ex = evs; }
  }
  solutions.h4 = ex;
  claim(Math.abs(ok / n - 0.25) < 0.015, `H4 黑天鵝：單性狀神秘豌豆，假說設 AA、按一次「+1」，出現隱性就改判 Aa 提交——每一顆成功 ${pct(ok / n)}（理論 ½ × ½ = 25%），不成就「換一顆神秘豌豆」`);
  // 對照：一開始就猜 Aa（沒有先被推翻）不算；推翻之後又多產生子代再提交也不算
  let noSwan = 0, extra = 0;
  for (let t = 0; t < 4000; t++) {
    const my = Mystery(1, [1]);
    const e1 = my.sow(1, [1]);
    if (hitsOf([e1, my.guess([1])], ['h4']).length) noSwan++;
    const my2 = Mystery(1, [1]);
    const f1 = my2.sow(1, [2]), f2 = my2.sow(1, [1]);
    if (hitsOf([f1, f2, my2.guess([1])], ['h4']).length) extra++;
  }
  claim(noSwan === 0 && extra === 0, '    假說一開始就是 Aa（沒有被推翻）、或推翻後又多產生子代才提交，都不算');
}
// h5. 祖父母沒有的模樣：RRyy × rrYY 產生子一代，再讓子一代自交
{
  let ok = 0, ex = null;
  const n = 4000;
  for (let t = 0; t < n; t++) {
    const evs = [di([2, 0], [0, 2])().sow(10), di([1, 1], [1, 1])().sow(16)];
    if (hitsOf(evs, ['h5']).length) { ok++; if (!ex) ex = evs; }
  }
  solutions.h5 = ex;
  claim(ok / n > 0.6, `H5 祖父母沒有的模樣：RRyy × rrYY 產生 10 個子一代，按「F1 自交」再產生 16 個，圓黃與皺綠都出現 ${pct(ok / n)}（不夠就再多產生幾個）`);
  const plain = hitsOf([di([2, 2], [0, 0])().sow(10), di([1, 1], [1, 1])().sow(1000)], ['h5']);
  const noP = hitsOf([di([1, 1], [1, 1])().sow(1000)], ['h5']);
  claim(plain.length === 0 && noP.length === 0, '    RRYY × rryy 之後的子二代（圓黃、皺綠是祖父母本來就有的）、或沒有先做親代雜交，都不算');
}
// h6. 一顆就夠：雙性狀神秘豌豆按一次「+1」，若是雙隱性就判 AaBb 提交
{
  let ok = 0, ex = null;
  const n = 40000;
  for (let t = 0; t < n; t++) {
    const my = Mystery(2);
    my.sow(1, [1, 1]);
    const ev = my.guess(my.s.pheno[3] === 1 ? [1, 1] : [2, 2]);
    if (hitsOf([ev], ['h6']).length) { ok++; if (!ex) ex = [ev]; }
  }
  solutions.h6 = ex;
  claim(Math.abs(ok / n - 1 / 16) < 0.006, `H6 一顆就夠：雙性狀神秘豌豆按一次「+1」就是 rryy、立刻判 RrYy——成功 ${pct(ok / n)}（理論 ¼ × ¼ = 6.25%，平均約 16 顆）`);
}
// h7. 大數法則：雙性狀子二代一路按「+1000」到 20 000 個，四類都在期望比例 ±0.5 個百分點內
{
  let ok = 0, ex = null;
  const n = 2000;
  for (let t = 0; t < n; t++) {
    const lab = di([1, 1], [1, 1])();
    const evs = []; for (let k = 0; k < 20; k++) evs.push(lab.sow(1000));
    if (hitsOf(evs, ['h7']).length) { ok++; if (!ex) ex = evs; }
  }
  solutions.h7 = ex;
  claim(ok / n > 0.6, `H7 兩萬顆之後：雙性狀子二代按 20 次「+1000」到上限 20 000 個，四類都差不到 0.5 個百分點 ${pct(ok / n)}`);
  let early = 0;
  for (let t = 0; t < 500; t++) { const lab = di([1, 1], [1, 1])(); if (hitsOf([lab.sow(1000), lab.sow(1000), lab.sow(1000)], ['h7']).length) early++; }
  claim(early === 0, '    還沒到 20 000 個不算');
}
// h8. 花色 929、莖高 1064
{
  const evs = [mono(1, 1, 'flower')().sow(929), mono(1, 1, 'height')().sow(1064)];
  solutions.h8 = evs;
  const swapped = hitsOf([mono(1, 1, 'flower')().sow(1064), mono(1, 1, 'height')().sow(929)], ['h8']);
  claim(hitsOf(evs, ['h8']).length === 1 && hitsOf([evs[0]], ['h8']).length === 0 && swapped.length === 0,
    'H8 另外兩本帳：花色子二代 929 個、莖高子二代 1064 個（同一次造訪）都做了才成立；只做一本、或數字對調都不算');
}
// h9. 正反試交 110 與 98
{
  const evs = [di([1, 1], [0, 0])().sow(110), di([0, 0], [1, 1])().sow(98)];
  solutions.h9 = evs;
  const one = hitsOf([evs[0], di([1, 1], [0, 0])().sow(98)], ['h9']);
  const sw = hitsOf([di([1, 1], [0, 0], ['color', 'shape'])().sow(110), di([0, 0], [1, 1], ['color', 'shape'])().sow(98)], ['h9']);
  const fl = hitsOf([di([1, 1], [0, 0], ['flower', 'height'])().sow(110), di([0, 0], [1, 1], ['flower', 'height'])().sow(98)], ['h9']);
  claim(hitsOf(evs, ['h9']).length === 1 && one.length === 0 && sw.length === 1 && fl.length === 0,
    'H9 正反試交：RrYy ♀ × rryy ♂ 產生 110 個、rryy ♀ × RrYy ♂ 產生 98 個才成立（性狀順序對調也可以；同一個方向做兩次、或用花色＋莖高都不算）');
}
// h10. 正反回交 90 與 87，要看基因型長條圖
{
  const evs = [di([1, 1], [2, 2], null, true)().sow(90), di([2, 2], [1, 1], null, true)().sow(87)];
  solutions.h10 = evs;
  const noChart = hitsOf([di([1, 1], [2, 2])().sow(90), di([2, 2], [1, 1])().sow(87)], ['h10']);
  const one = hitsOf([evs[0]], ['h10']);
  claim(hitsOf(evs, ['h10']).length === 1 && noChart.length === 0 && one.length === 0,
    'H10 正反回交：RrYy ♀ × RRYY ♂ 種出 90 株、RRYY ♀ × RrYy ♂ 種出 87 株，而且都在看「基因型」長條圖時產生才成立（沒看基因型、只做一組都不算）');
}
// 隱藏任務彼此不連帶完成：每個解只完成它自己
{
  const bad = [];
  Object.keys(solutions).forEach(id => {
    const got = hitsOf(solutions[id]);
    if (got.length !== 1 || got[0] !== id) bad.push(id + '→' + got.join('、'));
  });
  claim(bad.length === 0, '新隱藏任務 h4–h10 的解都只完成自己，不會順便完成其他隱藏任務' + (bad.length ? '：' + bad.join('；') : ''));
  let side = 0;
  for (let t = 0; t < 300; t++) {
    const lab = di([1, 1], [1, 1])(); const evs = [];
    for (let k = 0; k < 20; k++) evs.push(lab.sow(1000));
    if (hitsOf(evs).some(id => id !== 'h7')) side++;
  }
  claim(side === 0, `    h7 的路線（到 20 000 個）重做 300 次，沒有順手完成其他隱藏任務（${side} 次）`);
}
// 一般任務的典型做法不會順手完成新的隱藏任務
{
  const seq = (lab, bs) => bs.map(b => lab.sow(b));
  const routes = {
    'M2 純種雜交 10 個': [di([2, 2], [0, 0])().sow(10)],
    'M4 單性狀子二代 +100×4': seq(mono(1, 1)(), [100, 100, 100, 100]),
    'M7 雙性狀子二代 556': [di([1, 1], [1, 1])().sow(556)],
    'M8 雙性狀試交 +100×20': seq(di([1, 1], [0, 0])(), new Array(20).fill(100)),
    'M11 556 再 +100×30': seq(di([1, 1], [1, 1])(), [556].concat(new Array(30).fill(100))),
    'H3 形狀 7324': seq(mono(1, 1, 'shape')(), [1000, 1000, 1000, 1000, 1000, 1000, 1000, 324])
  };
  const newH = ['h4', 'h5', 'h6', 'h7', 'h8', 'h9', 'h10'];
  const bad = [];
  Object.keys(routes).forEach(k => { const got = hitsOf(routes[k], newH); if (got.length) bad.push(k + '→' + got.join('、')); });
  // 偵探任務的策略（9、10、12），用了超過 1 個子代
  let det = 0;
  for (let t = 0; t < 3000; t++) {
    const my = Mystery(2);
    const evs = [];
    for (;;) { evs.push(my.sow(1, [1, 1])); const rs = M.recessiveSeen(my.s.pheno, 2); if (rs.every(x => x > 0) || my.s.N >= 8) break; }
    evs.push(my.guess(M.recessiveSeen(my.s.pheno, 2).map(x => (x > 0 ? 1 : 2))));
    if (my.s.N > 1 && hitsOf(evs, newH).length) det++;
  }
  claim(bad.length === 0 && det === 0, '一般任務的典型做法（純種雜交、三比一、九比三比三比一、試交、比孟德爾更準、八個夏天、偵探用超過 1 個子代）不會順手完成 h4–h10' + (bad.length ? '：' + bad.join('；') : ''));
}
{
  const lv = defs.filter(m => m.hidden).map(m => m.level);
  const stars = defs.reduce((a, m) => a + (m.hidden ? m.level * 2 : m.level), 0);
  claim(lv.length === 10 && Math.min.apply(null, lv) >= 3 && lv.filter(x => x >= 7).length >= 3,
    `隱藏任務 ${lv.length} 個，等級 ${lv.slice().sort((a, b) => a - b).join('、')}（7 級以上 ${lv.filter(x => x >= 7).length} 個）；任務共 ${defs.length} 個、${stars} 顆星`);
}

console.log(out.join('\n'));
console.log(fail ? `\n有 ${fail} 項沒有通過。` : '\n全部任務都做得到。');
process.exit(fail ? 1 : 0);
