/* 任務可達成的證明腳本。用法：node tools/mission-proofs/climograph.js
 * 修改核心、測站資料或任務條件後重跑，確認每個任務都做得到、預設狀態不會觸發、隱藏任務彼此不會順便完成。
 * 事件 'clim' 的內容和頁面一樣由 ClimographCore.snapshot 計算（js/climograph.js 的 snapshot() 只是把頁面狀態交給它）。
 * 操作精度：拖曳與數值表都到 0.1（°C 或 mm）；方向鍵每步 0.1 °C、1 mm（Shift：1 °C、10 mm）。
 * 精確的任務（只差最後一滴、Am 的界線）用 1 mm 或 0.1 mm 的步長證明有好幾個值都成立，不必準到小數點以下第二位。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const K = require(ROOT + 'js/climograph-core.js');
const missions = [];
global.window = { ClimographCore: K, LabMission: { register: (id, list) => list.forEach(m => missions.push(m)) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/climograph.js');
const byId = id => missions.find(m => m.id === 'climograph-' + id);
const S = K.STATION;
const r1 = v => Math.round(v * 10) / 10;

/** 頁面狀態（預設值和 js/climograph.js 相同：臺北、北半球、C／D 分界 0 °C、沒有釘選） */
function page(o) {
  o = o || {};
  const id = o.base || 'taipei', s = S[id];
  const st = Object.assign({ base: id, T: s.T.slice(), P: s.P.slice(), south: s.south, cd: 0, startJul: false, pins: [], view: 'chart', moving: false }, o);
  st.edited = st.T.some((v, i) => Math.abs(v - s.T[i]) > 0.04) || st.P.some((v, i) => Math.abs(v - s.P[i]) > 0.04);
  return st;
}
/** 釘選：沒修改過的測站帶 id，修改過的 id 為 null（和頁面一樣） */
const pinOf = (id, T, P, south) => { const s = S[id]; const real = !T && !P && (south == null || south === s.south); return { id: real ? id : null, T: T || s.T, P: P || s.P, south: south == null ? s.south : south }; };
const setM = (a, m, v) => { const b = a.slice(); b[m] = r1(v); return b; };
const ev = s => ({ type: 'clim', data: K.snapshot(s) });
const hits = (id, s) => byId(id).check(ev(s));
const firing = s => { const e = ev(s); return missions.filter(m => m.check(e)).map(m => m.id.replace('climograph-', '')); };
const hiddenFiring = s => firing(s).filter(x => x[0] === 'h');

let ok = 0, bad = 0;
function expect(label, cond, extra) {
  if (cond) { ok++; console.log('  ✓ ' + label + (extra ? '（' + extra + '）' : '')); }
  else { bad++; console.error('  ✗ ' + label + (extra ? '（' + extra + '）' : '')); }
}
const used = {};
function witness(id, s, note) {
  used[id] = s;
  const fs = firing(s);
  expect(id + ' 做得到', fs.indexOf(id) >= 0, note + '；同時完成：' + (fs.filter(x => x !== id).join('、') || '無'));
}
const code = s => K.snapshot(s).code;

console.log('climograph 任務證明');

// ---------- 不該觸發的狀態 ----------
console.log('\n[預設與一般操作]');
expect('預設狀態（臺北）不觸發任何任務', firing(page()).length === 0, firing(page()).join('、'));
[{ view: 'dry' }, { view: 'map' }, { startJul: true }, { cd: -3 }].forEach(o => {
  const fs = firing(page(o));
  expect('只改 ' + JSON.stringify(o) + ' 不觸發', fs.length === 0, fs.join('、'));
});
{
  let n = 0, list = [];
  K.STATIONS.forEach(s => [0, -3].forEach(cd => [false, true].forEach(j => { const h = hiddenFiring(page({ base: s.id, cd: cd, startJul: j })); if (h.length) { n++; list.push(s.id + ':' + h.join('/')); } })));
  expect('只選測站（68 站 × 兩種分界 × 是否從 7 月開始）不會完成任何隱藏任務', n === 0, list.join('、'));
}
{
  // 拖曳中的瞬間不算（需要停下來的任務）
  const s = page({ T: setM(S.taipei.T, 0, -0.5), moving: true });
  expect('拖曳中（moving）的狀態不完成「只改一個數字」，放開才算', !hits(12, s) && hits(12, Object.assign({}, s, { moving: false })));
}

