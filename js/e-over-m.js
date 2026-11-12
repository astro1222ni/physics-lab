/* e-over-m.js — 「電子的荷質比」課本實驗的畫面與互動
 * 物理計算在 e-over-m-core.js；3D 檢視在 e-over-m-3d.js（three.js 切換到 3D 時才動態載入）。
 *
 * 世界座標（cm）：原點在玻璃球中心，x 向右、y 向上、z 由畫面指向觀察者（線圈軸、B 的方向）。
 * 2D 畫面是沿線圈軸看過去的正面圖；開啟「視差」時，畫面是從眼睛位置看過去的透視圖（投影到標尺平面）。
 */
(function () {
  'use strict';
  const C = window.EOverMCore;
  const LD = window.LabDraw;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  function setVal(el, v) {
    if (window.LabNum) window.LabNum.set(el, v);
    else { el.value = v; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); }
  }

  const APP = C.APP;
  const SD = APP.scaleD * 100, EL = APP.eyeL * 100;   // 游標平面在電子束前 d、眼睛在游標前 L（cm）
  const ZERO = APP.scaleZero * 100;                    // 標尺 0 刻度的世界 x（cm）
  const RB = APP.bulbR * 100;                          // 玻璃球內半徑（cm）
  const RBO = RB + 0.15;                               // 外半徑
  const GX = APP.gun.x * 100, GY = APP.gun.y * 100;    // 電子槍出口
  const COIL_R = APP.R * 100, COIL_Z = APP.R * 50, COIL_W = 2.3; // 線圈半徑、位置 z = ±R/2、繞線寬
  const THICK = APP.cursorThick * 100;                 // 游標前後細線的距離
  const CUR_TOP = 6.4;                                 // 游標上端（cm；電子束最左、最右點的高度在 −4.5 ～ 2 cm 之間）
  const SLOW = 16e-9;                                  // 慢動作：畫面 1 秒 = 真實 16 ns
  const SOUND_SCALE = 2.4e-5;                          // 迴旋頻率 → 音高
  const WARM_S = 2.2;                                  // 陰極加熱時間（s）
  // 世界框（cm）：畫面要放得下的範圍
  const WX0 = -19.9, WX1 = 19.9, WY0 = -25.6, WY1 = 18.7;

  const rnd = function (a) { return (Math.random() * 2 - 1) * a; };
  const cal = { eV: rnd(0.004), eI: rnd(0.003) }; // 「含誤差」電表的校正誤差（每次開頁不同）

  const st = {
    power: false, warm: 0, warmT0: 0, fromMin: false,
    V: 0, I: 0, alpha: 0, xL: 2, xR: 18, eye: 10, parallax: false, mode: 'ideal',
    show: { labels: true, field: true, dots: !LD.reducedMotion() },
    rows: [], steps: [false, false, false, false, false, false], status: '',
    eyeAt: { L: null, R: null } // 每個游標最後一次移動時眼睛的位置（標尺讀數，cm）
  };
  let orb = null, orbKey = '', orbVer = 0;
  let ver = 0; // 畫面狀態版本（改變時重畫快取）
  let kb = null; // 鍵盤操作（keys.js），在畫布拖曳的程式後面建立

  // ---------- 電表與電子束 ----------
  function meterV() { return st.mode === 'real' ? C.meter(st.V, cal.eV, 1) : Math.round(st.V); }
  function meterI() { return st.mode === 'real' ? C.meter(st.I, cal.eI, 0.01) : Math.round(st.I * 100) / 100; }
  function bright() {
    if (!st.power || st.V < C.GLOW_V) return 0;
    const u = Math.min(1, (st.V - C.GLOW_V) / 45);
    return st.warm * (0.35 + 0.65 * Math.pow(u, 0.6));
  }
  function beamOn() { return st.power && st.warm > 0.02 && st.V >= C.GLOW_V; }
  function updateOrbit() {
    const key = [st.V, st.I, st.alpha, st.mode].join('|');
    if (key === orbKey) return;
    orbKey = key;
    orbVer++;
    if (st.V <= 0) { orb = null; return; }
    const o = C.orbit({ V: st.V, I: st.I, uniform: st.mode !== 'real', alpha: st.alpha * Math.PI / 180, maxTurns: 12 });
    // 換成 cm，並預先算好沿路徑的累積長度（電子運動的動畫用）
    const pts = o.pts.map(function (p) { return [p[0] * 100, p[1] * 100, p[2] * 100]; });
    const len = [0];
    for (let i = 1; i < pts.length; i++) {
      len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
    }
    orb = {
      raw: o, pts: pts, len: len, total: len[len.length - 1], closed: o.closed, hitGlass: o.hitGlass, hitGun: o.hitGun,
      end: o.end ? [o.end[0] * 100, o.end[1] * 100, o.end[2] * 100] : null, turns: o.turns,
      xMin: o.xMin * 100, xMax: o.xMax * 100, yMax: o.yMax * 100, D: o.D * 100, maxDist: o.maxDist * 100,
      T: o.T, v: o.v
    };
  }

  // ---------- 投影（視差） ----------
  const eyeX = function () { return st.eye + ZERO; }; // 眼睛的世界 x（cm）
  /** 世界點 (x, y, z) 在標尺平面上看起來的位置（cm）。沒有視差時為正投影。 */
  function proj(x, y, z) {
    if (!st.parallax) return [x, y];
    const k = (SD - z) / (EL + SD - z);
    return [x + (eyeX() - x) * k, y + (0 - y) * k];
  }
  /** 電子束用的投影：視差開啟時同 proj；轉動電子槍（螺旋）時加上「近大遠小」，從正面也看得出螺旋朝你靠近 */
  function projB(x, y, z) {
    if (st.parallax || !(st.alpha > 0)) return proj(x, y, z);
    const f = (EL + SD) / (EL + SD - z);
    return [x * f, y * f];
  }
  /** z 平面上的縮放倍率（圓、線圈的半徑） */
  function zScale(z) { return st.parallax ? 1 - (SD - z) / (EL + SD - z) : 1; }

  // ---------- 畫布與版面 ----------
  const cv = $('cv'), ctx = cv.getContext('2d');
  let dpr = 1, W = 0, H = 0, s = 10, ox = 0, oy = 0;
  let side = false, mags = [], diag = null;
  const tok = {};
  function readTokens() {
    const cs = getComputedStyle(document.documentElement);
    ['eom-board', 'eom-board-2', 'eom-copper', 'eom-beam', 'eom-led', 'eom-heat', 'eom-ruler', 'eom-hair', 'eom-metal']
      .forEach(function (k) { tok[k.slice(4)] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
  }
  function layout() {
    W = cv.clientWidth;
    if (!W) return false;
    side = W >= 620;
    const ww = WX1 - WX0, wh = WY1 - WY0;
    if (side) {
      const aw = Math.round(W * 0.6);
      s = aw / ww;
      const ah = wh * s;
      const cx = aw + 12, cw = W - cx - 2;
      const mh = Math.round(Math.min(170, Math.max(130, ah * 0.27)));
      mags = [{ x: cx, y: 4, w: cw, h: mh, side: 'L' }, { x: cx, y: 4 + mh + 10, w: cw, h: mh, side: 'R' }];
      const dy = 4 + 2 * mh + 20;
      diag = { x: cx, y: dy, w: cw, h: Math.max(150, ah - dy - 4) };
      H = Math.round(ah);
      ox = -WX0 * s; oy = WY1 * s;
    } else {
      s = W / ww;
      const ah = wh * s;
      const mw = (W - 10) / 2, mh = Math.round(Math.min(150, Math.max(118, mw * 0.78)));
      mags = [{ x: 0, y: ah + 8, w: mw, h: mh, side: 'L' }, { x: mw + 10, y: ah + 8, w: mw, h: mh, side: 'R' }];
      let h = ah + 8 + mh;
      diag = null;
      if (st.parallax) { diag = { x: 0, y: h + 10, w: W, h: 150 }; h += 160; }
      H = Math.round(h + 4);
      ox = -WX0 * s; oy = WY1 * s;
    }
    return true;
  }
  function resize() {
    if (!layout()) return;
    dpr = Math.min(3, window.devicePixelRatio || 1);
    cv.style.height = H + 'px';
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    ver++;
    draw();
  }
  const X = function (x) { return ox + x * s; };
  const Y = function (y) { return oy - y * s; };
  /** 世界點 → 畫面像素（含視差投影） */
  function P(x, y, z) { const q = proj(x, y, z || 0); return [X(q[0]), Y(q[1])]; }
  function PB(x, y, z) { const q = projB(x, y, z || 0); return [X(q[0]), Y(q[1])]; }

  let drawPending = false;
  function requestDraw() {
    if (drawPending) return;
    drawPending = true;
    requestAnimationFrame(function () { drawPending = false; draw(); });
  }

  // ---------- 離屏快取：裝置（不常變）與完整畫面（狀態改變時重畫） ----------
  const appCv = document.createElement('canvas'), appCtx = appCv.getContext('2d');
  const fullCv = document.createElement('canvas'), fullCtx = fullCv.getContext('2d');
  let appKey = '', fullVer = -1;

  function font(px, w) { return (w || '') + ' ' + px + 'px ' + LD.FONT; }
  /** 暗色裝置上的標籤：深色半透明底＋彩色字（drawkit 的 pill 是淺色底，放在暗箱上不清楚） */
  /** avoid：已放好的標籤方框；重疊時沿 dir（+1 往下、−1 往上）移開，放好後加進 avoid */
  function tag(g, text, x, yb, color, align, f, maxX, avoid, dir) {
    g.font = f || font(12, '600');
    const m = g.measureText(text), tw = m.width, th = LD.textHeight(m, 15);
    const pw = tw + 12, ph = th + 5;
    let bx = align === 'center' ? x - pw / 2 : align === 'right' ? x - pw : x;
    if (maxX != null) bx = Math.max(3, Math.min(bx, maxX - pw));
    let by = Math.max(2, yb - ph); // 不超出畫布上緣（窄螢幕、大字級時）
    if (avoid) {
      const hits = function (y) {
        return avoid.some(function (r) { return bx < r.x + r.w + 4 && bx + pw + 4 > r.x && y < r.y + r.h + 3 && y + ph + 3 > r.y; });
      };
      for (let k = 0; k < 12 && hits(by); k++) by += (dir || 1) * (ph * 0.5 + 2);
      avoid.push({ x: bx, y: by, w: pw, h: ph, text: text });
    }
    LD.roundRect(g, bx, by, pw, ph, ph / 2);
    g.fillStyle = 'rgba(8,13,16,0.8)'; g.fill();
    g.strokeStyle = LD.alpha(color, 0.5); g.lineWidth = 1; g.stroke();
    g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, bx + pw / 2, by + ph / 2 + 0.5);
    return { x: bx, y: by, w: pw, h: ph };
  }
  const A = LD.alpha, SH = LD.shade, MIX = LD.mix;

  // ---- 背景板（暗室）與線圈 ----
  function drawBoard(g) {
    LD.backdrop(g, W, H);
    // 暗室中的黑色背板（照片中的暗箱），兩種配色都用深色，讓發光的電子束清楚
    const x0 = X(-18.9), x1 = X(18.9), y0 = Y(18.3), y1 = Y(-17.3);
    g.save();
    g.shadowColor = LD.shadowInk(0.35); g.shadowBlur = 14; g.shadowOffsetY = 4;
    LD.roundRect(g, x0, y0, x1 - x0, y1 - y0, 14);
    const gr = g.createRadialGradient(X(0), Y(1), 4 * s, X(0), Y(0), 24 * s);
    gr.addColorStop(0, tok['board']); gr.addColorStop(1, tok['board-2']);
    g.fillStyle = gr; g.fill();
    g.restore();
    LD.roundRect(g, x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1, 14);
    g.strokeStyle = A('#ffffff', 0.08); g.lineWidth = 1; g.stroke();
  }
  /** 線圈（z = ±R/2）：銅線繞成的環；front 為前方的線圈 */
  function drawCoil(g, z, front) {
    const c = P(0, 0, z), k = zScale(z) * s;
    const rIn = (COIL_R - COIL_W / 2) * k, rOut = (COIL_R + COIL_W / 2) * k, rm = COIL_R * k;
    const cu = tok.copper;
    g.save();
    // 接觸陰影（銅環在暗板上的影子）
    g.beginPath(); g.arc(c[0] + 2, c[1] + 4, rOut + 1, 0, Math.PI * 2); g.arc(c[0] + 2, c[1] + 4, rIn - 1, 0, Math.PI * 2, true);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fill();
    // 繞線的管狀明暗：內外邊緣暗、中間亮
    const gr = g.createRadialGradient(c[0], c[1], rIn, c[0], c[1], rOut);
    const base = front ? cu : SH(cu, -0.18);
    gr.addColorStop(0, SH(base, -0.5)); gr.addColorStop(0.28, SH(base, 0.1)); gr.addColorStop(0.5, SH(base, 0.32));
    gr.addColorStop(0.72, base); gr.addColorStop(1, SH(base, -0.55));
    g.beginPath(); g.arc(c[0], c[1], rOut, 0, Math.PI * 2); g.arc(c[0], c[1], rIn, 0, Math.PI * 2, true);
    g.fillStyle = gr; g.fill();
    // 一圈圈的導線
    const n = Math.max(6, Math.min(16, Math.round((rOut - rIn) / 1.6)));
    g.lineWidth = Math.max(0.5, (rOut - rIn) / n * 0.35);
    g.strokeStyle = A(SH(base, -0.6), 0.32);
    for (let i = 1; i < n; i++) { g.beginPath(); g.arc(c[0], c[1], rIn + (rOut - rIn) * i / n, 0, Math.PI * 2); g.stroke(); }
    // 左上方的高光（銅的金屬光澤）
    g.lineCap = 'round';
    g.strokeStyle = A(SH(base, 0.75), front ? 0.55 : 0.3);
    g.lineWidth = Math.max(1, (rOut - rIn) * 0.16);
    g.beginPath(); g.arc(c[0], c[1], rm + (rOut - rIn) * 0.1, Math.PI * 1.08, Math.PI * 1.42); g.stroke();
    g.strokeStyle = A(SH(base, 0.6), front ? 0.25 : 0.12);
    g.beginPath(); g.arc(c[0], c[1], rm, Math.PI * 1.7, Math.PI * 1.85); g.stroke();
    // 白色固定夾（上、左、右）
    if (front) {
      [Math.PI / 2, Math.PI * 1.1, Math.PI * 1.9].forEach(function (a) {
        const px = c[0] + Math.cos(a) * rm, py = c[1] - Math.sin(a) * rm;
        g.save(); g.translate(px, py); g.rotate(-a + Math.PI / 2);
        const w = 2.0 * k, h = (COIL_W + 0.7) * k;
        LD.block(g, -w / 2, -h / 2, w, h, SH(tok.ruler, -0.04), { r: Math.min(3, w * 0.2) });
        g.restore();
      });
    }
    g.restore();
  }
  /** 線圈下方的支架與電子槍的底座 */
  function drawStands(g) {
    [-COIL_Z, COIL_Z].forEach(function (z) {
      const q = P(0, -COIL_R - COIL_W / 2, z), k = zScale(z) * s;
      const w = 3.6 * k, top = q[1] - 0.6 * k, bot = Y(-17.25);
      LD.block(g, q[0] - w / 2, top, w, bot - top, SH(tok['board-2'], 0.14), { r: 3, shadow: false });
    });
  }
  /** 玻璃球（後半：球體與頸部；前方的高光另外畫在電子束上面） */
  function drawBulbBack(g) {
    const c = P(0, 0, 0), k = zScale(0) * s, r = RBO * k;
    // 頸部與黑色燈座
    const nk = function (x, y) { return P(x, y, 0); };
    const a = nk(-1.9, -7.4), b = nk(1.9, -11.2);
    const ng = g.createLinearGradient(a[0], 0, b[0], 0);
    ng.addColorStop(0, A('#ffffff', 0.10)); ng.addColorStop(0.35, A('#ffffff', 0.04)); ng.addColorStop(0.8, A('#ffffff', 0.12)); ng.addColorStop(1, A('#ffffff', 0.05));
    g.fillStyle = ng; g.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
    const s0 = nk(-2.6, -10.6), s1 = nk(2.6, -14.9);
    LD.block(g, s0[0], s0[1], s1[0] - s0[0], s1[1] - s0[1], '#20262a', { r: 4 });
    const r0 = nk(-2.75, -10.4), r1 = nk(2.75, -11.3);
    LD.block(g, r0[0], r0[1], r1[0] - r0[0], r1[1] - r0[1], tok.metal, { r: 2, shadow: false });
    // 燈座到底座的支柱
    const p0 = nk(-1.6, -14.9), p1 = nk(1.6, -17.3);
    LD.block(g, p0[0], p0[1], p1[0] - p0[0], p1[1] - p0[1], '#171c1f', { r: 2, shadow: false });
    // 球體：中心極淡、邊緣稍亮（玻璃的厚度感）
    const gr = g.createRadialGradient(c[0] - r * 0.15, c[1] - r * 0.2, r * 0.1, c[0], c[1], r);
    gr.addColorStop(0, A('#ffffff', 0.025)); gr.addColorStop(0.75, A('#ffffff', 0.045)); gr.addColorStop(0.95, A('#d8f4ff', 0.12)); gr.addColorStop(1, A('#ffffff', 0.22));
    g.beginPath(); g.arc(c[0], c[1], r, 0, Math.PI * 2); g.fillStyle = gr; g.fill();
    g.lineWidth = 1.2; g.strokeStyle = A('#e8f7ff', 0.42); g.stroke();
    g.beginPath(); g.arc(c[0], c[1], RB * k, 0, Math.PI * 2); g.lineWidth = 0.8; g.strokeStyle = A('#e8f7ff', 0.12); g.stroke();
    // 電子槍：陰極柱（直立）＋槍管（水平，出口在 (GX, GY)）
    const st0 = nk(-1.15, -10.4), st1 = nk(-0.15, -5.0);
    const mg = g.createLinearGradient(st0[0], 0, st1[0], 0);
    mg.addColorStop(0, SH(tok.metal, -0.45)); mg.addColorStop(0.45, SH(tok.metal, 0.25)); mg.addColorStop(1, SH(tok.metal, -0.35));
    g.fillStyle = mg; g.fillRect(st0[0], st1[1], st1[0] - st0[0], st0[1] - st1[1]);
    // 兩根細的支撐線
    g.strokeStyle = A(tok.metal, 0.55); g.lineWidth = 1;
    [[-1.6, -1.25], [1.0, 0.4]].forEach(function (xx) {
      const u = nk(xx[0], -10.5), v = nk(xx[1], -5.2); g.beginPath(); g.moveTo(u[0], u[1]); g.lineTo(v[0], v[1]); g.stroke();
    });
    const b0 = nk(GX - 1.35, GY + 0.38), b1 = nk(GX, GY - 0.38);
    const bg = g.createLinearGradient(0, b0[1], 0, b1[1]);
    bg.addColorStop(0, SH(tok.metal, 0.35)); bg.addColorStop(0.5, tok.metal); bg.addColorStop(1, SH(tok.metal, -0.5));
    LD.roundRect(g, b0[0], b0[1], b1[0] - b0[0], b1[1] - b0[1], 2); g.fillStyle = bg; g.fill();
    // 陽極圓盤（出口）
    const d0 = nk(GX - 0.18, GY + 0.62), d1 = nk(GX, GY - 0.62);
    g.fillStyle = SH(tok.metal, 0.15); g.fillRect(d0[0], d0[1], Math.max(1.5, d1[0] - d0[0]), d1[1] - d0[1]);
  }

  // ---- 底座（電源供應器） ----
  function drawBase(g) {
    const x0 = X(-19.6), x1 = X(19.6), y0 = Y(-17.25), y1 = Y(-25.3);
    g.save();
    g.shadowColor = LD.shadowInk(0.35); g.shadowBlur = 10; g.shadowOffsetY = 3;
    LD.roundRect(g, x0, y0, x1 - x0, y1 - y0, 8);
    const gr = g.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, '#3a4348'); gr.addColorStop(0.12, '#262d31'); gr.addColorStop(1, '#14191c');
    g.fillStyle = gr; g.fill();
    g.restore();
    // 上緣的亮線與兩側鋁框
    g.fillStyle = A('#ffffff', 0.18); g.fillRect(x0 + 6, y0 + 1, x1 - x0 - 12, 1);
    [[x0, x0 + 1.4 * s], [x1 - 1.4 * s, x1]].forEach(function (p) {
      const tg = g.createLinearGradient(p[0], 0, p[1], 0);
      tg.addColorStop(0, '#6f7a80'); tg.addColorStop(0.5, '#c9d1d5'); tg.addColorStop(1, '#5b656a');
      g.save(); LD.roundRect(g, x0, y0, x1 - x0, y1 - y0, 8); g.clip();
      g.fillStyle = tg; g.fillRect(p[0], y0, p[1] - p[0], y1 - y0); g.restore();
    });
  }
  // 七段顯示器（不依賴字型）
  const SEG = { '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', '-': 'g', ' ': '' };
  function seg7(g, text, xr, yc, h, on) {
    // text：例如 "100" 或 "1.50"；靠右對齊於 xr，垂直置中於 yc
    const cells = [];
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '.') { if (cells.length) cells[cells.length - 1].dot = true; continue; }
      cells.push({ ch: ch, dot: false });
    }
    const w = h * 0.56, gap = h * 0.2, t = Math.max(1.4, h * 0.13), sk = h * 0.1;
    const led = tok.led;
    const dg = h * 0.3; // 小數點另外留空間
    let x = xr - cells.length * (w + gap) + gap - cells.filter(function (c) { return c.dot; }).length * dg;
    for (let n = 0; n < cells.length; n++) {
      const c = cells[n], segs = SEG[c.ch] || '';
      const top = yc - h / 2;
      const P1 = function (px, py) { return [x + px + sk * (1 - py / h), top + py]; };
      const segDef = {
        a: [[t * 0.6, 0], [w - t * 0.6, 0]], d: [[t * 0.6, h], [w - t * 0.6, h]], g: [[t * 0.6, h / 2], [w - t * 0.6, h / 2]],
        b: [[w, t * 0.6], [w, h / 2 - t * 0.5]], c: [[w, h / 2 + t * 0.5], [w, h - t * 0.6]],
        f: [[0, t * 0.6], [0, h / 2 - t * 0.5]], e: [[0, h / 2 + t * 0.5], [0, h - t * 0.6]]
      };
      g.lineCap = 'round';
      ['a', 'b', 'c', 'd', 'e', 'f', 'g'].forEach(function (k) {
        const lit = on && segs.indexOf(k) >= 0;
        const p = P1(segDef[k][0][0], segDef[k][0][1]), q = P1(segDef[k][1][0], segDef[k][1][1]);
        g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]);
        if (lit) {
          g.strokeStyle = A(led, 0.35); g.lineWidth = t * 2.2; g.stroke();
          g.strokeStyle = SH(led, 0.18); g.lineWidth = t; g.stroke();
        } else { g.strokeStyle = A(led, 0.07); g.lineWidth = t; g.stroke(); }
      });
      if (c.dot) {
        const d = P1(w + (gap + dg) * 0.5, h);
        g.beginPath(); g.arc(d[0], d[1] - t * 0.3, t * 0.75, 0, Math.PI * 2);
        if (on) { g.fillStyle = A(led, 0.35); g.fill(); g.beginPath(); g.arc(d[0], d[1] - t * 0.3, t * 0.55, 0, Math.PI * 2); g.fillStyle = SH(led, 0.18); }
        else g.fillStyle = A(led, 0.07);
        g.fill();
      }
      x += w + gap + (c.dot ? dg : 0);
    }
  }
  function drawKnob(g, cx, cy, r, frac) {
    LD.contactShadow(g, cx, cy + r * 0.9, r, 0.1);
    const gr = g.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
    gr.addColorStop(0, '#f4f6f7'); gr.addColorStop(0.55, '#b9c1c5'); gr.addColorStop(1, '#5f696e');
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fillStyle = gr; g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 1; g.stroke();
    g.beginPath(); g.arc(cx, cy, r * 0.72, 0, Math.PI * 2); g.strokeStyle = 'rgba(0,0,0,0.12)'; g.stroke();
    const a = (-225 + 270 * Math.max(0, Math.min(1, frac))) * Math.PI / 180;
    g.beginPath(); g.moveTo(cx + Math.cos(a) * r * 0.25, cy + Math.sin(a) * r * 0.25); g.lineTo(cx + Math.cos(a) * r * 0.86, cy + Math.sin(a) * r * 0.86);
    g.strokeStyle = '#1d2326'; g.lineWidth = Math.max(1.5, r * 0.16); g.lineCap = 'round'; g.stroke();
  }
  function drawPanel(g) {
    const fsz = Math.max(9.5, Math.min(12, s * 0.85));
    // 兩個電表
    const disp = [
      { x: -8.6, label: T('加速電壓 (V)', 'Voltage (V)'), text: st.power ? String(meterV()).padStart(3, ' ') : '   ', frac: st.V / 300 },
      { x: 3.4, label: T('線圈電流 (A)', 'Current (A)'), text: st.power ? meterI().toFixed(2) : ' .  ', frac: st.I / 2.5 }
    ];
    disp.forEach(function (d) {
      const w = 7.2 * s, h = 2.5 * s, x0 = X(d.x) - w / 2, y0 = Y(-18.45);
      g.font = font(fsz, '600'); g.textAlign = 'center'; g.textBaseline = 'alphabetic';
      g.fillStyle = '#c3ccd0'; g.fillText(d.label, X(d.x), y0 - 3);
      LD.roundRect(g, x0, y0, w, h, 4);
      g.fillStyle = '#070909'; g.fill(); g.strokeStyle = '#5b6569'; g.lineWidth = 1; g.stroke();
      seg7(g, d.text, x0 + w - 0.55 * s, y0 + h / 2, h * 0.66, st.power);
      drawKnob(g, X(d.x), Y(-23.3), 1.15 * s, d.frac);
    });
    // 電源開關與指示燈
    const px = X(14.2), py = Y(-21.3), pw = 1.9 * s, ph = 2.7 * s;
    g.font = font(fsz, '600'); g.textAlign = 'center'; g.fillStyle = '#c3ccd0';
    g.fillText(T('電源', 'Power'), px, Y(-18.45) - 3);
    LD.block(g, px - pw / 2, py - ph / 2, pw, ph, st.power ? '#c62f28' : '#7a2420', { r: 3 });
    g.fillStyle = st.power ? A('#ffffff', 0.35) : A('#000000', 0.25);
    g.fillRect(px - pw / 2 + 2, st.power ? py - ph / 2 + 2 : py + 1, pw - 4, ph / 2 - 3);
    const lx = X(14.2), ly = Y(-24.0);
    if (st.power) { const gl = g.createRadialGradient(lx, ly, 0, lx, ly, 0.9 * s); gl.addColorStop(0, A(tok.led, 0.8)); gl.addColorStop(1, A(tok.led, 0)); g.fillStyle = gl; g.beginPath(); g.arc(lx, ly, 0.9 * s, 0, Math.PI * 2); g.fill(); }
    g.beginPath(); g.arc(lx, ly, 0.32 * s, 0, Math.PI * 2); g.fillStyle = st.power ? SH(tok.led, 0.3) : '#3a1513'; g.fill();
    // 銘牌
    g.font = font(Math.max(8.5, fsz * 0.85), '600'); g.textAlign = 'left'; g.fillStyle = A('#ffffff', 0.38);
    g.fillText('e/m', X(-17.6), Y(-20.0));
    g.fillText('N = 130', X(-17.6), Y(-21.9));
    g.fillText('R = 15 cm', X(-17.6), Y(-23.8));
  }

  // ---- 電子束 ----
  function beamPath(g, pts, map) {
    g.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const q = map(pts[i]);
      if (i === 0) g.moveTo(q[0], q[1]); else g.lineTo(q[0], q[1]);
    }
  }
  function drawBeam(g, pts, map, pxPerCm, b) {
    if (!pts || pts.length < 2 || b <= 0) return;
    const col = tok.beam;
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round'; g.lineJoin = 'round';
    beamPath(g, pts, map);
    // 柔和的光暈用陰影模糊（不支援時只是少了光暈），再疊上亮的核心
    g.shadowColor = A(col, 0.85 * b);
    g.shadowBlur = Math.max(7, 0.55 * pxPerCm) * dpr;
    g.strokeStyle = A(col, 0.16 * b); g.lineWidth = Math.max(2.6, 0.24 * pxPerCm); g.stroke();
    g.shadowBlur = Math.max(3, 0.16 * pxPerCm) * dpr;
    g.strokeStyle = A(col, 0.5 * b); g.lineWidth = Math.max(1.4, 0.1 * pxPerCm); g.stroke();
    g.shadowBlur = 0; g.shadowColor = 'transparent';
    g.strokeStyle = A(SH(col, 0.75), 0.8 * b); g.lineWidth = Math.max(0.75, 0.035 * pxPerCm); g.stroke();
    g.restore();
  }
  function drawGlassHit(g, q, b, R) {
    const gr = g.createRadialGradient(q[0], q[1], 0, q[0], q[1], R);
    gr.addColorStop(0, A(SH(tok.beam, 0.7), 0.9 * b)); gr.addColorStop(0.3, A(tok.beam, 0.45 * b)); gr.addColorStop(1, A(tok.beam, 0));
    g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = gr; g.beginPath(); g.arc(q[0], q[1], R, 0, Math.PI * 2); g.fill(); g.restore();
  }
  function drawHeater(g) {
    if (!st.power) return;
    const q = P(-0.65, -9.6, 0), R = 1.1 * s * zScale(0);
    const gr = g.createRadialGradient(q[0], q[1], 0, q[0], q[1], R);
    gr.addColorStop(0, A(tok.heat, 0.85 * st.warm)); gr.addColorStop(0.4, A(tok.heat, 0.35 * st.warm)); gr.addColorStop(1, A(tok.heat, 0));
    g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = gr; g.beginPath(); g.arc(q[0], q[1], R, 0, Math.PI * 2); g.fill(); g.restore();
  }
  function drawBulbFront(g) {
    const c = P(0, 0, 0), r = RBO * zScale(0) * s;
    g.save();
    const hl = g.createRadialGradient(c[0] - r * 0.42, c[1] - r * 0.48, 0, c[0] - r * 0.42, c[1] - r * 0.48, r * 0.55);
    hl.addColorStop(0, A('#ffffff', 0.2)); hl.addColorStop(1, A('#ffffff', 0));
    g.fillStyle = hl; g.beginPath(); g.arc(c[0], c[1], r, 0, Math.PI * 2); g.fill();
    g.lineCap = 'round';
    g.strokeStyle = A('#ffffff', 0.5); g.lineWidth = Math.max(1.5, r * 0.035);
    g.beginPath(); g.arc(c[0], c[1], r * 0.86, Math.PI * 1.12, Math.PI * 1.32); g.stroke();
    g.strokeStyle = A('#ffffff', 0.18); g.lineWidth = Math.max(1, r * 0.02);
    g.beginPath(); g.arc(c[0], c[1], r * 0.9, Math.PI * 0.1, Math.PI * 0.32); g.stroke();
    g.restore();
  }

  // ---- 磁場與電流方向提示 ----
  function drawFieldHints(g) {
    if (!st.show.field || !(st.I > 0) || !st.power) return;
    const f = Math.min(1, st.I / 2.0);
    const col = A('#e7f3f6', 0.18 + 0.4 * f);
    const r0 = 0.42 * s * zScale(0);
    for (let x = -12; x <= 12.01; x += 3) {
      for (let y = -12; y <= 12.01; y += 3) {
        const rr = Math.hypot(x, y);
        if (rr < RBO + 1.0 || rr > COIL_R - COIL_W / 2 - 1.0) continue;
        const q = P(x, y, 0);
        g.beginPath(); g.arc(q[0], q[1], r0, 0, Math.PI * 2); g.strokeStyle = col; g.lineWidth = 1; g.stroke();
        g.beginPath(); g.arc(q[0], q[1], Math.max(1, r0 * 0.28), 0, Math.PI * 2); g.fillStyle = col; g.fill();
      }
    }
    // 線圈上的電流方向（由前方看為逆時針 → B 指向觀察者，右手定則）
    const c = P(0, 0, COIL_Z), k = zScale(COIL_Z) * s, rm = COIL_R * k;
    [0.25, 0.75, 1.25, 1.75].forEach(function (a0) {
      const a = a0 * Math.PI, da = 0.16;
      const p0 = [c[0] + Math.cos(a - da) * rm, c[1] - Math.sin(a - da) * rm], p1 = [c[0] + Math.cos(a + da) * rm, c[1] - Math.sin(a + da) * rm];
      LD.arrow(g, p0[0], p0[1], p1[0], p1[1], SH(LD.c.equi, 0.25), 2.2);
    });
  }

  // ---- 標尺與游標（在標尺平面 z = d，不受投影影響） ----
  function drawScale(g) {
    const x0 = X(ZERO - 0.7), x1 = X(ZERO + 20.7), y0 = Y(-13.7), y1 = Y(-15.3);
    LD.block(g, x0, y0, x1 - x0, y1 - y0, tok.ruler, { r: 2 });
    g.save();
    g.strokeStyle = '#2a2a26'; g.fillStyle = '#2a2a26';
    const mm = s >= 16;
    for (let i = 0; i <= 200; i++) {
      const isCm = i % 10 === 0, isHalf = i % 5 === 0;
      if (!mm && !isHalf) continue;
      const x = Math.round(X(ZERO + i / 10)) + 0.5;
      const len = (isCm ? 0.75 : isHalf ? 0.5 : 0.3) * s;
      g.lineWidth = isCm ? 1 : 0.7;
      g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y0 + len); g.stroke();
      if (isCm && (i / 10) % (s < 11 ? 2 : 1) === 0) {
        g.font = font(Math.max(8, Math.min(10.5, s * 0.62)), '600'); g.textAlign = 'center'; g.textBaseline = 'alphabetic';
        g.fillText(String(i / 10), x, y1 - 2);
      }
    }
    g.restore();
  }
  function drawCursor(g, which, hover) {
    const xs = which === 'L' ? st.xL : st.xR, Xw = xs + ZERO, sg = which === 'L' ? -1 : 1;
    const top = Y(CUR_TOP), bot = Y(-15.9);
    // 深色把手（外側）＋透明壓克力（內側，上面有細線）
    const bx0 = X(Xw + sg * 0.75), bx1 = X(Xw + sg * 1.95);
    LD.block(g, Math.min(bx0, bx1), top, Math.abs(bx1 - bx0), bot - top, '#15191b', { r: 3 });
    const ax0 = X(Xw + sg * 0.75), ax1 = X(Xw - sg * 0.35);
    const aL = Math.min(ax0, ax1), aW = Math.abs(ax1 - ax0);
    g.fillStyle = A('#dff3ff', hover ? 0.16 : 0.09); g.fillRect(aL, top, aW, bot - top);
    g.strokeStyle = A('#dff3ff', 0.25); g.lineWidth = 1; g.strokeRect(aL + 0.5, top + 0.5, aW - 1, bot - top - 1);
    // 前、後兩條細線（後面那條透過壓克力看過去；有視差時會分開）
    const back = proj(Xw, 0, SD - THICK / 2)[0], front = proj(Xw, 0, SD + THICK / 2)[0];
    g.save(); g.lineCap = 'butt';
    g.strokeStyle = A(tok.hair, 0.55); g.lineWidth = 1;
    g.beginPath(); g.moveTo(X(back), top + 2); g.lineTo(X(back), Y(-13.6)); g.stroke();
    g.strokeStyle = tok.hair; g.lineWidth = hover ? 1.8 : 1.3;
    g.beginPath(); g.moveTo(X(front), top + 2); g.lineTo(X(front), Y(-13.6)); g.stroke();
    // 游標在標尺上的指標
    const ix = X(Xw);
    g.fillStyle = tok.hair;
    g.beginPath(); g.moveTo(ix, Y(-13.75)); g.lineTo(ix - 0.35 * s, Y(-15.6)); g.lineTo(ix + 0.35 * s, Y(-15.6)); g.closePath(); g.fill();
    g.restore();
    if (hover) { g.strokeStyle = A(LD.c.accent, 0.8); g.lineWidth = 2; LD.roundRect(g, Math.min(bx0, bx1, aL) - 2, top - 2, Math.abs(bx1 - bx0) + aW + 4, bot - top + 4, 4); g.stroke(); }
  }

  // ---- 放大鏡 ----
  function extremeY(which) {
    if (!orb) return 0;
    let best = which === 'L' ? Infinity : -Infinity, yy = 0;
    for (let i = 0; i < orb.pts.length; i++) {
      const p = orb.pts[i], q = proj(p[0], p[1], p[2]);
      if (which === 'L' ? q[0] < best : q[0] > best) { best = q[0]; yy = q[1]; }
    }
    return yy;
  }
  function drawMag(g, m) {
    const which = m.side, xs = which === 'L' ? st.xL : st.xR, Xw = xs + ZERO;
    const span = 1.5, z = m.w / span; // 放大鏡的寬度相當於 1.5 cm
    const ruler = Math.min(30, m.h * 0.22);
    const yc = extremeY(which);
    const cx = m.x + m.w / 2, cy = m.y + (m.h - ruler) * 0.52;
    const map = function (p) { const q = proj(p[0], p[1], p[2]); return [cx + (q[0] - Xw) * z, cy - (q[1] - yc) * z]; };
    g.save();
    g.shadowColor = LD.shadowInk(0.3); g.shadowBlur = 8; g.shadowOffsetY = 2;
    LD.roundRect(g, m.x, m.y, m.w, m.h, 10); g.fillStyle = tok['board-2']; g.fill();
    g.restore();
    g.save();
    LD.roundRect(g, m.x, m.y, m.w, m.h, 10); g.clip();
    // 背景微光
    const bg = g.createRadialGradient(cx, cy, 0, cx, cy, m.w * 0.7);
    bg.addColorStop(0, tok.board); bg.addColorStop(1, tok['board-2']);
    g.fillStyle = bg; g.fillRect(m.x, m.y, m.w, m.h);
    // 壓克力與把手
    const sg = which === 'L' ? -1 : 1;
    const ax0 = cx + sg * 0.75 * z, ax1 = cx - sg * 0.35 * z, bx1 = cx + sg * 1.95 * z;
    g.fillStyle = A('#dff3ff', 0.08); g.fillRect(Math.min(ax0, ax1), m.y, Math.abs(ax1 - ax0), m.h - ruler);
    g.fillStyle = '#15191b'; g.fillRect(Math.min(ax0, bx1), m.y, Math.abs(bx1 - ax0), m.h - ruler);
    // 電子束（只取放大鏡附近的點）
    if (orb && beamOn()) {
      const near = [];
      let run = [];
      for (let i = 0; i < orb.pts.length; i++) {
        const q = map(orb.pts[i]);
        const inside = q[0] > m.x - 60 && q[0] < m.x + m.w + 60 && q[1] > m.y - 60 && q[1] < m.y + m.h + 60;
        if (inside) run.push(orb.pts[i]); else if (run.length) { near.push(run); run = []; }
      }
      if (run.length) near.push(run);
      near.forEach(function (r) { if (r.length > 1) drawBeam(g, r, map, z, bright()); });
      if (orb.hitGlass && orb.end) { const q = map(orb.end); drawGlassHit(g, q, bright(), 0.5 * z); }
    }
    // 細線（後、前）
    const back = proj(Xw, 0, SD - THICK / 2)[0], front = proj(Xw, 0, SD + THICK / 2)[0];
    const xb = cx + (back - Xw) * z, xf = cx + (front - Xw) * z;
    g.strokeStyle = A(tok.hair, 0.5); g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(xb, m.y); g.lineTo(xb, m.y + m.h - ruler); g.stroke();
    g.strokeStyle = tok.hair; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(xf, m.y); g.lineTo(xf, m.y + m.h - ruler); g.stroke();
    // 標尺帶（mm 刻度，指標在中央）
    const ry = m.y + m.h - ruler;
    g.fillStyle = tok.ruler; g.fillRect(m.x, ry, m.w, ruler);
    g.strokeStyle = '#2a2a26'; g.fillStyle = '#2a2a26';
    const first = Math.ceil((xs - span / 2 - 0.2) * 10), last = Math.floor((xs + span / 2 + 0.2) * 10);
    for (let i = first; i <= last; i++) {
      const x = cx + (i / 10 - xs) * z;
      const isCm = i % 10 === 0, isHalf = i % 5 === 0;
      g.lineWidth = isCm ? 1.4 : 1;
      g.beginPath(); g.moveTo(x, ry); g.lineTo(x, ry + ruler * (isCm ? 0.55 : isHalf ? 0.4 : 0.26)); g.stroke();
      if (isCm) { g.font = font(10, '700'); g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillText(String(i / 10), x, ry + ruler - 1); }
    }
    g.fillStyle = tok.hair;
    g.beginPath(); g.moveTo(cx, ry + 1); g.lineTo(cx - 5, ry + ruler * 0.62); g.lineTo(cx + 5, ry + ruler * 0.62); g.closePath(); g.fill();
    g.restore();
    LD.roundRect(g, m.x + 0.5, m.y + 0.5, m.w - 1, m.h - 1, 10); g.strokeStyle = A('#ffffff', 0.14); g.lineWidth = 1; g.stroke();
    // 標題與讀數
    const fz = Math.max(10, Math.min(12, m.w * 0.075));
    const rd = tag(g, xs.toFixed(2) + ' cm', m.x + m.w - 7, m.y + 6 + fz * 1.45, tok.hair, 'right', font(fz, '700'));
    let title = (which === 'L' ? T('左游標', 'Left cursor') : T('右游標', 'Right cursor')) + ' ×' + Math.round(z / s);
    g.font = font(fz, '600');
    if (g.measureText(title).width + 12 > rd.x - m.x - 12) title = which === 'L' ? T('左', 'L') : T('右', 'R');
    tag(g, title, m.x + 7, m.y + 6 + fz * 1.45, '#e7f3f6', 'left', font(fz, '600'));
    // 視差：前後細線沒有重合時提示
    if (st.parallax && Math.abs(xf - xb) > 2.5) {
      tag(g, T('細線沒重合：有視差', 'Hairlines apart: parallax'), cx, ry - 6, SH(tok.heat, 0.2), 'center', font(Math.max(9.5, fz - 1), '600'));
    }
  }

  // ---- 視差俯視圖（由上往下看：眼睛、標尺平面、電子束平面） ----
  function drawDiag(g, d) {
    g.save();
    g.shadowColor = LD.shadowInk(0.18); g.shadowBlur = 6; g.shadowOffsetY = 1;
    LD.roundRect(g, d.x, d.y, d.w, d.h, 10); g.fillStyle = LD.c.surface; g.fill();
    g.restore();
    LD.roundRect(g, d.x + 0.5, d.y + 0.5, d.w - 1, d.h - 1, 10); g.strokeStyle = A(LD.c.text, 0.12); g.lineWidth = 1; g.stroke();
    const fz = Math.max(10, Math.min(12, d.w * 0.04));
    const padX = 14, topY = d.y + 30, botY = d.y + d.h - 26;
    const kx = (d.w - 2 * padX) / 24; // x 方向 px/cm（−12 ～ 12 cm）
    const zEye = SD + EL, kz = (botY - topY) / (zEye + 1.5);
    const mx = function (x) { return d.x + d.w / 2 + x * kx; };
    const mz = function (z) { return topY + (z + 1.5) * kz; };
    g.save();
    LD.roundRect(g, d.x, d.y, d.w, d.h, 10); g.clip();
    LD.haloText(g, T('俯視圖（前後方向已壓縮）', 'Top view (depth compressed)'), d.x + 10, d.y + 18, LD.c.muted, 'left', 'alphabetic', font(fz, '600'));
    // 電子束平面與電子束的左右端
    g.setLineDash([4, 4]); g.strokeStyle = A(tok.beam, 0.9); g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(mx(-11.5), mz(0)); g.lineTo(mx(11.5), mz(0)); g.stroke(); g.setLineDash([]);
    // 標尺平面
    g.strokeStyle = A(LD.c.text, 0.7); g.lineWidth = 3;
    g.beginPath(); g.moveTo(mx(ZERO - 0.5), mz(SD)); g.lineTo(mx(ZERO + 20.5), mz(SD)); g.stroke();
    LD.haloText(g, T('電子束', 'beam'), mx(11.5), mz(0) - 5, SH(tok.beam, -0.35), 'right', 'alphabetic', font(fz - 1, '600'));
    LD.haloText(g, T('標尺與游標', 'scale & cursors'), mx(11.5), mz(SD) + fz + 4, LD.c.muted, 'right', 'alphabetic', font(fz - 1, '600'));
    const ex = st.parallax ? eyeX() : null;
    if (orb && beamOn()) {
      [orb.xMin, orb.xMax].forEach(function (x) { LD.ball(g, mx(x), mz(0), 3.5, tok.beam, { shadow: false }); });
    }
    // 視線：眼睛 → 游標細線 → 延長到電子束平面
    ['L', 'R'].forEach(function (w) {
      const Xw = (w === 'L' ? st.xL : st.xR) + ZERO;
      const e = ex == null ? Xw : ex; // 沒有視差：眼睛永遠正對游標
      const xb = Xw + (Xw - e) * SD / EL; // 視線延長到電子束平面
      const ok = Math.abs(e - Xw) < 0.3;
      g.strokeStyle = ok ? A(LD.c.probe, 0.85) : A(tok.heat, 0.9); g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(mx(e), mz(zEye)); g.lineTo(mx(Xw), mz(SD)); g.stroke();
      g.setLineDash([3, 3]); g.beginPath(); g.moveTo(mx(Xw), mz(SD)); g.lineTo(mx(xb), mz(0)); g.stroke(); g.setLineDash([]);
      g.fillStyle = tok.hair; g.beginPath(); g.arc(mx(Xw), mz(SD), 3, 0, Math.PI * 2); g.fill();
      if (ex == null) drawEye(g, mx(e), mz(zEye), 0.7);
    });
    if (ex != null) drawEye(g, mx(ex), mz(zEye), 1);
    LD.haloText(g, ex == null ? T('理想讀法：每次都正對游標', 'Ideal: always straight in front') : T('眼睛', 'eye'), mx(0), botY + 20, LD.c.muted, 'center', 'alphabetic', font(fz - 1, '600'));
    g.restore();
  }
  function drawEye(g, x, y, a) {
    g.save(); g.globalAlpha = a;
    g.beginPath(); g.ellipse(x, y, 9, 5.5, 0, 0, Math.PI * 2); g.fillStyle = LD.c.surface; g.fill();
    g.strokeStyle = LD.c.text; g.lineWidth = 1.3; g.stroke();
    g.beginPath(); g.arc(x, y - 0.5, 3, 0, Math.PI * 2); g.fillStyle = LD.c.text; g.fill();
    g.restore();
  }

  // ---- 名稱標示 ----
  function drawLabels(g) {
    if (!st.show.labels) return;
    const fz = Math.max(10, Math.min(12.5, s * 0.92)), f = font(fz, '600');
    const lab = '#e7f3f6', mx = X(WX1) - 3, narrow = W < 520;
    const placed = []; // 已放好的標籤：後放的若重疊就移開，任何寬度、語言、字級都不會疊在一起
    const r1 = tag(g, T('亥姆霍茲線圈', 'Helmholtz coils'), X(-18.4), Y(17.2), SH(tok.copper, 0.35), 'left', f, mx, placed, 1);
    const note = st.parallax ? [T('從眼睛的位置看（透視）', 'Seen from your eye (perspective)'), SH(tok.heat, 0.2)]
      : st.alpha > 0 && beamOn() ? [T('螺旋朝你前進（近大遠小）', 'Helix coming towards you'), SH(tok.beam, 0.3)] : null;
    if (note) {
      g.font = f;
      const fits = X(18.4) - g.measureText(note[0]).width - 14 > r1.x + r1.w + 6;
      tag(g, note[0], X(18.4), fits ? Y(17.2) : Y(-12.2), note[1], 'right', f, mx, placed, fits ? 1 : -1);
    }
    if (st.show.field && st.I > 0 && st.power) {
      tag(g, T('B 指向你 ⊙', 'B towards you ⊙'), X(-18.4), r1.y + 2 * r1.h + 4, '#e7f3f6', 'left', f, mx, placed, 1);
    }
    let q = P(RBO * 0.62, RBO * 0.86, 0);
    tag(g, narrow ? T('玻璃球', 'Bulb') : T('玻璃球（低壓氦氣）', 'Bulb (low-pressure helium)'), q[0] + 6, q[1] - 4, lab, 'left', f, mx, placed, -1);
    q = P(-1.2, -7.6, 0);
    tag(g, T('電子槍', 'Electron gun'), q[0] - 8, q[1], SH(tok.metal, 0.4), 'right', f, mx, placed, 1);
    tag(g, T('標尺', 'Scale'), X(ZERO - 1.0), Y(-13.9), SH(tok.ruler, -0.1), 'right', f, mx, placed, -1);
    // 游標的標籤放在右游標把手的外側、靠下方（不和玻璃球的標籤搶位置）
    if (!narrow) tag(g, T('游標', 'Cursor'), X(st.xR + ZERO + 2.2), Y(-9.5), tok.hair, 'left', f, mx, placed, -1);
    cv._eomTags = placed; // 給測試檢查標籤有沒有重疊
  }

  // ---- 組合畫面 ----
  function appStaticKey() {
    return [W, H, dpr, s, st.parallax ? eyeX().toFixed(2) : 'o', LD.ver, tok.board, tok.copper].join('|');
  }
  function buildApp() {
    const key = appStaticKey();
    if (key === appKey) return;
    appKey = key;
    if (appCv.width !== cv.width || appCv.height !== cv.height) { appCv.width = cv.width; appCv.height = cv.height; }
    const g = appCtx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    drawBoard(g);
    drawCoil(g, -COIL_Z, false);
    drawStands(g);
    drawBulbBack(g);
    drawCoil(g, COIL_Z, true);
  }
  function buildFull() {
    if (fullVer === ver) return;
    fullVer = ver;
    buildApp();
    if (fullCv.width !== cv.width || fullCv.height !== cv.height) { fullCv.width = cv.width; fullCv.height = cv.height; }
    const g = fullCtx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, fullCv.width, fullCv.height);
    g.drawImage(appCv, 0, 0);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawHeater(g);
    drawFieldHints(g);
    if (orb && beamOn()) {
      const b = bright();
      drawBeam(g, orb.pts, function (p) { return PB(p[0], p[1], p[2]); }, s * zScale(0), b);
      if (orb.hitGlass && orb.end) drawGlassHit(g, PB(orb.end[0], orb.end[1], orb.end[2]), b, 0.7 * s);
      // 電子槍出口的亮點
      const q = P(GX, GY, 0);
      drawGlassHit(g, q, 0.6 * b, 0.45 * s);
    }
    drawBulbFront(g);
    drawScale(g);
    drawCursor(g, 'L', hover === 'L');
    drawCursor(g, 'R', hover === 'R');
    drawBase(g);
    drawPanel(g);
    drawLabels(g);
    mags.forEach(function (m) { drawMag(g, m); });
    if (diag) drawDiag(g, diag);
    drawKbFocus(g);
  }

  // ---- 電子運動（每一幀） ----
  let animT = 0;
  function drawDots(g) {
    if (!st.show.dots || !orb || !beamOn() || !(orb.total > 0) || !isFinite(orb.T)) return;
    const vAnim = orb.v * 100 * SLOW; // cm/s（畫面上的速率）
    const n = Math.max(3, Math.min(9, Math.round(orb.total / 6)));
    const spacing = orb.total / n;
    const b = bright();
    for (let k = 0; k < n; k++) {
      let L = (animT * vAnim + k * spacing) % orb.total;
      // 二分搜尋路徑上的位置
      let lo = 0, hi = orb.len.length - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (orb.len[mid] <= L) lo = mid; else hi = mid; }
      const a = orb.pts[lo], c = orb.pts[hi], u = (L - orb.len[lo]) / Math.max(1e-9, orb.len[hi] - orb.len[lo]);
      const q = PB(a[0] + (c[0] - a[0]) * u, a[1] + (c[1] - a[1]) * u, a[2] + (c[2] - a[2]) * u);
      const gr = g.createRadialGradient(q[0], q[1], 0, q[0], q[1], 6);
      gr.addColorStop(0, A('#ffffff', 0.95 * b)); gr.addColorStop(0.35, A(tok.beam, 0.6 * b)); gr.addColorStop(1, A(tok.beam, 0));
      g.fillStyle = gr; g.beginPath(); g.arc(q[0], q[1], 6, 0, Math.PI * 2); g.fill();
    }
  }

  function draw() {
    if (!W) return;
    buildFull();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(fullCv, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; drawDots(ctx); ctx.restore();
  }

  // ---------- 動畫迴圈（只有加熱中或電子運動時才跑） ----------
  let raf = 0, lastT = 0;
  function needLoop() {
    if (document.hidden) return false;
    if (view3 && view3.active) return st.power && st.warm < 1;
    return (st.power && st.warm < 1) || (st.show.dots && beamOn());
  }
  function loop(t) {
    raf = 0;
    const dt = lastT ? Math.min(1 / 30, (t - lastT) / 1000) : 0;
    lastT = t;
    animT += dt;
    if (st.power && st.warm < 1) {
      st.warm = Math.min(1, (performance.now() - st.warmT0) / (WARM_S * 1000));
      ver++;
      if (st.warm >= 1) afterChange(true); // 加熱完成（使用者開機的結果）
      if (view3 && view3.active) view3.update();
    }
    if (view3 && view3.active) view3.frame(animT);
    else draw();
    if (needLoop() || (view3 && view3.active && st.show.dots && beamOn())) raf = requestAnimationFrame(loop);
    else lastT = 0;
  }
  function kick() { if (!raf && (needLoop() || (view3 && view3.active && st.show.dots && beamOn()))) { lastT = 0; raf = requestAnimationFrame(loop); } }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { kick(); requestDraw(); } });

  // ---------- 讀數、步驟、狀態列 ----------
  const fmtB = function (B) { return (B * 1e4).toFixed(2) + ' × 10<sup>−4</sup> T'; };
  function beamText() {
    if (!st.power) return T('電源關閉', 'power off');
    if (st.warm < 1) return T('陰極加熱中…', 'cathode warming up…');
    if (st.V < C.GLOW_V) return T('電壓太低，看不到', 'voltage too low to glow');
    if (!orb) return '—';
    if (st.alpha > 0) return orb.hitGlass ? T('螺旋 ' + orb.turns.toFixed(1) + ' 圈後打到玻璃', 'helix, hits glass after ' + orb.turns.toFixed(1) + ' turns')
      : T('螺旋 ' + orb.turns.toFixed(1) + ' 圈', 'helix, ' + orb.turns.toFixed(1) + ' turns');
    if (orb.closed) return T('完整的圓', 'complete circle');
    if (orb.hitGlass) return st.I <= 0 ? T('直線，打到玻璃', 'straight, hits the glass') : T('圓太大，打到玻璃', 'circle too big, hits the glass');
    return '—';
  }
  function setHTML(id, h) { const el = $(id); if (el.innerHTML !== h) el.innerHTML = h; }
  function updateReadouts() {
    setHTML('rV', st.power ? meterV() + ' V' : '—');
    setHTML('rI', st.power ? meterI().toFixed(2) + ' A' : '—');
    setHTML('rB', st.power ? fmtB(C.centreField(APP.N, APP.R, meterI())) : '—');
    setHTML('rxL', st.xL.toFixed(2) + ' cm');
    setHTML('rxR', st.xR.toFixed(2) + ' cm');
    const Dm = st.xR - st.xL;
    setHTML('rD', Dm.toFixed(2) + ' cm');
    setHTML('rr', (Dm / 2).toFixed(3) + ' cm');
    setHTML('rBeam', beamText());
    $('power').textContent = st.power ? T('關閉電源', 'Power off') : T('開啟電源', 'Power on');
    $('power').setAttribute('aria-pressed', String(st.power));
  }
  function complete() { return !!(orb && beamOn() && st.warm >= 1 && orb.closed && st.alpha === 0); }
  function updateSteps() {
    const s0 = st.steps;
    if (complete()) s0[1] = true;
    if (complete() && meterV() === 100 && s0[1]) s0[2] = true;
    const vs = {};
    st.rows.forEach(function (r) { vs[r.V] = true; });
    if (vs[100]) { s0[3] = true; s0[4] = true; }
    if (vs[100] && vs[150] && vs[200] && vs[250]) s0[5] = true;
    const items = $('steps').children;
    let now = -1;
    for (let i = 0; i < items.length; i++) {
      items[i].classList.toggle('done', !!s0[i]);
      if (now < 0 && !s0[i]) now = i;
      items[i].classList.toggle('now', i === now);
      if (s0[i]) items[i].setAttribute('aria-label', T('已完成：', 'Done: ') + items[i].textContent);
      else items[i].removeAttribute('aria-label');
    }
    return now;
  }
  const STEP_HINT = [
    ['步驟 1：先確認兩個旋鈕都在 0，再按「開啟電源」。', 'Step 1: check that both knobs are at 0, then press “Power on”.'],
    ['步驟 2：調高加速電壓（至少約 30 V 才會發光），再調高線圈電流，讓電子束彎成完整的圓。', 'Step 2: raise the voltage (it glows above about 30 V), then the coil current, until the beam closes into a full circle.'],
    ['步驟 3：把加速電壓調到電壓表讀 100 V（圓要保持完整）。', 'Step 3: set the voltmeter to 100 V (keep the circle complete).'],
    ['步驟 4、5：B 已列在「讀數」。拖曳左右游標對準電子束最左與最右端的中央，按「記錄」。', 'Steps 4–5: B is listed under “Readings”. Drag the cursors onto the middle of the beam at its leftmost and rightmost points, then press “Record”.'],
    ['步驟 4、5：B 已列在「讀數」。拖曳左右游標對準電子束最左與最右端的中央，按「記錄」。', 'Steps 4–5: B is listed under “Readings”. Drag the cursors onto the middle of the beam at its leftmost and rightmost points, then press “Record”.'],
    ['步驟 6：再做 150 V、200 V、250 V（每次調電流讓圓大小適中），完成數據表。', 'Step 6: repeat at 150 V, 200 V and 250 V (adjust the current for a medium-sized circle) to complete the table.']
  ];
  function setStatus(msg, html) {
    st.status = msg;
    const el = $('status');
    if (html) { if (el.innerHTML !== msg) el.innerHTML = msg; } else if (el.textContent !== msg) el.textContent = msg;
  }
  let pinned = 0; // 暫時訊息（例如記錄失敗）保留到這個時間
  function stepStatus() {
    if (performance.now() < pinned) return;
    const now = updateSteps();
    if (now < 0) setStatus(T('六個步驟都完成了！看看下方的分析；也可以試試「含誤差」與「視差」。', 'All six steps done! See the analysis below, then try “With errors” and “Parallax”.'));
    else setStatus(T(STEP_HINT[now][0], STEP_HINT[now][1]));
  }
  function flash(msg, ms, html) { setStatus(msg, html); pinned = performance.now() + (ms || 4000); }

  // ---------- 任務事件 ----------
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  function beamInfo() {
    return {
      power: st.power, warm: st.warm >= 1, on: beamOn(), fromMin: st.fromMin, complete: complete(),
      V: st.V, I: st.I, Vm: meterV(), Im: meterI(), alpha: st.alpha, mode: st.mode, parallax: st.parallax,
      closed: !!(orb && orb.closed), hitGlass: !!(orb && orb.hitGlass), turns: orb ? orb.turns : 0,
      D: orb ? orb.D : 0, top: orb ? orb.yMax : 0, gap: orb ? RB - orb.maxDist : 0, zMax: orb ? orb.raw.zMax * 100 : 0
    };
  }

  // ---------- 狀態改變 ----------
  function afterChange(user) {
    updateOrbit();
    ver++;
    updateReadouts();
    stepStatus();
    if (view3 && view3.active) view3.update();
    requestDraw();
    kick();
    if (user) emit('beam', beamInfo());
  }

  // ---------- 音效 ----------
  function sound() { const S = window.LabSound; return S && S.enabled() ? S : null; }
  let lastPing = 0;
  function ping() {
    const S = sound(); if (!S || !beamOn() || !(st.I > 0)) return;
    const t = performance.now(); if (t - lastPing < 110) return; lastPing = t;
    const fc = C.cyclotronFreq(C.centreField(APP.N, APP.R, st.I));
    const f = Math.max(250, Math.min(1600, fc * SOUND_SCALE));
    S.tone({ freq: f, dur: 0.09, type: 'sine', gain: 0.22 });
    S.tone({ freq: f * 2, dur: 0.05, type: 'sine', gain: 0.06 });
  }
  function clickSound() { const S = sound(); if (!S) return; S.noise({ dur: 0.03, gain: 0.5, filter: 2400, q: 1 }); S.tone({ freq: 1150, dur: 0.05, type: 'triangle', gain: 0.22 }); }
  function powerSound(on) {
    const S = sound(); if (!S) return;
    S.noise({ dur: 0.035, gain: 0.6, filter: 1800, q: 0.8 });
    if (on) S.sweep({ from: 300, to: 620, dur: 0.35, type: 'sine', gain: 0.12 });
    else S.sweep({ from: 600, to: 280, dur: 0.25, type: 'sine', gain: 0.1 });
  }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  $('soundBtn').addEventListener('click', function () {
    if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound'));
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'sound') updateSoundButton(); });

  // ---------- 控制項 ----------
  const elV = $('V'), elI = $('I'), elA = $('alpha'), elXL = $('xL'), elXR = $('xR'), elEye = $('eye');
  function outs() {
    $('Vo').textContent = Math.round(val(elV)) + ' V';
    $('Io').textContent = val(elI).toFixed(2) + ' A';
    $('alphao').textContent = val(elA).toFixed(1) + '°';
    $('xLo').textContent = val(elXL).toFixed(2) + ' cm';
    $('xRo').textContent = val(elXR).toFixed(2) + ' cm';
    $('eyeo').textContent = val(elEye).toFixed(1) + ' cm';
  }
  function read() {
    st.V = val(elV); st.I = val(elI); st.alpha = val(elA);
    st.xL = val(elXL); st.xR = val(elXR); st.eye = val(elEye);
  }
  [elV, elI, elA].forEach(function (el) {
    el.addEventListener('input', function () { read(); outs(); afterChange(false); ping(); });
    el.addEventListener('change', function () { read(); outs(); afterChange(true); });
  });
  [elXL, elXR].forEach(function (el) {
    el.addEventListener('input', function () {
      read(); outs();
      st.eyeAt[el === elXL ? 'L' : 'R'] = st.parallax ? st.eye : (el === elXL ? st.xL : st.xR);
      ver++; updateReadouts(); requestDraw(); if (view3 && view3.active) view3.update();
    });
  });
  elEye.addEventListener('input', function () { read(); outs(); ver++; requestDraw(); if (view3 && view3.active) view3.update(); });

  $('power').addEventListener('click', function () {
    if (!st.power) {
      st.power = true;
      st.fromMin = st.V === 0 && st.I === 0;
      st.warm = LD.reducedMotion() ? 1 : 0;
      st.warmT0 = performance.now();
      if (st.fromMin) st.steps[0] = true;
      powerSound(true);
      afterChange(true);
      emit('power', { on: true, fromMin: st.fromMin });
      if (!st.fromMin) flash(T('提醒：開機前應先把兩個旋鈕轉到最小（步驟 1）。請關機、歸零後再開一次。', 'Note: turn both knobs to zero before switching on (step 1). Switch off, zero them and switch on again.'), 6000);
    } else {
      st.power = false; st.warm = 0; st.fromMin = false;
      powerSound(false);
      afterChange(true);
      emit('power', { on: false });
    }
  });
  $('demo').addEventListener('click', function () {
    st.steps[0] = true; // 快速開機是捷徑：直接跳過步驟 1（第 1 個任務仍要照正確步驟開機）
    setVal(elV, 150); setVal(elI, 1.4);
    if (!st.power) {
      st.power = true; st.fromMin = false; st.warm = LD.reducedMotion() ? 1 : 0; st.warmT0 = performance.now();
      powerSound(true);
    }
    read(); outs(); afterChange(true);
  });
  function setMode(m) {
    if (m === st.mode) return;
    st.mode = m;
    $('modeIdeal').setAttribute('aria-pressed', String(m === 'ideal'));
    $('modeReal').setAttribute('aria-pressed', String(m === 'real'));
    modeHint();
    afterChange(true);
  }
  function modeHint() {
    const a = st.mode === 'ideal'
      ? T('理想：磁場完全均勻、電表準確', 'Ideal: perfectly uniform field and exact meters')
      : T('含誤差：真實線圈的磁場（離軸略弱）、電表有小小的校正誤差並四捨五入到最後一位', 'With errors: the real coil field (slightly weaker off the axis) and meters with a small calibration error, rounded to the last digit');
    const b = st.parallax
      ? T('。視差開啟：畫面是從眼睛的位置看過去的，讀每個游標前先把眼睛移到它的正前方（兩條細線重合）。', '. Parallax on: the view is seen from your eye; before reading a cursor, move your eye straight in front of it (its two hairlines overlap).')
      : T('；讀數時假設眼睛都正對游標。', '; readings assume you always look straight at each cursor.');
    $('modeHint').textContent = a + b;
  }
  $('modeIdeal').addEventListener('click', function () { setMode('ideal'); });
  $('modeReal').addEventListener('click', function () { setMode('real'); });
  $('parallax').addEventListener('change', function (ev) {
    st.parallax = ev.target.checked;
    st.eyeAt = { L: null, R: null }; // 開關視差後，游標要重新對準才算數
    $('eyeBox').hidden = !st.parallax;
    syncKbItems();
    modeHint();
    if (!side) resize();
    afterChange(true);
  });
  [['showLabels', 'labels'], ['showField', 'field'], ['showDots', 'dots']].forEach(function (p) {
    $(p[0]).addEventListener('change', function (ev) { st.show[p[1]] = ev.target.checked; ver++; requestDraw(); kick(); if (view3 && view3.active) view3.update(); });
  });

  // ---------- 記錄與數據表 ----------
  function trueD() { return orb ? orb.D : 0; } // 電子束真正的水平寬度（cm）
  $('record').addEventListener('click', function () {
    if (!st.power) { flash(T('請先開啟電源。', 'Switch the power on first.')); return; }
    if (!beamOn() || st.warm < 1) { flash(T('還看不到電子束：等陰極加熱完成，並把加速電壓調高。', 'No beam yet: wait for the cathode to warm up and raise the voltage.')); return; }
    if (st.alpha !== 0) { flash(T('電子槍轉角 α 要轉回 0° 才能量直徑。', 'Set the gun tilt α back to 0° before measuring.')); return; }
    if (!orb || !orb.closed) { flash(T('電子束不是完整的圓（打到玻璃了），請調大線圈電流或調低電壓。', 'The beam is not a complete circle (it hits the glass): raise the coil current or lower the voltage.')); return; }
    const D = st.xR - st.xL;
    if (D < 1) { flash(T('先把游標移到電子束的左右兩端。', 'Move the cursors to the two edges of the beam first.')); return; }
    if (st.rows.length >= 30) { flash(T('數據表最多 30 筆，請先刪除一些。', 'The table holds at most 30 rows; delete some first.')); return; }
    // 視差模式下，兩個游標都是在眼睛正對它（0.3 cm 內）時對準的嗎？
    const eyeOK = st.parallax && st.eyeAt.L != null && st.eyeAt.R != null && Math.abs(st.eyeAt.L - st.xL) <= 0.3 && Math.abs(st.eyeAt.R - st.xR) <= 0.3;
    const row = {
      V: meterV(), I: meterI(), xL: st.xL, xR: st.xR, D: D, mode: st.mode, parallax: st.parallax,
      Dtrue: trueD(), eyeL: st.eyeAt.L, eyeR: st.eyeAt.R, eyeOK: eyeOK
    };
    st.rows.push(row);
    clickSound();
    renderTable();
    updateSteps();
    const A2 = C.analyze(st.rows.map(function (r) { return { V: r.V, I: r.I, D: r.D / 100 }; }));
    const em = A2.rows[A2.rows.length - 1].em;
    flash(T('已記錄第 ' + st.rows.length + ' 筆：e/m = ' + (em / 1e11).toFixed(3) + ' × 10<sup>11</sup> C/kg。', 'Row ' + st.rows.length + ' recorded: e/m = ' + (em / 1e11).toFixed(3) + ' × 10<sup>11</sup> C/kg.'), 3500, true);
    const vset = {};
    st.rows.forEach(function (r) { vset[r.V] = true; });
    emit('record', {
      row: Object.assign({ em: em, err: em / C.EM - 1 }, row),
      rows: st.rows.map(function (r, i) { return Object.assign({ em: A2.rows[i].em }, r); }),
      n: A2.n, distinctV: Object.keys(vset).length, fitErr: A2.fitErr, meanErr: A2.meanErr,
      allReal: st.rows.every(function (r) { return r.mode === 'real' && r.parallax && r.eyeOK; })
    });
  });
  $('undo').addEventListener('click', function () {
    if (!st.rows.length) return;
    st.rows.pop(); renderTable(); stepStatus();
  });
  $('clearAll').addEventListener('click', function () {
    st.rows = []; renderTable(); stepStatus();
    emit('clear', {});
  });

  function fx(v, d) { return isFinite(v) ? v.toFixed(d) : '—'; }
  function renderTable() {
    const body = $('recBody');
    const A2 = C.analyze(st.rows.map(function (r) { return { V: r.V, I: r.I, D: r.D / 100 }; }));
    if (!st.rows.length) {
      body.innerHTML = '<tr class="empty"><td colspan="9">' + T('還沒有數據：量好直徑後按「記錄」。', 'No data yet: measure the diameter and press “Record”.') + '</td></tr>';
    } else {
      body.innerHTML = st.rows.map(function (r, i) {
        const w = A2.rows[i];
        const tag = (r.mode === 'real' ? '<span class="tag">' + T('誤', 'err') + '</span>' : '') + (r.parallax ? '<span class="tag">' + T('視', 'plx') + '</span>' : '');
        return '<tr><td>' + (i + 1) + tag + '</td><td>' + r.V + '</td><td>' + r.I.toFixed(2) + '</td><td>' + fx(w.B * 1e4, 2) + '</td><td>' + r.xL.toFixed(2) +
          '</td><td>' + r.xR.toFixed(2) + '</td><td>' + r.D.toFixed(2) + '</td><td>' + (r.D / 2).toFixed(3) + '</td><td class="em">' + fx(w.em / 1e11, 3) + '</td></tr>';
      }).join('');
    }
    const pct = function (e) { return (e >= 0 ? '+' : '−') + Math.abs(e * 100).toFixed(1) + '%'; };
    setHTML('aMean', A2.n ? (A2.mean / 1e11).toFixed(3) + ' × 10<sup>11</sup> C/kg（' + pct(A2.meanErr) + '）' : '—');
    setHTML('aFit', A2.fit ? (A2.fit.slope / 1e11).toFixed(3) + ' × 10<sup>11</sup> C/kg（' + pct(A2.fitErr) + '）' : '—');
    setHTML('aAcc', (C.EM / 1e11).toFixed(4) + ' × 10<sup>11</sup> C/kg');
    if (window.LabSettings && window.LabSettings.lang === 'en') {
      ['aMean', 'aFit'].forEach(function (id) { $(id).innerHTML = $(id).innerHTML.replace('（', ' (').replace('）', ')'); });
    }
    drawGraph(A2);
    // 分析圖的文字說明（螢幕閱讀器用；數據改變時更新）
    gcv.setAttribute('aria-label', T('分析圖：縱軸 2V、橫軸 (Br)²，含公認值的參考線。', 'Analysis graph: 2V against (Br)², with a reference line for the accepted value. ') +
      (A2.n ? T('已記錄 ', '') + A2.n + T(' 筆數據', ' points recorded') + (A2.fit ? T('，通過原點的最佳直線斜率 e/m = ', '; the best-fit line through the origin has slope e/m = ') + (A2.fit.slope / 1e11).toFixed(3) + T(' × 10 的 11 次方 C/kg。', ' × 10 to the 11 C/kg.') : T('。', '.'))
        : T('還沒有數據。', 'No data yet.')));
  }

  // ---------- 分析圖：2V 對 (Br)² ----------
  const gcv = $('gcv'), gctx = gcv.getContext('2d');
  let lastA = null;
  function drawGraph(A2) {
    if (A2) lastA = A2;
    A2 = lastA;
    const w = gcv.clientWidth, h = gcv.clientHeight;
    if (!w || !h) return;
    const r = Math.min(3, window.devicePixelRatio || 1);
    if (gcv.width !== Math.round(w * r) || gcv.height !== Math.round(h * r)) { gcv.width = Math.round(w * r); gcv.height = Math.round(h * r); }
    const g = gctx;
    g.setTransform(r, 0, 0, r, 0, 0);
    LD.backdrop(g, w, h);
    const fz = 11;
    const L = 60, Rr = 14, Tt = 16, B = 42;
    const pts = A2 ? A2.rows.filter(function (p) { return p.ok; }) : [];
    let xmax = 3, ymax = 600;
    pts.forEach(function (p) { xmax = Math.max(xmax, p.x * 1e9 * 1.12); ymax = Math.max(ymax, p.y * 1.12); });
    const nice = function (v, steps) { const s0 = Math.pow(10, Math.floor(Math.log10(v / steps))); const m = [1, 2, 2.5, 5, 10].find(function (q) { return q * s0 * steps >= v; }); return m * s0; };
    const dx = nice(xmax, 5), dy = nice(ymax, 5);
    xmax = Math.ceil(xmax / dx) * dx; ymax = Math.ceil(ymax / dy) * dy;
    const px = function (x) { return L + x / xmax * (w - L - Rr); };
    const py = function (y) { return h - B - y / ymax * (h - B - Tt); };
    LD.grid(g, L, Tt, w - Rr, h - B, (w - L - Rr) * dx / xmax, (w - L - Rr) * dx / xmax / 5, L, h - B);
    g.strokeStyle = A(LD.c.text, 0.7); g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(L, Tt - 4); g.lineTo(L, h - B); g.lineTo(w - Rr + 4, h - B); g.stroke();
    g.font = font(fz); g.fillStyle = LD.c.muted; g.textAlign = 'center'; g.textBaseline = 'top';
    for (let x = 0; x <= xmax + 1e-9; x += dx) g.fillText(+x.toFixed(3) + '', px(x), h - B + 4);
    g.textAlign = 'right'; g.textBaseline = 'middle';
    for (let y = 0; y <= ymax + 1e-9; y += dy) g.fillText(String(+y.toFixed(1)), L - 5, py(y));
    // 軸名稱
    const xl = T('(Br)² ', '(Br)² ') + '(10', xr = '−9', xe = ' T²·m²)';
    g.font = font(fz, '600'); g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    const wx = g.measureText(xl + xe).width;
    const x0 = (L + w - Rr) / 2 - wx / 2;
    LD.supText(g, xl, xr, x0, h - 8, LD.c.text, font(fz, '600'), 'left');
    g.font = font(fz, '600');
    const wl = g.measureText(xl).width; g.font = font(fz * 0.72, '600'); const wsup = g.measureText(xr).width;
    LD.haloText(g, xe, x0 + wl + wsup + 0.5, h - 8, LD.c.text, 'left', 'alphabetic', font(fz, '600'));
    g.save(); g.translate(13, (Tt + h - B) / 2); g.rotate(-Math.PI / 2);
    LD.haloText(g, '2V (V)', 0, 0, LD.c.text, 'center', 'middle', font(fz, '600'));
    g.restore();
    // 公認值的參考線
    const xa = Math.min(xmax, ymax / (C.EM * 1e-9));
    g.setLineDash([6, 5]); g.strokeStyle = A(LD.c.muted, 0.8); g.lineWidth = 1.3;
    g.beginPath(); g.moveTo(px(0), py(0)); g.lineTo(px(xa), py(xa * C.EM * 1e-9)); g.stroke(); g.setLineDash([]);
    // 最佳直線
    if (A2 && A2.fit) {
      const k = A2.fit.slope * 1e-9, xe2 = Math.min(xmax, ymax / k);
      g.strokeStyle = LD.c.accent; g.lineWidth = 2.2; g.lineCap = 'round';
      g.beginPath(); g.moveTo(px(0), py(0)); g.lineTo(px(xe2), py(xe2 * k)); g.stroke();
    }
    pts.forEach(function (p) { LD.ball(g, px(p.x * 1e9), py(p.y), 4.5, LD.c.pos); });
    // 圖例
    const lf = font(10.5, '600');
    let ly = Tt + 14;
    g.font = lf;
    const items = [[LD.c.accent, T('最佳直線（斜率 = e/m）', 'best fit (slope = e/m)'), false], [LD.c.muted, T('公認值', 'accepted value'), true]];
    items.forEach(function (it) {
      g.strokeStyle = it[0]; g.lineWidth = 2; if (it[2]) g.setLineDash([5, 4]);
      g.beginPath(); g.moveTo(L + 12, ly); g.lineTo(L + 32, ly); g.stroke(); g.setLineDash([]);
      LD.haloText(g, it[1], L + 38, ly, LD.c.text, 'left', 'middle', lf);
      ly += 17;
    });
    if (!pts.length) LD.haloText(g, T('記錄數據後，點會出現在這裡', 'Recorded points will appear here'), (L + w) / 2, (Tt + h - B) / 2 + 10, LD.c.muted, 'center', 'middle', font(12, '600'));
  }

  // ---------- 畫布拖曳（游標；放大鏡中為微調） ----------
  let drag = null, hover = null;
  function evPos(e) { const b = cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; }
  function hit(p) {
    for (let i = 0; i < mags.length; i++) {
      const m = mags[i];
      if (p[0] >= m.x && p[0] <= m.x + m.w && p[1] >= m.y && p[1] <= m.y + m.h) return { type: 'fine', side: m.side, m: m };
    }
    if (diag && st.parallax && p[0] >= diag.x && p[0] <= diag.x + diag.w && p[1] >= diag.y && p[1] <= diag.y + diag.h) return { type: 'eye', d: diag };
    if (p[1] < Y(CUR_TOP + 0.4) || p[1] > Y(-16.2)) return null;
    let best = null, bd = 18;
    ['L', 'R'].forEach(function (w) {
      const Xw = (w === 'L' ? st.xL : st.xR) + ZERO, sg = w === 'L' ? -1 : 1;
      const lo = X(Math.min(Xw - sg * 0.35, Xw + sg * 1.95)), hi = X(Math.max(Xw - sg * 0.35, Xw + sg * 1.95));
      const dd = p[0] < lo ? lo - p[0] : p[0] > hi ? p[0] - hi : 0;
      if (dd < bd) { bd = dd; best = { type: 'cursor', side: w }; }
    });
    return best;
  }
  function moveCursor(side, xs) {
    const el = side === 'L' ? elXL : elXR;
    const lo = side === 'L' ? 0 : 10, hi = side === 'L' ? 10 : 20;
    setVal(el, Math.max(lo, Math.min(hi, Math.round(xs * 100) / 100)));
  }
  cv.addEventListener('pointerdown', function (e) {
    const p = evPos(e), h = hit(p);
    if (!h) return;
    e.preventDefault();
    const x0 = h.side === 'L' ? st.xL : h.side === 'R' ? st.xR : st.eye;
    drag = { h: h, px: p[0], x0: x0, id: e.pointerId };
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
    hover = h.side || null; ver++; requestDraw();
  });
  cv.addEventListener('pointermove', function (e) {
    const p = evPos(e);
    if (drag && e.pointerId === drag.id) {
      const dx = p[0] - drag.px;
      if (drag.h.type === 'cursor') moveCursor(drag.h.side, drag.x0 + dx / s);
      else if (drag.h.type === 'fine') moveCursor(drag.h.side, drag.x0 + dx / (drag.h.m.w / 1.5));
      else if (drag.h.type === 'eye') {
        const kx = (drag.h.d.w - 28) / 24;
        setVal(elEye, Math.max(0, Math.min(20, Math.round((drag.x0 + dx / kx) * 10) / 10)));
      }
      return;
    }
    if (e.pointerType === 'mouse') {
      const h = hit(p), hv = h && h.side ? h.side : null;
      cv.style.cursor = h ? 'ew-resize' : 'default';
      if (hv !== hover) { hover = hv; ver++; requestDraw(); }
    }
  });
  function endDrag(e) {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    drag = null;
    if (hover) { hover = null; ver++; requestDraw(); }
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);
  cv.addEventListener('pointerleave', function () { if (!drag && hover) { hover = null; ver++; requestDraw(); } });

  // ---------- 鍵盤操作（keys.js）：和拖曳一樣移動左右游標與眼睛，限制完全相同 ----------
  // 游標：方向鍵每次 0.01 cm（標尺讀數的最小位數），Shift 每次 0.2 cm；眼睛：每次 0.1 cm，Shift 每次 1 cm
  const kbItems = [];
  function cursorItem(side) {
    return {
      id: side,
      name: function () { return side === 'L' ? T('左游標', 'Left cursor') : T('右游標', 'Right cursor'); },
      move: function (dx, dy, big) {
        if (!dx) return false;
        const x0 = side === 'L' ? st.xL : st.xR;
        moveCursor(side, x0 + dx * (big ? 0.2 : 0.01));
        return (side === 'L' ? st.xL : st.xR) !== x0;
      },
      describe: function () {
        const xs = side === 'L' ? st.xL : st.xR;
        return (side === 'L' ? T('左游標讀數 ', 'Left cursor at ') : T('右游標讀數 ', 'Right cursor at ')) + xs.toFixed(2) + ' cm' +
          T('，直徑 D = ', ', diameter D = ') + (st.xR - st.xL).toFixed(2) + ' cm' + T('。', '.');
      }
    };
  }
  const eyeItem = {
    id: 'eye',
    name: function () { return T('眼睛的位置', 'Eye position'); },
    move: function (dx, dy, big) {
      if (!dx) return false;
      const e0 = st.eye;
      setVal(elEye, Math.max(0, Math.min(20, Math.round((e0 + dx * (big ? 1 : 0.1)) * 10) / 10)));
      return st.eye !== e0;
    },
    describe: function () {
      const near = Math.abs(st.eye - st.xL) <= 0.3 ? T('，正對左游標', ', straight in front of the left cursor') : Math.abs(st.eye - st.xR) <= 0.3 ? T('，正對右游標', ', straight in front of the right cursor') : '';
      return T('眼睛在標尺 ', 'Eye at ') + st.eye.toFixed(1) + ' cm' + near + T('。', '.');
    }
  };
  function syncKbItems() {
    const want = [cursorItem('L'), cursorItem('R')].concat(st.parallax ? [eyeItem] : []);
    const sel = kb ? kb.index() : 0;
    kbItems.length = 0;
    want.forEach(function (it) { kbItems.push(it); });
    if (kb && sel >= kbItems.length) kb.select(0);
  }
  syncKbItems();
  kb = window.LabKeys ? window.LabKeys.attach(cv, {
    label: T('電子荷質比實驗裝置的正面圖：亥姆霍茲線圈、玻璃球中發光的電子束圓圈、左右游標與標尺、電源供應器的電表，以及兩個游標的放大鏡。按 Enter 切換左游標、右游標（開啟視差時還有眼睛的位置），左右方向鍵移動，Shift 加方向鍵移動得更多。',
      'Front view of the e/m apparatus: Helmholtz coils, the glowing electron-beam circle in the bulb, the left and right cursors with the scale, the meters, and magnifiers for the two cursors. Press Enter to switch between the left cursor, the right cursor (and, with parallax on, the eye position); the left and right arrow keys move it, Shift with an arrow key moves it further.'),
    items: kbItems,
    onChange: function () { ver++; requestDraw(); }
  }) : null;
  /** 鍵盤選取的物件周圍畫焦點框（--accent 色虛線圓角框） */
  function drawKbFocus(g) {
    if (!kb || !kb.focused()) return;
    const it = kbItems[kb.index()];
    if (!it) return;
    g.save();
    g.setLineDash([5, 4]); g.strokeStyle = LD.c.accent; g.lineWidth = 2;
    if (it.id === 'L' || it.id === 'R') {
      const Xw = (it.id === 'L' ? st.xL : st.xR) + ZERO, sg = it.id === 'L' ? -1 : 1;
      const xa = X(Xw + sg * 1.95), xb = X(Xw - sg * 0.35), top = Y(CUR_TOP), bot = Y(-15.9);
      LD.roundRect(g, Math.min(xa, xb) - 5, top - 5, Math.abs(xb - xa) + 10, bot - top + 10, 6);
      g.stroke();
    } else if (it.id === 'eye' && diag) {
      // 與 drawDiag 相同的座標換算
      const d = diag, padX = 14, topY = d.y + 30, botY = d.y + d.h - 26;
      const kx = (d.w - 2 * padX) / 24, zEye = SD + EL, kz = (botY - topY) / (zEye + 1.5);
      const ex = d.x + d.w / 2 + eyeX() * kx, ey = topY + (zEye + 1.5) * kz;
      LD.roundRect(g, ex - 15, ey - 11, 30, 22, 6);
      g.stroke();
    }
    g.restore();
  }

  // =====================================================================
  // 3D 檢視（three.js 以 import() 延遲載入；場景在 e-over-m-3d.js）
  // =====================================================================
  let view3 = null, threeLib = null, loadToken = 0;
  const stage = $('stage'), viewMsg = $('viewMsg');
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
  /** 給 3D 場景讀取的目前狀態（cm） */
  function state3() {
    return {
      power: st.power, bright: beamOn() ? bright() : 0, orbit: orb, orbVer: orbVer, I: st.I, V: st.V, alpha: st.alpha,
      xL: st.xL + ZERO, xR: st.xR + ZERO, eye: st.parallax ? eyeX() : null, show: st.show, mode: st.mode,
      Vm: st.power ? meterV() : null, Im: st.power ? meterI() : null, warm: st.warm, slow: SLOW
    };
  }
  function setPressed(mode) {
    $('view2d').setAttribute('aria-pressed', String(mode === '2d'));
    $('view3d').setAttribute('aria-pressed', String(mode === '3d'));
  }
  function setView(mode) {
    if (mode === '3d') {
      if (view3 && view3.active) return;
      const token = ++loadToken;
      setPressed('3d');
      if (!webglAvailable() || !window.EOverM3D) { fail3D(); return; }
      viewMsg.textContent = T('正在載入 3D 檢視…', 'Loading the 3D view…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return;
        stage.classList.add('is3d');
        view3 = window.EOverM3D.create(lib, {
          host: $('view3'), core: C, T: T, state: state3, tokens: function () { readTokens(); return Object.assign({}, tok, LD.c); },
          lost: function () { setView('2d'); viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D。', 'The 3D graphics context was lost, so the view switched back to 2D.'); }
        });
        viewMsg.textContent = '';
        $('resetCam').hidden = false;
        view3.update();
        kick();
      }).catch(function (err) {
        if (token !== loadToken) return;
        if (window.console) console.warn('3D view unavailable:', err);
        fail3D();
      });
    } else {
      loadToken++;
      setPressed('2d');
      if (view3) { view3.dispose(); view3 = null; }
      stage.classList.remove('is3d');
      $('resetCam').hidden = true;
      if (/3D/.test(viewMsg.textContent) && !/2D/.test(viewMsg.textContent)) viewMsg.textContent = '';
      resize();
      kick();
    }
  }
  function fail3D() {
    if (view3) { try { view3.dispose(); } catch (e) { /* 忽略 */ } view3 = null; }
    stage.classList.remove('is3d');
    setPressed('2d');
    $('resetCam').hidden = true;
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D view is kept.');
    resize();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });

  // ---------- 啟動 ----------
  function onTheme() {
    readTokens();
    appKey = ''; ver++;
    if (view3 && view3.active) view3.onTheme();
    requestDraw();
    drawGraph();
  }
  readTokens();
  window.addEventListener('lab:themechange', onTheme);
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', onTheme);
  }
  if (LD.reducedMotion()) { st.show.dots = false; $('showDots').checked = false; }
  read(); outs(); modeHint();
  updateOrbit();
  updateSoundButton();
  updateReadouts();
  renderTable();
  stepStatus();
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { if (cv.clientWidth !== lastW) { lastW = cv.clientWidth; resize(); } }).observe(cv);
    let lastG = 0;
    new ResizeObserver(function () { if (gcv.clientWidth !== lastG) { lastG = gcv.clientWidth; drawGraph(); } }).observe(gcv);
  }
  window.addEventListener('resize', function () { resize(); drawGraph(); });
  resize();
})();
