/* 任務可達成的證明腳本。用法：node tools/mission-proofs/parallax.js
 * 修改物理核心或任務條件後重跑，確認每個任務仍然做得到、不該觸發的不會觸發。
 * 事件的內容與 js/parallax.js 的 snapshot() 相同，全部由 js/parallax-core.js 計算；照片的誤差和頁面一樣用種子 1838、依拍照順序編號。
 * 滑桿可打字的精度：距離 0.001 pc、黃緯 0.1°、日期 0.001 年、基線 0.000001 AU。「兩年拍 12 張」從 min(日期, 1) 起每隔 2/11 年拍一張。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const PC = require(ROOT + 'js/parallax-core.js');
const missions = [];
global.window = { ParCore: PC, LabMission: { register: (id, list) => list.forEach(m => missions.push(m)) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/parallax.js');
const SLUG = 'parallax-';
const byId = id => missions.find(m => m.id === SLUG + id);
const STAR = {}; PC.STARS.forEach(s => { STAR[s.id] = s; });
const INST = {}; PC.INSTRUMENTS.forEach(i => { INST[i.id] = i; });
const SEED = 1838;

const rd = (v, n) => Math.round(v * Math.pow(10, n)) / Math.pow(10, n);
const DEF = { mode: 'orbit', star: 'proxima', pm: true, t: 0, inst: 'bessel', fitPM: true, shots: [], B: 2, base: 'orbit', chart: 'a', anim: false };
/** 連拍的日期 */
const burst = (t, times) => { const out = []; const t0 = Math.min(t, 1); for (let r = 0; r < (times || 1); r++) for (let j = 0; j < 12; j++) out.push(t0 + 2 * j / 11); return out; };
/** 頁面的狀態 → 事件。o.star 給代號就是預設恆星（精確值）；給 d、beta 就是自訂（照滑桿精度）。o.shots 是照片的日期（依序拍）。 */
function ev(o, type) {
  o = Object.assign({}, DEF, o);
  let d, beta, lam, s0 = null;
  if (o.star) { s0 = STAR[o.star]; d = 1 / s0.p; beta = s0.beta; lam = s0.lam; }
  else { d = rd(o.d, 3); beta = rd(o.beta, 1); lam = o.lam != null ? o.lam : STAR.proxima.lam; }
  const on = !!(s0 && o.pm), st = { lam: lam, beta: beta, p: 1 / d, mux: on ? s0.mux : 0, muy: on ? s0.muy : 0 };
  const sig = INST[o.inst].sigma, photos = o.shots.map((t, k) => PC.photo(st, t, sig, SEED, k));
  const f = photos.length ? PC.fit(photos, lam, beta, o.fitPM) : null, pf = PC.pfactor(lam, beta, o.t);
  let opp = PC.sunLon(o.t) - (lam + 180); opp = ((opp % 360) + 540) % 360 - 180;
  const ts = o.shots, th = PC.baselineShift(o.B, d);
  return { type: type || 'state', data: {
    mode: o.mode, star: o.star || '', d: d, p: st.p, beta: beta, lam: lam, pm: !!(st.mux || st.muy), mu: Math.hypot(st.mux, st.muy),
    t: o.t, opp: opp, ellA: st.p, ellB: st.p * Math.abs(Math.sin(beta * Math.PI / 180)), nowX: st.p * pf.x, nowY: st.p * pf.y,
    inst: o.inst, sigma: sig, n: photos.length, span: ts.length ? Math.max.apply(null, ts) - Math.min.apply(null, ts) : 0, gap: ts.length === 2 ? Math.abs(ts[1] - ts[0]) : null, fitPM: o.fitPM,
    fp: f ? f.p : null, fsp: f ? f.sp : null, rel: f && f.p > 0 ? f.sp / f.p : null, err: f ? Math.abs(f.p / st.p - 1) : null,
    B: o.B, base: o.base || '', theta: th, ratio: th / (2 * st.p), chart: o.chart, anim: !!o.anim
  } };
}
const hits = (id, e) => !!e && byId(id).check(e);

