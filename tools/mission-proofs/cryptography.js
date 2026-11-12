/* 任務可達成的證明腳本。用法：node tools/mission-proofs/cryptography.js
 * 用計算核心模擬頁面（js/cryptography.js）送出的事件（事件內容由核心的 caesarEvent／freqEvent／vigEvent／crackEvent／rsaEvent 產生，
 * 和頁面完全相同），證明：
 *   1. 每個任務都做得到（印出解法）；2. 預設狀態與只切分頁不觸發；3. 十個隱藏任務的解法不會順便完成另一個隱藏任務；
 *   4. 反例（差一點的做法不算）；
 *   5. 像學生一樣亂按（固定種子，400 人 × 300 次，只點按鈕、拖滑桿、選選單、點畫布；不打字），每個任務被碰巧完成的比例。
 *      隱藏任務要 < 2%（目標 ≤ 1%）。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const K = require(ROOT + 'js/cryptography-core.js');
const missions = [];
global.window = { LabMission: { register: (id, list) => list.forEach(m => missions.push(m)) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/cryptography.js');
const byId = id => missions.find(m => m.id === 'cryptography-' + id);
const hidden = missions.filter(m => m.hidden);
const pub = missions.filter(m => !m.hidden);
const mod = K.mod;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
let fail = 0;

// ---------- 與頁面相同的狀態與事件 ----------
class Sim {
  constructor(seed) {
    this.ev = [];
    this.tab = 'caesar'; this.text = K.DEFAULT_TEXT; this.textSrc = 'default'; this.sampleIdx = 0; this.prov = null;
    this.c = { k: 1, dir: 'enc', back: null };
    this.f = { g: 0, overlay: true, chiAll: false };
    this.v = { key: 'KEY', keySrc: 'default', dir: 'enc', L: 1, col: 1, guess: [0], guessAuto: false, keyAuto: false };
    this.myst = null; this.mystPrev = { caesar: -1, vig: -1 };
    this.qrand = K.rng(seed || 20261112);
    this.r = { p: 43, q: 59, e: 5, M: 2026, key: null, C: null, R: null, lastM: null };
    this.lastC = null;
    this.updateKey();
    this.recompute();
  }
  out() {
    if (this.tab === 'caesar') return K.caesarApply(this.text, this.c.k, this.c.dir);
    if (this.tab === 'freq') return K.caesar(this.text, -this.f.g);
    if (this.tab === 'vig') return K.vigenere(this.text, this.v.key, this.v.dir);
    return '';
  }
  recompute() {
    if (this.tab !== 'caesar') return;
    const s = this.c.dir === 'enc' ? this.c.k : -this.c.k, pv = this.prov;
    this.lastC = { input: this.text, out: this.out(), k: this.c.k, dir: this.c.dir,
      prov: pv ? { plain: pv.plain, shift: pv.shift + s, user: pv.user } : { plain: this.text, shift: s, user: this.textSrc === 'typed' } };
  }
  push(type, data) { this.ev.push({ type: type, data: data }); return this; }
  emitC(src) { return this.push('caesar', K.caesarEvent({ src: src, input: this.text, k: this.c.k, dir: this.c.dir, back: this.c.back, myst: this.myst ? this.myst.kind : '' })); }
  emitF(src) { return this.push('freq', K.freqEvent({ src: src, input: this.text, g: this.f.g, overlay: this.f.overlay, chiAll: this.f.chiAll, myst: this.myst, prov: this.prov })); }
  emitV(src) { return this.push('vig', K.vigEvent({ src: src, input: this.text, key: this.v.key, keySrc: this.v.keySrc, dir: this.v.dir, L: this.v.L, myst: this.myst, autoKey: !!(this.myst && this.myst.autoKey) })); }
  emitCur(src) { if (this.tab === 'caesar') this.emitC(src); else if (this.tab === 'freq') this.emitF(src); else if (this.tab === 'vig') this.emitV(src); return this; }
  // 分頁、文字
  setTab(t) { if (t === this.tab) return this; this.tab = t; this.recompute(); return this.emitCur('tab'); }
  adopt() { const lc = this.lastC; this.prov = Object.assign({}, lc.prov); this.c.back = { prevIn: lc.input, k: lc.k, dir: lc.dir }; }
  type(s) {
    s = K.clampText(s);
    if (s === this.text) return this;
    const lc = this.lastC;
    if (lc && s === lc.out && lc.out !== lc.input) { this.adopt(); this.text = s; this.textSrc = 'swap'; this.recompute(); return this.emitCur('text'); }
    this.text = s; this.textSrc = 'typed'; this.prov = null; this.c.back = null; this.myst = null;
    this.recompute(); return this.emitCur('text');
  }
  sample() {
    this.sampleIdx = (this.sampleIdx + 1) % K.SAMPLES.length;
    this.text = K.SAMPLES[this.sampleIdx]; this.textSrc = 'sample'; this.prov = null; this.c.back = null; this.myst = null;
    this.recompute(); return this.emitCur('sample');
  }
  swap() {
    if (this.tab !== 'caesar' && this.tab !== 'vig') return this;
    const out = this.out();
    if (this.tab === 'caesar') this.adopt(); else { this.prov = null; this.c.back = null; }
    this.text = out; this.textSrc = 'swap';
    this.recompute(); return this.emitCur('swap');
  }
  wipe() { const r = this.r; r.C = r.R = r.lastM = null; if (this.myst && this.myst.solved) this.myst = null; this.recompute(); return this; }
  // 凱撒
  setK(k, src) { k = mod(Math.round(k), 26); if (k !== this.c.k && this.myst) this.myst.caesarTouched = true; this.c.k = k; this.recompute(); return this.emitC(src || 'k'); }
  dirC(d) { this.c.dir = d; this.recompute(); return this.emitC('dir'); }
  // 頻率分析
  setG(g, src) { this.f.g = mod(Math.round(g), 26); return this.emitF(src || 'g'); }
  overlay(on) { this.f.overlay = on; return this.emitF('overlay'); }
  chiAll(on) { this.f.chiAll = on; if (on && this.myst) this.myst.chiShown = true; return this.emitF('chiAll'); }
  // 維吉尼亞
  key(s) { const k = K.keyFromShifts(K.keyShifts(s)); if (k === this.v.key && this.v.keySrc === 'typed') return this; this.v.key = k; this.v.keySrc = 'typed'; this.v.keyAuto = false; return this.emitV('key'); }
  dirV(d) { this.v.dir = d; return this.emitV('dir'); }
  setL(L, src) {
    L = clamp(Math.round(L), 1, K.MAX_L);
    this.v.L = L;
    const old = this.v.guess; this.v.guess = [];
    for (let i = 0; i < L; i++) this.v.guess.push(old[i] || 0);
    if (this.v.col > L) this.v.col = L;
    return this.emitV(src || 'L');
  }
  setCol(c) { this.v.col = clamp(Math.round(c), 1, this.v.L); return this; }
  setCs(x) { this.v.guess[this.v.col - 1] = mod(Math.round(x), 26); return this; }
  cipherL() { return K.lettersOnly(this.v.dir === 'dec' ? this.text : K.vigenere(this.text, this.v.key, 'enc')); }
  autoKey() {
    const cl = this.cipherL();
    if (cl.length < 2 * this.v.L) return this;
    this.v.guess = K.recoverKey(cl, this.v.L);
    this.v.guessAuto = true;
    if (this.myst) this.myst.autoKey = true;
    return this;
  }
  useGuess() {
    if (this.v.dir === 'enc') { this.text = K.clampText(K.vigenere(this.text, this.v.key, 'enc')); this.textSrc = 'swap'; this.prov = null; this.c.back = null; }
    this.v.key = K.keyFromShifts(this.v.guess); this.v.keySrc = 'guess'; this.v.keyAuto = this.v.guessAuto; this.v.dir = 'dec';
    return this.emitV('guess');
  }
  // 破解挑戰
  mystery(kind) {
    const m = kind === 'caesar' ? K.makeCaesarMystery(this.qrand, this.mystPrev.caesar) : K.makeVigMystery(this.qrand, this.mystPrev.vig);
    this.mystPrev[kind] = m.idx;
    this.myst = { kind: m.kind, idx: m.idx, k: m.k, key: m.key, plain: m.plain, cipher: m.cipher, chiShown: this.f.chiAll, caesarTouched: false, autoKey: false, solved: false };
    this.text = m.cipher; this.textSrc = 'myst'; this.prov = null; this.c.back = null;
    this.c.dir = 'dec'; this.v.dir = 'dec';
    this.v.guess = this.v.guess.map(() => 0);
    this.v.guessAuto = false;
    if (kind === 'vig' && this.tab !== 'vig') this.tab = 'vig';
    this.recompute();
    return this.emitCur('myst');
  }
  crack() {
    const m = this.myst;
    if (!m || m.solved || this.tab === 'rsa') return this;
    const t = this.tab;
    const ev = K.crackEvent({ output: this.out(), myst: m, tab: t, usedKey: t === 'vig' ? this.v.key : '', keySrc: t === 'vig' ? this.v.keySrc : '',
      chiShown: m.chiShown, caesarTouched: m.caesarTouched, autoKey: m.autoKey || (t === 'vig' && this.v.keySrc === 'guess' && this.v.keyAuto) });
    if (ev.ok) m.solved = true;
    return this.push('crack', ev);
  }
  // 公鑰
  updateKey() {
    const r = this.r, n = r.p * r.q, phi = (r.p - 1) * (r.q - 1);
    r.e = clamp(Math.round(r.e), 3, Math.max(3, phi - 1));
    if (r.M > n - 1) r.M = n - 1;
    r.key = K.rsaKey(r.p, r.q, r.e);
    r.C = r.R = r.lastM = null;
    return this;
  }
  setP(p) { this.r.p = p; return this.updateKey(); }
  setQ(q) { this.r.q = q; return this.updateKey(); }
  setE(e) { this.r.e = e; return this.updateKey(); }
  nextE() { const r = this.r; if (r.p === r.q) return this; const e = K.nextValidE(r.e, (r.p - 1) * (r.q - 1)); if (e != null) { r.e = e; this.updateKey(); } return this; }
  setM(M) { const r = this.r; r.M = clamp(Math.round(M), 0, Math.max(0, r.p * r.q - 1)); r.C = r.R = r.lastM = null; return this; }
  rsaEmit(act, steps) { const r = this.r; return this.push('rsa', K.rsaEvent({ act: act, key: r.key, M: r.lastM, C: r.C, R: act === 'enc' ? null : r.R, steps: steps })); }
  enc() { const r = this.r, k = r.key; if (!k.ok) return this; const st = {}; r.lastM = r.M; r.C = K.modPow(r.M, k.e, k.n, st); r.R = null; return this.rsaEmit('enc', st.sq + st.mul); }
  dec() { const r = this.r, k = r.key; if (!k.ok || r.C == null) return this; r.R = K.modPow(r.C, k.d, k.n); return this.rsaEmit('dec', 0); }
  decPub() { const r = this.r, k = r.key; if (!k.ok || r.C == null) return this; r.R = K.modPow(r.C, k.e, k.n); return this.rsaEmit('decPub', 0); }
  eve() {
    const r = this.r, k = r.key;
    if (!k.ok || r.C == null) return this;
    const f = K.factor(k.n), d2 = K.modInverse(k.e, (f.p - 1) * (f.q - 1));
    r.R = d2 == null ? null : K.modPow(r.C, d2, k.n);
    return this.rsaEmit('eve', f.steps);
  }
}

/** 依序把事件交給任務判定（每個任務有自己的暫存 mem，和頁面一樣）；回傳第一次達成的位置或 −1 */
function run(m, events) {
  const mem = {};
  for (let i = 0; i < events.length; i++) {
    let ok = false;
    try { ok = !!m.check({ type: events[i].type, data: events[i].data }, mem); } catch (e) { ok = false; }
    if (ok) return i;
  }
  return -1;
}
function expect(id, events, want, note) {
  const m = byId(id);
  const ok = run(m, events) >= 0;
  const pass = ok === want;
  if (!pass) fail++;
  console.log((pass ? '  ✓ ' : '  ✗ ') + String(id).padEnd(4) + (want ? ' 達成：' : ' 不觸發：') + note);
  return events;
}