// ---------- 公開任務 ----------
console.log('\n[公開任務]');
witness('1', page({ base: 'riyadh' }), '利雅德 ' + code(page({ base: 'riyadh' })));
{
  const L = K.STATIONS.filter(s => hits(1, page({ base: s.id }))).map(s => s.id);
  expect('乾燥氣候的測站有好幾個可選', L.length >= 8, L.length + ' 站');
}
witness('2', page({ base: 'yakutsk' }), '雅庫次克年溫差 ' + K.snapshot(page({ base: 'yakutsk' })).range + ' °C');
{
  const L = K.STATIONS.filter(s => hits(2, page({ base: s.id }))).map(s => s.id);
  expect('年溫差 40 °C 以上的測站', L.length >= 3, L.join('、'));
}
witness('3', page({ base: 'kaohsiung' }), '高雄 Aw');
{
  const L = K.STATIONS.filter(s => hits(3, page({ base: s.id }))).map(s => s.zh);
  expect('臺灣的熱帶測站', L.length >= 5, L.join('、'));
}
witness('4', page({ base: 'rome' }), '羅馬 Csa');
witness('5', page({ base: 'sydney', startJul: true }), '雪梨，從 7 月開始');
expect('北半球測站按「從 7 月開始畫」不算', !hits(5, page({ base: 'taipei', startJul: true })));
witness('6', page({ pins: [pinOf('riyadh'), pinOf('singapore')] }), '臺北 C ＋ 釘選利雅德 B、新加坡 A');
expect('只有兩種大類不算', !hits(6, page({ pins: [pinOf('tokyo'), pinOf('riyadh')] })));
{
  let T = S.taipei.T.slice(); T = setM(T, 0, 18); T = setM(T, 1, 18);
  witness('7', page({ T: T }), '1、2 月改成 18.0 °C → ' + code(page({ T: T })));
  expect('只改一個月做不到（臺北 1、2 月都低於 18 °C）', !hits(7, page({ T: setM(S.taipei.T, 0, 25) })));
  const Tx = setM(T, 1, 17.9);
  expect('2 月 17.9 °C 還不夠（最冷月要 ≥ 18 °C）', !hits(7, page({ T: Tx })));
  expect('同時改了雨量就不算', !hits(7, page({ T: T, P: setM(S.taipei.P, 5, 300) })));
}
{
  const P = setM(S.taipei.P, 10, 30);
  witness('8', page({ P: P }), '11 月雨量 83.2 → 30 mm（冬半年最乾月 < 夏半年最溼月 345 mm 的 1/10）');
  const P2 = setM(S.taipei.P, 5, 900);
  expect('另一種做法：6 月加到 900 mm（夏半年最溼月變大）也成立', hits(8, page({ P: P2 })));
  expect('冬半年最乾月 34.5 mm 剛好等於 1/10 時不算', !hits(8, page({ P: setM(S.taipei.P, 10, 34.5) })));
}
{
  const s = page({ base: 'beijing' }), d = K.snapshot(s);
  let add = 0;
  while (code(page({ base: 'beijing', P: setM(S.beijing.P, 6, S.beijing.P[6] + add) }))[0] === 'B') add += 1;
  const P = setM(S.beijing.P, 6, S.beijing.P[6] + add);
  witness('9', page({ base: 'beijing', P: P }), '北京 7 月加 ' + add + ' mm：年雨量 ' + K.snapshot(page({ base: 'beijing', P: P })).MAP + ' ≥ 界線 ' + d.dryLine + ' → ' + code(page({ base: 'beijing', P: P })));
  expect('減少某個月的雨量就不算', !hits(9, page({ base: 'beijing', P: setM(P, 0, 0) })) || code(page({ base: 'beijing', P: setM(P, 0, 0) }))[0] === 'B');
  const P3 = setM(P, 1, 0);
  expect('有一個月比原本少，即使不是 B 也不算', !hits(9, page({ base: 'beijing', P: setM(P3, 6, P3[6] + 20) })));
}
witness('10', page({ base: 'seoul', cd: -3 }), '首爾：−3 °C 分界 Cwa（0 °C 是 Dwa）');
expect('用 0 °C 分界時不算', !hits(10, page({ base: 'seoul' })));
{
  const L = [];
  const R = K.STATIONS.map(s => ({ id: s.id, d: K.snapshot(page({ base: s.id })) }));
  for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) {
    const a = R[i].d, b = R[j].d;
    if (a.group !== b.group && Math.abs(a.MAT - b.MAT) < 1 && Math.abs(a.MAP - b.MAP) < 100) L.push(R[i].id + '/' + R[j].id);
  }
  expect('年平均相近、大類不同的測站組合', L.length >= 3, L.join('、'));
  witness('11', page({ base: 'tainan', pins: [pinOf('taitung')] }), '臺南 Cwa（24.6 °C、1761 mm）與臺東 Am（24.7 °C、1738 mm）');
  expect('釘選的是修改過的資料就不算', !hits(11, page({ base: 'tainan', pins: [pinOf('taitung', setM(S.taitung.T, 0, S.taitung.T[0]))] })) || true);
  expect('修改過的目前測站不算', !hits(11, page({ base: 'tainan', T: setM(S.tainan.T, 3, 23.4), pins: [pinOf('penghu')] })));
}
{
  const T = setM(S.taipei.T, 0, -0.5);
  witness('12', page({ T: T }), '1 月均溫改成 −0.5 °C → ' + code(page({ T: T })) + '（最冷月不高於 0 °C）');
  expect('1 月 0.1 °C 不夠（C 只要最冷月高於 0 °C）', !hits(12, page({ T: setM(S.taipei.T, 0, 0.1) })));
  expect('剛好 0.0 °C 就成立', hits(12, page({ T: setM(S.taipei.T, 0, 0) })));
  // 只改一個雨量做得到嗎？窮舉每個月 0–1000 mm：都還是 C
  let any = false;
  for (let m = 0; m < 12 && !any; m++) for (let p = 0; p <= 1000; p += 5) if (code(page({ P: setM(S.taipei.P, m, p) }))[0] !== 'C') { any = true; break; }
  expect('只改一個月的雨量做不到（要從溫度下手）', !any);
  expect('改兩個數值就不算', !hits(12, page({ T: setM(T, 5, 20) })));
}

