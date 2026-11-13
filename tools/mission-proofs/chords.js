/* 任務可達成的證明腳本。用法：node tools/mission-proofs/chords.js
 * 用核心 js/chords-core.js 證明每個任務在介面的範圍內做得到（事件資料和 js/chords.js 送出的一樣），
 * 預設狀態不觸發任何任務，每個隱藏任務的解不會順便完成另一個隱藏任務，而且模擬亂按也很少誤觸。
 * 介面：和弦 10 種、根音 C3–C5（MIDI 48–72，下拉選單與 ◀ ▶）、音律（純律／十二平均律）、轉位（0–2 或 0–3）、
 *       每個和弦音的開關（不能全關）、播放（同時／分解）、和弦正在響時改設定也會送 'play'（mode 'live'）、
 *       和弦進行 3 段 × 3 種音律（播放、點清單裡的和弦）、3D「讓曲線長出來」。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const C = require(ROOT + 'js/chords-core.js');
const M = require(ROOT + 'js/music-theory.js');
const missions = [];
global.window = { LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/chords.js');
const byId = id => missions.find(m => m.id === 'chords-' + id);

// ---------- 與 js/chords.js 相同的事件資料 ----------
const st = o => Object.assign({ type: 'major', root: 60, tuning: 'equal', inv: 0, on: [true, true, true, true] }, o);
const play = (o, mode) => ({ type: 'play', data: C.payload(C.analyze(st(o)), { mode: mode || 'block' }) });
const chord = o => ({ type: 'chord', data: C.payload(C.analyze(st(o))) });
const grow = (o, span) => ({ type: 'grow', data: C.growPayload(C.analyze(st(o)), span || C.SPAN_DEFAULT) });
const prog = (id, tonic, mode, type) => ({ type: type || 'progDone', data: C.progPayload(C.progression(id, tonic, mode)) });
const pick = (id, tonic, mode, idx) => ({ type: 'progPick', data: C.pickPayload(C.progression(id, tonic, mode), idx) });
const OFF = i => { const on = [true, true, true, true]; [].concat(i).forEach(k => { on[k] = false; }); return on; };
const ONLY = i => [0, 1, 2, 3].map(k => k === i);
const nm = m => M.noteName(m);

let fail = 0;
const found = {};
function expect(id, events, want, note) {
  const m = byId(id); m.mem = {};
  let ok = false;
  events.forEach(e => { ok = ok || !!m.check(e, m.mem); });
  const pass = ok === want;
  if (!pass) fail++;
  if (want && pass && !found[id]) found[id] = events;
  console.log((pass ? '  ✓ ' : '  ✗ ') + String(id).padEnd(4) + (want ? '達成：' : '不觸發：') + note);
}
/** 介面上所有的和弦設定 */
function* allStates(tunings) {
  for (const type of C.ORDER) {
    const n = C.CHORDS[type].semis.length;
    for (const tuning of tunings || ['just', 'equal']) for (let root = C.ROOT_LO; root <= C.ROOT_HI; root++) for (let inv = 0; inv < n; inv++) {
      for (let mask = 1; mask < (1 << n); mask++) {
        const on = [0, 1, 2, 3].map(k => k >= n || !!(mask & (1 << k)));
        yield { type: type, root: root, tuning: tuning, inv: inv, on: on };
      }
    }
  }
}
function solutions(id, make) {
  const m = byId(id), out = [];
  for (const s of allStates()) { const ev = make(s); m.mem = {}; if (m.check(ev, m.mem)) out.push(s); }
  return out;
}
const desc = s => C.CHORDS[s.type].short + ' ' + nm(s.root) + (s.tuning === 'just' ? ' 純律' : ' 平均律') + ' 轉位 ' + s.inv +
  (s.on.slice(0, C.CHORDS[s.type].semis.length).every(Boolean) ? '' : ' 開著 ' + C.CHORDS[s.type].roles.filter((r, i) => s.on[i]).join(''));

