/* 任務可達成的證明腳本。用法：node tools/mission-proofs/hubble-expansion.js
 * 修改物理核心或任務條件後重跑，確認每個任務仍然做得到、不該觸發的不會觸發。
 * 事件的內容與 js/hubble-expansion.js 的 snapshot() 相同，全部由 js/hubble-expansion-core.js 計算：
 *   膨脹：盒子 boxGalaxies(7)、寬 6000 Mpc、ȧ 固定（H = 70/a），光從 a0 出發、在 a0·exp(χ/R_H) 到家（R_H = c/70），a 最大 3。
 *   量測：每個星系、每種方法的量測值是固定的（種子），可以重量；「全部量一遍」量完這個方法量得到的所有星系。
 *   年齡：輻射照 Planck 算，H0 打字精度 0.1、Ωm 與 ΩΛ 打字精度 0.001。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const HC = require(ROOT + 'js/hubble-expansion-core.js');
const missions = [];
global.window = { HubCore: HC, LabMission: { register: (id, list) => list.forEach(m => missions.push(m)) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/hubble-expansion.js');
const SLUG = 'hubble-expansion-';
const byId = id => missions.find(m => m.id === SLUG + id);

// ───── 和頁面相同的設定 ─────
const L_BOX = 6000, H_SIM = 70, R_HUB = HC.C_KMS / H_SIM, VIEW = 4500, A_MIN = 0.4, A_MAX = 3, MW = 24;
const GAL = HC.boxGalaxies(7), CAT = HC.CATALOG, CAT_I = {}; CAT.forEach((g, i) => { CAT_I[g.id] = i; });
const MW_POS = { i: MW, ox: 0, oy: 0 };
const cpos = p => ({ x: GAL[p.i].x + p.ox, y: GAL[p.i].y + p.oy });
const chiOf = (home, p) => { const a = cpos(p), h = cpos(home); return L_BOX * Math.hypot(a.x - h.x, a.y - h.y); };
const same = (p, q) => p.i === q.i && p.ox === q.ox && p.oy === q.oy;
/** 從 home 看得到、點得到的星系（畫面正方形 ±VIEW 以內，留 3 % 邊） */
function clickable(home, a) {
  const out = [], h = cpos(home), lim = VIEW * 0.97 / (a * L_BOX), n = Math.ceil(lim) + 1;
  for (let ox = -n; ox <= n; ox++) for (let oy = -n; oy <= n; oy++) GAL.forEach((g, i) => {
    const dx = g.x + ox - h.x, dy = g.y + oy - h.y;
    if (Math.abs(dx) <= lim && Math.abs(dy) <= lim && a * L_BOX * Math.hypot(dx, dy) > 1) out.push({ i: i, ox: ox, oy: oy });
  });
  return out;
}
function defaultTarget() {
  let best = null, bs = 1e9; const h = cpos(MW_POS);
  for (let ox = -2; ox <= 2; ox++) for (let oy = -2; oy <= 2; oy++) GAL.forEach((g, i) => {
    const dx = g.x + ox - h.x, dy = g.y + oy - h.y, r = L_BOX * Math.hypot(dx, dy); if (r < 1 || Math.abs(dx) > VIEW * 1.25 / L_BOX || Math.abs(dy) > VIEW * 1.25 / L_BOX) return;
    const s = Math.abs(r - 2400) / 400 + Math.abs(Math.atan2(dy, dx) - 0.6); if (s < bs) { bs = s; best = { i: i, ox: ox, oy: oy }; }
  });
  return best;
}

