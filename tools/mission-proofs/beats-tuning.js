/* 任務可達成的證明腳本。用法：node tools/mission-proofs/beats-tuning.js
 * 用數學核心證明每個任務在介面的範圍與精度內做得到（事件資料和 js/beats-tuning.js 送出的一樣），
 * 預設狀態不觸發任何任務，而且每個隱藏任務的解不會順便完成另一個隱藏任務；最後做亂按模擬。
 * 介面：
 *   參考音：滑桿位置 33–81（MIDI 音高，整數），f1 = 440 × 2^((位置 − 69)/12)；打字到小數 2 位（55–880 Hz）。
 *   調音旋鈕（粗調）：−20 到 +20 Hz，間隔 0.1；打字到小數 2 位。細調：−1 到 +1 Hz，間隔 0.01；打字到小數 2 位。
 *   待調音 f2 = f1 × 純律比 + 粗調 + 細調。
 *   音程：同度、八度、五度、四度、大三度；目標：純律、平均律；音色：純音、帶泛音。
 *   ▶ 播放（送 'listen'；之後改設定送的 'tune' 帶 playing: true）；跟著拍按（最後連續 5 下以上穩定時送 'count'）。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const Core = require(ROOT + 'js/beats-tuning-core.js');
const MT = require(ROOT + 'js/music-theory.js');
const missions = [];
global.window = { LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/beats-tuning.js');
const byId = id => missions.find(m => m.id === 'beats-tuning-' + id);

// ---------- 介面的數值格點 ----------
const round = (v, d) => { const p = Math.pow(10, d); return Math.round(v * p) / p; };
const refPos = pos => MT.midiToFreq(pos);
const typedRef = v => round(Math.min(Core.REF_MAX, Math.max(Core.REF_MIN, v)), 2);
const coarseGrid = v => round(Math.max(-20, Math.min(20, v)), 1);
const fineGrid = v => round(Math.max(-1, Math.min(1, v)), 2);

// ---------- 頁面狀態與事件（和 js/beats-tuning.js 相同） ----------
function S(o) { return Object.assign({ fRef: 440, coarse: 3, fine: 0, iv: 'unison', target: 'just', mode: 'rich', touched: false, playing: false }, o || {}); }
function an(st) { return Core.analyze({ fRef: st.fRef, offset: st.coarse + st.fine, iv: st.iv, target: st.target, mode: st.mode }); }
const mk = (type, st, src, extra) => ({ type: type, data: Object.assign(an(st), { touched: st.touched, playing: st.playing, src: src }, extra || {}) });
const tune = (st, src) => mk('tune', st, src || 'knob');
const listen = st => mk('listen', Object.assign({}, st, { playing: true }), 'play');
/** 照著週期 period 按 n 下（可加抖動），每一下之後若穩定 5 下以上就送 'count' */
function taps(st, period, n, jitter) {
  const out = [], times = [];
  let t = 0;
  for (let i = 0; i < n; i++) {
    times.push(t);
    const r = Core.tapRate(times);
    if (r && r.taps >= 5) out.push(mk('count', Object.assign({}, st, { playing: true }), 'tap', { tapped: r.rate, taps: r.taps }));
    t += period * (1 + (jitter ? jitter[i % jitter.length] : 0));
  }
  return out;
}
/** 在參考音 fRef、音程 iv 上，找出旋鈕格點裡最接近平均律的位置 */
function etKnob(fRef, iv) {
  const want = Core.etFreq(fRef, iv) - Core.justFreq(fRef, iv);
  let best = null;
  for (let c = -20; c <= 20.0001; c = round(c + 0.1, 1)) {
    const f = fineGrid(want - c);
    if (Math.abs(want - c - f) > 0.006) continue;
    const e = Math.abs(c + f - want);
    if (!best || e < best.e) best = { coarse: c, fine: f, e: e };
  }
  return best;
}

let fail = 0;
const found = {};
function expect(id, events, want, note) {
  const m = byId(id); m.mem = {};
  let ok = false;
  events.forEach(e => { ok = ok || !!m.check(e, m.mem); });
  const pass = ok === want;
  if (!pass) fail++;
  if (want && pass && !found[id]) found[id] = events;
  console.log((pass ? '  ✓ ' : '  ✗ ') + String(id).padEnd(4) + (want ? '達成：' : '不觸發：') + note);
}
const fx = (v, d) => (+v).toFixed(d);