// ---------- 1. 預設狀態 ----------
console.log('預設狀態（範例文字、k = 1 加密、g = 0、金鑰 KEY、p = 43、q = 59、e = 5、M = 2026），切遍四個分頁、勾選來回、換範例：');
{
  const s = new Sim();
  s.setTab('freq').overlay(false).overlay(true).setTab('vig').setL(1).setTab('rsa').setTab('caesar').sample().setTab('freq').setTab('caesar');
  const hit = missions.filter(m => run(m, s.ev) >= 0).map(m => m.id);
  if (hit.length) { fail++; console.log('  ✗ 預設狀態觸發了 ' + hit.join('、')); } else console.log('  ✓ 沒有任何任務被觸發');
}

// ---------- 2. 公開任務 ----------
console.log('\n公開任務：');
const lipo = 'Gadsby is a long book that has no fifth symbol of our usual list at all. Nobody could stop him from writing it, and it is still fun to look at today.';
function solvedCaesarSim(seed) { const s = new Sim(seed); s.mystery('caesar'); return s; }
expect(1, new Sim().setK(3).ev, true, '「位移 k」調成 3，加密範例文字（' + K.lettersOnly(K.DEFAULT_TEXT).length + ' 個字母）');
expect(2, (() => { const s = new Sim().setTab('vig').key('CODE'); console.log('       （金鑰 CODE：同一個明文字母最多變成 ' + s.ev[s.ev.length - 1].data.poly + ' 種密文字母）'); return s.ev; })(), true, '維吉尼亞分頁打金鑰 CODE、加密');
expect(3, new Sim().setTab('rsa').setM(2026).enc().dec().ev, true, 'p = 43、q = 59、e = 5：M = 2026 → C = ' + K.modPow(2026, 5, 2537) + ' → 私鑰 d = 1949 解回 2026');
{
  const s = solvedCaesarSim(7); const k = s.myst.k;
  expect(4, s.setK(k).crack().ev, true, '來一段凱撒密文（這一題 k = ' + k + '），解密方向把「位移 k」調成 ' + k + '，按「這就是原文」');
}
expect(5, new Sim().setK(3).swap().setK(23).ev, true, 'k = 3 加密 → 放回輸入 → k = 23 再加密（3 + 23 = 26）回到原文');
{
  const s = solvedCaesarSim(8); const k = s.myst.k;
  expect(6, s.setTab('freq').setG(k).ev, true, '凱撒密文（k = ' + k + '）→ 頻率分析 → g = ' + k + '（χ² 最小）');
}
{
  const s = solvedCaesarSim(9); const k = s.myst.k;
  expect(7, s.setTab('freq').setG(k).crack().ev, true, '凱撒密文（k = ' + k + '）→ 頻率分析對齊長條 g = ' + k + ' → 這就是原文（沒動 k、沒開 χ² 圖）');
  const s2 = solvedCaesarSim(9);
  expect(7, s2.chiAll(true).setTab('freq').setG(k).crack().ev, false, '先打開「所有位移的 χ²」再破解');
  const s3 = solvedCaesarSim(9);
  expect(7, s3.setK(5).setTab('freq').setG(k).crack().ev, false, '動過「位移 k」再到頻率分析破解');
}
expect(8, new Sim().setTab('rsa').setP(89).setQ(97).setM(2026).enc().eve().ev, true, 'p = 89、q = 97（n = 8633）、e = 5：加密後竊聽者試除 ' + K.factor(8633).steps + ' 次分解 n，讀到 2026');
{
  const s = new Sim(11); s.mystery('vig'); const key1 = s.myst.key, len = key1.length;
  expect(9, s.setL(len).ev, false, '只猜對一段（金鑰 ' + key1 + '，L = ' + len + '）還不夠');
  for (let i = 0; i < 40 && s.myst.key.length === len; i++) s.mystery('vig');
  const key2 = s.myst.key;
  expect(9, s.setL(key2.length).ev, true, '再換一段金鑰長度不同的（' + key1 + ' → ' + key2 + '）→ L = ' + key2.length);
  const t = new Sim(11); t.mystery('vig'); const a = t.myst.key; t.setL(a.length);
  for (let i = 0; i < 80 && (t.myst.key === a || t.myst.key.length !== a.length); i++) t.mystery('vig');
  expect(9, t.setL(t.myst.key.length).ev, false, '兩段金鑰一樣長（' + a + '、' + t.myst.key + '）不算兩種情況');
}
{
  const s = new Sim(12); s.mystery('vig'); const key = s.myst.key;
  expect(10, s.setL(key.length).autoKey().useGuess().crack().ev, true, '維吉尼亞密文（金鑰 ' + key + '）→ L = ' + key.length + ' → 自動找金鑰 → 用猜的金鑰解密 → 這就是原文');
  const s2 = new Sim(12); s2.mystery('vig'); s2.setL(key.length);
  for (let c = 1; c <= key.length; c++) s2.setCol(c).setCs(key.charCodeAt(c - 1) - 65);
  expect(11, s2.useGuess().crack().ev, true, '同一題不按自動找金鑰：每一欄自己把位移調成 ' + key.split('').map(ch => ch.charCodeAt(0) - 65).join('、') + ' → 用猜的金鑰解密 → 這就是原文');
  const s3 = new Sim(12); s3.mystery('vig');
  expect(11, s3.setL(key.length).autoKey().useGuess().crack().ev, false, '按過自動找金鑰就不算');
}
// 每一題神祕密文都解得開（凱撒：χ² 最小 = 答案；維吉尼亞：真正長度的各欄 χ² 最小 = 金鑰）
{
  let bad = 0;
  K.MYST_SHORT.forEach(p => { for (let k = 1; k < 26; k++) if (K.bestShift(K.counts(K.caesar(p, k))) !== k) bad++; });
  K.MYST_LONG.forEach(p => K.MYST_KEYS.forEach(key => { const cl = K.lettersOnly(K.vigenere(p, key, 'enc')); if (K.keyFromShifts(K.recoverKey(cl, key.length)) !== key) bad++; }));
  if (bad) { fail++; console.log('  ✗ 有 ' + bad + ' 題神祕密文用頻率分析解不開'); }
  else console.log('  ✓ 8 段凱撒題 × 25 種位移、5 段維吉尼亞題 × 12 把金鑰：頻率分析全部找得到答案（沒有靠運氣的任務）');
}

