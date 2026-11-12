/* logic-gates-core.js — 邏輯閘與加法器的計算核心（與畫面分離，Node 單元測試：tests/logic-gates-core.test.js）
 *
 * 1. 七種閘：AND、OR、NOT、NAND、NOR、XOR、XNOR。值是 0、1，另有「未知」X（= 2，例如沒接線的腳），
 *    用三值邏輯：AND(0, X) = 0、OR(1, X) = 1，其他和 X 有關的結果都是 X。
 * 2. 電路：輸入與閘的輸出都是「節點」；閘一定只接到比它早建立的節點（組合電路，沒有迴路）。
 * 3. 單位閘延遲的事件驅動模擬：輸入在 t = 0 改變；每個閘在時間 t 的輸出，
 *    等於用它的輸入在 t − 1 的值算出來的結果（每個閘延遲 1 個單位，導線不花時間；傳輸延遲模型）。
 *    只重算「輸入剛變過」的閘，直到沒有任何節點再變——最後一次變化的時間就是穩定所需的閘延遲數。
 *    一條線在穩定前來回變了不只一次，就是「突波」（glitch，也叫危障 hazard）。
 * 4. 加法器：半加器 S = A ⊕ B、C = A·B；全加器 P = A ⊕ B、G = A·B、S = P ⊕ Cin、H = P·Cin、Cout = G + H；
 *    n 位元漣波進位加法器把 n 個全加器串起來（C0 = Cin），最長路徑 2n + 1 個閘延遲（到最高位進位）。
 * 5. 萬用閘拼圖：只用 NAND（或只用 NOR）接出指定的布林函數，並用窮舉求最少要幾個閘。
 */