// ---------- 預設狀態 ----------
console.log('預設狀態（大三、C4、十二平均律、原位、全開）不觸發任何任務');
{
  const evs = [chord({}), play({}), play({}, 'arp'), grow({}), prog('I-IV-V-I', 60, 'equal', 'prog'), prog('I-IV-V-I', 60, 'equal'), pick('I-IV-V-I', 60, 'equal', 0), { type: 'view3d', data: { face: 'xy' } }];
  const hit = missions.filter(m => { m.mem = {}; return evs.some(e => m.check(e, m.mem)); }).map(m => m.id);
  if (hit.length) { fail++; console.log('  ✗ 預設就完成：' + hit.join('、')); }
  else console.log('  ✓ 預設設定播放、分解、3D、第一段和弦進行（平均律）都不會完成任何任務');
}

// ---------- 公開任務 ----------
console.log('\n公開任務');
expect('1', [play({ tuning: 'just' })], true, '大三 C4 純律原位：' + C.analyze(st({ tuning: 'just' })).ints.join(':'));
expect('1', [play({})], false, '平均律的大三和弦沒有整數比');
expect('2', [play({ type: 'minor', tuning: 'just' })], true, '小三 C4 純律：10:12:15，T = ' + (C.analyze(st({ type: 'minor', tuning: 'just' })).T * 1000).toFixed(2) + ' ms');
expect('2', [play({ type: 'minor', tuning: 'just', on: OFF(0) })], false, '關掉根音（12:15 = 4:5）');
expect('3', [play({ inv: 1 })], true, '大三第一轉位：最低音 E4（三音）');
expect('3', [play({ inv: 1, on: OFF(1) })], false, '三音關掉了');
expect('3', [play({ type: 'dom7', inv: 1 })], false, '七和弦不算');
expect('4', [play({ type: 'nat7', tuning: 'just' })], true, '自然七度 C4 純律：4:5:6:7（七音 ' + C.analyze(st({ type: 'nat7', tuning: 'just' })).act[3].f.toFixed(2) + ' Hz，平均律 B♭4 = ' + M.midiToFreq(70).toFixed(2) + ' Hz）');
expect('4', [play({ type: 'dom7', tuning: 'just' })], false, '屬七（5 限）是 20:25:30:36');
expect('5', [play({ tuning: 'just' }), play({ type: 'minor', tuning: 'just' })], true, 'C4 大三 T = ' + (C.analyze(st({ tuning: 'just' })).T * 1000).toFixed(3) + ' ms、小三 T = ' + (C.analyze(st({ type: 'minor', tuning: 'just' })).T * 1000).toFixed(3) + ' ms（比 2.5）');
expect('5', [play({ tuning: 'just' }), play({ type: 'minor', tuning: 'just', root: 62 })], false, '根音不同');
expect('5', [play({}), play({ type: 'minor' })], false, '平均律沒有週期');
{
  const hits = [];
  C.PROG_ORDER.forEach(id => C.PMODES.forEach(mode => C.progression(id, 60, mode).chords.forEach((c, i) => { const e = pick(id, 60, mode, i); const m = byId('6'); m.mem = {}; if (m.check(e, m.mem)) hits.push(id + ' ' + mode + ' 第 ' + i + ' 個 ' + c.roman); })));
  expect('6', [pick('I-vi-IV-V', 60, 'equal', 1)], true, '點 I–vi–IV–V 的 vi（和 I 共有 C、E，和 IV 共有 A、C）。全部解：' + hits.join('、'));
  expect('6', [pick('I-vi-ii-V-I', 60, 'equal', 1)], false, 'I–vi–ii–V–I 的 vi 和 ii 只共有 A 一個（D–F–A vs A–C–E）');
}
expect('7', [play({ type: 'dom7' }), play({ type: 'nat7', tuning: 'just' })], true, 'C4 屬七（平均律，七音 B♭4 ' + M.midiToFreq(70).toFixed(2) + ' Hz）→ 自然七度（純律，七音 ' + (M.midiToFreq(60) * 7 / 4).toFixed(2) + ' Hz，低 ' + C.analyze(st({ type: 'nat7' })).maxDev.toFixed(2) + ' 音分）');
expect('7', [play({ type: 'nat7', tuning: 'just' })], false, '只聽自然七度');
{
  const hits = [];
  C.PROG_ORDER.forEach(id => C.PMODES.forEach(mode => C.progression(id, 60, mode).chords.forEach((c, i) => { const m = byId('8'); m.mem = {}; if (m.check(pick(id, 60, mode, i), m.mem)) hits.push(id + ' ' + mode + ' ' + c.roman + ' = ' + c.tri.join(':')); })));
  expect('8', [pick('I-vi-ii-V-I', 60, 'just', 2)], true, '固定音階純律的 ii（D–F–A = ' + C.progression('I-vi-ii-V-I', 60, 'just').chords[2].tri.join(':') + '）。全部解：' + hits.join('、'));
  expect('8', [pick('I-vi-ii-V-I', 60, 'adaptive', 2)], false, '共同音不動時 ii 是純的 10:12:15');
}
{
  const sols = solutions('9', s => play(s));
  const kinds = {};
  sols.forEach(s => { const a = C.analyze(s); kinds[C.CHORDS[s.type].short + '的' + C.ROLE_NAMES[a.act[0].role][0] + '（' + a.maxDev.toFixed(2) + '）'] = 1; });
  expect('9', [play({ type: 'dim7', on: ONLY(3) })], true, 'C4 減七只留七音 A4：' + C.analyze(st({ type: 'dim7', on: ONLY(3) })).maxDev.toFixed(2) + ' 音分。可以的音：' + Object.keys(kinds).join('、'));
  expect('9', [play({ type: 'dim7' })], false, '四個音都開');
  expect('9', [play({ type: 'nat7', tuning: 'just', on: ONLY(3) })], false, '純律');
}
{
  const pre = [play({ type: 'minor', tuning: 'just' }), play({ type: 'sus4', tuning: 'just' })];
  const best = [];
  for (const s of allStates(['just'])) { if (C.CHORDS[s.type].semis.length !== 3 || !s.on.slice(0, 3).every(Boolean)) continue; const a = C.analyze(s); if (a.perRoot <= 2 + 1e-9) best.push(C.CHORDS[s.type].short + ' 轉位 ' + s.inv); }
  expect('10', pre.concat([play({ tuning: 'just', inv: 2 })]), true, '先聽小三、掛四，再聽大三第二轉位：C4 的第二轉位 G4–C5–E5 = 3:4:5，T = 2 個根音週期。T ≤ 2 個根音週期的三和弦只有：' + [...new Set(best)].join('、'));
  expect('10', [play({ tuning: 'just', inv: 2 })], false, '沒有先試過別的三和弦');
  expect('10', pre.concat([play({ tuning: 'just', inv: 1 })]), false, '大三第一轉位 5:6:8 是 4 倍');
}
{
  const byType = {};
  for (const s of allStates(['just'])) {
    if (!s.on.slice(0, C.CHORDS[s.type].semis.length).every(Boolean)) continue;
    const a = C.analyze(s);
    if (Math.abs(C.cents(a.fv / 55)) <= 3) { const k = C.CHORDS[s.type].short; (byType[k] = byType[k] || []).push(nm(s.root) + ' 轉位 ' + s.inv); }
  }
  const evs = [play({ type: 'major', root: 57, tuning: 'just' }), play({ type: 'nat7', root: 57, tuning: 'just' }), play({ type: 'maj7', root: 69, tuning: 'just' })];
  expect('11', evs, true, '大三 A3、自然七度 A3、大七 A4（虛擬基頻都是 ' + C.analyze(st({ type: 'maj7', root: 69, tuning: 'just' })).fv.toFixed(3) + ' Hz）。全部解：' + Object.keys(byType).map(k => k + '：' + byType[k].join('、')).join('；'));
  expect('11', [play({ type: 'major', root: 57, tuning: 'just' }), play({ type: 'major', root: 57, tuning: 'just', inv: 1 }), play({ type: 'nat7', root: 57, tuning: 'just' })], false, '只有兩種和弦');
}
{
  const sols = solutions('12', s => grow(s));
  expect('12', [grow({ type: 'sus4' })], true, '掛四 C4 平均律：每個純律週期錯開 ' + C.analyze(st({ type: 'sus4' })).drift.toFixed(3) + '°。全部解：' + [...new Set(sols.map(s => C.CHORDS[s.type].short + ' 轉位 ' + s.inv))].join('、'));
  expect('12', [play({ type: 'sus4' })], false, '要在 3D 讓曲線長出來');
  expect('12', [grow({ type: 'sus4', inv: 1 })], false, '第一轉位錯開 ' + C.analyze(st({ type: 'sus4', inv: 1 })).drift.toFixed(2) + '°');
}

