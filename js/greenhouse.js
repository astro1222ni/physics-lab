/* greenhouse.js — 「溫室效應與地球的能量平衡」的畫面與互動
 * 物理計算全部在 greenhouse-core.js；3D 地球在 greenhouse-3d.js，切換到 3D 時才載入。 */
(function () {
  'use strict';
  const K = window.GreenhouseCore;
  const D = window.LabDraw;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const SCRIPT_V = (function () {
    const s = document.currentScript, m = s && /[?&]v=(\w+)/.exec(s.src);
    return m ? m[1] : '';
  })();
  const FONT = D.FONT;
  const TMIN = 200, TMAX = 340;       // 溫度計與圖表的溫度範圍（K）
  const SMIN = 70, SMAX = 140;        // 太陽亮度範圍（%）
  const EQ_N = 0.05;                  // |N| 小於這個值（W/m²）且離平衡 0.05 K 內算「已達平衡」
  const SNOW = 0.95;                  // 冰覆蓋 95% 以上（冰緣離赤道 3° 內）算雪球地球
  const DEF_EPS = 0.779;              // ε0 滑桿的預設值（代表校正值 K.EPS0）

  // =====================================================================
  // 狀態
  // =====================================================================
  const el = { sun: $('sun'), alb: $('alb'), co2: $('co2'), eps: $('eps') };
  const state = {
    S: 1, co2: 280, eps0: K.EPS0, alpha0: 0.3, wv: false, ice: false,
    T: 288, t: 0,                     // 地表溫度（K）、經過時間（年）
    running: false, speed: 5,         // 每秒幾年
    hist: [{ t: 0, T: 288 }],         // 溫度紀錄
    trace: [{ S: 100, T: 288 }],      // 遲滯圖上走過的路（S 用 %）
    pathMax: 288, pathMin: 288, wasSnow: false,
    chart: 'time', acted: false
  };
  function params() { return { S: state.S, co2: state.co2, eps0: state.eps0, alpha0: state.alpha0, wv: state.wv, ice: state.ice }; }
  function readSliders() {
    state.S = val(el.sun) / 100;
    state.co2 = Math.max(1, val(el.co2));
    const e = val(el.eps);
    state.eps0 = Math.abs(e - DEF_EPS) < 1e-9 ? K.EPS0 : e;
    state.alpha0 = val(el.alb);
  }
  function isSnow(P, Tk) { return P.ice && K.iceFraction(P, Tk) >= SNOW; }
  /** 目前狀態的完整數值（讀數、畫圖、任務事件共用） */
  let cache = null, cacheKey = '';
  function now() {
    const P = params();
    const key = [P.S, P.co2, P.eps0, P.alpha0, P.wv, P.ice, state.T].join('|');
    if (cache && cacheKey === key) return cache;
    const f = K.flows(P, state.T);
    const Teq = K.settle(P, state.T);
    const base = K.baseline(P);
    cacheKey = key;
    cache = { P: P, f: f, Teq: Teq, base: base, iceFrac: K.iceFraction(P, state.T), iceLat: K.iceLatitude(P, state.T),
      eq: Math.abs(f.N) < EQ_N && Teq != null && Math.abs(Teq - state.T) < 0.05 };
    return cache;
  }
  function snapshot() {
    const c = now();
    return {
      S: state.S * 100, co2: state.co2, eps0: state.eps0, alpha0: state.alpha0, wv: state.wv, ice: state.ice,
      T: state.T, N: c.f.N, Teq: c.Teq, base: c.base,
      dT: c.base != null ? state.T - c.base : null, dTeq: c.base != null && c.Teq != null ? c.Teq - c.base : null,
      eq: c.eq, eps: c.f.eps, alpha: c.f.alpha, iceFrac: c.iceFrac, iceLat: c.iceLat, snow: isSnow(c.P, state.T),
      t: state.t, pathMax: state.pathMax, pathMin: state.pathMin, wasSnow: state.wasSnow
    };
  }

  // =====================================================================
  // 顏色與文字
  // =====================================================================
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--text', '--muted', '--border', '--accent', '--accent-soft', '--surface',
      '--gh-sky1', '--gh-sky2', '--gh-space', '--gh-atm', '--gh-sea', '--gh-land', '--gh-ice',
      '--gh-sun', '--gh-ir', '--gh-ir2', '--gh-refl', '--gh-asr', '--gh-olr', '--gh-eq', '--gh-warm', '--gh-cold', '--gh-trace']
      .forEach(function (k) { C[k.slice(2)] = cs.getPropertyValue(k).trim(); });
  }
  function num(v, d) {
    if (v == null || !isFinite(v)) return '—';
    let s = v.toFixed(d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  function sgn(v, d) { const s = num(v, d); return v > 0 && !/^0(\.0+)?$/.test(s) ? '+' + s : s; }
  function outNum(v, lo, hi) {
    let t = v.toFixed(hi);
    if (hi > lo) t = t.replace(new RegExp('0{1,' + (hi - lo) + '}$'), '').replace(/\.$/, '');
    return t.replace('-', '−');
  }
  function setHTML(id, html) { const e = $(id); if (e && e.innerHTML !== html) e.innerHTML = html; }
  function setOut(inp, txt) { const o = inp.parentNode.querySelector('output'); if (o && o.textContent !== txt && !o.dataset.editing) o.textContent = txt; }
  function cel(Tk) { return num(Tk - 273.15, 1) + ' °C'; }
  function kc(Tk) { return num(Tk, 1) + ' K（' + cel(Tk) + '）'; }
  function kcEn(Tk) { return num(Tk, 1) + ' K (' + cel(Tk) + ')'; }
  function tempText(Tk) { return T(kc(Tk), kcEn(Tk)); }
  function years(t) { return num(t, t < 10 ? 2 : t < 100 ? 1 : 0) + T(' 年', ' yr'); }
  function iceText(c) {
    if (!state.ice) return T('（冰反照率回饋關閉）', '(ice-albedo feedback off)');
    if (c.iceFrac >= SNOW) return T('全球結冰（雪球地球）', 'frozen almost to the equator (snowball Earth)');
    if (c.iceLat > 89.5) return T('沒有冰', 'no ice');
    return T('南北緯 ', '') + num(c.iceLat, 1) + T('° 以上結冰', '° N and S (ice poleward of it)');
  }

  // =====================================================================
  // 畫布
  // =====================================================================
  const cv = $('cv'), ctx = cv.getContext('2d');
  const gr = $('gr'), gtx = gr.getContext('2d');
  let cvSize = null, grSize = null;
  function fit(c, g) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth || 300, h = c.clientHeight || 300;
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: w, h: h, dpr: dpr };
  }
  function resizeCv() { cvSize = fit(cv, ctx); grSize = fit(gr, gtx); hystKey = ''; requestDraw(); }

  // ---------- 能量流示意圖 ----------
  function flowLay(W, H) {
    const narrow = W < 520;
    const thermo = narrow ? 46 : 64;
    const Wp = W - thermo;
    const cols = (narrow ? [0.07, 0.21, 0.39, 0.56, 0.72] : [0.08, 0.23, 0.43, 0.62, 0.8]).map(function (f) { return Math.round(Wp * f); });
    const k = Math.max(0.028, Math.min(0.07, Wp / 10500));
    return { W: W, H: H, Wp: Wp, cols: cols, k: k, narrow: narrow, yTop: 34, yA0: H * 0.31, yA1: H * 0.49, yS: H * 0.8, tx: W - thermo / 2 };
  }
  /** 粗的能量流箭頭（寬度 ∝ W/m²）；fadeFrom：箭尾從透明漸入 */
  function flowArrow(g, x, y0, y1, w, color, opts) {
    opts = opts || {};
    if (w < 0.6) return;
    const dir = y1 > y0 ? 1 : -1;
    const head = opts.noHead ? 0 : Math.max(9, Math.min(22, w * 1.05));
    const hw = w / 2 + Math.max(4.5, w * 0.42);
    const yb = y1 - dir * head;
    const grad = g.createLinearGradient(0, y0, 0, y1);
    grad.addColorStop(0, D.alpha(color, opts.fadeFrom ? 0 : 0.72));
    grad.addColorStop(opts.fadeFrom ? 0.35 : 0.5, D.alpha(color, 0.85));
    grad.addColorStop(1, D.alpha(color, opts.fadeTo ? 0 : 0.98));
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(x - w / 2, y0); g.lineTo(x + w / 2, y0); g.lineTo(x + w / 2, yb);
    if (head) { g.lineTo(x + hw, yb); g.quadraticCurveTo(x + w * 0.2, y1 - dir * head * 0.35, x, y1); g.quadraticCurveTo(x - w * 0.2, y1 - dir * head * 0.35, x - hw, yb); }
    g.lineTo(x - w / 2, yb); g.closePath(); g.fill();
    // 管狀高光
    if (w > 4) {
      g.strokeStyle = D.alpha('#ffffff', D.dark ? 0.22 : 0.35); g.lineWidth = Math.max(1, w * 0.12); g.lineCap = 'round';
      g.beginPath(); g.moveTo(x - w * 0.22, y0 + (opts.fadeFrom ? (yb - y0) * 0.4 : 3 * dir)); g.lineTo(x - w * 0.22, yb - dir * 2); g.stroke();
    }
  }
  /** 沿箭頭移動的小光點（播放時才有，表示能量在流動） */
  function photons(g, x, y0, y1, w, color, phase) {
    if (w < 2) return;
    const L = Math.abs(y1 - y0), dir = y1 > y0 ? 1 : -1, gap = 26;
    const n = Math.max(1, Math.min(4, Math.round(w / 6)));
    g.fillStyle = D.alpha(D.mix(color, '#ffffff', 0.55), 0.85);
    for (let j = 0; j < n; j++) {
      const off = (n === 1 ? 0 : (j / (n - 1) - 0.5) * w * 0.6);
      for (let s = ((phase * 60 + j * 9) % gap); s < L - 14; s += gap) {
        g.beginPath(); g.arc(x + off, y0 + dir * s, Math.max(1.2, Math.min(2.4, w * 0.12)), 0, Math.PI * 2); g.fill();
      }
    }
  }
  function drawFlow(t) {
    if (!cvSize) return;
    const W = cvSize.w, H = cvSize.h, L = flowLay(W, H), g = ctx, c = now(), f = c.f;
    g.clearRect(0, 0, W, H);
    // 天空：上方太空、往下漸亮
    const sky = g.createLinearGradient(0, 0, 0, L.yS);
    sky.addColorStop(0, C['gh-space']); sky.addColorStop(0.24, D.mix(C['gh-space'], C['gh-sky1'], 0.35));
    sky.addColorStop(0.62, C['gh-sky1']); sky.addColorStop(1, C['gh-sky2']);
    g.fillStyle = sky; g.fillRect(0, 0, W, L.yS);
    // 星星（只在太空區）
    g.fillStyle = D.alpha('#ffffff', 0.55);
    for (let i = 0; i < 28; i++) { const sx = ((i * 97) % 1000) / 1000 * W, sy = ((i * 61) % 100) / 100 * L.yA0 * 0.55; g.fillRect(sx, sy, 1.2, 1.2); }
    // 太陽：左上角
    const sr = 26 + 10 * (state.S - 1);
    const sx = L.cols[0], sy = 6;
    const sg = g.createRadialGradient(sx, sy, 2, sx, sy, sr * 2.2);
    sg.addColorStop(0, D.alpha('#fffbe6', 1)); sg.addColorStop(0.35, D.alpha(C['gh-sun'], 0.85)); sg.addColorStop(1, D.alpha(C['gh-sun'], 0));
    g.fillStyle = sg; g.beginPath(); g.arc(sx, sy, sr * 2.2, 0, Math.PI * 2); g.fill();
    // 大氣層：不透明度隨 ε
    const aTop = L.yA0, aBot = L.yA1, aMid = (aTop + aBot) / 2;
    const ag = g.createLinearGradient(0, aTop - 14, 0, aBot + 14);
    const aa = (D.dark ? 0.1 : 0.14) + (D.dark ? 0.5 : 0.62) * f.eps;
    ag.addColorStop(0, D.alpha(C['gh-atm'], 0)); ag.addColorStop(0.25, D.alpha(C['gh-atm'], aa)); ag.addColorStop(0.75, D.alpha(C['gh-atm'], aa));
    ag.addColorStop(1, D.alpha(C['gh-atm'], 0));
    g.fillStyle = ag; g.fillRect(0, aTop - 14, W, aBot - aTop + 28);
    g.strokeStyle = D.alpha('#ffffff', (D.dark ? 0.06 : 0.22) * (0.3 + f.eps)); g.lineWidth = 1.2; g.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const yy = aTop + (aBot - aTop) * (0.2 + i * 0.2);
      g.beginPath();
      for (let xx = 0; xx <= W; xx += 12) { const y2 = yy + Math.sin(xx / 47 + i * 1.7) * 2.2; if (xx) g.lineTo(xx, y2); else g.moveTo(xx, y2); }
      g.stroke();
    }
    // 地面：海、陸地、冰
    const sea = g.createLinearGradient(0, L.yS, 0, H);
    sea.addColorStop(0, D.shade(C['gh-sea'], 0.12)); sea.addColorStop(1, D.shade(C['gh-sea'], -0.25));
    g.fillStyle = sea; g.fillRect(0, L.yS, W, H - L.yS);
    const land = g.createLinearGradient(0, L.yS - 6, 0, H);
    land.addColorStop(0, D.shade(C['gh-land'], 0.12)); land.addColorStop(1, D.shade(C['gh-land'], -0.22));
    g.fillStyle = land;
    g.beginPath(); g.moveTo(L.Wp * 0.33, H); g.lineTo(L.Wp * 0.36, L.yS + 2); g.quadraticCurveTo(L.Wp * 0.45, L.yS - 8, L.Wp * 0.52, L.yS - 2);
    g.quadraticCurveTo(L.Wp * 0.58, L.yS - 6, L.Wp * 0.64, L.yS + 3); g.lineTo(L.Wp * 0.66, H); g.closePath(); g.fill();
    if (state.ice && c.iceFrac > 0.002) {
      const iw = c.iceFrac * W / 2 + (c.iceFrac > 0.97 ? 8 : 0);
      const ig = g.createLinearGradient(0, L.yS - 4, 0, H);
      ig.addColorStop(0, '#ffffff'); ig.addColorStop(1, D.mix(C['gh-ice'], C['gh-sea'], 0.2));
      g.fillStyle = ig;
      g.beginPath(); g.moveTo(0, H); g.lineTo(0, L.yS - 9); g.lineTo(iw - 4, L.yS - 9); g.quadraticCurveTo(iw + 3, L.yS - 7, iw + 2, H); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(W, H); g.lineTo(W, L.yS - 9); g.lineTo(W - iw + 4, L.yS - 9); g.quadraticCurveTo(W - iw - 3, L.yS - 7, W - iw - 2, H); g.closePath(); g.fill();
    }
    // 地面上緣的細亮線
    g.strokeStyle = D.alpha('#ffffff', 0.35); g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, L.yS + 0.5); g.lineTo(W, L.yS + 0.5); g.stroke();

    // 能量流
    const k = L.k, x = L.cols, top = L.yTop, gs = L.yS - 2;
    flowArrow(g, x[0], top - 8, gs, f.incoming * k, C['gh-sun']);
    flowArrow(g, x[1], gs, top, f.reflected * k, C['gh-refl']);
    flowArrow(g, x[2], gs, aMid + 4, f.surface * k, C['gh-ir'], { noHead: true, fadeTo: true });
    flowArrow(g, x[2], aMid, top, f.through * k, C['gh-ir'], { fadeFrom: true });
    flowArrow(g, x[3], aMid, gs, f.atmDown * k, C['gh-ir2'], { fadeFrom: true });
    flowArrow(g, x[4], aMid, top, f.atmUp * k, C['gh-ir2'], { fadeFrom: true });
    if (state.running && !reducedMotion) {
      const ph = t / 1000;
      photons(g, x[0], top, gs - 10, f.incoming * k, C['gh-sun'], ph);
      photons(g, x[1], gs, top + 10, f.reflected * k, C['gh-refl'], ph);
      photons(g, x[2], gs, aMid, f.surface * k, C['gh-ir'], ph);
      photons(g, x[2], aMid, top + 10, f.through * k, C['gh-ir'], ph);
      photons(g, x[3], aMid, gs - 10, f.atmDown * k, C['gh-ir2'], ph);
      photons(g, x[4], aMid, top + 10, f.atmUp * k, C['gh-ir2'], ph);
    }
    // 數值與名稱
    const fs = L.narrow ? 11 : 12;
    const yv = Math.round(L.yA0 * 0.62), yl = (L.yA1 + L.yS) / 2;
    const pills = [
      [x[0], yv, f.incoming, C['gh-sun'], T('陽光', 'Sun')],
      [x[1], yv, f.reflected, C['gh-refl'], T('反射', 'Reflected')],
      [x[2], yv, f.through, C['gh-ir'], T('穿透', 'Escapes')],
      [x[4], yv, f.atmUp, C['gh-ir2'], T('大氣往上', 'Air → up')],
      [x[2], yl, f.surface, C['gh-ir'], T('地面放出', 'Ground')],
      [x[3], yl, f.atmDown, C['gh-ir2'], T('回輻射', 'Back')]
    ];
    pills.forEach(function (p) {
      const lab = L.narrow ? p[4].replace(T('大氣往上', 'Air → up'), T('大氣', 'Air')).replace(T('地面放出', 'Ground'), T('地面', 'Ground')) : p[4];
      D.pill(g, num(p[2], 0), p[0], p[1], p[3], 'center', '700 ' + (fs + 1) + 'px ' + FONT);
      D.haloText(g, lab, p[0], p[1] + 14, p[3] === C['gh-refl'] || p[3] === C['gh-sun'] ? D.mix(p[3], C.text, 0.35) : p[3], 'center', 'middle', '600 ' + fs + 'px ' + FONT);
    });
    // 大氣層標籤：放在最右邊一欄箭頭與溫度計之間
    const lx = (x[4] + L.Wp) / 2 + 4, atmInk = D.dark ? D.shade(C['gh-atm'], 0.45) : D.shade(C['gh-atm'], -0.45);
    D.haloText(g, T('大氣層', 'Atmosphere'), lx, aMid - 9, atmInk, 'center', 'middle', '700 ' + fs + 'px ' + FONT);
    D.haloText(g, 'ε ' + num(f.eps, 3), lx, aMid + 6, atmInk, 'center', 'middle', '600 ' + fs + 'px ' + FONT);
    D.haloText(g, num(f.Ta, 0) + ' K', lx, aMid + 20, D.alpha(atmInk, 0.85), 'center', 'middle', '500 ' + (fs - 0.5) + 'px ' + FONT);
    // 地表標籤
    D.pill(g, T('地表 ', 'Surface ') + num(state.T, 1) + ' K' + (state.ice && c.iceFrac > 0.02 ? T('・冰 ', ' · ice ') + num(c.iceFrac * 100, 0) + '%' : '') +
      (L.narrow ? '' : T('・反照率 ', ' · albedo ') + num(f.alpha, 3)), 6, H - 7, C.text, 'left', '600 ' + fs + 'px ' + FONT);
    // 右上：能量不平衡
    const Ncol = Math.abs(f.N) < EQ_N ? C['gh-eq'] : f.N > 0 ? C['gh-warm'] : C['gh-cold'];
    D.pill(g, 'N = ' + sgn(f.N, 2) + ' W/m²', L.W - 4, 22, Ncol, 'right', '700 ' + (fs + 1) + 'px ' + FONT);
    drawThermo(g, L, c);
  }
  function tY(L, Tk) { const y0 = L.yTop + 8, y1 = L.yS + 14; return y1 - (Math.max(TMIN, Math.min(TMAX, Tk)) - TMIN) / (TMAX - TMIN) * (y1 - y0); }
  function drawThermo(g, L, c) {
    const x = L.tx, y0 = L.yTop + 8, y1 = L.yS + 14, tw = L.narrow ? 8 : 10, br = tw * 1.15;
    // 底板
    g.fillStyle = D.alpha(C['canvas-bg'] || '#ffffff', 0.8);
    D.roundRect(g, x - tw / 2 - 5, y0 - 8, tw + 10, y1 - y0 + br + 16, 9); g.fill();
    g.strokeStyle = D.alpha(C.border, 0.9); g.lineWidth = 1; g.stroke();
    // 管
    g.fillStyle = D.alpha(C.muted, 0.15);
    D.roundRect(g, x - tw / 2, y0, tw, y1 - y0 + 4, tw / 2); g.fill();
    const fill = D.mix(C['gh-cold'], C['gh-warm'], Math.max(0, Math.min(1, (state.T - 230) / 80)));
    const yT = tY(L, state.T);
    const fg = g.createLinearGradient(x - tw / 2, 0, x + tw / 2, 0);
    fg.addColorStop(0, D.shade(fill, 0.25)); fg.addColorStop(0.6, fill); fg.addColorStop(1, D.shade(fill, -0.2));
    g.fillStyle = fg;
    g.fillRect(x - tw / 2 + 1.5, yT, tw - 3, y1 + 4 - yT);
    D.ball(g, x, y1 + br * 0.9, br, fill, { shadow: false });
    // 刻度：255（沒有溫室效應）、288（工業革命前）、目前的大氣溫度
    const fs = L.narrow ? 10 : 11;
    [[255, '255'], [288, '288']].forEach(function (m) {
      const y = Math.round(tY(L, m[0])) + 0.5;
      g.strokeStyle = C.muted; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x - tw / 2 - 5, y); g.lineTo(x - tw / 2 - 1, y); g.stroke();
      D.haloText(g, m[1], x - tw / 2 - 7, y, C.muted, 'right', 'middle', '500 ' + fs + 'px ' + FONT);
    });
    D.pill(g, num(state.T - 273.15, 1) + ' °C', L.W - 3, L.H - 6, fill, 'right', '700 ' + (fs + 1) + 'px ' + FONT);
  }

  // ---------- 圖表 ----------
  const GM = { l: 46, r: 14, t: 16, b: 34 };
  function niceStep(span, n) {
    const raw = span / n, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
  }
  function frame(g, W, H, x0, x1, y0, y1, xlab, ylab, xfmt, yfmt) {
    const X = function (v) { return GM.l + (v - x0) / (x1 - x0) * (W - GM.l - GM.r); };
    const Y = function (v) { return H - GM.b - (v - y0) / (y1 - y0) * (H - GM.t - GM.b); };
    g.fillStyle = C['canvas-bg']; g.fillRect(0, 0, W, H);
    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, D.dark ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.04)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    const fs = W < 520 ? 10.5 : 11.5;
    const xs = niceStep(x1 - x0, W < 520 ? 4 : 7), ys = niceStep(y1 - y0, 5);
    g.lineWidth = 1;
    for (let v = Math.ceil(x0 / xs) * xs; v <= x1 + 1e-9; v += xs) {
      const px = Math.round(X(v)) + 0.5;
      g.strokeStyle = D.alpha(C.text, 0.08); g.lineWidth = 1; g.beginPath(); g.moveTo(px, GM.t); g.lineTo(px, H - GM.b); g.stroke();
      D.haloText(g, xfmt(v), px, H - GM.b + 12, C.muted, 'center', 'middle', '500 ' + fs + 'px ' + FONT);
    }
    for (let v = Math.ceil(y0 / ys) * ys; v <= y1 + 1e-9; v += ys) {
      const py = Math.round(Y(v)) + 0.5;
      g.strokeStyle = D.alpha(C.text, 0.08); g.lineWidth = 1; g.beginPath(); g.moveTo(GM.l, py); g.lineTo(W - GM.r, py); g.stroke();
      D.haloText(g, yfmt(v), GM.l - 5, py, C.muted, 'right', 'middle', '500 ' + fs + 'px ' + FONT);
    }
    g.strokeStyle = D.alpha(C.text, 0.35); g.lineWidth = 1;
    g.beginPath(); g.moveTo(GM.l + 0.5, GM.t); g.lineTo(GM.l + 0.5, H - GM.b + 0.5); g.lineTo(W - GM.r, H - GM.b + 0.5); g.stroke();
    D.haloText(g, xlab, W - GM.r, H - 6, C.muted, 'right', 'bottom', '600 ' + fs + 'px ' + FONT);
    D.haloText(g, ylab, GM.l + 6, GM.t + 2, C.muted, 'left', 'top', '600 ' + fs + 'px ' + FONT);
    return { X: X, Y: Y, fs: fs };
  }
  function line(g, pts, X, Y, color, w, dash) {
    if (pts.length < 2) return;
    g.save(); g.strokeStyle = color; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; if (dash) g.setLineDash(dash);
    g.beginPath(); pts.forEach(function (p, i) { if (i) g.lineTo(X(p[0]), Y(p[1])); else g.moveTo(X(p[0]), Y(p[1])); }); g.stroke(); g.restore();
  }
  function drawChart() {
    if (!grSize) return;
    const W = grSize.w, H = grSize.h, g = gtx, c = now();
    g.clearRect(0, 0, W, H);
    if (state.chart === 'time') drawTime(g, W, H, c);
    else if (state.chart === 'balance') drawBalance(g, W, H, c);
    else drawHyst(g, W, H, c);
  }
  function drawTime(g, W, H, c) {
    const h = state.hist;
    const tEnd = Math.max(10, state.t * 1.06);
    let lo = Infinity, hi = -Infinity;
    h.forEach(function (p) { lo = Math.min(lo, p.T); hi = Math.max(hi, p.T); });
    if (c.Teq != null) { lo = Math.min(lo, c.Teq); hi = Math.max(hi, c.Teq); }
    const mid = (lo + hi) / 2, span = Math.max(4, (hi - lo) * 1.2);
    const F = frame(g, W, H, 0, tEnd, mid - span / 2, mid + span / 2, T('時間（年）', 'Time (years)'), T('地表溫度（K）', 'Surface temperature (K)'),
      function (v) { return num(v, v < 10 && tEnd < 20 ? 0 : 0); }, function (v) { return num(v, span < 8 ? 1 : 0); });
    if (c.Teq != null) {
      const y = F.Y(c.Teq);
      line(g, [[0, c.Teq], [tEnd, c.Teq]], F.X, F.Y, C['gh-eq'], 1.5, [6, 5]);
      D.pill(g, T('最後停在 ', 'Settles at ') + num(c.Teq, 2) + ' K', W - GM.r - 4, y - 6, C['gh-eq'], 'right', '600 ' + F.fs + 'px ' + FONT);
    }
    const pts = h.map(function (p) { return [p.t, p.T]; });
    pts.push([state.t, state.T]);
    line(g, pts, F.X, F.Y, D.alpha(C['gh-warm'], 0.25), 6);
    line(g, pts, F.X, F.Y, C['gh-warm'], 2.2);
    D.ball(g, F.X(state.t), F.Y(state.T), 5, C['gh-warm'], { glow: state.running ? 0.5 : undefined });
  }
  function balanceRange(c) {
    let hi = 0;
    for (let x = TMIN; x <= TMAX; x += 5) hi = Math.max(hi, K.asr(c.P, x), K.olr(c.P, x));
    return Math.ceil(hi / 50) * 50 + 20;
  }
  function drawBalance(g, W, H, c) {
    const yMax = balanceRange(c);
    const F = frame(g, W, H, TMIN, TMAX, 0, yMax, T('地表溫度（K）', 'Surface temperature (K)'), T('能量（W/m²）', 'Energy (W/m²)'),
      function (v) { return num(v, 0); }, function (v) { return num(v, 0); });
    const A = [], O = [];
    for (let x = TMIN; x <= TMAX + 1e-9; x += 1) { A.push([x, K.asr(c.P, x)]); O.push([x, K.olr(c.P, x)]); }
    // 兩條曲線之間：吸收比放出多（變暖）塗暖色，反之塗冷色
    for (let i = 0; i < A.length - 1; i++) {
      const warm = A[i][1] + A[i + 1][1] > O[i][1] + O[i + 1][1];
      g.fillStyle = D.alpha(warm ? C['gh-warm'] : C['gh-cold'], 0.1);
      g.beginPath(); g.moveTo(F.X(A[i][0]), F.Y(A[i][1])); g.lineTo(F.X(A[i + 1][0]), F.Y(A[i + 1][1]));
      g.lineTo(F.X(O[i + 1][0]), F.Y(O[i + 1][1])); g.lineTo(F.X(O[i][0]), F.Y(O[i][1])); g.closePath(); g.fill();
    }
    line(g, A, F.X, F.Y, C['gh-asr'], 2.4);
    line(g, O, F.X, F.Y, C['gh-olr'], 2.4, [7, 4]);
    // 平衡點
    K.equilibria(c.P, TMIN, TMAX).forEach(function (e) {
      const px = F.X(e.T), py = F.Y(K.asr(c.P, e.T));
      g.lineWidth = 2; g.strokeStyle = C['gh-eq'];
      g.fillStyle = e.stable ? C['gh-eq'] : C['canvas-bg'];
      g.beginPath(); g.arc(px, py, 5.5, 0, Math.PI * 2); g.fill(); g.stroke();
    });
    // 目前的溫度
    const px = F.X(state.T);
    g.save(); g.strokeStyle = D.alpha(C.text, 0.45); g.setLineDash([3, 4]); g.lineWidth = 1;
    g.beginPath(); g.moveTo(px, GM.t); g.lineTo(px, H - GM.b); g.stroke(); g.restore();
    const ya = F.Y(c.f.absorbed), yo = F.Y(c.f.olr);
    g.strokeStyle = Math.abs(c.f.N) < EQ_N ? C['gh-eq'] : c.f.N > 0 ? C['gh-warm'] : C['gh-cold']; g.lineWidth = 3; g.lineCap = 'round';
    g.beginPath(); g.moveTo(px, ya); g.lineTo(px, yo); g.stroke();
    D.ball(g, px, ya, 4.5, C['gh-asr']); D.ball(g, px, yo, 4.5, C['gh-olr']);
    if (Math.abs(c.f.N) >= EQ_N) {
      const dir = c.f.N > 0 ? 1 : -1, ym = (ya + yo) / 2;
      D.arrow(g, px + dir * 8, ym, px + dir * 34, ym, g.strokeStyle, 2.2);
    }
    // 圖例
    const lx = W < 520 ? GM.l + 8 : W - GM.r - 8, al = W < 520 ? 'left' : 'right';
    D.haloText(g, T('吸收的陽光（實線）', 'Sunlight absorbed (solid)'), lx, GM.t + 22, C['gh-asr'], al, 'middle', '600 ' + F.fs + 'px ' + FONT);
    D.haloText(g, T('射向太空的紅外線（虛線）', 'Infrared to space (dashed)'), lx, GM.t + 38, C['gh-olr'], al, 'middle', '600 ' + F.fs + 'px ' + FONT);
  }
  // 遲滯圖：每個太陽亮度的所有平衡溫度（參數改變時才重算）
  let hystKey = '', hystSeg = [];
  function hystData(c) {
    const P = Object.assign({}, c.P);
    const key = [P.co2, P.eps0, P.alpha0, P.wv, P.ice].join('|');
    if (key === hystKey) return hystSeg;
    hystKey = key;
    const cols = [];
    for (let s = SMIN; s <= SMAX + 1e-9; s += 0.5) { P.S = s / 100; cols.push({ S: s, eq: K.equilibria(P, TMIN - 40, TMAX + 60) }); }
    const segs = [];
    for (let i = 0; i < cols.length - 1; i++) {
      cols[i].eq.forEach(function (a) {
        let best = null;
        cols[i + 1].eq.forEach(function (b) { if (b.stable === a.stable && Math.abs(b.T - a.T) < 8 && (!best || Math.abs(b.T - a.T) < Math.abs(best.T - a.T))) best = b; });
        if (best) segs.push({ s0: cols[i].S, t0: a.T, s1: cols[i + 1].S, t1: best.T, stable: a.stable });
      });
    }
    // 首尾相接的線段串成折線（虛線才會連續）
    const lines = [];
    segs.forEach(function (s) {
      const ln = lines.find(function (l) { const q = l.pts[l.pts.length - 1]; return l.stable === s.stable && q[0] === s.s0 && q[1] === s.t0; });
      if (ln) ln.pts.push([s.s1, s.t1]); else lines.push({ stable: s.stable, pts: [[s.s0, s.t0], [s.s1, s.t1]] });
    });
    hystSeg = lines;
    return lines;
  }
  function drawHyst(g, W, H, c) {
    const F = frame(g, W, H, SMIN, SMAX, TMIN, TMAX, T('太陽亮度（%）', 'Brightness of the Sun (%)'), T('平衡溫度（K）', 'Equilibrium temperature (K)'),
      function (v) { return num(v, 0); }, function (v) { return num(v, 0); });
    // 今天的太陽
    line(g, [[100, TMIN], [100, TMAX]], F.X, F.Y, D.alpha(C.text, 0.3), 1, [2, 4]);
    // 冰點
    line(g, [[SMIN, 273.15], [SMAX, 273.15]], F.X, F.Y, D.alpha(C['gh-cold'], 0.45), 1, [2, 4]);
    D.haloText(g, '0 °C', W - GM.r - 2, F.Y(273.15) - 6, C['gh-cold'], 'right', 'bottom', '500 ' + F.fs + 'px ' + FONT);
    hystData(c).forEach(function (l) {
      line(g, l.pts, F.X, F.Y, l.stable ? C['gh-eq'] : D.alpha(C['gh-eq'], 0.75), l.stable ? 2.6 : 1.6, l.stable ? null : [5, 5]);
    });
    // 走過的路
    const tr = state.trace.map(function (p) { return [p.S, p.T]; });
    tr.push([state.S * 100, state.T]);
    line(g, tr, F.X, F.Y, D.alpha(C['gh-trace'], 0.3), 6);
    line(g, tr, F.X, F.Y, C['gh-trace'], 2);
    D.ball(g, F.X(state.S * 100), F.Y(state.T), 5.5, C['gh-trace'], { glow: state.running ? 0.5 : undefined });
    const lx = GM.l + 8;
    D.haloText(g, T('穩定的平衡（實線）／不穩定（虛線）', 'Stable equilibria (solid) / unstable (dashed)'), lx, GM.t + 22, C['gh-eq'], 'left', 'middle', '600 ' + F.fs + 'px ' + FONT);
    D.haloText(g, T('你走過的路', 'Your path'), lx, GM.t + 38, C['gh-trace'], 'left', 'middle', '600 ' + F.fs + 'px ' + FONT);
  }
  function chartAria() {
    return state.chart === 'time' ? T('溫度隨時間的變化', 'Temperature against time')
      : state.chart === 'balance' ? T('能量平衡圖：吸收的陽光與射出的紅外線隨溫度變化，點一下可以設定地表溫度', 'Energy-balance plot: absorbed sunlight and outgoing infrared against temperature; tap to set the surface temperature')
        : T('雪球與遲滯：各種太陽亮度下的平衡溫度與你走過的路', 'Snowball and hysteresis: equilibrium temperature for each brightness of the Sun, and your path');
  }

  // =====================================================================
  // 時間積分、路徑與事件
  // =====================================================================
  function emit(type, data) { if (state.acted && window.LabMission) window.LabMission.emit(type, data); }
  function acted() { state.acted = true; }
  function sound() { const S = window.LabSound; return S && S.enabled() ? S : null; }
  function setStatus(s) { $('status').innerHTML = s; }
  let lastHist = 0, lastTrace = null, snowNow = false, eqTime = 0;
  function record(force) {
    const h = state.hist;
    if (force || state.t - lastHist >= Math.max(0.02, state.speed / 40)) {
      h.push({ t: state.t, T: state.T }); lastHist = state.t;
      if (h.length > 3000) state.hist = h.filter(function (p, i) { return i % 2 === 0 || i === h.length - 1; });
    }
    const s = state.S * 100;
    if (!lastTrace || Math.abs(lastTrace.S - s) >= 0.25 || Math.abs(lastTrace.T - state.T) >= 0.4 || force) {
      lastTrace = { S: s, T: state.T }; state.trace.push(lastTrace);
      if (state.trace.length > 4000) state.trace.splice(0, state.trace.length - 4000);
    }
  }
  function track() {
    state.pathMax = Math.max(state.pathMax, state.T);
    state.pathMin = Math.min(state.pathMin, state.T);
    const P = params(), sn = isSnow(P, state.T);
    if (sn) state.wasSnow = true;
    if (sn !== snowNow) {
      const S = sound();
      if (sn) {
        if (S) S.sweep({ from: 700, to: 300, dur: 0.6, gain: 0.15 });
        setStatus(T('地球結冰了：冰一路擴張到赤道附近，成了雪球地球。', 'The Earth has frozen: the ice has spread almost to the equator — a snowball Earth.'));
      } else if (state.T > 255) {
        if (S) S.sweep({ from: 320, to: 760, dur: 0.6, gain: 0.15 });
        setStatus(T('冰退了：雪球地球融化。', 'The ice retreats: the snowball melts.'));
      }
      snowNow = sn;
    }
  }
  /** 手動設定溫度：路徑從這裡重新開始 */
  function setTemp(Tk) {
    acted();
    state.T = Math.max(TMIN - 40, Math.min(TMAX + 60, Tk));
    state.pathMax = state.pathMin = state.T;
    state.wasSnow = isSnow(params(), state.T);
    snowNow = state.wasSnow;
    eqTime = 0;
    record(true);
    afterChange(true);
  }
  function integrate(years) {
    const P = params();
    let left = years;
    while (left > 1e-9) {
      const h = Math.min(0.05, left);
      state.T = K.step(P, state.T, h * K.YEAR);
      state.t += h; left -= h;
      track();
    }
  }
  function jump() {
    acted();
    const P = params(), Teq = K.settle(P, state.T);
    if (Teq == null) return;
    // 真的積分過去（時間與路徑都照實際），最多 3000 年
    let guard = 0;
    while (guard++ < 60000) {
      const N = K.imbalance(P, state.T);
      if (Math.abs(N) < 1e-4 && Math.abs(state.T - Teq) < 1e-3) break;
      state.T = K.step(P, state.T, 0.05 * K.YEAR); state.t += 0.05; track();
      if (guard % 4 === 0) record();
      if (state.t > 1e7) break;
    }
    record(true);
    const S = sound(); if (S) S.tone({ freq: 660, dur: 0.12, type: 'triangle', gain: 0.16 });
    setStatus(T('已達到平衡：地表 ', 'Equilibrium reached: surface ') + tempText(state.T) + T('。', '.'));
    afterChange(true);
  }
  let lastEmit = 0;
  function afterChange(force) {
    cache = null;
    updateReadouts();
    const tNow = performance.now();
    if (force || tNow - lastEmit > 250) { lastEmit = tNow; emit('state', snapshot()); }
    requestDraw();
  }

  // =====================================================================
  // 讀數
  // =====================================================================
  function refreshOutputs() {
    setOut(el.sun, outNum(state.S * 100, 1, 2));
    setOut(el.co2, outNum(state.co2, 0, 1));
    setOut(el.eps, outNum(val(el.eps), 3, 3));
    setOut(el.alb, outNum(state.alpha0, 2, 3));
    $('albWrap').hidden = state.ice;
    $('albHint').hidden = !state.ice;
    $('fbWv').setAttribute('aria-pressed', String(state.wv));
    $('fbIce').setAttribute('aria-pressed', String(state.ice));
  }
  let lastSay = 0;
  function updateReadouts() {
    const c = now(), f = c.f;
    setHTML('rT', tempText(state.T));
    setHTML('rDT', c.base != null ? (function (d) { return Math.abs(d) < 0.005 ? T('一樣', 'the same') : (d > 0 ? T('暖 ', 'warmer by ') : T('冷 ', 'colder by ')) + num(Math.abs(d), 2) + ' K'; })(state.T - c.base) + T('<small>（和同設定、CO<sub>2</sub> 280 ppm 的平衡比）</small>', '<small> (vs. the same settings at 280 ppm CO<sub>2</sub>)</small>') : '—');
    setHTML('rN', sgn(f.N, 2) + ' W/m²' + (Math.abs(f.N) < EQ_N ? T('（收支平衡）', ' (balanced)') : f.N > 0 ? T('（變暖中）', ' (warming)') : T('（變冷中）', ' (cooling)')));
    setHTML('rEq', c.Teq != null ? tempText(c.Teq) : '—');
    setHTML('rTe', tempText(K.bareTemp(state.S, f.alpha)));
    setHTML('rAE', num(f.alpha, 3) + ' ／ ' + num(f.eps, 3));
    setHTML('rF', sgn(K.forcing(state.co2), 2) + ' W/m²');
    setHTML('rIce', iceText(c));
    setHTML('rTime', years(state.t));
    setHTML('sunHint', 'S = <b>' + num(K.S0 * state.S, 0) + '</b> W/m²' + T('，平均分到每平方公尺 S/4 = <b>', '; spread over the globe S/4 = <b>') + num(K.S0 * state.S / 4, 1) + '</b> W/m²' + T('。', '.'));
    setHTML('albHint', T('冰反照率回饋開啟：反照率由溫度決定，現在是 <b>', 'Ice-albedo feedback on: the albedo is set by the temperature, now <b>') + num(f.alpha, 3) + '</b>' + T('。', '.'));
    const s = K.sensitivity(c.P, state.T);
    setHTML('sensHint', s.lambda > 0
      ? T('在這個溫度，地球每暖 1 K 多送走 <b>', 'At this temperature each extra kelvin sends <b>') + num(s.lambda, 2) + T('</b> W/m²（回饋參數 λ）：CO<sub>2</sub> 加倍大約暖 <b>', '</b> W/m² more to space (feedback parameter λ): doubling CO<sub>2</sub> would warm it by about <b>') + num(s.linear, 1) + T('</b> K。', '</b> K.')
      : T('在這個溫度，回饋參數 λ ≤ 0：變暖反而吸收更多，狀態不穩定，會一路跑到別的平衡。', 'At this temperature λ ≤ 0: warming makes the planet absorb even more, so this state is unstable and runs away to another equilibrium.'));
    setHTML('chartHint', state.chart === 'time'
      ? T('紅線是地表溫度，綠色虛線是這組設定最後會停下來的溫度。海洋混合層的熱容量讓地球要好幾年才追上。', 'Red: the surface temperature. Dashed green: where these settings finally settle. The heat capacity of the ocean’s mixed layer makes the Earth take years to catch up.')
      : state.chart === 'balance'
        ? T('兩條曲線的交點就是平衡（實心＝穩定、空心＝不穩定）。暖色區吸收比放出多，地球往右（變暖）；冷色區往左。點圖可以把地表放到任何溫度。', 'Where the curves cross the planet is in balance (filled = stable, hollow = unstable). In the warm band it absorbs more than it emits and moves right (warms); in the cool band it moves left. Tap the plot to put the surface at any temperature.')
        : T('每個太陽亮度下的平衡溫度。打開冰反照率回饋，播放時慢慢調暗再調亮太陽，看紫色的路怎麼走：下去與回來不是同一條路。', 'Equilibrium temperature for each brightness of the Sun. With the ice-albedo feedback on, play and slowly dim the Sun, then brighten it again: the purple path down and the path back are different.'));
    const txt = T('地表 ', 'Surface ') + tempText(state.T) + T('，能量不平衡 ', ', energy imbalance ') + sgn(f.N, 2) + ' W/m²';
    const tn = performance.now();
    if ($('srNow').textContent !== txt && (!state.running || tn - lastSay > 4000)) { $('srNow').textContent = txt; lastSay = tn; }
  }
  function updatePlay() { $('play').textContent = state.running ? T('暫停', 'Pause') : T('播放', 'Play'); }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }

  // =====================================================================
  // 控制項
  // =====================================================================
  function setSeg(id, attr, v) {
    document.querySelectorAll('#' + id + ' button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute(attr) === String(v))); });
  }
  Object.keys(el).forEach(function (k) {
    el[k].addEventListener('input', function () { acted(); readSliders(); refreshOutputs(); record(); afterChange(); });
    el[k].addEventListener('change', function () { readSliders(); refreshOutputs(); record(); afterChange(true); });
  });
  function setSlider(inp, v) { if (window.LabNum) window.LabNum.set(inp, v); else inp.value = v; }
  document.querySelectorAll('.presets button').forEach(function (b) {
    b.addEventListener('click', function () {
      acted();
      setSlider(el.co2, +b.getAttribute('data-co2'));
      readSliders(); refreshOutputs(); record();
      const c = now();
      setStatus(T('CO<sub>2</sub> 改成 ', 'CO<sub>2</sub> set to ') + num(state.co2, 0) + ' ppm' + T('：輻射強迫 ', ': radiative forcing ') + sgn(K.forcing(state.co2), 2) + ' W/m²' +
        (Math.abs(c.f.N) >= EQ_N ? T('，地球現在', '; the Earth is now ') + (c.f.N > 0 ? T('收入比支出多，會慢慢變暖。', 'taking in more than it gives out and will slowly warm.') : T('支出比收入多，會慢慢變冷。', 'giving out more than it takes in and will slowly cool.')) : T('。', '.')));
      afterChange(true);
    });
  });
  function toggleFb(which) {
    acted();
    state[which] = !state[which];
    refreshOutputs(); hystKey = '';
    snowNow = isSnow(params(), state.T);
    afterChange(true);
  }
  $('fbWv').addEventListener('click', function () { toggleFb('wv'); });
  $('fbIce').addEventListener('click', function () { toggleFb('ice'); });
  document.querySelectorAll('#speedSeg button').forEach(function (b) {
    b.addEventListener('click', function () { state.speed = +b.getAttribute('data-speed'); setSeg('speedSeg', 'data-speed', state.speed); });
  });
  document.querySelectorAll('#chartSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      acted();
      state.chart = b.getAttribute('data-chart');
      setSeg('chartSeg', 'data-chart', state.chart);
      gr.setAttribute('aria-label', chartAria());
      gr.style.cursor = state.chart === 'balance' ? 'crosshair' : 'default';
      updateReadouts(); requestDraw();
      emit('chart', { chart: state.chart });
    });
  });
  $('play').addEventListener('click', function () {
    acted();
    state.running = !state.running; eqTime = 0;
    updatePlay();
    if (state.running) setStatus(T('時間開始走：每秒 ', 'Time is running: ') + state.speed + T(' 年。', ' years per second.'));
    requestDraw();
  });
  $('jump').addEventListener('click', jump);
  $('clear').addEventListener('click', function () {
    state.t = 0; lastHist = 0;
    state.hist = [{ t: 0, T: state.T }];
    state.trace = []; lastTrace = null; record(true);
    state.pathMax = state.pathMin = state.T;
    state.wasSnow = isSnow(params(), state.T);
    setStatus(T('已清除溫度紀錄與走過的路，時間歸零。', 'Temperature record and path cleared; the clock is back to zero.'));
    afterChange(true);
  });
  $('soundBtn').addEventListener('click', function () {
    const on = !(window.LabSettings && window.LabSettings.get('sound'));
    if (window.LabSettings) window.LabSettings.set('sound', on);
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'sound') updateSoundButton(); });

  // ---------- 點能量平衡圖：設定地表溫度 ----------
  function grPos(ev) { const r = gr.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }
  gr.addEventListener('pointerdown', function (ev) {
    if (state.chart !== 'balance' || !grSize) return;
    const q = grPos(ev), W = grSize.w;
    if (q[0] < GM.l - 4 || q[0] > W - GM.r + 4) return;
    const Tk = TMIN + (q[0] - GM.l) / (W - GM.l - GM.r) * (TMAX - TMIN);
    setTemp(Math.round(Math.max(TMIN, Math.min(TMAX, Tk)) * 10) / 10);
    setStatus(T('把地表放到 ', 'Surface set to ') + tempText(state.T) + T('。按「播放」看它往哪個平衡走。', '. Press “Play” to see which equilibrium it heads for.'));
  });

  // ---------- 鍵盤 ----------
  if (window.LabKeys) {
    window.LabKeys.attach(cv, {
      label: T('能量流示意圖。左右鍵調太陽亮度、上下鍵調二氧化碳；Enter 或空白鍵切換。', 'Energy-flow diagram. Left/right change the brightness of the Sun, up/down the carbon dioxide; Enter or Space switches.'),
      items: [{
        name: function () { return T('二氧化碳', 'Carbon dioxide'); },
        move: function (dx, dy, big) {
          const d = (dx || dy) * (big ? 50 : 5);
          if (!d) return false;
          acted(); setSlider(el.co2, Math.max(100, Math.min(2000, state.co2 + d))); readSliders(); refreshOutputs(); record(); afterChange();
          return true;
        },
        describe: function () { return T('二氧化碳 ', 'Carbon dioxide ') + num(state.co2, 0) + ' ppm' + T('，地表 ', ', surface ') + tempText(state.T); }
      }, {
        name: function () { return T('太陽亮度', 'Brightness of the Sun'); },
        move: function (dx, dy, big) {
          const d = (dx || dy) * (big ? 5 : 0.5);
          if (!d) return false;
          acted(); setSlider(el.sun, Math.max(SMIN, Math.min(SMAX, state.S * 100 + d))); readSliders(); refreshOutputs(); record(); afterChange();
          return true;
        },
        describe: function () { return T('太陽亮度 ', 'Sun at ') + num(state.S * 100, 1) + T('%，地表 ', '%, surface ') + tempText(state.T); }
      }],
      onChange: function () { requestDraw(); }
    });
    window.LabKeys.attach(gr, {
      label: T('圖表。左右鍵直接改地表溫度（大幅：按住 Shift）。', 'Chart. Left/right set the surface temperature directly (hold Shift for big steps).'),
      items: [{
        name: function () { return T('地表溫度', 'Surface temperature'); },
        move: function (dx, dy, big) {
          const d = (dx || dy) * (big ? 5 : 0.5);
          if (!d) return false;
          setTemp(Math.round((state.T + d) * 10) / 10);
          return true;
        },
        describe: function () { return T('地表 ', 'Surface ') + tempText(state.T); }
      }],
      onChange: function () { requestDraw(); }
    });
  }

  // ---------- 分享：回饋開關、圖表、溫度 ----------
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () { return { wv: state.wv ? 1 : 0, ice: state.ice ? 1 : 0, ch: state.chart, T: Math.round(state.T * 100) / 100 }; },
    set: function (o) {
      if (!o) return;
      state.wv = o.wv === 1 || o.wv === true; state.ice = o.ice === 1 || o.ice === true;
      if (['time', 'balance', 'hyst'].indexOf(o.ch) >= 0) { state.chart = o.ch; setSeg('chartSeg', 'data-chart', o.ch); gr.setAttribute('aria-label', chartAria()); }
      readSliders(); refreshOutputs(); hystKey = '';
      if (isFinite(o.T) && o.T >= TMIN - 40 && o.T <= TMAX + 60) {
        state.T = +o.T; state.t = 0; state.hist = [{ t: 0, T: state.T }]; state.trace = []; lastTrace = null; record(true);
        state.pathMax = state.pathMin = state.T; state.wasSnow = isSnow(params(), state.T); snowNow = state.wasSnow;
      }
      cache = null; updateReadouts(); requestDraw();
    }
  });

  // =====================================================================
  // 繪圖迴圈
  // =====================================================================
  let raf = 0, lastFrame = 0;
  function requestDraw() { if (!raf) raf = requestAnimationFrame(loop); }
  function loop(tnow) {
    raf = 0;
    const dt = lastFrame ? Math.min(1 / 20, (tnow - lastFrame) / 1000) : 0;
    lastFrame = tnow;
    let busy = false;
    if (state.running) {
      if (dt > 0 && !document.hidden) {
        integrate(dt * state.speed);
        record();
        cache = null;
        const c = now();
        // 一直平衡超過 5 年（模擬時間）就自動暫停，省電
        if (c.eq && Math.abs(c.f.N) < 0.002) eqTime += dt * state.speed; else eqTime = 0;
        if (eqTime > 5) {
          state.running = false; updatePlay(); eqTime = 0;
          const S = sound(); if (S) S.tone({ freq: 660, dur: 0.12, type: 'triangle', gain: 0.16 });
          setStatus(T('已達到平衡，自動暫停：地表 ', 'Equilibrium reached, paused: surface ') + tempText(state.T) + T('。', '.'));
          afterChange(true);
        } else afterChange();
      }
      busy = state.running;
    }
    if (view3 && view3.active) { view3.frame(tnow); busy = busy || view3.busy(); }
    else drawFlow(tnow);
    drawChart();
    if (busy) raf = requestAnimationFrame(loop);
    else lastFrame = 0;
  }

  // =====================================================================
  // 3D 檢視（切換時才載入 three.js 與 greenhouse-3d.js）
  // =====================================================================
  let view3 = null, threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  const bridge = {
    K: K, T: T, D: D, state: state, colors: function () { return C; }, reducedMotion: reducedMotion,
    num: num, now: now, iceText: function () { return iceText(now()); },
    request: function () { requestDraw(); },
    onCam: function (kind) { acted(); emit('cam', { preset: kind }); },
    onContextLost: function () {
      setView('2d');
      viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D。', 'The 3D graphics context was lost, so the view switched back to 2D.');
    }
  };
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
    catch (e) { return false; }
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.Greenhouse3D) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (threeLib && window.Greenhouse3D) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    const own = new URL('js/greenhouse-3d.js' + (SCRIPT_V ? '?v=' + SCRIPT_V : ''), document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js'), loadScript(own)]).then(function (mods) {
      if (!window.Greenhouse3D) throw new Error('greenhouse-3d.js did not load');
      threeLib = { THREE: mods[0], OrbitControls: mods[1].OrbitControls };
      return threeLib;
    });
  }
  function setPressed(mode) {
    $('view2d').setAttribute('aria-pressed', String(mode === '2d'));
    $('view3d').setAttribute('aria-pressed', String(mode === '3d'));
  }
  function updateViewNotes() {
    const is3 = !!(view3 && view3.active);
    $('camBar').hidden = !is3;
    stage.classList.toggle('is3d', is3);
  }
  function setView(mode) {
    if (mode === '3d') {
      if (view3 && view3.active) return;
      const token = ++loadToken;
      setPressed('3d');
      if (!webglAvailable()) { fail3D(); return; }
      viewMsg.textContent = T('正在載入 3D 地球…', 'Loading the 3D globe…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return;
        view3 = window.Greenhouse3D.create(lib, host3, bridge);
        viewMsg.textContent = '';
        updateViewNotes();
        requestAnimationFrame(function () { if (view3) { view3.onShow(); requestDraw(); } });
        requestDraw();
      }).catch(function (err) {
        if (token !== loadToken) return;
        if (window.console) console.warn('3D view unavailable:', err);
        fail3D();
      });
    } else {
      loadToken++;
      setPressed('2d');
      if (view3) { view3.dispose(); view3 = null; }
      if (/3D/.test(viewMsg.textContent) && !/2D/.test(viewMsg.textContent)) viewMsg.textContent = '';
      updateViewNotes();
      resizeCv();
    }
  }
  function fail3D() {
    if (view3) { try { view3.dispose(); } catch (e) { /* 忽略 */ } view3 = null; }
    setPressed('2d');
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 能量流圖。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D energy-flow diagram is kept.');
    updateViewNotes();
    resizeCv();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { acted(); setView('3d'); emit('view', { mode: '3d' }); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });
  ['Sun', 'Side', 'Pole'].forEach(function (k) {
    $('cam' + k).addEventListener('click', function () { if (view3) { view3.camTo(k.toLowerCase()); bridge.onCam(k.toLowerCase()); } });
  });

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  readSliders();
  refreshOutputs();
  updatePlay();
  updateSoundButton();
  gr.setAttribute('aria-label', chartAria());
  updateReadouts();
  // 語言切換也會發出 lab:themechange（settings.js），所以這裡一併更新文字
  function themeChanged() {
    readColors();
    updatePlay(); updateSoundButton(); updateReadouts();
    gr.setAttribute('aria-label', chartAria());
    if (view3 && view3.active) view3.onTheme();
    requestDraw();
  }
  const dm = window.matchMedia('(prefers-color-scheme: dark)');
  if (dm.addEventListener) dm.addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lw = 0, lh = 0, gw = 0;
    new ResizeObserver(function () {
      if (cv.clientWidth !== lw || cv.clientHeight !== lh || gr.clientWidth !== gw) { lw = cv.clientWidth; lh = cv.clientHeight; gw = gr.clientWidth; if (gw > 0) resizeCv(); }
    }).observe(stage);
  } else window.addEventListener('resize', resizeCv);
  resizeCv();
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { lastFrame = 0; requestDraw(); } });
  setStatus(T('現在是 1750 年的地球：280 ppm、地表 15 °C、收支平衡。按「今天 423」看看會發生什麼。', 'The Earth of 1750: 280 ppm, a surface of 15 °C, in balance. Press “Today 423” and see what happens.'));
  requestDraw();
  // 測試用（Playwright）
  window.__gh = { state: state, K: K, snapshot: snapshot, setTemp: setTemp, jump: jump, setView: setView,
    run: function (yrs) { integrate(yrs); record(true); afterChange(true); } };
})();
