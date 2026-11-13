/* 任務可達成的證明腳本。用法：node tools/mission-proofs/quake-early-warning.js
 * 修改物理核心或任務條件後重跑，確認每個任務仍然做得到、不該觸發的不會觸發。
 * 事件的內容與 js/quake-early-warning.js 的 snapshot() 相同，全部由 js/quake-early-warning-core.js 計算。
 * 滑桿可打字的精度（quake-early-warning.html 的 data-decimals）：規模 0.01、深度 0.1 km、測站間距 0.1 km、計算時間 0.1 s、初報誤差 0.01；
 * 測站數是整數；震央拖曳到 0.1 km；選定的地點可以是城市或地圖上任何一點。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const E = require(ROOT + 'js/quake-early-warning-core.js');
const QC = E.QC;
const missions = [];
global.window = { EEWCore: E, LabMission: { register: (id, list) => list.forEach(m => missions.push(m)) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/quake-early-warning.js');
const byId = id => missions.find(m => m.id === 'quake-early-warning-' + id);
const CITIES = QC.CITIES.map(c => Object.assign({}, c, QC.toXY(c.lon, c.lat)));
const city = id => CITIES.find(c => c.id === id);
const PRE = {};
E.QUAKES.forEach(q => { PRE[q.id] = q; });

const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
const DEF = { preset: 'hualien2024', M: 7.4, dM: 0, h: 15.5, lon: 121.67, lat: 23.77, spacing: 20, n: 6, proc: 4, onsite: false, sea: false, site: 'TPE' };
/** 頁面的狀態 → 事件（type 'state' 或 'run'）。o 可以給 preset（套用真實地震）、lon/lat 或 x/y、site（城市代號或 {x, y}） */
function ev(o, type) {
  o = Object.assign({}, DEF, o);
  if (o.preset && !o.keepQuake) { const p = PRE[o.preset]; o.M = o.M0 != null ? o.M0 : p.M; o.h = p.h; o.lon = p.lon; o.lat = p.lat; }
  let x, y;
  if (o.x != null) { x = r1(o.x); y = r1(o.y); } else { const p = QC.toXY(o.lon, o.lat); x = p.x; y = p.y; }
  const q = { x: x, y: y, h: r1(o.h), M: r2(o.M), dM: r2(o.dM) };
  const opt = { spacing: r1(o.spacing), n: o.n, proc: r1(o.proc), sea: o.sea, onsite: o.onsite };
  const s = E.scenario(q, opt);
  const TaNoSea = o.sea ? E.alertTime(q, E.stations(opt.spacing, false), opt.n, opt.proc).Ta : s.Ta;
  const pack = (e, id) => ({ id: id, d: e.d, R: e.R, tP: e.tP, tS: e.tS, sp: e.sp, pga: e.pga, I: e.I, Iest: e.Iest, alerted: e.alerted, lead: e.lead, leadOn: e.leadOn, best: e.best, blind: e.blind });
  const cities = {};
  CITIES.forEach(c => { cities[c.id] = pack(s.site(c.x, c.y), c.id); });
  const sp = typeof o.site === 'string' ? city(o.site) : o.site;
  const ll = QC.toLonLat(x, y);
  return { type: type || 'state', data: {
    preset: o.preset || '', M: q.M, dM: q.dM, Mest: s.Mest, h: q.h, lon: ll.lon, lat: ll.lat, x: x, y: y,
    spacing: opt.spacing, n: opt.n, proc: opt.proc, onsite: !!o.onsite, sea: !!o.sea,
    Ta: s.Ta, tFirst: s.tFirst, TaNoSea: TaNoSea, rb: s.rb, rbOn: s.rbOn, rAlert: s.rAlert, r4: s.r4, r5: s.r5, issue: s.issue, nst: s.st.length,
    site: Object.assign(pack(s.site(sp.x, sp.y), typeof o.site === 'string' ? o.site : 'custom'), { x: sp.x, y: sp.y }), cities: cities, chart: 'time'
  } };
}
const hits = (id, e) => !!e && byId(id).check(e);

let ok = 0, bad = 0;
function expect(label, cond, extra) {
  if (cond) { ok++; console.log('  ✓ ' + label + (extra ? '（' + extra + '）' : '')); }
  else { bad++; console.error('  ✗ ' + label + (extra ? '（' + extra + '）' : '')); }
}
const allIds = missions.map(m => m.id.replace('quake-early-warning-', ''));
const examples = {};
function ex(id, e, note) { examples[id] = e; expect(id + ' 做得到', hits(id, e), note); }
function no(id, e, note) { expect(id + ' 不觸發：' + note, !hits(id, e)); }
/** 在格點上找第一個成立的設定 */
function find(id, gen, avoid) { for (const o of gen()) { const e = ev(o.o, o.type); if (hits(id, e) && !(avoid || []).some(a => hits(a, e))) return { o: o, e: e }; } return null; }
const f1 = v => v.toFixed(1);

