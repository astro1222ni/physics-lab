/* 任務可達成的證明腳本。用法：node tools/mission-proofs/adsr-envelope.js
 * 用數學核心（js/adsr-envelope-core.js）證明每個任務在滑桿範圍與精度內做得到（事件資料由 AdsrCore.envData／releaseData 產生，和頁面相同），
 * 預設狀態不觸發任何任務，10 個隱藏任務兩兩不會連帶完成，並用亂按模擬確認隱藏任務與 6 級以上的任務亂按完成的比例不到 5%。
 * 介面精度：起音 A、衰減 D、釋音 R 是 0.005–4 s 的對數滑桿（1000 格；點數字可打字，頁面一律取三位有效數字）；
 * 延持 S 0–1、間隔 0.01；「按住時間」0.05–4 s 對數滑桿（同樣三位有效數字）；泛音數 1–12；
 * 琴鍵 C4–C5（C 大調）；「▶ 播放」用最後按的琴鍵的音高（預設 C4），按住「按住時間」秒後放開。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const C = require(ROOT + 'js/adsr-envelope-core.js');
const missions = [];
global.window = { LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/adsr-envelope.js');
const byId = id => missions.find(m => m.id === 'adsr-envelope-' + id);
const hidden = missions.filter(m => m.hidden);

// ---------- 和頁面一樣的狀態與事件 ----------
const D0 = C.DEFAULT;
const KEY = name => C.KEYS.find(k => k.name === name);
/** 介面上做得到的值：時間三位有效數字並限制在範圍內，S 取到 0.01 */
function legal(s) {
  ['A', 'D', 'R'].forEach(k => { if (C.quant(s[k]) !== s[k] || s[k] < C.T_MIN || s[k] > C.T_MAX) throw new Error(k + ' = ' + s[k] + ' 介面做不到'); });
  if (Math.round(s.S * 100) / 100 !== s.S || s.S < 0 || s.S > 1) throw new Error('S = ' + s.S + ' 介面做不到');
  if (s.H != null && (C.quant(s.H) !== s.H || s.H < C.H_MIN || s.H > C.H_MAX)) throw new Error('H = ' + s.H + ' 介面做不到');
  return s;
}
function st(o) {
  return legal(Object.assign({ A: D0.A, D: D0.D, S: D0.S, R: D0.R, shape: D0.shape, H: D0.H, N: D0.N, high: D0.high, scale: D0.scale, rev: D0.rev,
    preset: null, edited: false, f0: C.KEYS[0].f, key: 'C4' }, o));
}
function presetSt(id, o) { const p = C.PRESETS[id]; return st(Object.assign({ A: p.A, D: p.D, S: p.S, R: p.R, shape: p.shape, preset: id, edited: false, touched: true }, o)); }
const envEv = s => ({ type: 'env', data: C.envData(Object.assign({}, s, { touched: s.touched == null ? true : s.touched })) });
/** 「▶ 播放」：正放時按住 H 秒放開；倒放時播完整段 */
const playEv = s => ({ type: 'release', data: C.releaseData(Object.assign({}, s, { held: s.H, source: 'play', complete: true })) });
/** 琴鍵：按住 held 秒（倒放時 held ≥ H + R 才算播完） */
const keyEv = (s, name, held) => {
  const k = KEY(name);
  return { type: 'release', data: C.releaseData(Object.assign({}, s, { held: s.rev ? s.H : held, source: 'key', key: k.name, f0: k.f, complete: s.rev ? held >= s.H + s.R : true })) };
};

let fail = 0;
function check(id, ev) { const m = byId(id); m.mem = {}; return !!m.check(ev, m.mem); }
function expect(id, ev, want, note) {
  const ok = check(id, ev) === want;
  if (!ok) fail++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + String(id).padEnd(3) + (want ? ' 達成：' : ' 不觸發：') + note);
}
function expectSeq(id, evs, want, note) {
  const m = byId(id); m.mem = {};
  let got = false;
  evs.forEach(ev => { if (m.check(ev, m.mem)) got = true; });
  const ok = got === want;
  if (!ok) fail++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + String(id).padEnd(3) + (want ? ' 達成：' : ' 不觸發：') + note);
}
const f3 = x => (x == null ? '—' : (+x).toFixed(3));

