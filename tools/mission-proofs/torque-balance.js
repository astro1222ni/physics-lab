/* 任務可達成的證明腳本（力矩與靜力平衡）。用法：node tools/mission-proofs/torque-balance.js
 * 修改物理核心或任務條件後重跑，確認每個任務仍然做得到、預設狀態不會觸發任務。
 * 做法：只用物理核心 js/torque-balance-core.js，照頁面 js/torque-balance.js 的流程產生事件：
 *   蹺蹺板：按「放開」→ seesawRelease；停在水平就回報 'balance'，否則每格 1/60 s 呼叫 seesawAdvance，
 *           碰地回報 'land'（prevSide 為放開後上一次著地的一端）；放開後改擺設用 seesawEdit（角動量守恆）。
 *   梯子：按「放手」→ ladderStatics 判斷，站得住回報 'ladderStand'，否則 'ladderSlip'；
 *         「往上爬」以 0.4 m/s 前進，跨過 ladderSlipD 的位置就在該處滑倒，爬到頂端則回報 'ladderStand'（cause 'climb'）。
 * 所有輸入都在 torque-balance.html 的範圍內：M 0–30 kg（間隔 0.5，打字 2 位）、p 1–3 m（間隔 0.05，打字 3 位）、
 * 物體放在 0.25 m 的格點上（同格最多疊 3 個、人獨占一格、只有砝碼能吊、每個掛鉤一個）；
 * θ 10–85°（間隔 0.1，打字 2 位）、μs、μw 0–1（間隔 0.01，打字 3 位）、梯子 5–40 kg（間隔 0.5，打字 2 位）、
 * 人 0–100 kg（間隔 1，打字 1 位）、d 0–4 m（間隔 0.05，打字 3 位）。 */
