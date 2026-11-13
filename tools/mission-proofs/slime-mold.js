/* 任務可達成的證明腳本。用法：node tools/mission-proofs/slime-mold.js
 * 用黏菌核心（js/slime-mold-core.js）照頁面的做法算出 'maze'、'net' 事件（與 js/slime-mold.js 相同的計算），
 * 再用任務檔（js/missions/slime-mold.js）同一份 check 函式判定。每個任務都給出一組做得到的操作，並檢查預設狀態不會誤觸。
 * 修改核心、頁面的事件或任務條件後重跑。 */
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..', '..') + '/';
const S = require(ROOT + 'js/slime-mold-core.js');

const defs = [];
const fakeLM = { register: function (id, list) { list.forEach(m => defs.push(Object.assign({ mem: {} }, m))); } };
new Function('window', 'LabMission', fs.readFileSync(ROOT + 'js/missions/slime-mold.js', 'utf8'))({ LabMission: fakeLM }, fakeLM);
const byId = {};
defs.forEach(m => { byId[m.id.replace('slime-mold-', '')] = m; });
const check = (id, ev) => byId[id].check(ev, byId[id].mem);

const out = [];
let fail = 0;
function claim(ok, msg) { out.push((ok ? '✓ ' : '✗ ') + msg); if (!ok) fail++; }
const f = (v, d) => (v == null || !isFinite(v)) ? '—' : v.toFixed(d);

// ---------- 與 js/slime-mold.js 相同的計算 ----------
const THR = 1e-3, DT1 = 0.3, DT2 = 0.5, MAXSTEP1 = 6000, MAXSTEP2 = 1500, TOL = 1e-4;
const DEF1 = { W: 12, H: 8, loops: 6, seed: 1, mu: 1, noise: 0.1, foods: null };
/** 第一部分：建迷宮、放食物、長到穩定，回傳 'maze' 事件 */
function mazeEv(o) {
  const p = Object.assign({}, DEF1, o);
  const M = S.maze(p.W, p.H, p.loops, p.seed), n = p.W * p.H;
  const foods = p.foods || [0, n - 1];
  const R = S.mazeRoutes(M.g, foods[0], foods[1]);
  const s = S.create({ g: M.g, foods: foods, rule: 'pow', mu: p.mu, I0: 1, dt: DT1, noise: p.noise, seed: p.seed * 31 + 7 });
  for (let i = 0; i < MAXSTEP1; i++) { S.step(s); if (s.change < TOL) break; }
  const r = S.mazeResult(s, R, THR);
  const moved = !(foods[0] === 0 && foods[1] === n - 1) && !(foods[1] === 0 && foods[0] === n - 1);
  return { type: 'maze', data: {
    mu: p.mu, noise: p.noise, W: p.W, H: p.H, loops: p.loops, cells: n, moved: moved, converged: s.change < TOL, connected: r.connected,
    single: r.single, len: r.len, shortest: r.shortest, second: r.second, nShortest: r.nShortest, cyc: r.cyc, isShortest: r.isShortest,
    onShortOnly: r.onShortOnly, t: s.t } };
}
const TW = S.taiwan(7), TG = TW.g, CITY = S.CITIES;
const RAIL_OK = S.railEdges(TW);
const DEFAULT_IDS = CITY.filter(c => c.on).map(c => c.id);
const EAST = { hun: 1, ttt: 1 }, WEST = { tpe: 1, tyn: 1, hsz: 1, mia: 1, txg: 1, chw: 1, yun: 1, cyi: 1, tnn: 1, khh: 1, pif: 1 };
const DEF2 = { ids: DEFAULT_IDS, I0: 1, gamma: 1.8, M: 0 };
/** 第二部分：放食物、長到穩定，回傳 'net' 事件 */
function netEv(o) {
  const p = Object.assign({}, DEF2, o);
  const ids = CITY.filter(c => p.ids.indexOf(c.id) >= 0).map(c => c.id);
  const fds = ids.map(k => TW.city[k]);
  S.setMountain(TG, p.M);
  const s = S.create({ g: TG, foods: fds, rule: 'sig', gamma: p.gamma, I0: p.I0, dt: DT2 });
  for (let i = 0; i < MAXSTEP2; i++) { S.step(s); if (s.change < TOL) break; }
  const ok = S.alive(s, THR), st = S.netStats(TG, ok, fds);
  const ms = S.netStats(TG, S.mstEdges(TG, fds), fds);
  const d15 = ids.length === DEFAULT_IDS.length && DEFAULT_IDS.every(k => ids.indexOf(k) >= 0);
  const rs = d15 ? S.netStats(TG, RAIL_OK, fds) : null;
  const beat = !!(d15 && rs && st.connected && st.TL <= rs.TL && st.MD <= rs.MD && st.FT >= 0.95);
  return { type: 'net', data: {
    cities: fds.length, ids: ids, default15: d15, all17: fds.length === CITY.length, I0: p.I0, gamma: p.gamma, M: p.M,
    converged: s.change < TOL, t: s.t, connected: st.connected, TL: st.TL, MD: st.MD, FT: st.FT,
    TLr: st.TL / ms.TL, MDr: st.connected ? st.MD / ms.MD : Infinity,
    railTL: rs ? rs.TL : null, railMD: rs ? rs.MD : null, railFT: rs ? rs.FT : null, beatRail: beat,
    maxH: S.maxElev(TG, ok), east: ids.some(k => EAST[k]), west: ids.some(k => WEST[k]) } };
}
const mdesc = d => `μ ${f(d.mu, 2)}、${d.W}×${d.H}+${d.loops}：最短 ${d.shortest}（${d.nShortest} 條）、第二短 ${d.second}、結果 ${d.single ? '一條路 ' + d.len + ' 格' : '環 ' + d.cyc}、收斂 ${d.converged}`;
const ndesc = d => `${d.cities} 城、I0 ${f(d.I0, 2)}、γ ${f(d.gamma, 2)}、山 ${f(d.M, 1)}：總長 ${f(d.TLr, 3)}×（${f(d.TL, 0)} km）、平均距離 ${f(d.MDr, 3)}×（${f(d.MD, 1)} km）、容錯 ${f(d.FT, 3)}、最高 ${f(d.maxH, 2)}`;
/** 在 seeds 裡找第一個讓任務成立的迷宮 */
function findMaze(id, base, seeds) {
  for (const sd of seeds) { const ev = mazeEv(Object.assign({}, base, { seed: sd })); if (check(id, ev)) return ev; }
  return null;
}

