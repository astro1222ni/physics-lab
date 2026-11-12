/* 任務可達成的證明腳本。用法：node tools/mission-proofs/contour-map.js
 * 修改核心或任務條件後重跑，確認每個任務都做得到、預設狀態與不該觸發的狀態不會觸發、隱藏任務彼此不會順便完成。
 * 事件 'terrain' 的內容和頁面一樣由 ContourCore.snapshot 計算（js/contour-map.js 的 snapshot() 只是把頁面狀態交給它）。
 * 操作精度：量測點與剖面端點用拖曳（地圖 470 px 對 8 km，約每像素 17 m）再用方向鍵每步 10 m 微調，所以這裡的位置都取 10 m 的整數倍；
 * 海平面、水平切面可以打字到 0.1 m（data-decimals = 1）；垂直誇大滑桿每格 0.5。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const K = require(ROOT + 'js/contour-map-core.js');
const missions = [];
global.window = { ContourCore: K, LabMission: { register: (id, list) => list.forEach(m => missions.push(m)) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/contour-map.js');
const byId = id => missions.find(m => m.id === 'contour-map-' + id);

const TR = {};
const terr = id => TR[id] || (TR[id] = K.make(id));
/** 頁面狀態（預設值和 js/contour-map.js 相同） */
function page(o) {
  return Object.assign({ preset: 'twin', interval: 50, vexag: 2, sea: 0, slice: 600, view: '2d',
    layers: { tint: 'height', shade: true, lines: true, rivers: true }, probe: [4300, 5300], A: [100, 6500], B: [7750, 1750] }, o);
}
const snap = s => K.snapshot(terr(s.preset), s);
const ev = s => ({ type: 'terrain', data: snap(s) });
const hits = (id, s) => byId(id).check(ev(s));
const firing = s => { const e = ev(s); return missions.filter(m => m.check(e)).map(m => m.id.replace('contour-map-', '')); };
const hiddenFiring = s => firing(s).filter(x => x[0] === 'h');
const r10 = v => Math.round(v / 10) * 10;
const lat = p => [r10(p[0]), r10(p[1])];

let ok = 0, bad = 0;
function expect(label, cond, extra) {
  if (cond) { ok++; console.log('  ✓ ' + label + (extra ? '（' + extra + '）' : '')); }
  else { bad++; console.error('  ✗ ' + label + (extra ? '（' + extra + '）' : '')); }
}
const f = (v, d) => v == null ? '—' : (+v).toFixed(d == null ? 2 : d);
const used = {};          // 每個任務的見證狀態
function witness(id, s, note) {
  used[id] = s;
  const fs = firing(s);
  expect(id + ' 做得到', fs.indexOf(id) >= 0, note + '；同時完成：' + (fs.filter(x => x !== id).join('、') || '無'));
}
/** 在 (cx, cy) 周圍 r 公尺內，以 10 m 格點找第一個讓 test 成立的點 */
function scan(cx, cy, r, test) {
  const out = [];
  for (let dy = -r; dy <= r; dy += 10) for (let dx = -r; dx <= r; dx += 10) {
    const p = [r10(cx) + dx, r10(cy) + dy];
    if (p[0] < 0 || p[1] < 0 || p[0] > K.SIZE || p[1] > K.SIZE) continue;
    if (test(p)) out.push(p);
  }
  return out;
}

console.log('contour-map 任務證明');

// ---------- 不該觸發的狀態 ----------
console.log('\n[預設與一般操作]');
expect('預設狀態（任何操作後送出的第一個事件）不觸發任何任務', firing(page()).length === 0, firing(page()).join('、'));
[{ interval: 10 }, { interval: 100 }, { layers: { tint: 'slope', shade: true, lines: true, rivers: true } }, { layers: { tint: 'none', shade: false, lines: false, rivers: false } },
  { vexag: 1 }, { vexag: 10 }, { slice: 0 }, { slice: 1000 }, { view: '3d' }, { probe: null }, { A: null, B: null }].forEach(o => {
  const fs = firing(page(o));
  expect('只改 ' + JSON.stringify(o).slice(0, 60) + ' 不觸發', fs.length === 0, fs.join('、'));
});
K.PRESETS.forEach(id => {
  const fs = firing(page({ preset: id }));
  expect('換成 ' + id + '（量測點與剖面線留在原處）不觸發', fs.length === 0, fs.join('、'));
  const fs3 = firing(page({ preset: id, view: '3d' }));
  expect('換成 ' + id + ' 再切到 3D 不觸發', fs3.length === 0, fs3.join('、'));
});

