/*
 * doppler-core.js — 都卜勒效應物理核心（與畫面無關，可單獨測試）
 *
 * 單位約定（SI）：
 *   位置 ............ m（俯視圖平面座標 x, y）
 *   速度 ............ m/s
 *   時間 ............ s
 *   頻率 ............ Hz
 *
 * 介質（空氣）靜止，聲速 v。波源 S 與觀察者 O 都做等速直線運動：
 *   S(t) = (src.x + src.vx·t, src.y + src.vy·t)
 *   O(t) = (obs.x + obs.vx·(t − obs.t0), obs.y + obs.vy·(t − obs.t0))
 * 波源從 t = tStart（預設 0）開始發聲，每隔 1/f 發出一個波前；
 * 在 te 發出的波前是以 S(te) 為圓心、半徑 v(t − te) 的圓。
 *
 * 觀察者在 t 時刻聽到的，是波源在「發出時刻」te 送出的聲音（推遲時間）：
 *   |O(t) − S(te)| = v (t − te)
 * 令 u = t − te（聲音在空氣中走的時間）、D = O(t) − S(t)、V_s = 波源速度，
 * 因為 S(te) = S(t) − V_s u，上式成為 u 的二次方程式（精確解，不用近似）：
 *   (|V_s|² − v²) u² + 2 (D·V_s) u + |D|² = 0
 * 次音速（|V_s| < v）時恰有一個正根；超音速時在馬赫錐內有兩個根、錐外沒有根。
 *
 * 觀察者聽到的相位是 φ(t) = f·te(t)，所以頻率 f′ = f · dte/dt。對上式微分得
 *   f′ = f (v − R̂·V_o) / (v − R̂·V_s)
 * 其中 R̂ 是由「發出時的波源位置」S(te) 指向觀察者 O(t) 的單位向量。
 * 令 u_s = R̂·V_s（波源速度朝向觀察者的分量）、u_o = −R̂·V_o（觀察者速度朝向波源的分量），
 * 就是課本的 f′ = f (v + u_o)/(v − u_s)，也就是 f (v ± v_o)/(v ∓ v_s)：互相靠近取上面的符號。
 */
