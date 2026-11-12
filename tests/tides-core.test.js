// 以 Node 執行：node tests/tides-core.test.js
'use strict';
const assert = require('assert');
const K = require('../js/tides-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function close(a, b, tol, msg) {
  const t = tol * Math.max(Math.abs(a), Math.abs(b), 1e-300);
  assert.ok(Math.abs(a - b) <= t, (msg || '') + ` 期望 ${b}，得到 ${a}`);
}
function near(a, b, abs, msg) { assert.ok(Math.abs(a - b) <= abs, (msg || '') + ` 期望 ${b} ± ${abs}，得到 ${a}`); }
const DEG = Math.PI / 180;
const R = K.R_EARTH;
const dirOf = (lat, lon) => [Math.cos(lat * DEG) * Math.cos(lon * DEG), Math.cos(lat * DEG) * Math.sin(lon * DEG), Math.sin(lat * DEG)];

console.log('tides-core');

test('常數與 NASA 資料表一致：地表重力 g = GM⊕/R² ≈ 9.820 m/s²', () => {
  near(K.G_SURF, 9.820, 0.002, 'g');
  near(K.R_EARTH, 6.371e6, 1, 'R');
  near(K.M_MOON / K.M_EARTH, 0.0123, 0.0001, '月球質量比');
});

test('太陽與月球的引潮力比約 0.46（質量比 × 距離比的立方）', () => {
  const r = K.sunMoonRatio();
  near(r, 0.46, 0.005, '比值');
  close(r, K.subPointAccel(K.M_SUN, K.AU) / K.subPointAccel(K.M_MOON, K.A_MOON), 1e-12, '與月下點引潮力之比相同');
  close(r, K.H_SUN / K.H_MOON, 1e-12, '與平衡潮高度之比相同');
  // 但太陽的引力本身比月球大約 178 倍：潮汐看的是「差」
  const pull = (K.M_SUN / K.AU ** 2) / (K.M_MOON / K.A_MOON ** 2);
  assert.ok(pull > 170 && pull < 185, '太陽引力是月球的 ' + pull + ' 倍');
});

test('月球在月下點的引潮力約 1.1 × 10^-6 m/s²，約為重力的千萬分之一', () => {
  const a = K.subPointAccel(K.M_MOON, K.A_MOON);
  near(a, 1.10e-6, 0.01e-6, '大小');
  near(a / K.G_SURF, 1.12e-7, 0.01e-7, '相對 g');
});

test('引潮力與距離的立方成反比（不是平方）', () => {
  for (const k of [0.5, 2, 3, 10]) {
    close(K.subPointAccel(K.M_MOON, K.A_MOON * k) / K.subPointAccel(K.M_MOON, K.A_MOON), 1 / (k * k * k), 1e-12, '近似式 k=' + k);
    close(K.eqHeight(K.M_MOON, K.A_MOON * k) / K.H_MOON, 1 / (k * k * k), 1e-12, '潮高 k=' + k);
  }
  // 精確的差分重力：距離加倍時趨近 1/8（d ≫ R），與 1/4（平方反比）明顯不同
  const ex = (d) => K.len(K.tidalAccelExact(K.M_MOON, [d, 0, 0], [R, 0, 0]));
  const q = ex(2 * K.A_MOON) / ex(K.A_MOON);
  near(q, 1 / 8, 0.004, '精確式 2 倍距離');
  // 越遠越接近 1/8
  const q2 = ex(200 * R) / ex(100 * R);
  near(q2, 1 / 8, 0.002, '100R → 200R');
});