console.log('quake-early-warning 任務證明');
// 預設狀態（2024 花蓮、臺北）：任何一個任務都不觸發（state 與 alarm 事件）
{
  const e0 = ev({}), e1 = ev({}, 'alarm');
  const fired = allIds.filter(id => hits(id, e0) || hits(id, e1));
  expect('預設狀態（2024 花蓮、臺北、20 km、6 站、4 秒）不觸發任何任務', fired.length === 0, fired.join(','));
  const fr = allIds.filter(id => hits(id, ev({}, 'run')));
  expect('預設狀態按「發生地震」看完一次：只完成任務 1', fr.length === 1 && fr[0] === '1', fr.join(','));
}
// 每個真實地震、每個城市（預設系統）都只會觸發低級的公開任務
{
  const fired = {};
  E.QUAKES.forEach(p => CITIES.forEach(c => {
    allIds.forEach(id => { if (id !== '1' && hits(id, ev({ preset: p.id, site: c.id }))) fired[id] = (fired[id] || []).concat(p.id + '/' + c.id); });
  }));
  const hid = Object.keys(fired).filter(id => id[0] === 'h' || +id >= 5);
  expect('四個真實地震 × 十二個城市（預設系統）不會觸發 5 級以上或隱藏任務', hid.length === 0, hid.map(k => k + '：' + fired[k].slice(0, 3).join('、')).join('；'));
  console.log('    （會觸發的低級任務：' + Object.keys(fired).map(k => k + ' ' + fired[k].length + ' 種').join('、') + '）');
}

