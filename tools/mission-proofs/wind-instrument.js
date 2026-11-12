/* 任務可達成的證明腳本。用法：node tools/mission-proofs/wind-instrument.js
 * 用物理核心（js/wind-instrument-core.js 的 analyze）模擬頁面發出的事件（格式與 js/wind-instrument.js 相同），證明：
 *   1. 每個任務在滑桿範圍與精度內做得到（印出找到的解）；
 *   2. 預設狀態（預設的管子、三種近似尺寸、直笛預設的 C5、吹氣中切換樂器）不觸發任何任務；
 *   3. 隱藏任務兩兩不連帶：做某個隱藏任務的完整步驟，不會順便完成其他隱藏任務；
 *   4. 亂按模擬（2000 回 × 80 步）：6 級以上的公開任務亂按完成率 < 5%，隱藏任務 < 1%；
 *   5. 任務數量與等級符合規格（公開 10–12 個、隱藏 10 個、隱藏等級 3–10 且至少 3 個 ≥ 7、同一級最多 2 個隱藏任務）。
 * 滑桿精度：管長 0.001 m、內徑 0.1 mm、氣溫 0.1 °C、頭管 0.1 mm；點數字打字：管長 0.0001 m、其他 0.01。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const W = require(ROOT + 'js/wind-instrument-core.js');
const missions = [];
global.window = { LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/wind-instrument.js');
const byId = id => missions.find(m => m.id === 'wind-instrument-' + id);
const cents = r => 1200 * Math.log2(r);
const grid = (v, step) => Math.round(Math.round(v / step) * step * 1e6) / 1e6;
const STEP = { L: 0.001, d: 0.1, T: 0.1, pull: 0.1 };
const TYPED = { L: 0.0001, d: 0.01, T: 0.01, pull: 0.01 };
const RANGE = { L: W.RANGES.L, d: W.RANGES.d, T: W.RANGES.T, pull: W.RANGES.pull };
const PRESETS = {
  flute: { type: 'open', L: 0.645, d: 19, corr: 'unflanged' },
  clarinet: { type: 'closed', L: 0.58, d: 15, corr: 'unflanged' },
  pan: { type: 'closed', L: 0.1915, d: 12, corr: 'unflanged' }
};

// ---------- 和頁面相同的狀態與事件 ----------
function Sim() {
  const st = { inst: 'tube', type: 'open', L: 0.645, d: 19, T: 20, m: 1, corr: 'unflanged', holes: W.FINGERINGS.C5.slice(), pull: 0, blow: false, breath: 0, hist: [] };
  const ev = [];
  const info = () => W.analyze({ inst: st.inst, type: st.type, L: st.L, d: st.d, T: st.T, m: st.m, corr: st.corr, holes: st.holes, pull: st.pull });
  const lite = (inf, breath) => ({ inst: inf.inst, type: inf.type, L: inf.L, d: inf.d, T: inf.T, v: inf.v, m: inf.m, n: inf.n, corr: inf.corr,
    holes: inf.holes ? inf.holes.slice() : null, fing: inf.fing, pull: inf.pull, f: inf.f, midi: inf.midi, name: inf.name, cents: inf.cents, breath: breath });
  function note(via, changed) {
    const inf = info();
    const prev = st.hist[0] || null;
    ev.push({ type: 'note', data: JSON.parse(JSON.stringify(Object.assign({}, inf, { via: via, changed: changed || null, breath: st.breath, prev: prev, hist: st.hist.slice() }))) });
    st.hist.unshift(lite(inf, st.breath));
    if (st.hist.length > 12) st.hist.pop();
  }
  function changed(what) { if (st.blow) note('change', what); }
  const api = {
    st, ev, info,
    blow() { if (!st.blow) { st.blow = true; st.breath++; note('blow'); } return api; },
    stop() { st.blow = false; return api; },
    clear() { st.blow = false; st.hist = []; return api; },
    inst(id) { if (st.inst !== id) { st.inst = id; changed('inst'); } return api; },
    /** 滑桿（typed = true 表示點數字打字，精度較細） */
    set(field, v, typed) {
      const R = RANGE[field];
      v = grid(Math.max(R[0], Math.min(R[1], v)), (typed ? TYPED : STEP)[field]);
      if (field === 'L' || field === 'd') { if (st.inst !== 'tube') throw new Error('直笛模式不能改 ' + field); }
      st[field] = v;
      changed(field);
      return api;
    },
    type(t) { if (st.inst === 'tube' && st.type !== t) { st.type = t; changed('type'); } return api; },
    mode(m) { if (st.inst === 'tube' && st.m !== m) { st.m = m; changed('m'); } return api; },
    corr(c) { if (st.inst === 'tube' && st.corr !== c) { st.corr = c; changed('corr'); } return api; },
    preset(id) { const p = PRESETS[id]; Object.assign(st, p, { m: 1 }); changed('preset'); return api; },
    hole(k) { if (st.inst !== 'recorder') return api; const s = st.holes[k]; st.holes[k] = k === 0 ? (s === 0 ? 0.5 : s === 0.5 ? 1 : 0) : (s === 0 ? 1 : 0); changed('hole'); return api; },
    fing(name) { st.inst = 'recorder'; st.holes = W.FINGERINGS[name].slice(); changed('fing'); return api; }
  };
  return api;
}
/** 依序把事件送進任務；傳回完成的任務代號 */
function run(evs, list) {
  list = list || missions;
  list.forEach(m => { m.mem = {}; });
  const done = new Set();
  evs.forEach(e => list.forEach(m => { if (!done.has(m.id) && m.check(e, m.mem)) done.add(m.id); }));
  return done;
}
let fail = 0;
const f2 = v => v.toFixed(2);
function prove(id, sim, msg) {
  const m = byId(id);
  const ok = run(sim.ev, [m]).has(m.id);
  if (!ok) fail++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + m.id + (m.hidden ? '（隱藏 ' : '（') + m.level + ' 級）' + msg);
  return sim;
}
function expectNot(id, sim, msg) {
  const m = byId(id);
  const ok = !run(sim.ev, [m]).has(m.id);
  if (!ok) fail++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + m.id + ' 反例：' + msg);
}
/** 滑桿格點上找最接近目標的值（找不到就改用打字精度） */
function bestL(f, type, m, d, corr, T, tol) {
  const want = W.lengthFor(f, type, m, d, corr, T);
  for (const typed of [false, true]) {
    const L = grid(want, typed ? TYPED.L : STEP.L);
    const a = W.analyze({ inst: 'tube', type, L, d, T, m, corr });
    if (Math.abs(cents(a.f / f)) <= tol) return { L, typed, c: cents(a.f / f) };
  }
  return null;
}
const mtF = n => 440 * Math.pow(2, (require(ROOT + 'js/music-theory.js').parseNote(n) - 69) / 12);

