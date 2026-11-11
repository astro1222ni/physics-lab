/*
 * standing-waves-core.js — 繩波的反射與駐波：物理核心（與畫面無關，可單獨測試）
 *
 * 單位約定：
 *   位置 x、繩長 L、脈波寬度 w ...... m（繩子在 0 ≤ x ≤ L，反射端在 x = L）
 *   時間 t ........................... s
 *   波速 v ........................... m/s
 *   頻率 f ........................... Hz
 *   橫向位移 y、振幅 A、a ............ 任意長度單位（畫面上用 cm）
 *
 * 全部使用一維波動方程式 y_tt = v² y_xx 的解析解（達朗貝爾解 + 鏡像法），不做數值積分。
 *
 * 【模式 A：單一脈波的反射】
 *   入射脈波向右傳：      y_i(x, t) = g(x − x0 − v t)
 *   在 x = L 反射（鏡像法：想像牆後有一個鏡像脈波向左傳）：
 *                         y_r(x, t) = s · g(2L − x − x0 − v t)
 *   固定端 s = −1（y(L, t) = 0，反射波倒立）；自由端 s = +1（∂y/∂x(L, t) = 0，反射波正立）。
 *   繩子的形狀 y = y_i + y_r（疊加原理）。繩子左側很長，反射回去的脈波離開畫面後不再反射。
 *
 * 【模式 B：連續正弦波與駐波】
 *   左端 x = 0 是振盪器，送出振幅 a、頻率 f 的正弦波；右端 x = L 為固定端或自由端。
 *   右行波 F 由振盪器送出，到右端反射成左行波，再回到振盪器端反射（近似固定端，反射係數 −ρ，
 *   ρ < 1 代表振盪器吸收一部分能量；若 ρ = 1，共振時振幅會無限增大）。
 *   令往返時間 Tr = 2L/v、右端反射係數 s，則在 x = 0 送出的右行波滿足
 *       F(τ) = a sin(ωτ) − ρ s F(τ − Tr)，τ < 0 時 F = 0
 *   展開成鏡像級數（有限項，因為波前要時間才到）：
 *       F(τ) = a Σ_{m=0}^{M} q^m sin ω(τ − m Tr)，q = −ρ s，M = ⌊τ / Tr⌋
 *            = a · Im[ e^{iωτ} (1 − z^{M+1}) / (1 − z) ]，z = q e^{−iωTr}
 *   繩上：右行（入射）y_i = F(t − x/v)，左行（反射）y_r = s F(t − (2L − x)/v)，y = y_i + y_r。
 *   共振條件 z 的相位為 0：
 *       固定端–固定端（s = −1）：f_n = n v / (2L)，n = 1, 2, 3, …
 *       固定端–自由端（s = +1）：f = (2n − 1) v / (4L)，只有奇數倍頻
 *   穩定後右行、左行波振幅相同（A = a / |1 − z|），疊加成駐波
 *       固定右端：y = −2A sin k(x − L) cos(ωt − kL)，包絡線 2A |sin k(L − x)|
 *       自由右端：包絡線 2A |cos k(L − x)|
 */
