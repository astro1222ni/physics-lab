// 以 Node 執行：node tests/magma-crystallization-core.test.js
'use strict';
const assert = require('assert');
const C = require('../js/magma-crystallization-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function near(a, b, abs, msg) { assert.ok(Math.abs(a - b) <= abs, (msg || '') + ` 期望 ${b} ± ${abs}，得到 ${a}`); }

console.log('magma-crystallization-core');

test('erf 近似式：誤差 < 2×10⁻⁷', () => {
  near(C.erf(0), 0, 1e-9);
  near(C.erf(0.5), 0.5204998778, 2e-7);
  near(C.erf(1), 0.8427007929, 2e-7);
  near(C.erf(2), 0.9953222650, 2e-7);
  near(C.erf(-1), -0.8427007929, 2e-7);
});

test('板狀體的冷卻：t→0 中心是 T0、接觸面是 (T0+Tr)/2；左右對稱；很久以後趨近 Tr', () => {
  const T0 = 1200, Tr = 15, a = 3;
  near(C.slabT(T0, Tr, a, 0, 1), T0, 1e-6);
  near(C.slabT(T0, Tr, a, a, 1), (T0 + Tr) / 2, 0.5);
  near(C.slabT(T0, Tr, a, 1.7, 5e5), C.slabT(T0, Tr, a, -1.7, 5e5), 1e-9);
  near(C.slabT(T0, Tr, a, 0, 1e13), Tr, 1);
  // 中心溫度隨時間只降不升
  let prev = T0 + 1;
  for (let lg = 3; lg <= 9; lg += 0.25) { const T = C.slabT(T0, Tr, a, 0, Math.pow(10, lg)); assert.ok(T <= prev + 1e-9); prev = T; }
});

test('冷卻時間 ∝ a²：岩體厚 10 倍，中心降到同一溫度要 100 倍時間', () => {
  const T0 = 1200, Tr = 15, target = 800;
  function tCross(a) { let lo = 1, hi = 1e16; for (let i = 0; i < 200; i++) { const m = Math.sqrt(lo * hi); if (C.slabT(T0, Tr, a, 0, m) > target) lo = m; else hi = m; } return lo; }
  near(tCross(10) / tCross(1), 100, 1e-6);
  near(tCross(1000) / tCross(10), 1e4, 1e-3);
});

test('黏度（VFT）：液相線溫度是設定值、玻璃轉移溫度是 10¹² Pa·s；降溫黏度變大；流紋岩 ≫ 玄武岩', () => {
  for (const k in C.MAGMAS) {
    const m = C.MAGMAS[k];
    near(C.logEta(k, m.TL), m.logEtaL, 1e-9, k);
    near(C.logEta(k, m.Tg), 12, 1e-9, k);
    assert.ok(C.logEta(k, m.TL - 100) > C.logEta(k, m.TL));
  }
  for (const T of [900, 800, 700]) assert.ok(C.logEta('rhyolite', T) > C.logEta('andesite', T) && C.logEta('andesite', T) > C.logEta('basalt', T), 'T=' + T);
});

test('成核與成長：液相線以上都是 0；過冷度越大，I/G 越大（n > 1）', () => {
  const r0 = C.rates('basalt', 1210);
  assert.strictEqual(r0.G, 0); assert.strictEqual(r0.I, 0);
  let prev = 0;
  for (const dT of [5, 20, 50, 100]) {
    const r = C.rates('basalt', 1200 - dT);
    assert.ok(r.G > 0 && r.I > 0);
    assert.ok(r.I / r.G > prev); prev = r.I / r.G;
  }
});

test('JMAK：0 ≤ X ≤ 1、玻璃 = 1 − X、N ≥ 0；晶體大小 L = (X/N)^(1/3)', () => {
  for (const p of C.PRESETS) {
    const r = C.cool(p);
    assert.ok(r.X >= 0 && r.X <= 1, p.id);
    near(r.glass, 1 - r.X, 1e-12, p.id);
    assert.ok(r.N >= 0, p.id);
    if (!p.phen && r.N > 0) near(r.L, Math.cbrt(r.X / r.N) * 1000, 1e-9, p.id);
  }
});

test('岩體越大（冷得越慢），晶體越大：三種岩漿、地表與深處都單調', () => {
  for (const type of ['basalt', 'andesite', 'rhyolite']) {
    for (const z of [0, 8]) {
      let prev = -1;
      for (const a of [0.3, 1, 3, 10, 30, 100, 300, 1000, 3000]) {
        const r = C.cool({ type: type, a: a, z: z, xr: 0 });
        if (r.glass > 0.5) continue;
        assert.ok(r.L > prev, type + ' z=' + z + ' a=' + a + '：' + r.L + ' ≤ ' + prev);
        prev = r.L;
      }
    }
  }
});

test('圍岩越熱（越深）冷得越慢、晶體越大；靠近接觸面晶體比中心小', () => {
  const a = C.cool({ type: 'basalt', a: 50, z: 0 }), b = C.cool({ type: 'basalt', a: 50, z: 10 });
  assert.ok(b.L > a.L && b.tEnd > a.tEnd);
  const c = C.cool({ type: 'basalt', a: 50, z: 2, xr: 0 }), e = C.cool({ type: 'basalt', a: 50, z: 2, xr: 0.9 });
  assert.ok(e.L < c.L);
});

test('實際岩石：組織與岩石名稱', () => {
  const want = { penghu: ['aphanitic', '玄武岩'], pillow: ['glassy', '玄武岩質玻璃'], gabbro: ['phaneritic', '輝長岩'],
    tatun: ['porphyritic', '安山岩'], diorite: ['phaneritic', '閃長岩'], granite: ['phaneritic', '花崗岩'], obsidian: ['glassy', '黑曜岩'] };
  for (const p of C.PRESETS) {
    const r = C.cool(p);
    if (!want[p.id]) continue;
    assert.strictEqual(r.tex, want[p.id][0], p.id + ' ' + r.tex);
    if (p.id !== 'tatun') assert.strictEqual(r.rock[0], want[p.id][1], p.id);
  }
  // 晶體大小的數量級
  const g = C.cool(C.PRESETS.find(p => p.id === 'granite')), ph = C.cool(C.PRESETS.find(p => p.id === 'penghu'));
  assert.ok(g.L > 1 && g.L < 20, '花崗岩 ' + g.L);
  assert.ok(ph.L > 0.05 && ph.L < 1, '澎湖玄武岩 ' + ph.L);
});

test('兩階段冷卻：斑晶比例照設定、斑晶 ≫ 石基；沒有第一階段就不是斑狀', () => {
  for (const ph of [0.05, 0.2, 0.4]) {
    const r = C.cool({ type: 'andesite', a: 5, z: 0, phen: ph });
    near(r.Xp1, ph, 0.003, 'φ1=' + ph);
    assert.ok(r.Xp >= r.Xp1 - 1e-9);
    assert.ok(r.Lp > 5 * r.Lg);
    assert.strictEqual(r.tex, 'porphyritic');
  }
  assert.notStrictEqual(C.cool({ type: 'andesite', a: 5, z: 0, phen: 0 }).tex, 'porphyritic');
});

test('黏度效應：同樣大小的熔岩流，流紋岩凍成玻璃、玄武岩結晶', () => {
  const r = C.cool({ type: 'rhyolite', a: 10, z: 0 }), b = C.cool({ type: 'basalt', a: 10, z: 0 });
  assert.ok(r.glass > 0.5);
  assert.ok(b.glass < 0.01);
});

test('斜長石：純端成分的熔點；環內固相比液相富鈣；An50 的液相線約 1450 °C（Bowen 1913）', () => {
  near(C.liquidus(1), 1553, 1e-9); near(C.liquidus(0), 1118, 1e-9);
  for (let T = 1130; T < 1550; T += 20) { const c = C.loop(T); assert.ok(c.xs > c.xl && c.xl > 0 && c.xs < 1, 'T=' + T); }
  near(C.liquidus(0.5), 1450, 15);
  for (const x of [0.2, 0.5, 0.8]) assert.ok(C.solidus(x) < C.liquidus(x));
  // 液相線上：liquidus(loop(T).xl) = T
  near(C.liquidus(C.loop(1400).xl), 1400, 1e-6);
  near(C.solidus(C.loop(1400).xs), 1400, 1e-6);
});

test('平衡結晶：槓桿定則守恆；完全凝固後晶體成分 = 原來的成分', () => {
  for (const x0 of [0.3, 0.6]) {
    const TL = C.liquidus(x0), TSo = C.solidus(x0);
    for (let T = TL - 1; T > TSo; T -= 15) {
      const e = C.equilibrium(x0, T);
      near(e.fs * e.xs + (1 - e.fs) * e.xl, x0, 1e-9);
      assert.ok(e.fs > 0 && e.fs < 1);
    }
    assert.strictEqual(C.equilibrium(x0, TSo - 1).xs, x0);
    assert.strictEqual(C.equilibrium(x0, TL + 1).state, 'liquid');
  }
});

test('分離結晶：質量守恆；環帶由內而外鈣變少；最後的熔體是純鈉長石', () => {
  const x0 = 0.6;
  for (const T of [1450, 1350, 1250, 1150]) {
    const f = C.fractional(x0, T);
    near(f.mean * (1 - f.F) + f.F * f.xl, x0, 1e-9, 'T=' + T);
  }
  const f = C.fractional(x0, 1100);
  near(f.zones[0].x, C.loop(C.liquidus(x0)).xs, 1e-9);
  for (let i = 1; i < f.zones.length; i++) assert.ok(f.zones[i].x <= f.zones[i - 1].x + 1e-12);
  assert.strictEqual(f.zones[f.zones.length - 1].x, 0);
  near(f.mean, x0, 1e-9);
  // 分離結晶到平衡結晶的固相線溫度時還有熔體（平衡時已經全部凝固）
  assert.ok(C.fractional(x0, C.solidus(x0)).F > 0.1);
});

console.log(`magma-crystallization-core：${passed} 項通過`);
