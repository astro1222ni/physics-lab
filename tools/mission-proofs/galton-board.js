/* 任務可達成的證明腳本。用法：node tools/mission-proofs/galton-board.js
 * 用數學核心證明每個任務在滑桿範圍與精度內做得到（事件格式與 js/galton-board.js 相同），
 * 靠運氣的任務用固定種子的亂數實際模擬，算出平均要試幾次；並確認預設狀態不會觸發任務。
 * 滑桿：n 1–16（整數）、p 0–1（0.05；點數字可輸入到 0.01）。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const G = require(ROOT + 'js/galton-board-core.js');
const missions = [];
global.window = { LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/galton-board.js');
const byId = id => missions.find(m => m.id === 'galton-board-' + id);

// ---------- 與 js/galton-board.js 相同的事件資料 ----------
function dropEv(n, p, counts, hidden) {
  const st = G.stats(counts);
  return { type: 'drop', data: { src: 'ball', n: n, p: p, hidden: !!hidden, N: st.N, mean: st.mean, variance: st.variance, tv: G.tv(counts, G.pmf(n, p)), counts: counts.slice() } };
}
function boardEv(n, p) {
  return { type: 'board', data: { n: n, p: p, mean: G.mean(n, p), variance: G.variance(n, p), normErr: G.maxNormalErr(n, p), modes: G.modes(n, p) } };
}
function selectEv(n, p, k) {
  const P = G.pmf(n, p);
  return { type: 'select', data: { src: 'tap', n: n, p: p, k: k, prob: P[k], paths: G.choose(n, k), isTop: G.topBins(P).indexOf(k) >= 0 } };
}
function guessEv(n, p, guess, N) { return { type: 'guess', data: { n: n, p: p, guess: guess, N: N, err: Math.abs(guess - p), round: 1 } }; }
/** 一顆一顆落下（每顆一個事件），回傳事件陣列 */
function dropSeq(rand, n, p, count, counts, hidden) {
  counts = counts || G.zeros(n + 1);
  const out = [];
  for (let i = 0; i < count; i++) { counts[G.drop(rand, n, p).k]++; out.push(dropEv(n, p, counts, hidden)); }
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
/** 靠運氣的任務：重複 trials 回合，每回合跑 trial(rand) 回傳事件；回報成功率 */
function chance(id, trials, trial, note, minRate, maxRate) {
  const m = byId(id);
  const rand = G.rng(12345);
  let hit = 0;
  for (let t = 0; t < trials; t++) { m.mem = {}; if (trial(rand).some(e => m.check(e, m.mem))) hit++; }
  const rate = hit / trials;
  const pass = rate >= minRate && (maxRate == null || rate <= maxRate);
  if (!pass) fail++;
  console.log((pass ? '  ✓ ' : '  ✗ ') + String(id).padEnd(3) + ' 機率：' + note + '：每回合成功率 ' + (rate * 100).toFixed(1) + '%（平均約試 ' + (rate ? Math.ceil(1 / rate) : '∞') + ' 回）');
}

// ---------- 預設狀態不觸發 ----------
{
  const defaults = [boardEv(10, 0.5)];
  const hit = missions.filter(m => { m.mem = {}; return m.id !== 'galton-board-1' && defaults.some(e => m.check(e, m.mem)); }).map(m => m.id);
  if (hit.length) { fail++; console.log('  ✗ 預設狀態觸發了 ' + hit.join('、')); }
  else console.log('  ✓ 預設釘板（n = 10、p = 0.5）不觸發任何任務');
}

// ---------- 確定做得到的任務 ----------
expect('1', dropSeq(G.rng(1), 10, 0.5, 1), true, '放一顆球');
expect('2', [selectEv(10, 0.5, 5)], true, 'n = 10、p = 0.5 選第 5 格');
expect('2', [selectEv(10, 0.5, 4)], false, '第 4 格不是最大');
expect('2', [selectEv(3, 0.5, 1)], false, 'n = 3 太少層');
expect('2', [selectEv(9, 0.3, 2)], true, 'n = 9、p = 0.3：第 2、3 格並列，選第 2 格也算');
expect('4', [selectEv(10, 0.5, 0)], true, 'n = 10、p = 0.5 的第 0 格');
expect('4', [selectEv(5, 0.75, 0)], true, 'n = 5、p = 0.75 的第 0 格：(1/4)^5');
expect('4', [selectEv(10, 0.5, 1)], false, '第 1 格是 10/1024');
expect('5', [selectEv(10, 0.5, 3)], true, 'C(10, 3) = 120');
expect('5', [selectEv(16, 0.5, 14)], true, 'C(16, 14) = 120');
expect('5', [selectEv(10, 0.5, 4)], false, 'C(10, 4) = 210');
expect('6', [boardEv(10, 0.6)], true, 'n = 10、p = 0.6');
expect('6', [boardEv(15, 0.4)], false, 'n = 15、p = 0.4：平均 6、變異數 3.6');
expect('7', [boardEv(14, 0.5)], true, 'n = 14、p = 0.5（誤差 ' + G.maxNormalErr(14, 0.5).toFixed(5) + '）');
expect('7', [boardEv(16, 0.5)], true, 'n = 16、p = 0.5（誤差 ' + G.maxNormalErr(16, 0.5).toFixed(5) + '）');
expect('7', [boardEv(13, 0.5)], false, 'n = 13、p = 0.5（誤差 ' + G.maxNormalErr(13, 0.5).toFixed(5) + '）');
expect('7', [boardEv(16, 0.45)], false, 'n = 16、p = 0.45（誤差 ' + G.maxNormalErr(16, 0.45).toFixed(5) + '）');
expect('7', [boardEv(10, 0), boardEv(16, 1), boardEv(1, 0)], false, 'p = 0 或 1：只剩一格、常態近似沒有意義，不算（試玩 B-M2）');
expect('8', [boardEv(9, 0.3), boardEv(4, 0.2)], true, 'n = 9、p = 0.3：(n + 1)p = 3；再 n = 4、p = 0.2：(n + 1)p = 1');
expect('8', [boardEv(9, 0.3)], false, '只有一個釘板不夠');
expect('8', [boardEv(9, 0.3), boardEv(9, 0.1)], false, '同一個層數換 p 不算');
expect('8', [boardEv(9, 0.5)], false, 'n = 9、p = 0.5 不算（p 要 ≠ 0.5）');
expect('8', [boardEv(10, 0.3)], false, 'n = 10、p = 0.3：(n + 1)p = 3.3 不是整數');
expect('9', [guessEv(10, 0.37, 0.36, 300)], true, '猜 0.36（差 0.01）');
expect('9', [guessEv(10, 0.37, 0.34, 300)], false, '猜 0.34（差 0.03）');
expect('12', [guessEv(16, 0.37, 0.36, 50)], true, '50 顆球、猜差 0.01');
expect('12', [guessEv(16, 0.37, 0.37, 51)], false, '用了 51 顆球');
expect('h1', dropSeq(G.rng(2), 10, 1, 10), true, 'n = 10、p = 1：10 顆球全部落在最右格');
expect('h1', dropSeq(G.rng(2), 10, 0.95, 10), false, 'p = 0.95 不算');
expect('h2', [dropEv(3, 0.5, [1, 3, 3, 1])], true, 'n = 3、8 顆球恰好排成 1、3、3、1');
expect('h2', [dropEv(3, 0.5, [1, 3, 3, 2])], false, '9 顆球不算');
expect('3', [dropEv(1, 0.3, [70, 30])], true, 'n = 1、p = 0.3、100 顆中 30 顆往右');
expect('3', [dropEv(1, 0.3, [74, 26])], false, '26 顆往右（差 0.04）');
expect('3', [dropEv(1, 0.3, [70, 30], true)], false, '挑戰神祕的 p 時不算');

// ---------- 靠運氣的任務：實際模擬 ----------
console.log('  （以下用固定種子實際落球）');
chance('3', 200, r => dropSeq(r, 1, 0.3, 400), 'n = 1、p = 0.3 一顆顆放到 400 顆', 0.9);
chance('10', 40, r => { const c = G.zeros(11); const out = []; for (let b = 0; b < 25; b++) { G.dropMany(r, 10, 0.5, 1000, c); out.push(dropEv(10, 0.5, c)); } return out; }, 'n = 10、p = 0.5 按 25 次「瞬間 1000 顆」', 0.9);
chance('10', 400, r => { const c = G.zeros(9); G.dropMany(r, 8, 0.25, 1000, c); return [dropEv(8, 0.25, c)]; }, '亂按一次：n = 8、p = 0.25 只放 1000 顆（誤觸的機率要很低）', 0, 0.05);
chance('10', 400, r => { const c = G.zeros(9); G.dropMany(r, 8, 0.05, 20000, c); return [dropEv(8, 0.05, c)]; }, 'p = 0.05 太偏（幾乎都在前兩格）不算', 0, 0);
chance('11', 40, r => { const c = G.zeros(11); const out = []; for (let b = 0; b < 20; b++) { G.dropMany(r, 10, 0.5, 1000, c); out.push(dropEv(10, 0.5, c)); } return out; }, 'n = 10、p = 0.5 按 20 次「瞬間 1000 顆」', 0.7);
chance('11', 40, r => { const c = G.zeros(11); return dropSeq(r, 10, 0.5, 3000, c); }, 'n = 10、p = 0.5 一顆顆放到 3000 顆（每顆都檢查）', 0.7);
chance('9', 400, r => { const p = G.hiddenP(r, 0.5); const c = G.dropMany(r, 16, p, 300); return [guessEv(16, p, Math.round(G.estimateP(c, 16) * 100) / 100, 300)]; }, 'n = 16、放 300 顆後猜 x̄/n', 0.9);
chance('12', 400, r => { const p = G.hiddenP(r, 0.5); const c = G.dropMany(r, 16, p, 50); return [guessEv(16, p, Math.round(G.estimateP(c, 16) * 100) / 100, 50)]; }, 'n = 16、放 50 顆後猜 x̄/n', 0.3);
chance('h2', 2000, r => dropSeq(r, 3, 0.5, 8), 'n = 3、p = 0.5 一顆顆放 8 顆', 0.03);
chance('h3', 400, r => dropSeq(r, 10, 0.5, 400), 'n = 10、p = 0.5 一顆顆放到 400 顆', 0.3);

// ---------- 11/13 新增的隱藏任務 h4–h10 ----------
const sel = selectEv;
expect('h4', [sel(10, 0.2, 1), boardEv(10, 0.8), sel(10, 0.8, 9)], true, 'n = 10：p = 0.2 的第 1 格和 p = 0.8 的第 9 格機率一樣（' + G.pmf(10, 0.2)[1].toFixed(5) + '）');
expect('h4', [sel(12, 0.75, 9), sel(12, 0.25, 3)], true, 'n = 12：p = 0.75 的第 9 格和 p = 0.25 的第 3 格');
expect('h4', [sel(10, 0.5, 1), sel(10, 0.5, 9)], false, 'p = 0.5 本來就左右對稱，不算');
expect('h4', [sel(10, 0.3, 1), sel(10, 0.7, 9)], false, 'p = 0.3 離 0.5 太近');
expect('h4', [sel(6, 0.2, 1), sel(6, 0.8, 5)], false, '6 層太少');
expect('h4', [sel(10, 0.2, 1), sel(10, 0.6, 9)], false, '沒有換成 1 − p');
expect('h4', [sel(10, 0.2, 4), sel(10, 0.8, 6)], false, '離中間太近（第 4、6 格）');
expect('h5', [boardEv(4, 0.75), boardEv(5, 0.6), boardEv(10, 0.3), boardEv(12, 0.25)], true, '4 × 0.75、5 × 0.6、10 × 0.3、12 × 0.25 的期望值都是 3（變異數 0.75、1.2、2.1、2.25）');
expect('h5', [boardEv(4, 0.75), boardEv(5, 0.6), boardEv(10, 0.3), boardEv(10, 0.3), boardEv(3, 1)], false, '只有三種層數；3 × 1 是確定的不算');
expect('h5', [boardEv(6, 0.5), boardEv(15, 0.2), boardEv(12, 0.25), boardEv(16, 0.2)], false, '16 × 0.2 = 3.2 不算');
expect('h6', [sel(8, 0.5, 2), sel(8, 0.5, 3), boardEv(9, 0.5), sel(9, 0.5, 3)], true, 'C(8, 2) + C(8, 3) = 28 + 56 = 84 = C(9, 3)');
expect('h6', [sel(8, 0.5, 3), sel(8, 0.5, 2), sel(9, 0.5, 3)], true, '先選右邊再選左邊也可以');
expect('h6', [sel(8, 0.5, 2), sel(8, 0.5, 3), sel(9, 0.5, 2)], false, '選到左下那一格（C(9, 2) = 36）不算');
expect('h6', [sel(8, 0.5, 1), sel(8, 0.5, 2), sel(9, 0.5, 2)], false, '太靠邊的格子不算');
expect('h6', [sel(8, 0.5, 2), sel(8, 0.5, 4), sel(9, 0.5, 4)], false, '不相鄰的兩格不算');
expect('h6', [sel(8, 0.5, 2), sel(8, 0.5, 3), sel(10, 0.5, 3)], false, '要正好多一層');
expect('h7', [sel(12, 0.08, 0)], true, 'n = 12、p = 0.08：(0.92)^12 = ' + G.pmf(12, 0.08)[0].toFixed(4) + '，1/e = 0.3679');
expect('h7', [sel(16, 0.06, 0)], true, 'n = 16、p = 0.06：' + G.pmf(16, 0.06)[0].toFixed(4));
expect('h7', [sel(12, 0.92, 12)], true, '鏡像：n = 12、p = 0.92 的第 12 格');
expect('h7', [sel(5, 0.18, 0), sel(12, 0.1, 0), sel(16, 0.05, 0), sel(12, 0.08, 1)], false, 'n = 5 太少層、0.9^12 = 0.282、0.95^16 = 0.440、第 1 格都不算');
{
  const hits = [];
  for (let n = 1; n <= 16; n++) for (let i = 1; i <= 99; i++) { const m = byId('h7'); m.mem = {}; if (m.check(sel(n, i / 100, 0), m.mem)) hits.push(n + ' × ' + i / 100); }
  const ok = hits.length === 2;
  if (!ok) fail++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + 'h7  在 p 打到 0.01 的所有組合裡，第 0 格只有 ' + hits.join('、') + ' 做得到（滑桿的 0.05 一格都做不到）');
}
expect('h8', [sel(14, 0.5, 6), sel(15, 0.5, 5)], true, 'C(14, 6) = C(15, 5) = 3003');
expect('h8', [sel(15, 0.5, 10), sel(14, 0.5, 8)], true, '從右邊數也一樣：C(15, 10) = C(14, 8) = 3003');
expect('h8', [sel(10, 0.5, 3), sel(16, 0.5, 2)], false, '120 = C(10, 3) = C(16, 2) 太小不算');
expect('h8', [sel(14, 0.5, 6), sel(14, 0.5, 8)], false, '同一個釘板的左右對稱不算');
expect('h8', [sel(14, 0.5, 6), boardEv(15, 0.5), sel(15, 0.5, 4), sel(15, 0.5, 5)], false, '中間選了別的格子');
{
  const pairs = [];
  for (let a = 4; a <= 16; a++) for (let b = a + 1; b <= 16; b++) for (let i = 2; i <= a - 2; i++) for (let j = 2; j <= b - 2; j++) if (G.choose(a, i) === G.choose(b, j)) pairs.push('C(' + a + ', ' + i + ') = C(' + b + ', ' + j + ') = ' + G.choose(a, i));
  const ok = pairs.length === 8 && pairs.filter(x => /3003$/.test(x)).length === 4;
  if (!ok) fail++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + 'h8  16 層以內，不同層數、路徑數相同（不在邊上兩格）只有：' + pairs.join('；'));
}
expect('h9', [sel(2, 0.1, 2), boardEv(3, 0.1), sel(3, 0.1, 2), sel(4, 0.1, 2), sel(5, 0.1, 3)], true, 'C(2, 2) + C(3, 2) + C(4, 2) = 1 + 3 + 6 = 10 = C(5, 3)');
expect('h9', [sel(4, 0.1, 4), sel(5, 0.1, 4), sel(6, 0.1, 4), sel(7, 0.1, 4), sel(8, 0.1, 5)], true, 'C(4, 4) + … + C(7, 4) = 1 + 5 + 15 + 35 = 56 = C(8, 5)');
expect('h9', [sel(2, 0.9, 0), sel(3, 0.9, 1), sel(4, 0.9, 2), sel(5, 0.9, 2)], true, '從右邊數：C(2, 0) + C(3, 1) + C(4, 2) = 10 = C(5, 2)');
expect('h9', [sel(3, 0.1, 2), sel(4, 0.1, 2), sel(5, 0.1, 3)], false, '沒有從 C(2, 2) = 1 開始（3 + 6 = 9 ≠ 10）');
expect('h9', [sel(3, 0.1, 3), sel(4, 0.1, 3), sel(5, 0.1, 4)], false, '只有兩層的棒子太短');
expect('h9', [sel(2, 0.1, 2), sel(3, 0.1, 2), sel(4, 0.1, 2), sel(5, 0.1, 2)], false, '最後要選轉角那一格（第 3 格）');
expect('h9', [sel(1, 0.1, 0), sel(2, 0.1, 0), sel(3, 0.1, 0), sel(4, 0.1, 1)], false, 'r = 0（每格都是 1）太簡單不算');
expect('h10', [sel(6, 0.9, 0), sel(5, 0.9, 1), sel(4, 0.9, 2), sel(3, 0.9, 3)], true, 'C(6, 0) + C(5, 1) + C(4, 2) + C(3, 3) = 1 + 5 + 6 + 1 = 13 = F(7)');
expect('h10', [sel(3, 0.9, 3), sel(4, 0.9, 2), sel(5, 0.9, 1), sel(6, 0.9, 0)], true, '倒過來選也可以');
expect('h10', [sel(7, 0.5, 7), sel(6, 0.5, 5), sel(5, 0.5, 3), sel(4, 0.5, 1)], true, '從右邊數：C(7, 0) + C(6, 1) + C(5, 2) + C(4, 3) = 1 + 6 + 10 + 4 = 21 = F(8)');
expect('h10', [sel(10, 0.9, 0), sel(9, 0.9, 1), sel(8, 0.9, 2), sel(7, 0.9, 3), sel(6, 0.9, 4), sel(5, 0.9, 5)], true, 'm = 10：1 + 9 + 28 + 35 + 15 + 1 = 89 = F(11)');
expect('h10', [sel(6, 0.9, 0), sel(5, 0.9, 1), sel(4, 0.9, 2)], false, '少了最後一格 C(3, 3)');
expect('h10', [sel(4, 0.9, 0), sel(3, 0.9, 1), sel(2, 0.9, 2)], false, 'm = 4 太短');
expect('h10', [sel(6, 0.9, 0), sel(5, 0.9, 1), sel(5, 0.9, 2), sel(4, 0.9, 2), sel(3, 0.9, 3)], false, '中間多選了一格');
{
  // 費氏數的驗算
  const F = [0, 1]; for (let i = 2; i <= 20; i++) F.push(F[i - 1] + F[i - 2]);
  let ok = true;
  for (let m = 0; m <= 16; m++) { let s = 0; for (let i = 0; 2 * i <= m; i++) s += G.choose(m - i, i); if (s !== F[m + 1]) ok = false; }
  if (!ok) fail++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + 'h10 緩坡對角線的和 Σ C(m − i, i) = F(m + 1)，m = 0 到 16 都驗算過');
}

