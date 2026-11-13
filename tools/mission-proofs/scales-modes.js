/* 任務可達成的證明腳本。用法：node tools/mission-proofs/scales-modes.js
 * 用數學核心模擬頁面（js/scales-modes.js）的狀態與事件：每個操作送出的事件資料和頁面一樣（ScalesModesCore.analyze + eventData）。
 * 證明每個任務都做得到、預設狀態與只做預設操作不觸發任何任務、每個隱藏任務的解（含達成它之前必經的操作）不會順便完成另一個隱藏任務，
 * 並用亂按模擬確認 6 級以上的任務亂按完成的比例不到 5%。
 * 介面：主音選單 17 種寫法；音階選單 11 種預設＋「自訂」；亮暗階梯 7 格與「▲ 更亮」「▼ 更暗」；鍵盤 C4–C5 與鐘面 12 格（點音加入或移出，主音不能移出）；
 *       音律兩種；方向四種；步伐條每一步可點；「記住這個音階」「全部清除」。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const SM = require(ROOT + 'js/scales-modes-core.js');
const missions = [];
global.window = { LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/scales-modes.js');
const byId = id => missions.find(m => m.id === 'scales-modes-' + id);
const PRESETS = ['ionian', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'aeolian', 'locrian', 'harmonic', 'melodic', 'wholetone', 'chromatic'];
const mod = (a, n) => ((a % n) + n) % n;

// ---------- 和 js/scales-modes.js 相同的狀態機 ----------
class Sim {
  constructor() {
    this.tonicName = 'C'; this.type = 'ionian'; this.semis = SM.semisFromSteps(SM.scaleSteps('ionian'));
    this.tuning = 'equal'; this.dir = 'up'; this.tempo = 120; this.ref = null; this.log = [];
    this.recompute();
  }
  recompute() { this.A = SM.analyze(this.tonicName, this.semis, this.type, { tuning: this.tuning, ref: this.ref }); }
  emit(type, extra) { const ev = { type: type, data: SM.eventData(this.A, extra) }; this.log.push(ev); return ev; }
  changed(src, extra) { this.recompute(); return this.emit('scale', Object.assign({ src: src }, extra || {})); }
  setPreset(id, src, extra) { this.type = id; this.semis = SM.semisFromSteps(SM.scaleSteps(id)); return this.changed(src, extra); }
  scale(v) { if (v === 'custom') { this.type = 'custom'; return this.changed('type'); } return this.setPreset(v, 'type'); }
  tonic(name) { const t = SM.tonicByName(name); if (!t || t.name === this.tonicName) return null; this.tonicName = t.name; return this.changed('tonic'); }
  ladder(id) { const from = this.A.mode; return this.setPreset(id, 'ladder', { ladder: { dir: 0, wrap: false, from: from, degree: null } }); }
  ladderGo(dir) {
    if (!this.A.mode) return null;
    const st = SM.ladderStep(this.A.mode, this.A.tonic, dir), from = this.A.mode;
    const semis = SM.semisFromSteps(SM.scaleSteps(st.mode));
    if (st.wrap) this.tonicName = SM.bestTonic(st.tonicPc, semis).name;
    this.type = st.mode; this.semis = semis; this.recompute();
    return this.emit('scale', { src: 'ladder', ladder: { dir: dir, wrap: st.wrap, from: from, degree: st.degree } });
  }
  toggle(pc) {
    pc = mod(pc, 12);
    const rel = mod(pc - this.A.tonic, 12);
    if (rel === 0) return null;
    const i = this.semis.indexOf(rel);
    this.semis = i >= 0 ? this.semis.filter(x => x !== rel) : SM.normSemis(this.semis.concat([rel]));
    this.type = 'custom';
    return this.changed('custom', { toggled: pc, added: i < 0 });
  }
  tune(t) { if (t === this.tuning) return null; this.tuning = t; return this.changed('tuning'); }
  pin() { this.ref = { tonicName: this.tonicName, semis: this.semis.slice(), type: this.type }; this.recompute(); return this.emit('scale', { src: 'pin' }); }
  clear() { this.ref = null; this.recompute(); return null; }
  setDir(d) { this.dir = d; return null; }
  play() { return this.emit('play', { dir: this.dir, tempo: this.tempo }); }
  step(i) {
    const A = this.A, lo = A.notes[i], hi = A.notes[i + 1], s = A.steps[i];
    if (!lo || !hi) return null;
    const r = SM.stepRatio(this.tuning, lo.semis, hi.semis);
    return this.emit('step', { i: i, size: s, lo: lo.semis, hi: hi.semis, stepCents: r.cents, p: r.p == null ? null : r.p, q: r.q == null ? null : r.q });
  }
  /** 從目前的音點鍵盤，變成「比主音高 rel 個半音」這一組（先加後減，一次點一個） */
  buildTo(rel) {
    const want = SM.normSemis(rel);
    want.filter(s => this.semis.indexOf(s) < 0).forEach(s => this.toggle(this.A.tonic + s));
    this.semis.slice().filter(s => want.indexOf(s) < 0).forEach(s => this.toggle(this.A.tonic + s));
    return this;
  }
}