// ---------- 預設狀態不觸發 ----------
{
  // 預設：參考音 A4 = 440 Hz、同度、純律、帶泛音、粗調 +3.0、細調 0.00（f2 = 443 Hz，每秒 3 拍）。頁面載入時不送事件。
  // 第一次操作（只做一件事）時送出的事件：
  const d0 = S();
  const evs = [listen(d0)];
  Core.IV_KEYS.forEach(iv => { const st = S({ iv: iv }); evs.push(tune(st, 'interval'), listen(st)); });
  ['just', 'equal'].forEach(t => evs.push(tune(S({ target: t }), 'target')));
  ['pure', 'rich'].forEach(md => { const st = S({ mode: md }); evs.push(tune(st, 'mode'), listen(st)); });
  for (let p = 33; p <= 81; p++) evs.push(tune(S({ fRef: refPos(p) }), 'ref'));
  // 跟著拍按：亂按（不穩定）不會送 count；穩定地按是任務 4 本身要的操作（不算預設狀態）
  evs.push(...taps(d0, 0.7, 8, [0.5, -0.4, 0.6, -0.5]));
  const hit = missions.filter(m => evs.some(e => { m.mem = {}; return m.check(e, m.mem); })).map(m => m.id)
    .concat(missions.filter(m => { m.mem = {}; return evs.some(e => m.check(e, m.mem)); }).map(m => m.id + '（依序）'));
  if (hit.length) { fail++; console.log('  ✗ 預設狀態觸發了 ' + [...new Set(hit)].join('、')); }
  else console.log('  ✓ 預設狀態（A4、同度、純律、帶泛音、+3 Hz）、只按一個音程／目標／音色、只改參考音、直接按播放、亂按「跟著拍按」，都不觸發任何任務');
}

