/* 任務可達成的證明腳本。用法：node tools/mission-proofs/polyrhythm.js
 * 用數學核心證明每個任務在介面的範圍與精度內做得到（事件資料和 js/polyrhythm.js 送出的一樣），
 * 預設狀態與任何「只做一個操作」都不觸發任何任務，每個隱藏任務的解不會順便完成另一個隱藏任務；最後做亂按模擬。
 * 介面（全部是整數滑桿）：
 *   每個聲部：總拍數 n 2–16、重音數 k 0–n、旋轉 0–(n−1)；聲部 2、3 有開關（聲部 3 預設關）；點珠子切換某一格的重音。
 *   對齊方式：同一個循環（cycle）／同樣的格長（step）；速度 40–200 格／分；傳統節奏型按鈕 5 個；▶ 播放；3D 環面結。
 * 下面的 Page 模擬頁面的狀態轉移，規則和 js/polyrhythm.js 的 readN、readK、readR、toggleCell、預設節奏型一樣。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const Core = require(ROOT + 'js/polyrhythm-core.js');
const missions = [];
global.window = { LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/polyrhythm.js');
const byId = id => missions.find(m => m.id === 'polyrhythm-' + id);

// ---------- 頁面的狀態轉移 ----------
const PRESET_TIMBRE = { tresillo: 'high', cinquillo: 'high', samba: 'high', bell: 'bell', venda: 'clap' };
const PRESETS = Object.keys(PRESET_TIMBRE);
class Page {
  constructor() {
    this.align = 'cycle'; this.bpm = Core.BPM_DEFAULT; this.view = '2d';
    this.voices = [
      { on: true, n: 12, k: 7, rot: 0, custom: false, base: null, timbre: 'bell', src: 'default' },
      { on: true, n: 4, k: 4, rot: 0, custom: false, base: null, timbre: 'low', src: 'default' },
      { on: false, n: 3, k: 3, rot: 0, custom: false, base: null, timbre: 'clap', src: 'default' }
    ];
  }
  ev(type, extra) {
    const a = Core.analyze({ mode: this.align, bpm: this.bpm, voices: this.voices });
    return { type: type, data: Object.assign({}, a, { view: this.view, playing: false }, extra || {}) };
  }
  setN(i, n) {
    const v = this.voices[i]; n = Math.max(Core.N_MIN, Math.min(Core.N_MAX, n));
    if (n !== v.n || v.custom) { v.n = n; v.custom = false; v.base = null; v.k = Math.min(v.k, n); v.rot = Math.min(v.rot, n - 1); }
    v.src = 'slider';
    return this.ev('rhythm', { src: 'slider', changed: i });
  }
  setK(i, k) {
    const v = this.voices[i]; k = Math.max(0, Math.min(v.n, k));
    if (k !== v.k || v.custom) { v.k = k; v.custom = false; v.base = null; }
    v.src = 'slider';
    return this.ev('rhythm', { src: 'slider', changed: i });
  }
  setR(i, r) {
    const v = this.voices[i];
    v.rot = Math.max(0, Math.min(v.n - 1, r)); v.src = 'slider';
    return this.ev('rhythm', { src: 'slider', changed: i });
  }
  toggle(i, j) {
    const v = this.voices[i];
    if (!v.on) return null;
    j = Core.mod(j, v.n);
    if (!v.custom) { v.base = Core.bjorklund(v.k, v.n); v.custom = true; }
    const bi = Core.mod(j + v.rot, v.n);
    v.base[bi] = v.base[bi] ? 0 : 1;
    const p = Core.rotate(v.base, v.rot), id = Core.identify(p);
    if (id.euclid) { v.custom = false; v.base = null; v.k = id.k; v.rot = id.rot; } else v.k = Core.count(p);
    v.src = 'cell';
    return this.ev('rhythm', { src: 'cell', changed: i });
  }
  /** 點珠子直到這個聲部變成 target（逐格切換不同的格子），傳回途中的每個事件 */
  paint(i, target) {
    const evs = [];
    const cur = () => Core.toStr(Core.voicePattern(Core.normVoice(this.voices[i], i)));
    for (let j = 0; j < target.length; j++) if (cur().charAt(j) !== target.charAt(j)) evs.push(this.toggle(i, j));
    return evs;
  }
  setOn(i, on) { this.voices[i].on = on; return this.ev('rhythm', { src: 'toggle', changed: i }); }
  setAlign(m) { if (this.align === m) return null; this.align = m; return this.ev('rhythm', { src: 'align' }); }
  setBpm(b) { this.bpm = Math.max(Core.BPM_MIN, Math.min(Core.BPM_MAX, b)); return this.ev('rhythm', { src: 'tempo' }); }
  preset(id) {
    const t = Core.TRADITIONAL.find(x => x.id === id);
    this.align = 'cycle';
    this.voices[0] = { on: true, n: t.n, k: t.k, rot: t.rot, custom: false, base: null, timbre: PRESET_TIMBRE[id], src: 'preset' };
    this.voices[1] = { on: true, n: 4, k: 4, rot: 0, custom: false, base: null, timbre: 'low', src: 'preset' };
    this.voices[2].on = false;
    return this.ev('rhythm', { src: 'preset' });
  }
  play() { return this.ev('play', { src: 'play' }); }
  view3d() { this.view = '3d'; return this.ev('view', { src: 'view' }); }
  view2d() { this.view = '2d'; return null; }
}
/** 照順序做一串操作，傳回所有事件 */
function run(steps) {
  const pg = new Page(), evs = [];
  steps.forEach(s => { const r = s(pg); (Array.isArray(r) ? r : [r]).forEach(e => { if (e) evs.push(e); }); });
  return { pg: pg, evs: evs };
}

