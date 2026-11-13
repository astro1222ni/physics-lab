/* pythagoras-core.js — 「畢氏定理的拼圖證明」的數學核心（純函式，瀏覽器與 Node 共用）
 *
 * 直角三角形：直角在 C = (0, 0)，A = (b, 0)，B = (0, a)；兩股 a = BC、b = CA，斜邊 c = AB。
 * 三種證明，每種都有進度 t（0 → 1），回傳每一塊的多邊形（頂點陣列），面積在任何 t 都不變：
 *   move（平移重組）：邊長 a + b 的大正方形裡放四個全等的三角形。t = 0 留下 a^2 與 b^2 兩個洞，平移其中三個三角形，
 *        t = 1 只留下一個 c^2 的洞。四個三角形只做平移。
 *   euclid（歐幾里得的剪切）：a^2、b^2 兩個正方形各自：剪切成平行四邊形（底不動，面積不變）→ 沿斜邊的垂直方向平移 →
 *        再剪切成斜邊上正方形的一個長方形。最後 a^2 = c·BH、b^2 = c·AH 剛好拼滿 c^2。
 *   perigal（佩里加爾的切拼）：較大那一股的正方形，過中心畫一條平行斜邊、一條垂直斜邊的線，切成四塊全等的四邊形；
 *        四塊只做平移，放到 c^2 的四個角，較小那一股的正方形填中間。 */
