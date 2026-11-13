/* 和弦的頻率比：數學核心的單元測試。用法：node tests/chords-core.test.js */
'use strict';
const C = require('../js/chords-core.js');
const M = require('../js/music-theory.js');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}
function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= tol)) throw new Error((msg || '') + ' 得到 ' + a + '，應為 ' + b + '（容許 ' + tol + '）'); }
function ok(c, msg) { if (!c) throw new Error(msg || '條件不成立'); }
const eq = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const A = o => C.analyze(Object.assign({ root: 60, tuning: 'just', inv: 0 }, o));

test('純律整數比：大三 4:5:6、小三 10:12:15、減三 25:30:36、增三 16:20:25、掛四 6:8:9', function () {
  ok(eq(A({ type: 'major' }).ints, [4, 5, 6]));
  ok(eq(A({ type: 'minor' }).ints, [10, 12, 15]));
  ok(eq(A({ type: 'dim' }).ints, [25, 30, 36]));
  ok(eq(A({ type: 'aug' }).ints, [16, 20, 25]));
  ok(eq(A({ type: 'sus4' }).ints, [6, 8, 9]));
});

test('七和弦：屬七（5 限）20:25:30:36、大七 8:10:12:15、小七 10:12:15:18、減七 125:150:180:216、自然七度 4:5:6:7', function () {
  ok(eq(A({ type: 'dom7' }).ints, [20, 25, 30, 36]));
  ok(eq(A({ type: 'maj7' }).ints, [8, 10, 12, 15]));
  ok(eq(A({ type: 'min7' }).ints, [10, 12, 15, 18]));
  ok(eq(A({ type: 'dim7' }).ints, [125, 150, 180, 216]));
  ok(eq(A({ type: 'nat7' }).ints, [4, 5, 6, 7]));
});

test('每種和弦的純律音程都是純音程：疊起來的三度是 6/5 或 5/4；和根音的音程是 4/3、3/2、15/8、9/5 或 7/4', function () {
  const r = (t, i, j) => C.CHORDS[t].just[j] / C.CHORDS[t].just[i];
  near(r('dim', 0, 1), 6 / 5, 1e-12); near(r('dim', 1, 2), 6 / 5, 1e-12);
  near(r('aug', 0, 1), 5 / 4, 1e-12); near(r('aug', 1, 2), 5 / 4, 1e-12);
  for (let k = 0; k < 3; k++) near(r('dim7', k, k + 1), 6 / 5, 1e-12, '減七第 ' + k + ' 個小三度');
  near(r('sus4', 0, 1), 4 / 3, 1e-12); near(r('sus4', 0, 2), 3 / 2, 1e-12);
  near(r('maj7', 0, 3), 15 / 8, 1e-12); near(r('dom7', 0, 3), 9 / 5, 1e-12); near(r('min7', 0, 3), 9 / 5, 1e-12); near(r('nat7', 0, 3), 7 / 4, 1e-12);
  // 純律比值和十二平均律的半音數一致（差不到 50 音分）
  C.ORDER.forEach(function (t) {
    const c = C.CHORDS[t];
    c.semis.forEach(function (s, i) { ok(Math.abs(C.cents(c.just[i] / c.just[0]) - 100 * s) < 50, t + ' 第 ' + i + ' 個音'); });
  });
});

test('自然七度 7/4 = 968.826 音分，比平均律的小七度（1000 音分）低 31.174 音分', function () {
  near(C.cents(7 / 4), 968.8259064691249, 1e-9);
  const a = A({ type: 'nat7', tuning: 'equal' });
  near(a.maxDev, 1000 - C.cents(7 / 4), 1e-9, '平均律 − 純律');
  near(a.maxDev, 31.174, 1e-3);
  ok(a.maxDevRole === '7', '差最多的是七音');
  near(A({ type: 'major' }).devs[1], 400 - C.cents(5 / 4), 1e-9, '大三度 +13.686');
  near(A({ type: 'minor' }).devs[1], 300 - C.cents(6 / 5), 1e-9, '小三度 −15.641');
  near(A({ type: 'sus4' }).devs[2], 700 - C.cents(3 / 2), 1e-9, '五度 −1.955');
});