let fail = 0;
const found = {};
function expect(id, steps, want, note) {
  const m = byId(id); m.mem = {};
  const r = run(steps);
  let ok = false;
  r.evs.forEach(e => { ok = ok || !!m.check(e, m.mem); });
  const pass = ok === want;
  if (!pass) fail++;
  if (want && pass && !found[id]) found[id] = r.evs;
  console.log((pass ? '  ✓ ' : '  ✗ ') + String(id).padEnd(4) + (want ? '達成：' : '不觸發：') + note);
  return r;
}
const pat = (pg, i) => Core.toStr(Core.voicePattern(Core.normVoice(pg.voices[i], i)));

// ---------- 預設狀態、只做一個操作：都不觸發 ----------
{
  const ops = [pg => pg.play(), pg => pg.view3d(), pg => pg.setAlign('step'), pg => pg.setOn(1, false), pg => pg.setOn(2, true)];
  for (let i = 0; i < 3; i++) {
    for (let n = 2; n <= 16; n++) ops.push(pg => pg.setN(i, n));
    for (let k = 0; k <= 16; k++) ops.push(pg => pg.setK(i, k));
    for (let r = 0; r <= 15; r++) ops.push(pg => pg.setR(i, r));
    for (let j = 0; j < 12; j++) ops.push(pg => pg.toggle(i, j));
  }
  for (let b = 40; b <= 200; b++) ops.push(pg => pg.setBpm(b));
  PRESETS.forEach(id => ops.push(pg => pg.preset(id)));
  let hit = [];
  ops.forEach(op => {
    const r = run([op]);
    missions.forEach(m => { m.mem = {}; if (r.evs.some(e => m.check(e, m.mem))) hit.push(m.id); });
  });
  // 再加上「操作之後馬上按播放」與「操作之後打開 3D」
  let hit2 = [];
  ops.forEach(op => {
    const r = run([op, pg => pg.play(), pg => pg.view3d()]);
    missions.forEach(m => { m.mem = {}; if (r.evs.some(e => m.check(e, m.mem))) hit2.push(m.id); });
  });
  hit = [...new Set(hit)]; hit2 = [...new Set(hit2)];
  if (hit.length) { fail++; console.log('  ✗ 只做一個操作就觸發了 ' + hit.join('、')); }
  else console.log('  ✓ 預設狀態（聲部 1 E(7,12) 鈴、聲部 2 E(4,4) 低鼓、聲部 3 關、同一個循環、180 格／分），以及只做任何一個操作（' + ops.length + ' 種），都不觸發任何任務');
  // 「預設節奏型＋播放」本來就是任務 1 的做法；其他的不可以
  const extra = hit2.filter(id => id !== 'polyrhythm-1');
  if (extra.length) { fail++; console.log('  ✗ 一個操作再按播放、開 3D 就觸發了 ' + extra.join('、')); }
  else console.log('  ✓ 一個操作之後再按「▶ 播放」、開 3D：只有「按古巴 tresillo 再播放」完成任務 1（那就是任務 1 的做法）');
}

