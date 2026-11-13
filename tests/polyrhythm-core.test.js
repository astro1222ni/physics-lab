/* 多重節奏與歐幾里得節奏：數學核心的單元測試。用法：node tests/polyrhythm-core.test.js */
'use strict';
const C = require('../js/polyrhythm-core.js');
const M = require('../js/music-theory.js');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + ' 得到 ' + JSON.stringify(a) + '，應為 ' + JSON.stringify(b)); }
function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= tol)) throw new Error((msg || '') + ' 得到 ' + a + '，應為 ' + b + '（容許 ' + tol + '）'); }
function ok(c, msg) { if (!c) throw new Error(msg || '條件不成立'); }
const S = C.toStr;
/** 窮舉 n 格裡所有 k 個重音的節奏 */
function allPatterns(n, k, fn) {
  for (let m = 0; m < (1 << n); m++) {
    let c = 0; for (let i = 0; i < n; i++) if (m >> i & 1) c++;
    if (c !== k) continue;
    const p = []; for (let i = 0; i < n; i++) p.push(m >> i & 1);
    fn(p);
  }
}

test('Bjorklund 演算法和 Toussaint (2005) 論文第 4 節的表逐字相同（24 個）', function () {
  const T = {
    '2,3': 'x.x', '2,5': 'x.x..', '3,4': 'x.xx', '3,5': 'x.x.x', '3,7': 'x.x.x..', '3,8': 'x..x..x.', '4,7': 'x.x.x.x', '4,9': 'x.x.x.x..',
    '4,11': 'x..x..x..x.', '4,12': 'x..x..x..x..', '5,6': 'x.xxxx', '5,7': 'x.xx.xx', '5,8': 'x.xx.xx.', '5,9': 'x.x.x.x.x', '5,11': 'x.x.x.x.x..',
    '5,12': 'x..x.x..x.x.', '5,13': 'x..x.x..x.x..', '5,16': 'x..x..x..x..x...', '7,8': 'x.xxxxxx', '7,12': 'x.xx.x.xx.x.',
    '7,16': 'x..x.x.x..x.x.x.', '9,16': 'x.xx.x.x.xx.x.x.', '11,24': 'x..x.x.x.x.x..x.x.x.x.x.', '13,24': 'x.xx.x.x.x.x.xx.x.x.x.x.'
  };
  Object.keys(T).forEach(function (key) { const kn = key.split(',').map(Number); eq(S(C.bjorklund(kn[0], kn[1])), T[key], 'E(' + key + ')'); });
});

test('論文裡的旋轉：bossa nova = E(5,16) 從第 3 個重音開始；森巴 = E(7,16) 從最後一個重音開始；探戈 = E(5,8) 從第 2 個重音開始', function () {
  eq(S(C.euclid(5, 16, 6)), 'x..x..x...x..x..', 'bossa nova');
  eq(S(C.euclid(7, 16, 14)), 'x.x..x.x.x..x.x.', '森巴');
  eq(S(C.euclid(5, 8, 2)), 'xx.xx.x.', '探戈');
  C.TRADITIONAL.forEach(function (t) {
    const on = C.onsets(C.bjorklund(t.k, t.n));
    eq(on[t.onset - 1], t.rot, t.id + '：旋轉格數 = 第 ' + t.onset + ' 個重音的位置');
    eq(C.nameOf(C.euclid(t.k, t.n, t.rot)).id, t.id, t.id + ' 認得出來');
  });
});

test('特例：E(0, n) 全休止、E(n, n) 每格都敲、E(1, n) 只有開頭；結果一定以重音開頭（k ≥ 1）', function () {
  eq(S(C.bjorklund(0, 5)), '.....');
  eq(S(C.bjorklund(6, 6)), 'xxxxxx');
  eq(S(C.bjorklund(1, 7)), 'x......');
  for (let n = 2; n <= 24; n++) for (let k = 1; k <= n; k++) {
    const p = C.bjorklund(k, n);
    eq(p.length, n); eq(C.count(p), k, 'E(' + k + ',' + n + ') 的重音數');
    eq(p[0], 1, 'E(' + k + ',' + n + ') 以重音開頭');
  }
});