test('精確的差分重力與一階近似：月下點相差約 3R/(2d)，對蹠點與側面也吻合', () => {
  const d = K.A_MOON, M = K.M_MOON, D = [d, 0, 0];
  const near1 = K.tidalAccelExact(M, D, [R, 0, 0]), far1 = K.tidalAccelExact(M, D, [-R, 0, 0]);
  const ap = K.subPointAccel(M, d);
  close(near1[0], ap, 3 * R / d, '月下點');
  close(-far1[0], ap, 3 * R / d, '對蹠點');
  assert.ok(near1[0] > 0 && far1[0] < 0, '月下點向月球、對蹠點背離月球：兩邊都向外');
  assert.ok(near1[0] > -far1[0], '精確式中月下點稍大（月球那側比較近）');
  // 側面：指向地心，大小約 GMR/d³
  const side = K.tidalAccelExact(M, D, [0, R, 0]);
  close(side[1], -ap / 2, 0.02, '側面向內');
  // 一階近似：任意點與精確式相對誤差 < 4R/d
  for (const [la, lo] of [[0, 0], [30, 50], [-45, 170], [80, -20], [10, 90]]) {
    const r = K.scale(dirOf(la, lo), R);
    const a = K.tidalAccelExact(M, D, r), b = K.tidalAccelApprox(M, D, r);
    assert.ok(K.len(K.sub(a, b)) < 4 * R / d * ap, '近似誤差 ' + la + ',' + lo);
  }
});

test('潮汐隆起在月下點與對蹠點，最低在兩者之間的大圓上', () => {
  for (const [psi, dec] of [[0, 0], [70, 15], [200, -25], [123, 28.58]]) {
    const p = { dec: dec, dist: 1, sun: false };
    let best = -Infinity, bestDir = null, worst = Infinity;
    for (let la = -90; la <= 90; la += 1) for (let lo = 0; lo < 360; lo += 1) {
      const rh = dirOf(la, lo), h = K.heightDir(p, psi, rh).total;
      if (h > best) { best = h; bestDir = rh; }
      if (h < worst) worst = h;
    }
    const m = K.moonDir(psi, dec);
    const c = Math.abs(K.dot(bestDir, m));
    assert.ok(c > Math.cos(1.5 * DEG), '最高點沿月球方向（cos = ' + c + '）');
    close(best, K.H_MOON, 1e-3, '月下點高度');
    close(K.heightDir(p, psi, K.scale(m, -1)).total, K.H_MOON, 1e-12, '對蹠點一樣高');
    close(worst, -K.H_MOON / 2, 1e-3, '最低 −H/2');
    // 與月球方向垂直的大圓上都是 −H/2
    const perp = K.unit(K.cross(m, [0, 0, 1]).every(x => x === 0) ? [1, 0, 0] : K.cross(m, [0, 0, 1]));
    close(K.heightDir(p, psi, perp).total, -K.H_MOON / 2, 1e-12, '垂直方向');
  }
});

test('平衡潮高度：月球約 0.36 m、太陽約 0.16 m；全球平均為零（海水只是搬家）', () => {
  near(K.H_MOON, 0.357, 0.002, 'H☾');
  near(K.H_SUN, 0.164, 0.002, 'H☉');
  // 球面積分：∫ η dΩ = 0（P2 的平均為 0），用細格點的中點法
  const p = { dec: 17, dist: 1.1, sun: true };
  let s = 0, w = 0;
  const N = 360, M = 720;
  for (let i = 0; i < N; i++) {
    const la = -90 + (i + 0.5) * 180 / N, cw = Math.cos(la * DEG);
    for (let j = 0; j < M; j++) {
      const lo = (j + 0.5) * 360 / M;
      s += K.heightDir(p, 77, dirOf(la, lo)).total * cw; w += cw;
    }
  }
  near(s / w, 0, 1e-5, '平均');
});

test('引潮力的水平分量 = g × 海面的坡度（平衡潮的意思：水平方向的力被坡度平衡）', () => {
  const p = { dec: 12, dist: 1, sun: true }, psi = 33;
  for (const [la, lo] of [[10, 20], [40, 100], [-30, 250], [60, 0]]) {
    const rh = dirOf(la, lo);
    const a = K.splitVR(K.forceDir(p, psi, rh, false), rh).h;
    // 數值求 η 在東、北方向的梯度
    const e = [-Math.sin(lo * DEG), Math.cos(lo * DEG), 0];
    const n = [-Math.sin(la * DEG) * Math.cos(lo * DEG), -Math.sin(la * DEG) * Math.sin(lo * DEG), Math.cos(la * DEG)];
    const hd = 1e-4;
    const dE = (K.heightDir(p, psi, dirOf(la, lo + hd / Math.cos(la * DEG) / DEG)).total - K.heightDir(p, psi, dirOf(la, lo - hd / Math.cos(la * DEG) / DEG)).total) / (2 * hd * R);
    const dN = (K.heightDir(p, psi, dirOf(la + hd / DEG, lo)).total - K.heightDir(p, psi, dirOf(la - hd / DEG, lo)).total) / (2 * hd * R);
    close(K.dot(a, e), K.G_SURF * dE, 1e-4, '東向');
    close(K.dot(a, n), K.G_SURF * dN, 1e-4, '北向');
  }
});

