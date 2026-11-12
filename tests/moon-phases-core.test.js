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

// ---------------------------------------------------------------------------
// 觀測地點：城市清單、時區與夏令時間、當地的一天、月出月落與真實資料比對、各地看到的月亮
// ---------------------------------------------------------------------------
test('地點清單：臺灣＋18 個城市（選單共 20 項含手動輸入）；南半球至少 3 個、赤道附近至少 2 個；時區有效', () => {
  assert.strictEqual(K.PLACES.length, 19, '臺灣＋18 個城市');
  assert.strictEqual(K.PLACES[0].id, 'tw', '第一個是臺灣（選單第 2 項，預設）');
  const tw = K.placeById('tw');
  assert.ok(tw.lat === 23.5 && tw.lon === 121 && tw.utc === 8 && !tw.tz, '臺灣維持原本的北緯 23.5°、東經 121°、UTC+8');
  close(tw.lat * D, K.LAT_TW, 0, '與 LAT_TW 相同'); close(tw.lon * D, K.LON_TW, 0, '與 LON_TW 相同');
  const ids = new Set();
  K.PLACES.forEach(p => {
    assert.ok(!ids.has(p.id), '代號重複 ' + p.id); ids.add(p.id);
    assert.ok(Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180, p.id + ' 經緯度範圍');
    assert.ok(Math.abs(p.lat * 100 - Math.round(p.lat * 100)) < 1e-9 && Math.abs(p.lon * 100 - Math.round(p.lon * 100)) < 1e-9, p.id + ' 取到 0.01°');
    assert.ok(p.zh && p.en && !/[㐀-鿿]/.test(p.en), p.id + ' 中英文名稱');
    if (p.tz) {
      const o = K.zoneOffset(p.tz, Date.UTC(2026, 0, 15));
      assert.ok(o != null && o >= -12 && o <= 14, p.id + ' 的 IANA 時區 ' + p.tz + ' 要能用 Intl 換算');
      // 標準時間與經度推估的時區差不到 3.5 小時（防止把經度的正負號寫反）
      assert.ok(Math.abs(K.standardOffset(p) - p.lon / 15) < 3.5, p.id + ' 時區與經度相符');
    }
  });
  assert.ok(K.PLACES.filter(p => p.lat < 0).length >= 3, '南半球至少 3 個');
  assert.ok(K.PLACES.filter(p => Math.abs(p.lat) < 5).length >= 2, '赤道附近至少 2 個');
  assert.ok(K.PLACES.some(p => p.lat > 60), '高緯度（60° 以上）');
  assert.ok(K.PLACES.some(p => p.lon < -60) && K.PLACES.some(p => p.lon > 120) && K.PLACES.some(p => Math.abs(p.lon) < 30), '東西各經度帶');
});

test('手動輸入的地點：超出範圍夾到邊界、UTC 偏移預設 round(經度/15)、取到 0.25 時', () => {
  let m = K.manualPlace(-33.9, 18.4);
  assert.deepStrictEqual([m.id, m.lat, m.lon, m.utc], ['man', -33.9, 18.4, 1], '預設 round(18.4/15) = 1');
  m = K.manualPlace(-33.9, 18.4, 2);
  assert.strictEqual(m.utc, 2, '可以改成 UTC+2');
  m = K.manualPlace(123, -400, 99);
  assert.deepStrictEqual([m.lat, m.lon, m.utc], [90, -180, 14], '夾到邊界');
  m = K.manualPlace('abc', NaN, 'x');
  assert.deepStrictEqual([m.lat, m.lon, m.utc], [0, 0, 0], '不是數字就用 0');
  assert.strictEqual(K.manualPlace(10, 80, 5.6).utc, 5.5, '取到 0.25 時');
  assert.strictEqual(K.defaultUtc(-179.9), -12); assert.strictEqual(K.defaultUtc(172.6), 12); assert.strictEqual(K.defaultUtc(-7.4), 0);
  // 固定偏移：不計夏令時間
  const t = K.timeOf(0, K.doyOf(7, 1), 12);
  close(K.localT(K.manualPlace(51.5, 0, 0), t) - t, -8 / 24, 1e-12, '七月也是 UTC+0');
});