// ---------- 公開任務 ----------
console.log('\n[公開任務]');
{
  const T = terr('twin');
  const c = scan(T.summit[0], T.summit[1], 100, p => T.h(p[0], p[1]) >= T.max - 5);
  witness('1', page({ probe: c[0] }), '雙峰島最高點 ' + f(T.max, 1) + ' m，量測點 ' + c[0] + ' 高 ' + f(T.h(c[0][0], c[0][1]), 1) + ' m；10 m 格點中有 ' + c.length + ' 個合格');
}
{
  const T = terr('twin');
  const c = scan(4000, 4000, 3000, p => T.h(p[0], p[1]) > 0 && K.slope(T, p[0], p[1]).pct > 55);
  witness('2', page({ probe: c[0] }), '雙峰島坡度 > 55% 的 10 m 格點有 ' + c.length + ' 個；例 ' + c[0] + ' 坡度 ' + f(K.slope(T, c[0][0], c[0][1]).pct, 1) + '%');
}
{
  const T = terr('twin');
  const B = scan(T.summit[0], T.summit[1], 100, p => T.h(p[0], p[1]) >= T.max - 20)[0];
  witness('3', page({ B: B }), 'A 留在預設的 (100, 6500)，高 ' + f(T.h(100, 6500), 1) + ' m（海裡），B 拖到最高峰 ' + B);
}
{
  const T = terr('twin');
  const A = [1700, 4700], B = [4200, 4800];
  const P = K.profile(T, A, B, 400);
  witness('4', page({ A: A, B: B }), 'A ' + f(P.hA, 0) + ' m、B ' + f(P.hB, 0) + ' m 隔著最高峰，視線低了 ' + f(-P.clear, 0) + ' m');
}
{
  const T = terr('twin');
  const c = scan(4000, 4000, 3600, p => { if (T.h(p[0], p[1]) <= 0) return false; const s = K.slope(T, p[0], p[1]); return s.pct >= 30 && s.aspect >= 175 && s.aspect <= 185; });
  witness('5', page({ probe: c[0] }), '雙峰島朝南、坡度 ≥ 30% 的 10 m 格點有 ' + c.length + ' 個；例 ' + c[0]);
}
let saddle = null;
{
  const T = terr('twin');
  const c = scan(4200, 4000, 200, p => K.crit(T, p[0], p[1]) === 'saddle' && T.h(p[0], p[1]) >= 200);
  saddle = c[0];
  witness('6', page({ probe: c[0] }), '雙峰島鞍部附近坡度 < 3% 且判定為鞍部的 10 m 格點有 ' + c.length + ' 個；例 ' + c[0] + ' 高 ' + f(T.h(c[0][0], c[0][1]), 1) + ' m');
  const cv = scan(4600, 4600, 2600, p => K.crit(terr('valley'), p[0], p[1]) === 'saddle' && terr('valley').h(p[0], p[1]) >= 200);
  expect('河谷島的山口也找得到鞍部', cv.length > 0, cv.length + ' 個格點，例 ' + cv[0]);
}
{
  const T = terr('twin'), H = K.hydro(T);
  let best = null;
  for (let k = 0; k < K.N * K.N && !best; k++) {
    if (H.acc[k] * K.CELL * K.CELL / 1e6 >= 1.2 && T.grid[k] >= 60) best = [(k % K.N) * K.CELL, Math.floor(k / K.N) * K.CELL];
  }
  const s = page({ probe: best });
  witness('7', s, '雙峰島河道上的格點 ' + best + '：高 ' + f(snap(s).probe.h, 0) + ' m、集水 ' + f(snap(s).probe.catchment, 2) + ' km²');
}
{
  const T = terr('twin');
  // 一段坡角不到 20° 的剖面，用垂直誇大 6 倍畫
  const A = [3600, 2600], B = [3600, 3700];
  const P = K.profile(T, A, B, 400);
  const s = page({ A: A, B: B, vexag: 7 });
  witness('8', s, '最陡 ' + f(P.maxDeg, 1) + '°，誇大 7 倍看起來 ' + f(snap(s).prof.appDeg, 1) + '°');
  expect('同一條剖面在誇大 4 倍時還不到 60°', !hits('8', page({ A: A, B: B, vexag: 4 })), f(K.apparentDeg(P.maxDeg, 4), 1) + '°');
}
{
  const r2 = K.islandRange(terr('twin'), 2);
  witness('9', page({ sea: 500 }), '雙峰島在海平面 ' + r2[0] + '–' + r2[1] + ' m 時分成兩座；取 500 m');
}
{
  const T = terr('twin');
  const ok10 = [];
  for (let s = 0; s <= 400; s += 0.1) { const fr = K.islands(T, +s.toFixed(1)).frac; if (fr >= 0.495 && fr <= 0.505) ok10.push(+s.toFixed(1)); }
  witness('10', page({ sea: ok10[0] }), '雙峰島剩一半的海平面（0.1 m 精度）：' + ok10[0] + '–' + ok10[ok10.length - 1] + ' m，共 ' + ok10.length + ' 個值');
  const oki = ok10.filter(v => Math.abs(v - Math.round(v)) < 1e-9);
  expect('只用滑桿（每格 1 m）也停得到', oki.length > 0, oki.join('、'));
}
{
  const T = terr('twin'), h = T.h(saddle[0], saddle[1]);
  const s = page({ probe: saddle, view: '3d', slice: Math.round(h * 10) / 10 });
  witness('11', s, '3D、量測點在鞍部 ' + f(h, 1) + ' m、切面 ' + s.slice + ' m');
  expect('2D 檢視同樣的設定不算', !hits('11', Object.assign({}, s, { view: '2d' })));
  expect('切面差 2 m 不算', !hits('11', Object.assign({}, s, { slice: s.slice + 2 })));
}
{
  const T = terr('twin');
  const A = lat(T.summit);
  let found = null, count = 0;
  for (let ang = 0; ang < 360; ang += 3) {
    for (let L = 2000; L <= 3400; L += 10) {
      const B = [r10(A[0] + L * Math.cos(ang * Math.PI / 180)), r10(A[1] + L * Math.sin(ang * Math.PI / 180))];
      const P = K.profile(T, A, B, 400);
      if (P.L >= 2000 && P.landAll && P.avg >= 24.8 && P.avg <= 25.2) { count++; if (!found) found = [B, P]; }
    }
  }
  witness('12', page({ A: A, B: found[0] }), 'A 在最高峰 ' + A + '，B ' + found[0] + '：長 ' + f(found[1].L, 0) + ' m、平均坡度 ' + f(found[1].avg, 2) + '%；掃描到 ' + count + ' 個合格的 B');
}

