/* 任務可達成的證明腳本。用法：node tools/mission-proofs/gravity-model.js（約一分鐘）
 * 修改核心或任務條件後重跑，確認每個任務都做得到、預設狀態不會觸發、隱藏任務彼此不會順便完成。
 * 事件 'grav' 的內容由 GravityCore.summary() 產生，和 js/gravity-model.js 的 snapshot() 相同。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const K = require(ROOT + 'js/gravity-model-core.js');
const missions = [];
global.window = { GravityCore: K, LabMission: { register: (id, list) => list.forEach(m => missions.push(m)) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/gravity-model.js');

let ok = 0, bad = 0;
function expect(label, cond, extra) {
  if (cond) { ok++; console.log('  ✓ ' + label + (extra ? '（' + extra + '）' : '')); }
  else { bad++; console.error('  ✗ ' + label + (extra ? '（' + extra + '）' : '')); }
}

const DEF = { view: 'flows', mode: 'km', b: 2, from: 'txg', to: 'tpe', town: null, pop: 50 };
const TOWN0 = { lon: 120.95, lat: 23.6 };
const st = o => Object.assign(JSON.parse(JSON.stringify(DEF)), o || {});
const AREAS = new Map();
function areasOf(s) {
  const key = s.b + '|' + s.mode + '|' + (s.town ? s.town.lon + ',' + s.town.lat + ',' + s.pop : '');
  let a = AREAS.get(key);
  if (!a) { a = K.areas(K.withTown(s.town ? { lon: s.town.lon, lat: s.town.lat, pop: s.pop } : null), s.b, s.mode, 3); if (AREAS.size > 300) AREAS.clear(); AREAS.set(key, a); }
  return a;
}
function snap(s, act) {
  const m = K.summary(s, s.view === 'areas' ? areasOf(s) : null);
  if (m.pair) delete m.pair.at;
  delete m.flows; delete m.list;
  m.act = act || 'param';
  return { type: 'grav', data: m };
}
const firing = e => missions.filter(m => m.check(e)).map(m => m.id.replace('gravity-model-', ''));
const hiddenOf = list => list.filter(x => x[0] === 'h');
function witness(id, e, note) {
  const f = firing(e);
  expect(id + ' 做得到', f.indexOf(id) >= 0, note + '；同時完成：' + (f.filter(x => x !== id).join('、') || '無'));
  return f;
}
const IDS = K.CITIES.map(c => c.id);
const byId = id => K.CITIES.find(c => c.id === id);
const grid = K.grid(3);
/** 在島上的格子裡找新市鎮的位置（先 3 km 格子，再在附近細找） */
function findTown(base, test, step) {
  for (let q = 0; q < grid.cells.length; q += (step || 1)) {
    const p = grid.cells[q].p, s = st(Object.assign({}, base, { town: { lon: +p.lon.toFixed(4), lat: +p.lat.toFixed(4) } }));
    const e = snap(s, 'drag');
    if (test(e.data, s)) return { s, e };
  }
  return null;
}
function refineTown(base, score, test) {
  // 先在 3 km 格子找分數最低的，再用 0.3 km 的步伐往下走
  let best = null, bs = Infinity;
  grid.cells.forEach(c => { const s = st(Object.assign({}, base, { town: { lon: c.p.lon, lat: c.p.lat } })); const v = score(snap(s, 'drag').data); if (v < bs) { bs = v; best = s; } });
  for (let it = 0; it < 400; it++) {
    let moved = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const q = K.toXY(best.town), p = K.fromXY(q[0] + 0.3 * dx, q[1] + 0.3 * dy);
      if (!K.inside(p)) continue;
      const s = st(Object.assign({}, base, { town: { lon: +p.lon.toFixed(4), lat: +p.lat.toFixed(4) } })), v = score(snap(s, 'drag').data);
      if (v < bs) { bs = v; best = s; moved = true; }
    }
    if (!moved || test(snap(best, 'drag').data)) break;
  }
  return best;
}
const hidAll = [];

