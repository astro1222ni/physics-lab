/* 任務可達成的證明腳本。用法：node tools/mission-proofs/hardy-weinberg.js
 * 用族群遺傳核心（js/hardy-weinberg-core.js）照頁面的做法算出 'gen'、'test'、'drift' 事件（與 js/hardy-weinberg.js 相同的計算），
 * 再用任務檔（js/missions/hardy-weinberg.js）同一份 check 函式判定。每個任務都給出一組做得到的操作，並檢查預設狀態不會誤觸。
 * 隨機的任務（漂變、抽樣）用多個亂數種子估計成功的比例，確認學生多試幾次就做得到。
 * 修改核心、頁面的事件或任務條件後重跑。 */
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..', '..') + '/';
const H = require(ROOT + 'js/hardy-weinberg-core.js');

const defs = [];
const fakeLM = { register: function (id, list) { list.forEach(m => defs.push(Object.assign({ mem: {} }, m))); } };
new Function('window', 'LabMission', fs.readFileSync(ROOT + 'js/missions/hardy-weinberg.js', 'utf8'))({ LabMission: fakeLM }, fakeLM);
const byId = {};
defs.forEach(m => { byId[m.id.replace('hardy-weinberg-', '')] = m; });
const check = (id, ev) => byId[id].check(ev, byId[id].mem);

const out = [];
let fail = 0;
function claim(ok, msg) { out.push((ok ? '✓ ' : '✗ ') + msg); if (!ok) fail++; }
const f = (v, d) => (v == null || !isFinite(v)) ? '—' : v.toFixed(d);

// ---------- 與 js/hardy-weinberg.js 相同的計算 ----------
/** 從 start 出發，依序按 steps（每一項是 [代數, σ]）；回傳每次按下時送出的 'gen' 事件 */
function genEvents(start, presses) {
  const hist = [start.slice()], sigs = [], evs = [];
  presses.forEach(pr => {
    const n = pr[0], sig = pr[1];
    for (let i = 0; i < n; i++) { hist.push(H.mate(hist[hist.length - 1], sig)); sigs.push(sig); }
    const g = hist[hist.length - 1], prev = hist[hist.length - 2];
    evs.push({ type: 'gen', data: { gen: hist.length - 1, steps: n, start: start.slice(), g: g.slice(), prev: prev.slice(), sigma: sig, sigMin: Math.min.apply(null, sigs), sigMax: Math.max.apply(null, sigs), dev: H.hwDev(g), devStart: H.hwDev(start), H0: start[1], H: g[1], F: H.inbreedingF(g), Fstart: H.inbreedingF(start), Feq: H.selfingF(sig), p: H.alleleP(g) } });
  });
  return evs;
}
const last = a => a[a.length - 1];
function testEv(g, n, seed, gen, sigma) {
  const obs = H.sample(n, g, H.rng(seed));
  const r = H.hwTest(obs);
  return { type: 'test', data: { gen: gen || 0, sigma: sigma || 0, n: n, obs: obs, chi2: r.chi2, pval: r.pval, reject: r.pval < 0.05, F: H.inbreedingF(g), dev: H.hwDev(g), p: H.alleleP(g), Fhat: r.Fhat } };
}
const DEF2 = { N: 50, pops: 30, p0: 0.5, gens: 100, w: [1, 1, 1], u: 0, v: 0, m: 0, pm: 0.5 };
function driftEv(o, seed) {
  const oo = Object.assign({}, DEF2, o, { seed: seed });
  return { type: 'drift', data: H.summarize(H.simulate(oo)) };
}
/** 用 seeds 個亂數種子，回傳完成的比例 */
function rate(id, o, seeds) {
  let k = 0;
  for (let s = 1; s <= seeds; s++) if (byId[id].check(driftEv(o, 1000 + s), {})) k++;
  return k / seeds;
}
function rateTest(id, g, n, seeds) {
  let k = 0;
  for (let s = 1; s <= seeds; s++) if (byId[id].check(testEv(g, n, 500 + s), {})) k++;
  return k / seeds;
}

const START = [0.5, 0, 0.5];   // 頁面預設：紅白各半

