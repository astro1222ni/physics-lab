/* code-tracing-core.js — 「程式追蹤：變數、選擇與迴圈」的計算核心（與畫面分離；Node 單元測試：tests/code-tracing-core.test.js）
 *
 * 本頁自己寫的小小 C 直譯器（不用 eval、不用 new Function，所有計算都在瀏覽器裡）：
 *   詞法分析 tokenize → 語法分析 parse（遞迴下降，產生語法樹）→ 執行 run（逐步記錄每一步的狀態）→ 轉成 Python toPython（同一棵語法樹）。
 *
 * 支援的語法（C 的一小部分，對準 APCS 程式識讀的程式運行追蹤）：
 *   型別 int、bool（C99 <stdbool.h>）、一維 int 陣列；宣告可給初值（陣列用 {…}，沒寫到的元素補 0）。
 *   指定 = += -= *= /= %=，遞增遞減 x++ x-- ++x --x（只能當成一個敘述，不能放在運算式裡）。
 *   運算子（優先順序由高到低）：! 與一元 −；* / %；+ −；< <= > >=；== !=；&&；||（&&、|| 由左往右、會短路）。
 *   if／else（含 else if）、while、for（三段）、break、continue、函式（int／bool／void，參數是 int 或 bool）、return、printf（%d、%%、\n）。
 *   原始碼可以只是一段敘述（省略 #include 與 main），也可以寫函式加 int main()。
 *
 * 整數規則（照 C99 起的標準，ISO/IEC 9899 6.5.5）：
 *   a / b 向零取整（−7 / 2 = −3），a % b 的正負號跟著 a（−7 % 2 = −1），永遠 (a / b) * b + a % b = a。
 *   int 是 32 位元有號整數（−2147483648 到 2147483647）。C 標準規定有號整數溢位是「未定義行為」（6.5 第 5 段），
 *   本頁選擇的模擬方式：結果超出範圍就停下來說明（不假裝繞回），所以 C 與 Python（整數不會溢位）兩邊不會各算出不同的數而不說。
 *   除以 0、陣列索引超出範圍、讀取還沒給值的變數，也都停下來說明（C 標準都是未定義行為）。
 * Python 對照：// 與 % 是向下取整（−7 // 2 = −4，−7 % 2 = 1）。執行時每遇到一次「C 與 Python 結果不同」的除法或取餘數，
 *   就記在那一步（pyDiff），畫面標出來；Python 寫法照 C 的意思轉換，其餘的語意都相同。
 * 上限：程式 4000 個字元、80 行；執行 10 000 步（超過就停，說明「可能是無窮迴圈」）；輸出 2000 個字元；呼叫深度 40 層；陣列 64 格。
 *
 * 「一步」的定義：做完一個宣告、指定、printf、break、continue、return、函式呼叫，或算一次條件（if、while、for 的條件），
 *   或 for 的第一段（初始化）、第三段（更新）。for 的順序：初始化 → 條件 → 本體 → 更新 → 條件 → 本體 → …… → 條件為假。
 */