// ---------- 預設狀態 ----------
const m0 = mazeEv({}), n0 = netEv({});
out.push('預設迷宮：' + mdesc(m0.data));
out.push('預設臺灣：' + ndesc(n0.data));
const def = defs.filter(m => (m.check(m0, {}) || m.check(n0, {})));
claim(def.every(m => m.level <= 3 && !m.hidden), '預設操作只會完成 3 級以下的公開任務：' + (def.map(m => m.id + '（' + m.level + '）').join('、') || '沒有'));

// ---------- 迷宮 ----------
claim(check('1', m0), '1 縮成一條路：預設 ' + mdesc(m0.data));
{
  const e = mazeEv({ foods: [3, 88] });
  claim(check('2', e), '2 換個地方吃：燕麥放第 3 格與第 88 格，' + mdesc(e.data));
  claim(!check('2', m0), '2 對照：沒有移動食物不算');
}
{
  const e = findMaze('4', {}, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  claim(!!e, '4 只差兩步：' + (e ? '第 ' + e.data.W + '×' + e.data.H + ' 迷宮 ' + mdesc(e.data) : '找不到'));
  claim(!check('4', m0), '4 對照：預設迷宮（最短 ' + m0.data.shortest + ' 格）不算');
}
{
  const e = mazeEv({ mu: 0.5 });
  claim(check('5', e), '5 不只一條路：' + mdesc(e.data));
  const e2 = mazeEv({ mu: 0.8 });
  claim(!check('5', e2), '5 對照：μ = 0.8 不算（' + mdesc(e2.data) + '）');
}
{
  let e = null, sd0 = 0;
  for (let sd = 1; sd <= 40 && !e; sd++) {
    const base = mazeEv({ seed: sd });
    if (base.data.nShortest >= 2) { const t = mazeEv({ seed: sd, mu: 1.5 }); if (check('7', t)) { e = t; sd0 = sd; } }
  }
  claim(!!e, '7 二選一：第 ' + sd0 + ' 號迷宮，' + (e ? mdesc(e.data) : '找不到'));
  if (e) {
    const e1 = mazeEv({ seed: sd0, mu: 1 });
    claim(!check('7', e1) && check('h1', e1), 'h1 兩條路一樣近：同一個迷宮 μ = 1 時兩條都留著（' + mdesc(e1.data) + '）');
    claim(!check('h1', e), 'h1 對照：μ = 1.5 只留一條，不算');
  }
}
{
  let e = null;
  for (let sd = 1; sd <= 60 && !e; sd++) { const t = mazeEv({ W: 20, H: 15, loops: 25, seed: sd }); if (check('10', t)) e = t; }
  claim(!!e, '10 大迷宮：' + (e ? '第 ' + e.data.W + '×' + e.data.H + ' 迷宮 ' + mdesc(e.data) : '找不到'));
  const small = mazeEv({ W: 16, H: 15, loops: 25, seed: 3 });
  claim(!check('10', small), '10 對照：16×15 = 240 格不算');
}

// ---------- 臺灣 ----------
claim(check('3', n0), '3 連起所有城市：預設 ' + ndesc(n0.data));
{
  const e = netEv({ M: 3, I0: 1 });
  claim(check('6', e), '6 最省的樹：' + ndesc(e.data));
  claim(!check('6', n0), '6 對照：預設山區阻力 0 不算');
  const e2 = netEv({ M: 6, I0: 1 });
  claim(!check('6', e2), '6 對照：山區阻力 6 時樹比較長（' + f(e2.data.TLr, 3) + '×）不算');
}
{
  const e = netEv({ M: 6, I0: 1 });
  claim(check('8', e), '8 繞過中央山脈：' + ndesc(e.data));
  claim(!check('8', n0), '8 對照：沒有山區阻力時翻山（最高 ' + f(n0.data.maxH, 2) + '）');
}
{
  const e = netEv({ M: 3, I0: 2 });
  claim(check('9', e), '9 有備援的網：' + ndesc(e.data));
  const e2 = netEv({ M: 0, I0: 6 });
  claim(!check('9', e2), '9 對照：I0 = 6 太長（' + f(e2.data.TLr, 2) + '×）不算');
}
{
  const e = netEv({ M: 3, I0: 2 });
  claim(check('11', e), '11 不輸臺鐵：' + ndesc(e.data) + '；臺鐵 ' + f(e.data.railTL, 0) + ' km、' + f(e.data.railMD, 1) + ' km、容錯 ' + f(e.data.railFT, 2));
  const e2 = netEv({ M: 6, I0: 2 });
  claim(!check('11', e2), '11 對照：山區阻力 6、I0 = 2 平均距離輸一點（' + f(e2.data.MD, 1) + ' km）不算');
}
{
  const all = CITY.map(c => c.id);
  let e = null;
  const tried = [];
  for (const M of [3, 4, 5, 6]) for (const I0 of [2, 2.5, 3]) {
    if (e) break;
    const t = netEv({ ids: all, M: M, I0: I0 });
    tried.push(`山 ${M}、I0 ${I0}：${f(t.data.TLr, 2)}/${f(t.data.MDr, 2)}/${f(t.data.FT, 2)}`);
    if (check('12', t)) e = t;
  }
  claim(!!e, '12 全臺十七城：' + (e ? ndesc(e.data) : '找不到（' + tried.join('；') + '）'));
  const e2 = netEv({ ids: all, M: 3, I0: 1 });
  claim(!check('12', e2), '12 對照：I0 = 1 是樹（容錯 ' + f(e2.data.FT, 2) + '）不算');
}
{
  const e = netEv({ ids: ['tpe', 'khh'] });
  claim(check('h2', e), 'h2 兩個人的世界：只放臺北、高雄，' + ndesc(e.data));
  claim(!check('h2', n0), 'h2 對照：15 城不算');
}
{
  const e = netEv({ I0: 6 });
  claim(check('h3', e), 'h3 條條大路：' + ndesc(e.data));
  const e2 = netEv({ I0: 4 });
  claim(!check('h3', e2), 'h3 對照：I0 = 4 不算');
}

// ---------- 星星 ----------
const stars = m => m.hidden ? m.level * 2 : m.level;
const pub = defs.filter(m => !m.hidden), hid = defs.filter(m => m.hidden);
out.push(`任務 ${defs.length} 個（公開 ${pub.length}、隱藏 ${hid.length}），共 ${defs.reduce((a, m) => a + stars(m), 0)} 顆星（公開 ${pub.reduce((a, m) => a + stars(m), 0)}，隱藏 ${hid.reduce((a, m) => a + stars(m), 0)}）`);
console.log(out.join('\n'));
if (fail) { console.error(fail + ' 項不成立'); process.exitCode = 1; }
