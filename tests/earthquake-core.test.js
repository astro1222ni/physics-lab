// 以 Node 執行：node tests/earthquake-core.test.js
'use strict';
const assert = require('assert');
const Q = require('../js/earthquake-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function close(a, b, tol, msg) {
  const t = tol * Math.max(Math.abs(a), Math.abs(b), 1);
  assert.ok(Math.abs(a - b) <= t, (msg || '') + ` 期望 ${b}，得到 ${a}`);
}
function near(a, b, tolAbs, msg) { assert.ok(Math.abs(a - b) <= tolAbs, (msg || '') + ` 期望 ${b} ± ${tolAbs}，得到 ${a}`); }
const DEG = Math.PI / 180;

console.log('earthquake-core');

// ---------------- 一、波速、走時、S−P ----------------
test('S−P 換算距離：R = Δt·VpVs/(Vp − Vs)，與走時互為反函數', () => {
  close(Q.kFactor(6, 3.5), 8.4, 1e-15, '預設地殼 k');
  close(Q.kFactor(6, 6 / Math.sqrt(3)), 6 / (Math.sqrt(3) - 1), 1e-15, 'Vp/Vs = √3 時 k = Vp/(√3 − 1)');
  for (const [vp, vs] of [[6, 3.5], [5.5, 3.2], [8, 4.5], [6.2, 3.58]]) {
    for (const R of [0.5, 12, 87.3, 300]) {
      const dt = Q.spFromDistance(R, vp, vs);
      close(dt, R / vs - R / vp, 1e-15, 'Δt');
      close(Q.distanceFromSP(dt, vp, vs), R, 1e-13, '換回距離');
    }
  }
  // 「約 8 km/s × Δt」的經驗法則：Vp = 6、Vp/Vs = √3 時 k = 8.196
  near(Q.kFactor(6, 6 / Math.sqrt(3)), 8.2, 0.01, '經驗法則');
});

test('走時與距離成正比（tP、tS、S−P 都 ∝ R）；S 一定比 P 晚到', () => {
  const vp = 6, vs = 3.5;
  const base = Q.arrivals(30, 10, vp, vs);
  for (const k of [0.5, 2, 3.7]) {
    const a = Q.arrivals(30 * k, 10 * k, vp, vs);
    close(a.R, base.R * k, 1e-14, 'R');
    close(a.tP, base.tP * k, 1e-14, 'tP');
    close(a.tS, base.tS * k, 1e-14, 'tS');
    close(a.sp, base.sp * k, 1e-14, 'S−P');
    assert.ok(a.tS > a.tP);
  }
  close(base.R, Math.hypot(30, 10), 1e-15, '震源距離 = √(Δ² + h²)');
  close(Q.epicentral(base.R, 10), 30, 1e-13, '震央距離 = √(R² − h²)');
});

test('表面波一定比 S 波晚到（tR = h/Vs + Δ/V_R ≥ R/Vs）', () => {
  for (const d of [0, 1, 10, 60, 150, 400]) for (const h of [0.5, 5, 15, 40]) {
    const a = Q.arrivals(d, h, 6, 3.5);
    assert.ok(a.tR >= a.tS - 1e-12, `Δ=${d} h=${h}`);
  }
});

test('彈性介質：Vp/Vs = √3 ⇔ 帕松比 0.25；液體 μ = 0 → Vs = 0；K > 0 ⇔ Vp/Vs > 2/√3', () => {
  close(Q.poisson(Math.sqrt(3), 1), 0.25, 1e-15, 'ν');
  close(Q.poisson(6, 3.5), (36 / 12.25 - 2) / (2 * (36 / 12.25 - 1)), 1e-15);
  const m = Q.moduli(6, 3.5, 2.7);
  close(m.mu, 2.7 * 12.25, 1e-15, 'μ = ρVs²');
  const back = Q.speedsFromModuli(m.K, m.mu, 2.7);
  close(back.vp, 6, 1e-14); close(back.vs, 3.5, 1e-14);
  const liquid = Q.speedsFromModuli(2.25, 0, 1.0); // 水：K = 2.25 GPa
  close(liquid.vp, 1.5, 1e-14, '水的 P 波速'); assert.strictEqual(liquid.vs, 0);
  assert.ok(Q.validSpeeds(6, 3.5));
  assert.ok(!Q.validSpeeds(6, 5.3), 'Vp/Vs < 2/√3 代表 K < 0，不可能');
  assert.ok(Q.validSpeeds(6, 5.19));
});