let fail = 0;
const found = {};   // 每個任務證明用的解（完整事件序列）
function run(id, sim) {
  const m = byId(id); m.mem = {};
  return sim.log.some(e => !!m.check(e, m.mem));
}
function expect(id, sim, want, note) {
  const ok = run(id, sim), pass = ok === want;
  if (!pass) fail++;
  if (want && pass && !found[id]) found[id] = sim.log.slice();
  console.log((pass ? '  ✓ ' : '  ✗ ') + String(id).padEnd(4) + (want ? '達成：' : '不觸發：') + note);
}
const S = fn => { const s = new Sim(); fn(s); return s; };
/** 所有含 0 的音集合 */
function* allSets() { for (let m = 1; m < 4096; m += 2) { const p = []; for (let i = 0; i < 12; i++) if (m >> i & 1) p.push(i); yield p; } }
const firstSet = pred => { for (const p of allSets()) if (pred(p)) return p; return null; };

// ---------- 預設狀態不觸發 ----------
console.log('預設狀態與只做預設操作');
{
  // 預設：主音 C、伊奧尼亞（大調）、十二平均律、上行、120 BPM、沒有記住的音階。頁面載入時不送事件。
  const s = new Sim();
  s.play(); for (let i = 0; i < 7; i++) s.step(i);
  s.pin(); s.ladder('ionian'); s.scale('ionian');
  s.tune('just'); for (let i = 0; i < 7; i++) s.step(i);
  s.tune('equal');
  const hit = missions.filter(m => { m.mem = {}; return s.log.some(e => m.check(e, m.mem)); }).map(m => m.id);
  // 只換主音（每換一次就是新的預設音階）
  const hit2 = [];
  SM.TONICS.forEach(t => { const x = new Sim(); x.tonic(t.name); missions.forEach(m => { m.mem = {}; if (x.log.some(e => m.check(e, m.mem)) && hit2.indexOf(m.id) < 0) hit2.push(m.id); }); });
  if (hit.length || hit2.length) { fail++; console.log('  ✗ 預設狀態觸發了 ' + hit.concat(hit2).join('、')); }
  else console.log('  ✓ 預設的 C 大調直接播放、點每一個步伐（兩種音律）、記住、只換主音（17 種），都不觸發任何任務');
}