// ---------- 公開任務 ----------
console.log('\n公開任務');
expect('1', [pg => pg.preset('tresillo'), pg => pg.play()], true, '按「古巴 tresillo」，再按「▶ 播放」');
expect('1', [pg => pg.preset('tresillo')], false, '只按節奏型、沒播放');
{
  const r = expect('2', [pg => pg.setN(0, 8), pg => pg.setK(0, 3)], true, '聲部 1：n 拉到 8（變成 E(7,8)），k 拉到 3');
  console.log('      → ' + pat(r.pg, 0));
  expect('2', [pg => pg.preset('tresillo')], false, '按節奏型按鈕不算');
  expect('2', [pg => pg.setN(0, 8), pg => pg.setK(0, 3), pg => pg.setR(0, 1)], true, '（途中做到就算；再轉一格是 ' + Core.toStr(Core.euclid(3, 8, 1)) + '）');
}
expect('3', [pg => pg.setN(0, 3), pg => pg.setK(0, 3), pg => pg.setN(1, 2), pg => pg.play()], true, '聲部 1 n = 3、k = 3；聲部 2 n = 2（k 自動變 2）；播放');
expect('3', [pg => pg.setN(0, 3), pg => pg.setK(0, 3), pg => pg.setN(1, 2), pg => pg.setAlign('step'), pg => pg.play()], false, '「同樣的格長」不算');
expect('3', [pg => pg.setN(0, 3), pg => pg.setK(0, 3), pg => pg.setN(1, 2), pg => pg.setOn(2, true), pg => pg.play()], false, '第三個聲部開著不算');
expect('4', [pg => pg.preset('cinquillo'), pg => pg.setR(0, 2)], true, '按「古巴 cinquillo」，旋轉拉到 2 → ' + Core.toStr(Core.euclid(5, 8, 2)));
expect('4', [pg => pg.preset('cinquillo'), pg => pg.setR(0, 3)], false, '旋轉 3 是 ' + Core.toStr(Core.euclid(5, 8, 3)));
{
  const tgt = Core.toStr(Core.bjorklund(5, 12));
  expect('5', [pg => pg.setK(0, 0), pg => pg.paint(0, tgt)], true, '聲部 1（n = 12）k 拉到 0，再點出 ' + tgt + '（E(5,12)）');
  expect('5', [pg => pg.toggle(0, 1), pg => pg.toggle(0, 1)], false, '在 E(7,12) 上點兩下同一顆珠子（拿掉又放回）不算');
  const t2 = Core.toStr(Core.bjorklund(4, 12));
  expect('5', [pg => pg.setK(0, 0), pg => pg.paint(0, t2)], false, 'E(4,12)：4 和 12 不互質，不算');
}
expect('6', [pg => pg.setN(0, 16), pg => pg.setK(0, 5), pg => pg.setR(0, 6)], true, 'n = 16、k = 5、旋轉 6 → ' + Core.toStr(Core.euclid(5, 16, 6)));
expect('6', [pg => pg.setN(0, 16), pg => pg.setK(0, 5), pg => pg.setR(0, 3)], false, '旋轉 3 是另一個起點');
{
  const st = [pg => pg.setAlign('step'), pg => pg.setN(0, 4), pg => pg.setK(0, 1), pg => pg.setN(1, 3), pg => pg.setK(1, 1)];
  const r = expect('7', st, true, '同樣的格長；聲部 1 n = 4、k = 1；聲部 2 n = 3、k = 1');
  console.log('      → L = ' + r.evs[r.evs.length - 1].data.L + '，一起落拍的間隔 ' + r.evs[r.evs.length - 1].data.gaps.join(','));
  expect('7', [pg => pg.setN(0, 4), pg => pg.setK(0, 1), pg => pg.setN(1, 3), pg => pg.setK(1, 1)], false, '「同一個循環」裡同樣的設定不算');
  expect('7', [pg => pg.setAlign('step'), pg => pg.setN(0, 6), pg => pg.setK(0, 1), pg => pg.setN(1, 4), pg => pg.setK(1, 1)], true, '另一解：n = 6 與 4（lcm 也是 12）');
  expect('7', [pg => pg.setAlign('step'), pg => pg.setN(0, 3), pg => pg.setK(0, 1), pg => pg.setN(1, 2), pg => pg.setK(1, 1)], false, 'n = 3 與 2：每 6 格就相遇');
}
{
  const st = [pg => pg.setN(0, 16), pg => pg.setK(0, 0), pg => pg.paint(0, 'x..x..x...x.x...')];
  const r = expect('8', st, true, '聲部 1 n = 16、k = 0，點出 son clave');
  const v = r.evs[r.evs.length - 1].data.voices[0];
  console.log('      → 間距 ' + v.iois.join('-') + '，均勻度 ' + (100 * v.evenness).toFixed(2) + '%，最大均勻 ' + v.me);
  expect('8', [pg => pg.setN(0, 16), pg => pg.setK(0, 0), pg => pg.paint(0, '..x..x..x...x.x.')], true, '從別的重音開始也算');
}
{
  // 互補：聲部 1 = E(3,8)，聲部 2 = n 8、k 5，找旋轉
  let sol = null;
  for (let r = 0; r < 8 && !sol; r++) {
    const steps = [pg => pg.setN(0, 8), pg => pg.setK(0, 3), pg => pg.setN(1, 8), pg => pg.setK(1, 5), pg => pg.setR(1, r)];
    const m = byId('9'); m.mem = {};
    if (run(steps).evs.some(e => m.check(e, m.mem))) sol = { steps: steps, r: r };
  }
  if (sol) expect('9', sol.steps, true, '聲部 1 E(3,8)；聲部 2 n = 8、k = 5、旋轉 ' + sol.r + ' → ' + Core.toStr(Core.euclid(5, 8, sol.r)) + '（tresillo 的互補）');
  else { fail++; console.log('  ✗ 9   找不到解'); }
  expect('9', [pg => pg.setN(0, 8), pg => pg.setK(0, 3), pg => pg.setN(1, 8), pg => pg.setK(1, 5)], false, '旋轉 0 時重疊');
}
{
  const st = [pg => pg.setN(0, 4), pg => pg.setK(0, 4), pg => pg.setN(1, 3), pg => pg.setK(1, 3), pg => pg.setOn(2, true), pg => pg.setN(2, 12), pg => pg.paint(2, 'x..xx.x.xx..')];
  const r = expect('10', st, true, '同一個循環 4 對 3；開啟聲部 3、n = 12，點出 x..xx.x.xx..');
  console.log('      → 點了 ' + (r.evs.length - 6) + ' 下，合成節奏 ' + r.evs[r.evs.length - 1].data.union);
  expect('10', st.concat([pg => pg.setAlign('step')]).slice(0, 7).concat([pg => pg.setAlign('step')]), true, '（做到時就完成，之後切換不影響）');
  expect('10', [pg => pg.setN(0, 4), pg => pg.setK(0, 4), pg => pg.setN(1, 3), pg => pg.setK(1, 3), pg => pg.setOn(2, true), pg => pg.setN(2, 12), pg => pg.paint(2, 'x..xx.x.x...')], false, '少一個重音不算');
}
{
  let sol = null;
  for (let n1 = 2; n1 <= 8 && !sol; n1++) for (let n2 = 2; n2 <= 8 && !sol; n2++) {
    if (n1 === n2) continue;
    for (let k1 = 2; k1 <= n1 && !sol; k1++) for (let k2 = 2; k2 <= n2 && !sol; k2++) for (let r2 = 0; r2 < n2 && !sol; r2++) {
      const steps = [pg => pg.setAlign('step'), pg => pg.setN(0, n1), pg => pg.setK(0, k1), pg => pg.setR(0, 0), pg => pg.setN(1, n2), pg => pg.setK(1, k2), pg => pg.setR(1, r2)];
      const m = byId('11'); m.mem = {};
      if (run(steps).evs.some(e => m.check(e, m.mem))) sol = { steps, n1, k1, n2, k2, r2 };
    }
  }
  if (sol) expect('11', sol.steps, true, '同樣的格長；聲部 1 E(' + sol.k1 + ',' + sol.n1 + ') = ' + Core.toStr(Core.euclid(sol.k1, sol.n1, 0)) + '；聲部 2 E(' + sol.k2 + ',' + sol.n2 + ') 旋轉 ' + sol.r2 + ' = ' + Core.toStr(Core.euclid(sol.k2, sol.n2, sol.r2)));
  else { fail++; console.log('  ✗ 11  找不到解'); }
  // 互質的 n 一定會相遇（各一個重音時是中國剩餘定理；多個重音更會）
  let coprimeMeet = true;
  for (let n1 = 2; n1 <= 9; n1++) for (let n2 = 2; n2 <= 9; n2++) {
    if (Core.gcd(n1, n2) !== 1) continue;
    for (let k1 = 2; k1 <= n1; k1++) for (let k2 = 2; k2 <= n2; k2++) {
      const a = Core.analyze({ mode: 'step', voices: [{ n: n1, k: k1 }, { on: true, n: n2, k: k2, rot: 1 }] });
      if (a.nTogether === 0) coprimeMeet = false;
    }
  }
  if (!coprimeMeet) { fail++; console.log('  ✗ 11  n 互質卻不相遇？'); } else console.log('      （n 互質時一定會相遇：要找有公因數的 n）');
}
{
  let sol = null;
  const NS = [2, 4, 8];
  for (const mode of ['cycle', 'step']) for (const n1 of NS) for (const n2 of NS) for (let k1 = 2; k1 <= n1; k1++) for (let r1 = 0; r1 < n1; r1++) for (let k2 = 2; k2 <= n2; k2++) for (let r2 = 0; r2 < n2; r2++) {
    if (sol) break;
    const steps = [pg => pg.setAlign(mode), pg => pg.setN(0, n1), pg => pg.setK(0, k1), pg => pg.setR(0, r1), pg => pg.setN(1, n2), pg => pg.setK(1, k2), pg => pg.setR(1, r2)];
    const m = byId('12'); m.mem = {};
    if (run(steps).evs.some(e => m.check(e, m.mem))) sol = { steps, mode, n1, k1, r1, n2, k2, r2 };
  }
  if (sol) expect('12', sol.steps, true, (sol.mode === 'cycle' ? '同一個循環' : '同樣的格長') + '；聲部 1 E(' + sol.k1 + ',' + sol.n1 + ') 旋轉 ' + sol.r1 + ' = ' + Core.toStr(Core.euclid(sol.k1, sol.n1, sol.r1)) +
    '；聲部 2 E(' + sol.k2 + ',' + sol.n2 + ') 旋轉 ' + sol.r2 + ' = ' + Core.toStr(Core.euclid(sol.k2, sol.n2, sol.r2)));
  else { fail++; console.log('  ✗ 12  找不到解'); }
  expect('12', [pg => pg.preset('cinquillo'), pg => pg.setOn(1, false)], false, '只開一個聲部的 cinquillo 不算');
}