test('重音間距只有 ⌊n/k⌋ 與 ⌈n/k⌉ 兩種（k 整除 n 時只有一種），每種的個數由 n mod k 決定', function () {
  for (let n = 2; n <= 32; n++) for (let k = 1; k <= n; k++) {
    const d = C.iois(C.bjorklund(k, n)), lo = Math.floor(n / k), hi = Math.ceil(n / k);
    ok(d.every(function (x) { return x === lo || x === hi; }), 'E(' + k + ',' + n + ') 的間距 ' + d.join('-'));
    eq(d.filter(function (x) { return x === hi; }).length, n % k === 0 ? k : n % k, 'E(' + k + ',' + n + ') 長間距的個數');
    eq(d.reduce(function (s, x) { return s + x; }, 0), n, '間距加起來 = n');
    if (M.gcd(k, n) === 1 && k > 1 && k < n) eq(new Set(d).size, 2, 'k、n 互質時剛好兩種間距');
  }
  eq(C.iois(C.fromStr('x..x..x.')).join('-'), '3-3-2', 'tresillo 3-3-2');
  eq(C.iois(C.fromStr(C.SON_CLAVE)).join('-'), '3-3-4-2-4', 'son clave 3-3-4-2-4');
});

test('gcd(k, n) = d 時，E(k, n) 是 E(k/d, n/d)（的某個旋轉）重複 d 次；最小週期 = n/d', function () {
  for (let n = 2; n <= 24; n++) for (let k = 1; k <= n; k++) {
    const d = M.gcd(k, n), p = S(C.bjorklund(k, n)), blk = p.slice(0, n / d);
    eq(p, blk.repeat(d), 'E(' + k + ',' + n + ') 是同一段重複 ' + d + ' 次');
    ok(C.rotationOf(C.fromStr(blk), C.bjorklund(k / d, n / d)) >= 0, 'E(' + k + ',' + n + ') 的一段 ' + blk + ' 是 E(' + k / d + ',' + n / d + ') 的旋轉');
    eq(C.minimalPeriod(C.bjorklund(k, n)), n / d, 'E(' + k + ',' + n + ') 的最小週期');
  }
  eq(S(C.bjorklund(6, 16)), 'x..x.x..x..x.x..', 'E(6,16)');
  eq(C.identify(C.fromStr('x..x..x.x..x..x.')).rot, 5, 'tresillo 兩次 = E(6,16) 從第 5 格開始');
});

test('Bjorklund 的步驟數 = 輾轉相除的步驟：E(5,13) 對應 EUCLID(8,5) = (5,3) → (3,2) → (2,1) → (1,0)', function () {
  const st = C.euclidSteps(8, 5);
  eq(st.map(function (s) { return s.join(':'); }).join(' '), '8:5:1:3 5:3:1:2 3:2:1:1 2:1:2:0');
  eq(st[st.length - 1][1], M.gcd(8, 5), '最後的除數是最大公因數');
});

test('窮舉 n ≤ 16：「最大均勻」（Clough–Douthett）⇔ 是 E(k, n) 的旋轉 ⇔ 弦長和最大（均勻度 = 1）', function () {
  let cases = 0;
  for (let n = 2; n <= 16; n++) for (let k = 0; k <= n; k++) {
    const best = C.chordSum(C.bjorklund(k, n));
    allPatterns(n, k, function (p) {
      cases++;
      const me = C.isMaximallyEven(p), eu = C.identify(p).euclid, cs = C.chordSum(p);
      if (me !== eu) throw new Error(S(p) + '：最大均勻 ' + me + '，歐幾里得 ' + eu);
      if (cs > best + 1e-9) throw new Error(S(p) + ' 的弦長和比 E(' + k + ',' + n + ') 大');
      if (eu !== (cs > best - 1e-9)) throw new Error(S(p) + '：弦長和最大 ' + (cs > best - 1e-9) + '，歐幾里得 ' + eu);
    });
  }
  ok(cases === (1 << 17) - 4, '檢查了 ' + cases + ' 個節奏（n = 2…16 的所有 0／1 排列）');
});

