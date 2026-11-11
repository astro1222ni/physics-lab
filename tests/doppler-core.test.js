// 以 Node 執行：node tests/doppler-core.test.js
'use strict';
const assert = require('assert');
const DC = require('../js/doppler-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function close(a, b, tol, msg) {
  const t = tol * Math.max(Math.abs(a), Math.abs(b), 1);
  assert.ok(Math.abs(a - b) <= t, (msg || '') + ` 期望 ${b}，得到 ${a}`);
}
/** 建立參數：波源從 (sx, sy) 以 (svx, svy) 運動；觀察者在 t0 時位於 (ox, oy)、速度 (ovx, ovy) */
function P(o) {
  return {
    f: o.f == null ? 2 : o.f, v: o.v == null ? 340 : o.v, tStart: o.tStart == null ? -1e6 : o.tStart,
    src: { x: o.sx || 0, y: o.sy || 0, vx: o.svx || 0, vy: o.svy || 0 },
    obs: { x: o.ox || 0, y: o.oy || 0, vx: o.ovx || 0, vy: o.ovy || 0, t0: o.t0 || 0 }
  };
}
/** 與解析解無關的數值解：在 [lo, hi] 內用二分法解 |O(t) − S(te)| − v(t − te) = 0 */
function bisectTe(p, t, lo, hi) {
  const O = DC.observerAt(p, t);
  const g = (te) => { const S = DC.sourceAt(p, te); return Math.hypot(O.x - S.x, O.y - S.y) - p.v * (t - te); };
  let a = lo, b = hi, ga = g(a);
  assert.ok(ga * g(b) <= 0, '二分法區間兩端要變號');
  for (let i = 0; i < 200; i++) {
    const m = 0.5 * (a + b), gm = g(m);
    if (ga * gm <= 0) b = m; else { a = m; ga = gm; }
  }
  return 0.5 * (a + b);
}

console.log('doppler-core');

test('課本公式四種符號：波源靠近／遠離、觀察者靠近／遠離', () => {
  const f = 500, v = 340;
  close(DC.classic(f, v, 0, 20), 500 * 340 / 320, 1e-14, '波源靠近 f v/(v − v_s)');
  close(DC.classic(f, v, 0, -20), 500 * 340 / 360, 1e-14, '波源遠離 f v/(v + v_s)');
  close(DC.classic(f, v, 34, 0), 550, 1e-14, '觀察者靠近 f (v + v_o)/v');
  close(DC.classic(f, v, -34, 0), 450, 1e-14, '觀察者遠離 f (v − v_o)/v');
  close(DC.classic(f, v, 34, 20), 500 * 374 / 320, 1e-14, '互相靠近 f (v + v_o)/(v − v_s)');
  close(DC.classic(f, v, -34, -20), 500 * 306 / 360, 1e-14, '互相遠離 f (v − v_o)/(v + v_s)');
  assert.ok(DC.classic(f, v, 0, 20) > f && DC.classic(f, v, 0, -20) < f, '靠近變高、遠離變低');
  // 同樣的相對速率，「波源動」與「觀察者動」結果不同（介質靜止）
  assert.ok(Math.abs(DC.classic(f, v, 0, 30) - DC.classic(f, v, 30, 0)) > 1, '波源動與觀察者動不對稱');
});

test('v_s = 0 且 v_o = 0：任何位置聽到的都是 f′ = f', () => {
  for (const [ox, oy] of [[500, 0], [-300, 120], [10, -700], [0, 1]]) {
    const p = P({ f: 3.3, ox, oy });
    const a = DC.arrivals(p, 5);
    assert.strictEqual(a.length, 1, '只有一個抵達的聲音');
    close(a[0].fp, 3.3, 1e-13, 'f′ = f');
    close(a[0].u, Math.hypot(ox, oy) / 340, 1e-13, '傳播時間 = 距離/v');
  }
});

