/* 任務可達成的證明腳本。用法：node tools/mission-proofs/consonance.js
 * 用數學核心證明每個任務在介面的範圍與精度內做得到（事件資料和 js/consonance.js 送出的一樣），
 * 預設狀態不觸發任何任務，而且每個隱藏任務的解不會順便完成另一個隱藏任務；最後做亂按模擬。
 * 介面：
 *   下方音 f1：滑桿位置 0–3600（整數），f1 = 110 × 2^(位置/1200)；打字到小數 2 位（110–880 Hz）。
 *   頻率比 r：滑桿位置 0–1442（整數音分），r = min(2.3, 2^(位置/1200))；打字到小數 4 位；
 *            音程按鈕跳到純律的比值或 2^(k/12)，經 LabNum.set 取到小數 4 位。
 *   音色：純音／泛音／拉伸泛音；泛音數 n 1–10；衰減指數 p 0–2（間隔 0.05）；拉伸係數 s 0.8–1.2（間隔 0.001）；只留奇次。
 *   最高音的頻率比 r2：滑桿位置 0–1200（整數音分），r2 = 2^(位置/1200)；打字到小數 4 位。
 *   掃過一個八度：跑完時 r = 2（1200 音分），送 'sweep' 事件。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const Core = require(ROOT + 'js/consonance-core.js');
const MT = require(ROOT + 'js/music-theory.js');
const missions = [];
global.window = { LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/consonance.js');
const byId = id => missions.find(m => m.id === 'consonance-' + id);

// ---------- 介面的數值格點 ----------
const round = (v, d) => { const p = Math.pow(10, d); return Math.round(v * p) / p; };
const f1Pos = pos => Core.F1_MIN * Math.pow(2, pos / 1200);
const rPos = pos => Math.min(Core.R_MAX, Core.fromCents(pos));
const r2Pos = pos => Core.fromCents(pos);
const typedR = v => round(Math.min(Core.R_MAX, Math.max(1, v)), 4);    // 打字或音程按鈕（LabNum.set）
function ivRatio(k, jump) { if (jump === 'equal') return Math.pow(2, k / 12); const q = MT.INTERVALS[k].ratio; return q[0] / q[1]; }
const btnR = (k, jump) => typedR(ivRatio(k, jump));

// ---------- 與 js/consonance.js 相同的事件資料 ----------
const cache = new Map();
function curveOf(f1, t) {
  const k = Core.timbreKey(t) + '@' + f1;
  let c = cache.get(k);
  if (!c) {
    if (cache.size > 400) cache.clear();
    const cv = Core.curve(f1, t);
    c = { cv: cv, vs: Core.valleys(cv) };
    cache.set(k, c);
  }
  return c;
}
const TIMBRE0 = { mode: 'harmonic', n: 6, p: 1, s: 1.1, odd: false };
function S(o) {   // 頁面狀態
  return Object.assign({ f1: Core.F1_DEFAULT, r: Core.fromCents(100), r2: Core.fromCents(900), rsrc: 'default' }, o || {}, { timbre: Object.assign({}, TIMBRE0, (o && o.timbre) || {}) });
}
function an(st) { const c = curveOf(st.f1, st.timbre); return Core.analyze({ f1: st.f1, r: st.r, timbre: st.timbre, curve: c.cv, valleys: c.vs }); }
const ev = (type, st, src, extra) => ({ type: type, data: Object.assign(an(st), { rsrc: st.rsrc, src: src }, extra || {}) });
const ratio = (st, src) => ev('ratio', st, src || st.rsrc);
const listen = st => ev('listen', st, 'play');
const timbre = st => ev('timbre', st, 'timbre');
const f1ev = st => ev('f1', st, 'f1');
const sweep = st => ev('sweep', Object.assign({}, st, { r: 2, rsrc: 'sweep' }), 'sweep', { complete: true });
const chord = (st, src) => ({ type: 'chord', data: Object.assign(Core.analyzeChord({ f1: st.f1, r1: st.r, r2: st.r2, timbre: st.timbre }), { rsrc: st.rsrc, src: src }) });
const fx = (v, d) => (+v).toFixed(d);
const cOf = st => Core.cents(st.r);

let fail = 0;
const found = {};   // 每個任務證明用的解（事件序列）
function expect(id, events, want, note) {
  const m = byId(id); m.mem = {};
  let ok = false;
  events.forEach(e => { ok = ok || !!m.check(e, m.mem); });
  const pass = ok === want;
  if (!pass) fail++;
  if (want && pass && !found[id]) found[id] = events;
  console.log((pass ? '  ✓ ' : '  ✗ ') + String(id).padEnd(4) + (want ? '達成：' : '不觸發：') + note);
}
/** 在滑桿的格點裡找出讓 test 成立的第一個位置 */
function scan(from, to, test) { const step = from <= to ? 1 : -1; for (let p = from; step > 0 ? p <= to : p >= to; p += step) if (test(p)) return p; return null; }