// ---------- 隱藏任務 ----------
console.log('\n[隱藏任務]');
{
  const T = terr('volcano');
  const c = scan(4050, 3950, 300, p => K.depression(T, p[0], p[1]) >= 100);
  witness('h1', page({ preset: 'volcano', probe: c[0] }), '火山口內窪地深度 ≥ 100 m 的 10 m 格點有 ' + c.length + ' 個（最深 ' + f(K.depression(T, 4050, 3950), 0) + ' m）');
}
{
  const T = terr('twin'), v = [];
  for (let s = T.max - 20; s < T.max; s += 0.1) { const s1 = +s.toFixed(1), I = K.islands(T, s1); if (I.count === 1 && I.area > 0 && I.area <= 0.02) v.push(s1); }
  witness('h2', page({ sea: v[0] }), '雙峰島在海平面 ' + v[0] + '–' + v[v.length - 1] + ' m 只剩一小塊（≤ 0.02 km²）');
  const oki = v.filter(x => Math.abs(x - Math.round(x)) < 1e-9);
  expect('h2 用滑桿（每格 1 m）也停得到', oki.length > 0, oki.join('、'));
}
{
  const T = terr('twin');
  const c = scan(5350, 3350, 200, p => K.crit(T, p[0], p[1]) === 'peak' && Math.hypot(p[0] - T.summit[0], p[1] - T.summit[1]) >= 1000);
  witness('h3', page({ probe: c[0] }), '雙峰島第二座山頂（' + f(T.h(c[0][0], c[0][1]), 0) + ' m）判定為山頂的 10 m 格點有 ' + c.length + ' 個');
}
{
  const T = terr('valley');
  const c = scan(4000, 4000, 3500, p => { const s = K.slope(T, p[0], p[1]); return T.h(p[0], p[1]) > 0 && s.pct >= 99.5 && s.pct <= 100.5; });
  witness('h4', page({ preset: 'valley', probe: c[0] }), '河谷島坡度 99.5%–100.5% 的 10 m 格點有 ' + c.length + ' 個；例 ' + c[0]);
}
{
  const T = terr('twin');
  let found = null;
  // 相距 100 m 以內、視線被地形擋住 8 m 以上：要跨過尖銳的稜線或崖邊（在 10 m 格點上找）
  for (let x = 2000; x <= 6000 && !found; x += 20) for (let y = 2000; y <= 6000 && !found; y += 20) {
    for (const [dx, dy] of [[100, 0], [0, 100], [70, 70], [70, -70]]) {
      const A = [x, y], B = [x + dx, y + dy];
      const P = K.profile(T, A, B, 400);
      if (P.L <= 100 && P.hA > 0 && P.hB > 0 && P.clear <= -8) { found = [A, B, P]; break; }
    }
  }
  witness('h5', page({ A: found[0], B: found[1] }), 'A ' + found[0] + '、B ' + found[1] + '：相距 ' + f(found[2].L, 0) + ' m，視線低了 ' + f(-found[2].clear, 2) + ' m');
}
{
  const T = terr('twin');
  let found = null, cnt = 0;
  for (let k = 0; k < 40000 && cnt < 30; k++) {
    const x = r10(1500 + (k * 7919 % 5000)), y = r10(1500 + (k * 104729 % 5000));
    const s = K.slope(T, x, y); if (s.pct < 32 || T.h(x, y) < 50) continue;
    const m = Math.hypot(s.gx, s.gy), tx = -s.gy / m, ty = s.gx / m;
    const A = [r10(x - 320 * tx), r10(y - 320 * ty)], B = [r10(x + 320 * tx), r10(y + 320 * ty)];
    const P = K.profile(T, A, B, 400);
    if (P.landAll && P.L >= 600 && P.maxH - P.minH <= 3 && P.midPct >= 30) { cnt++; if (!found) found = [A, B, P]; }
  }
  witness('h6', page({ A: found[0], B: found[1] }), '沿等高線 ' + f(found[2].L, 0) + ' m、高低差 ' + f(found[2].maxH - found[2].minH, 2) + ' m、腳下坡度 ' + f(found[2].midPct, 0) + '%；找到 ' + cnt + ' 組');
}
const ridgeP = P => P.grazeAt / P.L >= 0.1 && P.grazeAt / P.L <= 0.9 && P.grazeH >= Math.min(P.hA, P.hB) + 20;
/** 固定 A，沿一個方向一格一格移動 B（10 m），找出視線剛好擦過山脊的位置 */
function grazeSearch(T, want) {
  const res = [];
  for (let k = 0; k < 600 && res.length < 6; k++) {
    const A = [r10(800 + (k * 2311) % 6400), r10(800 + (k * 4567) % 6400)];
    if (T.h(A[0], A[1]) <= 5) continue;
    const th = (k * 37 % 360) * Math.PI / 180;
    let prev = null;
    for (let L = 2000; L <= 7000; L += 10) {
      const B = [r10(A[0] + L * Math.cos(th)), r10(A[1] + L * Math.sin(th))];
      if (B[0] < 0 || B[1] < 0 || B[0] > K.SIZE || B[1] > K.SIZE) break;
      if (T.h(B[0], B[1]) <= 5) continue;
      const P = K.profile(T, A, B, 400);
      if (want(P)) { res.push([A, B, P]); break; }
      prev = P;
    }
  }
  return res;
}
{
  const T = terr('twin');
  const g = grazeSearch(T, P => P.visible && P.clear <= 1 && ridgeP(P));
  witness('h7', page({ A: g[0][0], B: g[0][1] }), 'A ' + g[0][0] + '（' + f(g[0][2].hA, 0) + ' m）、B ' + g[0][1] + '（' + f(g[0][2].hB, 0) + ' m）：長 ' + f(g[0][2].L, 0) + ' m，視線只比 ' + f(g[0][2].grazeH, 0) + ' m 的山脊高 ' + f(g[0][2].clear, 2) + ' m；另有 ' + (g.length - 1) + ' 組');
}
{
  const r3 = K.islandRange(terr('volcano'), 3);
  witness('h8', page({ preset: 'volcano', sea: Math.round((r3[0] + r3[1]) / 2) }), '火山島在海平面 ' + r3[0] + '–' + r3[1] + ' m 時剩三座（火山口邊緣的三個高點）');
}
{
  K.PRESETS.forEach(id => {
    const T = terr(id), H = K.hydro(T);
    let mk = 0; for (let k = 0; k < H.acc.length; k++) if (H.acc[k] > H.acc[mk]) mk = k;
    const p = [(mk % K.N) * K.CELL, Math.floor(mk / K.N) * K.CELL];
    const s = page({ preset: id, probe: p });
    const c = scan(p[0], p[1], 60, q => snap(page({ preset: id, probe: q })).probe.catchFrac >= 0.9);
    if (id === 'twin') witness('h9', s, id + ' 最大的河在 ' + p + ' 出海（集水 ' + f(H.maxKm2, 2) + ' km²）；附近合格的 10 m 格點 ' + c.length + ' 個');
    else expect('h9 在 ' + id + ' 也做得到', hits('h9', s), '河口 ' + p + '，集水 ' + f(H.maxKm2, 2) + ' km²，合格格點 ' + c.length + ' 個；同時完成：' + (firing(s).filter(x => x !== 'h9').join('、') || '無'));
  });
}
{
  // 地球曲率：海平面升高、把 A、B 放在對角的海上，相距超過 2√(2Rh/(1−k)) ≈ 9.68 km（h = 眼高 1.6 m），
  // 中間的海面「隆起」超過 1.6 m，兩艘船就看不到彼此；地球若是平的，視線一路都在海面上 1.6 m。
  const lim = 2 * Math.sqrt(2 * K.R_EARTH * K.EYE / (1 - K.K_REFR));
  const s = page({ sea: 800, A: [0, 0], B: [8000, 8000] });
  const P = snap(s).prof;
  witness('h10', s, '雙峰島海平面 800 m、A (0, 0)、B (8000, 8000)：相距 ' + f(P.L, 0) + ' m > ' + f(lim, 0) + ' m；不算曲率視線離海面 ' + f(P.clearFlat, 2) + ' m，算進曲率低了 ' + f(-P.clear, 2) + ' m');
  expect('h10：海平面 0 m 時同樣兩點被島擋住，不算', !hits('h10', page({ sea: 0, A: [0, 0], B: [8000, 8000] })));
  expect('h10：相距不到 9.68 km（A (1500, 1500)，9.19 km）看得到，不算', !hits('h10', page({ sea: 800, A: [1500, 1500], B: [8000, 8000] })), '視線離海面 ' + f(K.profile(terr('twin'), [1500, 1500], [8000, 8000], 400, 800).clear, 2) + ' m');
  K.PRESETS.forEach(id => {
    const ok = [];
    for (let sea = 0; sea <= 1000; sea += 10) if (hits('h10', page({ preset: id, sea: sea, A: [0, 0], B: [8000, 8000] })) || hits('h10', page({ preset: id, sea: sea, A: [0, 8000], B: [8000, 0] }))) ok.push(sea);
    expect('h10 在 ' + id + ' 也做得到（對角線上的島淹掉之後）', ok.length > 0, '海平面 ' + ok[0] + ' m 起');
  });
  const fsd = hiddenFiring(page({ sea: 967 }));
  expect('h2 的做法（海平面 967 m、剖面線留在預設位置）不會順便完成 h10', fsd.indexOf('h10') < 0, fsd.join('、'));
}

