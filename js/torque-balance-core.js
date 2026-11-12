/*
 * torque-balance-core.js — 力矩與靜力平衡的物理核心（不碰 DOM；Node 與瀏覽器共用，window.TorqueCore）
 *
 * 單位一律 SI：質量 kg、長度 m、角度 rad、力 N、力矩 N·m、時間 s。g 取標準重力加速度 9.80665 m/s²（定義值）。
 *
 * ── 模式一：槓桿與蹺蹺板 ──────────────────────────────────────────────
 *   木板長 L = 4 m、均勻、質量 M（0 = 輕桿）。位置 x 由木板左端量起（0 ～ L），刻度與格點每 0.25 m。
 *   支點（轉軸）在 x = p，離地 H = 0.40 m；角度 θ 以逆時針為正（右端抬高為正）。
 *   薄板近似：板子與物體的厚度忽略，板子本身與所有物體的重量都看成作用在板的中心線上該刻度處
 *   （吊掛的砝碼：作用在掛鉤點，繩子保持鉛直）。所以所有重力的力臂都是 (x − p) cos θ，
 *     Στ = −g cos θ · S，S = M(L/2 − p) + Σ m_i (x_i − p)（質量對支點的一次矩）
 *     I  = M(L²/12 + (L/2 − p)²) + Σ m_i (x_i − p)²       （只由質量分布決定，與角速度無關）
 *   放開後 I α = Στ → θ'' = −(g S / I) cos θ，用 RK4（每步 ≤ 0.5 ms）數值積分；能量 ½Iω² + g S sin θ 守恆。
 *   事件（板端碰地、彈簧秤拉緊、吊掛砝碼碰地／再被提起）用二分法找出精確時刻：
 *     板端碰地 → 完全非彈性，停在接觸角；吊掛砝碼碰地 → 繩子變鬆、板子 ω 不變；
 *     再被提起 → 對支點角動量守恆 I ω = I′ω′；彈簧秤（只能往上拉）拉緊 → 板子停在水平。
 *   平衡（水平靜止）的條件：S = 0（Στ = 0）；或彈簧秤以 F = g S / s_k ≥ 0 往上拉（s_k = 秤的位置 − p）。
 *   靜止時支點的力 N = 總重 − 彈簧秤 − 地面（ΣF = 0）；轉動中 N = 總重 + M a_cm,y（質心在加速）。
 *
 * ── 模式二：靠牆的梯子 ────────────────────────────────────────────────
 *   均勻梯子長 L、質量 m_l，與地面夾角 θ；人（質量 m_p）站在沿梯子距底端 d 處。
 *   地面：正向力 N_g、靜摩擦力 f_g（指向牆）；牆：正向力 N_w、摩擦力 f_w（向上）。
 *     ΣFx：f_g = N_w　ΣFy：N_g + f_w = W　Στ(底端)：N_w sin θ + f_w cos θ = τ_w cos θ，
 *     τ_w = W_l/2 + W_p d/L。
 *   光滑牆（μ_w = 0）：N_w = τ_w cot θ = f_g、N_g = W；不滑的條件 f_g ≤ μ_s N_g。
 *   粗糙牆是靜不定問題：取「兩處摩擦力用到各自上限的同樣比例 k」的那一組力（k ≤ 1 就不滑；
 *   可以證明 k 正是所有可能的力組中最小的「最大使用率」，所以滑不滑的判斷與這個取法無關）。
 *   臨界角：tan θ_c = τ_w (1 + μ_s μ_w) / (μ_s W) − μ_w；光滑牆、沒有人：tan θ_c = 1/(2μ_s)。
 *   滑倒（簡化）：兩端先保持接觸（底端沿地面、頂端沿牆面滑），動摩擦係數取與靜摩擦相同；
 *   牆的正向力降到 0 時頂端離開牆面，之後只剩底端接觸（底端停下後繞底端倒下），倒到地面為止。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TorqueCore = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const G = 9.80665;
  const D2R = Math.PI / 180;

  // ======================= 模式一：槓桿與蹺蹺板 =======================
  const SEESAW = Object.freeze({ L: 4, H: 0.4, GRID: 0.25, P_MIN: 1, P_MAX: 3, M_MAX: 30, STACK: 3, HOOK: 0.07, THICK: 0.05 });
  /** 工具箱的物體：質量、能否吊掛、畫面大小（w、h；吊掛時掛鉤到底部的距離 = HOOK + h，用來判斷碰地） */
  const KINDS = Object.freeze({
    w1: Object.freeze({ m: 1, hang: true, w: 0.13, h: 0.1 }),
    w2: Object.freeze({ m: 2, hang: true, w: 0.15, h: 0.13 }),
    w5: Object.freeze({ m: 5, hang: true, w: 0.19, h: 0.18 }),
    brick: Object.freeze({ m: 2.5, hang: false, w: 0.23, h: 0.11 }),
    child: Object.freeze({ m: 20, hang: false, person: true, w: 0.3, h: 0.62 }),
    adult: Object.freeze({ m: 60, hang: false, person: true, w: 0.4, h: 0.88 })
  });
  function hangDepth(it) { return SEESAW.HOOK + (KINDS[it.kind] ? KINDS[it.kind].h : 0.1); }

  function sq(x) { return x * x; }
  function geom(cfg) { return { L: cfg.L || SEESAW.L, H: cfg.H || SEESAW.H, p: cfg.p }; }

  /**
   * 由板子撐著的質量的總和（落地的吊掛砝碼由地面撐住，不算）。
   * 傳回 Mt（總質量）、S（對支點的一次矩，右為正，kg·m）、I（對支點的轉動慣量）、W、Wb（板重）、Wi（物體重）、
   * xcm（系統重心，由左端量起）、tol（判斷 S = 0 的容許值）。
   */
  function sums(cfg, grounded) {
    const q = geom(cfg), M = cfg.M || 0, sb = q.L / 2 - q.p;
    let Mt = M, S = M * sb, I = M * (q.L * q.L / 12 + sb * sb), abs = Math.abs(M * sb), Wi = 0, n = 0;
    (cfg.items || []).forEach(function (it) {
      if (grounded && grounded[it.id]) return;
      const s = it.x - q.p;
      Mt += it.m; S += it.m * s; I += it.m * s * s; abs += Math.abs(it.m * s); Wi += it.m * G; n++;
    });
    return { Mt: Mt, S: S, I: I, W: Mt * G, Wb: M * G, Wi: Wi, n: n, xcm: Mt > 0 ? q.p + S / Mt : NaN, tol: 1e-9 * (abs + 1) };
  }

  /**
   * 每個重力的力臂與力矩（角度 θ 時；力臂 = 支點到作用線的垂直距離 = |x − p| cos θ）。
   * 傳回 { list: [{ id（板子為 'board'）, x, m, F, arm（帶號，右正）, tau（逆時針為正）}], ccw, cw（大小）, net }
   */
  function torques(cfg, theta, grounded) {
    const q = geom(cfg), c = Math.cos(theta || 0);
    const list = [];
    if ((cfg.M || 0) > 0) list.push({ id: 'board', x: q.L / 2, m: cfg.M, F: cfg.M * G, arm: (q.L / 2 - q.p) * c, tau: -cfg.M * G * (q.L / 2 - q.p) * c });
    (cfg.items || []).forEach(function (it) {
      if (grounded && grounded[it.id]) return;
      const arm = (it.x - q.p) * c;
      list.push({ id: it.id, x: it.x, m: it.m, F: it.m * G, arm: arm, tau: -it.m * G * arm });
    });
    let ccw = 0, cw = 0;
    list.forEach(function (f) { if (f.tau > 0) ccw += f.tau; else cw -= f.tau; });
    return { list: list, ccw: ccw, cw: cw, net: ccw - cw };
  }

  /** 板端碰地的角度：左端碰地 θ > 0、右端碰地 θ < 0（板端離地高度 H + s sin θ = 0） */
  function groundAngles(cfg) {
    const q = geom(cfg);
    return { left: q.p > q.H ? Math.asin(q.H / q.p) : NaN, right: (q.L - q.p) > q.H ? -Math.asin(q.H / (q.L - q.p)) : NaN };
  }

  /** 吊掛物底部的離地高度（< 0 表示會碰到地面） */
  function hangClear(cfg, it, theta) {
    const q = geom(cfg);
    return q.H + (it.x - q.p) * Math.sin(theta) - hangDepth(it);
  }

  /** 讓板子在水平保持靜止，彈簧秤需要的拉力 F = g S / s_k（< 0 表示要往下壓，彈簧秤做不到） */
  function scaleNeed(cfg, grounded) {
    if (!cfg.scale) return null;
    const sk = cfg.scale.x - cfg.p;
    if (Math.abs(sk) < 1e-9) return { sk: 0, F: 0, atPivot: true };
    return { sk: sk, F: G * sums(cfg, grounded).S / sk, atPivot: false };
  }

  /** 單一物體放在哪裡可讓板子平衡：x = p − S / m（不考慮格點與板長） */
  function balancePosition(cfg, m) { return cfg.p - sums(cfg).S / m; }

  /** 初始狀態（支架撐住、水平） */
  function seesawState() { return { theta: 0, omega: 0, rest: null, grounded: {}, t: 0, t0: 0 }; }
  function copyState(s) {
    return { theta: s.theta, omega: s.omega, rest: s.rest, grounded: Object.assign({}, s.grounded), t: s.t, t0: s.t0 };
  }

  /** 在水平靜止時判斷是哪一種平衡：'level'（Στ = 0）、'scale'（由彈簧秤撐住）或 null（會轉） */
  function settle(cfg, st) {
    if (st.omega !== 0 || Math.abs(st.theta) > 1e-12) return st;
    st.theta = 0;
    const sm = sums(cfg, st.grounded);
    if (Math.abs(sm.S) <= sm.tol) { st.rest = 'level'; return st; }
    const sc = scaleNeed(cfg, st.grounded);
    if (sc && !sc.atPivot && sc.F > 0) { st.rest = 'scale'; return st; }
    st.rest = null;
    return st;
  }

  /** 靜止狀態能否維持 */
  function stays(cfg, st) {
    const sm = sums(cfg, st.grounded);
    if (st.rest === 'level') return Math.abs(sm.S) <= sm.tol;
    if (st.rest === 'scale') {
      if (Math.abs(sm.S) <= sm.tol) { st.rest = 'level'; return true; }
      const sc = scaleNeed(cfg, st.grounded);
      return !!(sc && !sc.atPivot && sc.F > 0);
    }
    if (st.rest === 'L') return sm.S <= sm.tol;   // 左端著地：重心在支點左邊（或正上方）才壓得住
    if (st.rest === 'R') return sm.S >= -sm.tol;
    return false;
  }

  function rk4(K, th, om, h) {
    const a1 = -K * Math.cos(th);
    const o2 = om + 0.5 * h * a1, a2 = -K * Math.cos(th + 0.5 * h * om);
    const o3 = om + 0.5 * h * a2, a3 = -K * Math.cos(th + 0.5 * h * o2);
    const o4 = om + h * a3, a4 = -K * Math.cos(th + h * o3);
    return [th + h / 6 * (om + 2 * o2 + 2 * o3 + o4), om + h / 6 * (a1 + 2 * a2 + 2 * a3 + a4)];
  }

  /** 目前可能發生的事件：hit(θ) 為真代表已越過 */
  function eventList(cfg, st) {
    const q = geom(cfg), out = [];
    out.push({ type: 'land', side: 'L', hit: function (th) { return q.H - q.p * Math.sin(th) <= 0; } });
    out.push({ type: 'land', side: 'R', hit: function (th) { return q.H + (q.L - q.p) * Math.sin(th) <= 0; } });
    if (cfg.scale) {
      const sk = cfg.scale.x - q.p;
      if (Math.abs(sk) >= 1e-9) out.push({ type: 'catch', hit: function (th) { return sk * Math.sin(th) < 0; } });
    }
    (cfg.items || []).forEach(function (it) {
      if (!it.hang) return;
      if (st.grounded[it.id]) out.push({ type: 'itemLift', id: it.id, hit: function (th) { return hangClear(cfg, it, th) > 1e-12; } });
      else out.push({ type: 'itemGround', id: it.id, hit: function (th) { return hangClear(cfg, it, th) <= 0; } });
    });
    return out.filter(function (e) { return !e.hit(st.theta); });
  }

  /**
   * 放開後前進 dt 秒。傳回 { st, events }；events：
   *   { type: 'land', side: 'L' | 'R', omega（碰地前的角速度）, vEnd（板端速率）, t, tRun（這次開始轉動到碰地的時間）}
   *   { type: 'catch', omega, t }（彈簧秤拉緊，板子停在水平）、{ type: 'lift', t }（靜止的板子開始轉）
   *   { type: 'itemGround', id, t }、{ type: 'itemLift', id, omega, t }
   * opt.h：RK4 步長上限（預設 0.5 ms）。
   */
  function seesawAdvance(cfg, st0, dt, opt) {
    const hMax = (opt && opt.h) || 5e-4;
    const st = copyState(st0);
    const q = geom(cfg);
    const events = [];
    let left = dt, guard = 0;
    while (left > 1e-15 && guard++ < 2e6) {
      if (st.rest) {
        if (stays(cfg, st)) { st.t += left; left = 0; break; }
        st.rest = null; st.omega = 0; st.t0 = st.t;
        events.push({ type: 'lift', t: st.t });
      }
      const sm = sums(cfg, st.grounded);
      const K = sm.I > 0 ? G * sm.S / sm.I : 0;
      if (K === 0 && st.omega === 0) { st.t += left; left = 0; break; } // 隨遇平衡：不動
      const h = Math.min(hMax, left);
      const nx = rk4(K, st.theta, st.omega, h);
      let first = null, fMin = 2;
      eventList(cfg, st).forEach(function (e) {
        if (!e.hit(nx[0])) return;
        let lo = 0, hi = 1;
        for (let i = 0; i < 60; i++) {
          const mid = 0.5 * (lo + hi);
          if (e.hit(rk4(K, st.theta, st.omega, h * mid)[0])) hi = mid; else lo = mid;
        }
        if (hi < fMin) { fMin = hi; first = e; }
      });
      if (!first) { st.theta = nx[0]; st.omega = nx[1]; st.t += h; left -= h; continue; }
      const y = rk4(K, st.theta, st.omega, h * fMin);
      st.theta = y[0]; st.omega = y[1]; st.t += h * fMin; left -= h * fMin;
      if (first.type === 'land') {
        const ga = groundAngles(cfg);
        const arm = first.side === 'L' ? q.p : q.L - q.p;
        events.push({ type: 'land', side: first.side, omega: st.omega, vEnd: Math.abs(st.omega) * arm, t: st.t, tRun: st.t - st.t0 });
        st.theta = first.side === 'L' ? ga.left : ga.right;
        st.omega = 0; st.rest = first.side;
      } else if (first.type === 'catch') {
        events.push({ type: 'catch', omega: st.omega, t: st.t });
        st.theta = 0; st.omega = 0;
        settle(cfg, st);
        if (!st.rest) st.t0 = st.t;
      } else if (first.type === 'itemGround') {
        st.grounded[first.id] = true;
        events.push({ type: 'itemGround', id: first.id, t: st.t });
      } else if (first.type === 'itemLift') {
        const I1 = sums(cfg, st.grounded).I;
        delete st.grounded[first.id];
        const I2 = sums(cfg, st.grounded).I;
        st.omega = I2 > 0 ? st.omega * I1 / I2 : 0;
        events.push({ type: 'itemLift', id: first.id, omega: st.omega, t: st.t });
      }
    }
    return { st: st, events: events };
  }

  /** 放開支架：從水平靜止開始 */
  function seesawRelease(cfg) {
    const st = seesawState();
    return settle(cfg, st);
  }

  /**
   * 板子放開後改變擺設（加入、移動、移除物體或彈簧秤）。對支點的角動量：被拿走的物體帶走自己的角動量，
   * 新放上去的物體原本靜止 → ω′ = ω (I − I_拿走) / I′。吊掛物若一放上去就碰到地面，由地面撐住。
   * 彈簧秤掛在比水平還低的點時，手先把板子拉回水平（θ = 0、ω = 0）。
   */
  function seesawEdit(cfgOld, cfgNew, st0) {
    const st = copyState(st0);
    const oldById = {};
    (cfgOld.items || []).forEach(function (it) { oldById[it.id] = it; });
    const newById = {};
    (cfgNew.items || []).forEach(function (it) { newById[it.id] = it; });
    const same = function (a, b) { return a && b && a.x === b.x && a.hang === b.hang && a.m === b.m; };
    const I1 = sums(cfgOld, st.grounded).I;
    let Iout = 0;
    (cfgOld.items || []).forEach(function (it) {
      if (st.grounded[it.id]) return;
      if (!same(it, newById[it.id])) Iout += it.m * sq(it.x - cfgOld.p);
    });
    const g = {};
    (cfgNew.items || []).forEach(function (it) {
      if (same(oldById[it.id], it) && st.grounded[it.id]) { g[it.id] = true; return; }
      if (it.hang && hangClear(cfgNew, it, st.theta) <= 0) g[it.id] = true;
    });
    st.grounded = g;
    if (cfgNew.scale) {
      const sk = cfgNew.scale.x - cfgNew.p;
      if (sk * Math.sin(st.theta) < -1e-12) { st.theta = 0; st.omega = 0; st.rest = null; st.grounded = {}; }
    }
    if (st.omega !== 0) {
      const I2 = sums(cfgNew, st.grounded).I;
      st.omega = I2 > 0 ? st.omega * (I1 - Iout) / I2 : 0;
    }
    if (st.omega === 0 && st.theta === 0) {
      const was = st.rest;
      settle(cfgNew, st);
      if (!st.rest && was) st.t0 = st.t;
    }
    // 靜止的板子若因新擺設而開始轉，由 seesawAdvance 發出 'lift' 事件
    return st;
  }

  /**
   * 支點、彈簧秤、地面對板子的力。
   * held（支架撐住）時三個支撐點分攤重量，力學上不唯一，N 傳回 NaN。
   * 轉動中：N = W + M a_cm,y、水平分量 Nx = M a_cm,x（a_cm = (S/M)(α ê⊥ − ω² ê∥)）。
   */
  function reactions(cfg, st, held) {
    const q = geom(cfg), sm = sums(cfg, st.grounded);
    const out = { W: sm.W, N: NaN, Nx: 0, F: 0, Ng: 0, alpha: 0, side: null };
    if (held) return out;
    if (st.rest === 'level') { out.N = sm.W; return out; }
    if (st.rest === 'scale') { out.F = scaleNeed(cfg, st.grounded).F; out.N = sm.W - out.F; return out; }
    if (st.rest === 'L' || st.rest === 'R') {
      const se = st.rest === 'L' ? -q.p : q.L - q.p;
      out.Ng = G * sm.S / se; out.N = sm.W - out.Ng; out.side = st.rest;
      return out;
    }
    const c = Math.cos(st.theta), s = Math.sin(st.theta), w2 = st.omega * st.omega;
    const alpha = sm.I > 0 ? -G * sm.S * c / sm.I : 0;
    out.alpha = alpha;
    out.N = sm.W + sm.S * (alpha * c - w2 * s);
    out.Nx = sm.S * (-alpha * s - w2 * c);
    return out;
  }

  /** 機械能（以水平為重力位能零點）：½ I ω² + g S sin θ */
  function seesawEnergy(cfg, st) {
    const sm = sums(cfg, st.grounded);
    return 0.5 * sm.I * st.omega * st.omega + G * sm.S * Math.sin(st.theta);
  }

  /** 任務用的狀態摘要（頁面與任務證明共用） */
  function seesawSnapshot(cfg, st, held) {
    const sm = sums(cfg, st.grounded), re = reactions(cfg, st, held), q = geom(cfg);
    const kinds = { w1: 0, w2: 0, w5: 0, brick: 0, child: 0, adult: 0 };
    const masses = {};
    let nHang = 0, nTop = 0, left = 0, right = 0, hangL = 0, hangR = 0, topL = 0, topR = 0;
    (cfg.items || []).forEach(function (it) {
      kinds[it.kind] = (kinds[it.kind] || 0) + 1;
      masses[it.m] = true;
      const side = it.x < q.p - 1e-9 ? -1 : it.x > q.p + 1e-9 ? 1 : 0;
      if (side < 0) left++; else if (side > 0) right++;
      if (it.hang) { nHang++; if (side < 0) hangL++; if (side > 0) hangR++; }
      else { nTop++; if (side < 0) topL++; if (side > 0) topR++; }
    });
    const sc = scaleNeed(cfg, st.grounded);
    return {
      M: cfg.M || 0, p: q.p, L: q.L, n: (cfg.items || []).length, kinds: kinds, distinct: Object.keys(masses).length,
      nHang: nHang, nTop: nTop, left: left, right: right, hangL: hangL, hangR: hangR, topL: topL, topR: topR,
      items: (cfg.items || []).map(function (it) { return { kind: it.kind, m: it.m, x: it.x, hang: !!it.hang }; }),
      S: sm.S, W: sm.W, Wb: sm.Wb, Wi: sm.Wi, I: sm.I, xcm: sm.xcm, N: re.N, F: re.F, Ng: re.Ng,
      scale: !!cfg.scale, scaleX: cfg.scale ? cfg.scale.x : null, scaleArm: sc ? sc.sk : null,
      theta: st.theta / D2R, omega: st.omega, rest: held ? 'held' : st.rest, held: !!held,
      byScale: st.rest === 'scale', level: st.rest === 'level' || st.rest === 'scale'
    };
  }

  // ======================= 模式二：靠牆的梯子 =======================
  const LADDER = Object.freeze({ L: 4, TH_MIN: 10, TH_MAX: 85 });

  function ladderWeights(o) {
    const L = o.L || LADDER.L;
    const Wl = o.ml * G, Wp = (o.mp || 0) * G, W = Wl + Wp;
    const d = Math.max(0, Math.min(L, o.d || 0));
    return { L: L, Wl: Wl, Wp: Wp, W: W, d: d, tw: Wl / 2 + Wp * d / L };
  }

  /** 臨界角（rad）：tan θ_c = τ_w (1 + μ μ_w)/(μ W) − μ_w；μ = 0 時為 90°（怎麼放都會滑） */
  function ladderCritical(o) {
    const w = ladderWeights(o), mu = o.mu || 0, muw = o.muw || 0;
    if (!(mu > 0)) return Math.PI / 2;
    const t = w.tw * (1 + mu * muw) / (mu * w.W) - muw;
    return t <= 0 ? 0 : Math.atan(t);
  }
  /** 角度 θ 時不滑需要的最小地面靜摩擦係數：μ_min = τ_w / (W tan θ + μ_w (W − τ_w)) */
  function ladderMuMin(o) {
    const w = ladderWeights(o), muw = o.muw || 0, t = Math.tan(o.theta);
    if (o.theta >= Math.PI / 2 - 1e-12) return 0;
    return w.tw / (w.W * t + muw * (w.W - w.tw));
  }
  /** 人往上爬，爬到沿梯子距底端多遠時開始滑（d 可能 < 0：一開始就滑；> L：爬到頂也不滑；沒有人時 NaN） */
  function ladderSlipD(o) {
    const w = ladderWeights(o), mu = o.mu || 0, muw = o.muw || 0;
    if (!(w.Wp > 0)) return NaN;
    if (!(mu > 0)) return -Infinity;
    const tc = mu * w.W * (Math.tan(o.theta) + muw) / (1 + mu * muw);
    return w.L * (tc - w.Wl / 2) / w.Wp;
  }

  /**
   * 梯子的靜力分析。o = { L, ml, mp, d, theta（rad）, mu, muw }。
   * k：摩擦力使用率（兩處摩擦力用到各自上限的比例，k ≤ 1 不滑）。
   * 不滑時傳回 k 那一組力；會滑時傳回「牆的摩擦力用到上限」時地面需要的力（fg > fgMax）。
   */
  function ladderStatics(o) {
    const w = ladderWeights(o), mu = Math.max(0, o.mu || 0), muw = Math.max(0, o.muw || 0);
    const th = o.theta;
    const vertical = th >= Math.PI / 2 - 1e-12;
    const c = vertical ? 0 : Math.cos(th) / Math.sin(th);
    let k;
    if (vertical || w.tw * c === 0) k = 0;
    else if (!(mu > 0)) k = Infinity;
    else {
      const a = mu * muw * c * (w.W - w.tw);
      k = a < 1e-12 * mu * w.W ? w.tw * c / (mu * w.W) : (-mu * w.W + Math.sqrt(sq(mu * w.W) + 4 * a * w.tw * c)) / (2 * a);
    }
    const slips = k > 1 + 1e-12;
    let Ng, Nw, fg, fw;
    if (!slips) {
      Ng = w.W / (1 + k * k * mu * muw); Nw = k * mu * Ng; fg = Nw; fw = k * muw * Nw;
    } else {
      Nw = w.tw * c / (1 + muw * c); fw = muw * Nw; Ng = w.W - fw; fg = Nw;
    }
    return {
      W: w.W, Wl: w.Wl, Wp: w.Wp, tw: w.tw, d: w.d, L: w.L, k: k, slips: slips,
      Ng: Ng, Nw: Nw, fg: fg, fw: fw, fgMax: mu * Ng, fwMax: muw * Nw,
      thetaC: ladderCritical(o), muMin: ladderMuMin(o), dSlip: ladderSlipD(o)
    };
  }

  /** 梯子＋人的質量性質：總質量 M、質心沿梯子距底端 sc、對質心的轉動慣量 Ic（只由質量分布決定） */
  function ladderMass(o) {
    const L = o.L || LADDER.L, ml = o.ml, mp = o.mp || 0, d = Math.max(0, Math.min(L, o.d || 0));
    const M = ml + mp, sc = (ml * L / 2 + mp * d) / M;
    return { L: L, M: M, sc: sc, Ic: ml * L * L / 12 + ml * sq(L / 2 - sc) + mp * sq(d - sc), ml: ml, mp: mp, d: d };
  }

  function solve3(A, b) {
    const m = A.map(function (r, i) { return r.concat([b[i]]); });
    for (let col = 0; col < 3; col++) {
      let piv = col;
      for (let r = col + 1; r < 3; r++) if (Math.abs(m[r][col]) > Math.abs(m[piv][col])) piv = r;
      const tmp = m[col]; m[col] = m[piv]; m[piv] = tmp;
      for (let r = 0; r < 3; r++) {
        if (r === col) continue;
        const f = m[r][col] / m[col][col];
        for (let k = col; k < 4; k++) m[r][k] -= f * m[col][k];
      }
    }
    return [m[0][3] / m[0][0], m[1][3] / m[1][1], m[2][3] / m[2][2]];
  }

  /**
   * 滑倒的運動方程式。牆在 x = 0，底端在 (xb, 0)，梯子方向 (cos θ, sin θ)。
   * phase 'wall'：兩端都接觸（xb = −L cos θ），未知數 α、N_g、N_w；
   * phase 'floor'：頂端已離開牆，未知數 底端加速度 ab、α、N_g（摩擦力與底端速度反向）；
   * phase 'pivot'：底端停住，繞底端轉動。
   */
  function ladderAccel(o, P, s) {
    const mu = Math.max(0, o.mu || 0), muw = Math.max(0, o.muw || 0);
    const M = P.M, sc = P.sc, Ic = P.Ic, L = P.L;
    const sn = Math.sin(s.theta), cs = Math.cos(s.theta), w2 = s.omega * s.omega;
    if (s.phase === 'wall') {
      const r = solve3([
        [M * (L - sc) * sn, -mu, 1],
        [M * sc * cs, -1, -muw],
        [Ic, -sc * (mu * sn - cs), -(L - sc) * (muw * cs + sn)]
      ], [-M * (L - sc) * cs * w2, M * sc * sn * w2 - M * G, 0]);
      return { alpha: r[0], Ng: r[1], Nw: r[2], ab: 0 };
    }
    if (s.phase === 'floor') {
      const sig = s.vb > 0 ? -1 : 1;
      const r = solve3([
        [M, -M * sc * sn, -sig * mu],
        [0, M * sc * cs, -1],
        [0, Ic, -sc * (sig * mu * sn - cs)]
      ], [M * sc * cs * w2, M * sc * sn * w2 - M * G, 0]);
      return { ab: r[0], alpha: r[1], Ng: r[2], Nw: 0 };
    }
    if (s.phase === 'pivot') return { ab: 0, alpha: -M * G * sc * cs / (Ic + M * sc * sc), Ng: NaN, Nw: 0 };
    return { ab: 0, alpha: 0, Ng: M * G, Nw: 0 };
  }

  function ladderSlideInit(o) {
    const L = o.L || LADDER.L;
    return { phase: 'wall', theta: o.theta, omega: 0, xb: -L * Math.cos(o.theta), vb: 0, t: 0 };
  }
  function slideRK4(o, P, s, h) {
    const f = function (x) {
      const a = ladderAccel(o, P, x);
      return [x.omega, a.alpha, x.phase === 'floor' ? x.vb : 0, x.phase === 'floor' ? a.ab : 0];
    };
    const add = function (x, k, c) {
      return { phase: x.phase, theta: x.theta + c * k[0], omega: x.omega + c * k[1], xb: x.xb + c * k[2], vb: x.vb + c * k[3], t: x.t + c };
    };
    const k1 = f(s), k2 = f(add(s, k1, h / 2)), k3 = f(add(s, k2, h / 2)), k4 = f(add(s, k3, h));
    const out = {
      phase: s.phase,
      theta: s.theta + h / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]),
      omega: s.omega + h / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]),
      xb: s.xb + h / 6 * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]),
      vb: s.vb + h / 6 * (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3]),
      t: s.t + h
    };
    if (s.phase === 'wall') { out.xb = -P.L * Math.cos(out.theta); out.vb = P.L * Math.sin(out.theta) * out.omega; }
    return out;
  }

  /**
   * 滑倒動畫前進 dt。events：{ type: 'separate' }（頂端離開牆）、{ type: 'stick' }（底端停住）、
   * { type: 'down', omega }（倒在地上）。
   */
  function ladderSlideAdvance(o, s0, dt, opt) {
    const hMax = (opt && opt.h) || 1e-3;
    const P = ladderMass(o);
    let s = Object.assign({}, s0);
    const events = [];
    let left = dt, guard = 0;
    while (left > 1e-15 && s.phase !== 'down' && guard++ < 1e6) {
      const h = Math.min(hMax, left);
      const tests = [{ type: 'down', hit: function (x) { return x.theta <= 0; } }];
      if (s.phase === 'wall') tests.push({ type: 'separate', hit: function (x) { return ladderAccel(o, P, x).Nw < 0; } });
      if (s.phase === 'floor' && (o.mu || 0) > 0 && s.vb < 0) tests.push({ type: 'stick', hit: function (x) { return x.vb >= 0; } });
      const nx = slideRK4(o, P, s, h);
      let first = null, fMin = 2;
      tests.forEach(function (e) {
        if (e.hit(s) || !e.hit(nx)) return;
        let lo = 0, hi = 1;
        for (let i = 0; i < 50; i++) { const mid = 0.5 * (lo + hi); if (e.hit(slideRK4(o, P, s, h * mid))) hi = mid; else lo = mid; }
        if (hi < fMin) { fMin = hi; first = e; }
      });
      if (!first) { s = nx; left -= h; continue; }
      s = slideRK4(o, P, s, h * fMin); left -= h * fMin;
      if (first.type === 'down') {
        events.push({ type: 'down', omega: s.omega, t: s.t });
        s.theta = 0; s.omega = 0; s.vb = 0; s.phase = 'down';
      } else if (first.type === 'separate') {
        events.push({ type: 'separate', theta: s.theta, t: s.t });
        s.phase = 'floor';
      } else if (first.type === 'stick') {
        events.push({ type: 'stick', t: s.t });
        s.vb = 0; s.phase = 'pivot';
      }
    }
    return { st: s, events: events };
  }

  /** 滑倒過程的機械能（動能＋重力位能，地面為零點） */
  function ladderEnergy(o, s) {
    const P = ladderMass(o), sn = Math.sin(s.theta), cs = Math.cos(s.theta);
    let vx, vy;
    if (s.phase === 'wall') { vx = (P.L - P.sc) * sn * s.omega; vy = P.sc * cs * s.omega; }
    else { vx = s.vb - P.sc * sn * s.omega; vy = P.sc * cs * s.omega; }
    return 0.5 * P.M * (vx * vx + vy * vy) + 0.5 * P.Ic * s.omega * s.omega + P.M * G * P.sc * sn;
  }

  /** 任務用的梯子狀態摘要（角度用度） */
  function ladderSnapshot(o) {
    const r = ladderStatics(o);
    return {
      theta: o.theta / D2R, thetaC: r.thetaC / D2R, mu: o.mu || 0, muw: o.muw || 0, rough: (o.muw || 0) > 0,
      ml: o.ml, mp: o.mp || 0, d: r.d, L: r.L, top: (o.mp || 0) > 0 && r.d >= r.L - 1e-6, k: r.k, slips: r.slips,
      muMin: r.muMin, dSlip: r.dSlip, Ng: r.Ng, Nw: r.Nw, fg: r.fg, fw: r.fw, fgMax: r.fgMax
    };
  }

  return {
    G: G, D2R: D2R, SEESAW: SEESAW, KINDS: KINDS, LADDER: LADDER, hangDepth: hangDepth,
    sums: sums, torques: torques, groundAngles: groundAngles, hangClear: hangClear, scaleNeed: scaleNeed,
    balancePosition: balancePosition, seesawState: seesawState, seesawRelease: seesawRelease, settle: settle, stays: stays,
    seesawAdvance: seesawAdvance, seesawEdit: seesawEdit, reactions: reactions, seesawEnergy: seesawEnergy,
    seesawSnapshot: seesawSnapshot,
    ladderWeights: ladderWeights, ladderCritical: ladderCritical, ladderMuMin: ladderMuMin, ladderSlipD: ladderSlipD,
    ladderStatics: ladderStatics, ladderMass: ladderMass, ladderAccel: ladderAccel, ladderSlideInit: ladderSlideInit,
    ladderSlideAdvance: ladderSlideAdvance, ladderEnergy: ladderEnergy, ladderSnapshot: ladderSnapshot
  };
}));