test('時區與夏令時間（2026 年的規則）：切換前後一分鐘的偏移、23 與 25 小時的一天、新德里 UTC+5:30', () => {
  const tOf = iso => (Date.parse(iso) - Date.UTC(2026, 0, 1)) / 86400000 + 8 / 24;   // 真實 UTC 瞬間 → 模型時間
  const off = (id, iso) => K.utcOffset(K.placeById(id), tOf(iso));
  // 模型時間 ↔ UTC：模型的 1 月 1 日 0 時（UTC+8）＝ 2025-12-31 16:00 UTC
  close(K.utcMs(0), Date.UTC(2025, 11, 31, 16), 1e-3, 'utcMs(0)');
  close(K.utcMs(tOf('2026-07-15T10:52:00Z')), Date.parse('2026-07-15T10:52:00Z'), 1e-3, 'utcMs 往返');
  const cases = [
    ['newyork', '2026-03-08T06:59Z', -5], ['newyork', '2026-03-08T07:01Z', -4],   // 3 月第 2 個週日 2:00 → 3:00
    ['newyork', '2026-11-01T05:59Z', -4], ['newyork', '2026-11-01T06:01Z', -5],   // 11 月第 1 個週日 2:00 → 1:00
    ['london', '2026-03-29T00:59Z', 0], ['london', '2026-03-29T01:01Z', 1],       // 3 月最後一個週日 01:00 UTC
    ['london', '2026-10-25T00:59Z', 1], ['london', '2026-10-25T01:01Z', 0],
    ['sydney', '2026-04-04T15:59Z', 11], ['sydney', '2026-04-04T16:01Z', 10],     // 南半球：4 月第 1 個週日結束
    ['sydney', '2026-10-03T15:59Z', 10], ['sydney', '2026-10-03T16:01Z', 11],     // 10 月第 1 個週日開始
    ['delhi', '2026-07-15T00:00Z', 5.5], ['tokyo', '2026-07-15T00:00Z', 9], ['singapore', '2026-01-15T00:00Z', 8],
    ['reykjavik', '2026-07-15T00:00Z', 0], ['buenosaires', '2026-01-15T00:00Z', -3], ['tw', '2026-07-15T00:00Z', 8]
  ];
  cases.forEach(c => assert.strictEqual(off(c[0], c[1]), c[2], c[0] + ' ' + c[1]));
  assert.strictEqual(K.standardOffset(K.placeById('newyork')), -5, '紐約標準時間');
  assert.strictEqual(K.standardOffset(K.placeById('sydney')), 10, '雪梨標準時間');
  // 當地的一天：切換那天長 23 或 25 小時，其他天 24 小時；開始時刻都是當地 0 時
  const dayLen = (id, m, d) => {
    const p = K.placeById(id), b = K.localDay(p, K.fromLocal(p, K.timeOf(0, K.doyOf(m, d), 12)));
    close(K.calendar(K.localT(p, b.t0)).hour, 0, 1e-9, id + ' 一天從 0 時開始');
    return (b.t1 - b.t0) * 24;
  };
  close(dayLen('newyork', 3, 8), 23, 1e-9, '紐約 3/8'); close(dayLen('newyork', 11, 1), 25, 1e-9, '紐約 11/1');
  close(dayLen('sydney', 10, 4), 23, 1e-9, '雪梨 10/4'); close(dayLen('sydney', 4, 5), 25, 1e-9, '雪梨 4/5');
  close(dayLen('newyork', 7, 15), 24, 1e-9, '平常的一天');
  // 當地時間 ↔ 模型時間 往返；跳過的時刻往後算、重複的時刻取較早那一次
  const ny = K.placeById('newyork');
  for (const tl of [10.25, 66.6, 200.9, 330.01]) close(K.localT(ny, K.fromLocal(ny, tl)), tl, 1e-9, '往返 ' + tl);
  const gap = K.timeOf(0, K.doyOf(3, 8), 2.5);            // 3/8 02:30 不存在
  close(K.calendar(K.localT(ny, K.fromLocal(ny, gap))).hour, 3.5, 1e-9, '跳過的 02:30 → 03:30（夏令時間）');
  const dup = K.timeOf(0, K.doyOf(11, 1), 1.5);           // 11/1 01:30 出現兩次
  close(K.utcMs(K.fromLocal(ny, dup)), Date.parse('2026-11-01T05:30:00Z'), 1e-3, '重複的 01:30 取夏令時間那一次');
});