(function (root) {
  'use strict';

  const add = function (p, q) { return [p[0] + q[0], p[1] + q[1]]; };
  const sub = function (p, q) { return [p[0] - q[0], p[1] - q[1]]; };
  const mul = function (p, k) { return [p[0] * k, p[1] * k]; };
  const lerp = function (p, q, s) { return [p[0] + (q[0] - p[0]) * s, p[1] + (q[1] - p[1]) * s]; };
  const dot = function (p, q) { return p[0] * q[0] + p[1] * q[1]; };
  const cross = function (p, q) { return p[0] * q[1] - p[1] * q[0]; };
  /** 多邊形有號面積（逆時針為正） */
  function area(P) { let s = 0; for (let i = 0; i < P.length; i++) s += cross(P[i], P[(i + 1) % P.length]); return s / 2; }
  function centroid(P) { let x = 0, y = 0; P.forEach(function (p) { x += p[0]; y += p[1]; }); return [x / P.length, y / P.length]; }
  /** 在 [0, 1] 中第 k 段（共 n 段）的進度 */
  function stage(t, k, n) { return Math.max(0, Math.min(1, t * n - k)); }
  const ease = function (s) { return s * s * (3 - 2 * s); };

  /** 三角形的各種量 */
  function tri(a, b) {
    const c = Math.hypot(a, b);
    const area0 = a * b / 2, per = a + b + c;
    return {
      a: a, b: b, c: c, area: area0, per: per,
      A: Math.atan2(a, b) * 180 / Math.PI, B: Math.atan2(b, a) * 180 / Math.PI,   // ∠A 對邊 a、∠B 對邊 b
      r: (a + b - c) / 2, R: c / 2, h: a * b / c,            // 內切圓、外接圓半徑、斜邊上的高
      p: a * a / c, q: b * b / c,                             // 斜邊被高分成：靠 B 的一段 p（BH）、靠 A 的一段 q（AH）
      C: [0, 0], Ap: [b, 0], Bp: [0, a],
      H: [a * a * b / (c * c), a * b * b / (c * c)]          // 垂足
    };
  }

  // ---------- 平移重組 ----------
  /** 大正方形 [0, s]^2 放在三角形的右邊（不和原三角形重疊）：x 從 ox 開始 */
  function moveProof(a, b, t, ox) {
    const s = a + b, o = [ox == null ? 0 : ox, 0];
    const at = function (p) { return add(p, o); };
    // t = 1：c^2 的洞（四個三角形在四個角）；t = 0：a^2、b^2 兩個洞
    const T1 = [[0, 0], [a, 0], [0, b]];            // 直角在 (0, 0)，右 a、上 b
    const T2 = [[s, 0], [s, a], [a, 0]];            // 不動
    const T3 = [[s, s], [b, s], [s, a]];            // 直角在 (s, s)，左 a、下 b
    const T4 = [[0, s], [0, b], [b, s]];            // 直角在 (0, s)，下 a、右 b
    // t = 0 的位置 = t = 1 的位置減掉這些平移
    const d1 = [0, a], d3 = [-b, 0], d4 = [a, -b];
    const u = [ease(stage(t, 0, 3)), ease(stage(t, 1, 3)), ease(stage(t, 2, 3))];
    const shift = function (T, d, k) { const v = mul(d, 1 - k); return T.map(function (p) { return at(add(p, v)); }); };
    const pieces = [shift(T1, d1, u[0]), T2.map(at), shift(T3, d3, u[1]), shift(T4, d4, u[2])];
    // 洞：t = 0 時 a^2（左下 [0, a]^2）與 b^2（右上 [a, s]^2）；t = 1 時 c^2（四個頂點在四邊上）
    const holes0 = [[[0, 0], [a, 0], [a, a], [0, a]].map(at), [[a, a], [s, a], [s, s], [a, s]].map(at)];
    const hole1 = [[a, 0], [s, a], [b, s], [0, b]].map(at);
    return { s: s, frame: [[0, 0], [s, 0], [s, s], [0, s]].map(at), pieces: pieces, holes0: holes0, hole1: hole1, done: t >= 1 - 1e-12, start: t <= 1e-12 };
  }

  // ---------- 歐幾里得的剪切 ----------
  /** 回傳 a^2、b^2 兩塊（各是一個四邊形）、斜邊上的正方形外框、三個階段的進度 */
  function euclidProof(a, b, t) {
    const T = tri(a, b), c = T.c, C = T.C, A = T.Ap, B = T.Bp, H = T.H;
    const u2 = [a, b];                                       // 斜邊的外法線方向，長度 c
    const s1 = ease(stage(t, 0, 3)), s2 = ease(stage(t, 1, 3)), s3 = ease(stage(t, 2, 3));
    // a^2：以 CB 為一邊，向左長出去；先剪切成以 (−a, −b) 為另一邊的平行四邊形
    function piece(P0, P1, out0, H) {
      // P0 = C，P1 = B（或 A）；out0：正方形另一邊的向量；剪切後變成 −u2
      const v = lerp(out0, mul(u2, -1), s1);
      let Q = [P0, P1, add(P1, v), add(P0, v)];
      // 平移 u2：整塊移到斜邊外面
      Q = Q.map(function (p) { return add(p, mul(u2, s2)); });
      // 剪切：C 那一角往 H 移（沿 u2 方向），P1 那一邊不動
      if (s3 > 0) {
        const C2 = lerp(P0, H, s3);
        Q = [C2, P1, add(P1, u2), add(C2, u2)];
      }
      return Q;
    }
    const pa = piece(C, B, [-a, 0], H), pb = piece(C, A, [0, -b], H);
    return { tri: [C, A, B], H: H, pieces: [pa, pb], square: [A, add(A, u2), add(B, u2), B], c: c, done: t >= 1 - 1e-12, start: t <= 1e-12,
      stageNo: t <= 0 ? 0 : t < 1 / 3 ? 1 : t < 2 / 3 ? 2 : t < 1 ? 3 : 4 };
  }

  // ---------- 佩里加爾的切拼 ----------
  /** 凸多邊形用半平面 n·(p − p0) ≥ 0 切 */
  function clip(P, p0, n) {
    const out = [];
    for (let i = 0; i < P.length; i++) {
      const p = P[i], q = P[(i + 1) % P.length];
      const dp = dot(sub(p, p0), n), dq = dot(sub(q, p0), n);
      if (dp >= -1e-12) out.push(p);
      if ((dp > 1e-12 && dq < -1e-12) || (dp < -1e-12 && dq > 1e-12)) out.push(lerp(p, q, dp / (dp - dq)));
    }
    return out;
  }
  function perigalProof(a, b, t) {
    const T = tri(a, b), c = T.c, A = T.Ap, B = T.Bp;
    const u2 = [a, b], uc = mul(sub(A, B), 1 / c), nc = [a / c, b / c];   // 沿斜邊（B → A）、斜邊外法線
    // 較大那一股的正方形切四塊，較小那一股的正方形整塊移到中間
    const big = b >= a ? 'b' : 'a';
    const sqA = [[0, 0], [0, a], [-a, a], [-a, 0]];                  // CB 上的正方形（向左）
    const sqB = [[0, 0], [0, -b], [b, -b], [b, 0]];                  // CA 上的正方形（向下）
    const sqBig = big === 'b' ? sqB : sqA, sqSmall = big === 'b' ? sqA : sqB;
    const O = centroid(sqBig);
    // 斜邊上的正方形：B、A、A + u2、B + u2；中心
    const S = [B, A, add(A, u2), add(B, u2)], Oc = centroid(S);
    const half = c / 2;
    const pieces = [], from = [], to = [];
    [[1, 1], [1, -1], [-1, -1], [-1, 1]].forEach(function (sg) {
      // 這一塊在 O 的 (sg0·uc, sg1·nc) 象限
      let P = clip(sqBig, O, mul(uc, sg[0]));
      P = clip(P, O, mul(nc, sg[1]));
      // 直角在 O 的那一角，移到 c^2 中 (−sg0·uc, −sg1·nc) 方向的那個角
      const corner = add(Oc, add(mul(uc, -sg[0] * half), mul(nc, -sg[1] * half)));
      from.push(P); to.push(sub(corner, O));
    });
    const sMove = ease(stage(t, 1, 2)), sCut = stage(t, 0, 2);
    from.forEach(function (P, k) {
      // 切開時四塊稍微散開，移動時再收攏、平移到 c^2
      const spread = mul(sub(centroid(P), O), 0.15 * (sMove > 0 ? 1 - sMove : ease(sCut)));
      pieces.push(P.map(function (p) { return add(add(p, mul(to[k], sMove)), spread); }));
    });
    const Os = centroid(sqSmall);
    const smallTo = sub(Oc, Os);
    const small = sqSmall.map(function (p) { return add(p, mul(smallTo, sMove)); });
    return { tri: [T.C, A, B], square: S, pieces: pieces, small: small, big: big, cutCenter: O, uc: uc, nc: nc, c: c, done: t >= 1 - 1e-12, start: t <= 1e-12,
      cutLines: sCut > 0 && sMove < 1 };
  }

  // ---------- 畢氏三元數 ----------
  function gcd(x, y) { x = Math.abs(x); y = Math.abs(y); while (y) { const z = x % y; x = y; y = z; } return x; }
  /** 歐幾里得公式：m > n > 0 → (m^2 − n^2, 2mn, m^2 + n^2) */
  function triple(m, n) {
    if (!(m > n && n > 0)) return null;
    const a = m * m - n * n, b = 2 * m * n, c = m * m + n * n;
    return { a: a, b: b, c: c, primitive: gcd(gcd(a, b), c) === 1, g: gcd(gcd(a, b), c) };
  }
  const isInt = function (x, tol) { return Math.abs(x - Math.round(x)) <= (tol || 1e-9); };

  // ---------- 挑戰 ----------
  /** 給兩邊求第三邊：{ type: 'hyp' | 'leg', given: {a, b} 或 {a, c}, ask, answer } */
  function challenge(rand) {
    const Rn = rand || Math.random;
    const T3 = [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25], [20, 21, 29], [9, 12, 15], [6, 8, 10], [12, 16, 20], [15, 20, 25], [9, 40, 41], [12, 35, 37], [11, 60, 61]];
    const kind = Rn();
    let a, b, c;
    if (kind < 0.55) {
      const z = T3[Math.floor(Rn() * T3.length)], k = [1, 1, 1, 2, 0.5][Math.floor(Rn() * 5)];
      a = z[0] * k; b = z[1] * k; c = z[2] * k;
      if (Rn() < 0.5) { const w = a; a = b; b = w; }
    } else {
      // 不是三元數：答案是根號
      a = 1 + Math.floor(Rn() * 9); b = a + 1 + Math.floor(Rn() * 8);
      c = Math.hypot(a, b);
    }
    if (Rn() < 0.5) return { type: 'hyp', given: { a: a, b: b }, ask: 'c', answer: c, exact: isInt(c) ? String(Math.round(c * 100) / 100) : '\\sqrt{' + (a * a + b * b) + '}' };
    // 給斜邊與一股，求另一股
    const legAsk = Rn() < 0.5 ? 'a' : 'b', leg = legAsk === 'a' ? b : a, ans = legAsk === 'a' ? a : b;
    const exact = isInt(ans) || isInt(ans * 2) ? String(ans) : '\\sqrt{' + Math.round(c * c - leg * leg) + '}';
    const g = { type: 'leg', given: { c: c }, ask: legAsk, answer: ans, exact: exact };
    g.given[legAsk === 'a' ? 'b' : 'a'] = leg;
    if (!isInt(c)) g.given.c2 = Math.round(c * c);   // 斜邊不是整數時用 √(c^2) 顯示
    return g;
  }
  function answerOK(v, g) { return isFinite(v) && Math.abs(v - g.answer) <= 0.01 * g.answer; }

  const api = { add: add, sub: sub, mul: mul, lerp: lerp, dot: dot, cross: cross, area: area, centroid: centroid, clip: clip,
    tri: tri, moveProof: moveProof, euclidProof: euclidProof, perigalProof: perigalProof, gcd: gcd, triple: triple, isInt: isInt,
    challenge: challenge, answerOK: answerOK };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PYCore = api;
})(typeof window !== 'undefined' ? window : this);