test('共線運動：推遲時間的幾何計算與 f (v ± v_o)/(v ∓ v_s) 完全一致（所有符號組合）', () => {
  const f = 2, v = 340;
  for (const vs of [0, 40, 150, 300]) {
    for (const vo of [-120, -30, 0, 50, 150]) {
      // 觀察者在波源前方（+x，波源朝 +x 運動）：互相靠近的速度分量是 +v_s 與 −v_o
      let p = P({ f, v, sx: -2000, svx: vs, ox: 3000, ovx: vo });
      let a = DC.arrivals(p, 1.7);
      assert.strictEqual(a.length, 1);
      close(a[0].fp, DC.classic(f, v, -vo, vs), 1e-12, `前方 v_s=${vs} v_o=${vo}`);
      close(a[0].us, vs, 1e-12, 'u_s'); close(a[0].uo, -vo, 1e-12, 'u_o');
      // 觀察者在波源後方（−x）：波源遠離（−v_s），觀察者朝 +x 跑是靠近（+v_o）
      p = P({ f, v, sx: 2000, svx: vs, ox: -3000, ovx: vo });
      a = DC.arrivals(p, 1.7);
      assert.strictEqual(a.length, 1);
      close(a[0].fp, DC.classic(f, v, vo, -vs), 1e-12, `後方 v_s=${vs} v_o=${vo}`);
    }
  }
});

test('推遲時間：解析解滿足 |O(t) − S(te)| = v(t − te)，並與獨立的二分法數值解一致', () => {
  const cases = [
    { sx: -600, svx: 120, ox: 100, oy: -80, ovx: -60 },
    { sx: -600, svx: 290, svy: 40, ox: 250, oy: 150, ovx: 30, ovy: -20 },
    { sx: 0, svx: 0, ox: -400, oy: 300, ovx: 100 },
    { f: 1.3, v: 200, sx: -300, svx: 150, ox: 0, oy: -50 }
  ];
  for (const c of cases) {
    const p = P(c);
    for (const t of [0.5, 2, 4.4, 9]) {
      const a = DC.arrivals(p, t);
      assert.strictEqual(a.length, 1, '次音速只有一個根');
      const O = DC.observerAt(p, t), S = DC.sourceAt(p, a[0].te);
      close(Math.hypot(O.x - S.x, O.y - S.y), p.v * (t - a[0].te), 1e-12, '幾何條件');
      close(a[0].dist, p.v * a[0].u, 1e-12, 'dist = v u');
      close(a[0].te, bisectTe(p, t, t - 100, t), 1e-11, '二分法');
    }
  }
});

test('不在同一直線時：f′ = f·dte/dt（相位 f·te 的時間變化率），用數值微分驗證', () => {
  const cases = [
    { sx: -600, svx: 120, ox: 100, oy: -80, ovx: -60 },
    { sx: -600, svx: 290, svy: 40, ox: 250, oy: 150, ovx: 30, ovy: -20 },
    { f: 3, v: 500, sx: 100, svx: -200, ox: -50, oy: 30, ovy: 70 }
  ];
  for (const c of cases) {
    const p = P(c);
    for (const t of [0.7, 3.1, 6.2]) {
      const h = 1e-5;
      const te1 = DC.arrivals(p, t - h)[0].te, te2 = DC.arrivals(p, t + h)[0].te;
      close(DC.arrivals(p, t)[0].fp, p.f * (te2 - te1) / (2 * h), 1e-7, 'f·dte/dt');
    }
  }
});

