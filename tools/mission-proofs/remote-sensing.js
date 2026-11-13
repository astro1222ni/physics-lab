/* 任務可達成的證明腳本。用法：node tools/mission-proofs/remote-sensing.js（約半分鐘）
 * 修改核心或任務條件後重跑，確認每個任務都做得到、預設狀態不會觸發、隱藏任務彼此不會順便完成。
 * 事件 'rs' 的內容由 snap() 產生，和 js/remote-sensing.js 的 snapshot() 相同。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const K = require(ROOT + 'js/remote-sensing-core.js');
const missions = [];
global.window = { RemoteCore: K, LabMission: { register: (id, list) => list.forEach(m => missions.push(m)) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/remote-sensing.js');
const N = K.NX * K.NY;

let ok = 0, bad = 0;
function expect(label, cond, extra) {
  if (cond) { ok++; console.log('  ✓ ' + label + (extra ? '（' + extra + '）' : '')); }
  else { bad++; console.error('  ✗ ' + label + (extra ? '（' + extra + '）' : '')); }
}

// ---------- 和頁面相同的狀態與快照 ----------
const DEF = { view: 'image', layer: 'rgb', comp: 'natural', rgb: [4, 3, 2], day: 70, drought: 0, turb: 0.3, haze: 0, probe: -1, playing: false };
const st = o => Object.assign(JSON.parse(JSON.stringify(DEF)), o || {});
const SCN = new Map();
function scene(o) {
  const key = o.day + '|' + o.drought + '|' + o.turb + '|' + o.haze;
  let s = SCN.get(key);
  if (!s) { s = K.scene(o); if (SCN.size > 400) SCN.clear(); SCN.set(key, s); }
  return s;
}
function snap(s, act) {
  const o = { day: s.day, drought: s.drought, turb: s.turb, haze: s.haze };
  const S = scene(o);
  const S0 = s.drought > 0 ? scene(Object.assign({}, o, { drought: 0 })) : S;
  const SC = s.haze > 0 ? scene(Object.assign({}, o, { haze: 0 })) : S;
  let probe = null;
  if (s.probe >= 0) {
    const P = K.pixel(s.probe, o), ix = K.indices(P.bands);
    probe = { k: s.probe, cls: P.cls, stage: P.stage, ndvi: ix.ndvi, ndwi: ix.ndwi, ndbi: ix.ndbi, mix: Object.assign({}, P.mix), b: P.bands.slice() };
  }
  return { type: 'rs', data: {
    act: act || 'param', view: s.view, layer: s.layer, comp: s.comp, rgb: s.rgb.slice(),
    day: s.day, drought: s.drought, turb: s.turb, haze: s.haze, playing: s.playing,
    mean: Object.assign({}, S.mean), meanW: Object.assign({}, S.meanW), paddy0: S0.mean.paddy, paddyC: SC.mean.paddy, probe
  } };
}
const firing = e => missions.filter(m => m.check(e)).map(m => m.id.replace('remote-sensing-', ''));
const hiddenOf = list => list.filter(x => x[0] === 'h');
function witness(id, e, note) {
  const f = firing(e);
  expect(id + ' 做得到', f.indexOf(id) >= 0, note + '；同時完成：' + (f.filter(x => x !== id).join('、') || '無'));
  return f;
}
const pixOf = cls => { const a = []; for (let k = 0; k < N; k++) if (K.classAt(k) === cls) a.push(k); return a; };
const PADDY = pixOf('paddy');
/** 找第一個符合條件的（日、像元） */
function findPix(days, list, test) {
  for (const d of days) for (const k of list) { const s = st({ day: d, probe: k }); const P = snap(s).data.probe; if (test(P, d)) return { day: d, k, P }; }
  return null;
}
const range = (a, b) => { const r = []; for (let i = a; i <= b; i++) r.push(i); return r; };
const ij = k => '(' + (k % K.NX) + ', ' + Math.floor(k / K.NX) + ')';
const hidAll = [];

console.log('remote-sensing 任務證明\n');

