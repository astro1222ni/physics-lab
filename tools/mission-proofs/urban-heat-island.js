/* 任務可達成的證明腳本。用法：node tools/mission-proofs/urban-heat-island.js（約一、兩分鐘）
 * 修改核心或任務條件後重跑，確認每個任務都做得到、預設狀態不會觸發、隱藏任務彼此不會順便完成。
 * 事件 'uhi' 的內容由 HeatCore.summary() 產生，和 js/urban-heat-island.js 的 snapshot() 相同。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const K = require(ROOT + 'js/urban-heat-island-core.js');
const missions = [];
global.window = { HeatCore: K, LabMission: { register: (id, list) => list.forEach(m => missions.push(m)) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/urban-heat-island.js');

let ok = 0, bad = 0;
function expect(label, cond, extra) {
  if (cond) { ok++; console.log('  ✓ ' + label + (extra ? '（' + extra + '）' : '')); }
  else { bad++; console.error('  ✗ ' + label + (extra ? '（' + extra + '）' : '')); }
}

const N = K.N;
const DEF = { view: 'map', P: 5e5, wind: 1, hour: 21, cloud: 0.3, green: 0, cool: 0, parks: [], probe: null };
const st = o => Object.assign(JSON.parse(JSON.stringify(DEF)), o || {});
const NIGHT = { wind: 0, hour: 2, cloud: 0 };
function snap(s, act) {
  const m = K.summary({ P: s.P, wind: s.wind, hour: s.hour, cloud: s.cloud, green: s.green, cool: s.cool, parks: s.parks }, s.probe);
  m.probe = m.probe ? Object.assign({}, m.probe) : null;
  m.act = act || 'param';
  m.view = s.view;
  return { type: 'uhi', data: m };
}
const firing = e => missions.filter(m => m.check(e)).map(m => m.id.replace('urban-heat-island-', ''));
const hiddenOf = list => list.filter(x => x[0] === 'h');
function witness(id, e, note) {
  const f = firing(e);
  expect(id + ' 做得到', f.indexOf(id) >= 0, note + '；同時完成：' + (f.filter(x => x !== id).join('、') || '無'));
  return f;
}
function counter(id, e, note) { expect(id + ' 反例：' + note, firing(e).indexOf(id) < 0); }
/** 掃描所有格子放溫度計，回傳第一個（或分數最好的）符合條件的位置 */
function findProbe(base, test, score) {
  const r = K.compute(base);
  let best = null, bs = Infinity;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const p = K.summary(base, { i, j }, r).probe;
    if (!test(p, r)) continue;
    const v = score ? score(p) : 0;
    if (v < bs) { bs = v; best = { i, j, p }; }
    if (!score) return best;
  }
  return best;
}
const opt = s => ({ P: s.P, wind: s.wind, hour: s.hour, cloud: s.cloud, green: s.green, cool: s.cool, parks: s.parks });
const hidAll = [];
const f1 = x => x.toFixed(1), f2 = x => x.toFixed(2);

console.log('urban-heat-island 任務證明\n');

console.log('[物理檢查]');
{
  const s = K.summary(opt(st(NIGHT)), null);
  expect('預設人口在晴朗無風的凌晨 2 點，熱島強度等於 Oke 的值', Math.abs(s.max - K.oke(5e5)) < 1e-6, f2(s.max) + ' °C');
  const d = snap(st(), 'param').data;
  expect('預設（21:00、西風 1 m/s、雲量 3 成）約 3–6 °C', d.max > 3 && d.max < 6, f2(d.max) + ' °C；最熱點在東 ' + d.peakKm + ' km');
}

