// 以 Node 執行：node tests/time-zones-core.test.js
'use strict';
const assert = require('assert');
const K = require('../js/time-zones-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function near(a, b, abs, msg) { assert.ok(Math.abs(a - b) <= abs, (msg || '') + ` 期望 ${b} ± ${abs}，得到 ${a}`); }
const C = K.CITY;
const day = (m, d) => K.dayOf(m, d);

console.log('time-zones-core');

test('日期換算：1 月 1 日是第 1 天、12 月 31 日是第 365 天，前後年會繞回', () => {
  assert.strictEqual(day(1, 1), 1);
  assert.strictEqual(day(12, 31), 365);
  assert.strictEqual(day(11, 13), 317);
  for (let n = 1; n <= 365; n++) { const d = K.dateOf(n); assert.strictEqual(day(d.m, d.d), n); assert.strictEqual(d.y, 0); }
  assert.deepStrictEqual(K.dateOf(0), { y: -1, m: 12, d: 31 });
  assert.deepStrictEqual(K.dateOf(366), { y: 1, m: 1, d: 1 });
});

test('區時：UTC 00:00 時臺北（UTC+8）是早上 8 點，洛杉磯（UTC−8）是前一天下午 4 點', () => {
  const tp = K.local(317, 0, 8), la = K.local(317, 0, -8);
  assert.strictEqual(tp.day, 317); near(tp.clock, 8, 1e-12);
  assert.strictEqual(la.day, 316); near(la.clock, 16, 1e-12);
  const np = K.local(317, 23.5, 5.75);      // 加德滿都 +5:45
  assert.strictEqual(np.day, 318); near(np.clock, 5.25, 1e-12);
});

test('太陽赤緯：夏至約 +23.44°、冬至約 −23.44°、春分秋分約 0°', () => {
  near(K.sun(day(6, 21), 12).dec, 23.44, 0.06, '夏至');
  near(K.sun(day(12, 21), 12).dec, -23.44, 0.06, '冬至');
  near(K.sun(day(3, 20), 12).dec, 0, 0.25, '春分（2026 年 3/20 14:46 UTC）');
  near(K.sun(day(9, 23), 0).dec, 0, 0.25, '秋分（2026 年 9/23 00:05 UTC）');
  let mx = -99, mn = 99;
  for (let d = 1; d <= 365; d++) { const s = K.sun(d, 12).dec; mx = Math.max(mx, s); mn = Math.min(mn, s); }
  near(mx, 23.44, 0.06); near(mn, -23.44, 0.06);
});

test('均時差：11 月初約 +16 分、2 月中約 −14 分（視太陽時減平太陽時）', () => {
  near(K.sun(day(11, 3), 12).eot, 16.4, 0.6);
  near(K.sun(day(2, 11), 12).eot, -14.2, 0.6);
  let mx = -99, mn = 99;
  for (let d = 1; d <= 365; d++) { const e = K.sun(d, 12).eot; mx = Math.max(mx, e); mn = Math.min(mn, e); }
  assert.ok(mx > 15.5 && mx < 17.5, '最大值 ' + mx);
  assert.ok(mn < -13.5 && mn > -15, '最小值 ' + mn);
});

test('太陽直射點的仰角是 90°，它的對蹠點是 −90°；任兩個對蹠點的仰角互為相反數', () => {
  for (const [d, u] of [[1, 0], [80, 7.3], [172, 12], [317, 19.9], [355, 23.5]]) {
    const s = K.sun(d, u);
    near(K.altAz(s.lat, s.lon, d, u).alt, 90, 1e-6);
    near(K.altAz(-s.lat, s.lon + 180, d, u).alt, -90, 1e-6);
    for (const [la, lo] of [[25, 121.5], [-33.9, 151.2], [64.1, -21.9], [0, 0]]) {
      near(K.altAz(la, lo, d, u).alt + K.altAz(-la, lo + 180, d, u).alt, 0, 1e-9);
    }
  }
});

test('直射點每小時往西移 15°（地球自轉），經度和 UTC 的關係是 λ = −15°(UTC − 12) − E/4', () => {
  const a = K.sun(200, 6), b = K.sun(200, 7);
  near(K.n180(a.lon - b.lon), 15, 0.01);
  const s = K.sun(200, 12);
  near(s.lon, -s.eot / 4, 1e-9);
});

test('時角：太陽在中天時（H = 0）仰角最大，上午 H < 0、下午 H > 0', () => {
  const lat = C.taipei.lat, lon = C.taipei.lon, d = 100;
  const rs = K.riseSet(lat, lon, d, 8), noonUtc = rs.noon - 8;
  const a0 = K.altAz(lat, lon, d, noonUtc);
  near(a0.H, 0, 0.05);
  assert.ok(a0.alt > K.altAz(lat, lon, d, noonUtc - 0.2).alt && a0.alt > K.altAz(lat, lon, d, noonUtc + 0.2).alt);
  assert.ok(K.altAz(lat, lon, d, noonUtc - 2).H < 0 && K.altAz(lat, lon, d, noonUtc + 2).H > 0);
  near(a0.alt, rs.noonAlt, 0.05, '中天高度 = 90° − |φ − δ|');
});

test('日出日落：臺北夏至約 05:04／18:46、冬至約 06:34／17:09（中央氣象署公布值 ± 2 分）', () => {
  const s = K.riseSet(C.taipei.lat, C.taipei.lon, day(6, 21), 8);
  near(s.rise, 5 + 4 / 60, 2 / 60, '夏至日出'); near(s.set, 18 + 46 / 60, 2 / 60, '夏至日落');
  const w = K.riseSet(C.taipei.lat, C.taipei.lon, day(12, 21), 8);
  near(w.rise, 6 + 34 / 60, 2 / 60, '冬至日出'); near(w.set, 17 + 9 / 60, 2 / 60, '冬至日落');
});

test('日出、日落那一刻，太陽仰角正好是 −0.833°（大氣折射＋太陽半徑）', () => {
  for (const [la, lo, off, d] of [[25.03, 121.56, 8, 172], [-33.87, 151.21, 10, 20], [64.15, -21.94, 0, 120], [0, 0, 0, 80]]) {
    const r = K.riseSet(la, lo, d, off);
    near(K.altAz(la, lo, d, r.rise - off).alt, K.H0, 0.02, '日出');
    near(K.altAz(la, lo, d, r.set - off).alt, K.H0, 0.02, '日落');
  }
});

test('晝長：赤道全年約 12 小時；同一天南北對稱的兩地晝長相加約 24 小時（折射讓兩邊都多幾分鐘）', () => {
  for (const d of [20, 80, 172, 266, 355]) {
    const e = K.riseSet(0, 0, d, 0).len;
    near(e, 12.12, 0.06, '赤道 第 ' + d + ' 天');
    for (const lat of [15, 30, 45, 60]) {
      const sum = K.riseSet(lat, 0, d, 0).len + K.riseSet(-lat, 0, d, 0).len;
      assert.ok(sum > 24 && sum < 24 + 0.45 / Math.cos(lat * Math.PI / 180), `緯度 ±${lat} 第 ${d} 天 相加 ${sum}`);
    }
  }
});

test('永晝與永夜：朗伊爾城（78°N）夏至永晝、11 月中已是永夜；南極圈內相反', () => {
  assert.strictEqual(K.riseSet(C.longyearbyen.lat, C.longyearbyen.lon, day(6, 21), 1).polar, 'day');
  assert.strictEqual(K.riseSet(C.longyearbyen.lat, C.longyearbyen.lon, day(11, 13), 1).polar, 'night');
  assert.strictEqual(K.riseSet(-75, 0, day(6, 21), 0).polar, 'night');
  assert.strictEqual(K.riseSet(-75, 0, day(12, 21), 0).polar, 'day');
  assert.strictEqual(K.riseSet(C.taipei.lat, C.taipei.lon, day(6, 21), 8).polar, null);
});

test('晨昏線：線上每一點的太陽仰角都是 0°', () => {
  for (const [d, u] of [[172, 3], [355, 15.5], [100, 9]]) {
    const s = K.sun(d, u);
    for (let lon = -180; lon < 180; lon += 20) {
      const lat = K.terminatorLat(lon, s);
      near(K.altAz(lat, lon, d, u).alt, 0, 1e-6);
    }
  }
});

test('理想時區：每 15° 一區，±7.5° 為界；180° 兩側各半區，24 區的寬度加起來是 360°', () => {
  assert.strictEqual(K.zoneOf(121.56), 8);
  assert.strictEqual(K.zoneOf(-118.24), -8);
  assert.strictEqual(K.zoneOf(7.4), 0);
  assert.strictEqual(K.zoneOf(7.6), 1);
  assert.strictEqual(K.zoneOf(-7.4), 0);
  assert.strictEqual(K.zoneOf(179), 12);
  assert.strictEqual(K.zoneOf(-179), -12);
  assert.strictEqual(K.zoneOf(185), -12);
  let w = 0;
  for (let z = -12; z <= 12; z++) { const b = K.zoneBounds(z); w += b[1] - b[0]; for (let x = b[0] + 0.01; x < b[1]; x += 0.5) assert.strictEqual(K.zoneOf(x), z, '經度 ' + x); }
  near(w, 360, 1e-9);
});

test('同一時刻的日期：比例加起來是 1；UTC 11–13 點全世界幾乎同一天（只剩半個時區）', () => {
  for (let u = 0; u < 24; u += 0.25) {
    const sh = K.dateShares(200, u);
    near(sh.reduce((a, x) => a + x.frac, 0), 1, 1e-9);
    assert.ok(sh.length <= 2);
    if (sh.length === 2) assert.strictEqual(sh[1].day - sh[0].day, 1);
  }
  for (const u of [11, 11.5, 12.5, 12.99]) {
    const sh = K.dateShares(200, u), min = Math.min.apply(null, sh.map(x => x.frac));
    near(min, 7.5 / 360, 1e-9, 'UTC ' + u);
  }
  const s0 = K.dateShares(200, 0);
  near(s0[0].frac, 172.5 / 360, 1e-9, 'UTC 0 點：西經那一半（加上 −12 區）還在前一天');
});

test('午夜線：線的西邊比東邊早一天；它和換日線之間就是「新的一天」', () => {
  for (let u = 0.25; u < 24; u += 1) {
    const m = K.midnightLon(u);
    if (Math.abs(K.n180(m - 180)) < 1e-9 || Math.abs(K.n180(m + 180)) < 1e-9) continue;
    const w = K.local(200, u, K.zoneOf(m - 1)), e = K.local(200, u, K.zoneOf(m + 1));
    assert.strictEqual(e.day - w.day, 1, 'UTC ' + u);
    assert.ok(e.clock < 1.0001, '東邊剛過午夜');
  }
});

test('大圓：赤道上 90° 是地球周長的四分之一；臺北到洛杉磯約 1 萬 9 百公里', () => {
  near(K.gcDist([0, 0], [90, 0]), Math.PI * K.R_EARTH / 2, 1e-6);
  near(K.gcDist([0, 90], [123, -90]), Math.PI * K.R_EARTH, 1e-6);
  near(K.gcDist([C.taipei.lon, C.taipei.lat], [C.losangeles.lon, C.losangeles.lat]), 10910, 40);
  const A = [C.taipei.lon, C.taipei.lat], B = [C.newyork.lon, C.newyork.lat], D = K.gcDist(A, B);
  for (const f of [0.1, 0.37, 0.5, 0.9]) {
    const p = K.gcPoint(A, B, f);
    near(K.gcDist(A, p), f * D, 1e-6); near(K.gcDist(p, B), (1 - f) * D, 1e-6);
  }
  const mid = K.gcPoint(A, B, 0.5);
  assert.ok(mid[1] > 60, '臺北飛紐約的大圓會經過高緯度（' + mid[1].toFixed(1) + '°）');
});

test('飛行：抵達當地鐘點 − 起飛當地鐘點 = 飛行時間 + 兩地時差', () => {
  for (const [a, b, dur] of [['taipei', 'losangeles', 11.5], ['auckland', 'honolulu', 9], ['london', 'tokyo', 13], ['apia', 'pagopago', 0.75]]) {
    const F = K.flight(C[a], C[b], 317, 3.25, dur);
    near(F.clockDiff, dur + C[b].off - C[a].off, 1e-9, a + '→' + b);
  }
  const F = K.flight(C.taipei, C.losangeles, 317, 0, 11.5);
  assert.strictEqual(F.earlierClock, true, '往東跨過換日線：抵達的當地時刻比起飛還早');
  assert.strictEqual(F.westward, false);
  assert.strictEqual(K.flight(C.losangeles, C.taipei, 317, 0, 13).westward, true);
  const G = K.flight(C.apia, C.pagopago, 317, 3, 0.75);
  assert.ok(G.dist < 300 && G.earlierDate, '阿庇亞飛帕果帕果：不到 300 公里，日期退回一天');
});

test('飛行取樣：地方平時漂移、日出日落次數與逐點仰角一致', () => {
  const F = K.flight(C.taipei, C.london, 172, 14, 14);
  let rises = 0, sets = 0;
  for (let i = 1; i < F.path.length; i++) {
    const a = F.path[i - 1].alt, b = F.path[i].alt;
    near(b, K.altAz(F.path[i].lat, F.path[i].lon, 172, F.path[i].t).alt, 1e-9);
    if (a < K.H0 && b >= K.H0) rises++;
    if (a >= K.H0 && b < K.H0) sets++;
  }
  assert.strictEqual(F.sunrises, rises); assert.strictEqual(F.sunsets, sets);
  near(F.path[F.path.length - 1].t - F.path[0].t, 14, 1e-9);
  // 往西飛的經度變化 ≈ 經度差（展開後不跳 360°）
  near(F.dLonU, K.n180(C.london.lon - C.taipei.lon), 1e-6);
});

test('地點讀數：地方平時 = UTC + λ/15°；視太陽時 = 地方平時 + 均時差；臺北的鐘比地方平時慢約 6 分', () => {
  const P = K.place(C.taipei.lat, C.taipei.lon, 317, 2, 8);
  near(P.lmt, 2 + C.taipei.lon / 15, 1e-9);
  const e = K.sun(317, 2).eot;
  near(P.ast, P.lmt + e / 60, 1e-9);
  near(P.offMinusLmt * 60, -6.24, 0.01);
  near(P.clock, 10, 1e-12);
  const Q = K.place(C.newdelhi.lat, C.newdelhi.lon, 317, 2, C.newdelhi.off);
  near(Q.clock, 7.5, 1e-12, '新德里 +5:30');
});

test('快照：臺北 UTC 04:00 是 12:00；量測點在臺北時與臺北的地方平時差為 0', () => {
  const s = K.snapshot({ day: 317, utc: 4, probe: { lon: C.taipei.lon, lat: C.taipei.lat, city: 'taipei' } });
  near(s.taipei.clock, 12, 1e-9);
  assert.strictEqual(s.probe.lmtMinusTaipei, 0);
  assert.strictEqual(s.cities.taipei.clock, 12);
  assert.strictEqual(s.flight, null);
  near(s.probe.dSub, K.gcAngle([C.taipei.lon, C.taipei.lat], [s.sub.lon, s.sub.lat]) / K.DEG, 1e-3);
  // UTC 10:30：基里巴斯聖誕島（+14）已是後天、帕果帕果（−11）還在昨天，加上大多數城市的今天 → 三個日期
  const t = K.snapshot({ day: 317, utc: 10.5, probe: null });
  assert.strictEqual(t.cityDates, 3);
  assert.strictEqual(t.cities.kiritimati.day - t.cities.pagopago.day, 2);
});

test('城市資料：經緯度在合理範圍、官方時間與理想時區相差不超過 2 小時（換日線附近的島國例外）', () => {
  const ids = new Set();
  for (const c of K.CITIES) {
    assert.ok(!ids.has(c.id)); ids.add(c.id);
    assert.ok(Math.abs(c.lat) <= 90 && Math.abs(c.lon) <= 180, c.id);
    assert.ok(c.zh && c.en, c.id);
    const gap = Math.abs(c.off - K.zoneOf(c.lon));
    if (c.id === 'apia' || c.id === 'kiritimati') near(gap, 24, 2, c.id + '（官方時間在換日線的另一邊）');
    else assert.ok(gap <= 2, c.id + ' 差 ' + gap);
  }
});

console.log(`\n${passed} 項通過` + (process.exitCode ? '，有失敗' : ''));
