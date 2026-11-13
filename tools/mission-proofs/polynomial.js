/* 任務可達成的證明腳本。用法：node tools/mission-proofs/polynomial.js
 * 用數學核心證明每個任務在滑桿範圍與打字精度內做得到（事件格式與 js/polynomial.js 的 emitRoots／emitIvt／bisect／emitTrans 相同），並確認預設狀態不會觸發任務。
 * 滑桿：根 −5 到 5（小數第 2 位）、重數 1–3、次數最多 6、a −3 到 3（不為 0）、p −5 到 5、q 0.1 到 3；
 * 勘根區間的兩端 −3 到 3（小數第 2 位）；平移伸縮 a、b −3 到 3（不為 0）、h、k −5 到 5。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const M = require(ROOT + 'js/polynomial-core.js');
const missions = [];
global.window = { LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/polynomial.js');
const byId = id => missions.find(m => m.id === 'polynomial-' + id);
const starsOf = m => (m.hidden ? 2 : 1) * m.level;
const dec = (v, d) => Math.abs(v * Math.pow(10, d) - Math.round(v * Math.pow(10, d))) < 1e-6;
const r1 = v => Math.round(v * 1e6) / 1e6;

function rootsEv(a, roots, quad, op) {
  if (!(Math.abs(a) >= 0.1 && Math.abs(a) <= 3 && dec(a, 2))) throw new Error('a 超出範圍：' + a);
  roots.forEach(r => { if (!(r.x >= -5 && r.x <= 5 && dec(r.x, 2) && r.m >= 1 && r.m <= 3)) throw new Error('根超出範圍：' + JSON.stringify(r)); });
  if (quad && !(quad.p >= -5 && quad.p <= 5 && quad.q >= 0.1 && quad.q <= 3)) throw new Error('二次因式超出範圍');
  const n = M.degreeOf(roots, quad);
  if (n > 6) throw new Error('次數超過 6：' + n);
  const mg = M.merge(roots);
  return { type: 'roots', data: { deg: n, a: a, roots: mg.map(r => ({ x: r1(r.x), m: r.m })), nReal: mg.length, quad: !!quad, op: op || '>', sol: M.solKey(M.solve(op || '>', a, mg)), maxMul: mg.reduce((s, r) => Math.max(s, r.m), 0), chal: false } };
}
function ivtEv(fn, l, r) {
  if (!(l >= -3 && l <= 3 && r >= -3 && r <= 3 && dec(l, 2) && dec(r, 2))) throw new Error('區間超出範圍');
  const c = M.PRESETS[fn].c;
  return { type: 'ivt', data: { fn: fn, l: l, r: r, fl: M.evalP(c, l), fr: M.evalP(c, r), inside: M.realRoots(c, l, r, 3000).filter(x => x > l + 1e-12 && x < r - 1e-12).length } };
}
/** 從 [l, r] 開始連按 k 次「二分一次」，回傳每一次的事件 */
function bisectEvs(fn, l, r, k) {
  const c = M.PRESETS[fn].c, evs = [];
  if (!(M.evalP(c, l) * M.evalP(c, r) < 0)) throw new Error('區間兩端沒有異號');
  for (let i = 0; i < k; i++) {
    const s = M.bisect(c, l, r);
    l = s.l; r = s.r;
    evs.push({ type: 'bisect', data: { fn: fn, l: l, r: r, width: r - l, exact: s.exact, steps: i + 1 } });
    if (s.exact) break;
  }
  return evs;
}
function transEv(base, a, b, h, k) {
  if (!(Math.abs(a) >= 0.1 && Math.abs(b) >= 0.1 && Math.abs(a) <= 3 && Math.abs(b) <= 3 && Math.abs(h) <= 5 && Math.abs(k) <= 5)) throw new Error('平移伸縮超出範圍');
  return { type: 'trans', data: { base: base, a: a, b: b, h: h, k: k } };
}

