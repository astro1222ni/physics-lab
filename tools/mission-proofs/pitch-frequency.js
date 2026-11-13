/* 任務可達成的證明腳本。用法：node tools/mission-proofs/pitch-frequency.js
 * 用數學核心（js/pitch-frequency-core.js 的 analyze）模擬頁面發出的事件（格式與 js/pitch-frequency.js 相同），證明：
 *   1. 每個任務在滑桿範圍與精度內做得到（印出找到的解）；
 *   2. 預設狀態（440 Hz、標準音 440）按播放、存 A／B 再比較、換寫法，都不觸發任何任務；
 *   3. 隱藏任務兩兩不連帶：做某個隱藏任務的完整步驟，不會順便完成其他隱藏任務；
 *   4. 亂按模擬（2000 回 × 80 步）：6 級以上的公開任務亂按完成率 < 5%，隱藏任務 < 1%；
 *   5. 任務數量與等級符合規格（公開 10–12 個、隱藏 10 個、隱藏等級 3–10 且至少 3 個 ≥ 7、同一級最多 2 個隱藏任務）。
 * 滑桿精度：頻率滑桿每格 1 音分（位置 0–8700 = 比 A0 高幾音分）、標準音滑桿每格 1 Hz（400–466）；點數字打字：頻率與標準音都到 0.01 Hz。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const P = require(ROOT + 'js/pitch-frequency-core.js');
const missions = [];
global.window = { LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/pitch-frequency.js');
const byId = id => missions.find(m => m.id === 'pitch-frequency-' + id);
const r2 = v => Math.round(v * 100) / 100;

// ---------- 和頁面相同的狀態與事件 ----------
function Sim() {
  const st = { f: 440, a4: 440, flat: false, solfege: false, timbre: 'soft', A: null, B: null };
  const ev = [];
  const lite = () => { const a = P.analyze(st.f, st.a4); return { f: st.f, a4: st.a4, midi: a.midi, name: a.name, cents: a.cents }; };
  function pitch(via, prev, extra) {
    const a = P.analyze(st.f, st.a4);
    ev.push({ type: 'pitch', data: JSON.parse(JSON.stringify(Object.assign(a, { via: via, flat: st.flat, solfege: st.solfege, prev: prev,
      jump: P.cents(prev.f, st.f), dHz: st.f - prev.f }, extra || {}))) });
  }
  function setF(g, via, extra) {
    g = P.clampF(g);
    if (g === st.f) return;
    const prev = lite();
    st.f = g;
    pitch(via, prev, extra);
  }
  const api = {
    st, ev,
    /** 拖曳頻率滑桿到位置 p（整數，1 音分一格） */
    slide(p) { setF(P.fFromPos(Math.max(0, Math.min(P.POS_MAX, Math.round(p)))), 'slider'); return api; },
    /** 點頻率數字打字（到 0.01 Hz） */
    type(f) { setF(r2(f), 'slider'); return api; },
    key(m) { setF(P.etFreq(m, st.a4), 'key'); return api; },
    semi(d) { const g = P.step(st.f, d); if (g != null) setF(g, 'semi', { dir: d }); return api; },
    oct(d) { const g = P.step(st.f, 12 * d); if (g != null) setF(g, 'oct', { dir: d }); return api; },
    add100() { const g = P.add100(st.f); if (g) setF(g.f, 'add100'); return api; },
    /** 標準音：滑桿（整數）、打字（0.01）或按鈕 */
    a4(v, typed) {
      v = P.clampA4(typed ? r2(v) : Math.round(v));
      if (v === st.a4) return api;
      const prev = lite();
      st.a4 = v;
      pitch('a4', prev);
      return api;
    },
    spell(flat) { if (st.flat !== flat) { const prev = lite(); st.flat = flat; pitch('spell', prev); } return api; },
    solfege() { const prev = lite(); st.solfege = !st.solfege; pitch('solfege', prev); return api; },
    play() { ev.push({ type: 'play', data: Object.assign(P.analyze(st.f, st.a4), { flat: st.flat, solfege: st.solfege, timbre: st.timbre }) }); return api; },
    storeA() { st.A = lite(); return api; },
    storeB() { st.B = lite(); return api; },
    compare() { if (st.A && st.B) ev.push({ type: 'compare', data: JSON.parse(JSON.stringify({ A: st.A, B: st.B, cents: P.cents(st.A.f, st.B.f), dHz: st.B.f - st.A.f })) }); return api; },
    clear() { st.A = null; st.B = null; return api; }
  };
  return api;
}
/** 依序把事件送進任務；傳回完成的任務代號 */
function run(evs, list) {
  list = list || missions;
  list.forEach(m => { m.mem = {}; });
  const done = new Set();
  evs.forEach(e => list.forEach(m => { if (!done.has(m.id) && m.check(e, m.mem)) done.add(m.id); }));
  return done;
}
let fail = 0;
function prove(id, sim, msg) {
  const m = byId(id);
  const ok = run(sim.ev, [m]).has(m.id);
  if (!ok) fail++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + m.id + '（' + m.level + ' 級' + (m.hidden ? '・隱藏' : '') + '）：' + msg);
  return sim;
}
const last = s => s.ev[s.ev.length - 1].data;
const fx = (v, d) => v.toFixed(d);