// ---------- 隱藏任務 ----------
console.log('\n隱藏任務');
expect('h1', [pg => pg.setK(0, 0), pg => pg.toggle(0, 0), pg => pg.toggle(0, 1), pg => pg.toggle(0, 2), pg => pg.toggle(0, 3)], true, '聲部 1（n = 12）k = 0，點第 0、1、2、3 格：xxxx........（最不均勻）');
expect('h1', [pg => pg.setK(0, 0), pg => pg.toggle(0, 0), pg => pg.toggle(0, 1), pg => pg.toggle(0, 2)], false, '只有 3 個不算');
expect('h2', [pg => pg.setN(0, 16), pg => pg.setK(0, 6), pg => pg.setR(0, 5)], true, 'n = 16、k = 6、旋轉 5 → ' + Core.toStr(Core.euclid(6, 16, 5)) + '（gcd(6,16) = 2：tresillo 兩次）');
expect('h2', [pg => pg.setN(0, 16), pg => pg.setK(0, 6)], false, '旋轉 0 是 ' + Core.toStr(Core.euclid(6, 16, 0)) + '（同一串項鍊，起點不對）');
expect('h3', [pg => pg.setN(0, 9), pg => pg.setK(0, 4), pg => pg.setOn(1, false), pg => pg.play()], true, 'n = 9、k = 4 → x.x.x.x..（aksak），關掉聲部 2，播放（只有一個聲部）');
expect('h3', [pg => pg.setN(0, 9), pg => pg.setK(0, 4), pg => pg.setOn(1, false)], false, '沒播放不算');
expect('h3', [pg => pg.setN(1, 9), pg => pg.play()], false, '聲部 2 拉到 n = 9（E(4,9)）但聲部 1 還在響，不算');
expect('h4', [pg => pg.preset('tresillo'), pg => pg.setN(1, 3), pg => pg.setK(1, 3), pg => pg.play()], true, '按「古巴 tresillo」；聲部 2 n = 3、k = 3；播放（三個平均的拍 vs tresillo）');
expect('h4', [pg => pg.preset('tresillo'), pg => pg.play()], false, '和四拍一起不算');
{
  const st = [pg => pg.setAlign('step'), pg => pg.setN(0, 5), pg => pg.setK(0, 1), pg => pg.setR(0, 2), pg => pg.setN(1, 7), pg => pg.setK(1, 1), pg => pg.setR(1, 1)];
  const r = expect('h5', st, true, '同樣的格長；E(1,5) 旋轉 2、E(1,7) 旋轉 1：L = 35');
  const d = r.evs[r.evs.length - 1].data;
  console.log('      → 重音在第 ' + d.voices[0].onsets[0] + '、' + d.voices[1].onsets[0] + ' 格，在第 ' + d.together.join(',') + ' 格相遇（中國剩餘定理）');
  expect('h5', [pg => pg.setAlign('step'), pg => pg.setN(0, 5), pg => pg.setK(0, 1), pg => pg.setN(1, 7), pg => pg.setK(1, 1)], false, '都從第 0 格開始不算');
}
expect('h6', [pg => pg.setN(0, 6), pg => pg.setK(0, 2), pg => pg.setN(1, 6), pg => pg.setK(1, 2), pg => pg.setR(1, 1), pg => pg.setOn(2, true), pg => pg.setN(2, 6), pg => pg.setK(2, 2), pg => pg.setR(2, 2)], true,
  '三個聲部都是 E(2,6)，旋轉 0、1、2：' + [0, 1, 2].map(r => Core.toStr(Core.euclid(2, 6, r))).join(' + '));