let fail = 0;
function expect(id, events, want, note) {
  const m = byId(id); m.mem = {};
  let ok = false;
  events.forEach(e => { ok = ok || !!m.check(e, m.mem); });
  const pass = ok === want;
  if (!pass) fail++;
  console.log((pass ? '  ✓ ' : '  ✗ ') + String(id).padEnd(3) + (want ? ' 達成：' : ' 不觸發：') + note);
}
const R = (x, m) => ({ x: x, m: m || 1 });

// ---------- 預設狀態不觸發 ----------
{
  const evs = [rootsEv(1, [R(-1), R(2)], null, '>'), ivtEv('w', 0, 1), transEv('cube', 1, 1, 0, 0)];
  const hit = missions.filter(m => evs.some(e => { m.mem = {}; return m.check(e, m.mem); })).map(m => m.id);
  if (hit.length) { fail++; console.log('  ✗ 預設狀態觸發了 ' + hit.join('、')); }
  else console.log('  ✓ 預設狀態（(x + 1)(x − 2)、x³ − 2x − 5 在 [0, 1]、y = x³）不觸發任務');
}

// ---------- 根與圖形 ----------
expect(1, [rootsEv(1, [R(-1), R(2), R(0)])], true, '(x + 1)x(x − 2)');
expect(1, [rootsEv(1, [R(-1), R(2, 2)]), rootsEv(1, [R(-1), R(2)], { p: 0, q: 1 })], false, '有二重根、只有兩個實根的四次都不算');
expect(2, [rootsEv(1, [R(-1), R(2), R(2)])], true, '把兩個單根拖到同一點 → (x + 1)(x − 2)²');
expect(2, [rootsEv(1, [R(-1, 2)])], true, '直接把重數改成 2');
expect(3, [rootsEv(1, [R(1, 3)])], true, '(x − 1)³');
expect(3, [rootsEv(1, [R(1, 2), R(1, 2)])], false, '兩個二重根疊成四重根不算三重');
expect(4, [rootsEv(-1, [R(-2), R(-1), R(1), R(2)])], true, '−(x + 2)(x + 1)(x − 1)(x − 2)');
expect(4, [rootsEv(-1, [R(-1), R(1)]), rootsEv(-1, [R(-2), R(-1), R(1)], { p: 0, q: 1 })], false, '二次、五次都不算');
expect(5, [rootsEv(1, [R(1, 2)], { p: -1, q: 1 })], true, '(x − 1)²[(x + 1)² + 1]');
expect(5, [rootsEv(1, [R(1, 3), R(1)])], true, '三重根加一個疊在同一點的根 → (x − 1)^4');
expect(5, [rootsEv(1, [R(1, 2), R(2, 2)])], false, '兩個二重根有兩個交點');
expect(6, [rootsEv(1, [R(-2), R(3), R(5, 2)], null, '<')], true, '(x + 2)(x − 3)(x − 5)² < 0');
expect(6, [rootsEv(1, [R(-2), R(3)], { p: 0, q: 1 }, '<')], true, '(x + 2)(x − 3)(x² + 1) < 0');
expect(6, [rootsEv(1, [R(-2), R(3)], null, '<'), rootsEv(1, [R(-2), R(3), R(5)], null, '<'), rootsEv(1, [R(-2), R(3), R(5, 2)], null, '<=')], false, '二次、多一個單根、≤ 都不算');
expect('h1', [rootsEv(1, [R(0, 2), R(0, 2)])], true, '兩個二重根疊在一起 → x^4');
expect('h1', [rootsEv(1, [R(0, 3)])], false, '三重根不算');