// ---------- 預設狀態不觸發 ----------
{
  // 預設：泛音、n = 6、p = 1、s = 1.1、不勾奇次；下方音 C4（261.63 Hz）；r = 2^(100/1200)（小二度附近）；r2 = 2^(900/1200)。
  // 頁面載入時不送事件；第一次操作時送出的事件如下（只換一個設定、或直接按播放）：
  const d0 = S();
  const defaults = [listen(d0), ratio(Object.assign(S(), { rsrc: 'slider' })), chord(d0, 'r2'), chord(d0, 'play'), f1ev(d0)];
  ['pure', 'harmonic', 'stretched'].forEach(mode => { const st = S({ timbre: { mode: mode } }); defaults.push(timbre(st), listen(st), chord(st, 'play')); });
  [1, 2, 3, 4, 5, 7, 8, 9, 10].forEach(n => defaults.push(timbre(S({ timbre: { n: n } }))));
  defaults.push(timbre(S({ timbre: { odd: true } })), timbre(S({ timbre: { p: 0 } })), timbre(S({ timbre: { p: 2 } })));
  // 每個事件各自從頭判定（只做了這一個操作）；再把全部依序送一次（任務 6 本身就是「n 先 2 再 8 以上」，依序送時不算）
  const hit = missions.filter(m => m.id !== 'consonance-2').filter(m => defaults.some(e => { m.mem = {}; return m.check(e, m.mem); })).map(m => m.id)
    .concat(missions.filter(m => m.id !== 'consonance-2' && m.id !== 'consonance-6').filter(m => { m.mem = {}; return defaults.some(e => m.check(e, m.mem)); }).map(m => m.id + '（依序）'));
  if (hit.length) { fail++; console.log('  ✗ 預設狀態觸發了 ' + hit.join('、')); }
  else console.log('  ✓ 預設狀態（泛音 n = 6、p = 1、C4、r ≈ 小二度、r2 ≈ 大六度）、只換音色或 n、p、奇次、直接按播放或播放和弦，都不觸發任何任務');
  // consonance-2 本身就是「按『掃過一個八度』並跑完」：這是任務要的操作，不是預設狀態
}