// =====================================================================
console.log('一、每個任務都做得到（模擬頁面的操作與事件）');
{
  // 1. 直笛的 Sol
  let s = Sim().inst('recorder').fing('G5').blow();
  prove('1', s, '：直笛按 G5 指法吹 → ' + f2(s.info().f) + ' Hz（' + s.info().name + ' ' + f2(s.info().cents) + ' 音分）');
  // 2. 拇指半開
  s = Sim().inst('recorder').fing('E5').hole(0).blow();
  prove('2', s, '：E5 指法＋拇指孔點一下（半開）→ ' + f2(s.info().f) + ' Hz（' + s.info().name + '，第 ' + s.info().m + ' 模式）');
  // 3. 蓋住一端
  s = Sim().blow().type('closed');
  const e3 = s.ev;
  prove('3', s, '：預設開管 0.645 m 吹 ' + f2(e3[0].data.f) + ' Hz，吹氣中換閉管 → ' + f2(e3[1].data.f) + ' Hz，低 ' + f2(cents(e3[0].data.f / e3[1].data.f)) + ' 音分');
  // 4. 閉管十二度
  s = Sim().type('closed').blow().mode(2);
  prove('4', s, '：閉管第 1 模式 ' + f2(s.ev[0].data.f) + ' Hz → 第 2 模式 ' + f2(s.ev[1].data.f) + ' Hz（' + f2(cents(s.ev[1].data.f / s.ev[0].data.f)) + ' 音分）');
  // 5. 標準音 A4
  const a5 = bestL(440, 'open', 1, 19, 'unflanged', 20, 1e9);
  s = Sim().set('L', a5.L).blow();
  prove('5', s, '：開管、內徑 19 mm、管長拖到 ' + a5.L + ' m → ' + f2(s.info().f) + ' Hz');
  expectNot('5', Sim().set('L', a5.L + 0.002).blow(), '管長 ' + grid(a5.L + 0.002, 0.001) + ' m 是 ' + f2(Sim().set('L', a5.L + 0.002).info().f) + ' Hz，超出 ±1 Hz');
  // 6. 夏天與冬天
  s = Sim().inst('recorder').fing('G5').set('T', 5).blow().stop().set('T', 35).blow();
  prove('6', s, '：直笛 G5，5 °C 吹 ' + f2(s.ev[0].data.f) + ' Hz、35 °C 吹 ' + f2(s.ev[1].data.f) + ' Hz（差 ' + f2(cents(s.ev[1].data.f / s.ev[0].data.f)) + ' 音分）');
  expectNot('6', Sim().inst('recorder').fing('G5').set('T', 5).blow().stop().set('T', 35).fing('A5').blow(), '換了指法不算');
  // 7. C 大調音階
  s = Sim().inst('recorder').blow();
  W.SCALE.slice(1).forEach(n => s.fing(n));
  prove('7', s, '：吹氣中依序按 C5 → C6 八個指法：' + s.ev.map(e => e.data.name).join(' '));
  // 8. 叉指
  s = Sim().inst('recorder').fing('G5').blow().hole(5);
  prove('8', s, '：G5 吹氣中按住第 5 孔 → ' + f2(s.ev[1].data.f) + ' Hz（' + f2(cents(s.ev[1].data.f / s.ev[0].data.f)) + ' 音分）');
  const s8 = Sim().inst('recorder').fing('G5').blow().hole(6);
  expectNot('8', s8, '只按住第 6 孔：' + f2(cents(s8.ev[1].data.f / s8.ev[0].data.f)) + ' 音分，不夠');
  // 9. 管口修正
  s = Sim().set('L', 0.3).set('d', 25).corr('none').blow().corr('unflanged');
  prove('9', s, '：開管 0.30 m、內徑 25 mm，「不計」' + f2(s.ev[0].data.f) + ' Hz → 0.61 r ' + f2(s.ev[1].data.f) + ' Hz（' + f2(cents(s.ev[1].data.f / s.ev[0].data.f)) + ' 音分）');
  const s9 = Sim().corr('none').blow().corr('unflanged');
  expectNot('9', s9, '預設的長笛尺寸（0.645 m、19 mm）也會降 ' + f2(-cents(s9.ev[1].data.f / s9.ev[0].data.f)) + ' 音分，但不是「短而粗」');
  // 10. 長笛與單簧管一樣高
  s = Sim().type('closed').set('L', 0.3).blow().stop().type('open').set('L', 0.6).blow();
  prove('10', s, '：同內徑 19 mm，閉管 0.30 m ' + f2(s.ev[0].data.f) + ' Hz、開管 0.60 m ' + f2(s.ev[1].data.f) + ' Hz（差 ' + f2(cents(s.ev[1].data.f / s.ev[0].data.f)) + ' 音分）：開管剛好 2 倍長（閉管加 δ、開管加 2δ）');
  expectNot('10', Sim().preset('flute').blow().stop().preset('clarinet').blow(), '長笛與單簧管的近似尺寸（內徑不同、音也差了將近一個八度又一個全音）');
  // 11. 夏天的音樂會
  let pull11 = null;
  for (let p = 0.1; p <= 10; p = grid(p + 0.1, 0.1)) { const a = W.analyze({ inst: 'recorder', T: 30, holes: W.FINGERINGS.A5, pull: p }); if (a.name === 'A5' && Math.abs(a.cents) <= 2) { pull11 = p; break; } }
  s = Sim().inst('recorder').set('T', 30).fing('A5').set('pull', pull11).blow();
  prove('11', s, '：30 °C 時 A5 偏高 ' + f2(W.analyze({ inst: 'recorder', T: 30, holes: W.FINGERINGS.A5, pull: 0 }).cents) + ' 音分，頭管拉出 ' + pull11 + ' mm → ' + s.info().name + ' ' + f2(s.info().cents) + ' 音分');
  // 12. A4 的六種吹法
  s = Sim();
  const sol12 = [];
  ['open', 'closed'].forEach(t => [1, 2, 3].forEach(m => {
    const b = bestL(440, t, m, 19, 'unflanged', 20, 3);
    s.type(t).mode(m).set('L', b.L, b.typed).blow().stop();
    sol12.push((t === 'open' ? '開' : '閉') + m + ' ' + b.L + ' m（' + f2(b.c) + '）');
  }));
  prove('12', s, '：內徑 19 mm、20 °C：' + sol12.join('、'));
}