test('波源經過觀察者身旁：f′ 由高連續降到低，正側身時（R̂ ⟂ V_s 的推遲位置）f′ = f', () => {
  const p = P({ f: 2, sx: -1000, svx: 100, ox: 0, oy: -60 });
  let prev = Infinity;
  for (let t = 0; t <= 20; t += 0.25) {
    const fp = DC.arrivals(p, t)[0].fp;
    assert.ok(fp < prev + 1e-12, 'f′ 單調下降');
    prev = fp;
  }
  close(DC.arrivals(p, 0)[0].fp, DC.classic(2, 340, 0, 100), 2e-3, '遠在前方時接近 f v/(v − v_s)');
  close(DC.arrivals(p, 20)[0].fp, DC.classic(2, 340, 0, -100), 2e-3, '遠在後方時接近 f v/(v + v_s)');
  // 聲音在波源經過 x = 0 「之前」發出時的位置正好在觀察者正上方：此時 f′ = f
  const tHear = 10 + 60 / 340; // 波源 t = 10 s 到 x = 0，聲音走 60 m
  close(DC.arrivals(p, tHear)[0].fp, 2, 1e-12, 'R̂ ⟂ V_s → f′ = f');
  close(DC.arrivals(p, tHear)[0].te, 10, 1e-12, '推遲時刻 = 波源在正上方的時刻');
});

test('馬赫角 sin θ = v/v_s，波前都與震波錐的邊相切', () => {
  close(DC.machAngle(340, 680), Math.PI / 6, 1e-14, 'v_s = 2v → 30°');
  close(DC.machAngle(340, 340), Math.PI / 2, 1e-14, 'v_s = v → 90°（音障）');
  assert.ok(isNaN(DC.machAngle(340, 200)), '次音速沒有震波');
  close(DC.machNumber(340, 510), 1.5, 1e-14);
  const vs = 544, v = 340, p = P({ f: 2, tStart: 0, sx: -500, svx: vs });
  const t = 3, th = DC.machAngle(v, vs), S = DC.sourceAt(p, t);
  for (const w of DC.wavefronts(p, t)) {
    if (w.r <= 0) continue;
    // 錐的上邊：由 S 往後（−x）張開 θ 的直線；圓心到這條線的距離應等於半徑
    const ux = -Math.cos(th), uy = Math.sin(th);
    const qx = w.cx - S.x, qy = w.cy - S.y;
    close(Math.abs(qx * uy - qy * ux), w.r, 1e-10, '相切');
  }
});

test('波前間距：前方 (v − v_s)/f、後方 (v + v_s)/f', () => {
  for (const [f, v, vs] of [[2, 340, 0], [2, 340, 120], [1.5, 300, 250], [3.7, 500, 80]]) {
    const p = P({ f, v, tStart: 0, svx: vs });
    const ws = DC.wavefronts(p, 6.3);
    for (let i = 1; i < ws.length; i++) {
      const a = ws[i - 1], b = ws[i];
      close((a.cx + a.r) - (b.cx + b.r), DC.wavelengthAhead(f, v, vs), 1e-10, '前方');
      close((b.cx - b.r) - (a.cx - a.r), DC.wavelengthBehind(f, v, vs), 1e-10, '後方');
    }
    close(DC.wavelengthAhead(f, v, vs) + DC.wavelengthBehind(f, v, vs), 2 * v / f, 1e-14, '兩者平均 = v/f');
    // 靜止的觀察者：f′ = v/λ
    const q = P({ f, v, svx: vs, sx: -5000, ox: 5000 });
    close(DC.arrivals(q, 1)[0].fp, v / DC.wavelengthAhead(f, v, vs), 1e-12, 'f′ = v/λ_前');
  }
});