test('引潮力的水平分量在月下點與對蹠點為零、在 45° 處最大，指向隆起', () => {
  const p = { dec: 0, dist: 1, sun: false };
  const hAt = (lon) => K.splitVR(K.forceDir(p, 0, dirOf(0, lon), false), dirOf(0, lon)).h;
  assert.ok(K.len(hAt(0)) < 1e-20 && K.len(hAt(180)) < 1e-20, '月下點、對蹠點');
  let best = 0, at = 0;
  for (let lo = 0; lo <= 90; lo += 0.5) { const L = K.len(hAt(lo)); if (L > best) { best = L; at = lo; } }
  near(at, 45, 0.5, '最大在 45°');
  close(best, 1.5 * K.subPointAccel(K.M_MOON, K.A_MOON) / 2, 1e-9, '大小 3GMR/(2d³)');
  // 東向分量：經度 30° 向西（朝月下點，經度 0），經度 150° 向東（朝對蹠點，經度 180）
  const east = (lon) => K.dot(hAt(lon), [-Math.sin(lon * DEG), Math.cos(lon * DEG), 0]);
  assert.ok(east(30) < 0 && east(150) > 0 && east(-30) > 0 && east(-150) < 0, '指向最近的隆起');
});

test('上弦、下弦時潮差最小（小潮），朔、望時最大（大潮）；比值約 (H☾+H☉)/(H☾−H☉)', () => {
  const p = { dec: 0, dist: 1, sun: true };
  let mn = Infinity, mnAt = 0, mx = -Infinity, mxAt = 0;
  for (let psi = 0; psi < 360; psi += 1) {
    const r = K.dayRange(p, 0, psi, 0).range;
    if (r < mn) { mn = r; mnAt = psi; }
    if (r > mx) { mx = r; mxAt = psi; }
  }
  assert.ok(Math.abs(K.wrap180(mnAt - 90)) <= 2 || Math.abs(K.wrap180(mnAt - 270)) <= 2, '最小在上下弦，得到 ' + mnAt);
  // 最大值附近非常平坦（一天之中 ψ 本身就移動 ±6°），容許 ±8°
  assert.ok(Math.abs(K.wrap180(mxAt)) <= 8 || Math.abs(K.wrap180(mxAt - 180)) <= 8, '最大在朔望，得到 ' + mxAt);
  const ideal = (K.H_MOON + K.H_SUN) / (K.H_MOON - K.H_SUN);
  near(mx / mn, ideal, 0.08, '比值');
  // 赤道上大潮潮差 ≈ 1.5(H☾+H☉)，小潮 ≈ 1.5(H☾−H☉)（一天中月相略有移動，所以只要求接近）
  near(mx, 1.5 * (K.H_MOON + K.H_SUN), 0.01, '大潮潮差');
  near(mn, 1.5 * (K.H_MOON - K.H_SUN), 0.01, '小潮潮差');
});

test('只有月球時，相鄰兩次高潮相隔 12 小時 25 分（半個太陰日），與緯度、赤緯無關', () => {
  near(K.HIGH_INTERVAL * 60, 12 * 60 + 25.2, 0.1, '12 h 25 min');
  for (const [lat, dec] of [[0, 0], [23.5, 0], [23.5, 20], [-40, -15], [55, 5]]) {
    const r = K.extrema({ dec: dec, dist: 1, sun: false }, lat, 50, 0, 75).highs;
    assert.ok(r.length >= 5, '高潮次數');
    for (let i = 1; i < r.length; i++) near(r[i].t - r[i - 1].t, K.HIGH_INTERVAL, 1e-6, 'lat ' + lat + ' dec ' + dec);
  }
});

