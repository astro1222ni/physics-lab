/* 任務可達成的證明腳本。用法：node tools/mission-proofs/metal-activity.js
 * 用化學核心模擬頁面（js/metal-activity.js）的操作與事件：放入試管、等到觀察完畢（完成 99% 或滿 20 分鐘）送 'observe'，
 * 按「核對排序」送 'rank'；「全部清除」與開新一輪未知金屬會開始新的一段實驗。
 * 確認：每個任務都做得到、預設狀態（只有開頁時的示範試管）不觸發任務、每個隱藏任務的做法只完成它自己這一個隱藏任務，
 * 以及像試玩（tools/playtest.cjs）那樣亂按時，每個隱藏任務的誤觸率 ≤ 0.5%。修改化學核心、頁面事件或任務條件後重跑。 */
'use strict';
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const M = require(__ROOT + 'js/metal-activity-core.js');
let missions = [];
global.LabMission = { register: (m, l) => { missions = l.map(x => Object.assign({}, x)); } };
global.window = { LabMission: global.LabMission };
require(__ROOT + 'js/missions/metal-activity.js');

let bad = 0;
const done = {};
const hid = id => /-h\d+$/.test(id);
function fresh() { missions.forEach(m => { m.done = false; }); }

// ---------- 模擬頁面（與 js/metal-activity.js 的 insert／record／clearAll／newRound／checkRank 一致） ----------
const RACK = 6, SPEEDS = [1, 10, 100];
function page(o) {
  o = o || {};
  const P = { metal: 'Fe', liquid: 'Cu', c: 0.1, T: 25, salt: false, phph: false, unknown: false, env: { unk: null }, revealed: false,
    speed: 1, running: true, rack: [], recs: [], tubes: 0, unkTubes: 0, nextId: 1, order: [], acted: !!o.acted, events: [] };
  if (!o.noDemo) {   // 開頁時的示範試管：鐵釘放進 0.10 M Cu2+（不送事件、不算這一段的試管數，但它的結果可以當排序的證據）
    const tb = M.createTube({ metal: 'Fe', liquid: 'Cu', c: 0.1, T: 25, salt: false }, P.env);
    P.rack.push({ tb, t: 0, id: 0, demo: true, phph: false });
  }
  return P;
}
function emit(P, type, data) {
  if (!P.acted) return;
  const ev = { type, data };
  missions.forEach(m => { if (!m.done && m.check(ev)) { m.done = true; P.events.push(m.id); } });
}
function clearAll(P) { P.rack = []; P.recs = []; P.tubes = 0; P.unkTubes = 0; P.order = []; }
function newRound(P, rnd) { P.env.unk = M.newUnknown(rnd); P.revealed = false; clearAll(P); }
function insert(P, o) {
  P.acted = true;
  Object.assign(P, o || {});
  const tb = M.createTube({ metal: P.metal, liquid: P.liquid, c: P.c, T: P.T, salt: P.salt }, P.env);
  if (P.rack.length >= RACK) P.rack.shift();
  const tube = { tb, t: 0, id: P.nextId++, demo: false, phph: P.phph };
  P.rack.push(tube);
  P.tubes++;
  if (tb.unk) P.unkTubes++;
  return tube;
}
function record(P, tube) {
  tube.done = true;
  const rec = Object.assign(M.observe(tube.tb), { id: tube.id, demo: tube.demo, phph: tube.phph });
  P.recs.push(rec);
  if (!tube.demo) emit(P, 'observe', { rec, recs: P.recs.filter(r => !r.demo), tubes: P.tubes, revealed: P.revealed });
  return rec;
}
/** 讓真實時間經過 sec 秒（照目前的播放速度） */
function wait(P, sec) {
  if (!P.running) return;
  P.rack.forEach(tu => {
    if (tu.done) return;
    tu.t += sec * SPEEDS[P.speed];
    if (tu.t >= tu.tb.tRec) record(P, tu);
  });
}
/** 放一支試管並等到它觀察完畢 */
function run(P, o) { const tu = insert(P, o); wait(P, M.T_OBS / SPEEDS[P.speed] + 1); return tu; }
function rank(P, order) {
  P.acted = true;
  const j = M.judge(order, P.recs, P.env);
  const xyz = ['X', 'Y', 'Z'].every(s => order.indexOf(s) >= 0);
  emit(P, 'rank', { order: order.slice(), ok: j.ok, supported: j.supported, conflicts: j.conflicts.length, n: order.length, hasXYZ: xyz,
    tubes: P.tubes, unkTubes: P.unkTubes, revealed: P.revealed });
  return j;
}
function report(name, P, ids, onlyHidden) {
  const got = P.events;
  let okk = ids.every(id => got.includes(id));
  const extraHidden = got.filter(id => hid(id) && !ids.includes(id));
  if (onlyHidden && extraHidden.length) okk = false;
  ids.forEach(id => { if (got.includes(id)) done[id] = true; });
  console.log('  ' + (okk ? '✓' : '✗') + ' ' + name + '：' + (got.length ? got.join('、') : '（沒有任務）') + (extraHidden.length && onlyHidden ? '　← 順便完成了 ' + extraHidden.join('、') : ''));
  if (!okk) bad++;
}
const f2 = x => (+x).toFixed(2);