/** 膨脹：a0 出發，播到光到家或 a = 3 */
function expandRun(home, target, a0) {
  if (a0 >= A_MAX - 1e-9) a0 = 1;
  const chi = chiOf(home, target), aArr = a0 * Math.exp(chi / R_HUB), arrived = aArr <= A_MAX, a = arrived ? aArr : A_MAX;
  return { type: 'run', data: {
    mode: 'expand', chart: 'vr', anim: false, a: a, homeMW: same(home, MW_POS), targetMW: same(target, MW_POS), hasTarget: true,
    dist: a * chi, chi: chi, v: H_SIM * chi, vc: H_SIM * chi / HC.C_KMS, H: H_SIM / a,
    z: arrived ? aArr / a0 - 1 : null, arrived: arrived, vEmit: H_SIM * chi / HC.C_KMS, lastZ: arrived ? aArr / a0 - 1 : null } };
}
/** 量測：pts = { 方法: [星系代號…] }（依序量），method = 目前的方法；last = 最後按「量這個星系」的星系（或 ''） */
function measureEv(pts, method, sel, last, type) {
  const P = {}; ['hubble', 'cepheid', 'sn'].forEach(m => { P[m] = {}; (pts[m] || []).forEach(id => { const i = CAT_I[id], r = HC.measure(i, m); if (r) P[m][i] = r; }); });
  const p = Object.keys(P[method]).map(k => P[method][k]), f = p.length ? HC.fitH(p) : null;
  const si = CAT_I[sel], c = P.cepheid[si], s = P.sn[si], g = last ? CAT[CAT_I[last]] : null;
  return { type: type || 'run', data: {
    mode: 'measure', chart: 'hubble', anim: false, method: method, n: p.length, H: f ? f.H : null, sH: f && f.n >= 2 ? f.sH : null,
    rel: f && f.n >= 2 && f.H > 0 ? f.sH / f.H : null, age1: f ? f.age1 : null, ageL: f ? f.ageL : null,
    dmin: p.length ? Math.min.apply(null, p.map(q => q.d)) : null, dmax: p.length ? Math.max.apply(null, p.map(q => q.d)) : null,
    sel: sel, last: last || '', lastV: g ? g.v : null, lastLocal: g ? !!g.local : null, lastReal: g ? !!g.real : null,
    both: c && s ? Math.abs(c.d - s.d) / ((c.d + s.d) / 2) : null } };
}
const reach = m => CAT.filter(g => HC.canMeasure(g, m)).map(g => g.id);
/** 年齡：照頁面 ageModel() */
function ageEv(H0, Om, OL, model, type) {
  const M = HC.model(H0, Om, OL), age = HC.age(M), rec = HC.recollapses(M), hist = HC.history(M, rec ? 400 : 40, -80), aA = HC.aAccel(M);
  return { type: type || 'state', data: {
    mode: 'age', chart: 'om', anim: false, H0: H0, Om: Om, OL: OL, Ok: M.Ok, flat: Math.abs(M.Ok) <= 0.005, model: model || '',
    age: age, bang: age != null, crunch: hist.crunch, recollapse: rec, q0: HC.q0(M), zacc: aA && aA < 1 ? 1 / aA - 1 : null, tH: HC.hubbleTime(H0) } };
}

const hits = (id, e) => !!e && byId(id).check(e);
const lvOf = id => byId(id).level, high = id => lvOf(id) >= 6 || id[0] === 'h';
let ok = 0, bad = 0;
function expect(label, cond, extra) {
  if (cond) { ok++; console.log('  ✓ ' + label + (extra ? '（' + extra + '）' : '')); }
  else { bad++; console.error('  ✗ ' + label + (extra ? '（' + extra + '）' : '')); }
}
const allIds = missions.map(m => m.id.replace(SLUG, ''));
const hidIds = allIds.filter(id => id[0] === 'h');
const otherHidden = id => hidIds.filter(h => h !== id);
const fired = e => allIds.filter(id => hits(id, e));
const examples = {};
function ex(id, e, note) { examples[id] = e; expect(id + ' 做得到', hits(id, e), note); }
function no(id, e, note) { expect(id + ' 不觸發：' + note, !hits(id, e)); }
const f3 = v => v == null ? '—' : (+v).toPrecision(3);
const rd = (v, n) => Math.round(v * Math.pow(10, n)) / Math.pow(10, n);

console.log('hubble-expansion 任務證明');
expect('任務總數 22（一般 12、隱藏 10）', missions.length === 22 && hidIds.length === 10);
const lv = hidIds.map(id => byId(id).level);
expect('隱藏任務等級 3–10、至少 3 個 7 級以上', lv.every(l => l >= 3 && l <= 10) && lv.filter(l => l >= 7).length >= 3, lv.join(','));