// ---------- 預設狀態不觸發 ----------
{
  const s = st({});
  const evs = [envEv(Object.assign({}, s, { touched: false })), playEv(s), keyEv(s, 'C4', 0.05), keyEv(s, 'C4', 0.3)];
  const hit = missions.filter(m => { m.mem = {}; return evs.some(e => m.check(e, m.mem)); }).map(m => m.id);
  if (hit.length) { fail++; console.log('  ✗ 預設狀態觸發了 ' + hit.join('、')); }
  else console.log('  ✓ 預設狀態（A 0.05、D 0.3、S 0.6、R 0.4、指數、按住 1 s）直接按「▶ 播放」、輕點琴鍵，都不觸發任何任務');
  // 只按某個預設、直接播放（倒放關閉）：不觸發隱藏任務
  const sweep = [];
  C.PRESET_IDS.forEach(id => [false, true].forEach(high => [1, 8, 12].forEach(N => C.KEYS.forEach(k => [0.1, 0.5, 1, 2].forEach(h => {
    const s2 = presetSt(id, { high, N });
    sweep.push(playEv(s2), keyEv(s2, k.name, h), envEv(s2));
  })))));
  const hs = hidden.filter(m => { m.mem = {}; return sweep.some(e => m.check(e, m.mem)); }).map(m => m.id);
  if (hs.length) { fail++; console.log('  ✗ 只按預設、彈幾個音就觸發了隱藏任務 ' + hs.join('、')); }
  else console.log('  ✓ 只按預設、直接播放或彈琴鍵 0.1–2 秒（' + sweep.length + ' 種組合）都不觸發隱藏任務');
}