let ok = 0, bad = 0;
function expect(label, cond, extra) {
  if (cond) { ok++; console.log('  ✓ ' + label + (extra ? '（' + extra + '）' : '')); }
  else { bad++; console.error('  ✗ ' + label + (extra ? '（' + extra + '）' : '')); }
}
const allIds = missions.map(m => m.id.replace(SLUG, ''));
const hidIds = allIds.filter(id => id[0] === 'h');
const examples = {};
function ex(id, e, note) { examples[id] = e; expect(id + ' 做得到', hits(id, e), note); }
function no(id, e, note) { expect(id + ' 不觸發：' + note, !hits(id, e)); }
function find(id, gen, avoid) { for (const g of gen()) { const e = ev(g.o, g.type); if (hits(id, e) && !(avoid || []).some(a => hits(a, e))) return { o: g.o, e: e }; } return null; }
const otherHidden = id => hidIds.filter(h => h !== id);
const f3 = v => v == null ? '—' : v.toPrecision(3);
const pct = v => v == null ? '—' : (v * 100).toFixed(1) + ' %';
const fired = e => allIds.filter(id => hits(id, e));
const BASES = [12742 / PC.KM_PER_AU, 384400 / PC.KM_PER_AU, 2, 2 * 1.5237, 47];

console.log('parallax 任務證明');
{
  const list = [].concat(fired(ev({})), fired(ev({ mode: 'measure' })), fired(ev({ mode: 'baseline' })));
  expect('預設狀態（比鄰星、第 1 年 1 月 1 日、貝索的量日儀、基線 2 AU）不觸發任何任務', list.length === 0, list.join(','));
  const r = [fired(ev({}, 'run')), fired(ev({ mode: 'measure', shots: [0] }, 'run')), fired(ev({ mode: 'baseline' }, 'run'))];
  expect('三種動作各做一次（播放一年、拍一張、閃爍比對）：只完成任務 1、2、3', r[0].join() === '1' && r[1].join() === '2' && r[2].join() === '3', r.map(x => x.join(',')).join(' / '));
}
// 每顆預設恆星 × 每台儀器 × 連拍 1 次 × 解不解自行；每顆恆星 × 每個基線按鈕：只會觸發低等級的任務
{
  const got = {};
  PC.STARS.forEach(s => {
    PC.INSTRUMENTS.forEach(i => [true, false].forEach(fp => ['state', 'run'].forEach(tp => {
      fired(ev({ mode: 'measure', star: s.id, inst: i.id, fitPM: fp, shots: burst(0) }, tp)).forEach(id => { (got[id] = got[id] || []).push(s.id + '/' + i.id); });
    })));
    BASES.forEach(B => ['state', 'run'].forEach(tp => fired(ev({ mode: 'baseline', star: s.id, B: B }, tp)).forEach(id => { (got[id] = got[id] || []).push(s.id + '/B' + f3(B)); })));
    ['orbit', 'measure'].forEach(m => fired(ev({ mode: m, star: s.id })).forEach(id => { (got[id] = got[id] || []).push(s.id + '/' + m); }));
  });
  const hi = Object.keys(got).filter(id => byId(id).level >= 6);
  expect('預設恆星＋儀器＋連拍一次、基線按鈕：不會觸發 6 級以上的任務', hi.length === 0, hi.map(k => k + '：' + got[k].slice(0, 3).join('、')).join('；'));
  console.log('    （會觸發的：' + Object.keys(got).sort().map(k => k + '（' + byId(k).level + ' 級）').join('、') + '）');
}

