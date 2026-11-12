/* 任務可達成的證明腳本。用法：node tools/mission-proofs/data-compression.js
 * 用計算核心模擬頁面（js/data-compression.js）送出的事件，證明：
 *   1. 預設狀態不觸發任何任務；2. 每個任務都做得到（印出解法）；3. 十個隱藏任務的解法不會順便完成另一個隱藏任務（交叉檢查表）；
 *   4. 靠運氣的部分（解碼挑戰亂猜、位元錯誤的位置）平均要試幾次；
 *   5. 固定種子的亂按模擬（像學生隨便點每個控制項、亂打字：400 人 × 每人 300 次），每個任務被碰巧完成的比例，隱藏任務都要 < 2%。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const K = require(ROOT + 'js/data-compression-core.js');
const missions = [];
global.window = { CompressCore: K, LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/data-compression.js');
const PRE = 'data-compression-';
const byId = id => missions.find(m => m.id === PRE + id);
const hidden = missions.filter(m => m.hidden);
const N16 = 16, NPX = 256;

// ---------- 與頁面相同的事件模擬 ----------
const EXAMPLES = {
  ex1: { 'zh-Hant': 'ABRACADABRA', en: 'ABRACADABRA' },
  ex2: { 'zh-Hant': '吃葡萄不吐葡萄皮，不吃葡萄倒吐葡萄皮', en: 'she sells sea shells by the sea shore' },
  ex3: { 'zh-Hant': '床前明月光，疑是地上霜。舉頭望明月，低頭思故鄉。', en: 'to be or not to be that is the question' }
};
function textId(t) {
  let x = 2166136261;
  for (let i = 0; i < t.length; i++) { x ^= t.charCodeAt(i); x = Math.imul(x, 16777619) >>> 0; }
  return x.toString(36) + ':' + t.length;
}
function cellsOnLine(a, b) {
  const out = [];
  const ar = Math.floor(a / N16), ac = a % N16, br = Math.floor(b / N16), bc = b % N16;
  const n = Math.max(Math.abs(br - ar), Math.abs(bc - ac));
  for (let s = 1; s <= n; s++) { const r = Math.round(ar + (br - ar) * s / n), c = Math.round(ac + (bc - ac) * s / n); out.push(r * N16 + c); }
  return out;
}
class Page {
  constructor(lang) {
    this.lang = lang || 'zh-Hant';
    this.ev = [];
    this.clock = 0;               // 秒（亂按時每個動作約 2 秒）
    // 遊程
    this.px = K.pattern('heart'); this.origin = 'heart'; this.painted = 0; this.scan = 'row'; this.fmt = 'pair'; this.k = 8; this.noiseSeed = 20261112;
    this.recompute();
    // 霍夫曼
    this.tie = 'old'; this.typed = false; this.flip = 0; this.quiz = null; this.streak = 0;
    this.setText(EXAMPLES.ex2[this.lang], 'init');
  }
  // ===== 遊程 =====
  recompute() {
    this.sum = K.rleSummary(this.px, N16, N16, this.scan, this.fmt, this.k);
    this.hash = K.pixelsHash(this.px);
    this.rleDone = true; this.tokIdx = this.sum.tokens.length;
  }
  rleData(src) {
    const s = this.sum, byK = [];
    for (let k = K.K_MIN; k <= K.K_MAX; k++) byK.push(s.bitsByK[k]);
    return { src: src, origin: this.origin, painted: this.painted, scan: this.scan, fmt: this.fmt, k: this.k, raw: s.raw, runs: s.runs.length, segs: s.tokens.length,
      bits: s.bits, per: s.per, black: s.black, bitsByK: byK, hash: this.hash };
  }
  changed(src) { this.recompute(); this.ev.push({ type: 'rle', data: this.rleData(src) }); return this; }
  setPx(i, c) { if (this.px[i] === c) return false; this.px[i] = c; this.painted++; return true; }
  tap(i) { this.setPx(i, this.px[i] ? 0 : 1); return this.changed('paint'); }
  drag(a, b) {
    const c = this.px[a] ? 0 : 1;
    let n = this.setPx(a, c) ? 1 : 0;
    cellsOnLine(a, b).forEach(j => { if (this.setPx(j, c)) n++; });
    if (n) this.changed('paint');
    return this;
  }
  /** 親手把一串格子畫黑（每一格一次點擊） */
  paintCells(cells) { cells.forEach(i => { if (!this.px[i]) this.tap(i); }); return this; }
  /** 一筆拖曳畫一整列（或一整行） */
  dragRow(r) { return this.drag(r * 16, r * 16 + 15); }
  dragCol(c) { return this.drag(c, 240 + c); }
  preset(name) {
    if (name === 'noise') { this.noiseSeed = (this.noiseSeed * 48271) % 2147483647; this.px = K.noise(this.noiseSeed); }
    else this.px = name === 'blank' ? new Array(NPX).fill(0) : K.pattern(name);
    this.origin = name; this.painted = 0;
    return this.changed('preset');
  }
  scanTo(s) { if (this.scan === s) return this; this.scan = s; return this.changed('scan'); }
  fmtTo(f) { if (this.fmt === f) return this; this.fmt = f; return this.changed('fmt'); }
  kTo(k) { if (this.k === k) return this; this.k = k; return this.changed('k'); }
  rleReset() { this.tokIdx = 0; this.rleDone = false; this.rleStepped = true; }
  rleFinish() { this.rleDone = true; const d = this.rleData('run'); d.stepped = this.rleStepped; this.ev.push({ type: 'rleRun', data: d }); }
  rleStep() {
    if (this.rleDone) this.rleReset();
    if (this.tokIdx < this.sum.tokens.length) this.tokIdx++;
    if (this.tokIdx >= this.sum.tokens.length) this.rleFinish();
    return this;
  }
  rlePlay() { if (this.rleDone) this.rleReset(); this.rleStepped = false; this.rleFinish(); return this; }   // 播放到底（中途被打斷也照樣算完成：偏保守）
  rleRestart() { this.rleReset(); return this; }
  // ===== 霍夫曼 =====
  setText(text, src) {
    let syms = K.symbols(text).filter(s => s !== '\n' && s !== '\r');
    if (syms.length > K.MAX_CHARS) syms = syms.slice(0, K.MAX_CHARS);
    if (!syms.length) return this;
    const counts = K.countSymbols(syms);
    if (counts.length > K.MAX_KINDS) return this;
    this.text = syms.join(''); this.syms = syms; this.counts = counts;
    if (src === 'typed') this.typed = true; else if (src === 'example' || src === 'init') this.typed = false;
    return this.rebuild(src);
  }
  rebuild(src) {
    this.tree = K.huffman(this.counts, this.tie);
    this.built = this.tree.steps.length;
    this.bits = K.encodeSyms(this.syms, this.tree.codes);
    this.H = K.entropy(this.counts); this.L = K.avgLength(this.counts, this.tree.lengths);
    if (this.flip > this.bits.length) this.flip = 0;
    this.decReset();
    this.quiz = null;
    if (src && src !== 'init') this.ev.push({ type: 'huff', data: this.hufData(src) });
    return this;
  }
  hufData(src) {
    const t = this.tree, k = t.k, N = this.syms.length;
    const sorted = this.counts.slice().sort((a, b) => b.n - a.n || a.s.codePointAt(0) - b.s.codePointAt(0));
    const fixed = K.fixedLength(k);
    return { src: src, typed: this.typed, tid: textId(this.text), N: N, k: k, counts: sorted.map(c => c.n), lens: sorted.map(c => t.lengths[c.s]),
      H: this.H, L: this.L, fixed: fixed, fixedBits: fixed * N, bits: this.bits.length, utf8Bits: 8 * K.utf8Bytes(this.syms), maxLen: t.maxLen, minLen: t.minLen, tie: this.tie };
  }
  type(s) { return this.setText(s, 'typed'); }
  example(id) { return this.setText(EXAMPLES[id][this.lang], 'example'); }
  tieTo(t) { if (this.tie === t) return this; this.tie = t; return this.rebuild('tie'); }
  hufStep() {
    const t = this.tree;
    if (t.k < 2) return this;
    if (this.built >= t.steps.length) { this.built = 0; this.hufStepped = true; }
    this.built++;
    if (this.built >= t.steps.length) this.ev.push({ type: 'huffDone', data: { stepped: this.hufStepped, k: t.k, N: this.syms.length, typed: this.typed, tie: this.tie } });
    return this;
  }
  hufPlay() {
    const t = this.tree;
    if (t.k < 2) return this.hufStep();
    if (this.built >= t.steps.length) this.built = 0;
    this.hufStepped = false; this.built = t.steps.length;
    this.ev.push({ type: 'huffDone', data: { stepped: false, k: t.k, N: this.syms.length, typed: this.typed, tie: this.tie } });
    return this;
  }
  hufRestart() { this.built = 0; this.hufStepped = true; return this; }
  build(text) { if (text !== undefined && text !== this.text) return this.type(text); return this.hufRestart(); }
  // ----- 解碼 -----
  decReset() {
    this.decPos = 0; this.decDone = false; this.decStepped = true;
    let b = this.bits;
    if (this.flip >= 1 && this.flip <= b.length) b = b.slice(0, this.flip - 1) + (b[this.flip - 1] === '0' ? '1' : '0') + b.slice(this.flip);
    this.decBits = b;
    return this;
  }
  decReady() { if (this.tree.k < 2) return false; this.built = this.tree.steps.length; return true; }
  decFinish() {
    this.decDone = true;
    const dec = K.decodeBits(this.decBits, this.tree);
    const ok = dec.leftover === 0 && dec.syms.join('') === this.syms.join('');
    const fa = this.flip > 0 ? K.flipAnalysis(this.syms, this.tree, this.flip) : null;
    this.ev.push({ type: 'decode', data: { stepped: this.decStepped, flip: this.flip, ok: ok, origLen: this.syms.length, outLen: dec.syms.length, leftover: dec.leftover,
      resync: fa ? fa.resync : true, after: fa ? fa.after : 0, k: this.tree.k, N: this.syms.length, typed: this.typed } });
  }
  decNext() {
    if (!this.decReady()) return this;
    if (this.decDone) this.decReset();
    this.decPos++;
    if (this.decPos >= this.decBits.length) this.decFinish();
    return this;
  }
  decAll() { for (let i = this.decBits.length; i > 0; i--) this.decNext(); return this; }
  decPlay() { if (!this.decReady()) return this; if (this.decDone) this.decReset(); this.decStepped = false; this.decFinish(); return this; }
  flipTo(n) { this.flip = n; return this.decReset(); }
  // ----- 解碼挑戰 -----
  pool() { return this.counts.map(c => c.s).filter(s => /\S/.test(s)); }
  quizStart(rnd) {
    if (this.quiz) { if (this.quiz.wait) this.quizNext(rnd); return this; }
    const pool = this.pool();
    if (pool.length < 4) return this;
    this.quiz = { i: 0, correct: 0, t0: this.clock, k: this.tree.k, maxLen: this.tree.maxLen, pool: pool, wait: true };
    this.streak = 0;
    return this.quizNext(rnd);
  }
  quizNext(rnd) {
    const z = this.quiz;
    z.word = K.quizWord(rnd, z.pool, 4 + Math.floor(rnd() * 3));
    z.wait = false;
    return this;
  }
  /** 回答：answer 是字串；know = true 表示照碼表正確解碼 */
  quizAnswer(answer, know) {
    const z = this.quiz;
    if (!z || z.wait || !z.word) return this;
    const ans = know ? z.word.join('') : K.symbols(String(answer).replace(/\s+/g, '')).join('');
    if (!ans) return this;
    const ok = ans === z.word.join('');
    z.wait = true; z.i++;
    if (ok) { z.correct++; this.streak++; } else this.streak = 0;
    this.ev.push({ type: 'quiz', data: { ok: ok, streak: this.streak, k: z.k, maxLen: z.maxLen } });
    if (z.i >= 5) {
      this.ev.push({ type: 'round', data: { correct: z.correct, total: 5, time: Math.round((this.clock - z.t0) * 10) / 10, k: z.k } });
      this.quiz = null;
    }
    return this;
  }
  quizStop() { this.quiz = null; return this; }
  tick(s) { this.clock += s; return this; }
}
const run = (m, events) => { m.mem = {}; return events.some(e => { try { return !!m.check(e, m.mem); } catch (err) { return false; } }); };