// ───── 膨脹 ─────
const T0 = defaultTarget(), defRun = expandRun(MW_POS, T0, 1);
ex('1', defRun, '預設：χ = ' + f3(defRun.data.chi) + ' Mpc，z = ' + f3(defRun.data.z));
// 所有可能的（家、目標、出發的 a）：家 = 銀河系，或從銀河系看得到的星系（搬家）
const AS = []; for (let a = A_MIN; a <= A_MAX + 1e-9; a += 0.01) AS.push(rd(a, 2));
const homes = [MW_POS].concat(clickable(MW_POS, 1).filter(q => L_BOX * Math.hypot(cpos(q).x - cpos(MW_POS).x, cpos(q).y - cpos(MW_POS).y) < 4000));
function findExpand(id, opt) {
  opt = opt || {};
  for (const home of (opt.homes || homes)) for (const a0 of (opt.as || AS)) {
    const tg = opt.target ? [opt.target(home)] : clickable(home, a0);
    for (const t of tg) { if (!t) continue; const e = expandRun(home, t, a0); if (hits(id, e) && !otherHidden(id).some(h => hits(h, e)) && (!opt.extra || opt.extra(e))) return { home, t, a0, e }; }
  }
  return null;
}
// 4：搬家到預設目標，再膨脹（目標變成銀河系）
const e4 = expandRun(T0, MW_POS, 1); ex('4', e4, '搬到預設的粉紅星系再膨脹');
no('h5', e4, '預設目標只有 ' + f3(e4.data.chi) + ' Mpc（要 3000）');
let r;
r = findExpand('h1', { homes: [MW_POS] });
ex('h1', r && r.e, r ? '家 = 銀河系、a0 = ' + r.a0 + '、χ = ' + f3(r.e.data.chi) + '、z = ' + f3(r.e.data.z) : '找不到');
r = findExpand('h2', { homes: [MW_POS] });
ex('h2', r && r.e, r ? '家 = 銀河系、a0 = ' + r.a0 + '、χ = ' + f3(r.e.data.chi) + ' > c/H = ' + f3(R_HUB) + '、z = ' + f3(r.e.data.z) : '找不到');
r = findExpand('h5', { as: [1], target: () => MW_POS });
ex('h5', r && r.e, r ? '搬到 ' + f3(r.e.data.chi) + ' Mpc 外、a0 = 1 再膨脹' : '找不到');
// h1 的範圍：z 只由 χ 決定
expect('h1 的 z 只由 χ 決定：χ ∈ [' + f3(R_HUB * Math.log(1.98)) + ', ' + f3(R_HUB * Math.log(2.02)) + '] Mpc', true);
// 預設目標、各種 a0 都不觸發 h1、h2
expect('預設目標在任何 a0 都不觸發 h1、h2', AS.every(a0 => { const e = expandRun(MW_POS, T0, a0); return !hits('h1', e) && !hits('h2', e); }));
// 光到不了（a = 3 時還在路上）不算
const far = clickable(MW_POS, 1).find(q => chiOf(MW_POS, q) > R_HUB * Math.log(3) + 50);
const eFar = expandRun(MW_POS, far, 1);
expect('光在 a = 3 前到不了：不算到家、不觸發 h2', eFar.data.arrived === false && !hits('h2', eFar), 'χ = ' + f3(eFar.data.chi));
// 從銀河系看出去，隨便點、a0 = 1：各隱藏任務觸發的比例
{ const tg = clickable(MW_POS, 1); const cnt = {}; tg.forEach(t => fired(expandRun(MW_POS, t, 1)).forEach(id => { cnt[id] = (cnt[id] || 0) + 1; }));
  console.log('    （a0 = 1、從銀河系隨便點一個看得到的星系，共 ' + tg.length + ' 個：' + Object.keys(cnt).map(k => k + ' ' + cnt[k]).join('、') + '）');
  expect('h2 在 a0 ≥ 0.67 時做不到（一定要先把宇宙調小）', homes.every(h => AS.filter(a0 => a0 >= 0.67).every(a0 => clickable(h, a0).every(t => !hits('h2', expandRun(h, t, a0)))))); }

