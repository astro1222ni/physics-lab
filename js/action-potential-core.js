/*
 * action-potential-core.js — 「神經的動作電位」的生物物理核心（不碰 DOM，Node 與瀏覽器共用）
 *
 * 模型：Hodgkin & Huxley (1952) J. Physiol. 117:500–544，烏賊巨大軸突。
 *   膜電位 V 用現代的正負號（細胞內相對細胞外，mV）；靜止約 −65 mV。
 *   C dV/dt = I_stim − g_Na m³h (V − E_Na) − g_K n⁴ (V − E_K) − g_L (V − E_L)
 *   dx/dt = φ [α_x(V)(1 − x) − β_x(V) x]，x = m、h、n；φ = 3^((T − 6.3)/10)（Q10 = 3）
 *   原始參數（6.3 °C）：C = 1 µF/cm²、g_Na = 120、g_K = 36、g_L = 0.3 mS/cm²；
 *   E_Na = +50、E_K = −77、E_L = −54.387 mV（HH 原文是相對靜止電位的 +115、−12、+10.613 mV）。
 * 單位：時間 ms、電流密度 µA/cm²、電導 mS/cm²、電容 µF/cm²、長度 cm（軸突半徑、長度）。
 *
 * 細胞外離子濃度改變時，用能斯特方程式平移平衡電位：ΔE = (RT/zF) ln(倍數)。
 * 藥物：河豚毒素（TTX）阻斷鈉通道 → g_Na × (1 − 阻斷比例)；四乙銨（TEA）阻斷鉀通道 → g_K × (1 − 阻斷比例)。
 *
 * 傳導（纜線方程式）：(a / 2R_i) ∂²V/∂x² = C ∂V/∂t + I_ion − I_stim，
 *   HH 的軸突半徑 a = 238 µm、軸漿電阻率 R_i = 35.4 Ω·cm；兩端封閉（沒有電流流出）。
 *   數值方法：閘門用指數積分（Rush–Larsen），電壓用半隱式（電導線性化＋三對角矩陣），步長 0.005 ms。
 *   髓鞘是示意：節間段的膜電容與漏電導乘上很小的倍數、沒有鈉鉀通道，只有蘭氏結有 HH 通道。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.APCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- 常數（Hodgkin & Huxley 1952） ----------
  const HH = {
    C: 1.0,          // µF/cm²
    gNa: 120, gK: 36, gL: 0.3,     // mS/cm²
    ENa: 50, EK: -77, EL: -54.387, // mV
    T0: 6.3,         // °C：HH 參數的溫度
    Q10: 3,
    a: 0.0238,       // cm：軸突半徑 238 µm（直徑 476 µm）
    Ri: 35.4         // Ω·cm：軸漿電阻率
  };
  const R_GAS = 8.314462618, F_FARADAY = 96485.33212; // CODATA 2018／2022（SI 定義值相乘）
  const DT = 0.01;   // ms：膜片模擬的基本步長（溫度高時自動再細分）

  /** 溫度係數 φ = Q10^((T − 6.3)/10) */
  function phi(T) { return Math.pow(HH.Q10, (T - HH.T0) / 10); }
  /** RT/F（mV），T 為 °C */
  function rtf(T) { return R_GAS * (T + 273.15) / F_FARADAY * 1000; }

  // ---------- 速率函數（1/ms，6.3 °C） ----------
  // 0/0 的點用泰勒展開避開：x/(1 − e^(−x/k)) → k + x/2
  function vtrap(x, k) {
    const u = x / k;
    if (Math.abs(u) < 1e-6) return k * (1 + u / 2);
    return x / (1 - Math.exp(-u));
  }
  const am = function (V) { return 0.1 * vtrap(V + 40, 10); };
  const bm = function (V) { return 4 * Math.exp(-(V + 65) / 18); };
  const ah = function (V) { return 0.07 * Math.exp(-(V + 65) / 20); };
  const bh = function (V) { return 1 / (1 + Math.exp(-(V + 35) / 10)); };
  const an = function (V) { return 0.01 * vtrap(V + 55, 10); };
  const bn = function (V) { return 0.125 * Math.exp(-(V + 65) / 80); };
  function minf(V) { const a = am(V); return a / (a + bm(V)); }
  function hinf(V) { const a = ah(V); return a / (a + bh(V)); }
  function ninf(V) { const a = an(V); return a / (a + bn(V)); }
  /** 時間常數（ms），已含溫度係數 */
  function taus(V, T) {
    const f = phi(T == null ? HH.T0 : T);
    return { m: 1 / (f * (am(V) + bm(V))), h: 1 / (f * (ah(V) + bh(V))), n: 1 / (f * (an(V) + bn(V))) };
  }

  // ---------- 參數 ----------
  /**
   * 由使用者設定算出實際的模型參數。
   * o.T（°C）、o.ttx、o.tea（0–1 阻斷比例）、o.kOut、o.naOut（細胞外濃度相對正常值的倍數）
   */
  function params(o) {
    o = o || {};
    const T = o.T == null ? HH.T0 : o.T;
    const kOut = o.kOut == null ? 1 : o.kOut, naOut = o.naOut == null ? 1 : o.naOut;
    const ttx = clamp(o.ttx || 0, 0, 1), tea = clamp(o.tea || 0, 0, 1);
    const k = rtf(T);
    return {
      T: T, phi: phi(T), C: HH.C,
      gNa: HH.gNa * (1 - ttx), gK: HH.gK * (1 - tea), gL: HH.gL,
      ENa: HH.ENa + k * Math.log(naOut), EK: HH.EK + k * Math.log(kOut), EL: HH.EL,
      ttx: ttx, tea: tea, kOut: kOut, naOut: naOut
    };
  }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }

  /** 穩態下的膜電流（所有閘門在穩態）：I(V) */
  function steadyCurrent(V, P) {
    const m = minf(V), h = hinf(V), n = ninf(V);
    return P.gNa * m * m * m * h * (V - P.ENa) + P.gK * n * n * n * n * (V - P.EK) + P.gL * (V - P.EL);
  }
  /**
   * 靜止膜電位：穩態電流為 0 的電壓（從 −65 mV 附近找；若有多個根，取最接近 −65 的穩定根）
   */
  function restingPotential(P) {
    // 由下往上掃描，找電流由負變正（穩定）的根
    let best = null, prevV = -110, prevI = steadyCurrent(prevV, P);
    for (let V = -109.5; V <= 30; V += 0.5) {
      const I = steadyCurrent(V, P);
      if (prevI < 0 && I >= 0) {
        let lo = prevV, hi = V;
        for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; if (steadyCurrent(mid, P) < 0) lo = mid; else hi = mid; }
        const r = (lo + hi) / 2;
        if (best === null || Math.abs(r + 65) < Math.abs(best + 65)) best = r;
      }
      prevV = V; prevI = I;
    }
    return best === null ? -65 : best;
  }
  /** 靜止狀態（V 與穩態閘門） */
  function restState(P) {
    const V = restingPotential(P);
    return { V: V, m: minf(V), h: hinf(V), n: ninf(V) };
  }

  // ---------- 膜片（空間鉗制）模擬 ----------
  function deriv(V, m, h, n, I, P, out) {
    const f = P.phi;
    const iNa = P.gNa * m * m * m * h * (V - P.ENa);
    const iK = P.gK * n * n * n * n * (V - P.EK);
    const iL = P.gL * (V - P.EL);
    out[0] = (I - iNa - iK - iL) / P.C;
    out[1] = f * (am(V) * (1 - m) - bm(V) * m);
    out[2] = f * (ah(V) * (1 - h) - bh(V) * h);
    out[3] = f * (an(V) * (1 - n) - bn(V) * n);
  }

  /**
   * 刺激電流（µA/cm²）：stim = { pulses: [{ t0, dur, amp }], step: { t0, amp } }
   */
  function stimAt(stim, t) {
    let I = 0;
    if (stim && stim.pulses) for (let i = 0; i < stim.pulses.length; i++) {
      const p = stim.pulses[i];
      if (t >= p.t0 && t < p.t0 + p.dur) I += p.amp;
    }
    if (stim && stim.step && t >= stim.step.t0 && (stim.step.t1 == null || t < stim.step.t1)) I += stim.step.amp;
    return I;
  }
  /** 刺激的轉折時刻（積分步長要對齊，避免脈衝邊緣誤差） */
  function stimEdges(stim) {
    const e = [];
    if (stim && stim.pulses) stim.pulses.forEach(function (p) { e.push(p.t0, p.t0 + p.dur); });
    if (stim && stim.step) { e.push(stim.step.t0); if (stim.step.t1 != null) e.push(stim.step.t1); }
    return e.filter(function (x) { return x > 0; }).sort(function (a, b) { return a - b; });
  }

  /**
   * 膜片模擬（RK4；步長 0.01 ms，溫度高時再細分；刺激的邊緣都落在步長上）
   * 傳回每 every 毫秒一筆的紀錄：t, V, m, h, n, I（刺激）, iNa, iK, iL
   */
  function simulate(P, stim, tEnd, opt) {
    opt = opt || {};
    const every = opt.every || 0.02;
    const s0 = opt.init || restState(P);
    let V = s0.V, m = s0.m, h = s0.h, n = s0.n;
    const sub = Math.max(1, Math.ceil(P.phi / 2.5));
    const edges = stimEdges(stim);
    const rec = { t: [], V: [], m: [], h: [], n: [], I: [], iNa: [], iK: [], iL: [], every: every, P: P, stim: stim, rest: s0.V };
    const k1 = [0, 0, 0, 0], k2 = [0, 0, 0, 0], k3 = [0, 0, 0, 0], k4 = [0, 0, 0, 0];
    function push(t) {
      rec.t.push(t); rec.V.push(V); rec.m.push(m); rec.h.push(h); rec.n.push(n);
      rec.I.push(stimAt(stim, t));
      rec.iNa.push(P.gNa * m * m * m * h * (V - P.ENa));
      rec.iK.push(P.gK * n * n * n * n * (V - P.EK));
      rec.iL.push(P.gL * (V - P.EL));
    }
    let t = 0, nextRec = 0, ei = 0;
    push(0); nextRec = every;
    const tol = 1e-9;
    while (t < tEnd - tol) {
      // 這一步的終點：不超過下一個刺激邊緣、不超過下一筆紀錄
      let h0 = DT / sub;
      while (ei < edges.length && edges[ei] <= t + tol) ei++;
      if (ei < edges.length && edges[ei] < t + h0 - tol) h0 = edges[ei] - t;
      if (nextRec < t + h0 - tol) h0 = nextRec - t;
      if (t + h0 > tEnd) h0 = tEnd - t;
      const I = stimAt(stim, t + h0 * 0.5); // 刺激在一步之內不變（邊緣已對齊）
      // 很強又很久的超極化電流會把膜電位壓到 −200 mV 以下，閘門速率變得極快（β_m 上萬 /ms），
      // RK4 遇到這種「僵硬」的方程會發散成非數值。這時改用和纜線相同的穩定算法：
      // 閘門用指數積分（Rush–Larsen），電壓用電導線性化的半隱式步（無條件穩定）。
      // 一般範圍（最快的閘門速率 × 步長 ≤ 2）照舊用 RK4，結果完全不變。
      const f = P.phi;
      const rm = am(V) + bm(V), rh = ah(V) + bh(V), rn = an(V) + bn(V);
      if (f * Math.max(rm, rh, rn) * h0 > 2) {
        m = am(V) / rm + (m - am(V) / rm) * Math.exp(-f * rm * h0);
        h = ah(V) / rh + (h - ah(V) / rh) * Math.exp(-f * rh * h0);
        n = an(V) / rn + (n - an(V) / rn) * Math.exp(-f * rn * h0);
        const gna = P.gNa * m * m * m * h, gk = P.gK * n * n * n * n;
        V = (P.C * V / h0 + I + gna * P.ENa + gk * P.EK + P.gL * P.EL) / (P.C / h0 + gna + gk + P.gL);
        t += h0;
        if (t >= nextRec - tol) { push(Math.round(t / every) * every); nextRec += every; }
        continue;
      }
      deriv(V, m, h, n, I, P, k1);
      deriv(V + 0.5 * h0 * k1[0], m + 0.5 * h0 * k1[1], h + 0.5 * h0 * k1[2], n + 0.5 * h0 * k1[3], I, P, k2);
      deriv(V + 0.5 * h0 * k2[0], m + 0.5 * h0 * k2[1], h + 0.5 * h0 * k2[2], n + 0.5 * h0 * k2[3], I, P, k3);
      deriv(V + h0 * k3[0], m + h0 * k3[1], h + h0 * k3[2], n + h0 * k3[3], I, P, k4);
      V += h0 / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
      m += h0 / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
      h += h0 / 6 * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
      n += h0 / 6 * (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3]);
      t += h0;
      if (t >= nextRec - tol) { push(Math.round(t / every) * every); nextRec += every; }
    }
    return rec;
  }

  // ---------- 分析 ----------
  const SPIKE_V = -20;   // 判定動作電位：膜電位往上越過 −20 mV（之後降到 −25 mV 以下才算結束）
  const REGEN_I = -30;   // 而且這段期間膜自己的淨離子電流曾經是內流 30 µA/cm² 以上（再生性的鈉內流），
                         // 只靠刺激電流硬推上去的被動去極化不算
  /** 找出動作電位：[{ i, t, peak, tPeak, iPeak }] */
  function spikes(rec) {
    const out = [];
    let above = false, cur = null, iUp = 0, minI = 0;
    for (let i = 0; i < rec.V.length; i++) {
      const v = rec.V[i];
      const ion = rec.iNa[i] + rec.iK[i] + rec.iL[i];
      if (!above) {
        if (v < -60) { iUp = i; minI = 0; }          // 上升段從最後一次低於 −60 mV 算起
        else if (ion < minI) minI = ion;
        if (v >= SPIKE_V) { above = true; cur = { i: i, t: rec.t[i], peak: v, tPeak: rec.t[i], iPeak: i, minI: minI }; }
      } else {
        if (v > cur.peak) { cur.peak = v; cur.tPeak = rec.t[i]; cur.iPeak = i; }
        if (ion < cur.minI) cur.minI = ion;
        if (v < SPIKE_V - 5) { above = false; if (cur.minI <= REGEN_I) out.push(cur); cur = null; iUp = i; minI = 0; }
      }
    }
    if (cur && cur.minI <= REGEN_I) out.push(cur);
    return out;
  }
  /** 一個動作電位的形狀：振幅（峰值 − 靜止）、半高寬、最大上升速率 */
  function spikeShape(rec, sp) {
    const rest = rec.rest, half = rest + (sp.peak - rest) / 2;
    let i0 = sp.iPeak, i1 = sp.iPeak;
    while (i0 > 0 && rec.V[i0] > half) i0--;
    while (i1 < rec.V.length - 1 && rec.V[i1] > half) i1++;
    const lerp = function (i, j) { const a = rec.V[i], b = rec.V[j]; return rec.t[i] + (half - a) / (b - a) * (rec.t[j] - rec.t[i]); };
    const tUp = rec.V[i0] <= half ? lerp(i0, i0 + 1) : rec.t[i0];
    const tDn = rec.V[i1] <= half ? lerp(i1 - 1, i1) : rec.t[i1];
    let dvdt = 0;
    for (let i = Math.max(1, i0 - 5); i <= sp.iPeak; i++) dvdt = Math.max(dvdt, (rec.V[i] - rec.V[i - 1]) / (rec.t[i] - rec.t[i - 1]));
    // 後過極化：峰值之後的最低點
    let vmin = sp.peak, tmin = sp.tPeak;
    for (let i = sp.iPeak; i < rec.V.length; i++) { if (rec.V[i] < vmin) { vmin = rec.V[i]; tmin = rec.t[i]; } if (rec.t[i] > sp.tPeak + 30) break; }
    return { amp: sp.peak - rest, halfWidth: tDn - tUp, dvdt: dvdt, ahp: vmin, tAhp: tmin };
  }
  /** 整次紀錄的摘要 */
  function analyze(rec) {
    const sp = spikes(rec);
    let vmax = -Infinity, vmin = Infinity;
    for (let i = 0; i < rec.V.length; i++) { if (rec.V[i] > vmax) vmax = rec.V[i]; if (rec.V[i] < vmin) vmin = rec.V[i]; }
    const shape = sp.length ? spikeShape(rec, sp[0]) : null;
    // 發放頻率：持續電流時，用最後幾個動作電位的平均間隔（至少 3 個才算反覆發放）
    let rate = 0;
    if (sp.length >= 3) {
      const k = Math.min(sp.length - 1, 4);
      rate = 1000 * k / (sp[sp.length - 1].tPeak - sp[sp.length - 1 - k].tPeak);
    }
    return { spikes: sp, n: sp.length, vmax: vmax, vmin: vmin, rise: vmax - rec.rest, rest: rec.rest, shape: shape, rate: rate };
  }

  /** 第 k 個脈衝有沒有引發動作電位（脈衝開始後 tWin 毫秒內出現上越 −20 mV） */
  function firedBy(rec, sp, pulse, tWin) {
    for (let i = 0; i < sp.length; i++) if (sp[i].t >= pulse.t0 && sp[i].t <= pulse.t0 + pulse.dur + tWin) return sp[i];
    return null;
  }

  // ---------- 閾值 ----------
  const T_PULSE = 1;  // 單一脈衝在 1 ms 時開始
  /** 單一脈衝能不能引發動作電位 */
  function fires(P, amp, dur, init) {
    const stim = { pulses: [{ t0: T_PULSE, dur: dur, amp: amp }] };
    const win = T_PULSE + dur + 12 / Math.sqrt(P.phi) + 6;
    const rec = simulate(P, stim, win, { every: Math.min(0.02, 0.05 / P.phi), init: init });
    return spikes(rec).length > 0;
  }
  /**
   * 由小到大找「會成立」的最小值：從 0.25 起每次 × 1.5 找到第一個成立的上界，再二分到相對誤差 rel。
   * 太強的刺激可能把膜電位直接推過鈉平衡電位而看不出動作電位，所以不從最大值往下找。
   */
  function searchMin(test, maxAmp, rel) {
    let lo = 0, probe = 0.25;
    while (probe <= maxAmp && !test(probe)) { lo = probe; probe *= 1.5; }
    if (probe > maxAmp) { if (lo < maxAmp && test(maxAmp)) probe = maxAmp; else return Infinity; }
    let hi = probe;
    for (let k = 0; k < 60 && (hi - lo) > rel * hi; k++) {
      const mid = (lo + hi) / 2;
      if (test(mid)) hi = mid; else lo = mid;
    }
    return hi;
  }
  /**
   * 單一脈衝（寬 dur ms）引發動作電位的最小強度（µA/cm²）；maxAmp 以內都不行時傳回 Infinity。相對誤差 1e-5。
   */
  function threshold(P, dur, maxAmp) {
    const init = restState(P);
    return searchMin(function (a) { return fires(P, a, dur, init); }, maxAmp || 400, 1e-5);
  }
  /**
   * 成對脈衝：第一個脈衝 amp1（要能引發動作電位）之後 interval ms 開始的第二個脈衝，引發第二個動作電位的最小強度。
   * 傳回 Infinity 表示 maxAmp 以內都引發不了（絕對不反應期）。
   */
  function pairedThreshold(P, amp1, dur, interval, maxAmp) {
    const init = restState(P);
    const test = function (a2) {
      const p1 = { t0: T_PULSE, dur: dur, amp: amp1 }, p2 = { t0: T_PULSE + interval, dur: dur, amp: a2 };
      const rec = simulate(P, { pulses: [p1, p2] }, T_PULSE + interval + dur + 12 / Math.sqrt(P.phi) + 6, { every: Math.min(0.02, 0.05 / P.phi), init: init });
      const sp = spikes(rec);
      return !!(firedBy(rec, sp, p1, 6) && sp.some(function (s) { return s.t >= p2.t0; }));
    };
    return searchMin(test, maxAmp || 400, 1e-3);
  }

  // ---------- 纜線（傳導） ----------
  /**
   * 建立一條軸突。o.length（cm，預設 5）、o.diam（µm，預設 476）、o.myelin（布林）、o.P（params）、o.dx（cm，選填）
   * 髓鞘（示意）：每 o.nodeGap cm（預設 0.5）一個蘭氏結（1 段），節間段膜電容 × o.cMy、漏電導 × o.gMy（預設都是 1/200）、沒有鈉鉀通道。
   */
  function makeCable(o) {
    const P = o.P || params({});
    const L = o.length || 5;
    const diam = o.diam || 476;
    const a = diam * 1e-4 / 2; // cm
    // 空間步長：直徑小時波形較窄，步長跟著縮小（√a），但不小於 0.125 mm（細軸突的誤差仍在 0.5% 以內）
    const dx = o.dx || Math.max(0.0125, 0.025 * Math.sqrt(diam / 476));
    const N = Math.round(L / dx) + 1;
    const myelin = !!o.myelin;
    const nodeGap = o.nodeGap || 0.5;
    const cMy = o.cMy == null ? 0.005 : o.cMy, gMy = o.gMy == null ? 0.005 : o.gMy;
    const node = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      if (!myelin) node[i] = 1;
      else { const x = i * dx; const k = Math.round(x / nodeGap); node[i] = Math.abs(x - k * nodeGap) < dx * 0.5 ? 1 : 0; }
    }
    // 兩端一定是可興奮的（刺激點）
    node[0] = 1; node[N - 1] = 1;
    const rest = restState(P);
    const V = new Float64Array(N).fill(rest.V), m = new Float64Array(N).fill(rest.m), h = new Float64Array(N).fill(rest.h), n = new Float64Array(N).fill(rest.n);
    // 節間段的靜止電位：沒有鈉鉀通道，只有漏電流 → E_L；為了避免一開始就有電流流動，所有段都從同一個電壓出發，
    // 節間段的漏電平衡電位取同一個靜止電位（示意模型，見頁面說明）
    const Ci = new Float64Array(N), gLi = new Float64Array(N);
    for (let i = 0; i < N; i++) { Ci[i] = node[i] ? P.C : P.C * cMy; gLi[i] = node[i] ? P.gL : P.gL * gMy; }
    const cab = {
      P: P, L: L, diam: diam, a: a, dx: dx, N: N, myelin: myelin, node: node, Ci: Ci, gLi: gLi,
      V: V, m: m, h: h, n: n, t: 0, rest: rest.V,
      ELmy: rest.V,
      Ri: o.Ri || HH.Ri,
      D: a / (2 * (o.Ri || HH.Ri)) * 1000, // a/(2Ri) 的單位是 1/Ω；乘 1000 讓 mV、µA、ms、µF 一致（見下）
      stims: [],                 // [{ x0, x1, t0, dur, amp }]：x 為 cm
      dt: o.dt || Math.min(0.005, 0.02 / P.phi), // 溫度高時閘門變快，步長跟著縮小
      // 每一段的紀錄：第一次越過 −20 mV 的時刻、最高電壓
      tCross: new Float64Array(N).fill(NaN), vPeak: new Float64Array(N).fill(-Infinity),
      nCross: new Uint16Array(N), up: new Uint8Array(N), // 每一段往上越過 −20 mV 的次數（降到 −40 mV 以下才算下一次）
      // 三對角係數暫存
      _a: new Float64Array(N), _b: new Float64Array(N), _c: new Float64Array(N), _d: new Float64Array(N), _cp: new Float64Array(N), _dp: new Float64Array(N)
    };
    return cab;
  }
  /*
   * 單位說明：∂²V/∂x² 的係數 a/(2 Ri)：a 以 cm、Ri 以 Ω·cm → 1/Ω。乘上 mV/cm² 得 mA/cm² … 再換成 µA/cm²：× 1000。
   * 所以 C (µF/cm²) dV/dt (mV/ms) = D ∂²V/∂x² (µA/cm²)，D = 1000 · a / (2 Ri)。
   */

  /** 纜線前進一步（dt ms） */
  function cableStep(cab) {
    const P = cab.P, N = cab.N, dt = cab.dt, f = P.phi;
    const V = cab.V, m = cab.m, h = cab.h, n = cab.n, node = cab.node;
    const k = cab.D / (cab.dx * cab.dx);
    const A = cab._a, B = cab._b, Cc = cab._c, Dd = cab._d;
    const tm = cab.t + dt * 0.5;
    // 1. 閘門：指數積分（以目前的 V）
    for (let i = 0; i < N; i++) {
      if (!node[i]) continue;
      const v = V[i];
      let a = am(v), b = bm(v), s = f * (a + b), inf = a / (a + b);
      m[i] = inf + (m[i] - inf) * Math.exp(-dt * s);
      a = ah(v); b = bh(v); s = f * (a + b); inf = a / (a + b);
      h[i] = inf + (h[i] - inf) * Math.exp(-dt * s);
      a = an(v); b = bn(v); s = f * (a + b); inf = a / (a + b);
      n[i] = inf + (n[i] - inf) * Math.exp(-dt * s);
    }
    // 2. 電壓：C (V' − V)/dt = k (V'_{i−1} − 2V'_i + V'_{i+1}) − G (V' − E) + I
    for (let i = 0; i < N; i++) {
      let G, GE;
      if (node[i]) {
        const gna = P.gNa * m[i] * m[i] * m[i] * h[i], gk = P.gK * n[i] * n[i] * n[i] * n[i], gl = cab.gLi[i];
        G = gna + gk + gl; GE = gna * P.ENa + gk * P.EK + gl * P.EL;
      } else { G = cab.gLi[i]; GE = G * cab.ELmy; }
      let I = 0;
      const x = i * cab.dx;
      for (let s = 0; s < cab.stims.length; s++) {
        const st = cab.stims[s];
        if (tm >= st.t0 && tm < st.t0 + st.dur && x >= st.x0 - 1e-9 && x <= st.x1 + 1e-9) I += st.amp;
      }
      const c = cab.Ci[i] / dt;
      const left = i > 0 ? k : 0, right = i < N - 1 ? k : 0;
      A[i] = -left; Cc[i] = -right;
      B[i] = c + left + right + G;
      Dd[i] = c * V[i] + GE + I;
    }
    // 三對角求解（Thomas 演算法）
    const cp = cab._cp, dp = cab._dp;
    cp[0] = Cc[0] / B[0]; dp[0] = Dd[0] / B[0];
    for (let i = 1; i < N; i++) {
      const den = B[i] - A[i] * cp[i - 1];
      cp[i] = Cc[i] / den; dp[i] = (Dd[i] - A[i] * dp[i - 1]) / den;
    }
    V[N - 1] = dp[N - 1];
    for (let i = N - 2; i >= 0; i--) V[i] = dp[i] - cp[i] * V[i + 1];
    cab.t += dt;
    // 3. 紀錄
    for (let i = 0; i < N; i++) {
      if (V[i] > cab.vPeak[i]) cab.vPeak[i] = V[i];
      if (!cab.up[i] && V[i] >= SPIKE_V) {
        cab.up[i] = 1; cab.nCross[i]++;
        if (isNaN(cab.tCross[i])) cab.tCross[i] = cab.t;
      } else if (cab.up[i] && V[i] < -40) cab.up[i] = 0;
    }
  }
  /** 前進到時間 t（ms） */
  function cableRun(cab, tEnd) { while (cab.t < tEnd - 1e-9) cableStep(cab); }
  /** 某位置（cm）最近的段 */
  function cableIndex(cab, x) { return Math.max(0, Math.min(cab.N - 1, Math.round(x / cab.dx))); }
  /** 在位置 x 線性內插的越過時刻（ms），沒越過時 NaN */
  function crossTime(cab, x) {
    const u = x / cab.dx, i = Math.floor(u), f = u - i;
    if (i >= cab.N - 1) return cab.tCross[cab.N - 1];
    const a = cab.tCross[i], b = cab.tCross[i + 1];
    if (isNaN(a) || isNaN(b)) return NaN;
    return a + (b - a) * f;
  }
  /**
   * 傳導速度（m/s）：兩個記錄點越過 −20 mV 的時間差。x 單位 cm；cm/ms × 10 = m/s。
   */
  function velocity(cab, x1, x2) {
    const t1 = crossTime(cab, x1), t2 = crossTime(cab, x2);
    if (isNaN(t1) || isNaN(t2) || t1 === t2) return NaN;
    return Math.abs(x2 - x1) / Math.abs(t2 - t1) * 10;
  }
  /** 從 x0 處刺激、量 x1 → x2 的速度（測試與任務證明用） */
  function measureVelocity(o) {
    const cab = makeCable(o);
    const x0 = o.x0 == null ? 0 : o.x0;
    cab.stims.push({ x0: Math.max(0, x0 - 0.05), x1: Math.min(cab.L, x0 + 0.05), t0: 0.5, dur: o.stimDur || 0.5, amp: o.stimAmp || 150 });
    const x1 = o.x1 == null ? cab.L * 0.3 : o.x1, x2 = o.x2 == null ? cab.L * 0.7 : o.x2;
    const tMax = o.tMax || 40;
    while (cab.t < tMax) {
      cableStep(cab);
      if (!isNaN(cab.tCross[cableIndex(cab, x2)]) && cab.t > cab.tCross[cableIndex(cab, x2)] + 0.2) break;
    }
    return { v: velocity(cab, x1, x2), cab: cab };
  }

  /** 纜線是否還有活動（有任何一段高於 −50 mV） */
  function cableActive(cab) {
    for (let i = 0; i < cab.N; i++) if (cab.V[i] > -50) return true;
    return false;
  }
  /**
   * 纜線一次刺激後的摘要：衝動到達兩端沒有、有沒有對撞（兩道衝動迎面相遇而一起消失）。
   * 對撞：越過時刻 tCross(x) 在兩個刺激點之間有內部極大值，而且沒有任何一段被興奮兩次。
   */
  function cableSummary(cab) {
    const N = cab.N, tc = cab.tCross;
    let twice = false, crossed = 0;
    for (let i = 0; i < N; i++) { if (cab.nCross[i] > 1) twice = true; if (!isNaN(tc[i])) crossed++; }
    const sx = cab.stims.map(function (s) { return (s.x0 + s.x1) / 2; }).sort(function (a, b) { return a - b; });
    let collided = false, xMeet = NaN;
    if (sx.length >= 2) {
      const i0 = cableIndex(cab, sx[0]), i1 = cableIndex(cab, sx[sx.length - 1]);
      let best = -Infinity, ib = -1;
      for (let i = i0 + 1; i < i1; i++) if (!isNaN(tc[i]) && tc[i] > best) { best = tc[i]; ib = i; }
      // 內部極大值：比兩個刺激點都晚、而且兩個刺激點之間每一段都有被興奮
      let all = true;
      for (let i = i0; i <= i1; i++) if (isNaN(tc[i])) { all = false; break; }
      if (all && ib > i0 + 2 && ib < i1 - 2 && best > tc[i0] + 0.05 && best > tc[i1] + 0.05) { collided = !twice; xMeet = ib * cab.dx; }
    }
    return { left: !isNaN(tc[0]), right: !isNaN(tc[N - 1]), all: crossed === N, crossed: crossed, twice: twice, collided: collided, xMeet: xMeet };
  }

  return {
    HH: HH, DT: DT, SPIKE_V: SPIKE_V, T_PULSE: T_PULSE,
    phi: phi, rtf: rtf, params: params,
    am: am, bm: bm, ah: ah, bh: bh, an: an, bn: bn, minf: minf, hinf: hinf, ninf: ninf, taus: taus,
    steadyCurrent: steadyCurrent, restingPotential: restingPotential, restState: restState,
    stimAt: stimAt, simulate: simulate, spikes: spikes, spikeShape: spikeShape, analyze: analyze, firedBy: firedBy,
    fires: fires, threshold: threshold, pairedThreshold: pairedThreshold,
    makeCable: makeCable, cableStep: cableStep, cableRun: cableRun, cableIndex: cableIndex, crossTime: crossTime,
    velocity: velocity, measureVelocity: measureVelocity, cableActive: cableActive, cableSummary: cableSummary, searchMin: searchMin
  };
});