let fail = 0;
function expect(id, events, want, note) {
  const m = byId(id);
  const ok = run(m, events);
  const pass = ok === want;
  if (!pass) fail++;
  console.log((pass ? '  ✓ ' : '  ✗ ') + String(id).padEnd(4) + (want ? ' 達成：' : ' 不觸發：') + note);
  return events;
}
const rangeCells = (a, b, step) => { const out = []; for (let i = a; i <= b; i += (step || 1)) out.push(i); return out; };

// ---------- 1. 預設狀態不觸發 ----------
console.log('預設狀態（愛心圖、逐列、顏色＋長度、k = 8；預設文字），只按一下不改內容的控制項、範例按鈕、平手規則：');
['zh-Hant', 'en'].forEach(lang => {
  const s = new Page(lang);
  s.scanTo('row').fmtTo('pair').kTo(8).preset('heart').example('ex2').example('ex1').example('ex3').tieTo('new').tieTo('old').flipTo(0);
  const hit = missions.filter(m => run(m, s.ev)).map(m => m.id);
  if (hit.length) { fail++; console.log('  ✗ ' + lang + ' 預設狀態觸發了 ' + hit.join('、')); } else console.log('  ✓ ' + lang + '：沒有任何任務被觸發（' + s.ev.length + ' 個事件）');
});

