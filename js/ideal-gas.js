/* ideal-gas.js — 「理想氣體分子模擬」的畫面與互動（物理計算在 ideal-gas-core.js） */
(function () {
  'use strict';
  const G = window.IdealGasCore;
  const $ = function (id) { return document.getElementById(id); };
  // 介面文字：英文模式用第二個字串（settings.js）
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  // 滑桿讀值：打字輸入的精確值（numinput.js）優先
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const LD = window.LabDraw;               // 共用繪圖工具（js/drawkit.js）
  let kb = null;                           // 畫布鍵盤操作（js/keys.js）

  // ---------- 固定參數 ----------
  const LY = 20, LZ = 20, AREA = LY * LZ;   // nm：容器截面
  const LX_MIN = 10, LX_MAX = 30;           // nm：活塞位置範圍（V = 4000～12000 nm³）
  const PT = 1.2;                            // nm：活塞厚度（只用於繪圖）
  const XH = LX_MAX + PT;                    // 汽缸右端
  const ROD_END = XH + 5;                    // 拉桿末端（把手）
  const BASE_RATE = 20;                      // ps／秒（1× 時畫面 1 秒 = 20 ps）
  const SPEEDS = [0.2, 1, 5];
  const ALPHA = 0.01;                        // 活塞最大速率 = 0.01 × 最重分子的平均速率（準靜態）
  const FF_VIS = 2.5;                        // nm／秒：快轉時活塞在畫面上的移動速度
  const FF_MAX = 1500;                       // ps／秒：快轉上限
  const HIST_TAU = 100;                      // ps：速率分布的移動平均時間
  const NB = 600, BINW = 0.01;               // 速率直方圖細分格：0～6 nm/ps，每格 0.01 nm/ps（10 m/s）
  const PV_EVERY = 10;                       // ps：過程圖每隔多久記一點
  const BUDGET_MS = 7;                       // 每幀物理計算的時間預算（超過就自動放慢）
  const MODES = ['isothermal', 'isochoric', 'isobaric', 'adiabatic'];
  const MODE_BTN = { isothermal: 'mIso', isochoric: 'mIsoV', isobaric: 'mIsoP', adiabatic: 'mAdi' };
  const SP_COLOR = ['b-wave', 'b-mech', 'b-optics', 'probe', 'b-em']; // He Ne Ar Kr Xe
  const MODE_COLOR = { isothermal: 'accent', isochoric: 'b-optics', isobaric: 'equi', adiabatic: 'b-thermo' };

  const state = {
    mode: 'isothermal',
    spA: 0, spB: 2, mix: false, fracB: 50, N: 200,
    Tset: 300, Pset: 103.6,
    speed: 1,
    running: !reducedMotion,
    interacted: false,
    show: { track: false, impacts: !reducedMotion, speedColor: false },
    graph: 'PV',
    epoch: 0, init: 'maxwell', initAt: 0,
    adStart: null,           // 進入絕熱過程時的狀態 { T, V, P }（畫絕熱線、任務用）
    ff: false, ffEma: 0, moving: false, lag: false,
    settleUntil: 0,
    dragged: false,
    pistonStop: false,
    modeTime: { isothermal: 0, isochoric: 0, isobaric: 0, adiabatic: 0 }, // 各過程累計的模擬時間（任務用）
    tChanges: 0              // 使用者在有恆溫槽時改變溫度的次數（任務用）
  };

  let gas = null;
  let view3 = null;                    // 3D 檢視（js/ideal-gas-3d.js；切換到 3D 時才建立）
  const meterLong = new G.Meter(5);   // 狀態穩定後的長時間平均（讀數、任務）
  const meterShort = new G.Meter(2);  // 最近 40 ps（過程圖、壓力計）
  const hist = [new Float64Array(NB), new Float64Array(NB)];
  const histW = [0, 0], histE = [0, 0];
  let pts = [];                        // 過程圖的點 { V, P, T, mode, epoch }
  let pvClock = 0, emitClock = 0;
  const energy = { Q: 0, W: 0, U0: 0 }; // 從「全部清除」起的能量收支
  const cum = { Q: 0, W: 0 };          // 從開頁起的累計（任務用，不清除）
  let impacts = [];                    // 撞擊活塞的閃光（純裝飾）
  let lastShort = null, lastLong = null;
  let pGauge = null;                   // 壓力計指針（平滑顯示用）

  function speciesOf(k) { return G.SPECIES[k === 0 ? state.spA : state.spB]; }
  function counts() {
    const nB = state.mix ? Math.max(1, Math.round(state.N * state.fracB / 100)) : 0;
    return [state.N - nB, nB];
  }
  function bathOn() { return state.mode !== 'adiabatic'; }
  function heavyMass() { return state.mix ? Math.max(speciesOf(0).m, speciesOf(1).m) : speciesOf(0).m; }
  function lightMass() { return state.mix ? Math.min(speciesOf(0).m, speciesOf(1).m) : speciesOf(0).m; }
  function kPa(p) { return G.toSI.pressureKPa(p); }
  function fromKPa(p) { return G.fromSI.pressureKPa(p); }
  function Vnow() { return gas.Lx * AREA; }
  /** 目前氣體溫度的最佳估計：長時間平均 → 短時間平均 → 瞬時 */
  function Tgas() {
    if (lastLong && lastLong.t >= 20) return lastLong.T;
    if (lastShort && lastShort.t >= 10) return lastShort.T;
    return G.temperature(gas);
  }
  /** 理論比較用的溫度：有恆溫槽時用槽溫，絕熱時用氣體溫度 */
  function Tref() { return bathOn() ? state.Tset : Tgas(); }

  // ---------- 色彩（lab.css 代號） ----------
  let colors = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--text', '--muted', '--border', '--grid', '--accent', '--accent-soft', '--surface',
      '--pos', '--neg', '--equi', '--field', '--probe', '--b-mech', '--b-thermo', '--b-wave', '--b-optics', '--b-em']
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
    const p = rgbOf(a), q = rgbOf(b);
    return 'rgb(' + [0, 1, 2].map(function (i) { return Math.round(p[i] + (q[i] - p[i]) * f); }).join(',') + ')';
  }
  function isDark() {
    const r = rgbOf(getComputedStyle(document.documentElement).getPropertyValue('--canvas-bg'));
    return (r[0] + r[1] + r[2]) / 3 < 100;
  }
  function spColor(k) { return colors[SP_COLOR[k === 0 ? state.spA : state.spB]]; }
  /** 溫度的顏色：冷偏藍、熱偏紅（300 K 附近為中性） */
  function tempColor(Tk) {
    if (Tk < 300) return mix(colors.muted, colors.neg, Math.min(1, (300 - Tk) / 230));
    return mix(colors.muted, colors.pos, Math.min(1, (Tk - 300) / 600));
  }

  // ---------- 數字格式 ----------
  function num(v, d) {
    if (!isFinite(v)) return '—';
    let s = v.toFixed(d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  /** 科學記號（HTML）：例如 6.21 × 10<sup>−21</sup> */
  function sci(v, d) {
    if (!isFinite(v)) return '—';
    if (v === 0) return '0';
    const e = Math.floor(Math.log10(Math.abs(v)));
    const m = v / Math.pow(10, e);
    let ms = m.toFixed(d), ee = e;
    if (Math.abs(parseFloat(ms)) >= 10) { ms = (m / 10).toFixed(d); ee = e + 1; }
    return ms.replace('-', '−') + ' × 10<sup>' + String(ee).replace('-', '−') + '</sup>';
  }
  /** 固定指數的科學記號（同一組數字比較時用） */
  function sciFixed(v, e, d) {
    if (!isFinite(v)) return '—';
    return num(v / Math.pow(10, e), d) + ' × 10<sup>' + String(e).replace('-', '−') + '</sup>';
  }
  /** 滑桿數字：顯示到可輸入的精度（去掉多餘的 0，但不少於滑桿間隔的位數） */
  function fmtSlider(v, el) {
    const dec = window.LabNum ? window.LabNum.decimals(el) : 2;
    const stepDec = (String(el.step).split('.')[1] || '').length;
    let s = v.toFixed(dec);
    while (s.indexOf('.') >= 0 && s.length - s.indexOf('.') - 1 > stepDec && s.slice(-1) === '0') s = s.slice(0, -1);
    if (s.slice(-1) === '.') s = s.slice(0, -1);
    return s;
  }
  function niceStep(raw) {
    const e = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / e;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
  }
  function niceUp(v) {
    const e = Math.pow(10, Math.floor(Math.log10(v)));
    const f = v / e;
    return (f <= 1 ? 1 : f <= 1.5 ? 1.5 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 3 ? 3 : f <= 4 ? 4 : f <= 5 ? 5 : f <= 6 ? 6 : f <= 8 ? 8 : 10) * e;
  }

  // ======================= 氣體 =======================
  function newGas(Tk, init) {
    const Lx = gas ? gas.Lx : 8000 / AREA;
    const sp = [speciesOf(0), speciesOf(1)];
    const old = gas;
    gas = G.createGas({
      species: sp, counts: counts(), T: Tk, Lx: Lx, Ly: LY, Lz: LZ, LxMin: LX_MIN, LxMax: LX_MAX,
      seed: (Math.random() * 2147483647) | 0, bath: bathOn(), bathT: state.Tset, diffuse: true, recordHits: true,
      init: init || 'maxwell', cap: 320
    });
    if (old) {
      gas.piston.mode = old.piston.mode; gas.piston.target = old.piston.target; gas.piston.Pset = old.piston.Pset;
      gas.piston.pEma = old.piston.pEma;
      gas.t = old.t;
    }
    gas.piston.vmax = pistonVmax();
    state.epoch++;
    state.init = init || 'maxwell';
    state.initAt = gas.t;
    if (state.show.track) pickTrack(-1);
    resetEnergy();
    meterShort.reset();
    lastShort = null;
    resetHist();
    markChange();
  }
  function pistonVmax() {
    const Tk = gas ? Math.max(30, G.temperature(gas)) : state.Tset;
    return ALPHA * G.vmean(Tk, heavyMass());
  }
  function resetEnergy() {
    energy.Q = 0; energy.W = 0; energy.U0 = G.kinetic(gas).total;
  }
  function resetHist() {
    for (let k = 0; k < 2; k++) { hist[k].fill(0); histW[k] = 0; histE[k] = 0; }
  }
  /** 狀態改變：長時間平均重新開始，並等氣體穩定 */
  function markChange(settle) {
    meterLong.reset();
    lastLong = null;
    state.settleUntil = gas.t + (settle == null ? settleTime() : settle);
  }
  function settleTime() {
    if (!bathOn()) return 20;
    // 恆溫壁的鬆弛時間約 12 nm / v̄（取最重的分子），等三倍
    const tau = 12 / G.vmean(Math.max(30, state.Tset), heavyMass());
    return Math.max(20, Math.min(400, 3 * tau));
  }

  function harvest(dt) {
    const a = G.takeAcc(gas);
    const c = G.countBySpecies(gas), ms = [speciesOf(0).m, speciesOf(1).m];
    meterShort.add(a, c, ms);
    if (!state.moving && gas.t >= state.settleUntil) meterLong.add(a, c, ms);
    energy.Q += a.Q; energy.W += a.W;
    cum.Q += a.Q; cum.W += a.W;
    sampleHist(dt);
  }

  function sampleHist(dt) {
    if (dt <= 0) return;
    const dec = Math.exp(-dt / HIST_TAU);
    for (let k = 0; k < 2; k++) {
      const h = hist[k];
      for (let b = 0; b < NB; b++) h[b] *= dec;
      histW[k] *= dec; histE[k] *= dec;
    }
    for (let i = 0; i < gas.n; i++) {
      const v2 = gas.vx[i] * gas.vx[i] + gas.vy[i] * gas.vy[i] + gas.vz[i] * gas.vz[i];
      const v = Math.sqrt(v2), k = gas.s[i];
      hist[k][Math.min(NB - 1, Math.floor(v / BINW))] += dt;
      histW[k] += dt;
      histE[k] += 0.5 * gas.m[i] * v2 * dt;
    }
  }
  /** 直方圖資料對應的溫度（由同樣加權的平均動能） */
  function histT(k) { return histW[k] > 0 ? G.tempFromKE(histE[k] / histW[k]) : NaN; }

  // ======================= 畫布：容器 =======================
  const cv = $('cv');
  const ctx = cv.getContext('2d');
  let dpr = 1, cw = 300, ch = 300, narrow = false;
  const bg = document.createElement('canvas');
  const bgctx = bg.getContext('2d');

  const cam = { yaw: -0.46, pitch: 0.42, dist: 100, F: 1, cx: 0, cy: 0 };
  function setCamera() {
    const tx = 16, ty = 6.5, tz = 10;
    const cp = Math.cos(cam.pitch);
    cam.px = tx + cam.dist * Math.sin(cam.yaw) * cp;
    cam.py = ty + cam.dist * Math.sin(cam.pitch);
    cam.pz = tz + cam.dist * Math.cos(cam.yaw) * cp;
    let fx = tx - cam.px, fy = ty - cam.py, fz = tz - cam.pz;
    let L = Math.hypot(fx, fy, fz); fx /= L; fy /= L; fz /= L;
    let rx = -fz, rz = fx; L = Math.hypot(rx, rz); rx /= L; rz /= L;
    cam.fx = fx; cam.fy = fy; cam.fz = fz;
    cam.rx = rx; cam.ry = 0; cam.rz = rz;
    cam.ux = 0 * fz - rz * fy; cam.uy = rz * fx - rx * fz; cam.uz = rx * fy - 0 * fx;
  }
  const PO = { x: 0, y: 0, s: 1, z: 1 };
  function proj(x, y, z, out) {
    const o = out || PO;
    const dx = x - cam.px, dy = y - cam.py, dz = z - cam.pz;
    const a = dx * cam.rx + dy * cam.ry + dz * cam.rz;
    const b = dx * cam.ux + dy * cam.uy + dz * cam.uz;
    const c = dx * cam.fx + dy * cam.fy + dz * cam.fz;
    const s = cam.F / c;
    o.x = cam.cx + a * s; o.y = cam.cy - b * s; o.s = s; o.z = c;
    return o;
  }
  function P2(x, y, z) { const o = proj(x, y, z, {}); return [o.x, o.y]; }

  let BOX = null; // 版面資訊
  function fitCamera() {
    setCamera();
    const pts3 = [];
    [-1.4, XH + 1.4].forEach(function (x) { [-2.2, LY].forEach(function (y) { [-1.4, LZ + 1.4].forEach(function (z) { pts3.push([x, y, z]); }); }); });
    pts3.push([ROD_END + 2.4, LY / 2 + 2.4, LZ / 2], [ROD_END + 2.4, LY / 2 - 2.4, LZ / 2]);
    cam.F = 1; cam.cx = 0; cam.cy = 0;
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    pts3.forEach(function (p) {
      const o = proj(p[0], p[1], p[2], {});
      a0 = Math.min(a0, o.x); a1 = Math.max(a1, o.x); b0 = Math.min(b0, -o.y); b1 = Math.max(b1, -o.y);
    });
    const mL = narrow ? 8 : 14, mR = narrow ? 8 : 14, mT = narrow ? 40 : 46, mB = narrow ? 40 : 30;
    const F = Math.min((cw - mL - mR) / (a1 - a0), (ch - mT - mB) / (b1 - b0));
    cam.F = F;
    cam.cx = mL + (cw - mL - mR) / 2 - F * (a0 + a1) / 2;
    cam.cy = mT + (ch - mT - mB) / 2 + F * (b0 + b1) / 2;
    // 深度範圍（霧化用）
    const zn = proj(0, LY, LZ, {}).z, zf = proj(XH, 0, 0, {}).z;
    BOX = { zNear: Math.min(zn, proj(LX_MAX, LY, LZ, {}).z), zFar: Math.max(zf, proj(0, 0, 0, {}).z) };
  }

  function resize() {
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2); // 上限 2：分子很小，2 倍已足夠清晰，手機也較流暢
    cw = w;
    narrow = w < 560;
    ch = narrow ? Math.round(Math.max(310, w * 0.9)) : Math.round(Math.min(520, Math.max(380, w * 0.58)));
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr);
    cv.height = Math.round(ch * dpr);
    fitCamera();
    buildSprites();
    buildBackground();
    resizeCharts();
    drawAll();
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
  function poly(c, list) {
    c.beginPath();
    list.forEach(function (p, i) { if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); });
    c.closePath();
  }
  function line3(c, a, b) {
    const p = P2(a[0], a[1], a[2]), q = P2(b[0], b[1], b[2]);
    c.moveTo(p[0], p[1]); c.lineTo(q[0], q[1]);
  }
  /** 有半透明圓角底框的標籤；c.textAlign 決定水平對齊，垂直置中於 y */
  function pill(c, text, x, y, color, font, bgAlpha) {
    c.font = font || '600 12px system-ui, sans-serif';
    c.textBaseline = 'middle';
    const m = c.measureText(text), tw = m.width;
    const fh = m.fontBoundingBoxAscent > 0 ? m.fontBoundingBoxAscent + m.fontBoundingBoxDescent : 15;
    const ph = fh + 4, pw = tw + 12;
    const al = c.textAlign;
    const bx = al === 'center' ? x - pw / 2 : al === 'right' ? x - tw - 6 : x - 6;
    c.fillStyle = alpha(colors['canvas-bg'], bgAlpha == null ? 0.86 : bgAlpha);
    roundRect(c, bx, y - ph / 2, pw, ph, ph / 2);
    c.fill();
    c.fillStyle = color;
    c.fillText(text, x, y + 0.5);
    return { x: bx, y: y - ph / 2, w: pw, h: ph };
  }

  /** 含上標的標籤（靠右對齊）：parts = [前段, 上標, 後段] */
  function pillSup(c, parts, xr, y, color, size, bgAlpha) {
    const f = '600 ' + size + 'px system-ui, sans-serif', fs = '600 ' + Math.round(size * 0.72) + 'px system-ui, sans-serif';
    c.font = f; const w0 = c.measureText(parts[0]).width, w2 = c.measureText(parts[2]).width;
    c.font = fs; const w1 = c.measureText(parts[1]).width;
    const tw = w0 + w1 + w2 + 1, ph = size + 8, x0 = xr - tw;
    c.fillStyle = alpha(colors['canvas-bg'], bgAlpha);
    roundRect(c, x0 - 6, y - ph / 2, tw + 12, ph, ph / 2); c.fill();
    c.fillStyle = color; c.textAlign = 'left'; c.textBaseline = 'middle';
    c.font = f; c.fillText(parts[0], x0, y + 0.5);
    c.font = fs; c.fillText(parts[1], x0 + w0 + 0.5, y - size * 0.32);
    c.font = f; c.fillText(parts[2], x0 + w0 + w1 + 1, y + 0.5);
  }

  // ---------- 分子小圖（sprite）：每種顏色 × 3 種遠近 ----------
  const SPR = 64;
  let sprites = {}, shadowSpr = null;
  function sphereSprite(col, fog) {
    const c = document.createElement('canvas');
    c.width = c.height = SPR;
    const x = c.getContext('2d');
    const base = mix(col, colors['canvas-bg'], fog);
    const R = SPR / 2 - 1;
    const g = x.createRadialGradient(SPR * 0.36, SPR * 0.32, SPR * 0.03, SPR / 2, SPR / 2, R);
    g.addColorStop(0, shade(base, 0.75));
    g.addColorStop(0.28, shade(base, 0.25));
    g.addColorStop(0.7, base);
    g.addColorStop(1, shade(base, -0.5));
    x.fillStyle = g;
    x.beginPath(); x.arc(SPR / 2, SPR / 2, R, 0, Math.PI * 2); x.fill();
    // 細亮邊（rim light）
    x.strokeStyle = alpha(shade(base, 0.6), colors.dark ? 0.55 : 0.4);
    x.lineWidth = SPR * 0.05;
    x.beginPath(); x.arc(SPR / 2, SPR / 2, R - SPR * 0.04, Math.PI * 0.15, Math.PI * 0.75); x.stroke();
    // 鏡面亮點：縮到幾個像素時仍看得出是球
    const hx = SPR * 0.35, hy = SPR * 0.31, hr = SPR * 0.17;
    const hs = x.createRadialGradient(hx, hy, 0, hx, hy, hr);
    hs.addColorStop(0, 'rgba(255,255,255,' + (colors.dark ? 0.75 : 0.9) + ')');
    hs.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = hs;
    x.beginPath(); x.arc(hx, hy, hr, 0, Math.PI * 2); x.fill();
    // 暗外緣：在淺色背景上與鄰近的分子分得開
    x.strokeStyle = alpha(shade(base, -0.55), colors.dark ? 0.35 : 0.5);
    x.lineWidth = SPR * 0.04;
    x.beginPath(); x.arc(SPR / 2, SPR / 2, R - SPR * 0.02, 0, Math.PI * 2); x.stroke();
    return c;
  }
  const SPEED_LEVELS = 9;
  function buildSprites() {
    sprites = {};
    for (let k = 0; k < G.SPECIES.length; k++) {
      const col = colors[SP_COLOR[k]];
      sprites['s' + k] = [0, 0.2, 0.4].map(function (f) { return sphereSprite(col, f); });
    }
    for (let l = 0; l < SPEED_LEVELS; l++) {
      const col = speedLevelColor(l);
      sprites['v' + l] = [0, 0.2, 0.4].map(function (f) { return sphereSprite(col, f); });
    }
    shadowSpr = document.createElement('canvas');
    shadowSpr.width = shadowSpr.height = SPR;
    const x = shadowSpr.getContext('2d');
    const g = x.createRadialGradient(SPR / 2, SPR / 2, 0, SPR / 2, SPR / 2, SPR / 2);
    g.addColorStop(0, 'rgba(0,0,0,' + (colors.dark ? 0.55 : 0.32) + ')');
    g.addColorStop(0.6, 'rgba(0,0,0,' + (colors.dark ? 0.22 : 0.12) + ')');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, SPR, SPR);
  }
  /** 依速率上色：v/v_p 由 0 到 2（藍 → 中性 → 紅） */
  function speedLevelColor(l) { return speedColorAt(l / (SPEED_LEVELS - 1)); }
  /** 同一個色階的連續版本（3D 檢視也用）：u = v/(2v_p)，0..1，0.5 = 最可能速率 */
  function speedColorAt(u) {
    if (u < 0.5) return mix(colors.neg, colors.field, u / 0.5 * 0.8);
    return mix(colors.field, colors.pos, 0.2 + (u - 0.5) / 0.5 * 0.8);
  }

  // ---------- 不變的圖層：背景、地板、背牆、格線 ----------
  function buildBackground() {
    bg.width = cv.width;
    bg.height = cv.height;
    const c = bgctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, cw, ch);
    const base = colors['canvas-bg'];
    const rg = c.createRadialGradient(cw * 0.45, ch * 0.42, Math.min(cw, ch) * 0.1, cw * 0.5, ch * 0.5, Math.max(cw, ch) * 0.75);
    rg.addColorStop(0, colors.dark ? shade(base, 0.035) : base);
    rg.addColorStop(1, shade(base, colors.dark ? -0.35 : -0.05));
    c.fillStyle = rg;
    roundRect(c, 0, 0, cw, ch, 8);
    c.fill();

    // 底座落在桌面上的柔和陰影：多邊形本身會被底座蓋住，只露出模糊的外緣
    c.save();
    c.shadowColor = colors.dark ? 'rgba(0,0,0,0.6)' : alpha(colors.text, 0.28);
    c.shadowBlur = (narrow ? 10 : 16) * dpr;
    c.shadowOffsetY = (narrow ? 3 : 5) * dpr;
    c.fillStyle = colors.dark ? 'rgba(0,0,0,0.6)' : alpha(colors.text, 0.28);
    poly(c, [P2(-1.0, -2.2, LZ - 5), P2(XH + 1.0, -2.2, LZ - 5), P2(XH + 1.0, -2.2, LZ + 1.2), P2(-1.0, -2.2, LZ + 1.2)]);
    c.fill();
    poly(c, [P2(-1.2, -2.2, -1.0), P2(-1.2, -2.2, LZ + 1.2), P2(-1.2, -0.6, LZ + 1.2), P2(-1.2, -0.6, -1.0)]);
    c.fill();
    c.restore();

    // 背牆（z = 0）：由上而下的淡漸層
    const bw = [P2(0, 0, 0), P2(XH, 0, 0), P2(XH, LY, 0), P2(0, LY, 0)];
    const gb = c.createLinearGradient(0, bw[3][1], 0, bw[0][1]);
    gb.addColorStop(0, alpha(colors.text, colors.dark ? 0.05 : 0.035));
    gb.addColorStop(1, alpha(colors.text, colors.dark ? 0.09 : 0.06));
    c.fillStyle = gb;
    poly(c, bw); c.fill();
    // 地板（y = 0）
    const fl = [P2(0, 0, 0), P2(XH, 0, 0), P2(XH, 0, LZ), P2(0, 0, LZ)];
    const gf = c.createLinearGradient(0, fl[0][1], 0, fl[3][1]);
    gf.addColorStop(0, alpha(colors.text, colors.dark ? 0.07 : 0.05));
    gf.addColorStop(1, alpha(colors.text, colors.dark ? 0.12 : 0.085));
    c.fillStyle = gf;
    poly(c, fl); c.fill();
    // 格線：地板與背牆每 2 nm 一條細線、每 10 nm 一條主線
    c.lineWidth = 1;
    [[0.035, false], [0.09, true]].forEach(function (lv) {
      c.strokeStyle = alpha(colors.text, lv[0] * (colors.dark ? 0.9 : 1));
      c.beginPath();
      for (let x = 2; x < XH - 0.01; x += 2) {
        if ((Math.abs(x % 10) < 1e-9) !== lv[1]) continue;
        line3(c, [x, 0, 0], [x, 0, LZ]);
        line3(c, [x, 0, 0], [x, LY, 0]);
      }
      for (let z = 2; z < LZ - 0.01; z += 2) {
        if ((Math.abs(z % 10) < 1e-9) !== lv[1]) continue;
        line3(c, [0, 0, z], [XH, 0, z]);
      }
      for (let y = 2; y < LY - 0.01; y += 2) {
        if ((Math.abs(y % 10) < 1e-9) !== lv[1]) continue;
        line3(c, [0, y, 0], [XH, y, 0]);
      }
      c.stroke();
    });
    // 後方的邊線
    c.strokeStyle = alpha(colors.text, colors.dark ? 0.22 : 0.18);
    c.lineWidth = 1;
    c.beginPath();
    line3(c, [0, 0, 0], [XH, 0, 0]);
    line3(c, [0, 0, 0], [0, LY, 0]);
    line3(c, [0, LY, 0], [XH, LY, 0]);
    line3(c, [0, 0, 0], [0, 0, LZ]);
    line3(c, [XH, 0, 0], [XH, LY, 0]);
    c.stroke();
  }

  // ---------- 主繪圖（容器） ----------
  let drawPending = false;
  function requestDraw() {
    if (drawPending) return;
    drawPending = true;
    requestAnimationFrame(function () { drawPending = false; drawAll(); });
  }
  /** 容器每幀重畫；兩張圖表變化慢，動畫中每 0.1 秒重畫一次（操作或改變版面時立即重畫） */
  let lastChartAt = 0;
  function drawAll(force) {
    if (!gas || !BOX) return;
    if (view3 && view3.active) view3.frame(); // 3D 檢視：畫同一個氣體狀態
    else drawBox();
    const now = performance.now();
    if (force !== false || now - lastChartAt >= 100) {
      lastChartAt = now;
      drawHist();
      drawPV();
    }
    updateReadout(false);
  }

  const order = [];
  const sx = new Float64Array(400), sy = new Float64Array(400), sr = new Float64Array(400), sz = new Float64Array(400);

  function drawBox() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(bg, 0, 0, cw, ch);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const Lx = gas.Lx;

    // 恆溫槽：與氣體接觸的地板與背牆帶有溫度色的淡光
    if (bathOn()) {
      const tc = tempColor(gas.bath.T), dev = Math.min(1, Math.abs(gas.bath.T - 300) / 400);
      const a = (colors.dark ? 0.1 : 0.07) + 0.16 * dev;
      ctx.fillStyle = alpha(tc, a);
      poly(ctx, [P2(0, 0, 0), P2(Lx, 0, 0), P2(Lx, 0, LZ), P2(0, 0, LZ)]); ctx.fill();
      ctx.fillStyle = alpha(tc, a * 0.75);
      poly(ctx, [P2(0, 0, 0), P2(Lx, 0, 0), P2(Lx, LY, 0), P2(0, LY, 0)]); ctx.fill();
    }
    // 活塞外側（不是氣體）：極淡的斜線
    drawOutsideHatch(Lx);

    // 底座（恆溫槽或隔熱底座）
    drawBase();

    // 拉桿與把手、活塞
    drawPiston(Lx);

    // 撞擊活塞的閃光
    if (state.show.impacts) drawImpacts(Lx);

    // 分子：投影、依深度排序
    const n = gas.n;
    order.length = n;
    for (let i = 0; i < n; i++) {
      proj(gas.x[i], gas.y[i], gas.z[i]);
      sx[i] = PO.x; sy[i] = PO.y; sz[i] = PO.z;
      sr[i] = Math.max(1.6, gas.rad[i] * PO.s);
      order[i] = i;
    }
    order.sort(function (a, b) { return sz[b] - sz[a]; });
    // 地板上的影子（光由正上方照下）
    for (let i = 0; i < n; i++) {
      const h = gas.y[i] / LY;
      proj(gas.x[i], 0, gas.z[i]);
      const r = gas.rad[i] * PO.s * (1.5 + 1.4 * h);
      ctx.globalAlpha = 0.85 * (1 - h) * (1 - h) + 0.08;
      ctx.drawImage(shadowSpr, PO.x - r, PO.y - r * 0.42, 2 * r, 2 * r * 0.42);
    }
    ctx.globalAlpha = 1;
    // 分子本體
    const zr = BOX.zFar - BOX.zNear;
    const sc = state.show.speedColor;
    const vp = sc ? [G.vprob(Math.max(20, Tgas()), speciesOf(0).m), G.vprob(Math.max(20, Tgas()), speciesOf(1).m)] : null;
    for (let q = 0; q < n; q++) {
      const i = order[q];
      const fogI = Math.max(0, Math.min(2, Math.floor((sz[i] - BOX.zNear) / zr * 3)));
      let spr;
      if (sc) {
        const v = Math.sqrt(gas.vx[i] * gas.vx[i] + gas.vy[i] * gas.vy[i] + gas.vz[i] * gas.vz[i]) / vp[gas.s[i]];
        spr = sprites['v' + Math.max(0, Math.min(SPEED_LEVELS - 1, Math.round(v / 2 * (SPEED_LEVELS - 1))))];
      } else spr = sprites['s' + (gas.s[i] === 0 ? state.spA : state.spB)];
      const r = sr[i];
      ctx.drawImage(spr[fogI], sx[i] - r, sy[i] - r, 2 * r, 2 * r);
    }

    // 追蹤的分子：軌跡、速度箭頭、光圈
    if (state.show.track && gas.track >= 0 && gas.track < n) drawTrack();

    // 前方與上方的玻璃
    drawGlass(Lx);
    drawFocusRing();

    // 標籤、壓力計、溫度計、刻度尺（刻度數字避開底座上的標籤）
    drawGauges();
    const baseLabel = drawLabels(Lx);
    drawRuler(baseLabel);
  }

  function drawOutsideHatch(Lx) {
    const x0 = Lx + PT;
    if (XH - x0 < 0.05) return;
    ctx.save();
    poly(ctx, [P2(x0, 0, 0), P2(XH, 0, 0), P2(XH, 0, LZ), P2(x0, 0, LZ)]);
    ctx.clip();
    ctx.strokeStyle = alpha(colors.muted, colors.dark ? 0.14 : 0.12);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let z = -XH; z < LZ + XH; z += 1.6) line3(ctx, [x0 - 2, 0, z], [XH + 2, 0, z + (XH - x0 + 4)]);
    ctx.stroke();
    ctx.restore();
  }

  function drawBase() {
    const y0 = -2.2, y1 = -0.05, x0 = -1.4, x1 = XH + 1.4, z0 = -1.4, z1 = LZ + 1.4;
    const bath = bathOn();
    const metal = bath ? mix(colors.field, tempColor(gas.bath.T), 0.35 + 0.4 * Math.min(1, Math.abs(gas.bath.T - 300) / 400)) : colors.muted;
    // 上表面（只看得到露在容器外的邊）
    const top = [P2(x0, y1, z0), P2(x1, y1, z0), P2(x1, y1, z1), P2(x0, y1, z1)];
    ctx.fillStyle = alpha(shade(metal, colors.dark ? -0.2 : 0.55), colors.dark ? 0.55 : 0.75);
    poly(ctx, top); ctx.fill();
    // 正面（z = z1）
    const fr = [P2(x0, y1, z1), P2(x1, y1, z1), P2(x1, y0, z1), P2(x0, y0, z1)];
    const g = ctx.createLinearGradient(0, fr[0][1], 0, fr[3][1]);
    g.addColorStop(0, shade(metal, colors.dark ? -0.15 : 0.25));
    g.addColorStop(1, shade(metal, colors.dark ? -0.5 : -0.15));
    ctx.fillStyle = g;
    poly(ctx, fr); ctx.fill();
    // 左側面（x = x0）
    const lf = [P2(x0, y1, z0), P2(x0, y1, z1), P2(x0, y0, z1), P2(x0, y0, z0)];
    ctx.fillStyle = shade(metal, colors.dark ? -0.45 : -0.05);
    poly(ctx, lf); ctx.fill();
    // 正面的金屬髮絲紋（細的橫向亮暗線）
    ctx.save();
    poly(ctx, fr); ctx.clip();
    ctx.lineWidth = 1;
    for (let k = 1; k < 9; k++) {
      const yy = y1 + (y0 - y1) * k / 9;
      ctx.strokeStyle = k % 2 ? alpha('#ffffff', colors.dark ? 0.03 : 0.09) : alpha('#000000', colors.dark ? 0.08 : 0.03);
      ctx.beginPath(); line3(ctx, [x0, yy, z1], [x1, yy, z1]); ctx.stroke();
    }
    ctx.restore();
    // 頂邊高光、左前稜線、底邊暗線
    ctx.strokeStyle = alpha(shade(metal, 0.7), colors.dark ? 0.45 : 0.8);
    ctx.lineWidth = 1;
    ctx.beginPath(); line3(ctx, [x0, y1, z1], [x1, y1, z1]); line3(ctx, [x0, y1, z0], [x0, y1, z1]); ctx.stroke();
    ctx.strokeStyle = alpha(shade(metal, 0.5), colors.dark ? 0.25 : 0.5);
    ctx.beginPath(); line3(ctx, [x0, y1, z1], [x0, y0, z1]); ctx.stroke();
    ctx.strokeStyle = alpha('#000000', colors.dark ? 0.45 : 0.22);
    ctx.beginPath(); line3(ctx, [x0, y0, z1], [x1, y0, z1]); line3(ctx, [x0, y0, z0], [x0, y0, z1]); ctx.stroke();
    // 恆溫槽的指示燈（顏色＝恆溫槽溫度）
    if (bath && LD) {
      const led = P2(x1 - 1.2, (y0 + y1) / 2, z1);
      const lr = Math.max(2, proj(x1 - 1.2, (y0 + y1) / 2, z1).s * 0.38);
      const Tb = Math.round(gas.bath.T / 20) * 20, ledCol = mix(colors.accent, Tb > 300 ? colors.pos : colors.neg, Math.min(1, Math.abs(Tb - 300) / 300));
      LD.ball(ctx, led[0], led[1], lr, ledCol, { shadow: false, glow: 0.55 });
    }
    // 絕熱：正面畫斜線（隔熱材）
    if (!bath) {
      ctx.save();
      poly(ctx, fr); ctx.clip();
      ctx.strokeStyle = alpha(colors.text, 0.18);
      ctx.beginPath();
      const a = P2(x0, y0, z1), b = P2(x1, y1, z1);
      for (let x = a[0] - 40; x < b[0] + 40; x += 7) { ctx.moveTo(x, a[1] + 2); ctx.lineTo(x + 12, b[1] - 2); }
      ctx.stroke();
      ctx.restore();
    }
  }

  /** 拉桿（管狀）＋把手（球）＋活塞（三個看得到的面） */
  let pistonHit = null; // 拖曳判定用的螢幕位置
  let hoverPiston = false, dragging = false;
  function drawPiston(Lx) {
    const canDrag = state.mode === 'isothermal' || state.mode === 'adiabatic';
    const hl = (hoverPiston || dragging) && canDrag;
    const steel = colors.field;
    // 汽缸右端的導套（拉桿穿過的金屬環）：先畫，拉桿從中間穿過
    const ec = proj(XH, LY / 2, LZ / 2, {});
    const er = 1.5 * ec.s;
    const eg = ctx.createRadialGradient(ec.x - er * 0.3, ec.y - er * 0.35, er * 0.1, ec.x, ec.y, er);
    eg.addColorStop(0, shade(steel, colors.dark ? 0.1 : 0.75));
    eg.addColorStop(0.7, shade(steel, colors.dark ? -0.3 : 0.25));
    eg.addColorStop(1, shade(steel, colors.dark ? -0.6 : -0.2));
    ctx.fillStyle = eg;
    ctx.beginPath(); ctx.ellipse(ec.x, ec.y, er, er * 0.95, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = alpha(colors.text, colors.dark ? 0.4 : 0.3);
    ctx.lineWidth = 1;
    ctx.stroke();
    // 拉桿：拋光的金屬圓桿
    const a = proj(Lx + PT, LY / 2, LZ / 2, {}), b = proj(ROD_END, LY / 2, LZ / 2, {});
    const rw = 0.9 * (a.s + b.s);
    const rodCol = shade(steel, colors.dark ? -0.2 : 0.2);
    if (LD) LD.tube(ctx, function (c) { c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); }, rodCol, rw);
    else {
      ctx.strokeStyle = rodCol; ctx.lineWidth = rw;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.lineCap = 'round';
    // 把手：金屬球（可拖曳時亮起 --accent 色光暈）
    const kR = 2.2 * b.s;
    const kc = hl ? colors.accent : (state.mode === 'isobaric' ? colors.equi : colors.b_mech || colors['b-mech']);
    if (hl) {
      ctx.fillStyle = alpha(colors.accent, 0.22);
      ctx.beginPath(); ctx.arc(b.x, b.y, kR * 1.6, 0, Math.PI * 2); ctx.fill();
    }
    if (LD) LD.ball(ctx, b.x, b.y, kR, kc, { glow: colors.dark ? 0.3 : 0 });
    else {
      const kg = ctx.createRadialGradient(b.x - kR * 0.35, b.y - kR * 0.38, kR * 0.08, b.x, b.y, kR);
      kg.addColorStop(0, shade(kc, 0.65)); kg.addColorStop(0.5, kc); kg.addColorStop(1, shade(kc, -0.45));
      ctx.fillStyle = kg;
      ctx.beginPath(); ctx.arc(b.x, b.y, kR, 0, Math.PI * 2); ctx.fill();
    }
    // 等容：把手旁的固定插銷
    if (state.mode === 'isochoric') {
      const pin = proj(XH + 1.6, LY / 2, LZ / 2, {});
      ctx.strokeStyle = shade(colors.muted, colors.dark ? 0.2 : -0.2);
      ctx.lineWidth = Math.max(2, 0.7 * pin.s);
      ctx.beginPath(); ctx.moveTo(pin.x, pin.y - 2.6 * pin.s); ctx.lineTo(pin.x, pin.y + 2.6 * pin.s); ctx.stroke();
    }

    // 活塞本體：x = Lx ～ Lx + PT，截面略小於容器
    const e = 0.12, y0 = e, y1 = LY - e, z0 = e, z1 = LZ - e, x0 = Lx, x1 = Lx + PT;
    const inner = [P2(x0, y0, z0), P2(x0, y1, z0), P2(x0, y1, z1), P2(x0, y0, z1)];
    const topF = [P2(x0, y1, z0), P2(x1, y1, z0), P2(x1, y1, z1), P2(x0, y1, z1)];
    const front = [P2(x0, y0, z1), P2(x0, y1, z1), P2(x1, y1, z1), P2(x1, y0, z1)];
    // 內面（面向氣體）：金屬漸層
    const gi = ctx.createLinearGradient(inner[1][0], inner[1][1], inner[3][0], inner[3][1]);
    gi.addColorStop(0, shade(steel, colors.dark ? -0.25 : 0.7));
    gi.addColorStop(1, shade(steel, colors.dark ? -0.6 : 0.35));
    ctx.fillStyle = gi;
    poly(ctx, inner); ctx.fill();
    ctx.fillStyle = shade(steel, colors.dark ? -0.05 : 0.8);
    poly(ctx, topF); ctx.fill();
    const gfr = ctx.createLinearGradient(0, front[1][1], 0, front[0][1]);
    gfr.addColorStop(0, shade(steel, colors.dark ? -0.2 : 0.45));
    gfr.addColorStop(1, shade(steel, colors.dark ? -0.55 : 0.05));
    ctx.fillStyle = gfr;
    poly(ctx, front); ctx.fill();
    // 內面的車削紋（沿 y 方向的細亮暗線）與斜向的反光帶
    ctx.save();
    poly(ctx, inner); ctx.clip();
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let z = z0 + 0.4; z < z1; z += 0.8) line3(ctx, [x0, y0, z], [x0, y1, z]);
    ctx.strokeStyle = alpha('#ffffff', colors.dark ? 0.03 : 0.11);
    ctx.stroke();
    ctx.beginPath();
    for (let z = z0 + 0.8; z < z1; z += 0.8) line3(ctx, [x0, y0, z], [x0, y1, z]);
    ctx.strokeStyle = alpha('#000000', colors.dark ? 0.07 : 0.025);
    ctx.stroke();
    const sh = ctx.createLinearGradient(inner[1][0], inner[1][1], inner[3][0], inner[3][1]);
    sh.addColorStop(0.25, alpha('#ffffff', 0));
    sh.addColorStop(0.38, alpha('#ffffff', colors.dark ? 0.08 : 0.3));
    sh.addColorStop(0.5, alpha('#ffffff', 0));
    ctx.fillStyle = sh;
    poly(ctx, inner); ctx.fill();
    ctx.restore();
    // 側面的兩道橡膠密封圈（上面與正面看得到）
    const ringW = Math.max(1.2, 0.16 * proj(x0, y1, z1, {}).s);
    ctx.strokeStyle = colors.dark ? 'rgba(0,0,0,0.65)' : alpha(shade(colors.text, 0.15), 0.55);
    ctx.lineWidth = ringW;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    [0.3, 0.7].forEach(function (f) {
      const xr = x0 + PT * f;
      line3(ctx, [xr, y1, z0], [xr, y1, z1]);
      line3(ctx, [xr, y1, z1], [xr, y0, z1]);
    });
    ctx.stroke();
    ctx.lineCap = 'round';
    // 邊線
    ctx.strokeStyle = hl ? colors.accent : alpha(colors.text, colors.dark ? 0.35 : 0.3);
    ctx.lineWidth = hl ? 2 : 1;
    poly(ctx, inner); ctx.stroke();
    ctx.strokeStyle = alpha(colors.text, 0.25);
    ctx.lineWidth = 1;
    poly(ctx, topF); ctx.stroke();
    poly(ctx, front); ctx.stroke();
    // 活塞內面與正面交界的稜線高光
    ctx.strokeStyle = alpha('#ffffff', colors.dark ? 0.3 : 0.85);
    ctx.beginPath(); line3(ctx, [x0, y1, z1], [x0, y0 + 0.4, z1]); ctx.stroke();
    // 鍵盤焦點框的範圍（活塞面＋拉桿＋把手）
    let bx0 = b.x - kR, bx1 = b.x + kR, by0 = b.y - kR, by1 = b.y + kR;
    inner.concat(front, topF).forEach(function (p) {
      bx0 = Math.min(bx0, p[0]); bx1 = Math.max(bx1, p[0]); by0 = Math.min(by0, p[1]); by1 = Math.max(by1, p[1]);
    });
    pistonHit = { face: inner, knob: [b.x, b.y, kR], rodA: [a.x, a.y], rodB: [b.x, b.y], box: [bx0, by0, bx1, by1] };
  }
  /** 鍵盤選取活塞時的焦點框（--accent 色虛線圓角框） */
  function drawFocusRing() {
    if (!kb || !kb.focused() || kb.index() !== 0 || !pistonHit) return;
    const bb = pistonHit.box, pad = 6;
    ctx.save();
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    roundRect(ctx, bb[0] - pad, bb[1] - pad, bb[2] - bb[0] + 2 * pad, bb[3] - bb[1] + 2 * pad, 10);
    ctx.stroke();
    ctx.restore();
  }

  function drawImpacts(Lx) {
    const now = performance.now();
    impacts = impacts.filter(function (e) { return now - e.t0 < 450; });
    const col = colors.equi;
    impacts.forEach(function (e) {
      const u = (now - e.t0) / 450;
      proj(Lx - 0.02, e.y, e.z);
      const r = Math.max(1.2, (0.12 + 0.18 * e.k) * PO.s) * (0.7 + 0.8 * u);
      ctx.fillStyle = alpha(col, 0.5 * (1 - u) * (1 - u));
      ctx.beginPath(); ctx.arc(PO.x, PO.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = alpha(col, 0.45 * (1 - u));
      ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.arc(PO.x, PO.y, r * (1.3 + 1.2 * u), 0, Math.PI * 2); ctx.stroke();
    });
  }

  function drawTrack() {
    const i = gas.track, tp = gas.trackPts;
    const list = [];
    for (let k = 0; k < tp.length; k += 3) list.push([tp[k], tp[k + 1], tp[k + 2]]);
    list.push([gas.x[i], gas.y[i], gas.z[i]]);
    const col = colors.text;
    const n = list.length;
    let prev = null;
    for (let k = Math.max(0, n - 60); k < n; k++) {
      const p = P2(list[k][0], list[k][1], list[k][2]);
      if (prev) {
        const u = (k - Math.max(0, n - 60)) / Math.min(60, n);
        ctx.strokeStyle = alpha(col, 0.12 + 0.6 * u * u);
        ctx.lineWidth = 0.8 + 1.6 * u;
        ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(p[0], p[1]); ctx.stroke();
        // 碰撞點的小圓點
        ctx.fillStyle = alpha(col, 0.15 + 0.5 * u);
        ctx.beginPath(); ctx.arc(prev[0], prev[1], 1.4, 0, Math.PI * 2); ctx.fill();
      }
      prev = p;
    }
    // 速度箭頭：箭頭長度 = 2 ps 內移動的距離
    const x = gas.x[i], y = gas.y[i], z = gas.z[i];
    const a = proj(x, y, z, {}), b = proj(x + gas.vx[i] * 2, y + gas.vy[i] * 2, z + gas.vz[i] * 2, {});
    const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy);
    if (L > 4) arrow(ctx, a.x, a.y, dx / L, dy / L, L, narrow ? 1.8 : 2.2, colors.pos);
    // 光圈
    ctx.strokeStyle = colors.text;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(a.x, a.y, sr[i] + 3, 0, Math.PI * 2); ctx.stroke();
    const v = Math.sqrt(gas.vx[i] * gas.vx[i] + gas.vy[i] * gas.vy[i] + gas.vz[i] * gas.vz[i]);
    ctx.textAlign = 'left';
    pill(ctx, 'v = ' + num(v * 1000, 0) + ' m/s', a.x + sr[i] + 8, a.y - 12, colors.pos, '600 ' + (narrow ? 11 : 12) + 'px system-ui, sans-serif', 0.82);
  }

  function arrow(c, x0, y0, ux, uy, len, lw, color) {
    const head = Math.min(4 * lw, len), hw = 1.7 * lw;
    const xt = x0 + ux * len, yt = y0 + uy * len;
    const xh = xt - ux * head, yh = yt - uy * head;
    const nx = -uy, ny = ux;
    c.strokeStyle = color; c.fillStyle = color; c.lineCap = 'round';
    if (len > head + 1) {
      c.lineWidth = lw;
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(xh + ux * head * 0.3, yh + uy * head * 0.3); c.stroke();
    }
    c.beginPath();
    c.moveTo(xt, yt);
    c.quadraticCurveTo(xt - ux * head * 0.45 + nx * hw * 0.35, yt - uy * head * 0.45 + ny * hw * 0.35, xh + nx * hw, yh + ny * hw);
    c.lineTo(xh + ux * head * 0.2, yh + uy * head * 0.2);
    c.lineTo(xh - nx * hw, yh - ny * hw);
    c.quadraticCurveTo(xt - ux * head * 0.45 - nx * hw * 0.35, yt - uy * head * 0.45 - ny * hw * 0.35, xt, yt);
    c.closePath();
    c.fill();
  }

  function drawGlass(Lx) {
    // 正面玻璃：淡淡的斜向光澤
    const fr = [P2(0, 0, LZ), P2(XH, 0, LZ), P2(XH, LY, LZ), P2(0, LY, LZ)];
    const g = ctx.createLinearGradient(fr[3][0], fr[3][1], fr[1][0], fr[1][1]);
    g.addColorStop(0, alpha('#ffffff', colors.dark ? 0.035 : 0.12));
    g.addColorStop(0.35, alpha('#ffffff', 0));
    g.addColorStop(0.62, alpha('#ffffff', colors.dark ? 0.03 : 0.08));
    g.addColorStop(0.7, alpha('#ffffff', 0));
    ctx.fillStyle = g;
    poly(ctx, fr); ctx.fill();
    // 玻璃頂蓋與右端玻璃：極淡的色調，看得出是一片玻璃
    const top = [P2(0, LY, 0), P2(XH, LY, 0), P2(XH, LY, LZ), P2(0, LY, LZ)];
    const gt = ctx.createLinearGradient(top[0][0], top[0][1], top[2][0], top[2][1]);
    gt.addColorStop(0, alpha(colors['b-wave'], colors.dark ? 0.03 : 0.04));
    gt.addColorStop(0.55, alpha('#ffffff', colors.dark ? 0.05 : 0.16));
    gt.addColorStop(1, alpha(colors['b-wave'], colors.dark ? 0.02 : 0.03));
    ctx.fillStyle = gt;
    poly(ctx, top); ctx.fill();
    ctx.fillStyle = alpha(colors['b-wave'], colors.dark ? 0.025 : 0.035);
    poly(ctx, [P2(XH, 0, 0), P2(XH, LY, 0), P2(XH, LY, LZ), P2(XH, 0, LZ)]); ctx.fill();
    // 恆溫：玻璃邊框帶溫度色。玻璃有厚度：先畫一道寬而淡的邊，再畫細的稜線
    const edge = bathOn() ? mix(colors.text, tempColor(gas.bath.T), 0.55) : colors.text;
    const edges = function () {
      ctx.beginPath();
      line3(ctx, [0, 0, LZ], [XH, 0, LZ]);
      line3(ctx, [0, LY, LZ], [XH, LY, LZ]);
      line3(ctx, [0, 0, LZ], [0, LY, LZ]);
      line3(ctx, [XH, 0, LZ], [XH, LY, LZ]);
      line3(ctx, [0, LY, 0], [0, LY, LZ]);
      line3(ctx, [XH, LY, 0], [XH, LY, LZ]);
    };
    ctx.strokeStyle = alpha(mix(edge, colors['b-wave'], 0.3), colors.dark ? 0.16 : 0.13);
    ctx.lineWidth = narrow ? 3.5 : 5;
    edges(); ctx.stroke();
    ctx.strokeStyle = alpha(edge, colors.dark ? 0.5 : 0.42);
    ctx.lineWidth = 1.3;
    edges(); ctx.stroke();
    // 頂邊與左邊的高光
    ctx.strokeStyle = alpha('#ffffff', colors.dark ? 0.18 : 0.6);
    ctx.lineWidth = 1;
    ctx.beginPath(); line3(ctx, [0.3, LY - 0.25, LZ], [XH - 0.3, LY - 0.25, LZ]); line3(ctx, [0.25, 0.3, LZ], [0.25, LY - 0.3, LZ]); ctx.stroke();
    // 前方四角與上方兩角的金屬護角
    const cap = colors.dark ? shade(colors.field, -0.15) : shade(colors.field, 0.45), Lc = 1.3;
    const cw2 = narrow ? 2.4 : 3.2;
    [[0, 0, LZ, 1, 1, -1], [XH, 0, LZ, -1, 1, -1], [0, LY, LZ, 1, -1, -1], [XH, LY, LZ, -1, -1, -1], [0, LY, 0, 1, -1, 1], [XH, LY, 0, -1, -1, 1]].forEach(function (k) {
      const o = P2(k[0], k[1], k[2]), px = P2(k[0] + k[3] * Lc, k[1], k[2]), py = P2(k[0], k[1] + k[4] * Lc, k[2]), pz = P2(k[0], k[1], k[2] + k[5] * Lc);
      if (LD) LD.tube(ctx, function (c) { c.moveTo(px[0], px[1]); c.lineTo(o[0], o[1]); c.lineTo(py[0], py[1]); c.moveTo(o[0], o[1]); c.lineTo(pz[0], pz[1]); }, cap, cw2);
    });
  }

  /** 正面底邊的刻度尺：活塞位置（nm） */
  function drawRuler(avoid) {
    const z = LZ + 1.4, y = -2.2;
    const f = (narrow ? 10 : 11) + 'px system-ui, sans-serif';
    ctx.strokeStyle = alpha(colors.text, 0.45);
    ctx.lineWidth = 1;
    ctx.fillStyle = alpha(colors.muted, 0.95);
    ctx.font = f;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.beginPath();
    for (let x = 0; x <= LX_MAX + 0.01; x += 2) {
      const p = P2(x, y, z), q = P2(x, y - (x % 10 === 0 ? 0.9 : 0.5), z);
      ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]);
    }
    ctx.stroke();
    for (let x = 0; x <= LX_MAX + 0.01; x += 10) {
      const q = P2(x, y - 1.0, z), t = num(x, 0) + (x === LX_MAX ? ' nm' : ''), w = ctx.measureText(t).width;
      if (avoid && q[0] + w / 2 > avoid.x - 2 && q[0] - w / 2 < avoid.x + avoid.w + 2 && q[1] + 14 > avoid.y && q[1] < avoid.y + avoid.h) continue;
      ctx.fillText(t, q[0], q[1] + 1);
    }
    // 活塞位置指標
    const pp = P2(gas.Lx, y - 0.1, z);
    ctx.fillStyle = colors.accent;
    ctx.beginPath(); ctx.moveTo(pp[0], pp[1]); ctx.lineTo(pp[0] - 4, pp[1] - 6); ctx.lineTo(pp[0] + 4, pp[1] - 6); ctx.closePath(); ctx.fill();
  }

  /** 壓力計（指針）與溫度計 */
  /** 壓力計與溫度計的讀數（每幀呼叫一次；2D 畫布與 3D 檢視共用） */
  function gaugeValues() {
    const Pm = lastShort && lastShort.t > 8 ? kPa(lastShort.P) : null;
    const Tm = lastShort && lastShort.t > 8 ? lastShort.T : G.temperature(gas);
    if (Pm != null) pGauge = pGauge == null ? Pm : pGauge + 0.25 * (Pm - pGauge);
    return { T: Tm, P: pGauge, Pth: kPa(G.idealP(gas.n, Tgas(), Vnow())) };
  }
  function drawGauges() {
    const gv = gaugeValues(), Tm = gv.T;
    // ---- 壓力計：右上角 ----
    const R = narrow ? 30 : 40;
    const gx = cw - R - (narrow ? 12 : 18), gy = R + (narrow ? 12 : 16);
    const Pth = gv.Pth;
    const full = niceUp(Math.max(Pth, pGauge || 0) * 1.25 || 100);
    // 錶殼
    const rim = ctx.createLinearGradient(gx - R, gy - R, gx + R, gy + R);
    rim.addColorStop(0, shade(colors.field, colors.dark ? 0.05 : 0.75));
    rim.addColorStop(1, shade(colors.field, colors.dark ? -0.55 : 0.1));
    ctx.fillStyle = 'rgba(0,0,0,' + (colors.dark ? 0.35 : 0.12) + ')';
    ctx.beginPath(); ctx.arc(gx + 1.5, gy + 2.5, R + 1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = rim;
    ctx.beginPath(); ctx.arc(gx, gy, R, 0, Math.PI * 2); ctx.fill();
    // 錶殼的斜面：左上亮、右下暗
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = alpha('#ffffff', colors.dark ? 0.25 : 0.8);
    ctx.beginPath(); ctx.arc(gx, gy, R - 0.8, Math.PI * 0.95, Math.PI * 1.75); ctx.stroke();
    ctx.strokeStyle = alpha('#000000', colors.dark ? 0.4 : 0.18);
    ctx.beginPath(); ctx.arc(gx, gy, R - 0.8, Math.PI * 1.95, Math.PI * 2.75); ctx.stroke();
    // 錶面：中間略亮，內緣一圈淡陰影（錶面凹在錶殼裡）
    const face = colors.dark ? shade(colors['canvas-bg'], 0.06) : '#fdfdfb';
    const fg = ctx.createRadialGradient(gx - R * 0.2, gy - R * 0.25, R * 0.1, gx, gy, R - 3.5);
    fg.addColorStop(0, colors.dark ? shade(face, 0.05) : '#ffffff');
    fg.addColorStop(0.8, face);
    fg.addColorStop(1, colors.dark ? shade(face, -0.35) : shade(face, -0.08));
    ctx.fillStyle = fg;
    ctx.beginPath(); ctx.arc(gx, gy, R - 3.5, 0, Math.PI * 2); ctx.fill();
    // 刻度（-225° 到 45°）
    const A0 = Math.PI * 0.75, A1 = Math.PI * 2.25;
    const ang = function (p) { return A0 + (A1 - A0) * Math.max(0, Math.min(1.04, p / full)); };
    ctx.strokeStyle = alpha(colors.text, 0.55);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = 0; k <= 10; k++) {
      const a = A0 + (A1 - A0) * k / 10, r0 = R - 4, r1 = R - (k % 5 === 0 ? 10 : 7);
      ctx.moveTo(gx + r0 * Math.cos(a), gy + r0 * Math.sin(a)); ctx.lineTo(gx + r1 * Math.cos(a), gy + r1 * Math.sin(a));
    }
    ctx.stroke();
    ctx.font = (narrow ? 9 : 10) + 'px system-ui, sans-serif';
    ctx.fillStyle = colors.muted;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    [0, 0.5, 1].forEach(function (f) {
      const a = A0 + (A1 - A0) * f, r = R - (narrow ? 14 : 17);
      ctx.fillText(num(full * f, full * f >= 10 || f === 0 ? 0 : 1), gx + r * Math.cos(a), gy + r * Math.sin(a) - (f === 0.5 ? 0 : 2));
    });
    // 理論值記號（NkT/V）
    const at = ang(Pth);
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(gx, gy, R - 5.5, at - 0.06, at + 0.06); ctx.stroke();
    ctx.font = '600 ' + (narrow ? 8 : 9) + 'px system-ui, sans-serif';
    ctx.fillStyle = colors.muted;
    ctx.fillText('kPa', gx, gy + R * 0.64);
    // 指針（量到的壓力）：尖細的指針＋淡淡的影子
    if (pGauge != null) {
      const a = ang(pGauge), ca = Math.cos(a), sa = Math.sin(a), L = R - 8, tw = 2.2;
      const needle = function (ox, oy) {
        ctx.beginPath();
        ctx.moveTo(gx + ox + L * ca, gy + oy + L * sa);
        ctx.lineTo(gx + ox - tw * sa, gy + oy + tw * ca);
        ctx.lineTo(gx + ox - 6 * ca, gy + oy - 6 * sa);
        ctx.lineTo(gx + ox + tw * sa, gy + oy - tw * ca);
        ctx.closePath();
      };
      ctx.fillStyle = 'rgba(0,0,0,' + (colors.dark ? 0.4 : 0.18) + ')';
      needle(1, 1.5); ctx.fill();
      ctx.fillStyle = colors.pos;
      needle(0, 0); ctx.fill();
    }
    if (LD) LD.ball(ctx, gx, gy, 3.4, shade(colors.field, colors.dark ? 0.1 : -0.1), { shadow: false, glow: 0 });
    else {
      ctx.fillStyle = shade(colors.field, colors.dark ? 0.2 : -0.1);
      ctx.beginPath(); ctx.arc(gx, gy, 3, 0, Math.PI * 2); ctx.fill();
    }
    // 錶面玻璃的反光
    const gl = ctx.createLinearGradient(gx - R, gy - R, gx, gy);
    gl.addColorStop(0, alpha('#ffffff', colors.dark ? 0.12 : 0.55));
    gl.addColorStop(1, alpha('#ffffff', 0));
    ctx.fillStyle = gl;
    ctx.beginPath(); ctx.arc(gx, gy, R - 4, Math.PI * 0.95, Math.PI * 1.6); ctx.quadraticCurveTo(gx - R * 0.1, gy - R * 0.35, gx - (R - 4) * 0.95, gy + (R - 4) * 0.16); ctx.fill();
    ctx.textAlign = 'right';
    pill(ctx, 'P = ' + (pGauge != null ? num(pGauge, pGauge < 10 ? 2 : 1) : '…') + ' kPa', gx - R - 6, gy - (narrow ? 4 : 8), colors.pos, '700 ' + (narrow ? 11 : 13) + 'px system-ui, sans-serif', 0.82);
    if (!narrow) pill(ctx, T('理論 NkT/V = ', 'Theory NkT/V = ') + num(Pth, Pth < 10 ? 2 : 1), gx - R - 6, gy + 14, colors.accent, '600 11px system-ui, sans-serif', 0.75);

    // ---- 溫度計：左上角（橫放） ----
    const tx0 = narrow ? 10 : 16, ty = narrow ? 22 : 26, tlen = narrow ? 96 : 140, bulb = narrow ? 6 : 7;
    const Tmax = 1000;
    // 玻璃管（含底部的球）：淡淡的玻璃底色、細外框
    ctx.fillStyle = alpha(colors.surface, colors.dark ? 0.16 : 0.6);
    roundRect(ctx, tx0 + bulb, ty - 5, tlen + 3, 10, 5); ctx.fill();
    ctx.beginPath(); ctx.arc(tx0 + bulb, ty, bulb + 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = alpha(colors.text, 0.08);
    roundRect(ctx, tx0 + bulb, ty - 3.5, tlen, 7, 3.5); ctx.fill();
    const tcol = tempColor(Tm);
    const fillLen = Math.max(0, Math.min(1, Tm / Tmax)) * tlen;
    const lg = ctx.createLinearGradient(0, ty - 3, 0, ty + 3);
    lg.addColorStop(0, shade(tcol, 0.35)); lg.addColorStop(1, shade(tcol, -0.2));
    ctx.fillStyle = lg;
    roundRect(ctx, tx0 + bulb - 1, ty - 2.2, fillLen + 2, 4.4, 2.2); ctx.fill();
    ctx.strokeStyle = alpha(colors.muted, colors.dark ? 0.55 : 0.45);
    ctx.lineWidth = 1;
    roundRect(ctx, tx0 + bulb + 0.5, ty - 4.5, tlen + 2, 9, 4.5); ctx.stroke();
    ctx.strokeStyle = alpha('#ffffff', colors.dark ? 0.2 : 0.8);
    ctx.beginPath(); ctx.moveTo(tx0 + bulb + 4, ty - 3.2); ctx.lineTo(tx0 + bulb + tlen - 2, ty - 3.2); ctx.stroke();
    // 球的顏色取 20 K 一階（LD.ball 依顏色快取小圖，避免每幀產生新圖）
    if (LD) LD.ball(ctx, tx0 + bulb, ty, bulb, tempColor(Math.round(Tm / 20) * 20), { shadow: false, glow: 0, ring: alpha(colors.muted, 0.6) });
    else {
      const bg2 = ctx.createRadialGradient(tx0 + bulb * 0.7, ty - bulb * 0.35, 0.5, tx0 + bulb, ty, bulb);
      bg2.addColorStop(0, shade(tcol, 0.55)); bg2.addColorStop(1, shade(tcol, -0.3));
      ctx.fillStyle = bg2;
      ctx.beginPath(); ctx.arc(tx0 + bulb, ty, bulb, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = alpha(colors.text, 0.35);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = 0; k <= 10; k++) {
      const x = tx0 + bulb + tlen * k / 10;
      ctx.moveTo(x, ty + 4); ctx.lineTo(x, ty + (k % 5 === 0 ? 8 : 6));
    }
    ctx.stroke();
    // 恆溫槽設定值
    if (bathOn()) {
      const x = tx0 + bulb + tlen * Math.min(1, gas.bath.T / Tmax);
      ctx.fillStyle = colors.text;
      ctx.beginPath(); ctx.moveTo(x, ty - 5); ctx.lineTo(x - 3.5, ty - 10); ctx.lineTo(x + 3.5, ty - 10); ctx.closePath(); ctx.fill();
    }
    ctx.textAlign = 'left';
    pill(ctx, 'T = ' + num(Tm, 0) + ' K', tx0 + bulb + tlen + 8, ty, tcol === colors.muted ? colors.text : shade(tcol, colors.dark ? 0.25 : -0.15), '700 ' + (narrow ? 11 : 13) + 'px system-ui, sans-serif', 0.82);
  }

  /** 時間與播放速率（2D 畫布與 3D 檢視共用） */
  function timeText() {
    const line = 't = ' + num(gas.t, gas.t < 1000 ? 1 : 0) + ' ps';
    const rate = curRate();
    let note;
    if (state.ff) note = T('快轉 ×', 'Fast-forward ×') + num(rate / BASE_RATE, 0);
    else if (state.speed !== 1) note = SPEEDS[state.speed] + '×';
    else note = T('1 s ＝ 20 ps', '1 s = 20 ps');
    return line + '   ' + note;
  }
  /** 底座正面的標籤：恆溫槽溫度或絕熱（2D 與 3D 共用） */
  function baseLabelInfo() {
    if (bathOn()) return { text: T('恆溫槽 ', 'Heat bath ') + num(gas.bath.T, gas.bath.T % 1 ? 1 : 0) + ' K' + (gas.bath.T !== state.Tset ? ' → ' + num(state.Tset, state.Tset % 1 ? 1 : 0) + ' K' : ''), color: shade(tempColor(state.Tset), colors.dark ? 0.3 : -0.25) };
    return { text: T('絕熱：器壁不導熱', 'Adiabatic: insulating walls'), color: colors['b-thermo'] };
  }
  /** 把手旁的提示（沒有提示時回傳 null；2D 與 3D 共用） */
  function knobHintInfo() {
    if (state.mode === 'isochoric') return { text: T('活塞固定', 'Piston locked'), color: colors.muted };
    if (state.mode === 'isobaric') return state.pistonStop ? { text: T('活塞已到底', 'Piston at its stop'), color: colors.pos } : { text: T('自動維持壓力', 'Holds the pressure'), color: colors.equi };
    if (!state.dragged) return { text: T('← 拖曳 →', '← drag →'), color: colors.accent };
    return null;
  }
  function drawLabels(Lx) {
    const f1 = '600 ' + (narrow ? 11 : 12) + 'px system-ui, sans-serif';
    // 左上：時間與速率
    ctx.textAlign = 'left';
    // 桌機放在溫度計下方；手機放在左下角（上方留給溫度計與壓力計）
    pill(ctx, timeText(), narrow ? 10 : 16, narrow ? ch - 12 : 54, state.ff ? colors.equi : colors.muted, f1, 0.78);
    // 底座正面：恆溫槽／絕熱
    const lp = P2(XH * 0.32, -1.1, LZ + 1.4);
    ctx.textAlign = 'center';
    const bl = baseLabelInfo();
    const baseRect = pill(ctx, bl.text, lp[0], lp[1], bl.color, '700 ' + (narrow ? 10 : 12) + 'px system-ui, sans-serif', 0.8);
    // 把手旁的提示
    if (pistonHit) {
      const k = pistonHit.knob;
      const fy = k[1] + k[2] + (narrow ? 10 : 12);
      const kh = knobHintInfo();
      if (kh) { ctx.textAlign = 'center'; pill(ctx, kh.text, Math.min(cw - 40, k[0]), Math.min(ch - 12, fy), kh.color, f1, 0.8); }
    }
    if (state.lag) {
      ctx.textAlign = 'right';
      pill(ctx, T('裝置較慢：模擬已自動放慢', 'Slow device: simulation slowed'), cw - 10, ch - 14, colors.pos, '600 11px system-ui, sans-serif', 0.8);
    }
    if (!state.running) {
      ctx.textAlign = 'center';
      pill(ctx, T('已暫停', 'Paused'), cw / 2, narrow ? 72 : 82, colors.muted, f1, 0.8);
    }
    return baseRect;
  }

  // ======================= 圖表 =======================
  const hc = $('hist'), hctx = hc.getContext('2d');
  const pc = $('pv'), pctx = pc.getContext('2d');
  let hw = 300, hh = 220, pw = 300, ph = 220;
  function resizeCharts() {
    [[hc, 'h'], [pc, 'p']].forEach(function (pair) {
      const c = pair[0], w = c.clientWidth || 300;
      const h = Math.round(Math.max(200, Math.min(290, w * 0.66)));
      if (c.style.height !== h + 'px') c.style.height = h + 'px';
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
      if (pair[1] === 'h') { hw = w; hh = h; } else { pw = w; ph = h; }
    });
  }
  function chartBg(c, w, h) {
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    const base = colors['canvas-bg'];
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, base);
    g.addColorStop(1, shade(base, colors.dark ? -0.3 : -0.04));
    c.fillStyle = g;
    roundRect(c, 0, 0, w, h, 8);
    c.fill();
    c.strokeStyle = alpha(colors.text, colors.dark ? 0.08 : 0.06);
    c.lineWidth = 1;
    roundRect(c, 0.5, 0.5, w - 1, h - 1, 8);
    c.stroke();
  }

  let histYmax = 0, histVax = 0;
  /** 速率分布直方圖＋馬克士威曲線 */
  function drawHist() {
    const c = hctx, w = hw, h = hh;
    chartBg(c, w, h);
    const small = w < 360;
    const pad = { l: 12, r: 12, t: 46, b: 40 };
    const X0 = pad.l, X1 = w - pad.r, Y0 = h - pad.b, Y1 = pad.t;
    const nsp = state.mix ? 2 : 1;
    const Ts = [histT(0), histT(1)];
    const Tdisp = isFinite(Ts[0]) ? Ts[0] : Tgas();
    // 橫軸範圍：約 2.6 倍最輕分子的方均根速率（取整數，略有遲滯避免跳動）
    const want = niceUp(2.6 * G.vrms(Math.max(40, Math.max(Tdisp, isFinite(Ts[1]) ? Ts[1] : 0)), lightMass()) * 1000);
    if (!histVax || want > histVax * 1.001 || want < histVax * 0.7) histVax = want;
    const vax = histVax / 1000; // nm/ps
    const xOf = function (v) { return X0 + (X1 - X0) * v / vax; };
    const nbins = small ? 24 : 32;
    const bw = vax / nbins;
    const dens = [];
    let ymax = 0;
    for (let k = 0; k < nsp; k++) {
      const d = new Float64Array(nbins);
      if (histW[k] > 0) {
        for (let b = 0; b < nbins; b++) {
          const f0 = Math.floor(b * bw / BINW + 1e-9), f1 = Math.floor((b + 1) * bw / BINW + 1e-9);
          let s = 0;
          for (let f = f0; f < f1 && f < NB; f++) s += hist[k][f];
          d[b] = s / histW[k] / bw;
          ymax = Math.max(ymax, d[b]);
        }
      }
      dens.push(d);
      if (isFinite(Ts[k])) ymax = Math.max(ymax, G.maxwell(G.vprob(Ts[k], speciesOf(k).m), Ts[k], speciesOf(k).m));
    }
    const target = (ymax || 1) * 1.12;
    histYmax = histYmax ? histYmax + 0.15 * (target - histYmax) : target;
    if (target > histYmax) histYmax = target;
    const yOf = function (p) { return Y0 - (Y0 - Y1) * p / histYmax; };
    // 格線與座標軸
    const step = niceStep(histVax / (small ? 4 : 6));
    c.strokeStyle = alpha(colors.text, 0.07);
    c.lineWidth = 1;
    c.beginPath();
    for (let v = step; v < histVax + 1e-6; v += step) { const x = Math.round(xOf(v / 1000)) + 0.5; c.moveTo(x, Y1 - 6); c.lineTo(x, Y0); }
    for (let k = 1; k <= 3; k++) { const y = Math.round(Y0 - (Y0 - Y1) * k / 4) + 0.5; c.moveTo(X0, y); c.lineTo(X1, y); }
    c.stroke();
    // 馬克士威曲線下的淡色面積（畫在長條後面，長條沒填滿的地方看得到）
    for (let k = 0; k < nsp; k++) {
      if (!isFinite(Ts[k])) continue;
      const m = speciesOf(k).m, col = spColor(k);
      const ag = c.createLinearGradient(0, Y1, 0, Y0);
      ag.addColorStop(0, alpha(col, colors.dark ? 0.16 : 0.12));
      ag.addColorStop(1, alpha(col, 0.02));
      c.fillStyle = ag;
      c.beginPath(); c.moveTo(X0, Y0);
      for (let q = 0; q <= 120; q++) { const v = vax * q / 120; c.lineTo(xOf(v), yOf(G.maxwell(v, Ts[k], m))); }
      c.lineTo(X1, Y0); c.closePath(); c.fill();
    }
    // 長條
    for (let k = nsp - 1; k >= 0; k--) {
      const col = spColor(k), d = dens[k];
      // 一個漸層用於整組長條：越高的長條頂端顏色越濃
      const g = c.createLinearGradient(0, Y1, 0, Y0);
      g.addColorStop(0, alpha(shade(col, colors.dark ? 0.1 : 0.05), k === 1 ? 0.6 : 0.9));
      g.addColorStop(1, alpha(shade(col, colors.dark ? -0.35 : 0.5), k === 1 ? 0.35 : 0.55));
      for (let b = 0; b < nbins; b++) {
        if (d[b] <= 0) continue;
        const xa = xOf(b * bw) + 0.8, xb = xOf((b + 1) * bw) - 0.8, y = yOf(d[b]);
        c.fillStyle = g;
        roundRect(c, xa, y, xb - xa, Y0 - y, Math.min(2.5, (xb - xa) / 2));
        c.fill();
        c.fillStyle = alpha(shade(col, colors.dark ? 0.45 : -0.15), 0.9);
        c.fillRect(xa, y, xb - xa, 1);
        if (xb - xa > 4 && Y0 - y > 3) {
          c.fillStyle = alpha('#ffffff', colors.dark ? 0.1 : 0.35);
          c.fillRect(xa, y + 1, 1, Y0 - y - 1);
        }
      }
    }
    // 馬克士威曲線（兩層線條）
    for (let k = 0; k < nsp; k++) {
      if (!isFinite(Ts[k])) continue;
      const m = speciesOf(k).m, col = spColor(k), list = [];
      for (let q = 0; q <= 120; q++) { const v = vax * q / 120; list.push([xOf(v), yOf(G.maxwell(v, Ts[k], m))]); }
      c.lineCap = 'round'; c.lineJoin = 'round';
      c.strokeStyle = alpha(col, colors.dark ? 0.22 : 0.16);
      c.lineWidth = 7;
      c.beginPath(); list.forEach(function (p, i) { if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }); c.stroke();
      c.strokeStyle = shade(col, colors.dark ? 0.3 : -0.35);
      c.lineWidth = 2.6;
      c.beginPath(); list.forEach(function (p, i) { if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }); c.stroke();
      c.strokeStyle = alpha(shade(col, 0.7), 0.7);
      c.lineWidth = 0.9;
      c.beginPath(); list.forEach(function (p, i) { if (i) c.lineTo(p[0], p[1] - 0.6); else c.moveTo(p[0], p[1] - 0.6); }); c.stroke();
    }
    // 特徵速率：單一氣體標 v_p、v̄、v_rms；混合時標兩種的 v_rms
    const marks = [];
    if (nsp === 1 && isFinite(Ts[0])) {
      const m = speciesOf(0).m;
      marks.push({ v: G.vprob(Ts[0], m), sub: 'p', bar: false, col: colors.text });
      marks.push({ v: G.vmean(Ts[0], m), sub: '', bar: true, col: colors.text });
      marks.push({ v: G.vrms(Ts[0], m), sub: 'rms', bar: false, col: colors.text });
    } else {
      for (let k = 0; k < nsp; k++) if (isFinite(Ts[k])) marks.push({ v: G.vrms(Ts[k], speciesOf(k).m), sub: 'rms', bar: false, col: shade(spColor(k), colors.dark ? 0.3 : -0.3), sp: G.SPECIES[k === 0 ? state.spA : state.spB].id });
    }
    // 標籤排成一列，彼此不重疊；用細引線連到各自的虛線
    const labs = [];
    marks.forEach(function (mk) {
      const x = xOf(mk.v);
      if (x > X1) return;
      c.strokeStyle = alpha(mk.col, 0.55);
      c.setLineDash([3, 3]);
      c.lineWidth = 1;
      c.beginPath(); c.moveTo(Math.round(x) + 0.5, Y0); c.lineTo(Math.round(x) + 0.5, Y1 + 4); c.stroke();
      c.setLineDash([]);
      labs.push({ x: x, lx: x, w: vLabelWidth(c, mk.sub, mk.sp), mk: mk });
    });
    for (let q = 1; q < labs.length; q++) {
      const prev = labs[q - 1], cur = labs[q];
      const minX = prev.lx + prev.w / 2 + cur.w / 2 + 6;
      if (cur.lx < minX) cur.lx = minX;
    }
    if (labs.length) {
      const last = labs[labs.length - 1], over = last.lx + last.w / 2 - (X1 - 2);
      if (over > 0) labs.forEach(function (l) { l.lx -= over; });
    }
    const ly = Y1 - 12;
    labs.forEach(function (l) {
      c.strokeStyle = alpha(l.mk.col, 0.55);
      c.lineWidth = 1;
      c.beginPath(); c.moveTo(l.lx, ly + 9); c.lineTo(Math.round(l.x) + 0.5, Y1 + 4); c.stroke();
      vLabel(c, l.lx, ly, l.mk.sub, l.mk.bar, l.mk.col, l.mk.sp);
    });
    // 橫軸
    c.strokeStyle = alpha(colors.muted, 0.8);
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(X0, Math.round(Y0) + 0.5); c.lineTo(X1, Math.round(Y0) + 0.5); c.stroke();
    // 此刻每個分子的速率（地毯圖）
    for (let i = 0; i < gas.n; i++) {
      const v = Math.sqrt(gas.vx[i] * gas.vx[i] + gas.vy[i] * gas.vy[i] + gas.vz[i] * gas.vz[i]);
      const x = xOf(v);
      if (x > X1) continue;
      c.strokeStyle = alpha(spColor(gas.s[i]), 0.55);
      c.beginPath(); c.moveTo(x, Y0 + 3); c.lineTo(x, Y0 + 9); c.stroke();
    }
    const axTitle = T('速率 v (m/s)', 'speed v (m/s)');
    c.font = '600 11px system-ui, sans-serif';
    const titleW = c.measureText(axTitle).width;
    c.fillStyle = colors.muted;
    c.textAlign = 'right'; c.textBaseline = 'top';
    c.fillText(axTitle, X1, Y0 + 12);
    c.font = '11px system-ui, sans-serif';
    c.textAlign = 'center';
    for (let v = 0; v < histVax + 1e-6; v += step) {
      const x = Math.max(X0 + 6, xOf(v / 1000)), lw = c.measureText(num(v, 0)).width;
      if (x + lw / 2 > X1 - titleW - 6) continue;
      c.fillText(num(v, 0), x, Y0 + 12);
    }
    // 右上：氣體與（直方圖資料的）溫度
    c.textAlign = 'right';
    let rx = X1 - 2;
    for (let k = nsp - 1; k >= 0; k--) {
      const sp = speciesOf(k);
      const txt = T(sp.zh, sp.id) + ' ' + (isFinite(Ts[k]) ? num(Ts[k], 0) + ' K' : '');
      const r = pill(c, txt, rx, 13, shade(spColor(k), colors.dark ? 0.3 : -0.3), '700 ' + (small ? 11 : 12) + 'px system-ui, sans-serif', 0.85);
      if (LD) LD.ball(c, r.x - 4, 13, 4.2, spColor(k), { shadow: false, glow: 0 });
      else { c.fillStyle = spColor(k); c.beginPath(); c.arc(r.x - 4, 13, 4, 0, Math.PI * 2); c.fill(); }
      rx = r.x - 16;
    }
  }
  function vLabelWidth(c, sub, prefix) {
    c.font = 'italic 600 12px system-ui, sans-serif';
    let w = c.measureText('v').width;
    c.font = '600 9px system-ui, sans-serif';
    if (sub) w += c.measureText(sub).width;
    c.font = '600 10px system-ui, sans-serif';
    if (prefix) w += c.measureText(prefix + ' ').width;
    return w + 11;
  }
  /** 畫「v 加下標」的標籤；bar 為 true 時在 v 上方畫一橫（平均速率） */
  function vLabel(c, x, y, sub, bar, col, prefix) {
    const f1 = 'italic 600 12px system-ui, sans-serif', f2 = '600 9px system-ui, sans-serif';
    c.font = f1;
    const w1 = c.measureText('v').width;
    c.font = f2;
    const w2 = sub ? c.measureText(sub).width : 0;
    const pre = prefix ? prefix + ' ' : '';
    c.font = '600 10px system-ui, sans-serif';
    const w0 = pre ? c.measureText(pre).width : 0;
    const tw = w0 + w1 + w2 + 1;
    c.fillStyle = alpha(colors['canvas-bg'], 0.85);
    roundRect(c, x - tw / 2 - 5, y - 9, tw + 10, 18, 9); c.fill();
    let cx = x - tw / 2;
    c.fillStyle = col; c.textBaseline = 'middle'; c.textAlign = 'left';
    if (pre) { c.font = '600 10px system-ui, sans-serif'; c.fillText(pre, cx, y + 0.5); cx += w0; }
    c.font = f1; c.fillText('v', cx, y + 0.5);
    if (bar) { c.fillRect(cx + 0.5, y - 6.5, w1 + 0.5, 1.2); }
    cx += w1 + 0.5;
    if (sub) { c.font = f2; c.fillText(sub, cx, y + 4); }
  }

  /** 過程圖：P–V、P–T 或 V–T */
  let pvScale = { P: 0, T: 0 };
  function drawPV() {
    const c = pctx, w = pw, h = ph;
    chartBg(c, w, h);
    const small = w < 360;
    const pad = { l: small ? 40 : 46, r: 14, t: 16, b: 36 };
    const X0 = pad.l, X1 = w - pad.r, Y0 = h - pad.b, Y1 = pad.t;
    const g = state.graph;
    const cur = lastShort && lastShort.t > 8 ? { V: lastShort.V, P: kPa(lastShort.P), T: lastShort.T } : { V: Vnow(), P: kPa(G.idealP(gas.n, Tgas(), Vnow())), T: Tgas() };
    // 縱軸與橫軸範圍
    let Pmax = cur.P, Tmax = Math.max(cur.T, state.Tset);
    pts.forEach(function (p) { if (p.P > Pmax) Pmax = p.P; if (p.T > Tmax) Tmax = p.T; });
    const Pax = niceUp(Pmax * 1.12), Tax = niceUp(Math.max(200, Tmax * 1.1)), Vax = 13;
    const xMax = g === 'PV' ? Vax : Tax;
    const yMax = g === 'VT' ? Vax : Pax;
    const xOf = function (v) { return X0 + (X1 - X0) * v / xMax; };
    const yOf = function (v) { return Y0 - (Y0 - Y1) * v / yMax; };
    const xv = function (p) { return g === 'PV' ? p.V / 1000 : p.T; };
    const yv = function (p) { return g === 'VT' ? p.V / 1000 : p.P; };
    // 格線
    const sx = g === 'PV' ? (small ? 4 : 2) : niceStep(xMax / (small ? 4 : 6)), sy = niceStep(yMax / 4);
    c.strokeStyle = alpha(colors.text, 0.07);
    c.lineWidth = 1;
    c.beginPath();
    for (let v = sx; v < xMax + 1e-9; v += sx) { const x = Math.round(xOf(v)) + 0.5; c.moveTo(x, Y1); c.lineTo(x, Y0); }
    for (let v = sy; v < yMax + 1e-9; v += sy) { const y = Math.round(yOf(v)) + 0.5; c.moveTo(X0, y); c.lineTo(X1, y); }
    c.stroke();
    // 可用體積範圍（P–V、V–T）
    c.fillStyle = alpha(colors.text, 0.03);
    if (g === 'PV') c.fillRect(xOf(4), Y1, xOf(12) - xOf(4), Y0 - Y1);
    if (g === 'VT') c.fillRect(X0, yOf(12), X1 - X0, yOf(4) - yOf(12));
    // 座標軸
    c.strokeStyle = alpha(colors.muted, 0.85);
    c.beginPath();
    c.moveTo(X0 + 0.5, Y1 - 4); c.lineTo(X0 + 0.5, Math.round(Y0) + 0.5); c.lineTo(X1 + 4, Math.round(Y0) + 0.5);
    c.stroke();
    c.font = '11px system-ui, sans-serif';
    c.fillStyle = colors.muted;
    c.textAlign = 'center'; c.textBaseline = 'top';
    const dx = Math.abs(sx % 1) > 1e-9 ? 1 : 0, dy = sy < 0.1 ? 2 : Math.abs(sy % 1) > 1e-9 ? 1 : 0;
    for (let v = 0; v < xMax + 1e-9; v += sx) c.fillText(num(v, dx), xOf(v), Y0 + 4);
    c.textAlign = 'right'; c.textBaseline = 'middle';
    for (let v = sy; v < yMax + 1e-9; v += sy) c.fillText(num(v, dy), X0 - 4, yOf(v));
    // 軸名
    const xName = g === 'PV' ? 'V (10³ nm³)' : 'T (K)';
    const yName = g === 'VT' ? 'V (10³ nm³)' : 'P (kPa)';
    c.font = '600 11px system-ui, sans-serif';
    c.textAlign = 'right'; c.textBaseline = 'top';
    c.fillText(xName, X1, Y0 + 18);
    c.textAlign = 'left'; c.textBaseline = 'middle';
    pill(c, yName, X0 + 6, Y1 + 8, colors.muted, '600 11px system-ui, sans-serif', 0.8);

    // 理論曲線
    const Nn = gas.n;
    c.save();
    c.beginPath(); c.rect(X0, Y1 - 2, X1 - X0 + 2, Y0 - Y1 + 2); c.clip();
    c.setLineDash([6, 5]);
    c.lineWidth = 1.6;
    const curve = function (fn, a, b, col) {
      c.strokeStyle = col;
      c.beginPath();
      for (let q = 0; q <= 100; q++) {
        const xx = a + (b - a) * q / 100, yy = fn(xx);
        const X = xOf(xx), Y = yOf(yy);
        if (q) c.lineTo(X, Y); else c.moveTo(X, Y);
      }
      c.stroke();
    };
    if (g === 'PV') {
      const Ti = bathOn() ? state.Tset : cur.T;
      curve(function (v) { return kPa(G.idealP(Nn, Ti, v * 1000)); }, 2.6, Vax, alpha(bathOn() ? colors.accent : colors.muted, bathOn() ? 0.85 : 0.5));
      if (!bathOn() && state.adStart) {
        const a0 = state.adStart;
        curve(function (v) { return G.adiabaticP(a0.P, a0.V / 1000, v); }, 2.6, Vax, alpha(colors['b-thermo'], 0.9));
      }
    } else if (g === 'PT') {
      curve(function (t) { return kPa(G.idealP(Nn, t, cur.V)); }, 0, Tax, alpha(colors['b-optics'], 0.85));
    } else {
      const Pref = state.mode === 'isobaric' ? state.Pset : cur.P;
      curve(function (t) { return G.idealV(Nn, t, fromKPa(Pref)) / 1000; }, 0, Tax, alpha(colors.equi, 0.85));
    }
    c.setLineDash([]);
    // 量測點與路徑
    for (let q = 1; q < pts.length; q++) {
      const a = pts[q - 1], b = pts[q];
      if (a.epoch !== b.epoch) continue;
      c.strokeStyle = alpha(colors[MODE_COLOR[b.mode]], 0.35);
      c.lineWidth = 1;
      c.beginPath(); c.moveTo(xOf(xv(a)), yOf(yv(a))); c.lineTo(xOf(xv(b)), yOf(yv(b))); c.stroke();
    }
    pts.forEach(function (p) {
      c.fillStyle = alpha(colors[MODE_COLOR[p.mode]], 0.7);
      c.beginPath(); c.arc(xOf(xv(p)), yOf(yv(p)), small ? 1.8 : 2.2, 0, Math.PI * 2); c.fill();
    });
    c.restore();
    // 原點（P–T、V–T：外插到絕對零度）
    if (g !== 'PV') {
      c.fillStyle = colors.text;
      c.beginPath(); c.arc(X0, Y0, 2.5, 0, Math.PI * 2); c.fill();
      c.textAlign = 'left';
      pill(c, '0 K', X0 + 6, Y0 - 10, colors.muted, '600 10px system-ui, sans-serif', 0.75);
    }
    // 目前狀態
    const cx = xOf(xv(cur)), cy = yOf(yv(cur));
    if (cx >= X0 - 4 && cx <= X1 + 4 && cy >= Y1 - 4 && cy <= Y0 + 4) {
      const col = colors[MODE_COLOR[state.mode]];
      c.fillStyle = alpha(col, 0.18);
      c.beginPath(); c.arc(cx, cy, 9, 0, Math.PI * 2); c.fill();
      c.strokeStyle = alpha(col, 0.5);
      c.lineWidth = 1;
      c.beginPath(); c.arc(cx, cy, 9, 0, Math.PI * 2); c.stroke();
      if (LD) LD.ball(c, cx, cy, 5, col, { glow: 0, ring: colors['canvas-bg'] });
      else {
        const gg = c.createRadialGradient(cx - 1.6, cy - 1.6, 0.4, cx, cy, 5);
        gg.addColorStop(0, shade(col, 0.6)); gg.addColorStop(1, shade(col, -0.3));
        c.fillStyle = gg;
        c.beginPath(); c.arc(cx, cy, 5, 0, Math.PI * 2); c.fill();
      }
    }
    // 曲線名稱
    c.textAlign = 'right';
    const lf = '600 11px system-ui, sans-serif';
    if (g === 'PV') {
      if (bathOn()) pill(c, T('等溫線 ', 'Isotherm ') + num(state.Tset, 0) + ' K', X1 - 2, Y1 + 8, colors.accent, lf, 0.8);
      else if (state.adStart) pillSup(c, [T('絕熱線 PV', 'Adiabat PV'), '5/3', T(' ＝ 常數', ' = const')], X1 - 2, Y1 + 8, colors['b-thermo'], 11, 0.8);
    } else if (g === 'PT') pill(c, 'P = NkT/V', X1 - 2, Y1 + 8, colors['b-optics'], lf, 0.8);
    else pill(c, 'V = NkT/P', X1 - 2, Y1 + 8, colors.equi, lf, 0.8);
  }

  // ======================= 讀數 =======================
  const lastText = {};
  function setHTML(id, html) {
    if (lastText[id] === html) return;
    lastText[id] = html;
    $(id).innerHTML = html;
  }
  let lastReadoutAt = 0;
  function updateReadout(force) {
    const now = performance.now();
    if (!force && now - lastReadoutAt < 250) return;
    lastReadoutAt = now;
    const s = lastLong && lastLong.t >= 40 ? lastLong : null;
    const cts = G.countBySpecies(gas), V = Vnow();
    const sps = [speciesOf(0), speciesOf(1)];
    const nsp = state.mix ? 2 : 1;
    const Tr = Tref();
    const measuring = T('測量中…', 'Measuring…');
    setHTML('rWin', s ? num(s.t, 0) + ' ps' + (s.Perr > 0 ? '' : '') : (state.moving ? T('活塞移動中', 'Piston moving') : measuring));
    if (s) {
      const P = kPa(s.P), Pe = kPa(s.Perr), Pth = kPa(G.idealP(s.N, s.T, s.V));
      const Z = G.hardSphereZ(s.counts, sps.map(function (q) { return q.d; }), s.V);
      const dev = (P - Pth) / Pth;
      setHTML('rP', num(P, P < 10 ? 3 : 1) + (isFinite(Pe) ? ' ± ' + num(Pe, Pe < 0.1 ? 3 : Pe < 1 ? 2 : 1) : '') + ' kPa'
        + '<small>' + T('與理想氣體相差 ', 'differs from ideal by ') + num(dev * 100, 1) + '%</small>');
      setHTML('rPth', num(Pth, Pth < 10 ? 3 : 1) + ' kPa<small>' + T('用量到的 T = ', 'with measured T = ') + num(s.T, 1) + ' K</small>'
        + (Z - 1 > 0.006 ? '<small>' + T('考慮分子大小 ×Z = ', 'with molecule size ×Z = ') + num(Z, 3) + ' → ' + num(Pth * Z, Pth < 10 ? 3 : 1) + ' kPa</small>' : ''));
      const exactT = !bathOn() && !(s.Terr >= 0.05); // 絕熱、沒有統計誤差：T 由總動能精確算出（活塞靜止時總動能守恆、T 不變；活塞在動時作功、T 會變）
      setHTML('rT', num(s.T, 1) + (isFinite(s.Terr) && !exactT ? ' ± ' + num(s.Terr, 1) : '') + ' K<small>' + (bathOn() ? T('恆溫槽 ', 'heat bath ') + num(gas.bath.T, 1) + ' K' : exactT ? (state.moving ? T('絕熱：活塞在動，對氣體作功（或氣體對外作功），溫度跟著變', 'adiabatic: the moving piston does work on the gas (or the gas on it), so T changes') : T('絕熱、活塞靜止時：總動能守恆，溫度保持不變', 'adiabatic, piston at rest: the total kinetic energy is conserved, so T stays fixed')) : T('絕熱（沒有恆溫槽）', 'adiabatic (no heat bath)')) + '</small>');
      let ke = '', vr = '';
      for (let k = 0; k < nsp; k++) {
        if (!cts[k]) continue;
        const lab = state.mix ? T(sps[k].zh, sps[k].id) + ' ' : '';
        ke += (ke ? '<br>' : '') + lab + sciFixed(G.toSI.energy(s.KE[k]), -21, 2) + ' J';
        vr += (vr ? '<br>' : '') + lab + num(G.toSI.speed(s.vrms[k]), 0) + ' m/s';
      }
      const keTh = G.toSI.energy(G.meanKE(Tr));
      ke += '<small>' + (bathOn() ? T('(3/2)kT（恆溫槽）= ', '(3/2)kT (bath) = ') : '(3/2)kT = ') + sciFixed(keTh, -21, 2) + ' J</small>';
      let vth = '';
      for (let k = 0; k < nsp; k++) if (cts[k]) vth += (vth ? T('、', ', ') : '') + (state.mix ? T(sps[k].zh, sps[k].id) + ' ' : '') + num(G.toSI.speed(G.vrms(Tr, sps[k].m)), 0);
      vr += '<small>√(3kT/m) = ' + vth + ' m/s</small>';
      if (state.mix && cts[0] && cts[1]) vr += '<small>' + T('比值 ', 'ratio ') + num(s.vrms[0] / s.vrms[1], 3) + T('（理論 √(m<sub>2</sub>/m<sub>1</sub>) = ', ' (theory √(m<sub>2</sub>/m<sub>1</sub>) = ') + num(Math.sqrt(sps[1].m / sps[0].m), 3) + T('）', ')') + '</small>';
      setHTML('rKE', ke);
      setHTML('rV2', vr);
      // 撞牆次數：理論 ¼ n v̄ A
      let flux = 0;
      for (let k = 0; k < nsp; k++) if (cts[k]) flux += G.wallFlux(cts[k] / s.V, G.vmean(s.Ts[k], sps[k].m));
      setHTML('rHit', num(s.hitRate, 1) + T(' 次/ps', ' per ps') + '<small>' + T('理論 ¼ n', 'theory ¼ n') + '<span class="ovl">v</span>A = ' + num(flux * s.A, 1) + T(' 次/ps', ' per ps') + '</small>');
      const perMol = s.collRate > 0 ? s.N / (2 * s.collRate) : Infinity;
      let vbar = 0;
      for (let k = 0; k < nsp; k++) if (cts[k]) vbar += cts[k] * G.vmean(s.Ts[k], sps[k].m);
      vbar /= s.N;
      setHTML('rColl', num(s.collRate, 2) + T(' 次/ps', ' per ps') + (isFinite(perMol) ? '<small>' + T('每個分子平均每 ', 'each molecule about every ') + num(perMol, 0) + T(' ps 碰一次；平均自由徑約 ', ' ps; mean free path ≈ ') + num(vbar * perMol, 0) + ' nm</small>' : ''));
    } else {
      ['rP', 'rPth', 'rKE', 'rV2', 'rHit', 'rColl'].forEach(function (id) { setHTML(id, '—'); });
      setHTML('rT', num(G.temperature(gas), 0) + ' K<small>' + T('瞬間值', 'instantaneous') + '</small>');
    }
    setHTML('rV', num(V, 0) + ' nm<sup>3</sup><small>= ' + sci(V * 1e-27, 2) + ' m<sup>3</sup></small>');
    setHTML('rn', sci(G.moles(gas.n), 2) + ' mol<small>N = ' + gas.n + (state.mix ? T('（', ' (') + T(sps[0].zh, sps[0].id) + ' ' + cts[0] + T('、', ', ') + T(sps[1].zh, sps[1].id) + ' ' + cts[1] + T('）', ')') : '') + '</small>');
    const U = G.kinetic(gas).total;
    const dU = G.toSI.energy(U - energy.U0), Q = G.toSI.energy(energy.Q), W = G.toSI.energy(energy.W);
    setHTML('rQ', sciFixed(Q, -19, 2) + ' J');
    setHTML('rW', sciFixed(W, -19, 2) + ' J');
    const okFirst = Math.abs(dU - Q - W) <= 1e-9 * Math.max(Math.abs(dU), Math.abs(Q), Math.abs(W), 1e-30);
    setHTML('rU', sciFixed(dU, -19, 2) + ' J<small>Q + W = ' + sciFixed(Q + W, -19, 2) + ' J' + (okFirst ? ' <span class="good">✓</span>' : '') + '</small>');
  }

  // ======================= 音效 =======================
  function sound() {
    const S = window.LabSound;
    return S && S.enabled() ? S : null;
  }
  let tickCount = 0, Jref = 0;
  /** 分子撞擊活塞的「滴答」聲：撞得越頻繁越密，撞得越猛越響（主要頻率 1.8–2.6 kHz） */
  function tickSounds(hits, dtReal, rate) {
    const S = sound();
    if (!S || !hits.length) return;
    const k = Math.max(1, Math.round(2 * rate / BASE_RATE)); // 1× 時每兩次撞擊響一聲，快轉時按比例抽樣
    let played = 0;
    for (let i = 0; i < hits.length && played < 3; i++) {
      tickCount++;
      if (tickCount % k) continue;
      const h = hits[i];
      const rel = Jref > 0 ? h.J / Jref : 1;
      const gain = Math.max(0.06, Math.min(0.42, 0.1 + 0.16 * rel));
      const delay = dtReal * i / hits.length;
      S.tone({ freq: 1800 + 700 * Math.random(), dur: 0.016, type: 'triangle', gain: gain, delay: delay });
      S.noise({ dur: 0.008, gain: gain * 0.6, filter: 4200, q: 1.4, delay: delay });
      played++;
    }
  }

  // ======================= 動畫 =======================
  function curRate() {
    let r = BASE_RATE * SPEEDS[state.speed];
    if (state.ff) r = Math.max(r, Math.min(FF_MAX, FF_VIS / Math.max(1e-6, gas.piston.vmax)));
    return r;
  }
  let lastT = 0, loopOn = false, lastGasT = 0;
  function tick(tNow) {
    if (!state.running) { loopOn = false; return; }
    const dtReal = Math.min((tNow - lastT) / 1000, 1 / 30);
    lastT = tNow;
    step(dtReal);
    drawAll(false);
    requestAnimationFrame(tick);
  }
  function step(dtReal) {
    gas.piston.vmax = pistonVmax();
    // 等壓控制：壓力的移動平均時間約為分子來回容器三趟（分子越慢、取樣越久）
    gas.piston.tau = 60 / G.vmean(Math.max(30, G.temperature(gas)), heavyMass());
    // 活塞是否在移動（決定快轉、量測是否重新開始）
    const wasMoving = state.moving;
    if (gas.piston.mode === 'target') {
      state.moving = Math.abs(Math.max(LX_MIN, Math.min(LX_MAX, gas.piston.target)) - gas.Lx) > 1e-7;
      state.ff = state.moving;
    } else {
      // 等壓：活塞速度（有正負）的平均夠大才算在移動，避免控制器的小抖動造成快轉
      if (state.ff && Math.abs(state.ffEma) < 0.15) state.ff = false;
      else if (!state.ff && Math.abs(state.ffEma) > 0.35) state.ff = true;
      if (gas.bath.T !== state.Tset) state.ff = true; // 恆溫槽溫度緩慢改變中
      state.moving = state.ff;
    }
    if (state.moving) markChange(settleAfterMove());
    else if (wasMoving) markChange(settleAfterMove());
    const rate = curRate();
    let left = dtReal * rate;
    const t0 = performance.now();
    state.lag = false;
    const t0gas = gas.t;
    while (left > 1e-9) {
      const chunk = Math.min(left, 2);
      if (gas.bath.T !== state.Tset) rampBath(chunk);
      G.advance(gas, chunk);
      if (gas.piston.mode === 'pressure') state.ffEma += Math.min(1, chunk / 200) * (gas.u / Math.max(1e-9, gas.piston.vmax) - state.ffEma);
      harvest(chunk);
      left -= chunk;
      if (performance.now() - t0 > BUDGET_MS && left > 1e-9) { state.lag = true; break; }
    }
    lastShort = meterShort.stats(40);
    if (meterLong.blocks.length) lastLong = meterLong.stats(1500);
    if (wantReport && !state.moving && lastLong && lastLong.t >= 80) { wantReport = false; reportMeasure(); }
    // 活塞撞擊：音效與閃光
    const hits = gas.pistonHits;
    if (hits.length) {
      let sJ = 0;
      hits.forEach(function (h) { sJ += h.J; });
      const mJ = sJ / hits.length;
      Jref = Jref ? Jref + 0.05 * (mJ - Jref) : mJ;
      tickSounds(hits, dtReal, rate);
      if (state.show.impacts && !reducedMotion) {
        const now = performance.now(), take = Math.min(hits.length, 4);
        for (let q = hits.length - take; q < hits.length; q++) impacts.push({ y: hits[q].y, z: hits[q].z, k: Math.min(2, hits[q].J / (Jref || hits[q].J)), t0: now });
        if (impacts.length > 40) impacts.splice(0, impacts.length - 40);
      }
      hits.length = 0;
    }
    // 等壓：活塞撞到極限
    state.pistonStop = gas.piston.mode === 'pressure' && (gas.Lx <= LX_MIN + 1e-6 || gas.Lx >= LX_MAX - 1e-6) && Math.abs(kPa(gas.piston.pEma || 0) - state.Pset) / state.Pset > 0.05;
    // 體積滑桿跟著活塞（等壓時）
    if (state.mode === 'isobaric') syncVSlider();
    if (state.mode === 'adiabatic') syncTSlider();
    // 過程圖記點
    const dtSim = gas.t - t0gas;
    pvClock += dtSim;
    if (pvClock >= PV_EVERY && lastShort && lastShort.t >= 20) {
      pvClock = 0;
      pts.push({ V: lastShort.V, P: kPa(lastShort.P), T: lastShort.T, mode: state.mode, epoch: state.epoch });
      if (pts.length > 3000) pts.splice(0, pts.length - 3000);
    }
    state.modeTime[state.mode] += dtSim;
    // 任務事件
    emitClock += dtSim;
    if (emitClock >= 20) { emitClock = 0; emitMeasure(); }
  }
  /**
   * 等壓過程：恆溫槽溫度慢慢改變（每 ps 最多改變 0.35 × 活塞最大速率 ÷ 活塞位置 的比例），
   * 讓活塞跟得上，整個過程都維持在設定的壓力（準靜態）。其他過程恆溫槽溫度立即改變。
   */
  function rampBath(dt) {
    if (state.mode !== 'isobaric') { gas.bath.T = state.Tset; return; }
    const k = Math.exp(0.35 * gas.piston.vmax / gas.Lx * dt);
    const Tb = gas.bath.T;
    gas.bath.T = state.Tset > Tb ? Math.min(state.Tset, Tb * k) : Math.max(state.Tset, Tb / k);
  }
  function settleAfterMove() { return bathOn() ? Math.max(20, settleTime() * 0.6) : 20; }

  function startLoop() {
    if (loopOn) return;
    loopOn = true;
    lastT = performance.now();
    requestAnimationFrame(tick);
  }

  // ======================= 任務事件 =======================
  function emitMeasure() {
    if (!window.LabMission || !state.interacted) return;
    const s = lastLong;
    if (!s || s.t < 60) return;
    const sps = [speciesOf(0), speciesOf(1)];
    const c = s.counts;
    const r4 = meterLong.stats(400);
    window.LabMission.emit('measure', {
      mode: state.mode, epoch: state.epoch, init: state.init, sinceInit: gas.t - state.initAt, t: gas.t,
      N: s.N, nA: c[0], nB: c[1], mix: state.mix && c[1] > 0,
      spA: sps[0].id, spB: state.mix ? sps[1].id : null, mA: sps[0].m, mB: state.mix ? sps[1].m : null,
      V: s.V, Tset: state.Tset, bath: bathOn(),
      T: s.T, Terr: s.Terr, P: kPa(s.P), Perr: kPa(s.Perr), Pth: kPa(G.idealP(s.N, s.T, s.V)), window: s.t,
      vrmsA: G.toSI.speed(s.vrms[0]), vrmsB: c[1] ? G.toSI.speed(s.vrms[1]) : null,
      keA: G.toSI.energy(s.KE[0]), keB: c[1] ? G.toSI.energy(s.KE[1]) : null,
      TA: s.Ts[0], TB: c[1] ? s.Ts[1] : null,
      adStart: state.mode === 'adiabatic' && state.adStart ? { T: state.adStart.T, V: state.adStart.V, P: state.adStart.P, epoch: state.adStart.epoch } : null,
      Wcum: G.toSI.energy(cum.W), Qcum: G.toSI.energy(cum.Q),
      Pset: state.mode === 'isobaric' ? state.Pset : null,
      keA4: G.toSI.energy(r4.KE[0]), keB4: c[1] ? G.toSI.energy(r4.KE[1]) : null,
      modeTime: Object.assign({}, state.modeTime), tChanges: state.tChanges
    });
  }
  /** 使用者操作過控制項（打字輸入的數值也算；程式同步滑桿時不會呼叫） */
  function interacted() { state.interacted = true; }

  // ======================= 介面 =======================
  function setStatus(msg) { $('status').textContent = msg || ''; }

  // ---------- 無障礙：畫布與圖表的文字描述、量測結果播報 ----------
  const MODE_NAME = { isothermal: ['等溫', 'isothermal'], isochoric: ['等容', 'isochoric'], isobaric: ['等壓', 'isobaric'], adiabatic: ['絕熱', 'adiabatic'] };
  function modeName() { return T(MODE_NAME[state.mode][0], MODE_NAME[state.mode][1]); }
  function gasName() {
    const a = speciesOf(0), b = speciesOf(1);
    if (!state.mix) return T(a.zh, a.en.toLowerCase());
    return T(a.zh + '與' + b.zh + '混合', a.en.toLowerCase() + ' and ' + b.en.toLowerCase());
  }
  function canDragPiston() { return state.mode === 'isothermal' || state.mode === 'adiabatic'; }
  /** 畫布的 aria-label（只在離散事件時更新：換過程、換氣體、量測完成、換語言） */
  function describeCanvas() {
    if (!gas) return;
    const s = lastLong && lastLong.t >= 40 ? lastLong : null;
    const hint = canDragPiston()
      ? T('按 Tab 選到畫布後，用左右方向鍵移動活塞改變體積，Shift 加方向鍵移動較多。', 'Focus the canvas and use the left and right arrow keys to move the piston and change the volume; hold Shift for bigger steps.')
      : state.mode === 'isochoric' ? T('等容過程：活塞固定。', 'Isochoric process: the piston is locked.') : T('等壓過程：活塞自動移動、維持壓力。', 'Isobaric process: the piston moves by itself to hold the pressure.');
    cv.setAttribute('aria-label', T('理想氣體模擬畫布（', 'Ideal gas simulation canvas (') + modeName() + T('過程）：', ' process): ')
      + gas.n + T(' 個原子（' + gasName() + '）在立體玻璃容器中，右側是活塞；', ' atoms (' + gasName() + ') in a 3D glass container with a piston on the right; ')
      + T('體積 ', 'volume ') + num(Vnow(), 0) + T(' 立方奈米、溫度 ', ' cubic nanometres, temperature ') + num(s ? s.T : Tref(), 0) + ' K'
      + (s ? T('、量到的壓力 ', ', measured pressure ') + num(kPa(s.P), kPa(s.P) < 10 ? 2 : 1) + ' kPa' : '') + T('。', '. ') + hint);
  }
  /** 兩張圖表的 aria-label（role="img"） */
  function describeCharts() {
    if (!gas) return;
    const nsp = state.mix ? 2 : 1;
    let h = T('分子速率分布直方圖與馬克士威曲線', 'Histogram of molecular speeds with the Maxwell curve');
    const parts = [];
    for (let k = 0; k < nsp; k++) {
      const Tk = histT(k), sp = speciesOf(k);
      if (!isFinite(Tk)) continue;
      parts.push(T(sp.zh, sp.en) + ' ' + num(Tk, 0) + ' K' + T('：最可能速率 ', ': most probable speed ') + num(G.toSI.speed(G.vprob(Tk, sp.m)), 0)
        + T(' m/s、方均根速率 ', ' m/s, rms speed ') + num(G.toSI.speed(G.vrms(Tk, sp.m)), 0) + ' m/s');
    }
    if (parts.length) h += T('。', '. ') + parts.join(T('；', '; ')) + T('。', '.');
    hc.setAttribute('aria-label', h);
    const gname = { PV: 'P–V', PT: 'P–T', VT: 'V–T' }[state.graph];
    const s = lastShort && lastShort.t > 8 ? lastShort : null;
    let pv = T('過程圖（', 'Process graph (') + gname + T('）：已記錄 ', '): ') + pts.length + T(' 個量測點', ' measured points');
    if (s) pv += T('；目前 V = ', '; now V = ') + num(s.V, 0) + T(' 立方奈米、P = ', ' cubic nanometres, P = ') + num(kPa(s.P), kPa(s.P) < 10 ? 2 : 1) + ' kPa' + T('、T = ', ', T = ') + num(s.T, 0) + ' K';
    pv += T('。虛線是理論曲線', '. The dashed line is the theory curve') + (state.graph === 'PV' ? (bathOn() ? T('（等溫線 ', ' (isotherm at ') + num(state.Tset, 0) + ' K' + T('）', ')') : state.adStart ? T('（絕熱線）', ' (adiabat)') : '') : state.graph === 'PT' ? ' (P = NkT/V)' : ' (V = NkT/P)') + T('。', '.');
    pc.setAttribute('aria-label', pv);
  }
  /** 使用者改了設定之後，等氣體穩定、長時間平均夠久，就把量測結果寫進 #status（aria-live）一次 */
  let wantReport = false;
  function reportLater() { wantReport = true; }
  function reportMeasure() {
    const s = lastLong;
    const P = kPa(s.P), Pe = kPa(s.Perr), Pth = kPa(G.idealP(s.N, s.T, s.V));
    const d = P < 10 ? 3 : 1;
    setStatus(T('量測結果（', 'Measured (') + modeName() + T('）：V = ', '): V = ') + num(s.V, 0) + T(' 立方奈米、T = ', ' cubic nanometres, T = ') + num(s.T, 1)
      + T(' K，壓力 P = ', ' K, pressure P = ') + num(P, d) + (isFinite(Pe) ? ' ± ' + num(Pe, Pe < 0.1 ? 3 : Pe < 1 ? 2 : 1) : '') + ' kPa'
      + T('；理想氣體 NkT/V = ', '; ideal gas NkT/V = ') + num(Pth, d) + T(' kPa，相差 ', ' kPa, a difference of ') + num((P - Pth) / Pth * 100, 1) + T('%。', '%.'));
    describeCanvas();
    describeCharts();
  }
  function updateButtons() {
    $('play').textContent = state.running ? T('暫停', 'Pause') : T('播放', 'Play');
    MODES.forEach(function (m) { $(MODE_BTN[m]).setAttribute('aria-pressed', String(m === state.mode)); });
    [0, 1, 2].forEach(function (k) { $('sp' + k).setAttribute('aria-pressed', String(k === state.speed)); });
    ['PV', 'PT', 'VT'].forEach(function (k) { $('g' + k).setAttribute('aria-pressed', String(k === state.graph)); });
  }
  const MODE_INFO = {
    isothermal: ['<strong>等溫：</strong>五面器壁接觸恆溫槽，氣體溫度維持在設定值。拖曳活塞或用「體積」滑桿改變體積，觀察 PV 是否保持不變。',
      '<strong>Isothermal:</strong> five walls touch a heat bath that keeps the gas at the set temperature. Drag the piston or use the Volume slider and see whether PV stays the same.'],
    isochoric: ['<strong>等容：</strong>活塞固定不動。改變恆溫槽溫度，氣體被加熱或冷卻，觀察壓力與絕對溫度成正比。',
      '<strong>Isochoric:</strong> the piston is locked. Change the heat-bath temperature to heat or cool the gas and see the pressure follow the absolute temperature.'],
    isobaric: ['<strong>等壓：</strong>活塞自動移動，讓壓力維持在設定值（像活塞上放了固定的砝碼）。改變恆溫槽溫度，觀察體積與絕對溫度成正比。',
      '<strong>Isobaric:</strong> the piston moves by itself to keep the pressure at the set value (like a fixed weight on the piston). Change the heat-bath temperature and see the volume follow the absolute temperature.'],
    adiabatic: ['<strong>絕熱：</strong>器壁不導熱，沒有熱量進出（Q = 0）。移動活塞時，只有活塞對氣體作的功能改變溫度：壓縮升溫、膨脹降溫。',
      '<strong>Adiabatic:</strong> the walls are insulating, so no heat flows in or out (Q = 0). Only the work done by the piston changes the temperature: compression heats the gas and expansion cools it.']
  };
  function updateModeUI() {
    const m = state.mode;
    $('modeInfo').innerHTML = T(MODE_INFO[m][0], MODE_INFO[m][1]);
    const tOff = m === 'adiabatic', vOff = m === 'isochoric' || m === 'isobaric';
    $('T').disabled = tOff;
    $('boxT').classList.toggle('off', tOff);
    $('TNote').hidden = !tOff;
    $('TNote').textContent = T('絕熱時沒有恆溫槽，溫度只能靠活塞作功改變（這裡顯示氣體目前的溫度）。', 'No heat bath in the adiabatic process: only work by the piston changes the temperature (the gas temperature is shown).');
    $('TLabel').textContent = tOff ? T('氣體溫度 T', 'Gas temperature T') : T('恆溫槽溫度 T', 'Heat-bath temperature T');
    $('V').disabled = vOff;
    $('boxV').classList.toggle('off', vOff);
    $('VNote').hidden = !vOff;
    $('VNote').textContent = m === 'isochoric' ? T('等容：活塞固定，體積不能改變。', 'Isochoric: the piston is locked.') : T('等壓：體積由活塞自動調整。', 'Isobaric: the piston sets the volume automatically.');
    $('boxP').hidden = m !== 'isobaric';
    $('lgBath').hidden = m === 'adiabatic';
    updateButtons();
  }

  // 程式改滑桿時不觸發副作用
  let syncing = false;
  function setSlider(el, v) {
    syncing = true;
    if (window.LabNum) window.LabNum.set(el, v);
    else { el.value = v; el.dispatchEvent(new Event('input')); }
    syncing = false;
    refreshOutputs();
  }
  let lastVsync = 0;
  function syncVSlider() {
    const now = performance.now();
    if (now - lastVsync < 120) return;
    lastVsync = now;
    const V = Math.round(Vnow());
    if (Math.abs(val($('V')) - V) >= 1) setSlider($('V'), V);
  }
  let lastTsync = 0;
  function syncTSlider() {
    const now = performance.now();
    if (now - lastTsync < 300) return;
    lastTsync = now;
    const Tk = Math.max(50, Math.min(1000, Math.round(Tgas() * 10) / 10));
    if (Math.abs(val($('T')) - Tk) >= 0.1) setSlider($('T'), Tk);
  }

  function setMode(m) {
    if (m === state.mode) return;
    const prev = state.mode;
    // 離開絕熱：恆溫槽溫度設成氣體目前的溫度，避免突然加熱或冷卻
    const Tnow = Tgas();
    state.mode = m;
    if (prev === 'adiabatic') {
      state.Tset = Math.max(50, Math.min(1000, Math.round(Tnow * 10) / 10));
      setSlider($('T'), state.Tset);
    }
    gas.bath.on = bathOn();
    gas.bath.T = state.Tset;
    if (m === 'isobaric') {
      const s = lastLong && lastLong.t >= 40 ? lastLong : lastShort;
      const P = s ? kPa(s.P) : kPa(G.idealP(gas.n, Tnow, Vnow()));
      state.Pset = Math.round(P * 10) / 10;
      setSlider($('P'), state.Pset);
      gas.piston.mode = 'pressure';
      gas.piston.Pset = fromKPa(state.Pset);
      gas.piston.pEma = s ? s.P : fromKPa(state.Pset);
      state.ffEma = 0; state.ff = false;
    } else {
      gas.piston.mode = 'target';
      gas.piston.target = gas.Lx;
      setSlider($('V'), Math.round(Vnow()));
      gas.piston.target = val($('V')) / AREA;
    }
    if (m === 'adiabatic') recordAdStart();
    else state.adStart = null;
    markChange();
    updateModeUI();
    setStatus(T('已切換到' + MODE_NAME[m][0] + '過程。', 'Switched to the ' + MODE_NAME[m][1] + ' process.'));
    reportLater();
    describeCanvas();
    describeCharts();
    requestDraw();
  }
  /** 進入絕熱過程時的狀態：沒有熱交換時總動能守恆，所以用此刻的動能求 T（精確） */
  function recordAdStart() {
    const Tk = G.temperature(gas);
    state.adStart = { T: Tk, V: Vnow(), P: kPa(G.idealP(gas.n, Tk, Vnow())), epoch: state.epoch };
  }

  // ---------- 氣體選擇按鈕 ----------
  function buildSpeciesButtons() {
    ['A', 'B'].forEach(function (w) {
      const box = $('seg' + w);
      box.innerHTML = '';
      G.SPECIES.forEach(function (sp, k) {
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.k = k;
        b.innerHTML = '<b><span class="sw" style="background:var(--' + SP_COLOR[k] + ')"></span>' + sp.id + '</b><small>' + num(sp.m, sp.m < 10 ? 2 : 1) + ' u</small>';
        b.setAttribute('aria-label', T(sp.zh, sp.en) + ' ' + sp.id + T('，', ', ') + num(sp.m, 2) + ' u');
        b.title = T(sp.zh, sp.en) + T('（', ' (') + num(sp.m, 3) + T(' u）', ' u)');
        b.addEventListener('click', function (ev) {
          interacted(ev);
          if (w === 'A') { if (state.spA === k) return; state.spA = k; if (state.spB === k) state.spB = k === 2 ? 0 : 2; }
          else { if (state.spB === k || state.spA === k) return; state.spB = k; }
          updateSpeciesButtons();
          rebuildGas();
        });
        box.appendChild(b);
      });
    });
    updateSpeciesButtons();
  }
  function updateSpeciesButtons() {
    $('segA').querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(+b.dataset.k === state.spA)); });
    $('segB').querySelectorAll('button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(+b.dataset.k === state.spB));
      b.disabled = +b.dataset.k === state.spA;
    });
    const lg = $('lgA');
    if (lg) lg.style.background = 'var(--' + SP_COLOR[state.spA] + ')';
  }
  /** 換氣體或比例：在目前的溫度下重新放入 */
  function rebuildGas() {
    newGas(bathOn() ? state.Tset : Tgas(), 'maxwell');
    if (state.mode === 'adiabatic') recordAdStart();
    setStatus(T('已在目前的溫度下重新放入氣體。', 'The gas has been refilled at the current temperature.'));
    reportLater();
    describeCanvas();
    describeCharts();
    requestDraw();
  }

  // ---------- 滑桿 ----------
  const elT = $('T'), elV = $('V'), elP = $('P'), elN = $('N'), elF = $('frac');
  // 壓力滑桿：對數刻度 5～1000 kPa
  const P_MIN = 5, P_MAX = 1000;
  if (window.LabNum) window.LabNum.register(elP, {
    toValue: function (pos) { return P_MIN * Math.pow(P_MAX / P_MIN, pos / 1000); },
    toPos: function (v) { return 1000 * Math.log(v / P_MIN) / Math.log(P_MAX / P_MIN); },
    min: P_MIN, max: P_MAX, decimals: 1
  });
  function pVal() { return window.LabNum ? val(elP) : P_MIN * Math.pow(P_MAX / P_MIN, +elP.value / 1000); }
  function refreshOutputs() {
    $('To').textContent = fmtSlider(val(elT), elT) + ' K';
    $('Vo').textContent = fmtSlider(val(elV), elV) + ' nm³';
    const p = pVal();
    $('Po').textContent = num(p, 1) + ' kPa';
    $('No').textContent = fmtSlider(val(elN), elN);
    $('fraco').textContent = fmtSlider(val(elF), elF) + ' %';
  }
  elT.addEventListener('input', function (ev) {
    refreshOutputs();
    if (syncing || state.mode === 'adiabatic') return;
    interacted(ev);
    state.Tset = val(elT);
    state.tChanges++;
    if (state.mode !== 'isobaric') gas.bath.T = state.Tset;
    markChange();
    reportLater();
    requestDraw();
  });
  elV.addEventListener('input', function (ev) {
    refreshOutputs();
    if (syncing) return;
    if (state.mode === 'isochoric' || state.mode === 'isobaric') return;
    interacted(ev);
    gas.piston.target = val(elV) / AREA;
    reportLater();
    if (!state.running) setStatus(T('按「播放」讓活塞移動。', 'Press Play to move the piston.'));
  });
  elP.addEventListener('input', function (ev) {
    refreshOutputs();
    if (syncing) return;
    interacted(ev);
    state.Pset = pVal();
    gas.piston.Pset = fromKPa(state.Pset);
    markChange();
    reportLater();
  });
  elN.addEventListener('input', function (ev) {
    refreshOutputs();
    if (syncing) return;
    interacted(ev);
    state.N = Math.round(val(elN));
    const Tk = bathOn() ? state.Tset : Tgas();
    G.setCounts(gas, counts(), Tk);
    state.epoch++;
    if (state.show.track && gas.track < 0) pickTrack(-1);
    resetEnergy();
    meterShort.reset(); lastShort = null;
    markChange();
    if (state.mode === 'adiabatic') recordAdStart();
    reportLater();
    describeCanvas();
    requestDraw();
  });
  elF.addEventListener('input', function (ev) {
    refreshOutputs();
    if (syncing) return;
    interacted(ev);
    state.fracB = val(elF);
    rebuildGas();
  });
  $('mix').addEventListener('change', function (ev) {
    interacted(ev);
    state.mix = ev.target.checked;
    $('mixBox').hidden = !state.mix;
    rebuildGas();
  });

  $('reinit').addEventListener('click', function (ev) {
    interacted(ev);
    rebuildGas();
  });
  $('same').addEventListener('click', function (ev) {
    interacted(ev);
    G.sameSpeed(gas);
    state.init = 'same';
    state.initAt = gas.t;
    state.epoch++;
    resetHist();
    resetEnergy();
    meterShort.reset(); lastShort = null;
    markChange(5);
    if (state.mode === 'adiabatic') recordAdStart();
    setStatus(bathOn()
      ? T('所有分子現在速率相同。恆溫壁會很快把它們變回馬克士威分布；選「絕熱」可以看只靠分子碰撞的過程。', 'All molecules now have the same speed. The heat-bath walls will soon restore the Maxwell distribution; choose “Adiabatic” to see collisions alone do it.')
      : T('所有分子現在速率相同（總能量不變）。觀察碰撞如何讓速率分布變成馬克士威分布。', 'All molecules now have the same speed (same total energy). Watch collisions spread the speeds into the Maxwell distribution.'));
    if (!state.running) { state.running = true; updateButtons(); startLoop(); }
    describeCharts();
    requestDraw();
  });

  // ---------- 按鈕 ----------
  MODES.forEach(function (m) {
    $(MODE_BTN[m]).addEventListener('click', function (ev) { interacted(ev); setMode(m); });
  });
  [0, 1, 2].forEach(function (k) {
    $('sp' + k).addEventListener('click', function () { state.speed = k; updateButtons(); requestDraw(); });
  });
  ['PV', 'PT', 'VT'].forEach(function (k) {
    $('g' + k).addEventListener('click', function () { state.graph = k; updateButtons(); describeCharts(); requestDraw(); });
  });
  $('play').addEventListener('click', function () {
    state.running = !state.running;
    updateButtons();
    setStatus('');
    if (state.running) startLoop(); else requestDraw();
  });
  // 全部清除：速率分布、過程圖、能量收支與平均重新開始（氣體與滑桿不變）
  $('reset').addEventListener('click', function () {
    resetHist();
    pts = [];
    resetEnergy();
    impacts = [];
    histYmax = 0;
    meterShort.reset(); lastShort = null;
    markChange(5);
    if (gas.track >= 0) gas.trackPts.length = 0;
    if (state.mode === 'adiabatic') recordAdStart();
    setStatus(T('已全部清除；氣體與滑桿設定不變。', 'Everything is cleared; the gas and the slider settings are kept.'));
    describeCharts();
    requestDraw();
  });
  $('showImp').addEventListener('change', function (ev) { state.show.impacts = ev.target.checked; impacts = []; requestDraw(); });
  $('showSpeed').addEventListener('change', function (ev) { state.show.speedColor = ev.target.checked; requestDraw(); });
  $('showTrack').addEventListener('change', function (ev) {
    state.show.track = ev.target.checked;
    if (state.show.track) pickTrack(-1); else { gas.track = -1; gas.trackPts.length = 0; }
    requestDraw();
  });
  function pickTrack(i) {
    if (i < 0) i = Math.floor(Math.random() * gas.n);
    gas.track = i;
    gas.trackPts.length = 0;
    gas.trackPts.push(gas.x[i], gas.y[i], gas.z[i]);
  }
  /** 點選分子：開始追蹤它（2D 與 3D 共用） */
  function followMolecule(i) {
    state.show.track = true;
    $('showTrack').checked = true;
    pickTrack(i);
    requestDraw();
  }

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
    if (ev.detail && ev.detail.name === 'sound') updateSoundButton();
  });

  // ---------- 拖曳活塞、點選分子 ----------
  function pointerPos(ev) {
    const r = cv.getBoundingClientRect();
    return [ev.clientX - r.left, ev.clientY - r.top];
  }
  function distSeg(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
    const t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0;
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  }
  function inPoly(p, list) {
    let inside = false;
    for (let i = 0, j = list.length - 1; i < list.length; j = i++) {
      const xi = list[i][0], yi = list[i][1], xj = list[j][0], yj = list[j][1];
      if (((yi > p[1]) !== (yj > p[1])) && (p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  function overPiston(p, touch) {
    if (!pistonHit) return false;
    const tol = touch ? 22 : 12;
    const k = pistonHit.knob;
    return Math.hypot(p[0] - k[0], p[1] - k[1]) < k[2] + tol || distSeg(p, pistonHit.rodA, pistonHit.rodB) < tol * 0.8 || inPoly(p, pistonHit.face);
  }
  /** 螢幕 x → 拉桿軸線上的世界座標 x（沿軸線二分搜尋） */
  function worldXAt(px) {
    let lo = -5, hi = ROD_END + 5;
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2;
      if (proj(mid, LY / 2, LZ / 2).x < px) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }
  /** 等容、等壓時活塞不能拖曳（在狀態列說明原因）；2D 與 3D 共用 */
  function pistonLocked() {
    if (state.mode === 'isochoric') { setStatus(T('等容過程：活塞固定。要改變體積，請選「等溫」或「絕熱」。', 'Isochoric process: the piston is locked. Choose “Isothermal” or “Adiabatic” to change the volume.')); return true; }
    if (state.mode === 'isobaric') { setStatus(T('等壓過程：活塞由壓力自動控制。', 'Isobaric process: the pressure controls the piston.')); return true; }
    return false;
  }
  function beginPistonDrag(ev) {
    state.dragged = true;
    interacted(ev);
    if (!state.running) { state.running = true; updateButtons(); startLoop(); }
  }
  /** 拖曳活塞到位置 x（nm）：與「體積」滑桿相同，活塞以有限速率移過去（準靜態）；2D 與 3D 共用 */
  function dragPistonTo(x) {
    const V = Math.max(4000, Math.min(12000, Math.round(x * AREA)));
    syncing = true;
    if (window.LabNum) window.LabNum.set(elV, V); else elV.value = V;
    syncing = false;
    refreshOutputs();
    gas.piston.target = val(elV) / AREA;
    reportLater();
  }
  let grabOff = 0;
  cv.addEventListener('pointerdown', function (ev) {
    const p = pointerPos(ev), touch = ev.pointerType === 'touch';
    if (overPiston(p, touch)) {
      if (pistonLocked()) return;
      dragging = true;
      beginPistonDrag(ev);
      grabOff = worldXAt(p[0]) - gas.Lx;
      try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
      cv.classList.add('grabbing');
      ev.preventDefault();
      requestDraw();
      return;
    }
    // 點選分子：追蹤它
    let best = -1, bd = touch ? 18 : 12;
    for (let i = 0; i < gas.n; i++) {
      const d = Math.hypot(sx[i] - p[0], sy[i] - p[1]) - sr[i];
      if (d < bd) { bd = d; best = i; }
    }
    if (best >= 0) followMolecule(best);
  });
  cv.addEventListener('pointermove', function (ev) {
    const p = pointerPos(ev);
    if (dragging) {
      dragPistonTo(worldXAt(p[0]) - grabOff);
      return;
    }
    const over = overPiston(p, ev.pointerType === 'touch') && (state.mode === 'isothermal' || state.mode === 'adiabatic');
    if (over !== hoverPiston) { hoverPiston = over; cv.classList.toggle('grab', over); requestDraw(); }
  });
  function endDrag() {
    if (!dragging) return;
    dragging = false;
    cv.classList.remove('grabbing');
    requestDraw();
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);
  cv.addEventListener('pointerleave', function () { if (!dragging && hoverPiston) { hoverPiston = false; cv.classList.remove('grab'); requestDraw(); } });

  // ======================= 3D 檢視 =======================
  // three.js（vendor/three/）只在切換到 3D 時才以 import() 動態載入；場景程式在 js/ideal-gas-3d.js。
  // 3D 只「讀」同一個氣體（gas）的狀態來畫；模擬仍由上面的 step() 推進，所以 2D 與 3D 的物理、時間完全相同。
  // view3：目前的 3D 檢視（宣告在檔案開頭，切回 2D 時釋放）
  let threeLib = null;   // { THREE, OrbitControls }
  let loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');

  function webglAvailable() {
    try {
      const c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
    } catch (e) { return false; }
  }
  function loadThree() {
    if (threeLib) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js')]).then(function (mods) {
      threeLib = { THREE: mods[0], OrbitControls: mods[1].OrbitControls };
      return threeLib;
    });
  }
  /** 3D 檢視讀取狀態與操作模擬用的介面（只有拖曳活塞、點選分子會改變設定，與 2D 的操作相同） */
  function host3Api() {
    return {
      T: T, num: num, host: host3,
      C: { LY: LY, LZ: LZ, LX_MIN: LX_MIN, LX_MAX: LX_MAX, PT: PT, XH: XH, AREA: AREA },
      state: state, reducedMotion: reducedMotion,
      gas: function () { return gas; },
      colors: function () { return colors; },
      bathOn: bathOn, Tgas: Tgas, speciesOf: speciesOf,
      tempColor: tempColor, mix: mix, shade: shade, spColor: spColor, speedColorAt: speedColorAt,
      impacts: function () { return impacts; },
      hud: function () {
        const gv = gaugeValues(), tc = tempColor(gv.T);
        return { T: gv.T, Tcol: tc === colors.muted ? colors.text : shade(tc, colors.dark ? 0.25 : -0.15), P: gv.P, Pth: gv.Pth,
          time: timeText(), ff: state.ff, lag: state.lag, running: state.running };
      },
      baseLabel: baseLabelInfo, knobHint: knobHintInfo,
      canDrag: function () { return state.mode === 'isothermal' || state.mode === 'adiabatic'; },
      pistonLocked: pistonLocked, beginDrag: beginPistonDrag, dragTo: dragPistonTo, endDrag: requestDraw,
      follow: followMolecule,
      contextLost: function () {
        setView('2d');
        viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 平面。', 'The 3D graphics context was lost, so the view switched back to 2D.');
      }
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
      if (!webglAvailable() || !window.IdealGas3D) { fail3D(); return; }
      viewMsg.textContent = T('正在載入 3D 檢視…', 'Loading the 3D view…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return; // 載入期間已切回 2D
        stage.classList.add('is3d');
        view3 = window.IdealGas3D.create(lib, host3Api());
        viewMsg.textContent = '';
        $('resetCam').hidden = false;
        drawAll();
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
    }
  }
  function fail3D() {
    if (view3) { try { view3.dispose(); } catch (e) { /* 忽略 */ } view3 = null; }
    stage.classList.remove('is3d');
    setPressed('2d');
    $('resetCam').hidden = true;
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 平面。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D view is kept.');
    resize();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });

  // ======================= 啟動 =======================
  readColors();
  buildSpeciesButtons();
  refreshOutputs();
  setSlider(elP, 103.6);
  state.Tset = val(elT);
  newGas(state.Tset, 'maxwell');
  gas.piston.target = val(elV) / AREA;
  gas.Lx = gas.piston.target;
  updateModeUI();

  // ---------- 鍵盤操作：方向鍵移動活塞（與拖曳把手相同：同樣的範圍、同樣以有限速率移過去、同樣的任務事件） ----------
  const KEY_STEP = 200, KEY_BIG = 1000;   // 立方奈米：一般 0.5 nm、Shift 2.5 nm 的活塞位移
  if (window.LabKeys) {
    kb = window.LabKeys.attach(cv, {
      label: T('理想氣體模擬畫布', 'Ideal gas simulation canvas'),
      items: [{
        name: function () { return T('活塞', 'Piston'); },
        move: function (dx, dy, big) {
          const dir = dx || dy;
          if (!dir) return false;
          if (pistonLocked()) return false;     // 等容、等壓：在狀態列說明原因
          beginPistonDrag();
          dragPistonTo((val(elV) + dir * (big ? KEY_BIG : KEY_STEP)) / AREA);
          requestDraw();
          return true;
        },
        describe: function () {
          const V = val(elV);
          const edge = V <= 4000 ? T('（已到最小體積）', ' (smallest volume)') : V >= 12000 ? T('（已到最大體積）', ' (largest volume)') : '';
          return T('活塞：目標體積 ', 'Piston: target volume ') + num(V, 0) + T(' 立方奈米', ' cubic nanometres') + edge
            + T('，活塞位置 ', ', piston position ') + num(V / AREA, 1) + ' nm' + T('。壓力穩定後會在狀態列報告。', '. The pressure is reported once it settles.');
        }
      }],
      onChange: requestDraw
    });
  }

  // ---------- 分享連結：活塞位置與絕熱時的氣體溫度 ----------
  // classroom.js 已記錄滑桿與按鈕；但等容、等壓時「體積」滑桿不能用，絕熱時「溫度」滑桿不能用，
  // 所以另外記下體積與溫度，還原時直接在那個體積與溫度重新放入氣體。
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () {
      return { V: Math.round(canDragPiston() ? val(elV) : Vnow()), T: Math.round(Tgas() * 10) / 10 };
    },
    set: function (o) {
      if (!o || typeof o !== 'object' || !gas) return;
      const V = +o.V, Tk = +o.T;
      const Vt = isFinite(V) ? Math.max(4000, Math.min(12000, V)) : null;
      const Tt = state.mode === 'adiabatic' && isFinite(Tk) ? Math.max(50, Math.min(1000, Tk)) : null;
      if (Vt == null && Tt == null) return;
      if (Vt != null) { gas.Lx = Vt / AREA; gas.piston.target = gas.Lx; }
      newGas(Tt != null ? Tt : (bathOn() ? state.Tset : Tgas()), 'maxwell');
      gas.piston.target = gas.Lx;
      if (Tt != null) {
        // 絕熱沒有恆溫槽：把抽樣出來的速度等比例縮放，讓總動能恰好對應分享時的溫度
        const f = Math.sqrt(Tt / Math.max(1e-9, G.temperature(gas)));
        for (let i = 0; i < gas.n; i++) { gas.vx[i] *= f; gas.vy[i] *= f; gas.vz[i] *= f; }
        resetEnergy();
      }
      if (Vt != null) setSlider(elV, Vt);
      if (state.mode === 'adiabatic') { recordAdStart(); setSlider(elT, Math.round(G.temperature(gas) * 10) / 10); }
      pts = []; histYmax = 0;
      describeCanvas(); describeCharts();
      requestDraw();
    }
  });
  describeCanvas();
  describeCharts();

  function themeChanged() {
    if (LD) LD.refresh();
    readColors(); buildSprites(); if (BOX) buildBackground();
    describeCanvas(); describeCharts();
    if (view3 && view3.active) view3.onTheme();
    requestDraw();
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { if (cv.clientWidth !== lastW) { lastW = cv.clientWidth; resize(); } }).observe(cv);
    new ResizeObserver(function () { resizeCharts(); requestDraw(); }).observe(hc);
  } else window.addEventListener('resize', resize);
  window.addEventListener('resize', function () { resize(); });
  updateSoundButton();
  $('showImp').checked = state.show.impacts;
  resize();
  if (reducedMotion) setStatus(T('已偵測到「減少動態效果」設定：按「播放」開始。', 'Reduced motion is on: press “Play” to start.'));
  if (state.running) startLoop();
})();
