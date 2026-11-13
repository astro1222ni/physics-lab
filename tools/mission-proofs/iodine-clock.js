/* 任務可達成的證明腳本。用法：node tools/mission-proofs/iodine-clock.js
 * 用化學核心模擬頁面（js/iodine-clock.js）的操作與事件：按「混合並計時」→ 變藍時記入數據表並送 'run'
 *（摘要由核心的 runSummary 產生，和頁面用的是同一個函式）；硫代硫酸根過量時，等到氧化劑用掉 99% 送 'never'；
 * 「核對」送 'answer'（統計由核心的 answerStats 產生）。學生的計算（速率、k、級數）都只用數據表上看得到的數字。
 * 確認每個任務都做得到、預設狀態不會觸發任務、每個隱藏任務的做法不會順便完成別的隱藏任務。修改核心、頁面事件或任務條件後重跑。 */
'use strict';
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const C = require(__ROOT + 'js/iodine-clock-core.js');
let missions = [];
global.LabMission = { register: (m, l) => { missions = l.map(x => Object.assign({}, x)); } };
global.window = { LabMission: global.LabMission };
require(__ROOT + 'js/missions/iodine-clock.js');

let bad = 0;
const done = {};
const hid = id => /-h\d+$/.test(id);

// ---------- 模擬頁面（與 js/iodine-clock.js 的 mix／finish／checkAnswer 一致） ----------
function newPage() {
  missions.forEach(m => { m.done = false; });
  return { runs: [], seq: 0, rx: 'ps', unk: null, unkId: 0, tries: 0, revealed: false, okAfter: null, events: [], wall: 0,
    o: { VKI: 10, VP: 10, VS: 2.5, T: 25, salt: true } };
}
function emit(P, type, data) {
  const ev = { type, data };
  missions.forEach(m => { if (!m.done && m.check(ev)) { m.done = true; P.events.push(m.id); } });
}
function set(P, o) { Object.assign(P.o, o); }
function startUnknown(P, u) { P.rx = 'x'; P.unk = u; P.unkId++; P.tries = 0; P.revealed = false; P.okAfter = null; }
function backToPS(P) { P.rx = 'ps'; P.unk = null; }
/** 按「混合並計時」，等到變藍（或確定不會變藍）。speed：頁面的播放倍率，用來估真實時間 */
function mix(P, speed) {
  const o = Object.assign({}, P.o, P.rx === 'x' ? { unk: P.unk } : {});
  const p = C.params(o), pl = C.plan(p);
  const rec = C.record(++P.seq, o, p, pl, P.unkId);
  P.wall += (pl.never ? pl.tDone : pl.tVis) / (speed || 100);
  P.runs.push(rec);
  if (pl.never) emit(P, 'never', { rx: rec.rx, unk: rec.unk, T: rec.T, salt: rec.salt, I0: rec.I0, P0: rec.P0, S0: rec.S0, ratio: rec.S0 / (2 * rec.P0) });
  else {
    let sinceOk = null;
    if (rec.rx === 'x' && P.okAfter != null) sinceOk = P.runs.filter(r => r.rx === 'x' && r.unk === rec.unk && r.id > P.okAfter && r.id < rec.id).length;
    emit(P, 'run', Object.assign({}, rec, C.runSummary(P.runs, rec), { sinceOk }));
  }
  return rec;
}
/** 按「核對」：m、n 是學生填的級數，k 是 25 °C 的速率常數（數字或字串） */
function answer(P, m, n, k) {
  P.tries++;
  const truth = P.rx === 'x' ? P.unk : { m: 1, n: 1, k25: C.kPS(25, C.MU_REF) };
  const kv = typeof k === 'string' ? C.parseNum(k) : k;
  const kErr = isFinite(kv) && kv > 0 ? Math.abs(kv / truth.k25 - 1) : null;
  const mOk = m === truth.m, nOk = n === truth.n;
  if (P.rx === 'x' && mOk && nOk && P.okAfter == null) P.okAfter = P.seq;
  emit(P, 'answer', Object.assign({ rx: P.rx, unk: P.rx === 'x' ? P.unkId : 0, m, n, k: kv, mOk, nOk, kErr, tries: P.tries, revealed: P.revealed },
    C.answerStats(P.runs, P.rx, P.rx === 'x' ? P.unkId : 0)));
  return kErr;
}
function report(name, P, ids) {
  const ok = ids.every(id => P.events.includes(id));
  const extraHidden = P.events.filter(x => hid(x) && !ids.includes(x));
  ids.forEach(id => { if (P.events.includes(id)) done[id] = true; });
  console.log('  ' + (ok && !extraHidden.length ? '✓' : '✗') + ' ' + name + '：' + (P.events.length ? P.events.join('、') : '（沒有任務）') +
    (extraHidden.length ? '　← 順便完成了 ' + extraHidden.join('、') : ''));
  if (!ok || extraHidden.length) bad++;
}
const f2 = x => x.toFixed(2), f3 = x => x.toFixed(3), pc = x => (x * 100).toFixed(2) + '%';
/** 學生由數據表算 k：rate ÷ ([X]₀ᵐ[I⁻]₀ⁿ) */
const kOf = (r, m, n) => r.rate / (Math.pow(r.P0, m) * Math.pow(r.I0, n));