// ---------- 2. 每個任務的解法 ----------
console.log('\n公開任務：');
expect('1', new Page().rlePlay().ev, true, '愛心圖按「播放」掃完（25 段 × 9 位元 = 225 位元）');
{
  const s = new Page().preset('blank').kTo(2).tap(0);
  expect('2', s.ev, true, '清空 → k = 2 → 點 1 格：一段最長 3 格，256 格要拆成 ' + s.sum.tokens.length + ' 段 × 3 = ' + s.sum.bits + ' 位元 > 256');
  const t = new Page().preset('blank').paintCells(rangeCells(0, 255, 9));
  expect('2', t.ev, true, '或清空 → k = 8 → 每隔 9 格點一格（' + t.sum.black + ' 個黑點）：' + t.sum.tokens.length + ' 段 × 9 = ' + t.sum.bits + ' 位元');
  expect('2', new Page().preset('blank').kTo(2).ev, false, '清空後沒有畫就調 k 不算（要自己畫）');
}
{
  const s = new Page().preset('blank').dragRow(8);
  const rowBits = s.sum.bits;
  s.scanTo('col');
  const colBits = s.sum.bits;
  s.scanTo('row');
  expect('3', s.ev, true, '清空 → 畫一條橫線：逐列 ' + rowBits + ' 位元、逐行 ' + colBits + ' 位元，再切回「逐列」（' + rowBits + ' × 2 ≤ ' + colBits + '）');
  expect('3', new Page().scanTo('col').scanTo('row').ev, false, '愛心圖逐列 225、逐行 297，不到一半');
}
{
  const s = new Page().example('ex1');
  for (let i = 0; i < 4; i++) s.hufStep();
  expect('4', s.ev, true, 'ABRACADABRA（5 種字）按「下一步」4 次建完樹');
  expect('4', new Page().example('ex1').hufPlay().ev, false, '按「播放」建完不算');
}
{
  const s = new Page();
  const byK = s.sum.bitsByK;
  expect('5', s.kTo(4).ev, true, '愛心圖 k = 2…8：' + [2, 3, 4, 5, 6, 7, 8].map(k => byK[k]).join('、') + ' → k = 4 最省（160 位元）');
  expect('5', new Page().kTo(5).ev, false, 'k = 5（168）不是最省');
}
{
  const s = new Page();
  expect('6', s.decAll().ev, true, '預設文字（' + s.syms.length + ' 字、8 種）按「下一位」' + s.bits.length + ' 次解完');
  expect('6', new Page().decPlay().ev, false, '按「自動解碼」不算');
}
{
  const s = new Page().preset('blank');
  for (let r = 8; r < 16; r++) s.dragRow(r);
  const a = s.sum.bits;
  s.fmtTo('alt');
  expect('7', s.ev, true, '清空 → 下半部 8 列各拖一筆塗黑（128 格）：顏色＋長度 ' + a + ' 位元、只記長度 ' + s.sum.bits + ' 位元');
}
{
  const txt = 'mississippi mississippi mississippi';
  const s = new Page().type(txt), d = s.ev[s.ev.length - 1].data;
  expect('8', s.ev, true, '打「' + txt + '」（' + d.N + ' 字、' + d.k + ' 種）：固定長度 ' + d.fixedBits + ' 位元、霍夫曼 ' + d.bits + ' 位元（少 ' + ((1 - d.bits / d.fixedBits) * 100).toFixed(1) + '%）');
  const u = new Page().example('ex2'), e = u.hufData('x');
  expect('8', new Page().type(EXAMPLES.ex2.en).ev, false, '打 “' + EXAMPLES.ex2.en + '” 只少 ' + ((1 - 114 / 148) * 100).toFixed(1) + '%');
  void e;
}
{
  const s = new Page().type('ABRACADABRA');
  const a = s.tree.maxLen;
  s.tieTo('new');
  expect('9', s.ev, true, '自己打 ABRACADABRA，舊的優先最長碼 ' + a + ' 位元，切到「新的優先」變 ' + s.tree.maxLen + ' 位元（平均碼長都是 ' + s.L.toFixed(3) + '）');
  expect('9', new Page().example('ex1').tieTo('new').ev, false, '用範例按鈕的 ABRACADABRA 不算（要自己打）');
}
{
  const s = new Page().type('aaaabbcd');
  expect('10', s.ev, true, '打 aaaabbcd：機率 1/2、1/4、1/8、1/8，碼長 1、2、3、3，H = L = ' + s.H.toFixed(3));
  expect('10', new Page().type('abcdabcd').ev, false, 'abcdabcd（次數全相同）H = L = 2 不算');
  expect('10', new Page().type('aabc').ev, false, 'aabc 也是 H = L，但不到 8 個字');
  expect('10', new Page().type('aabcdefg').ev, false, 'aabcdefg（1/4 與 1/8）也是 H = L，但碼長只有 2、3 兩種');
}
{
  const s = new Page().example('ex1'), rnd = K.rng(5);
  s.quizStart(rnd);
  for (let i = 0; i < 3; i++) { s.quizAnswer('', true); s.quizStart(rnd); }
  expect('11', s.ev, true, 'ABRACADABRA 的碼表按「出題」連對 3 題');
}
{
  const s = new Page().example('ex2'), rnd = K.rng(6);
  s.quizStart(rnd);
  for (let i = 0; i < 5; i++) { s.tick(20); s.quizAnswer('', true); if (i < 4) s.quizStart(rnd); }
  expect('12', s.ev, true, '預設繞口令（8 種字）一回合 5 題全對，每題 20 秒、共 100 秒');
  const t = new Page().example('ex1'), r2 = K.rng(6);
  t.quizStart(r2);
  for (let i = 0; i < 5; i++) { t.tick(10); t.quizAnswer('', true); if (i < 4) t.quizStart(r2); }
  expect('12', t.ev, false, 'ABRACADABRA 只有 5 種字，不算');
}