// ---------- 公開任務 ----------
console.log('\n公開任務');
{
  const st = Object.assign(S(), { r: btnR(12, 'just'), rsrc: 'button' });
  expect('1', [ratio(st, 'button'), listen(st)], true, '按「八度」再按「▶ 播放」（r = ' + st.r + '）');
  expect('1', [listen(Object.assign(S(), { r: btnR(7, 'just'), rsrc: 'button' }))], false, '五度不算');
  expect('1', [ratio(st, 'button')], false, '只按「八度」沒有播放');
}
expect('2', [sweep(S())], true, '按「掃過一個八度」跑完（8 秒）');
expect('2', [Object.assign(sweep(S()), { data: Object.assign(sweep(S()).data, { complete: false }) })], false, '中途打斷（頁面不送事件，這裡模擬 complete = false）');
{
  const st = Object.assign(S(), { r: rPos(702), rsrc: 'slider' });
  expect('3', [ratio(st)], true, '泛音 n = 6，拖到 702 音分（谷底 ' + fx(Core.cents(1.5), 3) + '）');
  expect('3', [ratio(Object.assign(S(), { r: btnR(7, 'just'), rsrc: 'button' }), 'button')], false, '按「完全五度」按鈕不算（要自己找）');
  expect('3', [ratio(Object.assign(S(), { r: rPos(706), rsrc: 'slider' }))], false, '706 音分離谷底 4 音分');
  expect('3', [ratio(Object.assign(S({ timbre: { mode: 'stretched' } }), { r: rPos(702), rsrc: 'slider' }))], false, '拉伸泛音的谷不在 3:2');
}
{
  const ju = Object.assign(S(), { r: btnR(4, 'just'), rsrc: 'button' }), et = Object.assign(S(), { r: btnR(4, 'equal'), rsrc: 'button' });
  const a = an(ju), b = an(et);
  expect('4', [listen(ju), listen(et)], true, '純律大三度 D = ' + fx(a.D, 4) + '，平均律 D = ' + fx(b.D, 4));
  expect('4', [listen(et), listen(ju)], true, '反過來的順序也可以');
  expect('4', [listen(ju), listen(Object.assign(S({ f1: f1Pos(1600) }), { r: btnR(4, 'equal') }))], false, '要同一個下方音');
  expect('4', [listen(Object.assign(S({ timbre: { n: 3 } }), { r: btnR(4, 'just') })), listen(Object.assign(S({ timbre: { n: 3 } }), { r: btnR(4, 'equal') }))], false, '泛音數 3 不算（沒有 5:4 的谷）');
}
{
  const pm = Core.pureMax(Core.F1_DEFAULT), base = S({ timbre: { mode: 'pure' } });
  const p = scan(0, 1442, q => byId('5').check(ratio(Object.assign({}, base, { r: rPos(q), rsrc: 'slider' })), {}));
  const st = Object.assign({}, base, { r: rPos(p), rsrc: 'slider' });
  expect('5', [ratio(st)], true, '純音 C4：拖到 ' + p + ' 音分，Δf = ' + fx(an(st).df, 2) + ' Hz（最刺耳 ' + fx(pm.df, 2) + ' Hz）');
  expect('5', [ratio(Object.assign({}, base, { r: rPos(p + 6), rsrc: 'slider' }))], false, (p + 6) + ' 音分：Δf = ' + fx(an(Object.assign({}, base, { r: rPos(p + 6) })).df, 2) + ' Hz');
  expect('5', [ratio(Object.assign(S(), { r: rPos(p), rsrc: 'slider' }))], false, '泛音音色不算');
}
{
  const lo = S({ timbre: { n: 2 } }), hi = S({ timbre: { n: 8 } });
  expect('6', [timbre(lo), timbre(hi)], true, 'C4、p = 1：n = 2 有 ' + an(lo).count12 + ' 個谷，n = 8 有 ' + an(hi).count12 + ' 個');
  expect('6', [timbre(lo), timbre(S({ timbre: { n: 4 } }))], false, 'n = 4 不算（要 8 以上）：' + an(S({ timbre: { n: 4 } })).count12 + ' 個');
  expect('6', [timbre(lo), timbre(S({ f1: f1Pos(3000), timbre: { n: 8 } }))], false, '要同一個下方音');
}
{
  const base = S({ timbre: { mode: 'pure' } });
  const p = scan(0, 1442, q => byId('7').check(ratio(Object.assign({}, base, { r: rPos(q), rsrc: 'slider' })), {}));
  const st = Object.assign({}, base, { r: rPos(p), rsrc: 'slider' }), a = an(st);
  expect('7', [ratio(st)], true, '純音 C4：拖到 ' + p + ' 音分，Δf = ' + fx(a.df, 1) + ' Hz、臨界頻帶 ' + fx(a.cb, 1) + ' Hz（' + fx(a.cbRatio, 3) + ' CB；D 只剩最大值的 ' + fx(100 * a.D / a.Dpeak, 1) + '%）');
  expect('7', [ratio(Object.assign({}, base, { r: btnR(4, 'just'), rsrc: 'button' }), 'button')], false, '大三度：' + fx(an(Object.assign({}, base, { r: btnR(4, 'just') })).cbRatio, 2) + ' CB');
}
{
  const evs = [Core.cents(6 / 5), Core.cents(5 / 4), Core.cents(4 / 3), Core.cents(1.5), Core.cents(5 / 3), 1200].map(c => ratio(Object.assign(S(), { r: rPos(Math.round(c)), rsrc: 'slider' })));
  expect('8', evs, true, 'n = 6：拖到 ' + evs.map(e => Math.round(e.data.cents)).join('、') + ' 音分');
  expect('8', evs.slice(0, 5), false, '少了八度');
  expect('8', evs.slice(0, 5).concat([ratio(Object.assign(S(), { r: btnR(12, 'just'), rsrc: 'button' }), 'button')]), false, '八度用按鈕不算');
}
{
  const st = S({ timbre: { mode: 'stretched', s: 1.1 } });
  const p = Math.round(1200 * 1.1), go = Object.assign({}, st, { r: rPos(p), rsrc: 'slider' });
  expect('9', [timbre(st), ratio(go)], true, '拉伸 s = 1.1：八度的谷搬到 ' + fx(an(go).valley.cents, 2) + ' 音分（r = ' + fx(Math.pow(2, 1.1), 4) + '），拖到 ' + p);
  const st2 = S({ timbre: { mode: 'stretched', s: 0.9 } }), go2 = Object.assign({}, st2, { r: rPos(1080), rsrc: 'slider' });
  expect('9', [ratio(go2)], true, 's = 0.9：谷在 ' + fx(an(go2).valley.cents, 2) + ' 音分，拖到 1080');
  expect('9', [ratio(Object.assign(S({ timbre: { mode: 'stretched', s: 1.02 } }), { r: rPos(1224), rsrc: 'slider' }))], false, 's = 1.02 離 1 太近');
  expect('9', [ratio(Object.assign(S({ timbre: { mode: 'stretched', s: 1.1 } }), { r: rPos(1200), rsrc: 'slider' }))], false, '停在 2:1 不算');
}
{
  const st = Object.assign(S(), { r: btnR(4, 'just'), r2: r2Pos(702), rsrc: 'button' }), c = chord(st, 'play');
  expect('10', [c], true, '「大三度」按鈕（r = 1.25）＋ r2 拖到 702 音分，按「▶ 播放和弦」：D3 = ' + fx(c.data.D3, 4) + '，盆地底 (' + fx(c.data.basin.c1, 2) + ', ' + fx(c.data.basin.c2, 2) + ')');
  expect('10', [chord(st, 'r2')], false, '只拖 r2 沒有播放和弦');
  expect('10', [chord(Object.assign({}, st, { r2: r2Pos(712) }), 'play')], false, 'r2 在 712 音分：不在盆地底');
  expect('10', [chord(Object.assign(S({ timbre: { mode: 'pure' } }), { r: 1.25, r2: r2Pos(702) }), 'play')], false, '純音沒有這個盆地');
}
{
  const M = Object.assign(S(), { r: btnR(4, 'just'), r2: r2Pos(702), rsrc: 'button' }), m = Object.assign(S(), { r: btnR(3, 'just'), r2: r2Pos(702), rsrc: 'button' });
  const a = chord(M, 'play'), b = chord(m, 'play');
  expect('11', [a, b], true, '大三和弦 D3 = ' + fx(a.data.D3, 4) + '，小三和弦 D3 = ' + fx(b.data.D3, 4) + '（小三比較淺：' + (b.data.D3 > a.data.D3 ? '是' : '否') + '）');
  expect('11', [a, chord(Object.assign({}, m, { f1: f1Pos(1700) }), 'play')], false, '要同一個下方音');
}
{
  // p = 2、n = 6：從高往低拖下方音，找到 5:4 的谷消失的地方
  const t = { p: 2 }, has = pos => an(S({ f1: f1Pos(pos), timbre: t })).valleys.some(v => Math.abs(v - Core.cents(1.25)) <= 3);
  const k = scan(3600, 0, pos => !has(pos));
  const a = S({ f1: f1Pos(k + 1), timbre: t }), b = S({ f1: f1Pos(k), timbre: t });
  expect('12', [timbre(S({ timbre: t })), f1ev(a), f1ev(b)], true, 'p = 2、n = 6：下方音 ' + fx(a.f1, 2) + ' Hz 還有 5:4 的谷，' + fx(b.f1, 2) + ' Hz 就沒有了（差 ' + fx(a.f1 - b.f1, 2) + ' Hz）');
  const far = S({ f1: f1Pos(k - 60), timbre: t });
  expect('12', [f1ev(a), f1ev(far)], false, '相差 ' + fx(a.f1 - far.f1, 1) + ' Hz 太遠');
  expect('12', [f1ev(S({ f1: f1Pos(0) })), f1ev(S({ f1: f1Pos(1) }))], false, 'p = 1 時到 110 Hz 都還有谷（' + an(S({ f1: f1Pos(0) })).valleys.some(v => Math.abs(v - Core.cents(1.25)) <= 3) + '）');
}