console.log('\n二、隱藏任務做得到');
const hiddenSol = {};
{
  let s;
  // h1 課本的 340
  const T1 = grid(W.tempFor(340), 0.01);
  s = Sim().set('T', T1, true).blow();
  hiddenSol.h1 = s; prove('h1', s, '：氣溫打字 ' + T1 + ' °C → v = ' + s.info().v.toFixed(4) + ' m/s');
  expectNot('h1', Sim().set('T', 14.3).blow(), '滑桿 14.3 °C 是 ' + W.soundSpeed(14.3).toFixed(3) + ' m/s、14.4 °C 是 ' + W.soundSpeed(14.4).toFixed(3) + ' m/s，都不到');
  // h2 只靠溫度升半音（從準的音到下一個準的音）
  const b2 = bestL(mtF('B3'), 'open', 1, 19, 'unflanged', 0, 2);
  s = Sim().set('T', 0).set('L', b2.L, b2.typed).blow().stop().set('T', 32.5).blow();
  hiddenSol.h2 = s; prove('h2', s, '：0 °C 把開管調到 ' + b2.L + ' m（' + s.ev[0].data.name + ' ' + f2(s.ev[0].data.cents) + ' 音分），32.5 °C 再吹 → ' + s.ev[1].data.name + ' ' + f2(s.ev[1].data.cents) + ' 音分（升 ' + f2(cents(s.ev[1].data.f / s.ev[0].data.f)) + ' 音分）');
  expectNot('h2', Sim().set('T', 0).blow().stop().set('T', 32.5).blow(), '預設管長 0 °C 是 ' + Sim().set('T', 0).info().name + ' ' + f2(Sim().set('T', 0).info().cents) + ' 音分，不準（雖然也升了 100 音分）');
  expectNot('h2', Sim().set('T', 0).set('L', b2.L, b2.typed).blow().stop().set('T', 32.5).set('d', 20).blow(), '同時改了內徑');
  // h3 兩條路同一個 C6
  s = Sim().inst('recorder').fing('C6').blow().fing('C5').hole(0);
  hiddenSol.h3 = s; prove('h3', s, '：C6 叉指 ' + f2(s.ev[0].data.f) + ' Hz、拇指半開的 C5 ' + f2(s.ev[2].data.f) + ' Hz（差 ' + f2(cents(s.ev[2].data.f / s.ev[0].data.f)) + ' 音分）');
  const s3 = Sim().inst('recorder').set('pull', 3).fing('C6').blow().fing('C5').hole(0);
  expectNot('h3', s3, '頭管拉出 3 mm：兩者差 ' + f2(cents(s3.ev[2].data.f / s3.ev[0].data.f)) + ' 音分');
  // h4 拇指全開的 D6
  s = Sim().inst('recorder').hole(0).hole(0).hole(1).hole(3).hole(4).hole(5).hole(6).hole(7).blow();
  hiddenSol.h4 = s; prove('h4', s, '：拇指孔全開、只按第 2 孔 → ' + f2(s.info().f) + ' Hz（' + s.info().name + ' ' + f2(s.info().cents) + ' 音分）');
  const s4 = Sim().inst('recorder').hole(0).hole(0).hole(3).hole(4).hole(5).hole(6).hole(7).blow();
  expectNot('h4', s4, '拇指全開、按第 1、2 孔（真的直笛的 C♯6）是 ' + s4.info().name + ' ' + f2(s4.info().cents) + ' 音分');
  // h5 閉管第 2 模式 = 開管第 3 模式
  s = Sim().type('closed').mode(2).set('L', 0.3).blow().stop().type('open').mode(3).set('L', 0.6).blow();
  hiddenSol.h5 = s; prove('h5', s, '：閉管 0.30 m 第 2 模式 ' + f2(s.ev[0].data.f) + ' Hz、開管 0.60 m 第 3 模式 ' + f2(s.ev[1].data.f) + ' Hz');
  // h6 只動管口修正降半音
  const L6 = 0.415;
  s = Sim().set('d', 30).set('L', L6).corr('none').blow().corr('flanged');
  hiddenSol.h6 = s; prove('h6', s, '：開管、內徑 30 mm、管長 ' + L6 + ' m，「不計」→「0.82 r」：' + f2(cents(s.ev[1].data.f / s.ev[0].data.f)) + ' 音分');
  const L6b = 0.309;
  const s6b = Sim().set('d', 30).set('L', L6b).corr('none').blow().corr('unflanged');
  console.log('      另一組解：管長 ' + L6b + ' m，「不計」→「0.61 r」：' + f2(cents(s6b.ev[1].data.f / s6b.ev[0].data.f)) + ' 音分' + (run(s6b.ev, [byId('h6')]).size ? '（也算）' : '（不算）'));
  // h7 最低的音
  s = Sim().type('closed').set('L', 1.5).set('T', 0).set('d', 30).blow();
  hiddenSol.h7 = s; prove('h7', s, '：閉管 1.5 m、0 °C、內徑 30 mm（0.61 r）→ ' + f2(s.info().f) + ' Hz');
  const s7 = Sim().type('closed').set('L', 1.5).set('T', 0).set('d', 30).corr('none').blow();
  expectNot('h7', s7, '「不計」管口修正時只有 ' + f2(s7.info().f) + ' Hz');
  const s7b = Sim().type('closed').set('L', 1.5).set('T', 2).set('d', 30).corr('flanged').blow();
  expectNot('h7', s7b, '2 °C 時（0.82 r）是 ' + f2(s7b.info().f) + ' Hz');
  // h8 頭管拉出讓八度變窄
  s = Sim().inst('recorder').set('pull', 3).fing('C5').blow().fing('C6');
  hiddenSol.h8 = s; prove('h8', s, '：頭管拉出 3 mm，C5 ' + f2(s.ev[0].data.cents) + ' 音分、C6 ' + f2(s.ev[1].data.cents) + ' 音分，八度只有 ' + f2(cents(s.ev[1].data.f / s.ev[0].data.f)) + ' 音分');
  const s8 = Sim().inst('recorder').set('pull', 1).fing('C5').blow().fing('C6');
  expectNot('h8', s8, '拉出 1 mm：八度 ' + f2(cents(s8.ev[1].data.f / s8.ev[0].data.f)) + ' 音分');
  expectNot('h8', Sim().inst('recorder').set('pull', 3).fing('C5').blow().stop().fing('C6').blow(), '中間換氣（要同一口氣直接換指法）');
  expectNot('h8', Sim().inst('recorder').set('pull', 8).fing('C5').blow().fing('C6'), '拉出 8 mm 不是「一點點」');
  // h9 Do-Sol-Mi
  const b9 = bestL(mtF('C3'), 'closed', 1, 19, 'unflanged', 20, 5);
  s = Sim().type('closed').set('L', b9.L, b9.typed).blow().mode(2).mode(3);
  hiddenSol.h9 = s; prove('h9', s, '：閉管 ' + b9.L + ' m（C3 ' + f2(b9.c) + ' 音分），同一口氣第 1、2、3 模式：' + s.ev.map(e => e.data.name).join('、'));
  expectNot('h9', Sim().type('closed').set('L', b9.L, b9.typed).blow().mode(2).stop().blow().mode(3), '中間換氣（不是同一口氣）');
  // h10 五聲音階
  s = Sim().type('closed');
  const sol10 = [];
  ['C4', 'D4', 'E4', 'G4', 'A4'].forEach((n, i) => {
    const b = bestL(mtF(n), 'closed', 1, 19, 'unflanged', 20, 5);
    s.set('L', b.L, b.typed); if (!i) s.blow();
    sol10.push(n + ' ' + b.L + ' m（' + f2(b.c) + '）');
  });
  hiddenSol.h10 = s; prove('h10', s, '：閉管、內徑 19 mm，吹氣中依序拖管長：' + sol10.join('、'));
}

