/* 任務可達成的證明腳本（行星軌道與克卜勒定律）。用法：node tools/mission-proofs/kepler.js
 * 修改物理核心或任務條件後重跑，確認每個任務仍然做得到、預設狀態不會觸發任務。
 * 做法：只用物理核心 js/kepler-core.js，照頁面 js/kepler.js 的方式發射（launch()：sig 相同不重記、
 * 封閉且不撞的軌道寫進第三定律紀錄 → 'record'；orbitData() 組事件資料），並照 tick() 的條件產生
 * 'lap'（繞滿一圈）、'escape'（開放軌道飛出畫面）、'crash'（撞上中心天體），丟進 js/missions/kepler.js 的檢查函式。
 * 載入頁面與切換天體時的自動發射 user = false，不回報任何事件。
 * 所有輸入都在 kepler.html 的範圍內：M 0.2–3（間隔 0.05）；太陽 r0 0.3–2.5 AU（間隔 0.01，打字 3 位）、
 * v0 2–120 km/s（間隔 0.1，打字 2 位）；地球 r0 6 700–60 000 km（間隔 10，打字到 1 km）、v0 0.5–25 km/s
 * （間隔 0.01，打字 3 位）；α −85°～85°（間隔 1°）；「v0 = v圓」「v0 = v脫」按鈕直接設成圓周／脫離速率。 */