// 1
ex('1', ev({}, 'run'), '預設狀態看完一次');
no('1', ev({}), '只改設定、沒有播放');
// 2
ex('2', ev({ site: 'HUA' }), '花蓮市：預警時間 ' + f1(ev({ site: 'HUA' }).data.site.lead) + ' s');
no('2', ev({ site: 'TPE' }), '臺北不在盲區');
no('2', ev({ preset: 'chichi1999', site: 'SML' }), '別的地震');
// 3
{
  const R = 10 / (1 / E.VS - 1 / E.VP), d = Math.sqrt(R * R - 15.5 * 15.5), c = QC.toXY(121.67, 23.77);
  ex('3', ev({ site: { x: c.x - d, y: c.y } }), '震源距離 ' + f1(R) + ' km（震央往西 ' + f1(d) + ' km）');
  no('3', ev({ site: { x: c.x - d - 2, y: c.y } }), '再遠 2 km（S − P = ' + f1(ev({ site: { x: c.x - d - 2, y: c.y } }).data.site.sp) + ' s）');
}
// 4
{
  const r = find('4', function* () { for (let h = 30; h <= 100; h += 0.5) yield { o: { preset: '', M: 6.5, h: h, lon: 121.0, lat: 23.6 } }; });
  ex('4', r && r.e, r && ('M 6.5、深 ' + r.o.o.h + ' km（v_S·T_a = ' + f1(E.VS * r.e.data.Ta) + ' km）'));
  no('4', ev({ preset: '', M: 6.5, h: 20, lon: 121.0, lat: 23.6 }), '深 20 km');
  no('4', ev({ preset: '', M: 5.5, h: 60, lon: 121.0, lat: 23.6 }), '規模 5.5');
}
// 5
{
  const r = find('5', function* () { for (let s = 20; s >= 5; s -= 0.1) yield { o: { spacing: r1(s) } }; });
  ex('5', r && r.e, r && ('間距 ' + r.o.o.spacing + ' km：盲區 ' + f1(r.e.data.rb) + ' km'));
  no('5', ev({ spacing: 20, proc: 1 }), '改計算時間（不是間距）');
  no('5', ev({ spacing: 20 }), '間距 20 km：' + f1(ev({}).data.rb) + ' km');
}
// 6
ex('6', ev({ onsite: true, site: 'HUA' }), '花蓮市：區域型 ' + f1(ev({ onsite: true, site: 'HUA' }).data.site.lead) + ' s、現地型 ' + f1(ev({ onsite: true, site: 'HUA' }).data.site.leadOn) + ' s');
no('6', ev({ site: 'HUA' }), '沒開現地型');
// 7
{
  const r = find('7', function* () { for (let dm = -0.1; dm >= -1.5; dm -= 0.1) for (const c of CITIES) yield { o: { dM: r2(dm), site: c.id } }; });
  ex('7', r && r.e, r && ('初報誤差 ' + r.o.o.dM + '、' + r.o.o.site + '：震度 ' + r.e.data.site.I + '、預估 ' + r.e.data.site.Iest));
  no('7', ev({ dM: 0, site: 'TPE' }), '初報準確');
}
// 8
{
  const r = find('8', function* () { for (const n of [6, 4, 3]) for (let lon = 121.9; lon <= 122.6; lon += 0.05) for (let lat = 22.6; lat <= 24.9; lat += 0.1) yield { o: { preset: '', lon: lon, lat: lat, sea: true, n: n } }; });
  ex('8', r && r.e, r && (r.o.o.n + ' 站、震央 ' + r.e.data.lon.toFixed(2) + '°E、' + r.e.data.lat.toFixed(2) + '°N：外海站提早 ' + f1(r.e.data.TaNoSea - r.e.data.Ta) + ' s'));
  no('8', ev({ preset: 'chichi1999', sea: true }), '集集（陸上）：提早 ' + f1(ev({ preset: 'chichi1999', sea: true }).data.TaNoSea - ev({ preset: 'chichi1999', sea: true }).data.Ta) + ' s');
}
// 9
{
  const r = find('9', function* () { for (let p = 4; p >= 0; p -= 0.1) yield { o: { proc: r1(p) } }; });
  ex('9', r && r.e, r && ('計算時間 ' + r.o.o.proc + ' s：盲區 ' + f1(r.e.data.rb) + ' km'));
}
// 10
{
  const r = find('10', function* () { for (const h of [30, 25, 40]) for (let lat = 22.0; lat <= 22.8; lat += 0.2) for (const c of CITIES) yield { o: { preset: '', M: 7.5, h: h, lon: 121.0, lat: lat, site: c.id } }; });
  ex('10', r && r.e, r && ('M 7.5、深 ' + r.o.o.h + ' km、121.0°E、' + r.o.o.lat.toFixed(1) + '°N、' + r.o.o.site + '：' + f1(r.e.data.site.best) + ' s、震度 ' + r.e.data.site.I));
  no('10', ev({ preset: '', M: 6, lon: 120.8, lat: 22.0, site: 'TPE' }), 'M 6（臺北搖不到 4 級）');
}
// 11
{
  const r = find('11', function* () { for (let s = 20; s >= 5; s -= 1) for (const n of [4, 5]) for (let p = 4; p >= 2; p -= 0.5) yield { o: { preset: 'chichi1999', site: 'TXG', spacing: s, n: n, proc: p } }; });
  ex('11', r && r.e, r && ('間距 ' + r.o.o.spacing + ' km、' + r.o.o.n + ' 站、' + r.o.o.proc + ' s：臺中 ' + f1(r.e.data.site.lead) + ' s'));
  no('11', ev({ preset: 'chichi1999', site: 'TXG' }), '預設系統：臺中 ' + f1(ev({ preset: 'chichi1999', site: 'TXG' }).data.site.lead) + ' s');
  no('11', ev({ preset: 'chichi1999', site: 'TXG', n: 1, proc: 0 }), '1 站、0 秒（不合要求）');
}
// 12
{
  const r = find('12', function* () { for (let lon = 121.6; lon <= 122.4; lon += 0.1) for (let lat = 22.4; lat <= 24.6; lat += 0.1) for (const M of [7.5, 8]) yield { o: { preset: '', M: M, h: 15, lon: lon, lat: lat } }; });
  const n4 = r ? Object.values(r.e.data.cities).filter(c => c.I >= 4).length : 0;
  ex('12', r && r.e, r && ('M ' + r.o.o.M + '、' + r.e.data.lon.toFixed(1) + '°E、' + r.e.data.lat.toFixed(1) + '°N：' + n4 + ' 個城市 4 級以上，全部提早收到'));
  no('12', ev({}), '2024 花蓮（花蓮市在盲區）');
}