console.log('一、每個任務都做得到');
prove('1', Sim().key(60), '點 C4 的鍵 → ' + fx(P.etFreq(60, 440), 3) + ' Hz');
prove('2', Sim().solfege().key(67), '打開唱名、點 G4（Sol）→ ' + fx(P.etFreq(67, 440), 3) + ' Hz');
{ const s = Sim().oct(1); prove('3', s, '預設 440 Hz 按「＋1 八度」→ ' + fx(last(s).f, 2) + ' Hz'); }
{ const s = Sim().type(1000); const d = last(s); prove('4', s, '打字 1000 Hz → 週期 ' + fx(d.T, 3) + ' ms，' + d.name + ' ' + fx(d.cents, 2) + ' 音分'); }
{ const s = Sim().a4(442); const d = last(s); prove('5', s, '按「442」→ 440 Hz 變成 ' + d.name + ' ' + fx(d.cents, 2) + ' 音分'); }
prove('6', Sim().key(21).key(108), '點 A0（27.5 Hz）與 C8（' + fx(P.etFreq(108, 440), 3) + ' Hz）；也可以把滑桿拉到最左、最右');
{ const s = Sim().type(55).add100(); prove('7', s, '55 Hz 加 100 Hz → 155 Hz，跨 ' + fx(last(s).jump, 1) + ' 音分'); }
{ const s = Sim().key(96).add100(); prove('8', s, 'C7（' + fx(P.etFreq(96, 440), 2) + ' Hz）加 100 Hz，只升 ' + fx(last(s).jump, 1) + ' 音分（高音區 > 1683.6 Hz 都可以）'); }
{
  const s = Sim().type(343); const d = last(s);
  // 滑桿也做得到：找最接近的格子
  const p = Math.round(P.posFromF(343)), fs = P.fFromPos(p);
  prove('9', s, '打字 343 Hz → λ = ' + fx(d.lambda, 4) + ' m（' + d.name + ' ' + fx(d.cents, 1) + ' 音分）；滑桿位置 ' + p + ' 是 ' + fx(fs, 2) + ' Hz、λ = ' + fx(343 / fs, 4) + ' m');
}
{ const s = Sim().key(55).play().key(81).play(); prove('10', s, '點 G3（' + fx(P.etFreq(55, 440), 2) + ' Hz）播放、點 A5（' + fx(P.etFreq(81, 440), 1) + ' Hz）播放：兩者都在 ' + P.analyze(P.etFreq(55, 440), 440).insts.filter(x => x === 'violin' || x === 'cello').join(' 與 ') + ' 的音域裡'); }
{ const s = Sim().a4(415).key(69).a4(440); const d = last(s); prove('11', s, '按 415、點 A4（415 Hz）、按 440 → ' + d.name + ' ' + fx(d.cents, 2) + ' 音分'); }
{
  const s = Sim().key(45).storeA().key(57).storeB().compare().key(81).storeA().key(93).storeB().compare();
  prove('12', s, 'A2→A3（110 Hz 差、1200 音分）和 A5→A6（880 Hz 差、1200 音分）：赫茲差 8 倍');
}
const hiddenSol = {};
hiddenSol.h1 = prove('h1', Sim().type(60).play(), '打字 60 Hz、播放（' + P.analyze(60, 440).name + ' ' + fx(P.analyze(60, 440).cents, 1) + ' 音分）');
hiddenSol.h2 = prove('h2', Sim().key(60).storeA().semi(1).semi(1).semi(1).semi(1).semi(1).semi(1).storeB().compare(), 'C4 存 A、按六次「＋1 半音」到 F♯4 存 B、比較：600 音分');
hiddenSol.h3 = prove('h3', Sim().a4(435).key(69).play(), '標準音 435、點 A4（435 Hz）、播放');
hiddenSol.h4 = prove('h4', Sim().type(27.5).storeA().type(28.5).storeB().compare(), '27.5 Hz 存 A、28.5 Hz 存 B：差 1 Hz、' + fx(P.cents(27.5, 28.5), 1) + ' 音分');
{
  const mid = (27.5 + P.F_MAX) / 2;
  const p = Math.round(P.posFromF(mid));
  hiddenSol.h5 = prove('h5', Sim().type(mid), '打字 ' + fx(r2(mid), 2) + ' Hz（' + P.analyze(mid, 440).name + ' +' + fx(P.analyze(mid, 440).cents, 1) + ' 音分）；滑桿位置 ' + p + ' 是 ' + fx(P.fFromPos(p), 2) + ' Hz');
}
{
  const g = r2(P.etFreq(63.55, 440));
  const a = P.analyze(g, 440), b = P.analyze(g, 442);
  hiddenSol.h6 = prove('h6', Sim().type(g).play().a4(442).play(), '打字 ' + g + ' Hz：440 標準是 ' + a.name + ' ' + fx(a.cents, 1) + '，換成 442 變成 ' + b.name + ' +' + fx(b.cents, 1) + '；前後各播放一次');
}
{
  const a4 = r2(256 / Math.pow(2, -9 / 12));
  const s = Sim().a4(a4, true).key(60);
  hiddenSol.h7 = prove('h7', s, '標準音打字 ' + a4 + ' Hz、點 C4 → ' + fx(last(s).f, 4) + ' Hz、偏差 ' + fx(last(s).cents, 3) + ' 音分');
}
hiddenSol.h8 = prove('h8', Sim().type(100).add100().add100().add100().add100(), '100 Hz 連按四次加 100 Hz：100 → 200 → 300 → 400 → 500（1200、702、498、386 音分）');
{
  const f0 = r2(P.add100Start(100));
  const s = Sim().type(f0).semi(1);
  hiddenSol.h9 = prove('h9', s, '打字 ' + f0 + ' Hz、按「＋1 半音」→ 多了 ' + fx(last(s).dHz, 3) + ' Hz');
}
hiddenSol.h10 = prove('h10', Sim().a4(465).key(69).storeA().a4(415).key(69).storeB().compare(), '標準音 465 的 A4 存 A、415 的 A4 存 B、比較：' + fx(P.cents(415, 465), 1) + ' 音分');

