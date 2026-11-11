/*
 * atwood-core.js — 連體運動與阿特午機的物理核心（與畫面無關，可單獨測試）
 *
 * 單位（SI）：質量 kg、長度 m、時間 s、力 N、角度 θ 用「度」傳入。
 * 理想化：繩子輕而不可伸長、滑輪輕而無摩擦；物體視為剛體；
 *        地板、擋板與繩子突然拉緊都是完全非彈性（撞上就停、拉緊後一起動）。
 *
 * 四種實驗（mode）：
 *   1 'atwood'  阿特午機：m1（左，從高度 h 釋放）、m2（右，放在地板上）跨過定滑輪。
 *   2 'table'   水平桌面上的木塊 M ＋ 跨過桌邊滑輪的懸掛物 m（桌面摩擦 μs、μk）。
 *   3 'train'   水平地面上 2～3 個木塊，外力 F 推最後一塊（互相接觸）或拉最前一塊（以輕繩相連）。
 *   4 'incline' 斜面（傾角 θ）上的木塊 M，經斜面頂端的滑輪連到懸掛物 m（斜面摩擦 μs、μk）。
 *
 * 模式 1、2、4 都是「兩個物體以一條繩子跨過滑輪相連」：
 *   B ＝ 懸掛的物體（模式 1 的 m1、模式 2、4 的 m），正方向 ＝ B 往下。
 *   A ＝ 另一個物體（模式 1 的 m2、模式 2、4 的木塊 M），正方向 ＝ 朝滑輪（m2 往上、M 往滑輪）。
 *   繩子拉緊時 A、B 的位移相同（xA = xB）；繩子鬆弛時 xB < xA，各自運動。
 *   沿繩方向的「驅動力」D = m_B g + G_A（G_A 是 A 所受重力沿正方向的分量），
 *   系統總質量 M = m_A + m_B，A 的正向力 N_A、最大靜摩擦 μs N_A、動摩擦 μk N_A：
 *     運動中（v ≠ 0）：a = (D − sgn(v) μk N_A) / M
 *     靜止時：|D| ≤ μs N_A → 不動（靜摩擦 f = −D）；否則朝 D 的方向起動，a = (D − sgn(D) μk N_A) / M
 *     張力 T = m_B (g − a)
 *   B 落地、A 撞到擋板等事件之後，用解析解一段一段接下去（timeline），每一段加速度固定。
 *
 * 模式 3：所有木塊一起運動（同一個 μ，推或拉時接觸力、張力都不會變成負的）：
 *   運動中：a = (F − μk Σm g) / Σm；第 i、i+1 塊之間的力 ＝ F ×（受力那一側「被帶動」的質量）/ Σm
 *   靜止時（F ≤ μs Σm g）：靜摩擦的分配本來無法唯一決定，本模擬假設外力由零慢慢加大，
 *   直接受力的木塊先用掉自己的最大靜摩擦，剩下的才傳給下一塊。
 */