console.log('\n三、預設狀態不觸發任何任務');
{
  const cases = {
    '預設的管子（長笛的近似 C4）吹氣、停止': Sim().blow().stop(),
    '吹氣中換成直笛（預設 C5）、再換回來': Sim().blow().inst('recorder').inst('tube'),
    '三種近似尺寸各吹一次': Sim().preset('flute').blow().stop().preset('clarinet').blow().stop().preset('pan').blow().stop(),
    '吹氣中依序按三種近似尺寸': Sim().blow().preset('clarinet').preset('pan').preset('flute'),
    '直笛預設 C5 吹氣': Sim().inst('recorder').blow()
  };
  let bad = 0;
  Object.keys(cases).forEach(k => {
    const done = run(cases[k].ev);
    if (done.size) { bad++; console.log('  ✗ ' + k + '：' + Array.from(done).join('、')); }
    else console.log('  ✓ ' + k + '：' + cases[k].ev.map(e => e.data.name).join(' ') + '，沒有完成任何任務');
  });
  if (bad) fail++;
}

console.log('\n四、隱藏任務兩兩不連帶');
{
  const hidden = missions.filter(m => m.hidden);
  let bad = 0;
  hidden.forEach(h => {
    const key = h.id.replace('wind-instrument-', '');
    const done = run(hiddenSol[key].ev, hidden);
    const extra = Array.from(done).filter(id => id !== h.id);
    if (extra.length) { bad++; console.log('  ✗ ' + h.id + ' 的解也完成了 ' + extra.join('、')); }
    else console.log('  ✓ ' + h.id + ' 的解不會完成其他隱藏任務');
  });
  if (bad) fail++;
}

