/* 任務可達成的證明腳本。用法：node tools/mission-proofs/pentatonic.js
 * 用數學核心模擬頁面（js/pentatonic.js）的狀態與事件：每個操作送出的事件資料和頁面一樣（PentatonicCore.analyze + chain + eventData）。
 * 證明每個任務都做得到、預設狀態與只做預設操作不觸發任何任務、每個隱藏任務的解（含達成它之前必經的操作）不會順便完成另一個隱藏任務，
 * 並用亂按模擬確認 6 級以上的任務亂按完成的比例不到 5%。
 * 介面：主音選單 17 種寫法；五個調式按鈕；鍵盤 C4–C5 與鐘面 12 格（點音加入或移出，主音不能移出）；音律兩種；鐘面排列兩種；
 *       三分損益：起手兩種、「↺ 從頭」「◀ 上一步」「下一步 ▶」（1–13 個音）、宮的弦長 9–999；長條圖的弦可點；
 *       播放內容五種、「▶ 播放」、步伐條每一步可點、「換一段旋律」。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const P = require(ROOT + 'js/pentatonic-core.js');
const missions = [];
global.window = { LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/pentatonic.js');
const byId = id => missions.find(m => m.id === 'pentatonic-' + id);
const mod = (a, n) => ((a % n) + n) % n;
const MODE_IDS = P.MODES.map(m => m.id);
const CONTENTS = ['up', 'down', 'updown', 'melody', 'gen'];

// ---------- 和 js/pentatonic.js 相同的狀態機 ----------
class Sim {
  constructor() {
    this.tonicName = 'C'; this.type = 'gong'; this.semis = P.modeSemis(0);
    this.tuning = 'pyth'; this.order = 'sun'; this.L0 = 81; this.gen = 5; this.walk = -1; this.arr = 'chrom';
    this.content = 'up'; this.tempo = 120; this.lastGong = 0; this.lastString = -1; this.log = [];
    this.recompute();
  }
  recompute() {
    this.A = P.analyze(this.tonicName, this.semis, this.type, { tuning: this.tuning, order: this.order, L0: this.L0 });
    if (this.A.k >= 0) this.lastGong = this.A.gongPc;
    this.C = P.chain(this.gen, this.order, this.L0);
  }
  emit(type, extra) {
    const ev = { type: type, data: P.eventData(this.A, { chain: this.C, gongPc: this.lastGong, arr: this.arr }, extra) };
    this.log.push(ev); return ev;
  }
  changed(src, extra) { this.recompute(); this.lastString = -1; return this.emit('scale', Object.assign({ src: src }, extra || {})); }
  tonic(name) { const t = P.tonicByName(name); if (!t || t.name === this.tonicName) return null; this.tonicName = t.name; if (this.type === 'custom') { /* 自訂的音跟著主音走（相對主音不變） */ } return this.changed('tonic'); }
  mode(id) { const m = P.modeById(id); this.type = id; this.semis = P.modeSemis(m.k); return this.changed('mode'); }
  toggle(pc) {
    pc = mod(pc, 12);
    const rel = mod(pc - this.A.tonic, 12);
    if (rel === 0) return null;
    const i = this.semis.indexOf(rel);
    this.semis = i >= 0 ? this.semis.filter(x => x !== rel) : P.normSemis(this.semis.concat([rel]));
    this.type = 'custom';
    return this.changed('custom', { toggled: pc, added: i < 0 });
  }
  tune(t) { if (t === this.tuning) return null; this.tuning = t; return this.changed('tuning'); }
  setArr(a) { if (a === this.arr) return null; this.arr = a; return this.changed('arr'); }
  genEv(src) { this.recompute(); this.lastString = -1; return this.emit('gen', { src: src, fromReset: this.walk >= 0 && this.walk === this.gen - 1 }); }
  reset() { this.gen = 1; this.walk = 0; return this.genEv('reset'); }
  next() { if (this.gen >= P.GEN_MAX) return null; this.gen++; if (this.walk >= 0) this.walk++; return this.genEv('next'); }
  prev() { if (this.gen <= 1) return null; this.gen--; this.walk = -1; return this.genEv('prev'); }
  setOrder(o) { if (o === this.order) return null; this.order = o; return this.genEv('order'); }
  setL0(L) { L = Math.max(9, Math.min(999, Math.round(L))); if (L === this.L0) return null; this.L0 = L; return this.genEv('len'); }
  setContent(c) { this.content = c; return null; }
  play() { return this.emit('play', { content: this.content, tempo: this.tempo }); }
  step(i) { const s = this.A.steps[i]; if (s == null) return null; return this.emit('step', { i: i, size: s }); }
  string(idx) {
    const C = this.C, x = C.notes[idx];
    if (!x) return null;
    const pv = this.lastString, p = pv >= 0 ? C.notes[pv] : null;
    const pr = p ? P.pairInfo([p.q, p.b], [x.q, x.b]) : null;
    this.lastString = idx;
    return this.emit('tap', { idx: idx, role: x.role, prevIdx: p ? pv : -1, pairP: pr ? pr.p : null, pairQ: pr ? pr.q : null, pairCents: pr ? pr.cents : null });
  }
  /** 從目前的音點鍵盤，變成「比主音高 rel 個半音」這一組（先加後減，一次點一個） */
  buildTo(rel) {
    const want = P.normSemis(rel);
    want.filter(s => this.semis.indexOf(s) < 0).forEach(s => this.toggle(this.A.tonic + s));
    this.semis.slice().filter(s => want.indexOf(s) < 0).forEach(s => this.toggle(this.A.tonic + s));
    return this;
  }
}