test('預設的臺灣：當地時間就是模型時間（UTC+8），升落與原本的計算完全相同', () => {
  const tw = K.placeById('tw');
  let el = K.makeElements({ N0: 1, W0: 2 });
  for (const t of [0.3, 265.77, 400.123, -3.4]) {
    assert.strictEqual(K.localT(tw, t), t, 'localT');
    assert.strictEqual(K.fromLocal(tw, t), t, 'fromLocal');
    const b = K.localDay(tw, t);
    assert.deepStrictEqual([b.t0, b.t1], [Math.floor(t), Math.floor(t) + 1], '一天就是 [floor(t), floor(t) + 1)');
    el = K.placeElongation(el, t, 2);
    assert.deepStrictEqual(K.riseSet(el, b.t0, 'moon', tw.lat * D, tw.lon * D, b.t1 - b.t0), K.riseSet(el, Math.floor(t), 'moon'), '月出月落');
    assert.deepStrictEqual(K.riseSet(el, b.t0, 'sun', tw.lat * D, tw.lon * D, 1), K.riseSet(el, Math.floor(t), 'sun'), '日出日落');
    assert.deepStrictEqual(K.skyOrientation(el, t, tw.lat * D, tw.lon * D), K.skyOrientation(el, t), '亮面方向');
  }
});

/*
 * 與真實資料比對：美國海軍天文台 USNO 的月出月落（https://aa.usno.navy.mil/api/rstt/oneday ，2026-11-12 取得，當地時間，
 * 四捨五入到分；查詢用的經緯度與 PLACES 相同），以及 JPL Horizons 在 USNO 那一刻的月球地心視赤經、赤緯與距離
 * （https://ssd.jpl.nasa.gov/api/horizons.api ，COMMAND=301、CENTER=500@399、QUANTITIES=2,20，同日取得）。
 *
 * 本模擬的月球軌道是簡化的克卜勒橢圓、太陽是等速的平太陽，不會剛好和真實的月球重合；所以每一筆都把模型的月球放到
 * 真實月球在那一刻的位置（圓軌道、半徑 = 真實距離），再算「這個地點、這個當地日」的月出或月落。
 * 模型的恆星時由平太陽定義（春分固定在 3 月 20 日 18:00），比真實的格林威治恆星時（Meeus 式 12.4）多一個固定角 δ ≈ 2.04°；
 * 赤經同樣加上 δ，時角就與真實相同。這樣比對的正是跟地點有關的全部計算：觀測者位置、地平座標、視差、月面視半徑、
 * 34′ 大氣折射、IANA 時區（含夏令時間）、當地的一天、二分法找時刻。
 * 誤差標準：1 分鐘（USNO 四捨五入到分，±0.5 分；其餘差異來自球形地球與 USNO 的細節，實測最多約 0.5 分）。
 */