// ---------- 公開任務 ----------
console.log('\n公開任務');
expect('1', S(s => { s.setDir('updown'); s.play(); }), true, 'C 伊奧尼亞，方向「上行再下行」，播放 → 步伐 ' + SM.scaleSteps('ionian').join(' '));
expect('1', S(s => { s.play(); }), false, '預設方向（上行）不算');
expect('2', S(s => { s.tonic('F'); s.play(); }), true, 'F 大調：' + SM.analyze('F', SM.MAJOR_SEMIS, 'ionian').names.join(' '));
expect('2', S(s => { s.tonic('E♭'); s.play(); }), false, 'E♭ 大調不算（只要 F）');
expect('3', S(s => { s.tonic('D'); s.scale('dorian'); }), true, 'D 多利亞：' + SM.analyze('D', SM.semisFromSteps(SM.scaleSteps('dorian')), 'dorian').names.join(' '));
expect('3', S(s => { s.scale('dorian'); }), false, 'C 多利亞有 E♭、B♭，不算');
expect('4', S(s => { s.pin(); s.tonic('A'); s.scale('aeolian'); }), true, '記住 C 大調 → A 自然小調，共用 7 個音');
expect('4', S(s => { s.pin(); s.scale('aeolian'); }), false, 'C 自然小調只共用 4 個音');
expect('5', S(s => { s.play(); s.tune('just'); s.play(); }), true, '同一個 C 大調，平均律播一次、純律播一次');
expect('5', S(s => { s.play(); s.tune('just'); s.tonic('G'); s.play(); }), false, '換了主音就不是同一個音階');
expect('6', S(s => { s.ladder('lydian'); for (let k = 0; k < 6; k++) s.ladderGo(1); }), true, 'C：利底亞 →（▼ 更暗 × 6）→ 洛克里亞，依序降第 4、7、3、6、2、5 級');
expect('6', S(s => { s.ladder('lydian'); s.ladderGo(1); s.ladder('mixolydian'); for (let k = 0; k < 4; k++) s.ladderGo(1); }), false, '中間直接點了一格（跳過），不算');
expect('6', S(s => { s.ladder('lydian'); s.ladderGo(1); s.tune('just'); s.pin(); for (let k = 0; k < 5; k++) s.ladderGo(1); }), true, '中途換音律或按「記住」不影響');
expect('7', S(s => { s.tonic('E'); s.scale('phrygian'); s.step(0); s.step(4); }), true, 'E 弗里吉亞：E–F（第 1 步）與 B–C（第 5 步）');
expect('7', S(s => { s.tonic('E'); s.scale('phrygian'); s.step(0); s.step(1); }), false, '只點到一個半音');
expect('8', S(s => { s.scale('harmonic'); s.step(5); }), true, 'C 和聲小調第 6 步 A♭–B：' + SM.scaleSteps('harmonic')[5] + ' 個半音');
expect('9', S(s => { s.buildTo([0, 2, 3, 5, 7, 9, 10]); }), true, '從 C 大調點 E♭、B♭，再點掉 E、B → C 多利亞');
expect('9', S(s => { s.scale('dorian'); }), false, '直接從選單選不算（要自己拼）');
{
  const p = [0, 2, 4, 6, 8, 9, 11];   // 利底亞增音階（旋律小調的第 3 個轉位）
  const a = SM.analyze('C', p, 'custom');
  expect('11', S(s => s.buildTo(p)), true, 'C 利底亞增：' + a.names.join(' ') + '，步伐 ' + a.steps.join(' ') + '，亮度 +' + a.brightness);
  expect('11', S(s => s.buildTo([0, 3, 4, 6, 7, 9, 11])), false, '利底亞把第 2 級升高（亮度 +28）有一步是 3 個半音，不算');
  const up = [];
  for (const q of allSets()) if (q.length === 7) { const x = SM.analyze('C', q, 'custom'); if (x.brightness > 21 && x.steps.every(t => t === 1 || t === 2)) up.push(x.names.join(' ') + '（+' + x.brightness + '）'); }
  console.log('      （只用全音和半音、又比利底亞亮的七聲音階：' + up.join('、') + '）');
}
{
  // 七個降記號：C♭ 大調的音。選單沒有 C♭，所以用 E♭ 弗里吉亞、A♭ 多利亞、D♭ 混合利底亞等
  const sols = [];
  SM.TONICS.forEach(t => SM.MODE_IDS.forEach(id => { const a = SM.analyze(t.name, SM.semisFromSteps(SM.scaleSteps(id)), id); if (a.flats === 7 && a.sharps === 0 && a.doubles === 0) sols.push(t.name + ' ' + id); }));
  expect('10', S(s => { s.tonic('E♭'); s.scale('phrygian'); s.play(); }), true, 'E♭ 弗里吉亞（C♭ 大調的音）；共 ' + sols.length + ' 種：' + sols.join('、'));
}
expect('12', S(s => { s.buildTo([0, 3, 4, 7, 8, 11]); }), true, '增音階 C E♭ E G A♭ B（小三度、半音交替）：往上移 4 個半音就重合');
expect('12', S(s => { s.buildTo([0, 1, 5, 6, 7, 11]); }), true, '梅湘第 5 調式 {0,1,5,6,7,11}：移 6 個半音重合');
expect('12', S(s => { s.buildTo([0, 2, 4, 6, 8, 10]); }), false, '全音音階不算');
expect('12', S(s => { s.buildTo([0, 1, 3, 4, 6, 7, 9, 10]); s.log = s.log.slice(-1); }), false, '八聲音階不算（只看最後一個事件）');
expect('12', S(s => { s.buildTo([0, 3, 6, 9]); }), false, '減七和弦只有 4 個音，不算');
{
  const bySize = {};
  for (const p of allSets()) { const a = SM.analyze('C', p, 'custom'); if (p.length >= 5 && p.length <= 9 && a.sym && ['wholetone', 'octatonic', 'chromatic'].indexOf(a.family) < 0) bySize[p.length] = (bySize[p.length] || 0) + 1; }
  console.log('      （含主音、5–9 個音、有移位對稱、又不是三種排除的音階：' + Object.keys(bySize).map(k => k + ' 個音 ' + bySize[k] + ' 個').join('、') + '）');
  const ks = {};
  for (const p of allSets()) { const a = SM.analyze('C', p, 'custom'); if (a.maxEven && a.myhill) ks[p.length] = 1; }
  const ok = JSON.stringify(Object.keys(ks).map(Number)) === '[5,7,11]';
  if (!ok) fail++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + '    窮舉 2048 個集合：最大均勻又 Myhill 的只有 ' + Object.keys(ks).join('、') + ' 個音（頁面說明引用）');
}