// ---------- 3. 隱藏任務 ----------
console.log('\n隱藏任務（解法、反例與交叉檢查）：');
function fixedPoints(p, q, e) { const n = p * q, out = []; for (let M = 2; M <= n - 2; M++) if (K.modPow(M, e, n) === M) out.push(M); return out; }
const fp = fixedPoints(43, 59, 5);
const otpText = 'Meet me at the north gate of the castle at dawn';
const otpKey = 'QWXPLMZKTRBNVHCGYDJFSAUEIOMQAZPLWSXOKNEDCI';
const sol = {
  h1: ['k = 13（ROT13）→ 連按兩次「把輸出放回輸入」：每按一次輸出都回到上一段，按完兩次輸入框也回到原文', () => new Sim().setK(13).swap().swap().ev],
  h2: ['在輸入框打 HAL，k = 1 加密 → IBM（《2001 太空漫遊》的電腦與 IBM 只差一個字母）', () => new Sim().type('HAL').ev],
  h3: ['凱撒 k = 5 加密範例文字；切到維吉尼亞、金鑰打 F（位移 5）、加密：兩邊輸出相同', () => new Sim().setK(5).setTab('vig').key('F').ev],
  h4: ['維吉尼亞密文（金鑰 LAB 之類）→ 自動找金鑰得到 LAB → 在「金鑰」自己打 LABLAB 解密 → 這就是原文', () => {
    const s = new Sim(12); s.mystery('vig'); const key = s.myst.key;
    return s.setL(key.length).autoKey().key(key + key).crack().ev;
  }],
  h5: ['p = 31、q = 37（φ = 1080）、e = 161：161² = 25921 = 24 × 1080 + 1，所以 d = 161；加密 M = 100 後用公鑰解密也打開', () => new Sim().setTab('rsa').setP(31).setQ(37).setE(161).setM(100).enc().decPub().ev],
  h6: ['p = 43、q = 59、e = 5：不動點共 ' + K.fixedCount(43, 59, 5) + ' 個，扣掉 0、1、n − 1 後是 ' + fp.join('、') + '；加密 ' + fp[0] + ' 與 ' + fp[1], () => new Sim().setTab('rsa').setM(fp[0]).enc().setM(fp[1]).enc().ev],
  h7: ['維吉尼亞：打「' + otpText + '」（' + K.lettersOnly(otpText).length + ' 個字母）、金鑰打 ' + otpKey.length + ' 個不重複排列的字母，加密', () => new Sim().setTab('vig').type(otpText).key(otpKey).ev],
  h8: ['自己打一段沒有 E 的英文（' + K.lettersOnly(lipo).length + ' 個字母、' + K.words(lipo) + ' 個字），k = 7 加密 → 放回輸入 → 頻率分析 g = 7（χ² 最小）', () => new Sim().type(lipo).setK(7).swap().setTab('freq').setG(7).ev],
  h9: ['p = 41、q = 47（n = 1927）、e = 3：12³ = 1728 < 1927、13³ = 2197 > 1927；加密 M = 12 → C = 1728（沒有繞圈）', () => new Sim().setTab('rsa').setP(41).setQ(47).setE(3).setM(12).enc().ev],
  h10: ['p = 47、q = 59、e = 17（1978 年論文）：ITS ALL GREEK TO ME 的第一塊「IT」= 0920 → 948', () => new Sim().setTab('rsa').setP(47).setQ(59).setE(17).setM(920).enc().ev]
};
const table = [];
Object.keys(sol).forEach(k => {
  const ev = sol[k][1]();
  expect(k, ev, true, sol[k][0]);
  const others = hidden.filter(m => m.id !== 'cryptography-' + k && run(m, ev) >= 0).map(m => m.id.replace('cryptography-', ''));
  if (others.length) fail++;
  table.push(k.padEnd(4) + (others.length ? '✗ 順便完成 ' + others.join('、') : '✓ 只完成自己'));
});
console.log('  反例：');
expect('h1', new Sim().setK(13).swap().ev, false, 'ROT13 只放回輸入一次');
expect('h1', new Sim().setK(13).swap().dirC('dec').swap().ev, false, '兩次之間換了方向（不是連續做同一個動作）');
expect('h1', new Sim().setK(3).swap().setK(23).ev, false, 'k = 3 再 k = 23 也回到原文，但不是對摺（13）');
expect('h2', new Sim().setK(2).type('HAL').ev, false, 'HAL 位移 2 → JCN');
expect('h3', (() => { const s = new Sim().setK(5).setTab('vig'); s.v.guess = [5]; return s.useGuess().ev; })(), false, '一個字母的金鑰是「用猜的金鑰解密」放進去的（不是自己打的）');
expect('h3', new Sim().setK(5).setTab('vig').key('G').ev, false, '金鑰 G（位移 6）和轉盤的 5 不同');
expect('h4', (() => { const s = new Sim(12); s.mystery('vig'); const n = s.myst.key.length; return n * 2 <= 12 ? s.setL(2 * n).autoKey().useGuess().crack().ev : s.ev; })(), false, '把 L 調成兩倍後按「自動找金鑰」再用猜的金鑰（不是自己找的）');
expect('h4', (() => { const s = new Sim(12); s.mystery('vig'); const key = s.myst.key; return s.key(key).crack().ev; })(), false, '自己打原來那把金鑰');
expect('h5', new Sim().setTab('rsa').setE(2435).setM(100).enc().decPub().ev, false, 'e = φ(n) − 1 = 2435（排在最後面的那一把，d = e 是必然的）');
expect('h5', new Sim().setTab('rsa').setM(100).enc().decPub().ev, false, '一般的 e = 5：公鑰打不開');
expect('h6', new Sim().setTab('rsa').setM(1).enc().setM(2536).enc().setM(0).enc().ev, false, '0、1、n − 1 是人人猜得到的不動點');
expect('h6', new Sim().setTab('rsa').setM(fp[0]).enc().setM(fp[0]).enc().ev, false, '同一封信加密兩次');
expect('h7', new Sim().setTab('vig').type(otpText).key('QWXPLMZKTR'.repeat(4)).ev, false, '金鑰夠長但一直重複（QWXPLMZKTR × 4）');
expect('h7', new Sim().setTab('vig').type('Short note').key(otpKey).ev, false, '訊息太短（不到 30 個字母）');
expect('h8', new Sim().type(K.SAMPLES[1]).setK(7).swap().setTab('freq').setG(7).ev, false, '自己打的文字裡有 E');
expect('h8', new Sim().type(lipo).setK(7).swap().setTab('freq').setG(8).ev, false, '沒有對到 χ² 最小的位移');
expect('h9', new Sim().setTab('rsa').setP(41).setQ(47).setE(3).setM(13).enc().ev, false, 'M = 13：13³ = 2197 已經繞過 n');
expect('h9', new Sim().setTab('rsa').setP(41).setQ(47).setE(3).setM(11).enc().ev, false, 'M = 11：沒繞圈但不是最大的那一封');
expect('h10', new Sim().setTab('rsa').setP(47).setQ(59).setE(5).setM(920).enc().ev, false, '同樣的 p、q，e 不是 17');
console.log('\n十個隱藏任務的交叉檢查：');
table.forEach(l => console.log('  ' + l));

