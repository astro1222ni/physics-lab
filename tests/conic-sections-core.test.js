// 以 Node 執行：node tests/conic-sections-core.test.js
'use strict';
const assert = require('assert');
const C = require('../js/conic-sections-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function close(a, b, tol, msg) {
  assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), (msg || '') + ` 期望 ${b}（容許 ${tol}），得到 ${a}`);
}
const DEG = Math.PI / 180;
/** 可重現的亂數（mulberry32） */
function rng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const R = rng(20261112);
const between = (lo, hi) => lo + (hi - lo) * R();
/** 隨機挑曲線上的一點（參數） */
function randomPar(sec) {
  switch (sec.type) {
    case 'circle': case 'ellipse': return { br: 1, t: between(-Math.PI, Math.PI) };
    case 'hyperbola': return { br: R() < 0.5 ? -1 : 1, t: between(-2.2, 2.2) };
    case 'parabola': return { br: 1, t: between(-4, 4) * sec.p };
    default: return { br: 1, t: 0 };
  }
}
/** 隨機產生某一類的切法（α 10°–70°，d 0.1–3） */
function randomSection(kind) {
  for (;;) {
    const a = Math.round(between(10, 70) * 10) / 10, d = between(0.1, 3);
    let b;
    if (kind === 'ellipse') b = between(a + 0.5, 89.5);
    else if (kind === 'hyperbola') b = between(0, a - 0.5);
    else if (kind === 'parabola') b = a;
    else b = 90;
    if (b < 0 || b > 90) continue;
    return C.section(a, b, d);
  }
}

console.log('conic-sections-core');

test('分類：比較 β 與 α（d > 0）', () => {
  assert.strictEqual(C.section(30, 90, 2).type, 'circle');
  assert.strictEqual(C.section(30, 55, 2).type, 'ellipse');
  assert.strictEqual(C.section(30, 30, 2).type, 'parabola');
  assert.strictEqual(C.section(30, 10, 2).type, 'hyperbola');
  assert.strictEqual(C.section(30, 0, 2).type, 'hyperbola');
  // 打字輸入的小數也能剛好相等
  assert.strictEqual(C.section(37.5, 37.5, 1).type, 'parabola');
  assert.strictEqual(C.section(37.5, 37.6, 1).type, 'ellipse');
});

test('退化：平面通過頂點（d = 0）時是一點、一條直線或兩條相交直線', () => {
  assert.strictEqual(C.section(30, 90, 0).type, 'point');
  assert.strictEqual(C.section(30, 60, 0).type, 'point');
  assert.strictEqual(C.section(30, 30, 0).type, 'line');
  assert.strictEqual(C.section(30, 10, 0).type, 'lines');
  // 平面包含軸（β = 0）時，兩條直線就是兩條母線：與主軸的夾角 = α
  close(C.section(30, 0, 0).phi, 30, 1e-12, '母線夾角');
  close(C.section(50, 0, 0).phi, 50, 1e-12, '母線夾角');
  // 一般情形：tan φ = √(cos²β − cos²α)/cos α
  const s = C.section(40, 20, 0);
  close(Math.tan(s.phi * DEG), Math.sqrt(Math.cos(20 * DEG) ** 2 - Math.cos(40 * DEG) ** 2) / Math.cos(40 * DEG), 1e-12);
  assert.strictEqual(s.spheres.length, 0, '退化時沒有丹德林球');
});

test('離心率 e = cos β / cos α，並與 c/a 一致', () => {
  for (const kind of ['ellipse', 'hyperbola']) {
    for (let i = 0; i < 40; i++) {
      const s = randomSection(kind);
      close(s.e, Math.cos(s.beta) / Math.cos(s.alpha), 1e-12, kind + ' e');
      close(s.c / s.a, s.e, 1e-9, kind + ' c/a');
    }
  }
  assert.strictEqual(C.section(30, 90, 2).e, 0, '圓 e = 0');
  close(C.section(30, 30, 2).e, 1, 1e-12, '拋物線 e = 1');
});

test('c² = a² − b²（橢圓）與 c² = a² + b²（雙曲線）', () => {
  for (let i = 0; i < 40; i++) {
    const s = randomSection('ellipse');
    close(s.c * s.c, s.a * s.a - s.b * s.b, 1e-9, '橢圓');
    const h = randomSection('hyperbola');
    close(h.c * h.c, h.a * h.a + h.b * h.b, 1e-9, '雙曲線');
  }
});

