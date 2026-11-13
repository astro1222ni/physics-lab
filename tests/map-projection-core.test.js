// 以 Node 執行：node tests/map-projection-core.test.js
'use strict';
const assert = require('assert');
const K = require('../js/map-projection-core.js');
const W = require('../js/geog-world.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function near(a, b, abs, msg) { assert.ok(Math.abs(a - b) <= abs, (msg || '') + ` 期望 ${b} ± ${abs}，得到 ${a}`); }
const D = K.DEG;
const ALL = K.LIST.map(p => p.id);
const optFor = id => ({ id, lam0: 0, phiS: 45, phi1: 20, phi2: 50, phi0: 35 });

console.log('map-projection-core');

test('每個投影的正算與反算互為反函數（地圖範圍內 300 個點，誤差 < 1e-7 弧度）', () => {
  for (const id of ALL) {
    for (const lam0 of [0, 121]) {
      const P = K.make(Object.assign(optFor(id), { lam0 }));
      let n = 0;
      for (let i = 0; i < 300; i++) {
        const lam = K.wrapPi((i * 37.3 % 359 - 179) * D), phi = ((i * 23.7) % 170 - 85) * D;
        if (!P.valid(lam, phi)) continue;
        if (P.family === 'azi' && P.dist(lam, phi) > P.cmax - 1e-3) continue;
        if (P.family !== 'azi' && Math.abs(P.rel(lam)) > Math.PI - 1e-6) continue;
        const xy = P.forward(lam, phi), q = P.inverse(xy[0], xy[1]);
        assert.ok(q, id + ' 反算失敗 ' + [lam / D, phi / D]);
        near(K.wrapPi(q[0] - lam), 0, 1e-7, id + ' λ');
        near(q[1], phi, 1e-7, id + ' φ');
        n++;
      }
      assert.ok(n > 100, id + ' 測到的點太少：' + n);
    }
  }
});

test('麥卡托：h = k = sec φ（等角），面積比例 sec²φ；60° 剛好 4 倍', () => {
  const P = K.make({ id: 'mercator' });
  for (const f of [0, 20, 45, 60, 75, 80]) {
    const t = K.tissot(P, 30 * D, f * D);
    near(t.h, 1 / Math.cos(f * D), 1e-6, 'h@' + f);
    near(t.k, 1 / Math.cos(f * D), 1e-6, 'k@' + f);
    near(t.omega, 0, 1e-5, 'ω@' + f);
  }
  near(K.tissot(P, 0, 60 * D).s, 4, 1e-5);
  near(P.forward(0, 45 * D)[1], Math.log(Math.tan(67.5 * D)), 1e-12);
});

test('等距圓柱：經線比例 h = 1、緯線比例 k = sec φ；60° 時 ω = 2 asin(1/3) ≈ 38.94°', () => {
  const P = K.make({ id: 'equirect' });
  const t = K.tissot(P, 10 * D, 60 * D);
  near(t.h, 1, 1e-7); near(t.k, 2, 1e-6);
  near(t.omega / D, 2 * Math.asin(1 / 3) / D, 1e-5);
});

test('等積投影的面積比例處處等於 1（等積圓柱、正弦、莫爾維特、等地球、亞伯斯、蘭伯特等積方位）', () => {
  for (const id of ['cea', 'sinusoidal', 'mollweide', 'equalearth', 'albers', 'laea']) {
    for (const phiS of [0, 30, 45]) {
      const P = K.make({ id, phiS, phi1: 15, phi2: 55, phi0: 40, lam0: 60 });
      for (let i = 0; i < 40; i++) {
        const lam = ((i * 47) % 340 - 170) * D, phi = ((i * 29) % 160 - 80) * D;
        if (!P.valid(lam, phi)) continue;
        if (P.family === 'azi' && P.dist(lam, phi) > 170 * D) continue;
        near(K.tissot(P, lam, phi).s, 1, 2e-5, id + ' φs=' + phiS + ' @' + [lam / D, phi / D].map(v => v.toFixed(0)));
      }
    }
  }
});

test('高爾－彼得斯（φs = 45°）：45° 緯線上 h = k（形狀正確），赤道上南北拉長 2 倍', () => {
  const P = K.make({ id: 'cea', phiS: 45 });
  const t = K.tissot(P, 0, 45 * D);
  near(t.h, t.k, 1e-6); near(t.omega, 0, 1e-5);
  const e = K.tissot(P, 0, 0);
  near(e.h / e.k, 2, 1e-6);
});

test('等角投影的角度變形 ω = 0（麥卡托、蘭伯特等角圓錐、平射）', () => {
  for (const id of ['mercator', 'lcc', 'stereo']) {
    const P = K.make({ id, phi1: 10, phi2: 60, phi0: -20, lam0: -40 });
    for (let i = 0; i < 40; i++) {
      const lam = ((i * 53) % 340 - 170) * D, phi = ((i * 31) % 150 - 75) * D;
      if (!P.valid(lam, phi)) continue;
      near(K.tissot(P, lam, phi).omega, 0, 1e-4, id);
    }
  }
});

test('蘭伯特等角圓錐：標準緯線上比例剛好 1，兩線之間小於 1、之外大於 1', () => {
  const P = K.make({ id: 'lcc', phi1: 22, phi2: 25 });
  near(K.tissot(P, 0, 22 * D).k, 1, 1e-7);
  near(K.tissot(P, 0, 25 * D).k, 1, 1e-7);
  assert.ok(K.tissot(P, 0, 23.5 * D).k < 1);
  assert.ok(K.tissot(P, 0, 30 * D).k > 1);
  // 只有一條標準緯線：n = sin φ1
  near(K.make({ id: 'lcc', phi1: 30, phi2: 30 }).n, 0.5, 1e-12);
});

test('圓錐的極限：兩條標準緯線對稱於赤道，等角圓錐變麥卡托、等積圓錐變等積圓柱', () => {
  const L = K.make({ id: 'lcc', phi1: -20, phi2: 20 }), M = K.make({ id: 'mercator' });
  assert.ok(Math.abs(L.n) < 1e-6);
  const c = Math.cos(20 * D);
  for (const f of [0, 30, 60]) {
    near(L.forward(1, f * D)[1], c * M.forward(1, f * D)[1], 1e-9);
    near(K.tissot(L, 0.5, f * D).omega, 0, 1e-5);
  }
  near(K.tissot(L, 0, 20 * D).k, 1, 1e-7);
  const A = K.make({ id: 'albers', phi1: -30, phi2: 30 }), C = K.make({ id: 'cea', phiS: 30 });
  for (const f of [0, 40, 80]) near(A.forward(2, f * D)[1], C.forward(2, f * D)[1], 1e-12);
  // 接近對稱時，圓錐的結果連續地趨近圓柱
  const L2 = K.make({ id: 'lcc', phi1: -20, phi2: 20.0001 });
  near(K.tissot(L2, 0, 40 * D).k, K.tissot(L, 0, 40 * D).k, 1e-4);
});

test('方位投影的比例（c = 離中心的角距離）：平射 sec²(c/2)、心射 h = sec²c、k = sec c、正射 h = cos c、等距 h = 1、k = c／sin c', () => {
  const c = 50 * D;
  const at = id => K.tissot(K.make({ id, phi0: 90 }), 0.3, Math.PI / 2 - c);
  near(at('stereo').h, 1 / Math.cos(c / 2) ** 2, 1e-6);
  near(at('gnomonic').h, 1 / Math.cos(c) ** 2, 1e-5);
  near(at('gnomonic').k, 1 / Math.cos(c), 1e-6);
  near(at('ortho').h, Math.cos(c), 1e-6);
  near(at('ortho').k, 1, 1e-6);
  near(at('aeqd').h, 1, 1e-6);
  near(at('aeqd').k, c / Math.sin(c), 1e-6);
  near(at('laea').s, 1, 1e-6);
});

test('等距方位：地圖上到中心的距離 = 大圓距離（臺北為中心）', () => {
  const tp = [121.56 * D, 25.03 * D];
  const P = K.make({ id: 'aeqd', lam0: 121.56, phi0: 25.03 });
  for (const q of [[-74.0, 40.7], [-0.13, 51.5], [151.2, -33.9], [-58.4, -34.6]]) {
    const xy = P.forward(q[0] * D, q[1] * D);
    near(Math.hypot(xy[0], xy[1]), K.centralAngle(tp[0], tp[1], q[0] * D, q[1] * D), 1e-9);
  }
});

test('心射投影：大圓在地圖上是直線（臺北到舊金山，偏離 < 1e-9）', () => {
  const A = [121.56 * D, 25.03 * D], B = [-122.42 * D, 37.77 * D];
  const P = K.make({ id: 'gnomonic', lam0: 180, phi0: 45 });
  const pts = K.geodesic(A, B, 60).map(p => P.forward(p[0], p[1]));
  assert.ok(K.straightness(pts) < 1e-9);
  const M = K.make({ id: 'mercator', lam0: 180 });
  assert.ok(K.straightness(K.geodesic(A, B, 60).map(p => { const l = K.wrapPi(p[0] - Math.PI); return M.raw(l, p[1]); })) > 0.05, '麥卡托上大圓是彎的');
});

test('等角航線在麥卡托上是直線，方位角固定；沿赤道與沿經線時等於大圓', () => {
  const A = [121.56 * D, 25.03 * D], B = [-74.0 * D, 40.7 * D];
  const r = K.rhumb(A, B, 80);
  const M = K.make({ id: 'mercator', lam0: 180 });
  const pts = r.points.map(p => { let l = K.wrapPi(p[0] - Math.PI); return [l, p[1]]; });
  // 攤開經度後投影
  let prev = null;
  const xy = pts.map(p => { let l = p[0]; if (prev != null) { while (l - prev > Math.PI) l -= 2 * Math.PI; while (prev - l > Math.PI) l += 2 * Math.PI; } prev = l; return M.raw(l, p[1]); });
  assert.ok(K.straightness(xy) < 1e-9);
  assert.ok(r.dist > K.centralAngle(A[0], A[1], B[0], B[1]), '等角航線比大圓長');
  const E1 = [0, 0], E2 = [60 * D, 0];
  near(K.rhumb(E1, E2, 4).dist, K.centralAngle(0, 0, 60 * D, 0), 1e-12);
  near(K.rhumb([10 * D, -30 * D], [10 * D, 50 * D], 4).dist, 80 * D, 1e-12);
  near(K.bearing([0, 0], [0, 10 * D]), 0, 1e-12);
  near(K.bearing([0, 0], [10 * D, 0]), Math.PI / 2, 1e-12);
});

test('球面多邊形面積：八分之一球 = π/2；經緯網格四邊形接近 Δλ(sin φ2 − sin φ1)', () => {
  near(K.sphericalArea([[0, 0], [Math.PI / 2, 0], [0, Math.PI / 2]]), Math.PI / 2, 1e-12);
  // 用很密的緯線邊逼近經緯網格四邊形
  const ring = [];
  const f1 = 10 * D, f2 = 30 * D, l1 = 0, l2 = 40 * D;
  for (let i = 0; i <= 400; i++) ring.push([l1 + (l2 - l1) * i / 400, f1]);
  for (let i = 0; i <= 400; i++) ring.push([l2 - (l2 - l1) * i / 400, f2]);
  near(K.sphericalArea(ring), (l2 - l1) * (Math.sin(f2) - Math.sin(f1)), 1e-6);
});

test('陸塊的面積（Natural Earth 簡化輪廓）：格陵蘭約 213 萬 km²、非洲約 2,970 萬 km²、臺灣約 3.6 萬 km²', () => {
  const area = k => K.trueArea(W.decode(W.shapes[k]).map(p => [p[0] * D, p[1] * D]));
  const g = area('greenland'), a = area('africa'), t = area('taiwan'), au = area('australia');
  near(g / 1e6, 2.17, 0.12, '格陵蘭（官方 216.6 萬）');
  near(a / 1e6, 30.0, 1.2, '非洲（官方約 3,037 萬）');
  near(t / 1e4, 3.6, 0.2, '臺灣本島（約 3.58 萬）');
  near(au / 1e6, 7.65, 0.3, '澳洲大陸（約 769 萬）');
  near(a / g, 14, 1.0, '非洲約是格陵蘭的 14 倍');
});

test('把陸塊搬家：面積不變、中心到目的地、北方仍朝北', () => {
  const ring = W.decode(W.shapes.greenland).map(p => [p[0] * D, p[1] * D]);
  const c = K.centroid(ring);
  const to = [20 * D, 0];
  const moved = K.moveRing(ring, c, to);
  near(K.sphericalArea(moved), K.sphericalArea(ring), 1e-10);
  const c2 = K.centroid(moved);
  near(c2[0], to[0], 0.02); near(c2[1], to[1], 0.02);
  // 原本在中心正北方的點，搬過去以後還在正北方
  const north = K.moveRing([[c[0], c[1] + 5 * D]], c, to)[0];
  near(K.wrapPi(north[0] - to[0]), 0, 1e-9);
  assert.ok(north[1] > to[1]);
});

test('麥卡托讓格陵蘭（原位）看起來比真實大 10 倍以上；搬到赤道只放大不到 1.2 倍；等積投影永遠 1 倍', () => {
  const ring = W.decode(W.shapes.greenland).map(p => [p[0] * D, p[1] * D]);
  const M = K.make({ id: 'mercator' });
  const tr = K.trueArea(ring);
  assert.ok(K.mapArea(M, ring) / tr > 10);
  const c = K.centroid(ring);
  const eq = K.moveRing(ring, c, [c[0], 0]);
  assert.ok(K.mapArea(M, eq) / tr < 1.2);
  for (const id of ['cea', 'mollweide', 'equalearth', 'albers']) near(K.mapArea(K.make({ id, phiS: 45, phi1: 20, phi2: 50 }), ring) / tr, 1, 2e-3, id);
});

test('羅賓森：表的節點值正確；不是等積也不是等角（格陵蘭附近面積與角度都有變形）', () => {
  near(K.robX(60), 0.7986, 1e-12); near(K.robY(60), 0.7346, 1e-12); near(K.robX(50), 0.8679, 1e-12); near(K.robY(90), 1, 1e-12);
  const t = K.tissot(K.make({ id: 'robinson' }), -40 * D, 72 * D);
  assert.ok(Math.abs(t.s - 1) > 0.1 && t.omega > 10 * D);
});

test('外框與範圍：麥卡托是正方形；莫爾維特是 2:1 的橢圓；正射是單位圓', () => {
  const b = K.bounds(K.outline(K.make({ id: 'mercator' })));
  near((b[2] - b[0]) / (b[3] - b[1]), 1, 1e-6);
  const m = K.bounds(K.outline(K.make({ id: 'mollweide' })));
  near((m[2] - m[0]) / (m[3] - m[1]), 2, 1e-9);
  const o = K.bounds(K.outline(K.make({ id: 'ortho', phi0: 10 })));
  near(o[2], 1, 1e-9);
});

console.log(`  共 ${passed} 項通過`);