test('均勻度：E(k, n) 的任何旋轉都是 1；son clave 小於 1；全部擠在一起最低', function () {
  near(C.evenness(C.euclid(5, 16, 6)), 1, 1e-12, 'bossa nova');
  const clave = C.evenness(C.fromStr(C.SON_CLAVE));
  ok(clave < 1 && clave > 0.95, 'son clave 均勻度 ' + clave);
  eq(C.identify(C.fromStr(C.SON_CLAVE)).euclid, false, 'son clave 不是歐幾里得節奏');
  let min = Infinity, arg = '';
  allPatterns(12, 5, function (p) { const e = C.evenness(p); if (e < min - 1e-12) { min = e; arg = S(p); } });
  eq(C.iois(C.fromStr(arg)).filter(function (x) { return x === 1; }).length, 4, '均勻度最低的是 5 個連在一起（' + arg + '）');
});

test('旋轉與辨認：rotate 是循環平移、可逆；identify 找出最小的旋轉格數', function () {
  const p = C.bjorklund(7, 12);
  eq(S(C.rotate(C.rotate(p, 5), 7)), S(p), '轉 5 再轉 7 = 轉 12');
  const id = C.identify(C.euclid(7, 12, 9));
  ok(id.euclid && id.rot === 9 && id.k === 7, JSON.stringify(id));
  const sym = C.identify(C.euclid(4, 8, 6));
  eq(sym.rot, 0, 'x.x.x.x. 轉 6 格和轉 0 格一樣，取最小的 0');
  eq(C.identify(C.fromStr('xxx.....')).euclid, false);
  eq(C.pulseCount(C.fromStr('.x.x.x')), 3, '.x.x.x 是 3 個均勻的拍');
  eq(C.pulseCount(C.fromStr('x..x..x.')), 0, 'tresillo 不是均勻的拍');
});

test('合成節奏（同一個循環）：3 對 2 → 6 個細格 x.xxx.，只在開頭一起落拍；4 對 3 → 12 格', function () {
  const a = C.analyze({ mode: 'cycle', bpm: 120, voices: [{ n: 3, k: 3 }, { on: true, n: 2, k: 2 }] });
  eq(a.L, 6); eq(a.union, 'x.xxx.'); eq(a.together.join(), '0'); eq(a.gaps.join(), '6');
  near(a.cycleSec, 1.5, 1e-12, '聲部 1 三格 × 0.5 s');
  near(a.periodSec, 1.5, 1e-12, '同一個循環時週期 = 一個循環');
  const b = C.analyze({ mode: 'cycle', bpm: 120, voices: [{ n: 4, k: 4 }, { on: true, n: 3, k: 3 }] });
  eq(b.L, 12); eq(b.union, 'x..xx.x.xx..'); eq(b.nTogether, 1);
  eq(b.torus.w.join(), '4,3', '環面結纏繞數 (4, 3)：聲部 1 繞 4 圈、聲部 2 繞 3 圈');
});

test('合成節奏（同樣的格長）：n = 3 與 4 → lcm = 12 格才一起回到起點；三個聲部 lcm(13,15,16) = 3120', function () {
  const a = C.analyze({ mode: 'step', bpm: 120, voices: [{ n: 4, k: 1 }, { on: true, n: 3, k: 1 }] });
  eq(a.L, 12); eq(a.together.join(), '0'); eq(a.gaps.join(), '12');
  near(a.periodSec, 6, 1e-12, '12 格 × 0.5 s');
  const b = C.analyze({ mode: 'step', bpm: 120, voices: [{ n: 13, k: 1 }, { on: true, n: 15, k: 2 }, { on: true, n: 16, k: 3 }] });
  eq(b.L, 3120); eq(b.L, M.lcmList([13, 15, 16]));
  let max = 0;
  for (let x = 2; x <= 16; x++) for (let y = x; y <= 16; y++) for (let z = y; z <= 16; z++) max = Math.max(max, M.lcmList([x, y, z]));
  eq(max, 3120, '2–16 之間三個數的最小公倍數最大是 3120');
});

