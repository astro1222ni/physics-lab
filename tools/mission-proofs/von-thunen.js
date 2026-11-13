/* 任務可達成的證明腳本。用法：node tools/mission-proofs/von-thunen.js（幾秒鐘）
 * 修改核心或任務條件後重跑，確認每個任務都做得到、預設狀態不會觸發、隱藏任務彼此不會順便完成。
 * 事件 'vt' 的內容由 snap() 產生：和 js/von-thunen.js 的 snapshot() 一樣，都是 VonCore.summary() 再加上 act、view、zoom、sel。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const K = require(ROOT + 'js/von-thunen-core.js');
const missions = [];
global.window = { VonCore: K, LabMission: { register: (id, list) => list.forEach(m => missions.push(m)) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/von-thunen.js');
const byId = id => missions.find(m => m.id === 'von-thunen-' + id);

let ok = 0, bad = 0;
function expect(label, cond, extra) {
  if (cond) { ok++; console.log('  ✓ ' + label + (extra ? '（' + extra + '）' : '')); }
  else { bad++; console.error('  ✗ ' + label + (extra ? '（' + extra + '）' : '')); }
}

// ---------- 和頁面相同的快照 ----------
// o = { crops: { veg: { Y, p, c, f, on }, … }（只寫要改的欄位）, m, river: true/false, k, probe: [x, y] 或 null, view, zoom }
function settings(o) {
  o = o || {};
  const crops = K.defaults();
  Object.keys(o.crops || {}).forEach(id => Object.assign(crops[id], o.crops[id]));
  return { crops, m: o.m == null ? 1 : o.m, river: { on: !!o.river, k: o.k == null ? 0.4 : o.k }, probe: o.probe === null ? null : (o.probe ? { x: o.probe[0], y: o.probe[1] } : { x: 20, y: 24 }) };
}
function snap(o, act) {
  o = o || {};
  return { type: 'vt', data: Object.assign({ act: act || 'param', view: o.view || 'map', zoom: o.zoom || 0, sel: 'veg' }, K.summary(settings(o))) };
}
const firing = e => missions.filter(m => m.check(e)).map(m => m.id.replace('von-thunen-', ''));
const hiddenOf = list => list.filter(x => x[0] === 'h');
const used = {};
function witness(id, e, note) {
  const f = firing(e);
  used[id] = e;
  expect(id + ' 做得到', f.indexOf(id) >= 0, note + '；同時完成：' + (f.filter(x => x !== id).join('、') || '無'));
  return f;
}
// 滑桿上的值（和 von-thunen.html 一致）
const range = (a, b, s) => { const r = []; for (let v = a; v <= b + 1e-9; v += s) r.push(+v.toFixed(6)); return r; };
const YS = range(0.1, 40, 0.1), PS = range(0, 3000, 10), FS = range(0.5, 40, 0.5), MS = range(0.25, 2, 0.01), KS = range(0.05, 1, 0.01);
const S = o => K.summary(settings(o));

console.log('von-thunen 任務證明\n');

console.log('[預設與一般操作]');
{
  const d = S({});
  expect('杜能的設定：由內而外蔬菜牛奶、林木、穀物、放牧', d.order.join() === 'veg,wood,grain,live', d.rings.map(s => s.id + ' ' + s.to.toFixed(2)).join('、'));
  const acts = ['param', 'crop', 'grow', 'zoom', 'reset', 'rotate', 'view'];
  expect('預設值、任何一般操作都不會完成任務（點地圖例外）', acts.every(a => firing(snap({}, a)).length === 0), acts.map(a => a + ':' + firing(snap({}, a)).join('、')).filter(s => !/:$/.test(s)).join('；'));
  expect('預設的「這塊地」點一下只完成任務 1', firing(snap({}, 'probe')).join() === '1', firing(snap({}, 'probe')).join('、'));
  const riverOn = firing(snap({ river: true }, 'river'));
  expect('只打開河流（預設河運費率 0.4）只完成任務 3', riverOn.join() === '3', riverOn.join('、'));
  const riverProbe = hiddenOf(firing(snap({ river: true }, 'probe')));
  expect('打開河流後點預設的位置不會完成隱藏任務', riverProbe.length === 0, riverProbe.join('、'));
  const v3 = firing(snap({ view: '3d' }, 'view'));
  expect('切到立體圖只完成任務 2', v3.join() === '2', v3.join('、'));
  // 任何單一滑桿拉到最小或最大，都不會完成隱藏任務
  const hit = new Set();
  K.IDS.forEach(id => ['Y', 'p', 'c', 'f'].forEach(q => {
    const L = K.LIMITS[q];
    [L[0], L[1]].forEach(v => hiddenOf(firing(snap({ crops: { [id]: { [q]: v } } }, 'param'))).forEach(x => hit.add(id + '.' + q + '=' + v + '→' + x)));
  }));
  [0.25, 2].forEach(m => hiddenOf(firing(snap({ m }, 'param'))).forEach(x => hit.add('m=' + m + '→' + x)));
  [0.05, 1].forEach(k => hiddenOf(firing(snap({ river: true, k }, 'param'))).forEach(x => hit.add('k=' + k + '→' + x)));
  expect('任何一個滑桿拉到最小或最大都不會完成隱藏任務', hit.size === 0, [...hit].join('；'));
}

console.log('\n[公開任務]');
witness('1', snap({ probe: [10, 5] }, 'probe'), '點城市附近');
witness('2', snap({ view: '3d' }, 'view'), '切到立體地租曲面');
{
  witness('3', snap({ river: true }, 'river'), '打開河流');
  expect('河運費率 1（不比陸運便宜）不算', !byId('3').check(snap({ river: true, k: 1 }, 'param')));
}
{
  witness('4', snap({ m: 0.9 }, 'param'), '運費倍率 0.9：最外緣 ' + S({ m: 0.9 }).frontier.toFixed(2) + ' km');
  expect('杜能的設定（90 km）不算', !byId('4').check(snap({}, 'param')));
}
{
  witness('5', snap({ crops: { veg: { f: 12 } } }, 'param'), '蔬菜運費 12：蔬菜圈到 ' + S({ crops: { veg: { f: 12 } } }).outer.veg.toFixed(2) + ' km');
  expect('杜能的設定（12.5 km）不算', !byId('5').check(snap({}, 'param')));
}
{
  witness('6', snap({ crops: { wood: { p: 250 } } }, 'param'), '木材價格 250：林木的地租線一直在穀物下面');
  expect('直接不種林木不算', !byId('6').check(snap({ crops: { wood: { on: false } } }, 'grow')));
}
{
  witness('7', snap({ river: true, k: 0.29 }, 'param'), '河運費率 0.29：沿河到 ' + S({ river: true, k: 0.29 }).frontierRiver.toFixed(0) + ' km');
  expect('沒有河時不算（即使運費很低）', !byId('7').check(snap({ m: 0.25 }, 'param')));
}
{
  // 放牧變得集約（產量高、運費高），坡度比穀物陡就會搬進內側
  let w = null;
  for (const Y of YS) { if (Y > 6) break; for (const f of FS) { const d = S({ crops: { live: { Y, f } } }); if (d.allOn && d.rings.length === 4 && d.order.indexOf('live') < d.order.indexOf('grain')) { w = { Y, f }; break; } } if (w) break; }
  expect('找得到放牧在穀物內側、四圈都在的設定', !!w, w && JSON.stringify(w));
  if (w) witness('8', snap({ crops: { live: w } }, 'param'), '放牧產量 ' + w.Y + '、運費 ' + w.f + '：' + S({ crops: { live: w } }).order.join('→'));
}
{
  // 林木價格 390、穀物價格 610：兩圈都是 32 km 寬（10 元一格的滑桿上只有這一組；打字可以找到更多組）
  const o = { crops: { wood: { p: 390 }, grain: { p: 610 } } }, d = S(o);
  witness('9', snap(o, 'param'), '林木價格 390、穀物價格 610：林木 ' + d.width.wood.toFixed(2) + ' km、穀物 ' + d.width.grain.toFixed(2) + ' km');
}
{
  const ks = KS.filter(k => byId('10').check(snap({ river: true, k }, 'param')));
  witness('10', snap({ river: true, k: ks[0] }, 'param'), '河運費率 ' + ks.join('、') + '：面積 ' + ks.map(k => K.areaFactor({ on: true, k }).toFixed(3)).join('、') + ' 倍');
  expect('滑桿上只有一兩格符合', ks.length >= 1 && ks.length <= 2, ks.length + ' 格');
}
{
  const ms = MS.filter(m => byId('11').check(snap({ m }, 'param')));
  witness('11', snap({ m: ms[0] }, 'param'), '運費倍率 ' + ms.join('、') + '（總地租 ∝ 1/m²）');
  expect('改價格讓總地租變兩倍不算', !byId('11').check(snap({ crops: { veg: { p: 1100 } } }, 'param')));
  const v2 = MS.filter(m => byId('11').check(snap({ m, river: true }, 'param')));
  expect('有河時不算', v2.length === 0);
}
{
  let w = null;
  for (const f of FS) for (const p of PS) {
    if (w || p < 500 || p > 1500) continue;
    const d = S({ crops: { veg: { f, p } } });
    if (d.present.veg && d.present.wood && Math.abs(d.areas.veg / d.areas.wood - 1) <= 0.01) w = { f, p };
  }
  expect('找得到蔬菜圈和林木圈面積相等的設定', !!w, JSON.stringify(w));
  if (w) { const d = S({ crops: { veg: w } }); witness('12', snap({ crops: { veg: w } }, 'param'), '蔬菜運費 ' + w.f + '、價格 ' + w.p + '：' + d.areas.veg.toFixed(0) + ' 與 ' + d.areas.wood.toFixed(0) + ' 平方公里'); }
}

console.log('\n[隱藏任務]');
{
  witness('h1', snap({ river: true, probe: [2, 30] }, 'probe'), '河運 0.4、點城市正北 30 km 附近：直接走陸路比較省');
  expect('沒有點地圖（只是開河）不算', !byId('h1').check(snap({ river: true, probe: [2, 30] }, 'river')));
  expect('點在河上（|y| < 5 km）不算', !byId('h1').check(snap({ river: true, probe: [1, 3] }, 'probe')));
}
{
  witness('h2', snap({ crops: { grain: { p: 990, c: 1000 } } }, 'param'), '穀物價格 990、成本 1000');
  expect('差 4.5%（價格 210、成本 220）不算', !byId('h2').check(snap({ crops: { grain: { p: 210 } } }, 'param')));
  expect('價格遠低於成本不算', !byId('h2').check(snap({ crops: { grain: { p: 100 } } }, 'param')));
  expect('價格 0 不算', !byId('h2').check(snap({ crops: { grain: { p: 0 } } }, 'param')));
}
{
  const o = { crops: { wood: { Y: 40, p: 400, f: 20 } } };
  witness('h3', snap(o, 'param'), '林木產量 40、價格 400、運費 20：' + S(o).order.join('→'));
}
{
  let w = null;
  for (const f of FS) for (const p of PS) { if (w || p < 500) continue; const d = S({ crops: { veg: { f, p } } }); if (byId('h4').check(snap({ crops: { veg: { f, p } } }, 'param'))) w = { f, p }; }
  expect('找得到蔬菜圈剛好占一半農地的設定', !!w, JSON.stringify(w));
  witness('h4', snap({ crops: { veg: w } }, 'param'), '蔬菜運費 ' + w.f + '、價格 ' + w.p + '：蔬菜圈占農地 ' + (100 * S({ crops: { veg: w } }).share.veg).toFixed(2) + '%');
  expect('蔬菜運費降到最低（蔬菜占滿整片）不算', !byId('h4').check(snap({ crops: { veg: { f: 0.5 } } }, 'param')));
}
{
  // 杜能的設定：最外緣 90 km；把「這塊地」放在城市正北 89.95 km
  witness('h5', snap({ probe: [0, 89.95] }, 'probe'), '城市正北 89.95 km（最外緣 90 km）');
  expect('差 0.5 km 不算', !byId('h5').check(snap({ probe: [0, 89.5] }, 'probe')));
  const o = { river: true, k: 0.5, probe: [136.7, 25] }, d = S(o);
  witness('h5', snap(o, 'probe'), '有河（0.5）：沿河的地 (136.7, 25) 的運輸距離 ' + d.probe.D.toFixed(2) + ' km，剛好在最外緣 ' + d.frontier.toFixed(2) + ' km 附近');
}
{
  const o = { river: true, k: 0.1, probe: [300, 0] };
  witness('h6', snap(o, 'probe'), '河運 0.1、點河邊 300 km：' + S(o).probe.id);
}
{
  const ks = KS.filter(k => byId('h7').check(snap({ river: true, k, probe: [40, 10] }, 'probe')));
  witness('h7', snap({ river: true, k: ks[0], probe: [40, 10] }, 'probe'), '河運費率 ' + ks.join('、') + '：上岸角 ' + ks.map(k => (Math.acos(k) * 180 / Math.PI).toFixed(2) + '°').join('、'));
  expect('滑桿上只有一格符合', ks.length === 1, ks.length + ' 格');
}
{
  const o = { crops: { veg: { p: 560 }, wood: { p: 270 }, grain: { p: 520 }, live: { p: 2400, c: 0 } } };
  witness('h8', snap(o, 'param'), '四種作物在城市的地租都是 1,200 元：只剩坡度最緩的 ' + S(o).order.join());
}
{
  let w = null;
  for (const Y of YS) { if (Y < 3 || Y > 8) continue; const d = S({ crops: { grain: { Y } } }); if (d.tie3 && d.tie3.spread <= 0.05 && d.tie3.d >= 0.5) { w = Y; break; } }
  expect('找得到三條地租線交在同一點的設定', w != null, String(w));
  const d = S({ crops: { grain: { Y: w } } });
  witness('h9', snap({ crops: { grain: { Y: w } } }, 'param'), '穀物產量 ' + w + '：' + d.tie3.ids.join('、') + ' 在 ' + d.tie3.d.toFixed(2) + ' km 相遇（差 ' + d.tie3.spread.toFixed(3) + '）；圈：' + d.order.join('→'));
}
{
  // 完全倒過來：放牧最陡最高、穀物次之、林木、蔬菜最緩（蔬菜圈不可占一半以上，避免順便完成 h4）
  const o = { crops: { live: { Y: 20, p: 1500, c: 1100, f: 20 }, grain: { Y: 10, p: 620, f: 10 }, wood: { Y: 10, p: 350, f: 2.5 }, veg: { Y: 5, p: 870, c: 500, f: 4.5 } } };
  const d = S(o);
  witness('h10', snap(o, 'param'), d.rings.map(s => s.id + ' ' + s.from.toFixed(1) + '–' + s.to.toFixed(1)).join('、') + '；蔬菜占 ' + (100 * d.share.veg).toFixed(1) + '%');
}

console.log('\n[互不干擾]');
{
  const H = Object.keys(used).filter(x => x[0] === 'h');
  H.forEach(id => { const o = hiddenOf(firing(used[id])).filter(x => x !== id); expect(id + ' 的做法不會順便完成其他隱藏任務', o.length === 0, o.join('、')); });
  const leak = [];
  Object.keys(used).filter(x => x[0] !== 'h').forEach(id => { const h = hiddenOf(firing(used[id])); if (h.length) leak.push(id + '→' + h.join('、')); });
  expect('公開任務的做法不會順便完成隱藏任務', leak.length === 0, leak.join('；'));
}

console.log('\n[隨機操作]');
{
  // 像學生（或自動試玩）亂玩：每次改一個滑桿（四成機會拉到最小或最大）、偶爾開關河流、換作物、點地圖
  let seed = 1826; const R = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const pick = a => a[Math.floor(R() * a.length)];
  const grid = { Y: YS, p: PS, c: PS, f: FS };
  const cnt = {}, tries = 400, steps = 25;
  for (let n = 0; n < tries; n++) {
    const o = { crops: {}, m: 1, river: false, k: 0.4, probe: [20, 24] };
    const hits = new Set();
    for (let s = 0; s < steps; s++) {
      const a = R();
      let act = 'param';
      if (a < 0.55) {
        const id = pick(K.IDS), q = pick(['Y', 'p', 'c', 'f']), g = grid[q], b = R();
        o.crops[id] = o.crops[id] || {};
        o.crops[id][q] = b < 0.2 ? g[0] : b < 0.4 ? g[g.length - 1] : pick(g);
      } else if (a < 0.62) { const b = R(); o.m = b < 0.2 ? 0.25 : b < 0.4 ? 2 : pick(MS); }
      else if (a < 0.7) { const b = R(); o.k = b < 0.2 ? 0.05 : b < 0.4 ? 1 : pick(KS); }
      else if (a < 0.76) { o.river = !o.river; act = 'river'; }
      else if (a < 0.8) { const id = pick(K.IDS); o.crops[id] = o.crops[id] || {}; o.crops[id].on = !(o.crops[id].on !== false); act = 'grow'; }
      else { const H = pick([0, 100, 300, 1000]) || 100; o.probe = [(R() * 2 - 1) * H * 1.2, (R() * 2 - 1) * H]; act = 'probe'; }
      hiddenOf(firing(snap(o, act))).forEach(x => hits.add(x));
    }
    hits.forEach(x => { cnt[x] = (cnt[x] || 0) + 1; });
  }
  const worst = Object.keys(cnt).map(x => x + ' ' + cnt[x]).join('、') || '都沒有';
  // h1（點在河旁邊卻走陸路）是 3 級，開了河之後亂點本來就可能碰到，放寬到 40%；h2 是 4 級，放寬到 5%；6 級以上低於 3%
  const lim = { h1: 0.4, h2: 0.05, h3: 0.06, h4: 0.06 };
  expect('隨機亂玩 ' + tries + ' 次（每次 ' + steps + ' 步），隱藏任務碰巧完成的比例夠低', Object.keys(cnt).every(x => cnt[x] / tries < (lim[x] || 0.03)), worst);
}

const pub = missions.filter(m => !m.hidden), hid = missions.filter(m => m.hidden);
console.log('\n合計：' + ok + ' 項通過，' + bad + ' 項失敗');
console.log('公開 ' + pub.length + ' 個（' + pub.reduce((a, m) => a + m.level, 0) + ' 顆星），隱藏 ' + hid.length + ' 個（' + hid.reduce((a, m) => a + 2 * m.level, 0) + ' 顆星）；7 級以上的隱藏任務 ' + hid.filter(m => m.level >= 7).length + ' 個');
if (bad) process.exitCode = 1;
