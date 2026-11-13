/* 任務可達成的證明腳本。用法：node tools/mission-proofs/text-encoding.js
 * 用計算核心模擬頁面（js/text-encoding.js）送出的事件，證明：
 *   1. 預設狀態不觸發任何任務；2. 每個任務都做得到（印出解法）；3. 十個隱藏任務的解法不會順便完成另一個隱藏任務（交叉檢查表）；
 *   4. 靠運氣的部分（挑戰題亂猜）平均要試幾次；
 *   5. 固定種子的亂按模擬（像學生隨便點每個控制項、亂打字、亂打位元組：400 人 × 每人 300 次），每個任務被碰巧完成的比例，隱藏任務都要 < 2%。
 * Big5 用 Node 的 TextDecoder('big5') 建索引（和頁面同一個方法）；Node 內建的 ICU 版本在香港增補區與少數位置和瀏覽器不同，
 * 證明裡用到的字（中文資料、許功蓋、αβγδ、EF BF BD）兩邊相同（交件單有瀏覽器裡的比對）。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const K = require(ROOT + 'js/text-encoding-core.js');
K.buildBig5(TextDecoder);
const missions = [];
global.window = { LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/text-encoding.js');
const PRE = 'text-encoding-';
const byId = id => missions.find(m => m.id === PRE + id);
const hidden = missions.filter(m => m.hidden);

// ---------- 與頁面相同的事件模擬 ----------
const EXAMPLES = { exHello: 'Hello, world!', exZh: '中文資料', exEmoji: '👍😀🎉', exMix: 'A é 中 😀', exAcc: 'café naïve', exRare: '𠃌字' };
const nonAscii = list => list.filter(it => it.cp >= 0x80).length;
class Page {
  constructor(lang) {
    this.ev = [];
    this.clock = 0;
    this.text = lang === 'en' ? 'Hi café 😀' : 'Hi 資訊 😀';
    this.origin = 'init'; this.write = 'utf8'; this.read = 'utf8'; this.raw = null; this.chain = null;
    this.quiz = null; this.streak = 0;
    this.recompute();
    this.sel = this.its.findIndex(it => it.cp >= 0x80);
  }
  recompute() {
    this.its = K.items(this.text);
    if (this.sel >= this.its.length) this.sel = Math.max(0, this.its.length - 1);
    this.sz = K.sizes(this.text);
    const enc = this.raw ? null : K.encode(this.text, this.write);
    const bytes = this.raw ? this.raw : enc.bytes;
    this.mix = { enc, bytes, dec: K.decode(bytes, this.read) };
  }
  b5Of(it) { return it.lone ? null : K.big5Bytes(it.cp); }
  textData(src, extra) {
    const lens = [0, 0, 0, 0], seen = {};
    let b5c = 0;
    this.its.forEach(it => {
      lens[(it.lone ? 3 : K.utf8Len(it.cp)) - 1]++;
      const b = this.b5Of(it);
      if (b && b.length === 2 && b[1] === 0x5C && !seen[it.cp]) { seen[it.cp] = 1; b5c++; }
    });
    return Object.assign({ src, origin: this.origin, n: this.its.length, units: this.text.length, u8: this.sz.u8, u16: this.sz.u16, b5: this.sz.b5, b5bad: this.sz.b5bad,
      lens, nonAscii: nonAscii(this.its), lone: this.its.filter(x => x.lone).length, cps: this.its.map(x => x.cp), twins: K.twins(this.text), b5c, joined: false }, extra || {});
  }
  depth() { return this.chain ? this.chain.depth[this.chain.depth.length - 1] : 0; }
  mixData(src, extra) {
    const dec = this.mix.dec, ch = this.chain, out = dec.text, kinds = K.errorKinds(dec.segs);
    return Object.assign({
      src, write: this.write, read: this.read, raw: !!this.raw, n: this.its.length, nonAscii: nonAscii(this.its),
      same: !this.raw && out === this.text, errors: dec.errors, kinds, kindsN: Object.keys(kinds).length, outN: dec.segs.length, nb: this.mix.bytes.length,
      bad: this.mix.enc ? this.mix.enc.bad : 0, bom: !this.raw && this.text.charCodeAt(0) === 0xFEFF, outIBS: out.indexOf('ï»¿') === 0,
      jiao: out.indexOf('嚙踝蕭') >= 0, srcFFFD: (this.text.match(/�/g) || []).length,
      chainLen: ch ? ch.steps.length : 0, b5u8: !!(ch && ch.steps.some(s => s.write === 'big5' && s.read === 'utf8' && s.errors > 0)),
      back: !!(ch && !this.raw && this.depth() >= 1 && out === ch.orig), depth: this.depth(), maxDepth: ch ? ch.maxDepth : 0,
      origNonAscii: ch ? nonAscii(K.items(ch.orig)) : 0,
      overDot: K.overlongs(this.mix.bytes).filter(o => o.cp === 0x2E || o.cp === 0x2F).length, edited: false, new3: 0
    }, extra || {});
  }
  setText(str, src, extra) {
    let list = K.items(str);
    if (list.length > K.MAX_CHARS) list = list.slice(0, K.MAX_CHARS);
    this.text = list.map(x => x.s).join('');
    this.raw = null;
    this.origin = src === 'example' ? 'example' : 'typed';
    if (src !== 'push') this.chain = null;
    if (extra && extra.sel != null) this.sel = extra.sel;
    this.recompute();
    this.ev.push({ type: 'text', data: this.textData(src, extra && extra.ev) });
    this.ev.push({ type: 'mix', data: this.mixData(src) });
    return this;
  }
  // ----- 操作 -----
  type(s) { if (s !== this.text) this.setText(s, 'typed', { sel: Math.max(0, K.items(s).length - 1) }); return this; }
  append(s) { return this.type(this.text + s); }
  example(id) {
    const s = EXAMPLES[id], l = K.items(s);
    let sel = 0; for (let i = 0; i < l.length; i++) if (l[i].cp >= 0x80) { sel = i; break; }
    return this.setText(s, 'example', { sel });
  }
  select(i, src) {
    if (!this.its.length) return this;
    this.sel = (i + this.its.length) % this.its.length;
    const it = this.its[this.sel], b = this.b5Of(it);
    this.ev.push({ type: 'pick', data: { src: src || 'btn', cp: it.cp, u8: it.lone ? 3 : K.utf8Len(it.cp), u16: it.units.length, b5: b ? b.length : 0, lone: it.lone } });
    return this;
  }
  next() { return this.select(this.sel + 1, 'btn'); }
  prev() { return this.select(this.sel - 1, 'btn'); }
  insertCp(v) {
    if (v === null || v === undefined || v < 0 || v > 0x10FFFF || this.its.length >= K.MAX_CHARS) return this;
    const its = this.its, at = its.length ? this.sel + 1 : 0;
    const before = its.slice(0, at).map(x => x.s).join(''), after = its.slice(at).map(x => x.s).join('');
    const prev = its[at - 1], next = its[at];
    const joinPrev = !!(prev && prev.lone && prev.cp >= 0xD800 && prev.cp <= 0xDBFF && v >= 0xDC00 && v <= 0xDFFF);
    const joinNext = !!(next && next.lone && next.cp >= 0xDC00 && next.cp <= 0xDFFF && v >= 0xD800 && v <= 0xDBFF);
    return this.setText(before + K.fromCp(v) + after, 'cp', { sel: joinPrev ? at - 1 : at, ev: { joined: joinPrev || joinNext, cp: v } });
  }
  ascii(code) {
    if (code < 0x20 || code === 0x7F || this.its.length >= K.MAX_CHARS) return this;
    const at = this.its.length ? this.sel + 1 : 0;
    return this.setText(this.its.slice(0, at).map(x => x.s).join('') + String.fromCharCode(code) + this.its.slice(at).map(x => x.s).join(''), 'ascii', { sel: at });
  }
  writeAs(e) { this.write = e; this.raw = null; this.recompute(); this.ev.push({ type: 'mix', data: this.mixData('write') }); return this; }
  readAs(e) { this.read = e; this.recompute(); this.ev.push({ type: 'mix', data: this.mixData('read') }); return this; }
  push() {
    const out = this.mix.dec.text;
    if (!out.length) return this;
    let ch = this.chain;
    if (!ch || this.raw) ch = this.chain = { orig: this.raw ? out : this.text, steps: [], texts: [this.raw ? out : this.text], depth: [0], maxDepth: 0 };
    if (!this.raw) {
      const prevDepth = ch.depth[ch.depth.length - 1], k = ch.texts.indexOf(out);
      const d = k >= 0 ? ch.depth[k] : out === this.text ? prevDepth : prevDepth + 1;
      ch.steps.push({ write: this.write, read: this.read, errors: this.mix.dec.errors });
      ch.texts.push(out); ch.depth.push(d); ch.maxDepth = Math.max(ch.maxDepth, d);
    }
    const keep = this.chain;
    this.setText(out, 'push', { sel: Math.min(this.sel, K.items(out).length - 1) });
    this.chain = keep;
    return this;
  }
  back() {
    if (this.chain) return this.setText(this.chain.orig, 'back');
    if (this.raw) { this.raw = null; this.recompute(); }
    return this;
  }
  hex(str) {
    const r = K.parseHex(str);
    if (r.error) return this;
    const prevBytes = this.mix.bytes.slice(), prevText = this.raw ? this.mix.dec.text : this.text;
    const edited = r.bytes.length !== prevBytes.length || r.bytes.some((b, i) => b !== prevBytes[i]);
    this.raw = r.bytes; this.recompute();
    let new3 = 0; const had = {};
    K.items(prevText).forEach(x => { had[x.cp] = 1; });
    this.mix.dec.segs.forEach(g => { if (g.ok && g.len === 3 && this.read === 'utf8' && !had[g.cp]) { new3++; had[g.cp] = 1; } });
    this.ev.push({ type: 'mix', data: this.mixData('hex', { edited, new3 }) });
    return this;
  }
  cut() {
    if (this.mix.bytes.length < 2) return this;
    const wasRaw = !!this.raw, before = this.mix.dec, srcText = wasRaw ? before.text : this.text, n = K.items(srcText).length;
    const multiAll = !wasRaw && this.mix.enc.chars.every(c => c.len >= 2 && c.ok);
    this.raw = this.mix.bytes.slice(1); this.recompute();
    const common = K.commonSuffix(this.mix.dec.text, srcText);
    this.ev.push({ type: 'cut', data: { write: this.write, read: this.read, raw: wasRaw, n, multiAll, common, lost: n - common, errorsBefore: before.errors, errors: this.mix.dec.errors } });
    this.ev.push({ type: 'mix', data: this.mixData('cut') });
    return this;
  }
  flip(k, bit) {
    const it = this.its[this.sel];
    if (!it) return this;
    const enc = K.encode(this.text, 'utf8'), ch = enc.chars[this.sel];
    if (k >= ch.len) return this;
    const pos = ch.start + k, bytes = enc.bytes.slice();
    bytes[pos] ^= (1 << bit);
    const dec = K.decode(bytes, 'utf8');
    let selNew = 0;
    for (let i = 0; i < dec.segs.length; i++) if (dec.segs[i].start <= pos && pos < dec.segs[i].start + dec.segs[i].len) { selNew = i; break; }
    const after = dec.segs[selNew] ? dec.segs[selNew].cp : 0xFFFD;
    const up = c => c >= 0x41 && c <= 0x5A, lo = c => c >= 0x61 && c <= 0x7A;
    const caseSwap = !it.lone && ((up(it.cp) && after === it.cp + 32) || (lo(it.cp) && after === it.cp - 32));
    this.setText(dec.text, 'flip', { sel: selNew });
    this.ev.push({ type: 'flip', data: { k, bit, mask: 1 << bit, before: it.cp, after, caseSwap, errors: dec.errors, n: dec.segs.length } });
    return this;
  }
  // ----- 挑戰 -----
  quizStart(rnd) {
    if (this.quiz && this.quiz.wait) return this.quizNext(rnd);
    if (this.quiz) return this;
    this.quiz = { i: 0, correct: 0, t0: this.clock };
    return this.quizNext(rnd);
  }
  quizNext(rnd) { const z = this.quiz; z.q = K.quizItem(rnd, z.i % 2 ? 'dec' : 'enc', 2 + (z.i % 3)); z.wait = false; return this; }
  /** know = true：照位元圖算出正確答案；否則照 guess 作答 */
  quizAnswer(guess, know) {
    const z = this.quiz;
    if (!z || z.wait) return this;
    const ans = know ? (z.q.kind === 'enc' ? K.hexStr(z.q.bytes) : K.uplus(z.q.cp)) : String(guess || '').trim();
    if (!ans) return this;
    const ok = K.quizCheck(z.q, ans);
    z.wait = true; z.i++;
    if (ok) { z.correct++; this.streak++; } else this.streak = 0;
    this.ev.push({ type: 'quiz', data: { ok, streak: this.streak, kind: z.q.kind, n: z.q.n } });
    if (z.i >= 5) { this.ev.push({ type: 'round', data: { correct: z.correct, total: 5, time: Math.round((this.clock - z.t0) * 10) / 10 } }); this.quiz = null; }
    return this;
  }
  quizStop() { this.quiz = null; return this; }
  tick(s) { this.clock += s; return this; }
}
const run = (m, events) => { m.mem = {}; return events.some(e => { try { return !!m.check(e, m.mem); } catch (err) { return false; } }); };

