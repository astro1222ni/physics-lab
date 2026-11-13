/* 合成器的 ADSR 包絡：數學核心的單元測試。用法：node tests/adsr-envelope-core.test.js */
'use strict';
const C = require('../js/adsr-envelope-core.js');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}
function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= tol)) throw new Error((msg || '') + ' 得到 ' + a + '，應為 ' + b + '（容許 ' + tol + '）'); }
function ok(c, msg) { if (!c) throw new Error(msg || '條件不成立'); }
const P = function (o) { return C.norm(Object.assign({ A: 0.1, D: 0.5, S: 0.4, R: 0.8, shape: 'exp' }, o)); };
const shapes = ['lin', 'exp'];
// 亂數（固定種子）
let seed = 13579;
const rnd = function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const randP = function () {
  return C.norm({ A: C.TIME.fromPos(Math.round(rnd() * 1000)), D: C.TIME.fromPos(Math.round(rnd() * 1000)), S: Math.round(rnd() * 100) / 100,
    R: C.TIME.fromPos(Math.round(rnd() * 1000)), shape: rnd() < 0.5 ? 'lin' : 'exp' });
};

test('對數時間滑桿：0 → 0.005 s、1000 → 4 s，顯示的值就是實際的值（三位有效數字），換算互為反函數', function () {
  near(C.TIME.fromPos(0), 0.005, 0); near(C.TIME.fromPos(1000), 4, 0);
  near(C.HOLD.fromPos(0), 0.05, 0); near(C.HOLD.fromPos(1000), 4, 0);
  for (let p = 0; p <= 1000; p++) {
    const v = C.TIME.fromPos(p);
    ok(v === Number(v.toPrecision(3)), '第 ' + p + ' 格不是整齊的值：' + v);
    ok(Math.abs(C.TIME.toPos(v) - p) <= 1, '第 ' + p + ' 格換回來是 ' + C.TIME.toPos(v));
    if (p) ok(v >= C.TIME.fromPos(p - 1), '不是遞增');
  }
});

test('起音結束時振幅剛好是 1（線性與指數），起音從 0 開始而且一路往上', function () {
  shapes.forEach(function (sh) {
    const p = P({ shape: sh });
    near(C.level(p.A, p), 1, 1e-12, sh);
    near(C.level(0, p), 0, 0, sh);
    let prev = 0;
    for (let i = 1; i <= 100; i++) { const v = C.level(p.A * i / 100, p); ok(v >= prev - 1e-15, sh + ' 起音沒有一路往上'); prev = v; }
  });
  // 指數起音（電容充電）：一半的時間就超過一半
  ok(C.attackCurve(0.5, 'exp') > 0.75, '指數起音在一半時間應超過 0.75');
  near(C.attackCurve(0.5, 'lin'), 0.5, 1e-15);
});

test('衰減結束時剛好等於延持 S，之後按著就一直是 S（各種 S、兩種形狀）', function () {
  shapes.forEach(function (sh) {
    [0, 0.0005, 0.01, 0.25, 0.6, 1].forEach(function (S) {
      const p = P({ shape: sh, S: S });
      near(C.level(p.A + p.D, p), S, 1e-12, sh + ' S=' + S);
      near(C.level(p.A + p.D + 3.7, p), S, 0, sh + ' S=' + S);
      near(C.level(p.A + p.D - 1e-9, p), S, sh === 'exp' && S < 0.001 ? 0.0011 : 1e-6, sh + ' S=' + S + '（從左邊逼近）');
    });
  });
});

test('提早放開：釋音從「當時的值」開始（不是從 S），花 R 秒落到 0', function () {
  shapes.forEach(function (sh) {
    const p = P({ shape: sh, A: 0.4, D: 1, S: 0.2 });
    [0.1, 0.3, 0.7, 1.2, 2].forEach(function (hold) {
      const a0 = C.pressLevel(hold, p);
      near(C.level(hold, p, hold), a0, 1e-12, '放開瞬間連續（' + sh + ', ' + hold + '）');
      near(C.level(hold + 1e-9, p, hold), a0, 1e-6, '放開後立刻（' + sh + '）');
      near(C.level(hold + p.R - 1e-9, p, hold), 0, sh === 'exp' ? 0.0011 * a0 : 1e-6, '釋音結束前一刻（' + sh + '）');
      near(C.level(hold + p.R + 1e-9, p, hold), 0, 0, '釋音結束後是 0（' + sh + '）');
      ok(C.level(hold + p.R / 2, p, hold) < a0, '釋音是往下的');
    });
    // 起音途中放開：起點比 S 高或低都可以
    ok(C.pressLevel(0.3, p) > p.S && C.releasePhase(0.3, p) === 'A');
    ok(C.releasePhase(0.9, p) === 'D' && C.releasePhase(1.5, p) === 'S');
  });
});