(function (root) {
  'use strict';

  const G = 9.8;
  const DEG = Math.PI / 180;
  const TINY = 1e-12;

  // ---------- 物體大小（只影響畫面與幾何，不影響運動方程式） ----------
  const SIZE = {
    hangW: 0.17,                                     // 懸掛砝碼的寬度
    hangH: function (m) { return 0.04 + 0.13 * m; }, // 懸掛砝碼的高度（隨質量增加）
    blockH: 0.16,                                    // 桌面／斜面上木塊的高度
    blockW: function (m) { return 0.14 + 0.07 * m; },
    trainH: 0.22,                                    // 模式 3 的木塊高度
    trainW: function (m) { return 0.16 + 0.07 * m; },
    trainGap: 0.22,                                  // 模式 3 拉的時候，木塊之間的繩長
    pulleyR1: 0.12,                                  // 模式 1 的滑輪半徑
    pulleyR: 0.08                                    // 模式 2、4 的滑輪半徑（= 木塊高度的一半，繩子平行桌面／斜面）
  };

  // ======================= 解析公式 =======================

  /** 阿特午機：a > 0 表示 m1 下降 */
  function atwood(m1, m2, g) {
    g = g == null ? G : g;
    const M = m1 + m2;
    return { a: (m1 - m2) * g / M, T: 2 * m1 * m2 * g / M };
  }

  /**
   * 兩物體跨過滑輪的系統在速度 v（沿正方向）時的加速度與受力。
   * sys = { mA, mB, g, GA, NA, muS, muK }
   * 傳回 { a, T, f（A 所受摩擦力，沿正方向）, kind: 'kinetic' | 'static' | 'none', dir }
   */
  function pulleyDynamics(sys, v) {
    const M = sys.mA + sys.mB, g = sys.g;
    const D = sys.mB * g + sys.GA;
    const fk = sys.muK * sys.NA, fs = sys.muS * sys.NA;
    let a, f, kind, dir;
    if (Math.abs(v) > TINY) {
      dir = v > 0 ? 1 : -1;
      f = sys.NA > 0 ? -dir * fk : 0;
      a = (D + f) / M;
      kind = sys.NA > 0 && sys.muK > 0 ? 'kinetic' : 'none';
    } else if (Math.abs(D) <= fs + TINY * Math.max(1, fs)) {
      dir = 0; a = 0; f = -D; kind = sys.NA > 0 && sys.muS > 0 ? 'static' : 'none';
    } else {
      dir = D > 0 ? 1 : -1;
      f = sys.NA > 0 ? -dir * fk : 0;
      a = (D + f) / M;
      kind = sys.NA > 0 && sys.muK > 0 ? 'kinetic' : 'none';
    }
    return { a: a, T: sys.mB * (g - a), f: f, kind: kind, dir: dir, D: D, M: M, fs: fs, fk: fk };
  }

  /** 模式 2：桌面木塊 M ＋ 懸掛物 m，從靜止釋放 */
  function tableHanging(M, m, muS, muK, g) {
    g = g == null ? G : g;
    return pulleyDynamics({ mA: M, mB: m, g: g, GA: 0, NA: M * g, muS: muS, muK: muK }, 0);
  }

  /** 模式 4：斜面木塊 M（θ 度）＋ 懸掛物 m，從靜止釋放；dir = +1 木塊上滑、−1 下滑、0 不動 */
  function inclineHanging(M, m, thetaDeg, muS, muK, g) {
    g = g == null ? G : g;
    const th = thetaDeg * DEG;
    return pulleyDynamics({ mA: M, mB: m, g: g, GA: -M * g * Math.sin(th), NA: M * g * Math.cos(th), muS: muS, muK: muK }, 0);
  }

  /**
   * 模式 3：木塊列車。p = { m: [由左到右的質量], F, push: true（推最左邊）/ false（拉最右邊）, muS, muK, g }
   * v：目前速度（≥ 0）。傳回 { a, moving, kind, f: [各塊摩擦力（沿 +x）], link: [第 i 與 i+1 塊之間的接觸力或張力（≥ 0）] }
   */
  function trainDynamics(p, v) {
    const g = p.g == null ? G : p.g;
    const ms = p.m, n = ms.length;
    const M = ms.reduce(function (s, x) { return s + x; }, 0);
    const F = p.F;
    const f = new Array(n).fill(0), link = new Array(n - 1).fill(0);
    let a, moving, kind;
    if (v > TINY || F > p.muS * M * g + TINY * Math.max(1, F)) {
      // 運動中（或剛起動）：每一塊動摩擦 μk m g，加速度相同
      moving = true;
      kind = p.muK > 0 ? 'kinetic' : 'none';
      a = (F - p.muK * M * g) / M;
      for (let i = 0; i < n; i++) f[i] = -p.muK * ms[i] * g;
      // 每一塊：ΣF = m a；由受力端往另一端累加
      const k = a + p.muK * g; // = F / M
      if (p.push) {
        // 推最左邊：第 i、i+1 塊之間的接觸力 = 右邊所有木塊需要的力
        for (let i = 0; i < n - 1; i++) {
          let mr = 0;
          for (let j = i + 1; j < n; j++) mr += ms[j];
          link[i] = mr * k;
        }
      } else {
        // 拉最右邊：第 i、i+1 塊之間的繩子張力 = 左邊所有木塊需要的力
        for (let i = 0; i < n - 1; i++) {
          let ml = 0;
          for (let j = 0; j <= i; j++) ml += ms[j];
          link[i] = ml * k;
        }
      }
    } else {
      // 靜止：外力由零慢慢加大時，直接受力的木塊先用掉自己的最大靜摩擦
      moving = false; a = 0;
      kind = F > 0 && p.muS > 0 ? 'static' : 'none';
      let R = Math.max(0, F);
      const order = [];
      for (let i = 0; i < n; i++) order.push(p.push ? i : n - 1 - i);
      order.forEach(function (i, k) {
        const fi = Math.min(R, p.muS * ms[i] * g);
        f[i] = -fi;
        R -= fi;
        if (k < n - 1) link[p.push ? i : i - 1] = R; // 傳給下一塊的力
      });
    }
    return { a: a, moving: moving, kind: kind, f: f, link: link, M: M, F: F };
  }

  // ======================= 幾何（決定擋板、地板、滑輪的位置） =======================

  /**
   * 各模式的幾何與「行程限制」（相對於起始位置，沿各自的正方向）。
   * 世界座標：x 向右、y 向上，地板 y = 0。
   */
  function geometry(mode, p) {
    if (mode === 1) {
      const R = SIZE.pulleyR1, yP = 2.45;
      const hB = SIZE.hangH(p.m1), hA = SIZE.hangH(p.m2);
      const topLimit = yP - 0.15; // 砝碼頂端最高到這裡（不撞滑輪）
      return {
        mode: 1, pulley: { x: 0, y: yP, r: R }, ceiling: yP + 0.24,
        B: { x: -R, y0: p.h, w: SIZE.hangW, h: hB },   // m1：底面初始高度 h
        A: { x: R, y0: 0, w: SIZE.hangW, h: hA },      // m2：放在地板上
        aMin: 0, aMax: topLimit - hA,
        bMin: -(topLimit - p.h - hB), bMax: p.h,
        travel: p.h
      };
    }
    if (mode === 2) {
      const Ht = 1.3, R = SIZE.pulleyR;
      const wA = SIZE.blockW(p.M), hB = SIZE.hangH(p.m);
      const px = 0.06, bump = -0.1, tableL = -1.75;
      const front0 = bump - p.d;
      const yTopB = Ht - 0.15;
      return {
        mode: 2, tableH: Ht, tableL: tableL, tableR: 0, bumper: bump,
        pulley: { x: px, y: Ht, r: R },
        A: { x0: front0 - wA, w: wA, h: SIZE.blockH },          // 木塊左緣的初始 x
        B: { x: px + R, yTop0: yTopB, w: SIZE.hangW, h: hB },   // 懸掛物頂端初始高度
        aMin: -(front0 - wA - (tableL + 0.05)), aMax: p.d,
        bMin: -Math.max(0, (Ht - R - 0.02) - yTopB), bMax: yTopB - hB,
        travel: p.d
      };
    }
    if (mode === 4) {
      const L = 1.8, u = 0.16, R = SIZE.pulleyR;
      const th = p.theta * DEG, c = Math.cos(th), s = Math.sin(th);
      const Hb = Math.max(0.3, 2.0 - (L + u) * s);
      const P0 = { x: -L * c, y: Hb }, P1 = { x: 0, y: Hb + L * s };
      const C = { x: P1.x + u * c, y: P1.y + u * s };
      const wA = SIZE.blockW(p.M), hB = SIZE.hangH(p.m);
      const sTop = L - 0.03;
      const back0 = sTop - p.d - wA;              // 木塊後緣（靠斜面底）的初始位置（沿斜面量）
      const yTopB = p.d + 0.08 + hB;                // 懸掛物盡量放低：下降 d 不會落地，上方留最多空間
      return {
        mode: 4, theta: p.theta, L: L, benchH: Hb, P0: P0, P1: P1, u: u,
        pulley: { x: C.x, y: C.y, r: R },
        stopTop: sTop, stopBot: back0 - p.d,
        A: { s0: back0, w: wA, h: SIZE.blockH },
        B: { x: C.x + R, yTop0: yTopB, w: SIZE.hangW, h: hB },
        aMin: -p.d, aMax: p.d,
        bMin: -(C.y - R - 0.03 - yTopB), bMax: yTopB - hB,
        travel: p.d
      };
    }
    // mode 3
    const ws = p.m.map(SIZE.trainW);
    const gap = p.push ? 0 : SIZE.trainGap;
    const xs = [];
    let x = 0;
    ws.forEach(function (w, i) { xs.push(x); x += w + (i < ws.length - 1 ? gap : 0); });
    return { mode: 3, xs: xs, ws: ws, h: SIZE.trainH, gap: gap, front0: x, finish: x + p.d, travel: p.d };
  }

  /** 由模式與參數建立「兩物體跨過滑輪」的系統描述 */
  function pulleySystem(mode, p) {
    const g = p.g == null ? G : p.g;
    const geo = geometry(mode, p);
    const base = { g: g, v0: p.v0 || 0, aMin: geo.aMin, aMax: geo.aMax, bMin: geo.bMin, bMax: geo.bMax };
    if (mode === 1) return Object.assign(base, { mA: p.m2, mB: p.m1, GA: -p.m2 * g, NA: 0, muS: 0, muK: 0 });
    if (mode === 2) return Object.assign(base, { mA: p.M, mB: p.m, GA: 0, NA: p.M * g, muS: p.muS, muK: p.muK });
    const th = p.theta * DEG;
    return Object.assign(base, { mA: p.M, mB: p.m, GA: -p.M * g * Math.sin(th), NA: p.M * g * Math.cos(th), muS: p.muS, muK: p.muK });
  }

  // ======================= 時間軸（逐段解析解） =======================

  /** x0 + v τ + a τ²/2 = X 的最小正根（沒有則 Infinity） */
  function rootAfter(x0, v, a, X) {
    const c = x0 - X;
    if (Math.abs(a) < 1e-14) {
      if (Math.abs(v) < 1e-14) return Infinity;
      const t = -c / v;
      return t > 1e-12 ? t : Infinity;
    }
    const disc = v * v - 2 * a * c;
    if (disc < 0) return Infinity;
    const s = Math.sqrt(disc);
    // 數值穩定的兩根
    const q = -(v + (v >= 0 ? s : -s));
    const r1 = q / a, r2 = q !== 0 ? 2 * c / q : -v / a * 2;
    let best = Infinity;
    [r1, r2].forEach(function (r) { if (r > 1e-12 && r < best) best = r; });
    return best;
  }

  const MAX_SEGS = 120;
  const V_REST = 0.002;   // 繩子拉緊後的速度小於 2 mm/s：之後的運動肉眼看不出來，當作靜止
  const T_MAX = 60;       // 最長模擬 60 s；第一次撞擊之後最多再模擬 10 s
  const T_AFTER = 10;

  /**
   * 模式 1、2、4 的完整運動（從釋放開始）。
   * 傳回 { segs: [...], events: [...], end: { t, frozen, reason }, sys }
   * 每一段 seg：{ t0, t1, taut, xA, vA, aA, xB, vB, aB, T, fA, kind, NA, stopA, floorB, restA, restB }
   *   位置 x 為相對起點、沿各自正方向的位移；fA 為 A 所受摩擦力（沿正方向）；
   *   stopA 為擋板／地板對 A 的力（沿正方向）；floorB 為地板對 B 的向上正向力（≥ 0）。
   * events：{ t, type, v（撞擊或拉緊前的相對速率）, body }
   *   type：'landB'（B 落地）、'bumpA'（A 撞到前方擋板／滑輪）、'bumpA0'（A 撞到後方擋板／地板）、
   *         'bumpB'（B 撞到滑輪）、'jerk'（鬆掉的繩子突然拉緊）、'stop'（速度變為零）
   */
  function pulleyTimeline(sys) {
    const g = sys.g, mA = sys.mA, mB = sys.mB, M = mA + mB;
    const D = mB * g + sys.GA;
    const fk = sys.muK * sys.NA, fs = sys.muS * sys.NA;
    const segs = [], events = [];
    let t = 0, xA = 0, xB = 0, vA = sys.v0, vB = sys.v0, taut = true;
    let end = null;
    let limit = T_MAX;
    /** 超過模擬時間上限：在 limit 時刻凍結（之後的運動不再模擬） */
    function cut(seg) {
      if (!(seg.t1 > limit)) return false;
      const tau = limit - seg.t0;
      const fz = Object.assign({}, seg, {
        t0: limit, t1: Infinity, frozen: true,
        xA: seg.xA + seg.vA * tau + 0.5 * seg.aA * tau * tau, vA: seg.vA + seg.aA * tau,
        xB: seg.xB + seg.vB * tau + 0.5 * seg.aB * tau * tau, vB: seg.vB + seg.aB * tau
      });
      seg.t1 = limit;
      segs.push(fz);
      end = { t: limit, frozen: true, reason: 'time' };
      return true;
    }
    function impact(e) {
      events.push(e);
      if (e.type !== 'stop' && e.type !== 'jerk') limit = Math.min(limit, Math.max(e.t + T_AFTER, 0));
    }

    for (let iter = 0; iter < MAX_SEGS && !end; iter++) {
      if (taut) {
        const v = vA;
        let a, f, kind, dir;
        let rest = false, restKind = null;
        if (Math.abs(v) > TINY) {
          dir = v > 0 ? 1 : -1; f = -dir * fk; a = (D + f) / M;
          kind = fk > 0 ? 'kinetic' : 'none';
        } else if (Math.abs(D) <= fs + TINY * Math.max(1, fs)) {
          rest = true; restKind = 'friction'; a = 0; f = -D; dir = 0; kind = fs > 0 ? 'static' : 'none';
        } else {
          dir = D > 0 ? 1 : -1;
          const blocked = dir > 0 ? (xA >= sys.aMax - 1e-9 || xB >= sys.bMax - 1e-9) : (xA <= sys.aMin + 1e-9 || xB <= sys.bMin + 1e-9);
          if (blocked) {
            rest = true; a = 0;
            // 靜摩擦先盡量承擔，剩下的由擋板／地板提供
            f = -dir * Math.min(Math.abs(D), fs);
            kind = fs > 0 && f !== 0 ? 'static' : 'none';
            restKind = dir > 0 ? (xA >= sys.aMax - 1e-9 ? 'stopA' : 'floorB') : (xA <= sys.aMin + 1e-9 ? 'stopA' : 'stopB');
          } else {
            f = -dir * fk; a = (D + f) / M; kind = fk > 0 ? 'kinetic' : 'none';
          }
        }
        const seg = { t0: t, t1: Infinity, taut: true, xA: xA, vA: v, aA: a, xB: xB, vB: v, aB: a, fA: f, kind: kind, NA: sys.NA, stopA: 0, floorB: 0, stopB: 0, restA: rest, restB: rest };
        if (rest) {
          // 靜止的受力
          const R = -(D + f); // 擋板等提供的力（沿正方向）
          if (restKind === 'friction' || restKind === 'stopA') {
            seg.T = mB * g; seg.stopA = restKind === 'stopA' ? R : 0;
          } else if (restKind === 'floorB') {
            seg.T = Math.max(0, -sys.GA - f); seg.floorB = mB * g - seg.T;
          } else { // stopB：B 頂到滑輪
            seg.T = Math.max(0, -sys.GA - f); seg.stopB = seg.T - mB * g;
          }
          segs.push(seg);
          end = { t: t, frozen: false, reason: 'rest' };
          break;
        }
        seg.T = mB * (g - a);
        // 這一段的結束：速度變零、撞到前方或後方的限制
        const md = v !== 0 ? (v > 0 ? 1 : -1) : (a > 0 ? 1 : -1);
        let tau = Infinity, what = null;
        if (v !== 0 && a * md < 0) { tau = -v / a; what = 'stop'; }
        const cand = md > 0
          ? [['bumpA', rootAfter(xA, v, a, sys.aMax)], ['landB', rootAfter(xB, v, a, sys.bMax)]]
          : [['bumpA0', rootAfter(xA, v, a, sys.aMin)], ['bumpB', rootAfter(xB, v, a, sys.bMin)]];
        cand.forEach(function (c) { if (c[1] < tau - 1e-12) { tau = c[1]; what = c[0]; } });
        seg.t1 = t + tau;
        segs.push(seg);
        if (cut(seg)) break;
        const vEnd = v + a * tau;
        const x1 = xA + v * tau + 0.5 * a * tau * tau;
        t += tau;
        if (what === 'stop') {
          xA = xB = x1; vA = vB = 0;
          events.push({ t: t, type: 'stop', v: 0 });
        } else if (what === 'bumpA') {
          // A 撞到前方擋板：A 停下，B 被繩子拉住也停下
          xA = xB = sys.aMax; vA = vB = 0;
          impact({ t: t, type: 'bumpA', v: Math.abs(vEnd), body: 'A' });
        } else if (what === 'landB') {
          // B 落地：B 停下，A 因慣性繼續前進（繩子鬆弛）
          xB = sys.bMax; xA = x1; vB = 0; vA = vEnd; taut = false;
          impact({ t: t, type: 'landB', v: Math.abs(vEnd), body: 'B' });
        } else if (what === 'bumpA0') {
          // A 撞到後方擋板（模式 1：m2 落地）：A 停下，B 因慣性繼續上升（繩子鬆弛）
          xA = sys.aMin; xB = x1; vA = 0; vB = vEnd; taut = false;
          impact({ t: t, type: 'bumpA0', v: Math.abs(vEnd), body: 'A' });
        } else if (what === 'bumpB') {
          // B 撞到滑輪：B 停下，A 被繩子拉住也停下
          xB = xA = sys.bMin; vA = vB = 0;
          impact({ t: t, type: 'bumpB', v: Math.abs(vEnd), body: 'B' });
        }
        if (what !== 'stop' && what !== null && !taut) continue;
      } else {
        // ---------- 繩子鬆弛：A、B 各自運動 ----------
        let aA, fA, kindA, restA = false;
        const GA = sys.GA;
        if (Math.abs(vA) > TINY) {
          const d = vA > 0 ? 1 : -1; fA = -d * fk; aA = (GA + fA) / mA; kindA = fk > 0 ? 'kinetic' : 'none';
        } else if (Math.abs(GA) <= fs + TINY * Math.max(1, fs)) {
          restA = true; aA = 0; fA = -GA; kindA = fs > 0 && GA !== 0 ? 'static' : 'none';
        } else {
          const d = GA > 0 ? 1 : -1;
          if ((d > 0 && xA >= sys.aMax - 1e-9) || (d < 0 && xA <= sys.aMin + 1e-9)) {
            restA = true; aA = 0; fA = -d * Math.min(Math.abs(GA), fs); kindA = fs > 0 && fA !== 0 ? 'static' : 'none';
          } else { fA = -d * fk; aA = (GA + fA) / mA; kindA = fk > 0 ? 'kinetic' : 'none'; }
        }
        let aB = g, restB = false;
        if (xB >= sys.bMax - 1e-9 && vB >= -TINY) { restB = true; aB = 0; vB = 0; xB = sys.bMax; }
        if (restA) vA = 0;
        const seg = { t0: t, t1: Infinity, taut: false, xA: xA, vA: vA, aA: aA, xB: xB, vB: vB, aB: aB, T: 0, fA: fA, kind: kindA, NA: sys.NA,
          stopA: restA ? -(GA + fA) : 0, floorB: restB ? mB * g : 0, stopB: 0, restA: restA, restB: restB };
        if (restA && restB) { segs.push(seg); end = { t: t, frozen: false, reason: 'rest' }; break; }
        let tau = Infinity, what = null;
        const pick = function (name, tt) { if (tt < tau - 1e-12) { tau = tt; what = name; } };
        if (!restA) {
          if (vA !== 0 && aA * vA < 0) pick('stopA', -vA / aA);
          const mdA = vA !== 0 ? (vA > 0 ? 1 : -1) : (aA > 0 ? 1 : -1);
          if (mdA > 0) pick('bumpA', rootAfter(xA, vA, aA, sys.aMax));
          else pick('bumpA0', rootAfter(xA, vA, aA, sys.aMin));
        }
        if (!restB) {
          pick('landB', rootAfter(xB, vB, aB, sys.bMax));
          if (vB < 0) pick('bumpB', rootAfter(xB, vB, aB, sys.bMin));
        }
        // 繩子再度拉緊：xB − xA 回到 0（B 相對 A 朝正方向靠近）
        pick('jerk', rootAfter(xB - xA, vB - vA, aB - aA, 0));
        seg.t1 = t + tau;
        segs.push(seg);
        if (cut(seg)) break;
        const nxA = xA + vA * tau + 0.5 * aA * tau * tau, nvA = vA + aA * tau;
        const nxB = xB + vB * tau + 0.5 * aB * tau * tau, nvB = vB + aB * tau;
        t += tau;
        xA = nxA; vA = nvA; xB = nxB; vB = nvB;
        if (what === 'stopA') { vA = 0; }
        else if (what === 'bumpA') { impact({ t: t, type: 'bumpA', v: Math.abs(vA), body: 'A' }); xA = sys.aMax; vA = 0; }
        else if (what === 'bumpA0') { impact({ t: t, type: 'bumpA0', v: Math.abs(vA), body: 'A' }); xA = sys.aMin; vA = 0; }
        else if (what === 'landB') { impact({ t: t, type: 'landB', v: Math.abs(vB), body: 'B' }); xB = sys.bMax; vB = 0; }
        else if (what === 'bumpB') { impact({ t: t, type: 'bumpB', v: Math.abs(vB), body: 'B' }); xB = sys.bMin; vB = 0; }
        else if (what === 'jerk') {
          // 繩子突然拉緊（完全非彈性）：沿繩方向的動量守恆
          xB = xA;
          let v1 = (mA * vA + mB * vB) / M;
          const rel = vB - vA;
          if ((v1 > 0 && (xA >= sys.aMax - 1e-9 || xB >= sys.bMax - 1e-9)) || (v1 < 0 && (xA <= sys.aMin + 1e-9 || xB <= sys.bMin + 1e-9))) v1 = 0;
          // 拉緊後速度小於 2 mm/s：之後只剩肉眼看不出的微小往返，直接當作從靜止開始（由靜止的判斷決定最後的受力）
          const tiny = Math.abs(v1) < V_REST;
          if (tiny) v1 = 0;
          events.push({ t: t, type: 'jerk', v: Math.abs(rel), J: mB * (vB - v1), v1: v1, tiny: tiny });
          vA = vB = v1; taut = true;
        }
      }
    }
    if (!end) {
      // 事件太多（理論上不會發生）：停在最後的位置
      const last = segs[segs.length - 1];
      segs.push(Object.assign({}, last, { t0: t, t1: Infinity, frozen: true, xA: xA, vA: vA, xB: xB, vB: vB }));
      end = { t: t, frozen: true, reason: 'count' };
    }
    return { kind: 'pulley', sys: sys, segs: segs, events: events, end: end };
  }

  /**
   * 模式 3 的運動：從釋放開始，前方木塊前進 d 抵達終點時記錄並停止模擬（之後的運動不模擬）；
   * 若中途減速停下，則保持靜止。x 為列車的位移。
   */
  function trainTimeline(p) {
    const segs = [], events = [];
    const v0 = p.v0 || 0, d = p.d;
    const s0 = trainDynamics(p, v0);
    let end;
    if (!s0.moving) {
      segs.push({ t0: 0, t1: Infinity, x: 0, v: 0, a: 0, dyn: s0, rest: true });
      end = { t: 0, frozen: false, reason: 'rest' };
      return { kind: 'train', segs: segs, events: events, end: end, p: p };
    }
    const a = s0.a;
    let tFin = rootAfter(0, v0, a, d);
    const tStop = a < 0 ? -v0 / a : Infinity;
    if (tStop < tFin) {
      segs.push({ t0: 0, t1: tStop, x: 0, v: v0, a: a, dyn: s0 });
      const xs = v0 * tStop + 0.5 * a * tStop * tStop;
      events.push({ t: tStop, type: 'stop', v: 0 });
      const s1 = trainDynamics(p, 0);
      segs.push({ t0: tStop, t1: Infinity, x: xs, v: 0, a: 0, dyn: s1, rest: true });
      end = { t: tStop, frozen: false, reason: 'rest' };
    } else {
      segs.push({ t0: 0, t1: tFin, x: 0, v: v0, a: a, dyn: s0 });
      events.push({ t: tFin, type: 'finish', v: v0 + a * tFin });
      segs.push({ t0: tFin, t1: Infinity, x: d, v: v0 + a * tFin, a: 0, dyn: s0, frozen: true });
      end = { t: tFin, frozen: true, reason: 'finish' };
    }
    return { kind: 'train', segs: segs, events: events, end: end, p: p };
  }

  /** 由模式與參數建立完整時間軸 */
  function timeline(mode, p) {
    if (mode === 3) return trainTimeline(p);
    return pulleyTimeline(pulleySystem(mode, p));
  }

  function segAt(tl, t) {
    const s = tl.segs;
    for (let i = 0; i < s.length; i++) if (t < s[i].t1 || i === s.length - 1) return s[i];
    return s[s.length - 1];
  }

  /** 時刻 t 的狀態（位置、速度、加速度與當時那一段的受力） */
  function stateAt(tl, t) {
    const sg = segAt(tl, t);
    let tau = Math.max(0, t - sg.t0);
    if (tl.kind === 'train') {
      if (sg.frozen || sg.rest) tau = 0;
      return { seg: sg, x: sg.x + sg.v * tau + 0.5 * sg.a * tau * tau, v: sg.v + sg.a * tau, a: sg.frozen ? 0 : sg.a };
    }
    if (sg.frozen) tau = 0;
    return {
      seg: sg, taut: sg.taut,
      xA: sg.xA + sg.vA * tau + 0.5 * sg.aA * tau * tau, vA: sg.vA + sg.aA * tau, aA: sg.aA,
      xB: sg.xB + sg.vB * tau + 0.5 * sg.aB * tau * tau, vB: sg.vB + sg.aB * tau, aB: sg.aB
    };
  }

  /**
   * 量測：第一次「撞到地板／擋板／抵達終點」之前若沒有折返，記錄時間與距離。
   * 傳回 { t, d, v, dir（+1 正方向、−1 反方向）, aMeas: 由 d、t、v0 反推的加速度大小 } 或 null
   */
  function firstMeasure(tl) {
    const ev = tl.events;
    for (let i = 0; i < ev.length; i++) {
      const e = ev[i];
      if (e.type === 'stop' || e.type === 'jerk') return null; // 先停下或折返：沒有完整的一段可量
      if (e.type === 'landB' || e.type === 'bumpA' || e.type === 'bumpA0' || e.type === 'finish' || e.type === 'bumpB') {
        let d, dir;
        if (tl.kind === 'train') { d = tl.p.d; dir = 1; }
        else if (e.type === 'landB' || e.type === 'bumpB') { d = Math.abs(tl.sys[e.type === 'landB' ? 'bMax' : 'bMin']); dir = e.type === 'landB' ? 1 : -1; }
        else { d = Math.abs(e.type === 'bumpA' ? tl.sys.aMax : tl.sys.aMin); dir = e.type === 'bumpA' ? 1 : -1; }
        return { t: e.t, d: d, dir: dir, type: e.type, v: Math.abs(e.v) };
      }
    }
    return null;
  }

  /** 由量到的 t（可為四捨五入或手按碼錶的值）反推加速度：d = v0 t + a t²/2（沿運動方向） */
  function accelFromTime(d, t, v0) { return 2 * (d - (v0 || 0) * t) / (t * t); }

  /** 阿特午機由加速度推算 g：g = a (m1 + m2) / |m1 − m2| */
  function gFromAtwood(a, m1, m2) { return a * (m1 + m2) / Math.abs(m1 - m2); }

  // ======================= 各物體的受力（向量，供受力圖與檢驗） =======================

  /**
   * 傳回 { bodies: [{ id, m, ax, ay, forces: [{ key, x, y, by, pair }] }] }
   * key：'W' 重力、'T' 張力、'N' 正向力、'f' 摩擦力、'F' 外力、'P' 木塊之間的接觸力、'S' 擋板／地板額外的支撐力
   * pair：第三定律的另一半施加在誰身上（'floor'、'table'、'incline'、'stop'、'earth'、其他物體 id、'string'）
   * st：stateAt() 的結果；mode 3 的 st 也可以直接是 { seg }。
   */
  function bodyForces(mode, p, st) {
    const g = p.g == null ? G : p.g;
    const sg = st.seg;
    if (mode === 3) {
      const dyn = sg.dyn, ms = p.m, n = ms.length, a = sg.frozen || sg.rest ? (sg.frozen ? dyn.a : 0) : sg.a;
      const bodies = ms.map(function (m, i) {
        const fs = [
          { key: 'W', x: 0, y: -m * g, by: 'earth' },
          { key: 'N', x: 0, y: m * g, by: 'floor', pair: 'floor' }
        ];
        if (dyn.f[i] !== 0) fs.push({ key: 'f', x: dyn.f[i], y: 0, by: 'floor', pair: 'floor', kind: dyn.moving ? 'kinetic' : 'static' });
        return { id: i, m: m, ax: a, ay: 0, forces: fs };
      });
      if (p.F > 0) {
        if (p.push) bodies[0].forces.push({ key: 'F', x: p.F, y: 0, by: 'hand' });
        else bodies[n - 1].forces.push({ key: 'F', x: p.F, y: 0, by: 'hand' });
      }
      for (let i = 0; i < n - 1; i++) {
        const L = dyn.link[i];
        if (!(L > 0)) continue;
        if (p.push) {
          bodies[i].forces.push({ key: 'P', link: i, x: -L, y: 0, by: i + 1, pair: i + 1 });
          bodies[i + 1].forces.push({ key: 'P', link: i, x: L, y: 0, by: i, pair: i });
        } else {
          bodies[i].forces.push({ key: 'T', link: i, x: L, y: 0, by: 'string', pair: 'string' });
          bodies[i + 1].forces.push({ key: 'T', link: i, x: -L, y: 0, by: 'string', pair: 'string' });
        }
      }
      return { bodies: bodies };
    }
    const T = sg.T, mA = mode === 1 ? p.m2 : p.M, mB = mode === 1 ? p.m1 : p.m;
    // 單位方向：A、B 的正方向
    let eA, nA;
    if (mode === 1) { eA = [0, 1]; nA = null; }
    else if (mode === 2) { eA = [1, 0]; nA = [0, 1]; }
    else { const th = p.theta * DEG; eA = [Math.cos(th), Math.sin(th)]; nA = [-Math.sin(th), Math.cos(th)]; }
    const eB = [0, -1];
    const A = { id: 'A', m: mA, ax: st.aA * eA[0], ay: st.aA * eA[1], forces: [{ key: 'W', x: 0, y: -mA * g, by: 'earth' }] };
    const B = { id: 'B', m: mB, ax: st.aB * eB[0], ay: st.aB * eB[1], forces: [{ key: 'W', x: 0, y: -mB * g, by: 'earth' }] };
    if (T > 0) {
      A.forces.push({ key: 'T', x: T * eA[0], y: T * eA[1], by: 'string', pair: 'string' });
      B.forces.push({ key: 'T', x: 0, y: T, by: 'string', pair: 'string' });
    }
    if (nA) {
      A.forces.push({ key: 'N', x: sg.NA * nA[0], y: sg.NA * nA[1], by: mode === 2 ? 'table' : 'incline', pair: mode === 2 ? 'table' : 'incline' });
      if (sg.fA !== 0) A.forces.push({ key: 'f', x: sg.fA * eA[0], y: sg.fA * eA[1], by: mode === 2 ? 'table' : 'incline', pair: mode === 2 ? 'table' : 'incline', kind: sg.kind });
    }
    if (sg.stopA) {
      // 擋板（模式 2、4）或地板（模式 1 的 m2）對 A 的力，沿 A 的運動方向
      A.forces.push({ key: mode === 1 ? 'N' : 'S', x: sg.stopA * eA[0], y: sg.stopA * eA[1], by: mode === 1 ? 'floor' : 'stop', pair: mode === 1 ? 'floor' : 'stop' });
    }
    if (sg.floorB) B.forces.push({ key: 'N', x: 0, y: sg.floorB, by: 'floor', pair: 'floor' });
    if (sg.stopB) B.forces.push({ key: 'S', x: 0, y: -sg.stopB, by: 'pulley', pair: 'pulley' });
    return { bodies: [A, B] };
  }

  /** 合力（向量和） */
  function netForce(body) {
    return body.forces.reduce(function (s, f) { return [s[0] + f.x, s[1] + f.y]; }, [0, 0]);
  }

  /** 沿運動方向的系統觀點：外力合力與總質量（只在繩子拉緊、一起運動時有意義） */
  function systemView(mode, p, st) {
    const g = p.g == null ? G : p.g;
    if (mode === 3) {
      const dyn = st.seg.dyn;
      const fsum = dyn.f.reduce(function (s, x) { return s + x; }, 0);
      return { Fnet: p.F + fsum, M: dyn.M, a: st.seg.rest ? 0 : dyn.a, drive: p.F, resist: fsum };
    }
    const sg = st.seg, mA = mode === 1 ? p.m2 : p.M, mB = mode === 1 ? p.m1 : p.m;
    const GA = mode === 1 ? -mA * g : mode === 2 ? 0 : -mA * g * Math.sin(p.theta * DEG);
    const ext = mB * g + GA + sg.fA + (sg.stopA || 0) - (sg.floorB || 0) + (sg.stopB || 0);
    return { Fnet: ext, M: mA + mB, a: sg.aA, drive: mB * g, back: GA, f: sg.fA };
  }

  /** 力學能（模式 1、2、4，繩子拉緊時）：動能與重力位能（以起點為零） */
  function energy(mode, p, st) {
    const g = p.g == null ? G : p.g;
    const mA = mode === 1 ? p.m2 : p.M, mB = mode === 1 ? p.m1 : p.m;
    const K = 0.5 * mA * st.vA * st.vA + 0.5 * mB * st.vB * st.vB;
    let UA = 0;
    if (mode === 1) UA = mA * g * st.xA;
    else if (mode === 4) UA = mA * g * st.xA * Math.sin(p.theta * DEG);
    const UB = -mB * g * st.xB;
    return { K: K, U: UA + UB, E: K + UA + UB };
  }

  const api = {
    G: G, SIZE: SIZE,
    atwood: atwood,
    pulleyDynamics: pulleyDynamics,
    tableHanging: tableHanging,
    inclineHanging: inclineHanging,
    trainDynamics: trainDynamics,
    geometry: geometry,
    pulleySystem: pulleySystem,
    rootAfter: rootAfter,
    pulleyTimeline: pulleyTimeline,
    trainTimeline: trainTimeline,
    timeline: timeline,
    stateAt: stateAt,
    firstMeasure: firstMeasure,
    accelFromTime: accelFromTime,
    gFromAtwood: gFromAtwood,
    bodyForces: bodyForces,
    netForce: netForce,
    systemView: systemView,
    energy: energy
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AtwoodCore = api;
})(typeof window !== 'undefined' ? window : this);
