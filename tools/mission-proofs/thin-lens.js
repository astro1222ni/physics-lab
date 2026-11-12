/* 任務可達成的證明腳本。用法：node tools/mission-proofs/thin-lens.js
 * 照頁面的做法模擬（器材位置都在 0.1 cm 的格子上、讀數到 1 mm），確認每個任務都做得到、預設狀態不會觸發任務。
 * 修改物理核心（js/thin-lens-core.js）或任務條件（js/missions/thin-lens.js）後重跑。 */
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const TL = require(__ROOT + 'js/thin-lens-core.js');
const r1 = TL.round1;
let fails = 0;
const ok = function (name, cond, info) {
  console.log((cond ? 'OK  ' : 'FAIL') + ' ' + name + (info ? '  ' + info : ''));
  if (!cond) fails++;
};
const SHARP = 0.05;

// ---------- 像屏法：光源屏與像屏固定在格子上，透鏡或像屏放在模糊最小的格子 ----------
function bestScreen(f, xO, xL, dL) {          // 透鏡固定，找最清楚的像屏位置
  let best = null;
  for (let xS = r1(xL + 3); xS <= 98.5 + 1e-9; xS = r1(xS + 0.1)) {
    const b = TL.bench({ f: f, xO: xO, xL: xL, xS: xS, dL: dL || 0 });
    if (!best || b.blur < best.blur) best = { xS: xS, blur: b.blur, b: b };
  }
  return best;
}
function bestLens(f, xO, xS, lo, hi, dL) {    // 光源屏與像屏固定，在 [lo, hi] 內找最清楚的透鏡位置
  let best = null;
  for (let xL = r1(lo); xL <= hi + 1e-9; xL = r1(xL + 0.1)) {
    const b = TL.bench({ f: f, xO: xO, xL: xL, xS: xS, dL: dL || 0 });
    if (!b.sol.real) continue;
    if (!best || b.blur < best.blur) best = { xL: xL, blur: b.blur };
  }
  return best;
}
function screenRow(f, xO, xL, xS, read) {
  const rd = read || r1;
  const b = TL.bench({ f: f, xO: xO, xL: xL, xS: xS });
  const xo = rd(xO), xl = rd(xL), xs = rd(xS);
  return { p: r1(xl - xo), q: r1(xs - xl), blur: b.blur, sharp: b.blur <= SHARP, method: 'screen' };
}
const err = function (fi, f) { return Math.abs(fi - f) / Math.abs(f); };

// 預設狀態：f = 10，光源屏 5、透鏡 90、像屏 95 → 太模糊，按記錄會被拒絕；也不是 h1
{
  const b = TL.bench({ f: 10, xO: 5, xL: 90, xS: 95 });
  ok('預設：像屏上很模糊（不能記錄、不觸發任務 1–3）', b.blur > 0.25, 'blur = ' + b.blur.toFixed(2) + ' cm');
  ok('預設：p 遠離 f（不觸發 h1）', Math.abs(b.pTrue - 10) > 0.1, 'p = ' + b.pTrue);
}

// 任務 1：照課本——光源屏 5、像屏 95，透鏡由像屏移向光源屏到第一個清楚的位置
{
  const bl = bestLens(10, 5, 95, 70, 92);
  const row = screenRow(10, 5, bl.xL, 95);
  ok('1 第一個清楚的像', row.sharp, 'xL = ' + bl.xL + ', p = ' + row.p + ', q = ' + row.q + ', blur = ' + row.blur.toFixed(3));
}
// 任務 2：f = 10，p = 20，像屏 q = 20
{
  const row = screenRow(10, 5, 25, 45);
  const m = Math.abs(row.q / row.p);
  ok('2 一樣大', row.sharp && m >= 0.98 && m <= 1.02, '|m| = ' + m);
}
// 任務 3：f = 10，p = 13 → q ≈ 43.3
{
  const bs = bestScreen(10, 5, 18);
  const row = screenRow(10, 5, 18, bs.xS);
  const m = Math.abs(row.q / row.p);
  ok('3 投影機', row.sharp && m >= 3, 'xS = ' + bs.xS + ', |m| = ' + m.toFixed(2) + ', blur = ' + row.blur.toFixed(3));
}

