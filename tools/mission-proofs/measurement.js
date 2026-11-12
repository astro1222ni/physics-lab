/* 任務可達成的證明腳本（測量與不確定度：游標尺與螺旋測微器）。用法：node tools/mission-proofs/measurement.js
 * 修改物理核心或任務條件後重跑，確認每個任務仍然做得到、預設狀態不會觸發任務。
 * 做法：只用物理核心 js/measurement-core.js，照頁面 js/measurement.js 的方式出題（makeVernierItem、makeMicroItem）、
 * 核對讀數（checkVernier、checkMicro）、累計成績（連續讀對、各類計數），多次測量用 simulateReading 與 summarize，
 * 組出和頁面完全相同的事件資料，丟進 js/missions/measurement.js 的檢查函式。
 * 用到隨機數的任務（多次測量）用許多組種子重做，列出成功率與需要的次數。 */
'use strict';
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const MC = require(__ROOT + 'js/measurement-core.js');
const defs = {};
global.window = { MeasurementCore: MC, LabMission: { register: (id, list) => list.forEach(m => { defs[m.id] = Object.assign({ mem: {} }, m); }) } };
global.LabMission = global.window.LabMission;
require(__ROOT + 'js/missions/measurement.js');

const fails = [];
const results = {};
function pass(id, how) { results[id] = how; }
function fire(id, ev, mem) { return !!defs[id].check(ev, mem || {}); }
/** 一個事件丟給所有任務，回傳觸發的任務代號 */
function fireAll(ev, mems) {
  return Object.keys(defs).filter(id => { try { return defs[id].check(ev, mems ? (mems[id] = mems[id] || {}) : {}); } catch (e) { return false; } });
}

// ---------- 照頁面：成績與核對 ----------
function newScore() {
  return {
    v: { ok: 0, tries: 0, run: [], best: 0 }, m: { ok: 0, tries: 0, run: [], best: 0 },
    count: { outer: 0, inner: 0, depth: 0, v20: 0, v50: 0, micro: 0, vPos: 0, vNeg: 0, mPos: 0, mNeg: 0 }
  };
}
/** 游標尺：學生在 item 上輸入 str（zeroCheck = 是否在檢查零點） */
function checkV(S, item, str, zeroCheck) {
  const exp = MC.expectedUm(item, zeroCheck);
  const res = MC.checkVernier(str, exp);
  const rUm = zeroCheck ? item.zeroUm : item.readingUm;
  if (!zeroCheck) {
    S.v.tries++;
    if (res.ok) {
      S.v.ok++;
      S.v.run.push({ N: item.N, kind: item.kind, zeroOn: item.zeroOn, zeroMm: item.zeroUm / 1000 });
      if (S.v.run.length > 40) S.v.run.shift();
      S.count[item.kind]++; S.count['v' + item.N]++;
      if (item.zeroUm > 0) S.count.vPos++;
      if (item.zeroUm < 0) S.count.vNeg++;
    } else S.v.run = [];
  }
  return {
    type: 'check', data: {
      instr: 'vernier', N: item.N, kind: zeroCheck ? 'zero' : item.kind, zeroOn: item.zeroOn, zeroMm: item.zeroUm / 1000, zeroCheck: zeroCheck,
      readingMm: rUm / 1000, expectedMm: exp / 1000, sizeMm: item.sizeUm / 1000, answer: res.parsed.value, answerStr: res.parsed.str,
      ok: res.ok, valueOk: res.valueOk, formatOk: res.formatOk, exact: res.ok, intMm: rUm % 1000 === 0,
      runV: S.v.run.slice(), runM: S.m.run.slice(), count: Object.assign({}, S.count)
    }
  };
}
function checkM(S, item, str, zeroCheck) {
  const exp = MC.expectedUm(item, zeroCheck);
  const res = MC.checkMicro(str, exp);
  const rUm = zeroCheck ? item.zeroUm : item.readingUm;
  if (!zeroCheck) {
    S.m.tries++;
    if (res.ok) {
      S.m.ok++;
      S.m.run.push({ kind: item.kind, zeroOn: item.zeroOn, zeroMm: item.zeroUm / 1000, exact: res.exact });
      if (S.m.run.length > 40) S.m.run.shift();
      S.count.micro++;
      if (item.zeroUm > 0) S.count.mPos++;
      if (item.zeroUm < 0) S.count.mNeg++;
    } else S.m.run = [];
  }
  return {
    type: 'check', data: {
      instr: 'micro', N: 0, kind: zeroCheck ? 'zero' : item.kind, zeroOn: item.zeroOn, zeroMm: item.zeroUm / 1000, zeroCheck: zeroCheck,
      readingMm: rUm / 1000, expectedMm: exp / 1000, sizeMm: item.sizeUm / 1000, answer: res.parsed.value, answerStr: res.parsed.str,
      ok: res.ok, valueOk: res.valueOk, formatOk: res.formatOk, exact: !!res.exact, intMm: rUm % 1000 === 0,
      runV: S.v.run.slice(), runM: S.m.run.slice(), count: Object.assign({}, S.count)
    }
  };
}
const ansV = (item, zc) => MC.fixed(MC.expectedUm(item, zc) / 1000, 2);
const ansM = (item, zc) => MC.fixed(MC.expectedUm(item, zc) / 1000, 3);
// makeVernierItem 不記 zeroOn，頁面用 V.zeroOn；這裡補上
const vItem = (rng, N, kind, zeroOn) => Object.assign(MC.makeVernierItem(rng, N, kind, zeroOn), { zeroOn: zeroOn });
const mItem = (rng, kind, zeroOn) => Object.assign(MC.makeMicroItem(rng, kind, zeroOn), { zeroOn: zeroOn });

