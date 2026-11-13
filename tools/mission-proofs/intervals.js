/* 任務可達成的證明腳本。用法：node tools/mission-proofs/intervals.js
 * 用數學核心模擬頁面（js/intervals.js）的狀態與事件：每個操作送出的事件資料和頁面一樣（IntervalsCore.analyze + eventData）。
 * 證明每個任務都做得到、預設狀態與只做一個預設操作不觸發任何任務、每個隱藏任務的解（含途中每一個操作）不會順便完成另一個隱藏任務，
 * 並用亂按模擬確認 6 級以上的任務亂按完成的比例不到 5%。
 * 介面：下方音（字母 7 種 × 升降 5 種）；度數 1–15；性質 減、小、完全、大、增（依度數停用）；「等音（換個寫法）」「轉位」；
 *       音律兩種；鍵盤 C4–C6（點鍵設上方音或下方音）；音程表 14 列；「＋ 疊上去」「↶ 拿掉最後一塊」「全部清除」；「▶ 播放」（三種方式）「▶ 聽疊出來的音」。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const I = require(ROOT + 'js/intervals-core.js');
const missions = [];
global.window = { LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/intervals.js');
const byId = id => missions.find(m => m.id === 'intervals-' + id);
const TABLE = [[1, 'P'], [2, 'm'], [2, 'M'], [3, 'm'], [3, 'M'], [4, 'P'], [4, 'A'], [5, 'd'], [5, 'P'], [6, 'm'], [6, 'M'], [7, 'm'], [7, 'M'], [8, 'P']];

// ---------- 和 js/intervals.js 相同的狀態機 ----------
class Sim {
  constructor() {
    this.lo = I.note(0, 0, 4); this.n = 3; this.q = 'M'; this.tuning = 'equal'; this.chain = null;
    this.kb = 'upper'; this.pmode = 'both'; this.log = [];
    this.recompute();
  }
  recompute() { this.A = I.analyze(this); }
  emit(type, extra) { const ev = { type: type, data: I.eventData(this.A, extra) }; this.log.push(ev); return ev; }
  trySet(next, type, extra) {
    const lo = next.lo || this.lo, n = next.n || this.n, q = next.q || this.q;
    if (!(n >= 1 && n <= I.MAX_NUM) || I.allowedQualities(n).indexOf(q) < 0) return false;
    if (!I.upperOf(lo, n, q)) return false;
    this.lo = lo; this.n = n; this.q = q;
    this.recompute();
    this.emit(type || 'interval', extra);
    return true;
  }
  qualFor(n, q) {
    if (I.allowedQualities(n).indexOf(q) >= 0) return q;
    if (I.isPerfect(n)) return q === 'A' ? 'A' : 'P';
    return 'M';
  }
  num(n) { if (n === this.n) return this; this.trySet({ n: n, q: this.qualFor(n, this.q) }, 'interval', { src: 'num' }); return this; }
  qual(q) { if (q === this.q || I.allowedQualities(this.n).indexOf(q) < 0) return this; this.trySet({ q: q }, 'interval', { src: 'qual' }); return this; }
  /** 用選單設定音程（先度數、再性質，和學生的操作一樣） */
  set(n, q) { this.num(n); this.qual(q); return this; }
  lower(letter, acc) {
    const lo = I.note(letter, acc, this.lo.oct);
    if (lo.letter === this.lo.letter && lo.acc === this.lo.acc) return this;
    this.trySet({ lo: lo }, 'interval', { src: 'lower' }); return this;
  }
  key(midi) {
    if (this.kb === 'upper') {
      const c = I.spellUpper(this.lo, midi);
      if (c && (c.n !== this.n || c.q !== this.q)) this.trySet({ n: c.n, q: c.q }, 'interval', { src: 'key' });
    } else {
      const lo = I.spellLower(midi, this.lo.acc);
      if (lo.midi !== this.lo.midi || lo.name !== this.lo.name) this.trySet({ lo: lo }, 'interval', { src: 'key-lo' });
    }
    return this;
  }
  setKb(k) { this.kb = k; return this; }
  table(i) { const t = TABLE[i]; if (t[0] !== this.n || t[1] !== this.q) this.trySet({ n: t[0], q: t[1] }, 'interval', { src: 'table' }); return this; }
  respell() {
    const r = I.respell(this.lo, this.n, this.q);
    if (r) this.trySet({ n: r.n, q: r.q }, 'respell', { from: this.A.short, to: r.short });
    return this;
  }
  invert() {
    if (this.n === 8 && this.q === 'A') return this;
    const inv = I.invert(this.n, this.q), hi = this.A.hi, from = this.A.short;
    const lo = I.note(hi.letter, hi.acc, hi.d >= 35 ? 4 : hi.oct);
    if (!I.upperOf(lo, inv.n, inv.q)) return this;
    this.trySet({ lo: lo, n: inv.n, q: inv.q }, 'invert', { from: from, to: inv.q + inv.n });
    return this;
  }
  tune(t) { if (t === this.tuning) return this; this.tuning = t; this.recompute(); this.emit('interval', { src: 'tuning' }); return this; }
  push() {
    const start = this.chain ? this.chain.start : this.lo, bricks = this.chain ? this.chain.bricks : [];
    const b = { n: this.n, q: this.q };
    if (!I.canPush(start, bricks, b).ok) return this;
    this.chain = { start: start, bricks: bricks.concat([b]) };
    this.recompute(); this.emit('stack', { op: 'push' });
    return this;
  }
  pop() {
    if (!this.chain) return this;
    const b = this.chain.bricks.slice(0, -1);
    this.chain = b.length ? { start: this.chain.start, bricks: b } : null;
    this.recompute(); if (this.chain) this.emit('stack', { op: 'pop' });
    return this;
  }
  clear() { this.chain = null; this.recompute(); return this; }
  setMode(m) { this.pmode = m; return this; }
  play() { this.emit('play', { what: 'main', mode: this.pmode }); return this; }
  playStack() { if (this.chain) this.emit('play', { what: 'stack', mode: 'stack' }); return this; }
}