// ---------- 公開任務 ----------
console.log('\n公開任務：');
{
  const s = st({ touched: true });
  expect('1', keyEv(s, 'E4', 1), true, '預設包絡按住 E4 1 秒（A + D = 0.35 s，放開時在延持段）');
  expect('1', keyEv(s, 'E4', 0.3), false, '0.3 秒就放開（還在衰減段）');
  expect('1', playEv(s), false, '用「▶ 播放」不算（要按琴鍵）');
  expect('1', keyEv(presetSt('piano'), 'E4', 4), false, '鋼琴 S = 0 沒有延持');
}
expect('2', keyEv(presetSt('organ'), 'G4', 1.2), true, '「風琴」按住 G4 1.2 秒');
expect('2', playEv(presetSt('organ')), true, '「風琴」按「▶ 播放」（按住 1 秒）');
expect('2', playEv(presetSt('organ', { H: 0.5 })), false, '按住 0.5 秒不夠');
expect('3', playEv(presetSt('piano', { H: 2 })), true, '「鋼琴」（A 0.008、D 3、S 0）按住 2 秒');
expect('3', playEv(st({ A: 0.01, D: 1.5, S: 0, H: 2.5, edited: true })), true, '自訂 A 0.01、D 1.5、S 0，按住 2.5 秒');
expect('3', playEv(presetSt('pluck', { H: 2 })), false, '「撥弦」D 1.2 太短');
expect('4', envEv(st({ S: 0, scale: 'db' })), true, '指數、S 拉到 0、切到「分貝刻度」');
expect('4', envEv(presetSt('piano', { scale: 'db' })), true, '「鋼琴」＋「分貝刻度」');
expect('4', envEv(st({ S: 0, scale: 'lin' })), false, '振幅刻度不算');
expect('4', envEv(st({ S: 0, scale: 'db', shape: 'lin' })), false, '線性不算');
expect('5', playEv(presetSt('strings')), true, '「弦樂」（A 0.8、S 0.8、R 1.2）按「▶ 播放」（按住 1 秒）');
expect('5', playEv(presetSt('strings', { H: 0.5 })), false, '按住 0.5 秒（起音還沒結束）');
{
  const s = st({ H: 0.2, touched: true });
  const d = playEv(s).data;
  expect('6', playEv(s), true, '預設包絡、「按住時間」0.2 s：放開在衰減段，振幅 ' + f3(d.aRel) + '（S = 0.6）');
  const s2 = st({ A: 1, S: 0.8, H: 0.3 });
  expect('6', playEv(s2), true, 'A 1 s、按住 0.3 s：起音途中放開，振幅 ' + f3(playEv(s2).data.aRel));
  expect('6', playEv(st({ H: 1 })), false, '按到延持才放開');
}
expectSeq('7', ['piano', 'organ', 'strings', 'pluck'].map(id => keyEv(presetSt(id), 'C4', 0.5)), true, '泛音數 8，依序「鋼琴」「風琴」「弦樂」「撥弦」各彈一次 C4');
expectSeq('7', [keyEv(presetSt('piano'), 'C4', 0.5), keyEv(presetSt('organ'), 'C4', 0.5), keyEv(presetSt('strings', { N: 3 }), 'C4', 0.5), keyEv(presetSt('pluck', { N: 3 }), 'C4', 0.5)], false, '途中改了泛音數就重算');
expectSeq('7', [keyEv(presetSt('piano'), 'C4', 0.5), keyEv(presetSt('organ'), 'C4', 0.5), keyEv(presetSt('strings'), 'C4', 0.5), keyEv(presetSt('pluck', { A: 0.01, edited: true }), 'C4', 0.5)], false, '改過包絡的不算預設');
{
  const s = st({});
  const tw = ['C4', 'C4', 'G4', 'G4', 'A4', 'A4', 'G4'];
  expectSeq('8', ['E4', 'D4'].concat(tw).map(n => keyEv(s, n, 0.3)), true, '先亂彈兩個音，再彈 C C G G A A G');
  expectSeq('8', ['C4', 'C4', 'G4', 'G4', 'A4', 'A4', 'F4'].map(n => keyEv(s, n, 0.3)), false, '最後一個彈錯');
}
{
  const s = st({ S: 0.25, D: 0.693 });
  expect('9', envEv(s), true, 'S 0.25、D 0.693 s：τ = ' + f3(envEv(s).data.tauD) + ' s');
  const s2 = st({ S: 0.5, D: 0.347 });
  expect('9', envEv(s2), true, 'S 0.5、D 0.347 s：τ = ' + f3(envEv(s2).data.tauD) + ' s');
  expect('9', envEv(st({ S: 0, D: 3.45 })), false, 'S = 0 不算（要 0.05–0.95）');
}
{
  // 「高泛音衰減較快」＋鋼琴：找最短的按住時間
  let found = null;
  for (let p = 0; p <= 1000 && !found; p++) {
    const H = C.HOLD.fromPos(p);
    const s = presetSt('piano', { high: true, H });
    if (check('10', playEv(s))) found = { H, d: playEv(s).data };
  }
  if (found) expect('10', playEv(presetSt('piano', { high: true, H: found.H })), true, '「鋼琴」＋「高泛音衰減較快」，按住 ' + found.H + ' s：頻譜重心比 ' + f3(found.d.bright));
  else { fail++; console.log('  ✗ 10  找不到解'); }
  expect('10', playEv(presetSt('piano', { high: false, H: 3 })), false, '沒勾「高泛音衰減較快」：音色不變暗（比值 1）');
  expect('10', playEv(presetSt('piano', { high: true, H: 0.1 })), false, '太早放開');
}
{
  const s = st({ A: 0.1, D: 2.7, S: 0, H: 1.5, scale: 'db' });
  expect('11', playEv(s), true, 'A 0.1、D 2.7、S 0、指數：−20 dB 在 A + D/3 = ' + f3(playEv(s).data.t20) + ' s，按住 1.5 s');
  const s2 = st({ A: 0.05, D: 1.9, S: 0.01, H: 1.2, scale: 'db' });
  expect('11', playEv(s2), true, 'A 0.05、D 1.9、S 0.01（−40 dB）：−20 dB 在 ' + f3(playEv(s2).data.t20) + ' s');
  expect('11', playEv(st({ A: 0.1, D: 2.7, S: 0, H: 0.9, scale: 'db' })), false, '−20 dB 之前就放開');
  expect('11', playEv(st({ A: 0.1, D: 2.7, S: 0, H: 1.5, shape: 'lin', scale: 'db' })), false, '線性不算');
  expect('11', playEv(st({ A: 0.1, D: 2.7, S: 0, H: 1.5 })), false, '不在分貝刻度上');
  expect('11', playEv(st({ A: 0.1, D: 2.72, S: 0, H: 1.5, scale: 'db' })), false, 'D 2.72：−20 dB 在 ' + f3(playEv(st({ A: 0.1, D: 2.72, S: 0, H: 1.5 })).data.t20) + ' s');
}
{
  const s = st({ A: 0.05, D: 1, S: 0.1, R: 3, H: 1.05, scale: 'db' });
  const d = playEv(s).data;
  expect('12', playEv(s), true, 'A 0.05、D 1、S 0.1、R 3、按住 1.05 s、分貝刻度：τ_D = ' + f3(d.tauD) + '、τ_R = ' + f3(d.tauR) + ' s');
  const s2 = st({ A: 0.2, D: 0.4, S: 0.5, R: 3.99, H: 0.6, scale: 'db' });
  expect('12', playEv(s2), true, 'A 0.2、D 0.4、S 0.5、R 3.99（τ_D = ' + f3(playEv(s2).data.tauD) + '、τ_R = ' + f3(playEv(s2).data.tauR) + ' s）、按住 0.6 s');
  expect('12', playEv(Object.assign({}, s, { H: 2 })), false, '按到延持才放開（有平台）');
  expect('12', playEv(Object.assign({}, s, { scale: 'lin' })), false, '不在分貝刻度上');
}