console.log('\n[預設與一般操作]');
{
  const f = new Set();
  ['param', 'P', 'wind', 'hour', 'cloud', 'green', 'cool', 'clear'].forEach(a => firing(snap(st(), a)).forEach(x => f.add(x)));
  expect('預設狀態不會完成任何任務', f.size === 0, [...f].join('、') || '無');
  const fv = new Set();
  ['map', 'surface', 'profile', 'oke'].forEach(v => hiddenOf(firing(snap(st({ view: v }), 'view'))).forEach(x => fv.add(x)));
  expect('只換畫面不會完成隱藏任務', fv.size === 0, [...fv].join('、') || '無');
  // 每個滑桿拉到最小或最大（其他維持預設），四種畫面
  const SL = { P: [1e4, 3e6], wind: [0, 10], hour: [0, 24], cloud: [0, 1], green: [0, 0.5], cool: [0, 1] };
  const fh = new Set();
  Object.keys(SL).forEach(k => SL[k].forEach(x => ['map', 'surface', 'profile', 'oke'].forEach(v => {
    const o = {}; o[k] = x; o.view = v;
    hiddenOf(firing(snap(st(o), k))).forEach(y => fh.add(k + '=' + x + '→' + y));
  })));
  expect('任何一個滑桿拉到極值（配上四種畫面）不會完成隱藏任務', fh.size === 0, [...fh].join('、') || '無');
  // 預設狀態在市中心附近放溫度計、種公園
  const fp = new Set();
  [[40, 40], [30, 40], [50, 40], [40, 49], [70, 40], [10, 40]].forEach(q => {
    hiddenOf(firing(snap(st({ probe: { i: q[0], j: q[1] } }), 'probe'))).forEach(x => fp.add(x));
    hiddenOf(firing(snap(st({ probe: { i: q[0], j: q[1] }, parks: [{ i: q[0], j: q[1] }] }), 'park'))).forEach(x => fp.add(x));
  });
  expect('預設天氣下放溫度計、種公園不會完成隱藏任務', fp.size === 0, [...fp].join('、') || '無');
}

console.log('\n[公開任務]');
{
  witness('1', snap(st({ probe: { i: 45, j: 40 } }), 'probe'), '點地圖放溫度計');
  counter('1', snap(st({ probe: { i: 45, j: 40 } }), 'P'), '溫度計已經在，拉滑桿不算');
  witness('2', snap(st({ view: 'surface' }), 'view'), '立體溫度');
  witness('3', snap(st({ view: 'profile' }), 'view'), '東西剖面');
  witness('4', snap(st({ view: 'oke', P: 1e6 }), 'P'), '人口與強度、100 萬人');
  counter('4', snap(st({ view: 'oke', P: 9.9e5 }), 'P'), '99 萬人不算');
  const e5 = snap(st({ P: 1e6, wind: 3 }), 'wind');
  witness('5', e5, '100 萬人、西風 3 m/s：最熱點在東 ' + e5.data.peakKm + ' km');
  counter('5', snap(st({ P: 1e6, wind: 1.5 }), 'wind'), '西風 1.5 m/s 最熱點在東 ' + snap(st({ P: 1e6, wind: 1.5 })).data.peakKm + ' km');
  const e6 = snap(st(Object.assign({ P: 1.1e6 }, NIGHT)), 'P');
  witness('6', e6, '110 萬人、無風、晴朗、凌晨 2 點：' + f2(e6.data.max) + ' °C');
  counter('6', snap(st(Object.assign({ P: 1.1e6 }, NIGHT, { hour: 4 })), 'hour'), '凌晨 4 點 ' + f2(snap(st(Object.assign({ P: 1.1e6 }, NIGHT, { hour: 4 }))).data.max) + ' °C');
  // 7 級需要的最小雲量
  let c7 = null;
  for (let c = 0; c <= 10; c++) { if (firing(snap(st(Object.assign({ P: 1e6 }, NIGHT, { cloud: c / 10 })), 'cloud')).indexOf('7') >= 0) { c7 = c; break; } }
  expect('7 做得到', c7 != null, '100 萬人、無風、凌晨 2 點：雲量 ' + c7 + ' 成以上');
  counter('7', snap(st(Object.assign({ P: 1e6 }, NIGHT, { cloud: 1, wind: 1 })), 'cloud'), '有風時不算（風也會減弱熱島）');
  counter('7', snap(st(Object.assign({ P: 1e6 }, NIGHT, { cloud: 0, hour: 13 })), 'hour'), '白天不算');
  const e8 = snap(st({ P: 1e6, wind: 9 }), 'wind');
  witness('8', e8, '100 萬人、西風 9 m/s（臨界 ' + f1(e8.data.ucrit) + ' m/s）');
  counter('8', snap(st({ P: 1e6, wind: 8.5 }), 'wind'), '8.5 m/s 還有熱島');
  const e9 = snap(st(Object.assign({ P: 1e6, parks: [{ i: 40, j: 40 }], probe: { i: 40, j: 40 } }, NIGHT)), 'park');
  witness('9', e9, '100 萬人、市中心一座公園：' + f2(e9.data.centerNoPark) + ' → ' + f2(e9.data.center) + ' °C');
  counter('9', snap(st({ P: 5e5, parks: [{ i: 60, j: 40 }], probe: { i: 60, j: 40 } }), 'park'), '公園種在城外沒有用');
  const e10 = snap(st({ green: 0.3, cool: 0.6 }), 'cool');
  witness('10', e10, '綠地 30%、涼屋頂 60%：降低 ' + (100 * e10.data.mitig).toFixed(0) + '%');
  counter('10', snap(st({ green: 0.2, cool: 0 }), 'green'), '只有綠地 20% 降 ' + (100 * snap(st({ green: 0.2 })).data.mitig).toFixed(0) + '%');
  const e11 = snap(st(Object.assign({ P: 2e4 }, NIGHT)), 'P');
  witness('11', e11, '2 萬人、無風、晴朗、凌晨 2 點：' + f2(e11.data.max) + ' °C');
  counter('11', snap(st(Object.assign({ P: 2e4 }, NIGHT, { wind: 1 })), 'wind'), '小鎮有 1 m/s 的風就只剩 ' + f2(snap(st(Object.assign({ P: 2e4 }, NIGHT, { wind: 1 }))).data.max) + ' °C');
  const e12 = snap(st(Object.assign({ P: 3e6 }, NIGHT)), 'P');
  witness('12', e12, '300 萬人、無風、晴朗、凌晨 2 點：' + e12.data.area2.toFixed(0) + ' km²');
  const c12 = st({ P: 3e6, hour: 24, cloud: 0.4 });
  counter('12', snap(c12, 'P'), '300 萬人、午夜、雲量 4 成只有 ' + snap(c12).data.area2.toFixed(0) + ' km²');
}