let fail = 0;
const found = {};   // 每個任務證明用的解（完整事件序列）
function run(id, sim) { const m = byId(id); m.mem = {}; return sim.log.some(e => !!m.check(e, m.mem)); }
function expect(id, sim, want, note) {
  const ok = run(id, sim), pass = ok === want;
  if (!pass) fail++;
  if (want && pass && !found[id]) found[id] = sim.log.slice();
  console.log((pass ? '  ✓ ' : '  ✗ ') + String(id).padEnd(4) + (want ? '達成：' : '不觸發：') + note);
}
const S = fn => { const s = new Sim(); fn(s); return s; };
const fx = (v, d) => v.toFixed(d);

// ---------- 預設狀態不觸發 ----------
console.log('預設狀態與只做一個操作');
{
  const ops = {
    '播放（三種方式）': s => { s.play(); s.setMode('melodic').play(); s.setMode('harmonic').play(); },
    '等音': s => s.respell(), '轉位': s => s.invert(), '純律': s => s.tune('just'), '疊上去': s => s.push(),
    '疊上去再播放': s => s.push().playStack(), '純律再播放': s => s.tune('just').play()
  };
  const hits = [];
  Object.keys(ops).forEach(k => {
    const s = new Sim(); ops[k](s);
    missions.forEach(m => { m.mem = {}; if (s.log.some(e => m.check(e, m.mem))) hits.push(k + '→' + m.id); });
  });
  // 鍵盤每一個鍵（上方音、下方音兩種模式）、音程表每一列、每個下方音
  for (let m = 60; m <= 84; m++) for (const kb of ['upper', 'lower']) {
    const s = new Sim(); s.setKb(kb).key(m);
    missions.forEach(x => { x.mem = {}; if (s.log.some(e => x.check(e, x.mem)) && hits.indexOf(x.id) < 0) hits.push('鍵 ' + m + ' ' + kb + '→' + x.id); });
  }
  if (hits.length) { fail++; console.log('  ✗ 預設狀態附近觸發了：' + hits.join('、')); }
  else console.log('  ✓ 預設（C4–E4 大三度、平均律）：只播放、只等音、只轉位、只換純律、只疊一塊、點任何一個鍵（上方音或下方音），都不觸發任何任務');
  // 鍵盤點出來的音程與音程表，都可以只用預設的下方音 C4 做到（不需要先動選單）
  let maxN = 0; for (let m = 60; m <= 84; m++) { const c = I.spellUpper(I.note(0, 0, 4), m); if (c) maxN = Math.max(maxN, c.n); }
  console.log('      （C4 上點 C4–C6 的鍵，度數 1–' + maxN + '）');
}

