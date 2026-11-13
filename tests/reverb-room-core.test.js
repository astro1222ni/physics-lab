/* 迴響與音樂廳：物理核心的單元測試。用法：node tests/reverb-room-core.test.js */
'use strict';
const C = require('../js/reverb-room-core.js');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}
function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= tol)) throw new Error((msg || '') + ' 得到 ' + a + '，應為 ' + b + '（容許 ' + tol + '）'); }
function ok(c, msg) { if (!c) throw new Error(msg || '條件不成立'); }
const cfg = o => C.normalize(Object.assign(C.presetConfig('classroom'), o || {}));
const an = o => C.analyze(cfg(o));
const allMat = m => ({ floor: m, ceiling: m, front: m, back: m, left: m, right: m });

test('賽賓常數 0.161 = 24 ln10 / c（c = 343 m/s，誤差 0.1% 以內）', function () {
  near(24 * Math.LN10 / C.C_SOUND, C.K_SABINE, 0.161 * 0.001);
});

test('體積與表面積：9 × 8 × 3.2 m 的教室 V = 230.4 m³、S = 252.8 m²', function () {
  const a = an();
  near(a.V, 230.4, 1e-9); near(a.S, 252.8, 1e-9);
  const ar = C.areas(9, 8, 3.2);
  near(C.SURFACES.reduce((s, k) => s + ar[k], 0), a.S, 1e-9, '六面面積的和');
});

test('賽賓公式：A = Σ Sα + 每人 0.5 m²；手算教室 T60', function () {
  const a = an({ people: 35 });
  const A = 72 * 0.01 + 72 * 0.06 + 25.6 * 0.03 + 25.6 * 0.10 + 28.8 * 0.04 * 2 + 35 * 0.5;
  near(a.A, A, 1e-9, 'A');
  near(a.ts, 0.161 * 230.4 / A, 1e-12, 'T60');
});

test('體積加倍、總吸音量不變 → 賽賓 T60 加倍；吸音量加倍 → 減半', function () {
  near(C.sabine(400, 30) / C.sabine(200, 30), 2, 1e-12);
  near(C.sabine(200, 60) / C.sabine(200, 30), 0.5, 1e-12);
  near(C.eyring(400, 300, 0.1) / C.eyring(200, 300, 0.1), 2, 1e-12, '艾林也與 V 成正比');
});

test('每邊都放大 k 倍、材料不變：V × k³、A × k²，T60 × k（兩個公式都是）', function () {
  const a = an(), b = an({ L: 18, W: 16, H: 6.4 });
  near(b.ts / a.ts, 2, 1e-9, '賽賓'); near(b.te / a.te, 2, 1e-9, '艾林');
});

test('吸音很少時兩個公式幾乎相同：−ln(1 − ᾱ) ≈ ᾱ，相差約 ᾱ/2', function () {
  [0.001, 0.01, 0.03].forEach(function (ab) {
    const V = 500, S = 400;
    const r = C.eyring(V, S, ab) / C.sabine(V, ab * S);
    near(r, ab / -Math.log(1 - ab), 1e-12);
    near(1 - r, ab / 2, ab * ab, 'ᾱ = ' + ab);
  });
  const a = an({ mats: allMat('tile') });
  ok(Math.abs(a.diff) < 0.006, '全磁磚房間相差 ' + (a.diff * 100).toFixed(3) + '%');
});

test('全吸收（每一面都是開窗）：艾林 T60 = 0，賽賓仍是 0.161 V / S > 0', function () {
  const a = an({ mats: allMat('open') });
  near(a.abar, 1, 1e-12);
  ok(a.te === 0, '艾林 ' + a.te);
  near(a.ts, 0.161 * a.V / a.S, 1e-12, '賽賓');
  ok(a.images.every(m => m.level === null), '所有反射都消失');
});

test('艾林永遠不比賽賓長，吸音越多差越多', function () {
  let last = -1;
  [0.02, 0.1, 0.3, 0.6, 0.9].forEach(function (ab) {
    const te = C.eyring(1000, 600, ab), ts = C.sabine(1000, ab * 600);
    ok(te <= ts, 'ᾱ = ' + ab);
    const d = 1 - te / ts;
    ok(d > last, '差距沒有變大'); last = d;
  });
});

test('沒有吸音：賽賓與艾林都是無限大', function () {
  ok(C.sabine(100, 0) === Infinity); ok(C.eyring(100, 50, 0) === Infinity);
});

test('衰減曲線：t = T60 時 −60 dB，斜率 −60/T60 dB/s', function () {
  near(C.decayDb(1.7, 1.7), -60, 1e-12);
  near(C.decayDb(0.5, 2) - C.decayDb(0.25, 2), -7.5, 1e-12);
});

test('鏡像源個數：1 階 6 個、2 階 18 個', function () {
  const im = C.images(cfg(), 2);
  ok(im.filter(m => m.order === 1).length === 6, '1 階');
  ok(im.filter(m => m.order === 2).length === 18, '2 階');
  ok(C.images(cfg(), 1).length === 6);
});

test('鏡像源的位置：左牆（y = 0）的鏡像是 (x, −y, z)，後牆的是 (2L − x, y, z)', function () {
  const c = cfg(), P = C.positions(c), im = C.images(c, 1);
  const left = im.find(m => m.walls[0] === 'left'), back = im.find(m => m.walls[0] === 'back');
  near(left.img.y, -P.src.y, 1e-12); near(left.img.x, P.src.x, 1e-12);
  near(back.img.x, 2 * c.L - P.src.x, 1e-12); near(back.img.y, P.src.y, 1e-12);
});