test('雷利波：帕松固體 V_R/Vs = √(2 − 2/√3) = 0.9194；地表水平/垂直振幅比 0.681；不可壓縮極限 0.9553', () => {
  close(Q.rayleighXi(Math.sqrt(3)), Math.sqrt(2 - 2 / Math.sqrt(3)), 1e-12, 'ξ');
  assert.ok(Math.abs(Q.rayleighEq(Q.rayleighXi(1.8), 1.8)) < 1e-12, '雷利方程式的殘差');
  near(Q.rayleighEigen(Math.sqrt(3), 1, 0).hv, 0.6812, 2e-4, 'H/V');
  near(Q.rayleighXi(1e7), 0.95531, 2e-5, 'ν → 0.5');
  // 隨 Vp/Vs 增加，V_R/Vs 單調增加（介於 0.87 與 0.955 之間）
  let prev = 0;
  for (const k of [1.42, 1.5, Math.sqrt(3), 2, 3, 5]) { const x = Q.rayleighXi(k); assert.ok(x > prev && x > 0.86 && x < 0.956); prev = x; }
  // 深處：水平分量在約 0.19 個波長處變號（逆行 → 順行），垂直分量一直同號
  const e1 = Q.rayleighEigen(Math.sqrt(3), 1, 0.1), e2 = Q.rayleighEigen(Math.sqrt(3), 1, 0.3);
  assert.ok(e1.h > 0 && e2.h < 0 && e1.v > 0 && e2.v > 0);
});

test('剖面模型：P 波位移沿射線方向（縱波）、S 波垂直射線（橫波），波到之前質點不動', () => {
  const o = { vp: 6, vs: 3.5, h: 15 };
  for (const [x, d] of [[40, 5], [-25, 30], [80, 0], [3, 12]]) {
    const R = Math.hypot(x, 15 - d), rx = x / R, ry = (15 - d) / R;
    const before = Q.sectionDisp(x, d, R / 6 - 0.01, o);
    assert.ok(before.P.ux === 0 && before.S.ux === 0 && before.P.uy === 0);
    const u = Q.sectionDisp(x, d, R / 6 + 0.3, o);
    close(u.P.ux * ry - u.P.uy * rx, 0, 1e-12, 'P 垂直射線的分量為 0');
    const w = Q.sectionDisp(x, d, R / 3.5 + 0.4, o);
    close(w.S.ux * rx + w.S.uy * ry, 0, 1e-12, 'S 沿射線的分量為 0');
    assert.ok(Math.hypot(w.S.ux, w.S.uy) > 0);
  }
});

test('地震儀紀錄是因果的：P 到達前只有 0；S 到達瞬間才開始有 S 波', () => {
  const o = { vp: 6, vs: 3.5, h: 15, delta: 60 };
  const a = Q.arrivals(60, 15, 6, 3.5);
  const s0 = Q.station1(a.tP - 1e-6, o); assert.ok(s0.z === 0 && s0.h === 0);
  const s1 = Q.station1(a.tP + 0.2, o); assert.ok(Math.abs(s1.z) + Math.abs(s1.h) > 0);
  assert.ok(Q.station1(a.tS - 1e-6, o).u.S.ux === 0);
  // 模式二的示意紀錄：無雜訊時 P 到達前為 0
  const tr = Q.makeTrace({ tP: a.tP, tS: a.tS, tR: a.tR, R: a.R, delta: 60, h: 15, seed: 3, noise: 0 });
  assert.ok(tr(a.tP - 1e-6) === 0);
  assert.ok(Math.abs(tr(a.tP + 0.15)) > 0);
});

