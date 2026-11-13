/* 任務可達成的證明腳本。用法：node tools/mission-proofs/law-of-cosines.js
 * 用數學核心證明每個任務在滑桿範圍與精度內做得到（事件格式與 js/law-of-cosines.js 相同），
 * 並確認預設狀態不會觸發任務、亂按不會誤觸隱藏任務、每個隱藏任務的做法只完成它自己（和它本來就包含的公開任務）。
 * 滑桿：邊 a、b、c 1–10（0.1；點數字可輸入到 0.001）、角 A、B 1°–179°（1°；0.001°）。
 * 拖曳模式：頂點靠近 0.5 的格點會吸附，其餘取到 0.05。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const M = require(ROOT + 'js/law-of-cosines-core.js');
const missions = [];
global.window = { LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/law-of-cosines.js');
const byId = id => missions.find(m => m.id === 'law-of-cosines-' + id);
const D2R = Math.PI / 180;

// ---------- 與 js/law-of-cosines.js 的 current() 與 stateData 相同 ----------
function data(S, src) {
  const I = S.inp;
  let ok = false, P = null, nSol = 1, why = '', sols = [];
  if (S.mode === 'free') { P = S.P; ok = M.measure(P.A, P.B, P.C).area > 1e-9; }
  else if (S.mode === 'sss') { sols = M.solveSSS(I.a, I.b, I.c); if (sols.length) { ok = true; P = M.place(I.a, I.b, I.c); } }
  else if (S.mode === 'sas') { sols = M.solveSAS(I.b, I.c, I.A); if (sols.length) { ok = true; P = M.place(sols[0].a, sols[0].b, sols[0].c); } }
  else if (S.mode === 'asa') { sols = M.solveASA(I.A, I.B, I.c); if (sols.length) { ok = true; P = M.place(sols[0].a, sols[0].b, sols[0].c); } }
  else {
    sols = M.solveSSA(I.A, I.b, I.a); nSol = sols.length; why = M.ssaCase(I.A, I.b, I.a, 1e-9).why;
    const Cp = [I.b * Math.cos(I.A * D2R), I.b * Math.sin(I.A * D2R)];
    if (sols.length) { const k = Math.min(S.sel || 0, sols.length - 1); ok = true; P = { A: [0, 0], B: [sols[k].c, 0], C: Cp }; }
  }
  const d = { src: src, mode: S.mode, chal: false, ok: ok, nSol: S.mode === 'ssa' ? nSol : (ok ? 1 : 0), why: why, sel: S.sel || 0, inp: Object.assign({}, I) };
  if (ok) {
    const m = M.measure(P.A, P.B, P.C);
    Object.assign(d, { a: m.a, b: m.b, c: m.c, A: m.A, B: m.B, C: m.C, area: m.area, perimeter: m.perimeter, R: m.R, r: m.r, kind: M.kind(m, 1e-6) });
  }
  if (S.mode === 'ssa' && sols.length) d.ssaRight = sols.map(s => [s.A, s.B, s.C].some(x => Math.abs(x - 90) <= 0.3));
  return { type: 'tri', data: d };
}
const DEF = { mode: 'free', P: { A: [0, 0], B: [6, 0], C: [1.5, 4] }, inp: { a: 5, b: 6, c: 7, A: 70, B: 60 }, sel: 0 };
/** 由預設狀態改成 o（inp 只寫要改的）產生事件；list 可以給好幾步 */
function st(o) { return Object.assign({}, DEF, o, { inp: Object.assign({}, DEF.inp, o.inp || {}), P: o.P || DEF.P }); }
function ev(o, src) { return [data(st(o), src || 'slider')]; }
function guesses(list) {
  let streak = 0; const times = []; const out = [];
  list.forEach(g => {
    if (g.ok === false) { streak = 0; times.length = 0; out.push({ type: 'guess', data: { correct: false, streak: 0, secs: g.secs, last5: NaN } }); return; }
    streak++; times.push(g.secs); if (times.length > 5) times.shift();
    out.push({ type: 'guess', data: { correct: true, streak: streak, secs: g.secs, last5: streak >= 5 ? times.slice(-5).reduce((s, v) => s + v, 0) : NaN } });
  });
  return out;
}

