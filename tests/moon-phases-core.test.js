// 以 Node 執行：node tests/moon-phases-core.test.js
'use strict';
const assert = require('assert');
const K = require('../js/moon-phases-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function close(a, b, tol, msg) {
  assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b}，得到 ${a}（容許 ${tol}）`);
}
const D = K.DEG, TAU = K.TAU;
/** 圓軌道、無退行、無進動的月球（解析解好算） */
function simple(o) { return K.makeElements(Object.assign({ e: 0, regress: false, precess: false }, o || {})); }

console.log('moon-phases-core');

test('朔望月 = 1/(1/恆星月 − 1/恆星年) ≈ 29.530 589 日；交點月、近點月也由平均運動推得', () => {
  close(K.P_SYN, 1 / (1 / K.P_SID - 1 / K.Y_SID), 1e-12, '公式');
  close(K.P_SYN, K.P_SYN_REF, 2e-5, '與觀測的朔望月');
  close(1 / (1 / K.P_SID + 1 / K.P_NODE), K.P_DRA_REF, 2e-5, '交點月');
  close(1 / (1 / K.P_SID - 1 / K.P_APS), K.P_ANO_REF, 2e-5, '近點月');
  close(K.P_NODE / 365.25, 18.6, 0.01, '交點退行 18.6 年');
  close(K.P_SYN - K.P_SID, 2.209, 0.001, '朔望月比恆星月長約 2.2 日');
});

test('圓軌道（傾角 0）：兩次朔的間隔正好是朔望月；回到同一黃經的間隔正好是恆星月', () => {
  let el = simple({ inc: 0 });
  el = K.placeElongation(el, 10, 0.3);
  const t1 = K.findPhase(el, 10, 0, 1), t2 = K.findPhase(el, t1, 0, 1), t3 = K.findPhase(el, t2, 0, 1);
  close(t2 - t1, K.P_SYN, 1e-7, '朔到朔');
  close(t3 - t2, K.P_SYN, 1e-7, '再下一次');
  const lon0 = K.moonAt(el, 10).lon, lon1 = K.moonAt(el, 10 + K.P_SID).lon;
  close(K.wrapPi(lon1 - lon0), 0, 1e-10, '恆星月後黃經相同');
  // 恆星月後太陽走了 360°·P_SID / Y_SID，月相落後同樣的角度，要再走 2.2 日才回到同一月相
  const p0 = K.phaseAt(el, 10).dLam, p1 = K.phaseAt(el, 10 + K.P_SID).dLam;
  close(K.wrapPi(p0 - p1), TAU * K.P_SID / K.Y_SID, 1e-9, '距角落後');
  close(K.wrapPi(K.phaseAt(el, 10 + K.P_SYN).dLam - p0), 0, 1e-9, '朔望月後月相相同');
});

test('橢圓軌道（克卜勒第二定律）：單次朔望月有長有短，長期平均仍是 29.5306 日', () => {
  let el = K.makeElements({ N0: 1, W0: 2 });
  el = K.placeElongation(el, 0, 0.5);
  let t = K.findPhase(el, 0, 0, 1);
  const t0 = t, list = [];
  for (let i = 0; i < 223; i++) { const tn = K.findPhase(el, t, 0, 1); list.push(tn - t); t = tn; }
  const avg = (t - t0) / 223;
  close(avg, K.P_SYN, 0.002, '平均朔望月');
  assert.ok(Math.max.apply(null, list) - Math.min.apply(null, list) > 0.3, '單次長度應有變化（近地點附近走得快）');
  assert.ok(Math.min.apply(null, list) > 29.1 && Math.max.apply(null, list) < 30.0, '範圍合理');
});

test('回到同一恆星方向的時刻（findMoonLon）：交點與近地點不動時正好一個恆星月；月齡在朔時為 0', () => {
  let el = K.makeElements({ N0: 0.7, W0: 2.0, precess: false, regress: false });
  el = K.placeElongation(el, 40, 1.1);
  const lon0 = K.moonAt(el, 40).lon;
  close(K.findMoonLon(el, 40, lon0, 20) - 40, K.P_SID, 1e-7, '恆星月');
  const tn = K.findPhase(el, 40, 0, 1);
  close(K.moonAge(el, tn), 0, 1e-6, '朔的月齡');
  close(K.moonAge(el, tn + 3.25), 3.25, 1e-6, '朔後 3.25 日');
});

test('交點月與近點月：開啟退行／進動後的週期', () => {
  // 圓軌道＋交點退行：緯度引數 u 回到原值的時間 = 交點月
  let el = K.makeElements({ e: 0, regress: true, precess: false, N0: 0.4 });
  const u0 = K.moonAt(el, 3).u, u1 = K.moonAt(el, 3 + 1 / (1 / K.P_SID + 1 / K.P_NODE)).u;
  close(K.wrapPi(u1 - u0), 0, 1e-10, '交點月');
  // 橢圓＋近地點進動：平近點角 M 回到原值的時間 = 近點月
  el = K.makeElements({ regress: false, precess: true, W0: 1 });
  const M0 = K.moonAt(el, 5).M, M1 = K.moonAt(el, 5 + 1 / (1 / K.P_SID - 1 / K.P_APS)).M;
  close(K.wrapPi(M1 - M0), 0, 1e-10, '近點月');
});

test('克卜勒方程式與反求：放回月球位置後黃經一致；近地點／遠地點距離 = a(1 ∓ e)', () => {
  for (const e of [0, 0.0549, 0.3, 0.9]) {
    for (const M of [-3, -1, 0, 0.2, 1.5, 3.1]) {
      const E = K.keplerE(M, e);
      close(E - e * Math.sin(E), K.wrapPi(M), 1e-13, 'E − e sinE = M（e = ' + e + '）');
      close(K.wrapPi(K.meanFromTrue(K.trueFromMean(M, e), e) - M), 0, 1e-12, '往返');
    }
  }
  let el = K.makeElements({ N0: 2.2, W0: 4.1 });
  for (const t of [0, 13.7, 400.25]) for (const lon of [0.1, 1.7, 3.3, 5.9]) {
    const e2 = K.placeMoonLon(el, t, lon);
    close(K.wrapPi(K.moonAt(e2, t).lon - lon), 0, 1e-12, '放回黃經');
  }
  el = K.makeElements({ regress: false, precess: false, W0: 1, inc: 0 });
  el = K.placeMoonLon(el, 0, 1);       // 月球在近地點方向（傾角 0：軌道面上的角度就是黃經）
  close(K.moonAt(el, 0).r, K.A_MOON * (1 - K.E_MOON), 1e-6, '近地點距離');
  el = K.placeMoonLon(el, 0, 1 + Math.PI);
  close(K.moonAt(el, 0).r, K.A_MOON * (1 + K.E_MOON), 1e-6, '遠地點距離');
});

test('月球軌道傾斜 5.145°：黃緯最大 5.145°，在交點上黃緯為 0；改交點方向時月球黃經不變', () => {
  let el = simple({ N0: 0.8 });
  let maxLat = 0;
  for (let t = 0; t < K.P_SID; t += 0.05) maxLat = Math.max(maxLat, Math.abs(K.moonAt(el, t).lat));
  close(maxLat / D, 5.145, 0.002, '最大黃緯');
  el = K.placeMoonLon(el, 0, 0.8);
  close(K.moonAt(el, 0).lat, 0, 1e-12, '升交點上');
  const lon = K.moonAt(el, 7).lon;
  const e2 = K.withNode(el, 7, 2.5), e3 = K.withPerigee(K.makeElements({ W0: 1 }), 7, 4);
  close(K.wrapPi(K.moonAt(e2, 7).lon - lon), 0, 1e-12, 'withNode');
  close(K.nodeLon(e2, 7), 2.5, 1e-12, '新的交點');
  close(K.periLon(e3, 7), 4, 1e-12, '新的近地點');
  const e4 = K.withFlags(K.makeElements({ N0: 1, W0: 2, L0: 3 }), 50, false, false);
  const e5 = K.makeElements({ N0: 1, W0: 2, L0: 3 });
  close(K.wrapPi(K.moonAt(e4, 50).lon - K.moonAt(e5, 50).lon), 0, 1e-12, 'withFlags 保持位置');
  close(K.wrapPi(K.nodeLon(e4, 50) - K.nodeLon(e5, 50)), 0, 1e-12, 'withFlags 保持交點');
});

test('月相：被照亮比例 (1 + cos 相角)/2 ≈ (1 − cos 距角)/2；朔 0、望 1、弦約一半', () => {
  let el = simple({ inc: 0 });
  const t = 30;
  const at = function (deg) { return K.phaseAt(K.placeElongation(el, t, deg * D), t); };
  close(at(0).illum, 0, 1e-12, '朔（日月地成一直線）');
  close(at(180).illum, 1, 1e-12, '望');
  for (const deg of [10, 45, 90, 135, 200, 270, 330]) {
    const p = at(deg);
    close(p.illum, p.illumApprox, 0.0015, '精確與近似 ' + deg + '°');
    close(p.psi / D, Math.min(deg, 360 - deg), 1e-9, '距角');
  }
  // 上弦時（距角 90°）相角比 90° 小約 arcsin(r/D) = 0.147°，所以照亮比例略多於一半
  const q = at(90);
  close(q.phaseAngle / D, 90 - Math.asin(K.A_MOON / K.AU) / D, 1e-6, '上弦的相角');
  assert.ok(q.illum > 0.5 && q.illum < 0.5015, '略多於一半');
  // 太陽在無窮遠的極限：精確式 → 近似式
  const p45 = at(45);
  const dms = K.len(K.sub(p45.sun, p45.moon));
  close(p45.phaseAngle, Math.PI - p45.psi - Math.asin(K.A_MOON * Math.sin(p45.psi) / dms), 1e-12, '相角 = 180° − 距角 − 太陽處的夾角（正弦定律）');
  assert.deepStrictEqual([0, 30, 90, 150, 180, 220, 270, 300].map(d => K.phaseKey(d * D)), ['new', 'waxC', 'fq', 'waxG', 'full', 'wanG', 'lq', 'wanC']);
});

test('影錐幾何：地球本影長約 138 萬 km；在月球距離處本影半徑約 4600 km、半影約 8180 km', () => {
  const c = K.cone(K.R_SUN, K.R_EARTH, K.AU, K.A_MOON);
  close(c.Lu, K.AU * K.R_EARTH / (K.R_SUN - K.R_EARTH), 1e-6, '相似三角形');
  close(c.Lu / 1e6, 1.382, 0.001, '本影長');
  close(c.ru, 4599, 1, '本影半徑');
  close(c.rp, 8176, 1, '半影半徑');
  close(c.ru / K.R_MOON, 2.65, 0.01, '約 2.6 個月球半徑');
  // 極限：光源與遮擋天體一樣大 → 本影是圓柱；光源是一個點 → 本影與半影重合
  close(K.cone(K.R_EARTH, K.R_EARTH, K.AU, 5e5).ru, K.R_EARTH, 1e-9, '圓柱');
  close(K.cone(K.R_EARTH * (1 + 1e-9), K.R_EARTH, K.AU, 5e5).ru, K.R_EARTH, 1e-3, '接近圓柱');
  const pt = K.cone(1e-9, K.R_EARTH, K.AU, 5e5);
  close(pt.ru, pt.rp, 1e-3, '點光源');
  close(pt.rp, K.R_EARTH * (K.AU + 5e5) / K.AU, 1e-3, '點光源的影子 ∝ 距離');
  // 月球的本影長約 37 萬 km：與月地距離相近，所以有時是全食、有時是環食
  const cm = K.cone(K.R_SUN, K.R_MOON, K.AU - K.A_MOON, 0);
  close(cm.Lu / 1e3, 373.4, 0.2, '月球本影長（千 km）');
});

test('本影邊界上看不到太陽、半影外緣看到整個太陽（重疊面積的幾何）', () => {
  const s = K.sunAt(0);
  const a = K.unit(K.mul(s, -1));
  const perp = K.v3(-a.y, a.x, 0);
  const x = K.A_MOON, c = K.cone(K.R_SUN, K.R_EARTH, K.AU, x);
  const at = function (rho) { return K.sunVisibleFrom(K.add(K.mul(a, x), K.mul(perp, rho)), s, K.v3(0, 0, 0), K.R_EARTH); };
  close(at(0), 0, 1e-12, '軸上');
  close(at(c.ru * 0.999), 0, 1e-9, '本影內');
  close(at(c.rp * 1.001), 1, 1e-12, '半影外');
  let prev = -1;
  for (let k = 0; k <= 20; k++) { const v = at(c.ru + (c.rp - c.ru) * k / 20); assert.ok(v >= prev - 1e-12, '由本影到半影外緣單調變亮'); prev = v; }
  close(at(c.ru * 1.0005), 0, 2e-3, '本影邊緣附近幾乎全暗');
  close(K.overlapArea(1, 2, 0.5), Math.PI, 1e-12, '小圓整個在大圓內');
  close(K.overlapArea(1, 1, 0), Math.PI, 1e-12, '相同');
  close(K.overlapArea(1, 1, 2), 0, 1e-12, '外切');
  close(K.overlapArea(1, 1, 1), 2 * Math.PI / 3 - Math.sqrt(3) / 2, 1e-12, '兩個單位圓、距離 1');
});

test('月食只在「望＋月球靠近交點」時發生；交點線垂直日地連線時，滿月不會有月食', () => {
  const t = 100;
  const sl = K.sunLon(t);
  // 交點線指向太陽，滿月在降交點上 → 中心月全食
  let el = K.makeElements({ e: 0, regress: false, precess: false, N0: sl });
  el = K.placeElongation(el, t, Math.PI);
  let ec = K.eclipsesAt(el, t);
  assert.strictEqual(ec.lunar.type, 'total');
  assert.ok(ec.lunar.magU > 1.5, '本影食分 > 1.5，實際 ' + ec.lunar.magU);
  assert.strictEqual(ec.solar.type, 'none', '滿月沒有日食');
  // 交點線轉 90°：滿月時月球在最高處，離地影 5.1°
  el = K.withNode(el, t, sl + Math.PI / 2);
  ec = K.eclipsesAt(el, t);
  assert.strictEqual(ec.lunar.type, 'none');
  close(Math.abs(ec.moon.lat) / D, 5.145, 0.002, '黃緯');
  // 掃描交點方向：半影食的界限 sin(離交點角)·sin i ≈ (半影半徑 + 月球半徑)/月地距離 → 約 16.7°；
  // 本影食的界限 ≈ 10.6°；離交點 4° 以內一定是本影食
  for (let k = 0; k < 360; k += 1) {
    const e2 = K.placeElongation(K.withNode(el, t, sl + k * D), t, Math.PI);
    const m = K.moonAt(e2, t), dn = Math.min(Math.abs(K.wrapPi(m.u)), Math.abs(K.wrapPi(m.u - Math.PI))) / D;
    const L = K.lunarEclipse(m, K.sunAt(t));
    if (L.type !== 'none') assert.ok(dn < 16.8, '離交點 ' + dn.toFixed(1) + '° 卻有月食');
    if (L.type === 'total' || L.type === 'partial') assert.ok(dn < 10.7, '離交點 ' + dn.toFixed(1) + '° 卻有本影食');
    if (dn > 17) assert.strictEqual(L.type, 'none');
    if (dn < 4) assert.ok(L.type === 'total' || L.type === 'partial', '離交點 ' + dn.toFixed(1) + '° 應有本影食');
  }
});

test('月食分類：全食、偏食、半影食的邊界照本影與半影錐', () => {
  const t = 0, s = K.sunAt(t), a = K.unit(K.mul(s, -1)), up = K.v3(0, 0, 1);
  const x = K.A_MOON, c = K.cone(K.R_SUN, K.R_EARTH, K.AU, x);
  const moonAt = function (d) { return K.add(K.mul(a, x), K.mul(up, d)); };
  assert.strictEqual(K.lunarEclipse(moonAt(c.ru - K.R_MOON - 1), s).type, 'total');
  assert.strictEqual(K.lunarEclipse(moonAt(c.ru - K.R_MOON + 1), s).type, 'partial');
  assert.strictEqual(K.lunarEclipse(moonAt(c.ru + K.R_MOON - 1), s).type, 'partial');
  assert.strictEqual(K.lunarEclipse(moonAt(c.ru + K.R_MOON + 1), s).type, 'penumbral');
  assert.strictEqual(K.lunarEclipse(moonAt(c.rp + K.R_MOON - 1), s).type, 'penumbral');
  assert.strictEqual(K.lunarEclipse(moonAt(c.rp + K.R_MOON + 1), s).type, 'none');
  assert.strictEqual(K.lunarEclipse(K.mul(a, -x), s).type, 'none', '月球在太陽那一側');
  close(K.lunarEclipse(moonAt(c.ru - K.R_MOON), s).magU, 1, 1e-9, '剛好全食時本影食分 = 1');
});

test('日全食與日環食的分界：月影尖端剛好碰到地表；那裡看到的月球與太陽視直徑相等', () => {
  const t = 50, sl = K.sunLon(t);
  const make = function (a) {
    let el = K.makeElements({ e: 0, a: a, regress: false, precess: false, N0: sl });
    return K.placeElongation(el, t, 0);                     // 新月在升交點上（中心食，γ = 0）
  };
  const typeAt = function (a) { return K.eclipsesAt(make(a), t).solar; };
  const peri = K.A_MOON * (1 - K.E_MOON), apo = K.A_MOON * (1 + K.E_MOON);
  assert.strictEqual(typeAt(peri).type, 'total', '近地點附近：日全食');
  assert.strictEqual(typeAt(apo).type, 'annular', '遠地點附近：日環食');
  assert.ok(typeAt(peri).central && typeAt(peri).gamma < 1e-6, '中心食');
  // 二分法找分界
  let lo = peri, hi = apo;
  for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (typeAt(mid).type === 'total') lo = mid; else hi = mid; }
  const crit = (lo + hi) / 2;
  const cm = K.cone(K.R_SUN, K.R_MOON, K.AU - crit, 0);
  close(crit, cm.Lu + K.R_EARTH, 1e-3, '分界距離 = 月影長 + 地球半徑');
  close(crit, 379780, 30, '約 37.98 萬 km');
  // 在影軸與地表的交點看：月球與太陽的視半徑相等
  const el = make(crit), m = K.moonAt(el, t), s = K.sunAt(t);
  const se = K.solarEclipse(m, s);
  const loc = K.localSolar(m, s, se.hit);
  close(loc.rm, loc.rs, 1e-9, '視半徑相等');
  close(loc.sep, 0, 1e-9, '中心重合');
  // 地心看月球的視直徑與太陽相等的距離（37.3 萬 km）比分界近：地表的人比地心更靠近月球 6371 km
  close(K.R_MOON * K.AU / K.R_SUN, 373436, 1, '地心看的分界');
  assert.ok(crit - K.R_MOON * K.AU / K.R_SUN > 6000, '地表的分界比地心遠約一個地球半徑');
});

test('日食分類：全食時地表那點看到全食、環食時看到環食；離交點太遠就沒有日食', () => {
  const t = 200, sl = K.sunLon(t);
  for (const a of [363300, 371000, 383000, 405500]) {
    let el = K.makeElements({ e: 0, a: a, regress: false, precess: false, N0: sl + 0.5 * D });
    el = K.placeElongation(el, t, 0);
    const m = K.moonAt(el, t), s = K.sunAt(t), se = K.solarEclipse(m, s);
    assert.ok(se.central, '中心食');
    const loc = K.localSolar(m, s, se.hit);
    assert.strictEqual(loc.type, se.type, '距離 ' + a + ' km：地表交點看到的類型');
  }
  let el = K.makeElements({ e: 0, regress: false, precess: false, N0: sl + 90 * D });
  el = K.placeElongation(el, t, 0);
  assert.strictEqual(K.eclipsesAt(el, t).solar.type, 'none', '交點垂直：新月時月球在太陽上方 5°');
  // 偏食：γ 介於 1 與 1 + 半影半徑/地球半徑
  el = K.makeElements({ e: 0, regress: false, precess: false, N0: sl + 14 * D });
  el = K.placeElongation(el, t, 0);
  const so = K.eclipsesAt(el, t).solar;
  assert.ok(so.type === 'partial' && so.gamma > 1, '離交點 14° 是偏食，γ = ' + so.gamma.toFixed(3));
});

test('不是每個月都有日月食：交點固定時，一年只有兩個「食季」，相隔約 173 日', () => {
  let el = K.makeElements({ N0: 1.3, W0: 0.4, regress: false, precess: true });
  el = K.placeElongation(el, 0, 0.2);
  let t = 0, eclMonths = 0, months = 0;
  const seasons = [];
  for (let i = 0; i < 2 * 12.37 * 3; i++) {
    const kind = i % 2 ? 'lunar' : 'solar';
    t = K.findPhase(el, t, i % 2 ? Math.PI : 0, 1);
    const g = K.greatestEclipse(el, t, kind);
    months++;
    if (g.res.type !== 'none') { eclMonths++; seasons.push(t); }
  }
  assert.ok(eclMonths > 0 && eclMonths < months / 3, '有食的朔、望只占少數：' + eclMonths + '／' + months);
  // 交點不動時，太陽回到同一交點的週期 = 恆星年；兩個交點相隔半年
  // 有退行時：食年 = 1/(1/恆星年 + 1/交點退行週期) ≈ 346.62 日
  close(1 / (1 / K.Y_SID + 1 / K.P_NODE), 346.62, 0.01, '食年');
  // 食季之間的間隔接近半年
  const gaps = [];
  for (let i = 1; i < seasons.length; i++) if (seasons[i] - seasons[i - 1] > 60) gaps.push(seasons[i] - seasons[i - 1]);
  gaps.forEach(g => assert.ok(Math.abs(g - K.Y_SID / 2) < 40, '食季間隔 ' + g.toFixed(1) + ' 日'));
});

test('食甚搜尋：月球最接近地影軸的時刻在望附近，分類與該時刻一致', () => {
  const t = 300, sl = K.sunLon(t);
  let el = K.makeElements({ N0: sl + Math.PI + 3 * D, W0: 1 });
  el = K.placeElongation(el, t, Math.PI);
  const g = K.greatestEclipse(el, t, 'lunar');
  assert.ok(Math.abs(g.t - t) < 0.2, '食甚與望相差 ' + (g.t - t));
  const near = [g.t - 0.01, g.t + 0.01].map(tt => K.eclipsesAt(el, tt).lunar.d);
  assert.ok(near.every(d => d >= g.res.d - 1e-6), '食甚時距離最小');
  assert.notStrictEqual(g.res.type, 'none');
});

test('台灣的天空：春秋分晝長約 12 小時 7 分；夏至晝長與解析式相符', () => {
  const el = simple();
  const dayLen = function (doy) {
    const t0 = K.timeOf(0, doy, 0);
    const r = K.riseSet(el, t0, 'sun');
    return (r.set - r.rise) * 24;
  };
  const analytic = function (dec) {
    const h0 = -0.8333 * D, lat = K.LAT_TW;
    // 太陽的時角每太陽日轉 360°（每小時 15°）
    return 2 * Math.acos((Math.sin(h0) - Math.sin(lat) * Math.sin(dec)) / (Math.cos(lat) * Math.cos(dec))) / D / 15;
  };
  // 春分（3/20）與夏至（太陽黃經 90°，約 6/21）
  const eq = K.doyOf(3, 21), so = K.doyOf(6, 21);
  close(dayLen(eq), analytic(K.declination(K.sunAt(K.timeOf(0, eq, 12)))), 0.01, '春分');
  close(dayLen(so), analytic(K.declination(K.sunAt(K.timeOf(0, so, 12)))), 0.01, '夏至');
  close(dayLen(eq), 12.12, 0.03, '春分晝長約 12 小時 7 分');
  close(dayLen(so), 13.58, 0.05, '台灣夏至晝長約 13 小時 35 分');
  // 太陽約在 12:00 前後上中天（地方平時與台灣時間差 4 分；赤經不均勻造成最多約 10 分）
  for (const doy of [0, 80, 172, 266]) {
    const tr = K.transit(el, K.timeOf(0, doy, 0), 'sun');
    close((tr % 1) * 24, 12, 0.2, '日中天 doy ' + doy);
  }
  // 夏至正午太陽高度 = 90° − |23.5° − 23.44°|（幾乎在天頂）
  const tn = K.transit(el, K.timeOf(0, so, 0), 'sun');
  close(K.sunAlt(tn).alt / D, 90 - Math.abs(23.5 - K.declination(K.sunAt(tn)) / D), 0.01, '夏至中午太陽高度');
});

test('月出月落與月相：滿月日落時東升、上弦約中午升起、新月約日出時升起；月亮每天晚約 50 分鐘上中天', () => {
  const doy = K.doyOf(3, 21), t0 = K.timeOf(0, doy, 0);
  const at = function (deg) {
    let el = K.makeElements({ e: 0, inc: 0, regress: false, precess: false });
    el = K.placeElongation(el, t0 + 0.5, deg * D);
    return el;
  };
  const sun = K.riseSet(null, t0, 'sun');
  const hourOf = x => ((x - t0) * 24 + 24) % 24;
  const full = K.riseSet(at(180), t0, 'moon'), fq = K.riseSet(at(90), t0, 'moon'), nw = K.riseSet(at(0), t0, 'moon');
  close(hourOf(full.rise), hourOf(sun.set), 1.2, '滿月東升 ≈ 日落');
  close(hourOf(fq.rise), 12, 1.2, '上弦月中午前後升起');
  close(hourOf(fq.set), 0, 1.3, '上弦月半夜前後落下');
  close(hourOf(nw.rise), hourOf(sun.rise), 1.2, '新月與太陽一起升起');
  // 連續 30 天的月球上中天時刻：平均每天晚 24 h · (P_syn/(P_syn − 1) − 1) ≈ 50.5 分
  const el = at(30);
  const tr = [];
  let tt = t0;
  for (let i = 0; i < 31; i++) { const x = K.transit(el, tt, 'moon'); tr.push(x); tt = x + 0.6; }
  const avg = (tr[30] - tr[0]) / 30 - 1;
  close(avg * 1440, 1440 * (K.P_SYN / (K.P_SYN - 1) - 1), 0.5, '平均延後（分鐘）');
  close(avg * 1440, 50.5, 0.6, '約 50 分鐘');
});

test('從台灣看月亮的亮面方向：亮面一定朝太陽；傍晚西方的眉月亮面朝下方（太陽在地平線下）', () => {
  const doy = K.doyOf(3, 25);
  let el = K.makeElements({ N0: 2, W0: 1 });
  const t = K.timeOf(0, doy, 19);
  el = K.placeElongation(el, t, 40 * D);
  const h = K.moonAlt(el, t), hs = K.sunAlt(t);
  assert.ok(hs.alt < 0 && h.alt > 0, '日落後月亮在地平線上');
  assert.ok(h.az > 225 * D && h.az < 315 * D, '在西方，方位 ' + (h.az / D).toFixed(1));
  const o = K.skyOrientation(el, t);
  assert.ok(Math.sin(o.limb) < 0, '亮面朝下（指向地平線下的太陽）');
  // 一般情形：亮面方向就是天球上由月球指向太陽的大圓方向（用很小的位移驗證）
  for (const deg of [30, 100, 160, 250, 320]) {
    const e2 = K.placeElongation(el, t, deg * D);
    const oo = K.skyOrientation(e2, t), m = K.moonAlt(e2, t), s = K.sunAlt(t);
    // 小位移：朝太陽方向走一點，高度的改變與 sin(limb) 同號
    const dAlt = s.alt - m.alt;
    if (Math.abs(dAlt) > 0.3 && Math.abs(K.wrapPi(s.az - m.az)) < 1) assert.ok(Math.sign(Math.sin(oo.limb)) === Math.sign(dAlt), deg + '°');
  }
});

test('月球最北可到赤緯 ε + i = 28.6°（交點在春分點時）；平常約 ±18.3° 到 ±28.6°', () => {
  let el = K.makeElements({ e: 0, regress: false, precess: false, N0: 0 });
  el = K.placeMoonLon(el, 0, Math.PI / 2);
  close(K.declination(K.moonAt(el, 0)) / D, 23.44 + 5.145, 1e-6, '大月停');
  el = K.withNode(el, 0, Math.PI);
  el = K.placeMoonLon(el, 0, Math.PI / 2);
  close(K.declination(K.moonAt(el, 0)) / D, 23.44 - 5.145, 1e-6, '小月停');
});

test('日曆：t 與日期互換、每年自動補 1/4 日；春分時太陽黃經 0', () => {
  for (const [y, m, d, h] of [[0, 1, 1, 0], [0, 3, 20, 18], [0, 12, 31, 23.5], [3, 7, 4, 6], [17, 2, 28, 12]]) {
    const t = K.timeOf(y, K.doyOf(m, d), h);
    const c = K.calendar(t);
    assert.deepStrictEqual([c.year, c.month, c.day], [y, m, d], [y, m, d].join('/'));
    close(c.hour, h, 1e-9, '時');
  }
  close(K.sunLon(K.T_EQ), 0, 1e-12, '春分');
  close(K.wrapPi(K.sunLon(K.T_EQ + K.Y_SID / 4) - Math.PI / 2), 0, 1e-12, '夏至');
});

console.log(`moon-phases-core：${passed} 項通過`);