console.log('[預設與一般操作]');
{
  const f = new Set();
  ['param', 'day', 'layer', 'view', 'comp'].forEach(a => firing(snap(st(), a)).forEach(x => f.add(x)));
  ['image', 'spectrum', 'scatter'].forEach(v => firing(snap(st({ view: v }), 'view')).forEach(x => f.add(x)));
  expect('預設狀態只會完成「換畫面、換圖層」這類操作任務', [...f].every(x => ['2', '3'].indexOf(x) < 0 ? false : true) || f.size === 0, [...f].join('、') || '無');
  // 每個滑桿拉到最小或最大，配上每種畫面、圖層、組合，都不會完成隱藏任務
  const SL = { day: [1, 365], drought: [0, 1], turb: [0, 1], haze: [0, 0.15] };
  const hit = new Set();
  Object.keys(SL).forEach(q => SL[q].forEach(v => {
    [['image', 'rgb', 'natural'], ['image', 'ndvi', 'natural'], ['image', 'ndwi', 'natural'], ['image', 'rgb', 'cir'], ['image', 'rgb', 'swir'], ['spectrum', 'rgb', 'natural'], ['scatter', 'rgb', 'natural']].forEach(c => {
      const s = st({ view: c[0], layer: c[1], comp: c[2], rgb: K.COMPOSITES[c[2]].slice() }); s[q] = v;
      hiddenOf(firing(snap(s, 'param'))).forEach(x => hit.add(q + '=' + v + ' ' + c.join('/') + '→' + x));
    });
  }));
  expect('任何一個滑桿拉到最小或最大都不會完成隱藏任務', hit.size === 0, [...hit].join('、') || '無');
}

console.log('\n[公開任務]');
{
  const forest = pixOf('forest'), fallow = pixOf('fallow');
  witness('1', snap(st({ probe: forest[0] }), 'probe'), '點一個森林像元 ' + ij(forest[0]));
  witness('2', snap(st({ comp: 'cir', rgb: [5, 4, 3] }), 'comp'), '標準假色');
  witness('3', snap(st({ layer: 'ndvi' }), 'layer'), 'NDVI 圖層');
  witness('4', snap(st({ view: 'spectrum', probe: forest[100] }), 'view'), '森林像元的光譜');
  witness('5', snap(st({ comp: 'custom', rgb: [6, 5, 4] }), 'rgb'), '紅 6、綠 5、藍 4');
  expect('5 反例：近紅外同時放在別的顏色就不算', firing(snap(st({ comp: 'custom', rgb: [5, 5, 4] }), 'rgb')).indexOf('5') < 0);
  witness('6', snap(st({ view: 'scatter', probe: fallow[0] }), 'view'), '休耕地 ' + ij(fallow[0]) + ' 在散布圖');
  let d7 = range(1, 365).filter(d => snap(st({ day: d })).data.mean.paddy >= 0.75);
  witness('7', snap(st({ day: d7[0], layer: 'ndvi' }), 'day'), '稻田平均 NDVI ≥ 0.75 的日子：第 ' + d7[0] + '–' + d7[d7.length - 1] + ' 天（' + d7.length + ' 天）');
  expect('7 反例：預設的第 70 天不夠綠', firing(snap(st(), 'day')).indexOf('7') < 0, snap(st()).data.mean.paddy.toFixed(3));
  expect('7 反例：同一天加一點霧霾、或播放中經過都不算', firing(snap(st({ day: 111, haze: 0.01, layer: 'ndvi' }), 'param')).indexOf('7') < 0 && firing(snap(st({ day: 111, layer: 'ndvi', playing: true }), 'day')).indexOf('7') < 0);
  const d8 = range(1, 365).filter(d => snap(st({ day: d })).data.meanW.paddy >= 0.2);
  witness('8', snap(st({ day: d8[0], layer: 'ndwi' }), 'day'), '稻田平均 NDWI ≥ 0.2 的日子：' + d8.join(','));
  const r9 = findPix(range(140, 170), PADDY.filter((k, i) => i % 7 === 0), P => P.stage === 'ripe' && P.ndvi < 0.45);
  witness('9', snap(st({ day: r9.day, probe: r9.k, view: 'spectrum' }), 'view'), '第 ' + r9.day + ' 天 ' + ij(r9.k) + ' NDVI ' + r9.P.ndvi.toFixed(2));
  witness('10', snap(st({ day: 111, drought: 0.5 }), 'param'), '第 111 天乾旱 0.5：' + snap(st({ day: 111, drought: 0.5 })).data.mean.paddy.toFixed(3) + '，沒有乾旱 ' + snap(st({ day: 111 })).data.mean.paddy.toFixed(3));
  expect('10 反例：乾旱 0.35 不夠', firing(snap(st({ day: 111, drought: 0.35 }), 'param')).indexOf('10') < 0);
  witness('11', snap(st({ day: 111, haze: 0.1, layer: 'ndvi' }), 'param'), '第 111 天霧霾 0.1：' + snap(st({ day: 111, haze: 0.1 })).data.mean.paddy.toFixed(3));
  expect('11 反例：霧霾 0.06 不夠', firing(snap(st({ day: 111, haze: 0.06, layer: 'ndvi' }), 'param')).indexOf('11') < 0);
  const d12 = range(190, 365).filter(d => snap(st({ day: d })).data.mean.paddy >= 0.72);
  witness('12', snap(st({ day: d12[0], layer: 'ndvi' }), 'day'), '第二期 ≥ 0.72：第 ' + d12[0] + '–' + d12[d12.length - 1] + ' 天（' + d12.length + ' 天）');
}

