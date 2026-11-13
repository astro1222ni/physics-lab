/*
 * phase-diagram.js — 「相圖：三相點與臨界點」的頁面程式（相圖、密閉汽缸示意圖、路徑、圖表、紀錄表、任務事件）
 * 化學核心在 js/phase-diagram-core.js（PDCore：溫度 K、壓力 Pa）。相變與任務事件由 PDCore.tracker 判定，
 * 任務證明腳本 tools/mission-proofs/phase-diagram.js 用的是同一個追蹤器。
 *
 * 任務事件（只在使用者操作過之後送出）：
 *   'cross'、'around'、'clap'、'hess'：由追蹤器產生（內容見 js/missions/phase-diagram.js 開頭）
 *   'state'：使用者拖曳、移動滑桿、打字、按方向鍵或路徑走動之後的狀態（路徑每 0.3 秒一次、停下時一次）
 * 生活例子與換物質是「瞬間移動」，不算相變、不送事件。
 */
(function () {
  'use strict';
  const C = window.PDCore, LD = window.LabDraw;
  if (!C || !LD) return;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const reducedMotion = LD.reducedMotion();
  const ATM = C.ATM, S = C.SUBS, K0 = 273.15;
  const FONT = LD.FONT;

  // ======================= 數字格式 =======================
  function num(x, d) {
    if (x == null || !isFinite(x)) return '—';
    const s = (+x).toFixed(d == null ? 0 : d);
    return s.charAt(0) === '-' ? (/^-0(\.0*)?$/.test(s) ? s.slice(1) : '−' + s.slice(1)) : s;
  }
  function sigf(x, sig) {
    if (x == null || !isFinite(x)) return '—';
    if (x === 0) return '0';
    const e = Math.floor(Math.log10(Math.abs(x)));
    return num(x, Math.max(0, Math.min(8, (sig || 3) - 1 - e)));
  }
  function sciParts(x, sig) {
    if (x == null || !isFinite(x) || x === 0) return { m: x === 0 ? '0' : '—', e: null };
    const e = Math.floor(Math.log10(Math.abs(x)));
    if (e >= -3 && e < 5) return { m: sigf(x, sig || 3), e: null };
    const m = x / Math.pow(10, e);
    if (Math.abs(+m.toFixed((sig || 3) - 1)) >= 10) return sciParts(Math.sign(x) * Math.pow(10, e + 1), sig);
    return { m: num(m, (sig || 3) - 1), e: e };
  }
  function sciHTML(x, sig) { const p = sciParts(x, sig); return p.e == null ? p.m : p.m + ' × 10<sup>' + num(p.e, 0) + '</sup>'; }
  function sciTxt(x, sig) { const p = sciParts(x, sig); return p.e == null ? p.m : p.m + ' × 10^' + num(p.e, 0); }
  /** 壓力：自動選 Pa、kPa、MPa */
  function pTxt(P, sig) {
    if (!isFinite(P)) return '—';
    if (P >= 1e6) return sigf(P / 1e6, sig || 4) + ' MPa';
    if (P >= 1e3) return sigf(P / 1e3, sig || 4) + ' kPa';
    return sigf(P, sig || 3) + ' Pa';
  }
  function atmHTML(P) { return sciHTML(P / ATM, 3) + ' atm'; }
  function cTxt(Tk, d) { return num(Tk - K0, d == null ? 1 : d) + ' °C'; }

  // ======================= 名稱 =======================
  const SUBN = { water: ['水', 'water'], co2: ['二氧化碳', 'carbon dioxide'], iodine: ['碘', 'iodine'] };
  const FORM = { water: 'H<sub>2</sub>O', co2: 'CO<sub>2</sub>', iodine: 'I<sub>2</sub>' };
  const FORMT = { water: 'H2O', co2: 'CO2', iodine: 'I2' };
  function subName(id, cap) { const n = T(SUBN[id][0], SUBN[id][1]); return cap ? n.charAt(0).toUpperCase() + n.slice(1) : n; }
  const PHN = { solid: ['固體', 'solid'], liquid: ['液體', 'liquid'], gas: ['氣體', 'gas'], sc: ['超臨界流體', 'supercritical fluid'] };
  function phName(p, cap) { const n = T(PHN[p][0], PHN[p][1]); return cap ? n.charAt(0).toUpperCase() + n.slice(1) : n; }
  const KN = { melt: ['熔化', 'melting'], freeze: ['凝固', 'freezing'], boil: ['汽化（沸騰）', 'boiling'], condense: ['凝結（液化）', 'condensation'],
    sublime: ['昇華', 'sublimation'], deposit: ['凝華', 'deposition'] };
  function kindName(k) { return k && KN[k] ? T(KN[k][0], KN[k][1]) : '—'; }
  const MODEN = { heat: ['等壓加熱', 'heating'], cool: ['等壓冷卻', 'cooling'], press: ['等溫加壓', 'compression'], depress: ['等溫減壓', 'expansion'], drag: ['拖曳', 'drag'] };
  function modeName(m) { return T(MODEN[m][0], MODEN[m][1]); }
  const LINEN = { sub: ['昇華線', 'sublimation line'], vap: ['蒸氣壓曲線', 'vapour-pressure line'], melt: ['熔化線', 'melting line'] };

  // ======================= 顏色 =======================
  let col = {};
  function readColors() {
    const c = LD.c, dk = LD.dark;
    col = {
      text: c.text, muted: c.muted, border: c.border, grid: c.grid, accent: c.accent, bg: c['canvas-bg'], surface: c.surface,
      pos: c.pos, neg: c.neg, probe: c.probe, equi: c.equi, dk: dk,
      ph: { solid: dk ? '#9cc6ea' : '#5f93c0', liquid: dk ? '#5b9bff' : '#2f6fd0', gas: dk ? '#f0b25a' : '#cf7f12', sc: dk ? '#c08ae8' : '#8e4fc0' },
      line: { sub: dk ? '#a9c9e6' : '#3d6f99', vap: dk ? '#6aa2ff' : '#2456b0', melt: dk ? '#5cc2a8' : '#16705f' },
      sub: { water: dk ? '#6aa2ff' : '#2f6fd0', co2: dk ? '#a3b8b0' : '#4f6c62', iodine: dk ? '#c08ae8' : '#7d3ab8' },
      atom: { O: '#e0483a', H: dk ? '#e8ecf0' : '#f6f8fa', C: dk ? '#8f99a3' : '#4a4f55', I: dk ? '#a875e0' : '#7d3ab8' },
      metal: dk ? '#8a96a0' : '#9aa6b0'
    };
  }
  function tempColor(Tk) {
    const u = Math.max(0, Math.min(1, (Tk - 200) / 500));
    return u < 0.2 ? LD.mix('#3f7fd6', '#8aa0b0', u / 0.2) : LD.mix('#8aa0b0', '#d8452f', (u - 0.2) / 0.8);
  }

  // ======================= 狀態 =======================
  const DEF = { water: [K0 + 25, ATM], co2: [K0 - 90, ATM], iodine: [K0 + 25, ATM] };
  const st = { sub: 'water', T: DEF.water[0], P: DEF.water[1], tab: 'cc', path: null, snap: true };
  const tr = C.tracker();
  tr.teleport(st.sub, st.T, st.P);
  let acted = false;
  let trail = [];
  let pause = null;          // 路徑越過界線時在線上停一下：{ t0, dur, from, to, kind, beyond }
  let lastStateEmit = 0;
  let syncing = false;
  let statusBase = '';

  const cv = $('cv'), ctx = cv.getContext('2d');
  const gcv = $('gcv'), gctx = gcv.getContext('2d');
  const elT = $('temp'), elP = $('pres'), elMass = $('mass'), elArea = $('area');
  let G = null, dpr = 1;
  function fsScale() { const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fs')); return isFinite(v) && v > 0 ? v : 1; }

  // ======================= 滑桿 =======================
  function Tr() { return S[st.sub]; }
  function registerP() {
    const s = Tr(), lo = s.Pmin / 1000, hi = s.Pmax / 1000, L = Math.log(hi / lo);
    if (window.LabNum) window.LabNum.register(elP, {
      toValue: function (pos) { return lo * Math.exp(L * pos / 1000); },
      toPos: function (v) { return Math.round(1000 * Math.log(v / lo) / L); },
      min: lo, max: hi, decimals: 6
    });
  }
  function valT() { return (window.LabNum ? window.LabNum.value(elT) : +elT.value) + K0; }
  function valP() { return (window.LabNum ? window.LabNum.value(elP) : +elP.value) * 1000; }
  function syncSliders() {
    syncing = true;
    const s = Tr();
    const tc = Math.round((st.T - K0) * 100) / 100, pk = st.P / 1000;
    if (window.LabNum) { window.LabNum.set(elT, Math.max(s.Tmin - K0, Math.min(s.Tmax - K0, tc))); window.LabNum.set(elP, Math.max(s.Pmin / 1000, Math.min(s.Pmax / 1000, pk))); }
    else { elT.value = tc; elP.value = Math.round(1000 * Math.log(st.P / s.Pmin) / Math.log(s.Pmax / s.Pmin)); }
    syncing = false;
    refreshOutputs();
  }
  function refreshOutputs() {
    $('tempo').textContent = num(valT() - K0, 2) + ' °C';
    const pk = valP() / 1000;
    $('preso').textContent = (pk >= 1e4 ? num(pk, 0) : sigf(pk, 4)) + ' kPa';
  }
  function setRanges() {
    const s = Tr();
    syncing = true;
    if (window.LabNum) window.LabNum.clear(elT);
    elT.min = String(s.Tmin - K0); elT.max = String(s.Tmax - K0);
    registerP();
    syncing = false;
  }

  // ======================= 相、共存 =======================
  function lineNow() { return pause ? null : C.lineOf(st.sub, st.T, st.P); }
  /** 汽缸裡的組成：[{ ph, f }]，由下往上排（密度大的在下面；冰浮在水上） */
  function composition() {
    if (pause) {
      const u = Math.min(1, (now() - pause.t0) / pause.dur);
      return order([{ ph: pause.from, f: 1 - u }, { ph: pause.to, f: u }]);
    }
    const line = lineNow();
    if (line === 'triple') return order([{ ph: 'solid', f: 1 / 3 }, { ph: 'liquid', f: 1 / 3 }, { ph: 'gas', f: 1 / 3 }]);
    const faces = C.lineFaces(line);
    if (faces) return order(faces.map(function (p) { return { ph: p, f: 0.5 }; }));
    return [{ ph: C.phase(st.sub, st.T, st.P), f: 1 }];
  }
  function order(list) {
    const rank = st.sub === 'water' ? { liquid: 0, solid: 1, sc: 2, gas: 3 } : { solid: 0, liquid: 1, sc: 2, gas: 3 };
    return list.filter(function (x) { return x.f > 0.001; }).sort(function (a, b) { return rank[a.ph] - rank[b.ph]; });
  }
  /** 液、氣交界的明顯程度（0–1）：依飽和密度差；碘用標度律 */
  function contrast() {
    const s = Tr();
    if (st.T >= s.Tc) return 0;
    const d = C.satDensity(st.sub, Math.max(s.Tt, st.T));
    if (d) return Math.min(1, Math.pow((d.L - d.V) / (d.L + d.V), 0.8));
    return Math.min(1, 1.25 * Math.pow(1 - st.T / s.Tc, 0.33));
  }
  function nearCritical() {
    const s = Tr(), a = Math.abs(st.T / s.Tc - 1), b = Math.abs(Math.log(st.P / s.pc));
    return Math.max(0, 1 - Math.max(a / 0.015, b / 0.12));
  }

  // ======================= 版面 =======================
  function layout() {
    const w = cv.clientWidth || 600, fs = fsScale();
    const narrow = w < 640;
    let H, d, c;
    if (narrow) {
      const dh = Math.round(Math.min(400, Math.max(280, w * 0.82)));
      const chh = 250;
      H = dh + chh;
      d = { x: 0, y: 0, w: w, h: dh }; c = { x: 0, y: dh, w: w, h: chh };
    } else {
      H = 470;
      const dw = Math.round(w * 0.63);
      d = { x: 0, y: 0, w: dw, h: H }; c = { x: dw, y: 0, w: w - dw, h: H };
    }
    const pl = d.x + Math.round(56 * fs), pr = d.x + d.w - 12, pt = d.y + 14, pb = d.y + d.h - Math.round(42 * fs);
    G = { w: w, h: H, narrow: narrow, d: d, c: c, pl: pl, pr: pr, pt: pt, pb: pb, fs: fs };
    cv.style.height = H + 'px';
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(w * dpr); cv.height = Math.round(H * dpr);
    bgKey = '';
  }
  function X(Tk) { const s = Tr(); return G.pl + (Tk - s.Tmin) / (s.Tmax - s.Tmin) * (G.pr - G.pl); }
  function Y(P) { const s = Tr(); return G.pb - Math.log(P / s.Pmin) / Math.log(s.Pmax / s.Pmin) * (G.pb - G.pt); }
  function invX(x) { const s = Tr(); return s.Tmin + (x - G.pl) / (G.pr - G.pl) * (s.Tmax - s.Tmin); }
  function invY(y) { const s = Tr(); return s.Pmin * Math.exp((G.pb - y) / (G.pb - G.pt) * Math.log(s.Pmax / s.Pmin)); }
  function niceStep(range, n) {
    const raw = range / n, e = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / e;
    return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * e;
  }

  // ======================= 相界線的折線（快取） =======================
  const curveCache = {};
  function curves(id) {
    if (curveCache[id]) return curveCache[id];
    const s = S[id], out = { sub: [], vap: [], melt: [] };
    for (let k = 0; k <= 160; k++) { const Tk = s.Tmin + (s.Tt - s.Tmin) * k / 160; out.sub.push([Tk, C.psub(id, Tk)]); }
    for (let k = 0; k <= 220; k++) {
      // 接近臨界點加密
      const u = 1 - Math.pow(1 - k / 220, 1.6), Tk = s.Tt + (s.Tc - s.Tt) * u;
      out.vap.push([Tk, C.pvap(id, Tk)]);
    }
    const Ls = Math.log(s.Pmax / s.pt);
    for (let k = 0; k <= 160; k++) {
      const P = s.pt * Math.exp(Ls * k / 160), Tk = C.Tmelt(id, P);
      if (isFinite(Tk)) out.melt.push([Tk, P]);
    }
    curveCache[id] = out;
    return out;
  }

  // ======================= 相圖靜態圖層 =======================
  let bg = null, bgKey = '';
  const LABELPOS = {
    water: { solid: [-40, 1e6], liquid: [150, 1.2e7], gas: [240, 60], sc: [520, 5e7] },
    co2: { solid: [-100, 1e7], liquid: [-25, 2.5e7], gas: [20, 1.5e3], sc: [60, 3.5e7] },
    iodine: { solid: [70, 1e6], liquid: [280, 5e6], gas: [420, 100], sc: [580, 4e7] }
  };
  function buildBg() {
    const key = [st.sub, LD.ver, G.w, G.h, dpr, window.LabSettings ? window.LabSettings.get('lang') : ''].join('|');
    if (key === bgKey && bg) return;
    bgKey = key;
    if (!bg) bg = document.createElement('canvas');
    bg.width = cv.width; bg.height = cv.height;
    const g = bg.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, G.w, G.h);
    LD.backdrop(g, G.w, G.h);
    const s = Tr(), d = G.d;
    // ---- 相區著色（低解析度計算，再放大） ----
    const pw = Math.max(2, Math.round((G.pr - G.pl) / 2)), ph = Math.max(2, Math.round((G.pb - G.pt) / 2));
    const off = document.createElement('canvas'); off.width = pw; off.height = ph;
    const oc = off.getContext('2d'), img = oc.createImageData(pw, ph);
    const tint = {};
    ['solid', 'liquid', 'gas', 'sc'].forEach(function (p) {
      const rgb = LD.mix(col.ph[p], col.ph[p], 0).match(/\d+/g).map(Number);
      tint[p] = rgb;
    });
    const A = { solid: col.dk ? 46 : 40, liquid: col.dk ? 46 : 36, gas: col.dk ? 30 : 30, sc: col.dk ? 46 : 34 };
    for (let j = 0; j < ph; j++) {
      const P = invY(G.pt + (j + 0.5) / ph * (G.pb - G.pt));
      for (let i = 0; i < pw; i++) {
        const Tk = invX(G.pl + (i + 0.5) / pw * (G.pr - G.pl));
        const p = C.phase(st.sub, Tk, P), t = tint[p], o = (j * pw + i) * 4;
        img.data[o] = t[0]; img.data[o + 1] = t[1]; img.data[o + 2] = t[2]; img.data[o + 3] = A[p];
      }
    }
    oc.putImageData(img, 0, 0);
    g.save();
    g.imageSmoothingEnabled = true;
    g.drawImage(off, G.pl, G.pt, G.pr - G.pl, G.pb - G.pt);
    // 超臨界區的柔和漸層（右上角較亮）
    const xc = X(s.Tc), yc = Y(s.pc);
    const rg = g.createRadialGradient(xc, yc, 2, xc, yc, Math.max(60, (G.pr - xc) * 1.6));
    rg.addColorStop(0, LD.alpha(col.ph.sc, col.dk ? 0.16 : 0.12)); rg.addColorStop(1, LD.alpha(col.ph.sc, 0));
    g.beginPath(); g.rect(xc, G.pt, G.pr - xc, yc - G.pt); g.fillStyle = rg; g.fill();
    g.restore();
    // ---- 格線與座標 ----
    const fs = G.fs, f12 = '12px ' + FONT, f11 = '11px ' + FONT;
    g.save();
    g.beginPath(); g.rect(G.pl, G.pt, G.pr - G.pl, G.pb - G.pt); g.clip();
    const e0 = Math.ceil(Math.log10(s.Pmin) - 1e-9), e1 = Math.floor(Math.log10(s.Pmax) + 1e-9);
    for (let e = e0 - 1; e <= e1; e++) {
      for (let m = 1; m < 10; m++) {
        const P = m * Math.pow(10, e);
        if (P < s.Pmin || P > s.Pmax) continue;
        const y = Math.round(Y(P)) + 0.5;
        g.strokeStyle = LD.alpha(col.text, m === 1 ? 0.12 : 0.045); g.lineWidth = 1;
        g.beginPath(); g.moveTo(G.pl, y); g.lineTo(G.pr, y); g.stroke();
      }
    }
    const step = niceStep(s.Tmax - s.Tmin, G.narrow ? 6 : 9);
    for (let tc = Math.ceil((s.Tmin - K0) / step) * step; tc <= s.Tmax - K0 + 1e-9; tc += step) {
      const x = Math.round(X(tc + K0)) + 0.5;
      g.strokeStyle = LD.alpha(col.text, Math.abs(tc) < 1e-9 ? 0.16 : 0.08);
      g.beginPath(); g.moveTo(x, G.pt); g.lineTo(x, G.pb); g.stroke();
    }
    // 1 atm 參考線
    const ya = Y(ATM);
    g.setLineDash([3, 4]); g.strokeStyle = LD.alpha(col.muted, 0.75); g.lineWidth = 1;
    g.beginPath(); g.moveTo(G.pl, ya); g.lineTo(G.pr, ya); g.stroke(); g.setLineDash([]);
    // 超臨界的虛線（不是相界線）
    g.setLineDash([6, 5]); g.strokeStyle = LD.alpha(col.ph.sc, 0.85); g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(xc, yc); g.lineTo(xc, G.pt); g.moveTo(xc, yc); g.lineTo(G.pr, yc); g.stroke(); g.setLineDash([]);
    // 相界線
    const cu = curves(st.sub);
    ['sub', 'vap', 'melt'].forEach(function (k) {
      const pts = cu[k].map(function (q) { return [X(q[0]), Y(q[1])]; });
      if (pts.length < 2) return;
      LD.tube(g, function (c2) { pts.forEach(function (q, i) { if (i) c2.lineTo(q[0], q[1]); else c2.moveTo(q[0], q[1]); }); }, col.line[k], 3.4);
    });
    g.restore();
    // 1 atm 標籤
    LD.haloText(g, '1 atm', G.pr - 4, ya - 4, col.muted, 'right', 'alphabetic', f11);
    // 座標軸
    g.strokeStyle = LD.alpha(col.text, 0.55); g.lineWidth = 1;
    g.beginPath(); g.moveTo(G.pl + 0.5, G.pt); g.lineTo(G.pl + 0.5, G.pb + 0.5); g.lineTo(G.pr, G.pb + 0.5); g.stroke();
    for (let e = e0; e <= e1; e++) {
      const y = Y(Math.pow(10, e));
      g.beginPath(); g.moveTo(G.pl - 4, y); g.lineTo(G.pl, y); g.stroke();
      if (G.narrow && (e - e0) % 2) continue;
      // 單位 kPa：10^(e−3)
      LD.supText(g, '10', String(e - 3).replace('-', '−'), G.pl - 6, y + 4, col.muted, f11, 'right');
    }
    for (let tc = Math.ceil((s.Tmin - K0) / step) * step; tc <= s.Tmax - K0 + 1e-9; tc += step) {
      const x = X(tc + K0);
      g.beginPath(); g.moveTo(x, G.pb); g.lineTo(x, G.pb + 4); g.stroke();
      LD.haloText(g, num(tc, 0), x, G.pb + 16 * fs, col.muted, 'center', 'alphabetic', f11);
    }
    LD.haloText(g, T('溫度 T（°C）', 'Temperature T (°C)'), (G.pl + G.pr) / 2, G.pb + 33 * fs, col.text, 'center', 'alphabetic', f12);
    g.save();
    g.translate(d.x + 13 * fs, (G.pt + G.pb) / 2); g.rotate(-Math.PI / 2);
    LD.haloText(g, T('壓力 P（kPa，對數刻度）', 'Pressure P (kPa, log scale)'), 0, 0, col.text, 'center', 'middle', f12);
    g.restore();
    // 區域名稱
    const lp = LABELPOS[st.sub], fb = '700 ' + Math.round(15) + 'px ' + FONT;
    ['solid', 'liquid', 'gas'].forEach(function (p) {
      const q = lp[p], Tk = q[0] + K0, P = q[1];
      if (C.phase(st.sub, Tk, P) !== p) return;
      const x = X(Tk), y = Y(P);
      if (x < G.pl + 20 || x > G.pr - 20) return;
      g.globalAlpha = 0.9;
      LD.haloText(g, phName(p, true), x, y, LD.shade(col.ph[p], col.dk ? 0.1 : -0.15), 'center', 'middle', fb);
      g.globalAlpha = 1;
    });
    {
      // 超臨界區的名稱放在區域中央；區域窄時分兩行、字小一點，放不下就不寫
      const zw = G.pr - xc, zh = yc - G.pt, cx = (xc + G.pr) / 2, cy = (G.pt + yc) / 2, scc = LD.shade(col.ph.sc, col.dk ? 0.1 : -0.15);
      g.font = fb;
      const full = phName('sc', true);
      g.globalAlpha = 0.9;
      if (g.measureText(full).width + 10 < zw && zh > 22) LD.haloText(g, full, cx, cy + 4, scc, 'center', 'middle', fb);
      else if (zh > 34 && zw > 34) {
        const f2 = '700 12px ' + FONT;
        LD.haloText(g, T('超臨界', 'Super-'), cx, cy - 4, scc, 'center', 'middle', f2);
        LD.haloText(g, T('流體', 'critical'), cx, cy + 11, scc, 'center', 'middle', f2);
      }
      g.globalAlpha = 1;
    }
    // 線的名稱
    const lab = function (k, i, dx, dy, align) {
      const q = cu[k][i];
      if (!q) return;
      const x = X(q[0]), y = Y(q[1]);
      if (y < G.pt + 8 || y > G.pb - 4 || x < G.pl || x > G.pr) return;
      const txt = T(LINEN[k][0], LINEN[k][1]), f = '600 11px ' + FONT;
      g.font = f;
      const w = g.measureText(txt).width + 12;
      let lx = align === 'right' ? x + dx - w : x + dx;
      lx = Math.max(G.pl + 3, Math.min(G.pr - 3 - w, lx));
      LD.pill(g, txt, lx, y + dy, col.line[k], 'left', f);
    };
    lab('sub', 70, 10, 2, 'left');
    lab('vap', 120, 10, 4, 'left');
    lab('melt', st.sub === 'water' ? 120 : 125, st.sub === 'water' ? -8 : 8, 0, st.sub === 'water' ? 'right' : 'left');
    // 三相點、臨界點
    const xt = X(s.Tt), yt = Y(s.pt);
    LD.ball(g, xt, yt, 5, col.text, { shadow: false });
    LD.pill(g, T('三相點', 'Triple point'), xt + 8, yt + 18, col.text, 'left', '600 11px ' + FONT);
    LD.ball(g, xc, yc, 5, col.ph.sc, { shadow: false });
    LD.pill(g, T('臨界點', 'Critical point'), xc - 8, yc - 8, col.ph.sc, 'right', '600 11px ' + FONT);
    // 分隔線（窄螢幕在下方，寬螢幕在右側）
    g.strokeStyle = LD.alpha(col.border, 1); g.lineWidth = 1;
    g.beginPath();
    if (G.narrow) { g.moveTo(10, G.c.y + 0.5); g.lineTo(G.w - 10, G.c.y + 0.5); }
    else { g.moveTo(G.c.x + 0.5, 12); g.lineTo(G.c.x + 0.5, G.h - 12); }
    g.stroke();
  }

  // ======================= 分子（示意） =======================
  function rnd(seed) { let a = seed >>> 0; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const R0 = rnd(1113);
  const BASE = [];      // 液體與固體用的固定隨機數
  for (let i = 0; i < 400; i++) BASE.push([R0(), R0(), R0() * 6.283, R0() * 6.283, 0.6 + 0.8 * R0()]);
  const GAS = [];       // 氣體、超臨界：持續移動的粒子（座標 0–1）
  for (let i = 0; i < 70; i++) GAS.push({ x: R0(), y: R0(), vx: R0() - 0.5, vy: R0() - 0.5, a: R0() * 6.283, va: (R0() - 0.5) * 3 });
  const BUB = [];       // 沸騰的氣泡
  function molecule(g, x, y, r, ang) {
    const id = st.sub, at = col.atom;
    if (id === 'water') {
      const ca = Math.cos(ang), sa = Math.sin(ang), d = r * 0.95, h = 0.92;
      [[-h, 1], [h, 1]].forEach(function (q) {
        const ux = Math.sin(q[0]) * d, uy = Math.cos(q[0]) * d * q[1];
        LD.ball(g, x + ux * ca - uy * sa, y + ux * sa + uy * ca, r * 0.52, at.H, { shadow: false, glow: 0 });
      });
      LD.ball(g, x, y, r * 0.78, at.O, { shadow: false, glow: 0 });
    } else if (id === 'co2') {
      const ca = Math.cos(ang) * r * 1.02, sa = Math.sin(ang) * r * 1.02;
      LD.ball(g, x - ca, y - sa, r * 0.62, at.O, { shadow: false, glow: 0 });
      LD.ball(g, x + ca, y + sa, r * 0.62, at.O, { shadow: false, glow: 0 });
      LD.ball(g, x, y, r * 0.6, at.C, { shadow: false, glow: 0 });
    } else {
      const ca = Math.cos(ang) * r * 0.62, sa = Math.sin(ang) * r * 0.62;
      LD.ball(g, x - ca, y - sa, r * 0.78, at.I, { shadow: false, glow: 0 });
      LD.ball(g, x + ca, y + sa, r * 0.78, at.I, { shadow: false, glow: 0 });
    }
  }

  // ======================= 汽缸 =======================
  const VOL = { solid: 0.30, liquid: 0.34, gas: 0.92, sc: 0.62 };
  function volOf(p) { if (st.sub === 'water' && p === 'solid') return 0.37; if (st.sub === 'water' && p === 'liquid') return 0.33; return VOL[p]; }
  let fillShown = null;
  function drawCylinder(g, t, dt) {
    const c = G.c, s = Tr();
    const narrow = G.narrow;
    const cw = Math.min(narrow ? 130 : 150, c.w * (narrow ? 0.34 : 0.5));
    const top = c.y + (narrow ? 40 : 112), bot = c.y + c.h - (narrow ? 30 : 58);
    const x0 = c.x + (c.w - cw) / 2 - (narrow ? 0 : 6), x1 = x0 + cw;
    const ih = bot - top;
    const comp = composition();
    let fill = 0; comp.forEach(function (q) { fill += q.f * volOf(q.ph); });
    if (fillShown == null || reducedMotion) fillShown = fill;
    else fillShown += (fill - fillShown) * Math.min(1, dt * 4);
    const yPiston = bot - fillShown * ih;
    // 恆溫槽（外套）
    const jc = tempColor(st.T);
    const jx0 = x0 - 14, jx1 = x1 + 14, jy0 = top + ih * 0.2, jy1 = bot + 12;
    LD.roundRect(g, jx0, jy0, jx1 - jx0, jy1 - jy0, 12);
    const jg = g.createLinearGradient(jx0, 0, jx1, 0);
    jg.addColorStop(0, LD.alpha(jc, col.dk ? 0.30 : 0.22)); jg.addColorStop(0.5, LD.alpha(jc, col.dk ? 0.18 : 0.12)); jg.addColorStop(1, LD.alpha(jc, col.dk ? 0.30 : 0.22));
    g.fillStyle = jg; g.fill();
    g.strokeStyle = LD.alpha(jc, 0.55); g.lineWidth = 1.2; g.stroke();
    // 汽缸內部背景
    g.save();
    LD.roundRect(g, x0, top - 6, cw, ih + 6, 8);
    g.clip();
    g.fillStyle = LD.alpha(col.text, col.dk ? 0.06 : 0.03); g.fillRect(x0, top - 6, cw, ih + 6);
    // 各層
    let y = bot;
    const crit = nearCritical();
    const cst = contrast();
    const layers = [];
    comp.forEach(function (q) {
      const h = q.f * volOf(q.ph) / (fill || 1) * (bot - yPiston);
      layers.push({ ph: q.ph, y0: y - h, y1: y, f: q.f });
      y -= h;
    });
    const hasLG = comp.some(function (q) { return q.ph === 'liquid'; }) && comp.some(function (q) { return q.ph === 'gas'; });
    layers.forEach(function (L) {
      const hh = L.y1 - L.y0;
      if (hh < 0.5) return;
      let a;
      if (L.ph === 'solid') a = col.dk ? 0.42 : 0.36;
      else if (L.ph === 'liquid') a = hasLG ? 0.08 + 0.26 * cst : 0.34;
      else if (L.ph === 'sc') a = 0.22;
      else a = hasLG ? 0.22 - 0.14 * cst : 0.08;
      let base = col.ph[L.ph];
      if (L.ph === 'gas' && hasLG) base = LD.mix(col.ph.gas, col.ph.liquid, 1 - cst);
      const lg = g.createLinearGradient(x0, 0, x1, 0);
      lg.addColorStop(0, LD.alpha(base, a * 1.25)); lg.addColorStop(0.35, LD.alpha(base, a * 0.85)); lg.addColorStop(1, LD.alpha(base, a * 1.3));
      g.fillStyle = lg; g.fillRect(x0, L.y0, cw, hh + 0.5);
      // 碘蒸氣是紫色的：顏色深淺隨蒸氣密度（P/T）
      if ((L.ph === 'gas' || L.ph === 'sc') && st.sub === 'iodine') {
        const rho = st.P / st.T;  // ∝ 莫耳濃度
        const ai = Math.max(0, Math.min(0.55, 0.12 * Math.log10(1 + rho / 0.5)));
        g.fillStyle = LD.alpha('#8a3fc0', ai); g.fillRect(x0, L.y0, cw, hh + 0.5);
      }
      drawMolecules(g, L, x0, x1, t, dt);
    });
    // 液面（彎月面）
    for (let i = 0; i < layers.length - 1; i++) {
      const lo = layers[i], hi = layers[i + 1];
      const yy = lo.y0;
      let a = 0.75;
      if ((lo.ph === 'liquid' && hi.ph === 'gas')) a = 0.15 + 0.7 * cst;
      g.strokeStyle = LD.alpha(lo.ph === 'solid' || hi.ph === 'solid' ? col.ph.solid : col.ph.liquid, a);
      g.lineWidth = 1.6;
      g.beginPath();
      const sag = lo.ph === 'liquid' && hi.ph !== 'solid' ? 5 : 0;
      g.moveTo(x0, yy - sag); g.quadraticCurveTo((x0 + x1) / 2, yy + sag, x1, yy - sag); g.stroke();
    }
    // 沸騰的氣泡
    if (pause && (pause.kind === 'boil' || pause.kind === 'condense') && !reducedMotion) {
      const Lq = layers.filter(function (L) { return L.ph === 'liquid'; })[0];
      if (Lq && Math.random() < dt * (pause.kind === 'boil' ? 14 : 4)) BUB.push({ x: x0 + 10 + Math.random() * (cw - 20), y: Lq.y1 - 4, r: 2 + Math.random() * 3 });
      for (let i = BUB.length - 1; i >= 0; i--) {
        const b = BUB[i];
        b.y -= dt * 60; b.r += dt * 1.5;
        if (!Lq || b.y < Lq.y0) { BUB.splice(i, 1); continue; }
        g.beginPath(); g.arc(b.x, b.y, b.r, 0, 6.283);
        g.strokeStyle = LD.alpha(col.dk ? '#ffffff' : '#ffffff', 0.85); g.lineWidth = 1.2; g.stroke();
        g.fillStyle = LD.alpha(col.ph.gas, 0.15); g.fill();
      }
    } else BUB.length = 0;
    // 臨界乳光
    if (crit > 0) {
      const og = g.createLinearGradient(0, yPiston, 0, bot);
      const tw = reducedMotion ? 0 : 0.08 * Math.sin(t * 2.3);
      og.addColorStop(0, LD.alpha('#ffffff', (0.25 + tw) * crit * (col.dk ? 0.7 : 1)));
      og.addColorStop(0.5, LD.alpha('#d8d2e8', (0.45 + tw) * crit * (col.dk ? 0.6 : 1)));
      og.addColorStop(1, LD.alpha('#ffffff', (0.3 - tw) * crit * (col.dk ? 0.7 : 1)));
      g.fillStyle = og; g.fillRect(x0, yPiston, cw, bot - yPiston);
    }
    g.restore();
    // 玻璃壁
    g.lineWidth = 2; g.strokeStyle = LD.alpha(col.text, col.dk ? 0.45 : 0.4);
    g.beginPath(); g.moveTo(x0, top - 6); g.lineTo(x0, bot - 8); g.quadraticCurveTo(x0, bot, x0 + 8, bot); g.lineTo(x1 - 8, bot); g.quadraticCurveTo(x1, bot, x1, bot - 8); g.lineTo(x1, top - 6); g.stroke();
    const hl = g.createLinearGradient(x0, 0, x0 + 14, 0);
    hl.addColorStop(0, LD.alpha('#ffffff', col.dk ? 0.16 : 0.5)); hl.addColorStop(1, LD.alpha('#ffffff', 0));
    g.fillStyle = hl; g.fillRect(x0 + 2, top, 12, ih - 10);
    // 活塞、活塞桿、砝碼
    const pistonH = 12;
    LD.block(g, x0 + 1.5, yPiston - pistonH, cw - 3, pistonH, col.metal, { r: 3 });
    const rx = (x0 + x1) / 2;
    const rodTop = top - (narrow ? 24 : 34);
    const rg = g.createLinearGradient(rx - 4, 0, rx + 4, 0);
    rg.addColorStop(0, LD.shade(col.metal, -0.25)); rg.addColorStop(0.5, LD.shade(col.metal, 0.35)); rg.addColorStop(1, LD.shade(col.metal, -0.3));
    g.fillStyle = rg; g.fillRect(rx - 4, rodTop, 8, yPiston - pistonH - rodTop);
    // 砝碼的數目代表壓力（對數）
    const nW = Math.max(1, Math.min(narrow ? 4 : 6, Math.round(1 + (narrow ? 3 : 5) * Math.log(st.P / s.Pmin) / Math.log(s.Pmax / s.Pmin))));
    const ww = Math.min(cw * 0.8, 96), wh = narrow ? 6 : 7;
    for (let i = 0; i < nW; i++) LD.block(g, rx - ww / 2 + i * 2, rodTop - (i + 1) * (wh + 1), ww - i * 4, wh, col.dk ? '#7d6a4f' : '#8a6d45', { r: 2 });
    // 溫度計（左）與壓力錶（右）
    const fsm = '600 12px ' + FONT;
    const thx = x0 - (narrow ? 44 : 40);
    drawThermo(g, thx, top + 4, bot - 4);
    drawGauge(g, x1 + (narrow ? 50 : 36), top + 14, narrow ? 20 : 22);
    const lines = [cTxt(st.T, 2), pTxt(st.P, 4)];
    if (narrow) {
      LD.pill(g, lines[0], c.x + 8, c.y + 24, tempColor(st.T), 'left', fsm);
      LD.pill(g, lines[1], c.x + c.w - 8, c.y + 24, col.text, 'right', fsm);
    } else {
      LD.pill(g, lines[0], c.x + c.w / 2 - 6, c.y + 22, tempColor(st.T), 'right', fsm);
      LD.pill(g, lines[1], c.x + c.w / 2 + 6, c.y + 22, col.text, 'left', fsm);
    }
    // 相態標籤
    const ph = comp.map(function (q) { return phName(q.ph, false); });
    const tag = comp.length > 1 ? ph.join(T('＋', ' + ')) : phName(comp[0].ph, true);
    LD.pill(g, tag, (x0 + x1) / 2, bot + (narrow ? 22 : 30), comp.length > 1 ? col.accent : col.ph[comp[0].ph], 'center', '700 13px ' + FONT);
    if (!narrow) LD.haloText(g, T('示意圖：體積與分子數不依比例', 'Sketch: volumes and numbers not to scale'), c.x + c.w / 2, c.y + c.h - 8, col.muted, 'center', 'alphabetic', '11px ' + FONT);
  }
  function drawMolecules(g, L, x0, x1, t, dt) {
    const w = x1 - x0, h = L.y1 - L.y0;
    if (h < 3) return;
    const r = Math.max(3.4, Math.min(5.2, w / 26));
    const tt = reducedMotion ? 0 : t;
    if (L.ph === 'solid') {
      const sp = r * 2.6, rows = Math.max(1, Math.floor((h - 2) / (sp * 0.88))), cols = Math.max(1, Math.floor((w - 6) / sp));
      const amp = 0.5 + 1.8 * Math.min(1.2, st.T / Tr().Tt);
      let k = 0;
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const b = BASE[k++ % BASE.length];
        const x = x0 + 4 + sp * (i + 0.5 + (j % 2) * 0.5) - (j % 2 ? sp * 0.25 : 0) + amp * Math.sin(tt * 9 * b[4] + b[2]);
        const y = L.y1 - sp * 0.88 * (j + 0.5) - 1 + amp * Math.cos(tt * 8 * b[4] + b[3]);
        if (x > x1 - r) continue;
        molecule(g, x, y, r, (st.sub === 'water' ? 0 : 0.6) + (j % 2) * 0.5);
      }
    } else if (L.ph === 'liquid') {
      const n = Math.max(1, Math.min(BASE.length, Math.round(w * h / (r * r * 7.5))));
      for (let i = 0; i < n; i++) {
        const b = BASE[i];
        const fx = (b[0] + 0.03 * Math.sin(tt * 0.9 * b[4] + b[2]) + 1) % 1, fy = (b[1] + 0.03 * Math.cos(tt * 0.8 * b[4] + b[3]) + 1) % 1;
        molecule(g, x0 + r + fx * (w - 2 * r), L.y0 + r + fy * Math.max(0, h - 2 * r), r, b[2] + tt * 0.8 * b[4]);
      }
    } else {
      const sc = L.ph === 'sc';
      const rho = Math.log10(Math.max(1, st.P / st.T));        // ∝ 濃度的對數
      let n = sc ? Math.round(w * h / (r * r * 30)) : Math.round(3 + 2.2 * rho);
      n = Math.max(3, Math.min(GAS.length, n));
      const v = (reducedMotion ? 0 : 1) * (sc ? 0.18 : 0.35) * Math.sqrt(st.T / 300);
      for (let i = 0; i < n; i++) {
        const q = GAS[i];
        q.x += q.vx * v * dt; q.y += q.vy * v * dt * (w / Math.max(20, h)); q.a += q.va * dt * (reducedMotion ? 0 : 1);
        if (q.x < 0) { q.x = -q.x; q.vx = Math.abs(q.vx); } if (q.x > 1) { q.x = 2 - q.x; q.vx = -Math.abs(q.vx); }
        if (q.y < 0) { q.y = -q.y; q.vy = Math.abs(q.vy); } if (q.y > 1) { q.y = 2 - q.y; q.vy = -Math.abs(q.vy); }
        molecule(g, x0 + r + q.x * (w - 2 * r), L.y0 + r + q.y * Math.max(0, h - 2 * r), r, q.a);
      }
      if (sc && !reducedMotion) {
        // 密度起伏（示意）
        for (let k = 0; k < 3; k++) {
          const bx = x0 + w * (0.5 + 0.35 * Math.sin(t * 0.37 + k * 2.1)), by = L.y0 + h * (0.5 + 0.35 * Math.cos(t * 0.29 + k * 1.7));
          const rr = Math.min(w, h) * 0.35;
          const fg = g.createRadialGradient(bx, by, 1, bx, by, rr);
          fg.addColorStop(0, LD.alpha(col.ph.sc, 0.12)); fg.addColorStop(1, LD.alpha(col.ph.sc, 0));
          g.fillStyle = fg; g.fillRect(bx - rr, by - rr, 2 * rr, 2 * rr);
        }
      }
    }
  }
  function drawThermo(g, x, y0, y1) {
    const s = Tr(), u = Math.max(0, Math.min(1, (st.T - s.Tmin) / (s.Tmax - s.Tmin)));
    const tw = 8, bulb = 9;
    LD.roundRect(g, x - tw / 2, y0, tw, y1 - y0 - bulb, tw / 2);
    g.fillStyle = LD.alpha(col.surface, 0.9); g.fill();
    g.strokeStyle = LD.alpha(col.text, 0.4); g.lineWidth = 1; g.stroke();
    const yy = y1 - bulb - (y1 - y0 - bulb - 6) * u;
    g.fillStyle = tempColor(st.T);
    g.fillRect(x - 2, yy, 4, y1 - bulb - yy + 2);
    LD.ball(g, x, y1 - bulb / 2, bulb * 0.8, tempColor(st.T), { shadow: false });
  }
  function drawGauge(g, x, y, r) {
    const s = Tr(), u = Math.max(0, Math.min(1, Math.log(st.P / s.Pmin) / Math.log(s.Pmax / s.Pmin)));
    const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.3, 1, x, y, r);
    gr.addColorStop(0, col.dk ? '#3a4448' : '#ffffff'); gr.addColorStop(1, col.dk ? '#232b2e' : '#e3e8ea');
    g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fillStyle = gr; g.fill();
    g.strokeStyle = LD.alpha(col.text, 0.5); g.lineWidth = 1.5; g.stroke();
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    for (let k = 0; k <= 8; k++) {
      const a = a0 + (a1 - a0) * k / 8;
      g.beginPath(); g.moveTo(x + Math.cos(a) * r * 0.72, y + Math.sin(a) * r * 0.72); g.lineTo(x + Math.cos(a) * r * 0.88, y + Math.sin(a) * r * 0.88);
      g.strokeStyle = LD.alpha(col.text, 0.5); g.lineWidth = 1; g.stroke();
    }
    const a = a0 + (a1 - a0) * u;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8);
    g.strokeStyle = col.pos; g.lineWidth = 2; g.lineCap = 'round'; g.stroke();
    g.beginPath(); g.arc(x, y, 2.5, 0, 6.283); g.fillStyle = col.text; g.fill();
    // 連到汽缸的管子
    g.strokeStyle = LD.alpha(col.text, 0.35); g.lineWidth = 2;
    g.beginPath(); g.moveTo(x - r * 0.7, y + r * 0.7); g.lineTo(x - r * 1.4, y + r * 1.5); g.stroke();
  }

  // ======================= 主畫面繪圖 =======================
  let raf = 0, lastTs = 0, simTime = 0, needDraw = true, drag = null, hover = false, kb = null;
  function now() { return performance.now() / 1000; }
  function drawStage(dt) {
    if (!G) return;
    buildBg();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(bg, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 軌跡
    ctx.save();
    ctx.beginPath(); ctx.rect(G.pl, G.pt, G.pr - G.pl, G.pb - G.pt); ctx.clip();
    if (trail.length > 1) {
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const n = trail.length;
      for (let i = 1; i < n; i++) {
        const a = trail[i - 1], b = trail[i];
        if (a.br || b.br) continue;
        const u = i / n;
        ctx.strokeStyle = LD.alpha(col.pos, 0.15 + 0.6 * u); ctx.lineWidth = 1.2 + 1.6 * u;
        ctx.beginPath(); ctx.moveTo(X(a.T), Y(a.P)); ctx.lineTo(X(b.T), Y(b.P)); ctx.stroke();
      }
    }
    // 相變紀錄點
    tr.records.forEach(function (r) {
      if (r.sub !== st.sub) return;
      const x = X(r.T), y = Y(r.P);
      ctx.beginPath(); ctx.arc(x, y, 4, 0, 6.283);
      ctx.fillStyle = LD.alpha(col.bg, 0.9); ctx.fill();
      ctx.strokeStyle = col.equi; ctx.lineWidth = 2; ctx.stroke();
    });
    // 十字輔助線
    const x = X(st.T), y = Y(st.P);
    ctx.setLineDash([2, 4]); ctx.strokeStyle = LD.alpha(col.text, 0.35); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, G.pb); ctx.moveTo(x, y); ctx.lineTo(G.pl, y); ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
    // 狀態點
    const ph = C.phase(st.sub, st.T, st.P), line = lineNow();
    const pc = line ? col.accent : col.ph[ph];
    if (drag || hover) {
      const hg = ctx.createRadialGradient(x, y, 2, x, y, 20);
      hg.addColorStop(0, LD.alpha(pc, 0.35)); hg.addColorStop(1, LD.alpha(pc, 0));
      ctx.fillStyle = hg; ctx.fillRect(x - 20, y - 20, 40, 40);
    }
    LD.ball(ctx, x, y, drag ? 8.5 : 7.5, pc, { glow: col.dk ? 0.4 : 0.15 });
    if (kb && kb.focused()) {
      ctx.setLineDash([3, 3]); ctx.strokeStyle = col.accent; ctx.lineWidth = 1.5;
      LD.roundRect(ctx, x - 13, y - 13, 26, 26, 6); ctx.stroke(); ctx.setLineDash([]);
    }
    // 讀數標籤（避開邊緣）
    const lab = cTxt(st.T, 1) + ' · ' + pTxt(st.P, 3);
    ctx.font = '600 12px ' + FONT;
    const lw = ctx.measureText(lab).width + 14;
    const right = x + 12 + lw < G.pr;
    const up = y - 14 > G.pt + 18;
    LD.pill(ctx, lab, right ? x + 12 : x - 12, up ? y - 10 : y + 26, pc, right ? 'left' : 'right', '600 12px ' + FONT);
    drawCylinder(ctx, simTime, dt);
  }
  function loop(ts) {
    raf = 0;
    const dt = lastTs ? Math.min(1 / 30, (ts - lastTs) / 1000) : 1 / 60;
    lastTs = ts;
    simTime += dt;
    if (st.path) stepPath(dt);
    drawStage(dt);
    needDraw = false;
    const anim = st.path || pause || !reducedMotion;
    if (anim && !document.hidden) raf = requestAnimationFrame(loop);
  }
  function requestDraw() {
    needDraw = true;
    if (!raf) { lastTs = 0; raf = requestAnimationFrame(loop); }
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) requestDraw(); });

  // ======================= 移動與事件 =======================
  function emit(type, data) { if (acted && window.LabMission) window.LabMission.emit(type, data); }
  function pushTrail(br) {
    trail.push({ T: st.T, P: st.P, br: !!br });
    if (trail.length > 1500) trail.splice(0, trail.length - 1500);
  }
  function handle(r, mode) {
    r.changes.forEach(function (c) {
      if (!c.transition && c.to === 'sc') {
        sound('sc');
        setStatus(T('進入超臨界區：沒有沸騰、沒有液面，液體與氣體已經分不出來。', 'Into the supercritical region: no boiling and no surface — liquid and gas can no longer be told apart.'));
      } else if (!c.transition && c.from === 'sc') {
        setStatus(T('離開超臨界區，成為', 'Leaving the supercritical region: it is now a ') + phName(c.to) + T('——途中沒有任何相變。', ', with no phase change on the way.'));
      }
    });
    r.events.forEach(function (e) {
      if (e.type === 'cross') {
        const d = e.data;
        sound(d.kind);
        setStatus(subName(d.sub, true) + T('在 ', ' at ') + cTxt(d.T, 2) + T('、', ', ') + pTxt(d.P, 4) + T(' ', ': ') + kindName(d.kind) +
          T('（', ' (') + phName(d.from) + ' → ' + phName(d.to) + T('）。', ').'));
        updateTable();
      } else if (e.type === 'around') {
        sound('around');
        setStatus(T('你把', 'You turned the ') + phName(e.data.from) + T('變成了', ' into a ') + phName(e.data.to) + T('，卻沒有經過沸騰或凝結：繞過了臨界點。', ' without boiling or condensing: you went around the critical point.'));
      }
      emit(e.type, e.data);
    });
    if (r.events.some(function (e) { return e.type === 'clap' || e.type === 'hess'; })) updateClap();
  }
  function emitState(via) {
    const d = tr.state(st.sub, st.T, st.P, via);
    if (d.line === 'triple' || d.line === 'critical') {
      if (lastSpecial !== d.line + st.sub) { sound('special'); lastSpecial = d.line + st.sub; }
    } else lastSpecial = '';
    emit('state', d);
  }
  let lastSpecial = '';
  function clampState(Tk, P) {
    const s = Tr();
    return [Math.max(s.Tmin, Math.min(s.Tmax, Tk)), Math.max(s.Pmin, Math.min(s.Pmax, P))];
  }
  /** 使用者的一次移動（拖曳、滑桿、方向鍵） */
  function userMove(Tk, P, mode, via) {
    const q = clampState(Tk, P);
    if (q[0] === st.T && q[1] === st.P) return;
    if (pause) { pause = null; }
    const r = tr.move(st.sub, { T: st.T, P: st.P }, { T: q[0], P: q[1] }, mode);
    st.T = q[0]; st.P = q[1];
    pushTrail();
    handle(r, mode);
    emitState(via);
    afterChange(via !== 'slider');
  }
  function afterChange(sync) {
    if (sync) syncSliders(); else refreshOutputs();
    updateReadouts();
    requestDraw();
  }
  /** 瞬間移動（換物質、生活例子） */
  function teleport(Tk, P) {
    stopPath();
    pause = null;
    st.T = Tk; st.P = P;
    tr.teleport(st.sub, Tk, P);
    pushTrail(true);
    lastSpecial = '';
    afterChange(true);
  }

  // ======================= 路徑 =======================
  const PATHS = { heat: 'pHeat', cool: 'pCool', press: 'pPress', depress: 'pDepress' };
  function setPathButtons() { Object.keys(PATHS).forEach(function (m) { $(PATHS[m]).setAttribute('aria-pressed', String(st.path === m)); }); }
  function startPath(mode) {
    if (st.path === mode) { stopPath(); return; }
    if (pause) finishPause();
    st.path = mode;
    setPathButtons();
    const s = Tr();
    const atEnd = (mode === 'heat' && st.T >= s.Tmax) || (mode === 'cool' && st.T <= s.Tmin) || (mode === 'press' && st.P >= s.Pmax) || (mode === 'depress' && st.P <= s.Pmin);
    if (atEnd) { stopPath(); setStatus(T('已經到了圖的邊界，換個方向試試。', 'Already at the edge of the diagram — try the other direction.')); return; }
    setStatus(modeName(mode) + T('中……', '…'));
    lastStateEmit = 0;
    requestDraw();
  }
  function stopPath() {
    if (pause) finishPause();
    if (st.path) { st.path = null; setPathButtons(); emitState('path'); }
  }
  function finishPause() {
    if (!pause) return;
    const b = pause.beyond;
    pause = null;
    st.T = b.T; st.P = b.P;
    pushTrail();
  }
  function stepPath(dt) {
    const s = Tr(), mode = st.path;
    if (pause) {
      if (now() - pause.t0 >= pause.dur) { finishPause(); syncSliders(); updateReadouts(); }
      return;
    }
    const sg = mode === 'heat' || mode === 'press' ? 1 : -1;
    const isT = mode === 'heat' || mode === 'cool';
    const rate = 1 / 14;   // 14 秒走完整個範圍
    let nT = st.T, nP = st.P;
    if (isT) nT = Math.max(s.Tmin, Math.min(s.Tmax, st.T + sg * (s.Tmax - s.Tmin) * rate * dt));
    else nP = Math.max(s.Pmin, Math.min(s.Pmax, st.P * Math.exp(sg * Math.log(s.Pmax / s.Pmin) * rate * dt)));
    const a = { T: st.T, P: st.P }, b = { T: nT, P: nP };
    const ch = C.pathChanges(st.sub, a, b, 40);
    const first = ch.filter(function (c) { return c.transition; })[0];
    if (first) {
      // 越過界線：先停在線上，表示兩相共存、正在吸收或放出潛熱
      const q = { T: first.T, P: first.P };
      let beyond = null;
      for (let eps = 1e-7; eps <= 1e-2; eps *= 10) {
        const c2 = isT ? { T: q.T + sg * eps * (s.Tmax - s.Tmin), P: q.P } : { T: q.T, P: q.P * Math.exp(sg * eps * Math.log(s.Pmax / s.Pmin)) };
        if (C.phase(st.sub, c2.T, c2.P) === first.to) { beyond = c2; break; }
      }
      if (!beyond) beyond = b;
      const r = tr.move(st.sub, a, beyond, mode);
      st.T = q.T; st.P = q.P;
      pushTrail();
      handle(r, mode);
      emitState('path');
      pause = { t0: now(), dur: reducedMotion ? 0.8 : 1.6, from: first.from, to: first.to, kind: first.kind, beyond: beyond };
      lastStateEmit = now();
      syncSliders(); updateReadouts();
      return;
    }
    const r = tr.move(st.sub, a, b, mode);
    st.T = nT; st.P = nP;
    pushTrail();
    handle(r, mode);
    const t = now();
    if (t - lastStateEmit > 0.3) { lastStateEmit = t; emitState('path'); }
    syncSliders(); updateReadouts();
    const done = isT ? (nT === s.Tmax || nT === s.Tmin) : (nP === s.Pmax || nP === s.Pmin);
    if (done) {
      stopPath();
      setStatus(T('到達圖的邊界，路徑停止。', 'Reached the edge of the diagram; the path stops.'));
    }
  }

  // ======================= 讀數 =======================
  function setStatus(t) { $('status').textContent = t || statusBase; }
  function updateReadouts() {
    const s = Tr(), ph = C.phase(st.sub, st.T, st.P), line = lineNow();
    const box = $('phaseNow');
    let main, sub = '';
    if (pause) {
      main = phName(pause.from, true) + ' ⇌ ' + phName(pause.to);
      sub = kindName(pause.kind) + T('中：兩相共存，溫度與壓力停在線上', ' in progress: two phases coexist; T and P stay on the line');
    } else if (line === 'triple') { main = T('三相共存', 'Three phases coexist'); sub = T('三相點：固、液、氣同時存在', 'Triple point: solid, liquid and gas together'); }
    else if (line === 'critical') { main = T('臨界點', 'Critical point'); sub = T('液體與氣體的密度相同，界面消失', 'Liquid and gas have the same density; the boundary vanishes'); }
    else if (line) {
      const f = C.lineFaces(line);
      main = phName(f[0], true) + ' ⇌ ' + phName(f[1]);
      sub = T('兩相共存（在', 'Two phases coexist (on the ') + T(LINEN[line][0], LINEN[line][1]) + T('上）', ')');
    } else { main = phName(ph, true); }
    box.innerHTML = main + (sub ? '<small>' + sub + '</small>' : '');
    box.style.borderColor = line || pause ? col.accent : col.ph[ph];
    box.style.color = line || pause ? col.accent : LD.shade(col.ph[ph], col.dk ? 0.1 : -0.2);

    const rows = [];
    rows.push([T('溫度 T', 'Temperature T'), cTxt(st.T, 2) + '<small>' + num(st.T, 2) + ' K</small>']);
    rows.push([T('壓力 P', 'Pressure P'), pTxt(st.P, 4) + '<small>' + atmHTML(st.P) + '</small>']);
    // 這個壓力下的相變溫度
    const parts = [];
    if (st.P < s.pt) { const t = C.Tsubl(st.sub, st.P); if (isFinite(t)) parts.push(T('昇華點 ', 'sublimation ') + cTxt(t, 2)); }
    else {
      const tm = C.Tmelt(st.sub, st.P); if (isFinite(tm)) parts.push(T('熔點 ', 'melting ') + cTxt(tm, 2));
      const tb = C.Tboil(st.sub, st.P); if (isFinite(tb)) parts.push(T('沸點 ', 'boiling ') + cTxt(tb, 2));
      else if (st.P > s.pc) parts.push(T('高於臨界壓力：沒有沸點', 'above Pc: no boiling point'));
    }
    rows.push([T('這個壓力下的', 'At this pressure') + '<small>' + T('相變溫度', 'transition temperatures') + '</small>', parts.join('<br>') || '—']);
    // 這個溫度的蒸氣壓或昇華壓
    let pv;
    if (st.T < s.Tt) pv = [T('昇華壓', 'Sublimation pressure'), pTxt(C.psub(st.sub, st.T), 4)];
    else if (st.T < s.Tc) pv = [T('蒸氣壓', 'Vapour pressure'), pTxt(C.pvap(st.sub, st.T), 4)];
    else pv = [T('蒸氣壓', 'Vapour pressure'), T('高於 T<sub>c</sub>：無法液化', 'above T<sub>c</sub>: cannot be liquefied')];
    rows.push([pv[0] + '<small>' + T('這個溫度', 'at this temperature') + '</small>', pv[1]]);
    // 熔化線斜率
    const Tm = st.P >= s.pt ? C.Tmelt(st.sub, st.P) : s.Tt;
    const sl = C.meltSlope(st.sub, isFinite(Tm) ? Tm : s.Tt);
    rows.push([T('熔化線斜率', 'Melting-line slope') + '<small>dP/dT</small>', num(sl / ATM, 0) + ' atm/K<small>' + (sl > 0 ? T('加壓 1 atm，熔點升高 ', '+1 atm raises the melting point by ') : T('加壓 1 atm，熔點降低 ', '+1 atm lowers the melting point by ')) + sigf(Math.abs(ATM / sl), 2) + ' K</small>']);
    // 飽和密度
    const dd = C.satDensity(st.sub, st.T);
    rows.push([T('飽和密度（液／氣）', 'Saturated densities (liquid / vapour)') + '<small>' + T('這個溫度', 'at this temperature') + '</small>',
      dd ? sigf(dd.L, 3) + ' / ' + sigf(dd.V, 3) + ' kg/m<sup>3</sup>' : st.sub === 'iodine' && st.T >= s.Tt && st.T <= s.Tc ? T('—（無可靠數據）', '— (no reliable data)') : '—']);
    const rd = C.reduced(st.sub, st.T, st.P);
    rows.push([T('對比溫度、對比壓力', 'Reduced T and P') + '<small>T/T<sub>c</sub>, P/P<sub>c</sub></small>', sigf(rd.Tr, 3) + ', ' + sciHTML(rd.Pr, 3)]);
    $('readout').innerHTML = rows.map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>'; }).join('');
    updateGraphText();
    drawGraph();
  }
  function updateSubInfo() {
    const s = Tr(), id = st.sub;
    let h = T('三相點 ', 'Triple point ') + cTxt(s.Tt, 2) + T('、', ', ') + pTxt(s.pt, 4) + T('；臨界點 ', '; critical point ') + cTxt(s.Tc, 2) + T('、', ', ') + pTxt(s.pc, 4) + T('。', '.');
    if (id === 'co2') h += T('三相點的壓力高於 1 atm，所以 1 atm 下乾冰在 −78.5 °C 直接昇華。', ' The triple-point pressure is above 1 atm, so at 1 atm dry ice sublimes at −78.5 °C.');
    else if (id === 'iodine') h += T('1 atm 下 113.5 °C 熔化、184.4 °C 沸騰。', ' At 1 atm it melts at 113.5 °C and boils at 184.4 °C.');
    else h += T('1 atm 下 0.00 °C 熔化、99.97 °C 沸騰；熔化線向左斜。', ' At 1 atm it melts at 0.00 °C and boils at 99.97 °C; the melting line leans to the left.');
    $('subInfo').innerHTML = h;
  }

  // ======================= 紀錄表、兩點式 =======================
  function updateTable() {
    const el = $('tbl');
    let h = '<thead><tr><th>#</th><th class="l">' + T('物質', 'Substance') + '</th><th class="l">' + T('相變', 'Change') + '</th><th>T<br><small>°C</small></th><th>P<br><small>kPa</small></th><th class="l">' + T('方式', 'How') + '</th></tr></thead><tbody>';
    const list = tr.records.slice(-60).reverse();
    if (!list.length) h += '<tr class="empty"><td colspan="6">' + T('還沒有相變紀錄：用路徑按鈕、滑桿或拖曳狀態點越過一條相界線。', 'No phase changes yet: cross a line with a path button, a slider or by dragging the state point.') + '</td></tr>';
    list.forEach(function (r) {
      h += '<tr><td>' + r.n + '</td><td class="l">' + subName(r.sub, true) + '</td><td class="l">' + kindName(r.kind) + '</td><td>' + num(r.T - K0, 2) + '</td><td>' +
        sigf(r.P / 1000, 4) + '</td><td class="l">' + modeName(r.mode) + '</td></tr>';
    });
    el.innerHTML = h + '</tbody>';
  }
  function updateClap() {
    const id = st.sub, s = Tr();
    const v = tr.pair(id, 'vap'), b = tr.pair(id, 'sub');
    const kj = function (x) { return num(x / 1000, 2) + ' kJ/mol'; };
    let h = '';
    const one = function (p, name, ref, refNote) {
      return name + T('：', ': ') + '<b>' + kj(p.dH) + '</b><br><small>' + T('兩點 ', 'from ') + cTxt(p.T1, 2) + T('（', ' (') + pTxt(p.P1, 3) + T('）與 ', ') and ') + cTxt(p.T2, 2) + T('（', ' (') + pTxt(p.P2, 3) + T('）', ')') +
        T('；壓力比 ', '; pressure ratio ') + sigf(p.ratio, 3) + T('；文獻 ', '; reference ') + kj(ref) + refNote + '</small>';
    };
    if (v) h += one(v, T('莫耳汽化熱 ΔH<sub>vap</sub>', 'Molar heat of vaporization ΔH<sub>vap</sub>'), s.dHvapRef, id === 'water' ? T('（100 °C）', ' (100 °C)') : id === 'co2' ? T('（三相點）', ' (triple point)') : T('（沸點）', ' (boiling point)'));
    if (b) h += (h ? '<br>' : '') + one(b, T('莫耳昇華熱 ΔH<sub>sub</sub>', 'Molar heat of sublimation ΔH<sub>sub</sub>'), s.dHsubRef, id === 'water' ? T('（0 °C）', ' (0 °C)') : id === 'co2' ? T('（−78.5 °C）', ' (−78.5 °C)') : T('（25 °C）', ' (25 °C)'));
    if (v && b) h += '<br>ΔH<sub>sub</sub> − ΔH<sub>vap</sub> = <b>' + kj(b.dH - v.dH) + '</b>' + T('；熔化熱 ΔH<sub>fus</sub> = ', '; heat of fusion ΔH<sub>fus</sub> = ') + kj(s.dHfusRef) + T('（赫斯定律：在三相點附近量才準）', ' (Hess’s law: measure near the triple point)');
    if (!h) h = T('沿等壓或等溫路徑，在兩個不同的壓力越過同一條線（例如兩個沸點），就能用 ', 'Cross the same line at two different pressures (for example two boiling points) and the equation ') +
      '\\(\\ln\\dfrac{P_2}{P_1} = -\\dfrac{\\Delta H}{R}\\left(\\dfrac{1}{T_2} - \\dfrac{1}{T_1}\\right)\\)' + T(' 算出這個物質的莫耳相變熱。', ' gives the molar heat of that change for ') + (T('', subName(id) + '.'));
    const el = $('clapOut');
    el.innerHTML = h;
    if (window.renderMathInElement) try { window.renderMathInElement(el, { delimiters: [{ left: '\\(', right: '\\)', display: false }], throwOnError: false }); } catch (e) { /* 忽略 */ }
  }

  // ======================= 圖表 =======================
  let GG = null;
  function resizeGraph() {
    const w = gcv.clientWidth || 600, h = gcv.clientHeight || 330, d = Math.min(window.devicePixelRatio || 1, 2);
    gcv.width = Math.round(w * d); gcv.height = Math.round(h * d);
    const fs = fsScale();
    GG = { w: w, h: h, d: d, l: Math.round(56 * fs), r: w - 14, t: 16, b: h - Math.round(42 * fs), fs: fs };
  }
  function updateGraphText() {
    let t = '';
    const s = Tr();
    if (st.tab === 'cc') {
      let k = st.T < s.Tt ? 'sub' : st.T < s.Tc ? 'vap' : null;
      t = T('克勞修斯—克拉佩龍圖：橫軸 1000/T、縱軸 ln(P/kPa)。昇華線與蒸氣壓曲線幾乎是直線，斜率 = −ΔH/R；兩條線在三相點相接，昇華線比較陡。',
        'Clausius–Clapeyron plot: 1000/T across, ln(P/kPa) up. The sublimation and vapour-pressure lines are nearly straight with slope −ΔH/R; they meet at the triple point, and the sublimation line is steeper.');
      if (k) t += T(' 在目前的溫度，', ' At the current temperature the ') + T(LINEN[k][0], LINEN[k][1]) + T('的切線斜率給出 ΔH = ', ' has a tangent slope giving ΔH = ') + num(C.dHslope(st.sub, k, st.T) / 1000, 1) + ' kJ/mol' + T('。', '.');
    } else if (st.tab === 'all') {
      t = T('三種物質的相圖畫在一起（同一組座標）。虛線是 1 atm：只有二氧化碳的三相點在它上面，所以乾冰在 1 atm 下直接昇華；碘與水都會先熔化。',
        'The three phase diagrams on the same axes. The dashed line is 1 atm: only carbon dioxide has its triple point above it, so dry ice sublimes at 1 atm, while iodine and water melt first.');
    } else {
      t = T('對比狀態：溫度除以 T<sub>c</sub>、壓力除以 P<sub>c</sub> 之後，三條蒸氣壓曲線幾乎疊在一起（對比狀態原理）。在 T/T<sub>c</sub> = 0.7 的 −1 − log P/P<sub>c</sub> 叫做偏心因子 ω：',
        'Reduced variables: divide T by T<sub>c</sub> and P by P<sub>c</sub> and the three vapour-pressure curves nearly coincide (law of corresponding states). The value of −1 − log P/P<sub>c</sub> at T/T<sub>c</sub> = 0.7 is the acentric factor ω: ') +
        C.ORDER.map(function (id) { const T7 = 0.7 * S[id].Tc; return T7 >= S[id].Tt ? subName(id) + ' ' + num(-1 - Math.log10(C.pvap(id, T7) / S[id].pc), 3) : null; }).filter(Boolean).join(T('、', ', ')) +
        T('（水有氫鍵，偏離最多）。', ' (water, with its hydrogen bonds, deviates most).');
    }
    $('gHint').innerHTML = t;
  }
  function gAxes(g, xr, yr, xl, yl, xTicks, yTicks, yFmt) {
    const A = GG;
    const fx = function (v) { return A.l + (v - xr[0]) / (xr[1] - xr[0]) * (A.r - A.l); };
    const fy = function (v) { return A.b - (v - yr[0]) / (yr[1] - yr[0]) * (A.b - A.t); };
    g.strokeStyle = LD.alpha(col.text, 0.08); g.lineWidth = 1;
    xTicks.forEach(function (v) { const x = Math.round(fx(v)) + 0.5; g.beginPath(); g.moveTo(x, A.t); g.lineTo(x, A.b); g.stroke(); });
    yTicks.forEach(function (v) { const y = Math.round(fy(v)) + 0.5; g.beginPath(); g.moveTo(A.l, y); g.lineTo(A.r, y); g.stroke(); });
    g.strokeStyle = LD.alpha(col.text, 0.55);
    g.beginPath(); g.moveTo(A.l + 0.5, A.t); g.lineTo(A.l + 0.5, A.b + 0.5); g.lineTo(A.r, A.b + 0.5); g.stroke();
    const f11 = '11px ' + FONT;
    xTicks.forEach(function (v) { LD.haloText(g, num(v, Math.abs(v) < 10 && v % 1 ? 1 : 0), fx(v), A.b + 15 * A.fs, col.muted, 'center', 'alphabetic', f11); });
    yTicks.forEach(function (v) { yFmt(g, v, A.l - 6, fy(v) + 4); });
    LD.haloText(g, xl, (A.l + A.r) / 2, A.b + 33 * A.fs, col.text, 'center', 'alphabetic', '12px ' + FONT);
    g.save(); g.translate(13 * A.fs, (A.t + A.b) / 2); g.rotate(-Math.PI / 2);
    LD.haloText(g, yl, 0, 0, col.text, 'center', 'middle', '12px ' + FONT); g.restore();
    return { fx: fx, fy: fy };
  }
  function poly(g, pts, color, w, dash) {
    if (pts.length < 2) return;
    g.save();
    g.beginPath(); g.rect(GG.l, GG.t, GG.r - GG.l, GG.b - GG.t); g.clip();
    g.strokeStyle = color; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round';
    if (dash) g.setLineDash(dash);
    g.beginPath(); pts.forEach(function (p, i) { if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }); g.stroke();
    g.restore();
  }
  function drawGraph() {
    if (!GG) return;
    const g = gctx;
    g.setTransform(GG.d, 0, 0, GG.d, 0, 0);
    g.clearRect(0, 0, GG.w, GG.h);
    LD.backdrop(g, GG.w, GG.h);
    const s = Tr(), id = st.sub, f11 = '11px ' + FONT;
    const logFmt = function (g2, v, x, y) { LD.supText(g2, '10', String(v).replace('-', '−'), x, y, col.muted, f11, 'right'); };
    if (st.tab === 'cc') {
      const xr = [1000 / s.Tmax, 1000 / s.Tmin], yr = [Math.log(s.Pmin / 1000), Math.log(s.Pmax / 1000)];
      const xs = []; const xst = niceStep(xr[1] - xr[0], 7); for (let v = Math.ceil(xr[0] / xst) * xst; v <= xr[1] + 1e-9; v += xst) xs.push(+v.toFixed(6));
      const ys = []; const yst = niceStep(yr[1] - yr[0], 6); for (let v = Math.ceil(yr[0] / yst) * yst; v <= yr[1] + 1e-9; v += yst) ys.push(+v.toFixed(6));
      const A = gAxes(g, xr, yr, T('1000 / T（單位 1/K）', '1000 / T (1/K)'), 'ln(P / kPa)', xs, ys, function (g2, v, x, y) { LD.haloText(g2, num(v, 0), x, y, col.muted, 'right', 'alphabetic', f11); });
      const cu = curves(id);
      ['sub', 'vap', 'melt'].forEach(function (k) { poly(g, cu[k].map(function (q) { return [A.fx(1000 / q[0]), A.fy(Math.log(q[1] / 1000))]; }), col.line[k], 2.6); });
      // 兩點式的弦
      ['vap', 'sub'].forEach(function (k) {
        const p = tr.pair(id, k);
        if (!p) return;
        poly(g, [[A.fx(1000 / p.T1), A.fy(Math.log(p.P1 / 1000))], [A.fx(1000 / p.T2), A.fy(Math.log(p.P2 / 1000))]], col.equi, 2, [5, 4]);
      });
      tr.records.forEach(function (r) {
        if (r.sub !== id) return;
        const x = A.fx(1000 / r.T), y = A.fy(Math.log(r.P / 1000));
        g.beginPath(); g.arc(x, y, 4, 0, 6.283); g.fillStyle = LD.alpha(col.bg, 0.9); g.fill(); g.strokeStyle = col.equi; g.lineWidth = 2; g.stroke();
      });
      const xt = A.fx(1000 / s.Tt), yt = A.fy(Math.log(s.pt / 1000));
      LD.ball(g, xt, yt, 4.5, col.text, { shadow: false });
      LD.pill(g, T('三相點', 'Triple point'), xt + 8, yt - 6, col.text, 'left', '600 11px ' + FONT);
      const x = A.fx(1000 / st.T), y = A.fy(Math.log(st.P / 1000));
      if (x >= GG.l - 1 && x <= GG.r + 1 && y >= GG.t - 1 && y <= GG.b + 1) LD.ball(g, x, y, 6, col.pos, {});
      // 圖例
      let ly = GG.t + 14;
      ['sub', 'vap', 'melt'].forEach(function (k) {
        g.strokeStyle = col.line[k]; g.lineWidth = 3; g.beginPath(); g.moveTo(GG.r - 120, ly - 4); g.lineTo(GG.r - 100, ly - 4); g.stroke();
        LD.haloText(g, T(LINEN[k][0], LINEN[k][1]), GG.r - 95, ly, col.text, 'left', 'alphabetic', f11); ly += 16;
      });
    } else if (st.tab === 'all') {
      const xr = [-160, 600], yr = [-3, 5];
      const xs = []; for (let v = -150; v <= 600; v += 150) xs.push(v);
      const ys = []; for (let v = -3; v <= 5; v++) ys.push(v);
      const A = gAxes(g, xr, yr, T('溫度（°C）', 'Temperature (°C)'), T('壓力（kPa，對數）', 'Pressure (kPa, log)'), xs, ys, logFmt);
      const ya = A.fy(Math.log10(ATM / 1000));
      poly(g, [[GG.l, ya], [GG.r, ya]], LD.alpha(col.muted, 0.8), 1, [3, 4]);
      LD.haloText(g, '1 atm', GG.r - 4, ya - 4, col.muted, 'right', 'alphabetic', f11);
      C.ORDER.forEach(function (k, idx) {
        const cu = curves(k), cc = col.sub[k], w = k === id ? 3 : 2;
        ['sub', 'vap', 'melt'].forEach(function (q) { poly(g, cu[q].map(function (p) { return [A.fx(p[0] - K0), A.fy(Math.log10(p[1] / 1000))]; }), cc, w); });
        const sk = S[k];
        const xt = A.fx(sk.Tt - K0), yt = A.fy(Math.log10(sk.pt / 1000)), xc = A.fx(sk.Tc - K0), yc = A.fy(Math.log10(sk.pc / 1000));
        LD.ball(g, xt, yt, 4, cc, { shadow: false });
        g.save(); g.translate(xc, yc); g.rotate(Math.PI / 4); g.fillStyle = cc; g.fillRect(-4, -4, 8, 8); g.restore();
        LD.pill(g, subName(k, true), GG.l + 8, GG.b - 50 + idx * 20, cc, 'left', '600 11px ' + FONT);
      });
      LD.haloText(g, T('● 三相點　◆ 臨界點', '● triple point   ◆ critical point'), GG.r - 4, GG.b - 8, col.muted, 'right', 'alphabetic', f11);
      const x = A.fx(st.T - K0), y = A.fy(Math.log10(st.P / 1000));
      if (y >= GG.t && y <= GG.b) LD.ball(g, x, y, 5.5, col.pos, {});
    } else {
      const xr = [0.4, 1.1], yr = [-5, 0.5];
      const xs = []; for (let v = 0.4; v <= 1.1001; v += 0.1) xs.push(+v.toFixed(1));
      const ys = []; for (let v = -5; v <= 0; v++) ys.push(v);
      const A = gAxes(g, xr, yr, 'T / Tc', 'P / Pc' + T('（對數）', ' (log)'), xs, ys, logFmt);
      const x7 = A.fx(0.7);
      poly(g, [[x7, GG.t], [x7, GG.b]], LD.alpha(col.muted, 0.6), 1, [2, 4]);
      C.ORDER.forEach(function (k, idx) {
        const cu = curves(k), sk = S[k], cc = col.sub[k];
        poly(g, cu.vap.map(function (p) { return [A.fx(p[0] / sk.Tc), A.fy(Math.log10(p[1] / sk.pc))]; }), cc, k === id ? 3 : 2);
        poly(g, cu.sub.map(function (p) { return [A.fx(p[0] / sk.Tc), A.fy(Math.log10(p[1] / sk.pc))]; }), cc, 1.5, [4, 3]);
        LD.pill(g, subName(k, true), A.fx(0.88), A.fy(-2.4) + idx * 20, cc, 'left', '600 11px ' + FONT);
        const r = tr.red[k];
        if (r && k !== id) {
          const x = A.fx(r.Tr), y = A.fy(Math.log10(r.Pr));
          if (x >= GG.l && x <= GG.r && y >= GG.t && y <= GG.b) { g.beginPath(); g.arc(x, y, 5, 0, 6.283); g.strokeStyle = cc; g.lineWidth = 2; g.stroke(); }
        }
      });
      LD.ball(g, A.fx(1), A.fy(0), 4, col.ph.sc, { shadow: false });
      LD.haloText(g, T('臨界點', 'critical point'), A.fx(1) + 6, A.fy(0) + 14, col.ph.sc, 'left', 'alphabetic', f11);
      const rd = C.reduced(id, st.T, st.P), x = A.fx(rd.Tr), y = A.fy(Math.log10(rd.Pr));
      if (x >= GG.l && x <= GG.r && y >= GG.t && y <= GG.b) LD.ball(g, x, y, 5.5, col.pos, {});
      LD.haloText(g, T('實線：蒸氣壓曲線　虛線：昇華線', 'solid: vapour pressure   dashed: sublimation'), GG.r - 4, GG.b - 8, col.muted, 'right', 'alphabetic', f11);
    }
  }

  // ======================= 溜冰 =======================
  function updateSkate() {
    const m = window.LabNum ? window.LabNum.value(elMass) : +elMass.value, a = window.LabNum ? window.LabNum.value(elArea) : +elArea.value;
    $('masso').textContent = num(m, 0) + ' kg';
    $('areao').innerHTML = num(a, 0) + ' mm<sup>2</sup>';
    const k = C.skate(m, a);
    const p5 = C.pmelt('water', K0 - 5);
    $('skateOut').innerHTML = T('冰刀下增加的壓力：', 'Extra pressure under the blade: ') + '<b>' + num(k.P / ATM, 1) + ' atm</b>（' + pTxt(k.P, 3) + '）<br>' +
      T('熔點只下降 ', 'The melting point falls by only ') + '<b>' + sigf(-k.dT, 2) + ' K</b>' + T('（熔化線斜率 ', ' (melting-line slope ') + num(k.slope / 1e6, 1) + ' MPa/K' + T('）。', ').') + '<br>' +
      T('冰場約 −5 °C，要讓冰熔化需要約 ', 'A rink is at about −5 °C; melting its ice by pressure needs about ') + num(p5 / ATM, 0) + ' atm' +
      T('。冰會滑，主要是表面有一層像液體的薄層，加上摩擦生熱；壓力熔冰的效果很小。', '. Ice is slippery mainly because of a thin liquid-like surface layer and frictional heating; pressure melting is a tiny effect.');
  }

  // ======================= 數據表 =======================
  function buildDataTable() {
    const el = $('dataTable');
    let h = '<thead><tr><th class="l">' + T('物質', 'Substance') + '</th><th>' + T('三相點', 'Triple point') + '</th><th>' + T('臨界點', 'Critical point') + '</th><th>' + T('1 atm 時', 'At 1 atm') +
      '</th><th>' + T('熔化線斜率', 'Melting-line slope') + '<br><small>MPa/K</small></th><th>ΔH<sub>fus</sub> / ΔH<sub>vap</sub> / ΔH<sub>sub</sub><br><small>kJ/mol</small></th><th>' + T('密度 固／液', 'Density solid / liquid') + '<br><small>g/cm<sup>3</sup></small></th></tr></thead><tbody>';
    C.ORDER.forEach(function (id) {
      const s = S[id];
      const at1 = id === 'co2' ? T('昇華 ', 'sublimes ') + cTxt(C.Tsubl(id, ATM), 1) : T('熔 ', 'melts ') + cTxt(C.Tmelt(id, ATM), 1) + '<br>' + T('沸 ', 'boils ') + cTxt(C.Tboil(id, ATM), 1);
      const sl = C.meltSlope(id, id === 'water' ? s.Tt - 0.01 : s.Tt + 0.01) / 1e6;
      h += '<tr><td class="l">' + subName(id, true) + ' ' + FORM[id] + '</td><td>' + cTxt(s.Tt, 2) + '<br>' + pTxt(s.pt, 4) + '</td><td>' + cTxt(s.Tc, 2) + '<br>' + pTxt(s.pc, 4) + '</td><td>' + at1 +
        '</td><td>' + num(sl, 2) + '</td><td>' + num(s.dHfusRef / 1000, 2) + ' / ' + num(s.dHvapRef / 1000, 2) + ' / ' + num(s.dHsubRef / 1000, 2) + '</td><td>' + num(s.rhoS / 1000, 3) + ' / ' + num(s.rhoL / 1000, 3) + '</td></tr>';
    });
    el.innerHTML = h + '</tbody>';
  }

  // ======================= 音效 =======================
  function sound(kind) {
    const L = window.LabSound;
    if (!L || !L.enabled()) return;
    if (kind === 'melt') L.sweep({ from: 523, to: 659, dur: 0.18, gain: 0.12, type: 'triangle' });
    else if (kind === 'freeze') { L.sweep({ from: 659, to: 523, dur: 0.18, gain: 0.12, type: 'triangle' }); L.tone({ freq: 1568, dur: 0.06, gain: 0.05, delay: 0.16 }); }
    else if (kind === 'boil') { L.noise({ dur: 0.25, gain: 0.25, filter: 1400, q: 2 }); L.tone({ freq: 784, dur: 0.12, gain: 0.08 }); }
    else if (kind === 'condense') L.tone({ freq: 587, dur: 0.16, gain: 0.1, type: 'sine' });
    else if (kind === 'sublime') L.sweep({ from: 880, to: 1320, dur: 0.3, gain: 0.08, type: 'sine' });
    else if (kind === 'deposit') { L.sweep({ from: 1320, to: 880, dur: 0.25, gain: 0.08, type: 'sine' }); L.tone({ freq: 1760, dur: 0.05, gain: 0.05, delay: 0.22 }); }
    else if (kind === 'sc') { L.tone({ freq: 698, dur: 0.12, gain: 0.07 }); L.tone({ freq: 932, dur: 0.18, gain: 0.07, delay: 0.08 }); }
    else if (kind === 'around') { L.tone({ freq: 784, dur: 0.1, gain: 0.1 }); L.tone({ freq: 1175, dur: 0.18, gain: 0.1, delay: 0.1 }); }
    else if (kind === 'special') { L.tone({ freq: 1047, dur: 0.14, gain: 0.12 }); L.tone({ freq: 1568, dur: 0.2, gain: 0.1, delay: 0.1 }); }
  }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }

  // ======================= 物質、例子 =======================
  function setSub(id, Tk, P) {
    stopPath();
    st.sub = id;
    document.querySelectorAll('#subSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.sub === id)); });
    trail = [];
    fillShown = null;
    setRanges();
    bgKey = '';
    updateSubInfo();
    teleport(Tk == null ? DEF[id][0] : Tk, P == null ? DEF[id][1] : P);
    updateClap();
  }
  const EX = {
    cooker: function () { return ['water', K0 + 100, 2 * ATM, T('壓力鍋：鍋內約 2 atm（錶壓 1 atm）。按「等壓加熱」，水要到約 120.6 °C 才沸騰，所以食物熟得快。', 'Pressure cooker: about 2 atm inside (1 atm above the outside). Press “Heat (constant P)”: water does not boil until about 120.6 °C, so food cooks faster.')]; },
    yushan: function () { const p = ATM * Math.pow(1 - 2.25577e-5 * 3952, 5.25588); return ['water', K0 + 25, p, T('玉山頂（3952 m）的氣壓約 0.61 atm。按「等壓加熱」，水在約 87 °C 就沸騰，飯不容易煮熟。', 'On top of Yushan (3952 m) the air pressure is about 0.61 atm. Press “Heat (constant P)”: water boils at about 87 °C, so rice is hard to cook.')]; },
    dryice: function () { return ['co2', K0 - 90, ATM, T('乾冰（固態 CO2）在 1 atm。按「等壓加熱」，它在 −78.5 °C 直接昇華成氣體，不會留下液體。', 'Dry ice (solid CO2) at 1 atm. Press “Heat (constant P)”: at −78.5 °C it turns straight into gas and leaves no liquid.')]; },
    skate: function () { return ['water', K0 - 5, ATM, T('冰場約 −5 °C。按「等溫加壓」：要加到約 590 atm 冰才會熔化，而冰刀只多出約 20 atm（見下方的溜冰卡）。', 'An ice rink at about −5 °C. Press “Compress (constant T)”: the ice only melts at about 590 atm, while a skate blade adds only about 20 atm (see the skating card).')]; },
    freezedry: function () { return ['water', K0 - 40, ATM, T('冷凍乾燥：食物先冷凍到 −40 °C。先「等溫減壓」到比三相點低得多的壓力（例如 20 Pa），再停下來慢慢「等壓加熱」：冰直接昇華，食物不會被水泡過。', 'Freeze-drying: the food is first frozen to −40 °C. Lower the pressure at constant temperature far below the triple point (say 20 Pa), stop, then warm it gently at constant pressure: the ice sublimes and the food is never soaked.')]; },
    iodine: function () { return ['iodine', K0 + 80, ATM, T('碘晶體在 1 atm。室溫的蒸氣壓就有約 40 Pa，密閉容器裡會出現紫色蒸氣；按「等壓加熱」，它在 113.5 °C 熔化、184.4 °C 沸騰。', 'Iodine crystals at 1 atm. Even at room temperature the vapour pressure is about 40 Pa, so a closed flask fills with violet vapour. Press “Heat (constant P)”: it melts at 113.5 °C and boils at 184.4 °C.')]; },
    scco2: function () { return ['co2', K0 + 40, 200 * ATM, T('超臨界 CO2 萃取（例如去除咖啡因）：約 40 °C、200 atm。超臨界流體像氣體一樣鑽進咖啡豆，又像液體一樣溶解咖啡因；減壓後 CO2 變回氣體，不留殘餘。', 'Supercritical CO2 extraction (for example decaffeination): about 40 °C and 200 atm. The fluid seeps into the beans like a gas and dissolves caffeine like a liquid; on release it turns back into gas and leaves nothing behind.')]; },
    extinguisher: function () { return ['co2', K0 + 20, C.pvap('co2', K0 + 20), T('CO2 滅火器：鋼瓶裡液態與氣態 CO2 共存，20 °C 時壓力約 57 atm（就是這個溫度的蒸氣壓）。按「等溫減壓」看它噴出到低壓時沸騰。', 'CO2 extinguisher: liquid and gaseous CO2 coexist in the cylinder; at 20 °C the pressure is about 57 atm (the vapour pressure). Press “Expand (constant T)” to see it boil as it is released.')]; }
  };
  function applyExample(k) {
    const e = EX[k]();
    if (e[0] !== st.sub) setSub(e[0], e[1], e[2]);
    else teleport(e[1], e[2]);
    statusBase = '';
    setStatus(e[3]);
  }

  // ======================= 操作 =======================
  function act() { acted = true; }
  function canvasXY(ev) { const b = cv.getBoundingClientRect(); return [ev.clientX - b.left, ev.clientY - b.top]; }
  function inPlot(x, y) { return G && x >= G.pl - 10 && x <= G.pr + 10 && y >= G.pt - 10 && y <= G.pb + 10; }
  function nearPoint(x, y) { return Math.hypot(x - X(st.T), y - Y(st.P)) < 22; }
  function snapped(Tk, P) {
    if (!st.snap) return [Tk, P];
    const s = Tr(), x = X(Tk), y = Y(P), lim = 9;
    let best = null, bd = lim;
    const gb = C.gasBoundary(st.sub, Tk);
    if (isFinite(gb)) { const d = Math.abs(Y(gb) - y); if (d < bd) { bd = d; best = [Tk, gb]; } }
    if (P >= s.pt) { const tm = C.Tmelt(st.sub, P); if (isFinite(tm)) { const d = Math.abs(X(tm) - x); if (d < bd) { bd = d; best = [tm, P]; } } }
    return best || [Tk, P];
  }
  cv.addEventListener('pointerdown', function (ev) {
    const p = canvasXY(ev);
    if (!inPlot(p[0], p[1])) return;
    act();
    stopPath();
    drag = { id: ev.pointerId };
    cv.setPointerCapture(ev.pointerId);
    ev.preventDefault();
    if (!nearPoint(p[0], p[1])) moveToXY(p[0], p[1]);
    requestDraw();
  });
  function moveToXY(x, y) {
    const xx = Math.max(G.pl, Math.min(G.pr, x)), yy = Math.max(G.pt, Math.min(G.pb, y));
    const q = snapped(invX(xx), invY(yy));
    userMove(q[0], q[1], 'drag', 'drag');
  }
  cv.addEventListener('pointermove', function (ev) {
    const p = canvasXY(ev);
    if (!drag) {
      const h = inPlot(p[0], p[1]);
      cv.style.cursor = h ? (nearPoint(p[0], p[1]) ? 'grab' : 'crosshair') : '';
      const nh = h && nearPoint(p[0], p[1]);
      if (nh !== hover) { hover = nh; requestDraw(); }
      return;
    }
    cv.style.cursor = 'grabbing';
    moveToXY(p[0], p[1]);
  });
  function endDrag() { if (drag) { drag = null; requestDraw(); } }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);
  cv.addEventListener('pointerleave', function () { if (hover) { hover = false; requestDraw(); } });

  function onSlider(el) {
    if (syncing) return;
    act();
    stopPath();
    if (el === elT) { const v = valT(); userMove(v, st.P, v >= st.T ? 'heat' : 'cool', 'slider'); }
    else { const v = valP(); userMove(st.T, v, v >= st.P ? 'press' : 'depress', 'slider'); }
    refreshOutputs();
  }
  elT.addEventListener('input', function () { onSlider(elT); });
  elP.addEventListener('input', function () { onSlider(elP); });
  [elMass, elArea].forEach(function (el) { el.addEventListener('input', function () { if (!syncing) act(); updateSkate(); }); });
  $('snap').addEventListener('change', function () { act(); st.snap = $('snap').checked; });
  Object.keys(PATHS).forEach(function (m) { $(PATHS[m]).addEventListener('click', function () { act(); startPath(m); }); });
  $('stop').addEventListener('click', function () { act(); stopPath(); setStatus(T('已停止。', 'Stopped.')); });
  $('clearAll').addEventListener('click', function () {
    act();
    stopPath();
    trail = [];
    tr.clear();
    updateTable(); updateClap(); drawGraph(); requestDraw();
    setStatus(T('已清除路徑、紀錄表與兩點式的結果。', 'The path trace, the table and the two-point results have been cleared.'));
  });
  $('soundBtn').addEventListener('click', function () {
    if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound'));
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) {
    if (ev.detail && ev.detail.name === 'sound') updateSoundButton();
    if (ev.detail && ev.detail.name === 'fs') { layout(); resizeGraph(); drawGraph(); requestDraw(); }
  });
  document.querySelectorAll('#subSeg button').forEach(function (b) { b.addEventListener('click', function () { act(); if (b.dataset.sub !== st.sub) { setSub(b.dataset.sub); setStatus(''); } }); });
  document.querySelectorAll('#exGrid button').forEach(function (b) { b.addEventListener('click', function () { act(); applyExample(b.dataset.ex); }); });
  document.querySelectorAll('#tabs button').forEach(function (b) {
    b.addEventListener('click', function () {
      act();
      st.tab = b.dataset.tab;
      document.querySelectorAll('#tabs button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      updateGraphText(); drawGraph();
    });
  });
  if (window.LabKeys) {
    kb = window.LabKeys.attach(cv, {
      label: T('相圖。方向鍵左右改變溫度（等壓）、上下改變壓力（等溫），Shift 加方向鍵改變得更多。', 'Phase diagram. Left and right arrows change the temperature (constant pressure), up and down change the pressure (constant temperature); hold Shift for bigger steps.'),
      items: [
        { name: function () { return T('狀態點', 'State point'); },
          move: function (dx, dy, big) {
            act(); stopPath();
            const s = Tr();
            if (dx) userMove(st.T + dx * (big ? 5 : 0.5), st.P, dx > 0 ? 'heat' : 'cool', 'key');
            else if (dy) userMove(st.T, st.P * Math.exp(dy * (big ? 0.1 : 0.01) * Math.log(s.Pmax / s.Pmin)), dy > 0 ? 'press' : 'depress', 'key');
            else return false;
            return true;
          },
          describe: function () { const ph = C.phase(st.sub, st.T, st.P); return cTxt(st.T, 2) + ', ' + pTxt(st.P, 4) + ', ' + phName(ph); } }
      ],
      onChange: function () { requestDraw(); }
    });
  }

  function themeChanged() {
    if (LD.refresh) LD.refresh();
    readColors();
    bgKey = '';
    updateReadouts();
    updateSubInfo();
    updateTable(); updateClap(); updateSkate(); buildDataTable();
    requestDraw();
  }
  window.addEventListener('lab:themechange', themeChanged);
  window.addEventListener('lab:langchange', themeChanged);
  if (window.ResizeObserver) {
    let lw = 0, lg = 0;
    new ResizeObserver(function () { if (cv.clientWidth && cv.clientWidth !== lw) { lw = cv.clientWidth; layout(); requestDraw(); } }).observe(cv);
    new ResizeObserver(function () { if (gcv.clientWidth !== lg) { lg = gcv.clientWidth; resizeGraph(); drawGraph(); } }).observe(gcv);
  } else window.addEventListener('resize', function () { layout(); resizeGraph(); drawGraph(); requestDraw(); });

  // 測試用（Playwright）：讀取狀態
  window.__phd = {
    state: st, tracker: tr, phase: function () { return C.phase(st.sub, st.T, st.P); }, line: lineNow,
    pause: function () { return pause; }, acted: function () { return acted; }
  };

  // ======================= 啟動 =======================
  readColors();
  setRanges();
  layout();
  resizeGraph();
  buildDataTable();
  updateSubInfo();
  syncSliders();
  updateSkate();
  updateTable();
  updateClap();
  updateSoundButton();
  updateReadouts();
  pushTrail(true);
  requestDraw();
  if (reducedMotion) setStatus(T('已偵測到「減少動態效果」設定：分子不晃動，路徑照常可用。', 'Reduced motion is on: the molecules stay still; the paths still work.'));
})();