// ---------- 隱藏任務 ----------
console.log('\n隱藏任務');
{
  const okTypes = C.ORDER.filter(t => { const m = byId('h1'); m.mem = {}; m.check(play({ type: t, tuning: 'just' }), m.mem); return m.check(play({ type: t, tuning: 'just', on: OFF(0) }, 'live'), m.mem); });
  expect('h1', [play({ tuning: 'just' }), play({ tuning: 'just', on: OFF(0) }, 'live')], true, '大三 C4 純律 4:5:6 → 關掉根音 5:6，T 都是 ' + (C.analyze(st({ tuning: 'just' })).T * 1000).toFixed(3) + ' ms。可以的和弦：' + okTypes.map(t => C.CHORDS[t].short).join('、'));
  expect('h1', [play({ type: 'minor', tuning: 'just' }), play({ type: 'minor', tuning: 'just', on: OFF(0) })], false, '小三拿掉根音 12:15 = 4:5，週期變 1/3');
  expect('h1', [play({ tuning: 'just', on: OFF(0) })], false, '沒有先聽完整的和弦');
  expect('h1', [play({ tuning: 'just' }), play({ tuning: 'just', on: OFF(1) })], false, '拿掉的是三音');
}
expect('h2', [play({ tuning: 'just' }), play({ type: 'nat7', tuning: 'just' })], true, '大三 C4 4:5:6 → 自然七度 4:5:6:7，週期都是 ' + (C.analyze(st({ tuning: 'just' })).T * 1000).toFixed(3) + ' ms');
expect('h2', [play({ type: 'minor', tuning: 'just' }), play({ type: 'min7', tuning: 'just' })], true, '小三 10:12:15 → 小七 10:12:15:18');
expect('h2', [play({ tuning: 'just' }), play({ type: 'maj7', tuning: 'just' })], false, '大七 8:10:12:15 的週期是兩倍');
expect('h2', [play({ tuning: 'just' }), play({ type: 'nat7', tuning: 'just', root: 62 })], false, '根音不同');
{
  const sols = solutions('h3', s => play(s));
  expect('h3', [play({ type: 'nat7', tuning: 'just', inv: 1 })], true, '自然七度第一轉位：' + C.analyze(st({ type: 'nat7', tuning: 'just', inv: 1 })).ints.join(':') + '（E4–G4–B♭4–C5 這樣的位置）。全部解：' + [...new Set(sols.map(s => C.CHORDS[s.type].short + ' 轉位 ' + s.inv))].join('、'));
  expect('h3', [play({ type: 'nat7', tuning: 'just' })], false, '4:5:6:7 從 4 開始');
}
expect('h4', [play({ tuning: 'just', on: OFF(1) }), play({ type: 'minor', tuning: 'just', on: OFF(1) }, 'live')], true, 'C4 大三、小三都只關三音：都是 C4–G4 = 2:3');
expect('h4', [play({ tuning: 'just', on: OFF(1) }), play({ tuning: 'just', on: OFF(1) })], false, '同一種和弦聽兩次');
expect('h4', [play({ tuning: 'just', on: OFF(1) }), play({ type: 'minor', tuning: 'just', on: OFF(1), root: 61 })], false, '根音不同');
{
  const sols = solutions('h5', s => play(s));
  expect('h5', [play({ type: 'dim7', tuning: 'just', root: 48 })], true, '減七 C3 純律：T = ' + C.analyze(st({ type: 'dim7', tuning: 'just', root: 48 })).T.toFixed(4) + ' s。全部解：' + sols.map(desc).join('、') + '（C♯3 是 ' + C.analyze(st({ type: 'dim7', tuning: 'just', root: 49 })).T.toFixed(4) + ' s）');
  expect('h5', [play({ type: 'dim7', tuning: 'just', root: 50 })], false, 'D3：' + C.analyze(st({ type: 'dim7', tuning: 'just', root: 50 })).T.toFixed(4) + ' s');
}
expect('h6', [play({ type: 'aug' }), play({ type: 'aug', inv: 1 }, 'live'), play({ type: 'aug', inv: 2 }, 'live')], true, '增三 C4 平均律原位、第一、第二轉位：每格都是 ' + C.analyze(st({ type: 'aug', inv: 1 })).gaps.map(g => g.toFixed(0)).join(' + ') + ' 音分');
expect('h6', [play({ type: 'aug', tuning: 'just' }), play({ type: 'aug', tuning: 'just', inv: 1 }), play({ type: 'aug', tuning: 'just', inv: 2 })], false, '純律的增三：' + [0, 1, 2].map(i => C.analyze(st({ type: 'aug', tuning: 'just', inv: i })).gaps.map(g => g.toFixed(1)).join('+')).join('、'));
expect('h6', [play({ type: 'aug' }), play({ type: 'aug', inv: 1 }), play({ type: 'major' }), play({ type: 'aug', inv: 2 })], false, '中間插了別的和弦');
{
  const sols = solutions('h7', s => play(s, 'arp'));
  expect('h7', [play({ type: 'dim7', tuning: 'just', inv: 1 }, 'arp')], true, '減七第一轉位純律分解：' + C.analyze(st({ type: 'dim7', tuning: 'just', inv: 1 })).gaps.map(g => g.toFixed(2)).join(' → ') + ' 音分。全部解：' + [...new Set(sols.map(s => C.CHORDS[s.type].short + ' 轉位 ' + s.inv))].join('、'));
  expect('h7', [play({ type: 'dim7', tuning: 'just', inv: 1 })], false, '同時播放（不是一步一步走）');
  expect('h7', [play({ type: 'dim7', tuning: 'just', inv: 2 }, 'arp')], false, '第二轉位的窄縫在中間');
}
{
  const sols = solutions('h8', s => play(s));
  const kinds = {};
  sols.forEach(s => { const a = C.analyze(s); kinds[C.CHORDS[s.type].short + ' ' + a.act.map(t => t.role).join('') + ' ' + a.ints.join(':')] = 1; });
  const ex = st({ type: 'dim', tuning: 'just', root: 69, on: OFF(1) }), ea = C.analyze(ex);
  expect('h8', [play(ex)], true, '減三 A4 純律只留根音與五音：A4–E♭5 = ' + ea.ints.join(':') + '，虛擬基頻 ' + ea.fv.toFixed(2) + ' Hz。共 ' + sols.length + ' 個設定，種類：' + Object.keys(kinds).join('、'));
  expect('h8', [play({ type: 'dim', tuning: 'just', root: 68, on: OFF(1) })], false, '根音 G♯4 低於 A4');
  expect('h8', [play({ type: 'aug', tuning: 'just', on: OFF(1) })], false, '增三 C4 的 16:25 雖然只有 16.4 Hz，但 C4 不夠高');
  expect('h8', [play(ex, 'live')], false, '要按「▶ 播放和弦」');
}
expect('h9', [grow({ type: 'min7', tuning: 'just', on: OFF(0) }), grow({ type: 'major', tuning: 'just', root: 63 })], true, 'C4 小七去掉根音（E♭4–G4–B♭4 = 4:5:6）→ E♭4 大三（4:5:6）：同一個結');
expect('h9', [grow({ type: 'maj7', tuning: 'just', on: OFF(0) }), grow({ type: 'minor', tuning: 'just', root: 64 })], true, 'C4 大七去掉根音（E–G–B = 10:12:15）→ E 小三');
expect('h9', [grow({ type: 'nat7', tuning: 'just', on: OFF(3) }), grow({ type: 'major', tuning: 'just' })], false, '自然七度關掉七音就是大三和弦本身（兩個都有根音）');
expect('h9', [grow({ type: 'min7', on: OFF(0) }), grow({ type: 'major', root: 63 })], false, '平均律的曲線不閉合');
expect('h10', [prog('I-vi-ii-V-I', 60, 'adaptive'), pick('I-vi-ii-V-I', 60, 'adaptive', 0), pick('I-vi-ii-V-I', 60, 'adaptive', 4)], true, '共同音不動 I–vi–ii–V–I 播完，最後的 I 低 ' + C.progression('I-vi-ii-V-I', 60, 'adaptive').drift.toFixed(3) + ' 音分；接著點第一個 I 和最後一個 I 比一比');
expect('h10', [pick('I-vi-ii-V-I', 60, 'adaptive', 0), pick('I-vi-ii-V-I', 60, 'adaptive', 4)], false, '沒有先聽完整段');
expect('h10', [prog('I-vi-ii-V-I', 60, 'just'), pick('I-vi-ii-V-I', 60, 'just', 0), pick('I-vi-ii-V-I', 60, 'just', 4)], false, '固定音階不漂移');
expect('h10', [prog('I-vi-IV-V', 60, 'adaptive'), pick('I-vi-IV-V', 60, 'adaptive', 0), pick('I-vi-IV-V', 60, 'adaptive', 3)], false, 'I–vi–IV–V 不漂移');