(function (root) {
  'use strict';

  const TWO_PI = 2 * Math.PI;

  /** 反射係數：固定端 −1（反相），自由端 +1（同相） */
  function reflectSign(end) { return end === 'free' ? 1 : -1; }

  // ---------------- 模式 A：脈波 ----------------

  /**
   * 脈波形狀 g(s)：s 為相對脈波中心的位置（m），w 為底寬（m），A 為高度。
   *   'sine'  半正弦：|s| ≤ w/2 時 A cos(πs/w)
   *   'gauss' 鐘形：A exp(−s²/2σ²)，σ = w/6（底寬約 ±3σ）
   *   'tri'   不對稱三角形：前緣（+s 側，前進方向）陡、後緣緩；峰值在 s = w/4
   */
  function pulseShape(shape, s, w, A) {
    const h = w / 2;
    if (shape === 'gauss') {
      const sg = w / 6;
      return A * Math.exp(-s * s / (2 * sg * sg));
    }
    if (s <= -h || s >= h) return 0;
    if (shape === 'tri') {
      const sp = w / 4;
      return s <= sp ? A * (s + h) / (sp + h) : A * (h - s) / (h - sp);
    }
    return A * Math.cos(Math.PI * s / w);
  }

  /** 脈波中心在 t = 0 的位置：預設前緣剛好在 x = 0 */
  function pulseX0(p) { return p.x0 != null ? p.x0 : -p.w / 2; }

  /** 模式 A：t 時刻 x 處的入射、反射與合成位移 */
  function pulseAt(p, x, t) {
    const x0 = pulseX0(p), s = reflectSign(p.end);
    const inc = pulseShape(p.shape, x - x0 - p.v * t, p.w, p.A);
    const ref = s * pulseShape(p.shape, 2 * p.L - x - x0 - p.v * t, p.w, p.A);
    return { inc: inc, ref: ref, sum: inc + ref };
  }

  /** 模式 A 的重要時刻：tHit 脈波中心抵達反射端、tGone 反射脈波完全離開 x < 0 */
  function pulseTimes(p) {
    const x0 = pulseX0(p);
    return {
      tHit: (p.L - x0) / p.v,
      tStart: (p.L - x0 - p.w / 2) / p.v, // 前緣碰到端點
      tEnd: (p.L - x0 + p.w / 2) / p.v,   // 後緣離開端點
      tGone: (2 * p.L - x0 + p.w / 2) / p.v
    };
  }

  // ---------------- 模式 B：連續波 ----------------

  function omega(p) { return TWO_PI * p.f; }
  function roundTrip(p) { return 2 * p.L / p.v; }
  function wavelength(v, f) { return v / f; }
  function waveNumber(p) { return TWO_PI * p.f / p.v; }
  function rhoOf(p) { return p.rho == null ? 1 : p.rho; }

  /** z = q e^{−iωTr}，q = −ρ s：一次往返後右行波的複數倍率 */
  function zOf(p) {
    const q = -rhoOf(p) * reflectSign(p.end);
    const ph = -omega(p) * roundTrip(p);
    return [q * Math.cos(ph), q * Math.sin(ph)];
  }

  function cmul(a, b) { return [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]]; }
  function cdiv(a, b) { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; }
  function cpow(z, n) {
    const r = Math.hypot(z[0], z[1]), th = Math.atan2(z[1], z[0]);
    const rn = Math.pow(r, n);
    return [rn * Math.cos(n * th), rn * Math.sin(n * th)];
  }

  /** Σ_{m=0}^{M} z^m（複數），z 很接近 1 時直接用 M + 1 */
  function partialSum(z, M) {
    const one = [1 - z[0], -z[1]];
    if (Math.hypot(one[0], one[1]) < 1e-12) return [M + 1, 0];
    const zn = cpow(z, M + 1);
    return cdiv([1 - zn[0], -zn[1]], one);
  }

  /** 已經送出（含往返）的項數 M = ⌊τ/Tr⌋；τ < 0 傳回 −1 */
  function termsAt(p, tau) { return tau < 0 ? -1 : Math.floor(tau / roundTrip(p) + 1e-12); }

  /** 振盪器端送出的右行波 F(τ)（解析級數的閉合形式） */
  function drivenF(p, tau) {
    const M = termsAt(p, tau);
    if (M < 0) return 0;
    const S = partialSum(zOf(p), M);
    const w = omega(p) * tau;
    return p.a * cmul([Math.cos(w), Math.sin(w)], S)[1];
  }

  /** 逐項相加的 F(τ)（測試用，與閉合形式比對） */
  function drivenFSeries(p, tau) {
    const M = termsAt(p, tau), Tr = roundTrip(p), q = -rhoOf(p) * reflectSign(p.end);
    let F = 0, qm = 1;
    for (let m = 0; m <= M; m++) { F += qm * p.a * Math.sin(omega(p) * (tau - m * Tr)); qm *= q; }
    return F;
  }

  /** 右行波在 τ 時刻的振幅 a |Σ z^m|（隨往返次數一階一階增加） */
  function drivenAmplitudeAt(p, tau) {
    const M = termsAt(p, tau);
    if (M < 0) return 0;
    const S = partialSum(zOf(p), M);
    return p.a * Math.hypot(S[0], S[1]);
  }

  /** 模式 B：t 時刻 x 處的入射（右行）、反射（左行）與合成位移 */
  function drivenAt(p, x, t) {
    const inc = drivenF(p, t - x / p.v);
    const ref = reflectSign(p.end) * drivenF(p, t - (2 * p.L - x) / p.v);
    return { inc: inc, ref: ref, sum: inc + ref };
  }

  /** 穩定狀態的右行（＝左行）波振幅 A = a / |1 − z|（需 ρ < 1） */
  function steadyAmplitude(p) {
    const z = zOf(p);
    return p.a / Math.hypot(1 - z[0], z[1]);
  }

  /** 穩定狀態駐波的包絡線（最大位移）2A |sin k(L − x)|（固定右端）或 2A |cos k(L − x)|（自由右端） */
  function envelope(p, x, A) {
    const k = waveNumber(p), u = k * (p.L - x);
    return 2 * A * Math.abs(p.end === 'free' ? Math.cos(u) : Math.sin(u));
  }

  /** 第 n 個共振頻率（n = 1, 2, 3, …） */
  function harmonicFreq(end, n, v, L) {
    return end === 'free' ? (2 * n - 1) * v / (4 * L) : n * v / (2 * L);
  }
  /** 第 n 個共振是基頻的幾倍（諧音編號）：固定–固定 n，固定–自由 2n − 1 */
  function harmonicMultiple(end, n) { return end === 'free' ? 2 * n - 1 : n; }
  /** 基頻 f_1 */
  function fundamental(end, v, L) { return harmonicFreq(end, 1, v, L); }

  function harmonics(end, v, L, count) {
    const out = [];
    for (let n = 1; n <= count; n++) out.push({ n: n, m: harmonicMultiple(end, n), f: harmonicFreq(end, n, v, L) });
    return out;
  }

  /** 最接近的共振：{ n, m, f, rel（相對偏差）, resonant } */
  function nearestHarmonic(p, tol) {
    tol = tol == null ? 1e-3 : tol;
    const f1 = fundamental(p.end, p.v, p.L);
    let n = p.end === 'free' ? Math.round((p.f / f1 + 1) / 2) : Math.round(p.f / f1);
    if (n < 1) n = 1;
    const fn = harmonicFreq(p.end, n, p.v, p.L);
    const rel = (p.f - fn) / fn;
    return { n: n, m: harmonicMultiple(p.end, n), f: fn, rel: rel, resonant: Math.abs(rel) <= tol };
  }

  /** 第 n 個共振的波節數與波腹數（含兩端） */
  function modeCounts(end, n) {
    return end === 'free' ? { nodes: n, antinodes: n } : { nodes: n + 1, antinodes: n };
  }

  /**
   * 穩定駐波在 0 ≤ x ≤ L 的波節與波腹位置（由反射端量起，每隔 λ/2 一個）。
   * 固定右端：波節 x = L − jλ/2；自由右端：波腹 x = L − jλ/2，波節 x = L − (2j + 1)λ/4。
   */
  function standingPoints(p) {
    const lam = wavelength(p.v, p.f), eps = 1e-6 * p.L;
    const list = function (first) {
      const out = [];
      for (let j = 0; ; j++) {
        const x = p.L - first - j * lam / 2;
        if (x < -eps) break;
        out.push(Math.max(0, x));
        if (j > 10000) break;
      }
      return out;
    };
    const q = lam / 4;
    return p.end === 'free'
      ? { nodes: list(q), antinodes: list(0) }
      : { nodes: list(0), antinodes: list(q) };
  }

  /** 共振曲線：穩定振幅與振盪器振幅的比 A/a = 1/|1 − z|（頻率 f） */
  function gain(end, f, v, L, rho) {
    const z = zOf({ end: end, f: f, v: v, L: L, rho: rho });
    return 1 / Math.hypot(1 - z[0], z[1]);
  }

  const api = {
    TWO_PI: TWO_PI,
    reflectSign: reflectSign,
    pulseShape: pulseShape,
    pulseX0: pulseX0,
    pulseAt: pulseAt,
    pulseTimes: pulseTimes,
    roundTrip: roundTrip,
    wavelength: wavelength,
    waveNumber: waveNumber,
    termsAt: termsAt,
    drivenF: drivenF,
    drivenFSeries: drivenFSeries,
    drivenAmplitudeAt: drivenAmplitudeAt,
    drivenAt: drivenAt,
    steadyAmplitude: steadyAmplitude,
    envelope: envelope,
    harmonicFreq: harmonicFreq,
    harmonicMultiple: harmonicMultiple,
    fundamental: fundamental,
    harmonics: harmonics,
    nearestHarmonic: nearestHarmonic,
    modeCounts: modeCounts,
    standingPoints: standingPoints,
    gain: gain
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.StandingCore = api;
})(typeof window !== 'undefined' ? window : this);