// ---------- 隱藏任務彼此不會順便完成 ----------
console.log('\n[隱藏任務彼此獨立]');
Object.keys(used).filter(id => id[0] === 'h').forEach(id => {
  const hf = hiddenFiring(used[id]).filter(x => x !== id);
  expect(id + ' 的做法不會順便完成其他隱藏任務', hf.length === 0, hf.join('、'));
});

// ---------- 亂點：隱藏任務不該常常被意外觸發 ----------
console.log('\n[隨機操作]');
{
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const cnt = {};
  const tries = 1500;
  for (let k = 0; k < tries; k++) {
    const id = K.PRESETS[k % 4];
    const s = page({ preset: id, probe: [r10(rnd() * 8000), r10(rnd() * 8000)], A: [r10(rnd() * 8000), r10(rnd() * 8000)], B: [r10(rnd() * 8000), r10(rnd() * 8000)],
      sea: Math.round(rnd() * 300), vexag: 1 + Math.round(rnd() * 18) / 2 });
    hiddenFiring(s).forEach(x => { cnt[x] = (cnt[x] || 0) + 1; });
  }
  const worst = Object.keys(cnt).map(x => x + ' ' + cnt[x]).join('、') || '無';
  expect('隨機放量測點、剖面線與海平面 ' + tries + ' 次，任何一個隱藏任務被碰巧完成的比例都低於 1%', Object.keys(cnt).every(x => cnt[x] / tries < 0.01), worst);
}

console.log('\n合計：' + ok + ' 項通過，' + bad + ' 項失敗');
const pub = missions.filter(m => !m.hidden), hid = missions.filter(m => m.hidden);
console.log('公開 ' + pub.length + ' 個（' + pub.reduce((a, m) => a + m.level, 0) + ' 顆星），隱藏 ' + hid.length + ' 個（' + hid.reduce((a, m) => a + 2 * m.level, 0) + ' 顆星）；7 級以上的隱藏任務 ' + hid.filter(m => m.level >= 7).length + ' 個');
if (bad) process.exit(1);