// ---------- 隱藏任務 ----------
console.log('\n隱藏任務');
{
  const st = Object.assign(S(), { r: typedR(1.0038), rsrc: 'slider' }), e = listen(st);
  expect('h1', [ratio(st), e], true, 'C4，打字 r = 1.0038，播放：最刺耳的一對是 ' + e.data.pair.join(' × ') + '，拍頻 ' + fx(e.data.beat, 3) + ' Hz');
  const st2 = Object.assign(S({ timbre: { mode: 'pure' }, f1: f1Pos(1200) }), { r: rPos(8), rsrc: 'slider' }), e2 = listen(st2);
  expect('h1', [e2], e2.data.beat >= 0.98 && e2.data.beat <= 1.02, '純音 220 Hz、拖到 8 音分：拍頻 ' + fx(e2.data.beat, 3) + ' Hz');
  expect('h1', [listen(Object.assign(S(), { r: typedR(1.0045) }))], false, 'r = 1.0045：拍頻 ' + fx(an(Object.assign(S(), { r: 1.0045 })).beat, 3) + ' Hz');
}
{
  const p = scan(0, 3600, q => byId('h2').check(listen(Object.assign(S({ f1: f1Pos(q), timbre: { mode: 'pure' } }), { r: btnR(6, 'equal'), rsrc: 'button' })), {}));
  const st = Object.assign(S({ f1: f1Pos(p), timbre: { mode: 'pure' } }), { r: btnR(6, 'equal'), rsrc: 'button' }), a = an(st);
  expect('h2', [timbre(st), ratio(st, 'button'), listen(st)], true, '純音、下方音 ' + fx(st.f1, 2) + ' Hz 以上、平均律「三全音」，播放：D 是最大值的 ' + fx(100 * a.D / a.Dpeak, 2) + '%');
  const lo = Object.assign(S({ f1: f1Pos(p - 30), timbre: { mode: 'pure' } }), { r: btnR(6, 'equal') });
  expect('h2', [listen(lo)], false, fx(lo.f1, 1) + ' Hz：' + fx(100 * an(lo).D / an(lo).Dpeak, 2) + '%');
  expect('h2', [listen(Object.assign(S({ f1: f1Pos(3600) }), { r: btnR(6, 'equal') }))], false, '有泛音的三全音不算');
}
{
  const st = S({ timbre: { n: 2 } }), cv = an(st).valleys.filter(v => v < 1199);
  const go = Object.assign({}, st, { r: rPos(Math.round(cv[0])), rsrc: 'slider' });
  expect('h3', [timbre(st), ratio(go)], true, 'n = 2、C4：谷在 ' + fx(cv[0], 1) + ' 音分（最接近的簡單整數比 3:2 差 ' + fx(cv[0] - Core.cents(1.5), 1) + ' 音分），拖到 ' + Math.round(cv[0]));
  const st3 = S({ timbre: { n: 3 } }), v3 = an(st3).valleys[0];
  expect('h3', [ratio(Object.assign({}, st3, { r: rPos(Math.round(v3)), rsrc: 'slider' }))], true, 'n = 3：谷在 ' + fx(v3, 1) + ' 音分（4:3 差 ' + fx(v3 - Core.cents(4 / 3), 1) + '）');
  expect('h3', [ratio(Object.assign(S(), { r: rPos(702), rsrc: 'slider' }))], false, '3:2 的谷有名字');
  expect('h3', [ratio(Object.assign(S({ timbre: { n: 10, p: 0 } }), { r: rPos(182), rsrc: 'slider' }))], false, '10:9 的谷也有名字');
}
{
  const a = Object.assign(S(), { r: rPos(702), rsrc: 'slider' }), b = Object.assign(S({ timbre: { odd: true } }), { r: rPos(702), rsrc: 'slider' });
  expect('h4', [ratio(a), timbre(b), listen(b)], true, 'n = 6：先在 3:2 的谷底，勾「只留奇次泛音」再播放：3:2 附近沒有谷（最近的谷 ' + fx(an(b).valley.cents, 2) + ' 音分）');
  expect('h4', [listen(b)], false, '沒有先在 3:2 的谷底');
  expect('h4', [ratio(a), timbre(b), ratio(b)], false, '要按播放');
  const c = Object.assign(S({ timbre: { odd: true, n: 5 } }), { r: rPos(702), rsrc: 'slider' });
  expect('h4', [ratio(a), listen(c)], false, '要同樣的 n');
}
{
  const st = S({ timbre: { n: 7 } }), go = Object.assign({}, st, { r: rPos(969), rsrc: 'slider' });
  expect('h5', [timbre(st), ratio(go)], true, 'n = 7：拖到 969 音分（7:4 = ' + fx(Core.cents(1.75), 2) + '）');
  expect('h5', [ratio(Object.assign(S(), { r: rPos(969), rsrc: 'slider' }))], false, 'n = 6 沒有這個谷');
  expect('h5', [ratio(Object.assign(S({ timbre: { n: 7 } }), { r: btnR(10, 'equal'), rsrc: 'button' }), 'button')], false, '鋼琴的小七度（1000 音分）不是');
}
{
  const st = Object.assign(S(), { r: btnR(5, 'just'), r2: r2Pos(884), rsrc: 'button' }), c = chord(st, 'r2');
  expect('h6', [ratio(st, 'button'), c], true, '「完全四度」＋ r2 拖到 884 音分：3:4:5 的盆地底 (' + fx(c.data.basin.c1, 2) + ', ' + fx(c.data.basin.c2, 2) + ')，D3 = ' + fx(c.data.D3, 4));
  expect('h6', [chord(Object.assign({}, st, { r2: r2Pos(870) }), 'r2')], false, 'r2 在 870：不在盆地底');
}
{
  const st = S({ timbre: { mode: 'stretched', s: 0.997 } }), go = Object.assign({}, st, { r: btnR(7, 'equal'), rsrc: 'button' });
  expect('h7', [timbre(st), ratio(go, 'button')], true, '拉伸 s = 0.997，平均律「完全五度」：谷在 ' + fx(an(go).valley.cents, 2) + ' 音分');
  expect('h7', [ratio(Object.assign(S({ timbre: { mode: 'stretched', s: 0.998 } }), { r: btnR(7, 'equal'), rsrc: 'button' }), 'button')], false, 's = 0.998：谷在 ' + fx(an(S({ timbre: { mode: 'stretched', s: 0.998 } })).valleys.find(v => v > 690 && v < 710), 2));
  expect('h7', [ratio(Object.assign(S(), { r: btnR(7, 'equal'), rsrc: 'button' }), 'button')], false, '泛音的谷在 701.96，不是 700');
}
{
  const st = S({ timbre: { mode: 'stretched', s: 1.1 } }), a = Object.assign({}, st, { r: btnR(6, 'equal') }), b = Object.assign({}, st, { r: btnR(12, 'equal') });
  expect('h8', [listen(a), listen(b)], true, '拉伸 s = 1.1：三全音 D = ' + fx(an(a).D, 4) + '，八度 D = ' + fx(an(b).D, 4));
  const c = S({ timbre: { mode: 'stretched', s: 1.0 } });
  expect('h8', [listen(Object.assign({}, c, { r: btnR(6, 'equal') })), listen(Object.assign({}, c, { r: btnR(12, 'equal') }))], false, 's = 1.0：八度 D = ' + fx(an(Object.assign({}, c, { r: 2 })).D, 4) + '，三全音 ' + fx(an(Object.assign({}, c, { r: btnR(6, 'equal') })).D, 4));
  expect('h8', [listen(Object.assign(S(), { r: btnR(6, 'equal') })), listen(Object.assign(S(), { r: 2 }))], false, '泛音音色的八度比三全音平穩');
}
{
  const st = Object.assign(S({ f1: f1Pos(2400), timbre: { mode: 'pure' } }), { r: btnR(1, 'equal'), rsrc: 'button' }), a = an(st);
  expect('h9', [ratio(st, 'button')], true, '純音、下方音 ' + fx(st.f1, 2) + ' Hz、平均律「小二度」：Δf = ' + fx(a.df, 2) + ' Hz，最刺耳 ' + fx(a.dfPeak, 2) + ' Hz');
  const lo = Object.assign(S({ f1: f1Pos(2200), timbre: { mode: 'pure' } }), { r: btnR(1, 'equal'), rsrc: 'button' });
  expect('h9', [ratio(lo, 'button')], false, fx(lo.f1, 1) + ' Hz：Δf = ' + fx(an(lo).df, 2) + '，最刺耳 ' + fx(an(lo).dfPeak, 2));
  let lo9 = null, hi9 = null;
  for (let q = 0; q <= 3600; q++) { if (byId('h9').check(ratio(Object.assign(S({ f1: f1Pos(q), timbre: { mode: 'pure' } }), { r: btnR(1, 'equal'), rsrc: 'button' }), 'button'), {})) { if (lo9 == null) lo9 = q; hi9 = q; } }
  console.log('      （平均律小二度成立的下方音：' + fx(f1Pos(lo9), 1) + '–' + fx(f1Pos(hi9), 1) + ' Hz）');
}
{
  const st = S({ timbre: { n: 10, p: 0 } }), go = Object.assign({}, st, { r: rPos(182), rsrc: 'slider' });
  expect('h10', [timbre(st), ratio(go)], true, 'n = 10、p = 0：拖到 182 音分（10:9 = ' + fx(Core.cents(10 / 9), 2) + '）');
  const p1 = S({ timbre: { n: 10, p: 1 } });
  expect('h10', [ratio(Object.assign({}, p1, { r: rPos(182), rsrc: 'slider' }))], false, 'p = 1 時最窄的谷是 ' + fx(an(p1).valleys[0], 1) + ' 音分（9:8）');
  expect('h10', [ratio(Object.assign(S({ timbre: { n: 9, p: 0 } }), { r: rPos(182), rsrc: 'slider' }))], false, 'n = 9 沒有 10:9');
}

