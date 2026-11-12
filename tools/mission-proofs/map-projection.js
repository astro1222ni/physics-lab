/* 任務可達成的證明腳本。用法：node tools/mission-proofs/map-projection.js
 * 修改核心或任務條件後重跑，確認每個任務都做得到、預設狀態與不該觸發的狀態不會觸發、隱藏任務彼此不會順便完成。
 * 事件 'map' 的內容和頁面一樣由 MapProjectionCore.snapshot 計算（js/map-projection.js 的 snapshot() 只是把頁面狀態交給它）。
 * 滑桿可打字的精度：λ0、φs、φ1、φ2、φ0 都是 0.01°（map-projection.html 的 data-decimals = 2）；陸塊、量測點、航線端點用拖曳，連續。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const K = require(ROOT + 'js/map-projection-core.js');
const W = require(ROOT + 'js/geog-world.js');
const missions = [];
global.window = { MapProjectionCore: K, LabMission: { register: (id, list) => list.forEach(m => missions.push(m)) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/map-projection.js');
const byId = id => missions.find(m => m.id === 'map-projection-' + id);
const DEG = K.DEG;

// 和頁面相同的陸塊表
const SH = {};
Object.keys(W.shapes).forEach(k => {
  const ring = W.decode(W.shapes[k]).map(p => [p[0] * DEG, p[1] * DEG]);
  SH[k] = { ring: ring, home: K.centroid(ring), area: K.trueArea(ring) };
});
const CITY = { taipei: [121.56, 25.03], tokyo: [139.69, 35.68], newyork: [-74.01, 40.71], london: [-0.13, 51.51], sydney: [151.21, -33.87],
  capetown: [18.42, -33.92], saopaulo: [-46.63, -23.55], losangeles: [-118.24, 34.05], dubai: [55.27, 25.20], anchorage: [-149.90, 61.22],
  singapore: [103.82, 1.35], quito: [-78.47, -0.18], reykjavik: [-21.94, 64.15], buenosaires: [-58.38, -34.60], cairo: [31.24, 30.04], moscow: [37.62, 55.76] };
const ll = (lonDeg, latDeg) => [lonDeg * DEG, latDeg * DEG];

/** 頁面狀態（預設值和 js/map-projection.js 相同） */
function page(o) {
  return Object.assign({ proj: 'mercator', lam0: 0, phiS: 0, phi1: 20, phi2: 50, phi0: 90, img: true, grid: true, tissot: true, heat: 'none',
    unroll: 0, view: '2d', shape: null, shapeAt: null, probes: [], route: false, A: ll(121.56, 25.03), B: ll(-74.01, 40.71), cityA: 'taipei', cityB: 'newyork' }, o);
}
function cities(s, a, b) { s.route = true; s.cityA = a; s.cityB = b; s.A = ll(CITY[a][0], CITY[a][1]); s.B = ll(CITY[b][0], CITY[b][1]); return s; }
function custom(s, A, B) { s.route = true; s.cityA = 'custom'; s.cityB = 'custom'; s.A = A; s.B = B; return s; }
function probe(s, lonDeg, latDeg) { s.probes = s.probes.concat([{ lam: lonDeg * DEG, phi: latDeg * DEG }]); return s; }
const proj = s => K.make({ id: s.proj, lam0: s.lam0, phiS: s.phiS, phi1: s.phi1, phi2: s.phi2, phi0: s.phi0 });
const snap = s => K.snapshot(proj(s), s, SH);
const ev = s => ({ type: 'map', data: snap(s) });
const hits = (id, s) => byId(id).check(ev(s));
/** 從中心 (λ, φ)（度）沿方位角 az 走 dist 公里到達的點（度） */
function dest(lonDeg, latDeg, az, distKm) {
  const c = distKm / K.R_EARTH, f = latDeg * DEG, a = az * DEG;
  const f2 = Math.asin(Math.sin(f) * Math.cos(c) + Math.cos(f) * Math.sin(c) * Math.cos(a));
  const l2 = lonDeg * DEG + Math.atan2(Math.sin(a) * Math.sin(c) * Math.cos(f), Math.cos(c) - Math.sin(f) * Math.sin(f2));
  return [K.wrapPi(l2) / DEG, f2 / DEG];
}
/** 拖曳陸塊：用二分法找出讓 g(緯度) 剛好等於目標的緯度（拖曳是連續的，取到 0.01°） */
function solveLat(fn, target, lo, hi) {
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if ((fn(lo) - target) * (fn(m) - target) <= 0) hi = m; else lo = m; }
  return Math.round((lo + hi) / 2 * 100) / 100;
}

