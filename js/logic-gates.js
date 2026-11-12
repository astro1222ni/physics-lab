/* logic-gates.js — 「邏輯閘與加法器」的畫面與互動（計算在 logic-gates-core.js；共用繪圖工具 LabDraw 在 drawkit.js）
 *
 * 五個模式：邏輯閘、萬用閘拼圖、半加器、全加器、多位元加法器（4／8 位元漣波進位）。
 * 每次撥動輸入，核心做一次「單位閘延遲」的事件驅動模擬，畫面依時間 t 播放：
 * 導線在整數時間改變（每個閘延遲 1 個單位），閘在「下一刻就要改變輸出」時顯示反應中的外框。
 * 美化（光暈、漣漪、管狀導線）不改變任何值或時間。 */
(function () {
  'use strict';
  const LC = window.LogicCore;
  const D = window.LabDraw;
  const FONT = D.FONT;
  const X = LC.X;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const alpha = D.alpha, shade = D.shade;
  const ZH_GATE = { AND: '及閘', OR: '或閘', NOT: '反閘', NAND: '反及閘', NOR: '反或閘', XOR: '互斥或閘', XNOR: '反互斥或閘' };
  const GATE_TEX = { AND: 'A \\cdot B', OR: 'A + B', NOT: '\\overline{A}', NAND: '\\overline{A \\cdot B}', NOR: '\\overline{A + B}', XOR: 'A \\oplus B', XNOR: '\\overline{A \\oplus B}' };
  const NAND_DEMO = { NOT: true, AND: true, OR: true, NAND: true };   // 頁面上示範的 NAND 組成（其他留給拼圖）

  // =====================================================================
  // 狀態
  // =====================================================================
  const st = {
    mode: 'gate',
    gate: { type: 'AND', a: 0, b: 0, nand: false, seen: {} },
    build: { type: 'NAND', target: 'AND', k: 3, conns: [0, 1, 2, 3, 4, 5].map(function () { return [null, null]; }), a: 0, b: 0, matched: false },
    half: { a: 0, b: 0 },
    full: { a: 0, b: 0, cin: 0 },
    adder: { n: 4, a: 11, b: 3, cin: 0, signed: false, log: [], count: 0 },
    speed: 2, auto: true
  };
  /** 目前的電路與模擬 */
  const run = { c: null, inVals: null, sim: null, t: 0, playing: false, depth: null, maxDepth: 0, res: null, changed: false };

  // =====================================================================
  // 色彩、字型
  // =====================================================================
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['canvas-bg', 'text', 'muted', 'border', 'accent', 'accent-soft', 'surface', 'bg',
      'lg-hi', 'lg-lo', 'lg-x', 'lg-gate', 'lg-edge', 'lg-chip', 'lg-glitch', 'lg-gen', 'lg-prop', 'lg-kill']
      .forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
  }
  function fnt(px, weight) { return (weight ? weight + ' ' : '') + Math.max(8, px).toFixed(1) + 'px ' + FONT; }
  function vcol(v) { return v === 1 ? C['lg-hi'] : v === 0 ? C['lg-lo'] : C['lg-x']; }
  function bitStr(v, n) { let s = ''; for (let i = n - 1; i >= 0; i--) s += (v >> i) & 1; return s; }
  function minus(v) { return String(v).replace('-', '−'); }
  /** 「n 個閘延遲」（英文分單複數） */
  function gd(n) { return n + T(' 個閘延遲', n === 1 ? ' gate delay' : ' gate delays'); }

  // =====================================================================
  // 建立電路、輸入改變、模擬
  // =====================================================================
  function inputsOf(mode) {
    if (mode === 'gate') { const g = st.gate; return LC.GATES[g.type].arity === 1 ? [g.a] : [g.a, g.b]; }
    if (mode === 'build') return [st.build.a, st.build.b];
    if (mode === 'half') return [st.half.a, st.half.b];
    if (mode === 'full') return [st.full.a, st.full.b, st.full.cin];
    return LC.adderInputs(st.adder.n, st.adder.a, st.adder.b, st.adder.cin);
  }
  /** 依目前模式重建電路（結構改變時）：停在目前輸入的穩定狀態，沒有轉換 */
  function rebuild() {
    const m = st.mode;
    let c;
    run.res = null;
    if (m === 'gate') { const g = st.gate; c = g.nand && NAND_DEMO[g.type] ? LC.nandForm(g.type) : LC.gateCircuit(g.type); }
    else if (m === 'build') { run.res = LC.buildUniversal(st.build.type, st.build.conns.slice(0, st.build.k)); c = run.res.c; }
    else if (m === 'half') c = LC.halfAdder();
    else if (m === 'full') c = LC.fullAdder();
    else c = LC.rippleAdder(st.adder.n);
    run.c = c;
    run.inVals = inputsOf(m);
    run.prevIn = run.inVals;
    run.sim = LC.simulate(c, run.inVals, run.inVals);
    run.t = 0; run.playing = false; run.changed = false;
    run.depth = LC.depths(c);
    run.maxDepth = Math.max.apply(null, run.depth);
    fx.length = 0;
    layoutDirty = true;
  }
  /** 輸入改變：從舊的穩定狀態模擬到新的輸入 */
  function applyInputs() {
    const nv = inputsOf(st.mode);
    run.sim = LC.simulate(run.c, run.inVals, nv);
    run.prevIn = run.inVals;
    run.inVals = nv;
    run.changed = true;
    fx.length = 0;
    clickSound();
    if (!st.auto) { run.t = 0; run.playing = false; }
    else if (reducedMotion) { run.t = run.sim.settle; run.playing = false; }
    else { run.t = 0; run.playing = run.sim.settle > 0; }
    lastFrame = 0;
    if (!run.playing && run.t >= run.sim.settle) settledSay();
    else say(st.auto ? T('訊號開始一個閘一個閘往前傳……', 'The signals start moving through the gates…') : T('輸入改了。按「單步」一次走一個閘延遲。', 'The inputs changed. Press “Step” to move one gate delay at a time.'));
    updateAll();
    requestDraw();
  }
  function tNow() { return Math.floor(run.t + 1e-9); }
  function nodeVal(node) { return LC.valueAt(run.sim, node, tNow()); }
  /** 這個節點下一刻就要改變（它的閘正在反應） */
  function pending(node) { return LC.nextChange(run.sim, node, tNow()) === tNow() + 1; }
  /** 正處在突波中（之後還會再變，而且目前的值和最後的值不同） */
  function inGlitch(node) {
    const h = run.sim.hist[node];
    if (h.length < 2) return false;
    const t = tNow();
    return t >= h[0][0] && t < h[h.length - 1][0] && nodeVal(node) !== run.sim.final[node];
  }

  // =====================================================================
  // 版面（單位座標；畫的時候乘上 s）
  // =====================================================================
  const cv = $('cv'), ctx = cv.getContext('2d');
  const cv2 = $('cv2'), ctx2 = cv2.getContext('2d');
  let dpr = 1, cw = 600, ch = 300, cw2 = 600, ch2 = 150;
  let L = null, layoutDirty = true;
  const HEAD = 34;   // 畫布上方放時間標籤的高度（px）

  function gate(name, type, x, y, sz) { return { name: name, type: type, x: x, y: y, sz: sz || 1.25 }; }
  function pinIn(g, k) { return [g.x - 0.95 * g.sz, LC.GATES[g.type].arity === 1 ? g.y : g.y + (k ? 1 : -1) * g.sz / 3]; }
  function pinOut(g) { return [g.x + 0.95 * g.sz, g.y]; }

  /** 手排的電路圖：inputs、gates、lamps、wires = [來源節點, 目的地（'g:閘:腳' 或 'l:燈'）, 轉彎的 x] */
  function specGate() {
    const g = st.gate, two = LC.GATES[g.type].arity === 2;
    if (g.nand && NAND_DEMO[g.type] && g.type !== 'NAND') {
      if (g.type === 'NOT') return {
        W: 8.2, H: 3.6, inputs: [{ name: 'A', x: 1.0, y: 1.8 }],
        gates: [gate('Y', 'NAND', 4.2, 1.8)], lamps: [{ node: 'Y', label: 'Y', x: 7.2, y: 1.8 }],
        wires: [['A', 'g:Y:0', 2.4], ['A', 'g:Y:1', 2.4], ['Y', 'l:Y', 6]],
        tags: [{ text: '¬A', node: 'Y', x: 5.75, y: 1.45 }]
      };
      if (g.type === 'AND') return {
        W: 9.6, H: 3.6, inputs: [{ name: 'A', x: 1.0, y: 1.3833 }, { name: 'B', x: 1.0, y: 2.2167 }],
        gates: [gate('N1', 'NAND', 3.7, 1.8), gate('Y', 'NAND', 6.7, 1.8)], lamps: [{ node: 'Y', label: 'Y', x: 8.75, y: 1.8 }],
        wires: [['A', 'g:N1:0', 2], ['B', 'g:N1:1', 2], ['N1', 'g:Y:0', 5.15], ['N1', 'g:Y:1', 5.15], ['Y', 'l:Y', 8]],
        tags: [{ text: '¬(A·B)', node: 'N1', x: 5.05, y: 1.45 }]
      };
      return {   // OR
        W: 9.6, H: 3.8, inputs: [{ name: 'A', x: 1.0, y: 1.0 }, { name: 'B', x: 1.0, y: 2.8 }],
        gates: [gate('N1', 'NAND', 3.7, 1.0), gate('N2', 'NAND', 3.7, 2.8), gate('Y', 'NAND', 6.7, 1.9)],
        lamps: [{ node: 'Y', label: 'Y', x: 8.75, y: 1.9 }],
        wires: [['A', 'g:N1:0', 2.05], ['A', 'g:N1:1', 2.05], ['B', 'g:N2:0', 2.05], ['B', 'g:N2:1', 2.05],
          ['N1', 'g:Y:0', 5.15], ['N2', 'g:Y:1', 5.15], ['Y', 'l:Y', 8]],
        tags: [{ text: '¬A', node: 'N1', x: 5.0, y: 0.68 }, { text: '¬B', node: 'N2', x: 5.0, y: 3.15 }]
      };
    }
    const sz = 1.6, cy = 1.8;
    return {
      W: 8.8, H: 3.6,
      inputs: two ? [{ name: 'A', x: 1.1, y: cy - sz / 3 }, { name: 'B', x: 1.1, y: cy + sz / 3 }] : [{ name: 'A', x: 1.1, y: cy }],
      gates: [gate('Y', g.type, 4.5, cy, sz)], lamps: [{ node: 'Y', label: 'Y', x: 7.75, y: cy }],
      wires: two ? [['A', 'g:Y:0', 2.5], ['B', 'g:Y:1', 2.5], ['Y', 'l:Y', 6.8]] : [['A', 'g:Y:0', 2.5], ['Y', 'l:Y', 6.8]],
      tags: []
    };
  }
  function specHalf() {
    return {
      W: 8.6, H: 4.3, inputs: [{ name: 'A', x: 1.0, y: 1.0833 }, { name: 'B', x: 1.0, y: 1.9167 }],
      gates: [gate('S', 'XOR', 4.4, 1.5), gate('C', 'AND', 4.4, 3.35)],
      lamps: [{ node: 'S', label: T('S（和）', 'S (sum)'), x: 7.0, y: 1.5 }, { node: 'C', label: T('C（進位）', 'C (carry)'), x: 7.0, y: 3.35 }],
      wires: [['A', 'g:S:0', 2], ['B', 'g:S:1', 2.5], ['A', 'g:C:0', 2], ['B', 'g:C:1', 2.5], ['S', 'l:S', 6], ['C', 'l:C', 6]],
      tags: []
    };
  }
  function specFull() {
    return {
      W: 14.3, H: 6.0,
      inputs: [{ name: 'A', x: 1.0, y: 1.0833 }, { name: 'B', x: 1.0, y: 1.9167 }, { name: 'CIN', label: 'Cin', x: 1.0, y: 3.9 }],
      gates: [gate('P', 'XOR', 4.4, 1.5), gate('G', 'AND', 4.4, 5.1), gate('S', 'XOR', 8.1, 1.9167), gate('H', 'AND', 8.1, 3.6), gate('COUT', 'OR', 11.3, 4.0167)],
      lamps: [{ node: 'S', label: 'S', x: 13.5, y: 1.9167 }, { node: 'COUT', label: 'Cout', x: 13.5, y: 4.0167 }],
      wires: [['A', 'g:P:0', 2], ['B', 'g:P:1', 2.5], ['A', 'g:G:0', 2], ['B', 'g:G:1', 2.5],
        ['P', 'g:S:0', 6.0], ['P', 'g:H:0', 6.0], ['CIN', 'g:S:1', 6.5], ['CIN', 'g:H:1', 6.5],
        ['H', 'g:COUT:0', 9.7], ['G', 'g:COUT:1', 9.9], ['S', 'l:S', 11], ['COUT', 'l:COUT', 12.8]],
      tags: [{ text: 'P', node: 'P', x: 5.5, y: 1.2 }, { text: 'G', node: 'G', x: 5.95, y: 4.82 }, { text: 'H', node: 'H', x: 9.45, y: 3.32 }]
    };
  }
  /** 拼圖：依深度自動排版，導線畫成曲線 */
  function specBuild() {
    const b = st.build, k = b.k, conns = b.conns.slice(0, k);
    const dep = [];
    conns.forEach(function (pr, i) {
      let m = 0;
      pr.forEach(function (s) { if (typeof s === 'number' && s < i) m = Math.max(m, dep[s]); });
      dep.push(m + 1);
    });
    const maxD = Math.max.apply(null, dep);
    const cols = {};
    dep.forEach(function (d, i) { (cols[d] = cols[d] || []).push(i); });
    let maxRows = 1;
    Object.keys(cols).forEach(function (d) { maxRows = Math.max(maxRows, cols[d].length); });
    const gap = 1.75, H = Math.max(3.8, maxRows * gap + 0.9), cy = H / 2;
    const gates = [];
    conns.forEach(function (pr, i) {
      const col = cols[dep[i]], r = col.indexOf(i);
      gates.push(gate('G' + (i + 1), b.type, 3.3 + (dep[i] - 1) * 2.55, cy + (r - (col.length - 1) / 2) * gap, 1.15));
    });
    const out = gates[k - 1];
    const lampX = 3.3 + (maxD - 1) * 2.55 + 2.25;
    const wires = [];
    conns.forEach(function (pr, i) {
      pr.forEach(function (s, pin) {
        const src = s === 'A' || s === 'B' ? s : (typeof s === 'number' && s < i ? 'G' + (s + 1) : null);
        wires.push([src, 'g:G' + (i + 1) + ':' + pin, null]);
      });
    });
    wires.push(['G' + k, 'l:G' + k, null]);
    return {
      W: lampX + 1.25, H: H, curve: true,
      inputs: [{ name: 'A', x: 1.0, y: cy - 0.75 }, { name: 'B', x: 1.0, y: cy + 0.75 }],
      gates: gates, lamps: [{ node: 'G' + k, label: 'Y', x: lampX, y: out.y }], wires: wires, tags: []
    };
  }
  /** 把電路圖規格換算成可以畫的版面（導線的點、交叉處的跨線、分岔點） */
  function compileSpec(sp) {
    const gi = {};
    sp.gates.forEach(function (g) { gi[g.name] = g; });
    const ii = {};
    sp.inputs.forEach(function (q) { ii[q.name] = q; });
    const li = {};
    sp.lamps.forEach(function (q) { li[q.node] = q; });
    function srcPt(name) { if (ii[name]) return [ii[name].x + 0.62, ii[name].y]; return pinOut(gi[name]); }
    function dstPt(d) {
      const p = d.split(':');
      if (p[0] === 'l') return [li[p[1]].x - 0.42, li[p[1]].y];
      return pinIn(gi[p[1]], +p[2]);
    }
    const wires = sp.wires.map(function (w) {
      const b = dstPt(w[1]);
      if (!w[0]) return { net: null, pts: [[b[0] - 0.55, b[1]], b], loose: true };
      const a = srcPt(w[0]);
      let pts;
      if (sp.curve) pts = [a, b];
      else if (Math.abs(a[1] - b[1]) < 1e-6) pts = [a, b];
      else pts = [a, [w[2], a[1]], [w[2], b[1]], b];
      return { net: w[0], pts: pts, curve: !!sp.curve };
    });
    // 分岔點：同一條線、同一個轉彎 x 的分支
    const dots = [];
    if (!sp.curve) {
      const groups = {};
      wires.forEach(function (w) {
        if (!w.net || w.pts.length < 4) return;
        const key = w.net + '@' + w.pts[1][0];
        (groups[key] = groups[key] || []).push(w);
      });
      sp.wires.forEach(function (w) {
        if (!w[0] || w[2] == null) return;
        const key = w[0] + '@' + w[2];
        if (!groups[key]) { groups[key] = []; }
      });
      Object.keys(groups).forEach(function (key) {
        const ws = groups[key];
        const net = key.split('@')[0], xm = +key.split('@')[1];
        const straight = wires.filter(function (w) { return w.net === net && w.pts.length === 2 && w.pts[0][0] < xm && w.pts[1][0] > xm; });
        if (ws.length + straight.length < 2) return;
        const y0 = srcPt(net)[1];
        dots.push({ net: net, x: xm, y: y0 });
        ws.forEach(function (w) {
          const y = w.pts[2][1];
          const beyond = ws.some(function (o) { const yo = o.pts[2][1]; return (yo - y0) * (y - y0) > 0 && Math.abs(yo - y0) > Math.abs(y - y0) + 1e-6; });
          if (beyond) dots.push({ net: net, x: xm, y: y });
        });
      });
      // 跨線：水平線段與別條線的垂直線段相交處
      wires.forEach(function (w) {
        w.hops = [];
        for (let i = 0; i + 1 < w.pts.length; i++) {
          const p = w.pts[i], q = w.pts[i + 1];
          if (Math.abs(p[1] - q[1]) > 1e-6) continue;
          const lo = Math.min(p[0], q[0]), hi = Math.max(p[0], q[0]), y = p[1];
          wires.forEach(function (o) {
            if (o === w || o.net === w.net) return;
            for (let j = 0; j + 1 < o.pts.length; j++) {
              const a = o.pts[j], b = o.pts[j + 1];
              if (Math.abs(a[0] - b[0]) > 1e-6) continue;
              const x = a[0];
              if (x > lo + 0.12 && x < hi - 0.12 && y > Math.min(a[1], b[1]) + 0.05 && y < Math.max(a[1], b[1]) - 0.05) w.hops.push([i, x]);
            }
          });
        }
      });
    }
    return { W: sp.W, H: sp.H, inputs: sp.inputs, gates: sp.gates, lamps: sp.lamps, wires: wires, dots: dots, tags: sp.tags || [], curve: !!sp.curve };
  }
  /** 多位元加法器：每一位一個全加器方塊 */
  function adderLayout() {
    const n = st.adder.n, colW = 2.0;
    const xs = [];
    for (let i = 0; i < n; i++) xs.push(2.45 + (n - 1 - i) * colW);
    const cinX = xs[0] + 1.85;
    return { adder: true, n: n, xs: xs, cinX: cinX, coutX: 0.72, yA: 0.72, yB: 1.62, yC: 3.25, bh: 1.5, bw: 1.42, yS: 5.05, W: cinX + 0.95, H: 5.75 };
  }
  function layout() {
    const m = st.mode;
    let base;
    if (m === 'adder') base = adderLayout();
    else base = compileSpec(m === 'gate' ? specGate() : m === 'build' ? specBuild() : m === 'half' ? specHalf() : specFull());
    const maxS = m === 'adder' ? 48 : 52;
    const pad = cw < 500 ? 4 : 12;
    // 標籤（開關左邊的 A、Cin，燈右邊的 S、Cout）會伸出單位方框：量文字寬度，留出左右邊界再決定比例
    let s = Math.min(maxS, (cw - 2 * pad) / base.W), ov = { l: 0, r: 0 };
    for (let it = 0; it < 3; it++) {
      ov = overhang(base, s);
      s = Math.min(maxS, (cw - 2 * pad - ov.l - ov.r) / base.W);
    }
    base.s = s;
    base.ox = pad + ov.l + (cw - 2 * pad - ov.l - ov.r - base.W * s) / 2;
    base.oy = HEAD;
    base.Hpx = Math.round(HEAD + base.H * s + 6);
    return base;
  }
  /** 比例為 s 時，文字標籤伸出 [0, W] 單位方框的寬度（px） */
  function overhang(base, s) {
    let l = 0, r = 0;
    const tw = function (text, font) { ctx.font = font; return ctx.measureText(text).width; };
    if (base.adder) {
      const w = tw('Cout', fnt(Math.max(9.5, 0.3 * s), 700));
      l = Math.max(0, w / 2 - base.coutX * s + 2);
      return { l: l, r: 0 };
    }
    base.inputs.forEach(function (q) {
      const w = tw(q.label || q.name, fnt(Math.max(11, 0.36 * s), 700));
      l = Math.max(l, w - (q.x - 0.49 - 0.12) * s + 2);
    });
    base.lamps.forEach(function (q) {
      if (!q.label) return;
      const w = tw(q.label, fnt(Math.max(11, 0.32 * s), 700));
      r = Math.max(r, q.x * s + Math.max(7, 0.34 * s) + 0.14 * s + w + 2 - base.W * s);
    });
    return { l: l, r: r };
  }
  function P(x, y) { return [L.ox + x * L.s, L.oy + y * L.s]; }

  function resize() {
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    cw = w;
    L = layout();
    layoutDirty = false;
    ch = L.Hpx;
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr);
    cv.height = Math.round(ch * dpr);
    cw2 = cv2.clientWidth || cw;
    ch2 = chartHeight();
    if (cv2.style.height !== ch2 + 'px') cv2.style.height = ch2 + 'px';
    cv2.width = Math.round(cw2 * dpr);
    cv2.height = Math.round(ch2 * dpr);
    requestDraw();
  }

  // =====================================================================
  // 繪圖：元件
  // =====================================================================
  function gatePath(type, cx, cy, u) {
    const x0 = cx - 0.72 * u, top = cy - 0.55 * u, bot = cy + 0.55 * u, h = 1.1 * u;
    ctx.beginPath();
    if (type === 'AND' || type === 'NAND') {
      const xa = cx + 0.07 * u;
      ctx.moveTo(x0, top); ctx.lineTo(xa, top);
      ctx.arc(xa, cy, h / 2, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(x0, bot); ctx.closePath();
    } else if (type === 'OR' || type === 'NOR' || type === 'XOR' || type === 'XNOR') {
      const sx = type === 'XOR' || type === 'XNOR' ? 0.13 * u : 0;
      const b = x0 + sx;
      ctx.moveTo(b, top);
      ctx.quadraticCurveTo(cx + 0.18 * u, top, cx + 0.62 * u, cy);
      ctx.quadraticCurveTo(cx + 0.18 * u, bot, b, bot);
      ctx.quadraticCurveTo(b + 0.24 * u, cy, b, top);
      ctx.closePath();
    } else {   // NOT
      ctx.moveTo(x0, cy - 0.46 * u); ctx.lineTo(cx + 0.46 * u, cy); ctx.lineTo(x0, cy + 0.46 * u); ctx.closePath();
    }
  }
  function hasBubble(type) { return type === 'NOT' || type === 'NAND' || type === 'NOR' || type === 'XNOR'; }
  function bodyRight(type, cx, u) { return type === 'NOT' ? cx + 0.46 * u : cx + 0.62 * u; }
  /** 一個閘：立體的特殊形狀符號＋輸入輸出短線＋反相圓圈＋種類名稱；pend ≥ 0 表示正在反應 */
  function drawGate(g, inV, outV, pend, faded) {
    const u = L.s * g.sz, c = P(g.x, g.y), cx = c[0], cy = c[1];
    const lw = Math.max(1.3, 0.045 * u);
    ctx.save();
    if (faded) ctx.globalAlpha = 0.42;
    // 輸入短線（OR 類要伸進彎曲的背面）
    const ar = LC.GATES[g.type].arity;
    const stubEnd = (g.type === 'OR' || g.type === 'NOR' || g.type === 'XOR' || g.type === 'XNOR') ? cx - 0.72 * u + 0.07 * u : cx - 0.72 * u;
    for (let k = 0; k < ar; k++) {
      const p = P.apply(null, pinIn(g, k));
      wireStroke(function () { ctx.moveTo(p[0], p[1]); ctx.lineTo(stubEnd, p[1]); }, inV[k]);
    }
    // 輸出短線
    const br = bodyRight(g.type, cx, u), bub = hasBubble(g.type) ? 0.11 * u : 0;
    const po = P.apply(null, pinOut(g));
    wireStroke(function () { ctx.moveTo(br + 2 * bub, cy); ctx.lineTo(po[0], cy); }, outV);
    // XOR 多出來的那條弧
    if (g.type === 'XOR' || g.type === 'XNOR') {
      const x0 = cx - 0.72 * u, top = cy - 0.55 * u, bot = cy + 0.55 * u;
      ctx.beginPath(); ctx.moveTo(x0, top); ctx.quadraticCurveTo(x0 + 0.24 * u, cy, x0, bot);
      ctx.strokeStyle = C['lg-edge']; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.stroke();
    }
    // 本體（上亮下暗＋投影）
    ctx.save();
    ctx.shadowColor = D.dark ? 'rgba(0,0,0,0.55)' : alpha(C.text, 0.22);
    ctx.shadowBlur = Math.min(10, 0.14 * u); ctx.shadowOffsetY = Math.min(3, 0.04 * u + 1);
    gatePath(g.type, cx, cy, u);
    const gr = ctx.createLinearGradient(0, cy - 0.55 * u, 0, cy + 0.55 * u);
    gr.addColorStop(0, shade(C['lg-gate'], D.dark ? 0.1 : 0.55));
    gr.addColorStop(0.55, C['lg-gate']);
    gr.addColorStop(1, shade(C['lg-gate'], D.dark ? -0.25 : -0.1));
    ctx.fillStyle = gr; ctx.fill();
    ctx.restore();
    gatePath(g.type, cx, cy, u);
    ctx.save(); ctx.clip();
    ctx.fillStyle = alpha('#ffffff', D.dark ? 0.06 : 0.45);
    ctx.fillRect(cx - u, cy - 0.55 * u, 2 * u, 0.16 * u);
    ctx.restore();
    gatePath(g.type, cx, cy, u);
    ctx.strokeStyle = C['lg-edge']; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.stroke();
    // 反相的小圓圈
    if (bub) {
      ctx.beginPath(); ctx.arc(br + bub, cy, bub, 0, Math.PI * 2);
      ctx.fillStyle = shade(C['lg-gate'], D.dark ? 0.05 : 0.4); ctx.fill();
      ctx.strokeStyle = C['lg-edge']; ctx.lineWidth = lw; ctx.stroke();
    }
    // 名稱
    const fs = g.type === 'NOT' ? 0.2 * u : 0.24 * u;
    if (fs >= 6.5) {
      const tx = g.type === 'NOT' ? cx - 0.3 * u : (g.type === 'AND' || g.type === 'NAND' ? cx - 0.1 * u : cx - 0.02 * u);
      ctx.font = fnt(fs, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = alpha(C['lg-edge'], 0.78);
      ctx.fillText(g.type, tx, cy + 0.5);
    }
    // 正在反應：外框發亮＋進度弧
    if (pend >= 0) {
      gatePath(g.type, cx, cy, u);
      ctx.strokeStyle = alpha(C.accent, 0.35 + 0.55 * pend); ctx.lineWidth = lw + 1.6; ctx.stroke();
      const rx = cx + 0.12 * u, ry = cy - 0.55 * u - 0.2 * u, rr = Math.max(3, 0.11 * u);
      ctx.beginPath(); ctx.arc(rx, ry, rr, 0, Math.PI * 2);
      ctx.fillStyle = alpha(C['canvas-bg'], 0.9); ctx.fill();
      ctx.strokeStyle = alpha(C.accent, 0.35); ctx.lineWidth = 1.2; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(rx, ry); ctx.arc(rx, ry, rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.04, pend)); ctx.closePath();
      ctx.fillStyle = C.accent; ctx.fill();
    }
    ctx.restore();
  }
  /** 一段導線：1 是發光的琥珀色管子，0 是灰色細線，X 是虛線 */
  function wireStroke(path, v, w) {
    w = w || Math.max(2.2, Math.min(4, 0.075 * L.s));
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); path();
    ctx.strokeStyle = alpha(C['canvas-bg'], 0.85); ctx.lineWidth = w + 3; ctx.stroke();
    if (v === 1) {
      if (D.dark) { ctx.beginPath(); path(); ctx.strokeStyle = alpha(C['lg-hi'], 0.18); ctx.lineWidth = w * 3.2; ctx.stroke(); }
      D.tube(ctx, function (c) { path(c); }, C['lg-hi'], w * 1.15);
    } else {
      ctx.beginPath(); path();
      if (v === X) ctx.setLineDash([w * 1.6, w * 1.6]);
      ctx.strokeStyle = vcol(v); ctx.lineWidth = w * 0.85; ctx.stroke();
    }
    ctx.restore();
  }
  /** 折線（含跨線的小拱橋）或曲線 */
  function wirePath(wr) {
    return function () {
      const pts = wr.pts.map(function (q) { return P(q[0], q[1]); });
      ctx.moveTo(pts[0][0], pts[0][1]);
      if (wr.curve) {
        const dx = Math.max(0.5 * L.s, (pts[1][0] - pts[0][0]) * 0.5);
        ctx.bezierCurveTo(pts[0][0] + dx, pts[0][1], pts[1][0] - dx, pts[1][1], pts[1][0], pts[1][1]);
        return;
      }
      const r = Math.max(2.5, 0.13 * L.s), rc = Math.max(3, 0.18 * L.s);
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i - 1], q = pts[i];
        const hops = (wr.hops || []).filter(function (h) { return h[0] === i - 1; }).map(function (h) { return P(h[1], 0)[0]; })
          .sort(function (a, b) { return (q[0] > p[0]) ? a - b : b - a; });
        hops.forEach(function (hx) {
          const dir = q[0] > p[0] ? 1 : -1;
          ctx.lineTo(hx - dir * r, p[1]);
          ctx.arc(hx, p[1], r, dir > 0 ? Math.PI : 0, dir > 0 ? 0 : Math.PI, dir < 0);
        });
        if (i < pts.length - 1) {
          const nx = pts[i + 1];
          const l1 = Math.hypot(q[0] - p[0], q[1] - p[1]), l2 = Math.hypot(nx[0] - q[0], nx[1] - q[1]);
          const rr = Math.min(rc, l1 / 2, l2 / 2);
          ctx.arcTo(q[0], q[1], nx[0], nx[1], rr);
        } else ctx.lineTo(q[0], q[1]);
      }
    };
  }
  /** 輸入開關：撥桿式，右邊＝1 */
  function drawSwitch(q, v, label, focus) {
    const s = L.s, c = P(q.x, q.y);
    const w = 0.98 * s, h = 0.52 * s, x0 = c[0] - w / 2, y0 = c[1] - h / 2;
    ctx.save();
    ctx.shadowColor = D.dark ? 'rgba(0,0,0,0.5)' : alpha(C.text, 0.2); ctx.shadowBlur = 6; ctx.shadowOffsetY = 1.5;
    D.roundRect(ctx, x0, y0, w, h, h / 2);
    const g = ctx.createLinearGradient(0, y0, 0, y0 + h);
    if (v === 1) { g.addColorStop(0, shade(C['lg-hi'], 0.2)); g.addColorStop(1, shade(C['lg-hi'], -0.15)); }
    else { g.addColorStop(0, shade(C['lg-lo'], D.dark ? -0.2 : 0.55)); g.addColorStop(1, shade(C['lg-lo'], D.dark ? -0.35 : 0.3)); }
    ctx.fillStyle = g; ctx.fill();
    ctx.restore();
    D.roundRect(ctx, x0, y0, w, h, h / 2);
    ctx.strokeStyle = alpha(v === 1 ? shade(C['lg-hi'], -0.35) : C['lg-lo'], 0.8); ctx.lineWidth = 1.1; ctx.stroke();
    ctx.font = fnt(0.3 * s, 800); ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    ctx.fillStyle = v === 1 ? '#3a2400' : alpha(C.text, 0.7);
    ctx.fillText(v === 1 ? '1' : '0', v === 1 ? x0 + h * 0.62 : x0 + w - h * 0.62, c[1] + 0.5);
    D.ball(ctx, v === 1 ? x0 + w - h / 2 : x0 + h / 2, c[1], h * 0.38, D.dark ? '#d9e2e6' : '#ffffff', { glow: 0 });
    D.haloText(ctx, label, x0 - 0.12 * s, c[1] + 0.5, C.text, 'right', 'middle', fnt(Math.max(11, 0.36 * s), 700));
    if (focus) {
      ctx.save(); ctx.strokeStyle = C.accent; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
      D.roundRect(ctx, x0 - 4, y0 - 4, w + 8, h + 8, h / 2 + 4); ctx.stroke(); ctx.restore();
    }
  }
  /** 輸出燈：1 亮起琥珀色、有光暈；0 是暗的玻璃；X 是問號 */
  function drawLamp(q, v, label, glitch) {
    const s = L.s, c = P(q.x, q.y), r = Math.max(7, 0.34 * s);
    ctx.save();
    if (v === 1) {
      const halo = ctx.createRadialGradient(c[0], c[1], r * 0.6, c[0], c[1], r * 2.4);
      halo.addColorStop(0, alpha(C['lg-hi'], D.dark ? 0.5 : 0.35)); halo.addColorStop(1, alpha(C['lg-hi'], 0));
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(c[0], c[1], r * 2.4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.shadowColor = D.dark ? 'rgba(0,0,0,0.55)' : alpha(C.text, 0.25); ctx.shadowBlur = 6; ctx.shadowOffsetY = 1.5;
    const g = ctx.createRadialGradient(c[0] - r * 0.35, c[1] - r * 0.38, r * 0.1, c[0], c[1], r);
    if (v === 1) { g.addColorStop(0, '#fffbe8'); g.addColorStop(0.35, shade(C['lg-hi'], 0.45)); g.addColorStop(1, shade(C['lg-hi'], -0.18)); }
    else { const base = v === X ? C['lg-x'] : C['lg-lo']; g.addColorStop(0, shade(base, D.dark ? 0.05 : 0.7)); g.addColorStop(1, shade(base, D.dark ? -0.45 : 0.05)); }
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c[0], c[1], r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.beginPath(); ctx.arc(c[0], c[1], r, 0, Math.PI * 2);
    ctx.strokeStyle = v === 1 ? shade(C['lg-hi'], -0.35) : alpha(C['lg-edge'], 0.55); ctx.lineWidth = 1.2; ctx.stroke();
    ctx.font = fnt(Math.max(10, 0.34 * s), 800); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = v === 1 ? '#3a2400' : (D.dark ? '#e8eef0' : '#ffffff');
    ctx.fillText(v === 1 ? '1' : v === 0 ? '0' : '?', c[0], c[1] + 0.5);
    if (glitch) {
      ctx.save(); ctx.strokeStyle = C['lg-glitch']; ctx.lineWidth = 2.2; ctx.setLineDash([3, 2.5]);
      ctx.beginPath(); ctx.arc(c[0], c[1], r + 4, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
    if (label) D.haloText(ctx, label, c[0] + r + 0.14 * s, c[1] + 0.5, C.text, 'left', 'middle', fnt(Math.max(11, 0.32 * s), 700));
  }

  // =====================================================================
  // 繪圖：電路圖模式
  // =====================================================================
  function idxOf(name) { return run.c.idx[name]; }
  function drawSchematic() {
    // 先畫 0 的線，再畫 1 的線（亮的在上面）
    const ws = L.wires.map(function (w) { return { w: w, v: w.net ? nodeVal(idxOf(w.net)) : X }; });
    ws.sort(function (a, b) { return (a.v === 1 ? 1 : 0) - (b.v === 1 ? 1 : 0); });
    ws.forEach(function (o) {
      if (o.w.loose) {
        wireStroke(wirePath(o.w), X, Math.max(2, 0.06 * L.s));
        const p = P(o.w.pts[0][0], o.w.pts[0][1]);
        D.haloText(ctx, '?', p[0] - 2, p[1], C['lg-x'], 'right', 'middle', fnt(Math.max(10, 0.3 * L.s), 800));
      } else wireStroke(wirePath(o.w), o.v);
    });
    L.dots.forEach(function (d) {
      const p = P(d.x, d.y), v = nodeVal(idxOf(d.net));
      ctx.beginPath(); ctx.arc(p[0], p[1], Math.max(2.8, 0.085 * L.s), 0, Math.PI * 2);
      ctx.fillStyle = v === 1 ? shade(C['lg-hi'], -0.05) : vcol(v); ctx.fill();
    });
    const cone = run.res ? run.res.cone.map(function (i) { return 'G' + (i + 1); }) : null;
    L.gates.forEach(function (g) {
      const gg = run.c.gates[run.c.drv[idxOf(g.name)]];
      const inV = gg.ins.map(function (s) { return s >= 0 ? nodeVal(s) : X; });
      const node = idxOf(g.name);
      const pend = pending(node) ? (run.playing ? run.t - tNow() : 1) : -1;
      drawGate(g, inV, nodeVal(node), pend, cone && cone.indexOf(g.name) < 0);
      if (st.mode === 'build') {
        const c = P(g.x, g.y - 0.55 * g.sz);
        D.haloText(ctx, g.name, c[0] - 0.15 * L.s * g.sz, c[1] - 3, C.muted, 'center', 'bottom', fnt(Math.max(10, 0.28 * L.s), 700));
      }
    });
    L.tags.forEach(function (tg) {
      const p = P(tg.x, tg.y);
      D.haloText(ctx, tg.text, p[0], p[1], nodeVal(idxOf(tg.node)) === 1 ? shade(C['lg-hi'], D.dark ? 0 : -0.3) : C.muted, 'center', 'middle', fnt(Math.max(10, 0.3 * L.s), 700));
    });
    L.inputs.forEach(function (q, k) {
      drawSwitch(q, nodeVal(idxOf(q.name)), q.label || q.name, kb && kb.focused() && kb.index() === k);
    });
    L.lamps.forEach(function (q) {
      const node = idxOf(q.node);
      drawLamp(q, nodeVal(node), q.label, inGlitch(node));
    });
  }

  // =====================================================================
  // 繪圖：多位元加法器
  // =====================================================================
  function keyCap(x, y, v, size, label, focus) {
    const c = P(x, y), w = size * L.s, h = size * L.s;
    ctx.save();
    ctx.shadowColor = D.dark ? 'rgba(0,0,0,0.5)' : alpha(C.text, 0.22); ctx.shadowBlur = 5; ctx.shadowOffsetY = 1.5;
    D.roundRect(ctx, c[0] - w / 2, c[1] - h / 2, w, h, Math.min(6, w * 0.22));
    const g = ctx.createLinearGradient(0, c[1] - h / 2, 0, c[1] + h / 2);
    const base = v === 1 ? C['lg-hi'] : (D.dark ? shade(C['lg-lo'], -0.25) : shade(C['lg-lo'], 0.7));
    g.addColorStop(0, shade(base, 0.22)); g.addColorStop(1, shade(base, -0.12));
    ctx.fillStyle = g; ctx.fill();
    ctx.restore();
    D.roundRect(ctx, c[0] - w / 2 + 0.5, c[1] - h / 2 + 0.5, w - 1, h - 1, Math.min(6, w * 0.22));
    ctx.strokeStyle = v === 1 ? shade(C['lg-hi'], -0.35) : alpha(C['lg-edge'], 0.45); ctx.lineWidth = 1; ctx.stroke();
    ctx.font = fnt(Math.max(9, 0.5 * w), 800); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = v === 1 ? '#3a2400' : C.text;
    ctx.fillText(String(v), c[0], c[1] + 0.5);
    if (label && L.s * 0.3 >= 7.5) D.haloText(ctx, label, c[0] + w / 2 + 2, c[1] - h / 2 + 1, C.muted, 'left', 'top', fnt(Math.max(8, 0.26 * L.s), 600));
    if (focus) {
      ctx.save(); ctx.strokeStyle = C.accent; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
      D.roundRect(ctx, c[0] - w / 2 - 4, c[1] - h / 2 - 4, w + 8, h + 8, 6); ctx.stroke(); ctx.restore();
    }
  }
  function drawAdder() {
    const A = st.adder, n = A.n, s = L.s;
    const info = LC.carryInfo(n, A.a, A.b, A.cin);
    const wv = Math.max(2, Math.min(3.6, 0.09 * s));
    const keySz = 0.62;
    const focusIdx = kb && kb.focused() ? kb.index() : -1;
    // 行標
    const rowF = fnt(Math.max(10, 0.34 * s), 800);
    D.haloText(ctx, 'A', P(0.55, L.yA)[0], P(0, L.yA)[1], C.text, 'center', 'middle', rowF);
    D.haloText(ctx, 'B', P(0.55, L.yB)[0], P(0, L.yB)[1], C.text, 'center', 'middle', rowF);
    D.haloText(ctx, 'S', P(0.55, L.yS)[0], P(0, L.yS)[1], C.text, 'center', 'middle', rowF);
    // 輸入位元到方塊的導線
    for (let i = 0; i < n; i++) {
      const x = L.xs[i], top = L.yC - L.bh / 2;
      const va = nodeVal(idxOf('A' + i)), vb = nodeVal(idxOf('B' + i));
      wireStroke(function () { const p = P(x - 0.36, L.yA + keySz / 2), q = P(x - 0.36, top); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); }, va, wv);
      wireStroke(function () { const p = P(x + 0.36, L.yB + keySz / 2), q = P(x + 0.36, top); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); }, vb, wv);
      // 和
      const vs = nodeVal(idxOf('S' + i));
      wireStroke(function () { const p = P(x, L.yC + L.bh / 2), q = P(x, L.yS - 0.36); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); }, vs, wv);
    }
    // 進位鏈（Cin → C1 → … → Cn）
    for (let k = 0; k <= n; k++) {
      const node = k === 0 ? idxOf('CIN') : idxOf('C' + k);
      const v = nodeVal(node);
      const xr = k === 0 ? L.cinX - 0.52 : L.xs[k - 1] - L.bw / 2;
      const xl = k === n ? L.coutX + 0.36 : L.xs[k] + L.bw / 2;
      wireStroke(function () { const p = P(xr, L.yC), q = P(xl, L.yC); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); }, v, wv * 1.15);
      if (k >= 1 && s >= 22) {
        const lx = (xr + xl) / 2;
        const lab = 'C' + k;
        D.haloText(ctx, k === n ? '' : lab, P(lx, 0)[0], P(0, L.yC - 0.22)[1], v === 1 ? shade(C['lg-hi'], D.dark ? 0 : -0.3) : C.muted, 'center', 'bottom', fnt(Math.max(9, 0.27 * s), 700));
      }
      if (k >= 1 && inGlitch(node) && !reducedMotion) {
        const p = P((xr + xl) / 2, L.yC);
        ctx.save(); ctx.strokeStyle = C['lg-glitch']; ctx.lineWidth = 2; ctx.setLineDash([3, 2]);
        ctx.beginPath(); ctx.arc(p[0], p[1], Math.max(5, 0.2 * s), 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      }
    }
    // 全加器方塊
    for (let i = 0; i < n; i++) {
      const x = L.xs[i], c = P(x, L.yC), w = L.bw * s, h = L.bh * s;
      const nodes = ['P', 'G', 'S', 'H'].map(function (p) { return idxOf(p + i); }).concat([idxOf('C' + (i + 1))]);
      let pend = -1;
      nodes.forEach(function (nd) { if (pending(nd)) pend = run.playing ? run.t - tNow() : 1; });
      D.block(ctx, c[0] - w / 2, c[1] - h / 2, w, h, C['lg-chip'], { r: Math.min(8, w * 0.14), stroke: alpha(C['lg-edge'], 0.55) });
      // 晶片的腳
      ctx.save(); ctx.fillStyle = alpha(C['lg-edge'], 0.35);
      for (let j = 0; j < 3; j++) { ctx.fillRect(c[0] - w / 2 + w * (0.22 + 0.28 * j) - 1, c[1] - h / 2 - 2, 2, 2); }
      ctx.restore();
      if (pend >= 0) {
        D.roundRect(ctx, c[0] - w / 2 - 2, c[1] - h / 2 - 2, w + 4, h + 4, Math.min(9, w * 0.16));
        ctx.strokeStyle = alpha(C.accent, 0.35 + 0.55 * pend); ctx.lineWidth = 2.4; ctx.stroke();
      }
      const fs = Math.max(8.5, 0.3 * s);
      ctx.font = fnt(fs, 800); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = alpha(C['lg-edge'], 0.85);
      ctx.fillText('FA' + i, c[0], c[1] - h * 0.2);
      // G／P／K 標籤
      const tag = info.gpk[i], col = tag === 'G' ? C['lg-gen'] : tag === 'P' ? C['lg-prop'] : C['lg-kill'];
      const tw = Math.max(14, 0.62 * s), th = Math.max(11, 0.4 * s), ty = c[1] + h * 0.2;
      D.roundRect(ctx, c[0] - tw / 2, ty - th / 2, tw, th, th / 2);
      ctx.fillStyle = alpha(col, D.dark ? 0.25 : 0.16); ctx.fill();
      ctx.strokeStyle = alpha(col, 0.7); ctx.lineWidth = 1; ctx.stroke();
      ctx.font = fnt(Math.max(8.5, 0.27 * s), 800); ctx.fillStyle = col;
      ctx.fillText(tag, c[0], ty + 0.5);
    }
    // 位元鍵與和的燈
    for (let i = 0; i < n; i++) {
      const x = L.xs[i];
      keyCap(x - 0.36, L.yA, nodeVal(idxOf('A' + i)), keySz, s >= 26 ? 'A' + i : '', focusIdx === n - 1 - i);
      keyCap(x + 0.36, L.yB, nodeVal(idxOf('B' + i)), keySz, s >= 26 ? 'B' + i : '', focusIdx === 2 * n - 1 - i);
      const sn = idxOf('S' + i);
      drawLamp({ x: x, y: L.yS }, nodeVal(sn), '', inGlitch(sn));
    }
    // Cin 開關、Cout 燈
    drawSwitch({ x: L.cinX + 0.05, y: L.yC + 0.85 }, nodeVal(idxOf('CIN')), 'Cin', focusIdx === 2 * n);
    const cinP = P(L.cinX - 0.52, L.yC), cinQ = P(L.cinX + 0.05 + 0.5, L.yC + 0.85);
    wireStroke(function () { ctx.moveTo(cinQ[0], cinQ[1]); ctx.lineTo(cinQ[0] + 0.25 * s, cinQ[1]); ctx.lineTo(cinQ[0] + 0.25 * s, cinP[1]); ctx.lineTo(cinP[0], cinP[1]); }, nodeVal(idxOf('CIN')), wv);
    const co = idxOf('C' + n);
    drawLamp({ x: L.coutX, y: L.yC }, nodeVal(co), '', inGlitch(co));
    D.haloText(ctx, 'Cout', P(L.coutX, 0)[0], P(0, L.yC + 0.42)[1] + 2, C.text, 'center', 'top', fnt(Math.max(9.5, 0.3 * s), 700));
    if (run.sim.final[co] === 1 && tNow() >= run.sim.settle && s >= 18) {
      const pf = fnt(Math.max(9.5, 0.28 * s), 700), pt = T('溢位', 'overflow');
      ctx.font = pf;
      const pw = ctx.measureText(pt).width + 12;
      // 放在 Cout 燈的正上方（B 列與燈之間的空白）；擠不下（手機的 8 位元）就不畫，讀數與算式列也會寫溢位
      const room = P(L.xs[n - 1] - L.bw / 2, 0)[0] - 4;
      const px = Math.max(3, P(L.coutX, 0)[0] - pw / 2);
      if (px + pw <= room) D.pill(ctx, pt, px, P(0, L.yC)[1] - Math.max(7, 0.34 * s) - 5, C['lg-glitch'], 'left', pf);
    }
  }

  // =====================================================================
  // 繪圖：整張畫布
  // =====================================================================
  const fx = [];   // 改變瞬間的漣漪（純裝飾）
  function draw() {
    if (!L) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    D.backdrop(ctx, cw, ch);
    D.grid(ctx, 0, HEAD - 6, cw, ch, L.s, null, L.ox, L.oy);
    if (L.adder) drawAdder(); else drawSchematic();
    // 改變瞬間的漣漪
    fx.forEach(function (f) { D.ripple(ctx, f.x, f.y, 6, f.u, f.v === 1 ? C['lg-hi'] : C['lg-lo']); });
    // 時間標籤
    const T0 = run.sim.settle;
    const fz = fnt(cw < 500 ? 11.5 : 12.5, 700);
    let txt;
    if (!run.changed) txt = T('撥動輸入，看訊號怎麼傳', 'Flip an input to watch the signals move');
    else if (T0 === 0) txt = T('t = 0：沒有任何閘需要改變', 't = 0: no gate has to change');
    else txt = 't = ' + tNow() + T(' ／ 穩定於 t = ', ' / settles at t = ') + T0 + T('（閘延遲）', ' (gate delays)');
    D.pill(ctx, txt, 8, 26, run.playing ? C.accent : C.muted, 'left', fz);
    if (kb && kb.focused()) {
      ctx.save(); ctx.strokeStyle = C.accent; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
      D.roundRect(ctx, 2, 2, cw - 4, ch - 4, 8); ctx.stroke(); ctx.restore();
    }
  }

  // =====================================================================
  // 時序圖
  // =====================================================================
  function chartRows() {
    const c = run.c, m = st.mode;
    if (!c) return [];
    if (m === 'adder') {
      const out = [];
      for (let i = 0; i < st.adder.n; i++) { out.push({ node: c.idx['S' + i], label: 'S' + i, out: true }); out.push({ node: c.idx['C' + (i + 1)], label: 'C' + (i + 1), out: i === st.adder.n - 1 }); }
      return out;
    }
    if (m === 'full') return ['A', 'B', 'CIN', 'P', 'G', 'S', 'H', 'COUT'].map(function (nm) { return { node: c.idx[nm], label: nm === 'CIN' ? 'Cin' : nm === 'COUT' ? 'Cout' : nm, out: nm === 'S' || nm === 'COUT', inp: nm === 'A' || nm === 'B' || nm === 'CIN' }; });
    return c.names.map(function (nm, i) { return { node: i, label: m === 'build' && i === c.names.length - 1 ? nm + ' = Y' : nm, out: i === c.names.length - 1 || (m === 'half' && nm !== 'A' && nm !== 'B'), inp: c.isInput[i] }; });
  }
  function chartHeight() {
    const rows = chartRows().length || 4;
    const rh = st.mode === 'adder' && st.adder.n === 8 ? 12.5 : (rows > 6 ? 16 : 20);
    return Math.round(rows * rh + 46);
  }
  function drawChart() {
    const w = cw2, h = ch2, narrow = w < 600;
    ctx2.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx2.clearRect(0, 0, w, h);
    D.backdrop(ctx2, w, h);
    const rows = chartRows();
    if (!rows.length) return;
    const ml = narrow ? 52 : 64, mr = 14, mt = 24, mb = 20;
    const pw = w - ml - mr, ph = h - mt - mb, rh = ph / rows.length;
    const tMax = Math.max(3, run.maxDepth, run.sim.settle) + 1;
    const Xp = function (t) { return ml + t / tMax * pw; };
    ctx2.save();
    ctx2.font = fnt(narrow ? 10 : 11, 500);
    ctx2.textAlign = 'center'; ctx2.textBaseline = 'top';
    const every = pw / tMax < 16 ? 2 : 1;
    for (let t = 0; t <= tMax; t++) {
      const x = Math.round(Xp(t)) + 0.5;
      ctx2.strokeStyle = alpha(C.text, t === 0 ? 0.22 : 0.07); ctx2.lineWidth = 1;
      ctx2.beginPath(); ctx2.moveTo(x, mt); ctx2.lineTo(x, mt + ph); ctx2.stroke();
      if (t % every === 0) { ctx2.fillStyle = C.muted; ctx2.fillText(String(t), x, mt + ph + 4); }
    }
    ctx2.restore();
    // 最長路徑（虛線）與橫軸名稱：兩個標籤放在同一行，量寬度避免重疊；放不下時省略橫軸名稱（圖下的說明已寫）
    const xd = Xp(run.maxDepth);
    ctx2.save(); ctx2.strokeStyle = alpha(C['lg-prop'], 0.8); ctx2.lineWidth = 1.4; ctx2.setLineDash([4, 3]);
    ctx2.beginPath(); ctx2.moveTo(xd, mt - 2); ctx2.lineTo(xd, mt + ph); ctx2.stroke(); ctx2.restore();
    const capTxt = T('t（閘延遲）→', 't (gate delays) →'), capF = fnt(narrow ? 10 : 11, 500);
    const labTxt = (st.mode === 'adder' ? '2n + 1 = ' : T('最長路徑 ', 'longest path ')) + run.maxDepth, labF = fnt(narrow ? 10 : 11, 700);
    ctx2.font = capF; const capW = ctx2.measureText(capTxt).width;
    ctx2.font = labF; const labW = ctx2.measureText(labTxt).width;
    const capX0 = ml + pw - capW;
    let lx = xd + 5, la = 'left', showCap = true;
    if (lx + labW > capX0 - 8) {
      lx = xd - 5; la = 'right';
      if (lx > capX0 - 8 || lx - labW < 4) showCap = false;
      if (lx - labW < 4) { lx = Math.min(xd + 5, w - mr - labW); la = 'left'; }
    }
    if (showCap) D.haloText(ctx2, capTxt, ml + pw, mt - 6, C.muted, 'right', 'bottom', capF);
    D.haloText(ctx2, labTxt, lx, mt - 6, C['lg-prop'], la, 'bottom', labF);
    // 每一列
    rows.forEach(function (r, i) {
      const y0 = mt + i * rh, yHi = y0 + rh * 0.2, yLo = y0 + rh * 0.82;
      const h0 = run.sim.hist[r.node];
      if (h0.length >= 2) {
        ctx2.fillStyle = alpha(C['lg-glitch'], D.dark ? 0.2 : 0.12);
        ctx2.fillRect(Xp(h0[0][0]), y0 + 1, Xp(h0[h0.length - 1][0]) - Xp(h0[0][0]), rh - 2);
      }
      if (i % 2 === 1) { ctx2.fillStyle = alpha(C.text, 0.025); ctx2.fillRect(ml, y0, pw, rh); }
      D.haloText(ctx2, r.label, ml - 6, y0 + rh / 2 + 0.5, r.out ? C.text : C.muted, 'right', 'middle', fnt(Math.min(11.5, rh * 0.75 + 2), r.out ? 700 : 500));
      // 波形
      const seg = [];
      let v = run.sim.init[r.node], t0 = 0;
      h0.forEach(function (e) { seg.push([t0, e[0], v]); v = e[1]; t0 = e[0]; });
      seg.push([t0, tMax, v]);
      seg.forEach(function (sg) {
        const xa = Xp(sg[0]), xb = Xp(sg[1]);
        if (sg[2] === 1) { ctx2.fillStyle = alpha(C['lg-hi'], r.out ? (D.dark ? 0.34 : 0.28) : (D.dark ? 0.2 : 0.14)); ctx2.fillRect(xa, yHi, xb - xa, yLo - yHi); }
        if (sg[2] === X) {
          ctx2.save(); ctx2.beginPath(); ctx2.rect(xa, yHi, xb - xa, yLo - yHi); ctx2.clip();
          ctx2.strokeStyle = alpha(C['lg-x'], 0.6); ctx2.lineWidth = 1;
          for (let q = xa - rh; q < xb; q += 5) { ctx2.beginPath(); ctx2.moveTo(q, yLo); ctx2.lineTo(q + (yLo - yHi), yHi); ctx2.stroke(); }
          ctx2.restore();
        }
      });
      ctx2.save(); ctx2.lineJoin = 'round'; ctx2.lineCap = 'round';
      ctx2.beginPath();
      seg.forEach(function (sg, k) {
        const y = sg[2] === 1 ? yHi : sg[2] === 0 ? yLo : (yHi + yLo) / 2;
        if (k === 0) ctx2.moveTo(Xp(sg[0]), y); else ctx2.lineTo(Xp(sg[0]), y);
        ctx2.lineTo(Xp(sg[1]), y);
      });
      const allX = seg.every(function (sg) { return sg[2] === X; });
      if (allX) { ctx2.setLineDash([4, 3]); ctx2.strokeStyle = C['lg-x']; }
      else ctx2.strokeStyle = r.out ? alpha(C.text, 0.92) : alpha(C.text, 0.55);
      ctx2.lineWidth = r.out ? 2 : 1.5; ctx2.stroke();
      ctx2.restore();
    });
    // 目前時間的游標
    if (run.changed && run.sim.settle > 0) {
      const xc = Xp(run.t);
      ctx2.save(); ctx2.strokeStyle = C.accent; ctx2.lineWidth = 2;
      ctx2.beginPath(); ctx2.moveTo(xc, mt - 2); ctx2.lineTo(xc, mt + ph + 2); ctx2.stroke(); ctx2.restore();
      D.ball(ctx2, xc, mt - 2, 3.5, C.accent, { shadow: false, glow: 0 });
    }
  }

  // =====================================================================
  // 動畫迴圈
  // =====================================================================
  let raf = 0, lastFrame = 0;
  function frame(now) {
    raf = 0;
    const dt = lastFrame ? Math.min(1 / 30, (now - lastFrame) / 1000) : 1 / 60;
    lastFrame = now;
    if (run.playing) {
      const prev = tNow();
      run.t = Math.min(run.sim.settle, run.t + dt * st.speed);
      for (let k = prev + 1; k <= tNow(); k++) onTick(k);
      if (run.t >= run.sim.settle - 1e-9) { run.t = run.sim.settle; run.playing = false; onSettled(); }
    }
    for (let i = fx.length - 1; i >= 0; i--) { fx[i].u += dt / 0.35; if (fx[i].u > 1) fx.splice(i, 1); }
    if (layoutDirty) { resize(); }
    draw();
    drawChart();
    if (run.playing || fx.length) requestDraw(); else lastFrame = 0;
  }
  function requestDraw() { if (!raf) raf = requestAnimationFrame(frame); }

  /** 時間走到整數 k：音效與漣漪 */
  function onTick(k) {
    const changed = [];
    run.sim.hist.forEach(function (h, node) { h.forEach(function (e) { if (e[0] === k) changed.push([node, e[1]]); }); });
    if (!reducedMotion && L) changed.forEach(function (cg) {
      const p = nodePoint(cg[0]);
      if (p) fx.push({ x: p[0], y: p[1], u: 0, v: cg[1] });
    });
    tickSound(k, changed);
  }
  /** 節點在畫面上的位置（漣漪用） */
  function nodePoint(node) {
    const name = run.c.names[node];
    if (L.adder) {
      let m = /^C(\d+)$/.exec(name);
      if (m) { const k = +m[1]; const xr = L.xs[k - 1] - L.bw / 2; return P(xr - 0.08, L.yC); }
      m = /^S(\d+)$/.exec(name);
      if (m) return P(L.xs[+m[1]], L.yS);
      return null;
    }
    const g = L.gates.filter(function (q) { return q.name === name; })[0];
    return g ? P.apply(null, pinOut(g)) : null;
  }
  function onSettled() {
    settledSay();
    settleSound();
    updateAll();
    requestDraw();
  }
  function settledSay() {
    if (!run.changed) return;
    const s = run.sim, glitches = countGlitches();
    if (s.settle === 0) { say(T('輸入改了，但沒有任何閘需要改變輸出。', 'The inputs changed, but no gate had to change its output.')); return; }
    say(T('穩定了：花了 ', 'Settled after ') + gd(s.settle) +
      (glitches ? T('；途中有 ', '; ') + glitches + T(' 條導線出現突波。', (glitches > 1 ? ' wires' : ' wire') + ' glitched on the way.') : T('。', '.')));
  }
  function countGlitches() {
    let g = 0;
    run.sim.hist.forEach(function (h, node) { if (!run.c.isInput[node] && h.length >= 2) g++; });
    return g;
  }

  // =====================================================================
  // 音效（預設關閉；比較密時節流）
  // =====================================================================
  function sound() { const S = window.LabSound; return S && S.enabled() ? S : null; }
  let lastTickT = 0;
  function clickSound() { const S = sound(); if (S) S.tone({ freq: 1250, dur: 0.025, type: 'square', gain: 0.045 }); }
  function tickSound(k, changed) {
    const S = sound(); if (!S || !changed.length) return;
    const now = performance.now();
    if (now - lastTickT < 35) return;
    lastTickT = now;
    let carry = -1, up = 0;
    changed.forEach(function (cg) {
      const m = /^C(\d+)$/.exec(run.c.names[cg[0]]);
      if (m) carry = Math.max(carry, +m[1]);
      if (cg[1] === 1) up++;
    });
    if (carry >= 0) S.tone({ freq: 392 * Math.pow(2, carry / Math.max(4, st.adder.n) * 1.5), dur: 0.07, type: 'triangle', gain: 0.16 });
    else S.tone({ freq: up ? 660 : 494, dur: 0.05, type: 'sine', gain: 0.12 });
  }
  function settleSound() {
    const S = sound(); if (!S || !run.changed || !run.sim.settle) return;
    S.tone({ freq: 784, dur: 0.12, type: 'sine', gain: 0.16 });
    S.tone({ freq: 1047, dur: 0.18, type: 'sine', gain: 0.14, delay: 0.09 });
    if (st.mode === 'adder' && run.sim.final[run.c.idx['C' + st.adder.n]] === 1) S.tone({ freq: 330, dur: 0.2, type: 'triangle', gain: 0.18, delay: 0.25 });
  }
  function matchChime() {
    const S = sound(); if (!S) return;
    S.tone({ freq: 659.25, dur: 0.14, type: 'sine', gain: 0.22 });
    S.tone({ freq: 987.77, dur: 0.22, type: 'sine', gain: 0.2, delay: 0.1 });
  }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  $('soundBtn').addEventListener('click', function () {
    if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound'));
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'sound') updateSoundButton(); });

  // =====================================================================
  // 讀數、算式、表格
  // =====================================================================
  let sayTimer = 0;
  function say(msg) {
    const el = $('status');
    clearTimeout(sayTimer);
    sayTimer = setTimeout(function () { el.textContent = msg || ''; }, 30);
  }
  let eqKey = '';
  function setEq(tex) {
    if (tex === eqKey) return;
    eqKey = tex;
    const el = $('rEq');
    if (window.katex) { try { window.katex.render(tex, el, { throwOnError: false, displayMode: true }); } catch (e) { el.textContent = tex; } }
    else el.textContent = tex;
  }
  function row(dt, dd) { return '<dt>' + dt + '</dt><dd>' + dd + '</dd>'; }
  function vtxt(v) { return v === X ? 'X' : String(v); }
  function finalOf(name) { return run.sim.final[run.c.idx[name]]; }
  function settleTxt() {
    if (!run.changed) return '—';
    return gd(run.sim.settle) + ' <small>' + T('（最長路徑 ', '(longest path ') + run.maxDepth + T('）', ')') + '</small>';
  }
  function updateReadouts() {
    const m = st.mode, ro = $('ro');
    let h = '';
    if (m === 'gate') {
      const g = st.gate, two = LC.GATES[g.type].arity === 2, y = finalOf('Y');
      h += row(T('閘', 'Gate'), g.type + T('（' + ZH_GATE[g.type] + '）', ''));
      h += row(T('輸入', 'Inputs'), 'A = ' + g.a + (two ? '，B = '.replace('，', T('，', ', ')) + g.b : ''));
      h += row(T('輸出 Y', 'Output Y'), '<b>' + y + '</b>');
      if (g.nand && NAND_DEMO[g.type]) h += row(T('用了幾個 NAND', 'NAND gates used'), String(run.c.gates.length));
      h += row(T('穩定所需時間', 'Time to settle'), settleTxt());
      const sub = GATE_TEX[g.type].replace(/A/g, String(g.a)).replace(/B/g, String(g.b));
      setEq('Y = ' + GATE_TEX[g.type] + ' = ' + sub + ' = ' + y);
    } else if (m === 'build') {
      const r = run.res, b = st.build, tm = LC.TARGETS[b.target];
      const best = minCount(b.type, tm);
      h += row(T('用到的閘', 'Gates used'), r.count + ' ' + b.type + ' <small>' + T('（共 ' + b.k + ' 個）', '(of ' + b.k + ')') + '</small>');
      h += row(T('最長路徑', 'Longest path'), r.tt ? gd(r.depth) : '—');
      h += row(T('你的電路', 'Your circuit'), r.tt ? funcName(r.mask) : T('還有腳沒接好（X）', 'some pins are not connected (X)'));
      h += row(T('目標', 'Target'), targetName(b.target) + ' <small>' + T('（最少 ' + best + ' 個 ' + b.type + '）', '(fewest: ' + best + ' ' + b.type + ')') + '</small>');
      h += row(T('相符嗎', 'Match?'), r.tt ? (r.mask === tm ? '<b style="color:var(--lg-gen)">' + T('相符 ✓', 'yes ✓') + '</b>' : T('還不相符', 'not yet')) : '—');
      setEq(r.tt ? 'Y = ' + LC.FUNCS[r.mask].tex : 'Y = \\;?');
    } else if (m === 'half') {
      const a = st.half.a, b = st.half.b, s = finalOf('S'), c = finalOf('C');
      h += row('A + B', a + ' + ' + b + ' = ' + (a + b));
      h += row(T('進位 C、和 S', 'Carry C, sum S'), 'C = ' + c + '，S = '.replace('，', T('，', ', ')) + s);
      h += row(T('二進位 CS', 'Binary CS'), '<b>' + c + s + '</b><small>' + T('（= ' + (2 * c + s) + '）', ' (= ' + (2 * c + s) + ')') + '</small>');
      h += row(T('穩定所需時間', 'Time to settle'), settleTxt());
      setEq(a + ' + ' + b + ' = ' + c + s + '_{2} \\quad (C = ' + c + ',\\ S = ' + s + ')');
    } else if (m === 'full') {
      const f = st.full, s = finalOf('S'), co = finalOf('COUT');
      const gl = run.changed ? countGlitches() : 0;
      h += row('A + B + Cin', f.a + ' + ' + f.b + ' + ' + f.cin + ' = ' + (f.a + f.b + f.cin));
      h += row(T('二進位 Cout S', 'Binary Cout S'), '<b>' + co + s + '</b>');
      h += row(T('P = A ⊕ B（傳遞）', 'P = A ⊕ B (propagate)'), String(finalOf('P')));
      h += row(T('G = A · B（產生）', 'G = A · B (generate)'), String(finalOf('G')));
      h += row(T('穩定所需時間', 'Time to settle'), settleTxt());
      h += row(T('突波', 'Glitches'), run.changed ? (gl ? '<b style="color:var(--lg-glitch)">' + gl + T(' 條導線', gl > 1 ? ' wires' : ' wire') + '</b>' : T('沒有', 'none')) : '—');
      setEq(f.a + ' + ' + f.b + ' + ' + f.cin + ' = ' + co + s + '_{2}');
    } else {
      const A = st.adder, n = A.n, M = Math.pow(2, n);
      const res = LC.adderRead(run.c, run.sim.final), info = LC.carryInfo(n, A.a, A.b, A.cin);
      const sum = A.a + A.b + A.cin, V = LC.overflowV(n, A.a, A.b, A.cin);
      h += row('A', A.a + ' <small>(' + bitStr(A.a, n) + ')</small>');
      h += row('B', A.b + ' <small>(' + bitStr(A.b, n) + ')</small>');
      h += row(T('和 S', 'Sum S'), '<b>' + res.s + '</b> <small>(' + bitStr(res.s, n) + ')</small>');
      h += row(T('最高位進位 Cout', 'Carry out Cout'), res.cout ? '<b style="color:var(--lg-glitch)">1 ' + T('溢位', 'overflow') + '</b>' : '0');
      h += row(T('真正的和 A + B + Cin', 'True sum A + B + Cin'), sum + (sum >= M ? ' <small>' + T('（超過 ' + (M - 1) + '）', '(over ' + (M - 1) + ')') + '</small>' : ''));
      if (A.signed) {
        const sa = LC.signedOf(A.a, n), sb = LC.signedOf(A.b, n), ss = LC.signedOf(res.s, n);
        h += row(T('有號：A + B + Cin', 'Signed: A + B + Cin'), minus(sa) + ' + ' + minus(sb) + ' + ' + A.cin + ' → ' + minus(ss));
        h += row(T('有號溢位 V = C<sub>n</sub> ⊕ C<sub>n−1</sub>', 'Signed overflow V = C<sub>n</sub> ⊕ C<sub>n−1</sub>'), V ? '<b style="color:var(--lg-glitch)">1</b>' : '0');
      }
      h += row(T('穩定所需時間', 'Time to settle'), run.changed ? gd(run.sim.settle) + ' <small>' + T('（最壞 2n + 1 = ', '(worst 2n + 1 = ') + (2 * n + 1) + T('）', ')') + '</small>' : '—');
      h += row(T('進位傳最遠', 'Longest carry run'), info.chain + T(' 位', info.chain === 1 ? ' bit' : ' bits'));
      h += row(T('突波', 'Glitches'), run.changed ? (countGlitches() ? '<b style="color:var(--lg-glitch)">' + countGlitches() + T(' 條導線', ' wires') + '</b>' : T('沒有', 'none')) : '—');
      setEq(A.a + ' + ' + A.b + ' + ' + A.cin + ' = ' + sum + ' = ' + (res.cout ? '\\color{#c2187a}{1}\\,' : '') + bitStr(res.s, n) + '_{2}');
    }
    ro.innerHTML = h;
  }
  const minCache = {};
  function minCount(type, mask) { const key = type + mask; if (minCache[key] == null) minCache[key] = LC.minGates(type, mask, 6).k; return minCache[key]; }
  function targetName(t) { return t === 'NOT' ? 'NOT A' : t; }
  function funcName(mask) {
    const f = LC.FUNCS[mask];
    const names = { 0: T('永遠 0', 'always 0'), 15: T('永遠 1', 'always 1'), 12: T('等於 A', 'equals A'), 10: T('等於 B', 'equals B'), 3: 'NOT A', 5: 'NOT B' };
    return names[mask] || f.name;
  }
  function updateSumline() {
    const el = $('sumline');
    if (st.mode !== 'adder') { el.innerHTML = ''; return; }
    const A = st.adder, n = A.n, res = LC.adderRead(run.c, run.sim.final);
    el.innerHTML = '<code>' + bitStr(A.a, n) + '</code> + <code>' + bitStr(A.b, n) + '</code>' + (A.cin ? ' + 1' : '') + ' = ' +
      (res.cout ? '<span class="co">1</span>' : '') + '<code>' + bitStr(res.s, n) + '</code>' +
      ' <span style="color:var(--muted)">（'.replace('（', T('（', '(')) + A.a + ' + ' + A.b + (A.cin ? ' + 1' : '') + ' = ' + (A.a + A.b + A.cin) +
      (res.cout ? T('，但 ' + n + ' 位元只留下 ' + res.s, '; with ' + n + ' bits only ' + res.s + ' is left') : '') + T('）', ')') + '</span>';
  }
  function td(v, cls) { return '<td class="' + (cls || '') + (v === 1 ? ' one' : v === 0 ? ' zero' : '') + '">' + vtxt(v) + '</td>'; }
  function updateTable() {
    const m = st.mode, tb = $('tbl');
    let h = '', cap = '', title = T('真值表', 'Truth table');
    if (m === 'gate') {
      const g = st.gate, cols = ['AND', 'OR', 'NAND', 'NOR', 'XOR', 'XNOR', 'NOT'];
      const seen = g.seen[g.type] || {};
      h = '<thead><tr><th>' + T('試過', 'Tried') + '</th><th>A</th><th>B</th>' + cols.map(function (c) { return '<th class="' + (c === g.type ? 'sel' : '') + '">' + (c === 'NOT' ? 'NOT A' : c) + '</th>'; }).join('') + '</tr></thead><tbody>';
      for (let r = 0; r < 4; r++) {
        const a = r >> 1, b = r & 1, cur = a === g.a && (b === g.b || g.type === 'NOT');
        h += '<tr class="' + (cur ? 'cur' : '') + '"><td class="ok">' + (seen[g.type === 'NOT' ? a : r] ? '✓' : '') + '</td><td>' + a + '</td><td>' + b + '</td>' +
          cols.map(function (c) { return td(c === 'NOT' ? LC.evalGate('NOT', a) : LC.evalGate(c, a, b), c === g.type ? 'sel' : ''); }).join('') + '</tr>';
      }
      h += '</tbody>';
      title = T('七種閘的真值表', 'Truth table of all seven gates');
      cap = T('亮起的列是目前的輸入；✓ 是你用目前這種閘實際撥過的輸入組合。', 'The highlighted row is the current input; ✓ marks the inputs you have actually tried with the selected gate.');
    } else if (m === 'build') {
      const r = run.res, tm = LC.maskTT(LC.TARGETS[st.build.target]);
      let ok = 0;
      h = '<thead><tr><th>A</th><th>B</th><th>' + T('你的 Y', 'Your Y') + '</th><th>' + T('目標', 'Target') + '</th><th></th></tr></thead><tbody>';
      for (let k = 0; k < 4; k++) {
        const a = k >> 1, b = k & 1, y = LC.steady(r.c, [a, b])[r.out];
        const good = y === tm[k];
        if (good) ok++;
        h += '<tr class="' + (a === st.build.a && b === st.build.b ? 'cur' : '') + '"><td>' + a + '</td><td>' + b + '</td>' + td(y) + td(tm[k]) + '<td class="' + (good ? 'ok' : 'bad') + '">' + (good ? '✓' : '✗') + '</td></tr>';
      }
      h += '</tbody>';
      title = T('你的電路 vs. 目標', 'Your circuit vs. the target');
      cap = T('四列都打勾才算拼對（' + ok + '／4）。', 'All four rows must be ticked (' + ok + '/4).');
    } else if (m === 'half') {
      h = '<thead><tr><th>A</th><th>B</th><th>C</th><th>S</th><th>A + B</th></tr></thead><tbody>';
      for (let k = 0; k < 4; k++) {
        const a = k >> 1, b = k & 1;
        h += '<tr class="' + (a === st.half.a && b === st.half.b ? 'cur' : '') + '"><td>' + a + '</td><td>' + b + '</td>' + td(a & b) + td(a ^ b) + '<td>' + (a + b) + '</td></tr>';
      }
      h += '</tbody>';
      cap = T('C 和 S 合起來就是 A + B 的二進位。', 'C and S together are A + B in binary.');
    } else if (m === 'full') {
      h = '<thead><tr><th>A</th><th>B</th><th>Cin</th><th>Cout</th><th>S</th><th>' + T('和', 'Sum') + '</th></tr></thead><tbody>';
      for (let k = 0; k < 8; k++) {
        const a = k >> 2 & 1, b = k >> 1 & 1, ci = k & 1, sum = a + b + ci;
        h += '<tr class="' + (a === st.full.a && b === st.full.b && ci === st.full.cin ? 'cur' : '') + '"><td>' + a + '</td><td>' + b + '</td><td>' + ci + '</td>' + td(sum >> 1) + td(sum & 1) + '<td>' + sum + '</td></tr>';
      }
      h += '</tbody>';
      cap = T('Cout 是「三個裡至少兩個是 1」，S 是「1 的個數是奇數」。', 'Cout is “at least two of the three are 1”; S is “an odd number of 1s”.');
    } else {
      const log = st.adder.log.slice(-8).reverse();
      title = T('計算紀錄', 'Calculation log');
      if (!log.length) { h = ''; cap = T('每次改變輸入，這裡記下一筆。', 'Every change of the inputs is logged here.'); }
      else {
        h = '<thead><tr><th>#</th><th>' + T('位元', 'Bits') + '</th><th>A + B + Cin</th><th>S</th><th>Cout</th><th>' + T('延遲', 'Delay') + '</th></tr></thead><tbody>';
        log.forEach(function (e) {
          h += '<tr><td>' + e.k + '</td><td>' + e.n + '</td><td>' + e.a + ' + ' + e.b + ' + ' + e.cin + '</td><td>' + e.s + '</td>' + td(e.cout) + '<td>' + e.settle + '</td></tr>';
        });
        h += '</tbody>';
        cap = T('延遲以閘延遲為單位；最多列出最近 8 筆。', 'Delays are in gate delays; the latest 8 are shown.');
      }
    }
    tb.innerHTML = h;
    $('tblTitle').textContent = title;
    $('tblCap').textContent = cap;
  }
  function updateAll() { updateReadouts(); updateTable(); updateSumline(); }

  // =====================================================================
  // 任務模式：回報
  // =====================================================================
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  function emitMode(src) {
    const m = st.mode;
    if (m === 'gate') {
      const g = st.gate;
      emit('gate', { src: src, gate: g.type, a: g.a, b: LC.GATES[g.type].arity === 2 ? g.b : null, out: finalOf('Y'), nand: !!(g.nand && NAND_DEMO[g.type]) });
    } else if (m === 'build') {
      const r = run.res, b = st.build;
      emit('build', { src: src, type: b.type, k: b.k, count: r.count, depth: r.depth, mask: r.tt ? r.mask : -1, target: b.target, match: !!r.tt && r.mask === LC.TARGETS[b.target] });
    } else if (m === 'half') {
      emit('half', { src: src, a: st.half.a, b: st.half.b, s: finalOf('S'), c: finalOf('C'), settle: run.sim.settle });
    } else if (m === 'full') {
      const f = st.full;
      emit('full', { src: src, a: f.a, b: f.b, cin: f.cin, s: finalOf('S'), cout: finalOf('COUT'), settle: run.sim.settle, glitch: LC.glitchy(run.sim, run.c.idx.COUT) });
    } else {
      emit('adder', adderEvent(src));
    }
  }
  function adderEvent(src) {
    const A = st.adder, n = A.n, res = LC.adderRead(run.c, run.sim.final), info = LC.carryInfo(n, A.a, A.b, A.cin);
    let maxFlips = 0;
    for (let i = 0; i < n; i++) maxFlips = Math.max(maxFlips, LC.flips(run.sim, run.c.idx['S' + i]));
    maxFlips = Math.max(maxFlips, LC.flips(run.sim, run.c.idx['C' + n]));
    return { src: src, n: n, a: A.a, b: A.b, cin: A.cin, s: res.s, cout: res.cout, sum: A.a + A.b + A.cin, signed: A.signed,
      sa: LC.signedOf(A.a, n), sb: LC.signedOf(A.b, n), ss: LC.signedOf(res.s, n), v: LC.overflowV(n, A.a, A.b, A.cin),
      settle: run.sim.settle, chain: info.chain, maxFlips: maxFlips, prev: prevAdder() };
  }
  /** 這次改變之前的 A、B、Cin（輸入向量的順序：A0…、B0…、Cin） */
  function prevAdder() {
    const n = st.adder.n, v = run.prevIn || run.inVals;
    let a = 0, b = 0;
    for (let i = 0; i < n; i++) { a |= (v[i] ? 1 : 0) << i; b |= (v[n + i] ? 1 : 0) << i; }
    return { a: a, b: b, cin: v[2 * n] ? 1 : 0 };
  }
  /** 單步時回報：每個輸出在「改變前、現在、最後」的值 */
  function emitStep() {
    const outs = {};
    const names = st.mode === 'gate' ? ['Y'] : st.mode === 'build' ? ['G' + st.build.k] : st.mode === 'half' ? ['S', 'C'] : st.mode === 'full' ? ['S', 'COUT'] : null;
    const list = names || (function () { const a = []; for (let i = 0; i < st.adder.n; i++) a.push('S' + i); a.push('C' + st.adder.n); return a; })();
    list.forEach(function (nm) {
      const node = run.c.idx[nm];
      outs[nm === 'G' + st.build.k && st.mode === 'build' ? 'Y' : nm] = { v0: run.sim.init[node], v: nodeVal(node), v1: run.sim.final[node] };
    });
    const d = { mode: st.mode, t: tNow(), settle: run.sim.settle, outs: outs, auto: st.auto };
    if (st.mode === 'build') { d.mask = run.res.tt ? run.res.mask : -1; d.type = st.build.type; }
    emit('step', d);
  }

  // =====================================================================
  // 控制項
  // =====================================================================
  function setMode(m) {
    if (m === st.mode) return;
    st.mode = m;
    document.querySelectorAll('.modes button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.mode === m)); });
    document.querySelectorAll('[data-modes]').forEach(function (el) { el.hidden = el.dataset.modes.split(' ').indexOf(m) < 0; });
    rebuild();
    rebuildKeys();
    refreshInputs();
    updateAll();
    say('');
    eqKey = '';
    resize();
  }
  document.querySelectorAll('.modes button').forEach(function (b) { b.addEventListener('click', function () { setMode(b.dataset.mode); }); });

  /** 依狀態更新所有開關、位元按鈕的樣子 */
  function refreshInputs() {
    document.querySelectorAll('.tog[data-in]').forEach(function (b) {
      const p = b.dataset.in.split(':'), v = st[p[0]][p[1]];
      b.setAttribute('aria-pressed', String(v === 1));
      b.querySelector('.v').textContent = String(v);
    });
    const bBtn = document.querySelector('.tog[data-in="gate:b"]');
    bBtn.disabled = st.gate.type === 'NOT';
    document.querySelectorAll('.gsel button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.gate === st.gate.type)); });
    document.querySelectorAll('[data-utype]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.utype === st.build.type)); });
    document.querySelectorAll('[data-width]').forEach(function (b) { b.setAttribute('aria-pressed', String(+b.dataset.width === st.adder.n)); });
    refreshBits();
  }
  function flip(mode, key, src) {
    st[mode][key] = st[mode][key] ? 0 : 1;
    if (mode === 'gate') markSeen();
    if (mode === 'adder') { syncAdderSliders(); logAdder(); }
    refreshInputs();
    applyInputs();
    if (mode === 'adder') { logAdder(true); updateTable(); }
    emitMode(src || 'toggle');
  }
  document.querySelectorAll('.tog[data-in]').forEach(function (b) {
    b.addEventListener('click', function () { const p = b.dataset.in.split(':'); flip(p[0], p[1], 'toggle'); });
  });

  // ---------- 邏輯閘 ----------
  function markSeen() {
    const g = st.gate;
    const s = g.seen[g.type] = g.seen[g.type] || {};
    s[g.type === 'NOT' ? g.a : g.a * 2 + g.b] = true;
  }
  document.querySelectorAll('.gsel button').forEach(function (b) {
    b.addEventListener('click', function () {
      if (st.gate.type === b.dataset.gate) return;
      st.gate.type = b.dataset.gate;
      rebuild(); rebuildKeys(); refreshInputs(); markSeen(); updateAll(); resize();
      say(T('換成 ', 'Switched to ') + st.gate.type + T('（' + ZH_GATE[st.gate.type] + '）。', '.'));
      emitMode('gate');
    });
  });
  $('nandView').addEventListener('change', function () {
    st.gate.nand = $('nandView').checked;
    rebuild(); rebuildKeys(); updateAll(); resize();
    if (st.gate.nand && !NAND_DEMO[st.gate.type]) say(T(st.gate.type + ' 的 NAND 接法留給你：到「萬用閘拼圖」試試看。', 'The NAND version of ' + st.gate.type + ' is left for you: try it in the “Universal-gate puzzle”.'));
  });

  // ---------- 萬用閘拼圖 ----------
  const elK = $('kk');
  function srcLabel(s) { return s === null ? '—' : typeof s === 'number' ? 'G' + (s + 1) : s; }
  function renderWires() {
    const b = st.build, box = $('wires');
    let h = '';
    for (let i = 0; i < b.k; i++) {
      const opts = [null, 'A', 'B'];
      for (let j = 0; j < i; j++) opts.push(j);
      const sel = function (pin) {
        const cur = b.conns[i][pin];
        return '<select data-g="' + i + '" data-pin="' + pin + '" aria-label="' + T('G' + (i + 1) + ' 的第 ' + (pin + 1) + ' 個輸入', 'Input ' + (pin + 1) + ' of G' + (i + 1)) + '">' +
          opts.map(function (o) { const v = o === null ? '' : String(o); return '<option value="' + v + '"' + (o === cur ? ' selected' : '') + '>' + (o === null ? T('沒接', 'none') : srcLabel(o)) + '</option>'; }).join('') + '</select>';
      };
      h += '<div class="wire-row" data-row="' + i + '"><span class="gl">G' + (i + 1) + ' <i>= ' + b.type + '</i></span>' + sel(0) + sel(1) + '<span class="pr" data-out="' + i + '"></span></div>';
    }
    box.innerHTML = h;
    box.querySelectorAll('select').forEach(function (s) {
      s.addEventListener('change', function () {
        const i = +s.dataset.g, pin = +s.dataset.pin, v = s.value;
        b.conns[i][pin] = v === '' ? null : (v === 'A' || v === 'B' ? v : +v);
        builderChanged('wire');
      });
    });
    refreshWireRows();
  }
  function refreshWireRows() {
    if (!run.res || st.mode !== 'build') return;
    const cone = run.res.cone;
    document.querySelectorAll('#wires .wire-row').forEach(function (r) {
      const i = +r.dataset.row;
      r.classList.toggle('off', cone.indexOf(i) < 0);
      const node = run.c.idx['G' + (i + 1)];
      r.querySelector('.pr').textContent = node != null ? '→ ' + vtxt(run.sim.final[node]) : '';
    });
  }
  /** 拼圖的接線、閘數、種類改變（結構改變） */
  function builderChanged(src) {
    const b = st.build;
    rebuild();
    rebuildKeys();
    refreshWireRows();
    updateAll();
    resize();
    const r = run.res, match = !!r.tt && r.mask === LC.TARGETS[b.target];
    if (match && !b.matched) { matchChime(); say(T('拼對了！你的電路和目標 ' + targetName(b.target) + ' 的真值表完全一樣。', 'Got it! Your circuit has exactly the truth table of ' + targetName(b.target) + '.')); }
    else if (r.tt) say(T('你的電路現在是 ', 'Your circuit is now ') + funcName(r.mask) + T('。', '.'));
    else say(T('還有用到的閘沒接好，輸出是未知 X。', 'A gate in use still has a pin unconnected, so the output is unknown (X).'));
    b.matched = match;
    emitMode(src);
  }
  elK.addEventListener('input', function () {
    const k = Math.round(val(elK));
    $('kko').textContent = String(k);
    if (k === st.build.k) return;
    st.build.k = k;
    renderWires();
    builderChanged('count');
  });
  document.querySelectorAll('[data-utype]').forEach(function (bt) {
    bt.addEventListener('click', function () {
      if (st.build.type === bt.dataset.utype) return;
      st.build.type = bt.dataset.utype;
      refreshInputs();
      renderWires();
      builderChanged('type');
    });
  });
  $('target').addEventListener('change', function () { st.build.target = $('target').value; st.build.matched = false; builderChanged('target'); });
  $('unwire').addEventListener('click', function () {
    st.build.conns.forEach(function (pr) { pr[0] = null; pr[1] = null; });
    renderWires();
    builderChanged('unwire');
  });

  // ---------- 多位元加法器 ----------
  const elA = $('av'), elB = $('bv');
  function refreshBits() {
    const A = st.adder, n = A.n;
    ['a', 'b'].forEach(function (which) {
      const box = $(which + 'Bits');
      const v = A[which];
      if (box.childElementCount !== n) {
        let h = '';
        for (let i = n - 1; i >= 0; i--) h += '<button type="button" data-bit="' + which + i + '" aria-pressed="false"><b>0</b><small>' + which.toUpperCase() + i + '</small></button>';
        box.innerHTML = h;
        box.querySelectorAll('button').forEach(function (bt) {
          bt.addEventListener('click', function () {
            const key = bt.dataset.bit, w = key[0], i = +key.slice(1);
            st.adder[w] ^= (1 << i);
            syncAdderSliders();
            refreshBits();
            applyInputs();
            logAdder(true); updateTable();
            emitMode('bit');
          });
        });
      }
      box.querySelectorAll('button').forEach(function (bt) {
        const i = +bt.dataset.bit.slice(1), on = (v >> i) & 1;
        bt.setAttribute('aria-pressed', String(!!on));
        bt.querySelector('b').textContent = String(on);
        bt.setAttribute('aria-label', which.toUpperCase() + i + ' = ' + on);
      });
      $(which + 'Bin').textContent = bitStr(v, n);
    });
    $('avo').textContent = String(A.a);
    $('bvo').textContent = String(A.b);
  }
  function syncAdderSliders() {
    [[elA, st.adder.a], [elB, st.adder.b]].forEach(function (p) {
      if (window.LabNum) window.LabNum.clear(p[0]);
      p[0].value = p[1];
    });
  }
  function logAdder(add) {
    if (!add) return;
    if (!run.changed) return;
    const A = st.adder, res = LC.adderRead(run.c, run.sim.final);
    A.log.push({ k: ++A.count, n: A.n, a: A.a, b: A.b, cin: A.cin, s: res.s, cout: res.cout, settle: run.sim.settle });
    if (A.log.length > 200) A.log.splice(0, A.log.length - 200);
  }
  [[elA, 'a'], [elB, 'b']].forEach(function (p) {
    p[0].addEventListener('input', function () {
      const v = Math.max(0, Math.min(Math.pow(2, st.adder.n) - 1, Math.round(val(p[0]))));
      $(p[1] + 'vo').textContent = String(v);
      if (v === st.adder[p[1]]) return;
      st.adder[p[1]] = v;
      refreshBits();
      applyInputs();
      logAdder(true); updateTable();
      emitMode('slider');
    });
  });
  document.querySelectorAll('[data-width]').forEach(function (bt) {
    bt.addEventListener('click', function () {
      const n = +bt.dataset.width, A = st.adder;
      if (n === A.n) return;
      A.n = n;
      const M = Math.pow(2, n) - 1;
      A.a &= M; A.b &= M;
      elA.max = String(M); elB.max = String(M);
      syncAdderSliders();
      rebuild(); rebuildKeys(); refreshInputs(); updateAll(); resize();
      say(T('換成 ' + n + ' 位元：A、B 可以是 0 到 ' + M + '。', 'Now ' + n + ' bits: A and B can be 0 to ' + M + '.'));
      emitMode('width');
    });
  });
  $('signedView').addEventListener('change', function () { st.adder.signed = $('signedView').checked; updateReadouts(); });

  // ---------- 動畫控制 ----------
  const elSpeed = $('speed');
  elSpeed.addEventListener('input', function () { st.speed = val(elSpeed); $('speedo').textContent = st.speed.toFixed(1); });
  $('autoPlay').addEventListener('change', function () { st.auto = $('autoPlay').checked; });
  $('stepBtn').addEventListener('click', function () {
    run.playing = false;
    if (!run.changed || run.sim.settle === 0) { say(T('先撥動一個輸入，再一步一步看訊號怎麼傳。', 'Flip an input first, then follow the signals step by step.')); requestDraw(); return; }
    if (run.t >= run.sim.settle - 1e-9) { run.t = 0; fx.length = 0; say(T('回到 t = 0：輸入剛改變，閘還沒反應。', 'Back to t = 0: the inputs have just changed and no gate has answered yet.')); }
    else {
      run.t = tNow() + 1;
      onTick(run.t);
      const left = run.sim.settle - run.t;
      say('t = ' + run.t + T('：', ': ') + (left > 0 ? T('還要 ' + left + ' 個閘延遲才穩定。', left + ' more gate delay' + (left > 1 ? 's' : '') + ' to settle.') : T('穩定了。', 'settled.')));
      if (left <= 0) settleSound();
    }
    requestDraw();
    emitStep();
  });
  $('replayBtn').addEventListener('click', function () {
    if (!run.changed || run.sim.settle === 0) { say(T('還沒有可以重播的變化。', 'There is no change to replay yet.')); return; }
    run.t = 0; fx.length = 0; lastFrame = 0;
    if (reducedMotion) { stepTimer(); return; }
    run.playing = true;
    say(T('重播：從 t = 0 開始。', 'Replay from t = 0.'));
    requestDraw();
  });
  /** 減少動態效果時的重播：每 0.6 秒跳一個閘延遲（不做連續動畫） */
  let stepT = 0;
  function stepTimer() {
    clearTimeout(stepT);
    requestDraw();
    if (run.t >= run.sim.settle) { onSettled(); return; }
    stepT = setTimeout(function () { run.t = tNow() + 1; onTick(run.t); stepTimer(); }, 600);
  }
  $('clear').addEventListener('click', function () {
    st.gate.seen = {};
    st.adder.log = [];
    updateTable();
    say(T('已全部清除：真值表的打勾與計算紀錄；電路和開關都沒變。', 'Cleared the truth-table ticks and the log; the circuit and the switches are unchanged.'));
  });

  // ---------- 畫布：點開關、鍵盤 ----------
  /** 目前模式的輸入（鍵盤與點擊共用）：[{ name, get, flip, hit(x, y) }] */
  function inputList() {
    const m = st.mode, list = [];
    if (m === 'adder') {
      const n = st.adder.n;
      for (let i = n - 1; i >= 0; i--) list.push({ name: 'A' + i, mode: 'adder', bit: ['a', i] });
      for (let i = n - 1; i >= 0; i--) list.push({ name: 'B' + i, mode: 'adder', bit: ['b', i] });
      list.push({ name: 'Cin', mode: 'adder', key: 'cin', cin: true });
      return list;
    }
    const keys = m === 'full' ? ['a', 'b', 'cin'] : (m === 'gate' && st.gate.type === 'NOT' ? ['a'] : ['a', 'b']);
    keys.forEach(function (k, i) { list.push({ name: k === 'cin' ? 'Cin' : k.toUpperCase(), mode: m, key: k, idx: i }); });
    return list;
  }
  function inputValue(it) { return it.bit ? (st.adder[it.bit[0]] >> it.bit[1]) & 1 : st[it.mode][it.key]; }
  function flipInput(it, src) {
    if (it.bit) {
      st.adder[it.bit[0]] ^= (1 << it.bit[1]);
      syncAdderSliders(); refreshBits(); applyInputs(); logAdder(true); updateTable(); emitMode(src);
    } else flip(it.mode, it.key, src);
  }
  function inputPoint(it) {
    if (L.adder) {
      if (it.bit) { const i = it.bit[1]; return it.bit[0] === 'a' ? P(L.xs[i] - 0.36, L.yA) : P(L.xs[i] + 0.36, L.yB); }
      return it.cin ? P(L.cinX + 0.05, L.yC + 0.85) : null;
    }
    if (it.bit || it.cin || !L.inputs) return null;
    const q = L.inputs[it.idx];
    return q ? P(q.x, q.y) : null;
  }
  cv.addEventListener('click', function (ev) {
    if (!L) return;
    const rect = cv.getBoundingClientRect(), x = ev.clientX - rect.left, y = ev.clientY - rect.top;
    // 觸控範圍至少 44 px；相鄰的開關範圍重疊時，選離手指最近的那一個
    let hit = null, best = Infinity;
    inputList().forEach(function (it) {
      const p = inputPoint(it);
      if (!p) return;
      const rx = it.bit ? Math.max(16, 0.42 * L.s) : Math.max(22, 0.6 * L.s), ry = it.bit ? Math.max(16, 0.42 * L.s) : Math.max(22, 0.45 * L.s);
      const dx = Math.abs(x - p[0]), dy = Math.abs(y - p[1]);
      if (dx <= rx && dy <= ry && dx * dx + dy * dy < best) { best = dx * dx + dy * dy; hit = it; }
    });
    if (hit) flipInput(hit, 'canvas');
  });
  const kbItems = [];
  let kb = null;
  function rebuildKeys() {
    kbItems.length = 0;
    inputList().forEach(function (it) {
      kbItems.push({
        name: function () { return it.name; },
        move: function (dx, dy) {
          const v = inputValue(it);
          if (dy > 0 && v === 1) return false;
          if (dy < 0 && v === 0) return false;
          flipInput(it, 'key');
          return true;
        },
        describe: function () { return it.name + ' = ' + inputValue(it); }
      });
    });
    if (kb) kb.select(0);
  }
  if (window.LabKeys) {
    kb = window.LabKeys.attach(cv, {
      label: T('電路畫布。按 Enter 切換要操作的輸入開關，方向鍵上設成 1、下設成 0、左右切換。', 'Circuit canvas. Press Enter to choose an input switch; the up arrow sets it to 1, down sets it to 0, left or right flips it.'),
      items: kbItems,
      onChange: function () { requestDraw(); }
    });
  }

  // 給測試用的介面（不影響畫面）
  window.__lg = { st: st, run: run, setMode: setMode, LC: LC };

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  st.speed = val(elSpeed); $('speedo').textContent = st.speed.toFixed(1);
  st.auto = $('autoPlay').checked;
  $('kko').textContent = String(Math.round(val(elK)));
  st.build.k = Math.round(val(elK));
  st.adder.a = Math.round(val(elA)); st.adder.b = Math.round(val(elB));
  st.gate.nand = $('nandView').checked;
  st.adder.signed = $('signedView').checked;
  st.build.target = $('target').value;
  renderWires();
  rebuild();
  rebuildKeys();
  refreshInputs();
  updateAll();
  updateSoundButton();
  function themeChanged() { readColors(); updateAll(); requestDraw(); }
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', themeChanged);
  }
  window.addEventListener('lab:themechange', themeChanged);
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { if (cv.clientWidth !== lastW || cv2.clientWidth !== cw2) { lastW = cv.clientWidth; resize(); } }).observe($('stage'));
  }
  resize();
})();