test('丹德林球：與錐面相切、與切平面相切，切點就是焦點（距中心 c）', () => {
  for (const kind of ['circle', 'ellipse', 'parabola', 'hyperbola']) {
    for (let i = 0; i < 25; i++) {
      const s = randomSection(kind);
      const sa = Math.sin(s.alpha);
      assert.strictEqual(s.spheres.length, kind === 'parabola' ? 1 : 2, kind + ' 球的個數');
      s.spheres.forEach(S => {
        // 球心到錐面（母線）的距離 = |z_c| sin α = 半徑
        close(S.r, Math.abs(S.zc) * sa, 1e-12, '與錐面相切');
        // 球心到切平面的距離 = 半徑
        close(Math.abs(C.planeResidual(s, [0, 0, S.zc])), S.r, 1e-9, '與切平面相切');
        // 切點在平面上、在球面上
        close(C.planeResidual(s, S.focus3), 0, 1e-9, '切點在平面上');
        close(C.dist3(S.focus3, [0, 0, S.zc]), S.r, 1e-9, '切點在球面上');
        // 相切圓在錐面上
        close(C.coneResidual(s, [S.ringR, 0, S.ringZ]), 0, 1e-9, '相切圓在錐面上');
        close(C.dist3([S.ringR, 0, S.ringZ], [0, 0, S.zc]), S.r, 1e-9, '相切圓在球面上');
      });
      if (kind === 'ellipse') {
        close(s.foci[0].x, -s.c, 1e-9, '橢圓 F1 = (−c, 0)'); close(s.foci[1].x, s.c, 1e-9, '橢圓 F2 = (c, 0)');
        assert.ok(s.spheres[0].zc > 0 && s.spheres[1].zc > s.spheres[0].zc, '橢圓：兩顆球在同一個錐裡');
      }
      if (kind === 'hyperbola') {
        close(s.foci[0].x, s.c, 1e-9, '雙曲線 F1 = (c, 0)'); close(s.foci[1].x, -s.c, 1e-9, '雙曲線 F2 = (−c, 0)');
        assert.ok(s.spheres[0].zc > 0 && s.spheres[1].zc < 0, '雙曲線：兩顆球分在上下兩個錐');
      }
      if (kind === 'parabola') close(s.foci[0].x, s.p, 1e-9, '拋物線焦點 (p, 0)');
      if (kind === 'circle') { close(s.foci[0].x, 0, 1e-9, '圓心'); close(s.foci[1].x, 0, 1e-9, '圓心'); }
    }
  }
});

test('標準式代入成立，而且點同時在錐面與切平面上', () => {
  for (const kind of ['circle', 'ellipse', 'parabola', 'hyperbola']) {
    for (let i = 0; i < 30; i++) {
      const s = randomSection(kind);
      for (let j = 0; j < 10; j++) {
        const q = C.pointAt(s, randomPar(s));
        let lhs;
        if (kind === 'parabola') lhs = q.y * q.y - 4 * s.p * q.x;
        else if (kind === 'hyperbola') lhs = q.x * q.x / (s.a * s.a) - q.y * q.y / (s.b * s.b) - 1;
        else lhs = q.x * q.x / (s.a * s.a) + q.y * q.y / (s.b * s.b) - 1;
        close(lhs, 0, 1e-9, kind + ' 標準式');
        const X = C.toSpace(s, q.x, q.y);
        const scale = 1 + X[2] * X[2];
        assert.ok(Math.abs(C.coneResidual(s, X)) <= 1e-9 * scale, kind + ' 在錐面上：殘差 ' + C.coneResidual(s, X));
        close(C.planeResidual(s, X), 0, 1e-9, kind + ' 在切平面上');
        const back = C.fromSpace(s, X);
        close(back.x, q.x, 1e-9); close(back.y, q.y, 1e-9);
      }
    }
  }
});

test('橢圓：曲線上任一點 PF1 + PF2 = 2a', () => {
  for (let i = 0; i < 40; i++) {
    const s = randomSection('ellipse');
    for (let j = 0; j < 12; j++) {
      const q = C.pointAt(s, randomPar(s)), M = C.measure(s, q.x, q.y);
      close(M.sum, 2 * s.a, 1e-9, '和');
    }
  }
});