test('轉位不改變音類：每種和弦、每個轉位，音名集合都一樣；第 k 轉位的最低音是第 k 個和弦音', function () {
  C.ORDER.forEach(function (t) {
    const n = C.CHORDS[t].semis.length;
    const base = A({ type: t }).act.map(x => M.mod(x.midi, 12)).sort((a, b) => a - b).join(',');
    for (let inv = 0; inv < n; inv++) {
      for (const tu of ['just', 'equal']) {
        const a = A({ type: t, inv: inv, tuning: tu });
        ok(a.act.map(x => M.mod(x.midi, 12)).sort((a, b) => a - b).join(',') === base, t + ' 轉位 ' + inv);
        ok(a.bassRole === C.CHORDS[t].roles[inv], t + ' 轉位 ' + inv + ' 的最低音');
        for (let i = 1; i < a.act.length; i++) ok(a.act[i].f > a.act[i - 1].f, '由低到高排列');
        ok(a.act[a.act.length - 1].f / a.act[0].f < 2, '轉位後的和弦在一個八度以內');
      }
    }
  });
});

test('週期公式：T = 1 / f_v，f_v = 根音頻率 × 最大公因數 ÷ 根音的整數；每個音在 T 裡剛好振動整數次，而且 T 是最短的', function () {
  C.ORDER.forEach(function (t) {
    for (let r = C.ROOT_LO; r <= C.ROOT_HI; r += 7) {
      const a = A({ type: t, root: r });
      const f0 = M.midiToFreq(r);
      near(a.T, C.CHORDS[t].just[0] / f0, 1e-12, t + ' 原位的週期 = 根音的整數 ÷ 根音頻率');
      a.act.forEach(function (x, i) { near(x.f * a.T, a.ints[i], 1e-9, t + ' 的第 ' + i + ' 個音振動整數次'); });
      ok(M.gcdList(a.ints) === 1, '整數比已約分');
      near(a.fv, 1 / a.T, 1e-9);
    }
  });
  // 大三和弦 C4：T = 4 / 261.63 = 15.289 ms，虛擬基頻 65.41 Hz = C2
  const a = A({ type: 'major' });
  near(a.T * 1000, 15.289, 1e-3);
  ok(C.nearestNote(a.fv).name === 'C2' && Math.abs(C.nearestNote(a.fv).off) < 1e-6, '虛擬基頻是 C2');
  near(A({ type: 'minor' }).T / a.T, 2.5, 1e-12, '小三和弦的週期是大三和弦的 2.5 倍');
});

test('合成波形在純律時每隔 T 完全重複；平均律不會', function () {
  const P = C.TIMBRES.organ;
  ['major', 'minor', 'dom7', 'nat7', 'sus4'].forEach(function (t) {
    const a = A({ type: t }), fs = a.act.map(x => x.f);
    for (let j = 0; j < 40; j++) { const tt = j * 0.0007; near(C.waveAt(fs, P, tt + a.T), C.waveAt(fs, P, tt), 1e-8, t + ' x(t + T) = x(t)'); }
    const e = A({ type: t, tuning: 'equal' }), fe = e.act.map(x => x.f);
    let maxd = 0;
    for (let j = 0; j < 40; j++) { const tt = j * 0.0007; maxd = Math.max(maxd, Math.abs(C.waveAt(fe, P, tt + a.T) - C.waveAt(fe, P, tt))); }
    ok(maxd > 1e-3, t + ' 平均律在純律的週期之後對不上（差 ' + maxd.toFixed(4) + '）');
  });
  // 李薩如曲線：純律閉合
  const a = A({ type: 'major' }), fs = a.act.map(x => x.f);
  for (let j = 0; j < 20; j++) {
    const t0 = j * 0.0013, p = C.lissajous(fs, t0), q = C.lissajous(fs, t0 + a.T);
    near(p.x, q.x, 1e-9); near(p.y, q.y, 1e-9); near(p.z, q.z, 1e-9);
  }
});

