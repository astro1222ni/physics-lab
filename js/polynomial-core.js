/* polynomial-core.js — 「多項式函數的圖形」的數學核心（純函式，瀏覽器與 Node 共用）
 *
 * 多項式用係數陣列表示：p[i] 是 x^i 的係數（p[0] 是常數項）。
 * 根與圖形：f(x) = a · Π (x − r_i)^{m_i} · [(x − p)² + q²]，由根與重數組出係數；符號圖、解多項式不等式。
 * 勘根定理：區間 [l, r] 兩端異號就至少有一個根；二分法一步一步縮小區間。
 * 平移與伸縮：y = a · f(b(x − h)) + k；三次函數都是 y = A x³ + p x 平移出來的，對稱中心在 x = −B/(3A)。
 * 挑戰：由圖形（根的位置、碰到還是穿過、一個整數點）寫出多項式。 */
(function (root) {
  'use strict';

  // ---------- 係數陣列的運算 ----------
  function trim(p) {
    const q = p.slice();
    while (q.length > 1 && Math.abs(q[q.length - 1]) < 1e-14) q.pop();
    return q;
  }
  function add(p, q) {
    const n = Math.max(p.length, q.length), r = [];
    for (let i = 0; i < n; i++) r.push((p[i] || 0) + (q[i] || 0));
    return trim(r);
  }
  function scale(p, s) { return trim(p.map(function (c) { return c * s; })); }
  function mul(p, q) {
    const r = new Array(p.length + q.length - 1).fill(0);
    for (let i = 0; i < p.length; i++) for (let j = 0; j < q.length; j++) r[i + j] += p[i] * q[j];
    return trim(r);
  }
  /** 霍納法求值 */
  function evalP(p, x) {
    let s = 0;
    for (let i = p.length - 1; i >= 0; i--) s = s * x + p[i];
    return s;
  }
  function deriv(p) {
    if (p.length <= 1) return [0];
    const r = [];
    for (let i = 1; i < p.length; i++) r.push(i * p[i]);
    return trim(r);
  }
  function deg(p) { const q = trim(p); return q.length === 1 && q[0] === 0 ? -Infinity : q.length - 1; }
  /** p(c0 + c1 x) */
  function compose(p, lin) {
    let r = [0], pw = [1];
    for (let i = 0; i < p.length; i++) {
      if (p[i]) r = add(r, scale(pw, p[i]));
      pw = mul(pw, lin);
    }
    return trim(r);
  }
  function same(p, q, tol) {
    const n = Math.max(p.length, q.length);
    for (let i = 0; i < n; i++) if (Math.abs((p[i] || 0) - (q[i] || 0)) > (tol || 1e-9)) return false;
    return true;
  }

  // ---------- 由根組出多項式 ----------
  /** 把根依位置排序、位置相同（差 1e-9 以內）的合併成一個根，重數相加 */
  function merge(roots) {
    const s = roots.filter(function (r) { return r.m > 0; }).map(function (r) { return { x: r.x, m: r.m }; }).sort(function (u, v) { return u.x - v.x; });
    const out = [];
    s.forEach(function (r) {
      const last = out[out.length - 1];
      if (last && Math.abs(last.x - r.x) < 1e-9) last.m += r.m; else out.push({ x: r.x, m: r.m });
    });
    return out;
  }
  function degreeOf(roots, quad) { return roots.reduce(function (s, r) { return s + r.m; }, 0) + (quad ? 2 : 0); }
  /** f(x) = a · Π (x − r)^m · [(x − p)² + q²] 的係數 */
  function fromFactored(a, roots, quad) {
    let p = [a];
    roots.forEach(function (r) { for (let k = 0; k < r.m; k++) p = mul(p, [-r.x, 1]); });
    if (quad) p = mul(p, [quad.p * quad.p + quad.q * quad.q, -2 * quad.p, 1]);
    return p;
  }
  /** 直接用因式求值（比展開後的係數準） */
  function evalFactored(a, roots, quad, x) {
    let v = a;
    roots.forEach(function (r) { v *= Math.pow(x - r.x, r.m); });
    if (quad) v *= (x - quad.p) * (x - quad.p) + quad.q * quad.q;
    return v;
  }
  /** 兩端的走向：x → −∞、x → +∞ 時 f 趨近 +∞（1）或 −∞（−1） */
  function endBehavior(a, n) {
    const right = a > 0 ? 1 : -1;
    return { left: n % 2 === 0 ? right : -right, right: right };
  }

  // ---------- 符號圖與不等式 ----------
  /** 由合併後的實根切出的各段開區間與符號 s（+1 或 −1） */
  function signChart(a, merged) {
    const xs = merged.map(function (r) { return r.x; });
    const segs = [];
    // 最右邊一段的符號就是 a 的符號；每經過一個奇數重根，往左一段符號就翻轉
    let s = a > 0 ? 1 : -1;
    for (let i = xs.length; i >= 0; i--) {
      segs.unshift({ lo: i === 0 ? -Infinity : xs[i - 1], hi: i === xs.length ? Infinity : xs[i], s: s });
      if (i > 0 && merged[i - 1].m % 2 === 1) s = -s;
    }
    return segs;
  }
  /** 解 f(x) op 0（op 是 '>'、'>='、'<'、'<='）；回傳區間的聯集 [{lo, hi, lc, hc}]（單點是 lo = hi、兩端都包含） */
  function solve(op, a, merged) {
    const segs = signChart(a, merged);
    const want = op === '>' || op === '>=' ? 1 : -1, eq = op === '>=' || op === '<=';
    // 依序排成：段 0、根 1、段 1、根 2、……、段 k
    const pieces = [];
    segs.forEach(function (sg, i) {
      pieces.push({ lo: sg.lo, hi: sg.hi, pt: false, inc: sg.s === want });
      if (i < merged.length) pieces.push({ lo: merged[i].x, hi: merged[i].x, pt: true, inc: eq });
    });
    const out = [];
    let cur = null;
    pieces.forEach(function (pc) {
      if (pc.inc) {
        if (!cur) cur = { lo: pc.lo, hi: pc.hi, lc: pc.pt, hc: pc.pt };
        else { cur.hi = pc.hi; cur.hc = pc.pt; }
      } else if (cur) { out.push(cur); cur = null; }
    });
    if (cur) out.push(cur);
    out.forEach(function (r) { if (!isFinite(r.lo)) r.lc = false; if (!isFinite(r.hi)) r.hc = false; });
    return out;
  }
  function num(v, d) {
    if (!isFinite(v)) return v > 0 ? '∞' : '-∞';
    let s = (Math.round(v * 1e6) / 1e6).toFixed(d == null ? 4 : d).replace(/\.?0+$/, '');
    if (s === '-0') s = '0';
    return s;
  }
  /** 解集合的比對用字串，例如 "(-2,3)"、"(-∞,1]U{2}" */
  function solKey(sol) {
    if (!sol.length) return '∅';
    return sol.map(function (r) {
      if (r.lo === r.hi) return '{' + num(r.lo) + '}';
      return (r.lc ? '[' : '(') + num(r.lo) + ',' + num(r.hi) + (r.hc ? ']' : ')');
    }).join('U');
  }
  function texNum(v, d) {
    if (!isFinite(v)) return v > 0 ? '\\infty' : '-\\infty';
    return num(v, d);
  }
  function solTex(sol) {
    if (!sol.length) return '\\varnothing';
    if (sol.length === 1 && !isFinite(sol[0].lo) && !isFinite(sol[0].hi)) return '\\mathbb{R}';
    return sol.map(function (r) {
      if (r.lo === r.hi) return '\\{' + texNum(r.lo) + '\\}';
      return (r.lc ? '[' : '(') + texNum(r.lo) + ',\\ ' + texNum(r.hi) + (r.hc ? ']' : ')');
    }).join(' \\cup ');
  }

  // ---------- 一般多項式的實根（勘根用） ----------
  /** 在 [lo, hi] 裡找實根：細分取樣找變號再二分；取樣點剛好是 0 也算（用於只有單根的題目） */
  function realRoots(p, lo, hi, n) {
    n = n || 6000;
    const out = [];
    let x0 = lo, f0 = evalP(p, lo);
    if (f0 === 0) out.push(lo);
    for (let i = 1; i <= n; i++) {
      const x1 = lo + (hi - lo) * i / n, f1 = evalP(p, x1);
      if (f1 === 0) out.push(x1);
      else if (f0 !== 0 && (f0 < 0) !== (f1 < 0)) {
        let a = x0, b = x1, fa = f0;
        for (let k = 0; k < 80; k++) {
          const m = (a + b) / 2, fm = evalP(p, m);
          if (fm === 0) { a = b = m; break; }
          if ((fm < 0) === (fa < 0)) { a = m; fa = fm; } else b = m;
        }
        out.push((a + b) / 2);
      }
      x0 = x1; f0 = f1;
    }
    return out;
  }
  /** 二分法一步：保留異號的那一半；中點剛好是根時區間縮成一點 */
  function bisect(p, l, r) {
    const m = (l + r) / 2, fm = evalP(p, m), fl = evalP(p, l);
    if (fm === 0) return { l: m, r: m, m: m, fm: 0, exact: true };
    if ((fm < 0) === (fl < 0)) return { l: m, r: r, m: m, fm: fm, exact: false };
    return { l: l, r: m, m: m, fm: fm, exact: false };
  }
  /** 勘根用的函數（係數由常數項開始） */
  const PRESETS = {
    w: { c: [-5, -2, 0, 1], tex: 'x^3 - 2x - 5' },
    p: { c: [-1, -1, 0, 1], tex: 'x^3 - x - 1' },
    r: { c: [3, -2, -3, 2], tex: '2x^3 - 3x^2 - 2x + 3' },
    q: { c: [1, 1, -4, 0, 1], tex: 'x^4 - 4x^2 + x + 1' },
    k: { c: [1, -3, 0, 0, 0, 1], tex: 'x^5 - 3x + 1' }
  };

  // ---------- 平移與伸縮 ----------
  const BASES = {
    cube: { c: [0, 0, 0, 1], tex: 'x^3', odd: true },
    cubic: { c: [0, -3, 0, 1], tex: 'x^3 - 3x', odd: true },
    quart: { c: [0, 0, -2, 0, 1], tex: 'x^4 - 2x^2', odd: false }
  };
  /** y = a · f(b(x − h)) + k 的係數 */
  function transform(base, a, b, h, k) {
    return add(scale(compose(BASES[base].c, [-b * h, b]), a), [k]);
  }
  /** 三次多項式的對稱中心 (−B/(3A), f(−B/(3A)))；不是三次時回傳 null */
  function cubicCenter(p) {
    const q = trim(p);
    if (q.length !== 4) return null;
    const x = -q[2] / (3 * q[3]);
    return { x: x, y: evalP(q, x) };
  }

  // ---------- TeX ----------
  function coefStr(v) { return num(v, 4); }
  /** 標準式，例如 2x^3 - 3x^2 + 0.5 */
  function polyTex(p, v) {
    v = v || 'x';
    const q = trim(p);
    let s = '';
    for (let i = q.length - 1; i >= 0; i--) {
      const c = Math.round(q[i] * 1e6) / 1e6;
      if (c === 0) continue;
      const neg = c < 0, ab = Math.abs(c);
      let t = i === 0 ? coefStr(ab) : (ab === 1 ? '' : coefStr(ab)) + v + (i > 1 ? '^{' + i + '}' : '');
      if (!s) s = (neg ? '-' : '') + t;
      else s += (neg ? ' - ' : ' + ') + t;
    }
    return s || '0';
  }
  /** 因式，例如 0.5(x + 2)(x - 1)^{2}[(x - 1)^2 + 4] */
  function factoredTex(a, merged, quad) {
    let s = a === 1 ? '' : a === -1 ? '-' : coefStr(a);
    merged.forEach(function (r) {
      const xr = Math.round(r.x * 1e6) / 1e6;
      const f = xr === 0 ? 'x' : '(x ' + (xr < 0 ? '+ ' : '- ') + coefStr(Math.abs(xr)) + ')';
      s += f + (r.m > 1 ? '^{' + r.m + '}' : '');
    });
    if (quad) {
      const pr = Math.round(quad.p * 1e6) / 1e6;
      const xp = pr === 0 ? 'x^2' : '(x ' + (pr < 0 ? '+ ' : '- ') + coefStr(Math.abs(pr)) + ')^2';
      s += '\\left[' + xp + ' + ' + coefStr(quad.q * quad.q) + '\\right]';
    }
    if (s === '' || s === '-') s += '1';
    return s;
  }

  // ---------- 亂數與挑戰 ----------
  function rng(seed) {
    let s = seed >>> 0 || 1;
    return function () { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const A_CHOICES = [-2, -1, -0.5, 0.5, 1, 2];
  /** 一題「由圖形找多項式」：整數根 −4..4、重數 1–3、次數 2–4、a 取自 A_CHOICES；給一個整數提示點 */
  function genChallenge(R, last) {
    for (let tries = 0; tries < 500; tries++) {
      const n = 2 + Math.floor(R() * 3);
      const roots = [];
      let left = n;
      while (left > 0) {
        let m = 1;
        const u = R();
        if (left >= 2 && u < 0.35) m = 2;
        if (left >= 3 && u < 0.08) m = 3;
        let x, guard = 0;
        do { x = -4 + Math.floor(R() * 9); guard++; } while (roots.some(function (r) { return r.x === x; }) && guard < 50);
        if (guard >= 50) break;
        roots.push({ x: x, m: m });
        left -= m;
      }
      if (left !== 0) continue;
      const merged = merge(roots);
      const a = A_CHOICES[Math.floor(R() * A_CHOICES.length)];
      // 提示點：優先用 x = 0，否則用最靠近 0、函數值大小在 1 到 40 之間的整數
      let hint = null;
      const cand = [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5];
      for (let i = 0; i < cand.length && !hint; i++) {
        const x = cand[i];
        if (merged.some(function (r) { return r.x === x; })) continue;
        const y = evalFactored(a, merged, null, x);
        if (Math.abs(y) >= 1 && Math.abs(y) <= 40 && Math.abs(y - Math.round(y * 2) / 2) < 1e-9) hint = { x: x, y: y };
      }
      if (!hint) continue;
      // 根之間的起伏不能太大（畫面要看得出碰到還是穿過）
      let top = Math.abs(hint.y);
      const lo = merged[0].x - 1, hi = merged[merged.length - 1].x + 1;
      for (let t = 0; t <= 200; t++) top = Math.max(top, Math.abs(evalFactored(a, merged, null, lo + (hi - lo) * t / 200)));
      if (top > 120) continue;
      const c = { a: a, roots: merged, hint: hint, n: n, coef: fromFactored(a, merged, null), top: top };
      if (last && same(c.coef, last.coef, 1e-9)) continue;
      return c;
    }
    return null;
  }

  const api = {
    trim: trim, add: add, scale: scale, mul: mul, evalP: evalP, deriv: deriv, deg: deg, compose: compose, same: same,
    merge: merge, degreeOf: degreeOf, fromFactored: fromFactored, evalFactored: evalFactored, endBehavior: endBehavior,
    signChart: signChart, solve: solve, solKey: solKey, solTex: solTex, num: num,
    realRoots: realRoots, bisect: bisect, PRESETS: PRESETS,
    BASES: BASES, transform: transform, cubicCenter: cubicCenter,
    polyTex: polyTex, factoredTex: factoredTex,
    rng: rng, A_CHOICES: A_CHOICES, genChallenge: genChallenge
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PolyCore = api;
})(typeof window !== 'undefined' ? window : this);