test('一維界面：反射＋透射的能量守恆 r² + (Z2/Z1)τ² = 1；位移連續 1 + r = τ；S 波遇液體全反射', () => {
  for (const [r1, v1, r2, v2] of [[2.7, 6, 1, 1.5], [2.7, 3.5, 2.7, 3.5], [2.7, 6, 3.3, 8], [1, 1.5, 2.7, 6]]) {
    const c = Q.interfaceCoeffs(r1, v1, r2, v2);
    close(c.Er + c.Et, 1, 1e-14, '能量');
    close(1 + c.r, c.t, 1e-14, '位移連續');
  }
  const same = Q.interfaceCoeffs(2.7, 3.5, 2.7, 3.5);
  close(same.r, 0, 1e-15); close(same.t, 1, 1e-15);
  const sLiquid = Q.interfaceCoeffs(2.7, 3.5, 1.0, 0);
  close(sLiquid.r, 1, 1e-15, 'S 波全反射'); assert.strictEqual(sLiquid.t, 0);
  // 解析解：液體一側（x > L1）沒有 S 波位移；P 波可以穿過（波速變慢 → 走得比較慢）
  const f = Q.pulse(1.2), L1 = 30;
  for (const t of [3, 9, 12, 20]) for (const x of [31, 35, 45]) assert.strictEqual(Q.chainDisp(x, t, L1, 3.5, 0, sLiquid, f), 0);
  const cP = Q.interfaceCoeffs(2.7, 6, 1.0, 1.5);
  const tArr = L1 / 6 + 5 / 1.5; // 在 x = 35 的到達時間
  assert.strictEqual(Q.chainDisp(35, tArr - 0.01, L1, 6, 1.5, cP, f), 0);
  assert.ok(Math.abs(Q.chainDisp(35, tArr + 0.3, L1, 6, 1.5, cP, f)) > 0);
  // 界面兩側位移連續（解析解在 x = L1 兩側相等）
  for (const t of [5.1, 5.4, 5.7]) close(Q.chainDisp(L1, t, L1, 6, 1.5, cP, f), Q.chainDisp(L1 + 1e-9, t, L1, 6, 1.5, cP, f), 1e-6, '位移連續');
});

// ---------------- 二、地圖與定位 ----------------
test('地圖投影：往返一致；臺北－高雄的平面距離與大圓距離相差 < 1.5%', () => {
  for (const c of Q.CITIES) { const p = Q.toXY(c.lon, c.lat), b = Q.toLonLat(p.x, p.y); close(b.lon, c.lon, 1e-13); close(b.lat, c.lat, 1e-13); }
  for (let i = 0; i < Q.CITIES.length; i++) for (let j = i + 1; j < Q.CITIES.length; j++) {
    const a = Q.CITIES[i], b = Q.CITIES[j], p = Q.toXY(a.lon, a.lat), q = Q.toXY(b.lon, b.lat);
    const d = Math.hypot(p.x - q.x, p.y - q.y), g = Q.greatCircle(a.lon, a.lat, b.lon, b.lat);
    assert.ok(Math.abs(d - g) / g < 0.015, `${a.zh}–${b.zh} ${d.toFixed(1)} vs ${g.toFixed(1)}`);
  }
  near(Q.KY, 110.75, 0.01, '1° 緯度'); near(Q.KX, 101.99, 0.02, '1° 經度');
  assert.ok(Q.onLand(120.9, 23.8), '日月潭附近在陸上'); assert.ok(!Q.onLand(122.2, 23.5), '花蓮外海在海上');
  for (const c of Q.CITIES) if (c.id !== 'PEH') assert.ok(Q.onLand(c.lon, c.lat), c.zh + ' 在本島海岸線內');
});

const rnd = Q.rng(20261112);
function randomCase(n, h) {
  const q = Q.randomQuake(rnd), e = Q.toXY(q.lon, q.lat), hh = h == null ? q.h : h;
  const st = [];
  for (let i = 0; i < n; i++) {
    const c = Q.CITIES[(i * 5 + Math.floor(rnd() * 12)) % 12];
    const p = Q.toXY(c.lon + (rnd() - 0.5) * 0.3, c.lat + (rnd() - 0.5) * 0.3);
    st.push({ x: p.x, y: p.y, R: Math.hypot(p.x - e.x, p.y - e.y, hh) });
  }
  return { e: e, h: hh, st: st };
}
function collinearish(st) { return Q.locate(st).collinear; }

test('精確資料：三站以上定位誤差 ~0（含深度），不論震源多深', () => {
  let worst = 0, worstH = 0, count = 0;
  for (let k = 0; k < 300; k++) {
    const n = 3 + (k % 4), c = randomCase(n);
    if (collinearish(c.st)) continue;
    const L = Q.locate(c.st);
    worst = Math.max(worst, Math.hypot(L.x - c.e.x, L.y - c.e.y));
    worstH = Math.max(worstH, Math.abs(L.h - c.h));
    count++;
  }
  assert.ok(count > 250);
  assert.ok(worst < 1e-6, '震央誤差 ' + worst + ' km');
  assert.ok(worstH < 1e-5, '深度誤差 ' + worstH + ' km');
});