let fail = 0;
function expect(id, events, want, note) {
  const m = byId(id); m.mem = {};
  let ok = false;
  events.forEach(e => { ok = ok || !!m.check(e, m.mem); });
  const pass = ok === want;
  if (!pass) fail++;
  console.log((pass ? '  ✓ ' : '  ✗ ') + String(id).padEnd(3) + (want ? ' 達成：' : ' 不觸發：') + note);
}

// ---------- 預設狀態不觸發（五種模式各切一次、SSA 切換解） ----------
{
  const evs = [];
  ['free', 'sss', 'sas', 'asa', 'ssa'].forEach(mode => { evs.push.apply(evs, ev({ mode: mode }, 'mode')); });
  evs.push.apply(evs, ev({ mode: 'ssa', sel: 1 }, 'ssaSel'));
  const hit = missions.filter(m => { m.mem = {}; return evs.some(e => m.check(e, m.mem)); }).map(m => m.id);
  if (hit.length) { fail++; console.log('  ✗ 預設狀態觸發了 ' + hit.join('、')); }
  else console.log('  ✓ 預設狀態（拖曳 A(0, 0)、B(6, 0)、C(1.5, 4)；a = 5、b = 6、c = 7、A = 70°、B = 60°；SSA 是無解）切到五種模式，都不觸發任何任務');
}

// ---------- 每個任務做得到（以及接近但不算的情況） ----------
const P = (a, b, c) => ({ A: a, B: b, C: c });
expect('1', ev({ P: P([0, 0], [4, 0], [0, 3]) }, 'drag'), true, '拖曳成 (0, 0)、(4, 0)、(0, 3)：A = 90°');
expect('1', ev({ mode: 'sss', inp: { a: 5, b: 4, c: 3 } }), false, 'SSS 3-4-5 不是拖曳模式');
expect('2', ev({ mode: 'sas', inp: { A: 130 } }), true, 'SAS、A = 130°');
expect('2', ev({ mode: 'sas', inp: { A: 115 } }), false, 'A = 115° 不夠鈍');
expect('3', ev({ mode: 'sss', inp: { a: 5, b: 5, c: 5 } }), true, 'SSS 5、5、5');
expect('3', ev({ mode: 'sss', inp: { a: 5, b: 5, c: 5.1 } }), false, '5、5、5.1 不算');
expect('4', ev({ mode: 'sss', inp: { a: 2, b: 3, c: 6 } }), true, 'SSS 2、3、6：2 + 3 < 6');
expect('4', ev({ mode: 'sss', inp: { a: 2, b: 4, c: 6 } }), true, 'SSS 2、4、6：剛好一直線也圍不起來');
expect('5', ev({ mode: 'sas', inp: { A: 90, b: 3, c: 4 } }), true, 'SAS、A = 90°、b = 3、c = 4 → a = 5');
expect('5', ev({ mode: 'sas', inp: { A: 90, b: 4, c: 4 } }), false, 'b = c 不算（那是隱藏任務）');
expect('6', ev({ mode: 'ssa', inp: { A: 30, b: 10, a: 7 }, sel: 1 }, 'ssaSel'), true, 'SSA、A = 30°、b = 10、a = 7（兩解）、按「看另一個解」');
expect('6', ev({ mode: 'ssa', inp: { A: 30, b: 10, a: 7 } }, 'slider'), false, '沒有按切換不算');
expect('7', ev({ mode: 'ssa', inp: { A: 30, b: 6, a: 3 } }), true, 'SSA、A = 30°、b = 6、a = 3 = 6 sin 30°');
expect('7', ev({ mode: 'ssa', inp: { A: 30, b: 6, a: 3.1 } }), false, 'a = 3.1 是兩解');
expect('8', ev({ mode: 'sss', inp: { a: 5, b: 5, c: 5 } }), true, '正三角形邊長 5：周長 15、面積 10.83');
expect('8', ev({ mode: 'sss', inp: { a: 4, b: 5, c: 6 } }), false, '4、5、6：周長 15、面積 9.92 不夠');
expect('9', [].concat(ev({ mode: 'ssa', inp: { A: 30, b: 10, a: 4 } }), ev({ mode: 'ssa', inp: { A: 30, b: 10, a: 7 } }), ev({ mode: 'ssa', inp: { A: 30, b: 10, a: 10 } })), true, 'SSA、A = 30°、b = 10，a = 4、7、10：0、2、1 解');
expect('9', [].concat(ev({ mode: 'ssa', inp: { A: 30, b: 10, a: 4 } }), ev({ mode: 'ssa', inp: { A: 30, b: 9, a: 7 } }), ev({ mode: 'ssa', inp: { A: 30, b: 9, a: 10 } })), false, '中途改了 b 要重算');
expect('10', ev({ mode: 'sss', inp: { a: 3, b: 5, c: 7 } }), true, 'SSS 3、5、7：C = 120°');
expect('10', ev({ mode: 'sss', inp: { a: 3, b: 5, c: 7.1 } }), false, '7.1 不是整數');
expect('11', guesses([{ secs: 50 }, { secs: 60 }, { secs: 40 }]), true, '連續答對 3 題');
expect('11', guesses([{ secs: 50 }, { ok: false, secs: 9 }, { secs: 60 }, { secs: 40 }]), false, '中間答錯要重算');
expect('12', guesses([{ secs: 50 }, { secs: 60 }, { secs: 40 }, { secs: 70 }, { secs: 55 }]), true, '連續 5 題、合計 275 秒');
expect('12', guesses([{ secs: 50 }, { secs: 60 }, { secs: 40 }, { secs: 70 }, { secs: 85 }]), false, '合計 305 秒太慢');

