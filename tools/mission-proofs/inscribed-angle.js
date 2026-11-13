/* 任務可達成的證明腳本。用法：node tools/mission-proofs/inscribed-angle.js
 * 用數學核心證明每個任務做得到（事件格式與 js/inscribed-angle.js 的 stateData 相同），
 * 並確認預設狀態不會觸發任務、亂按不會誤觸隱藏任務、每個隱藏任務的做法只完成它自己（和它本來就包含的公開任務）。
 * 圓上的點：拖曳每次 0.5°（靠近 5° 的倍數 1° 以內吸附），方向鍵 0.1°、Shift 1°；所以位置都是 0.1° 的倍數。
 * Q：靠近 0.5 的格點會吸附，其餘取到 0.05；方向鍵 0.1、Shift 0.5。直線方向滑桿每格 0.5°，可以打字到 0.1°。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const M = require(ROOT + 'js/inscribed-angle-core.js');
const missions = [];
global.window = { LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/inscribed-angle.js');
const byId = id => missions.find(m => m.id === 'inscribed-angle-' + id);
const short = id => id.replace('inscribed-angle-', '');
const r6 = v => { const w = Math.round(v * 1e6) / 1e6; return w === 0 ? 0 : w; };

// ---------- 與 js/inscribed-angle.js 相同的狀態與 stateData ----------
const DEF = () => ({ mode: 'ins', R: 4, ins: { A: 200, B: 340, P: 80, P2: 140 }, quad: [210, 300, 35, 120], Q: [6, 2.5], th1: 10, th2: 120,
  showCen: true, showP2: false, showDiag: true, show2: false, showTan: true, pRun: null });
function lineData(L) {
  if (!L) return null;
  if (L.n < 1) return { n: 0, d: L.d };
  return { n: L.n, d: L.d, chord: L.chord, near: Math.min(Math.abs(L.s[0]), Math.abs(L.s[1])), far: Math.max(Math.abs(L.s[0]), Math.abs(L.s[1])) };
}
function data(S, src) {
  const R = S.R, o = { src: src, mode: S.mode, R: R };
  if (S.mode === 'ins') {
    const s = S.ins, r = M.inscribed(R, s.A, s.B, s.P);
    Object.assign(o, { a: s.A, b: s.B, p: s.P, insOK: r.ok, showCen: S.showCen, showP2: S.showP2, pSpan: S.pRun ? S.pRun.hi - S.pRun.lo : 0 });
    if (r.ok) {
      const PA = M.dist(r.P, r.A), PB = M.dist(r.P, r.B), r2 = S.showP2 ? M.inscribed(R, s.A, s.B, s.P2) : null;
      Object.assign(o, { ins: r.ins, arc: r.arc, side: r.side, PA: PA, PB: PB, eqPP: Math.abs(PA - PB) / r.chord, p2Other: !!(S.showP2 && r2 && r2.ok && r2.side !== r.side) });
    }
  } else if (S.mode === 'quad') {
    const q = M.quad(R, S.quad);
    o.qok = q.ok; o.ts = S.quad.slice(); o.showDiag = S.showDiag;
    if (q.ok) Object.assign(o, { ang: q.ang, arcs: q.arcs, diagAng: q.diagAng, harm: q.harm, pitot: q.pitot, kite: q.kite,
      poly4: M.polyDev(q.arcs, 4), poly5: M.polyDev(q.arcs, 5), poly7: M.polyDev(q.arcs, 7),
      par: Math.min(Math.abs(q.arcs[1] - q.arcs[3]), Math.abs(q.arcs[0] - q.arcs[2])),
      rectDev: Math.max.apply(null, q.ang.map(a => Math.abs(a - 90))) });
  } else {
    const pw = M.power(R, S.Q);
    Object.assign(o, { Q: S.Q.slice(), th1: S.th1, th2: S.th2, show2: S.show2, showTan: S.showTan, power: pw, OQ: Math.hypot(S.Q[0], S.Q[1]),
      where: Math.abs(pw) < 1e-9 ? 'on' : pw < 0 ? 'in' : 'out', QT: pw > 0 ? Math.sqrt(pw) : NaN,
      L1: lineData(M.lineCircle(R, S.Q, S.th1)), L2: S.show2 ? lineData(M.lineCircle(R, S.Q, S.th2)) : null });
  }
  return { type: 'ia', data: o };
}
// 與頁面的 trackP、setAngle 相同
function setAngle(S, k, t) {
  t = r6(M.norm360(Math.round(t * 10) / 10));
  if (S.mode === 'quad') { const i = 'ABCD'.indexOf(k); S.quad = S.quad.slice(); S.quad[i] = t; return; }
  const prevP = S.ins.P;
  S.ins = Object.assign({}, S.ins); S.ins[k] = t;
  if (k === 'P') {
    const s = S.ins, R0 = S.pRun, r = M.inscribed(S.R, s.A, s.B, s.P);
    if (!r.ok) { S.pRun = null; return; }
    const u = M.ccw(s.A, s.P);
    if (R0 && R0.A === s.A && R0.B === s.B && R0.side === r.side) { R0.lo = Math.min(R0.lo, u); R0.hi = Math.max(R0.hi, u); return; }
    const r0 = M.inscribed(S.R, s.A, s.B, prevP);
    if (r0.ok && r0.side === r.side) { const u0 = M.ccw(s.A, prevP); S.pRun = { A: s.A, B: s.B, side: r.side, lo: Math.min(u0, u), hi: Math.max(u0, u) }; }
    else S.pRun = { A: s.A, B: s.B, side: r.side, lo: u, hi: u };
  } else if (k !== 'P2') S.pRun = null;
}
function snapAngle(t) { t = M.norm360(t); const f = Math.round(t / 5) * 5; return Math.abs(f - t) <= 1 ? M.norm360(f) : M.norm360(Math.round(t * 2) / 2); }

/** 從預設開始依序做 ops，回傳每一步的事件。op：{ mode } | { set: {欄位: 值} , src } | { pt: [名稱, 角度], src } */
function run(ops) {
  const S = DEF(), out = [];
  ops.forEach(op => {
    let src = op.src || 'drag';
    if (op.mode) { S.mode = op.mode; S.pRun = null; src = 'mode'; }
    if (op.set) Object.assign(S, op.set);
    if (op.pt) setAngle(S, op.pt[0], op.pt[1]);
    if (op.pts) Object.keys(op.pts).forEach(k => setAngle(S, k, op.pts[k]));
    out.push(data(S, src));
  });
  return out;
}
function guesses(list) {
  let streak = 0; const times = []; const out = [];
  list.forEach(g => {
    if (g.ok === false) { streak = 0; times.length = 0; out.push({ type: 'guess', data: { correct: false, streak: 0, secs: g.secs, last10: NaN } }); return; }
    streak++; times.push(g.secs); if (times.length > 10) times.shift();
    out.push({ type: 'guess', data: { correct: true, streak: streak, secs: g.secs, last10: streak >= 10 ? times.slice(-10).reduce((s, v) => s + v, 0) : NaN } });
  });
  return out;
}
const rep = (n, secs) => Array.from({ length: n }, () => ({ secs: secs }));