console.log('\n隱藏任務（解法與交叉檢查）：');
const H3_DOTS = rangeCells(0, 14).map(j => 16 * j + 8).concat([255]);
const H8_TEXT = 'aaaaaaaacccccccb';
const sol = {
  h1: ['打 aaaaaaaa（只有一種字：H = 0，碼是空的，0 位元）', () => new Page().type('aaaaaaaa').ev],
  h2: ['打 abcdefghabcdefgh（8 種字各 2 次：H = L = 固定長度 = 3）', () => new Page().type('abcdefghabcdefgh').ev],
  h3: ['清空 → 點 16 格（第 0–14 列的第 9 格與最後一格）→ 32 段：顏色＋長度 k = 7（每段 8 位元）= 256，再換「只記長度」k = 8（每段 8 位元）也 = 256', () => new Page().preset('blank').paintCells(H3_DOTS).kTo(7).fmtTo('alt').kTo(8).ev],
  h4: ['清空 → 拖出 8 條直線（第 2、4、…、16 行）→ 逐列讀黑白相間，256 格各自一段', () => { const s = new Page().preset('blank'); for (let c = 1; c < 16; c += 2) s.dragCol(c); return s.ev; }],
  h5: ['打 aaaabbbbccccddddeeeeffffgggghh（8 種字，次數 4,4,4,4,4,4,4,2）→ 碼長全是 3', () => new Page().type('aaaabbbbccccddddeeeeffffgggghh').ev],
  h6: ['打 a、b 各 1 次，c 2、d 3、e 5、f 8、g 13 次（費氏數列）→ 最長碼 6 = k − 1', () => new Page().type('abccdddeeeeeffffffffggggggggggggg').ev],
  h7: ['打 59 個 a 加 1 個 b → H = 0.122，L = 1（多出 0.878 位元）', () => new Page().type('a'.repeat(59) + 'b').ev],
  h8: ['打 ' + H8_TEXT + '（a = 0、b = 10、c = 11），弄錯第 9 個位元，按「下一位」一位一位解完：之後的 11 11 11… 全部錯開一位，再也對不回來', () => new Page().type(H8_TEXT).flipTo(9).decAll().ev],
  h9: ['打 abcddeeefffff（次數 1,1,1,2,3,5），舊的優先最長碼 3，切到「新的優先」變 5', () => new Page().type('abcddeeefffff').tieTo('new').ev],
  h10: ['打出 Huffman 1952 表 II 的 13 個機率 × 100：20,18,10,10,10,6,6,4,4,4,4,3,1（共 100 字）', () => {
    const t = 'A'.repeat(20) + 'B'.repeat(18) + 'C'.repeat(10) + 'D'.repeat(10) + 'E'.repeat(10) + 'F'.repeat(6) + 'G'.repeat(6) + 'HHHHIIIIJJJJKKKK' + 'LLL' + 'M';
    return new Page().type(t).ev;
  }]
};
const keys = Object.keys(sol);
const table = [];
keys.forEach(k => {
  const ev = sol[k][1]();
  expect(k, ev, true, sol[k][0]);
  const others = hidden.filter(m => m.id !== PRE + k && run(m, ev)).map(m => m.id.replace(PRE, ''));
  table.push(k.padEnd(4) + '→ ' + (others.length ? '✗ 也完成了 ' + others.join('、') : '沒有連帶完成其他隱藏任務'));
  if (others.length) fail++;
});
// 補充數值
{
  const s = new Page().type('abcddeeefffff'); const a = s.tree.maxLen; s.tieTo('new');
  console.log('      h9 兩棵樹：舊的優先最長 ' + a + '、新的優先最長 ' + s.tree.maxLen + '，平均碼長都是 ' + s.L.toFixed(4));
  const t = new Page().type(H8_TEXT), fa = K.flipAnalysis(t.syms, t.tree, 9);
  console.log('      h8 碼表 ' + JSON.stringify(t.tree.codes) + '；出錯後解出「' + fa.syms.join('') + '」（原文「' + H8_TEXT + '」），在原文第 ' + (fa.at + 1) + ' 個字出錯、之後還有 ' + fa.after + ' 個字');
  const h3 = new Page().preset('blank').paintCells(H3_DOTS).kTo(7);
  const both = h3.fmtTo('alt').kTo(8);
  console.log('      h3 同一張圖：顏色＋長度 k = 7 與只記長度 k = 8 都剛好 256 位元（' + both.sum.tokens.length + ' 段 × 8）');
}
// 幾個「差一點」的反例
expect('h1', new Page().type('a').ev, false, '只打 1 個字不算（至少 8 個）');
expect('h1', new Page().ev.concat(new Page().setText('aaaaaaaa', 'example').ev), false, '不是自己打的不算');
expect('h2', new Page().type('abcdabcd').ev, false, '4 種字各 2 次不算（要 8 種以上）');
expect('h2', new Page().type('abcdefgabcdefg').ev, false, '7 種字（不是 2 的冪）各 2 次不算：碼長有 2 有 3');
expect('h3', new Page().preset('house').kTo(4).fmtTo('alt').ev, false, '房子圖只記長度、k = 4 剛好 256，但不是自己從空白畫的');
expect('h3', new Page().preset('blank').kTo(7).ev, false, '空白圖沒有畫不算');
  expect('h3', new Page().preset('blank').paintCells(H3_DOTS).kTo(7).ev, false, '只有「顏色＋長度」剛好 256 還不夠（要換一種寫法也一樣）');
