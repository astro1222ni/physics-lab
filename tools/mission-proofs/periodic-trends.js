/* 任務可達成的證明腳本。用法：node tools/mission-proofs/periodic-trends.js
 * 用化學核心模擬頁面（js/periodic-trends.js）的操作與事件：選元素、換著色性質、換圖表分頁時送 'select' 與 'graph'，
 * 3D 開啟成功送 'view3d'，猜猜看按「核對」送 'predict'。
 * 猜猜看用一個學生做得到的猜法：同週期左右兩格的平均、同族上下兩格的平均（有幾個用幾個再平均），
 * 只用畫面上看得到的鄰居數值。確認每個任務都做得到、預設狀態不會觸發任務。修改核心、頁面事件或任務條件後重跑。 */
'use strict';
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const P = require(__ROOT + 'js/periodic-trends-core.js');
let missions = [];
global.LabMission = { register: (m, l) => { missions = l.map(x => Object.assign({}, x)); } };
global.window = { LabMission: global.LabMission };
require(__ROOT + 'js/missions/periodic-trends.js');

let bad = 0;
const done = {};
function fresh() { missions.forEach(m => { m.done = false; }); }
function emit(Pg, type, data) {
  if (!Pg.acted) return;
  const ev = { type, data };
  missions.forEach(m => { if (!m.done && m.check(ev)) { m.done = true; Pg.events.push(m.id); } });
}
function page() { return { prop: 'IE', lastNum: 'IE', Z: 11, tab: 'z', acted: false, events: [], game: null, streak: 0 }; }
const gp = Pg => Pg.prop === 'cat' ? Pg.lastNum : Pg.prop;
const hiddenSel = Pg => !!Pg.game && !Pg.game.revealed && Pg.game.Z === Pg.Z && Pg.game.prop === Pg.prop;
function report(Pg) {
  const q = P.pos(Pg.Z);
  emit(Pg, 'select', { Z: Pg.Z, prop: Pg.prop, hiddenSel: hiddenSel(Pg) });
  emit(Pg, 'graph', { tab: Pg.tab, prop: gp(Pg), period: q.period, group: q.group, Z: Pg.Z, hiddenSel: !!Pg.game && !Pg.game.revealed && Pg.game.Z === Pg.Z && Pg.game.prop === gp(Pg) });
}
function select(Pg, Z) { Pg.acted = true; Pg.Z = Z; report(Pg); }
function setProp(Pg, p) { Pg.acted = true; if (Pg.game && !Pg.game.revealed && p !== Pg.game.prop) { Pg.game.revealed = true; Pg.streak = 0; } Pg.prop = p; if (p !== 'cat') Pg.lastNum = p; report(Pg); }
function setTab(Pg, t) { Pg.acted = true; Pg.tab = t; report(Pg); }
function report2(msg, Pg, expect) {
  const ok = expect.every(id => Pg.events.includes(id));
  console.log((ok ? '  ✓ ' : '  ✗ ') + msg + '　→ ' + (Pg.events.join('、') || '（無）'));
  if (!ok) bad++;
  Pg.events.forEach(id => { done[id] = true; });
}