// 隱藏任務
const W = {
  h1: ev({ mode: 'sss', inp: { a: 3, b: 4, c: 5 } }),
  h2: ev({ mode: 'sas', inp: { A: 90, b: 4, c: 4 } }),
  h3: ev({ mode: 'sas', inp: { A: 36, b: 6, c: 6 } }),
  h4: ev({ mode: 'sss', inp: { a: 5, b: 5, c: 6 } }),
  h5: ev({ P: P([0, 0], [6, 0], [3, 5.2]) }, 'key'),
  h6: ev({ mode: 'sss', inp: { a: 3, b: 7, c: 8 } }),
  h7: ev({ mode: 'sss', inp: { a: 4, b: 5, c: 6 } }),
  h8: ev({ mode: 'ssa', inp: { A: 30, b: 6, a: 3.464 } }),
  h9: ev({ mode: 'sss', inp: { a: 5, b: 6.36, c: 8.09 } }),
  h10: ev({ mode: 'asa', inp: { A: 25.714, B: 51.429, c: 5 } })
};
const NOTE = {
  h1: 'SSS 3、4、5（古埃及十二結繩）',
  h2: 'SAS、A = 90°、b = c = 4：等腰直角三角形',
  h3: 'SAS、A = 36°、b = c = 6：黃金三角形（a／b = 1／φ）',
  h4: 'SSS 5、5、6：面積 12（海龍三角形，不是直角）',
  h5: '拖曳模式 A(0, 0)、B(6, 0)，C 拖到 (3, 5) 再按兩下方向鍵上到 (3, 5.2)：三個角 60.02°、60.02°、59.96°',
  h6: 'SSS 3、7、8：B = 60°（cos B = 1／2）',
  h7: 'SSS 4、5、6：C = 2A（cos A = 3／4、cos C = 1／8）',
  h8: 'SSA、A = 30°、b = 6、a = 3.464（打字，= 6 tan 30°）：兩解、其中一個 C = 90°',
  h9: 'SSS 5、6.36、8.09（打字）：克卜勒三角形 1 : √φ : φ',
  h10: 'ASA、A = 25.714°、B = 51.429°（打字）：七邊形三角形 1 : 2 : 4'
};
Object.keys(W).forEach(id => expect(id, W[id], true, NOTE[id]));
expect('h1', ev({ mode: 'sss', inp: { a: 6, b: 8, c: 10 } }), false, '6、8、10 不算（要的是 3、4、5）');
expect('h2', ev({ mode: 'sas', inp: { A: 89, b: 4, c: 4 } }), false, 'A = 89° 不算');
expect('h3', ev({ mode: 'sas', inp: { A: 37, b: 6, c: 6 } }), false, '頂角 37° 不算');
expect('h4', ev({ mode: 'sss', inp: { a: 6, b: 8, c: 10 } }), false, '6、8、10 面積 24 但是直角，不算');
expect('h4', ev({ mode: 'sss', inp: { a: 4, b: 5, c: 6 } }), false, '4、5、6 面積 9.92 不是整數');
expect('h5', ev({ P: P([0, 0], [6, 0], [3, 5]) }, 'drag'), false, 'C = (3, 5)：頂角 61.9° 差太多');
expect('h6', ev({ mode: 'sss', inp: { a: 5, b: 5, c: 5 } }), false, '正三角形不算');
expect('h7', ev({ mode: 'sss', inp: { a: 3, b: 4, c: 5 } }), false, '3、4、5 沒有兩倍的角');
expect('h8', ev({ mode: 'ssa', inp: { A: 30, b: 6, a: 3.5 } }), false, 'a = 3.5：兩解但都沒有直角');
expect('h9', ev({ mode: 'sss', inp: { a: 5, b: 6.4, c: 8.1 } }), false, '5、6.4、8.1 只取到 0.1 不算');
expect('h10', ev({ mode: 'asa', inp: { A: 26, B: 51, c: 5 } }), false, '26°、51° 差太多');

