/*
 * elevator-core.js — 電梯中的視重（超重與失重）物理核心（與畫面無關，可單獨測試）
 *
 * 單位約定（SI）：長度 m、時間 s、速度 m/s、加速度 m/s²、質量 kg、力 N。
 * 鉛直方向向上為正：電梯車廂地板的高度 y（1 樓地板 y = 0）、速度 v、加速度 a。
 * 重力加速度 g = 9.8 m/s²（臺灣高中課本的數值）；體重計以「公斤重」顯示：1 kgw = 9.8 N。
 *
 * 運動以「等加速度段」串起來（segment）：
 *   { t0, t1, y0, v0, a, kind }  在 t0 ≤ t ≤ t1 之間 y = y0 + v0·τ + ½aτ²、v = v0 + aτ（τ = t − t0）
 *   t1 可以是 Infinity（停住或等速）。kind 只是名稱：
 *     'rest' 靜止、'acc' 起動加速、'cruise' 等速、'dec' 減速停靠、
 *     'free' 纜繩斷裂後的自由落體、'brake' 緊急煞車（安全鉗）、'held' 安全鉗夾住停止、
 *     'manual' 手動駕駛、'protect' 終端保護自動減速。
 * 一段一段都是解析解，所以位置、速度、讀數都沒有累積的數值誤差。
 *
 * 人（質量 m）站在車廂內的體重計上，與車廂一起運動（相對車廂靜止）：
 *   N − mg = ma  ⇒  N = m(g + a)        （體重計讀數 = N，視重）
 * 吊在彈簧秤下的物體（質量 ms）同理：T = ms(g + a)，彈簧伸長量 x = T/k。
 * 自由落體時 a = −g ⇒ N = 0、T = 0（完全失重）。
 */