// ---------- 隱藏任務 ----------
{
  const r = find('h1', function* () { for (const c of CITIES) for (let lon = 122.4; lon >= 121.6; lon -= 0.2) for (let lat = 25.2; lat >= 22.0; lat -= 0.4) yield { o: { preset: '', M: 7.5, h: 30, lon: lon, lat: lat, site: c.id } }; }, ['h4', 'h8', 'h9']);
  ex('h1', r && r.e, r && ('M 7.5、深 30 km、' + r.e.data.lon.toFixed(1) + '°E、' + r.e.data.lat.toFixed(1) + '°N、' + r.o.o.site + '：警報 ' + f1(r.e.data.Ta) + ' s、P 波 ' + f1(r.e.data.site.tP) + ' s'));
  no('h1', ev({ site: 'TPE' }), '預設：臺北 P 波只比警報晚 ' + f1(ev({}).data.site.tP - ev({}).data.Ta) + ' s'); no('h1', ev({ preset: 'chichi1999', site: 'HCN' }), '集集、恆春：' + f1(ev({ preset: 'chichi1999', site: 'HCN' }).data.site.tP - ev({ preset: 'chichi1999' }).data.Ta) + ' s');
}
{
  const c = QC.toXY(121.67, 23.77), rb = ev({}).data.rb;
  ex('h2', ev({ site: { x: c.x - rb, y: c.y } }), '震央往西 ' + f1(rb) + ' km（盲區邊界）');
  no('h2', ev({ site: { x: c.x - rb - 2, y: c.y } }), '再往西 2 km');
}
{
  const r = find('h3', function* () { for (let s = 20; s >= 5; s -= 1) yield { o: { n: 1, proc: 0, spacing: s, site: 'HUA' } }; }, ['h1']);
  ex('h3', r && r.e, r && ('1 站、0 秒、間距 ' + r.o.o.spacing + ' km：盲區 ' + f1(r.e.data.rb) + ' km'));
  no('h3', ev({ n: 1, proc: 0.5, spacing: 5 }), '計算 0.5 秒');
}
{
  const r = find('h4', function* () { for (let lat = 22.8; lat <= 24.6; lat += 0.1) for (let lon = 120.0; lon >= 119.0; lon -= 0.1) for (const M of [6.5, 7, 7.5, 8]) for (const s of [20, 15, 10]) yield { o: { preset: '', M: M, h: 10, lon: lon, lat: lat, site: 'PEH', spacing: s } }; });
  ex('h4', r && r.e, r && ('M ' + r.o.o.M + '、間距 ' + r.o.o.spacing + ' km、' + r.e.data.lon.toFixed(1) + '°E、' + r.e.data.lat.toFixed(1) + '°N：澎湖震度 ' + r.e.data.cities.PEH.I + '、' + f1(r.e.data.cities.PEH.lead) + ' s'));
  no('h4', ev({ preset: 'chichi1999' }), '集集（震央不在海峽）：澎湖 ' + f1(ev({ preset: 'chichi1999' }).data.cities.PEH.best) + ' s');
}
{
  const r = find('h5', function* () { for (let dm = 0.3; dm <= 0.7; dm += 0.1) for (const c of CITIES) for (const p of E.QUAKES) yield { o: { preset: p.id, dM: r2(dm), site: c.id } }; });
  ex('h5', r && r.e, r && (r.o.o.preset + '、初報 +' + r.o.o.dM + '、' + r.o.o.site + '：實際 ' + r.e.data.site.I + ' 級、預估 ' + r.e.data.site.Iest + ' 級'));
  no('h5', ev({ preset: r ? r.o.o.preset : 'meinong2016', dM: 0, site: r ? r.o.o.site : 'TPE' }), '初報準確');
}
{
  // 區域型 = 現地型：S − T_a = t_P + 3 的距離 → 沿正西方向二分
  const c = QC.toXY(121.67, 23.77), base = { onsite: true };
  const f = d => { const e = ev(Object.assign({ site: { x: c.x - d, y: c.y } }, base)).data.site; return e.lead - e.leadOn; };
  let lo = 40, hi = 300;
  for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (f(m) < 0) lo = m; else hi = m; }
  ex('h6', ev(Object.assign({ site: { x: c.x - lo, y: c.y } }, base)), '震央往西 ' + f1(lo) + ' km');
  no('h6', ev(Object.assign({ site: { x: c.x - lo - 5, y: c.y } }, base)), '再遠 5 km');
}
{
  const r = find('h7', function* () { for (let s = 20; s >= 5; s -= 0.5) for (let n = 3; n <= 4; n++) for (let p = 2; p >= 1; p -= 0.5) yield { o: { preset: 'chichi1999', spacing: r1(s), n: n, proc: p, site: 'TXG' } }; }, ['h2', 'h8']);
  ex('h7', r && r.e, r && ('間距 ' + r.o.o.spacing + ' km、' + r.o.o.n + ' 站、' + r.o.o.proc + ' s：日月潭 ' + f1(r.e.data.cities.SML.lead) + ' s'));
  no('h7', ev({ preset: 'chichi1999', site: 'SML' }), '預設系統：日月潭 ' + f1(ev({ preset: 'chichi1999' }).data.cities.SML.lead) + ' s');
  no('h7', ev({ preset: 'chichi1999', site: 'SML', spacing: 5, n: 1, proc: 0 }), '1 站、0 秒');
}
{
  const r = find('h8', function* () { for (let lon = 119.4; lon <= 122.4; lon += 0.1) for (let lat = 21.8; lat <= 25.4; lat += 0.1) yield { o: { preset: '', M: 8, h: 30, lon: lon, lat: lat, site: 'HCN' } }; }, ['h1', 'h4', 'h9']);
  ex('h8', r && r.e, r && ('M 8、深 30 km、' + r.e.data.lon.toFixed(1) + '°E、' + r.e.data.lat.toFixed(1) + '°N：最短的預警 ' + f1(Math.min.apply(null, Object.values(r.e.data.cities).map(c => c.lead))) + ' s'));
  no('h8', ev({ M0: 8 }), '花蓮 M 8：花蓮市在盲區');
  no('h8', examples.h7, 'h7 的達成例（3 站、1 秒）');
}
{
  const r = find('h9', function* () { for (const h of [30, 25, 40, 20]) for (let lat = 22.0; lat <= 23.4; lat += 0.1) for (let lon = 120.4; lon <= 121.8; lon += 0.1) yield { o: { preset: '', M: 7.5, h: h, lon: lon, lat: lat, site: 'HUA' } }; }, ['h1', 'h4', 'h8']);
  ex('h9', r && r.e, r && ('M 7.5、深 ' + r.o.o.h + ' km、' + r.e.data.lon.toFixed(1) + '°E、' + r.e.data.lat.toFixed(1) + '°N：臺北 ' + r.e.data.cities.TPE.I + ' 級、' + f1(r.e.data.cities.TPE.lead) + ' s'));
  no('h9', ev({}), '2024 花蓮：臺北 ' + f1(ev({}).data.cities.TPE.lead) + ' s');
  no('h9', ev({ preset: '', M: 8, h: 30, lon: 121.0, lat: 22.4, site: 'HUA' }), '規模 8（滑桿拉到底）不算');
}
{
  const r = find('h10', function* () {
    for (let M = 5.8; M <= 6.6; M += 0.1) for (let dm = -0.8; dm >= -1.5; dm -= 0.1) for (let d = 30; d <= 70; d += 2) {
      const c = QC.toXY(121.0, 23.6);
      yield { o: { preset: '', M: r2(M), dM: r2(dm), h: 10, lon: 121.0, lat: 23.6, onsite: true, site: { x: c.x + d, y: c.y } } };
    }
  });
  ex('h10', r && r.e, r && ('M ' + r.o.o.M + '、初報誤差 ' + r.o.o.dM + '（初報 ' + f1(r.e.data.Mest) + '）：' + f1(r.e.data.site.d) + ' km 外 ' + r.e.data.site.I + ' 級、現地型 ' + f1(r.e.data.site.leadOn) + ' s'));
  no('h10', ev({ preset: '', M: 6.2, dM: 0, h: 10, lon: 121, lat: 23.6, onsite: true, site: 'SML' }), '初報準確（有發布）');
}