expect('h4', new Page().preset('blank').paintCells(rangeCells(0, 255).filter(i => (Math.floor(i / 16) + i) % 2 === 1)).ev, false, '棋盤格逐列讀：每列頭尾同色相連，只有 241 段');
expect('h5', new Page().type('aaabbbcccdddeeefffggghhh').ev, false, '8 種字次數全相同不算（那是 h2 的情況）');
expect('h5', new Page().type('aabbccd').ev, false, '4 種字（碼長也全是 2）不算：要 8 種以上');
  expect('h5', new Page().type('aabbccddeeffggh').ev, false, '次數 2,…,2,1 碼長也全是 3，但只出現 1 次的字太少（每種至少 2 次）');
  expect('h5', new Page().type('aaabbbcccdddeeefffggghh').ev, false, '次數 3 與 2 只差 1.5 倍，不到兩倍');
expect('h6', new Page().type('abccdddeeeee').ev, false, '費氏數列只到 5 種字不算（要 7 種以上）');
expect('h6', new Page().type('abccddddeeeeeeeeffffffffffffffffgggggggggggggggggggggggggggggggg').ev, false, '1,1,2,4,8,16,32 也長成最高的樹，但不是兔子的數法');
expect('h7', new Page().type('a'.repeat(30) + 'b').ev, false, '30 個 a 加 1 個 b：多出 0.794 位元，還不夠');
expect('h8', new Page().type(H8_TEXT).flipTo(9).decPlay().ev, false, '按「自動解碼」不算（要一步一步走）');
expect('h8', new Page().type(H8_TEXT).flipTo(2).decAll().ev, false, '弄錯第 2 個位元：解碼器很快又對回來');
expect('h8', new Page().example('ex3').tieTo('new').flipTo(3).decAll().ev.concat(), false, '範例按鈕的文字不算（要自己打）');
expect('h9', new Page().type('ABRACADABRA').tieTo('new').ev, false, 'ABRACADABRA 兩種規則只差 1 層');
expect('h10', new Page().type('AAAAAAAAAAAAAAAAAAAABBBBBBBBBBBBBBBBBBCCCCCCCCCCDDDDDDDDDDEEEEEEEEEEFFFFFFGGGGGGHHHHIIIIJJJJKKKKLLLMM').ev, false, '最後一個機率多 1（0.02）不算');
console.log('\n十個隱藏任務的交叉檢查：');
table.forEach(l => console.log('  ' + l));