// ───── 量測 ─────
const defM = measureEv({ cepheid: ['m31'] }, 'cepheid', 'm31', 'm31');
ex('2', defM, '預設選仙女座、造父變星'); ex('5', defM);
const eCep = measureEv({ cepheid: reach('cepheid') }, 'cepheid', 'm31', '');
ex('6', eCep, '造父變星全部量一遍：n = ' + eCep.data.n + '，H = ' + f3(eCep.data.H) + ' ± ' + f3(eCep.data.sH));
const eHub = measureEv({ hubble: reach('hubble') }, 'hubble', 'm31', '');
ex('7', eHub, '哈伯的尺度全部量一遍：n = ' + eHub.data.n + '，H = ' + f3(eHub.data.H) + '，1/H = ' + f3(eHub.data.age1) + ' 十億年');
const eSn = measureEv({ sn: reach('sn') }, 'sn', 'm31', '');
ex('8', eSn, '超新星全部量一遍：n = ' + eSn.data.n + '，誤差 ' + f3(eSn.data.rel * 100) + ' %');
no('12', eSn, '全部量一遍會量到 40 Mpc 以內的（dmin = ' + f3(eSn.data.dmin) + '）');
// 12：只量 40 Mpc 以外的超新星
{ const farSn = reach('sn').filter(id => HC.measure(CAT_I[id], 'sn').d >= 40);
  const eAll = measureEv({ sn: farSn }, 'sn', 'm31', '');
  console.log('    （40 Mpc 以外有 ' + farSn.length + ' 個：全部量 H = ' + f3(eAll.data.H) + '）');
  let best = null;
  const N = farSn.length;
  for (let mask = 0; mask < (1 << N) && !best; mask++) { const s = farSn.filter((_, k) => mask >> k & 1); if (s.length < 5) continue; const e = measureEv({ sn: s }, 'sn', 'm31', ''); if (hits('12', e)) best = { s, e }; }
  ex('12', eAll.data.n >= 5 && hits('12', eAll) ? eAll : best && best.e, best || hits('12', eAll) ? (hits('12', eAll) ? '40 Mpc 以外全部量：' : '挑 ' + best.s.join('、') + '：') + 'H = ' + f3((hits('12', eAll) ? eAll : best.e).data.H) : '找不到');
  // 12 只要多量一個近的就不算
  const near = reach('sn').find(id => HC.measure(CAT_I[id], 'sn').d < 40);
  no('12', measureEv({ sn: farSn.concat([near]) }, 'sn', 'm31', ''), '多量一個 40 Mpc 以內的（' + near + '）'); }
// h3：同一個星系兩把尺
{ const both = reach('cepheid').filter(id => reach('sn').includes(id)).map(id => { const i = CAT_I[id], c = HC.measure(i, 'cepheid'), s = HC.measure(i, 'sn'); return { id, d: Math.abs(c.d - s.d) / ((c.d + s.d) / 2) }; });
  console.log('    （兩把尺都量得到的星系：' + both.map(b => b.id + ' ' + (b.d * 100).toFixed(1) + '%').join('、') + '）');
  const g = both.find(b => b.d <= 0.02);
  const e = g && measureEv({ cepheid: [g.id], sn: [g.id] }, 'sn', g.id, g.id);
  ex('h3', e, g ? g.id + '：差 ' + (g.d * 100).toFixed(1) + ' %' : '找不到');
  expect('h3 不是每個星系都過（有些差超過 2 %）', both.some(b => b.d > 0.02));
  no('h3', measureEv({ cepheid: reach('cepheid'), sn: reach('sn') }, 'sn', 'm31', ''), '兩種都全部量一遍、選的是預設的仙女座'); }
// h4：本星系群以外、藍移
{ const blue = CAT.filter(g => g.v < 0).map(g => g.id + (g.local ? '（本星系群）' : '')); console.log('    （藍移的星系：' + blue.join('、') + '）');
  ex('h4', measureEv({ hubble: ['m81'] }, 'hubble', 'm81', 'm81'), '用哈伯的尺度量 M81');
  no('h4', defM, '仙女座是本星系群');
  no('h4', measureEv({ cepheid: ['m33'] }, 'cepheid', 'm33', 'm33'), '三角座星系是本星系群'); }