// ---------- 隱藏任務 ----------
console.log('\n隱藏任務');
expect('h1', S(s => { s.scale('locrian'); s.setDir('arp'); s.play(); }), true, 'C 洛克里亞，方向「主三和弦琶音」：C E♭ G♭ 減三和弦');
expect('h1', S(s => { s.scale('aeolian'); s.setDir('arp'); s.play(); }), false, '其他調式的琶音不算');
expect('h2', S(s => { s.buildTo([0, 2, 4, 6, 8, 10]); }), true, '從 C 大調點 F♯、G♯、A♯，點掉 F、G、A、B → 全音音階');
expect('h2', S(s => { s.scale('wholetone'); }), false, '直接選「全音音階」不算');
expect('h3', S(s => { s.tonic('D'); s.scale('dorian'); s.setDir('down'); s.play(); }), true, 'D 多利亞下行：步伐 2 1 2 2 2 1 2 前後對稱，下行和上行的步伐一樣');
expect('h3', S(s => { s.tonic('D'); s.scale('dorian'); s.play(); }), false, '上行不算');
expect('h4', S(s => { s.scale('aeolian'); s.ladderGo(1); s.ladderGo(1); s.ladderGo(1); }), true, 'C 伊奧利亞 ▼ 弗里吉亞 ▼ 洛克里亞 ▼（再一步）→ ' + SM.bestTonic(11, SM.semisFromSteps(SM.scaleSteps('lydian'))).name + ' 利底亞');
expect('h4', S(s => { s.ladder('ionian'); s.ladderGo(-1); s.ladderGo(-1); }), false, '只走一格到盡頭再跨過去不算（要連走 3 格）');
expect('h4', S(s => { s.ladder('mixolydian'); s.ladderGo(-1); s.ladderGo(-1); s.ladderGo(-1); }), true, '反方向也算：C 混合利底亞 ▲ ▲ 到利底亞，再 ▲ → C♯ 洛克里亞');
expect('h4', S(s => { s.scale('locrian'); s.ladderGo(1); }), false, '直接選洛克里亞再 ▼ 不算');
expect('h4', S(s => { s.ladder('lydian'); s.ladderGo(1); s.ladderGo(1); }), false, '一般的走一格不算');
expect('h5', S(s => { s.tonic('F'); s.scale('lydian'); s.pin(); s.tonic('B'); s.scale('locrian'); }), true, '記住 F 利底亞 → B 洛克里亞：同一組白鍵');
expect('h5', S(s => { s.scale('lydian'); s.pin(); s.scale('locrian'); }), false, 'C 利底亞與 C 洛克里亞不是同一組音');
expect('h6', S(s => { s.tonic('G♯'); s.scale('harmonic'); s.play(); }), true, 'G♯ 和聲小調：' + SM.analyze('G♯', SM.semisFromSteps(SM.scaleSteps('harmonic')), 'harmonic').names.join(' '));
{
  const sols = SM.TONICS.filter(t => { const s = new Sim(); s.tonic(t.name); s.scale('harmonic'); s.play(); const m = byId('h6'); m.mem = {}; return s.log.some(e => m.check(e, m.mem)); }).map(t => t.name);
  console.log('      （成立的主音：' + sols.join('、') + '）');
}
expect('h6', S(s => { s.tonic('A♯'); s.scale('ionian'); s.play(); }), false, 'A♯ 大調有 3 個重升，但不是和聲小調');
expect('h7', S(s => { s.buildTo([0, 1, 3, 4, 6, 7, 9, 10]); }), true, '八聲音階 C D♭ E♭ F♭ G♭ G A B♭（半全交替）');
{
  let n = 0; for (const p of allSets()) if (p.length === 8 && SM.analyze('C', p, 'custom').maxEven) n++;
  console.log('      （含主音的八聲最大均勻集合共 ' + n + ' 個，都是半全或全半交替）');
}
expect('h8', S(s => { s.buildTo([0, 1, 2, 3, 4, 5, 6]); }), true, '七個相鄰半音 C–F♯：音程向量 (6,5,4,3,2,1)');
expect('h8', S(s => { s.buildTo([0, 2, 3, 5, 7, 9, 10]); }), false, '自然音階的音程向量也六項都不同，但不算（是教會調式）');
expect('h9', S(s => { s.tune('just'); s.scale('chromatic'); s.step(3); s.step(8); s.step(10); }), true, '純律半音音階：E♭–E、A♭–A、B♭–B 都是 25/24 ＝ ' + SM.stepRatio('just', 3, 4).cents.toFixed(3) + ' 音分');
expect('h9', S(s => { s.tune('just'); s.scale('chromatic'); s.step(3); s.step(3); s.step(8); }), false, '只點到兩個不算');
expect('h9', S(s => { s.tune('just'); s.scale('chromatic'); s.step(3); s.step(8); s.tonic('D'); s.scale('chromatic'); s.step(10); }), false, '中途換了主音（不同的音階）不算');
{
  const pairs = [];
  for (let a = 0; a < 12; a++) { const r = SM.stepRatio('just', a, a + 1); if (Math.abs(r.cents - 1200 * Math.log2(25 / 24)) < 0.01) pairs.push(a + '→' + (a + 1) + '（' + r.p + '/' + r.q + '）'); }
  console.log('      （純律中相差 25/24 的相鄰半音：' + pairs.join('、') + '）');
}
expect('h9', S(s => { s.scale('chromatic'); s.step(3); s.step(8); s.step(10); }), false, '十二平均律的半音（100 音分）不算');
expect('h10', S(s => { s.buildTo([0, 1, 4, 6]); s.pin(); s.buildTo([0, 1, 3, 7]); }), true, '記住 {C, D♭, E, F♯} → {C, D♭, E♭, G}：音程向量都是 (1,1,1,1,1,1)');
expect('h10', S(s => { s.buildTo([0, 4, 7]); s.pin(); s.buildTo([0, 3, 7]); }), false, '大三和弦與小三和弦同向量，但它們互為倒影（同一個集合類）');
{
  // Z 關係的數量（4 個音以上、和主音無關的集合類）
  let z = 0; const seen = {};
  const sets = Array.from(allSets()).filter(p => p.length >= 4);
  for (const p of sets) for (const q of sets) if (p.length === q.length && p < q) {
    if (JSON.stringify(SM.intervalVector(p)) === JSON.stringify(SM.intervalVector(q)) && !SM.sameSetClass(p, q)) { const k = SM.intervalVector(p).join(','); seen[k] = 1; }
  }
  z = Object.keys(seen).length;
  console.log('      （有 Z 關係的音程向量共 ' + z + ' 種）');
}