// ---------- 0. 預設狀態不觸發任務 ----------
console.log('— 預設狀態 —');
fresh();
{
  const P = page();
  for (let k = 0; k < 600; k++) wait(P, 1);   // 示範試管跑完，沒有任何操作
  report('只開頁面、等 10 分鐘（示範試管觀察完畢）', P, []);
  if (P.events.length) bad++;
}

// ---------- 1. 一般任務 ----------
console.log('— 一般任務 —');
fresh();
{
  const P = page();
  const a = run(P, { metal: 'Zn', liquid: 'Cu', c: 0.1 });
  run(P, { metal: 'Mg', liquid: 'HCl', c: 0.5 });
  run(P, { metal: 'Cu', liquid: 'Ag', c: 0.1 });
  run(P, { metal: 'Cu', liquid: 'Zn', c: 0.1 });
  report('鋅片進 0.10 M Cu2+、鎂片進 0.50 M 鹽酸（H2 ' + f2(P.recs.find(r => r.liquid === 'HCl').h2) + ' mL）、銅片進 Ag+、銅片進 Zn2+', P,
    ['metal-activity-1', 'metal-activity-2', 'metal-activity-3', 'metal-activity-4']);
  void a;
}
{
  fresh();
  const P = page();
  const tu = run(P, { metal: 'Cu', liquid: 'Ag', c: 0.3 });
  report('銅片進 0.30 M Ag+：金屬片變重 ' + f2(M.observe(tu.tb).dm) + ' mg', P, ['metal-activity-5']);
}
{
  fresh();
  const P = page();
  run(P, { metal: 'Na', liquid: 'H2O', phph: true });
  report('純水加酚酞、放鈉：pH ' + f2(P.recs[P.recs.length - 1].pH), P, ['metal-activity-6']);
}
{
  fresh();
  const P = page();
  ['Zn/Fe', 'Fe/Sn', 'Mg/Zn', 'Sn/Pb', 'Pb/Cu'].forEach(k => { const p = k.split('/'); run(P, { metal: p[0], liquid: p[1], c: 0.1 }); });
  rank(P, ['Zn', 'Fe', 'Sn']);
  rank(P, ['Mg', 'Zn', 'Fe', 'Sn', 'Pb', 'Cu']);
  report('五支置換試管，排 Zn > Fe > Sn，再排 Mg > Zn > Fe > Sn > Pb > Cu', P, ['metal-activity-7', 'metal-activity-8']);
}
{
  // 未知金屬：每一種排列都要做得到，而且不超過 3 支試管
  fresh();
  let worst = 0, okAll = true;
  let seed = 2026;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let k = 0; k < 120; k++) {
    const P = page();
    P.unknown = true; newRound(P, rnd);
    // 策略：先 X 放進 Y2+；有反應 → X > Y，否則 Y > X。再拿「目前最活潑的」放進第三種的離子，必要時再一支
    const u = P.env.unk;
    const test = (a, b) => { run(P, { metal: a, liquid: b, c: 0.1 }); return P.recs[P.recs.length - 1].disp === 'yes'; };
    let order = test('X', 'Y') ? ['X', 'Y'] : ['Y', 'X'];
    // 插入 Z：和中間比，再和一端比（二分插入，最多 2 支）
    if (test('Z', order[0])) order = ['Z'].concat(order);
    else if (test('Z', order[1])) order = [order[0], 'Z', order[1]];
    else order = order.concat(['Z']);
    const j = rank(P, order);
    if (!j.ok || !j.supported || P.unkTubes > 3) okAll = false;
    worst = Math.max(worst, P.unkTubes);
    if (k === 0) { P.events.forEach(id => { done[id] = true; }); }
    void u;
  }
  missions.forEach(m => { if (m.id === 'metal-activity-9' || m.id === 'metal-activity-10') m.done = false; });
  console.log('  ' + (okAll ? '✓' : '✗') + ' 未知金屬 120 輪：二分插入法每輪最多 ' + worst + ' 支試管就排對（任務 9、10）');
  if (okAll) { done['metal-activity-9'] = true; done['metal-activity-10'] = true; } else bad++;
}
{
  fresh();
  const P = page();
  // 鹼金屬看冷水的劇烈程度；鈣 > 鎂 用冷水；其餘用置換（鋁要加鹽）
  [['K', 'H2O'], ['Na', 'H2O'], ['Ca', 'H2O'], ['Mg', 'H2O'], ['Mg', 'Al'], ['Al', 'Zn', true], ['Zn', 'Fe'], ['Fe', 'Sn'], ['Sn', 'Pb'], ['Pb', 'Cu'], ['Cu', 'Ag']]
    .forEach(p => run(P, { metal: p[0], liquid: p[1], c: 0.1, T: 25, salt: !!p[2] }));
  const j = rank(P, ['K', 'Na', 'Ca', 'Mg', 'Al', 'Zn', 'Fe', 'Sn', 'Pb', 'Cu', 'Ag']);
  report('11 支試管排出完整的活性序（' + (j.ok && j.supported ? '正確、有證據' : '不成立') + '；用 ' + P.tubes + ' 支）', P, ['metal-activity-11']);
}