ex('h10', measureEv({ sn: ['coma'] }, 'sn', 'coma', 'coma'), '用超新星量后髮座星系團');
expect('后髮座星系團只有超新星量得到', !HC.canMeasure(CAT[CAT_I.coma], 'cepheid') && !HC.canMeasure(CAT[CAT_I.coma], 'hubble'));
no('h10', measureEv({ sn: reach('sn') }, 'sn', 'coma', ''), '全部量一遍（不是按「量這個星系」）');

// ───── 年齡 ─────
const P = HC.PLANCK, def = ageEv(P.H0, P.Om, P.OL, 'planck');
ex('3', Object.assign({}, def, { type: 'run' }), '預設 Planck：' + f3(def.data.age) + ' 十億年');
const e9 = ageEv(73, 1, 0, ''); ex('9', e9, 'Ωm = 1、H0 = 73：' + f3(e9.data.age) + ' 十億年');
no('9', ageEv(P.H0, 1, 0, 'eds'), '按「只有物質」（H0 還是 67.4）');
no('9', ageEv(500, 1, 0, 'hubble'), '按「哈伯 1929」（H0 = 500）');
// 格點搜尋：Ωm、ΩΛ 每 0.005（滑桿的格子）
function gridFind(id, H0s, test) {
  for (const H0 of H0s) for (let i = 0; i <= 600; i++) for (let j = 0; j <= 500; j++) {
    const Om = rd(i * 0.005, 3), OL = rd(-1 + j * 0.005, 3); if (test && !test(Om, OL)) continue;
    const e = ageEv(H0, Om, OL); if (hits(id, e) && !otherHidden(id).some(h => hits(h, e))) return e;
  }
  return null;
}
let e;
e = gridFind('10', [P.H0], (Om, OL) => Om >= 2 && Om % 0.5 === 0 && OL % 0.25 === 0);
ex('10', e, e ? 'Ωm = ' + e.data.Om + '、ΩΛ = ' + e.data.OL + '：' + f3(e.data.crunch) + ' 十億年後大崩墜' : '找不到');
const eClosed = ageEv(P.H0, 3, 0, 'closed'); no('10', eClosed, '按「封閉」（' + f3(eClosed.data.crunch) + ' 十億年後才大崩墜）');
e = ageEv(P.H0, 0.2, 0.8); ex('11', e, 'Ωm = 0.2、ΩΛ = 0.8：z_acc = ' + f3(e.data.zacc));
no('11', def, 'Planck 的 z_acc = ' + f3(def.data.zacc));
// h6：H0 = 70、平坦、138 億年
{ let hit = null; for (let i = 100; i <= 600 && !hit; i++) { const Om = i / 1000, OL = rd(1 - Om, 3), e = ageEv(70, Om, OL); if (hits('h6', e) && !otherHidden('h6').some(h => hits(h, e))) hit = e; }
  ex('h6', hit, hit ? 'H0 = 70、Ωm = ' + hit.data.Om + '、ΩΛ = ' + hit.data.OL + '：' + f3(hit.data.age) + ' 十億年' : '找不到'); }
no('h6', def, '預設 Planck（H0 = 67.4）');
no('h6', ageEv(70, P.Om, P.OL), 'H0 = 70、Planck 的 Ωm（' + f3(ageEv(70, P.Om, P.OL).data.age) + ' 十億年）');
// h7：年齡 = 1/H0
{ let hit = null; for (let i = 100; i <= 600 && !hit; i++) { const Om = i / 1000, OL = rd(1 - Om, 3), e = ageEv(P.H0, Om, OL); if (hits('h7', e) && !otherHidden('h7').some(h => hits(h, e))) hit = e; }
  ex('h7', hit, hit ? '平坦、Ωm = ' + hit.data.Om + '：t0·H0 = ' + (hit.data.age / hit.data.tH).toFixed(4) : '找不到'); }