const USNO = [
  // [地點, USNO 日期（當地）, 事件, USNO 時刻（當地）, 那一刻的 UTC, Horizons 赤經°, 赤緯°, 距離 km]
  ['tokyo', '2026-03-25', 'set', '00:10', '2026-03-24T15:10Z', 76.996960006, 28.075796882, 368909.55921],
  ['tokyo', '2026-03-25', 'rise', '09:34', '2026-03-25T00:34Z', 83.310348214, 28.345727661, 369630.32850],
  ['newyork', '2026-07-15', 'rise', '06:52', '2026-07-15T10:52Z', 130.533690767, 20.306083796, 363102.49401],   // 夏令時間 UTC−4
  ['newyork', '2026-07-15', 'set', '21:38', '2026-07-16T01:38Z', 139.420326740, 17.034182523, 365620.55651],
  ['sydney', '2026-12-10', 'rise', '06:01', '2026-12-09T19:01Z', 265.468996418, -27.590652149, 405637.00260],    // 南半球夏令時間 UTC+11
  ['sydney', '2026-12-10', 'set', '21:14', '2026-12-10T10:14Z', 273.931909311, -27.206952608, 406162.01725],
  ['reykjavik', '2026-01-20', 'rise', '11:32', '2026-01-20T11:32Z', 322.630778767, -16.585837777, 389960.06946], // 北緯 64°：月亮只出來 7 小時半
  ['reykjavik', '2026-01-20', 'set', '18:57', '2026-01-20T18:57Z', 326.414071182, -14.978205401, 388927.02232],
  ['singapore', '2026-06-05', 'set', '10:46', '2026-06-05T02:46Z', 309.512438895, -20.815786029, 400475.02112],  // 赤道附近
  ['singapore', '2026-06-05', 'rise', '23:14', '2026-06-05T15:14Z', 315.803549123, -18.629613468, 398729.67746],
  ['capetown', '2026-05-12', 'rise', '02:25', '2026-05-12T00:25Z', 347.369628441, -4.383725851, 381036.11177],
  ['capetown', '2026-05-12', 'set', '15:02', '2026-05-12T13:02Z', 353.626506934, -1.064468723, 377762.92570],
  ['tw', '2026-09-23', 'set', '02:18', '2026-09-22T18:18Z', 315.658023605, -18.440140176, 396455.40858],
  ['tw', '2026-09-23', 'rise', '15:46', '2026-09-23T07:46Z', 322.406514144, -15.762339969, 394179.60798]
];
function gmstReal(ms) { // Meeus《Astronomical Algorithms》式 12.4（弧度）
  const d = ms / 86400000 + 2440587.5 - 2451545, T = d / 36525;
  return (280.46061837 + 360.98564736629 * d + 0.000387933 * T * T - T * T * T / 38710000) * D;
}
test('月出月落與 USNO 比對（7 個地點、14 筆，含南半球、赤道、北緯 64°、夏令時間）：誤差 ≤ 1 分鐘', () => {
  const rows = [];
  USNO.forEach(r => {
    const [id, date, kind, hm, iso, ra, dec, dist] = r;
    const ms = Date.parse(iso), t = (ms - Date.UTC(2026, 0, 1)) / 86400000 + 8 / 24, p = K.placeById(id);
    const delta = K.lst(t, 0) - gmstReal(ms);
    const a = ra * D + delta, de = dec * D;
    const q = K.eqToEcl(K.v3(Math.cos(de) * Math.cos(a), Math.cos(de) * Math.sin(a), Math.sin(de)));
    const lam = Math.atan2(q.y, q.x), beta = Math.asin(q.z), inc = 6 * D;   // 傾角取 6°（> |β|），只是為了把月球放到那一點
    const u = Math.asin(Math.sin(beta) / Math.sin(inc));
    let el = K.makeElements({ e: 0, a: dist, inc: inc, N0: lam - Math.atan2(Math.cos(inc) * Math.sin(u), Math.cos(u)), regress: false, precess: false });
    el = K.placeMoonLon(el, t, lam);
    assert.ok(K.len(K.sub(K.moonAt(el, t), K.mul(q, dist))) < 1e-3, id + '：月球放到真實位置');
    close(K.wrapPi(delta) / D, 2.04, 0.02, '模型與真實恆星時的固定差');
    const b = K.localDay(p, t);
    const rs = K.riseSet(el, b.t0, 'moon', p.lat * D, p.lon * D, b.t1 - b.t0);
    assert.ok(rs[kind] != null, id + ' ' + date + ' 應有' + (kind === 'rise' ? '月出' : '月落'));
    const c = K.calendar(K.localT(p, rs[kind]));
    assert.strictEqual(c.month + '/' + c.day, +date.slice(5, 7) + '/' + +date.slice(8), id + ' 當地日期');
    const diff = c.hour * 60 - (+hm.slice(0, 2) * 60 + +hm.slice(3));
    rows.push(id + ' ' + date + ' ' + (kind === 'rise' ? '月出' : '月落') + ' USNO ' + hm + '，模型差 ' + (diff >= 0 ? '+' : '') + diff.toFixed(2) + ' 分');
    assert.ok(Math.abs(diff) <= 1, id + ' ' + date + ' ' + kind + '：USNO ' + hm + '，模型差 ' + diff.toFixed(2) + ' 分');
  });
  rows.forEach(s => console.log('      ' + s));
});