// ---------- 2. 隱藏任務：每個做法只完成自己 ----------
console.log('— 隱藏任務（每個做法都在新的頁面上做，只能完成它自己這一個隱藏任務） —');
const H = {
  'metal-activity-h1': ['鋅片進 0.15 M Cu2+（析出 94 mg 銅，金屬片只輕 2.7 mg）', P => run(P, { metal: 'Zn', liquid: 'Cu', c: 0.15 })],
  'metal-activity-h2': ['鐵片進 0.10 M 與 0.40 M Cu2+（一次 Cu2+ 用完、一次鐵片溶完）', P => { run(P, { metal: 'Fe', liquid: 'Cu', c: 0.1 }); run(P, { metal: 'Fe', liquid: 'Cu', c: 0.4 }); }],
  'metal-activity-h3': ['鎂片進 25 °C 與 80 °C 的純水', P => { run(P, { metal: 'Mg', liquid: 'H2O', T: 25 }); run(P, { metal: 'Mg', liquid: 'H2O', T: 80 }); }],
  'metal-activity-h4': ['鎂片進 0.40 M 鹽酸（2.0 mmol Mg 剛好用掉 4.0 mmol H+）', P => run(P, { metal: 'Mg', liquid: 'HCl', c: 0.4 })],
  'metal-activity-h5': ['鈉、鈣各放進 25 °C 的純水', P => { run(P, { metal: 'Na', liquid: 'H2O' }); run(P, { metal: 'Ca', liquid: 'H2O' }); }],
  'metal-activity-h6': ['鋁片進 Cu2+：不加鹽、再加鹽', P => { run(P, { metal: 'Al', liquid: 'Cu', salt: false }); run(P, { metal: 'Al', liquid: 'Cu', salt: true }); }],
  'metal-activity-h7': ['鉛片進 1.0 M 鹽酸、銅片進 1.0 M 鹽酸', P => { run(P, { metal: 'Pb', liquid: 'HCl', c: 1 }); run(P, { metal: 'Cu', liquid: 'HCl', c: 1 }); }],
  'metal-activity-h8': ['鐵片進 Cu2+；鈉放進加了酚酞的 0.03 M Cu2+', P => { run(P, { metal: 'Fe', liquid: 'Cu', c: 0.1 }); run(P, { metal: 'Na', liquid: 'Cu', c: 0.03, phph: true }); }],
  'metal-activity-h9': ['錫片進 Pb2+、鉛片進 Sn2+（25 °C、0.10 M）', P => { run(P, { metal: 'Sn', liquid: 'Pb', c: 0.1 }); run(P, { metal: 'Pb', liquid: 'Sn', c: 0.1 }); }],
  'metal-activity-h10': ['全部清除後 7 支試管：Mg→Al3+、Al（加鹽）→Zn2+、Zn→Fe2+、Fe→Sn2+、Sn→Pb2+、Pb→Cu2+、Cu→Ag+，再排八種', P => {
    clearAll(P);
    [['Mg', 'Al'], ['Al', 'Zn', true], ['Zn', 'Fe'], ['Fe', 'Sn'], ['Sn', 'Pb'], ['Pb', 'Cu'], ['Cu', 'Ag']].forEach(p => run(P, { metal: p[0], liquid: p[1], c: 0.1, salt: !!p[2] }));
    rank(P, ['Mg', 'Al', 'Zn', 'Fe', 'Sn', 'Pb', 'Cu', 'Ag']);
  }]
};
Object.keys(H).forEach(id => {
  fresh();
  const P = page();
  H[id][1](P);
  report(id + '：' + H[id][0], P, [id], true);
});