// ---------- 4. 亂按（像學生隨便點每個控制項） ----------
const USERS = 400, STEPS = 300;
console.log('\n亂按模擬（固定種子；' + USERS + ' 人 × 每人 ' + STEPS + ' 次）：每次從目前看得到、可以按的控制項裡隨機挑一個——');
console.log('  分頁按鈕、換一段範例、把輸出放回輸入、全部清除、加密／解密、兩種神祕密文、這就是原文、自動找金鑰、用猜的金鑰解密、');
console.log('  勾選框、質數選單、下一個可用的 e、四個公鑰按鈕、畫布（轉盤拖到任意位移、點任一根長條）；滑桿 15% 最小、15% 最大、');
console.log('  10% 打字 3.14（→ 3）、60% 任意值。不打字（輸入框與金鑰欄不動），和試玩工具一樣。');
function sliderVal(rand, lo, hi) {
  const u = rand();
  if (u < 0.15) return lo;
  if (u < 0.3) return hi;
  if (u < 0.4) return clamp(3, lo, hi);
  return lo + Math.floor(rand() * (hi - lo + 1));
}
function actions(s, rand) {
  const a = [];
  ['caesar', 'freq', 'vig', 'rsa'].forEach(t => a.push(() => s.setTab(t)));
  a.push(() => s.wipe());
  a.push(() => {});                                   // 音效開關
  const txt = s.tab !== 'rsa';
  if (txt) {
    a.push(() => s.sample(), () => s.mystery('caesar'), () => s.mystery('vig'));
    if (s.myst && !s.myst.solved) a.push(() => s.crack());
  }
  if (s.tab === 'caesar' || s.tab === 'vig') a.push(() => s.swap());
  if (s.tab === 'caesar') {
    a.push(() => s.dirC('enc'), () => s.dirC('dec'), () => s.setK(sliderVal(rand, 0, 25)), () => s.setK(Math.floor(rand() * 26), 'drag'));
  } else if (s.tab === 'freq') {
    a.push(() => s.setG(sliderVal(rand, 0, 25)), () => s.overlay(!s.f.overlay), () => s.chiAll(!s.f.chiAll), () => s.setG(mod(Math.floor(rand() * 26) - 4, 26), 'bar'));
    if (s.f.chiAll) a.push(() => s.setG(Math.floor(rand() * 26), 'chi'));
  } else if (s.tab === 'vig') {
    a.push(() => s.dirV('enc'), () => s.dirV('dec'), () => s.setL(sliderVal(rand, 1, 12)), () => s.setCol(sliderVal(rand, 1, s.v.L)),
      () => s.setCs(sliderVal(rand, 0, 25)), () => s.autoKey(), () => s.useGuess(),
      () => s.setL(1 + Math.floor(rand() * 12), 'bar'), () => s.setCs(mod(Math.floor(rand() * 26) - 4, 26)));
  } else {
    const r = s.r, n = r.p * r.q, phi = (r.p - 1) * (r.q - 1);
    a.push(() => s.setP(K.PRIMES[Math.floor(rand() * K.PRIMES.length)]), () => s.setQ(K.PRIMES[Math.floor(rand() * K.PRIMES.length)]),
      () => s.setE(sliderVal(rand, 3, Math.max(3, phi - 1))), () => s.setM(sliderVal(rand, 0, Math.max(1, n - 1))));
    if (r.p !== r.q) a.push(() => s.nextE());
    if (r.key.ok) a.push(() => s.enc());
    if (r.key.ok && r.C != null) a.push(() => s.dec(), () => s.decPub(), () => s.eve());
  }
  return a;
}
const hits = {};
missions.forEach(m => { hits[m.id] = 0; });
const master = K.rng(20261112);
for (let u = 0; u < USERS; u++) {
  const seed = Math.floor(master() * 2147483647) + 1;
  const rand = K.rng(seed);
  const s = new Sim(seed ^ 0x5bd1e995);
  for (let i = 0; i < STEPS; i++) {
    const a = actions(s, rand);
    a[Math.floor(rand() * a.length)]();
  }
  missions.forEach(m => { if (run(m, s.ev) >= 0) hits[m.id]++; });
}
let worst = 0;
console.log('  公開任務（亂按碰巧完成的比例，只供參考）：');
pub.forEach(m => console.log('    ' + m.id.padEnd(18) + ('L' + m.level).padEnd(5) + (hits[m.id] / USERS * 100).toFixed(2) + '%'));
console.log('  隱藏任務：');
hidden.forEach(m => {
  const p = hits[m.id] / USERS;
  worst = Math.max(worst, p);
  console.log('    ' + m.id.padEnd(18) + ('L' + m.level).padEnd(5) + (p * 100).toFixed(2) + '%' + (p > 0.02 ? '　✗ 超過 2%' : (p > 0.01 ? '　（超過 1%）' : '')));
});
if (worst > 0.02) { fail++; console.log('  ✗ 有隱藏任務被亂按完成的比例超過 2%'); } else console.log('  ✓ 每個隱藏任務被亂按完成的比例都 < 2%（最高 ' + (worst * 100).toFixed(2) + '%）');

console.log(fail ? `\n✗ ${fail} 項不符合` : '\n全部任務都證明做得到；預設狀態不觸發；隱藏任務互不連帶；亂按誤觸都在 2% 以下。');
process.exitCode = fail ? 1 : 0;
