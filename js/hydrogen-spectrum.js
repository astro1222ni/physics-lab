/* hydrogen-spectrum.js — 「氫原子能階與光譜」模組的畫面與互動（物理計算在 hydrogen-spectrum-core.js） */
(function () {
  'use strict';
  const HC = window.HydrogenCore;
  const $ = function (id) { return document.getElementById(id); };
  // 介面文字：英文模式用第二個字串（settings.js）
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  // 滑桿讀值：打字輸入的精確值（numinput.js）優先
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }

  // ---------- 畫面常數 ----------
  const N_TOP = HC.N_TOP;
  const E_MIN = -14.6, E_MAX = 2.4;      // 能階圖的能量範圍（eV）
  const LOG_MIN = 50, LOG_MAX = 15000;   // 全波段光譜（nm，對數刻度）
  const Z_MIN = 360, Z_MAX = 700;        // 可見光放大（nm，線性刻度）
  const ORBIT_T1 = 1.2;                  // 動畫中 n = 1 繞一圈的時間（s）；其他能階依 T ∝ n³（實際 T1 = 1.52 × 10^-16 s）
  const GUN_EMIN = 0.05, GUN_EMAX = 20;  // 光子能量範圍（eV）
  const GUN_LMIN = 62, GUN_LMAX = 24800; // 光子波長範圍（nm）
  const TUBE_RATE = 400;                 // 放電管：每秒撞擊次數（模擬）
  const FLASH_RATE = 24;                 // 放電管：每秒平均畫出的閃光數（由模擬的光子隨機抽樣）
  const K_REF = 13.45;                   // 白光模式中「放電管參考光譜」所用的電子能量（eV）
  const EMIT_EVERY = 0.5;                // 放電管：每隔幾秒回報一次任務事件

  const state = {
    mode: 'atom',
    n: 1,              // 目前能階；Infinity 表示已游離（只剩質子）
    K: 0,              // 游離後自由電子的動能（eV）
    lastN: 1,          // 游離前的能階（畫面縮放用）
    theta: Math.PI / 4,
    em: {}, ab: {},    // 累積的譜線：'ni-nf' → 次數
    cont: [],          // 連續光譜的紀錄 { lambda, kind: 'em' | 'ab' }
    last: null,        // 最近一個光子
    jump: null,        // 能階圖上的最近一次躍遷
    busy: false,       // 光子正飛向原子
    photons: [],       // 飛行中的光子波包（只影響畫面）
    fx: [],            // 短暫效果（只影響畫面）
    free: null,        // 游離後飛走的電子（畫面）
    view: { from: 4.56, to: 4.56, t0: 0 },
    gunBy: 'E',
    tube: { running: !reducedMotion, imp: 0, exc: 0, ph: 0, counts: {}, acc: 0, emitAcc: 0, flashes: [], atoms: [], elec: [], probs: {}, exp: {}, glow: null, meanPh: 0 },
    abs: { hot: false, ph: [], acc: 0 },
    show: { wave: true, zoom: true },
    hover: null
  };

  // ---------- 色彩（lab.css 代號） ----------
  let colors = {};
  function rgbOf(c) {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(c).trim());
    if (m) return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
    const n = String(c).match(/[\d.]+/g);
    return n && n.length >= 3 ? [+n[0], +n[1], +n[2]] : [128, 128, 128];
  }
  function alpha(c, a) { const r = Array.isArray(c) ? c : rgbOf(c); return 'rgba(' + Math.round(r[0]) + ',' + Math.round(r[1]) + ',' + Math.round(r[2]) + ',' + a + ')'; }
  /** f > 0 往白色混合、f < 0 往黑色混合 */
  function shade(c, f) {
    const r = Array.isArray(c) ? c : rgbOf(c), t = f > 0 ? 255 : 0, k = Math.abs(f);
    return 'rgb(' + r.map(function (x) { return Math.round(x + (t - x) * k); }).join(',') + ')';
  }
  function mix(c1, c2, t) {
    const a = rgbOf(c1), b = rgbOf(c2);
    return 'rgb(' + a.map(function (x, i) { return Math.round(x + (b[i] - x) * t); }).join(',') + ')';
  }
  function isDark() {
    const r = rgbOf(getComputedStyle(document.documentElement).getPropertyValue('--canvas-bg'));
    return (r[0] + r[1] + r[2]) / 3 < 100;
  }
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--text', '--muted', '--border', '--accent', '--accent-soft', '--surface', '--pos', '--neg',
      '--field', '--equi', '--probe', '--b-optics', '--b-modern', '--b-em']
      .forEach(function (k) { colors[k.slice(2)] = cs.getPropertyValue(k).trim(); });
    colors.dark = isDark();
    // 不可見光的假色：紫外線偏紫灰、紅外線偏暗紅灰（都由色彩代號調出）
    colors.uv = mix(colors['b-optics'], colors.muted, 0.3);
    colors.ir = mix(shade(colors.pos, -0.3), colors.muted, 0.28);
    // 發射光譜的暗背景（光譜照片本來就是暗底）
    colors.night = shade(colors['canvas-bg'], colors.dark ? -0.6 : -0.94);
    // 圖例的假色樣本（英文模式會替換圖例的 HTML，所以用 CSS 變數，不直接改元素）
    const root = document.documentElement.style;
    root.setProperty('--hs-uv', colors.uv);
    root.setProperty('--hs-uv2', alpha(colors.uv, 0.35));
    root.setProperty('--hs-ir', colors.ir);
    root.setProperty('--hs-ir2', alpha(colors.ir, 0.35));
  }
  /** 光子的顯示顏色：可見光用光譜色，紫外線、紅外線用假色 */
  function pcol(lambda) {
    const v = HC.wavelengthToRGB(lambda);
    if (v) return { rgb: v, vis: true, band: 'VIS' };
    const b = lambda < HC.VIS_MIN ? 'UV' : 'IR';
    return { rgb: rgbOf(b === 'UV' ? colors.uv : colors.ir), vis: false, band: b };
  }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }

  // ---------- 數字格式 ----------
  function num(v, d) {
    if (!isFinite(v)) return '—';
    let s = v.toFixed(d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  /** 科學記號（HTML，用 <sup>） */
  function sci(v, d, unit) {
    if (!isFinite(v)) return '—';
    if (v === 0) return '0' + (unit ? ' ' + unit : '');
    let e = Math.floor(Math.log10(Math.abs(v)));
    let m = v / Math.pow(10, e);
    if (Math.abs(+m.toFixed(d)) >= 10) { m /= 10; e++; }
    return num(m, d) + ' × 10<sup>' + num(e, 0) + '</sup>' + (unit ? ' ' + unit : '');
  }
  function fmtL(l) { return !isFinite(l) ? '—' : l < 1000 ? num(l, 2) : l < 100000 ? num(l, 1) : num(l, 0); }
  function trimDec(v, dec, minDec) {
    let s = v.toFixed(dec);
    while (s.indexOf('.') >= 0 && s.length - s.indexOf('.') - 1 > minDec && s.slice(-1) === '0') s = s.slice(0, -1);
    if (s.slice(-1) === '.') s = s.slice(0, -1);
    return s;
  }
  function bandName(b) { return b === 'UV' ? T('紫外線', 'ultraviolet') : b === 'IR' ? T('紅外線', 'infrared') : T('可見光', 'visible'); }
  function colourName(l) {
    if (l < 450) return T('紫', 'violet');
    if (l < 485) return T('藍', 'blue');
    if (l < 500) return T('青', 'cyan');
    if (l < 565) return T('綠', 'green');
    if (l < 590) return T('黃', 'yellow');
    if (l < 625) return T('橙', 'orange');
    return T('紅', 'red');
  }
  function seriesName(nf) { const s = HC.series(nf); return s ? T(s.zh, s.en) : ''; }
  function nName(n) { return n === Infinity ? '∞' : String(n); }

  // ---------- 畫布與版面 ----------
  const cv = $('cv');
  const ctx = cv.getContext('2d');
  let dpr = 1, cw = 300, ch = 300;
  let L = null, G = null, S = null;
  const bg = document.createElement('canvas');
  const bgctx = bg.getContext('2d');

  function specGeom(x, y, w, nr) {
    const lab = nr ? 34 : 46;
    const x0 = x + lab, x1 = x + w - (nr ? 8 : 12);
    let yy = y + (nr ? 5 : 6);
    const title = yy + 8; yy += nr ? 21 : 22;
    const band = yy + 5; yy += 12;
    const lEm = { y: yy, h: nr ? 15 : 17 }; yy += lEm.h + 2;
    const lAb = { y: yy, h: nr ? 15 : 17 }; yy += lAb.h;
    const lAxis = yy + 3; yy += 17;
    const lSer = yy + 5; yy += 13;
    yy += nr ? 12 : 14;
    const zLbl = yy + 6; yy += 15;
    const zEm = { y: yy, h: nr ? 20 : 22 }; yy += zEm.h + 2;
    const zAb = { y: yy, h: nr ? 20 : 22 }; yy += zAb.h;
    const zAxis = yy + 3; yy += 17;
    return { x: x, y: y, w: w, x0: x0, x1: x1, lab: lab, title: title, band: band, lEm: lEm, lAb: lAb, lAxis: lAxis, lSer: lSer,
      zLbl: zLbl, zEm: zEm, zAb: zAb, zAxis: zAxis, h: yy - y + (nr ? 4 : 6) };
  }
  function layout() {
    const narrow = cw < 560;
    const gap = narrow ? 6 : 10;
    const topH = narrow ? Math.round(Math.max(300, cw * 0.95)) : Math.round(Math.min(470, Math.max(360, cw * 0.55)));
    const dW = narrow ? Math.round(cw * 0.53) : Math.round(cw * 0.48);
    const sg = specGeom(0, topH + gap, cw, narrow);
    return {
      narrow: narrow, gap: gap,
      diag: { x: 0, y: 0, w: dW, h: topH },
      orb: { x: dW + gap, y: 0, w: cw - dW - gap, h: topH },
      spec: { x: 0, y: topH + gap, w: cw, h: sg.h },
      H: topH + gap + sg.h
    };
  }
  function diagGeom() {
    const D = L.diag, nr = L.narrow;
    const left = D.x + (nr ? 30 : 44), right = D.x + D.w - (nr ? 40 : 96);
    const top = D.y + (nr ? 30 : 34), bot = D.y + D.h - (nr ? 14 : 18);
    const colX = right - (nr ? 12 : 20);
    return { left: left, right: right, top: top, bot: bot, colX: colX, slotL: left + (nr ? 4 : 8),
      slotR: (state.mode === 'atom' ? colX - (nr ? 12 : 22) : right - 6) };
  }
  function Ey(E) { return G.top + (E_MAX - E) / (E_MAX - E_MIN) * (G.bot - G.top); }
  function yE(y) { return E_MAX - (y - G.top) / (G.bot - G.top) * (E_MAX - E_MIN); }
  function xLog(l) { return S.x0 + (Math.log(l) - Math.log(LOG_MIN)) / (Math.log(LOG_MAX) - Math.log(LOG_MIN)) * (S.x1 - S.x0); }
  function xZ(l) { return S.x0 + (l - Z_MIN) / (Z_MAX - Z_MIN) * (S.x1 - S.x0); }

  // 能階圖上的「躍遷位置」：每個線系（終點能階 nf = 1…6）一組，組內依 ni = nf+1 … 7、最後一格給游離／復合（∞）
  const SLOT_GAP = 1.2;
  function slotUnit() { return (G.slotR - G.slotL) / (27 + 5 * SLOT_GAP); }
  function groupStart(nf) { let off = 0; for (let k = 1; k < nf; k++) off += (8 - k) + SLOT_GAP; return off; }
  function slotX(ni, nf) {
    if (!(nf >= 1 && nf <= 6)) return null;
    const i = ni === Infinity ? 7 - nf : Math.min(ni, N_TOP) - nf - 1;
    return G.slotL + slotUnit() * (groupStart(nf) + i + 0.5);
  }

  function resize() {
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    cw = w;
    L = layout();
    ch = L.H;
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr);
    cv.height = Math.round(ch * dpr);
    G = diagGeom();
    S = specGeom(L.spec.x, L.spec.y, L.spec.w, L.narrow);
    initTubeParticles();
    buildBackground();
    draw();
  }

  function roundRect(c, x, y, w, h, r) {
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  function font(w, px) { return (w ? w + ' ' : '') + px + 'px system-ui, -apple-system, "Segoe UI", sans-serif'; }

  /** 有半透明圓角底框的標籤；c.textAlign 決定水平對齊，垂直置中於 y */
  function pill(c, text, x, y, color, f, bgA, bgColor) {
    c.font = f || font(600, 12);
    c.textBaseline = 'middle';
    const m = c.measureText(text), tw = m.width;
    const fh = m.fontBoundingBoxAscent > 0 ? m.fontBoundingBoxAscent + m.fontBoundingBoxDescent : 15;
    const ph = fh + 3, pw = tw + 10;
    const al = c.textAlign;
    const bx = al === 'center' ? x - pw / 2 : al === 'right' ? x - tw - 5 : x - 5;
    c.fillStyle = alpha(bgColor || colors['canvas-bg'], bgA == null ? 0.86 : bgA);
    roundRect(c, bx, y - ph / 2, pw, ph, ph / 2);
    c.fill();
    c.fillStyle = color;
    c.fillText(text, x, y + 0.5);
    return { x: bx, y: y - ph / 2, w: pw, h: ph };
  }
  /** 立體小球：亮點偏左上，邊緣加深，外加細亮邊 */
  function sphere(c, x, y, R, base, glow) {
    if (glow) {
      const gl = c.createRadialGradient(x, y, R * 0.6, x, y, R * 3);
      gl.addColorStop(0, alpha(base, colors.dark ? 0.35 : 0.22));
      gl.addColorStop(1, alpha(base, 0));
      c.fillStyle = gl;
      c.beginPath(); c.arc(x, y, R * 3, 0, Math.PI * 2); c.fill();
    }
    const g = c.createRadialGradient(x - R * 0.33, y - R * 0.35, R * 0.08, x, y, R);
    g.addColorStop(0, shade(base, 0.62));
    g.addColorStop(0.45, base);
    g.addColorStop(1, shade(base, -0.42));
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, R, 0, Math.PI * 2); c.fill();
    c.strokeStyle = alpha(shade(base, 0.7), colors.dark ? 0.55 : 0.4);
    c.lineWidth = 1;
    c.beginPath(); c.arc(x, y, Math.max(0.5, R - 0.5), Math.PI * 1.05, Math.PI * 1.65); c.stroke();
  }
  /** 能階線：兩層線條的管狀（底層粗而暗，上層細而亮、略偏上） */
  function levelLine(c, x0, x1, y, base, w) {
    c.lineCap = 'round';
    c.strokeStyle = base;
    c.lineWidth = w;
    c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.stroke();
    c.strokeStyle = alpha(shade(base, 0.6), colors.dark ? 0.5 : 0.65);
    c.lineWidth = Math.max(0.8, w * 0.36);
    c.beginPath(); c.moveTo(x0 + 1, y - w * 0.22); c.lineTo(x1 - 1, y - w * 0.22); c.stroke();
  }
  /** 垂直箭頭（能階圖的躍遷）：從 y0 到 y1，箭頭在 y1；dashed 為吸收 */
  function vArrow(c, x, y0, y1, color, lw, dashed, a) {
    const dir = y1 > y0 ? 1 : -1, len = Math.abs(y1 - y0);
    if (len < 2) return;
    const head = Math.min(4 * lw + 2, len * 0.6), hw = 1.6 * lw + 1;
    c.save();
    c.globalAlpha = a == null ? 1 : a;
    c.strokeStyle = color;
    c.fillStyle = color;
    c.lineWidth = lw;
    c.lineCap = 'round';
    if (dashed) c.setLineDash([3, 3]);
    c.beginPath(); c.moveTo(x, y0); c.lineTo(x, y1 - dir * head * 0.8); c.stroke();
    c.setLineDash([]);
    c.beginPath();
    c.moveTo(x, y1);
    c.quadraticCurveTo(x + hw * 0.35, y1 - dir * head * 0.45, x + hw, y1 - dir * head);
    c.lineTo(x, y1 - dir * head * 0.8);
    c.lineTo(x - hw, y1 - dir * head);
    c.quadraticCurveTo(x - hw * 0.35, y1 - dir * head * 0.45, x, y1);
    c.closePath();
    c.fill();
    c.restore();
  }

  // ---------- 不變的圖層（版面、主題、模式改變時重畫） ----------
  function panelBg(c, R, radial) {
    const base = colors['canvas-bg'];
    const edge = shade(base, colors.dark ? -0.35 : -0.045);
    let g;
    if (radial) {
      g = c.createRadialGradient(R.x + R.w / 2, R.y + R.h / 2, Math.min(R.w, R.h) * 0.1, R.x + R.w / 2, R.y + R.h / 2, Math.max(R.w, R.h) * 0.75);
      g.addColorStop(0, colors.dark ? shade(base, 0.03) : base);
      g.addColorStop(1, edge);
    } else {
      g = c.createLinearGradient(0, R.y, 0, R.y + R.h);
      g.addColorStop(0, base);
      g.addColorStop(1, edge);
    }
    c.fillStyle = g;
    roundRect(c, R.x, R.y, R.w, R.h, 8);
    c.fill();
    c.strokeStyle = alpha(colors.text, 0.08);
    c.lineWidth = 1;
    roundRect(c, R.x + 0.5, R.y + 0.5, R.w - 1, R.h - 1, 8);
    c.stroke();
  }

  function buildBackground() {
    bg.width = cv.width;
    bg.height = cv.height;
    const c = bgctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, cw, ch);
    panelBg(c, L.diag, false);
    panelBg(c, L.orb, true);
    panelBg(c, L.spec, false);
    buildDiagram(c);
    buildSpectrum(c);
    if (state.mode === 'abs') drawAbsStatic(c);
  }

  /** 標籤避免重疊：items = [{ y }]（由下往上），回傳調整後的 ly */
  function spread(items, gap, yTop) {
    const s = items.slice().sort(function (a, b) { return b.y - a.y; });
    let prev = Infinity;
    s.forEach(function (it) { it.ly = Math.min(it.y, prev - gap); prev = it.ly; });
    const over = yTop - s[s.length - 1].ly;
    if (over > 0) s.forEach(function (it) { it.ly += over; });
    return items;
  }

  function levelLabels() {
    const items = [];
    for (let n = 1; n <= N_TOP; n++) items.push({ n: n, y: Ey(HC.energy(n)) });
    items.push({ n: Infinity, y: Ey(0) });
    return spread(items, L.narrow ? 12.5 : 14, L.diag.y + 22);
  }

  function buildDiagram(c) {
    const D = L.diag, nr = L.narrow;
    const px = function (v) { return Math.round(v) + 0.5; };
    c.save();
    roundRect(c, D.x, D.y, D.w, D.h, 8);
    c.clip();
    // 連續能量區（E > 0：電子已掙脫）
    const y0 = Ey(0), yT = Ey(E_MAX);
    const cg = c.createLinearGradient(0, yT, 0, y0);
    cg.addColorStop(0, alpha(colors['b-modern'], colors.dark ? 0.2 : 0.14));
    cg.addColorStop(1, alpha(colors['b-modern'], 0.03));
    c.fillStyle = cg;
    c.fillRect(G.left, yT, G.right - G.left, y0 - yT);
    c.strokeStyle = alpha(colors['b-modern'], colors.dark ? 0.12 : 0.1);
    c.lineWidth = 1;
    c.beginPath();
    for (let x = G.left - (y0 - yT); x < G.right; x += 7) {
      c.moveTo(Math.max(G.left, x), yT + Math.max(0, G.left - x));
      c.lineTo(Math.min(G.right, x + (y0 - yT)), y0 - Math.max(0, x + (y0 - yT) - G.right));
    }
    c.stroke();
    c.textAlign = 'left';
    pill(c, nr ? T('E > 0：游離', 'E > 0: ionised') : T('E > 0：游離（自由電子）', 'E > 0: ionised (free electron)'), G.left + 5, yT + (y0 - yT) * 0.42,
      shade(colors['b-modern'], colors.dark ? 0.2 : -0.2), font(600, nr ? 10 : 11), 0.6);

    // 能量軸
    c.strokeStyle = alpha(colors.muted, 0.7);
    c.lineWidth = 1;
    const ax = G.left - (nr ? 5 : 8);
    c.beginPath(); c.moveTo(px(ax), Ey(E_MAX) - 2); c.lineTo(px(ax), G.bot); c.stroke();
    c.font = font('', nr ? 10 : 11);
    c.fillStyle = alpha(colors.muted, 0.95);
    c.textAlign = 'right';
    c.textBaseline = 'middle';
    for (let E = 0; E >= -14; E -= 2) {
      const y = Ey(E);
      c.beginPath(); c.moveTo(ax - 3, px(y)); c.lineTo(ax, px(y)); c.stroke();
      c.fillText(num(E, 0), ax - 4, y);
    }
    for (let E = -1; E >= -14; E -= 2) { const y = Ey(E); c.beginPath(); c.moveTo(ax - 2, px(y)); c.lineTo(ax, px(y)); c.stroke(); }
    c.textAlign = 'left';
    c.font = font(600, nr ? 11 : 12);
    c.fillStyle = colors.muted;
    c.fillText('E (eV)', D.x + 6, D.y + 13);
    c.textAlign = 'right';
    pill(c, T('能階圖', 'Energy levels'), D.x + D.w - 8, D.y + 13, colors.text, font(700, nr ? 12 : 13), 0.7);

    // n ≥ 8 的能階：越往上越密
    c.strokeStyle = alpha(colors.muted, colors.dark ? 0.3 : 0.25);
    c.lineWidth = 1;
    c.beginPath();
    for (let n = 8; n <= 40; n++) { const y = px(Ey(HC.energy(n))); c.moveTo(G.left, y); c.lineTo(G.right, y); }
    c.stroke();
    // n = ∞（E = 0）
    c.setLineDash([5, 4]);
    c.strokeStyle = alpha(colors.text, 0.55);
    c.beginPath(); c.moveTo(G.left, px(y0)); c.lineTo(G.right, px(y0)); c.stroke();
    c.setLineDash([]);
    // n = 1…7
    const lineBase = shade(colors.field, colors.dark ? -0.15 : 0.05);
    for (let n = 1; n <= N_TOP; n++) levelLine(c, G.left, G.right, Ey(HC.energy(n)), lineBase, nr ? 2 : 2.4);

    // 右側標籤（擠在一起的往上錯開，以細線連回能階）
    const labs = levelLabels();
    const lx = G.right + (nr ? 7 : 9);
    c.strokeStyle = alpha(colors.muted, 0.6);
    c.lineWidth = 1;
    labs.forEach(function (it) {
      if (Math.abs(it.ly - it.y) > 1) {
        c.beginPath(); c.moveTo(G.right + 2, it.y); c.lineTo(lx - 3, it.ly); c.stroke();
      }
    });
    labs.forEach(function (it) {
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      const nm = it.n === Infinity ? (nr ? '∞' : 'n = ∞') : (nr ? 'n=' + it.n : 'n = ' + it.n);
      c.font = font(700, nr ? 11 : 12);
      c.fillStyle = it.n === Infinity ? colors.muted : colors.text;
      c.fillText(nm, lx, it.ly);
      if (!nr) {
        const w = c.measureText(nm).width;
        c.font = font('', 11);
        c.fillStyle = colors.muted;
        c.fillText(it.n === Infinity ? '0 eV' : num(HC.energy(it.n), it.n < 4 ? 2 : 3), lx + w + 6, it.ly);
      }
    });

    // 線系名稱（在該線系終點能階的下方）
    const u = slotUnit();
    const names = [1, 2, 3];
    names.forEach(function (nf) {
      const s = HC.series(nf);
      const xs = G.slotL + u * (groupStart(nf) + (8 - nf) / 2);
      const y = Ey(HC.energy(nf)) + (nr ? 9 : 10);
      if (y > G.bot + 10) return;
      c.textAlign = 'center';
      const short = { 1: T('來曼', 'Lyman'), 2: T('巴耳末', 'Balmer'), 3: T('帕申', 'Paschen'), 4: T('布拉克', 'Brackett'), 5: T('蒲芬', 'Pfund') }[nf];
      pill(c, nr ? short : T(s.zh, s.en.replace(' series', '')), xs, y, colors.muted, font(600, nr ? 10 : 11), 0.55);
    });
    c.restore();
  }

  function buildSpectrum(c) {
    const nr = L.narrow, R = L.spec;
    c.save();
    roundRect(c, R.x, R.y, R.w, R.h, 8);
    c.clip();
    c.textBaseline = 'middle';
    c.textAlign = 'left';
    pill(c, T('光譜（波長為真空中的值）', 'Spectrum (vacuum wavelengths)'), R.x + 8, S.title, colors.text, font(700, nr ? 12 : 13), 0.7);
    // 波段
    const xu = xLog(HC.VIS_MIN), xv = xLog(HC.VIS_MAX);
    c.lineWidth = 3;
    c.lineCap = 'butt';
    c.strokeStyle = alpha(colors.uv, 0.8);
    c.beginPath(); c.moveTo(S.x0, S.band + 4); c.lineTo(xu, S.band + 4); c.stroke();
    c.strokeStyle = alpha(colors.ir, 0.8);
    c.beginPath(); c.moveTo(xv, S.band + 4); c.lineTo(S.x1, S.band + 4); c.stroke();
    for (let x = Math.floor(xu); x < xv; x++) {
      const l = Math.exp(Math.log(LOG_MIN) + (x + 0.5 - S.x0) / (S.x1 - S.x0) * (Math.log(LOG_MAX) - Math.log(LOG_MIN)));
      const rgb = HC.wavelengthToRGB(Math.min(HC.VIS_MAX, Math.max(HC.VIS_MIN, l)));
      c.fillStyle = rgba(rgb, 1);
      c.fillRect(x, S.band + 2.5, 1.2, 3);
    }
    c.font = font(600, nr ? 10 : 11);
    c.textAlign = 'center';
    c.fillStyle = shade(colors.uv, colors.dark ? 0.2 : -0.15);
    c.fillText(T('紫外線', 'Ultraviolet'), (S.x0 + xu) / 2, S.band - 3);
    c.fillStyle = colors.text;
    c.fillText(T('可見光', nr ? 'Vis.' : 'Visible'), (xu + xv) / 2, S.band - 3);
    c.fillStyle = shade(colors.ir, colors.dark ? 0.25 : -0.1);
    c.fillText(T('紅外線', 'Infrared'), (xv + S.x1) / 2, S.band - 3);

    // 兩條全波段的列：發射（暗底）、吸收（連續光譜）
    rowBg(c, S.lEm, 'em', xLog, true);
    rowBg(c, S.lAb, 'ab', xLog, true);
    rowBg(c, S.zEm, 'em', xZ, false);
    rowBg(c, S.zAb, 'ab', xZ, false);
    // 列名
    c.textAlign = 'right';
    c.font = font(600, nr ? 10 : 11);
    c.fillStyle = colors.muted;
    [[S.lEm, T('發射', 'Em.')], [S.lAb, T('吸收', 'Abs.')], [S.zEm, T('發射', 'Em.')], [S.zAb, T('吸收', 'Abs.')]].forEach(function (r) {
      c.fillText(r[1], S.x0 - 5, r[0].y + r[0].h / 2);
    });

    // 對數刻度
    const px = function (v) { return Math.round(v) + 0.5; };
    const yb = S.lAb.y + S.lAb.h;
    c.strokeStyle = alpha(colors.muted, 0.75);
    c.lineWidth = 1;
    c.beginPath();
    [50, 60, 70, 80, 90, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 15000].forEach(function (l) {
      const major = /^(1|10|100|1000|10000)$/.test(String(l / 50 === 1 ? 1 : l).replace(/0+$/, '1')) || [100, 1000, 10000].indexOf(l) >= 0;
      const x = px(xLog(l));
      c.moveTo(x, yb); c.lineTo(x, yb + (major ? 5 : 3));
    });
    c.stroke();
    c.font = font('', nr ? 10 : 11);
    c.fillStyle = colors.muted;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const ticks = nr ? [[100, '100 nm'], [1000, '1 μm'], [10000, '10 μm']] :
      [[100, '100 nm'], [200, '200'], [500, '500'], [1000, '1 μm'], [2000, '2 μm'], [5000, '5 μm'], [10000, '10 μm']];
    ticks.forEach(function (t) { c.fillText(t[1], xLog(t[0]), S.lAxis + 8); });

    // 線系範圍（系限到第一條線）
    [1, 2, 3].forEach(function (nf) {
      const a = xLog(HC.seriesLimit(nf)), b = xLog(HC.wavelength(nf + 1, nf));
      c.strokeStyle = alpha(colors.muted, 0.8);
      c.beginPath();
      c.moveTo(a, S.lSer - 3); c.lineTo(a, S.lSer + 1); c.lineTo(b, S.lSer + 1); c.lineTo(b, S.lSer - 3);
      c.stroke();
      c.textAlign = 'center';
      const s = HC.series(nf);
      pill(c, nr ? { 1: T('來曼', 'Ly'), 2: T('巴耳末', 'Ba'), 3: T('帕申', 'Pa') }[nf] : T(s.zh, s.en.replace(' series', '')),
        (a + b) / 2, S.lSer + 7, colors.muted, font(600, nr ? 10 : 11), 0.85);
    });

    // 放大區的連接線
    const ya = S.lSer + 14, yz = S.zLbl - 8;
    c.fillStyle = alpha(colors.accent, colors.dark ? 0.07 : 0.05);
    c.beginPath();
    c.moveTo(xLog(Z_MIN), ya); c.lineTo(xLog(Z_MAX), ya); c.lineTo(S.x1, yz); c.lineTo(S.x0, yz); c.closePath();
    c.fill();
    c.strokeStyle = alpha(colors.accent, 0.35);
    c.beginPath();
    c.moveTo(xLog(Z_MIN), ya); c.lineTo(S.x0, yz);
    c.moveTo(xLog(Z_MAX), ya); c.lineTo(S.x1, yz);
    c.stroke();
    c.strokeStyle = alpha(colors.accent, 0.6);
    c.lineWidth = 2;
    c.beginPath(); c.moveTo(xLog(Z_MIN), ya); c.lineTo(xLog(Z_MAX), ya); c.stroke();
    c.lineWidth = 1;

    // 放大區刻度
    const zb = S.zAb.y + S.zAb.h;
    c.strokeStyle = alpha(colors.muted, 0.75);
    c.beginPath();
    for (let l = 360; l <= Z_MAX; l += 10) {
      const x = px(xZ(l));
      c.moveTo(x, zb); c.lineTo(x, zb + (l % 50 === 0 ? 5 : 3));
    }
    c.stroke();
    c.textAlign = 'center';
    c.fillStyle = colors.muted;
    c.font = font('', nr ? 10 : 11);
    const step = nr ? 100 : 50;
    for (let l = 400; l <= Z_MAX; l += step) c.fillText(l === Z_MAX ? '700 nm' : String(l), xZ(l) - (l === Z_MAX ? 14 : 0), S.zAxis + 8);
    // 巴耳末系限
    const xl = xZ(HC.seriesLimit(2));
    c.strokeStyle = alpha(colors.text, 0.5);
    c.setLineDash([2, 2]);
    c.beginPath(); c.moveTo(px(xl), S.zEm.y - 3); c.lineTo(px(xl), zb + 2); c.stroke();
    c.setLineDash([]);
    c.restore();
  }

  /** 光譜列的底：發射列為暗底；吸收列為連續光譜（看不見的部分用斜線假色） */
  function rowBg(c, row, kind, X, isLog) {
    const x0 = S.x0, x1 = S.x1;
    c.save();
    roundRect(c, x0, row.y, x1 - x0, row.h, 3);
    c.clip();
    if (kind === 'em') {
      const g = c.createLinearGradient(0, row.y, 0, row.y + row.h);
      g.addColorStop(0, shade(colors.night, 0.06));
      g.addColorStop(0.5, colors.night);
      g.addColorStop(1, shade(colors.night, 0.04));
      c.fillStyle = g;
      c.fillRect(x0, row.y, x1 - x0, row.h);
    } else {
      const l0 = isLog ? Math.log(LOG_MIN) : Z_MIN, l1 = isLog ? Math.log(LOG_MAX) : Z_MAX;
      for (let x = Math.floor(x0); x < x1; x++) {
        const t = (x + 0.5 - x0) / (x1 - x0);
        const l = isLog ? Math.exp(l0 + t * (l1 - l0)) : l0 + t * (l1 - l0);
        const p = pcol(l);
        c.fillStyle = p.vis ? rgba(p.rgb, 1) : alpha(p.rgb, colors.dark ? 0.45 : 0.4);
        c.fillRect(x, row.y, 1.2, row.h);
      }
      // 看不見的部分加斜線
      const xu = X(HC.VIS_MIN), xv = X(HC.VIS_MAX);
      c.strokeStyle = alpha(colors['canvas-bg'], 0.45);
      c.lineWidth = 1;
      c.beginPath();
      for (let x = x0 - row.h; x < x1; x += 5) {
        if (x + row.h < xu || x > xv) { c.moveTo(x, row.y + row.h); c.lineTo(x + row.h, row.y); }
      }
      c.stroke();
      // 上下的細陰影，像嵌入的長條
      const sh = c.createLinearGradient(0, row.y, 0, row.y + row.h);
      sh.addColorStop(0, 'rgba(0,0,0,0.18)');
      sh.addColorStop(0.25, 'rgba(0,0,0,0)');
      sh.addColorStop(0.8, 'rgba(0,0,0,0)');
      sh.addColorStop(1, 'rgba(0,0,0,0.14)');
      c.fillStyle = sh;
      c.fillRect(x0, row.y, x1 - x0, row.h);
    }
    c.restore();
    c.strokeStyle = alpha(colors.text, 0.18);
    c.lineWidth = 1;
    roundRect(c, x0 + 0.5, row.y + 0.5, x1 - x0 - 1, row.h - 1, 3);
    c.stroke();
  }

  // ---------- 主繪圖 ----------
  let drawPending = false;
  function requestDraw() {
    if (drawPending) return;
    drawPending = true;
    requestAnimationFrame(function () { drawPending = false; draw(); });
  }
  function draw() {
    if (!L) return;
    const tNow = performance.now();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(bg, 0, 0, cw, ch);
    drawDiagram(tNow);
    if (state.mode === 'atom') drawOrbit(tNow);
    else if (state.mode === 'tube') drawTube(tNow);
    else drawAbs(tNow);
    drawSpectrum(tNow);
  }

  // ---------- 能階圖（動態部分） ----------
  function drawDiagram(tNow) {
    const D = L.diag, nr = L.narrow;
    const c = ctx;
    c.save();
    roundRect(c, D.x, D.y, D.w, D.h, 8);
    c.clip();
    const lw = nr ? 1.5 : 2;
    if (state.mode === 'atom') {
      // 已記錄的躍遷：放在各線系的位置（發射實線往下、吸收虛線往上）
      Object.keys(state.ab).forEach(function (k) {
        const p = k.split('-').map(Number), lo = p[0], up = p[1];
        const x = slotX(up, lo);
        if (x == null) return;
        const col = pcol(HC.wavelength(up, lo));
        vArrow(c, x + 1.5, Ey(HC.energy(lo)), Ey(HC.energy(up)), rgba(col.rgb, 1), lw * 0.85, true, 0.85);
      });
      Object.keys(state.em).forEach(function (k) {
        const p = k.split('-').map(Number), up = p[0], lo = p[1];
        const x = slotX(up, lo);
        if (x == null) return;
        const col = pcol(HC.wavelength(up, lo));
        vArrow(c, x - (state.ab[lo + '-' + up] ? 1.5 : 0), Ey(HC.energy(up)), Ey(HC.energy(lo)), rgba(col.rgb, 1), lw, false, 0.95);
      });
      state.cont.forEach(function (r) {
        const x = slotX(Infinity, r.n);
        if (x == null) return;
        const col = pcol(r.lambda);
        const yT = Ey(Math.min(E_MAX - 0.15, r.K)), yL = Ey(HC.energy(r.n));
        if (r.kind === 'em') vArrow(c, x, yT, yL, rgba(col.rgb, 1), lw, false, 0.8);
        else vArrow(c, x, yL, yT, rgba(col.rgb, 1), lw * 0.85, true, 0.8);
      });
      // 滑鼠所指的能階
      if (state.hover != null && !state.busy) {
        const E = state.hover === Infinity ? 0 : HC.energy(state.hover);
        c.strokeStyle = alpha(colors.accent, 0.35);
        c.lineWidth = 7;
        c.lineCap = 'round';
        c.beginPath(); c.moveTo(G.left, Ey(E)); c.lineTo(G.right, Ey(E)); c.stroke();
      }
      drawElectronColumn(tNow);
    } else if (state.mode === 'tube') {
      drawTubeDiagram(tNow);
    } else {
      drawAbsDiagram(tNow);
    }
    c.restore();
  }

  function electronE() { return state.n === Infinity ? Math.min(E_MAX - 0.2, state.K) : HC.energy(state.n); }

  function drawElectronColumn(tNow) {
    const c = ctx, nr = L.narrow, x = G.colX;
    // n > 7：標出那條能階
    if (state.n !== Infinity && state.n > N_TOP) {
      const y = Ey(HC.energy(state.n));
      c.strokeStyle = alpha(colors.neg, 0.8);
      c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(G.left, y); c.lineTo(G.right, y); c.stroke();
    }
    // 最近一次躍遷的大箭頭（3 秒內漸淡）
    const j = state.jump;
    if (j) {
      const age = (tNow - j.t0) / 1000;
      const a = reducedMotion ? 1 : Math.max(0, 1 - Math.max(0, age - 1.5) / 2.5);
      if (a > 0) {
        const y0 = Ey(j.E0), y1 = Ey(j.E1);
        const col = rgba(j.rgb, 1);
        // 光暈
        c.save();
        c.globalAlpha = a * 0.35;
        c.strokeStyle = col;
        c.lineWidth = nr ? 7 : 9;
        c.lineCap = 'round';
        c.beginPath(); c.moveTo(x, y0); c.lineTo(x, y1); c.stroke();
        c.restore();
        vArrow(c, x, y0, y1, col, nr ? 2.2 : 2.8, !j.emission, a);
        if (j.label) {
          c.textAlign = 'right';
          const ly = Math.max(G.top + 10, Math.min(G.bot - 10, (y0 + y1) / 2));
          c.save();
          c.globalAlpha = a;
          pill(c, j.label, x - (nr ? 7 : 10), ly, colors.text, font(600, nr ? 10 : 11), 0.85);
          c.restore();
        }
      }
    }
    // 電子（已游離時畫在連續區，高度 = 動能 K）
    const ye = Ey(electronE());
    sphere(c, x, ye, nr ? 4.5 : 5.5, colors.neg, true);
    if (state.n !== Infinity && state.n > N_TOP) {
      c.textAlign = 'right';
      pill(c, 'n = ' + state.n, x - 9, ye - 10, colors.neg, font(700, nr ? 10 : 11), 0.85);
    }
  }

  // ---------- 波耳軌道（單一原子模式） ----------
  function viewTarget() {
    if (!state.show.zoom) return 1.12 * 49;
    const n = state.n === Infinity ? Math.max(state.lastN, 2) : state.n;
    const m = n < N_TOP ? n + 1 : n;
    return 1.14 * m * m;
  }
  function viewNow(tNow) {
    const v = state.view, u = reducedMotion ? 1 : Math.min(1, (tNow - v.t0) / 650);
    const e = 1 - Math.pow(1 - u, 3);
    return Math.exp(Math.log(v.from) + (Math.log(v.to) - Math.log(v.from)) * e);
  }
  function setView(tNow) {
    const cur = viewNow(tNow), to = viewTarget();
    if (Math.abs(to - state.view.to) < 1e-9) return;
    state.view = { from: cur, to: to, t0: tNow };
  }
  function orbitGeom(tNow) {
    const O = L.orb;
    const R = viewNow(tNow);
    const half = Math.min(O.w, O.h) / 2 - (L.narrow ? 8 : 14);
    return { cx: O.x + O.w / 2, cy: O.y + O.h / 2 + (L.narrow ? 4 : 8), k: half / R, R: R };
  }
  function electronXY(og) {
    const r = HC.radius(state.n) / HC.A_H * og.k;
    return [og.cx + r * Math.cos(state.theta), og.cy - r * Math.sin(state.theta)];
  }

  function drawOrbit(tNow) {
    const O = L.orb, nr = L.narrow, c = ctx;
    const og = orbitGeom(tNow);
    c.save();
    roundRect(c, O.x, O.y, O.w, O.h, 8);
    c.clip();
    const maxR = Math.hypot(O.w, O.h);
    const nMax = Math.max(N_TOP, state.n === Infinity ? 0 : state.n);
    let prevR = 0;
    for (let m = 1; m <= nMax; m++) {
      if (m > N_TOP && m !== state.n) continue;
      const r = m * m * og.k;
      if (r < 1.5 || r > maxR) { prevR = r; continue; }
      const cur = m === state.n;
      if (cur) {
        c.strokeStyle = alpha(colors.accent, 0.22);
        c.lineWidth = 6;
        c.beginPath(); c.arc(og.cx, og.cy, r, 0, Math.PI * 2); c.stroke();
        c.strokeStyle = alpha(colors.accent, 0.9);
        c.lineWidth = 1.6;
        c.beginPath(); c.arc(og.cx, og.cy, r, 0, Math.PI * 2); c.stroke();
      } else {
        c.strokeStyle = alpha(colors.muted, state.hover === m ? 0.9 : 0.42);
        c.lineWidth = state.hover === m ? 2.5 : 1;
        c.setLineDash([4, 4]);
        c.beginPath(); c.arc(og.cx, og.cy, r, 0, Math.PI * 2); c.stroke();
        c.setLineDash([]);
      }
      // 軌道編號（空間夠才標）
      if (r >= 16 && r - prevR >= 11) {
        const a = -0.85;
        const lx = og.cx + r * Math.cos(a), ly = og.cy + r * Math.sin(a);
        if (lx < O.x + O.w - 10 && ly > O.y + 26) {
          c.textAlign = 'center';
          pill(c, 'n=' + m, lx, ly, cur ? colors.accent : colors.muted, font(cur ? 700 : 600, nr ? 10 : 11), 0.8);
        }
      }
      prevR = r;
    }

    // 物質波（駐波）：軌道上剛好 n 個波長
    if (state.show.wave && state.n !== Infinity && state.n <= 30) {
      const r = state.n * state.n * og.k;
      if (r >= 12 && r < maxR) {
        const A0 = Math.min(r * 0.16, nr ? 7 : 9);
        const A = A0 * (reducedMotion ? 1 : Math.cos(tNow / 1000 * Math.PI * 1.25));
        // 駐波的包絡（波腹與波節的位置固定）
        c.fillStyle = alpha(colors['b-modern'], colors.dark ? 0.14 : 0.1);
        c.beginPath();
        const NE = Math.max(120, state.n * 24);
        for (let i = 0; i <= NE; i++) {
          const th = i / NE * Math.PI * 2, rr = r + A0 * Math.abs(Math.sin(state.n * th));
          if (i) c.lineTo(og.cx + rr * Math.cos(th), og.cy - rr * Math.sin(th)); else c.moveTo(og.cx + rr * Math.cos(th), og.cy - rr * Math.sin(th));
        }
        for (let i = NE; i >= 0; i--) {
          const th = i / NE * Math.PI * 2, rr = r - A0 * Math.abs(Math.sin(state.n * th));
          c.lineTo(og.cx + rr * Math.cos(th), og.cy - rr * Math.sin(th));
        }
        c.closePath();
        c.fill();
        c.strokeStyle = alpha(colors['b-modern'], 0.85);
        c.lineWidth = 1.6;
        c.beginPath();
        const N = Math.max(120, state.n * 24);
        for (let i = 0; i <= N; i++) {
          const th = i / N * Math.PI * 2;
          const rr = r + A * Math.sin(state.n * th);
          const x = og.cx + rr * Math.cos(th), y = og.cy - rr * Math.sin(th);
          if (i) c.lineTo(x, y); else c.moveTo(x, y);
        }
        c.stroke();
      }
    }

    // 原子核（質子）
    sphere(c, og.cx, og.cy, nr ? 4 : 5, colors.pos, true);
    if (state.n === Infinity) {
      // 只剩質子：H 與右上角的 +
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      c.font = font(700, nr ? 12 : 13);
      c.fillStyle = colors.pos;
      const hx = og.cx + 9, hy = og.cy + 14;
      c.fillText('H', hx, hy);
      const w = c.measureText('H').width;
      c.font = font(700, nr ? 9 : 10);
      c.fillText('+', hx + w + 1, hy - 5);
    }

    // 短暫效果
    drawOrbitFx(tNow, og);

    // 電子
    if (state.n !== Infinity) {
      const p = electronXY(og);
      sphere(c, p[0], p[1], nr ? 4.5 : 5.5, colors.neg, true);
    } else if (state.free) {
      const f = state.free, t = (tNow - f.t0) / 1000;
      const x = f.x + f.ux * f.sp * t, y = f.y + f.uy * f.sp * t;
      if (x > O.x - 10 && x < O.x + O.w + 10 && y > O.y - 10 && y < O.y + O.h + 10) sphere(c, x, y, nr ? 4.5 : 5.5, colors.neg, true);
      else state.free = null;
    }

    // 光子
    drawPhotons(tNow, og);

    // 標題與比例尺
    c.textAlign = 'left';
    pill(c, T('波耳模型（依比例）', 'Bohr model (to scale)'), O.x + 8, O.y + 13, colors.text, font(700, nr ? 11 : 13), 0.75);
    drawScaleBar(og);
    c.restore();
  }

  function drawScaleBar(og) {
    const O = L.orb, nr = L.narrow, c = ctx;
    const pxPerNm = og.k / (HC.A_H * 1e9);
    const cands = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
    let v = cands[0];
    cands.forEach(function (x) { if (x * pxPerNm <= O.w * 0.32) v = x; });
    const len = v * pxPerNm;
    const x0 = O.x + 12, y = O.y + O.h - 14;
    c.fillStyle = alpha(colors['canvas-bg'], 0.75);
    roundRect(c, x0 - 6, y - 17, Math.max(len, 48) + 12, 26, 6);
    c.fill();
    c.strokeStyle = colors.text;
    c.lineWidth = 1.5;
    c.lineCap = 'butt';
    c.beginPath();
    c.moveTo(x0, y - 3); c.lineTo(x0, y + 3);
    c.moveTo(x0, y); c.lineTo(x0 + len, y);
    c.moveTo(x0 + len, y - 3); c.lineTo(x0 + len, y + 3);
    c.stroke();
    c.font = font(600, nr ? 10 : 11);
    c.fillStyle = colors.text;
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillText(num(v, v < 0.1 ? 2 : v < 1 ? 1 : 0) + ' nm', x0, y - 10);
  }

  function drawOrbitFx(tNow, og) {
    const c = ctx;
    state.fx = state.fx.filter(function (e) { return tNow - e.t0 < e.dur; });
    state.fx.forEach(function (e) {
      const u = (tNow - e.t0) / e.dur;
      if (e.type === 'ring') {
        c.strokeStyle = rgba(e.rgb, 0.8 * (1 - u));
        c.lineWidth = 2.2 * (1 - u) + 0.6;
        c.beginPath(); c.arc(e.x, e.y, 6 + 22 * u, 0, Math.PI * 2); c.stroke();
      } else if (e.type === 'ghost') {
        c.fillStyle = alpha(colors.neg, 0.45 * (1 - u));
        c.beginPath(); c.arc(e.x, e.y, (L.narrow ? 4.5 : 5.5) * (1 + 0.4 * u), 0, Math.PI * 2); c.fill();
      }
    });
  }

  // ---------- 光子波包 ----------
  /** 畫面上的波長（示意，單調遞增）：λ 越長，畫得越長 */
  function lamPx(l) { return Math.max(4.5, Math.min(46, 3 + 6.5 * Math.log2(l / 80))); }
  function drawPacket(c, x, y, ux, uy, lam, a, len, amp) {
    const col = pcol(lam);
    const lp = lamPx(lam), Lp = len || (L.narrow ? 46 : 60), A = amp || (L.narrow ? 5 : 6.5);
    const nx = -uy, ny = ux;
    const pts = [];
    for (let s = -Lp / 2; s <= Lp / 2; s += 1.5) {
      const env = Math.exp(-Math.pow(s / (Lp * 0.3), 2));
      const off = A * env * Math.sin(2 * Math.PI * s / lp);
      pts.push([x + ux * s + nx * off, y + uy * s + ny * off]);
    }
    c.save();
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.strokeStyle = rgba(col.rgb, 0.28 * a);
    c.lineWidth = col.vis ? 6 : 5;
    c.beginPath(); pts.forEach(function (p, i) { if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }); c.stroke();
    c.strokeStyle = rgba(col.rgb, a);
    c.lineWidth = 2;
    if (!col.vis) c.setLineDash([4, 3]);
    c.beginPath(); pts.forEach(function (p, i) { if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }); c.stroke();
    c.restore();
    return col;
  }
  function photonLabel(lam, name) {
    const col = pcol(lam);
    return (name ? name + ' ' : '') + fmtL(lam) + ' nm' + (col.vis ? '' : col.band === 'UV' ? ' (UV)' : ' (IR)');
  }

  function drawPhotons(tNow, og) {
    const O = L.orb, c = ctx;
    const keep = [];
    state.photons.forEach(function (p) {
      const t = (tNow - p.t0) / 1000;
      let x = p.x + p.ux * p.sp * t, y = p.y + p.uy * p.sp * t;
      if (p.kind === 'in' && !p.done) {
        const dist = Math.hypot(p.tx - p.x, p.ty - p.y);
        if (p.sp * t >= dist || reducedMotion) {
          p.done = true;
          x = p.tx; y = p.ty;
          const res = p.arrive();
          if (res === 'pass') {
            keep.push({ kind: 'pass', x: x, y: y, ux: p.ux, uy: p.uy, sp: p.sp, t0: tNow, lam: p.lam, label: T('穿過（沒被吸收）', 'passes through (not absorbed)') });
          } else if (!reducedMotion) {
            state.fx.push({ type: 'ring', x: x, y: y, rgb: pcol(p.lam).rgb, t0: tNow, dur: 450 });
          }
          return;
        }
      }
      const out = x < O.x - 60 || x > O.x + O.w + 60 || y < O.y - 60 || y > O.y + O.h + 60;
      const age = t;
      if (out || (reducedMotion && age > 2.2)) return;
      keep.push(p);
      const a = p.kind === 'pass' ? Math.max(0.25, 1 - age * 0.5) : 1;
      if (reducedMotion && p.kind !== 'in') { x = p.x + p.ux * 50; y = p.y + p.uy * 50; }
      drawPacket(c, x, y, p.ux, p.uy, p.lam, a);
      const inside = x > O.x && x < O.x + O.w && y > O.y && y < O.y + O.h;
      if (p.label && age < 1.6 && inside) {
        c.save();
        c.globalAlpha = Math.min(1, 1.6 - age) * a;
        // 標籤放在波包的側邊（偏上方），不壓在波形上
        let nx = -p.uy, ny = p.ux;
        if (ny > 0) { nx = -nx; ny = -ny; }
        c.textAlign = 'center';
        c.font = font(600, L.narrow ? 10 : 11);
        const hw = c.measureText(p.label).width / 2 + 6;
        const off = 18 + Math.abs(nx) * (hw - 10);
        const lx = Math.max(O.x + hw + 2, Math.min(O.x + O.w - hw - 2, x + nx * off));
        const ly = Math.max(O.y + 30, Math.min(O.y + O.h - 30, y + ny * off));
        pill(c, p.label, lx, ly, colors.text, font(600, L.narrow ? 10 : 11), 0.85);
        c.restore();
      }
    });
    state.photons = keep;
  }

  // ---------- 放電管 ----------
  function tubeGeom() {
    const O = L.orb, vert = O.h > O.w * 1.25;
    const cx = O.x + O.w / 2, cy = O.y + O.h * (vert ? 0.44 : 0.42);
    const len = vert ? O.h * 0.56 : O.w * 0.8;
    const dia = vert ? Math.min(O.w * 0.32, 56) : Math.min(O.h * 0.2, 74);
    return { vert: vert, cx: cx, cy: cy, len: len, dia: dia };
  }
  /** 管內座標 u（−0.5 陰極 … 0.5 陽極）、v（−0.5 … 0.5 橫向）→ 畫布座標 */
  function tubePt(tg, u, v) {
    return tg.vert ? [tg.cx + v * tg.dia, tg.cy - 0.0 + u * tg.len] : [tg.cx + u * tg.len, tg.cy + v * tg.dia];
  }
  function initTubeParticles() {
    const tb = state.tube;
    const r = HC.rng(20261111);
    tb.atoms = [];
    for (let i = 0; i < 34; i++) tb.atoms.push({ u: -0.4 + 0.84 * r(), v: -0.32 + 0.64 * r() });
    tb.elec = [];
    for (let i = 0; i < 14; i++) tb.elec.push({ u: -0.45 + 0.9 * r(), v: -0.3 + 0.6 * r(), ph: r() * 6.28 });
  }
  function tubeRecompute() {
    const tb = state.tube, K = val($('tK'));
    tb.K = K;
    tb.probs = HC.excitationProbs(K);
    tb.exp = HC.expectedPhotons(tb.probs);
    let m = 0;
    const lines = [];
    Object.keys(tb.exp).forEach(function (k) {
      m += tb.exp[k];
      const p = k.split('-').map(Number), t = HC.transition(p[0], p[1]);
      lines.push({ lambda: t.lambda, power: tb.exp[k] * t.E });
    });
    tb.meanPh = m;
    tb.glow = HC.mixColor(lines);
    if (!refY) {
      const ex = HC.expectedPhotons(HC.excitationProbs(K_REF));
      refY = HC.mixColor(Object.keys(ex).map(function (k) { const p = k.split('-').map(Number), t = HC.transition(p[0], p[1]); return { lambda: t.lambda, power: ex[k] * t.E }; })).Y;
    }
  }
  let refY = 0;
  function tubeTop() {
    const ns = Object.keys(state.tube.probs).map(Number);
    return ns.length ? Math.max.apply(null, ns) : 0;
  }

  function drawTube(tNow) {
    const O = L.orb, nr = L.narrow, c = ctx, tb = state.tube;
    const tg = tubeGeom();
    c.save();
    roundRect(c, O.x, O.y, O.w, O.h, 8);
    c.clip();
    const half = tg.len / 2, r = tg.dia / 2;
    const glow = tb.glow, on = tb.running || tb.ph > 0;
    const I = glow && on ? Math.max(0.4, Math.min(1, glow.Y / refY)) : 0;
    const flick = reducedMotion ? 1 : 0.94 + 0.06 * Math.sin(tNow / 37) * Math.sin(tNow / 91);
    // 局部座標：沿管子為 x
    c.save();
    c.translate(tg.cx, tg.cy);
    if (tg.vert) c.rotate(Math.PI / 2);
    // 導線與電極
    c.strokeStyle = alpha(colors.muted, 0.8);
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-half - 14, 0); c.lineTo(-half - 30, 0);
    c.moveTo(half + 14, 0); c.lineTo(half + 30, 0);
    c.stroke();
    [-1, 1].forEach(function (s) {
      const ex = s * (half + 6);
      const g = c.createLinearGradient(0, -r * 0.45, 0, r * 0.45);
      g.addColorStop(0, shade(colors.field, colors.dark ? 0.2 : 0.55));
      g.addColorStop(1, shade(colors.field, colors.dark ? -0.3 : -0.05));
      c.fillStyle = g;
      roundRect(c, ex - 8, -r * 0.45, 16, r * 0.9, 4);
      c.fill();
    });
    // 管內的光（陰極附近較暗：法拉第暗區）
    c.save();
    roundRect(c, -half, -r, tg.len, tg.dia, r);
    c.clip();
    c.fillStyle = alpha(colors.night, colors.dark ? 0.55 : 0.18);
    c.fillRect(-half, -r, tg.len, tg.dia);
    if (I > 0) {
      const col = glow.rgb;
      const gl = c.createLinearGradient(-half, 0, half, 0);
      gl.addColorStop(0, rgba(col, 0));
      gl.addColorStop(0.1, rgba(col, 0.15 * I));
      gl.addColorStop(0.2, rgba(col, 0.85 * I * flick));
      gl.addColorStop(0.9, rgba(col, 0.9 * I * flick));
      gl.addColorStop(1, rgba(col, 0.5 * I));
      c.fillStyle = gl;
      c.fillRect(-half, -r, tg.len, tg.dia);
      const core = c.createLinearGradient(0, -r, 0, r);
      core.addColorStop(0, 'rgba(255,255,255,0)');
      core.addColorStop(0.5, 'rgba(255,255,255,' + (0.35 * I * flick) + ')');
      core.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = core;
      c.fillRect(-half * 0.8, -r, tg.len * 0.9, tg.dia);
    } else if (on && tb.meanPh > 0) {
      // 只有紫外線：看不見，以假色虛線示意
      c.strokeStyle = alpha(colors.uv, 0.35);
      c.setLineDash([4, 5]);
      c.lineWidth = 1;
      for (let k = -2; k <= 2; k++) { c.beginPath(); c.moveTo(-half * 0.8, k * r * 0.3); c.lineTo(half * 0.9, k * r * 0.3); c.stroke(); }
      c.setLineDash([]);
    }
    c.restore();
    // 玻璃：外框與高光
    c.strokeStyle = alpha(colors.text, colors.dark ? 0.45 : 0.35);
    c.lineWidth = 1.5;
    roundRect(c, -half, -r, tg.len, tg.dia, r);
    c.stroke();
    c.strokeStyle = 'rgba(255,255,255,' + (colors.dark ? 0.28 : 0.6) + ')';
    c.lineWidth = 2;
    c.beginPath(); c.moveTo(-half + r, -r + 3.5); c.lineTo(half - r, -r + 3.5); c.stroke();
    c.restore();

    // 原子、電子與閃光
    tb.atoms.forEach(function (a) {
      const p = tubePt(tg, a.u, a.v);
      c.fillStyle = alpha(colors.text, colors.dark ? 0.35 : 0.3);
      c.beginPath(); c.arc(p[0], p[1], 1.6, 0, Math.PI * 2); c.fill();
    });
    if (on && tb.running && !reducedMotion) {
      tb.elec.forEach(function (e) {
        const p = tubePt(tg, e.u, e.v + 0.05 * Math.sin(e.ph + tNow / 160));
        c.fillStyle = alpha(colors.neg, 0.85);
        c.beginPath(); c.arc(p[0], p[1], 1.8, 0, Math.PI * 2); c.fill();
      });
    }
    tb.flashes = tb.flashes.filter(function (f) { return tNow - f.t0 < 600; });
    tb.flashes.forEach(function (f) {
      const u = (tNow - f.t0) / 600, a = tb.atoms[f.i], p = tubePt(tg, a.u, a.v);
      if (f.vis) {
        const g = c.createRadialGradient(p[0], p[1], 0, p[0], p[1], 9 + 8 * u);
        g.addColorStop(0, rgba(f.rgb, 0.95 * (1 - u)));
        g.addColorStop(1, rgba(f.rgb, 0));
        c.fillStyle = g;
        c.beginPath(); c.arc(p[0], p[1], 9 + 8 * u, 0, Math.PI * 2); c.fill();
      } else {
        c.strokeStyle = rgba(f.rgb, 0.9 * (1 - u));
        c.lineWidth = 1.4;
        c.setLineDash([2, 2]);
        c.beginPath(); c.arc(p[0], p[1], 3 + 9 * u, 0, Math.PI * 2); c.stroke();
        c.setLineDash([]);
      }
    });

    // 電極符號
    const pc = tubePt(tg, -0.5, 0), pa = tubePt(tg, 0.5, 0);
    const ef = font(600, nr ? 10 : 11);
    if (tg.vert) {
      c.textAlign = 'left';
      pill(c, T('−陰極', '− cathode'), pc[0] + 13, pc[1] - 8, colors.text, ef, 0.75);
      pill(c, T('＋陽極', '+ anode'), pa[0] + 13, pa[1] + 8, colors.text, ef, 0.75);
    } else {
      c.textAlign = 'center';
      pill(c, T('−（陰極）', '− cathode'), pc[0], pc[1] - r - 12, colors.text, ef, 0.75);
      pill(c, T('＋（陽極）', '+ anode'), pa[0], pa[1] - r - 12, colors.text, ef, 0.75);
    }

    // 標題與說明
    c.textAlign = 'left';
    pill(c, T('氫氣放電管', 'Hydrogen discharge tube'), O.x + 8, O.y + 13, colors.text, font(700, nr ? 11 : 13), 0.75);
    const yInfo = tg.vert ? O.y + O.h - 44 : tg.cy + r + 34;
    const sw = nr ? 22 : 30;
    let txt;
    if (!tb.meanPh) txt = T('電子能量不足：原子無法被激發，不發光', 'Too little energy: no atom is excited, no light');
    else if (!glow) txt = T('只放出紫外線：肉眼看不見', 'Ultraviolet only: invisible to the eye');
    else txt = T('肉眼看到的顏色', 'Colour seen by the eye');
    c.textAlign = 'left';
    const x0 = O.x + (nr ? 8 : 14);
    if (glow && tb.meanPh) {
      const g = c.createLinearGradient(x0, 0, x0 + sw, 0);
      g.addColorStop(0, rgba(glow.rgb, 0.85));
      g.addColorStop(1, rgba(glow.rgb, 1));
      c.fillStyle = g;
      roundRect(c, x0, yInfo - 8, sw, 16, 4);
      c.fill();
      c.strokeStyle = alpha(colors.text, 0.25);
      c.lineWidth = 1;
      roundRect(c, x0 + 0.5, yInfo - 7.5, sw - 1, 15, 4);
      c.stroke();
    }
    wrapText(c, txt, x0 + (glow && tb.meanPh ? sw + 8 : 0), yInfo, O.x + O.w - 8 - (x0 + (glow && tb.meanPh ? sw + 8 : 0)), colors.text, font(600, nr ? 10 : 12));
    const top = tubeTop();
    wrapText(c, top ? T('可激發到 n = 2 … ', 'Levels reached: n = 2 … ') + top : T('沒有能階可激發', 'No level can be reached'),
      x0, yInfo + (nr ? 26 : 22), O.x + O.w - 8 - x0, colors.muted, font('', nr ? 10 : 11));
    // 桌機：各能階的激發門檻（電子動能 K 至少要多少）
    if (!tg.vert) {
      const yT = yInfo + 50, rows = 3, colW = (O.w - 28) / 2;
      if (yT + rows * 20 < O.y + O.h - 6) {
        c.textAlign = 'left';
        c.font = font(700, 11);
        c.fillStyle = colors.muted;
        c.fillText(T('激發門檻（由 n = 1 往上）', 'Excitation thresholds (from n = 1)'), x0, yT);
        for (let n = 2; n <= N_TOP; n++) {
          const i = n - 2, cx0 = x0 + Math.floor(i / rows) * colW, y = yT + 20 + (i % rows) * 19;
          const ok = tb.probs[n] > 0, thr = HC.energy(n) - HC.energy(1);
          c.beginPath(); c.arc(cx0 + 5, y, 4.5, 0, Math.PI * 2);
          if (ok) { c.fillStyle = colors.accent; c.fill(); } else { c.strokeStyle = alpha(colors.muted, 0.8); c.lineWidth = 1.2; c.stroke(); }
          c.font = font(ok ? 600 : '', 11);
          c.fillStyle = ok ? colors.text : colors.muted;
          c.fillText('n = ' + n + T('：', ': ') + 'K ≥ ' + num(thr, 2) + ' eV', cx0 + 15, y);
        }
      }
    }
    c.restore();
  }
  /** 簡單換行（中文逐字、英文逐詞），最多兩行 */
  function wrapText(c, text, x, y, maxW, color, f) {
    c.font = f;
    c.fillStyle = color;
    c.textBaseline = 'middle';
    if (c.measureText(text).width <= maxW) { c.fillText(text, x, y); return 1; }
    const parts = /\s/.test(text) ? text.split(/(\s+)/) : Array.from(text);
    let line = '', lines = [];
    parts.forEach(function (p) {
      const t = line + p;
      if (c.measureText(t).width > maxW && line) { lines.push(line.trim()); line = p.trim(); } else line = t;
    });
    if (line) lines.push(line.trim());
    lines = lines.slice(0, 3);
    const lh = parseFloat(/(\d+(\.\d+)?)px/.exec(f)[1]) * 1.25;
    lines.forEach(function (ln, i) { c.fillText(ln, x, y + (i - (lines.length - 1) / 2) * lh); });
    return lines.length;
  }

  function drawTubeDiagram(tNow) {
    const c = ctx, nr = L.narrow, tb = state.tube;
    const lw = nr ? 1.3 : 1.7;
    const yK = Ey(HC.energy(1) + tb.K);
    // 激發不到的能階變淡
    c.fillStyle = alpha(colors['canvas-bg'], 0.55);
    c.fillRect(G.left - 2, Ey(E_MAX), G.right - G.left + 4, Math.max(0, yK - Ey(E_MAX)));
    // 可能的躍遷（淡）＋剛放出光子的閃亮
    const flashMap = {};
    tb.flashes.forEach(function (f) { flashMap[f.key] = Math.max(flashMap[f.key] || 0, 1 - (tNow - f.t0) / 600); });
    Object.keys(tb.exp).forEach(function (k) {
      const p = k.split('-').map(Number), up = p[0], lo = p[1];
      const x = slotX(up, lo);
      const col = pcol(HC.wavelength(up, lo));
      const f = flashMap[k] || 0;
      if (f > 0) {
        c.save();
        c.globalAlpha = f * 0.45;
        c.strokeStyle = rgba(col.rgb, 1);
        c.lineWidth = lw * 4;
        c.lineCap = 'round';
        c.beginPath(); c.moveTo(x, Ey(HC.energy(up))); c.lineTo(x, Ey(HC.energy(lo))); c.stroke();
        c.restore();
      }
      vArrow(c, x, Ey(HC.energy(up)), Ey(HC.energy(lo)), rgba(col.rgb, 1), lw, false, 0.35 + 0.65 * f);
    });
    // 電子能量 K：由 n = 1 往上量
    const x = G.right - (nr ? 6 : 10);
    const y1 = Ey(HC.energy(1));
    c.strokeStyle = alpha(colors.accent, 0.9);
    c.setLineDash([5, 4]);
    c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(G.left, yK); c.lineTo(G.right, yK); c.stroke();
    c.setLineDash([]);
    c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(x, y1 - 1); c.lineTo(x, yK + 6); c.stroke();
    c.fillStyle = colors.accent;
    c.beginPath(); c.moveTo(x, yK + 1); c.lineTo(x - 4, yK + 8); c.lineTo(x + 4, yK + 8); c.closePath(); c.fill();
    c.textAlign = 'right';
    pill(c, 'K = ' + num(tb.K, 2) + ' eV', x - 6, (y1 + yK) / 2 + 30, colors.accent, font(700, nr ? 10 : 11), 0.85);
  }

  // ---------- 白光穿過氫氣 ----------
  function absLows() { return state.abs.hot ? [1, 2] : [1]; }
  function absGeom() {
    const O = L.orb, vert = O.h > O.w * 1.25;
    return { vert: vert, O: O, len: vert ? O.h * 0.74 : O.w * 0.9, dia: vert ? Math.min(O.w * 0.3, 50) : Math.min(O.h * 0.2, 80),
      cx: O.x + O.w / 2, cy: O.y + O.h * (vert ? 0.5 : 0.4) };
  }
  function absPt(g, u, v) { return g.vert ? [g.cx - v * g.dia, g.cy + u * g.len] : [g.cx + u * g.len, g.cy + v * g.dia]; }
  const ABS_U = { lamp: -0.43, cell0: -0.25, cell1: 0.03, grating: 0.13 };
  function absAtoms() {
    if (state.abs.atoms) return state.abs.atoms;
    const r = HC.rng(4242), out = [];
    for (let i = 0; i < 22; i++) out.push({ u: ABS_U.cell0 + 0.02 + (ABS_U.cell1 - ABS_U.cell0 - 0.04) * r(), v: -0.34 + 0.68 * r(), hot: r() < 0.25 });
    state.abs.atoms = out;
    return out;
  }

  /** 白光吸收裝置的不變部分（光源、光束、氣體管、光柵、分光扇形與標籤），畫在背景圖層 */
  function drawAbsStatic(c) {
    const O = L.orb, nr = L.narrow, g = absGeom();
    c.save();
    roundRect(c, O.x, O.y, O.w, O.h, 8);
    c.clip();
    const P = function (u, v) { return absPt(g, u, v); };
    // 光束
    const b0 = P(ABS_U.lamp, 0), b1 = P(ABS_U.grating, 0);
    const bw = g.dia * 0.32;
    c.save();
    c.lineCap = 'round';
    c.strokeStyle = 'rgba(255,255,255,' + (colors.dark ? 0.16 : 0.0) + ')';
    c.lineWidth = bw * 2.2;
    c.beginPath(); c.moveTo(b0[0], b0[1]); c.lineTo(b1[0], b1[1]); c.stroke();
    c.strokeStyle = alpha(colors.equi, colors.dark ? 0.22 : 0.16);
    c.lineWidth = bw;
    c.beginPath(); c.moveTo(b0[0], b0[1]); c.lineTo(b1[0], b1[1]); c.stroke();
    c.restore();
    // 燈泡
    const lp = P(ABS_U.lamp, 0), lr = g.dia * 0.38;
    const gl = c.createRadialGradient(lp[0], lp[1], 0, lp[0], lp[1], lr * 2.6);
    gl.addColorStop(0, 'rgba(255,250,235,0.9)');
    gl.addColorStop(0.35, alpha(colors.equi, 0.35));
    gl.addColorStop(1, alpha(colors.equi, 0));
    c.fillStyle = gl;
    c.beginPath(); c.arc(lp[0], lp[1], lr * 2.6, 0, Math.PI * 2); c.fill();
    sphere(c, lp[0], lp[1], lr, mix('#fff7e0', colors.equi, 0.25), false);
    // 氣體容器（玻璃管）
    const ca = P(ABS_U.cell0, 0), cb = P(ABS_U.cell1, 0);
    const clen = Math.hypot(cb[0] - ca[0], cb[1] - ca[1]), cr = g.dia / 2;
    c.save();
    c.translate((ca[0] + cb[0]) / 2, (ca[1] + cb[1]) / 2);
    if (g.vert) c.rotate(Math.PI / 2);
    const fillG = c.createLinearGradient(0, -cr, 0, cr);
    fillG.addColorStop(0, alpha(colors['b-modern'], 0.06));
    fillG.addColorStop(0.5, alpha(colors['b-modern'], state.abs.hot ? 0.2 : 0.12));
    fillG.addColorStop(1, alpha(colors['b-modern'], 0.06));
    c.fillStyle = fillG;
    roundRect(c, -clen / 2, -cr, clen, cr * 2, 7);
    c.fill();
    c.strokeStyle = alpha(colors.text, colors.dark ? 0.45 : 0.35);
    c.lineWidth = 1.5;
    roundRect(c, -clen / 2, -cr, clen, cr * 2, 7);
    c.stroke();
    c.strokeStyle = 'rgba(255,255,255,' + (colors.dark ? 0.25 : 0.65) + ')';
    c.lineWidth = 2;
    c.beginPath(); c.moveTo(-clen / 2 + 7, -cr + 3.5); c.lineTo(clen / 2 - 7, -cr + 3.5); c.stroke();
    c.restore();
    absAtoms().forEach(function (a) {
      const p = P(a.u, a.v);
      const excited = state.abs.hot && a.hot;
      c.fillStyle = excited ? alpha(colors.equi, 0.95) : alpha(colors.text, colors.dark ? 0.45 : 0.35);
      c.beginPath(); c.arc(p[0], p[1], excited ? 2.4 : 1.8, 0, Math.PI * 2); c.fill();
    });
    // 光柵與分光後的扇形
    const gp = P(ABS_U.grating, 0);
    drawFan(c, g, gp);
    c.save();
    c.translate(gp[0], gp[1]);
    if (g.vert) c.rotate(Math.PI / 2);
    c.fillStyle = shade(colors.field, colors.dark ? -0.1 : 0.3);
    roundRect(c, -3, -g.dia * 0.5, 6, g.dia, 2);
    c.fill();
    c.strokeStyle = alpha(colors['canvas-bg'], 0.7);
    c.lineWidth = 1;
    c.beginPath();
    for (let k = -g.dia * 0.45; k < g.dia * 0.45; k += 3) { c.moveTo(-3, k); c.lineTo(3, k); }
    c.stroke();
    c.restore();
    // 標籤
    const f = font(600, nr ? 10 : 11);
    c.textAlign = 'center';
    const lab = function (text, u, v) { const p = P(u, v); pill(c, text, p[0], p[1], colors.muted, f, 0.75); };
    if (g.vert) {
      lab(T('白光', 'White light'), ABS_U.lamp, -0.9);
      lab(T('氫氣', 'Hydrogen'), (ABS_U.cell0 + ABS_U.cell1) / 2, -0.95);
      lab(T('光柵', 'Grating'), ABS_U.grating, 0.95);
    } else {
      lab(T('白光', 'White light'), ABS_U.lamp, 0.95);
      lab(T('氫氣', 'Hydrogen gas'), (ABS_U.cell0 + ABS_U.cell1) / 2, 0.85);
      lab(T('光柵', 'Grating'), ABS_U.grating, 0.85);
    }
    c.textAlign = 'left';
    pill(c, T('白光穿過氫氣', 'White light through hydrogen'), O.x + 8, O.y + 13, colors.text, font(700, nr ? 11 : 13), 0.75);
    const yInfo = O.y + O.h - (nr ? 14 : 22);
    if (!g.vert) {
      // 說明分光後看到什麼
      const hot = state.abs.hot;
      wrapText(c, hot ? T('分光後：可見光區出現 Hα、Hβ、Hγ、Hδ… 的暗線，位置與放電管的明線相同。', 'After the grating: dark Hα, Hβ, Hγ, Hδ… lines appear in the visible part, exactly where the bright lines of the discharge tube are.')
        : T('分光後：可見光完整無缺，沒有暗線。冷氫氣只吸收紫外線（來曼系），看光譜下方的全波段。', 'After the grating: the visible spectrum is complete, with no dark lines. Cool hydrogen absorbs only ultraviolet (Lyman) light — see the full spectrum below.'),
        O.x + 12, yInfo - 44, O.w - 24, colors.muted, font('', 12));
    }
    c.textAlign = 'left';
    pill(c, state.abs.hot ? T(nr ? '熱：n = 1、2 有原子' : '熱氫氣：n = 1 與 n = 2 都有原子', nr ? 'Hot: n = 1 and 2' : 'Hot gas: atoms in n = 1 and n = 2')
      : T(nr ? '冷：原子都在 n = 1' : '冷氫氣：原子都在 n = 1', nr ? 'Cool: all in n = 1' : 'Cool gas: all atoms in n = 1'), O.x + 10, yInfo, colors.text, font(600, nr ? 10 : 12), 0.75);
    c.restore();
  }
  function drawAbs(tNow) {
    const O = L.orb, c = ctx;
    c.save();
    roundRect(c, O.x, O.y, O.w, O.h, 8);
    c.clip();
    drawAbsPhotons(tNow, absGeom());
    c.restore();
  }
  /** 光柵後的可見光扇形：被吸收的可見光波長變成暗縫 */
  function drawFan(c, g, gp) {
    const len = g.len * (g.vert ? 0.3 : 0.36);
    const span = 0.42; // 半張角（rad）
    const dir = g.vert ? Math.PI / 2 : 0;
    const dark = [];
    absLows().forEach(function (lo) { for (let up = lo + 1; up <= 12; up++) { const l = HC.wavelength(up, lo); if (l >= HC.VIS_MIN && l <= HC.VIS_MAX) dark.push(l); } });
    c.save();
    for (let l = HC.VIS_MIN; l < HC.VIS_MAX; l += 2) {
      const a0 = dir + (-span + 2 * span * (l - HC.VIS_MIN) / (HC.VIS_MAX - HC.VIS_MIN)) * (g.vert ? -1 : 1);
      const a1 = dir + (-span + 2 * span * (l + 2 - HC.VIS_MIN) / (HC.VIS_MAX - HC.VIS_MIN)) * (g.vert ? -1 : 1);
      const rgb = HC.wavelengthToRGB(l + 1);
      const gr = c.createRadialGradient(gp[0], gp[1], 4, gp[0], gp[1], len);
      gr.addColorStop(0, rgba(rgb, 0.0));
      gr.addColorStop(0.25, rgba(rgb, 0.55));
      gr.addColorStop(1, rgba(rgb, 0.85));
      c.fillStyle = gr;
      c.beginPath(); c.moveTo(gp[0], gp[1]);
      c.arc(gp[0], gp[1], len, Math.min(a0, a1), Math.max(a0, a1) + 0.002);
      c.closePath(); c.fill();
    }
    c.strokeStyle = alpha(colors.night, 0.92);
    c.lineWidth = 1.6;
    dark.forEach(function (l) {
      const a = dir + (-span + 2 * span * (l - HC.VIS_MIN) / (HC.VIS_MAX - HC.VIS_MIN)) * (g.vert ? -1 : 1);
      c.beginPath();
      c.moveTo(gp[0] + Math.cos(a) * len * 0.18, gp[1] + Math.sin(a) * len * 0.18);
      c.lineTo(gp[0] + Math.cos(a) * len, gp[1] + Math.sin(a) * len);
      c.stroke();
    });
    c.restore();
  }
  function absStep(dt, tNow) {
    const A = state.abs;
    if (reducedMotion) return;
    A.acc += dt * 7;
    while (A.acc >= 1) {
      A.acc -= 1;
      const r = Math.random();
      let lam, lo = null, up = null;
      const lows = absLows();
      if (r < 0.4) { // 正好落在某條譜線上的光子
        lo = Math.random() < 0.75 || lows.length === 1 ? (Math.random() < (state.abs.hot ? 0.5 : 0.65) ? 1 : 2) : 2;
        up = lo + 1 + Math.floor(Math.random() * Math.random() * (N_TOP - lo));
        lam = HC.wavelength(up, lo);
      } else {
        lam = Math.exp(Math.log(80) + Math.random() * (Math.log(2500) - Math.log(80)));
      }
      A.ph.push({ lam: lam, lo: lo, t0: tNow, v: (Math.random() - 0.5) * 0.36, state: 'go' });
    }
  }
  function drawAbsPhotons(tNow, g) {
    const A = state.abs, c = ctx, keep = [];
    const speed = 0.32; // 每秒走過的管長比例
    const atoms = absAtoms();
    A.ph.forEach(function (p) {
      const t = (tNow - p.t0) / 1000;
      if (p.state === 'go') {
        const u = ABS_U.lamp + 0.03 + speed * t;
        const absorbable = p.lo != null && absLows().indexOf(p.lo) >= 0;
        if (absorbable && u >= p.uAbs) {
          // 被某個原子吸收，稍後往隨機方向再放出（離開光束）
          const a = atoms[Math.floor(Math.random() * atoms.length)];
          const q = absPt(g, a.u, a.v);
          p.state = 'scat'; p.x = q[0]; p.y = q[1]; p.t1 = tNow;
          const ang = Math.random() * Math.PI * 2;
          p.ux = Math.cos(ang); p.uy = Math.sin(ang);
          keep.push(p);
          return;
        }
        if (u > ABS_U.grating) return;
        const q = absPt(g, u, p.v);
        drawPacket(c, q[0], q[1], g.vert ? 0 : 1, g.vert ? 1 : 0, p.lam, 0.9, L.narrow ? 18 : 24, L.narrow ? 2.6 : 3.2);
        keep.push(p);
      } else {
        const t1 = (tNow - p.t1) / 1000;
        if (t1 < 0.18) {
          const rgb = pcol(p.lam).rgb;
          const gr = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, 10);
          gr.addColorStop(0, rgba(rgb, 0.9));
          gr.addColorStop(1, rgba(rgb, 0));
          c.fillStyle = gr;
          c.beginPath(); c.arc(p.x, p.y, 10, 0, Math.PI * 2); c.fill();
          keep.push(p);
          return;
        }
        const s = (t1 - 0.18) * 90;
        if (s > 120) return;
        drawPacket(c, p.x + p.ux * s, p.y + p.uy * s, p.ux, p.uy, p.lam, Math.max(0, 1 - s / 120), L.narrow ? 16 : 22, L.narrow ? 2.4 : 3);
        keep.push(p);
      }
    });
    A.ph = keep;
  }
  function drawAbsDiagram() {
    const c = ctx, nr = L.narrow, lw = nr ? 1.3 : 1.7;
    absLows().forEach(function (lo) {
      for (let up = lo + 1; up <= N_TOP; up++) {
        const x = slotX(up, lo), col = pcol(HC.wavelength(up, lo));
        vArrow(c, x, Ey(HC.energy(lo)), Ey(HC.energy(up)), rgba(col.rgb, 1), lw, true, 0.9);
      }
      const x = slotX(Infinity, lo), col = pcol(HC.seriesLimit(lo) * 0.9);
      vArrow(c, x, Ey(HC.energy(lo)), Ey(1.2), rgba(col.rgb, 1), lw, true, 0.9);
    });
    // 原子所在的能階：很多電子
    const many = function (n, k, R) {
      const y = Ey(HC.energy(n));
      for (let i = 0; i < k; i++) {
        const x = G.right - (nr ? 6 : 10) - i * (nr ? 7 : 9);
        sphere(c, x, y, R, colors.neg, false);
      }
    };
    many(1, nr ? 4 : 6, nr ? 3 : 3.6);
    if (state.abs.hot) many(2, 2, nr ? 3 : 3.6);
  }

  // ---------- 光譜（動態部分） ----------
  function specLine(c, x, row, rgb, I, kind, vis, w) {
    if (x < S.x0 - 2 || x > S.x1 + 2 || !(I > 0)) return;
    w = w || (L.narrow ? 1.6 : 2);
    if (kind === 'em') {
      const a = Math.pow(Math.min(1, I), 1 / 2.2); // 線性光強 → sRGB 亮度
      c.fillStyle = rgba(rgb, 0.3 * a);
      c.fillRect(x - w * 1.6, row.y + 1, w * 3.2, row.h - 2);
      if (vis) {
        c.fillStyle = rgba(rgb, a);
        c.fillRect(x - w / 2, row.y + 1, w, row.h - 2);
      } else {
        c.fillStyle = alpha(shade(rgb, 0.35), a);
        for (let y = row.y + 1; y < row.y + row.h - 1; y += 4) c.fillRect(x - w / 2, y, w, Math.min(2.4, row.y + row.h - 1 - y));
      }
    } else {
      c.fillStyle = 'rgba(0,0,0,' + (0.35 * I) + ')';
      c.fillRect(x - w * 1.3, row.y, w * 2.6, row.h);
      c.fillStyle = 'rgba(0,0,0,' + (0.88 * I) + ')';
      c.fillRect(x - w / 2, row.y, w, row.h);
    }
  }
  function bothTracks(c, lam, kind, I, Iz, w) {
    const col = pcol(lam);
    specLine(c, xLog(lam), kind === 'em' ? S.lEm : S.lAb, col.rgb, I, kind, col.vis, w);
    if (lam >= Z_MIN && lam <= Z_MAX) specLine(c, xZ(lam), kind === 'em' ? S.zEm : S.zAb, col.rgb, Iz == null ? I : Iz, kind, col.vis, w);
  }
  function lineLabels(c, lit) {
    const nr = L.narrow;
    for (let up = 3; up <= 7; up++) {
      const l = HC.wavelength(up, 2), x = xZ(l);
      const on = lit && lit[up + '-2'];
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = font(on ? 700 : 600, nr ? 10 : 11);
      const col = pcol(l);
      c.fillStyle = on ? (colors.dark ? rgba(col.rgb, 1) : shade(col.rgb, -0.25)) : alpha(colors.muted, 0.75);
      if (nr && up === 7) continue;
      c.fillText(HC.lineName(up, 2), x, S.zLbl);
    }
    if (!nr) {
      c.textAlign = 'center';
      c.font = font('', 10);
      c.fillStyle = alpha(colors.muted, 0.85);
      c.fillText(T('系限', 'limit'), xZ(HC.seriesLimit(2)) + 1, S.zLbl);
    }
  }
  function dimRow(c, row) {
    c.fillStyle = alpha(colors['canvas-bg'], 0.72);
    c.fillRect(S.x0, row.y, S.x1 - S.x0, row.h);
  }

  function drawSpectrum(tNow) {
    const c = ctx, R = L.spec, nr = L.narrow;
    c.save();
    roundRect(c, R.x, R.y, R.w, R.h, 8);
    c.clip();
    if (state.mode === 'atom') {
      Object.keys(state.em).forEach(function (k) { const p = k.split('-').map(Number); bothTracks(c, HC.wavelength(p[0], p[1]), 'em', 1); });
      Object.keys(state.ab).forEach(function (k) { const p = k.split('-').map(Number); bothTracks(c, HC.wavelength(p[0], p[1]), 'ab', 1); });
      state.cont.forEach(function (r) { bothTracks(c, r.lambda, r.kind, 0.75, 0.75, nr ? 1.2 : 1.4); });
      // 最近一個光子：小三角形標記
      const last = state.last;
      if (last && isFinite(last.lambda)) {
        const age = (tNow - last.t0) / 1000;
        const pulse = reducedMotion ? 1 : 0.6 + 0.4 * Math.cos(Math.min(age, 3) * 6);
        const col = pcol(last.lambda);
        const row = last.kind === 'em' || last.kind === 'recomb' ? 'em' : 'ab';
        const mark = function (x, y) {
          c.fillStyle = colors.dark ? rgba(col.rgb, pulse) : shade(col.rgb, -0.2);
          c.beginPath(); c.moveTo(x, y + 1); c.lineTo(x - 4, y - 5); c.lineTo(x + 4, y - 5); c.closePath(); c.fill();
        };
        const lx = xLog(last.lambda);
        if (lx >= S.x0 && lx <= S.x1) mark(lx, (row === 'em' ? S.lEm : S.lAb).y - (row === 'em' ? 0 : -1));
        if (last.lambda >= Z_MIN && last.lambda <= Z_MAX) mark(xZ(last.lambda), (row === 'em' ? S.zEm.y : S.zAb.y));
      }
      lineLabels(c, Object.assign({}, state.em, state.ab));
    } else if (state.mode === 'tube') {
      const tb = state.tube;
      let mAll = 0, mVis = 0;
      Object.keys(tb.counts).forEach(function (k) {
        const p = k.split('-').map(Number), l = HC.wavelength(p[0], p[1]);
        mAll = Math.max(mAll, tb.counts[k]);
        if (l >= Z_MIN && l <= Z_MAX) mVis = Math.max(mVis, tb.counts[k]);
      });
      Object.keys(tb.counts).forEach(function (k) {
        const p = k.split('-').map(Number), l = HC.wavelength(p[0], p[1]);
        bothTracks(c, l, 'em', tb.counts[k] / mAll, mVis ? tb.counts[k] / mVis : 0);
      });
      dimRow(c, S.lAb); dimRow(c, S.zAb);
      c.textAlign = 'center';
      c.font = font(600, nr ? 10 : 11);
      c.fillStyle = colors.muted;
      c.textBaseline = 'middle';
      c.fillText(T('（放電管只看發射光譜）', '(the discharge tube gives an emission spectrum)'), (S.x0 + S.x1) / 2, S.zAb.y + S.zAb.h / 2);
      lineLabels(c, tb.counts);
      if (!nr) {
        c.textAlign = 'right';
        pill(c, T('亮度 ∝ 光子數；可見光區以最亮的線為準', 'Brightness ∝ photon count; visible part scaled to its brightest line'),
          R.x + R.w - 8, S.title, colors.muted, font('', 11), 0.0);
      }
    } else {
      // 參考：放電管的發射光譜
      const ex = HC.expectedPhotons(HC.excitationProbs(K_REF));
      let mAll = 0, mVis = 0;
      Object.keys(ex).forEach(function (k) { const p = k.split('-').map(Number), l = HC.wavelength(p[0], p[1]); mAll = Math.max(mAll, ex[k]); if (l >= Z_MIN && l <= Z_MAX) mVis = Math.max(mVis, ex[k]); });
      Object.keys(ex).forEach(function (k) { const p = k.split('-').map(Number); bothTracks(c, HC.wavelength(p[0], p[1]), 'em', ex[k] / mAll, ex[k] / mVis); });
      // 吸收：原子所在的能階往上的所有譜線，以及系限以外的連續吸收（游離）
      absLows().forEach(function (lo) {
        for (let up = lo + 1; up <= 40; up++) bothTracks(c, HC.wavelength(up, lo), 'ab', up <= N_TOP ? 1 : 0.7, null, up <= N_TOP ? null : 1);
        const lim = HC.seriesLimit(lo);
        const strength = lo === 1 ? 0.9 : 0.55;
        [[S.lAb, xLog, LOG_MIN], [S.zAb, xZ, Z_MIN]].forEach(function (t) {
          const xa = t[1](Math.max(t[2], lim * 0.55)), xb = t[1](lim);
          if (xb <= S.x0) return;
          const gg = c.createLinearGradient(xb, 0, Math.max(S.x0, xa), 0);
          gg.addColorStop(0, 'rgba(0,0,0,' + strength + ')');
          gg.addColorStop(1, 'rgba(0,0,0,' + strength * 0.55 + ')');
          c.fillStyle = gg;
          c.fillRect(Math.max(S.x0, xa), t[0].y, Math.min(xb, S.x1) - Math.max(S.x0, xa), t[0].h);
          if (t[2] === LOG_MIN && xa > S.x0) { c.fillStyle = 'rgba(0,0,0,' + strength * 0.55 + ')'; c.fillRect(S.x0, t[0].y, xa - S.x0, t[0].h); }
        });
      });
      const lit = {};
      if (state.abs.hot) for (let up = 3; up <= 7; up++) lit[up + '-2'] = 1;
      lineLabels(c, lit);
      if (!nr) {
        c.textAlign = 'right';
        pill(c, T('發射列：放電管（參考）', 'Emission rows: discharge tube (reference)'), R.x + R.w - 8, S.title, colors.muted, font('', 11), 0.0);
      }
    }
    c.restore();
  }

  // ---------- 單一原子：躍遷、射入光子 ----------
  function setStatus(msg) { $('status').textContent = msg || ''; }
  function lineText(t) {
    const nm = t.name ? t.name + '，' : '';
    return T(nm + seriesName(t.lower), (t.name ? t.name + ', ' : '') + seriesName(t.lower));
  }
  function addFx(type, x, y, rgb, dur) { if (!reducedMotion) state.fx.push({ type: type, x: x, y: y, rgb: rgb, t0: performance.now(), dur: dur }); }

  function request(target, Ktap) {
    if (state.mode !== 'atom') return;
    if (state.busy) { setStatus(T('光子還在路上，稍等一下。', 'A photon is still on its way — wait a moment.')); return; }
    const n = state.n;
    if (n === Infinity) {
      if (target === Infinity) { setStatus(T('原子已經游離了。點一個能階，讓質子捕獲電子。', 'The atom is already ionised. Tap a level to let the proton capture the electron.')); return; }
      recombine(target);
      return;
    }
    if (target === n) { setStatus(T('電子已經在 n = ' + n + '。', 'The electron is already in n = ' + n + '.')); return; }
    if (target < n) { emitPhoton(n, target); return; }
    const E = target === Infinity ? HC.ionizationEnergy(n) + (Ktap || 0) : HC.energy(target) - HC.energy(n);
    shoot(E, 'tap');
  }

  /** 放出光子：電子由 ni 掉到 nf */
  function emitPhoton(ni, nf) {
    const tNow = performance.now();
    const og = orbitGeom(tNow);
    const p0 = electronXY(og);
    const t = HC.transition(ni, nf);
    const key = ni + '-' + nf;
    state.em[key] = (state.em[key] || 0) + 1;
    state.n = nf;
    addFx('ghost', p0[0], p0[1], null, 500);
    const p1 = electronXY(og);
    const col = pcol(t.lambda);
    addFx('ring', p1[0], p1[1], col.rgb, 450);
    // 光子沿徑向往外
    let ux = p0[0] - og.cx, uy = p0[1] - og.cy;
    const d = Math.hypot(ux, uy) || 1;
    ux /= d; uy /= d;
    if (d < 1) { ux = Math.cos(state.theta); uy = -Math.sin(state.theta); }
    state.photons.push({ kind: 'out', x: p1[0], y: p1[1], ux: ux, uy: uy, sp: L.narrow ? 130 : 180, t0: tNow, lam: t.lambda, label: photonLabel(t.lambda, t.name) });
    state.jump = { E0: HC.energy(ni), E1: HC.energy(nf), rgb: col.rgb, t0: tNow, emission: true, label: photonLabel(t.lambda, t.name) };
    state.last = { kind: 'em', from: ni, to: nf, E: t.E, lambda: t.lambda, t: t, t0: tNow };
    setView(tNow);
    setStatus(T('電子由 n = ' + ni + ' 掉到 n = ' + nf + '，放出一個 ' + num(t.E, 4) + ' eV 的光子（' + fmtL(t.lambda) + ' nm，' + lineText(t) + '）。',
      'The electron fell from n = ' + ni + ' to n = ' + nf + ' and emitted a ' + num(t.E, 4) + ' eV photon (' + fmtL(t.lambda) + ' nm, ' + lineText(t) + ').'));
    afterChange();
    emit('emit', { from: ni, to: nf, E: t.E, lambda: t.lambda, name: t.name, series: t.lower, region: t.region, visible: t.region === 'VIS',
      source: 'tap', free: false, lines: Object.keys(state.em) });
  }

  /** 自由電子被捕獲到能階 n：放出 K + |E_n| 的光子（連續光譜） */
  function recombine(n) {
    const tNow = performance.now();
    const ph = HC.recombination(state.K, n);
    const Kold = state.K;
    state.n = n;
    state.K = 0;
    state.free = null;
    setView(tNow);
    const og = orbitGeom(tNow);
    const p1 = electronXY(og);
    const col = pcol(ph.lambda);
    addFx('ring', p1[0], p1[1], col.rgb, 450);
    const ang = Math.random() * Math.PI * 2;
    state.photons.push({ kind: 'out', x: p1[0], y: p1[1], ux: Math.cos(ang), uy: Math.sin(ang), sp: L.narrow ? 130 : 180, t0: tNow, lam: ph.lambda,
      label: photonLabel(ph.lambda, T('復合', 'capture')) });
    state.cont.push({ lambda: ph.lambda, kind: 'em', n: n, K: Kold });
    state.jump = { E0: Math.min(E_MAX - 0.2, Kold), E1: HC.energy(n), rgb: col.rgb, t0: tNow, emission: true, label: photonLabel(ph.lambda, '') };
    state.last = { kind: 'recomb', from: Infinity, to: n, E: ph.E, lambda: ph.lambda, K: Kold, t0: tNow };
    setStatus(T('質子捕獲了動能 ' + num(Kold, 4) + ' eV 的自由電子，電子落到 n = ' + n + '，放出 ' + num(ph.E, 4) + ' eV 的光子（K + |E' + n + '|）。',
      'The proton captured the free electron (kinetic energy ' + num(Kold, 4) + ' eV) into n = ' + n + ', emitting a ' + num(ph.E, 4) + ' eV photon (K + |E_' + n + '|).'));
    afterChange();
    const t = HC.transition(Infinity, n);
    emit('emit', { from: Infinity, to: n, E: ph.E, lambda: ph.lambda, name: null, series: n, region: HC.region(ph.lambda), visible: HC.region(ph.lambda) === 'VIS',
      source: 'recomb', free: true, K: Kold, lines: Object.keys(state.em), limit: t.lambda });
  }

  /** 射入能量 E 的光子；飛到原子時才判斷是否被吸收 */
  function shoot(E, source) {
    const tNow = performance.now();
    state.busy = true;
    const og = orbitGeom(tNow);
    const O = L.orb;
    const lam = HC.HC_EV_NM / E;
    const rTarget = state.n === Infinity ? 0 : HC.radius(state.n) / HC.A_H * og.k;
    const tx = og.cx - Math.min(rTarget, O.w * 0.45), ty = og.cy;
    state.photons.push({
      kind: 'in', x: O.x - 30, y: og.cy, ux: 1, uy: 0, sp: L.narrow ? 220 : 300, t0: tNow, lam: lam, tx: tx, ty: ty,
      label: photonLabel(lam, '') + ' · ' + num(E, 4) + ' eV',
      arrive: function () { return resolve(E, source); }
    });
    setStatus(T('射入 ' + num(E, 4) + ' eV 的光子……', 'Firing a ' + num(E, 4) + ' eV photon…'));
    startLoop();
    if (reducedMotion) requestDraw();
  }

  function resolve(E, source) {
    state.busy = false;
    const tNow = performance.now();
    const n = state.n;
    const r = HC.absorb(n, E);
    const ph = HC.photonFromEnergy(E);
    const col = pcol(ph.lambda);
    if (r.type === 'pass') {
      state.last = { kind: 'pass', from: n, E: E, lambda: ph.lambda, t0: tNow, nearest: r.nearest };
      if (n === Infinity) {
        setStatus(T('光子直接穿過：原子已經游離，只剩一個質子，沒有電子可以吸收光子。', 'The photon passes straight through: the atom is ionised — only a bare proton is left, with no electron to absorb it.'));
      } else {
        const nb = r.nearest;
        const need = nb ? HC.energy(nb.to) - HC.energy(n) : NaN;
        setStatus(T('光子穿過，沒被吸收：' + num(E, 4) + ' eV 不等於任何能階差。' + (nb ? '最接近的是 n = ' + n + ' → ' + nb.to + '，需要 ' + num(need, 4) + ' eV（差 ' + num(Math.abs(nb.dE), 4) + ' eV）。' : ''),
          'The photon passes through, not absorbed: ' + num(E, 4) + ' eV matches no energy difference.' + (nb ? ' The nearest is n = ' + n + ' → ' + nb.to + ', which needs ' + num(need, 4) + ' eV (off by ' + num(Math.abs(nb.dE), 4) + ' eV).' : '')));
      }
      afterChange();
      emit('pass', { from: n, bare: n === Infinity, E: E, lambda: ph.lambda, visible: col.band === 'VIS', source: source });
      return 'pass';
    }
    const og = orbitGeom(tNow);
    const p0 = state.n === Infinity ? [og.cx, og.cy] : electronXY(og);
    if (r.type === 'absorb') {
      const key = n + '-' + r.to;
      state.ab[key] = (state.ab[key] || 0) + 1;
      state.n = r.to;
      addFx('ghost', p0[0], p0[1], null, 500);
      const t = HC.transition(n, r.to);
      state.jump = { E0: HC.energy(n), E1: HC.energy(r.to), rgb: col.rgb, t0: tNow, emission: false, label: photonLabel(t.lambda, t.name) };
      state.last = { kind: 'ab', from: n, to: r.to, E: E, lambda: ph.lambda, t: t, t0: tNow };
      setView(tNow);
      setStatus(T('吸收！' + num(E, 4) + ' eV 剛好等於 n = ' + n + ' → ' + r.to + ' 的能階差，電子跳到 n = ' + r.to + '。' + (r.to > N_TOP ? '（能階圖只標到 n = 7，更高的能階越來越密。）' : ''),
        'Absorbed! ' + num(E, 4) + ' eV matches the n = ' + n + ' → ' + r.to + ' energy difference, so the electron jumps to n = ' + r.to + '.' + (r.to > N_TOP ? ' (The diagram labels only up to n = 7; higher levels crowd closer and closer.)' : '')));
      afterChange();
      emit('absorb', { from: n, to: r.to, E: E, lambda: ph.lambda, source: source, miss: r.miss });
      return 'absorb';
    }
    // 游離
    state.lastN = n;
    state.n = Infinity;
    state.K = r.K;
    state.cont.push({ lambda: ph.lambda, kind: 'ab', n: n, K: r.K });
    const ang = Math.atan2(p0[1] - og.cy, p0[0] - og.cx) || -0.6;
    state.free = { x: p0[0], y: p0[1], ux: Math.cos(ang), uy: Math.sin(ang), sp: (L.narrow ? 40 : 55) + (L.narrow ? 90 : 130) * Math.sqrt(r.K), t0: tNow };
    state.jump = { E0: HC.energy(n), E1: Math.min(E_MAX - 0.2, r.K), rgb: col.rgb, t0: tNow, emission: false, label: photonLabel(ph.lambda, '') };
    state.last = { kind: 'ion', from: n, E: E, lambda: ph.lambda, K: r.K, t0: tNow };
    setView(tNow);
    setStatus(T('游離！光子能量 ' + num(E, 4) + ' eV ≥ 游離能 ' + num(HC.ionizationEnergy(n), 4) + ' eV，電子掙脫原子，帶走動能 ' + num(r.K, 4) + ' eV。',
      'Ionised! The photon energy ' + num(E, 4) + ' eV ≥ the ionisation energy ' + num(HC.ionizationEnergy(n), 4) + ' eV, so the electron escapes with kinetic energy ' + num(r.K, 4) + ' eV.'));
    afterChange();
    emit('ionize', { from: n, E: E, lambda: ph.lambda, K: r.K, source: source });
    return 'ionize';
  }

  function fireGun() {
    if (state.mode !== 'atom') return;
    if (state.busy) { setStatus(T('光子還在路上，稍等一下。', 'A photon is still on its way — wait a moment.')); return; }
    shoot(gunEnergy(), 'gun');
  }

  function afterChange() {
    updateChips();
    updateReadouts();
    startLoop();
    requestDraw();
  }

  // ---------- 讀數 ----------
  const lastText = {};
  function setHTML(id, html) { if (lastText[id] === html) return; lastText[id] = html; $(id).innerHTML = html; }
  function swatch(lam) {
    const col = pcol(lam);
    const bgc = col.vis ? rgba(col.rgb, 1) : 'repeating-linear-gradient(135deg,' + rgba(col.rgb, 1) + ' 0 3px,' + rgba(col.rgb, 0.35) + ' 3px 6px)';
    return '<span class="sw" style="background:' + bgc + '"></span>';
  }
  function updateReadouts() {
    // 電子
    if (state.n === Infinity) {
      const K = state.K, v = Math.sqrt(2 * K * HC.E_CHARGE / HC.ME);
      setHTML('sN', T('∞（已游離）', '∞ (ionised)'));
      setHTML('sE', '+' + num(K, 4) + ' eV<small>' + T('自由電子的動能', 'kinetic energy of the free electron') + '</small>');
      setHTML('sR', T('—（電子已離開）', '— (electron gone)'));
      setHTML('sV', K > 0 ? sci(v, 3, 'm/s') + '<small>' + T('自由電子 v = √(2K/m)', 'free electron v = √(2K/m)') + '</small>' : '0');
      setHTML('sL', '—');
      setHTML('sT', '—');
      setHTML('sDB', K > 0 ? num(HC.H / (HC.ME * v) * 1e9, 3) + ' nm' : '—');
    } else {
      const lv = HC.level(state.n);
      setHTML('sN', state.n + (state.n === 1 ? T('（基態）', ' (ground state)') : T('（激發態）', ' (excited)')));
      setHTML('sE', num(lv.E, 3) + ' eV<small>= ' + sci(lv.EJ, 3, 'J') + '</small>');
      setHTML('sR', num(lv.r * 1e10, 3) + ' Å<small>= ' + sci(lv.r, 3, 'm') + '</small>');
      setHTML('sV', sci(lv.v, 3, 'm/s'));
      setHTML('sL', sci(lv.L, 4, 'J·s') + '<small>= ' + state.n + ' × h/2π</small>');
      setHTML('sT', sci(lv.T, 3, 's'));
      setHTML('sDB', num(lv.lambdaDB * 1e9, 4) + ' nm<small>' + state.n + ' λ = 2πr = ' + num(2 * Math.PI * lv.r * 1e9, 4) + ' nm</small>');
    }
    // 光子
    const p = state.last;
    if (!p) {
      ['pTr', 'pE', 'pF', 'pL', 'pS', 'pR'].forEach(function (id) { setHTML(id, '—'); });
    } else {
      const ph = HC.photonFromEnergy(p.E);
      let tr;
      if (p.kind === 'em') tr = p.from + ' → ' + p.to + T('（發射）', ' (emitted)');
      else if (p.kind === 'ab') tr = p.from + ' → ' + p.to + T('（吸收）', ' (absorbed)');
      else if (p.kind === 'ion') tr = p.from + ' → ∞' + T('（游離）', ' (ionised)');
      else if (p.kind === 'recomb') tr = '∞ → ' + p.to + T('（復合）', ' (capture)');
      else tr = T('沒有躍遷（光子穿過）', 'none (photon passed through)');
      setHTML('pTr', tr);
      setHTML('pE', num(p.E, 4) + ' eV<small>= ' + sci(ph.EJ, 4, 'J') + '</small>');
      setHTML('pF', sci(ph.f, 4, 'Hz'));
      const air = HC.airWavelength(ph.lambda);
      setHTML('pL', fmtL(ph.lambda) + ' nm<small>' + (isFinite(air) ? T('空氣中 ', 'in air ') + fmtL(air) + ' nm' : ph.lambda < 200 ? T('真空紫外線（會被空氣吸收）', 'vacuum UV (absorbed by air)') : '') + '</small>');
      let sr = '—';
      if (p.t) sr = (p.t.name ? p.t.name + ' · ' : '') + seriesName(p.t.lower);
      else if (p.kind === 'ion' || p.kind === 'recomb') {
        const n = p.kind === 'ion' ? p.from : p.to;
        sr = T('連續光譜（' + (HC.series(n) ? seriesName(n) : 'n = ' + n) + '系限之外）', 'continuum (beyond the ' + (HC.series(n) ? seriesName(n).replace(' series', '') : 'n = ' + n) + ' limit)');
      }
      setHTML('pS', sr);
      const col = pcol(ph.lambda);
      setHTML('pR', swatch(ph.lambda) + bandName(col.band) + (col.vis ? T('（' + colourName(ph.lambda) + '）', ' (' + colourName(ph.lambda) + ')') : T('（看不見，假色）', ' (invisible, false colour)')));
    }
  }
  function updateChips() {
    document.querySelectorAll('#lvbar button').forEach(function (b) {
      const n = b.dataset.n === 'inf' ? Infinity : +b.dataset.n;
      b.setAttribute('aria-current', String(n === state.n));
    });
  }

  // ---------- 放電管：讀數與表格 ----------
  let tableAt = 0;
  function updateTube(force) {
    const tb = state.tube, tNow = performance.now();
    if (!force && tNow - tableAt < 250) return;
    tableAt = tNow;
    const loc = function (x) { return Math.round(x).toLocaleString(T('zh-TW', 'en-US')); };
    setHTML('tImp', loc(tb.imp));
    setHTML('tExc', loc(tb.exc));
    setHTML('tPh', loc(tb.ph));
    const top = tubeTop();
    setHTML('tTop', top ? 'n = ' + top + '<small>' + T('門檻 ', 'threshold ') + num(HC.energy(top) - HC.energy(1), 3) + ' eV</small>' : T('（無：K < 10.2 eV）', '(none: K < 10.2 eV)'));
    const keys = Object.keys(tb.exp).sort(function (a, b) { return tb.exp[b] - tb.exp[a]; }).slice(0, 12);
    const sumExp = tb.meanPh || 1;
    let html = '';
    keys.forEach(function (k) {
      const p = k.split('-').map(Number), t = HC.transition(p[0], p[1]);
      const cnt = tb.counts[k] || 0;
      html += '<tr><td>' + swatch(t.lambda) + (t.name || k) + '</td><td>' + fmtL(t.lambda) + '</td><td>' + loc(cnt) + '</td><td>' +
        (tb.ph ? num(100 * cnt / tb.ph, 1) + '%' : '—') + '</td><td>' + num(100 * tb.exp[k] / sumExp, 1) + '%</td></tr>';
    });
    if (!keys.length) html = '<tr><td colspan="5">' + T('沒有光子：電子能量不足以激發原子。', 'No photons: the electrons cannot excite the atoms.') + '</td></tr>';
    setHTML('linesBody', html);
  }

  function tubeStep(dt, tNow) {
    const tb = state.tube;
    if (!tb.running) return;
    tb.acc += TUBE_RATE * dt;
    const ns = Object.keys(tb.probs).length;
    const pFlash = tb.meanPh > 0 ? Math.min(1, FLASH_RATE / (TUBE_RATE * tb.meanPh)) : 0;
    let guard = 0;
    while (tb.acc >= 1 && guard++ < 2000) {
      tb.acc -= 1;
      tb.imp++;
      if (!ns) continue;
      tb.exc++;
      const n0 = HC.pick(tb.probs, Math.random);
      HC.cascade(n0, Math.random).forEach(function (st) {
        const key = st[0] + '-' + st[1];
        tb.counts[key] = (tb.counts[key] || 0) + 1;
        tb.ph++;
        if (!reducedMotion && Math.random() < pFlash) {
          const col = pcol(HC.wavelength(st[0], st[1]));
          tb.flashes.push({ key: key, i: Math.floor(Math.random() * tb.atoms.length), rgb: col.rgb, vis: col.vis, t0: tNow });
        }
      });
    }
    // 電子往陽極移動
    const sp = 0.25 + 0.06 * Math.sqrt(tb.K);
    tb.elec.forEach(function (e) { e.u += sp * dt; if (e.u > 0.47) { e.u = -0.47; e.v = -0.3 + 0.6 * Math.random(); } });
    tb.emitAcc += dt;
    if (tb.emitAcc >= EMIT_EVERY) {
      tb.emitAcc = 0;
      emit('discharge', { K: tb.K, imp: tb.imp, exc: tb.exc, ph: tb.ph, counts: Object.assign({}, tb.counts), top: tubeTop() });
    }
    updateTube(false);
  }
  function tubeReset() {
    const tb = state.tube;
    tb.imp = 0; tb.exc = 0; tb.ph = 0; tb.counts = {}; tb.acc = 0; tb.emitAcc = 0; tb.flashes = [];
    updateTube(true);
  }

  // ---------- 動畫 ----------
  let lastT = 0, loopOn = false;
  function animating() {
    if (state.mode === 'atom') return !reducedMotion || state.photons.length > 0 || state.busy || state.fx.length > 0;
    if (state.mode === 'tube') return state.tube.running || state.tube.flashes.length > 0;
    return !reducedMotion;
  }
  function tick(tNow) {
    const dt = Math.min((tNow - lastT) / 1000, 1 / 30);
    lastT = tNow;
    if (state.mode === 'atom') {
      if (!reducedMotion && state.n !== Infinity) state.theta += dt * 2 * Math.PI / (ORBIT_T1 * Math.pow(state.n, 3));
    } else if (state.mode === 'tube') tubeStep(dt, tNow);
    else absStep(dt, tNow);
    draw();
    if (animating()) requestAnimationFrame(tick);
    else loopOn = false;
  }
  function startLoop() {
    if (loopOn || !animating()) return;
    loopOn = true;
    lastT = performance.now();
    requestAnimationFrame(tick);
  }

  // ---------- 光子槍 ----------
  const elE = $('gE'), elL = $('gL'), elK = $('tK');
  const logReg = function (min, max) {
    return {
      toValue: function (p) { return min * Math.pow(max / min, p / 1000); },
      toPos: function (v) { return 1000 * Math.log(v / min) / Math.log(max / min); },
      min: min, max: max
    };
  };
  if (window.LabNum) {
    window.LabNum.register(elE, Object.assign(logReg(GUN_EMIN, GUN_EMAX), { decimals: 4 }));
    window.LabNum.register(elL, Object.assign(logReg(GUN_LMIN, GUN_LMAX), { decimals: 2 }));
  }
  function gunEnergy() { return state.gunBy === 'E' ? val(elE) : HC.HC_EV_NM / val(elL); }
  function refreshGun() {
    const E = gunEnergy();
    $('gEo').textContent = trimDec(val(elE), 4, 2) + ' eV';
    $('gLo').textContent = trimDec(val(elL), 2, 1) + ' nm';
    const ph = HC.photonFromEnergy(E), col = pcol(ph.lambda);
    let html = '';
    if (state.gunBy === 'E') html += '<dt>' + T('波長 λ', 'Wavelength λ') + '</dt><dd>' + fmtL(ph.lambda) + ' nm</dd>';
    else html += '<dt>' + T('能量 E', 'Energy E') + '</dt><dd>' + num(E, 4) + ' eV</dd>';
    html += '<dt>' + T('頻率 f', 'Frequency f') + '</dt><dd>' + sci(ph.f, 3, 'Hz') + '</dd>';
    html += '<dt>' + T('波段', 'Region') + '</dt><dd>' + swatch(ph.lambda) + bandName(col.band) + (col.vis ? T('（' + colourName(ph.lambda) + '）', ' (' + colourName(ph.lambda) + ')') : '') + '</dd>';
    setHTML('gunInfo', html);
    const label = T('射入光子（' + num(E, 3) + ' eV）', 'Fire a ' + num(E, 3) + ' eV photon');
    $('fire').textContent = label;
  }
  elE.addEventListener('input', refreshGun);
  elL.addEventListener('input', refreshGun);
  function setGunBy(by) {
    if (by === state.gunBy) return;
    const E = gunEnergy();
    state.gunBy = by;
    $('byE').setAttribute('aria-pressed', String(by === 'E'));
    $('byL').setAttribute('aria-pressed', String(by === 'L'));
    $('boxE').hidden = by !== 'E';
    $('boxL').hidden = by !== 'L';
    // 把目前的光子帶到另一個滑桿
    if (window.LabNum) {
      if (by === 'E') window.LabNum.set(elE, E);
      else window.LabNum.set(elL, HC.HC_EV_NM / E);
    }
    refreshGun();
  }
  $('byE').addEventListener('click', function () { setGunBy('E'); });
  $('byL').addEventListener('click', function () { setGunBy('L'); });
  $('fire').addEventListener('click', fireGun);
  $('fire2').addEventListener('click', fireGun);

  // ---------- 放電管 K ----------
  function refreshK() { $('tKo').textContent = trimDec(val(elK), 3, 2) + ' eV'; }
  elK.addEventListener('input', function () {
    refreshK();
    tubeRecompute();
    tubeReset();
    startLoop();
    requestDraw();
  });

  // ---------- 模式 ----------
  const MODE_HINT = {
    atom: ['點能階圖、軌道或能階按鈕讓電子躍遷；往上跳時會自動射入能量剛好的光子。也可以自己設定光子。', 'Tap the diagram, an orbit or the buttons to make the electron jump; jumping up automatically fires a photon of exactly the right energy. You can also set a photon yourself.'],
    tube: ['很多原子同時被電子撞擊激發，再自發地一層層掉回基態；光譜的亮度正比於光子數。', 'Many atoms are excited by electron collisions and then fall back to the ground state on their own, often in several steps; the brightness of each line is proportional to its number of photons.'],
    abs: ['白光（連續光譜）穿過氫氣，被吸收的波長在光譜上變成暗線。', 'White light (a continuous spectrum) passes through hydrogen; the absorbed wavelengths become dark lines in the spectrum.']
  };
  function setMode(m) {
    if (m === state.mode) return;
    state.mode = m;
    $('modeAtom').setAttribute('aria-pressed', String(m === 'atom'));
    $('modeTube').setAttribute('aria-pressed', String(m === 'tube'));
    $('modeAbs').setAttribute('aria-pressed', String(m === 'abs'));
    $('modeHint').textContent = T(MODE_HINT[m][0], MODE_HINT[m][1]);
    const atom = m === 'atom';
    $('lvbar').hidden = !atom;
    $('fire').hidden = !atom;
    $('play').hidden = m !== 'tube';
    $('cardGun').hidden = !atom;
    $('cardState').hidden = !atom;
    $('cardPhoton').hidden = !atom;
    $('cardShow').hidden = !atom;
    $('cardTube').hidden = m !== 'tube';
    $('cardLines').hidden = m !== 'tube';
    $('cardAbs').hidden = m !== 'abs';
    state.photons = [];
    state.busy = false;
    state.fx = [];
    state.hover = null;
    G = diagGeom();
    buildBackground();
    if (m === 'tube') {
      tubeRecompute();
      updatePlay();
      updateTube(true);
      setStatus(state.tube.running ? '' : T('按「開始放電」。', 'Press “Start the discharge”.'));
    } else if (m === 'abs') {
      updateAbsHint();
      setStatus('');
      emit('absorption', { hot: state.abs.hot });
    } else setStatus('');
    startLoop();
    requestDraw();
  }
  $('modeAtom').addEventListener('click', function () { setMode('atom'); });
  $('modeTube').addEventListener('click', function () { setMode('tube'); });
  $('modeAbs').addEventListener('click', function () { setMode('abs'); });

  function updatePlay() {
    $('play').textContent = state.tube.running ? T('暫停放電', 'Pause the discharge') : T('開始放電', 'Start the discharge');
  }
  $('play').addEventListener('click', function () {
    state.tube.running = !state.tube.running;
    updatePlay();
    setStatus('');
    startLoop();
    requestDraw();
  });

  function updateAbsHint() {
    $('absHint').textContent = state.abs.hot
      ? T('熱氫氣：少部分原子在 n = 2，可以吸收巴耳末系，可見光區出現暗線，位置與放電管的明線相同。（暗線只標位置，深淺未依比例。）',
        'Hot hydrogen: a few atoms are in n = 2 and absorb the Balmer lines, so dark lines appear in the visible part, exactly where the bright lines of the discharge tube are. (Only the positions of the dark lines are meaningful, not their darkness.)')
      : T('冷氫氣：原子幾乎都在 n = 1，只能吸收來曼系（紫外線）和比 91.2 nm 更短的光（游離），可見光全部穿過。',
        'Cool hydrogen: almost all atoms are in n = 1, so it absorbs only the Lyman lines (ultraviolet) and light shorter than 91.2 nm (ionisation); all visible light passes through.');
  }
  function setGas(hot) {
    if (hot === state.abs.hot) return;
    state.abs.hot = hot;
    $('gasCold').setAttribute('aria-pressed', String(!hot));
    $('gasHot').setAttribute('aria-pressed', String(hot));
    updateAbsHint();
    buildBackground();
    requestDraw();
    emit('absorption', { hot: hot });
  }
  $('gasCold').addEventListener('click', function () { setGas(false); });
  $('gasHot').addEventListener('click', function () { setGas(true); });

  // ---------- 全部清除 ----------
  $('clear').addEventListener('click', function () {
    state.em = {}; state.ab = {}; state.cont = [];
    state.last = null; state.jump = null; state.busy = false; state.photons = []; state.fx = []; state.free = null;
    state.n = 1; state.K = 0; state.lastN = 1;
    state.view = { from: viewTarget(), to: viewTarget(), t0: 0 };
    tubeReset();
    state.abs.ph = [];
    setStatus(T('已全部清除：光譜紀錄與統計歸零，電子回到基態；滑桿設定不變。', 'Everything is cleared: the spectrum records and counts are reset and the electron is back in the ground state; slider settings are kept.'));
    updateChips();
    updateReadouts();
    requestDraw();
    emit('reset', {});
  });

  // ---------- 點選 ----------
  document.querySelectorAll('#lvbar button').forEach(function (b) {
    b.addEventListener('click', function () { request(b.dataset.n === 'inf' ? Infinity : +b.dataset.n, 0); });
  });
  function pos(ev) { const r = cv.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }
  function inR(p, R) { return p[0] >= R.x && p[0] <= R.x + R.w && p[1] >= R.y && p[1] <= R.y + R.h; }
  /** 畫面上的點對應到哪個能階（能階圖或軌道） */
  function pickLevel(p) {
    if (state.mode !== 'atom' || !L) return null;
    if (inR(p, L.diag)) {
      if (p[0] < G.left - 10) return null;
      const y = p[1];
      if (y < Ey(0) - 7 && y > Ey(E_MAX)) return { n: Infinity, K: Math.max(0, yE(y)) };
      let best = null, bd = 1e9;
      for (let n = 1; n <= N_TOP; n++) { const d = Math.abs(y - Ey(HC.energy(n))); if (d < bd) { bd = d; best = n; } }
      const d0 = Math.abs(y - Ey(0));
      if (d0 < bd) { bd = d0; best = Infinity; }
      return bd <= 20 ? { n: best, K: 0 } : null;
    }
    if (inR(p, L.orb)) {
      const og = orbitGeom(performance.now());
      const d = Math.hypot(p[0] - og.cx, p[1] - og.cy);
      let best = null, bd = 1e9;
      for (let m = 1; m <= N_TOP; m++) { const dd = Math.abs(d - m * m * og.k); if (dd < bd) { bd = dd; best = m; } }
      return bd <= (L.narrow ? 12 : 10) ? { n: best, K: 0 } : null;
    }
    return null;
  }
  cv.addEventListener('click', function (ev) {
    const hit = pickLevel(pos(ev));
    if (hit) request(hit.n, hit.K);
  });
  cv.addEventListener('pointermove', function (ev) {
    if (ev.pointerType === 'touch') return;
    const hit = pickLevel(pos(ev));
    const h = hit ? hit.n : null;
    cv.style.cursor = hit ? 'pointer' : 'default';
    if (h !== state.hover) { state.hover = h; requestDraw(); }
  });
  cv.addEventListener('pointerleave', function () { if (state.hover != null) { state.hover = null; requestDraw(); } });

  // ---------- 顯示選項 ----------
  $('showWave').addEventListener('change', function (ev) { state.show.wave = ev.target.checked; requestDraw(); });
  $('showZoom').addEventListener('change', function (ev) { state.show.zoom = ev.target.checked; setView(performance.now()); startLoop(); requestDraw(); });

  // ---------- 啟動 ----------
  readColors();
  if (window.LabNum) {
    window.LabNum.set(elE, 10);
    window.LabNum.set(elL, HC.HC_EV_NM / 10);
  }
  refreshGun();
  refreshK();
  tubeRecompute();
  $('modeHint').textContent = T(MODE_HINT.atom[0], MODE_HINT.atom[1]);
  updateChips();
  updateReadouts();
  updatePlay();
  state.view = { from: viewTarget(), to: viewTarget(), t0: 0 };
  function themeChanged() { readColors(); if (L) buildBackground(); requestDraw(); }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { if (cv.clientWidth !== lastW) { lastW = cv.clientWidth; resize(); } }).observe(cv);
  }
  window.addEventListener('resize', function () { resize(); });
  resize();
  if (reducedMotion) setStatus(T('已偵測到「減少動態效果」設定：電子不繞行，放電管預設暫停。', 'Reduced motion is on: the electron does not circle and the discharge tube starts paused.'));
  startLoop();
})();