// ---------- 視差法：參考物放在最接近像的格子上 ----------
function parallaxRow(f, xO, xL) {
  const b = TL.bench({ f: f, xO: xO, xL: xL, xR: 50 });
  const xR = r1(b.xI);
  const lo = 1.5, hi = Math.min(98.5, b.xE - 3);
  return { p: r1(xL - xO), q: r1(xR - xL), xR: xR, inRange: xR >= lo && xR <= hi, method: 'parallax', xI: b.xI };
}
{
  const r = parallaxRow(-10, 20, 50);
  const fi = TL.focalFrom(r.p, r.q);
  ok('4 凹透鏡的虛像（≤ 3 %）', r.inRange && r.q < 0 && err(fi, -10) <= 0.03, 'p = ' + r.p + ', 像在 ' + r.xI.toFixed(2) + ', q = ' + r.q + ', f = ' + fi.toFixed(3));
}
{
  const r = parallaxRow(10, 44, 50);   // p = 6 < f
  const fi = TL.focalFrom(r.p, r.q);
  ok('8 放大鏡的虛像（≤ 3 %）', r.inRange && r.q < 0 && err(fi, 10) <= 0.03, 'p = ' + r.p + ', q = ' + r.q + ', f = ' + fi.toFixed(3));
}
{
  const r = parallaxRow(10, 10, 40);   // p = 30 → 實像 q = 15
  const fi = TL.focalFrom(r.p, r.q);
  ok('h3 視差法找實像（≤ 1 %）', r.inRange && r.q > 0 && err(fi, 10) <= 0.01, 'p = ' + r.p + ', q = ' + r.q + ', f = ' + fi.toFixed(3));
}
// 視差法的數字提示：參考物對準像時沒有視差，偏 1 mm 就有
{
  const b = TL.bench({ f: -10, xO: 20, xL: 50, xR: 50 });
  const s0 = TL.parallaxSense(b.xE, b.xI, r1(b.xI), 0.05), s1 = TL.parallaxSense(b.xE, b.xI, r1(b.xI) - 0.3, 0.05);
  ok('視差提示：對準時 none、偏離時有方向', s0 === 'none' && s1 !== 'none', s0 + ' / ' + s1);
}

// 任務 5：f = 10 像屏法 5 筆，p = 15、20、25、30、40
{
  const rows = [15, 20, 25, 30, 40].map(function (p) { const bs = bestScreen(10, 5, 5 + p); return screenRow(10, 5, 5 + p, bs.xS); });
  const a = TL.analyze(rows, 10);
  const span = Math.max.apply(null, rows.map(function (r) { return r.p; })) - Math.min.apply(null, rows.map(function (r) { return r.p; }));
  ok('5 完整的數據表（5 筆、範圍 ≥ 10 cm、截距 ≤ 3 %）', rows.length >= 5 && span >= 10 && Math.abs(a.errFit) <= 0.03, 'q = ' + rows.map(function (r) { return r.q; }).join(', ') + '；f_fit = ' + a.fFit.toFixed(3) + '，誤差 ' + (100 * a.errFit).toFixed(2) + ' %');
  // 課本的做法（D = 90、每次移 5 cm）點擠在一起，截距較不準——提醒學生拉開 p 的範圍
  const tb = [];
  let xL = bestLens(10, 5, 95, 70, 92).xL;
  for (let k = 0; k < 5; k++) { const bs = bestScreen(10, 5, xL); tb.push(screenRow(10, 5, xL, bs.xS)); xL = r1(xL - 5); }
  const at = TL.analyze(tb, 10);
  console.log('     （參考）課本步驟 p = ' + tb.map(function (r) { return r.p; }).join(', ') + '：截距求 f 誤差 ' + (100 * at.errFit).toFixed(2) + ' %，各列平均 ' + (100 * at.errMean).toFixed(2) + ' %');
}

