/* 分貝、等響曲線與聽力保護：數學核心的單元測試。用法：node tests/loudness-core.test.js */
'use strict';
const L = require('../js/loudness-core.js');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}
function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= tol)) throw new Error((msg || '') + ' 得到 ' + a + '，應為 ' + b + '（容許 ' + tol + '）'); }
function ok(c, msg) { if (!c) throw new Error(msg || '條件不成立'); }

test('ISO 226:2003 參數表：29 個頻率，三組係數各 29 個；20 Hz、1 kHz、12.5 kHz 的值', function () {
  ok(L.F.length === 29 && L.AF.length === 29 && L.LU.length === 29 && L.TF.length === 29);
  ok(L.F[0] === 20 && L.F[17] === 1000 && L.F[28] === 12500);
  ok(L.AF[0] === 0.532 && L.LU[0] === -31.6 && L.TF[0] === 78.5, '20 Hz');
  ok(L.AF[17] === 0.25 && L.LU[17] === 0 && L.TF[17] === 2.4, '1 kHz');
  ok(L.AF[28] === 0.301 && L.LU[28] === -3.1 && L.TF[28] === 12.3, '12.5 kHz');
});

test('1 kHz：響度級 = 聲壓級（20–100 phon，±0.1）——這就是 phon 的定義', function () {
  for (let ph = 20; ph <= 100; ph += 10) {
    near(L.splFromPhon(1000, ph), ph, 0.1, ph + ' phon');
    near(L.phonFromSpl(1000, ph), ph, 0.1, ph + ' dB');
  }
});

test('40 phon 等響曲線在 29 個頻率的聲壓級（ISO 226:2003 公式的輸出，±0.01 dB）', function () {
  const exp = [99.85, 93.94, 88.17, 82.63, 77.78, 73.08, 68.48, 64.37, 60.59, 56.70, 53.41, 50.40, 47.58, 44.98, 43.05, 41.34, 40.06, 40.01, 41.82, 42.51, 39.23, 36.51, 35.61, 36.65, 40.01, 45.83, 51.80, 54.28, 51.49];
  L.F.forEach(function (f, i) { near(L.splFromPhon(f, 40), exp[i], 0.006, f + ' Hz'); });
});

test('已知值：40 phon 的 100 Hz 約 64.4 dB；60 phon 的 20 Hz 約 109.5 dB；1 kHz 的聽閾 2.4 dB', function () {
  near(L.splFromPhon(100, 40), 64.37, 0.01);
  near(L.splFromPhon(20, 60), 109.51, 0.01);
  near(L.threshold(1000), 2.4, 1e-9);
});

test('正算與反算互為反函數（20 Hz–12.5 kHz、0–100 phon，到 1e-9）', function () {
  let worst = 0;
  for (let i = 0; i <= 60; i++) {
    const f = 20 * Math.pow(625, i / 60);
    for (let ph = 0; ph <= 100; ph += 5) {
      const lp = L.splFromPhon(f, ph);
      worst = Math.max(worst, Math.abs(L.phonFromSpl(f, lp) - ph));
    }
  }
  ok(worst < 1e-9, '最大誤差 ' + worst);
});

test('ISO 226 第 4.2 節的近似反算公式和精確反算相差不到 0.1 phon（有效範圍內）', function () {
  let worst = 0;
  for (let i = 0; i <= 60; i++) {
    const f = 20 * Math.pow(625, i / 60);
    for (let ph = 20; ph <= 90; ph += 5) worst = Math.max(worst, Math.abs(L.phonISO(f, L.splFromPhon(f, ph)) - ph));
  }
  ok(worst < 0.1, '最大差 ' + worst);
});

test('內插：表上的頻率剛好等於表值；表與表之間平滑、沒有 NaN；同一頻率 phon 越大聲壓級越大', function () {
  L.F.forEach(function (f, i) {
    const p = L.params(f);
    near(p.af, L.AF[i], 1e-12); near(p.Lu, L.LU[i], 1e-12); near(p.Tf, L.TF[i], 1e-12);
  });
  for (let i = 0; i <= 400; i++) {
    const f = 20 * Math.pow(625, i / 400);
    let prev = -Infinity;
    for (let ph = 0; ph <= 100; ph += 2) {
      const lp = L.splFromPhon(f, ph);
      ok(isFinite(lp) && lp > prev, f.toFixed(1) + ' Hz ' + ph + ' phon');
      prev = lp;
    }
  }
});

test('聽閾的響度級在每個頻率都約 2.4 phon（2.38–2.43；所以 1 kHz 的聽閾是 2.4 dB，不是 0 dB）', function () {
  near(L.PHON_AT_THRESHOLD, 2.4279, 1e-4);
  [20, 63, 315, 1000, 3150, 8000, 12500, 77.7].forEach(function (f) { const v = L.phonFromSpl(f, L.threshold(f)); ok(v > 2.38 && v < L.PHON_AT_THRESHOLD, f + ' Hz：' + v); });
  ok(L.phonFromSpl(1000, 2.4) > 2.3 && L.phonFromSpl(1000, 2.4) < 2.5);
});

test('低頻區等響曲線擠在一起：20 Hz 每加 1 dB 響度級約加 2 phon；1 kHz 剛好 1 phon / dB', function () {
  near(L.slope(1000, 60), 1, 0.02);
  ok(L.slope(20, L.splFromPhon(20, 40)) > 1.9, '20 Hz');
  ok(L.slope(50, L.splFromPhon(50, 40)) > 1.5, '50 Hz');
  // 20 Hz 從 40 到 50 phon（響度加倍）只要不到 6 dB
  const d = L.splFromPhon(20, 50) - L.splFromPhon(20, 40);
  ok(d > 4 && d < 6, '20 Hz 加倍要 ' + d + ' dB');
});