test('平均律的漂移：大三和弦在第 4 個根音週期時錯開 (4·2^(1/3) − 5) 週 ≈ 14.29°；掛四只錯開 3.66°；前 100 個低音週期都不會剛好重複', function () {
  const maj = A({ type: 'major', tuning: 'equal' });
  near(maj.drift, (4 * Math.pow(2, 4 / 12) - 5) * 360, 1e-9);
  near(maj.drift, 14.286, 1e-3);
  const sus = A({ type: 'sus4', tuning: 'equal' });
  near(sus.drift, (9 - 6 * Math.pow(2, 7 / 12)) * 360, 1e-9, '掛四：五音比純五度低，錯開最多');
  near(sus.drift, 3.657, 1e-3);
  C.ORDER.forEach(function (t) {
    const n = C.CHORDS[t].semis.length;
    for (let inv = 0; inv < n; inv++) {
      const e = A({ type: t, inv: inv, tuning: 'equal' });
      ok(e.near.deg > 0.5, t + ' 轉位 ' + inv + ' 最接近重複仍錯開 ' + e.near.deg.toFixed(2) + '°');
      ok(e.T === null && e.ints === null, '平均律沒有週期');
      const j = A({ type: t, inv: inv });
      ok(j.drift === 0 && j.near.deg === 0, '純律不漂移');
    }
  });
});

test('三個音都開的三和弦裡，平均律每個週期錯開不到 4° 的只有原位的掛四和弦', function () {
  const hits = [];
  C.TRIADS.forEach(function (t) { for (let inv = 0; inv < 3; inv++) { const e = A({ type: t, inv: inv, tuning: 'equal' }); if (e.drift < 4) hits.push(t + inv); } });
  ok(hits.join() === 'sus40', hits.join());
});

test('轉位與週期：大三和弦第二轉位 3:4:5 的週期是原位的一半；減三第一、二轉位也減半；其他三和弦不變', function () {
  near(A({ type: 'major', inv: 2 }).T, A({ type: 'major' }).T / 2, 1e-12);
  ok(eq(A({ type: 'major', inv: 2 }).ints, [3, 4, 5]));
  ok(eq(A({ type: 'major', inv: 1 }).ints, [5, 6, 8]));
  near(A({ type: 'dim', inv: 1 }).T, A({ type: 'dim' }).T / 2, 1e-12);
  ['minor', 'aug', 'sus4'].forEach(function (t) { for (let inv = 1; inv < 3; inv++) near(A({ type: t, inv: inv }).T, A({ type: t }).T, 1e-12, t + ' 轉位 ' + inv); });
  // 三個音都開的三和弦裡，週期最短的是大三和弦第二轉位（2 個根音週期）
  let best = null;
  C.TRIADS.forEach(function (t) { for (let inv = 0; inv < 3; inv++) { const a = A({ type: t, inv: inv }); if (!best || a.perRoot < best.p - 1e-9) best = { t: t, inv: inv, p: a.perRoot }; } });
  ok(best.t === 'major' && best.inv === 2 && Math.abs(best.p - 2) < 1e-9, JSON.stringify(best));
  ok(eq(A({ type: 'nat7', inv: 1 }).ints, [5, 6, 7, 8]), '自然七度第一轉位 5:6:7:8');
});

test('個別音的開關：拿掉大三和弦的根音，週期不變（缺基頻）；拿掉三音剩 2:3，週期減半；大三、小三拿掉三音都是 2:3', function () {
  const full = A({ type: 'major' }), noRoot = A({ type: 'major', on: [false, true, true] });
  ok(eq(noRoot.ints, [5, 6])); near(noRoot.T, full.T, 1e-12);
  ok(eq(noRoot.fullJ.ints, [4, 5, 6]) && Math.abs(noRoot.fullJ.T - full.T) < 1e-12, '全部開著的週期');
  const no3 = A({ type: 'major', on: [true, false, true] });
  ok(eq(no3.ints, [2, 3])); near(no3.T, full.T / 2, 1e-12);
  ok(eq(A({ type: 'minor', on: [true, false, true] }).ints, [2, 3]), '小三拿掉三音也是 2:3');
  near(A({ type: 'minor', on: [false, true, true] }).T, A({ type: 'minor' }).T / 3, 1e-12, '小三拿掉根音 12:15 = 4:5，週期變成 1/3');
  ok(eq(A({ type: 'min7', on: [false, true, true, true] }).ints, [4, 5, 6]), '小七和弦拿掉根音 = 純的大三和弦');
  ok(eq(A({ type: 'maj7', on: [false, true, true, true] }).ints, [10, 12, 15]), '大七和弦拿掉根音 = 純的小三和弦');
  ok(eq(A({ type: 'dom7', on: [false, true, true, true] }).ints, [25, 30, 36]), '屬七和弦拿掉根音 = 減三和弦');
  ok(A({ type: 'major', on: [false, false, false] }).count === 0, '全部關掉時沒有音');
});