// ---------- 隱藏任務 ----------
console.log('\n隱藏任務：');
const sols = {};
function sol(id, ev, note) { sols[id] = ev; expect(id, ev, true, note); }
sol('h1', playEv(presetSt('piano', { rev: true, H: 2 })), '「倒放」＋「鋼琴」，按住時間 2 s，按「▶ 播放」播完');
expect('h1', playEv(presetSt('piano', { rev: false, H: 2 })), false, '沒倒放');
expect('h1', keyEv(presetSt('piano', { rev: true, H: 2 }), 'C4', 1), false, '倒放途中放開琴鍵（沒播完）');
expect('h1', playEv(presetSt('pluck', { rev: true, H: 2 })), false, '「撥弦」D 1.2 太短');
sol('h2', playEv(st({ A: 2, D: 0.005, S: 0, R: 0.1, H: 2.01 })), '不倒放：A 2 s、D 0.005 s、S 0、按住 2.01 s（慢慢變大、一下子消失＝倒放的鋼琴）');
expect('h2', playEv(st({ A: 2, D: 0.005, S: 0, R: 0.1, H: 1.5 })), false, '起音還沒到頂就放開');
expect('h2', playEv(st({ A: 2, D: 0.1, S: 0, R: 0.1, H: 2.5 })), false, 'D 0.1 太長');
sol('h3', playEv(st({ A: 0.5, S: 0.2, shape: 'lin', H: 0.5 })), '線性、A 0.5、S 0.2、按住 0.5 s：放開時剛好在頂點');
expect('h3', playEv(st({ A: 0.5, S: 0.2, shape: 'exp', H: 0.49 })), true, '指數、按住 0.49 s：振幅 ' + f3(playEv(st({ A: 0.5, S: 0.2, shape: 'exp', H: 0.49 })).data.aRel));
expect('h3', playEv(st({ A: 0.5, S: 0.2, shape: 'lin', H: 0.45 })), false, '線性按住 0.45 s：才 0.9');
expect('h3', playEv(st({ A: 0.5, S: 0.2, shape: 'lin', H: 1 })), false, '按太久，已經落到延持');
sol('h4', playEv(st({ D: 2, S: 0.25, H: 2.1 })), '指數、D 2 s、S 0.25：半衰期 1 s、衰減兩個半衰期，按住 2.1 s');
expect('h4', playEv(st({ D: 1, S: 0.5, H: 1.1 })), false, 'D 1、S 0.5：半衰期也是 1 s，但只衰減一個半衰期');
expect('h4', playEv(st({ D: 2, S: 0.25, H: 1.5 })), false, '還沒衰減完就放開');
sol('h5', playEv(st({ S: 0.32, D: 0.5, H: 1.2 })), 'S 0.32（' + f3(C.db(0.32)) + ' dB，響度大約一半）、D 0.5、按住 1.2 s');
expect('h5', playEv(st({ S: 0.5, D: 0.5, H: 1.2 })), false, 'S 0.5（−6 dB：振幅一半，響度不到一半）');
{
  const s = st({ A: 0.005, D: 0.012, S: 0, R: 0.005, H: 0.05 });
  sol('h6', playEv(s), 'A 0.005、D 0.012、S 0、R 0.005：−40 dB 以上只有 ' + f3(playEv(s).data.dur40 * 1000) + ' ms ≈ ' + f3(playEv(s).data.cycles) + ' 個週期（C4）');
  expect('h6', playEv(presetSt('perc')), false, '「打擊」預設也有 ' + f3(playEv(presetSt('perc')).data.cycles) + ' 個週期');
}
sol('h7', playEv(st({ shape: 'lin', S: 1, A: 0.5, R: 0.5, rev: true, H: 1 })), '倒放、線性、S 1、A = R = 0.5 s、按住 1 s：倒放和正放一模一樣');
expect('h7', playEv(st({ shape: 'exp', S: 1, A: 0.5, R: 0.5, rev: true, H: 1 })), false, '指數不對稱');
expect('h7', playEv(st({ shape: 'lin', S: 1, A: 0.5, R: 0.8, rev: true, H: 1 })), false, 'A ≠ R');
sol('h8', playEv(st({ shape: 'lin', A: 1, S: 0.5, H: 0.5 })), '線性、A 1 s、S 0.5、按住 0.5 s：起音途中放開，振幅剛好 0.5 = S');
{
  // 指數起音也做得到：找按住時間
  let best = null;
  for (let p = 0; p <= 1000; p++) { const H = C.HOLD.fromPos(p); const ev = playEv(st({ A: 2, S: 0.6, H })); if (check('h8', ev)) { best = { H, a: ev.data.aRel }; break; } }
  if (best) expect('h8', playEv(st({ A: 2, S: 0.6, H: best.H })), true, '指數、A 2 s、S 0.6、按住 ' + best.H + ' s：振幅 ' + f3(best.a));
  else { fail++; console.log('  ✗ h8  指數起音找不到'); }
  expect('h8', playEv(st({ shape: 'lin', A: 1, S: 0.5, H: 2 })), false, '按到延持才放開（理所當然一樣）');
}
sol('h9', playEv(st({ A: 0.05, D: 1, S: 0.1, R: 3, H: 1.05, rev: true })), '倒放、A 0.05、D 1、S 0.1、R 3、按住 1.05 s：倒過來就是一路直線爬升、到頂突然結束');
expect('h9', playEv(st({ A: 0.05, D: 1, S: 0.1, R: 2, H: 1.05, rev: true })), false, 'R 2：兩段斜率不同（有轉折）');
{
  const s = st({ S: 0.5, D: 0.843, H: 1 });
  sol('h10', playEv(s), '指數、S 0.5、D 0.843 s、C4：τ = ' + f3(playEv(s).data.tauD) + ' s，Q = π f τ = ' + playEv(s).data.Q.toFixed(1));
  const k = KEY('A4');
  const ev = keyEv(st({ S: 0.5, D: 0.501 }), 'A4', 1);
  expect('h10', ev, true, '用琴鍵 A4（' + k.f + ' Hz）、S 0.5、D 0.501：Q = ' + ev.data.Q.toFixed(1));
  expect('h10', keyEv(st({ S: 0.5, D: 0.843 }), 'A4', 1), false, '同樣的包絡換成 A4：Q = ' + keyEv(st({ S: 0.5, D: 0.843 }), 'A4', 1).data.Q.toFixed(0));
}