// ───── 公開任務 ─────
ex('1', ev({}, 'run'), '預設播放一年');
no('1', ev({}), '只拖日期');
ex('2', ev({ mode: 'measure', shots: [0.3] }, 'run'), '拍一張');
no('2', ev({ mode: 'measure' }, 'run'), '沒有照片');
ex('3', ev({ mode: 'baseline' }, 'run'), '預設閃爍比對');
no('3', ev({ mode: 'orbit' }, 'run'), '播放一年不算');
{
  const r = find('4', function* () { for (let b = 5; b >= -5; b -= 0.5) yield { o: { star: '', d: 1.302, beta: b } }; });
  ex('4', r && r.e, r && ('β ' + r.e.data.beta + '°：半短軸 ' + f3(r.e.data.ellB) + '″'));
  no('4', ev({ star: '', d: 1.302, beta: 1 }), 'β 1°');
  no('4', ev({ mode: 'measure', star: '', d: 1.302, beta: 0 }), '量測模式不算');
}
{
  const r = find('5', function* () { for (let b = 80; b <= 90; b += 0.5) yield { o: { star: '', d: 1.302, beta: b } }; });
  ex('5', r && r.e, r && ('β ' + r.e.data.beta + '°'));
  no('5', ev({ star: 'polaris' }), '北極星（β ' + f3(STAR.polaris.beta) + '°）');
}
{
  const r = find('6', function* () { for (let k = 1; k <= 6; k++) yield { o: { mode: 'measure', shots: burst(0, k) } }; });
  ex('6', r && r.e, r && (r.e.data.n + ' 張：' + pct(r.e.data.rel)));
  no('6', ev({ mode: 'measure', shots: burst(0) }), '貝索 12 張：' + pct(ev({ mode: 'measure', shots: burst(0) }).data.rel));
  no('6', ev({ mode: 'measure', inst: 'ccd', shots: [0, 0.3, 0.6, 0.9, 1.2] }), 'CCD 只拍 5 張');
}
{
  const r = find('7', function* () { for (let k = 1; k <= 10; k++) yield { o: { mode: 'measure', star: 'cyg61', shots: burst(0, k) } }; });
  ex('7', r && r.e, r && (r.e.data.n + ' 張：' + pct(r.e.data.rel)));
  no('7', ev({ mode: 'measure', star: 'cyg61', shots: burst(0, 2) }), '24 張：' + pct(ev({ mode: 'measure', star: 'cyg61', shots: burst(0, 2) }).data.rel));
  no('7', ev({ mode: 'measure', star: 'cyg61', inst: 'ccd', shots: burst(0) }), '用 CCD');
}
{
  const r = find('8', function* () { for (const s of PC.STARS) yield { o: { mode: 'measure', star: s.id, inst: 'eye', shots: burst(0) } }; });
  ex('8', r && r.e, r && (r.e.data.star + '：p ' + f3(r.e.data.fp) + ' ± ' + f3(r.e.data.fsp) + '″'));
  no('8', ev({ mode: 'measure', inst: 'eye', shots: [0, 0.5, 1] }), '只拍 3 張');
  no('8', ev({ mode: 'measure', inst: 'bessel', shots: burst(0) }), '量日儀');
}
{
  const r = find('9', function* () { for (let k = 1; k <= 10; k++) yield { o: { mode: 'measure', star: 'polaris', inst: 'hipparcos', shots: burst(0, k) } }; });
  ex('9', r && r.e, r && (r.e.data.n + ' 張：' + pct(r.e.data.rel)));
  no('9', ev({ mode: 'measure', star: 'polaris', inst: 'hipparcos', shots: burst(0) }), '12 張');
}
{
  const r = find('10', function* () { for (let k = 1; k <= 10; k++) yield { o: { mode: 'measure', star: 'betelgeuse', inst: 'gaia', shots: burst(0, k) } }; });
  ex('10', r && r.e, r && (r.e.data.n + ' 張：' + pct(r.e.data.rel)));
  no('10', ev({ mode: 'measure', star: 'betelgeuse', inst: 'hipparcos', shots: burst(0, 4) }), '依巴谷');
}
{
  const r = find('11', function* () { for (let lb = 0; lb <= 2.301; lb += 0.01) yield { o: { mode: 'baseline', B: rd(Math.pow(10, lb), 6) } }; });
  ex('11', r && r.e, r && ('B ' + f3(r.e.data.B) + ' AU：θ ' + f3(r.e.data.theta) + '″'));
  no('11', ev({ mode: 'baseline', star: 'barnard', B: 47 }), '巴納德星（' + f3(ev({ mode: 'baseline', star: 'barnard', B: 47 }).data.theta) + '″）');
}
{
  const r = find('12', function* () { for (let k = 1; k <= 12; k++) yield { o: { mode: 'measure', star: '', d: 100, beta: 30, inst: 'ccd', shots: burst(0, k) } }; });
  ex('12', r && r.e, r && (r.e.data.n + ' 張：' + pct(r.e.data.rel)));
  no('12', ev({ mode: 'measure', star: '', d: 99, beta: 30, inst: 'ccd', shots: burst(0, 12) }), '99 pc');
  no('12', ev({ mode: 'measure', star: '', d: 100, beta: 30, inst: 'ccd', shots: burst(0) }), '12 張（' + pct(ev({ mode: 'measure', star: '', d: 100, beta: 30, inst: 'ccd', shots: burst(0) }).data.rel) + '）');
}