// ---------- 0. 預設狀態不觸發任務 ----------
{
  const P = newPage();
  // 不操作：頁面不會自己混合，沒有任何事件
  if (P.events.length) { console.log('  ✗ 沒操作就觸發了任務'); bad++; } else console.log('  ✓ 沒操作時頁面不送任何事件（一定要按「混合並計時」）');
  const r = mix(P, 1);
  const extra = P.events.filter(x => x !== 'iodine-clock-1');
  console.log('  ' + (extra.length ? '✗' : '✓') + ' 預設配方直接混合：t = ' + f2(r.t) + ' s，只完成任務 1' + (extra.length ? '，卻也完成了 ' + extra.join('、') : ''));
  if (extra.length) bad++;
  done['iodine-clock-1'] = P.events.includes('iodine-clock-1');
  // 預設配方連按幾次：還是只有任務 1
  mix(P, 1); mix(P, 1);
  if (P.events.some(x => x !== 'iodine-clock-1')) { console.log('  ✗ 預設配方重複混合觸發了其他任務：' + P.events.join('、')); bad++; }
  else console.log('  ✓ 預設配方重複混合三次，沒有觸發其他任務');
}

// ---------- 1. 公開任務：過硫酸根 ----------
{
  let P = newPage();
  set(P, { VKI: 13 }); const r = mix(P, 1);
  report('碘化鉀 13 mL：t = ' + f2(r.t) + ' s', P, ['iodine-clock-1', 'iodine-clock-2']);

  P = newPage();
  const a = mix(P, 10); set(P, { VKI: 20 }); const b = mix(P, 10);
  report('碘化鉀 10 → 20 mL：t = ' + f2(a.t) + ' → ' + f2(b.t) + ' s，速率比 ' + f3(b.rate / a.rate), P, ['iodine-clock-3']);

  P = newPage();
  const c25 = mix(P, 10); set(P, { T: 35 }); const c35 = mix(P, 10);
  report('同一配方 25 °C 與 35 °C：t = ' + f2(c25.t) + '、' + f2(c35.t) + ' s，速率比 ' + f3(c25.t / c35.t), P, ['iodine-clock-4']);

  // 初速率法：I⁻ 三種、S₂O₈²⁻ 三種（保持離子強度），再寫速率定律與 k
  P = newPage();
  const rs = [];
  [5, 10, 20].forEach(v => { set(P, { VKI: v, VP: 10 }); rs.push(mix(P, 10)); });
  [5, 20].forEach(v => { set(P, { VKI: 10, VP: v }); rs.push(mix(P, 10)); });
  const gI = C.orderGroup(P.runs, rs[1], 'I'), gP = C.orderGroup(P.runs, rs[1], 'P');
  report('保持離子強度：碘化鉀 5、10、20 mL（斜率 ' + f3(gI.slope) + '）；過硫酸銨 5、10、20 mL（斜率 ' + f3(gP.slope) + '）', P, ['iodine-clock-5', 'iodine-clock-6']);
  const k25 = rs.reduce((s, r) => s + kOf(r, 1, 1), 0) / rs.length;
  const e = answer(P, 1, 1, k25.toPrecision(3));
  report('答 m = 1、n = 1、k = ' + k25.toPrecision(3) + '（五次的平均，誤差 ' + pc(e) + '）', P, ['iodine-clock-7', 'iodine-clock-8']);
  // 對照：照反應式係數寫 n = 2 不算；沒做實驗就猜也不算
  let Q = newPage(); answer(Q, 1, 1, 0.008);
  const P2 = newPage(); mix(P2); answer(P2, 1, 2, k25);
  if (Q.events.length || P2.events.some(x => x === 'iodine-clock-7' || x === 'iodine-clock-8')) { console.log('  ✗ 沒做實驗就猜、或照係數寫 n = 2，不該完成任務 7、8'); bad++; }
  else console.log('  ✓ 沒做實驗就猜答案、或照反應式係數寫 n = 2，都不算任務 7、8');

  P = newPage();
  [15, 25, 35].forEach(T => { set(P, { T }); mix(P, 10); });
  const a3 = C.arrGroup(P.runs, P.runs[2]);
  report('同一配方 15、25、35 °C：Ea = ' + a3.Ea.toFixed(2) + ' kJ/mol', P, ['iodine-clock-9']);
}