test('三條共同弦交於震央（震源有深度時三圓重疊，但共同弦仍交於一點）', () => {
  for (let k = 0; k < 60; k++) {
    const c = randomCase(3);
    const ch = [[0, 1], [1, 2], [0, 2]].map(([i, j]) => Q.commonChord(c.st[i], c.st[j]));
    if (ch.some(x => !x)) continue;
    for (const seg of ch) {
      // 震央到弦所在直線的距離 = 0
      const [a, b] = seg, dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.abs((c.e.x - a.x) * dy - (c.e.y - a.y) * dx) / Math.hypot(dx, dy);
      assert.ok(dist < 1e-6, '弦到震央 ' + dist);
    }
  }
});

test('只用兩站：兩圓有兩個交點（無法判斷是哪一個）；深度 0 時其中一個就是震央', () => {
  for (let k = 0; k < 40; k++) {
    const c = randomCase(2, 0);
    const L = Q.locate(c.st);
    if (!L.candidates.length) continue;
    assert.strictEqual(L.candidates.length, 2);
    const d = Math.min.apply(null, L.candidates.map(p => Math.hypot(p.x - c.e.x, p.y - c.e.y)));
    assert.ok(d < 1e-6);
    // 兩個交點對兩站連線鏡像對稱
    const [p, q] = L.candidates, s0 = c.st[0], s1 = c.st[1];
    close(Math.hypot(p.x - s0.x, p.y - s0.y), Math.hypot(q.x - s0.x, q.y - s0.y), 1e-9);
    close(Math.hypot(p.x - s1.x, p.y - s1.y), Math.hypot(q.x - s1.x, q.y - s1.y), 1e-9);
  }
});

test('測站排成一直線：鏡像兩點都符合資料（無法分辨）', () => {
  const e = { x: 30, y: 40 }, st = [-80, 0, 70].map(x => ({ x: x, y: 0.5 * x, R: 0 }));
  st.forEach(s => { s.R = Math.hypot(s.x - e.x, s.y - e.y); });
  const L = Q.locate(st);
  assert.ok(L.collinear); assert.strictEqual(L.candidates.length, 2);
  const d = Math.min.apply(null, L.candidates.map(p => Math.hypot(p.x - e.x, p.y - e.y)));
  assert.ok(d < 1e-6, '其中一個是真正的震央 ' + d);
});

test('學生作圖：共同弦交點就是震央；由震央與各站 d 推算深度 h² = d² − Δ²', () => {
  let n = 0;
  for (let k = 0; k < 120; k++) {
    const c = randomCase(3 + (k % 3));
    if (collinearish(c.st)) continue;
    const p = Q.chordCenter(c.st);
    near(Math.hypot(p.x - c.e.x, p.y - c.e.y), 0, 1e-6, '共同弦交點');
    const D = Q.depthAt(c.st, c.e.x, c.e.y);
    near(D.h, c.h, 1e-6, '震央正確時深度');
    D.each.forEach(v => near(v, c.h * c.h, 1e-6, '每一站的 h²'));
    n++;
  }
  assert.ok(n > 80);
  // 三站時共同弦交點與定位的一次解相同（高斯－牛頓修正前）：精確資料下兩者都等於震央
  assert.strictEqual(Q.chordCenter([{ x: 0, y: 0, R: 5 }, { x: 10, y: 0, R: 5 }]), null, '兩站沒有共同弦交點');
  assert.strictEqual(Q.chordCenter([{ x: -50, y: 0, R: 60 }, { x: 0, y: 0, R: 40 }, { x: 50, y: 0, R: 60 }]), null, '一直線');
  // 標記偏了：Δ 變大的站 h² 變小；深度的平均為負時取 0
  const st = [{ x: 0, y: 0, R: 10 }, { x: 30, y: 0, R: 10 }];
  near(Q.depthAt(st, 15, 0).h, 0, 1e-12, '平均為負 → 0');
  near(Q.depthAt([{ x: 0, y: 0, R: 13 }], 5, 0).h, 12, 1e-12, '5-12-13');
});