(function (root) {
  'use strict';

  /** 課本公式（共線）：vo > 0 表示觀察者朝波源移動，vs > 0 表示波源朝觀察者移動 */
  function classic(f, v, vo, vs) { return f * (v + vo) / (v - vs); }

  /** 馬赫數 M = v_s / v */
  function machNumber(v, vs) { return vs / v; }

  /** 馬赫角（震波錐的半頂角）：sin θ = v / v_s；次音速時沒有震波，傳回 NaN */
  function machAngle(v, vs) { return vs >= v && vs > 0 ? Math.asin(v / vs) : NaN; }

  /** 運動方向前方的波前間距（波長）λ_前 = (v − v_s)/f；v_s ≥ v 時波前疊在一起，傳回 0 或負值 */
  function wavelengthAhead(f, v, vs) { return (v - vs) / f; }
  /** 運動方向後方的波前間距（波長）λ_後 = (v + v_s)/f */
  function wavelengthBehind(f, v, vs) { return (v + vs) / f; }

  function sourceAt(p, t) {
    return { x: p.src.x + p.src.vx * t, y: p.src.y + p.src.vy * t };
  }
  function observerAt(p, t) {
    const dt = t - (p.obs.t0 || 0);
    return { x: p.obs.x + p.obs.vx * dt, y: p.obs.y + p.obs.vy * dt };
  }
  function tStartOf(p) { return p.tStart == null ? 0 : p.tStart; }

  /**
   * 由「發出時的波源位置指向觀察者」的單位向量 (rx, ry) 求觀察者聽到的頻率。
   * 傳回 { us, uo, fp }；fp 為負代表聲音以相反的時間順序抵達（只有超音速才會發生）。
   */
  function receivedFrequency(f, v, rx, ry, vsx, vsy, vox, voy) {
    const us = rx * vsx + ry * vsy;       // 波源速度朝向觀察者的分量
    const uo = -(rx * vox + ry * voy);    // 觀察者速度朝向波源的分量
    return { us: us, uo: uo, fp: f * (v + uo) / (v - us) };
  }

  /**
   * t 時刻抵達觀察者的所有聲音（推遲時間的精確解）。
   * 傳回陣列（依發出時刻由晚到早排序），每一項：
   *   te 發出時刻、u = t − te 傳播時間、sx, sy 發出時的波源位置、dist = v u 傳播距離、
   *   rx, ry 由 S(te) 指向 O(t) 的單位向量、us, uo 兩個速度分量、fp 觀察到的頻率（可為負）
   */
  function arrivals(p, t) {
    const v = p.v, S = sourceAt(p, t), O = observerAt(p, t);
    const dx = O.x - S.x, dy = O.y - S.y;
    const vsx = p.src.vx, vsy = p.src.vy;
    const A = vsx * vsx + vsy * vsy - v * v;
    const B = 2 * (dx * vsx + dy * vsy);
    const C = dx * dx + dy * dy;
    const uMax = t - tStartOf(p);
    if (!(uMax > 0)) return [];
    const roots = [];
    const eps = 1e-12 * v * v;
    if (Math.abs(A) <= eps) {
      if (B < 0) roots.push(-C / B);       // v_s = v：一次方程式
    } else {
      const disc = B * B - 4 * A * C;
      if (disc >= 0) {
        const sq = Math.sqrt(disc);
        const q = -0.5 * (B + (B >= 0 ? sq : -sq)); // 數值穩定的二次公式
        if (q !== 0) { roots.push(q / A); roots.push(C / q); }
        else roots.push(0);
      }
    }
    const out = [];
    roots.sort(function (a, b) { return a - b; });
    roots.forEach(function (u, i) {
      if (!(u > 1e-12) || u > uMax) return;
      if (i > 0 && Math.abs(u - roots[i - 1]) < 1e-12 * Math.max(1, u)) return; // 重根只算一次
      const sx = S.x - vsx * u, sy = S.y - vsy * u;
      const Rx = O.x - sx, Ry = O.y - sy;
      const d = Math.hypot(Rx, Ry);
      if (!(d > 0)) return;
      const rx = Rx / d, ry = Ry / d;
      const r = receivedFrequency(p.f, v, rx, ry, vsx, vsy, p.obs.vx, p.obs.vy);
      out.push({ te: t - u, u: u, sx: sx, sy: sy, dist: d, rx: rx, ry: ry, us: r.us, uo: r.uo, fp: r.fp });
    });
    return out;
  }

  /** 已發出的波前的發出時刻：te_k = tStart + k/f（k = 0, 1, 2, …，te ≤ t） */
  function emissionTimes(p, t, maxCount) {
    const t0 = tStartOf(p), out = [];
    if (t < t0) return out;
    const n = Math.floor((t - t0) * p.f + 1e-9);
    const k0 = maxCount ? Math.max(0, n - maxCount + 1) : 0;
    for (let k = k0; k <= n; k++) out.push(t0 + k / p.f);
    return out;
  }

  /** t 時刻所有波前：圓心（發出時的波源位置）與半徑 r = v(t − te) */
  function wavefronts(p, t, maxCount) {
    return emissionTimes(p, t, maxCount).map(function (te) {
      const c = sourceAt(p, te);
      return { te: te, cx: c.x, cy: c.y, r: p.v * (t - te) };
    });
  }

  /**
   * 觀察者在 (t1, t2] 之間收到的波前個數（看最晚發出的那一支聲音）：
   * 等於這段時間內抵達的聲音「發出時刻」跨過了幾個 te_k。用來讓畫面在每個波前抵達時閃一下。
   */
  function frontsBetween(p, te1, te2) {
    if (!(te2 > te1)) return 0;
    const t0 = tStartOf(p);
    const k1 = Math.floor((te1 - t0) * p.f + 1e-9), k2 = Math.floor((te2 - t0) * p.f + 1e-9);
    return Math.max(0, k2 - Math.max(k1, -1));
  }

  const api = {
    classic: classic,
    machNumber: machNumber,
    machAngle: machAngle,
    wavelengthAhead: wavelengthAhead,
    wavelengthBehind: wavelengthBehind,
    sourceAt: sourceAt,
    observerAt: observerAt,
    receivedFrequency: receivedFrequency,
    arrivals: arrivals,
    emissionTimes: emissionTimes,
    wavefronts: wavefronts,
    frontsBetween: frontsBetween
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DopplerCore = api;
})(typeof window !== 'undefined' ? window : this);