test('各地看到的月亮：上弦月的亮面北半球在右、南半球在左；赤道的黃昏眉月亮面朝下（像微笑）', () => {
  const view = (id, dl, hour) => {
    const p = K.placeById(id), t = K.fromLocal(p, K.timeOf(0, K.doyOf(3, 21), hour));
    const el = K.placeElongation(K.makeElements({ N0: 2, W0: 1 }), t, dl * D);
    return { h: K.moonAlt(el, t, p.lat * D, p.lon * D), o: K.skyOrientation(el, t, p.lat * D, p.lon * D) };
  };
  // 春分時的上弦月，當地 19:00：月亮在南方（北半球）或北方（南半球）的天空中
  ['london', 'paris', 'newyork', 'beijing', 'reykjavik'].forEach(id => {
    const v = view(id, 90, 19);
    assert.ok(v.h.alt > 20 * D && Math.cos(v.o.limb) > 0.8, id + '：亮面在右（limb ' + (v.o.limb / D).toFixed(0) + '°）');
  });
  ['sydney', 'buenosaires', 'capetown'].forEach(id => {
    const v = view(id, 90, 19);
    assert.ok(v.h.alt > 20 * D && Math.cos(v.o.limb) < -0.8, id + '：亮面在左（limb ' + (v.o.limb / D).toFixed(0) + '°）');
    assert.ok(Math.abs(K.wrapPi(v.h.az)) < 20 * D, id + '：月亮在北方');
  });
  // 黃昏西方的眉月（黃經差 30°）：赤道附近亮面幾乎朝正下方；北半球朝右下、南半球朝左下
  ['singapore', 'nairobi'].forEach(id => { const v = view(id, 30, 19); assert.ok(v.h.alt > 10 * D && Math.sin(v.o.limb) < -0.9, id + '：亮面朝下'); });
  assert.ok(Math.cos(view('london', 30, 19).o.limb) > 0.3 && Math.cos(view('sydney', 30, 19).o.limb) < -0.3, '北半球右下、南半球左下');
});

test('高緯度：月亮上中天的高度 = 90° − |緯度 − 赤緯|（扣掉視差）；北緯 64° 的月亮在大月停時可以整天不落或整天不升', () => {
  const p = K.placeById('reykjavik'), lat = p.lat * D, lon = p.lon * D;
  let el = K.makeElements({ e: 0, regress: false, precess: false, N0: 0 });
  const t0 = K.timeOf(0, K.doyOf(1, 10), 0);
  for (const lonM of [90, 0, 270]) {
    const e2 = K.placeMoonLon(el, t0 + 0.5, lonM * D);
    const tr = K.transit(e2, t0, 'moon', lat, lon);
    const dec = K.declination(K.moonAt(e2, tr)), h = K.moonAlt(e2, tr, lat, lon);
    const hGeo = 90 * D - Math.abs(lat - dec);
    const par = Math.asin(K.R_EARTH / h.dist * Math.cos(hGeo));   // 地平視差 × cos(高度)
    close(h.alt, hGeo - par, 0.05 * D, '月球黃經 ' + lonM + '° 的上中天高度');
  }
  // 赤緯 +28.6°（> 90° − 64.15°）：整天在地平線上；−28.6°：整天在地平線下；臺灣同一天照常升落
  const up = K.placeMoonLon(el, t0 + 0.5, 90 * D), dn = K.placeMoonLon(el, t0 + 0.5, 270 * D);
  const b = K.localDay(p, t0 + 0.5);
  const rUp = K.riseSet(up, b.t0, 'moon', lat, lon, b.t1 - b.t0), rDn = K.riseSet(dn, b.t0, 'moon', lat, lon, b.t1 - b.t0);
  assert.ok(rUp.rise == null && rUp.set == null && rUp.upAll, '整天不落');
  assert.ok(rDn.rise == null && rDn.set == null && !rDn.upAll, '整天不升');
  const tw = K.riseSet(up, Math.floor(t0 + 0.5), 'moon');
  assert.ok(tw.rise != null && tw.set != null, '臺灣照常升落');
});