let fail = 0;
function expect(id, events, want, note) {
  const m = byId(id); m.mem = {};
  let ok = false;
  events.forEach(e => { ok = ok || !!m.check(e, m.mem); });
  const pass = ok === want;
  if (!pass) fail++;
  console.log((pass ? '  ✓ ' : '  ✗ ') + String(id).padEnd(3) + (want ? ' 達成：' : ' 不觸發：') + note);
}
// 先放 P 再放 A、B（動 A、B 會重新計算 P 走過的弧，不會順便完成任務 1）
const ins = pts => [{ mode: 'ins' }, { pts: { P: pts.P, A: pts.A, B: pts.B } }];
const quad = ts => [{ mode: 'quad' }, { pts: { A: ts[0], B: ts[1], C: ts[2], D: ts[3] } }];
const pow = set => [{ mode: 'pow' }, { set: set, src: 'slider' }];

// ---------- 預設狀態不觸發（三種模式、每個勾選都打開或關掉） ----------
{
  const evs = run([{ set: {}, src: 'check' }, { set: { showP2: true }, src: 'check' }, { set: { showCen: false }, src: 'check' },
    { mode: 'quad' }, { set: { showDiag: false }, src: 'check' },
    { mode: 'pow' }, { set: { show2: true }, src: 'check' }, { set: { showTan: false }, src: 'check' }, { mode: 'ins' }]);
  const hit = missions.filter(m => { m.mem = {}; return evs.some(e => m.check(e, m.mem)); }).map(m => m.id);
  if (hit.length) { fail++; console.log('  ✗ 預設狀態觸發了 ' + hit.join('、')); }
  else console.log('  ✓ 預設狀態（圓周角 A 200°、B 340°、P 80°；四邊形 210°、300°、35°、120°；Q (6, 2.5)、兩條線 10°、120°）切換模式、打開或關掉每個勾選，都不觸發任何任務');
  const q = evs[3].data, p = evs[6].data;
  console.log('    預設四邊形：調和差 ' + q.harm.toFixed(4) + '、皮托差 ' + q.pitot.toFixed(4) + '、對角線夾角 ' + q.diagAng.toFixed(2) + '°；Q：OQ ／ R = ' + (p.OQ / p.R).toFixed(3) + '，第一條線弦長／QT = ' + (p.L1.chord / p.QT).toFixed(3));
}