let fail = 0;
const found = {};
function run(id, sim) { const m = byId(id); m.mem = {}; return sim.log.some(e => !!m.check(e, m.mem)); }
function expect(id, sim, want, note) {
  const ok = run(id, sim), pass = ok === want;
  if (!pass) fail++;
  if (want && pass && !found[id]) found[id] = sim.log.slice();
  console.log((pass ? '  ✓ ' : '  ✗ ') + String(id).padEnd(4) + (want ? '達成：' : '不觸發：') + note);
}
const S = fn => { const s = new Sim(); fn(s); return s; };
function* allSets() { for (let m = 1; m < 4096; m += 2) { const p = []; for (let i = 0; i < 12; i++) if (m >> i & 1) p.push(i); yield p; } }

// ---------- 預設狀態不觸發 ----------
console.log('預設狀態與只做預設操作');
{
  // 預設：主音 C、宮調式、五度相生、先損、宮的弦長 81、已產生 5 個音（不是從頭走的）、半音排列、上行、120。頁面載入時不送事件。
  const s = new Sim();
  s.play(); for (let i = 0; i < 5; i++) s.step(i);
  for (let i = 0; i < 5; i++) s.string(i);
  s.mode('gong'); s.play();
  s.tune('equal'); s.play(); s.tune('pyth');
  const hit = missions.filter(m => { m.mem = {}; return s.log.some(e => m.check(e, m.mem)); }).map(m => m.id);
  const hit2 = [];
  P.TONICS.forEach(t => { const x = new Sim(); x.tonic(t.name); x.play(); missions.forEach(m => { m.mem = {}; if (x.log.some(e => m.check(e, m.mem)) && hit2.indexOf(m.id) < 0) hit2.push(m.id); }); });
  // 只換主音再播放：會完成「只彈黑鍵」（F♯、G♭ 宮）——那是任務本身要的操作，不算預設，其他都不該觸發
  const extra = hit2.filter(id => id !== 'pentatonic-4');
  if (hit.length || extra.length) { fail++; console.log('  ✗ 預設狀態觸發了 ' + hit.concat(extra).join('、')); }
  else console.log('  ✓ 預設的 C 宮調式直接播放、點每一個步伐、照音高點每一根弦、換音律播放、只換主音播放（17 種），除了「只彈黑鍵」（選 F♯／G♭ 宮）以外都不觸發任務');
}