let fail = 0;
function expect(id, events, want, note) {
  const ok = run(byId(id), events), pass = ok === want;
  if (!pass) fail++;
  console.log((pass ? '  ✓ ' : '  ✗ ') + String(id).padEnd(4) + (want ? ' 達成：' : ' 不觸發：') + note);
  return events;
}

// ---------- 1. 預設狀態不觸發 ----------
console.log('預設狀態（UTF-8 存、UTF-8 開；預設文字），只按範例按鈕、同一個編碼按鈕、不改內容的控制項：');
['zh-Hant', 'en'].forEach(lang => {
  const s = new Page(lang);
  s.writeAs('utf8').readAs('utf8').example('exHello').example('exZh').example('exAcc').example('exHello');
  const hit = missions.filter(m => run(m, s.ev)).map(m => m.id);
  if (hit.length) { fail++; console.log('  ✗ ' + lang + ' 預設狀態觸發了 ' + hit.join('、')); } else console.log('  ✓ ' + lang + '：沒有任何任務被觸發（' + s.ev.length + ' 個事件；只載入頁面時一個事件也不送）');
});

// ---------- 2. 每個任務的解法 ----------
console.log('\n公開任務：');
expect('1', new Page().next().ev, true, '預設文字「Hi 資訊 😀」按「下一個字」選到「訊」（E8 A8 8A）');
expect('1', new Page().example('exHello').next().ev, false, 'Hello 只有 1 位元組的字');
expect('2', new Page().example('exEmoji').next().ev, true, '按「表情符號」，再按「下一個字」選到 😀（F0 9F 98 80；UTF-16 D83D DE00）');
expect('3', new Page().example('exZh').readAs('big5').ev, true, '「中文資料」存 UTF-8、開 Big5 → 「' + K.decode(K.encode('中文資料', 'utf8').bytes, 'big5').text + '」');
expect('3', new Page().example('exHello').readAs('big5').ev, false, '純 ASCII 用 Big5 開還是一樣（不是亂碼）');
{
  const s = new Page().example('exHello'); s.select(0); s.flip(0, 5);
  expect('4', s.ev, true, 'Hello 選「H」（48 = 0100 1000），翻轉第 5 位 → 68 =「h」');
  const t = new Page().example('exHello'); t.select(0); t.flip(0, 4);
  expect('4', t.ev, false, '翻轉第 4 位（48 → 58 =「X」）不算');
}
{
  const txt = '資訊科技讓世界更美好，對吧';
  const s = new Page().type(txt), d = s.ev[0].data;
  expect('5', s.ev, true, '打「' + txt + '」（' + d.n + ' 字）：UTF-8 ' + d.u8 + '、Big5 ' + d.b5 + '（' + d.u8 + ' × 2 = ' + d.b5 + ' × 3）');
  expect('5', new Page().type('資訊科技 is fun!!').ev, false, '混了英文：比例不是 1.5');
  expect('5', new Page().type('資訊科技').ev, false, '只有 4 個字');
}
expect('6', new Page().type('Aé中').insertCp(0x1F600).ev, true, '打「Aé中」，再用「插入」加 U+1F600（1 + 2 + 3 + 4 = 10 位元組）');
expect('6', new Page().type('Hi é 資訊 😀').ev, false, '四種長度都有，但不只 4 個字');
expect('6', new Page().example('exMix').ev, false, '按「混合」範例不算（要自己打）');
{
  const s = new Page().example('exHello').hex('E4 B8 AD E6 96 87 21');
  expect('7', s.ev, true, '開檔 UTF-8，位元組打「E4 B8 AD E6 96 87 21」→「中文!」');
  expect('7', new Page().example('exZh').hex(K.hexStr(K.encode('中文資料', 'utf8').bytes)).ev, false, '原封不動地套用原來的位元組不算');
  expect('7', new Page().example('exHello').hex('E4 B8 AD E6 96').ev, false, '最後一個字不完整（有錯誤）');
}
{
  const s = new Page().example('exAcc').readAs('latin1').push().writeAs('latin1').readAs('utf8');
  expect('8', s.ev, true, '「café naïve」存 UTF-8、開 Latin-1 →「cafÃ© naÃ¯ve」→ 用這段亂碼繼續 → 存 Latin-1、開 UTF-8 → 救回');
  const t = new Page().example('exZh').writeAs('big5').push().writeAs('utf8').readAs('big5');
  expect('8', t.ev, false, '「中文資料」存 Big5、開 UTF-8 全變成「�」：再怎麼換都救不回來');
}
expect('9', new Page().hex('80 C0 AF ED A0 80 E4').ev, true, '位元組「80 C0 AF ED A0 80 E4」（7 個）：孤立的延續位元組、過長編碼、編了代理、不完整');
expect('9', new Page().hex('80 C0 AF E4 B8').ev, false, '「80 C0 AF E4 B8」只有三種');
expect('9', new Page().hex('80 C0 AF ED A0 80 F4 90 80 80').ev, false, '四種以上但用了 10 個位元組');
{
  const s = new Page(), rnd = K.rng(5);
  s.quizStart(rnd);
  for (let i = 0; i < 3; i++) { s.quizAnswer('', true); s.quizStart(rnd); }
  expect('10', s.ev, true, '按「開始挑戰」照位元圖連對 3 題');
}
{
  const s = new Page(), rnd = K.rng(6);
  s.quizStart(rnd);
  for (let i = 0; i < 5; i++) { s.tick(20); s.quizAnswer('', true); if (i < 4) s.quizStart(rnd); }
  expect('11', s.ev, true, '一回合 5 題全對，每題 20 秒、共 100 秒');
  const t = new Page(), r2 = K.rng(6);
  t.quizStart(r2);
  for (let i = 0; i < 5; i++) { t.tick(30); t.quizAnswer('', true); if (i < 4) t.quizStart(r2); }
  expect('11', t.ev, false, '全對但用了 150 秒');
}

