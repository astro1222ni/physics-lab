// 以 Node 執行：node tests/seasons-core.test.js
'use strict';
const assert = require('assert');
const C = require('../js/seasons-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function near(a, b, tol, msg) { assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b}，得到 ${a}（容許 ${tol}）`); }

const EPS = C.OBLIQ;
const TAIPEI = { lat: 25.03, lon: 121.56, zone: 8, eps: EPS };
const at = (base, day, clock) => Object.assign({}, base, { day: day, clock: clock == null ? 12 : clock });
const S = C.seasons();
const localDay = (t, zone) => C.localOf(t, zone).day;
const utc = (m, d, h, mi) => C.dayOfDate(m, d) - 1 + (h + mi / 60) / 24;

test('克卜勒方程式 E − e sin E = M 解到機器精度', () => {
  for (const e of [0, 0.0167, 0.2, 0.9]) {
    for (let M = -3; M <= 7; M += 0.37) {
      const E = C.solveKepler(M, e);
      near(E - e * Math.sin(E), M, 1e-13, `e = ${e}, M = ${M}`);
    }
  }
});

test('日期換算：第 n 天 ↔ 月日（2026 平年 365 天）', () => {
  for (let n = 1; n <= 365; n++) { const d = C.dateOfDay(n); assert.strictEqual(C.dayOfDate(d.m, d.d), n); }
  assert.deepStrictEqual(C.dateOfDay(1), { m: 1, d: 1 });
  assert.deepStrictEqual(C.dateOfDay(172), { m: 6, d: 21 });
  assert.deepStrictEqual(C.dateOfDay(365), { m: 12, d: 31 });
});

test('2026 年分至時刻與天文年曆相差 15 分鐘以內', () => {
  // 天文年曆（USNO）：春分 3/20 14:46、夏至 6/21 08:24、秋分 9/23 00:05、冬至 12/21 20:50（UT）
  const ref = { mar: utc(3, 20, 14, 46), jun: utc(6, 21, 8, 24), sep: utc(9, 23, 0, 5), dec: utc(12, 21, 20, 50) };
  for (const k of Object.keys(ref)) near(S[k], ref[k], 15 / 1440, k);
  // 臺灣時間（UTC+8）：冬至落在 12 月 22 日
  assert.strictEqual(localDay(S.dec, 8), C.dayOfDate(12, 22));
  assert.strictEqual(localDay(S.jun, 8), C.dayOfDate(6, 21));
});

test('分至時太陽赤緯為 0、±ε（sin δ = sin ε sin λ）', () => {
  near(C.sunAt(S.mar, EPS).dec, 0, 1e-7, '春分');
  near(C.sunAt(S.sep, EPS).dec, 0, 1e-7, '秋分');
  near(C.sunAt(S.jun, EPS).dec, EPS, 1e-7, '夏至');
  near(C.sunAt(S.dec, EPS).dec, -EPS, 1e-7, '冬至');
  for (const eps of [0, 10, 45, 90]) near(C.sunAt(S.jun, eps).dec, eps, 1e-6, 'ε = ' + eps);
});

test('地球軌道：離心率 0.0167、近日點約 1 月 3 日（0.9833 AU）、遠日點約 7 月 6 日（1.0167 AU）', () => {
  const o = C.orbit(S.peri), a = C.orbit(S.aph);
  near(o.e, 0.0167, 0.0001, 'e');
  // 地球中心偏離地月質心：距離最多差 4671 km ≈ 0.0000312 AU
  near(o.R, 1 - o.e, 4e-5, '近日距離');
  near(a.R, 1 + a.e, 4e-5, '遠日距離');
  // USNO：2026 年近日點 1/3 17:15、遠日點 7/6 17:30（UT），模型相差 1.5 小時以內
  near(S.peri, utc(1, 3, 17, 15), 1.5 / 24, '近日點時刻');
  near(S.aph, utc(7, 6, 17, 30), 1.5 / 24, '遠日點時刻');
  assert.deepStrictEqual(C.dateOfDay(localDay(S.peri, 0)), { m: 1, d: 3 });
  assert.deepStrictEqual(C.dateOfDay(localDay(S.aph, 0)), { m: 7, d: 6 });
  // 一年中 R 的最小、最大值就是近日、遠日距離
  let mn = 9, mx = 0;
  for (let t = 0; t < 365; t += 0.1) { const R = C.orbit(t).R; mn = Math.min(mn, R); mx = Math.max(mx, R); }
  near(mn, o.R, 1e-6); near(mx, a.R, 1e-6);
  // 北半球冬天（冬至）反而比夏天（夏至）離太陽近
  assert.ok(C.orbit(S.dec).R < C.orbit(S.jun).R);
});

test('克卜勒第二定律：黃經的變化率 ∝ 1/R²（近日點附近走得快）', () => {
  const rate = t => (C.orbit(t + 0.01).lambda - C.orbit(t - 0.01).lambda) / 0.02;
  const k1 = rate(S.peri) * Math.pow(C.orbit(S.peri).R, 2), k2 = rate(S.aph) * Math.pow(C.orbit(S.aph).R, 2), k3 = rate(100) * Math.pow(C.orbit(100).R, 2);
  near(k1 / k2, 1, 2e-4); near(k1 / k3, 1, 2e-4);
  // 北半球夏半年（春分 → 秋分）比冬半年長約 7 天
  const summer = S.sep - S.mar, winter = 365.2422 - summer;
  near(summer - winter, 7.6, 0.5, '夏半年比冬半年多的天數');
});

test('均時差：11 月初約 +16.4 分、2 月中約 −14.2 分', () => {
  let mx = -99, mn = 99, dmx = 0, dmn = 0;
  for (let n = 1; n <= 365; n++) { const e = C.sunAt(n - 0.5, EPS).eot; if (e > mx) { mx = e; dmx = n; } if (e < mn) { mn = e; dmn = n; } }
  near(mx, 16.4, 0.3, '最大值'); near(mn, -14.2, 0.3, '最小值');
  near(dmx, C.dayOfDate(11, 3), 2, '最大值日期'); near(dmn, C.dayOfDate(2, 11), 2, '最小值日期');
});

test('課本近似式 δ ≈ −ε cos(360°(N+10)/365) 與軌道計算相差不到 1°', () => {
  let me = 0;
  for (let n = 1; n <= 365; n++) me = Math.max(me, Math.abs(C.sunAt(n - 0.5, EPS).dec - C.approxDec(n)));
  assert.ok(me > 0.5 && me < 1.0, '最大誤差 ' + me);
});

test('地平座標：天頂、天極、東升西落', () => {
  near(C.horizontal(30, 30, 0).alt, 90, 1e-9, '赤緯等於緯度時正午在天頂');
  near(C.horizontal(90, 17, 77).alt, 17, 1e-9, '北極點：高度角 = 赤緯');
  near(C.horizontal(-90, -17, 140).alt, 17, 1e-9, '南極點');
  const rise = C.horizontal(0, 0, -90), set = C.horizontal(0, 0, 90);
  near(rise.alt, 0, 1e-9); near(rise.az, 90, 1e-9, '赤道春分：正東升起');
  near(set.az, 270, 1e-9, '正西落下');
  // 球面三角：天頂角 = 天頂與太陽方向的夾角
  for (const [lat, dec, H] of [[25, 10, 30], [-33, 20, -70], [70, -5, 150], [5, 23, 10]]) {
    const hz = C.horizontal(lat, dec, H), v = C.horizVec(hz.alt, hz.az);
    near(Math.hypot(v[0], v[1], v[2]), 1, 1e-12);
    const p = lat * C.DEG, d = dec * C.DEG, h = H * C.DEG;
    // 赤道座標 → 地平座標的旋轉（東、北、上）
    const e = -Math.cos(d) * Math.sin(h), n = Math.sin(d) * Math.cos(p) - Math.cos(d) * Math.sin(p) * Math.cos(h);
    const u = Math.sin(p) * Math.sin(d) + Math.cos(p) * Math.cos(d) * Math.cos(h);
    near(v[0], e, 1e-12); near(v[1], n, 1e-12); near(v[2], u, 1e-12);
  }
});

test('正午高度角 = 90° − |φ − δ|（南北半球、極區都成立）', () => {
  for (const lat of [-90, -66.5, -33.87, -10, 0, 22, 25.03, 45, 69.65, 89.9]) {
    for (const day of [5, 79, 120, 172, 230, 266, 300, 356]) {
      const tr = C.transit({ lat: lat, lon: 121.56, zone: 8, eps: EPS, day: day });
      near(tr.alt, 90 - Math.abs(lat - tr.dec), 1e-6, `φ = ${lat}, 第 ${day} 天`);
      const s = C.sunLocal({ lat: lat, lon: 121.56, zone: 8, eps: EPS, day: day, clock: tr.clock });
      near(s.H, 0, 1e-6, '正午時角為 0');
    }
  }
});

test('北回歸線（23.44°N）夏至正午：太陽在天頂、竿影消失', () => {
  const day = localDay(S.jun, 8);
  for (const lon of [120.42, 121.51]) {
    const loc = { lat: 23.44, lon: lon, zone: 8, eps: EPS, day: day };
    const tr = C.transit(loc);
    const s = C.sunLocal(Object.assign({}, loc, { clock: tr.clock }));
    assert.ok(s.zen < 0.01, '天頂角 ' + s.zen);
    assert.ok(C.shadow(s.alt, s.az, 1).len < 2e-4);
  }
  // 南回歸線冬至
  const tr2 = C.transit({ lat: -23.44, lon: 151.21, zone: 10, eps: EPS, day: localDay(S.dec, 10) });
  assert.ok(90 - tr2.alt < 0.01);
});

test('春分、秋分：不計折射時晝夜等長（12 h ± 3 分），計入折射白天多約 7–12 分', () => {
  for (const [t, name] of [[S.mar, '春分'], [S.sep, '秋分']]) {
    for (const lat of [0, 25.03, 45, 60, -33.87]) {
      const o = { lat: lat, lon: 120, zone: 8, eps: EPS, day: localDay(t, 8) };
      near(C.riseSet(o, false).len, 12, 3 / 60, `${name} φ = ${lat}`);
      const extra = (C.riseSet(o, true).len - 12) * 60;
      assert.ok(extra > 5 && extra < 13, `${name} φ = ${lat} 折射多出 ${extra.toFixed(1)} 分`);
    }
  }
});

test('赤道全年晝長約 12 h（不計折射 ±1 分；計入折射約 12 h 06–08 分）', () => {
  const eq = { lat: 0, lon: 109.33, zone: 7, eps: EPS };
  for (let n = 1; n <= 365; n += 7) {
    near(C.riseSet(at(eq, n), false).len, 12, 1 / 60, '第 ' + n + ' 天');
    const L = C.riseSet(at(eq, n), true).len;
    assert.ok(L > 12 + 5.5 / 60 && L < 12 + 8.5 / 60, '含折射 ' + L);
  }
});

test('北極夏至永晝、冬至永夜；南極相反；北極圈附近剛好出現永晝', () => {
  const np = { lat: 90, lon: 0, zone: 0, eps: EPS }, sp = { lat: -90, lon: 0, zone: 0, eps: EPS };
  const jun = localDay(S.jun, 0), dec = localDay(S.dec, 0);
  assert.strictEqual(C.riseSet(at(np, jun), true).polar, 'day');
  assert.strictEqual(C.riseSet(at(np, jun), true).len, 24);
  assert.strictEqual(C.riseSet(at(np, dec), true).polar, 'night');
  assert.strictEqual(C.riseSet(at(sp, jun), true).polar, 'night');
  assert.strictEqual(C.riseSet(at(sp, dec), true).polar, 'day');
  // 北極點夏至：太陽整天的高度角都約等於 δ
  for (let c = 0; c < 24; c += 3) near(C.sunLocal(at(np, jun, c)).alt, C.sunLocal(at(np, jun, c)).dec, 1e-9);
  // 北極圈（90° − ε）：不計折射時夏至太陽剛好擦過地平線；往北 1° 就是永晝
  const ac = { lat: 90 - EPS + 1, lon: 18.96, zone: 1, eps: EPS };
  assert.strictEqual(C.riseSet(at(ac, localDay(S.jun, 1)), false).polar, 'day');
  const below = { lat: 90 - EPS - 1, lon: 18.96, zone: 1, eps: EPS };
  assert.strictEqual(C.riseSet(at(below, localDay(S.jun, 1)), false).polar, null);
  // 臺北永遠不會有永晝
  for (let n = 1; n <= 365; n += 5) assert.strictEqual(C.riseSet(at(TAIPEI, n), true).polar, null);
});

test('臺北日出日落與中央氣象署公布值相差 2 分鐘以內', () => {
  // 中央氣象署：夏至 05:04、18:47；冬至 06:35、17:11（臺北）
  const s1 = C.riseSet(at(TAIPEI, C.dayOfDate(6, 21)), true), s2 = C.riseSet(at(TAIPEI, C.dayOfDate(12, 22)), true);
  near(s1.rise, 5 + 4 / 60, 2 / 60, '夏至日出'); near(s1.set, 18 + 47 / 60, 2 / 60, '夏至日落');
  near(s2.rise, 6 + 35 / 60, 2 / 60, '冬至日出'); near(s2.set, 17 + 11 / 60, 2 / 60, '冬至日落');
  // 日出、日落對正午對稱（δ 一天內的變化使兩邊差不到 1 分）
  near((s1.rise + s1.set) / 2, s1.noon, 1 / 60); near((s2.rise + s2.set) / 2, s2.noon, 1 / 60);
});

test('日出方位：春秋分正東；不計折射時 cos A = sin δ / cos φ', () => {
  const o = at(TAIPEI, localDay(S.mar, 8));
  near(C.riseSet(o, false).riseAz, 90, 0.4, '春分日出方位');
  near(C.riseSet(o, false).setAz, 270, 0.4, '春分日落方位');
  const j = at(TAIPEI, localDay(S.jun, 8));
  const rs = C.riseSet(j, false);
  const dec = C.sunLocal(Object.assign({}, j, { clock: rs.rise })).dec;
  near(rs.riseAz, Math.acos(Math.sin(dec * C.DEG) / Math.cos(25.03 * C.DEG)) * C.RAD, 1e-4, '夏至日出方位');
  const s = C.sunLocal(Object.assign({}, j, { clock: rs.rise }));
  near(s.alt, 0, 1e-6, '日出時太陽中心在地平線上');
  const r2 = C.riseSet(j, true);
  near(C.sunLocal(Object.assign({}, j, { clock: r2.rise })).alt, C.H0_REFRACT, 1e-6, '含折射：太陽中心在 −0.833°');
});

test('日照功率：I = (S0/R²) sin h；大氣質量與透射比合理', () => {
  near(C.irradiance(90, 1, false), 1361, 1e-9);
  near(C.irradiance(30, 1, false), 1361 / 2, 1e-9, '高度角 30°：面積變 2 倍、功率變一半');
  near(C.irradiance(45, 0.98329, false), 1361 / 0.98329 / 0.98329 * Math.SQRT1_2, 1e-9);
  assert.strictEqual(C.irradiance(-1, 1, false), 0);
  near(C.airMass(0), 1, 0.001, '天頂 AM = 1');
  near(C.airMass(60), 2, 0.01, '天頂角 60° 時 AM ≈ sec z = 2');
  assert.ok(C.airMass(90) > 37 && C.airMass(90) < 39, '地平線 AM ≈ 38');
  near(C.transmit(90), 0.7, 0.001, '天頂的透射比');
  // 太陽越低，透射比越小
  let prev = 1;
  for (let h = 90; h > 1; h -= 5) { const tr = C.transmit(h); assert.ok(tr <= prev + 1e-12); prev = tr; }
});

test('一天的日照量：解析式 = 數值積分；δ 一天內的變化影響小於 0.3%', () => {
  for (const [lat, dec, R] of [[25, 23.44, 1.0163], [25, -23.44, 0.9837], [60, 10, 1], [-45, 5, 1], [80, 20, 1.01], [0, 0, 1]]) {
    const ana = C.dailyInsolation(lat, dec, R, false);
    // 每 0.5 分鐘一步的梯形積分
    let num = 0;
    const N = 2880;
    for (let i = 0; i < N; i++) {
      const H = -180 + (i + 0.5) * 360 / N;
      const alt = C.horizontal(lat, dec, H).alt;
      num += C.irradiance(alt, R, false) * 86400 / N;
    }
    near(num / ana, 1, 1e-5, `φ = ${lat}, δ = ${dec}`);
    // 上午與下午各占一半
    let am = 0, pm = 0;
    for (let i = 0; i < N; i++) { const H = -180 + (i + 0.5) * 360 / N; const I = C.irradiance(C.horizontal(lat, dec, H).alt, R, true); if (H < 0) am += I; else pm += I; }
    near(am / pm, 1, 1e-9, '上午 = 下午');
    // 計大氣：辛普森積分與細格子積分一致
    near(C.dailyInsolation(lat, dec, R, true) / ((am + pm) * 86400 / N), 1, 2e-3, '大氣衰減的積分');
  }
  // 真實日期：一天內 δ、R 都在變，與「取正午的 δ、R」相比
  for (const day of [80, 172, 266, 356]) {
    const noon = C.transit(at(TAIPEI, day));
    let q = 0;
    const N = 2880;
    for (let i = 0; i < N; i++) {
      const s = C.sunLocal(at(TAIPEI, day, noon.clock - 12 + (i + 0.5) * 24 / N));
      q += C.irradiance(s.alt, s.R, false) * 86400 / N;
    }
    near(q / C.dailyInsolation(25.03, noon.dec, noon.R, false), 1, 0.003, '第 ' + day + ' 天');
  }
});

test('日照量的對稱性：南北半球鏡像、全年總量南北相同（克卜勒第二定律的補償）', () => {
  for (const [lat, dec, R] of [[25, 20, 1.01], [60, -15, 0.99], [80, 23, 1]]) {
    near(C.dailyInsolation(lat, dec, R, false), C.dailyInsolation(-lat, -dec, R, false), 1e-6);
    near(C.dailyInsolation(lat, dec, R, true), C.dailyInsolation(-lat, -dec, R, true), 1e-6);
  }
  // 春秋分（δ = 0）：南北緯相同的地方日照量相同
  near(C.dailyInsolation(30, 0, 1, false), C.dailyInsolation(-30, 0, 1, false), 1e-6);
  // 整整一個回歸年的總日照量：北緯 φ = 南緯 φ（南半球夏天離太陽近、但夏天較短，兩者剛好抵消）
  for (const lat of [25, 60]) {
    let n = 0, s = 0;
    const YR = 365.2422, steps = 365 * 8;
    for (let i = 0; i < steps; i++) {
      const o = C.sunAt(S.mar + (i + 0.5) * YR / steps, EPS);
      n += C.dailyInsolation(lat, o.dec, o.R, false); s += C.dailyInsolation(-lat, o.dec, o.R, false);
    }
    near(n / s, 1, 2e-4, '緯度 ' + lat);
  }
  // 但單日的最大值不同：南半球夏至（近日點附近）比北半球夏至多約 6.6%
  const nj = C.sunAt(S.jun, EPS), sd = C.sunAt(S.dec, EPS);
  near(C.dailyInsolation(-25, sd.dec, sd.R, false) / C.dailyInsolation(25, nj.dec, nj.R, false), Math.pow(nj.R / sd.R, 2), 1e-6);
  near(Math.pow(nj.R / sd.R, 2), 1.066, 0.003);
});

test('四季的成因是傾角：ε = 0 時正午高度全年不變、晝長都是 12 h，只剩距離造成約 ±3.4% 的差別', () => {
  const o = Object.assign({}, TAIPEI, { eps: 0 });
  const y = C.yearCurve(o, false, false);
  const mx = Math.max.apply(null, y.noonAlt), mn = Math.min.apply(null, y.noonAlt);
  assert.ok(mx - mn < 1e-6, '正午高度的變化 ' + (mx - mn));
  near(mx, 90 - 25.03, 1e-6);
  y.len.forEach(L => near(L, 12, 1e-9));
  const q = Math.max.apply(null, y.Q) / Math.min.apply(null, y.Q);
  near(q, Math.pow(1.01671 / 0.98329, 2), 0.002, '日照量最大／最小');
  // 真實傾角下，臺北一年中每日日照量的最大值約是最小值的 1.8 倍（遠大於距離造成的 7%）
  const yr = C.yearCurve(TAIPEI, false, false);
  const r = Math.max.apply(null, yr.Q) / Math.min.apply(null, yr.Q);
  assert.ok(r > 1.7 && r < 1.9, '臺北日照量最大／最小 ' + r);
});

test('竿影：長度 L / tan h、指向太陽的反方向；春秋分時尖端走東西向的直線', () => {
  const sh = C.shadow(45, 120, 1);
  near(sh.len, 1, 1e-12); near(sh.az, 300, 1e-12);
  near(Math.hypot(sh.x, sh.y), 1, 1e-12);
  assert.strictEqual(C.shadow(-2, 100, 1), null);
  near(C.shadow(30, 180, 2).len, 2 * Math.sqrt(3), 1e-12);
  near(C.shadow(30, 180, 2).y, 2 * Math.sqrt(3), 1e-12, '正午太陽在南方 → 影子朝北');
  // δ = 0：尖端的北向座標恆為 L tan φ（東西向的直線）
  for (let H = -75; H <= 75; H += 5) {
    const hz = C.horizontal(25.03, 0, H);
    near(C.shadow(hz.alt, hz.az, 1).y, Math.tan(25.03 * C.DEG), 1e-12, 'H = ' + H);
  }
  // 真實的春分日：δ 一天內變化約 0.4°，尖端軌跡仍幾乎是直線（高度角 20° 以上偏離不到竿長的 2%）
  const o = at(TAIPEI, localDay(S.mar, 8));
  const ys = [];
  for (let c = 6; c <= 18; c += 0.25) { const s = C.sunLocal(Object.assign({}, o, { clock: c })); if (s.alt > 20) ys.push(C.shadow(s.alt, s.az, 1).y); }
  near(Math.max.apply(null, ys) - Math.min.apply(null, ys), 0, 0.02, '春分尖端軌跡的彎曲');
  // 夏至：尖端走雙曲線，明顯彎曲
  const j = at(TAIPEI, localDay(S.jun, 8));
  const yj = [];
  for (let c = 7; c <= 17; c += 0.25) { const s = C.sunLocal(Object.assign({}, j, { clock: c })); if (s.alt > 10) yj.push(C.shadow(s.alt, s.az, 1).y); }
  assert.ok(Math.max.apply(null, yj) - Math.min.apply(null, yj) > 0.2);
});

test('直射點：緯度 = δ，在直射點太陽高度 90°；格林威治時角與時區一致', () => {
  for (const t of [10.3, 80.75, 171.35, 300.1]) {
    const o = C.sunAt(t, EPS), ss = C.subsolar(t, o);
    near(ss.lat, o.dec, 1e-12);
    near(C.horizontal(ss.lat, o.dec, C.hourAngle(t, ss.lon, o)).alt, 90, 1e-6);
  }
  // 真太陽時：經度 120°E、UTC+8 的地方，正午 = 12:00 − 均時差
  const o = { lat: 25, lon: 120, zone: 8, eps: EPS, day: 100 };
  const tr = C.transit(o);
  near(tr.clock, 12 - tr.eot / 60, 1e-5);
});

test('傾角的極限：ε = 90° 時夏至北極點太陽在天頂；臺北要 ε ≥ 65° 才有夏至永晝', () => {
  const lj = C.localOf(S.jun, 0);
  near(C.sunLocal({ lat: 90, lon: 0, zone: 0, eps: 90, day: lj.day, clock: lj.clock }).alt, 90, 1e-4);
  const day = localDay(S.jun, 8);
  assert.strictEqual(C.riseSet(Object.assign({}, TAIPEI, { eps: 64, day: day }), true).polar, null);
  assert.strictEqual(C.riseSet(Object.assign({}, TAIPEI, { eps: 66, day: day }), false).polar, 'day');
});

test('snapshot 讀數彼此一致', () => {
  const s = C.snapshot(Object.assign({}, TAIPEI, { day: 172, clock: 9.5, refract: true, atmos: false }));
  near(s.ratio, 1 / Math.tan(s.alt * C.DEG), 1e-12);
  near(s.I, s.S * Math.sin(s.alt * C.DEG), 1e-9);
  near(s.noonAlt, s.noonFormula, 1e-6);
  assert.ok(s.up && s.rise < 9.5 && s.set > 9.5);
  near(s.dayLen, s.set - s.rise, 1e-12);
  const n = C.snapshot(Object.assign({}, TAIPEI, { day: 172, clock: 0.5, refract: true, atmos: true }));
  assert.ok(!n.up && n.ratio === Infinity && n.I === 0);
});

console.log(`\n${passed} 項通過`);
