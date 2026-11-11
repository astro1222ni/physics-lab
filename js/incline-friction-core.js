/*
 * incline-friction-core.js — 斜面與摩擦力物理核心（與畫面無關，可單獨測試）
 *
 * 單位約定（SI）：質量 m（kg）、角度 theta（rad）、力（N）、位置 x（m）、速度 v（m/s）、時間 t（s）。
 *
 * 座標：x 軸沿斜面，「沿斜面向下」為正（v、a、摩擦力 f、合力都依此取正負）。
 * 外力 F（帶正負號）：
 *   mode 'along'：沿斜面，F > 0 往上推（沿斜面向上），F < 0 往下拉。
 *   mode 'horiz'：水平，F > 0 水平推向斜面（有沿斜面向上的分量 F cos θ，並把木塊壓向斜面 F sin θ）。
 * 參數物件 p = { m, theta, mus, muk, F, mode, g }（g 省略時為 9.8 m/s²）。
 *
 *   正向力   N = mg cos θ + F⊥            （F⊥ = F sin θ（水平）或 0（沿斜面））
 *   驅動力   D = mg sin θ + F∥            （摩擦力以外沿斜面的合力；F∥ = −F cos θ（水平）或 −F）
 *   靜止時   |D| ≤ μs N → 靜摩擦力 f = −D（需要多少就給多少），保持靜止
 *            |D| > μs N → 開始滑動，方向 sign(D)，改為動摩擦力
 *   滑動時   f = −sign(v) μk N，a = (D + f)/m
 *   滑動中速度減到 0 時：若 |D| ≤ μs N 就停住（重新被靜摩擦力黏住），否則立刻往回滑。
 * 每一小段時間內力固定 → 等加速度運動，用解析式前進；速度歸零、撞到擋板、通過光電門的時刻都解二次方程式求得，
 * 所以力固定時位置、速度、時間都是精確解（沒有累積誤差）。
 * 能量：重力作功 wG、外力作功 wF、摩擦力作功 wf（≤ 0，生熱 Q = −wf = μk N × 滑行路徑長）、撞擋板損失 lost，
 *   ½mv² − ½mv0² = wG + wF + wf − lost。
 */