test('加一個音不一定讓週期變長：自然七度 4:5:6:7 和大三和弦一樣；小七和小三一樣；屬七（5 限）是大三的 5 倍', function () {
  near(A({ type: 'nat7' }).T, A({ type: 'major' }).T, 1e-12);
  near(A({ type: 'min7' }).T, A({ type: 'minor' }).T, 1e-12);
  near(A({ type: 'dom7' }).T, 5 * A({ type: 'major' }).T, 1e-12);
  near(A({ type: 'maj7' }).T, 2 * A({ type: 'major' }).T, 1e-12);
});

test('對稱的和弦：平均律的增三和弦每個轉位都是 400 + 400（加上回到八度的 400）；純律的不是（缺口 427.37 = 128/125 的小迪西斯 + 386.31）', function () {
  for (let inv = 0; inv < 3; inv++) {
    const e = A({ type: 'aug', inv: inv, tuning: 'equal' });
    e.gaps.forEach(g => near(g, 400, 1e-9)); near(e.wrap, 400, 1e-9);
  }
  const j = A({ type: 'aug' });
  near(j.wrap, 1200 - 2 * C.cents(5 / 4), 1e-9);
  near(j.wrap - C.cents(5 / 4), C.cents(128 / 125), 1e-9, '三個純大三度比八度少一個小迪西斯');
  // 減七：平均律四等分；純律三個 6/5 之後回到八度只剩 250/216
  for (let inv = 0; inv < 4; inv++) { const e = A({ type: 'dim7', inv: inv, tuning: 'equal' }); e.gaps.forEach(g => near(g, 300, 1e-9)); }
  near(A({ type: 'dim7' }).wrap, C.cents(250 / 216), 1e-9);
  ok(A({ type: 'dim7', inv: 1 }).gaps.some(g => Math.abs(g - C.cents(250 / 216)) < 1e-9), '轉位後的純律減七有一個 253.1 音分的窄縫');
});

test('最慢的週期：純律減七和弦在 C3 的週期 = 125 / 130.81 Hz ≈ 0.956 秒；三和弦裡最慢的是減三 C3 的 0.191 秒', function () {
  near(A({ type: 'dim7', root: 48 }).T, 125 / M.midiToFreq(48), 1e-12);
  near(A({ type: 'dim7', root: 48 }).T, 0.95558, 1e-4);
  let worst = 0;
  C.TRIADS.forEach(function (t) { for (let r = C.ROOT_LO; r <= C.ROOT_HI; r++) worst = Math.max(worst, A({ type: t, root: r }).T); });
  near(worst, 25 / M.midiToFreq(48), 1e-12);
});

test('和弦進行（純律・固定音階）：I、IV、V 是 4:5:6，vi 是 10:12:15，ii 是 27:32:40（D–A 只有 40/27）', function () {
  const p = C.progression('I-vi-ii-V-I', 60, 'just');
  const tri = p.chords.map(c => c.tri.join(':'));
  ok(eq(tri, ['4:5:6', '10:12:15', '27:32:40', '4:5:6', '4:5:6']), tri.join(' '));
  ok(eq(p.chords.map(c => c.pure), [true, true, false, true, true]));
  near(p.drift, 0, 1e-12);
  const q = C.progression('I-vi-IV-V', 60, 'just');
  ok(q.chords.every(c => c.pure), 'I–vi–IV–V 全部是純的');
  ok(C.progression('I-IV-V-I', 67, 'just').chords.every(c => c.pure), '換一個調也一樣');
  // 共同音被兩個和弦共用，頻率完全相同
  const I = p.chords[0], vi = p.chords[1];
  const fI = {}; I.notes.forEach(x => { fI[x.midi] = x.f; });
  vi.notes.forEach(x => { if (fI[x.midi] != null) near(x.f, fI[x.midi], 1e-9, '共同音 ' + M.noteName(x.midi)); });
});

