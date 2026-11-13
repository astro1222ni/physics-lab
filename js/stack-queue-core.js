/* stack-queue-core.js — 「堆疊與佇列」的計算核心（與畫面分離，Node 單元測試：tests/stack-queue-core.test.js）
 *
 * 堆疊（stack）：只能在頂端放入（push）、取出（pop）、查看（top）——後進先出（LIFO）。
 * 佇列（queue）：從後端排入（enqueue）、從前端離開（dequeue）、查看前端（front）——先進先出（FIFO）。
 * 容量有上限：滿了還放 → 溢位（overflow）；空的還拿 → 下溢（underflow）。兩種都不改變內容。
 *
 * 環狀佇列（陣列 Q[0..N−1]，照 CLRS 第 3 版 10.1 節的做法）：
 *   front 指向第一個元素，rear 指向「下一個要放的空位」；排入 Q[rear] ← x、rear ← (rear + 1) mod N；離開 x ← Q[front]、front ← (front + 1) mod N。
 *   空：front = rear；滿：(rear + 1) mod N = front。為了分得出「空」和「滿」，永遠留一格空位，所以最多放 N − 1 個；
 *   個數 = (rear − front + N) mod N。
 *   不繞回（一般陣列佇列）：rear 到 N 就不能再放（就算前面已經空出位置）——「假溢位」；最多放 N 個。
 *
 * 括號配對：由左往右掃，左括號 ( [ { 放進堆疊；右括號要和頂端的左括號同種才配對成功（取出）。三種錯誤：
 *   多了右括號（遇到右括號時堆疊是空的）、左右不對應（頂端的左括號種類不同）、多了左括號（掃完堆疊還不是空的）。
 *   其他字元一律跳過。
 *
 * 後序式（逆波蘭式）求值：數字放進堆疊；遇到運算子取出兩個數——先取出的是右運算元 b、後取出的是左運算元 a——算 a op b 再放回。
 *   錯誤：運算元不夠（運算子來了，堆疊不到 2 個數）、多餘的運算元（結束時堆疊不只 1 個數）、除以 0、指數是負的、數字太大。
 *   整數運算（和 C99、Java 相同）：a / b 向零取整（−7 / 2 = −3），a % b 的正負號和 a 相同（−7 % 2 = −1），a = (a / b)·b + a % b。
 *   a ^ b 是次方（b ≥ 0；0 ^ 0 = 1，和多數程式語言相同）。所有數都在 ±(2^53 − 1) 之內，用 BigInt 計算，完全精確。
 *
 * 中序轉後序（Dijkstra 的調度場演算法，1961）：數字直接送到輸出；運算子進運算子堆疊之前，
 *   先把堆疊頂端「優先順序較高、或一樣高而且是左結合」的運算子送到輸出；左括號放進堆疊；右括號把運算子送到輸出，直到遇到對應的左括號（丟掉）；
 *   最後把堆疊裡剩下的運算子全部送到輸出。優先順序：+ − 為 1；× ÷ % 為 2；^ 為 3，而且 ^ 是右結合（2 ^ 3 ^ 2 = 2 ^ 9 = 512）。
 *   不支援負號開頭（一元負號），請寫成 (0 − 3)。
 *
 * 輸入長度上限 60 個字元、40 個記號；數字是 0–99999 的整數。全形字與 × ÷ − 會先換成 * / -。不使用 eval 或 new Function。
 */