// ---------- 3. 反例：差一點的做法不算 ----------
console.log('— 反例 —');
const counter = [
  ['h1 不算：鋅片進預設 0.10 M Cu2+（析出 63 mg，未達 70 mg）', P => run(P, { metal: 'Zn', liquid: 'Cu', c: 0.1 }), 'metal-activity-h1'],
  ['h1 不算：鐵片進 0.15 M Cu2+（質量變化 11 mg，超過析出量 5%）', P => run(P, { metal: 'Fe', liquid: 'Cu', c: 0.15 }), 'metal-activity-h1'],
  ['h2 不算：同一支試管的條件只做一次', P => run(P, { metal: 'Fe', liquid: 'Cu', c: 0.4 }), 'metal-activity-h2'],
  ['h3 不算：鎂只放冷水', P => { run(P, { metal: 'Mg', liquid: 'H2O', T: 25 }); run(P, { metal: 'Mg', liquid: 'H2O', T: 30 }); }, 'metal-activity-h3'],
  ['h4 不算：鎂片進 0.50 M 鹽酸（H+ 多了 20%）', P => run(P, { metal: 'Mg', liquid: 'HCl', c: 0.5 }), 'metal-activity-h4'],
  ['h5 不算：鈉 25 °C、鈣 60 °C（溫度不同）', P => { run(P, { metal: 'Na', liquid: 'H2O', T: 25 }); run(P, { metal: 'Ca', liquid: 'H2O', T: 60 }); }, 'metal-activity-h5'],
  ['h6 不算：鋁片只加鹽做一次', P => run(P, { metal: 'Al', liquid: 'Cu', salt: true }), 'metal-activity-h6'],
  ['h7 不算：鉛片進 0.10 M 鹽酸（太慢、看不出氣泡）', P => { run(P, { metal: 'Pb', liquid: 'HCl', c: 0.1 }); run(P, { metal: 'Cu', liquid: 'HCl', c: 0.1 }); }, 'metal-activity-h7'],
  ['h8 不算：鈉進 0.10 M Cu2+（OH- 不夠，酚酞不變色）', P => { run(P, { metal: 'Fe', liquid: 'Cu' }); run(P, { metal: 'Na', liquid: 'Cu', c: 0.1, phph: true }); }, 'metal-activity-h8'],
  ['h8 不算：沒有別的金屬從 Cu2+ 置換出銅（只靠示範試管）', P => run(P, { metal: 'Na', liquid: 'Cu', c: 0.03, phph: true }), 'metal-activity-h8'],
  ['h9 不算：只做錫片進 Pb2+', P => run(P, { metal: 'Sn', liquid: 'Pb', c: 0.1 }), 'metal-activity-h9'],
  ['h10 不算：多做了一支（8 支試管）', P => {
    clearAll(P);
    [['Mg', 'Al'], ['Al', 'Zn'], ['Al', 'Zn', true], ['Zn', 'Fe'], ['Fe', 'Sn'], ['Sn', 'Pb'], ['Pb', 'Cu'], ['Cu', 'Ag']].forEach(p => run(P, { metal: p[0], liquid: p[1], c: 0.1, salt: !!p[2] }));
    rank(P, ['Mg', 'Al', 'Zn', 'Fe', 'Sn', 'Pb', 'Cu', 'Ag']);
  }, 'metal-activity-h10'],
  ['h10 不算：鋁不加鹽（只有反過來的錯誤證據）', P => {
    clearAll(P);
    [['Mg', 'Al'], ['Al', 'Zn'], ['Zn', 'Fe'], ['Fe', 'Sn'], ['Sn', 'Pb'], ['Pb', 'Cu'], ['Cu', 'Ag']].forEach(p => run(P, { metal: p[0], liquid: p[1], c: 0.1 }));
    rank(P, ['Mg', 'Al', 'Zn', 'Fe', 'Sn', 'Pb', 'Cu', 'Ag']);
  }, 'metal-activity-h10']
];
counter.forEach(c => {
  fresh();
  const P = page();
  c[1](P);
  const hit = P.events.includes(c[2]);
  console.log('  ' + (hit ? '✗' : '✓') + ' ' + c[0] + (hit ? '：卻完成了' : ''));
  if (hit) bad++;
});