// ---------- 1 一代就平衡 ----------
{
  const e = genEvents(START, [[1, 0]]);
  claim(check('1', e[0]), '1：預設（紅白各半）隨機交配一代 → 到哈溫平衡');
  claim(!check('1', genEvents(START, [[10, 0]])[0]), '1：一次跑 10 代不算（要看到一代的效果）');
  claim(!check('1', genEvents(H.genotypes(0.3), [[1, 0]])[0]), '1：本來就在平衡不算');
  claim(!check('1', genEvents(START, [[1, 0.5]])[0]), '1：有自花授粉時一代到不了');
}
// ---------- 2 樣本合乎預期 ----------
{
  const r = rateTest('2', H.genotypes(0.5), 100, 400);
  claim(r > 0.9, `2：平衡族群抽 100 株，約 ${f(100 * r, 0)}% 的檢定相符（理論 95%）`);
  claim(rateTest('2', START, 100, 50) === 0, '2：第 0 代（還沒交配）的族群不算');
  claim(rateTest('2', H.genotypes(0.5), 90, 20) === 0, '2：少於 100 株不算');
}
// ---------- 3 不是固定，就是消失 ----------
{
  const r = rate('3', { N: 10, gens: 100 }, 40);
  claim(r > 0.9, `3：N = 10、30 族群、100 代，${f(100 * r, 0)}% 的種子完成`);
  const rd = rate('3', {}, 40);
  out.push(`  （3：預設 N = 50、100 代時 ${f(100 * rd, 0)}% 完成——3 級任務，可以接受）`);
  claim(rate('3', { N: 10, w: [1.1, 1.05, 1] }, 10) === 0, '3：有天擇不算');
}
// ---------- 4 自花授粉 ----------
{
  const e = genEvents(H.genotypes(0.5), [[1, 1], [1, 1], [1, 1]]);
  claim(!check('4', e[1]) && check('4', e[2]), `4：從平衡（Aa 50%）完全自交 3 代 → Aa ${f(100 * e[2].data.H, 2)}%（起始的 1/8）`);
  const e10 = genEvents(H.genotypes(0.5), [[10, 1]]);
  claim(check('4', e10[0]), '4：一次跑 10 代也可以');
  const mix = genEvents(H.genotypes(0.5), [[1, 0.9], [5, 1]]);
  claim(!check('4', mix[1]), '4：中間用過不是 100% 的 σ 不算');
  claim(!check('4', genEvents([0.45, 0.1, 0.45], [[10, 1]])[0]), '4：起始粉紅花不到 20% 不算');
}
// ---------- 5 自交與雜交的拉鋸 ----------
{
  const e = genEvents(H.genotypes(0.5), [[10, 0.5]]);
  claim(check('5', e[0]), `5：從平衡出發 σ = 50% 跑 10 代 → F = ${f(e[0].data.F, 4)}（平衡值 1/3）`);
  const e5 = genEvents(H.genotypes(0.5), [[5, 0.5]]);
  claim(!check('5', e5[0]), `5：只跑 5 代 F = ${f(e5[0].data.F, 4)}，還不夠近或代數不足`);
  const e2 = genEvents(H.genotypes(0.5), [[10, 0.1]]);
  claim(!check('5', e2[0]), '5：σ = 10% 時平衡 F 只有 0.053，不算');
  const ch = genEvents(H.genotypes(0.5), [[5, 0.6], [10, 0.5]]);
  claim(!check('5', ch[1]), '5：中途改過 σ 不算');
}
// ---------- 6 抓到一點點不平衡 ----------
{
  const g = last(genEvents(H.genotypes(0.5), [[10, 0.4]])).data.g;   // σ = 40%：F → 0.25
  const F = H.inbreedingF(g);
  const r = rateTest('6', g, 300, 300);
  claim(r > 0.6, `6：σ = 40% 跑 10 代（F = ${f(F, 3)}），抽 300 株，${f(100 * r, 0)}% 的檢定拒絕`);
  claim(rateTest('6', START, 100, 20) === 0, '6：第 0 代（F = 1）太明顯，不算');
  claim(rateTest('6', g, 400, 20) === 0, '6：抽超過 300 株不算');
}
// ---------- 7 漂變的速度 ----------
{
  const o = { N: 20, pops: 50, gens: 30 };
  const th = H.hetDecay(1, 20, 30);
  const r = rate('7', o, 40);
  claim(r > 0.8, `7：N = 20、50 族群、30 代（理論剩 ${f(100 * th, 1)}%），${f(100 * r, 0)}% 的種子完成`);
  claim(rate('7', {}, 20) === 0, '7：預設 N = 50 太大，不算');
  claim(rate('7', { N: 20, pops: 50, gens: 10 }, 10) === 0, '7：代數太少（理論還剩 78%）不算');
}
// ---------- 8 天擇的力量 ----------
{
  const o = { N: 1000, p0: 0.05, gens: 300, w: [1.1, 1.05, 1] };
  const e = driftEv(o, 1);
  claim(check('8', e), `8：A 有利 (1.1, 1.05, 1)、N = 1000、p0 = 0.05、300 代 → 平均 p = ${f(e.data.meanP, 3)}`);
  const e2 = driftEv(Object.assign({}, o, { gens: 100 }), 1);
  claim(!check('8', e2), `8：只跑 100 代平均 p = ${f(e2.data.meanP, 3)}，還不夠`);
  claim(!check('8', driftEv(Object.assign({}, o, { N: 500 }), 1)), '8：N 不到 1000 不算');
  claim(rate('8', o, 20) === 1, '8：每個種子都做得到');
}
// ---------- 9 頑強的隱性致死基因 ----------
{
  const o = { N: 5000, p0: 0.5, gens: 50, w: [1, 1, 0] };
  const r = rate('9', o, 40);
  const e = driftEv(o, 1);
  claim(r > 0.9, `9：aa 致死、N = 5000、q0 = 0.5、50 代：理論 q = ${f(e.data.lethalQ, 4)}，模擬 ${f(1 - e.data.meanP, 4)}；${f(100 * r, 0)}% 的種子完成`);
  claim(rate('9', Object.assign({}, o, { N: 3000 }), 40) > 0.8, '9：N = 3000 也可以');
  claim(rate('9', Object.assign({}, o, { gens: 70 }), 40) > 0.8, '9：跑 70 代（q 約 0.014）也可以');
  claim(!check('9', driftEv(Object.assign({}, o, { gens: 200 }), 1)), '9：跑太久 q 低於 0.01 不算');
  claim(!check('9', driftEv(Object.assign({}, o, { N: 1000 }), 1)), '9：N = 1000 不算（小族群的漂變讓 a 掉得比理論快）');
}
// ---------- 10 兩種都留下來 ----------
{
  const o = { N: 500, p0: 0.5, gens: 150, w: [0.88, 1, 0.14] };
  const r = rate('10', o, 40);
  const e = driftEv(o, 1);
  claim(r > 0.8, `10：Aa 最有利 (0.88, 1, 0.14)、N = 500、p0 = 0.5、150 代 → 平均 p = ${f(e.data.meanP, 3)}（p̂ = ${f(e.data.pHat, 3)}），${f(100 * r, 0)}% 的種子完成`);
  claim(!check('10', driftEv(Object.assign({}, o, { p0: 0.8 }), 1)), '10：起點離 p̂ 不到 0.2 不算');
  claim(!check('10', driftEv(Object.assign({}, o, { p0: 0.2, gens: 10 }), 1)), '10：從 0.2 出發只跑 10 代，還沒到平衡');
}
// ---------- 11 突變與天擇的平衡 ----------
{
  const o = { N: 2000, pops: 20, p0: 1, gens: 300, w: [1, 1, 0], u: 0.001 };
  const r = rate('11', o, 30);
  const e = driftEv(o, 1);
  claim(r > 0.8, `11：aa 致死、u = 0.001、N = 2000、20 族群、300 代 → q = ${f(1 - e.data.meanP, 4)}（√(u/s) = ${f(e.data.mutSelQ, 4)}），${f(100 * r, 0)}% 的種子完成`);
  const o2 = { N: 3000, pops: 30, p0: 1, gens: 400, w: [1, 1, 0.5], u: 0.0005 };
  const e2 = driftEv(o2, 2);
  claim(rate('11', o2, 20) > 0.6, `11：w_aa = 0.5、u = 0.0005、N = 3000、400 代 → q = ${f(1 - e2.data.meanP, 4)}（√(u/s) = ${f(e2.data.mutSelQ, 4)}）也可以`);
  claim(!check('11', driftEv(Object.assign({}, o, { v: 0.001 }), 1)), '11：有 a → A 的突變不算');
}
// ---------- 12 木村的機會之窗 ----------
{
  const o = { N: 100, pops: 200, p0: 0.005, gens: 1000, w: [1.1, 1.05, 1] };
  const e = driftEv(o, 1);
  const r = rate('12', o, 30);
  claim(e.data.n0 === 1, '12：N = 100 時 p0 = 0.005 剛好是一份 A');
  claim(r > 0.9, `12：A 有利 (1.1, 1.05, 1)、N = 100、200 族群、1000 代：木村 u = ${f(100 * e.data.uFix, 2)}%，這次 ${e.data.fixed} 個勝出；${f(100 * r, 0)}% 的種子完成`);
  claim(!check('12', driftEv(Object.assign({}, o, { w: [1, 1, 1] }), 1)), '12：中性不算');
  claim(!check('12', driftEv(Object.assign({}, o, { p0: 0.01 }), 1)), '12：起點兩份不算');
  claim(!check('12', driftEv(Object.assign({}, o, { gens: 30 }), 1)), '12：代數太少、還沒分出勝負不算');
}
// ---------- h1 遷移 ----------
{
  const o = { N: 20, pops: 30, p0: 0.1, gens: 300, m: 0.1, pm: 0.5 };
  const r = rate('h1', o, 30);
  claim(r > 0.7, `h1：N = 20、m = 0.1（Nm = 2）、p0 = 0.1 → pm = 0.5、300 代，${f(100 * r, 0)}% 的種子完成`);
  claim(rate('h1', Object.assign({}, o, { m: 0 }), 10) === 0, 'h1：沒有遷移不算');
  claim(rate('h1', Object.assign({}, o, { m: 0.01 }), 10) < 0.3, 'h1：Nm = 0.2 太少，多半有族群固定或消失');
}
// ---------- h2 最適合的也可能消失 ----------
{
  const o = { N: 20, pops: 30, p0: 0.05, gens: 200, w: [1.1, 1.05, 1] };
  const r = rate('h2', o, 20);
  claim(r > 0.9, `h2：A 有利、N = 20、p0 = 0.05（兩份），${f(100 * r, 0)}% 的種子有族群失去 A`);
  claim(rate('h2', Object.assign({}, o, { N: 5000, p0: 0.5 }), 5) === 0, 'h2：大族群、起點高時不會');
}
// ---------- h3 全是粉紅花 ----------
{
  const e = genEvents([0, 1, 0], [[1, 0]]);
  claim(check('h3', e[0]), `h3：全部 Aa 隨機交配一代 → (${e[0].data.g.map(x => f(x, 2)).join(', ')})`);
  claim(!check('h3', genEvents(START, [[1, 0]])[0]), 'h3：預設不算');
}