// ---------- 3. 靠運氣的部分 ----------
console.log('\n靠運氣的部分：');
{
  // 解碼挑戰：題目 4–6 個字，從至少 4 種看得見的字裡隨機選（相鄰盡量不重複）；不看碼表亂猜一題猜中的機率
  const guess = (kinds) => { let p = 0; for (let len = 4; len <= 6; len++) p += Math.pow(1 / kinds, len) / 3; return p; };
  [4, 6, 8].forEach(kk => {
    const p = guess(kk);
    console.log('  ' + kk + ' 種字的碼表，亂猜一題猜中的機率 ≈ ' + p.toExponential(2) + '；亂猜連對 3 題平均要試約 ' + (1 / Math.pow(p, 3)).toExponential(1) + ' 次 → 只能真的照樹解碼（每題 4–6 個字，約 10–20 個位元）');
  });
  // h8：同一段文字，在隨機位置弄錯一個位元，「永不對回來、而且之後還有 6 個字以上」的機率
  const t = new Page().type(H8_TEXT); let good = 0;
  for (let f = 1; f <= t.bits.length; f++) { const a = K.flipAnalysis(t.syms, t.tree, f); if (!a.resync && a.after >= 6) good++; }
  console.log('  h8 用 ' + H8_TEXT + '：' + t.bits.length + ' 個位元裡有 ' + good + ' 個位置符合，隨機選位置平均要試 ' + (t.bits.length / good).toFixed(1) + ' 次；想通「c 的 11 被錯開一位」就一次成功');
  const rnd = K.rng(7); let cnt = 0, hit = 0;
  for (let i = 0; i < 4000; i++) {
    const len = 6 + Math.floor(rnd() * 35); let s = '';
    for (let j = 0; j < len; j++) s += 'abcdefghijklmnopqrstuvwxyz '[Math.floor(rnd() * 27)];
    const p = new Page().type(s); if (p.tree.k < 2) continue;
    const f = 1 + Math.floor(rnd() * p.bits.length), a = K.flipAnalysis(p.syms, p.tree, f);
    cnt++; if (!a.resync && a.after >= 6) hit++;
  }
  console.log('  亂打的字母（6–40 個）＋隨機位置出錯：' + (hit / cnt * 100).toFixed(1) + '% 永不對回來（所以 h8 還要求一位一位按「下一位」走完，見下面的亂按模擬）');
}