test('和弦進行（純律・共同音不動）：I–vi–ii–V–I 每個和弦都純，最後的 I 比開頭低一個同音差 81/80（−21.506 音分）；其他進行不漂移', function () {
  const p = C.progression('I-vi-ii-V-I', 60, 'adaptive');
  ok(p.chords.every(c => c.pure), p.chords.map(c => c.tri.join(':')).join(' '));
  near(p.drift, -C.cents(81 / 80), 1e-9);
  near(p.drift, -21.506, 1e-3);
  // ii 的根音 = 10/9（而不是音階的 9/8），V 的根音 = 40/27
  near(p.chords[2].rootCents, C.cents((10 / 9) / (9 / 8)), 1e-9);
  near(p.chords[3].rootCents, C.cents((40 / 27) / (3 / 2)), 1e-9);
  // 共同音真的不動：相鄰兩個和弦共有的音，頻率相同
  for (let k = 1; k < p.chords.length; k++) {
    const prev = {}; p.chords[k - 1].notes.forEach(x => { prev[M.mod(x.midi, 12)] = x.f / Math.pow(2, Math.floor(x.midi / 12)); });
    p.chords[k].notes.forEach(x => { const pc = M.mod(x.midi, 12); if (prev[pc] != null) near(x.f / Math.pow(2, Math.floor(x.midi / 12)), prev[pc], 1e-9, '第 ' + k + ' 個和弦的共同音 ' + M.noteName(x.midi)); });
  }
  ['I-IV-V-I', 'I-vi-IV-V'].forEach(id => near(C.progression(id, 60, 'adaptive').drift, 0, 1e-9, id));
  C.PROG_ORDER.forEach(id => { const e = C.progression(id, 60, 'equal'); near(e.drift, 0, 1e-12); ok(e.chords.every(c => !c.pure && c.tri === null)); });
});

test('和弦進行的共同音與聲部：I–vi–IV–V 的 vi 和前後都有兩個共同音；IV→V 沒有共同音；上方三個聲部每一步總共移動不超過 6 個半音', function () {
  const p = C.progression('I-vi-IV-V', 60, 'equal');
  ok(eq(p.chords.map(c => c.commonPrev), [null, 2, 2, 0]));
  ok(p.chords[1].commonNext === 2 && p.chords[1].commonPrev === 2);
  ok(C.PROG_ORDER.every(id => C.progression(id, 60, 'equal').chords.every(c => !(c.commonPrev === 2 && c.commonNext === 2) || (id === 'I-vi-IV-V' && c.roman === 'vi'))), '只有 I–vi–IV–V 的 vi 前後都是 2 個');
  C.PROG_ORDER.forEach(function (id) {
    for (let t = C.ROOT_LO; t <= C.ROOT_HI; t++) {
      const v = C.voiceProg(id, t);
      for (let k = 1; k < v.length; k++) {
        let d = 0; for (let i = 0; i < 3; i++) d += Math.abs(v[k].upper[i] - v[k - 1].upper[i]);
        ok(d <= 6, id + ' 主音 ' + t + ' 第 ' + k + ' 步移動 ' + d);
      }
      v.forEach(x => ok(x.bass < x.upper[0] && x.bass >= Math.max(t - 17, 33) && x.bass <= t + 6 && M.midiToFreq(x.bass) >= 55 - 1e-9, '低音在上方聲部之下、不低於 55 Hz'));
      v.forEach(x => ok(M.midiToFreq(x.upper[2]) <= 1760, '最高音不超過 1760 Hz'));
    }
  });
});