// ---------- 隱藏任務兩兩不連帶完成 ----------
console.log('\n隱藏任務的解不會順便完成另一個隱藏任務');
{
  const hidden = missions.filter(m => m.hidden);
  let bad = 0;
  hidden.forEach(h => {
    const evs = found[h.id.replace('consonance-', '')];
    if (!evs) { bad++; console.log('  ✗ ' + h.id + ' 沒有解'); return; }
    const others = hidden.filter(o => o !== h).filter(o => { o.mem = {}; return evs.some(e => o.check(e, o.mem)); }).map(o => o.id);
    if (others.length) { bad++; console.log('  ✗ ' + h.id + ' 的解也完成了 ' + others.join('、')); }
    else console.log('  ✓ ' + h.id + ' 的解不會完成其他隱藏任務');
  });
  if (bad) fail++;
}

// ---------- 亂按模擬 ----------
const RUNS = 600, STEPS = 60;
console.log('\n亂按模擬（' + RUNS + ' 回 × ' + STEPS + ' 步隨機操作；滑桿隨機拖到介面的格點）');
{
  let seed = 12345;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const pickI = n => Math.floor(rnd() * n);
  const counts = {};
  const t0 = Date.now();
  for (let run = 0; run < RUNS; run++) {
    missions.forEach(m => { m.mem = {}; m.doneRun = false; });
    const st = S();
    let jump = 'just', touched = false;
    for (let step = 0; step < STEPS; step++) {
      const a = pickI(14), evs = [];
      if (a === 0 || a === 1) { st.r = rPos(pickI(1443)); st.rsrc = 'slider'; evs.push(ratio(st, 'slider')); if (touched) evs.push(chord(st, 'ratio')); }
      else if (a === 2 || a === 3) { st.r = btnR(pickI(13), jump); st.rsrc = 'button'; evs.push(ratio(st, 'button')); if (touched) evs.push(chord(st, 'ratio')); }
      else if (a === 4) jump = jump === 'just' ? 'equal' : 'just';
      else if (a === 5) { st.timbre.mode = Core.MODES[pickI(3)]; evs.push(timbre(st)); if (touched) evs.push(chord(st, 'timbre')); }
      else if (a === 6) {
        const w = pickI(4);
        if (w === 0) st.timbre.n = 1 + pickI(10);
        else if (w === 1) st.timbre.p = round(pickI(41) * 0.05, 2);
        else if (w === 2) st.timbre.s = round(0.8 + pickI(401) * 0.001, 3);
        else st.timbre.odd = !st.timbre.odd;
        evs.push(timbre(st)); if (touched) evs.push(chord(st, 'timbre'));
      }
      else if (a === 7) { st.f1 = f1Pos(pickI(3601)); evs.push(f1ev(st)); if (touched) evs.push(chord(st, 'f1')); }
      else if (a === 8 || a === 9) evs.push(listen(st));
      else if (a === 10) { st.r = 2; st.rsrc = 'sweep'; evs.push(sweep(st)); }
      else if (a === 11) { st.r2 = r2Pos(pickI(1201)); touched = true; evs.push(chord(st, 'r2')); }
      else { touched = true; evs.push(chord(st, 'play')); }
      evs.forEach(e => missions.forEach(m => { if (!m.doneRun && m.check(e, m.mem)) { m.doneRun = true; counts[m.id] = (counts[m.id] || 0) + 1; } }));
    }
  }
  const lines = missions.map(m => m.id + (m.hidden ? '（隱藏 ' : '（') + m.level + ' 級）' + (100 * (counts[m.id] || 0) / RUNS).toFixed(1) + '%');
  console.log('  ' + lines.join('\n  '));
  console.log('  （' + ((Date.now() - t0) / 1000).toFixed(1) + ' 秒）');
  const risky = missions.filter(m => m.level >= 6 && (counts[m.id] || 0) / RUNS > 0.05);
  if (risky.length) { fail++; console.log('  ✗ 6 級以上的任務亂按就完成的比例超過 5%：' + risky.map(m => m.id).join('、')); }
  else console.log('  ✓ 6 級以上的任務亂按完成的比例都不到 5%');
  const hidRisk = missions.filter(m => m.hidden && (counts[m.id] || 0) / RUNS > 0.05);
  if (hidRisk.length) { fail++; console.log('  ✗ 隱藏任務亂按就完成的比例超過 5%：' + hidRisk.map(m => m.id).join('、')); }
  else console.log('  ✓ 隱藏任務亂按完成的比例都不到 5%');
}

