/* 任務可達成的證明腳本。用法：node tools/mission-proofs/energy-flow.js
 * 用核心（js/energy-flow-core.js）的 eventData 做出頁面送出的 'flow' 事件（頁面也呼叫同一個函式），
 * 再用任務檔（js/missions/energy-flow.js）同一份 check 判定。每個任務都給出一組做得到的設定（數值都照滑桿的精度：
 * 百分比到小數 1 位、光合效率到 0.01%），並檢查：預設與三個預設組（任何層數、任何金字塔）不會誤觸隱藏任務；
 * 隱藏任務的解彼此不會順便完成另一個隱藏任務。修改核心、頁面的事件或任務條件後重跑。 */
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..', '..') + '/';
const K = require(ROOT + 'js/energy-flow-core.js');

const defs = [];
const fakeLM = { register: function (id, list) { list.forEach(m => defs.push(Object.assign({ mem: {} }, m))); } };
new Function('window', 'LabMission', fs.readFileSync(ROOT + 'js/missions/energy-flow.js', 'utf8'))({ LabMission: fakeLM }, fakeLM);
const byId = {};
defs.forEach(m => { byId[m.id.replace('energy-flow-', '')] = m; });
const check = (id, ev) => byId[id].check(ev, {});
const HID = defs.filter(m => m.hidden).map(m => m.id.replace('energy-flow-', ''));

const out = [];
let fail = 0;
function claim(ok, msg) { out.push((ok ? '✓ ' : '✗ ') + msg); if (!ok) fail++; }
const g = (v) => (v == null || !isFinite(v)) ? '—' : Number(v.toPrecision(4)).toString();

/** 從預設組出發，套用 set（第 n 階用 'ce3' 這種寫法，百分比直接寫數字） */
function make(preset, set) {
  const p = K.params(preset || 'grass');
  Object.keys(set || {}).forEach(k => {
    const v = set[k], m = /^(ce|ae|pe|pb|mass)(\d)$/.exec(k);
    if (m) p.lv[+m[2] - 1][m[1]] = (m[1] === 'pb' || m[1] === 'mass') ? v : v / 100;
    else if (k === 'N' || k === 'I' || k === 'bcf') p[k] = v;
    else p[k] = v / 100;       // eps、rp、dec、alpha、elim 都是百分比
  });
  return p;
}
const ev = (p, view) => ({ type: 'flow', data: K.eventData(p, view) });
function solve(id, preset, set, view, note) {
  const e = ev(make(preset, set), view);
  const ok = check(id, e);
  const others = HID.filter(h => h !== id && check(h, e));
  claim(ok, `任務 ${id}：${note}`);
  if (byId[id].hidden) claim(others.length === 0, `任務 ${id} 的解不會順便完成其他隱藏任務` + (others.length ? '（也完成了 ' + others.join('、') + '）' : ''));
  return e.data;
}

// ---------- 一般任務 ----------
solve('1', 'grass', { N: 5 }, 'energy', '草原加上大冠鷲（N = 5）');
let d = solve('2', 'grass', { eps: 2 }, 'energy', '光合效率 2%');
out.push(`    GPP = ${g(d.GPP)} kJ/m²/年`);
d = solve('3', 'grass', { ce2: 50, ae2: 40 }, 'energy', '蚱蜢吃掉 50%、同化 40%（植物淨生產是 GPP 的一半）');
out.push(`    E2 = ${g(d.E[1] * 100)}%`);
d = solve('4', 'ocean', {}, 'biomass', '選「海洋」看生物量金字塔');
out.push(`    浮游植物 ${g(d.bio[0])} g/m²、浮游動物 ${g(d.bio[1])} g/m²`);
d = solve('5', 'grass', { alpha: 30, elim: 90 }, 'poll', 'α = 30%、e = 90%');
out.push(`    每一階的放大倍數 ${d.bmf.slice(1).map(g).join('、')}`);
d = solve('6', 'forest', {}, 'numbers', '選「森林」看個體數金字塔');
out.push(`    樹 ${g(d.num[0])} 棵/m²、毛毛蟲 ${g(d.num[1])} 隻/m²`);
d = solve('7', 'forest', { N: 5 }, 'poll', '森林、5 個營養階層（兩階都是溫血的鳥）');
out.push(`    頂端是水的 ${g(d.conc[4])} 倍`);
d = solve('8', 'grass', { ce2: 61 }, 'energy', '草原、蚱蜢吃掉 61%');
out.push(`    A4/GPP = ${g(d.A[3] / d.GPP * 100)}%`);
d = solve('9', 'grass', { N: 6, ce2: 60, ce3: 60, ce4: 60, ce5: 60, ce6: 60, pe2: 35, pe3: 35, pe4: 35, pe5: 35, pe6: 35 }, 'energy', '6 階、每階吃掉 60%、生產效率 35%（外溫動物）');
out.push(`    P6 = ${g(d.P[5])} kJ/m²/年`);
d = solve('10', 'grass', { rp: 57.6, ce2: 50, ae2: 76, pe2: 44, ce3: 30, ae3: 80, pe3: 19, ce4: 40, ae4: 80, pe4: 28 }, 'energy',
  '植物呼吸 57.6%；草食 50%×76%×44%；肉食 30%×80%×19%；頂級 40%×80%×28%');
