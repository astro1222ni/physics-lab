/* code-tracing.js — 「程式追蹤：變數、選擇與迴圈」的畫面與互動（直譯器在 code-tracing-core.js；共用繪圖工具 LabDraw 在 drawkit.js）
 *
 * 核心先把整支程式跑完、記下每一步（steps）；畫面只是照步驟顯示：k = 已經顯示了幾步（0 = 還沒開始）。
 * 「上一步」就是顯示前一筆紀錄，不會重新計算。閃光、飄走的舊值、聲音都只是回饋，不改任何數值。
 * 任務事件只在把程式跑到最後一步（或停在出錯的那一步）時送出一次：'finish'（核心的 finishEvent），
 * 若開始前在「先猜再看」送出過猜測，再送 'guess'（核心的 guessEvent）。見 js/missions/code-tracing.js 開頭的說明。
 */
(function () {
  'use strict';
  const K = window.CodeTraceCore;
  const D = window.LabDraw;
  if (!K || !D) return;
  const FONT = D.FONT;
  const MONO = 'ui-monospace, "SFMono-Regular", Consolas, "Noto Sans Mono", monospace';
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const setSlider = function (el, v) { if (window.LabNum) window.LabNum.clear(el); el.value = String(v); };
  const alpha = D.alpha, shade = D.shade, mix = D.mix;
  const fnt = function (px, weight, fam) { return (weight ? weight + ' ' : '') + px + 'px ' + (fam || FONT); };
  const esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  const vs = function (v) { return v === undefined ? '?' : v === null ? '—' : K.valStr(v); };
  const isEn = function () { return T('zh', 'en') === 'en'; };

  // ======================= 色彩 =======================
  const C = {};
  const CK = ['canvas-bg', 'text', 'muted', 'border', 'accent', 'surface', 'bg',
    'ct-kw', 'ct-ty', 'ct-num', 'ct-fn', 'ct-true', 'ct-false', 'ct-warn', 'ct-bad', 'ct-box', 'ct-arr', 'ct-ptr', 'ct-new', 'ct-frame', 'ct-bar', 'ct-pbd'];
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    CK.forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
  }

  // ======================= 狀態 =======================
  const state = {
    id: 'swap', saved: {}, params: null, b: null, py: null, pyl: null, k: 0, view: 'c',
    playing: false, speed: 3, done: false,
    guess: null, guessFresh: false, guessResult: null,
    seen: new Set(), log: [], runNo: 0,
    flash: null   // { t0, keys: { 'name' 或 'name[3]': 舊值 } }：單步時的閃光與飄走的舊值
  };
  const progSel = $('progSel'), speedEl = $('speed'), guessEl = $('guess');
  const P_EL = [1, 2, 3].map(function (i) { return { box: $('ps' + i), lab: $('pl' + i), out: $('p' + i + 'o'), inp: $('p' + i) }; });

  function steps() { return state.b.trace.steps; }
  function N() { return steps().length; }
  function cur() { return state.k > 0 ? steps()[state.k - 1] : null; }
  function atEnd() { return state.k >= N(); }
  function lineOf(n) { return state.b.src.split('\n')[n - 1] || ''; }
  function nodeText(n) {
    if (!n || n.c1 == null) return null;
    return lineOf(n.line).slice(n.c0, n.c1);
  }

  // ======================= 選單與參數 =======================
  function fillPrograms() {
    const keep = state.id;
    progSel.innerHTML = '';
    K.GROUPS.forEach(function (g) {
      const og = document.createElement('optgroup');
      og.label = T(g.zh, g.en);
      K.PROGRAMS.filter(function (p) { return p.group === g.id; }).forEach(function (p) {
        const o = document.createElement('option');
        o.value = p.id;
        o.textContent = T(p.zh, p.en);
        og.appendChild(o);
      });
      progSel.appendChild(og);
    });
    progSel.value = keep;
  }
  function showParams() {
    const p = K.program(state.id);
    P_EL.forEach(function (e, i) {
      const pa = p.params[i];
      e.box.hidden = !pa;
      if (!pa) return;
      e.lab.textContent = T(pa.zh, pa.en);
      e.inp.min = String(pa.min); e.inp.max = String(pa.max);
      setSlider(e.inp, state.params[pa.name]);
      e.out.textContent = vs(state.params[pa.name]);
      e.inp.setAttribute('aria-valuetext', String(state.params[pa.name]));
    });
    $('progTitle').textContent = T(p.zh, p.en);
    $('progDesc').textContent = T(p.dzh, p.den);
    $('qText').textContent = p.q === 'output' ? T('這支程式會印出什麼？', 'What will this program print?')
      : T('程式跑完時，變數 ' + p.q.v + ' 是多少？', 'When the program ends, what is the value of the variable ' + p.q.v + '?');
  }
  function pick(id) {
    if (!K.program(id)) return;
    stopPlay();
    state.id = id;
    state.params = Object.assign(K.defaults(K.program(id)), state.saved[id] || {});
    progSel.value = id;
    showParams();
    rebuild();
  }
  function setParam(name, v) {
    const p = K.program(state.id);
    const pa = p.params.find(function (x) { return x.name === name; });
    if (!pa) return;
    v = Math.max(pa.min, Math.min(pa.max, Math.round(v)));
    if (state.params[name] === v) return;
    state.params[name] = v;
    state.saved[state.id] = Object.assign({}, state.params);
    rebuild();
  }

  // ======================= 建立（解析＋執行＋轉 Python） =======================
  function rebuild() {
    stopPlay();
    state.b = K.build(state.id, state.params);
    state.py = K.toPython(state.b.prog);
    state.pyl = steps().map(pyLinesOf);
    state.k = 0;
    state.done = false;
    state.guess = null; state.guessResult = null;
    state.flash = null;
    buildCode();
    renderGuess();
    say(T('還沒開始。先在「先猜再看」寫下你的預測，再按「單步」一行一行執行。', 'Not started yet. Write your prediction under “Guess first, then look”, then press “Step” to run it one line at a time.'));
    updateAll();
  }
  function pyLinesOf(st) {
    const py = state.py;
    if (st.kind === 'init' || st.kind === 'fcond' || st.kind === 'upd') {
      const pp = py.parts[st.node];
      if (pp) return pp[st.kind === 'init' ? 'init' : st.kind === 'fcond' ? 'cond' : 'upd'];
    }
    const m = py.map[st.node];
    if (m && m.length) return m;
    return py.byLine[st.line] || [];
  }

  // ======================= 程式碼：語法上色 =======================
  const TYPES = ['int', 'bool', 'void'];
  /** 一行的片段：[{ a, b, cls, param }]，涵蓋整行 */
  function cSegments() {
    const prog = state.b.prog, lines = state.b.src.split('\n');
    const per = lines.map(function () { return []; });
    const toks = prog.tokens;
    toks.forEach(function (t, i) {
      let cls = null;
      if (t.t === 'kw') cls = TYPES.indexOf(t.v) >= 0 ? 'ty' : (t.v === 'true' || t.v === 'false') ? 'lit' : 'kw';
      else if (t.t === 'num') cls = t.param ? 'param' : 'num';
      else if (t.t === 'str') cls = 'str';
      else if (t.t === 'id') { const nx = toks[i + 1]; if (nx && nx.t === 'op' && nx.v === '(' && nx.line === t.line) cls = 'fn'; }
      else if (t.t === 'op') cls = '(){}[];,'.indexOf(t.v) >= 0 && t.v.length === 1 ? null : 'op';
      per[t.line - 1].push({ a: t.col, b: t.col + t.len, cls: cls, param: t.param || null });
    });
    prog.comments.forEach(function (c) { if (per[c.line - 1]) per[c.line - 1].push({ a: c.col, b: c.col + c.len, cls: 'com' }); });
    return lines.map(function (ln, i) { return fillGaps(ln, per[i]); });
  }
  function fillGaps(ln, segs) {
    segs.sort(function (x, y) { return x.a - y.a; });
    const out = [];
    let at = 0;
    segs.forEach(function (s) { if (s.a > at) out.push({ a: at, b: s.a, cls: null }); if (s.a >= at) { out.push(s); at = s.b; } });
    if (at < ln.length) out.push({ a: at, b: ln.length, cls: null });
    return out;
  }
  const PYKW = ['def', 'return', 'if', 'elif', 'else', 'while', 'for', 'in', 'break', 'continue', 'pass', 'and', 'or', 'not'];
  function pySegments(ln) {
    const segs = [];
    const re = /#.*$|f?"(?:[^"\\]|\\.)*"|\b\d+\b|\b[A-Za-z_]\w*\b|\/\/=?|[+\-*%<>=!]=?/g;
    let m;
    while ((m = re.exec(ln))) {
      const w = m[0];
      let cls = null;
      if (w[0] === '#') cls = 'com';
      else if (w[0] === '"' || (w[0] === 'f' && w[1] === '"')) cls = 'str';
      else if (/^\d/.test(w)) cls = 'num';
      else if (/^[A-Za-z_]/.test(w)) {
        if (PYKW.indexOf(w) >= 0) cls = 'kw';
        else if (w === 'True' || w === 'False' || w === 'None') cls = 'lit';
        else if (/^\s*\(/.test(ln.slice(m.index + w.length))) cls = (w === 'print' || w === 'range' || w === 'int' || w === 'bool') ? 'ty' : 'fn';
      } else cls = 'op';
      if (cls) segs.push({ a: m.index, b: m.index + w.length, cls: cls, f: w[0] === 'f' });
    }
    return fillGaps(ln, segs);
  }
  /** 字串裡的 \n、%d、{ } 另外上色 */
  function strHTML(text, f) {
    const re = f ? /\\.|%d|\{\{|\}\}|\{[^}]*\}/g : /\\.|%d/g;
    let out = '', at = 0, m;
    while ((m = re.exec(text))) {
      out += esc(text.slice(at, m.index));
      const w = m[0];
      out += w[0] === '{' && w !== '{{' ? '<span class="esc">{</span><span class="code-in">' + esc(w.slice(1, -1)) + '</span><span class="esc">}</span>'
        : '<span class="esc">' + esc(w) + '</span>';
      at = m.index + w.length;
    }
    return out + esc(text.slice(at));
  }
  /** 一行的 HTML；mark：[c0, c1] 要畫底色的欄位範圍（for 的哪一段） */
  function lineHTML(ln, segs, mark) {
    const cuts = [];
    segs.forEach(function (s) {
      let pts = [s.a, s.b];
      if (mark) [mark[0], mark[1]].forEach(function (c) { if (c > s.a && c < s.b) pts.push(c); });
      pts = pts.sort(function (x, y) { return x - y; });
      for (let i = 0; i + 1 < pts.length; i++) cuts.push({ a: pts[i], b: pts[i + 1], s: s });
    });
    let html = '';
    cuts.forEach(function (c) {
      if (mark && c.a === mark[0]) html += '<mark>';
      const text = ln.slice(c.a, c.b), s = c.s;
      let inner;
      if (s.cls === 'str') inner = strHTML(text, s.f);
      else inner = esc(text);
      if (s.cls === 'param') {
        const whole = c.a === s.a && c.b === s.b;
        html += '<span class="param" data-p="' + esc(s.param) + '"' + (whole ? ' tabindex="0" role="button" aria-label="' + esc(T('改 ', 'Change ') + s.param) + '"' : '') + '>' + inner + '</span>';
      } else html += s.cls ? '<span class="' + s.cls + '">' + inner + '</span>' : inner;
      if (mark && c.b === mark[1]) html += '</mark>';
    });
    return html || ' ';
  }
  const code = { c: null, py: null };
  function buildBox(el, lines, segsOf) {
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'lines';
    const rows = [];
    lines.forEach(function (ln, i) {
      const row = document.createElement('div');
      row.className = 'ln';
      const segs = segsOf(ln, i);
      const base = lineHTML(ln, segs, null);
      row.innerHTML = '<span class="no">' + (i + 1) + '</span><span class="cnt"></span><span class="txt">' + base + '</span>';
      wrap.appendChild(row);
      rows.push({ el: row, cnt: row.children[1], txt: row.children[2], ln: ln, segs: segs, base: base, marked: false, cls: '', n: -1 });
    });
    el.appendChild(wrap);
    return rows;
  }
  function buildCode() {
    const cs = cSegments();
    code.c = buildBox($('codeC'), state.b.src.split('\n'), function (ln, i) { return cs[i]; });
    code.py = buildBox($('codePy'), state.py.lines, function (ln) { return pySegments(ln); });
  }
  function setRow(r, cls, n, mark) {
    if (r.cls !== cls) { r.el.className = 'ln' + (cls ? ' ' + cls : ''); r.cls = cls; }
    if (r.n !== n) { r.cnt.textContent = n ? String(n) : ''; r.n = n; }
    const mk = mark ? mark[0] + ':' + mark[1] : '';
    if (r.marked !== mk) { r.txt.innerHTML = mark ? lineHTML(r.ln, r.segs, mark) : r.base; r.marked = mk; }
  }
  function renderCode() {
    const st = cur(), nx = state.k < N() ? steps()[state.k] : null;
    const cC = {}, cP = {}, pyd = {};
    for (let i = 0; i < state.k; i++) {
      const s = steps()[i];
      if (s.kind !== 'error') {
        cC[s.line] = (cC[s.line] || 0) + 1;
        state.pyl[i].forEach(function (l) { cP[l] = (cP[l] || 0) + 1; });
      }
      if (s.pyDiff) s.pyDiff.forEach(function (d) { pyd[d.line] = true; });
    }
    const err = st && st.kind === 'error';
    const pyCur = st ? state.pyl[state.k - 1] : [], pyNext = nx ? state.pyl[state.k] : [];
    code.c.forEach(function (r, i) {
      const L = i + 1;
      let cls = '';
      if (st && st.line === L) cls = err ? 'err' : 'cur';
      else if (nx && nx.line === L && !err) cls = 'nxt';
      if (pyd[L]) cls += (cls ? ' ' : '') + 'pyd';
      let mark = null;
      if (st && st.line === L && st.part && st.c0 != null && st.c1 != null && st.c1 > st.c0) mark = [st.c0, st.c1];
      setRow(r, cls, cC[L] || 0, mark);
    });
    code.py.forEach(function (r, i) {
      const L = i + 1;
      let cls = '';
      if (pyCur.indexOf(L) >= 0) cls = err ? 'err' : 'cur';
      else if (pyNext.indexOf(L) >= 0 && !err) cls = 'nxt';
      setRow(r, cls, cP[L] || 0, null);
    });
    $('headC').textContent = state.k ? T('第 ' + state.k + '／' + N() + ' 步', 'step ' + state.k + ' / ' + N()) : T('共 ' + N() + ' 步', N() + ' steps');
    $('headPy').textContent = T('由同一棵語法樹轉出', 'printed from the same syntax tree');
    let pd = 0;
    for (let i = 0; i < state.k; i++) if (steps()[i].pyDiff) pd += steps()[i].pyDiff.length;
    $('pyNote').textContent = T('C 的 / 寫成 //；Python 的 // 與 % 向下取整，C 向 0 取整，有負數時可能不同。', 'C’s / is written //. Python’s // and % round down while C rounds towards zero, so they can differ when a number is negative.')
      + (pd ? T('　到目前為止有 ' + pd + ' 次不同（⚠）。', '  So far they differed ' + pd + (pd === 1 ? ' time' : ' times') + ' (⚠).') : '');
    // 目前這一行捲到看得見的地方（程式碼區很寬時左右捲動）
    [code.c, code.py].forEach(function (rows) {
      rows.forEach(function (r) {
        if (r.cls === 'cur' || r.cls === 'err') {
          const box = r.el.closest('.code');
          const mk = r.txt.querySelector('mark');
          if (box && mk && box.scrollWidth > box.clientWidth) {
            const x = mk.offsetLeft;
            if (x < box.scrollLeft || x + mk.offsetWidth > box.scrollLeft + box.clientWidth) box.scrollLeft = Math.max(0, x - 40);
          }
        }
      });
    });
  }
  function setView(v) {
    state.view = v;
    document.querySelectorAll('.seg3 button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.view === v)); });
    $('boxC').hidden = v === 'py';
    $('boxPy').hidden = v === 'c';
    $('codes').classList.toggle('both', v === 'both');
  }

  // ======================= 輸出區 =======================
  function renderOut() {
    const st = cur(), all = state.b.trace.output;
    const len = st ? st.out : 0;
    const el = $('out');
    if (!len) { el.innerHTML = '<span class="none">' + esc(T('（還沒有輸出）', '(no output yet)')) + '</span>'; }
    else {
      const nw = st && st.kind === 'print' && st.printed ? st.printed.length : 0;
      el.innerHTML = esc(all.slice(0, len - nw)) + (nw ? '<span class="new">' + esc(all.slice(len - nw, len)) + '</span>' : '') + '<span class="cursor"></span>';
      el.scrollTop = el.scrollHeight;
    }
    const lines = len ? all.slice(0, len).split('\n').length - (all[len - 1] === '\n' ? 1 : 0) : 0;
    $('outInfo').textContent = len ? T(len + ' 個字元、' + lines + ' 行', len + (len === 1 ? ' character, ' : ' characters, ') + lines + (lines === 1 ? ' line' : ' lines')) : '';
  }

  // ======================= 說明文字 =======================
  function say(text, cls) { state.msg = { text: text, cls: cls || '' }; const el = $('status'); el.textContent = text; el.className = 'status' + (cls ? ' ' + cls : ''); }
  function topVars(st) { const f = st.frames[st.frames.length - 1]; const o = {}; f.vars.forEach(function (v) { o[v.name] = v; }); return o; }
  function condWord(v) { return v ? T('成立', 'true') : T('不成立', 'false'); }
  function describe(st) {
    const prog = state.b.prog, n = prog.nodes[st.node];
    const tv = topVars(st);
    const pre = T('第 ' + state.k + ' 步・第 ' + st.line + ' 行：', 'Step ' + state.k + ', line ' + st.line + ': ');
    let s = '';
    switch (st.kind) {
      case 'decl': {
        const parts = n.items.map(function (it) {
          const v = tv[it.name];
          if (v && v.arr) return it.name + '[' + v.arr.length + ']' + (v.arr.some(function (x) { return x !== undefined; }) ? ' = {' + v.arr.map(vs).join(', ') + '}' : '');
          return it.name + (v && v.v !== undefined ? ' = ' + vs(v.v) : T('（還沒給值）', ' (no value yet)'));
        });
        s = T('宣告 ', 'declare ') + parts.join(T('、', ', '));
        if (st.show != null) s += T('（右邊代入：' + st.show + '）', ' (right side: ' + st.show + ')');
        break;
      }
      case 'assign': {
        const v = tv[st.target];
        const nv = v ? (v.arr ? v.arr[st.idx] : v.v) : undefined;
        s = (st.idx != null ? st.target + '[' + st.idx + ']' : st.target) + T(' 變成 ', ' becomes ') + vs(nv);
        if (st.show != null) s += T('（右邊代入：' + st.show + '）', ' (right side: ' + st.show + ')');
        break;
      }
      case 'print': s = T('印出 ', 'print ') + JSON.stringify(st.printed); break;
      case 'if': s = T('判斷 if 的條件 ', 'test the if condition ') + st.show + ' → ' + condWord(st.cond) + (st.cond ? T('，執行這個區塊', ', so run this block') : n.els ? T('，跳到 else', ', so go to else') : T('，跳過這個區塊', ', so skip this block')); break;
      case 'while': case 'fcond':
        s = T('判斷迴圈條件 ', 'test the loop condition ') + (st.show || 'true') + ' → ' + condWord(st.cond) + (st.cond ? T('，進入第 ' + st.iter + ' 圈', ', so start time round ' + st.iter) : T('，離開迴圈', ', so leave the loop'));
        break;
      case 'init': s = T('for 的第一段 ', 'first part of the for, ') + (nodeText(n.init) || '') + T('（只做這一次）', ' (done only once)'); break;
      case 'upd': {
        const v = tv[st.target];
        s = T('for 的第三段 ', 'third part of the for, ') + (nodeText(n.upd) || '') + (v && !v.arr ? T('：', ': ') + st.target + ' = ' + vs(v.v) : '') + T('，接著再判斷條件', '; then test the condition again');
        break;
      }
      case 'break': s = T('break：立刻離開迴圈（for 的第三段也不做）', 'break: leave the loop at once (the third part of a for is not run either)'); break;
      case 'continue': {
        const L = st.loops[st.loops.length - 1];
        const isFor = L && prog.nodes.some(function (x) { return x.k === 'for' && x.line === L.line; });
        s = T('continue：跳過本體剩下的部分', 'continue: skip the rest of the body') + (isFor ? T('，接著做 for 的第三段', ', then run the third part of the for') : T('，回去判斷條件', ', and go back to the condition'));
        break;
      }
      case 'call': s = T('呼叫 ', 'call ') + st.call + '(' + st.args.map(vs).join(', ') + ')' + T('：疊上新的一層，參數拿到引數的值', ': a new layer goes on the stack and the parameters get the values of the arguments'); break;
      case 'return': s = st.ret === undefined ? T('return：離開這個函式', 'return: leave this function') : T('return：把 ' + vs(st.ret) + ' 帶回呼叫的地方', 'return: take ' + vs(st.ret) + ' back to where the function was called'); break;
      case 'callstmt': s = T('呼叫結束，回到這一行', 'the call has finished; back on this line'); break;
      case 'fend': s = T('函式執行到最後的 }，回到呼叫的地方', 'the function reaches its closing }, so go back to where it was called'); break;
      case 'error': return T('第 ' + state.k + ' 步：程式停在第 ' + st.line + ' 行。', 'Step ' + state.k + ': the program stops at line ' + st.line + '. ') + T(st.err.msg.zh, st.err.msg.en);
    }
    if (st.pyDiff) st.pyDiff.forEach(function (d) {
      const o = d.op === '/' ? '//' : '%';
      s += T('　⚠ C：' + vs(d.a) + ' ' + d.op + ' ' + vs(d.b) + ' = ' + vs(d.c) + '；Python：' + vs(d.a) + ' ' + o + ' ' + vs(d.b) + ' = ' + vs(d.py),
        '  ⚠ C: ' + vs(d.a) + ' ' + d.op + ' ' + vs(d.b) + ' = ' + vs(d.c) + '; Python: ' + vs(d.a) + ' ' + o + ' ' + vs(d.b) + ' = ' + vs(d.py));
    });
    return pre + s + T('。', '.');
  }
  function describeNow() {
    const st = cur();
    if (!st) return;
    if (atEnd()) {
      const tr = state.b.trace;
      if (!tr.ok) { say(describe(st), 'bad'); return; }
      say(T('程式結束，一共 ' + N() + ' 步。', 'The program has ended after ' + N() + ' steps. ') + describe(st).replace(/^[^：:]*[：:]\s*/, T('最後一步：', 'Last step: ')));
      return;
    }
    say(describe(st), st.kind === 'error' ? 'bad' : st.pyDiff ? 'warn' : '');
  }

  // ======================= 讀數與紀錄 =======================
  const lastHTML = {};
  function setHTML(id, html) { if (lastHTML[id] !== html) { $(id).innerHTML = html; lastHTML[id] = html; } }
  function renderReadout() {
    let t = 0, f = 0, sc = 0, pd = 0, dep = 0, pr = 0;
    for (let i = 0; i < state.k; i++) {
      const s = steps()[i];
      if (s.kind === 'if' || s.kind === 'while' || s.kind === 'fcond') { if (s.cond) t++; else f++; }
      if (s.sc) sc += s.sc;
      if (s.pyDiff) pd += s.pyDiff.length;
      dep = Math.max(dep, s.frames.length - 1);
      if (s.kind === 'print') pr++;
    }
    const st = cur(), tr = state.b.trace;
    let res, rc = '';
    if (!st) res = T('還沒開始', 'not started');
    else if (!atEnd()) res = T('執行中', 'running');
    else if (tr.ok) { res = T('正常結束', 'finished'); rc = 't'; }
    else { res = T('出錯停止', 'stopped by an error'); rc = 'bad'; }
    const rows = [
      [T('步數', 'Steps'), state.k + ' / ' + N(), ''],
      [T('目前在第幾行', 'Current line'), st ? String(st.line) : '—', ''],
      [T('條件成立的次數', 'Conditions that were true'), String(t), t ? 't' : ''],
      [T('條件不成立的次數', 'Conditions that were false'), String(f), f ? 'f' : ''],
      [T('短路：右邊沒算的次數', 'Short circuits (right side skipped)'), String(sc), ''],
      [T('印出的次數', 'printf calls'), String(pr), ''],
      [T('呼叫最深幾層', 'Deepest call'), String(dep), ''],
      [T('C 與 Python 除法不同', 'C and Python division differ'), String(pd), pd ? 'w' : ''],
      [T('結果', 'Result'), res, rc]
    ];
    setHTML('readout', rows.map(function (r) { return '<dt>' + esc(r[0]) + '</dt><dd' + (r[2] ? ' class="' + r[2] + '"' : '') + '>' + esc(r[1]) + '</dd>'; }).join(''));
  }
  function paramText(id, params) {
    const p = K.program(id);
    return p.params.map(function (pa) { return pa.name + ' = ' + vs(params[pa.name]); }).join(', ');
  }
  function renderLog() {
    $('logEmpty').hidden = state.log.length > 0;
    if (!state.log.length) { setHTML('logTab', ''); return; }
    const head = '<tr><th>#</th><th>' + esc(T('程式', 'Program')) + '</th><th>' + esc(T('數字', 'Numbers')) + '</th><th>' + esc(T('步數', 'Steps')) + '</th><th>' + esc(T('結果', 'Result')) + '</th><th>' + esc(T('猜測', 'Guess')) + '</th></tr>';
    const body = state.log.map(function (r) {
      const p = K.program(r.id);
      const res = r.err ? '<td class="bad">' + esc(T(r.err.zh, r.err.en)) + '</td>' : '<td class="mono">' + esc(r.out) + '</td>';
      const g = r.guess == null ? '<td>—</td>' : '<td class="' + (r.guess ? 'ok' : 'no') + '">' + (r.guess ? '✓' : '✗') + '</td>';
      return '<tr><td>' + r.no + '</td><td>' + esc(T(p.zh, p.en)) + '</td><td class="mono">' + esc(paramText(r.id, r.params)) + '</td><td>' + r.steps + '</td>' + res + g + '</tr>';
    }).join('');
    setHTML('logTab', '<thead>' + head + '</thead><tbody>' + body + '</tbody>');
  }
  const ERR_SHORT = { overflow: ['溢位', 'overflow'], steps: ['超過 10000 步', 'over 10000 steps'], div0: ['除以 0', 'division by 0'], index: ['索引超出範圍', 'index out of range'],
    uninit: ['還沒給值', 'no value yet'], depth: ['呼叫太深', 'calls too deep'], output: ['輸出太多', 'too much output'] };

  // ======================= 先猜再看 =======================
  function renderGuess() {
    const started = state.k > 0;
    guessEl.disabled = started;
    $('guessBtn').disabled = started;
    const m = $('guessMsg');
    const gr = state.guessResult;
    if (gr) {
      if (gr.correct) m.innerHTML = esc(T('猜中了！', 'Right!')) + (gr.fresh ? '' : ' <span class="hint">' + esc(T('（這組數字之前看過答案，不算任務）', '(you had already seen the answer for these numbers, so it does not count for missions)')) + '</span>');
      else if (!gr.ok) m.innerHTML = esc(T('程式出錯停下來了，沒有答案可以對。', 'The program stopped with an error, so there is no answer to check.'));
      else m.innerHTML = esc(T('沒猜中。正確答案：', 'Not quite. The answer is: ')) + '<span class="ans">' + esc(gr.answer) + '</span>';
      m.className = gr.correct ? 'ok' : 'no';
      return;
    }
    if (state.guess != null) {
      m.textContent = T('已記下你的猜測「' + state.guess + '」，把程式跑完就知道對不對。', 'Your guess “' + state.guess + '” is saved; run the program to the end to find out.');
      m.className = '';
    } else if (started) {
      m.textContent = T('程式已經開始跑了；按「重來」才能再猜一次。', 'The program has already started; press “Restart” to guess again.');
      m.className = '';
    } else { m.textContent = ''; m.className = ''; }
  }
  function submitGuess() {
    if (state.k > 0) { renderGuess(); return; }
    const g = guessEl.value.trim();
    if (!g) { $('guessMsg').textContent = T('先寫下你的預測。', 'Write your prediction first.'); $('guessMsg').className = 'no'; return; }
    state.guess = g;
    state.guessFresh = !state.seen.has(K.configKey(state.id, state.params));
    state.guessResult = null;
    renderGuess();
    Sd.tone({ freq: 587.33, dur: 0.08, type: 'sine', gain: 0.1 });
  }

  // ======================= 前進、倒退、播放 =======================
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  function goTo(k, how) {
    k = Math.max(0, Math.min(N(), k));
    if (k === state.k) return;
    const prev = state.k;
    if (prev === 0 && k > 0) state.seen.add(K.configKey(state.id, state.params));
    state.k = k;
    state.flash = null;
    if (k === prev + 1 && how !== 'end') {
      state.flash = { t0: performance.now(), keys: changedKeys(prev ? steps()[prev - 1] : null, steps()[k - 1]) };
      stepSound(steps()[k - 1]);
    } else if (k > 0) state.flash = { t0: -1e9, keys: changedKeys(k > 1 ? steps()[k - 2] : null, steps()[k - 1]) };
    if (atEnd() && !state.done) finish();
    updateAll();
  }
  function finish() {
    state.done = true;
    stopPlay();
    const b = state.b, tr = b.trace;
    emit('finish', K.finishEvent(b));
    let gr = null;
    if (state.guess != null) {
      gr = K.guessEvent(b, state.guess, state.guessFresh);
      state.guessResult = gr;
      emit('guess', gr);
    }
    state.runNo++;
    state.log.unshift({ no: state.runNo, id: state.id, params: Object.assign({}, b.params), steps: tr.steps.length,
      out: tr.output.replace(/\n$/, '').replace(/\n/g, ' ↵ ').slice(0, 60) || T('（沒有輸出）', '(no output)'),
      err: tr.ok ? null : (ERR_SHORT[tr.error.key] ? { zh: ERR_SHORT[tr.error.key][0], en: ERR_SHORT[tr.error.key][1] } : { zh: '出錯', en: 'error' }),
      guess: gr ? gr.correct : null });
    if (state.log.length > 40) state.log.length = 40;
    renderLog();
    if (!tr.ok) Sd.sweep({ from: 392, to: 262, dur: 0.3, type: 'sawtooth', gain: 0.08 });
    else if (gr && gr.correct) [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) { setTimeout(function () { Sd.tone({ freq: f, dur: 0.14, type: 'triangle', gain: 0.13 }); }, i * 85); });
    else if (gr) Sd.sweep({ from: 440, to: 330, dur: 0.22, type: 'triangle', gain: 0.11 });
    else [523.25, 783.99].forEach(function (f, i) { setTimeout(function () { Sd.tone({ freq: f, dur: 0.12, type: 'sine', gain: 0.11 }); }, i * 90); });
  }
  function step() { if (atEnd()) { say(T('已經跑完了；按「重來」從頭再跑一次。', 'Already at the end; press “Restart” to run it again.')); return; } goTo(state.k + 1, 'step'); }
  function back() { stopPlay(); if (state.k > 0) goTo(state.k - 1, 'back'); }
  function toEnd() { stopPlay(); goTo(N(), 'end'); }
  function restart() {
    stopPlay();
    state.k = 0; state.done = false; state.flash = null;
    state.guess = null; state.guessResult = null;
    say(T('回到開頭。可以再猜一次（看過答案的同一組數字不算任務），再按「單步」。', 'Back to the start. You may guess again (it does not count for missions if you have seen the answer for these numbers), then press “Step”.'));
    updateAll();
  }
  let rafId = 0, lastT = 0, acc = 0, lastSound = 0;
  function startPlay() {
    if (atEnd()) restart();
    state.playing = true; lastT = 0; acc = 1;
    updateButtons();
    loop();
  }
  function stopPlay() { if (!state.playing) return; state.playing = false; updateButtons(); }
  function loop() {
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(function tick(t) {
      const dt = lastT ? Math.min(0.25, (t - lastT) / 1000) : 0;
      lastT = t;
      if (state.playing) {
        acc += dt * state.speed;
        let n = 0;
        while (acc >= 1 && state.playing && n < 40) { acc -= 1; n++; goTo(state.k + 1, 'play'); if (atEnd()) stopPlay(); }
      }
      draw();
      const animating = state.flash && performance.now() - state.flash.t0 < 900 && !D.reducedMotion();
      if (state.playing || animating) rafId = requestAnimationFrame(tick); else lastT = 0;
    });
  }
  function requestDraw() { if (!state.playing) loop(); }
  function updateButtons() {
    const pb = $('playBtn');
    pb.setAttribute('aria-pressed', String(state.playing));
    pb.textContent = state.playing ? T('暫停', 'Pause') : T('播放', 'Play');
    $('backBtn').disabled = state.k === 0;
    $('stepBtn').disabled = atEnd();
    $('endBtn').disabled = atEnd();
    $('resetBtn').disabled = state.k === 0;
  }
  function updateAll() {
    renderCode();
    renderOut();
    renderReadout();
    renderGuess();
    updateButtons();
    if (state.k > 0) describeNow();
    requestDraw();
  }

  // ======================= 音效 =======================
  const Sd = window.LabSound || { tone: function () {}, sweep: function () {}, enabled: function () { return false; } };
  function stepSound(st) {
    if (!Sd.enabled || !Sd.enabled()) return;
    const now = performance.now();
    if (state.playing && state.speed > 8 && now - lastSound < 110) return;
    lastSound = now;
    switch (st.kind) {
      case 'if': case 'while': case 'fcond':
        if (st.cond) Sd.tone({ freq: 659.25, dur: 0.07, type: 'sine', gain: 0.1 });
        else Sd.tone({ freq: 392, dur: 0.09, type: 'triangle', gain: 0.1 });
        break;
      case 'print': Sd.tone({ freq: 880, dur: 0.05, type: 'square', gain: 0.045 }); break;
      case 'call': Sd.sweep({ from: 392, to: 587.33, dur: 0.12, type: 'triangle', gain: 0.11 }); break;
      case 'return': case 'fend': Sd.sweep({ from: 587.33, to: 392, dur: 0.12, type: 'triangle', gain: 0.11 }); break;
      case 'break': case 'continue': Sd.tone({ freq: 523.25, dur: 0.06, type: 'triangle', gain: 0.1 }); break;
      case 'error': break;   // 結束時另外發聲
      default: Sd.tone({ freq: 740, dur: 0.03, type: 'sine', gain: 0.05 });
    }
  }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }

  // ======================= 畫布：變數盒、陣列、呼叫堆疊、條件 =======================
  const cv = $('cv'), ctx = cv.getContext('2d');
  let dpr = 1, cw = 320, ch = 260;
  /** 和前一步比，哪些變數（或陣列格）改了：{ key: 舊值 }；舊值 undefined 表示新出現 */
  function changedKeys(a, b) {
    const out = {};
    if (!b) return out;
    const fb = b.frames[b.frames.length - 1];
    const fa = a && a.frames.length === b.frames.length ? a.frames[a.frames.length - 1] : null;
    const old = {};
    if (fa) fa.vars.forEach(function (v) { old[v.name + '@' + v.depth] = v; });
    fb.vars.forEach(function (v) {
      const o = old[v.name + '@' + v.depth];
      if (v.arr) {
        v.arr.forEach(function (x, i) { const ox = o && o.arr ? o.arr[i] : undefined; if (!o || ox !== x) out[v.name + '[' + i + ']'] = { old: ox, had: !!o }; });
      } else if (!o || o.v !== v.v) out[v.name] = { old: o ? o.v : undefined, had: !!o && o.v !== undefined };
    });
    return out;
  }
  function wrapText(text, maxW, font) {
    ctx.font = font;
    const parts = String(text).match(/[⺀-鿿＀-￯　-〿]|[^\s⺀-鿿＀-￯　-〿]+|\s+/g) || [];
    const lines = [];
    let line = '';
    parts.forEach(function (p) {
      const tryL = line + p;
      if (ctx.measureText(tryL).width > maxW && line.trim()) { lines.push(line.replace(/\s+$/, '')); line = /^\s+$/.test(p) ? '' : p; }
      else line = tryL;
    });
    if (line.trim()) lines.push(line.replace(/\s+$/, ''));
    return lines;
  }
  function fitFont(text, maxW, px, min, weight, fam) {
    let f = px;
    for (;;) { ctx.font = fnt(f, weight, fam); if (ctx.measureText(text).width <= maxW || f <= min) return f; f -= 0.5; }
  }

  /** 一個區塊：dry = true 只量高度 */
  function secLoops(st, x0, y, w, dry) {
    if (!st || !st.loops.length) return y;
    ctx.font = fnt(12, 600);
    let x = x0;
    const h = 24;
    const testing = st.kind === 'while' || st.kind === 'fcond';
    st.loops.forEach(function (L, i) {
      const last = i === st.loops.length - 1 && testing && L.line === st.line;
      const txt = last && !st.cond ? T('第 ' + L.line + ' 行的迴圈：跑完 ' + L.iter + ' 圈', 'loop on line ' + L.line + ': done after ' + L.iter + (L.iter === 1 ? ' time' : ' times'))
        : T('第 ' + L.line + ' 行的迴圈：第 ' + (last ? st.iter : L.iter) + ' 圈', 'loop on line ' + L.line + ': time round ' + (last ? st.iter : L.iter));
      const tw = ctx.measureText(txt).width + 26;
      if (x + tw > x0 + w && x > x0) { x = x0; y += h + 6; }
      if (!dry) {
        D.roundRect(ctx, x, y, tw, h, h / 2);
        ctx.fillStyle = alpha(C['ct-bar'], D.dark ? 0.2 : 0.12); ctx.fill();
        ctx.strokeStyle = alpha(C['ct-bar'], 0.55); ctx.lineWidth = 1; ctx.stroke();
        // 小小的循環箭頭
        ctx.beginPath(); ctx.arc(x + 12, y + h / 2, 5, -2.6, 2.0); ctx.strokeStyle = C['ct-bar']; ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.stroke();
        const ax = x + 12 + 5 * Math.cos(2.0), ay = y + h / 2 + 5 * Math.sin(2.0);
        ctx.beginPath(); ctx.moveTo(ax - 3.5, ay - 0.5); ctx.lineTo(ax, ay); ctx.lineTo(ax + 0.5, ay - 3.8); ctx.stroke();
        ctx.fillStyle = C.text; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(txt, x + 21, y + h / 2 + 0.5);
      }
      x += tw + 6;
    });
    return y + h + 10;
  }
  function frameTitle(f) {
    if (f.fn === 'main') return 'main';
    const fdef = state.b.prog.funcs[f.fn];
    return f.fn + '(' + (fdef ? fdef.params.map(function (pa, i) { return pa.name + ' = ' + vs(f.args[i]); }).join(', ') : '') + ')';
  }
  function boxColorFor(v) { return v.type === 'bool' ? mix(C['ct-box'], C['ct-kw'], D.dark ? 0.18 : 0.1) : C['ct-box']; }
  function secFrame(st, f, x0, y, w, dry, fi, nFrames) {
    const pad = 10, headH = 24;
    const now = performance.now();
    const fl = state.flash, fresh = fl && !D.reducedMotion() ? Math.max(0, 1 - (now - fl.t0) / 900) : 0;
    const top = fi === nFrames - 1;
    const keys = top && fl ? fl.keys : {};
    let y1 = y + headH + 8;
    // 純量：盒子
    const scal = f.vars.filter(function (v) { return !v.arr; });
    const arrs = f.vars.filter(function (v) { return v.arr; });
    const boxes = [];
    let x = x0 + pad, rowH = 54;
    scal.forEach(function (v) {
      ctx.font = fnt(18, 700, MONO);
      const vw = ctx.measureText(vs(v.v)).width;
      ctx.font = fnt(12, 600, MONO);
      const nw = ctx.measureText(v.name + '  ' + v.type).width;
      const bw = Math.max(58, vw + 24, nw + 18);
      if (x + bw > x0 + w - pad && x > x0 + pad) { x = x0 + pad; y1 += rowH + 8; }
      boxes.push({ v: v, x: x, y: y1, w: bw, h: rowH });
      x += bw + 8;
    });
    if (scal.length) y1 += rowH + 10;
    else if (!arrs.length) y1 += 22;
    // 陣列：一排格子＋索引＋指標
    const arrRows = [];
    arrs.forEach(function (v) {
      const len = v.arr.length;
      const idxVars = (state.b.prog.indexVars[v.name] ? Object.keys(state.b.prog.indexVars[v.name]) : [])
        .map(function (nm) { return scal.find(function (s) { return s.name === nm; }); })
        .filter(function (s) { return s && typeof s.v === 'number'; });
      const extra = idxVars.some(function (s) { return s.v >= len || s.v < 0; }) ? 1 : 0;
      ctx.font = fnt(13, 700, MONO);
      const lw = ctx.measureText(v.name).width + 14;
      const avail = w - 2 * pad - lw;
      const cwid = Math.max(24, Math.min(46, avail / (len + extra)));
      const r = { v: v, x: x0 + pad + lw, y: y1 + 4, cw: cwid, ch: 34, lw: lw, ptrs: idxVars };
      arrRows.push(r);
      y1 += 4 + 34 + 16 + (idxVars.length ? 30 : 0) + 8;
    });
    const hgt = y1 - y + 2;
    if (dry) return y + hgt;
    // 卡片
    ctx.save();
    ctx.shadowColor = D.dark ? 'rgba(0,0,0,0.45)' : alpha(C.text, 0.12);
    ctx.shadowBlur = top ? 10 : 4; ctx.shadowOffsetY = 2;
    D.roundRect(ctx, x0, y, w, hgt, 10);
    const g = ctx.createLinearGradient(0, y, 0, y + hgt);
    g.addColorStop(0, shade(C['ct-frame'], D.dark ? 0.06 : 0.35));
    g.addColorStop(1, C['ct-frame']);
    ctx.fillStyle = g; ctx.fill();
    ctx.restore();
    D.roundRect(ctx, x0 + 0.5, y + 0.5, w - 1, hgt - 1, 10);
    ctx.strokeStyle = top ? alpha(C['ct-bar'], 0.7) : alpha(C.border, 0.9); ctx.lineWidth = top ? 1.5 : 1; ctx.stroke();
    // 標題
    const title = frameTitle(f);
    ctx.font = fnt(13, 700, MONO);
    ctx.fillStyle = C['ct-fn']; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(title, x0 + pad, y + headH / 2 + 4);
    const tw = ctx.measureText(title).width;
    ctx.font = fnt(11.5, 500);
    ctx.fillStyle = C.muted;
    const lab = nFrames > 1 ? (top ? T('呼叫堆疊最上面（正在執行）', 'top of the call stack (running)') : T('等待中', 'waiting')) : T('變數', 'variables');
    if (x0 + pad + tw + 12 + ctx.measureText(lab).width < x0 + w - pad) ctx.fillText(lab, x0 + pad + tw + 12, y + headH / 2 + 4);
    if (!f.vars.length) {
      ctx.fillStyle = C.muted; ctx.font = fnt(12.5, 500);
      ctx.fillText(T('（還沒有變數）', '(no variables yet)'), x0 + pad, y + headH + 8 + 8);
    }
    // 盒子
    boxes.forEach(function (bx) {
      const v = bx.v, ck = keys[v.name];
      const col = boxColorFor(v);
      D.block(ctx, bx.x, bx.y, bx.w, bx.h, col, { r: 7 });
      if (ck) {
        D.roundRect(ctx, bx.x - 1.5, bx.y - 1.5, bx.w + 3, bx.h + 3, 8.5);
        ctx.strokeStyle = alpha(C['ct-new'], 0.95); ctx.lineWidth = 2.5; ctx.stroke();
        if (fresh > 0) {
          D.roundRect(ctx, bx.x - 4, bx.y - 4, bx.w + 8, bx.h + 8, 11);
          ctx.strokeStyle = alpha(C['ct-new'], 0.55 * fresh); ctx.lineWidth = 5 * fresh + 1; ctx.stroke();
        }
      }
      ctx.textBaseline = 'alphabetic';
      ctx.font = fnt(12, 700, MONO); ctx.textAlign = 'left';
      ctx.fillStyle = C.text;
      ctx.fillText(v.name, bx.x + 8, bx.y + 15);
      const nmw = ctx.measureText(v.name).width;
      ctx.font = fnt(10.5, 600, MONO);
      ctx.fillStyle = C['ct-ty'];
      ctx.fillText(v.type, bx.x + 8 + nmw + 6, bx.y + 15);
      const s = vs(v.v);
      ctx.font = fnt(18, 700, MONO); ctx.textAlign = 'center';
      ctx.fillStyle = v.v === undefined ? C.muted : typeof v.v === 'boolean' ? (v.v ? C['ct-true'] : C['ct-false']) : C.text;
      ctx.fillText(s, bx.x + bx.w / 2, bx.y + bx.h - 11);
      // 舊值往上飄走
      if (ck && ck.had && fresh > 0) {
        ctx.font = fnt(14, 700, MONO);
        ctx.fillStyle = alpha(C.muted, fresh * 0.9);
        ctx.fillText(vs(ck.old), bx.x + bx.w / 2, bx.y + bx.h - 11 - (1 - fresh) * 26);
      }
    });
    // 陣列
    arrRows.forEach(function (r) {
      const v = r.v;
      ctx.font = fnt(13, 700, MONO); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillStyle = C.text;
      ctx.fillText(v.name, x0 + pad, r.y + r.ch / 2);
      v.arr.forEach(function (x, i) {
        const cx = r.x + i * r.cw;
        const ck = keys[v.name + '[' + i + ']'];
        D.block(ctx, cx + 1, r.y, r.cw - 2, r.ch, C['ct-arr'], { r: 4, shadow: false });
        if (ck) {
          D.roundRect(ctx, cx, r.y - 1, r.cw, r.ch + 2, 5);
          ctx.strokeStyle = alpha(C['ct-new'], 0.95); ctx.lineWidth = 2.2; ctx.stroke();
          if (fresh > 0) { D.roundRect(ctx, cx - 3, r.y - 4, r.cw + 6, r.ch + 8, 8); ctx.strokeStyle = alpha(C['ct-new'], 0.5 * fresh); ctx.lineWidth = 4 * fresh + 1; ctx.stroke(); }
        }
        const s = vs(x);
        const fs = fitFont(s, r.cw - 6, 15, 9, 700, MONO);
        ctx.font = fnt(fs, 700, MONO); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = x === undefined ? C.muted : C.text;
        ctx.fillText(s, cx + r.cw / 2, r.y + r.ch / 2 + 1);
        ctx.font = fnt(10.5, 500, MONO); ctx.fillStyle = C.muted;
        ctx.fillText(String(i), cx + r.cw / 2, r.y + r.ch + 9);
      });
      // 指標：索引變數指著哪一格（超出範圍的畫成紅色虛線格）
      const byCell = {};
      r.ptrs.forEach(function (p) { (byCell[p.v] = byCell[p.v] || []).push(p); });
      Object.keys(byCell).forEach(function (key) {
        const i = +key, list = byCell[key];
        const out = i < 0 || i >= v.arr.length;
        const ci = Math.max(-0.0, Math.min(v.arr.length, i));
        const cx = r.x + (i < 0 ? -1 : ci) * r.cw + r.cw / 2;
        const col = out ? C['ct-bad'] : C['ct-ptr'];
        if (out && i >= 0) {
          ctx.save(); ctx.setLineDash([4, 3]);
          D.roundRect(ctx, r.x + v.arr.length * r.cw + 1, r.y, r.cw - 2, r.ch, 4);
          ctx.strokeStyle = alpha(C['ct-bad'], 0.8); ctx.lineWidth = 1.4; ctx.stroke(); ctx.restore();
          ctx.font = fnt(10.5, 600, MONO); ctx.fillStyle = C['ct-bad']; ctx.textAlign = 'center';
          ctx.fillText(String(i), cx, r.y + r.ch + 9);
        }
        const ty = r.y + r.ch + 17;
        ctx.beginPath(); ctx.moveTo(cx, ty); ctx.lineTo(cx - 5, ty + 7); ctx.lineTo(cx + 5, ty + 7); ctx.closePath();
        ctx.fillStyle = col; ctx.fill();
        D.pill(ctx, list.map(function (p) { return p.name; }).join(', ') + (out ? ' ✕' : ''), cx, ty + 25, col, 'center', fnt(11.5, 700, MONO));
      });
    });
    return y + hgt;
  }
  function secFrames(st, x0, y, w, dry) {
    const frames = st ? st.frames : [{ fn: state.b.prog.hasMain ? 'main' : 'main', args: [], vars: [] }];
    const n = frames.length;
    // 最上面一層（正在執行）完整畫出；下面等待中的各層由新到舊、只畫標題列
    y = secFrame(st, frames[n - 1], x0, y, w, dry, n - 1, n);
    const show = Math.min(n - 1, 6);
    for (let j = 0; j < show; j++) {
      const f = frames[n - 2 - j];
      y += 6;
      const h = 30;
      if (!dry) {
        const inset = Math.min(4 + j * 3, 18);
        D.roundRect(ctx, x0 + inset, y, w - 2 * inset, h, 8);
        ctx.fillStyle = alpha(C['ct-frame'], D.dark ? 0.75 : 0.85); ctx.fill();
        ctx.strokeStyle = alpha(C.border, 0.9); ctx.lineWidth = 1; ctx.stroke();
        ctx.font = fnt(12.5, 700, MONO); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillStyle = alpha(C['ct-fn'], 0.85);
        const t = frameTitle(f);
        ctx.fillText(t, x0 + inset + 10, y + h / 2 + 0.5);
        const tw = ctx.measureText(t).width;
        const sc = f.vars.filter(function (v) { return !v.arr; }).map(function (v) { return v.name + ' = ' + vs(v.v); }).join('   ');
        ctx.font = fnt(12, 500, MONO); ctx.fillStyle = C.muted;
        const room = w - 2 * inset - tw - 34;
        if (sc && room > 30) {
          let s = sc;
          while (s.length > 3 && ctx.measureText(s).width > room) s = s.slice(0, -2);
          if (s !== sc) s = s.replace(/\s*\S?$/, '') + '…';
          ctx.fillText(s, x0 + inset + 10 + tw + 14, y + h / 2 + 0.5);
        }
      }
      y += h;
    }
    if (n - 1 > show) {
      y += 4;
      if (!dry) { ctx.font = fnt(11.5, 500); ctx.fillStyle = C.muted; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(T('… 下面還有 ' + (n - 1 - show) + ' 層', '… ' + (n - 1 - show) + ' more below'), x0 + w / 2, y); }
      y += 16;
    }
    return y + 10;
  }
  function secCond(st, x0, y, w, dry) {
    if (!st || st.show == null) return y;
    const prog = state.b.prog, n = prog.nodes[st.node];
    const isCond = st.kind === 'if' || st.kind === 'while' || st.kind === 'fcond';
    let eNode = null;
    if (st.kind === 'if' || st.kind === 'while' || st.kind === 'fcond') eNode = n.cond;
    else if (st.sexpr != null) eNode = prog.nodes[st.sexpr];
    const orig = (eNode && nodeText(eNode)) || '';
    const res = isCond ? st.cond : st.sval;
    const pad = 12;
    ctx.font = fnt(12, 600);
    const lw = Math.max(ctx.measureText(T('原式', 'code')).width, ctx.measureText(T('代入', 'values')).width) + 12;
    const mf = fnt(14, 600, MONO);
    const L1 = orig ? wrapText(orig, w - 2 * pad - lw, mf) : [];
    const L2 = wrapText(st.show, w - 2 * pad - lw, mf);
    const h = pad + 18 + 8 + (L1.length + L2.length) * 20 + 6 + 28 + 8;
    if (dry) return y + h + 10;
    D.roundRect(ctx, x0, y, w, h, 10);
    ctx.fillStyle = alpha(C.surface, D.dark ? 0.5 : 0.85); ctx.fill();
    ctx.strokeStyle = alpha(res ? C['ct-true'] : C['ct-false'], 0.6); ctx.lineWidth = 1.4; ctx.stroke();
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = fnt(12, 700); ctx.fillStyle = C.muted;
    ctx.fillText(isCond ? T('條件（第 ' + st.line + ' 行）', 'Condition (line ' + st.line + ')') : T('右邊的運算式（第 ' + st.line + ' 行）', 'Right-hand side (line ' + st.line + ')'), x0 + pad, y + pad + 6);
    let yy = y + pad + 18 + 8 + 10;
    if (L1.length) {
      ctx.font = fnt(12, 600); ctx.fillStyle = C.muted; ctx.fillText(T('原式', 'code'), x0 + pad, yy);
      ctx.font = mf; ctx.fillStyle = C.text;
      L1.forEach(function (ln, i) { ctx.fillText(ln, x0 + pad + lw, yy + i * 20); });
      yy += L1.length * 20;
    }
    ctx.font = fnt(12, 600); ctx.fillStyle = C.muted; ctx.fillText(T('代入', 'values'), x0 + pad, yy);
    ctx.font = mf; ctx.fillStyle = C['ct-num'];
    L2.forEach(function (ln, i) { ctx.fillText(ln, x0 + pad + lw, yy + i * 20); });
    yy += (L2.length - 1) * 20 + 16;
    const word = isEn() ? (res ? 'true' : 'false') : (res ? '成立' : '不成立') + ' ' + (res ? 'true' : 'false');
    const rb = D.pill(ctx, word, x0 + pad, yy + 24, res ? C['ct-true'] : C['ct-false'], 'left', fnt(13, 700));
    let then = '';
    if (st.kind === 'if') then = res ? T('→ 執行 if 後面的區塊', '→ run the block after if') : n.els ? T('→ 跳到 else', '→ go to else') : T('→ 跳過', '→ skip it');
    else if (isCond) then = res ? T('→ 進入第 ' + st.iter + ' 圈', '→ start time round ' + st.iter) : T('→ 離開迴圈', '→ leave the loop');
    else then = T('→ 存進 ', '→ store in ') + (st.target || (n.items ? n.items.map(function (it) { return it.name; }).join(', ') : ''));
    if (/…/.test(st.show)) then += T('；「…」是短路，沒有算', '; “…” is a short circuit: not evaluated');
    const tf = fnt(12.5, 600);
    const lines = wrapText(then, w - 2 * pad - rb.w - 10, tf);
    ctx.font = tf; ctx.fillStyle = C.text; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    lines.slice(0, 2).forEach(function (ln, i) { ctx.fillText(ln, x0 + pad + rb.w + 10, rb.y + rb.h / 2 + i * 15 - (lines.length > 1 ? 7 : 0)); });
    return y + h + 10;
  }
  function secNotes(st, x0, y, w, dry) {
    if (!st) return y;
    const items = [];
    if (st.pyDiff) st.pyDiff.forEach(function (d) {
      const o = d.op === '/' ? '//' : '%';
      items.push({ col: C['ct-warn'], title: T('⚠ C 和 Python 在這裡不一樣', '⚠ C and Python differ here'),
        text: 'C: ' + vs(d.a) + ' ' + d.op + ' ' + vs(d.b) + ' = ' + vs(d.c) + '     Python: ' + vs(d.a) + ' ' + o + ' ' + vs(d.b) + ' = ' + vs(d.py), mono: true });
    });
    if (st.kind === 'error') items.push({ col: C['ct-bad'], title: T('程式停在這裡', 'The program stops here'), text: T(st.err.msg.zh, st.err.msg.en) });
    if (!items.length) return y;
    const pad = 12;
    items.forEach(function (it) {
      const font = it.mono ? fnt(13, 600, MONO) : fnt(13, 500);
      const lines = wrapText(it.text, w - 2 * pad - 6, font);
      const h = pad + 16 + lines.length * 18 + pad - 2;
      if (!dry) {
        D.roundRect(ctx, x0, y, w, h, 10);
        ctx.fillStyle = alpha(it.col, D.dark ? 0.14 : 0.09); ctx.fill();
        ctx.strokeStyle = alpha(it.col, 0.75); ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = it.col; ctx.fillRect(x0 + 1, y + 8, 3, h - 16);
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.font = fnt(12.5, 700); ctx.fillStyle = it.col;
        ctx.fillText(it.title, x0 + pad + 4, y + pad + 4);
        ctx.font = font; ctx.fillStyle = C.text;
        lines.forEach(function (ln, i) { ctx.fillText(ln, x0 + pad + 4, y + pad + 16 + 9 + i * 18); });
      }
      y += h + 10;
    });
    return y;
  }
  function secStart(x0, y, w, dry) {
    if (state.k > 0) return y;
    const txt = T('按「單步」開始：每按一次執行一步，這裡會畫出每個變數現在的值。', 'Press “Step” to begin: each press runs one step, and every variable’s current value is drawn here.');
    const lines = wrapText(txt, w - 24, fnt(13, 500));
    const h = lines.length * 18 + 8;
    if (!dry) { ctx.font = fnt(13, 500); ctx.fillStyle = C.muted; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; lines.forEach(function (ln, i) { ctx.fillText(ln, x0 + w / 2, y + 9 + i * 18); }); }
    return y + h + 8;
  }
  function layoutAll(dry) {
    const st = cur(), P = 12;
    const x0 = P, w = cw - 2 * P;
    let y = P;
    y = secLoops(st, x0, y, w, dry);
    y = secFrames(st, x0, y, w, dry);
    y = secStart(x0, y, w, dry);
    y = secCond(st, x0, y, w, dry);
    y = secNotes(st, x0, y, w, dry);
    return Math.max(160, Math.ceil(y + P - 10));
  }
  function draw() {
    const w = cv.clientWidth;
    if (!w || !state.b) return;
    cw = w;
    const d2 = Math.min(window.devicePixelRatio || 1, 3);
    ctx.setTransform(d2, 0, 0, d2, 0, 0);
    const H = layoutAll(true);
    if (H !== ch || d2 !== dpr || cv.width !== Math.round(w * d2) || cv.style.height !== H + 'px') {
      dpr = d2; ch = H;
      cv.style.height = ch + 'px';
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(ch * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(ctx, cw, ch);
    layoutAll(false);
  }

  // ======================= 事件 =======================
  progSel.addEventListener('change', function () { pick(progSel.value); });
  P_EL.forEach(function (e, i) {
    e.inp.addEventListener('input', function () {
      const pa = K.program(state.id).params[i];
      if (!pa) return;
      const v = Math.round(val(e.inp));
      e.out.textContent = vs(v);
      e.inp.setAttribute('aria-valuetext', String(v));
      setParam(pa.name, v);
    });
  });
  function editParam(name) {
    const i = K.program(state.id).params.findIndex(function (pa) { return pa.name === name; });
    if (i >= 0) P_EL[i].out.click();
  }
  $('codeC').addEventListener('click', function (e) { const p = e.target.closest('.param'); if (p) editParam(p.dataset.p); });
  $('codeC').addEventListener('keydown', function (e) { const p = e.target.closest && e.target.closest('.param'); if (p && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); editParam(p.dataset.p); } });
  document.querySelectorAll('.seg3 button').forEach(function (b) { b.addEventListener('click', function () { setView(b.dataset.view); requestDraw(); }); });
  $('stepBtn').addEventListener('click', function () { stopPlay(); step(); });
  $('backBtn').addEventListener('click', back);
  $('playBtn').addEventListener('click', function () { if (state.playing) stopPlay(); else startPlay(); });
  $('endBtn').addEventListener('click', toEnd);
  $('resetBtn').addEventListener('click', restart);
  $('guessBtn').addEventListener('click', submitGuess);
  guessEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); submitGuess(); } });
  speedEl.addEventListener('input', function () { state.speed = Math.max(1, Math.round(val(speedEl))); $('speedo').textContent = String(state.speed); });
  $('wipeBtn').addEventListener('click', function () {
    stopPlay();
    state.log = []; state.runNo = 0;
    renderLog();
    guessEl.value = '';
    restart();
    say(T('已全部清除：執行紀錄、輸出與進度都清掉了，程式和數字不變。', 'Everything has been cleared: the run log, the output and the progress. The program and the numbers stay the same.'));
  });
  $('soundBtn').addEventListener('click', function () {
    if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound'));
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'sound') updateSoundButton(); });

  // ---------- 鍵盤（LabKeys）：畫布上用方向鍵單步 ----------
  if (window.LabKeys) {
    window.LabKeys.attach(cv, {
      label: T('變數與記憶體的畫布：右方向鍵或下方向鍵單步，左方向鍵或上方向鍵回到上一步。', 'Variables and memory canvas: right or down arrow steps forward, left or up arrow steps back.'),
      items: [{
        name: function () { return T('步驟', 'Steps'); },
        move: function (dx, dy) { const d = dx || -dy; if (!d) return false; stopPlay(); if (d > 0) step(); else back(); return true; },
        describe: function () { return $('status').textContent; }
      }],
      onChange: requestDraw
    });
  }

  // ---------- 測試用介面（Playwright 腳本使用；不影響一般操作） ----------
  window.CodeTraceLab = {
    state: state,
    pick: pick,
    setParam: function (name, v) {
      const i = K.program(state.id).params.findIndex(function (pa) { return pa.name === name; });
      if (i < 0) return;
      if (window.LabNum) window.LabNum.set(P_EL[i].inp, v); else { P_EL[i].inp.value = v; P_EL[i].inp.dispatchEvent(new Event('input')); }
    },
    guess: function (s) { guessEl.value = s; submitGuess(); },
    step: function (n) { for (let i = 0; i < (n || 1); i++) step(); },
    back: back,
    end: toEnd,
    reset: restart,
    view: setView,
    answer: function () { return K.answerOf(state.b.def, state.b.trace); }
  };

  // ======================= 啟動 =======================
  function themeChanged() {
    readColors();
    D.refresh && D.refresh();
    for (const id in lastHTML) delete lastHTML[id];
    updateSoundButton();
    renderLog();
    updateAll();
    if (state.k === 0) say(state.msg ? state.msg.text : '');
  }
  readColors();
  fillPrograms();
  state.speed = Math.max(1, Math.round(val(speedEl))); $('speedo').textContent = String(state.speed);
  updateSoundButton();
  setView('c');
  renderLog();
  pick('swap');
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { if (cv.clientWidth !== lastW) { lastW = cv.clientWidth; requestDraw(); } }).observe($('stage'));
  } else window.addEventListener('resize', requestDraw);
  document.addEventListener('visibilitychange', function () { if (document.hidden && state.playing) stopPlay(); });
})();
