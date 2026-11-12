/* 任務可達成的證明腳本。用法：node tools/mission-proofs/perceptron.js
 * 用計算核心的 Session（js/perceptron.js 也是用它送事件）模擬頁面，證明：
 *   1. 預設狀態不觸發；2. 每個任務都做得到（印出解法），以及幾個「差一點」的反例；
 *   3. 十個隱藏任務的解法不會順便完成另一個隱藏任務（交叉表）；
 *   4. 像試玩工具一樣亂按（按鈕、滑桿、勾選、在畫布上點與拖曳），隱藏任務被誤觸的機率；
 *   5. 要靠運氣的任務，平均要試幾次。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const C = require(ROOT + 'js/perceptron-core.js');
const missions = [];
global.window = { LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/perceptron.js');
const byId = id => missions.find(m => m.id === 'perceptron-' + id);
const hidden = missions.filter(m => m.hidden);
const G = C.GRID;

// ---------- 與頁面相同的操作（js/perceptron.js 的按鈕都呼叫這些 Session 方法） ----------
class Sim {
  constructor() {
    this.ev = []; this.view3d = false; this.rotated = false;
    this.S = new C.Session({ emit: (type, data) => {
      if (type === 'step') { data.view3d = this.view3d; data.rotated = this.rotated; }
      this.ev.push({ type: type, data: data });
    } });
    this.S.loadPreset('and', true);   // 頁面一打開：AND，不送事件
  }
  preset(name) { this.S.loadPreset(name); return this; }
  clear() { this.S.clear(); return this; }
  add(x, y, c) { this.S.addPoint(Math.round(x * G), Math.round(y * G), c); return this; }
  pts(list) { list.forEach(p => this.add(p[0], p[1], p[2])); return this; }
  idx(x, y) { return this.S.indexAt(Math.round(x * G), Math.round(y * G)); }
  remove(x, y) { if (!this.S.removeAt(this.idx(x, y))) throw new Error('沒有點 ' + x + ',' + y); return this; }
  move(x, y, nx, ny) { if (!this.S.movePoint(this.idx(x, y), Math.round(nx * G), Math.round(ny * G))) throw new Error('移不動'); return this; }
  set(k, v) { this.S.setCfg(k, v); return this; }
  step(n) { for (let k = 0; k < (n || 1); k++) this.S.step(true); return this; }
  epoch(n) { for (let k = 0; k < (n || 1); k++) this.S.runEpoch(); return this; }
  learn() { this.S.learn(); return this; }
  restart() { this.S.resetTraining(); return this; }
  view3(on, rotate) { this.view3d = on; if (on && rotate) this.rotated = true; return this; }
  last(type) { for (let i = this.ev.length - 1; i >= 0; i--) if (this.ev[i].type === type) return this.ev[i].data; return null; }
}
const run = (m, events) => { m.mem = {}; return events.some(e => { try { return !!m.check(e, m.mem); } catch (err) { return false; } }); };
const fmtPts = list => list.map(p => '(' + p[0] + ', ' + p[1] + ')' + (p[2] > 0 ? '+' : '−')).join(' ');
const trainInfo = s => { const d = s.last('train'); return d ? '：k = ' + d.updates + '、' + d.epochs + ' 輪、上界 ' + (isFinite(d.bound) ? +d.bound.toFixed(3) : '∞') : '：沒有學完'; };

let fail = 0;
function expect(id, sim, want, note) {
  const m = byId(id);
  const ok = run(m, sim.ev);
  const pass = ok === want;
  if (!pass) fail++;
  console.log((pass ? '  ✓ ' : '  ✗ ') + String(id).padEnd(4) + (want ? ' 達成：' : ' 不觸發：') + note);
  return sim;
}

// ---------- 1. 預設狀態不觸發 ----------
console.log('預設狀態（AND、零初始、η = 1、固定順序、有偏差）：頁面不送任何事件；只動不影響學習的控制項也一樣：');
{
  const s = new Sim();
  const hit = missions.filter(m => run(m, s.ev)).map(m => m.id);
  if (hit.length || s.ev.length) { fail++; console.log('  ✗ 預設狀態送出 ' + s.ev.length + ' 個事件、觸發了 ' + hit.join('、')); } else console.log('  ✓ 沒有事件，沒有任何任務被觸發');
  const t = new Sim().preset('and').set('eta', 1).set('seed', 1);
  const hit2 = missions.filter(m => run(m, t.ev)).map(m => m.id);
  if (hit2.length) { fail++; console.log('  ✗ 再按一次「AND」就觸發了 ' + hit2.join('、')); } else console.log('  ✓ 再按一次「AND」、滑桿拉回原值，也沒有觸發任何任務');
}

// ---------- 2. 公開任務 ----------
console.log('\n公開任務：');
expect('1', new Sim().step(), true, '一打開就按「單步」：第一個點 (0,0) 的 z = 0，落在「線上」也算分錯，修正一次');
expect('1', new Sim().learn(), false, '只按「學到收斂」不算（要自己按單步）');
{ const s = new Sim().learn(); expect('2', s, true, '預設的 AND 按「學到收斂」' + trainInfo(s)); }
{ const s = new Sim().preset('or').learn(); expect('3', s, true, '「OR」→「學到收斂」' + trainInfo(s)); }
{ const s = new Sim().preset('nand').learn(); expect('4', s, true, '「NAND」→「學到收斂」' + trainInfo(s)); }
expect('5', new Sim().view3(true, true).step(), true, '切到「3D 加權和」、拖曳轉動，再按「單步」');
expect('5', new Sim().view3(true, false).step(), false, '在 3D 但沒轉動視角就按單步，不算');
const P6 = [[0.8, 0.6, 1], [0.4, 0.9, 1], [0.7, -0.1, 1], [-0.6, -0.4, -1], [-0.2, -0.9, -1], [-0.9, 0.1, -1]];
{ const s = new Sim().clear().pts(P6).learn(); expect('6', s, true, '清空後放 ' + fmtPts(P6) + trainInfo(s)); }
expect('6', new Sim().clear().pts(P6.slice(0, 5)).learn(), false, '−1 類只有 2 個不算');
expect('6', new Sim().preset('sep').learn(), false, '「隨機可分」的點不是自己放的，不算');
{ const s = new Sim().preset('xor').learn(); const d = s.last('train'); expect('7', s, true, '「XOR」→「學到收斂」：學滿 ' + d.epochs + ' 輪還是沒收斂（最後一輪錯 ' + d.maxErr + ' 個；權重每 ' + (d.cycle ? d.cycle.period : '?') + ' 輪回到原值）'); }
expect('7', new Sim().preset('xor').epoch(50), false, 'XOR 只學 50 輪不算');
{
  let seed = 1, s;
  for (; seed < 50; seed++) {
    s = new Sim().preset('sep').learn();
    const a = s.last('train').updates;
    s.set('order', 'shuffle').set('seed', seed).learn();
    if (s.last('train').updates !== a) break;
  }
  const tr = s.ev.filter(e => e.type === 'train').map(e => e.data.updates);
  expect('8', s, true, '「隨機可分」學到收斂（固定順序 k = ' + tr[0] + '），再選「每輪打亂」、種子 ' + seed + ' 學到收斂（k = ' + tr[1] + '）');
  expect('8', new Sim().preset('sep').learn().preset('sep').set('order', 'shuffle').learn(), false, '固定順序學完，換一份「隨機可分」再用打亂的順序學，不算（要同一份資料）');
}
const P9 = [[1, 1, 1], [0.5, 0.5, 1], [0, 1, 1], [1, 0, 1], [0.2, 0.2, 1], [-1, -1, -1], [-0.9, -1, -1], [-1, -0.9, -1]];
{ const s = new Sim().clear().pts(P9).learn(); expect('9', s, true, '第一個點放 (1, 1)+：' + fmtPts(P9) + trainInfo(s) + '（第一次修正後 w ∝ (1, 1, 1)，其他點都分對了）'); }
expect('9', new Sim().clear().pts(P9).set('init', 'random').learn(), false, '同樣的資料用「隨機」初始權重不算');
const P10 = [[1, -1, 1], [1, 0, 1], [1, 1, 1], [1, 0.5, 1], [-1, -1, -1], [-1, 0, -1], [-1, 1, -1], [-1, 0.5, -1]];
{ const s = new Sim().clear().pts(P10).learn(); expect('10', s, true, '左右兩排 ' + fmtPts(P10) + '：γ = ' + s.last('train').gamma.toFixed(3)); }
{ const s = new Sim().clear().pts(P9).learn(); expect('10', s, false, '任務 9 的資料 γ = ' + s.last('train').gamma.toFixed(3) + '，不夠寬'); }
const P11 = [[0.1, -1, 1], [0.1, 1, 1], [0.1, 0, 1], [0, -1, -1], [0, 1, -1], [0, 0, -1]];
{ const s = new Sim().clear().pts(P11).learn(); expect('11', s, true, '兩排只差 0.1：' + fmtPts(P11) + trainInfo(s)); expect('12', s, true, '同一份資料（零初始）' + trainInfo(s)); }
{ const s = new Sim().preset('sep').learn(); expect('11', s, false, '「隨機可分」的上界只有 ' + s.last('train').bound.toFixed(1) + '（300 份裡最大也不到 500）'); expect('12', s, false, '「隨機可分」只修正 ' + s.last('train').updates + ' 次（300 份裡最多 25 次）'); }
expect('12', new Sim().clear().pts(P11).set('init', 'random').learn(), false, '隨機初始權重不算');

// ---------- 3. 隱藏任務 ----------
console.log('\n隱藏任務（解法、反例與交叉檢查）：');
const noisy1 = C.genNoisy(1).filter(p => p.noise).map(p => [p.x, p.y, p.c]);
const H3 = [[1, 1, 1], [0.5, 0.5, 1], [0, 1, 1], [-1, -1, -1], [-0.9, -1, -1], [-1, -0.9, -1]];
const H6 = [[1, 1, 1], [-0.45, -0.5, 1], [-0.5, -0.55, -1], [-1, -1, -1]];
const H7 = [[-0.5, 0.5, 1], [0, 0, -1], [1, 1, -1], [-0.5, -0.5, -1], [-0.5, 1, 1], [-1, -1, 1]];
const H8 = [[1, 1, 1], [0.95, 1, 1], [1, 0.95, 1], [-1, -1, -1], [-0.95, -1, -1], [-1, -0.95, -1]];
const H10 = [[0, -1, 1], [0, 0.5, -1], [1, 1, -1], [-1, -1, 1], [-0.5, 0, 1], [1, 0, -1]];
const sol = {
  h1: ['清空，第一個點放在原點 (0, 0)+，再放 (0.5, 0.5)+、(−0.6, 0.3)+：唯一一次修正只改到 b，w = (0, 0, b)，斜面變成水平、永遠在地面上方',
    () => new Sim().clear().pts([[0, 0, 1], [0.5, 0.5, 1], [-0.6, 0.3, 1]]).learn()],
  h2: ['「XOR」→ 把 (1,1) 那個 −1 點從 (0.6, 0.6) 拖到 (−1, −1) → 變成可分 → 學到收斂',
    () => new Sim().preset('xor').move(0.6, 0.6, -1, -1).learn()],
  h3: ['清空，放 ' + fmtPts(H3) + '；學習率 0.01、1、10 各學到收斂一次：修正次數完全相同（零初始時 η 只縮放權重）',
    () => new Sim().clear().pts(H3).set('eta', 0.01).learn().set('eta', 1).learn().set('eta', 10).learn()],
  h4: ['取消「使用偏差 b」，「AND」「OR」「NAND」各學一次：都學滿 1000 輪不收斂（線必須通過原點）',
    () => new Sim().set('bias', false).learn().preset('or').learn().preset('nand').learn()],
  h5: ['「有雜訊」（第 1 份）→ 把 3 個說反話的點 ' + fmtPts(noisy1) + ' 點掉 → 學到收斂',
    () => { const s = new Sim().preset('noisy'); noisy1.forEach(p => s.remove(p[0], p[1])); return s.learn(); }],
  h6: ['清空，放 ' + fmtPts(H6) + '：上界約 3599，卻只修正 1 次',
    () => new Sim().clear().pts(H6).learn()],
  h7: ['清空，依序放 ' + fmtPts(H7) + '：第一輪 6 個點全錯、全部修正，最後仍收斂',
    () => new Sim().clear().pts(H7).learn()],
  h8: ['清空，右上角 3 個 +1、左下角 3 個 −1 擠在一起：' + fmtPts(H8) + '，上界 (R/γ)² < 2，所以最多修正 1 次',
    () => new Sim().clear().pts(H8).learn()],
  h9: ['清空，放 (1, 0)+、(−1, 0)−：上界剛好 2，也剛好修正 2 次（第二個點的 z 剛好 = 0）',
    () => new Sim().clear().pts([[1, 0, 1], [-1, 0, -1]]).learn()],
  h10: ['清空，依序放 ' + fmtPts(H10) + '：修正 4 次，學到的線就是最大間隔的線（間隔比 1.000）',
    () => new Sim().clear().pts(H10).learn()]
};
const table = [];
Object.keys(sol).forEach(k => {
  const s = sol[k][1]();
  expect(k, s, true, sol[k][0] + trainInfo(s));
  const others = hidden.filter(m => m.id !== 'perceptron-' + k && run(m, s.ev)).map(m => m.id.replace('perceptron-', ''));
  table.push(k.padEnd(4) + '→ ' + (others.length ? '✗ 也完成了 ' + others.join('、') : '沒有連帶完成其他隱藏任務'));
  if (others.length) fail++;
});
// 「差一點」的反例
expect('h1', new Sim().clear().pts([[0.5, 0, 1], [0, 0, 1], [-0.5, 0, 1]]).learn(), false, '第一個點不在原點（w 留下 x 方向的分量）');
expect('h1', new Sim().clear().pts([[0, 0, 1], [0.5, 0.5, 1]]).set('init', 'random').learn(), false, '隨機初始權重不算');
expect('h2', new Sim().preset('xor').move(0.6, 0.6, -1, -1).move(-0.6, 0.6, -1, 1).learn(), false, '動了兩個點不算');
expect('h2', new Sim().preset('xor').remove(0.6, 0.6).learn(), false, '拿掉一個點不算（要挪一步）');
expect('h3', new Sim().clear().pts(H3).set('eta', 0.1).learn().set('eta', 1).learn().set('eta', 5).learn(), false, '學習率 0.1、1、5（最大只是最小的 50 倍）不算');
expect('h3', new Sim().clear().pts(H3).set('init', 'random').set('eta', 0.01).learn().set('eta', 1).learn().set('eta', 10).learn(), false, '隨機初始權重時，修正次數會隨學習率改變，不算');
expect('h3', new Sim().preset('sep').set('eta', 0.01).learn().set('eta', 1).learn().set('eta', 10).learn(), false, '「隨機可分」的點不是自己放的，不算');
expect('h4', new Sim().set('bias', false).learn().preset('or').learn(), false, '只試 AND、OR 不算');
expect('h4', new Sim().learn().preset('or').learn().preset('nand').learn(), false, '有偏差時三個都學得會，不算');
expect('h4', new Sim().set('bias', false).learn().set('bias', true).learn().set('bias', false).preset('or').learn().preset('nand').learn(), false, '中途放回偏差又學了一次，要重新收集三個');
{ const s = new Sim().preset('noisy'); s.remove(noisy1[0][0], noisy1[0][1]); const clean = s.S.points.find(p => !p.noise); s.remove(clean.x, clean.y); s.learn(); expect('h5', s, false, '連一個誠實的點也拿掉，不算'); }
expect('h6', new Sim().clear().pts(P9).learn(), false, '任務 9 的資料也只修正 1 次，但上界只有 5.8');
expect('h7', new Sim().clear().pts([[1, 0, 1], [-1, 0, -1]]).learn(), false, '兩個點一輪全錯，點太少不算');
expect('h7', new Sim().preset('xor').learn(), false, 'XOR 每輪全錯，但沒有收斂');
expect('h8', new Sim().clear().pts([[1, 0, 1], [1, 0.05, 1], [1, -0.05, 1], [-1, 0, -1], [-1, 0.05, -1], [-1, -0.05, -1]]).learn(), false, '左右兩群：上界剛好比 2 大一點');
expect('h9', new Sim().clear().pts([[0.5, 0, 1], [-0.5, 0, -1]]).learn(), false, '(0.5, 0)+、(−0.5, 0)−：修正 2 次，但上界是 5');
expect('h10', new Sim().clear().pts(P10).learn(), false, '任務 10 的左右兩排間隔比也是 1，但只修正 2 次');
console.log('\n十個隱藏任務的交叉檢查：');
table.forEach(l => console.log('  ' + l));

// ---------- 4. 亂按（像試玩工具）的誤觸率 ----------
const R = +(process.env.PC_ROUNDS || 400), STEPS = 300;
console.log('\n亂按模擬（固定種子）：' + R + ' 人 × 每人 ' + STEPS + ' 個隨機操作（權重與試玩工具相同：按鈕 30、滑桿／數字 35、勾選 8、畫布 15、等待 4；' +
  '畫布 30% 點一下（點到點就移除、點到空白就放點）、70% 拖曳（從點上開始才會移動點）；「連續學習」開著時每個操作之間走 速度 × 0.35 步）：');
{
  const rand = C.rng(20261112);
  const pick = (lo, hi) => { const w = rand(); return w < 0.2 ? lo : w < 0.4 ? hi : lo + Math.floor(rand() * (hi - lo + 1)); };
  const BTN = ['step', 'epoch', 'play', 'learn', 'restart', 'wipe', 'sound', 'and', 'or', 'nand', 'xor', 'sep', 'noisy', 'pos', 'neg', 'clearPts', 'zero', 'random', 'fixed', 'shuffle'];
  const hits = {}, pub = {};
  missions.forEach(m => { hits[m.id] = 0; });
  const HIT = 0.06;   // 點的觸控半徑（座標單位）：畫布約 480 px 對應 2.2 個單位，半徑約 13 px
  const t0 = Date.now();
  for (let r = 0; r < R; r++) {
    const s = new Sim();
    let cls = 1, playing = false, rate = 6;
    const mem = {}, done = {};
    missions.forEach(m => { mem[m.id] = {}; });
    let seen = 0;
    const flush = () => {
      for (; seen < s.ev.length; seen++) {
        const e = s.ev[seen];
        missions.forEach(m => { if (!done[m.id]) { try { if (m.check(e, mem[m.id])) done[m.id] = true; } catch (err) { /* 忽略 */ } } });
      }
    };
    const hitAt = (x, y) => { let best = -1, bd = HIT; s.S.points.forEach((p, i) => { const d = Math.hypot(p.x - x, p.y - y); if (d <= bd) { bd = d; best = i; } }); return best; };
    for (let k = 0; k < STEPS; k++) {
      const u = rand() * 92;
      if (u < 30) {
        const b = BTN[Math.floor(rand() * BTN.length)];
        if (b === 'step') s.step(); else if (b === 'epoch') s.epoch(); else if (b === 'play') playing = !playing; else if (b === 'learn') s.learn();
        else if (b === 'restart' || b === 'wipe') s.restart(); else if (b === 'sound') { /* 不影響 */ }
        else if (C.PRESETS.indexOf(b) >= 0) s.preset(b); else if (b === 'pos') cls = 1; else if (b === 'neg') cls = -1; else if (b === 'clearPts') s.clear();
        else if (b === 'zero' || b === 'random') s.set('init', b); else s.set('order', b);
      } else if (u < 65) {
        const which = Math.floor(rand() * 3);
        if (which === 0) { const pos = pick(0, 300); s.set('eta', +Math.pow(10, -2 + pos / 100).toPrecision(3)); }
        else if (which === 1) s.set('seed', pick(1, 999)); else rate = pick(1, 60);
      } else if (u < 73) {
        if (rand() < 0.5) s.set('bias', !s.S.cfg.bias);    // 另一個勾選是「最寬的走廊」，只影響畫面
      } else if (u < 88) {
        const x = rand() * 2.2 - 1.1, y = rand() * 2.2 - 1.1;
        const i = hitAt(x, y);
        if (rand() < 0.3) { if (i >= 0) s.S.removeAt(i); else if (Math.abs(x) <= 1 && Math.abs(y) <= 1) s.S.addPoint(Math.round(x * G), Math.round(y * G), cls); }
        else if (i >= 0) s.S.movePoint(i, Math.round((rand() * 2 - 1) * G), Math.round((rand() * 2 - 1) * G));
      }
      if (playing) {
        const n = Math.max(1, Math.round(rate * 0.35));
        for (let j = 0; j < n; j++) if (!s.S.step(false)) { playing = false; break; }
      }
      flush();
    }
    missions.forEach(m => { if (done[m.id]) hits[m.id]++; });
  }
  let worst = 0;
  missions.forEach(m => {
    const p = hits[m.id] / R;
    if (m.hidden) worst = Math.max(worst, p);
    console.log('  ' + (m.hidden ? '隱藏 ' : '公開 ') + m.id.padEnd(16) + ('L' + m.level).padEnd(4) + (p * 100).toFixed(2).padStart(6) + '%' + (m.hidden && p > 0.01 ? '（超過 1%）' : ''));
  });
  console.log('  （耗時 ' + ((Date.now() - t0) / 1000).toFixed(0) + ' 秒）');
  if (worst > 0.02) { fail++; console.log('  ✗ 有隱藏任務被亂按觸發的機率超過 2%'); } else console.log('  ✓ 每個隱藏任務被亂按觸發的機率都在 2% 以下');
}