// ---------- 插針法：A、B 放在「從 P 經透鏡到眼睛」的視線上最接近的格點（理想模式有錯開幾 mm 的提示） ----------
function pinRow(f, p, E, rangeA, rangeB, sa) {
  const cr = TL.pinCrossing(f, p, E, 2.6, 2.6, 2.6, sa || 0);
  const Ls = cr.L[0];
  const sAt = function (x) { return Ls + (E[1] - Ls) * x / E[0]; };
  const pick = function (rg) {
    let best = null;
    for (let x = rg[0]; x <= rg[1] + 1e-9; x = r1(x + 0.1)) {
      const s = sAt(x), sr = r1(s);
      if (!best || Math.abs(sr - s) < best.e) best = { pt: [x, sr], e: Math.abs(sr - s) };
    }
    return best.pt;
  };
  const A = pick(rangeA), B = pick(rangeB);
  const xi = TL.lineAxis(A, B);
  return { p: p, q: r1(xi), A: A, B: B, method: 'pin', ok: cr.ok && Math.abs(Ls) < TL.LENS_R };
}
{
  const r = pinRow(-10, 20, [24, -9], [3, 8], [14, 20]);
  const fi = TL.focalFrom(r.p, r.q);
  ok('6 插針高手（凹透鏡，≤ 2 %）', r.ok && err(fi, -10) <= 0.02, 'A ' + r.A + '，B ' + r.B + '，q = ' + r.q + '，f = ' + fi.toFixed(3));
  const r2 = pinRow(10, 30, [30, -2], [3, 8], [20, 28]);
  const f2 = TL.focalFrom(r2.p, r2.q);
  ok('6 插針（凸透鏡實像，≤ 2 %）', r2.ok && err(f2, 10) <= 0.02, 'A ' + r2.A + '，B ' + r2.B + '，q = ' + r2.q + '，f = ' + f2.toFixed(3));
  // 預設的針位置（A (6, −1.2)、B (13, −2.4)）沒有對準：連線交主軸於 x = −1，離真正的像很遠
  ok('6 預設的針沒有對準（不會碰巧達成）', Math.abs(TL.lineAxis([6, -1.2], [13, -2.4]) - 20) > 5, 'x = ' + TL.lineAxis([6, -1.2], [13, -2.4]).toFixed(2));
  // 含誤差（球面像差）時，鏡中看到的像偏離理想位置；視線越靠近主軸越準
  [[24, -9], [24, -4]].forEach(function (E) {
    const sa = TL.saCoef(-10);
    const r3 = pinRow(-10, 20, E, [3, 8], [14, 20], sa);
    const f3 = TL.focalFrom(r3.p, r3.q);
    console.log('     （參考）含像差、凹透鏡、觀測點 (' + E + ')：q = ' + r3.q + '，f = ' + f3.toFixed(3) + '，誤差 ' + (100 * err(f3, -10)).toFixed(2) + ' %');
  });
}

// 任務 7：f = 10，光源屏 5、像屏 65（D = 60），兩個共軛位置都清楚、相距 ≥ 5 cm
{
  let found = null;
  for (let xS = 50; xS <= 98.5 && !found; xS = r1(xS + 0.1)) {
    const D = xS - 5, d = Math.sqrt(D * D - 40 * D);
    const p1 = (D - d) / 2, p2 = (D + d) / 2;
    const a = bestLens(10, 5, xS, 5 + p1 - 1, 5 + p1 + 1), b = bestLens(10, 5, xS, 5 + p2 - 1, 5 + p2 + 1);
    if (a && b && a.blur <= SHARP && b.blur <= SHARP) {
      const rows = [screenRow(10, 5, a.xL, xS), screenRow(10, 5, b.xL, xS)];
      const c = TL.findConjugate(rows, 0.1001, 5);
      if (c && c.d >= 5) found = { xS: xS, a: a, b: b, c: c };
    }
  }
  ok('7 共軛位置', !!found, found ? '像屏 ' + found.xS + '，透鏡 ' + found.a.xL + ' 與 ' + found.b.xL + '，d = ' + found.c.d.toFixed(1) + '，f = ' + found.c.f.toFixed(3) : '');
}