test('最敏感的頻率（同 phon 聲壓級最低）在 3–3.4 kHz；聽閾最低點約 3.4 kHz、−6.1 dB', function () {
  [20, 40, 60, 80].forEach(function (ph) {
    const m = L.contourMin(ph);
    ok(m.f > 3000 && m.f < 3400, ph + ' phon 的最低點在 ' + m.f);
    ok(m.Lp < ph, '比 1 kHz 低');
  });
  const t = L.contourMin(L.PHON_AT_THRESHOLD);
  ok(t.f > 3300 && t.f < 3500, '聽閾最低點 ' + t.f);
  near(t.Lp, -6.08, 0.05);
  const h = L.contourMax(40);
  ok(h.f > 9000 && h.f < 10600, '高頻的小山 ' + h.f);
});

test('響度（sone）：40 phon = 1 sone、50 phon = 2 sone、60 phon = 4 sone；40 phon 兩邊連續；反函數', function () {
  near(L.sone(40), 1, 1e-12); near(L.sone(50), 2, 1e-12); near(L.sone(60), 4, 1e-12); near(L.sone(100), 64, 1e-9);
  near(L.sone(39.9999), 1, 1e-4);
  ok(L.sone(0) === 0 && L.sone(-5) === 0 && L.sone(null) === 0);
  [0.05, 0.3, 1, 2, 7.5, 64].forEach(function (n) { near(L.sone(L.phonFromSone(n)), n, 1e-9); });
});

test('分貝相加：相同兩源 +3.01 dB；相差 10 dB 只加 0.41 dB；10 個相同聲源 +10 dB', function () {
  near(L.sumDb([70, 70]) - 70, 3.0103, 1e-4);
  near(L.sumDb([70, 60]) - 70, 0.4139, 1e-4);
  near(L.nSame(70, 10) - 70, 10, 1e-12);
  near(L.nSame(70, 2), L.sumDb([70, 70]), 1e-12);
  const m = L.mix({ L1: 70, N: 1, L2: 70, on2: true, r: 1 });
  near(m.inc, 3.0103, 1e-4);
  near(m.loudRatio, Math.pow(2, 0.30103), 1e-4);   // 兩把小提琴只響約 1.23 倍
  const m10 = L.mix({ L1: 70, N: 10, L2: 0, on2: false, r: 1 });
  near(m10.incOne, 10, 1e-12); near(m10.loudRatio, 2, 1e-12);
});

test('距離：加倍 −6.02 dB、十倍 −20 dB；4 個聲源退到 2 倍距離聲壓級不變', function () {
  near(L.atDistance(90, 2) - 90, -6.0206, 1e-4);
  near(L.atDistance(90, 10), 70, 1e-12);
  const a = L.mix({ L1: 80, N: 1, on2: false, r: 1 }), b = L.mix({ L1: 80, N: 4, on2: false, r: 2 });
  near(a.totalR, b.totalR, 1e-12);
  near(L.rFromK(4), 2, 1e-12); near(L.rFromK(-4), 0.5, 1e-12); near(L.rFromK(20), 32, 1e-12);
  near(L.kFromR(L.rFromK(7)), 7, 1e-12);
});

test('NIOSH：85 dBA 8 小時、88 dBA 4 小時、94 dBA 1 小時、100 dBA 15 分鐘；劑量；反算', function () {
  near(L.nioshHours(85), 8, 1e-12);
  near(L.nioshHours(88), 4, 1e-12);
  near(L.nioshHours(91), 2, 1e-12);
  near(L.nioshHours(94), 1, 1e-12);
  near(L.nioshHours(100) * 60, 15, 1e-9);
  near(L.dose(91, 2), 100, 1e-9); near(L.dose(85, 4), 50, 1e-9);
  near(L.levelForHours(0.25), 100, 1e-12);
  const t = L.hms(L.nioshHours(97));
  ok(t.h === 0 && t.m === 30 && t.s === 0, JSON.stringify(t));
});

test('A 加權（IEC 61672-1）：1 kHz 0 dB、100 Hz −19.1 dB、31.5 Hz（10^1.5）−39.4 dB、10 kHz −2.5 dB', function () {
  near(L.aWeight(1000), 0, 0.01);
  near(L.aWeight(100), -19.1, 0.06);
  near(L.aWeight(Math.pow(10, 1.5)), -39.4, 0.06);   // 標稱 31.5 Hz 的精確頻率是 10^1.5 = 31.62 Hz
  near(L.aWeight(10000), -2.5, 0.06);
});

test('滑桿換算：頻率滑桿 0–1000 對應 20 Hz–12.5 kHz（位置 250 剛好 100 Hz）；正反互逆', function () {
  near(L.fFromPos(0), 20, 1e-9); near(L.fFromPos(1000), 12500, 1e-6); near(L.fFromPos(250), 100, 1e-9);
  [0, 137, 608, 999].forEach(function (p) { near(L.posFromF(L.fFromPos(p)), p, 1e-9); });
});

test('analyze：聽閾以下 sone = 0、聽得到的點有 phon 與 sone；1 kHz 60 dB = 60 phon = 4 sone', function () {
  const a = L.analyze(1000, 60);
  near(a.phon, 60, 0.05); near(a.sone, 4, 0.05); ok(a.audible && a.valid);
  const b = L.analyze(50, 30);
  ok(!b.audible && b.sone === 0, '50 Hz 30 dB 聽不到');
  const c = L.analyze(3400, -3);
  ok(c.audible && c.Lp < 0, '3.4 kHz −3 dB 聽得到');
  near(a.dBA, 60, 0.01);
});

console.log('\n通過 ' + pass + ' 項，失敗 ' + fail + ' 項');
if (fail) process.exit(1);