// ---------- 每個任務做得到（以及接近但不算的情況） ----------
const walk = [];
for (let t = 80; t <= 140; t += 0.5) walk.push({ pt: ['P', t] });
expect('1', run(walk), true, 'A 200°、B 340°，P 從 80° 一路拖到 140°（60°）');
expect('1', run([{ pt: ['P', 80] }, { pt: ['P', 130] }, { pt: ['B', 330] }, { pt: ['P', 145] }]), false, '中途動了 B：重新計算，走不到 60°');
expect('1', run([{ pt: ['P', 40] }, { pt: ['P', 300] }]), false, 'P 跳到另一側（越過 A、B）不算');
expect('2', run(ins({ A: 0, B: 180, P: 90 })), true, 'A 0°、B 180°、P 90°：∠APB = 90°');
expect('2', run(ins({ A: 0, B: 179.5, P: 90 })), false, 'B 179.5°：∠APB = 90.25°');
expect('3', run(ins({ A: 0, B: 140, P: 70 })), true, 'A 0°、B 140°、P 70°：∠APB = 110°，圓心角 220°');
expect('3', run([{ set: { showCen: false }, src: 'check' }].concat(ins({ A: 0, B: 140, P: 70 }))), false, '沒有顯示圓心角');
expect('4', run([{ set: { showP2: true }, src: 'check' }, { pt: ['P2', 270] }]), true, '預設 A、B、P，P′ 拖到 270°（AB 的另一側）');
expect('4', run([{ set: { showP2: true }, src: 'check' }]), false, 'P′ 在預設的 140°（和 P 同一側）');
expect('5', run(pow({ Q: [3, 1], th1: 18.5, th2: 108.5, show2: true })), true, 'Q (3, 1)，兩條線 18.5°、108.5°：弦長 7.99、4.90');
expect('5', run(pow({ Q: [1, 0.5], th1: 0, th2: 90, show2: true })), false, 'Q (1, 0.5)，0°、90°：弦長只差 0.19');
expect('6', run(quad([0, 100, 170, 250])), true, '0°、100°、170°、250°：AB 弧 + CD 弧 = 100° + 80° = 180°');
expect('6', run(quad([0, 100, 170, 251])), false, 'D 251°：夾角差 0.5°');
expect('7', run(quad([0, 60, 160, 220])), true, '0°、60°、160°、220°：AB 弧 = CD 弧 = 60°，AD ∥ BC');
expect('7', run(quad([0, 90, 180, 270])), false, '正方形是長方形，不算');
expect('8', run(pow({ th2: 30, show2: true })), true, 'Q (6, 2.5)，兩條線 10°、30°');
expect('8', run(pow({ show2: true })), false, '第二條線 120° 沒碰到圓');
expect('9', run(pow({ th1: 60.5 })), true, 'Q (6, 2.5)，第一條線 60.5°：圓心距 ' + M.lineCircle(4, [6, 2.5], 60.5).d.toFixed(3) + '（R = 4）');
expect('9', run(pow({ th1: 59 })), false, '59°：圓心距 ' + M.lineCircle(4, [6, 2.5], 59).d.toFixed(3));
expect('10', guesses(rep(4, 20)), true, '連續答對 4 題');
expect('10', guesses([{ secs: 9 }, { secs: 9 }, { secs: 9 }, { ok: false, secs: 9 }, { secs: 9 }]), false, '第 4 題答錯，連續中斷');
expect('11', guesses(rep(8, 20)), true, '連續答對 8 題');
expect('12', guesses(rep(10, 23)), true, '連續答對 10 題，共 230 秒');
expect('12', guesses(rep(10, 25)), false, '連續答對 10 題，共 250 秒（太慢）');