// ───── 隱藏任務 ─────
{
  const r = find('h1', function* () { yield { o: { mode: 'baseline', star: '', d: 1, beta: 20, B: 1 } }; }, otherHidden('h1'));
  ex('h1', r && r.e, '距離打 1、基線打 1：θ ' + (r && f3(r.e.data.theta)) + '″');
  no('h1', ev({ mode: 'baseline', star: '', d: 1.003, beta: 20, B: 1 }), '1.003 pc');
  no('h1', ev({ star: '', d: 1, beta: 20 }), '距離滑桿拉到最左（1 pc）但不在拉長基線');
  no('h1', ev({ mode: 'baseline', star: '', d: 1, beta: 20 }), '1 pc、基線 2 AU');
  no('h1', ev({ mode: 'baseline' }), '比鄰星');
}
{
  const r = find('h2', function* () { for (const s of PC.STARS) for (let t = 0; t <= 1; t += 0.001) yield { o: { star: s.id, t: rd(t, 3) } }; }, otherHidden('h2'));
  ex('h2', r && r.e, r && (r.e.data.star + '，第 ' + f3(r.e.data.t) + ' 年：差 ' + f3(r.e.data.opp) + '°；位移 (' + f3(r.e.data.nowX) + '，' + f3(r.e.data.nowY) + ')'));
  const t0 = PC.STARS.map(s => Math.abs(ev({ star: s.id }).data.opp));
  expect('h2：八顆星在預設日期都不在衝', Math.min.apply(null, t0) > 1, '最接近 ' + f3(Math.min.apply(null, t0)) + '°');
  no('h2', ev({ star: '', d: 2, beta: 0, lam: 100.46, t: 0 }), '自訂的恆星');
}
{
  const r = find('h3', function* () { for (const dd of [500, 1000, 2000, 5000, 10000]) for (let k = 1; k <= 3; k++) yield { o: { mode: 'measure', star: '', d: dd, beta: 30, inst: 'ccd', shots: burst(0, k) } }; }, otherHidden('h3'));
  ex('h3', r && r.e, r && (r.e.data.d + ' pc、' + r.e.data.n + ' 張：p ' + f3(r.e.data.fp) + '″'));
  no('h3', ev({ mode: 'measure', inst: 'eye', star: '', d: 1000, beta: 30, shots: burst(0) }), '肉眼');
}
{
  const r = find('h4', function* () { for (let k = 1; k <= 3; k++) for (const t of [0, 0.25, 0.5, 0.75, 1]) yield { o: { mode: 'measure', star: 'barnard', inst: 'ccd', fitPM: false, t: t, shots: burst(t, k) } }; }, otherHidden('h4'));
  ex('h4', r && r.e, r && (r.e.data.n + ' 張：p ' + f3(r.e.data.fp) + '″（真的 ' + f3(r.e.data.p) + '）'));
  no('h4', ev({ mode: 'measure', star: 'barnard', inst: 'ccd', fitPM: true, shots: burst(0) }), '有解自行（' + pct(ev({ mode: 'measure', star: 'barnard', inst: 'ccd', fitPM: true, shots: burst(0) }).data.err) + '）');
  no('h4', ev({ mode: 'measure', star: 'barnard', pm: false, inst: 'ccd', fitPM: false, shots: burst(0) }), '不計自行');
  no('h4', ev({ mode: 'measure', star: 'barnard', inst: 'eye', fitPM: false, shots: burst(0.25) }), '肉眼');
  no('h3', ev({ mode: 'measure', star: 'barnard', inst: 'ccd', fitPM: false, shots: burst(0.25) }), '巴納德星不解自行量出負的（模型錯了不算）');
  no('10', ev({ mode: 'measure', star: 'betelgeuse', inst: 'gaia', fitPM: false, shots: burst(0, 3) }), '參宿四不解自行');
}
{
  const r = find('h5', function* () { for (let t = 0; t <= 0.5; t += 0.01) yield { o: { mode: 'measure', star: 'cyg61', pm: false, inst: 'ccd', fitPM: false, shots: [rd(t, 3), rd(t + 0.5, 3)] } }; }, otherHidden('h5'));
  ex('h5', r && r.e, r && ('第 ' + r.o.shots.join('、') + ' 年：' + pct(r.e.data.rel)));
  no('h5', ev({ mode: 'measure', star: 'cyg61', pm: false, inst: 'ccd', fitPM: false, shots: [0.1, 0.4] }), '相隔 0.3 年');
  no('h5', ev({ mode: 'measure', star: 'cyg61', inst: 'ccd', fitPM: false, shots: r ? r.o.shots : [0, 0.5] }), '有自行的天鵝座 61');
}
{
  const r = find('h6', function* () { for (let k = 1; k <= 12; k++) yield { o: { mode: 'measure', star: '', d: 2000, beta: 30, inst: 'gaia', shots: burst(0, k) } }; }, otherHidden('h6'));
  ex('h6', r && r.e, r && (r.e.data.n + ' 張：' + pct(r.e.data.rel)));
  no('h6', ev({ mode: 'measure', star: '', d: 1999, beta: 30, inst: 'gaia', shots: burst(0, 12) }), '1999 pc');
}
{
  const r = find('h7', function* () { for (let lb = 1; lb <= 2.301; lb += 0.005) yield { o: { mode: 'baseline', B: rd(Math.pow(10, lb), 6) } }; }, otherHidden('h7'));
  ex('h7', r && r.e, r && ('比鄰星、B ' + f3(r.e.data.B) + ' AU：θ ' + f3(r.e.data.theta) + '″'));
  no('h7', ev({ mode: 'baseline', B: 47 }), '新視野號的 47 AU（' + f3(ev({ mode: 'baseline', B: 47 }).data.theta) + '″）');
  no('h7', ev({ mode: 'baseline', star: '', d: 1, beta: 0, B: 100 }), '自訂的恆星');
}
{
  // 挑位移最大的日子：比鄰星的黃經方向因子 sin(λ⊙ − λ) = ±1
  const s = STAR.proxima, tq = []; for (let t = 0; t <= T3(); t += 0.0005) { const f = PC.pfactor(s.lam, s.beta, t); if (Math.abs(Math.abs(f.x) - 1) < 2e-5) tq.push(rd(t, 3)); }
  function T3() { return 3; }
  const r = find('h8', function* () {
    for (let a = 0; a < tq.length; a++) for (let b = a + 1; b < tq.length; b++) for (let c = b + 1; c < tq.length; c++) for (let d = c + 1; d < tq.length; d++) yield { o: { mode: 'measure', inst: 'ccd', shots: [tq[a], tq[b], tq[c], tq[d]] } };
  }, otherHidden('h8'));
  ex('h8', r && r.e, r && ('第 ' + r.o.shots.join('、') + ' 年：' + pct(r.e.data.rel)));
  no('h8', ev({ mode: 'measure', inst: 'ccd', shots: [0, 0.25, 0.5, 0.75] }), '一年內平均拍 4 張（' + pct(ev({ mode: 'measure', inst: 'ccd', shots: [0, 0.25, 0.5, 0.75] }).data.rel) + '）');
  no('h8', ev({ mode: 'measure', inst: 'ccd', shots: burst(0) }), '12 張');
}
{
  const r = find('h9', function* () { for (let k = 1; k <= 16; k++) yield { o: { mode: 'measure', star: 'betelgeuse', inst: 'hipparcos', shots: burst(0, k) } }; }, otherHidden('h9'));
  ex('h9', r && r.e, r && (r.e.data.n + ' 張：' + pct(r.e.data.rel)));
  no('h9', ev({ mode: 'measure', star: 'betelgeuse', inst: 'hipparcos', shots: burst(0, 2) }), '24 張');
}
{
  const r = find('h10', function* () { yield { o: { mode: 'baseline', B: 2 * 1.5237 } }; }, otherHidden('h10'));
  ex('h10', r && r.e, '火星軌道按鈕');
  no('h10', ev({ mode: 'baseline', B: 2 }), '地球軌道');
  no('h10', ev({ mode: 'orbit', B: 3.05 }), '不在拉長基線');
}