// ---------- 猜猜看的猜法：只用看得到的鄰居 ----------
function neighbour(Z, prop, dx, dy) {
  const q = P.pos(Z);
  if (dx) {
    const row = P.periodMembers(q.period), i = row.indexOf(Z), j = i + dx;
    return j >= 0 && j < row.length ? row[j] : null;
  }
  const col = P.groupMembers(q.group), i = col.indexOf(Z), j = i + dy;
  return j >= 0 && j < col.length ? col[j] : null;
}
function estimate(Z, prop) {
  const v = z => z == null ? null : P.value(z, prop);
  const ests = [];
  [[1, 0], [0, 1]].forEach(d => {
    const a = v(neighbour(Z, prop, -d[0], -d[1])), b = v(neighbour(Z, prop, d[0], d[1]));
    if (a != null && b != null) ests.push((a + b) / 2);
  });
  if (!ests.length) {
    [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(d => { const a = v(neighbour(Z, prop, d[0], d[1])); if (a != null) ests.push(a); });
  }
  return ests.reduce((s, x) => s + x, 0) / ests.length;
}
function startRound(Pg, prop, Z) {
  Pg.acted = true;
  Pg.prop = prop; Pg.lastNum = prop;
  Pg.game = { prop, Z, revealed: false };
  Pg.Z = Z;
  report(Pg);
}
function check(Pg, guess) {
  const g = Pg.game, actual = P.value(g.Z, g.prop), err = P.guessErr(guess, actual), hit = err <= 0.10;
  Pg.streak = hit ? Pg.streak + 1 : 0;
  g.revealed = true;
  emit(Pg, 'predict', { prop: g.prop, Z: g.Z, guess, actual, err, hit, streak: Pg.streak });
  return { err, hit };
}

// ---------- 預設狀態不觸發 ----------
fresh();
let Pg = page();
report(Pg);
console.log(Pg.events.length ? '  ✗ 沒有操作就完成了任務：' + Pg.events.join('、') : '  ✓ 沒有操作時不送事件、不完成任務');
if (Pg.events.length) bad++;
// 預設（第 3 週期附近、游離能）按一下不該完成需要特定元素的任務
fresh(); Pg = page(); select(Pg, 11);
if (Pg.events.length) { console.log('  ✗ 點預設的鈉就完成了：' + Pg.events.join('、')); bad++; } else console.log('  ✓ 點預設的鈉（游離能、對原子序圖）不完成任何任務');

// ---------- 找極值 ----------
fresh(); Pg = page();
setProp(Pg, 'EN'); select(Pg, 9);
report2('依電負度著色、選 F（電負度 ' + P.EL[9].EN + '，全表最大：' + P.EL[P.extremes('EN').max].sym + '）', Pg, ['periodic-trends-1']);
fresh(); Pg = page();
setProp(Pg, 'r'); select(Pg, 55);
report2('依原子半徑著色、選 Cs（' + P.EL[55].r + ' pm，全表最大：' + P.EL[P.extremes('r').max].sym + '）', Pg, ['periodic-trends-2']);
fresh(); Pg = page();
select(Pg, 2);
report2('依游離能著色、選 He（' + P.EL[2].IE.toFixed(1) + ' kJ/mol，全表最大：' + P.EL[P.extremes('IE').max].sym + '）', Pg, ['periodic-trends-3']);
fresh(); Pg = page();
setProp(Pg, 'mp'); select(Pg, 80);
const liq = []; for (let Z = 1; Z <= P.N; Z++) if (P.EL[Z].state === 'l' && P.isMetal(Z)) liq.push(P.EL[Z].sym);
report2('依熔點著色、選 Hg（熔點 ' + P.value(80, 'mp').toFixed(2) + ' °C；室溫液態金屬只有 ' + liq.join('、') + '）', Pg, ['periodic-trends-4']);
// 只換性質、不選對元素不算
fresh(); Pg = page(); setProp(Pg, 'mp'); select(Pg, 35);
if (Pg.events.includes('periodic-trends-4')) { console.log('  ✗ 選溴（非金屬）也算了'); bad++; } else console.log('  ✓ 選溴（室溫液體但不是金屬）不算任務 4');

// ---------- 3D ----------
fresh(); Pg = page(); Pg.acted = true;
emit(Pg, 'view3d', { prop: 'IE' });
report2('切換到 3D 立體', Pg, ['periodic-trends-5']);

// ---------- 圖表 ----------
fresh(); Pg = page();
setProp(Pg, 'r'); setTab(Pg, 'period'); select(Pg, 15);
const r3 = P.periodMembers(3).map(Z => P.EL[Z].sym + ' ' + P.EL[Z].r).join('、');
report2('原子半徑、同週期、選第 3 週期的 P（' + r3 + ' pm）', Pg, ['periodic-trends-6']);
fresh(); Pg = page();
setProp(Pg, 'EN'); select(Pg, 17); setTab(Pg, 'group');
const en17 = P.groupMembers(17).filter(Z => P.EL[Z].EN != null).map(Z => P.EL[Z].sym + ' ' + P.EL[Z].EN).join('、');
report2('電負度、選 Cl、同族（' + en17 + '）', Pg, ['periodic-trends-7']);
fresh(); Pg = page();
setTab(Pg, 'period'); select(Pg, 4); select(Pg, 5);
report2('游離能、同週期、選 B（' + P.EL[5].IE.toFixed(0) + ' < Be ' + P.EL[4].IE.toFixed(0) + ' kJ/mol）', Pg, ['periodic-trends-8']);
// 例外的元素正是畫面上標出的那幾個
const drops = [];
[2, 3].forEach(p => { const m = P.periodMembers(p); for (let i = 1; i < m.length; i++) if (P.EL[m[i]].IE < P.EL[m[i - 1]].IE) drops.push(P.EL[m[i]].sym); });
console.log((drops.join(' ') === 'B O Al S' ? '  ✓ ' : '  ✗ ') + '第 2、3 週期比左邊小的元素：' + drops.join('、') + '（任務 8 接受 B、O、Al、S）');
if (drops.join(' ') !== 'B O Al S') bad++;
fresh(); Pg = page(); setProp(Pg, 'r'); setTab(Pg, 'period'); select(Pg, 5);
if (Pg.events.includes('periodic-trends-8')) { console.log('  ✗ 原子半徑圖也算任務 8'); bad++; } else console.log('  ✓ 原子半徑的同週期圖選 B 不算任務 8');

// ---------- 猜猜看 ----------
P.GAME_PROPS.forEach(prop => {
  const c = P.candidates(prop);
  const errs = c.map(Z => P.guessErr(estimate(Z, prop), P.value(Z, prop)));
  const hits = errs.filter(e => e <= 0.10).length, h5 = errs.filter(e => e <= 0.05).length;
  console.log('    ' + P.PROPS[prop].zh + '：候選 ' + c.length + ' 個，用鄰居平均猜，10% 內 ' + hits + ' 個（' + Math.round(hits / c.length * 100) + '%）、5% 內 ' + h5 + ' 個；誤差中位數 ' +
    (errs.slice().sort((a, b) => a - b)[Math.floor(errs.length / 2)] * 100).toFixed(1) + '%');
});
// 連續 5 題：用亂數抽題、照鄰居平均猜，記錄要玩幾題才連中 5 題
let a = 12345; const rnd = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
['r', 'IE', 'EN'].forEach(prop => {
  fresh(); Pg = page();
  let rounds = 0, last = null, firstIE5 = null;
  while (rounds < 400 && !Pg.events.includes('periodic-trends-12')) {
    const Z = P.pick(prop, rnd, last); last = Z; rounds++;
    startRound(Pg, prop, Z);
    const r = check(Pg, estimate(Z, prop));
    if (prop === 'IE' && r.err <= 0.05 && firstIE5 == null) firstIE5 = rounds;
  }
  const exp = ['periodic-trends-9', 'periodic-trends-11', 'periodic-trends-12'].concat(prop === 'IE' ? ['periodic-trends-10'] : []);
  report2('猜猜看只考' + P.PROPS[prop].zh + '、每題用鄰居平均猜：第 ' + rounds + ' 題達成連續 5 題' + (firstIE5 ? '（第 ' + firstIE5 + ' 題就有 5% 內）' : ''), Pg, exp);
});
// 0.5% 內：鄰居平均剛好很準的元素
const close = [];
P.GAME_PROPS.forEach(prop => P.candidates(prop).forEach(Z => { const e = P.guessErr(estimate(Z, prop), P.value(Z, prop)); if (e <= 0.005) close.push(P.EL[Z].sym + '（' + P.PROPS[prop].zh + ' ' + (e * 100).toFixed(2) + '%）'); }));
fresh(); Pg = page();
{
  const prop = 'IE', Z = 35;   // 溴：由左右（Se、Kr）與上下（Cl、I）平均
  startRound(Pg, prop, Z);
  const est = estimate(Z, prop), r = check(Pg, Math.round(est));
  report2('鄰居平均剛好在 0.5% 內的有 ' + close.length + ' 個：' + close.join('、') + '；例如 Br 的游離能猜 ' + Math.round(est) + '（實際 ' + P.EL[Z].IE.toFixed(1) + '，誤差 ' + (r.err * 100).toFixed(2) + '%）', Pg, ['periodic-trends-h3']);
}
// 猜錯一題連勝歸零；換性質中斷連勝
fresh(); Pg = page();
startRound(Pg, 'IE', 15); check(Pg, estimate(15, 'IE'));
startRound(Pg, 'IE', 16); check(Pg, P.value(16, 'IE') * 1.5);
console.log((Pg.streak === 0 ? '  ✓ ' : '  ✗ ') + '猜錯（誤差 50%）後連續猜中歸零');
if (Pg.streak !== 0) bad++;
// 藏起來的元素被選到時，選元素的任務不算
fresh(); Pg = page(); startRound(Pg, 'EN', 9);
if (Pg.events.includes('periodic-trends-1')) { console.log('  ✗ 猜猜看自動選到 F（電負度藏起來）也算了任務 1'); bad++; } else console.log('  ✓ 猜猜看自動選到 F、電負度還藏著時，不算任務 1');

// ---------- 隱藏任務 ----------
fresh(); Pg = page();
for (let k = 0; k < 107; k++) { Pg.acted = true; Pg.Z = Pg.Z < P.N ? Pg.Z + 1 : 1; report(Pg); }
report2('按「下一個」走到 Og（118 號）', Pg, ['periodic-trends-h1']);
fresh(); Pg = page();
setProp(Pg, 'EN'); select(Pg, 79);
report2('依電負度著色、選 Au（' + P.EL[79].EN + '，金屬中最大：' + P.EL[P.extremes('EN', P.isMetal).max].sym + '）', Pg, ['periodic-trends-h2']);

const hid = id => /-h\d+$/.test(id);
function reportH(msg, Pg, id) {
  const extra = Pg.events.filter(x => hid(x) && x !== id);
  report2(msg + (extra.length ? '　← 順便完成了 ' + extra.join('、') : ''), Pg, [id]);
  if (extra.length) bad++;
}
const v = (Z, p) => P.value(Z, p);
fresh(); Pg = page(); setProp(Pg, 'mp'); select(Pg, 31);
reportH('依熔點著色、選 Ga（' + v(31, 'mp').toFixed(1) + ' °C，低於體溫 37 °C）', Pg, 'periodic-trends-h4');
fresh(); Pg = page(); setProp(Pg, 'mp'); select(Pg, 74);
reportH('依熔點著色、選 W（' + v(74, 'mp').toFixed(0) + ' °C，金屬中最高：' + P.EL[P.extremes('mp', P.isMetal).max].sym + '）', Pg, 'periodic-trends-h5');
fresh(); Pg = page(); setProp(Pg, 'rho'); select(Pg, 76);
reportH('依密度著色、選 Os（' + v(76, 'rho') + ' g/cm3，Ir ' + v(77, 'rho') + '）', Pg, 'periodic-trends-h6');
fresh(); Pg = page(); setProp(Pg, 'r'); setTab(Pg, 'group'); select(Pg, 31);
reportH('同族圖、原子半徑、第 13 族選 Ga（' + v(31, 'r') + ' pm，比上一列的 Al ' + v(13, 'r') + ' pm 還小：d 區收縮）', Pg, 'periodic-trends-h7');
fresh(); Pg = page(); setProp(Pg, 'IE'); setTab(Pg, 'period'); select(Pg, 7);
reportH('同週期圖、游離能、選 N（' + v(7, 'IE').toFixed(0) + '，比 O 的 ' + v(8, 'IE').toFixed(0) + ' 大：2p 半滿）', Pg, 'periodic-trends-h8');
fresh(); Pg = page(); setProp(Pg, 'r'); setTab(Pg, 'group'); select(Pg, 72);
reportH('同族圖、原子半徑、第 4 族選 Hf（' + v(72, 'r') + ' pm，和上一列的 Zr ' + v(40, 'r') + ' pm 幾乎一樣：鑭系收縮）', Pg, 'periodic-trends-h9');
fresh(); Pg = page(); setProp(Pg, 'IE'); setTab(Pg, 'group'); select(Pg, 87);
reportH('同族圖、游離能、第 1 族選 Fr（' + v(87, 'IE').toFixed(1) + '，比上一列的 Cs ' + v(55, 'IE').toFixed(1) + ' 大：相對論效應）', Pg, 'periodic-trends-h10');
// 反例：著色性質不對、圖表分頁不對都不算
fresh(); Pg = page(); setProp(Pg, 'r'); select(Pg, 31); select(Pg, 74); select(Pg, 76); setTab(Pg, 'period'); select(Pg, 72); select(Pg, 87); setProp(Pg, 'mp'); setTab(Pg, 'group'); select(Pg, 7);
{ const h = Pg.events.filter(hid); console.log((h.length ? '  ✗ ' : '  ✓ ') + '著色性質或圖表分頁不對時，這些元素都不算隱藏任務' + (h.length ? '：' + h.join('、') : '')); if (h.length) bad++; }
// 猜猜看正藏著 Fr 的游離能時選到它：不算 h10
fresh(); Pg = page(); setProp(Pg, 'IE'); setTab(Pg, 'group'); Pg.game = { Z: 87, prop: 'IE', revealed: false }; select(Pg, 87);
{ const ok = !Pg.events.includes('periodic-trends-h10'); console.log((ok ? '  ✓ ' : '  ✗ ') + '猜猜看藏著 Fr 的游離能時選到它，不算 h10'); if (!ok) bad++; }
// 每種性質、每個分頁都把 118 個元素點一遍：只會在對的性質與分頁完成
{
  const hits = {};
  ['r', 'IE', 'EN', 'mp', 'rho', 'cat'].forEach(p => ['z', 'period', 'group'].forEach(t => {
    fresh(); Pg = page(); setProp(Pg, p); setTab(Pg, t);
    for (let Z = 1; Z <= P.N; Z++) select(Pg, Z);
    Pg.events.filter(hid).forEach(id => { hits[id] = (hits[id] || 0) + 1; });
  }));
  console.log('    （每種性質 × 每個分頁都把 118 個元素點一遍，完成隱藏任務的次數：' + Object.keys(hits).sort().map(k => k.replace('periodic-trends-', '') + '×' + hits[k]).join('、') + '）');
}

// ---------- 總結 ----------
const missing = missions.filter(m => !done[m.id]).map(m => m.id);
console.log(missing.length ? '  ✗ 沒有證明到的任務：' + missing.join('、') : '  ✓ ' + missions.length + ' 個任務都證明做得到');
if (missing.length) bad++;
const stars = missions.reduce((s, m) => s + (m.hidden ? m.level * 2 : m.level), 0);
console.log('    （公開 ' + missions.filter(m => !m.hidden).reduce((s, m) => s + m.level, 0) + ' 顆星、隱藏 ' + missions.filter(m => m.hidden).reduce((s, m) => s + m.level * 2, 0) + ' 顆星，共 ' + stars + ' 顆）');
if (bad) { console.log('失敗 ' + bad + ' 項'); process.exitCode = 1; }