// ---------- 照頁面：多次測量 ----------
function lab(seed, sigma, bias) {
  const rng = MC.mulberry32(seed);
  return { rng: rng, trueUm: MC.randInt(rng, 6000, 20000), sigma: sigma, bias: bias, sets: { v20: [], v50: [], micro: [] } };
}
function measure(X, instr, n) {
  const arr = X.sets[instr];
  for (let i = 0; i < n && arr.length < 500; i++) arr.push(MC.simulateReading(X.trueUm, instr, X.sigma, X.bias, X.rng));
  const S = {};
  ['v20', 'v50', 'micro'].forEach(k => { S[k] = MC.summarize(X.sets[k], k, X.trueUm / 1000, 'AB'); });
  const cur = S[instr], sets = {};
  Object.keys(S).forEach(k => {
    const s = S[k];
    sets[k] = { n: s.n, mean: s.mean, s: s.s, u: s.uAB, best: s.resultAB ? s.resultAB.bestValue : NaN, unc: s.resultAB ? s.resultAB.uncValue : NaN, contains: s.contains };
  });
  return {
    type: 'stats', data: {
      instr: instr, n: cur.n, mean: cur.mean, s: cur.s, uA: cur.uA, uB: cur.uB, u: cur.uAB, trueMm: X.trueUm / 1000,
      sigma: X.sigma, bias: X.bias, allSame: cur.allSame, precise: cur.precise, accurate: cur.accurate, contains: cur.contains, rodId: 1, sets: sets
    }
  };
}
// 滑桿範圍（measurement.html）：σ 0–0.2、系統誤差 −0.2–0.2，步長 0.001
function assertSlider(name, v, lo, hi) { if (v < lo - 1e-9 || v > hi + 1e-9 || Math.abs(Math.round(v * 1000) - v * 1000) > 1e-6) fails.push(name + ' = ' + v + ' 超出滑桿'); }

// ======================= 預設狀態不會觸發任務 =======================
(function () {
  // 頁面載入時不發出任何事件；以下確認「沒做到」的事件也不會觸發
  const S = newScore(), rng = MC.mulberry32(1);
  const it = vItem(rng, 20, 'outer', false);
  const bad = [
    checkV(S, it, '1.00', false),                  // 讀錯
    checkV(newScore(), it, MC.fixed(it.readingUm / 1000, 1), false), // 少一位
    checkV(newScore(), vItem(rng, 20, 'outer', false), '0.00', true), // 零點核對（不算成績）
    { type: 'ratchet', data: { clicks: 1 } },
    measure(lab(1, 0.02, 0), 'v20', 1)            // 預設 σ、量一次
  ];
  bad.forEach((ev, i) => {
    const hit = fireAll(ev);
    if (hit.length) fails.push('預設或錯誤操作觸發了任務：事件 ' + i + ' → ' + hit.join(', '));
  });
  results['預設狀態'] = '讀錯、少一位、零點核對、棘輪 1 聲、預設 σ 量 1 次：都不觸發任何任務';
})();

