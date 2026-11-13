/* 任務可達成的證明腳本。用法：node tools/mission-proofs/circle-of-fifths.js
 * 用數學核心模擬頁面（js/circle-of-fifths.js）的狀態與事件：每個操作送出的事件資料和頁面一樣（CircleFifthsCore.analyze + eventData）。
 * 證明每個任務都做得到、預設狀態與只做預設操作不觸發任何任務、每個隱藏任務的解（含達成它之前必經的操作）不會順便完成另一個隱藏任務，
 * 並用亂按模擬確認 6 級以上的任務亂按完成的比例不到 5%。
 * 介面：五度圈 12 格（拖曳或「◀ 下屬調」「屬調 ▶」一次轉一格；點一格直接換調）；大調／小調；寫法（常用、♯、♭）；比較的調（30 個常用調或不比較）；
 *       共同音熱圖（12 × 12，順序：五度、半音；點一格）；播放內容 5 種；「乘 k」滑桿 1–11；「× k 重排」（k 與 12 互質才能按）、「回到半音圈」；「全部清除」。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const F = require(ROOT + 'js/circle-of-fifths-core.js');
const missions = [];
global.window = { LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/circle-of-fifths.js');
const byId = id => missions.find(m => m.id === 'circle-of-fifths-' + id);
const mod = F.mod;
const WHATS = ['triad', 'scale', 'cadence', 'modulate', 'kseq'];
/** 「比較的調」選單：15 個大調、15 個小調（j = −7 … 7） */
const TARGETS = [];
for (let j = -7; j <= 7; j++) TARGETS.push({ j: j, mode: 'major' });
for (let j = -7; j <= 7; j++) TARGETS.push({ j: j, mode: 'minor' });