expect('h6', [pg => pg.setN(0, 3), pg => pg.setK(0, 1), pg => pg.setN(1, 3), pg => pg.setK(1, 1), pg => pg.setR(1, 1), pg => pg.setOn(2, true), pg => pg.setN(2, 3), pg => pg.setK(2, 1), pg => pg.setR(2, 2)], false, '各只有 1 個重音不算');
expect('h7', [pg => pg.setN(0, 5), pg => pg.setK(0, 5), pg => pg.setN(1, 2), pg => pg.view3d()], true, '同一個循環 5 對 2，打開 3D：(5, 2) 環面結（五葉結）');
expect('h7', [pg => pg.setN(0, 5), pg => pg.setK(0, 5), pg => pg.setN(1, 2)], false, '2D 不算');
expect('h7', [pg => pg.setN(0, 3), pg => pg.setK(0, 3), pg => pg.setN(1, 2), pg => pg.view3d()], false, '3 對 2 是三葉結');
expect('h8', [pg => pg.setAlign('step'), pg => pg.setN(0, 8), pg => pg.setN(1, 15), pg => pg.setBpm(120), pg => pg.play()], true, '同樣的格長；n = 8 與 15（lcm 120），速度 120：週期 60 秒');
expect('h8', [pg => pg.setAlign('step'), pg => pg.setN(0, 8), pg => pg.setN(1, 15), pg => pg.setBpm(121), pg => pg.play()], false, '速度 121：週期 ' + (120 * 60 / 121).toFixed(2) + ' 秒');
expect('h9', [pg => pg.setAlign('step'), pg => pg.setN(0, 13), pg => pg.setN(1, 15), pg => pg.setOn(2, true), pg => pg.setN(2, 16)], true, '同樣的格長；n = 13、15、16：lcm = 3120（2–16 中三個數的最大值）');
expect('h9', [pg => pg.setAlign('step'), pg => pg.setN(0, 14), pg => pg.setN(1, 15), pg => pg.setOn(2, true), pg => pg.setN(2, 16)], false, 'n = 14、15、16：lcm = ' + Core.lcm(Core.lcm(14, 15), 16));
expect('h10', [pg => pg.setN(0, 3), pg => pg.setK(0, 2), pg => pg.setN(1, 3), pg => pg.setK(1, 2), pg => pg.setR(1, 1), pg => pg.setOn(2, true), pg => pg.setK(2, 2), pg => pg.setR(2, 2)], true,
  '三個聲部都是 E(2,3)，旋轉 0、1、2：' + [0, 1, 2].map(r => Core.toStr(Core.euclid(2, 3, r))).join(' + ') + '（兩兩各相遇一次，三個從不同時）');