(function (root) {
  'use strict';

  const G = 9.8;
  const D2R = Math.PI / 180;

  /** 常見材質的摩擦係數（典型值，實際會因表面狀況而不同；一律 μs > μk） */
  const SURFACES = [
    { id: 'wood', mus: 0.50, muk: 0.30 },   // 木頭／木頭
    { id: 'steel', mus: 0.74, muk: 0.57 },  // 鋼／鋼（乾燥）
    { id: 'rubber', mus: 1.00, muk: 0.80 }, // 橡膠／乾混凝土
    { id: 'glass', mus: 0.94, muk: 0.40 },  // 玻璃／玻璃
    { id: 'snow', mus: 0.14, muk: 0.10 },   // 打蠟木板／濕雪
    { id: 'ice', mus: 0.10, muk: 0.03 }     // 冰／冰
  ];

  /** sin、cos；在 0 與 90° 用精確值（避免 cos 90° 算成極小的非零值） */
  function trig(theta) {
    if (theta === 0) return { s: 0, c: 1 };
    if (Math.abs(theta - Math.PI / 2) < 1e-12) return { s: 1, c: 0 };
    return { s: Math.sin(theta), c: Math.cos(theta) };
  }

  /** 摩擦力以外的各個力（沿斜面向下為正、壓向斜面為正） */
  function components(p) {
    const g = p.g == null ? G : p.g;
    const tr = trig(p.theta || 0);
    const m = p.m, F = p.F || 0;
    const mus = Math.max(0, p.mus || 0);
    const muk = Math.max(0, Math.min(p.muk || 0, mus)); // μk 不可大於 μs
    const W = m * g;
    const horiz = p.mode === 'horiz';
    const Wpar = W * tr.s, Wperp = W * tr.c;
    const Fpar = horiz ? -F * tr.c : -F;
    const Fperp = horiz ? F * tr.s : 0;
    let N = Wperp + Fperp;
    const lift = N < 0;          // 外力把木塊拉離斜面（介面不允許，這裡只做標記）
    if (lift) N = 0;
    const D = Wpar + Fpar;
    return {
      m: m, g: g, sin: tr.s, cos: tr.c, theta: p.theta || 0, F: F, mode: horiz ? 'horiz' : 'along',
      W: W, Wpar: Wpar, Wperp: Wperp, Fpar: Fpar, Fperp: Fperp, N: N, lift: lift, D: D,
      mus: mus, muk: muk, fsMax: mus * N, fk: muk * N
    };
  }

  function holdsStatic(k) { return Math.abs(k.D) <= k.fsMax * (1 + 1e-12) + 1e-12; }

  /**
   * 某一瞬間的受力。v：速度；contact：0 沒有接觸擋板、+1 靠在下端擋板（擋板只能往上推）、
   * −1 靠在上端擋板（只能往下推）、2 用手扶住（可往任一方向施力）。
   * 傳回 components 的內容，再加上 f（摩擦力）、kind（'static' | 'kinetic'）、P（擋板或手的力）、
   * net（合力）、a（加速度）、dir（滑動方向）、limit（靜摩擦已達最大值）。
   * 靠在擋板上而 |D| > μs N 時，靜摩擦力的大小在力學上不唯一（靜不定）；這裡取最大靜摩擦力 μs N，其餘由擋板（或手）提供。
   */
  function forcesAt(p, v, contact) {
    const k = components(p);
    k.f = 0; k.kind = 'static'; k.P = 0; k.net = 0; k.a = 0; k.dir = 0; k.limit = false;
    if (v > 0 || v < 0) {
      const sv = v > 0 ? 1 : -1;
      k.kind = 'kinetic'; k.dir = sv;
      k.f = -sv * k.fk || 0;
      k.net = k.D + k.f;
      k.a = k.net / k.m;
      return k;
    }
    if (holdsStatic(k)) { k.f = -k.D || 0; return k; }
    const dir = k.D > 0 ? 1 : -1;
    if (contact === 2 || contact === dir) {
      k.f = -dir * k.fsMax;
      k.P = -(k.D + k.f);
      k.limit = true;
      return k;
    }
    k.kind = 'kinetic'; k.dir = dir;
    k.f = -dir * k.fk || 0;
    k.net = k.D + k.f;
    k.a = k.net / k.m;
    return k;
  }

  /** 解 x0 + v τ + ½ a τ² = X，傳回所有實根（數值穩定的公式） */
  function roots(x0, v, a, X) {
    const c = x0 - X;
    if (a === 0) return v === 0 ? [] : [-c / v];
    const disc = v * v - 2 * a * c;
    if (disc < 0) return [];
    const sq = Math.sqrt(disc);
    const q = -0.5 * (v + (v >= 0 ? sq : -sq));
    if (q === 0) return [0];
    return [q / (0.5 * a), c / q];
  }
  /** 最早在 (lo, hi] 之間到達 X、而且此時速度方向符合 sgn（+1 往正、−1 往負、0 不限）的時刻；沒有則傳回 Infinity */
  function firstTime(x0, v, a, X, lo, hi, sgn) {
    let best = Infinity;
    roots(x0, v, a, X).forEach(function (t) {
      if (!(t > lo && t <= hi)) return;
      const vv = v + a * t;
      if (sgn > 0 && vv < 0) return;
      if (sgn < 0 && vv > 0) return;
      if (t < best) best = t;
    });
    return best;
  }

  /** 新的運動狀態（能量帳歸零） */
  function newState(x, v, contact) {
    return { x: x || 0, v: v || 0, t: 0, contact: contact || 0, wG: 0, wF: 0, wf: 0, lost: 0, path: 0 };
  }

  /**
   * 前進 dt 秒（這段時間內 p 不變）。opt = { xMin, xMax, gates: [x…] }。
   * 傳回 { s: 新狀態, ev: 事件 }；事件：
   *   slip  { t, x, dir }        靜止的木塊開始滑動（靜摩擦力撐不住了）
   *   stop  { t, x }             滑動中速度減為 0
   *   stick { t, x }             停下後被靜摩擦力黏住
   *   turn  { t, x, dir }        停下的瞬間立刻往回滑（靜摩擦力撐不住）
   *   hit   { t, x, end, v }     撞到擋板（end：+1 下端、−1 上端；v：撞擊前的速度）
   *   gate  { t, x, i, v }       木塊中心通過第 i 個光電門
   */
  function step(p, st, dt, opt) {
    opt = opt || {};
    const xMin = opt.xMin == null ? -Infinity : opt.xMin;
    const xMax = opt.xMax == null ? Infinity : opt.xMax;
    const gates = opt.gates || [];
    const s = Object.assign({}, st);
    const ev = [];
    let rem = dt, guard = 0, turning = false;
    while (rem > 1e-15 && guard++ < 60) {
      const fo = forcesAt(p, s.v, s.contact);
      // 已經在擋板位置、又要往外走：視為靠在擋板上（必要時記一次撞擊）
      const outB = s.x >= xMax && (s.v > 0 || (s.v === 0 && fo.a > 0));
      const outT = s.x <= xMin && (s.v < 0 || (s.v === 0 && fo.a < 0));
      if (outB || outT) {
        if (s.v !== 0) {
          s.lost += 0.5 * fo.m * s.v * s.v;
          ev.push({ type: 'hit', t: s.t, x: outB ? xMax : xMin, end: outB ? 1 : -1, v: s.v });
        }
        s.x = outB ? xMax : xMin;
        s.v = 0;
        s.contact = outB ? 1 : -1;
        continue;
      }
      if (s.v === 0 && fo.a === 0) { s.t += rem; rem = 0; break; }
      if (s.v === 0) {
        if (!turning) ev.push({ type: 'slip', t: s.t, x: s.x, dir: fo.dir });
        s.contact = 0;
      }
      turning = false;
      const v = s.v, a = fo.a;
      let h = rem, what = null;
      if (v !== 0 && a * v < 0) {
        const ts = -v / a;
        if (ts <= h) { h = ts; what = 'stop'; }
      }
      const tHi = firstTime(s.x, v, a, xMax, 0, h, 1);
      const tLo = firstTime(s.x, v, a, xMin, 0, h, -1);
      if (Math.min(tHi, tLo) <= h && Math.min(tHi, tLo) < Infinity) {
        h = Math.min(tHi, tLo);
        what = tHi <= tLo ? 'hitBottom' : 'hitTop';
      }
      // 光電門：這一段內通過的時刻（依時間先後）
      const gev = [];
      gates.forEach(function (gx, i) {
        roots(s.x, v, a, gx).forEach(function (t) {
          if (t > 1e-12 && t <= h + 1e-12) gev.push({ type: 'gate', i: i, t: s.t + t, x: gx, v: v + a * t });
        });
      });
      gev.sort(function (A, B) { return A.t - B.t; }).forEach(function (e) { ev.push(e); });

      const dx = v * h + 0.5 * a * h * h;
      s.wG += fo.Wpar * dx;
      s.wF += fo.Fpar * dx;
      s.wf += fo.f * dx;
      s.path += Math.abs(dx);
      s.t += h;
      rem -= h;
      if (what === 'hitBottom' || what === 'hitTop') {
        const vi = v + a * h;
        s.x = what === 'hitBottom' ? xMax : xMin;
        s.lost += 0.5 * fo.m * vi * vi;
        s.v = 0;
        s.contact = what === 'hitBottom' ? 1 : -1;
        ev.push({ type: 'hit', t: s.t, x: s.x, end: s.contact, v: vi });
      } else if (what === 'stop') {
        s.x += dx;
        s.v = 0;
        s.contact = 0;
        ev.push({ type: 'stop', t: s.t, x: s.x });
        const f2 = forcesAt(p, 0, s.contact);
        if (f2.a === 0) ev.push({ type: 'stick', t: s.t, x: s.x });
        else { ev.push({ type: 'turn', t: s.t, x: s.x, dir: f2.dir }); turning = true; }
      } else {
        s.x += dx;
        s.v = v + a * h;
        if (dx !== 0) s.contact = 0;
        if (s.x > xMax) s.x = xMax;   // 只防捨入誤差
        if (s.x < xMin) s.x = xMin;
      }
    }
    return { s: s, ev: ev };
  }

  /** 連續模擬到時間 T（測試與任務驗證用；dt 只影響事件分段，不影響精確度） */
  function simulate(p, st, T, opt, dt) {
    dt = dt || 0.01;
    let s = st;
    const ev = [];
    const n = Math.ceil(T / dt - 1e-9);
    for (let i = 0; i < n; i++) {
      const h = Math.min(dt, T - i * dt);
      const r = step(p, s, h, opt);
      s = r.s;
      r.ev.forEach(function (e) { ev.push(e); });
    }
    return { s: s, ev: ev };
  }

  function kinetic(m, v) { return 0.5 * m * v * v; }

  /** 臨界角（休止角）θc = arctan μs（rad） */
  function criticalAngle(mus) { return Math.atan(mus); }

  /** 往 dir（+1 下、−1 上）滑動時的加速度（沿斜面向下為正） */
  function slideAccel(p, dir) {
    const k = components(p);
    return (k.D - dir * k.fk) / k.m;
  }

  /**
   * 特別的外力（同一個 mode 下；Infinity 代表做不到）：
   *   upStart：大於這個值，靜止的木塊開始往上滑（最小推力）
   *   hold：至少這個值才不會往下滑（≤ 0 代表不用推也不會滑）
   *   upConst／downConst：滑動中保持等速往上／往下所需的外力
   *   selfLock：水平推時無論多用力都推不上去（cos θ ≤ μs sin θ）
   */
  function thresholds(p) {
    const k = components(Object.assign({}, p, { F: 0 }));
    const s = k.sin, c = k.cos, W = k.W, mus = k.mus, muk = k.muk;
    if (k.mode === 'horiz') {
      const cu = c - mus * s, ck = c - muk * s;
      return {
        upStart: cu > 1e-12 ? W * (s + mus * c) / cu : Infinity,
        hold: W * (s - mus * c) / (c + mus * s),
        upConst: ck > 1e-12 ? W * (s + muk * c) / ck : Infinity,
        downConst: W * (s - muk * c) / (c + muk * s),
        selfLock: cu <= 1e-12
      };
    }
    return {
      upStart: W * (s + mus * c),
      hold: W * (s - mus * c),
      upConst: W * (s + muk * c),
      downConst: W * (s - muk * c),
      selfLock: false
    };
  }

  /** 滑動方向 dir 時，要得到加速度 a（沿斜面向下為正）所需的外力 F（同一個 mode） */
  function forceForAccel(p, a, dir) {
    const k = components(Object.assign({}, p, { F: 0 }));
    const s = k.sin, c = k.cos, m = k.m, g = k.g, muk = k.muk;
    const rhs = m * g * s - dir * muk * m * g * c - m * a;
    if (k.mode === 'horiz') return rhs / (c + dir * muk * s);
    return rhs;
  }

  /** 水平推不上去的最小角度（自鎖角）θ = arctan(1/μs) = 90° − θc（rad） */
  function lockAngle(mus) { return mus > 0 ? Math.atan(1 / mus) : Math.PI / 2; }

  /** 由「靜止釋放、x = 0、t = 0」通過兩個光電門的時間求加速度：x = ½at² → a = 2(x2 − x1)/(t2² − t1²) */
  function accelFromGates(x1, t1, x2, t2) { return 2 * (x2 - x1) / (t2 * t2 - t1 * t1); }
  /** 沒有外力、往下滑的加速度 a 反推 μk = tan θ − a/(g cos θ) */
  function mukFromAccel(theta, a, g) {
    g = g == null ? G : g;
    const tr = trig(theta);
    return tr.s / tr.c - a / (g * tr.c);
  }

  /** 神秘表面：μs ∈ [0.30, 0.85]、μk = μs × [0.45, 0.85]，取到小數第 3 位（rand() ∈ [0, 1)） */
  function mysterySurface(rand) {
    rand = rand || Math.random;
    const mus = Math.round((0.30 + 0.55 * rand()) * 1000) / 1000;
    const muk = Math.round(mus * (0.45 + 0.40 * rand()) * 1000) / 1000;
    return { mus: mus, muk: Math.min(muk, mus - 0.01) };
  }

  const api = {
    G: G, D2R: D2R, SURFACES: SURFACES,
    trig: trig, components: components, forcesAt: forcesAt, roots: roots,
    newState: newState, step: step, simulate: simulate, kinetic: kinetic,
    criticalAngle: criticalAngle, slideAccel: slideAccel, thresholds: thresholds,
    forceForAccel: forceForAccel, lockAngle: lockAngle,
    accelFromGates: accelFromGates, mukFromAccel: mukFromAccel, mysterySurface: mysterySurface
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.InclineCore = api;
})(typeof window !== 'undefined' ? window : this);