// ---------- 預設狀態不會誤觸 L4 以上與隱藏任務 ----------
{
  const hard = ['5', '6', '7', '8', '9', '10', '11', '12', 'h1', 'h2', 'h3'];
  const dflt = [genEvents(START, [[1, 0]])[0], genEvents(START, [[10, 0]])[0], testEv(START, 100, 1), testEv(H.genotypes(0.5), 100, 2)];
  for (let s = 1; s <= 10; s++) dflt.push(driftEv({}, s));
  const hits = hard.filter(id => dflt.some(e => byId[id].check(e, {})));
  claim(hits.length === 0, '預設的操作不會完成 L4 以上的任務或隱藏任務' + (hits.length ? '（誤觸：' + hits.join('、') + '）' : ''));
}

// 邊界值：學生照說明打剛好的值（浮點誤差算出 0.19999…、0.0999…）也要算完成；差一點點則不算
{
  const g4 = { gen: 3, sigMin: 1, H0: 0.6 * (1 / 3), H: 0.025 };   // 0.6 × 1/3 在浮點是 0.19999999999999998
  claim(H0Below(g4.H0) && byId['4'].check({ type: 'gen', data: g4 }, {}), '任務 4：起始異型合子比例剛好 20%（浮點 ' + g4.H0 + '）算完成');
  claim(!byId['4'].check({ type: 'gen', data: Object.assign({}, g4, { H0: 0.199, H: 0.0248 }) }, {}), '任務 4：19.9% 不算');
  const base11 = { mutSelQ: 0.1, v: 0, m: 0, pops: 10, N: 2000, p0: 0.99, gens: 300, meanP: 0.9 };
  claim(1 - 0.9 / 1.0 < 0.1 && byId['11'].check({ type: 'drift', data: Object.assign({ w: [1, 1, 0.9] }, base11) }, {}), '任務 11：w_aa 剛好低 10%（1 − 0.9/1 = ' + (1 - 0.9 / 1.0) + '）算完成');
  claim(!byId['11'].check({ type: 'drift', data: Object.assign({ w: [1, 1, 0.91] }, base11) }, {}), '任務 11：只低 9% 不算');
  function H0Below(x) { return x < 0.2; }
}

const starsOf = m => m.hidden ? 2 * m.level : m.level;
const total = defs.reduce((s, m) => s + starsOf(m), 0), pub = defs.filter(m => !m.hidden).reduce((s, m) => s + m.level, 0);
out.push(`任務 ${defs.length} 個（公開 ${defs.filter(m => !m.hidden).length}、隱藏 ${defs.filter(m => m.hidden).length}），共 ${total} 顆星（公開 ${pub}，隱藏 ${total - pub}）`);
console.log(out.join('\n'));
if (fail) { console.error(fail + ' 項不成立'); process.exitCode = 1; }
