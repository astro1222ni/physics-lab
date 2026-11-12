/*
 * angular-momentum-core.js — 「角動量守恆」物理核心（與畫面無關，可單獨在 Node 測試）
 *
 * 單位一律 SI：m、kg、s、rad、N、J。角度由 +x 軸逆時針量起；逆時針轉動的角動量為正（指向 +z，俯視圖中朝向觀察者）。
 *
 * ── 模式一「穿過小孔的繩子」 ──────────────────────────────────────────
 *   光滑水平桌面上質量 m 的小球，繩子穿過桌面中央的小孔（原點），桌面下的手控制桌面上的繩長 r。
 *   繩子拉緊時 r(t) 由手決定：等加速 → 等速 u → 等減速（planMove），兩端 ṙ = 0。
 *   小球只受指向小孔的張力（連心力），切線方向沒有力：
 *       r θ̈ + 2 ṙ θ̇ = 0                     （切線方向的運動方程式）
 *       T = m (r θ̇² − r̈)                     （徑向方程式求出的繩張力）
 *       dW/dt = T·(−ṙ)                         （手經由繩子對小球作功的功率）
 *   以上用 RK4 數值積分（步長 ≤ 0.5 ms，在加速度不連續的時刻切開），**不把 L 當成輸入**，
 *   再檢查 L = m r² θ̇ 是否守恆、W 是否等於動能變化 ΔK（測試檔量漂移）。
 *   放手增加的「等減速」與「等加速」段的加速度有上限，保證全程 T ≥ 0（繩子只能拉、不能推）。
 *   鬆手或張力超過繩子能承受的上限 Tmax（繩斷）之後 T = 0：等速直線運動（解析解）。
 *
 * ── 模式二「旋轉平台」 ───────────────────────────────────────────────
 *   人站在可自由轉動（無摩擦）的平台上，雙手各拿一個啞鈴：
 *       I = ½ M_b R_b²（人體，近似均勻圓柱） + ½ M_p R_p²（平台，均勻圓盤） + 2 m_d r²（兩個啞鈴，視為質點）
 *   I 只由質量分布（啞鈴離轉軸的距離 r）決定，與轉速無關。手臂移動時外力矩為零：L = I ω 守恆。
 *   手臂質量併入人體圓柱、不另計；左右手的姿勢對稱，所以手臂擺動不會產生額外的淨角動量。
 *
 * ── 模式三「兩盤相合」 ───────────────────────────────────────────────
 *   上盤落到旋轉的下盤上（同軸），接觸面的動摩擦力矩 τ = ⅔ μ M2 g R_c（均勻壓力的圓形接觸面，R_c = 較小的半徑）
 *   讓兩盤轉速趨於一致；兩盤之間只有內力矩，L = I1ω1 + I2ω2 守恆：
 *       ω_f = (I1ω1 + I2ω2)/(I1 + I2)，動能損失 = ½·I1I2/(I1+I2)·(ω1 − ω2)²（轉動版的完全非彈性碰撞）
 */