// ---------- 例子的數字都在滑桿範圍內、h5 的頂點落在拖曳的格點上 ----------
{
  const bad = [];
  Object.keys(W).forEach(id => W[id].forEach(e => {
    const I = e.data.inp;
    ['a', 'b', 'c'].forEach(k => { if (I[k] < 1 || I[k] > 10 || !Number.isInteger(Math.round(I[k] * 1000 * 1e6) / 1e6)) bad.push(id + '.' + k); });
    ['A', 'B'].forEach(k => { if (I[k] < 1 || I[k] > 179) bad.push(id + '.' + k); });
  }));
  ['A', 'B', 'C'].forEach(k => W.h5[0].data && [0, 1].forEach(i => { const v = [[0, 0], [6, 0], [3, 5.2]]['ABC'.indexOf(k)][i]; if (Math.abs(v * 20 - Math.round(v * 20)) > 1e-9) bad.push('h5.' + k); }));
  console.log((bad.length ? '  ✗ 超出滑桿範圍或精度：' + bad.join('、') : '  ✓ 隱藏任務例子的數字都在滑桿範圍與打字精度內')); if (bad.length) fail++;
}
// ---------- 用滑桿刻度（整數角、0.1 的邊）做不到的隱藏任務 ----------
{
  const hard = ['h8', 'h9', 'h10'];
  const got = {};
  hard.forEach(h => { got[h] = 0; });
  const m8 = byId('h8'), m9 = byId('h9'), m10 = byId('h10');
  for (let A = 1; A <= 89; A++) for (let b = 10; b <= 100; b++) for (let a = 10; a < b; a++) {
    m8.mem = {}; if (m8.check(data(st({ mode: 'ssa', inp: { A: A, b: b / 10, a: a / 10 } }), 's'), m8.mem)) got.h8++;
  }
  for (let A = 1; A <= 178; A++) for (let B = 1; A + B < 180; B++) { m10.mem = {}; if (m10.check(data(st({ mode: 'asa', inp: { A: A, B: B, c: 5 } }), 's'), m10.mem)) got.h10++; }
  for (let a = 10; a <= 100; a++) for (let b = a; b <= 100; b++) for (let c = b; c <= 100; c++) {
    if (c > 1.7 * a) break;
    m9.mem = {}; if (m9.check(data(st({ mode: 'sss', inp: { a: a / 10, b: b / 10, c: c / 10 } }), 's'), m9.mem)) got.h9++;
  }
  console.log('    用滑桿刻度窮舉：h8 ' + got.h8 + ' 組、h9 ' + got.h9 + ' 組、h10 ' + got.h10 + ' 組（0 表示一定要打字）');
}