// ---------- 5. 要靠運氣的任務：平均要試幾次 ----------
console.log('\n要靠運氣的任務：');
{
  // 任務 8：同一份「隨機可分」資料，固定順序與「每輪打亂」（某個種子）的修正次數不同
  let diff = 0, tot = 0;
  for (let serial = 1; serial <= 100; serial++) {
    const pts = C.genSeparable(serial);
    const a = C.train(pts, {}).updates;
    for (let seed = 1; seed <= 10; seed++) { tot++; if (C.train(pts, { order: 'shuffle', seed: seed }).updates !== a) diff++; }
  }
  console.log('  任務 8：「隨機可分」100 份 × 種子 1–10，修正次數和固定順序不同的比例 ' + (diff / tot * 100).toFixed(1) + '%，平均試 ' + (tot / diff).toFixed(2) + ' 個種子');
  // 隱藏 h10：隨手放 6–10 個點（兩類各至少 3 個、可分），學到的線剛好是最大間隔的線
  const rand = C.rng(4242);
  let ok = 0, n10 = 0;
  for (let t = 0; t < 20000; t++) {
    const n = 6 + Math.floor(rand() * 5), pts = [], used = {};
    while (pts.length < n) {
      const gx = Math.round((rand() * 2 - 1) * G), gy = Math.round((rand() * 2 - 1) * G);
      if (used[gx + ',' + gy]) continue; used[gx + ',' + gy] = 1;
      pts.push(C.pt(gx, gy, pts.length % 2 ? 1 : -1));
    }
    const mm = C.maxMargin(pts, true);
    if (!mm.separable) continue;
    n10++;
    const res = C.train(pts, {});
    if (res.converged && res.updates >= 3 && C.marginOf(res.w, pts, true) / mm.gamma >= 0.99) ok++;
  }
  console.log('  隱藏 h10：隨手放 6–10 個點（可分的 ' + n10 + ' 份），學到最大間隔線的比例 ' + (ok / n10 * 100).toFixed(2) + '%（隨手放平均要試 ' + (ok ? (n10 / ok).toFixed(0) : '∞') + ' 次；照著「最寬的走廊」對稱擺放就容易得多）');
}

console.log(fail ? `\n✗ ${fail} 項不符合` : '\n全部任務都證明做得到，預設狀態不會觸發，隱藏任務互不連帶、亂按也不容易誤觸。');
process.exitCode = fail ? 1 : 0;
