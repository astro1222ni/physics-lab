/* faults-folds.js — 「地質構造：斷層、褶皺與應力」的畫面與互動
 * 物理與幾何全部在 faults-folds-core.js；3D 方塊圖在 faults-folds-3d.js，切換到 3D 時才載入。 */
(function () {
  'use strict';
  const K = window.FaultsCore;
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
  const Z_LO = -2000, Z_HI = { fault: 700, fold: 1600 };
  const QUAKE = 100, SLIP_MAX = 1200;

  // =====================================================================
  // 狀態
  // =====================================================================
  const ids = ['zDepth', 'kH', 'kh', 'lam', 'mu', 'az', 'slip', 'wl', 'amp', 'plunge', 'ero'];
  const el = {}; ids.forEach(function (k) { el[k] = $(k); });
  const state = { mode: 'fault', plane: 0, erode: false, quakes: 0, acted: false };
  let internal = false;
  function setRange(r, v) { internal = true; if (window.LabNum) window.LabNum.set(r, v); else r.value = String(v); internal = false; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  let P = {}, F = null, Fo = null;
  function readSliders() { ids.forEach(function (k) { P[k] = val(el[k]); }); }
  function compute() {
    F = K.fault({ z: P.zDepth, kH: P.kH, kh: P.kh, az: P.az, lam: P.lam, mu: P.mu, plane: state.plane, slip: P.slip, erode: state.erode });
    Fo = K.fold({ lam: P.wl, A: P.amp, plunge: P.plunge, az: P.az, e: P.ero });
    F.kinds = state.mode === 'fault' ? K.faultKinds(F) : [];
    Fo.ex = state.mode === 'fold' ? K.foldExposure(Fo) : { crest: 0, trough: 0, kinds: [0] };
  }

  // =====================================================================
  // 格式
  // =====================================================================
  function num(v, d) {
    if (v == null || !isFinite(v)) return '—';
    let s = v.toFixed(d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  function outNum(v, d) { return Number(v.toFixed(d)).toString().replace('-', '−'); }
  const DIRS_ZH = ['北', '東北', '東', '東南', '南', '西南', '西', '西北'], DIRS_EN = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  function dirName(az) { const i = Math.round((((az % 360) + 360) % 360) / 45) % 8; return T(DIRS_ZH[i], DIRS_EN[i]); }
  function az3(a) { a = Math.round(((a % 360) + 360) % 360) % 360; return (a < 10 ? '00' : a < 100 ? '0' : '') + a + '°'; }
  function layerName(c) {
    if (c === K.BASE) return T('基盤', 'basement');
    if (c === K.DIKE) return T('岩脈', 'dike');
    if (c === K.AIR) return '—';
    return T('第 ' + (c + 1) + ' 層', 'layer ' + (c + 1));
  }
  function regimeName(r) { return r === 'normal' ? T('正斷層', 'Normal fault') : r === 'reverse' ? T('逆斷層', 'Reverse fault') : T('平移斷層', 'Strike-slip fault'); }
  function clsName(c) { return c === 'gentle' ? T('平緩', 'gentle') : c === 'open' ? T('開闊', 'open') : c === 'close' ? T('緊閉', 'close') : T('緊密', 'tight'); }
  function setHTML(id, html) { const e = $(id); if (e && e.innerHTML !== html) e.innerHTML = html; }
  function setOut(inp, txt) { const o = inp.parentNode.querySelector('output'); if (o && o.textContent !== txt && !o.dataset.editing) o.textContent = txt; }

  // =====================================================================
  // 顏色：14 層（新 → 老）、基盤、岩脈
  // =====================================================================
  const LAYERS = ['#f2dfae', '#c7b088', '#e6c592', '#9db497', '#efd3a2', '#b79f7c', '#d8bf8b', '#a2b6a6', '#e5cb9b', '#b09776', '#dac291', '#97ab9a', '#e1c08b', '#a68f74'];
  const BASE_C = '#c79aa0', DIKE_C = '#9f1239';
  let C = {}, PAL = [];
  function hexRGB(h) {
    h = (h || '#000000').trim();
    if (h[0] !== '#') { const m = /(\d+)\D+(\d+)\D+(\d+)/.exec(h); return m ? [+m[1], +m[2], +m[3]] : [0, 0, 0]; }
    if (h.length === 4) h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  }
  function layerColor(c) { return c === K.BASE ? BASE_C : c === K.DIKE ? (D.dark ? '#e11d48' : DIKE_C) : LAYERS[c] || '#888888'; }
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--text', '--muted', '--border', '--accent', '--surface', '--ff-s1', '--ff-s3', '--ff-fault', '--ff-env', '--ff-sky', '--ff-dike']
      .forEach(function (k) { C[k.slice(2)] = cs.getPropertyValue(k).trim(); });
    PAL = [];
    for (let c = 0; c <= K.DIKE; c++) {
      const rgb = hexRGB(layerColor(c)), k = D.dark && c !== K.DIKE ? 0.78 : 1;
      PAL[c] = [rgb[0] * k, rgb[1] * k, rgb[2] * k];
    }
    buildLegend();
  }
  function buildLegend() {
    let h = '<span>' + T('新', 'young') + '</span>';
    for (let i = 0; i < K.NL; i++) h += '<span><i style="background:' + layerColor(i) + '"></i>' + (i + 1) + '</span>';
    h += '<span>' + T('老', 'old') + '</span><span><i style="background:' + BASE_C + '"></i>' + T('基盤', 'basement') + '</span>';
    h += '<span><i style="background:' + layerColor(K.DIKE) + '"></i>' + T('岩脈（比所有地層年輕）', 'dike (younger than every layer)') + '</span>';
    const L = $('legend'); if (L.innerHTML !== h) L.innerHTML = h;
  }

  // =====================================================================
  // 主畫布：剖面＋地質圖
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
  const MG = 26;   // 地圖四周放應力箭頭的邊距
  function wantHeight(W) {
    const wide = W >= 700, zr = Z_HI[state.mode] - Z_LO;
    const sw = wide ? Math.round(W * 0.56) : W;
    const secH = 42 + (sw - 54) / (2 * K.L) * zr;
    const mw = wide ? W - sw - 18 : W;
    const mapH = 30 + 2 * MG + Math.min(wide ? 520 : 440, mw - 2 * MG) + 6;
    return Math.ceil(wide ? Math.max(secH, mapH) : secH + 18 + mapH);
  }
  function resizeCv() {
    const W = cv.clientWidth || 300, h = wantHeight(W) + 'px';
    if (cv.style.height !== h) cv.style.height = h;
    cvSize = fit(cv, ctx); grSize = fit(gr, gtx); imgKey = {}; requestDraw();
  }
  function layout() {
    const W = cvSize.w, H = cvSize.h, wide = W >= 700, gap = 18;
    let sec, map;
    if (wide) { const sw = Math.round(W * 0.56); sec = { x: 0, y: 0, w: sw, h: H }; map = { x: sw + gap, y: 0, w: W - sw - gap, h: H }; }
    else { const sh = Math.round(42 + (W - 54) / (2 * K.L) * (Z_HI[state.mode] - Z_LO)); sec = { x: 0, y: 0, w: W, h: sh }; map = { x: 0, y: sh + gap, w: W, h: H - sh - gap }; }
    // 剖面：等比例（1:1，沒有垂直誇大）
    const zhi = Z_HI[state.mode], ml = 46, mr = 8, mt = 30, mb = 12;
    const k = Math.min((sec.w - ml - mr) / (2 * K.L), (sec.h - mt - mb) / (zhi - Z_LO));
    const sw = 2 * K.L * k, sh = (zhi - Z_LO) * k;
    const sx = sec.x + ml + (sec.w - ml - mr - sw) / 2, sy = sec.y + mt + (sec.h - mt - mb - sh) / 2;
    // 地圖：正方形
    const msz = Math.min(map.w - 2 * MG, map.h - 36 - 2 * MG), mx = map.x + (map.w - msz) / 2, my = map.y + 30 + MG + (wide ? (map.h - 36 - 2 * MG - msz) / 2 : 0);
    return { W: W, H: H, wide: wide, sec: sec, map: map, zhi: zhi,
      S: { x: sx, y: sy, w: sw, h: sh, k: k, X: function (s) { return sx + (s + K.L) * k; }, Y: function (z) { return sy + (zhi - z) * k; } },
      M: { x: mx, y: my, s: msz, X: function (x) { return mx + (x + K.L) / (2 * K.L) * msz; }, Y: function (y) { return my + (K.L - y) / (2 * K.L) * msz; } } };
  }
  // 剖面所在的平面：斷層模式垂直於走向（沿走向偏 300 m，避開岩脈正中）；褶皺模式垂直於褶皺軸
  function secFrame() {
    if (state.mode === 'fault') {
      const pl = F.pl, h = pl.hd;
      return { o: [pl.sv[0] * -300, pl.sv[1] * -300, 0], h: h, look: pl.strike };
    }
    return { o: [0, 0, 0], h: Fo.eH, look: Fo.axisTrend + 180 };
  }
  function codeAt(x, y, z) { return state.mode === 'fault' ? K.faultLayerAt(F, x, y, z) : K.foldLayerAt(Fo, x, y, z); }
  function mapCode(x, y) {
    if (state.mode === 'fold') return K.foldLayerAt(Fo, x, y, K.foldTop(Fo, x, y) - 0.5);
    if (F.erode) return K.faultLayerAt(F, x, y, F.e - 0.5);
    const a = Math.max(0, F.u[2]), b = Math.min(0, F.u[2]);
    const c = K.faultLayerAt(F, x, y, a - 0.5);
    return c !== K.AIR ? c : K.faultLayerAt(F, x, y, b - 0.5);
  }
  function mapLow(x, y) {
    if (state.mode === 'fold' || F.erode || Math.abs(F.u[2]) < 1) return false;
    return K.faultLayerAt(F, x, y, Math.max(0, F.u[2]) - 0.5) === K.AIR;
  }
  // 逐點上色的影像（相同狀態不重算）
  let imgKey = {}, imgs = {};
  function stateKey() {
    return [state.mode, P.zDepth, P.kH, P.kh, P.lam, P.mu, P.az, P.slip, P.wl, P.amp, P.plunge, P.ero, state.plane, state.erode, D.dark ? 1 : 0].join('|');
  }
  function raster(name, w, h, fn) {
    const dpr = Math.min(1.5, cvSize.dpr), pw = Math.max(1, Math.round(w * dpr)), ph = Math.max(1, Math.round(h * dpr));
    const key = stateKey() + '|' + pw + 'x' + ph;
    if (imgKey[name] === key) return imgs[name];
    const c = imgs[name] || document.createElement('canvas');
    c.width = pw; c.height = ph;
    const g = c.getContext('2d'), id = g.createImageData(pw, ph), d = id.data;
    const codes = new Int16Array(pw * ph);
    for (let j = 0; j < ph; j++) for (let i = 0; i < pw; i++) codes[j * pw + i] = fn((i + 0.5) / pw, (j + 0.5) / ph);
    for (let j = 0; j < ph; j++) for (let i = 0; i < pw; i++) {
      const q = j * pw + i, c0 = codes[q], o = q * 4;
      if (c0 === K.AIR) { d[o + 3] = 0; continue; }
      const col = PAL[c0 & 0xff] || PAL[0];
      let k = 1;
      if ((i > 0 && codes[q - 1] !== c0 && codes[q - 1] !== K.AIR) || (j > 0 && codes[q - pw] !== c0 && codes[q - pw] !== K.AIR)) k = 0.72;
      if (c0 & 0x100) k *= 0.86;   // 地圖上較低的那一塊稍微暗一點
      d[o] = col[0] * k; d[o + 1] = col[1] * k; d[o + 2] = col[2] * k; d[o + 3] = 255;
    }
    g.putImageData(id, 0, 0);
    imgs[name] = c; imgKey[name] = key;
    return c;
  }
  function drawMain() {
    if (!cvSize || !F) return;
    const Ly = layout(), g = ctx, W = Ly.W, H = Ly.H, fs = Ly.wide ? 11.5 : 10.5;
    g.clearRect(0, 0, W, H);
    g.fillStyle = C['canvas-bg']; g.fillRect(0, 0, W, H);
    g.save();
    if (shake > 0 && !reducedMotion) g.translate((Math.random() - 0.5) * 6 * shake, (Math.random() - 0.5) * 4 * shake);
    drawSection(g, Ly, fs);
    drawMap(g, Ly, fs);
    g.restore();
  }
  function drawSection(g, Ly, fs) {
    const S = Ly.S, fr = secFrame(), zhi = Ly.zhi;
    // 天空
    const sky = g.createLinearGradient(0, S.y, 0, S.Y(0));
    sky.addColorStop(0, D.alpha(C['ff-sky'], 0.95)); sky.addColorStop(1, D.alpha(C['ff-sky'], 0.35));
    g.fillStyle = sky; g.fillRect(S.x, S.y, S.w, S.h);
    const img = raster('sec', S.w, S.h, function (u, v) {
      const s = -K.L + u * 2 * K.L, z = zhi - v * (zhi - Z_LO);
      return codeAt(fr.o[0] + s * fr.h[0], fr.o[1] + s * fr.h[1], z);
    });
    g.imageSmoothingEnabled = true;
    g.drawImage(img, S.x, S.y, S.w, S.h);
    g.strokeStyle = D.alpha(C.text, 0.35); g.lineWidth = 1; g.strokeRect(Math.round(S.x) + 0.5, Math.round(S.y) + 0.5, Math.round(S.w), Math.round(S.h));
    // 深度刻度
    for (let z = Math.ceil(Z_LO / 500) * 500; z <= zhi; z += 500) {
      const y = S.Y(z);
      g.strokeStyle = D.alpha(C.text, 0.35); g.beginPath(); g.moveTo(S.x - 4, y); g.lineTo(S.x, y); g.stroke();
      D.haloText(g, (z / 1000).toFixed(1).replace('-', '−'), S.x - 6, y, C.muted, 'right', 'middle', '500 ' + (fs - 1) + 'px ' + FONT);
    }
    g.save(); g.translate(S.x - 36, S.Y((zhi + Z_LO) / 2)); g.rotate(-Math.PI / 2);
    D.haloText(g, T('高度（km）', 'Elevation (km)'), 0, 0, C.muted, 'center', 'middle', '600 ' + (fs - 0.5) + 'px ' + FONT);
    g.restore();
    D.haloText(g, T('剖面（面向' + dirName(fr.look) + '看，1:1 比例）', 'Cross-section (looking ' + dirName(fr.look) + ', true scale)'), S.x, S.y - 14, C.text, 'left', 'middle', '700 ' + fs + 'px ' + FONT);
    D.haloText(g, T('1 km', '1 km'), S.x + S.w - 4, S.y - 14, C.muted, 'right', 'middle', '600 ' + (fs - 1) + 'px ' + FONT);
    g.strokeStyle = C.muted; g.lineWidth = 2; g.beginPath(); g.moveTo(S.x + S.w - 38 - 1000 * S.k, S.y - 14); g.lineTo(S.x + S.w - 38, S.y - 14); g.stroke();
    g.save(); g.beginPath(); g.rect(S.x, S.y, S.w, S.h); g.clip();
    if (state.mode === 'fault') sectionFault(g, S, fr, fs); else sectionFold(g, S, fs);
    g.restore();
  }
  function azOf(v) { return ((Math.atan2(v[0], v[1]) * 180 / Math.PI) + 360) % 360; }
  // 上盤／下盤；直立（傾角 > 85°）的斷層沒有上下盤之分，改用方位
  function sideNames(short) {
    const pl = F.pl;
    if (pl.dip > 85) { const a = azOf(pl.hd); return [T(dirName(a) + '側', dirName(a) + ' side'), T(dirName(a + 180) + '側', dirName(a + 180) + ' side')]; }
    return short ? [T('上盤', 'HW'), T('下盤', 'FW')] : [T('上盤', 'Hanging wall'), T('下盤', 'Footwall')];
  }
  function sectionFault(g, S, fr, fs) {
    const pl = F.pl, n = pl.n, nh = n[0] * fr.h[0] + n[1] * fr.h[1], crit = F.st.crit, f = '700 ' + (fs - 0.5) + 'px ' + FONT;
    // 斷層線：n·p = 0 → s = −z n_z / nh（剖面原點在斷層面上）
    const sAt = function (z) { return Math.abs(nh) > 1e-9 ? -z * n[2] / nh : 0; };
    const ztop = F.erode ? F.e : Math.max(0, F.u[2]);
    // 剖面裡看得到的那一段：往下直到碰到剖面的左右邊或底部
    const zbot = Math.abs(n[2]) > 1e-9 && Math.abs(nh) > 1e-9 ? Math.max(Z_LO, -K.L * Math.abs(nh / n[2])) : Z_LO;
    const x0 = S.X(sAt(zbot)), y0 = S.Y(zbot), x1 = S.X(sAt(ztop)), y1 = S.Y(ztop);
    g.save();
    if (!crit) g.setLineDash([7, 5]);
    g.strokeStyle = D.alpha(C['canvas-bg'], 0.8); g.lineWidth = 5; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    g.strokeStyle = C['ff-fault']; g.lineWidth = 2.2; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    g.restore();
    // 畫面上指向上盤的單位法向量
    const pn = Math.hypot(nh, n[2]) || 1, px = nh / pn, py = -n[2] / pn;
    const at = function (fz) { const z = ztop + (zbot - ztop) * fz; return [S.X(sAt(z)), S.Y(z), z]; };
    // 傾角
    const zs = Math.min(0, F.erode ? F.e : 0), xs = S.X(sAt(zs)), ys = S.Y(zs);
    if (pl.dip < 89.5) {
      const r = 34, dirR = px > 0 ? 1 : -1, a1 = pl.dip * Math.PI / 180;
      g.strokeStyle = C['ff-fault']; g.lineWidth = 1.2; g.beginPath();
      if (dirR > 0) g.arc(xs, ys, r, 0, a1); else g.arc(xs, ys, r, Math.PI - a1, Math.PI);
      g.stroke();
      const lr = r + 16, la = a1 / 2;
      D.haloText(g, num(pl.dip, 1) + '°', xs + dirR * lr * Math.cos(la), ys + lr * Math.sin(la), C['ff-fault'], 'center', 'middle', f);
    }
    // 上盤、下盤（直立的斷層沒有上下盤，改寫方位）
    const q = at(0.82), vert = pl.dip > 85;
    const nm = sideNames(false), hwName = nm[0], fwName = nm[1];
    void vert;
    const lab = function (t, sg) {
      g.font = '700 ' + fs + 'px ' + FONT;
      const w = g.measureText(t).width / 2 + 4;
      const x = Math.max(S.x + w, Math.min(S.x + S.w - w, q[0] + sg * px * 62)), y = Math.max(S.Y(Math.min(0, ztop)) + 14, Math.min(S.y + S.h - 10, q[1] + sg * py * 62));
      D.pill(g, t, x, y + 5, C.text, 'center', '700 ' + (fs - 0.5) + 'px ' + FONT);
    };
    lab(hwName, 1); lab(fwName, -1);
    if (F.d > 0) {
      // 滑動方向：剖面上的分量畫成斷層兩側的半箭頭；沿走向的分量用 ⊙（朝你）⊗（遠離）
      const m = at(0.55), us = F.u[0] * fr.h[0] + F.u[1] * fr.h[1], uz = F.u[2], l = Math.hypot(us, uz), A = 30;
      if (l > 0.3 * F.d) {
        const ux = us / l, uy = -uz / l;
        const hx = m[0] + px * 14, hy = m[1] + py * 14, fx = m[0] - px * 14, fy = m[1] - py * 14;
        D.arrow(g, hx - ux * A / 2, hy - uy * A / 2, hx + ux * A / 2, hy + uy * A / 2, C['ff-fault'], 2.2);
        D.arrow(g, fx + ux * A / 2, fy + uy * A / 2, fx - ux * A / 2, fy - uy * A / 2, C['ff-fault'], 2.2);
      }
      if (Math.abs(F.along) > 0.3 * F.d) {
        const toward = F.along < 0, s2 = at(0.7);   // 面向 +走向看：上盤沿 +走向走 = 遠離
        sym(g, s2[0] + px * 22, s2[1] + py * 22, toward);
        sym(g, s2[0] - px * 22, s2[1] - py * 22, !toward);
      }
      // 落差：同一個層界在兩側的高度差。逆斷層兩側的層界在水平方向重疊，箭頭畫在重疊處；
      // 正斷層不重疊，把下盤的層界用虛線延伸到上盤那一側
      if (Math.abs(F.throw) > 20) {
        const hs = px >= 0 ? 1 : -1, pref = F.throw > 0 ? -1000 : -500;
        const cands = [];
        for (let zf = -250; zf >= Z_LO + 50; zf -= 250) cands.push(zf);
        cands.sort(function (a, b) { return Math.abs(a - pref) - Math.abs(b - pref); });
        let pick = null;
        for (let i = 0; i < cands.length && !pick; i++) {
          const zf = cands[i], zh = zf + F.throw;
          if (zh > ztop - 40 || zh < Z_LO + 40 || zf > ztop - 40) continue;
          const xf = S.X(sAt(zf)), xh = S.X(sAt(zh));
          const overlap = hs > 0 ? xh < xf - 30 : xh > xf + 30;
          const xa = overlap ? (xf + xh) / 2 : (hs > 0 ? Math.max(xf, xh) + 36 : Math.min(xf, xh) - 36);
          if (xa < S.x + 16 || xa > S.x + S.w - 16) continue;
          pick = { zf: zf, zh: zh, xf: xf, xa: xa, overlap: overlap };
        }
        if (pick) {
          if (!pick.overlap) {
            g.save(); g.setLineDash([3, 3]); g.strokeStyle = C.text; g.lineWidth = 1;
            g.beginPath(); g.moveTo(pick.xf, S.Y(pick.zf)); g.lineTo(pick.xa + hs * 8, S.Y(pick.zf)); g.stroke(); g.restore();
          }
          D.arrow(g, pick.xa, S.Y(pick.zf), pick.xa, S.Y(pick.zh), C.accent, 1.8);
          const t = T('落差 ', 'Throw ') + num(Math.abs(F.throw), 0) + ' m';
          g.font = f; const tw = g.measureText(t).width;
          let side = hs;
          if (side > 0 && pick.xa + 6 + tw > S.x + S.w - 4) side = -1;
          if (side < 0 && pick.xa - 6 - tw < S.x + 4) side = 1;
          D.haloText(g, t, pick.xa + side * 6, (S.Y(pick.zf) + S.Y(pick.zh)) / 2, C.accent, side > 0 ? 'left' : 'right', 'middle', f);
        }
      }
    }
    // 垂直應力
    const role = F.st.regime === 'normal' ? 'σ1' : F.st.regime === 'reverse' ? 'σ3' : 'σ2';
    const col = role === 'σ1' ? C['ff-s1'] : role === 'σ3' ? C['ff-s3'] : C.muted;
    const ax = S.x + S.w - 26, len = role === 'σ1' ? 30 : role === 'σ3' ? 14 : 22;
    D.arrow(g, ax, S.y + 4, ax, S.y + 4 + len, col, 2.6);
    D.haloText(g, 'Sv = ' + role, ax - 6, S.y + 14, col, 'right', 'middle', f);
  }
  function sym(g, x, y, toward) {
    g.save(); g.strokeStyle = C['ff-fault']; g.fillStyle = C['ff-fault']; g.lineWidth = 1.6;
    g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fillStyle = D.alpha(C['canvas-bg'], 0.85); g.fill(); g.stroke();
    g.fillStyle = C['ff-fault'];
    if (toward) { g.beginPath(); g.arc(x, y, 2.4, 0, Math.PI * 2); g.fill(); }
    else { g.beginPath(); g.moveTo(x - 4, y - 4); g.lineTo(x + 4, y + 4); g.moveTo(x + 4, y - 4); g.lineTo(x - 4, y + 4); g.stroke(); }
    g.restore();
  }
  function sectionFold(g, S, fs) {
    // 軸面（背斜、向斜）
    for (let k = -4; k <= 4; k++) {
      const xp = k * Fo.lam / 2; if (xp < -K.L || xp > K.L) continue;
      const anti = k % 2 === 0, x = S.X(xp), ztop = Math.min(Fo.e, Fo.A * (anti ? 1 : -1));
      g.save(); g.setLineDash([5, 4]); g.strokeStyle = D.alpha(C.text, 0.55); g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(x, S.Y(Z_LO)); g.lineTo(x, S.Y(ztop)); g.stroke(); g.restore();
      if (Fo.A > 20 && x > S.x + 30 && x < S.x + S.w - 30) D.haloText(g, anti ? T('背斜', 'Anticline') : T('向斜', 'Syncline'), x, S.Y(ztop) - 10, C.text, 'center', 'middle', '700 ' + (fs - 0.5) + 'px ' + FONT);
    }
    // 侵蝕面
    if (Fo.e < Fo.A + 1) {
      const y = S.Y(Fo.e);
      g.save(); g.setLineDash([2, 3]); g.strokeStyle = C.accent; g.lineWidth = 1.4; g.beginPath(); g.moveTo(S.x, y); g.lineTo(S.x + S.w, y); g.stroke(); g.restore();
      D.haloText(g, T('侵蝕面', 'Erosion surface'), S.x + 6, y - 9, C.accent, 'left', 'middle', '700 ' + (fs - 0.5) + 'px ' + FONT);
    }
    // 翼部傾角：在反曲點（x′ = λ/4）
    if (Fo.A > 20) {
      const xp = Fo.lam / 4, zc = -1000;
      if (xp < K.L * 0.9) {
        const x = S.X(xp), y = S.Y(zc), a = Fo.limbDip * Math.PI / 180, r = 30;
        g.strokeStyle = C.accent; g.lineWidth = 1.4;
        g.beginPath(); g.moveTo(x - 40, y - Math.tan(a) * -40 * 0); g.stroke();
        g.beginPath(); g.moveTo(x - 38 * Math.cos(a), y - 38 * Math.sin(a)); g.lineTo(x + 38 * Math.cos(a), y + 38 * Math.sin(a)); g.stroke();
        g.save(); g.setLineDash([3, 3]); g.beginPath(); g.moveTo(x, y); g.lineTo(x + 40, y); g.stroke(); g.restore();
        g.beginPath(); g.arc(x, y, r, 0, a); g.stroke();
        D.haloText(g, num(Fo.limbDip, 1) + '°', x + r + 6, y + 10, C.accent, 'left', 'middle', '700 ' + (fs - 0.5) + 'px ' + FONT);
      }
    }
    // σ1：左右擠壓
    const yy = S.Y(-1700);
    D.arrow(g, S.x + 4, yy, S.x + 34, yy, C['ff-s1'], 2.8);
    D.arrow(g, S.x + S.w - 4, yy, S.x + S.w - 34, yy, C['ff-s1'], 2.8);
    D.haloText(g, 'σ1', S.x + 38, yy - 10, C['ff-s1'], 'left', 'middle', '700 ' + fs + 'px ' + FONT);
  }
  function drawMap(g, Ly, fs) {
    const M = Ly.M, mode = state.mode;
    const img = raster('map', M.s, M.s, function (u, v) {
      const x = -K.L + u * 2 * K.L, y = K.L - v * 2 * K.L;
      const c = mapCode(x, y);
      return mapLow(x, y) && c !== K.AIR ? (c | 0x100) : c;
    });
    g.fillStyle = D.alpha(C.text, 0.06); g.fillRect(M.x, M.y, M.s, M.s);
    g.drawImage(img, M.x, M.y, M.s, M.s);
    g.strokeStyle = D.alpha(C.text, 0.35); g.lineWidth = 1; g.strokeRect(Math.round(M.x) + 0.5, Math.round(M.y) + 0.5, Math.round(M.s), Math.round(M.s));
    const title = mode === 'fault' ? (F.erode ? T('侵蝕成平地後的地質圖', 'Geologic map after erosion') : T('地質圖（從上往下看）', 'Geologic map (from above)'))
      : (Fo.e < Fo.A + Math.abs(Fo.tanP) * K.L * 1.5 ? T('侵蝕後的地質圖', 'Geologic map after erosion') : T('地質圖（還沒侵蝕）', 'Geologic map (not eroded yet)'));
    D.haloText(g, title, M.x - MG + 4, M.y - MG - 14, C.text, 'left', 'middle', '700 ' + fs + 'px ' + FONT);
    // 北
    const nx = M.x + M.s - 14, ny = M.y + 18;
    D.arrow(g, nx, ny + 10, nx, ny - 8, C.text, 2);
    D.haloText(g, T('北', 'N'), nx, ny + 20, C.text, 'center', 'middle', '700 ' + (fs - 1) + 'px ' + FONT);
    g.save(); g.beginPath(); g.rect(M.x, M.y, M.s, M.s); g.clip();
    if (mode === 'fault') mapFault(g, M, fs); else mapFold(g, M, fs);
    g.restore();
    // 水平應力箭頭（地圖外緣）
    stressArrows(g, M, fs);
  }
  function lineInBox(px, py, dx, dy) {
    // 通過 (px,py)、方向 (dx,dy) 的直線和方塊的交點（參數 t 的範圍）
    let t0 = -1e9, t1 = 1e9;
    [[dx, px], [dy, py]].forEach(function (q) {
      if (Math.abs(q[0]) < 1e-12) { if (Math.abs(q[1]) > K.L) { t0 = 1; t1 = 0; } return; }
      const a = (-K.L - q[1]) / q[0], b = (K.L - q[1]) / q[0];
      t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b));
    });
    return t1 > t0 ? [t0, t1] : null;
  }
  function mapFault(g, M, fs) {
    const pl = F.pl, n = pl.n, crit = F.st.crit;
    const zt = F.erode ? F.e : 0;
    // 地表的斷層線：n·(x, y, zt) = 0
    const nh2 = n[0] * n[0] + n[1] * n[1];
    const px = nh2 > 1e-12 ? -n[2] * zt * n[0] / nh2 : 0, py = nh2 > 1e-12 ? -n[2] * zt * n[1] / nh2 : 0;
    const r = lineInBox(px, py, pl.sv[0], pl.sv[1]);
    if (!r) return;
    const ax = M.X(px + pl.sv[0] * r[0]), ay = M.Y(py + pl.sv[1] * r[0]), bx = M.X(px + pl.sv[0] * r[1]), by = M.Y(py + pl.sv[1] * r[1]);
    g.save(); if (!crit) g.setLineDash([7, 5]);
    g.strokeStyle = D.alpha(C['canvas-bg'], 0.8); g.lineWidth = 5; g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
    g.strokeStyle = C['ff-fault']; g.lineWidth = 2.2; g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
    g.restore();
    // 符號：正斷層在下降側畫短線、逆斷層在上盤畫三角形、平移斷層畫半箭頭
    const hx = pl.hd[0], hy = -pl.hd[1];   // 畫面上指向上盤（傾向）的方向
    const tx = (bx - ax), ty = (by - ay), tl = Math.hypot(tx, ty) || 1;
    const reg = F.st.regime;
    for (let i = 1; i <= 3; i++) {
      const f = i / 4, x = ax + tx * f, y = ay + ty * f;
      g.fillStyle = C['ff-fault']; g.strokeStyle = C['ff-fault']; g.lineWidth = 2;
      if (reg === 'reverse') {
        g.beginPath(); g.moveTo(x - tx / tl * 7, y - ty / tl * 7); g.lineTo(x + tx / tl * 7, y + ty / tl * 7); g.lineTo(x + hx * 10, y + hy * 10); g.closePath(); g.fill();
      } else if (reg === 'normal') {
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + hx * 9, y + hy * 9); g.stroke();
        g.beginPath(); g.arc(x + hx * 11, y + hy * 11, 2.6, 0, Math.PI * 2); g.fill();
      }
    }
    if (reg === 'strike' && F.d > 0) {
      const ux = tx / tl, uy = ty / tl, s = F.along > 0 ? 1 : -1;
      [[1, 0.25], [-1, 0.75]].forEach(function (q) {
        const side = q[0], x = ax + tx * q[1] + hx * 12 * side, y = ay + ty * q[1] + hy * 12 * side;
        const dir = side * s;   // 上盤（side = 1）沿走向 s 移動
        D.arrow(g, x - ux * 16 * dir, y - uy * 16 * dir, x + ux * 16 * dir, y + uy * 16 * dir, C['ff-fault'], 2);
      });
    }
    // 走向傾角符號
    if (pl.dip < 89.5) {
      const x = ax + tx * 0.62 + hx * 30, y = ay + ty * 0.62 + hy * 30;
      D.pill(g, num(pl.dip, 0) + '°', x, y + 6, C['ff-fault'], 'center', '700 ' + (fs - 1) + 'px ' + FONT);
    }
    // 上盤／下盤
    const nm = sideNames(true);
    D.pill(g, nm[0], M.X(pl.hd[0] * 900) , M.Y(pl.hd[1] * 900 + (Math.abs(pl.hd[1]) < 0.5 ? 700 : 0)) + 5, C.text, 'center', '700 ' + (fs - 0.5) + 'px ' + FONT);
    D.pill(g, nm[1], M.X(-pl.hd[0] * 900), M.Y(-pl.hd[1] * 900 + (Math.abs(pl.hd[1]) < 0.5 ? 700 : 0)) + 5, C.text, 'center', '700 ' + (fs - 0.5) + 'px ' + FONT);
  }
  function mapFold(g, M, fs) {
    const ex = Fo.eAx, eh = Fo.eH;
    for (let k = -6; k <= 6; k++) {
      const xp = k * Fo.lam / 2; if (Math.abs(xp) > K.L * 1.5) continue;
      const anti = k % 2 === 0, px = eh[0] * xp, py = eh[1] * xp;
      const r = lineInBox(px, py, ex[0], ex[1]); if (!r) continue;
      const ax = M.X(px + ex[0] * r[0]), ay = M.Y(py + ex[1] * r[0]), bx = M.X(px + ex[0] * r[1]), by = M.Y(py + ex[1] * r[1]);
      g.strokeStyle = D.alpha(C.text, 0.85); g.lineWidth = 1.6; g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
      // 背斜：兩個往外的箭頭；向斜：往內
      const mx = (ax + bx) / 2, my = (ay + by) / 2, hx = eh[0], hy = -eh[1];
      if (Fo.A > 20) {
        [1, -1].forEach(function (s) {
          const o = anti ? 4 : 18, e = anti ? 18 : 4;
          D.arrow(g, mx + hx * o * s, my + hy * o * s, mx + hx * e * s, my + hy * e * s, C.text, 1.6);
        });
      }
      // 傾沒方向（褶皺軸往 +y′ 傾沒）
      if (Fo.plunge > 0.2 && Math.abs(xp) < K.L) {
        const qx = M.X(px + ex[0] * (r[1] - 260)), qy = M.Y(py + ex[1] * (r[1] - 260));
        D.arrow(g, qx - ex[0] * 0, qy, qx + ex[0] * 16, qy - ex[1] * 16, C.accent, 2);
        D.haloText(g, num(Fo.plunge, 1) + '°', qx + hx * 10, qy + hy * 10, C.accent, 'left', 'middle', '700 ' + (fs - 1) + 'px ' + FONT);
      }
    }
  }
  function stressArrows(g, M, fs) {
    // 箭頭畫在地圖外圍的邊距裡，指向地圖（壓應力），長短表示大小
    const cx = M.x + M.s / 2, cy = M.y + M.s / 2, R = M.s / 2, f = '700 ' + (fs - 1.5) + 'px ' + FONT;
    function pair(dir, mag, col, lab) {
      const dx = dir[0], dy = -dir[1], t = R / Math.max(Math.abs(dx), Math.abs(dy));
      const len = 9 + 13 * Math.max(0, Math.min(1, mag));
      [1, -1].forEach(function (s, i) {
        const ex = cx + dx * s * (t + 3), ey = cy + dy * s * (t + 3);
        D.arrow(g, ex + dx * s * len, ey + dy * s * len, ex, ey, col, 2.6);
        if (i === 0) {
          // 標籤放在箭頭旁邊（垂直方向錯開），留在邊距裡
          const px = Math.abs(dy) > Math.abs(dx) ? 1 : 0, py = px ? 0 : -1;
          D.pill(g, lab, ex + dx * s * len * 0.6 + px * 24, ey + dy * s * len * 0.6 + py * 13 + 5, col, 'center', f);
        }
      });
    }
    if (state.mode === 'fault') {
      const st = F.st, top = Math.max(st.SH, st.Sv), role = function (v) { return v === st.s1 ? 'σ1' : v === st.s3 ? 'σ3' : 'σ2'; };
      const colOf = function (r) { return r === 'σ1' ? C['ff-s1'] : r === 'σ3' ? C['ff-s3'] : C.muted; };
      pair(st.eH, st.SH / top, colOf(role(st.SH)), role(st.SH));
      pair(st.eh, st.Sh / top, colOf(role(st.Sh)), role(st.Sh));
    } else pair(Fo.eH, 1, C['ff-s1'], 'σ1');
  }

  // =====================================================================
  // 圖表：莫爾圓（斷層）／縮短率（褶皺）
  // =====================================================================
  function drawChart() {
    if (!grSize || !F) return;
    const W = grSize.w, H = grSize.h, g = gtx, narrow = W < 520, fs = narrow ? 10.5 : 11.5;
    g.clearRect(0, 0, W, H);
    g.fillStyle = C['canvas-bg']; g.fillRect(0, 0, W, H);
    if (state.mode === 'fault') drawMohr(g, W, H, fs); else drawFoldChart(g, W, H, fs);
  }
  function drawMohr(g, W, H, fs) {
    const st = F.st, p = st.Pp, a1 = st.s1 - p, a2 = st.s2 - p, a3 = st.s3 - p;
    const xmin = Math.min(0, a3) - 0.05 * (a1 - Math.min(0, a3)), xmax = a1 * 1.08 + 1;
    const l = 46, r = W - 12, t = 22, b = H - 34;
    const k = Math.min((r - l) / (xmax - xmin), (b - t) / ((a1 - a3) / 2 * 1.25 + 1));
    const X = function (s) { return l + (s - xmin) * k; }, Y = function (tau) { return b - tau * k; };
    // 格線與軸
    const step = niceStep((xmax - xmin) / (narrow() ? 4 : 7));
    g.strokeStyle = D.alpha(C.text, 0.08); g.lineWidth = 1;
    for (let s = Math.ceil(xmin / step) * step; s <= xmax; s += step) { const x = Math.round(X(s)) + 0.5; g.beginPath(); g.moveTo(x, t); g.lineTo(x, b); g.stroke(); D.haloText(g, num(s, 0), x, b + 12, C.muted, 'center', 'middle', '500 ' + (fs - 1) + 'px ' + FONT); }
    for (let q = step; Y(q) > t; q += step) { const y = Math.round(Y(q)) + 0.5; g.beginPath(); g.moveTo(l, y); g.lineTo(r, y); g.stroke(); D.haloText(g, num(q, 0), l - 5, y, C.muted, 'right', 'middle', '500 ' + (fs - 1) + 'px ' + FONT); }
    g.strokeStyle = D.alpha(C.text, 0.45); g.beginPath(); g.moveTo(l, b + 0.5); g.lineTo(r, b + 0.5); g.stroke();
    if (X(0) > l) { g.beginPath(); g.moveTo(X(0) + 0.5, t); g.lineTo(X(0) + 0.5, b); g.stroke(); }
    D.haloText(g, T('有效正應力 σn − Pp（MPa）', 'Effective normal stress σn − Pp (MPa)'), (l + r) / 2, H - 8, C.muted, 'center', 'middle', '600 ' + (fs - 0.5) + 'px ' + FONT);
    D.haloText(g, T('剪應力 τ（MPa）', 'Shear stress τ (MPa)'), l, 10, C.muted, 'left', 'middle', '600 ' + (fs - 0.5) + 'px ' + FONT);
    // 張裂區
    if (xmin < 0) { g.fillStyle = D.alpha(C['ff-s3'], 0.08); g.fillRect(l, t, X(0) - l, b - t); }
    // 破裂線 τ = μ σn′
    g.save(); g.beginPath(); g.rect(l, t, r - l, b - t); g.clip();
    g.strokeStyle = C['ff-env']; g.lineWidth = 2.2; g.beginPath(); g.moveTo(X(0), Y(0)); g.lineTo(X(xmax), Y(st.mu * xmax)); g.stroke();
    g.fillStyle = D.alpha(C['ff-env'], 0.08); g.beginPath(); g.moveTo(X(0), Y(0)); g.lineTo(X(xmax), Y(st.mu * xmax)); g.lineTo(X(xmax), t); g.lineTo(X(0), t); g.closePath(); g.fill();
    // 三個莫爾圓
    [[a1, a3, 2.4, 1], [a1, a2, 1.2, 0.6], [a2, a3, 1.2, 0.6]].forEach(function (q) {
      const c = (q[0] + q[1]) / 2, rr = Math.abs(q[0] - q[1]) / 2;
      g.strokeStyle = D.alpha(C.text, q[3]); g.lineWidth = q[2];
      g.fillStyle = D.alpha(C.accent, q[3] === 1 ? 0.08 : 0);
      g.beginPath(); g.arc(X(c), Y(0), rr * k, Math.PI, 2 * Math.PI); g.fill(); g.stroke();
    });
    g.restore();
    // 斷層面的點
    const rs = F.rs, x = X(rs.snEff), y = Y(rs.tau);
    D.ball(g, x, y, 6, st.crit ? C['ff-s1'] : C.accent, { glow: 6 });
    D.pill(g, T('斷層面', 'Fault plane'), x + 10, y - 8, st.crit ? C['ff-s1'] : C.accent, 'left', '700 ' + (fs - 0.5) + 'px ' + FONT);
    [[a1, 'σ1′'], [a2, 'σ2′'], [a3, 'σ3′']].forEach(function (q, i) {
      D.haloText(g, q[1], X(q[0]), b - 8 - (i === 1 ? 12 : 0), C.text, 'center', 'middle', '700 ' + (fs - 0.5) + 'px ' + FONT);
    });
    D.haloText(g, T('破裂線 τ = μ(σn − Pp)', 'Failure line τ = μ(σn − Pp)'), r - 4, t + 10, C['ff-env'], 'right', 'middle', '700 ' + (fs - 0.5) + 'px ' + FONT);
    function narrow() { return W < 520; }
  }
  function niceStep(x) { const p = Math.pow(10, Math.floor(Math.log10(x))), m = x / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; }
  const SHORT_X = 0.8;
  function drawFoldChart(g, W, H, fs) {
    const l = 50, r = W - 12, t = 22, b = H - 34;
    const sAt = function (q) { return K.fold({ lam: 1000, A: q * 1000, plunge: 0, az: 0, e: 0 }).shortening; };
    const ymax = Math.ceil(sAt(SHORT_X) * 10) / 10;
    const X = function (q) { return l + q / SHORT_X * (r - l); }, Y = function (s) { return b - s / ymax * (b - t); };
    // 翼間角分類的色帶
    const bounds = [[0, 30, 'gentle'], [30, 55, 'open'], [55, 75, 'close'], [75, 90, 'tight']];
    bounds.forEach(function (q, i) {
      const x0 = X(Math.tan(q[0] * Math.PI / 180) / (2 * Math.PI)), x1 = X(Math.min(SHORT_X, q[1] >= 90 ? SHORT_X : Math.tan(q[1] * Math.PI / 180) / (2 * Math.PI)));
      g.fillStyle = D.alpha(C.accent, 0.03 + 0.04 * i); g.fillRect(x0, t, Math.min(r, x1) - x0, b - t);
      D.haloText(g, clsName(q[2]), (x0 + Math.min(r, x1)) / 2, t + 9, C.muted, 'center', 'middle', '600 ' + (fs - 1) + 'px ' + FONT);
    });
    g.strokeStyle = D.alpha(C.text, 0.08);
    for (let s = 0.1; s <= ymax + 1e-9; s += 0.1) { const y = Math.round(Y(s)) + 0.5; g.beginPath(); g.moveTo(l, y); g.lineTo(r, y); g.stroke(); D.haloText(g, Math.round(s * 100) + '%', l - 5, y, C.muted, 'right', 'middle', '500 ' + (fs - 1) + 'px ' + FONT); }
    for (let q = 0; q <= SHORT_X + 1e-9; q += 0.1) D.haloText(g, q.toFixed(1), X(q), b + 12, C.muted, 'center', 'middle', '500 ' + (fs - 1) + 'px ' + FONT);
    g.strokeStyle = D.alpha(C.text, 0.45); g.beginPath(); g.moveTo(l, b + 0.5); g.lineTo(r, b + 0.5); g.stroke();
    g.strokeStyle = C.accent; g.lineWidth = 2.2; g.beginPath();
    for (let i = 0; i <= 80; i++) { const q = SHORT_X * i / 80, x = X(q), y = Y(sAt(q)); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.stroke();
    const q = Fo.A / Fo.lam, x = X(Math.min(SHORT_X, q)), y = Y(Math.min(ymax, Fo.shortening));
    D.ball(g, x, y, 6, C['ff-s1'], { glow: 6 });
    D.pill(g, T('縮短 ', 'Shortened ') + num(Fo.shortening * 100, 1) + '%', x + (x > W - 140 ? -10 : 10), y - 8, C['ff-s1'], x > W - 140 ? 'right' : 'left', '700 ' + (fs - 0.5) + 'px ' + FONT);
    D.haloText(g, T('振幅 ÷ 波長（A/λ）', 'Amplitude ÷ wavelength (A/λ)'), (l + r) / 2, H - 8, C.muted, 'center', 'middle', '600 ' + (fs - 0.5) + 'px ' + FONT);
    D.haloText(g, T('縮短率', 'Shortening'), l, 10, C.muted, 'left', 'middle', '600 ' + (fs - 0.5) + 'px ' + FONT);
  }

  // =====================================================================
  // 讀數、事件與音效
  // =====================================================================
  function emit(type, data) { if (state.acted && window.LabMission) window.LabMission.emit(type, data); }
  function acted() { state.acted = true; }
  function sound() { const S = window.LabSound; return S && S.enabled() ? S : null; }
  function setStatus(s) { $('status').textContent = s; }
  function snapshot() {
    if (state.mode === 'fault') {
      const st = F.st;
      return { mode: 'fault', regime: st.regime, crit: st.crit, critHydro: st.critHydro, tensile: st.tensile, ratio: st.ratio, q: st.q,
        z: P.zDepth, kH: P.kH, kh: P.kh, lam: P.lam, mu: P.mu, az: P.az, plane: state.plane,
        strike: F.pl.strike, dip: F.pl.dip, rake: F.rs.rake, slip: F.d, slipSet: P.slip, throw: F.throw, heave: F.heave, along: F.along,
        lateral: F.lateral, kind: F.kind, erode: F.erode, expoFw: F.expo.fw, expoHw: F.expo.hw,
        base: F.kinds.indexOf(K.BASE) >= 0, quakes: state.quakes, quaked: false, animating: !!quakeAnim };
    }
    return { mode: 'fold', lam: P.wl, A: P.amp, plunge: P.plunge, e: P.ero, az: P.az, limbDip: Fo.limbDip, interlimb: Fo.interlimb, cls: Fo.cls,
      shortening: Fo.shortening, crest: Fo.ex.crest, trough: Fo.ex.trough, kinds: Fo.ex.kinds.length, base: Fo.ex.kinds.indexOf(K.BASE) >= 0, animating: false };
  }
  let lastEmit = 0;
  function emitState(force) {
    const t = performance.now();
    if (force || t - lastEmit > 250) { lastEmit = t; emit(state.mode, snapshot()); }
  }
  function refreshOutputs() {
    const dec = { zDepth: 2, kH: 2, kh: 2, lam: 2, mu: 2, az: 0, slip: 0, wl: 0, amp: 0, plunge: 1, ero: 0 };
    ids.forEach(function (k) { setOut(el[k], outNum(P[k], dec[k])); });
  }
  function updateReadouts() {
    const st = F.st, pl = F.pl;
    setHTML('rSv', num(st.Sv, 1) + ' MPa');
    setHTML('rSH', num(st.SH, 0) + '／' + num(st.Sh, 0) + '／' + num(st.Pp, 0) + ' MPa');
    setHTML('rReg', '<span class="regime' + (st.crit ? '' : ' off') + '">' + regimeName(st.regime) + '</span>');
    setHTML('rRatio', (st.tensile ? T('張裂（有效應力為負）', 'tensile (negative effective stress)') : num(st.ratio, 2)) + '<span class="sub">' + T('滑動要 ≥ ', 'slips at ≥ ') + num(st.q, 2) + '</span>');
    setHTML('rPlane', az3(pl.strike) + '／' + num(pl.dip, 1) + '°' + (pl.dip < 89.5 ? '<span class="sub">' + T('向' + dirName(pl.dd) + '傾斜', 'dipping ' + dirName(pl.dd)) + '</span>' : '<span class="sub">' + T('直立', 'vertical') + '</span>'));
    const rk = F.rs.rake, rkName = Math.abs(rk + 90) < 1 ? T('正斷層', 'normal') : Math.abs(rk - 90) < 1 ? T('逆斷層', 'reverse') : Math.abs(rk) < 1 ? T('左移', 'left-lateral') : Math.abs(Math.abs(rk) - 180) < 1 ? T('右移', 'right-lateral') : T('斜移', 'oblique');
    setHTML('rRake', num(rk, 0) + '°<span class="sub">' + rkName + '</span>');
    const on = F.d > 0;
    setHTML('rThrow', on ? num(Math.abs(F.throw), 0) + ' m<span class="sub">' + (Math.abs(F.throw) < 0.5 ? '—' : F.throw > 0 ? T('上盤上升', 'hanging wall up') : T('上盤下降', 'hanging wall down')) + '</span>' : '0 m');
    setHTML('rHeave', on ? num(Math.abs(F.heave), 0) + ' m<span class="sub">' + (Math.abs(F.heave) < 0.5 ? '—' : F.heave > 0 ? T('拉開', 'extension') : T('縮短', 'shortening')) + '</span>' : '0 m');
    setHTML('rAlong', on && Math.abs(F.along) >= 0.5 ? num(Math.abs(F.along), 0) + ' m<span class="sub">' + (F.lateral === 'right' ? T('右移', 'right-lateral') : T('左移', 'left-lateral')) + '</span>' : '0 m');
    setHTML('rExpo', T('上盤 ', 'HW ') + layerName(F.expo.hw) + T('、下盤 ', ', FW ') + layerName(F.expo.fw));
    setHTML('faultHint', st.crit
      ? (st.tensile ? T('有效應力已經變成拉力：岩石會直接被撐開（張裂）。', 'The effective stress has become tension: the rock is pulled open.') : T('應力已達破裂條件：斷層會滑動。累積滑移 ', 'The stresses meet the failure condition: the fault slips. Total slip ') + num(F.d, 0) + ' m。')
      : T('應力比 ' + num(st.ratio, 2) + '，要到 ' + num(st.q, 2) + ' 才會滑動：斷層還鎖住（虛線）。', 'Stress ratio ' + num(st.ratio, 2) + '; it slips at ' + num(st.q, 2) + '. The fault is still locked (dashed).'));
    // 褶皺
    setHTML('rLimb', num(Fo.limbDip, 1) + '°');
    setHTML('rInter', num(Fo.interlimb, 1) + '°<span class="sub">' + clsName(Fo.cls) + T('褶皺', ' fold') + '</span>');
    setHTML('rShort', num(Fo.shortening * 100, 1) + '%');
    setHTML('rAxis', az3(Fo.axisTrend) + (Fo.plunge > 0 ? T('，向 ', ', plunging ') + dirName(Fo.axisTrend) + ' ' + num(Fo.plunge, 1) + '°' : T('，水平', ', horizontal')));
    setHTML('rCore', layerName(Fo.ex.crest) + '／' + layerName(Fo.ex.trough));
    setHTML('rKinds', String(Fo.ex.kinds.length) + T(' 種', ''));
    setHTML('chartHint', state.mode === 'fault'
      ? T('莫爾圓：大圓碰到橘色的破裂線，斷層就會滑動。孔隙壓力把圓往左推（靠近破裂線），應力差變大讓圓變大。', 'Mohr circles: when the big circle touches the orange failure line, the fault slips. Pore pressure shifts the circles left (towards the line); a larger stress difference makes the circle bigger.')
      : T('褶皺越陡（A/λ 越大），同樣長的地層擠得越短；上面的色帶是翼間角的分類。', 'The steeper the fold (larger A/λ), the more a given length of layer is shortened; the bands at the top are the interlimb-angle classes.'));
    $('hint2d').textContent = state.mode === 'fault'
      ? T('左：垂直於斷層走向的剖面（實線＝會滑動、虛線＝鎖住）；右：地質圖。符號：正斷層的短線與圓點畫在下降側，逆斷層的三角形畫在上盤。選取畫布後：左右方向鍵＝SH 方位，上下＝滑移量。', 'Left: a section across the fault (solid = slipping, dashed = locked); right: the geologic map. Symbols: ticks and dots on the down-thrown side of a normal fault, triangles on the upper plate of a thrust. With the canvas focused: left/right = SH azimuth, up/down = slip.')
      : T('左：垂直於褶皺軸的剖面；右：地質圖（箭頭往外＝背斜、往內＝向斜，橘色箭頭＝傾沒方向）。選取畫布後：左右方向鍵＝擠壓方位，上下＝振幅。', 'Left: a section across the fold axis; right: the geologic map (arrows pointing out = anticline, in = syncline, orange arrow = plunge). With the canvas focused: left/right = compression azimuth, up/down = amplitude.');
  }
  let lastSay = 0;
  function sayNow(force) {
    const t = performance.now(); if (!force && t - lastSay < 3000) return; lastSay = t;
    const txt = state.mode === 'fault'
      ? regimeName(F.st.regime) + T(F.st.crit ? '，會滑動' : '，還鎖住', F.st.crit ? ', slipping' : ', locked') + T('；傾角 ', '; dip ') + num(F.pl.dip, 1) + T(' 度；落差 ', ' degrees; throw ') + num(Math.abs(F.throw), 0) + T(' 公尺', ' metres')
      : T('翼部傾角 ', 'Limb dip ') + num(Fo.limbDip, 1) + T(' 度，縮短 ', ' degrees, shortened ') + num(Fo.shortening * 100, 1) + '%';
    $('srNow').textContent = txt;
  }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  let lastCrit = null, lastReg = null;
  function soundCues() {
    const S = sound(), c = F.st.crit, r = F.st.regime;
    if (S && state.mode === 'fault' && lastCrit != null && c !== lastCrit) S.tone({ freq: c ? 880 : 440, dur: 0.12, gain: 0.1 });
    else if (S && state.mode === 'fault' && lastReg != null && r !== lastReg) S.tone({ freq: 587, dur: 0.08, gain: 0.08 });
    if (state.mode === 'fault' && lastCrit != null && (c !== lastCrit || r !== lastReg)) {
      setStatus(regimeName(r) + (F.st.tensile ? T('的應力狀態，而且有效應力變成拉力：岩石被撐開了。', ' regime, and the effective stress has turned tensile: the rock is pulled open.')
        : c ? T('的應力狀態，已達破裂條件：按「地震！」讓斷層滑動。', ' regime at failure: press “Earthquake!” to make the fault slip.')
        : T('的應力狀態，還沒達到破裂條件。', ' regime, not yet at failure.')));
    }
    lastCrit = c; lastReg = r;
  }
  function refreshAll() { compute(); soundCues(); refreshOutputs(); updateReadouts(); requestDraw(); }

  // =====================================================================
  // 控制項
  // =====================================================================
  function setSeg(id, attr, v) {
    document.querySelectorAll('#' + id + ' button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute(attr) === String(v))); });
  }
  ids.forEach(function (k) {
    el[k].addEventListener('input', function () { if (internal) return; acted(); readSliders(); refreshAll(); emitState(); sayNow(); });
    el[k].addEventListener('change', function () { if (internal) return; readSliders(); refreshAll(); emitState(true); });
  });
  function applyMode() {
    const f = state.mode === 'fault';
    setSeg('modeSeg', 'data-mode', state.mode);
    $('stressCard').hidden = !f; $('faultCard').hidden = !f; $('foldCard').hidden = f;
    $('rdFault').hidden = !f; $('rdFold').hidden = f;
    $('quakeBtn').hidden = !f; $('erodeBtn').hidden = !f;
    $('azLabel').textContent = f ? T('SH 的方位（由北順時針，度）', 'Azimuth of SH (° from north)') : T('擠壓方向 σ1 的方位（由北順時針，度）', 'Azimuth of the squeeze σ1 (° from north)');
    cv.setAttribute('aria-label', f ? T('左邊是垂直於斷層走向的地質剖面，右邊是從上往下看的地質圖', 'Left: a vertical cross-section perpendicular to the fault; right: the geologic map seen from above')
      : T('左邊是垂直於褶皺軸的地質剖面，右邊是從上往下看的地質圖', 'Left: a vertical cross-section across the fold axis; right: the geologic map seen from above'));
    gr.setAttribute('aria-label', f ? T('莫爾圓：橫軸是有效正應力，縱軸是剪應力；直線是破裂線', 'Mohr circles: effective normal stress across, shear stress up; the straight line is the failure line')
      : T('縮短率對振幅與波長之比的曲線', 'Shortening against the ratio of amplitude to wavelength'));
    imgKey = {};
    if (cvSize && !(view3 && view3.active)) resizeCv();
  }
  document.querySelectorAll('#modeSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      acted(); state.mode = b.getAttribute('data-mode'); applyMode(); refreshAll();
      setStatus(state.mode === 'fault' ? T('斷層：設定應力，看岩層會不會斷、怎麼斷。', 'Faults: set the stresses and see whether — and how — the rock breaks.') : T('褶皺：設定波長、振幅與傾沒，再把它侵蝕成平地。', 'Folds: set the wavelength, amplitude and plunge, then erode it flat.'));
      if (view3) view3.rebuild(); emitState(true);
    });
  });
  document.querySelectorAll('#planeSeg button').forEach(function (b) {
    b.addEventListener('click', function () { acted(); state.plane = +b.getAttribute('data-plane'); setSeg('planeSeg', 'data-plane', state.plane); refreshAll(); emitState(true); });
  });
  function setErode(on) {
    state.erode = on; $('erodeBtn').setAttribute('aria-pressed', String(on));
    $('erodeBtn').textContent = on ? T('取消侵蝕', 'Undo erosion') : T('侵蝕成平地', 'Erode flat');
  }
  $('erodeBtn').addEventListener('click', function () {
    acted(); setErode(!state.erode); refreshAll();
    const S = sound(); if (S) S.noise({ filter: 1800, q: 0.7, dur: 0.35, gain: 0.12 });
    setStatus(state.erode ? T('把高出來的部分侵蝕成平地了：看地圖上斷層兩側露出的地層。', 'The high side is eroded flat: look at the layers on either side of the fault on the map.') : T('恢復侵蝕前的地形。', 'Back to the landscape before erosion.'));
    emitState(true);
  });
  // 地震：滑移量增加 100 m（有動畫）
  let quakeAnim = null, shake = 0;
  $('quakeBtn').addEventListener('click', function () {
    acted();
    if (!F.st.crit) {
      setStatus(T('應力還不夠，斷層沒有滑動。把 Sh 調小、把孔隙壓力調高，或改變應力的方向。', 'The stress is not enough, so the fault does not slip. Lower Sh, raise the pore pressure or change the stresses.'));
      const S = sound(); if (S) S.tone({ freq: 330, dur: 0.12, gain: 0.08 });
      return;
    }
    if (P.slip >= SLIP_MAX) { setStatus(T('滑移量已經到上限 1200 m。按「全部清除」重新開始。', 'The slip is at its 1200 m limit. Press “Clear all” to start again.')); return; }
    const from = P.slip, to = Math.min(SLIP_MAX, from + QUAKE);
    state.quakes++;
    const S = sound(); if (S) { S.noise({ filter: 320, q: 0.8, dur: 0.7, gain: 0.35 }); S.tone({ freq: 262, dur: 0.5, gain: 0.08 }); }
    if (reducedMotion) { setRange(el.slip, to); readSliders(); refreshAll(); afterQuake(); return; }
    quakeAnim = { t0: performance.now(), from: from, to: to };
    requestDraw();
  });
  function stepQuake(tnow) {
    if (!quakeAnim) return;
    const u = Math.min(1, (tnow - quakeAnim.t0) / 700), e = 1 - Math.pow(1 - u, 3);
    shake = u < 1 ? 1 - u : 0;
    setRange(el.slip, Math.round(quakeAnim.from + (quakeAnim.to - quakeAnim.from) * e));
    readSliders(); compute(); refreshOutputs(); updateReadouts();
    if (u >= 1) { quakeAnim = null; shake = 0; setRange(el.slip, P.slip); afterQuake(); }
  }
  function afterQuake() {
    setStatus(T('地震！斷層滑動了 100 m（' + state.quakes + ' 次，累積 ' + num(F.d, 0) + ' m）。', 'Earthquake! The fault slipped 100 m (' + state.quakes + ' so far, ' + num(F.d, 0) + ' m in total).'));
    lastEmit = performance.now(); emit('fault', Object.assign(snapshot(), { quaked: true }));
    emit('quake', { n: state.quakes, regime: F.st.regime }); sayNow(true);
  }
  $('clearBtn').addEventListener('click', function () {
    acted(); quakeAnim = null; shake = 0;
    state.quakes = 0; setErode(false); setRange(el.slip, 0); readSliders(); refreshAll();
    setStatus(T('滑移量歸零、取消侵蝕、地震次數歸零；應力設定不變。', 'Slip reset, erosion undone and earthquake count cleared; the stresses are unchanged.'));
    emitState(true);
  });
  $('soundBtn').addEventListener('click', function () {
    const on = !(window.LabSettings && window.LabSettings.get('sound'));
    if (window.LabSettings) window.LabSettings.set('sound', on);
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'sound') updateSoundButton(); });

  // ---------- 鍵盤 ----------
  if (window.LabKeys) {
    window.LabKeys.attach(cv, {
      label: T('剖面與地質圖。左右方向鍵＝方位，上下＝滑移量（斷層）或振幅（褶皺），Shift 走大步。', 'Section and map. Left/right = azimuth, up/down = slip (faults) or amplitude (folds); Shift for bigger steps.'),
      items: [{
        name: function () { return state.mode === 'fault' ? T('斷層', 'Fault') : T('褶皺', 'Fold'); },
        move: function (dx, dy, big) {
          if (!dx && !dy) return false;
          acted();
          if (dx) setRange(el.az, ((Math.round(P.az + dx * (big ? 10 : 1)) % 180) + 180) % 180);
          if (dy) {
            if (state.mode === 'fault') setRange(el.slip, clamp(P.slip + dy * (big ? 100 : 10), 0, SLIP_MAX));
            else setRange(el.amp, clamp(P.amp + dy * (big ? 100 : 10), 0, 1500));
          }
          readSliders(); refreshAll(); emitState(true); return true;
        },
        describe: function () {
          return state.mode === 'fault' ? regimeName(F.st.regime) + T('，SH 方位 ', ', SH azimuth ') + num(P.az, 0) + T(' 度，滑移 ', ' degrees, slip ') + num(F.d, 0) + T(' 公尺', ' metres')
            : T('振幅 ', 'Amplitude ') + num(P.amp, 0) + T(' 公尺，擠壓方位 ', ' metres, squeeze azimuth ') + num(P.az, 0) + T(' 度', ' degrees');
        }
      }]
    });
  }

  // ---------- 分享 ----------
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () { return { m: state.mode, p: state.plane, e: state.erode ? 1 : 0, q: state.quakes }; },
    set: function (o) {
      if (!o) return;
      if (o.m === 'fault' || o.m === 'fold') state.mode = o.m;
      state.plane = o.p ? 1 : 0; setSeg('planeSeg', 'data-plane', state.plane);
      setErode(!!o.e); state.quakes = Math.max(0, Math.min(99, +o.q || 0));
      applyMode(); readSliders(); refreshAll();
    }
  });

  // =====================================================================
  // 繪圖迴圈
  // =====================================================================
  let raf = 0;
  function requestDraw() { if (!raf) raf = requestAnimationFrame(loop); }
  function loop(tnow) {
    raf = 0;
    stepQuake(tnow);
    if (view3 && view3.active) view3.frame(tnow); else drawMain();
    drawChart();
    if (quakeAnim || (view3 && view3.active && view3.busy())) raf = requestAnimationFrame(loop);
  }

  // =====================================================================
  // 3D 檢視（切換時才載入 three.js 與 faults-folds-3d.js）
  // =====================================================================
  let view3 = null, threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  const bridge = {
    K: K, T: T, D: D, state: state, colors: function () { return C; }, layerColor: layerColor, reducedMotion: reducedMotion,
    num: num, fault: function () { return F; }, fold: function () { return Fo; }, shake: function () { return shake; },
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
      if (window.Faults3D) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (threeLib && window.Faults3D) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    const own = new URL('js/faults-folds-3d.js' + (SCRIPT_V ? '?v=' + SCRIPT_V : ''), document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js'), loadScript(own)]).then(function (mods) {
      if (!window.Faults3D) throw new Error('faults-folds-3d.js did not load');
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
      viewMsg.textContent = T('正在載入 3D…', 'Loading 3D…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return;
        view3 = window.Faults3D.create(lib, host3, bridge);
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
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D。', 'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D view is kept.');
    updateViewNotes();
    resizeCv();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { acted(); setView('3d'); emit('view', { mode: '3d' }); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });
  ['Tilt', 'Top', 'Side'].forEach(function (k) {
    $('cam' + k).addEventListener('click', function () { if (view3) { view3.camTo(k.toLowerCase()); bridge.onCam(k.toLowerCase()); } });
  });

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  readSliders();
  updateSoundButton();
  function themeChanged() {
    readColors(); imgKey = {};
    applyMode(); setErode(state.erode);
    updateSoundButton(); compute(); updateReadouts();
    if (view3 && view3.active) view3.onTheme();
    requestDraw();
  }
  const dm = window.matchMedia('(prefers-color-scheme: dark)');
  if (dm.addEventListener) dm.addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  window.addEventListener('lab:langchange', themeChanged);
  if (window.ResizeObserver) {
    let lw = 0, lh = 0, gw = 0;
    new ResizeObserver(function () {
      if (cv.clientWidth !== lw || cv.clientHeight !== lh || gr.clientWidth !== gw) { lw = cv.clientWidth; lh = cv.clientHeight; gw = gr.clientWidth; if (gw > 0) resizeCv(); }
    }).observe(stage);
  } else window.addEventListener('resize', resizeCv);
  applyMode();
  resizeCv();
  compute();
  lastCrit = F.st.crit; lastReg = F.st.regime;
  refreshOutputs();
  updateReadouts();
  document.addEventListener('visibilitychange', function () { if (!document.hidden) requestDraw(); });
  setStatus(T('5 km 深、SH 南北向；Sv 最大，是正斷層的應力狀態，但還沒達到破裂。', '5 km deep, SH north–south; Sv is the largest, a normal-faulting regime, but not yet at failure.'));
  requestDraw();
  // 測試用（Playwright）
  window.__ff = { state: state, K: K, snapshot: snapshot, setView: setView, F: function () { return F; }, Fo: function () { return Fo; },
    set: function (o) { acted(); Object.keys(o).forEach(function (k) { if (el[k]) setRange(el[k], o[k]); }); readSliders(); refreshAll(); emitState(true); },
    mode: function (m) { acted(); state.mode = m; applyMode(); refreshAll(); if (view3) view3.rebuild(); emitState(true); },
    erode: function (on) { acted(); setErode(on); refreshAll(); emitState(true); },
    plane: function (p) { acted(); state.plane = p; setSeg('planeSeg', 'data-plane', p); refreshAll(); emitState(true); } };
})();
