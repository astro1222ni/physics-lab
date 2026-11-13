/* energy-flow.js — 「生態系的能量流動」的畫面與互動（計算全部在 energy-flow-core.js；3D 在 energy-flow-3d.js，切換時才載入） */
(function () {
  'use strict';
  const K = window.EFCore;
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

  // =====================================================================
  // 顏色、數字
  // =====================================================================
  const C = {};
  const KEYS = ['ef-l1', 'ef-l2', 'ef-l3', 'ef-l4', 'ef-l5', 'ef-l6', 'ef-sun', 'ef-heat', 'ef-det', 'ef-store', 'ef-poll'];
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    KEYS.forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
  }
  function lvCol(n) { return C['ef-l' + (n + 1)]; }

  /** 把數字拆成 { m: 字串, e: 指數或 null }：太大或太小時用科學記號 */
  function split(v, sig) {
    sig = sig || 3;
    if (v == null || !isFinite(v)) return { m: '—', e: null };
    if (v === 0) return { m: '0', e: null };
    const a = Math.abs(v);
    if (a >= 1e7 || a < 1e-3) {
      let e = Math.floor(Math.log10(a)), m = v / Math.pow(10, e);
      if (Math.abs(+m.toFixed(sig - 1)) >= 10) { m /= 10; e++; }
      return { m: m.toFixed(sig - 1).replace('-', '−'), e: e };
    }
    if (a >= 100) return { m: Math.round(v).toLocaleString('en-US').replace('-', '−'), e: null };
    const d = Math.max(0, sig - 1 - Math.floor(Math.log10(a)));
    return { m: v.toFixed(d).replace('-', '−'), e: null };
  }
  /** HTML 版（上標用 <sup>） */
  function fmtH(v, sig) {
    const s = split(v, sig);
    return s.e == null ? s.m : s.m + ' × 10<sup>' + String(s.e).replace('-', '−') + '</sup>';
  }
  /** 純文字版（給 aria、狀態列）：上標寫成 ^ */
  function fmtT(v, sig) {
    const s = split(v, sig);
    return s.e == null ? s.m : s.m + ' × 10^' + String(s.e).replace('-', '−');
  }
  function pct(v, d) {
    if (v == null || !isFinite(v)) return '—';
    const x = v * 100;
    if (d == null) d = x >= 10 ? 1 : x >= 1 ? 2 : x >= 0.01 ? 3 : 4;
    return x.toFixed(d) + '%';
  }
  /** 質量：輸入 g，輸出合適的單位 */
  function fmtMass(g) {
    if (g >= 1e6) return fmtT(g / 1e6) + ' t';
    if (g >= 1e3) return fmtT(g / 1e3) + ' kg';
    if (g >= 1) return fmtT(g) + ' g';
    if (g >= 1e-3) return fmtT(g * 1e3) + ' mg';
    if (g >= 1e-6) return fmtT(g * 1e6) + ' µg';
    return fmtT(g * 1e9) + ' ng';
  }
  /** 面積：輸入 m²，輸出 m² 或 km² */
  function fmtArea(m2) {
    if (!isFinite(m2)) return '—';
    if (m2 >= 1e6) return fmtT(m2 / 1e6) + ' km²';
    return fmtT(m2) + ' m²';
  }
  /** 畫布上畫數字（科學記號時上標自己畫） */
  function drawNum(g, v, x, y, col, align, size, weight, suffix) {
    const s = split(v), font = (weight ? weight + ' ' : '') + size + 'px ' + FONT;
    suffix = suffix || '';
    if (s.e == null) { D.haloText(g, s.m + suffix, x, y, col, align, 'middle', font); return; }
    const base = s.m + ' × 10', sup = String(s.e).replace('-', '−');
    g.font = font;
    const wb = g.measureText(base).width;
    g.font = (weight ? weight + ' ' : '') + Math.round(size * 0.7) + 'px ' + FONT;
    const ws = g.measureText(sup).width;
    g.font = font;
    const wx = suffix ? g.measureText(suffix).width : 0;
    const tot = wb + ws + 1 + wx;
    const x0 = align === 'right' ? x - tot : align === 'center' ? x - tot / 2 : x;
    D.haloText(g, base, x0, y, col, 'left', 'middle', font);
    D.haloText(g, sup, x0 + wb + 1, y - size * 0.38, col, 'left', 'middle', (weight ? weight + ' ' : '') + Math.round(size * 0.7) + 'px ' + FONT);
    if (suffix) D.haloText(g, suffix, x0 + wb + ws + 1, y, col, 'left', 'middle', font);
  }

  // =====================================================================
  // 狀態
  // =====================================================================
  const st = {
    preset: 'grass', custom: false,
    p: K.params('grass'),
    names: K.PRESETS.grass.lv.map(function (l) { return { zh: l.zh, en: l.en }; }),
    sel: 1, view: 'energy', scale: 'log',
    touched: false, r: null,
    trace: null
  };
  function lvName(n) { const o = st.names[n]; return T(o.zh, o.en); }
  function lvLabel(n) { return T('第 ' + (n + 1) + ' 階', 'Level ' + (n + 1)); }

  const el = {
    nLv: $('nLv'), sun: $('sun'), eps: $('eps'), rp: $('rp'), ce: $('ce'), ae: $('ae'), pe: $('pe'),
    pb: $('pb'), ms: $('ms'), dec: $('dec'), bcf: $('bcf'), alpha: $('alpha'), elim: $('elim')
  };
  // 對數滑桿
  const pow10 = function (x) { return Math.pow(10, x); };
  function regLog(r, dec, unitMul) {
    if (!window.LabNum) return;
    window.LabNum.register(r, { toValue: pow10, toPos: Math.log10, min: pow10(+r.min), max: pow10(+r.max), decimals: dec });
  }
  regLog(el.sun, 0); regLog(el.pb, 2); regLog(el.ms, 6); regLog(el.bcf, 0);

  function setSlider(r, v) {
    if (window.LabNum) window.LabNum.set(r, v);
    else r.value = (r === el.sun || r === el.pb || r === el.ms || r === el.bcf) ? Math.log10(v) : v;
  }
  /** 依目前狀態把所有滑桿放到正確位置 */
  function syncSliders() {
    const p = st.p, l = p.lv[st.sel];
    setSlider(el.nLv, p.N);
    setSlider(el.sun, p.I);
    setSlider(el.eps, +(p.eps * 100).toFixed(4));
    setSlider(el.rp, +(p.rp * 100).toFixed(4));
    setSlider(el.dec, +(p.dec * 100).toFixed(4));
    setSlider(el.bcf, p.bcf);
    setSlider(el.alpha, +(p.alpha * 100).toFixed(4));
    setSlider(el.elim, +(p.elim * 100).toFixed(4));
    if (st.sel > 0) {
      setSlider(el.ce, +(l.ce * 100).toFixed(4));
      setSlider(el.ae, +(l.ae * 100).toFixed(4));
      setSlider(el.pe, +(l.pe * 100).toFixed(4));
    }
    setSlider(el.pb, l.pb);
    setSlider(el.ms, l.mass * 1000);       // mg
  }
  /** 從滑桿讀回參數 */
  function readSliders(which) {
    const p = st.p, l = p.lv[st.sel];
    switch (which) {
      case 'nLv': p.N = Math.round(val(el.nLv)); if (st.sel > p.N - 1) st.sel = p.N - 1; break;
      case 'sun': p.I = val(el.sun); break;
      case 'eps': p.eps = val(el.eps) / 100; break;
      case 'rp': p.rp = val(el.rp) / 100; break;
      case 'dec': p.dec = val(el.dec) / 100; break;
      case 'bcf': p.bcf = val(el.bcf); break;
      case 'alpha': p.alpha = val(el.alpha) / 100; break;
      case 'elim': p.elim = val(el.elim) / 100; break;
      case 'ce': l.ce = val(el.ce) / 100; break;
      case 'ae': l.ae = val(el.ae) / 100; break;
      case 'pe': l.pe = val(el.pe) / 100; break;
      case 'pb': l.pb = val(el.pb); break;
      case 'ms': l.mass = val(el.ms) / 1000; break;
    }
  }
  function renderOutputs() {
    const p = st.p, l = p.lv[st.sel];
    $('nLvo').textContent = String(p.N);
    $('suno').innerHTML = fmtH(p.I) + ' kJ';
    $('epso').textContent = (p.eps * 100).toFixed(2) + '%';
    $('rpo').textContent = +(p.rp * 100).toFixed(1) + '%';
    $('deco').textContent = +(p.dec * 100).toFixed(1) + '%';
    $('bcfo').innerHTML = fmtH(p.bcf) + T(' 倍', '×');
    $('alphao').textContent = +(p.alpha * 100).toFixed(1) + '%';
    $('elimo').textContent = +(p.elim * 100).toFixed(1) + '%';
    $('ceo').textContent = +(l.ce * 100).toFixed(1) + '%';
    $('aeo').textContent = +(l.ae * 100).toFixed(1) + '%';
    $('peo').textContent = +(l.pe * 100).toFixed(1) + '%';
    $('pbo').innerHTML = fmtH(l.pb) + T(' 次/年', ' /yr');
    $('mso').textContent = fmtMass(l.mass);
    $('consumerSliders').hidden = st.sel === 0;
  }

  // ---------- 預設組、階層選擇 ----------
  const PRESET_KEYS = ['grass', 'ocean', 'forest'];
  function renderPresets() {
    $('presets').innerHTML = PRESET_KEYS.map(function (k) {
      const pr = K.PRESETS[k];
      return '<button type="button" data-p="' + k + '" aria-pressed="' + (k === st.preset && !st.custom) + '">' + T(pr.zh, pr.en) + '</button>';
    }).join('');
  }
  function renderLvChips() {
    let h = '';
    for (let n = 0; n < st.p.N; n++) {
      h += '<button type="button" data-l="' + n + '" aria-pressed="' + (n === st.sel) + '"><i style="background:' + lvCol(n) + '"></i>' +
        (n + 1) + '・' + lvName(n) + '</button>';
    }
    $('lvChips').innerHTML = h;
  }
  function loadPreset(k) {
    st.preset = k; st.custom = false;
    st.p = K.params(k);
    st.names = K.PRESETS[k].lv.map(function (l) { return { zh: l.zh, en: l.en }; });
    st.sel = Math.min(1, st.p.N - 1);
  }

  // =====================================================================
  // 計算、事件
  // =====================================================================
  let emitTimer = 0;
  function emit() {
    if (!window.LabMission || !st.touched) return;
    const d = K.eventData(st.p, st.view);
    window.LabMission.emit('flow', d);
  }
  function scheduleEmit() {
    if (!st.touched) return;
    clearTimeout(emitTimer);
    emitTimer = setTimeout(emit, 500);
  }
  function recompute() {
    st.r = K.compute(st.p);
    stopTrace();
    renderRo(); renderTable();
    dirty1 = true; request1(); request2();
    if (view3 && view3.active) view3.update();
  }

  // =====================================================================
  // 讀數、表格
  // =====================================================================
  function renderRo() {
    const r = st.r, N = r.N, top = N - 1;
    const row = function (dt, dd) { return '<div><dt>' + dt + '</dt><dd>' + dd + '</dd></div>'; };
    let h = '';
    h += row(T('總生產量 GPP', 'Gross primary production'), fmtH(r.GPP) + ' <small>kJ/m²・' + T('年', 'yr') + T('（日照的 ', ' (') + pct(st.p.eps, 2) + T('）', ' of the sunlight)') + '</small>');
    h += row(T('淨生產量 NPP', 'Net primary production'), fmtH(r.NPP) + ' <small>kJ/m²・' + T('年', 'yr') + '</small>');
    if (N > 1) {
      h += row(T('第 ' + N + ' 階同化的能量', 'Assimilated by level ' + N), fmtH(r.A[top]) + ' <small>' + T('占 GPP 的 ', '') + pct(r.chain) + T('', ' of GPP') + '</small>');
      h += row(T('第 ' + N + ' 階的淨生產量', 'Net production of level ' + N), fmtH(r.P[top]) + ' <small>kJ/m²・' + T('年', 'yr') + '</small>');
    }
    h += row(T('呼吸散失的熱', 'Lost as heat by respiration'), fmtH(r.heat) + ' <small>' + T('占 GPP 的 ', '') + pct(r.heat / r.GPP) + T('', ' of GPP') + '</small>');
    h += row(T('累積成有機質', 'Stored as organic matter'), fmtH(r.store) + ' <small>' + T('占 GPP 的 ', '') + pct(r.store / r.GPP) + T('', ' of GPP') + '</small>');
    h += row(T('能量帳', 'Energy account'), T('熱 + 累積 = GPP', 'heat + stored = GPP') + (Math.abs(r.balance) <= 1e-9 * r.GPP ? ' ✓' : ' ✗') +
      ' <small>' + T('一千焦也沒有憑空消失', 'not a single kilojoule appears or vanishes') + '</small>');
    if (N > 1) {
      h += row(T('頂端的污染物', 'Pollutant at the top'), T('水的 ', '') + fmtH(r.conc[top]) + T(' 倍', ' × the water'));
      h += row(T('頂端每一個個體需要', 'Area per top individual'), fmtArea(r.area[top]) +
        ' <small>' + lvName(top) + T('，一隻 ', ', one weighs ') + fmtMass(st.p.lv[top].mass) + '</small>');
    }
    $('ro').innerHTML = h;
  }
  function renderTable() {
    const r = st.r, N = r.N;
    let h = '<thead><tr><th>' + T('營養階層', 'Trophic level') + '</th><th>' + T('吃進', 'Eaten') + '</th><th>' + T('同化 A', 'Assimilated A') + '</th><th>' +
      T('呼吸 R', 'Respired R') + '</th><th>' + T('淨生產 P', 'Net prod. P') + '</th><th>' + T('傳遞效率', 'Transfer eff.') + '</th><th>' +
      T('生物量 g/m²', 'Biomass g/m²') + '</th><th>' + T('個體/m²', 'Individuals/m²') + '</th><th>' + T('污染物（水 = 1）', 'Pollutant (water = 1)') + '</th></tr></thead><tbody>';
    for (let n = N - 1; n >= 0; n--) {
      h += '<tr' + (n === st.sel ? ' class="sel"' : '') + '><td><i style="background:' + lvCol(n) + '"></i>' + (n + 1) + '・' + lvName(n) + '</td>' +
        '<td>' + (n ? fmtH(r.In[n]) : '—') + '</td><td>' + fmtH(r.A[n]) + '</td><td>' + fmtH(r.R[n]) + '</td><td>' + fmtH(r.P[n]) + '</td>' +
        '<td>' + (n ? pct(r.E[n]) : '—') + '</td><td>' + fmtH(r.mass[n]) + '</td><td>' + fmtH(r.num[n]) + '</td><td>' + fmtH(r.conc[n]) + '</td></tr>';
    }
    h += '</tbody>';
    $('lvt').innerHTML = h;
    $('lvt').setAttribute('aria-label', T('各營養階層的能量（kJ/m²・年）、生物量、個體數與污染物濃度', 'Energy (kJ/m² per year), biomass, numbers and pollutant for each trophic level'));
  }

  // =====================================================================
  // 共用
  // =====================================================================
  function sound() { const S0 = window.LabSound; return S0 && S0.enabled() ? S0 : null; }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  function sndClick(f) { const S0 = sound(); if (S0) S0.tone({ freq: f || 523, dur: 0.07, gain: 0.03, type: 'triangle' }); }
  function setStatus(s) { $('status').textContent = s; }
  function say(s) { const e = $('srSay'); e.textContent = ''; setTimeout(function () { e.textContent = s; }, 30); }
  function fit(c, g, h) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth || 300;
    c.style.height = h + 'px';
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: w, h: h, dpr: dpr };
  }
  function small(g, s, x, y, col, align, size, weight) { D.haloText(g, s, x, y, col || D.c.muted, align || 'left', 'middle', (weight ? weight + ' ' : '') + (size || 11) + 'px ' + FONT); }
  function pillAt(g, s, x, y, col, size, align) {
    size = size || 12;
    g.font = '600 ' + size + 'px ' + FONT;
    const w = g.measureText(s).width + 14, h = size + 9;
    const x0 = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
    D.roundRect(g, x0, y - h / 2, w, h, h / 2);
    g.fillStyle = D.alpha(D.c.surface, D.dark ? 0.82 : 0.9); g.fill();
    g.strokeStyle = D.alpha(col, 0.7); g.lineWidth = 1.2; g.stroke();
    g.fillStyle = col; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText(s, x0 + 7, y + 0.5);
    return w;
  }

  /** 太長的文字截短加「…」 */
  function fitText(g, s, maxW, font) {
    g.font = font;
    if (g.measureText(s).width <= maxW) return s;
    let t = s;
    while (t.length > 2 && g.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    return t + '…';
  }
  /** 含數字的膠囊（科學記號時上標自己畫）；xr 是右緣 */
  function pillNum(g, pre, v, suf, xr, y, col, size) {
    const sp = split(v), f = '600 ' + size + 'px ' + FONT, fe = '600 ' + Math.round(size * 0.7) + 'px ' + FONT;
    const base = pre + sp.m + (sp.e == null ? '' : ' × 10'), ex = sp.e == null ? '' : String(sp.e).replace('-', '−');
    g.font = f; const wb = g.measureText(base).width, wsuf = g.measureText(suf).width;
    g.font = fe; const we = ex ? g.measureText(ex).width + 1 : 0;
    const w = wb + we + wsuf + 14, h = size + 9, x0 = xr - w;
    D.roundRect(g, x0, y - h / 2, w, h, h / 2);
    g.fillStyle = D.alpha(D.c.surface, D.dark ? 0.85 : 0.92); g.fill();
    g.strokeStyle = D.alpha(col, 0.75); g.lineWidth = 1.2; g.stroke();
    g.fillStyle = col; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.font = f; g.fillText(base, x0 + 7, y + 0.5);
    if (ex) { g.font = fe; g.fillText(ex, x0 + 7 + wb + 1, y - size * 0.32); }
    g.font = f; g.fillText(suf, x0 + 7 + wb + we, y + 0.5);
  }

  // =====================================================================
  // 一、能量流動圖
  // =====================================================================
  const cv = $('cv'), g1 = cv.getContext('2d');
  let L1 = null, layer1 = null, dirty1 = true, paths = [];
  function height1(w) {
    const N = st.p.N, narrow = w < 560;
    return Math.max(330, Math.round(170 + N * (narrow ? 66 : 62)));
  }
  function layout1() {
    const w = cv.clientWidth || 300;
    const s = fit(cv, g1, height1(w));
    const narrow = s.w < 560;
    const bw = narrow ? Math.min(176, s.w * 0.46) : Math.min(250, s.w * 0.34);
    const cx = narrow ? s.w * 0.5 : s.w * 0.44;
    L1 = { w: s.w, h: s.h, dpr: s.dpr, narrow: narrow, bw: bw, cx: cx, bh: narrow ? 40 : 44 };
    layer1 = document.createElement('canvas');
    layer1.width = cv.width; layer1.height = cv.height;
    dirty1 = true;
  }
  function geom() {
    const Lg = L1, N = st.p.N;
    const soilTop = Lg.h - 92, top = Lg.narrow ? 46 : 40;
    const slot = (soilTop - 24 - top) / N;
    const ys = [];
    for (let n = 0; n < N; n++) ys[n] = soilTop - 24 - slot * (n + 0.5);
    const x0 = Lg.cx - Lg.bw / 2, x1 = Lg.cx + Lg.bw / 2;
    const xd = x0 - (Lg.narrow ? 26 : 40);                  // 碎屑往下的通道
    const xh = Math.min(Lg.w - 8, x1 + (Lg.narrow ? (Lg.w - x1) * 0.62 : Math.min(150, (Lg.w - x1) * 0.55)));  // 熱的箭頭終點
    return { N: N, ys: ys, x0: x0, x1: x1, xd: xd, xh: xh, soilTop: soilTop, top: top, slot: slot,
      decY: soilTop + 30, decX0: Math.max(8, xd - 14), decX1: x1 };
  }
  /** 箭頭寬度：與能量的立方根成正比 */
  function wOf(v, vmax, wmax) { if (!(v > 0)) return 0; return Math.max(1.2, wmax * Math.cbrt(v / vmax)); }

  function wavyPath(x0, y, x1, amp, k) {
    const pts = [];
    const n = Math.max(8, Math.round((x1 - x0) / 6));
    for (let i = 0; i <= n; i++) {
      const u = i / n, x = x0 + (x1 - x0) * u;
      pts.push([x, y - amp * Math.sin(u * Math.PI * k) * Math.min(1, u * 3) - u * 6]);
    }
    return pts;
  }
  function strokePts(g, pts, col, w, alpha) {
    g.save();
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.strokeStyle = D.alpha(D.c['canvas-bg'], 0.7); g.lineWidth = w + 3; g.stroke();
    g.strokeStyle = alpha == null ? col : D.alpha(col, alpha); g.lineWidth = w; g.stroke();
    g.strokeStyle = D.alpha(D.shade(col, 0.55), D.dark ? 0.3 : 0.45); g.lineWidth = Math.max(0.6, w * 0.25);
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1] - w * 0.15);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1] - w * 0.15);
    g.stroke();
    g.restore();
  }
  function headAt(g, pts, col, w) {
    const a = pts[pts.length - 2], b = pts[pts.length - 1];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
    const hl = Math.max(7, w * 1.3), hw = Math.max(5, w * 0.95);
    g.beginPath();
    g.moveTo(b[0] + ux * hl * 0.6, b[1] + uy * hl * 0.6);
    g.lineTo(b[0] - ux * hl * 0.4 - uy * hw, b[1] - uy * hl * 0.4 + ux * hw);
    g.lineTo(b[0] - ux * hl * 0.4 + uy * hw, b[1] - uy * hl * 0.4 - ux * hw);
    g.closePath();
    g.fillStyle = col; g.fill();
  }
  function plen(pts) { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return s; }
  function pointAt(pts, d) {
    for (let i = 1; i < pts.length; i++) {
      const s = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (d <= s || i === pts.length - 1) { const u = s ? Math.min(1, d / s) : 0; return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u]; }
      d -= s;
    }
    return pts[pts.length - 1];
  }

  /** 畫靜態的能量流動圖到 layer1，並記下粒子要走的路徑 */
  function drawStatic1() {
    const g = layer1.getContext('2d');
    g.setTransform(L1.dpr, 0, 0, L1.dpr, 0, 0);
    const w = L1.w, h = L1.h, G = geom(), r = st.r, N = G.N, bh = L1.bh;
    const vmax = r.GPP, WM = L1.narrow ? 26 : 34;
    paths = [];
    D.backdrop(g, w, h);
    // 標題
    D.haloText(g, T('能量流動（kJ/m²・年）', 'Energy flow (kJ/m² per year)'), 10, 16, D.c.text, 'left', 'middle', '600 ' + (L1.narrow ? 12.5 : 13.5) + 'px ' + FONT);
    if (L1.narrow) small(g, T('箭頭粗細 ∝ 能量的立方根（示意）', 'arrow width ∝ cube root of energy (not to scale)'), 10, 31, D.c.muted, 'left', 10);
    else small(g, T('箭頭粗細 ∝ 能量的立方根（示意）', 'arrow width ∝ cube root of energy (not to scale)'), w - 10, 16, D.c.muted, 'right', 11);

    // 土壤與分解者
    const sg = g.createLinearGradient(0, G.soilTop, 0, h);
    sg.addColorStop(0, D.alpha(C['ef-det'], D.dark ? 0.22 : 0.16));
    sg.addColorStop(1, D.alpha(C['ef-store'], D.dark ? 0.38 : 0.3));
    g.fillStyle = sg; g.fillRect(0, G.soilTop, w, h - G.soilTop);
    g.strokeStyle = D.alpha(C['ef-det'], 0.55); g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(0, G.soilTop); g.lineTo(w, G.soilTop); g.stroke();
    // 土裡的小石子（裝飾）
    for (let i = 0; i < 24; i++) {
      const x = ((i * 97.3) % w), y = G.soilTop + 8 + ((i * 53.7) % (h - G.soilTop - 14));
      g.fillStyle = D.alpha(C['ef-store'], 0.18 + (i % 3) * 0.06);
      g.beginPath(); g.ellipse(x, y, 2 + (i % 4), 1.4 + (i % 3) * 0.6, 0, 0, Math.PI * 2); g.fill();
    }

    // ---- 碎屑通道（各階往左、再往下）----
    let cum = 0;
    const det = [];
    for (let n = 0; n < N; n++) det[n] = r.U[n] + r.F[n];
    for (let n = N - 1; n >= 0; n--) {
      const y = G.ys[n], wd = wOf(det[n], vmax, WM);
      const pts = [[G.x0 - 2, y + bh * 0.18], [G.xd, y + bh * 0.18]];
      strokePts(g, pts, C['ef-det'], wd, 0.85);
      paths.push({ pts: pts, col: C['ef-det'], w: wd, v: det[n] });
      cum += det[n];
      const yNext = n > 0 ? G.ys[n - 1] + bh * 0.18 : G.decY - 18;
      const wc = wOf(cum, vmax, WM);
      const pts2 = [[G.xd, y + bh * 0.18], [G.xd, yNext]];
      strokePts(g, pts2, C['ef-det'], wc, 0.85);
      paths.push({ pts: pts2, col: C['ef-det'], w: wc, v: cum });
      if (n === 0) headAt(g, pts2, C['ef-det'], wc);
    }

    // ---- 太陽 ----
    const rs = L1.narrow ? 13 : 16;
    const sx = L1.narrow ? Math.max(rs + 10, Math.min(G.xd - 34, 34)) : Math.max(40, G.xd - 110);
    const syy = Math.max(G.top + rs * 2.6, G.ys[0] - bh * (L1.narrow ? 1.25 : 1.1));
    const glow = g.createRadialGradient(sx, syy, 0, sx, syy, rs * 2.6);
    glow.addColorStop(0, D.alpha(C['ef-sun'], 0.55)); glow.addColorStop(1, D.alpha(C['ef-sun'], 0));
    g.fillStyle = glow; g.beginPath(); g.arc(sx, syy, rs * 2.6, 0, Math.PI * 2); g.fill();
    g.save(); g.strokeStyle = C['ef-sun']; g.lineWidth = 2; g.lineCap = 'round';
    for (let i = 0; i < 10; i++) {
      const a = i * Math.PI / 5;
      g.beginPath(); g.moveTo(sx + Math.cos(a) * rs * 1.25, syy + Math.sin(a) * rs * 1.25); g.lineTo(sx + Math.cos(a) * rs * 1.65, syy + Math.sin(a) * rs * 1.65); g.stroke();
    }
    g.restore();
    D.ball(g, sx, syy, rs, C['ef-sun']);
    // 光線進入生產者
    const beam = [[sx + rs * 0.8, syy + rs * 0.6], [G.x0 + 10, G.ys[0] - bh / 2 + 4]];
    strokePts(g, beam, C['ef-sun'], L1.narrow ? 6 : 8, 0.75);
    headAt(g, beam, C['ef-sun'], L1.narrow ? 6 : 8);
    paths.push({ pts: beam, col: C['ef-sun'], w: 7, v: r.GPP, sun: true });
    // 日照的文字放在太陽上方或右邊
    const ix = L1.narrow ? 8 : sx - rs * 1.4, iy = L1.narrow ? syy - rs * 2.6 : syy + rs * 2.6;
    small(g, T('日照 I', 'Sunlight I'), ix, iy - 7, C['ef-sun'], 'left', L1.narrow ? 10.5 : 11.5, 600);
    drawNum(g, st.p.I, ix, iy + 7, D.c.muted, 'left', L1.narrow ? 10.5 : 11, null);

    // ---- 熱（每階往右的波浪箭頭）----
    for (let n = 0; n < N; n++) {
      const y = G.ys[n] - bh * 0.12, wh = wOf(r.R[n], vmax, WM);
      const pts = wavyPath(G.x1 + 2, y, G.xh - 6, Math.min(5, 2 + wh * 0.15), 3);
      strokePts(g, pts, C['ef-heat'], wh, 0.8);
      headAt(g, pts, C['ef-heat'], wh);
      paths.push({ pts: pts, col: C['ef-heat'], w: wh, v: r.R[n], heat: true });
      const lx = L1.narrow ? G.xh - 2 : G.xh + 4, la = L1.narrow ? 'right' : 'left';
      const ly = L1.narrow ? y - 12 - Math.max(6, wh / 2 + 6) : y - 7;
      if (!L1.narrow) small(g, T('熱 R', 'Heat R'), lx, ly, C['ef-heat'], la, 11, 600);
      drawNum(g, r.R[n], lx, L1.narrow ? ly : ly + 13, L1.narrow ? C['ef-heat'] : D.c.muted, la, L1.narrow ? 10.5 : 11, L1.narrow ? 600 : null);
    }
    if (!L1.narrow) small(g, T('呼吸作用散失的熱', 'heat lost in respiration'), G.xh + 4, 34, C['ef-heat'], 'left', 11, 600);

    // ---- 往上傳的能量 ----
    for (let n = 1; n < N; n++) {
      const yb = G.ys[n - 1] - bh / 2, yt = G.ys[n] + bh / 2;
      const wi = wOf(r.In[n], vmax, WM), xa = G.cx || L1.cx;
      const pts = [[L1.cx, yb - 1], [L1.cx, yt + 2]];
      strokePts(g, pts, lvCol(n), wi, 0.9);
      headAt(g, pts, lvCol(n), wi);
      paths.push({ pts: pts, col: lvCol(n), w: wi, v: r.In[n] });
      // 傳遞效率
      const my = (yb + yt) / 2;
      pillAt(g, T('效率 ', 'E = ') + pct(r.E[n]), L1.cx + Math.max(10, wi / 2 + 8), my, D.shade(lvCol(n), D.dark ? 0.2 : -0.25), L1.narrow ? 10.5 : 11.5, 'left');
      void xa;
    }

    // ---- 各階方塊 ----
    for (let n = 0; n < N; n++) {
      const y = G.ys[n], col = lvCol(n), sel = n === st.sel;
      g.save();
      g.shadowColor = D.dark ? 'rgba(0,0,0,0.5)' : D.alpha(D.c.text, 0.2); g.shadowBlur = 10; g.shadowOffsetY = 3;
      D.roundRect(g, G.x0, y - bh / 2, L1.bw, bh, 10);
      const gr = g.createLinearGradient(0, y - bh / 2, 0, y + bh / 2);
      gr.addColorStop(0, D.shade(col, D.dark ? -0.35 : 0.62)); gr.addColorStop(1, D.shade(col, D.dark ? -0.55 : 0.42));
      g.fillStyle = gr; g.fill();
      g.restore();
      D.roundRect(g, G.x0 + 0.5, y - bh / 2 + 0.5, L1.bw - 1, bh - 1, 9.5);
      g.strokeStyle = sel ? D.c.accent : D.alpha(col, 0.85); g.lineWidth = sel ? 2.4 : 1.4; g.stroke();
      // 左邊的色條
      D.roundRect(g, G.x0 + 4, y - bh / 2 + 5, 5, bh - 10, 2.5); g.fillStyle = col; g.fill();
      const fs = L1.narrow ? 11.5 : 12.5;
      D.haloText(g, fitText(g, (n + 1) + '・' + lvName(n), L1.bw - 22, '600 ' + fs + 'px ' + FONT), G.x0 + 15, y - bh * 0.2, D.c.text, 'left', 'middle', '600 ' + fs + 'px ' + FONT);
      small(g, T('同化 A', 'A'), G.x0 + 15, y + bh * 0.23, D.c.muted, 'left', L1.narrow ? 10 : 11);
      g.font = (L1.narrow ? 10 : 11) + 'px ' + FONT;
      const aw = g.measureText(T('同化 A', 'A')).width;
      drawNum(g, r.A[n], G.x0 + 15 + aw + 5, y + bh * 0.23, D.c.text, 'left', L1.narrow ? 10.5 : 11.5, 600);
    }

    // ---- 分解者 ----
    const dy = G.decY;
    D.roundRect(g, G.decX0, dy - 18, G.decX1 - G.decX0, 36, 10);
    const dg = g.createLinearGradient(0, dy - 18, 0, dy + 18);
    dg.addColorStop(0, D.shade(C['ef-det'], D.dark ? -0.3 : 0.55)); dg.addColorStop(1, D.shade(C['ef-det'], D.dark ? -0.5 : 0.35));
    g.fillStyle = dg; g.fill();
    g.strokeStyle = D.alpha(C['ef-det'], 0.9); g.lineWidth = 1.4; g.stroke();
    D.haloText(g, T('分解者', 'Decomposers'), G.decX0 + 12, dy - 5, D.c.text, 'left', 'middle', '600 ' + (L1.narrow ? 11.5 : 12.5) + 'px ' + FONT);
    small(g, T('碎屑 D', 'Detritus D'), G.decX0 + 12, dy + 9, D.c.muted, 'left', L1.narrow ? 10 : 11);
    g.font = (L1.narrow ? 10 : 11) + 'px ' + FONT;
    drawNum(g, r.D, G.decX0 + 12 + g.measureText(T('碎屑 D', 'Detritus D')).width + 5, dy + 9, D.c.text, 'left', L1.narrow ? 10.5 : 11, 600);
    // 分解者的熱
    const wdh = wOf(r.Rd, vmax, WM);
    const ptsd = wavyPath(G.decX1 + 2, dy - 4, G.xh - 6, Math.min(5, 2 + wdh * 0.15), 3);
    strokePts(g, ptsd, C['ef-heat'], wdh, 0.8); headAt(g, ptsd, C['ef-heat'], wdh);
    paths.push({ pts: ptsd, col: C['ef-heat'], w: wdh, v: r.Rd, heat: true });
    drawNum(g, r.Rd, L1.narrow ? G.xh - 2 : G.xh + 4, dy - 4 - (L1.narrow ? Math.max(12, wdh / 2 + 12) : 0), L1.narrow ? C['ef-heat'] : D.c.muted, L1.narrow ? 'right' : 'left', L1.narrow ? 10.5 : 11, L1.narrow ? 600 : null);
    // 累積
    if (r.store > 0) {
      const ws = wOf(r.store, vmax, WM);
      const xs = (G.decX0 + G.decX1) / 2;
      const ptss = [[xs, dy + 18], [xs, h - 16]];
      strokePts(g, ptss, C['ef-store'], ws, 0.85); headAt(g, ptss, C['ef-store'], ws);
      paths.push({ pts: ptss, col: C['ef-store'], w: ws, v: r.store });
      const tx = xs + ws / 2 + 8;
      const sf = '600 ' + (L1.narrow ? 10 : 11) + 'px ' + FONT;
      const stxt = g.measureText ? T('累積（土壤有機質、泥炭）', 'Stored (soil organic matter, peat)') : '';
      g.font = sf;
      small(g, g.measureText(stxt).width <= w - tx - 6 ? stxt : T('累積成有機質', 'Stored'), tx, h - 26, D.c.text, 'left', L1.narrow ? 10 : 11, 600);
      drawNum(g, r.store, tx, h - 12, D.c.muted, 'left', L1.narrow ? 10 : 11, null);
    }
    // 粒子路徑的長度與數量
    paths.forEach(function (pa) {
      pa.len = plen(pa.pts);
      pa.n = Math.max(1, Math.round(pa.len / 34 * Math.min(1, 0.25 + pa.w / 18)));
      pa.speed = pa.heat ? 34 : 42;
    });
    dirty1 = false;
  }

  // ---------- 動畫：沿箭頭流動的小光點；追蹤 1,000 kJ ----------
  let raf1 = 0, t0 = 0, visible1 = true;
  function request1() { if (!raf1) raf1 = requestAnimationFrame(frame1); }
  function frame1(ts) {
    raf1 = 0;
    if (!L1) return;
    if (dirty1) drawStatic1();
    const t = (ts || 0) / 1000;
    g1.setTransform(1, 0, 0, 1, 0, 0);
    g1.clearRect(0, 0, cv.width, cv.height);
    g1.drawImage(layer1, 0, 0);
    g1.setTransform(L1.dpr, 0, 0, L1.dpr, 0, 0);
    if (!reducedMotion) {
      paths.forEach(function (pa) {
        if (!(pa.v > 0)) return;
        const rr = Math.max(1.4, Math.min(3.2, pa.w * 0.28));
        g1.fillStyle = D.alpha(D.shade(pa.col, D.dark ? 0.45 : 0.75), 0.9);
        for (let i = 0; i < pa.n; i++) {
          const d = ((t * pa.speed + i * pa.len / pa.n) % pa.len);
          const q = pointAt(pa.pts, d);
          const fade = Math.min(1, d / 10, (pa.len - d) / 10);
          g1.globalAlpha = Math.max(0, fade);
          g1.beginPath(); g1.arc(q[0], q[1], rr, 0, Math.PI * 2); g1.fill();
        }
      });
      g1.globalAlpha = 1;
    }
    drawTrace();
    if (!reducedMotion && visible1 || st.trace) request1();
  }

  /** 追蹤 1,000 kJ 的日照：依序亮起各階，顯示還剩多少 */
  function startTrace() {
    st.trace = { t0: performance.now(), lastLv: -1 };
    setStatus(T('跟著 1,000 kJ 的陽光往上走……', 'Following 1,000 kJ of sunlight up the chain…'));
    request1();
  }
  function stopTrace() { st.trace = null; }
  function drawTrace() {
    const tr = st.trace; if (!tr || !L1) return;
    const G = geom(), r = st.r, N = G.N;
    const STEP = reducedMotion ? 0.01 : 0.9;
    const el2 = (performance.now() - tr.t0) / 1000;
    const k = Math.min(N, Math.floor(el2 / STEP));        // 已亮起的階數
    for (let n = 0; n < k; n++) {
      const left = 1000 * r.A[n] / st.p.I;
      const col = D.shade(lvCol(n), D.dark ? 0.3 : -0.35);
      const wi = n + 1 < N ? wOf(r.In[n + 1], r.GPP, L1.narrow ? 26 : 34) : 0;
      pillNum(g1, T('還剩 ', 'left: '), left, ' kJ', L1.cx - Math.max(8, wi / 2 + 8), G.ys[n] + L1.bh / 2 + (G.slot - L1.bh) / 2, col, L1.narrow ? 10 : 11);
    }
    if (k > tr.lastLv) {
      for (let n = tr.lastLv + 1; n < k; n++) {
        const S0 = sound();
        if (S0) {
          const frac = r.A[n] / r.A[0];
          S0.tone({ freq: 392 * Math.pow(2, n * 4 / 12), dur: 0.22, gain: Math.max(0.006, 0.04 * Math.pow(frac, 0.25)), type: 'sine' });
          S0.noise({ dur: 0.18, gain: 0.006 + 0.01 * (r.R[n] / r.A[n]), filter: 2200 });
        }
      }
      tr.lastLv = k;
      if (k >= N) {
        const left = 1000 * r.A[N - 1] / st.p.I;
        const msg = T('1,000 kJ 的陽光，到了第 ' + N + ' 階只剩 ' + fmtT(left) + ' kJ 被同化；其他都在路上變成熱、或成為碎屑。',
          'Of 1,000 kJ of sunlight, only ' + fmtT(left) + ' kJ is assimilated by level ' + N + '; the rest became heat or detritus on the way.');
        setStatus(msg); say(msg);
      }
    }
    if (el2 > N * STEP + 6) { st.trace = null; request1(); }
  }

  // 點方塊選階層
  cv.addEventListener('click', function (ev) {
    if (!L1) return;
    const rc = cv.getBoundingClientRect(), x = ev.clientX - rc.left, y = ev.clientY - rc.top, G = geom();
    for (let n = 0; n < G.N; n++) {
      if (x >= G.x0 && x <= G.x1 && Math.abs(y - G.ys[n]) <= L1.bh / 2) { selectLevel(n); return; }
    }
  });
  if (window.LabKeys) {
    window.LabKeys.attach(cv, {
      label: T('能量流動圖：上下方向鍵選擇營養階層，再用右邊的滑桿調整。', 'Energy flow diagram: use the up and down arrows to choose a trophic level, then adjust it with the sliders.'),
      items: [{
        name: function () { return T('營養階層', 'Trophic level'); },
        move: function (dx, dy) { const n = Math.max(0, Math.min(st.p.N - 1, st.sel - dy + dx)); if (n === st.sel) return false; selectLevel(n); return true; },
        describe: function () { const r = st.r; return lvLabel(st.sel) + ' ' + lvName(st.sel) + T('，同化 ', ', assimilates ') + fmtT(r.A[st.sel]) + ' kJ/m²'; }
      }]
    });
  }
  function selectLevel(n) {
    st.sel = n;
    renderLvChips(); syncSliders(); renderOutputs(); renderTable();
    dirty1 = true; request1(); request2();
    sndClick(440 * Math.pow(2, n * 2 / 12));
  }

  // =====================================================================
  // 二、金字塔
  // =====================================================================
  const cv2 = $('cv2'), g2 = cv2.getContext('2d');
  let L2 = null, raf2 = 0;
  function layout2() {
    const w = cv2.clientWidth || 300;
    const s = fit(cv2, g2, Math.round(110 + st.p.N * (w < 560 ? 46 : 48)));
    L2 = { w: s.w, h: s.h, narrow: s.w < 560 };
  }
  function request2() { if (!raf2) raf2 = requestAnimationFrame(function () { raf2 = 0; draw2(); }); }
  const KIND = {
    energy: { zh: '能量金字塔：每年同化的能量', en: 'Pyramid of energy: energy assimilated per year', unit: 'kJ/m²・年', unitEn: 'kJ/m² per yr' },
    biomass: { zh: '生物量金字塔：現存的鮮重', en: 'Pyramid of biomass: standing fresh weight', unit: 'g/m²', unitEn: 'g/m²' },
    numbers: { zh: '個體數金字塔', en: 'Pyramid of numbers', unit: '個/m²', unitEn: '/m²' },
    poll: { zh: '污染物濃度（水 = 1）', en: 'Pollutant concentration (water = 1)', unit: '倍', unitEn: '×' }
  };
  /** 每一階長條的寬度（0–1），2D 與 3D 共用 */
  function barFracs(vals, scale) {
    const vmax = Math.max.apply(null, vals), vmin = Math.min.apply(null, vals);
    if (scale === 'lin') return vals.map(function (v) { return v / vmax; });
    const span = Math.max(1, Math.log10(vmax / vmin)) * 1.12;
    return vals.map(function (v) { return Math.max(0.04, 1 - Math.log10(vmax / v) / span); });
  }
  function draw2() {
    if (!L2) return;
    const g = g2, w = L2.w, h = L2.h, r = st.r, N = r.N;
    g.setTransform(Math.min(2, window.devicePixelRatio || 1), 0, 0, Math.min(2, window.devicePixelRatio || 1), 0, 0);
    D.backdrop(g, w, h);
    const kd = KIND[st.view];
    const vals = K.pyramid(r, st.view);
    const fr = barFracs(vals, st.scale);
    const inv = K.inverted(vals);
    D.haloText(g, T(kd.zh, kd.en), 10, 16, D.c.text, 'left', 'middle', '600 ' + (L2.narrow ? 12.5 : 13.5) + 'px ' + FONT);
    small(g, st.scale === 'log' ? T('寬度：對數刻度', 'width: log scale') : T('寬度：真實比例', 'width: true proportion'), w - 10, 16, D.c.muted, 'right', L2.narrow ? 10.5 : 11);
    const labW = L2.narrow ? 0 : Math.min(150, w * 0.2);
    const valW = L2.narrow ? 0 : Math.min(150, w * 0.2);
    const cx = labW + (w - labW - valW) / 2;
    const wmax = (w - labW - valW) - (L2.narrow ? 20 : 30);
    const top = 40, bottom = h - 26, slot = (bottom - top) / N, bh = Math.min(34, slot * 0.72);
    // 地面
    g.strokeStyle = D.alpha(D.c.text, 0.18); g.lineWidth = 1;
    g.beginPath(); g.moveTo(8, bottom + 4); g.lineTo(w - 8, bottom + 4); g.stroke();
    for (let n = 0; n < N; n++) {
      const y = bottom - slot * (n + 0.5);
      const bw = Math.max(1.5, wmax * fr[n]);
      const col = st.view === 'poll' ? D.mix(C['ef-poll'], lvCol(n), 0.25) : lvCol(n);
      D.block(g, cx - bw / 2, y - bh / 2, bw, bh, col, { r: Math.min(6, bw / 2, bh / 3) });
      const nm = (n + 1) + '・' + lvName(n);
      if (L2.narrow) {
        // 窄螢幕：名字在長條上方左側、數字在右側
        small(g, nm, 10, y - bh / 2 - 6, D.c.text, 'left', 10.5, 600);
        drawNum(g, vals[n], w - 10, y - bh / 2 - 6, D.c.muted, 'right', 10.5, null, ' ' + (st.view === 'poll' ? T('倍', '×') : T(kd.unit, kd.unitEn)));
      } else {
        small(g, nm, labW - 4, y, D.c.text, 'right', 12, 600);
        drawNum(g, vals[n], w - valW + 6, y, D.c.muted, 'left', 11.5, null, ' ' + (st.view === 'poll' ? T('倍', '×') : T(kd.unit, kd.unitEn)));
      }
      if (n > 0 && inv[n] && st.view !== 'poll' && st.view !== 'energy') {
        pillAt(g, T('↑ 倒立：比下面一階大', '↑ inverted: bigger than the level below'), cx, y, D.c.accent, L2.narrow ? 10 : 11, 'center');
      }
    }
    if (st.view === 'poll' && N > 1) {
      small(g, T('越往上越濃：生物放大', 'more concentrated higher up: biomagnification'), 10, h - 10, C['ef-poll'], 'left', L2.narrow ? 10 : 11, 600);
    } else if (st.view === 'energy') {
      small(g, T('能量金字塔不會倒立', 'an energy pyramid never stands on its head'), 10, h - 10, D.c.muted, 'left', L2.narrow ? 10 : 11);
    }
    if (view3 && view3.active) view3.update();
  }
  function renderKinds() {
    $('kinds').querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-k') === st.view)); });
    $('scLog').setAttribute('aria-pressed', String(st.scale === 'log'));
    $('scLin').setAttribute('aria-pressed', String(st.scale === 'lin'));
  }

  // =====================================================================
  // 3D 金字塔（切換時才載入 three.js 與 energy-flow-3d.js）
  // =====================================================================
  const host3 = $('view3'), pyr = $('pyr'), viewMsg = $('viewMsg');
  let view3 = null, threeLib = null, loadToken = 0;
  const bridge = {
    T: T, D: D, K: K,
    colors: function () { readColors(); return Object.assign({}, C); },
    data: function () {
      const vals = K.pyramid(st.r, st.view);
      return {
        N: st.r.N, kind: st.view, scale: st.scale, vals: vals, fracs: barFracs(vals, st.scale), inv: K.inverted(vals),
        names: st.names.slice(0, st.r.N).map(function (o, i) { return (i + 1) + '・' + T(o.zh, o.en); }),
        title: T(KIND[st.view].zh, KIND[st.view].en),
        fmt: fmtT, unit: st.view === 'poll' ? T('倍', '×') : T(KIND[st.view].unit, KIND[st.view].unitEn)
      };
    },
    onContextLost: function () { fail3D(); }
  };
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
    catch (e) { return false; }
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.EF3D) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (threeLib && window.EF3D) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    const own = new URL('js/energy-flow-3d.js' + (SCRIPT_V ? '?v=' + SCRIPT_V : ''), document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js'), loadScript(own)]).then(function (mods) {
      if (!window.EF3D) throw new Error('energy-flow-3d.js did not load');
      threeLib = { THREE: mods[0], OrbitControls: mods[1].OrbitControls };
      return threeLib;
    });
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
      if (!webglAvailable()) { fail3D(); return; }
      viewMsg.textContent = T('正在載入 3D 檢視…', 'Loading the 3D view…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return;
        pyr.classList.add('is3d');
        view3 = window.EF3D.create(lib, host3, bridge);
        viewMsg.textContent = '';
        $('resetCam').hidden = false;
        requestAnimationFrame(function () { if (view3) view3.onShow(); });
      }).catch(function (err) {
        if (token !== loadToken) return;
        if (window.console) console.warn('3D view unavailable:', err);
        fail3D();
      });
    } else {
      loadToken++;
      setPressed('2d');
      if (view3) { view3.dispose(); view3 = null; }
      pyr.classList.remove('is3d');
      if (/3D/.test(viewMsg.textContent) && !/2D/.test(viewMsg.textContent)) viewMsg.textContent = '';
      $('resetCam').hidden = true;
      layout2(); request2();
    }
  }
  function fail3D() {
    if (view3) { try { view3.dispose(); } catch (e) { /* 忽略 */ } view3 = null; }
    pyr.classList.remove('is3d');
    setPressed('2d');
    $('resetCam').hidden = true;
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 金字塔。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D pyramid is kept.');
    layout2(); request2();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });

  // =====================================================================
  // 事件綁定
  // =====================================================================
  function changed(which) {
    st.touched = true;
    if (which) readSliders(which);
    st.custom = true;
    renderPresets();
    renderOutputs();
    recompute();
    scheduleEmit();
  }
  Object.keys(el).forEach(function (k) {
    el[k].addEventListener('input', function () {
      const before = st.p.N;
      changed(k);
      if (k === 'nLv' && st.p.N !== before) {
        renderLvChips(); syncSliders(); renderOutputs();
        layout1(); layout2(); request1(); request2();
        sndClick(392 * Math.pow(2, (st.p.N - 1) * 2 / 12));
      }
    });
  });
  $('presets').addEventListener('click', function (ev) {
    const b = ev.target.closest('button[data-p]'); if (!b) return;
    st.touched = true;
    loadPreset(b.getAttribute('data-p'));
    renderPresets(); renderLvChips(); syncSliders(); renderOutputs();
    layout1(); layout2(); recompute(); scheduleEmit();
    setStatus(T('已換成「' + K.PRESETS[st.preset].zh + '」的示意數值。', 'Switched to the illustrative “' + K.PRESETS[st.preset].en + '” values.'));
    sndClick(587);
  });
  $('resetBtn').addEventListener('click', function () {
    const k = st.preset, N = st.p.N;
    loadPreset(k);
    st.p.N = N; if (st.sel > N - 1) st.sel = N - 1;
    st.touched = true;
    renderPresets(); renderLvChips(); syncSliders(); renderOutputs(); recompute(); scheduleEmit();
    setStatus(T('已恢復「' + K.PRESETS[k].zh + '」的預設值（營養階層數不變）。', 'The “' + K.PRESETS[k].en + '” values are back (the number of levels is kept).'));
  });
  $('lvChips').addEventListener('click', function (ev) {
    const b = ev.target.closest('button[data-l]'); if (!b) return;
    selectLevel(+b.getAttribute('data-l'));
  });
  $('kinds').addEventListener('click', function (ev) {
    const b = ev.target.closest('button[data-k]'); if (!b) return;
    st.view = b.getAttribute('data-k');
    st.touched = true;
    renderKinds(); request2(); scheduleEmit(); sndClick(660);
  });
  $('scLog').addEventListener('click', function () { st.scale = 'log'; renderKinds(); request2(); });
  $('scLin').addEventListener('click', function () { st.scale = 'lin'; renderKinds(); request2(); });
  $('traceBtn').addEventListener('click', startTrace);
  $('soundBtn').addEventListener('click', function () {
    if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound'));
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'sound') updateSoundButton(); });

  function legend1() {
    const dot = function (c) { return '<i class="dot" style="background:' + c + '"></i>'; };
    $('legend1').innerHTML =
      '<span>' + dot(C['ef-sun']) + T('日照', 'Sunlight') + '</span>' +
      '<span>' + dot(C['ef-l2']) + T('往上傳（被吃掉）', 'Passed up (eaten)') + '</span>' +
      '<span>' + dot(C['ef-heat']) + T('呼吸散失的熱', 'Heat from respiration') + '</span>' +
      '<span>' + dot(C['ef-det']) + T('碎屑（沒被吃掉、糞便）', 'Detritus (uneaten, faeces)') + '</span>' +
      '<span>' + dot(C['ef-store']) + T('累積', 'Stored') + '</span>';
  }

  // =====================================================================
  // 啟動
  // =====================================================================
  function resize1() { layout1(); request1(); }
  function resize2() { layout2(); request2(); if (view3 && view3.active) view3.resize(); }
  readColors();
  renderPresets(); renderLvChips(); syncSliders(); renderOutputs(); renderKinds();
  st.r = K.compute(st.p);
  layout1(); layout2();
  renderRo(); renderTable(); legend1(); updateSoundButton();
  request1(); request2();
  setStatus(T('選一個營養階層，調整它被吃掉、吸收、長成身體的比例，看能量怎麼往上流。', 'Pick a trophic level and change how much of it is eaten, absorbed and turned into body, and watch how the energy flows up.'));

  if (window.IntersectionObserver) {
    new IntersectionObserver(function (ents) {
      ents.forEach(function (e) { visible1 = e.isIntersecting; if (visible1) request1(); });
    }).observe(cv);
  }
  document.addEventListener('visibilitychange', function () { visible1 = !document.hidden; if (visible1) request1(); });

  function themeChanged() {
    readColors();
    renderLvChips(); legend1(); renderTable();
    dirty1 = true; request1(); request2();
    if (view3 && view3.active) view3.onTheme();
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  window.addEventListener('lab:langchange', function () {
    renderPresets(); renderLvChips(); renderOutputs(); renderRo(); renderTable(); legend1();
    dirty1 = true; request1(); request2();
    if (view3 && view3.active) view3.onTheme();
  });
  if (window.ResizeObserver) {
    const watch = function (c, fn) { let lw = 0; new ResizeObserver(function () { if (c.clientWidth && c.clientWidth !== lw) { lw = c.clientWidth; fn(); } }).observe(c); };
    watch(cv, resize1); watch(cv2, resize2);
  } else window.addEventListener('resize', function () { resize1(); resize2(); });

  // 測試與縮圖用
  window.__ef = {
    K: K, st: st,
    preset: function (k) { loadPreset(k); renderPresets(); renderLvChips(); syncSliders(); renderOutputs(); layout1(); layout2(); recompute(); },
    set: function (id, v) { const e = el[id]; if (e && window.LabNum) window.LabNum.set(e, v); },
    sel: selectLevel, view: function (k) { st.view = k; renderKinds(); request2(); },
    scale: function (s) { st.scale = s; renderKinds(); request2(); },
    trace: startTrace, setView: setView,
    data: function () { return K.eventData(st.p, st.view); }
  };
})();