console.log('gravity-model 任務證明\n');

console.log('[預設與一般操作]');
{
  const f = new Set();
  ['param', 'b', 'mode', 'to'].forEach(a => firing(snap(st(), a)).forEach(x => f.add(x)));
  expect('預設狀態不會完成任何任務', f.size === 0, [...f].join('、') || '無');
  const t = snap(st({ town: TOWN0 }), 'town').data;
  expect('剛加入的新市鎮不會完成任何任務', firing(snap(st({ town: TOWN0 }), 'town')).length === 0, '最大互動 ' + t.town.top + '、第一名 ÷ 第三名 ' + t.town.top3.toFixed(2));
  // b 拉到最小或最大，配上三種畫面、兩種距離、有沒有新市鎮，都不會完成隱藏任務
  const hit = new Set();
  [0.5, 3].forEach(b => ['flows', 'areas', 'decay'].forEach(view => ['km', 'hsr'].forEach(mode => [null, TOWN0].forEach(town => [1, 300].forEach(pop => {
    hiddenOf(firing(snap(st({ b, view, mode, town, pop }), 'b'))).forEach(x => hit.add('b=' + b + ' ' + view + ' ' + mode + (town ? ' 新市鎮 ' + pop : '') + '→' + x));
  })))));
  expect('距離衰減指數、人口拉到最小或最大都不會完成隱藏任務', hit.size === 0, [...hit].join('、') || '無');
}

console.log('\n[公開任務]');
{
  witness('1', snap(st({ from: 'tpe', to: 'txg' }), 'from'), '點臺北');
  witness('2', snap(st({ view: 'areas' }), 'view'), '勢力範圍');
  witness('3', snap(st({ view: 'decay' }), 'view'), '距離衰減');
  let b4 = null; for (let b = 0.5; b <= 3.0001; b += 0.1) { const r = Math.round(b * 10) / 10; if (snap(st({ b: r })).data.shares.chw >= 0.9) { b4 = r; break; } }
  witness('4', snap(st({ b: b4 }), 'b'), 'b ≥ ' + b4 + '：彰化 ' + (100 * snap(st({ b: b4 })).data.shares.chw).toFixed(1) + '%');
  let b5 = null; for (let b = 3; b >= 0.5; b -= 0.1) { const r = Math.round(b * 10) / 10; if (snap(st({ from: 'tpe', to: 'txg', b: r })).data.shares.khh >= 0.03) { b5 = r; break; } }
  witness('5', snap(st({ from: 'tpe', to: 'txg', b: b5 }), 'b'), 'b ≤ ' + b5 + '：高雄 ' + (100 * snap(st({ from: 'tpe', to: 'txg', b: b5 })).data.shares.khh).toFixed(2) + '%');
  const e6 = snap(st({ from: 'tpe', to: 'khh', mode: 'hsr' }), 'mode');
  witness('6', e6, '開車 ' + e6.data.pair.car.toFixed(0) + ' 分、高鐵 ' + e6.data.pair.hsr.toFixed(0) + ' 分');
  const e7 = snap(st({ from: 'txg', to: 'ntc', b: 2 }), 'to');
  witness('7', e7, '臺中 285 萬、南投 48 萬，b = 2 分界點離臺中 ' + (100 * e7.data.pair.fracBig).toFixed(1) + '%');
  expect('7 反例：b 拉到 0.5 時大城的商圈反而更遠（題目要 ≥ 70%，b 小一樣成立），b = 3 時不到 70%', snap(st({ from: 'txg', to: 'ntc', b: 3 })).data.pair.fracBig < 0.7);
  const r8 = findTown({}, d => d.town.top === 'hua', 3);
  witness('8', r8.e, '新市鎮在 ' + r8.s.town.lon.toFixed(2) + '°E、' + r8.s.town.lat.toFixed(2) + '°N');
  const s9 = refineTown({ from: 'tpe', to: 'txg' }, d => Math.abs(Math.log(d.town.pf / d.town.pt)), d => Math.abs(d.town.pf / d.town.pt - 1) <= 0.01);
  witness('9', snap(s9, 'drag'), '新市鎮在 ' + s9.town.lon.toFixed(3) + '°E、' + s9.town.lat.toFixed(3) + '°N，引力比 ' + (snap(s9).data.town.pf / snap(s9).data.town.pt).toFixed(3));
  let b10 = null; for (let b = 0.5; b <= 3.0001; b += 0.1) { const r = Math.round(b * 10) / 10; if (snap(st({ view: 'areas', b: r })).data.area.ttt >= 1500) { b10 = r; break; } }
  witness('10', snap(st({ view: 'areas', b: b10 }), 'b'), 'b ≥ ' + b10 + '：臺東 ' + snap(st({ view: 'areas', b: b10 })).data.area.ttt + ' km^2');
  const r11 = findTown({ from: 'txg', to: 'tpe', pop: 300 }, d => d.order[0] === 'new', 1);
  witness('11', r11.e, '人口 300 萬的新市鎮放在 ' + r11.s.town.lon.toFixed(2) + '°E、' + r11.s.town.lat.toFixed(2) + '°N');
  let b12 = null; for (let b = 3; b >= 0.5; b -= 0.1) { const r = Math.round(b * 10) / 10; const a = snap(st({ view: 'areas', b: r })).data.area; if (a.ntp > a.txg) { b12 = r; break; } }
  witness('12', snap(st({ view: 'areas', b: b12 }), 'b'), 'b ≤ ' + b12);
}