// ---------- 2. 公開任務：未知氧化劑（300 個隨機未知反應） ----------
{
  let rs = 20261113;
  const rng = () => { rs = (rs * 16807) % 2147483647; return rs / 2147483647; };
  const N = 300;
  let ok = 0, worst = 0, extraHid = 0, wall = 0;
  const combos = {};
  for (let i = 0; i < N; i++) {
    const P = newPage();
    const u = C.newUnknown(rng);
    combos[u.m + ',' + u.n] = (combos[u.m + ',' + u.n] || 0) + 1;
    startUnknown(P, u);
    // 三杯：基準、X 加倍、碘化鉀加倍（硫代硫酸根少一點，25 °C）
    set(P, { VKI: 8, VP: 8, VS: 1, T: 25, salt: true });
    const b0 = mix(P, 100);
    set(P, { VP: 16 }); const b1 = mix(P, 100);
    set(P, { VP: 8, VKI: 16 }); const b2 = mix(P, 100);
    const m = Math.round(Math.log2(b1.rate / b0.rate)), n = Math.round(Math.log2(b2.rate / b0.rate));
    const k = [b0, b1, b2].reduce((s, r) => s + kOf(r, m, n), 0) / 3;
    const e = answer(P, m, n, k);
    worst = Math.max(worst, e == null ? 1 : e);
    wall += P.wall;
    if (['iodine-clock-10', 'iodine-clock-11', 'iodine-clock-12'].every(id => P.events.includes(id))) ok++;
    if (P.events.some(hid)) extraHid++;
  }
  console.log('  ' + (ok === N && !extraHid ? '✓' : '✗') + ' 未知氧化劑 ' + N + ' 個（m、n 九種組合各 ' + Object.values(combos).join('、') + ' 個）：三杯（基準、X 加倍、碘化鉀加倍）求級數與 k，' +
    '第一次核對全對的有 ' + ok + ' 個，k 最大誤差 ' + pc(worst) + '（×100 時平均真實等待 ' + (wall / N).toFixed(1) + ' s）' + (extraHid ? '，順便完成隱藏任務 ' + extraHid + ' 次' : ''));
  if (ok === N && !extraHid) ['iodine-clock-10', 'iodine-clock-11', 'iodine-clock-12'].forEach(id => { done[id] = true; }); else bad++;
  // 揭曉後不算；第二次核對才對不算任務 12
  const P = newPage(); const u = C.newUnknown(rng); startUnknown(P, u);
  set(P, { VKI: 8, VP: 8, VS: 1 }); mix(P); set(P, { VP: 16 }); mix(P); set(P, { VP: 8, VKI: 16 }); mix(P);
  answer(P, (u.m + 1) % 3, u.n, u.k25);
  answer(P, u.m, u.n, u.k25);
  P.revealed = true; const before = P.events.slice();
  answer(P, u.m, u.n, u.k25);
  const ok12 = !before.includes('iodine-clock-12') && before.includes('iodine-clock-11') && P.events.length === before.length;
  console.log('  ' + (ok12 ? '✓' : '✗') + ' 第一次答錯、第二次才對：不算任務 12（11 算）；揭曉答案後再核對不算');
  if (!ok12) bad++;
}

