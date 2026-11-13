/* 任務可達成的證明腳本。用法：node tools/mission-proofs/complex-plane.js
 * 用數學核心證明每個任務在滑桿範圍與精度內做得到（事件格式與 js/complex-plane.js 相同），
 * 並確認預設狀態不會觸發任務、亂按不會誤觸隱藏任務、每個隱藏任務的做法只完成它自己（和它本來就包含的公開任務）。
 * 滑桿：z、w 的實部與虛部 −4～4（0.1；點數字可輸入到 0.0001）、|z| 0–4（0.05；0.0001）、arg z −180～180（1°；0.0001°）、
 *       次方 n 1–100、開 n 次方 2–24。拖曳或點一下平面時，靠近格子點、單位圓上 15° 的倍數會吸附，其餘取到 0.05。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const M = require(ROOT + 'js/complex-plane-core.js');
const missions = [];
global.window = { LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/complex-plane.js');
const byId = id => missions.find(m => m.id === 'complex-plane-' + id);
const C = M.C;
const r6 = v => { const w = Math.round(v * 1e6) / 1e6; return w === 0 ? 0 : w; };

// ---------- 與 js/complex-plane.js 的 stateData 相同的事件資料 ----------
function data(S, src, mode) {
  const z = S.z, w = S.w, P = M.powInt(z, S.pn), R = M.abs(z) === 0 ? [] : M.roots(z, S.rn);
  return {
    src: src, mode: mode || S.mode, chal: false, z: { re: z.re, im: z.im }, w: { re: w.re, im: w.im }, pn: S.pn, rn: S.rn,
    absZ: M.abs(z), argZ: M.argDeg(z), sum: M.add(z, w), prod: M.mul(z, w), pow: { re: P.re, im: P.im },
    roots: R.map(p => ({ re: p.re, im: p.im }))
  };
}
const DEF = { mode: 'mul', z: C(1, 1), w: C(2, 0.5), pn: 6, rn: 5 };
/** 由預設狀態改成 o，產生使用者操作後的 'cx' 事件（play: true 再加一個播放完的事件） */
function cx(o, play) {
  const S = Object.assign({}, DEF, o);
  const out = [{ type: 'cx', data: data(S, 'slider') }];
  if (play) out.push({ type: 'play', data: data(S, 'play') });
  return out;
}
const polarZ = (r, deg) => { const p = M.polar(r, deg); return C(r6(p.re), r6(p.im)); };
/** 挑戰：依序答幾題（每題 secs 秒；ok = false 表示答錯） */
function guesses(list) {
  let streak = 0; const times = []; const out = [];
  list.forEach(g => {
    if (g.ok === false) { streak = 0; times.length = 0; out.push({ type: 'guess', data: { correct: false, streak: 0, secs: g.secs, last5: NaN } }); return; }
    streak++; times.push(g.secs); if (times.length > 5) times.shift();
    const last5 = streak >= 5 ? times.slice(-5).reduce((s, v) => s + v, 0) : NaN;
    out.push({ type: 'guess', data: { correct: true, streak: streak, secs: g.secs, last5: last5 } });
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

// ---------- 預設狀態不觸發（四種運算各切一次、各播放一次） ----------
{
  const evs = [];
  ['add', 'mul', 'pow', 'root'].forEach(mode => { evs.push.apply(evs, cx({ mode: mode }, true)); });
  const hit = missions.filter(m => { m.mem = {}; return evs.some(e => m.check(e, m.mem)); }).map(m => m.id);
  if (hit.length) { fail++; console.log('  ✗ 預設狀態觸發了 ' + hit.join('、')); }
  else console.log('  ✓ 預設狀態（z = 1 + i、w = 2 + 0.5i、n = 6、開 5 次方）切到四種運算、播放，都不觸發任何任務');
}

// ---------- 每個任務做得到（以及接近但不算的情況） ----------
expect('1', cx({ z: C(0, 1) }, true), true, '乘法、z = i、播放：方格紙轉 90°');
expect('1', cx({ z: C(0, 1) }, false), false, '沒有按播放不算');
expect('2', cx({ mode: 'add', z: C(1, 2), w: C(1.5, -2) }), true, '加法 (1 + 2i) + (1.5 − 2i) = 2.5');
expect('2', cx({ mode: 'add', z: C(1, 0.3), w: C(1, -0.3) }), false, '虛部只有 0.3 不算');
expect('3', cx({ z: C(2, 0) }, true), true, '乘法、z = 2、播放：只放大');
expect('3', cx({ z: C(1.3, 0) }, true), false, 'z = 1.3 和 1 太近');
expect('4', cx({ z: polarZ(1, 60) }, true), true, '乘法、z = cos 60° + i sin 60°（|z| 滑桿 1、幅角 60）、播放');
expect('4', cx({ z: C(0, 1) }, true), false, 'z = i 是 90° 的倍數，不算');
expect('5', cx({ z: C(2, 1), w: C(2, -1) }), true, '乘法 (2 + i)(2 − i) = 5');
expect('5', cx({ z: C(2, 0.3), w: C(2, -0.3) }), false, '虛部只有 0.3 不算');
expect('6', cx({ z: C(2, 0), w: C(0, 0.5) }), true, '乘法 2 × 0.5i = i，|zw| = 1');
expect('6', cx({ z: C(2, 0), w: C(0.5, 0) }), false, 'zw = 1 在實軸上不算');
expect('7', cx({ mode: 'pow', z: polarZ(1, 120), pn: 3 }), true, '次方、z = cos 120° + i sin 120°（拖到單位圓 120° 會吸附）、n = 3');
expect('7', cx({ mode: 'pow', z: C(0, 1), pn: 8 }), false, 'z = i、n = 8：第 4 次就回到 1 了');
expect('7', cx({ mode: 'pow', z: C(0, 1), pn: 4 }), true, 'z = i、n = 4');
expect('8', cx({ mode: 'pow', z: C(0.5, 0.5), pn: 12 }), true, '次方、z = 0.5 + 0.5i、n = 12：|z^12| = 0.016');
expect('8', cx({ mode: 'pow', z: C(0.8, 0), pn: 12 }), false, 'z 在實軸上不算');
expect('9', cx({ mode: 'root', z: C(0, 1), rn: 3 }), true, '方根、z = i、開 3 次方');
expect('9', cx({ mode: 'root', z: C(0, 1), rn: 4 }), false, '開 4 次方不算');
expect('10', cx({ mode: 'pow', z: polarZ(1, 30), pn: 3 }), true, '次方、z = cos 30° + i sin 30°、n = 3：z³ = i');
expect('10', cx({ mode: 'pow', z: C(0, -1), pn: 3 }), false, 'z = −i 也是 i 的立方根，但在虛軸上不算');
expect('11', guesses([{ secs: 20 }, { secs: 25 }, { secs: 30 }]), true, '連續答對 3 題');
expect('11', guesses([{ secs: 20 }, { secs: 25 }, { ok: false, secs: 9 }, { secs: 30 }]), false, '中間答錯就重算');
expect('12', guesses([{ secs: 15 }, { secs: 18 }, { secs: 20 }, { secs: 17 }, { secs: 16 }]), true, '連續 5 題、合計 86 秒');
expect('12', guesses([{ secs: 15 }, { secs: 18 }, { secs: 20 }, { secs: 17 }, { secs: 25 }]), false, '合計 95 秒太慢');

// 隱藏任務
const W = {
  h1: cx({ mode: 'pow', z: C(0, 1), pn: 2 }),
  h2: cx({ z: C(2, 1), w: C(2, -1) }, true),
  h3: cx({ mode: 'pow', z: C(1, 1), pn: 8 }),
  h4: cx({ z: C(0, 2), w: C(0, -0.5) }),
  h5: cx({ mode: 'add', z: polarZ(1, 120), w: polarZ(1, -120) }),
  h6: cx({ mode: 'root', z: C(-4, 0), rn: 4 }),
  h7: cx({ z: C(0.5403, 0.8415) }, true),
  h8: cx({ mode: 'pow', z: polarZ(1.618, 90), pn: 8 }),
  h9: cx({ mode: 'add', z: polarZ(1, 72), w: C(0.309, -0.9511) }),
  h10: cx({ mode: 'pow', z: C(1, 0.0314), pn: 100 })
};
const NOTE = {
  h1: '次方、z = i、n = 2：i² = −1',
  h2: '乘法 (2 + i)(2 − i) = 5、播放：5 在高斯整數裡不是質數',
  h3: '次方、z = 1 + i、n = 8：(1 + i)^8 = 16',
  h4: '乘法 2i × (−0.5i) = 1：w = 1／z',
  h5: '加法 ω + ω̄ = −1（拖到單位圓 ±120° 會吸附）',
  h6: '方根、z = −4、開 4 次方：±1 ± i',
  h7: '乘法、z = 0.5403 + 0.8415i（打字）＝ e^i、播放：轉 1 弧度',
  h8: '次方、|z| = 1.618、幅角 90°、n = 8：黃金螺線',
  h9: '加法 cis 72° + cis(−72°) = 2 cos 72° = 0.618（|z| 1、幅角 72；w 打字 0.309 − 0.9511i）',
  h10: '次方、z = 1 + 0.0314i（打字）、n = 100：(1 + iπ／100)^100 ≈ −1'
};
Object.keys(W).forEach(id => expect(id, W[id], true, NOTE[id]));
expect('h1', cx({ mode: 'pow', z: C(0, 1), pn: 3 }), false, 'n = 3 不算');
expect('h2', cx({ z: C(2, 1), w: C(2, -1) }, false), false, '沒有播放不算');
expect('h2', cx({ z: C(2, 2), w: C(2, -2) }, true), false, '(2 + 2i)(2 − 2i) = 8 不算');
expect('h3', cx({ mode: 'pow', z: C(1, 1), pn: 6 }), false, 'n = 6 不算');
expect('h4', cx({ z: C(1, 0.5), w: C(0.8, -0.4) }), false, '|z| = 1.12 太接近 1 不算');
expect('h5', cx({ mode: 'add', z: C(-0.5, 0.9), w: C(-0.5, -0.9) }), false, '±0.9i 不在單位圓上（差 0.03）');
expect('h6', cx({ mode: 'root', z: C(1, 0), rn: 4 }), false, '1 的四次方根 ±1、±i 在軸上不算');
expect('h7', cx({ z: polarZ(1, 57) }, true), false, '幅角 57° 差了 0.3°');
expect('h8', cx({ mode: 'pow', z: polarZ(1.6, 90), pn: 8 }), false, '|z| = 1.6 不算');
expect('h9', cx({ mode: 'add', z: polarZ(1, 72), w: C(0.3, -0.95) }), false, 'w 只取到 0.1 精度不算');
expect('h10', cx({ mode: 'pow', z: C(1, 0.0314), pn: 50 }), false, 'n = 50 還差很遠');
expect('h10', cx({ mode: 'pow', z: C(0.9995, 0.0314), pn: 100 }), false, '實部不是 1 不算');

// ---------- 例子的數字都在滑桿範圍內 ----------
{
  const bad = [];
  Object.keys(W).forEach(id => W[id].forEach(e => {
    const d = e.data;
    [d.z.re, d.z.im, d.w.re, d.w.im].forEach(v => { if (Math.abs(v) > 4 + 1e-9) bad.push(id); });
    if (d.absZ > 4 + 1e-9 || d.pn < 1 || d.pn > 100 || d.rn < 2 || d.rn > 24) bad.push(id);
  }));
  console.log((bad.length ? '  ✗ 超出滑桿範圍：' + bad.join('、') : '  ✓ 隱藏任務例子的數字都在滑桿範圍內')); if (bad.length) fail++;
}

// ---------- 亂按模擬：隱藏任務不可以被誤觸 ----------
{
  let seed = 1113;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const pick = (lo, hi, step) => r6(lo + Math.round(rand() * (hi - lo) / step) * step);
  const snapPt = () => {
    // 點一下平面：一半落在格子點附近（吸附），一些落在單位圓上 15° 的倍數，其餘取到 0.05
    const u = rand();
    if (u < 0.5) return C(Math.round(rand() * 8 - 4), Math.round(rand() * 8 - 4));
    if (u < 0.7) return polarZ(1, Math.round(rand() * 24) * 15);
    return C(pick(-4, 4, 0.05), pick(-4, 4, 0.05));
  };
  const hits = {};
  for (let run = 0; run < 2000; run++) {
    missions.forEach(m => { m.mem = {}; m.got = false; });
    const S = Object.assign({}, DEF);
    for (let st = 0; st < 150; st++) {
      const r = rand();
      let play = false;
      if (r < 0.1) S.mode = ['add', 'mul', 'pow', 'root'][Math.floor(rand() * 4)];
      else if (r < 0.3) { if (rand() < 0.5) S.z = C(pick(-4, 4, 0.1), S.z.im); else S.z = C(S.z.re, pick(-4, 4, 0.1)); }
      else if (r < 0.4) { const rr = rand() < 0.5 ? pick(0, 4, 0.05) : M.abs(S.z); const th = rand() < 0.5 ? pick(-180, 180, 1) : (M.argDeg(S.z) || 0); S.z = polarZ(rr, th); }
      else if (r < 0.55) S.z = snapPt();
      else if (r < 0.6) S.z = C(r6(Math.max(-4, Math.min(4, S.z.re + (rand() < 0.5 ? -0.1 : 0.1)))), S.z.im);
      else if (r < 0.7) { if (rand() < 0.5) S.w = C(pick(-4, 4, 0.1), S.w.im); else S.w = C(S.w.re, pick(-4, 4, 0.1)); }
      else if (r < 0.75) S.w = snapPt();
      else if (r < 0.82) S.pn = rand() < 0.5 ? pick(1, 100, 1) : Math.max(1, Math.min(100, S.pn + (rand() < 0.5 ? -1 : 1)));
      else if (r < 0.88) S.rn = rand() < 0.5 ? pick(2, 24, 1) : Math.max(2, Math.min(24, S.rn + (rand() < 0.5 ? -1 : 1)));
      else if (r < 0.92) S.z = C(r6(Math.round((rand() * 8 - 4) * 1e4) / 1e4), r6(Math.round((rand() * 8 - 4) * 1e4) / 1e4));
      else play = true;
      const e = play ? { type: 'play', data: data(S, 'play') } : { type: 'cx', data: data(S, 'slider') };
      missions.forEach(m => { if (!m.got && m.check(e, m.mem)) { m.got = true; const id = m.id.replace('complex-plane-', ''); hits[id] = (hits[id] || 0) + 1; } });
    }
  }
  const HID = missions.filter(m => m.hidden).map(m => m.id.replace('complex-plane-', ''));
  const worst = HID.filter(id => (hits[id] || 0) > 30);
  console.log((worst.length ? '  ✗ ' : '  ✓ ') + '亂按 2000 回（每回 150 步）：' + Object.keys(hits).sort().map(k => k + ' ' + hits[k] + ' 次').join('、') + '（隱藏任務每個都不到 1.5%）');
  if (worst.length) fail++;
}

// ---------- 做法交叉檢查：每個隱藏任務的做法只完成它自己（和前提的公開任務） ----------
{
  const PRE = { h2: ['5'], h4: ['6'], h5: ['2'], h7: ['4'], h9: ['2'] };
  const bad = [];
  Object.keys(W).forEach(id => {
    missions.forEach(m => {
      const mid = m.id.replace('complex-plane-', '');
      if (mid === id || (PRE[id] || []).includes(mid)) return;
      m.mem = {}; let got = false;
      W[id].forEach(e => { got = m.check(e, m.mem) || got; });
      if (got) bad.push(id + ' → ' + mid);
    });
  });
  console.log((bad.length ? '  ✗ 做法會連帶完成別的任務：' + bad.join('、') : '  ✓ 隱藏任務的做法都只完成它自己（前提：h2 含公開 5、h4 含 6、h5 與 h9 含 2、h7 含 4）')); if (bad.length) fail++;
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
