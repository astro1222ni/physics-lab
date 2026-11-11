/* incline-friction.js — 「斜面與摩擦力」模組的畫面與互動（物理計算在 incline-friction-core.js） */
(function () {
  'use strict';
  const IC = window.InclineCore;
  const $ = function (id) { return document.getElementById(id); };
  // 介面文字：英文模式用第二個字串（settings.js）
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  // 滑桿讀值：打字輸入的精確值（numinput.js）優先
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const D2R = Math.PI / 180;

  // ---------- 幾何（公尺，畫面依比例） ----------
  const BOARD = 2.2;                  // 木板長
  const BT = 0.05;                    // 木板厚
  const BL = 0.20, BH = 0.12;         // 木塊長、高
  const PEG_W = 0.04, PEG_H = 0.05;   // 上端的擋釘
  const STOP_W = 0.06, STOP_H = 0.09; // 下端的擋板
  const XMIN = -0.2;                  // 起點上方還有 0.2 m（往上推時有空間，x = −0.2 m 時碰到上端擋釘）
  const X0 = PEG_W + BL / 2 - XMIN;   // x = 0（頂端起點）時，木塊中心離木板上端的距離
  const XMAX = 1.70;                  // x = 1.70 m 時碰到下端擋板
  const GATES = [0.5, 1.5];           // 光電門位置 x（m）
  const OPT = { xMin: XMIN, xMax: XMAX, gates: GATES };
  const SLOW = 0.25;                  // 慢動作倍率
  const RAISE_RATE = 2;               // 「慢慢抬高」：每秒 2°
  const MARK_DT = 0.1;                // 殘影間隔（s）
  const SUB_DT = 0.002;               // 角度或外力連續改變時的模擬時間步長（s）
  const F_MIN_ALONG = -50, F_MAX = 100;

  const SURF = {
    wood: { block: 'wood', board: 'wood' },
    steel: { block: 'steel', board: 'steel' },
    rubber: { block: 'rubber', board: 'concrete' },
    glass: { block: 'glass', board: 'glass' },
    snow: { block: 'waxed', board: 'snow' },
    ice: { block: 'ice', board: 'ice' },
    custom: { block: 'custom', board: 'plain' },
    mystery: { block: 'mystery', board: 'plain' }
  };

  const state = {
    theta: 20, m: 2, surf: 'wood', cmus: 0.6, cmuk: 0.4, mode: 'along', F: 0, start: 'top', v0: 0,
    phase: 'held',          // 'held' 手扶著 | 'run' 放手後計時中 | 'pause' 暫停
    s: IC.newState(0, 0, 0),
    run: null,              // 這一次放手的紀錄（時間序列、光電門…）
    ghosts: [],             // 之前幾次的運動圖（淡色）
    ff: [],                 // 摩擦力–外力圖的資料點
    records: [], recN: 0,
    raising: false, ramping: false, rampLeft: null,
    slow: false, graph: 'v',
    show: { comp: true, net: true, crit: true, marks: true },
    cause: null,            // 最近一次改變的是什麼（判斷木塊為什麼開始滑）
    epoch: 0,               // 條件每改變一次加 1
    fx: [],                 // 純裝飾的短暫效果
    mystery: null,          // 神秘表面 { mus, muk, tries }
    runSeq: 0, lastFF: null,
    hover: false, dragging: false
  };

  function mu() {
    if (state.surf === 'custom') return { mus: state.cmus, muk: Math.min(state.cmuk, state.cmus) };
    if (state.surf === 'mystery') return state.mystery;
    const s = IC.SURFACES.find(function (o) { return o.id === state.surf; }) || IC.SURFACES[0];
    return { mus: s.mus, muk: s.muk };
  }
  function params() {
    const u = mu();
    return { m: state.m, theta: state.theta * D2R, mus: u.mus, muk: u.muk, F: state.F, mode: state.mode };
  }
  function contactNow() { return state.phase === 'held' ? 2 : state.s.contact; }
  function forcesNow() { return IC.forcesAt(params(), state.s.v, contactNow()); }
  function mystery() { return state.surf === 'mystery'; }
  function startPos() { return state.start === 'top' ? { x: 0, contact: 0 } : { x: XMAX, contact: 1 }; }
  function rampRate() { return Math.max(1, Math.min(8, 0.25 * state.m * IC.G)); }

  // ---------- 色彩（lab.css 代號；混色工具用全站共用的 LabDraw，js/drawkit.js） ----------
  const LD = window.LabDraw;
  const FONT = LD.FONT;
  const alpha = LD.alpha, shade = LD.shade, mix = LD.mix;
  let colors = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--text', '--muted', '--border', '--accent', '--accent-soft', '--surface',
      '--pos', '--neg', '--equi', '--field', '--probe', '--b-mech', '--b-optics', '--b-wave']
      .forEach(function (k) { colors[k.slice(2)] = cs.getPropertyValue(k).trim(); });
    colors.dark = isDark();
    // 力的語意色：重力藍、正向力青綠、摩擦力紅、外力橘、合力紫
    colors.W = colors.neg; colors.N = colors.accent; colors.f = colors.pos; colors.F = colors['b-mech']; colors.net = colors['b-optics'];
  }
  function isDark() {
    const r = LD.rgb(getComputedStyle(document.documentElement).getPropertyValue('--canvas-bg'));
    return (r[0] + r[1] + r[2]) / 3 < 100;
  }
  /** 金屬零件（擋釘、支架、光電門）的底色 */
  function metalColor(light, dark) { return colors.dark ? shade(colors.field, -dark) : shade(colors.field, light); }

  /** 材質的底色（全部由 lab.css 代號調出來） */
  function material(id) {
    const c = colors, d = c.dark;
    switch (id) {
      case 'wood': return { base: d ? shade(c.equi, -0.12) : shade(c.equi, 0.42), tex: 'grain' };
      case 'boardwood': return { base: d ? shade(c.equi, -0.3) : shade(c.equi, 0.2), tex: 'grain' };
      case 'waxed': return { base: d ? shade(c.equi, 0.05) : shade(c.equi, 0.55), tex: 'grain', gloss: true };
      case 'steel': return { base: d ? shade(c.field, -0.4) : shade(c.field, 0.52), tex: 'brushed', gloss: true };
      case 'rubber': return { base: d ? shade(c.field, -0.78) : shade(c.text, 0.04), tex: 'none' };
      case 'concrete': return { base: d ? shade(c.muted, -0.4) : shade(c.muted, 0.55), tex: 'speckle' };
      case 'glass': return { base: d ? mix(c.neg, c['canvas-bg'], 0.55) : mix(c.neg, c['canvas-bg'], 0.72), tex: 'glass', gloss: true, clear: true };
      case 'snow': return { base: d ? mix(c.field, c.neg, 0.12) : shade(c.neg, 0.9), tex: 'snow' };
      case 'ice': return { base: d ? mix(c.neg, c.field, 0.45) : shade(c.neg, 0.68), tex: 'ice', gloss: true, clear: true };
      case 'custom': return { base: d ? shade(c.accent, -0.15) : shade(c.accent, 0.25), tex: 'none' };
      case 'mystery': return { base: d ? shade(c['b-optics'], -0.2) : shade(c['b-optics'], 0.2), tex: 'mystery' };
      default: return { base: d ? shade(c.muted, -0.45) : shade(c.muted, 0.45), tex: 'none' };
    }
  }

  // ---------- 數字格式 ----------
  function num(v, d) {
    if (!isFinite(v)) return '—';
    let s = v.toFixed(d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  /** 滑桿數字：顯示到可輸入的精度（去掉多餘的 0，但不少於滑桿間隔的位數） */
  function fmtSlider(v, el) {
    const dec = window.LabNum ? window.LabNum.decimals(el) : 2;
    const stepDec = (String(el.step).split('.')[1] || '').length;
    let s = (Math.round(v * Math.pow(10, dec)) / Math.pow(10, dec)).toFixed(dec);
    while (s.indexOf('.') >= 0 && s.length - s.indexOf('.') - 1 > stepDec && s.slice(-1) === '0') s = s.slice(0, -1);
    if (s.slice(-1) === '.') s = s.slice(0, -1);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  function dirWord(v) {
    if (Math.abs(v) < 1e-9) return '';
    return v > 0 ? T('沿斜面向下', 'down the slope') : T('沿斜面向上', 'up the slope');
  }
  function fsScale() {
    const fs = window.LabSettings && window.LabSettings.get ? +window.LabSettings.get('fs') || 1 : 1;
    return 1 + (fs - 1) * 0.7;
  }

  // ---------- 畫布與版面 ----------
  const cvA = $('cv'), cA = cvA.getContext('2d');
  const cvB = $('cvg'), cB = cvB.getContext('2d');
  let dpr = 1, W = 300, hA = 300, hB = 200, LA = null, LB = null, SG = null;
  const bgA = document.createElement('canvas'), bgB = document.createElement('canvas');

  function layoutA(w) {
    const narrow = w < 560;
    if (narrow) {
      const H = Math.round(w * 0.8);
      return { narrow: true, H: H, scene: { x: 0, y: 0, w: w, h: H }, fbd: null };
    }
    const H = Math.round(Math.min(w * 0.47, 470)), gap = 8, ws = Math.round(w * 0.6);
    return { narrow: false, H: H, scene: { x: 0, y: 0, w: ws, h: H }, fbd: { x: ws + gap, y: 0, w: w - ws - gap, h: H } };
  }
  function layoutB(w) {
    const narrow = w < 560, gap = narrow ? 6 : 8;
    if (narrow) {
      // 手機：受力圖佔滿整列（箭頭與標籤才不會擠在一起），下方兩張圖並排
      const h1 = Math.round(w * 0.78), h2 = Math.round(w * 0.74), half = Math.floor((w - gap) / 2);
      return {
        narrow: true, H: h1 + gap + h2,
        fbd: { x: 0, y: 0, w: w, h: h1 },
        mg: { x: 0, y: h1 + gap, w: half, h: h2 }, ff: { x: half + gap, y: h1 + gap, w: w - half - gap, h: h2 }
      };
    }
    const H = Math.round(Math.min(w * 0.3, 300)), w1 = Math.round(w * 0.55);
    return { narrow: false, H: H, fbd: null, mg: { x: 0, y: 0, w: w1, h: H }, ff: { x: w1 + gap, y: 0, w: w - w1 - gap, h: H } };
  }
  /** 斜面區的比例與鉸鏈（木板下緣右端，貼在地板上）的位置 */
  function sceneGeom(R) {
    const floorH = Math.round(Math.max(24, R.h * 0.085));
    const padT = LA.narrow ? 12 : 16, padX = 10;
    const spanX = BOARD + 0.26, spanY = BOARD + BT + 0.1;
    const k = Math.min((R.w - 2 * padX) / spanX, (R.h - floorH - padT) / spanY);
    return { k: k, hx: R.x + (R.w - spanX * k) / 2 + (BOARD + 0.02) * k, hy: R.y + R.h - floorH, floorH: floorH };
  }

  function resize() {
    const w = cvA.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    W = w;
    LA = layoutA(w); LB = layoutB(w);
    SG = sceneGeom(LA.scene);
    hA = LA.H; hB = LB.H;
    if (cvA.style.height !== hA + 'px') cvA.style.height = hA + 'px';
    if (cvB.style.height !== hB + 'px') cvB.style.height = hB + 'px';
    cvA.width = Math.round(W * dpr); cvA.height = Math.round(hA * dpr);
    cvB.width = Math.round(W * dpr); cvB.height = Math.round(hB * dpr);
    buildBackgrounds();
    draw();
  }

  function roundRect(c, x, y, w, h, r) { LD.roundRect(c, x, y, w, h, r); }

  /** 圖表與受力圖的底：全站一致的暈影背景（中心亮、四角暗）、頂邊細高光、細邊框 */
  function panelBg(c, R) {
    c.save();
    roundRect(c, R.x, R.y, R.w, R.h, 8); c.clip();
    c.translate(R.x, R.y);
    LD.backdrop(c, R.w, R.h);
    c.translate(-R.x, -R.y);
    const top = c.createLinearGradient(0, R.y, 0, R.y + 26);
    top.addColorStop(0, alpha(colors.dark ? '#ffffff' : colors['canvas-bg'], colors.dark ? 0.035 : 0.7));
    top.addColorStop(1, alpha(colors['canvas-bg'], 0));
    c.fillStyle = top;
    c.fillRect(R.x, R.y, R.w, 26);
    c.restore();
    c.strokeStyle = alpha(colors.text, colors.dark ? 0.12 : 0.09); c.lineWidth = 1;
    roundRect(c, R.x + 0.5, R.y + 0.5, R.w - 1, R.h - 1, 8); c.stroke();
  }

  /** 不變的圖層：斜面區的背景、格線、地板；其他區域的底（尺寸或主題改變時才重畫） */
  function buildBackgrounds() {
    bgA.width = cvA.width; bgA.height = cvA.height;
    bgB.width = cvB.width; bgB.height = cvB.height;
    let c = bgA.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, hA);
    const R = LA.scene, base = colors['canvas-bg'], dk = colors.dark;
    const k = SG.k, px = function (v) { return (Math.round(v * dpr) + 0.5) / dpr; };
    c.save();
    roundRect(c, R.x, R.y, R.w, R.h, 8); c.clip();
    // 牆面：全站一致的暈影背景，再加一盞由左上照下來的柔光
    c.translate(R.x, R.y);
    LD.backdrop(c, R.w, R.h);
    c.translate(-R.x, -R.y);
    const spot = c.createRadialGradient(R.x + R.w * 0.3, R.y - R.h * 0.1, 0, R.x + R.w * 0.3, R.y - R.h * 0.1, R.h * 1.1);
    spot.addColorStop(0, dk ? 'rgba(255,255,255,0.045)' : 'rgba(255,255,255,0.55)');
    spot.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = spot;
    c.fillRect(R.x, R.y, R.w, SG.hy - R.y);
    // 牆面格線（兩級）：主格線每 0.5 m、次格線每 0.1 m，以鉸鏈為原點
    LD.grid(c, R.x, R.y, R.x + R.w, SG.hy, 0.5 * k, 0.1 * k, SG.hx, SG.hy);
    // 牆角的環境光遮蔽：靠近地板的牆面略暗
    const ao = c.createLinearGradient(0, SG.hy - 22, 0, SG.hy);
    ao.addColorStop(0, LD.shadowInk(0));
    ao.addColorStop(1, LD.shadowInk(dk ? 0.22 : 0.06));
    c.fillStyle = ao;
    c.fillRect(R.x, SG.hy - 22, R.w, 22);
    // 地板（實驗桌）：頂面一條受光的窄帶，下面是由上而下加深的正面
    const floorB = R.y + R.h, topH = Math.max(5, Math.round(SG.floorH * 0.3));
    const tg = c.createLinearGradient(0, SG.hy, 0, SG.hy + topH);
    tg.addColorStop(0, shade(base, dk ? 0.1 : -0.035));
    tg.addColorStop(1, shade(base, dk ? 0.03 : -0.085));
    c.fillStyle = tg;
    c.fillRect(R.x, SG.hy, R.w, topH);
    const fg = c.createLinearGradient(0, SG.hy + topH, 0, floorB);
    fg.addColorStop(0, shade(base, dk ? -0.12 : -0.13));
    fg.addColorStop(1, shade(base, dk ? -0.45 : -0.22));
    c.fillStyle = fg;
    c.fillRect(R.x, SG.hy + topH, R.w, floorB - SG.hy - topH);
    // 正面的細紋（極淡），頂面與正面交界的稜線
    c.strokeStyle = alpha(colors.text, dk ? 0.035 : 0.045);
    c.lineWidth = 1;
    c.beginPath();
    for (let y = SG.hy + topH + 4; y < floorB; y += 4) { c.moveTo(R.x, px(y)); c.lineTo(R.x + R.w, px(y)); }
    c.stroke();
    c.strokeStyle = alpha(shade(base, 0.7), dk ? 0.14 : 0.85);
    c.beginPath(); c.moveTo(R.x, px(SG.hy + topH)); c.lineTo(R.x + R.w, px(SG.hy + topH)); c.stroke();
    c.strokeStyle = alpha(colors.text, dk ? 0.3 : 0.16);
    c.beginPath(); c.moveTo(R.x, px(SG.hy + topH + 1)); c.lineTo(R.x + R.w, px(SG.hy + topH + 1)); c.stroke();
    // 桌面後緣（物體所在的線）
    c.strokeStyle = alpha(colors.text, dk ? 0.38 : 0.3);
    c.beginPath(); c.moveTo(R.x, px(SG.hy)); c.lineTo(R.x + R.w, px(SG.hy)); c.stroke();
    c.restore();
    c.strokeStyle = alpha(colors.text, dk ? 0.12 : 0.09); c.lineWidth = 1;
    roundRect(c, R.x + 0.5, R.y + 0.5, R.w - 1, R.h - 1, 8); c.stroke();
    if (LA.fbd) panelBg(c, LA.fbd);

    c = bgB.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, hB);
    [LB.fbd, LB.mg, LB.ff].forEach(function (Rb) { if (Rb) panelBg(c, Rb); });
  }

  // ---------- 繪圖工具 ----------
  /** 把 "f_s = 3 N"、"f_{s,max}" 拆成一般字與下標 */
  function parseSub(str) {
    const out = [], re = /_\{([^}]*)\}|_([A-Za-z0-9])/g;
    let last = 0, m;
    while ((m = re.exec(str))) {
      if (m.index > last) out.push({ t: str.slice(last, m.index) });
      out.push({ t: m[1] != null ? m[1] : m[2], sub: true });
      last = re.lastIndex;
    }
    if (last < str.length) out.push({ t: str.slice(last) });
    return out;
  }
  function fontOf(size, weight, sub) {
    return (weight ? weight + ' ' : '') + (sub ? Math.round(size * 0.74 * 10) / 10 : size) + 'px ' + FONT;
  }
  function richWidth(c, parts, size, weight) {
    let w = 0;
    parts.forEach(function (p) { c.font = fontOf(size, weight, p.sub); w += c.measureText(p.t).width; });
    return w;
  }
  /**
   * 有半透明圓角底框的標籤（支援下標 _x、_{xy}）；align：'left' | 'center' | 'right'，垂直置中於 y。
   * 外觀與全站的 LabDraw.pill 一致（底框＋同色細外框）；opt.border = false 時不畫外框。傳回底框的位置。
   */
  function pill(c, str, x, y, color, size, opt) {
    opt = opt || {};
    const parts = parseSub(String(str));
    const weight = opt.weight == null ? 600 : opt.weight;
    const k = fsScale();
    const tw = richWidth(c, parts, size, weight);
    const ph = size * k + 6, pw = tw + 12;
    const al = opt.align || 'left';
    let bx = al === 'center' ? x - pw / 2 : al === 'right' ? x - pw : x;
    let by = y - ph / 2;
    if (opt.clamp) {
      const R = opt.clamp;
      bx = Math.max(R.x + 3, Math.min(R.x + R.w - pw - 3, bx));
      by = Math.max(R.y + 3, Math.min(R.y + R.h - ph - 3, by));
    }
    if (opt.bg !== false) {
      c.fillStyle = alpha(colors['canvas-bg'], colors.dark ? 0.86 : 0.9);
      roundRect(c, bx, by, pw, ph, ph / 2);
      c.fill();
      if (opt.border !== false) {
        c.strokeStyle = alpha(color, colors.dark ? 0.45 : 0.35);
        c.lineWidth = 1;
        roundRect(c, bx + 0.5, by + 0.5, pw - 1, ph - 1, (ph - 1) / 2);
        c.stroke();
      }
    }
    c.fillStyle = color;
    c.textBaseline = 'middle';
    c.textAlign = 'left';
    let cx = bx + 6;
    const cy = by + ph / 2 + 0.5;
    parts.forEach(function (p) {
      c.font = fontOf(size, weight, p.sub);
      c.fillText(p.t, cx, p.sub ? cy + size * k * 0.26 : cy);
      cx += c.measureText(p.t).width;
    });
    return { x: bx, y: by, w: pw, h: ph };
  }

  /** 折線路徑（給 LabDraw.tube 用） */
  function polyPath(pts) {
    return function (g) { pts.forEach(function (p, i) { if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }); };
  }

  /**
   * 向量箭頭（全站共用的 LabDraw.arrow：略帶弧度的箭頭、背景色描邊、箭身高光）。
   * (x0, y0) 起點，(ux, uy) 單位方向（畫布座標），len 像素長度（箭頭尖端就在 len 處，比例不變）；dash 為 true 時箭身畫虛線。
   */
  function arrow(c, x0, y0, ux, uy, len, lw, color, dash) {
    if (len < 0.5) return;
    LD.arrow(c, x0, y0, x0 + ux * len, y0 + uy * len, color, lw, dash ? { dash: [lw * 2.2, lw * 1.8] } : null);
  }
  /** 空心箭頭（合力）：外層有色、內層挖空 */
  function hollowArrow(c, x0, y0, ux, uy, len, lw, color) {
    if (len < 0.5) return;
    const w2 = lw + 1.6;
    arrow(c, x0, y0, ux, uy, len, w2, color, false);
    const head = Math.min(4 * w2, len * 0.45);
    if (len > head + 6) {
      c.save();
      c.strokeStyle = alpha(colors['canvas-bg'], 0.94);
      c.lineWidth = Math.max(1, lw - 1.2);
      c.lineCap = 'round';
      c.beginPath(); c.moveTo(x0 + ux * 2.5, y0 + uy * 2.5); c.lineTo(x0 + ux * (len - head * 0.95), y0 + uy * (len - head * 0.95)); c.stroke();
      c.restore();
    }
  }

  /** 圖表上「現在」的位置：立體小球（LabDraw.ball，預先畫好的小圖） */
  function sphereSmall(c, x, y, col, r) {
    r = r || (LB && LB.narrow ? 4.5 : 5.5);
    LD.ball(c, x, y, r, col, { glow: colors.dark ? 0.4 : 0.18 });
  }

  function niceStep(raw) {
    const e = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / e;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e;
  }
  /** 不小於 v 的「好看」數字（1、1.2、1.5、2、2.5、3、4、5、6、8 乘以 10 的整數次方） */
  function niceUp(v) {
    if (!(v > 0)) return 1;
    const e = Math.pow(10, Math.floor(Math.log10(v)));
    const list = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
    for (let i = 0; i < list.length; i++) if (list[i] * e >= v * (1 - 1e-9)) return list[i] * e;
    return 10 * e;
  }

  // ---------- 主繪圖 ----------
  let drawPending = false;
  function requestDraw() {
    if (drawPending) return;
    drawPending = true;
    requestAnimationFrame(function () { drawPending = false; draw(); });
  }

  function draw() {
    if (!LA) return;
    const fo = forcesNow();
    cA.setTransform(dpr, 0, 0, dpr, 0, 0);
    cA.clearRect(0, 0, W, hA);
    cA.drawImage(bgA, 0, 0, W, hA);
    drawScene(cA, LA.scene, fo);
    if (LA.fbd) drawFBD(cA, LA.fbd, fo);
    cB.setTransform(dpr, 0, 0, dpr, 0, 0);
    cB.clearRect(0, 0, W, hB);
    cB.drawImage(bgB, 0, 0, W, hB);
    if (LB.fbd) drawFBD(cB, LB.fbd, fo);
    drawMotion(cB, LB.mg);
    drawFF(cB, LB.ff, fo);
    updateReadout(fo);
  }

  // ---------- 斜面區 ----------
  /** 木板座標（s：由木板上端沿斜面向下，y：垂直斜面、往木板內為正）→ 畫布座標 */
  function boardFrame() {
    const th = state.theta * D2R, cs = Math.cos(th), sn = Math.sin(th), k = SG.k;
    // 木板上表面的上端點（世界座標，鉸鏈為原點、y 向上）：BOARD·û + BT·n̂
    const ox = -BOARD * cs + BT * sn, oy = BOARD * sn + BT * cs;
    const O = [SG.hx + ox * k, SG.hy - oy * k];
    return {
      th: th, cs: cs, sn: sn, k: k, O: O,
      at: function (s, y) { return [O[0] + (s * cs - y * sn) * k, O[1] + (s * sn + y * cs) * k]; }
    };
  }
  /** 木塊中心在木板座標中的 s */
  function blockS(x) { return X0 + x; }

  function drawScene(c, R, fo) {
    const B = boardFrame(), k = B.k;
    c.save();
    roundRect(c, R.x, R.y, R.w, R.h, 8);
    c.clip();
    c.lineCap = 'round'; c.lineJoin = 'round';

    // 臨界角參考線：木板若在 θc 的位置（虛線）
    const u = mu();
    if (state.show.crit && !mystery()) {
      const thc = Math.atan(u.mus);
      const ex = SG.hx - Math.cos(thc) * (BOARD + 0.05) * k, ey = SG.hy - Math.sin(thc) * (BOARD + 0.05) * k;
      c.strokeStyle = alpha(colors.pos, 0.5);
      c.lineWidth = 1.4;
      c.setLineDash([6, 5]);
      c.beginPath(); c.moveTo(SG.hx, SG.hy); c.lineTo(ex, ey); c.stroke();
      c.setLineDash([]);
      // 標籤放在參考線的外端（木板末端與把手的外側），偏向木板不在的那一側
      const lbl = 'θ_c = ' + num(thc / D2R, 1) + '°';
      const side = state.theta * D2R >= thc ? 1 : -1; // 1：木板在參考線上方 → 標籤放下方
      const along = (BOARD + 0.05) * k, off = 12;
      const tx = SG.hx - Math.cos(thc) * along + side * Math.sin(thc) * off - 14;
      const ty = SG.hy - Math.sin(thc) * along + side * Math.cos(thc) * off;
      pill(c, lbl, tx, ty, colors.pos, LA.narrow ? 11 : 12, { align: 'right', clamp: R, bgAlpha: 0.75 });
    }

    // 木板落在地板上的柔和陰影：靠鉸鏈（貼地）處較深，往抬高的一端（離地越高）越淡越寬
    const spanX = BOARD * B.cs * k, spanH = BOARD * B.sn * k, NSH = 8;
    for (let i = 0; i < NSH; i++) {
      const u = (i + 0.5) / NSH;
      LD.contactShadow(c, SG.hx - u * spanX, SG.hy, Math.max(7, spanX / NSH * 0.95), Math.min(1, u * spanH / (0.9 * k)) * 0.9);
    }

    // 支架：木板抬高那一端下方的立柱（畫在木板後面）
    const sup = BOARD - 0.16;
    const suX = SG.hx - sup * B.cs * k, suY = SG.hy - sup * B.sn * k;
    const metal = metalColor(0.3, 0.3);
    if (suY < SG.hy - 3) {
      const sm = metalColor(0.25, 0.35);
      LD.contactShadow(c, suX, SG.hy, 20, 0);
      LD.tube(c, function (g) { g.moveTo(suX, SG.hy - 3); g.lineTo(suX, suY + 3); }, sm, 5.5);
      // 底座（略有厚度的金屬板）
      LD.block(c, suX - 16, SG.hy - 6, 32, 6, sm, { r: 2.5, shadow: false });
      // 夾頭
      LD.ball(c, suX, suY + 2, 5, sm, { glow: 0, shadow: false });
    }

    // 鉸鏈下的接觸陰影
    LD.contactShadow(c, SG.hx + 3, SG.hy, 16, 0);

    // ---- 木板（在木板座標中畫：原點為上表面上端，x 沿斜面向下，y 往木板內） ----
    const mats = SURF[state.surf] || SURF.wood;
    const bm = material(mats.board === 'wood' ? 'boardwood' : mats.board);
    c.save();
    c.translate(B.O[0], B.O[1]);
    c.rotate(B.th);
    const bw = BOARD * k, bt = BT * k;
    // 木板的投影（落在牆上的柔和陰影；整個畫面只有木板與木塊用 shadowBlur）
    const bgr = c.createLinearGradient(0, 0, 0, bt);
    bgr.addColorStop(0, shade(bm.base, 0.3));
    bgr.addColorStop(0.22, shade(bm.base, 0.08));
    bgr.addColorStop(0.6, bm.base);
    bgr.addColorStop(1, shade(bm.base, -0.32));
    c.save();
    c.shadowColor = colors.dark ? 'rgba(0,0,0,0.55)' : alpha(colors.text, 0.24);
    c.shadowBlur = 7;
    c.shadowOffsetY = 3;
    c.fillStyle = bgr;
    roundRect(c, 0, 0, bw, bt, 3); c.fill();
    c.restore();
    c.save();
    roundRect(c, 0, 0, bw, bt, 3); c.clip();
    texture(c, bm, 0, 0, bw, bt, 7);
    // 兩端的端面（顏色較深，看得出板子有厚度）
    const cap = Math.max(2, Math.min(4, bt * 0.5));
    [0, bw - cap].forEach(function (ex) {
      const eg = c.createLinearGradient(0, 0, 0, bt);
      eg.addColorStop(0, alpha(shade(bm.base, -0.2), 0.55));
      eg.addColorStop(1, alpha(shade(bm.base, -0.5), 0.7));
      c.fillStyle = eg;
      c.fillRect(ex, 0, cap, bt);
    });
    c.restore();
    // 頂邊高光、底邊暗線
    c.lineCap = 'round';
    c.strokeStyle = alpha(shade(bm.base, 0.75), colors.dark ? 0.5 : 0.9);
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(cap + 1, 0.5); c.lineTo(bw - cap - 1, 0.5); c.stroke();
    c.strokeStyle = alpha(shade(bm.base, -0.55), 0.65);
    c.beginPath(); c.moveTo(2, bt - 0.5); c.lineTo(bw - 2, bt - 0.5); c.stroke();

    // 上端擋釘與下端擋板
    LD.block(c, 0, -PEG_H * k, PEG_W * k, PEG_H * k, metal, { r: 2, shadow: false });
    LD.block(c, (BOARD - STOP_W) * k, -STOP_H * k, STOP_W * k, STOP_H * k, metal, { r: 2, shadow: false });

    // 光電門（立柱在木塊後面）
    GATES.forEach(function (gx, i) { drawGatePost(c, (X0 + gx) * k, k, i); });

    // 殘影：每 0.1 s 木塊的位置（像連續閃光照片）
    if (state.show.marks && state.run) drawMarks(c, k, mats);

    // 木塊
    const bx = blockS(state.s.x) * k;
    drawBlock(c, bx, k, material(mats.block), fo);

    // 光電門的光束（畫在木塊前面）
    GATES.forEach(function (gx, i) { drawGateBeam(c, (X0 + gx) * k, k, i); });

    // 純裝飾效果（木板座標）
    drawEffects(c, k);
    c.restore();

    // 鉸鏈
    LD.ball(c, SG.hx, SG.hy - 1, 5.5, metal, { glow: 0 });

    // 外力 F 的方向（不依比例）
    if (Math.abs(state.F) > 1e-9) drawPushArrow(c, B, k);

    // 角度 θ：由鉸鏈向外漸淡的扇形＋細弧線
    const ar = Math.min(0.42 * k, 60);
    const ag = c.createRadialGradient(SG.hx, SG.hy, 0, SG.hx, SG.hy, ar);
    ag.addColorStop(0, alpha(colors.accent, colors.dark ? 0.26 : 0.2));
    ag.addColorStop(1, alpha(colors.accent, colors.dark ? 0.07 : 0.05));
    c.fillStyle = ag;
    c.beginPath(); c.moveTo(SG.hx, SG.hy); c.arc(SG.hx, SG.hy, ar, Math.PI, Math.PI + B.th, false); c.closePath(); c.fill();
    c.strokeStyle = alpha(colors.text, 0.62);
    c.lineWidth = 1.4;
    c.lineCap = 'round';
    c.beginPath(); c.arc(SG.hx, SG.hy, ar, Math.PI, Math.PI + B.th, false); c.stroke();
    const mid = Math.PI + B.th / 2, lr = ar + (LA.narrow ? 28 : 34);
    const thTxt = 'θ = ' + fmtSlider(state.theta, elTheta) + '°', thSize = LA.narrow ? 12 : 13;
    let lx = SG.hx + lr * Math.cos(mid), ly = SG.hy + lr * Math.sin(mid);
    if (state.theta < 8) { lx = SG.hx - ar - 34; ly = SG.hy - 14; }
    else {
      // 角度大時，角平分線上的標籤會壓到木板與殘影：改放在木板下方、弧線左邊（貼近地板）
      const pw = richWidth(c, parseSub(thTxt), thSize, 600) + 12, ph = thSize * fsScale() + 6;
      const under = function (x, y) { // 底框四角都在木板下方（地板那一側）而且在地板上方
        const nbx = -B.sn, nby = B.cs;
        return [[x - pw / 2, y - ph / 2], [x + pw / 2, y - ph / 2], [x - pw / 2, y + ph / 2], [x + pw / 2, y + ph / 2]].every(function (q) {
          return (q[0] - SG.hx) * nbx + (q[1] - SG.hy) * nby >= 5;
        }) && y + ph / 2 <= SG.hy - 2 && x - pw / 2 >= R.x + 3;
      };
      if (!under(lx, ly)) {
        const fy = SG.hy - ph / 2 - 5;
        for (let i = 0; i < 4; i++) {
          const fx = SG.hx - ar - pw / 2 - 8 - i * 24;
          if (under(fx, fy)) { lx = fx; ly = fy; break; }
        }
      }
    }
    pill(c, thTxt, lx, ly, colors.text, thSize, { align: 'center', clamp: R });

    // 把手：木板抬高那一端（立體球；滑過或拖曳時放大並加光暈）
    const hp = B.at(0.02, BT / 2);
    const hot = state.hover || state.dragging;
    const hr = (LA.narrow ? 9 : 10) * (hot ? 1.08 : 1);
    if (hot) {
      const hg = c.createRadialGradient(hp[0], hp[1], hr * 0.8, hp[0], hp[1], hr + 12);
      hg.addColorStop(0, alpha(colors.accent, 0.3));
      hg.addColorStop(1, alpha(colors.accent, 0));
      c.fillStyle = hg;
      c.beginPath(); c.arc(hp[0], hp[1], hr + 12, 0, Math.PI * 2); c.fill();
    }
    LD.ball(c, hp[0], hp[1], hr, colors.accent, { glow: hot ? 0.45 : (colors.dark ? 0.25 : 0) });
    c.strokeStyle = alpha(shade(colors.accent, 0.85), 0.75);
    c.lineWidth = 1.2;
    c.beginPath(); c.arc(hp[0], hp[1], hr - 3.5, 0, Math.PI * 2); c.stroke();
    // 上下箭頭提示可拖曳
    if (!state.dragging && state.phase !== 'run') {
      c.lineJoin = 'round';
      [-1, 1].forEach(function (sg) {
        const yy = hp[1] + sg * (hr + 6);
        c.beginPath(); c.moveTo(hp[0], yy + sg * 5); c.lineTo(hp[0] - 4.5, yy); c.lineTo(hp[0] + 4.5, yy); c.closePath();
        c.strokeStyle = alpha(colors['canvas-bg'], 0.85); c.lineWidth = 2.5; c.stroke();
        c.fillStyle = alpha(colors.accent, 0.85); c.fill();
      });
    }

    // 比例尺（地板上）
    const sb = 0.5 * k, sx = R.x + 12, sy = R.y + R.h - SG.floorH / 2;
    const ruler = function (g) { g.moveTo(sx, sy - 4); g.lineTo(sx, sy + 4); g.moveTo(sx, sy); g.lineTo(sx + sb, sy); g.moveTo(sx + sb, sy - 4); g.lineTo(sx + sb, sy + 4); };
    c.lineCap = 'round';
    c.beginPath(); ruler(c);
    c.strokeStyle = alpha(colors['canvas-bg'], 0.7); c.lineWidth = 4; c.stroke();
    c.beginPath(); ruler(c);
    c.strokeStyle = alpha(colors.text, 0.75); c.lineWidth = 1.5; c.stroke();
    pill(c, '0.5 m', sx + sb + 5, sy, colors.muted, 11);

    // 文字：時間、狀態
    const f1 = LA.narrow ? 12 : 13, f2 = LA.narrow ? 11 : 12;
    let y = R.y + 14;
    const tline = 't = ' + num(state.s.t, 2) + ' s' + (state.slow ? '  (' + SLOW + '×)' : '');
    pill(c, tline, R.x + 8, y, colors.text, f1, { bgAlpha: 0.8 });
    y += LA.narrow ? 21 : 24;
    const st = sceneStatus(fo);
    pill(c, st.text, R.x + 8, y, st.color, f2, { bgAlpha: 0.8 });
    c.restore();
  }

  function sceneStatus(fo) {
    if (state.phase === 'held') return { text: T('手扶著（按「放手」）', 'Held by hand (press Release)'), color: colors.muted };
    const pre = state.phase === 'pause' ? T('暫停・', 'Paused · ') : '';
    if (state.s.v !== 0) return { text: pre + T('滑動中：動摩擦力', 'Sliding: kinetic friction'), color: colors.pos };
    if (fo.P !== 0) return { text: pre + T('靠在擋板上', 'Resting against a stop'), color: colors.muted };
    return { text: pre + T('靜止：靜摩擦力', 'At rest: static friction'), color: colors.accent };
  }

  /** 材質紋理（在已裁切的區域內畫）；seed 讓每塊材質的花紋固定 */
  function texture(c, mt, x, y, w, h, seed) {
    let s = seed * 9301 + 49297;
    const rnd = function () { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    const dark = shade(mt.base, -0.45);
    c.lineWidth = 1;
    if (mt.tex === 'grain') {
      c.strokeStyle = alpha(dark, colors.dark ? 0.3 : 0.22);
      const n = Math.max(2, Math.round(h / 4));
      for (let i = 0; i < n; i++) {
        const yy = y + h * (i + 0.5 + (rnd() - 0.5) * 0.4) / n, amp = 0.6 + rnd() * 1.2, ph = rnd() * 6;
        c.beginPath();
        for (let xx = x; xx <= x + w; xx += 6) {
          const v = yy + amp * Math.sin(xx / (14 + 6 * rnd()) + ph);
          if (xx === x) c.moveTo(xx, v); else c.lineTo(xx, v);
        }
        c.stroke();
      }
    } else if (mt.tex === 'brushed') {
      c.strokeStyle = alpha(shade(mt.base, 0.6), 0.25);
      for (let i = 0; i < h; i += 2) { c.beginPath(); c.moveTo(x, y + i + 0.5); c.lineTo(x + w, y + i + 0.5); c.stroke(); }
    } else if (mt.tex === 'speckle' || mt.tex === 'snow') {
      const n = Math.round(w * h / 18);
      for (let i = 0; i < n; i++) {
        c.fillStyle = mt.tex === 'snow' ? alpha(shade(mt.base, 0.8), 0.7) : alpha(rnd() < 0.5 ? dark : shade(mt.base, 0.5), 0.35);
        c.fillRect(x + rnd() * w, y + rnd() * h, 1.2, 1.2);
      }
    } else if (mt.tex === 'glass' || mt.tex === 'ice') {
      c.strokeStyle = alpha(shade(mt.base, 0.9), mt.tex === 'ice' ? 0.6 : 0.45);
      c.lineWidth = 1.2;
      for (let xx = x + 8; xx < x + w; xx += 38 + 20 * rnd()) {
        c.beginPath(); c.moveTo(xx, y + h); c.lineTo(xx + h * 0.9, y); c.stroke();
      }
      if (mt.tex === 'ice') {
        c.strokeStyle = alpha(shade(mt.base, 0.95), 0.35);
        c.lineWidth = 0.8;
        for (let i = 0; i < 3; i++) {
          const cx = x + rnd() * w, cy = y + rnd() * h;
          c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + 5 + rnd() * 6, cy + 2); c.lineTo(cx + 9, cy - 2); c.stroke();
        }
      }
    } else if (mt.tex === 'mystery') {
      c.fillStyle = alpha(shade(mt.base, 0.7), 0.7);
      c.font = '700 ' + Math.round(Math.min(h * 0.75, 15)) + 'px ' + FONT;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('?', x + w / 2, y + h / 2 + 0.5);
    }
  }

  /**
   * 有立體感的木塊（木板座標，底面中心在 (cx, 0)）：上亮下暗、左側受光右側背光、頂面斜角高光、材質紋理與光澤。
   * opts：{ shadow（柔和投影，預設 true）, a（整體不透明度）}
   */
  function solidBlock(c, cx, w, h, mt, opts) {
    opts = opts || {};
    const x = cx - w / 2, y = -h, r = Math.min(4, h * 0.2);
    const g = c.createLinearGradient(0, y, 0, 0);
    g.addColorStop(0, shade(mt.base, 0.3));
    g.addColorStop(0.18, shade(mt.base, 0.1));
    g.addColorStop(0.55, mt.base);
    g.addColorStop(1, shade(mt.base, -0.32));
    c.save();
    c.globalAlpha = (opts.a == null ? 1 : opts.a) * (mt.clear ? 0.9 : 1);
    if (opts.shadow !== false) {
      c.shadowColor = colors.dark ? 'rgba(0,0,0,0.55)' : alpha(colors.text, 0.26);
      c.shadowBlur = 8;
      c.shadowOffsetY = 3;
    }
    c.fillStyle = g;
    roundRect(c, x, y, w, h, r); c.fill();
    c.restore();
    c.save();
    if (opts.a != null) c.globalAlpha = opts.a;
    roundRect(c, x, y, w, h, r); c.clip();
    texture(c, mt, x, y, w, h, 3);
    // 左側受光、右側背光（圓柱般的側面明暗）
    const sg = c.createLinearGradient(x, 0, x + w, 0);
    sg.addColorStop(0, 'rgba(255,255,255,' + (colors.dark ? 0.1 : 0.2) + ')');
    sg.addColorStop(0.18, 'rgba(255,255,255,0)');
    sg.addColorStop(0.8, 'rgba(0,0,0,0)');
    sg.addColorStop(1, 'rgba(0,0,0,' + (colors.dark ? 0.22 : 0.12) + ')');
    c.fillStyle = sg;
    c.fillRect(x, y, w, h);
    if (mt.gloss) {
      const gg = c.createLinearGradient(x, y, x + w * 0.6, y + h);
      gg.addColorStop(0, 'rgba(255,255,255,' + (colors.dark ? 0.2 : 0.38) + ')');
      gg.addColorStop(0.5, 'rgba(255,255,255,0)');
      c.fillStyle = gg;
      c.fillRect(x, y, w, h);
    }
    // 頂面的斜角高光帶
    const bev = Math.max(1.5, h * 0.14);
    const bg = c.createLinearGradient(0, y, 0, y + bev);
    bg.addColorStop(0, alpha(shade(mt.base, 0.8), colors.dark ? 0.45 : 0.7));
    bg.addColorStop(1, alpha(shade(mt.base, 0.8), 0));
    c.fillStyle = bg;
    c.fillRect(x, y, w, bev);
    c.restore();
    c.save();
    if (opts.a != null) c.globalAlpha = opts.a;
    c.lineCap = 'round';
    c.strokeStyle = alpha(shade(mt.base, 0.85), colors.dark ? 0.55 : 0.9);
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(x + r, y + 0.5); c.lineTo(x + w - r, y + 0.5); c.stroke();
    c.strokeStyle = alpha(shade(mt.base, -0.55), colors.dark ? 0.7 : 0.55);
    roundRect(c, x + 0.5, y + 0.5, w - 1, h - 1, Math.max(0, r - 0.5)); c.stroke();
    c.restore();
  }

  function drawBlock(c, bx, k, mt, fo) {
    const w = BL * k, h = BH * k, x = bx - w / 2;
    // 與斜面的接觸陰影（貼著木板表面）
    const sh = c.createRadialGradient(bx, 0, 1, bx, 0, w * 0.62);
    sh.addColorStop(0, LD.shadowInk(colors.dark ? 0.55 : 0.3));
    sh.addColorStop(1, LD.shadowInk(0));
    c.fillStyle = sh;
    c.beginPath(); c.ellipse(bx, 0.5, w * 0.64, Math.max(3, h * 0.24), 0, 0, Math.PI * 2); c.fill();
    solidBlock(c, bx, w, h, mt);
    // 滑動中：木塊與斜面交界處淡淡的摩擦熱光（裝飾，只在滑動時）
    if (state.s.v !== 0 && !reducedMotion) {
      const heat = Math.min(1, fo.fk * Math.abs(state.s.v) / 60);
      if (heat > 0.02) {
        const hg = c.createLinearGradient(0, -3, 0, 2);
        hg.addColorStop(0, alpha(colors.pos, 0));
        hg.addColorStop(1, alpha(colors.pos, 0.45 * heat));
        c.fillStyle = hg;
        c.fillRect(x + 1, -3, w - 2, 3);
      }
    }
  }

  function drawMarks(c, k, mats) {
    const run = state.run, sm = run.samples;
    if (sm.length < 2) return;
    const tEnd = sm[sm.length - 1].t;
    const mt = material(mats.block);
    const w = BL * k, h = BH * k;
    let lastX = null, j = 0;
    const xs = [];
    for (let tk = 0; tk <= tEnd + 1e-9 && xs.length < 80; tk += MARK_DT) {
      while (j < sm.length - 2 && sm[j + 1].t < tk) j++;
      const a = sm[j], b = sm[Math.min(j + 1, sm.length - 1)];
      const u = b.t > a.t ? Math.max(0, Math.min(1, (tk - a.t) / (b.t - a.t))) : 0;
      const x = a.x + (b.x - a.x) * u;
      if (lastX != null && Math.abs(x - lastX) < 0.003) continue;
      lastX = x;
      xs.push(x);
    }
    // 像連續閃光照片：每個殘影是半透明的木塊輪廓，越舊越淡（位置仍然精確）
    const edge = shade(mt.base, colors.dark ? 0.35 : -0.35);
    const fill = c.createLinearGradient(0, -h, 0, 0);
    fill.addColorStop(0, alpha(shade(mt.base, 0.3), colors.dark ? 0.1 : 0.22));
    fill.addColorStop(1, alpha(mt.base, colors.dark ? 0.05 : 0.08));
    c.lineWidth = 1;
    xs.forEach(function (x, i) {
      const age = xs.length > 1 ? i / (xs.length - 1) : 1, fa = 0.4 + 0.6 * age;
      const cx = (X0 + x) * k;
      c.globalAlpha = fa;
      c.fillStyle = fill;
      c.strokeStyle = alpha(edge, 0.5);
      roundRect(c, cx - w / 2 + 0.5, -h + 0.5, w - 1, h - 1, 3); c.fill(); c.stroke();
      c.fillStyle = alpha(colors.text, 0.5);
      c.beginPath(); c.arc(cx, -h / 2, 1.6, 0, Math.PI * 2); c.fill();
    });
    c.globalAlpha = 1;
  }

  function gateFlash(i) {
    let a = 0;
    state.fx.forEach(function (e) { if (e.type === 'gate' && e.i === i) a = Math.max(a, 1 - (performance.now() - e.t0) / e.dur); });
    return a;
  }
  function gateBlocked(i) { return Math.abs(state.s.x - GATES[i]) <= BL / 2; }

  function drawGatePost(c, gx, k, i) {
    const top = -0.27 * k, metal = metalColor(0.15, 0.45);
    const px = gx + 0.035 * k;
    LD.tube(c, function (g) { g.moveTo(px, -1); g.lineTo(px, top + 4); }, metal, Math.max(2.8, 0.018 * k));
    // 感測頭（立體金屬盒）與指示燈：被擋住或剛觸發時亮起並發光
    const hw = 0.09 * k, hh = 0.045 * k;
    LD.block(c, gx - hw / 2, top - hh, hw, hh, metal, { r: 2.5, shadow: false });
    const lit = gateBlocked(i) || gateFlash(i) > 0;
    const lx = gx + hw * 0.28, ly = top - hh / 2, lr = Math.max(1.7, hh * 0.19);
    if (lit) {
      const gl = c.createRadialGradient(lx, ly, 0, lx, ly, lr * 4.5);
      gl.addColorStop(0, alpha(colors.pos, colors.dark ? 0.6 : 0.45));
      gl.addColorStop(1, alpha(colors.pos, 0));
      c.fillStyle = gl;
      c.beginPath(); c.arc(lx, ly, lr * 4.5, 0, Math.PI * 2); c.fill();
    }
    c.fillStyle = lit ? shade(colors.pos, 0.25) : alpha(shade(colors.pos, -0.2), 0.45);
    c.beginPath(); c.arc(lx, ly, lr, 0, Math.PI * 2); c.fill();
    if (lit) { c.fillStyle = 'rgba(255,255,255,0.75)'; c.beginPath(); c.arc(lx - lr * 0.3, ly - lr * 0.3, lr * 0.4, 0, Math.PI * 2); c.fill(); }
  }
  function drawGateBeam(c, gx, k, i) {
    const top = -0.27 * k;
    const blocked = gateBlocked(i);
    const fl = gateFlash(i);
    c.save();
    c.lineCap = 'round';
    if (blocked || fl > 0) {
      // 光束發光（被木塊擋住時最亮；觸發後 0.4 s 內淡出）
      c.strokeStyle = alpha(colors.pos, (colors.dark ? 0.22 : 0.16) * (blocked ? 1 : fl));
      c.lineWidth = 5;
      c.beginPath(); c.moveTo(gx, top); c.lineTo(gx, -1); c.stroke();
    }
    c.strokeStyle = alpha(colors.pos, blocked ? 0.9 : 0.4 + 0.5 * fl);
    c.lineWidth = blocked ? 1.6 : 1.1;
    c.setLineDash([3, 3]);
    c.beginPath(); c.moveTo(gx, top); c.lineTo(gx, -1); c.stroke();
    c.restore();
    // 編號（隨木板旋轉，保持可讀：在木板座標中畫，角度不大時看得清楚）
    c.save();
    c.translate(gx, top - 0.045 * k - 9);
    c.rotate(-state.theta * D2R);
    pill(c, String(i + 1), 0, 0, colors.pos, 11, { align: 'center' });
    c.restore();
  }

  function drawPushArrow(c, B, k) {
    const bs = blockS(state.s.x);
    const ctr = B.at(bs, -BH / 2);
    const len = 0.32 * k, lw = LA.narrow ? 2.6 : 3.2;
    let ux, uy, x0, y0;
    if (state.mode === 'along') {
      // 往上推：箭頭從下坡那一側指向木塊；往下拉：箭頭從木塊下坡面往外
      const dx = B.cs, dy = B.sn; // 沿斜面向下（畫布）
      const face = [ctr[0] + dx * (BL / 2) * k, ctr[1] + dy * (BL / 2) * k];
      if (state.F > 0) { ux = -dx; uy = -dy; x0 = face[0] + dx * (len + 3); y0 = face[1] + dy * (len + 3); }
      else { ux = dx; uy = dy; x0 = face[0] + dx * 3; y0 = face[1] + dy * 3; }
    } else {
      // 水平推向斜面：從木塊右側往左推
      const right = Math.max(B.at(bs + BL / 2, -BH)[0], B.at(bs + BL / 2, 0)[0], B.at(bs - BL / 2, -BH)[0]);
      ux = -1; uy = 0; x0 = right + len + 4; y0 = ctr[1];
    }
    arrow(c, x0, y0, ux, uy, len, lw, colors.F, false);
    const lx = x0 + ux * len * 0.5 - uy * 14, ly = y0 + uy * len * 0.5 + ux * 14;
    pill(c, 'F', lx, ly, colors.F, LA.narrow ? 12 : 13, { align: 'center', weight: 700 });
  }

  function drawEffects(c, k) {
    const tNow = performance.now();
    state.fx = state.fx.filter(function (e) { return tNow - e.t0 < e.dur; });
    state.fx.forEach(function (e) {
      const u = (tNow - e.t0) / e.dur;
      const cx = (X0 + e.x) * k;
      if (e.type === 'ring') {
        const col = e.color || colors.accent, cy = -BH * k / 2;
        if (u < 0.5) {
          // 一開始的短暫閃光（純裝飾）
          c.save();
          c.translate(cx, cy); c.scale(1, BH / BL * 1.3);
          const R0 = BL * k * 0.9;
          const fg = c.createRadialGradient(0, 0, 0, 0, 0, R0);
          fg.addColorStop(0, alpha(col, 0.28 * (1 - 2 * u)));
          fg.addColorStop(1, alpha(col, 0));
          c.fillStyle = fg;
          c.beginPath(); c.arc(0, 0, R0, 0, Math.PI * 2); c.fill();
          c.restore();
        }
        c.strokeStyle = alpha(col, 0.6 * (1 - u));
        c.lineWidth = 2 * (1 - u) + 0.5;
        c.beginPath(); c.ellipse(cx, cy, BL * k * (0.6 + 0.5 * u), BH * k * (0.8 + 0.7 * u), 0, 0, Math.PI * 2); c.stroke();
      } else if (e.type === 'dust') {
        e.parts.forEach(function (p) {
          c.fillStyle = alpha(colors.muted, 0.55 * (1 - u));
          c.beginPath(); c.arc(cx + p[0] * u * 22, -2 - p[1] * u * 16 + 10 * u * u, 1.8 * (1 - u) + 0.6, 0, Math.PI * 2); c.fill();
        });
      }
    });
  }

  // ---------- 受力圖 ----------
  /** 靜摩擦力用了多少：|f| 與最大靜摩擦力 μsN 的比例（滑動時顯示 μkN）；傳回下方可放標籤的 y */
  function drawGauge(c, R, fo) {
    const narrow = R.w < 260;
    const base = R.y + (narrow ? 28 : 30);
    if (mystery() || !(fo.fsMax > 1e-9) || state.phase === 'held' && Math.abs(fo.P) > 1e-9) return base;
    const gw = narrow ? R.w - 16 : Math.min(250, R.w - 20);
    const x = narrow ? R.x + 8 : R.x + 10, y = narrow ? R.y + 26 : R.y + 28;
    const kinetic = fo.kind === 'kinetic';
    const frac = kinetic ? fo.fk / fo.fsMax : Math.min(1, Math.abs(fo.f) / fo.fsMax);
    const col = kinetic || frac > 0.97 ? colors.f : frac > 0.75 ? colors.F : colors.accent;
    const fsz = narrow ? 11 : 12;
    const a = num(kinetic ? fo.fk : Math.abs(fo.f), 2), b = num(fo.fsMax, 2);
    const txt = narrow ? (kinetic ? 'f_k ' : 'f_s ') + a + ' / ' + b + ' N'
      : kinetic ? T('動摩擦 ', 'kinetic ') + 'μ_kN = ' + a + ' N' : '|f_s| = ' + a + T(' N，最大 μ_sN = ', ' N, max μ_sN = ') + b + ' N';
    pill(c, txt, x - 3, y + 9, col, fsz);
    const by = y + 23, bh = narrow ? 7 : 8, bw = gw - 4, bx = x + 2;
    // 凹槽：上緣較暗（內陰影）、下緣一條亮線
    const tg = c.createLinearGradient(0, by, 0, by + bh);
    tg.addColorStop(0, alpha(colors.text, colors.dark ? 0.26 : 0.16));
    tg.addColorStop(1, alpha(colors.text, colors.dark ? 0.12 : 0.06));
    c.fillStyle = tg;
    roundRect(c, bx, by, bw, bh, bh / 2); c.fill();
    c.strokeStyle = alpha(colors.dark ? '#ffffff' : colors['canvas-bg'], colors.dark ? 0.08 : 0.9);
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(bx + bh / 2, by + bh + 0.5); c.lineTo(bx + bw - bh / 2, by + bh + 0.5); c.stroke();
    if (frac > 0.002) {
      const fw = Math.max(bh, bw * frac);
      const g = c.createLinearGradient(0, by, 0, by + bh);
      g.addColorStop(0, shade(col, 0.35)); g.addColorStop(0.5, col); g.addColorStop(1, shade(col, -0.2));
      c.fillStyle = g;
      roundRect(c, bx, by, fw, bh, bh / 2); c.fill();
      // 上緣高光（膠囊般的光澤）
      c.strokeStyle = alpha(shade(col, 0.7), colors.dark ? 0.45 : 0.65);
      c.lineCap = 'round';
      c.beginPath(); c.moveTo(bx + bh / 2, by + 1.6); c.lineTo(bx + fw - bh / 2, by + 1.6); c.stroke();
    }
    // 最大值的刻度
    c.lineCap = 'round';
    c.strokeStyle = alpha(colors['canvas-bg'], 0.8); c.lineWidth = 3.5;
    c.beginPath(); c.moveTo(bx + bw - 0.5, by - 3); c.lineTo(bx + bw - 0.5, by + bh + 3); c.stroke();
    c.strokeStyle = colors.f; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(bx + bw - 0.5, by - 3); c.lineTo(bx + bw - 0.5, by + bh + 3); c.stroke();
    return by + bh + 6;
  }
  function drawFBD(c, R, fo) {
    c.save();
    roundRect(c, R.x, R.y, R.w, R.h, 8);
    c.clip();
    const narrow = R.w < 260;
    const fT = narrow ? 12 : 13, fL = narrow ? 11 : 12;
    pill(c, T('受力圖', 'Free-body diagram'), R.x + 8, R.y + 13, colors.text, fT, { weight: 700, border: false });
    const th = state.theta * D2R, cs = Math.cos(th), sn = Math.sin(th);
    const dx = cs, dy = sn;     // 沿斜面向下（畫布）
    const nx = sn, ny = -cs;    // 斜面法線（往外）
    const hide = mystery();
    const maxF = Math.max(fo.W, Math.abs(state.F), fo.N, Math.abs(fo.P), hide ? 0 : fo.fsMax, Math.abs(fo.f), Math.abs(fo.net), 1e-6);
    const nice = niceUp(maxF);
    const cx = R.x + R.w * 0.5;
    let cy = R.y + R.h * 0.52;
    let Lmax = Math.min(R.w, R.h) * (narrow ? 0.34 : 0.37);
    // 扁的受力圖（手機版佔滿整列）：箭頭要放得進「量表下緣」與「比例尺上緣」之間，不可以畫到量表上
    const top0 = R.y + 66, bot0 = R.y + R.h - 22;
    if (cy - Lmax < top0 || cy + Lmax > bot0) {
      Lmax = Math.min(Lmax, (bot0 - top0) / 2);
      cy = (top0 + bot0) / 2;
    }
    const kF = Lmax / nice; // px/N（比例尺依同一個比例畫）
    const h0 = narrow ? 10 : 14;
    const lw = narrow ? 2.2 : 2.8;

    // 斜面（細線＋斜線陰影＋往斜面內漸淡的材質色塊）與沿斜面、垂直斜面的虛線軸；線的兩端漸淡
    const sx = cx - nx * h0, sy = cy - ny * h0; // 木塊底面中心
    const Ls = Math.min(R.w, R.h) * 0.48;
    const fade = function (x0, y0, x1, y1, col, a) {
      const g = c.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, alpha(col, 0)); g.addColorStop(0.15, alpha(col, a));
      g.addColorStop(0.85, alpha(col, a)); g.addColorStop(1, alpha(col, 0));
      return g;
    };
    const mats = SURF[state.surf] || SURF.wood;
    const bmat = material(mats.board === 'wood' ? 'boardwood' : mats.board);
    c.save();
    c.translate(sx, sy); c.rotate(th); c.scale(1, 16 / Ls);
    const slab = c.createRadialGradient(0, 0, 0, 0, 0, Ls);
    slab.addColorStop(0, alpha(bmat.base, colors.dark ? 0.42 : 0.5));
    slab.addColorStop(0.7, alpha(bmat.base, colors.dark ? 0.12 : 0.15));
    slab.addColorStop(1, alpha(bmat.base, 0));
    c.fillStyle = slab;
    c.fillRect(-Ls, 0, 2 * Ls, Ls);
    c.restore();
    c.lineCap = 'round';
    c.strokeStyle = fade(sx - dx * Ls, sy - dy * Ls, sx + dx * Ls, sy + dy * Ls, colors.text, 0.16);
    c.lineWidth = 1;
    c.beginPath();
    for (let t = -Ls; t <= Ls; t += 9) {
      const px = sx + dx * t, py = sy + dy * t;
      c.moveTo(px, py); c.lineTo(px - nx * 6 - dx * 5, py - ny * 6 - dy * 5);
    }
    c.stroke();
    c.strokeStyle = fade(sx - dx * Ls, sy - dy * Ls, sx + dx * Ls, sy + dy * Ls, colors.text, colors.dark ? 0.5 : 0.45);
    c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(sx - dx * Ls, sy - dy * Ls); c.lineTo(sx + dx * Ls, sy + dy * Ls); c.stroke();
    c.setLineDash([3, 5]);
    c.lineWidth = 1;
    c.strokeStyle = fade(cx - dx * Ls, cy - dy * Ls, cx + dx * Ls, cy + dy * Ls, colors.muted, 0.4);
    c.beginPath(); c.moveTo(cx - dx * Ls, cy - dy * Ls); c.lineTo(cx + dx * Ls, cy + dy * Ls); c.stroke();
    c.strokeStyle = fade(cx - nx * Ls * 0.8, cy - ny * Ls * 0.8, cx + nx * Ls * 0.8, cy + ny * Ls * 0.8, colors.muted, 0.4);
    c.beginPath(); c.moveTo(cx - nx * Ls * 0.8, cy - ny * Ls * 0.8); c.lineTo(cx + nx * Ls * 0.8, cy + ny * Ls * 0.8); c.stroke();
    c.setLineDash([]);

    // 木塊（示意；箭頭依比例，木塊大小不依比例）
    const mt = material(mats.block);
    c.save();
    c.translate(sx, sy); c.rotate(th);
    const csh = c.createRadialGradient(0, 0, 1, 0, 0, h0 * 2);
    csh.addColorStop(0, LD.shadowInk(colors.dark ? 0.5 : 0.26));
    csh.addColorStop(1, LD.shadowInk(0));
    c.fillStyle = csh;
    c.beginPath(); c.ellipse(0, 0.5, h0 * 2, Math.max(3, h0 * 0.42), 0, 0, Math.PI * 2); c.fill();
    solidBlock(c, 0, h0 * 3, h0 * 2, mt, { a: 0.92 });
    c.restore();

    // 靜摩擦力的範圍 −μsN … +μsN（摩擦力作用在接觸面上）
    if (!hide && fo.fsMax > 1e-9) {
      const r = fo.fsMax * kF;
      c.save();
      c.translate(sx, sy); c.rotate(th);
      const rg = c.createLinearGradient(0, -3.5, 0, 3.5);
      rg.addColorStop(0, alpha(colors.f, 0.1)); rg.addColorStop(0.5, alpha(colors.f, colors.dark ? 0.3 : 0.24)); rg.addColorStop(1, alpha(colors.f, 0.1));
      c.fillStyle = rg;
      c.fillRect(-r, -3.5, 2 * r, 7);
      c.restore();
      c.lineCap = 'round';
      c.strokeStyle = alpha(colors.f, 0.75); c.lineWidth = 1.6;
      c.beginPath();
      [-1, 1].forEach(function (sg) {
        const ex = sx + sg * dx * r, ey = sy + sg * dy * r;
        c.moveTo(ex - nx * 6, ey - ny * 6); c.lineTo(ex + nx * 6, ey + ny * 6);
      });
      c.stroke();
    }

    const topY = drawGauge(c, R, fo);
    const labels = [], segs = [];
    const vec = function (x0, y0, ux, uy, F, color, lbl, opt) {
      opt = opt || {};
      const len = Math.abs(F) * kF;
      if (len < 0.5) return;
      const sg = F < 0 ? -1 : 1;
      if (opt.hollow) hollowArrow(c, x0, y0, ux * sg, uy * sg, len, lw, color);
      else arrow(c, x0, y0, ux * sg, uy * sg, len, opt.thin ? lw * 0.75 : lw, color, opt.dash);
      segs.push([x0, y0, x0 + ux * sg * len, y0 + uy * sg * len]);
      const o = opt.off || 0; // 標籤沿斜面法線方向的偏移（摩擦力放在斜面下方，避免和其他標籤擠在一起）
      if (lbl) labels.push({ tx: x0 + ux * sg * len + nx * o, ty: y0 + uy * sg * len + ny * o, ux: ux * sg, uy: uy * sg, text: lbl, color: color, dash: opt.dash });
    };
    const V = function (F) { return num(Math.abs(F), Math.abs(F) < 10 ? 2 : 1) + ' N'; };
    const q = function (F) { return hide ? '?' : V(F); };
    // 重力與分量
    vec(cx, cy, 0, 1, fo.W, colors.W, 'W ' + V(fo.W));
    if (state.show.comp && fo.W > 0) {
      const wx = cx, wy = cy + fo.W * kF;
      const ax = cx + dx * fo.Wpar * kF, ay = cy + dy * fo.Wpar * kF;
      const bx2 = cx - nx * fo.Wperp * kF, by2 = cy - ny * fo.Wperp * kF;
      c.strokeStyle = alpha(colors.W, 0.4); c.lineWidth = 1; c.setLineDash([2, 4]);
      c.beginPath(); c.moveTo(wx, wy); c.lineTo(ax, ay); c.moveTo(wx, wy); c.lineTo(bx2, by2); c.stroke();
      c.setLineDash([]);
      vec(cx, cy, dx, dy, fo.Wpar, alpha(colors.W, 0.75), 'mg sinθ', { dash: true, thin: true, off: 10 });
      vec(cx, cy, -nx, -ny, fo.Wperp, alpha(colors.W, 0.75), 'mg cosθ', { dash: true, thin: true });
    }
    // 正向力
    vec(cx, cy, nx, ny, fo.N, colors.N, 'N ' + V(fo.N));
    // 外力
    if (Math.abs(state.F) > 1e-9) {
      if (state.mode === 'along') {
        const off = state.F < 0 ? 5 : 0;
        vec(cx + nx * off, cy + ny * off, -dx, -dy, state.F, colors.F, 'F ' + V(state.F));
      } else vec(cx, cy, -1, 0, state.F, colors.F, 'F ' + V(state.F));
    }
    // 擋板或手的力
    if (Math.abs(fo.P) > 1e-9) {
      vec(cx + nx * h0 * 0.6, cy + ny * h0 * 0.6, dx, dy, fo.P, colors.muted,
        (state.phase === 'held' ? T('手', 'hand') : T('擋板', 'stop')) + ' ' + q(fo.P), { dash: true });
    }
    // 摩擦力（畫在接觸面上）
    const fname = fo.kind === 'kinetic' ? 'f_k' : 'f_s';
    if (Math.abs(fo.f) > 1e-9) vec(sx, sy, dx, dy, fo.f, colors.f, fname + ' ' + q(fo.f), { off: -14 });
    // 合力
    if (state.show.net) {
      if (Math.abs(fo.net) > 1e-9) vec(cx + nx * (h0 + 12), cy + ny * (h0 + 12), dx, dy, fo.net, colors.net, 'ΣF ' + q(fo.net), { hollow: true });
      else labels.push({ fixed: true, tx: R.x + R.w - 8, ty: R.y + R.h - 14, ux: 0, uy: 0, text: 'ΣF = 0', color: colors.net });
    }
    // 標籤：放在箭頭尖端的外側；避免互相重疊，也盡量不壓在箭頭與木塊上
    // 比例尺的位置（左下角）先保留，標籤不要壓在上面
    const bars = [1, 2, 5, 10, 20, 50, 100];
    let bv = bars[0];
    bars.forEach(function (b) { if (b * kF <= R.w * 0.32) bv = b; });
    const bl = bv * kF, bx = R.x + 10, by = R.y + R.h - 12;
    c.font = fontOf(11, 600);
    const placed = [{ x: bx - 3, y: by - 11, w: bl + 18 + c.measureText(bv + ' N').width, h: 22 }];
    // 先放固定位置的標籤，再放主要的力，最後放分量（虛線）
    const rank = function (lb) { return lb.fixed ? 0 : lb.dash ? 2 : 1; };
    labels.sort(function (a, b) { return rank(a) - rank(b); });
    const blockR = h0 * 1.7;
    /** 標籤底框壓到木塊或箭頭的程度（0 = 沒有壓到） */
    const arrowHits = function (x, y, w, h) {
      let n = 0;
      const qx = Math.max(x, Math.min(cx, x + w)), qy = Math.max(y, Math.min(cy, y + h));
      if (Math.hypot(qx - cx, qy - cy) < blockR) n += 8;
      segs.forEach(function (s) {
        const L = Math.hypot(s[2] - s[0], s[3] - s[1]), m = Math.max(2, Math.ceil(L / 4));
        for (let i = 0; i <= m; i++) {
          const px = s[0] + (s[2] - s[0]) * i / m, py = s[1] + (s[3] - s[1]) * i / m;
          if (px > x - 2 && px < x + w + 2 && py > y - 2 && py < y + h + 2) n++;
        }
      });
      return n;
    };
    const hitsLabels = function (x, y, w, h) {
      return placed.some(function (p) { return x < p.x + p.w + 2 && x + w + 2 > p.x && y < p.y + p.h + 2 && y + h + 2 > p.y; });
    };
    // 候選位置（以標籤寬、高為單位）：在箭頭尖端外側附近找一圈，選「不和別的標籤重疊、盡量不壓箭頭、離尖端最近」的位置
    const CAND = [];
    [0, 0.3, -0.3, 0.6, -0.6, 1.1, -1.1, 1.6, -1.6].forEach(function (u) {
      [0, 1, -1, 2, -2, 3, -3, 4, -4].forEach(function (v) { CAND.push([u, v]); });
    });
    labels.forEach(function (lb) {
      const tw = richWidth(c, parseSub(lb.text), fL, 600) + 12, th2 = fL * fsScale() + 6;
      const clampX = function (x) { return Math.max(R.x + 3, Math.min(R.x + R.w - tw - 3, x)); };
      const clampY = function (y) { return Math.max(topY, Math.min(R.y + R.h - th2 - 3, y)); };
      if (lb.fixed) {
        const p = { x: clampX(lb.tx - tw), y: clampY(lb.ty - th2 / 2), w: tw, h: th2 };
        placed.push(p);
        pill(c, lb.text, p.x, p.y + th2 / 2, lb.color, fL);
        return;
      }
      // 標籤中心：尖端沿箭頭方向再往外，剛好讓底框離尖端約 7 px
      const d = 7 + Math.abs(lb.ux) * tw / 2 + Math.abs(lb.uy) * th2 / 2;
      const ax = lb.tx + lb.ux * d, ay = lb.ty + lb.uy * d;
      let best = null, bestCost = Infinity;
      for (let i = 0; i < CAND.length; i++) {
        const x = clampX(ax - tw / 2 + CAND[i][0] * tw), y = clampY(ay - th2 / 2 + CAND[i][1] * (th2 + 2));
        if (hitsLabels(x, y, tw, th2)) continue;
        const dist = Math.hypot(x + tw / 2 - ax, y + th2 / 2 - ay);
        if (dist >= bestCost) continue;
        const n = arrowHits(x, y, tw, th2);
        const cost = dist + (n ? 260 + 12 * n : 0);
        if (cost < bestCost) { bestCost = cost; best = [x, y]; }
      }
      if (!best) best = [clampX(ax - tw / 2), clampY(ay - th2 / 2)];
      placed.push({ x: best[0], y: best[1], w: tw, h: th2 });
      pill(c, lb.text, best[0], best[1] + th2 / 2, lb.color, fL);
    });

    // 比例尺
    const ruler = function (g) { g.moveTo(bx, by - 4); g.lineTo(bx, by + 4); g.moveTo(bx, by); g.lineTo(bx + bl, by); g.moveTo(bx + bl, by - 4); g.lineTo(bx + bl, by + 4); };
    c.lineCap = 'round';
    c.beginPath(); ruler(c);
    c.strokeStyle = alpha(colors['canvas-bg'], 0.7); c.lineWidth = 4; c.stroke();
    c.beginPath(); ruler(c);
    c.strokeStyle = alpha(colors.text, 0.75); c.lineWidth = 1.5; c.stroke();
    pill(c, bv + ' N', bx + bl + 5, by, colors.muted, 11);
    c.restore();
  }

  // ---------- 運動圖（x–t 或 v–t） ----------
  const WINDOWS = [2, 3, 5, 8, 10, 15, 20, 30, 45, 60, 90, 120, 180, 300, 600];
  function plotBox(R, padL) {
    const nar = R.w < 300;
    // 窄的圖：標題下面第二行放縱軸單位，所以上方留多一點
    const l = padL || (nar ? 38 : 46), r = 10, t = nar ? 48 : 28, b = nar ? 24 : 26;
    return { x: R.x + l, y: R.y + t, w: R.w - l - r, h: R.h - t - b, nar: nar };
  }
  function drawAxesTicks(c, P, xr, yr, xs, ys, xdec, ydec, f) {
    const X = function (v) { return P.x + (v - xr[0]) / (xr[1] - xr[0]) * P.w; };
    const Y = function (v) { return P.y + P.h - (v - yr[0]) / (yr[1] - yr[0]) * P.h; };
    const px = function (v) { return (Math.round(v * dpr) + 0.5) / dpr; };
    // 兩級格線：次格線（主刻度的 1/5 或 1/2，太密就不畫）透明度約 0.04，主格線約 0.09
    const gridLines = function (sx, sy, a) {
      c.beginPath();
      if (sx) for (let v = Math.ceil(xr[0] / sx - 1e-9) * sx; v <= xr[1] + 1e-9; v += sx) { c.moveTo(px(X(v)), P.y); c.lineTo(px(X(v)), P.y + P.h); }
      if (sy) for (let v = Math.ceil(yr[0] / sy - 1e-9) * sy; v <= yr[1] + 1e-9; v += sy) { c.moveTo(P.x, px(Y(v))); c.lineTo(P.x + P.w, px(Y(v))); }
      c.strokeStyle = alpha(colors.text, a);
      c.lineWidth = 1 / dpr;
      c.stroke();
    };
    const minor = function (s, pxPer) { return s / 5 * pxPer >= 7 ? s / 5 : s / 2 * pxPer >= 7 ? s / 2 : 0; };
    gridLines(minor(xs, P.w / (xr[1] - xr[0])), minor(ys, P.h / (yr[1] - yr[0])), colors.dark ? 0.045 : 0.035);
    gridLines(xs, ys, colors.dark ? 0.1 : 0.085);
    c.lineWidth = 1;
    c.lineCap = 'butt';
    c.strokeStyle = alpha(colors.muted, 0.75);
    c.beginPath();
    if (yr[0] <= 0 && yr[1] >= 0) { c.moveTo(P.x, px(Y(0))); c.lineTo(P.x + P.w, px(Y(0))); }
    if (xr[0] <= 0 && xr[1] >= 0) { c.moveTo(px(X(0)), P.y); c.lineTo(px(X(0)), P.y + P.h); }
    c.moveTo(px(P.x), P.y); c.lineTo(px(P.x), P.y + P.h); c.lineTo(P.x + P.w, px(P.y + P.h));
    c.stroke();
    c.font = f + 'px ' + FONT;
    c.fillStyle = alpha(colors.muted, 0.95);
    c.textAlign = 'center'; c.textBaseline = 'top';
    let lastR = -1e9;
    for (let v = Math.ceil(xr[0] / xs - 1e-9) * xs; v <= xr[1] + 1e-9; v += xs) {
      const s = num(v, xdec), w = c.measureText(s).width, x = X(v);
      if (x - w / 2 < lastR + 4) continue;
      c.fillText(s, x, P.y + P.h + 4); lastR = x + w / 2;
    }
    c.textAlign = 'right'; c.textBaseline = 'middle';
    for (let v = Math.ceil(yr[0] / ys - 1e-9) * ys; v <= yr[1] + 1e-9; v += ys) c.fillText(num(v, ydec), P.x - 5, Y(v));
    return { X: X, Y: Y };
  }

  function drawMotion(c, R) {
    c.save();
    roundRect(c, R.x, R.y, R.w, R.h, 8); c.clip();
    const P = plotBox(R);
    const isV = state.graph === 'v';
    const col = isV ? colors.accent : colors.neg;
    const runs = state.ghosts.concat(state.run ? [state.run] : []);
    const tEnd = state.run ? state.run.samples[state.run.samples.length - 1].t : 0;
    let Wt = WINDOWS[WINDOWS.length - 1];
    for (let i = 0; i < WINDOWS.length; i++) if (WINDOWS[i] >= tEnd * 1.04) { Wt = WINDOWS[i]; break; }
    let yr;
    if (isV) {
      let vm = 0.5;
      runs.forEach(function (r) { r.samples.forEach(function (s) { if (s.t <= Wt) vm = Math.max(vm, Math.abs(s.v)); }); });
      vm = niceUp(vm * 1.1);
      yr = [-vm, vm];
    } else yr = [XMIN, XMAX];
    const f = 11;
    const ys = isV ? niceStep(yr[1] / (P.h > 120 ? 2.5 : 1.5)) : 0.5;
    const xs = niceStep(Wt / (P.w > 300 ? 6 : 3.5));
    const ax = drawAxesTicks(c, P, [0, Wt], yr, xs, ys, xs < 1 ? 1 : 0, ys < 1 ? 1 : 0, f);
    // 光電門位置（x–t 圖的水平虛線）
    if (!isV) {
      c.setLineDash([3, 4]); c.strokeStyle = alpha(colors.pos, 0.4);
      c.beginPath();
      GATES.forEach(function (g) { c.moveTo(P.x, Math.round(ax.Y(g)) + 0.5); c.lineTo(P.x + P.w, Math.round(ax.Y(g)) + 0.5); });
      c.stroke(); c.setLineDash([]);
    }
    c.save();
    c.beginPath(); c.rect(P.x, P.y - 4, P.w + 4, P.h + 8); c.clip();
    // 之前幾次（淡色，越舊越淡）
    c.lineCap = 'round'; c.lineJoin = 'round';
    state.ghosts.forEach(function (r, gi) {
      c.strokeStyle = alpha(col, 0.16 + 0.08 * gi);
      c.lineWidth = 1.4;
      c.beginPath();
      let started = false;
      r.samples.forEach(function (s) {
        if (s.t > Wt) return;
        const px = ax.X(s.t), py = ax.Y(isV ? s.v : s.x);
        if (started) c.lineTo(px, py); else { c.moveTo(px, py); started = true; }
      });
      c.stroke();
    });
    // 這一次
    if (state.run && state.run.samples.length > 1) {
      const pts = [];
      const sm = state.run.samples, step = Math.max(1, Math.floor(sm.length / 1200));
      for (let i = 0; i < sm.length; i += step) pts.push([ax.X(sm[i].t), ax.Y(isV ? sm[i].v : sm[i].x)]);
      const last = sm[sm.length - 1];
      pts.push([ax.X(last.t), ax.Y(isV ? last.v : last.x)]);
      if (isV) {
        // v–t 圖：曲線與 v = 0 之間的面積（＝位移）淡淡上色，離零線越遠越濃
        const y0 = ax.Y(0), u0 = Math.max(0, Math.min(1, (y0 - P.y) / P.h));
        const ag = c.createLinearGradient(0, P.y, 0, P.y + P.h);
        const aA = colors.dark ? 0.24 : 0.18;
        ag.addColorStop(0, alpha(col, aA)); ag.addColorStop(u0, alpha(col, 0.03)); ag.addColorStop(1, alpha(col, aA));
        c.fillStyle = ag;
        c.beginPath();
        c.moveTo(pts[0][0], y0);
        pts.forEach(function (q) { c.lineTo(q[0], q[1]); });
        c.lineTo(pts[pts.length - 1][0], y0);
        c.closePath();
        c.fill();
      }
      LD.tube(c, polyPath(pts), col, P.nar ? 2.8 : 3.4);
      // 光電門通過的時刻（編號靠太近時往下錯開，不互相重疊）
      const gPills = [];
      state.run.gates.forEach(function (list, gi) {
        list.forEach(function (gp) {
          if (gp.t > Wt) return;
          const x = ax.X(gp.t);
          c.strokeStyle = alpha(colors.pos, 0.55); c.setLineDash([2, 3]); c.lineWidth = 1;
          c.beginPath(); c.moveTo(Math.round(x) + 0.5, P.y); c.lineTo(Math.round(x) + 0.5, P.y + P.h); c.stroke(); c.setLineDash([]);
          const pw = richWidth(c, [{ t: String(gi + 1) }], 11, 600) + 12, ph = 11 * fsScale() + 6;
          let y = P.y + 9;
          while (gPills.some(function (q) { return Math.abs(q[0] - x) < pw + 2 && Math.abs(q[1] - y) < ph; })) y += ph + 2;
          gPills.push([x, y]);
          pill(c, String(gi + 1), x, y, colors.pos, 11, { align: 'center' });
        });
      });
      sphereSmall(c, ax.X(last.t), ax.Y(isV ? last.v : last.x), col);
    }
    c.restore();
    pill(c, isV ? T('v–t 圖', 'v–t graph') : T('x–t 圖', 'x–t graph'), R.x + 8, R.y + 13, col, P.nar ? 12 : 13, { weight: 700, border: false });
    c.textAlign = 'right';
    // 縱軸單位：寬的圖放在右上角；窄的圖（手機並排）放在標題下一行，避免和標題重疊
    const yUnit = isV ? T('v (m/s)，向下為正', 'v (m/s), down +') : T('x (m)', 'x (m)');
    if (P.nar) pill(c, yUnit, R.x + 8, R.y + 34, colors.muted, f, { border: false });
    else pill(c, yUnit, R.x + R.w - 6, R.y + 13, colors.muted, f, { align: 'right', border: false });
    pill(c, 't (s)', R.x + R.w - 4, P.y + P.h - 9, colors.muted, f, { align: 'right', border: false });
    c.restore();
  }

  // ---------- 摩擦力–外力圖 ----------
  function drawFF(c, R, fo) {
    c.save();
    roundRect(c, R.x, R.y, R.w, R.h, 8); c.clip();
    const P = plotBox(R, R.w < 300 ? 36 : 44);
    const hide = mystery();
    const p = params();
    const k0 = IC.components(Object.assign({}, p, { F: 0 }));
    // 橫軸範圍：資料點與目前的外力
    let Flo = 0, Fhi = 5;
    state.ff.forEach(function (q) { Flo = Math.min(Flo, q.F); Fhi = Math.max(Fhi, q.F); });
    Flo = Math.min(Flo, state.F); Fhi = Math.max(Fhi, state.F);
    if (!hide) {
      // 理論線完整畫出：一直到「推得動」的外力（自鎖時沒有）
      const up = IC.thresholds(p).upStart;
      Fhi = Math.max(Fhi, Math.min(F_MAX, isFinite(up) ? up * 1.15 : k0.Wpar * 1.2));
    }
    const span = Fhi - Flo;
    const xs = niceStep(span / (P.w > 260 ? 5 : 3));
    Flo = Math.floor(Flo / xs + 1e-9) * xs; Fhi = Math.ceil((Fhi + span * 0.04) / xs - 1e-9) * xs;
    // 縱軸：± 最大值
    let fm = Math.max(1, Math.abs(fo.f));
    state.ff.forEach(function (q) { fm = Math.max(fm, Math.abs(q.f)); });
    if (!hide) fm = Math.max(fm, k0.fsMax, IC.components(Object.assign({}, p, { F: Fhi })).fsMax * (state.mode === 'horiz' ? 1 : 0));
    fm = niceUp(fm * 1.12);
    const yr = [-fm, fm];
    const f = 11;
    const ys = niceStep(fm / (P.h > 120 ? 2 : 1));
    const ax = drawAxesTicks(c, P, [Flo, Fhi], yr, xs, ys, xs < 1 ? 1 : 0, ys < 1 ? 1 : 0, f);
    c.save();
    c.beginPath(); c.rect(P.x, P.y, P.w, P.h); c.clip();
    c.lineCap = 'round'; c.lineJoin = 'round';
    // 理論：靜摩擦的直線 f = −D(F)，以及 ±μsN、±μkN
    if (!hide) {
      const n = 60, sl = [], up = [], lo = [], ku = [], kl = [];
      for (let i = 0; i <= n; i++) {
        const F = Flo + (Fhi - Flo) * i / n;
        const kk = IC.components(Object.assign({}, p, { F: F }));
        sl.push([ax.X(F), ax.Y(-kk.D), Math.abs(kk.D) <= kk.fsMax + 1e-9]);
        up.push([ax.X(F), ax.Y(kk.fsMax)]); lo.push([ax.X(F), ax.Y(-kk.fsMax)]);
        ku.push([ax.X(F), ax.Y(kk.fk)]); kl.push([ax.X(F), ax.Y(-kk.fk)]);
      }
      // 靜摩擦力可以出現的範圍 −μsN ≤ f ≤ μsN：極淡的色帶（中間最淡、靠近上下限較濃）
      const yMid = ax.Y(0), yTop = Math.min.apply(null, up.map(function (q) { return q[1]; }));
      const band = c.createLinearGradient(0, yTop, 0, 2 * yMid - yTop);
      const bA = colors.dark ? 0.075 : 0.06;
      band.addColorStop(0, alpha(colors.f, bA)); band.addColorStop(0.5, alpha(colors.f, bA * 0.25)); band.addColorStop(1, alpha(colors.f, bA));
      c.fillStyle = band;
      c.beginPath();
      up.forEach(function (q, i) { if (i) c.lineTo(q[0], q[1]); else c.moveTo(q[0], q[1]); });
      for (let i = lo.length - 1; i >= 0; i--) c.lineTo(lo[i][0], lo[i][1]);
      c.closePath();
      c.fill();
      const line = function (pts, dash, color, w) {
        c.setLineDash(dash); c.strokeStyle = color; c.lineWidth = w;
        c.beginPath(); pts.forEach(function (q, i) { if (i) c.lineTo(q[0], q[1]); else c.moveTo(q[0], q[1]); }); c.stroke();
        c.setLineDash([]);
      };
      line(up, [6, 4], alpha(colors.f, 0.55), 1.3); line(lo, [6, 4], alpha(colors.f, 0.55), 1.3);
      line(ku, [2, 3], alpha(colors.f, 0.5), 1.3); line(kl, [2, 3], alpha(colors.f, 0.5), 1.3);
      c.strokeStyle = alpha(colors.accent, 0.4); c.lineWidth = 1.2; c.setLineDash([3, 3]);
      c.beginPath();
      let on = false;
      sl.forEach(function (q) { if (q[2]) { if (on) c.lineTo(q[0], q[1]); else { c.moveTo(q[0], q[1]); on = true; } } else on = false; });
      c.stroke(); c.setLineDash([]);
    }
    // 資料點
    const curRun = state.run ? state.run.id : -1;
    state.ff.forEach(function (q) {
      const a = q.run === curRun ? 0.9 : 0.35;
      c.fillStyle = alpha(q.kind === 'kinetic' ? colors.f : colors.accent, a);
      c.beginPath(); c.arc(ax.X(q.F), ax.Y(q.f), q.run === curRun ? 2.2 : 1.8, 0, Math.PI * 2); c.fill();
    });
    if (state.phase !== 'held') sphereSmall(c, ax.X(state.F), ax.Y(fo.f), fo.kind === 'kinetic' ? colors.f : colors.accent);
    c.restore();
    if (!hide && P.w > 100) {
      const kk = IC.components(Object.assign({}, p, { F: Fhi }));
      // 標籤放在右端；若「現在」的小球剛好在那裡，就移到小球左邊
      const bxp = state.phase !== 'held' ? ax.X(state.F) : -1e9, byp = state.phase !== 'held' ? ax.Y(fo.f) : -1e9;
      const ph = f * fsScale() + 6;
      const muLabel = function (txt, yc) {
        const pw = richWidth(c, parseSub(txt), f, 600) + 12;
        let xr = P.x + P.w - 3;
        if (bxp > xr - pw - 8 && bxp < xr + 8 && Math.abs(byp - yc) < ph / 2 + 7) xr = Math.max(P.x + pw + 2, bxp - 9);
        pill(c, txt, xr, yc, colors.f, f, { align: 'right' });
      };
      muLabel('μ_sN', Math.max(P.y + 8, ax.Y(kk.fsMax) - 10));
      muLabel('μ_kN', Math.min(P.y + P.h - 8, ax.Y(kk.fk) + 10));
    }
    pill(c, T('摩擦力 f–外力 F', 'Friction f vs force F'), R.x + 8, R.y + 13, colors.f, P.nar ? 12 : 13, { weight: 700, border: false });
    if (P.nar) pill(c, T('f (N)，向下為正', 'f (N), down +'), R.x + 8, R.y + 34, colors.muted, f, { border: false });
    else pill(c, T('f (N)，向下為正', 'f (N), down +'), P.x + 4, P.y + 9, colors.muted, f, { border: false });
    pill(c, 'F (N)', R.x + R.w - 4, P.y + P.h - 9, colors.muted, f, { align: 'right', border: false });
    c.restore();
  }

  // ---------- 讀數 ----------
  const lastText = {};
  function setHTML(id, html) {
    if (lastText[id] === html) return;
    lastText[id] = html;
    $(id).innerHTML = html;
  }
  function dec2(v) { return Math.abs(Math.round(v * 100) - v * 100) > 1e-6 ? 3 : 2; }
  function signed(v, d, unit) { return num(v, d) + ' ' + unit; }
  function updateReadout(fo) {
    const hide = mystery(), Q = '?';
    const u = mu();
    setHTML('rW', num(fo.W, 2) + ' N');
    setHTML('rWpar', num(fo.Wpar, 2) + ' N');
    setHTML('rWperp', num(fo.Wperp, 2) + ' N');
    if (Math.abs(state.F) < 1e-12) setHTML('rF', '0 N<small>' + T('沒有外力', 'no applied force') + '</small>');
    else if (state.mode === 'along') setHTML('rF', num(state.F, 2) + ' N<small>' + (state.F > 0 ? T('沿斜面往上推', 'pushing up the slope') : T('沿斜面往下拉', 'pulling down the slope')) + '</small>');
    else setHTML('rF', num(state.F, 2) + ' N<small>' + T('水平；沿斜面向上 ', 'horizontal; up the slope ') + num(-fo.Fpar, 2) + T(' N、壓向斜面 ', ' N, into the slope ') + num(fo.Fperp, 2) + ' N</small>');
    setHTML('rN', num(fo.N, 2) + ' N' + (state.mode === 'horiz' && state.F > 0 ? '<small>= mg cos θ + F sin θ</small>' : ''));
    const kindTxt = fo.kind === 'kinetic' ? T('動摩擦', 'kinetic') : T('靜摩擦', 'static');
    setHTML('rf', hide ? Q + '<small>' + kindTxt + '</small>' : signed(fo.f, 2, 'N') + '<small>' + [kindTxt, dirWord(fo.f)].filter(Boolean).join(T('，', ', ')) + (fo.limit ? T('（已達最大值）', ' (at its maximum)') : '') + '</small>');
    setHTML('rfs', hide ? Q : num(fo.fsMax, 2) + ' N');
    setHTML('rfk', hide ? Q : num(fo.fk, 2) + ' N');
    $('rP').hidden = $('rPdt').hidden = Math.abs(fo.P) < 1e-9;
    setHTML('rPdt', state.phase === 'held' ? T('手的力', 'Force from the hand') : T('擋板的力', 'Force from the stop'));
    setHTML('rP', (hide ? Q : signed(fo.P, 2, 'N')) + '<small>' + dirWord(fo.P) + '</small>');
    setHTML('rNet', hide && fo.net !== 0 ? Q : signed(fo.net, 2, 'N') + '<small>' + dirWord(fo.net) + '</small>');
    setHTML('rA', hide && fo.a !== 0 ? Q : signed(fo.a, 3, 'm/s<sup>2</sup>') + '<small>' + dirWord(fo.a) + '</small>');
    setHTML('rt', num(state.s.t, 3) + ' s');
    setHTML('rx', num(state.s.x, 3) + ' m');
    setHTML('rv', signed(state.s.v, 3, 'm/s') + '<small>' + dirWord(state.s.v) + '</small>');
    const run = state.run;
    const g1 = run && run.gates[0][0], g2 = run && run.gates[1][0];
    setHTML('rg1', g1 ? num(g1.t, 3) + ' s<small>v = ' + num(g1.v, 3) + ' m/s</small>' : '—');
    setHTML('rg2', g2 ? num(g2.t, 3) + ' s<small>v = ' + num(g2.v, 3) + ' m/s</small>' : '—');
    const pair = run && run.pair;
    if (pair && pair.clean) {
      setHTML('rga', hide ? T('自己算算看', 'work it out') : num(pair.aGate, 3) + ' m/s<sup>2</sup><small>μ<sub>k</sub> = tan θ − a/(g cos θ) = ' + num(IC.mukFromAccel(pair.theta * D2R, pair.aGate), 3) + '</small>');
    } else setHTML('rga', pair ? T('—（不是由靜止釋放）', '— (not released from rest)') : '—');
    setHTML('rQ', hide ? Q : num(-state.s.wf, 2) + ' J');
    setHTML('rWg', num(state.s.wG, 2) + ' J');
    setHTML('rWF', num(state.s.wF, 2) + ' J');
    setHTML('rK', num(IC.kinetic(state.m, state.s.v), 2) + ' J' + (state.s.lost > 1e-9 ? '<small>' + T('撞擋板損失 ', 'lost at the stop ') + num(state.s.lost, 2) + ' J</small>' : ''));
    setHTML('muLine', hide ? 'μ<sub>s</sub> = ?、μ<sub>k</sub> = ?、θ<sub>c</sub> = ?'
      : 'μ<sub>s</sub> = ' + num(u.mus, dec2(u.mus)) + T('、', ', ') + 'μ<sub>k</sub> = ' + num(u.muk, dec2(u.muk))
      + T('；臨界角 ', '; critical angle ') + 'θ<sub>c</sub> = tan<sup>−1</sup> μ<sub>s</sub> = ' + num(Math.atan(u.mus) / D2R, 2) + '°');
  }

  // ---------- 測量紀錄（會累積；「全部清除」清掉） ----------
  function addRecord(html) {
    state.recN++;
    state.records.unshift({ n: state.recN, html: html });
    if (state.records.length > 10) state.records.pop();
    renderRecords();
  }
  function renderRecords() {
    $('recEmpty').hidden = state.records.length > 0;
    $('records').innerHTML = state.records.map(function (r) { return '<li value="' + r.n + '">' + r.html + '</li>'; }).join('');
  }

  // ---------- 音效（sound.js；音效關閉時完全不呼叫） ----------
  function sound() { const S = window.LabSound; return S && S.enabled() ? S : null; }
  let scrape = null, grainAt = 0;
  /** 滑動時的摩擦聲：音量隨「摩擦生熱的功率」μkN·|v| 增加，音高隨速率升高（主要頻率 ≥ 300 Hz） */
  function updateScrape(fo) {
    const S = sound();
    const v = Math.abs(state.s.v);
    if (!S || state.phase !== 'run' || v < 0.02) { stopScrape(); return; }
    const power = fo.fk * v;
    const level = Math.min(1, Math.sqrt(power / 40));
    const sp = Math.min(1, v / 4);
    const freq = 300 + 260 * sp;
    const gain = 0.015 + 0.075 * level;
    if (!scrape || !scrape.playing) scrape = S.voice({ freq: freq, type: 'sawtooth', gain: gain });
    else scrape.set({ freq: freq, gain: gain }, 0.06);
    const now = performance.now();
    if (now - grainAt > 95 - 60 * sp) {
      grainAt = now;
      S.noise({ dur: 0.035, gain: 0.05 + 0.3 * level, filter: 1600 + 2200 * sp + 600 * Math.random(), q: 1.4 });
    }
  }
  function stopScrape() { if (scrape) { scrape.stop(0.12); scrape = null; } }
  /** 靜摩擦力撐不住、開始滑動的瞬間：短促的「喀」 */
  function slipSound() {
    const S = sound(); if (!S) return;
    S.noise({ dur: 0.025, gain: 0.6, filter: 4200, q: 2 });
    S.tone({ freq: 1700, dur: 0.035, type: 'triangle', gain: 0.3 });
  }
  /** 滑動中停下、被靜摩擦力黏住：輕輕的「嗒」 */
  function stickSound() {
    const S = sound(); if (!S) return;
    S.tone({ freq: 760, dur: 0.05, type: 'sine', gain: 0.25 });
    S.noise({ dur: 0.02, gain: 0.15, filter: 2500, q: 1.5 });
  }
  /** 撞到擋板的「咚」：音量隨撞擊速率 */
  function thudSound(v) {
    const S = sound(); if (!S) return;
    const g = Math.min(1, 0.25 + v / 3);
    S.tone({ freq: 300, dur: 0.14, type: 'triangle', gain: 0.55 * g });
    S.tone({ freq: 520, dur: 0.06, type: 'sine', gain: 0.25 * g });
    S.noise({ dur: 0.07, gain: 0.5 * g, filter: 900, q: 0.8 });
  }
  /** 通過光電門：計時器的短「嗶」 */
  function gateSound() {
    const S = sound(); if (!S) return;
    S.tone({ freq: 1760, dur: 0.05, type: 'sine', gain: 0.18 });
  }

  // ---------- 任務模式（missions.js）：回報物理量 ----------
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  /** 目前的完整狀態（角度用度；沿斜面向下為正；外力 F 往上推為正） */
  function snapshot(extra) {
    const p = params(), fo = IC.forcesAt(p, state.s.v, contactNow()), th = IC.thresholds(p), u = mu();
    return Object.assign({
      surf: state.surf, theta: state.theta, thetaC: Math.atan(u.mus) / D2R, m: state.m, mus: u.mus, muk: u.muk,
      mode: state.mode, F: state.F, x: state.s.x, v: state.s.v, t: state.s.t,
      a: fo.a, f: fo.f, N: fo.N, D: fo.D, fsMax: fo.fsMax, fk: fo.fk, P: fo.P, kind: fo.kind,
      freeHold: Math.abs(fo.D) <= fo.fsMax * (1 + 1e-12) + 1e-12, moving: state.s.v !== 0,
      upStart: th.upStart, hold: th.hold, upConst: th.upConst, downConst: th.downConst, selfLock: th.selfLock,
      heat: -state.s.wf, start: state.start, phase: state.phase, epoch: state.epoch, slow: state.slow
    }, extra || {});
  }
  /** 使用者放開滑桿、打完數字或切換選項之後 */
  function commit() {
    emit('params', snapshot());
    if (state.phase === 'held') return;
    if (state.s.v !== 0) emit('motion', snapshot({ reason: 'change' }));
    else emit('rest', snapshot());
  }

  // ---------- 一次放手的紀錄 ----------
  function archiveRun() {
    if (state.run && state.run.samples.length > 2) {
      state.ghosts.push(state.run);
      if (state.ghosts.length > 4) state.ghosts.shift();
    }
    state.run = null;
  }
  function newRun(x0, v0) {
    archiveRun();
    state.run = {
      id: ++state.runSeq, x0: x0, v0: v0, start: state.start, samples: [{ t: 0, x: x0, v: v0 }],
      gates: [[], []], epoch0: state.epoch, turns: 0, hitTop: false, slipT: v0 !== 0 ? 0 : null, pair: null
    };
  }
  function recordSample() {
    const run = state.run;
    if (!run) return;
    const sm = run.samples, last = sm[sm.length - 1];
    if (state.s.t - last.t < 1e-6) return;
    if (sm.length >= 9000) return;
    sm.push({ t: state.s.t, x: state.s.x, v: state.s.v });
  }
  function recordFF(fo, force) {
    if (state.phase !== 'run') return;
    const last = state.lastFF;
    if (!force && last && last.run === state.run.id && Math.abs(last.F - state.F) < 0.05 && last.kind === fo.kind) return;
    const q = { F: state.F, f: fo.f, kind: fo.kind, run: state.run.id };
    state.ff.push(q);
    state.lastFF = q;
    if (state.ff.length > 4000) state.ff.splice(0, 500);
  }

  // ---------- 物理前進與事件 ----------
  function advance(h) {
    const p = params();
    const r = IC.step(p, state.s, h, OPT);
    state.s = r.s;
    r.ev.forEach(physEvent);
  }

  function fxPush(e) { if (!reducedMotion) { e.t0 = performance.now(); state.fx.push(e); } }

  function physEvent(e) {
    const run = state.run;
    const hide = mystery();
    if (e.type === 'slip') {
      if (run && run.slipT == null) run.slipT = e.t;
      slipSound();
      fxPush({ type: 'ring', x: e.x, dur: 380, color: colors.pos });
      const cause = state.cause || 'release';
      const fo = forcesNow();
      if (e.dir > 0 && (cause === 'tilt' || cause === 'raise') && Math.abs(state.F) < 1e-12) {
        addRecord(T('開始滑動的角度 ', 'Slipped at ') + 'θ = ' + num(state.theta, 2) + '° → tan θ = ' + num(Math.tan(state.theta * D2R), 3)
          + (hide ? '' : ' <small>(' + T('實際 ', 'actual ') + 'μ<sub>s</sub> = ' + num(mu().mus, 3) + ')</small>'));
      } else if (cause === 'ramp') {
        addRecord(T('慢慢加力：F = ', 'Increasing force: F = ') + num(state.F, 2) + T(' N 時開始滑動', ' N when it started to slide')
          + ' <small>(θ = ' + num(state.theta, 1) + '°, N = ' + num(fo.N, 2) + ' N' + (hide ? '' : T('，最大靜摩擦力 ', ', max static friction ') + num(fo.fsMax, 2) + ' N') + ')</small>');
      }
      setStatus(e.dir > 0 ? T('靜摩擦力撐不住了，木塊開始往下滑！', 'Static friction can no longer hold it — the block starts to slide down!')
        : T('推力超過重力分量與最大靜摩擦力，木塊開始往上滑！', 'The push beats the weight component plus maximum static friction — the block starts to slide up!'));
      if (state.raising) stopRaise(true);
      if (state.ramping) state.rampLeft = 1.0;
      emit('slip', snapshot({ cause: cause, dir: e.dir, ramp: cause === 'ramp' }));
      emit('motion', snapshot({ reason: 'slip' }));
    } else if (e.type === 'stick') {
      stickSound();
      fxPush({ type: 'ring', x: e.x, dur: 320, color: colors.accent });
      addRecord(T('停住：', 'Stopped and stuck: ') + 'x = ' + num(e.x, 3) + ' m <small>(t = ' + num(e.t, 2) + ' s)</small>');
      setStatus(T('木塊停下來，又被靜摩擦力黏住了。', 'The block has stopped and static friction holds it again.'));
      emit('stick', snapshot({ x: e.x }));
    } else if (e.type === 'turn') {
      if (run) run.turns++;
      addRecord(T('在 x = ', 'Turned round at x = ') + num(e.x, 3) + T(' m 轉向往回滑', ' m and slid back') + ' <small>(t = ' + num(e.t, 2) + ' s)</small>');
      setStatus(T('速度減到 0，但靜摩擦力撐不住，木塊立刻往回滑。', 'The velocity reached zero, but static friction cannot hold it, so it slides straight back.'));
      emit('turn', snapshot({ x: e.x }));
      emit('motion', snapshot({ reason: 'turn' }));
    } else if (e.type === 'hit') {
      const sp = Math.abs(e.v);
      thudSound(sp);
      if (sp > 0.05) fxPush({ type: 'dust', x: e.x + (e.end > 0 ? 1 : -1) * BL / 2, dur: 520, parts: [[1, 1], [0.6, 1.4], [1.3, 0.6], [-0.3, 1.2], [0.2, 1.6]].map(function (p) { return [p[0] * (e.end > 0 ? -1 : 1), p[1]]; }) });
      addRecord((e.end > 0 ? T('撞到下端擋板：', 'Hit the bottom stop: ') : T('撞到上端擋釘：', 'Hit the top peg: ')) + T('速率 ', 'speed ') + num(sp, 3) + ' m/s <small>(t = ' + num(e.t, 3) + ' s'
        + (hide ? '' : T('，摩擦生熱 Q = ', ', heat Q = ') + num(-state.s.wf, 2) + ' J') + ')</small>');
      const data = snapshot({
        end: e.end > 0 ? 'bottom' : 'top', speed: sp, tRun: e.t, start: run ? run.start : state.start, v0: run ? run.v0 : 0,
        turned: !!(run && run.turns > 0), hitTopBefore: !!(run && run.hitTop), sameEpoch: !!(run && state.epoch === run.epoch0)
      });
      if (run && e.end < 0) run.hitTop = true;
      if (state.ramping || state.rampLeft != null) stopRamp(true);
      setStatus(e.end > 0 ? T('木塊撞到下端的擋板停住。', 'The block hit the stop at the bottom.') : T('木塊撞到上端的擋釘。', 'The block hit the peg at the top.'));
      emit('hit', data);
    } else if (e.type === 'gate') {
      gateSound();
      fxPush({ type: 'gate', i: e.i, x: GATES[e.i], dur: 400 });
      if (!run) return;
      run.gates[e.i].push({ t: e.t, v: e.v, epoch: state.epoch, turns: run.turns });
      gatePair(e.i);
    }
  }

  /** 先後通過兩個光電門（同一個方向、中間沒有轉向）時，整理成一筆量測 */
  function gatePair(i) {
    const run = state.run, j = 1 - i;
    const me = run.gates[i][run.gates[i].length - 1], other = run.gates[j][run.gates[j].length - 1];
    if (!other || other.turns !== me.turns || other.t >= me.t || (other.v > 0) !== (me.v > 0)) return;
    const g1 = i === 0 ? me : other, g2 = i === 0 ? other : me;
    const dir = me.v > 0 ? 1 : -1;
    const sameEpoch = other.epoch === me.epoch;
    const clean = run.start === 'top' && run.v0 === 0 && run.slipT === 0 && dir > 0 && run.turns === 0 &&
      g1.epoch === run.epoch0 && g2.epoch === run.epoch0;
    const aGate = clean ? IC.accelFromGates(GATES[0], g1.t, GATES[1], g2.t) : null;
    run.pair = { clean: clean, aGate: aGate, theta: state.theta };
    const hide = mystery();
    let html = T('光電門：', 'Photogates: ') + 't<sub>1</sub> = ' + num(g1.t, 3) + ' s, t<sub>2</sub> = ' + num(g2.t, 3) + ' s';
    html += ' <small>(v<sub>1</sub> = ' + num(g1.v, 3) + ', v<sub>2</sub> = ' + num(g2.v, 3) + ' m/s)</small>';
    if (clean && !hide) html += ' → a = ' + num(aGate, 3) + ' m/s<sup>2</sup> → μ<sub>k</sub> = ' + num(IC.mukFromAccel(state.theta * D2R, aGate), 3);
    else if (clean) html += ' <small>(' + T('靜止釋放', 'released from rest') + ', θ = ' + num(state.theta, 2) + '°)</small>';
    addRecord(html);
    emit('gates', snapshot({ t1: g1.t, t2: g2.t, v1: g1.v, v2: g2.v, dir: dir, sameEpoch: sameEpoch, clean: clean, aGate: aGate }));
  }

  // ---------- 動畫 ----------
  let lastT = 0, loopOn = false;
  function tick(tNow) {
    const dtR = Math.min((tNow - lastT) / 1000, 1 / 30);
    lastT = tNow;
    if (state.phase === 'run') {
      const h = dtR * (state.slow ? SLOW : 1);
      const gradual = state.raising || state.ramping;
      const n = gradual ? Math.max(1, Math.ceil(h / SUB_DT - 1e-9)) : 1;
      const hh = h / n;
      const F0 = state.F;
      for (let i = 0; i < n && state.phase === 'run'; i++) {
        if (state.raising) {
          state.theta = Math.min(90, state.theta + RAISE_RATE * hh);
          state.epoch++; state.cause = 'raise';
          if (state.theta >= 90) stopRaise(true);
        }
        if (state.ramping) {
          state.F = Math.min(F_MAX, state.F + rampRate() * hh);
          state.epoch++; state.cause = 'ramp';
          if (state.F >= F_MAX) stopRamp(true);
        }
        advance(hh);
        if (state.rampLeft != null) { state.rampLeft -= hh; if (state.rampLeft <= 0) stopRamp(true); }
      }
      if (gradual) {
        // 只移動滑桿的位置（不觸發事件）；停止時再寫入精確值
        if (state.raising) elTheta.value = state.theta;
        if (state.ramping) elF.value = state.F;
        refreshOutputs();
      }
      recordSample();
      recordFF(forcesNow(), state.F !== F0 && state.ramping);
    }
    const fo = forcesNow();
    updateScrape(fo);
    draw();
    if (state.phase === 'run' || state.fx.length) requestAnimationFrame(tick);
    else loopOn = false;
  }
  function startLoop() {
    if (loopOn) return;
    loopOn = true;
    lastT = performance.now();
    requestAnimationFrame(tick);
  }

  function setStatus(msg) { $('status').textContent = msg || ''; }
  function updateButtons() {
    $('play').textContent = state.phase === 'held' ? T('放手', 'Release') : state.phase === 'run' ? T('暫停', 'Pause') : T('繼續', 'Resume');
    $('raise').textContent = state.raising ? T('停止抬高', 'Stop raising') : T('慢慢抬高', 'Raise slowly');
    $('raise').classList.toggle('on', state.raising);
    $('ramp').textContent = state.ramping ? T('停止加力', 'Stop increasing') : T('慢慢加力', 'Increase force');
    $('ramp').classList.toggle('on', state.ramping);
  }

  function release(v0) {
    const sp = startPos();
    state.s = IC.newState(sp.x, v0, sp.contact);
    state.phase = 'run';
    newRun(sp.x, v0);
    state.cause = 'release';
    state.lastFF = null;
    const snap = snapshot({ v0: v0 });
    snap.holds = v0 === 0 && snap.freeHold;
    emit('release', snap);
    if (v0 !== 0) emit('motion', snapshot({ reason: 'release' }));
    recordFF(forcesNow(), true);
    setStatus(v0 === 0 ? (snap.freeHold ? T('放手了：靜摩擦力撐得住，木塊保持靜止。', 'Released: static friction holds the block at rest.') : '')
      : T('放手，木塊以初速 v0 出發。', 'Released with an initial velocity v0.'));
    updateButtons();
    startLoop();
  }
  function place() {
    stopRaise(true); stopRamp(true);
    archiveRun();
    const sp = startPos();
    state.s = IC.newState(sp.x, 0, sp.contact);
    state.phase = 'held';
    stopScrape();
    updateButtons();
    requestDraw();
  }
  /** 停止「慢慢抬高」／「慢慢加力」；silent 為 false（使用者按下停止）時才回報任務事件 */
  function stopRaise(silent) { if (!state.raising) return; state.raising = false; updateButtons(); finishGradual(silent); }
  function stopRamp(silent) { if (!state.ramping && state.rampLeft == null) return; state.ramping = false; state.rampLeft = null; updateButtons(); finishGradual(silent); }
  function finishGradual(silent) { refreshOutputs(); syncSliders(); if (!silent) commit(); }

  $('play').addEventListener('click', function () {
    if (state.phase === 'held') { release(state.v0); return; }
    if (state.phase === 'run') {
      state.phase = 'pause';
      stopScrape();
      setStatus(T('暫停中：受力圖顯示這一瞬間的力。', 'Paused: the free-body diagram shows the forces at this instant.'));
      emit('pause', snapshot());
    } else {
      state.phase = 'run';
      setStatus('');
      startLoop();
    }
    updateButtons();
    requestDraw();
  });
  $('raise').addEventListener('click', function () {
    if (state.raising) { stopRaise(); return; }
    if (state.theta >= 90) return;
    if (state.phase === 'held') release(0);
    if (state.phase === 'pause') state.phase = 'run';
    state.raising = true;
    setStatus(T('以每秒 2° 慢慢抬高斜面……木塊一開始滑動就停止。', 'Raising the board at 2° per second… it stops as soon as the block slides.'));
    updateButtons();
    startLoop();
  });
  $('ramp').addEventListener('click', function () {
    if (state.ramping) { stopRamp(); return; }
    if (state.F >= F_MAX) return;
    if (state.phase === 'held') release(0);
    if (state.phase === 'pause') state.phase = 'run';
    state.ramping = true;
    state.rampLeft = null;
    setStatus(T('外力每秒增加 ', 'The force increases by ') + num(rampRate(), 1) + T(' N……開始滑動後再繼續 1 秒。', ' N per second… and keeps going for 1 s after the block starts to slide.'));
    updateButtons();
    startLoop();
  });
  $('place').addEventListener('click', function () { place(); setStatus(T('木塊放回起點，用手扶著。', 'The block is back at the start, held by hand.')); });
  // 全部清除：清掉圖表、殘影、摩擦力–外力資料點與測量紀錄，木塊回到起點（滑桿設定不變）
  $('reset').addEventListener('click', function () {
    place();
    state.ghosts = []; state.ff = []; state.records = []; state.run = null; state.fx = []; state.lastFF = null;
    renderRecords();
    setStatus(T('已全部清除，滑桿設定不變。', 'Everything is cleared; the slider settings are kept.'));
    requestDraw();
  });
  $('slow').addEventListener('change', function (ev) { state.slow = ev.target.checked; requestDraw(); });

  // 喇叭按鈕：切換全站音效設定（齒輪面板也能切換，兩邊同步）
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
    if (!on) stopScrape();
  }
  $('soundBtn').addEventListener('click', function () {
    if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound'));
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) {
    if (ev.detail && ev.detail.name === 'sound') updateSoundButton();
  });

  // ---------- 滑桿與選項 ----------
  const elTheta = $('theta'), elM = $('mass'), elF = $('force'), elV0 = $('v0'), elMus = $('mus'), elMuk = $('muk');
  let quiet = false;
  /** 程式改滑桿（不觸發本頁的事件處理） */
  function setSlider(el, v) {
    quiet = true;
    if (window.LabNum) window.LabNum.set(el, v);
    else el.value = v;
    quiet = false;
  }
  function syncSliders() {
    if (Math.abs(val(elTheta) - state.theta) > 1e-9) setSlider(elTheta, state.theta);
    if (Math.abs(val(elF) - state.F) > 1e-9) setSlider(elF, state.F);
  }
  function showOut(id, text) { const o = $(id); if (o.textContent !== text) o.textContent = text; }
  function refreshOutputs() {
    showOut('thetao', fmtSlider(state.theta, elTheta) + '°');
    showOut('masso', fmtSlider(state.m, elM) + ' kg');
    showOut('forceo', fmtSlider(state.F, elF) + ' N');
    showOut('v0o', fmtSlider(state.v0, elV0) + ' m/s');
    showOut('muso', fmtSlider(state.cmus, elMus));
    showOut('muko', fmtSlider(state.cmuk, elMuk));
  }
  function changed(cause) {
    state.cause = cause;
    state.epoch++;
    refreshOutputs();
    requestDraw();
    if (state.phase === 'run') startLoop();
  }

  elTheta.addEventListener('input', function () { if (quiet) return; stopRaise(true); state.theta = val(elTheta); changed('tilt'); });
  elM.addEventListener('input', function () { if (quiet) return; state.m = val(elM); changed('mass'); });
  elF.addEventListener('input', function () {
    if (quiet) return;
    stopRamp(true);
    state.F = val(elF);
    changed('force');
  });
  elV0.addEventListener('input', function () { if (quiet) return; state.v0 = val(elV0); refreshOutputs(); });
  elMus.addEventListener('input', function () {
    if (quiet) return;
    state.cmus = val(elMus);
    if (state.cmuk > state.cmus) { state.cmuk = state.cmus; setSlider(elMuk, state.cmus); }
    changed('surface');
  });
  elMuk.addEventListener('input', function () {
    if (quiet) return;
    state.cmuk = val(elMuk);
    if (state.cmuk > state.cmus) { state.cmuk = state.cmus; setSlider(elMuk, state.cmus); setStatus(T('動摩擦係數不能大於靜摩擦係數。', 'The kinetic coefficient cannot exceed the static one.')); }
    changed('surface');
  });
  [elTheta, elM, elF, elMus, elMuk].forEach(function (el) { el.addEventListener('change', function () { if (!quiet) commit(); }); });

  $('surf').addEventListener('change', function (ev) {
    state.surf = ev.target.value;
    if (state.surf === 'mystery' && !state.mystery) newMystery();
    $('customBox').hidden = state.surf !== 'custom';
    $('mysteryCard').hidden = state.surf !== 'mystery';
    changed('surface');
    commit();
  });

  function setMode(md) {
    if (md === state.mode) return;
    state.mode = md;
    $('modeAlong').setAttribute('aria-pressed', String(md === 'along'));
    $('modeHoriz').setAttribute('aria-pressed', String(md === 'horiz'));
    elF.min = md === 'horiz' ? '0' : String(F_MIN_ALONG);
    if (state.F < +elF.min) { state.F = +elF.min; }
    setSlider(elF, state.F);
    forceTexts();
    changed('mode');
    commit();
  }
  function forceTexts() {
    $('forceLabel').textContent = state.mode === 'along' ? T('外力 F（正：往上推）', 'Force F (+ pushes up)') : T('水平外力 F（推向斜面）', 'Horizontal force F (towards the slope)');
    $('forceHint').textContent = state.mode === 'along'
      ? T('F > 0 沿斜面往上推，F < 0 沿斜面往下拉。', 'F > 0 pushes up along the incline; F < 0 pulls down along it.')
      : T('水平推力有沿斜面向上的分量 F cos θ，另一個分量 F sin θ 把木塊壓向斜面，使正向力變大。', 'A horizontal push has a component F cos θ up the slope; the other component F sin θ presses the block into the surface and increases the normal force.');
  }
  $('modeAlong').addEventListener('click', function () { setMode('along'); });
  $('modeHoriz').addEventListener('click', function () { setMode('horiz'); });

  function setStart(s) {
    state.start = s;
    $('startTop').setAttribute('aria-pressed', String(s === 'top'));
    $('startBottom').setAttribute('aria-pressed', String(s === 'bottom'));
    if (state.phase === 'held') place();
  }
  $('startTop').addEventListener('click', function () { setStart('top'); });
  $('startBottom').addEventListener('click', function () { setStart('bottom'); });

  function setGraph(g) {
    state.graph = g;
    $('graphV').setAttribute('aria-pressed', String(g === 'v'));
    $('graphX').setAttribute('aria-pressed', String(g === 'x'));
    requestDraw();
  }
  $('graphV').addEventListener('click', function () { setGraph('v'); });
  $('graphX').addEventListener('click', function () { setGraph('x'); });
  [['showComp', 'comp'], ['showNet', 'net'], ['showCrit', 'crit'], ['showMarks', 'marks']].forEach(function (pair) {
    $(pair[0]).addEventListener('change', function (ev) { state.show[pair[1]] = ev.target.checked; requestDraw(); });
  });

  // ---------- 神秘表面 ----------
  function newMystery() {
    const s = IC.mysterySurface();
    state.mystery = { mus: s.mus, muk: s.muk, tries: 3 };
    $('gS').value = ''; $('gK').value = '';
    $('gCheck').disabled = false;
    $('gOut').innerHTML = T('新的神秘表面準備好了：可以核對 3 次。', 'A new mystery surface is ready: you can check 3 times.');
  }
  function parseNum(s) {
    s = String(s || '').normalize('NFKC').trim().replace(/[，,]/g, '.');
    if (!/^\d*\.?\d+$|^\d+\.$/.test(s)) return null;
    return parseFloat(s);
  }
  $('gCheck').addEventListener('click', function () {
    const M = state.mystery;
    if (!M || M.tries <= 0) return;
    const gs = parseNum($('gS').value), gk = parseNum($('gK').value);
    if (gs == null && gk == null) { $('gOut').textContent = T('請輸入 μs 或 μk 的數值。', 'Enter a value for μs or μk.'); return; }
    M.tries--;
    const errS = gs == null ? null : Math.abs(gs - M.mus) / M.mus, errK = gk == null ? null : Math.abs(gk - M.muk) / M.muk;
    const part = function (name, e) {
      if (e == null) return '';
      return name + T('：', ': ') + (e <= 0.02 ? '<span class="ok">' + T('在 2% 以內 ✓', 'within 2% ✓') + '</span>' : '<span class="no">' + T('誤差超過 2%', 'off by more than 2%') + '</span>');
    };
    $('gOut').innerHTML = [part('μ<sub>s</sub>', errS), part('μ<sub>k</sub>', errK)].filter(Boolean).join(T('；', '; '))
      + '<br><small>' + (M.tries > 0 ? T('還可以核對 ', 'Checks left: ') + M.tries + T(' 次', '') : T('這個表面的核對次數用完了，可以換一個。', 'No checks left for this surface — try a new one.')) + '</small>';
    $('gCheck').disabled = M.tries <= 0;
    emit('guess', { mus: M.mus, muk: M.muk, gs: gs, gk: gk, errS: errS, errK: errK, tries: M.tries });
  });
  $('gNew').addEventListener('click', function () {
    newMystery();
    place();
    changed('surface');
    commit();
  });

  // ---------- 拖曳木板 ----------
  function ptOf(e) { const r = cvA.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  function nearHandle(p) {
    if (!SG) return false;
    const R = LA.scene;
    if (p[0] < R.x || p[0] > R.x + R.w || p[1] < R.y || p[1] > R.y + R.h) return false;
    const B = boardFrame();
    const hp = B.at(0.02, BT / 2);
    if (Math.hypot(p[0] - hp[0], p[1] - hp[1]) < 30) return true;
    // 木板上半段（離鉸鏈 45% 以上）也可以抓
    const vx = p[0] - SG.hx, vy = SG.hy - p[1];
    const along = (-vx * B.cs + vy * B.sn) / SG.k, perp = (vx * B.sn + vy * B.cs) / SG.k;
    return along > 0.45 * BOARD && along < BOARD + 0.1 && perp > -0.12 && perp < BT + BH + 0.1;
  }
  function dragTo(p) {
    let th = Math.atan2(SG.hy - p[1], SG.hx - p[0]) / D2R;
    if (th < 0) th = SG.hy - p[1] >= 0 ? 90 : 0;
    th = Math.max(0, Math.min(90, Math.round(th * 10) / 10));
    if (th === state.theta) return;
    state.theta = th;
    setSlider(elTheta, th);
    changed('tilt');
  }
  cvA.addEventListener('pointerdown', function (e) {
    const p = ptOf(e);
    if (!nearHandle(p)) return;
    state.dragging = true;
    stopRaise(true);
    try { cvA.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
    cvA.style.cursor = 'grabbing';
    dragTo(p);
    e.preventDefault();
  });
  cvA.addEventListener('pointermove', function (e) {
    const p = ptOf(e);
    if (state.dragging) { dragTo(p); return; }
    const h = nearHandle(p);
    if (h !== state.hover) { state.hover = h; cvA.style.cursor = h ? 'grab' : 'default'; requestDraw(); }
  });
  function endDrag() {
    if (!state.dragging) return;
    state.dragging = false;
    cvA.style.cursor = state.hover ? 'grab' : 'default';
    requestDraw();
    commit();
  }
  cvA.addEventListener('pointerup', endDrag);
  cvA.addEventListener('pointercancel', endDrag);
  cvA.addEventListener('pointerleave', function () { if (!state.dragging && state.hover) { state.hover = false; cvA.style.cursor = 'default'; requestDraw(); } });

  // ---------- 啟動 ----------
  readColors();
  state.theta = val(elTheta); state.m = val(elM); state.F = val(elF); state.v0 = val(elV0);
  state.cmus = val(elMus); state.cmuk = val(elMuk);
  state.surf = $('surf').value;
  if (state.surf === 'mystery') newMystery();
  $('customBox').hidden = state.surf !== 'custom';
  $('mysteryCard').hidden = state.surf !== 'mystery';
  state.s = IC.newState(startPos().x, 0, startPos().contact);
  forceTexts();
  refreshOutputs();
  updateButtons();
  updateSoundButton();
  renderRecords();
  function themeChanged() { readColors(); if (LA) buildBackgrounds(); requestDraw(); }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { if (cvA.clientWidth !== lastW) { lastW = cvA.clientWidth; resize(); } }).observe(cvA);
  }
  window.addEventListener('resize', function () { resize(); });
  resize();
  setStatus(T('木塊由手扶著。按「放手」開始，或拖曳木板末端的把手改變角度。', 'The block is held by hand. Press “Release” to start, or drag the handle at the end of the board to change the angle.'));
})();