test('指數衰減在分貝刻度上是直線：斜率處處相同，等於 20 log₁₀(S) ÷ D；釋音斜率 −60 dB ÷ R', function () {
  [0.5, 0.1, 0.25, 0.01].forEach(function (S) {
    const p = P({ S: S, D: 1.3 });
    const sl = C.slopeD(p);
    near(sl, 20 * Math.log10(S) / 1.3, 1e-12);
    for (let i = 1; i < 20; i++) {
      const t0 = p.A + p.D * i / 21, t1 = p.A + p.D * (i + 1) / 21;
      near((C.db(C.level(t1, p)) - C.db(C.level(t0, p))) / (t1 - t0), sl, 1e-6, 'S=' + S + ' 第 ' + i + ' 小段');
    }
  });
  const p = P({ S: 0.6, R: 2 });
  const hold = 1.5;
  for (let i = 1; i < 30; i++) {
    const t0 = hold + p.R * i / 31, t1 = hold + p.R * (i + 1) / 31;
    near((C.db(C.level(t1, p, hold)) - C.db(C.level(t0, p, hold))) / (t1 - t0), -30, 1e-6, '釋音第 ' + i + ' 小段');
  }
  // 線性衰減在分貝刻度上是往下彎的（斜率越來越陡）
  const q = P({ shape: 'lin', S: 0, D: 1 });
  const s1 = C.db(C.level(q.A + 0.2, q)) - C.db(C.level(q.A + 0.1, q));
  const s2 = C.db(C.level(q.A + 0.9, q)) - C.db(C.level(q.A + 0.8, q));
  ok(s2 < s1 * 3, '線性衰減後段在分貝上應該更陡');
});

test('時間常數與半衰期：每過 τ 振幅變成 1/e、每過 t½ = τ ln 2 變成一半；指數釋音的 τ = R ÷ ln 1000、t½ ≈ R ÷ 9.97', function () {
  const p = P({ S: 0.2, D: 2 });
  const tau = C.tauD(p), th = C.half(tau);
  near(tau, 2 / Math.log(5), 1e-12);
  near(th, tau * Math.LN2, 1e-15);
  const t0 = p.A + 0.3;
  near(C.level(t0 + tau, p) / C.level(t0, p), Math.exp(-1), 1e-9, '過 τ 變 1/e');
  near(C.level(t0 + th, p) / C.level(t0, p), 0.5, 1e-9, '過 t½ 變一半');
  const tr = C.tauR(p);
  near(tr, 0.8 / Math.log(1000), 1e-12);
  near(C.half(tr), 0.8 * Math.LN2 / Math.log(1000), 1e-12);
  near(0.8 / C.half(tr), 9.966, 0.001, '60 dB ÷ 6.02 dB = 9.97 個半衰期');
  near(C.level(1 + C.half(tr), p, 1) / C.level(1, p, 1), 0.5, 1e-9, '釋音過 t½ 變一半');
  // 半衰期 1 秒、衰減兩個半衰期（S = 1/4）：D = 2 s
  const q = P({ S: 0.25, D: 2 });
  near(C.half(C.tauD(q)), 1, 1e-12);
  // 延持 S = 1 沒有衰減；線性沒有固定的時間常數
  ok(C.tauD(P({ S: 1 })) === Infinity && C.tauD(P({ shape: 'lin' })) === null && C.tauR(P({ shape: 'lin' })) === null);
});

test('分貝：20 log₁₀ a；−6.02 dB 是一半、−10 dB 約 0.316、−60 dB 是千分之一', function () {
  near(C.db(0.5), -6.0206, 1e-4); near(C.fromDb(-10), 0.31623, 1e-5); near(C.db(0.001), -60, 1e-12);
  ok(C.db(0) === -Infinity);
  for (let i = 0; i < 50; i++) { const a = rnd(); near(C.fromDb(C.db(a)), a, 1e-12); }
});