'use strict';
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const K = require(__ROOT + 'js/kepler-core.js');
const missions = [];
global.window = { KeplerCore: K, LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(__ROOT + 'js/missions/kepler.js');
const DEG = Math.PI / 180;

// ---------- 頁面的天體設定（js/kepler.js 的 PRESETS） ----------
const PRESETS = {
  sun: {
    mu: K.GM_SUN, R: K.R_SUN, Lu: K.AU, vwMax: 40,
    M: { min: 0.2, max: 3, step: 0.05, dec: 2, def: 1 }, r0: { min: 0.3, max: 2.5, step: 0.01, dec: 3, def: 1 },
    v0: { min: 2, max: 120, step: 0.1, dec: 2, def: 35 }, al: { min: -85, max: 85, step: 1, dec: 1, def: 0 }
  },
  earth: {
    mu: K.GM_EARTH, R: K.R_EARTH, Lu: 1000, vwMax: 400000,
    M: { min: 0.2, max: 3, step: 0.05, dec: 2, def: 1 }, r0: { min: 6700, max: 60000, step: 10, dec: 0, def: 9000 },
    v0: { min: 0.5, max: 25, step: 0.01, dec: 3, def: 8 }, al: { min: -85, max: 85, step: 1, dec: 1, def: 0 }
  }
};
const near = (a, b) => Math.abs(a - b) < 1e-9;
const onStep = (v, min, step) => near(Math.round((v - min) / step) * step + min, v);
const decOK = (v, dec) => near(Math.round(v * Math.pow(10, dec)) / Math.pow(10, dec), v);
function uiKind(preset, name, v) {
  const r = PRESETS[preset][name];
  if (!(v >= r.min - 1e-12 && v <= r.max + 1e-12)) return name + ' = ' + v + ' 超出滑桿範圍';
  if (onStep(v, r.min, r.step)) return 'slider';
  return decOK(v, r.dec) ? 'typed' : name + ' = ' + v + ' 超過打字精度';
}

// ---------- 模擬頁面的一個工作階段 ----------
function session() {
  const S = { preset: 'sun', history: [], flightSig: null, launches: 0 };
  /** 切換天體（頁面載入時也是 applyPreset('sun') + launch(true)）：清除紀錄、滑桿回預設、自動發射一次 */
  S.switchTo = function (name) {
    S.preset = name; S.history = []; S.flightSig = null; S.launches = 0;
    const pr = PRESETS[name];
    launchOne({ M: pr.M.def, r0: pr.r0.def, v0: pr.v0.def, alpha: 0 }, true);
  };
  /** 按「發射」：c = { M, r0（AU 或 km）, v0（km/s）或 snap: 'circ'|'esc', alpha（度）, sectors } */
  function launchOne(c, auto) {
    const pr = PRESETS[S.preset];
    const M = c.M == null ? pr.M.def : c.M, mu = pr.mu * M;
    const r0 = (c.r0 == null ? pr.r0.def : c.r0) * pr.Lu;
    const alpha = (c.alpha || 0) * DEG;
    const v0 = c.snap === 'circ' ? K.circularSpeed(mu, r0) : c.snap === 'esc' ? K.escapeSpeed(mu, r0) : (c.v0 == null ? pr.v0.def : c.v0) * 1000;
    const sig = [S.preset, M, r0, 0, v0, alpha].join('|'); // 頁面的 launchSig()（phi0 = 0）
    const s = K.launchState(r0, 0, v0, alpha);
    const el = K.elementsFromState(mu, s.x, s.y, s.vx, s.vy);
    const crashT = K.crashTime(el, pr.R);
    const same = S.flightSig === sig;
    if (!same) S.launches++;
    S.flightSig = sig;
    const f = { el: el, t: 0, crashT: crashT, M: M, user: !auto, r0: r0, v0: v0, alpha: alpha, preset: S.preset, sectors: !!c.sectors };
    const out = [];
    let recorded = false;
    if (!same && el.e < 1 && el.type !== 'parabola' && crashT == null) {
      S.history.push({ M: M, a: el.a, T: el.T, e: el.e, user: !auto });
      while (S.history.length > 12) S.history.shift();
      recorded = true;
    }
    if (auto) return out;
    out.push({ type: 'launch', data: orbitData(f) });
    if (recorded) out.push({ type: 'record', data: { list: S.history.filter(h => h.user).map(h => ({ preset: S.preset, M: h.M, a: h.a, T: h.T, e: h.e })) } });
    // 接著讓動畫跑下去（tick）
    if (crashT != null) { f.t = crashT; out.push({ type: 'crash', data: orbitData(f) }); }
    else if (isFinite(el.T)) { f.t = el.T; out.push({ type: 'lap', data: orbitData(f) }); } // 第一次跨過 t = T
    else {
      // 開放軌道：確認它一直往外、遠遠超出最大的畫面（視野上限 vwMax 的 10 倍）才算飛出畫面
      const far = 10 * pr.vwMax * pr.Lu;
      let t = 1, st = K.stateAt(el, t);
      for (let i = 0; i < 200 && !(st.r > far && st.x * st.vx + st.y * st.vy > 0); i++) { t *= 2; st = K.stateAt(el, t); }
      if (st.r > far) { f.t = t; out.push({ type: 'escape', data: orbitData(f) }); }
    }
    out.forEach(ev => { ev.input = c; ev.preset = S.preset; ev.el = el; });
    return out;
  }
  /** 頁面的 orbitData(f) */
  function orbitData(f) {
    const el = f.el, closed = el.e < 1 && el.type !== 'parabola';
    const vc = K.circularSpeed(el.mu, f.r0);
    return {
      preset: f.preset, M: f.M, r0: f.r0, v0: f.v0, vRel: f.v0 / vc, alpha: f.alpha / DEG,
      e: el.e, type: el.type, closed: closed, crash: f.crashT != null,
      a: el.a, T: el.T, rp: el.rp, ra: el.ra, energy: el.energy, h: el.h,
      aAU: el.a / K.AU, Tyr: el.T / K.YEAR, Th: el.T / 3600, Tmin: el.T / 60, rpKm: el.rp / 1000, raKm: el.ra / 1000,
      laps: closed ? Math.floor(f.t / el.T + 1e-9) : 0, t: f.t, sectors: f.sectors
    };
  }
  S.launch = c => launchOne(c, false);
  S.switchTo('sun');
  return S;
}

function feed(events) {
  const got = [];
  events.forEach(ev => missions.forEach(m => { if (!m.done && m.check(ev, m.mem)) { m.done = true; got.push(m.id); } }));
  return got;
}
function reset() { missions.forEach(m => { m.done = false; m.mem = {}; }); }
const f = (x, d) => (Math.round(x * Math.pow(10, d)) / Math.pow(10, d)).toString();
/** 一次發射的輸入與結果 */
function describe(c, evs) {
  const ev = evs[0], pr = PRESETS[ev.preset], el = ev.el, sun = ev.preset === 'sun';
  const has = type => evs.some(x => x.type === type);
  const tag = (name, v) => uiKind(ev.preset, name, v) === 'typed' ? '（打字）' : '';
  const r0 = c.r0 == null ? pr.r0.def : c.r0;
  const parts = [sun ? '太陽' : '地球'];
  if (c.M != null && c.M !== 1) parts.push('M = ' + c.M + tag('M', c.M));
  parts.push('r0 = ' + r0 + (sun ? ' AU' : ' km') + tag('r0', r0));
  if (c.snap) parts.push(c.snap === 'circ' ? '按「v0 = v圓」' : '按「v0 = v脫」');
  else { const v = c.v0 == null ? pr.v0.def : c.v0; parts.push('v0 = ' + v + ' km/s' + tag('v0', v)); }
  if (c.alpha) parts.push('α = ' + c.alpha + '°' + tag('al', c.alpha));
  if (c.sectors) parts.push('勾選等時間扇形');
  let res = 'e = ' + f(el.e, 4);
  if (el.e < 1 && el.type !== 'parabola') {
    res += sun ? '、T = ' + f(el.T / K.YEAR, 4) + ' 年' : '、T = ' + f(el.T / 60, 2) + ' min（' + f(el.T / 3600, 3) + ' h）';
    res += sun ? '、rp = ' + f(el.rp / K.AU, 3) + ' AU' : '、rp = ' + f(el.rp / 1000, 1) + ' km、ra = ' + f(el.ra / 1000, 1) + ' km';
  } else res += '（' + (el.type === 'hyperbola' ? '雙曲線' : '拋物線') + '）';
  res += has('crash') ? '，撞上中心天體' : has('lap') ? '，繞完一圈' : has('escape') ? '，飛出畫面' : '';
  return parts.join('、') + ' → ' + res;
}

let ok = true;
// ---------- 0. 預設狀態 ----------
// 不操作：載入頁面的自動發射 user = false，沒有任何事件。
// 用預設值按「發射」並等它繞一圈：只完成 kepler-1（發射）與 kepler-2（繞一圈），本來就是這樣設計；地球也一樣。
{
  reset();
  const S = session();
  const pass0 = feed([]).length === 0;
  console.log((pass0 ? '✓ ' : '✗ ') + '載入頁面（太陽）與切換到地球的自動發射不回報事件');
  const a = feed(S.launch({}));
  S.switchTo('earth');
  reset();
  const b = feed(S.launch({}));
  const want = ['kepler-1', 'kepler-2'];
  const pass = JSON.stringify(a) === JSON.stringify(want) && JSON.stringify(b) === JSON.stringify(want);
  ok = ok && pass0 && pass;
  console.log((pass ? '✓ ' : '✗ ') + '預設值發射（太陽 r0 = 1 AU、v0 = 35 km/s；地球 r0 = 9 000 km、v0 = 8 km/s）並繞一圈 → 只完成 ' +
    (a.join('、') || '（無）') + '／' + (b.join('、') || '（無）'));
}

// ---------- 1. 每個任務的解（[天體, 依序發射的設定...]） ----------
const SOL = {
  'kepler-1': ['sun', {}],
  'kepler-2': ['sun', {}],
  'kepler-3': ['sun', { snap: 'circ' }],
  'kepler-4': ['sun', { v0: 50 }],
  'kepler-5': ['earth', { r0: 7010, snap: 'circ' }],
  'kepler-6': ['earth', { r0: 42160, snap: 'circ' }],
  'kepler-7': ['sun', { r0: 0.4, snap: 'circ' }, { r0: 1, snap: 'circ' }, { r0: 2, snap: 'circ' }],
  'kepler-8': ['sun', { snap: 'circ' }, { snap: 'circ', alpha: 30 }],
  'kepler-9': ['sun', { r0: 0.5, v0: 58.4 }],
  'kepler-10': ['sun', { M: 2, r0: 1.26, snap: 'circ' }],
  'kepler-11': ['earth', { r0: 7000, v0: 9.883 }],
  'kepler-12': ['earth', { r0: 6700, v0: 7.62 }],
  'kepler-h1': ['sun', { v0: 38, sectors: true }],
  'kepler-h2': ['sun', { v0: 33.11 }],
  'kepler-h3': ['sun', { v0: 46.28 }]
};
for (const m of missions) {
  const sol = SOL[m.id];
  if (!sol) { ok = false; console.log('✗ ' + m.id.padEnd(10) + ' ' + String(m.level).padStart(2) + '★  沒有提供解'); continue; }
  const preset = sol[0], runs = sol.slice(1), bad = [];
  runs.forEach(c => ['M', 'r0', 'v0', 'al'].forEach(k => { const v = k === 'al' ? c.alpha : c[k]; if (v != null) { const u = uiKind(preset, k, v); if (u !== 'slider' && u !== 'typed') bad.push(u); } }));
  reset();
  const S = session();
  if (preset !== 'sun') S.switchTo(preset);
  const groups = runs.map(c => S.launch(c));
  const pass = !bad.length && feed([].concat.apply([], groups)).includes(m.id);
  ok = ok && pass;
  console.log((pass ? '✓ ' : '✗ ') + m.id.padEnd(10) + ' ' + String(m.level).padStart(2) + '★' + (m.hidden ? '（隱藏）' : '') + '  ' +
    groups.map((g, i) => describe(runs[i], g)).join('；') + (bad.length ? '  ' + bad.join('；') : ''));
}

console.log(ok ? '全部任務都可達成' : '有任務無法達成');
process.exitCode = ok ? 0 : 1;