out.push(`    比例 ${g(d.NPP / d.GPP)}、${g(d.P[1] / d.P[0])}、${g(d.P[2] / d.P[1])}、${g(d.P[3] / d.P[2])}（目標 ${g(8833 / 20810)}、${g(1478 / 8833)}、${g(67 / 1478)}、${g(6 / 67)}）`);
claim(!check('10', ev(make('grass', { rp: 57.6, ce2: 50, ae2: 76, pe2: 44, ce3: 30, ae3: 80, pe3: 19, ce4: 40, ae4: 80, pe4: 20 }))), '任務 10：頂級的比例差太多不算');

// ---------- 隱藏任務 ----------
solve('h1', 'grass', { N: 1, dec: 100 }, 'energy', '只留生產者、分解者分解 100%');
d = solve('h2', 'grass', { rp: 10, dec: 10 }, 'energy', '植物呼吸 10%、分解者只分解 10%');
out.push(`    累積 ${g(d.store)}、熱 ${g(d.heat)} kJ/m²/年`);
d = solve('h3', 'forest', { ce2: 1 }, 'energy', '森林、毛毛蟲只吃掉 1%');
out.push(`    碎屑 ÷ 吃進去 = ${g(d.D / d.ing)}`);
solve('h4', 'grass', { ce2: 10, ce3: 90, ce4: 90 }, 'energy', '蚱蜢只吃 10%，青蛙與蛇各吃掉 90%');
solve('h5', 'grass', { alpha: 100, elim: 0, ce2: 100, ce3: 100, ce4: 100 }, 'poll', 'α = 100%、e = 0，每一階都把下面吃光');
d = solve('h6', 'grass', { N: 6, mass6: 2e5 }, 'energy', '6 階、頂端是 200 kg 的大型掠食者');
out.push(`    每隻需要 ${g(d.area[5] / 1e6)} km²`);
d = solve('h7', 'ocean', { pb1: 1000 }, 'biomass', '海洋、浮游植物周轉率 1000/年（約 9 小時換一次）');
out.push(`    浮游動物是浮游植物的 ${g(d.bio[1] / d.bio[0])} 倍重`);
d = solve('h8', 'grass', { N: 3, eps: 0.1, rp: 50, ce2: 38, ae2: 70, pe2: 55.8, ce3: 50, ae3: 80 }, 'energy', 'ε = 0.10%、草食 38%×70%、生產 55.8%、肉食 50%×80%');
out.push(`    E2 = ${g(d.E[1] * 100)}%、E3 = ${g(d.E[2] * 100)}%`);
d = solve('h9', 'ocean', { N: 4, pb1: 300, pb3: 0.1, ce4: 100, ae4: 95, pb4: 0.01 }, 'biomass', '海洋 4 階：浮游植物 300/年、小魚 0.1/年、鯖魚吃光小魚、同化 95%、周轉 0.01/年');
out.push(`    生物量 ${d.bio.map(g).join(' < ')} g/m²`);
d = solve('h10', 'grass', { N: 6, I: 1e7, eps: 5, rp: 10, ce2: 100, ce3: 100, ce4: 100, ce5: 100, ce6: 100, ae2: 90, ae3: 90, ae4: 90, ae5: 90, ae6: 90, pe2: 50, pe3: 50, pe4: 50, pe5: 50, pe6: 50 }, 'energy',
  '日照 10⁷、ε 5%、植物呼吸 10%，每階吃光、同化 90%、生產 50%');