// ---------- 隨機亂按：選格子、換釘板（模擬學生亂點）不觸發新的隱藏任務 ----------
{
  const R = G.rng(2026), news = ['h4', 'h5', 'h6', 'h7', 'h8', 'h9', 'h10'];
  const hit = {};
  for (let t = 0; t < 2000; t++) {
    const ms = news.map(id => { const m = byId(id); m.mem = {}; return m; });
    let n = 10, p = 0.5;
    for (let s = 0; s < 150; s++) {
      const r = R();
      let e;
      if (r < 0.2) { n = 1 + Math.floor(R() * 16); e = boardEv(n, p); }
      else if (r < 0.4) { p = Math.round(R() * 20) / 20; e = boardEv(n, p); }
      else e = sel(n, p, Math.floor(R() * (n + 1)));
      ms.forEach((m, i) => { if (m.check(e, m.mem)) hit[news[i]] = (hit[news[i]] || 0) + 1; });
    }
  }
  const list = Object.keys(hit).map(k => k + ' ' + hit[k] + ' 次');
  const ok = Object.keys(hit).every(k => hit[k] <= 30);
  if (!ok) fail++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + '亂按 2000 回（每回 150 步：20% 換層數、20% 換 p、60% 點格子）：' + (list.length ? list.join('、') + '（每回都不到 1.5%）' : '一次都沒有觸發'));
}

