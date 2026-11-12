/*
 * biomimicry-core.js — 「仿生學：蓮葉效應與壁虎的腳」的物理核心（與畫面無關，Node 可直接 require 做單元測試）
 *
 * 第一部分：蓮葉效應（超疏水與自我清潔）
 *   平滑表面：Young 方程 cos θY = (γSV − γSL) / γLV，θY 由材料決定。
 *   方柱陣列（柱寬 a、間隙 b、柱高 h，週期 p = a + b）：
 *     粗糙度 r = 1 + 4ah / p²（真實面積 ÷ 投影面積），固體占比 φ = a² / p²。
 *     Wenzel（水填滿柱間）：cos θW = r cos θY。粗糙讓疏水更疏水、親水更親水。
 *     Cassie–Baxter（水架在柱頂、底下是空氣）：cos θCB = φ (cos θY + 1) − 1。
 *     兩者能量相等的臨界：cos θc = (φ − 1) / (r − φ)；θY > θc 時 Cassie 能量較低。
 *   Cassie 狀態被壓垮（刺穿）的壓力（毛細抗壓的形式同 Bartolo 等 2006，EPL 74:299；下垂是常見的簡化估計）：
 *     沿柱壁往下滑：ΔP_dep = −γ · 4a · cos θA,Y / (p² − a²)（θA,Y > 90° 時才擋得住）。
 *     彎月面下垂碰到底：ΔP_sag = 8γh / d²，d = √2 · b（對角間隙）→ ΔP_sag = 4γh / b²。
 *     水珠本身的 Laplace 壓力 2γ/R；雨滴撞擊的動態壓力 ½ρv²（Bartolo 等 2006 的量級判準）。
 *   滾落角（Furmidge 1962）：m g sin αc = k · γ · w · (cos θR − cos θA)，w 是接觸面寬度。
 *     前進角、後退角：把材料的 θA,Y、θR,Y 分別代入 Wenzel 或 Cassie 式（一階近似）。
 *   水珠是球冠（小水珠、重力壓扁不明顯）：V = πR³(2 − 3cos θ + cos³ θ)/3，接觸半徑 = R sin θ。
 *
 * 第二部分：壁虎的腳（凡得瓦力、分岔與剝離）
 *   凡得瓦（Hamaker）：球與平面相距 D 的吸引力 F = A·R / (6D²)。
 *   JKR 拉脫力：F = (3/2)π·W·R，附著功 W = A / (12π·D0²)。
 *   接觸分岔（Arzt、Gorb、Spolenak 2003）：總面積不變、分成 n 個尖端，總拉脫力變 √n 倍。
 *   Kendall（1975）剝離：(F/b)² / (2Et) + (F/b)(1 − cos θ) − W = 0；不可伸長時 F/b = W / (1 − cos θ)。
 *   摩擦附著（Autumn 等 2006）：剛毛的附著力（垂直）最多是剪力（平行）的 tan α*，α* ≈ 30°。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BioMimCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const GAMMA = 0.072;   // 水的表面張力（N/m，25 °C 約 0.072）
  const RHO = 1000;      // 水的密度（kg/m³）
  const G = 9.81;
  const FURMIDGE_K = 1;  // Furmidge 的形狀係數（不同文獻約 1 到 π/2，這裡取 1）
  const DEG = Math.PI / 180;

  function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }
  function acosd(c) { return Math.acos(clamp(c, -1, 1)) / DEG; }
  function cosd(t) { return Math.cos(t * DEG); }

  /**
   * 常見材料（平面上的水接觸角 θY 與材料本身的遲滯 hyst，度）。
   * 聚苯乙烯 87°、石蠟 109°、PTFE 約 109–117°（Accudyne 表等，依量法不同）；玻璃依清潔程度 0–30° 不等，這裡取示意值；
   * 遲滯 hyst 都是示意值。
   */
  const MATERIALS = [
    { id: 'glass', zh: '玻璃', en: 'Glass', thY: 25, hyst: 10 },
    { id: 'ps', zh: '聚苯乙烯（塑膠）', en: 'Polystyrene (plastic)', thY: 87, hyst: 15 },
    { id: 'wax', zh: '石蠟（像葉面的蠟）', en: 'Paraffin wax (like leaf wax)', thY: 109, hyst: 10 },
    { id: 'ptfe', zh: '鐵氟龍', en: 'Teflon (PTFE)', thY: 114, hyst: 12 }
  ];

  /** 方柱陣列（單位 µm）：週期、固體占比、粗糙度 */
  function texture(a, b, h) {
    const smooth = !(a > 0 && b > 0 && h > 0);
    if (smooth) return { smooth: true, p: 0, phi: 1, r: 1 };
    const p = a + b;
    return { smooth: false, p: p, phi: a * a / (p * p), r: 1 + 4 * a * h / (p * p) };
  }
  function wenzelCos(cosY, r) { return clamp(r * cosY, -1, 1); }
  function cassieCos(cosY, phi) { return phi * (cosY + 1) - 1; }
  /** Cassie 與 Wenzel 能量相等時的 cos θY（θY 大於對應角度時 Cassie 較穩定） */
  function criticalCos(phi, r) { return (phi - 1) / (r - phi); }

  /** 球冠水珠：體積 V（µL）、接觸角 θ（度）→ 球半徑 R、接觸半徑 c、高度 H（公尺） */
  function cap(V, th) {
    const t = clamp(th, 1, 179.5) * DEG, c = Math.cos(t);
    const v = V * 1e-9;
    const R = Math.cbrt(3 * v / (Math.PI * (2 - 3 * c + c * c * c)));
    return { R: R, c: R * Math.sin(t), H: R * (1 - c) };
  }
  function laplace(R) { return 2 * GAMMA / R; }
  function dynamicP(v) { return 0.5 * RHO * v * v; }

  /** 刺穿壓力（Pa）：沿柱壁下滑、彎月面碰底，取小的 */
  function impalement(a, b, h, thA) {
    const p = a + b, um = 1e-6;
    const cA = cosd(thA);
    const dep = cA < 0 ? -GAMMA * 4 * a * um * cA / ((p * p - a * a) * um * um) : 0;
    const sag = 4 * GAMMA * h * um / (b * b * um * um);
    return { dep: dep, sag: sag, crit: Math.min(dep, sag), by: dep <= sag ? 'dep' : 'sag' };
  }

  /**
   * 一顆水珠在表面上的狀態。
   * o = { a, b, h（µm）, thY, hyst（度）, V（µL）, v（落下速度 m/s，0 = 輕輕放）, wet（已經被刺穿過：true 就維持 Wenzel） }
   */
  function drop(o) {
    const tx = texture(o.a, o.b, o.h);
    const thY = o.thY, hy = o.hyst || 0;
    const thAY = Math.min(179, thY + hy / 2), thRY = Math.max(0, thY - hy / 2);
    const cY = cosd(thY), cA = cosd(thAY), cR = cosd(thRY);
    const out = {
      smooth: tx.smooth, r: tx.r, phi: tx.phi, p: tx.p, thY: thY, thAY: thAY, thRY: thRY,
      thW: acosd(wenzelCos(cY, tx.r)), thCB: acosd(cassieCos(cY, tx.phi)),
      thc: tx.smooth ? null : acosd(criticalCos(tx.phi, tx.r)),
      mode: 'smooth', theta: thY, thA: thAY, thR: thRY,
      Pdep: 0, Psag: 0, Pcrit: 0, by: '', Plap: 0, Pdyn: dynamicP(o.v || 0), impaled: false, metastable: false
    };
    if (!tx.smooth) {
      const im = impalement(o.a, o.b, o.h, thAY);
      out.Pdep = im.dep; out.Psag = im.sag; out.Pcrit = im.crit; out.by = im.by;
      out.cassieStable = cY < criticalCos(tx.phi, tx.r);
      if (thAY <= 90 || o.wet) out.mode = 'wenzel';
      else {
        // 先假設 Cassie，算 Laplace 壓力；再看撞擊或 Laplace 有沒有超過刺穿壓力
        const cc = cap(o.V, out.thCB);
        out.Plap = laplace(cc.R);
        const P = Math.max(out.Plap, out.Pdyn);
        if (P > im.crit) { out.mode = 'wenzel'; out.impaled = true; }
        else { out.mode = 'cassie'; out.metastable = !out.cassieStable; }
      }
      if (out.mode === 'cassie') {
        out.theta = out.thCB;
        out.thA = acosd(cassieCos(cA, tx.phi)); out.thR = acosd(cassieCos(cR, tx.phi));
      } else {
        out.theta = out.thW;
        out.thA = acosd(wenzelCos(cA, tx.r)); out.thR = acosd(wenzelCos(cR, tx.r));
        if (tx.r * cY >= 1) { out.mode = 'spread'; out.theta = 0; out.thA = 0; out.thR = 0; }
      }
    }
    const g = cap(o.V, Math.max(out.theta, 1));
    out.R = g.R; out.c = g.c; out.H = g.H; out.w = 2 * g.c;
    if (out.mode !== 'cassie' || !out.Plap) out.Plap = laplace(g.R);
    out.mass = RHO * o.V * 1e-9;
    // 接觸線被釘住的強度：接觸線底下真正碰到固體的比例 × 材料本身的遲滯（Johnson–Dettre 的一階近似）。
    // Cassie：φ·Δcos；Wenzel：r·Δcos；平面：Δcos。不夾在 [−1, 1]，避免 θA 夾到 180° 時低估釘住力。
    const frac = out.mode === 'cassie' ? tx.phi : out.mode === 'smooth' ? 1 : tx.r;
    out.dcos = frac * (cR - cA);
    out.Fpin = FURMIDGE_K * GAMMA * out.w * out.dcos;
    const s = out.Fpin / (out.mass * G);
    out.roll = (s >= 1 || out.mode === 'spread') ? null : Math.asin(Math.max(0, s)) / DEG;   // null：連垂直都不會滑（或攤成水膜）
    return out;
  }

  /*
   * 自我清潔：灰塵的狀態 alive[i] = 1 在葉面上、2 沾在水珠裡、0 已經被帶走。
   * 下面三個函式只處理還在葉面上（= 1）的灰塵，把它們標成 2（沾進水珠），回傳索引；
   * 水珠滾出葉面時，頁面再把它帶著的灰塵標成 0。水珠被擦掉或蒸發，灰塵回到葉面（= 1）。
   */
  /** 水珠沿 x0 滾下：寬 w 範圍內的灰塵沾進水珠 */
  function sweep(xs, alive, x0, w) {
    const got = [];
    for (let i = 0; i < xs.length; i++) if (alive[i] === 1 && Math.abs(xs[i] - x0) <= w / 2) { alive[i] = 2; got.push(i); }
    return got;
  }

  /** 水珠從 (x, y0) 滾到 (x, y1)（y 往下坡增加）：這段路上、寬 w 範圍內的灰塵沾進水珠（xs、ys 同單位） */
  function sweepPath(xs, ys, alive, x, y0, y1, w) {
    const lo = Math.min(y0, y1), hi = Math.max(y0, y1), got = [];
    for (let i = 0; i < xs.length; i++) {
      if (alive[i] === 1 && Math.abs(xs[i] - x) <= w / 2 && ys[i] >= lo && ys[i] <= hi) { alive[i] = 2; got.push(i); }
    }
    return got;
  }
  /** 水珠落在 (x, y)、接觸半徑 c：被它蓋住的灰塵沾進水珠 */
  function capture(xs, ys, alive, x, y, c) {
    const got = [];
    for (let i = 0; i < xs.length; i++) {
      const dx = xs[i] - x, dy = ys[i] - y;
      if (alive[i] === 1 && dx * dx + dy * dy <= c * c) { alive[i] = 2; got.push(i); }
    }
    return got;
  }

  // ---------- 第二部分：壁虎 ----------
  const HAMAKER = 6.8e-20;    // J：二氧化矽（玻璃）表面，Autumn 等 2002 PNAS 用的值（PDMS 4.5e-20、聚酯 6.1e-20）
  const D0 = 0.165e-9;        // m（JKR 常用的平衡距離）
  const W_VDW = HAMAKER / (12 * Math.PI * D0 * D0);   // 附著功 J/m²，約 0.1
  /** 球與平面的凡得瓦力（N）：R、D 單位公尺 */
  function vdwSphere(R, D, A) { return (A || HAMAKER) * R / (6 * D * D); }
  /** JKR 拉脫力（N） */
  function jkr(R, W) { return 1.5 * Math.PI * (W == null ? W_VDW : W) * R; }
  /** 接觸分岔：總面積不變、分成 n 個，總拉脫力 / 一個大接觸的拉脫力 = √n */
  function splitGain(n) { return Math.sqrt(n); }
  /** Kendall 剝離：單位寬度的剝離力 F/b（N/m）。Et = 楊氏模數 × 厚度（N/m）；Et = Infinity 表示不可伸長 */
  function kendall(theta, W, Et) {
    const k = 1 - Math.cos(theta * DEG);
    if (!isFinite(Et)) return k > 0 ? W / k : Infinity;
    return Et * (-k + Math.sqrt(k * k + 2 * W / Et));
  }

  const GECKO = {
    Fs: 194e-6,         // 單根剛毛的最大剪力（N）：Autumn 等 2000（194 ± 25 µN）
    alphaStar: 30,      // 剛毛脫離角（度）：Autumn 等 2000 量到 30.6° ± 1.8°；摩擦附著的臨界角 α*（Autumn 等 2006）
    setae: 6.5e6,       // 大壁虎（Tokay）四腳剛毛總數約 650 萬根：全部同時附著約 1300 N（約 130 kg，理論上限）
    density: 14400,     // 每平方毫米約 14 400 根（Autumn 等 2002）
    spatulaR: 0.14e-6,  // 匙突（spatula）半徑約 0.13–0.16 µm（Autumn 等 2002 由 JKR 反推）
    spatulaF: 10e-9     // 單一匙突實測拉脫力約 10 nN（Huber 等 2005，Biol. Lett. 1:2）
  };
  /**
   * 壁虎能不能貼住：wall = 牆的傾角（0 = 地板、90 = 垂直牆、180 = 天花板），m = 體重（kg），f = 有效接觸的剛毛比例（0–1）
   * 剪力需求 S = mg·sin(wall)；拉離需求 P = max(0, −mg·cos(wall))。
   * 摩擦附著：腳可以互相往內拉，把每根剛毛的剪力用滿；附著上限 = 剪力上限 × tan α*。
   */
  function gecko(wall, m, f, opt) {
    const o = opt || {};
    const Fs = o.Fs || GECKO.Fs, N = o.setae || GECKO.setae, a = (o.alphaStar || GECKO.alphaStar) * DEG;
    const W = m * G, t = wall * DEG;
    const eps = 1e-12 * W;
    let S = Math.abs(W * Math.sin(t)), P = Math.max(0, -W * Math.cos(t));
    if (S < eps) S = 0;
    if (P < eps) P = 0;
    const Smax = f * N * Fs, Pmax = Smax * Math.tan(a);
    const uS = S === 0 ? 0 : Smax > 0 ? S / Smax : Infinity, uP = P === 0 ? 0 : Pmax > 0 ? P / Pmax : Infinity;
    const u = Math.max(uS, uP);
    return { S: S, P: P, Smax: Smax, Pmax: Pmax, use: u, hold: u <= 1, limit: uS >= uP ? 'shear' : 'adhesion', safety: u > 0 ? 1 / u : Infinity };
  }
  /** 撐得住體重 m 在牆角 wall 上，最少要多少比例的剛毛 */
  function minFraction(wall, m, opt) {
    const r = gecko(wall, m, 1, opt);
    return r.use;
  }

  return {
    GAMMA: GAMMA, RHO: RHO, G: G, DEG: DEG, FURMIDGE_K: FURMIDGE_K, MATERIALS: MATERIALS,
    texture: texture, wenzelCos: wenzelCos, cassieCos: cassieCos, criticalCos: criticalCos,
    cap: cap, laplace: laplace, dynamicP: dynamicP, impalement: impalement, drop: drop, sweep: sweep, sweepPath: sweepPath, capture: capture,
    HAMAKER: HAMAKER, D0: D0, W_VDW: W_VDW, vdwSphere: vdwSphere, jkr: jkr, splitGain: splitGain, kendall: kendall,
    GECKO: GECKO, gecko: gecko, minFraction: minFraction, acosd: acosd, cosd: cosd
  };
});