out.push(`    P6 = ${g(d.P[5])} kJ/m²/年`);
claim(check('9', ev(make('grass', { N: 6, I: 1e7, eps: 5, rp: 10, ce2: 100, ce3: 100, ce4: 100, ce5: 100, ce6: 100, ae2: 90, ae3: 90, ae4: 90, ae5: 90, ae6: 90, pe2: 50, pe3: 50, pe4: 50, pe5: 50, pe6: 50 }))), '（h10 的設定也滿足一般任務 9，這是預期的：一般任務不在「互不連帶」的範圍）');

// 任務 9 的解不會順便完成 h10
claim(!check('h10', ev(make('grass', { N: 6, ce2: 60, ce3: 60, ce4: 60, ce5: 60, ce6: 60, pe2: 35, pe3: 35, pe4: 35, pe5: 35, pe6: 35 }))), '任務 9 的解不會順便完成 h10');

// ---------- 預設與預設組：不誤觸隱藏任務；一般任務只有預期的那幾個 ----------
{
  const views = ['energy', 'biomass', 'numbers', 'poll'];
  const hitH = new Set(), hitPub = new Set();
  ['grass', 'ocean', 'forest'].forEach(pr => {
    for (let N = 1; N <= 6; N++) views.forEach(v => {
      const e = ev(make(pr, { N: N }), v);
      HID.forEach(h => { if (check(h, e)) hitH.add(h + '（' + pr + '、N = ' + N + '、' + v + '）'); });
      defs.filter(m => !m.hidden).forEach(m => { const id = m.id.replace('energy-flow-', ''); if (check(id, e)) hitPub.add(id); });
    });
  });
  claim(hitH.size === 0, '三個預設組、1–6 階、四種金字塔都不會完成隱藏任務' + (hitH.size ? '（誤觸：' + [...hitH].join('、') + '）' : ''));
  const expect = ['1', '4', '6', '7'];
  const extra = [...hitPub].filter(x => expect.indexOf(x) < 0);
  claim(extra.length === 0, '預設組只會完成預期的一般任務 ' + expect.join('、') + '（實際：' + [...hitPub].sort().join('、') + '）');
  const e0 = ev(K.params('grass'), 'energy');
  const d0 = defs.filter(m => m.check(e0, {})).map(m => m.id);
  claim(d0.length === 0, '頁面一打開的狀態（草原、4 階、能量金字塔）不會完成任何任務' + (d0.length ? '（' + d0.join('、') + '）' : ''));
}

// ---------- 邊界值 ----------
{
  const e3 = ev(make('grass', { ce2: 50, ae2: 40.4 }));
  claim(check('3', e3), `任務 3：E2 = ${g(e3.data.E[1] * 100)}%（差 0.1 個百分點）也算`);
  claim(!check('3', ev(make('grass', { ce2: 50, ae2: 41 }))), '任務 3：E2 = 10.25% 不算');
  claim(check('h1', ev(make('grass', { N: 1, dec: 100 }))) && !check('h1', ev(make('grass', { N: 1, dec: 99.9 }))), 'h1：分解者 99.9% 不算');
}

const starsOf = m => m.hidden ? 2 * m.level : m.level;
const total = defs.reduce((s, m) => s + starsOf(m), 0), pub = defs.filter(m => !m.hidden).reduce((s, m) => s + m.level, 0);
const hl = defs.filter(m => m.hidden).map(m => m.level);
claim(hl.length === 10 && Math.min.apply(null, hl) >= 3 && hl.filter(x => x >= 7).length >= 3, `隱藏任務 10 個、等級 ${hl.join('、')}（3 級以上、7 級以上有 ${hl.filter(x => x >= 7).length} 個）`);
out.push(`任務 ${defs.length} 個（公開 ${defs.filter(m => !m.hidden).length}、隱藏 ${hl.length}），共 ${total} 顆星（公開 ${pub}，隱藏 ${total - pub}）`);
console.log(out.join('\n'));
if (fail) { console.error(fail + ' 項不成立'); process.exitCode = 1; }
else console.log('全部成立');