// ---------- 公開任務 ----------
console.log('\n公開任務');
expect('1', S(s => { s.set(5, 'P').play(); }), true, 'C4–G4 完全五度：7 個半音、3/2 = ' + fx(I.cents(1.5), 3) + ' 音分');
expect('1', S(s => { s.set(5, 'd').play(); }), false, '減五度不算');
expect('2', S(s => { s.set(3, 'm').respell(); }), true, 'C–E♭（小三度）→ 等音 → C–D♯（增二度），都是 3 個半音');
expect('2', S(s => { s.respell(); }), false, '預設的大三度等音 → 減四度 C–F♭，不算');
expect('3', S(s => { s.tune('just').invert(); }), true, '純律 C–E 大三度 5/4 → 轉位 → E–C 小六度 8/5，5/4 × 8/5 = 2');
expect('3', S(s => { s.invert(); }), false, '平均律下轉位不算（要看比值）');
expect('4', S(s => { s.tune('just').set(5, 'P').push().set(4, 'P').push(); }), true, '純律 C → G → C：3/2 × 4/3 = 2/1');
expect('4', S(s => { s.set(5, 'P').push().set(4, 'P').push(); }), false, '平均律疊不算');
expect('5', S(s => { s.set(10, 'M').play(); }), true, 'C4–E5 大十度：16 個半音、5/2 = ' + fx(I.cents(2.5), 2) + ' 音分');
expect('6', S(s => { s.tune('just').set(3, 'm').push().set(3, 'M').push(); }), true, '純律 C → E♭ → G：6/5 × 5/4 = 3/2');
expect('6', S(s => { s.tune('just').push().set(3, 'm').push(); }), false, '先大三再小三（大三和弦）不算');
expect('7', S(s => { s.set(4, 'A').invert(); }), true, '平均律 C–F♯ 增四度 600 → 轉位 → F♯–C 減五度 600');
expect('7', S(s => { s.lower(3, 0).set(4, 'A').invert(); }), true, 'F–B 增四度 → B–F 減五度（說明裡的例子）');
expect('7', S(s => { s.tune('just').set(4, 'A').invert(); }), false, '純律下不算（45/32 → 64/45 不一樣大）');
{
  const rows = [];
  for (let k = 1; k <= 8; k++) I.allowedQualities(k).filter(q => q === 'P' || q === 'M' || q === 'm').forEach(q => rows.push([q + k, I.centsOf(k, q, 'just') - I.centsOf(k, q, 'equal')]));
  rows.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  expect('8', S(s => { s.tune('just').set(7, 'm').play(); }), true, '純律小七度 9/5 = 1017.60，比平均律高 ' + fx(rows[0][1], 2) + ' 音分（第二名 ' + rows[1][0] + ' ' + fx(rows[1][1], 2) + '）');
  expect('8', S(s => { s.tune('just').set(3, 'm').play(); }), false, '小三度（+15.64）不是最大的');
}
expect('9', S(s => { s.tune('just').set(2, 'M').push().push(); }), true, '純律 C → D → E：9/8 × 9/8 = 81/64，比 5/4 高 ' + fx(I.cents(81 / 80), 2) + ' 音分（81/80）');
{
  // 三塊不同的音程、乘積剛好 3：窮舉選單上所有的音程
  const all = [];
  for (let k = 1; k <= 15; k++) I.allowedQualities(k).forEach(q => { if (q + k !== 'P1') all.push({ n: k, q: q }); });
  const sols = [];
  for (const a of all) for (const b of all) for (const c of all) {
    const sh = [a.q + a.n, b.q + b.n, c.q + c.n];
    if (sh[0] === sh[1] || sh[1] === sh[2] || sh[0] === sh[2]) continue;
    const st = I.stack(I.note(0, 0, 4), [a, b, c]);
    if (st.ok && st.prod[0] === 3 && st.prod[1] === 1) sols.push(sh.join('+'));
  }
  expect('10', S(s => { s.tune('just').push().set(3, 'm').push().set(8, 'P').push(); }), true, '純律 C → E → G → G：5/4 × 6/5 × 2 = 3（共 ' + sols.length + ' 種疊法，例如 ' + sols.slice(0, 4).join('、') + '）');
  expect('10', S(s => { s.tune('just').set(5, 'P').push().set(4, 'P').push().set(5, 'P').push(); }), false, '五度＋四度＋五度也是 3，但用了兩塊一樣的，不算');
  expect('10', S(s => { s.tune('just').set(1, 'P').push().set(8, 'P').push().set(5, 'P').push(); }), false, '同度＋八度＋五度：同度不算一塊');
}
expect('11', S(s => { s.tune('just').set(2, 'M').invert(); }), true, '純律 C–D 大二度 9/8 → 轉位 → D–C 小七度 9/5：9/8 × 9/5 = 81/40 = 2 × 81/80');
expect('11', S(s => { s.tune('just').set(7, 'm').invert(); }), true, '反過來小七度 → 大二度也算');
expect('11', S(s => { s.tune('just').set(3, 'm').invert(); }), false, '其他的轉位相乘都是 2');
{
  // 四塊不同的音程、乘積剛好 4：窮舉選單上所有的音程（只列幾個）
  const all = [];
  for (let k = 1; k <= 15; k++) I.allowedQualities(k).forEach(q => { if (q + k !== 'P1') all.push({ n: k, q: q }); });
  let cnt = 0; const ex = [];
  const C4 = I.note(0, 0, 4);
  for (const a of all) for (const b of all) for (const c of all) {
    const sh3 = [a.q + a.n, b.q + b.n, c.q + c.n];
    if (new Set(sh3).size < 3) continue;
    const p3 = I.mul(I.mul(I.justRatio(a.n, a.q), I.justRatio(b.n, b.q)), I.justRatio(c.n, c.q));
    const need = I.div([4, 1], p3);
    for (const d of all) {
      const r = I.justRatio(d.n, d.q);
      if (!I.feq(r, need) || sh3.indexOf(d.q + d.n) >= 0) continue;
      if (!I.stack(C4, [a, b, c, d]).ok) continue;
      cnt++; if (ex.length < 3 && cnt % 97 === 1) ex.push(sh3.concat([d.q + d.n]).join('+'));
    }
  }
  expect('12', S(s => { s.tune('just').push().set(3, 'm').push().set(4, 'P').push().set(8, 'P').push(); }), true, '純律 C → E → G → C → C：5/4 × 6/5 × 4/3 × 2 = 4（從 C4 起共 ' + cnt + ' 種疊法，例如 ' + ex.join('、') + '）');
  expect('12', S(s => { s.tune('just').set(8, 'P').push().push(); }), false, '兩個八度（同一塊用兩次、只有兩塊）不算');
  expect('12', S(s => { s.tune('just').set(1, 'P').push().set(15, 'P').push().set(1, 'A').push().set(2, 'd').push(); }), false, '用同度湊數不算');
  expect('12', S(s => { s.tune('just').set(5, 'P').push().set(4, 'P').push().set(5, 'P').push().set(4, 'P').push(); }), false, '五度、四度各用兩次不算（要四塊都不同）');
}
{
  const odd = [];
  for (let k = 1; k <= 15; k++) I.allowedQualities(k).forEach(q => { if (k === 8 && q === 'A') return; const a = I.analyze({ lo: I.note(0, 0, 4), n: k, q: q, tuning: 'just', chain: null }); if (!a.inv.prodTwo) odd.push(q + k); });
  console.log('      （轉位相乘不是 2 的：' + odd.join('、') + '，都是大二度或小七度加上八度）');
}

