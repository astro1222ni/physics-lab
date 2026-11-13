/* 任務可達成的證明腳本。用法：node tools/mission-proofs/gps-trilateration.js（約半分鐘）
 * 修改核心或任務條件後重跑，確認每個任務都做得到、預設狀態不會觸發、隱藏任務彼此不會順便完成。
 * 事件 'gps' 的內容由 snap() 產生，和 js/gps-trilateration.js 的 snapshot() 相同。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const K = require(ROOT + 'js/gps-trilateration-core.js');
const missions = [];
global.window = { GpsCore: K, LabMission: { register: (id, list) => list.forEach(m => missions.push(m)) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/gps-trilateration.js');
const byId = id => missions.find(m => m.id === 'gps-trilateration-' + id);

let ok = 0, bad = 0;
function expect(label, cond, extra) {
  if (cond) { ok++; console.log('  ✓ ' + label + (extra ? '（' + extra + '）' : '')); }
  else { bad++; console.error('  ✗ ' + label + (extra ? '（' + extra + '）' : '')); }
}

// ---------- 和頁面相同的狀態與快照 ----------
const DEF = {
  mode: 'plane', view: 'globe', on: [true, true, true, false, false], rx: [17, 12], tau: 12, guess: 0, noise: 0, solved: false,
  lat: 23.5, lon: 121, t: 0, mask: 10, wall: 0, mp: 0, sig: 3, clock: 'solve', ctau: 0.2, excl: {}, playing: false
};
const st = o => Object.assign(JSON.parse(JSON.stringify(DEF)), o || {});
function snap(s, act) {
  const ids = [], tw = [];
  s.on.forEach((b, i) => { if (b) { ids.push(i); tw.push(K.TOWERS[i]); } });
  const noise = ids.map(i => K.TOWER_NOISE[i] * s.noise / 1000);
  const rho = K.pseudo2(tw, s.rx, s.tau, noise), radius = rho.map(r => r - K.C * s.guess);
  const fit = tw.length >= 2 ? K.solve2(tw, rho, s.guess) : null, full = tw.length >= 3 ? K.solve2(tw, rho) : null;
  const X = tw.length === 2 ? K.circleX(tw[0], radius[0], tw[1], radius[1]) : null;
  let near = Infinity; tw.forEach(t => { near = Math.min(near, Math.hypot(t.x - s.rx[0], t.y - s.rx[1])); });
  const all = K.sky({ lat: s.lat, lon: s.lon, t: s.t, mask: s.mask, canyon: s.wall > 0 ? { w: s.wall, dir: 0 } : null });
  const vis = all.filter(x => x.visible), used = vis.filter(x => !s.excl[x.id]);
  const sc = K.scatter(used, s.sig, 300, 11, s.mp > 0 ? { m: s.mp, el: 20 } : null, s.clock === 'assume' ? s.ctau : undefined);
  let maxEl = -90; used.forEach(x => { maxEl = Math.max(maxEl, x.el); });
  const dAll = vis.length >= 4 ? K.dop(K.geometry3(vis)) : null, d = sc ? sc.dop : null;
  const tg = K.dop(tw.length >= 3 ? K.geometry2(tw, s.rx) : [[1, 0, 1]]);
  return { type: 'gps', data: {
    act: act || 'param', mode: s.mode, view: s.view,
    plane: {
      n: tw.length, on: ids, tau: s.tau, guess: s.guess, noise: s.noise, rx: s.rx.slice(),
      miss: fit ? fit.rms * 1000 : null, err: fit ? Math.hypot(fit.x - s.rx[0], fit.y - s.rx[1]) * 1000 : null,
      nX: X ? X.length : null, xErr: X && X.length ? Math.min(...X.map(p => Math.hypot(p[0] - s.rx[0], p[1] - s.rx[1]))) * 1000 : null,
      near, seg: tw.length === 2 ? K.segDist(tw[0], tw[1], s.rx) : null, solved: s.solved, fullTau: full ? full.tau : null, hdop: tw.length >= 3 && tg ? tg.h : null
    },
    sky: {
      lat: s.lat, lon: s.lon, t: s.t, mask: s.mask, wall: s.wall, mp: s.mp, sig: s.sig, clock: s.clock, ctau: s.ctau,
      nVis: vis.length, nUsed: used.length, nExcl: vis.length - used.length, maxEl, pAll: dAll ? dAll.p : null, playing: s.playing,
      dop: d ? { p: d.p, h: d.h, v: d.v, t: d.t } : null, hrms: sc ? sc.hrms : null, biasH: sc ? sc.biasH : null, biasV: sc ? Math.abs(sc.bias[2]) : null
    }
  } };
}
const firing = e => missions.filter(m => m.check(e)).map(m => m.id.replace('gps-trilateration-', ''));
const hiddenOf = list => list.filter(x => x[0] === 'h');
const used = {};
function witness(id, e, note) {
  const f = firing(e);
  used[id] = e;
  expect(id + ' 做得到', f.indexOf(id) >= 0, note + '；同時完成：' + (f.filter(x => x !== id).join('、') || '無'));
  return f;
}
function comb(a, k, f, s = 0, pre = []) { if (pre.length === k) { f(pre.slice()); return; } for (let i = s; i < a.length; i++) { pre.push(a[i]); comb(a, k, f, i + 1, pre); pre.pop(); } }
const visOf = s => K.sky({ lat: s.lat, lon: s.lon, t: s.t, mask: s.mask, canyon: s.wall > 0 ? { w: s.wall, dir: 0 } : null }).filter(x => x.visible);
/** 只留下 keep 這幾顆（其餘排除） */
function keepOnly(s, keep) { const ex = {}; visOf(s).forEach(x => { if (keep.indexOf(x.id) < 0) ex[x.id] = true; }); s.excl = ex; return s; }
/** 在 vis 裡找 k 顆，讓 PDOP 最小（或最大） */
function bestSubset(s, k, worst) {
  let b = null;
  comb(visOf(s), k, c => { const D = K.dop(K.geometry3(c)); if (!D) return; if (!b || (worst ? D.p > b.p : D.p < b.p)) b = { p: D.p, ids: c.map(x => x.id) }; });
  return b;
}
function findT(base, test, step) { for (let t = 0; t <= 2880; t += step || 1) { const s = st(Object.assign({}, base, { t })); if (test(s)) return s; } return null; }

