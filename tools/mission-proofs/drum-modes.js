/* 任務可達成的證明腳本。用法：node tools/mission-proofs/drum-modes.js
 * 用核心 js/drum-modes-core.js 證明每個任務在介面的範圍內（滑桿的間隔）做得到，事件資料和 js/drum-modes.js 送出的一樣；
 * 預設狀態只會完成「敲一下」；每個隱藏任務的解不會順便完成另一個隱藏任務；附反例確認條件不是太寬。
 * 介面：鼓 3 種；半徑 a 10–40 cm（0.1）、張力 800–10000 N/m（10）、邊長 L 15–40 cm（0.1）、厚度 1.5–5 mm（0.01）、
 *       敲擊點 r/a 0–0.98（0.001）、方位角 0–359°（1）、x/L、y/L 0.02–0.98（0.001）、阻尼 0.3–8。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
global.window = {};
const C = require(ROOT + 'js/drum-modes-core.js');
const missions = [];
global.window = { LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/drum-modes.js');
const byId = id => missions.find(m => m.id === 'drum-modes-' + id);
const cents = r => 1200 * Math.log2(r);
const rnd = (v, s) => Math.round(v / s) * s;

// ---------- 與 js/drum-modes.js 相同的事件資料 ----------
const st = o => Object.assign({}, C.DEFAULTS, o);
const info = o => C.analyze(st(o));
const strike = o => ({ type: 'strike', data: C.payload(info(o), { via: 'button', sel: 'all' }) });
const pick = (drum, key) => { const i = info({ drum: drum }), md = C.mode(i, key); return { type: 'mode', data: { drum: drum, key: key, m: md.m, n: md.n, ratio: md.ratio, f: md.f, via: 'select' } }; };

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
/** 在滑桿格點上掃一個參數，傳回符合的值與區間寬 */
function scan(lo, hi, step, ok) {
  const hits = [];
  for (let v = lo; v <= hi + 1e-9; v += step) { const x = rnd(v, step); if (ok(x)) hits.push(x); }
  return hits;
}
const span = h => h.length ? h[0] + ' – ' + h[h.length - 1] + '（' + h.length + ' 格）' : '無';
function need(id, hits, what) { if (!hits.length) { fail++; console.log('  ✗ ' + id + ' 在滑桿格點上找不到：' + what); } return hits; }
const one = (id, o) => byId(id).check(strike(o), {});

// ---------- 預設狀態 ----------
console.log('預設狀態（理想膜、a 30 cm、T 3000 N/m、r/a 0.55、θ 30°）');
{
  const evs = [strike({}), pick('membrane', '0-1'), pick('membrane', '0-2'), pick('timpani', '1-1'), pick('plate', '1-1')];
  const hit = missions.filter(m => { m.mem = {}; return evs.some(e => m.check(e, m.mem)); }).map(m => m.id);
  if (hit.join() !== 'drum-modes-1') { fail++; console.log('  ✗ 預設完成了：' + hit.join('、')); }
  else console.log('  ✓ 只有「敲一下」完成；選其他單一模態不會完成任何任務');
  const evs2 = [strike({ drum: 'timpani' }), strike({ drum: 'plate' })];
  const hit2 = missions.filter(m => m.hidden || m.level >= 3).filter(m => { m.mem = {}; return evs2.some(e => m.check(e, m.mem)); }).map(m => m.id);
  if (hit2.length) { fail++; console.log('  ✗ 只切換鼓就完成：' + hit2.join('、')); }
  else console.log('  ✓ 只切換到定音鼓、方板敲一下，不會完成 3 級以上或隱藏任務');
}