console.log('\n五、亂按模擬（2000 回 × 80 步；滑桿拖到格點上的隨機位置，其中兩成拖到最左或最右）');
{
  let seed = 20261113;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const pickI = n => Math.floor(rnd() * n);
  const slider = field => {
    const R = RANGE[field];
    if (rnd() < 0.2) return rnd() < 0.5 ? R[0] : R[1];
    return grid(R[0] + rnd() * (R[1] - R[0]), STEP[field]);
  };
  const counts = {};
  const fings = Object.keys(W.FINGERINGS).filter(n => W.SCALE.indexOf(n) >= 0);
  for (let r = 0; r < 2000; r++) {
    const s = Sim();
    for (let k = 0; k < 80; k++) {
      const a = pickI(13);
      if (a === 0) s.inst(rnd() < 0.5 ? 'tube' : 'recorder');
      else if (a === 1) s.type(rnd() < 0.5 ? 'open' : 'closed');
      else if (a === 2) s.mode(1 + pickI(3));
      else if (a === 3) s.corr(W.CORRS[pickI(3)]);
      else if (a === 4) { if (s.st.inst === 'tube') s.preset(['flute', 'clarinet', 'pan'][pickI(3)]); }
      else if (a === 5) { if (s.st.inst === 'tube') s.set('L', slider('L')); }
      else if (a === 6) { if (s.st.inst === 'tube') s.set('d', slider('d')); }
      else if (a === 7) s.set('T', slider('T'));
      else if (a === 8) { if (s.st.inst === 'recorder') s.set('pull', slider('pull')); }
      else if (a === 9) s.hole(pickI(8));
      else if (a === 10) { if (s.st.inst === 'recorder') s.fing(fings[pickI(fings.length)]); }
      else if (a === 11) { if (s.st.blow) s.stop(); else s.blow(); }
      else s.blow();
    }
    run(s.ev).forEach(id => { counts[id] = (counts[id] || 0) + 1; });
  }
  const pct = id => (counts[id] || 0) / 2000 * 100;
  console.log('  ' + missions.map(m => m.id + (m.hidden ? '（隱藏 ' : '（') + m.level + ' 級）' + pct(m.id).toFixed(2) + '%').join('\n  '));
  const risky = missions.filter(m => !m.hidden && m.level >= 6 && pct(m.id) >= 5);
  const riskyH = missions.filter(m => m.hidden && pct(m.id) >= 1);
  if (risky.length) { fail++; console.log('  ✗ 6 級以上的公開任務亂按完成率超過 5%：' + risky.map(m => m.id).join('、')); }
  else console.log('  ✓ 6 級以上的公開任務亂按完成率都不到 5%');
  if (riskyH.length) { fail++; console.log('  ✗ 隱藏任務亂按完成率超過 1%：' + riskyH.map(m => m.id).join('、')); }
  else console.log('  ✓ 隱藏任務亂按完成率都不到 1%');
}