console.log('\n隱藏任務（解法與交叉檢查）：');
const sol = {
  h1: ['用「插入」加 U+10FFFF（最後一個碼位，UTF-8 是 F4 8F BF BF）', () => new Page().insertCp(0x10FFFF).ev],
  h2: ['打「αβγδ」：UTF-8、UTF-16、Big5 都是 8 位元組', () => new Page().type('αβγδ').ev],
  h3: ['清空文字，用「插入」加 U+FEFF（位元組順序記號），再在後面打「Hi」；存 UTF-8、開 Latin-1 → 開頭變成「ï»¿」', () => {
    const s = new Page().type(''); s.insertCp(0xFEFF); s.type('﻿Hi'); return s.readAs('latin1').ev;
  }],
  h4: ['用「插入」加 U+D83D（半個代理），再加 U+DE00 → 兩半接成 😀', () => new Page().type('A').insertCp(0xD83D).insertCp(0xDE00).ev],
  h5: ['打「許功蓋」：Big5 是 B3 5C、A5 5C、BB 5C，第二個位元組都是反斜線', () => new Page().type('許功蓋').ev],
  h6: ['按「重音字母」（é 是 U+00E9），再用「插入」加 U+0065 與 U+0301（e + 結合用的尖音符號）', () => { const s = new Page().example('exAcc'); s.select(3); return s.insertCp(0x65).insertCp(0x301).ev; }],
  h7: ['「中文資料」存 Big5、開 UTF-8（全變成 �）→ 用這段亂碼繼續 → 存 UTF-8、開 Big5 →「嚙踝蕭嚙踝蕭…」', () => new Page().example('exZh').writeAs('big5').push().writeAs('utf8').readAs('big5').ev],
  h8: ['開檔 UTF-8，位元組打「2F C0 AE 2E 2F」（RFC 3629 的例子：用過長編碼寫的「/../」）', () => new Page().hex('2F C0 AE 2E 2F').ev],
  h9: ['「中文資料」存 UTF-8 開 UTF-8，按「刪掉第一個位元組」→ 只壞第一個字；回到範例，存 Big5 開 Big5 再刪 → 後面全錯', () => {
    const s = new Page().example('exZh').cut();
    s.example('exZh').writeAs('big5').readAs('big5').cut();
    return s.ev;
  }],
  h10: ['「café naïve」存 UTF-8 開 Latin-1，繼續；再存 UTF-8 開 Latin-1（兩層），繼續；存 Latin-1 開 UTF-8，繼續；再存 Latin-1 開 UTF-8 → 救回', () =>
    new Page().example('exAcc').readAs('latin1').push().push().writeAs('latin1').readAs('utf8').push().ev]
};
const keys = Object.keys(sol), table = [];
keys.forEach(k => {
  const ev = sol[k][1]();
  expect(k, ev, true, sol[k][0]);
  const others = hidden.filter(m => m.id !== PRE + k && run(m, ev)).map(m => m.id.replace(PRE, ''));
  table.push(k.padEnd(4) + '→ ' + (others.length ? '✗ 也完成了 ' + others.join('、') : '沒有連帶完成其他隱藏任務'));
  if (others.length) fail++;
});
// 補充數值
{
  const s = new Page().example('exZh').writeAs('big5'); console.log('      h7 存 Big5（' + K.hexStr(s.mix.bytes) + '）、開 UTF-8 →「' + s.mix.dec.text + '」');
  s.push().writeAs('utf8').readAs('big5'); console.log('         再存 UTF-8（' + K.hexStr(s.mix.bytes.slice(0, 9)) + ' …）、開 Big5 →「' + s.mix.dec.text + '」');
  const c = new Page().example('exZh').cut(); console.log('      h9 UTF-8 刪掉第一個位元組 →「' + c.mix.dec.text + '」；Big5 刪掉 →「' + new Page().example('exZh').writeAs('big5').readAs('big5').cut().mix.dec.text + '」');
  const h = new Page().example('exAcc').readAs('latin1').push(); console.log('      h10 一層「' + h.text + '」→ 兩層「' + h.mix.dec.text + '」');
}
// 幾個「差一點」的反例
expect('h1', new Page().insertCp(0x10FFFE).ev, false, 'U+10FFFE 不是最後一格');
expect('h2', new Page().type('αβ').ev, false, '只有 2 個字');
expect('h2', new Page().type('éèêë').ev, false, 'é 等字 UTF-8、UTF-16 都是 2，但 Big5 沒有（香港增補區的位置不用來編碼）');
expect('h3', new Page().type('').insertCp(0xFEFF).readAs('latin1').ev, false, '只有一個 BOM、後面沒有字');
expect('h3', (() => { const s = new Page().type(''); s.insertCp(0xFEFF); s.type('﻿Hi'); return s.readAs('big5').ev; })(), false, '用 Big5 開不會變成 ï»¿');
expect('h4', new Page().insertCp(0xD83D).ev, false, '只有半個代理');
expect('h4', new Page().type('😀').ev, false, '直接打 😀 不算（要兩半自己接起來）');
expect('h5', new Page().type('許功').ev, false, '只有兩位');
expect('h5', new Page().type('許許許').ev, false, '同一個字三次只算一位');
expect('h6', new Page().example('exAcc').ev, false, '只有 é，沒有它的分身');
expect('h6', new Page().type('é é').ev, false, '兩個都是分解的寫法（沒有預組的 é）');
expect('h7', new Page().type('��').readAs('big5').ev, false, '自己打兩個 � 不算（要是真的弄丟的）');
expect('h7', new Page().example('exZh').writeAs('big5').push().writeAs('utf8').readAs('latin1').ev, false, '用 Latin-1 開是另一種亂碼');
expect('h8', new Page().hex('C0 80').ev, false, 'C0 80（過長的 NUL）不是點或斜線');
expect('h8', new Page().hex('2F 2E 2E 2F').ev, false, '正常的「/../」');
expect('h9', new Page().example('exZh').cut().ev, false, '只做 UTF-8 那一半');
expect('h9', (() => { const s = new Page().type('資訊科技'); s.cut(); s.type('資訊科技').writeAs('big5').readAs('big5').cut(); return s.ev; })(), false, '「資訊科技」的「訊」是 B0 54，54 是「T」：Big5 碰巧對回來 2 個字');
expect('h10', new Page().example('exAcc').readAs('latin1').push().writeAs('latin1').readAs('utf8').ev, false, '只有一層亂碼就救回（那是一般任務 8）');
console.log('\n十個隱藏任務的交叉檢查：');
table.forEach(l => console.log('  ' + l));