console.log('gps-trilateration 任務證明\n');

console.log('[預設與一般操作]');
{
  const f = [];
  ['plane', 'tower', 'mode', 'clock', 'rotate', 'useall', 'time', 'sky'].forEach(a => {
    ['globe', 'fix'].forEach(v => ['plane', 'sky'].forEach(m => {
      const x = firing(snap(st({ mode: m, view: v }), a)); if (x.length) f.push(m + '/' + v + '/' + a + ':' + x.join('、'));
    }));
  });
  expect('預設值、一般操作不會完成任務', f.length === 0, f.join('；'));
  expect('打開天空圖只完成任務 2', firing(snap(st({ mode: 'sky', view: 'skyplot' }), 'view')).join() === '2');
  expect('拖曳登山客（預設位置）只完成任務 1', firing(snap(st(), 'drag')).join() === '1');
  // 每一個滑桿拉到最小或最大（平面的在平面練習、天上的在三個畫面與兩種時鐘做法）
  const LIM = { tau: [-40, 40], guess: [-40, 40], noise: [0, 500], lat: [-90, 90], lon: [-180, 180], t: [0, 2880], mask: [0, 40], wall: [0, 75], mp: [0, 30], sig: [0.5, 20], ctau: [-1, 1] };
  const hit = new Set();
  Object.keys(LIM).forEach(q => LIM[q].forEach(v => {
    const plane = ['tau', 'guess', 'noise'].indexOf(q) >= 0;
    (plane ? [['plane', 'globe', 'solve']] : [].concat(...['globe', 'skyplot', 'fix'].map(vw => [['sky', vw, 'solve'], ['sky', vw, 'assume']]))).forEach(([m, vw, c]) => {
      hiddenOf(firing(snap(st({ mode: m, view: vw, clock: c, [q]: v }), plane ? 'plane' : 'sky'))).forEach(x => hit.add(m + '/' + vw + '/' + c + ' ' + q + '=' + v + '→' + x));
    });
  }));
  expect('任何一個滑桿拉到最小或最大都不會完成隱藏任務', hit.size === 0, [...hit].join('；'));
}