test('兩個標記與兩個可能位置的配對（取較好的配法）', () => {
  const c = [{ x: 0, y: 10 }, { x: 0, y: -10 }];
  near(Q.pairErr([{ x: 1, y: -10 }, { x: 0, y: 12 }], c), 2, 1e-12, '交叉配對');
  // 兩個標記都點在上方交點附近：(0,10)→下方 20、(0,11)→上方 1，取較好的配法仍要 20 km
  near(Q.pairErr([{ x: 0, y: 10 }, { x: 0, y: 11 }], c), 20, 1e-12, '兩個標記都點在同一個交點附近');
  assert.strictEqual(Q.pairErr([{ x: 0, y: 10 }], c), Infinity);
});

test('含誤差：距離有 ±3% 誤差時，三圓圍成誤差三角形；四站以上殘差 > 0', () => {
  const r = Q.rng(7);
  let tri = 0;
  for (let k = 0; k < 50; k++) {
    const c = randomCase(4, 0);
    if (collinearish(c.st)) continue;
    const noisy = c.st.map(s => ({ x: s.x, y: s.y, R: s.R * (1 + (r() - 0.5) * 0.06) }));
    const L = Q.locate(noisy);
    assert.ok(L.rms > 0);
    const T = Q.errorTriangle(noisy.slice(0, 3), L.x, L.y);
    if (T.length === 3) tri++;
  }
  assert.ok(tri > 10);
});

test('隨機地震都在地圖範圍內，深度 3–40 km', () => {
  const r = Q.rng(99);
  for (let k = 0; k < 500; k++) {
    const q = Q.randomQuake(r);
    assert.ok(q.lon > Q.MAP.lon0 && q.lon < Q.MAP.lon1 && q.lat > Q.MAP.lat0 && q.lat < Q.MAP.lat1);
    assert.ok(q.h >= 3 && q.h <= 40);
  }
});

// ---------------- 三、地球內部 ----------------
test('PREM 代表值（Dziewonski & Anderson 1981 表）：核幔界面、內外核界面、地心', () => {
  near(Q.prem(3480, false).vp, 13.72, 0.01, '核幔界面上方 Vp');
  near(Q.prem(3480, false).vs, 7.26, 0.01, '核幔界面上方 Vs');
  near(Q.prem(3480, true).vp, 8.06, 0.01, '外核頂部 Vp');
  assert.strictEqual(Q.prem(3480, true).vs, 0, '外核是液體 Vs = 0');
  near(Q.prem(1221.5, true).vp, 11.03, 0.01, '內核頂部 Vp');
  near(Q.prem(1221.5, false).vp, 10.36, 0.01, '外核底部 Vp');
  near(Q.prem(1221.5, true).vs, 3.50, 0.01, '內核頂部 Vs');
  near(Q.prem(0, true).vp, 11.26, 0.01, '地心 Vp');
  near(Q.prem(5701, false).vp, 10.27, 0.01, '670 km 不連續面上方');
  near(Q.prem(6346.6, true).vp, 8.11, 0.01, '莫霍面下方');
});

test('均勻球：射線是直弦，Δ = π − 2i0、T = 2R cos i0 / v（解析解）', () => {
  const sh = Q.uniformShells(10);
  for (const i0 of [5, 20, 45, 70, 85]) {
    const ray = Q.traceRay(sh, Q.pFromTakeoff(sh, i0, 'P'), 'P');
    close(ray.delta, Math.PI - 2 * i0 * DEG, 1e-12, 'Δ');
    close(ray.time, 2 * 6371 * Math.cos(i0 * DEG) / 10, 1e-12, 'T');
  }
});

const SH = Q.buildShells(5);
test('司乃耳定律在每個界面成立（由路徑幾何量角度），射線參數 p = r sin i / v 全程不變', () => {
  let n = 0;
  for (const wave of ['P', 'S']) for (const i0 of [3, 8, 12, 13.3, 14, 20, 26, 33, 50]) {
    const p = Q.pFromTakeoff(SH, wave === 'S' ? i0 * 0.6 : i0, wave);
    const ray = Q.traceRay(SH, p, wave);
    const xy = ray.down.map(q => [q[0] * Math.sin(q[1]), q[0] * Math.cos(q[1])]);
    for (const c of ray.crossings) {
      const k = c.index, P0 = xy[k - 1], P1 = xy[k], P2 = xy[k + 1];
      if (!P2) continue;
      const rad = [P1[0] / Math.hypot(P1[0], P1[1]), P1[1] / Math.hypot(P1[0], P1[1])];
      const ang = (A, B) => { const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy); return Math.abs(dx / L * rad[1] - dy / L * rad[0]); }; // |sin| 與徑向夾角
      const s1 = ang(P0, P1), s2 = ang(P1, P2);
      close(s1 / c.vAbove, s2 / c.vBelow, 1e-8, `${wave} 在 r = ${c.r.toFixed(1)} 的司乃耳定律`);
      close(c.r * s1 / c.vAbove, p, 1e-8, '射線參數');
      n++;
    }
  }
  assert.ok(n > 1000, '檢查了 ' + n + ' 個界面');
});