test('中國剩餘定理：同樣的格長、各只敲一下、n 互質 → 每個週期剛好一起落拍一次；n 不互質時可以永不相遇', function () {
  for (let n1 = 2; n1 <= 9; n1++) for (let n2 = 2; n2 <= 9; n2++) for (let r1 = 0; r1 < n1; r1++) for (let r2 = 0; r2 < n2; r2++) {
    const a = C.analyze({ mode: 'step', voices: [{ n: n1, k: 1, rot: r1 }, { on: true, n: n2, k: 1, rot: r2 }] });
    const g = M.gcd(n1, n2), meet = (C.mod(-r1, n1) - C.mod(-r2, n2)) % g === 0;
    eq(a.nTogether, meet ? g * a.L / (n1 * n2) * 1 : 0, n1 + ',' + n2 + ' 旋轉 ' + r1 + ',' + r2);
    if (g === 1) eq(a.nTogether, 1, '互質一定相遇一次');
  }
});

test('環面結：纏繞數互質（真正的環面結）；有對稱的節奏用最小週期；實際週期 Pmin 整除 L', function () {
  const a = C.analyze({ mode: 'cycle', voices: [{ n: 5, k: 5 }, { on: true, n: 2, k: 2 }] });
  eq(a.torus.w.join(), '5,2');
  const b = C.analyze({ mode: 'step', voices: [{ n: 8, k: 4 }, { on: true, n: 6, k: 3 }] });
  eq(b.L, 24); eq(b.Pmin, 2, 'x.x.x.x. 和 x.x.x. 每 2 格就重複'); eq(b.torus.w.join(), '1,1');
  for (let n1 = 2; n1 <= 12; n1++) for (let n2 = 2; n2 <= 12; n2++) for (const mode of ['cycle', 'step']) {
    const c = C.analyze({ mode: mode, voices: [{ n: n1, k: 2 }, { on: true, n: n2, k: 3 }] });
    if (!c.torus) continue;
    eq(M.gcd(c.torus.w[0], c.torus.w[1]), 1, '纏繞數互質');
    eq(c.L % c.Pmin, 0, 'Pmin 整除 L');
  }
});

test('互補：E(k, n) 的互補（有敲變沒敲）還是最大均勻，就是 E(n − k, n) 的旋轉', function () {
  for (let n = 2; n <= 16; n++) for (let k = 0; k <= n; k++) {
    const p = C.bjorklund(k, n), q = p.map(function (x) { return 1 - x; });
    ok(C.identify(q).euclid, 'E(' + k + ',' + n + ') 的互補 ' + S(q));
  }
});

test('自訂節奏：base 旋轉後是實際節奏；超出範圍的設定被限制住', function () {
  const v = C.normVoice({ on: true, n: 8, k: 2, rot: 3, custom: true, base: C.fromStr('xx.x....') }, 1);
  eq(v.k, 3, '自訂時 k = 重音數');
  eq(S(C.voicePattern(v)), 'x....xx.', '從 base 的第 3 格開始');
  const z = C.normVoice({ n: 99, k: -4, rot: 50, timbre: 'kazoo' }, 0);
  ok(z.n === 16 && z.k === 0 && z.rot === 15 && z.on === true && z.timbre === 'bell', JSON.stringify(z));
});

console.log(`\n${pass} 項通過，${fail} 項失敗`);
if (fail) process.exit(1);