let ok = 0, bad = 0;
function expect(label, cond, extra) {
  if (cond) { ok++; console.log('  ✓ ' + label + (extra ? '（' + extra + '）' : '')); }
  else { bad++; console.error('  ✗ ' + label + (extra ? '（' + extra + '）' : '')); }
}
const f = (v, d) => v == null ? '—' : v.toFixed(d == null ? 3 : d);
const firing = s => missions.filter(m => m.check(ev(s))).map(m => m.id.replace('map-projection-', ''));

console.log('map-projection 任務證明');
// 預設狀態、只換投影、只開一個圖層或陸塊或航線：都不觸發隱藏任務，預設也不觸發任何任務
expect('預設狀態不觸發任何任務', firing(page()).length === 0, firing(page()).join(',') || '無');
{
  const bad0 = [];
  K.LIST.forEach(p => {
    const id = p.id;
    const variants = [page({ proj: id }), page({ proj: id, img: false }), page({ proj: id, tissot: false }), page({ proj: id, route: true }),
      page({ proj: id, img: false, tissot: false, route: true })];
    Object.keys(SH).forEach(k => variants.push(page({ proj: id, shape: k })));
    variants.forEach(s => firing(s).filter(x => x[0] === 'h').forEach(x => bad0.push(id + ':' + x)));
  });
  expect('逐一切換 14 種投影（預設參數，只開一個圖層、陸塊或航線）不觸發隱藏任務，除了 h1 需要的特定圖層組合', bad0.every(x => /aeqd:h1/.test(x)), bad0.join(', ') || '無');
}