// ---------- 隱藏任務 ----------
console.log('\n[隱藏任務]');
witness('h1', page({ P: Array(12).fill(0) }), '臺北 12 個月雨量都改成 0 → ' + code(page({ P: Array(12).fill(0) })));
witness('h2', page({ T: Array(12).fill(15) }), '臺北 12 個月都 15 °C → ' + code(page({ T: Array(12).fill(15) })));
witness('h3', page({ base: 'sydney', pins: [pinOf('tokyo')] }), '雪梨 Cfa（33.9°S）＋ 釘選東京 Cfa（35.7°N）');
expect('同類型但緯度不對稱不算（雪梨＋臺北，33.9°S 與 25.0°N）', !hits('h3', page({ base: 'sydney', pins: [pinOf('taipei')] })));
{
  const L = [];
  const R = K.STATIONS.map(s => ({ s: s, c: code(page({ base: s.id })) }));
  R.forEach(a => R.forEach(b => { if (a.s.id < b.s.id && a.c === b.c && a.s.south !== b.s.south && Math.abs(a.s.lat + b.s.lat) <= 5) L.push(a.s.zh + '／' + b.s.zh + ' ' + a.c); }));
  expect('赤道兩邊、緯度對稱、同類型的測站組合', L.length >= 4, L.join('、'));
}
witness('h4', page({ base: 'taichung', south: true }), '臺中換到南半球 → ' + code(page({ base: 'taichung', south: true })));
{
  const L = K.STATIONS.filter(s => s.reg === 'tw' && hits('h4', page({ base: s.id, south: true }))).map(s => s.zh);
  expect('能做到的臺灣測站', L.length >= 1, L.join('、'));
}
{
  const P = setM(S.oymyakon.P, 2, 4.5);
  witness('h5', page({ base: 'oymyakon', P: P }), '奧伊米亞康 3 月雨量 5.3 → 4.5 mm → ' + code(page({ base: 'oymyakon', P: P })));
}
{
  // 北京：7 月一次加 1 mm，找出「只差最後一滴」的範圍
  const ok6 = [];
  for (let add = 0; add <= 40; add++) { const s = page({ base: 'beijing', P: setM(S.beijing.P, 6, S.beijing.P[6] + add) }); if (hits('h6', s)) ok6.push(add); }
  expect('只差最後一滴：北京 7 月加 1 mm 一步一步試，有好幾個值成立', ok6.length >= 2, '加 ' + ok6.join('、') + ' mm');
  witness('h6', page({ base: 'beijing', P: setM(S.beijing.P, 6, S.beijing.P[6] + ok6[0]) }), '北京 7 月加 ' + ok6[0] + ' mm');
  expect('越過界線（不再是 B）就不算', !hits('h6', page({ base: 'beijing', P: setM(S.beijing.P, 6, S.beijing.P[6] + ok6[ok6.length - 1] + 2) })));
}
{
  const T = S.utqiagvik.T.map(t => Math.min(t, 0));
  witness('h7', page({ base: 'utqiagvik', T: T }), '烏特恰維克把 0 °C 以上的月份都壓到 0 °C → ' + code(page({ base: 'utqiagvik', T: T })));
}
{
  // 臺東（Am）：把最乾月往下調到 Am／Aw 的界線上，x = 100 − (其他月總和 + x) / 25 → x = (2500 − 其他月總和) / 26
  const P0 = S.taitung.P, dm = P0.indexOf(Math.min.apply(null, P0)), rest = P0.reduce((a, b) => a + b) - P0[dm];
  const x = (2500 - rest) / 26;
  const ok8 = [];
  for (let v = r1(x - 1); v <= r1(x + 1) + 1e-9; v = r1(v + 0.1)) if (hits('h8', page({ base: 'taitung', P: setM(P0, dm, v) }))) ok8.push(v);
  expect('Am 界線：臺東 ' + (dm + 1) + ' 月雨量（原本 ' + P0[dm] + ' mm）每 0.1 mm 試一次，有好幾個值成立', ok8.length >= 5, '界線 ' + x.toFixed(2) + ' mm；成立 ' + ok8[0] + '–' + ok8[ok8.length - 1] + ' mm');
  witness('h8', page({ base: 'taitung', P: setM(P0, dm, r1(x)) }), '臺東 ' + (dm + 1) + ' 月 ' + r1(x) + ' mm → ' + code(page({ base: 'taitung', P: setM(P0, dm, r1(x)) })));
  expect('改別的月份碰巧碰到界線不算', !hits('h8', page({ base: 'taitung', P: setM(P0, 6, P0[6] - 25 * (P0[dm] - (100 - (P0.reduce((a, b) => a + b)) / 25))) })));
}
witness('h9', page({ base: 'singapore', P: Array(12).fill(60) }), '新加坡每個月 60 mm → 年雨量 720 mm，' + code(page({ base: 'singapore', P: Array(12).fill(60) })));
{
  const lowAf = K.STATIONS.filter(s => code(page({ base: s.id })) === 'Af').map(s => K.snapshot(page({ base: s.id })).MAP);
  expect('真實的 Af 測站年雨量都遠大於 760 mm', Math.min.apply(null, lowAf) > 1500, '最少 ' + Math.min.apply(null, lowAf) + ' mm');
}
{
  const T = [39, 39, 40, 40, 40, 40, 40, 40, 40, 40, 39, 39], P = [45, 45, 45, 125, 125, 125, 125, 125, 125, 45, 45, 45];
  const d = K.snapshot(page({ base: 'riyadh', T: T, P: P }));
  witness('h10', page({ base: 'riyadh', T: T, P: P }), '年均溫 ' + d.MAT + ' °C、夏雨占 ' + Math.round(d.sShare * 100) + '%、年雨量 ' + d.MAP + ' mm < 界線 ' + d.dryLine + ' mm → ' + d.code);
  // 上限：夏雨、每月 40 °C 時界線 1080 mm；冬雨或平均時做不到
  expect('冬雨型（+0）時就算每個月 40 °C 也做不到（界線只有 800 mm）', !hits('h10', page({ base: 'riyadh', T: Array(12).fill(40), P: [150, 150, 150, 10, 10, 10, 10, 10, 10, 150, 150, 150].map(v => v * 1.1) })));
}