// ---------- 隱藏任務 ----------
// h7：在 R = 4、滑桿每格 0.5° 的情況下找一個黃金割線（Q 在 0.5 的格點上）
let g7 = null;
for (let x = 4.5; x <= 9 && !g7; x += 0.5) for (let y = 0; y <= 6 && !g7; y += 0.5) for (let th = 0; th < 180; th += 0.5) {
  const Q = [x, y], L = M.lineCircle(4, Q, th), pw = M.power(4, Q);
  if (pw > 0 && L.n === 2 && Math.abs(L.chord / Math.sqrt(pw) - 1) <= 0.0005 / 2) { g7 = { Q: Q, th: th }; break; }
}
const W = {
  h1: run(ins({ A: 90, B: 210, P: 330 })),
  h2: run(quad([45, 135, 225, 315])),
  h3: run(ins({ A: 54, B: 126, P: 270 })),
  h4: run(pow({ Q: [4, 4], th1: 0 })),
  h5: run(pow({ Q: [8, 0], th1: 0 })),
  h6: run(quad([90, 162, 234, 306])),
  h7: run(pow({ Q: g7.Q, th1: g7.th })),
  h8: run(quad([0, 27, 80.5, 302])),
  h9: run(quad([0, 20, 90, 288])),
  h10: run(quad([0, 51.4, 102.9, 205.7]))
};
const last = id => W[id][W[id].length - 1].data;
const NOTE = {
  h1: 'A 90°、B 210°、P 330°：∠APB = ' + last('h1').ins.toFixed(3) + '°，PA = PB，正三角形',
  h2: '45°、135°、225°、315°：四段弧都是 90°',
  h3: 'A 54°、B 126°、P 270°：∠APB = ' + last('h3').ins.toFixed(3) + '°，PA ／ AB = ' + (last('h3').PA / M.dist(M.pt(4, 54), M.pt(4, 126))).toFixed(5) + '（φ = 1.61803）',
  h4: 'Q (4, 4)、第一條線 0°：OQ = 4√2，切線長 QT = ' + last('h4').QT.toFixed(4) + ' = R',
  h5: 'Q (8, 0)、第一條線 0°：穿過圓心，QA = ' + last('h5').L1.near.toFixed(3) + ' = R，兩條切線夾 ' + (2 * Math.asin(4 / 8) / M.D2R).toFixed(1) + '°',
  h6: '90°、162°、234°、306°：正五邊形的四個頂點，對角線 ／ 邊 = φ',
  h7: 'Q (' + g7.Q.join(', ') + ')、第一條線 ' + g7.th + '°：弦長 AB = ' + last('h7').L1.chord.toFixed(4) + '，切線長 QT = ' + last('h7').QT.toFixed(4) + '，QB ／ QA = ' + (last('h7').L1.far / last('h7').L1.near).toFixed(4) + '（φ^2 = 2.6180）',
  h8: '0°、27°、80.5°、302°：AB·CD ／ BC·DA − 1 = ' + last('h8').harm.toExponential(2) + '，不是箏形（' + last('h8').kite.toFixed(2) + '）',
  h9: '0°、20°、90°、288°：(AB + CD) ／ (BC + DA) − 1 = ' + last('h9').pitot.toExponential(2) + '，不是箏形（' + last('h9').kite.toFixed(2) + '）',
  h10: '0°、51.4°、102.9°、205.7°（用方向鍵微調）：四段弧離 360°／7 的倍數最多 ' + last('h10').poly7.toFixed(3) + '°'
};
Object.keys(W).forEach(id => expect(id, W[id], true, NOTE[id]));
// 差一點就不算
expect('h1', run(ins({ A: 90, B: 210, P: 331 })), false, 'P 331°：PA ≠ PB');
expect('h1', run(ins({ A: 90, B: 210.5, P: 330 })), false, 'B 210.5°：∠APB = 59.75°');
expect('h2', run(quad([45, 135, 225, 315.5])), false, 'D 315.5°');
expect('h3', run(ins({ A: 54, B: 126.5, P: 270 })), false, 'B 126.5°：∠APB = 36.25°，PA ≠ PB');
expect('h3', run(ins({ A: 54, B: 126, P: 90 })), false, 'P 90°（在短弧中點）：∠APB = 144°');
expect('h4', run(pow({ Q: [4, 4], th1: 10 })), false, 'Q (4, 4)、第一條線 10°：沒有相切');
expect('h4', run(pow({ Q: [4, 4.1], th1: 0 })), false, 'Q (4, 4.1)、0°：沒有相切，QT = ' + Math.sqrt(M.power(4, [4, 4.1])).toFixed(3));
expect('h5', run(pow({ Q: [8, 0], th1: 2 })), false, 'Q (8, 0)、2°：沒有穿過圓心');
expect('h5', run(pow({ Q: [8.1, 0], th1: 0 })), false, 'Q (8.1, 0)：QA = 4.1');
expect('h6', run(quad([90, 162, 234, 307])), false, 'D 307°');
expect('h7', run(pow({ Q: g7.Q, th1: g7.th + 1 })), false, '第一條線再轉 1°');
expect('h8', run(quad([0, 27, 80.5, 304])), false, 'D 304°：調和差 ' + data(Object.assign(DEF(), { mode: 'quad', quad: [0, 27, 80.5, 304] }), 'x').data.harm.toFixed(4));
expect('h8', run(quad([0, 70, 180, 290])), false, '箏形（A、C 是直徑兩端）也是調和，但不算');
expect('h9', run(quad([0, 20, 90, 289])), false, 'D 289°：皮托差 ' + data(Object.assign(DEF(), { mode: 'quad', quad: [0, 20, 90, 289] }), 'x').data.pitot.toFixed(4));
expect('h9', run(quad([0, 90, 180, 270])), false, '正方形（箏形）不算');
expect('h10', run(quad([0, 51.5, 103, 205.5])), false, '只用拖的（0.5° 一格）：0°、51.5°、103°、205.5°');