test('雙曲線：曲線上任一點 |PF1 − PF2| = 2a', () => {
  for (let i = 0; i < 40; i++) {
    const s = randomSection('hyperbola');
    for (let j = 0; j < 12; j++) {
      const q = C.pointAt(s, randomPar(s)), M = C.measure(s, q.x, q.y);
      close(M.diff, 2 * s.a, 1e-8, '差');
    }
  }
});

test('焦點與準線：任一點 PF = e·PD（兩組焦點、準線都成立；拋物線 PF = PD）', () => {
  for (const kind of ['ellipse', 'parabola', 'hyperbola']) {
    for (let i = 0; i < 40; i++) {
      const s = randomSection(kind);
      for (let j = 0; j < 10; j++) {
        const q = C.pointAt(s, randomPar(s)), M = C.measure(s, q.x, q.y);
        M.PF.forEach((pf, k) => close(pf, s.e * M.PD[k], 1e-8, kind + ' 焦點 ' + (k + 1)));
      }
      // 準線位置：x′ = ∓a/e（橢圓、雙曲線），x′ = −p（拋物線）
      if (kind === 'ellipse') { close(s.directrices[0], -s.a / s.e, 1e-9); close(s.directrices[1], s.a / s.e, 1e-9); }
      if (kind === 'hyperbola') { close(s.directrices[0], s.a / s.e, 1e-9); close(s.directrices[1], -s.a / s.e, 1e-9); }
      if (kind === 'parabola') close(s.directrices[0], -s.p, 1e-9);
    }
  }
  // 圓沒有準線（相切圓的平面與切平面平行）
  assert.strictEqual(C.section(30, 90, 2).directrices[0], null);
});

test('丹德林的論證：PF = PK（從 P 到同一顆球的兩條切線段等長），PK1 ± PK2 = K1K2', () => {
  for (const kind of ['ellipse', 'hyperbola', 'parabola', 'circle']) {
    for (let i = 0; i < 25; i++) {
      const s = randomSection(kind);
      for (let j = 0; j < 8; j++) {
        const q = C.pointAt(s, randomPar(s)), M = C.measure(s, q.x, q.y);
        if (Math.abs(M.P3[2]) < 1e-6) continue;
        M.PF.forEach((pf, k) => close(M.PK[k], pf, 1e-8, kind + ' PK = PF'));
        // K 在相切圓上
        M.K.forEach((K, k) => close(Math.hypot(K[0], K[1]), s.spheres[k].ringR, 1e-8, 'K 在相切圓上'));
        if (kind === 'ellipse') close(M.PK[0] + M.PK[1], C.dist3(M.K[0], M.K[1]), 1e-8, 'PK1 + PK2 = K1K2');
        if (kind === 'hyperbola') close(Math.abs(M.PK[0] - M.PK[1]), C.dist3(M.K[0], M.K[1]), 1e-8, '|PK1 − PK2| = K1K2');
      }
      // 兩個相切圓之間沿母線的距離 = 2a
      if (kind === 'ellipse' || kind === 'hyperbola') {
        close(Math.abs(s.spheres[1].zc - s.spheres[0].zc) * Math.cos(s.alpha), 2 * s.a, 1e-9, 'K1K2 = 2a');
      }
    }
  }
});

test('圓：半徑 d tan α，PF = 半徑；β → 90° 時橢圓趨近於圓', () => {
  const s = C.section(35, 90, 2.4);
  close(s.a, 2.4 * Math.tan(35 * DEG), 1e-12, '半徑');
  close(s.b, s.a, 1e-12);
  close(s.c, 0, 1e-12);
  for (let j = 0; j < 10; j++) {
    const q = C.pointAt(s, randomPar(s)), M = C.measure(s, q.x, q.y);
    close(M.PF[0], s.a, 1e-9); close(M.PF[1], s.a, 1e-9);
  }
  const near = C.section(35, 89.999, 2.4);
  close(near.a, s.a, 1e-4, '長軸趨近半徑'); close(near.b, s.a, 1e-4, '短軸趨近半徑');
  assert.ok(near.e < 1e-4 && near.c < 1e-3, '離心率趨近 0');
});