// ---------- 任務之間不互相連帶 ----------
{
  const recipes = {
    2: [sel(10, 0.5, 5)], 4: [sel(5, 0.75, 0)], 5: [sel(10, 0.5, 3)], 6: [boardEv(10, 0.6)], 7: [boardEv(14, 0.5)],
    8: [boardEv(9, 0.3), boardEv(4, 0.2)],
    h1: dropSeq(G.rng(2), 10, 1, 10), h2: [dropEv(3, 0.5, [1, 3, 3, 1])],
    h4: [sel(10, 0.2, 1), boardEv(10, 0.8), sel(10, 0.8, 9)], h5: [boardEv(4, 0.75), boardEv(5, 0.6), boardEv(10, 0.3), boardEv(12, 0.25)],
    h6: [sel(8, 0.5, 2), sel(8, 0.5, 3), boardEv(9, 0.5), sel(9, 0.5, 3)], h7: [boardEv(12, 0.08), sel(12, 0.08, 0)],
    h8: [boardEv(14, 0.3), sel(14, 0.3, 6), boardEv(15, 0.3), sel(15, 0.3, 5)],
    h9: [boardEv(2, 0.1), sel(2, 0.1, 2), boardEv(3, 0.1), sel(3, 0.1, 2), boardEv(4, 0.1), sel(4, 0.1, 2), boardEv(5, 0.1), sel(5, 0.1, 3)],
    h10: [boardEv(6, 0.9), sel(6, 0.9, 0), boardEv(5, 0.9), sel(5, 0.9, 1), boardEv(4, 0.9), sel(4, 0.9, 2), boardEv(3, 0.9), sel(3, 0.9, 3)]
  };
  const clash = [];
  Object.keys(recipes).forEach(k => {
    missions.forEach(m => {
      if (m.id === 'galton-board-' + k || m.id === 'galton-board-1') return;
      m.mem = {};
      if (recipes[k].some(e => m.check(e, m.mem))) clash.push(k + ' → ' + m.id.replace('galton-board-', ''));
    });
  });
  if (clash.length) fail++;
  console.log((clash.length ? '  ✗ 做法連帶完成別的任務：' + clash.join('、') : '  ✓ 各任務的做法都不會順便完成另一個任務（任務 1「放一顆球」除外）'));
}
{
  const hid = missions.filter(m => m.hidden);
  const ok = hid.length === 10 && hid.every(m => m.level >= 3 && m.level <= 10) && hid.filter(m => m.level >= 7).length >= 3;
  if (!ok) fail++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + '隱藏任務 ' + hid.length + ' 個，等級 ' + hid.map(m => m.level).join('、') + '（7 級以上 ' + hid.filter(m => m.level >= 7).length + ' 個）');
}

// ---------- 總覽 ----------
const pub = missions.filter(m => !m.hidden), hid = missions.filter(m => m.hidden);
const starsOf = m => (m.hidden ? 2 : 1) * m.level;   // 隱藏任務星星加倍（與 js/missions.js 的 LabMission.starsOf 相同）
const stars = missions.reduce((s, m) => s + starsOf(m), 0);
console.log(`\n公開 ${pub.length} 個、隱藏 ${hid.length} 個，共 ${stars} 顆星（公開 ${pub.reduce((s, m) => s + m.level, 0)}、隱藏 ${hid.reduce((s, m) => s + starsOf(m), 0)}，隱藏任務是等級 × 2）。`);
if (hid.some(m => starsOf(m) > 20)) { fail++; console.log('隱藏任務超過 20 顆星（規則上限）。'); }
if (fail) { console.log(`有 ${fail} 項不符合。`); process.exit(1); }
console.log('全部任務都證明做得到，預設狀態不觸發。');