test('超音速：馬赫錐外聽不到，錐內同時收到兩個聲音，較早發出的那個 f′ < 0（時間順序相反）', () => {
  const v = 340, vs = 544, p = P({ f: 2, sx: -2000, svx: vs, ox: 0, oy: -300 });
  const th = DC.machAngle(v, vs);
  // 錐面通過觀察者的時刻：觀察者在波源後方 300/tan θ 處
  const tBoom = (2000 + 300 / Math.tan(th)) / vs;
  assert.strictEqual(DC.arrivals(p, tBoom - 0.05).length, 0, '錐外沒有聲音');
  const a = DC.arrivals(p, tBoom + 0.05);
  assert.strictEqual(a.length, 2, '錐內兩個聲音');
  assert.ok(a[0].te > a[1].te, '依發出時刻由晚到早排序');
  assert.ok(a[0].fp > 0 && a[1].fp < 0, '較早發出（還在靠近時）的聲音 f′ < 0');
  assert.ok(a[1].us > v, '那時波源朝觀察者的速度分量超過聲速');
  for (const x of a) close(x.fp, 2 * v / (v - x.us), 1e-12, '同一個公式');
  // 剛過錐面時兩根很接近、|f′| 很大（音爆：大量波前同時抵達）
  const b = DC.arrivals(p, tBoom + 1e-4);
  assert.ok(Math.abs(b[0].fp) > 40 && Math.abs(b[1].fp) > 40, '錐面上 |f′| → ∞');
  close(b[0].te, b[1].te, 1e-2, '兩根在錐面上合而為一');
});

test('v_s = v：前方永遠聽不到，後方只有一個聲音', () => {
  const p = P({ f: 2, sx: -1000, svx: 340, ox: 500, oy: 0 });
  assert.strictEqual(DC.arrivals(p, 3).length, 0, '前方');
  const q = P({ f: 2, sx: 1000, svx: 340, ox: -500, oy: 30 });
  const a = DC.arrivals(q, 3);
  assert.strictEqual(a.length, 1, '後方');
  close(a[0].fp, 2 * 340 / (340 - a[0].us), 1e-12);
});

test('聲音以有限速率傳播：開始發聲後要經過 距離/v 才聽得到', () => {
  const p = P({ f: 2, tStart: 0, ox: 680 });
  assert.strictEqual(DC.arrivals(p, 1.99).length, 0, '2 s 前聽不到');
  assert.strictEqual(DC.arrivals(p, 2.01).length, 1, '2 s 後聽得到');
});

test('波前個數守恆：觀察者收到的波前數 = ∫ f′ dt = f·Δte', () => {
  const p = P({ f: 2.5, sx: -900, svx: 200, ox: 100, oy: -40, ovx: -80 });
  const t1 = 1, t2 = 9, n = 4000, h = (t2 - t1) / n;
  let s = 0;
  for (let i = 0; i <= n; i++) {
    const w = i === 0 || i === n ? 1 : i % 2 ? 4 : 2;
    s += w * DC.arrivals(p, t1 + i * h)[0].fp;
  }
  s *= h / 3; // Simpson 積分
  const dte = DC.arrivals(p, t2)[0].te - DC.arrivals(p, t1)[0].te;
  close(s, p.f * dte, 1e-9, '∫f′dt = f Δte');
  // 個數（整數）：兩種算法一致
  const q = P({ f: 2.5, tStart: 0, sx: -900, svx: 200, ox: 100, oy: -40 });
  const te1 = DC.arrivals(q, 3).map((a) => a.te)[0], te2 = DC.arrivals(q, 8)[0].te;
  const cnt = DC.emissionTimes(q, 100).filter((te) => te > te1 && te <= te2).length;
  assert.strictEqual(DC.frontsBetween(q, te1, te2), cnt, 'frontsBetween');
});

test('emissionTimes 與 wavefronts：每隔 1/f 一個，圓心在發出時的波源位置', () => {
  const p = P({ f: 4, tStart: 0, sx: -100, svx: 50 });
  const ts = DC.emissionTimes(p, 2.6);
  assert.strictEqual(ts.length, 11, 'te = 0, 0.25, …, 2.5');
  ts.forEach((te, k) => close(te, k / 4, 1e-14));
  const last3 = DC.wavefronts(p, 2.6, 3);
  assert.strictEqual(last3.length, 3, 'maxCount');
  close(last3[0].te, 2, 1e-14);
  for (const w of DC.wavefronts(p, 2.6)) {
    close(w.cx, -100 + 50 * w.te, 1e-12, '圓心');
    close(w.r, 340 * (2.6 - w.te), 1e-12, '半徑');
  }
});

console.log(`\n${passed} 項通過`);