test('倒放：a_rev(t) = a(L − t)，L = H + R；開頭是釋音的尾巴、結尾是起音倒過來（突然結束）', function () {
  shapes.forEach(function (sh) {
    const p = P({ shape: sh, S: 0, D: 2, A: 0.01, R: 0.3 });
    const H = 1.5, L = H + p.R;
    for (let i = 1; i < 50; i++) { const t = L * i / 50; near(C.revLevel(t, p, H), C.level(L - t, p, H), 1e-15); }
    ok(C.revLevel(L - 0.005, p, H) > 0.4, '結尾前一刻還很大（' + sh + '）');
    ok(C.revLevel(0.05, p, H) < C.revLevel(L - 0.05, p, H), '倒放是越來越大');
    near(C.revLevel(0, p, H), 0, 0); near(C.revLevel(L, p, H), 0, 0);
  });
  // 線性、S = 1、A = R：倒放和正放一模一樣（鏡像對稱）
  const m = P({ shape: 'lin', S: 1, A: 0.5, R: 0.5 });
  for (let i = 0; i <= 40; i++) { const t = 2.5 * i / 40; near(C.revLevel(t, m, 2), C.level(t, m, 2), 1e-12, '鏡像 t=' + t); }
  // 指數就不對稱
  const e = P({ shape: 'exp', S: 1, A: 0.5, R: 0.5 });
  ok(Math.abs(C.revLevel(0.25, e, 2) - C.level(0.25, e, 2)) > 0.05, '指數起音和指數釋音不是鏡像');
});

test('發聲的保護下限：起音至少 15 ms、釋音至少 30 ms（倒放時對調）；畫面上的值不變', function () {
  const p = P({ A: 0.005, R: 0.005 });
  const s = C.soundParams(p, false), r = C.soundParams(p, true);
  near(s.A, 0.015, 0); near(s.R, 0.03, 0); near(r.A, 0.03, 0); near(r.R, 0.015, 0);
  near(p.A, 0.005, 0);
  const q = P({ A: 1, R: 2 });
  near(C.soundParams(q).A, 1, 0); near(C.soundParams(q).R, 2, 0);
});

test('包絡永遠在 0–1 之間、放開後不會變大（500 組隨機設定）', function () {
  for (let n = 0; n < 500; n++) {
    const p = randP(), hold = C.HOLD.fromPos(Math.round(rnd() * 1000));
    let prev = Infinity;
    for (let i = 0; i <= 200; i++) {
      const t = (hold + p.R) * 1.1 * i / 200;
      const v = C.level(t, p, hold);
      ok(v >= 0 && v <= 1 + 1e-12 && isFinite(v), '超出範圍');
      if (t > hold) { ok(v <= prev + 1e-12, '釋音變大了'); prev = v; }
    }
  }
});

test('降到 −20 dB 的時刻：S = 0 的指數衰減在 A + D/3；延持比 −20 dB 高就永遠不會到', function () {
  const p = P({ S: 0, D: 1.5, A: 0.5 });
  near(C.timeToDb(p, -20), 0.5 + 0.5, 1e-9);
  near(C.timeToDb(P({ S: 0.01, D: 2, A: 0.2 }), -20), 0.2 + 1, 1e-9);
  ok(C.timeToDb(P({ S: 0.2 }), -20) === Infinity);
  near(C.timeToDb(P({ shape: 'lin', S: 0, D: 1, A: 0 + 0.1 }), -20), 0.1 + 0.9, 1e-9, '線性：振幅 0.1 在 90% 處');
});

test('聽得到的長度（−40 dB 以上）：短促的打擊只有幾個週期', function () {
  const p = P({ A: 0.005, D: 0.012, S: 0, R: 0.005 });
  const sp = C.audibleSpan(p, { hold: 0.05 }, -40);
  // 起音（指數）在極短時間內過 −40 dB；衰減 −40 dB 在 A + 2D/3
  near(sp.t1, 0.005 + 0.008, 1e-6);
  ok(sp.dur > 0.012 && sp.dur < 0.0131, '長度 ' + sp.dur);
  const r = C.releaseData(Object.assign({ N: 8, f0: C.KEYS[0].f, held: 0.05 }, p));
  ok(r.cycles < 4, '週期數 ' + r.cycles);
  // 一直有延持的音（S = 0.5 = −6.02 dB）：放開後再掉 33.98 dB 就到 −40 dB，釋音每秒掉 60/R dB
  const q = P({ A: 0.1, D: 0.2, S: 0.5, R: 0.6 });
  const sq = C.audibleSpan(q, { hold: 1 }, -40);
  near(sq.t1, 1 + 0.6 * (40 + C.db(0.5)) / 60, 1e-6);
});