// 任務 9、10：所有可能的神秘焦距（11.0–19.0，每 0.1）都做得到
{
  let worst9 = 0, worst10 = 0, fail9 = [], fail10 = [];
  for (let k = 110; k <= 190; k++) {
    const f = k / 10;
    const rows = [1.5, 2, 2.5, 3].map(function (u) { const xL = r1(5 + u * f); const bs = bestScreen(f, 5, xL); return screenRow(f, 5, xL, bs.xS); });
    const a = TL.analyze(rows, f);
    worst9 = Math.max(worst9, Math.abs(a.errFit));
    if (!(Math.abs(a.errFit) <= 0.02)) fail9.push(f);
    const rows2 = [30, 40, 50, 60].map(function (p) { return parallaxRow(-f, 5, 5 + p); });
    const a2 = TL.analyze(rows2, -f);
    worst10 = Math.max(worst10, Math.abs(a2.errMean));
    if (!(Math.abs(a2.errMean) <= 0.02) || rows2.some(function (r) { return !r.inRange; })) fail10.push(f);
  }
  ok('9 神秘凸透鏡（f = 11–19，像屏法 p ≈ 1.5f、2f、2.5f、3f，截距）', !fail9.length, '最差誤差 ' + (100 * worst9).toFixed(2) + ' %' + (fail9.length ? ' 失敗 ' + fail9.join(',') : ''));
  ok('10 神秘凹透鏡（f = −11 到 −19，視差法 p = 30、40、50、60，各列平均）', !fail10.length, '最差誤差 ' + (100 * worst10).toFixed(2) + ' %' + (fail10.length ? ' 失敗 ' + fail10.join(',') : ''));
}

// 任務 11：含誤差（透鏡偏差 0.2–0.5 cm、讀數 ±0.6 mm）下，共軛法 ≤ 0.5 %
{
  const rand = TL.rng(20261111);
  let tries = 0, wins = 0, rejected = 0;
  for (let t = 0; t < 4000; t++) {
    const f = [10, 15, 20][t % 3];
    const dL = TL.lensOffset(rand);
    const xO = 5, xS = 95, D = 90;
    const d = Math.sqrt(D * D - 4 * D * f);
    const p1 = (D - d) / 2 - dL, p2 = (D + d) / 2 - dL;        // 標線位置（透鏡實際在標線 + dL）
    const a = bestLens(f, xO, xS, xO + p1 - 1, xO + p1 + 1, dL), b = bestLens(f, xO, xS, xO + p2 - 1, xO + p2 + 1, dL);
    if (!a || !b || a.blur > 0.25 || b.blur > 0.25) { rejected++; continue; }
    const rd = function (x) { return TL.readScale(x, rand); };
    const rows = [a.xL, b.xL].map(function (xL) { const xo = rd(xO), xl = rd(xL), xs = rd(xS); return { p: r1(xl - xo), q: r1(xs - xl) }; });
    const c = TL.findConjugate(rows, 0.15, 2);
    tries++;
    if (c && err(c.f, f) <= 0.005) wins++;
  }
  ok('11 含誤差的共軛法（每次嘗試的成功率）', wins / tries > 0.3, (100 * wins / tries).toFixed(1) + ' %（' + wins + '/' + tries + '，被拒 ' + rejected + '）');
  // 對照：同樣的誤差下，單用 1/p + 1/q 求 f（受透鏡偏差影響）
  const rand2 = TL.rng(7);
  let bad = 0, n = 0;
  for (let t = 0; t < 600; t++) {
    const f = 10, dL = TL.lensOffset(rand2);
    const xL = 30 - dL;
    const bs = bestScreen(f, 5, r1(xL), dL);
    const row = { p: r1(TL.readScale(r1(xL), rand2) - TL.readScale(5, rand2)), q: r1(TL.readScale(bs.xS, rand2) - TL.readScale(r1(xL), rand2)) };
    n++; if (err(TL.focalFrom(row.p, row.q), f) > 0.005) bad++;
  }
  console.log('     （參考）同樣的誤差下單筆 pq/(p+q) 誤差 > 0.5 % 的比例：' + (100 * bad / n).toFixed(0) + ' %');
}

