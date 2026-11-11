/*
 * lens-mirror-core.js — 透鏡與面鏡成像的物理核心（與畫面無關，可單獨測試）
 *
 * 模型：理想薄透鏡與近軸球面鏡（光線在通過光心／鏡頂、垂直主軸的平面上轉折）。
 *
 * 單位：長度一律為 cm（公式本身與單位無關）。
 *
 * 符號約定（臺灣高中物理課本常用的「實正虛負」）：
 *   成像公式  1/p + 1/q = 1/f，放大率 m = −q/p = h′/h
 *   p：物距，實物 p > 0（物體放在光入射的一側）
 *   q：像距，實像 q > 0、虛像 q < 0
 *       透鏡：實像在透鏡另一側，虛像與物體同側
 *       面鏡：實像在鏡前（與物體同側），虛像在鏡後
 *   f：焦距，會聚元件（凸透鏡、凹面鏡）f > 0；發散元件（凹透鏡、凸面鏡）f < 0
 *       面鏡 f = R/2（R 為曲率半徑）；平面鏡 f = ∞（1/f = 0）
 *   m > 0 正立、m < 0 倒立；|m| > 1 放大、|m| < 1 縮小
 *
 * 畫面座標（x 向右、y 向上，單位 cm）：元件在 x = 0，物體在 x = −p，光由左向右入射。
 *   透鏡：像在 x = q；物方焦點 F 在 x = −f，像方焦點 F′ 在 x = +f。
 *   面鏡：像在 x = −q；焦點 F 在 x = −f，曲率中心 C 在 x = −2f（凸面鏡兩者都在鏡後）。
 *
 * 光線追跡（近軸、薄元件）：入射光在元件平面的高度 y、斜率 u（dy/ds，s 為沿光行進方向的水平距離），
 *   出射斜率 u′ = u − y/f。透鏡出射光繼續向右；面鏡反射光向左（x 方向反轉，斜率仍為 u′）。
 *   這個規則對所有光線都成立，所以由任一物點發出的光線都交會於成像公式給出的像點。
 */