test('月面座標中的太陽方向：近側固定的月面上，明暗界線的位置只由日月地的位置決定，不隨觀測時刻轉動；與 3D 同步自轉的月球一致', () => {
  // 只用到亮邊相對月球北極的角度：整個畫面一起轉，結果不變
  for (const d of [0.3, 1.7, -2.4, Math.PI]) {
    const a = K.sunInMoonFrame(1.1, 0.4, 2.0), b = K.sunInMoonFrame(1.1, 0.4 + d, 2.0 + d);
    for (let k = 0; k < 3; k++) close(b[k], a[k], 1e-12, '轉 ' + d);
  }
  // 臺灣 6 小時內：以天頂為上時月球北極的方向轉了很多（這是天頂朝上的畫面造成的轉動），亮邊相對月球北極的角度幾乎不變
  const t0 = K.timeOf(0, K.doyOf(9, 23), 18.5);
  let el = K.makeElements({});
  el = K.withNode(el, t0, 100 * D); el = K.withPerigee(el, t0, 30 * D); el = K.placeElongation(el, t0, 120 * D);
  const o0 = K.skyOrientation(el, t0), o1 = K.skyOrientation(el, t0 + 0.25);
  assert.ok(Math.abs(K.wrapPi(o1.north - o0.north)) > 60 * D, '天頂朝上時月球北極轉了 ' + (K.wrapPi(o1.north - o0.north) / D).toFixed(1) + '°');
  close(K.wrapPi((o1.limb - o1.north) - (o0.limb - o0.north)), 0, 0.5 * D, '亮邊相對月球北極的角度');
  // 與 3D 的月球本體座標（x 指向地心＝經度 0、z 朝黃道北極、y 為東）比較：只差觀測者不在地心的視差（< 1.2°）
  const body = function (e2, t) {
    const m = K.moonAt(e2, t), s = K.sunAt(t);
    const X = K.unit(K.mul(m, -1)), Z = K.unit(K.sub(K.v3(0, 0, 1), K.mul(X, X.z))), Y = K.cross(Z, X), sd = K.unit(K.sub(s, m));
    return [K.dot(sd, Y), K.dot(sd, Z), K.dot(sd, X)];
  };
  let worst = 0;
  const e0 = K.makeElements({ N0: 1.2, W0: 0.4 });
  K.PLACES.forEach(p => {
    [20, 90, 135, 180, 225, 270, 330].forEach(dl => {
      [0, 5, 11, 17, 22].forEach(hr => {
        const t = K.timeOf(0, K.doyOf(5, 10), hr), e2 = K.placeElongation(e0, t, dl * D);
        const o = K.skyOrientation(e2, t, p.lat * D, p.lon * D);
        const L = K.sunInMoonFrame(K.phaseAt(e2, t).phaseAngle, o.limb, o.north), B = body(e2, t);
        worst = Math.max(worst, Math.acos(Math.min(1, L[0] * B[0] + L[1] * B[1] + L[2] * B[2])));
      });
    });
  });
  assert.ok(worst < 1.2 * D, '與 3D 最大相差 ' + (worst / D).toFixed(2) + '°');
  // 上弦：明暗界線通過月面中央（經度 0），東半邊亮；下弦：西半邊亮；望（在交點上）：整個近側亮
  const L = function (e2) { const o = K.skyOrientation(e2, t0); return K.sunInMoonFrame(K.phaseAt(e2, t0).phaseAngle, o.limb, o.north); };
  const fq = L(K.placeElongation(el, t0, 90 * D)), lq = L(K.placeElongation(el, t0, 270 * D));
  assert.ok(Math.abs(fq[2]) < 0.01 && fq[0] > 0.99, '上弦 ' + fq.map(v => v.toFixed(3)));
  assert.ok(Math.abs(lq[2]) < 0.01 && lq[0] < -0.99, '下弦 ' + lq.map(v => v.toFixed(3)));
  const full = L(K.placeElongation(K.withNode(el, t0, K.sunLon(t0)), t0, 180 * D));
  assert.ok(full[2] > 0.9999, '望 ' + full.map(v => v.toFixed(4)));
});

console.log(`moon-phases-core：${passed} 項通過`);