console.log('\n六、任務數量與等級');
{
  const pub = missions.filter(m => !m.hidden), hid = missions.filter(m => m.hidden);
  const checks = [
    [pub.length >= 10 && pub.length <= 12, '公開任務 ' + pub.length + ' 個（等級 ' + pub.map(m => m.level).join('、') + '）'],
    [hid.length === 10, '隱藏任務 ' + hid.length + ' 個（等級 ' + hid.map(m => m.level).join('、') + '，星星 = 等級 × 2）'],
    [hid.every(m => m.level >= 3 && m.level <= 10), '隱藏任務等級都在 3–10'],
    [hid.filter(m => m.level >= 7).length >= 3, '隱藏任務 7 級以上有 ' + hid.filter(m => m.level >= 7).length + ' 個'],
    [Object.values(hid.reduce((o, m) => { o[m.level] = (o[m.level] || 0) + 1; return o; }, {})).every(n => n <= 2), '同一級的隱藏任務最多 2 個'],
    [pub.every(m => m.title && m.title.zh && m.title.en && m.desc && m.desc.zh && m.desc.en), '公開任務都有中英標題與說明'],
    [hid.every(m => m.riddle && m.riddle.zh && m.riddle.en && !m.title && !m.desc), '隱藏任務只有中英謎語'],
    [new Set(missions.map(m => m.id)).size === missions.length && missions.every(m => /^wind-instrument-(h?\d+)$/.test(m.id)), '代號不重複、格式正確']
  ];
  checks.forEach(c => { if (!c[0]) fail++; console.log((c[0] ? '  ✓ ' : '  ✗ ') + c[1]); });
}

console.log(fail ? '\n有 ' + fail + ' 項沒有通過。' : '\n全部任務都證明做得到，預設狀態不觸發，隱藏任務互不連帶、亂按不誤觸。');
process.exit(fail ? 1 : 0);