// ---------- 4. 像試玩那樣亂按 ----------
// 照 tools/playtest.cjs：先把每個按鈕、勾選框都點一次（DOM 順序），再隨機 150 步，權重 按鈕 30、滑桿 25、數字欄 10、勾選 8、畫布 15、等待 4；
// 滑桿取隨機位置、最小或最大；數字欄打極端值；每一步約 0.5 秒真實時間（等待 2 秒）。
console.log('— 亂按（像試玩那樣）—');
{
  let a = 1112;
  const rnd = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
  const pick = arr => arr[Math.floor(rnd() * arr.length)];
  const RUNS = 6000, STEPS = 150;
  const hits = {}, pubHits = {};
  const cPos = p => Math.pow(10, Math.log10(0.01) + p * (Math.log10(2) - Math.log10(0.01)));
  const sliderVal = (kind, min, max) => { const x = rnd(); return x < 0.2 ? min : x < 0.4 ? max : min + (max - min) * rnd(); };
  for (let run_ = 0; run_ < RUNS; run_++) {
    fresh();
    const P = page();
    const metals = () => M.KNOWN.concat(P.unknown ? M.UNK : []);
    const liquids = () => ['H2O', 'HCl'].concat(M.ION_LIQ, P.unknown ? M.UNK : []);
    const chips = () => { const s = new Set(); P.recs.forEach(r => { s.add(r.metal); if (r.kind === 'ion') s.add(r.liquid); }); return [...s].filter(x => P.order.indexOf(x) < 0); };
    const buttons = () => {
      const b = [];
      metals().forEach(m => b.push(['metal', m]));
      liquids().forEach(l => b.push(['liquid', l]));
      b.push(['insert'], ['play'], ['speed', 0], ['speed', 1], ['speed', 2], ['clear'], ['sound'], ['view2d'], ['view3d'], ['tab'], ['tab'], ['undo'], ['reset'], ['check'], ['details']);
      if (P.unknown) b.push(['round'], ['reveal']);
      chips().forEach(c => b.push(['chip', c]));
      return b;
    };
    const press = btn => {
      P.acted = true;
      switch (btn[0]) {
        case 'metal': P.metal = btn[1]; break;
        case 'liquid': P.liquid = btn[1]; break;
        case 'insert': insert(P); break;
        case 'play': P.running = !P.running; break;
        case 'speed': P.speed = btn[1]; break;
        case 'clear': clearAll(P); break;
        case 'undo': P.order.pop(); break;
        case 'reset': P.order = []; break;
        case 'check': if (P.order.length >= 2) rank(P, P.order); break;
        case 'round': newRound(P, rnd); break;
        case 'reveal': P.revealed = true; break;
        case 'chip': P.order.push(btn[1]); break;
        default: break;
      }
    };
    const toggle = k => {
      P.acted = true;
      if (k === 'salt') P.salt = !P.salt;
      else if (k === 'phph') P.phph = !P.phph;
      else { P.unknown = !P.unknown; if (P.unknown) newRound(P, rnd); else { P.env.unk = null; clearAll(P); if (M.UNK.includes(P.metal)) P.metal = 'Fe'; if (M.UNK.includes(P.liquid)) P.liquid = 'Cu'; } }
      wait(P, 0.5);
    };
    // 第一輪：每個按鈕、勾選框各點一次
    buttons().forEach(b => { press(b); wait(P, 0.4); });
    ['salt', 'phph', 'unknown'].forEach(toggle);
    buttons().forEach(b => { if (b[0] === 'metal' || b[0] === 'liquid' || b[0] === 'round' || b[0] === 'reveal') { press(b); wait(P, 0.4); } });
    // 亂按
    for (let k = 0; k < STEPS; k++) {
      const x = rnd() * 100;
      if (x < 30) press(pick(buttons()));
      else if (x < 55) { P.acted = true; if (rnd() < 0.5) P.c = cPos(sliderVal('c', 0, 1)); else P.T = Math.round(sliderVal('T', 5, 95)); }
      else if (x < 65) { P.acted = true; const v = pick([-1, 0, 1e9, 0.01, 2, 5, 95, 1e-9, 50]); if (rnd() < 0.5) P.c = Math.min(2, Math.max(0.01, v)); else P.T = Math.min(95, Math.max(5, Math.round(v))); }
      else if (x < 73) toggle(pick(['salt', 'phph', 'unknown']));
      else if (x < 88) { P.acted = true; }   // 點畫布：只會選取試管
      else { wait(P, 2); continue; }
      wait(P, 0.5);
    }
    P.events.forEach(id => { if (hid(id)) hits[id] = (hits[id] || 0) + 1; else pubHits[id] = (pubHits[id] || 0) + 1; });
  }
  let worst = 0;
  missions.filter(m => m.hidden).forEach(m => {
    const r = (hits[m.id] || 0) / RUNS;
    worst = Math.max(worst, r);
    console.log('    ' + (r <= 0.005 ? '✓' : '✗') + ' ' + m.id + '（' + m.level + ' 級）誤觸率 ' + (r * 100).toFixed(2) + '%（' + (hits[m.id] || 0) + '／' + RUNS + ' 回）');
    if (r > 0.005) bad++;
  });
  console.log('  亂按 ' + RUNS + ' 回（每回先全部點一次、再隨機 ' + STEPS + ' 步）：隱藏任務誤觸率最高 ' + (worst * 100).toFixed(2) + '%（上限 0.5%）');
  console.log('    （參考：一般任務被亂按完成的比例 ' + missions.filter(m => !m.hidden).map(m => m.id.replace('metal-activity-', '#') + ' ' + ((pubHits[m.id] || 0) / RUNS * 100).toFixed(1) + '%').join('、') + '）');
}

// ---------- 總結 ----------
const missing = missions.filter(m => !done[m.id]).map(m => m.id);
console.log(missing.length ? '  ✗ 沒有證明到的任務：' + missing.join('、') : '  ✓ ' + missions.length + ' 個任務都證明做得到');
if (missing.length) bad++;
const hidden = missions.filter(m => m.hidden);
console.log('    （公開 ' + missions.filter(m => !m.hidden).length + ' 個 ' + missions.filter(m => !m.hidden).reduce((s, m) => s + m.level, 0) + ' 顆星；隱藏 ' + hidden.length + ' 個，等級 ' + hidden.map(m => m.level).join('、') +
  '，7 級以上 ' + hidden.filter(m => m.level >= 7).length + ' 個，' + hidden.reduce((s, m) => s + m.level * 2, 0) + ' 顆星）');
if (hidden.length !== 10 || hidden.filter(m => m.level >= 7).length < 3 || hidden.some(m => m.level < 3 || m.level > 10 || !m.riddle || !m.riddle.zh || !m.riddle.en || m.desc)) { console.log('  ✗ 隱藏任務數量、等級或謎語不合規定'); bad++; }
if (bad) { console.log('失敗 ' + bad + ' 項'); process.exitCode = 1; } else console.log('全部通過');