console.log('\n[公開任務]');
witness('1', snap(st({ rx: [20, 10] }), 'drag'), '拖曳登山客');
witness('2', snap(st({ mode: 'sky', view: 'skyplot' }), 'view'), '天空圖');
witness('3', snap(st({ guess: 12 }), 'plane'), '時鐘修正拉到 12 μs');
expect('按「自己解」得到的不算任務 3', !byId('3').check(snap(st({ guess: 12, solved: true }), 'solve')));
{
  const e = snap(st({ on: [true, true, false, false, false], guess: 12 }), 'tower');
  witness('4', e, '兩座塔、時鐘修正 12 μs：交點 ' + e.data.plane.nX + ' 個，其中一個離接收機 ' + e.data.plane.xErr.toFixed(3) + ' m');
}
{
  const s = st(), full = K.solve2(K.TOWERS.slice(0, 3), K.pseudo2(K.TOWERS.slice(0, 3), s.rx, s.tau));
  witness('5', snap(st({ guess: Math.round(full.tau * 100) / 100, solved: true }), 'solve'), '按「讓接收機自己解」');
}
{
  const s = st({ mode: 'sky' }), b = bestSubset(s, 4);
  witness('6', snap(keepOnly(s, b.ids), 'sat'), '預設時刻選最好的四顆：PDOP ' + b.p.toFixed(2));
}
witness('7', snap(st({ mode: 'sky', clock: 'assume', ctau: 0.5 }), 'sky'), '假設時鐘準、其實偏 0.5 μs：偏 ' + (() => { const d = snap(st({ mode: 'sky', clock: 'assume', ctau: 0.5 })).data.sky; return Math.hypot(d.biasH, d.biasV).toFixed(0); })() + ' m');
expect('預設偏 0.2 μs 不夠 200 m', !byId('7').check(snap(st({ mode: 'sky', clock: 'assume' }), 'clock')));
{
  const s = findT({ mode: 'sky', wall: 45 }, x => { const d = snap(x).data.sky.dop; return d && d.p <= 4; });
  witness('8', snap(s, 'sky'), '大樓 45°、時間 ' + s.t + ' 分');
}
{
  const s = findT({ mode: 'sky', mp: 30 }, x => snap(x).data.sky.biasH >= 6);
  witness('9', snap(s, 'sky'), '多路徑 30 m、時間 ' + s.t + ' 分：偏 ' + snap(s).data.sky.biasH.toFixed(2) + ' m');
}
{
  let w = null;
  for (let t = 0; t <= 1436 && !w; t += 2) {
    const s = st({ mode: 'sky', t }), v = visOf(s), all = K.dop(K.geometry3(v)).p;
    for (const x of v) { const D = K.dop(K.geometry3(v.filter(y => y !== x))); if (D && D.p >= 1.6 * all) { s.excl = { [x.id]: true }; w = s; break; } }
  }
  witness('10', snap(w, 'sat'), '時間 ' + w.t + ' 分拿掉一顆');
}
{
  let w = null;
  for (const lat of [0, 10, 23.5, 45, 60]) { if (w) break; w = findT({ mode: 'sky', lat, mask: 5 }, x => visOf(x).length >= 10, 2); }
  witness('11', snap(w, 'sky'), '緯度 ' + w.lat + '、遮罩 5°、時間 ' + w.t + ' 分：' + visOf(w).length + ' 顆');
}
{
  let w = null, b = null;
  for (let t = 0; t <= 1436 && !w; t += 2) { const s = st({ mode: 'sky', t }); b = bestSubset(s, 4); if (b && b.p <= 2.15) w = keepOnly(s, b.ids); }
  witness('12', snap(w, 'sat'), '遮罩 10°、時間 ' + w.t + ' 分選四顆：PDOP ' + b.p.toFixed(2));
}

