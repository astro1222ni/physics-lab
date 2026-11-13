/* inscribed-angle-core.js — 「圓周角與圓冪」的數學核心（純函式，瀏覽器與 Node 共用）
 *
 * 圓心 O 在原點、半徑 R；圓上的點用「位置角」t（度，0 ≤ t < 360）表示：(R cos t, R sin t)。
 * 圓周角定理：∠APB = 弧 AB（不含 P 的那一段）的一半；同弧的圓周角相等；直徑所對的圓周角是 90°。
 * 圓內接四邊形：對角互補（∠A + ∠C = ∠B + ∠D = 180°）。
 * 圓冪：過點 Q 的直線交圓於 X、Y，則 QX·QY = |OQ^2 − R^2|，與直線方向無關（相交弦、割線）；相切時 QT^2 = OQ^2 − R^2。 */
(function (root) {
  'use strict';
  const D2R = Math.PI / 180;

  function norm360(t) { t = t % 360; return t < 0 ? t + 360 : t; }
  function pt(R, t) { return [R * Math.cos(t * D2R), R * Math.sin(t * D2R)]; }
  function dist(P, Q) { return Math.hypot(P[0] - Q[0], P[1] - Q[1]); }
  /** ∠XVY（度，0–180） */
  function angleAt(V, X, Y) {
    const u = [X[0] - V[0], X[1] - V[1]], v = [Y[0] - V[0], Y[1] - V[1]];
    const L = Math.hypot(u[0], u[1]) * Math.hypot(v[0], v[1]);
    if (L < 1e-18) return NaN;
    return Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / L))) / D2R;
  }
  /** 從 a 逆時針走到 b 的角度（0–360） */
  function ccw(a, b) { return norm360(b - a); }
  /** p 在不在從 a 逆時針到 b 的弧上（不含端點） */
  function onArc(a, b, p) { const d = ccw(a, b), e = ccw(a, p); return e > 1e-9 && e < d - 1e-9; }

  /** 圓周角：A、B、P 的位置角 → 圓周角、所對的弧（不含 P 的那段）、圓心角、P 在哪一段弧 */
  function inscribed(R, a, b, p) {
    const A = pt(R, a), B = pt(R, b), P = pt(R, p);
    const same = Math.abs(norm360(a - p)) < 1e-9 || Math.abs(norm360(b - p)) < 1e-9 || Math.abs(norm360(a - b)) < 1e-9;
    if (same) return { ok: false };
    // P 在 a→b（逆時針）那段上，所對的弧就是 b→a；反之亦然
    const arc = onArc(a, b, p) ? ccw(b, a) : ccw(a, b);
    return { ok: true, A: A, B: B, P: P, ins: angleAt(P, A, B), arc: arc, cen: arc, side: onArc(a, b, p) ? 1 : -1, chord: dist(A, B) };
  }

  /** 圓內接四邊形：四個位置角依 A、B、C、D 的順序；凸（依序繞一圈）才算 */
  function quad(R, ts) {
    const P = ts.map(function (t) { return pt(R, t); });
    // 依序繞圓一圈：從 A 逆時針（或順時針）依序遇到 B、C、D
    const d = [ccw(ts[0], ts[1]), ccw(ts[0], ts[2]), ccw(ts[0], ts[3])];
    const forward = d[0] < d[1] && d[1] < d[2];
    const back = d[0] > d[1] && d[1] > d[2];
    const distinct = d.every(function (x) { return x > 1e-9; });
    if (!distinct || !(forward || back)) return { ok: false, P: P };
    const ang = [0, 1, 2, 3].map(function (k) { return angleAt(P[k], P[(k + 3) % 4], P[(k + 1) % 4]); });
    const side = [0, 1, 2, 3].map(function (k) { return dist(P[k], P[(k + 1) % 4]); });
    const diag = [dist(P[0], P[2]), dist(P[1], P[3])];
    // 對角線交點
    const X = intersect(P[0], P[2], P[1], P[3]);
    // 各段弧（依繞行方向）
    const arcs = forward ? [ccw(ts[0], ts[1]), ccw(ts[1], ts[2]), ccw(ts[2], ts[3]), ccw(ts[3], ts[0])]
      : [ccw(ts[1], ts[0]), ccw(ts[2], ts[1]), ccw(ts[3], ts[2]), ccw(ts[0], ts[3])];
    const dv = [P[2][0] - P[0][0], P[2][1] - P[0][1]], ev = [P[3][0] - P[1][0], P[3][1] - P[1][1]];
    const diagAng = angleAt([0, 0], dv, ev);
    return { ok: true, P: P, ang: ang, side: side, diag: diag, X: X, arcs: arcs, diagAng: diagAng,
      // 托勒密：AC·BD = AB·CD + AD·BC
      ptolemy: diag[0] * diag[1] - (side[0] * side[2] + side[1] * side[3]),
      area: Math.abs(shoelace(P)),
      // 調和四邊形：AB·CD = BC·DA（比值 − 1）；可外切（皮托）：AB + CD = BC + DA（比值 − 1）
      harm: side[0] * side[2] / (side[1] * side[3]) - 1,
      pitot: (side[0] + side[2]) / (side[1] + side[3]) - 1,
      // 箏形：兩組相鄰邊各自相等（相對差的較大者，取兩種配對中較小的）
      kite: Math.min(Math.max(rel(side[0], side[3]), rel(side[1], side[2])), Math.max(rel(side[0], side[1]), rel(side[2], side[3]))) };
  }
  function rel(x, y) { return Math.abs(x - y) / Math.max(x, y); }
  /** 四段弧離「360°／n 的正整數倍」最遠差多少度（四點都是正 n 邊形頂點時是 0） */
  function polyDev(arcs, n) {
    const u = 360 / n;
    let m = 0;
    arcs.forEach(function (a) { const k = Math.max(1, Math.round(a / u)); m = Math.max(m, Math.abs(a - k * u)); });
    return m;
  }
  function shoelace(P) { let s = 0; for (let k = 0; k < P.length; k++) { const a = P[k], b = P[(k + 1) % P.length]; s += a[0] * b[1] - a[1] * b[0]; } return s / 2; }
  /** 線段 PQ 與 UV 所在直線的交點 */
  function intersect(P, Q, U, V) {
    const r = [Q[0] - P[0], Q[1] - P[1]], s = [V[0] - U[0], V[1] - U[1]];
    const den = r[0] * s[1] - r[1] * s[0];
    if (Math.abs(den) < 1e-12) return null;
    const t = ((U[0] - P[0]) * s[1] - (U[1] - P[1]) * s[0]) / den;
    return [P[0] + t * r[0], P[1] + t * r[1]];
  }

  /** 過 Q、方向角 th（度）的直線與圓的交點：參數 s（有號距離）與點；d 是圓心到直線的距離 */
  function lineCircle(R, Q, th) {
    const u = [Math.cos(th * D2R), Math.sin(th * D2R)];
    const bq = Q[0] * u[0] + Q[1] * u[1], c = Q[0] * Q[0] + Q[1] * Q[1] - R * R;
    const disc = bq * bq - c;
    const d = Math.abs(Q[0] * u[1] - Q[1] * u[0]);
    if (disc < -1e-12) return { n: 0, d: d, u: u };
    const sq = Math.sqrt(Math.max(0, disc));
    const s1 = -bq - sq, s2 = -bq + sq;
    return { n: sq < 1e-6 * R ? 1 : 2, d: d, u: u, s: [s1, s2], X: [Q[0] + s1 * u[0], Q[1] + s1 * u[1]], Y: [Q[0] + s2 * u[0], Q[1] + s2 * u[1]],
      prod: Math.abs(s1 * s2), chord: Math.abs(s2 - s1) };
  }
  /** 點 Q 對圓的冪 OQ^2 − R^2（圓外正、圓內負、圓上 0） */
  function power(R, Q) { return Q[0] * Q[0] + Q[1] * Q[1] - R * R; }
  /** 圓外一點的兩個切點 */
  function tangents(R, Q) {
    const d2 = Q[0] * Q[0] + Q[1] * Q[1];
    if (d2 <= R * R) return null;
    const d = Math.sqrt(d2), base = Math.atan2(Q[1], Q[0]), off = Math.acos(R / d);
    return [[R * Math.cos(base + off), R * Math.sin(base + off)], [R * Math.cos(base - off), R * Math.sin(base - off)]];
  }

  /** 挑戰題：回傳 { type, given（顯示用的已知）, ask, answer, unit（'deg' | 'len'）, fig（畫圖用） } */
  function challenge(rand) {
    const Rn = rand || Math.random;
    const pick = function (arr) { return arr[Math.floor(Rn() * arr.length)]; };
    const types = ['ins', 'cen', 'quad', 'chord', 'secant', 'tangent'];
    const type = pick(types);
    const R = 4;
    if (type === 'ins' || type === 'cen') {
      // 給圓心角求圓周角（弧 20°–340°）；給圓周角求圓心角（弧 20°–180°，不出優角）；都是 5° 的倍數
      const arc = type === 'ins' ? 5 * (4 + Math.floor(Rn() * 65)) : 5 * (4 + Math.floor(Rn() * 33));
      const a = 5 * Math.floor(Rn() * 72), b = norm360(a + arc);
      // P 放在不含的那段弧中間附近
      const p = norm360(b + (360 - arc) * (0.3 + 0.4 * Rn()));
      const r = inscribed(R, a, b, p);
      return type === 'ins'
        ? { type: type, ask: '∠APB', given: { cen: arc }, answer: r.ins, unit: 'deg', fig: { R: R, a: a, b: b, p: p } }
        : { type: type, ask: '∠AOB', given: { ins: Math.round(r.ins * 1e6) / 1e6 }, answer: arc, unit: 'deg', fig: { R: R, a: a, b: b, p: p } };
    }
    if (type === 'quad') {
      let ts;
      for (;;) {
        const g = [0, 0, 0, 0].map(function () { return 40 + Math.floor(Rn() * 9) * 10; });
        const s = g[0] + g[1] + g[2] + g[3];
        ts = [0, g[0], g[0] + g[1], g[0] + g[1] + g[2]].map(function (x) { return norm360(x * 360 / s + 15); });
        const q = quad(R, ts);
        if (q.ok && q.ang.every(function (x) { return x > 25 && x < 155; })) {
          const k = Math.floor(Rn() * 4);
          return { type: type, ask: 'ABCD'[(k + 2) % 4], given: { v: 'ABCD'[k], ang: Math.round(q.ang[k] * 100) / 100 }, answer: 180 - Math.round(q.ang[k] * 100) / 100, unit: 'deg', fig: { R: R, ts: ts } };
        }
      }
    }
    // 長度題：整數或 0.5 的倍數，答案也是好數字
    if (type === 'chord') {
      // 相交弦：QA·QB = QC·QD
      for (;;) {
        const qa = 1 + Math.floor(Rn() * 6), qb = 1 + Math.floor(Rn() * 6), qc = [1, 1.5, 2, 2.5, 3, 4, 5, 6][Math.floor(Rn() * 8)];
        const qd = qa * qb / qc;
        if (Math.abs(qd * 2 - Math.round(qd * 2)) < 1e-9 && qd <= 8 && qc !== qa && qc !== qb) return { type: type, ask: 'QD', given: { QA: qa, QB: qb, QC: qc }, answer: qd, unit: 'len', fig: { kind: 'chord' } };
      }
    }
    if (type === 'secant') {
      for (;;) {
        const qa = 1 + Math.floor(Rn() * 5), ab = 1 + Math.floor(Rn() * 6), qc = [1, 1.5, 2, 2.5, 3, 4][Math.floor(Rn() * 6)];
        const p = qa * (qa + ab), qd = p / qc;
        if (Math.abs(qd * 2 - Math.round(qd * 2)) < 1e-9 && qd > qc + 0.5 && qd <= 16 && qc !== qa) return { type: type, ask: 'QD', given: { QA: qa, QB: qa + ab, QC: qc }, answer: qd, unit: 'len', fig: { kind: 'secant' } };
      }
    }
    // 切線：QT^2 = QA·QB
    for (;;) {
      const qa = 1 + Math.floor(Rn() * 6), qb = qa + 1 + Math.floor(Rn() * 10);
      const t = Math.sqrt(qa * qb);
      if (Math.abs(t - Math.round(t)) < 1e-9) return { type: 'tangent', ask: 'QT', given: { QA: qa, QB: qb }, answer: t, unit: 'len', fig: { kind: 'tangent' } };
    }
  }
  /** 長度題的圖：依題目的長度造出真的圓與點（Q 的方向固定在 φ，第一條線在一側、第二條在另一側）。
   *  回傳 { R, Q, lines: [{ X, Y, nx, ny }], T（切線題的切點） }，X、Y 都在圓上，QX、QY 就是題目給的長度。 */
  function chalFig(g) {
    const G = g.given, phi = -35 * D2R;
    const at = function (Q, al, s) { return [Q[0] + s * Math.cos(al), Q[1] + s * Math.sin(al)]; };
    if (g.type === 'chord') {
      const qa = G.QA, qb = G.QB, qc = G.QC, qd = g.answer;
      const R = 1.18 * Math.max((qa + qb) / 2, (qc + qd) / 2);
      const q = Math.sqrt(R * R - qa * qb), Q = [q * Math.cos(phi), q * Math.sin(phi)];
      const al1 = phi + Math.acos(Math.max(-1, Math.min(1, (qa - qb) / (2 * q)))), al2 = phi - Math.acos(Math.max(-1, Math.min(1, (qc - qd) / (2 * q))));
      return { R: R, Q: Q, lines: [{ X: at(Q, al1, -qa), Y: at(Q, al1, qb), nx: 'A', ny: 'B' }, { X: at(Q, al2, -qc), Y: at(Q, al2, qd), nx: 'C', ny: 'D' }] };
    }
    if (g.type === 'secant') {
      const qa = G.QA, qb = G.QB, qc = G.QC, qd = g.answer;
      const R = Math.max(1.2 * (qb - qa) / 2, 1.2 * (qd - qc) / 2, qd / 3.2);
      const q = Math.sqrt(R * R + qa * qb), Q = [q * Math.cos(phi), q * Math.sin(phi)];
      const al1 = phi + Math.PI - Math.acos((qa + qb) / (2 * q)), al2 = phi + Math.PI + Math.acos((qc + qd) / (2 * q));
      return { R: R, Q: Q, lines: [{ X: at(Q, al1, qa), Y: at(Q, al1, qb), nx: 'A', ny: 'B' }, { X: at(Q, al2, qc), Y: at(Q, al2, qd), nx: 'C', ny: 'D' }] };
    }
    if (g.type === 'tangent') {
      const qa = G.QA, qb = G.QB;
      const R = Math.max(1.2 * (qb - qa) / 2, qb / 3.2);
      const q = Math.sqrt(R * R + qa * qb), Q = [q * Math.cos(phi), q * Math.sin(phi)];
      const al1 = phi + Math.PI - Math.acos((qa + qb) / (2 * q));
      const T = tangents(R, Q)[1];
      return { R: R, Q: Q, lines: [{ X: at(Q, al1, qa), Y: at(Q, al1, qb), nx: 'A', ny: 'B' }], T: T };
    }
    return null;
  }
  /** 答案對不對：角度 0.5° 以內、長度 1% 以內 */
  function answerOK(v, g) {
    if (!isFinite(v)) return false;
    return g.unit === 'deg' ? Math.abs(v - g.answer) <= 0.5 : Math.abs(v - g.answer) <= 0.01 * Math.abs(g.answer);
  }

  const api = { D2R: D2R, norm360: norm360, pt: pt, dist: dist, angleAt: angleAt, ccw: ccw, onArc: onArc, inscribed: inscribed, quad: quad,
    polyDev: polyDev, intersect: intersect, lineCircle: lineCircle, power: power, tangents: tangents, challenge: challenge, chalFig: chalFig, answerOK: answerOK };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.IACore = api;
})(typeof window !== 'undefined' ? window : this);