// ---------- 亂按模擬：隱藏任務不可以被誤觸 ----------
{
  let seed = 1113;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const r6 = v => Math.round(v * 1e6) / 1e6;
  const pick = (lo, hi, step) => r6(lo + Math.round(rand() * (hi - lo) / step) * step);
  const hits = {};
  for (let run = 0; run < 2000; run++) {
    missions.forEach(m => { m.mem = {}; m.got = false; });
    const S = { mode: 'free', P: { A: [0, 0], B: [6, 0], C: [1.5, 4] }, inp: Object.assign({}, DEF.inp), sel: 0 };
    for (let k = 0; k < 150; k++) {
      const r = rand();
      let src = 'slider';
      if (r < 0.12) { S.mode = ['free', 'sss', 'sas', 'asa', 'ssa'][Math.floor(rand() * 5)]; S.sel = 0; src = 'mode'; }
      else if (r < 0.4) {
        const v = 'ABC'[Math.floor(rand() * 3)];
        const p = rand() < 0.6 ? [pick(-2, 12, 0.5), pick(-2, 10, 0.5)] : [pick(-2, 12, 0.05), pick(-2, 10, 0.05)];
        S.P = Object.assign({}, S.P); S.P[v] = p; src = 'drag';
      } else if (r < 0.75) { const kk = 'abc'[Math.floor(rand() * 3)]; S.inp[kk] = pick(1, 10, 0.1); }
      else if (r < 0.8) { const kk = 'abc'[Math.floor(rand() * 3)]; S.inp[kk] = r6(Math.round((1 + rand() * 9) * 1000) / 1000); }
      else if (r < 0.92) { const kk = 'AB'[Math.floor(rand() * 2)]; S.inp[kk] = pick(1, 179, 1); }
      else if (r < 0.95) { const kk = 'AB'[Math.floor(rand() * 2)]; S.inp[kk] = r6(Math.round((1 + rand() * 178) * 1000) / 1000); }
      else { S.sel = 1 - S.sel; src = 'ssaSel'; }
      const e = data(S, src);
      missions.forEach(m => { if (!m.got && m.check(e, m.mem)) { m.got = true; const id = m.id.replace('law-of-cosines-', ''); hits[id] = (hits[id] || 0) + 1; } });
    }
  }
  const HID = missions.filter(m => m.hidden).map(m => m.id.replace('law-of-cosines-', ''));
  const worst = HID.filter(id => (hits[id] || 0) > 30);
  console.log((worst.length ? '  ✗ ' : '  ✓ ') + '亂按 2000 回（每回 150 步）：' + Object.keys(hits).sort().map(k => k + ' ' + hits[k] + ' 次').join('、') + '（隱藏任務每個都不到 1.5%）');
  if (worst.length) fail++;
}

// ---------- 做法交叉檢查 ----------
{
  const PRE = { h2: ['2'], h5: ['8'] };
  const bad = [];
  Object.keys(W).forEach(id => {
    missions.forEach(m => {
      const mid = m.id.replace('law-of-cosines-', '');
      if (mid === id || (PRE[id] || []).includes(mid)) return;
      m.mem = {}; let got = false;
      W[id].forEach(e => { got = m.check(e, m.mem) || got; });
      if (got) bad.push(id + ' → ' + mid);
    });
  });
  console.log((bad.length ? '  ✗ 做法會連帶完成別的任務：' + bad.join('、') : '  ✓ 隱藏任務的做法都只完成它自己')); if (bad.length) fail++;
}
{
  const hidL = missions.filter(m => m.hidden).map(m => m.level);
  const ok = hidL.length === 10 && hidL.every(l => l >= 3 && l <= 10) && hidL.filter(l => l >= 7).length >= 3;
  console.log((ok ? '  ✓ ' : '  ✗ ') + '隱藏任務 ' + hidL.length + ' 個，等級 ' + hidL.join('、') + '（7 級以上 ' + hidL.filter(l => l >= 7).length + ' 個）'); if (!ok) fail++;
}

// ---------- 總覽 ----------
const pub = missions.filter(m => !m.hidden), hid = missions.filter(m => m.hidden);
const starsOf = m => (m.hidden ? 2 : 1) * m.level;   // 隱藏任務星星加倍（與 js/missions.js 的 LabMission.starsOf 相同）
const stars = missions.reduce((s, m) => s + starsOf(m), 0);
console.log(`\n公開 ${pub.length} 個、隱藏 ${hid.length} 個，共 ${stars} 顆星（公開 ${pub.reduce((s, m) => s + m.level, 0)}、隱藏 ${hid.reduce((s, m) => s + starsOf(m), 0)}，隱藏任務是等級 × 2）。`);
if (hid.some(m => starsOf(m) > 20)) { fail++; console.log('隱藏任務超過 20 顆星（規則上限）。'); }
if (fail) { console.log(`有 ${fail} 項不符合。`); process.exit(1); }
console.log('全部任務都證明做得到，預設狀態不觸發，亂按不會誤觸隱藏任務。');