// ---------- 公開任務 ----------
console.log('\n公開任務');
{
  const T = { touched: true };
  expect(1, [tune(S(Object.assign({ coarse: 0.5 }, T)))], true, '同度，粗調拉到 +0.5 → 每秒 0.5 拍');
  expect(1, [tune(S(Object.assign({ coarse: 1.5 }, T)))], false, '每秒 1.5 拍不算');
  expect(2, [tune(S(Object.assign({ coarse: 2 }, T))), listen(S(Object.assign({ coarse: 2 }, T)))], true, '同度，粗調 +2.0（440 對 442 Hz）→ 按播放，每秒 2 拍');
  expect(2, [listen(S(Object.assign({ coarse: -2, fine: 0.01 }, T)))], true, '粗調 −2.0、細調 +0.01 → 1.99 拍也算（誤差 0.02 以內）');
  expect(3, [tune(S(Object.assign({ coarse: 0 }, T)))], true, '同度，粗調拉到 0 → 拍頻 0');
  expect(3, [tune(S(Object.assign({ coarse: 0.1 }, T)))], false, '每秒 0.1 拍不算');
  {
    const st = S(Object.assign({}, T));
    expect(4, taps(st, 1 / 3, 6), true, '預設每秒 3 拍，按播放後每 1/3 秒按一下「跟著拍按」，6 下 → 數到 3.00 拍');
    expect(4, taps(st, 1 / 3, 6, [0.08, -0.08, 0.05, -0.05, 0.06]), true, '手抖 ±8% 也算（數到 ' + fx(Core.tapRate([0, 0.36, 0.667, 1.017, 1.333, 1.687]).rate, 2) + ' 拍左右）');
    expect(4, taps(st, 0.25, 6), false, '按太快（每秒 4 下）不算');
  }
  expect(5, [tune(S(Object.assign({ iv: 'octave', coarse: 0 }, T)))], true, '八度、帶泛音，粗調 0 → 2f1 = 880 = f2');
  expect(5, [tune(S(Object.assign({ iv: 'octave', coarse: 0, mode: 'pure' }, T)))], false, '純音的八度沒有那一對泛音，不算');
  expect(6, [tune(S(Object.assign({ iv: 'fifth', coarse: 0 }, T)))], true, '五度、純律、帶泛音，粗調 0 → 3·440 = 2·660');
  expect(6, [tune(S(Object.assign({ iv: 'fifth', coarse: 0, target: 'equal' }, T)))], false, '目標選平均律時不算');
  {
    const p = S({ iv: 'fifth', mode: 'pure' }), r = S({ iv: 'fifth', mode: 'rich' });
    expect(7, [listen(p), listen(r)], true, '五度、旋鈕 +3 Hz：純音按播放（沒有拍），換帶泛音再按播放（每秒 6 拍）');
    expect(7, [listen(p), listen(S({ iv: 'fifth', mode: 'rich', coarse: 2 }))], false, '中間改了旋鈕不算');
    expect(7, [listen(S({ iv: 'fifth', mode: 'pure', coarse: 0.5 })), listen(S({ iv: 'fifth', mode: 'rich', coarse: 0.5 }))], false, '偏差不到 1 Hz 不算');
  }
  expect(8, [tune(S(Object.assign({ fRef: refPos(40), iv: 'fourth', coarse: 0 }, T)))], true, '參考音滑桿到 E2（82.41 Hz）、四度、粗調 0 → 4·82.41 = 3·109.88');
  expect(8, [tune(S(Object.assign({ fRef: typedRef(82.41), iv: 'fourth', coarse: 0 }, T)))], true, '打字 82.41 也可以');
  {
    const k = etKnob(220, 'fifth'), st = S(Object.assign({ fRef: refPos(57), iv: 'fifth', target: 'equal' }, k, T));
    expect(9, [tune(st)], true, 'A3（220 Hz）、五度、平均律：粗調 ' + fx(k.coarse, 1) + '、細調 ' + fx(k.fine, 2) + ' → f2 = ' + fx(an(st).f2, 2) + ' Hz，拍頻 ' + fx(an(st).beat, 3) + '（目標 ' + fx(an(st).targetBeat, 4) + '，偏窄）');
    const w = S(Object.assign({ fRef: 220, iv: 'fifth', target: 'equal', coarse: -k.coarse, fine: -k.fine }, T));
    expect(9, [tune(w)], false, '拍數一樣但偏寬（粗調 ' + fx(-k.coarse, 1) + '）不算');
  }
  {
    const k = etKnob(440, 'fourth'), st = S(Object.assign({ iv: 'fourth', target: 'equal' }, k, T));
    expect(10, [tune(st)], true, 'A4、四度、平均律：粗調 ' + fx(k.coarse, 1) + '、細調 ' + fx(k.fine, 2) + ' → 拍頻 ' + fx(an(st).beat, 3) + '（目標 ' + fx(an(st).targetBeat, 4) + '，偏寬）');
    const w = S(Object.assign({ iv: 'fourth', target: 'equal', coarse: -k.coarse, fine: -k.fine }, T));
    expect(10, [tune(w)], false, '偏窄的那一側不算');
  }
  {
    const k5 = etKnob(440, 'fifth'), k3 = etKnob(440, 'third');
    const a = S(Object.assign({ iv: 'fifth', target: 'equal' }, k5, T)), b = S(Object.assign({ iv: 'third', target: 'equal' }, k3, T));
    expect(11, [tune(a), tune(b)], true, 'A4：平均律五度 ' + fx(an(a).beat, 2) + ' 拍、平均律大三度 ' + fx(an(b).beat, 2) + ' 拍（粗調 ' + fx(k3.coarse, 1) + '、細調 ' + fx(k3.fine, 2) + '）');
    expect(11, [tune(a), tune(Object.assign({}, b, { fRef: refPos(57) }))], false, '兩個參考音不一樣不算');
  }
  {
    const k = etKnob(440, 'fifth'), st = S(Object.assign({ iv: 'fifth', target: 'equal' }, k, T)), b = an(st).beat;
    expect(12, taps(st, 1 / b, 6), true, 'A4 平均律五度（每秒 ' + fx(b, 3) + ' 拍），每 ' + fx(1 / b, 3) + ' 秒按一下，6 下');
    const k2 = etKnob(220, 'fifth'), st2 = S(Object.assign({ fRef: 220, iv: 'fifth', target: 'equal' }, k2, T)), b2 = an(st2).beat;
    expect(12, taps(st2, 1 / b2, 5, [0.05, -0.05, 0.04, -0.03]), true, 'A3 平均律五度（每秒 ' + fx(b2, 3) + ' 拍，' + fx(1 / b2, 2) + ' 秒一拍），手抖 ±5%，5 下');
    expect(12, taps(st, 1 / (b * 1.12), 6), false, '數快了 12% 不算');
  }
}