(function (root) {
  'use strict';
  const LIM = { len: 60, tokens: 40, num: 99999 };
  const MAX = Number.MAX_SAFE_INTEGER;           // 2^53 − 1
  const BMAX = BigInt(MAX);
  const OPEN = '([{', CLOSE = ')]}';
  const PAIR = { ')': '(', ']': '[', '}': '{' };
  const PREC = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2, '^': 3 };
  const OPS = '+-*/%^';

  /** 有種子的亂數產生器（mulberry32），回傳 [0, 1) 的均勻亂數 */
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // =====================================================================
  // 錯誤訊息（中、英）
  // =====================================================================
  const OPNAME = { '+': ['+', '+'], '-': ['−', '−'], '*': ['×', '×'], '/': ['÷', '÷'], '%': ['%', '%'], '^': ['^', '^'] };
  function sym(t) { return OPNAME[t] ? OPNAME[t][0] : t; }
  /** 錯誤代碼 → { zh, en }（頁面與測試共用） */
  function message(e) {
    if (!e) return { zh: '', en: '' };
    const p = e.pos != null ? e.pos + 1 : null;
    const at = p ? { zh: '第 ' + p + ' 個字元', en: 'character ' + p } : { zh: '', en: '' };
    switch (e.code) {
      case 'empty': return { zh: '還沒有輸入任何東西。', en: 'Nothing has been typed yet.' };
      case 'tooLong': return { zh: '太長了：最多 ' + LIM.len + ' 個字元。', en: 'Too long: at most ' + LIM.len + ' characters.' };
      case 'tooMany': return { zh: '太長了：最多 ' + LIM.tokens + ' 個數字和符號。', en: 'Too long: at most ' + LIM.tokens + ' numbers and symbols.' };
      case 'badChar': return { zh: at.zh + '「' + e.ch + '」看不懂：只能用整數、+ − × ÷ % ^ 和括號。', en: 'Cannot read “' + e.ch + '” at ' + at.en + ': use whole numbers, + − × ÷ % ^ and brackets only.' };
      case 'numBig': return { zh: '數字 ' + e.tok + ' 太大：每個數字最多 ' + LIM.num + '。', en: 'The number ' + e.tok + ' is too big: each number is at most ' + LIM.num + '.' };
      case 'paren': return { zh: '後序式不需要括號：運算的順序已經由符號的位置決定了。', en: 'A postfix expression needs no brackets: the order of the operations is already fixed by where the symbols stand.' };
      case 'underflow': return { zh: '運算元不夠：「' + sym(e.tok) + '」需要兩個數，堆疊裡只有 ' + e.have + ' 個。', en: 'Not enough operands: “' + sym(e.tok) + '” needs two numbers but the stack holds only ' + e.have + '.' };
      case 'extra': return { zh: '多餘的運算元：掃完了，堆疊裡還剩 ' + e.left + ' 個數（應該只剩 1 個）。', en: 'Too many operands: at the end the stack still holds ' + e.left + ' numbers (it should hold exactly 1).' };
      case 'div0': return { zh: '除以 0：' + e.a + ' ' + sym(e.tok) + ' 0 沒有定義。', en: 'Division by zero: ' + e.a + ' ' + sym(e.tok) + ' 0 is undefined.' };
      case 'negExp': return { zh: '指數是負的：' + e.a + ' ^ (' + e.b + ') 不是整數，本頁不計算。', en: 'Negative exponent: ' + e.a + ' ^ (' + e.b + ') is not a whole number, so this page does not compute it.' };
      case 'overflow': return { zh: '數字太大：結果超過 ±(2^53 − 1) ≈ ±9×10^15。', en: 'Number too big: the result is beyond ±(2^53 − 1) ≈ ±9×10^15.' };
      case 'missingOp': return { zh: at.zh + '：兩個數之間少了運算子。', en: 'At ' + at.en + ': an operator is missing between two numbers.' };
      case 'missingNum': return { zh: at.zh + (e.tok ? '「' + sym(e.tok) + '」' : '') + '：這裡應該是一個數或左括號。', en: 'At ' + at.en + (e.tok ? ' (“' + sym(e.tok) + '”)' : '') + ': a number or an opening bracket is expected here.' };
      case 'endOp': return { zh: '式子不能以運算子結尾。', en: 'An expression cannot end with an operator.' };
      case 'unary': return { zh: at.zh + '：本頁不支援負號開頭，請寫成 (0 − ' + (e.next || 'x') + ')。', en: 'At ' + at.en + ': a leading minus sign is not supported; write (0 − ' + (e.next || 'x') + ') instead.' };
      case 'extraRight': return { zh: at.zh + '「' + e.ch + '」：多了右括號（堆疊是空的，沒有左括號可以配對）。', en: 'At ' + at.en + ', “' + e.ch + '”: an extra closing bracket (the stack is empty, there is nothing to pair it with).' };
      case 'mismatch': return { zh: at.zh + '「' + e.ch + '」：左右不對應（堆疊頂端是「' + e.top + '」）。', en: 'At ' + at.en + ', “' + e.ch + '”: the brackets do not match (the top of the stack is “' + e.top + '”).' };
      case 'extraLeft': return { zh: '多了左括號：掃完了，堆疊裡還有 ' + e.left + ' 個左括號沒有配對。', en: 'Extra opening brackets: at the end, ' + e.left + ' opening bracket' + (e.left === 1 ? ' is' : 's are') + ' still waiting in the stack.' };
      default: return { zh: '無法處理。', en: 'Cannot process this.' };
    }
  }

  // =====================================================================
  // 文字前處理與記號（token）
  // =====================================================================
  /** 全形與常見符號換成半形：（）［］｛｝→ ()[]{}、× → *、÷ → /、− – — → -、全形數字 → 半形 */
  function normalize(s) {
    return String(s == null ? '' : s).normalize('NFKC')
      .replace(/[×✕∗·]/g, '*').replace(/[÷∕]/g, '/').replace(/[−–—‐]/g, '-').replace(/[　\t\r\n]/g, ' ');
  }
  /** 切成記號：{ t: 'num'|'op'|'lp'|'rp', v, s（原字串）, pos }；錯誤時 { err } */
  function tokenize(str) {
    const s = normalize(str);
    if (s.length > LIM.len) return { err: { code: 'tooLong' } };
    const toks = [];
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (c === ' ') { i++; continue; }
      if (c >= '0' && c <= '9') {
        let j = i;
        while (j < s.length && s[j] >= '0' && s[j] <= '9') j++;
        const txt = s.slice(i, j).replace(/^0+(?=\d)/, '');
        if (txt.length > 5 || +txt > LIM.num) return { err: { code: 'numBig', tok: txt, pos: i } };
        toks.push({ t: 'num', v: +txt, s: txt, pos: i });
        i = j; continue;
      }
      if (OPS.indexOf(c) >= 0) { toks.push({ t: 'op', v: c, s: c, pos: i }); i++; continue; }
      if (OPEN.indexOf(c) >= 0) { toks.push({ t: 'lp', v: c, s: c, pos: i }); i++; continue; }
      if (CLOSE.indexOf(c) >= 0) { toks.push({ t: 'rp', v: c, s: c, pos: i }); i++; continue; }
      return { err: { code: 'badChar', ch: c, pos: i } };
    }
    if (!toks.length) return { err: { code: 'empty' } };
    if (toks.length > LIM.tokens) return { err: { code: 'tooMany' } };
    toks.forEach(function (t, k) { t.id = k; });
    return { tokens: toks, text: s };
  }

  // =====================================================================
  // 整數運算（BigInt，完全精確）
  // =====================================================================
  /** a op b；回傳 { r } 或 { err } */
  function apply(op, a, b) {
    const A = BigInt(a), B = BigInt(b);
    let r;
    if (op === '+') r = A + B;
    else if (op === '-') r = A - B;
    else if (op === '*') r = A * B;
    else if (op === '/' || op === '%') {
      if (B === 0n) return { err: { code: 'div0', tok: op, a: a } };
      r = op === '/' ? A / B : A % B;           // BigInt：除法向零取整，餘數和被除數同號
    } else if (op === '^') {
      if (B < 0n) return { err: { code: 'negExp', a: a, b: b } };
      if ((A > 1n || A < -1n) && B > 60n) return { err: { code: 'overflow' } };
      if (A === 0n || A === 1n) r = B === 0n ? 1n : A;
      else if (A === -1n) r = B % 2n === 0n ? 1n : -1n;
      else r = A ** B;
    } else return { err: { code: 'badChar', ch: op } };
    if (r > BMAX || r < -BMAX) return { err: { code: 'overflow' } };
    return { r: Number(r) };
  }
  /** 向零取整的整數除法與餘數（給說明與測試用；和 apply 一致） */
  function idiv(a, b) { return Number(BigInt(a) / BigInt(b)); }
  function imod(a, b) { return Number(BigInt(a) % BigInt(b)); }

  // =====================================================================
  // 括號配對
  // =====================================================================
  /**
   * 掃描字串 str。只有括號算一步（其他字元跳過），最後一步是「掃完」。
   * 回傳 { ok, err, chars, steps, pairs:[[左, 右, 深度]], maxDepth, counts, balancedCounts, kinds, nBr }
   *   steps[k] = { i（字元位置；掃完時 = 長度）, ch, act: 'push'|'match'|'extraRight'|'mismatch'|'endOk'|'extraLeft', stack（之後，[{ch, i}]）, pair }
   */
  function parens(str) {
    const s = String(str == null ? '' : str).normalize('NFKC');
    const out = { ok: false, err: null, chars: Array.from(s), steps: [], pairs: [], maxDepth: 0, counts: { '(': 0, ')': 0, '[': 0, ']': 0, '{': 0, '}': 0 }, nBr: 0 };
    const chars = out.chars;
    if (chars.length > LIM.len) { out.err = { code: 'tooLong' }; return out; }
    if (!s.trim()) { out.err = { code: 'empty' }; return out; }
    chars.forEach(function (c) { if (out.counts[c] != null) { out.counts[c]++; out.nBr++; } });
    out.balancedCounts = out.counts['('] === out.counts[')'] && out.counts['['] === out.counts[']'] && out.counts['{'] === out.counts['}'];
    out.kinds = [['(', ')'], ['[', ']'], ['{', '}']].filter(function (p) { return out.counts[p[0]] + out.counts[p[1]] > 0; }).length;
    const st = [];
    const snap = function () { return st.map(function (x) { return { ch: x.ch, i: x.i }; }); };
    for (let i = 0; i < chars.length; i++) {
      const c = chars[i];
      if (OPEN.indexOf(c) >= 0) {
        st.push({ ch: c, i: i });
        out.maxDepth = Math.max(out.maxDepth, st.length);
        out.steps.push({ i: i, ch: c, act: 'push', stack: snap() });
      } else if (CLOSE.indexOf(c) >= 0) {
        if (!st.length) {
          out.err = { code: 'extraRight', ch: c, pos: i };
          out.steps.push({ i: i, ch: c, act: 'extraRight', stack: snap() });
          return out;
        }
        const top = st[st.length - 1];
        if (top.ch !== PAIR[c]) {
          out.err = { code: 'mismatch', ch: c, pos: i, top: top.ch, topPos: top.i };
          out.steps.push({ i: i, ch: c, act: 'mismatch', stack: snap() });
          return out;
        }
        st.pop();
        const pr = [top.i, i, st.length + 1];
        out.pairs.push(pr);
        out.steps.push({ i: i, ch: c, act: 'match', stack: snap(), pair: pr });
      }
    }
    if (st.length) {
      out.err = { code: 'extraLeft', left: st.length, pos: st[st.length - 1].i };
      out.steps.push({ i: chars.length, ch: '', act: 'extraLeft', stack: snap() });
      return out;
    }
    out.ok = true;
    out.steps.push({ i: chars.length, ch: '', act: 'endOk', stack: [] });
    return out;
  }
  /** 每個位置之後的堆疊深度（「山脈圖」）；錯誤時只到出錯的位置 */
  function depthProfile(res) {
    const d = [0];
    let cur = 0;
    for (let i = 0; i < res.chars.length; i++) {
      const st = res.steps.find(function (s) { return s.i === i; });
      if (st) {
        if (st.act === 'push') cur++;
        else if (st.act === 'match') cur--;
        else { d.push(cur); break; }
      }
      d.push(cur);
    }
    return d;
  }
  /** n 對小括號的所有合法排列（測試卡特蘭數） */
  function allBalanced(n) {
    const out = [];
    (function go(s, open, close) {
      if (s.length === 2 * n) { out.push(s); return; }
      if (open < n) go(s + '(', open + 1, close);
      if (close < open) go(s + ')', open, close + 1);
    })('', 0, 0);
    return out;
  }
  /** 卡特蘭數 C(n) = (2n)! / ((n + 1)! n!) */
  function catalan(n) { let c = 1; for (let k = 0; k < n; k++) c = c * 2 * (2 * k + 1) / (k + 2); return Math.round(c); }

  // =====================================================================
  // 後序式求值
  // =====================================================================
  function tokStr(t) { return t.t === 'op' ? t.v : t.s; }
  /**
   * 後序式求值。input 可以是字串或記號陣列（中序轉後序的結果）。
   * 回傳 { ok, value, err, tokens, steps, maxDepth, nNums, nOps, ops（各運算子次數）, nums（數字由左到右） }
   *   steps[k] = { k（記號序號）, tok, act: 'num'|'op'|'end'|'error', a, b, r, stack（之後的數）, err }
   */
  function evalPostfix(input) {
    let toks;
    if (Array.isArray(input)) toks = input.map(function (t, k) { return Object.assign({}, t, { id: k }); });
    else {
      const tz = tokenize(input);
      if (tz.err) return { ok: false, err: tz.err, tokens: [], steps: [], maxDepth: 0, nNums: 0, nOps: 0, ops: {}, nums: [] };
      toks = tz.tokens;
    }
    const res = { ok: false, value: null, err: null, tokens: toks, steps: [], maxDepth: 0, nNums: 0, nOps: 0, ops: {}, nums: [] };
    toks.forEach(function (t) { if (t.t === 'num') { res.nNums++; res.nums.push(t.v); } else if (t.t === 'op') { res.nOps++; res.ops[t.v] = (res.ops[t.v] || 0) + 1; } });
    const st = [];
    for (let k = 0; k < toks.length; k++) {
      const t = toks[k];
      if (t.t === 'lp' || t.t === 'rp') {
        res.err = { code: 'paren', pos: t.pos };
        res.steps.push({ k: k, tok: t, act: 'error', stack: st.slice(), err: res.err });
        return res;
      }
      if (t.t === 'num') {
        st.push(t.v);
        res.maxDepth = Math.max(res.maxDepth, st.length);
        res.steps.push({ k: k, tok: t, act: 'num', stack: st.slice() });
        continue;
      }
      if (st.length < 2) {
        res.err = { code: 'underflow', tok: t.v, have: st.length, pos: t.pos };
        res.steps.push({ k: k, tok: t, act: 'error', stack: st.slice(), err: res.err });
        return res;
      }
      const b = st.pop(), a = st.pop();
      const r = apply(t.v, a, b);
      if (r.err) {
        res.err = Object.assign({ pos: t.pos }, r.err);
        res.steps.push({ k: k, tok: t, act: 'error', a: a, b: b, stack: st.concat([a, b]), err: res.err });
        return res;
      }
      st.push(r.r);
      res.steps.push({ k: k, tok: t, act: 'op', a: a, b: b, r: r.r, stack: st.slice() });
    }
    if (st.length !== 1) {
      res.err = { code: 'extra', left: st.length };
      res.steps.push({ k: toks.length, tok: null, act: 'error', stack: st.slice(), err: res.err });
      return res;
    }
    res.ok = true;
    res.value = st[0];
    res.steps.push({ k: toks.length, tok: null, act: 'end', stack: st.slice() });
    return res;
  }

  // =====================================================================
  // 中序轉後序（調度場演算法）
  // =====================================================================
  /**
   * opts.powLeft：把 ^ 當成左結合（ALGOL 60 報告的規定，用來對照）。
   * 回傳 { ok, err, tokens, steps, postfix（記號陣列）, postfixStr, maxStack（含括號）, maxOps（只算運算子）, nNums, nOps, parenPairs, value, evalErr, valueLeft? }
   *   steps[k] = { k（記號序號）, tok, act: 'out'|'pop'|'push'|'lp'|'drop'|'flush'|'error', moved（被送出或丟掉的記號）, stack, out, err }
   */
  function toPostfix(str, opts) {
    opts = opts || {};
    const tz = tokenize(str);
    const res = { ok: false, err: null, tokens: [], steps: [], postfix: [], postfixStr: '', maxStack: 0, maxOps: 0, nNums: 0, nOps: 0, parenPairs: 0, value: null, evalErr: null };
    if (tz.err) { res.err = tz.err; return res; }
    const toks = tz.tokens;
    res.tokens = toks;
    const st = [], out = [];
    const snap = function (act, k, extra) {
      const s = Object.assign({ k: k, tok: toks[k] || null, act: act, stack: st.slice(), out: out.slice() }, extra || {});
      res.steps.push(s);
      res.maxStack = Math.max(res.maxStack, st.length);
      res.maxOps = Math.max(res.maxOps, st.filter(function (t) { return t.t === 'op'; }).length);
    };
    const fail = function (k, e) { res.err = e; snap('error', k, { err: e }); return res; };
    let want = 'operand';                                   // 下一個應該是數（或左括號）還是運算子（或右括號）
    for (let k = 0; k < toks.length; k++) {
      const t = toks[k];
      if (t.t === 'num') {
        if (want !== 'operand') return fail(k, { code: 'missingOp', pos: t.pos });
        out.push(t); res.nNums++;
        snap('out', k, { moved: t });
        want = 'operator';
      } else if (t.t === 'lp') {
        if (want !== 'operand') return fail(k, { code: 'missingOp', pos: t.pos });
        st.push(t);
        snap('lp', k, { moved: t });
      } else if (t.t === 'rp') {
        if (want !== 'operator') {
          const prev = toks[k - 1];
          if (prev && prev.t === 'lp') return fail(k, { code: 'missingNum', pos: t.pos, tok: t.v });
          if (!st.some(function (x) { return x.t === 'lp'; })) return fail(k, { code: 'extraRight', ch: t.v, pos: t.pos });
          return fail(k, { code: 'missingNum', pos: t.pos, tok: t.v });
        }
        for (;;) {
          if (!st.length) return fail(k, { code: 'extraRight', ch: t.v, pos: t.pos });
          const top = st[st.length - 1];
          if (top.t === 'lp') {
            if (top.v !== PAIR[t.v]) return fail(k, { code: 'mismatch', ch: t.v, pos: t.pos, top: top.v, topPos: top.pos });
            st.pop(); res.parenPairs++;
            snap('drop', k, { moved: top });
            break;
          }
          out.push(st.pop());
          snap('pop', k, { moved: top });
        }
      } else {
        if (want !== 'operator') {
          const next = toks[k + 1];
          if (t.v === '-' && (k === 0 || toks[k - 1].t === 'lp' || toks[k - 1].t === 'op')) return fail(k, { code: 'unary', pos: t.pos, next: next && next.t === 'num' ? next.s : '' });
          return fail(k, { code: 'missingNum', pos: t.pos, tok: t.v });
        }
        const p = PREC[t.v], right = t.v === '^' && !opts.powLeft;
        while (st.length) {
          const top = st[st.length - 1];
          if (top.t !== 'op') break;
          const q = PREC[top.v];
          if (q > p || (q === p && !right)) { out.push(st.pop()); snap('pop', k, { moved: top }); }
          else break;
        }
        st.push(t); res.nOps++;
        snap('push', k, { moved: t });
        want = 'operand';
      }
    }
    if (want === 'operand') {
      const last = toks[toks.length - 1];
      return fail(toks.length, last && last.t === 'op' ? { code: 'endOp', pos: last.pos } : { code: 'missingNum', pos: last ? last.pos : 0 });
    }
    while (st.length) {
      const top = st[st.length - 1];
      if (top.t === 'lp') return fail(toks.length, { code: 'extraLeft', left: st.filter(function (x) { return x.t === 'lp'; }).length, pos: top.pos });
      out.push(st.pop());
      snap('flush', toks.length, { moved: top });
    }
    res.ok = true;
    res.postfix = out;
    res.postfixStr = out.map(tokStr).join(' ');
    const ev = evalPostfix(out);
    if (ev.ok) res.value = ev.value; else res.evalErr = ev.err;
    res.evalMaxDepth = ev.maxDepth;
    return res;
  }
  /** 由左往右（^ 也由左往右）計算同一個中序式的值，用來對照右結合；不合法或算不出來時回傳 null */
  function valueLeftPow(str) {
    const r = toPostfix(str, { powLeft: true });
    return r.ok && r.value !== null ? r.value : null;
  }
  /** 後序式裡「所有數字都在所有運算子前面」 */
  function numbersFirst(postfix) {
    let seenOp = false;
    for (let i = 0; i < postfix.length; i++) {
      if (postfix[i].t === 'op') seenOp = true;
      else if (seenOp) return false;
    }
    return true;
  }
  /** 去掉空白與正規化後的字串（比對「是不是範例」） */
  function compact(str) { return normalize(str).replace(/\s+/g, ''); }

  // =====================================================================
  // 約瑟夫問題（給說明與測試）：n 人圍一圈，從第 1 人開始數，每數到第 k 人就出局
  // =====================================================================
  function josephus(n, k) {
    const q = []; for (let i = 1; i <= n; i++) q.push(i);
    const order = [];
    while (q.length > 1) {
      for (let r = 0; r < k - 1; r++) q.push(q.shift());
      order.push(q.shift());
    }
    return { survivor: q[0], order: order };
  }
  /** 遞迴公式：J(1) = 0，J(m) = (J(m − 1) + k) mod m（0 起算）；回傳 1 起算的位置 */
  function josephusFormula(n, k) { let j = 0; for (let m = 2; m <= n; m++) j = (j + k) % m; return j + 1; }

  // =====================================================================
  // 模式一：堆疊 A 與右邊的結構（佇列，或第二個堆疊 B）
  // =====================================================================
  const CAP_MIN = 3, CAP_MAX = 10, VAL_MIN = 1, VAL_MAX = 99;
  function isRun(a) { for (let i = 1; i < a.length; i++) if (a[i] !== a[i - 1] + 1) return false; return a.length > 0; }
  function same(a, b) { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }

  /** 建立模式一的狀態：cap 容量、rk 右邊是 'queue' 或 'stack'、next 下一個要放的值、auto 放入後自動加一 */
  function newDesk(o) {
    o = o || {};
    const d = { cap: o.cap || 6, rk: o.rk || 'queue', next: o.next || 1, auto: o.auto !== false, A: [], R: [], outA: [], outR: [], ops: 0, n: 0 };
    resetTrack(d);
    return d;
  }
  function resetTrack(d) {
    d.cycA = { pushed: [], popped: [], pure: true };
    d.cycR = { pushed: [], popped: [], pure: true, rots: 0 };
    d.two = d.rk === 'stack' ? { inA: [], outB: [], ok: true, firstOut: -1 } : null;
    d.pass = null; d.jos = null;
    passReset(d); josReset(d);
  }
  /** 「一整輪」的起點：堆疊 A 是空的、佇列裡至少 2 個值 */
  function passReset(d) {
    d.pass = d.rk === 'queue' && !d.A.length && d.R.length >= 2 ? { base: d.R.slice(), taken: 0, ok: true } : null;
  }
  /** 約瑟夫的起點：堆疊 A 是空的、佇列是至少 5 個連續遞增的數 */
  function josReset(d) {
    d.jos = d.rk === 'queue' && !d.A.length && d.R.length >= 5 && isRun(d.R) ? { start: d.R.slice(), gaps: [], cur: 0, ok: true } : null;
  }
  function takeVal(d) {
    const v = d.next;
    if (d.auto) d.next = d.next >= VAL_MAX ? VAL_MIN : d.next + 1;
    return v;
  }
  /**
   * 執行一個操作，回傳 { op, ok, err（'overflow'|'underflow'|''）, v, cost, ev（給任務的事件資料）}。
   * op：'push'、'pop'、'top'（堆疊 A）；'enq'、'deq'、'front'、'rot'（佇列）；'pushB'、'popB'、'topB'（堆疊 B）；
   *     'toR'（A 頂端 → 右邊）、'toL'（右邊 → A 頂端）；'clear'（清空兩邊）。
   */
  function deskDo(d, op) {
    const Q = d.rk === 'queue';
    const r = { op: op, ok: false, err: '', v: null, cost: 0, extra: {} };
    const fullA = d.A.length >= d.cap, fullR = d.R.length >= d.cap;
    let changedA = false, changedR = false;
    const endCycA = function () {
      if (d.A.length) return;
      if (d.cycA.pushed.length || d.cycA.popped.length) r.extra.cycA = { pushed: d.cycA.pushed.slice(), popped: d.cycA.popped.slice(), pure: d.cycA.pure };
      d.cycA = { pushed: [], popped: [], pure: true };
    };
    const endCycR = function () {
      if (d.R.length) return;
      if (d.cycR.pushed.length || d.cycR.popped.length) r.extra.cycR = { pushed: d.cycR.pushed.slice(), popped: d.cycR.popped.slice(), pure: d.cycR.pure, rots: d.cycR.rots, kind: d.rk };
      d.cycR = { pushed: [], popped: [], pure: true, rots: 0 };
    };
    switch (op) {
      case 'push':
        if (fullA) { r.err = 'overflow'; break; }
        r.v = takeVal(d); d.A.push(r.v); d.cycA.pushed.push(r.v); r.ok = true; r.cost = 1; changedA = true;
        if (d.two && d.two.ok) d.two.inA.push(r.v);
        break;
      case 'pop':
        if (!d.A.length) { r.err = 'underflow'; break; }
        r.v = d.A.pop(); d.outA.push(r.v); d.cycA.popped.push(r.v); r.ok = true; r.cost = 1; changedA = true;
        if (d.two) d.two.ok = false;
        endCycA();
        break;
      case 'top':
        if (!d.A.length) { r.err = 'underflow'; break; }
        r.v = d.A[d.A.length - 1]; r.ok = true; r.cost = 1;
        break;
      case 'enq': case 'pushB':
        if ((op === 'enq') !== Q) { r.err = 'na'; break; }
        if (fullR) { r.err = 'overflow'; break; }
        r.v = takeVal(d); d.R.push(r.v); d.cycR.pushed.push(r.v); r.ok = true; r.cost = 1; changedR = true;
        if (d.two) d.two.ok = false;
        break;
      case 'deq': case 'popB':
        if ((op === 'deq') !== Q) { r.err = 'na'; break; }
        if (!d.R.length) { r.err = 'underflow'; break; }
        r.v = Q ? d.R.shift() : d.R.pop(); d.outR.push(r.v); d.cycR.popped.push(r.v); r.ok = true; r.cost = 1; changedR = true;
        if (d.two && d.two.ok) { if (d.two.firstOut < 0) d.two.firstOut = d.two.inA.length; d.two.outB.push(r.v); }
        endCycR();
        break;
      case 'front': case 'topB':
        if ((op === 'front') !== Q) { r.err = 'na'; break; }
        if (!d.R.length) { r.err = 'underflow'; break; }
        r.v = Q ? d.R[0] : d.R[d.R.length - 1]; r.ok = true; r.cost = 1;
        break;
      case 'rot':
        if (!Q) { r.err = 'na'; break; }
        if (!d.R.length) { r.err = 'underflow'; break; }
        r.v = d.R.shift(); d.R.push(r.v); r.ok = true; r.cost = 2; d.cycR.rots++; changedR = true;
        break;
      case 'toR':
        if (!d.A.length) { r.err = 'underflow'; break; }
        if (fullR) { r.err = 'overflow'; break; }
        r.v = d.A.pop(); d.R.push(r.v); r.ok = true; r.cost = 2; changedA = changedR = true;
        d.cycA.pure = false; d.cycR.pure = false;
        endCycA();
        break;
      case 'toL':
        if (!d.R.length) { r.err = 'underflow'; break; }
        if (fullA) { r.err = 'overflow'; break; }
        r.v = Q ? d.R.shift() : d.R.pop(); d.A.push(r.v); r.ok = true; r.cost = 2; changedA = changedR = true;
        d.cycA.pure = false; d.cycR.pure = false;
        if (d.two) d.two.ok = false;
        endCycR();
        break;
      case 'clear':
        d.A = []; d.R = []; d.outA = []; d.outR = []; r.ok = true;
        resetTrack(d);
        break;
      default: r.err = 'na';
    }
    if (r.ok) { d.ops += r.cost; d.n++; }
    // ---------- 兩個堆疊做佇列：段落 ----------
    if (d.two && !d.two.ok && !d.A.length && !d.R.length) d.two = { inA: [], outB: [], ok: true, firstOut: -1 };
    // ---------- 佇列一整輪（只用 toL、toR）----------
    if (Q && r.ok && op !== 'clear') {
      if (op === 'toL' || op === 'toR') {
        const p = d.pass;
        if (p && p.ok) {
          if (op === 'toL') { if (p.taken >= p.base.length) p.ok = false; else p.taken++; }
          if (p.ok && p.taken === p.base.length && !d.A.length) {
            r.extra.pass = { base: p.base.slice(), result: d.R.slice() };
            passReset(d);
          }
        } else if (!d.A.length) passReset(d);
      } else if (changedA || changedR) passReset(d);
      // ---------- 約瑟夫：只用 rot、deq（top、front 不影響）----------
      const j = d.jos;
      if (op === 'rot') { if (j && j.ok) j.cur++; }
      else if (op === 'deq') {
        if (j && j.ok) {
          j.gaps.push(j.cur); j.cur = 0;
          if (d.R.length === 1) {
            const k = j.gaps[0] + 1;
            if (j.gaps.every(function (g) { return g === j.gaps[0]; })) r.extra.jos = { n: j.start.length, k: k, start: j.start.slice(), out: d.outR.slice(-j.gaps.length), survivor: d.R[0] };
            j.ok = false;
          }
        } else josReset(d);
      } else if (changedA || changedR) josReset(d);
    }
    if (op === 'clear') { passReset(d); josReset(d); }
    r.ev = deskEvent(d, r);
    return r;
  }
  /** 給任務的事件資料（頁面 emit 的就是它） */
  function deskEvent(d, r) {
    const ev = { mode: 'desk', op: r.op, ok: r.ok, err: r.err, v: r.v, rk: d.rk, cap: d.cap, A: d.A.slice(), R: d.R.slice(), outA: d.outA.slice(), outR: d.outR.slice(), ops: d.ops };
    if (r.extra.cycA) ev.cycA = r.extra.cycA;
    if (r.extra.cycR) ev.cycR = r.extra.cycR;
    if (r.extra.pass) ev.pass = r.extra.pass;
    if (r.extra.jos) ev.jos = r.extra.jos;
    if (d.two) ev.two = { inA: d.two.inA.slice(), outB: d.two.outB.slice(), ok: d.two.ok, firstOut: d.two.firstOut };
    return ev;
  }
  /** 改設定（容量、右邊的結構）：清空重來 */
  function deskSet(d, o) {
    if (o.cap != null) d.cap = Math.max(CAP_MIN, Math.min(CAP_MAX, Math.round(o.cap)));
    if (o.rk) d.rk = o.rk;
    if (o.next != null) d.next = Math.max(VAL_MIN, Math.min(VAL_MAX, Math.round(o.next)));
    if (o.auto != null) d.auto = !!o.auto;
    if (o.cap != null || o.rk) { d.A = []; d.R = []; d.outA = []; d.outR = []; resetTrack(d); }
    return d;
  }

  // =====================================================================
  // 模式二：用陣列做的佇列（環狀，或不繞回）
  // =====================================================================
  const RING_MIN = 4, RING_MAX = 12;
  function newRing(N, wrap) {
    N = Math.max(RING_MIN, Math.min(RING_MAX, Math.round(N || 8)));
    return { N: N, wrap: wrap !== false, buf: new Array(N).fill(null), front: 0, rear: 0, next: 1, auto: true, ops: 0, trueFull: false, rearWraps: 0, frontWraps: 0, everWrapped: false };
  }
  function ringSize(q) { return q.wrap ? (q.rear - q.front + q.N) % q.N : q.rear - q.front; }
  function ringFull(q) { return q.wrap ? (q.rear + 1) % q.N === q.front : q.rear === q.N; }
  function ringEmpty(q) { return q.front === q.rear; }
  function ringCap(q) { return q.wrap ? q.N - 1 : q.N; }
  /** op：'enq'、'deq'、'clear'；回傳 { op, ok, err（'full'|'empty'|''）, v, idx, wrapped（指標這次繞回 0）, ev } */
  function ringDo(q, op) {
    const r = { op: op, ok: false, err: '', v: null, idx: -1, wrapped: false };
    if (op === 'enq') {
      if (ringFull(q)) r.err = 'full';
      else {
        r.v = q.next; if (q.auto) q.next = q.next >= VAL_MAX ? VAL_MIN : q.next + 1;
        r.idx = q.rear; q.buf[q.rear] = r.v;
        if (q.wrap) { q.rear = (q.rear + 1) % q.N; if (q.rear === 0) { r.wrapped = true; q.rearWraps++; q.everWrapped = true; } }
        else q.rear++;
        r.ok = true; q.ops++;
        if (!q.wrap && ringSize(q) === q.N) q.trueFull = true;
      }
    } else if (op === 'deq') {
      if (ringEmpty(q)) r.err = 'empty';
      else {
        r.idx = q.front; r.v = q.buf[q.front]; q.buf[q.front] = null;
        if (q.wrap) { q.front = (q.front + 1) % q.N; if (q.front === 0) { r.wrapped = true; q.frontWraps++; } }
        else q.front++;
        r.ok = true; q.ops++;
      }
    } else if (op === 'clear') {
      const keep = { next: q.next, auto: q.auto };
      Object.assign(q, newRing(q.N, q.wrap), keep);
      r.ok = true;
    }
    r.ev = { mode: 'ring', op: op, ok: r.ok, err: r.err, v: r.v, idx: r.idx, wrapped: r.wrapped, N: q.N, wrap: q.wrap, front: q.front, rear: q.rear,
      size: ringSize(q), cap: ringCap(q), trueFull: q.trueFull, rearWraps: q.rearWraps, frontWraps: q.frontWraps, ops: q.ops };
    return r;
  }

  // =====================================================================
  // 範例與任務事件（頁面與任務證明共用，確保兩邊送出一模一樣的資料）
  // =====================================================================
  const EXAMPLES = {
    paren: ['(1 + 2) * (3 - 4)', '[(a + b) * c - d] / e', 'if (a[i] > 0) { b = (c + d); }', '((1 + 2) * 3'],
    postfix: ['3 4 + 2 *', '5 1 2 + 4 * + 3 -', '7 2 / 2 *', '1 2 3 +', '4 0 /'],
    infix: ['(3 + 4) * 2', '1 + 2 * 3 - 4', '8 / (3 - 1) ^ 2', '2 * (3 + 4) * 5']
  };
  /** 輸入的是不是某一個範例（去掉空白、全形換半形後比對） */
  function isExample(kind, str) {
    const c = compact(str);
    return EXAMPLES[kind].some(function (e) { return compact(e) === c; });
  }
  /** 有沒有沒被括號隔開的連續次方 a ^ b ^ c */
  function chainPow(tokens) {
    for (let i = 0; i + 2 < tokens.length; i++) if (tokens[i].t === 'op' && tokens[i].v === '^' && tokens[i + 1].t === 'num' && tokens[i + 2].t === 'op' && tokens[i + 2].v === '^') return true;
    return false;
  }
  function scanEvent(res, str) {
    const key = String(str == null ? '' : str).normalize('NFKC').replace(/\s+/g, '');
    return { ok: res.ok, err: res.err ? res.err.code : '', maxDepth: res.maxDepth, kinds: res.kinds || 0, nBr: res.nBr, balancedCounts: !!res.balancedCounts,
      onlyRound: key.length > 0 && /^[()]+$/.test(key), key: key, typed: !isExample('paren', str) };
  }
  function evalEvent(res, src, typed, fromParen) {
    return { src: src, ok: res.ok, value: res.ok ? res.value : null, err: res.err ? res.err.code : '', maxDepth: res.maxDepth, nNums: res.nNums, nOps: res.nOps,
      ops: Object.assign({}, res.ops), nums: res.nums.slice(), typed: !!typed, fromParen: fromParen || 0 };
  }
  function convertEvent(res, str) {
    return { ok: res.ok, err: res.err ? res.err.code : '', postfix: res.postfixStr, value: res.ok ? res.value : null, valueLeft: res.ok ? valueLeftPow(str) : null,
      maxOps: res.maxOps, nNums: res.nNums, nOps: res.nOps, parenPairs: res.parenPairs, numbersFirst: res.ok ? numbersFirst(res.postfix) : false,
      chainPow: chainPow(res.tokens), key: compact(str), typed: !isExample('infix', str) };
  }

  const api = {
    LIM: LIM, EXAMPLES: EXAMPLES, isExample: isExample, chainPow: chainPow, scanEvent: scanEvent, evalEvent: evalEvent, convertEvent: convertEvent, PREC: PREC, CAP_MIN: CAP_MIN, CAP_MAX: CAP_MAX, VAL_MIN: VAL_MIN, VAL_MAX: VAL_MAX, RING_MIN: RING_MIN, RING_MAX: RING_MAX,
    rng: rng, message: message, normalize: normalize, tokenize: tokenize, apply: apply, idiv: idiv, imod: imod,
    parens: parens, depthProfile: depthProfile, allBalanced: allBalanced, catalan: catalan,
    evalPostfix: evalPostfix, toPostfix: toPostfix, valueLeftPow: valueLeftPow, numbersFirst: numbersFirst, compact: compact, tokStr: tokStr,
    josephus: josephus, josephusFormula: josephusFormula,
    newDesk: newDesk, deskDo: deskDo, deskSet: deskSet, isRun: isRun, same: same,
    newRing: newRing, ringDo: ringDo, ringSize: ringSize, ringFull: ringFull, ringEmpty: ringEmpty, ringCap: ringCap
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.StackQueueCore = api;
})(typeof window !== 'undefined' ? window : this);