// ======================= 讀數任務 =======================
(function () {
  const rng = MC.mulberry32(20261112);
  // measurement-1：讀對一次
  {
    const S = newScore(), it = vItem(rng, 20, 'outer', false);
    const ev = checkV(S, it, ansV(it, false), false);
    if (fire('measurement-1', ev)) pass('measurement-1', '外徑 ' + ansV(it, false) + ' mm 讀對');
  }
  // measurement-2：外徑、內徑、深度各一次
  {
    const S = newScore();
    let ev = null;
    ['outer', 'inner', 'depth'].forEach(k => { const it = vItem(rng, 20, k, false); ev = checkV(S, it, ansV(it, false), false); });
    if (fire('measurement-2', ev)) pass('measurement-2', '外徑、內徑、深度各讀對一次');
  }
  // measurement-3：測微器讀對
  {
    const S = newScore(), it = mItem(rng, 'wire', false);
    const ev = checkM(S, it, ansM(it, false), false);
    if (fire('measurement-3', ev)) pass('measurement-3', '細線 ' + ansM(it, false) + ' mm 讀對');
  }
  // measurement-4：百分位是 0 的讀數（按「下一個物件」直到遇到）
  {
    const S = newScore();
    let tries = 0, done = false;
    while (!done && tries < 200) {
      tries++;
      const it = vItem(rng, 20, 'outer', false);
      const ev = checkV(S, it, ansV(it, false), false);
      if (fire('measurement-4', ev)) { done = true; pass('measurement-4', '第 ' + tries + ' 個物件讀數 ' + ansV(it, false) + ' mm（20 格游標約每 2 個物件就有 1 個）'); }
    }
  }
  // measurement-5：連續 5 次
  {
    const S = newScore();
    let ev = null;
    for (let i = 0; i < 5; i++) { const it = vItem(rng, 50, 'outer', false); ev = checkV(S, it, ansV(it, false), false); }
    if (fire('measurement-5', ev)) pass('measurement-5', '50 格游標外徑連續讀對 5 次');
    // 中間讀錯會重算
    const S2 = newScore();
    for (let i = 0; i < 4; i++) { const it = vItem(rng, 20, 'outer', false); checkV(S2, it, ansV(it, false), false); }
    checkV(S2, vItem(rng, 20, 'outer', false), '0.01', false);
    const it = vItem(rng, 20, 'outer', false);
    if (fire('measurement-5', checkV(S2, it, ansV(it, false), false))) fails.push('measurement-5：讀錯後沒有重算');
  }
  // measurement-6：零點誤差為正、為負各一次（輸入修正後的長度）
  {
    const S = newScore();
    let pos = false, neg = false, n = 0, ev = null;
    while (!(pos && neg) && n < 50) {
      n++;
      const it = vItem(rng, 20, 'outer', true);
      checkV(S, it, ansV(it, true), true); // 先檢查零點
      ev = checkV(S, it, ansV(it, false), false);
      if (it.zeroUm > 0) pos = true;
      if (it.zeroUm < 0) neg = true;
    }
    if (fire('measurement-6', ev)) pass('measurement-6', n + ' 個零點誤差題（正、負都遇到）都輸入 L = R − e');
    // 只輸入 R（沒修正）不算
    const it = vItem(rng, 20, 'outer', true);
    if (checkV(newScore(), it, MC.fixed(it.readingUm / 1000, 2), false).data.ok) fails.push('measurement-6：沒修正零點也算對');
  }
  // measurement-7：測微器連續 3 次估讀位完全正確
  {
    const S = newScore();
    let ev = null;
    ['wire', 'sheet', 'ball'].forEach(k => { const it = mItem(rng, k, false); ev = checkM(S, it, ansM(it, false), false); });
    if (fire('measurement-7', ev)) pass('measurement-7', '細線、薄片、鋼珠各一次，3 位小數完全正確');
    // 估讀差 1（容許，但不算 exact）
    const S2 = newScore();
    let ev2 = null;
    for (let i = 0; i < 3; i++) { const it = mItem(rng, 'wire', false); ev2 = checkM(S2, it, MC.fixed((MC.expectedUm(it, false) + 1) / 1000, 3), false); }
    if (!ev2.data.ok) fails.push('measurement-7：估讀差 1 應該算讀對');
    if (fire('measurement-7', ev2)) fails.push('measurement-7：估讀差 1 也觸發了');
  }
  // measurement-11：測微器零點誤差連續 5 次
  {
    const S = newScore();
    let ev = null;
    for (let i = 0; i < 5; i++) {
      const it = mItem(rng, ['wire', 'sheet', 'ball'][i % 3], true);
      checkM(S, it, ansM(it, true), true);
      ev = checkM(S, it, ansM(it, false), false);
    }
    if (fire('measurement-11', ev)) pass('measurement-11', '測微器有零點誤差，連續 5 次輸入修正後的長度');
  }
  // measurement-12：50 格、零點誤差、連續 10 次、三種各 ≥ 2
  {
    const S = newScore();
    let ev = null;
    const kinds = ['outer', 'outer', 'outer', 'outer', 'inner', 'inner', 'inner', 'depth', 'depth', 'depth'];
    kinds.forEach(k => {
      const it = vItem(rng, 50, k, true);
      checkV(S, it, ansV(it, true), true);
      ev = checkV(S, it, ansV(it, false), false);
    });
    if (fire('measurement-12', ev)) pass('measurement-12', '50 格游標、零點誤差：外徑 4、內徑 3、深度 3，連續 10 次');
    // 混入一次 20 格不算
    const S2 = newScore();
    let ev2 = null;
    kinds.forEach((k, i) => { const it = vItem(rng, i === 5 ? 20 : 50, k, true); ev2 = checkV(S2, it, ansV(it, false), false); });
    if (fire('measurement-12', ev2)) fails.push('measurement-12：混入 20 格也觸發');
  }
  // measurement-h1：讀數剛好是整數毫米（游標第 0 條與最後一條同時對齊）
  {
    const S = newScore();
    let tries = 0, done = false;
    while (!done && tries < 500) {
      tries++;
      const it = vItem(rng, 20, 'outer', false);
      const ev = checkV(S, it, ansV(it, false), false);
      if (fire('measurement-h1', ev)) {
        done = true;
        const rd = MC.vernierRead(it.readingUm, 20);
        pass('measurement-h1', '第 ' + tries + ' 個物件讀數 ' + ansV(it, false) + ' mm（k = ' + rd.k + '，第 0 條與第 20 條同時對齊；20 格約 1/20 的機會）');
      }
    }
  }
  // measurement-h3：棘輪打滑 10 次（照頁面 mMove：接觸後每多轉 0.01 mm 喀一聲）
  {
    const lim = 0.5; let s = 0.6, touching = false, push = 0, clicks = 0, done = false;
    const move = function (d) {
      let ns = s + d;
      if (ns < lim - 1e-12) {
        const over = lim - ns; ns = lim;
        if (touching || Math.abs(s - lim) < 1e-9) { push += over; while (push >= 0.01 - 1e-9) { push -= 0.01; clicks++; if (fire('measurement-h3', { type: 'ratchet', data: { clicks: clicks } })) done = true; } }
      }
      s = ns; touching = Math.abs(s - lim) < 1e-9; if (!touching) { push = 0; clicks = 0; }
    };
    for (let i = 0; i < 10; i++) move(-0.01);  // 「−1 格」按 10 下：碰到物體
    for (let i = 0; i < 10; i++) move(-0.01);  // 再按 10 下：棘輪喀 10 聲
    if (done) pass('measurement-h3', '測軸碰到後再按「−1 格」10 下（或繼續拖曳 0.10 mm）');
  }
})();