console.log('\n[隱藏任務]');
{
  // h1：河上的溫度計
  const b1 = st(Object.assign({ P: 1e6 }, NIGHT));
  const q1 = findProbe(opt(b1), (p, r) => p.water && p.urb >= 0.5, p => p.dT);
  const e1 = snap(Object.assign(b1, { probe: { i: q1.i, j: q1.j } }), 'probe');
  hidAll.push(['h1', witness('h1', e1, '100 萬人、凌晨 2 點：溫度計在河上（' + kmTxt(q1.p) + '）' + f2(q1.p.dT) + ' °C，市中心 ' + f2(e1.data.center) + ' °C')]);
  const q1b = findProbe(opt(st()), (p) => p.water && p.urb >= 0.5, p => p.dT);
  counter('h1', snap(st({ probe: q1b ? { i: q1b.i, j: q1b.j } : { i: 40, j: 49 } }), 'probe'), '預設天氣（21:00、有風有雲）河上最多只比市中心低 ' + (q1b ? f2(snap(st({ probe: { i: q1b.i, j: q1b.j } })).data.center - q1b.p.dT) : '?') + ' °C');
  // h2：午後
  const e2 = snap(st({ P: 1e6, wind: 0, cloud: 0, hour: 14 }), 'hour');
  hidAll.push(['h2', witness('h2', e2, '100 萬人、無風、晴朗、14:00：只有 ' + f2(e2.data.max) + ' °C（Oke 值 ' + f2(e2.data.oke) + '）')]);
  counter('h2', snap(st({ P: 1e6, wind: 0, cloud: 0, hour: 17 }), 'hour'), '17:00 不算');
  // h3：立體、深夜
  const e3 = snap(st(Object.assign({ view: 'surface', P: 5e5 }, NIGHT)), 'hour');
  hidAll.push(['h3', witness('h3', e3, '立體溫度、50 萬人、無風、晴朗、凌晨 2 點：' + f2(e3.data.max) + ' °C')]);
  counter('h3', snap(st(Object.assign({ view: 'map', P: 5e5 }, NIGHT)), 'hour'), '在溫度地圖不算');
  // h4：上風處的郊區
  const b4 = st(Object.assign({ P: 1e6, view: 'profile' }, NIGHT, { wind: 3 }));
  const q4 = findProbe(opt(b4), p => Math.abs(p.y) <= 1 && p.x < 0 && p.r >= K.radiusKm(1e6) + 2 && p.urb < 0.05 && !p.water && p.dT < 0.2 && p.mirror >= 2.5, p => -p.mirror);
  const e4 = snap(Object.assign(b4, { probe: { i: q4.i, j: q4.j } }), 'probe');
  hidAll.push(['h4', witness('h4', e4, '東西剖面、100 萬人、西風 3 m/s：溫度計在' + kmTxt(q4.p) + ' ' + f2(q4.p.dT) + ' °C，東邊對稱點 ' + f2(q4.p.mirror) + ' °C')]);
  counter('h4', snap(Object.assign(st(Object.assign({ P: 1e6, view: 'profile' }, NIGHT, { wind: 0 })), { probe: { i: q4.i, j: q4.j } }), 'probe'), '無風時東西對稱');
  counter('h4', snap(Object.assign(st(Object.assign({ P: 1e6, view: 'map' }, NIGHT, { wind: 3 })), { probe: { i: q4.i, j: q4.j } }), 'probe'), '要在東西剖面上量');
  // h5：差一點就消失
  const e5 = snap(st({ view: 'profile', P: 1e6, wind: 8.5 }), 'wind');
  hidAll.push(['h5', witness('h5', e5, '東西剖面、100 萬人、西風 8.5 m/s（臨界 ' + f1(e5.data.ucrit) + '）：' + f2(e5.data.max) + ' °C')]);
  counter('h5', snap(st({ view: 'profile', P: 1e6, wind: 8 }), 'wind'), '8 m/s 離臨界太遠');
  counter('h5', snap(st({ view: 'profile', P: 1e6, wind: 9 }), 'wind'), '9 m/s 熱島已經消失');
  // h6：對策全開，夜裡還是熱
  let P6 = null;
  for (let w = 100; w <= 300; w += 10) { const d = snap(st(Object.assign({ P: w * 1e4, green: 0.5, cool: 1 }, NIGHT)), 'cool').data; if (d.max >= 2.5) { P6 = w; break; } }
  const e6 = snap(st(Object.assign({ P: (P6 || 300) * 1e4, green: 0.5, cool: 1 }, NIGHT)), 'cool');
  hidAll.push(['h6', witness('h6', e6, '綠地 50%、涼屋頂 100%、凌晨 2 點，人口 ' + P6 + ' 萬以上：' + f2(e6.data.max) + ' °C（沒有對策 ' + f2(e6.data.maxBase) + ' °C）')]);
  counter('h6', snap(st(Object.assign({ P: 1e6, green: 0.5, cool: 1 }, NIGHT)), 'cool'), '100 萬人只剩 ' + f2(snap(st(Object.assign({ P: 1e6, green: 0.5, cool: 1 }, NIGHT))).data.max) + ' °C');
  // h7：公園種在熱跑去的地方
  const b7 = st(Object.assign({ P: 1e6 }, NIGHT, { wind: 4 }));
  const pk = K.base(1e6, 4).maxK, pi = pk % N, pj = Math.floor(pk / N);
  const e7 = snap(Object.assign(JSON.parse(JSON.stringify(b7)), { probe: { i: pi, j: pj }, parks: [{ i: pi, j: pj }] }), 'park');
  hidAll.push(['h7', witness('h7', e7, '100 萬人、西風 4 m/s：最熱點在東 ' + e7.data.peakBaseKm + ' km，公園種在那裡；強度 ' + f2(e7.data.maxBase) + ' → ' + f2(e7.data.max) + ' °C')]);
  counter('h7', snap(Object.assign(JSON.parse(JSON.stringify(b7)), { probe: { i: 40, j: 40 }, parks: [{ i: 40, j: 40 }] }), 'park'), '有風時種在市中心不算');
  counter('h7', snap(Object.assign(st(Object.assign({ P: 1e6 }, NIGHT)), { probe: { i: 40, j: 40 }, parks: [{ i: 40, j: 40 }] }), 'park'), '無風時最熱點就在市中心，不算');
  // h8：滿天雲
  let P8 = null;
  for (let w = 100; w <= 300; w += 10) { if (snap(st(Object.assign({ P: w * 1e4 }, NIGHT, { cloud: 1 }))).data.max >= 2) { P8 = w; break; } }
  const e8 = snap(st(Object.assign({ P: (P8 || 300) * 1e4 }, NIGHT, { cloud: 1 })), 'cloud');
  hidAll.push(['h8', witness('h8', e8, '雲量 10 成、無風、凌晨 2 點，人口 ' + P8 + ' 萬以上：' + f2(e8.data.max) + ' °C')]);
  counter('h8', snap(st(Object.assign({ P: 3e6 }, NIGHT, { cloud: 1, hour: 22 })), 'cloud'), '22:00 只有 ' + f2(snap(st(Object.assign({ P: 3e6 }, NIGHT, { cloud: 1, hour: 22 }))).data.max) + ' °C');
  // h9：下風處的鄉下
  const b9 = st(Object.assign({ P: 2e6 }, NIGHT, { wind: 3 }));
  const q9 = findProbe(opt(b9), p => p.x > 0 && p.r >= K.radiusKm(2e6) + 3 && p.urb < 0.05 && !p.water, p => -p.dT);
  const e9 = snap(Object.assign(b9, { probe: { i: q9.i, j: q9.j } }), 'probe');
  hidAll.push(['h9', witness('h9', e9, '200 萬人、西風 3 m/s：溫度計在' + kmTxt(q9.p) + '（都市邊緣外 ' + f1(q9.p.r - K.radiusKm(2e6)) + ' km）' + f2(q9.p.dT) + ' °C')]);
  const q9b = findProbe(opt(st(Object.assign({ P: 2e6 }, NIGHT))), p => p.x > 0 && p.r >= K.radiusKm(2e6) + 3 && p.urb < 0.05 && !p.water, p => -p.dT);
  counter('h9', snap(Object.assign(st(Object.assign({ P: 2e6 }, NIGHT)), { probe: { i: q9b.i, j: q9b.j } }), 'probe'), '無風時城外 3 km 最多 ' + f2(q9b.p.dT) + ' °C');
  // h10：公園比郊區涼
  const b10 = st(Object.assign({ P: 1e6, green: 0.5, cool: 1 }, NIGHT));
  b10.parks = [{ i: 30, j: 40 }, { i: 32, j: 38 }, { i: 32, j: 42 }];
  const q10 = findProbe(opt(b10), p => p.park && p.urb >= 0.7, p => p.dT);
  const e10 = snap(Object.assign(b10, { probe: { i: q10.i, j: q10.j } }), 'probe');
  hidAll.push(['h10', witness('h10', e10, '100 萬人、綠地 50%、涼屋頂 100%、三座公園在城的西緣：公園裡 ' + f2(q10.p.dT) + ' °C')]);
  const b10b = st(Object.assign({ P: 1e6 }, NIGHT));
  b10b.parks = [{ i: 30, j: 40 }, { i: 32, j: 38 }, { i: 32, j: 42 }];
  const q10b = findProbe(opt(b10b), p => p.park && p.urb >= 0.7, p => p.dT);
  counter('h10', snap(Object.assign(b10b, { probe: { i: q10b.i, j: q10b.j } }), 'probe'), '沒有綠地與涼屋頂時公園裡最低 ' + f2(q10b.p.dT) + ' °C');
}
function kmTxt(p) { return (p.x >= 0 ? '東 ' : '西 ') + f1(Math.abs(p.x)) + ' km、' + (p.y >= 0 ? '南 ' : '北 ') + f1(Math.abs(p.y)) + ' km'; }