console.log('\n二、預設狀態不觸發任何任務');
{
  const s = Sim();
  s.play().storeA().storeB().compare().spell(true).spell(false).play();
  const done = run(s.ev);
  if (done.size) { fail++; console.log('  ✗ 預設狀態就完成了：' + Array.from(done).join('、')); }
  else console.log('  ✓ 預設（440 Hz、標準音 440）播放、存 A 和 B 再比較、切換升降記號：沒有任務完成');
  // 只按一個標準音按鈕、一個八度或半音、一次加 100 Hz，只會完成說明裡要求的那一個
  const one = [['按 443', Sim().a4(443)], ['按 415', Sim().a4(415)], ['＋1 半音', Sim().semi(1)], ['−1 八度', Sim().oct(-1)], ['加 100 Hz', Sim().add100()], ['唱名', Sim().solfege()]];
  one.forEach(([n, s2]) => {
    const d = run(s2.ev.concat([{ type: 'play', data: Object.assign(P.analyze(s2.st.f, s2.st.a4), { flat: false, solfege: s2.st.solfege }) }]));
    if (d.size) { fail++; console.log('  ✗ 只' + n + '就完成：' + Array.from(d).join('、')); }
    else console.log('  ✓ 只' + n + '再播放：沒有任務完成');
  });
}

console.log('\n三、隱藏任務兩兩不連帶');
{
  const hidden = missions.filter(m => m.hidden);
  let bad = 0;
  hidden.forEach(h => {
    const key = h.id.replace('pitch-frequency-', '');
    const done = run(hiddenSol[key].ev, hidden);
    const extra = Array.from(done).filter(id => id !== h.id);
    if (extra.length) { bad++; console.log('  ✗ ' + h.id + ' 的解也完成了 ' + extra.join('、')); }
    else console.log('  ✓ ' + h.id + ' 的解不會完成其他隱藏任務');
  });
  if (bad) fail++;
}