// ---------- 和 js/circle-of-fifths.js 相同的狀態機 ----------
class Sim {
  constructor() {
    this.pos = 0; this.spell = 'auto'; this.mode = 'major'; this.target = null; this.k = 7; this.a = 1;
    this.run = { dir: 0, n: 0 }; this.what = 'triad'; this.tempo = 96; this.log = [];
    this.recompute();
  }
  recompute() { this.A = F.analyze({ pos: this.pos, spell: this.spell, mode: this.mode, target: this.target, k: this.k, a: this.a }); }
  emit(type, extra) { const ev = { type: type, data: F.eventData(this.A, extra) }; this.log.push(ev); return ev; }
  keyChanged(src) {
    if (src !== 'turn') this.run = { dir: 0, n: 0 };
    this.recompute();
    return this.emit('key', { src: src, run: this.run.n, runDir: this.run.dir });
  }
  turn(dir) {
    this.pos = mod(this.pos + dir, 12);
    if (this.run.dir === dir) this.run.n++; else this.run = { dir: dir, n: 1 };
    return this.keyChanged('turn');
  }
  tap(pos, mode) {
    pos = mod(pos, 12); mode = mode || this.mode;
    if (pos === this.pos && mode === this.mode) return null;
    this.pos = pos; this.mode = mode;
    return this.keyChanged('tap');
  }
  setMode(m) { if (m === this.mode) return null; this.mode = m; return this.keyChanged('mode'); }
  setSpell(s) { if (s === this.spell) return null; this.spell = s; return this.keyChanged('spell'); }
  /** 讓目前的調剛好是調號 j（點那一格，必要時換寫法） */
  goJ(j, mode) {
    const p = mod(j, 12);
    if (mode && mode !== this.mode) this.setMode(mode);
    if (F.jOf(p, this.spell) !== j) this.setSpell(F.jOf(p, 'auto') === j ? 'auto' : j > 0 ? 'sharp' : 'flat');
    if (p !== this.pos) this.tap(p, this.mode);
    if (this.A.j !== j) throw new Error('goJ 失敗：' + j);
    return this;
  }
  setTarget(t) { this.target = t ? { j: t.j, mode: t.mode } : null; this.recompute(); return this.emit('target', { src: 'target' }); }
  heat(row, col, order) {
    order = order || 'fifths';
    const pr = order === 'chrom' ? mod(7 * row, 12) : mod(row, 12), pc = order === 'chrom' ? mod(7 * col, 12) : mod(col, 12);
    this.pos = pr; this.spell = 'auto'; this.mode = 'major'; this.target = { j: F.jOf(pc, 'auto'), mode: 'major' };
    this.run = { dir: 0, n: 0 };
    this.recompute();
    return this.emit('heat', { order: order, src: 'heat' });
  }
  play(what) {
    what = what || this.what;
    if (what === 'modulate' && !this.target) return null;   // 頁面：提示先選「比較的調」，不播放
    return this.emit('play', { what: what, tempo: this.tempo, run: this.run.n, runDir: this.run.dir });
  }
  setK(k) { k = Math.max(1, Math.min(11, Math.round(k))); if (k === this.k) return null; this.k = k; this.recompute(); return this.emit('k', { src: 'k' }); }
  arrange() {
    if (!F.isUnit(this.k)) return null;   // 頁面：按鈕停用
    const prev = this.a; this.a = mod(this.a * this.k, 12); this.recompute();
    return this.emit('arrange', { by: this.k, prevA: prev, reset: false });
  }
  arrangeReset() { if (this.a === 1) return null; const prev = this.a; this.a = 1; this.recompute(); return this.emit('arrange', { by: 0, prevA: prev, reset: true }); }
  clearAll() { this.target = null; this.a = 1; this.recompute(); return null; }   // 頁面不送事件
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
const lbl = (j, m) => F.keyLabel(j, m || 'major') + (m === 'minor' ? ' 小調' : ' 大調');

// ---------- 預設狀態不觸發 ----------
console.log('預設狀態與只做預設操作');
{
  // 預設：C 大調、常用寫法、不比較、乘 k = 7、半音圈排列、播放主三和弦。頁面載入時不送事件。
  const s = new Sim();
  WHATS.forEach(w => s.play(w));
  s.setMode('major'); s.setSpell('auto'); s.tap(0, 'major'); s.setK(7); s.arrangeReset(); s.clearAll();
  const hit = missions.filter(m => { m.mem = {}; return s.log.some(e => m.check(e, m.mem)); }).map(m => m.id);
  if (hit.length) { fail++; console.log('  ✗ 預設狀態觸發了 ' + hit.join('、')); }
  else console.log('  ✓ 預設的 C 大調直接播放五種內容（轉調示範沒有比較的調時不播）、重選預設值，都不觸發任何任務（共 ' + s.log.length + ' 個事件）');
}

// ---------- 公開任務 ----------
console.log('\n公開任務');
expect('1', S(s => s.turn(1)), true, '按「屬調 ▶」一次：G 大調，調號 ' + F.signature(1).marks.map(m => m.name).join(' '));
expect('1', S(s => s.turn(-1)), false, '往另一邊轉是 F 大調');
expect('2', S(s => { s.turn(1); s.turn(1); s.turn(1); s.play('triad'); }), true, '轉三格到 A 大調（' + F.signature(3).marks.map(m => m.name).join(' ') + '），播放');
expect('2', S(s => { s.turn(1); s.turn(1); s.turn(1); s.setMode('minor'); s.play(); }), false, 'f♯ 小調也是 3 個升記號，但不是大調');
expect('3', S(s => { s.turn(1); s.turn(1); s.setMode('minor'); }), true, 'D 大調 → 按「小調」：' + lbl(2, 'minor'));
expect('3', S(s => { s.tap(2, 'minor'); }), false, '直接點 b 小調不算（要從 D 大調切換）');
expect('4', S(s => { for (let i = 0; i < 4; i++) s.turn(-1); }), true, '「◀ 下屬調」四次：' + lbl(-4) + '，降記號 ' + F.signature(-4).marks.map(m => m.name).join(' '));
expect('5', S(s => s.setTarget({ j: 0, mode: 'minor' })), true, 'C 大調比較 a 小調：共同音 7 個');
expect('5', S(s => { s.goJ(6); s.setTarget({ j: -6, mode: 'major' }); }), false, 'F♯ 大調比較 G♭ 大調（同一個調的兩種寫法）不算');
expect('6', S(s => { for (let i = 0; i < 12; i++) s.turn(1); }), true, '往升記號方向連轉 12 格，回到 C 大調');
expect('6', S(s => { for (let i = 0; i < 6; i++) s.turn(1); s.setMode('minor'); s.setMode('major'); for (let i = 0; i < 6; i++) s.turn(1); }), false, '中途換大小調就重新數');
expect('6', S(s => { for (let i = 0; i < 11; i++) s.turn(-1); s.turn(1); }), false, '11 格之後改方向不算');
expect('7', S(s => { s.setK(5); s.play('kseq'); }), true, 'k = 5：' + F.kSequence(0, 5).map(pc => F.pcName(pc, 0)).join(' '));
expect('8', S(s => s.setTarget({ j: -3, mode: 'minor' })), true, 'C 大調比較 c 小調：共同音 ' + F.compare(0, 'major', -3, 'minor').common + ' 個');
expect('8', S(s => s.setTarget({ j: 0, mode: 'minor' })), false, '關係小調（a 小調）主音不同');
expect('9', S(s => { s.setTarget({ j: 1, mode: 'major' }); s.play('modulate'); }), true, 'C 大調 → G 大調：只改 F → F♯');
expect('9', S(s => { s.setTarget({ j: 2, mode: 'major' }); s.play('modulate'); }), false, 'C → D 改兩個音');
expect('10', S(s => { s.goJ(6); s.setTarget({ j: -6, mode: 'major' }); }), true, 'F♯ 大調（6 個升記號）比較 G♭ 大調（6 個降記號）：同一組鍵');
expect('10', S(s => { s.setSpell('flat'); s.goJ(-6); s.setTarget({ j: 6, mode: 'major' }); }), true, '反過來（目前 G♭、比較 F♯）也算');
expect('11', S(s => { [1, 5, 7, 11].forEach(k => { s.setK(k); s.play('kseq'); }); }), true, 'k = 1、5、7、11 各播一次');
expect('11', S(s => { [1, 5, 7, 7].forEach(k => { s.setK(k); s.play('kseq'); }); }), false, '少了 11');
expect('12', S(s => { s.play('kseq'); s.arrange(); s.play('kseq'); }), true, 'k = 7 先播十二角星（半音圈上每步跨 7 格），按「× k 重排」（變成五度圈）後每步只跨 ' + F.slotStep(7, 7) + ' 格，再播');
expect('12', S(s => { s.setK(5); s.play('kseq'); s.arrange(); s.play('kseq'); }), true, 'k = 5：先播星，重排成四度圈（×5）後每步跨 ' + F.slotStep(5, 5) + ' 格');
expect('12', S(s => { s.setK(5); s.arrange(); s.setK(7); s.play('kseq'); }), false, '沒有先播十二角星不算');
expect('12', S(s => { s.play('kseq'); s.setK(5); s.arrange(); s.setK(7); s.play('kseq'); }), true, '先播 k = 7 的星，換成四度圈排列（用 k = 5 重排），k = 7 每步跨 ' + F.slotStep(5, 7) + ' 格（反方向的一格）也算');
expect('12', S(s => { s.play('kseq'); }), false, '半音圈排列上 k = 7 是十二角星（每步跨 7 格）');
{
  const sols = [];
  [1, 5, 7, 11].forEach(a => [5, 7].forEach(k => { const st = F.slotStep(a, k); if (st === 1 || st === 11) sols.push('排列 ×' + a + '、k = ' + k); }));
  console.log('      （成立的組合：' + sols.join('、') + '）');
}

// ---------- 隱藏任務 ----------
console.log('\n隱藏任務');
expect('h1', S(s => { s.setK(4); s.play('kseq'); }), true, 'k = 4：' + F.cycles(4).map(c => c.map(pc => F.pcName(pc, 0)).join('-')).join('、') + '（4 個增三和弦）');
expect('h1', S(s => { s.setK(8); s.play('kseq'); }), true, 'k = 8 也是 4 個三角形');
expect('h1', S(s => { s.setK(4); s.play('scale'); }), false, '只設 k = 4 不播序列不算');
expect('h2', S(s => { s.setK(6); s.play('kseq'); }), true, 'k = 6：6 對三全音 ' + F.cycles(6).map(c => c.map(pc => F.pcName(pc, 0)).join('-')).join('、'));
expect('h3', S(s => { s.setSpell('sharp'); s.tap(7); s.setTarget({ j: -5, mode: 'major' }); }), true, 'C♯ 大調（7 個升記號）比較 D♭ 大調（5 個降記號）');
expect('h3', S(s => { s.setSpell('sharp'); s.tap(7, 'minor'); s.setTarget({ j: -5, mode: 'minor' }); }), true, 'a♯ 小調比較 b♭ 小調也算');
expect('h3', S(s => { s.setSpell('sharp'); s.tap(7); s.setTarget({ j: -5, mode: 'minor' }); }), false, '比較 b♭ 小調（不同的調）不算');
expect('h4', S(s => { s.setTarget({ j: -5, mode: 'major' }); s.play('cadence'); s.play('modulate'); }), true, 'C 大調先播終止式，接著轉調示範到 D♭ 大調（高半音，共同音 ' + F.compare(0, 'major', -5, 'major').common + ' 個）');
expect('h4', S(s => { s.setTarget({ j: -5, mode: 'major' }); s.play('modulate'); }), false, '沒有先在原調播一次不算');
expect('h4', S(s => { s.setTarget({ j: 2, mode: 'major' }); s.play('modulate'); }), false, '升全音（C → D）不算');
expect('h5', S(s => { s.heat(0, 5); s.heat(0, 6); }), true, '熱圖（五度順序）C 那一列：點 B（相距 5，共同音 2）與 F♯（相距 6，共同音 2）');
expect('h5', S(s => { s.heat(0, 5, 'chrom'); s.heat(0, 6, 'chrom'); }), false, '半音順序的 F、F♯（相距 1 與 6）不算');
expect('h5', S(s => { s.heat(0, 5); s.heat(1, 7); }), false, '不同列不算');
expect('h6', S(s => { s.setSpell('sharp'); for (let i = 0; i < 8; i++) s.turn(1); s.play('scale'); }), true, '寫法 ♯，從 C 連按「屬調 ▶」8 次到 G♯ 大調（8 個升記號），播音階：' + F.scale(8, 'major').map(n => n.name).join(' '));
expect('h6', S(s => { s.setSpell('flat'); for (let i = 0; i < 9; i++) s.turn(-1); s.play('scale'); }), true, '寫法 ♭，往降記號方向轉 9 格到 E♭♭ 大調（9 個降記號）');
expect('h6', S(s => { s.setSpell('sharp'); s.tap(8); s.play('scale'); }), false, '直接點 G♯ 大調不算（要一格一格轉過去）');
expect('h6', S(s => { s.setSpell('sharp'); s.tap(7); s.play('scale'); }), false, 'C♯ 大調（7 個升記號）沒有重升');
{
  const sols = [];
  for (let p = 0; p < 12; p++) ['sharp', 'flat'].forEach(sp => ['major', 'minor'].forEach(m => { const a = F.analyze({ pos: p, spell: sp, mode: m }); if (a.doubles > 0 && sols.indexOf(a.label + (m === 'minor' ? 'm' : '')) < 0) sols.push(a.label + (m === 'minor' ? 'm' : '')); }));
  console.log('      （用得到重升或重降的調：' + sols.join(' ') + '）');
}
expect('h7', S(s => { s.play('kseq'); s.setK(5); s.play('kseq'); }), true, '先播 k = 7、接著播 k = 5：同一顆十二角星，方向相反');
expect('h7', S(s => { s.play('kseq'); s.play('triad'); s.setK(5); s.play('kseq'); }), false, '中間播了別的就不算');
expect('h8', S(s => { s.setTarget({ j: -1, mode: 'minor' }); s.play('modulate'); }), true, 'C 大調 → d 小調：共同音 6 個，主三和弦 C E G 與 D F A 沒有共同音');
expect('h8', S(s => { s.setTarget({ j: 1, mode: 'major' }); s.play('modulate'); }), false, 'C → G 主三和弦共用 G');
{
  const sols = [];
  ['major', 'minor'].forEach(m => F.nearKeys(0, m).forEach(x => { const c = F.compare(0, m, x.j, x.mode); if (c.triadCommon === 0) sols.push(lbl(0, m) + ' → ' + lbl(x.j, x.mode)); }));
  console.log('      （從調號 0 出發成立的：' + sols.join('、') + '）');
}
expect('h9', S(s => {
  for (let i = 0; i < 12; i++) s.turn(1);            // 常用寫法：−5 … 6
  s.setSpell('flat'); s.tap(5); s.tap(6);            // C♭、G♭
  s.setSpell('sharp'); s.tap(7);                     // C♯
}), true, '常用寫法轉一圈（12 個），再用 ♭ 寫法點 C♭、G♭、用 ♯ 寫法點 C♯');
expect('h9', S(s => { for (let i = 0; i < 12; i++) s.turn(1); s.setSpell('flat'); s.tap(5); s.tap(6); }), false, '少了 C♯');
expect('h10', S(s => { s.setK(5); s.arrange(); s.setK(7); s.arrange(); s.setK(11); s.arrange(); }), true, '×5（四度圈）、×7（倒過來的半音圈）、×11 → 回到半音圈');
expect('h10', S(s => { s.arrange(); s.arrange(); }), false, '×7 兩次也回到原樣，但只用了一面鏡子');
expect('h10', S(s => { s.setK(5); s.arrange(); s.setK(5); s.arrange(); s.setK(7); s.arrange(); s.setK(7); s.arrange(); }), false, '×5 ×5 ×7 ×7 不算');

// 檢查每個任務都有解
missions.forEach(m => { const id = m.id.replace('circle-of-fifths-', ''); if (!found[id]) { fail++; console.log('  ✗ ' + m.id + ' 沒有證明解'); } });

// ---------- 隱藏任務兩兩不連帶完成 ----------
console.log('\n隱藏任務的解（含途中每一個操作）不會順便完成另一個隱藏任務');
{
  const hidden = missions.filter(m => m.hidden);
  let bad = 0;
  hidden.forEach(h => {
    const evs = found[h.id.replace('circle-of-fifths-', '')];
    if (!evs) return;
    const others = hidden.filter(o => o !== h).filter(o => { o.mem = {}; return evs.some(e => o.check(e, o.mem)); }).map(o => o.id);
    if (others.length) { bad++; console.log('  ✗ ' + h.id + ' 的解也完成了 ' + others.join('、')); }
    else console.log('  ✓ ' + h.id + ' 的解不會完成其他隱藏任務');
  });
  if (bad) fail++;
}

// ---------- 亂按模擬 ----------
console.log('\n亂按模擬（2000 回 × 80 步隨機操作，不刻意找答案）');
{
  let seed = 20261113;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const pickI = n => Math.floor(rnd() * n);
  const counts = {};
  const SPELLS = ['auto', 'sharp', 'flat'];
  for (let r = 0; r < 2000; r++) {
    missions.forEach(m => { m.mem = {}; m.doneRun = false; });
    const s = new Sim();
    for (let k = 0; k < 80; k++) {
      const a = pickI(16);
      const before = s.log.length;
      if (a <= 2) s.turn(rnd() < 0.5 ? 1 : -1);
      else if (a === 3) s.tap(pickI(12), rnd() < 0.5 ? 'major' : 'minor');
      else if (a === 4) s.setMode(rnd() < 0.5 ? 'major' : 'minor');
      else if (a === 5) s.setSpell(SPELLS[pickI(3)]);
      else if (a === 6) s.setTarget(rnd() < 0.1 ? null : TARGETS[pickI(TARGETS.length)]);
      else if (a === 7) s.heat(pickI(12), pickI(12), rnd() < 0.5 ? 'fifths' : 'chrom');
      else if (a === 8 || a === 9) s.play(WHATS[pickI(WHATS.length)]);
      else if (a === 10 || a === 11) s.setK(1 + pickI(11));
      else if (a === 12) s.arrange();
      else if (a === 13) s.arrangeReset();
      else if (a === 14) s.clearAll();
      else s.play();
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