(function (root) {
  'use strict';

  const ELEMENTS = [
    { id: 'convex-lens', kind: 'lens', sign: 1, zh: '凸透鏡', en: 'Convex lens' },
    { id: 'concave-lens', kind: 'lens', sign: -1, zh: '凹透鏡', en: 'Concave lens' },
    { id: 'concave-mirror', kind: 'mirror', sign: 1, zh: '凹面鏡', en: 'Concave mirror' },
    { id: 'convex-mirror', kind: 'mirror', sign: -1, zh: '凸面鏡', en: 'Convex mirror' },
    { id: 'plane-mirror', kind: 'mirror', sign: 0, zh: '平面鏡', en: 'Plane mirror' }
  ];
  const BY_ID = {};
  ELEMENTS.forEach(function (e) { BY_ID[e.id] = e; });

  const REL = 1e-9; // 判斷「恰好在 F、2F」的相對容許誤差

  function element(id) {
    const e = BY_ID[id];
    if (!e) throw new Error('未知的光學元件：' + id);
    return e;
  }

  /** 帶正負號的焦距：會聚 +|f|、發散 −|f|、平面鏡 ∞ */
  function signedFocal(id, fAbs) {
    const e = element(id);
    if (e.sign === 0) return Infinity;
    return e.sign * Math.abs(fAbs);
  }

  /** 由 1/q = 1/f − 1/p 求像距；物體恰在焦點時回傳 ±Infinity（像在無窮遠） */
  function imageDistance(p, f) {
    const inv = (isFinite(f) ? 1 / f : 0) - 1 / p;
    if (Math.abs(inv) <= REL / Math.max(Math.abs(p), isFinite(f) ? Math.abs(f) : 0)) return Infinity;
    return 1 / inv;
  }

  /** 放大率 m = −q/p（像在無窮遠時為 ±Infinity） */
  function magnification(p, q) {
    if (!isFinite(q)) return -Infinity;
    return -q / p;
  }

  function near(a, b) { return Math.abs(a - b) <= REL * Math.max(Math.abs(a), Math.abs(b), 1); }

  /**
   * 物體位置分類（依課本的情況）：
   *   會聚元件：'beyond2F'（p > 2f）、'at2F'、'between'（f < p < 2f）、'atF'、'insideF'（p < f）
   *   發散元件：'diverging'；平面鏡：'plane'
   */
  function positionCase(id, fAbs, p) {
    const e = element(id);
    if (e.sign === 0) return 'plane';
    if (e.sign < 0) return 'diverging';
    const f = Math.abs(fAbs);
    if (near(p, 2 * f)) return 'at2F';
    if (near(p, f)) return 'atF';
    if (p > 2 * f) return 'beyond2F';
    if (p > f) return 'between';
    return 'insideF';
  }

  /** 完整成像結果 */
  function solve(id, fAbs, p, h) {
    const e = element(id);
    h = h == null ? 1 : h;
    const f = signedFocal(id, fAbs);
    const cs = positionCase(id, fAbs, p);
    let q = cs === 'atF' ? Infinity : imageDistance(p, f);
    if (cs === 'at2F') q = 2 * Math.abs(fAbs);        // 恰在 2F：q = 2f（避免捨入誤差）
    const atInfinity = !isFinite(q);
    const m = atInfinity ? Infinity : (cs === 'at2F' ? -1 : magnification(p, q));
    const real = !atInfinity && q > 0;
    const upright = !atInfinity && m > 0;
    let size = 'infinite';
    if (!atInfinity) size = near(Math.abs(m), 1) ? 'same' : Math.abs(m) > 1 ? 'magnified' : 'reduced';
    const xImg = atInfinity ? NaN : (e.kind === 'lens' ? q : -q);
    const pts = {};
    if (e.sign !== 0) {
      if (e.kind === 'lens') {
        pts.F = -f; pts.F2 = f; pts.twoF = -2 * f; pts.twoF2 = 2 * f;
      } else {
        pts.F = -f; pts.C = -2 * f;
      }
    }
    return {
      element: e, f: f, p: p, h: h, q: q, m: m,
      hImg: atInfinity ? NaN : m * h,
      xObj: -p, xImg: xImg,
      atInfinity: atInfinity, real: real, upright: upright, size: size,
      case: cs, points: pts,
      // 驗算：1/p + 1/q 與 1/f
      invP: 1 / p, invQ: atInfinity ? 0 : 1 / q, invF: isFinite(f) ? 1 / f : 0
    };
  }

  /** 出射斜率（近軸薄元件）：u′ = u − y/f */
  function outSlope(u, y, f) { return isFinite(f) ? u - y / f : u; }

  /**
   * 一條由物點 (−p, h) 出發、打在元件平面高度 yHit 的光線。
   * 回傳實際的幾何：起點、元件上的轉折點、入射方向與出射方向（單位向量，x 方向為實際行進方向）。
   */
  function traceRay(id, fAbs, p, h, yHit) {
    const e = element(id);
    const f = signedFocal(id, fAbs);
    const u = (yHit - h) / p;               // 入射斜率
    const u2 = outSlope(u, yHit, f);         // 出射斜率（沿行進方向）
    const dirX = e.kind === 'lens' ? 1 : -1; // 面鏡反射後往左走
    const nIn = Math.hypot(1, u), nOut = Math.hypot(1, u2);
    return {
      x0: -p, y0: h, xh: 0, yh: yHit,
      inDir: [1 / nIn, u / nIn],
      outDir: [dirX / nOut, u2 / nOut],
      slopeIn: u, slopeOut: u2
    };
  }

  /**
   * 主光線（principal rays）。每條光線另附：
   *   aim：入射光所在直線上用來定義它的點（例如 F、C、光心），可能在物體後方或元件後方（畫虛線）
   *   via：出射光所在直線上的特殊點（例如平行光經過的 F′、凸面鏡的 F），可能在反向延長線上
   * 垂直於主軸（無法打到元件）的退化光線不回傳，例如物體恰在 F 時「經過 F 的光線」。
   * 透鏡：parallel（平行主軸）、center（經光心）、focal（經 F）
   * 面鏡：parallel（平行主軸）、focal（經 F）、radius（經曲率中心 C）；
   *       若其中有退化的光線，改用 vertex（射向鏡頂）補上。平面鏡：parallel、vertex。
   */
  function principalRays(id, fAbs, p, h) {
    const e = element(id);
    const f = signedFocal(id, fAbs);
    const rays = [];
    const add = function (key, yHit, aim, via) {
      const r = traceRay(id, fAbs, p, h, yHit);
      r.key = key;
      if (aim) r.aim = aim;
      if (via) r.via = via;
      rays.push(r);
    };
    const degenerate = function (x) { return Math.abs(p + x) <= REL * Math.max(p, Math.abs(x), 1); }; // 物體正上方
    // 平行主軸：打在 y = h
    add('parallel', h, null, e.sign === 0 ? null : (e.kind === 'lens' ? { x: f, y: 0 } : { x: -f, y: 0 }));
    if (e.sign === 0) { add('vertex', 0, { x: 0, y: 0 }); return rays; }
    if (e.kind === 'lens') {
      add('center', 0, { x: 0, y: 0 });
      // 經過（或射向）物方焦點 F（x = −f）：入射直線經過 (−f, 0)
      if (!degenerate(-f)) add('focal', h * (-f) / (p - f), { x: -f, y: 0 });
      return rays;
    }
    // 面鏡
    let n = 1;
    if (!degenerate(-f)) { add('focal', h * (-f) / (p - f), { x: -f, y: 0 }); n++; }
    if (!degenerate(-2 * f)) { add('radius', h * (-2 * f) / (p - 2 * f), { x: -2 * f, y: 0 }); n++; }
    if (n < 3) add('vertex', 0, { x: 0, y: 0 });
    return rays;
  }

  /** 兩條出射光所在直線（雙向延伸）的交點；平行時回傳 null */
  function intersectOut(a, b) {
    const d1 = a.outDir, d2 = b.outDir;
    const den = d1[0] * d2[1] - d1[1] * d2[0];
    if (Math.abs(den) < 1e-12) return null;
    const dx = b.xh - a.xh, dy = b.yh - a.yh;
    const t = (dx * d2[1] - dy * d2[0]) / den;
    return { x: a.xh + d1[0] * t, y: a.yh + d1[1] * t, t: t };
  }

  /** 由物點發出、平均打在元件平面 [−A, A] 的 n 條光線（「多條光線」） */
  function fanRays(id, fAbs, p, h, A, n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const y = n === 1 ? 0 : -A + 2 * A * i / (n - 1);
      out.push(traceRay(id, fAbs, p, h, y));
    }
    return out;
  }

  /** 課本的會聚元件成像表：各情況的代表物距（以 |f| 為單位）與預期的像 */
  const CASES = [
    { key: 'beyond2F', pf: 2.5 },
    { key: 'at2F', pf: 2 },
    { key: 'between', pf: 1.5 },
    { key: 'atF', pf: 1 },
    { key: 'insideF', pf: 0.5 }
  ];

  const api = {
    ELEMENTS: ELEMENTS,
    CASES: CASES,
    element: element,
    signedFocal: signedFocal,
    imageDistance: imageDistance,
    magnification: magnification,
    positionCase: positionCase,
    solve: solve,
    outSlope: outSlope,
    traceRay: traceRay,
    principalRays: principalRays,
    intersectOut: intersectOut,
    fanRays: fanRays
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LensMirrorCore = api;
})(this);
