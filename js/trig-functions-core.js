/*
 * trig-functions-core.js — 三角函數的數學核心（與畫面無關，可單獨測試）
 *
 * 角度：輸入、輸出都用「度」（θ、φ），內部換成弧度計算；x 軸（函數圖形的自變數）一律用弧度。
 * 單位圓：P(θ) = (cos θ, sin θ)。tan θ = sin θ ／ cos θ，cos θ = 0（θ = 90° + 180°·n）時沒有定義（NaN）。
 *   θ 是 90° 的整數倍時直接給精確值（避免 Math.sin(π) = 1.2e-16 這類尾數）。
 * 特殊角：15° 的整數倍都有根式的精確值（exact）：sin 15° = (√6 − √2)／4、tan 15° = 2 − √3……
 * 正弦波：y = A sin(ωx + φ) + k（ω > 0）。振幅 |A|、週期 2π／ω、最大值 k + |A|、最小值 k − |A|、
 *   中線 y = k、圖形是 y = sin x 先水平壓縮 ω 倍、再向左平移 φ／ω、再鉛直伸縮 A 倍、再上移 k。
 *   A < 0 與 A > 0、φ ± 180° 畫出同一條曲線（normalize 把它換成 A ≥ 0、−180° < φ ≤ 180°）。
 * 疊合：a sin x + b cos x = r sin(x + φ)，r = √(a² + b²)、cos φ = a／r、sin φ = b／r（和角公式）。
 * 螺旋線：(x, A cos(ωx + φ), A sin(ωx + φ) + k) 從側面看是正弦波，從底下看是餘弦波，從正面看是圓。
 */