// ---------- 勘根 ----------
expect(7, [ivtEv('w', 2, 3)], true, 'x³ − 2x − 5 在 [2, 3]：f(2) = −1、f(3) = 16');
expect(7, [ivtEv('w', 0, 1), ivtEv('q', 0, 2)], false, '同號的區間不算');
{
  const evs = bisectEvs('w', 2, 3, 7);
  expect(8, evs, true, '[2, 3] 二分 7 次，寬度 ' + evs[evs.length - 1].data.width);
  expect(8, bisectEvs('w', 2, 3, 6), false, '6 次寬度 0.015625 還不夠');
}
expect(9, [ivtEv('q', 0, 2)], true, 'x^4 − 4x² + x + 1 在 [0, 2]：f(0) = 1、f(2) = 3，裡面有兩個根');
expect(9, [ivtEv('k', 0, 2)], true, 'x^5 − 3x + 1 在 [0, 2]：f(0) = 1、f(2) = 27，裡面有兩個根');
expect(9, [ivtEv('w', 0, 1), ivtEv('q', -1, 0.5)], false, '沒有根、異號都不算');
{
  const evs = bisectEvs('r', 1.2, 1.8, 3);
  expect('h2', evs, true, '2x³ − 3x² − 2x + 3 在 [1.2, 1.8]：第一刀的中點 1.5 剛好是根');
  expect('h2', bisectEvs('w', 2, 3, 30), false, '無理根不會剛好切到');
}

// ---------- 平移伸縮 ----------
expect(10, [transEv('cube', 1, 1, 2, -1)], true, 'y = (x − 2)³ − 1');
expect(10, [transEv('cubic', -0.5, 2, 2, -1)], true, 'y = −0.5 f(2(x − 2)) − 1，f = x³ − 3x');
expect(10, [transEv('quart', 1, 1, 2, -1), transEv('cube', 1, 1, 2, 1)], false, '四次、k = 1 不算');
{
  // 數學上確認：中心真的在 (2, −1)
  const cc = M.cubicCenter(M.transform('cubic', -0.5, 2, 2, -1));
  if (Math.abs(cc.x - 2) > 1e-9 || Math.abs(cc.y + 1) > 1e-9) { fail++; console.log('  ✗ 對稱中心算錯'); } else console.log('  ✓ 用 −B/(3A) 算出的中心確實是 (2, −1)');
}

// ---------- 挑戰 ----------
expect(11, [{ type: 'challenge', data: { time: 30, streak: 1, last3: null } }], true, '答對一題');
expect(12, [{ type: 'challenge', data: { time: 40, streak: 3, last3: 140 } }], true, '連續三題 140 秒');
expect(12, [{ type: 'challenge', data: { time: 60, streak: 3, last3: 151 } }], false, '超過 150 秒不算');
{
  // 每一題都做得到：根是 −4..4 的整數、重數 ≤ 3、次數 ≤ 4、a 在 a 的滑桿範圍
  const RR = M.rng(99); let bad = 0, last = null;
  for (let t = 0; t < 1000; t++) {
    const c = M.genChallenge(RR, last); last = c;
    const ev = rootsEv(c.a, c.roots, null, '>');
    if (!M.same(M.fromFactored(ev.data.a, ev.data.roots, null), c.coef, 1e-9)) bad++;
  }
  if (bad) { fail++; console.log('  ✗ 有 ' + bad + ' 題調不出來'); } else console.log('  ✓ 1000 題挑戰都能用滑桿與重數按鈕調出完全相同的多項式');
}

const pub = missions.filter(m => !m.hidden), hid = missions.filter(m => m.hidden);
const sp = pub.reduce((s, m) => s + starsOf(m), 0), sh = hid.reduce((s, m) => s + starsOf(m), 0);
if (hid.some(m => starsOf(m) > 20)) { fail++; console.log('  ✗ 隱藏任務超過 20 顆'); }
console.log('\n公開 ' + pub.length + ' 個 ' + sp + ' 顆、隱藏 ' + hid.length + ' 個 ' + sh + ' 顆，共 ' + (sp + sh) + ' 顆。');
console.log(fail ? fail + ' 項失敗' : '全部通過');
if (fail) process.exit(1);
