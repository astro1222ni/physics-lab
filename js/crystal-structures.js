/*
 * crystal-structures.js — 「晶體結構與堆積」的頁面程式（2D 斜視圖與截面、疊疊看、讀數、圖表、比較表、動手算、任務事件）
 * 化學核心在 js/crystal-structures-core.js（CSCore）；3D 檢視在 js/crystal-structures-3d.js（CS3D，切到 3D 才載入 three.js）。
 * 2D 與 3D 畫的是同一個「模型」（buildModel()：原子、鄰居、空隙、配位多面體，座標以晶格常數 a 或疊疊看的半徑 r 為單位）。
 *
 * 任務事件（只在使用者操作過之後送出）：
 *   'cell'：晶胞模式每次改變 { s, mat, hypo, cut, coord, voids: { oct, tet, cube }, layers, n, size, view,
 *            selSp（選取的原子：m 金屬、c 陽離子、a 陰離子）, selCN（它的配位數）, Z, CN, pf, rho, stackType, stackN }
 *   'stack'：疊疊看每放一層或拿掉一層 { seq, n, type, hc, pf, cn }
 *   'record'：按「記下來」{ row, rows（比較表全部，最新的在最後）}
 *   'answer'：動手算按「核對答案」{ type（rho／r／NA）, mat, s, err（相對誤差）, ok, revealed, tries, streak（連續答對）, kinds（連續答對中的題型數）,
 *             rhoStructs（「求密度」答對過的結構）}
 */