no('h7', ageEv(P.H0, 0, 0, 'empty'), '空的宇宙（年齡剛好是 1/H0，但沒有物質）');
no('h7', def, 'Planck（t0·H0 = ' + (def.data.age / def.data.tH).toFixed(3) + '）');
e = gridFind('h8', [P.H0], (Om, OL) => OL >= 1.2 && Om >= 0.1 && Om <= 0.3); ex('h8', e, e ? 'Ωm = ' + e.data.Om + '、ΩΛ = ' + e.data.OL : '找不到');
no('h8', ageEv(P.H0, 0, 1.5), 'Ωm 拉到 0、ΩΛ 拉到 1.5（沒有物質）');
no('h8', ageEv(P.H0, P.Om, 1.5), 'Planck 的 Ωm、ΩΛ 拉到 1.5（還有大霹靂）');
e = ageEv(P.H0, 0.3, -0.03); ex('h9', e, 'Ωm = 0.3、ΩΛ = −0.03：宇宙長大到 a ≈ ' + f3(Math.sqrt(0.73 / 0.03)) + ' 附近停下來');
no('h9', ageEv(P.H0, P.Om, -1), 'ΩΛ 拉到 −1（太負，不是一點點）');
no('h9', ageEv(40, 1, 0, ''), '只有物質、H0 拉到 40（輻射讓它略為封閉，但沒有負的暗能量）');
// 端點組合：H0、Ωm、ΩΛ 各取兩端與預設，加上五個按鈕
{ const bad = []; [40, 67.4, 500, 600].forEach(h => [0, 0.315, 1, 3].forEach(o => [-1, 0, 0.685, 1.5].forEach(l => { const f = fired(ageEv(h, o, l)).filter(x => x[0] === 'h' || lvOf(x) >= 6); if (f.length) bad.push(h + '/' + o + '/' + l + ':' + f.join(',')); })));
  expect('滑桿端點與預設值的 64 種組合都不觸發 6 級以上與隱藏任務', !bad.length, bad.join('；')); }
no('h9', eClosed, '按「封閉」（Ωm = 3 > 1）');

// ───── 預設、按鈕、全部量一遍都不觸發 6 級以上的任務與隱藏任務 ─────
const presets = [['planck', P.H0, P.Om, P.OL], ['eds', P.H0, 1, 0], ['empty', P.H0, 0, 0], ['closed', P.H0, 3, 0], ['hubble', 500, 1, 0]];
presets.forEach(p => { const e = ageEv(p[1], p[2], p[3], p[0]); const f = fired(e).filter(high); expect('按「' + p[0] + '」不觸發 6 級以上與隱藏任務', !f.length, f.join(',')); });
{ const f = fired(defRun).concat(fired(defM)).filter(high); expect('預設的膨脹、預設的量測不觸發 6 級以上與隱藏任務', !f.length, f.join(',')); }
['hubble', 'cepheid', 'sn'].forEach(m => { const e = measureEv({ [m]: reach(m) }, m, 'm31', ''); const f = fired(e).filter(high); expect('「全部量一遍」（' + m + '）不觸發 6 級以上與隱藏任務', !f.length, f.join(',')); });
{ const e = measureEv({ hubble: reach('hubble'), cepheid: reach('cepheid'), sn: reach('sn') }, 'sn', 'm31', ''); const f = fired(e).filter(high); expect('三種都全部量一遍不觸發 6 級以上與隱藏任務', !f.length, f.join(',')); }
// 動畫播放中不算
{ const e = ageEv(70, 0.27, 0.73); e.data.anim = true; expect('動畫播放中不判定', !fired(e).length); }

// ───── 隱藏任務彼此不連帶 ─────
hidIds.forEach(id => { const e = examples[id]; if (!e) return; const f = fired(e).filter(x => x[0] === 'h' && x !== id); expect(id + ' 的例子不連帶完成其他隱藏任務', !f.length, f.join(',')); });

console.log(`\nhubble-expansion：${ok} 項通過、${bad} 項失敗`);
if (bad) process.exitCode = 1;