// 兩兩不連帶完成
{
  let bad = 0;
  Object.keys(sols).forEach(id => {
    hidden.forEach(m => {
      if (m.id === 'adsr-envelope-' + id) return;
      m.mem = {};
      if (m.check(sols[id], m.mem)) { bad++; console.log('  ✗ ' + id + ' 的解也完成了 ' + m.id); }
    });
  });
  if (bad) fail++;
  else console.log('\n  ✓ 10 個隱藏任務的解，都不會順便完成另一個隱藏任務');
  if (Object.keys(sols).length !== 10) { fail++; console.log('  ✗ 隱藏任務的解不是 10 個'); }
}

// ---------- 亂按模擬 ----------
const RUNS = 2000, STEPS = 80;
console.log('\n亂按模擬（' + RUNS + ' 回 × ' + STEPS + ' 步隨機操作；滑桿隨機拖到介面的格點，琴鍵隨機按 0.05–3 秒）');
{
  let seed = 20261113;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const pickI = n => Math.floor(rnd() * n);
  const logPos = () => { const v = rnd(); return v < 0.1 ? 0 : v < 0.2 ? 1000 : Math.round(rnd() * 1000); };
  const counts = {};
  for (let run = 0; run < RUNS; run++) {
    missions.forEach(m => { m.mem = {}; m.doneRun = false; });
    let s = st({});
    for (let step = 0; step < STEPS; step++) {
      const a = pickI(14);
      const evs = [];
      let changed = true;
      const set = o => { s = Object.assign({}, s, o, { touched: true }); };
      if (a === 0) { const id = C.PRESET_IDS[pickI(5)]; const p = C.PRESETS[id]; set({ A: p.A, D: p.D, S: p.S, R: p.R, shape: p.shape, preset: id, edited: false }); }
      else if (a === 1) set({ A: C.TIME.fromPos(logPos()), edited: true });
      else if (a === 2) set({ D: C.TIME.fromPos(logPos()), edited: true });
      else if (a === 3) { const v = rnd(); set({ S: v < 0.1 ? 0 : v < 0.2 ? 1 : pickI(101) / 100, edited: true }); }
      else if (a === 4) set({ R: C.TIME.fromPos(logPos()), edited: true });
      else if (a === 5) set({ H: C.HOLD.fromPos(logPos()) });
      else if (a === 6) set({ shape: s.shape === 'lin' ? 'exp' : 'lin', edited: true });
      else if (a === 7) set({ scale: s.scale === 'lin' ? 'db' : 'lin' });
      else if (a === 8) set({ rev: !s.rev });
      else if (a === 9) set({ high: !s.high });
      else if (a === 10) set({ N: 1 + pickI(12) });
      else if (a === 11) { evs.push(playEv(s)); changed = false; }
      else { const k = C.KEYS[pickI(8)]; s = Object.assign({}, s, { key: k.name, f0: k.f }); evs.push(keyEv(s, k.name, 0.05 * Math.pow(60, rnd()))); changed = false; }
      if (changed) evs.push(envEv(s));
      evs.forEach(ev => missions.forEach(m => { if (!m.doneRun && m.check(ev, m.mem)) { m.doneRun = true; counts[m.id] = (counts[m.id] || 0) + 1; } }));
    }
  }
  const pct = m => 100 * (counts[m.id] || 0) / RUNS;
  console.log('  ' + missions.map(m => m.id + (m.hidden ? '（隱藏 ' : '（') + m.level + ' 級）' + pct(m).toFixed(2) + '%').join('\n  '));
  const risky = missions.filter(m => (m.hidden || m.level >= 6) && pct(m) >= 5);
  if (risky.length) { fail++; console.log('  ✗ 隱藏任務或 6 級以上的任務，亂按完成的比例達到 5%：' + risky.map(m => m.id + ' ' + pct(m).toFixed(1) + '%').join('、')); }
  else console.log('  ✓ 隱藏任務與 6 級以上的任務，亂按完成的比例都不到 5%');
}