// ---------- 隱藏任務 ----------
console.log('\n隱藏任務');
{
  const T = { touched: true };
  expect('h1', [listen(S(Object.assign({ coarse: 1 }, T)))], true, '同度、粗調 +1.0，按播放 → 每秒 1 拍（60 BPM，像心跳）');
  expect('h1', [listen(S(Object.assign({ iv: 'fifth', coarse: 0.5 }, T)))], true, '五度、粗調 +0.5 → 2f2 − 3f1 = 1 拍也算');
  expect('h1', [listen(S(Object.assign({ coarse: 1.1 }, T)))], false, '每秒 1.1 拍不算');
  expect('h2', [listen(S(Object.assign({ mode: 'pure', coarse: 20 }, T)))], true, '純音、同度、粗調 +20 → 每秒 20 拍，聽起來變粗糙');
  expect('h2', [listen(S(Object.assign({ mode: 'rich', coarse: 20 }, T)))], false, '帶泛音不算');
  {
    const st = S(Object.assign({ fine: 0.25, coarse: 0 }, T));
    expect('h3', [listen(st)], true, 'A4 同度、細調 +0.25 → 偏高 ' + fx(an(st).cents, 3) + ' 音分，每 ' + fx(an(st).period, 2) + ' 秒一拍');
    expect('h3', [listen(S(Object.assign({ fine: 0.4, coarse: 0 }, T)))], false, '1.57 音分不算');
  }
  expect('h4', [tune(S(Object.assign({ iv: 'octave', target: 'equal', coarse: 0 }, T)))], true, '八度、目標平均律、粗調 0 → 平均律的八度就是純八度，拍頻 0');
  expect('h4', [tune(S(Object.assign({ iv: 'octave', target: 'just', coarse: 0 }, T)))], false, '目標是純律時不算');
  {
    const st = S(Object.assign({ fRef: refPos(60), iv: 'third', target: 'equal', coarse: 0 }, T));
    expect('h5', [tune(st)], true, 'C4、大三度、目標平均律，旋鈕調到不拍（粗調 0）→ 調音器指 ' + fx(an(st).cents, 2) + ' 音分（比平均律低 13.7 音分）');
  }
  {
    const k = etKnob(220, 'fifth');
    const right = S(Object.assign({ fRef: 220, iv: 'fifth', target: 'equal' }, k, T)), wrong = S(Object.assign({ fRef: 220, iv: 'fifth', target: 'equal', coarse: -k.coarse, fine: -k.fine }, T));
    expect('h6', [listen(wrong), listen(right)], true, 'A3 平均律五度：偏寬的一側（' + fx(an(wrong).beatSigned, 3) + '）和偏窄的一側（' + fx(an(right).beatSigned, 3) + '）都按播放聽過，拍數一樣，只有窄的是平均律');
    expect('h6', [listen(right)], false, '只聽正確的一側不算');
  }
  {
    const st = S(Object.assign({ coarse: 4 }, T));
    expect('h7', taps(st, 0.25, 6), true, 'A4 對 444 Hz（每秒 4 拍，史艾布勒音叉組相鄰兩支的差），每 0.25 秒按一下，6 下');
    expect('h7', taps(S(Object.assign({ coarse: 4, fRef: refPos(70) }, T)), 1 / 4, 6), false, '參考音不是 440 不算');
  }
  {
    const k1 = etKnob(220, 'third'), k2 = etKnob(440, 'third');
    const a = S(Object.assign({ fRef: 220, iv: 'third', target: 'equal' }, k1, T)), b = S(Object.assign({ iv: 'third', target: 'equal' }, k2, T));
    expect('h8', [tune(a), tune(b)], true, '平均律大三度：A3 上 ' + fx(an(a).beat, 2) + ' 拍、A4 上 ' + fx(an(b).beat, 2) + ' 拍（快一倍）');
    expect('h8', [tune(a), tune(Object.assign({}, b, { fRef: refPos(66) }, etKnob(refPos(66), 'third')))], false, '不是差一個八度不算');
  }
  {
    const st = S(Object.assign({ fRef: refPos(45), iv: 'fifth', coarse: -11, fine: 0 }, T)), a = an(st);
    expect('h9', [tune(st)], true, 'A2（110 Hz）、五度、粗調 −11.0 → f2 = ' + fx(a.f2, 2) + ' Hz = 7/5 倍：(3, 2) 拍 ' + fx(a.beat, 2) + '、(' + a.twin.m + ', ' + a.twin.n + ') 拍 ' + fx(a.twin.beat, 2));
    // 也可以用大三度：參考音 A4，f2 = 9/7 × 440 = 565.71
    const st2 = S(Object.assign({ iv: 'third', coarse: coarseGrid(440 * 9 / 7 - 550), fine: fineGrid(440 * 9 / 7 - 550 - coarseGrid(440 * 9 / 7 - 550)) }, T)), a2 = an(st2);
    expect('h9', [tune(st2)], true, 'A4、大三度、粗調 ' + fx(st2.coarse, 1) + ' 細調 ' + fx(st2.fine, 2) + ' → 9/7 倍：(5, 4) 與 (' + (a2.twin ? a2.twin.m + ', ' + a2.twin.n : '—') + ') 都拍 ' + fx(a2.beat, 2));
    expect('h9', [tune(S(Object.assign({ fRef: 110, iv: 'fifth', coarse: -9 }, T)))], false, '偏一點就不算');
  }
  {
    const k4 = etKnob(refPos(48), 'fourth'), k5 = etKnob(refPos(53), 'fifth');
    const a = S(Object.assign({ fRef: refPos(48), iv: 'fourth', target: 'equal' }, k4, T)), b = S(Object.assign({ fRef: refPos(53), iv: 'fifth', target: 'equal' }, k5, T));
    expect('h10', [tune(a), tune(b)], true, '平均律四度 C3–F3（' + fx(an(a).beatSigned, 3) + '，寬）與五度 F3–C4（' + fx(an(b).beatSigned, 3) + '，窄）拍得一樣快：都是 3·F3 對 4·C3');
    const c = S(Object.assign({ fRef: refPos(52), iv: 'fifth', target: 'equal' }, etKnob(refPos(52), 'fifth'), T));
    expect('h10', [tune(a), tune(c)], false, '五度的參考音不是四度的上方音（E3）不算');
  }
}

