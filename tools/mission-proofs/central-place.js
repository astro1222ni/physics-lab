/* 任務可達成的證明腳本。用法：node tools/mission-proofs/central-place.js（幾秒鐘）
 * 修改核心或任務條件後重跑，確認每個任務都做得到、預設狀態不會觸發、隱藏任務彼此不會順便完成。
 * 事件 'cp' 的內容由 snap() 產生，和 js/central-place.js 的 snapshot() 相同。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const K = require(ROOT + 'js/central-place-core.js');
const missions = [];
global.window = { CentralCore: K, LabMission: { register: (id, list) => list.forEach(m => missions.push(m)) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/central-place.js');
const byId = id => missions.find(m => m.id === 'central-place-' + id);

let ok = 0, bad = 0;
function expect(label, cond, extra) {
  if (cond) { ok++; console.log('  ✓ ' + label + (extra ? '（' + extra + '）' : '')); }
  else { bad++; console.error('  ✗ ' + label + (extra ? '（' + extra + '）' : '')); }
}

// ---------- 和頁面相同的快照 ----------
const DEF = { mode: 'single', view: 'map', rho: 100, T: 2000, R: 5, k: 3, N: 3, d1: 6, show: 2, roads: false, gT: 10000, gR: 30, grow: null, run: false, probe: null };
function snap(o, act) {
  const st = Object.assign({}, DEF, o || {});
  const S1 = K.single(st.rho, st.T, st.R), H = K.hierarchy(st.rho, st.d1, st.k, st.N), G = K.goodIn(st.rho, st.d1, st.k, st.N, st.gT, st.gR);
  let probe = null;
  if (st.probe) {
    const x = st.probe[0], y = st.probe[1];
    probe = { x, y };
    if (st.mode === 'hier') {
      const j = y / (st.d1 * K.HEX), i = x / st.d1 - j / 2, ri = Math.round(i), rj = Math.round(j);
      probe.place = Math.abs(i - ri) > 1e-6 || Math.abs(j - rj) > 1e-6 ? 0 : K.orderOf(ri, rj, st.k, st.N);
      probe.levels = [];
      for (let L = 1; L <= st.N; L++) {
        const list = K.nearest(x, y, st.d1, st.k, L, 7), d0 = list[0].dist;
        probe.levels.push({ L, dist: d0, ties: list.filter(p => p.dist <= d0 * 1.01 + 1e-6).length });
      }
    } else {
      const near = S1.status === 'none' ? [] : K.nearest(x, y, st.grow != null ? st.grow : S1.d, 3, 1, 3);
      probe.near = near.map(t => t.dist);
      probe.buy = near.length > 0 && near[0].dist <= st.R + 1e-9;
      probe.spread = near.length >= 3 && near[0].dist > 1e-9 ? (near[2].dist - near[0].dist) / near[0].dist : null;
    }
  }
  const g = st.grow;
  return { type: 'cp', data: {
    act: act || 'param', mode: st.mode, view: st.view, rho: st.rho, T: st.T, R: st.R, single: S1,
    grow: { s: g, run: st.run, atEq: g == null || (S1.d != null && Math.abs(g - S1.d) <= 1e-9 * Math.max(1, S1.d)) },
    k: st.k, N: st.N, d1: st.d1, show: Math.min(st.show, st.N), roads: st.roads, H, gT: st.gT, gR: st.gR, good: G, probe
  } };
}
const firing = e => missions.filter(m => m.check(e)).map(m => m.id.replace('central-place-', ''));
const hiddenOf = list => list.filter(x => x[0] === 'h');
const used = {};
function witness(id, e, note) {
  const f = firing(e);
  used[id] = e;
  expect(id + ' 做得到', f.indexOf(id) >= 0, note + '；同時完成：' + (f.filter(x => x !== id).join('、') || '無'));
  return f;
}
const HIER = { mode: 'hier' };
const H = o => Object.assign({ mode: 'hier' }, o);
// 滑桿上的值（和 central-place.html 一致；門檻是對數滑桿，打字可以輸入任何整數）
const range = (a, b, s) => { const r = []; for (let v = a; v <= b + 1e-9; v += s) r.push(+v.toFixed(6)); return r; };
const RHO = range(10, 1000, 10), TS = range(1.69897, 5, 0.005).map(x => Math.round(Math.pow(10, x))), RS = range(0.5, 20, 0.1);
const D1 = range(1, 20, 0.1), GT = range(2, 7, 0.005).map(x => Math.round(Math.pow(10, x))), GR = range(1, 100, 0.1);

console.log('central-place 任務證明\n');

console.log('[預設與一般操作]');
{
  const s = K.single(100, 2000, 5);
  expect('預設：人人買得到，間距 4.81 km', s.status === 'full' && Math.abs(s.d - 4.8056) < 1e-3, 'd = ' + s.d.toFixed(4));
  const acts = ['param', 'mode', 'probe', 'rewind', 'pause', 'nudge', 'grow', 'play'];
  const f1 = acts.map(a => a + ':' + firing(snap({}, a)).join('、')).filter(x => !/:$/.test(x));
  expect('一種商品的預設值、一般操作不會完成任務', f1.length === 0, f1.join('；'));
  const acts2 = ['mode', 'k', 'n', 'show', 'probe', 'rotate', 'param'];
  const f2 = acts2.map(a => a + ':' + firing(snap(HIER, a)).join('、')).filter(x => !/:$/.test(x));
  expect('中地體系的預設值、一般操作不會完成任務', f2.length === 0, f2.join('；'));
  expect('播放到均衡只完成任務 1', firing(snap({}, 'opened')).join() === '1', firing(snap({}, 'opened')).join('、'));
  expect('切到立體等級只完成任務 3', firing(snap(H({ view: '3d' }), 'view')).join() === '3');
  // 任何單一滑桿拉到最小或最大
  const hit = new Set();
  const one = (o, tag) => hiddenOf(firing(snap(o, 'param'))).forEach(x => hit.add(tag + '→' + x));
  [10, 1000].forEach(v => { one({ rho: v }, 'ρ=' + v); one(H({ rho: v }), '體系 ρ=' + v); });
  [50, 100000].forEach(v => one({ T: v }, 'T=' + v));
  [0.5, 20].forEach(v => one({ R: v }, 'R=' + v));
  [1, 20].forEach(v => [2, 3, 4].forEach(N => [3, 4, 7].forEach(k => one(H({ d1: v, N, k }), 'd1=' + v + ' N=' + N + ' k=' + k))));
  [100, 1e7].forEach(v => one(H({ gT: v }), 'gT=' + v));
  [1, 100].forEach(v => one(H({ gR: v }), 'gR=' + v));
  expect('任何一個滑桿拉到最小或最大都不會完成隱藏任務', hit.size === 0, [...hit].join('；'));
}

console.log('\n[公開任務]');
witness('1', snap({}, 'opened'), '播放到均衡');
witness('2', snap({ rho: 10 }), '密度 10：門檻半徑 ' + K.thresholdRadius(2000, 10).toFixed(2) + ' km > 商品圈 5 km');
witness('3', snap(H({ view: '3d' }), 'view'), '立體等級');
{
  witness('4', snap(H({ k: 4, roads: true }), 'roads'), '交通原則＋道路');
  expect('k = 3 打開道路不算', !byId('4').check(snap(H({ roads: true }), 'roads')));
}
{
  // 間距 10 km：T = (√3/2)·10²·ρ = 8660（打字），或對數滑桿上最接近的值
  const tS = TS.filter(T => { const s = K.single(100, T, 6); return s.status === 'full' && Math.abs(s.d - 10) <= 0.1; });
  witness('5', snap({ T: 8660, R: 6 }), '密度 100、門檻 8,660、商品圈 6 km：間距 ' + K.single(100, 8660, 6).d.toFixed(3) + ' km；滑桿上可用的門檻 ' + tS.join('、'));
  expect('滑桿也拉得到', tS.length > 0);
}
witness('6', snap(H({ probe: [6, 0] }), 'probe'), '市場原則，消費者站在 (6, 0) 的村');
witness('7', snap({ R: 2.6 }), '商品圈 2.6 km（門檻半徑 2.52 km）');
witness('8', snap(H({ k: 7, N: 3, show: 3 }), 'show'), '行政原則、3 級、塗第 3 級');
{
  const T = 6450, s = K.single(100, T, 5);
  witness('9', snap({ T, R: 5 }), '門檻 6,450、商品圈 5：商品圈 ÷ 角落距離 = ' + s.ratioRC.toFixed(4));
  const tS = TS.filter(t => { const q = K.single(100, t, 5); return q.status === 'full' && q.ratioRC <= 1.005; });
  expect('滑桿也拉得到', tS.length > 0, tS.join('、'));
}
{
  const e = snap(H({ k: 7, d1: 20, gT: 50000 }));
  witness('10', e, '行政原則、間距 20 km、門檻 50,000：第 1 級 ' + Math.round(e.data.H[0].pop) + ' 人、第 2 級 ' + Math.round(e.data.H[1].pop) + ' 人');
}
{
  const s = K.single(100, 6330, 5);
  witness('11', snap({ T: 6330 }), '門檻 6,330：平均 ' + s.mean.toFixed(4) + ' km');
  const tS = TS.filter(t => { const q = K.single(100, t, 5); return q.status === 'full' && Math.abs(q.mean - 3) <= 0.02; });
  expect('滑桿也拉得到', tS.length > 0, tS.join('、'));
}
{
  const e = snap(H({ gR: 10.5 }));
  witness('12', e, '預設體系、門檻 10,000 在第 3 級，商品圈 10.5 km：' + e.data.good.reach.toFixed(4));
  expect('預設商品圈 30 km 不算（太遠）', !byId('12').check(snap(H({}))));
}

console.log('\n[隱藏任務]');
witness('h1', snap(H({ N: 4, probe: [0, 0] }), 'probe'), '4 級，站在中間的區域中心');
{
  witness('h2', snap(H({ k: 4, N: 3, probe: [12, 0] }), 'probe'), '交通原則，站在 (12, 0) 的鎮，左右兩個市各 12 km');
  expect('交通原則站在村上不算（那是 k = 4 的一般性質）', !byId('h2').check(snap(H({ k: 4, N: 3, probe: [6, 0] }), 'probe')));
}
{
  const s = K.single(100, 2000, 2.6), c = K.hexAround(0, 0, s.d, 3, 1)[0];
  witness('h3', snap({ R: 2.6, probe: c }, 'probe'), '有空隙時站在六邊形的角：離三家店都是 ' + (s.d / Math.sqrt(3)).toFixed(3) + ' km > 2.6 km');
  const c2 = K.hexAround(0, 0, K.single(100, 2000, 5).d, 3, 1)[0];
  expect('人人買得到時站在角上不算', !byId('h3').check(snap({ probe: c2 }, 'probe')));
  expect('開店動畫途中（間距還沒到均衡）不算', !byId('h3').check(snap({ R: 2.6, probe: c, grow: 5.1 }, 'probe')));
}
witness('h4', snap({ T: 100 }), '門檻 100、密度 100：每家店 1 平方公里');
{
  const s = K.single(100, 2000, 2.53);
  witness('h5', snap({ R: 2.53 }), '商品圈 2.53 km ÷ 門檻半徑 = ' + s.ratioRT.toFixed(4));
}
witness('h6', snap(H({ N: 4, d1: 7 })), '市場原則、4 級、村距 7 km：' + [1, 2, 3, 4].map(L => K.levelSpacing(7, 3, L).toFixed(1)).join('、') + ' km');
{
  const s = K.single(100, 2000, 5);
  witness('h7', snap({ grow: s.close, run: false }, 'pause'), '人人買得到，暫停在間距 √3 R = ' + s.close.toFixed(3) + ' km');
  // 微調按鈕每步 min((2R − d)/400, 0.2%)：看得出一定停得進 ±0.3%
  const step = Math.min((s.start - s.d) / 400, s.close * 0.002);
  expect('微調一步比容許範圍窄', step < 0.006 * s.close, '一步 ' + step.toFixed(4) + ' km，範圍 ±' + (0.003 * s.close).toFixed(4) + ' km');
  expect('播放中不算', !byId('h7').check(snap({ grow: s.close, run: true }, 'grow')));
  // 商品圈剛好碰到角落（任務 9）時，均衡間距本身就在 √3 R 附近：要求還沒到均衡
  const q = K.single(100, 6450, 5);
  expect('任務 9 的做法播放到均衡不會順便完成 h7', !byId('h7').check(snap({ T: 6450, grow: q.d }, 'opened')));
}
{
  let best = null;
  for (const R of range(2.52, 2.78, 0.01)) for (let T = 1900; T <= 2100; T++) {
    const s = K.single(100, T, R);
    if (s.status === 'gaps' && Math.abs(s.coverage - 0.95) <= 0.001) { best = { R, T, c: s.coverage }; break; }
    if (best) break;
  }
  witness('h8', snap({ R: best.R, T: best.T }), '商品圈 ' + best.R + ' km、門檻 ' + best.T + '：' + (100 * best.c).toFixed(3) + '% 買得到');
}
{
  const e = snap(H({ gT: 9340 }));
  witness('h9', e, '門檻 9,340 在第 2 級（' + Math.round(e.data.H[1].pop) + ' 人）：' + (100 * e.data.good.fill).toFixed(2) + '%');
}
{
  const e = snap(H({ N: 4, gT: 84000, gR: 18.05 }));
  witness('h10', e, '4 級、門檻 84,000、商品圈 18.05 km：門檻占 ' + (100 * e.data.good.fill).toFixed(2) + '%，商品圈 ÷ 最遠 = ' + e.data.good.reach.toFixed(4));
}

console.log('\n[彼此不會順便完成]');
{
  const hid = missions.filter(m => m.hidden).map(m => m.id.replace('central-place-', ''));
  const cross = [];
  Object.keys(used).forEach(id => {
    hiddenOf(firing(used[id])).filter(x => x !== id).forEach(x => cross.push(id + '→' + x));
  });
  expect('每個任務的做法都不會順便完成別的隱藏任務', cross.length === 0, cross.join('、'));
  expect('10 個隱藏任務都有見證', hid.every(h => used[h]), hid.filter(h => !used[h]).join('、'));
}

console.log('\n[隨機亂玩]');
{
  let seed = 31337;
  const R = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const pick = a => a[Math.floor(R() * a.length)];
  const ext = (a) => { const b = R(); return b < 0.2 ? a[0] : b < 0.4 ? a[a.length - 1] : pick(a); };
  const cnt = {}, tries = 400, steps = 25;
  for (let n = 0; n < tries; n++) {
    const o = Object.assign({}, DEF);
    const hits = new Set();
    for (let s = 0; s < steps; s++) {
      const a = R();
      let act = 'param';
      if (a < 0.08) { o.mode = o.mode === 'single' ? 'hier' : 'single'; o.probe = null; o.grow = null; act = 'mode'; }
      else if (a < 0.16) o.rho = ext(RHO);
      else if (o.mode === 'single') {
        if (a < 0.3) { o.T = ext(TS); o.grow = null; }
        else if (a < 0.44) { o.R = ext(RS); o.grow = null; }
        else if (a < 0.62) {
          // 播放：在隨機的時刻暫停，或播到均衡
          const S1 = K.single(o.rho, o.T, o.R);
          if (S1.status !== 'none') {
            if (R() < 0.5) { o.grow = S1.d; act = 'opened'; } else { o.grow = S1.start - R() * (S1.start - S1.d); act = 'pause'; }
          }
        } else {
          // 點地圖：會吸附到 12 px 內的店，或 8 px 內的六邊形角落
          const S1 = K.single(o.rho, o.T, o.R);
          const W = S1.status === 'none' ? 2.6 * Math.max(S1.rT, o.R) : Math.max(2.3 * S1.d, Math.min(2.7 * o.R, 8 * S1.d));
          const sc = 239 / W, x = (R() * 2 - 1) * 300 / sc, y = (R() * 2 - 1) * 245 / sc;
          let p = [x, y];
          if (S1.status !== 'none') {
            const sp = o.grow != null ? o.grow : S1.d, q = K.nearest(x, y, sp, 3, 1, 1)[0];
            if (q.dist <= 12 / sc) p = [q.x, q.y];
            else K.hexAround(q.x, q.y, sp, 3, 1).forEach(c => { if (Math.hypot(c[0] - x, c[1] - y) <= 8.4 / sc) p = c; });
          }
          o.probe = p; act = 'probe';
        }
      } else {
        if (a < 0.24) o.k = pick([3, 4, 7]);
        else if (a < 0.32) o.N = pick([2, 3, 4]);
        else if (a < 0.4) o.show = pick([0, 1, 2, 3, 4]);
        else if (a < 0.45) o.roads = !o.roads;
        else if (a < 0.53) o.d1 = ext(D1);
        else if (a < 0.63) o.gT = ext(GT);
        else if (a < 0.73) o.gR = ext(GR);
        else if (a < 0.78) o.view = o.view === 'map' ? '3d' : 'map';
        else {
          const W = 1.2 * K.levelSpacing(o.d1, o.k, o.N), sc = 239 / W;
          const x = (R() * 2 - 1) * 300 / sc, y = (R() * 2 - 1) * 245 / sc, q = K.nearest(x, y, o.d1, o.k, 1, 1)[0];
          o.probe = q.dist <= 12 / sc ? [q.x, q.y] : [x, y]; act = 'probe';
        }
      }
      hiddenOf(firing(snap(o, act))).forEach(x => hits.add(x));
    }
    hits.forEach(x => { cnt[x] = (cnt[x] || 0) + 1; });
  }
  const worst = Object.keys(cnt).map(x => x + ' ' + (100 * cnt[x] / tries).toFixed(2) + '%').join('、') || '都沒有';
  // h1（站在區域中心上）是 3 級、h2 是 4 級，選對 k 與等級數後點到中地就會碰到，放寬；6 級以上低於 3%
  const lim = { h1: 0.25, h2: 0.2, h3: 0.06, h4: 0.06, h5: 0.06 };
  expect('隨機亂玩 ' + tries + ' 次（每次 ' + steps + ' 步），隱藏任務碰巧完成的比例夠低', Object.keys(cnt).every(x => cnt[x] / tries < (lim[x] || 0.03)), worst);
}

const pub = missions.filter(m => !m.hidden), hid = missions.filter(m => m.hidden);
console.log('\n合計：' + ok + ' 項通過，' + bad + ' 項失敗');
console.log('公開 ' + pub.length + ' 個（' + pub.reduce((a, m) => a + m.level, 0) + ' 顆星），隱藏 ' + hid.length + ' 個（' + hid.reduce((a, m) => a + 2 * m.level, 0) + ' 顆星）；7 級以上的隱藏任務 ' + hid.filter(m => m.level >= 7).length + ' 個');
if (bad) process.exitCode = 1;