// ---------- 3. 隱藏任務（每個做法只完成它自己這個隱藏任務） ----------
{
  let P = newPage();
  set(P, { VS: 0 }); let r = mix(P, 1);
  report('不加硫代硫酸鈉（0 mL）：t = ' + f2(r.t) + ' s', P, ['iodine-clock-h1']);

  P = newPage();
  set(P, { VKI: 0.5, VP: 20, VS: 9, T: 5 }); r = mix(P, 1000);
  report('碘化鉀 0.5 mL、過硫酸銨 20 mL、硫代硫酸鈉 9 mL、5 °C：t = ' + f2(r.t) + ' s（×1000 真實約 ' + (r.t / 1000).toFixed(0) + ' s）', P, ['iodine-clock-h2']);

  P = newPage();
  set(P, { VKI: 20, VP: 20, VS: 0.5, T: 45 }); r = mix(P, 1);
  report('碘化鉀 20、過硫酸銨 20、硫代硫酸鈉 0.5 mL、45 °C：t = ' + f2(r.t) + ' s', P, ['iodine-clock-h3']);

  P = newPage();
  set(P, { VKI: 20, VP: 0.5, VS: 9, T: 25 }); r = mix(P, 1000);
  const tDone = C.plan(C.params(P.o)).tDone;
  report('過硫酸銨 0.5 mL、硫代硫酸鈉 9 mL（硫代硫酸根是 2 倍過硫酸根的 ' + (r.S0 / 2 / r.P0).toFixed(2) + ' 倍）：' + f2(tDone) + ' s 後確定不會變藍（×1000 約 ' + (tDone / 1000).toFixed(0) + ' s）', P, ['iodine-clock-h4']);

  P = newPage();
  [5, 10, 20].forEach(v => { set(P, { VKI: v, VP: 2, VS: 1, salt: false }); r = mix(P, 10); });
  report('取消「保持離子強度」、過硫酸銨 2 mL、碘化鉀 5、10、20 mL：I⁻ 的斜率 ' + f3(C.orderGroup(P.runs, r, 'I').slope), P, ['iodine-clock-h5']);
  // 對照：保持離子強度、同樣的配方，斜率回到 1，不算 h5
  P = newPage();
  [5, 10, 20].forEach(v => { set(P, { VKI: v, VP: 2, VS: 1, salt: true }); r = mix(P, 10); });
  console.log('  ' + (P.events.includes('iodine-clock-h5') ? '✗' : '✓') + ' 對照：保持離子強度時同樣三杯的斜率 ' + f3(C.orderGroup(P.runs, r, 'I').slope) + '，不算 h5');
  if (P.events.includes('iodine-clock-h5')) bad++;

  P = newPage();
  set(P, { VKI: 20, VP: 1, VS: 5, T: 25 }); r = mix(P, 100);
  report('過硫酸銨 1 mL、硫代硫酸鈉 5 mL（[S₂O₃²⁻]₀ = [S₂O₈²⁻]₀ = ' + r.S0.toFixed(4) + ' M）：t = ' + f2(r.t) + ' s；半生期 ln2/(k[I⁻]₀) = ' + f2(Math.LN2 / (C.kPS(25, C.MU_REF) * r.I0)) + ' s', P, ['iodine-clock-h6']);

  P = newPage();
  set(P, { VKI: 5, VP: 20, VS: 1 }); const a = mix(P, 10); set(P, { VKI: 20, VP: 5 }); r = mix(P, 10);
  report('碘化鉀 5、過硫酸銨 20 → 碘化鉀 20、過硫酸銨 5（硫代硫酸鈉 1 mL）：t = ' + f2(a.t) + ' → ' + f2(r.t) + ' s', P, ['iodine-clock-h7']);

  P = newPage();
  set(P, { VKI: 5, T: 40 }); const hot = mix(P, 10);
  const v2 = Math.round(5 * C.kPS(40, C.MU_REF) / C.kPS(20, C.MU_REF) * 100) / 100;
  set(P, { VKI: v2, T: 20 }); r = mix(P, 10);
  report('40 °C、碘化鉀 5 mL → 20 °C、碘化鉀 ' + v2 + ' mL（打字輸入）：t = ' + f2(hot.t) + '、' + f2(r.t) + ' s', P, ['iodine-clock-h8']);

  // h9：只在 20 °C 與 30 °C 做，用阿瑞尼斯式推到 25 °C
  P = newPage();
  const pts = [];
  [20, 30].forEach(T => { set(P, { VKI: 20, VP: 20, VS: 1, T }); const q = mix(P, 10); pts.push({ T, k: kOf(q, 1, 1) }); });
  const k25 = C.kAt25(pts);
  const e = answer(P, 1, 1, k25.toPrecision(3));
  report('只在 20、30 °C 做，k 推到 25 °C = ' + k25.toPrecision(3) + '（誤差 ' + pc(e) + '）', P, ['iodine-clock-h9', 'iodine-clock-7', 'iodine-clock-8'].filter((x, i) => i === 0 || P.events.includes(x)));

  // h10：未知反應，答對級數之後的第一杯就是 100 秒（200 個未知反應）
  let rs = 99;
  const rng = () => { rs = (rs * 16807) % 2147483647; return rs / 2147483647; };
  let ok10 = 0, extra10 = 0; const N = 200;
  for (let i = 0; i < N; i++) {
    P = newPage();
    const u = C.newUnknown(rng);
    startUnknown(P, u);
    set(P, { VKI: 8, VP: 8, VS: 1, T: 25 });
    const b0 = mix(P, 100);
    set(P, { VP: 16 }); const b1 = mix(P, 100);
    set(P, { VP: 8, VKI: 16 }); const b2 = mix(P, 100);
    const m = Math.round(Math.log2(b1.rate / b0.rate)), n = Math.round(Math.log2(b2.rate / b0.rate));
    answer(P, m, n, '');
    // 學生的推理：n > 0 時 t ∝ 1/[I⁻]ⁿ（時鐘期間 [I⁻] 不變）→ 改碘化鉀的體積；n = 0 時用積分式改硫代硫酸鈉的體積
    let o;
    if (n > 0) {
      const base = b0.t > 100 ? b0 : b2;   // 要讓體積變大或變小都在 0.5–20 mL 內
      const v = Math.round(base.VKI * Math.pow(base.t / 100, 1 / n) * 100) / 100;
      o = { VKI: v, VP: base.VP, VS: base.VS };
    } else {
      // n = 0：t = g(Δ)/k，g 由 m 決定；從 b0 求 k 後解 Δ（Δ = [S₂O₃²⁻]₀/2）
      const g = (d, A0) => m === 0 ? d : m === 1 ? -Math.log(1 - d / A0) : 1 / (A0 - d) - 1 / A0;
      const kk = g(b0.S0 / 2, b0.P0) / b0.t;
      let lo = 0, hi = b0.P0 * 0.999;
      for (let it = 0; it < 80; it++) { const mid = (lo + hi) / 2; if (g(mid, b0.P0) / kk < 100) lo = mid; else hi = mid; }
      o = { VKI: b0.VKI, VP: b0.VP, VS: Math.round(2 * lo * C.V_TOTAL / C.STOCK.S * 100) / 100 };
    }
    set(P, o);
    if (o.VKI < 0.5 || o.VKI > 20 || o.VS > 9) continue;
    mix(P, 100);
    if (P.events.includes('iodine-clock-h10')) ok10++;
    if (P.events.some(x => hid(x) && x !== 'iodine-clock-h10')) extra10++;
  }
  console.log('  ' + (ok10 >= N * 0.9 && !extra10 ? '✓' : '✗') + ' 未知氧化劑 ' + N + ' 個：答對級數後，由 t ∝ 1/[I⁻]ⁿ（或積分式）算配方，第一杯就在 99.5–100.5 s 的有 ' + ok10 + ' 個' +
    (extra10 ? '，順便完成其他隱藏任務 ' + extra10 + ' 次' : ''));
  if (ok10 >= N * 0.9 && !extra10) done['iodine-clock-h10'] = true; else bad++;
  // 對照：答對以前的實驗、或答對後的第二杯才 100 s，不算
  P = newPage(); const u = C.newUnknown(rng); startUnknown(P, u); set(P, { VKI: 8, VP: 8, VS: 1 });
  mix(P); answer(P, u.m, u.n, ''); mix(P);
  const before = P.events.includes('iodine-clock-h10');
  console.log('  ' + (before ? '✗' : '✓') + ' 對照：答對後第一杯不是 100 s，之後的杯子即使 100 s 也不算（sinceOk 只有 0 才算）');
  if (before) bad++;
}