// ---------- 公開任務 ----------
console.log('\n公開任務');
expect('1', [strike({})], true, '預設敲一下');
expect('1', [strike({ drum: 'timpani', r: 0 })], false, '定音鼓正中央：幾乎無聲');
expect('2', [pick('membrane', '1-1')], true, '理想膜選 (1, 1)');
expect('2', [pick('timpani', '1-1')], false, '定音鼓的 (1, 1) 不算');
{
  const h = need('3', scan(0, 0.98, 0.001, r => one('3', { r: r })), '中央');
  console.log('     任務 3 的敲擊點 r/a：' + span(h));
  expect('3', [strike({ r: 0 })], true, 'r/a = 0：' + info({ r: 0 }).excited + ' 個模態，都是 m = 0');
  expect('3', [strike({ r: 0.05 })], false, 'r/a = 0.05：(1, 1) 已有 ' + (C.mode(info({ r: 0.05 }), '1-1').rel * 100).toFixed(1) + '%');
}
{
  const c0 = info({ r: 0 }).centroid, c1 = info({ r: 0.9 }).centroid;
  expect('4', [strike({ r: 0 }), strike({ r: 0.9 })], true, '中央重心 ' + c0.toFixed(2) + ' → r/a 0.9 重心 ' + c1.toFixed(2));
  expect('4', [strike({ r: 0.9 }), strike({ r: 0 })], false, '順序反了');
  expect('4', [strike({ r: 0 }), strike({ r: 0.9, T: 4000 })], false, '張力也改了');
}
{
  const h = need('5', scan(0, 0.98, 0.001, r => one('5', { r: r })), '(0, 2) 節圓');
  console.log('     任務 5 的 r/a：' + span(h) + '；(0, 2) 節圓理論值 ' + C.nodalCircles(C.byKey['0-2'])[0].toFixed(5));
  expect('5', [strike({ r: h[Math.floor(h.length / 2)] })], true, 'r/a = ' + h[Math.floor(h.length / 2)]);
  expect('5', [strike({ r: 0.5 })], false, 'r/a = 0.5');
}
{
  const h = need('6', scan(0, 0.98, 0.001, r => one('6', { drum: 'timpani', r: r })), '定音鼓兩模態');
  console.log('     任務 6 的 r/a：' + span(h));
  const r6 = h[0];
  expect('6', [strike({ drum: 'timpani', r: r6 })], true, '定音鼓 r/a ' + r6 + '：(2, 1) ' + (C.mode(info({ drum: 'timpani', r: r6 }), '2-1').rel * 100).toFixed(0) + '%、(3, 1) ' + (C.mode(info({ drum: 'timpani', r: r6 }), '3-1').rel * 100).toFixed(0) + '%');
  expect('6', [strike({ drum: 'timpani', r: 0.55 })], false, '預設 r/a 0.55：(3, 1) 太強');
  expect('6', [strike({ drum: 'membrane', r: r6 })], false, '理想膜不算');
}
{
  const h = need('7', scan(800, 10000, 10, T => one('7', { drum: 'timpani', a: 0.35, T: T })), '110 Hz（a 35 cm）');
  console.log('     任務 7（a 35 cm）的張力：' + span(h));
  const T7 = h[0];
  expect('7', [strike({ drum: 'timpani', a: 0.35, T: T7 })], true, 'a 35 cm、T = ' + T7 + '：' + info({ drum: 'timpani', a: 0.35, T: T7 }).fBase.toFixed(2) + ' Hz');
  expect('7', [strike({ drum: 'membrane', a: 0.35, T: T7 })], false, '理想膜不算');
  const any = [];
  for (let a = 0.1; a <= 0.4001; a += 0.01) { const hh = scan(800, 10000, 10, T => one('7', { drum: 'timpani', a: rnd(a, 0.001), T: T })); if (hh.length) any.push(rnd(a, 0.001)); }
  console.log('     能調到 A2 的半徑（cm）：' + any.map(a => Math.round(a * 100)).join('、'));
}
{
  let sol = null;
  for (let T = 800; T <= 10000 && !sol; T += 10) {
    const f1 = info({ drum: 'timpani', T: T }).fBase;
    for (let T2 = T; T2 <= 10000; T2 += 10) { const c = cents(info({ drum: 'timpani', T: T2 }).fBase / f1); if (Math.abs(c - 700) <= 8) { sol = [T, T2, c]; break; } if (c > 710) break; }
  }
  if (!sol) { fail++; console.log('  ✗ 8 找不到五度'); }
  else {
    expect('8', [strike({ drum: 'timpani', T: sol[0] }), strike({ drum: 'timpani', T: sol[1] })], true, 'T ' + sol[0] + ' → ' + sol[1] + '：' + sol[2].toFixed(1) + ' 音分');
    expect('8', [strike({ drum: 'timpani', T: sol[1] }), strike({ drum: 'timpani', T: sol[0] })], true, '反過來（往下五度）也算');
    expect('8', [strike({ drum: 'timpani', T: 3000 }), strike({ drum: 'timpani', T: 3000 * 2.25, a: 0.3 * 1.5 > 0.4 ? 0.2 : 0.2 })], false, '大小也改了');
  }
}
{
  const ok9 = r => { const m = byId('9'); m.mem = {}; m.check(strike({ r: r }), m.mem); return m.check(strike({ drum: 'timpani', r: r }), m.mem); };
  const h = need('9', scan(0, 0.98, 0.001, ok9), '膜與定音鼓');
  console.log('     任務 9 的共同敲擊點 r/a：' + span(h));
  const r9 = h[Math.floor(h.length / 2)];
  expect('9', [strike({ r: r9 }), strike({ drum: 'timpani', r: r9 })], true, 'r/a ' + r9 + '：理想膜 ' + info({ r: r9 }).inharm.toFixed(0) + ' 音分、定音鼓 ' + info({ drum: 'timpani', r: r9 }).inharm.toFixed(0) + ' 音分');
  expect('9', [strike({ drum: 'timpani', r: r9 }), strike({ r: r9 })], true, '順序反過來');
  expect('9', [strike({ r: r9 }), strike({ drum: 'timpani', r: r9, th: 90 })], false, '敲擊點不同');
}
{
  const h = need('10', scan(0.02, 0.98, 0.001, x => one('10', { drum: 'plate', x: x, y: x })), '對角線');
  console.log('     任務 10 在對角線上的 x = y：' + span(h));
  expect('10', [strike({ drum: 'plate', x: 0.25, y: 0.25 })], true, 'x = y = 0.25');
  expect('10', [strike({ drum: 'plate', x: 0.25, y: 0.3 })], false, 'x = 0.25、y = 0.3');
  expect('10', [strike({ drum: 'plate', x: 0.5, y: 0.5 })], false, '正中央：兩者都是節點');
}
{
  const h = need('11', scan(0.02, 0.98, 0.001, x => one('11', { drum: 'plate', x: x })), '中線');
  console.log('     任務 11 的 x/L：' + span(h));
  expect('11', [strike({ drum: 'plate', x: 0.5 })], true, 'x/L = 0.5、y/L 0.37');
  expect('11', [strike({ drum: 'plate', x: 0.51 })], false, 'x/L = 0.51');
}
{
  const h = need('12', scan(0, 0.98, 0.001, r => one('12', { r: r })), '兩主角');
  console.log('     任務 12 的 r/a：' + span(h));
  const r12 = h[0];
  const i12 = info({ r: r12 });
  expect('12', [strike({ r: r12 })], true, 'r/a ' + r12 + '：(0, 1) ' + (C.mode(i12, '0-1').rel * 100).toFixed(1) + '%、(1, 1) ' + (C.mode(i12, '1-1').rel * 100).toFixed(1) + '%');
  expect('12', [strike({ r: 0.55 })], false, '預設 r/a 0.55');
}