// ---------- 4. 亂按（像試玩工具、像學生隨便點） ----------
const MASH = 'abcdefghijklmnopqrstuvwxyz      0123456789asdfjkl;';
function mash(rnd, lo, hi) { const n = lo + Math.floor(rnd() * (hi - lo + 1)); let s = ''; for (let i = 0; i < n; i++) s += MASH[Math.floor(rnd() * MASH.length)]; return s; }
function student(rnd, steps, startMode, allowSwitch) {
  const s = new Page();
  let mode = startMode;
  const pick = (lo, hi) => { const w = rnd(); return w < 0.2 ? lo : w < 0.4 ? hi : lo + Math.floor(rnd() * (hi - lo + 1)); };
  const choose = (list) => { let tot = 0; list.forEach(x => { tot += x[0]; }); let u = rnd() * tot; for (const x of list) { u -= x[0]; if (u < 0) return x[1]; } return list[list.length - 1][1]; };
  const RLE = [
    [25, () => s.tap(Math.floor(rnd() * 256))],
    [12, () => { const a = Math.floor(rnd() * 256), r = Math.max(0, Math.min(15, Math.floor(a / 16) + Math.floor(rnd() * 13) - 6)), c = Math.max(0, Math.min(15, a % 16 + Math.floor(rnd() * 13) - 6)); s.drag(a, r * 16 + c); }],
    [10, () => s.preset(['blank', 'heart', 'smile', 'house', 'noise'][Math.floor(rnd() * 5)])],
    [8, () => s.scanTo(['row', 'col', 'snake'][Math.floor(rnd() * 3)])],
    [6, () => s.fmtTo(rnd() < 0.5 ? 'pair' : 'alt')],
    [8, () => s.kTo(pick(2, 8))],
    [10, () => s.rleStep()],
    [6, () => s.rlePlay()],
    [3, () => s.rleRestart()],
    [8, () => {}]                                    // 速度、音效、全部清除：不送事件
  ];
  const HUF = [
    [8, () => s.example(['ex1', 'ex2', 'ex3'][Math.floor(rnd() * 3)])],
    [8, () => s.tieTo(rnd() < 0.5 ? 'old' : 'new')],
    [4, () => s.type(s.text + mash(rnd, 1, 10))],    // 在原來的文字後面亂打
    [3, () => s.type(mash(rnd, 1, 30))],             // 全部刪掉再亂打
    [3, () => s.build()],
    [10, () => s.hufStep()],
    [5, () => s.hufPlay()],
    [3, () => s.hufRestart()],
    [14, () => s.decNext()],
    [6, () => s.decPlay()],
    [3, () => s.decReset()],
    [8, () => s.flipTo(pick(0, Math.max(1, s.bits.length)))],
    [6, () => s.quizStart(rnd)],
    [6, () => s.quizAnswer(mash(rnd, 0, 6), false)],
    [2, () => s.quizStop()],
    [4, () => {}]                                    // 點樹上的葉、速度、音效、全部清除：不送事件
  ];
  for (let i = 0; i < steps; i++) {
    s.tick(1 + rnd() * 2);
    if (allowSwitch && rnd() < 0.04) { mode = mode === 'rle' ? 'huf' : 'rle'; continue; }
    choose(mode === 'rle' ? RLE : HUF)();
  }
  return s.ev;
}
console.log('\n亂按模擬（固定種子；每種情境 400 人 × 每人 300 個隨機操作，滑桿取隨機值、最小、最大；亂打字也算進去）：');
{
  const SC = [
    { name: '兩種模式都玩（4% 機率切換）', start: 'rle', sw: true, seed: 1112 },
    { name: '只玩遊程編碼', start: 'rle', sw: false, seed: 2024 },
    { name: '只玩霍夫曼編碼', start: 'huf', sw: false, seed: 4096 }
  ];
  const P = 400, STEPS = 300;
  const rates = SC.map(sc => {
    const rnd = K.rng(sc.seed), hits = {};
    missions.forEach(m => { hits[m.id] = 0; });
    for (let p = 0; p < P; p++) {
      const ev = student(rnd, STEPS, sc.start, sc.sw);
      missions.forEach(m => { if (run(m, ev)) hits[m.id]++; });
    }
    const r = {};
    missions.forEach(m => { r[m.id] = hits[m.id] / P; });
    return r;
  });
  console.log('  ' + '任務'.padEnd(22) + SC.map(sc => sc.name).join('｜'));
  let worst = 0;
  missions.forEach(m => {
    const line = rates.map(r => ((r[m.id] * 100).toFixed(2) + '%').padStart(8)).join('      ');
    if (m.hidden) rates.forEach(r => { worst = Math.max(worst, r[m.id]); });
    console.log('  ' + (m.id.replace(PRE, '') + (m.hidden ? '（隱藏）' : '')).padEnd(22) + line);
  });
  if (worst >= 0.02) { fail++; console.log('  ✗ 有隱藏任務被亂按完成的比例達到 2%（最高 ' + (worst * 100).toFixed(2) + '%）'); }
  else console.log('  ✓ 每個隱藏任務被亂按完成的比例都低於 2%（最高 ' + (worst * 100).toFixed(2) + '%' + (worst <= 0.01 ? '，也都 ≤ 1%' : '') + '）');
}

console.log(fail ? `\n✗ ${fail} 項不符合` : '\n全部任務都證明做得到，預設狀態與亂按都不會誤觸。');
process.exitCode = fail ? 1 : 0;