// ---------- 3. 靠運氣的部分 ----------
console.log('\n靠運氣的部分：');
{
  // enc 題：要打出 2–4 個位元組（每個 256 種）；dec 題：碼位約 2^11–2^20 種
  const pEnc = (1 / 3) * (Math.pow(256, -2) + Math.pow(256, -3) + Math.pow(256, -4));
  const pDec = (1 / 3) * (1 / 1920 + 1 / 61440 + 1 / 1048576);
  const p = (pEnc + pDec) / 2;
  console.log('  挑戰題亂猜一題猜中的機率 ≈ ' + p.toExponential(2) + '；亂猜連對 3 題平均要試約 ' + (1 / Math.pow(p, 3)).toExponential(1) + ' 次 → 只能真的照位元圖算');
}

// ---------- 4. 亂按 ----------
const MASH = 'abcdefgHIJKLMNO 0123456789,.!?中文資料你好世界臺灣早安é😀';
const HEXD = '0123456789ABCDEF';
function mashText(rnd, lo, hi) { const n = lo + Math.floor(rnd() * (hi - lo + 1)), a = Array.from(MASH); let s = ''; for (let i = 0; i < n; i++) s += a[Math.floor(rnd() * a.length)]; return s; }
function mashHex(rnd) { const n = 1 + Math.floor(rnd() * 12); const out = []; for (let i = 0; i < n; i++) out.push(HEXD[Math.floor(rnd() * 16)] + HEXD[Math.floor(rnd() * 16)]); return out.join(' '); }
function mashCp(rnd) {
  const u = rnd();
  if (u < 0.3) return Math.floor(rnd() * 0x80);
  if (u < 0.5) return Math.floor(rnd() * 0x800);
  if (u < 0.8) return Math.floor(rnd() * 0x10000);
  if (u < 0.9) return Math.floor(rnd() * 0x110000);
  return parseInt(Array.from({ length: 1 + Math.floor(rnd() * 6) }, () => HEXD[Math.floor(rnd() * 16)]).join(''), 16);
}
function student(rnd, steps) {
  const s = new Page();
  const choose = list => { let tot = 0; list.forEach(x => { tot += x[0]; }); let u = rnd() * tot; for (const x of list) { u -= x[0]; if (u < 0) return x[1]; } return list[list.length - 1][1]; };
  const ENC = ['utf8', 'big5', 'latin1'];
  const ACT = [
    [10, () => s.next()], [5, () => s.prev()], [5, () => s.select(Math.floor(rnd() * 50), 'click')],
    [8, () => s.example(Object.keys(EXAMPLES)[Math.floor(rnd() * 6)])],
    [5, () => s.append(mashText(rnd, 1, 4))], [3, () => s.type(mashText(rnd, 0, 12))],
    [5, () => s.insertCp(mashCp(rnd))],
    [6, () => s.ascii(0x20 + Math.floor(rnd() * 95))],
    [8, () => s.writeAs(ENC[Math.floor(rnd() * 3)])], [8, () => s.readAs(ENC[Math.floor(rnd() * 3)])],
    [5, () => s.push()], [3, () => s.back()],
    [4, () => s.hex(mashHex(rnd))], [2, () => s.hex(K.hexStr(s.mix.bytes))], [4, () => s.cut()],
    [7, () => s.flip(Math.floor(rnd() * 4), Math.floor(rnd() * 8))],
    [3, () => s.quizStart(rnd)], [3, () => s.quizAnswer(rnd() < 0.5 ? mashHex(rnd) : 'U+' + mashCp(rnd).toString(16), false)], [1, () => s.quizStop()],
    [4, () => {}]                                    // 音效、全部清除、方向鍵移動焦點：不送事件
  ];
  for (let i = 0; i < steps; i++) { s.tick(1 + rnd() * 2); choose(ACT)(); }
  return s.ev;
}
console.log('\n亂按模擬（固定種子；400 人 × 每人 300 個隨機操作，亂打字、亂打碼位與位元組、亂翻位元也算進去）：');
{
  const SEEDS = [1113, 2024, 4096];
  const P = 400, STEPS = 300;
  const rates = SEEDS.map(seed => {
    const rnd = K.rng(seed), hits = {};
    missions.forEach(m => { hits[m.id] = 0; });
    for (let p = 0; p < P; p++) { const ev = student(rnd, STEPS); missions.forEach(m => { if (run(m, ev)) hits[m.id]++; }); }
    const r = {}; missions.forEach(m => { r[m.id] = hits[m.id] / P; }); return r;
  });
  console.log('  ' + '任務'.padEnd(16) + SEEDS.map(s => ('種子 ' + s).padStart(10)).join(''));
  let worst = 0;
  missions.forEach(m => {
    if (m.hidden) rates.forEach(r => { worst = Math.max(worst, r[m.id]); });
    console.log('  ' + (m.id.replace(PRE, '') + (m.hidden ? '（隱藏）' : '')).padEnd(16) + rates.map(r => ((r[m.id] * 100).toFixed(2) + '%').padStart(10)).join(''));
  });
  if (worst >= 0.02) { fail++; console.log('  ✗ 有隱藏任務被亂按完成的比例達到 2%（最高 ' + (worst * 100).toFixed(2) + '%）'); }
  else console.log('  ✓ 每個隱藏任務被亂按完成的比例都低於 2%（最高 ' + (worst * 100).toFixed(2) + '%' + (worst <= 0.01 ? '，也都 ≤ 1%' : '') + '）');
}

console.log(fail ? `\n✗ ${fail} 項不符合` : '\n全部任務都證明做得到，預設狀態與亂按都不會誤觸。');
process.exitCode = fail ? 1 : 0;