// ---------- 隱藏任務 ----------
console.log('\n隱藏任務');
expect('h1', S(s => { s.set(1, 'A'); }), true, 'C–C♯ 增一度：同一個字母 C，半音 1 個（純律 25/24 = ' + fx(I.cents(25 / 24), 2) + ' 音分）');
expect('h1', S(s => { s.set(2, 'm').respell(); }), true, '小二度 C–D♭ → 等音 → 增一度 C–C♯');
expect('h2', S(s => { s.set(1, 'P').invert(); }), true, 'C–C 同度 → 轉位 → C–C 八度（1 + 8 = 9，0 + 12 = 12）');
expect('h2', S(s => { s.set(8, 'P').invert(); }), false, '八度轉位成同度（反方向）不算');
expect('h3', S(s => { s.tune('just').push().push().set(6, 'm'); }), true, '純律疊 C–E–G♯（25/16 = 772.63）再選小六度 8/5 = 813.69：差 41.06 音分（128/125）');
expect('h3', S(s => { s.push().push().set(6, 'm').tune('just'); }), true, '先在平均律做好再切純律也算（平均律時兩者都是 800 音分）');
expect('h3', S(s => { s.tune('just').push().push(); }), false, '只疊兩個大三度不算（要和小六度比）');
expect('h4', S(s => { s.tune('just').set(4, 'A').play().respell().play(); }), true, '純律 C–F♯ 45/32 = 590.22 播放 → 等音 → C–G♭ 64/45 = 609.78 播放：差 2048/2025 = ' + fx(I.cents(2048 / 2025), 2) + ' 音分');
expect('h4', S(s => { s.tune('just').set(4, 'A').respell(); }), false, '只換寫法、沒有兩個都聽，不算');
expect('h4', S(s => { s.set(4, 'A').play().respell().play(); }), false, '平均律下不算（都是 600）');
expect('h5', S(s => { s.tune('just').push().push().push(); }), true, '純律 C–E–G♯–B♯：125/64 = 1158.94，比八度少 41.06 音分');
expect('h6', S(s => { s.tune('just').set(3, 'm').push().push().push(); }), true, '純律 C–E♭–G♭–B♭♭ 減七度 216/125 = 947.92；平均律 900 = 大六度；比純律大六度 5/3 高 648/625 = ' + fx(I.cents(648 / 625), 2) + ' 音分');
expect('h7', S(s => { s.set(2, 'd').play().tune('just').play(); }), true, 'C–D♭♭ 減二度：平均律 0 個半音（同一個鍵），純律 128/125 = ' + fx(I.cents(128 / 125), 2) + ' 音分');
expect('h7', S(s => { s.tune('just').set(2, 'd').play(); }), false, '只用純律播不算（要先聽平均律的同一個鍵）');
expect('h7', S(s => { s.set(2, 'd').play(); }), false, '只用平均律播不算');
expect('h8', S(s => { s.tune('just').set(5, 'P').push().push().push().push(); }), true, '純律 C–G–D–A–E：81/16，比兩個八度加大三度（5）高 81/80 = 21.51 音分');
expect('h8', S(s => { s.set(5, 'P').push().push().push().push(); }), false, '平均律疊四個五度剛好 2800 音分，不算');
expect('h9', S(s => { s.tune('just').set(3, 'A').play().set(4, 'd').play(); }), true, '純律 C–E♯ 增三度 125/96 = 456.99，再播 C–F♭ 減四度 32/25 = 427.37：四度比三度小');
expect('h9', S(s => { s.tune('just').set(4, 'd').play().set(3, 'A').play(); }), false, '順序反過來不算');
expect('h9', S(s => { s.tune('just').set(3, 'A').play().lower(1, 0).set(4, 'd').play(); }), false, '中途換了下方音不算');
expect('h10', S(s => { s.set(8, 'P').respell().respell(); }), true, 'C–C 完全八度 → 等音 → C–D♭♭ 減九度 → 等音 → C–B♯ 增七度：同一個鍵三個名字');
expect('h10', S(s => { s.set(8, 'P').respell().set(8, 'P').respell(); }), false, '中間改了音程（不是連續換寫法）不算');