// ---------- 亂按模擬：隱藏任務不可以被誤觸 ----------
{
  let seed = 1113;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const pick = (lo, hi, step) => r6(lo + Math.round(rand() * (hi - lo) / step) * step);
  const hits = {};
  for (let runN = 0; runN < 2000; runN++) {
    missions.forEach(m => { m.mem = {}; m.got = false; });
    const S = DEF();
    for (let k = 0; k < 150; k++) {
      const r = rand();
      let src = 'drag';
      if (r < 0.08) { S.mode = ['ins', 'quad', 'pow'][Math.floor(rand() * 3)]; S.pRun = null; src = 'mode'; }
      else if (r < 0.14) { const kk = ['showCen', 'showP2', 'showDiag', 'show2', 'showTan'][Math.floor(rand() * 5)]; S[kk] = !S[kk]; src = 'check'; }
      else if (r < 0.19) { S.R = pick(1, 6, 0.1); src = 'slider'; }
      else if (r < 0.27) { S[rand() < 0.5 ? 'th1' : 'th2'] = pick(0, 179.5, 0.5); src = 'slider'; }
      else if (r < 0.62) {
        src = rand() < 0.5 ? 'drag' : 'tap';
        if (S.mode === 'pow') S.Q = rand() < 0.6 ? [pick(-12, 12, 0.5), pick(-9, 9, 0.5)] : [pick(-12, 12, 0.05), pick(-9, 9, 0.05)];
        else { const names = S.mode === 'quad' ? ['A', 'B', 'C', 'D'] : (S.showP2 ? ['A', 'B', 'P', 'P2'] : ['A', 'B', 'P']); setAngle(S, names[Math.floor(rand() * names.length)], snapAngle(rand() * 360)); }
      } else {
        src = 'key';
        const big = rand() < 0.3, dir = rand() < 0.5 ? 1 : -1;
        if (S.mode === 'pow') { const st = big ? 0.5 : 0.1, ax = rand() < 0.5 ? 0 : 1; S.Q = S.Q.slice(); S.Q[ax] = r6(S.Q[ax] + dir * st); }
        else { const names = S.mode === 'quad' ? ['A', 'B', 'C', 'D'] : (S.showP2 ? ['A', 'B', 'P', 'P2'] : ['A', 'B', 'P']); const n = names[Math.floor(rand() * names.length)]; const cur = S.mode === 'quad' ? S.quad['ABCD'.indexOf(n)] : S.ins[n]; setAngle(S, n, cur + dir * (big ? 1 : 0.1)); }
      }
      const e = data(S, src);
      missions.forEach(m => { if (!m.got && m.check(e, m.mem)) { m.got = true; const id = short(m.id); hits[id] = (hits[id] || 0) + 1; } });
    }
  }
  const HID = missions.filter(m => m.hidden).map(m => short(m.id));
  const worst = HID.filter(id => (hits[id] || 0) > 30);
  const lv6 = missions.filter(m => !m.hidden && m.level >= 6).map(m => short(m.id)).filter(id => (hits[id] || 0) > 100);
  console.log((worst.length ? '  ✗ ' : '  ✓ ') + '亂按 2000 回（每回 150 步）：' + Object.keys(hits).sort().map(k => k + ' ' + hits[k] + ' 次').join('、') + '（隱藏任務每個都不到 1.5%）');
  if (worst.length || lv6.length) fail++;
}