// 隱藏任務彼此不連帶完成：每個隱藏任務的達成例，不會讓別的隱藏任務完成
{
  const hid = allIds.filter(id => id[0] === 'h');
  hid.forEach(function (id) {
    if (!examples[id]) return;
    const others = hid.filter(o => o !== id && hits(o, examples[id]));
    expect(id + ' 的達成例不會順便完成別的隱藏任務', others.length === 0, others.join(','));
  });
}
// 等級分布
{
  const hl = missions.filter(m => m.hidden).map(m => m.level);
  expect('隱藏任務 10 個、等級 3–10、至少 3 個在 7 級以上', hl.length === 10 && Math.min.apply(null, hl) >= 3 && Math.max.apply(null, hl) <= 10 && hl.filter(l => l >= 7).length >= 3, hl.join(','));
  const pub = missions.filter(m => !m.hidden), hidden = missions.filter(m => m.hidden);
  console.log('    公開 ' + pub.length + ' 個 ' + pub.reduce((a, m) => a + m.level, 0) + ' 顆星；隱藏 ' + hidden.length + ' 個 ' + hidden.reduce((a, m) => a + m.level * 2, 0) + ' 顆星');
}

console.log('\n' + ok + ' 項通過' + (bad ? '，' + bad + ' 項失敗' : ''));
if (bad) process.exitCode = 1;