console.log('\n[隱藏任務]');
{
  let b1 = null; for (let b = 0.5; b <= 3.0001; b += 0.1) { const r = Math.round(b * 10) / 10; if (snap(st({ from: 'hsc', to: 'hsz', b: r })).data.shares.hsz >= 0.95) { b1 = r; break; } }
  const W1 = snap(st({ from: 'hsc', to: 'hsz', b: b1 }), 'b');
  expect('h1 反例：B 不是新竹縣就不算', firing(snap(st({ from: 'hsc', to: 'tpe', b: 3 }), 'b')).indexOf('h1') < 0);
  hidAll.push(['h1', witness('h1', W1, '新竹市出發，b ≥ ' + b1 + '：新竹縣 ' + (100 * W1.data.shares.hsz).toFixed(1) + '%')]);
  const W2 = snap(st({ from: 'hsc', to: 'ila', b: 1.4 }), 'b');
  hidAll.push(['h2', witness('h2', W2, '新竹市與宜蘭都是 45 萬，b = 1.4 分界點在 ' + (100 * W2.data.pair.frac).toFixed(1) + '%')]);
  expect('h2 反例：人口不同的兩城不算；b 沒有改（還是 2）不算', firing(snap(st({ from: 'ntc', to: 'tpe', b: 1.4 }), 'b')).indexOf('h2') < 0 && firing(snap(st({ from: 'hsc', to: 'ila' }), 'to')).indexOf('h2') < 0);
  const W3 = snap(st({ from: 'hua', to: 'ttt', mode: 'hsr' }), 'mode');
  hidAll.push(['h3', witness('h3', W3, '花蓮–臺東 ' + W3.data.pair.km.toFixed(0) + ' km，開車 ' + W3.data.pair.car.toFixed(0) + ' 分＝最快 ' + W3.data.pair.hsr.toFixed(0) + ' 分')]);
  expect('h3 反例：臺北–臺東搭高鐵比較快，不算', firing(snap(st({ from: 'tpe', to: 'ttt', mode: 'hsr' }), 'mode')).indexOf('h3') < 0);
  const c4 = byId('kee'), W4 = snap(st({ view: 'areas', town: { lon: c4.lon + 0.03, lat: c4.lat }, pop: 200 }), 'drag');
  hidAll.push(['h4', witness('h4', W4, '人口 200 萬的新市鎮放在基隆旁 3 km：基隆 ' + W4.data.area.kee + ' km^2')]);
  const W5 = snap(st({ from: 'tpe', to: 'txg', mode: 'hsr', b: 1 }), 'b');
  hidAll.push(['h5', witness('h5', W5, '交通時間、b = 1：高雄第 ' + (W5.data.order.indexOf('khh') + 1) + ' 名、基隆第 ' + (W5.data.order.indexOf('kee') + 1) + ' 名')]);
  const W5k = snap(st({ from: 'tpe', to: 'txg', mode: 'km', b: 1 }), 'b');
  expect('h5 反例：同樣 b = 1 改用直線距離，高雄排在基隆後面', W5k.data.order.indexOf('khh') > W5k.data.order.indexOf('kee'), '高雄第 ' + (W5k.data.order.indexOf('khh') + 1) + '、基隆第 ' + (W5k.data.order.indexOf('kee') + 1));
  // h6：山中小鎮
  let W6 = null, n6 = 0;
  for (let q = 0; q < grid.cells.length; q += 3) {
    const p = grid.cells[q].p, s = st({ view: 'areas', town: { lon: +p.lon.toFixed(4), lat: +p.lat.toFixed(4) }, pop: 10 });
    const a = snap(s, 'drag').data.town.area; if (a >= 1000) { n6++; if (!W6) W6 = { s, a }; }
  }
  hidAll.push(['h6', witness('h6', snap(W6.s, 'drag'), '人口 10 萬放在 ' + W6.s.town.lon.toFixed(2) + '°E、' + W6.s.town.lat.toFixed(2) + '°N：' + W6.a + ' km^2；每 9 km^2 取樣一格，做得到的 ' + n6 + ' 格（全島 ' + Math.ceil(grid.cells.length / 3) + ' 格）')]);
  // h7：分界點落在第三座城
  let W7 = null, n7 = 0;
  IDS.forEach(a => IDS.forEach(b => { if (a === b) return; for (let k = 5; k <= 30; k++) { const s = st({ from: a, to: b, b: k / 10 }), d = snap(s, 'b').data; if (d.pair.nearKm <= 1.5) { n7++; if (!W7) W7 = { s, d }; } } }));
  hidAll.push(['h7', witness('h7', snap(W7.s, 'b'), byId(W7.s.from).zh + '→' + byId(W7.s.to).zh + '、b = ' + W7.s.b + '：分界點離' + byId(W7.d.pair.near).zh + ' ' + W7.d.pair.nearKm.toFixed(2) + ' km；全部 ' + (19 * 18 * 26) + ' 種（A、B、b）中 ' + n7 + ' 種做得到')]);
  // h8：南方的新市鎮被北方拉走
  const r8 = findTown({ mode: 'hsr', b: 1 }, d => d.town.lat < 23.6 && ['tpe', 'ntp', 'tyn', 'kee'].indexOf(d.town.dom) >= 0, 1);
  hidAll.push(['h8', witness('h8', r8.e, '交通時間、b = 1，新市鎮在 ' + r8.s.town.lon.toFixed(2) + '°E、' + r8.s.town.lat.toFixed(2) + '°N：引力最大的是' + byId(r8.e.data.town.dom).zh)]);
  expect('h8 反例：同一個位置改用直線距離，引力最大的不是北部城市', ['tpe', 'ntp', 'tyn', 'kee'].indexOf(snap(st({ mode: 'km', b: 1, town: r8.s.town })).data.town.dom) < 0);
  // h9：阿波羅尼斯圓（人口比 1.54 的臺中與臺南：引力相等的點是一個很大的圓）
  const ok9 = d => Math.abs(d.town.pf / d.town.pt - 1) <= 0.01 && d.town.off >= 32 && d.town.top3 > 1.1;
  const s9 = refineTown({ from: 'txg', to: 'tnn' }, d => Math.abs(Math.log(d.town.pf / d.town.pt)) + (d.town.off >= 32 ? 0 : 10) + (d.town.top3 > 1.1 ? 0 : 10), ok9);
  const d9 = snap(s9, 'drag').data;
  hidAll.push(['h9', witness('h9', snap(s9, 'drag'), '臺中、臺南：新市鎮在 ' + s9.town.lon.toFixed(3) + '°E、' + s9.town.lat.toFixed(3) + '°N，引力比 ' + (d9.town.pf / d9.town.pt).toFixed(3) + '、離連線 ' + d9.town.off.toFixed(0) + ' km')]);
  const at9 = K.summary(st({ from: 'txg', to: 'tnn' })).pair.at, e9 = snap(st({ from: 'txg', to: 'tnn', town: { lon: at9.lon, lat: at9.lat } }), 'drag');
  expect('h9 反例：在連線上的雷利分界點引力也相等，但不算', firing(e9).indexOf('h9') < 0, '引力比 ' + (e9.data.town.pf / e9.data.town.pt).toFixed(3) + '、離連線 ' + e9.data.town.off.toFixed(1) + ' km');
  // h10：三國鼎立
  const s10 = refineTown({}, d => d.town.top3, d => d.town.top3 <= 1.02);
  const d10 = snap(s10, 'drag').data;
  let n10 = 0; grid.cells.forEach(c => { if (snap(st({ town: { lon: c.p.lon, lat: c.p.lat } })).data.town.top3 <= 1.05) n10++; });
  hidAll.push(['h10', witness('h10', snap(s10, 'drag'), '新市鎮在 ' + s10.town.lon.toFixed(3) + '°E、' + s10.town.lat.toFixed(3) + '°N，第一名 ÷ 第三名 ' + d10.town.top3.toFixed(3) + '；b = 2 時全島 ' + grid.cells.length + ' 格中 ' + n10 + ' 格做得到')]);
}