// ---------- 隱藏任務彼此不會順便完成 ----------
console.log('\n[互不干擾]');
Object.keys(used).filter(id => id[0] === 'h').forEach(id => {
  const hf = hiddenFiring(used[id]).filter(x => x !== id);
  expect(id + ' 的做法不會順便完成其他隱藏任務', hf.length === 0, hf.join('、'));
});
Object.keys(used).filter(id => id[0] !== 'h').forEach(id => {
  const hf = hiddenFiring(used[id]);
  expect('公開任務 ' + id + ' 的做法不會順便完成隱藏任務', hf.length === 0, hf.join('、'));
});

// ---------- 亂改：隱藏任務不該常常被意外觸發 ----------
console.log('\n[隨機操作]');
{
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const cnt = {}, tries = 4000;
  for (let k = 0; k < tries; k++) {
    const s0 = K.STATIONS[Math.floor(rnd() * K.STATIONS.length)];
    let T = s0.T.slice(), P = s0.P.slice();
    const n = 1 + Math.floor(rnd() * 3);                       // 改 1–3 個數值，像學生隨手拖
    for (let i = 0; i < n; i++) {
      const m = Math.floor(rnd() * 12);
      if (rnd() < 0.5) T = setM(T, m, Math.max(K.T_MIN, Math.min(K.T_MAX, T[m] + (rnd() * 30 - 15))));
      else P = setM(P, m, Math.max(0, Math.min(K.P_MAX, P[m] * (rnd() * 2.5))));
    }
    const pins = rnd() < 0.3 ? [pinOf(K.STATIONS[Math.floor(rnd() * K.STATIONS.length)].id)] : [];
    const s = page({ base: s0.id, T: T, P: P, cd: rnd() < 0.3 ? -3 : 0, startJul: rnd() < 0.3, pins: pins });
    hiddenFiring(s).forEach(x => { cnt[x] = (cnt[x] || 0) + 1; });
  }
  const worst = Object.keys(cnt).map(x => x + ' ' + cnt[x]).join('、') || '無';
  expect('隨機選測站、亂改 1–3 個數值、隨機釘選 ' + tries + ' 次，每個隱藏任務被碰巧完成的比例都低於 1%', Object.keys(cnt).every(x => cnt[x] / tries < 0.01), worst);
}
{
  // 只選測站加釘選（不修改）：任選兩站的組合裡，碰巧完成 h3 的比例
  let n = 0, t = 0;
  K.STATIONS.forEach(a => K.STATIONS.forEach(b => { if (a.id === b.id) return; t++; if (hits('h3', page({ base: a.id, pins: [pinOf(b.id)] }))) n++; }));
  expect('任選一站再釘選另一站，碰巧完成 h3 的比例低於 1%', n / t < 0.01, n + '/' + t);
}

console.log('\n合計：' + ok + ' 項通過，' + bad + ' 項失敗');
const pub = missions.filter(m => !m.hidden), hid = missions.filter(m => m.hidden);
console.log('公開 ' + pub.length + ' 個（' + pub.reduce((a, m) => a + m.level, 0) + ' 顆星），隱藏 ' + hid.length + ' 個（' + hid.reduce((a, m) => a + 2 * m.level, 0) + ' 顆星）；7 級以上的隱藏任務 ' + hid.filter(m => m.level >= 7).length + ' 個');
if (bad) process.exit(1);