test('月球每天晚約 50 分鐘上中天；只有月球時高潮就在上中天與下中天', () => {
  near((K.LUNAR_DAY - 24) * 60, 50.5, 0.1, '50 分鐘');
  const t1 = K.nextTransit(40, 0), t2 = K.nextTransit(40, t1 + 1e-6);
  near(t2 - t1, K.LUNAR_DAY, 1e-9, '太陰日');
  near(K.moonHourAngle(K.ltAt(t1), K.psiAt(40, t1)), 0, 1e-9, '上中天時時角為 0');
  // 上弦（ψ = 90°）傍晚 18 時上中天、滿月半夜、新月中午
  near(K.moonHourAngle(18, 90), 0, 1e-9, '上弦月 18 時');
  near(K.moonHourAngle(0, 180), 0, 1e-9, '滿月 0 時');
  near(K.moonHourAngle(12, 0), 0, 1e-9, '新月 12 時');
  const hs = K.extrema({ dec: 10, dist: 1, sun: false }, 23.5, 40, 0, 26).highs;
  const ha = hs.map(e => Math.abs(K.moonHourAngle(K.ltAt(e.t), K.psiAt(40, e.t))));
  ha.forEach(h => assert.ok(h < 1e-5 || Math.abs(h - 180) < 1e-5, '時角 ' + h));
});

test('有太陽時，高潮的間隔在大潮附近較短（約 12 時 17 分）、小潮附近較長（約 12 時 49 分）', () => {
  const p = { dec: 0, dist: 1, sun: true };
  const gap = (psi) => { const h = K.extrema(p, 0, psi, -13, 13).highs; return (h[1].t - h[0].t) * 60; };
  const g0 = gap(0), g90 = gap(90);
  near(g0, 737, 3, '大潮');
  near(g90, 769, 3, '小潮');
});

test('赤緯為 0 時一天兩次高潮一樣高；赤緯不為 0 時出現日潮不等，赤道上卻沒有', () => {
  for (const lat of [0, 23.5, -35, 50]) {
    const h = K.extrema({ dec: 0, dist: 1, sun: false }, lat, 10, 0, 50).highs;
    for (let i = 1; i < h.length; i++) near(h[i].h, h[0].h, 1e-12, '赤緯 0，緯度 ' + lat);
  }
  const h = K.extrema({ dec: 20, dist: 1, sun: false }, 30, 10, 0, 26).highs;
  assert.ok(Math.abs(h[1].h - h[0].h) > 0.2, '日潮不等 ' + Math.abs(h[1].h - h[0].h));
  // 北半球、月球在北方：上中天那次較高
  const up = h.find(e => Math.abs(K.moonHourAngle(K.ltAt(e.t), K.psiAt(10, e.t))) < 1);
  const dn = h.find(e => Math.abs(K.moonHourAngle(K.ltAt(e.t), K.psiAt(10, e.t))) > 179);
  assert.ok(up.h > dn.h, '上中天較高');
  // 月球在南方（赤緯 −20°）：北半球下中天那次較高（對蹠點的隆起偏向北方）
  const h2 = K.extrema({ dec: -20, dist: 1, sun: false }, 30, 10, 0, 26).highs;
  const up2 = h2.find(e => Math.abs(K.moonHourAngle(K.ltAt(e.t), K.psiAt(10, e.t))) < 1);
  const dn2 = h2.find(e => Math.abs(K.moonHourAngle(K.ltAt(e.t), K.psiAt(10, e.t))) > 179);
  assert.ok(dn2.h > up2.h, '下中天較高');
  const he = K.extrema({ dec: 25, dist: 1, sun: false }, 0, 10, 0, 50).highs;
  for (let i = 1; i < he.length; i++) near(he[i].h, he[0].h, 1e-12, '赤道');
});