// ---------- 公開任務 ----------
console.log('\n公開任務');
expect('1', S(s => { s.setContent('updown'); s.play(); }), true, 'C 宮調式，「上行再下行」播放：' + P.analyze('C', P.modeSemis(0), 'gong').names.join(' '));
expect('1', S(s => { s.play(); }), false, '預設的上行不算');
expect('2', S(s => { s.reset(); for (let i = 0; i < 4; i++) s.next(); }), true, '↺ 從頭，下一步 × 4：' + P.chain(5, 'sun', 81).notes.map(x => x.role + ' ' + x.len.value).join(' → '));
expect('2', S(s => { s.next(); s.prev(); }), false, '預設已經有 5 個音，上一步再下一步不算（不是從頭走的）');
expect('2', S(s => { s.reset(); s.next(); s.next(); s.prev(); s.next(); s.next(); s.next(); }), false, '中間按過上一步不算');
expect('3', S(s => { s.tonic('A'); s.mode('yu'); s.play(); }), true, 'A 羽調式：' + P.analyze('A', P.modeSemis(4), 'yu').names.join(' '));
expect('3', S(s => { s.mode('yu'); s.play(); }), false, 'C 羽調式有 E♭、B♭，不算');
{
  const sols = [];
  P.TONICS.forEach(t => P.MODES.forEach(m => { if (P.analyze(t.name, P.modeSemis(m.k), m.id).black) sols.push(t.name + ' ' + m.zh); }));
  expect('4', S(s => { s.tonic('F♯'); s.play(); }), true, 'F♯ 宮調式：F♯ G♯ A♯ C♯ D♯；全部的解：' + sols.join('、'));
}
expect('5', S(s => { s.mode('shang'); for (let i = 0; i < 5; i++) s.step(i); }), true, 'C 商調式步伐 ' + P.modeSteps(1).join(' ') + '：五步都點過，沒有 1');
expect('5', S(s => { for (let i = 0; i < 5; i++) s.step(i); }), false, '預設的宮調式不算（要換成商調式）');
{
  const g = P.chain(5, 'sun', 81);
  const pr = P.pairInfo([g.notes[0].q, g.notes[0].b], [g.notes[4].q, g.notes[4].b]);
  expect('6', S(s => { s.string(0); s.string(4); }), true, '點宮弦再點角弦：' + pr.p + '/' + pr.q + ' = ' + pr.cents.toFixed(2) + ' 音分（純律 5/4 = 386.31，多 ' + (pr.cents - 1200 * Math.log2(1.25)).toFixed(2) + '）');
  expect('6', S(s => { s.string(4); s.string(0); }), false, '先角後宮不算');
}
expect('7', S(s => { s.setArr('fifths'); s.tonic('G'); s.play(); s.tonic('F'); s.play(); }), true, '五度順序，G 宮、F 宮各播放一次');
expect('7', S(s => { s.tonic('G'); s.play(); s.tonic('F'); s.play(); }), false, '半音排列不算');
expect('8', S(s => { s.setOrder('yi'); s.reset(); for (let i = 0; i < 4; i++) s.next(); }), true, '先益：' + P.chain(5, 'yi', 81).notes.map(x => x.role + ' ' + x.len.value).join(' → ') + '（徵、羽比宮長）');
expect('9', S(s => { [['C', 'gong'], ['D', 'shang'], ['E', 'jue'], ['G', 'zhi'], ['A', 'yu']].forEach(x => { s.tonic(x[0]); s.mode(x[1]); s.play(); }); }), true, 'C 宮、D 商、E 角、G 徵、A 羽（宮都是 C）');
expect('9', S(s => { MODE_IDS.forEach(id => { s.mode(id); s.play(); }); }), false, '主音不變只換調式：宮各不相同，不算');
expect('10', S(s => { s.mode('gong'); s.toggle(5); s.toggle(4); }), true, 'C 宮 → 加 F、拿掉 E → C D F G A（F 宮的徵調式）');
expect('10', S(s => { s.mode('gong'); s.toggle(5); s.toggle(4); s.toggle(4); s.toggle(5); }), true, '（再改回 C 宮不影響已完成）');
expect('10', S(s => { s.buildTo([0, 2, 4, 7, 9].map(x => x)); s.mode('gong'); s.toggle(2); s.toggle(3); }), false, '拿掉 D、加 E♭ → C E♭ E G A 不是五聲，不算');
{
  const want = P.modeSemis(2);
  expect('11', S(s => { s.mode('gong'); s.buildTo(want); }), true, '從 C 宮點成 C 角調式 ' + P.analyze('C', want, 'custom').names.join(' ') + '（宮 A♭）');
  expect('11', S(s => s.mode('jue')), false, '直接按「角調式」不算');
}
{
  const ints = [];
  for (let L = 9; L <= 999; L++) if (P.chain(7, 'sun', L).allInt) ints.push(L);
  expect('12', S(s => { s.next(); s.next(); s.setL0(729); }), true, '生到 7 個音，宮的弦長 729：' + P.chain(7, 'sun', 729).notes.map(x => x.len.value).join(' ') + '；9–999 之間只有 ' + ints.join('、'));
  expect('12', S(s => { s.setL0(729); s.next(); s.next(); }), true, '先改弦長再生到 7 個也可以');
  expect('12', S(s => { s.next(); s.next(); s.setL0(243); }), false, '243 不夠（第 7 根是 170.67）');
}