// ---------- 隱藏任務 ----------
console.log('\n隱藏任務');
{
  const h = need('h1', scan(0, 0.98, 0.001, r => one('h1', { drum: 'timpani', r: r })), '定音鼓無聲');
  console.log('     h1 的 r/a：' + span(h));
  expect('h1', [strike({ drum: 'timpani', r: 0 })], true, '定音鼓正中央');
  expect('h1', [strike({ r: 0 })], false, '理想膜正中央有聲音');
}
{
  const h = need('h2', scan(0, 0.98, 0.001, r => one('h2', { r: r })), '(1, 2) 節圓');
  console.log('     h2 的 r/a：' + span(h) + '；(1, 2) 節圓理論值 ' + C.nodalCircles(C.byKey['1-2'])[0].toFixed(5));
  expect('h2', [strike({ r: h[Math.floor(h.length / 2)] })], true, 'r/a ' + h[Math.floor(h.length / 2)]);
}
{
  expect('h3', [strike({ T: 2000 }), strike({ T: 4000 })], true, '理想膜 T 2000 → 4000：' + cents(info({ T: 4000 }).fBase / info({ T: 2000 }).fBase).toFixed(1) + ' 音分');
  expect('h3', [strike({ drum: 'timpani', T: 2000 }), strike({ drum: 'timpani', T: 4000 })], true, '定音鼓也可以');
  expect('h3', [strike({ T: 2000 }), strike({ T: 4500 })], false, 'T 變 2.25 倍＝五度');
}
{
  expect('h4', [strike({ drum: 'plate', L: 0.2 }), strike({ drum: 'plate', L: 0.4 })], true, '方板 L 20 → 40 cm：' + cents(info({ drum: 'plate', L: 0.4 }).fBase / info({ drum: 'plate', L: 0.2 }).fBase).toFixed(1) + ' 音分');
  expect('h4', [strike({ drum: 'plate', L: 0.2 }), strike({ drum: 'plate', L: 0.4, h: 4 })], false, '厚度也改了');
}
{
  const T1 = 3000, want = T1 * Math.pow(C.byKey['0-1'].j / C.byKey['1-1'].j, 2);
  const h = need('h5', scan(800, 10000, 10, T => { const m = byId('h5'); m.mem = {}; m.check(strike({ T: T1 }), m.mem); return m.check(strike({ T: T }), m.mem); }), '張力');
  console.log('     h5（先 T 3000）第二次的張力：' + span(h) + '；理論值 ' + want.toFixed(1));
  expect('h5', [strike({ T: T1 }), strike({ T: h[0] })], true, 'T 3000 → ' + h[0]);
  expect('h5', [strike({ T: T1 }), strike({ T: h[0], r: 0 })], false, '第二次敲中央：(1, 1) 不響');
}
{
  const h = need('h6', scan(0, 0.98, 0.001, r => one('h6', { r: r })), '雙胞胎');
  console.log('     h6 的 r/a：' + span(h) + '；(4, 2) j = ' + C.byKey['4-2'].j.toFixed(3) + '、(7, 1) j = ' + C.byKey['7-1'].j.toFixed(3) + '（差 ' + cents(C.byKey['7-1'].j / C.byKey['4-2'].j).toFixed(1) + ' 音分）');
  expect('h6', [strike({ r: h[0] })], true, 'r/a ' + h[0]);
}
{
  const h = need('h7', scan(800, 10000, 10, T => one('h7', { drum: 'timpani', T: T, r: 0.8 })), '440 Hz');
  console.log('     h7（a 30 cm、r/a 0.8）的張力：' + span(h));
  expect('h7', [strike({ drum: 'timpani', T: h[0], r: 0.8 })], true, 'T ' + h[0] + '：(3, 1) = ' + (info({ drum: 'timpani', T: h[0] }).fBase * C.mode(info({ drum: 'timpani', T: h[0] }), '3-1').ratio).toFixed(2) + ' Hz');
}
{
  const h = need('h8', scan(0.02, 0.98, 0.001, x => one('h8', { drum: 'plate', x: x, y: rnd(1 - x, 0.001) })), '反對角線');
  console.log('     h8 在反對角線 y = 1 − x 上的 x：' + span(h));
  expect('h8', [strike({ drum: 'plate', x: 0.25, y: 0.75 })], true, 'x 0.25、y 0.75');
  expect('h8', [strike({ drum: 'plate', x: 0.25, y: 0.25 })], false, '主對角線');
}
{
  const h = need('h9', scan(0, 0.98, 0.001, r => one('h9', { r: r })), '三人並肩');
  console.log('     h9 的 r/a：' + span(h));
  expect('h9', [strike({ r: h[Math.floor(h.length / 2)] })], true, 'r/a ' + h[Math.floor(h.length / 2)]);
}
{
  // 方板 L 23 cm、厚 1.5 mm 的最低音；找理想膜（a 30 cm）的張力讓最低音相同
  const P = { drum: 'plate', L: 0.23, h: 1.5 }, fp = info(P).fLow;
  const h = need('h10', scan(800, 10000, 10, T => Math.abs(cents(info({ T: T }).fLow / fp)) <= 5), '理想膜張力');
  console.log('     h10（方板 ' + fp.toFixed(2) + ' Hz）理想膜的張力：' + span(h));
  if (h.length) {
    expect('h10', [strike(P), strike({ T: h[0] })], true, '方板 → 理想膜 T ' + h[0]);
    expect('h10', [strike({ T: h[0] }), strike(P)], true, '順序反過來');
    expect('h10', [strike({}), strike({})], false, '兩次都是理想膜');
  }
}