console.log('\n[隱藏任務彼此不會順便完成]');
hidAll.forEach(([id, f]) => {
  const other = hiddenOf(f).filter(x => x !== id);
  expect(id + ' 的見證不會同時完成其他隱藏任務', other.length === 0, other.join('、') || '無');
});

console.log('\n[隨機亂玩]');
{
  let seed = 4242;
  const R = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const pick = a => a[Math.floor(R() * a.length)];
  const cnt = {}, tries = 150, steps = 20;
  const sl = (lo, hi, stp) => { const u = R(); return u < 0.2 ? lo : u < 0.4 ? hi : lo + Math.round(R() * (hi - lo) / stp) * stp; };
  for (let n = 0; n < tries; n++) {
    const s = st(), hits = new Set();
    for (let k = 0; k < steps; k++) {
      const a = R();
      let act = 'param';
      if (a < 0.1) { s.view = pick(['map', 'surface', 'profile', 'oke']); act = 'view'; }
      else if (a < 0.3) { s.probe = { i: Math.floor(R() * N), j: Math.floor(R() * N) }; act = 'probe'; }
      else if (a < 0.38) { if (s.probe) { if (s.parks.length >= 3) s.parks.shift(); s.parks.push({ i: s.probe.i, j: s.probe.j }); } act = 'park'; }
      else if (a < 0.41) { s.parks = []; act = 'clear'; }
      else if (a < 0.51) { s.P = Math.round(1e4 * Math.pow(300, sl(0, 1000, 1) / 1000) / 1e3) * 1e3; act = 'P'; }
      else if (a < 0.61) { s.wind = sl(0, 10, 0.5); act = 'wind'; }
      else if (a < 0.71) { s.hour = sl(0, 24, 1); act = 'hour'; }
      else if (a < 0.81) { s.cloud = sl(0, 10, 1) / 10; act = 'cloud'; }
      else if (a < 0.9) { s.green = sl(0, 50, 5) / 100; act = 'green'; }
      else { s.cool = sl(0, 100, 10) / 100; act = 'cool'; }
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