console.log('\n[隱藏任務]');
{
  const W = {};
  const sand = pixOf('sand'), park = pixOf('park'), town = pixOf('town');
  W.h1 = snap(st({ comp: 'swir', rgb: [7, 6, 4], probe: sand[0] }), 'probe');
  hidAll.push(['h1', witness('h1', W.h1, '短波紅外組合點沙洲 ' + ij(sand[0]))]);
  expect('h1 反例：真實色彩點沙洲不算', hiddenOf(firing(snap(st({ probe: sand[0] }), 'probe'))).length === 0);
  W.h2 = snap(st({ layer: 'ndvi', probe: park[0] }), 'probe');
  hidAll.push(['h2', witness('h2', W.h2, 'NDVI 圖層點公園 ' + ij(park[0]) + '（公園 ' + park.length + ' 個像元）')]);
  W.h3 = snap(st({ comp: 'custom', rgb: [5, 5, 5] }), 'rgb');
  hidAll.push(['h3', witness('h3', W.h3, '三個顏色都放波段 5')]);
  expect('h3 反例：三個都放波段 4 不算', hiddenOf(firing(snap(st({ comp: 'custom', rgb: [4, 4, 4] }), 'rgb'))).length === 0);
  let n4 = 0; const d4 = new Set();
  range(1, 365).forEach(d => PADDY.forEach(k => { const P = K.pixel(k, { day: d, turb: 0.3 }); if (P.stage === 'young' && K.indices(P.bands).ndvi < -0.05) { n4++; d4.add(d); } }));
  const r4 = findPix([...d4], PADDY, P => P.stage === 'young' && P.ndvi < -0.05);
  W.h4 = snap(st({ day: r4.day, probe: r4.k, view: 'spectrum' }), 'view');
  hidAll.push(['h4', witness('h4', W.h4, '第 ' + r4.day + ' 天 ' + ij(r4.k) + ' NDVI ' + r4.P.ndvi.toFixed(2) + '；全年做得到的（日、像元）' + n4 + ' 組，日子 ' + Math.min(...d4) + '–' + Math.max(...d4) + ' 與第二期')]);
  expect('h4 反例：同一格在影像畫面不算', hiddenOf(firing(snap(st({ day: r4.day, probe: r4.k }), 'probe'))).indexOf('h4') < 0);
  // h5：全年最綠的一天
  let best = [0, -9]; range(1, 365).forEach(d => { const v = snap(st({ day: d })).data.mean.paddy; if (v > best[1]) best = [d, v]; });
  expect('h5 的答案（稻田平均 NDVI 最高的一天）是第 111 天', best[0] === 111, '第 ' + best[0] + ' 天 ' + best[1].toFixed(4) + '；第 110 天 ' + snap(st({ day: 110 })).data.mean.paddy.toFixed(4) + '、第 112 天 ' + snap(st({ day: 112 })).data.mean.paddy.toFixed(4));
  W.h5 = snap(st({ day: 111, layer: 'ndvi' }), 'day');
  hidAll.push(['h5', witness('h5', W.h5, '第 111 天、NDVI 圖層')]);
  expect('h5 反例：第 110、112 天、播放中經過都不算', ['110', '112'].every(d => firing(snap(st({ day: +d, layer: 'ndvi' }), 'day')).indexOf('h5') < 0) && firing(snap(st({ day: 111, layer: 'ndvi', playing: true }), 'day')).indexOf('h5') < 0);
  let dr6 = null; for (let dr = 0; dr <= 1.0001; dr += 0.05) { const r = Math.round(dr * 100) / 100; if (snap(st({ day: 111, drought: r, layer: 'ndvi' })).data.mean.paddy < 0.5) { dr6 = r; break; } }
  const d6 = range(1, 365).filter(d => snap(st({ day: d })).data.mean.paddy >= 0.78);
  W.h6 = snap(st({ day: 111, drought: dr6, layer: 'ndvi' }), 'param');
  expect('h6 反例：先調好乾旱、再拖日期經過不算', firing(snap(st({ day: 111, drought: dr6, layer: 'ndvi' }), 'day')).indexOf('h6') < 0);
  expect('h6 只在稻子最茂盛的那幾天做得到', d6.length <= 25, '沒有乾旱時平均 NDVI ≥ 0.78 的日子：第 ' + d6[0] + '–' + d6[d6.length - 1] + ' 天（' + d6.length + ' 天）');
  hidAll.push(['h6', witness('h6', W.h6, '第 111 天乾旱至少 ' + dr6 + '：' + W.h6.data.mean.paddy.toFixed(3))]);
  expect('h6 反例：稻子還沒長好時（第 70 天）乾旱拉到 1 不算', firing(snap(st({ drought: 1 }), 'param')).indexOf('h6') < 0);
  const t7 = town.map(k => ({ k, P: snap(st({ probe: k })).data.probe })).filter(x => x.P.ndbi >= 0.06);
  W.h7 = snap(st({ view: 'spectrum', probe: t7[0].k }), 'view');
  hidAll.push(['h7', witness('h7', W.h7, '城鎮 ' + town.length + ' 格中 NDBI ≥ 0.06 的有 ' + t7.length + ' 格；' + ij(t7[0].k) + ' ' + t7[0].P.ndbi.toFixed(3))]);
  expect('h7 反例：城鎮最常見的像元 NDBI < 0.06', town.length - t7.length > 0.8 * town.length);
  W.h8 = snap(st({ comp: 'custom', rgb: [1, 1, 1], haze: 0.1 }), 'param');
  hidAll.push(['h8', witness('h8', W.h8, '三個顏色都放波段 1、霧霾 0.1')]);
  expect('h8 反例：沒有霧霾不算', firing(snap(st({ comp: 'custom', rgb: [1, 1, 1] }), 'rgb')).indexOf('h8') < 0);
  let n9 = 0; const d9 = new Set();
  range(1, 365).forEach(d => PADDY.forEach(k => { const m = K.pixel(k, { day: d, turb: 0.3 }).mix; if (m.veg >= 0.22 && m.water >= 0.22 && m.soil >= 0.22) { n9++; d9.add(d); } }));
  const r9 = findPix([...d9], PADDY, P => P.mix.veg >= 0.22 && P.mix.water >= 0.22 && P.mix.soil >= 0.22);
  W.h9 = snap(st({ day: r9.day, probe: r9.k, layer: 'ndwi' }), 'probe');
  expect('h9 反例：同一格在真實色彩不算', firing(snap(st({ day: r9.day, probe: r9.k }), 'probe')).indexOf('h9') < 0);
  hidAll.push(['h9', witness('h9', W.h9, '第 ' + r9.day + ' 天 ' + ij(r9.k) + ' 植物 ' + r9.P.mix.veg.toFixed(2) + '、水 ' + r9.P.mix.water.toFixed(2) + '、土 ' + r9.P.mix.soil.toFixed(2) + '；做得到的（日、像元）' + n9 + ' 組，占稻田全年的 ' + (100 * n9 / (365 * PADDY.length)).toFixed(1) + '%')]);
  let n10 = 0; const c10 = [];
  range(200, 365).forEach(d => PADDY.forEach(k => { const v = K.indices(K.pixel(k, { day: d, turb: 0.3 }).bands).ndvi; if (v >= 0.8) { n10++; if (c10.length < 1) c10.push([d, k, v]); } }));
  W.h10 = snap(st({ day: c10[0][0], probe: c10[0][1], layer: 'ndvi' }), 'probe');
  hidAll.push(['h10', witness('h10', W.h10, '第 ' + c10[0][0] + ' 天 ' + ij(c10[0][1]) + ' NDVI ' + c10[0][2].toFixed(3) + '；做得到的（日、像元）' + n10 + ' 組，占第二期稻田的 ' + (100 * n10 / (166 * PADDY.length)).toFixed(2) + '%')]);
  expect('h10 反例：第一期最綠的像元不算', firing(snap(st({ day: 111, probe: c10[0][1], layer: 'ndvi' }), 'probe')).indexOf('h10') < 0);
}

