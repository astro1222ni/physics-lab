/* 任務可達成的證明腳本。用法：node tools/mission-proofs/linear-programming.js
 * 用數學核心證明每個任務在滑桿範圍與精度內做得到（事件格式與 js/linear-programming.js 相同），
 * 並確認載入例題不會完成任務、亂按不會誤觸新的隱藏任務、每個任務的做法不會順便完成別的任務。
 * 滑桿：a、b −5～5（整數；點數字可輸入到 0.001）、c −10～20（整數；0.001）、p、q −5～5（整數；0.001）、k（0.5；0.001）。
 * 最多 4 條限制式，另有「x ≥ 0、y ≥ 0」可以關掉。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const M = require(ROOT + 'js/linear-programming-core.js');
const missions = [];
global.window = { LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/linear-programming.js');
const byId = id => missions.find(m => m.id === 'linear-programming-' + id);

// ---------- 與 js/linear-programming.js 相同的事件資料 ----------
const C = (a, b, c, s) => ({ a: a, b: b, c: c, s: s || '<=', on: true });
const OFF = [{ a: 1, b: 0, c: 8, s: '<=' }, { a: 0, b: 1, c: 8, s: '<=' }, { a: 1, b: 1, c: 10, s: '<=' }, { a: 1, b: -1, c: 4, s: '<=' }];
function four(list) { return [0, 1, 2, 3].map(i => list[i] ? Object.assign({ on: true }, list[i]) : Object.assign({}, OFF[i], { on: false })); }
function S(list, p, q, sense, nonneg) { return { cons: four(list), p: p, q: q, sense: sense || 'max', nonneg: nonneg !== false }; }
const act = st => st.cons.filter(c => c.on);
function setup(st, src) {
  const A = M.analyze(act(st), st.p, st.q, st.sense, { nonneg: st.nonneg }), R = A.R, o = A.opt, ip = A.ip;
  return { type: 'setup', data: {
    src: src || 'slider', cons: st.cons.map(c => ({ a: c.a, b: c.b, c: c.c, s: c.s, on: c.on })), nOn: act(st).length,
    nonneg: st.nonneg, p: st.p, q: st.q, sense: st.sense,
    status: o.status, z: o.z, x: o.x, y: o.y, nBest: o.best.length, best: o.best.map(v => [v.x, v.y]),
    maxStatus: st.sense === 'max' ? o.status : A.other.status, minStatus: st.sense === 'min' ? o.status : A.other.status,
    empty: R.empty, bounded: R.bounded, degenerate: !!R.degenerate, nVerts: R.vertices.length, area: R.area,
    verts: R.vertices.map(v => [v[0], v[1]]),
    intStatus: ip.status, intZ: ip.z, intN: ip.pts.length, intBest: ip.pts.map(v => [v[0], v[1]]),
    nLat: A.nLat, latB: A.latB, latI: A.latI, latticeVerts: A.latticeVerts, tight: A.tight } };
}
function level(st, k, src) {
  const A = M.analyze(act(st), st.p, st.q, st.sense, { nonneg: st.nonneg }), o = A.opt;
  const rel = Math.hypot(st.p, st.q) > 1e-9 ? M.levelRelation(act(st), st.p, st.q, k, { nonneg: st.nonneg }) : 'miss';
  const atOpt = (o.status === 'unique' || o.status === 'edge') && rel === 'touch' && Math.abs(k - o.z) <= 0.002 * (1 + Math.abs(o.z));
  return { type: 'level', data: { src: src || 'slider', k: k, rel: rel, p: st.p, q: st.q, sense: st.sense, status: o.status, zOpt: o.z, atOpt: atOpt, chal: false } };
}
function tryP(st, x, y, src) {
  const A = M.analyze(act(st), st.p, st.q, st.sense, { nonneg: st.nonneg }), o = A.opt, ip = A.ip;
  const ok = M.feasible(act(st), x, y, { nonneg: st.nonneg }, 1e-9), z = st.p * x + st.q * y;
  const onVertex = !A.R.empty && A.R.vertices.some(v => Math.abs(v[0] - x) < 1e-9 && Math.abs(v[1] - y) < 1e-9);
  const isOpt = ok && (o.status === 'unique' || o.status === 'edge' || o.status === 'all') && Math.abs(z - o.z) <= 1e-7 * (1 + Math.abs(o.z));
  const isI = Math.abs(x - Math.round(x)) < 1e-9 && Math.abs(y - Math.round(y)) < 1e-9;
  const isIntOpt = ok && isI && ip.status === 'ok' && ip.pts.some(v => v[0] === Math.round(x) && v[1] === Math.round(y));
  return { type: 'try', data: { src: src || 'tap', x: x, y: y, feasible: ok, z: z, onVertex: onVertex, isOpt: isOpt, isIntOpt: isIntOpt,
    gap: ip.status === 'ok' && isFinite(o.z) ? Math.abs(o.z - ip.z) : NaN, status: o.status, intStatus: ip.status, chal: false } };
}
function sweep(st) { const o = M.optimize(act(st), st.p, st.q, st.sense, { nonneg: st.nonneg }); return { type: 'sweep', data: { status: o.status, z: o.z, sense: st.sense } }; }
function guesses(list) {
  let streak = 0; const times = []; const out = [];
  list.forEach(g => {
    if (!g.ok) { streak = 0; times.length = 0; } else { streak++; times.push(g.secs); if (times.length > 5) times.shift(); }
    out.push({ type: 'guess', data: { correct: g.ok, streak: streak, secs: g.secs, last5: streak >= 5 ? times.slice(-5).reduce((s, v) => s + v, 0) : NaN } });
  });
  return out;
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
const f = (v, d) => String(+v.toFixed(d == null ? 3 : d)).replace('-', '−');

// ---------- 例題 ----------
const P = M.PRESETS;
const FAC = S(P.factory.cons, 3, 2, 'max'), DIET = S(P.diet.cons, 4, 5, 'min'), BASIC = S(P.basic.cons, 2, 1, 'max');
const OPEN = S([{ a: 1, b: 2, c: 4, s: '>=' }, { a: 3, b: 1, c: 6, s: '>=' }], 1, 1, 'min');

// ---------- 載入頁面、按例題不會完成任務 ----------
{
  const evs = [FAC, DIET, BASIC, OPEN].map(st => setup(st, 'preset'));
  const hit = missions.filter(m => { m.mem = {}; let g = false; evs.forEach(e => { g = m.check(e, m.mem) || g; }); return g; }).map(m => m.id);
  if (hit.length) { fail++; console.log('  ✗ 載入例題觸發了 ' + hit.join('、')); }
  else console.log('  ✓ 開頁面不發事件；依序按四個例題（setup，src = preset）不完成任何任務');
}

// ---------- 每個任務做得到（以及接近但不算的情況） ----------
expect('1', [sweep(FAC)], true, '按「掃描」');
expect('2', [tryP(FAC, 1, 1)], true, '工廠題 P = (1, 1)：可行');
expect('2', [tryP(FAC, 7, 1)], false, 'P = (7, 1)：3·7 + 1 = 22 > 18，不可行');
expect('3', [tryP(FAC, 4.4, 4.8)], true, 'P 吸到頂點 (4.4, 4.8)');
expect('3', [tryP(FAC, 4, 5)], false, '(4, 5) 是格子點，不是頂點');
{
  const o = M.optimize(act(FAC), 3, 2, 'max');
  expect('4', [level(FAC, 22.8, 'drag')], true, '工廠題：等高線拖到 k = 22.8（吸附到頂點的 z）：只碰到 (4.4, 4.8)，最大值 ' + f(o.z));
  expect('4', [level(FAC, 22.5)], false, 'k = 22.5：還穿過可行域');
  expect('4', [level(FAC, 22.8, 'sweep')], false, '「掃描」停在那裡不算');
  expect('4', [level(FAC, 0)], false, 'k = 0：只碰到原點，但那是最小值');
}
expect('5', [setup(FAC, 'preset'), setup(S(P.factory.cons, 3, 9, 'max'))], true, '工廠題 z = 3x + 2y 最佳 (4.4, 4.8) → 改 q = 9：最佳換到 (2, 6)');
expect('5', [setup(FAC, 'preset'), setup(S(P.factory.cons, 4, 2, 'max'))], false, 'p = 4：最佳還是 (4.4, 4.8)');
expect('5', [setup(FAC, 'preset'), setup(S(P.factory.cons, 3, 9, 'max'), 'preset')], false, '換例題不算');
expect('6', [setup(S(P.basic.cons, 1, 1, 'max'))], true, '課本題改 z = x + y：整條邊 x + y = 5 都最好');
expect('6', [setup(S([{ a: 1, b: 1, c: 2, s: '>=' }], 1, 1, 'min'))], false, '無界的可行域上整條邊（不算，要有界）');
expect('7', [setup(S(OPEN.cons.filter(c => c.on), 1, 1, 'max'))], true, '「無界」例題改成求最大值');
expect('7', [setup(OPEN, 'preset')], false, '例題本身是求最小值');
expect('8', [setup(S([C(1, 1, 2), C(1, 1, 5, '>=')], 1, 1))], true, 'x + y ≤ 2 和 x + y ≥ 5');
expect('8', [setup(S([C(1, 1, -2)], 1, 1))], false, '只用一條限制式（x + y ≤ −2 加上 x、y ≥ 0）不算');
{
  const o = M.optimize(act(DIET), 4, 5, 'min');
  expect('9', [level(DIET, 22, 'key')], true, '最省飼料：等高線推到 k = 22，只碰到 (3, 2)，最小值 ' + f(o.z));
  expect('9', [level(FAC, 0)], false, '工廠題求最小：最小值 0 在原點（不算）');
}
{
  const I = M.intOptimize(act(FAC), 3, 2, 'max');
  expect('10', [tryP(FAC, 4, 5)], true, '工廠題：最佳頂點 z = 22.8，最好的整數解 (' + I.pts[0].join(', ') + ') z = ' + I.z + '，P 放在 (4, 5)');
  expect('10', [tryP(FAC, 4, 4)], false, '(4, 4) 不是最好的整數解');
  expect('10', [tryP(BASIC, 4, 1)], false, '課本題：最佳頂點 (4, 1) 本身就是格子點，沒有差距');
}
expect('11', guesses([{ ok: true, secs: 20 }, { ok: true, secs: 25 }, { ok: true, secs: 30 }]), true, '連續答對三題');
expect('11', guesses([{ ok: true, secs: 20 }, { ok: false, secs: 25 }, { ok: true, secs: 30 }, { ok: true, secs: 30 }]), false, '中間錯一題');
expect('12', guesses([10, 14, 15, 16, 18].map(s => ({ ok: true, secs: s }))), true, '連續五題共 73 秒');
expect('12', guesses([10, 14, 15, 16, 21].map(s => ({ ok: true, secs: s }))), false, '連續五題共 76 秒');

// ---------- 隱藏任務 ----------
const W = {
  h1: S([C(1, 1, 4), C(2, 0, 3, '>='), C(0, 2, 5, '>=')], 1, 1),
  h2: S([C(1, 1, 5), C(1, 1, 5, '>=')], 1, 2),
  h3: S([C(1, 2, 4, '>='), C(3, 1, 6, '>='), C(1, 1, 3, '>=')], -2, -3, 'max'),
  h4: S([C(1, 1, 2, '>='), C(1, 1, 6), C(1, -1, 2), C(1, -1, -2, '>=')], 1, 1, 'max'),
  h5: S([C(1, 1, 6), C(1, -5, 0, '>=')], 2, 1),
  h6: S([C(1, 1, 3), C(1, -1, 3), C(-1, 1, 3), C(-1, -1, 3)], 1, 2, 'max', false),
  h7: S([C(1, 1, 5), C(1, -1, 3), C(1, 0, 4), C(2, 1, 9)], 2, 1, 'max'),
  h8: S([C(1.732, -1, 0, '>='), C(1.732, 1, 6.928)], 1, 1),
  h9: S([C(3, 4, 20), C(4, 3, 20)], 1, 1, 'max'),
  h10: S([C(5, -4, 1), C(-5, 5, 4)], 1, 1, 'max')
};
{
  // 例子都要在滑桿範圍內（a、b −5～5，c −10～20，p、q −5～5）
  const out = Object.keys(W).filter(id => W[id].cons.some(c => c.on && (Math.abs(c.a) > 5 || Math.abs(c.b) > 5 || c.c < -10 || c.c > 20)) || Math.abs(W[id].p) > 5 || Math.abs(W[id].q) > 5);
  console.log((out.length ? '  ✗ 超出滑桿範圍：' + out.join('、') : '  ✓ 10 個隱藏任務的做法，數字都在滑桿範圍內（a、b −5～5，c −10～20，p、q −5～5）')); if (out.length) fail++;
}
const pts = vs => vs.map(w => '(' + f(w[0]) + ', ' + f(w[1]) + ')').join('、');
const onCons = st => st.cons.filter(c => c.on);
{
  const e = setup(W.h1);
  expect('h1', [e], true, 'x + y ≤ 4、2x ≥ 3、2y ≥ 5：只剩 ' + pts(e.data.verts));
  expect('h1', [setup(S([C(1, 0, 3, '>='), C(0, 1, 2, '>='), C(1, 1, 5)], 1, 1))], false, 'x ≥ 3、y ≥ 2、x + y ≤ 5：只剩 (3, 2)，是格子點');
  expect('h1', [setup(S([C(1, 1, 0)], 1, 1))], false, 'x + y ≤ 0 加上 x、y ≥ 0：只剩原點');
  expect('h1', [setup(W.h1, 'preset')], false, '例題不算');
}
expect('h2', [setup(W.h2)], true, 'x + y ≤ 5 和 x + y ≥ 5：線段 (5, 0)–(0, 5)，長 ' + f(Math.hypot(5, 5), 2));
expect('h2', [setup(S([C(1, 1, 3), C(1, 1, 3, '>=')], 1, 2))], false, 'x + y ≤ 3 和 ≥ 3：線段只有 ' + f(Math.hypot(3, 3), 2) + ' 長');
expect('h2', [setup(S([C(1, 0, 0), C(0, 1, 6)], 1, 1))], false, 'x ≤ 0：可行域是 y 軸上的線段（不斜）');
{
  const e = setup(W.h3);
  expect('h3', [e], true, 'x + 2y ≥ 4、3x + y ≥ 6、x + y ≥ 3，求 z = −2x − 3y 的最大值：可行域無界，頂點 ' + pts(e.data.verts) + '，最大值唯一在 (' + f(e.data.x) + ', ' + f(e.data.y) + ')，z = ' + f(e.data.z));
  expect('h3', [setup(S(onCons(OPEN), -1, -1, 'max'))], false, '「無界」例題求 −x − y 的最大值：只有兩道坡');
  expect('h3', [setup(S(onCons(W.h3), -1, -1, 'max'))], false, '三道坡，求 −x − y 的最大值：最佳是整條邊');
  expect('h3', [setup(S(onCons(W.h3), 2, 3, 'min'))], false, '求 2x + 3y 的最小值（同一個點，但題目要的是最大值）');
}
{
  const e = setup(W.h4);
  expect('h4', [e], true, 'x + y ≥ 2、x + y ≤ 6、x − y ≤ 2、x − y ≥ −2，z = x + y：平行四邊形 ' + pts(e.data.verts) + '，最大、最小都是整條邊');
  expect('h4', [setup(S([C(1, 1, 2, '>='), C(1, 1, 6)], 1, 1, 'max'))], false, 'x + y ≥ 2、x + y ≤ 6：梯形，上下兩邊不一樣長');
  expect('h4', [setup(S(P.basic.cons, 1, 1, 'max'))], false, '課本題 z = x + y：最大是整條邊，最小只有原點');
}
{
  const e = setup(W.h5);
  expect('h5', [e], true, 'x + y ≤ 6、x − 5y ≥ 0：三角形 ' + pts(e.data.verts) + '，格子點都在邊上（I = ' + e.data.latI + '、B = ' + e.data.latB + '），A = ' + e.data.area + ' = 0 + 8／2 − 1');
  const e2 = setup(S([C(2, 3, 6)], 1, 1));
  expect('h5', [e2], false, '2x + 3y ≤ 6：面積 3，可是內部有 ' + e2.data.latI + ' 個格子點');
  expect('h5', [setup(S([C(1, 3, 3)], 1, 1))], false, 'x + 3y ≤ 3：面積只有 1.5');
  expect('h5', [setup(S([C(1, 0, 3), C(0, 1, 1)], 1, 1))], false, 'x ≤ 3、y ≤ 1：長方形（不是三角形）');
}
expect('h6', [setup(W.h6)], true, '關掉 x、y ≥ 0，x ± y ≤ 3、−x ± y ≤ 3：|x| + |y| ≤ 3');
expect('h6', [setup(S(onCons(W.h6), 1, 2, 'max', true))], false, '留著 x、y ≥ 0：只剩第一象限的三角形');
expect('h6', [setup(S([C(1, 0, 3), C(-1, 0, 3), C(0, 1, 3), C(0, -1, 3)], 1, 1, 'max', false))], false, '|x| ≤ 3、|y| ≤ 3：正方形但頂點不在軸上');
expect('h7', [setup(W.h7)], true, 'x + y ≤ 5、x − y ≤ 3、x ≤ 4、2x + y ≤ 9，z = 2x + y：最佳頂點 (4, 1) 上有四條線');
expect('h7', [setup(S([C(1, 1, 5), C(1, -1, 3), C(0, 1, 4), C(1, 0, 4)], 2, 1, 'max'))], false, '課本題加 x ≤ 4：(4, 1) 上只有三條');
expect('h7', [setup(S([C(1, 1, 5), C(1, -1, 3), C(1, 0, 4), C(2, 2, 10)], 2, 1, 'max'))], false, '第四條 2x + 2y ≤ 10 和 x + y ≤ 5 是同一條線');
{
  const v = setup(W.h8).data.verts;
  expect('h8', [setup(W.h8)], true, '1.732x − y ≥ 0、1.732x + y ≤ 6.928（打字）：頂點 ' + pts(v));
  expect('h8', [setup(S([C(2, -1, 0, '>='), C(2, 1, 8)], 1, 1))], false, '斜率 ±2：等腰但不是正三角形');
  let hits = 0;
  for (let a = 1; a <= 5; a++) for (let b = 1; b <= 5; b++) for (let c = 1; c <= 20; c++) if (byId('h8').check(setup(S([C(a, -b, 0, '>='), C(a, b, c)], 1, 1)), {})) hits++;
  console.log((hits ? '  ✗ ' : '  ✓ ') + 'h8  斜率 ±a／b 的整數係數（500 組）都做不到正三角形，要打字'); if (hits) fail++;
}
{
  const e = setup(W.h9);
  expect('h9', [e], true, '3x + 4y ≤ 20、4x + 3y ≤ 20，z = x + y：實數最佳只有 (' + f(e.data.x) + ', ' + f(e.data.y) + ')，z = ' + f(e.data.z) + '；整數最佳 z = ' + e.data.intZ + ' 有 ' + e.data.intN + ' 個 ' + e.data.intBest.map(w => '(' + w.join(', ') + ')').join('、'));
  const e2 = setup(S([C(1, 2, 10), C(2, 1, 10)], 1, 1, 'max'));
  expect('h9', [e2], false, 'x + 2y ≤ 10、2x + y ≤ 10：整數最佳只有 ' + e2.data.intN + ' 個');
  expect('h9', [setup(S(P.basic.cons, 1, 1, 'max'))], false, '實數最佳是整條邊（不算）');
}
{
  const e = setup(W.h10);
  expect('h10', [e], true, '5x − 4y ≤ 1、−5x + 5y ≤ 4，z = x + y：細長的可行域，最佳頂點 (' + f(e.data.x) + ', ' + f(e.data.y) + ') z = ' + f(e.data.z) + '，四捨五入 (4, 5) 不可行，最好的整數解 (' + e.data.intBest[0].join(', ') + ') z = ' + e.data.intZ + '，相距 ' + f(Math.hypot(e.data.intBest[0][0] - e.data.x, e.data.intBest[0][1] - e.data.y), 2));
  const e2 = setup(S([C(3, 4, 17)], 4, 5, 'max'));
  expect('h10', [e2], false, '3x + 4y ≤ 17，z = 4x + 5y：最佳 (5.667, 0)，整數最佳 (3, 2)，只差 ' + f(Math.hypot(3 - 17 / 3, 2), 2));
  expect('h10', [setup(FAC)], false, '工廠題：(4, 5) 離 (4.4, 4.8) 太近');
}

// ---------- 亂按模擬：新的隱藏任務不可以被誤觸 ----------
{
  let seed = 1113;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const ri = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
  const round = (v, n) => Math.round(v * Math.pow(10, n)) / Math.pow(10, n);
  const presets = [FAC, DIET, BASIC, OPEN];
  const hits = {};
  for (let run = 0; run < 2000; run++) {
    missions.forEach(m => { m.mem = {}; m.got = false; });
    let st = JSON.parse(JSON.stringify(FAC)), k = 9, Px = 1, Py = 1;
    for (let step = 0; step < 150; step++) {
      const r = rand(); let e = null;
      const i = ri(0, 3);
      if (r < 0.3) { const key = ['a', 'b', 'c'][ri(0, 2)]; st.cons[i][key] = key === 'c' ? ri(-10, 20) : ri(-5, 5); st.cons[i].on = true; e = setup(st); }
      else if (r < 0.34) { const key = ['a', 'b', 'c'][ri(0, 2)]; st.cons[i][key] = key === 'c' ? round(rand() * 30 - 10, 2) : round(rand() * 10 - 5, 2); st.cons[i].on = true; e = setup(st); }
      else if (r < 0.39) { st.cons[i].on = !st.cons[i].on; e = setup(st, 'toggle'); }
      else if (r < 0.43) { st.cons[i].s = st.cons[i].s === '<=' ? '>=' : '<='; st.cons[i].on = true; e = setup(st, 'sign'); }
      else if (r < 0.53) { if (rand() < 0.5) st.p = ri(-5, 5); else st.q = ri(-5, 5); e = setup(st); }
      else if (r < 0.56) { st.sense = st.sense === 'max' ? 'min' : 'max'; e = setup(st, 'sense'); }
      else if (r < 0.58) { st.nonneg = !st.nonneg; e = setup(st, 'nonneg'); }
      else if (r < 0.61) { st = JSON.parse(JSON.stringify(presets[ri(0, 3)])); e = setup(st, 'preset'); }
      else if (r < 0.71) { k = round(k + (rand() * 20 - 10), 1); e = level(st, Math.round(k * 2) / 2); }
      else if (r < 0.74) {
        // 拖等高線剛好吸到某個頂點
        const R = M.region(act(st), { nonneg: st.nonneg });
        if (R.vertices.length) { const v = R.vertices[ri(0, R.vertices.length - 1)]; k = st.p * v[0] + st.q * v[1]; e = level(st, k, 'drag'); }
      }
      else if (r < 0.9) {
        const R = M.region(act(st), { nonneg: st.nonneg });
        const u = rand();
        if (u < 0.25 && R.vertices.length) { const v = R.vertices[ri(0, R.vertices.length - 1)]; Px = v[0]; Py = v[1]; }
        else if (u < 0.6) { Px = ri(-2, 12); Py = ri(-2, 12); }
        else { Px = round(rand() * 14 - 2, 1); Py = round(rand() * 14 - 2, 1); }
        e = tryP(st, Px, Py, rand() < 0.2 ? 'mark' : 'tap');
      }
      else if (r < 0.93) e = sweep(st);
      else { st.cons[i].c = Math.max(-10, Math.min(20, st.cons[i].c + (rand() < 0.5 ? -0.5 : 0.5))); st.cons[i].on = true; e = setup(st, 'drag'); }
      if (!e) continue;
      missions.forEach(m => { if (!m.got && m.check(e, m.mem)) { m.got = true; const id = m.id.replace('linear-programming-', ''); hits[id] = (hits[id] || 0) + 1; } });
    }
  }
  const HID = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8', 'h9', 'h10'];
  const worst = HID.filter(id => (hits[id] || 0) > 30);
  console.log((worst.length ? '  ✗ ' : '  ✓ ') + '亂按 2000 回（每回 150 步）：' + Object.keys(hits).map(k => k + ' ' + hits[k] + ' 次').join('、') + '（隱藏任務每個都不到 1.5%）');
  if (worst.length) fail++;
}

// ---------- 做法交叉檢查：每個隱藏任務的做法只完成它自己 ----------
{
  const ways = {};
  Object.keys(W).forEach(id => { ways[id] = [setup(W[id])]; });
  // 前提：h4 的最大、最小都是整條邊，本來就包含公開任務 6（有界、最佳是整條邊）
  const PRE = { h4: ['6'] };
  const bad = [];
  Object.keys(ways).forEach(id => {
    missions.forEach(m => {
      const mid = m.id.replace('linear-programming-', '');
      if (mid === id || (PRE[id] || []).indexOf(mid) >= 0) return;
      m.mem = {}; let got = false;
      ways[id].forEach(e => { got = m.check(e, m.mem) || got; });
      if (got) bad.push(id + ' → ' + m.id.replace('linear-programming-', ''));
    });
  });
  console.log((bad.length ? '  ✗ 做法會連帶完成別的任務：' + bad.join('、') : '  ✓ 10 個隱藏任務的做法都只完成它自己（h4 本來就包含公開任務 6 的條件，不算）')); if (bad.length) fail++;
}

// ---------- 總覽 ----------
const pub = missions.filter(m => !m.hidden), hid = missions.filter(m => m.hidden);
const starsOf = m => (m.hidden ? 2 : 1) * m.level;
const stars = missions.reduce((s, m) => s + starsOf(m), 0);
const hidL = hid.map(m => m.level);
const okL = hid.length === 10 && hidL.every(l => l >= 3 && l <= 10) && hidL.filter(l => l >= 7).length >= 3 && pub.length >= 8 && pub.length <= 12;
console.log((okL ? '  ✓ ' : '  ✗ ') + '公開 ' + pub.length + ' 個；隱藏 ' + hid.length + ' 個，等級 ' + hidL.join('、') + '（7 級以上 ' + hidL.filter(l => l >= 7).length + ' 個）'); if (!okL) fail++;
console.log(`\n公開 ${pub.length} 個、隱藏 ${hid.length} 個，共 ${stars} 顆星（公開 ${pub.reduce((s, m) => s + m.level, 0)}、隱藏 ${hid.reduce((s, m) => s + starsOf(m), 0)}，隱藏任務是等級 × 2）。`);
if (hid.some(m => starsOf(m) > 20)) { fail++; console.log('隱藏任務超過 20 顆星（規則上限）。'); }
if (fail) { console.log(`有 ${fail} 項不符合。`); process.exit(1); }
console.log('全部任務都證明做得到，載入例題不觸發，亂按不會誤觸隱藏任務。');
