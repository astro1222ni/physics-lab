/* 任務可達成的證明腳本。用法：node tools/mission-proofs/triangle-centers.js
 * 用數學核心證明每個任務在拖曳的格點上做得到（事件格式與 js/triangle-centers.js 相同：TCCore.features 加上畫面狀態），
 * 並確認預設狀態不會觸發任務、亂按不會誤觸隱藏任務、每個隱藏任務的做法只完成它自己（和它本來就包含的公開任務）。
 * 拖曳：頂點靠近 0.5 的格點會吸附，其餘取到 0.05；鍵盤每次 0.1（Shift 0.5）。所以頂點座標都是 0.05 的倍數。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const M = require(ROOT + 'js/triangle-centers-core.js');
const missions = [];
global.window = { LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/triangle-centers.js');
const byId = id => missions.find(m => m.id === 'triangle-centers-' + id);
const short = id => id.replace('triangle-centers-', '');

// ---------- 與 js/triangle-centers.js 的 stateData 相同 ----------
const DEF = { P: { A: [0, 0], B: [7, 0], C: [2.5, 5] }, focus: 'all', showNine: false, showTrace: false, showEuler: true, runSpan: 0 };
function data(S, src) {
  const f = M.features(S.P.A, S.P.B, S.P.C);
  return { type: 'tc', data: Object.assign({}, f, { src: src, focus: S.focus, showNine: S.showNine, showTrace: S.showTrace, showEuler: S.showEuler, runSpan: S.showTrace ? S.runSpan : 0 }) };
}
const P = (a, b, c) => ({ A: a, B: b, C: c });
function ev(o, src) { return [data(Object.assign({}, DEF, o), src || 'drag')]; }
function guesses(list) {
  let streak = 0; const times = []; const out = [];
  list.forEach(g => {
    if (g.ok === false) { streak = 0; times.length = 0; out.push({ type: 'guess', data: { correct: false, streak: 0, secs: g.secs, last10: NaN } }); return; }
    streak++; times.push(g.secs); if (times.length > 10) times.shift();
    out.push({ type: 'guess', data: { correct: true, streak: streak, secs: g.secs, last10: streak >= 10 ? times.slice(-10).reduce((s, v) => s + v, 0) : NaN } });
  });
  return out;
}
const rep = (n, secs) => Array.from({ length: n }, () => ({ secs: secs }));

let fail = 0;
function expect(id, events, want, note) {
  const m = byId(id); m.mem = {};
  let ok = false;
  events.forEach(e => { ok = ok || !!m.check(e, m.mem); });
  const pass = ok === want;
  if (!pass) fail++;
  console.log((pass ? '  ✓ ' : '  ✗ ') + String(id).padEnd(3) + (want ? ' 達成：' : ' 不觸發：') + note);
}

// ---------- 預設狀態不觸發（切到每一種「看哪一心」、打開每一個顯示） ----------
{
  const evs = [];
  ['all', 'G', 'O', 'I'].forEach(f => evs.push.apply(evs, ev({ focus: f }, 'focus')));
  evs.push.apply(evs, ev({ showNine: true }, 'check'), ev({ showTrace: true }, 'check'), ev({ showEuler: false }, 'check'));
  const hit = missions.filter(m => { m.mem = {}; return evs.some(e => m.check(e, m.mem)); }).map(m => m.id);
  if (hit.length) { fail++; console.log('  ✗ 預設狀態觸發了 ' + hit.join('、')); }
  else console.log('  ✓ 預設狀態（A(0, 0)、B(7, 0)、C(2.5, 5)）切換「看哪一心」（垂心以外）、打開九點圓與軌跡，都不觸發任何任務');
  const d = evs[0].data;
  const thr = { hR: 0.005, hSide: 0.005, hBis: 0.01, eulerPar: 0.5, oiPar: 0.5, oiPerp: 0.5, oir: 0.01, spread: 0.01 };
  console.log('    預設離隱藏任務門檻最近的是 ' + Object.keys(thr).map(k => [k, d[k] / thr[k]]).sort((a, b) => a[1] - b[1]).slice(0, 2).map(x => x[0] + ' ' + x[1].toFixed(1) + ' 倍').join('、'));
}

// ---------- 每個任務做得到（以及接近但不算的情況） ----------
expect('1', ev({ focus: 'H' }, 'focus'), true, '「看哪一心」選垂心');
expect('1', ev({ focus: 'O' }, 'focus'), false, '選外心不算');
expect('2', ev({ P: P([0, 0], [6, 0], [-1, 2]) }), true, '(0, 0)、(6, 0)、(−1, 2)：A = 116.6°，O、H 都在外面');
expect('2', ev({ P: P([0, 0], [6, 0], [0, 3]) }), false, '直角時 O、H 在邊上，不算');
expect('3', ev({ P: P([0, 0], [6, 0], [0, 3]) }), true, '(0, 0)、(6, 0)、(0, 3)：H = A，O 是斜邊中點');
expect('3', ev({ P: P([0, 0], [6, 0], [0.05, 3]) }), false, 'C 偏 0.05 就不是直角');
expect('4', ev({ P: P([0, 0], [8, 0], [2, 5]) }), true, '(0, 0)、(8, 0)、(2, 5)：銳角、四心都在裡面、OH ≥ R／2');
expect('4', ev({ P: P([0, 0], [6, 0], [3, 5]) }), false, '接近正三角形：OH 太小');
expect('5', ev({ P: P([0, 0], [6, 0], [3, 2]) }), true, '(0, 0)、(6, 0)、(3, 2)：等腰（鈍角也可以）');
expect('5', ev({ P: P([0, 0], [6, 0], [3.05, 2]) }), false, '偏 0.05 就不等腰');
expect('6', ev({ P: P([0, 0], [8, 0], [1, 1.5]), showNine: true }), true, '打開九點圓，(0, 0)、(8, 0)、(1, 1.5)：N 在外面');
expect('6', ev({ P: P([0, 0], [8, 0], [1, 1.5]) }), false, '沒有打開九點圓不算');
// 任務 7：OG = 1 的例子
let ex7 = null;
for (let yi = 20; yi <= 200 && !ex7; yi++) for (let xi = -40; xi <= 200 && !ex7; xi++) {
  const C = [xi / 20, yi / 20], f = M.features([0, 0], [8, 0], C);
  if (f.ok && Math.abs(f.OG - 1) <= 0.003 && xi % 10 === 0 && yi % 10 === 0) ex7 = C;
}
if (!ex7) for (let yi = 20; yi <= 200 && !ex7; yi++) for (let xi = -40; xi <= 200 && !ex7; xi++) {
  const C = [xi / 20, yi / 20], f = M.features([0, 0], [8, 0], C);
  if (f.ok && Math.abs(f.OG - 1) <= 0.005) ex7 = C;
}
expect('7', ev({ P: P([0, 0], [8, 0], ex7) }), true, '(0, 0)、(8, 0)、(' + ex7.join(', ') + ')：OG = ' + M.features([0, 0], [8, 0], ex7).OG.toFixed(4));
expect('7', ev({}), false, '預設 OG = 0.44');
expect('8', [].concat(ev({ showTrace: true, runSpan: 2 }, 'key'), ev({ showTrace: true, runSpan: 4 }, 'key')), true, '開著軌跡、C 沿平行 AB 的直線（y = 5）走了 4 單位');
expect('8', ev({ showTrace: false, runSpan: 5 }, 'key'), false, '沒有開軌跡不算');
expect('9', ev({ P: P([0, 0], [6, 0], [3, 5.2]) }), true, '(0, 0)、(6, 0)、(3, 5.2)：R／r = 2.0001');
expect('9', ev({ P: P([0, 0], [6, 0], [3, 3.5]) }), false, '(3, 3.5)：R／r = ' + M.features([0, 0], [6, 0], [3, 3.5]).Rr.toFixed(3));
expect('10', guesses(rep(4, 9)), true, '連續答對 4 題');
expect('10', guesses([{ secs: 5 }, { secs: 5 }, { ok: false, secs: 5 }, { secs: 5 }, { secs: 5 }]), false, '中間答錯要重算');
expect('11', guesses(rep(8, 9)), true, '連續答對 8 題');
expect('12', guesses(rep(10, 11.5)), true, '連續 10 題、合計 115 秒');
expect('12', guesses(rep(10, 12.5)), false, '合計 125 秒太慢');

// 隱藏任務
const EX = {
  h1: [[0, 0], [4, 0], [0, 3]],
  h2: [[0, 0], [9, 0], [4.45, 7.8]],
  h3: [[0, 0], [4.75, 0], [4, 3]],
  h4: [[0, 0], [2, 0], [-0.95, 1.85]],
  h5: [[0, 0], [2.5, 0], [0.6, 7.55]],
  h6: [[0, 0], [6.5, 0], [2.3, 4.3]],
  h7: [[0, 0], [4.5, 0], [0.25, 3.2]],
  h8: [[0, 0], [2, 0], [-0.7, 2.2]],
  h9: [[0, 0], [7, 0], [2.5, 6]],
  h10: [[0, 0], [7, 0], [-0.35, 3.25]]
};
const W = {};
Object.keys(EX).forEach(id => { W[id] = ev({ P: P(EX[id][0], EX[id][1], EX[id][2]) }); });
const pts = id => EX[id].map(p => '(' + p.join(', ') + ')').join('、');
const fx = id => { const d = W[id][0].data; return '角 ' + [d.A, d.B, d.C].map(v => v.toFixed(2) + '°').join('、'); };
const D = id => W[id][0].data;
const NOTE = {
  h1: pts('h1') + '：3、4、5，r = 1',
  h2: pts('h2') + '（0.05 格點）：' + fx('h2') + '，四心相距 ' + (D('h2').spread * 100).toFixed(2) + '% R',
  h3: pts('h3') + '：tan A = 0.75、tan B = 4，tan A tan B = 3，歐拉線剛好平行 AB',
  h4: pts('h4') + '：' + fx('h4') + '，R／r = ' + D('h4').Rr.toFixed(5) + '（要 4）',
  h5: pts('h5') + '：' + fx('h5') + '，|HI − r|／r = ' + (D('h5').hr * 100).toFixed(4) + '%',
  h6: pts('h6') + '：' + fx('h6') + '，OI 與一邊夾 ' + D('h6').oiPar.toFixed(4) + '°',
  h7: pts('h7') + '：' + fx('h7') + '，R／r = ' + D('h7').Rr.toFixed(5) + '（要 1 + √2 = 2.41421）',
  h8: pts('h8') + '：' + fx('h8') + '，R／r = ' + D('h8').Rr.toFixed(5) + '（要 1 + √5 = 3.23607）',
  h9: pts('h9') + '：三邊 6.5、7、7.5 剛好成等差，OI ⊥ 頂點 C 到 I 的連線',
  h10: pts('h10') + '：' + fx('h10') + '，|CH − R|／R = ' + (D('h10').hR * 1e5).toFixed(2) + ' × 10^-5'
};
Object.keys(W).forEach(id => expect(id, W[id], true, NOTE[id]));
expect('h1', ev({ P: P([0, 0], [8, 0], [0, 6]) }), true, '6、8、10（r = 2）也算');
expect('h1', ev({ P: P([0, 0], [6, 0], [0, 4]) }), false, '6、4、√52 斜邊不是整數');
expect('h2', ev({ P: P([0, 0], [6, 0], [3, 5.2]) }), true, '(0, 0)、(6, 0)、(3, 5.2)（鍵盤）：四心相距 ' + (M.features([0, 0], [6, 0], [3, 5.2]).spread * 100).toFixed(2) + '% R 也算');
expect('h2', ev({ P: P([0, 0], [6, 0], [3, 5]) }), false, '(3, 5)：四心相距 ' + (M.features([0, 0], [6, 0], [3, 5]).spread * 100).toFixed(1) + '% R，還不夠近');
expect('h3', ev({ P: P([0, 0], [4.75, 0], [4.05, 3]) }), false, 'C 偏 0.05 就不平行');
expect('h3', ev({ P: P([0, 0], [4, 0], [1, 3]) }), false, 'tan 是 3、1（含 45°）的平行不算');
expect('h4', ev({ P: P([0, 0], [2, 0], [-0.9, 1.85]) }), false, 'C 偏 0.05：R／r = ' + M.features([0, 0], [2, 0], [-0.9, 1.85]).Rr.toFixed(4));
expect('h5', ev({ P: P([0, 0], [2.5, 0], [0.6, 7.5]) }), false, 'C 低 0.05 就不在內切圓上');
expect('h6', ev({ P: P([0, 0], [6.5, 0], [2.3, 4.35]) }), false, 'C 高 0.05 就不平行');
expect('h7', ev({ P: P([0, 0], [4, 0], [0, 4]) }), false, '等腰直角三角形的 OI = r 不算（有直角）');
expect('h7', ev({ P: P([0, 0], [4.5, 0], [0.25, 3.25]) }), false, 'C 高 0.05 就不在內切圓上');
expect('h8', ev({ P: P([0, 0], [2, 0], [-0.7, 2.25]) }), false, 'C 高 0.05：R／r = ' + M.features([0, 0], [2, 0], [-0.7, 2.25]).Rr.toFixed(4));
expect('h9', ev({ P: P([0, 0], [4, 0], [0, 3]) }), false, '3、4、5 也成等差，但有直角不算');
expect('h9', ev({ P: P([0, 0], [7, 0], [2.5, 6.05]) }), false, 'C 高 0.05 就不垂直');
expect('h10', ev({ P: P([0, 0], [6, 0], [3, 5.2]) }), false, '接近正三角形不算');
expect('h10', ev({ P: P([0, 0], [6, 0], [2.8, 4.85]) }), false, 'A = atan(4.85／2.8) = 60.0014°（97／56 近似 √3）還不夠準');
expect('h10', ev({ P: P([0, 0], [11, 0], [7.65, 13.25]) }), true, 'A(0, 0)、B(11, 0)、C(7.65, 13.25)：265／153 近似 √3，A = ' + M.features([0, 0], [11, 0], [7.65, 13.25]).A.toFixed(5) + '°');

// ---------- 例子的頂點都在 0.05 的格點上 ----------
{
  const bad = [];
  Object.keys(EX).forEach(id => EX[id].forEach((p, k) => p.forEach(v => { if (Math.abs(v * 20 - Math.round(v * 20)) > 1e-9) bad.push(id + '.' + 'ABC'[k]); })));
  console.log(bad.length ? '  ✗ 不在格點上：' + bad.join('、') : '  ✓ 隱藏任務的例子都在 0.05 的格點上（拖曳 0.05、鍵盤 0.1 做得到）'); if (bad.length) fail++;
}

// ---------- 亂按模擬：隱藏任務不可以被誤觸 ----------
{
  let seed = 1113;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const r6 = v => Math.round(v * 1e6) / 1e6;
  const pick = (lo, hi, step) => r6(lo + Math.round(rand() * (hi - lo) / step) * step);
  const VN = ['A', 'B', 'C'];
  const hits = {};
  for (let run = 0; run < 2000; run++) {
    missions.forEach(m => { m.mem = {}; m.got = false; });
    const S = Object.assign({}, DEF, { P: Object.assign({}, DEF.P) });
    let R = null;
    for (let k = 0; k < 150; k++) {
      const r = rand();
      let src = 'drag';
      const prev = Object.assign({}, S.P);
      if (r < 0.1) { S.focus = ['all', 'G', 'O', 'I', 'H'][Math.floor(rand() * 5)]; src = 'focus'; }
      else if (r < 0.16) { const kk = ['showNine', 'showTrace', 'showEuler'][Math.floor(rand() * 3)]; S[kk] = !S[kk]; if (kk === 'showTrace') R = null; src = 'check'; }
      else if (r < 0.6) {
        const v = VN[Math.floor(rand() * 3)];
        S.P = Object.assign({}, S.P); S.P[v] = rand() < 0.6 ? [pick(-2, 12, 0.5), pick(-2, 10, 0.5)] : [pick(-2, 12, 0.05), pick(-2, 10, 0.05)];
        src = rand() < 0.5 ? 'drag' : 'tap';
      } else {
        const v = VN[Math.floor(rand() * 3)], st = rand() < 0.7 ? 0.1 : 0.5, dir = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(rand() * 4)];
        S.P = Object.assign({}, S.P); S.P[v] = [r6(S.P[v][0] + dir[0] * st), r6(S.P[v][1] + dir[1] * st)];
        src = 'key';
      }
      // 與頁面的 trackRun 相同
      if (S.showTrace && src !== 'focus' && src !== 'check') {
        const moved = VN.filter(q => prev[q][0] !== S.P[q][0] || prev[q][1] !== S.P[q][1]);
        if (moved.length !== 1) R = null;
        else {
          const q = moved[0], U = S.P[VN[(VN.indexOf(q) + 1) % 3]], Wp = S.P[VN[(VN.indexOf(q) + 2) % 3]];
          const d = [Wp[0] - U[0], Wp[1] - U[1]], L = Math.hypot(d[0], d[1]);
          if (L < 1e-9) R = null;
          else {
            const hOf = p => M.cross(U, Wp, p) / L, sOf = p => ((p[0] - U[0]) * d[0] + (p[1] - U[1]) * d[1]) / L;
            const h1 = hOf(S.P[q]), s1 = sOf(S.P[q]);
            const same = R && R.k === q && R.U[0] === U[0] && R.U[1] === U[1] && R.W[0] === Wp[0] && R.W[1] === Wp[1];
            if (same && Math.abs(h1 - R.h) <= 0.06) { R.lo = Math.min(R.lo, s1); R.hi = Math.max(R.hi, s1); }
            else {
              const h0 = hOf(prev[q]), s0 = sOf(prev[q]);
              R = Math.abs(h1 - h0) <= 0.06 ? { k: q, U: U, W: Wp, h: h0, lo: Math.min(s0, s1), hi: Math.max(s0, s1) } : { k: q, U: U, W: Wp, h: h1, lo: s1, hi: s1 };
            }
          }
        }
      }
      S.runSpan = R ? R.hi - R.lo : 0;
      const e = data(S, src);
      missions.forEach(m => { if (!m.got && m.check(e, m.mem)) { m.got = true; const id = short(m.id); hits[id] = (hits[id] || 0) + 1; } });
    }
  }
  const HID = missions.filter(m => m.hidden).map(m => short(m.id));
  const worst = HID.filter(id => (hits[id] || 0) > 30);
  console.log('    （公開任務 9：' + (hits['9']||0) + ' 回）'); console.log((worst.length ? '  ✗ ' : '  ✓ ') + '亂按 2000 回（每回 150 步）：' + Object.keys(hits).sort().map(k => k + ' ' + hits[k] + ' 次').join('、') + '（隱藏任務每個都不到 1.5%）');
  if (worst.length) fail++;
}

// ---------- 做法交叉檢查 ----------
{
  const PRE = { h1: ['3'], h2: ['9'], h3: ['4'], h4: ['2'], h5: ['4'], h7: ['4'], h8: ['2'], h9: ['9'], h10: ['2'] };
  const bad = [];
  Object.keys(W).forEach(id => {
    missions.forEach(m => {
      const mid = short(m.id);
      if (mid === id || (PRE[id] || []).includes(mid)) return;
      m.mem = {}; let got = false;
      W[id].forEach(e => { got = m.check(e, m.mem) || got; });
      if (got) bad.push(id + ' → ' + mid);
    });
  });
  console.log((bad.length ? '  ✗ 做法會連帶完成別的任務：' + bad.join('、') : '  ✓ 隱藏任務的做法都只完成它自己（和 PRE 列的公開任務：' + Object.keys(PRE).map(k => k + ' 含 ' + PRE[k].join('、')).join('，') + '）')); if (bad.length) fail++;
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