// ---------- 隱藏任務 ----------
console.log('\n隱藏任務');
expect('h1', S(s => { s.mode('shang'); s.setContent('down'); s.play(); }), true, 'C 商調式下行：步伐 ' + P.modeSteps(1).join(' ') + ' 前後對稱');
expect('h1', S(s => { s.mode('yu'); s.setContent('down'); s.play(); }), false, '羽調式下行不算');
expect('h2', S(s => { s.next(); s.setContent('gen'); s.play(); }), true, '生到第 6 個音（變宮 128/3），照三分損益的順序播放：B 和高八度的 C 只差半音 256/243');
expect('h2', S(s => { s.setContent('gen'); s.play(); }), false, '5 個音的順序播放不算');
expect('h3', S(s => { s.mode('gong'); s.toggle(6); s.toggle(7); }), true, 'C 宮加 F♯、拿掉 G → C D E F♯ A，步伐 ' + P.stepsOf([0, 2, 4, 6, 9]).join(' ') + '（沒有半音，但不是五聲）');
expect('h3', S(s => { s.mode('gong'); s.toggle(5); s.toggle(4); }), false, '另一個五聲音階不算');
{
  let n = 0; const kinds = {};
  for (const p of allSets()) if (p.length === 5 && Math.min(...P.stepsOf(p)) >= 2 && P.pentMode(p) < 0) { n++; kinds[P.stepsOf(p).slice().sort().join('')] = 1; }
  console.log('      （含主音、5 個音、沒有半音又不是五聲的集合共 ' + n + ' 個，步伐是 ' + Object.keys(kinds).join('、') + ' 的排列）');
}
expect('h4', S(s => { s.buildTo([0, 2, 4, 6, 8, 10]); }), true, '從 C 宮點出全音音階 C D E F♯ G♯ A♯（沒有半音的 6 音集合只有它）');
expect('h4', S(s => { s.buildTo([0, 2, 4, 5, 7, 9]); }), false, '六聲但有半音，不算');
expect('h5', S(s => { s.tonic('F♯'); s.reset(); for (let i = 0; i < 4; i++) s.next(); }), true, 'F♯ 宮，從頭生五個音：F♯ C♯ G♯ D♯ A♯ 全是黑鍵');
expect('h5', S(s => { s.tonic('F♯'); s.next(); s.prev(); }), false, '不是從頭生的不算');
expect('h5', S(s => { s.tonic('D♯'); s.mode('yu'); s.reset(); for (let i = 0; i < 4; i++) s.next(); }), true, 'D♯ 羽調式（宮 F♯）也可以');
expect('h6', S(s => { for (let i = 0; i < 8; i++) s.next(); }), true, '下一步一直按到第 13 個音：弦長 ' + P.chain(13, 'sun', 81).notes[12].len.value.toFixed(3) + '，比 81 短 ' + P.chain(13, 'sun', 81).comma.len.toFixed(3) + '（' + P.chain(13, 'sun', 81).comma.cents.toFixed(2) + ' 音分）');
expect('h6', S(s => { for (let i = 0; i < 7; i++) s.next(); }), false, '12 個音不算');
expect('h7', S(s => { BRIGHT().forEach(id => { s.mode(id); s.play(); }); }), true, '主音 C：宮 → 徵 → 商 → 羽 → 角，每次都播放（亮度 +10 → −10，每次只動一個音）');
function BRIGHT() { return ['gong', 'zhi', 'shang', 'yu', 'jue']; }
expect('h7', S(s => { ['gong', 'shang', 'jue', 'zhi', 'yu'].forEach(id => { s.mode(id); s.play(); }); }), false, '照宮商角徵羽的順序不算');
expect('h7', S(s => { BRIGHT().forEach((id, i) => { if (i === 2) s.tonic('D'); s.mode(id); s.play(); }); }), false, '中途換了主音不算');
expect('h8', S(s => { s.setOrder('yi'); s.reset(); for (let i = 0; i < 4; i++) s.next(); s.tonic('G'); s.mode('zhi'); s.play(); }), true, '先益從頭生五音（《管子》），再播 G 徵調式：音表弦長 ' + P.analyze('G', P.modeSemis(3), 'zhi', { order: 'yi' }).notes.map(x => x.len.value).join(' '));
expect('h8', S(s => { s.setOrder('yi'); s.mode('zhi'); s.play(); }), false, '沒有照《管子》從頭生過不算');
expect('h8', S(s => { s.reset(); for (let i = 0; i < 4; i++) s.next(); s.mode('zhi'); s.play(); }), false, '先損生的不算');
expect('h9', S(s => { s.mode('gong'); s.toggle(5); s.toggle(10); }), true, 'C 宮加清角 F、閏 B♭ → 燕樂音階 C D E F G A B♭');
expect('h9', S(s => { s.mode('gong'); s.toggle(5); s.toggle(11); }), false, '加清角、變宮是清樂音階，不算');
expect('h10', S(s => { for (let i = 0; i < 7; i++) s.next(); s.setContent('gen'); s.play(); }), true, '生到 12 個音再照順序播放：步伐 ' + P.chain(12, 'sun', 81).kinds.map(k => k.p + '/' + k.q + ' ×' + k.count).join('、'));
expect('h10', S(s => { s.next(); s.next(); s.setContent('gen'); s.play(); }), false, '7 個音（也是兩種步伐）不算');
{
  const two = []; for (let g = 2; g <= 13; g++) if (P.chain(g, 'sun', 81).kinds.length === 2) two.push(g);
  console.log('      （步伐剛好兩種的個數：' + two.join('、') + '）');
}