console.log('\n[隱藏任務彼此不會順便完成]');
hidAll.forEach(([id, f]) => {
  const other = hiddenOf(f).filter(x => x !== id);
  expect(id + ' 的見證不會同時完成其他隱藏任務', other.length === 0, other.join('、') || '無');
});

console.log('\n[隨機亂玩]');
{
  let seed = 2024;
  const R = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const pick = a => a[Math.floor(R() * a.length)];
  const SL = { day: [1, 365, 1], drought: [0, 1, 0.05], turb: [0, 1, 0.05], haze: [0, 0.15, 0.005] };
  const val = q => { const [a, b, d] = SL[q], u = R(); const v = u < 0.2 ? a : u < 0.4 ? b : a + Math.round(R() * (b - a) / d) * d; return Math.round(v * 1000) / 1000; };
  const cnt = {}, tries = 200, steps = 20;
  for (let n = 0; n < tries; n++) {
    const s = st(), hits = new Set();
    for (let k = 0; k < steps; k++) {
      const a = R();
      let act = 'param';
      if (a < 0.1) { s.view = pick(['image', 'spectrum', 'scatter']); act = 'view'; }
      else if (a < 0.18) { s.layer = pick(['rgb', 'ndvi', 'ndwi']); s.view = 'image'; act = 'layer'; }
      else if (a < 0.26) { s.comp = pick(['natural', 'cir', 'agri', 'swir']); s.rgb = K.COMPOSITES[s.comp].slice(); s.layer = 'rgb'; s.view = 'image'; act = 'comp'; }
      else if (a < 0.32) { s.rgb[Math.floor(R() * 3)] = 1 + Math.floor(R() * 7); s.comp = 'custom'; s.layer = 'rgb'; s.view = 'image'; act = 'rgb'; }
      else if (a < 0.6) { if (s.view === 'image') s.probe = Math.floor(R() * N); act = 'probe'; }
      else { const q = pick(Object.keys(SL)); s[q] = val(q); act = q === 'day' ? 'day' : 'param'; }
      hiddenOf(firing(snap(s, act))).forEach(x => hits.add(x));
    }
    hits.forEach(x => { cnt[x] = (cnt[x] || 0) + 1; });
  }
  const worst = Object.keys(cnt).map(x => x + ' ' + (100 * cnt[x] / tries).toFixed(2) + '%').join('、') || '都沒有';
  expect('隨機亂玩 ' + tries + ' 次（每次 ' + steps + ' 步），隱藏任務碰巧完成的比例都低於 3%', Object.keys(cnt).every(x => cnt[x] / tries < 0.03), worst);
}

const pub = missions.filter(m => !m.hidden), hid = missions.filter(m => m.hidden);
console.log('\n合計：' + ok + ' 項通過，' + bad + ' 項失敗');
console.log('公開 ' + pub.length + ' 個（' + pub.reduce((a, m) => a + m.level, 0) + ' 顆星），隱藏 ' + hid.length + ' 個（' + hid.reduce((a, m) => a + 2 * m.level, 0) + ' 顆星）；7 級以上的隱藏任務 ' + hid.filter(m => m.level >= 7).length + ' 個');
if (bad) process.exitCode = 1;