(function (root) {
  'use strict';

  const INT_MIN = -2147483648, INT_MAX = 2147483647;
  const LIM = { steps: 10000, src: 4000, lines: 80, out: 2000, depth: 40, arr: 64 };
  const KW = ['int', 'bool', 'void', 'if', 'else', 'while', 'for', 'break', 'continue', 'return', 'true', 'false'];
  const TYPES = ['int', 'bool', 'void'];

  // ======================= 錯誤訊息 =======================
  const MSG = {
    tooLong: ['程式太長了（最多 4000 個字元、80 行）。', 'The program is too long (at most 4000 characters and 80 lines).'],
    badChar: ['看不懂的字元「%s」。', 'Unknown character “%s”.'],
    bigNum: ['數字 %s 超出 int 的範圍（最大 2147483647）。', 'The number %s is outside the range of int (at most 2147483647).'],
    badStr: ['字串沒有結尾的引號。', 'A string has no closing quote.'],
    expect: ['這裡應該是「%s」。', 'Expected “%s” here.'],
    expectExpr: ['這裡應該是一個運算式。', 'Expected an expression here.'],
    badStmt: ['看不懂這個敘述。', 'This statement is not understood.'],
    incInExpr: ['本頁的 ++、-- 只能單獨當成一個敘述。', 'On this page ++ and -- can only be used as a statement on their own.'],
    assignInExpr: ['本頁的指定（=）只能單獨當成一個敘述。', 'On this page an assignment (=) can only be a statement on its own.'],
    noMain: ['有函式時要寫 int main()。', 'A program with functions needs int main().'],
    dupFunc: ['函式 %s 重複定義。', 'The function %s is defined twice.'],
    unknownFunc: ['沒有名叫 %s 的函式。', 'There is no function called %s.'],
    argCount: ['呼叫 %s 的參數個數不對。', 'Wrong number of arguments in the call to %s.'],
    printfFmt: ['printf 的格式只支援 %d、%% 與 \\n，而且 %d 的個數要和後面的值一樣多。', 'printf only supports %d, %% and \\n here, and the number of %d must match the values after it.'],
    arrSize: ['陣列大小要是 1 到 64 的整數。', 'An array size must be a whole number from 1 to 64.'],
    arrInit: ['初值比陣列的格數還多。', 'There are more initial values than cells in the array.'],
    // 執行時
    undeclared: ['變數 %s 還沒有宣告。', 'The variable %s has not been declared.'],
    redeclared: ['變數 %s 在同一個區塊裡宣告了兩次。', 'The variable %s is declared twice in the same block.'],
    uninit: ['變數 %s 還沒有給值就被讀取了（C 的未定義行為）。', 'The variable %s is read before it has been given a value (undefined behaviour in C).'],
    notArray: ['%s 不是陣列。', '%s is not an array.'],
    isArray: ['%s 是陣列，要寫成 %s[索引]。', '%s is an array; write %s[index].'],
    index: ['索引超出範圍：%s[%d]，可以用的索引是 0 到 %d。C 不會檢查，結果是未定義行為；Python 會出現 IndexError。本頁停在這裡。', 'Index out of range: %s[%d]; the valid indices are 0 to %d. C does not check this (undefined behaviour); Python raises IndexError. The page stops here.'],
    div0: ['除以 0！C 的未定義行為；Python 會出現 ZeroDivisionError。本頁停在這裡。', 'Division by zero! Undefined behaviour in C; Python raises ZeroDivisionError. The page stops here.'],
    overflow: ['溢位：%s 的結果超出 int 的範圍（−2147483648 到 2147483647）。C 標準說有號整數溢位是未定義行為；Python 的整數不會溢位，會照算下去。本頁停在這裡。', 'Overflow: the result of %s is outside the range of int (−2147483648 to 2147483647). The C standard says signed overflow is undefined behaviour; Python integers never overflow and would carry on. The page stops here.'],
    steps: ['已經跑了 10000 步還沒結束，可能是無窮迴圈，本頁先停下來。', 'Still running after 10000 steps — possibly an infinite loop, so the page stops here.'],
    output: ['輸出超過 2000 個字元，本頁先停下來。', 'More than 2000 characters of output, so the page stops here.'],
    depth: ['函式呼叫超過 40 層（堆疊溢位），本頁先停下來。', 'More than 40 nested function calls (stack overflow), so the page stops here.'],
    noReturn: ['函式 %s 沒有用 return 回傳值就結束了。', 'The function %s ended without returning a value.'],
    voidValue: ['函式 %s 沒有回傳值，不能放在運算式裡。', 'The function %s returns nothing and cannot be used in an expression.'],
    breakOut: ['break 或 continue 不在迴圈裡。', 'break or continue outside a loop.']
  };
  function fmtMsg(key, args) {
    const m = MSG[key] || [key, key];
    const fill = function (s) { let i = 0; return s.replace(/%[sd]/g, function () { const a = args && args[i++]; return a == null ? '' : String(a); }); };
    return { key: key, zh: fill(m[0]), en: fill(m[1]) };
  }
  function CTError(key, args, line, col) { this.key = key; this.msg = fmtMsg(key, args); this.line = line || 0; this.col = col || 0; }

  // ======================= 32 位元整數 =======================
  function fits(v) { return v >= INT_MIN && v <= INT_MAX && Math.floor(v) === v; }
  /** C 的整數除法：向零取整。b = 0 時傳回 null */
  function cdiv(a, b) { if (b === 0) return null; const q = Math.trunc(a / b); return q === 0 ? 0 : q; }
  function cmod(a, b) { if (b === 0) return null; const r = a - b * cdiv(a, b); return r === 0 ? 0 : r; }
  function pydiv(a, b) { if (b === 0) return null; const q = Math.floor(a / b); return q === 0 ? 0 : q; }
  function pymod(a, b) { if (b === 0) return null; const r = a - b * pydiv(a, b); return r === 0 ? 0 : r; }

  // ======================= 參數（學生可以改的數字） =======================
  /** 把範本裡的 $名字 換成數值，記下每個參數在畫面上的位置（行、欄、長度） */
  function fill(tpl, params) {
    const lines = tpl.replace(/\r/g, '').split('\n');
    const spans = [];
    const out = lines.map(function (ln, li) {
      let res = '';
      let last = 0;
      ln.replace(/\$([a-zA-Z_]\w*)/g, function (m, name, at) {
        res += ln.slice(last, at);
        const v = params && params[name] != null ? params[name] : 0;
        const txt = String(v);
        spans.push({ name: name, line: li + 1, col: res.length, len: txt.length, v: v });
        res += txt;
        last = at + m.length;
        return m;
      });
      return res + ln.slice(last);
    });
    return { src: out.join('\n'), spans: spans };
  }

  // ======================= 詞法分析 =======================
  const OPS = ['<=', '>=', '==', '!=', '&&', '||', '++', '--', '+=', '-=', '*=', '/=', '%=',
    '+', '-', '*', '/', '%', '<', '>', '=', '!', '(', ')', '{', '}', '[', ']', ';', ','];
  /** tokens：{ t: 'num'|'id'|'kw'|'op'|'str', v, line, col, len, param? }；也回傳註解的位置（給語法上色） */
  function tokenize(src, spans) {
    if (src.length > LIM.src || src.split('\n').length > LIM.lines) throw new CTError('tooLong', null, 1, 0);
    const toks = [], comments = [];
    let i = 0, line = 1, col = 0;
    const pAt = {};
    (spans || []).forEach(function (s) { pAt[s.line + ':' + s.col] = s; });
    function adv(n) { for (let k = 0; k < n; k++) { if (src[i] === '\n') { line++; col = 0; } else col++; i++; } }
    while (i < src.length) {
      const c = src[i];
      const ps = pAt[line + ':' + col];
      if (ps) { toks.push({ t: 'num', v: ps.v, line: line, col: col, len: ps.len, param: ps.name }); adv(ps.len); continue; }
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { adv(1); continue; }
      if (c === '/' && src[i + 1] === '/') { const s = col, l = line; let n = 0; while (i + n < src.length && src[i + n] !== '\n') n++; comments.push({ line: l, col: s, len: n }); adv(n); continue; }
      if (c === '/' && src[i + 1] === '*') {
        const end = src.indexOf('*/', i + 2);
        const n = (end < 0 ? src.length : end + 2) - i;
        comments.push({ line: line, col: col, len: n }); adv(n); continue;
      }
      if (c === '#') { let n = 0; while (i + n < src.length && src[i + n] !== '\n') n++; comments.push({ line: line, col: col, len: n, pre: true }); adv(n); continue; }
      if (/[0-9]/.test(c)) {
        let n = 0; while (/[0-9]/.test(src[i + n] || '')) n++;
        const txt = src.substr(i, n), v = Number(txt);
        if (v > INT_MAX) throw new CTError('bigNum', [txt], line, col);
        toks.push({ t: 'num', v: v, line: line, col: col, len: n }); adv(n); continue;
      }
      if (/[A-Za-z_]/.test(c)) {
        let n = 0; while (/[A-Za-z0-9_]/.test(src[i + n] || '')) n++;
        const w = src.substr(i, n);
        toks.push({ t: KW.indexOf(w) >= 0 ? 'kw' : 'id', v: w, line: line, col: col, len: n }); adv(n); continue;
      }
      if (c === '"') {
        let n = 1, s = '';
        while (i + n < src.length && src[i + n] !== '"' && src[i + n] !== '\n') {
          if (src[i + n] === '\\' && i + n + 1 < src.length) {
            const e = src[i + n + 1];
            s += e === 'n' ? '\n' : e === 't' ? '\t' : e;
            n += 2;
          } else { s += src[i + n]; n++; }
        }
        if (src[i + n] !== '"') throw new CTError('badStr', null, line, col);
        toks.push({ t: 'str', v: s, line: line, col: col, len: n + 1 }); adv(n + 1); continue;
      }
      let op = null;
      for (let k = 0; k < OPS.length; k++) if (src.substr(i, OPS[k].length) === OPS[k]) { op = OPS[k]; break; }
      if (!op) throw new CTError('badChar', [c], line, col);
      toks.push({ t: 'op', v: op, line: line, col: col, len: op.length }); adv(op.length);
    }
    return { tokens: toks, comments: comments };
  }

  // ======================= 語法分析（遞迴下降） =======================
  const BIN = { '||': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '<=': 4, '>': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6 };
  function parse(src, spans) {
    const lex = tokenize(src, spans);
    const toks = lex.tokens;
    let p = 0, nid = 0;
    const nodes = [];
    function node(o, tok) { o.id = nid++; o.line = tok ? tok.line : 0; o.col = tok ? tok.col : 0; nodes.push(o); return o; }
    const peek = function (k) { return toks[p + (k || 0)]; };
    const last = function () { return toks[p - 1]; };
    function is(v, k) { const t = peek(k); return !!t && (t.t === 'op' || t.t === 'kw') && t.v === v; }
    function err(key, args) { const t = peek() || last() || { line: 1, col: 0 }; return new CTError(key, args, t.line, t.col); }
    function eat(v) { if (!is(v)) throw err('expect', [v]); return toks[p++]; }
    function ident() { const t = peek(); if (!t || t.t !== 'id') throw err('expect', ['名稱 name']); p++; return t; }
    /** 一個節點從 tok 開始、到目前最後一個記號結束：記下同一行裡的欄位範圍 */
    function close(n, tok) { const e = last(); n.c0 = tok.col; n.c1 = e.line === tok.line ? e.col + e.len : null; return n; }

    // ---------- 運算式 ----------
    function expr(minP) {
      let left = unary();
      for (;;) {
        const t = peek();
        if (!t || t.t !== 'op' || BIN[t.v] == null || BIN[t.v] < (minP || 1)) break;
        p++;
        const right = expr(BIN[t.v] + 1);
        const ft = firstTok(left);
        left = close(node({ k: 'bin', op: t.v, l: left, r: right }, t), ft);
        startTok.set(left.id, ft);
      }
      if (is('=') || is('+=') || is('-=') || is('*=') || is('/=') || is('%=')) throw err('assignInExpr');
      return left;
    }
    const startTok = new Map();
    function firstTok(n) { return startTok.get(n.id) || { line: n.line, col: n.col }; }
    function unary() {
      const t = peek();
      if (!t) throw err('expectExpr');
      if (t.t === 'op' && (t.v === '-' || t.v === '!' || t.v === '+')) {
        p++;
        const e = unary();
        const n = close(node({ k: 'un', op: t.v, e: e }, t), t);
        startTok.set(n.id, t);
        return n;
      }
      if (t.t === 'op' && (t.v === '++' || t.v === '--')) throw err('incInExpr');
      const n = primary();
      if (is('++') || is('--')) throw err('incInExpr');
      return n;
    }
    function primary() {
      const t = peek();
      if (!t) throw err('expectExpr');
      if (t.t === 'num') { p++; const n = close(node({ k: 'num', v: t.v, param: t.param || null }, t), t); startTok.set(n.id, t); return n; }
      if (t.t === 'kw' && (t.v === 'true' || t.v === 'false')) { p++; const n = close(node({ k: 'bool', v: t.v === 'true' }, t), t); startTok.set(n.id, t); return n; }
      if (t.t === 'op' && t.v === '(') {
        p++;
        const e = expr(1);
        eat(')');
        e.paren = true;
        startTok.set(e.id, t);
        e.c0 = t.col; e.c1 = last().line === t.line ? last().col + 1 : null;
        return e;
      }
      if (t.t === 'id') {
        p++;
        let n;
        if (is('(')) {
          p++;
          const args = [];
          if (!is(')')) { args.push(expr(1)); while (is(',')) { p++; args.push(expr(1)); } }
          eat(')');
          n = node({ k: 'call', name: t.v, args: args }, t);
        } else if (is('[')) {
          p++;
          const ix = expr(1);
          eat(']');
          n = node({ k: 'idx', name: t.v, index: ix }, t);
        } else n = node({ k: 'var', name: t.v }, t);
        close(n, t);
        startTok.set(n.id, t);
        return n;
      }
      throw err('expectExpr');
    }

    // ---------- 敘述 ----------
    function typeTok() { const t = peek(); return t && t.t === 'kw' && (t.v === 'int' || t.v === 'bool') ? t : null; }
    function decl() {
      const tt = toks[p++];
      const items = [];
      do {
        if (items.length) p++;   // 跳過逗號
        const nameT = ident();
        const it = { name: nameT.v, type: tt.v, size: null, init: null, line: nameT.line, col: nameT.col };
        if (is('[')) {
          p++;
          const sz = peek();
          if (!sz || sz.t !== 'num' || sz.v < 1 || sz.v > LIM.arr || tt.v !== 'int') throw err('arrSize');
          p++; eat(']');
          it.size = sz.v;
          if (is('=')) {
            p++; eat('{');
            const vals = [];
            if (!is('}')) { vals.push(expr(1)); while (is(',')) { p++; vals.push(expr(1)); } }
            eat('}');
            if (vals.length > it.size) throw err('arrInit');
            it.init = vals;
          }
        } else if (is('=')) { p++; it.init = expr(1); }
        items.push(it);
      } while (is(','));
      return { k: 'decl', type: tt.v, items: items };
    }
    /** 指定、遞增遞減或函式呼叫（for 的第一、三段也用它） */
    function simple() {
      const t = peek();
      if (t && t.t === 'op' && (t.v === '++' || t.v === '--')) {
        p++;
        const tg = target();
        return { k: 'assign', target: tg, op: t.v === '++' ? '+=' : '-=', value: null, inc: t.v, pre: true };
      }
      if (!t || t.t !== 'id') throw err('badStmt');
      if (peek(1) && peek(1).t === 'op' && peek(1).v === '(') {
        const c = primary();
        return { k: 'expr', e: c };
      }
      const tg = target();
      const o = peek();
      if (o && o.t === 'op' && (o.v === '++' || o.v === '--')) { p++; return { k: 'assign', target: tg, op: o.v === '++' ? '+=' : '-=', value: null, inc: o.v }; }
      if (o && o.t === 'op' && ['=', '+=', '-=', '*=', '/=', '%='].indexOf(o.v) >= 0) {
        p++;
        return { k: 'assign', target: tg, op: o.v, value: expr(1) };
      }
      throw err('badStmt');
    }
    function target() {
      const t = ident();
      if (is('[')) { p++; const ix = expr(1); eat(']'); return { name: t.v, index: ix }; }
      return { name: t.v, index: null };
    }
    function stmt() {
      const t = peek();
      if (!t) throw err('badStmt');
      if (t.t === 'op' && t.v === '{') return block();
      if (t.t === 'op' && t.v === ';') { p++; return close(node({ k: 'empty' }, t), t); }
      if (typeTok()) { const d = decl(); eat(';'); return close(node(d, t), t); }
      if (t.t === 'kw') {
        if (t.v === 'if') {
          p++; eat('(');
          const c = expr(1);
          eat(')');
          const n = node({ k: 'if', cond: c }, t);
          n.c0 = t.col; n.c1 = last().col + 1;
          n.then = stmt();
          n.els = null;
          if (is('else')) { const et = toks[p++]; n.elseLine = et.line; n.elseCol = et.col; n.els = stmt(); }
          return n;
        }
        if (t.v === 'while') {
          p++; eat('(');
          const c = expr(1);
          eat(')');
          const n = node({ k: 'while', cond: c }, t);
          n.c0 = t.col; n.c1 = last().col + 1;
          n.body = stmt();
          return n;
        }
        if (t.v === 'for') {
          p++; eat('(');
          const n = node({ k: 'for', init: null, cond: null, upd: null }, t);
          if (!is(';')) {
            const it = peek();
            n.init = typeTok() ? close(node(decl(), it), it) : close(node(simple(), it), it);
          }
          eat(';');
          if (!is(';')) n.cond = expr(1);
          eat(';');
          if (!is(')')) { const ut = peek(); n.upd = close(node(simple(), ut), ut); }
          eat(')');
          n.c0 = t.col; n.c1 = last().col + 1;
          n.body = stmt();
          return n;
        }
        if (t.v === 'break' || t.v === 'continue') { p++; eat(';'); return close(node({ k: t.v }, t), t); }
        if (t.v === 'return') {
          p++;
          const n = node({ k: 'return', value: null }, t);
          if (!is(';')) n.value = expr(1);
          eat(';');
          return close(n, t);
        }
        throw err('badStmt');
      }
      if (t.t === 'id' && t.v === 'printf') return printfStmt();
      const s = simple();
      eat(';');
      return close(node(s, t), t);
    }
    function printfStmt() {
      const t = toks[p++];
      eat('(');
      const f = peek();
      if (!f || f.t !== 'str') throw err('printfFmt');
      p++;
      const args = [];
      while (is(',')) { p++; args.push(expr(1)); }
      eat(')'); eat(';');
      // 拆成「文字、值、文字……」
      const parts = [];
      let lit = '', ai = 0;
      for (let i = 0; i < f.v.length; i++) {
        const ch = f.v[i];
        if (ch === '%') {
          const nx = f.v[i + 1];
          if (nx === '%') { lit += '%'; i++; continue; }
          if (nx === 'd' && ai < args.length) { if (lit) parts.push({ lit: lit }); lit = ''; parts.push({ e: args[ai++] }); i++; continue; }
          throw new CTError('printfFmt', null, f.line, f.col);
        }
        lit += ch;
      }
      if (lit) parts.push({ lit: lit });
      if (ai !== args.length) throw new CTError('printfFmt', null, f.line, f.col);
      return close(node({ k: 'print', fmt: f.v, parts: parts }, t), t);
    }
    function block() {
      const t = eat('{');
      const n = node({ k: 'block', body: [] }, t);
      while (!is('}')) { if (!peek()) throw err('expect', ['}']); n.body.push(stmt()); }
      const e = eat('}');
      n.endLine = e.line; n.endCol = e.col;
      return n;
    }

    // ---------- 整支程式：函式定義＋主程式 ----------
    const prog = { funcs: {}, order: [], main: null, hasMain: false, nodes: nodes, comments: lex.comments, tokens: toks };
    const top = node({ k: 'block', body: [] }, toks[0] || { line: 1, col: 0 });
    while (p < toks.length) {
      const t = peek();
      const isFunc = t.t === 'kw' && TYPES.indexOf(t.v) >= 0 && peek(1) && peek(1).t === 'id' && peek(2) && peek(2).t === 'op' && peek(2).v === '(';
      if (isFunc) {
        p++;
        const nameT = ident();
        eat('(');
        const params = [];
        if (is('void')) p++;
        else if (!is(')')) {
          do {
            if (params.length) p++;
            const pt = typeTok();
            if (!pt) throw err('expect', ['int']);
            p++;
            params.push({ type: pt.v, name: ident().v });
          } while (is(','));
        }
        eat(')');
        const body = block();
        const f = node({ k: 'func', name: nameT.v, ret: t.v, params: params, body: body }, t);
        if (prog.funcs[f.name]) throw new CTError('dupFunc', [f.name], t.line, t.col);
        if (f.name === 'main') { prog.main = body; prog.hasMain = true; prog.mainFunc = f; }
        else { prog.funcs[f.name] = f; prog.order.push(f.name); }
      } else top.body.push(stmt());
    }
    if (prog.hasMain && top.body.length) throw new CTError('badStmt', null, top.body[0].line, top.body[0].col);
    if (!prog.hasMain) {
      if (prog.order.length) throw new CTError('noMain', null, 1, 0);
      prog.main = top;
      top.endLine = toks.length ? toks[toks.length - 1].line : 1;
    }
    // 檢查函式呼叫的名稱與參數個數；記下陣列的索引用了哪些變數（畫面上畫指標）
    prog.indexVars = {};
    nodes.forEach(function (n) {
      if (n.k === 'call') {
        const f = prog.funcs[n.name];
        if (!f) throw new CTError('unknownFunc', [n.name], n.line, n.col);
        if (f.params.length !== n.args.length) throw new CTError('argCount', [n.name], n.line, n.col);
      }
      const ix = n.k === 'idx' ? n.index : (n.k === 'assign' && n.target.index) ? n.target.index : null;
      if (ix) walkExpr(ix, function (e) { if (e.k === 'var') { prog.indexVars[n.k === 'idx' ? n.name : n.target.name] = prog.indexVars[n.k === 'idx' ? n.name : n.target.name] || {}; prog.indexVars[n.k === 'idx' ? n.name : n.target.name][e.name] = true; } });
    });
    return prog;
  }
  function walkExpr(e, f) {
    if (!e) return;
    f(e);
    if (e.k === 'bin') { walkExpr(e.l, f); walkExpr(e.r, f); }
    else if (e.k === 'un') walkExpr(e.e, f);
    else if (e.k === 'idx') walkExpr(e.index, f);
    else if (e.k === 'call') e.args.forEach(function (a) { walkExpr(a, f); });
  }

  // ======================= 執行 =======================
  function BreakSig() {} function ContinueSig() {}
  function ReturnSig(v) { this.v = v; }
  /**
   * 執行整支程式，記下每一步。回傳 { steps, output, error, finished, stats }。
   * 每一步：{ kind, node（語法樹節點代號）, line, c0, c1, part（for 的 'init'|'cond'|'upd'）, cond（條件的真假）, show（條件代入數值後的樣子）,
   *          frames（呼叫堆疊：[{ fn, vars: [{ name, type, v | arr }] }]）, out（到這一步為止的輸出長度）, loops（進行中的迴圈：[{ line, iter }]）,
   *          pyDiff（這一步 C 與 Python 不同的除法或取餘數）, sc（這一步短路的次數）, printed, ret, call, err }
   */
  function run(prog, opts) {
    opts = opts || {};
    const maxSteps = opts.maxSteps || LIM.steps;
    const steps = [];
    let out = '';
    const frames = [];
    const loopStack = [];
    const stats = { condT: 0, condF: 0, sc: 0, pyDiffs: 0, maxDepth: 0, loops: {}, peaks: {}, lows: {}, lineCounts: {}, calls: 0 };
    let pend = { pyDiff: [], sc: 0 };

    function frame() { return frames[frames.length - 1]; }
    function lookup(name, node) {
      const f = frame();
      for (let i = f.scopes.length - 1; i >= 0; i--) if (f.scopes[i].has(name)) return f.scopes[i].get(name);
      throw new CTError('undeclared', [name], node.line, node.col);
    }
    function snapFrames() {
      // 每一層呼叫看得到的變數，依宣告順序（外層區塊先）；內層同名的變數會遮住外層的
      return frames.map(function (f) {
        const vis = {};
        f.scopes.forEach(function (s, i) { s.forEach(function (c, name) { vis[name] = i; }); });
        const vars = [];
        f.scopes.forEach(function (s, i) {
          s.forEach(function (c, name) { if (vis[name] === i) vars.push({ name: name, type: c.type, v: c.arr ? null : c.v, arr: c.arr ? c.arr.slice() : null, depth: i }); });
        });
        return { fn: f.fn, args: f.args, vars: vars };
      });
    }
    function record(kind, n, extra) {
      if (steps.length >= maxSteps) throw new CTError('steps', null, n.line, n.col);
      const s = { kind: kind, node: n.id, line: n.line, c0: n.c0 == null ? null : n.c0, c1: n.c1 == null ? null : n.c1,
        frames: snapFrames(), out: out.length, loops: loopStack.map(function (l) { return { line: l.line, iter: l.iter, id: l.id }; }) };
      if (extra) for (const k in extra) s[k] = extra[k];
      if (pend.pyDiff.length) { s.pyDiff = pend.pyDiff; stats.pyDiffs += pend.pyDiff.length; }
      if (pend.sc) { s.sc = pend.sc; stats.sc += pend.sc; }
      pend = { pyDiff: [], sc: 0 };
      stats.lineCounts[s.line] = (stats.lineCounts[s.line] || 0) + 1;
      steps.push(s);
      return s;
    }
    function track(name, v) {
      if (typeof v !== 'number') return;
      if (stats.peaks[name] == null || v > stats.peaks[name]) stats.peaks[name] = v;
      if (stats.lows[name] == null || v < stats.lows[name]) stats.lows[name] = v;
    }
    const asInt = function (v) { return typeof v === 'boolean' ? (v ? 1 : 0) : v; };
    const asBool = function (v) { return typeof v === 'boolean' ? v : v !== 0; };
    function conv(type, v) { return type === 'bool' ? asBool(v) : asInt(v); }

    // ---------- 運算式求值；rec 記下每個節點的值（給條件的代入顯示用） ----------
    function ev(e, rec) {
      let v;
      switch (e.k) {
        case 'num': v = e.v; break;
        case 'bool': v = e.v; break;
        case 'var': {
          const c = lookup(e.name, e);
          if (c.arr) throw new CTError('isArray', [e.name, e.name], e.line, e.col);
          if (c.v === undefined) throw new CTError('uninit', [e.name], e.line, e.col);
          v = c.v; break;
        }
        case 'idx': {
          const c = lookup(e.name, e);
          if (!c.arr) throw new CTError('notArray', [e.name], e.line, e.col);
          const i = asInt(ev(e.index, rec));
          if (i < 0 || i >= c.arr.length) throw new CTError('index', [e.name, i, c.arr.length - 1], e.line, e.col);
          v = c.arr[i]; break;
        }
        case 'call': v = call(e, rec); if (v === undefined) throw new CTError('voidValue', [e.name], e.line, e.col); break;
        case 'un': {
          const a = ev(e.e, rec);
          if (e.op === '!') v = !asBool(a);
          else if (e.op === '+') v = asInt(a);
          else { v = -asInt(a); if (!fits(v)) throw new CTError('overflow', ['−(' + a + ')'], e.line, e.col); if (v === 0) v = 0; }
          break;
        }
        case 'bin': {
          if (e.op === '&&' || e.op === '||') {
            const a = asBool(ev(e.l, rec));
            if (e.op === '&&' ? !a : a) { pend.sc++; if (rec) rec.set(e.r.id, 'skip'); v = a; }
            else v = asBool(ev(e.r, rec));
            break;
          }
          const a = ev(e.l, rec), b = ev(e.r, rec);
          v = arith(e.op, a, b, e);
          break;
        }
        default: throw new CTError('expectExpr', null, e.line, e.col);
      }
      if (rec) rec.set(e.id, v);
      return v;
    }
    function arith(op, a0, b0, e) {
      const a = asInt(a0), b = asInt(b0);
      let v;
      switch (op) {
        case '+': v = a + b; break;
        case '-': v = a - b; break;
        case '*': v = a * b; break;
        case '/': case '%': {
          if (b === 0) throw new CTError('div0', null, e.line, e.col);
          const q = cdiv(a, b);
          if (!fits(q)) throw new CTError('overflow', [a + ' ' + op + ' ' + b], e.line, e.col);   // −2147483648 / −1（取餘數也一起算未定義）
          v = op === '/' ? q : cmod(a, b);
          const py = op === '/' ? pydiv(a, b) : pymod(a, b);
          if (py !== v) pend.pyDiff.push({ op: op, a: a, b: b, c: v, py: py, line: e.line });
          break;
        }
        case '<': return a < b;
        case '<=': return a <= b;
        case '>': return a > b;
        case '>=': return a >= b;
        case '==': return a === b;
        case '!=': return a !== b;
      }
      if (!fits(v)) throw new CTError('overflow', [a + ' ' + op + ' ' + b], e.line, e.col);
      return v === 0 ? 0 : v;
    }
    function call(e, rec) {
      const f = prog.funcs[e.name];
      const args = e.args.map(function (a) { return ev(a, rec); });
      if (frames.length >= LIM.depth) throw new CTError('depth', null, e.line, e.col);
      const sc = new Map();
      f.params.forEach(function (pa, i) { sc.set(pa.name, { type: pa.type, v: conv(pa.type, args[i]) }); });
      frames.push({ fn: f.name, args: f.params.map(function (pa, i) { return conv(pa.type, args[i]); }), scopes: [sc] });
      stats.calls++;
      stats.maxDepth = Math.max(stats.maxDepth, frames.length - 1);
      record('call', e, { call: f.name, args: frames[frames.length - 1].args.slice(), c0: e.c0, c1: e.c1 });
      let ret;
      try {
        execBlock(f.body, true);
        if (f.ret !== 'void') throw new CTError('noReturn', [f.name], f.body.endLine, f.body.endCol);
        record('fend', { id: f.body.id, line: f.body.endLine, c0: f.body.endCol, c1: f.body.endCol + 1 });
        ret = undefined;
      } catch (x) {
        if (!(x instanceof ReturnSig)) throw x;
        ret = x.v === undefined ? undefined : conv(f.ret, x.v);
      }
      frames.pop();
      return ret;
    }

    // ---------- 敘述 ----------
    function declare(it, n) {
      const sc = frame().scopes[frame().scopes.length - 1];
      if (sc.has(it.name)) throw new CTError('redeclared', [it.name], it.line, it.col);
      if (it.size != null) {
        const arr = new Array(it.size).fill(it.init ? 0 : undefined);
        if (it.init) it.init.forEach(function (x, i) { arr[i] = asInt(ev(x)); });
        if (!it.init) arr.fill(undefined);
        sc.set(it.name, { type: 'int', arr: arr });
      } else {
        let v;
        if (it.init && hasLogic(it.init)) { const rec = new Map(); v = conv(it.type, ev(it.init, rec)); pendShow = { show: showExpr(it.init, rec), sexpr: it.init.id, sval: v }; }
        else v = it.init ? conv(it.type, ev(it.init)) : undefined;
        sc.set(it.name, { type: it.type, v: v });
        track(it.name, v);
      }
    }
    function assign(s) {
      const c = lookup(s.target.name, s);
      let idx = null;
      if (s.target.index) {
        if (!c.arr) throw new CTError('notArray', [s.target.name], s.line, s.col);
        idx = asInt(ev(s.target.index));
        if (idx < 0 || idx >= c.arr.length) throw new CTError('index', [s.target.name, idx, c.arr.length - 1], s.line, s.col);
      } else if (c.arr) throw new CTError('isArray', [s.target.name, s.target.name], s.line, s.col);
      let val;
      if (s.value && hasLogic(s.value)) { const rec = new Map(); val = ev(s.value, rec); pendShow = { show: showExpr(s.value, rec), sexpr: s.value.id, sval: val }; }
      else val = s.value ? ev(s.value) : 1;
      let nv;
      if (s.op === '=') nv = conv(c.type, val);
      else {
        const old = idx == null ? c.v : c.arr[idx];
        if (old === undefined) throw new CTError('uninit', [s.target.name], s.line, s.col);
        nv = conv(c.type, arith(s.op[0], old, val, s));
      }
      if (idx == null) { c.v = nv; track(s.target.name, nv); } else c.arr[idx] = nv;
      return { idx: idx };
    }
    function show(e, rec) { return showExpr(e, rec); }
    /** 指定或宣告的右邊有 && 或 ||：記下代入數值的樣子（看得到短路） */
    let pendShow = null;
    function hasLogic(e) { let f = false; walkExpr(e, function (x) { if (x.k === 'bin' && (x.op === '&&' || x.op === '||')) f = true; }); return f; }
    function takeShow(extra) { if (!pendShow) return extra || null; const o = Object.assign({}, extra || {}, pendShow); pendShow = null; return o; }
    function cond(e) {
      const rec = new Map();
      const v = asBool(ev(e, rec));
      if (v) stats.condT++; else stats.condF++;
      return { v: v, show: show(e, rec) };
    }
    function execBlock(b, newScope) {
      if (newScope !== false) frame().scopes.push(new Map());
      try { b.body.forEach(exec); }
      finally { if (newScope !== false) frame().scopes.pop(); }
    }
    /** 出錯的那一步：在丟出錯誤的地方就記下來（變數還在） */
    function errStep(x) {
      const s = { kind: 'error', node: -1, line: x.line, c0: null, c1: null, frames: snapFrames(), out: out.length,
        loops: loopStack.map(function (l) { return { line: l.line, iter: l.iter, id: l.id }; }), err: { key: x.key, msg: x.msg, line: x.line } };
      if (pend.pyDiff.length) { s.pyDiff = pend.pyDiff; stats.pyDiffs += pend.pyDiff.length; }
      pend = { pyDiff: [], sc: 0 };
      steps.push(s);
    }
    function exec(s) {
      try { execInner(s); }
      catch (x) { if (x instanceof CTError && !x.rec) { x.rec = true; errStep(x); } throw x; }
    }
    function execInner(s) {
      switch (s.k) {
        case 'block': execBlock(s); return;
        case 'empty': return;
        case 'decl': pendShow = null; s.items.forEach(function (it) { declare(it, s); }); record('decl', s, takeShow()); return;
        case 'assign': { pendShow = null; const r = assign(s); record('assign', s, takeShow({ target: s.target.name, idx: r.idx })); return; }
        case 'expr': { const v = call(s.e); record('callstmt', s, { ret: v }); return; }
        case 'print': {
          let txt = '';
          s.parts.forEach(function (pt) { txt += pt.lit != null ? pt.lit : String(asInt(ev(pt.e))); });
          out += txt;
          if (out.length > LIM.out) throw new CTError('output', null, s.line, s.col);
          record('print', s, { printed: txt });
          return;
        }
        case 'if': {
          const c = cond(s.cond);
          record('if', s, { cond: c.v, show: c.show });
          if (c.v) exec(s.then); else if (s.els) exec(s.els);
          return;
        }
        case 'while': {
          const L = loopRec(s);
          loopStack.push(L);
          try {
            for (;;) {
              const c = cond(s.cond);
              record('while', s, { cond: c.v, show: c.show, iter: c.v ? L.iter + 1 : L.iter });
              if (!c.v) break;
              L.iter++; stats.loops[L.key].iters++;
              try { exec(s.body); } catch (x) { if (x instanceof BreakSig) break; if (!(x instanceof ContinueSig)) throw x; }
            }
          } finally { endLoop(L); }
          return;
        }
        case 'for': {
          frame().scopes.push(new Map());
          const L = loopRec(s);
          try {
            if (s.init) {
              if (s.init.k === 'decl') s.init.items.forEach(function (it) { declare(it, s.init); });
              else if (s.init.k === 'assign') assign(s.init);
              else call(s.init.e);
              record('init', s, { part: 'init', c0: s.init.c0, c1: s.init.c1 });
            }
            loopStack.push(L);
            for (;;) {
              let c = { v: true, show: '' };
              if (s.cond) c = cond(s.cond);
              record('fcond', s, { part: 'cond', cond: c.v, show: c.show, iter: c.v ? L.iter + 1 : L.iter, c0: s.cond ? s.cond.c0 : null, c1: s.cond ? s.cond.c1 : null });
              if (!c.v) break;
              L.iter++; stats.loops[L.key].iters++;
              try { exec(s.body); } catch (x) { if (x instanceof BreakSig) break; if (!(x instanceof ContinueSig)) throw x; }
              if (s.upd) {
                if (s.upd.k === 'assign') { const r = assign(s.upd); record('upd', s, { part: 'upd', c0: s.upd.c0, c1: s.upd.c1, target: s.upd.target.name, idx: r.idx }); }
                else { call(s.upd.e); record('upd', s, { part: 'upd', c0: s.upd.c0, c1: s.upd.c1 }); }
              }
            }
          } finally { endLoop(L); frame().scopes.pop(); }
          return;
        }
        case 'break': if (!loopStack.length) throw new CTError('breakOut', null, s.line, s.col); record('break', s); throw new BreakSig();
        case 'continue': if (!loopStack.length) throw new CTError('breakOut', null, s.line, s.col); record('continue', s); throw new ContinueSig();
        case 'return': {
          const v = s.value ? ev(s.value) : undefined;
          record('return', s, { ret: v });
          throw new ReturnSig(v);
        }
      }
    }
    let loopActs = 0;
    function loopRec(s) {
      const key = String(s.line);
      if (!stats.loops[key]) stats.loops[key] = { line: s.line, kind: s.k, acts: 0, iters: 0, zero: 0, maxIter: 0 };
      stats.loops[key].acts++;
      loopActs++;
      return { id: loopActs, line: s.line, iter: 0, key: key };
    }
    function endLoop(L) {
      if (loopStack[loopStack.length - 1] === L) loopStack.pop();
      const r = stats.loops[L.key];
      if (L.iter === 0) r.zero++;
      r.maxIter = Math.max(r.maxIter, L.iter);
    }

    // ---------- 開始 ----------
    let error = null;
    frames.push({ fn: 'main', args: [], scopes: [new Map()] });
    try {
      execBlock(prog.main, false);
    } catch (x) {
      if (x instanceof ReturnSig) { /* main 的 return：程式結束 */ }
      else if (x instanceof CTError) {
        if (!x.rec) errStep(x);
        error = { key: x.key, msg: x.msg, line: x.line };
      } else if (x instanceof BreakSig || x instanceof ContinueSig) {
        error = { key: 'breakOut', msg: fmtMsg('breakOut'), line: 0 };
      } else throw x;
    }
    const fin = frames[0];
    const vars = {};
    if (fin) fin.scopes[0].forEach(function (c, name) { vars[name] = c.arr ? c.arr.slice() : c.v; });
    return { steps: steps, output: out, error: error, ok: !error, stats: stats, vars: vars };
  }

  // ======================= 條件代入數值的樣子 =======================
  const SYM = { '&&': '&&', '||': '||', '==': '==', '!=': '!=', '<': '<', '<=': '<=', '>': '>', '>=': '>=', '+': '+', '-': '−', '*': '*', '/': '/', '%': '%' };
  function valStr(v) { return typeof v === 'boolean' ? (v ? 'true' : 'false') : v < 0 ? '−' + (-v) : String(v); }
  function showExpr(e, rec) {
    if (rec.get(e.id) === 'skip') return '…';
    let s;
    switch (e.k) {
      case 'num': case 'bool': case 'var': case 'idx': case 'call': s = rec.has(e.id) ? valStr(rec.get(e.id)) : '…'; break;
      case 'un': s = (e.op === '-' ? '−' : e.op) + showExpr(e.e, rec); break;
      case 'bin': s = showExpr(e.l, rec) + ' ' + SYM[e.op] + ' ' + showExpr(e.r, rec); break;
      default: s = '?';
    }
    return e.paren ? '(' + s + ')' : s;
  }

  // ======================= 轉成 Python（同一棵語法樹） =======================
  const PYP = { or: 1, and: 2, not: 3, cmp: 4, add: 5, mul: 6, neg: 7, atom: 8 };
  function pyOp(op) {
    return { '||': ['or', PYP.or], '&&': ['and', PYP.and], '==': ['==', PYP.cmp], '!=': ['!=', PYP.cmp], '<': ['<', PYP.cmp], '<=': ['<=', PYP.cmp], '>': ['>', PYP.cmp], '>=': ['>=', PYP.cmp],
      '+': ['+', PYP.add], '-': ['-', PYP.add], '*': ['*', PYP.mul], '/': ['//', PYP.mul], '%': ['%', PYP.mul] }[op];
  }
  /** 運算式的型別（'int' 或 'bool'），用來決定 Python 要不要補 int()、bool() */
  function typeOf(e, env, prog) {
    switch (e.k) {
      case 'bool': return 'bool';
      case 'num': return 'int';
      case 'var': return env[e.name] || 'int';
      case 'idx': return 'int';
      case 'call': { const f = prog.funcs[e.name]; return f && f.ret === 'bool' ? 'bool' : 'int'; }
      case 'un': return e.op === '!' ? 'bool' : 'int';
      case 'bin': return BIN[e.op] <= 4 ? 'bool' : 'int';
    }
    return 'int';
  }
  function toPython(prog, opts) {
    opts = opts || {};
    const lines = [];
    const map = {};                // 語法樹節點代號 → Python 的行號（陣列，1 起算）
    const byLine = {};             // C 的行號 → Python 的行號（給函式呼叫這類「運算式裡的步驟」用）
    const parts = {};              // for 節點 → { init, cond, upd } 各在 Python 的哪幾行
    const IND = '    ';
    let env = {};
    function emit(depth, text, nodeId) {
      lines.push(IND.repeat(depth) + text);
      if (nodeId != null) {
        (map[nodeId] = map[nodeId] || []).push(lines.length);
        const n = prog.nodes[nodeId];
        if (n && n.line) { const b = byLine[n.line] = byLine[n.line] || []; if (b.indexOf(lines.length) < 0) b.push(lines.length); }
      }
      return lines.length;
    }
    /** 原始碼有括號的地方，Python 也照樣加（比較好對照；括號不改變意思） */
    function px(e) {
      const r = px0(e);
      return e.paren && r.p < PYP.atom ? { s: '(' + r.s + ')', p: PYP.atom } : r;
    }
    function px0(e) {
      switch (e.k) {
        case 'num': return { s: e.v < 0 ? '-' + (-e.v) : String(e.v), p: e.v < 0 ? PYP.neg : PYP.atom };
        case 'bool': return { s: e.v ? 'True' : 'False', p: PYP.atom };
        case 'var': return { s: e.name, p: PYP.atom };
        case 'idx': return { s: e.name + '[' + px(e.index).s + ']', p: PYP.atom };
        case 'call': return { s: e.name + '(' + e.args.map(function (a) { return px(a).s; }).join(', ') + ')', p: PYP.atom };
        case 'un': {
          if (e.op === '!') { const c = px(e.e); return { s: 'not ' + wrap(c, PYP.not), p: PYP.not }; }
          const c = px(e.e);
          const inner = typeOf(e.e, env, prog) === 'bool' ? 'int(' + c.s + ')' : wrap(c, PYP.neg + 0.5);
          return { s: (e.op === '-' ? '-' : '+') + inner, p: PYP.neg };
        }
        case 'bin': {
          const o = pyOp(e.op);
          const lt = typeOf(e.l, env, prog), rt = typeOf(e.r, env, prog);
          let L = px(e.l), R = px(e.r);
          const arith = BIN[e.op] >= 5;
          if (arith && lt === 'bool') L = { s: 'int(' + L.s + ')', p: PYP.atom };
          if (arith && rt === 'bool') R = { s: 'int(' + R.s + ')', p: PYP.atom };
          // 比較放在比較裡：Python 會變成連鎖比較，一定要加括號
          const lp = o[1] === PYP.cmp && L.p === PYP.cmp ? 99 : o[1];
          const rp = o[1] === PYP.cmp && R.p === PYP.cmp ? 99 : o[1] + 0.5;
          return { s: wrap(L, lp) + ' ' + o[0] + ' ' + wrap(R, rp), p: o[1] };
        }
      }
      return { s: '?', p: PYP.atom };
    }
    function wrap(c, need) { return c.p < need ? '(' + c.s + ')' : c.s; }
    function valueFor(type, e) {
      const t = typeOf(e, env, prog), s = px(e).s;
      if (type === 'int' && t === 'bool') return 'int(' + s + ')';
      if (type === 'bool' && t === 'int') return 'bool(' + s + ')';
      return s;
    }
    function pyStr(s) { return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\t/g, '\\t') + '"'; }
    function printLine(s) {
      const parts = s.parts.slice();
      let nl = false;
      const lastP = parts[parts.length - 1];
      if (lastP && lastP.lit != null && /\n$/.test(lastP.lit)) {
        nl = true;
        const rest = lastP.lit.slice(0, -1);
        if (rest) parts[parts.length - 1] = { lit: rest }; else parts.pop();
      }
      const exprStr = function (pt) { return typeOf(pt.e, env, prog) === 'bool' ? 'int(' + px(pt.e).s + ')' : px(pt.e).s; };
      if (!parts.length) return nl ? 'print()' : 'print("", end="")';
      if (parts.length === 1 && parts[0].e && nl) return 'print(' + exprStr(parts[0]) + ')';
      if (parts.length === 1 && parts[0].lit != null) return 'print(' + pyStr(parts[0].lit) + (nl ? '' : ', end=""') + ')';
      if (parts.length === 2 && parts[0].e && parts[1].lit != null && !nl) return 'print(' + exprStr(parts[0]) + ', end=' + pyStr(parts[1].lit) + ')';
      let f = '';
      parts.forEach(function (pt) { f += pt.lit != null ? pt.lit.replace(/\{/g, '{{').replace(/\}/g, '}}') : '{' + exprStr(pt) + '}'; });
      return 'print(f' + pyStr(f) + (nl ? '' : ', end=""') + ')';
    }
    /** for 能不能寫成 for i in range(…)：初始化宣告一個 int、條件是 i 和固定的界限比、更新是加減一個正的常數、本體不改 i 與界限 */
    function rangeForm(s) {
      if (!s.init || s.init.k !== 'decl' || s.init.items.length !== 1) return null;
      const it = s.init.items[0];
      if (it.size != null || it.type !== 'int' || !it.init || !s.cond || s.cond.k !== 'bin' || !s.upd || s.upd.k !== 'assign') return null;
      const c = s.cond, u = s.upd, v = it.name;
      if (c.l.k !== 'var' || c.l.name !== v || ['<', '<=', '>', '>='].indexOf(c.op) < 0) return null;
      if (u.target.name !== v || u.target.index) return null;
      let stepV;
      if (u.inc) stepV = u.op === '+=' ? 1 : -1;
      else if ((u.op === '+=' || u.op === '-=') && u.value.k === 'num' && u.value.v > 0) stepV = u.op === '+=' ? u.value.v : -u.value.v;
      else return null;
      if ((c.op === '<' || c.op === '<=') !== (stepV > 0)) return null;
      const used = {};
      let bad = false;
      walkExpr(c.r, function (e) { if (e.k === 'var') used[e.name] = true; if (e.k === 'call' || e.k === 'idx') bad = true; });
      if (bad || used[v]) return null;
      let touched = false;
      walkStmt(s.body, function (x) {
        if (x.k === 'assign' && (x.target.name === v || used[x.target.name])) touched = true;
        if (x.k === 'decl' && x.items.some(function (i2) { return i2.name === v || used[i2.name]; })) touched = true;
      });
      if (touched) return null;
      const start = px(it.init).s;
      let stop;
      const R = px(c.r);
      if (c.op === '<' || c.op === '>') stop = R.s;
      else if (c.r.k === 'num') stop = String(c.r.v + (c.op === '<=' ? 1 : -1));
      else stop = wrap(R, PYP.add + 0.5) + (c.op === '<=' ? ' + 1' : ' - 1');
      let args;
      if (stepV === 1 && start === '0') args = stop;
      else if (stepV === 1) args = start + ', ' + stop;
      else args = start + ', ' + stop + ', ' + stepV;
      return 'for ' + v + ' in range(' + args + '):';
    }
    function emitBody(depth, b, loop) {
      const n0 = lines.length;
      if (b.k === 'block') b.body.forEach(function (x) { st(depth, x, loop); });
      else st(depth, b, loop);
      if (lines.length === n0) emit(depth, 'pass');
    }
    function simpleLine(x) {
      if (x.k === 'expr') return px(x.e).s;
      if (x.k === 'decl') return null;
      const t = x.target.name + (x.target.index ? '[' + px(x.target.index).s + ']' : '');
      if (x.inc) return t + (x.op === '+=' ? ' += 1' : ' -= 1');
      const ty = x.target.index ? 'int' : (env[x.target.name] || 'int');
      if (x.op === '=') return t + ' = ' + valueFor(ty, x.value);
      return t + ' ' + (x.op === '/=' ? '//=' : x.op) + ' ' + valueFor('int', x.value);
    }
    function declLines(depth, d, nodeId) {
      d.items.forEach(function (it) {
        env[it.name] = it.type;
        let rhs;
        if (it.size != null) {
          if (!it.init) rhs = '[None] * ' + it.size;
          else if (it.init.length === it.size) rhs = '[' + it.init.map(function (x) { return px(x).s; }).join(', ') + ']';
          else if (it.init.length === 1 && it.init[0].k === 'num' && it.init[0].v === 0) rhs = '[0] * ' + it.size;
          else rhs = '[' + it.init.map(function (x) { return px(x).s; }).join(', ') + '] + [0] * ' + (it.size - it.init.length);
        } else rhs = it.init ? valueFor(it.type, it.init) : 'None';
        emit(depth, it.name + ' = ' + rhs, nodeId);
      });
    }
    function st(depth, s, loop) {
      switch (s.k) {
        case 'block': s.body.forEach(function (x) { st(depth, x, loop); }); return;
        case 'empty': return;
        case 'decl': declLines(depth, s, s.id); return;
        case 'assign': case 'expr': emit(depth, simpleLine(s), s.id); return;
        case 'print': emit(depth, printLine(s), s.id); return;
        case 'if': {
          let cur = s, kw = 'if';
          for (;;) {
            emit(depth, kw + ' ' + px(cur.cond).s + ':', cur.id);
            emitBody(depth + 1, cur.then, loop);
            if (!cur.els) break;
            if (cur.els.k === 'if') { cur = cur.els; kw = 'elif'; continue; }
            emit(depth, 'else:');
            emitBody(depth + 1, cur.els, loop);
            break;
          }
          return;
        }
        case 'while':
          emit(depth, 'while ' + px(s.cond).s + ':', s.id);
          emitBody(depth + 1, s.body, null);
          return;
        case 'for': {
          const rf = rangeForm(s);
          const pm = parts[s.id] = { init: [], cond: [], upd: [], range: !!rf };
          if (rf) {
            env[s.init.items[0].name] = 'int';
            const ln = emit(depth, rf, s.id);
            pm.init.push(ln); pm.cond.push(ln); pm.upd.push(ln);
            emitBody(depth + 1, s.body, null);
            return;
          }
          if (s.init) {
            const n0 = lines.length;
            if (s.init.k === 'decl') declLines(depth, s.init, s.id); else emit(depth, simpleLine(s.init), s.id);
            for (let q = n0 + 1; q <= lines.length; q++) pm.init.push(q);
          }
          pm.cond.push(emit(depth, 'while ' + (s.cond ? px(s.cond).s : 'True') + ':', s.id));
          emitBody(depth + 1, s.body, s);
          if (s.upd) pm.upd.push(emit(depth + 1, simpleLine(s.upd), s.id));
          return;
        }
        case 'break': emit(depth, 'break', s.id); return;
        case 'continue':
          if (loop && loop.upd) emit(depth, simpleLine(loop.upd), s.id);   // while 版的 for：continue 前要先做更新
          emit(depth, 'continue', s.id);
          return;
        case 'return': emit(depth, s.value ? 'return ' + px(s.value).s : 'return', s.id); return;
      }
    }
    // 註解（第一行）：C 和 Python 的整數除法不同
    let hasDiv = false;
    prog.nodes.forEach(function (n) { if ((n.k === 'bin' && (n.op === '/' || n.op === '%')) || (n.k === 'assign' && (n.op === '/=' || n.op === '%='))) hasDiv = true; });
    if (hasDiv && opts.note) emit(0, '# ' + opts.note);
    prog.order.forEach(function (name) {
      const f = prog.funcs[name];
      env = {};
      f.params.forEach(function (pa) { env[pa.name] = pa.type; });
      emit(0, 'def ' + f.name + '(' + f.params.map(function (pa) { return pa.name; }).join(', ') + '):', f.id);
      emitBody(1, f.body, null);
      map[f.body.id] = map[f.body.id] || [];   // 函式結束（沒有 return 的 void 函式）
      emit(0, '');
      emit(0, '');
    });
    env = {};
    const body = prog.main.body.slice();
    if (prog.hasMain && body.length && body[body.length - 1].k === 'return') {
      const r = body.pop();
      map[r.id] = [];
    }
    body.forEach(function (x) { st(0, x, null); });
    if (prog.hasMain) map[prog.mainFunc.id] = [];
    return { lines: lines, map: map, byLine: byLine, parts: parts };
  }
  function walkStmt(s, f) {
    if (!s) return;
    f(s);
    if (s.k === 'block') s.body.forEach(function (x) { walkStmt(x, f); });
    else if (s.k === 'if') { walkStmt(s.then, f); walkStmt(s.els, f); }
    else if (s.k === 'while') walkStmt(s.body, f);
    else if (s.k === 'for') { walkStmt(s.init, f); walkStmt(s.upd, f); walkStmt(s.body, f); }
  }

  // ======================= 內建的小程式（自己寫的） =======================
  // 參數 $名字：學生可以改的數字（範圍與預設值在 params）。q：先猜再看的問題（'output' 輸出、或 { var } 某個變數最後的值）。
  const PROGRAMS = [
    { id: 'swap', group: 'seq', zh: '交換兩個變數', en: 'Swapping two variables',
      dzh: '用第三個變數 t 暫存，把 a 和 b 的值對調。', den: 'Use a third variable t as temporary storage to swap the values of a and b.',
      src: 'int a = $a;\nint b = $b;\nint t = a;\na = b;\nb = t;\nprintf("a = %d, b = %d\\n", a, b);',
      params: [{ name: 'a', zh: 'a 的初值', en: 'starting a', min: -99, max: 99, def: 3 }, { name: 'b', zh: 'b 的初值', en: 'starting b', min: -99, max: 99, def: 8 }],
      q: 'output' },
    { id: 'divmod', group: 'seq', zh: '整數除法與餘數', en: 'Integer division and remainder',
      dzh: 'int 除以 int 還是 int：小數部分直接丟掉（向 0 取整），% 是餘數。試試負數。', den: 'An int divided by an int is an int: the fraction is thrown away (rounding towards zero), and % is the remainder. Try negative numbers.',
      src: 'int a = $a;\nint b = $b;\nint q = a / b;\nint r = a % b;\nprintf("%d %d\\n", q, r);\nprintf("%d\\n", q * b + r);',
      params: [{ name: 'a', zh: '被除數 a', en: 'dividend a', min: -99, max: 99, def: 17 }, { name: 'b', zh: '除數 b', en: 'divisor b', min: -9, max: 9, def: 5 }],
      q: 'output' },
    { id: 'max3', group: 'sel', zh: '三個數取最大', en: 'The largest of three',
      dzh: '先假設 a 最大，再讓 b、c 各挑戰一次。', den: 'Assume a is the largest, then let b and c each challenge it once.',
      src: 'int a = $a;\nint b = $b;\nint c = $c;\nint m = a;\nif (b > m) {\n    m = b;\n}\nif (c > m) {\n    m = c;\n}\nprintf("%d\\n", m);',
      params: [{ name: 'a', zh: 'a', en: 'a', min: -99, max: 99, def: 4 }, { name: 'b', zh: 'b', en: 'b', min: -99, max: 99, def: 9 }, { name: 'c', zh: 'c', en: 'c', min: -99, max: 99, def: 7 }],
      q: 'output' },
    { id: 'grade', group: 'sel', zh: '成績等第（else if）', en: 'Letter grades (else if)',
      dzh: '從上往下一個一個判斷，第一個成立的就執行，後面的都跳過。', den: 'The conditions are checked from the top; the first one that holds runs and the rest are skipped.',
      src: 'int score = $s;\nif (score >= 90) {\n    printf("A\\n");\n} else if (score >= 80) {\n    printf("B\\n");\n} else if (score >= 60) {\n    printf("C\\n");\n} else {\n    printf("F\\n");\n}',
      params: [{ name: 's', zh: '分數 score', en: 'score', min: 0, max: 100, def: 75 }],
      q: 'output' },
    { id: 'leap', group: 'sel', zh: '閏年（&& 與 ||）', en: 'Leap years (&& and ||)',
      dzh: '公曆的規則：能被 4 整除而且不能被 100 整除，或者能被 400 整除。看看 && 什麼時候不必算右邊。', den: 'The Gregorian rule: divisible by 4 but not by 100, or divisible by 400. Watch when && does not need its right side.',
      src: 'int y = $y;\nbool leap = (y % 4 == 0 && y % 100 != 0) || y % 400 == 0;\nif (leap) {\n    printf("%d is a leap year\\n", y);\n} else {\n    printf("%d is not a leap year\\n", y);\n}',
      params: [{ name: 'y', zh: '年份 y', en: 'year y', min: 1800, max: 2100, def: 2026 }],
      q: { v: 'leap' } },
    { id: 'sum', group: 'loop', zh: '1 加到 n（while）', en: 'Adding 1 to n (while)',
      dzh: 'i 從 1 數到 n，每一圈把 i 加進 s。', den: 'i counts from 1 to n, and each time round the loop i is added to s.',
      src: 'int n = $n;\nint i = 1;\nint s = 0;\nwhile (i <= n) {\n    s = s + i;\n    i++;\n}\nprintf("%d\\n", s);',
      params: [{ name: 'n', zh: '上限 n', en: 'limit n', min: 0, max: 1000, def: 10 }],
      q: 'output' },
    { id: 'offbyone', group: 'loop', zh: '差一圈：< 與 <=', en: 'Off by one: < and <=',
      dzh: '兩個 for 迴圈只差一個等號。各跑幾圈？', den: 'The two for loops differ by a single equals sign. How many times does each run?',
      src: 'int n = $n;\nint a = 0;\nint b = 0;\nfor (int i = 0; i < n; i++) {\n    a++;\n}\nfor (int i = 0; i <= n; i++) {\n    b++;\n}\nprintf("%d %d\\n", a, b);',
      params: [{ name: 'n', zh: 'n', en: 'n', min: 0, max: 20, def: 4 }],
      q: 'output' },
    { id: 'countdown', group: 'loop', zh: '倒數：每次減 k（for）', en: 'Counting down by k (for)',
      dzh: 'for 的三段：先做第一段一次，然後「判斷條件 → 本體 → 第三段」一直重複。', den: 'The three parts of for: the first part runs once, then “test the condition → body → third part” repeats.',
      src: 'int start = $s;\nint k = $k;\nfor (int i = start; i > 0; i -= k) {\n    printf("%d ", i);\n}\nprintf("\\n");',
      params: [{ name: 's', zh: '起點 start', en: 'start', min: 0, max: 50, def: 10 }, { name: 'k', zh: '每次減 k', en: 'step k', min: 1, max: 9, def: 3 }],
      q: 'output' },
    { id: 'factorial', group: 'loop', zh: '階乘', en: 'Factorial',
      dzh: 'f = 1 × 2 × 3 × … × n。int 最大只到 2147483647。', den: 'f = 1 × 2 × 3 × … × n. An int can be at most 2147483647.',
      src: 'int n = $n;\nint f = 1;\nint i = 1;\nwhile (i <= n) {\n    f = f * i;\n    i++;\n}\nprintf("%d\\n", f);',
      params: [{ name: 'n', zh: 'n', en: 'n', min: 0, max: 20, def: 5 }],
      q: 'output' },
    { id: 'power', group: 'loop', zh: '次方（連乘）', en: 'Powers (repeated multiplication)',
      dzh: 'p 從 1 開始，乘 e 次 b。', den: 'p starts at 1 and is multiplied by b, e times.',
      src: 'int b = $b;\nint e = $e;\nint p = 1;\nfor (int i = 0; i < e; i++) {\n    p = p * b;\n}\nprintf("%d\\n", p);',
      params: [{ name: 'b', zh: '底數 b', en: 'base b', min: -10, max: 10, def: 2 }, { name: 'e', zh: '指數 e', en: 'exponent e', min: 0, max: 40, def: 10 }],
      q: 'output' },
    { id: 'digits', group: 'loop', zh: '拆出每一位數（% 10 與 / 10）', en: 'Taking a number apart (% 10 and / 10)',
      dzh: 'n % 10 是個位數，n / 10 把個位數去掉。c 數有幾位，s 是各位數字的和。', den: 'n % 10 is the last digit and n / 10 removes it. c counts the digits and s adds them up.',
      src: 'int n = $n;\nint c = 0;\nint s = 0;\nwhile (n > 0) {\n    s = s + n % 10;\n    n = n / 10;\n    c++;\n}\nprintf("%d %d\\n", c, s);',
      params: [{ name: 'n', zh: 'n', en: 'n', min: -99999, max: 99999, def: 2026 }],
      q: 'output' },
    { id: 'reverse', group: 'loop', zh: '把數字倒過來', en: 'Reversing the digits',
      dzh: '每一圈把 n 的個位數接到 r 的後面。條件是 n != 0。', den: 'Each time round, the last digit of n is attached to the end of r. The condition is n != 0.',
      src: 'int n = $n;\nint r = 0;\nwhile (n != 0) {\n    r = r * 10 + n % 10;\n    n = n / 10;\n}\nprintf("%d\\n", r);',
      params: [{ name: 'n', zh: 'n', en: 'n', min: -99999, max: 99999, def: 1234 }],
      q: 'output' },
    { id: 'gcd', group: 'loop', zh: '輾轉相除法', en: 'Euclid’s algorithm',
      dzh: '一直用「除數、餘數」取代「被除數、除數」，直到餘數是 0。最後的 a 就是最大公因數。', den: 'Keep replacing (dividend, divisor) by (divisor, remainder) until the remainder is 0. The final a is the greatest common divisor.',
      src: 'int a = $a;\nint b = $b;\nwhile (b != 0) {\n    int r = a % b;\n    a = b;\n    b = r;\n}\nprintf("%d\\n", a);',
      params: [{ name: 'a', zh: 'a', en: 'a', min: 0, max: 1000, def: 84 }, { name: 'b', zh: 'b', en: 'b', min: 0, max: 1000, def: 36 }],
      q: 'output' },
    { id: 'collatz', group: 'loop', zh: '冰雹數（3n + 1）', en: 'Hailstone numbers (3n + 1)',
      dzh: '偶數就除以 2，奇數就乘 3 加 1，數幾步才到 1。', den: 'Halve an even number; multiply an odd one by 3 and add 1. Count the steps until it reaches 1.',
      src: 'int n = $n;\nint steps = 0;\nwhile (n != 1) {\n    if (n % 2 == 0) {\n        n = n / 2;\n    } else {\n        n = 3 * n + 1;\n    }\n    steps++;\n}\nprintf("%d\\n", steps);',
      params: [{ name: 'n', zh: 'n', en: 'n', min: 0, max: 1000, def: 6 }],
      q: 'output' },
    { id: 'fizz', group: 'mix', zh: 'Fizz Buzz', en: 'Fizz Buzz',
      dzh: '3 的倍數說 Fizz、5 的倍數說 Buzz、兩個都是說 FizzBuzz。為什麼 15 要先判斷？', den: 'Say Fizz for multiples of 3, Buzz for multiples of 5 and FizzBuzz for both. Why must 15 be tested first?',
      src: 'int n = $n;\nfor (int i = 1; i <= n; i++) {\n    if (i % 15 == 0) {\n        printf("FizzBuzz\\n");\n    } else if (i % 3 == 0) {\n        printf("Fizz\\n");\n    } else if (i % 5 == 0) {\n        printf("Buzz\\n");\n    } else {\n        printf("%d\\n", i);\n    }\n}',
      params: [{ name: 'n', zh: 'n', en: 'n', min: 1, max: 30, def: 6 }],
      q: 'output' },
    { id: 'skip', group: 'mix', zh: '跳過倍數（continue）', en: 'Skipping multiples (continue)',
      dzh: 'continue 跳過這一圈剩下的部分，直接去做 for 的第三段 i++。', den: 'continue skips the rest of this time round and goes straight to the third part of the for, i++.',
      src: 'int n = $n;\nint k = $k;\nint s = 0;\nfor (int i = 1; i <= n; i++) {\n    if (i % k == 0) {\n        continue;\n    }\n    s += i;\n}\nprintf("%d\\n", s);',
      params: [{ name: 'n', zh: 'n', en: 'n', min: 0, max: 100, def: 10 }, { name: 'k', zh: '跳過 k 的倍數', en: 'skip multiples of k', min: 1, max: 9, def: 3 }],
      q: 'output' },
    { id: 'find', group: 'mix', zh: '找第一個（break）', en: 'Finding the first one (break)',
      dzh: '找到就用 break 離開迴圈；找不到時 pos 留在 −1。', den: 'break leaves the loop as soon as x is found; if it is never found, pos stays −1.',
      src: 'int a[8] = {4, 7, 1, 9, 3, 9, 2, 6};\nint x = $x;\nint pos = -1;\nfor (int i = 0; i < 8; i++) {\n    if (a[i] == x) {\n        pos = i;\n        break;\n    }\n}\nprintf("%d\\n", pos);',
      params: [{ name: 'x', zh: '要找的 x', en: 'x to find', min: 0, max: 10, def: 3 }],
      q: 'output' },
    { id: 'guard', group: 'mix', zh: '短路求值', en: 'Short-circuit evaluation',
      dzh: '&& 的左邊不成立時，右邊根本不算。陣列只有 5 格（索引 0 到 4）。', den: 'If the left side of && is false, the right side is not evaluated at all. The array has only 5 cells (indices 0 to 4).',
      src: 'int a[5] = {3, 8, 0, 5, 2};\nint n = $n;\nint t = $t;\nint i = 0;\nwhile (i < n && a[i] != t) {\n    i++;\n}\nprintf("%d\\n", i);',
      params: [{ name: 'n', zh: '最多看 n 格', en: 'look at most n cells', min: 0, max: 6, def: 5 }, { name: 't', zh: '要找的 t', en: 't to find', min: 0, max: 9, def: 0 }],
      q: 'output' },
    { id: 'triangle', group: 'nest', zh: '巢狀迴圈：星號三角形', en: 'Nested loops: a triangle of stars',
      dzh: '外圈每跑一圈，內圈從頭跑一次；c 數 printf("*") 一共做了幾次。', den: 'Each time the outer loop goes round, the inner loop runs from the start; c counts how many times printf("*") runs.',
      src: 'int n = $n;\nint c = 0;\nfor (int i = 1; i <= n; i++) {\n    for (int j = 1; j <= i; j++) {\n        printf("*");\n        c++;\n    }\n    printf("\\n");\n}\nprintf("%d\\n", c);',
      params: [{ name: 'n', zh: '列數 n', en: 'rows n', min: 0, max: 8, def: 4 }],
      q: { v: 'c' } },
    { id: 'flip', group: 'nest', zh: '陣列反轉', en: 'Reversing an array',
      dzh: '前 n 格頭尾兩兩交換，只要換 n / 2 次。', den: 'Swap the first n cells in pairs from both ends; only n / 2 swaps are needed.',
      src: 'int a[6] = {1, 2, 3, 4, 5, 6};\nint n = $n;\nfor (int i = 0; i < n / 2; i++) {\n    int t = a[i];\n    a[i] = a[n - 1 - i];\n    a[n - 1 - i] = t;\n}\nfor (int i = 0; i < 6; i++) {\n    printf("%d ", a[i]);\n}\nprintf("\\n");',
      params: [{ name: 'n', zh: '反轉前 n 格', en: 'reverse the first n cells', min: 0, max: 6, def: 6 }],
      q: 'output' },
    { id: 'square', group: 'func', zh: '函式：平方和', en: 'Functions: sum of squares',
      dzh: '呼叫 sq 時，x 拿到引數的值；return 把結果帶回呼叫的地方。', den: 'When sq is called, x receives the value of the argument; return brings the result back to where it was called.',
      src: 'int sq(int x) {\n    return x * x;\n}\n\nint main() {\n    int a = $a;\n    int s = sq(a) + sq(a + 1);\n    printf("%d\\n", s);\n    return 0;\n}',
      params: [{ name: 'a', zh: 'a', en: 'a', min: -50, max: 50, def: 2 }],
      q: 'output' },
    { id: 'echo', group: 'func', zh: '遞迴：去程與回程', en: 'Recursion: down and back up',
      dzh: 'f 在呼叫自己之前印一次 n、回來之後再印一次 n。', den: 'f prints n once before it calls itself and once more after the call returns.',
      src: 'void f(int n) {\n    if (n == 0) {\n        return;\n    }\n    printf("%d ", n);\n    f(n - 1);\n    printf("%d ", n);\n}\n\nint main() {\n    f($n);\n    printf("\\n");\n    return 0;\n}',
      params: [{ name: 'n', zh: 'n', en: 'n', min: 0, max: 6, def: 3 }],
      q: 'output' }
  ];
  const GROUPS = [
    { id: 'seq', zh: '循序', en: 'Sequence' },
    { id: 'sel', zh: '選擇', en: 'Selection' },
    { id: 'loop', zh: '重複（迴圈）', en: 'Repetition (loops)' },
    { id: 'mix', zh: '迴圈裡的選擇', en: 'Branches inside loops' },
    { id: 'nest', zh: '巢狀迴圈與陣列', en: 'Nested loops and arrays' },
    { id: 'func', zh: '函式', en: 'Functions' }
  ];
  function program(id) { return PROGRAMS.find(function (p) { return p.id === id; }) || null; }
  function defaults(p) { const o = {}; p.params.forEach(function (pa) { o[pa.name] = pa.def; }); return o; }
  /** 一支程式＋一組參數：解析、執行、轉 Python（頁面與任務證明共用） */
  function build(id, params, opts) {
    const p = program(id);
    const pr = Object.assign(defaults(p), params || {});
    const f = fill(p.src, pr);
    const prog = parse(f.src, f.spans);
    const tr = run(prog, opts);
    return { def: p, params: pr, src: f.src, spans: f.spans, prog: prog, trace: tr };
  }
  function configKey(id, params) { const p = program(id); return id + ':' + p.params.map(function (pa) { return params[pa.name]; }).join(','); }

  // ======================= 先猜再看 =======================
  function normOut(s) {
    return String(s == null ? '' : s).normalize('NFKC').replace(/[−–—]/g, '-').replace(/\s*([=,:])\s*/g, '$1').trim().split(/\s+/).join(' ');
  }
  /** 這支程式的問題的正確答案（文字）；程式出錯時 null */
  function answerOf(p, tr) {
    if (!tr.ok) return null;
    if (p.q === 'output') return tr.output;
    const v = tr.vars[p.q.v];
    return typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v);
  }
  function checkGuess(p, tr, guess) {
    const ans = answerOf(p, tr);
    if (ans == null) return null;
    const g = normOut(guess);
    if (!g) return false;
    if (p.q === 'output') return g === normOut(ans);
    const v = tr.vars[p.q.v];
    if (typeof v === 'boolean') {
      const yes = ['true', '1', '真', '是', '成立', 'yes', 'y', 't'], no = ['false', '0', '假', '否', '不成立', 'no', 'n', 'f'];
      const s = g.toLowerCase();
      return v ? yes.indexOf(s) >= 0 : no.indexOf(s) >= 0;
    }
    if (!/^[+-]?\d+$/.test(g)) return false;
    return Number(g) === v;
  }

  // ======================= 任務事件（頁面與任務證明共用同一套資料） =======================
  function finishEvent(b) {
    const tr = b.trace, st = tr.stats;
    const loops = Object.keys(st.loops).map(function (k) { const l = st.loops[k]; return { line: l.line, acts: l.acts, iters: l.iters, zero: l.zero, maxIter: l.maxIter }; });
    const scal = {};
    Object.keys(tr.vars).forEach(function (k) { if (!Array.isArray(tr.vars[k])) scal[k] = tr.vars[k]; });
    return {
      prog: b.def.id, params: Object.assign({}, b.params), ok: tr.ok, error: tr.error ? tr.error.key : null,
      output: tr.output, steps: tr.steps.length, loops: loops, zeroLoop: loops.some(function (l) { return l.zero > 0; }),
      pyDiffs: st.pyDiffs, sc: st.sc, maxDepth: st.maxDepth, calls: st.calls, condT: st.condT, condF: st.condF,
      peaks: Object.assign({}, st.peaks), vars: scal
    };
  }
  function guessEvent(b, guess, fresh) {
    const ok = checkGuess(b.def, b.trace, guess);
    return { prog: b.def.id, params: Object.assign({}, b.params), q: b.def.q === 'output' ? 'output' : 'var', guess: String(guess), correct: ok === true, fresh: !!fresh,
      answer: answerOf(b.def, b.trace), steps: b.trace.steps.length, ok: b.trace.ok };
  }

  function rng(seed) {
    let s = seed >>> 0;
    return function () { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  const api = {
    INT_MIN: INT_MIN, INT_MAX: INT_MAX, LIM: LIM, MSG: MSG, KW: KW,
    fill: fill, tokenize: tokenize, parse: parse, run: run, toPython: toPython, showExpr: showExpr, valStr: valStr,
    cdiv: cdiv, cmod: cmod, pydiv: pydiv, pymod: pymod, fits: fits,
    PROGRAMS: PROGRAMS, GROUPS: GROUPS, program: program, defaults: defaults, build: build, configKey: configKey,
    normOut: normOut, answerOf: answerOf, checkGuess: checkGuess, finishEvent: finishEvent, guessEvent: guessEvent, rng: rng, CTError: CTError
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CodeTraceCore = api;
})(typeof window !== 'undefined' ? window : this);