test('P 波進入外核（波速由 13.7 降到 8.1 km/s）時偏向法線；S 波碰到液態外核被擋住', () => {
  const ray = Q.traceRay(SH, Q.pFromTakeoff(SH, 10, 'P'), 'P');
  const c = ray.crossings.find(q => q.from !== 'oc' && q.to === 'oc');
  assert.ok(c && c.vBelow < c.vAbove && c.sinBelow < c.sinAbove, '折射角小於入射角');
  const s = Q.traceRay(SH, Q.pFromTakeoff(SH, 6, 'S'), 'S');
  assert.ok(s.blocked); near(s.turnR, 3480, 1e-9);
});

test('沿路徑累加的走時（段長 ÷ 段速）等於解析走時', () => {
  for (const i0 of [2, 9, 13, 18, 30, 60]) {
    const ray = Q.annotate(Q.traceRay(SH, Q.pFromTakeoff(SH, i0, 'P'), 'P'));
    close(ray.total, ray.time, 1e-9, '走時');
    const end = Q.positionAt(ray, ray.time);
    close(Math.hypot(end[0], end[1]), 6371, 1e-9, '終點在地表');
    close(Math.atan2(end[0], end[1]), ray.delta > Math.PI ? ray.delta - 2 * Math.PI : ray.delta, 1e-9, '終點角距');
  }
});

const Z = Q.shadowZonesExact(SH);
test('陰影區與文獻相符：S 波約 103° 以外收不到；P 波陰影區約 103°–143°（容許 ±5°／±3°）', () => {
  // 文獻：教科書常寫 S 波陰影區始於約 103°–105°、P 波陰影區約 103°–142°（或 104°–140°）；
  // PREM 射線理論：掠過核幔界面的 P 波約 98.6°、S 波約 102.7°，PKP 焦散點約 143°–145°。
  near(Z.sMax, 104, 3, 'S 波陰影區起點');
  near(Z.pMax, 103, 5, 'P 波陰影區起點');
  near(Z.pkpMin, 143, 3, 'P 波陰影區終點（PKP 焦散點）');
  assert.ok(Z.pkpMin - Z.pMax > 35, '陰影區寬度 > 35°');
  near(Z.ikMin, 116, 6, '穿過內核的 PKIKP 最小角距（雷曼 1936 在陰影區中看到的弱 P 波）');
});

test('殼層變薄時結果收斂（10 km → 5 km 的變化：掠射角 < 0.3°、焦散點 < 1.5°）', () => {
  const z10 = Q.shadowZonesExact(Q.buildShells(10));
  assert.ok(Math.abs(z10.pMax - Z.pMax) < 0.3 && Math.abs(z10.sMax - Z.sMax) < 0.3);
  assert.ok(Math.abs(z10.pkpMin - Z.pkpMin) < 1.5);
});

test('走時與參考地球模型相符：P(30°) ≈ 370 s、P(90°) ≈ 780 s、PKIKP(180°) ≈ 1212 s（±2%）', () => {
  const br = Q.branches(SH, 1200, 700);
  const first = (deg, ph) => Q.arrivalsAt(br, deg, ph)[0].T;
  near(first(30, ['P']), 370, 370 * 0.02, 'P 30°');
  near(first(90, ['P']), 780, 780 * 0.02, 'P 90°');
  near(first(180, ['PKIKP']), 1212, 1212 * 0.02, 'PKIKP 180°');
  // 陰影區內沒有直接 P 與 PKP；S 波在 sMax 以外沒有
  assert.strictEqual(Q.arrivalsAt(br, 120, ['P', 'PKP']).length, 0);
  assert.strictEqual(Q.arrivalsAt(br, 110, ['S']).length, 0);
  assert.ok(Q.arrivalsAt(br, 60, ['S']).length > 0);
  assert.ok(Q.arrivalsAt(br, 150, ['PKP']).length > 0);
});

console.log(`\n${passed} 項通過` + (process.exitCode ? '，有失敗項目' : ''));
