/*
 * dc-circuit-core.js — 直流電路物理核心（與畫面無關，可單獨測試）
 *
 * 單位約定（SI）：電位、電壓 V；電流 A；電阻 Ω；功率 W。
 *
 * 電路 = { n: 節點數, elements: [元件…] }，元件都接在兩個節點 a、b 之間：
 *   { type: 'R', R }                 電阻（燈泡、檢流計也是電阻，kind 只影響畫法）
 *   { type: 'wire' }                 理想導線（電阻為 0）
 *   { type: 'switch', closed }       開關：閉合時是理想導線，斷開時不導電
 *   { type: 'battery', emf, r }      電池：a 是負極、b 是正極，內電阻 r（r = 0 為理想電池）
 *   { type: 'isrc', I }              理想電流源：電流 I 由 a 經電源流到 b（計算等效電阻用）
 * 元件電流 I 的正方向一律是「在元件內部由 a 流向 b」（傳統電流方向）。
 * 電池：I > 0 代表電流從正極流出、經外電路回到負極，端電壓 V(b) − V(a) = ε − I r。
 *
 * 解法：節點分析（克希何夫電流定律）＋修正節點分析（理想電池當成電壓源）：
 *   1. 電阻為 0 的導線、閉合的開關把節點併成「超節點」（union–find），避免除以 0。
 *   2. 對每個超節點寫 KCL：Σ G (Vi − Vj) = 注入電流；有內電阻的電池用諾頓等效（G = 1/r 並聯 ε/r 的電流源）；
 *      理想電池多一個未知電流與一條 V(b) − V(a) = ε 的方程式。部分選主元的高斯消去法求解。
 *   3. 電位參考點（0 V）是第一個電池的負極；與它不相連的部分標記為「浮接」（電位沒有定義）。
 *   4. 導線、開關上的電流：在每個超節點內部，假設每段導線有相同的極小電阻，
 *      解導線圖的拉普拉斯方程式（樹狀時就是唯一解），因此每個節點都滿足 KCL。
 *   5. 理想電池被導線短路時電流無限大：回傳 short = true。
 */