(function (root) {
  'use strict';

  const PI = Math.PI;
  const DEG = PI / 180;
  const TAU = 2 * PI;

  /** 把角度化成 [0, 360) */
  function mod360(deg) { const r = deg % 360; return r < 0 ? r + 360 : r; }
  /** 把角度化成 (−180, 180] */
  function wrap180(deg) { let r = mod360(deg); if (r > 180) r -= 360; return r; }
  /** 是否（在 1e-9 度內）是 step 度的整數倍；是的話傳回倍數，否則 null */
  function multipleOf(deg, step) {
    const n = Math.round(deg / step);
    return Math.abs(deg - n * step) <= 1e-9 ? n : null;
  }

  // ---------- 單位圓 ----------
  /** sin、cos（90° 的整數倍時給精確值） */
  function sinCos(deg) {
    const q = multipleOf(deg, 90);
    if (q !== null) {
      const m = ((q % 4) + 4) % 4;
      return [[0, 1], [1, 0], [0, -1], [-1, 0]][m];
    }
    const t = deg * DEG;
    return [Math.sin(t), Math.cos(t)];
  }
  /**
   * 單位圓上角 θ 的各個量
   * → { theta, rad, sin, cos, tan（沒有定義時 NaN）, std（同界角化成 0–360）, quadrant（0 = 在坐標軸上，1–4）,
   *     ref（參考角，0–90）, turns（轉了幾整圈）}
   */
  function unit(thetaDeg) {
    const sc = sinCos(thetaDeg);
    const s = sc[0], c = sc[1];
    const std = mod360(thetaDeg);
    const onAxis = multipleOf(thetaDeg, 90) !== null;
    let quadrant = 0;
    if (!onAxis) quadrant = Math.floor(std / 90) + 1;
    let ref;
    if (std <= 90) ref = std;
    else if (std <= 180) ref = 180 - std;
    else if (std <= 270) ref = std - 180;
    else ref = 360 - std;
    const tan = c === 0 ? NaN : s / c;
    return { theta: thetaDeg, rad: thetaDeg * DEG, sin: s, cos: c, tan: tan, std: std, quadrant: quadrant, ref: ref, turns: Math.floor(thetaDeg / 360) };
  }

  // ---------- 特殊角的精確值（15° 的倍數） ----------
  // 0°–90° 的 sin（TeX 與數值）；其餘角度由象限與參考角推得
  const SIN_EXACT = {
    0: ['0', 0],
    15: ['\\frac{\\sqrt{6}-\\sqrt{2}}{4}', (Math.sqrt(6) - Math.sqrt(2)) / 4],
    30: ['\\frac{1}{2}', 0.5],
    45: ['\\frac{\\sqrt{2}}{2}', Math.SQRT2 / 2],
    60: ['\\frac{\\sqrt{3}}{2}', Math.sqrt(3) / 2],
    75: ['\\frac{\\sqrt{6}+\\sqrt{2}}{4}', (Math.sqrt(6) + Math.sqrt(2)) / 4],
    90: ['1', 1]
  };
  const TAN_EXACT = {
    0: ['0', 0],
    15: ['2-\\sqrt{3}', 2 - Math.sqrt(3)],
    30: ['\\frac{\\sqrt{3}}{3}', Math.sqrt(3) / 3],
    45: ['1', 1],
    60: ['\\sqrt{3}', Math.sqrt(3)],
    75: ['2+\\sqrt{3}', 2 + Math.sqrt(3)]
  };
  /** 純文字版（畫布與螢幕報讀用；不用上標字元） */
  const SIN_TEXT = { 0: '0', 15: '(√6 − √2)/4', 30: '1/2', 45: '√2/2', 60: '√3/2', 75: '(√6 + √2)/4', 90: '1' };
  const TAN_TEXT = { 0: '0', 15: '2 − √3', 30: '√3/3', 45: '1', 60: '√3', 75: '2 + √3' };

  /** 加負號：['2 − √3', v] → ['−(2 − √3)', −v]；TeX 的 2-\sqrt{3} → -\left(2-\sqrt{3}\right) */
  function neg(entry, text) {
    if (entry[1] === 0) return entry;
    const t = entry[0];
    if (text) return ['−' + (t.indexOf(' ') >= 0 && t[0] !== '(' ? '(' + t + ')' : t), -entry[1]];
    return ['-' + (/^\d+[-+]/.test(t) ? '\\left(' + t + '\\right)' : t), -entry[1]];
  }
  /** sin θ 的精確值：θ 是 15° 的倍數時傳回 { tex, text, value }，否則 null */
  function exactSin(deg) {
    const n = multipleOf(deg, 15);
    if (n === null) return null;
    const s = mod360(n * 15);
    let r, sign;
    if (s <= 90) { r = s; sign = 1; } else if (s <= 180) { r = 180 - s; sign = 1; } else if (s <= 270) { r = s - 180; sign = -1; } else { r = 360 - s; sign = -1; }
    let e = SIN_EXACT[r], t = [SIN_TEXT[r], e[1]];
    if (sign < 0) { e = neg(e); t = neg(t, true); }
    return { tex: e[0], text: t[0], value: e[1] };
  }
  function exactCos(deg) { return exactSin(deg + 90); }
  /** tan θ 的精確值；cos θ = 0 時傳回 { undefined: true }；不是 15° 的倍數時 null */
  function exactTan(deg) {
    const n = multipleOf(deg, 15);
    if (n === null) return null;
    const s = mod360(n * 15);
    if (s === 90 || s === 270) return { undefined: true, tex: '\\text{—}', text: '—', value: NaN };
    let r, sign;
    if (s < 90) { r = s; sign = 1; } else if (s <= 180) { r = 180 - s; sign = -1; } else if (s < 270) { r = s - 180; sign = 1; } else { r = 360 - s; sign = -1; }
    let e = TAN_EXACT[r], t = [TAN_TEXT[r], e[1]];
    if (sign < 0) { e = neg(e); t = neg(t, true); }
    return { tex: e[0], text: t[0], value: e[1] };
  }

  // ---------- 弧度寫成 π 的分數 ----------
  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { const t = a % b; a = b; b = t; } return a; }
  /** 角度（15° 的倍數）→ { num, den }：deg = num／den × 180°；不是 15° 的倍數時 null */
  function piFraction(deg) {
    const n = multipleOf(deg, 15);
    if (n === null) return null;
    let num = n, den = 12; // n·15° = n·π／12
    const g = gcd(num, den) || 1;
    num /= g; den /= g;
    return { num: num, den: den };
  }
  /** π 的分數寫成 TeX（例如 \frac{\pi}{6}、-\frac{3\pi}{4}、2\pi）；不是 15° 的倍數時 null */
  function piTex(deg) {
    const f = piFraction(deg);
    if (!f) return null;
    if (f.num === 0) return '0';
    const sign = f.num < 0 ? '-' : '';
    const a = Math.abs(f.num);
    const top = (a === 1 ? '' : a) + '\\pi';
    return sign + (f.den === 1 ? top : '\\frac{' + top + '}{' + f.den + '}');
  }
  /** π 的分數寫成純文字（例如 π/6、3π/4、−π/2、2π） */
  function piText(deg) {
    const f = piFraction(deg);
    if (!f) return null;
    if (f.num === 0) return '0';
    const sign = f.num < 0 ? '−' : '';
    const a = Math.abs(f.num);
    return sign + (a === 1 ? '' : a) + 'π' + (f.den === 1 ? '' : '/' + f.den);
  }

  // ---------- 正弦波 y = A sin(ωx + φ) + k ----------
  /** p = { A, w, phi（度）, k } 在 x（弧度）的值 */
  function waveY(p, x) { return p.A * Math.sin(p.w * x + p.phi * DEG) + p.k; }
  /** 正弦波的各個特徵量 */
  function waveInfo(p) {
    const amp = Math.abs(p.A);
    return {
      A: p.A, w: p.w, phi: p.phi, k: p.k,
      amp: amp, period: TAU / p.w, freq: p.w / TAU,
      max: p.k + amp, min: p.k - amp,
      shift: -p.phi * DEG / p.w,      // y = A sin(ω(x − h)) + k 的 h（正：右移，負：左移）
      firstMax: firstMax(p, 0), firstZeroUp: firstRise(p, 0)
    };
  }
  /** x ≥ x0 的第一個最大值位置（A = 0 時 NaN） */
  function firstMax(p, x0) {
    if (p.A === 0 || !(p.w > 0)) return NaN;
    const psi = p.A > 0 ? PI / 2 : -PI / 2;       // 讓 A sin(…) 最大的相位
    const ph = p.phi * DEG;
    const m = Math.ceil((p.w * (x0 || 0) + ph - psi) / TAU - 1e-12);
    return (psi - ph + TAU * m) / p.w;
  }
  /** x ≥ x0 的第一個「從中線往上穿過」的位置（A = 0 時 NaN） */
  function firstRise(p, x0) {
    if (p.A === 0 || !(p.w > 0)) return NaN;
    const psi = p.A > 0 ? 0 : PI;
    const ph = p.phi * DEG;
    const m = Math.ceil((p.w * (x0 || 0) + ph - psi) / TAU - 1e-12);
    return (psi - ph + TAU * m) / p.w;
  }
  /** 換成 A ≥ 0、−180° < φ ≤ 180° 的寫法（同一條曲線） */
  function normalize(p) {
    let A = p.A, phi = p.phi;
    if (A < 0) { A = -A; phi += 180; }
    return { A: A, w: p.w, phi: wrap180(phi), k: p.k };
  }
  /** 兩條正弦波在 [x0, x1] 上的最大差距（取樣 n + 1 點；用來判斷「曲線重合」，與寫法無關） */
  function curveGap(p, q, x0, x1, n) {
    n = n || 800;
    let g = 0;
    for (let i = 0; i <= n; i++) {
      const x = x0 + (x1 - x0) * i / n;
      g = Math.max(g, Math.abs(waveY(p, x) - waveY(q, x)));
    }
    return g;
  }
  /**
   * 同一個 ω 的兩條正弦波，整條曲線的最大差距（解析解）：
   * A₁ sin(ωx + φ₁) − A₂ sin(ωx + φ₂) = R sin(ωx + θ)，R = |A₁e^{iφ₁} − A₂e^{iφ₂}|，所以最大差距 = R + |k₁ − k₂|
   */
  function gapSameW(p, q) {
    const re = p.A * Math.cos(p.phi * DEG) - q.A * Math.cos(q.phi * DEG);
    const im = p.A * Math.sin(p.phi * DEG) - q.A * Math.sin(q.phi * DEG);
    return Math.hypot(re, im) + Math.abs(p.k - q.k);
  }

  // ---------- 疊合 a sin x + b cos x = r sin(x + φ) ----------
  function superpose(a, b) {
    const r = Math.hypot(a, b);
    const phi = r === 0 ? 0 : Math.atan2(b, a) / DEG;
    return { a: a, b: b, r: r, phi: phi, max: r, min: -r, maxAt: r === 0 ? NaN : mod360(90 - phi) * DEG };
  }
  function sumY(a, b, x) { return a * Math.sin(x) + b * Math.cos(x); }

  // ---------- 螺旋線（3D）：(x, A cos(ωx + φ), A sin(ωx + φ) + k) ----------
  function helix(p, x) {
    const t = p.w * x + p.phi * DEG;
    return [x, p.A * Math.cos(t), p.A * Math.sin(t) + p.k];
  }

  // ---------- 挑戰：隨機目標波形（數值都落在滑桿的格點上，一定調得出來） ----------
  const TARGET_A = [0.5, 1, 1.5, 2, 2.5, 3];
  const TARGET_W = [1, 1.5, 2, 2.5, 3];          // ω ≥ 1：0–2π 之內至少看得到一個完整週期
  const TARGET_K = [-1.5, -1, -0.5, 0, 0.5, 1, 1.5];
  /** rand：0–1 的亂數函式；cur：目前的曲線（目標要和它明顯不同）。傳回 { A, w, phi, k } */
  function randomTarget(rand, cur) {
    rand = rand || Math.random;
    const pick = function (arr) { return arr[Math.min(arr.length - 1, Math.floor(rand() * arr.length))]; };
    for (let tries = 0; tries < 200; tries++) {
      const A = pick(TARGET_A), w = pick(TARGET_W), k = pick(TARGET_K);
      const phi = (Math.floor(rand() * 24) - 11) * 15;   // −165°…180°，15° 的倍數
      const t = { A: A, w: w, phi: phi, k: k };
      if (Math.max(A, 0) + Math.abs(k) > 3.5) continue;   // 畫面範圍內看得清楚
      if (A === 1 && w === 1 && phi === 0 && k === 0) continue;
      if (cur && curveGap(t, cur, 0, 2 * TAU, 600) < 0.6) continue;
      return t;
    }
    return { A: 2, w: 2, phi: 45, k: 1 };
  }

  // ---------- 數字與方程式的寫法 ----------
  /** 去掉多餘的 0：2.50 → 2.5、−0.0 → 0 */
  function trim(v, dec) {
    if (!isFinite(v)) return '—';
    let s = v.toFixed(dec);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    if (s === '-0') s = '0';
    return s;
  }
  /** 相位寫成 TeX：15° 的倍數用 π 的分數，否則用弧度小數 */
  function phaseTex(deg) {
    const t = piTex(deg);
    if (t !== null) return t;
    return trim(deg * DEG, 3);
  }
  /** y = A sin(ωx + φ) + k 的 TeX */
  function waveTex(p) {
    if (p.A === 0) return 'y = ' + trim(p.k, 2);
    const A = trim(p.A, 2);
    const head = A === '1' ? '' : A === '-1' ? '-' : A;
    const wS = trim(p.w, 2);
    const inner0 = (wS === '1' ? '' : wS) + 'x';
    let inner = inner0;
    if (Math.abs(p.phi) > 1e-12) {
      const ph = phaseTex(Math.abs(p.phi));
      inner += (p.phi < 0 ? ' - ' : ' + ') + ph;
    }
    let s = 'y = ' + head + '\\sin' + (inner === 'x' ? ' x' : '\\left(' + inner + '\\right)');
    if (Math.abs(p.k) > 1e-12) s += (p.k < 0 ? ' - ' : ' + ') + trim(Math.abs(p.k), 2);
    return s;
  }

  /** y = A sin(ωx + φ) + k 的純文字（3D 標籤用；負號用 −，相位用 π 的分數或弧度小數） */
  function waveText(p) {
    const neg = function (t) { return t.replace(/^-/, '−'); };
    if (p.A === 0) return 'y = ' + neg(trim(p.k, 2));
    const A = trim(p.A, 2);
    const head = A === '1' ? '' : A === '-1' ? '−' : neg(A);
    const wS = trim(p.w, 2);
    let inner = (wS === '1' ? '' : wS) + 'x';
    if (Math.abs(p.phi) > 1e-12) {
      const ph = piText(Math.abs(p.phi));
      inner += (p.phi < 0 ? ' − ' : ' + ') + (ph !== null ? ph : trim(Math.abs(p.phi) * DEG, 3));
    }
    let s = 'y = ' + (head && head !== '−' ? head + ' ' : head) + 'sin' + (inner === 'x' ? ' x' : '(' + inner + ')');
    if (Math.abs(p.k) > 1e-12) s += (p.k < 0 ? ' − ' : ' + ') + trim(Math.abs(p.k), 2);
    return s;
  }

  const api = {
    PI: PI, DEG: DEG, TAU: TAU,
    mod360: mod360, wrap180: wrap180, multipleOf: multipleOf,
    sinCos: sinCos, unit: unit, exactSin: exactSin, exactCos: exactCos, exactTan: exactTan,
    piFraction: piFraction, piTex: piTex, piText: piText,
    waveY: waveY, waveInfo: waveInfo, firstMax: firstMax, firstRise: firstRise, normalize: normalize,
    curveGap: curveGap, gapSameW: gapSameW,
    superpose: superpose, sumY: sumY, helix: helix,
    randomTarget: randomTarget, TARGET_A: TARGET_A, TARGET_W: TARGET_W, TARGET_K: TARGET_K,
    trim: trim, phaseTex: phaseTex, waveTex: waveTex, waveText: waveText
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TrigCore = api;
})(typeof window !== 'undefined' ? window : this);