// ---------- 做法交叉檢查 ----------
{
  const PRE = { h2: ['6'], h4: ['9'], h6: ['7'] };
  const bad = [];
  Object.keys(W).forEach(id => {
    missions.forEach(m => {
      const mid = short(m.id);
      if (mid === id || (PRE[id] || []).includes(mid)) return;
      m.mem = {}; let got = false;
      W[id].forEach(e => { got = m.check(e, m.mem) || got; });
      if (got) bad.push(id + ' → ' + mid);
    });
  });
  console.log((bad.length ? '  ✗ 做法會連帶完成別的任務：' + bad.join('、') : '  ✓ 隱藏任務的做法都只完成它自己（和 PRE 列的公開任務：' + Object.keys(PRE).map(k => k + ' 含 ' + PRE[k].join('、')).join('，') + '）')); if (bad.length) fail++;
}
{
  const hidL = missions.filter(m => m.hidden).map(m => m.level);
  const ok = hidL.length === 10 && hidL.every(l => l >= 3 && l <= 10) && hidL.filter(l => l >= 7).length >= 3;
  console.log((ok ? '  ✓ ' : '  ✗ ') + '隱藏任務 ' + hidL.length + ' 個，等級 ' + hidL.join('、') + '（7 級以上 ' + hidL.filter(l => l >= 7).length + ' 個）'); if (!ok) fail++;
}

// ---------- 總覽 ----------
const pub = missions.filter(m => !m.hidden), hid = missions.filter(m => m.hidden);
const starsOf = m => (m.hidden ? 2 : 1) * m.level;   // 隱藏任務星星加倍（與 js/missions.js 的 LabMission.starsOf 相同）
const stars = missions.reduce((s, m) => s + starsOf(m), 0);
console.log(`\n公開 ${pub.length} 個、隱藏 ${hid.length} 個，共 ${stars} 顆星（公開 ${pub.reduce((s, m) => s + m.level, 0)}、隱藏 ${hid.reduce((s, m) => s + starsOf(m), 0)}，隱藏任務是等級 × 2）。`);
if (hid.some(m => starsOf(m) > 20)) { fail++; console.log('隱藏任務超過 20 顆星（規則上限）。'); }
if (fail) { console.log(`有 ${fail} 項不符合。`); process.exit(1); }
console.log('全部任務都證明做得到，預設狀態不觸發，亂按不會誤觸隱藏任務。');
