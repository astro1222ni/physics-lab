/* 任務可達成的證明腳本。用法：node tools/mission-proofs/gis-overlay.js（十幾秒）
 * 修改核心或任務條件後重跑，確認每個任務都做得到、預設狀態不會觸發、隱藏任務彼此不會順便完成。
 * 事件 'go' 的內容由 snap() 產生，和 js/gis-overlay.js 的 snapshot() 相同。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const K = require(ROOT + 'js/gis-overlay-core.js');
const missions = [];
global.window = { GisCore: K, LabMission: { register: (id, list) => list.forEach(m => missions.push(m)) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/gis-overlay.js');
const byId = id => missions.find(m => m.id === 'gis-overlay-' + id);
const L = K.layers(), N = K.NX * K.NY;

let ok = 0, bad = 0;
function expect(label, cond, extra) {
  if (cond) { ok++; console.log('  ✓ ' + label + (extra ? '（' + extra + '）' : '')); }
  else { bad++; console.error('  ✗ ' + label + (extra ? '（' + extra + '）' : '')); }
}

// ---------- 和頁面相同的快照 ----------
// o = { fac, method, view, layer, set: function (cfg, w) 修改條件, probe: 格子編號 }
function state(o) {
  o = o || {};
  const fac = o.fac || 'incinerator', cfg = K.preset(fac), w = cfg.w;
  delete cfg.w;
  if (o.set) o.set(cfg, w);
  return { fac, cfg, w, method: o.method || 'bool', view: o.view || 'map', layer: o.layer || 'result', probe: o.probe == null ? -1 : o.probe };
}
function snap(o, act) {
  const s = state(o), B = K.boolean(s.cfg), W = K.weighted(s.cfg, s.w);
  let probe = null;
  if (s.probe >= 0) { probe = K.inspect(s.probe, s.cfg); probe.score = W.score[s.probe]; probe.ok = !!B.mask[s.probe]; }
  return { type: 'go', data: {
    act: act || 'param', fac: s.fac, method: s.method, view: s.view, layer: s.layer,
    cfg: JSON.parse(JSON.stringify(s.cfg)), w: Object.assign({}, s.w),
    bool: { cells: B.cells, area: B.area, patches: B.patches, largest: B.largest, sitesBig: B.sitesBig, fail: B.fail },
    weight: { best: W.best, bestK: W.bestK, area70: W.area70, bestOk: W.bestK >= 0 && !!B.mask[W.bestK] },
    flood: K.floodStats(s.cfg.stage), probe
  } };
}
const firing = e => missions.filter(m => m.check(e)).map(m => m.id.replace('gis-overlay-', ''));
const hiddenOf = list => list.filter(x => x[0] === 'h');
const used = {};
function witness(id, e, note) {
  const f = firing(e);
  used[id] = e;
  expect(id + ' 做得到', f.indexOf(id) >= 0, note + '；同時完成：' + (f.filter(x => x !== id).join('、') || '無'));
  return f;
}
const range = (a, b, s) => { const r = []; for (let v = a; v <= b + 1e-9; v += s) r.push(+v.toFixed(6)); return r; };
const SL = { stage: range(0, 6, 0.1), slope: range(0, 40, 1), flood: range(0, 3, 0.1), fault: range(0, 4000, 50), road: range(100, 5000, 50), town: range(0, 5000, 50), w: range(0, 5, 1) };
const FACS = ['incinerator', 'school', 'solar'];
const findK = test => { for (let k = 0; k < N; k++) if (test(k)) return k; return -1; };

console.log('gis-overlay 任務證明\n');

console.log('[預設與一般操作]');
{
  const f = [];
  FACS.forEach(fac => ['param', 'fac', 'reset', 'method', 'toggle', 'land', 'rotate'].forEach(a => {
    const x = firing(snap({ fac }, a)); if (x.length) f.push(fac + '/' + a + ':' + x.join('、'));
    const y = firing(snap({ fac, method: 'weight' }, a)); if (y.length) f.push(fac + '/weight/' + a + ':' + y.join('、'));
  }));
  expect('三種設施的預設值、一般操作不會完成任務', f.length === 0, f.join('；'));
  expect('切到立體只完成任務 2', firing(snap({ view: '3d' }, 'view')).join() === '2');
  expect('顯示淹水圖層只完成任務 3', firing(snap({ layer: 'flood' }, 'layer')).join() === '3');
  ['z', 'slope', 'fault', 'road', 'town', 'land'].forEach(l => expect('顯示「' + l + '」圖層不完成任務', firing(snap({ layer: l }, 'layer')).length === 0));
  // 任何一個滑桿拉到最小或最大
  const hit = new Set();
  FACS.forEach(fac => ['bool', 'weight'].forEach(method => {
    ['stage', 'slope', 'flood', 'fault', 'road', 'town'].forEach(q => [SL[q][0], SL[q][SL[q].length - 1]].forEach(v => {
      hiddenOf(firing(snap({ fac, method, set: c => { if (q === 'stage') c.stage = v; else c[q].v = v; } }))).forEach(x => hit.add(fac + ' ' + q + '=' + v + '→' + x));
    }));
    ['slope', 'flood', 'fault', 'road', 'town'].forEach(q => [0, 5].forEach(v => {
      hiddenOf(firing(snap({ fac, method, set: (c, w) => { w[q] = v; } }))).forEach(x => hit.add(fac + ' w' + q + '=' + v + '→' + x));
    }));
  }));
  expect('任何一個滑桿拉到最小或最大都不會完成隱藏任務', hit.size === 0, [...hit].join('；'));
}

console.log('\n[公開任務]');
witness('1', snap({ probe: 24 * 64 + 30 }, 'probe'), '點一格');
witness('2', snap({ view: '3d' }, 'view'), '圖層疊起來');
witness('3', snap({ layer: 'flood' }, 'layer'), '淹水圖層');
{
  const W = K.weighted(state({}).cfg, state({}).w);
  witness('4', snap({ method: 'weight', probe: W.bestK }, 'probe'), '加權疊合，點最高分的格子 ' + W.bestK);
}
{
  const st = SL.stage.find(v => K.floodStats(v).town >= 1.5);
  witness('5', snap({ set: c => { c.stage = st; } }), '河水上漲 ' + st + ' m：住宅淹 ' + K.floodStats(st).town + ' km²');
}
{
  const c = state({ fac: 'school' }).cfg, b = K.boolean(c), k = findK(q => b.mask[q]);
  witness('6', snap({ fac: 'school', probe: k }, 'probe'), '學校預設條件，點通過的格子 ' + k);
  expect('學校條件放寬（坡度 6%）就不算', !byId('6').check(snap({ fac: 'school', probe: k, set: c => { c.slope.v = 6; } }, 'probe')));
}
witness('7', snap({ set: c => { c.fault.v = 2000; } }), '焚化廠離斷層 2 km：' + K.boolean(state({ set: c => { c.fault.v = 2000; } }).cfg).sitesBig + ' 塊夠大的地');
witness('8', snap({ fac: 'school', set: c => { c.stage = 3; } }), '學校、河水上漲 3 m：剩一塊');
witness('9', snap({ fac: 'school', set: c => { c.fault.v = 1100; } }), '學校、離斷層 1.1 km：16 格');
witness('10', snap({ method: 'weight', set: (c, w) => { w.slope = 0; } }), '焚化廠、坡度權重 0：最高分的格子太陡');
witness('11', snap({ set: c => { c.town.v = 5000; } }), '焚化廠離住家 5 km：最大一塊 ' + K.boolean(state({ set: c => { c.town.v = 5000; } }).cfg).largest + ' km²');
witness('12', snap({ fac: 'solar', set: c => { c.slope.v = 2; } }), '太陽能場坡度 ≤ 2%：最大一塊 ' + K.boolean(state({ fac: 'solar', set: c => { c.slope.v = 2; } }).cfg).largest + ' km²');

console.log('\n[隱藏任務]');
{
  const k = findK(q => L.land[q] === 1 && K.depthAt(L, q, 2) > 0);
  witness('h1', snap({ probe: k }, 'probe'), '點一格會淹的住宅 ' + k + '（深 ' + K.depthAt(L, k, 2).toFixed(2) + ' m）');
}
{
  const k = findK(q => L.land[q] === 1 && L.fault[q] < 125 && K.depthAt(L, q, 2) === 0);
  witness('h2', snap({ probe: k }, 'probe'), '點斷層經過的住宅 ' + k + '（' + L.fault[k].toFixed(0) + ' m）');
}
{
  let zk = 0, sk = 0;
  for (let k = 0; k < N; k++) { if (L.z[k] > L.z[zk]) zk = k; if (L.slope[k] > L.slope[sk]) sk = k; }
  witness('h3', snap({ probe: zk }, 'probe'), '最高的一格 ' + zk + '（' + L.z[zk].toFixed(1) + ' m）');
  witness('h4', snap({ probe: sk }, 'probe'), '最陡的一格 ' + sk + '（' + L.slope[sk].toFixed(1) + '%）');
}
{
  const st = SL.stage.find(v => Math.abs(K.floodStats(v).town - 1) < 1e-9);
  witness('h5', snap({ layer: 'flood', set: c => { c.stage = st; } }), '河水上漲 ' + st + ' m：住宅剛好淹 1 km²');
  expect('預設 2 m 時淹 ' + K.floodStats(2).town + ' km²，不算', !byId('h5').check(snap({ layer: 'flood' }, 'layer')));
}
witness('h6', snap({ set: c => { K.CRIT.forEach(q => { c[q].on = false; }); } }, 'toggle'), '六個條件全部關掉');
{
  const c = state({ fac: 'school', set: c => { c.stage = 6; } }).cfg, b = K.boolean(c), k = findK(q => b.mask[q]);
  witness('h7', snap({ fac: 'school', set: c => { c.stage = 6; }, probe: k }, 'probe'), '學校、河水上漲 6 m，點通過的格子 ' + k + '（還有 ' + b.cells + ' 格）');
}
{
  const s = state({ method: 'weight', set: (c, w) => { w.slope = 0; } }), W = K.weighted(s.cfg, s.w);
  witness('h8', snap({ method: 'weight', set: (c, w) => { w.slope = 0; }, probe: W.bestK }, 'probe'), '坡度權重 0，再點最高分的格子');
}
witness('h9', snap({ fac: 'solar', set: c => { c.slope.v = 1; } }), '太陽能場坡度 ≤ 1%：最大一塊 ' + K.boolean(state({ fac: 'solar', set: c => { c.slope.v = 1; } }).cfg).largest + ' km²');
{
  let lim = null;
  for (const f of SL.fault) { const b = K.boolean(state({ fac: 'school', set: c => { c.fault.v = f; } }).cfg); if (b.sitesBig >= 1) lim = f; }
  witness('h10', snap({ fac: 'school', set: c => { c.fault.v = lim; } }), '學校離斷層 ' + lim + ' m 還有一塊夠大的地，再加 50 m 就沒有');
  expect('少 50 m 不算', !byId('h10').check(snap({ fac: 'school', set: c => { c.fault.v = lim - 50; } })));
}

console.log('\n[彼此不會順便完成]');
{
  const hid = missions.filter(m => m.hidden).map(m => m.id.replace('gis-overlay-', ''));
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
  const ext = a => { const b = R(); return b < 0.2 ? a[0] : b < 0.4 ? a[a.length - 1] : pick(a); };
  const cnt = {}, tries = 300, steps = 25;
  for (let n = 0; n < tries; n++) {
    let fac = 'incinerator', cfg = K.preset(fac), w = cfg.w, method = 'bool', view = 'map', layer = 'result', probe = -1;
    const hits = new Set();
    for (let s = 0; s < steps; s++) {
      const a = R();
      let act = 'param';
      if (a < 0.08) { fac = pick(FACS); cfg = K.preset(fac); w = cfg.w; act = 'fac'; }
      else if (a < 0.14) { method = method === 'bool' ? 'weight' : 'bool'; act = 'method'; }
      else if (a < 0.18) { view = view === 'map' ? '3d' : 'map'; act = 'view'; }
      else if (a < 0.26) { layer = pick(['result', 'z', 'slope', 'flood', 'fault', 'road', 'town', 'land']); act = 'layer'; }
      else if (a < 0.31) { const q = pick(K.CRIT); cfg[q].on = !cfg[q].on; act = 'toggle'; }
      else if (a < 0.34) { const u = Math.floor(R() * 5), i = cfg.land.v.indexOf(u); if (i >= 0) cfg.land.v.splice(i, 1); else cfg.land.v.push(u); act = 'land'; }
      else if (a < 0.4) cfg.stage = ext(SL.stage);
      else if (a < 0.6) { const q = pick(['slope', 'flood', 'fault', 'road', 'town']); cfg[q].v = ext(SL[q]); }
      else if (a < 0.68) { const q = pick(['slope', 'flood', 'fault', 'road', 'town']); w[q] = ext(SL.w); }
      else { probe = Math.floor(R() * N); act = 'probe'; }
      const e = snap({ fac, method, view, layer, probe, set: (c, ww) => { Object.assign(c, JSON.parse(JSON.stringify(cfg))); Object.assign(ww, w); } }, act);
      hiddenOf(firing(e)).forEach(x => hits.add(x));
    }
    hits.forEach(x => { cnt[x] = (cnt[x] || 0) + 1; });
  }
  const worst = Object.keys(cnt).map(x => x + ' ' + (100 * cnt[x] / tries).toFixed(2) + '%').join('、') || '都沒有';
  // h1（點到會淹的住宅）是 3 級、h2 是 4 級，亂點本來就可能碰到；6 級以上低於 3%
  const lim = { h1: 0.25, h2: 0.08, h3: 0.06, h4: 0.06 };
  expect('隨機亂玩 ' + tries + ' 次（每次 ' + steps + ' 步），隱藏任務碰巧完成的比例夠低', Object.keys(cnt).every(x => cnt[x] / tries < (lim[x] || 0.03)), worst);
}

const pub = missions.filter(m => !m.hidden), hid = missions.filter(m => m.hidden);
console.log('\n合計：' + ok + ' 項通過，' + bad + ' 項失敗');
console.log('公開 ' + pub.length + ' 個（' + pub.reduce((a, m) => a + m.level, 0) + ' 顆星），隱藏 ' + hid.length + ' 個（' + hid.reduce((a, m) => a + 2 * m.level, 0) + ' 顆星）；7 級以上的隱藏任務 ' + hid.filter(m => m.level >= 7).length + ' 個');
if (bad) process.exitCode = 1;