// ---------- 總覽 ----------
const pub = missions.filter(m => !m.hidden), hid = missions.filter(m => m.hidden);
const starsOf = m => (m.hidden ? 2 : 1) * m.level;
const stars = missions.reduce((s, m) => s + starsOf(m), 0);
console.log(`\n公開 ${pub.length} 個、隱藏 ${hid.length} 個，共 ${stars} 顆星（公開 ${pub.reduce((s, m) => s + m.level, 0)}、隱藏 ${hid.reduce((s, m) => s + starsOf(m), 0)}，隱藏任務是等級 × 2）。`);
if (hid.length !== 10) { fail++; console.log('隱藏任務要 10 個。'); }
if (hid.filter(m => m.level >= 7).length < 3) { fail++; console.log('隱藏任務至少 3 個要在 7 級以上。'); }
if (hid.some(m => m.level < 3 || m.level > 10)) { fail++; console.log('隱藏任務的等級要在 3–10。'); }
if (hid.some(m => starsOf(m) > 20)) { fail++; console.log('隱藏任務超過 20 顆星（規則上限）。'); }
{ const lv = {}; hid.forEach(m => { lv[m.level] = (lv[m.level] || 0) + 1; }); if (Object.values(lv).some(c => c > 2)) { fail++; console.log('隱藏任務不要擠在同一級（同一級最多 2 個）。'); } }
if (pub.length < 10 || pub.length > 12) { fail++; console.log('公開任務要 10–12 個。'); }
if (hid.some(m => !m.riddle || !m.riddle.zh || !m.riddle.en || m.title || m.desc)) { fail++; console.log('隱藏任務只寫 riddle（中英）。'); }
if (fail) { console.log(`有 ${fail} 項不符合。`); process.exit(1); }
console.log('全部任務都證明做得到，預設狀態不觸發，隱藏任務之間不連帶完成。');