'use strict';
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const TC = require(__ROOT + 'js/torque-balance-core.js');
const missions = [];
global.window = { TorqueCore: TC, LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(__ROOT + 'js/missions/torque-balance.js');

const SS = TC.SEESAW, K = TC.KINDS, D2R = TC.D2R, LL = TC.LADDER.L;
const near = (a, b) => Math.abs(a - b) < 1e-9;
const onStep = (v, min, step) => near(Math.round((v - min) / step) * step + min, v);
const decOK = (v, dec) => near(Math.round(v * Math.pow(10, dec)) / Math.pow(10, dec), v);
const RANGE = {
  M: { min: 0, max: 30, step: 0.5, dec: 2 }, p: { min: 1, max: 3, step: 0.05, dec: 3 },
  th: { min: 10, max: 85, step: 0.1, dec: 2 }, mu: { min: 0, max: 1, step: 0.01, dec: 3 }, muw: { min: 0, max: 1, step: 0.01, dec: 3 },
  ml: { min: 5, max: 40, step: 0.5, dec: 2 }, mp: { min: 0, max: 100, step: 1, dec: 1 }, d: { min: 0, max: 4, step: 0.05, dec: 3 }
};
function uiKind(name, v) {
  const r = RANGE[name];
  if (!r) return 'slider';
  if (!(v >= r.min - 1e-12 && v <= r.max + 1e-12)) return name + ' = ' + v + ' 超出滑桿範圍';
  if (onStep(v, r.min, r.step)) return 'slider';
  return decOK(v, r.dec) ? 'typed' : name + ' = ' + v + ' 超過打字精度';
}
/** 頁面 placeProblem() 的規則 */
function placeProblem(items, kind, x, hang) {
  if (x < -1e-9 || x > SS.L + 1e-9 || !onStep(x, 0, SS.GRID)) return 'x = ' + x + ' 不在格點上';
  if (kind === 'scale') return '';
  const k = K[kind];
  if (hang) {
    if (!k.hang) return kind + ' 不能吊';
    return items.some(o => near(o.x, x) && o.hang) ? '掛鉤已經有東西' : '';
  }
  const top = items.filter(o => near(o.x, x) && !o.hang);
  if (k.person && top.length) return '人要獨占一格';
  if (top.some(o => K[o.kind].person)) return '已經有人';
  if (top.length >= SS.STACK) return '最多疊 3 個';
  return '';
}

// ---------- 蹺蹺板 ----------
let nextId = 1;
/** 依序放物體，傳回 cfg；放不下就丟錯 */
function seesaw(o) {
  const items = [];
  (o.items || []).forEach(a => {
    const why = placeProblem(items, a[0], a[1], !!a[2]);
    if (why) throw new Error(why);
    items.push({ id: 'i' + (nextId++), kind: a[0], m: K[a[0]].m, x: a[1], hang: !!a[2] });
  });
  return { M: o.M == null ? 5 : o.M, p: o.p == null ? 2 : o.p, L: SS.L, H: SS.H, items: items, scale: o.scale != null ? { x: o.scale } : null };
}
function snap(cfg, st, extra) { return Object.assign(TC.seesawSnapshot(cfg, st, false), extra || {}); }
/** 按「放開」並跑到停下（或 tMax 秒）；edits：[{t, add:[kind,x,hang]}] 在放開後 t 秒改擺設 */
function runSeesaw(o, edits) {
  let cfg = seesaw(o);
  const evs = [];
  let st = TC.seesawRelease(cfg), last = null;
  evs.push({ type: 'release', data: snap(cfg, st) });
  if (st.rest === 'level' || st.rest === 'scale') evs.push({ type: 'balance', data: snap(cfg, st) });
  const dt = 1 / 60;
  const todo = (edits || []).slice();
  for (let t = 0; t < 60; t += dt) {
    while (todo.length && t >= todo[0].t) {
      const e = todo.shift();
      const old = { M: cfg.M, p: cfg.p, L: cfg.L, H: cfg.H, items: cfg.items.map(x => Object.assign({}, x)), scale: cfg.scale };
      const why = placeProblem(cfg.items, e.add[0], e.add[1], !!e.add[2]);
      if (why) throw new Error(why);
      cfg = Object.assign({}, cfg, { items: cfg.items.concat([{ id: 'i' + (nextId++), kind: e.add[0], m: K[e.add[0]].m, x: e.add[1], hang: !!e.add[2] }]) });
      st = TC.seesawEdit(old, cfg, st);
      if (st.rest === 'level' || st.rest === 'scale') evs.push({ type: 'balance', data: snap(cfg, st) });
    }
    const moving = st.rest ? !TC.stays(cfg, st) : true;
    if (!moving && !todo.length) break;
    if (!moving) continue;
    const r = TC.seesawAdvance(cfg, st, dt);
    st = r.st;
    r.events.forEach(e => {
      if (e.type === 'land') { evs.push({ type: 'land', data: snap(cfg, st, { side: e.side, vEnd: e.vEnd, omegaHit: e.omega, tRun: e.tRun, prevSide: last }) }); last = e.side; }
      if (e.type === 'catch' && st.rest === 'scale') evs.push({ type: 'balance', data: snap(cfg, st) });
    });
  }
  return evs;
}

// ---------- 梯子 ----------
const LDEF = { th: 60, mu: 0.4, ml: 15, mp: 60, d: 0.5, muw: 0, rough: false };
function lp(s) { return { L: LL, ml: s.ml, mp: s.mp, d: s.mp > 0 ? s.d : 0, theta: s.th * D2R, mu: s.mu, muw: s.rough ? s.muw : 0 }; }
function lsnap(s, extra) { return Object.assign(TC.ladderSnapshot(lp(s)), extra || {}); }
/** 按「放手」；climb 為真時接著按「往上爬」 */
function runLadder(o, climb) {
  const s = Object.assign({}, LDEF, o);
  const evs = [];
  const r = TC.ladderStatics(lp(s));
  if (r.slips) { evs.push({ type: 'ladderSlip', data: lsnap(s, { cause: 'release', climbFrom: null }) }); return evs; }
  evs.push({ type: 'ladderStand', data: lsnap(s, { cause: 'release' }) });
  if (!climb || !(s.mp > 0) || s.d >= LL) return evs;
  const from = s.d, dt = 1 / 60;
  for (;;) {
    const dSlip = TC.ladderSlipD(lp(s));
    const dn = s.d + 0.4 * dt;
    if (isFinite(dSlip) && dSlip >= s.d - 1e-9 && dSlip <= Math.min(dn, LL)) {
      s.d = Math.max(s.d, dSlip);
      evs.push({ type: 'ladderSlip', data: lsnap(s, { cause: 'climb', climbFrom: from }) });
      return evs;
    }
    if (dn >= LL) { s.d = LL; evs.push({ type: 'ladderStand', data: lsnap(s, { cause: 'climb' }) }); return evs; }
    s.d = dn;
  }
}

// ---------- 判定 ----------
function feed(events) {
  const got = [];
  events.forEach(ev => missions.forEach(m => { if (!m.done && m.check(ev, m.mem)) { m.done = true; got.push(m.id); } }));
  return got;
}
function reset() { missions.forEach(m => { m.done = false; m.mem = {}; }); }
const f = (x, d) => (Math.round(x * Math.pow(10, d)) / Math.pow(10, d)).toString();
function uiCheck(o) {
  const bad = [];
  Object.keys(o).forEach(k => { if (k === 'items' || k === 'scale' || k === 'rough') return; const u = uiKind(k, o[k]); if (u !== 'slider' && u !== 'typed') bad.push(u); });
  return bad;
}

let ok = true;
// ---------- 0. 預設狀態 ----------
{
  const cases = [
    ['蹺蹺板預設值按「放開」', () => runSeesaw({}), []],
    ['蹺蹺板預設值 M = 0（輕桿）按「放開」', () => runSeesaw({ M: 0 }), []],
    ['梯子預設值按「放手」', () => runLadder({}), []],
    ['梯子預設值按「往上爬」（人爬到 d ≈ 2.96 m 滑倒；這正是任務 2）', () => runLadder({}, true), ['torque-balance-2']]
  ];
  cases.forEach(c => {
    reset();
    const got = feed(c[1]());
    const pass = got.length === c[2].length && c[2].every(id => got.includes(id));
    ok = ok && pass;
    console.log((pass ? '✓ ' : '✗ ') + c[0] + ' → 完成 ' + (got.join('、') || '（無）'));
  });
  console.log('  （沒有按「放開／放手／往上爬」就沒有任何事件；切換分頁、拖滑桿、放物體都不會回報）');
}

// ---------- 1. 每個任務的解 ----------
const SOL = {
  'torque-balance-1': [['s', { items: [['w1', 3]] }]],
  'torque-balance-2': [['l', { th: 20 }]],
  'torque-balance-3': [['s', { items: [['adult', 1.5], ['child', 3.5]] }]],
  'torque-balance-4': [['s', { items: [['w5', 1], ['w2', 3.5], ['w1', 4]] }]],
  'torque-balance-5': [['s', { items: [['w2', 1, 1], ['w1', 4]] }]],
  'torque-balance-6': [['s', { p: 1, items: [['child', 1.25]], scale: 4 }]],
  'torque-balance-7': [['l', { mp: 0, mu: 0.4, th: 51.5 }]],
  'torque-balance-8': [['s', { M: 5, p: 1.5, items: [['w5', 1]] }]],
  'torque-balance-9': [['s', { M: 20, items: [['adult', 0], ['adult', 4], ['w1', 2.25]] }]],
  'torque-balance-10': [['l', { mp: 0, mu: 0.5, muw: 0.5, rough: true, th: 37 }]],
  'torque-balance-11': [['l', { th: 60, mu: 0.52, ml: 15, mp: 60, d: 4 }]],
  'torque-balance-12': [['lc', { th: 58, mu: 0.5, ml: 40, mp: 40, d: 0 }], ['lc', { th: 58, mu: 0.5, ml: 40, mp: 100, d: 0.5 }]],
  'torque-balance-h1': [['s', { M: 8, p: 1, scale: 2 }]],
  'torque-balance-h2': [['s', { items: [['w1', 3]] }, [{ t: 3, add: ['w5', 0.5] }]]],
  'torque-balance-h3': [['l', { th: 15, mu: 0.4, ml: 15, mp: 60, d: 0 }]]
};
function run(step) {
  if (step[0] === 's') return runSeesaw(step[1], step[2]);
  return runLadder(step[1], step[0] === 'lc');
}
function describe(step, evs) {
  const o = step[1];
  let s;
  if (step[0] === 's') {
    s = 'M = ' + (o.M == null ? 5 : o.M) + ' kg、p = ' + (o.p == null ? 2 : o.p) + ' m';
    (o.items || []).forEach(a => { s += '、' + a[0] + ' 在 ' + a[1] + (a[2] ? '（吊）' : ''); });
    if (o.scale != null) s += '、彈簧秤在 ' + o.scale;
    (step[2] || []).forEach(e => { s += '、放開 ' + e.t + ' s 後加 ' + e.add[0] + ' 在 ' + e.add[1]; });
  } else {
    const q = Object.assign({}, LDEF, o);
    s = 'θ = ' + q.th + '°、μs = ' + q.mu + (q.rough ? '、μw = ' + q.muw : '、光滑牆') + '、梯子 ' + q.ml + ' kg、人 ' + q.mp + ' kg 在 d = ' + q.d + (step[0] === 'lc' ? '，放手後往上爬' : '');
  }
  const last = evs[evs.length - 1], d = last.data;
  if (last.type === 'balance') s += ' → 平衡' + (d.byScale ? '（彈簧秤 F = ' + f(d.F, 3) + ' N）' : '') + '、N = ' + f(d.N, 3) + ' N';
  else if (last.type === 'land') s += ' → ' + (d.side === 'L' ? '左' : '右') + '端碰地、tRun = ' + f(d.tRun, 3) + ' s' + (d.prevSide ? '（前一次 ' + d.prevSide + '）' : '');
  else if (last.type === 'ladderStand') s += ' → 站得住（θc = ' + f(d.thetaC, 3) + '°、μmin = ' + f(d.muMin, 4) + (d.top ? '、在頂端' : '') + '）';
  else s += ' → 滑倒' + (d.cause === 'climb' ? '於 d = ' + f(d.d, 3) + ' m' : '') + '（θc = ' + f(d.thetaC, 3) + '°）';
  return s;
}
for (const m of missions) {
  const runs = SOL[m.id];
  if (!runs) { ok = false; console.log('✗ ' + m.id.padEnd(18) + ' 沒有提供解'); continue; }
  const bad = [];
  runs.forEach(st => bad.push.apply(bad, uiCheck(st[1])));
  reset();
  let evsAll = [], descs = [], err = null;
  try {
    runs.forEach(st => { const evs = run(st); evsAll = evsAll.concat(evs); descs.push(describe(st, evs)); });
  } catch (e) { err = e.message; }
  const pass = !bad.length && !err && feed(evsAll).includes(m.id);
  ok = ok && pass;
  console.log((pass ? '✓ ' : '✗ ') + m.id.padEnd(18) + ' ' + String(m.level).padStart(2) + '★' + (m.hidden ? '（隱藏）' : '') + '  ' +
    descs.join('；') + (bad.length ? '  ' + bad.join('；') : '') + (err ? '  錯誤：' + err : ''));
}

// ---------- 2. 幾個不該通過的對照 ----------
{
  const neg = [
    ['任務 7：比臨界角大 0.6°（51.94°）不算', 'torque-balance-7', [['l', { mp: 0, mu: 0.4, th: 51.94 }]]],
    ['任務 9：同樣的不平衡、沒有兩端的大人時很快碰地', 'torque-balance-9', [['s', { M: 20, items: [['w1', 2.25]] }]]],
    ['任務 11：μs 比最小值大 0.03 不算', 'torque-balance-11', [['l', { th: 60, mu: 0.55, ml: 15, mp: 60, d: 4 }]]],
    ['任務 12：輕的人在 θ = 55°（< 56.31°）爬不到頂端', 'torque-balance-12', [['lc', { th: 55, mu: 0.5, ml: 40, mp: 40, d: 0 }], ['lc', { th: 55, mu: 0.5, ml: 40, mp: 100, d: 0.5 }]]],
    ['任務 12：兩次的角度不同不算', 'torque-balance-12', [['lc', { th: 58, mu: 0.5, ml: 40, mp: 40, d: 0 }], ['lc', { th: 58.5, mu: 0.5, ml: 40, mp: 100, d: 0.5 }]]],
    ['隱藏 h3：沒有人、光滑牆 μs = 1 最低只到 26.57°', 'torque-balance-h3', [['l', { th: 19.9, mu: 1, mp: 0 }]]]
  ];
  neg.forEach(c => {
    reset();
    let evs = [];
    c[2].forEach(st => { evs = evs.concat(run(st)); });
    const got = feed(evs);
    const pass = !got.includes(c[1]);
    ok = ok && pass;
    console.log((pass ? '✓ ' : '✗ ') + c[0]);
  });
}

console.log(ok ? '全部任務都可達成' : '有任務無法達成');
process.exitCode = ok ? 0 : 1;