// 1
let s = page({ shape: 'greenland' });
expect('1 麥卡托上原位的格陵蘭放大 ' + f(snap(s).shape.ratio, 2) + ' 倍', hits('1', s));
expect('1 等距圓柱上只有 ' + f(snap(page({ proj: 'equirect', shape: 'greenland' })).shape.ratio, 2) + ' 倍', !hits('1', page({ proj: 'equirect', shape: 'greenland' })));
// 2
s = page({ shape: 'greenland', shapeAt: [SH.greenland.home[0], 1 * DEG] });
expect('2 搬到北緯 1° → ' + f(snap(s).shape.ratio) + ' 倍', hits('2', s));
s = page({ shape: 'greenland', shapeAt: [SH.greenland.home[0], 5 * DEG] });
expect('2 北緯 5° 不算', !hits('2', s));
// 3
['equalearth', 'mollweide', 'sinusoidal', 'cea', 'albers', 'laea'].forEach(id => {
  const t = page({ proj: id, shape: 'greenland' });
  expect('3 ' + id + ' 上格陵蘭 ' + f(snap(t).shape.ratio, 5) + ' 倍', hits('3', t));
});
expect('3 羅賓森（折衷）不算：' + f(snap(page({ proj: 'robinson', shape: 'greenland' })).shape.ratio) + ' 倍', !hits('3', page({ proj: 'robinson', shape: 'greenland' })));
// 4
s = probe(page(), 10, 60);
expect('4 北緯 60° 面積倍率 ' + f(snap(s).probe.s), hits('4', s));
expect('4 北緯 59.3° → ' + f(snap(probe(page(), 10, 59.3)).probe.s) + ' 不算', !hits('4', probe(page(), 10, 59.3)));
// 5
{
  const lon = SH.greenland.home[0];
  const vs = lat => snap(page({ shape: 'greenland', shapeAt: [lon, lat * DEG] })).shape.vsAfrica;
  expect('5 原位時格陵蘭看起來是非洲的 ' + f(snap(page({ shape: 'greenland' })).shape.vsAfrica) + ' 倍（沒搬動不算）', !hits('5', page({ shape: 'greenland' })));
  const lat = solveLat(vs, 1, 60, 76);
  s = page({ shape: 'greenland', shapeAt: [lon, lat * DEG] });
  expect('5 搬到北緯 ' + lat + '° → 非洲的 ' + f(snap(s).shape.vsAfrica) + ' 倍（真實只有 ' + f(snap(s).shape.trueVsAfrica) + ' 倍）', hits('5', s));
  const lo = solveLat(vs, 0.97, 60, 76), hi = solveLat(vs, 1.03, 60, 76);
  expect('5 可接受的緯度帶：北緯 ' + lo + '°–' + hi + '°（寬 ' + f(hi - lo, 2) + '°，用拖曳停得進去）', hi - lo > 0.2);
  expect('5 北緯 70° 不算', !hits('5', page({ shape: 'greenland', shapeAt: [lon, 70 * DEG] })));
}
// 6
s = probe(page({ proj: 'cea', phiS: 45 }), 20, 1);
expect('6 高爾－彼得斯赤道 ω = ' + f(snap(s).probe.omega, 2) + '°', hits('6', s));
expect('6 φs = 30° 不算', !hits('6', probe(page({ proj: 'cea', phiS: 30 }), 20, 1)));
// 7
s = cities(page(), 'anchorage', 'moscow');
expect('7 安克拉治→莫斯科 等角／大圓 = ' + f(snap(s).route.rh / snap(s).route.gc), hits('7', s));
s = cities(page(), 'reykjavik', 'tokyo');
expect('7 雷克雅維克→東京 = ' + f(snap(s).route.rh / snap(s).route.gc), hits('7', s));
{ let n7 = 0; Object.keys(CITY).forEach(a => Object.keys(CITY).forEach(b => { if (a < b && hits('7', cities(page(), a, b))) n7++; })); expect('7 120 組城市裡只有 ' + n7 + ' 組做得到', n7 > 0 && n7 <= 4); }
expect('7 預設的臺北→紐約只有 ' + f(snap(cities(page(), 'taipei', 'newyork')).route.rh / snap(cities(page(), 'taipei', 'newyork')).route.gc) + ' 不算', !hits('7', cities(page(), 'taipei', 'newyork')));
expect('7 洛杉磯→莫斯科 ' + f(snap(cities(page(), 'losangeles', 'moscow')).route.rh / snap(cities(page(), 'losangeles', 'moscow')).route.gc) + ' 不算', !hits('7', cities(page(), 'losangeles', 'moscow')));
expect('7 自訂的端點不算（要從城市選單選）', !hits('7', custom(page(), ll(0, 75), ll(170, 75))));
// 8、12
s = page({ proj: 'lcc', phi1: 22, phi2: 25 });
expect('8 蘭伯特圓錐 22°/25° → 臺灣比例誤差 ' + f(snap(s).tw.scale * 100, 4) + '%', hits('8', s) && !hits('12', s));
expect('8 預設 20°/50° → ' + f(snap(page({ proj: 'lcc' })).tw.scale * 100, 3) + '% 不算', !hits('8', page({ proj: 'lcc' })));
expect('8 亞伯斯等積圓錐不算（要等角圓錐）', !hits('8', page({ proj: 'albers', phi1: 22, phi2: 25 })));
s = page({ proj: 'lcc', phi1: 22.4, phi2: 24.8 });
expect('12 22.4°/24.8°（打字輸入）→ ' + f(snap(s).tw.scale * 100, 4) + '%', hits('12', s));
s = page({ proj: 'lcc', phi1: 22.5, phi2: 24.5 });
expect('12 滑桿 22.5°/24.5° → ' + f(snap(s).tw.scale * 100, 4) + '% 不夠', !hits('12', s));
{
  let n = 0;
  for (let a = 21; a <= 26; a += 0.01) for (let b = a; b <= 26; b += 0.01) if (K.taiwanError(K.make({ id: 'lcc', phi1: a, phi2: b })).scale <= 0.00025) n++;
  expect('12 打字精度 0.01° 時有 ' + n + ' 組標準緯線做得到（需要找到最佳附近）', n > 0);
}
// 9、h9（以臺北為中心的等距方位：滑桿 φ0 = 25、λ0 = 122）
{
  const base = { proj: 'aeqd', phi0: 25, lam0: 122 };
  const p10 = dest(121.56, 25.03, 50, 10000);
  s = probe(page(base), p10[0], p10[1]);
  expect('9 離臺北 ' + f(snap(s).probe.dist, 0) + ' km（' + f(p10[1], 1) + '°, ' + f(p10[0], 1) + '°）', hits('9', s) && !hits('h9', s));
  const p98 = dest(121.56, 25.03, 50, 9800);
  expect('9 9,800 km 不算', !hits('9', probe(page(base), p98[0], p98[1])));
  expect('9 中心在北極不算', !hits('9', probe(page({ proj: 'aeqd' }), p10[0], p10[1])));
  s = probe(page(base), 121.56 - 180, -25.03);
  expect('h9 臺北的對蹠點 → ' + f(snap(s).probe.dist, 0) + ' km', hits('h9', s) && !hits('9', s));
  const p19 = dest(121.56, 25.03, 50, 19500);
  expect('h9 19,500 km 不算', !hits('h9', probe(page(base), p19[0], p19[1])));
}
// 10
s = cities(page({ proj: 'gnomonic', phi0: 0, lam0: 135 }), 'taipei', 'sydney');
expect('10 心射、中心 (0°, 135°E)：臺北→雪梨 ' + f(snap(s).route.gc, 0) + ' km，偏離直線 ' + f(snap(s).route.strG, 6), hits('10', s));
expect('10 預設中心（北極）畫不出雪梨', !hits('10', cities(page({ proj: 'gnomonic' }), 'taipei', 'sydney')));
expect('10 臺北→紐約不跨赤道不算', !hits('10', cities(page({ proj: 'gnomonic' }), 'taipei', 'newyork')));
expect('10 麥卡托上大圓不是直線', !hits('10', cities(page(), 'taipei', 'sydney')));
// 11
s = custom(page(), ll(10, 30), ll(-170, 20));
expect('11 北緯 30°、東經 10° → 北緯 20°、西經 170°（經度差 180°）：大圓最高到 ' + f(snap(s).route.gcMaxLat, 2) + '°', hits('11', s));
s = custom(page(), ll(10, 30), ll(-169.6, 20));
expect('11 經度差 179.6° → ' + f(snap(s).route.gcMaxLat, 2) + '°（容許的範圍，拖曳做得到）', hits('11', s));
s = custom(page(), ll(10, 30), ll(-168.8, 20));
expect('11 經度差 178.8° → ' + f(snap(s).route.gcMaxLat, 2) + '° 不算', !hits('11', s));
s = custom(page(), ll(10, 30), ll(-167, 20));
expect('11 經度差 177° → ' + f(snap(s).route.gcMaxLat, 2) + '° 不算', !hits('11', s));
{
  let best = 0, who = '';
  Object.keys(CITY).forEach(a => Object.keys(CITY).forEach(b => { if (a < b && Math.abs(CITY[a][1]) <= 45 && Math.abs(CITY[b][1]) <= 45) { const r = snap(cities(page(), a, b)).route; if (r.gcMaxLat > best) { best = r.gcMaxLat; who = a + '→' + b; } } }));
  expect('11 城市選單裡最接近的是 ' + who + '（' + f(best, 2) + '°）：只選城市不算（至少要拖一端）', !hits('11', cities(page(), 'buenosaires', 'taipei')));
  s = cities(page(), 'buenosaires', 'taipei'); s.cityB = 'custom'; s.B = ll(121.56, 23.03);
  expect('11 選布宜諾斯艾利斯→臺北，再用方向鍵把臺北往南移 2° → ' + f(snap(s).route.gcMaxLat, 2) + '°', hits('11', s));
}
{
  // 頂點公式和密集取樣一致
  const A = ll(121.56, 25.03), B = ll(-74.01, 40.71), pts = K.geodesic(A, B, 20000);
  const m = Math.max.apply(null, pts.map(p => Math.abs(p[1]))) / DEG;
  expect('11 大圓最高緯度的頂點公式 = 密集取樣（臺北→紐約 ' + f(snap(cities(page(), 'taipei', 'newyork')).route.gcMaxLat, 4) + '° vs ' + f(m, 4) + '°）', Math.abs(snap(cities(page(), 'taipei', 'newyork')).route.gcMaxLat - m) < 1e-3);
}