expect('h10', [pg => pg.setN(0, 3), pg => pg.setK(0, 2), pg => pg.setN(1, 3), pg => pg.setK(1, 2), pg => pg.setOn(2, true), pg => pg.setK(2, 2)], false, '旋轉都一樣：三個一起');

// ---------- 隱藏任務兩兩不連帶完成 ----------
console.log('\n隱藏任務的解不會順便完成另一個隱藏任務');
{
  const hidden = missions.filter(m => m.hidden);
  let bad = 0;
  hidden.forEach(h => {
    const evs = found[h.id.replace('polyrhythm-', '')];
    if (!evs) { bad++; console.log('  ✗ ' + h.id + ' 沒有解'); return; }
    const others = hidden.filter(o => o !== h).filter(o => { o.mem = {}; return evs.some(e => o.check(e, o.mem)); }).map(o => o.id);
    if (others.length) { bad++; console.log('  ✗ ' + h.id + ' 的解也完成了 ' + others.join('、')); }
    else console.log('  ✓ ' + h.id + ' 的解不會完成其他隱藏任務');
  });
  if (bad) fail++;
}

// ---------- 亂按模擬 ----------
const RUNS = 600, STEPS = 60;
console.log('\n亂按模擬（' + RUNS + ' 回 × ' + STEPS + ' 步隨機操作：滑桿隨機拖到整數格點、隨機點珠子、按節奏型、開關聲部、換對齊、改速度、播放、切 3D）');
{
  let seed = 20261113;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const pickI = n => Math.floor(rnd() * n);
  const counts = {};
  const t0 = Date.now();
  for (let run2 = 0; run2 < RUNS; run2++) {
    missions.forEach(m => { m.mem = {}; m.doneRun = false; });
    const pg = new Page();
    for (let step = 0; step < STEPS; step++) {
      const a = pickI(16), i = pickI(3);
      let e = null;
      if (a <= 2) e = pg.setN(i, 2 + pickI(15));
      else if (a <= 4) e = pg.setK(i, pickI(pg.voices[i].n + 1));
      else if (a <= 6) e = pg.setR(i, pickI(pg.voices[i].n));
      else if (a <= 9) e = pg.toggle(i, pickI(pg.voices[i].n));
      else if (a === 10) e = pg.setOn(1 + pickI(2), rnd() < 0.5);
      else if (a === 11) e = pg.setAlign(rnd() < 0.5 ? 'cycle' : 'step');
      else if (a === 12) e = pg.setBpm(40 + pickI(161));
      else if (a === 13) e = pg.preset(PRESETS[pickI(PRESETS.length)]);
      else if (a === 14) e = pg.play();
      else e = rnd() < 0.5 ? pg.view3d() : pg.view2d();
      if (!e) continue;
      missions.forEach(m => { if (!m.doneRun && m.check(e, m.mem)) { m.doneRun = true; counts[m.id] = (counts[m.id] || 0) + 1; } });
    }
  }
  const lines = missions.map(m => m.id + (m.hidden ? '（隱藏 ' : '（') + m.level + ' 級）' + (100 * (counts[m.id] || 0) / RUNS).toFixed(1) + '%');
  console.log('  ' + lines.join('\n  '));
  console.log('  （' + ((Date.now() - t0) / 1000).toFixed(1) + ' 秒）');
  const risky = missions.filter(m => m.level >= 6 && (counts[m.id] || 0) / RUNS > 0.05);
  if (risky.length) { fail++; console.log('  ✗ 6 級以上的任務亂按就完成的比例超過 5%：' + risky.map(m => m.id).join('、')); }
  else console.log('  ✓ 6 級以上的任務亂按完成的比例都不到 5%');
  const hidRisk = missions.filter(m => m.hidden && (counts[m.id] || 0) / RUNS > 0.05);
  if (hidRisk.length) { fail++; console.log('  ✗ 隱藏任務亂按就完成的比例超過 5%：' + hidRisk.map(m => m.id).join('、')); }
  else console.log('  ✓ 隱藏任務亂按完成的比例都不到 5%');
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
{ const lv = {}; hid.forEach(m => { lv[m.level] = (lv[m.level] || 0) + 1; }); if (Object.values(lv).some(c => c > 2)) { fail++; console.log('隱藏任務不要擠在同一級（同一級最多 2 個）。'); } }
if (pub.length < 10 || pub.length > 12) { fail++; console.log('公開任務要 10–12 個。'); }
if (hid.some(m => !m.riddle || !m.riddle.zh || !m.riddle.en || m.title || m.desc)) { fail++; console.log('隱藏任務只寫 riddle（中英）。'); }
if (new Set(missions.map(m => m.id)).size !== missions.length) { fail++; console.log('任務代號重複。'); }
if (fail) { console.log(`有 ${fail} 項不符合。`); process.exit(1); }
console.log('全部任務都證明做得到，預設狀態不觸發，隱藏任務之間不連帶完成。');
