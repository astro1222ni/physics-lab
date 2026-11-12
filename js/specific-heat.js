/* specific-heat.js — 「比熱與熱平衡」模組的畫面與互動（物理計算在 specific-heat-core.js） */
(function () {
  'use strict';
  const HC = window.HeatCore;
  const LD = window.LabDraw;   // 共用繪圖工具（drawkit.js）
  const $ = function (id) { return document.getElementById(id); };
  // 介面文字：英文模式用第二個字串（settings.js）
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  // 滑桿讀值：打字輸入的精確值（numinput.js）優先
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const SPEEDS = [1, 10, 50, 200];
  const T_SOLID_MAX = 250;   // °C 加熱固體時的停止溫度
  const EQ_TOL = 0.05;       // °C 判定「達到熱平衡」的溫差
  const TENV = HC.T_ENV;
  const DROP_MS = 480;       // 樣品掉落動畫（純視覺，不計入物理時間）

  // ---------- 材料 ----------
  const MATS = {
    al: { sub: 'al', zh: '鋁', en: 'Aluminium' },
    fe: { sub: 'fe', zh: '鐵', en: 'Iron' },
    cu: { sub: 'cu', zh: '銅', en: 'Copper' },
    pb: { sub: 'pb', zh: '鉛', en: 'Lead' },
    glass: { sub: 'glass', zh: '玻璃', en: 'Glass' },
    ice: { sub: 'h2o', zh: '冰', en: 'Ice' },
    h2o: { sub: 'h2o', zh: '水', en: 'Water' },
    mys: { sub: null, zh: '神秘金屬', en: 'Mystery metal' }
  };
  const CAL_LIST = ['al', 'fe', 'cu', 'pb', 'glass', 'ice', 'mys'];
  const HEAT_LIST = ['h2o', 'al', 'fe', 'cu', 'pb', 'mys'];
  const CMP_LIST = ['h2o', 'al', 'glass', 'fe', 'cu', 'pb'];
  const MYS_NAME = { ti: ['鈦', 'titanium'], ag: ['銀', 'silver'], mg: ['鎂', 'magnesium'], zn: ['鋅', 'zinc'], ni: ['鎳', 'nickel'], w: ['鎢', 'tungsten'] };

  function pickMystery(not) {
    const ids = HC.MYSTERY_IDS.filter(function (i) { return i !== not; });
    return ids[Math.floor(Math.random() * ids.length)];
  }

  const state = {
    mode: 'cal', acted: false,
    speed: { cal: 10, heat: 50, cmp: 10 },
    mysId: pickMystery(), mysMeasured: false,
    fx: [],
    cal: { mat: 'al', T1mem: { solid: 100, ice: -10 }, phase: 'ready', sim: null, samples: [], ghosts: [], pred: null, eqDone: false, drop: null, P0: 0, idxA: -1, idxB: -1, p: null },
    heat: { mat: 'h2o', phase: 'ready', body: null, H: 0, H0: 0, Hstop: 0, t: 0, Qin: 0, Qloss: 0, samples: [], ghosts: [], points: [], trans: [], pred: null, idx: -1, p: null },
    cmp: { on: { h2o: true, al: true, glass: true, fe: true, cu: true, pb: true }, phase: 'ready', items: [], t: 0, samples: [], pred: null, p: null }
  };

  function subOf(key) { return key === 'mys' ? state.mysId : MATS[key].sub; }
  function matName(key) { return T(MATS[key].zh, MATS[key].en); }
  function cOf(key) {
    const s = HC.SUBSTANCES[subOf(key)];
    return key === 'ice' ? s.phases[0].c : key === 'h2o' ? s.phases[1].c : s.phases[0].c;
  }

  // ---------- 色彩（lab.css 代號） ----------
  let colors = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--text', '--muted', '--border', '--grid', '--accent', '--accent-soft', '--surface',
      '--pos', '--neg', '--equi', '--field', '--probe', '--b-mech', '--b-thermo', '--b-wave', '--b-optics']
      .forEach(function (k) { colors[k.slice(2)] = cs.getPropertyValue(k).trim(); });
    colors.dark = isDark();
  }
  function rgbOf(c) {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(c).trim());
    if (m) return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
    const n = String(c).match(/[\d.]+/g);
    return n && n.length >= 3 ? [+n[0], +n[1], +n[2]] : [128, 128, 128];
  }
  function alpha(c, a) { const r = rgbOf(c); return 'rgba(' + r[0] + ',' + r[1] + ',' + r[2] + ',' + a + ')'; }
  /** f > 0 往白色混合、f < 0 往黑色混合 */
  function shade(c, f) {
    const r = rgbOf(c), t = f > 0 ? 255 : 0, k = Math.abs(f);
    return 'rgb(' + r.map(function (x) { return Math.round(x + (t - x) * k); }).join(',') + ')';
  }
  function mix(a, b, f) {
    const x = rgbOf(a), y = rgbOf(b);
    return 'rgb(' + x.map(function (v, i) { return Math.round(v + (y[i] - v) * f); }).join(',') + ')';
  }
  function isDark() {
    const r = rgbOf(getComputedStyle(document.documentElement).getPropertyValue('--canvas-bg'));
    return (r[0] + r[1] + r[2]) / 3 < 100;
  }
  /** 溫度色階（亮度單調的發散色階）：冷＝藍、室溫＝中性、熱＝紅 */
  function tcol(Tc) {
    const n = colors.muted;
    if (Tc >= 22) return mix(n, colors.pos, Math.pow(Math.min(1, (Tc - 22) / 110), 0.6));
    return mix(n, colors.neg, Math.pow(Math.min(1, (22 - Tc) / 45), 0.6));
  }
  /** 材料在畫面上的顏色（由代號調整明暗） */
  function matColor(key) {
    const d = colors.dark;
    switch (key) {
      case 'al': return shade(colors.muted, d ? 0.3 : 0.58);
      case 'fe': return shade(colors.muted, d ? -0.3 : -0.28);
      case 'cu': return mix(colors['b-mech'], colors.equi, 0.3);
      case 'pb': return mix(shade(colors.muted, d ? -0.12 : -0.15), colors.neg, 0.22);
      case 'glass': return colors['b-wave'];
      case 'ice': return shade(colors.neg, d ? 0.55 : 0.72);
      case 'h2o': return colors.neg;
      case 'mys': return colors.equi;
    }
    return colors.muted;
  }
  /** 比較圖上的線色（彼此容易分辨） */
  function lineColor(key) {
    return { h2o: colors.neg, al: colors.probe, glass: colors['b-wave'], fe: colors.field, cu: colors['b-mech'], pb: colors['b-optics'] }[key] || colors.text;
  }
  function waterColor(Tc) { return mix(shade(colors.neg, colors.dark ? -0.1 : 0.45), tcol(Tc), 0.22); }

  // ---------- 數字格式 ----------
  function num(v, d) {
    if (!isFinite(v)) return '—';
    let s = v.toFixed(d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  function fmtQ(q, d) { // 熱量：自動選 J 或 kJ
    if (Math.abs(q) >= 9999.5) return num(q / 1000, d == null ? 2 : d) + ' kJ';
    return num(q, 0) + ' J';
  }
  function fmtSlider(v, el) {
    const dec = window.LabNum ? window.LabNum.decimals(el) : 2;
    const stepDec = (String(el.step).split('.')[1] || '').length;
    let s = v.toFixed(dec);
    while (s.indexOf('.') >= 0 && s.length - s.indexOf('.') - 1 > stepDec && s.slice(-1) === '0') s = s.slice(0, -1);
    if (s.slice(-1) === '.') s = s.slice(0, -1);
    return s.replace('-', '−');
  }
  function niceStep(raw) {
    const e = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / e;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e;
  }
  function roundStep(raw) {
    const e = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / e;
    return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * e;
  }
  function niceCeil(x) { const s = niceStep(x / 6); return Math.ceil(x / s - 1e-9) * s; }
  function grams(kg) { return kg < 0.0995 ? num(kg * 1000, 1) + ' g' : num(kg * 1000, 0) + ' g'; }

  // ---------- 元素 ----------
  const el = {};
  ['m1', 'T1', 'm2', 'T2', 'cc', 'stir', 'lossC', 'hm', 'hT', 'hP', 'lossH', 'cm', 'cP', 'cT'].forEach(function (id) { el[id] = $(id); });

  // ---------- 畫布與版面 ----------
  const cv = $('cv');
  const ctx = cv.getContext('2d');
  let dpr = 1, cw = 300, ch = 300;
  let L = null;
  const bg = document.createElement('canvas');
  const bgctx = bg.getContext('2d');

  function layout() {
    const wide = cw >= 640;
    const gap = wide ? 8 : 6;
    if (wide) {
      const H = Math.max(440, Math.min(580, Math.round(cw * 0.62)));
      const Sw = Math.round(cw * 0.42), gx = Sw + gap;
      const gh = Math.round(H * (state.mode === 'cmp' ? 0.6 : 0.62));
      return { wide: true, H: H, gap: gap, scene: { x: 0, y: 0, w: Sw, h: H }, graph: { x: gx, y: 0, w: cw - gx, h: gh }, info: { x: gx, y: gh + gap, w: cw - gx, h: H - gh - gap } };
    }
    const sh = Math.round(cw * (state.mode === 'cmp' ? 0.7 : 0.86)), gh = Math.round(cw * 0.68);
    const nRows = state.mode === 'cmp' ? Math.max(1, cmpKeys().length) : 0;
    const ih = state.mode === 'cmp' ? 40 + nRows * 22 : state.mode === 'cal' ? (el.lossC && el.lossC.checked ? 158 : 128) : 128;
    return { wide: false, H: sh + gh + ih + 2 * gap, gap: gap, scene: { x: 0, y: 0, w: cw, h: sh }, graph: { x: 0, y: sh + gap, w: cw, h: gh }, info: { x: 0, y: sh + gh + 2 * gap, w: cw, h: ih } };
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
    buildBackground();
    draw();
  }

  function roundRect(c, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  /** 不變的圖層：三個區域的底色（drawkit 的暈影背景＋上緣微光）與細邊框 */
  function buildBackground() {
    bg.width = cv.width;
    bg.height = cv.height;
    const c = bgctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, cw, ch);
    [L.scene, L.graph, L.info].forEach(function (R, i) { panelBg(c, R, i === 0); });
  }
  function panelBg(c, R, scene) {
    const base = colors['canvas-bg'];
    c.save();
    roundRect(c, R.x, R.y, R.w, R.h, 8);
    c.clip();
    c.translate(R.x, R.y);
    LD.backdrop(c, R.w, R.h);
    const g = c.createLinearGradient(0, 0, 0, R.h);
    if (scene) {
      // 實驗室的牆：上方略亮
      g.addColorStop(0, alpha(shade(base, 0.6), colors.dark ? 0.05 : 0.55));
      g.addColorStop(0.45, 'rgba(0,0,0,0)');
      g.addColorStop(1, alpha(shade(base, -0.5), colors.dark ? 0.1 : 0.03));
    } else {
      g.addColorStop(0, alpha(shade(base, 0.6), colors.dark ? 0.035 : 0.5));
      g.addColorStop(0.25, 'rgba(0,0,0,0)');
      g.addColorStop(1, alpha(shade(base, -0.5), colors.dark ? 0.12 : 0.04));
    }
    c.fillStyle = g;
    c.fillRect(0, 0, R.w, R.h);
    c.restore();
    c.strokeStyle = alpha(colors.text, colors.dark ? 0.12 : 0.1);
    c.lineWidth = 1;
    roundRect(c, R.x + 0.5, R.y + 0.5, R.w - 1, R.h - 1, 8);
    c.stroke();
    c.strokeStyle = alpha('#ffffff', colors.dark ? 0.05 : 0.7);
    c.beginPath(); c.moveTo(R.x + 9, R.y + 1.5); c.lineTo(R.x + R.w - 9, R.y + 1.5); c.stroke();
  }
  /** 實驗桌桌面：後緣在 y，往下延伸到區域底部（物體的底放在桌面上） */
  function bench(S, y) {
    const yb = S.y + S.h;
    if (y >= yb - 2) return;
    const top = mix(colors['canvas-bg'], colors.muted, colors.dark ? 0.2 : 0.17);
    const g = ctx.createLinearGradient(0, y, 0, yb);
    g.addColorStop(0, shade(top, colors.dark ? -0.15 : -0.04));
    g.addColorStop(0.5, top);
    g.addColorStop(1, shade(top, colors.dark ? 0.06 : 0.35));
    ctx.fillStyle = g;
    ctx.fillRect(S.x, y, S.w, yb - y);
    // 桌面的反光（窗戶的倒影，很淡）
    const sh = ctx.createLinearGradient(S.x, 0, S.x + S.w, 0);
    sh.addColorStop(0.15, 'rgba(255,255,255,0)');
    sh.addColorStop(0.35, 'rgba(255,255,255,' + (colors.dark ? 0.035 : 0.22) + ')');
    sh.addColorStop(0.55, 'rgba(255,255,255,0)');
    ctx.fillStyle = sh;
    ctx.fillRect(S.x, y + 1, S.w, yb - y - 1);
    // 後緣：牆與桌面交界的暗線＋桌緣高光
    ctx.fillStyle = alpha(colors.dark ? '#000000' : colors.text, colors.dark ? 0.35 : 0.1);
    ctx.fillRect(S.x, y - 1, S.w, 1);
    ctx.fillStyle = alpha('#ffffff', colors.dark ? 0.06 : 0.55);
    ctx.fillRect(S.x, y, S.w, 1);
  }
  /** 金屬零件（電源外殼、加熱板）：上亮下暗、帶一條反光的圓角方塊 */
  function metalBox(x, y, w, h, r, base) {
    base = base || mix(colors.muted, colors.surface, colors.dark ? 0.1 : 0.4);
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, shade(base, 0.55));
    g.addColorStop(0.25, shade(base, 0.2));
    g.addColorStop(0.6, shade(base, -0.08));
    g.addColorStop(0.9, shade(base, -0.28));
    g.addColorStop(1, shade(base, 0.05));
    ctx.fillStyle = g;
    roundRect(ctx, x, y, w, h, r);
    ctx.fill();
    ctx.strokeStyle = alpha(shade(base, -0.55), colors.dark ? 0.7 : 0.5);
    ctx.lineWidth = 1;
    roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, Math.max(0, r - 0.5));
    ctx.stroke();
  }
  /** 拉絲金屬的細直紋（在已畫好的矩形上疊加） */
  function brushed(x, y, w, h, a) {
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.lineWidth = 1;
    for (let i = 0; i < w; i += 2.5) {
      const u = (Math.sin(i * 12.9898) * 43758.5453) % 1;
      const v = Math.abs(u);
      ctx.strokeStyle = v > 0.5 ? 'rgba(255,255,255,' + (a * (v - 0.5) * 2).toFixed(3) + ')' : 'rgba(0,0,0,' + (a * 0.6 * (0.5 - v) * 2).toFixed(3) + ')';
      ctx.beginPath(); ctx.moveTo(x + i + 0.5, y); ctx.lineTo(x + i + 0.5, y + h); ctx.stroke();
    }
    ctx.restore();
  }
  /** 保麗龍（隔熱材料）的顆粒質感：矩形範圍內的小圓泡（一次畫完，省效能） */
  function foamTexture(x, y, w, h, base) {
    if (w < 2 || h < 2) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    const n = Math.min(160, Math.round(w * h / 30));
    const seed = Math.round(x * 7 + y * 13);
    const lo = new Path2D(), hi = new Path2D();
    const rnd = function (q) { const t = Math.sin(q * 12.9898 + seed * 78.233) * 43758.5453; return t - Math.floor(t); };
    for (let i = 0; i < n; i++) {
      const u = rnd(i * 3 + 1), v = rnd(i * 3 + 2);
      const r = 1.4 + rnd(i * 3 + 3) * 1.8;
      const cx = x + u * w, cy = y + v * h;
      lo.moveTo(cx + r * Math.cos(0.2), cy + r * Math.sin(0.2)); lo.arc(cx, cy, r, 0.2, Math.PI * 1.2);
      hi.moveTo(cx + r * Math.cos(Math.PI * 1.2), cy + r * Math.sin(Math.PI * 1.2)); hi.arc(cx, cy, r, Math.PI * 1.2, Math.PI * 2.2);
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = alpha(shade(base, -0.5), colors.dark ? 0.22 : 0.14);
    ctx.stroke(lo);
    ctx.strokeStyle = alpha('#ffffff', colors.dark ? 0.07 : 0.6);
    ctx.stroke(hi);
    ctx.restore();
  }
  // ---------- 繪圖工具 ----------
  function font(w, px) { return (w ? w + ' ' : '') + px + 'px system-ui, sans-serif'; }
  /** 有半透明圓角底框的標籤；ctx.textAlign 決定水平對齊，垂直置中於 y */
  /** 把 "T_{1} = 20 °C" 拆成一般文字與下標（下標用較小的字畫，不用 Unicode 下標字元） */
  function richParts(text) {
    const out = [], re = /_\{([^}]*)\}/g;
    let i = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > i) out.push({ t: text.slice(i, m.index) });
      out.push({ t: m[1], sub: true });
      i = re.lastIndex;
    }
    if (i < text.length) out.push({ t: text.slice(i) });
    return out;
  }
  function subFont(f) { return f.replace(/(\d+(?:\.\d+)?)px/, function (a, n) { return (n * 0.74).toFixed(1) + 'px'; }); }
  /** 畫可能含下標的文字；傳回寬度。ctx.textAlign 決定對齊，垂直置中於 y */
  function richText(text, x, y, f, measureOnly) {
    const parts = richParts(text), fs = subFont(f);
    let w = 0;
    parts.forEach(function (q) { ctx.font = q.sub ? fs : f; w += ctx.measureText(q.t).width; });
    if (measureOnly) return w;
    const al = ctx.textAlign;
    let xx = al === 'center' ? x - w / 2 : al === 'right' ? x - w : x;
    const px = parseFloat((/(\d+(?:\.\d+)?)px/.exec(f) || [0, 12])[1]);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    parts.forEach(function (q) {
      ctx.font = q.sub ? fs : f;
      ctx.fillText(q.t, xx, q.sub ? y + px * 0.28 : y);
      xx += ctx.measureText(q.t).width;
    });
    ctx.textAlign = al;
    return w;
  }
  /** 標籤底框的細邊（與 drawkit 的 pill 一致）；底框很淡的標籤不加 */
  function pillEdge(color, bgAlpha) {
    if (bgAlpha != null && bgAlpha < 0.7) return;
    ctx.strokeStyle = alpha(color, colors.dark ? 0.4 : 0.3);
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  function pill(text, x, y, color, f, bgAlpha) {
    f = f || font(600, 12);
    if (text.indexOf('_{') >= 0) {
      ctx.font = f;
      const m0 = ctx.measureText('Tg');
      const fh0 = m0.fontBoundingBoxAscent > 0 ? m0.fontBoundingBoxAscent + m0.fontBoundingBoxDescent : 15;
      const tw0 = richText(text, x, y, f, true);
      const ph0 = fh0 + 3, pw0 = tw0 + 10;
      const al0 = ctx.textAlign;
      const bx0 = al0 === 'center' ? x - pw0 / 2 : al0 === 'right' ? x - tw0 - 5 : x - 5;
      ctx.fillStyle = alpha(colors['canvas-bg'], bgAlpha == null ? 0.86 : bgAlpha);
      roundRect(ctx, bx0, y - ph0 / 2, pw0, ph0, ph0 / 2);
      ctx.fill();
      pillEdge(color, bgAlpha);
      ctx.fillStyle = color;
      richText(text, x, y + 0.5, f);
      return { x: bx0, y: y - ph0 / 2, w: pw0, h: ph0 };
    }
    ctx.font = f;
    ctx.textBaseline = 'middle';
    const m = ctx.measureText(text), tw = m.width;
    const fh = m.fontBoundingBoxAscent > 0 ? m.fontBoundingBoxAscent + m.fontBoundingBoxDescent : 15;
    const ph = fh + 3, pw = tw + 10;
    const al = ctx.textAlign;
    const bx = al === 'center' ? x - pw / 2 : al === 'right' ? x - tw - 5 : x - 5;
    ctx.fillStyle = alpha(colors['canvas-bg'], bgAlpha == null ? 0.86 : bgAlpha);
    roundRect(ctx, bx, y - ph / 2, pw, ph, ph / 2);
    ctx.fill();
    pillEdge(color, bgAlpha);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y + 0.5);
    return { x: bx, y: y - ph / 2, w: pw, h: ph };
  }
  /** 把幾段文字依序排成一列列的標籤（第一段之後用「＋」連接），超過寬度就換行；傳回用掉的行數 */
  function flowText(items, x, y, maxW, color, f, maxLines, plusFrom) {
    let cx = x, line = 1;
    if (plusFrom == null) plusFrom = 2;
    items.forEach(function (t, i) {
      const txt = (i >= plusFrom ? '+ ' : '') + t;
      const w = richText(txt, 0, 0, f, true) + 14;
      if (cx > x && cx + w > x + maxW) { line++; cx = x; }
      if (line > maxLines) return;
      ctx.textAlign = 'left';
      pill(txt, cx + 5, y + (line - 1) * 18, color, f, 0.6);
      cx += w;
    });
    return Math.min(line, maxLines);
  }
  /** 兩層線條的「管子」：底層粗而暗，上層細而亮、略偏上 */
  function tube(pts, w, base, light) {
    if (pts.length < 2) return;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = base;
    ctx.lineWidth = w;
    ctx.beginPath();
    pts.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
    ctx.stroke();
    if (!light) return;
    ctx.strokeStyle = light;
    ctx.lineWidth = Math.max(0.8, w * 0.36);
    ctx.beginPath();
    pts.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1] - w * 0.22); else ctx.moveTo(p[0], p[1] - w * 0.22); });
    ctx.stroke();
  }
  function polyline(pts, color, w, dash) {
    if (pts.length < 2) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash(dash || []);
    ctx.beginPath();
    pts.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
    ctx.stroke();
    ctx.setLineDash([]);
  }
  function sphereSmall(x, y, col, r) {
    r = r || (L.wide ? 5.5 : 4.5);
    LD.ball(ctx, x, y, r, col, { glow: colors.dark ? 0.35 : 0.15, ring: colors['canvas-bg'] });
  }
  function diamond(x, y, r, color) {
    ctx.fillStyle = color;
    ctx.strokeStyle = colors['canvas-bg'];
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
  }
  /** 斜線填滿（潛熱用） */
  function hatch(x, y, w, h, color) {
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let s = -h; s < w; s += 5) { ctx.moveTo(x + s, y + h); ctx.lineTo(x + s + h, y); }
    ctx.stroke();
    ctx.restore();
  }

  /**
   * 立方體（斜投影：正面＋頂面＋右側面）：中心 x、底邊 yb、邊長 s（px）。
   * kind：'metal'、'ice'、'glass'、'mys'。
   */
  function cube(x, yb, s, base, kind) {
    const dx = s * 0.2, dy = s * 0.18;
    const x0 = x - s / 2, y0 = yb - s;
    const translucent = kind === 'ice' || kind === 'glass';
    const a = translucent ? (kind === 'ice' ? 0.78 : 0.55) : 1;
    const dk = colors.dark;
    // 頂面：光從左上方來，後方較亮
    ctx.beginPath();
    ctx.moveTo(x0, y0); ctx.lineTo(x0 + dx, y0 - dy); ctx.lineTo(x0 + s + dx, y0 - dy); ctx.lineTo(x0 + s, y0); ctx.closePath();
    const tg = ctx.createLinearGradient(x0 + dx, y0 - dy, x0 + s, y0);
    tg.addColorStop(0, alpha(shade(base, 0.52), a));
    tg.addColorStop(1, alpha(shade(base, 0.26), a));
    ctx.fillStyle = tg;
    ctx.fill();
    // 右側面：上亮下暗
    ctx.beginPath();
    ctx.moveTo(x0 + s, y0); ctx.lineTo(x0 + s + dx, y0 - dy); ctx.lineTo(x0 + s + dx, yb - dy); ctx.lineTo(x0 + s, yb); ctx.closePath();
    const rg = ctx.createLinearGradient(0, y0 - dy, 0, yb);
    rg.addColorStop(0, alpha(shade(base, -0.18), a));
    rg.addColorStop(1, alpha(shade(base, -0.42), a));
    ctx.fillStyle = rg;
    ctx.fill();
    // 正面：上亮下暗
    const g = ctx.createLinearGradient(0, y0, 0, yb);
    g.addColorStop(0, alpha(shade(base, 0.2), a));
    g.addColorStop(0.55, alpha(base, a));
    g.addColorStop(1, alpha(shade(base, -0.2), a));
    ctx.fillStyle = g;
    ctx.fillRect(x0, y0, s, s);
    if (!translucent && s > 10) {
      // 金屬：拉絲紋＋斜向的柔和反光
      brushed(x0, y0, s, s, dk ? 0.07 : 0.12);
      const sh = ctx.createLinearGradient(x0, y0, x0 + s, yb);
      sh.addColorStop(0.12, 'rgba(255,255,255,0)');
      sh.addColorStop(0.32, 'rgba(255,255,255,' + (dk ? 0.14 : 0.26) + ')');
      sh.addColorStop(0.48, 'rgba(255,255,255,0)');
      sh.addColorStop(0.7, 'rgba(255,255,255,0)');
      sh.addColorStop(0.8, 'rgba(255,255,255,' + (dk ? 0.06 : 0.1) + ')');
      sh.addColorStop(0.9, 'rgba(255,255,255,0)');
      ctx.fillStyle = sh;
      ctx.fillRect(x0, y0, s, s);
    }
    if (kind === 'glass' && s > 10) {
      // 玻璃：兩道斜的亮帶，邊緣較厚（顏色較深）
      ctx.save();
      ctx.beginPath(); ctx.rect(x0, y0, s, s); ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,' + (dk ? 0.16 : 0.32) + ')';
      ctx.beginPath(); ctx.moveTo(x0 + s * 0.15, yb); ctx.lineTo(x0 + s * 0.42, y0); ctx.lineTo(x0 + s * 0.55, y0); ctx.lineTo(x0 + s * 0.28, yb); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,' + (dk ? 0.08 : 0.16) + ')';
      ctx.beginPath(); ctx.moveTo(x0 + s * 0.6, yb); ctx.lineTo(x0 + s * 0.84, y0); ctx.lineTo(x0 + s * 0.9, y0); ctx.lineTo(x0 + s * 0.66, yb); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = alpha(shade(base, -0.25), 0.55);
      ctx.lineWidth = Math.max(1.5, s * 0.06);
      ctx.strokeRect(x0 + ctx.lineWidth / 2, y0 + ctx.lineWidth / 2, s - ctx.lineWidth, s - ctx.lineWidth);
    }
    if (kind === 'ice' && s > 8) {
      // 冰：中心霧白、內部的小氣泡、裂紋與高光
      const fg = ctx.createRadialGradient(x0 + s * 0.45, y0 + s * 0.5, s * 0.05, x0 + s * 0.45, y0 + s * 0.5, s * 0.6);
      fg.addColorStop(0, 'rgba(255,255,255,' + (dk ? 0.3 : 0.5) + ')');
      fg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = fg;
      ctx.fillRect(x0, y0, s, s);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      [[0.3, 0.25, 0.04], [0.62, 0.7, 0.03], [0.72, 0.3, 0.025], [0.25, 0.68, 0.03]].forEach(function (q) {
        ctx.beginPath(); ctx.arc(x0 + s * q[0], y0 + s * q[1], Math.max(0.8, s * q[2]), 0, Math.PI * 2); ctx.fill();
      });
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0 + s * 0.2, y0 + s * 0.3); ctx.lineTo(x0 + s * 0.45, y0 + s * 0.52); ctx.lineTo(x0 + s * 0.4, y0 + s * 0.8);
      ctx.moveTo(x0 + s * 0.45, y0 + s * 0.52); ctx.lineTo(x0 + s * 0.75, y0 + s * 0.45);
      ctx.stroke();
    }
    if (kind === 'mys' && s > 12) {
      ctx.font = font(800, Math.max(9, Math.round(s * 0.55)));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = alpha(shade(base, -0.45), 0.85);
      ctx.fillText('?', x, y0 + s * 0.54);
    }
    // 邊線：頂邊與前右稜的高光、底邊暗線
    ctx.lineWidth = 1;
    ctx.strokeStyle = alpha(shade(base, 0.75), translucent ? 0.85 : 0.7);
    ctx.beginPath(); ctx.moveTo(x0 + 0.5, y0 + 0.5); ctx.lineTo(x0 + s - 0.5, y0 + 0.5); ctx.lineTo(x0 + s + dx - 0.5, y0 - dy + 0.5); ctx.stroke();
    ctx.strokeStyle = alpha(shade(base, 0.6), translucent ? 0.5 : 0.35);
    ctx.beginPath(); ctx.moveTo(x0 + s - 0.5, y0 + 1); ctx.lineTo(x0 + s - 0.5, yb - 1); ctx.stroke();
    ctx.strokeStyle = alpha(shade(base, -0.55), translucent ? 0.5 : 0.75);
    ctx.beginPath(); ctx.moveTo(x0, yb - 0.5); ctx.lineTo(x0 + s, yb - 0.5); ctx.lineTo(x0 + s + dx, yb - dy - 0.5); ctx.stroke();
    if (kind === 'ice') {
      ctx.strokeStyle = alpha(shade(base, -0.25), 0.7);
      ctx.strokeRect(x0 + 0.5, y0 + 0.5, s - 1, s - 1);
    }
  }

  /** 物體周圍代表溫度的光暈（只代表溫度，不改變大小） */
  function glow(x, y, r, Tc, strength) {
    const d = Math.abs(Tc - 22);
    const a = Math.min(0.55, d / 160) * (strength == null ? 1 : strength) * (colors.dark ? 1.25 : 1);
    if (a < 0.02) return;
    const g = ctx.createRadialGradient(x, y, r * 0.3, x, y, r);
    g.addColorStop(0, alpha(tcol(Tc), a));
    g.addColorStop(1, alpha(tcol(Tc), 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  /** 玻璃溫度計：x 中心、底部球 yBulb、頂端 yTop；顯示 −30 ～ 110 °C（px 座標） */
  function thermometer(x, yBulb, yTop, w, Tc, label, side) {
    const r = w * 0.9;
    const yLo = yBulb - r - 4, yHi = yTop + w; // 刻度範圍：−30 → yLo、110 → yHi
    const yOf = function (t) { return yLo + (yHi - yLo) * (t + 30) / 140; };
    const dk = colors.dark, lc = colors.pos;
    const hw = w / 2, yJ = yBulb - Math.sqrt(r * r - hw * hw), aJ = Math.atan2(yJ - yBulb, hw);
    // 外形：圓頭的玻璃管＋底部的球
    const shape = function () {
      ctx.beginPath();
      ctx.moveTo(x - hw, yJ);
      ctx.lineTo(x - hw, yTop + hw);
      ctx.arc(x, yTop + hw, hw, Math.PI, 2 * Math.PI);
      ctx.lineTo(x + hw, yJ);
      ctx.arc(x, yBulb, r, aJ, Math.PI - aJ, false);
      ctx.closePath();
    };
    // 玻璃本體（帶柔和投影，讓它從背景浮出來）
    ctx.save();
    ctx.shadowColor = dk ? 'rgba(0,0,0,0.45)' : alpha(colors.text, 0.16);
    ctx.shadowBlur = 5; ctx.shadowOffsetX = 1.5; ctx.shadowOffsetY = 1;
    ctx.fillStyle = alpha(colors.surface, dk ? 0.2 : 0.4);
    shape(); ctx.fill();
    ctx.restore();
    // 刻度背板（乳白色的條）
    const sw = w * 0.6;
    ctx.fillStyle = dk ? alpha(shade(colors.muted, 0.3), 0.22) : alpha('#ffffff', 0.85);
    roundRect(ctx, x - sw / 2, yTop + hw, sw, yJ - yTop - hw, sw / 2);
    ctx.fill();
    // 毛細管與液柱（紅色酒精）
    const bw = Math.max(2, w * 0.34);
    ctx.fillStyle = alpha(colors.text, dk ? 0.16 : 0.1);
    ctx.fillRect(x - bw / 2, yHi - 3, bw, yBulb - yHi + 3);
    const tc = Math.max(-30, Math.min(112, Tc));
    const yc = yOf(tc);
    const lg = ctx.createLinearGradient(x - bw / 2, 0, x + bw / 2, 0);
    lg.addColorStop(0, shade(lc, 0.3)); lg.addColorStop(0.45, lc); lg.addColorStop(1, shade(lc, -0.3));
    ctx.fillStyle = lg;
    ctx.fillRect(x - bw / 2, yc, bw, yBulb - yc);
    // 球裡的液體
    const bg2 = ctx.createRadialGradient(x - r * 0.3, yBulb - r * 0.35, r * 0.05, x, yBulb, r * 0.85);
    bg2.addColorStop(0, shade(lc, 0.55));
    bg2.addColorStop(0.55, lc);
    bg2.addColorStop(1, shade(lc, -0.3));
    ctx.fillStyle = bg2;
    ctx.beginPath(); ctx.arc(x, yBulb, r * 0.8, 0, Math.PI * 2); ctx.fill();
    // 玻璃的反光：左側亮條、右側暗邊、外框、球上的亮點
    ctx.save();
    shape(); ctx.clip();
    const gx = ctx.createLinearGradient(x - hw, 0, x + hw, 0);
    gx.addColorStop(0, 'rgba(255,255,255,' + (dk ? 0.1 : 0.3) + ')');
    gx.addColorStop(0.2, 'rgba(255,255,255,' + (dk ? 0.3 : 0.85) + ')');
    gx.addColorStop(0.34, 'rgba(255,255,255,0)');
    gx.addColorStop(0.78, 'rgba(0,0,0,0)');
    gx.addColorStop(1, alpha(dk ? '#000000' : colors.text, dk ? 0.3 : 0.14));
    ctx.fillStyle = gx;
    ctx.fillRect(x - hw, yTop, w, yJ - yTop);
    ctx.restore();
    ctx.strokeStyle = alpha(colors.muted, dk ? 0.8 : 0.65);
    ctx.lineWidth = 1;
    shape(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,' + (dk ? 0.5 : 0.8) + ')';
    ctx.beginPath(); ctx.ellipse(x - r * 0.38, yBulb - r * 0.38, r * 0.22, r * 0.14, -0.7, 0, Math.PI * 2); ctx.fill();
    // 刻度（每 10 °C，0 與 100 較長）
    ctx.strokeStyle = alpha(colors.text, 0.55);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let t = -30; t <= 110; t += 10) {
      const y = Math.round(yOf(t)) + 0.5, long = t % 50 === 0;
      ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2 + (long ? 6 : 3), y);
    }
    ctx.stroke();
    if (yLo - yHi > 120) {
      ctx.font = font(0, 10);
      ctx.fillStyle = alpha(colors.muted, 0.95);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      [0, 50, 100].forEach(function (t) { LD.haloText(ctx, String(t), x + w / 2 + 8, yOf(t), alpha(colors.muted, 1), 'left', 'middle', font(0, 10)); });
    }
    if (label) {
      if (side) { ctx.textAlign = 'left'; return pill(label, x + w / 2 + 8, yTop - 4, colors.text, font(700, L.wide ? 12 : 11), 0.88); }
      ctx.textAlign = 'center';
      return pill(label, x, yTop - 12, colors.text, font(700, L.wide ? 12 : 11), 0.88);
    }
    return null;
  }

  // ---------- 狀態文字 ----------
  function setStatus(msg) { $('status').textContent = msg || ''; describeCanvas(); }

  // ---------- 畫布的文字說明（螢幕報讀器；只在離散事件時更新） ----------
  function describeCanvas() {
    if (!cv) return;
    const m = state.mode;
    let d;
    if (m === 'cal') {
      const C = state.cal, p = C.phase === 'ready' ? calParams() : C.p;
      const nm = p.mys ? T('神秘金屬', 'a mystery metal') : matName(p.mat);
      const g1 = num(p.m1 * 1000, p.m1 < 0.1 ? 1 : 0), g2 = num(p.m2 * 1000, 0);
      d = T('量熱器的剖面圖：' + nm + ' ' + g1 + ' g、' + num(p.T1, 1) + ' °C，放進 ' + g2 + ' g、' + num(p.T2, 1) + ' °C 的水中' + (p.stir ? '，有攪拌' : '，不攪拌') + (p.loss ? '，杯子會散熱' : '') + '。',
        'Cut-away view of a calorimeter: ' + nm + ', ' + g1 + ' g at ' + num(p.T1, 1) + ' °C, into ' + g2 + ' g of water at ' + num(p.T2, 1) + ' °C' + (p.stir ? ', stirred' : ', not stirred') + (p.loss ? ', the cup loses heat' : '') + '. ');
      const s = C.sim ? HC.mixState(C.sim) : null;
      if (C.phase === 'ready' || C.phase === 'drop' || !s) d += p.mys ? T('樣品還沒放入；神秘金屬的預測值不顯示。', 'The sample is not in yet; no prediction is shown for the mystery metal.')
        : T('樣品還沒放入，預測平衡溫度 ' + num(C.pred.Tf, 2) + ' °C。', 'The sample is not in yet; predicted equilibrium temperature ' + num(C.pred.Tf, 2) + ' °C.');
      else if (C.eqDone) d += T('已達熱平衡：樣品 ' + num(s.TA, 2) + ' °C、水 ' + num(s.TB, 2) + ' °C，經過 ' + num(C.eqT, 1) + ' 秒。', 'Thermal equilibrium reached: sample ' + num(s.TA, 2) + ' °C, water ' + num(s.TB, 2) + ' °C after ' + num(C.eqT, 1) + ' s.');
      else d += T('實驗進行中：t = ' + num(C.sim.t, 1) + ' 秒，樣品 ' + num(s.TA, 2) + ' °C、水 ' + num(s.TB, 2) + ' °C。', 'Running: t = ' + num(C.sim.t, 1) + ' s, sample ' + num(s.TA, 2) + ' °C, water ' + num(s.TB, 2) + ' °C.');
      d += T('右邊是兩者的溫度–時間圖與熱量長條圖。', ' On the right: the temperature–time graph and the heat bar chart.');
    } else if (m === 'heat') {
      const Hh = state.heat, p = Hh.phase === 'ready' ? heatParams() : Hh.p;
      const nm = p.mys ? T('神秘金屬', 'a mystery metal') : p.h2o ? T('水（冰）', 'water (ice)') : matName(p.mat);
      const st = HC.stateOf(Hh.body || Hh.pred.su.b, Hh.body ? Hh.H : Hh.pred.su.H0);
      d = T('加熱曲線實驗：' + nm + ' ' + num(p.m, 2) + ' kg，起始溫度 ' + num(p.T0, 1) + ' °C，加熱器功率 ' + num(p.P, 0) + ' W' + (p.loss ? '，容器會散熱' : '，隔熱良好') + '。',
        'Heating-curve experiment: ' + nm + ', ' + num(p.m, 2) + ' kg, starting at ' + num(p.T0, 1) + ' °C, heater power ' + num(p.P, 0) + ' W' + (p.loss ? ', the container loses heat' : ', well insulated') + '. ');
      d += Hh.t > 0 ? T('t = ' + num(Hh.t, 1) + ' 秒時 ' + num(st.T, 2) + ' °C，' + phaseText(st, p) + '。', 'At t = ' + num(Hh.t, 1) + ' s it is ' + num(st.T, 2) + ' °C: ' + phaseText(st, p) + '.')
        : T('還沒開始加熱。', 'Heating has not started.');
      if (Hh.points.length) d += T('已記錄 ' + Hh.points.length + ' 個點。', ' ' + Hh.points.length + ' point(s) recorded.');
      d += T('右邊是加熱曲線與熱量長條圖。', ' On the right: the heating curve and the heat bar chart.');
    } else {
      const Cm = state.cmp, p = Cm.phase === 'ready' ? cmpParams() : Cm.p;
      if (!Cm.items.length) d = T('比熱比較：還沒選擇材料。', 'Specific heat comparison: no material is chosen.');
      else {
        const list = Cm.items.map(function (it) { return matName(it.key) + ' ' + num(HC.temperature(it.b, it.H), 1) + ' °C'; }).join(T('、', ', '));
        d = T('比熱比較：每個物體 ' + num(p.m, 1) + ' kg，從 ' + num(p.T0, 0) + ' °C 起用相同功率 ' + num(p.P, 0) + ' W 加熱。t = ' + num(Cm.t, 1) + ' 秒：' + list + '。右邊是溫度–時間圖與溫度變化長條圖。',
          'Specific heat comparison: each object is ' + num(p.m, 1) + ' kg, heated from ' + num(p.T0, 0) + ' °C with the same power ' + num(p.P, 0) + ' W. At t = ' + num(Cm.t, 1) + ' s: ' + list + '. On the right: the temperature–time graph and the temperature-change bars.');
      }
    }
    if (cv.getAttribute('aria-label') !== d) cv.setAttribute('aria-label', d);
  }
  /** 改參數後（放開滑桿、換材料）：把最重要的預測寫進 aria-live 的狀態列 */
  function announcePrediction() {
    const m = state.mode;
    if (m === 'cal') {
      const C = state.cal, p = calParams();
      if (C.phase !== 'ready') return;
      setStatus(p.mys ? T('神秘金屬：先做實驗，再算出它的比熱。', 'Mystery metal: do the experiment first, then work out its specific heat.')
        : T('預測平衡溫度 T', 'Predicted equilibrium temperature T') + 'f = ' + num(C.pred.Tf, 2) + ' °C' + T('。', '.'));
    } else if (m === 'heat') {
      const Hh = state.heat, p = heatParams();
      if (Hh.phase !== 'ready') return;
      if (p.mys) { setStatus(T('神秘金屬：記錄兩個點，由斜率算出比熱。', 'Mystery metal: record two points and find c from the slope.')); return; }
      if (p.h2o) {
        const pl = Hh.pred.plats.map(function (q) { return (q.i === 0 ? T('熔化平台約 ', 'melting plateau about ') : T('沸騰平台約 ', 'boiling plateau about ')) + num(q.t1 - q.t0, 0) + T(' 秒', ' s'); });
        setStatus(pl.length ? T('預測：', 'Prediction: ') + pl.join(T('、', ', ')) + T('。', '.') : '');
      } else setStatus(T('預測升溫斜率 P/(mc) = ', 'Predicted slope P/(mc) = ') + num(p.P / (p.m * cOf(p.mat)), 4) + ' °C/s' + (p.loss ? T('（不計散熱）', ' (without heat loss)') : '') + T('。', '.'));
    } else {
      const keys = cmpKeys();
      if (keys.length < 2) return;
      const by = keys.slice().sort(function (a, b) { return cOf(a) - cOf(b); });
      setStatus(T('同樣的熱量下，升溫最快的是' + matName(by[0]) + '，最慢的是' + matName(by[by.length - 1]) + '（ΔT = Q/(mc)）。',
        'With the same heat, ' + matName(by[0]) + ' warms fastest and ' + matName(by[by.length - 1]) + ' slowest (ΔT = Q/(mc)).'));
    }
  }

  // =====================================================================
  //                               量 熱 器
  // =====================================================================
  function calParams() {
    const mat = state.cal.mat;
    return {
      mat: mat, sub: subOf(mat), mys: mat === 'mys', ice: mat === 'ice',
      m1: val(el.m1), T1: val(el.T1), m2: val(el.m2), T2: val(el.T2), Ccup: val(el.cc),
      stir: el.stir.checked, loss: el.lossC.checked
    };
  }
  function makeCalSim(p) {
    return HC.createMix({
      A: { s: p.sub, m: p.m1, T: p.T1, phase: 0 },
      B: { m: p.m2, T: p.T2, phase: 1, Ccup: p.Ccup },
      k: HC.contactK(p.sub, p.m1, p.stir), ke: p.loss ? HC.KE_CUP : 0
    });
  }
  function iceSteam(sim, HA, HB) {
    const a = HC.phaseMasses(sim.A, HA), b = HC.phaseMasses(sim.B, HB);
    const h2oA = sim.A.sub.id === 'h2o';
    return {
      iceA: h2oA ? a[0] : 0, liqA: h2oA ? a[1] : 0, gasA: h2oA ? a[2] : 0,
      iceB: b[0], liqB: b[1], gasB: b[2],
      ice: (h2oA ? a[0] : 0) + b[0], steam: (h2oA ? a[2] : 0) + b[2]
    };
  }
  /** 參數改變時：解析的平衡態、到達平衡的時間、預測曲線 */
  function calPredict() {
    const p = calParams(), C = state.cal;
    const sim = makeCalSim(p);
    const eq = sim.eq;
    const t05 = HC.timeToEquilibrium(sim.A, sim.B, sim.HA, sim.HB, sim.k, EQ_TOL);
    const t01 = HC.timeToEquilibrium(sim.A, sim.B, sim.HA, sim.HB, sim.k, 0.01);
    let tEnd = p.loss ? Math.max(120, 3 * t05) : Math.max(20, 1.12 * t01);
    tEnd = niceCeil(tEnd);
    const curve = [[0, HC.temperature(sim.A, sim.HA), HC.temperature(sim.B, sim.HB)]];
    const N = 200;
    for (let i = 1; i <= N; i++) {
      const pts = HC.mixStep(sim, tEnd / N);
      pts.forEach(function (q) { curve.push([q.t, HC.temperature(sim.A, q.HA), HC.temperature(sim.B, q.HB)]); });
      const s = HC.mixState(sim);
      curve.push([sim.t, s.TA, s.TB]);
    }
    const s0 = makeCalSim(p);
    C.pred = { p: p, eq: eq, Tf: eq.T, t05: t05, tEnd: tEnd, curve: curve, k: s0.k, HA0: s0.HA, HB0: s0.HB, A: s0.A, B: s0.B, ph: iceSteam(s0, eq.H[0], eq.H[1]) };
  }

  function calArchive() {
    const C = state.cal;
    if (C.samples.length > 1 && C.sim && C.sim.t > 0) {
      C.ghosts.push({ a: thin(C.samples.map(function (s) { return [s[0], s[1]]; })), b: thin(C.samples.map(function (s) { return [s[0], s[2]]; })), tEnd: C.sim.t });
      if (C.ghosts.length > 5) C.ghosts.shift();
    }
  }
  function thin(arr) {
    if (arr.length <= 500) return arr;
    const out = [], step = arr.length / 500;
    for (let i = 0; i < 500; i++) out.push(arr[Math.floor(i * step)]);
    out.push(arr[arr.length - 1]);
    return out;
  }
  function calReset() {
    const C = state.cal;
    C.phase = 'ready'; C.sim = null; C.samples = []; C.eqDone = false; C.drop = null; C.idxA = C.idxB = -1;
    stopVoices();
  }
  function calChanged() {
    const C = state.cal;
    if (C.phase !== 'ready') { calArchive(); calReset(); setStatus(''); }
    calPredict();
    refreshOutputs();
    updateButtons();
    requestDraw();
    describeCanvas();
  }

  function calStart() {
    const C = state.cal;
    state.acted = true;
    calPredict();
    C.p = C.pred.p;
    C.phase = 'drop';
    C.drop = { t0: performance.now() };
    setStatus(T('放入樣品……', 'Dropping the sample in…'));
    if (reducedMotion) calTouchdown();
    updateButtons();
    startLoop();
  }
  function calTouchdown() {
    const C = state.cal, p = C.p;
    C.sim = makeCalSim(p);
    C.phase = 'run';
    C.drop = null;
    const s = HC.mixState(C.sim);
    C.P0 = Math.abs(s.P);
    C.samples = [[0, s.TA, s.TB]];
    C.idxA = s.A.idx; C.idxB = s.B.idx;
    splashSound(p.T1, p.T2, p.ice);
    if (!reducedMotion) splashFx(p);
    setStatus(Math.abs(s.TA - s.TB) < EQ_TOL
      ? T('兩者的溫度相同：沒有熱流動。', 'Both are at the same temperature: no heat flows.')
      : s.TA > s.TB ? T('樣品比水熱：熱由樣品流向水。', 'The sample is hotter than the water: heat flows from the sample to the water.')
        : T('樣品比水冷：熱由水流向樣品。', 'The sample is colder than the water: heat flows from the water into the sample.'));
    checkEquilibrium();
  }

  function calStep(dtR) {
    const C = state.cal;
    if (C.phase === 'drop') {
      if (performance.now() - C.drop.t0 >= DROP_MS) calTouchdown();
      return;
    }
    if (C.phase !== 'run') return;
    const sim = C.sim;
    let dt = dtR * state.speed.cal;
    if (sim.t + dt > C.pred.tEnd) dt = C.pred.tEnd - sim.t;
    if (dt > 0) {
      const pts = HC.mixStep(sim, dt);
      pts.forEach(function (q) { C.samples.push([q.t, HC.temperature(sim.A, q.HA), HC.temperature(sim.B, q.HB)]); });
      const s = HC.mixState(sim);
      C.samples.push([sim.t, s.TA, s.TB]);
      calPhaseNews(s);
    }
    checkEquilibrium();
    calVoices();
    if (sim.t >= C.pred.tEnd - 1e-9) {
      C.phase = 'done';
      stopVoices();
      if (!C.eqDone) setStatus(T('時間到。', 'Time is up.'));
      else if (C.p.loss) setStatus(T('時間到：有散熱時，混合後的溫度會繼續往室溫 25 °C 靠近。', 'Time is up: with heat loss, the mixture keeps drifting toward room temperature (25 °C).'));
    }
    updateButtons();
  }

  /** 相變的提示（冰開始融化、全部融化、水結冰、沸騰） */
  function calPhaseNews(s) {
    const C = state.cal;
    if (s.A.idx !== C.idxA && C.sim.A.sub.id === 'h2o') {
      const g = s.A.seg;
      if (g.kind === 'lat' && g.i === 0 && C.idxA < s.A.idx) setStatus(T('冰升溫到 0 °C，開始融化：溫度停在 0 °C。', 'The ice has warmed to 0 °C and starts to melt: its temperature stays at 0 °C.'));
      else if (g.kind === 'sens' && g.p === 1 && C.idxA < s.A.idx) setStatus(T('冰全部融化了！融化的水繼續升溫。', 'All the ice has melted! The meltwater keeps warming up.'));
      if (C.idxA < s.A.idx) phaseSound(true);
    }
    if (s.B.idx !== C.idxB) {
      const g = s.B.seg;
      if (g.kind === 'lat' && g.i === 0 && C.idxB > s.B.idx) setStatus(T('杯中的水降到 0 °C，開始結冰！', 'The water has cooled to 0 °C and starts to freeze!'));
      if (g.kind === 'lat' && g.i === 1 && C.idxB < s.B.idx) setStatus(T('杯中的水到達 100 °C，開始沸騰！', 'The water has reached 100 °C and starts to boil!'));
      phaseSound(C.idxB < s.B.idx);
    }
    C.idxA = s.A.idx; C.idxB = s.B.idx;
  }

  function checkEquilibrium() {
    const C = state.cal;
    if (C.eqDone || !C.sim) return;
    const s = HC.mixState(C.sim);
    if (Math.abs(s.dT) > EQ_TOL) return;
    C.eqDone = true;
    C.eqT = C.sim.t;
    chimeSound();
    stopVoices(0.9);
    const p = C.p, eqp = C.pred.ph;
    let msg = T('達到熱平衡！', 'Thermal equilibrium reached! ') + (p.mys ? '' : T('最後溫度 ', 'Final temperature ') + num(p.loss ? s.TB : C.pred.Tf, 2) + ' °C' + T('。', '.'));
    if (!p.loss) {
      if (p.ice && eqp.ice > 1e-7 && eqp.ice < p.m1 - 1e-7) msg += T('冰沒有全部融化，剩下 ', ' Not all the ice melts: ') + grams(eqp.ice) + T('。', ' is left.');
      if (p.ice && eqp.ice <= 1e-7) msg += T('冰全部融化了。', ' All the ice has melted.');
      if (eqp.ice > (p.ice ? p.m1 : 0) + 1e-7) msg += T('有一部分的水結成冰。', ' Some of the water has frozen.');
      if (eqp.steam > 1e-7) msg += T('有 ', ' ') + grams(eqp.steam) + T(' 的水汽化。', ' of water has boiled off.');
    }
    setStatus(msg);
    if (p.mys) state.mysMeasured = true;
    emit('mix', {
      mat: p.mat, sub: p.sub, mys: p.mys, m1: p.m1, T1: p.T1, m2: p.m2, T2: p.T2, Ccup: p.Ccup, stir: p.stir, loss: p.loss,
      Tf: C.pred.Tf, TA: s.TA, TB: s.TB, t: C.sim.t, c1: cOf(p.mat),
      ice0: p.ice ? p.m1 : 0, ice: eqp.ice, steam: eqp.steam, iceA: eqp.iceA
    });
  }

  // =====================================================================
  //                               加 熱 曲 線
  // =====================================================================
  function heatParams() {
    const mat = state.heat.mat;
    return { mat: mat, sub: subOf(mat), mys: mat === 'mys', h2o: mat === 'h2o', m: val(el.hm), T0: val(el.hT), P: val(el.hP), loss: el.lossH.checked };
  }
  function heatSetup(p) {
    const b = HC.makeBody(p.sub, p.m);
    const H0 = HC.enthalpyAt(b, p.T0, p.h2o && p.T0 <= 0 ? 0 : 1);
    const Hstop = p.h2o ? HC.enthalpyAt(b, 100, 2) : HC.enthalpyAt(b, T_SOLID_MAX);
    return { b: b, H0: H0, Hstop: Hstop, ke: p.loss ? HC.KE_BEAKER : 0 };
  }
  function heatPredict() {
    const p = heatParams(), Hh = state.heat;
    const su = heatSetup(p);
    const end = HC.heaterEnd(su.b, su.H0, p.P, su.ke, TENV, su.Hstop, EQ_TOL, 2e5);
    const tEnd = Math.max(1, end.t);
    const curve = [];
    const N = 260;
    const all = HC.heatStep(su.b, su.H0, p.P, su.ke, TENV, tEnd);
    const corners = all.pts.map(function (q) { return q.dt; });
    const times = [];
    for (let i = 0; i <= N; i++) times.push(tEnd * i / N);
    corners.forEach(function (t) { times.push(t); });
    times.sort(function (a, b) { return a - b; });
    times.forEach(function (t) { curve.push([t, HC.temperature(su.b, HC.heatStep(su.b, su.H0, p.P, su.ke, TENV, t).H)]); });
    // 平台（相變）的時間區間
    const plats = [];
    let tPrev = 0, H = su.H0;
    const bounds = all.pts.concat([{ dt: tEnd, H: all.H }]);
    bounds.forEach(function (q) {
      const mid = HC.heatStep(su.b, H, p.P, su.ke, TENV, (q.dt - tPrev) / 2).H;
      const st = HC.stateOf(su.b, mid);
      if (st.seg.kind === 'lat') plats.push({ t0: tPrev, t1: q.dt, T: st.seg.T, i: st.seg.i });
      tPrev = q.dt; H = q.H;
    });
    Hh.pred = { p: p, su: su, end: end, tEnd: tEnd, curve: curve, plats: plats, Qend: p.P * tEnd };
  }
  function heatArchive() {
    const Hh = state.heat;
    if (Hh.samples.length > 1 && Hh.t > 0) {
      Hh.ghosts.push({ a: thin(Hh.samples.slice()), tEnd: Hh.t });
      if (Hh.ghosts.length > 5) Hh.ghosts.shift();
    }
  }
  function heatReset() {
    const Hh = state.heat;
    Hh.phase = 'ready'; Hh.body = null; Hh.t = 0; Hh.Qin = 0; Hh.Qloss = 0; Hh.samples = []; Hh.trans = []; Hh.points = []; Hh.idx = -1;
    stopVoices();
    renderPoints();
  }
  function heatChanged() {
    const Hh = state.heat;
    if (Hh.phase !== 'ready') { heatArchive(); heatReset(); setStatus(''); }
    heatPredict();
    refreshOutputs();
    updateButtons();
    requestDraw();
    describeCanvas();
  }
  function heatStart() {
    const Hh = state.heat;
    state.acted = true;
    heatPredict();
    const p = Hh.pred.p, su = Hh.pred.su;
    Hh.p = p;
    Hh.body = su.b; Hh.H0 = su.H0; Hh.H = su.H0; Hh.Hstop = su.Hstop; Hh.ke = su.ke;
    Hh.t = 0; Hh.Qin = 0; Hh.Qloss = 0;
    Hh.samples = [[0, HC.temperature(su.b, su.H0)]];
    Hh.trans = []; Hh.points = [];
    Hh.idx = HC.stateOf(su.b, su.H0, flowDir(Hh, su.H0)).idx;
    Hh.phase = 'run';
    renderPoints();
    setStatus(T('加熱器開始加熱。', 'The heater is on.'));
    updateButtons();
    startLoop();
  }
  function flowDir(Hh, H) {
    const p = Hh.p || Hh.pred.p;
    const Tn = HC.temperature(Hh.body || Hh.pred.su.b, H);
    return p.P - (Hh.ke || 0) * (Tn - TENV) >= 0 ? 1 : -1;
  }
  function heatStep(dtR) {
    const Hh = state.heat;
    if (Hh.phase !== 'run') return;
    const p = Hh.p;
    let dt = dtR * state.speed.heat;
    if (Hh.t + dt > Hh.pred.tEnd) dt = Hh.pred.tEnd - Hh.t;
    if (dt > 0) {
      const r = HC.heatStep(Hh.body, Hh.H, p.P, Hh.ke, TENV, dt);
      r.pts.forEach(function (q) {
        Hh.samples.push([Hh.t + q.dt, HC.temperature(Hh.body, q.H)]);
        const st = HC.stateOf(Hh.body, q.H, flowDir(Hh, q.H));
        heatTransition(Hh.idx, st, Hh.t + q.dt);
        Hh.idx = st.idx;
      });
      Hh.H = r.H; Hh.Qin += r.Qin; Hh.Qloss += r.Qloss; Hh.t += dt;
      Hh.samples.push([Hh.t, HC.temperature(Hh.body, Hh.H)]);
    }
    heatVoice();
    if (Hh.t >= Hh.pred.tEnd - 1e-9) {
      Hh.phase = 'done';
      stopVoices();
      const reason = Hh.pred.end.reason;
      const Tn = HC.temperature(Hh.body, Hh.H);
      if (reason === 'steady') {
        setStatus(T('溫度不再改變：加熱器的功率等於散失到環境的熱流（穩定狀態）。', 'The temperature no longer changes: the heater power equals the rate of heat loss (steady state).'));
        chimeSound();
        emit('steady', { mat: p.mat, sub: p.sub, mys: p.mys, m: p.m, P: p.P, T0: p.T0, loss: p.loss, T: Tn, Tss: TENV + p.P / HC.KE_BEAKER, t: Hh.t });
      } else if (reason === 'stop') {
        setStatus(p.h2o ? T('水全部汽化了，加熱結束。', 'All the water has boiled away; heating stops.') : T('到達 250 °C，加熱結束。', 'It has reached 250 °C; heating stops.'));
      } else setStatus(T('時間到。', 'Time is up.'));
      emit('heated', { mat: p.mat, sub: p.sub, mys: p.mys, m: p.m, P: p.P, T0: p.T0, loss: p.loss, t: Hh.t, reason: reason });
    }
    updateButtons();
  }
  function heatTransition(fromIdx, st, t) {
    const Hh = state.heat, p = Hh.p;
    const g = st.seg;
    let kind = null;
    const up = st.idx > fromIdx;
    const from = Hh.body.segs[fromIdx];
    if (g.kind === 'lat') kind = up ? (g.i === 0 ? 'melt-start' : 'boil-start') : (g.i === 0 ? 'freeze-start' : 'condense-start');
    else if (from && from.kind === 'lat') kind = up ? (from.i === 0 ? 'melt-end' : 'boil-end') : (from.i === 0 ? 'freeze-end' : 'condense-end');
    if (!kind) return;
    Hh.trans.push({ t: t, kind: kind });
    const msg = {
      'melt-start': T('冰到達 0 °C，開始熔化：溫度停在 0 °C，吸收的熱用來熔化。', 'The ice has reached 0 °C and starts to melt: the temperature stays at 0 °C while the heat melts the ice.'),
      'melt-end': T('冰全部熔化成水，溫度又開始上升。', 'All the ice has melted; the temperature rises again.'),
      'boil-start': T('水到達 100 °C，開始沸騰：溫度停在 100 °C。', 'The water has reached 100 °C and starts to boil: the temperature stays at 100 °C.'),
      'boil-end': T('水全部汽化了。', 'All the water has boiled away.'),
      'freeze-start': T('水降到 0 °C，開始結冰。', 'The water has cooled to 0 °C and starts to freeze.'),
      'freeze-end': T('水全部結成冰。', 'All the water has frozen.'),
      'condense-start': '', 'condense-end': ''
    }[kind];
    if (msg) setStatus(msg);
    phaseSound(up);
    emit('phase', { kind: kind, t: t, mat: p.mat, sub: p.sub, mys: p.mys, m: p.m, P: p.P, T0: p.T0, loss: p.loss });
  }

  function recordPoint() {
    const Hh = state.heat;
    if (!Hh.body || Hh.t <= 0) return;
    state.acted = true;
    const st = HC.stateOf(Hh.body, Hh.H, flowDir(Hh, Hh.H));
    const pt = { t: Hh.t, T: st.T, kind: st.seg.kind, p: st.seg.p, i: st.seg.i, x: st.x, n: (Hh.points.length ? Hh.points[Hh.points.length - 1].n : 0) + 1 };
    Hh.points.push(pt);
    if (Hh.points.length > 12) Hh.points.shift();
    clickSound();
    renderPoints();
    requestDraw();
    const p = Hh.p;
    let say = T('記錄第 ' + pt.n + ' 點：t = ' + num(pt.t, 1) + ' 秒，T = ' + num(pt.T, 2) + ' °C。', 'Point ' + pt.n + ' recorded: t = ' + num(pt.t, 1) + ' s, T = ' + num(pt.T, 2) + ' °C.');
    if (Hh.points.length >= 2) {
      const a = Hh.points[Hh.points.length - 2], b = Hh.points[Hh.points.length - 1];
      const dtt = b.t - a.t, dT = b.T - a.T;
      const c = Math.abs(dT) > 1e-9 ? p.P * dtt / (p.m * dT) : null;
      if (dtt > 0) say += c != null && Math.abs(dT) > 1e-6 ? T('由最後兩點算出 c = ' + num(c, 0) + ' J/(kg·K)。', ' From the last two points c = ' + num(c, 0) + ' J/(kg·K).')
        : T('溫度沒變（相變中）：PΔt/m = ' + num(p.P * dtt / p.m / 1000, 1) + ' kJ/kg。', ' The temperature did not change (phase change): PΔt/m = ' + num(p.P * dtt / p.m / 1000, 1) + ' kJ/kg.');
      if (p.mys && a.kind === 'sens' && b.kind === 'sens' && dtt > 0) state.mysMeasured = true;
      emit('record', { mat: p.mat, sub: p.sub, mys: p.mys, m: p.m, P: p.P, T0: p.T0, loss: p.loss, n: Hh.points.length, p1: a, p2: b, dt: dtt, dT: dT, c: c, L: p.P * dtt / p.m });
    }
    setStatus(say);
  }
  function renderPoints() {
    const Hh = state.heat;
    const tb = $('ptsTable').querySelector('tbody');
    tb.innerHTML = Hh.points.length ? Hh.points.slice(-6).map(function (q) {
      return '<tr><td>' + q.n + '</td><td>' + num(q.t, 1) + '</td><td>' + num(q.T, 2) + '</td></tr>';
    }).join('') : '<tr><td colspan="3" style="text-align:left;color:var(--muted)">' + T('還沒有紀錄。', 'No points yet.') + '</td></tr>';
    let sl = '—', c = '—', Lq = '—';
    if (Hh.points.length >= 2 && Hh.p) {
      const a = Hh.points[Hh.points.length - 2], b = Hh.points[Hh.points.length - 1];
      const dtt = b.t - a.t, dT = b.T - a.T, p = Hh.p;
      if (dtt > 0) {
        sl = num(dT / dtt, 4) + ' °C/s';
        c = Math.abs(dT) > 1e-6 ? num(p.P * dtt / (p.m * dT), 0) + ' J/(kg·K)' : T('—（ΔT = 0）', '— (ΔT = 0)');
        Lq = num(p.P * dtt / p.m / 1000, 1) + ' kJ/kg';
      }
    }
    $('pSlope').textContent = sl;
    $('pC').textContent = c;
    $('pL').textContent = Lq;
  }

  // =====================================================================
  //                               比 熱 比 較
  // =====================================================================
  function cmpKeys() { return CMP_LIST.filter(function (k) { return state.cmp.on[k]; }); }
  function cmpParams() { return { m: val(el.cm), P: val(el.cP), T0: val(el.cT), keys: cmpKeys() }; }
  function cmpPredict() {
    const p = cmpParams(), Cm = state.cmp;
    const items = p.keys.map(function (k) {
      const b = HC.makeBody(subOf(k), p.m);
      const H0 = HC.enthalpyAt(b, p.T0, 1);
      const Hstop = k === 'h2o' ? HC.enthalpyAt(b, 100, 2) : HC.enthalpyAt(b, T_SOLID_MAX);
      return { key: k, b: b, H0: H0, H: H0, tStop: (Hstop - H0) / p.P, lastBand: Math.floor(p.T0 / 50) };
    });
    let tEnd = items.length ? Math.min.apply(null, items.map(function (it) { return it.tStop; })) : 10;
    tEnd = Math.max(1, tEnd);
    const Tmax = items.length ? Math.max.apply(null, items.map(function (it) { return HC.temperature(it.b, it.H0 + p.P * tEnd); })) : p.T0 + 10;
    Cm.pred = { p: p, items: items, tEnd: tEnd, Tmax: Tmax };
  }
  function cmpReset() {
    const Cm = state.cmp;
    Cm.phase = 'ready'; Cm.t = 0; Cm.samples = [];
    cmpPredict();
    Cm.items = Cm.pred.items;
  }
  function cmpChanged() {
    if (state.cmp.phase !== 'ready') setStatus('');
    cmpReset();
    refreshOutputs();
    updateButtons();
    if (!L || L.wide === false) resize(); else requestDraw();
    describeCanvas();
  }
  function cmpStart() {
    const Cm = state.cmp;
    if (!Cm.items.length) { setStatus(T('請至少選一種材料。', 'Choose at least one material.')); return; }
    state.acted = true;
    cmpReset();
    Cm.p = Cm.pred.p;
    Cm.phase = 'run';
    Cm.samples = [[0].concat(Cm.items.map(function (it) { return HC.temperature(it.b, it.H); }))];
    setStatus(T('每個加熱器同時開始加熱，功率都相同。', 'All the heaters start at the same moment with the same power.'));
    updateButtons();
    startLoop();
  }
  function cmpStep(dtR) {
    const Cm = state.cmp;
    if (Cm.phase !== 'run') return;
    let dt = dtR * state.speed.cmp;
    if (Cm.t + dt > Cm.pred.tEnd) dt = Cm.pred.tEnd - Cm.t;
    if (dt > 0) {
      Cm.items.forEach(function (it) {
        it.H = HC.heatStep(it.b, it.H, Cm.p.P, 0, TENV, dt).H;
        const band = Math.floor(HC.temperature(it.b, it.H) / 50 + 1e-9);
        if (band > it.lastBand) { it.lastBand = band; bandSound(band); }
      });
      Cm.t += dt;
      Cm.samples.push([Cm.t].concat(Cm.items.map(function (it) { return HC.temperature(it.b, it.H); })));
    }
    if (Cm.t >= Cm.pred.tEnd - 1e-9) {
      Cm.phase = 'done';
      const fast = Cm.items.reduce(function (a, b) { return HC.temperature(b.b, b.H) > HC.temperature(a.b, a.H) ? b : a; });
      setStatus(T(matName(fast.key) + ' 先到達終點溫度，比較結束。', matName(fast.key) + ' reached the final temperature first; the comparison ends.'));
    }
    updateButtons();
  }

  // =====================================================================
  //                               主 繪 圖
  // =====================================================================
  let drawPending = false;
  function requestDraw() {
    if (drawPending) return;
    drawPending = true;
    requestAnimationFrame(function () { drawPending = false; draw(); });
  }
  function draw() {
    if (!L) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(bg, 0, 0, cw, ch);
    if (state.mode === 'cal') { drawCalScene(); drawCalGraph(); drawCalInfo(); }
    else if (state.mode === 'heat') { drawHeatScene(); drawHeatGraph(); drawHeatInfo(); }
    else { drawCmpScene(); drawCmpGraph(); drawCmpInfo(); }
    updateReadout();
  }

  function clipRegion(R) {
    ctx.save();
    roundRect(ctx, R.x, R.y, R.w, R.h, 8);
    ctx.clip();
  }

  // ---------- 量熱器：裝置剖面 ----------
  function calGeom() {
    const S = L.scene;
    const pad = L.wide ? 14 : 8;
    const k = Math.min((S.w - 2 * pad) / 19, (S.h - 2 * pad) / 31); // px/cm
    const cx = S.x + S.w * (L.wide ? 0.5 : 0.47);
    const yb = S.y + S.h - pad - 2.0 * k;   // 杯內底部
    return { k: k, cx: cx, yb: yb, R: 4.5, H: 15.5, wall: 0.4, jack: 1.5, base: 1.6 };
  }
  /** 水面高度（cm，從杯底算起）：考慮樣品排開的水（金屬沉底、冰浮起） */
  function waterLevel(g, Vw, side, floats, mSolid) {
    const A = Math.PI * g.R * g.R;
    if (side <= 0) return { h: Vw / A, bottom: 0 };
    if (floats) {
      const disp = mSolid * 1000; // 浮體排開與自身等重的水（cm³）
      const draft = disp / (side * side);
      const h = (Vw + disp) / A;
      if (h >= draft) return { h: h, bottom: h - draft };
    }
    let h = Vw / (A - side * side);
    if (h > side) h = (Vw + side * side * side) / A;
    return { h: h, bottom: 0 };
  }

  function drawCalScene() {
    const S = L.scene, C = state.cal, g = calGeom(), k = g.k;
    const p = C.phase === 'ready' ? calParams() : C.p;
    const sim = C.sim;
    const X = function (x) { return g.cx + x * k; };
    const Y = function (y) { return g.yb - y * k; };
    clipRegion(S);
    const now = performance.now();

    // 目前的狀態
    let TA = p.T1, TB = p.T2, ph = null, flowP = 0;
    if (sim) { const s = HC.mixState(sim); TA = s.TA; TB = s.TB; ph = iceSteam(sim, sim.HA, sim.HB); flowP = s.P; }
    const rho = HC.SUBSTANCES[p.sub].phases[0].rho;
    const solidMass = p.ice ? (ph ? ph.iceA : p.m1) : p.m1;
    const side = Math.cbrt(Math.max(solidMass, 0) / rho) * 100; // cm
    const liquid = p.m2 - (ph ? ph.iceB + ph.gasB : 0) + (ph ? ph.liqA : 0); // kg（冰融化的水也在杯中）
    const crust = ph ? ph.iceB : 0;
    const inCup = C.phase === 'run' || C.phase === 'pause' || C.phase === 'done';
    const wl = waterLevel(g, liquid * 1000, inCup ? side : 0, p.ice, solidMass);

    // 杯子：外層隔熱套（剖面：薄金屬外殼＋保麗龍＋頂端的塑膠環）、內層金屬杯
    const Ro = g.R + g.wall + g.jack, top = g.H + 0.3;
    const jx0 = X(-Ro), jx1 = X(Ro), jy0 = Y(top), jy1 = Y(-g.base - 0.4);
    const ry = g.R * 0.16 * k, ryo = Ro * 0.16 * k, rw = (g.R + g.wall) * k;
    const dk = colors.dark;
    // 實驗桌與接觸陰影
    bench(S, jy1 - Math.max(10, 0.9 * k));
    LD.contactShadow(ctx, g.cx, jy1, (jx1 - jx0) / 2, 0);
    // 隔熱套的頂面（後半圈，看得到的環形）
    const collar = dk ? mix(colors.muted, colors['canvas-bg'], 0.45) : shade(colors.muted, -0.42);
    ctx.fillStyle = shade(collar, dk ? 0.08 : 0.12);
    ctx.beginPath(); ctx.ellipse(g.cx, jy0, Ro * k, ryo, 0, Math.PI, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = shade(collar, dk ? -0.35 : -0.3);
    ctx.beginPath(); ctx.ellipse(g.cx, jy0, rw, rw * 0.16, 0, Math.PI, 2 * Math.PI); ctx.fill();
    ctx.strokeStyle = alpha('#ffffff', dk ? 0.12 : 0.35); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(g.cx, jy0, Ro * k - 0.5, ryo - 0.5, 0, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
    // 外殼（剖面的外緣看得到）：左亮右暗，像圓柱
    const shellT = Math.max(2.5, 0.2 * k), rad = 8 * k / 14 + 3;
    const shellC = dk ? mix(colors.muted, colors['canvas-bg'], 0.3) : mix(colors.muted, colors.surface, 0.45);
    const shg = ctx.createLinearGradient(jx0, 0, jx1, 0);
    shg.addColorStop(0, shade(shellC, 0.1)); shg.addColorStop(0.18, shade(shellC, dk ? 0.3 : 0.55)); shg.addColorStop(0.5, shellC); shg.addColorStop(0.85, shade(shellC, -0.2)); shg.addColorStop(1, shade(shellC, -0.32));
    ctx.fillStyle = shg;
    roundRect(ctx, jx0, jy0, jx1 - jx0, jy1 - jy0, rad);
    ctx.fill();
    // 保麗龍（剖面）
    const foam = dk ? mix(colors['canvas-bg'], colors.muted, 0.32) : mix(colors.surface, '#ffffff', 0.55);
    const colH = Math.max(3, 0.55 * k);
    const fx0 = jx0 + shellT, fx1 = jx1 - shellT, fy0 = jy0 + colH, fy1 = jy1 - shellT;
    const fgr = ctx.createLinearGradient(0, fy0, 0, fy1);
    fgr.addColorStop(0, shade(foam, dk ? 0.04 : 0)); fgr.addColorStop(1, shade(foam, dk ? -0.12 : -0.06));
    ctx.fillStyle = fgr;
    roundRect(ctx, fx0, fy0, fx1 - fx0, fy1 - fy0, Math.max(2, rad - shellT));
    ctx.fill();
    const cwx0 = X(-g.R - g.wall), cwx1 = X(g.R + g.wall), cwy1 = Y(-g.wall);
    foamTexture(fx0, fy0, cwx0 - fx0, fy1 - fy0, foam);
    foamTexture(cwx1, fy0, fx1 - cwx1, fy1 - fy0, foam);
    foamTexture(cwx0, cwy1, cwx1 - cwx0, fy1 - cwy1, foam);
    // 剖面的切口線
    ctx.strokeStyle = alpha(shade(shellC, -0.5), dk ? 0.6 : 0.35); ctx.lineWidth = 1;
    roundRect(ctx, fx0 + 0.5, fy0 + 0.5, fx1 - fx0 - 1, fy1 - fy0 - 1, Math.max(2, rad - shellT));
    ctx.stroke();
    // 頂端的塑膠環（剖面）
    [[jx0 + 1, cwx0 + 1], [cwx1 - 1, jx1 - 1]].forEach(function (q) {
      const cgc = ctx.createLinearGradient(0, jy0, 0, jy0 + colH);
      cgc.addColorStop(0, shade(collar, dk ? 0.2 : 0.35)); cgc.addColorStop(0.4, collar); cgc.addColorStop(1, shade(collar, -0.25));
      ctx.fillStyle = cgc;
      roundRect(ctx, q[0], jy0, q[1] - q[0], colH, Math.min(3, colH / 2));
      ctx.fill();
    });
    // 內杯（金屬）：背面牆壁（含杯口後半圈的弧）
    const ix0 = X(-g.R), ix1 = X(g.R), iy0 = Y(g.H), iy1 = Y(0);
    const back = ctx.createLinearGradient(ix0, 0, ix1, 0);
    const can = shade(colors.muted, dk ? -0.38 : 0.6);
    back.addColorStop(0, shade(can, -0.3)); back.addColorStop(0.22, shade(can, 0.18)); back.addColorStop(0.3, shade(can, 0.32)); back.addColorStop(0.42, shade(can, 0.06)); back.addColorStop(0.75, can); back.addColorStop(1, shade(can, -0.32));
    ctx.fillStyle = back;
    ctx.beginPath();
    ctx.moveTo(ix0, iy1); ctx.lineTo(ix0, iy0);
    ctx.ellipse(g.cx, iy0, g.R * k, ry, 0, Math.PI, 2 * Math.PI);
    ctx.lineTo(ix1, iy1); ctx.closePath();
    ctx.fill();
    brushed(ix0, iy0 - ry, ix1 - ix0, iy1 - iy0 + ry, dk ? 0.05 : 0.09);
    // 杯底的陰影（杯內的角落較暗）
    const cb = ctx.createLinearGradient(0, iy1 - 2.2 * k, 0, iy1);
    cb.addColorStop(0, 'rgba(0,0,0,0)'); cb.addColorStop(1, alpha('#000000', dk ? 0.3 : 0.12));
    ctx.fillStyle = cb; ctx.fillRect(ix0, iy1 - 2.2 * k, ix1 - ix0, 2.2 * k);
    // 內杯的牆（剖面）：亮的金屬切面
    const wallC = shade(can, dk ? 0.25 : -0.12);
    const wgr = ctx.createLinearGradient(0, iy0, 0, iy1);
    wgr.addColorStop(0, shade(wallC, 0.25)); wgr.addColorStop(1, shade(wallC, -0.12));
    ctx.fillStyle = wgr;
    ctx.fillRect(cwx0, iy0, g.wall * k, iy1 - iy0 + g.wall * k);
    ctx.fillRect(ix1, iy0, g.wall * k, iy1 - iy0 + g.wall * k);
    ctx.fillRect(cwx0, iy1, (2 * g.R + 2 * g.wall) * k, g.wall * k);
    // 杯口捲邊（小圓珠）與杯口後半圈的邊
    const lipR = Math.max(1.2, g.wall * k * 0.6);
    LD.ball(ctx, X(-g.R - g.wall / 2), iy0, lipR, wallC, { shadow: false, glow: 0, ring: alpha(shade(wallC, -0.4), 0.6) });
    LD.ball(ctx, X(g.R + g.wall / 2), iy0, lipR, shade(wallC, -0.08), { shadow: false, glow: 0, ring: alpha(shade(wallC, -0.4), 0.6) });
    ctx.strokeStyle = alpha(shade(can, 0.55), 0.9);
    ctx.lineWidth = Math.max(1.5, g.wall * k * 0.8);
    ctx.beginPath(); ctx.ellipse(g.cx, iy0, (g.R + g.wall / 2) * k, ry, 0, Math.PI, 2 * Math.PI); ctx.stroke();

    // 水
    const yw = Y(wl.h);
    const wc = waterColor(TB);
    if (wl.h > 0.01) {
      const wg = ctx.createLinearGradient(0, yw, 0, iy1);
      wg.addColorStop(0, alpha(shade(wc, 0.2), dk ? 0.55 : 0.6));
      wg.addColorStop(0.35, alpha(wc, dk ? 0.62 : 0.66));
      wg.addColorStop(1, alpha(shade(wc, -0.22), dk ? 0.78 : 0.8));
      ctx.fillStyle = wg;
      ctx.fillRect(ix0, yw, ix1 - ix0, iy1 - yw);
      // 水中的光紋（很淡，攪拌時會動）
      const ph0 = (C.phase === 'run' && p.stir && !reducedMotion) ? now / 700 : 0;
      ctx.strokeStyle = alpha('#ffffff', dk ? 0.07 : 0.2);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let j = 0; j < 3; j++) {
        const yy = yw + (0.6 + j * 0.9) * k;
        if (yy > iy1 - 4) break;
        for (let xx = ix0 + 3; xx <= ix1 - 3; xx += 4) {
          const y2 = yy + Math.sin(xx * 0.09 + j * 2 + ph0) * 1.6;
          if (xx === ix0 + 3) ctx.moveTo(xx, y2); else ctx.lineTo(xx, y2);
        }
      }
      ctx.stroke();
    }

    // 攪拌棒（環形，後半圈在樣品後面）
    const stirring = p.stir && (C.phase === 'run');
    const yr = p.stir ? (stirring && !reducedMotion ? 1.2 + 2.6 * (1 - Math.cos(now / 1000 * 2 * Math.PI / 1.1)) : 1.2) : 1.2;
    const ringRx = (g.R - 0.45) * k, ringRy = ringRx * 0.16;
    const metal = shade(colors.muted, colors.dark ? 0.2 : -0.05);
    if (p.stir) {
      LD.tube(ctx, function (c) { c.ellipse(g.cx, Y(yr), ringRx, ringRy, 0, Math.PI, 2 * Math.PI); }, shade(metal, -0.15), 2.4);
    }

    // 樣品
    let sx = X(-0.25), sb, sTop;
    const sPx = side * k;
    if (C.phase === 'ready' || C.phase === 'drop') {
      const hang = g.H + 4.4;
      let yb = hang;
      if (C.phase === 'drop' && C.drop) {
        const u = Math.min(1, (now - C.drop.t0) / DROP_MS);
        const rest = waterLevel(g, p.m2 * 1000, side, p.ice, p.m1).bottom;
        yb = hang + (rest - hang) * u * u;
      }
      sb = Y(yb); sTop = sb - sPx;
      // 細線與小掛勾
      const hx = sx + sPx * 0.1, hy = sTop - sPx * 0.09;
      ctx.strokeStyle = alpha(colors.text, 0.5); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(hx, S.y); ctx.lineTo(hx, hy - 4.5); ctx.stroke();
      ctx.strokeStyle = shade(colors.muted, colors.dark ? 0.25 : -0.15); ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(hx, hy - 2.5, 2, 0, Math.PI * 2); ctx.stroke();
      glow(sx + sPx * 0.1, sb - sPx / 2, sPx * 0.95 + 10, TA, 1);
      cube(sx, sb, sPx, matColor(p.mat), p.ice ? 'ice' : p.mat === 'glass' ? 'glass' : p.mat === 'mys' ? 'mys' : 'metal');
      // 熱或冷的氣流（靜態示意）
      if (C.phase === 'ready' && (TA > 60 || TA < -5)) {
        ctx.strokeStyle = alpha(tcol(TA), 0.45); ctx.lineWidth = 1.4;
        for (let i = -1; i <= 1; i++) {
          const xx = sx + sPx * 0.1 + i * sPx * 0.28;
          ctx.beginPath();
          if (TA > 60) { const y0 = sTop - sPx * 0.25 - 4; ctx.moveTo(xx, y0); ctx.bezierCurveTo(xx + 5, y0 - 8, xx - 5, y0 - 14, xx, y0 - 22); }
          else { const y0 = sb + 4; ctx.moveTo(xx, y0); ctx.bezierCurveTo(xx + 4, y0 + 7, xx - 4, y0 + 12, xx, y0 + 18); }
          ctx.stroke();
        }
      }
    } else if (side > 0.02) {
      sb = Y(wl.bottom); sTop = sb - sPx;
      glow(sx + sPx * 0.1, sb - sPx / 2, sPx * 0.95 + 12, TA, 1);
      cube(sx, sb, sPx, matColor(p.mat), p.ice ? 'ice' : p.mat === 'glass' ? 'glass' : p.mat === 'mys' ? 'mys' : 'metal');
    } else { sb = Y(wl.bottom); sTop = sb; }

    // 水的前景（讓水中的東西看起來在水裡）與水面
    if (wl.h > 0.01) {
      ctx.fillStyle = alpha(wc, colors.dark ? 0.22 : 0.2);
      ctx.fillRect(ix0, yw, ix1 - ix0, iy1 - yw);
      const sg = ctx.createLinearGradient(0, yw - ry, 0, yw + ry);
      sg.addColorStop(0, alpha(shade(wc, 0.5), 0.75));
      sg.addColorStop(1, alpha(shade(wc, 0.1), 0.55));
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.ellipse(g.cx, yw, g.R * k, ry, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = alpha(shade(wc, 0.7), 0.8); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(g.cx, yw, g.R * k, ry, 0, 0, Math.PI); ctx.stroke();
      // 浮冰在水面上的部分重畫，避免被水面蓋住
      if (inCup && p.ice && side > 0.02 && wl.bottom > 0) {
        ctx.save(); ctx.beginPath(); ctx.rect(S.x, S.y, S.w, yw - S.y); ctx.clip();
        cube(sx, sb, sPx, matColor('ice'), 'ice');
        ctx.restore();
      }
    }
    // 杯中的水結冰：水面的冰層
    if (crust > 1e-5 && wl.h > 0) {
      const th = Math.max(2, crust * 1000 / 0.917 / (Math.PI * g.R * g.R) * k);
      ctx.fillStyle = alpha(matColor('ice'), 0.85);
      ctx.beginPath(); ctx.ellipse(g.cx, yw, g.R * k, ry, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(ix0, yw - th, ix1 - ix0, th);
      ctx.beginPath(); ctx.ellipse(g.cx, yw - th, g.R * k, ry, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(g.cx, yw - th, g.R * k, ry, 0, Math.PI, 2 * Math.PI); ctx.stroke();
    }
    // 沸騰：氣泡與水蒸氣（純示意）
    if (ph && ph.gasB > 1e-6 && !reducedMotion && C.phase === 'run') {
      bubbles(ix0 + 8, ix1 - 8, yw + 4, iy1 - 4, now, 14);
      steam(g.cx, yw - 6, g.R * k, now);
    }
    // 熱流箭頭（從熱的一方指向冷的一方，越淡表示熱流越小）
    if (inCup && side > 0.02 && C.P0 > 1e-9 && Math.abs(flowP) > 1e-6) {
      const a = Math.min(1, Math.abs(flowP) / C.P0);
      heatArrows(sx + sPx * 0.1, sb - sPx / 2, sPx / 2 + 3, flowP > 0, a, now);
    }
    // 攪拌棒（前半圈與握把）
    if (p.stir) {
      LD.tube(ctx, function (c) { c.ellipse(g.cx, Y(yr), ringRx, ringRy, 0, 0, Math.PI); }, metal, 2.6);
      const rx = X(-g.R + 0.6), rTop = Y(g.H + 4 + yr);
      LD.tube(ctx, function (c) { c.moveTo(rx, Y(yr)); c.lineTo(rx, rTop); }, metal, 3.2);
      // 塑膠握把（有防滑紋）
      const hw = Math.max(6, 0.55 * k), hh = Math.max(12, 1.4 * k);
      const hc = colors.dark ? mix(colors.muted, colors['canvas-bg'], 0.25) : shade(colors.muted, -0.35);
      const hg = ctx.createLinearGradient(rx - hw / 2, 0, rx + hw / 2, 0);
      hg.addColorStop(0, shade(hc, 0.1)); hg.addColorStop(0.3, shade(hc, colors.dark ? 0.35 : 0.45)); hg.addColorStop(1, shade(hc, -0.3));
      ctx.fillStyle = hg;
      roundRect(ctx, rx - hw / 2, rTop - hh * 0.75, hw, hh, Math.min(3, hw / 2));
      ctx.fill();
      ctx.strokeStyle = alpha('#000000', colors.dark ? 0.35 : 0.2); ctx.lineWidth = 1;
      ctx.beginPath();
      for (let j = 1; j <= 3; j++) { const yy = Math.round(rTop - hh * 0.75 + hh * j / 4) + 0.5; ctx.moveTo(rx - hw / 2 + 1, yy); ctx.lineTo(rx + hw / 2 - 1, yy); }
      ctx.stroke();
    }
    // 溫度計（在水中）
    const tx = X(g.R - 0.85);
    const lab = 'T_{2} = ' + num(TB, 2) + ' °C';
    thermometer(tx, Y(1.0), Y(g.H + 3.2), Math.max(5, 0.45 * k), TB, lab, true);
    // 隔熱套頂環的前緣高光
    ctx.fillStyle = alpha('#ffffff', colors.dark ? 0.12 : 0.45);
    ctx.fillRect(jx0 + 3, jy0, cwx0 - jx0 - 4, 1);
    ctx.fillRect(cwx1 + 1, jy0, jx1 - cwx1 - 4, 1);

    // 樣品溫度標籤
    const lx = L.wide ? S.x + 10 : S.x + 6;
    ctx.textAlign = 'left';
    const f1 = font(700, L.wide ? 12 : 11), f2 = font(600, L.wide ? 12 : 11);
    const sName = (p.mys ? T('神秘金屬', 'Mystery metal') : matName(p.mat)) + ' ' + num(p.m1 * 1000, p.m1 < 0.1 ? 1 : 0) + ' g';
    if (C.phase === 'ready' || C.phase === 'drop') {
      pill(sName, lx, S.y + 14, colors.muted, f2, 0.75);
      pill('T_{1} = ' + num(TA, 2) + ' °C', lx, S.y + 14 + (L.wide ? 22 : 19), colors['b-mech'], f1, 0.85);
    } else {
      pill(sName, lx, S.y + 14, colors.muted, f2, 0.75);
      pill('T_{1} = ' + num(TA, 2) + ' °C', lx, S.y + 14 + (L.wide ? 22 : 19), colors['b-mech'], f1, 0.85);
      if (ph && (p.ice || ph.iceB > 1e-6)) pill((p.ice ? T('冰 ', 'Ice ') + grams(ph.iceA) : '') + (ph.iceB > 1e-6 ? (p.ice ? T('，', ', ') : '') + T('水結冰 ', 'frozen water ') + grams(ph.iceB) : ''), lx, S.y + 14 + 2 * (L.wide ? 22 : 19), colors.neg, f2, 0.8);
    }
    // 時間與狀態
    const tt = sim ? sim.t : 0;
    pill('t = ' + num(tt, 1) + ' s' + (state.speed.cal !== 1 ? '  (' + state.speed.cal + '×)' : ''), lx, S.y + S.h - 13, colors.text, f1, 0.8);
    if (L.wide) {
      ctx.textAlign = 'right';
      pill(T('剖面圖・依比例', 'Cut-away, to scale'), S.x + S.w - 10, S.y + S.h - 13, colors.muted, font(0, 11), 0.7);
    }
    drawEffects(X, Y);
    ctx.restore();
  }

  function bubbles(x0, x1, y0, y1, now, n) {
    ctx.strokeStyle = alpha(colors.surface, 0.8);
    ctx.lineWidth = 1;
    for (let i = 0; i < n; i++) {
      const ph = ((now / 1000) * (0.6 + (i % 5) * 0.13) + i * 0.37) % 1;
      const x = x0 + ((i * 0.618) % 1) * (x1 - x0) + Math.sin(now / 300 + i) * 2;
      const y = y1 - ph * (y1 - y0);
      const r = 1.2 + (i % 3) * 0.8 + ph * 1.2;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    }
  }
  function steam(cx, y, w, now) {
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const ph = ((now / 1000) * 0.35 + i * 0.25) % 1;
      const x = cx + (i - 1.5) * w * 0.4;
      ctx.strokeStyle = alpha(colors.muted, 0.35 * (1 - ph));
      ctx.beginPath();
      ctx.moveTo(x, y - ph * 30);
      ctx.bezierCurveTo(x + 6, y - ph * 30 - 8, x - 6, y - ph * 30 - 16, x + 2, y - ph * 30 - 24);
      ctx.stroke();
    }
  }
  /** 熱流箭頭：四周的波浪小箭頭，out = true 由樣品向外 */
  function heatArrows(cx, cy, r, out, a, now) {
    const col = colors['b-thermo'];
    const shift = reducedMotion ? 0.5 : ((now / 900) % 1);
    const n = 6;
    for (let i = 0; i < n; i++) {
      const ang = -Math.PI / 2 + (i - (n - 1) / 2) * (Math.PI * 1.7 / n) + (i % 2 ? 0.12 : -0.12);
      const ux = Math.cos(ang), uy = Math.sin(ang);
      const len = 16 + 8 * a;
      const s0 = r + 4 + shift * 7;
      const p0 = [cx + ux * s0, cy + uy * s0], p1 = [cx + ux * (s0 + len), cy + uy * (s0 + len)];
      const from = out ? p0 : p1, to = out ? p1 : p0;
      const dx = to[0] - from[0], dy = to[1] - from[1], l = Math.hypot(dx, dy), vx = dx / l, vy = dy / l;
      ctx.strokeStyle = alpha(col, 0.85 * a);
      ctx.fillStyle = alpha(col, 0.85 * a);
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let j = 0; j <= 8; j++) {
        const u = j / 8, w = Math.sin(u * Math.PI * 2) * 2.2;
        const x = from[0] + dx * u * 0.8 - vy * w, y = from[1] + dy * u * 0.8 + vx * w;
        if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
      const hx = from[0] + dx * 0.8, hy = from[1] + dy * 0.8;
      ctx.beginPath();
      ctx.moveTo(to[0], to[1]);
      ctx.lineTo(hx - vy * 3.6, hy + vx * 3.6);
      ctx.lineTo(hx + vy * 3.6, hy - vx * 3.6);
      ctx.closePath();
      ctx.fill();
    }
  }

  function splashFx(p) {
    const now = performance.now();
    state.fx.push({ type: 'splash', t0: now, dur: 700, seed: Math.random() * 10 });
    if (p.T1 > 100) state.fx.push({ type: 'puff', t0: now, dur: 1400 });
  }
  function drawEffects(X, Y) {
    const now = performance.now();
    state.fx = state.fx.filter(function (e) { return now - e.t0 < e.dur; });
    if (state.mode !== 'cal' || !state.fx.length) return;
    const g = calGeom(), p = state.cal.p;
    if (!p) return;
    const yw = Y(waterLevel(g, p.m2 * 1000, 0, false, 0).h);
    state.fx.forEach(function (e) {
      const u = (now - e.t0) / e.dur;
      if (e.type === 'splash') {
        const wc = waterColor(p.T2);
        ctx.fillStyle = alpha(shade(wc, 0.2), 0.8 * (1 - u));
        for (let i = 0; i < 12; i++) {
          const a = -Math.PI / 2 + (i - 5.5) * 0.2 + Math.sin(e.seed + i) * 0.08;
          const v = 70 + ((i * 37) % 50);
          const tt = u * 0.7;
          const x = X(-0.25) + Math.cos(a) * v * tt;
          const y = yw + Math.sin(a) * v * tt + 260 * tt * tt;
          ctx.beginPath(); ctx.arc(x, y, 2.2 - u, 0, Math.PI * 2); ctx.fill();
        }
        ctx.strokeStyle = alpha(shade(wc, 0.5), 0.7 * (1 - u));
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(X(-0.25), yw, Math.min(g.R * calGeom().k, 10 + 60 * u), Math.min(g.R * calGeom().k, 10 + 60 * u) * 0.16, 0, 0, Math.PI * 2); ctx.stroke();
      } else if (e.type === 'puff') {
        ctx.fillStyle = alpha(colors.muted, 0.28 * (1 - u));
        for (let i = 0; i < 6; i++) {
          const x = X(-0.25) + (i - 2.5) * 9 + Math.sin(i * 2 + u * 4) * 4;
          const y = yw - 6 - u * 46 - (i % 3) * 6;
          ctx.beginPath(); ctx.arc(x, y, 6 + u * 10, 0, Math.PI * 2); ctx.fill();
        }
      }
    });
  }

  // ---------- 共用：溫度–時間圖 ----------
  function graphFrame(R, x1, y0, y1, title, titleColor) {
    const pad = { l: L.wide ? 42 : 36, r: 10, t: 28, b: 24 };
    const P = { x: R.x + pad.l, y: R.y + pad.t, w: R.w - pad.l - pad.r, h: R.h - pad.t - pad.b };
    const gx = function (t) { return P.x + t / x1 * P.w; };
    const gy = function (v) { return P.y + (y1 - v) / (y1 - y0) * P.h; };
    const px = function (v) { return Math.round(v) + 0.5; };
    // 格線
    const ys = niceStep((y1 - y0) / (L.wide ? 6 : 5));
    const xs = niceStep(x1 / (L.wide ? 6 : 4));
    ctx.lineWidth = 1;
    ctx.strokeStyle = alpha(colors.text, 0.035);
    ctx.beginPath();
    for (let v = Math.ceil(y0 / (ys / 2)) * ys / 2; v <= y1 + 1e-9; v += ys / 2) { ctx.moveTo(P.x, px(gy(v))); ctx.lineTo(P.x + P.w, px(gy(v))); }
    ctx.stroke();
    ctx.strokeStyle = alpha(colors.text, 0.09);
    ctx.beginPath();
    for (let v = Math.ceil(y0 / ys - 1e-9) * ys; v <= y1 + 1e-9; v += ys) { ctx.moveTo(P.x, px(gy(v))); ctx.lineTo(P.x + P.w, px(gy(v))); }
    for (let t = 0; t <= x1 + 1e-9; t += xs) { ctx.moveTo(px(gx(t)), P.y); ctx.lineTo(px(gx(t)), P.y + P.h); }
    ctx.stroke();
    // 軸
    ctx.strokeStyle = alpha(colors.muted, 0.75);
    ctx.beginPath();
    ctx.moveTo(px(P.x), P.y - 4); ctx.lineTo(px(P.x), P.y + P.h); ctx.lineTo(P.x + P.w + 4, px(P.y + P.h));
    ctx.stroke();
    // 刻度數字
    const f = font(0, 11);
    ctx.font = f;
    ctx.fillStyle = alpha(colors.muted, 0.95);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const yd = ys < 1 ? 1 : 0;
    for (let v = Math.ceil(y0 / ys - 1e-9) * ys; v <= y1 + 1e-9; v += ys) ctx.fillText(num(v, yd), P.x - 5, gy(v));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const xd = xs < 1 ? 1 : 0;
    let lastX = -1e9;
    const unitW = ctx.measureText('t (s)').width + 16;
    for (let t = 0; t <= x1 + 1e-9; t += xs) {
      const x = gx(t), s = num(t, xd), w = ctx.measureText(s).width;
      if (x - w / 2 < lastX + 6 || x + w / 2 > P.x + P.w - unitW) continue;
      ctx.fillText(s, x, P.y + P.h + 5);
      lastX = x + w / 2;
    }
    ctx.textAlign = 'right';
    ctx.font = font(600, 11);
    ctx.fillText('t (s)', P.x + P.w + 2, P.y + P.h + 5);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('T (°C)', P.x + 4, P.y - 10);
    // 標題
    ctx.textAlign = 'right';
    pill(title, R.x + R.w - 8, R.y + 13, titleColor || colors.text, font(700, L.wide ? 12 : 11), 0.85);
    return { P: P, gx: gx, gy: gy, x1: x1, y0: y0, y1: y1 };
  }
  function yRange(lo, hi) {
    if (hi - lo < 4) { const m = (hi + lo) / 2; lo = m - 2; hi = m + 2; }
    const padV = (hi - lo) * 0.06;
    lo -= padV; hi += padV;
    const s = roundStep((hi - lo) / 6);
    return [Math.floor(lo / s) * s, Math.ceil(hi / s) * s];
  }
  function mapPts(G, arr, j) {
    const out = [];
    for (let i = 0; i < arr.length; i++) { const s = arr[i]; if (s[0] <= G.x1 + 1e-9) out.push([G.gx(s[0]), G.gy(s[j])]); }
    return out;
  }

  // ---------- 量熱器：溫度–時間圖 ----------
  function drawCalGraph() {
    const R = L.graph, C = state.cal, pr = C.pred;
    const p = C.phase === 'ready' ? calParams() : C.p;
    let lo = Math.min(p.T1, p.T2), hi = Math.max(p.T1, p.T2);
    let x1 = pr.tEnd;
    C.ghosts.forEach(function (gh) {
      x1 = Math.max(x1, gh.tEnd);
      gh.a.concat(gh.b).forEach(function (s) { lo = Math.min(lo, s[1]); hi = Math.max(hi, s[1]); });
    });
    if (p.loss) lo = Math.min(lo, TENV);
    x1 = niceCeil(x1);
    const yr = yRange(lo, hi);
    clipRegion(R);
    const G = graphFrame(R, x1, yr[0], yr[1], T('溫度–時間圖', 'Temperature–time graph'), colors.text);
    ctx.save();
    ctx.beginPath(); ctx.rect(G.P.x, G.P.y - 6, G.P.w + 6, G.P.h + 8); ctx.clip();
    // 先前的實驗（變淡）
    C.ghosts.forEach(function (gh) {
      polyline(mapPts(G, gh.a, 1), alpha(colors['b-mech'], 0.28), 1.5);
      polyline(mapPts(G, gh.b, 1), alpha(colors.neg, 0.28), 1.5);
    });
    // 預測的平衡溫度
    if (!p.mys && !p.loss && isFinite(pr.Tf)) {
      const y = Math.round(G.gy(pr.Tf)) + 0.5;
      ctx.strokeStyle = alpha(colors.probe, 0.8);
      ctx.lineWidth = 1.3;
      ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.moveTo(G.P.x, y); ctx.lineTo(G.P.x + G.P.w, y); ctx.stroke();
      ctx.setLineDash([]);
    }
    if (p.loss) {
      const y = Math.round(G.gy(TENV)) + 0.5;
      ctx.strokeStyle = alpha(colors.muted, 0.6);
      ctx.setLineDash([2, 4]);
      ctx.beginPath(); ctx.moveTo(G.P.x, y); ctx.lineTo(G.P.x + G.P.w, y); ctx.stroke();
      ctx.setLineDash([]);
    }
    // 預測曲線（虛線，神秘金屬不顯示）
    const tNow = C.sim ? C.sim.t : 0;
    if (!p.mys) {
      const fut = pr.curve.filter(function (s) { return s[0] >= tNow; });
      polyline(mapPts(G, fut, 1), alpha(colors['b-mech'], 0.4), 1.3, [4, 5]);
      polyline(mapPts(G, fut, 2), alpha(colors.neg, 0.4), 1.3, [4, 5]);
    }
    // 這次的曲線
    if (C.samples.length > 1) {
      tube(mapPts(G, C.samples, 1), L.wide ? 3 : 2.6, shade(colors['b-mech'], colors.dark ? -0.1 : -0.12), alpha(shade(colors['b-mech'], 0.55), 0.8));
      tube(mapPts(G, C.samples, 2), L.wide ? 3 : 2.6, shade(colors.neg, colors.dark ? -0.1 : -0.12), alpha(shade(colors.neg, 0.55), 0.8));
    }
    // 目前的點
    const s0 = C.sim ? HC.mixState(C.sim) : null;
    const TA = s0 ? s0.TA : p.T1, TB = s0 ? s0.TB : p.T2;
    sphereSmall(G.gx(tNow), G.gy(TA), colors['b-mech']);
    sphereSmall(G.gx(tNow), G.gy(TB), colors.neg);
    // 熱平衡的時刻
    if (C.eqDone && C.eqT != null) {
      const x = Math.round(G.gx(C.eqT)) + 0.5;
      ctx.strokeStyle = alpha(colors.probe, 0.7);
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(x, G.P.y); ctx.lineTo(x, G.P.y + G.P.h); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
    // 標籤
    const f = font(700, L.wide ? 12 : 11);
    if (!p.mys && !p.loss && isFinite(pr.Tf)) {
      ctx.textAlign = 'right';
      const yT = G.gy(pr.Tf), nearB = Math.abs(G.gy(TB) - yT) < 12 && tNow > x1 * 0.75;
      pill(T('預測 T', 'Predicted T') + '_{f} = ' + num(pr.Tf, 2) + ' °C', G.P.x + G.P.w - 4, yT + (nearB || yT < G.P.y + 16 ? 12 : -11), colors.probe, f, 0.88);
    }
    if (p.loss) {
      ctx.textAlign = 'left';
      pill(T('室溫 25 °C', 'Room 25 °C'), G.P.x + 6, G.gy(TENV) + 11, colors.muted, font(600, 11), 0.8);
    }
    if (C.eqDone && C.eqT != null) {
      ctx.textAlign = 'center';
      const x = Math.min(G.P.x + G.P.w - 50, Math.max(G.P.x + 50, G.gx(C.eqT)));
      pill(T('熱平衡', 'Equilibrium') + ' t = ' + num(C.eqT, 1) + ' s', x, G.P.y + 8, colors.probe, font(600, 11), 0.9);
    }
    // 曲線末端的名稱
    ctx.textAlign = 'left';
    const xl = Math.min(G.gx(tNow) + 9, G.P.x + G.P.w - 60);
    if (Math.abs(G.gy(TA) - G.gy(TB)) > 16) {
      pill('T_{1}', xl, G.gy(TA), colors['b-mech'], f, 0.8);
      pill('T_{2}', xl, G.gy(TB), colors.neg, f, 0.8);
    }
    ctx.restore();
  }

  // ---------- 量熱器：熱量長條圖 ----------
  function segLabel(seg, sign, who) {
    if (seg.kind === 'lat') {
      if (seg.i === 0) return sign > 0 ? T('熔化', 'melting') : T('結冰', 'freezing');
      return sign > 0 ? T('汽化', 'boiling') : T('凝結', 'condensing');
    }
    if (who === 'h2o') {
      const nm = [T('冰', 'ice'), T('水', 'water'), T('水蒸氣', 'steam')][seg.p];
      return nm + (sign > 0 ? T('升溫', ' warming') : T('降溫', ' cooling'));
    }
    return sign > 0 ? T('升溫', 'warming') : T('降溫', 'cooling');
  }
  function drawCalInfo() {
    const R = L.info, C = state.cal, pr = C.pred;
    const p = C.phase === 'ready' ? calParams() : C.p;
    clipRegion(R);
    const sim = C.sim;
    const HA0 = pr.HA0, HB0 = pr.HB0;
    const HA = sim ? sim.HA : HA0, HB = sim ? sim.HB : HB0;
    const A = sim ? sim.A : pr.A, B = sim ? sim.B : pr.B;
    const QA = HA - HA0, QB = HB - HB0, Ql = sim ? sim.Qloss : 0;
    const QAf = pr.eq.H[0] - HA0;
    const scale = Math.max(Math.abs(QAf), Math.abs(QA), Math.abs(QB) + Math.abs(Ql), 1e-9);
    const fT = font(700, L.wide ? 12 : 11), f = font(600, L.wide ? 11 : 10);
    ctx.textAlign = 'left';
    pill(T('熱量的帳目', 'Heat account'), R.x + 8, R.y + 13, colors.text, fT, 0.85);
    ctx.font = font(600, L.wide ? 12 : 11);
    const nm0 = p.mys ? T('神秘金屬', 'Mystery') : matName(p.mat), wn0 = p.Ccup > 0 ? T('水＋杯', 'Water+cup') : T('水', 'Water');
    const labW = Math.min(R.w * 0.42, Math.max(L.wide ? 92 : 70, 10 + Math.max.apply(null, [nm0 + T(' 放熱', ' gives'), nm0 + T(' 吸熱', ' takes'), wn0 + T(' 吸熱', ' takes'), wn0 + T(' 放熱', ' gives'), p.loss ? T('散失到室內', 'Lost to room') : ''].map(function (t) { return ctx.measureText(t).width; }))));
    const x0 = R.x + 10 + labW, wMax = R.w - labW - 26;
    const rows = p.loss ? 3 : 2;
    const top = R.y + 30, bottom = R.y + R.h - 22;
    const rh = Math.min(30, (bottom - top) / rows);
    const bh = Math.min(16, rh * 0.62);
    function bar(row, segs, base, label, total, finalLen) {
      const y = top + rh * row + (rh - bh) / 2;
      ctx.textAlign = 'left';
      ctx.font = font(600, L.wide ? 12 : 11);
      ctx.fillStyle = colors.text;
      ctx.textBaseline = 'middle';
      ctx.fillText(label, R.x + 10, y + bh / 2);
      // 槽
      ctx.fillStyle = alpha(colors.text, 0.06);
      roundRect(ctx, x0, y, wMax, bh, 4); ctx.fill();
      if (finalLen != null && finalLen > 0) {
        ctx.strokeStyle = alpha(base, 0.6); ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
        roundRect(ctx, x0 + 0.5, y + 0.5, Math.min(wMax, finalLen / scale * wMax) - 1, bh - 1, 4); ctx.stroke();
        ctx.setLineDash([]);
      }
      let x = x0;
      ctx.save();
      roundRect(ctx, x0, y, wMax, bh, 4); ctx.clip();
      segs.forEach(function (s, i) {
        const w = Math.abs(s.Q) / scale * wMax;
        if (w < 0.3) return;
        const col = s.color || base;
        const g = ctx.createLinearGradient(0, y, 0, y + bh);
        g.addColorStop(0, shade(col, 0.22)); g.addColorStop(1, shade(col, -0.12));
        ctx.fillStyle = g;
        ctx.fillRect(x, y, w, bh);
        if (s.kind === 'lat') hatch(x, y, w, bh, alpha(colors['canvas-bg'], 0.55));
        if (i > 0) { ctx.fillStyle = alpha(colors['canvas-bg'], 0.8); ctx.fillRect(x, y, 1, bh); }
        ctx.font = font(600, 10);
        if (s.label && w > ctx.measureText(s.label).width + 8) {
          ctx.textAlign = 'center';
          ctx.fillStyle = colors.dark ? alpha('#000000', 0.75) : alpha('#ffffff', 0.92);
          ctx.fillText(s.label, x + w / 2, y + bh / 2 + 0.5);
        }
        x += w;
      });
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(x0, y, x - x0, 1);
      ctx.restore();
      ctx.textAlign = 'left';
      ctx.font = font(700, L.wide ? 12 : 11);
      ctx.fillStyle = base;
      const txt = fmtQ(Math.abs(total));
      const tw = ctx.measureText(txt).width;
      const tx = x + 5 + tw < x0 + wMax ? x + 5 : x0 + wMax - tw - 4;
      if (x + 5 + tw < x0 + wMax) ctx.fillText(txt, tx, y + bh / 2 + 0.5);
      else pill(txt, tx + 2, y + bh / 2, base, font(700, L.wide ? 12 : 11), 0.85);
    }
    // 樣品
    const hA = A.sub.id;
    const segA = HC.decompose(A, HA0, HA).map(function (s, i) {
      return { Q: s.Q, kind: s.kind, label: segLabel(s, Math.sign(s.Q), hA), color: s.kind === 'sens' && hA === 'h2o' ? (s.p === 0 ? shade(colors['b-mech'], 0.25) : s.p === 2 ? shade(colors['b-mech'], -0.2) : colors['b-mech']) : null, i: i };
    });
    const signA = QA < -1e-9 ? -1 : QA > 1e-9 ? 1 : (QAf < 0 ? -1 : 1);
    const nameA = p.mys ? T('神秘金屬', 'Mystery') : matName(p.mat);
    bar(0, segA, colors['b-mech'], nameA + (signA < 0 ? T(' 放熱', ' gives') : T(' 吸熱', ' takes')), QA, p.mys || p.loss ? null : Math.abs(QAf));
    // 水＋杯：把顯熱段依熱容量分給水與杯子
    const segB = [];
    HC.decompose(B, HB0, HB).forEach(function (s) {
      if (s.kind === 'lat' || !(p.Ccup > 0)) { segB.push({ Q: s.Q, kind: s.kind, label: segLabel(s, Math.sign(s.Q), 'h2o'), color: s.kind === 'sens' && s.p === 0 ? shade(colors.neg, 0.3) : null }); return; }
      const c = HC.SUBSTANCES.h2o.phases[s.p].c * p.m2, Ct = c + p.Ccup;
      segB.push({ Q: s.Q * c / Ct, kind: 'sens', label: segLabel(s, Math.sign(s.Q), 'h2o'), color: s.p === 0 ? shade(colors.neg, 0.3) : null });
      segB.push({ Q: s.Q * p.Ccup / Ct, kind: 'sens', label: T('杯', 'cup'), color: colors.muted });
    });
    const signB = QB > 1e-9 ? 1 : QB < -1e-9 ? -1 : (QAf > 0 ? -1 : 1);
    bar(1, segB, colors.neg, (p.Ccup > 0 ? T('水＋杯', 'Water+cup') : T('水', 'Water')) + (signB > 0 ? T(' 吸熱', ' takes') : T(' 放熱', ' gives')), QB, p.mys || p.loss ? null : Math.abs(pr.eq.H[1] - HB0));
    if (p.loss) bar(2, [{ Q: Ql, kind: 'sens', label: '' }], colors.muted, Ql >= 0 ? T('散失到室內', 'Lost to room') : T('從室內吸收', 'From room'), Ql, null);
    // 空間足夠時：列出計算式（Q = mcΔT 或各段的熱量）
    const free = (R.y + R.h - 24) - (top + rh * rows);
    if (sim && free >= 44) {
      const fl = font(600, L.wide ? 11 : 10);
      const lines = [];
      const sA = HC.mixState(sim);
      if (segA.length === 1 && segA[0].kind === 'sens' && !p.mys) lines.push(['Q_{1} = m_{1}c_{1}ΔT_{1} = ' + num(p.m1, 3) + ' × ' + cOf(p.mat) + ' × (' + num(sA.TA, 2) + ' − ' + num(p.T1, 2) + ') = ' + fmtQ(QA), colors['b-mech']]);
      else if (segA.length > 1) lines.push([[nameA + T('：', ':')].concat(segA.map(function (q) { return q.label + ' ' + fmtQ(Math.abs(q.Q), 1); })), colors['b-mech']]);
      if (segB.length && segB.every(function (q) { return q.kind === 'sens'; }) && HC.decompose(B, HB0, HB).length === 1)
        lines.push([(p.Ccup > 0 ? 'Q_{2} = (m_{2}c_{2} + C_{' + T('杯', 'cup') + '})ΔT_{2} = ' : 'Q_{2} = m_{2}c_{2}ΔT_{2} = ') + num(p.m2 * HC.C_WATER + p.Ccup, 1) + ' × (' + num(sA.TB, 2) + ' − ' + num(p.T2, 2) + ') = ' + fmtQ(QB), colors.neg]);
      else if (segB.length > 1) lines.push([[T('水＋杯：', 'Water+cup:')].concat(segB.map(function (q) { return q.label + ' ' + fmtQ(Math.abs(q.Q), 1); })), colors.neg]);
      let yy = top + rh * rows + 14, left = Math.floor(free / 18);
      ctx.textAlign = 'left';
      lines.forEach(function (ln) {
        if (left <= 0) return;
        const n = flowText(Array.isArray(ln[0]) ? ln[0] : [ln[0]], R.x + 10, yy, R.w - 20, ln[1], fl, left);
        yy += n * 18; left -= n;
      });
    }
    // 等式
    ctx.textAlign = 'left';
    let eqTxt;
    if (!sim) eqTxt = T('放入樣品後，放出的熱 ＝ 吸收的熱', 'Once the sample is in: heat given out = heat taken in');
    else if (!p.loss) eqTxt = T('放出 ', 'Given out ') + fmtQ(Math.abs(QA)) + T(' ＝ 吸收 ', ' = taken in ') + fmtQ(Math.abs(QB));
    else eqTxt = (signA < 0 ? T('樣品放出 ', 'Sample gives ') + fmtQ(Math.abs(QA)) + T(' ＝ 水吸收 ', ' = water takes ') + fmtQ(QB) + T(' ＋ 散失 ', ' + lost ') + fmtQ(Ql)
      : T('水放出 ', 'Water gives ') + fmtQ(-QB) + T(' ＝ 樣品吸收 ', ' = sample takes ') + fmtQ(QA) + T(' ＋ 散失 ', ' + lost ') + fmtQ(Ql));
    pill(eqTxt, R.x + 10, R.y + R.h - 12, colors.text, f, 0.85);
    ctx.restore();
  }

  // ---------- 加熱曲線：裝置 ----------
  function heatGeom() {
    const S = L.scene, pad = L.wide ? 14 : 8;
    const k = Math.min((S.w - 2 * pad) / 20, (S.h - 2 * pad) / 27);
    return { k: k, cx: S.x + S.w * 0.56, yb: S.y + S.h - pad - 2.2 * k, R: 5, H: 15 };
  }
  function drawHeatScene() {
    const S = L.scene, Hh = state.heat, g = heatGeom(), k = g.k;
    const p = Hh.phase === 'ready' ? heatParams() : Hh.p;
    const X = function (x) { return g.cx + x * k; };
    const Y = function (y) { return g.yb - y * k; };
    const now = performance.now();
    clipRegion(S);
    const su = Hh.body ? null : Hh.pred.su;
    const body = Hh.body || su.b, H = Hh.body ? Hh.H : su.H0;
    const st = HC.stateOf(body, H);
    const Tn = st.T;
    const running = Hh.phase === 'run';
    const on = running;
    const glowK = on ? Math.min(1, 0.25 + p.P / 2000) : 0;
    const hot = mix(colors['b-thermo'], colors.equi, 0.35);
    const metal = shade(colors.muted, colors.dark ? 0.1 : -0.05);
    const loss = p.loss;
    const dk = colors.dark;
    // 實驗桌（物體的底放在桌面上）與接觸陰影
    const objBottom = p.h2o ? Y(0) + (loss ? 0 : 1.4 * k) : Y(0) + (loss ? 0 : 1.3 * k * 0.6);
    bench(S, objBottom - Math.max(10, 0.9 * k));
    // 電源供應器（放在牆上的小層架上）
    const bx = S.x + (L.wide ? 12 : 8), by = S.y + (L.wide ? 12 : 8), bw = Math.max(86, 9 * k), bh2 = Math.max(40, 4.4 * k);
    const shelfC = dk ? mix(colors.muted, colors['canvas-bg'], 0.45) : mix(colors.muted, colors.surface, 0.55);
    LD.block(ctx, S.x - 8, by + bh2, bx - S.x + bw + 20, 5, shelfC, { r: 2 });
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,' + (dk ? 0.5 : 0.18) + ')'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2;
    metalBox(bx, by, bw, bh2, 7, dk ? shade(colors.muted, -0.42) : shade(colors.muted, 0.55));
    ctx.restore();
    // 顯示幕（深色液晶，帶玻璃反光）
    const dxL = bx + 7, dyL = by + 7, dwL = bw - 26, dhL = bh2 - 14;
    const lcd = ctx.createLinearGradient(0, dyL, 0, dyL + dhL);
    lcd.addColorStop(0, '#0e1b19'); lcd.addColorStop(1, '#08110f');
    ctx.fillStyle = lcd;
    roundRect(ctx, dxL, dyL, dwL, dhL, 4); ctx.fill();
    ctx.strokeStyle = alpha('#000000', dk ? 0.6 : 0.35); ctx.lineWidth = 1;
    roundRect(ctx, dxL + 0.5, dyL + 0.5, dwL - 1, dhL - 1, 4); ctx.stroke();
    ctx.font = font(700, L.wide ? 13 : 12);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const digit = shade(colors.probe, dk ? 0.15 : 0.35);
    if (on) { ctx.save(); ctx.shadowColor = alpha(digit, 0.8); ctx.shadowBlur = 6; }
    ctx.fillStyle = on ? digit : alpha(digit, 0.4);
    ctx.fillText(num(p.P, p.P < 100 ? 1 : 0) + ' W', dxL + dwL / 2, dyL + dhL / 2 + 0.5);
    if (on) ctx.restore();
    ctx.save();
    roundRect(ctx, dxL, dyL, dwL, dhL, 4); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.beginPath(); ctx.moveTo(dxL, dyL); ctx.lineTo(dxL + dwL * 0.55, dyL); ctx.lineTo(dxL + dwL * 0.3, dyL + dhL); ctx.lineTo(dxL, dyL + dhL); ctx.closePath(); ctx.fill();
    ctx.restore();
    // 指示燈與紅色接線柱（電線由這裡接出）
    const ledX = bx + bw - 10;
    LD.ball(ctx, ledX, by + bh2 * 0.3, 3, on ? colors.pos : shade(colors.muted, dk ? -0.2 : 0.1), { shadow: false, glow: on ? 0.6 : 0 });
    LD.ball(ctx, ledX, by + bh2 * 0.72, 4, mix(colors.pos, '#000000', 0.15), { glow: 0 });
    const leadStart = [ledX, by + bh2 * 0.72];

    let thX, thBulbY;
    if (p.h2o) {
      // 燒杯（玻璃）＋（無散熱時）隔熱套（剖面）
      const ix0 = X(-g.R), ix1 = X(g.R), iy0 = Y(g.H), iy1 = Y(0);
      const ry = g.R * 0.16 * k;
      if (!loss) {
        const j = 1.4 * k;
        const foam = dk ? mix(colors['canvas-bg'], colors.muted, 0.32) : mix(colors.surface, '#ffffff', 0.55);
        const fx = ix0 - j, fy = iy0 + 4, fw = ix1 - ix0 + 2 * j, fh = iy1 - iy0 + j - 4;
        LD.contactShadow(ctx, g.cx, fy + fh, fw / 2, 0);
        const fgr = ctx.createLinearGradient(fx, 0, fx + fw, 0);
        fgr.addColorStop(0, shade(foam, dk ? 0.04 : 0.02)); fgr.addColorStop(0.5, shade(foam, dk ? -0.06 : -0.04)); fgr.addColorStop(1, shade(foam, dk ? -0.14 : -0.1));
        ctx.fillStyle = fgr;
        roundRect(ctx, fx, fy, fw, fh, 6); ctx.fill();
        foamTexture(fx, fy, fw, fh, foam);
        // 前方的切口（左右兩條剖面）
        ctx.strokeStyle = alpha(shade(foam, -0.5), dk ? 0.5 : 0.3); ctx.lineWidth = 1;
        roundRect(ctx, fx + 0.5, fy + 0.5, fw - 1, fh - 1, 6); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ix0 - 0.5, fy); ctx.lineTo(ix0 - 0.5, iy1 + 0.5); ctx.lineTo(ix1 + 0.5, iy1 + 0.5); ctx.lineTo(ix1 + 0.5, fy); ctx.stroke();
      } else {
        LD.contactShadow(ctx, g.cx, iy1, (ix1 - ix0) / 2, 0);
      }
      // 玻璃後壁（略帶藍綠色）與杯口後半圈
      const gl = ctx.createLinearGradient(ix0, 0, ix1, 0);
      gl.addColorStop(0, alpha(colors['b-wave'], 0.16)); gl.addColorStop(0.25, alpha(colors['b-wave'], 0.05)); gl.addColorStop(0.6, alpha(colors['b-wave'], 0.03)); gl.addColorStop(1, alpha(colors['b-wave'], 0.18));
      ctx.fillStyle = gl; ctx.fillRect(ix0, iy0, ix1 - ix0, iy1 - iy0);
      ctx.strokeStyle = alpha(colors['b-wave'], 0.45); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(g.cx, iy0, g.R * k, ry, 0, Math.PI, 2 * Math.PI); ctx.stroke();
      // 冰、水
      const pm = st.frac.map(function (f) { return f * p.m; });
      const iceM = pm[0], liqM = pm[1];
      const A = Math.PI * g.R * g.R;
      const hl = liqM * 1000 / A;
      const Vice = iceM * 1000 / 0.917;
      const yw = Y(hl);
      const wc = waterColor(Tn);
      if (hl > 0.02) {
        const wg = ctx.createLinearGradient(0, yw, 0, iy1);
        wg.addColorStop(0, alpha(shade(wc, 0.2), 0.6)); wg.addColorStop(0.35, alpha(wc, 0.66)); wg.addColorStop(1, alpha(shade(wc, -0.2), 0.8));
        ctx.fillStyle = wg; ctx.fillRect(ix0, yw, ix1 - ix0, iy1 - yw);
      }
      // 刻度（每 100 mL；底面積 πR² ≈ 78.5 cm²，所以 100 mL 約高 1.27 cm）
      const Abk = Math.PI * g.R * g.R;
      ctx.strokeStyle = alpha(dk ? '#ffffff' : colors.text, dk ? 0.4 : 0.38); ctx.lineWidth = 1;
      ctx.beginPath();
      for (let mL = 100; mL / Abk <= g.H - 1.2; mL += 100) {
        const yy = Math.round(Y(mL / Abk)) + 0.5, major = mL % 200 === 0;
        ctx.moveTo(ix0 + 4, yy); ctx.lineTo(ix0 + (major ? 13 : 9), yy);
      }
      ctx.stroke();
      // 浸入式加熱器：線圈＋金屬管
      coil(X(-3.3), X(2.5), Y(1.3), k, on, glowK, hot, metal);
      LD.tube(ctx, function (c) { c.moveTo(X(-3.3), Y(1.3)); c.lineTo(X(-3.3), Y(g.H + 2.2)); }, metal, Math.max(3.2, 0.36 * k));
      // 沸騰的氣泡
      if (st.seg.kind === 'lat' && st.seg.i === 1 && running && !reducedMotion && hl > 0.3) bubbles(ix0 + 10, ix1 - 10, yw + 4, Y(1.6), now, 16);
      else if (running && !reducedMotion && hl > 0.3 && Tn > 60) bubbles(X(-4), X(4), Math.max(yw + 6, Y(4)), Y(1.6), now, 4);
      // 冰塊（浮在水上或堆在杯底）
      if (iceM > 1e-6) {
        // 碎冰：每層 cols × cols 塊（側視圖只看得到最前面一排），總體積 = 冰的體積
        const cols = 3, s0 = (2 * g.R - 0.8) / (cols * 1.06);
        let n = Math.max(1, Math.round(Vice / (s0 * s0 * s0)));
        const s = n === 1 ? Math.min(s0, Math.cbrt(Vice)) : s0;
        const layers = [];
        while (n > 0) { const q = Math.min(cols * cols, n); layers.push(Math.min(cols, Math.ceil(q / cols))); n -= q; }
        const stackH = layers.length * s;
        const floatBase = hl > 0.05 ? Math.max(0, hl - 0.917 * stackH) : 0;
        layers.forEach(function (cnt, row) {
          for (let c = 0; c < cnt; c++) {
            const xx = -((cnt - 1) * s * 1.06) / 2 + c * s * 1.06 + (row % 2 ? s * 0.12 : -s * 0.12);
            cube(X(xx - 0.3), Y(floatBase + row * s * 0.99), s * k, matColor('ice'), 'ice');
          }
        });
      }
      if (hl > 0.02) {
        ctx.fillStyle = alpha(wc, 0.18); ctx.fillRect(ix0, yw, ix1 - ix0, iy1 - yw);
        const sg = ctx.createLinearGradient(0, yw - ry, 0, yw + ry);
        sg.addColorStop(0, alpha(shade(wc, 0.5), 0.7)); sg.addColorStop(1, alpha(shade(wc, 0.1), 0.5));
        ctx.fillStyle = sg; ctx.beginPath(); ctx.ellipse(g.cx, yw, g.R * k, ry, 0, 0, Math.PI * 2); ctx.fill();
      }
      if (st.seg.kind === 'lat' && st.seg.i === 1 && running && !reducedMotion) steam(g.cx, Math.min(yw, iy0) - 4, g.R * k, now);
      // 玻璃前緣：有厚度的杯壁、杯底、捲邊的杯口、兩道反光
      ctx.strokeStyle = alpha(colors['b-wave'], dk ? 0.6 : 0.55); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(ix0, iy0); ctx.lineTo(ix0, iy1 - 4); ctx.quadraticCurveTo(ix0, iy1, ix0 + 4, iy1); ctx.lineTo(ix1 - 4, iy1); ctx.quadraticCurveTo(ix1, iy1, ix1, iy1 - 4); ctx.lineTo(ix1, iy0); ctx.stroke();
      ctx.strokeStyle = alpha(colors['b-wave'], dk ? 0.22 : 0.2); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(ix0 + 2, iy0 + 2); ctx.lineTo(ix0 + 2, iy1 - 3); ctx.moveTo(ix1 - 2, iy0 + 2); ctx.lineTo(ix1 - 2, iy1 - 3); ctx.stroke();
      ctx.fillStyle = alpha(colors['b-wave'], dk ? 0.25 : 0.2);
      ctx.fillRect(ix0 + 2, iy1 - 3, ix1 - ix0 - 4, 3);
      ctx.strokeStyle = alpha(shade(colors['b-wave'], dk ? 0.3 : 0.1), 0.7); ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.ellipse(g.cx, iy0, g.R * k, ry, 0, 0, Math.PI); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,' + (dk ? 0.35 : 0.75) + ')'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(g.cx, iy0 - 0.8, g.R * k - 1, ry, 0, Math.PI * 0.15, Math.PI * 0.6); ctx.stroke();
      const hlg = ctx.createLinearGradient(0, iy0, 0, iy1);
      hlg.addColorStop(0, 'rgba(255,255,255,0)'); hlg.addColorStop(0.15, 'rgba(255,255,255,' + (dk ? 0.22 : 0.65) + ')'); hlg.addColorStop(0.85, 'rgba(255,255,255,' + (dk ? 0.12 : 0.4) + ')'); hlg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = hlg; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(ix0 + 7, iy0 + 8); ctx.lineTo(ix0 + 7, iy1 - 10); ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(ix1 - 6, iy0 + 14); ctx.lineTo(ix1 - 6, iy1 - 18); ctx.stroke();
      // 加熱器的握把與電線
      handle(X(-3.3), Y(g.H + 2.2), k, leadStart);
      thX = X(g.R - 0.9); thBulbY = Y(1.6);
    } else {
      // 金屬圓柱（依比例）＋加熱棒孔＋溫度計孔；無散熱時包隔熱材料
      const rho = HC.SUBSTANCES[p.sub].phases[0].rho;
      const V = p.m / rho * 1e6; // cm³
      const d = Math.cbrt(4 * V / Math.PI);
      const r = d / 2;
      const x0 = X(-r), x1 = X(r), y0 = Y(d), y1 = Y(0);
      const ry = r * 0.3 * k;
      const base = matColor(p.mat);
      if (!loss) {
        const j = 1.3 * k;
        const foam = dk ? mix(colors['canvas-bg'], colors.muted, 0.32) : mix(colors.surface, '#ffffff', 0.55);
        const fx = x0 - j, fy = y0 - ry, fw = x1 - x0 + 2 * j, fh = y1 - y0 + ry + j * 0.6;
        LD.contactShadow(ctx, g.cx, fy + fh, fw / 2, 0);
        const fgr = ctx.createLinearGradient(fx, 0, fx + fw, 0);
        fgr.addColorStop(0, shade(foam, dk ? 0.04 : 0.02)); fgr.addColorStop(0.5, shade(foam, dk ? -0.06 : -0.04)); fgr.addColorStop(1, shade(foam, dk ? -0.14 : -0.1));
        ctx.fillStyle = fgr;
        roundRect(ctx, fx, fy, fw, fh, 6); ctx.fill();
        foamTexture(fx, fy, fw, fh, foam);
      } else {
        LD.contactShadow(ctx, g.cx, y1, (x1 - x0) / 2, 0);
      }
      glow(g.cx, (y0 + y1) / 2, (x1 - x0) * 0.75 + 12, Tn, 0.9);
      // 圓柱側面：窄而亮的反光帶（拋光金屬）
      const cg = ctx.createLinearGradient(x0, 0, x1, 0);
      cg.addColorStop(0, shade(base, -0.3)); cg.addColorStop(0.18, shade(base, 0.05)); cg.addColorStop(0.32, shade(base, 0.38)); cg.addColorStop(0.42, shade(base, 0.12)); cg.addColorStop(0.7, base); cg.addColorStop(0.88, shade(base, 0.08)); cg.addColorStop(1, shade(base, -0.38));
      ctx.fillStyle = cg;
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      ctx.beginPath(); ctx.ellipse(g.cx, y1, r * k, ry, 0, 0, Math.PI); ctx.fill();
      // 頂面：車床加工的同心圓紋＋亮邊
      const tgr = ctx.createLinearGradient(x0, y0 - ry, x1, y0 + ry);
      tgr.addColorStop(0, shade(base, 0.5)); tgr.addColorStop(1, shade(base, 0.18));
      ctx.fillStyle = tgr;
      ctx.beginPath(); ctx.ellipse(g.cx, y0, r * k, ry, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = alpha(shade(base, -0.3), 0.18); ctx.lineWidth = 1;
      for (let q = 0.3; q < 1; q += 0.23) { ctx.beginPath(); ctx.ellipse(g.cx, y0, r * k * q, ry * q, 0, 0, Math.PI * 2); ctx.stroke(); }
      ctx.strokeStyle = alpha(shade(base, 0.8), 0.7);
      ctx.beginPath(); ctx.ellipse(g.cx, y0, r * k - 0.5, ry - 0.5, 0, Math.PI * 0.05, Math.PI * 0.95); ctx.stroke();
      if (p.mys && d * k > 26) {
        ctx.font = font(800, Math.round(d * k * 0.4)); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = alpha(shade(base, -0.45), 0.8); ctx.fillText('?', g.cx, (y0 + y1) / 2 + 4);
      }
      // 兩個孔（有深度：內壁上暗下亮）
      const hr = Math.max(2.5, r * 0.18 * k);
      [g.cx - r * 0.45 * k, g.cx + r * 0.45 * k].forEach(function (hx0) {
        const hg = ctx.createLinearGradient(0, y0 - hr * 0.45, 0, y0 + hr * 0.45);
        hg.addColorStop(0, shade(base, -0.75)); hg.addColorStop(1, shade(base, -0.35));
        ctx.fillStyle = hg;
        ctx.beginPath(); ctx.ellipse(hx0, y0, hr, hr * 0.45, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = alpha(shade(base, 0.7), 0.6); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(hx0, y0, hr, hr * 0.45, 0, 0.1, Math.PI - 0.1); ctx.stroke();
      });
      // 加熱棒
      const hx = g.cx - r * 0.45 * k;
      const rg = ctx.createLinearGradient(hx - hr, 0, hx + hr, 0);
      rg.addColorStop(0, on ? mix(metal, hot, glowK * 0.8) : metal); rg.addColorStop(0.5, on ? shade(hot, 0.4 * glowK) : shade(metal, 0.4)); rg.addColorStop(1, on ? mix(metal, hot, glowK * 0.6) : shade(metal, -0.2));
      ctx.fillStyle = rg;
      roundRect(ctx, hx - hr * 0.7, y0 - 2.4 * k, hr * 1.4, 2.4 * k + hr * 0.3, 2); ctx.fill();
      handle(hx, y0 - 2.4 * k, k, leadStart);
      thX = g.cx + r * 0.45 * k; thBulbY = y0 + Math.max(4, d * k * 0.35);
      if (!loss) {
        // 隔熱材料的前緣（剖面線）
        ctx.strokeStyle = alpha(colors.text, dk ? 0.22 : 0.15); ctx.lineWidth = 1;
        roundRect(ctx, x0 - 1.3 * k + 0.5, y0 - ry + 0.5, x1 - x0 + 2.6 * k - 1, y1 - y0 + ry + 1.3 * k * 0.6 - 1, 6);
        ctx.stroke();
      }
    }
    // 溫度計
    const thTop = Y(g.H + 7);
    thermometer(thX, thBulbY, thTop, Math.max(5, 0.5 * k), Tn, 'T = ' + num(Tn, 2) + ' °C');
    // 文字
    const lx = S.x + (L.wide ? 10 : 6);
    const f1 = font(700, L.wide ? 12 : 11), f2 = font(600, L.wide ? 12 : 11);
    ctx.textAlign = 'left';
    pill('t = ' + num(Hh.t, 1) + ' s' + (state.speed.heat !== 1 ? '  (' + state.speed.heat + '×)' : ''), lx, S.y + S.h - 13, colors.text, f1, 0.8);
    const stTxt = phaseText(st, p);
    pill(stTxt, lx, S.y + S.h - 13 - (L.wide ? 22 : 19), colors['b-thermo'], f2, 0.8);
    if (L.wide) {
      ctx.textAlign = 'right';
      pill(loss ? T('沒有隔熱：會散熱', 'No insulation: heat is lost') : T('隔熱良好：不散熱', 'Well insulated: no heat loss'), S.x + S.w - 10, S.y + S.h - 13, colors.muted, font(0, 11), 0.7);
    }
    ctx.restore();
  }
  function coil(x0, x1, y, k, on, glowK, hot, metal) {
    const n = 9, rx = (x1 - x0) / n / 2, ryy = Math.max(3, 0.55 * k);
    const col = on ? mix(metal, hot, glowK) : metal;
    if (on) {
      const gg = ctx.createRadialGradient((x0 + x1) / 2, y, 2, (x0 + x1) / 2, y, (x1 - x0) * 0.6);
      gg.addColorStop(0, alpha(hot, 0.35 * glowK)); gg.addColorStop(1, alpha(hot, 0));
      ctx.fillStyle = gg; ctx.beginPath(); ctx.ellipse((x0 + x1) / 2, y, (x1 - x0) * 0.6, (x1 - x0) * 0.25, 0, 0, Math.PI * 2); ctx.fill();
    }
    const lw = Math.max(2.6, 0.3 * k);
    ctx.lineCap = 'round';
    // 後半圈（較暗）
    ctx.lineWidth = lw;
    ctx.strokeStyle = shade(col, -0.35);
    ctx.beginPath();
    for (let i = 0; i < n; i++) { const cx = x0 + rx + i * 2 * rx; ctx.moveTo(cx + rx * 1.05, y); ctx.ellipse(cx, y, rx * 1.05, ryy, 0, 0, Math.PI, true); }
    ctx.stroke();
    // 前半圈：暗的外緣＋本色＋上緣細亮線（圓柱感）
    ctx.strokeStyle = shade(col, -0.2);
    ctx.beginPath();
    for (let i = 0; i < n; i++) { const cx = x0 + rx + i * 2 * rx; ctx.moveTo(cx + rx * 1.05, y); ctx.ellipse(cx, y, rx * 1.05, ryy, 0, 0, Math.PI); }
    ctx.stroke();
    ctx.lineWidth = lw * 0.6;
    ctx.strokeStyle = col;
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = alpha(shade(col, 0.7), on ? 0.85 : 0.65);
    ctx.beginPath();
    for (let i = 0; i < n; i++) { const cx = x0 + rx + i * 2 * rx; ctx.moveTo(cx + rx * 0.9 * Math.cos(0.3), y - 0.8 + ryy * 0.8 * Math.sin(0.3)); ctx.ellipse(cx, y - 0.8, rx * 0.9, ryy * 0.8, 0, 0.3, Math.PI * 0.7); }
    ctx.stroke();
  }
  /** 加熱器的塑膠握把（下緣在 (x, y)）與連到電源的電線 */
  function handle(x, y, k, from) {
    const hw = Math.max(8, 0.9 * k), hh = Math.max(16, 2.2 * k);
    const top = y - hh;
    // 電線（橡膠皮）：由握把頂端彎向電源
    const cable = colors.dark ? shade(colors.field, -0.35) : shade(colors.field, -0.05);
    LD.tube(ctx, function (c) { c.moveTo(x, top + 2); c.bezierCurveTo(x, top - 30, from[0] + 40, from[1], from[0], from[1]); }, cable, 3);
    // 握把：塑膠，有防滑紋；下端的金屬套環
    const base = shade(colors.field, colors.dark ? -0.55 : 0.05);
    const hg = ctx.createLinearGradient(x - hw / 2, 0, x + hw / 2, 0);
    hg.addColorStop(0, shade(base, 0.2)); hg.addColorStop(0.3, shade(base, 0.5)); hg.addColorStop(0.55, shade(base, 0.15)); hg.addColorStop(1, shade(base, -0.3));
    ctx.save();
    ctx.shadowColor = colors.dark ? 'rgba(0,0,0,0.45)' : alpha(colors.text, 0.18); ctx.shadowBlur = 4; ctx.shadowOffsetY = 1.5;
    ctx.fillStyle = hg;
    roundRect(ctx, x - hw / 2, top, hw, hh, Math.min(4, hw / 2));
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = alpha('#000000', colors.dark ? 0.35 : 0.18); ctx.lineWidth = 1;
    ctx.beginPath();
    for (let j = 1; j <= 4; j++) { const yy = Math.round(top + hh * 0.12 + (hh * 0.6) * j / 5) + 0.5; ctx.moveTo(x - hw / 2 + 1.5, yy); ctx.lineTo(x + hw / 2 - 1.5, yy); }
    ctx.stroke();
    metalBox(x - hw * 0.42, y - Math.max(3, 0.3 * k), hw * 0.84, Math.max(3, 0.3 * k), 1.5);
  }
  function phaseText(st, p) {
    const g = st.seg;
    if (!p.h2o) return T('固態升溫', 'Solid warming');
    if (g.kind === 'lat') return g.i === 0 ? T('熔化中：已融化 ', 'Melting: ') + num(st.x * 100, 0) + T('%', '% melted')
      : T('沸騰中：已汽化 ', 'Boiling: ') + num(st.x * 100, 0) + T('%', '% boiled off');
    return [T('冰（固態）升溫', 'Ice (solid) warming'), T('水（液態）升溫', 'Water (liquid) warming'), T('水蒸氣', 'Steam')][g.p];
  }

  // ---------- 加熱曲線：圖 ----------
  function drawHeatGraph() {
    const R = L.graph, Hh = state.heat, pr = Hh.pred;
    const p = Hh.phase === 'ready' ? heatParams() : Hh.p;
    let lo = Infinity, hi = -Infinity, x1 = pr.tEnd;
    pr.curve.forEach(function (s) { lo = Math.min(lo, s[1]); hi = Math.max(hi, s[1]); });
    Hh.ghosts.forEach(function (gh) { x1 = Math.max(x1, gh.tEnd); gh.a.forEach(function (s) { lo = Math.min(lo, s[1]); hi = Math.max(hi, s[1]); }); });
    x1 = niceCeil(x1);
    const yr = yRange(lo, hi);
    clipRegion(R);
    const G = graphFrame(R, x1, yr[0], yr[1], T('加熱曲線（溫度–時間圖）', 'Heating curve (temperature–time)'), colors.text);
    ctx.save();
    ctx.beginPath(); ctx.rect(G.P.x, G.P.y - 6, G.P.w + 6, G.P.h + 8); ctx.clip();
    // 相變平台（預測）的底色
    if (!p.mys) pr.plats.forEach(function (pl) {
      const xa = G.gx(pl.t0), xb = G.gx(pl.t1);
      ctx.fillStyle = alpha(colors.accent, colors.dark ? 0.14 : 0.1);
      ctx.fillRect(xa, G.P.y, xb - xa, G.P.h);
    });
    // 0 °C 與 100 °C
    [0, 100].forEach(function (v) {
      if (v < yr[0] || v > yr[1] || !p.h2o) return;
      const y = Math.round(G.gy(v)) + 0.5;
      ctx.strokeStyle = alpha(colors.accent, 0.35); ctx.lineWidth = 1; ctx.setLineDash([2, 4]);
      ctx.beginPath(); ctx.moveTo(G.P.x, y); ctx.lineTo(G.P.x + G.P.w, y); ctx.stroke(); ctx.setLineDash([]);
    });
    Hh.ghosts.forEach(function (gh) { polyline(mapPts(G, gh.a, 1), alpha(colors['b-thermo'], 0.25), 1.5); });
    if (!p.mys) {
      const fut = pr.curve.filter(function (s) { return s[0] >= Hh.t; });
      polyline(mapPts(G, fut, 1), alpha(colors['b-thermo'], 0.4), 1.3, [4, 5]);
    }
    if (Hh.samples.length > 1) tube(mapPts(G, Hh.samples, 1), L.wide ? 3 : 2.6, shade(colors['b-thermo'], colors.dark ? -0.1 : -0.12), alpha(shade(colors['b-thermo'], 0.55), 0.8));
    // 紀錄點與最後兩點的連線
    const pts = Hh.points;
    if (pts.length >= 2) {
      const a = pts[pts.length - 2], b = pts[pts.length - 1];
      polyline([[G.gx(a.t), G.gy(a.T)], [G.gx(b.t), G.gy(b.T)]], alpha(colors.equi, 0.9), 1.6, [5, 4]);
    }
    pts.forEach(function (q) { diamond(G.gx(q.t), G.gy(q.T), 5, colors.equi); });
    const st = HC.stateOf(Hh.body || pr.su.b, Hh.body ? Hh.H : pr.su.H0);
    sphereSmall(G.gx(Hh.t), G.gy(st.T), colors['b-thermo']);
    ctx.restore();
    // 平台的標籤
    const f = font(600, L.wide ? 11 : 10);
    ctx.textAlign = 'center';
    if (!p.mys) pr.plats.forEach(function (pl) {
      const xa = G.gx(pl.t0), xb = G.gx(pl.t1);
      if (xb - xa < 10) return;
      const txt = pl.i === 0 ? T('熔化 0 °C', 'Melting 0 °C') : T('沸騰 100 °C', 'Boiling 100 °C');
      ctx.font = f;
      const tw = ctx.measureText(txt).width;
      if (pl.T <= 0) { ctx.textAlign = 'left'; pill(txt, Math.min(xa + 6, G.P.x + G.P.w - tw - 8), G.gy(pl.T) + 13, colors.accent, f, 0.85); }
      else { ctx.textAlign = 'center'; pill(txt, Math.max(G.P.x + tw / 2 + 6, Math.min(G.P.x + G.P.w - tw / 2 - 6, (xa + xb) / 2)), G.gy(pl.T) - 12, colors.accent, f, 0.85); }
    });
    pts.forEach(function (q) {
      ctx.textAlign = 'center';
      pill(String(q.n), G.gx(q.t), G.gy(q.T) + 13, colors.equi, font(700, 10), 0.8);
    });
    if (pts.length >= 2) {
      const a = pts[pts.length - 2], b = pts[pts.length - 1];
      if (b.t > a.t) {
        ctx.textAlign = 'left';
        const st = T('斜率 ', 'slope ') + num((b.T - a.T) / (b.t - a.t), 4) + ' °C/s';
        ctx.font = font(700, 11);
        const sw = ctx.measureText(st).width;
        const mx = (G.gx(a.t) + G.gx(b.t)) / 2 + 12, my = (G.gy(a.T) + G.gy(b.T)) / 2 + 4;
        pill(st, Math.max(G.P.x + 6, Math.min(G.P.x + G.P.w - sw - 8, mx)), Math.max(G.P.y + 10, Math.min(G.P.y + G.P.h - 10, my)), colors.equi, font(700, 11), 0.9);
      }
    }
    ctx.restore();
  }

  // ---------- 加熱曲線：熱量圖 ----------
  function drawHeatInfo() {
    const R = L.info, Hh = state.heat, pr = Hh.pred;
    const p = Hh.phase === 'ready' ? heatParams() : Hh.p;
    clipRegion(R);
    const body = Hh.body || pr.su.b, H0 = Hh.body ? Hh.H0 : pr.su.H0, H = Hh.body ? Hh.H : pr.su.H0;
    const fT = font(700, L.wide ? 12 : 11);
    ctx.textAlign = 'left';
    pill(T('熱量與狀態', 'Heat and state'), R.x + 8, R.y + 13, colors.text, fT, 0.85);
    ctx.font = font(600, L.wide ? 12 : 11);
    const labW = Math.min(R.w * 0.42, Math.max(L.wide ? 92 : 70, 10 + Math.max(ctx.measureText(p.h2o ? T('組成', 'Contents') : T('熱容量', 'Heat capacity')).width, ctx.measureText('Q = Pt').width)));
    const x0 = R.x + 10 + labW, wMax = R.w - labW - 26;
    const top = R.y + 30, rh = Math.min(30, (R.h - 52) / 2), bh = Math.min(16, rh * 0.62);
    function rowLabel(txt, y) {
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.font = font(600, L.wide ? 12 : 11); ctx.fillStyle = colors.text;
      ctx.fillText(txt, R.x + 10, y + bh / 2);
      ctx.fillStyle = alpha(colors.text, 0.06);
      roundRect(ctx, x0, y, wMax, bh, 4); ctx.fill();
    }
    function piece(x, y, w, col, kind, label) {
      if (w < 0.3) return;
      const g = ctx.createLinearGradient(0, y, 0, y + bh);
      g.addColorStop(0, shade(col, 0.22)); g.addColorStop(1, shade(col, -0.12));
      ctx.fillStyle = g; ctx.fillRect(x, y, w, bh);
      if (kind === 'lat') hatch(x, y, w, bh, alpha(colors['canvas-bg'], 0.55));
      ctx.font = font(600, 10);
      if (label && w > ctx.measureText(label).width + 8) {
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = colors.dark ? alpha('#000000', 0.75) : alpha('#ffffff', 0.92);
        ctx.fillText(label, x + w / 2, y + bh / 2 + 0.5);
      }
    }
    // 第一列：物質的組成（冰／水／已汽化）或熱容量
    const y1 = top + (rh - bh) / 2;
    if (p.h2o) {
      rowLabel(T('組成', 'Contents'), y1);
      const fr = HC.stateOf(body, H).frac;
      const parts = [[fr[0], matColor('ice'), T('冰', 'ice')], [fr[1], colors.neg, T('水', 'water')], [fr[2], colors.muted, T('已汽化', 'boiled off')]];
      ctx.save(); roundRect(ctx, x0, y1, wMax, bh, 4); ctx.clip();
      let x = x0;
      parts.forEach(function (q) { piece(x, y1, q[0] * wMax, q[1], 'sens', q[2] + ' ' + grams(q[0] * p.m)); x += q[0] * wMax; });
      ctx.restore();
    } else {
      rowLabel(T('熱容量', 'Heat capacity'), y1);
      ctx.font = font(700, L.wide ? 12 : 11); ctx.textAlign = 'left'; ctx.fillStyle = colors.text;
      ctx.fillText(p.mys ? 'C = mc = ? J/K' : 'C = mc = ' + num(p.m * cOf(p.mat), 1) + ' J/K', x0 + 6, y1 + bh / 2);
    }
    // 第二列：吸收的熱量 Q = Pt 分段
    const y2 = top + rh + (rh - bh) / 2;
    rowLabel('Q = Pt', y2);
    const Qend = Math.max(pr.Qend, Hh.Qin, 1e-9);
    ctx.save(); roundRect(ctx, x0, y2, wMax, bh, 4); ctx.clip();
    let x = x0;
    HC.decompose(body, H0, H).forEach(function (s) {
      const w = Math.abs(s.Q) / Qend * wMax;
      const col = s.kind === 'lat' ? colors.accent : p.h2o ? [matColor('ice'), colors.neg, colors.muted][s.p] : colors['b-thermo'];
      piece(x, y2, w, col, s.kind, s.kind === 'lat' ? (s.i === 0 ? T('熔化', 'melt') : T('汽化', 'boil')) : (p.h2o ? [T('冰升溫', 'ice'), T('水升溫', 'water'), T('蒸氣', 'steam')][s.p] : T('升溫', 'warming')));
      x += w;
    });
    if (Hh.Qloss > 0) { piece(x, y2, Hh.Qloss / Qend * wMax, colors.muted, 'sens', T('散失', 'lost')); x += Hh.Qloss / Qend * wMax; }
    ctx.restore();
    ctx.textAlign = 'left';
    const txt = fmtQ(Hh.Qin);
    ctx.font = font(700, L.wide ? 12 : 11);
    if (x + 6 + ctx.measureText(txt).width < x0 + wMax) { ctx.fillStyle = colors['b-thermo']; ctx.textBaseline = 'middle'; ctx.fillText(txt, x + 5, y2 + bh / 2 + 0.5); }
    // 空間足夠時：各段吸收的熱量（mcΔT 或 mL）
    const free = (R.y + R.h - 24) - (top + 2 * rh);
    const parts = HC.decompose(body, H0, H);
    if (Hh.t > 0 && free >= 26 && parts.length) {
      const fl = font(600, L.wide ? 11 : 10);
      let txt;
      if (!p.h2o) txt = p.mys ? 'Q = mcΔT' : 'Q = mcΔT = ' + num(p.m, 3) + ' × ' + cOf(p.mat) + ' × ' + num(HC.temperature(body, H) - HC.temperature(body, H0), 2) + ' = ' + fmtQ(parts[0].Q);
      else txt = parts.map(function (q) {
        return (q.kind === 'lat' ? (q.i === 0 ? T('熔化 ', 'melting ') : T('汽化 ', 'boiling ')) : [T('冰升溫 ', 'ice warming '), T('水升溫 ', 'water warming '), T('蒸氣 ', 'steam ')][q.p]) + fmtQ(q.Q, 1);
      });
      ctx.textAlign = 'left';
      flowText(Array.isArray(txt) ? txt : [txt], R.x + 10, top + 2 * rh + 12, R.w - 20, colors.text, fl, Math.floor(free / 18), 1);
    }
    const eq = 'Q = Pt = ' + num(p.P, p.P < 100 ? 1 : 0) + ' W × ' + num(Hh.t, 1) + ' s = ' + fmtQ(Hh.Qin) + (Hh.Qloss >= 0.5 ? T('（散失 ', ' (lost ') + fmtQ(Hh.Qloss) + T('）', ')') : '');
    pill(eq, R.x + 10, R.y + R.h - 12, colors.text, font(600, L.wide ? 11 : 10), 0.85);
    ctx.restore();
  }

  // ---------- 比熱比較：裝置 ----------
  function drawCmpScene() {
    const S = L.scene, Cm = state.cmp, pr = Cm.pred;
    const p = Cm.phase === 'ready' ? cmpParams() : Cm.p;
    const items = Cm.items;
    clipRegion(S);
    const n = Math.max(1, items.length);
    // 畫面又高又窄（桌機）時排成 3 × 2，否則排成一列
    const nc = n > 3 && S.h > S.w * 1.1 ? Math.ceil(n / 2) : n, nr = Math.ceil(n / nc);
    const colW = (S.w - 16) / nc, top0 = S.y + 26, rowH = (S.h - 26) / nr;
    const vMax = p.m / 1000 * 1e6; // 水的體積（cm³）最大
    const sideMax = 2 * Math.cbrt(vMax / (2 * Math.PI));
    const k = Math.min(colW * 0.8 / sideMax, (rowH * 0.4) / sideMax, 30);
    const running = Cm.phase === 'run';
    const hot = mix(colors['b-thermo'], colors.equi, 0.35);
    const now = performance.now();
    // 所有溫度計一樣長（柱高才能互相比較）：扣掉最高的物體
    const objH = Math.max.apply(null, items.map(function (it) {
      if (it.key === 'h2o') { const rr = Math.cbrt(vMax / (2 * Math.PI)); return vMax / (Math.PI * rr * rr) * 1.1 * k; }
      return Math.cbrt(p.m / it.b.sub.phases[0].rho * 1e6) * k * 1.2;
    }).concat([0]));
    const tPad = L.wide ? 26 : 16;
    const tLen = Math.max(20, rowH - tPad - (L.wide ? 34 : 28) - objH - 10);
    items.forEach(function (it, i) {
      const r = Math.floor(i / nc), cI = i % nc;
      const cx = S.x + 8 + colW * (cI + 0.5);
      const baseY = top0 + rowH * (r + 1) - (L.wide ? 34 : 28);
      const cellTop = top0 + rowH * r;
      const Tn = HC.temperature(it.b, it.H);
      // 加熱板：金屬盤＋底座（有指示燈）
      const pw = Math.min(colW * 0.86, Math.max(sideMax * k * 1.05, 30)), ph = 7;
      const bh3 = L.wide ? 6 : 4;
      LD.contactShadow(ctx, cx, baseY + ph + bh3, pw / 2 - 2, 0);
      metalBox(cx - pw / 2 + 3, baseY + ph - 1, pw - 6, bh3 + 1, 2, colors.dark ? shade(colors.muted, -0.5) : shade(colors.muted, -0.15));
      LD.ball(ctx, cx + pw / 2 - 8, baseY + ph + bh3 / 2, 1.6, running ? colors.pos : shade(colors.muted, colors.dark ? -0.1 : 0.3), { shadow: false, glow: running ? 0.6 : 0 });
      const pg = ctx.createLinearGradient(0, baseY, 0, baseY + ph);
      const plate = running ? mix(shade(colors.muted, colors.dark ? -0.3 : 0.3), hot, 0.55) : shade(colors.muted, colors.dark ? -0.3 : 0.3);
      pg.addColorStop(0, shade(plate, 0.4)); pg.addColorStop(0.35, shade(plate, 0.1)); pg.addColorStop(1, shade(plate, -0.25));
      ctx.fillStyle = pg; roundRect(ctx, cx - pw / 2, baseY, pw, ph, 3); ctx.fill();
      ctx.fillStyle = alpha('#ffffff', colors.dark ? 0.15 : 0.5); ctx.fillRect(cx - pw / 2 + 3, baseY + 0.5, pw - 6, 1);
      if (running) {
        // 加熱中：盤面發紅、上方一層熱的微光
        const hg = ctx.createLinearGradient(0, baseY - 8, 0, baseY + 1);
        hg.addColorStop(0, alpha(hot, 0)); hg.addColorStop(1, alpha(hot, colors.dark ? 0.4 : 0.3));
        ctx.fillStyle = hg; ctx.fillRect(cx - pw / 2 + 2, baseY - 8, pw - 4, 9);
      }
      // 物體（依比例：同質量時密度小的體積大）
      if (it.key === 'h2o') {
        const V = it.b.m * 1000 * HC.stateOf(it.b, it.H).frac[1];
        const r = Math.cbrt(vMax / (2 * Math.PI)), hgt = V / (Math.PI * r * r), hMax = vMax / (Math.PI * r * r);
        const bw = 2 * r * k, x0 = cx - bw / 2, yT = baseY - hMax * 1.1 * k, yW = baseY - hgt * k;
        const wc = waterColor(Tn);
        const dk = colors.dark, ery = bw * 0.08;
        glow(cx, baseY - hgt * k / 2, bw * 0.7 + 8, Tn, 0.8);
        // 燒杯的後壁與杯口後半圈
        const gb = ctx.createLinearGradient(x0, 0, x0 + bw, 0);
        gb.addColorStop(0, alpha(colors['b-wave'], 0.16)); gb.addColorStop(0.3, alpha(colors['b-wave'], 0.04)); gb.addColorStop(1, alpha(colors['b-wave'], 0.18));
        ctx.fillStyle = gb; ctx.fillRect(x0, yT, bw, baseY - yT);
        ctx.strokeStyle = alpha(colors['b-wave'], 0.4); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(cx, yT, bw / 2, ery, 0, Math.PI, 2 * Math.PI); ctx.stroke();
        // 水
        const wg = ctx.createLinearGradient(0, yW, 0, baseY);
        wg.addColorStop(0, alpha(shade(wc, 0.2), 0.68)); wg.addColorStop(1, alpha(shade(wc, -0.15), 0.8));
        ctx.fillStyle = wg; ctx.fillRect(x0, yW, bw, baseY - yW);
        ctx.fillStyle = alpha(shade(wc, 0.45), 0.8); ctx.beginPath(); ctx.ellipse(cx, yW, bw / 2, ery, 0, 0, Math.PI * 2); ctx.fill();
        // 玻璃前緣、捲邊的杯口、反光
        ctx.strokeStyle = alpha(colors['b-wave'], dk ? 0.65 : 0.6); ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.moveTo(x0, yT); ctx.lineTo(x0, baseY - 2); ctx.quadraticCurveTo(x0, baseY, x0 + 2, baseY); ctx.lineTo(x0 + bw - 2, baseY); ctx.quadraticCurveTo(x0 + bw, baseY, x0 + bw, baseY - 2); ctx.lineTo(x0 + bw, yT); ctx.stroke();
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(cx, yT, bw / 2, ery, 0, 0, Math.PI); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,' + (dk ? 0.25 : 0.7) + ')'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x0 + 4, yT + 6); ctx.lineTo(x0 + 4, baseY - 6); ctx.stroke();
        if (Tn >= 100 && running && !reducedMotion) bubbles(x0 + 3, x0 + bw - 3, yW + 3, baseY - 3, now, 5);
        it.topY = yT;
      } else {
        const rho = it.b.sub.phases[0].rho;
        const s = Math.cbrt(p.m / rho * 1e6) * k;
        glow(cx, baseY - s / 2, s * 0.9 + 8, Tn, 0.9);
        cube(cx - s * 0.1, baseY, s, matColor(it.key), it.key === 'glass' ? 'glass' : 'metal');
        it.topY = baseY - s * 1.2;
      }
      // 迷你溫度計（柱高 ∝ 溫度）：玻璃管＋底部的球
      const tTop = cellTop + tPad, tBot = tTop + tLen;
      const frac = Math.max(0, Math.min(1, (Tn - (p.T0 - 5)) / (pr.Tmax + 5 - (p.T0 - 5))));
      const tw = L.wide ? 7 : 5;
      const lc = lineColor(it.key);
      const yc = tBot - frac * (tBot - tTop);
      const gw = tw + 4, br = gw * 0.62;
      ctx.fillStyle = alpha(colors.surface, colors.dark ? 0.18 : 0.55);
      roundRect(ctx, cx - gw / 2, tTop - 2, gw, tBot - tTop + 4, gw / 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx, tBot + br * 0.1, br, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = alpha(colors.text, 0.08); roundRect(ctx, cx - tw / 2, tTop, tw, tBot - tTop, tw / 2); ctx.fill();
      const lg = ctx.createLinearGradient(cx - tw / 2, 0, cx + tw / 2, 0);
      lg.addColorStop(0, shade(lc, 0.3)); lg.addColorStop(1, shade(lc, -0.15));
      ctx.fillStyle = lg; roundRect(ctx, cx - tw / 2, yc, tw, tBot - yc + 2, tw / 2); ctx.fill();
      LD.ball(ctx, cx, tBot + br * 0.1, br * 0.78, lc, { shadow: false, glow: 0 });
      ctx.strokeStyle = alpha(colors.muted, colors.dark ? 0.6 : 0.5); ctx.lineWidth = 1;
      roundRect(ctx, cx - gw / 2 + 0.5, tTop - 1.5, gw - 1, tBot - tTop + 3, gw / 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,' + (colors.dark ? 0.25 : 0.75) + ')'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(cx - gw / 2 + 1.8, tTop + 2); ctx.lineTo(cx - gw / 2 + 1.8, tBot - 2); ctx.stroke();
      ctx.textAlign = 'center';
      pill(num(Tn, Tn < 100 ? 1 : 0) + '°', cx, tTop - 11, lc, font(700, L.wide ? 12 : 10), 0.85);
      ctx.font = font(700, L.wide ? 12 : 10); ctx.fillStyle = lc; ctx.textBaseline = 'middle';
      let nm = matName(it.key);
      if (ctx.measureText(nm).width > colW - 6) nm = { h2o: 'H_{2}O', al: 'Al', glass: T('玻璃', 'Glass'), fe: 'Fe', cu: 'Cu', pb: 'Pb' }[it.key];
      richText(nm, cx, baseY + (L.wide ? 20 : 17), font(700, L.wide ? 12 : 10));
    });
    if (!items.length) {
      ctx.textAlign = 'center';
      pill(T('請在右側選擇要比較的材料', 'Choose materials to compare'), S.x + S.w / 2, S.y + S.h / 2, colors.muted, font(600, 12), 0.85);
    }
    ctx.textAlign = 'left';
    pill('t = ' + num(Cm.t, 1) + ' s' + (state.speed.cmp !== 1 ? '  (' + state.speed.cmp + '×)' : '') + '   Q = ' + fmtQ(p.P * Cm.t), S.x + 8, S.y + 14, colors.text, font(700, L.wide ? 12 : 11), 0.85);
    ctx.restore();
  }
  function drawCmpGraph() {
    const R = L.graph, Cm = state.cmp, pr = Cm.pred;
    const p = Cm.phase === 'ready' ? cmpParams() : Cm.p;
    const x1 = niceCeil(pr.tEnd);
    const yr = yRange(p.T0, pr.Tmax);
    clipRegion(R);
    const G = graphFrame(R, x1, yr[0], yr[1], T('溫度–時間圖（同樣的熱量 Q = Pt）', 'Temperature–time (same heat Q = Pt)'), colors.text);
    ctx.save();
    ctx.beginPath(); ctx.rect(G.P.x, G.P.y - 6, G.P.w + 6, G.P.h + 8); ctx.clip();
    Cm.items.forEach(function (it, j) {
      const col = lineColor(it.key);
      // 預測（虛線）
      const b = it.b, H0 = it.H0;
      const fut = [];
      for (let i = 0; i <= 60; i++) { const t = Math.max(Cm.t, 0) + (pr.tEnd - Cm.t) * i / 60; fut.push([G.gx(t), G.gy(HC.temperature(b, H0 + p.P * t))]); }
      polyline(fut, alpha(col, 0.35), 1.2, [4, 5]);
      if (Cm.samples.length > 1) tube(mapPts(G, Cm.samples, j + 1), L.wide ? 2.8 : 2.4, shade(col, colors.dark ? -0.1 : -0.12), alpha(shade(col, 0.55), 0.75));
      sphereSmall(G.gx(Cm.t), G.gy(HC.temperature(it.b, it.H)), col, L.wide ? 4.5 : 4);
    });
    ctx.restore();
    // 線末的名稱（避免重疊）
    const labs = Cm.items.map(function (it) {
      const tEndLine = pr.tEnd;
      return { key: it.key, y: G.gy(HC.temperature(it.b, it.H0 + p.P * tEndLine)) };
    }).sort(function (a, b) { return a.y - b.y; });
    const gapL = L.wide ? 16 : 15, bottomY = G.P.y + G.P.h - 8;
    for (let i = 1; i < labs.length; i++) labs[i].y = Math.max(labs[i].y, labs[i - 1].y + gapL);
    for (let i = labs.length - 1; i >= 0; i--) labs[i].y = Math.min(labs[i].y, i === labs.length - 1 ? bottomY : labs[i + 1].y - gapL);
    ctx.textAlign = 'right';
    labs.forEach(function (lb) {
      pill(matName(lb.key), G.P.x + G.P.w - 2, lb.y, lineColor(lb.key), font(700, L.wide ? 11 : 10), 0.8);
    });
    ctx.restore();
  }
  function drawCmpInfo() {
    const R = L.info, Cm = state.cmp, pr = Cm.pred;
    const p = Cm.phase === 'ready' ? cmpParams() : Cm.p;
    clipRegion(R);
    ctx.textAlign = 'left';
    pill(T('溫度變化 ΔT = Q/(mc)', 'Temperature change ΔT = Q/(mc)'), R.x + 8, R.y + 13, colors.text, font(700, L.wide ? 12 : 11), 0.85);
    const n = Cm.items.length;
    if (!n) { ctx.restore(); return; }
    ctx.font = font(600, L.wide ? 12 : 11);
    const labW = Math.min(R.w * 0.42, 8 + Math.max.apply(null, Cm.items.map(function (it) { return ctx.measureText(matName(it.key) + ' ' + cOf(it.key)).width; })));
    const x0 = R.x + 10 + labW, wMax = R.w - labW - 76;
    const rh = Math.min(24, (R.h - 34) / n), bh = Math.min(13, rh * 0.62);
    const dMax = Math.max(1e-9, pr.Tmax - p.T0);
    Cm.items.forEach(function (it, i) {
      const y = R.y + 28 + rh * i + (rh - bh) / 2;
      const dT = HC.temperature(it.b, it.H) - p.T0;
      const col = lineColor(it.key);
      ctx.font = font(600, L.wide ? 12 : 11); ctx.fillStyle = col; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.fillText(matName(it.key) + ' ' + (it.key === 'h2o' ? 4186 : cOf(it.key)), R.x + 10, y + bh / 2);
      ctx.fillStyle = alpha(colors.text, 0.06); roundRect(ctx, x0, y, wMax, bh, 4); ctx.fill();
      const w = Math.max(0, Math.min(1, dT / dMax)) * wMax;
      if (w > 0.5) {
        const g = ctx.createLinearGradient(0, y, 0, y + bh);
        g.addColorStop(0, shade(col, 0.25)); g.addColorStop(1, shade(col, -0.12));
        ctx.fillStyle = g; roundRect(ctx, x0, y, w, bh, 4); ctx.fill();
      }
      ctx.font = font(700, L.wide ? 12 : 11); ctx.fillStyle = col;
      ctx.fillText(num(dT, dT < 100 ? 1 : 0) + ' °C', x0 + wMax + 6, y + bh / 2);
    });
    ctx.restore();
  }

  // ---------- 讀數 ----------
  const lastText = {};
  function setHTML(id, html) {
    if (lastText[id] === html) return;
    lastText[id] = html;
    const e = $(id); if (e) e.innerHTML = html;
  }
  function buildReadout() {
    let rows;
    if (state.mode === 'cal') rows = [
      ['rC1', T('樣品熱容量 <span class="f">C<sub>1</sub> = m<sub>1</sub>c<sub>1</sub></span>', 'Sample heat capacity <span class="f">C<sub>1</sub> = m<sub>1</sub>c<sub>1</sub></span>')],
      ['rC2', T('水＋杯熱容量 <span class="f">C<sub>2</sub></span>', 'Water + cup heat capacity <span class="f">C<sub>2</sub></span>')],
      ['rTf', T('預測平衡溫度 <span class="f">T<sub>f</sub></span>', 'Predicted equilibrium <span class="f">T<sub>f</sub></span>')],
      ['rt', T('時間 t', 'Time t')],
      ['rT1', T('樣品溫度 T<sub>1</sub>', 'Sample temperature T<sub>1</sub>')],
      ['rT2', T('水溫 T<sub>2</sub>', 'Water temperature T<sub>2</sub>')],
      ['rP', T('熱流 <span class="f">P = k(T<sub>1</sub> − T<sub>2</sub>)</span>', 'Heat flow <span class="f">P = k(T<sub>1</sub> − T<sub>2</sub>)</span>')],
      ['rQ1', T('樣品的熱量變化 ΔQ<sub>1</sub>', 'Heat change of sample ΔQ<sub>1</sub>')],
      ['rQ2', T('水＋杯的熱量變化 ΔQ<sub>2</sub>', 'Heat change of water + cup ΔQ<sub>2</sub>')],
      ['rQl', T('散失到室內', 'Lost to the room')],
      ['rIce', T('冰／水蒸氣', 'Ice / steam')]
    ];
    else if (state.mode === 'heat') rows = [
      ['rt', T('時間 t', 'Time t')],
      ['rT', T('溫度 T', 'Temperature T')],
      ['rQ', T('加熱器供給的熱量 <span class="f">Q = Pt</span>', 'Heat supplied <span class="f">Q = Pt</span>')],
      ['rSt', T('狀態', 'State')],
      ['rSl', T('理論斜率 <span class="f">P/(mc)</span>', 'Expected slope <span class="f">P/(mc)</span>')],
      ['rCh', T('熱容量 <span class="f">C = mc</span>', 'Heat capacity <span class="f">C = mc</span>')],
      ['rQl', T('散失到室內', 'Lost to the room')]
    ];
    else rows = [
      ['rt', T('時間 t', 'Time t')],
      ['rQ', T('每個物體吸收的熱量 <span class="f">Q = Pt</span>', 'Heat received by each <span class="f">Q = Pt</span>')]
    ].concat(cmpKeys().map(function (k) { return ['rc_' + k, matName(k) + ' <span class="f">c = ' + cOf(k) + '</span>']; }));
    $('ro').innerHTML = rows.map(function (r) { return '<dt>' + r[1] + '</dt><dd id="' + r[0] + '">—</dd>'; }).join('');
    Object.keys(lastText).forEach(function (k) { delete lastText[k]; });
  }
  function updateReadout() {
    if (state.mode === 'cal') {
      const C = state.cal, pr = C.pred, p = C.phase === 'ready' ? calParams() : C.p;
      const c1 = cOf(p.mat);
      setHTML('rC1', p.mys ? '? J/K' : num(p.m1 * c1, 1) + ' J/K<small>c<sub>1</sub> = ' + c1 + ' J/(kg·K)</small>');
      setHTML('rC2', num(p.m2 * HC.C_WATER + p.Ccup, 1) + ' J/K' + (p.Ccup > 0 ? '<small>' + T('杯的水當量 ', 'cup water equivalent ') + num(p.Ccup / HC.C_WATER * 1000, 1) + ' g</small>' : ''));
      let tf = p.mys ? '?' : num(pr.Tf, 2) + ' °C';
      if (!p.mys) {
        const ph = pr.ph;
        if (ph.steam > 1e-7) tf += '<small>' + T('汽化 ', 'boils off ') + grams(ph.steam) + '</small>';
        else if (p.ice && ph.ice > 1e-7 && ph.ice < p.m1 + 1e-7) tf += '<small>' + T('剩冰 ', 'ice left ') + grams(ph.ice) + '</small>';
        else if (ph.ice > (p.ice ? p.m1 : 0) + 1e-7) tf += '<small>' + T('冰變成 ', 'ice grows to ') + grams(ph.ice) + '</small>';
        else if (p.ice) tf += '<small>' + T('冰全部融化', 'all the ice melts') + '</small>';
        if (p.loss) tf += '<small>' + T('（未計散熱）', '(ignoring heat loss)') + '</small>';
      }
      setHTML('rTf', tf);
      const sim = C.sim;
      const s = sim ? HC.mixState(sim) : null;
      setHTML('rt', num(sim ? sim.t : 0, 1) + ' s');
      setHTML('rT1', num(s ? s.TA : p.T1, 2) + ' °C');
      setHTML('rT2', num(s ? s.TB : p.T2, 2) + ' °C');
      setHTML('rP', s ? num(s.P, 1) + ' W<small>k = ' + num(sim.k, 2) + ' W/K</small>' : '—<small>k = ' + num(pr.k, 2) + ' W/K</small>');
      const QA = sim ? sim.HA - sim.HA0 : 0, QB = sim ? sim.HB - sim.HB0 : 0;
      setHTML('rQ1', sim ? fmtQ(QA) + '<small>' + (QA < 0 ? T('放熱', 'given out') : QA > 0 ? T('吸熱', 'taken in') : '') + '</small>' : '—');
      setHTML('rQ2', sim ? fmtQ(QB) + '<small>' + (QB < 0 ? T('放熱', 'given out') : QB > 0 ? T('吸熱', 'taken in') : '') + '</small>' : '—');
      setHTML('rQl', p.loss ? (sim ? fmtQ(sim.Qloss) : '0 J') : T('—（隔熱）', '— (insulated)'));
      let ice = '—';
      if (sim) {
        const ph = iceSteam(sim, sim.HA, sim.HB);
        if (ph.ice > 1e-7 || p.ice) ice = T('冰 ', 'ice ') + grams(ph.ice);
        if (ph.steam > 1e-7) ice += (ice === '—' ? '' : '<small>') + T('水蒸氣 ', 'steam ') + grams(ph.steam) + (ice === '—' ? '' : '</small>');
      } else if (p.ice) ice = T('冰 ', 'ice ') + grams(p.m1);
      setHTML('rIce', ice.replace(/^—<small>/, ''));
    } else if (state.mode === 'heat') {
      const Hh = state.heat, pr = Hh.pred, p = Hh.phase === 'ready' ? heatParams() : Hh.p;
      const body = Hh.body || pr.su.b, H = Hh.body ? Hh.H : pr.su.H0;
      const st = HC.stateOf(body, H);
      setHTML('rt', num(Hh.t, 1) + ' s');
      setHTML('rT', num(st.T, 2) + ' °C');
      setHTML('rQ', fmtQ(Hh.Qin));
      setHTML('rSt', phaseText(st, p));
      let sl;
      if (p.mys) sl = '?';
      else if (st.seg.kind === 'lat') sl = T('0（溫度不變）', '0 (constant temperature)');
      else sl = num(p.P / st.seg.C, 4) + ' °C/s' + (p.loss ? '<small>' + T('不計散熱', 'without heat loss') + '</small>' : '');
      setHTML('rSl', sl);
      setHTML('rCh', p.mys ? '? J/K' : st.seg.kind === 'lat' ? T('—（相變中）', '— (changing phase)') : num(st.seg.C, 1) + ' J/K');
      setHTML('rQl', p.loss ? fmtQ(Hh.Qloss) : T('—（隔熱）', '— (insulated)'));
    } else {
      const Cm = state.cmp, p = Cm.phase === 'ready' ? cmpParams() : Cm.p;
      setHTML('rt', num(Cm.t, 1) + ' s');
      setHTML('rQ', fmtQ(p.P * Cm.t));
      Cm.items.forEach(function (it) {
        const Tn = HC.temperature(it.b, it.H);
        setHTML('rc_' + it.key, num(Tn, 2) + ' °C<small>ΔT = ' + num(Tn - p.T0, 2) + ' °C</small>');
      });
    }
  }

  // ---------- 輸出（滑桿數字） ----------
  function showOut(e, unit) { $(e.id + 'o').textContent = fmtSlider(val(e), e) + ' ' + unit; }
  function refreshOutputs() {
    showOut(el.m1, 'kg'); showOut(el.T1, '°C'); showOut(el.m2, 'kg'); showOut(el.T2, '°C'); showOut(el.cc, 'J/K');
    showOut(el.hm, 'kg'); showOut(el.hT, '°C'); showOut(el.hP, 'W');
    showOut(el.cm, 'kg'); showOut(el.cP, 'W'); showOut(el.cT, '°C');
    const p = calParams();
    $('sampleHint').textContent = p.ice ? T('冰的溫度只能在 0 °C 以下；冰的質量最多 0.3 kg。', 'Ice must be at 0 °C or below; at most 0.3 kg.')
      : p.mys ? T('先量測，再到下方「神秘金屬」核對比熱。', 'Measure it, then check its specific heat in the “Mystery metal” card.')
        : T('c = ', 'c = ') + cOf(p.mat) + ' J/(kg·K)';
  }

  // ---------- 音效（sound.js；音效關閉時完全不呼叫） ----------
  function sound() {
    const S = window.LabSound;
    return S && S.enabled() ? S : null;
  }
  function freqOf(Tc) { return 330 * Math.pow(2, (Math.max(-30, Math.min(200, Tc)) + 30) / 115); }
  const voices = { a: null, b: null, h: null };
  function stopVoices(rel) {
    ['a', 'b', 'h'].forEach(function (k) { if (voices[k]) { voices[k].stop(rel == null ? 0.2 : rel); voices[k] = null; } });
  }
  /** 量熱器：兩個溫度各一個柔和的音高，越接近熱平衡音高越接近、拍頻越慢 */
  function calVoices() {
    const S = sound(), C = state.cal;
    if (!S || C.phase !== 'run' || C.eqDone) { if (!C.eqDone && voices.a) stopVoices(); return; }
    const s = HC.mixState(C.sim);
    if (!voices.a) voices.a = S.voice({ freq: freqOf(s.TA), type: 'sine', gain: 0.06 });
    if (!voices.b) voices.b = S.voice({ freq: freqOf(s.TB), type: 'sine', gain: 0.06 });
    voices.a.set({ freq: freqOf(s.TA) }, 0.06);
    voices.b.set({ freq: freqOf(s.TB) }, 0.06);
    if (s.B.seg.kind === 'lat' && s.B.seg.i === 1 && s.P > 0) bubbleSound();
  }
  /** 加熱：音高跟著溫度；在平台上音高不變（聽得見熔化與沸騰） */
  function heatVoice() {
    const S = sound(), Hh = state.heat;
    if (!S || Hh.phase !== 'run') { if (voices.h) { voices.h.stop(0.2); voices.h = null; } return; }
    const st = HC.stateOf(Hh.body, Hh.H);
    if (!voices.h) voices.h = S.voice({ freq: freqOf(st.T), type: 'sine', gain: 0.05 });
    voices.h.set({ freq: freqOf(st.T) }, 0.06);
    if (st.seg.kind === 'lat' && st.seg.i === 1) bubbleSound();
  }
  let lastBubble = 0;
  function bubbleSound() {
    const S = sound(); if (!S) return;
    const now = performance.now();
    if (now - lastBubble < 70 + Math.random() * 110) return;
    lastBubble = now;
    const f = 520 + Math.random() * 520;
    S.sweep({ from: f, to: f * 1.7, dur: 0.045, type: 'sine', gain: 0.12 + Math.random() * 0.08 });
  }
  function splashSound(T1, T2, isIce) {
    const S = sound(); if (!S) return;
    S.noise({ dur: 0.16, gain: 0.55, filter: 1700, q: 0.8 });
    S.sweep({ from: 900, to: 300, dur: 0.14, type: 'sine', gain: 0.4 });
    S.noise({ dur: 0.25, gain: 0.25, filter: 3200, q: 1.2, delay: 0.05 });
    if (T1 > 100 && !isIce) {
      // 嘶嘶聲：高溫樣品接觸水，表面的水瞬間汽化
      const g = Math.min(0.5, 0.15 + (T1 - 100) / 250);
      S.noise({ dur: 0.5 + (T1 - 100) / 200, gain: g, filter: 5200, q: 0.7, filterType: 'highpass', delay: 0.04 });
    }
  }
  function chimeSound() {
    const S = sound(); if (!S) return;
    S.tone({ freq: 784, dur: 0.3, type: 'sine', gain: 0.3 });
    S.tone({ freq: 1175, dur: 0.4, type: 'sine', gain: 0.25, delay: 0.1 });
    S.tone({ freq: 1568, dur: 0.5, type: 'sine', gain: 0.18, delay: 0.2 });
  }
  function phaseSound(up) {
    const S = sound(); if (!S) return;
    S.tone({ freq: up ? 988 : 659, dur: 0.18, type: 'triangle', gain: 0.25 });
    S.tone({ freq: up ? 1319 : 494, dur: 0.22, type: 'sine', gain: 0.18, delay: 0.08 });
  }
  function clickSound() {
    const S = sound(); if (!S) return;
    S.tone({ freq: 1500, dur: 0.03, type: 'sine', gain: 0.35 });
    S.tone({ freq: 750, dur: 0.05, type: 'triangle', gain: 0.2 });
  }
  let lastBand = 0;
  function bandSound(band) {
    const S = sound(); if (!S) return;
    const now = performance.now();
    if (now - lastBand < 60) return;
    lastBand = now;
    const f = [523, 659, 784, 988, 1175, 1319][Math.max(0, Math.min(5, band - 1))];
    S.tone({ freq: f, dur: 0.12, type: 'sine', gain: 0.22 });
  }
  function buzzSound() {
    const S = sound(); if (!S) return;
    S.tone({ freq: 300, dur: 0.16, type: 'triangle', gain: 0.3 });
    S.tone({ freq: 285, dur: 0.16, type: 'triangle', gain: 0.2, delay: 0.02 });
  }

  // ---------- 任務事件 ----------
  function emit(type, data) { if (window.LabMission && state.acted) window.LabMission.emit(type, data); }

  // ---------- 動畫 ----------
  let lastT = 0, loopOn = false;
  function busy() {
    const m = state.mode;
    if (m === 'cal') return state.cal.phase === 'run' || state.cal.phase === 'drop';
    if (m === 'heat') return state.heat.phase === 'run';
    return state.cmp.phase === 'run';
  }
  function tick(tNow) {
    const dtR = Math.min((tNow - lastT) / 1000, 1 / 30);
    lastT = tNow;
    if (state.mode === 'cal') calStep(dtR);
    else if (state.mode === 'heat') heatStep(dtR);
    else cmpStep(dtR);
    draw();
    if (busy() || state.fx.length) requestAnimationFrame(tick); else loopOn = false;
  }
  function startLoop() {
    if (loopOn) return;
    loopOn = true;
    lastT = performance.now();
    requestAnimationFrame(tick);
  }

  // ---------- 按鈕 ----------
  function updateButtons() {
    const m = state.mode;
    let txt;
    if (m === 'cal') {
      const ph = state.cal.phase;
      txt = ph === 'ready' || ph === 'drop' ? T('放入樣品', 'Drop the sample in') : ph === 'run' ? T('暫停', 'Pause') : ph === 'pause' ? T('繼續', 'Resume') : T('再做一次', 'Run again');
      $('play').disabled = ph === 'drop';
    } else {
      const ph = state[m].phase;
      txt = ph === 'ready' ? T('開始加熱', 'Start heating') : ph === 'run' ? T('暫停', 'Pause') : ph === 'pause' ? T('繼續', 'Resume') : (m === 'heat' ? T('再加熱一次', 'Heat again') : T('再做一次', 'Run again'));
      $('play').disabled = false;
    }
    $('play').textContent = txt;
    $('rec').hidden = m !== 'heat';
    $('rec').disabled = !(m === 'heat' && state.heat.body && state.heat.t > 0);
  }

  $('play').addEventListener('click', function () {
    const m = state.mode;
    state.acted = true;
    if (m === 'cal') {
      const C = state.cal;
      if (C.phase === 'ready') calStart();
      else if (C.phase === 'run') { C.phase = 'pause'; stopVoices(); describeCanvas(); }
      else if (C.phase === 'pause') { C.phase = 'run'; startLoop(); }
      else if (C.phase === 'done') { calArchive(); calReset(); calStart(); }
    } else if (m === 'heat') {
      const Hh = state.heat;
      if (Hh.phase === 'ready') heatStart();
      else if (Hh.phase === 'run') { Hh.phase = 'pause'; stopVoices(); describeCanvas(); }
      else if (Hh.phase === 'pause') { Hh.phase = 'run'; startLoop(); }
      else { heatArchive(); heatReset(); heatStart(); }
    } else {
      const Cm = state.cmp;
      if (Cm.phase === 'ready') cmpStart();
      else if (Cm.phase === 'run') {
        Cm.phase = 'pause';
        describeCanvas();
        emit('pause', { mode: 'cmp', t: Cm.t, Q: Cm.p.P * Cm.t, n: Cm.items.length, m: Cm.p.m, P: Cm.p.P, T0: Cm.p.T0, keys: Cm.items.map(function (it) { return it.key; }) });
      } else if (Cm.phase === 'pause') { Cm.phase = 'run'; startLoop(); }
      else { cmpReset(); cmpStart(); }
    }
    updateButtons();
    requestDraw();
  });
  $('rec').addEventListener('click', recordPoint);

  // 全部清除：清掉保留的曲線、紀錄點與這一次的實驗（滑桿設定不變）
  $('reset').addEventListener('click', function () {
    state.acted = true;
    const m = state.mode;
    if (m === 'cal') { state.cal.ghosts = []; calReset(); calPredict(); }
    else if (m === 'heat') { state.heat.ghosts = []; heatReset(); heatPredict(); }
    else cmpReset();
    state.fx = [];
    setStatus(T('已全部清除，滑桿設定不變。', 'Everything is cleared; the slider settings are kept.'));
    updateButtons();
    requestDraw();
  });

  // 播放速度
  const speedBtns = Array.prototype.slice.call(document.querySelectorAll('[data-speed]'));
  function updateSpeedButtons() {
    speedBtns.forEach(function (b) { b.setAttribute('aria-pressed', String(+b.dataset.speed === state.speed[state.mode])); });
  }
  speedBtns.forEach(function (b) {
    b.addEventListener('click', function () { state.speed[state.mode] = +b.dataset.speed; updateSpeedButtons(); requestDraw(); });
  });

  // 喇叭按鈕：切換全站音效設定（齒輪面板也能切換，兩邊同步）
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  $('soundBtn').addEventListener('click', function () {
    if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound'));
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) {
    if (ev.detail && ev.detail.name === 'sound') { updateSoundButton(); if (!ev.detail.value) { voices.a = voices.b = voices.h = null; } }
  });

  // ---------- 材料按鈕 ----------
  function chip(key, pressed, cText) {
    return '<button type="button" data-key="' + key + '" aria-pressed="' + pressed + '"><span class="sw" style="background:' + matColor(key) + '"></span><b>' + matName(key) + '</b><small>' + cText + '</small></button>';
  }
  function renderChips() {
    $('calMats').innerHTML = CAL_LIST.map(function (k) { return chip(k, k === state.cal.mat, k === 'mys' ? 'c = ?' : String(cOf(k))); }).join('');
    $('heatMats').innerHTML = HEAT_LIST.map(function (k) { return chip(k, k === state.heat.mat, k === 'mys' ? 'c = ?' : k === 'h2o' ? T('含冰', '+ ice') : String(cOf(k))); }).join('');
    $('cmpMats').innerHTML = CMP_LIST.map(function (k) { return chip(k, !!state.cmp.on[k], String(cOf(k))); }).join('');
    // 比較圖的圖例
    $('legCmp').innerHTML = cmpKeys().map(function (k) { return '<span><i style="background:' + lineColor(k) + '"></i>' + matName(k) + '</span>'; }).join('');
  }
  $('calMats').addEventListener('click', function (e) {
    const b = e.target.closest('button[data-key]'); if (!b) return;
    const key = b.dataset.key;
    if (key === state.cal.mat) return;
    const wasIce = state.cal.mat === 'ice', isIce = key === 'ice';
    state.cal.mat = key;
    if (wasIce !== isIce) {
      // 冰：−30 ～ 0 °C、最多 0.3 kg；其他樣品：−20 ～ 200 °C、最多 1 kg
      el.T1.min = isIce ? '-30' : '-20'; el.T1.max = isIce ? '0' : '200';
      el.m1.max = isIce ? '0.3' : '1';
      const v = isIce ? state.cal.T1mem.ice : state.cal.T1mem.solid;
      memLock = true;
      if (window.LabNum) { window.LabNum.set(el.T1, v); if (val(el.m1) > +el.m1.max) window.LabNum.set(el.m1, +el.m1.max); }
      else { el.T1.value = v; }
      memLock = false;
    }
    renderChips();
    updateMysCard();
    calChanged();
  });
  $('heatMats').addEventListener('click', function (e) {
    const b = e.target.closest('button[data-key]'); if (!b) return;
    if (b.dataset.key === state.heat.mat) return;
    state.heat.mat = b.dataset.key;
    renderChips();
    updateMysCard();
    heatChanged();
  });
  $('cmpMats').addEventListener('click', function (e) {
    const b = e.target.closest('button[data-key]'); if (!b) return;
    state.cmp.on[b.dataset.key] = !state.cmp.on[b.dataset.key];
    renderChips();
    buildReadout();
    cmpChanged();
    resize();
  });

  // ---------- 神秘金屬 ----------
  function mysActive() {
    return (state.mode === 'cal' && state.cal.mat === 'mys') || (state.mode === 'heat' && state.heat.mat === 'mys');
  }
  function updateMysCard() { $('mysCard').hidden = !mysActive(); }
  $('guessBtn').addEventListener('click', function () {
    state.acted = true;
    const raw = String($('guessC').value || '').normalize('NFKC').replace(/[，,]/g, '.').replace(/\s+/g, '');
    const c = parseFloat(raw);
    const v = $('verdict');
    if (!isFinite(c) || c <= 0) { v.className = 'verdict bad'; v.textContent = T('請輸入一個正數。', 'Please enter a positive number.'); return; }
    if (!state.mysMeasured) { v.className = 'verdict bad'; v.textContent = T('先做實驗量測（達到熱平衡，或在加熱曲線上記錄兩個點），再核對答案。', 'Measure first (reach equilibrium, or record two points on the heating curve), then check.'); return; }
    const cTrue = HC.SUBSTANCES[state.mysId].phases[0].c;
    const err = c / cTrue - 1;
    if (Math.abs(err) <= 0.03) {
      const nm = MYS_NAME[state.mysId];
      v.className = 'verdict good';
      v.textContent = T('正確！這塊是' + nm[0] + '，c = ' + cTrue + ' J/(kg·K)（你的誤差 ' + num(err * 100, 1) + '%）。', 'Correct! It is ' + nm[1] + ', c = ' + cTrue + ' J/(kg·K) (your error ' + num(err * 100, 1) + '%).');
      chimeSound();
    } else {
      v.className = 'verdict bad';
      v.textContent = Math.abs(err) <= 0.15 ? T('很接近了，但誤差超過 3%。再檢查一次數據與計算。', 'Close, but more than 3% off. Check your data and calculation again.')
        : T('還差很多。提示：放熱 = 吸熱，或 c = PΔt/(mΔT)。', 'Quite far off. Hint: heat given out = heat taken in, or c = PΔt/(mΔT).');
      buzzSound();
    }
    emit('guess', { c: c, cTrue: cTrue, err: err, measured: state.mysMeasured, id: state.mysId });
  });
  $('guessC').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); $('guessBtn').click(); } });
  $('newMys').addEventListener('click', function () {
    state.acted = true;
    state.mysId = pickMystery(state.mysId);
    state.mysMeasured = false;
    $('verdict').textContent = ''; $('guessC').value = '';
    if (state.cal.mat === 'mys') calChanged();
    if (state.heat.mat === 'mys') heatChanged();
    setStatus(T('換了一塊新的神秘金屬。', 'Here is a new mystery metal.'));
  });

  // ---------- 模式 ----------
  const modeHints = {
    cal: function () { return T('把樣品放進隔熱的量熱器，觀察熱平衡。', 'Drop a sample into an insulated calorimeter and watch it reach equilibrium.'); },
    heat: function () { return T('用固定功率加熱，畫出加熱曲線並由斜率測比熱。', 'Heat at constant power, draw the heating curve and measure c from the slope.'); },
    cmp: function () { return T('同樣的熱量給同質量的不同材料，比較升溫。', 'Give the same heat to equal masses of different materials and compare.'); }
  };
  function setMode(m) {
    if (m === state.mode) return;
    // 離開的模式：暫停進行中的實驗
    const old = state.mode;
    if (old === 'cal' && (state.cal.phase === 'run')) state.cal.phase = 'pause';
    if (old === 'cal' && state.cal.phase === 'drop') { calTouchdown(); state.cal.phase = 'pause'; }
    if (old !== 'cal' && state[old].phase === 'run') state[old].phase = 'pause';
    stopVoices();
    state.mode = m;
    $('modeCal').setAttribute('aria-pressed', String(m === 'cal'));
    $('modeHeat').setAttribute('aria-pressed', String(m === 'heat'));
    $('modeCmp').setAttribute('aria-pressed', String(m === 'cmp'));
    document.querySelectorAll('[data-mode]').forEach(function (c) { c.hidden = c.dataset.mode !== m; });
    $('legCal').hidden = m !== 'cal'; $('legHeat').hidden = m !== 'heat'; $('legCmp').hidden = m !== 'cmp';
    $('stageHint').innerHTML = m === 'cal' ? T('剖面側視圖，杯子與樣品依實際比例繪製；物體周圍光暈的顏色只代表溫度（紅＝熱、藍＝冷）。圖上變淡的曲線是先前幾次的結果。', 'Cut-away side view; the cup and the sample are drawn to scale. The glow colour around an object only shows its temperature (red = hot, blue = cold). Faded curves on the graph are earlier runs.')
      : m === 'heat' ? T('容器與物體依比例繪製。淡色底的時段是相變平台：持續吸熱，溫度卻不變。菱形是你記錄的數據點。', 'The container and the object are drawn to scale. Shaded intervals are phase-change plateaus: heat keeps flowing in but the temperature does not change. Diamonds are the points you recorded.')
        : T('每個物體質量相同，所以密度小的體積比較大（依比例）。溫度計的高度代表溫度。', 'All objects have the same mass, so the less dense ones are bigger (to scale). The height of each thermometer shows its temperature.');
    $('modeHint').textContent = modeHints[m]();
    updateMysCard();
    updateSpeedButtons();
    buildReadout();
    updateButtons();
    setStatus('');
    resize();
  }
  $('modeCal').addEventListener('click', function () { setMode('cal'); });
  $('modeHeat').addEventListener('click', function () { setMode('heat'); });
  $('modeCmp').addEventListener('click', function () { setMode('cmp'); });

  // ---------- 滑桿 ----------
  let memLock = false;
  [el.m1, el.T1, el.m2, el.T2, el.cc].forEach(function (e) {
    e.addEventListener('input', function () {
      if (e === el.T1 && !memLock) state.cal.T1mem[state.cal.mat === 'ice' ? 'ice' : 'solid'] = val(el.T1);
      calChanged();
    });
  });
  el.stir.addEventListener('change', calChanged);
  el.lossC.addEventListener('change', function () { calChanged(); if (L && !L.wide) resize(); });
  [el.hm, el.hT, el.hP].forEach(function (e) { e.addEventListener('input', heatChanged); });
  el.lossH.addEventListener('change', heatChanged);
  [el.cm, el.cP, el.cT].forEach(function (e) { e.addEventListener('input', cmpChanged); });
  // 放開滑桿（或打字輸入完成）時才播報預測，拖曳途中不播報
  [el.m1, el.T1, el.m2, el.T2, el.cc, el.stir, el.lossC, el.hm, el.hT, el.hP, el.lossH, el.cm, el.cP, el.cT].forEach(function (e) { e.addEventListener('change', announcePrediction); });
  ['calMats', 'heatMats', 'cmpMats'].forEach(function (id) { $(id).addEventListener('click', function (e) { if (e.target.closest('button[data-key]')) announcePrediction(); }); });

  // ---------- 分享連結：比較的材料（可複選的切換鈕）與神秘金屬 ----------
  // 分享只會「按下」按鈕、不會放開，所以比較材料的組合自己記；神秘金屬記成清單中的序號（全班拿到同一塊）
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () { return { cmp: CMP_LIST.filter(function (k) { return !!state.cmp.on[k]; }), mys: HC.MYSTERY_IDS.indexOf(state.mysId) }; },
    set: function (v) {
      if (!v || typeof v !== 'object') return;
      if (Array.isArray(v.cmp)) {
        CMP_LIST.forEach(function (k) { state.cmp.on[k] = v.cmp.indexOf(k) >= 0; });
        renderChips();
        if (state.mode === 'cmp') buildReadout();
        cmpChanged();
        resize();
      }
      const i = Math.round(Number(v.mys));
      if (isFinite(i) && i >= 0 && i < HC.MYSTERY_IDS.length && HC.MYSTERY_IDS[i] !== state.mysId) {
        state.mysId = HC.MYSTERY_IDS[i];
        state.mysMeasured = false;
        $('verdict').textContent = ''; $('guessC').value = '';
        if (state.cal.mat === 'mys') calChanged();
        if (state.heat.mat === 'mys') heatChanged();
      }
      describeCanvas();
    }
  });

  // ---------- 啟動 ----------
  readColors();
  renderChips();
  calPredict();
  heatPredict();
  cmpReset();
  refreshOutputs();
  renderPoints();
  $('modeHint').textContent = modeHints.cal();
  buildReadout();
  updateButtons();
  updateSpeedButtons();
  updateSoundButton();
  function themeChanged() { if (LD) LD.refresh(); readColors(); renderChips(); if (L) buildBackground(); requestDraw(); }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { if (cv.clientWidth !== lastW) { lastW = cv.clientWidth; resize(); } }).observe(cv);
  } else window.addEventListener('resize', resize);
  window.addEventListener('resize', function () { resize(); });
  resize();
  describeCanvas();
})();
