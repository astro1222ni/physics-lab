/* blackbody.js — 「黑體輻射與普朗克定律」頁面程式
 * 物理全部在 js/blackbody-core.js；3D 光譜曲面在 js/blackbody-3d.js（three.js 延遲載入）。
 * 畫面：光譜圖（可拖曳的游標、保留的曲線、瑞利–金斯與維恩近似）、空腔小圖（顏色與亮度）、模式平均能量小圖。
 * 任務事件（'temp'、'probe'、'keep'）只在使用者親手操作之後才送出；格式見 js/missions/blackbody.js 開頭。
 * 本頁是光學現象，沒有音效（照網站慣例：非聲學現象不加聲音）。
 */
(function () {
  'use strict';
  const C = window.BlackbodyCore, D = window.LabDraw;
  if (!C || !D) return;
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const $ = function (id) { return document.getElementById(id); };
  const val = function (el) { return window.LabNum ? +window.LabNum.value(el) : +el.value; };
  const clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };
  const FONT = D.FONT;
  const font = function (px, w) { return (w || '600') + ' ' + px + 'px ' + FONT; };
  const minus = function (s) { s = String(s); if (/^-0(\.0+)?$/.test(s)) s = s.slice(1); return s.replace(/^-/, '−'); };
  const LG = Math.log10;
  const NM = 1e-9;
  const LOGX = [1e-8, 1e-2];   // 對數波長軸：10 nm – 10 mm
  const MAX_KEEP = 8;

  // ---------------- 顏色 ----------------
  const tok = {};
  function readTokens() {
    const cs = getComputedStyle(document.documentElement);
    ['planck', 'rj', 'wien', 'kept', 'brick', 'uv', 'ir', 'mw'].forEach(function (k) {
      tok[k] = cs.getPropertyValue('--bb-' + k).trim() || '#888888';
    });
  }
  readTokens();

  // ---------------- 狀態 ----------------
  const el = { T: $('T'), showRJ: $('showRJ'), showWien: $('showWien') };
  const st = {
    xLog: false, yLog: false,
    probe: 2 * C.lamMax(4000), // 游標的絕對波長（m）；預設在峰值的 2 倍處（不和 λmax 標籤重疊）
    probeT: null,            // 使用者最後一次放游標時的溫度（保留曲線時判斷「有沒有在這個溫度量過」）
    kept: [],                // [{ T, M, Mpk, vis, lamMax（nm）, probe（nm 或 null） }]，舊的在前
    drag: false, pendingPreset: null, col: null, colT: NaN
  };
  const cv = $('cv'), ctx = cv.getContext('2d');
  const cav = $('cav'), cctx = cav.getContext('2d');
  const mcv = $('modes'), mctx = mcv.getContext('2d');
  const stage = $('stage');

  // 溫度：對數滑桿 2.5–40000 K（0–2000 步；取 4 位有效數字）
  const TLO = C.T_MIN, TRATIO = C.T_MAX / C.T_MIN;
  const sig4 = function (v) { return +v.toPrecision(4); };
  if (window.LabNum) {
    window.LabNum.register(el.T, {
      toValue: function (p) { return sig4(TLO * Math.pow(TRATIO, p / 2000)); },
      toPos: function (v) { return 2000 * Math.log(v / TLO) / Math.log(TRATIO); },
      min: C.T_MIN, max: C.T_MAX, decimals: 3
    });
  }
  const Tnow = function () { return clamp(val(el.T), C.T_MIN, C.T_MAX); };

  // 只有使用者親手操作過之後才送任務事件（分享連結還原、程式設定都不算）
  let acted = false;
  ['pointerdown', 'keydown'].forEach(function (t) { document.addEventListener(t, function (e) { if (e.isTrusted) acted = true; }, true); });
  function emit(type, data) { if (acted && window.LabMission) window.LabMission.emit(type, data); }

  // ---------------- 數字格式 ----------------
  function sig(x, n) {
    if (!isFinite(x)) return '—';
    if (x === 0) return '0';
    const d = Math.max(0, (n || 3) - 1 - Math.floor(LG(Math.abs(x))));
    return x.toFixed(Math.min(d, 8));
  }
  /** 由 log10 寫成科學記號（HTML，上標用 <sup>）；指數在 −2～3 之間時寫一般數字 */
  function sciLog(lg, n, plainOK) {
    if (!isFinite(lg)) return '0';
    n = n || 3;
    let e = Math.floor(lg), m = Math.pow(10, lg - e);
    if (+m.toFixed(n - 1) >= 10) { m /= 10; e += 1; }
    if (plainOK !== false && e >= -2 && e <= 3) return sig(Math.pow(10, lg), n);
    return m.toFixed(n - 1) + ' × 10<sup>' + minus(e) + '</sup>';
  }
  const sci = function (x, n, plainOK) { return x > 0 ? sciLog(LG(x), n, plainOK) : x === 0 ? '0' : '−' + sciLog(LG(-x), n, plainOK); };
  /** 純文字版（報讀、狀態列）：10^−3 寫成「× 10^−3」 */
  const plain = function (html) { return html.replace(/<sup>/g, '^').replace(/<\/sup>/g, '').replace(/<[^>]+>/g, ''); };
  function fmtT(t) { return t >= 1000 ? String(Math.round(t)) : String(+t.toPrecision(4)); }
  /** 波長（nm）→ 適當單位 */
  function fmtLam(nm, n) {
    n = n || 4;
    if (nm < 1000) return sig(nm, n) + ' nm';
    if (nm < 1e6) return sig(nm / 1000, n) + ' μm';
    return sig(nm / 1e6, n) + ' mm';
  }
  const UNIT_ML = 'W·m<sup>−2</sup>·nm<sup>−1</sup>';

  // ---------------- 物理量（全部由物理核心算） ----------------
  function colorOf(t) {
    if (st.colT !== t) { st.col = C.color(t); st.colT = t; }
    return st.col;
  }
  /** 可見光比例的 log10（比例極小時用 e^−x 漸近式，避免下溢成 0） */
  function lgVis(t) {
    const v = C.visFrac(t);
    if (v > 1e-250) return LG(v);
    const x = C.xOf(C.VIS[1], t);
    return LG(15 / Math.pow(Math.PI, 4)) + LG(x * x * x + 3 * x * x + 6 * x + 6) - x / Math.LN10;
  }
  const lgP = function (lam, t) { return C.log10ExitanceNm(lam, t); };
  const lgRJ = function (lam, t) { return LG(C.exitanceRJ(lam, t)) - 9; };
  const lgW = function (lam, t) { const r = C.ratioWien(lam, t); return r > 0 ? lgP(lam, t) + LG(r) : -Infinity; };
  const lgPk = function (t) { return lgP(C.lamMax(t), t); };

  function probeData() {
    const t = Tnow(), lam = st.probe;
    if (!(lam > 0)) return null;
    return {
      T: t, lam: lam / NM, x: C.xOf(lam, t),
      M: Math.pow(10, lgP(lam, t)), RJ: C.exitanceRJ(lam, t) * NM, W: C.exitanceWien(lam, t) * NM,
      rj: C.ratioRJ(lam, t), wien: C.ratioWien(lam, t), F: C.fracBelow(lam, t),
      lamMax: C.lamMax(t) / NM, lamNu: C.lamOfNuMax(t) / NM,
      showRJ: el.showRJ.checked, showWien: el.showWien.checked
    };
  }
  function tempData(preset) {
    const t = Tnow(), c = colorOf(t);
    return {
      T: t, preset: preset || null, lamMax: C.lamMax(t) / NM, lamNu: C.lamOfNuMax(t) / NM, nuMax: C.nuMax(t),
      M: C.totalExitance(t), Mpk: Math.pow(10, lgPk(t)), vis: C.visFrac(t), duv: c.duv, log10L: c.log10L,
      showRJ: el.showRJ.checked, showWien: el.showWien.checked, probe: probeData()
    };
  }
  function refOf(t) { for (let i = 0; i < C.REFS.length; i++) if (Math.abs(C.REFS[i].T - t) <= 1e-9 * t) return C.REFS[i]; return null; }

  // =====================================================================
  // 光譜圖
  // =====================================================================
  let W = 0, H = 0, dpr = 1;
  function sizeCanvas(c, g) {
    const w = c.clientWidth || 600, h = c.clientHeight || 300;
    const r = Math.min(window.devicePixelRatio || 1, 2.5);
    c.width = Math.round(w * r); c.height = Math.round(h * r);
    g.setTransform(r, 0, 0, r, 0, 0);
    return { w: w, h: h, r: r };
  }
  function resize() {
    const s = sizeCanvas(cv, ctx); W = s.w; H = s.h; dpr = s.r;
    sizeCanvas(cav, cctx); sizeCanvas(mcv, mctx);
    drawAll();
  }
  function geom() {
    const narrow = W < 520;
    return { x0: narrow ? 50 : 62, x1: W - (narrow ? 10 : 16), y0: 34, y1: H - (narrow ? 84 : 48), narrow: narrow };
  }
  function xRange() {
    if (st.xLog) return LOGX;
    return [0, 4 * C.lamMax(Tnow())];
  }
  function lamToPx(lam, g) {
    const r = xRange();
    const u = st.xLog ? (LG(lam) - LG(r[0])) / (LG(r[1]) - LG(r[0])) : (lam - r[0]) / (r[1] - r[0]);
    return g.x0 + u * (g.x1 - g.x0);
  }
  function pxToLam(px, g) {
    const r = xRange(), u = clamp((px - g.x0) / (g.x1 - g.x0), 0, 1);
    if (st.xLog) return Math.pow(10, LG(r[0]) + u * (LG(r[1]) - LG(r[0])));
    return Math.max(r[1] * 1e-4, r[0] + u * (r[1] - r[0]));
  }
  /** 縱軸範圍：線性 [0, 1.12 × 目前的峰]；對數則把保留的曲線一起放進來 */
  function yRange() {
    const t = Tnow(), pk = lgPk(t);
    if (!st.yLog) return { lin: true, max: 1.12 * Math.pow(10, pk) };
    let hi = pk, lo = pk;
    st.kept.forEach(function (k) { const l = LG(k.Mpk); hi = Math.max(hi, l); lo = Math.min(lo, l); });
    hi = Math.ceil(hi + 0.4);
    const span = clamp(Math.max(10, hi - lo + 5), 10, 32);
    return { lin: false, hi: hi, lo: hi - span };
  }
  function lgToPy(lg, g, yr) {
    if (yr.lin) {
      const v = lg === -Infinity ? 0 : Math.pow(10, lg);
      return g.y1 - v / yr.max * (g.y1 - g.y0);
    }
    return g.y1 - (lg - yr.lo) / (yr.hi - yr.lo) * (g.y1 - g.y0);
  }
  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(LG(raw))), m = raw / p;
    return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
  }
  /** 一般文字＋上標的組合：segs = [['W·m', ''], ['−2', 'sup'], …] */
  function rich(g2, segs, x, y, color, px, align, weight) {
    const f = font(px, weight || '600'), fs = font(Math.round(px * 0.72), weight || '600');
    let w = 0;
    segs.forEach(function (s) { g2.font = s[1] ? fs : f; w += g2.measureText(s[0]).width + (s[1] ? 0.5 : 0); });
    let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    segs.forEach(function (s) {
      const ff = s[1] ? fs : f, dy = s[1] === 'sup' ? -px * 0.38 : s[1] === 'sub' ? px * 0.22 : 0;
      D.haloText(g2, s[0], cx + (s[1] ? 0.5 : 0), y + dy, color, 'left', 'alphabetic', ff);
      g2.font = ff; cx += g2.measureText(s[0]).width + (s[1] ? 0.5 : 0);
    });
    return w;
  }
  function curvePath(g, yr, f, n) {
    const pts = [];
    n = n || Math.max(240, Math.round((g.x1 - g.x0) * 1.2));
    for (let i = 0; i <= n; i++) {
      const px = g.x0 + (g.x1 - g.x0) * i / n, lam = pxToLam(px, g);
      let py = lgToPy(f(lam), g, yr);
      if (!isFinite(py)) py = g.y1 + 40;
      pts.push([px, clamp(py, g.y0 - 60, g.y1 + 40)]);
    }
    return pts;
  }
  function strokePts(pts, color, w, dash) {
    ctx.beginPath();
    pts.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
    ctx.setLineDash(dash || []);
    ctx.lineWidth = w; ctx.strokeStyle = color; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.setLineDash([]);
  }
  const BANDS = [
    { a: 1e-8, b: 380e-9, zh: '紫外線', en: 'UV', k: 'uv' },
    { a: 380e-9, b: 780e-9, zh: '可見光', en: 'visible', k: 'vis' },
    { a: 780e-9, b: 1e-3, zh: '紅外線', en: 'infrared', k: 'ir' },
    { a: 1e-3, b: 1, zh: '微波', en: 'microwave', k: 'mw' }
  ];
  function rgbStr(a, alp) { return 'rgba(' + a[0] + ',' + a[1] + ',' + a[2] + ',' + (alp == null ? 1 : alp) + ')'; }
  function visGradient(g, x0, x1) {
    const gr = ctx.createLinearGradient(x0, 0, x1, 0);
    for (let nm = 380; nm <= 780; nm += 10) {
      const px = lamToPx(nm * NM, g), c = C.spectralRGB(nm);
      const u = (px - x0) / (x1 - x0);
      if (u >= 0 && u <= 1 && c) gr.addColorStop(u, rgbStr(c));
    }
    return gr;
  }

  function drawSpectrum() {
    if (!W) return;
    ctx.clearRect(0, 0, W, H);
    D.backdrop(ctx, W, H);
    const g = geom(), t = Tnow(), yr = yRange(), r = xRange();
    const pw = g.x1 - g.x0, ph = g.y1 - g.y0;
    // 波段底色與名稱
    const vx0 = lamToPx(380 * NM, g), vx1 = lamToPx(780 * NM, g);
    ctx.save();
    ctx.beginPath(); ctx.rect(g.x0, g.y0, pw, ph); ctx.clip();
    if (vx1 > g.x0 && vx0 < g.x1) { ctx.globalAlpha = D.dark ? 0.10 : 0.08; ctx.fillStyle = visGradient(g, vx0, vx1); ctx.fillRect(vx0, g.y0, vx1 - vx0, ph); ctx.globalAlpha = 1; }
    ctx.restore();
    // 格線
    const yt = yTicks(g, yr), xt = xTicks(g);
    ctx.save();
    ctx.beginPath();
    xt.forEach(function (k) { const s = Math.round(k.px * dpr) / dpr + 0.5 / dpr; ctx.moveTo(s, g.y0); ctx.lineTo(s, g.y1); });
    yt.forEach(function (k) { const s = Math.round(k.py * dpr) / dpr + 0.5 / dpr; ctx.moveTo(g.x0, s); ctx.lineTo(g.x1, s); });
    ctx.strokeStyle = D.alpha(D.c.text, D.dark ? 0.1 : 0.08); ctx.lineWidth = 1 / dpr; ctx.stroke();
    ctx.restore();
    // 波段名稱（放得下才寫）
    ctx.font = font(11, '600');
    BANDS.forEach(function (b) {
      const a = Math.max(g.x0, lamToPx(Math.max(b.a, r[0] || 1e-12), g)), z = Math.min(g.x1, lamToPx(b.b, g));
      const s = T(b.zh, b.en), w = ctx.measureText(s).width;
      if (z - a > w + 10) D.haloText(ctx, s, (a + z) / 2, g.y0 - 8, b.k === 'vis' ? D.c.text : tok[b.k], 'center', 'alphabetic', font(11, '600'));
    });
    // 曲線
    ctx.save();
    ctx.beginPath(); ctx.rect(g.x0, g.y0 - 1, pw, ph + 1); ctx.clip();
    // 保留的曲線（越舊越淡）
    const nk = st.kept.length;
    st.kept.forEach(function (k, i) {
      const a = 0.85 - 0.6 * (nk - 1 - i) / Math.max(1, MAX_KEEP - 1);
      strokePts(curvePath(g, yr, function (lam) { return lgP(lam, k.T); }), D.alpha(tok.kept, a), 1.6);
    });
    const pts = curvePath(g, yr, function (lam) { return lgP(lam, t); });
    // 曲線下的填色：淡淡的本色，可見光那一段疊上真實彩虹
    ctx.beginPath(); ctx.moveTo(pts[0][0], g.y1);
    pts.forEach(function (p) { ctx.lineTo(p[0], p[1]); });
    ctx.lineTo(pts[pts.length - 1][0], g.y1); ctx.closePath();
    ctx.fillStyle = D.alpha(tok.planck, D.dark ? 0.16 : 0.12); ctx.fill();
    if (vx1 > g.x0 && vx0 < g.x1) {
      ctx.save(); ctx.clip();
      ctx.globalAlpha = D.dark ? 0.32 : 0.3; ctx.fillStyle = visGradient(g, vx0, vx1); ctx.fillRect(vx0, g.y0, vx1 - vx0, ph);
      ctx.restore();
    }
    if (el.showRJ.checked) strokePts(curvePath(g, yr, function (lam) { return lgRJ(lam, t); }), tok.rj, 2, [7, 5]);
    if (el.showWien.checked) strokePts(curvePath(g, yr, function (lam) { return lgW(lam, t); }), tok.wien, 2.2, [2, 4]);
    strokePts(pts, D.alpha(D.dark ? '#000000' : D.c.text, 0.18), 5);
    strokePts(pts, tok.planck, 2.6);
    ctx.restore();
    // 保留曲線的溫度標籤（在各自的峰附近；看不到峰就放在右緣）
    keptLabels(g, yr);
    // 軸
    ctx.strokeStyle = D.alpha(D.c.text, 0.55); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(g.x0, g.y0); ctx.lineTo(g.x0, g.y1); ctx.lineTo(g.x1, g.y1); ctx.stroke();
    // 彩虹色帶（可見光段，軸線正下方）
    const bx0 = Math.max(g.x0, vx0), bx1 = Math.min(g.x1, vx1);
    if (bx1 > bx0 + 0.5) {
      for (let x = Math.floor(bx0); x < bx1; x++) {
        const nm = pxToLam(x + 0.5, g) / NM, c = C.spectralRGB(nm);
        if (c) { ctx.fillStyle = rgbStr(c); ctx.fillRect(x, g.y1 + 2, 1.2, 7); }
      }
    }
    // 刻度文字
    const tf = font(g.narrow ? 10.5 : 11.5, '500');
    xt.forEach(function (k) { if (k.label) D.haloText(ctx, k.label, k.px, g.y1 + 22, D.c.muted, 'center', 'alphabetic', tf); });
    yt.forEach(function (k) {
      if (k.sup != null) D.supText(ctx, '10', k.sup, g.x0 - 6, k.py + 4, D.c.muted, tf, 'right');
      else D.haloText(ctx, k.label, g.x0 - 6, k.py + 4, D.c.muted, 'right', 'alphabetic', tf);
    });
    // 軸名稱
    const unit = st.xLog ? '' : xUnit().name;
    D.haloText(ctx, T('波長 λ', 'wavelength λ') + (unit ? T('（' + unit + '）', ' (' + unit + ')') : ''), g.x1, g.y1 + 40, D.c.text, 'right', 'alphabetic', font(12, '600'));
    const segs = [['M', ''], ['λ', 'sub'], [T('（W·m', ' (W·m'), ''], ['−2', 'sup'], ['·nm', ''], ['−1', 'sup'], [T('）', ')'), '']];
    if (yr.lin && yr.expo) { segs.push([T('　× 10', '   × 10'), '']); segs.push([minus(yr.expo), 'sup']); }
    rich(ctx, segs, g.x0 - (g.narrow ? 44 : 54), 14, D.c.text, 12);
    // c/νmax 的位置（軸上的小三角）
    const lnu = C.lamOfNuMax(t), pxn = lamToPx(lnu, g);
    if (pxn > g.x0 + 4 && pxn < g.x1 - 4) {
      ctx.fillStyle = D.alpha(D.c.muted, 0.9);
      ctx.beginPath(); ctx.moveTo(pxn, g.y1 - 1); ctx.lineTo(pxn - 5, g.y1 - 9); ctx.lineTo(pxn + 5, g.y1 - 9); ctx.closePath(); ctx.fill();
      rich(ctx, [['c/ν', ''], ['max', 'sub']], pxn, g.y1 - 13, D.c.muted, 11, 'center');
    }
    // 峰值
    const lpk = C.lamMax(t), ppx = lamToPx(lpk, g), ppy = lgToPy(lgPk(t), g, yr);
    if (ppx >= g.x0 && ppx <= g.x1) {
      ctx.setLineDash([3, 4]); ctx.strokeStyle = D.alpha(tok.planck, 0.7); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(ppx, ppy); ctx.lineTo(ppx, g.y1); ctx.stroke(); ctx.setLineDash([]);
      D.ball(ctx, ppx, ppy, 4.5, tok.planck);
      // 標籤放在峰的右上方（峰右邊的曲線往下走，不會壓到曲線）；太靠右就改放左上方
      const lab = 'λmax = ' + fmtLam(lpk / NM, 4);
      ctx.font = font(12, '700');
      const lw = ctx.measureText(lab).width + 14, right = ppx + 8 + lw < g.x1 - 4;
      D.pill(ctx, lab, right ? ppx + 8 : ppx - 8, clamp(ppy - 6, g.y0 + 40, g.y1 - 4), tok.planck, right ? 'left' : 'right', font(12, '700'));
    }
    drawProbe(g, yr, t);
    legend(g);
    if (kb && kb.focused()) {
      ctx.save(); ctx.setLineDash([5, 4]); ctx.strokeStyle = D.c.accent; ctx.lineWidth = 2;
      D.roundRect(ctx, g.x0 - 4, g.y0 - 4, pw + 8, ph + 8, 8); ctx.stroke(); ctx.restore();
    }
  }
  function xUnit() {
    const xm = xRange()[1];
    return xm < 4e-6 ? { f: 1e9, name: 'nm' } : xm < 4e-3 ? { f: 1e6, name: 'μm' } : { f: 1e3, name: 'mm' };
  }
  function xTicks(g) {
    const out = [];
    if (st.xLog) {
      const names = ['10 nm', '100 nm', '1 μm', '10 μm', '100 μm', '1 mm', '10 mm'];
      for (let e = -8; e <= -2; e++) {
        const narrowSkip = g.narrow && (e % 2 !== 0);
        out.push({ px: lamToPx(Math.pow(10, e), g), label: narrowSkip ? '' : names[e + 8] });
      }
      return out;
    }
    const u = xUnit(), xm = xRange()[1] * u.f;
    const step = niceStep(xm / (g.narrow ? 4 : 7));
    for (let v = 0; v <= xm * 1.0001; v += step) out.push({ px: g.x0 + v / xm * (g.x1 - g.x0), label: sig(v, 3).replace(/\.?0+$/, '') === '' ? '0' : String(+v.toPrecision(6)) });
    return out;
  }
  function yTicks(g, yr) {
    const out = [];
    if (yr.lin) {
      const step = niceStep(yr.max / 5), e = Math.floor(LG(step));
      const useExp = e < -2 || e > 3;
      const ex = useExp ? Math.floor(LG(yr.max / 1.12)) : 0;
      yr.expo = useExp ? ex : 0;
      for (let v = 0; v <= yr.max * 1.0001; v += step) {
        const m = v / Math.pow(10, ex);
        out.push({ py: g.y1 - v / yr.max * (g.y1 - g.y0), label: String(+m.toPrecision(4)) });
      }
      return out;
    }
    const span = yr.hi - yr.lo, k = span <= 10 ? 2 : span <= 18 ? 3 : span <= 24 ? 4 : 5;
    for (let e = Math.ceil(yr.lo / k) * k; e <= yr.hi; e += k) out.push({ py: lgToPy(e, g, yr), sup: minus(e) });
    return out;
  }
  function keptLabels(g, yr) {
    const nk = st.kept.length, boxes = [];
    st.kept.forEach(function (k, i) {
      const a = 0.85 - 0.6 * (nk - 1 - i) / Math.max(1, MAX_KEEP - 1);
      let px = lamToPx(k.lamMax * NM, g), py = lgToPy(LG(k.Mpk), g, yr);
      if (px < g.x0 || px > g.x1 || py < g.y0 || py > g.y1) {
        // 峰在畫面外：沿著曲線在右緣找位置
        const lamR = pxToLam(g.x1 - 30, g);
        px = g.x1 - 30; py = lgToPy(lgP(lamR, k.T), g, yr);
        if (!(py >= g.y0 + 12 && py <= g.y1 - 4)) return;
      }
      let yb = py - 6;
      boxes.forEach(function (b) { if (Math.abs(b.x - px) < 70 && Math.abs(b.y - yb) < 18) yb = b.y - 18; });
      boxes.push({ x: px, y: yb });
      ctx.globalAlpha = Math.max(0.55, a);
      D.pill(ctx, fmtT(k.T) + ' K', clamp(px, g.x0 + 34, g.x1 - 34), Math.max(g.y0 + 18, yb), tok.kept, 'center', font(11, '600'));
      ctx.globalAlpha = 1;
    });
  }
  function drawProbe(g, yr, t) {
    const lam = st.probe;
    if (!(lam > 0)) return;
    let px = lamToPx(lam, g);
    const out = px < g.x0 - 0.5 ? -1 : px > g.x1 + 0.5 ? 1 : 0;
    const color = D.c.probe || D.c.accent;
    if (out) {
      px = out < 0 ? g.x0 + 2 : g.x1 - 2;
      const s = (out < 0 ? '← ' : '') + T('游標 ', 'cursor ') + fmtLam(lam / NM, 3) + (out > 0 ? ' →' : '');
      D.pill(ctx, s, out < 0 ? g.x0 + 4 : g.x1 - 4, g.y1 - 8, color, out < 0 ? 'left' : 'right', font(11, '600'));
      return;
    }
    ctx.save();
    ctx.strokeStyle = D.alpha(color, 0.9); ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(px, g.y0); ctx.lineTo(px, g.y1); ctx.stroke();
    ctx.restore();
    const dot = function (lg, c) { const py = lgToPy(lg, g, yr); if (py >= g.y0 && py <= g.y1) D.ball(ctx, px, py, 4, c); };
    if (el.showRJ.checked) dot(lgRJ(lam, t), tok.rj);
    if (el.showWien.checked) dot(lgW(lam, t), tok.wien);
    dot(lgP(lam, t), color);
    // 拖曳把手
    ctx.fillStyle = color;
    D.roundRect(ctx, px - 7, g.y1 - 14, 14, 14, 3); ctx.fill();
    ctx.strokeStyle = D.c['canvas-bg']; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(px - 2.5, g.y1 - 11); ctx.lineTo(px - 2.5, g.y1 - 3); ctx.moveTo(px + 2.5, g.y1 - 11); ctx.lineTo(px + 2.5, g.y1 - 3); ctx.stroke();
    const s = 'λ = ' + fmtLam(lam / NM, 4);
    ctx.font = font(12, '700');
    const w = ctx.measureText(s).width + 14;
    D.pill(ctx, s, clamp(px, g.x0 + w / 2, g.x1 - w / 2), g.y0 + 2 + 16, color, 'center', font(12, '700'));
  }
  function legend(g) {
    const items = [{ c: tok.planck, s: T('普朗克 ', 'Planck ') + fmtT(Tnow()) + ' K', d: [] }];
    if (el.showRJ.checked) items.push({ c: tok.rj, s: T('瑞利–金斯', 'Rayleigh–Jeans'), d: [7, 5] });
    if (el.showWien.checked) items.push({ c: tok.wien, s: T('維恩近似', 'Wien approx.'), d: [2, 4] });
    if (st.kept.length) items.push({ c: tok.kept, s: T('保留的曲線', 'kept curves'), d: [] });
    const f = font(11.5, '600');
    ctx.font = f;
    if (g.narrow) {
      // 窄螢幕：圖例排在圖的下方，一列放不下就換列
      let x = 8, y = g.y1 + 56;
      items.forEach(function (it) {
        const iw = ctx.measureText(it.s).width + 36;
        if (x + iw > W - 4 && x > 8) { x = 8; y += 16; }
        ctx.setLineDash(it.d); ctx.strokeStyle = it.c; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x + 18, y - 4); ctx.stroke(); ctx.setLineDash([]);
        D.haloText(ctx, it.s, x + 23, y, D.c.text, 'left', 'alphabetic', f);
        x += iw;
      });
      return;
    }
    const w = Math.max.apply(null, items.map(function (it) { return ctx.measureText(it.s).width; })) + 40;
    const h = items.length * 17 + 8;
    const x = g.x1 - w - 6, y = g.y0 + 30;
    if (x < g.x0 + 40) return;
    D.roundRect(ctx, x, y, w, h, 8);
    ctx.fillStyle = D.alpha(D.c['canvas-bg'], 0.86); ctx.fill();
    ctx.strokeStyle = D.alpha(D.c.border || D.c.muted, 0.6); ctx.lineWidth = 1; ctx.stroke();
    items.forEach(function (it, i) {
      const yy = y + 13 + i * 17;
      ctx.setLineDash(it.d); ctx.strokeStyle = it.c; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(x + 8, yy); ctx.lineTo(x + 28, yy); ctx.stroke(); ctx.setLineDash([]);
      D.haloText(ctx, it.s, x + 34, yy + 4, D.c.text, 'left', 'alphabetic', f);
    });
  }

  // =====================================================================
  // 空腔小圖：孔的顏色＝黑體的顏色（色調）；長條＝實際亮度（對數刻度）
  // =====================================================================
  const LBAR = [-6, 12];
  function drawCavity() {
    const w = cav.clientWidth, h = cav.clientHeight;
    if (!w) return;
    const g2 = cctx, t = Tnow(), c = colorOf(t);
    g2.clearRect(0, 0, w, h);
    D.backdrop(g2, w, h);
    // 爐子
    const bw = Math.min(w * 0.62, 230), bh = Math.min(h * 0.5, 120), bx = (w - bw) / 2, by = 16;
    D.block(g2, bx, by, bw, bh, tok.brick, { r: 10 });
    // 磚縫
    g2.save(); D.roundRect(g2, bx, by, bw, bh, 10); g2.clip();
    g2.strokeStyle = D.alpha('#000000', 0.18); g2.lineWidth = 1;
    for (let yy = by + 14, row = 0; yy < by + bh; yy += 14, row++) {
      g2.beginPath(); g2.moveTo(bx, yy); g2.lineTo(bx + bw, yy); g2.stroke();
      for (let xx = bx + (row % 2 ? 14 : 0); xx < bx + bw; xx += 28) { g2.beginPath(); g2.moveTo(xx, yy - 14); g2.lineTo(xx, yy); g2.stroke(); }
    }
    g2.restore();
    // 孔
    const hx = bx + bw / 2, hy = by + bh / 2, hr = Math.min(bh * 0.3, 30);
    const rgb = c.srgb;
    g2.save();
    g2.shadowColor = rgbStr(rgb, 0.85); g2.shadowBlur = 18;
    const rg = g2.createRadialGradient(hx - hr * 0.2, hy - hr * 0.2, hr * 0.1, hx, hy, hr);
    rg.addColorStop(0, rgbStr(rgb.map(function (v) { return Math.round(v + (255 - v) * 0.25); })));
    rg.addColorStop(1, rgbStr(rgb));
    g2.fillStyle = rg; g2.beginPath(); g2.arc(hx, hy, hr, 0, Math.PI * 2); g2.fill();
    g2.restore();
    g2.strokeStyle = D.alpha('#000000', 0.45); g2.lineWidth = 2.5; g2.beginPath(); g2.arc(hx, hy, hr + 1, 0, Math.PI * 2); g2.stroke();
    const name = C.colorName(t);
    D.pill(g2, T('顏色：', 'Colour: ') + T(name.zh, name.en), w / 2, by + bh + 22, D.c.text, 'center', font(12, '700'));
    // 亮度長條
    const x0 = 16, x1 = w - 16, yb = h - 44, bhh = 12;
    D.haloText(g2, T('實際亮度（輝度，cd/m', 'Real brightness (luminance, cd/m'), x0, yb - 10, D.c.muted, 'left', 'alphabetic', font(11.5, '600'));
    g2.font = font(11.5, '600');
    const tw = g2.measureText(T('實際亮度（輝度，cd/m', 'Real brightness (luminance, cd/m')).width;
    D.haloText(g2, '2', x0 + tw + 0.5, yb - 14, D.c.muted, 'left', 'alphabetic', font(8.5, '600'));
    D.haloText(g2, T('）', ')'), x0 + tw + 6, yb - 10, D.c.muted, 'left', 'alphabetic', font(11.5, '600'));
    D.roundRect(g2, x0, yb, x1 - x0, bhh, 6);
    g2.fillStyle = D.alpha(D.c.text, D.dark ? 0.14 : 0.08); g2.fill();
    const u = clamp((c.log10L - LBAR[0]) / (LBAR[1] - LBAR[0]), 0, 1);
    if (u > 0) {
      g2.save(); D.roundRect(g2, x0, yb, x1 - x0, bhh, 6); g2.clip();
      const gr = g2.createLinearGradient(x0, 0, x1, 0);
      gr.addColorStop(0, rgbStr(rgb, 0.25)); gr.addColorStop(1, rgbStr(rgb, 1));
      g2.fillStyle = gr; g2.fillRect(x0, yb, (x1 - x0) * u, bhh);
      g2.restore();
    }
    for (let e = LBAR[0]; e <= LBAR[1]; e += 3) {
      const px = x0 + (e - LBAR[0]) / (LBAR[1] - LBAR[0]) * (x1 - x0);
      g2.fillStyle = D.alpha(D.c.text, 0.45); g2.fillRect(px - 0.5, yb + bhh, 1, 4);
      D.supText(g2, '10', minus(e), px, yb + bhh + 18, D.c.muted, font(10.5, '500'), 'center');
    }
    // 看不到時的說明
    let note = '';
    if (t < 798) note = C.lamMax(t) > 1e-3 ? T('眼睛看不到，它發的主要是微波', 'Invisible to the eye: it gives off mainly microwaves') : T('眼睛看不到，但紅外線很強', 'Invisible to the eye, but strong in the infrared');
    else if (t < 1000) note = T('只有在暗處才看得到暗紅的光', 'A dim red glow, visible only in the dark');
    if (note) D.pill(g2, note, w / 2, yb - 26, t < 798 ? tok.ir : D.c.text, 'center', font(11.5, '700'));
    cav.setAttribute('aria-label', T('空腔示意圖：孔的顏色是', 'Cavity diagram: the hole shows the colour ') + T(name.zh, name.en) +
      T('，亮度約 ', ', luminance about ') + plain(sciLog(c.log10L, 2)) + ' cd/m²' + (note ? T('，', '. ') + note : ''));
  }

  // =====================================================================
  // 模式平均能量小圖：古典 kT 與普朗克 hf/(e^{hf/kT} − 1)
  // =====================================================================
  const FR = [9, 17];
  function drawModes() {
    const w = mcv.clientWidth, h = mcv.clientHeight;
    if (!w) return;
    const g2 = mctx, t = Tnow();
    g2.clearRect(0, 0, w, h);
    D.backdrop(g2, w, h);
    const x0 = 40, x1 = w - 12, y0 = 26, y1 = h - 42;
    const fx = function (lf) { return x0 + (lf - FR[0]) / (FR[1] - FR[0]) * (x1 - x0); };
    const fy = function (v) { return y1 - v / 1.2 * (y1 - y0); };
    // 可見光頻帶（3.84–7.89 × 10^14 Hz）
    const va = fx(LG(C.C / 780e-9)), vb = fx(LG(C.C / 380e-9));
    for (let x = Math.floor(va); x < vb; x++) {
      const f = Math.pow(10, FR[0] + (x + 0.5 - x0) / (x1 - x0) * (FR[1] - FR[0]));
      const cc = C.spectralRGB(C.C / f / NM);
      if (cc) { g2.fillStyle = rgbStr(cc, 0.16); g2.fillRect(x, y0, 1.2, y1 - y0); g2.fillStyle = rgbStr(cc); g2.fillRect(x, y1 + 2, 1.2, 5); }
    }
    // 格線、軸
    g2.strokeStyle = D.alpha(D.c.text, 0.08); g2.lineWidth = 1;
    g2.beginPath();
    for (let e = FR[0]; e <= FR[1]; e++) { g2.moveTo(fx(e), y0); g2.lineTo(fx(e), y1); }
    [0.5, 1].forEach(function (v) { g2.moveTo(x0, fy(v)); g2.lineTo(x1, fy(v)); });
    g2.stroke();
    g2.strokeStyle = D.alpha(D.c.text, 0.55);
    g2.beginPath(); g2.moveTo(x0, y0); g2.lineTo(x0, y1); g2.lineTo(x1, y1); g2.stroke();
    const names = ['1 GHz', '10 GHz', '100 GHz', '1 THz', '10 THz', '100 THz', '1 PHz', '10 PHz', '100 PHz'];
    const step = w < 460 ? 2 : 1;
    g2.font = font(10, '500');
    for (let e = FR[0]; e <= FR[1]; e += step) {
      const s = names[e - FR[0]], hw = g2.measureText(s).width / 2 + 2;
      D.haloText(g2, s, clamp(fx(e), hw, w - hw), y1 + 19, D.c.muted, 'center', 'alphabetic', font(10, '500'));
    }
    ['0', '0.5', '1'].forEach(function (s, i) { D.haloText(g2, s, x0 - 5, fy(i * 0.5) + 4, D.c.muted, 'right', 'alphabetic', font(10.5, '500')); });
    D.haloText(g2, T('頻率 f', 'frequency f'), x1, y1 + 36, D.c.text, 'right', 'alphabetic', font(11.5, '600'));
    D.haloText(g2, '⟨E⟩ / kT', x0 - 30, 15, D.c.text, 'left', 'alphabetic', font(12, '600'));
    // 古典：每個模式 kT
    g2.setLineDash([7, 5]); g2.strokeStyle = tok.rj; g2.lineWidth = 2;
    g2.beginPath(); g2.moveTo(x0, fy(1)); g2.lineTo(x1, fy(1)); g2.stroke(); g2.setLineDash([]);
    // 普朗克
    g2.beginPath();
    const n = Math.round((x1 - x0) * 1.5);
    for (let i = 0; i <= n; i++) {
      const lf = FR[0] + (FR[1] - FR[0]) * i / n, f = Math.pow(10, lf);
      const v = C.modePlanck(f, t) / C.modeClassical(t);
      const px = fx(lf), py = fy(v);
      if (i) g2.lineTo(px, py); else g2.moveTo(px, py);
    }
    g2.lineTo(x1, y1); g2.lineTo(x0, y1); g2.closePath();
    g2.fillStyle = D.alpha(tok.planck, D.dark ? 0.16 : 0.12); g2.fill();
    g2.beginPath();
    for (let i = 0; i <= n; i++) {
      const lf = FR[0] + (FR[1] - FR[0]) * i / n, f = Math.pow(10, lf);
      const px = fx(lf), py = fy(C.modePlanck(f, t) / C.modeClassical(t));
      if (i) g2.lineTo(px, py); else g2.moveTo(px, py);
    }
    g2.strokeStyle = tok.planck; g2.lineWidth = 2.4; g2.stroke();
    // hf = kT
    const fk = C.KB * t / C.H, pk = fx(LG(fk));
    if (pk > x0 && pk < x1) {
      g2.setLineDash([3, 4]); g2.strokeStyle = D.alpha(D.c.text, 0.6); g2.lineWidth = 1.2;
      g2.beginPath(); g2.moveTo(pk, y0 + 4); g2.lineTo(pk, y1); g2.stroke(); g2.setLineDash([]);
      D.ball(g2, pk, fy(1 / Math.expm1(1)), 3.5, tok.planck);
      D.pill(g2, 'hf = kT', clamp(pk, x0 + 30, x1 - 30), y0 + 14, D.c.text, 'center', font(11, '700'));
    }
    D.haloText(g2, T('古典：每個模式 kT', 'classical: kT per mode'), x1 - 4, fy(1) + 15, tok.rj, 'right', 'alphabetic', font(11, '600'));
    const lx = fx(FR[0] + 0.15);
    D.haloText(g2, T('普朗克', 'Planck'), lx, fy(1) + 15, tok.planck, 'left', 'alphabetic', font(11, '700'));
    mcv.setAttribute('aria-label', T('模式平均能量圖：古典理論每個模式都是 kT；普朗克的模式在 hf = kT（約 ', 'Mode energy graph: classically every mode has kT; Planck’s modes fall off above hf = kT (about ') +
      plain(sci(fk, 3)) + T(' Hz）以上迅速減少。', ' Hz).'));
  }

  // =====================================================================
  // 讀數、游標讀數、狀態
  // =====================================================================
  const RO = [
    ['T', '溫度 T', 'Temperature T'],
    ['lm', '峰值波長 λ<sub>max</sub>', 'Peak wavelength λ<sub>max</sub>'],
    ['nu', '頻率分布的峰 <span class="nw">ν<sub>max</sub></span>', 'Frequency peak <span class="nw">ν<sub>max</sub></span>'],
    ['cn', '換成波長 <span class="nw">c/ν<sub>max</sub></span>', 'As a wavelength <span class="nw">c/ν<sub>max</sub></span>'],
    ['M', '總輻射出射度 <span class="nw">M = σT<sup>4</sup></span>', 'Total exitance <span class="nw">M = σT<sup>4</sup></span>'],
    ['pk', '峰值高度', 'Peak height'],
    ['vis', '可見光比例', 'Visible fraction'],
    ['col', '顏色', 'Colour'],
    ['duv', '與白點的色差 <span class="nw">Δuv</span>', 'Distance from white <span class="nw">Δuv</span>'],
    ['L', '亮度（輝度）', 'Luminance']
  ];
  const dl = $('readout');
  function buildReadout() {
    dl.innerHTML = RO.map(function (r) { return '<dt>' + T(r[1], r[2]) + '</dt><dd id="ro-' + r[0] + '"></dd>'; }).join('');
  }
  function visText(t) {
    const lg = lgVis(t);
    if (lg >= -2) return (Math.pow(10, lg) * 100).toFixed(3) + '%';
    return sciLog(lg, 3, false);
  }
  function updateReadout() {
    const t = Tnow(), c = colorOf(t), name = C.colorName(t);
    const set = function (k, h) { const e = $('ro-' + k); if (e) e.innerHTML = h; };
    set('T', fmtT(t) + ' K' + (t >= 200 ? '（' + (t - 273.15).toFixed(t >= 1000 ? 0 : 1) + ' °C）' : ''));
    set('lm', fmtLam(C.lamMax(t) / NM, 4));
    set('nu', sci(C.nuMax(t), 4, false) + ' Hz');
    set('cn', fmtLam(C.lamOfNuMax(t) / NM, 4));
    set('M', sci(C.totalExitance(t), 4) + ' W/m<sup>2</sup>');
    set('pk', sciLog(lgPk(t), 3) + ' ' + UNIT_ML);
    set('vis', visText(t));
    set('col', '<span class="swatch" style="background:' + rgbStr(c.srgb) + '"></span>' + T(name.zh, name.en));
    set('duv', c.duv.toFixed(4));
    set('L', sciLog(c.log10L, 3) + ' cd/m<sup>2</sup>');
    // 參考物體按鈕的「目前」狀態
    document.querySelectorAll('#refs button').forEach(function (b) {
      const r = C.REFS.filter(function (x) { return x.id === b.dataset.ref; })[0];
      b.classList.toggle('on', !!r && Math.abs(r.T - t) <= 1e-9 * t);
    });
    $('To').textContent = fmtT(t) + ' K';
  }
  function probeHTML() {
    const p = probeData();
    if (!p) return '';
    const it = function (k, v, cls) { return '<span class="it' + (cls ? ' ' + cls : '') + '"><span class="k">' + k + '</span> ' + v + '</span>'; };
    let h = it(T('游標 λ =', 'Cursor λ ='), fmtLam(p.lam, 4)) +
      it(T('普朗克 M<sub>λ</sub> =', 'Planck M<sub>λ</sub> ='), sciLog(lgP(st.probe, p.T), 3) + ' ' + UNIT_ML);
    if (p.showRJ) h += it(T('瑞利–金斯 =', 'Rayleigh–Jeans ='), sci(p.RJ, 3) + T('，是普朗克的 ', ', ') + (isFinite(p.rj) ? sci(p.rj, 4) : '∞') + T(' 倍', ' × Planck'), 'rj');
    if (p.showWien) h += it(T('維恩近似 =', 'Wien approx. ='), sciLog(lgW(st.probe, p.T), 3) + T('，是普朗克的 ', ', ') + sig(p.wien, 4) + T(' 倍', ' × Planck'), 'wi');
    h += it('hc/λkT =', sig(p.x, 4));
    h += it(T('比這個波長短的部分占', 'Share at shorter wavelengths'), fracText(p.F));
    return h;
  }
  function fracText(F) {
    if (F >= 0.001) return (F * 100).toFixed(F > 0.999 ? 3 : 1) + '%';
    if (F > 0) return sci(F, 2, false);
    return '0';
  }
  function updateProbeOut() { $('probeOut').innerHTML = probeHTML(); }
  const statusEl = $('status');
  function say(html) { statusEl.innerHTML = html; }
  function tempSummary(t, preset) {
    const r = preset ? C.REFS.filter(function (x) { return x.id === preset; })[0] : null;
    const name = C.colorName(t);
    return (r ? T(r.zh, r.en) + T('：', ': ') : '') + 'T = ' + fmtT(t) + ' K' + T('：λmax = ', ': λmax = ') + fmtLam(C.lamMax(t) / NM, 4) +
      T('，總出射度 M = ', ', total exitance M = ') + sci(C.totalExitance(t), 3) + ' W/m<sup>2</sup>' +
      T('，可見光比例 ', ', visible fraction ') + visText(t) + T('，顏色：', ', colour: ') + T(name.zh, name.en) + T('。', '.');
  }
  function probeSummary() {
    const p = probeData();
    if (!p) return '';
    return T('游標 λ = ', 'Cursor λ = ') + fmtLam(p.lam, 4) + T('：普朗克 M', ': Planck M') + '<sub>λ</sub> = ' + sciLog(lgP(st.probe, p.T), 3) + ' ' + UNIT_ML +
      (p.showRJ ? T('，瑞利–金斯是它的 ', ', Rayleigh–Jeans is ') + (isFinite(p.rj) ? sci(p.rj, 3) : '∞') + T(' 倍', ' times it') : '') +
      (p.showWien ? T('，維恩近似是它的 ', ', Wien is ') + sig(p.wien, 3) + T(' 倍', ' times it') : '') +
      T('，hc/λkT = ', ', hc/λkT = ') + sig(p.x, 3) + T('。', '.');
  }
  function hints() {
    $('hint2').textContent = T('在光譜圖上點一下或左右拖曳，移動游標量曲線；選取圖後也可以用方向鍵移動（Shift 加方向鍵移動得多）。',
      'Tap or drag sideways on the spectrum to move the cursor; once the graph is selected the arrow keys move it too (Shift for big steps).');
    $('hint3').textContent = T('拖曳旋轉，滾輪或雙指縮放。三個軸都是對數：綠色的粗線是目前溫度的光譜，金色的線是峰值的山脊 λmax T = b。',
      'Drag to rotate, scroll or pinch to zoom. All three axes are logarithmic: the thick green line is the spectrum at the current temperature, the golden line is the ridge of peaks λmax T = b.');
  }

  function drawAll() {
    drawSpectrum(); drawCavity(); drawModes();
    if (view3 && view3.active) view3.update();
  }
  let raf = 0;
  function requestDraw() { if (!raf) raf = requestAnimationFrame(function () { raf = 0; drawAll(); }); }
  function refreshAll() { updateReadout(); updateProbeOut(); requestDraw(); }

  // =====================================================================
  // 操作
  // =====================================================================
  // 參考物體
  const refsBox = $('refs');
  function buildRefs() {
    refsBox.innerHTML = C.REFS.map(function (r) {
      const c = C.color(r.T).srgb;
      return '<button type="button" data-ref="' + r.id + '"><span><span class="dot" style="background:' + rgbStr(c) + '"></span>' + T(r.zh, r.en) + '</span><small>' + fmtT(r.T) + ' K</small></button>';
    }).join('');
  }
  refsBox.addEventListener('click', function (e) {
    const b = e.target.closest('button[data-ref]');
    if (!b) return;
    const r = C.REFS.filter(function (x) { return x.id === b.dataset.ref; })[0];
    if (!r) return;
    st.pendingPreset = r.id;
    if (window.LabNum) window.LabNum.set(el.T, r.T);
    st.pendingPreset = null;
  });
  el.T.addEventListener('input', function () { refreshAll(); });
  el.T.addEventListener('change', function () {
    const preset = st.pendingPreset, t = Tnow();
    refreshAll();
    say(tempSummary(t, preset));
    emit('temp', tempData(preset));
  });
  [el.showRJ, el.showWien].forEach(function (c) {
    c.addEventListener('change', function () { refreshAll(); });
  });
  function setAxis(which, log) {
    if (which === 'x') { st.xLog = log; $('xLin').setAttribute('aria-pressed', String(!log)); $('xLog').setAttribute('aria-pressed', String(log)); }
    else { st.yLog = log; $('yLin').setAttribute('aria-pressed', String(!log)); $('yLog').setAttribute('aria-pressed', String(log)); }
    refreshAll();
  }
  $('xLin').addEventListener('click', function () { setAxis('x', false); });
  $('xLog').addEventListener('click', function () { setAxis('x', true); });
  $('yLin').addEventListener('click', function () { setAxis('y', false); });
  $('yLog').addEventListener('click', function () { setAxis('y', true); });

  // 保留曲線／全部清除
  function keepCurve() {
    const t = Tnow();
    const probeNm = st.probe > 0 && st.probeT === t ? st.probe / NM : null;
    const same = st.kept.filter(function (k) { return Math.abs(k.T - t) <= 1e-9 * t; })[0];
    if (same) {
      // 同一個溫度已經保留：剛在這個溫度量過游標，就更新那條曲線記下的游標位置；否則只提醒
      if (probeNm == null || same.probe === probeNm) {
        say(T('這個溫度（', 'This temperature (') + fmtT(t) + T(' K）已經保留了。', ' K) is already kept.'));
        return;
      }
      same.probe = probeNm;
      say(T('已更新 ', 'Updated the kept ') + fmtT(t) + T(' K 那條曲線的游標位置。', ' K curve with the new cursor position.'));
      refreshAll();
      emit('keep', { T: t, kept: st.kept.map(function (k) { return Object.assign({}, k); }) });
      return;
    }
    st.kept.push({ T: t, M: C.totalExitance(t), Mpk: Math.pow(10, lgPk(t)), vis: C.visFrac(t), lamMax: C.lamMax(t) / NM, probe: probeNm });
    if (st.kept.length > MAX_KEEP) st.kept.shift();
    say(T('已保留 ', 'Kept ') + fmtT(t) + ' K' + T('（共 ', ' (') + st.kept.length + T(' 條，最多 ', ' curves, at most ') + MAX_KEEP + T(' 條）。', ').'));
    refreshAll();
    emit('keep', { T: t, kept: st.kept.map(function (k) { return Object.assign({}, k); }) });
  }
  $('keep').addEventListener('click', keepCurve);
  $('clearAll').addEventListener('click', function () {
    st.kept = [];
    say(T('已清除保留的曲線。', 'The kept curves have been cleared.'));
    refreshAll();
  });

  // 游標：點一下或拖曳
  function setProbeFromEvent(e) {
    const r = cv.getBoundingClientRect(), g = geom();
    st.probe = pxToLam(e.clientX - r.left, g);
    st.probeT = Tnow();
    updateProbeOut(); requestDraw();
  }
  function releaseProbe() {
    if (!st.drag) return;
    st.drag = false;
    st.probeT = Tnow();
    say(probeSummary());
    emit('probe', probeData());
  }
  cv.addEventListener('pointerdown', function (e) {
    if (e.button !== undefined && e.button > 0) return;
    st.drag = true;
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
    setProbeFromEvent(e);
  });
  cv.addEventListener('pointermove', function (e) { if (st.drag) setProbeFromEvent(e); });
  cv.addEventListener('pointerup', releaseProbe);
  cv.addEventListener('pointercancel', releaseProbe);
  cv.addEventListener('lostpointercapture', releaseProbe);

  // 鍵盤：方向鍵移動游標
  const kb = window.LabKeys ? window.LabKeys.attach(cv, {
    label: kbLabel(),
    items: [{
      name: function () { return T('游標', 'Cursor'); },
      move: function (dx, dy, big) {
        const d = dx || dy;
        if (!d) return false;
        const r = xRange();
        let lam = st.probe > 0 ? st.probe : C.lamMax(Tnow());
        if (st.xLog) {
          lam = Math.pow(10, clamp(LG(lam) + d * (big ? 0.05 : 0.0005), LG(r[0]), LG(r[1])));
        } else {
          if (lam > r[1]) lam = r[1];
          lam = clamp(lam + d * (r[1] - r[0]) * (big ? 0.02 : 0.0004), r[1] * 1e-3, r[1]);
        }
        st.probe = lam; st.probeT = Tnow();
        updateProbeOut(); requestDraw();
        say(probeSummary());
        emit('probe', probeData());
        return true;
      },
      describe: function () { return plain(probeSummary()); }
    }],
    onChange: function () { requestDraw(); }
  }) : null;
  function kbLabel() {
    return T('黑體光譜圖。方向鍵左右移動游標（Shift 加方向鍵移動得多），讀出這個波長的光譜出射度。',
      'Black-body spectrum graph. Use the left and right arrow keys to move the cursor (Shift for big steps) and read the spectral exitance at that wavelength.');
  }

  // =====================================================================
  // 3D 檢視（three.js 以 import() 延遲載入；場景在 blackbody-3d.js）
  // =====================================================================
  let view3 = null, threeLib = null, loadToken = 0;
  const viewMsg = $('viewMsg');
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
    catch (e) { return false; }
  }
  function loadThree() {
    if (threeLib) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js')]).then(function (mods) {
      threeLib = { THREE: mods[0], OrbitControls: mods[1].OrbitControls };
      return threeLib;
    });
  }
  function state3() { return { T: Tnow(), showRJ: el.showRJ.checked, kept: st.kept.map(function (k) { return k.T; }) }; }
  function setPressed3(mode) { $('view2d').setAttribute('aria-pressed', String(mode === '2d')); $('view3d').setAttribute('aria-pressed', String(mode === '3d')); }
  function setView(mode) {
    if (mode === '3d') {
      if (view3 && view3.active) return;
      const token = ++loadToken;
      setPressed3('3d');
      if (!webglAvailable() || !window.Blackbody3D) { fail3D(); return; }
      viewMsg.textContent = T('正在載入 3D 檢視…', 'Loading the 3D view…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return;
        stage.classList.add('is3d');
        view3 = window.Blackbody3D.create(lib, {
          host: $('view3'), core: C, T: T, state: state3,
          tokens: function () { readTokens(); return Object.assign({}, tok, D.c, { dark: D.dark }); },
          lost: function () { setView('2d'); viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D。', 'The 3D graphics context was lost, so the view switched back to 2D.'); }
        });
        viewMsg.textContent = '';
        $('resetCam').hidden = false;
        view3.update();
      }).catch(function (err) {
        if (token !== loadToken) return;
        if (window.console) console.warn('3D view unavailable:', err);
        fail3D();
      });
    } else {
      loadToken++;
      setPressed3('2d');
      if (view3) { view3.dispose(); view3 = null; }
      stage.classList.remove('is3d');
      $('resetCam').hidden = true;
      if (/3D/.test(viewMsg.textContent) && !/2D/.test(viewMsg.textContent)) viewMsg.textContent = '';
      resize();
    }
  }
  function fail3D() {
    if (view3) { try { view3.dispose(); } catch (e) { /* 忽略 */ } view3 = null; }
    stage.classList.remove('is3d');
    setPressed3('2d');
    $('resetCam').hidden = true;
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D view is kept.');
    resize();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });

  // =====================================================================
  // 分享連結：游標、保留的曲線、軸的模式（溫度、勾選框由共用程式自動記錄）
  // =====================================================================
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () {
      return { p: st.probe > 0 ? +(st.probe / NM).toPrecision(6) : 0, pt: st.probeT, k: st.kept.map(function (k) { return k.T; }), xl: st.xLog ? 1 : 0, yl: st.yLog ? 1 : 0 };
    },
    set: function (o) {
      if (!o || typeof o !== 'object') return;
      st.xLog = !!o.xl; st.yLog = !!o.yl;
      setAxis('x', st.xLog); setAxis('y', st.yLog);
      if (+o.p >= 1 && +o.p <= 1e8) { st.probe = +o.p * NM; st.probeT = +o.pt > 0 ? +o.pt : null; }
      if (Array.isArray(o.k)) {
        st.kept = [];
        o.k.slice(-MAX_KEEP).forEach(function (t) {
          t = +t;
          if (!(t >= C.T_MIN && t <= C.T_MAX)) return;
          if (st.kept.some(function (k) { return k.T === t; })) return;
          st.kept.push({ T: t, M: C.totalExitance(t), Mpk: Math.pow(10, lgPk(t)), vis: C.visFrac(t), lamMax: C.lamMax(t) / NM, probe: null });
        });
      }
      refreshAll();
    }
  });

  // =====================================================================
  // 啟動
  // =====================================================================
  function onTheme() {
    D.refresh && D.refresh();
    readTokens();
    if (view3 && view3.active) view3.onTheme();
    requestDraw();
  }
  window.addEventListener('lab:themechange', onTheme);
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', onTheme);
  }
  window.addEventListener('lab:settingschange', function (ev) {
    if (ev.detail && ev.detail.name === 'lang') {
      buildRefs(); buildReadout(); hints(); refreshAll();
      cv.setAttribute('aria-label', kbLabel());
      cv.setAttribute('aria-roledescription', T('互動實驗畫布', 'interactive simulation canvas'));
    }
  });
  buildRefs(); buildReadout(); hints();
  if (window.LabNum) window.LabNum.set(el.T, 4000);
  say(T('預設 4000 K。按參考物體或拉溫度滑桿，看曲線的峰怎麼移動；在圖上拖曳游標量出任何波長的值。',
    'Starting at 4000 K. Press a reference object or move the temperature slider and watch the peak move; drag the cursor on the graph to measure any wavelength.'));
  if (window.ResizeObserver) {
    let lw = 0, lc = 0, lm = 0;
    new ResizeObserver(function () {
      if (cv.clientWidth !== lw || cav.clientWidth !== lc || mcv.clientWidth !== lm) { lw = cv.clientWidth; lc = cav.clientWidth; lm = mcv.clientWidth; resize(); }
    }).observe(stage);
  }
  window.addEventListener('resize', resize);
  resize();
  refreshAll();

  // 測試介面（Playwright、縮圖用）
  window.__bb = {
    st: st, T: Tnow, tempData: tempData, probeData: probeData, keep: keepCurve,
    setT: function (t) { if (window.LabNum) window.LabNum.set(el.T, t); },
    setProbe: function (nm) { st.probe = nm * NM; st.probeT = Tnow(); refreshAll(); },
    setAxis: setAxis, view: function () { return view3; }, setView: setView
  };
})();