// ---------- 4. 隱藏任務彼此不連帶：把每個做法的那一杯單獨拿出來，檢查有沒有同時滿足別的隱藏條件 ----------
{
  const singles = [
    ['h1', { VS: 0 }], ['h2', { VKI: 0.5, VP: 20, VS: 9, T: 5 }], ['h3', { VKI: 20, VP: 20, VS: 0.5, T: 45 }],
    ['h6', { VKI: 20, VP: 1, VS: 5 }]
  ];
  let ok = true;
  singles.forEach(([h, o]) => {
    const P = newPage(); set(P, o); mix(P, 100);
    const others = P.events.filter(x => hid(x) && x !== 'iodine-clock-' + h);
    if (others.length) { ok = false; console.log('  ✗ ' + h + ' 的那一杯也完成了 ' + others.join('、')); }
  });
  console.log('  ' + (ok ? '✓' : '✗') + ' 單杯的隱藏任務（h1、h2、h3、h6）彼此不連帶完成');
  if (!ok) bad++;
}

// ---------- 總結 ----------
const missing = missions.filter(m => !done[m.id]).map(m => m.id);
console.log(missing.length ? '  ✗ 沒有證明到的任務：' + missing.join('、') : '  ✓ ' + missions.length + ' 個任務都證明做得到');
if (missing.length) bad++;
const hidLv = missions.filter(m => m.hidden).map(m => m.level);
const lvOk = hidLv.length === 10 && Math.min.apply(null, hidLv) >= 3 && Math.max.apply(null, hidLv) <= 10 && hidLv.filter(l => l >= 7).length >= 3;
console.log('  ' + (lvOk ? '✓' : '✗') + ' 隱藏任務 ' + hidLv.length + ' 個，等級 ' + hidLv.join('、') + '（7 級以上 ' + hidLv.filter(l => l >= 7).length + ' 個）');
if (!lvOk) bad++;
console.log('    （公開 ' + missions.filter(m => !m.hidden).reduce((a, m) => a + m.level, 0) + ' 顆星、隱藏 ' + missions.filter(m => m.hidden).reduce((a, m) => a + m.level * 2, 0) + ' 顆星）');
if (bad) { console.log('失敗 ' + bad + ' 項'); process.exitCode = 1; }