console.log('\n[隱藏任務]');
witness('h1', snap(st({ rx: [6.1, 23.9] }), 'drag'), '站在 A 塔下');
expect('沒用到的 E 塔下不算', !byId('h1').check(snap(st({ rx: [20, 15.5] }), 'drag')));
{
  const A = K.TOWERS[0], B = K.TOWERS[1];
  witness('h2', snap(st({ on: [true, true, false, false, false], guess: 12, rx: [(A.x + B.x) / 2, (A.y + B.y) / 2] }), 'drag'), '兩座塔、時鐘對、站在兩塔連線上');
  expect('時鐘沒對就不算', !byId('h2').check(snap(st({ on: [true, true, false, false, false], guess: 10, rx: [(A.x + B.x) / 2, (A.y + B.y) / 2] }), 'drag')));
}
{
  let s = null;
  for (const lat of [30, 35, 40, 45, 50]) { if (s) break; s = findT({ mode: 'sky', lat }, x => snap(x).data.sky.maxEl >= 88); }
  witness('h3', snap(s, 'time'), '緯度 ' + s.lat + '°、時間 ' + s.t + ' 分：最高仰角 ' + snap(s).data.sky.maxEl.toFixed(2) + '°');
}
{
  const s = findT({ mode: 'sky', view: 'fix', lat: 80 }, x => { const d = snap(x).data.sky.dop; return d && d.v >= 3 * d.h; }, 2);
  const d = snap(s).data.sky.dop;
  witness('h4', snap(s, 'sky'), '緯度 80°、時間 ' + s.t + ' 分：VDOP ' + d.v.toFixed(2) + '、HDOP ' + d.h.toFixed(2));
}
witness('h5', snap(st({ mode: 'sky', view: 'skyplot', t: 1436 }), 'time'), '天空圖、時間 1436 分（一個恆星日）');
expect('播放中經過不算', !byId('h5').check(snap(st({ mode: 'sky', view: 'skyplot', t: 1436, playing: true }), 'time')));
{
  const s = st({ mode: 'sky' }), b = bestSubset(s, 4, true);
  witness('h6', snap(keepOnly(s, b.ids), 'sat'), '四顆擠在一起：PDOP ' + b.p.toFixed(1));
}
{
  const s = st({ mode: 'sky', clock: 'assume', ctau: 0 });
  witness('h7', snap(keepOnly(s, visOf(s).slice(0, 3).map(x => x.id)), 'sat'), '假設時鐘準、時鐘真的準、只用三顆');
}
witness('h8', snap(st({ mode: 'sky', view: 'fix', sig: 0.5, mp: 30 }), 'sky'), '定位點、σ 0.5 m、多路徑 30 m：偏 ' + snap(st({ mode: 'sky', sig: 0.5, mp: 30 })).data.sky.biasH.toFixed(2) + ' m');
{
  const s = findT({ mode: 'sky', wall: 60 }, x => { const d = snap(x).data.sky.dop; return d && d.p <= 6; });
  witness('h9', snap(s, 'sky'), '大樓 60°、時間 ' + s.t + ' 分：PDOP ' + snap(s).data.sky.dop.p.toFixed(2));
}
{
  let w = null, b = null;
  for (let t = 0; t <= 1436 && !w; t += 2) { const s = st({ mode: 'sky', lat: 45, mask: 0, t }); b = bestSubset(s, 4); if (b && b.p <= 1.9) w = keepOnly(s, b.ids); }
  witness('h10', snap(w, 'sat'), '緯度 45°、遮罩 0°、時間 ' + w.t + ' 分選四顆：PDOP ' + b.p.toFixed(2));
}

console.log('\n[彼此不會順便完成]');
{
  const hid = missions.filter(m => m.hidden).map(m => m.id.replace('gps-trilateration-', ''));
  const cross = [];
  Object.keys(used).forEach(id => hiddenOf(firing(used[id])).filter(x => x !== id).forEach(x => cross.push(id + '→' + x)));
  expect('每個任務的做法都不會順便完成別的隱藏任務', cross.length === 0, cross.join('、'));
  expect('10 個隱藏任務都有見證', hid.every(h => used[h]), hid.filter(h => !used[h]).join('、'));
}