console.log('\n四、亂按模擬（2000 回 × 80 步；滑桿拖到隨機格子，其中兩成拖到最左或最右）');
{
  let seed = 20261113;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const pickI = n => Math.floor(rnd() * n);
  const counts = {};
  for (let r = 0; r < 2000; r++) {
    const s = Sim();
    for (let k = 0; k < 80; k++) {
      const a = pickI(16);
      if (a === 0 || a === 1) s.slide(rnd() < 0.2 ? (rnd() < 0.5 ? 0 : P.POS_MAX) : rnd() * P.POS_MAX);
      else if (a === 2 || a === 3) s.key(21 + pickI(88));
      else if (a === 4) s.semi(rnd() < 0.5 ? 1 : -1);
      else if (a === 5) s.oct(rnd() < 0.5 ? 1 : -1);
      else if (a === 6) s.add100();
      else if (a === 7) s.a4(rnd() < 0.2 ? (rnd() < 0.5 ? P.A4_MIN : P.A4_MAX) : P.A4_MIN + rnd() * (P.A4_MAX - P.A4_MIN));
      else if (a === 8) s.a4(P.A4_PRESETS[pickI(4)]);
      else if (a === 9) s.spell(rnd() < 0.5);
      else if (a === 10) s.solfege();
      else if (a === 11 || a === 12) s.play();
      else if (a === 13) s.storeA();
      else if (a === 14) s.storeB();
      else { if (rnd() < 0.85) s.compare(); else s.clear(); }
    }
    run(s.ev).forEach(id => { counts[id] = (counts[id] || 0) + 1; });
  }
  const pct = id => (counts[id] || 0) / 2000 * 100;
  console.log('  ' + missions.map(m => m.id + (m.hidden ? '（隱藏 ' : '（') + m.level + ' 級）' + pct(m.id).toFixed(2) + '%').join('\n  '));
  const risky = missions.filter(m => !m.hidden && m.level >= 6 && pct(m.id) >= 5);
  const riskyH = missions.filter(m => m.hidden && pct(m.id) >= 1);
  if (risky.length) { fail++; console.log('  ✗ 6 級以上的公開任務亂按完成率超過 5%：' + risky.map(m => m.id).join('、')); }
  else console.log('  ✓ 6 級以上的公開任務亂按完成率都不到 5%');
  if (riskyH.length) { fail++; console.log('  ✗ 隱藏任務亂按完成率超過 1%：' + riskyH.map(m => m.id).join('、')); }
  else console.log('  ✓ 隱藏任務亂按完成率都不到 1%');
}

console.log('\n五、任務數量與等級');
{
  const pub = missions.filter(m => !m.hidden), hid = missions.filter(m => m.hidden);
  const checks = [
    [pub.length >= 10 && pub.length <= 12, '公開任務 ' + pub.length + ' 個（等級 ' + pub.map(m => m.level).join('、') + '）'],
    [hid.length === 10, '隱藏任務 ' + hid.length + ' 個（等級 ' + hid.map(m => m.level).join('、') + '，星星 = 等級 × 2）'],
    [hid.every(m => m.level >= 3 && m.level <= 10), '隱藏任務等級都在 3–10'],
    [hid.filter(m => m.level >= 7).length >= 3, '隱藏任務 7 級以上有 ' + hid.filter(m => m.level >= 7).length + ' 個'],
    [Object.values(hid.reduce((o, m) => { o[m.level] = (o[m.level] || 0) + 1; return o; }, {})).every(n => n <= 2), '同一級的隱藏任務最多 2 個'],
    [pub.every(m => m.title && m.title.zh && m.title.en && m.desc && m.desc.zh && m.desc.en), '公開任務都有中英標題與說明'],
    [hid.every(m => m.riddle && m.riddle.zh && m.riddle.en && !m.title && !m.desc), '隱藏任務只有中英謎語'],
    [new Set(missions.map(m => m.id)).size === missions.length && missions.every(m => /^pitch-frequency-(h?\d+)$/.test(m.id)), '代號不重複、格式正確'],
    [missions.every(m => !/[\u2070-\u209f\u20d0-\u20ff]/.test(JSON.stringify([m.title, m.desc, m.riddle]))), '沒有 Unicode 上下標或組合字元']
  ];
  checks.forEach(c => { if (!c[0]) fail++; console.log((c[0] ? '  ✓ ' : '  ✗ ') + c[1]); });
}

console.log(fail ? '\n有 ' + fail + ' 項沒有通過。' : '\n全部任務都證明做得到，預設狀態不觸發，隱藏任務互不連帶、亂按不誤觸。');
process.exit(fail ? 1 : 0);