console.log('\n[隱藏任務彼此不會順便完成]');
hidAll.forEach(([id, f]) => {
  const other = hiddenOf(f).filter(x => x !== id);
  expect(id + ' 的見證不會同時完成其他隱藏任務', other.length === 0, other.join('、') || '無');
});

console.log('\n[隨機亂玩]');
{
  let seed = 777;
  const R = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const pick = a => a[Math.floor(R() * a.length)];
  const cnt = {}, tries = 200, steps = 20;
  for (let n = 0; n < tries; n++) {
    const s = st(), hits = new Set();
    for (let k = 0; k < steps; k++) {
      const a = R();
      let act = 'param';
      if (a < 0.1) { s.view = pick(['flows', 'areas', 'decay']); act = 'view'; }
      else if (a < 0.16) { s.mode = s.mode === 'km' ? 'hsr' : 'km'; act = 'mode'; }
      else if (a < 0.36) { const c = pick(IDS); if (c !== s.from) { s.to = s.from; s.from = c; } act = 'from'; }
      else if (a < 0.42) { const c = pick(IDS); if (c !== s.from) s.to = c; act = 'to'; }
      else if (a < 0.48) { s.town = s.town ? null : Object.assign({}, TOWN0); act = 'town'; }
      else if (a < 0.66) { if (s.town) { const p = pick(grid.cells).p; s.town = { lon: p.lon, lat: p.lat }; } act = 'drag'; }
      else if (a < 0.84) { const u = R(); s.b = u < 0.2 ? 0.5 : u < 0.4 ? 3 : Math.round((0.5 + R() * 2.5) * 10) / 10; act = 'b'; }
      else { const u = R(); s.pop = u < 0.2 ? 1 : u < 0.4 ? 300 : 1 + Math.floor(R() * 300); act = 'pop'; }
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