(function (root) {
  'use strict';

  const G0 = 9.80665;          // 標準重力加速度（SI 定義值，m/s²）
  const TWO_PI = 2 * Math.PI;

  // =====================================================================
  // 模式一：穿過小孔的繩子
  // =====================================================================
  const HOLE = {
    rMin: 0.15,      // m：手能把小球拉到的最小半徑（小球半徑＋小孔）
    rMax: 1.8,       // m：桌面上繩長的上限
    aMax: 1.5,       // m/s²：手收放繩子時加速度的上限
    kappa: 0.5,      // 放繩的加速段與收繩的減速段：r̈ ≤ κ·h²/r³，保證 T ≥ (1 − κ)·m h²/r³ > 0
    Tmax: 30,        // N：繩子能承受的最大張力，超過就斷
    rope: 2.3,       // m：繩子全長（桌面上＋桌面下）
    hMax: 0.0005     // s：RK4 最大步長
  };

  /**
   * 手收放繩子的規劃：從 rs 到 rt，最大速率 u（m/s），h = L/m = r²θ̇（m²/s）。
   * 速率圖為梯形：等加速 a1（t1）→ 等速 uc（t2）→ 等減速 a2（t3）；距離太短時沒有等速段。
   * r̈ > 0 的那一段（放繩的加速段、收繩的減速段）加速度 ≤ κ h²/r³（以該段最遠的半徑計），繩子全程拉緊。
   */
  function planMove(rs, rt, u, h, opt) {
    opt = opt || {};
    const aMax = opt.aMax || HOLE.aMax, kap = opt.kappa || HOLE.kappa;
    const D = Math.abs(rt - rs), sgn = rt >= rs ? 1 : -1;
    const empty = { rs: rs, rt: rs, sgn: sgn, a1: aMax, a2: aMax, uc: 0, d1: 0, d2: 0, d3: 0, t1: 0, t2: 0, t3: 0, T: 0 };
    if (!(D > 1e-12) || !(u > 0)) return empty;
    const hh = h * h;
    function prof(aPos) {
      const a1 = sgn > 0 ? aPos : aMax, a2 = sgn > 0 ? aMax : aPos;
      const uc = Math.min(u, Math.sqrt(2 * D * a1 * a2 / (a1 + a2)));
      const rm = sgn > 0 ? rs + uc * uc / (2 * a1) : rt + uc * uc / (2 * a2); // r̈ > 0 段裡最大的半徑
      return { a1: a1, a2: a2, uc: uc, rm: rm };
    }
    function ok(a) { const p = prof(a); return a <= kap * hh / (p.rm * p.rm * p.rm); }
    let aPos = aMax;
    if (!ok(aMax)) {
      // 二分搜尋：lo 永遠滿足條件（以整段最大半徑計的保守值一定可行）
      let lo = Math.min(aMax, kap * hh / Math.pow(Math.max(rs, rt), 3)), hi = aMax;
      for (let i = 0; i < 80; i++) { const mid = 0.5 * (lo + hi); if (ok(mid)) lo = mid; else hi = mid; }
      aPos = lo;
    }
    const p = prof(aPos);
    const d1 = p.uc * p.uc / (2 * p.a1), d3 = p.uc * p.uc / (2 * p.a2), d2 = Math.max(0, D - d1 - d3);
    const t1 = p.uc / p.a1, t3 = p.uc / p.a2, t2 = d2 / p.uc;
    return { rs: rs, rt: rt, sgn: sgn, a1: p.a1, a2: p.a2, uc: p.uc, d1: d1, d2: d2, d3: d3, t1: t1, t2: t2, t3: t3, T: t1 + t2 + t3 };
  }

  /** 第 ph 段（0 等加速、1 等速、2 等減速）在規劃時間 t 的 r、ṙ、r̈（每段的公式在整個閉區間都成立） */
  function phaseKin(pl, ph, t) {
    const s = pl.sgn;
    if (ph === 0) return { r: pl.rs + s * 0.5 * pl.a1 * t * t, rd: s * pl.a1 * t, rdd: s * pl.a1 };
    if (ph === 1) { const u = t - pl.t1; return { r: pl.rs + s * (pl.d1 + pl.uc * u), rd: s * pl.uc, rdd: 0 }; }
    const tr = pl.T - t; // 剩下的時間
    return { r: pl.rt - s * 0.5 * pl.a2 * tr * tr, rd: s * pl.a2 * tr, rdd: -s * pl.a2 };
  }
  /** 規劃時間 t（0 ≤ t ≤ T）的 r、ṙ、r̈ */
  function moveAt(pl, t) {
    if (!(pl.T > 0) || t <= 0) return { r: pl.rs, rd: 0, rdd: 0 };
    if (t >= pl.T) return { r: pl.rt, rd: 0, rdd: 0 };
    return phaseKin(pl, t < pl.t1 ? 0 : t < pl.t1 + pl.t2 ? 1 : 2, t);
  }

  /** 新的模式一狀態：p = { m, r0, v0 }，小球在 θ = theta0 處以速率 v0 逆時針做圓周運動 */
  function holeCreate(p) {
    const om = p.v0 / p.r0;
    return {
      m: p.m, t: 0, r: p.r0, rd: 0, rdd: 0, th: p.theta0 || 0, om: om, W: 0,
      phase: 'hold', pl: null, mt: 0, free: null, cut: null,
      L0: p.m * p.r0 * p.r0 * om, K0: 0.5 * p.m * p.v0 * p.v0
    };
  }
  /** 張力 T = m(rω² − r̈)（繩子拉緊時） */
  function tension(m, r, om, rdd) { return m * (r * om * om - rdd); }

  /** RK4：y = [θ, ω, W]，r(t) 由規劃的第 ph 段給定 */
  function rk4(st, ph, h) {
    const pl = st.pl, m = st.m, t0 = st.mt;
    function f(t, th, om, W) {
      const k = phaseKin(pl, ph, t);
      return [om, -2 * k.rd * om / k.r, -tension(m, k.r, om, k.rdd) * k.rd];
    }
    const y0 = [st.th, st.om, st.W];
    const k1 = f(t0, y0[0], y0[1], y0[2]);
    const k2 = f(t0 + h / 2, y0[0] + h / 2 * k1[0], y0[1] + h / 2 * k1[1], y0[2] + h / 2 * k1[2]);
    const k3 = f(t0 + h / 2, y0[0] + h / 2 * k2[0], y0[1] + h / 2 * k2[1], y0[2] + h / 2 * k2[2]);
    const k4 = f(t0 + h, y0[0] + h * k3[0], y0[1] + h * k3[1], y0[2] + h * k3[2]);
    return [0, 1, 2].map(function (i) { return y0[i] + h / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]); });
  }

  /** 開始收放繩子：從目前半徑到 rt，最大速率 u。只在繩子拉緊、靜止（hold）時有效。 */
  function holeStartMove(st, rt, u, opt) {
    if (st.phase !== 'hold') return null;
    rt = Math.max(HOLE.rMin, Math.min(HOLE.rMax, rt));
    st.pl = planMove(st.r, rt, u, st.r * st.r * st.om, opt);
    st.mt = 0;
    if (!(st.pl.T > 0)) { st.pl = null; return null; }
    st.phase = 'move';
    st.moveStart = { t: st.t, r: st.r, om: st.om, K: holeKin(st).K, W: st.W };
    return st.pl;
  }

  /** 鬆手（或繩斷）：從目前的位置與速度改成等速直線運動 */
  function holeRelease(st, why) {
    if (st.phase === 'free') return;
    const c = Math.cos(st.th), s = Math.sin(st.th);
    const x = st.r * c, y = st.r * s;
    const vx = st.rd * c - st.r * st.om * s, vy = st.rd * s + st.r * st.om * c;
    st.free = { t0: st.t, x: x, y: y, vx: vx, vy: vy, why: why || 'letgo', r: st.r, th: st.th };
    st.phase = 'free';
    st.pl = null;
    st.rdd = 0;
  }
  function freeUpdate(st) {
    const f = st.free, tau = st.t - f.t0;
    const x = f.x + f.vx * tau, y = f.y + f.vy * tau;
    const r = Math.hypot(x, y);
    let th = Math.atan2(y, x);
    th += TWO_PI * Math.round((st.th - th) / TWO_PI); // 角度連續（不跳 2π）
    st.r = r; st.th = th;
    st.rd = (x * f.vx + y * f.vy) / r;
    st.om = (x * f.vy - y * f.vx) / (r * r);
    st.rdd = 0;
  }

  /**
   * 前進 dt 秒。傳回事件陣列：{ type: 'arrive' }（收放完成）、{ type: 'snap', T }（張力超過 Tmax，繩斷）。
   * opt.Tmax 可改繩子的上限（預設 HOLE.Tmax；Infinity 代表不會斷）。
   */
  function holeAdvance(st, dt, opt) {
    opt = opt || {};
    const Tmax = opt.Tmax == null ? HOLE.Tmax : opt.Tmax;
    const ev = [];
    let rem = dt, guard = 0;
    while (rem > 1e-15 && guard++ < 1e6) {
      if (st.phase === 'hold') { st.th += st.om * rem; st.t += rem; rem = 0; break; }
      if (st.phase === 'free') { st.t += rem; rem = 0; freeUpdate(st); break; }
      const pl = st.pl;
      const b = [pl.t1, pl.t1 + pl.t2, pl.T];
      const ph = st.mt < b[0] ? 0 : st.mt < b[1] ? 1 : 2;
      const end = b[ph];
      if (end - st.mt <= 1e-13) { // 剛好到達段落的邊界
        st.mt = end;
        if (ph === 2) { finishMove(st, ev); }
        continue;
      }
      const h = Math.min(rem, end - st.mt, HOLE.hMax);
      let y = rk4(st, ph, h);
      let k = phaseKin(pl, ph, st.mt + h);
      let hh = h;
      if (tension(st.m, k.r, y[1], k.rdd) > Tmax) {
        // 二分搜尋繩子斷掉的時刻（張力恰好等於 Tmax）
        let lo = 0, hi = h;
        for (let i = 0; i < 50; i++) {
          const mid = 0.5 * (lo + hi), ym = rk4(st, ph, mid), km = phaseKin(pl, ph, st.mt + mid);
          if (tension(st.m, km.r, ym[1], km.rdd) > Tmax) hi = mid; else lo = mid;
        }
        hh = hi;
        y = rk4(st, ph, hh);
        k = phaseKin(pl, ph, st.mt + hh);
        st.th = y[0]; st.om = y[1]; st.W = y[2];
        st.mt += hh; st.t += hh; rem -= hh;
        st.r = k.r; st.rd = k.rd; st.rdd = k.rdd;
        const Tsnap = tension(st.m, k.r, st.om, k.rdd);
        holeRelease(st, 'snap');
        ev.push({ type: 'snap', T: Tsnap });
        continue;
      }
      st.th = y[0]; st.om = y[1]; st.W = y[2];
      st.mt += hh; st.t += hh; rem -= hh;
      st.r = k.r; st.rd = k.rd; st.rdd = k.rdd;
      if (ph === 2 && pl.T - st.mt <= 1e-13) finishMove(st, ev);
    }
    return ev;
  }
  function finishMove(st, ev) {
    st.r = st.pl.rt; st.rd = 0; st.rdd = 0;
    st.phase = 'hold';
    st.lastMove = st.pl;
    st.pl = null;
    st.mt = 0;
    ev.push({ type: 'arrive' });
  }

  /** 目前的運動學與動力學量 */
  function holeKin(st) {
    const m = st.m, c = Math.cos(st.th), s = Math.sin(st.th);
    const x = st.r * c, y = st.r * s;
    const vx = st.rd * c - st.r * st.om * s, vy = st.rd * s + st.r * st.om * c;
    const vt = st.r * st.om, v = Math.hypot(st.rd, vt);
    const free = st.phase === 'free';
    const L = m * (x * vy - y * vx);        // = m r² ω
    const T = free ? 0 : tension(m, st.r, st.om, st.rdd);
    return {
      x: x, y: y, vx: vx, vy: vy, r: st.r, rd: st.rd, rdd: st.rdd, om: st.om, vt: vt, v: v,
      L: L, K: 0.5 * m * v * v, T: T, W: st.W, h: L / m,
      rperp: v > 0 ? Math.abs(L / m) / v : st.r,  // 速度所在直線到小孔的距離
      arealRate: 0.5 * L / m                       // 掃過面積的速率 dA/dt = L/(2m)
    };
  }

  /** 收放繩子完成後，手作的功的解析值 W = ½ m h² (1/r2² − 1/r1²) = ΔK */
  function moveWork(m, h, r1, r2) { return 0.5 * m * h * h * (1 / (r2 * r2) - 1 / (r1 * r1)); }

  /** 繩子拉緊做等速圓周運動時的張力 m v²/r = m h²/r³ */
  function holdTension(m, h, r) { return m * h * h / (r * r * r); }

  /** 小球在半徑 r 做圓周運動時，繩子剛好斷掉的半徑（m h²/r³ = Tmax） */
  function snapRadius(m, h, Tmax) { return Math.cbrt(m * h * h / (Tmax == null ? HOLE.Tmax : Tmax)); }

  /**
   * 鬆手後的直線上，最接近點 P(px, py) 的時刻 tau（≥ 0，從鬆手起算）與距離 miss（m）。
   * free = holeRelease 存下的 { x, y, vx, vy }
   */
  function freeClosest(free, px, py) {
    const v2 = free.vx * free.vx + free.vy * free.vy;
    const tau = Math.max(0, ((px - free.x) * free.vx + (py - free.y) * free.vy) / v2);
    return { tau: tau, miss: Math.hypot(free.x + free.vx * tau - px, free.y + free.vy * tau - py) };
  }

  /** 繩子拉緊、半徑 r 做圓周運動（逆時針）時，要在哪個角度 θ 鬆手，小球才會沿切線通過圓外一點 P（[0, 2π)）。 */
  function aimAngle(r, px, py) {
    const D = Math.hypot(px, py);
    if (!(D > r)) return NaN;
    let th = (Math.atan2(py, px) - Math.acos(r / D)) % TWO_PI;
    if (th < 0) th += TWO_PI;
    return th >= TWO_PI ? 0 : th;
  }

  /** 多邊形面積（鞋帶公式，逆時針為正） */
  function polyArea(pts) {
    let a = 0;
    for (let i = 0, n = pts.length; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return 0.5 * a;
  }

  // =====================================================================
  // 模式二：旋轉平台
  // =====================================================================
  const PLAT = {
    Rb: 0.15,        // m：人體圓柱的半徑
    Mp: 8,           // kg：平台（均勻圓盤）的質量
    Rp: 0.35,        // m：平台半徑
    rArmMin: 0.15,   // m：啞鈴離轉軸最近（貼在胸前）
    rArmMax: 0.9,    // m：手臂完全伸直
    fwdMax: 1.05     // rad：雙手收到胸前時往前轉的角度（只是姿勢，左右對稱，不影響 L 與 I）
  };

  /** 轉動慣量（kg·m²）：p = { Mb（人體質量）, md（每個啞鈴的質量）}，r = 啞鈴到轉軸的距離。與轉速無關。 */
  function platformI(p, r, noDumbbells) {
    const body = 0.5 * p.Mb * PLAT.Rb * PLAT.Rb;
    const plat = 0.5 * PLAT.Mp * PLAT.Rp * PLAT.Rp;
    const dumb = noDumbbells ? 0 : 2 * p.md * r * r;
    return { body: body, plat: plat, dumb: dumb, total: body + plat + dumb };
  }
  /** 雙手往前轉的姿勢角（只隨 r 變，左右手對稱） */
  function armForward(r) {
    const u = (PLAT.rArmMax - r) / (PLAT.rArmMax - PLAT.rArmMin);
    return PLAT.fwdMax * Math.max(0, Math.min(1, u));
  }
  /** 收手或伸手所需時間（s） */
  function armDuration(r0, r1) { return 0.45 + 1.1 * Math.abs(r1 - r0); }
  /** 五次平滑曲線（起點、終點的速度、加速度都是 0） */
  function smooth5(s) {
    s = Math.max(0, Math.min(1, s));
    return s * s * s * (10 + s * (-15 + 6 * s));
  }
  function smooth5d(s) { if (s <= 0 || s >= 1) return 0; return 30 * s * s * (1 - s) * (1 - s); }
  /** 手臂移動：從 r0 到 r1、歷時 dur，經過時間 t 時的 r 與 dr/dt */
  function armAt(r0, r1, dur, t) {
    const s = dur > 0 ? t / dur : 1;
    return { r: r0 + (r1 - r0) * smooth5(s), rd: dur > 0 ? (r1 - r0) * smooth5d(s) / dur : 0 };
  }
  /**
   * 手臂移動期間平台轉過的角度 Δφ = ∫ L/I(r(t)) dt（t 從 ta 到 tb），用 Simpson 積分（n 段，偶數）。
   */
  function spinAngle(p, L, r0, r1, dur, ta, tb, n) {
    n = n || 16;
    if (n % 2) n++;
    const h = (tb - ta) / n;
    if (!(h > 0)) return 0;
    let s = 0;
    for (let i = 0; i <= n; i++) {
      const t = ta + i * h, w = L / platformI(p, armAt(r0, r1, dur, t).r).total;
      s += w * (i === 0 || i === n ? 1 : i % 2 ? 4 : 2);
    }
    return s * h / 3;
  }
  /**
   * 旋轉平台在某一瞬間的能量：轉動動能 L²/(2I)，加上啞鈴的徑向動能 ½(2m_d)ṙ² 與姿勢擺動 m_d r² α̇²
   * （手臂移動時才有；兩端都是 0）。肌肉作的功 = 總動能的變化。
   */
  function spinEnergy(p, L, r, rd, alphaDot) {
    const I = platformI(p, r).total, w = L / I;
    const rot = 0.5 * I * w * w;
    const extra = p.md * rd * rd + p.md * r * r * (alphaDot || 0) * (alphaDot || 0);
    return { I: I, omega: w, rot: rot, total: rot + extra };
  }
  /** 收手或伸手前後的比較（I 只看 r） */
  function armChange(p, L, r1, r2) {
    const I1 = platformI(p, r1).total, I2 = platformI(p, r2).total;
    const w1 = L / I1, w2 = L / I2;
    const K1 = 0.5 * I1 * w1 * w1, K2 = 0.5 * I2 * w2 * w2;
    return { I1: I1, I2: I2, w1: w1, w2: w2, K1: K1, K2: K2, W: K2 - K1, Wformula: 0.5 * L * L * (1 / I2 - 1 / I1) };
  }
  /**
   * 鬆開啞鈴：放手瞬間每個啞鈴保有當時的速度（切線方向、大小 ωr），之後做等速直線運動（俯視）。
   * 傳回兩個啞鈴的起始位置與速度（世界座標），phi = 平台轉角（身體正面方向的角度 φ，身體的 +x' 在 φ 方向）。
   */
  function dumbbellRelease(phi, r, w) {
    const a = armForward(r);
    return [a, Math.PI - a].map(function (b) {
      const ang = phi + b, c = Math.cos(ang), s = Math.sin(ang);
      return { x: r * c, y: r * s, vx: -w * r * s, vy: w * r * c };
    });
  }

  // =====================================================================
  // 模式三：兩盤相合
  // =====================================================================
  const DISK = { h0: 0.05 }; // m：上盤放下前離下盤的高度

  /** 均勻圓盤繞中心軸的轉動慣量 ½MR² */
  function diskI(M, R) { return 0.5 * M * R * R; }
  /** 接觸面的動摩擦力矩（均勻壓力的圓形接觸面）：τ = ⅔ μ N R_c，N = M2g */
  function frictionTorque(mu, M2, R1, R2) { return 2 / 3 * mu * M2 * G0 * Math.min(R1, R2); }
  /** 落下所需時間 √(2h/g) */
  function dropTime(h) { return Math.sqrt(2 * (h == null ? DISK.h0 : h) / G0); }

  /** 兩盤相合的結果：p = { M1, R1, w1, M2, R2, w2, mu } */
  function coupleResult(p) {
    const I1 = diskI(p.M1, p.R1), I2 = diskI(p.M2, p.R2);
    const L = I1 * p.w1 + I2 * p.w2;
    const wf = L / (I1 + I2);
    const K0 = 0.5 * I1 * p.w1 * p.w1 + 0.5 * I2 * p.w2 * p.w2;
    const K1 = 0.5 * (I1 + I2) * wf * wf;
    const loss = K0 - K1;
    const tau = frictionTorque(p.mu, p.M2, p.R1, p.R2);
    const tLock = tau > 0 ? Math.abs(p.w1 - p.w2) * I1 * I2 / (tau * (I1 + I2)) : Infinity;
    return {
      I1: I1, I2: I2, L: L, wf: wf, K0: K0, K1: K1, loss: loss,
      frac: K0 > 0 ? loss / K0 : 0,
      lossFormula: 0.5 * I1 * I2 / (I1 + I2) * (p.w1 - p.w2) * (p.w1 - p.w2),
      tau: tau, tLock: tLock
    };
  }

  /**
   * 接觸後經過 s 秒的狀態（解析解）：滑動時兩盤各自等角加速度，直到轉速相同後一起轉。
   * 傳回 { w1, w2, a1, a2（接觸後各轉過的角度）, locked, Q（摩擦生熱）, L }
   */
  function coupleAt(p, s) {
    const c = coupleResult(p);
    const sg = Math.sign(p.w1 - p.w2);
    const al1 = -sg * c.tau / c.I1, al2 = sg * c.tau / c.I2; // 角加速度
    const tl = c.tLock;
    if (s < tl) {
      const w1 = p.w1 + al1 * s, w2 = p.w2 + al2 * s;
      const dw0 = Math.abs(p.w1 - p.w2);
      const kap = c.tau * (1 / c.I1 + 1 / c.I2); // |Δω| 每秒減少多少
      return {
        w1: w1, w2: w2, a1: p.w1 * s + 0.5 * al1 * s * s, a2: p.w2 * s + 0.5 * al2 * s * s,
        locked: false, Q: c.tau * (dw0 * s - 0.5 * kap * s * s), L: c.I1 * w1 + c.I2 * w2
      };
    }
    const a1 = p.w1 * tl + 0.5 * al1 * tl * tl, a2 = p.w2 * tl + 0.5 * al2 * tl * tl;
    return { w1: c.wf, w2: c.wf, a1: a1 + c.wf * (s - tl), a2: a2 + c.wf * (s - tl), locked: true, Q: c.loss, L: c.L };
  }

  const api = {
    G0: G0, TWO_PI: TWO_PI, HOLE: HOLE, PLAT: PLAT, DISK: DISK,
    planMove: planMove, moveAt: moveAt, phaseKin: phaseKin,
    holeCreate: holeCreate, holeStartMove: holeStartMove, holeRelease: holeRelease, holeAdvance: holeAdvance, holeKin: holeKin,
    tension: tension, moveWork: moveWork, holdTension: holdTension, snapRadius: snapRadius,
    freeClosest: freeClosest, aimAngle: aimAngle, polyArea: polyArea,
    platformI: platformI, armForward: armForward, armDuration: armDuration, armAt: armAt, smooth5: smooth5,
    spinAngle: spinAngle, spinEnergy: spinEnergy, armChange: armChange, dumbbellRelease: dumbbellRelease,
    diskI: diskI, frictionTorque: frictionTorque, dropTime: dropTime, coupleResult: coupleResult, coupleAt: coupleAt
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AngMomCore = api;
})(typeof window !== 'undefined' ? window : this);