(function () {
  'use strict';
  const CS = window.CSCore, LD = window.LabDraw;
  if (!CS || !LD) return;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const reducedMotion = LD.reducedMotion();
  const S3 = Math.sqrt(3);

  // ======================= 數字格式 =======================
  function num(x, d) {
    if (x == null || !isFinite(x)) return '—';
    const s = (+x).toFixed(d == null ? 0 : d);
    return s.charAt(0) === '-' ? (/^-0(\.0*)?$/.test(s) ? s.slice(1) : '−' + s.slice(1)) : s;
  }
  function sigf(x, sig) {
    if (x == null || !isFinite(x)) return '—';
    if (x === 0) return '0';
    const e = Math.floor(Math.log10(Math.abs(x)));
    return num(x, Math.max(0, Math.min(6, (sig || 3) - 1 - e)));
  }
  function sciParts(x, sig) {
    if (x == null || !isFinite(x) || x === 0) return { m: x === 0 ? '0' : '—', e: null };
    const e = Math.floor(Math.log10(Math.abs(x)));
    const m = x / Math.pow(10, e);
    if (Math.abs(+m.toFixed((sig || 3) - 1)) >= 10) return sciParts(Math.sign(x) * Math.pow(10, e + 1), sig);
    return { m: num(m, (sig || 3) - 1), e: e };
  }
  function sciHTML(x, sig) { const p = sciParts(x, sig); return p.e == null ? p.m : p.m + ' × 10<sup>' + num(p.e, 0) + '</sup>'; }
  function pct(x, d) { return num(x * 100, d == null ? 2 : d) + '%'; }
  function signPct(x) { return (x >= 0 ? '+' : '') + num(x * 100, 2) + '%'; }
  const FRAC = function (f) {
    const L = [[1, '1'], [0.5, '1/2'], [0.25, '1/4'], [0.125, '1/8'], [1 / 6, '1/6'], [1 / 3, '1/3']];
    for (let i = 0; i < L.length; i++) if (Math.abs(f - L[i][0]) < 1e-9) return L[i][1];
    return num(f, 3);
  };

  // ======================= 名稱 =======================
  function sName(s) {
    if (s === 'fcc') return T('面心立方（立方最密）', 'Face-centred cubic (cubic close-packed)');
    const st = CS.STRUCTS[s];
    return T(st.zh, st.en);
  }
  function mName(k) { const m = CS.MATS[k]; return T(m.zh, m.en); }
  /** 離子符號 HTML：Na<sup>+</sup>、Mg<sup>2+</sup>、O<sup>2−</sup> */
  function ionH(m, sp) {
    if (sp === 'c') return m.cat + '<sup>' + (m.qc > 1 ? m.qc : '') + '+</sup>';
    if (sp === 'a') return m.an + '<sup>' + (m.qa > 1 ? m.qa : '') + '−</sup>';
    return m.sym;
  }
  /** 畫布用：[[文字, 0 一般／1 上標／-1 下標], …] */
  function ionP(m, sp) {
    if (sp === 'c') return [[m.cat, 0], [(m.qc > 1 ? m.qc : '') + '+', 1]];
    if (sp === 'a') return [[m.an, 0], [(m.qa > 1 ? m.qa : '') + '−', 1]];
    return [[m.sym, 0]];
  }
  const STACK_NAME = {
    few: ['還不到三層', 'fewer than three layers'],
    sh: ['簡單六方（每層都疊在正上方，不是最密）', 'simple hexagonal (every layer right on top: not close-packed)'],
    loose: ['有兩層疊在正上方（不是最密）', 'some layers right on top (not close-packed)'],
    hcp: ['六方最密（ABAB…）', 'hexagonal close-packed (ABAB…)'],
    ccp: ['立方最密（ABCABC…，就是面心立方）', 'cubic close-packed (ABCABC…, the face-centred cubic)'],
    dhcp: ['雙六方最密（ABAC…，鑭、鐠、釹的排法）', 'double hexagonal close-packed (ABAC…, as in La, Pr, Nd)'],
    mixed: ['混合的最密排列（仍是最密）', 'a mixed close-packed sequence (still close-packed)']
  };
  function stackName(t) { return T(STACK_NAME[t][0], STACK_NAME[t][1]); }
  const QNAME = { rho: ['求密度', 'Density'], r: ['求原子半徑', 'Atomic radius'], NA: ['求亞佛加厥數', 'Avogadro’s number'] };

  // ======================= 顏色 =======================
  let col = {};
  const LCOL = ['#3f7fd6', '#e08a2e', '#2fae6a'];   // 最密堆積層 A、B、C（與疊疊看按鈕上的小圓點同色）
  function readColors() {
    if (LD.refresh) LD.refresh();
    const c = LD.c, dk = LD.dark;
    const lift = function (h, u) { return dk ? LD.mix(h, '#ffffff', u == null ? 0.14 : u) : h; };
    col = {
      text: c.text, muted: c.muted, border: c.border, accent: c.accent, bg: c['canvas-bg'], surface: c.surface,
      pos: c.pos, neg: c.neg, probe: c.probe, equi: c.equi, dark: dk, lift: lift,
      L: LCOL.map(function (h) { return lift(h, 0.1); }),
      void: { oct: lift('#e5484d', 0.08), tet: lift('#1ea7c8', 0.08), cube: lift('#9b5de5', 0.12) }   // 不和任何物質的顏色撞色
    };
  }
  function colorOf(sp, layer) {
    const m = CS.MATS[state.mat];
    if (state.layers && layer >= 0 && (state.s === 'fcc' || state.s === 'hcp')) return col.L[layer];
    if (sp === 'c') return col.lift(m.cc);
    if (sp === 'a') return col.lift(m.ca);
    return col.lift(m.col);
  }

  // ======================= 狀態 =======================
  const MAXL = 12;
  const state = { mode: 'cell', s: 'fcc', mat: 'Cu', hypo: false, size: 100, cut: false, coord: false,
    vo: { oct: false, tet: false, cube: false }, layers: false, n: 1, view: '2d', yaw: -0.52, pitch: 0.36, tab: 'cn', qType: 'rho' };
  let stack = 'A';
  let selKey = null;
  let rows = [];
  let quizS = null;
  let qStreak = 0, qKinds = {}, rhoOk = {};
  let userActed = false;
  let model = null, ver = 0;
  let view3 = null;
  let drop = null;            // 疊疊看：最上層落下的動畫 { t0 }
  let raf = 0;

  const cv = $('cv'), ctx = cv.getContext('2d');
  const gcv = $('gcv'), gctx = gcv.getContext('2d');
  let dpr = 1, cw = 0, ch = 0, gw = 0, gh = 0;
  let PA = null, PB = null;   // 兩個面板 { x, y, w, h }
  let proj2 = null;           // 斜視圖：投影後的原子（點選用）

  function acted() { userActed = true; }
  function setStatus(t) { $('status').textContent = t || ''; }
  function snd() { return window.LabSound && window.LabSound.enabled() ? window.LabSound : null; }
  function cryst() { return CS.crystal(state.mat, state.hypo ? state.s : null); }
  function keyOf(p) { return p.map(function (v) { return v.toFixed(4); }).join(','); }
  function sub(p, c) { return [p[0] - c[0], p[1] - c[1], p[2] - c[2]]; }

  // ======================= 模型（2D、3D 共用） =======================
  function buildModel() {
    ver++;
    if (state.mode === 'stack') return buildStackModel();
    const cr = cryst(), s = state.s, st = CS.STRUCTS[s], n = state.n;
    const ca = cr.ca || CS.CA_IDEAL;
    const ctr = st.cell === 'cube' ? [n / 2, n / 2, n / 2] : [0, 0, n * ca / 2];
    const k = state.size / 100;
    const radOf = function (sp) { return (sp === 'c' ? cr.rc : sp === 'a' ? cr.ra : cr.r) / cr.a; };
    const atoms = CS.cellAtoms(s, ca, n).map(function (q) {
      const L = CS.layerOf(s, q.p, ca);
      return { p: sub(q.p, ctr), raw: q.p, sp: q.sp, frac: q.frac, role: q.role, R: radOf(q.sp), r: radOf(q.sp) * k, layer: L, color: colorOf(q.sp, L), key: keyOf(q.p) };
    });
    const M = { kind: 'cell', ver: ver, s: s, cr: cr, ca: ca, n: n, cell: st.cell, ctr: ctr, atoms: atoms, ghosts: [], bonds: [], poly: null, voids: [],
      sel: -1, nb: null, cut: state.cut, layers: state.layers && (s === 'fcc' || s === 'hcp'), k: k };
    if (state.coord) {
      let sel = -1;
      for (let i = 0; i < atoms.length; i++) if (atoms[i].key === selKey) { sel = i; break; }
      if (sel < 0) sel = defaultSel(atoms, s);
      selKey = atoms[sel].key;
      const A = atoms[sel];
      A.sel = true;
      const res = CS.neighbors(s, ca, A.raw, A.sp);
      res.list.forEach(function (q) {
        const kq = keyOf(q.p);
        let j = -1;
        for (let i = 0; i < atoms.length; i++) if (atoms[i].key === kq) { j = i; break; }
        const pc = sub(q.p, ctr);
        if (j >= 0) atoms[j].nb = true;
        else M.ghosts.push({ p: pc, raw: q.p, sp: q.sp, R: radOf(q.sp), r: radOf(q.sp) * k, layer: CS.layerOf(s, q.p, ca), color: colorOf(q.sp, CS.layerOf(s, q.p, ca)), ghost: true, nb: true, key: kq });
        M.bonds.push([A.p, pc, q.d]);
      });
      const pts = res.list.map(function (q) { return sub(q.p, ctr); });
      M.poly = { pts: pts, faces: CS.hull(pts) };
      M.sel = sel; M.nb = res;
    }
    if (cr.r != null) {
      CS.voidTypes(s).forEach(function (t) {
        if (!state.vo[t]) return;
        CS.voidSites(s, ca, n, t, cr.r / cr.a).forEach(function (v) {
          M.voids.push({ p: sub(v.p, ctr), type: t, frac: v.frac, R: v.rr, r: v.rr * k, nn: v.nn, color: col.void[t] });
        });
      });
    }
    let br = 0;
    atoms.concat(M.ghosts).forEach(function (a) { br = Math.max(br, Math.hypot(a.p[0], a.p[1], a.p[2]) + a.R); });
    M.bound = br;
    M.see = M.voids.length > 0 && M.sel < 0;   // 顯示空隙時原子半透明
    M.axis = s === 'fcc' ? [1 / S3, 1 / S3, 1 / S3] : [0, 0, 1];
    return M;
  }
  function defaultSel(atoms, s) {
    const kind = CS.STRUCTS[s].kind;
    let best = 0, bd = Infinity;
    atoms.forEach(function (a, i) {
      if (kind === 'ionic' && a.sp !== 'c') return;
      const d = Math.hypot(a.p[0], a.p[1], a.p[2] * 1.001) + i * 1e-9;
      if (d < bd - 1e-9) { bd = d; best = i; }
    });
    return best;
  }
  function buildStackModel() {
    const info = CS.stackInfo(stack);
    const k = state.size / 100;
    const RP = 5.0;
    const cx = 1, cy = 1 / S3;   // A、B、C 三個位置的中心
    const atoms = [];
    let z = 1;
    for (let i = 0; i < stack.length; i++) {
      if (i > 0) z += info.gaps[i - 1];
      const L = 'ABC'.indexOf(stack[i]), off = CS.POS[stack[i]];
      for (let a = -6; a <= 6; a++) for (let b = -6; b <= 6; b++) {
        const x = 2 * a + b + off[0] - cx, y = S3 * b + off[1] - cy;
        if (Math.hypot(x, y) > RP) continue;
        atoms.push({ p: [x, y, z], layer: L, li: i, R: 1, r: k, color: col.L[L], sp: 'm' });
      }
    }
    const H = info.height || 2;
    atoms.forEach(function (a) { a.p[2] -= H / 2; });
    return { kind: 'stack', ver: ver, info: info, seq: stack, atoms: atoms, ghosts: [], bonds: [], voids: [], poly: null, sel: -1, k: k,
      H: H, RP: RP, bound: Math.hypot(RP + 1, H / 2), axis: [0, 0, 1] };
  }
  function rebuild() {
    model = buildModel();
    if (view3 && view3.active) view3.update();
  }

  // ======================= 版面 =======================
  function resize() {
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = w;
    const narrow = cw < 640;
    if (narrow) {
      const h1 = Math.round(Math.min(420, cw * 0.95)), h2 = Math.round(Math.min(380, cw * 0.82));
      ch = h1 + h2;
      PA = { x: 0, y: 0, w: cw, h: h1 }; PB = { x: 0, y: h1, w: cw, h: h2 };
    } else {
      ch = 440;
      const wa = Math.round(cw * 0.56);
      PA = { x: 0, y: 0, w: wa, h: ch }; PB = { x: wa, y: 0, w: cw - wa, h: ch };
    }
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    drawStage();
  }
  function resizeGraph() {
    const w = gcv.clientWidth;
    if (!w) return;
    gw = w; gh = w < 560 ? 280 : 300;
    if (gcv.style.height !== gh + 'px') gcv.style.height = gh + 'px';
    gcv.width = Math.round(gw * dpr); gcv.height = Math.round(gh * dpr);
  }

  // ======================= 畫布小工具 =======================
  const FONT = LD.FONT;
  /** 畫一串有上下標的文字（parts：[[字, 0 一般／1 上標／-1 下標]]），回傳寬度；halo 為背景色描邊 */
  function partsWidth(c, parts, px, weight) {
    let w = 0;
    parts.forEach(function (p) {
      c.font = (weight || 600) + ' ' + (p[1] ? px * 0.72 : px) + 'px ' + FONT;
      w += c.measureText(p[0]).width;
    });
    return w;
  }
  function drawParts(c, parts, x, y, color, px, align, weight, halo) {
    const w = partsWidth(c, parts, px, weight);
    let x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    c.save();
    c.textAlign = 'left'; c.textBaseline = 'middle';
    c.lineJoin = 'round';
    parts.forEach(function (p) {
      const sz = p[1] ? px * 0.72 : px;
      c.font = (weight || 600) + ' ' + sz + 'px ' + FONT;
      const yy = y + (p[1] === 1 ? -px * 0.32 : p[1] === -1 ? px * 0.3 : 0);
      if (halo !== false) { c.strokeStyle = LD.alpha(col.bg, 0.9); c.lineWidth = 3.5; c.strokeText(p[0], x0, yy); }
      c.fillStyle = color;
      c.fillText(p[0], x0, yy);
      x0 += c.measureText(p[0]).width;
    });
    c.restore();
    return w;
  }
  function panelTitle(c, P, text) {
    c.save();
    c.font = '600 12.5px ' + FONT;
    LD.pill(c, text, P.x + 10, P.y + 26, col.muted, 'left', '600 12.5px ' + FONT);
    c.restore();
  }
  /** 平面上的圓（截面：扁平圓盤，有一點立體的明暗） */
  function disk(c, x, y, r, color, alpha, dashed) {
    if (r < 0.5) return;
    c.save();
    c.globalAlpha = alpha == null ? 1 : alpha;
    const g = c.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
    g.addColorStop(0, LD.mix(color, '#ffffff', 0.35));
    g.addColorStop(0.75, color);
    g.addColorStop(1, LD.shade(color, -0.25));
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    c.lineWidth = 1.2;
    c.strokeStyle = LD.shade(color, -0.4);
    if (dashed) c.setLineDash([4, 3]);
    c.stroke();
    c.restore();
  }

  // ======================= 2D：斜視圖 =======================
  function proj(p) {
    const cy = Math.cos(state.yaw), sy = Math.sin(state.yaw), cp = Math.cos(state.pitch), sp = Math.sin(state.pitch);
    const x1 = p[0] * cy - p[1] * sy, y1 = p[0] * sy + p[1] * cy;
    return { x: x1, y: p[2] * cp + y1 * sp, d: y1 * cp - p[2] * sp };
  }
  function boxEdges(M) {
    const E = [];
    const c = M.ctr;
    if (M.cell === 'cube') {
      const n = M.n, V = [];
      for (let i = 0; i < 8; i++) V.push(sub([(i & 1) * n, ((i >> 1) & 1) * n, ((i >> 2) & 1) * n], c));
      for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) { const x = i ^ j; if (x === 1 || x === 2 || x === 4) E.push([V[i], V[j]]); }
    } else {
      const R = M.n, H = M.n * M.ca, top = [], bot = [];
      for (let k = 0; k < 6; k++) { const t = k * Math.PI / 3; bot.push(sub([R * Math.cos(t), R * Math.sin(t), 0], c)); top.push(sub([R * Math.cos(t), R * Math.sin(t), H], c)); }
      for (let k = 0; k < 6; k++) { E.push([bot[k], bot[(k + 1) % 6]]); E.push([top[k], top[(k + 1) % 6]]); E.push([bot[k], top[k]]); }
    }
    return E;
  }
  /** 平面上的凸包（單調鏈） */
  function hull2(pts) {
    const p = pts.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    if (p.length < 3) return p;
    const cr = function (o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); };
    const lo = [], up = [];
    p.forEach(function (q) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); });
    for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    lo.pop(); up.pop();
    return lo.concat(up);
  }
  function drawOblique(c, P, M) {
    const S = Math.min(P.w, P.h - 34) * 0.46 / Math.max(0.6, M.bound);
    const ox = P.x + P.w / 2, oy = P.y + 18 + (P.h - 18) / 2;
    const toS = function (q) { return [ox + S * q.x, oy - S * q.y]; };
    const edges = boxEdges(M).map(function (e) { const a = proj(e[0]), b = proj(e[1]); return { a: a, b: b, d: (a.d + b.d) / 2 }; });
    // 後面的稜（虛線）
    c.save();
    c.lineCap = 'round';
    c.strokeStyle = LD.alpha(col.text, 0.35); c.lineWidth = 1.2; c.setLineDash([4, 4]);
    edges.forEach(function (e) { const A = toS(e.a), B = toS(e.b); c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]); c.stroke(); });
    c.restore();
    // 只看晶胞內：原子裁在晶胞投影的輪廓內（真正的 3D 切法看「3D 立體」）
    const clipHull = M.cut && M.sel < 0 ? hull2(edges.reduce(function (acc, e) { acc.push(toS(e.a), toS(e.b)); return acc; }, [])) : null;
    if (clipHull) {
      c.save();
      c.beginPath(); clipHull.forEach(function (q, i) { if (i) c.lineTo(q[0], q[1]); else c.moveTo(q[0], q[1]); }); c.closePath();
      c.clip();
    }
    // 物件依深度排序（遠的先畫）
    const focus = M.sel >= 0;
    const items = [];
    M.atoms.forEach(function (a, i) { items.push({ o: a, q: proj(a.p), kind: 'atom', i: i }); });
    M.ghosts.forEach(function (a) { items.push({ o: a, q: proj(a.p), kind: 'ghost' }); });
    M.voids.forEach(function (v) { items.push({ o: v, q: proj(v.p), kind: 'void' }); });
    items.sort(function (x, y) { return y.q.d - x.q.d; });
    proj2 = [];
    items.forEach(function (it) {
      const a = it.o, s2 = toS(it.q), r = Math.max(1.5, a.r * S);
      let al = 1;
      if (it.kind === 'ghost') al = 0.55;
      else if (it.kind === 'atom' && focus && !a.sel && !a.nb) al = 0.18;
      else if (it.kind === 'atom' && M.see) al = 0.4;
      else if (it.kind === 'atom' && M.cut && !focus) al = 0.85;
      c.save();
      c.globalAlpha = al;
      LD.ball(c, s2[0], s2[1], r, a.color, { shadow: false, ring: a.sel ? col.accent : null });
      c.restore();
      if (it.kind === 'atom') proj2.push({ x: s2[0], y: s2[1], r: r, i: it.i, d: it.q.d });
      if (a.sel) {
        c.save(); c.strokeStyle = col.accent; c.lineWidth = 2.5;
        c.beginPath(); c.arc(s2[0], s2[1], r + 3, 0, Math.PI * 2); c.stroke(); c.restore();
      }
    });
    if (clipHull) c.restore();
    // 配位：選取原子到鄰居的連線
    if (focus) {
      const A = toS(proj(M.atoms[M.sel].p));
      c.save();
      c.lineCap = 'round';
      M.bonds.forEach(function (b) {
        const B = toS(proj(b[1]));
        c.strokeStyle = LD.alpha(col.dark ? '#000000' : '#ffffff', 0.7); c.lineWidth = 4.5;
        c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]); c.stroke();
        c.strokeStyle = col.accent; c.lineWidth = 2.2;
        c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]); c.stroke();
        c.fillStyle = col.accent;
        c.beginPath(); c.arc(B[0], B[1], 3.2, 0, Math.PI * 2); c.fill();
      });
      c.restore();
      LD.pill(c, T('配位數 ', 'Coordination ') + M.bonds.length, A[0], A[1] - Math.max(14, M.atoms[M.sel].r * S) - 8, col.accent, 'center', '700 13px ' + FONT);
    }
    // 前面的稜（實線）
    c.save();
    c.lineCap = 'round';
    edges.forEach(function (e) {
      if (e.d > 0) return;
      const A = toS(e.a), B = toS(e.b);
      c.strokeStyle = LD.alpha(col.text, 0.75); c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]); c.stroke();
    });
    c.restore();
    // 只看晶胞內的部分：每個原子標出在晶胞內的比例（只在 1 個晶胞時標）
    if (M.cut && M.n === 1 && !focus) {
      const font = '700 11.5px ' + FONT;
      items.forEach(function (it) {
        if (it.kind !== 'atom') return;
        const s2 = toS(it.q);
        c.save();
        if (it.q.d > 0.02) c.globalAlpha = 0.45;   // 後面的原子標籤淡一點
        LD.pill(c, FRAC(it.o.frac), s2[0], s2[1] + 7, it.o.frac === 1 ? col.probe : col.text, 'center', font);
        c.restore();
      });
    }
    panelTitle(c, P, M.n === 1 ? T('晶胞（斜視圖，可拖曳轉動）', 'Unit cell (oblique view — drag to turn)') : T('晶胞 ', 'Cells ') + M.n + ' × ' + M.n + ' × ' + M.n + T('（斜視圖）', ' (oblique view)'));
  }

  // ======================= 2D：真實比例截面 =======================
  function drawSection(c, P, M) {
    const s = M.s, sec = CS.SECTIONS[s], cr = M.cr, m = CS.MATS[state.mat];
    const Rof = function (sp) { return (sp === 'c' ? cr.rc : sp === 'a' ? cr.ra : cr.r) / cr.a; };
    const Rmax = Math.max(Rof('m') || 0, Rof('c') || 0, Rof('a') || 0);
    const list = CS.sectionAtoms(s, M.ca, Rmax);
    let ul = 0, um = 0, wl = 0, wm = 0;
    sec.poly.forEach(function (q) { ul = Math.min(ul, q[0]); um = Math.max(um, q[0]); wl = Math.min(wl, q[1]); wm = Math.max(wm, q[1]); });
    const padT = 34, padB = 26, padX = 22;
    const sc = Math.min((P.w - 2 * padX) / (um - ul + 2 * Rmax), (P.h - padT - padB) / (wm - wl + 2 * Rmax));
    c.save();
    c.beginPath(); c.rect(P.x, P.y, P.w, P.h); c.clip();
    const cxp = P.x + P.w / 2, cyp = P.y + padT + (P.h - padT - padB) / 2;
    const X = function (u) { return cxp + (u - (ul + um) / 2) * sc; };
    const Y = function (w) { return cyp - (w - (wl + wm) / 2) * sc; };
    const polyPath = function () { c.beginPath(); sec.poly.forEach(function (q, i) { if (i) c.lineTo(X(q[0]), Y(q[1])); else c.moveTo(X(q[0]), Y(q[1])); }); c.closePath(); };
    // 晶胞面
    c.save();
    polyPath();
    c.fillStyle = LD.alpha(col.accent, col.dark ? 0.1 : 0.07); c.fill();
    c.restore();
    // 原子截面：先畫整個（淡），再只在晶胞面裡畫（濃）
    const disks = [];
    list.forEach(function (a) {
      const R = Rof(a.sp);
      if (Math.abs(a.h) >= R) return;
      const rr = Math.sqrt(R * R - a.h * a.h);
      disks.push({ x: X(a.u), y: Y(a.w), r: rr * sc, inPlane: Math.abs(a.h) < 1e-9, color: colorOf(a.sp, -1), sp: a.sp });   // 截面不標最密堆積層
    });
    disks.sort(function (p, q) { return (p.inPlane ? 1 : 0) - (q.inPlane ? 1 : 0); });
    disks.forEach(function (d) { disk(c, d.x, d.y, d.r, d.color, d.inPlane ? 0.28 : 0.12, !d.inPlane); });
    c.save();
    polyPath(); c.clip();
    disks.forEach(function (d) { disk(c, d.x, d.y, d.r, d.color, d.inPlane ? 1 : 0.42, !d.inPlane); });
    c.restore();
    c.save();
    polyPath();
    c.strokeStyle = LD.alpha(col.text, 0.8); c.lineWidth = 1.6; c.lineJoin = 'round'; c.stroke();
    c.restore();
    // 相切的方向：粗線＋球心點
    const k0 = sec.contact[0], k1 = sec.contact[1];
    const A = [X(k0[0]), Y(k0[1])], B = [X(k1[0]), Y(k1[1])];
    c.save();
    c.lineCap = 'round';
    c.strokeStyle = LD.alpha(col.dark ? '#000000' : '#ffffff', 0.75); c.lineWidth = 6;
    c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]); c.stroke();
    c.strokeStyle = col.accent; c.lineWidth = 3;
    c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]); c.stroke();
    c.fillStyle = col.accent;
    disks.forEach(function (d) {
      if (!d.inPlane) return;
      // 在接觸線上的球心
      const vx = B[0] - A[0], vy = B[1] - A[1], L2 = vx * vx + vy * vy;
      const t = ((d.x - A[0]) * vx + (d.y - A[1]) * vy) / L2;
      const px = A[0] + t * vx - d.x, py = A[1] + t * vy - d.y;
      if (t > -0.01 && t < 1.01 && Math.hypot(px, py) < 0.5) { c.beginPath(); c.arc(d.x, d.y, 3.4, 0, Math.PI * 2); c.fill(); }
    });
    c.restore();
    // 關係式標在接觸線中點旁
    const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2;
    const ang = Math.atan2(B[1] - A[1], B[0] - A[0]);
    const nx = Math.sin(ang), ny = -Math.cos(ang);
    const parts = CS.relParts(s).map(function (p) { return [p[0], p[1]]; });
    const lx = mx + nx * 18, ly = my + ny * 18;
    const pw = partsWidth(c, parts, 14, 700);
    c.save();
    c.fillStyle = LD.alpha(col.bg, 0.86);
    LD.roundRect(c, lx - pw / 2 - 7, ly - 12, pw + 14, 24, 7); c.fill();
    c.strokeStyle = LD.alpha(col.accent, 0.6); c.lineWidth = 1; c.stroke();
    c.restore();
    drawParts(c, parts, lx, ly, col.accent, 14, 'center', 700, false);
    // 邊長標示
    const dimFont = 'italic 600 13px ' + FONT;
    const dimLine = function (x0, y0, x1, y1, label, off) {
      c.save();
      c.strokeStyle = col.muted; c.fillStyle = col.muted; c.lineWidth = 1.2;
      const a = Math.atan2(y1 - y0, x1 - x0), ox = Math.sin(a) * off, oy = -Math.cos(a) * off;
      LD.arrow(c, (x0 + x1) / 2 + ox, (y0 + y1) / 2 + oy, x0 + ox, y0 + oy, col.muted, 1.2);
      LD.arrow(c, (x0 + x1) / 2 + ox, (y0 + y1) / 2 + oy, x1 + ox, y1 + oy, col.muted, 1.2);
      c.restore();
      LD.haloText(c, label, (x0 + x1) / 2 + ox * 1.9, (y0 + y1) / 2 + oy * 1.9, col.muted, 'center', 'middle', dimFont);
    };
    if (s === 'hcp') {
      dimLine(X(sec.poly[4][0]), Y(sec.poly[4][1]), X(sec.poly[5][0]), Y(sec.poly[5][1]), 'a', -12);
    } else {
      const wq = sec.poly[1][0];
      dimLine(X(0), Y(0), X(wq), Y(0), wq > 1.2 ? '√2 a' : 'a', -14);
      dimLine(X(0), Y(0), X(0), Y(1), 'a', 14);
    }
    c.restore();
    panelTitle(c, P, T('截面 ', 'Section ') + sec.hkl + T('・真實比例', ' · true scale'));
    // 球心在截面外的說明
    if (disks.some(function (d) { return !d.inPlane; })) {
      c.save();
      c.font = '12px ' + FONT;
      LD.haloText(c, T('虛線圓：球心在截面前後', 'dashed: centre off the plane'), P.x + P.w - 10, P.y + P.h - 12, col.muted, 'right', 'middle', '12px ' + FONT);
      c.restore();
    }
  }

  // ======================= 2D：疊疊看 =======================
  function drawStackTop(c, P, M) {
    const RP = M.RP;
    const S = Math.min(P.w, P.h - 40) / (2 * (RP + 1.6));
    const ox = P.x + P.w / 2, oy = P.y + 22 + (P.h - 22) / 2;
    const n = M.seq.length;
    const now = performance.now();
    const dropU = drop ? Math.min(1, (now - drop.t0) / 380) : 1;
    // 由下往上畫：每一層都不透明，往下的層稍暗（真的從上往下看）
    for (let li = 0; li < n; li++) {
      const depth = n - 1 - li;
      const isTop = li === n - 1;
      M.atoms.forEach(function (a) {
        if (a.li !== li) return;
        const colr = depth ? LD.mix(a.color, col.dark ? '#000000' : '#5b6d72', Math.min(0.55, 0.18 * depth)) : a.color;
        c.save();
        if (isTop && dropU < 1) c.globalAlpha = 0.35 + 0.65 * dropU;
        LD.ball(c, ox + a.p[0] * S, oy - a.p[1] * S, a.r * S, colr, { shadow: false });
        c.restore();
      });
    }
    // 三種位置的記號（畫面中央附近各一個）
    const top = M.seq[n - 1];
    ['A', 'B', 'C'].forEach(function (L, i) {
      const off = CS.POS[L];
      const x = ox + (off[0] - 1) * S, y = oy - (off[1] - 1 / S3) * S;
      c.save();
      c.strokeStyle = L === top ? col.text : col.L[i]; c.lineWidth = 2;
      c.fillStyle = LD.alpha(col.bg, 0.85);
      c.beginPath(); c.arc(x, y, Math.max(9, S * 0.36), 0, Math.PI * 2); c.fill(); c.stroke();
      c.restore();
      LD.haloText(c, L, x, y + 0.5, L === top ? col.text : col.L[i], 'center', 'middle', '800 ' + Math.max(11, Math.min(15, S * 0.42)) + 'px ' + FONT);
    });
    panelTitle(c, P, T('從上往下看（最上層：', 'Top view (top layer: ') + top + T('）', ')'));
  }
  function drawStackSide(c, P, M) {
    const info = M.info, n = M.seq.length;
    const Hmax = 2 + (MAXL - 1) * 2;
    const span = 2 * (M.RP + 1);
    const S = Math.min((P.w - 90) / span, (P.h - 56) / Math.max(info.height, 8));
    const ox = P.x + 30 + (P.w - 90) / 2, by = P.y + P.h - 20;
    const now = performance.now();
    const dropU = drop ? Math.min(1, (now - drop.t0) / 380) : 1;
    // 地面
    c.save();
    c.strokeStyle = LD.alpha(col.text, 0.3); c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(ox - (M.RP + 1) * S, by); c.lineTo(ox + (M.RP + 1) * S, by); c.stroke();
    c.restore();
    let z = 1;
    const k = M.k;
    for (let i = 0; i < n; i++) {
      if (i > 0) z += info.gaps[i - 1];
      const L = 'ABC'.indexOf(M.seq[i]), off = CS.POS[M.seq[i]];
      let zz = z;
      if (i === n - 1 && dropU < 1) zz = z + (1 - dropU) * (1 - dropU) * 4;
      const yC = by - zz * S;
      // 沿原子列看：每一列在 y 方向的位置
      for (let j = -6; j <= 6; j++) {
        const y = off[1] - 1 / S3 + S3 * j;
        if (Math.abs(y) > M.RP) continue;
        LD.ball(c, ox + y * S, yC, k * S, col.L[L], { shadow: false });
      }
      LD.haloText(c, M.seq[i], ox - (M.RP + 1) * S - 10, yC, col.L[L], 'right', 'middle', '800 13px ' + FONT);
      if (i > 0 && (i < n - 1 || dropU >= 1)) {
        const g = info.gaps[i - 1];
        const y0 = by - (z - g) * S, y1 = yC;
        const xg = ox + (M.RP + 1) * S + 8;
        c.save(); c.strokeStyle = g > 1.9 ? col.pos : col.muted; c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(xg, y0); c.lineTo(xg, y1); c.moveTo(xg - 3, y0); c.lineTo(xg + 3, y0); c.moveTo(xg - 3, y1); c.lineTo(xg + 3, y1); c.stroke();
        c.restore();
        if (S * g > 15) LD.haloText(c, g > 1.9 ? '2r' : '1.63r', xg + 6, (y0 + y1) / 2, g > 1.9 ? col.pos : col.muted, 'left', 'middle', '600 11.5px ' + FONT);
      }
      if (i > 0 && i < n - 1) {
        const hcI = info.hc[i - 1];
        LD.haloText(c, hcI, ox - (M.RP + 1) * S - 26, yC, col.muted, 'right', 'middle', 'italic 600 12px ' + FONT);
      }
    }
    void Hmax;
    panelTitle(c, P, T('側視（沿著原子列看）', 'Side view (along a row of atoms)'));
  }

  // ======================= 畫主畫布 =======================
  function drawStage() {
    if (!cw || !model) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    LD.backdrop(ctx, cw, ch);
    // 兩個面板之間的分隔線
    ctx.save();
    ctx.strokeStyle = LD.alpha(col.text, 0.1); ctx.lineWidth = 1;
    ctx.beginPath();
    if (PB.x > 0) { ctx.moveTo(PB.x + 0.5, 12); ctx.lineTo(PB.x + 0.5, ch - 12); } else { ctx.moveTo(12, PB.y + 0.5); ctx.lineTo(cw - 12, PB.y + 0.5); }
    ctx.stroke();
    ctx.restore();
    if (model.kind === 'cell') { drawOblique(ctx, PA, model); drawSection(ctx, PB, model); }
    else { drawStackTop(ctx, PA, model); drawStackSide(ctx, PB, model); }
    if (kb && kb.focused && kb.focused()) {
      ctx.save(); ctx.strokeStyle = col.accent; ctx.setLineDash([6, 4]); ctx.lineWidth = 2;
      LD.roundRect(ctx, 3, 3, cw - 6, ch - 6, 8); ctx.stroke(); ctx.restore();
    }
  }
  function animate() {
    if (raf) return;
    raf = requestAnimationFrame(function step() {
      raf = 0;
      drawStage();
      if (view3 && view3.active) view3.frame();
      if (drop && performance.now() - drop.t0 < 400) raf = requestAnimationFrame(step);
      else drop = null;
    });
  }
  function drawAll() {
    drawStage();
    if (view3 && view3.active) view3.frame();
  }

  // ======================= 圖表 =======================
  const FAMILY = { sc: 0, bcc: 1, fcc: 2, hcp: 2, nacl: 3, cscl: 3, zns: 3, diamond: 4 };
  function familyColor(s) { return [col.equi, col.neg, col.accent, col.pos, col.muted][FAMILY[s]]; }
  function drawGraph() {
    if (!gw) return;
    const c = gctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    LD.backdrop(c, gw, gh);
    const L = 54, R = gw - 16, Tp = 18, B = gh - 40;
    const font = '12px ' + FONT;
    const cr = state.mode === 'cell' ? cryst() : null;
    if (state.tab === 'cn') {
      const X = function (v) { return L + (v - 2) / 12 * (R - L); }, Y = function (v) { return B - (v - 20) / 60 * (B - Tp); };
      c.save();
      c.strokeStyle = LD.alpha(col.text, 0.08); c.lineWidth = 1;
      for (let v = 20; v <= 80; v += 10) { c.beginPath(); c.moveTo(L, Y(v) + 0.5); c.lineTo(R, Y(v) + 0.5); c.stroke(); }
      for (let v = 4; v <= 12; v += 2) { c.beginPath(); c.moveTo(X(v) + 0.5, Tp); c.lineTo(X(v) + 0.5, B); c.stroke(); }
      c.strokeStyle = LD.alpha(col.text, 0.6);
      c.beginPath(); c.moveTo(L, Tp); c.lineTo(L, B); c.lineTo(R, B); c.stroke();
      c.restore();
      c.save(); c.font = font; c.fillStyle = col.muted; c.textAlign = 'right'; c.textBaseline = 'middle';
      for (let v = 20; v <= 80; v += 10) c.fillText(v + '%', L - 6, Y(v));
      c.textAlign = 'center'; c.textBaseline = 'top';
      for (let v = 4; v <= 12; v += 2) c.fillText(String(v), X(v), B + 5);
      c.fillText(T('配位數', 'Coordination number'), (L + R) / 2, B + 21);
      c.restore();
      c.save(); c.translate(13, (Tp + B) / 2); c.rotate(-Math.PI / 2); c.font = font; c.fillStyle = col.muted; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(T('堆積率', 'Packing fraction'), 0, 0); c.restore();
      // 最密堆積的上限
      const yk = Y(74.05);
      c.save(); c.strokeStyle = col.pos; c.setLineDash([6, 4]); c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(L, yk); c.lineTo(R, yk); c.stroke(); c.restore();
      const kep = R - L > 520 ? T('最密堆積 74.05%（克卜勒猜想的上限）', 'close packing 74.05% (Kepler’s upper limit)') : T('最密堆積 74.05%', 'close packing 74.05%');
      LD.haloText(c, kep, L + 8, yk - 9, col.pos, 'left', 'middle', '600 11.5px ' + FONT);
      // 每個物質一點
      const shift = { sc: 0, bcc: 0, fcc: -0.18, hcp: 0.18, nacl: 0, cscl: 0.18, zns: 0.18, diamond: -0.18 };
      CS.MAT_ORDER.forEach(function (k) {
        const x = CS.crystal(k), m = CS.MATS[k];
        const px = X(x.CN + shift[m.s]), py = Y(x.pf * 100);
        const ionic = CS.STRUCTS[m.s].kind === 'ionic';
        c.save();
        c.fillStyle = familyColor(m.s); c.strokeStyle = familyColor(m.s); c.lineWidth = 1.6;
        if (ionic) { c.strokeRect(px - 4, py - 4, 8, 8); } else { c.beginPath(); c.arc(px, py, 4, 0, Math.PI * 2); c.fill(); }
        c.restore();
      });
      // 目前的晶體／疊好的層
      let cur = null, lab = '';
      if (cr) { cur = { x: X(cr.CN + shift[cr.s]), y: Y(cr.pf * 100) }; lab = (state.hypo ? T('假想 ', 'imag. ') : '') + CS.MATS[state.mat].sym + ' ' + pct(cr.pf); }
      else {
        const info = CS.stackInfo(stack);
        if (info.cnMid != null) { cur = { x: X(info.cnMid), y: Y(info.pf * 100) }; lab = stack + ' ' + pct(info.pf); }
      }
      if (cur) {
        c.save(); c.strokeStyle = col.text; c.lineWidth = 2.2;
        c.beginPath(); c.arc(cur.x, cur.y, 9, 0, Math.PI * 2); c.stroke(); c.restore();
        LD.pill(c, lab, Math.min(R - 40, Math.max(L + 40, cur.x)), cur.y - 13, col.text, 'center', '700 12px ' + FONT);
      }
    } else {
      // 算出的密度 vs 實測密度（對數座標）
      const lo = Math.log10(0.4), hi = Math.log10(30);
      const X = function (v) { return L + (Math.log10(v) - lo) / (hi - lo) * (R - L); }, Y = function (v) { return B - (Math.log10(v) - lo) / (hi - lo) * (B - Tp); };
      const ticks = [0.5, 1, 2, 5, 10, 20];
      c.save();
      c.strokeStyle = LD.alpha(col.text, 0.08); c.lineWidth = 1;
      ticks.forEach(function (v) { c.beginPath(); c.moveTo(L, Y(v) + 0.5); c.lineTo(R, Y(v) + 0.5); c.stroke(); c.beginPath(); c.moveTo(X(v) + 0.5, Tp); c.lineTo(X(v) + 0.5, B); c.stroke(); });
      c.strokeStyle = LD.alpha(col.text, 0.6);
      c.beginPath(); c.moveTo(L, Tp); c.lineTo(L, B); c.lineTo(R, B); c.stroke();
      // y = x
      c.strokeStyle = LD.alpha(col.accent, 0.7); c.setLineDash([6, 4]); c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(X(0.4), Y(0.4)); c.lineTo(X(30), Y(30)); c.stroke();
      c.restore();
      c.save(); c.font = font; c.fillStyle = col.muted; c.textAlign = 'right'; c.textBaseline = 'middle';
      ticks.forEach(function (v) { c.fillText(String(v), L - 6, Y(v)); });
      c.textAlign = 'center'; c.textBaseline = 'top';
      ticks.forEach(function (v) { c.fillText(String(v), X(v), B + 5); });
      c.fillText(T('實測密度（g/cm³）', 'Measured density (g/cm³)'), (L + R) / 2, B + 21);
      c.restore();
      c.save(); c.translate(13, (Tp + B) / 2); c.rotate(-Math.PI / 2); c.font = font; c.fillStyle = col.muted; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(T('由晶格常數算出（g/cm³）', 'From the lattice constant (g/cm³)'), 0, 0); c.restore();
      LD.haloText(c, T('兩者相等', 'equal'), X(22), Y(22) - 12, col.accent, 'right', 'middle', '600 11.5px ' + FONT);
      CS.MAT_ORDER.forEach(function (k) {
        const x = CS.crystal(k);
        if (x.rhoExp == null) return;
        const px = X(x.rhoExp), py = Y(x.rho);
        c.save(); c.fillStyle = familyColor(x.s);
        c.beginPath(); c.arc(px, py, 4, 0, Math.PI * 2); c.fill(); c.restore();
        if (gw > 520) LD.haloText(c, CS.MATS[k].sym, px + 6, py + 8, col.muted, 'left', 'middle', '10.5px ' + FONT);
      });
      if (cr && cr.rhoExp != null && !(quizS && !quizS.closed && quizS.q.type === 'rho')) {
        const px = X(cr.rhoExp), py = Y(cr.rho);
        c.save(); c.strokeStyle = col.text; c.lineWidth = 2.2; c.beginPath(); c.arc(px, py, 9, 0, Math.PI * 2); c.stroke(); c.restore();
        LD.pill(c, CS.MATS[state.mat].sym + ' ' + T('差 ', 'diff. ') + signPct(cr.rhoErr), Math.min(R - 50, Math.max(L + 50, px)), py - 14, col.text, 'center', '700 12px ' + FONT);
      }
    }
  }
  function updateGraphText() {
    const lg = $('gLegend');
    const items = [['sc', T('簡單立方', 'simple cubic')], ['bcc', T('體心立方', 'body-centred cubic')], ['fcc', T('最密堆積', 'close-packed')], ['diamond', T('鑽石型', 'diamond')]];
    let h = items.map(function (it) { return '<span><i class="dot" style="background:' + familyColor(it[0]) + '"></i>' + it[1] + '</span>'; }).join('');
    h += '<span><i class="dot" style="background:transparent;border:2px solid ' + familyColor('nacl') + ';border-radius:2px"></i>' + T('離子晶體（估算）', 'ionic (estimated)') + '</span>';
    lg.innerHTML = h;
    $('gHint').textContent = state.tab === 'cn' ?
      T('每一點是一種物質。配位數越多，排得越密；兩種最密堆積（12 個鄰居）都是 74.05%，硬球不可能更密。鋅、鈹、鈦的 c/a 不是理想值，所以略低。',
        'Each dot is a substance. More neighbours means tighter packing; both close-packed structures (12 neighbours) reach 74.05%, and hard spheres can do no better. Zinc, beryllium and titanium have non-ideal c/a, so they fall a little short.') :
      T('X 光量到的晶格常數算出的密度，和直接秤重量體積得到的密度，幾乎都落在虛線上（相差多半不到 0.5%）。',
        'The density worked out from the X-ray lattice constant and the density measured by weighing almost all lie on the dashed line (mostly within 0.5%).');
  }

  // ======================= 讀數 =======================
  function zBreakdown(s, ca) {
    const at = CS.cellAtoms(s, ca, 1), groups = {};
    const ROLE = { corner: ['角', 'corners'], edge: ['稜', 'edges'], face: ['面心', 'faces'], side: ['側面', 'sides'], inside: ['內部', 'inside'] };
    at.forEach(function (a) { const k = a.sp + '|' + a.role + '|' + a.frac.toFixed(5); groups[k] = groups[k] || { sp: a.sp, role: a.role, f: a.frac, n: 0 }; groups[k].n++; });
    const bySp = {};
    Object.keys(groups).forEach(function (k) { const g = groups[k]; (bySp[g.sp] = bySp[g.sp] || []).push(g); });
    const order = { corner: 0, edge: 1, side: 2, face: 3, inside: 4 };
    const out = {};
    Object.keys(bySp).forEach(function (sp) {
      const gs = bySp[sp].sort(function (x, y) { return order[x.role] - order[y.role]; });
      let tot = 0;
      const terms = gs.map(function (g) {
        tot += g.n * g.f;
        return (g.f === 1 ? g.n + '' : g.n + ' × ' + FRAC(g.f)) + '<small style="display:inline;color:inherit">' + T('（' + ROLE[g.role][0] + '）', ' (' + ROLE[g.role][1] + ')') + '</small>';
      });
      out[sp] = { html: terms.join(' + ') + ' = ' + num(tot, 0), total: tot };
    });
    return out;
  }
  function row(dt, dd, cls) { return '<dt>' + dt + '</dt><dd' + (cls ? ' class="' + cls + '"' : '') + '>' + dd + '</dd>'; }
  function updateReadouts() {
    const ro = $('readout');
    if (state.mode === 'stack') {
      $('roTitle').textContent = T('疊好的層', 'The stack');
      const info = CS.stackInfo(stack);
      let h = row(T('層數', 'Layers'), String(info.n));
      h += row(T('排列', 'Sequence'), '<b style="letter-spacing:.08em">' + stack + '</b>');
      h += row(T('中間各層的環境', 'Environment of the middle layers') + '<small>' + T('h：上下兩層位置相同；c：不同', 'h: layers above and below match; c: they differ') + '</small>', info.hc ? info.hc.split('').join(' ') : '—');
      h += row(T('判定', 'Verdict'), stackName(info.type), 'big');
      h += row(T('堆積率', 'Packing fraction') + '<small>' + T('這個排列無限重複時', 'for the pattern repeated forever') + '</small>', info.pf == null ? '—' : pct(info.pf), 'big');
      h += row(T('中間那層的配位數', 'Coordination of the middle layer'), info.cnMid == null ? '—' : String(info.cnMid));
      h += row(T('總高度', 'Total height'), info.n ? num(info.height, 2) + ' r' : '—');
      ro.innerHTML = h;
      return;
    }
    $('roTitle').textContent = T('這個晶體', 'This crystal');
    const cr = cryst(), m = CS.MATS[state.mat], st = CS.STRUCTS[cr.s];
    const hideRho = quizS && !quizS.closed && quizS.q.type === 'rho';
    const hideR = quizS && !quizS.closed && quizS.q.type === 'r';
    const zb = zBreakdown(cr.s, cr.ca || CS.CA_IDEAL);
    let h = row(T('結構', 'Structure'), sName(cr.s) + (cr.hypo ? '<small>' + T('假想：', 'imaginary: ') + mName(state.mat) + T(' 的原子', ' atoms') + '</small>' : ''));
    if (st.kind === 'ionic') {
      h += row(T('每個晶胞', 'Per unit cell'), ionH(m, 'a') + T('：', ': ') + zb.a.html + '<br>' + ionH(m, 'c') + T('：', ': ') + zb.c.html + '<small>' + T('＝ ', '= ') + st.Z + T(' 個 ', ' formula units of ') + m.sym + '</small>');
      h += row(T('配位數', 'Coordination number'), st.CN + '<small>' + T('每個 ', 'each ') + ionH(m, 'c') + T(' 周圍 ', ' has ') + st.CN + T(' 個 ', ' ') + ionH(m, 'a') + T('，反過來也一樣', ' around it, and vice versa') + '</small>', 'big');
    } else {
      h += row(T('每個晶胞的原子數 Z', 'Atoms per cell Z'), zb.m.html, 'big');
      let cn = String(st.CN);
      if (cr.s === 'hcp' && cr.ca && Math.abs(cr.ca - CS.CA_IDEAL) > 0.01) {
        const nb = CS.neighbors('hcp', cr.ca, [0, 0, 0], 'm');
        const d1 = nb.d1 * cr.a, d2 = nb.d2 * cr.a;
        cn += '<small>' + T('6 個 ', '6 at ') + num(Math.min(d1, d2), 0) + ' pm' + T('＋6 個 ', ' + 6 at ') + num(Math.max(d1, d2), 0) + ' pm</small>';
      }
      h += row(T('配位數', 'Coordination number'), cn, 'big');
    }
    if (hideR) h += row(T('晶格常數', 'Lattice constant'), '?');
    else {
      let lat = 'a = ' + num(cr.a, cr.hypo ? 1 : 2) + ' pm';
      if (cr.c) lat += '<br>c = ' + num(cr.c, cr.hypo ? 1 : 2) + ' pm<small>c/a = ' + num(cr.ca, 3) + T('（理想 1.633）', ' (ideal 1.633)') + '</small>';
      h += row(T('晶格常數', 'Lattice constant') + (cr.hypo ? '<small>' + T('由原子半徑推算', 'from the radius') + '</small>' : '<small>' + T('X 光繞射實測', 'measured by X-ray diffraction') + '</small>'), lat);
    }
    if (st.kind === 'ionic') {
      h += row(T('離子半徑', 'Ionic radii') + '<small>' + T('依 Shannon 比例放大到相切', 'Shannon ratio, scaled to touch') + '</small>',
        'r(' + ionH(m, 'c') + ') = ' + num(cr.rc, 1) + ' pm<br>r(' + ionH(m, 'a') + ') = ' + num(cr.ra, 1) + ' pm<small>' + T('半徑比 ', 'radius ratio ') + num(cr.ratio, 3) + '</small>');
    } else {
      h += row((st.kind === 'covalent' ? T('原子半徑（共價）', 'Atomic radius (covalent)') : T('原子半徑（金屬）', 'Atomic radius (metallic)')), hideR ? '?' : 'r = ' + num(cr.r, 1) + ' pm');
    }
    h += row(T('相切的方向', 'Where the spheres touch'), relHTML(cr.s));
    h += row(T('堆積率', 'Packing fraction') + (st.kind === 'ionic' ? '<small>' + T('用離子半徑估算', 'estimated with the ionic radii') + '</small>' : ''), pct(cr.pf), 'big');
    h += row(T('密度（由晶格常數算）', 'Density (from the lattice constant)'), hideRho ? '?' : num(cr.rho, 3) + ' g/cm³', 'big');
    if (cr.hypo) h += row(T('實測密度', 'Measured density'), T('—（假想的晶體）', '— (imaginary crystal)'));
    else if (cr.rhoExp == null) h += row(T('實測密度', 'Measured density'), T('—（', '— (') + num(m.T, 0) + T(' °C 的數據只有 X 光）', ' °C: X-ray data only)'));
    else h += row(T('實測密度', 'Measured density'), num(cr.rhoExp, 3) + ' g/cm³' + (hideRho ? '' : '<small>' + T('差 ', 'difference ') + signPct(cr.rhoErr) + '</small>'));
    if (model && model.voids.length) {
      const VN = { oct: ['八面體空隙', 'octahedral holes'], tet: ['四面體空隙', 'tetrahedral holes'], cube: ['立方體空隙', 'cubic hole'] };
      CS.voidTypes(cr.s).forEach(function (t) {
        if (!state.vo[t]) return;
        const vi = CS.VOID_INFO[cr.s][t];
        const v = model.voids.filter(function (q) { return q.type === t; })[0];
        const ratio = v ? v.R / (cr.r / cr.a) : vi.ratio;
        h += row(T(VN[t][0], VN[t][1]) + '<small>' + T('每個晶胞', 'per cell') + '</small>', vi.n + T(' 個', '') + '<small>' + T('能容納半徑 ', 'fits a sphere of ') + num(ratio, 3) + ' r' + T('（', ' (') + num(ratio * cr.r, 0) + ' pm' + T('）', ')') + '</small>');
      });
    }
    ro.innerHTML = h;
  }
  function relHTML(s) {
    return CS.relParts(s).map(function (p) { return p[1] === -1 ? '<sub>' + p[0] + '</sub>' : p[0]; }).join('');
  }

  // ======================= 圖例、說明 =======================
  function updateLegend() {
    const lg = $('legend');
    let h = '';
    const dot = function (c, t, extra) { return '<span><i class="dot" style="background:' + c + (extra || '') + '"></i>' + t + '</span>'; };
    if (state.mode === 'stack') {
      h = dot(col.L[0], T('A 層', 'layer A')) + dot(col.L[1], T('B 層', 'layer B')) + dot(col.L[2], T('C 層', 'layer C'));
      h += '<span><i class="ln" style="background:' + col.pos + '"></i>' + T('層距 2r：疊在正上方', 'gap 2r: right on top') + '</span>';
    } else {
      const m = CS.MATS[state.mat], st = CS.STRUCTS[state.s];
      if (state.layers && (state.s === 'fcc' || state.s === 'hcp')) {
        h += dot(col.L[0], T('A 層', 'layer A')) + dot(col.L[1], T('B 層', 'layer B'));
        if (state.s === 'fcc') h += dot(col.L[2], T('C 層', 'layer C'));
      } else if (st.kind === 'ionic') {
        h += '<span><i class="dot" style="background:' + col.lift(m.cc) + '"></i>' + ionH(m, 'c') + '</span><span><i class="dot" style="background:' + col.lift(m.ca) + '"></i>' + ionH(m, 'a') + '</span>';
      } else h += dot(col.lift(m.col), mName(state.mat));
      if (state.vo.oct && st.voids && st.voids.oct) h += dot(col.void.oct, T('八面體空隙', 'octahedral hole'));
      if (state.vo.tet && st.voids && st.voids.tet) h += dot(col.void.tet, T('四面體空隙', 'tetrahedral hole'));
      if (state.vo.cube && st.voids && st.voids.cube) h += dot(col.void.cube, T('立方體空隙', 'cubic hole'));
      if (state.coord) h += '<span><i class="ln" style="background:' + col.accent + '"></i>' + T('最近的鄰居', 'nearest neighbours') + '</span>';
    }
    lg.innerHTML = h;
    $('stageHint').textContent = state.mode === 'stack' ?
      T('左：從上往下看，圓圈標出 A、B、C 三種位置；右：沿著原子列從側面看，看得出每一層的高度。', 'Left: looking down, with rings marking the A, B and C positions. Right: looking along a row of atoms from the side, so you can see the height of every layer.') :
      T('左：晶胞的斜視圖（拖曳轉動；勾「顯示配位數」後點原子可以換一個）；右：通過「球彼此相切」那個平面的真實比例截面。', 'Left: an oblique view of the cell (drag to turn it; with “Show coordination” on, tap an atom to pick it). Right: a true-scale cross-section through the plane in which the spheres touch.');
  }

  // ======================= 介面同步 =======================
  function syncUI() {
    const st = CS.STRUCTS[state.s], metal = CS.METALS.indexOf(state.s) >= 0;
    document.querySelectorAll('#modeSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode)); });
    const cell = state.mode === 'cell';
    $('cellCard').hidden = !cell;
    $('stackCard').hidden = cell;
    $('dispChecks').hidden = !cell;
    $('cellsSeg').hidden = !cell;
    $('record').textContent = T('記下來', 'Record');
    document.querySelectorAll('#structSeg1 button, #structSeg2 button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.s === state.s));
      const dis = state.hypo && CS.METALS.indexOf(b.dataset.s) < 0;
      b.disabled = dis;
      if (dis) b.title = T('「保持同一種原子」只能換成四種金屬排法', '“Keep the same atoms” works only with the four metal packings'); else b.removeAttribute('title');
    });
    // 物質選單
    const sel = $('matSel');
    const list = state.hypo ? [state.mat] : CS.matsOf(state.s);
    sel.innerHTML = '';
    list.forEach(function (k) {
      const o = document.createElement('option');
      o.value = k; o.textContent = mName(k) + (state.hypo ? T('（原本是', ' (really ') + sName(CS.MATS[k].s) + T('）', ')') : '');
      sel.appendChild(o);
    });
    sel.value = state.mat;
    sel.disabled = state.hypo || list.length < 2;
    // 假想
    const hy = $('hypo');
    hy.checked = state.hypo;
    hy.disabled = !metal;
    $('hypoLab').classList.toggle('off', !metal);
    const m = CS.MATS[state.mat];
    let info = '';
    if (state.hypo) info = T('假想：' + m.zh + '的原子（半徑 ' + num(CS.crystal(state.mat).r, 1) + ' pm）排成' + st.zh + '。原本是' + CS.STRUCTS[m.s].zh + '。',
      'Imaginary: ' + m.en.toLowerCase() + ' atoms (radius ' + num(CS.crystal(state.mat).r, 1) + ' pm) packed as ' + st.en.toLowerCase() + '. Really ' + CS.STRUCTS[m.s].en.toLowerCase() + '.');
    else if (m.hot) info = T('高溫的數據（' + m.T + ' °C，X 光繞射）。鐵在 912 °C 由 α（體心立方）變成 γ（面心立方）。', 'High-temperature data (' + m.T + ' °C, X-ray diffraction). At 912 °C iron changes from α (body-centred cubic) to γ (face-centred cubic).');
    else if (!metal) info = T('離子晶體與共價網狀晶體不能用「保持同一種原子」。', '“Keep the same atoms” is only for the metal packings.');
    $('matInfo').textContent = info;
    // 顯示選項
    $('cut').checked = state.cut;
    $('coord').checked = state.coord;
    const vts = CS.voidTypes(state.s);
    [['voOct', 'oct'], ['voTet', 'tet'], ['voCube', 'cube']].forEach(function (p) {
      $(p[0] + 'Lab').hidden = vts.indexOf(p[1]) < 0;
      $(p[0]).checked = state.vo[p[1]] && vts.indexOf(p[1]) >= 0;
    });
    const lay = state.s === 'fcc' || state.s === 'hcp';
    $('layers').disabled = !lay;
    $('layers').checked = state.layers && lay;
    $('layersLab').classList.toggle('off', !lay);
    document.querySelectorAll('#cellsSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(+b.dataset.n === state.n)); });
    let dh = '';
    if (!vts.length) dh = st.kind === 'ionic' ? T('離子晶體：較小的陽離子已經坐在陰離子堆積的空隙裡（見下方說明）。', 'Ionic crystals: the smaller cations already sit in the holes between the anions (see the notes below).') :
      T('鑽石型：一半的四面體空隙已經坐了原子。', 'Diamond: half of the tetrahedral holes already hold atoms.');
    else if (!lay) dh = T('「標出最密堆積層」只用在面心立方與六方最密。', '“Colour the close-packed layers” applies only to face-centred cubic and hexagonal close packing.');
    $('dispHint').textContent = dh;
    // 疊疊看
    const full = stack.length >= MAXL;
    ['A', 'B', 'C'].forEach(function (L) { $('add' + L).disabled = full; });
    $('undo').disabled = stack.length <= 1;
    $('seqOut').textContent = stack;
    const info2 = CS.stackInfo(stack);
    $('stackHint').textContent = full ? T('最多 ' + MAXL + ' 層。', 'At most ' + MAXL + ' layers.') : stackName(info2.type);
    // 3D 的按鈕
    $('axisBtn').hidden = !(view3 && view3.active && (state.mode === 'stack' || state.s === 'fcc' || state.s === 'hcp'));
    // 題型（這個物質不適用的題型停用，選著的話改回求密度）
    if (!CS.quizAllowed(state.qType, state.mat)) state.qType = 'rho';
    document.querySelectorAll('#qType button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.q === state.qType));
      const okT = CS.quizAllowed(b.dataset.q, state.mat);
      b.disabled = !okT;
    });
    $('qNew').disabled = state.mode !== 'cell';
  }
  function refreshAll() {
    syncUI();
    rebuild();
    updateLegend();
    updateReadouts();
    updateTable();
    drawAll();
    drawGraph();
  }

  // ======================= 比較表 =======================
  function updateTable() {
    const el = $('tbl');
    let h = '<thead><tr><th>#</th><th class="l">' + T('結構', 'Structure') + '</th><th class="l">' + T('物質', 'Substance') + '</th><th>Z</th><th>' + T('配位數', 'C.N.') +
      '</th><th>' + T('堆積率', 'Packing') + '</th><th>a<br><small>pm</small></th><th>r<br><small>pm</small></th><th>' + T('密度', 'Density') + '<br><small>g/cm³</small></th></tr></thead><tbody>';
    if (!rows.length) h += '<tr class="empty"><td colspan="9">' + T('按「記下來」把目前的晶體加進來，比較不同排法。', 'Press “Record” to add the current crystal and compare packings.') + '</td></tr>';
    rows.forEach(function (r, i) {
      if (r.stack) {
        h += '<tr><td>' + (i + 1) + '</td><td class="l">' + T('疊疊看', 'Stack') + ' ' + r.stack + '</td><td class="l">' + stackName(r.type) + '</td><td>—</td><td>' + (r.cn == null ? '—' : r.cn) + '</td><td>' + (r.pf == null ? '—' : pct(r.pf)) + '</td><td>—</td><td>—</td><td>—</td></tr>';
        return;
      }
      const m = CS.MATS[r.mat];
      h += '<tr><td>' + (i + 1) + '</td><td class="l">' + T(CS.STRUCTS[r.s].zh, CS.STRUCTS[r.s].en) + (r.hypo ? T('（假想）', ' (imag.)') : '') + '</td><td class="l">' + T(m.zh, m.en) + '</td><td>' + r.Z + '</td><td>' + r.CN +
        '</td><td>' + pct(r.pf) + '</td><td>' + num(r.a, 1) + '</td><td>' + (r.r == null ? num(r.rc, 0) + ' / ' + num(r.ra, 0) : num(r.r, 1)) + '</td><td>' + num(r.rho, 3) + '</td></tr>';
    });
    el.innerHTML = h + '</tbody>';
  }
  function record() {
    acted();
    let r;
    if (state.mode === 'stack') {
      const info = CS.stackInfo(stack);
      r = { stack: stack, type: info.type, pf: info.pf, cn: info.cnMid };
    } else {
      const cr = cryst();
      r = { s: cr.s, mat: state.mat, hypo: cr.hypo, Z: cr.Z, CN: cr.CN, pf: cr.pf, a: cr.a, r: cr.r != null ? cr.r : null, rc: cr.rc, ra: cr.ra, rho: cr.rho, rhoExp: cr.rhoExp };
    }
    rows.push(r);
    if (rows.length > 30) rows.shift();
    updateTable();
    const s = snd(); if (s) s.tone({ freq: 880, dur: 0.06, type: 'triangle', gain: 0.08 });
    setStatus(T('已記下第 ' + rows.length + ' 筆。', 'Recorded row ' + rows.length + '.'));
    if (window.LabMission) window.LabMission.emit('record', { row: r, rows: rows.slice() });
  }

  // ======================= 任務事件 =======================
  function emitCell() {
    if (!userActed || !window.LabMission || state.mode !== 'cell' || !model || model.kind !== 'cell') return;
    const cr = model.cr, info = CS.stackInfo(stack);
    const A = model.sel >= 0 ? model.atoms[model.sel] : null;
    window.LabMission.emit('cell', {
      s: state.s, mat: state.mat, hypo: state.hypo, cut: state.cut, coord: state.coord,
      voids: { oct: !!state.vo.oct, tet: !!state.vo.tet, cube: !!state.vo.cube }, layers: model.layers, n: state.n, size: state.size, view: state.view,
      selSp: A ? A.sp : null, selCN: A ? model.bonds.length : null, selIn: A ? A.frac === 1 : null, Z: cr.Z, CN: cr.CN, pf: cr.pf, rho: cr.rho, stackType: info.type, stackN: info.n
    });
  }
  function emitStack() {
    if (!userActed || !window.LabMission) return;
    const info = CS.stackInfo(stack);
    window.LabMission.emit('stack', { seq: stack, n: info.n, type: info.type, hc: info.hc, pf: info.pf, cn: info.cnMid });
  }

  // ======================= 動手算 =======================
  function closeQuiz(msg) {
    if (!quizS || quizS.closed) return;
    quizS.closed = true;
    $('qBox').hidden = true;
    if (msg) $('qOut').innerHTML = msg;
  }
  function newQuiz() {
    acted();
    if (state.mode !== 'cell') return;
    if (!CS.quizAllowed(state.qType, state.mat)) state.qType = 'rho';
    if (quizS && !quizS.closed && !quizS.answered) { qStreak = 0; qKinds = {}; }
    const q = CS.quiz(state.qType, state.mat);
    quizS = { q: q, tries: 0, revealed: false, closed: false, answered: false };
    const m = CS.MATS[state.mat], g = q.given;
    const sN = sName(g.s), mN = mName(state.mat);
    const lat = 'a = ' + num(g.a, 2) + ' pm' + (g.c ? T('、', ', ') + 'c = ' + num(g.c, 2) + ' pm' : '');
    const Mx = 'M = ' + num(g.M, g.M < 10 ? 4 : g.M < 100 ? 3 : 2) + ' g/mol';
    const rhoT = 'ρ = ' + sigf(g.rho, 4) + ' g/cm³';
    const kind = CS.STRUCTS[g.s].kind;
    const who = kind === 'ionic' ? mN + '（' + m.sym + '）' : mN;
    let t;
    if (q.type === 'rho') t = T(who + '是' + sN + '，' + lat + '，' + Mx + '。求密度（g/cm³）。', mN + ' is ' + sN.toLowerCase() + ' with ' + lat + ' and ' + Mx + '. Find the density (g/cm³).');
    else if (q.type === 'r') t = T(who + '是' + sN + (g.ca ? '（c/a = ' + num(g.ca, 3) + '）' : '') + '，' + rhoT + '，' + Mx + '。求原子半徑（pm）。',
      mN + ' is ' + sN.toLowerCase() + (g.ca ? ' (c/a = ' + num(g.ca, 3) + ')' : '') + ' with ' + rhoT + ' and ' + Mx + '. Find the atomic radius (pm).');
    else t = T(who + '是' + sN + '，' + lat + '，' + rhoT + '，' + Mx + '。求亞佛加厥數（填 10<sup>23</sup> 的倍數，例如 6.02）。',
      mN + ' is ' + sN.toLowerCase() + ' with ' + lat + ', ' + rhoT + ' and ' + Mx + '. Find Avogadro’s number (as a multiple of 10<sup>23</sup>, e.g. 6.02).');
    if (q.type !== 'NA') t += T('（N<sub>A</sub> = 6.022 × 10<sup>23</sup> mol<sup>−1</sup>）', ' (N<sub>A</sub> = 6.022 × 10<sup>23</sup> mol<sup>−1</sup>)');
    $('qText').innerHTML = t;
    $('qLabel').innerHTML = q.type === 'rho' ? T('密度（g/cm³）', 'Density (g/cm³)') : q.type === 'r' ? T('原子半徑（pm）', 'Radius (pm)') : 'N<sub>A</sub>（× 10<sup>23</sup> mol<sup>−1</sup>）';
    $('qAns').value = '';
    $('qAns').placeholder = q.type === 'rho' ? T('例如 8.93', 'e.g. 8.93') : q.type === 'r' ? T('例如 128', 'e.g. 128') : T('例如 6.02', 'e.g. 6.02');
    $('qBox').hidden = false;
    $('qCheck').disabled = false; $('qReveal').disabled = false;
    $('qOut').textContent = qStreak ? T('目前連續答對 ' + qStreak + ' 題。', 'Correct in a row: ' + qStreak + '.') : '';
    updateReadouts(); drawGraph();
    const s = snd(); if (s) s.tone({ freq: 660, dur: 0.07, gain: 0.07 });
  }
  function parseAns(str) {
    let s = String(str || '').trim().replace(/，/g, ',').replace(/\s+/g, '').replace(/[×x]10\^?/i, 'e');
    if (/^\d+,\d+$/.test(s)) s = s.replace(',', '.');
    const v = parseFloat(s);
    return isFinite(v) ? v : null;
  }
  function checkQuiz() {
    acted();
    if (!quizS || quizS.closed || quizS.answered) return;
    let v = parseAns($('qAns').value);
    if (v == null || v <= 0) { $('qOut').textContent = T('請填一個正數。', 'Please type a positive number.'); return; }
    const q = quizS.q;
    let ans = q.ans;
    if (q.type === 'NA') { if (v > 1e10) v = v / 1e23; ans = q.ans / 1e23; }
    const err = CS.relErr(v, ans);
    const ok = Math.abs(err) <= 0.01 && !quizS.revealed;
    quizS.tries++;
    if (ok) {
      quizS.answered = true;
      qStreak++; qKinds[q.type] = true;
      if (q.type === 'rho') rhoOk[q.given.s] = true;
      $('qCheck').disabled = true; $('qReveal').disabled = true;
      $('qOut').innerHTML = '<span class="ok">' + T('答對了！', 'Correct!') + '</span> ' + T('誤差 ', 'Error ') + signPct(err) + T('。連續答對 ', '. In a row: ') + qStreak + T(' 題。', '.');
    } else {
      qStreak = 0; qKinds = {};
      $('qOut').innerHTML = '<span class="no">' + T('還差一點。', 'Not yet.') + '</span> ' + T('你的答案偏', 'Your answer is ') + (err > 0 ? T('大', 'too large') : T('小', 'too small')) +
        T('了 ', ' by ') + num(Math.abs(err) * 100, 1) + '%' + T('。檢查 Z、單位（1 pm = 10', '. Check Z and the units (1 pm = 10') + '<sup>−10</sup> cm' + T('）再算一次。', ') and try again.');
    }
    const s = snd();
    if (s) { if (ok) { s.tone({ freq: 784, dur: 0.1, gain: 0.14 }); s.tone({ freq: 1047, dur: 0.16, gain: 0.12, delay: 0.09 }); } else s.sweep({ from: 392, to: 262, dur: 0.25, gain: 0.12, type: 'triangle' }); }
    if (ok) { updateReadouts(); drawGraph(); }
    if (window.LabMission) window.LabMission.emit('answer', { type: q.type, mat: q.mat, s: q.given.s, err: err, ok: ok, revealed: quizS.revealed, tries: quizS.tries,
      streak: qStreak, kinds: Object.keys(qKinds).length, rhoStructs: Object.keys(rhoOk) });
  }
  function revealQuiz() {
    acted();
    if (!quizS || quizS.closed || quizS.answered) return;
    quizS.revealed = true;
    qStreak = 0; qKinds = {};
    const q = quizS.q;
    const a = q.type === 'rho' ? num(q.ans, 3) + ' g/cm³' : q.type === 'r' ? num(q.ans, 1) + ' pm' : sciHTML(q.ans, 4) + ' mol<sup>−1</sup>';
    let how = '';
    if (q.type === 'rho') how = T('ρ = ZM ／（N<sub>A</sub>V），Z = ', 'ρ = ZM / (N<sub>A</sub>V), Z = ') + q.given.Z;
    else if (q.type === 'r') how = T('先由 V = ZM ／（N<sub>A</sub>ρ）求晶胞體積與 a，再由相切的方向求 r', 'First V = ZM / (N<sub>A</sub>ρ) gives the cell volume and a; then r from the touching direction');
    else how = T('N<sub>A</sub> = ZM ／（ρV），Z = ', 'N<sub>A</sub> = ZM / (ρV), Z = ') + q.given.Z;
    $('qOut').innerHTML = T('答案：', 'Answer: ') + a + T('。', '. ') + how + T('。這題已揭曉（連續答對歸零），再出一題試試。', '. This one is revealed (the streak restarts); try another.');
    $('qCheck').disabled = true; $('qReveal').disabled = true;
    quizS.answered = true;
    updateReadouts(); drawGraph();
  }

  // ======================= 操作 =======================
  function onCrystalChange(silent) {
    if (quizS && !quizS.closed) {
      if (!quizS.answered) { qStreak = 0; qKinds = {}; }
      closeQuiz(quizS.answered ? '' : T('換了晶體，這一題結束了（連續答對歸零）。', 'You changed the crystal, so this question is over (the streak restarts).'));
    }
    selKey = null;
    refreshAll();
    if (!silent) {
      const s = snd(); if (s) { const pf = model.cr ? model.cr.pf : 0.5; s.tone({ freq: 300 + 900 * pf, dur: 0.12, type: 'sine', gain: 0.09 }); }
    }
    emitCell();
  }
  function setStruct(s) {
    if (s === state.s) return;
    if (state.hypo && CS.METALS.indexOf(s) < 0) return;
    state.s = s;
    if (!state.hypo) state.mat = CS.DEFAULT_MAT[s];
    if (!(s === 'fcc' || s === 'hcp')) state.layers = false;
    onCrystalChange();
    setStatus(state.hypo ? T('假想：' + CS.MATS[state.mat].zh + '的原子改排成' + CS.STRUCTS[s].zh + '，堆積率 ' + pct(cryst().pf) + '。', 'Imaginary: ' + CS.MATS[state.mat].en.toLowerCase() + ' atoms packed as ' + CS.STRUCTS[s].en.toLowerCase() + '; packing fraction ' + pct(cryst().pf) + '.') : '');
  }
  function setMode(md) {
    if (md === state.mode) return;
    state.mode = md;
    if (quizS && !quizS.closed && md !== 'cell') closeQuiz('');
    refreshAll();
    if (md === 'cell') emitCell();
  }
  function addLayer(L) {
    acted();
    if (stack.length >= MAXL) return;
    const prev = stack[stack.length - 1];
    stack += L;
    if (!reducedMotion) drop = { t0: performance.now() };
    refreshAll();
    animate();
    const info = CS.stackInfo(stack);
    const s = snd();
    if (s) {
      if (prev === L) s.sweep({ from: 420, to: 280, dur: 0.22, gain: 0.12, type: 'triangle' });
      else s.tone({ freq: { A: 523, B: 659, C: 784 }[L], dur: 0.12, gain: 0.1 });
    }
    setStatus(prev === L ? T('這一層疊在正上方：沒有落進凹處，層距變成 2r，比較鬆。', 'This layer sits right on top: it is not in the hollows, so the gap is 2r and the packing is looser.') :
      T('落進凹處：層距 1.633r。', 'In the hollows: gap 1.633 r.') + (info.n >= 3 ? ' ' + T('目前：', 'Now: ') + stackName(info.type) + T('。', '.') : ''));
    emitStack();
  }
  function undoLayer() {
    acted();
    if (stack.length <= 1) return;
    stack = stack.slice(0, -1);
    drop = null;
    refreshAll();
    setStatus(T('拿掉最上層。', 'Top layer removed.'));
    emitStack();
  }
  function clearAll() {
    acted();
    rows = [];
    stack = 'A';
    qStreak = 0; qKinds = {}; rhoOk = {};
    if (quizS && !quizS.closed) closeQuiz('');
    quizS = null;
    $('qOut').textContent = '';
    drop = null;
    refreshAll();
    setStatus(T('已清除比較表、動手算的紀錄與疊好的層。', 'The comparison table, the calculation record and the stack have been cleared.'));
  }
  function pickAtom(i) {
    if (!model || model.kind !== 'cell' || i == null || i < 0 || i >= model.atoms.length) return;
    acted();
    if (!state.coord) { setStatus(T('勾「顯示配位數」後，點原子就能看到它的鄰居。', 'Tick “Show coordination”, then tap an atom to see its neighbours.')); return; }
    selKey = model.atoms[i].key;
    rebuild();
    drawAll();
    const A = model.atoms[model.sel];
    const m = CS.MATS[state.mat];
    const who = A.sp === 'c' ? m.cat + T(' 離子', ' ion') : A.sp === 'a' ? m.an + T(' 離子', ' ion') : T('這個原子', 'This atom');
    setStatus(who + T('有 ' + model.bonds.length + ' 個最近的鄰居。', ' has ' + model.bonds.length + ' nearest neighbours.'));
    const s = snd(); if (s) s.tone({ freq: 300 + 60 * model.bonds.length, dur: 0.09, gain: 0.08 });
    emitCell();
  }

  // ---------- 控制項 ----------
  document.querySelectorAll('#modeSeg button').forEach(function (b) { b.addEventListener('click', function () { acted(); setMode(b.dataset.mode); }); });
  document.querySelectorAll('#structSeg1 button, #structSeg2 button').forEach(function (b) { b.addEventListener('click', function () { acted(); setStruct(b.dataset.s); }); });
  $('matSel').addEventListener('change', function () {
    acted();
    if (state.hypo) return;
    state.mat = $('matSel').value;
    onCrystalChange();
  });
  $('hypo').addEventListener('change', function () {
    acted();
    const on = $('hypo').checked && CS.METALS.indexOf(state.s) >= 0;
    state.hypo = on;
    if (!on && CS.MATS[state.mat].s !== state.s) state.mat = CS.DEFAULT_MAT[state.s];
    onCrystalChange(true);
    setStatus(on ? T('現在換排法會保持' + CS.MATS[state.mat].zh + '原子的大小，看看密度怎麼變。', 'Changing the packing now keeps the ' + CS.MATS[state.mat].en.toLowerCase() + ' atoms the same size: watch the density.') : '');
  });
  const elSize = $('size');
  function sizeVal() { return window.LabNum ? window.LabNum.value(elSize) : +elSize.value; }
  function refreshSize() { $('sizeo').textContent = num(state.size, 0) + '%'; }
  elSize.addEventListener('input', function () {
    acted();
    state.size = Math.max(20, Math.min(100, sizeVal()));
    refreshSize();
    rebuild();
    drawAll();
    emitCell();
  });
  function onCheck(id, fn) { $(id).addEventListener('change', function () { acted(); fn($(id).checked); refreshAll(); emitCell(); }); }
  onCheck('cut', function (v) { state.cut = v; });
  onCheck('coord', function (v) {
    state.coord = v; selKey = null;
    setStatus(v ? T('點畫面上的原子，可以換一個看它的鄰居。', 'Tap an atom in the drawing to see its neighbours instead.') : '');
  });
  onCheck('voOct', function (v) { state.vo.oct = v; });
  onCheck('voTet', function (v) { state.vo.tet = v; });
  onCheck('voCube', function (v) { state.vo.cube = v; });
  onCheck('layers', function (v) { state.layers = v; });
  document.querySelectorAll('#cellsSeg button').forEach(function (b) {
    b.addEventListener('click', function () { acted(); state.n = +b.dataset.n; selKey = null; refreshAll(); emitCell(); });
  });
  ['A', 'B', 'C'].forEach(function (L) { $('add' + L).addEventListener('click', function () { addLayer(L); }); });
  $('undo').addEventListener('click', undoLayer);
  $('record').addEventListener('click', record);
  $('clearAll').addEventListener('click', clearAll);
  document.querySelectorAll('#tabs button').forEach(function (b) {
    b.addEventListener('click', function () {
      acted();
      state.tab = b.dataset.tab;
      document.querySelectorAll('#tabs button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      updateGraphText(); drawGraph();
    });
  });
  document.querySelectorAll('#qType button').forEach(function (b) {
    b.addEventListener('click', function () {
      acted();
      if (b.disabled) return;
      state.qType = b.dataset.q;
      syncUI();
    });
  });
  $('qNew').addEventListener('click', newQuiz);
  $('qCheck').addEventListener('click', checkQuiz);
  $('qReveal').addEventListener('click', revealQuiz);
  $('qAns').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); checkQuiz(); } });
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  $('soundBtn').addEventListener('click', function () {
    if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound'));
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) {
    if (ev.detail && ev.detail.name === 'sound') updateSoundButton();
    if (ev.detail && ev.detail.name === 'fs') { resize(); resizeGraph(); drawGraph(); }
  });

  // ---------- 畫布：拖曳轉動、點選原子 ----------
  let drag = null;
  function canvasXY(ev) { const b = cv.getBoundingClientRect(); return [ev.clientX - b.left, ev.clientY - b.top]; }
  cv.addEventListener('pointerdown', function (ev) {
    const p = canvasXY(ev);
    drag = { x: p[0], y: p[1], yaw: state.yaw, pitch: state.pitch, moved: false, inA: PA && p[0] >= PA.x && p[0] <= PA.x + PA.w && p[1] >= PA.y && p[1] <= PA.y + PA.h };
    try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
  });
  cv.addEventListener('pointermove', function (ev) {
    if (!drag) return;
    const p = canvasXY(ev);
    const dx = p[0] - drag.x, dy = p[1] - drag.y;
    if (Math.hypot(dx, dy) > 5) drag.moved = true;
    if (!drag.moved || state.mode !== 'cell' || !drag.inA) return;
    state.yaw = drag.yaw + dx * 0.012;
    state.pitch = Math.max(-1.4, Math.min(1.4, drag.pitch + dy * 0.01));
    drawStage();
    ev.preventDefault();
  });
  cv.addEventListener('pointerup', function (ev) {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.moved) { acted(); return; }
    if (state.mode !== 'cell' || !proj2) return;
    const p = canvasXY(ev);
    // 前面的原子先判斷
    let hit = null;
    proj2.slice().sort(function (a, b) { return a.d - b.d; }).some(function (q) {
      if (Math.hypot(p[0] - q.x, p[1] - q.y) <= Math.max(10, q.r)) { hit = q; return true; }
      return false;
    });
    if (hit) pickAtom(hit.i);
  });
  cv.addEventListener('pointercancel', function () { drag = null; });

  let kb = null;
  if (window.LabKeys) {
    kb = window.LabKeys.attach(cv, {
      label: T('晶胞畫面。按 Enter 切換「轉動晶胞」或「選原子」，方向鍵轉動或換原子（要先勾顯示配位數）。', 'Unit-cell drawing. Press Enter to switch between turning the cell and picking an atom; the arrow keys turn it or move to another atom (tick “Show coordination” first).'),
      items: [
        { name: function () { return T('轉動晶胞', 'Turn the cell'); },
          move: function (dx, dy, big) {
            if (state.mode !== 'cell' || (!dx && !dy)) return false;
            acted();
            state.yaw += dx * (big ? 0.3 : 0.08);
            state.pitch = Math.max(-1.4, Math.min(1.4, state.pitch - dy * (big ? 0.3 : 0.08)));
            return true;
          },
          describe: function () { return T('已轉動', 'turned'); } },
        { name: function () { return T('選原子', 'Pick an atom'); },
          move: function (dx, dy) {
            if (state.mode !== 'cell' || !state.coord || !model || model.sel < 0) return false;
            const d = dx || -dy;
            if (!d) return false;
            pickAtom((model.sel + d + model.atoms.length) % model.atoms.length);
            return true;
          },
          describe: function () { return model && model.sel >= 0 ? T('配位數 ', 'coordination ') + model.bonds.length : T('先勾「顯示配位數」', 'tick “Show coordination” first'); } }
      ],
      onChange: function () { drawStage(); }
    });
  }

  // ======================= 3D 檢視 =======================
  let threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  function webglAvailable() {
    try {
      const c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
    } catch (e) { return false; }
  }
  function loadThree() {
    if (threeLib) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js')]).then(function (mods) {
      threeLib = { THREE: mods[0], OrbitControls: mods[1].OrbitControls };
      return threeLib;
    });
  }
  function hud() {
    if (!model) return { tl: '', tr: '' };
    if (model.kind === 'stack') {
      const info = model.info;
      return { tl: T('疊疊看：', 'Stack: ') + model.seq, tr: stackName(info.type) + (info.pf != null ? ' · ' + pct(info.pf) : '') };
    }
    const cr = model.cr;
    return { tl: sName(cr.s) + ' · ' + (cr.hypo ? T('假想 ', 'imaginary ') : '') + mName(state.mat),
      tr: 'Z = ' + cr.Z + ' · ' + T('配位數 ', 'C.N. ') + (model.sel >= 0 ? model.bonds.length : cr.CN) + ' · ' + T('堆積率 ', 'packing ') + pct(cr.pf) };
  }
  function host3Api() {
    return {
      T: T, host: host3,
      model: function () { return model; },
      colors: function () { return col; },
      hud: hud,
      reduced: reducedMotion,
      pick: function (i) { pickAtom(i); },
      contextLost: function () {
        setView('2d');
        viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 平面。', 'The 3D graphics context was lost, so the view switched back to 2D.');
      }
    };
  }
  function setPressed(mode) {
    $('view2d').setAttribute('aria-pressed', String(mode === '2d'));
    $('view3d').setAttribute('aria-pressed', String(mode === '3d'));
  }
  function setView(mode) {
    if (mode === '3d') {
      if (view3 && view3.active) return;
      const token = ++loadToken;
      setPressed('3d');
      if (!webglAvailable() || !window.CS3D) { fail3D(); return; }
      viewMsg.textContent = T('正在載入 3D 檢視…', 'Loading the 3D view…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return;
        stage.classList.add('is3d');
        state.view = '3d';
        view3 = window.CS3D.create(lib, host3Api());
        viewMsg.textContent = '';
        $('resetCam').hidden = false;
        syncUI();
        view3.update();
        emitCell();
      }).catch(function (err) {
        if (token !== loadToken) return;
        if (window.console) console.warn('3D view unavailable:', err);
        fail3D();
      });
    } else {
      loadToken++;
      setPressed('2d');
      state.view = '2d';
      if (view3) { view3.dispose(); view3 = null; }
      stage.classList.remove('is3d');
      $('resetCam').hidden = true;
      $('axisBtn').hidden = true;
      if (/3D/.test(viewMsg.textContent) && !/2D/.test(viewMsg.textContent)) viewMsg.textContent = '';
      resize();
      emitCell();
    }
  }
  function fail3D() {
    if (view3) { try { view3.dispose(); } catch (e) { /* 忽略 */ } view3 = null; }
    stage.classList.remove('is3d');
    state.view = '2d';
    setPressed('2d');
    $('resetCam').hidden = true;
    $('axisBtn').hidden = true;
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 平面。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D view is kept.');
    resize();
  }
  $('view2d').addEventListener('click', function () { acted(); setView('2d'); });
  $('view3d').addEventListener('click', function () { acted(); setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });
  $('axisBtn').addEventListener('click', function () { acted(); if (view3) view3.lookAlong(); });

  // ======================= 主題、尺寸 =======================
  function themeChanged() {
    readColors();
    refreshAll();
    updateGraphText();
    if (view3 && view3.active) view3.onTheme();
  }
  window.addEventListener('lab:themechange', themeChanged);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  if (window.ResizeObserver) {
    let lw = 0, lg = 0;
    new ResizeObserver(function () { if (cv.clientWidth && cv.clientWidth !== lw) { lw = cv.clientWidth; resize(); } }).observe(cv);
    new ResizeObserver(function () { if (gcv.clientWidth && gcv.clientWidth !== lg) { lg = gcv.clientWidth; resizeGraph(); drawGraph(); } }).observe(gcv);
  } else window.addEventListener('resize', function () { resize(); resizeGraph(); drawGraph(); });

  // 結構對照表（說明區）
  function buildStructTable() {
    const el = $('structTable');
    if (!el) return;
    let h = '<thead><tr><th class="l">' + T('結構', 'Structure') + '</th><th>Z</th><th>' + T('配位數', 'C.N.') + '</th><th class="l">' + T('半徑與邊長', 'Radius and edge') + '</th><th>' + T('堆積率', 'Packing') + '</th><th class="l">' + T('例子', 'Examples') + '</th></tr></thead><tbody>';
    CS.ORDER.forEach(function (s) {
      const st = CS.STRUCTS[s];
      const ex = CS.matsOf(s).filter(function (k) { return !CS.MATS[k].hot; }).slice(0, 4).map(function (k) { return CS.MATS[k].sym; }).join(T('、', ', '));
      // 金屬與鑽石型是硬球的解析值；六方最密取理想 c/a；離子晶體看半徑比，沒有單一值
      const pfShow = st.kind === 'ionic' ? '—' : s === 'hcp' ? pct(Math.PI / (3 * Math.SQRT2), 1) + T('（理想）', ' (ideal)') : pct(CS.crystal(CS.DEFAULT_MAT[s]).pf, 1);
      h += '<tr><td class="l">' + sName(s) + '</td><td>' + st.Z + '</td><td>' + st.CN + '</td><td class="l">' + relHTML(s) + '</td><td>' + pfShow + '</td><td class="l">' + ex + '</td></tr>';
    });
    el.innerHTML = h + '</tbody>';
  }

  // 測試用（Playwright）：讀取目前狀態（短名 __cs，不可用 __pt）
  window.__cs = {
    state: state, stack: function () { return stack; }, rows: function () { return rows; }, model: function () { return model; },
    quiz: function () { return quizS; }, streak: function () { return qStreak; }, view3: function () { return view3; }, pick: function (i) { pickAtom(i); }
  };

  // ======================= 啟動 =======================
  readColors();
  refreshSize();
  updateSoundButton();
  buildStructTable();
  updateGraphText();
  resizeGraph();
  refreshAll();
  resize();
})();