test('緯度與赤緯加起來達 90° 以上時，一天只有一次高潮（全日潮）', () => {
  const p = (dec) => ({ dec: dec, dist: 1, sun: false });
  assert.strictEqual(K.highsPerLunarDay(p(28), 65, 0, 0), 1, '65° + 28°');
  assert.strictEqual(K.highsPerLunarDay(p(-28), -63, 0, 0), 1, '南半球');
  assert.strictEqual(K.highsPerLunarDay(p(28), 60, 0, 0), 2, '60° + 28° < 90°');
  assert.strictEqual(K.highsPerLunarDay(p(10), 23.5, 0, 0), 2, '臺灣');
});

test('極點：海面一整天不漲不落（太陽在赤道上、月球赤緯固定）', () => {
  for (const lat of [90, -90]) {
    const d = K.dayRange({ dec: 20, dist: 1, sun: true }, lat, 40, 0);
    near(d.range, 0, 1e-12, '潮差');
    assert.strictEqual(d.highs.length, 0, '沒有高潮');
  }
});

test('緯度超過 54.7° 且赤緯為 0：連高潮都低於平均海面', () => {
  const h = K.extrema({ dec: 0, dist: 1, sun: true }, 56, 0, 0, 30).highs;
  h.forEach(e => assert.ok(e.h < 0, '高潮 ' + e.h));
  const h2 = K.extrema({ dec: 0, dist: 1, sun: true }, 53, 0, 0, 30).highs;
  assert.ok(h2.some(e => e.h > 0), '53° 時高潮高於平均');
  near(Math.acos(Math.sqrt(1 / 3)) / DEG, 54.7356, 1e-4, 'P2 的零點');
});

test('解析的 dη/dt 與數值差分一致', () => {
  const p = { dec: 18, dist: 0.9, sun: true };
  for (const t of [0.3, 5.7, 13.1, 40.2]) {
    const h = 1e-4;
    const num = (K.heightT(p, 33, 25, t + h) - K.heightT(p, 33, 25, t - h)) / (2 * h);
    close(K.dHeightDt(p, 33, 25, t), num, 1e-6, 't = ' + t);
  }
});

test('沿赤道一圈的高低差：解析式與數值一致；月球拉遠到 (1/0.459)^(1/3) 倍且在上弦時剛好抵消', () => {
  for (const [dec, dist, psi, sun] of [[0, 1, 0, true], [15, 1, 40, true], [-20, 0.8, 130, true], [5, 1.4, 300, false]]) {
    const p = { dec: dec, dist: dist, sun: sun };
    let hi = -Infinity, lo = Infinity;
    for (let a = 0; a < 360; a += 0.25) { const h = K.heightDir(p, psi, dirOf(0, a)).total; hi = Math.max(hi, h); lo = Math.min(lo, h); }
    close(K.equatorRange(p, psi), hi - lo, 1e-5, '赤道 ' + dec + ',' + dist + ',' + psi);
  }
  const x = Math.cbrt(1 / K.sunMoonRatio());
  near(x, 1.296, 0.001, '距離倍數');
  near(K.equatorRange({ dec: 0, dist: x, sun: true }, 90), 0, 1e-12, '抵消');
  near(K.equatorRange({ dec: 0, dist: x, sun: true }, 0), 1.5 * 2 * K.H_SUN, 1e-9, '同樣的距離在朔時加倍');
});

test('月相事件：ψ 經過 0°、90°、180°、270° 的時刻；月齡', () => {
  const ev = K.phaseEvents(40, 0, 24 * 30);
  assert.deepStrictEqual(ev.map(e => e.kind), ['fq', 'full', 'lq', 'new']);
  ev.forEach(e => near(K.norm360(K.psiAt(40, e.t) + 1e-9) % 90, 0, 1e-6, e.kind));
  near(ev[3].t - ev[1].t, 24 * K.P_SYN / 2, 1e-9, '望到朔半個月');
  near(K.moonAge(180), K.P_SYN / 2, 1e-12, '滿月');
});

test('全球極值：月球單獨時最高 H、最低 −H/2', () => {
  const g = K.globalExtremes({ dec: 0, dist: 1, sun: false }, 0);
  close(g.hi, K.H_MOON, 1e-9, '最高');
  close(g.lo, -K.H_MOON / 2, 1e-9, '最低');
});

console.log(`${passed} 個測試通過`);