// h1：凸透鏡、像屏法，物距恰在焦點（±0.1 cm）
{
  const b = TL.bench({ f: 10, xO: 5, xL: 15, xS: 40 });
  ok('h1 物在焦點', Math.abs(b.pTrue - 10) <= 0.1 && b.sol.atInfinity, 'p = ' + b.pTrue + '，q = ' + b.q);
  let worst = 0;
  for (let k = 110; k <= 190; k++) { const f = k / 10; worst = Math.max(worst, Math.abs(r1(5 + f) - 5 - f)); }
  ok('h1 神秘凸透鏡也做得到（格點到焦點的距離 ≤ 0.1）', worst <= 0.1 + 1e-9, '最差 ' + worst.toFixed(3));
}
// h2（11/12 收緊）：同一個凸透鏡（f = 10）、同一個物距（±0.5 cm），三種方法各一筆 ≤ 2 %
{
  // 照頁面 js/thin-lens.js 的 methodsSameP 計算
  const sameP = function (rows, f) {
    const good = rows.filter(function (r) { return err(TL.focalFrom(r.p, r.q), f) <= 0.02; });
    return good.some(function (a) {
      return ['screen', 'parallax', 'pin'].every(function (m) { return good.some(function (r) { return r.method === m && Math.abs(r.p - a.p) <= 0.5 + 1e-9; }); });
    });
  };
  let defs = [];
  const LM = { register: function (id, list) { defs = list; } };
  global.window = { LabMission: LM }; global.LabMission = LM;
  require(__ROOT + 'js/missions/thin-lens.js');
  const h2 = defs.find(function (m) { return m.id === 'thin-lens-h2'; });
  const fire = function (rows) { return h2.check({ type: 'record', data: { method: rows[rows.length - 1].method, methodsSameP: sameP(rows, 10) } }, {}); };

  const s = screenRow(10, 5, 35, 50), p = parallaxRow(10, 10, 40), n = pinRow(10, 30, [30, -2], [3, 8], [20, 28]);
  const e = [s, p, n].map(function (r) { return err(TL.focalFrom(r.p, r.q), 10); });
  ok('h2 物距都是 30 cm，三種方法都 ≤ 2 %', s.sharp && s.p === 30 && p.p === 30 && n.p === 30 && e.every(function (x) { return x <= 0.02; }), e.map(function (x) { return (100 * x).toFixed(2) + ' %'; }).join(' / '));
  ok('h2 任務判定：同一物距三種方法 → 完成', fire([s, p, n]) === true);
  // 一般任務 1（像屏、p = 20）、6（插針、p = 30）、8（放大鏡視差、p = 6）各做一次：三種方法都量準過，但物距不同 → 不完成
  const s1 = screenRow(10, 5, 25, 45), p8 = parallaxRow(10, 44, 50);
  const p8ok = err(TL.focalFrom(p8.p, p8.q), 10) <= 0.02;
  ok('h2 做完任務 1、6、8（物距 20、30、6 cm）不會順手完成', fire([s1, n, p8]) === false, '放大鏡那筆 ' + (p8ok ? '也在 2 % 內' : '不在 2 % 內'));
}

console.log(fails ? '\n有 ' + fails + ' 項沒有通過' : '\n全部通過');
process.exitCode = fails ? 1 : 0;