// 檢查每個任務都有解
missions.forEach(m => { const id = m.id.replace('scales-modes-', ''); if (!found[id]) { fail++; console.log('  ✗ ' + m.id + ' 沒有證明解'); } });

// ---------- 隱藏任務兩兩不連帶完成 ----------
console.log('\n隱藏任務的解（含途中每一個操作）不會順便完成另一個隱藏任務');
{
  const hidden = missions.filter(m => m.hidden);
  let bad = 0;
  hidden.forEach(h => {
    const evs = found[h.id.replace('scales-modes-', '')];
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
  const DIRS = ['up', 'down', 'updown', 'arp'];
  for (let r = 0; r < 2000; r++) {
    missions.forEach(m => { m.mem = {}; m.doneRun = false; });
    const s = new Sim();
    for (let k = 0; k < 80; k++) {
      const a = pickI(14);
      const before = s.log.length;
      if (a === 0) s.scale(rnd() < 1 / 12 ? 'custom' : PRESETS[pickI(PRESETS.length)]);
      else if (a === 1) s.tonic(SM.TONICS[pickI(SM.TONICS.length)].name);
      else if (a === 2) s.ladder(SM.BRIGHT_ORDER[pickI(7)]);
      else if (a === 3) s.ladderGo(rnd() < 0.5 ? 1 : -1);
      else if (a === 4 || a === 5 || a === 6) s.toggle(pickI(12));
      else if (a === 7) s.tune(s.tuning === 'equal' ? 'just' : 'equal');
      else if (a === 8) s.pin();
      else if (a === 9) s.clear();
      else if (a === 10) s.setDir(DIRS[pickI(4)]);
      else if (a === 11) s.play();
      else s.step(pickI(s.A.n));
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