missions.forEach(m => { const id = m.id.replace('pentatonic-', ''); if (!found[id]) { fail++; console.log('  ✗ ' + m.id + ' 沒有證明解'); } });

// ---------- 隱藏任務兩兩不連帶完成 ----------
console.log('\n隱藏任務的解（含途中每一個操作）不會順便完成另一個隱藏任務');
{
  const hidden = missions.filter(m => m.hidden);
  let bad = 0;
  hidden.forEach(h => {
    const evs = found[h.id.replace('pentatonic-', '')];
    if (!evs) return;
    const others = hidden.filter(o => o !== h).filter(o => { o.mem = {}; return evs.some(e => o.check(e, o.mem)); }).map(o => o.id);
    if (others.length) { bad++; console.log('  ✗ ' + h.id + ' 的解也完成了 ' + others.join('、')); }
    else console.log('  ✓ ' + h.id + ' 的解不會完成其他隱藏任務');
  });
  if (bad) fail++;
}

// ---------- 亂按模擬 ----------
console.log('\n亂按模擬（2000 回 × 120 步隨機操作，不刻意找答案）');
{
  let seed = 20261113;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const pickI = n => Math.floor(rnd() * n);
  const counts = {};
  for (let r = 0; r < 2000; r++) {
    missions.forEach(m => { m.mem = {}; m.doneRun = false; });
    const s = new Sim();
    for (let k = 0; k < 120; k++) {
      const a = pickI(18);
      const before = s.log.length;
      if (a === 0) s.tonic(P.TONICS[pickI(P.TONICS.length)].name);
      else if (a === 1 || a === 2) s.mode(MODE_IDS[pickI(5)]);
      else if (a === 3 || a === 4 || a === 5) s.toggle(pickI(12));
      else if (a === 6) s.tune(s.tuning === 'pyth' ? 'equal' : 'pyth');
      else if (a === 7) s.setArr(s.arr === 'chrom' ? 'fifths' : 'chrom');
      else if (a === 8) s.setOrder(s.order === 'sun' ? 'yi' : 'sun');
      else if (a === 9) s.reset();
      else if (a === 10) s.prev();
      else if (a === 11) s.next();
      else if (a === 12) s.setL0(9 + pickI(991));
      else if (a === 13) s.setContent(CONTENTS[pickI(5)]);
      else if (a === 14) s.play();
      else if (a === 15) s.step(pickI(s.A.n));
      else s.string(pickI(s.C.gen));
      for (let j = before; j < s.log.length; j++) {
        const ev = s.log[j];
        missions.forEach(m => { if (!m.doneRun && m.check(ev, m.mem)) { m.doneRun = true; counts[m.id] = (counts[m.id] || 0) + 1; } });
      }
    }
  }
  console.log('  ' + missions.map(m => m.id + (m.hidden ? '（隱藏 ' : '（') + m.level + ' 級）' + ((counts[m.id] || 0) / 20).toFixed(1) + '%').join('\n  '));
  const risky = missions.filter(m => m.level >= 6 && (counts[m.id] || 0) / 2000 > 0.05);
  if (risky.length) { fail++; console.log('  ✗ 6 級以上的任務亂按就完成的比例超過 5%：' + risky.map(m => m.id).join('、')); }
  else console.log('  ✓ 6 級以上的任務亂按完成的比例都不到 5%');
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
if (fail) { console.log(`有 ${fail} 項不符合。`); process.exit(1); }
console.log('全部任務都證明做得到，預設狀態不觸發，隱藏任務之間不連帶完成。');