// ---------- 隱藏任務 ----------
const hidden = {};
hidden.h1 = page({ proj: 'aeqd', img: false, tissot: false });
expect('h1 北極為中心的等距方位、平面色、經緯網（聯合國徽章）', hits('h1', hidden.h1));
expect('h1 開著衛星影像不算', !hits('h1', page({ proj: 'aeqd', tissot: false })));
hidden.h2 = page({ proj: 'lcc', phi1: 30, phi2: -30 });
expect('h2 蘭伯特圓錐 30°/−30° → n = ' + f(snap(hidden.h2).n, 6), hits('h2', hidden.h2));
expect('h2 亞伯斯 25°/−25° 也是', hits('h2', page({ proj: 'albers', phi1: 25, phi2: -25 })));
expect('h2 30°/−29° → n = ' + f(snap(page({ proj: 'lcc', phi1: 30, phi2: -29 })).n, 4) + ' 不算', !hits('h2', page({ proj: 'lcc', phi1: 30, phi2: -29 })));
hidden.h3 = page({ proj: 'ortho', phi0: 24, lam0: 121 });
expect('h3 以臺灣為中心的正射', hits('h3', hidden.h3));
expect('h3 正射預設（北極）不算', !hits('h3', page({ proj: 'ortho' })));
hidden.h4 = page({ proj: 'lcc', phi1: 80, phi2: 80 });
expect('h4 兩條標準緯線都在 80° → n = ' + f(snap(hidden.h4).n, 4), hits('h4', hidden.h4));
expect('h4 75°/80° → n = ' + f(snap(page({ proj: 'lcc', phi1: 75, phi2: 80 })).n, 4) + ' 不算', !hits('h4', page({ proj: 'lcc', phi1: 75, phi2: 80 })));
hidden.h5 = custom(page(), ll(10, 0), ll(50, 0));
expect('h5 沿赤道 ' + f(snap(hidden.h5).route.gc, 0) + ' km：兩條都是直線而且重合', hits('h5', hidden.h5));
expect('h5 沿經線也可以', hits('h5', custom(page(), ll(30, -20), ll(30, 25))));
expect('h5 兩端都在赤道附近 1° 內也算（兩條幾乎重合，大圓偏離直線 ' + f(snap(custom(page(), ll(10, 0), ll(50, 1))).route.strG, 5) + '）', hits('h5', custom(page(), ll(10, 0), ll(50, 1))));
expect('h5 終點偏北 3° 就不算（偏離 ' + f(snap(custom(page(), ll(10, 0), ll(50, 3))).route.strG, 5) + '）', !hits('h5', custom(page(), ll(10, 0), ll(50, 3))));
expect('h5 預設的臺北→紐約不算', !hits('h5', cities(page(), 'taipei', 'newyork')));
hidden.h6 = probe(page({ proj: 'cea', phiS: 30 }), 40, 30);
expect('h6 等積圓柱 φs = 30°，量測點在北緯 30° → ω = ' + f(snap(hidden.h6).probe.omega, 4) + '°', hits('h6', hidden.h6));
expect('h6 北緯 31° → ω = ' + f(snap(probe(page({ proj: 'cea', phiS: 30 }), 40, 31)).probe.omega, 3) + '° 不算', !hits('h6', probe(page({ proj: 'cea', phiS: 30 }), 40, 31)));
{
  const lon = SH.greenland.home[0];
  const r = lat => snap(page({ proj: 'robinson', shape: 'greenland', shapeAt: [lon, lat * DEG] })).shape.ratio;
  const lat = solveLat(r, 1, 30, 60);
  hidden.h7 = page({ proj: 'robinson', shape: 'greenland', shapeAt: [lon, lat * DEG] });
  const lo = solveLat(r, 0.995, 30, 60), hi = solveLat(r, 1.005, 30, 60);
  expect('h7 羅賓森上格陵蘭搬到北緯 ' + lat + '° → ' + f(snap(hidden.h7).shape.ratio, 4) + ' 倍（可接受 ' + lo + '°–' + hi + '°）', hits('h7', hidden.h7));
  expect('h7 原位不算', !hits('h7', page({ proj: 'robinson', shape: 'greenland' })));
  const latS = solveLat(r, 1, -60, -30);
  expect('h7 南半球也有一條（南緯 ' + (-latS) + '°）', hits('h7', page({ proj: 'robinson', shape: 'greenland', shapeAt: [lon, latS * DEG] })));
}
hidden.h8 = page({ proj: 'lcc', phi1: 30, phi2: 30, view: '3d', unroll: 1 });
expect('h8 3D、標準緯線 30°/30°（n = ' + f(snap(hidden.h8).n, 4) + '）攤平', hits('h8', hidden.h8));
expect('h8 還沒攤平不算', !hits('h8', page({ proj: 'lcc', phi1: 30, phi2: 30, view: '3d', unroll: 0.6 })));
expect('h8 2D 不算', !hits('h8', page({ proj: 'lcc', phi1: 30, phi2: 30, unroll: 1 })));
hidden.h9 = probe(page({ proj: 'aeqd', phi0: 25, lam0: 122 }), 121.56 - 180, -25.03);
hidden.h10 = custom(page(), ll(0, 70), ll(180, 70));
expect('h10 北緯 70° 兩條相對的經線：等角／大圓 = ' + f(snap(hidden.h10).route.rh / snap(hidden.h10).route.gc), hits('h10', hidden.h10));
expect('h10 北緯 60° → ' + f(snap(custom(page(), ll(0, 60), ll(180, 60))).route.rh / snap(custom(page(), ll(0, 60), ll(180, 60))).route.gc) + ' 不算', !hits('h10', custom(page(), ll(0, 60), ll(180, 60))));
{
  let best = 0;
  Object.keys(CITY).forEach(a => Object.keys(CITY).forEach(b => { if (a !== b) { const r = snap(cities(page(), a, b)).route; best = Math.max(best, r.rh / r.gc); } }));
  expect('h10 城市選單裡最大只有 ' + f(best) + '：要自己拖端點，所以和公開任務 7 不會同時完成', best < 1.52);
}
// 隱藏任務彼此不會順便完成
Object.keys(hidden).forEach(k => {
  const other = firing(hidden[k]).filter(x => x[0] === 'h' && x !== k);
  expect(k + ' 的狀態不會順便完成其他隱藏任務', other.length === 0, other.join(',') || '無');
});

// 星星與等級分布
const pub = missions.filter(m => !m.hidden), hid = missions.filter(m => m.hidden);
const stars = pub.reduce((a, m) => a + m.level, 0), hstars = hid.reduce((a, m) => a + m.level * 2, 0);
expect('公開 8–12 個', pub.length >= 8 && pub.length <= 12, pub.length + ' 個');
expect('隱藏 10 個、等級 3–10、至少 3 個 7 級以上', hid.length === 10 && hid.every(m => m.level >= 3 && m.level <= 10) && hid.filter(m => m.level >= 7).length >= 3,
  hid.map(m => m.level).join(','));
console.log(`\n公開 ${pub.length} 個（${stars} 顆星），隱藏 ${hid.length} 個（等級 × 2 共 ${hstars} 顆星），合計 ${stars + hstars} 顆`);
console.log(`${ok} 項通過${bad ? '，' + bad + ' 項失敗' : ''}`);
if (bad) process.exitCode = 1;
