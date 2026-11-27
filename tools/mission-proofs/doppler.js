/* 任務可達成的證明腳本（從製作時的暫存資料夾保存下來的快照）。用法：node tools/mission-proofs/doppler.js
 * 修改物理核心或任務條件後重跑，確認每個任務仍然做得到、預設狀態不會觸發任務。 */
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
// 用物理核心證明每個任務都做得到（模擬頁面的逐幀邏輯）
const DC = require(__ROOT + 'js/doppler-core.js');
const WX = 1400;
function P(o) {
  return { f: o.f || 2, v: o.v || 340, tStart: 0, src: { x: o.sx, y: 0, vx: o.vs, vy: 0 }, obs: { x: o.ox, y: o.oy, vx: o.vo || 0, vy: 0, t0: 0 } };
}
/** 模擬一趟：傳回 boom 時刻、統計 */
function run(o, dt) {
  dt = dt || 1 / 60;
  const p = P(o);
  let t = 0, prev = null;
  const r = { ratioMax: -Infinity, ratioMin: Infinity, heardTime: 0, tBoom: null, two: false, minDist: Infinity, theta: null };
  for (let i = 0; i < 200000; i++) {
    t += dt;
    const arr = DC.arrivals(p, t);
    if (prev && arr.length > prev.length && prev.length === 0 && o.vs >= (o.v || 340) && (arr.length === 2 || Math.abs(arr[0].fp) > 5 * p.f) && r.tBoom == null) {
      let lo = t - dt, hi = t;
      for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (DC.arrivals(p, m).length) hi = m; else lo = m; }
      r.tBoom = hi; r.theta = DC.machAngle(p.v, o.vs) * 180 / Math.PI;
    }
    if (arr.length) { const q = arr[0].fp / p.f; r.ratioMax = Math.max(r.ratioMax, q); r.ratioMin = Math.min(r.ratioMin, q); r.heardTime += dt; if (arr.length === 2) r.two = true; }
    const S = DC.sourceAt(p, t), O = DC.observerAt(p, t);
    r.minDist = Math.min(r.minDist, Math.hypot(O.x - S.x, O.y - S.y));
    prev = arr;
    if (o.vs > 0 && S.x > WX / 2 + 0.45 * WX) break;
    if ((o.vo || 0) !== 0 && Math.abs(O.x) > WX / 2 - 8) break;
    if (t > 120) break;
  }
  r.tEnd = t;
  return r;
}
function at(o, t) { const a = DC.arrivals(P(o), t); return { n: a.length, ratio: a[0] ? a[0].fp / (o.f || 2) : null, fp2: a[1] ? a[1].fp : null }; }
/** 找出 cond(t) 成立的時間區間（模擬時間） */
function windowOf(o, cond, t0, t1, h) {
  let first = null, last = null;
  for (let t = t0; t <= t1; t += h) if (cond(at(o, t))) { if (first == null) first = t; last = t; }
  return first == null ? null : [first, last];
}
const out = (k, v) => console.log(k.padEnd(12), JSON.stringify(v));

// 1：波源靠近預設，暫停時 f′/f > 1.01
const appr = { vs: 120, sx: -560, ox: 250, oy: -150 };
out('L1', windowOf(appr, (m) => m.n && m.ratio > 1.01, 0, 15, 0.01));
// 2：觀察者移動預設，v_o 改成 −120：f′/f ≥ 1.30
const obsm = { vs: 0, sx: -250, ox: 560, oy: -150, vo: -120 };
out('L2', windowOf(obsm, (m) => m.n && m.ratio >= 1.3, 0, 12, 0.01));
// 3：λ前 = (340 − 140)/2 = 100 m
out('L3', DC.wavelengthAhead(2, 340, 140));
// 4：讓波源以聲速前進，用一趟完整運動驗證觀察者接收到音爆。
{
  let missions;
  global.window = { LabMission: { register: (_, list) => { missions = list; } } };
  global.LabMission = window.LabMission;
  require(__ROOT + 'js/missions/doppler.js');
  const m = missions.find(entry => entry.id === 'doppler-4'), mem = {};
  const heard = v => {
    const o = { v, vs: v, vo: 0, sx: -600, ox: 200, oy: -170 };
    const r = run(o);
    if (r.tBoom == null) throw new Error('模擬沒有產生音爆：' + v + ' m/s');
    return { type: 'boom', data: { ...o, clean: true, tBoom: r.tBoom } };
  };
  if (!m.check(heard(340), mem)) throw Error(m.id);
  // 1：波源朝觀察者駛來（us > 0）應通過；波源已遠離（us < 0）但觀察者高速追趕導致 f′/f > 1.01 不應通過
  const m1 = missions.find(entry => entry.id === 'doppler-1');
  const aOk = DC.arrivals(P(appr), 2.5)[0];
  if (!aOk || !m1.check({ type: 'measure', data: { n: 1, vs: appr.vs, us: aOk.us, ratio: aOk.fp / 2 } }, {})) {
    throw Error('doppler-1 正例應通過');
  }
  const chase = { vs: 120, sx: 200, ox: -250, oy: -50, vo: 220 };
  const aChase = DC.arrivals(P(chase), 2.0)[0];
  if (!aChase || !(aChase.fp / 2 > 1.01) || !(aChase.us < 0)) {
    throw Error('doppler-1 反例條件未成立');
  }
  if (m1.check({ type: 'measure', data: { n: 1, vs: chase.vs, us: aChase.us, ratio: aChase.fp / 2 } }, {})) {
    throw Error('doppler-1 反例：波源遠離但觀察者追趕升調不應通過');
  }
}