// ---------- 隱藏任務兩兩不連帶 ----------
console.log('\n隱藏任務的解不會順便完成另一個隱藏任務');
{
  const hid = missions.filter(m => m.hidden);
  let bad = 0;
  hid.forEach(m => {
    const key = m.id.replace('beats-tuning-', '');
    const evs = found[key];
    if (!evs) { bad++; console.log('  ✗ ' + m.id + ' 沒有找到解'); return; }
    const also = hid.filter(o => o !== o.x && o.id !== m.id).filter(o => { o.mem = {}; return evs.some(e => o.check(e, o.mem)); }).map(o => o.id);
    if (also.length) { bad++; console.log('  ✗ ' + m.id + ' 的解也完成了 ' + also.join('、')); }
    else console.log('  ✓ ' + m.id + ' 的解只完成它自己');
  });
  if (bad) fail++;
}

// ---------- 亂按模擬 ----------
const RUNS = 600, STEPS = 60;
console.log('\n亂按模擬（' + RUNS + ' 回 × ' + STEPS + ' 步隨機操作；滑桿隨機拖到介面的格點，「跟著拍按」隨機按）');
{
  let seed = 4242;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const pickI = n => Math.floor(rnd() * n);
  const counts = {};
  const t0 = Date.now();
  for (let run = 0; run < RUNS; run++) {
    missions.forEach(m => { m.mem = {}; m.doneRun = false; });
    const st = S();
    for (let step = 0; step < STEPS; step++) {
      const a = pickI(12), evs = [];
      if (a === 0 || a === 1) { st.coarse = round(-20 + pickI(401) * 0.1, 1); st.touched = true; evs.push(tune(st, 'knob')); }
      else if (a === 2) { st.fine = round(-1 + pickI(201) * 0.01, 2); st.touched = true; evs.push(tune(st, 'knob')); }
      else if (a === 3) { st.iv = Core.IV_KEYS[pickI(5)]; evs.push(tune(st, 'interval')); }
      else if (a === 4) { st.target = st.target === 'just' ? 'equal' : 'just'; evs.push(tune(st, 'target')); }
      else if (a === 5) { st.mode = st.mode === 'pure' ? 'rich' : 'pure'; evs.push(tune(st, 'mode')); }
      else if (a === 6) { st.fRef = refPos(33 + pickI(49)); evs.push(tune(st, 'ref')); }
      else if (a === 7 || a === 8) { st.playing = true; evs.push(listen(st)); }
      else if (a === 9) st.playing = false;
      else {
        // 隨機按 3–8 下，間隔 0.15–2 秒、每下再抖動 ±40%
        const n = 3 + pickI(6), per = 0.15 + rnd() * 1.85, jit = [];
        for (let i = 0; i < n; i++) jit.push((rnd() - 0.5) * 0.8);
        if (st.playing) evs.push(...taps(st, per, n, jit));
      }
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
{
  const SUPSUB = new RegExp('[' + String.fromCharCode(0x2070) + '-' + String.fromCharCode(0x209F) + String.fromCharCode(0x20D0) + '-' + String.fromCharCode(0x20FF) + ']');
  const bad = missions.filter(m => SUPSUB.test(JSON.stringify([m.title, m.desc, m.riddle])));
  if (bad.length) { fail++; console.log('任務文字有 Unicode 上下標或組合字元：' + bad.map(m => m.id).join('、')); }
}
if (fail) { console.log(`有 ${fail} 項不符合。`); process.exit(1); }
console.log('全部任務都證明做得到，預設狀態不觸發，隱藏任務之間不連帶完成。');