// 動畫中不算
no('6', ev({ mode: 'measure', shots: burst(0, 6), anim: true }), '連拍還在進行');
// 隱藏任務兩兩不連帶
{
  const pairs = [];
  hidIds.forEach(id => { const e = examples[id]; if (!e) return; otherHidden(id).forEach(o => { if (hits(o, e)) pairs.push(id + '→' + o); }); });
  expect('每個隱藏任務的解法都不會順便完成別的隱藏任務', pairs.length === 0, pairs.join('、'));
}
expect('22 個任務都找到解法', allIds.every(id => examples[id]), allIds.filter(id => !examples[id]).join(','));
{
  const hid = missions.filter(m => m.hidden), lv = hid.map(m => m.level);
  expect('隱藏任務 10 個、等級 3–10、至少 3 個 7 級以上', hid.length === 10 && Math.min.apply(null, lv) >= 3 && Math.max.apply(null, lv) <= 10 && lv.filter(l => l >= 7).length >= 3, lv.join(','));
  expect('公開任務 12 個、等級 1–10', missions.filter(m => !m.hidden).length === 12);
  console.log('    公開星星 ' + missions.filter(m => !m.hidden).reduce((s, m) => s + m.level, 0) + '、隱藏星星 ' + hid.reduce((s, m) => s + 2 * m.level, 0));
}
console.log('parallax：' + ok + ' 項通過' + (bad ? '，' + bad + ' 項失敗' : ''));
if (bad) process.exitCode = 1;