test('頻率範圍與對數滑桿：和弦的音都在 130–1600 Hz；顯示時間 2–1000 ms 的滑桿可以來回換算', function () {
  let lo = Infinity, hi = 0;
  C.ORDER.forEach(function (t) {
    const n = C.CHORDS[t].semis.length;
    for (let r = C.ROOT_LO; r <= C.ROOT_HI; r++) for (let inv = 0; inv < n; inv++) for (const tu of ['just', 'equal']) {
      A({ type: t, root: r, inv: inv, tuning: tu }).act.forEach(x => { lo = Math.min(lo, x.f); hi = Math.max(hi, x.f); });
    }
  });
  ok(lo >= 130 && hi <= 1600, lo + '–' + hi);
  ok(hi < 4000, '純音色最高的音不到 4 kHz（不需要耳機提醒）');
  for (let p = 0; p <= 1000; p += 37) near(C.posFromSpan(C.spanFromPos(p)), p, 1e-9);
  near(C.spanFromPos(0), 2, 1e-12); near(C.spanFromPos(1000), 1000, 1e-9);
  near(C.spanFromPos(Math.round(C.posFromSpan(40))), 40, 0.5);
});

test('音名拼法：依和弦的字母拼（C 減七 = C、E♭、G♭、B♭♭；E 增三的五音是 B♯；黑鍵根音用 D♭、E♭、F♯、A♭、B♭）', function () {
  const names = (o) => C.analyze(Object.assign({ root: 60, tuning: 'equal', inv: 0 }, o)).tones.map(x => x.name).join(' ');
  ok(names({ type: 'dim7' }) === 'C4 E♭4 G♭4 B♭♭4', names({ type: 'dim7' }));
  ok(names({ type: 'aug', root: 64 }) === 'E4 G♯4 B♯4', names({ type: 'aug', root: 64 }));
  ok(names({ type: 'dom7' }) === 'C4 E4 G4 B♭4');
  ok(names({ type: 'major', root: 61 }) === 'D♭4 F4 A♭4', names({ type: 'major', root: 61 }));
  ok(names({ type: 'major', inv: 2 }) === 'G4 C5 E5', '轉位後八度跟著音走');
  ok(names({ type: 'major', root: 59, inv: 1 }) === 'D♯4 F♯4 B4', names({ type: 'major', root: 59, inv: 1 }));
  ok(names({ type: 'sus4', root: 66 }) === 'F♯4 B4 C♯5');
  const p = C.progression('I-IV-V-I', 65, 'equal');
  ok(p.chords.map(c => c.name).join(' ') === 'F B♭ C F', p.chords.map(c => c.name).join(' '));
  ok(C.progression('I-vi-ii-V-I', 70, 'equal').chords.map(c => c.name).join(' ') === 'B♭ Gm Cm F B♭');
  // 拼出來的音名和 MIDI 編號一致（字母 + 升降 + 八度 = 同一個鍵）
  const midiOf = s => { const m = /^([A-G])((?:♯|♭)*)(-?\d+)$/.exec(s); return { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2].split('♯').length - 1) - (m[2].split('♭').length - 1) + 12 * (+m[3] + 1); };
  C.ORDER.forEach(ty => { for (let r = C.ROOT_LO; r <= C.ROOT_HI; r++) for (let inv = 0; inv < C.CHORDS[ty].semis.length; inv++) C.analyze({ type: ty, root: r, inv: inv }).tones.forEach(x => ok(midiOf(x.name) === x.midi, ty + ' ' + r + ' ' + x.name)); });
  C.PROG_ORDER.forEach(id => { for (let r = C.ROOT_LO; r <= C.ROOT_HI; r++) C.progression(id, r, 'equal').chords.forEach(c => c.notes.forEach(x => ok(midiOf(x.name) === x.midi, id + ' ' + r + ' ' + x.name))); });
});

test('任務事件資料：可以轉成 JSON、數值和分析相同', function () {
  const a = A({ type: 'nat7', inv: 1 }), d = C.payload(a, { mode: 'block' });
  const j = JSON.parse(JSON.stringify(d));
  ok(eq(j.ints, [5, 6, 7, 8]) && j.mode === 'block' && j.count === 4 && j.full && j.bassRole === '3');
  near(j.T, a.T, 1e-6);
  const p = JSON.parse(JSON.stringify(C.progPayload(C.progression('I-vi-ii-V-I', 60, 'adaptive'))));
  near(p.drift, -21.506, 1e-3); ok(p.chords.length === 5 && p.chords[2].roman === 'ii');
});

console.log(`\n${pass} 項通過${fail ? `，${fail} 項失敗` : ''}。`);
process.exit(fail ? 1 : 0);