(function (root) {
  'use strict';

  // ======================= 線性代數 =======================
  /** 解 A x = b（部分選主元高斯消去）；奇異時回傳 null */
  function solveLinear(A, b) {
    const n = b.length;
    const M = A.map(function (row, i) { return row.slice().concat([b[i]]); });
    let scale = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) scale = Math.max(scale, Math.abs(M[i][j]));
    const eps = 1e-13 * (scale || 1);
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) <= eps) return null;
      if (p !== c) { const t = M[p]; M[p] = M[c]; M[c] = t; }
      for (let r = c + 1; r < n; r++) {
        const f = M[r][c] / M[c][c];
        if (f === 0) continue;
        for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
      }
    }
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      let s = M[i][n];
      for (let k = i + 1; k < n; k++) s -= M[i][k] * x[k];
      x[i] = s / M[i][i];
    }
    return x;
  }

  // ======================= 元件分類 =======================
  /** 電阻為 0 的導體（導線、閉合開關、R ≤ 0 的電阻） */
  function isShort(e) {
    return e.type === 'wire' || (e.type === 'switch' && e.closed) || (e.type === 'R' && !(e.R > 0));
  }
  function isOpen(e) { return e.type === 'switch' && !e.closed; }

  function makeUF(n) {
    const p = []; for (let i = 0; i < n; i++) p.push(i);
    function find(x) { while (p[x] !== x) { p[x] = p[p[x]]; x = p[x]; } return x; }
    return { find: find, union: function (a, b) { a = find(a); b = find(b); if (a !== b) p[Math.max(a, b)] = Math.min(a, b); } };
  }

  // ======================= 求解 =======================
  /**
   * 解電路。回傳：
   *   { ok, short, V: [節點電位], I: [元件電流 a→b], P: [元件消耗功率], Vab: [V(a) − V(b)],
   *     floating: [節點是否浮接], cluster: [節點所屬超節點代號], ground }
   */
  function solve(circuit) {
    const n = circuit.n, els = circuit.elements;
    const uf = makeUF(n);
    els.forEach(function (e) { if (isShort(e)) uf.union(e.a, e.b); });
    // 超節點編號
    const cid = new Array(n), reps = [];
    for (let i = 0; i < n; i++) {
      const r = uf.find(i);
      if (r === i) reps.push(i);
    }
    const repIndex = {};
    reps.forEach(function (r, k) { repIndex[r] = k; });
    for (let i = 0; i < n; i++) cid[i] = repIndex[uf.find(i)];
    const m = reps.length;

    const res = {
      ok: true, short: false, singular: false,
      V: new Array(n).fill(0), I: new Array(els.length).fill(0), P: new Array(els.length).fill(0),
      Vab: new Array(els.length).fill(0), floating: new Array(n).fill(false), cluster: cid, ground: 0
    };

    // 理想電池被短路
    for (let k = 0; k < els.length; k++) {
      const e = els[k];
      if (e.type === 'battery' && !(e.r > 0) && cid[e.a] === cid[e.b] && e.emf !== 0) {
        res.ok = false; res.short = true; res.I[k] = Infinity;
        return res;
      }
    }

    // 超節點之間的連通性（經電阻、電池）
    const adj = []; for (let i = 0; i < m; i++) adj.push([]);
    els.forEach(function (e) {
      if (isShort(e) || isOpen(e) || e.type === 'isrc') return; // 電流源不導電
      const ca = cid[e.a], cb = cid[e.b];
      if (ca !== cb) { adj[ca].push(cb); adj[cb].push(ca); }
    });
    const comp = new Array(m).fill(-1);
    let nc = 0;
    for (let s = 0; s < m; s++) {
      if (comp[s] >= 0) continue;
      const st = [s]; comp[s] = nc;
      while (st.length) { const u = st.pop(); adj[u].forEach(function (w) { if (comp[w] < 0) { comp[w] = nc; st.push(w); } }); }
      nc++;
    }
    // 參考點：每個連通塊選一個超節點；第一個電池負極所在的塊為主塊
    const refOf = new Array(nc).fill(-1);
    const firstBat = els.find(function (e) { return e.type === 'battery'; });
    const gNode = firstBat ? firstBat.a : (circuit.ground || 0);
    res.ground = gNode;
    refOf[comp[cid[gNode]]] = cid[gNode];
    for (let s = 0; s < m; s++) if (refOf[comp[s]] < 0) refOf[comp[s]] = s;
    const mainComp = comp[cid[gNode]];
    for (let i = 0; i < n; i++) res.floating[i] = comp[cid[i]] !== mainComp;

    // 未知數：非參考超節點的電位＋理想電池電流
    const vIdx = new Array(m).fill(-1);
    let nu = 0;
    for (let s = 0; s < m; s++) if (refOf[comp[s]] !== s) vIdx[s] = nu++;
    const srcIdx = {};
    els.forEach(function (e, k) {
      if (e.type === 'battery' && !(e.r > 0) && cid[e.a] !== cid[e.b]) srcIdx[k] = nu++;
    });
    const A = []; for (let i = 0; i < nu; i++) A.push(new Array(nu).fill(0));
    const b = new Array(nu).fill(0);
    function stampG(ca, cb, G) {
      const ia = vIdx[ca], ib = vIdx[cb];
      if (ia >= 0) { A[ia][ia] += G; if (ib >= 0) A[ia][ib] -= G; }
      if (ib >= 0) { A[ib][ib] += G; if (ia >= 0) A[ib][ia] -= G; }
    }
    /** 電流 J 由 ca 經元件流到 cb：ca 流出、cb 流入 */
    function stampI(ca, cb, J) {
      const ia = vIdx[ca], ib = vIdx[cb];
      if (ia >= 0) b[ia] -= J;
      if (ib >= 0) b[ib] += J;
    }
    els.forEach(function (e, k) {
      const ca = cid[e.a], cb = cid[e.b];
      if (e.type === 'R' && e.R > 0) { if (ca !== cb) stampG(ca, cb, 1 / e.R); }
      else if (e.type === 'battery') {
        if (e.r > 0) { if (ca !== cb) { stampG(ca, cb, 1 / e.r); stampI(ca, cb, e.emf / e.r); } }
        else if (srcIdx[k] != null) {
          const j = srcIdx[k], ia = vIdx[ca], ib = vIdx[cb];
          // 電流 Ik 由 a 經電池流到 b：KCL 列中 a 流出 +Ik、b 流入
          if (ia >= 0) A[ia][j] += 1;
          if (ib >= 0) A[ib][j] -= 1;
          if (ib >= 0) A[j][ib] += 1;
          if (ia >= 0) A[j][ia] -= 1;
          b[j] = e.emf;
        }
      } else if (e.type === 'isrc') { if (ca !== cb) stampI(ca, cb, e.I); }
    });
    let x = [];
    if (nu > 0) {
      x = solveLinear(A, b);
      if (!x) { res.ok = false; res.singular = true; return res; }
    }
    const Vc = new Array(m).fill(0);
    for (let s = 0; s < m; s++) if (vIdx[s] >= 0) Vc[s] = x[vIdx[s]];
    for (let i = 0; i < n; i++) res.V[i] = Vc[cid[i]];

    // 非導線元件的電流
    els.forEach(function (e, k) {
      const Va = res.V[e.a], Vb = res.V[e.b];
      let I = 0;
      if (e.type === 'R' && e.R > 0) I = (Va - Vb) / e.R;
      else if (e.type === 'battery') {
        if (e.r > 0) I = (e.emf - (Vb - Va)) / e.r;
        else if (srcIdx[k] != null) I = x[srcIdx[k]];
      } else if (e.type === 'isrc') I = e.I;
      res.I[k] = I;
    });

    // 導線、閉合開關的電流：每個超節點內解導線圖的拉普拉斯方程式
    const inj = new Array(n).fill(0); // 由非導線元件流入各節點的淨電流
    els.forEach(function (e, k) {
      if (isShort(e)) return;
      inj[e.a] -= res.I[k];
      inj[e.b] += res.I[k];
    });
    const members = []; for (let s = 0; s < m; s++) members.push([]);
    for (let i = 0; i < n; i++) members[cid[i]].push(i);
    const shortEls = []; for (let s = 0; s < m; s++) shortEls.push([]);
    els.forEach(function (e, k) { if (isShort(e) && e.a !== e.b) shortEls[cid[e.a]].push(k); });
    for (let s = 0; s < m; s++) {
      const mem = members[s];
      if (mem.length < 2 || !shortEls[s].length) continue;
      const loc = {}; mem.forEach(function (node, i) { loc[node] = i; });
      const q = mem.length - 1; // 第一個成員的 φ = 0
      const L = []; for (let i = 0; i < q; i++) L.push(new Array(q).fill(0));
      const rhs = new Array(q).fill(0);
      shortEls[s].forEach(function (k) {
        const ia = loc[els[k].a] - 1, ib = loc[els[k].b] - 1;
        if (ia >= 0) { L[ia][ia] += 1; if (ib >= 0) L[ia][ib] -= 1; }
        if (ib >= 0) { L[ib][ib] += 1; if (ia >= 0) L[ib][ia] -= 1; }
      });
      for (let i = 1; i < mem.length; i++) rhs[i - 1] = inj[mem[i]];
      const phi = q > 0 ? solveLinear(L, rhs) : [];
      const ph = function (node) { const i = loc[node]; return i === 0 || !phi ? 0 : phi[i - 1]; };
      shortEls[s].forEach(function (k) { res.I[k] = ph(els[k].a) - ph(els[k].b); });
    }

    // 電壓與功率
    els.forEach(function (e, k) {
      const Vab = res.V[e.a] - res.V[e.b];
      res.Vab[k] = Vab;
      const I = res.I[k];
      if (e.type === 'R' && e.R > 0) res.P[k] = I * I * e.R;
      else if (e.type === 'battery') res.P[k] = I * I * (e.r > 0 ? e.r : 0); // 內電阻消耗
      else res.P[k] = 0;
      if (Math.abs(res.I[k]) < 1e-15) res.I[k] = 0;
    });
    return res;
  }

  // ======================= 常用量 =======================
  function series(list) { return list.reduce(function (s, r) { return s + r; }, 0); }
  function parallel(list) {
    if (list.some(function (r) { return r === 0; })) return 0;
    return 1 / list.reduce(function (s, r) { return s + 1 / r; }, 0);
  }

  /**
   * 兩節點之間的等效電阻：拿掉所有電池（電流源開路），由 a 注入 1 A、從 b 流出，R = V(a) − V(b)。
   * 兩點不相連時傳回 Infinity；被導線連在一起時傳回 0。
   */
  function resistanceBetween(circuit, a, b) {
    const els = circuit.elements.filter(function (e) { return e.type !== 'battery' && e.type !== 'isrc'; })
      .concat([{ type: 'isrc', a: b, b: a, I: 1 }]); // 電流源內部由 b 流到 a → 由 a 注入外電路
    const sol = solve({ n: circuit.n, elements: els, ground: b });
    if (!sol.ok) return NaN;
    if (sol.floating[a]) return Infinity; // a 與 b 不相連：開路
    return sol.V[a] - sol.V[b];
  }

  /** 電池的工作狀態：外電路等效電阻、端電壓、各種功率與效率 */
  function batteryReport(circuit, sol, k) {
    const e = circuit.elements[k];
    const I = sol.I[k];
    const Vt = sol.V[e.b] - sol.V[e.a];
    const Pemf = e.emf * I, Pint = I * I * (e.r > 0 ? e.r : 0), Pout = Vt * I;
    const ext = { n: circuit.n, elements: circuit.elements.filter(function (x, i) { return i !== k; }) };
    const Req = resistanceBetween(ext, e.b, e.a);
    return { I: I, Vt: Vt, Pemf: Pemf, Pint: Pint, Pout: Pout, eta: Pemf > 0 ? Pout / Pemf : NaN, Req: Req };
  }

  /** 負載 R 接在電動勢 ε、內電阻 r 的電池上：輸出功率 P = ε²R/(R + r)² */
  function loadPower(emf, r, R) { return emf * emf * R / ((R + r) * (R + r)); }
  /** 最大輸出功率 ε²/(4r)（R = r 時） */
  function maxLoadPower(emf, r) { return r > 0 ? emf * emf / (4 * r) : Infinity; }

  // ======================= 預設電路 =======================
  /*
   * 節點座標（x 0–6、y 0–4，y 向下）只是畫圖用的抽象格點。
   * 每個元件連兩個節點、都是水平或垂直的線段；元件畫在線段中央。
   * kind：'res' 電阻、'bulb' 燈泡、'galv' 檢流計、'load' 可變負載電阻。
   * side：電流標籤放在元件的哪一側（'t' 上、'b' 下、'l' 左、'r' 右）。
   */
  const PRESETS = ['single', 'series', 'parallel', 'mixed', 'internal', 'wheatstone'];

  function preset(name, count) {
    const nodes = [], els = [];
    const N = function (x, y) { nodes.push({ x: x, y: y }); return nodes.length - 1; };
    const W = function (a, b) { els.push({ id: 'w' + els.length, type: 'wire', a: a, b: b }); };
    const S = function (id, a, b, side) { els.push({ id: id, type: 'switch', closed: true, a: a, b: b, side: side }); };
    const R = function (id, kind, a, b, R0, side) { els.push({ id: id, type: 'R', kind: kind, R: R0, a: a, b: b, side: side }); };
    const n0 = N(0, 4), n1 = N(0, 4 - 4);
    els.push({ id: 'E', type: 'battery', a: n0, b: n1, emf: 6, r: 0, side: 'r' });
    let defaults = { emf: 6, r: 0 }, probes = null;
    count = count === 2 ? 2 : 3;
    if (name === 'single') {
      const a = N(2, 0), b = N(4, 0), c = N(6, 0), d = N(6, 4);
      W(n1, a); R('R1', 'res', a, b, 10, 'b'); W(b, c); S('S1', c, d, 'l'); W(d, n0);
    } else if (name === 'series') {
      const a = N(1.6, 0), b = N(4.4, 0), c = N(6, 0), d = N(6, 4), e = N(4.4, 4), f = N(1.6, 4);
      S('S1', n1, a, 'b'); R('L1', 'bulb', a, b, 6, 'b'); W(b, c); R('L2', 'bulb', c, d, 6, 'l'); W(d, e);
      if (count === 3) R('L3', 'bulb', e, f, 6, 't'); else W(e, f);
      W(f, n0);
    } else if (name === 'parallel') {
      const xs = count === 3 ? [2.5, 4.25, 6] : [3.5, 6];
      const top0 = N(1.6, 0);
      S('S0', n1, top0, 'b');
      let prevT = top0, prevB = n0;
      const Rs = [6, 12, 18];
      xs.forEach(function (x, i) {
        const t = N(x, 0), mid = N(x, 1.5), bt = N(x, 4);
        W(prevT, t);
        S('S' + (i + 1), t, mid, 'l');
        R('L' + (i + 1), 'bulb', mid, bt, Rs[i], 'l');
        W(bt, prevB);
        prevT = t; prevB = bt;
      });
    } else if (name === 'mixed') {
      const a = N(1.5, 0), b = N(4, 0), c = N(6, 0), d = N(6, 1.5), e = N(6, 4), f = N(4, 4);
      S('S1', n1, a, 'b'); R('L1', 'bulb', a, b, 4, 'b'); R('L2', 'bulb', b, f, 6, 'l');
      W(b, c); S('S2', c, d, 'l'); R('L3', 'bulb', d, e, 6, 'l'); W(e, f); W(f, n0);
    } else if (name === 'internal') {
      const a = N(2, 0), b = N(6, 0), c = N(6, 4);
      S('S1', n1, a, 'b'); W(a, b); R('R', 'load', b, c, 5, 'l'); W(c, n0);
      defaults = { emf: 6, r: 1 };
      probes = [n1, n0];
    } else if (name === 'wheatstone') {
      // 兩臂在 x = 2.6 與 x = 4.6；右側留給標籤
      const a = N(1.3, 0), t = N(2.6, 0), u = N(4.6, 0), C = N(2.6, 2), D = N(4.6, 2), v = N(4.6, 4), w = N(2.6, 4);
      S('S1', n1, a, 'b'); W(a, t); W(t, u);
      R('R1', 'res', t, C, 10, 'l'); R('R2', 'res', C, w, 20, 'l');
      R('R3', 'res', u, D, 15, 'r'); R('Rx', 'res', D, v, 40, 'r');
      R('G', 'galv', C, D, 20, 'b');
      W(v, w); W(w, n0);
    } else throw new Error('unknown preset ' + name);
    els[0].emf = defaults.emf; els[0].r = defaults.r;
    return { name: name, count: count, n: nodes.length, nodes: nodes, elements: els, probes: probes };
  }

  /** 依元件代號找元件索引 */
  function indexOf(circuit, id) {
    for (let k = 0; k < circuit.elements.length; k++) if (circuit.elements[k].id === id) return k;
    return -1;
  }

  const api = {
    solveLinear: solveLinear,
    solve: solve,
    series: series,
    parallel: parallel,
    resistanceBetween: resistanceBetween,
    batteryReport: batteryReport,
    loadPower: loadPower,
    maxLoadPower: maxLoadPower,
    PRESETS: PRESETS,
    preset: preset,
    indexOf: indexOf
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DCCircuitCore = api;
})(typeof window !== 'undefined' ? window : this);