// ======================= 多次測量任務 =======================
function rate(fn, N) { let ok = 0; for (let k = 1; k <= N; k++) if (fn(k)) ok++; return ok / N; }
// measurement-8：0.02 mm 游標、σ = 0.050 mm，量到 uA ≤ 0.010 mm
{
  assertSlider('σ', 0.05, 0, 0.2);
  const ns = [];
  for (let k = 1; k <= 200; k++) {
    const X = lab(1000 + k, 0.05, 0);
    let n = 0, hit = false;
    while (!hit && n < 500) { const ev = measure(X, 'v50', 1); n++; hit = fire('measurement-8', ev); }
    if (hit) ns.push(n); else fails.push('measurement-8：種子 ' + k + ' 量 500 次還沒達成');
  }
  ns.sort((a, b) => a - b);
  if (ns.length === 200) pass('measurement-8', 'σ = 0.050 mm，一次一次量：需要 ' + ns[0] + '–' + ns[ns.length - 1] + ' 次（中位數 ' + ns[100] + '；理論 n ≥ (s/0.010)² ≈ 25）');
  // σ < 0.05 不算
  const X = lab(7, 0.049, 0);
  if (fire('measurement-8', measure(X, 'v50', 200))) fails.push('measurement-8：σ = 0.049 也觸發');
}
// measurement-9：精密但不準確＋準確但不精密
{
  assertSlider('σ', 0.005, 0, 0.2); assertSlider('系統誤差', 0.1, -0.2, 0.2); assertSlider('σ', 0.2, 0, 0.2);
  const r = rate(function (k) {
    const mem = {};
    const A = lab(2000 + k, 0.005, 0.1);   // 測微器：σ = 0.005、系統誤差 +0.100 → 精密但不準確
    fire('measurement-9', measure(A, 'micro', 10), mem);
    const B = lab(3000 + k, 0.2, 0);       // 0.05 mm 游標：σ = 0.200、無系統誤差 → 準確但不精密
    let hit = false;
    for (let i = 0; i < 4 && !hit; i++) hit = fire('measurement-9', measure(B, 'v20', 10), mem);
    return hit;
  }, 300);
  if (r > 0.9) pass('measurement-9', '測微器 σ = 0.005、系統誤差 +0.100 量 10 次（精密但不準確）；換成 0.05 mm 游標、σ = 0.200、系統誤差 0 量 10–40 次（準確但不精密）：成功率 ' + (r * 100).toFixed(1) + '%');
  else fails.push('measurement-9 成功率太低：' + r);
}
// measurement-10：三種儀器各 ≥ 10 次，都含真值，ΔX 測微器 < 0.02 < 0.05
{
  assertSlider('σ', 0.01, 0, 0.2);
  const tryOnce = function (k, n) {
    const X = lab(4000 + k, 0.01, 0);
    measure(X, 'v20', n); measure(X, 'v50', n);
    return fire('measurement-10', measure(X, 'micro', n));
  };
  const r10 = rate(k => tryOnce(k, 10), 400), r20 = rate(k => tryOnce(k, 20), 400);
  // 學生做不到時可「換一根圓棒」重來：模擬最多 3 根
  const r3 = rate(function (k) { for (let j = 0; j < 3; j++) if (tryOnce(k * 7 + j, 10)) return true; return false; }, 400);
  if (r10 > 0.4) pass('measurement-10', 'σ = 0.010 mm、系統誤差 0：三種儀器各量 10 次，一次成功率 ' + (r10 * 100).toFixed(1) + '%（各量 20 次 ' + (r20 * 100).toFixed(1) + '%；最多換 3 根圓棒 ' + (r3 * 100).toFixed(1) + '%）');
  else fails.push('measurement-10 成功率太低：' + r10);
  // σ 太大時三種儀器差不多，排序常不成立（教學重點）
  const big = rate(function (k) { const X = lab(5000 + k, 0.15, 0); measure(X, 'v20', 10); measure(X, 'v50', 10); return fire('measurement-10', measure(X, 'micro', 10)); }, 400);
  results['measurement-10（對照）'] = 'σ = 0.150 mm 時同樣做法成功率只有 ' + (big * 100).toFixed(1) + '%：儀器再精密也贏不了大的隨機誤差';
}
// measurement-h2：20 次讀數完全相同，平均值卻離真值 ≥ 0.01 mm
{
  assertSlider('σ', 0, 0, 0.2); assertSlider('系統誤差', 0.1, -0.2, 0.2);
  const r = rate(function (k) { const X = lab(6000 + k, 0, 0.1); return fire('measurement-h2', measure(X, 'v20', 20)); }, 200);
  const r0 = rate(function (k) { const X = lab(6500 + k, 0, 0); return fire('measurement-h2', measure(X, 'v20', 20)); }, 400);
  if (r === 1) pass('measurement-h2', 'σ = 0、系統誤差 +0.100 mm，0.05 mm 游標量 20 次（成功率 100%）；系統誤差 0 時只靠刻度取整，成功率 ' + (r0 * 100).toFixed(1) + '%');
  else fails.push('measurement-h2 成功率 ' + r);
}

// ======================= 結果 =======================
const all = Object.keys(defs);
const missing = all.filter(id => !results[id]);
console.log('任務證明（' + all.length + ' 個任務）：');
Object.keys(results).forEach(id => console.log('  ✓ ' + id + (defs[id] ? '（' + defs[id].level + ' 級' + (defs[id].hidden ? '、隱藏' : '') + '）' : '') + '：' + results[id]));
missing.forEach(id => fails.push(id + ' 沒有證明'));
if (fails.length) { console.log('\n失敗：'); fails.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
console.log('\n全部做得到；預設狀態不會觸發。');