// ---------- 隱藏任務兩兩不連帶完成 ----------
console.log('\n隱藏任務的解不會順便完成另一個隱藏任務');
{
  const hidden = missions.filter(m => m.hidden);
  let bad = 0;
  hidden.forEach(h => {
    const evs = found[h.id.replace('chords-', '')];
    if (!evs) { bad++; console.log('  ✗ ' + h.id + ' 沒有解'); return; }
    // 達成之前一定會經過的設定也送 'chord' 事件
    const pre = [];
    evs.forEach(e => { if (e.data && e.data.type && C.CHORDS[e.data.type]) pre.push({ type: 'chord', data: Object.assign({}, e.data) }); });
    const all = [];
    evs.forEach((e, i) => { all.push(pre[i] || e); all.push(e); });
    const others = hidden.filter(o => o !== h).filter(o => { o.mem = {}; return all.some(e => o.check(e, o.mem)); }).map(o => o.id);
    if (others.length) { bad++; console.log('  ✗ ' + h.id + ' 的解也完成了 ' + others.join('、')); }
    else console.log('  ✓ ' + h.id + ' 的解不會完成其他隱藏任務');
  });
  if (bad) fail++;
}

// ---------- 亂按模擬 ----------
const RUNS = 2000, STEPS = 80;
console.log('\n亂按模擬（' + RUNS + ' 回 × ' + STEPS + ' 步，17 種動作隨機挑；和弦播放後接下來 5 步內改設定都算「正在聽」）');
{
  let seed = 20261113;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const pickI = n => Math.floor(rnd() * n);
  const counts = {};
  for (let run = 0; run < RUNS; run++) {
    missions.forEach(m => { m.mem = {}; m.doneRun = false; });
    const s = st({}); s.on = [true, true, true, true];
    let ptype = 'I-IV-V-I', pmode = 'equal', sounding = 0, heard = null;
    const nOf = () => C.CHORDS[s.type].semis.length;
    for (let step = 0; step < STEPS; step++) {
      const a = pickI(17);
      const evs = [];
      let changed = false;
      if (a === 0) { s.type = C.ORDER[pickI(10)]; if (s.inv >= nOf()) s.inv = 0; if (!s.on.slice(0, nOf()).some(Boolean)) s.on = [true, true, true, true]; changed = true; }
      else if (a === 1) { s.tuning = s.tuning === 'just' ? 'equal' : 'just'; changed = true; }
      else if (a === 2) { s.inv = pickI(nOf()); changed = true; }
      else if (a === 3) { const k = pickI(nOf()); s.on[k] = !s.on[k]; if (!s.on.slice(0, nOf()).some(Boolean)) s.on[k] = true; else changed = true; }
      else if (a === 4) { s.root = Math.max(C.ROOT_LO, s.root - 1); changed = true; }
      else if (a === 5) { s.root = Math.min(C.ROOT_HI, s.root + 1); changed = true; }
      else if (a === 6) { s.root = C.ROOT_LO + pickI(C.ROOT_HI - C.ROOT_LO + 1); changed = true; }
      else if (a === 7) { /* 音色：不影響任務 */ }
      else if (a === 8) { evs.push(play(Object.assign({}, s, { on: s.on.slice() }))); sounding = 5; }
      else if (a === 9) { evs.push(play(Object.assign({}, s, { on: s.on.slice() }), 'arp')); sounding = 0; }
      else if (a === 10) sounding = 0;
      else if (a === 11) ptype = C.PROG_ORDER[pickI(3)];
      else if (a === 12) pmode = C.PMODES[pickI(3)];
      else if (a === 13) { evs.push(prog(ptype, s.root, pmode, 'prog'), prog(ptype, s.root, pmode)); sounding = 0; }
      else if (a === 14) { const p = C.progression(ptype, s.root, pmode); evs.push(pick(ptype, s.root, pmode, pickI(p.chords.length))); sounding = 0; }
      else if (a === 15) evs.push(grow(Object.assign({}, s, { on: s.on.slice() }), C.SPAN_DEFAULT));
      else evs.push({ type: 'view3d', data: { face: ['xy', 'yz', 'xz', 'iso'][pickI(4)] } });
      if (changed) evs.push(sounding > 0 ? play(Object.assign({}, s, { on: s.on.slice() }), 'live') : chord(Object.assign({}, s, { on: s.on.slice() })));
      if (sounding > 0 && a !== 8) sounding--;
      evs.forEach(ev => missions.forEach(m => { if (!m.doneRun && m.check(ev, m.mem)) { m.doneRun = true; counts[m.id] = (counts[m.id] || 0) + 1; } }));
    }
  }
  const pct = m => 100 * (counts[m.id] || 0) / RUNS;
  console.log('  ' + missions.map(m => m.id + (m.hidden ? '（隱藏 ' : '（') + m.level + ' 級）' + pct(m).toFixed(2) + '%').join('\n  '));
  const risky = missions.filter(m => (m.hidden || m.level >= 6) && pct(m) >= 5);
  if (risky.length) { fail++; console.log('  ✗ 隱藏任務或 6 級以上的任務，亂按完成的比例達到 5%：' + risky.map(m => m.id + ' ' + pct(m).toFixed(1) + '%').join('、')); }
  else console.log('  ✓ 隱藏任務與 6 級以上的任務，亂按完成的比例都不到 5%');
}

