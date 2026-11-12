/* 任務可達成的證明腳本（一維碰撞）。用法：node tools/mission-proofs/collision.js
 * 修改物理核心或任務條件後重跑，確認每個任務仍然做得到、預設狀態不會觸發任務。
 * 做法：只用物理核心 js/collision-core.js，照頁面 js/collision.js 的 setup()（車長、起始位置、
 * 彈簧太軟時加長自然長度）建立模擬，動畫跨過「碰撞結束」時 emitCollision() 回報 'collision'，
 * 組出完全相同的事件資料，丟進 js/missions/collision.js 的檢查函式。
 * 所有輸入都在 collision.html 的範圍內：m 0.5–10、v −5～5（滑桿間隔 0.5，打字到小數 2 位）、
 * e 0–1（間隔 0.05，打字 2 位）、k 20–2000 N/m（對數滑桿取 2 位有效數字，打字可輸入任意整數）。 */
'use strict';
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const CC = require(__ROOT + 'js/collision-core.js');
const missions = [];
global.window = { CollisionCore: CC, LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(__ROOT + 'js/missions/collision.js');

// ---------- 介面允許的值（collision.html、js/collision.js） ----------
const near = (a, b) => Math.abs(a - b) < 1e-9;
const onStep = (v, min, step) => near(Math.round((v - min) / step) * step + min, v);
const decOK = (v, dec) => near(Math.round(v * Math.pow(10, dec)) / Math.pow(10, dec), v);
function kFromSlider(v) { // 與頁面相同：對數刻度 20–2000 N/m，取兩位有效數字
  const k = 20 * Math.pow(100, v / 100);
  const p = Math.pow(10, Math.floor(Math.log10(k)) - 1);
  return Math.round(k / p) * p;
}
const K_SLIDER = [];
for (let pos = 0; pos <= 100; pos += 2) K_SLIDER.push(kFromSlider(pos));
const RANGE = {
  m1: { min: 0.5, max: 10, step: 0.5, dec: 2 }, m2: { min: 0.5, max: 10, step: 0.5, dec: 2 },
  v1: { min: -5, max: 5, step: 0.5, dec: 2 }, v2: { min: -5, max: 5, step: 0.5, dec: 2 },
  e: { min: 0, max: 1, step: 0.05, dec: 2 }
};
function uiKind(name, v) {
  if (name === 'k') {
    if (K_SLIDER.some(x => near(x, v))) return 'slider';
    return v >= 20 && v <= 2000 && decOK(v, 0) ? 'typed' : 'k = ' + v + ' 超出介面範圍';
  }
  const r = RANGE[name];
  if (!r) return 'slider'; // 勾選框
  if (!(v >= r.min - 1e-12 && v <= r.max + 1e-12)) return name + ' = ' + v + ' 超出滑桿範圍';
  if (onStep(v, r.min, r.step)) return 'slider';
  return decOK(v, r.dec) ? 'typed' : name + ' = ' + v + ' 超過打字精度';
}

// ---------- 照頁面的 setup() 建立模擬、emitCollision() 組事件 ----------
const L = 12, XC = L / 2, MARGIN = 0.3, LEAD = 2, SPRING_L0 = 1;
function cartWidth(m) { return 0.6 + 0.3 * Math.cbrt(m); }
const DEFAULT = { m1: 2, m2: 3, v1: 3, v2: -1, e: 1, spring: false, k: 200, cmFrame: false, slow: false }; // 頁面的初始 state
const PRESETS = { // 頁面的預設情境按鈕
  elastic: { m1: 2, m2: 3, v1: 3, v2: -1, e: 1 },
  inelastic: { m1: 2, m2: 3, v1: 3, v2: -1, e: 0 },
  swap: { m1: 2, m2: 2, v1: 3, v2: 0, e: 1 },
  heavy: { m1: 6, m2: 1, v1: 3, v2: 0, e: 1 },
  light: { m1: 1, m2: 6, v1: 3, v2: 0, e: 1 }
};
/** o：要改的設定（其餘取預設）。按「播放」直到碰撞結束；有碰撞就傳回 'collision' 事件，否則 null */
function play(o) {
  const st = Object.assign({}, DEFAULT, o), p = st, spring = st.spring;
  const w1 = cartWidth(p.m1), w2 = cartWidth(p.m2);
  const approach = CC.approaching(p.v1, p.v2);
  let L0 = spring ? SPRING_L0 : 0;
  if (spring && approach) {
    const xmax = CC.springContact(p.m1, p.m2, p.v1, p.v2, st.k).xmax;
    if (xmax > 0.8 * L0) L0 = xmax / 0.8;
  }
  let x1, x2;
  if (approach) {
    const c1 = XC - L0 / 2 - w1 / 2, c2 = XC + L0 / 2 + w2 / 2;
    let T0 = LEAD;
    [[c1, p.v1, w1], [c2, p.v2, w2]].forEach(a => {
      const c = a[0], v = a[1], w = a[2], lo = MARGIN + w / 2, hi = L - MARGIN - w / 2;
      if (v > 0) T0 = Math.min(T0, (c - lo) / v);
      else if (v < 0) T0 = Math.min(T0, (hi - c) / -v);
    });
    T0 = Math.max(T0, 0.3);
    x1 = c1 - p.v1 * T0; x2 = c2 - p.v2 * T0;
  } else {
    x1 = XC - 1.2 - w1 / 2; x2 = XC + 1.2 + w2 / 2;
  }
  const sim = CC.createSim({ m1: p.m1, m2: p.m2, v1: p.v1, v2: p.v2, e: p.e, w1: w1, w2: w2, x1: x1, x2: x2, k: spring ? st.k : 0, L0: L0 });
  const s = CC.summary(p.m1, p.m2, p.v1, p.v2, sim.e);
  if (!isFinite(sim.tr)) return null; // 不會碰撞：動畫永遠不會跨過 sim.tr，不回報
  const c = sim.contact;
  return {
    type: 'collision', input: st, data: {
      m1: sim.m1, m2: sim.m2, v1: sim.v1, v2: sim.v2, e: sim.e, eSet: p.e,
      spring: sim.spring, k: sim.k,
      v1f: sim.after.v1, v2f: sim.after.v2, vcm: s.vcm,
      p: s.before.p, pAfter: s.after.p, K: s.before.K, KAfter: s.after.K,
      lost: s.lost, lostFrac: s.before.K > 0 ? s.lost / s.before.K : 0, eMeasured: s.eMeasured,
      cmFrame: st.cmFrame, slow: st.slow,
      dt: c ? c.dt : null, xmax: c ? c.xmax : null, Fmax: c ? c.Fmax : null, J: c ? c.J : null, Umax: c ? c.Umax : null
    }
  };
}
function feed(events) {
  const got = [];
  events.forEach(ev => { if (ev) missions.forEach(m => { if (!m.done && m.check(ev, m.mem)) { m.done = true; got.push(m.id); } }); });
  return got;
}
function reset() { missions.forEach(m => { m.done = false; m.mem = {}; }); }
const f = (x, d) => (Math.round(x * Math.pow(10, d)) / Math.pow(10, d)).toString();
function describe(ev) {
  const st = ev.input, d = ev.data;
  const tag = (name, v) => uiKind(name, v) === 'typed' ? '（打字）' : '';
  let s = 'm1 = ' + st.m1 + tag('m1', st.m1) + '、m2 = ' + st.m2 + tag('m2', st.m2) + '、v1 = ' + st.v1 + tag('v1', st.v1) + '、v2 = ' + st.v2 + tag('v2', st.v2);
  s += st.spring ? '、加彈簧 k = ' + st.k + tag('k', st.k) : '、e = ' + st.e + tag('e', st.e);
  if (st.cmFrame) s += '、勾選質心參考系';
  s += ' → v1′ = ' + f(d.v1f, 4) + '、v2′ = ' + f(d.v2f, 4);
  if (d.spring) s += '、Δt = ' + f(d.dt, 4) + ' s、x_max = ' + f(d.xmax, 4) + ' m、F_max = ' + f(d.Fmax, 3) + ' N、J = ' + f(d.J, 4) + ' N·s';
  else s += '、動能損失 ' + f(d.lostFrac * 100, 2) + '%';
  if (st.cmFrame) s += '、v_cm = ' + f(d.vcm, 3);
  return s;
}

let ok = true;
// ---------- 0. 預設狀態 ----------
// 不按「播放」就沒有事件；用預設值（及五個預設情境按鈕）各播放一次只完成 collision-1（按播放讓兩車相撞，本來就是這樣設計）
{
  const cases = [['預設值', {}], ['預設值＋加彈簧', { spring: true }]].concat(Object.keys(PRESETS).map(k => ['預設情境「' + k + '」', PRESETS[k]]));
  cases.forEach(c => {
    reset();
    const got = feed([play(c[1])]);
    const pass = got.length === 1 && got[0] === 'collision-1';
    ok = ok && pass;
    console.log((pass ? '✓ ' : '✗ ') + c[0] + '播放一次 → 只完成 ' + (got.join('、') || '（無）'));
  });
}

// ---------- 1. 每個任務的解 ----------
const SOL = {
  'collision-1': [{}],
  'collision-2': [{ m1: 2, m2: 2, v1: 3, v2: -1, e: 1 }],
  'collision-3': [{ m1: 2, m2: 3, v1: 5, v2: 0, cmFrame: true }],
  'collision-4': [{ m1: 1, m2: 3, v1: 2, v2: 0, e: 0 }],
  'collision-5': [{ m1: 1, m2: 3, v1: 4, v2: 0, e: 1 }],
  'collision-6': [{ m1: 1, m2: 2, v1: 3, v2: 0, e: 0.5 }],
  'collision-7': [{ m1: 1, m2: 4, v1: 3, v2: 0, e: 0.5 }],
  'collision-8': [{ m1: 5.5, m2: 10, v1: 2, v2: 0, spring: true, k: 35 }],
  'collision-9': [{ m1: 2.5, m2: 2.5, v1: 3, v2: -3, spring: true, k: 500 }],
  'collision-10': [{ m1: 2, m2: 5, v1: 4, v2: 0, e: 0.75 }],
  'collision-11': [{ m1: 1, m2: 1, v1: 4, v2: -4, spring: true, k: 20 }, { m1: 4, m2: 4, v1: 1, v2: -1, spring: true, k: 80 }],
  'collision-12': [{ m1: 5.07, m2: 5.07, v1: 3.14, v2: 0, spring: true, k: 100 }],
  'collision-h1': [{ v1: 2.5, v2: 2 }],
  'collision-h2': [{ m1: 2, m2: 3, v1: 3, v2: -2, e: 0 }],
  'collision-h3': [{ m1: 10, m2: 0.5, v1: 3, v2: 0, e: 1 }]
};
for (const m of missions) {
  const runs = SOL[m.id];
  if (!runs) { ok = false; console.log('✗ ' + m.id.padEnd(13) + ' ' + String(m.level).padStart(2) + '★  沒有提供解'); continue; }
  const bad = [];
  runs.forEach(o => Object.keys(o).forEach(k => { const u = uiKind(k, o[k]); if (u !== 'slider' && u !== 'typed') bad.push(u); }));
  reset();
  const evs = runs.map(play);
  const pass = !bad.length && evs.every(Boolean) && feed(evs).includes(m.id);
  ok = ok && pass;
  console.log((pass ? '✓ ' : '✗ ') + m.id.padEnd(13) + ' ' + String(m.level).padStart(2) + '★' + (m.hidden ? '（隱藏）' : '') + '  ' +
    evs.filter(Boolean).map(describe).join('；') + (bad.length ? '  ' + bad.join('；') : ''));
}

// ---------- 2. 做一般任務時常見的同向追撞，不可順手完成 h1（11/12 Codex 盲試回報） ----------
[
  ['質心參考系（任務 3）：v1 = 3、v2 = 1', { m1: 2, m2: 3, v1: 3, v2: 1, cmFrame: true }],
  ['質心參考系（任務 3）：v1 = 5、v2 = 1', { m1: 2, m2: 3, v1: 5, v2: 1, cmFrame: true }],
  ['速度交換（任務 2）同向：v1 = 3、v2 = 1', { m1: 2, m2: 2, v1: 3, v2: 1, e: 1 }],
  ['速度交換（任務 2）同向：v1 = 4、v2 = 2', { m1: 2, m2: 2, v1: 4, v2: 2, e: 1 }],
  ['向左追撞：v1 = −1、v2 = −3', { v1: -1, v2: -3 }]
].forEach(c => {
  reset();
  const got = feed([play(c[1])]);
  const pass = !got.includes('collision-h1');
  ok = ok && pass;
  console.log((pass ? '✓ ' : '✗ ') + c[0] + ' → 不完成 h1（完成：' + (got.join('、') || '無') + '）');
});

console.log(ok ? '全部任務都可達成' : '有任務無法達成');
process.exitCode = ok ? 0 : 1;