(function (root) {
  'use strict';

  const G = 9.8;           // m/s²
  const FLOOR_H = 3.0;     // m：每層樓高
  const FLOORS = 10;       // 1F … 10F
  const Y_MIN = 0;         // 1F 地板
  const Y_MAX = (FLOORS - 1) * FLOOR_H; // 10F 地板 = 27 m
  const K_SPRING = 60;     // N/m：彈簧秤的力常數
  const BALL_H = 1.25;     // m：小球從手中放開時，球底離車廂地板的高度
  const EPS = 1e-9;

  // ---------- 樓層 ----------
  function floorY(n) { return (n - 1) * FLOOR_H; }
  /** 最接近的樓層 n（1–10）與偏差 off = y − floorY(n)（m） */
  function floorOf(y) {
    const n = Math.max(1, Math.min(FLOORS, Math.round(y / FLOOR_H) + 1));
    return { n: n, off: y - floorY(n) };
  }

  // ---------- 等加速度段 ----------
  function seg(t0, dur, y0, v0, a, kind) {
    return { t0: t0, t1: t0 + dur, y0: y0, v0: v0, a: a, kind: kind };
  }
  /** 段內 t 時刻的 y、v、a（t 可超出段的範圍，照同一條公式外推） */
  function segAt(s, t) {
    const tau = t - s.t0;
    return { y: s.y0 + s.v0 * tau + 0.5 * s.a * tau * tau, v: s.v0 + s.a * tau, a: s.a };
  }
  /** 段結束時的 y、v（t1 = Infinity 時傳回 null） */
  function segEnd(s) { return isFinite(s.t1) ? segAt(s, s.t1) : null; }
  /** 在一串段落（依時間排序、首尾相接）中找 t 所在的段落索引 */
  function indexAt(track, t) {
    if (!track.length) return -1;
    if (t < track[0].t0) return 0;
    for (let i = 0; i < track.length; i++) if (t < track[i].t1) return i;
    return track.length - 1;
  }
  /** t 時刻的狀態 { y, v, a, kind, i } */
  function stateAt(track, t) {
    const i = indexAt(track, t);
    if (i < 0) return { y: 0, v: 0, a: 0, kind: 'rest', i: -1 };
    const s = track[i], r = segAt(s, Math.max(t, s.t0));
    r.kind = s.kind;
    r.i = i;
    return r;
  }
  /** 靜止段（從 t0 起一直停在 y） */
  function rest(t0, y, kind) { return { t0: t0, t1: Infinity, y0: y, v0: 0, a: 0, kind: kind || 'rest' }; }

  // ---------- 樓層按鈕：加速 → 等速 → 減速 ----------
  /** 走完距離 d（m）所需的時間：最大加速度 A、最高速率 V（加速與減速的大小都是 A） */
  function tripDuration(d, A, V) {
    d = Math.abs(d);
    if (d < EPS) return 0;
    return d >= V * V / A ? d / V + V / A : 2 * Math.sqrt(d / A);
  }
  /** 行程的最高速率：距離夠長時是 V，太短時（三角形 v–t 圖）是 √(Ad) */
  function tripPeakSpeed(d, A, V) {
    d = Math.abs(d);
    return d >= V * V / A ? V : Math.sqrt(A * d);
  }
  /**
   * 從 y0（靜止）到 y1（靜止）的行程，t0 出發。傳回段落（最後一段是停在 y1 的靜止段）。
   * 距離 d ≥ V²/A：加速 V/A 秒 → 等速 (d − V²/A)/V 秒 → 減速 V/A 秒（梯形 v–t 圖）
   * 距離 d < V²/A：加速 √(d/A) 秒 → 減速 √(d/A) 秒，最高速率 √(Ad)（三角形 v–t 圖）
   */
  function tripProfile(y0, y1, A, V, t0) {
    t0 = t0 || 0;
    const D = y1 - y0, d = Math.abs(D), s = D >= 0 ? 1 : -1;
    if (d < EPS) return [rest(t0, y1)];
    const out = [];
    let ta, tc, vp;
    if (d >= V * V / A) { ta = V / A; vp = V; tc = (d - V * V / A) / V; }
    else { ta = Math.sqrt(d / A); vp = A * ta; tc = 0; }
    let t = t0;
    out.push(seg(t, ta, y0, 0, s * A, 'acc'));
    t += ta;
    const ya = y0 + s * 0.5 * vp * ta;
    if (tc > 1e-12) {
      out.push(seg(t, tc, ya, s * vp, 0, 'cruise'));
      t += tc;
    }
    // 減速段的起點由終點倒推，保證準確停在 y1
    out.push(seg(t, ta, y1 - s * 0.5 * vp * ta, s * vp, -s * A, 'dec'));
    t += ta;
    out.push(rest(t, y1));
    return out;
  }

  // ---------- 力 ----------
  /** 體重計對人的正向力（視重）N = m(g + a)；a < −g 時人會離開秤面，N = 0 */
  function normalForce(m, a, g) {
    g = g == null ? G : g;
    return Math.max(0, m * (g + a));
  }
  /** 牛頓換算成公斤重（1 kgw = 9.8 N） */
  function kgw(N) { return N / G; }
  /** 體重計讀數（kgw）= m(g + a)/9.8；寫成 m(g/9.8 + a/9.8)，等速時剛好等於 m */
  function reading(m, a, g) {
    g = g == null ? G : g;
    return Math.max(0, m * (g / G + a / G));
  }
  /**
   * 人與體重計的受力（向上為正，單位 N）：
   *   weight：地球對人的重力 −mg（反作用力是人對地球的引力，作用在地球上）
   *   normal：體重計對人的正向力 +N
   *   onScale：人對體重計的壓力 −N（與 normal 是一對作用力與反作用力，作用在體重計上）
   *   net：人受的合力 N − mg = ma
   */
  function forces(m, a, g) {
    g = g == null ? G : g;
    const N = normalForce(m, a, g);
    return { weight: -m * g, normal: N, onScale: -N, net: N - m * g };
  }
  /** 彈簧秤的拉力 T = ms(g + a)（自由落體時為 0） */
  function springTension(ms, a, g) { return normalForce(ms, a, g); }
  /** 彈簧伸長量 x = T/k（m） */
  function springExtension(T, k) { return T / (k == null ? K_SPRING : k); }
  /** 視重的狀態：'over' 超重、'under' 失重（視重 < 實重）、'free' 完全失重、'normal' 正常 */
  function phaseOf(a, g) {
    g = g == null ? G : g;
    if (Math.abs(a) < 1e-9) return 'normal';
    if (a > 0) return 'over';
    return a <= -g + 1e-9 ? 'free' : 'under';
  }

  // ---------- 纜繩斷裂：自由落體 → 緊急煞車 → 停止 ----------
  /**
   * t0 時纜繩斷裂，車廂從 (y0, v0) 開始自由落體（a = −g；向上運動時先減速上升再落下）。
   * 下降速率達到限速器動作速度 vTrip 時，安全鉗以減速度 ab 煞車（a = +ab），直到停止並夾住。
   * 斷裂時若已經比 vTrip 更快往下，立刻煞車。
   */
  function freeFallPlan(t0, y0, v0, vTrip, ab, g) {
    g = g == null ? G : g;
    const out = [];
    let t = t0, y = y0, v = v0;
    const tf = (v0 + vTrip) / g; // 速度由 v0 變成 −vTrip 所需時間
    if (tf > 0) {
      out.push(seg(t, tf, y0, v0, -g, 'free'));
      t += tf;
      y = y0 + v0 * tf - 0.5 * g * tf * tf;
      v = -vTrip;
    }
    const tb = -v / ab;
    out.push(seg(t, tb, y, v, ab, 'brake'));
    out.push(rest(t + tb, y - v * v / (2 * ab), 'held')); // 煞車距離 v²/(2ab)
    return out;
  }
  /** 自由落體途中（t0 時狀態 y0、v0）按下緊急煞車：往下運動時立刻以 ab 減速；往上運動時到最高點被夾住 */
  function brakeNow(t0, y0, v0, ab, g) {
    g = g == null ? G : g;
    if (v0 < 0) {
      const tb = -v0 / ab;
      return [seg(t0, tb, y0, v0, ab, 'brake'), rest(t0 + tb, y0 - v0 * v0 / (2 * ab), 'held')];
    }
    const tu = v0 / g;
    const out = [];
    if (tu > 0) out.push(seg(t0, tu, y0, v0, -g, 'free'));
    out.push(rest(t0 + tu, y0 + v0 * v0 / (2 * g), 'held'));
    return out;
  }
  /** 纜繩在 (y0, v0) 斷裂、交給限速器自動煞車時，最後停住的高度 */
  function predictStop(y0, v0, vTrip, ab, g) {
    g = g == null ? G : g;
    if (v0 <= -vTrip) return y0 - v0 * v0 / (2 * ab);
    return y0 + (v0 * v0 - vTrip * vTrip) / (2 * g) - vTrip * vTrip / (2 * ab);
  }
  /** 從靜止斷裂到停住的總下降距離 = vTrip²/(2g) + vTrip²/(2ab) */
  function dropFromRest(vTrip, ab, g) {
    g = g == null ? G : g;
    return vTrip * vTrip / (2 * g) + vTrip * vTrip / (2 * ab);
  }

  // ---------- 手動駕駛 ----------
  /**
   * 從 t0 時的狀態 (y0, v0) 起，指令 cmd（+1 按住「向上加速」、−1 按住「向下加速」、0 放開）。
   * 規則（每一段都是等加速度）：
   *   - 放開：等速（靜止就保持靜止）。
   *   - 按住與運動方向相同（或靜止時按住）：以 A 加速，到最高速率 V 後改為等速。
   *   - 按住與運動方向相反：以 A 減速，速度變成 0 的瞬間停住（要再按一次才會反向）。
   *   - 終端保護：若照目前的運動，以 A 減速已經來不及停在 1 樓或 10 樓，就自動以 A 減速，剛好停在端點樓層。
   *     （v² = 2A·d 的那一刻開始減速；若已經超過，就用剛好能停住的 v²/(2d)。）
   */
  function manualPlan(t0, y0, v0, cmd, A, V, yMin, yMax) {
    yMin = yMin == null ? Y_MIN : yMin;
    yMax = yMax == null ? Y_MAX : yMax;
    const out = [];
    const tiny = 1e-12;
    let t = t0, y = y0, v = v0;
    if (Math.abs(v) < tiny) v = 0;
    // 靜止
    if (v === 0) {
      if (cmd === 0) return [rest(t, y)];
      const dEnd = cmd > 0 ? yMax - y : y - yMin;
      if (dEnd <= 1e-9) return [rest(t, y)];
    }
    const s = v !== 0 ? Math.sign(v) : cmd;   // 運動方向
    const d0 = s > 0 ? yMax - y : y - yMin;   // 到端點的距離
    const u0 = Math.abs(v);
    // 反向按住：減速到停
    if (v !== 0 && cmd === -s) {
      const tb = u0 / A;
      out.push(seg(t, tb, y, v, -s * A, 'manual'));
      out.push(rest(t + tb, y + s * u0 * u0 / (2 * A)));
      return out;
    }
    // 已經需要終端保護
    function protect(tStart, yStart, uStart, dist) {
      if (dist <= 1e-12 || uStart <= 1e-12) { out.push(rest(tStart, s > 0 ? yMax : yMin)); return out; }
      const ab = Math.max(A, uStart * uStart / (2 * dist));
      const tb = uStart / ab;
      out.push(seg(tStart, tb, yStart, s * uStart, -s * ab, 'protect'));
      out.push(rest(tStart + tb, s > 0 ? yMax : yMin));
      return out;
    }
    if (u0 * u0 >= 2 * A * d0 - 1e-12) return protect(t, y, u0, d0);
    if (cmd === s && u0 < V - 1e-12) {
      // 加速：何時達到 V？何時觸發終端保護？
      const tV = (V - u0) / A;
      const tP = (-u0 + Math.sqrt(u0 * u0 / 2 + A * d0)) / A;
      if (tP <= tV) {
        out.push(seg(t, tP, y, v, s * A, 'manual'));
        const u1 = u0 + A * tP;
        const y1 = y + s * (u0 * tP + 0.5 * A * tP * tP);
        return protect(t + tP, y1, u1, s > 0 ? yMax - y1 : y1 - yMin);
      }
      out.push(seg(t, tV, y, v, s * A, 'manual'));
      y = y + s * (u0 * tV + 0.5 * A * tV * tV);
      t += tV;
      v = s * V;
    }
    // 等速：距離剩下 v²/(2A) 時開始終端保護
    const u = Math.abs(v), d = s > 0 ? yMax - y : y - yMin;
    const tc = (d - u * u / (2 * A)) / u;
    if (tc > 0) out.push(seg(t, tc, y, v, 0, 'manual'));
    const tt = t + Math.max(0, tc);
    const yy = y + v * Math.max(0, tc);
    return protect(tt, yy, u, s > 0 ? yMax - yy : yy - yMin);
  }

  // ---------- 車廂裡放開的小球 ----------
  /** 等效重力 g + a 下，從高度 h 由靜止落下的時間 √(2h/(g + a))；g + a ≤ 0 時永遠不會落地 */
  function fallTime(h, a, g) {
    g = g == null ? G : g;
    const ge = g + a;
    return ge > 0 ? Math.sqrt(2 * h / ge) : Infinity;
  }
  /**
   * 小球在 tr 時從車廂內高度 h 放開（放開瞬間與車廂同速）。小球在地面座標系只受重力：
   *   yb(t) = yc(tr) + h + vc(tr)(t − tr) − ½g(t − tr)²
   * 相對車廂地板的高度 z(t) = yb(t) − yc(t)；在每一段車廂運動中 z 是 t 的二次式，逐段解出第一次 z = 0 的時刻。
   * ball = { tr, yb, vb }（放開時的地面座標高度與速度）；從 tFrom 開始找；找不到傳回 Infinity。
   */
  function ballLanding(track, ball, tFrom, g) {
    g = g == null ? G : g;
    const i0 = Math.max(0, indexAt(track, tFrom));
    for (let i = i0; i < track.length; i++) {
      const s = track[i];
      const ta = Math.max(s.t0, tFrom, ball.tr), tb = s.t1;
      if (!(tb > ta)) continue;
      // z(t) = yb(t) − yc(t)，以 τ = t − ta 展開：z = c0 + c1 τ + ½ c2 τ²
      const pb = ball.yb + ball.vb * (ta - ball.tr) - 0.5 * g * (ta - ball.tr) * (ta - ball.tr);
      const vbb = ball.vb - g * (ta - ball.tr);
      const c = segAt(s, ta);
      const c0 = pb - c.y, c1 = vbb - c.v, c2 = -g - s.a;
      if (c0 <= 1e-12) return ta;
      const root = smallestRoot(0.5 * c2, c1, c0);
      if (root != null && ta + root <= tb + 1e-12) return ta + root;
    }
    return Infinity;
  }
  /** a·τ² + b·τ + c = 0 的最小非負根（c > 0），沒有則傳回 null */
  function smallestRoot(a, b, c) {
    if (Math.abs(a) < 1e-15) {
      if (Math.abs(b) < 1e-15) return null;
      const r = -c / b;
      return r >= 0 ? r : null;
    }
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const sq = Math.sqrt(disc);
    // 數值穩定的寫法
    const q = -0.5 * (b + (b >= 0 ? sq : -sq));
    const r1 = q / a, r2 = q !== 0 ? c / q : -b / a;
    const roots = [r1, r2].filter(function (r) { return r >= 0 && isFinite(r); }).sort(function (x, y) { return x - y; });
    return roots.length ? roots[0] : null;
  }
  /** 小球在 t 時刻相對車廂地板的高度（未落地前） */
  function ballHeight(track, ball, t, g) {
    g = g == null ? G : g;
    const c = stateAt(track, t), tau = t - ball.tr;
    return ball.yb + ball.vb * tau - 0.5 * g * tau * tau - c.y;
  }

  // ---------- 面積（測試與教學用）：a–t 圖下面積 = Δv、v–t 圖下面積 = Δy ----------
  function areaA(track, ta, tb) {
    let sum = 0;
    track.forEach(function (s) {
      const lo = Math.max(ta, s.t0), hi = Math.min(tb, s.t1);
      if (hi > lo) sum += s.a * (hi - lo);
    });
    return sum;
  }
  function areaV(track, ta, tb) {
    let sum = 0;
    track.forEach(function (s) {
      const lo = Math.max(ta, s.t0), hi = Math.min(tb, s.t1);
      if (hi > lo) {
        const v1 = segAt(s, lo).v, v2 = segAt(s, hi).v;
        sum += 0.5 * (v1 + v2) * (hi - lo); // 等加速度：平均速度 × 時間（精確）
      }
    });
    return sum;
  }

  const api = {
    G: G, FLOOR_H: FLOOR_H, FLOORS: FLOORS, Y_MIN: Y_MIN, Y_MAX: Y_MAX, K_SPRING: K_SPRING, BALL_H: BALL_H,
    floorY: floorY, floorOf: floorOf,
    seg: seg, segAt: segAt, segEnd: segEnd, indexAt: indexAt, stateAt: stateAt, rest: rest,
    tripDuration: tripDuration, tripPeakSpeed: tripPeakSpeed, tripProfile: tripProfile,
    normalForce: normalForce, kgw: kgw, reading: reading, forces: forces,
    springTension: springTension, springExtension: springExtension, phaseOf: phaseOf,
    freeFallPlan: freeFallPlan, brakeNow: brakeNow, predictStop: predictStop, dropFromRest: dropFromRest,
    manualPlan: manualPlan,
    fallTime: fallTime, ballLanding: ballLanding, ballHeight: ballHeight,
    areaA: areaA, areaV: areaV
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ElevatorCore = api;
})(typeof window !== 'undefined' ? window : this);