test('拋物線是橢圓與雙曲線的極限：β → α 時 e → 1，近焦點與頂點的位置趨近拋物線', () => {
  const par = C.section(40, 40, 2);
  for (const db of [1e-3, -1e-3]) {
    const s = C.section(40, 40 + db, 2);
    close(s.e, 1, 3e-5, 'e → 1');
    // 靠頂點那一端：頂點到焦點 1 的距離 a − c（橢圓）或 c − a（雙曲線）→ p
    close(Math.abs(s.c - s.a), par.p, 1e-3, '頂點到焦點 → p');
    // 半正焦弦 b²/a → 2p
    close(s.latus / 2, 2 * par.p, 1e-3, '半正焦弦 → 2p');
  }
  // 拋物線：p = d tan α / 2，正焦弦 4p
  close(par.p, 2 * Math.tan(40 * DEG) / 2, 1e-12);
  close(par.latus, 4 * par.p, 1e-12);
});

test('退化的極限：d → 0 時曲線縮成一點，雙曲線貼近它的漸近線', () => {
  const big = C.section(30, 60, 1), tiny = C.section(30, 60, 1e-6);
  close(tiny.a / big.a, 1e-6, 1e-9, '長度與 d 成正比');
  close(tiny.e, big.e, 1e-12, '形狀（離心率）與 d 無關');
  const h = C.section(40, 15, 1e-6), lines = C.section(40, 15, 0);
  close(h.slope, lines.slope, 1e-9, '漸近線斜率 = 兩相交直線的斜率');
  close(Math.cos(C.section(40, 15, 1).phi * DEG), 1 / C.section(40, 15, 1).e, 1e-12, 'cos φ = 1/e');
});

test('正焦弦長 2b²/a：正焦弦端點在曲線上、恰好在焦點正上方', () => {
  for (const kind of ['ellipse', 'hyperbola']) {
    for (let i = 0; i < 20; i++) {
      const s = randomSection(kind);
      const x = s.foci[0].x, y = s.latus / 2;
      const lhs = kind === 'ellipse' ? x * x / (s.a * s.a) + y * y / (s.b * s.b) : x * x / (s.a * s.a) - y * y / (s.b * s.b);
      close(lhs, 1, 1e-9, kind);
    }
  }
  const p = C.section(50, 50, 1.5);
  close(4 * p.p * p.p, (p.latus / 2) ** 2, 1e-12, '拋物線正焦弦端點 (p, 2p)');
});

test('平面與軸的交點距離 h = d / sin β；β = 0 時平面與軸平行', () => {
  close(C.section(30, 60, 2).axisHit, 2 / Math.sin(60 * DEG), 1e-12);
  assert.strictEqual(C.section(30, 0, 2).axisHit, null);
});

test('最近點：拖曳 P 時投影到曲線上', () => {
  for (const kind of ['ellipse', 'hyperbola', 'parabola', 'circle']) {
    for (let i = 0; i < 15; i++) {
      const s = randomSection(kind);
      const q = C.pointAt(s, randomPar(s));
      // 沿法線往外推一點點：最近點應該回到原來的點
      const tg = C.tangentAt(s, C.nearest(s, q.x, q.y).par);
      const eps = 0.01 * Math.min(s.a || s.p, s.b || s.p);
      const n = C.nearest(s, q.x - tg.y * eps, q.y + tg.x * eps);
      close(n.x, q.x, 1e-4, kind + ' x'); close(n.y, q.y, 1e-4, kind + ' y');
      close(n.dist, eps, 1e-3, kind + ' 距離');
    }
  }
  // 兩相交直線 y′ = ±k x′：點到較近那一條直線的距離 |k x − y|/√(1 + k²)
  const L = C.section(30, 10, 0), k = L.slope;
  const n = C.nearest(L, 3, 0.2);
  close(n.dist, Math.abs(k * 3 - 0.2) / Math.sqrt(1 + k * k), 1e-6, '兩相交直線也能投影');
  close(n.y, k * n.x, 1e-9, '投影點在直線上');
});

test('取樣：折線點都在曲線上；保留條件把曲線切成多段', () => {
  const s = C.section(30, 10, 1.5);
  const lines = C.polylines(s, 20);
  assert.strictEqual(lines.length, 2, '雙曲線兩支');
  lines.forEach(l => l.forEach(([x, y]) => close(x * x / (s.a * s.a) - y * y / (s.b * s.b), 1, 1e-8)));
  const clipped = C.polylines(C.section(30, 55, 2), 10, (x, y) => y > 0.3 || y < -0.3);
  assert.ok(clipped.length >= 2, '被切開');
});

console.log(`${passed} 項測試通過`);