console.log('\n[隨機亂玩]');
{
  let seed = 4242;
  const R = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const pick = a => a[Math.floor(R() * a.length)];
  const SL = { tau: [-40, 40, 0.5], guess: [-40, 40, 0.1], noise: [0, 500, 10], lat: [-90, 90, 0.5], lon: [-180, 180, 1], t: [0, 2880, 1], mask: [0, 40, 1], wall: [0, 75, 1], mp: [0, 30, 1], sig: [0.5, 20, 0.5], ctau: [-1, 1, 0.01] };
  const val = q => { const [a, b, d] = SL[q], u = R(); const v = u < 0.2 ? a : u < 0.4 ? b : a + Math.round(R() * (b - a) / d) * d; return Math.round(v * 1000) / 1000; };
  const cnt = {}, tries = 300, steps = 25;
  for (let n = 0; n < tries; n++) {
    const s = st(), hits = new Set();
    for (let k = 0; k < steps; k++) {
      const a = R();
      let act = 'param';
      if (a < 0.08) { s.mode = s.mode === 'plane' ? 'sky' : 'plane'; act = 'mode'; }
      else if (a < 0.14) { s.view = pick(['globe', 'skyplot', 'fix']); act = 'view'; }
      else if (a < 0.18) { s.clock = s.clock === 'solve' ? 'assume' : 'solve'; act = 'clock'; }
      else if (a < 0.24) { const i = Math.floor(R() * 5); s.on[i] = !s.on[i]; s.solved = false; act = 'tower'; }
      else if (a < 0.28) {
        const tw = K.TOWERS.filter((t, i) => s.on[i]);
        if (tw.length >= 3) { const f = K.solve2(tw, K.pseudo2(tw, s.rx, s.tau, s.on.map((b, i) => b ? K.TOWER_NOISE[i] * s.noise / 1000 : null).filter(x => x !== null))); s.guess = Math.max(-40, Math.min(40, Math.round(f.tau * 100) / 100)); s.solved = true; }
        act = 'solve';
      }
      else if (a < 0.4) { s.rx = [0.5 + R() * 39, 0.5 + R() * 29]; s.solved = false; act = 'drag'; }
      else if (a < 0.5) { const v = visOf(s); if (v.length) { const x = pick(v); if (s.excl[x.id]) delete s.excl[x.id]; else s.excl[x.id] = true; } act = 'sat'; }
      else if (a < 0.52) { s.excl = {}; act = 'useall'; }
      else { const q = pick(Object.keys(SL)); s[q] = val(q); s.solved = false; act = ['tau', 'guess', 'noise'].indexOf(q) >= 0 ? 'plane' : q === 't' ? 'time' : 'sky'; }
      hiddenOf(firing(snap(s, act))).forEach(x => hits.add(x));
    }
    hits.forEach(x => { cnt[x] = (cnt[x] || 0) + 1; });
  }
  const worst = Object.keys(cnt).map(x => x + ' ' + (100 * cnt[x] / tries).toFixed(2) + '%').join('、') || '都沒有';
  // h1（站到用到的塔下）是 3 級，亂拖本來就可能碰到；其他低於 3%
  const lim = { h1: 0.08 };
  expect('隨機亂玩 ' + tries + ' 次（每次 ' + steps + ' 步），隱藏任務碰巧完成的比例夠低', Object.keys(cnt).every(x => cnt[x] / tries < (lim[x] || 0.03)), worst);
}

const pub = missions.filter(m => !m.hidden), hid = missions.filter(m => m.hidden);
console.log('\n合計：' + ok + ' 項通過，' + bad + ' 項失敗');
console.log('公開 ' + pub.length + ' 個（' + pub.reduce((a, m) => a + m.level, 0) + ' 顆星），隱藏 ' + hid.length + ' 個（' + hid.reduce((a, m) => a + 2 * m.level, 0) + ' 顆星）；7 級以上的隱藏任務 ' + hid.filter(m => m.level >= 7).length + ' 個');
if (bad) process.exitCode = 1;