// ---------- 總覽 ----------
const pub = missions.filter(m => !m.hidden), hid = hidden;
const starsOf = m => (m.hidden ? 2 : 1) * m.level;
const stars = missions.reduce((s, m) => s + starsOf(m), 0);
console.log(`\n公開 ${pub.length} 個、隱藏 ${hid.length} 個，共 ${stars} 顆星（公開 ${pub.reduce((s, m) => s + m.level, 0)}、隱藏 ${hid.reduce((s, m) => s + starsOf(m), 0)}，隱藏任務是等級 × 2）。`);
const hl = hid.map(m => m.level);
if (hid.length !== 10) { fail++; console.log('隱藏任務不是 10 個。'); }
if (hl.some(l => l < 3 || l > 10) || hl.filter(l => l >= 7).length < 3) { fail++; console.log('隱藏任務等級要在 3–10、至少 3 個 7 級以上：' + hl.join('、')); }
if (hid.some(m => starsOf(m) > 20)) { fail++; console.log('隱藏任務超過 20 顆星（規則上限）。'); }
if (pub.length < 10 || pub.length > 12) { fail++; console.log('公開任務要 10–12 個。'); }
if (missions.some(m => m.hidden ? !(m.riddle && m.riddle.zh && m.riddle.en) : !(m.title && m.desc && m.desc.zh && m.desc.en))) { fail++; console.log('有任務缺中英文說明。'); }
const ids = missions.map(m => m.id);
if (new Set(ids).size !== ids.length) { fail++; console.log('任務代號重複。'); }
if (fail) { console.log(`有 ${fail} 項不符合。`); process.exit(1); }
console.log('全部任務都證明做得到，預設狀態不觸發，隱藏任務互不連帶，亂按很少誤觸。');