// ---------- 隱藏任務互不順帶完成 ----------
console.log('\n隱藏任務的解不會順便完成另一個隱藏任務');
{
  const hid = missions.filter(m => m.hidden);
  let bad = 0;
  hid.forEach(m => {
    const evs = found[m.id.replace('drum-modes-', '')];
    if (!evs) return;
    hid.forEach(o => {
      if (o === m) return;
      o.mem = {};
      if (evs.some(e => o.check(e, o.mem))) { bad++; console.log('  ✗ ' + m.id + ' 的解也完成了 ' + o.id); }
    });
  });
  if (bad) fail += bad; else console.log('  ✓ 10 個隱藏任務的示範解都只完成自己');
}

// ---------- 亂敲：隱藏任務很少誤觸 ----------
console.log('\n亂敲 20000 次（隨機鼓、隨機設定）');
{
  let seed = 7;
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const pickR = (lo, hi, s) => rnd(lo + rand() * (hi - lo), s);
  const hits = {};
  missions.forEach(m => { m.mem = {}; });
  for (let i = 0; i < 20000; i++) {
    const o = { drum: C.DRUMS[Math.floor(rand() * 3)], a: pickR(0.1, 0.4, 0.001), T: pickR(800, 10000, 10), L: pickR(0.15, 0.4, 0.001), h: pickR(1.5, 5, 0.01),
      r: pickR(0, 0.98, 0.001), th: Math.floor(rand() * 360), x: pickR(0.02, 0.98, 0.001), y: pickR(0.02, 0.98, 0.001) };
    const ev = strike(o);
    missions.forEach(m => { if (m.check(ev, m.mem)) hits[m.id] = (hits[m.id] || 0) + 1; });
  }
  missions.forEach(m => console.log('  ' + m.id.padEnd(15) + String(hits[m.id] || 0).padStart(6) + ' 次'));
}

console.log(fail ? '\n✗ 有 ' + fail + ' 項不通過' : '\n✓ 全部通過');
process.exit(fail ? 1 : 0);