(function (root) {
  'use strict';
  const X = 2;

  // ---------- 閘 ----------
  function and2(a, b) { return a === 0 || b === 0 ? 0 : (a === 1 && b === 1 ? 1 : X); }
  function or2(a, b) { return a === 1 || b === 1 ? 1 : (a === 0 && b === 0 ? 0 : X); }
  function not1(a) { return a === X ? X : 1 - a; }
  function xor2(a, b) { return a === X || b === X ? X : a ^ b; }
  const GATES = {
    AND: { arity: 2, f: and2 },
    OR: { arity: 2, f: or2 },
    NOT: { arity: 1, f: function (a) { return not1(a); } },
    NAND: { arity: 2, f: function (a, b) { return not1(and2(a, b)); } },
    NOR: { arity: 2, f: function (a, b) { return not1(or2(a, b)); } },
    XOR: { arity: 2, f: xor2 },
    XNOR: { arity: 2, f: function (a, b) { return not1(xor2(a, b)); } }
  };
  const GATE_LIST = ['AND', 'OR', 'NOT', 'NAND', 'NOR', 'XOR', 'XNOR'];
  function evalGate(type, a, b) { return GATES[type].f(a, b); }
  /** 真值表（兩個輸入：列的順序 (A, B) = 00、01、10、11；NOT：A = 0、1） */
  function truthTable(type) {
    if (GATES[type].arity === 1) return [evalGate(type, 0), evalGate(type, 1)];
    return [evalGate(type, 0, 0), evalGate(type, 0, 1), evalGate(type, 1, 0), evalGate(type, 1, 1)];
  }

  // ---------- 電路 ----------
  function circuit() { return { names: [], isInput: [], drv: [], gates: [], inputs: [], idx: {}, fan: null }; }
  function addInput(c, name) {
    const i = c.names.length;
    c.names.push(name); c.isInput.push(true); c.drv.push(-1); c.idx[name] = i; c.inputs.push(i);
    c.fan = null;
    return i;
  }
  /** 加一個閘；ins 是輸入節點的編號（−1 表示沒接，當成 X）。傳回輸出節點的編號。 */
  function addGate(c, type, name, ins) {
    const out = c.names.length;
    ins.forEach(function (s) { if (s >= out) throw new Error('閘只能接到比它早建立的節點'); });
    c.names.push(name); c.isInput.push(false); c.drv.push(c.gates.length); c.idx[name] = out;
    c.gates.push({ type: type, ins: ins.slice(), out: out, name: name });
    c.fan = null;
    return out;
  }
  function fanout(c) {
    if (c.fan) return c.fan;
    const fan = c.names.map(function () { return []; });
    c.gates.forEach(function (g, gi) {
      g.ins.forEach(function (s) { if (s >= 0 && fan[s].indexOf(gi) < 0) fan[s].push(gi); });
    });
    c.fan = fan;
    return fan;
  }
  function gateOut(g, v) {
    const a = g.ins[0] >= 0 ? v[g.ins[0]] : X;
    if (GATES[g.type].arity === 1) return GATES[g.type].f(a);
    const b = g.ins[1] >= 0 ? v[g.ins[1]] : X;
    return GATES[g.type].f(a, b);
  }
  /** 穩定狀態：輸入值 inVals（順序同 c.inputs）→ 每個節點的值 */
  function steady(c, inVals) {
    const v = new Array(c.names.length).fill(X);
    c.inputs.forEach(function (node, k) { v[node] = inVals[k]; });
    c.gates.forEach(function (g) { v[g.out] = gateOut(g, v); });
    return v;
  }
  /** 每個節點的深度（離輸入最遠的閘數；輸入是 0、沒接的腳算 0） */
  function depths(c) {
    const d = new Array(c.names.length).fill(0);
    c.gates.forEach(function (g) {
      let m = 0;
      g.ins.forEach(function (s) { if (s >= 0) m = Math.max(m, d[s]); });
      d[g.out] = m + 1;
    });
    return d;
  }

  /**
   * 事件驅動、單位閘延遲的模擬：電路先停在 oldIn 的穩定狀態，t = 0 時輸入換成 newIn。
   * 傳回 { init（t = 0 之前每個節點的值）, final, hist（每個節點的變化 [[t, 值], …]）, settle（最後一次變化的時間）,
   *        events（節點變化總次數，含輸入）, evals（重算閘的次數） }
   */
  function simulate(c, oldIn, newIn, limit) {
    limit = limit || 1000;
    const fan = fanout(c);
    const v = steady(c, oldIn);
    const init = v.slice();
    const hist = c.names.map(function () { return []; });
    let front = [];
    let events = 0, evals = 0, settle = 0;
    c.inputs.forEach(function (node, k) {
      if (v[node] !== newIn[k]) { v[node] = newIn[k]; hist[node].push([0, newIn[k]]); front.push(node); events++; }
    });
    const mark = new Array(c.gates.length).fill(-1);
    let t = 0;
    while (front.length && t < limit) {
      t++;
      const cand = [];
      front.forEach(function (node) {
        fan[node].forEach(function (gi) { if (mark[gi] !== t) { mark[gi] = t; cand.push(gi); } });
      });
      const upd = [];
      cand.forEach(function (gi) {
        evals++;
        const g = c.gates[gi], nv = gateOut(g, v);   // v 還是 t − 1 的值
        if (nv !== v[g.out]) upd.push([g.out, nv]);
      });
      front = [];
      upd.forEach(function (u) { v[u[0]] = u[1]; hist[u[0]].push([t, u[1]]); front.push(u[0]); events++; settle = t; });
    }
    return { init: init, final: v, hist: hist, settle: settle, events: events, evals: evals };
  }
  /** 對照用：每一步把所有閘都重算一次（同步、單位延遲），傳回每個時間點所有節點的值 */
  function simulateSync(c, oldIn, newIn, steps) {
    let v = steady(c, oldIn);
    c.inputs.forEach(function (node, k) { v[node] = newIn[k]; });
    const frames = [v.slice()];
    for (let t = 1; t <= steps; t++) {
      const nv = v.slice();
      c.gates.forEach(function (g) { nv[g.out] = gateOut(g, v); });
      v = nv;
      frames.push(v.slice());
    }
    return frames;
  }
  /** 模擬結果中，節點在時間 t 的值 */
  function valueAt(sim, node, t) {
    let val = sim.init[node];
    const h = sim.hist[node];
    for (let i = 0; i < h.length; i++) { if (h[i][0] <= t) val = h[i][1]; else break; }
    return val;
  }
  /** 節點下一次變化的時間（> t），沒有就傳回 −1 */
  function nextChange(sim, node, t) {
    const h = sim.hist[node];
    for (let i = 0; i < h.length; i++) if (h[i][0] > t) return h[i][0];
    return -1;
  }
  function flips(sim, node) { return sim.hist[node].length; }
  /** 突波：變了兩次以上（最後的值不需要變那麼多次） */
  function glitchy(sim, node) { return sim.hist[node].length >= 2; }

  // ---------- 現成的電路 ----------
  /** 單一個閘：輸入 A（、B），輸出 Y */
  function gateCircuit(type) {
    const c = circuit();
    const a = addInput(c, 'A');
    if (GATES[type].arity === 1) addGate(c, type, 'Y', [a]);
    else { const b = addInput(c, 'B'); addGate(c, type, 'Y', [a, b]); }
    return c;
  }
  /** 只用 NAND 組成的七種閘（NOT、AND、OR 是頁面上的示範；全部用在單元測試） */
  function nandForm(type) {
    const c = circuit();
    const a = addInput(c, 'A');
    const N = function (name, x, y) { return addGate(c, 'NAND', name, [x, y]); };
    if (type === 'NOT') { N('Y', a, a); return c; }
    const b = addInput(c, 'B');
    if (type === 'NAND') { N('Y', a, b); return c; }
    if (type === 'AND') { const n = N('N1', a, b); N('Y', n, n); return c; }
    if (type === 'OR') { const na = N('N1', a, a), nb = N('N2', b, b); N('Y', na, nb); return c; }
    if (type === 'NOR') { const na = N('N1', a, a), nb = N('N2', b, b), o = N('N3', na, nb); N('Y', o, o); return c; }
    const m = N('N1', a, b), p = N('N2', a, m), q = N('N3', b, m);
    if (type === 'XOR') { N('Y', p, q); return c; }
    const x = N('N4', p, q); N('Y', x, x); return c;   // XNOR
  }
  function halfAdder() {
    const c = circuit();
    const a = addInput(c, 'A'), b = addInput(c, 'B');
    addGate(c, 'XOR', 'S', [a, b]);
    addGate(c, 'AND', 'C', [a, b]);
    return c;
  }
  function fullAdder() {
    const c = circuit();
    const a = addInput(c, 'A'), b = addInput(c, 'B'), ci = addInput(c, 'CIN');
    const p = addGate(c, 'XOR', 'P', [a, b]);
    const g = addGate(c, 'AND', 'G', [a, b]);
    addGate(c, 'XOR', 'S', [p, ci]);
    const h = addGate(c, 'AND', 'H', [p, ci]);
    addGate(c, 'OR', 'COUT', [g, h]);
    return c;
  }
  /** n 位元漣波進位加法器。輸入順序：A0…A(n−1)、B0…B(n−1)、CIN；第 i 位：Pi、Gi、Si、Hi、C(i+1)。 */
  function rippleAdder(n) {
    const c = circuit();
    const A = [], B = [];
    for (let i = 0; i < n; i++) A.push(addInput(c, 'A' + i));
    for (let i = 0; i < n; i++) B.push(addInput(c, 'B' + i));
    let carry = addInput(c, 'CIN');
    for (let i = 0; i < n; i++) {
      const p = addGate(c, 'XOR', 'P' + i, [A[i], B[i]]);
      const g = addGate(c, 'AND', 'G' + i, [A[i], B[i]]);
      addGate(c, 'XOR', 'S' + i, [p, carry]);
      const h = addGate(c, 'AND', 'H' + i, [p, carry]);
      carry = addGate(c, 'OR', 'C' + (i + 1), [g, h]);
    }
    c.n = n;
    return c;
  }
  function adderInputs(n, a, b, cin) {
    const v = [];
    for (let i = 0; i < n; i++) v.push((a >> i) & 1);
    for (let i = 0; i < n; i++) v.push((b >> i) & 1);
    v.push(cin ? 1 : 0);
    return v;
  }
  /** 從節點值讀出和 S 與最高位進位 */
  function adderRead(c, vals) {
    const n = c.n;
    let s = 0;
    for (let i = 0; i < n; i++) s += vals[c.idx['S' + i]] * Math.pow(2, i);
    return { s: s, cout: vals[c.idx['C' + n]] };
  }
  /** 每一位是「產生 G」「傳遞 P」還是「吸收 K」，各位的進位，以及最長的進位傳遞距離（經過幾個全加器） */
  function carryInfo(n, a, b, cin) {
    const gpk = [], carries = [cin ? 1 : 0];
    for (let i = 0; i < n; i++) {
      const ai = (a >> i) & 1, bi = (b >> i) & 1;
      gpk.push(ai && bi ? 'G' : (ai !== bi ? 'P' : 'K'));
      carries.push(ai && bi ? 1 : (ai !== bi ? carries[i] : 0));
    }
    let chain = 0;
    const from = [];
    for (let k = 1; k <= n; k++) {
      if (!carries[k]) { from.push(null); continue; }
      let m = k - 1;
      while (m >= 0 && gpk[m] === 'P') m--;
      // m ≥ 0：第 m 位產生的進位；m < 0：從 Cin 進來（經過第 0…k−1 位）
      const dist = m >= 0 ? k - m : k;
      from.push(m);
      chain = Math.max(chain, dist);
    }
    return { gpk: gpk, carries: carries, chain: chain, from: from };
  }
  function signedOf(v, n) { return v >= Math.pow(2, n - 1) ? v - Math.pow(2, n) : v; }
  /** 有號（二補數）溢位旗標 V = C(n) ⊕ C(n−1) */
  function overflowV(n, a, b, cin) { const ci = carryInfo(n, a, b, cin).carries; return ci[n] ^ ci[n - 1]; }

  // ---------- 萬用閘拼圖 ----------
  /** 16 種兩個輸入的布林函數：真值表位元（列 00、01、10、11 → 位元 0、1、2、3）→ 名稱與 TeX */
  const FUNCS = {
    0: { name: '0', tex: '0' },
    8: { name: 'AND', tex: 'A \\cdot B' },
    4: { name: 'A·B̄', tex: 'A \\cdot \\overline{B}' },
    12: { name: 'A', tex: 'A' },
    2: { name: 'Ā·B', tex: '\\overline{A} \\cdot B' },
    10: { name: 'B', tex: 'B' },
    6: { name: 'XOR', tex: 'A \\oplus B' },
    14: { name: 'OR', tex: 'A + B' },
    1: { name: 'NOR', tex: '\\overline{A + B}' },
    9: { name: 'XNOR', tex: '\\overline{A \\oplus B}' },
    5: { name: 'B̄', tex: '\\overline{B}' },
    13: { name: 'A + B̄', tex: 'A + \\overline{B}' },
    3: { name: 'Ā', tex: '\\overline{A}' },
    11: { name: 'Ā + B', tex: '\\overline{A} + B' },
    7: { name: 'NAND', tex: '\\overline{A \\cdot B}' },
    15: { name: '1', tex: '1' }
  };
  /** 真值表陣列 [f00, f01, f10, f11] ↔ 4 位元遮罩 */
  function ttMask(tt) { let m = 0; for (let r = 0; r < 4; r++) if (tt[r] === 1) m |= 1 << r; return m; }
  function maskTT(m) { return [0, 1, 2, 3].map(function (r) { return (m >> r) & 1; }); }
  /** 拼圖的目標（NOT 指 NOT A） */
  const TARGETS = { NOT: 3, AND: 8, OR: 14, NAND: 7, NOR: 1, XOR: 6, XNOR: 9 };
  const TARGET_LIST = ['NOT', 'AND', 'OR', 'NOR', 'XOR', 'XNOR'];
  /**
   * 拼圖電路：type 是 'NAND' 或 'NOR'；conns[i] = [來源1, 來源2]，來源是 'A'、'B'、j（第 j 個閘，0 起算，j < i）或 null（沒接）。
   * 輸出是最後一個閘。傳回 { c, out, cone（輸出用到的閘，0 起算）, count, depth, tt（null 表示有沒接好的腳）, mask }
   */
  function buildUniversal(type, conns) {
    const c = circuit();
    const a = addInput(c, 'A'), b = addInput(c, 'B');
    const outs = [];
    conns.forEach(function (pr, i) {
      const ins = pr.map(function (s) {
        if (s === 'A') return a;
        if (s === 'B') return b;
        if (typeof s === 'number' && s >= 0 && s < i) return outs[s];
        return -1;
      });
      outs.push(addGate(c, type, 'G' + (i + 1), ins));
    });
    const k = conns.length;
    const res = { c: c, out: k ? outs[k - 1] : -1, cone: [], count: 0, depth: 0, tt: null, mask: -1 };
    if (!k) return res;
    const seen = {};
    (function walk(i) {
      if (seen[i]) return;
      seen[i] = true;
      conns[i].forEach(function (s) { if (typeof s === 'number' && s >= 0 && s < i) walk(s); });
    })(k - 1);
    res.cone = Object.keys(seen).map(Number).sort(function (p, q) { return p - q; });
    res.count = res.cone.length;
    res.depth = depths(c)[res.out];
    const tt = [];
    for (let r = 0; r < 4; r++) tt.push(steady(c, [r >> 1, r & 1])[res.out]);
    if (tt.every(function (v) { return v !== X; })) { res.tt = tt; res.mask = ttMask(tt); }
    return res;
  }
  /**
   * 窮舉：只用 type 閘（兩個輸入），最少要幾個閘才能做出真值表遮罩 mask（輸出是最後一個閘）；maxK 內做不到傳回 −1。
   * 也傳回找到的一種接法（conns）。
   */
  function minGates(type, mask, maxK) {
    const op = type === 'NAND' ? function (x, y) { return ~(x & y) & 15; } : function (x, y) { return ~(x | y) & 15; };
    for (let k = 1; k <= maxK; k++) {
      const sig = [12, 10];        // A、B 的真值表遮罩
      const conns = [];
      const found = (function rec(i) {
        const m = sig.length;
        for (let p = 0; p < m; p++) for (let q = p; q < m; q++) {
          const v = op(sig[p], sig[q]);
          conns[i] = [p, q];
          if (i === k - 1) { if (v === mask) return true; continue; }
          sig.push(v);
          if (rec(i + 1)) return true;
          sig.pop();
        }
        return false;
      })(0);
      if (found) {
        const toSrc = function (s) { return s === 0 ? 'A' : s === 1 ? 'B' : s - 2; };
        return { k: k, conns: conns.slice(0, k).map(function (pr) { return pr.map(toSrc); }) };
      }
    }
    return { k: -1, conns: null };
  }

  /** 有種子的亂數（mulberry32），單元測試與任務證明用 */
  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const api = {
    X: X, GATES: GATES, GATE_LIST: GATE_LIST, evalGate: evalGate, truthTable: truthTable,
    circuit: circuit, addInput: addInput, addGate: addGate, fanout: fanout, steady: steady, depths: depths,
    simulate: simulate, simulateSync: simulateSync, valueAt: valueAt, nextChange: nextChange, flips: flips, glitchy: glitchy,
    gateCircuit: gateCircuit, nandForm: nandForm, halfAdder: halfAdder, fullAdder: fullAdder, rippleAdder: rippleAdder,
    adderInputs: adderInputs, adderRead: adderRead, carryInfo: carryInfo, signedOf: signedOf, overflowV: overflowV,
    FUNCS: FUNCS, ttMask: ttMask, maskTT: maskTT, TARGETS: TARGETS, TARGET_LIST: TARGET_LIST,
    buildUniversal: buildUniversal, minGates: minGates, rng: rng
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LogicCore = api;
})(typeof window !== 'undefined' ? window : this);