// ---------- 總覽 ----------
const pub = missions.filter(m => !m.hidden), hid = missions.filter(m => m.hidden);
const starsOf = m => (m.hidden ? 2 : 1) * m.level;
const stars = missions.reduce((s, m) => s + starsOf(m), 0);
console.log(`\n公開 ${pub.length} 個、隱藏 ${hid.length} 個，共 ${stars} 顆星（公開 ${pub.reduce((s, m) => s + m.level, 0)}、隱藏 ${hid.reduce((s, m) => s + starsOf(m), 0)}，隱藏任務是等級 × 2）。`);
if (hid.length !== 10) { fail++; console.log('隱藏任務要 10 個。'); }
if (hid.filter(m => m.level >= 7).length < 3) { fail++; console.log('隱藏任務至少 3 個要在 7 級以上。'); }
if (hid.some(m => m.level < 3 || m.level > 10)) { fail++; console.log('隱藏任務的等級要在 3–10。'); }
if (hid.some(m => starsOf(m) > 20)) { fail++; console.log('隱藏任務超過 20 顆星（規則上限）。'); }
if (pub.length < 10 || pub.length > 12) { fail++; console.log('公開任務要 10–12 個。'); }
if (missions.some(m => m.hidden ? !(m.riddle && m.riddle.zh && m.riddle.en) : !(m.title && m.desc && m.desc.zh && m.desc.en))) { fail++; console.log('有任務缺中英文說明。'); }
const ids = missions.map(m => m.id);
if (new Set(ids).size !== ids.length) { fail++; console.log('任務代號重複。'); }
if (fail) { console.log(`有 ${fail} 項不符合。`); process.exit(1); }
console.log('全部任務都證明做得到，預設狀態不觸發，隱藏任務之間不連帶完成，亂按很少誤觸。');