test('路徑長 = 鏡像源到聽者的距離；反射點在牆上；入射角 = 反射角', function () {
  const c = cfg({ src: { u: 0.21, v: 0.33 }, lis: { u: 0.77, v: 0.64 } });
  C.images(c, 2).forEach(function (m) {
    near(C.pathLength(m.pts), m.r, 1e-9, '路徑 ' + m.k.join(','));
    ok(m.pts.length === m.order + 2, '反射點數');
    m.pts.slice(1, -1).forEach(function (p) {
      const onWall = { front: p.x, back: c.L - p.x, left: p.y, right: c.W - p.y, floor: p.z, ceiling: c.H - p.z }[p.wall];
      near(onWall, 0, 1e-9, '反射點不在 ' + p.wall + ' 上');
    });
  });
  // 1 階左牆反射：入射與反射的 y 分量相反、x 與 z 分量方向不變（鏡面反射）
  const m = C.images(c, 1).find(q => q.walls[0] === 'left');
  const a = m.pts[0], p = m.pts[1], b = m.pts[2];
  const d1 = { x: p.x - a.x, y: p.y - a.y, z: p.z - a.z }, d2 = { x: b.x - p.x, y: b.y - p.y, z: b.z - p.z };
  const n1 = Math.hypot(d1.x, d1.y, d1.z), n2 = Math.hypot(d2.x, d2.y, d2.z);
  near(d1.x / n1, d2.x / n2, 1e-9); near(d1.z / n1, d2.z / n2, 1e-9); near(d1.y / n1, -d2.y / n2, 1e-9);
});

test('地板反射的路徑長：√(d² + (z_s + z_r)²)（d 是水平距離）', function () {
  const c = cfg(), P = C.positions(c), m = C.images(c, 1).find(q => q.walls[0] === 'floor');
  const d = Math.hypot(P.src.x - P.lis.x, P.src.y - P.lis.y);
  near(m.r, Math.sqrt(d * d + Math.pow(P.src.z + P.lis.z, 2)), 1e-12);
});

test('反射的強度：能量乘上每面牆的 (1 − α)，再乘上 (r0/r)²', function () {
  const c = cfg({ mats: { floor: 'carpet', ceiling: 'plaster', front: 'wood', back: 'curtain', left: 'glass', right: 'panel' } });
  const a = C.analyze(c);
  a.images.forEach(function (m) {
    const g = m.walls.reduce((s, w) => s * (1 - C.alphaOf(c.mats[w])), 1);
    near(m.gain, g, 1e-12);
    near(m.level, 10 * Math.log10(g) + 20 * Math.log10(a.r0 / m.r), 1e-9);
  });
});

test('房間正中央、正方形平面：四面牆的第一次反射同時到達', function () {
  const a = an({ L: 10, W: 10, src: { u: 0.4, v: 0.4 }, lis: { u: 0.6, v: 0.6 } });
  near(a.latSpread, 0, 1e-9);
  const b = an({ L: 10, W: 8, src: { u: 0.4, v: 0.4 }, lis: { u: 0.6, v: 0.6 } });
  ok(b.latSpread > 1, '長方形就不同時 ' + b.latSpread);
});

test('臨界距離 r_c = √(A/16π) = 0.057 √(V/T)', function () {
  const a = an({ people: 20 });
  near(a.rc, Math.sqrt(a.A / (16 * Math.PI)), 1e-12);
  near(a.rc, Math.sqrt(0.161 / (16 * Math.PI)) * Math.sqrt(a.V / a.ts), 1e-12, '換成 V 與 T');
  near(a.rc, 0.057 * Math.sqrt(a.V / a.ts), a.rc * 0.01, '0.057 的近似（1% 內）');
});

test('人數上限：每平方公尺最多 2 人；超過會被限制', function () {
  ok(C.maxPeople(2.5, 1.8) === 9);
  const a = an({ L: 2.5, W: 1.8, people: 50 });
  ok(a.people === 9, a.people);
});

test('六個房間預設的 T60 在合理範圍', function () {
  const want = { classroom: [2.5, 4.5], bathroom: [1.2, 2.5], living: [0.4, 0.9], hall: [1.9, 2.4], cathedral: [5, 9], studio: [0.08, 0.3] };
  C.PRESET_KEYS.forEach(function (k) {
    const a = C.analyze(C.presetConfig(k));
    ok(a.ts >= want[k][0] && a.ts <= want[k][1], k + ' 賽賓 ' + a.ts.toFixed(2) + ' s');
    ok(a.te < a.ts, k + ' 艾林較短');
  });
});

test('事件資料沒有 NaN、Infinity；全吸收時用約定值', function () {
  const p = C.payload(an({ mats: allMat('open') }), { via: 't' });
  Object.keys(p).forEach(function (k) { if (typeof p[k] === 'number') ok(isFinite(p[k]), k + ' = ' + p[k]); });
  ok(p.te === 0 && p.open === 6 && p.mirror === -999 && p.itdg === -1);
});

test('normalize：缺欄位補預設、超出範圍限制在範圍內', function () {
  const o = C.normalize({ L: 999, W: -3, mats: { floor: 'gold' }, src: { u: 2 } });
  ok(o.L === 80 && o.W === 1.5 && o.mats.floor === C.DEFAULTS.mats.floor && o.src.u === 0.97 && o.lis.u === C.DEFAULTS.lis.u);
});

console.log('\n' + pass + ' 項通過' + (fail ? '，' + fail + ' 項失敗' : ''));
process.exit(fail ? 1 : 0);