test('高泛音衰減較快：第 k 個泛音的分貝是包絡分貝的 1 + 0.25(k − 1) 倍；音色變暗（頻譜重心變小），關掉時音色不變', function () {
  const e = 0.1, N = 8;
  const a = C.partialAmps(e, N, true), b = C.partialAmps(1, N, true);
  for (let k = 1; k <= N; k++) near(C.db(a[k - 1] / b[k - 1]), C.qOf(k, true) * C.db(e), 1e-9, '第 ' + k + ' 個');
  near(C.qOf(5, true), 2, 0);
  ok(C.brightRatio(0.1, N, true) < C.brightRatio(0.5, N, true) && C.brightRatio(0.5, N, true) < 1, '越小聲越暗');
  near(C.brightRatio(1, N, true), 1, 1e-12);
  [0.9, 0.3, 0.01, 0].forEach(function (x) { near(C.brightRatio(x, N, false), 1, 1e-12, '沒有高泛音衰減：重心不變'); });
  near(C.centroidAt(0, N, true), 1, 0, '完全安靜時剩下基頻');
  // 基本頻譜 1/k：頻譜重心 = Σ(1/k) ÷ Σ(1/k²)
  let h1 = 0, h2 = 0; for (let k = 1; k <= N; k++) { h1 += 1 / k; h2 += 1 / (k * k); }
  near(C.centroidAt(1, N, false), h1 / h2, 1e-12);
});

test('品質因數 Q = π f τ：基頻 261.63 Hz、τ = 1.2167 s → Q ≈ 1000', function () {
  near(C.qFactor(261.6256, 1000 / (Math.PI * 261.6256)), 1000, 1e-9);
  near(C.KEYS[0].f, 261.6256, 1e-4); near(C.KEYS[5].f, 440, 1e-12); near(C.KEYS[7].f, 523.2511, 1e-4);
  ok(C.qFactor(440, null) === null && C.qFactor(440, Infinity) === null);
});

test('預設：鋼琴與撥弦、打擊沒有延持；風琴全延持；弦樂慢起音、慢釋音；都在滑桿範圍內、是三位有效數字（程式用 LabNum.set 設定）', function () {
  const pr = C.PRESETS;
  ok(pr.piano.S === 0 && pr.pluck.S === 0 && pr.perc.S === 0 && pr.organ.S === 1);
  ok(pr.strings.A >= 0.5 && pr.strings.R >= 1 && pr.piano.D > pr.pluck.D && pr.pluck.D > pr.perc.D);
  C.PRESET_IDS.forEach(function (id) {
    const p = pr[id];
    ['A', 'D', 'R'].forEach(function (k) { ok(p[k] >= C.T_MIN && p[k] <= C.T_MAX && C.quant(p[k]) === p[k], id + ' 的 ' + k + ' 不在範圍內或不是三位有效數字'); });
  });
  const d = C.DEFAULT;
  ['A', 'D', 'R'].forEach(function (k) { ok(C.quant(d[k]) === d[k] && d[k] >= C.T_MIN && d[k] <= C.T_MAX, '預設的 ' + k); });
  ok(d.H >= C.H_MIN && d.H <= C.H_MAX, '預設按住時間');
});

test('任務資料：放開時的段落、振幅、時間常數一致', function () {
  const s = { A: 0.5, D: 1, S: 0.3, R: 1, shape: 'exp', N: 8, high: false, f0: 440, held: 0.25, source: 'play' };
  const r = C.releaseData(s);
  ok(r.phase === 'A' && r.aRel > 0 && r.aRel < 1);
  near(r.aRel, C.attackCurve(0.5, 'exp'), 1e-12);
  near(r.tauD, 1 / Math.log(1 / 0.3), 1e-12);
  near(r.Q, Math.PI * 440 * r.tauD, 1e-9);
  const v = C.releaseData(Object.assign({}, s, { rev: true, held: 2, complete: true }));
  ok(v.rev && v.phase === null && v.aRel === null && v.complete);
  const e = C.envData(Object.assign({}, s, { H: 1, scale: 'db', touched: true }));
  ok(e.scale === 'db' && e.touched && e.H === 1 && e.t20 === Infinity);
});

console.log('\n' + pass + ' 項通過，' + fail + ' 項失敗');
if (fail) process.exit(1);