// 檢查每個任務都有解
missions.forEach(m => { const id = m.id.replace('intervals-', ''); if (!found[id]) { fail++; console.log('  ✗ ' + m.id + ' 沒有證明解'); } });

// ---------- 隱藏任務兩兩不連帶完成 ----------
console.log('\n隱藏任務的解（含途中每一個操作）不會順便完成另一個隱藏任務');
{
  const hidden = missions.filter(m => m.hidden);
  let bad = 0;
  hidden.forEach(h => {
    const evs = found[h.id.replace('intervals-', '')];
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
  const QS = ['d', 'm', 'P', 'M', 'A'], MODES = ['both', 'melodic', 'harmonic'];
  const counts = {};
  for (let r = 0; r < 2000; r++) {
    missions.forEach(m => { m.mem = {}; m.doneRun = false; });
    const s = new Sim();
    for (let k = 0; k < 80; k++) {
      const a = pickI(16), before = s.log.length;
      if (a === 0) s.lower(pickI(7), pickI(5) - 2);
      else if (a === 1 || a === 2) s.num(1 + pickI(15));
      else if (a === 3 || a === 4) s.qual(QS[pickI(5)]);
      else if (a === 5) s.respell();
      else if (a === 6) s.invert();
      else if (a === 7) s.tune(s.tuning === 'equal' ? 'just' : 'equal');
      else if (a === 8) s.setKb(rnd() < 0.5 ? 'upper' : 'lower').key(60 + pickI(25));
      else if (a === 9) s.table(pickI(TABLE.length));
      else if (a === 10) s.push();
      else if (a === 11) s.pop();
      else if (a === 12) s.clear();
      else if (a === 13) s.setMode(MODES[pickI(3)]).play();
      else if (a === 14) s.playStack();
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
