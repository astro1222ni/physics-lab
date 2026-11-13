/*
 * reverb-room.js — 「迴響與音樂廳：賽賓公式」頁面程式（畫面、聲音、操作、任務事件；物理都在 reverb-room-core.js）
 *
 * 任務事件（都在使用者操作之後才送；分享連結還原期間 missions.js 不判定）：
 *   'room'：選房間預設、滑桿放開、改材料、改公式、拖曳聲源或聽者放開、鍵盤移動之後。
 *   'play'：按「▶ 拍手」或「▶ 小星星」。
 *   資料都是 ReverbCore.payload(分析, { via, preset, kind, dry })，欄位說明見 js/missions/reverb-room.js 開頭。
 */
(function () {
  'use strict';
  const C = window.ReverbCore, MA = window.MusicAudio, D = window.LabDraw, MT = window.MusicTheory;
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const $ = function (id) { return document.getElementById(id); };
  const FONT = 'system-ui, -apple-system, "Segoe UI", "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif';
  const lab = $('lab'), stage = $('stage'), cv = $('cv'), cv2 = $('cv2');
  const ctx = cv.getContext('2d'), ctx2 = cv2.getContext('2d');
  const ANIM = 2.6;       // 拍手後波前動畫（慢動作）的長度，秒
  const MAX_DOTS = 700;   // 平面圖上最多畫幾個聽眾點

  // =====================================================================
  // 狀態
  // =====================================================================
  const state = {
    cfg: C.presetConfig(C.DEFAULT_PRESET),
    preset: C.DEFAULT_PRESET,
    dry: false,
    play: null,   // { kind, t0（performance.now）, T, slow, life, notes }
    drag: null,
    log: []
  };
  let an = C.analyze(state.cfg);
  let reducedMotion = D.reducedMotion();
  const COL = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['canvas-bg', 'text', 'muted', 'border', 'accent', 'surface', 'bg',
      'rv-src', 'rv-lis', 'rv-ray1', 'rv-ray2', 'rv-sab', 'rv-eyr', 'rv-good', 'rv-warn', 'rv-people', 'rv-floor']
      .concat(C.MAT_KEYS.map(function (k) { return 'rv-' + k; }))
      .forEach(function (k) { COL[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
  }
  const matCol = function (k) { return COL['rv-' + k] || COL.muted; };
  function fnt(px, weight) { return (weight ? weight + ' ' : '') + px + 'px ' + FONT; }
  function num(v, dec) {
    if (v == null || !isFinite(v)) return '—';
    let s = v.toFixed(dec);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  function secs(t) { return t == null ? '—' : !isFinite(t) ? '∞' : num(t, t < 1 ? 3 : 2) + ' s'; }
  function matName(k) { const m = C.MATERIALS[k]; return T(m.zh, m.en); }
  function surfName(s) { return T(C.SURF_NAMES[s][0], C.SURF_NAMES[s][1]); }
  function presetName(k) { if (!C.PRESETS[k]) return T('自訂', 'Custom'); return T(C.PRESETS[k].zh, C.PRESETS[k].en); }
  function recompute() { state.cfg = C.normalize(state.cfg); an = C.analyze(state.cfg); }

  // =====================================================================
  // 滑桿
  // =====================================================================
  const SL = {
    len: { el: $('len'), out: $('leno'), get: function () { return state.cfg.L; }, set: function (v) { state.cfg.L = v; }, dec: 1 },
    wid: { el: $('wid'), out: $('wido'), get: function () { return state.cfg.W; }, set: function (v) { state.cfg.W = v; }, dec: 1 },
    hei: { el: $('hei'), out: $('heio'), get: function () { return state.cfg.H; }, set: function (v) { state.cfg.H = v; }, dec: 1 },
    ppl: { el: $('ppl'), out: $('pplo'), get: function () { return state.cfg.people; }, set: function (v) { state.cfg.people = Math.round(v); }, dec: 0 }
  };
  function val(el) { return window.LabNum ? window.LabNum.value(el) : +el.value; }
  function showOut(s) {
    if (s.out.dataset.editing) return;
    const v = s.get();
    let d = s.dec;
    if (d && Math.abs(v * Math.pow(10, d) - Math.round(v * Math.pow(10, d))) > 1e-6) d = Math.min(window.LabNum ? window.LabNum.decimals(s.el) : d, d + 1);
    s.out.textContent = num(v, d);
  }
  /** 人數的上限跟著地板面積（每平方公尺 2 人）；超過就降下來 */
  function syncPeopleMax() {
    const mx = C.maxPeople(state.cfg.L, state.cfg.W);
    SL.ppl.el.max = String(mx);
    if (state.cfg.people > mx) state.cfg.people = mx;
    $('pplNote').textContent = T('每位坐著的聽眾增加約 0.5 m² 的吸音量。這個房間的地板最多坐 ' + mx + ' 人（每平方公尺 2 人）。',
      'Each seated listener adds about 0.5 m² of absorption. This floor seats at most ' + mx + ' people (2 per square metre).');
  }
  function syncSliders() {
    syncPeopleMax();
    Object.keys(SL).forEach(function (k) {
      const s = SL[k];
      if (window.LabNum) window.LabNum.clear(s.el);
      s.el.value = String(s.get());
      showOut(s);
    });
  }
  Object.keys(SL).forEach(function (k) {
    const s = SL[k];
    s.el.addEventListener('input', function () {
      s.set(val(s.el));
      if (k === 'len' || k === 'wid') {
        const before = state.cfg.people;
        syncPeopleMax();
        if (state.cfg.people !== before) { if (window.LabNum) window.LabNum.clear(SL.ppl.el); SL.ppl.el.value = String(state.cfg.people); }
        showOut(SL.ppl);
      }
      showOut(s);
      changed();
    });
    s.el.addEventListener('change', function () { emitRoom('slider'); });
  });

  // =====================================================================
  // 材料選單
  // =====================================================================
  const SEL = {};
  function buildMats() {
    const box = $('mats');
    box.innerHTML = '';
    C.SURFACES.forEach(function (s) {
      const id = 'mat-' + s;
      const lb = document.createElement('label');
      lb.setAttribute('for', id);
      const sw = document.createElement('i');
      sw.style.background = 'var(--rv-' + state.cfg.mats[s] + ')';
      lb.appendChild(sw);
      lb.appendChild(document.createTextNode(surfName(s)));
      const sel = document.createElement('select');
      sel.id = id;
      C.MAT_KEYS.forEach(function (k) {
        const o = document.createElement('option');
        o.value = k;
        o.textContent = matName(k) + '  α ' + C.MATERIALS[k].a.toFixed(2);
        sel.appendChild(o);
      });
      sel.value = state.cfg.mats[s];
      sel.addEventListener('change', function () {
        if (!C.MATERIALS[sel.value]) return;
        state.cfg.mats[s] = sel.value;
        sw.style.background = 'var(--rv-' + sel.value + ')';
        changed();
        emitRoom('material');
      });
      box.appendChild(lb); box.appendChild(sel);
      SEL[s] = { sel: sel, sw: sw };
    });
  }
  function syncMats() {
    C.SURFACES.forEach(function (s) { if (SEL[s]) { SEL[s].sel.value = state.cfg.mats[s]; SEL[s].sw.style.background = 'var(--rv-' + state.cfg.mats[s] + ')'; } });
  }

  // =====================================================================
  // 預設、公式、顯示、乾聲
  // =====================================================================
  const PRESET_NOTE = {
    classroom: ['典型的教室 9 × 8 × 3.2 m：磁磚地板、石膏板天花板、混凝土黑板牆、兩側玻璃窗。空教室的迴響很長。', 'A typical classroom 9 × 8 × 3.2 m: tiled floor, plasterboard ceiling, concrete front wall, windows on both sides. Empty, it rings for a long time.'],
    bathroom: ['小浴室 2.5 × 1.8 × 2.4 m：除了木門和天花板，全是磁磚。聲源（你自己）不算在人數裡。', 'A small bathroom 2.5 × 1.8 × 2.4 m: tiles everywhere except the wooden door and the ceiling. The singer (the source) is not counted as audience.'],
    living: ['客廳 6 × 4.5 × 2.8 m：木地板、一面厚窗簾、一面玻璃窗，3 個人。真實的客廳還有沙發與家具，會再更乾一點。', 'A living room 6 × 4.5 × 2.8 m: wooden floor, heavy curtains on one wall, a glass wall, 3 people. Sofas and furniture would make a real one even drier.'],
    hall: ['鞋盒形的音樂廳 45 × 22 × 17 m（約 16800 m³）：木質牆面、1700 位聽眾。聽眾是最主要的吸音來源。', 'A shoebox concert hall 45 × 22 × 17 m (about 16 800 m³): wooden walls and 1700 listeners, who are the main absorber.'],
    cathedral: ['石造大教堂 60 × 25 × 22 m（33000 m³）：混凝土拱頂、木長椅、玫瑰窗，600 人。迴響好幾秒。', 'A stone cathedral 60 × 25 × 22 m (33 000 m³): concrete vault, wooden pews, a rose window, 600 people. It rings for several seconds.'],
    studio: ['小錄音室 5 × 4 × 3 m：四面與天花板貼滿吸音板，前面是控制室的玻璃窗。非常「乾」。', 'A small studio 5 × 4 × 3 m: absorbing panels on the ceiling and three walls, a control-room window in front. Very dry.'],
    custom: ['自訂的房間：用下面的滑桿與選單改大小、材料和人數。', 'A custom room: change the size, the materials and the audience below.']
  };
  document.querySelectorAll('#presets button').forEach(function (b) {
    b.addEventListener('click', function () { applyPreset(b.getAttribute('data-preset'), true); });
  });
  function applyPreset(k, user) {
    if (!C.PRESETS[k]) return;
    const keep = { formula: state.cfg.formula, order: state.cfg.order };
    stopAll(false);
    state.cfg = Object.assign(C.presetConfig(k), keep);
    state.preset = k;
    recompute();
    syncSliders(); syncMats(); syncUI(); resize();
    if (user) {
      say(presetName(k) + T('：賽賓 T60 = ', ': Sabine T60 = ') + secs(an.ts) + T('，艾林 ', ', Eyring ') + secs(an.te) + T('。', '.'));
      emitRoom('preset');
    }
  }
  function markCustom() { if (state.preset !== 'custom') state.preset = 'custom'; }
  document.querySelectorAll('#formulaSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      const f = b.getAttribute('data-formula');
      if (f === state.cfg.formula) return;
      state.cfg.formula = f;
      recompute(); syncUI(); requestDraw();
      say(T('使用', 'Using ') + (f === 'eyring' ? T('艾林公式：T60 = ', 'Eyring’s formula: T60 = ') + secs(an.te) : T('賽賓公式：T60 = ', 'Sabine’s formula: T60 = ') + secs(an.ts)) + T('。', '.'));
      emitRoom('formula');
    });
  });
  document.querySelectorAll('#orderSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      state.cfg.order = +b.getAttribute('data-order') === 1 ? 1 : 2;
      recompute(); syncUI(); requestDraw();
    });
  });
  $('wetOn').addEventListener('click', function () { state.dry = false; syncUI(); });
  $('dryOn').addEventListener('click', function () { state.dry = true; syncUI(); });

  /** 改了任何房間設定 */
  function changed() {
    markCustom();
    if (state.play) { MA.stopAll(0.08); state.play = null; }
    recompute();
    syncUI();
    requestDraw();
  }

  // =====================================================================
  // 讀數、表格
  // =====================================================================
  const USE_BANDS = [
    { lo: 0.1, hi: 0.4, zh: '錄音室', en: 'Studio' },
    { lo: 0.6, hi: 0.8, zh: '說話', en: 'Speech' },
    { lo: 1.2, hi: 1.6, zh: '室內樂・歌劇', en: 'Chamber · opera' },
    { lo: 1.8, hi: 2.2, zh: '交響樂', en: 'Symphony' },
    { lo: 3, hi: 8, zh: '管風琴・聖詠', en: 'Organ · chant' }
  ];
  function useText(t) {
    if (!(t >= 0)) return '—';
    if (t < 0.1) return T('幾乎沒有迴響', 'almost none');
    for (let i = 0; i < USE_BANDS.length; i++) if (t >= USE_BANDS[i].lo && t <= USE_BANDS[i].hi) return T(USE_BANDS[i].zh, USE_BANDS[i].en);
    if (t < 0.6) return T('很乾（介於錄音室與說話）', 'dry (between studio and speech)');
    if (t < 1.2) return T('偏長，說話開始模糊', 'long for speech');
    if (t < 1.8) return T('室內樂到交響樂之間', 'between chamber and symphony');
    if (t < 3) return T('比音樂廳長', 'longer than a concert hall');
    return T('比大教堂還長', 'longer than a cathedral');
  }
  function syncUI() {
    document.querySelectorAll('#presets button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-preset') === state.preset)); });
    document.querySelectorAll('#formulaSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-formula') === state.cfg.formula)); });
    document.querySelectorAll('#orderSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(+b.getAttribute('data-order') === state.cfg.order)); });
    $('wetOn').setAttribute('aria-pressed', String(!state.dry)); $('dryOn').setAttribute('aria-pressed', String(state.dry));
    const pn = PRESET_NOTE[state.preset] || PRESET_NOTE.custom;
    $('presetNote').textContent = T(pn[0], pn[1]);
    const a = an;
    $('rV').innerHTML = num(a.V, a.V < 100 ? 1 : 0) + ' m<sup>3</sup>';
    $('rS').innerHTML = num(a.S, a.S < 100 ? 1 : 0) + ' m<sup>2</sup>';
    $('rA').innerHTML = num(a.A, a.A < 100 ? 2 : 0) + ' m<sup>2</sup>';
    $('rAbar').textContent = num(a.abar, 3);
    $('rTs').textContent = secs(a.ts);
    $('rTe').textContent = secs(a.te);
    $('rDiff').textContent = num(a.diff * 100, 1) + '%';
    $('rRate').textContent = a.T > 0 ? num(60 / a.T, a.T > 1 ? 1 : 0) + ' dB/s' : '—';
    $('rDir').textContent = num(a.r0, 2) + ' m ・ ' + num(a.t0 * 1000, 1) + ' ms';
    $('rFirst').textContent = a.first ? '+' + num(a.itdg, 1) + ' ms ・ ' + a.first.walls.map(surfName).join('→') : T('沒有（全被吸收）', 'none (all absorbed)');
    $('rFirstUp').textContent = a.firstUp ? '+' + num(a.itdgUp, 1) + ' ms ・ ' + a.firstUp.walls.map(surfName).join('→') : '—';
    $('rRc').textContent = num(a.rc, 2) + ' m' + (a.r0 > a.rc ? T('（聽者在外：迴響較強）', ' (listener beyond it)') : T('（聽者在內：直達聲較強）', ' (listener inside it)'));
    $('rUse').textContent = useText(a.T);
    $('rUse').className = a.T >= 0.6 && a.T <= 0.8 || a.T >= 1.8 && a.T <= 2.2 ? 'good' : '';
    const lh = $('longHint');
    if (a.T > 8) { lh.hidden = false; lh.textContent = T('迴響超過 8 秒：試聽的迴響最長只做到 8 秒（畫面與讀數照實際計算）。', 'Longer than 8 s: the reverberation you hear stops at 8 s (the pictures and readings are exact).'); }
    else if (a.T === 0) { lh.hidden = false; lh.textContent = T('艾林公式在全吸收時是 0 秒：聽到的會是完全沒有迴響的乾聲。', 'Eyring gives 0 s for total absorption: you will hear the dry sound only.'); }
    else lh.hidden = true;
    renderAbs();
    updateCanvasLabel();
  }
  function renderAbs() {
    const a = an;
    let h = '<tr><th>' + T('面', 'Surface') + '</th><th>' + T('材料', 'Material') + '</th><th>S (m²)</th><th>α</th><th>Sα (m²)</th><th>' + T('占', 'Share') + '</th></tr>';
    a.rows.forEach(function (r) {
      h += '<tr><td>' + surfName(r.surf) + '</td><td><i style="background:var(--rv-' + r.mat + ')"></i>' + matName(r.mat) + '</td><td>' + num(r.S, r.S < 100 ? 1 : 0) + '</td><td>' + r.alpha.toFixed(2) + '</td><td>' + num(r.A, r.A < 10 ? 2 : 1) + '</td><td>' + num(r.A / a.A * 100, 0) + '%</td></tr>';
    });
    h += '<tr><td>' + T('聽眾', 'Audience') + '</td><td>' + a.people + T(' 人 × 0.5', ' × 0.5') + '</td><td></td><td></td><td>' + num(a.Apeople, a.Apeople < 10 ? 2 : 1) + '</td><td>' + num(a.Apeople / a.A * 100, 0) + '%</td></tr>';
    h += '<tr class="sum"><td>' + T('合計 A', 'Total A') + '</td><td></td><td>' + num(a.S, a.S < 100 ? 1 : 0) + '</td><td></td><td>' + num(a.A, a.A < 10 ? 2 : 1) + '</td><td>100%</td></tr>';
    $('absTable').innerHTML = h;
  }
  function updateCanvasLabel() {
    const txt = T('房間平面圖（' + num(an.L, 1) + ' × ' + num(an.W, 1) + ' m）：四周的色帶是牆面材料，橘色是聲源、藍色是聽者，彩色線是反射聲的路徑，牆外的淡色圓點是鏡像源。賽賓 T60 ' + secs(an.ts) + '。',
      'Floor plan (' + num(an.L, 1) + ' × ' + num(an.W, 1) + ' m): coloured bands are the wall materials, orange is the source, blue the listener, coloured lines the reflection paths and faint dots outside the walls the image sources. Sabine T60 ' + secs(an.ts) + '.');
    cv.setAttribute('aria-label', txt + T('按 Enter 切換聲源或聽者，方向鍵移動，Shift 加方向鍵移動得更多。', ' Enter switches between the source and the listener, arrow keys move it, Shift for bigger steps.'));
  }

  // =====================================================================
  // 平面圖：版面
  // =====================================================================
  let dpr = 1, cw = 0, ch = 0, cw2 = 0, ch2 = 0, P = null;
  const MARGIN = 0.2; // 房間四周留給鏡像源（鏡中房間）的比例
  function layout() {
    const L = state.cfg.L, W = state.cfg.W;
    const pad = cw < 480 ? 10 : 18, top = 40, bot = cw < 480 ? 46 : 34;
    let s = (cw - 2 * pad) / (L * (1 + 2 * MARGIN));
    const maxH = cw < 480 ? 420 : 500;
    if (W * s * (1 + 2 * MARGIN) > maxH - top - bot) s = (maxH - top - bot) / (W * (1 + 2 * MARGIN));
    const roomH = W * s, H = Math.max(cw < 480 ? 250 : 300, Math.round(roomH * (1 + 2 * MARGIN) + top + bot));
    const ox = cw / 2 - L * s / 2, oy = top + (H - top - bot) / 2 + roomH / 2;
    return { s: s, ox: ox, oy: oy, pad: pad, H: H, top: top, bot: bot, narrow: cw < 480 };
  }
  const X = function (x) { return P.ox + x * P.s; };
  const Y = function (y) { return P.oy - y * P.s; };
  function resize() {
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    cw = w;
    P = layout();
    ch = P.H;
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    cw2 = cv2.clientWidth || cw;
    ch2 = cw2 >= 640 ? 300 : 560;
    if (cv2.style.height !== ch2 + 'px') cv2.style.height = ch2 + 'px';
    cv2.width = Math.round(cw2 * dpr); cv2.height = Math.round(ch2 * dpr);
    requestDraw();
  }

  /** 聽眾的座位（公尺）：在地板上排成整齊的格子，避開聲源附近；最多 n 個（3D 也用） */
  function seats(n) {
    const c = state.cfg, out = [];
    if (n <= 0) return out;
    const S = C.positions(c).src;
    const clear = Math.min(1.6, 0.25 * Math.min(c.L, c.W));
    // 先估計間距，再依實際能放的位置調整
    let d = Math.sqrt(c.L * c.W / (n * 1.15));
    for (let tries = 0; tries < 6; tries++) {
      out.length = 0;
      const nx = Math.max(1, Math.floor(c.L / d)), ny = Math.max(1, Math.floor(c.W / d));
      const dx = c.L / nx, dy = c.W / ny;
      for (let i = 0; i < nx && out.length < n; i++) for (let j = 0; j < ny && out.length < n; j++) {
        const x = (i + 0.5) * dx, y = (j + 0.5) * dy;
        if (Math.hypot(x - S.x, y - S.y) < clear) continue;
        out.push({ x: x, y: y });
      }
      if (out.length >= n) break;
      d *= 0.85;
    }
    return out.slice(0, n);
  }

  // =====================================================================
  // 平面圖：繪圖
  // =====================================================================
  function draw(now) {
    if (!P) return;
    const c = ctx, cfg = state.cfg, a = an, s = P.s;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, cw, ch);
    D.backdrop(c, cw, ch);
    const x0 = X(0), x1 = X(cfg.L), y0 = Y(0), y1 = Y(cfg.W);
    // 鏡中的房間（虛線外框）
    c.save();
    c.setLineDash([3, 5]); c.lineWidth = 1; c.strokeStyle = D.alpha(COL.muted, 0.35);
    [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(function (d) {
      c.strokeRect(x0 + d[0] * (x1 - x0), y1 - d[1] * (y0 - y1), x1 - x0, y0 - y1);
    });
    c.restore();
    // 地板
    c.save();
    c.shadowColor = D.shadowInk(0.25); c.shadowBlur = 14; c.shadowOffsetY = 4;
    const fl = c.createLinearGradient(x0, y1, x1, y0);
    const fc = D.mix(COL['rv-floor'], matCol(cfg.mats.floor), 0.3);
    fl.addColorStop(0, D.shade(fc, D.dark ? 0.05 : 0.12)); fl.addColorStop(1, D.shade(fc, D.dark ? -0.1 : -0.04));
    c.fillStyle = fl;
    c.fillRect(x0, y1, x1 - x0, y0 - y1);
    c.restore();
    drawAudience(c);
    drawWavefronts(c, now);
    drawCritical(c);
    drawRays(c);
    drawWalls(c);
    drawImages(c);
    drawPeople(c, now);
    drawLabels(c, now);
  }
  function drawAudience(c) {
    const n = an.people;
    if (!n) return;
    const shown = Math.min(n, MAX_DOTS);
    const list = seats(shown);
    const r = Math.max(1.3, Math.min(0.24 * P.s, 4));
    c.save();
    c.fillStyle = D.alpha(COL['rv-people'], D.dark ? 0.75 : 0.6);
    list.forEach(function (p) { c.beginPath(); c.arc(X(p.x), Y(p.y), r, 0, 2 * Math.PI); c.fill(); });
    c.restore();
  }
  function wallBand(c, s) {
    const cfg = state.cfg, x0 = X(0), x1 = X(cfg.L), y0 = Y(0), y1 = Y(cfg.W);
    const t = P.narrow ? 7 : 9;
    if (s === 'front') return { x: x0 - t, y: y1 - t, w: t, h: y0 - y1 + 2 * t, vert: true };
    if (s === 'back') return { x: x1, y: y1 - t, w: t, h: y0 - y1 + 2 * t, vert: true };
    if (s === 'left') return { x: x0, y: y0, w: x1 - x0, h: t, vert: false };
    return { x: x0, y: y1 - t, w: x1 - x0, h: t, vert: false };
  }
  function drawWalls(c) {
    const cfg = state.cfg;
    ['left', 'right', 'front', 'back'].forEach(function (s) {
      const b = wallBand(c, s), m = cfg.mats[s], col = matCol(m);
      c.save();
      if (m === 'open') {
        c.setLineDash([5, 4]); c.strokeStyle = col; c.lineWidth = 2;
        const mx = b.x + b.w / 2, my = b.y + b.h / 2;
        c.beginPath();
        if (b.vert) { c.moveTo(mx, b.y); c.lineTo(mx, b.y + b.h); } else { c.moveTo(b.x, my); c.lineTo(b.x + b.w, my); }
        c.stroke();
      } else {
        const g = b.vert ? c.createLinearGradient(b.x, 0, b.x + b.w, 0) : c.createLinearGradient(0, b.y, 0, b.y + b.h);
        g.addColorStop(0, D.shade(col, 0.22)); g.addColorStop(0.55, col); g.addColorStop(1, D.shade(col, -0.25));
        c.fillStyle = g;
        D.roundRect(c, b.x, b.y, b.w, b.h, 2); c.fill();
        c.strokeStyle = D.alpha(D.shade(col, -0.4), 0.6); c.lineWidth = 1; c.stroke();
        if (m === 'panel' || m === 'carpet' || m === 'curtain') {
          // 吸音材料：細紋表示表面是軟的
          c.strokeStyle = D.alpha('#ffffff', 0.25); c.lineWidth = 1;
          const step = 6;
          c.beginPath();
          if (b.vert) for (let y = b.y + 3; y < b.y + b.h; y += step) { c.moveTo(b.x + 1, y); c.lineTo(b.x + b.w - 1, y); }
          else for (let x = b.x + 3; x < b.x + b.w; x += step) { c.moveTo(x, b.y + 1); c.lineTo(x, b.y + b.h - 1); }
          c.stroke();
        }
      }
      c.restore();
    });
  }
  /** 只在平面上看得到的鏡像源（kz = 0） */
  function planImages() { return an.images.filter(function (m) { return m.k[2] === 0; }); }
  function rayAlpha(m) { return m.level == null ? 0 : Math.max(0.12, Math.min(0.95, 0.95 + m.level / 30)); }
  function drawRays(c) {
    const a = an;
    // 直達聲
    c.save();
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = D.alpha(COL.text, 0.55); c.lineWidth = 2;
    c.beginPath(); c.moveTo(X(a.src.x), Y(a.src.y)); c.lineTo(X(a.lis.x), Y(a.lis.y)); c.stroke();
    planImages().slice().reverse().forEach(function (m) {
      if (m.level == null) return;
      const col = m.order === 1 ? COL['rv-ray1'] : COL['rv-ray2'];
      const al = rayAlpha(m);
      // 鏡像源到最後一個反射點的虛線（展開的直線）
      const last = m.pts[m.pts.length - 2];
      c.setLineDash([4, 4]); c.lineWidth = 1; c.strokeStyle = D.alpha(col, al * 0.45);
      c.beginPath(); c.moveTo(X(m.img.x), Y(m.img.y)); c.lineTo(X(last.x), Y(last.y)); c.stroke();
      c.setLineDash([]);
      c.lineWidth = m.order === 1 ? 2 : 1.4; c.strokeStyle = D.alpha(col, al);
      c.beginPath();
      m.pts.forEach(function (p, i) { if (i) c.lineTo(X(p.x), Y(p.y)); else c.moveTo(X(p.x), Y(p.y)); });
      c.stroke();
      // 反射點
      c.fillStyle = D.alpha(col, al);
      m.pts.slice(1, -1).forEach(function (p) { c.beginPath(); c.arc(X(p.x), Y(p.y), 2.6, 0, 2 * Math.PI); c.fill(); });
    });
    c.restore();
  }
  function drawImages(c) {
    planImages().forEach(function (m) {
      const x = X(m.img.x), y = Y(m.img.y);
      if (x < -10 || x > cw + 10 || y < -10 || y > ch + 10) return;
      c.save();
      c.globalAlpha = m.level == null ? 0.18 : (m.order === 1 ? 0.55 : 0.35);
      D.ball(c, x, y, m.order === 1 ? 5 : 4, COL['rv-src'], { shadow: false });
      c.restore();
    });
  }
  function drawCritical(c) {
    const a = an, dz = a.src.z - a.lis.z;
    const rh = Math.sqrt(Math.max(0, a.rc * a.rc - dz * dz)) * P.s;
    if (rh < 3) return;
    c.save();
    c.beginPath(); c.rect(X(0), Y(state.cfg.W), state.cfg.L * P.s, state.cfg.W * P.s); c.clip();
    c.setLineDash([6, 5]); c.lineWidth = 1.4; c.strokeStyle = D.alpha(COL['rv-src'], 0.6);
    c.fillStyle = D.alpha(COL['rv-src'], 0.06);
    c.beginPath(); c.arc(X(a.src.x), Y(a.src.y), rh, 0, 2 * Math.PI); c.fill(); c.stroke();
    c.restore();
    if (rh > 30) D.pill(c, T('臨界距離', 'critical distance'), X(a.src.x), Y(a.src.y) - rh - 2, COL['rv-src'], 'center', fnt(11, 600));
  }
  /** 拍手後的波前：以聲源與每個鏡像源為圓心、半徑 c·t 的圓，裁在房間裡（慢動作） */
  function drawWavefronts(c, now) {
    const p = state.play;
    if (!p || reducedMotion) return;
    const tv = (now - p.t0) / 1000;
    const cfg = state.cfg;
    c.save();
    c.beginPath(); c.rect(X(0), Y(cfg.W), cfg.L * P.s, cfg.W * P.s); c.clip();
    if (p.kind === 'clap') {
      if (tv > ANIM) { c.restore(); return; }
      const rho = C.C_SOUND * tv / p.slow; // 物理時間 = 畫面時間 ÷ 放慢倍數
      const fade = 1 - tv / ANIM;
      const ring = function (x, y, alpha, col, w) {
        if (alpha <= 0.01) return;
        c.strokeStyle = D.alpha(col, alpha); c.lineWidth = w;
        c.beginPath(); c.arc(X(x), Y(y), rho * P.s, 0, 2 * Math.PI); c.stroke();
      };
      ring(an.src.x, an.src.y, 0.85 * fade, COL['rv-src'], 2.4);
      if (!state.dry) planImages().forEach(function (m) { if (m.level != null) ring(m.img.x, m.img.y, 0.75 * fade * Math.sqrt(m.gain), m.order === 1 ? COL['rv-ray1'] : COL['rv-ray2'], m.order === 1 ? 1.8 : 1.3); });
    } else if (p.notes) {
      p.notes.forEach(function (n) {
        const age = tv - n.t;
        if (age < 0 || age > 1.2) return;
        c.strokeStyle = D.alpha(COL['rv-src'], 0.7 * (1 - age / 1.2)); c.lineWidth = 2;
        c.beginPath(); c.arc(X(an.src.x), Y(an.src.y), 8 + age * 70, 0, 2 * Math.PI); c.stroke();
      });
    }
    c.restore();
  }
  function drawPeople(c, now) {
    const a = an;
    const sx = X(a.src.x), sy = Y(a.src.y), lx = X(a.lis.x), ly = Y(a.lis.y);
    // 直達聲波前抵達聽者時，聽者閃一下
    const p = state.play;
    if (p && p.kind === 'clap' && !reducedMotion) {
      const tv = (now - p.t0) / 1000, tArr = a.t0 * p.slow;
      if (tv >= tArr && tv < tArr + 0.4) D.ripple(c, lx, ly, 9, (tv - tArr) / 0.4, COL['rv-lis']);
    }
    D.ball(c, sx, sy, 8, COL['rv-src'], { glow: D.dark ? 0.35 : 0.15 });
    D.ball(c, lx, ly, 8, COL['rv-lis'], { glow: D.dark ? 0.35 : 0.15 });
    if (kb && kb.focused && kb.focused()) {
      const i = kb.index(), q = i === 0 ? [sx, sy] : [lx, ly];
      c.save(); c.setLineDash([4, 3]); c.strokeStyle = COL.accent; c.lineWidth = 2;
      c.beginPath(); c.arc(q[0], q[1], 15, 0, 2 * Math.PI); c.stroke(); c.restore();
    }
    const fs = fnt(12, 600);
    D.pill(c, T('聲源', 'Source'), sx, sy - 12, COL['rv-src'], 'center', fs);
    D.pill(c, T('聽者', 'Listener'), lx, ly + 28, COL['rv-lis'], 'center', fs);
  }
  function drawLabels(c, now) {
    const cfg = state.cfg, a = an;
    const x0 = X(0), x1 = X(cfg.L), y0 = Y(0), y1 = Y(cfg.W);
    const small = fnt(P.narrow ? 10.5 : 11.5, 600);
    const wl = function (s) { const m = cfg.mats[s]; return (P.narrow ? '' : surfName(s) + '・') + matName(m); };
    // 左右牆（上下）、前後牆（左右，直排）
    D.pill(c, wl('right'), (x0 + x1) / 2, y1 - 11, matCol(cfg.mats.right), 'center', small);
    D.pill(c, wl('left'), (x0 + x1) / 2, y0 + 28, matCol(cfg.mats.left), 'center', small);
    [['front', x0 - 14], ['back', x1 + 14]].forEach(function (q) {
      c.save();
      c.translate(q[1], (y0 + y1) / 2);
      c.rotate(q[0] === 'front' ? -Math.PI / 2 : Math.PI / 2);
      D.pill(c, wl(q[0]), 0, 8, matCol(cfg.mats[q[0]]), 'center', small);
      c.restore();
    });
    // 標題與 T60
    const title = presetName(state.preset) + '  ' + num(cfg.L, 1) + ' × ' + num(cfg.W, 1) + ' × ' + num(cfg.H, 1) + ' m';
    D.pill(c, title, P.pad, 26, COL.text, 'left', fnt(12.5, 700));
    const tt = (cfg.formula === 'eyring' ? T('艾林 ', 'Eyring ') : T('賽賓 ', 'Sabine ')) + 'T60 = ' + secs(a.T);
    D.pill(c, tt, cw - P.pad, 26, cfg.formula === 'eyring' ? COL['rv-eyr'] : COL['rv-sab'], 'right', fnt(12.5, 700));
    // 地板與天花板
    const fTxt = T('地板：', 'Floor: ') + matName(cfg.mats.floor), cTxt = T('天花板：', 'Ceiling: ') + matName(cfg.mats.ceiling);
    c.font = fnt(11);
    c.fillStyle = COL.muted; c.textAlign = 'left';
    const by = ch - 10;
    // 比例尺
    const nice = [0.5, 1, 2, 5, 10, 20];
    let unit = nice[0];
    for (let i = 0; i < nice.length; i++) if (nice[i] * P.s <= (P.narrow ? 70 : 90)) unit = nice[i];
    const sw = unit * P.s, sx = cw - P.pad - sw;
    const gap = T('　', '   ');
    if (P.pad + c.measureText(fTxt + gap + cTxt).width < sx - 10) c.fillText(fTxt + gap + cTxt, P.pad, by);
    else { c.fillText(fTxt, P.pad, by - 14); c.fillText(cTxt, P.pad, by); }
    c.strokeStyle = COL.muted; c.lineWidth = 2;
    c.beginPath(); c.moveTo(sx, by - 4); c.lineTo(sx + sw, by - 4); c.moveTo(sx, by - 8); c.lineTo(sx, by); c.moveTo(sx + sw, by - 8); c.lineTo(sx + sw, by); c.stroke();
    c.textAlign = 'center'; c.fillText(num(unit, unit < 1 ? 1 : 0) + ' m', sx + sw / 2, by - 10);
    // 慢動作的倍數
    const p = state.play;
    if (p && p.kind === 'clap' && !reducedMotion && (now - p.t0) / 1000 < ANIM) {
      D.pill(c, T('波前慢動作：放慢 ' + Math.round(p.slow) + ' 倍', 'Wavefronts slowed ' + Math.round(p.slow) + '×'), cw / 2, 52, COL.accent, 'center', fnt(11.5, 600));
    }
    if (p && p.kind === 'melody' && p.notes) {
      const tv = (now - p.t0) / 1000;
      const cur = p.notes.filter(function (n) { return tv >= n.t && tv < n.t + n.d; })[0];
      if (cur) D.pill(c, '♪ ' + cur.name, cw / 2, 52, COL['rv-src'], 'center', fnt(12, 700));
    }
    c.textAlign = 'left';
  }

  // =====================================================================
  // 下方圖表：衰減曲線、聽者收到的聲音、建議的迴響時間
  // =====================================================================
  function niceStep(span, n) {
    const raw = span / n, p = Math.pow(10, Math.floor(Math.log10(raw)));
    const m = raw / p;
    return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
  }
  function drawCharts(now) {
    if (!cw2) return;
    const c = ctx2;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, cw2, ch2);
    const wide = cw2 >= 640;
    const bandH = wide ? 74 : 84;
    if (wide) {
      const h = ch2 - bandH;
      drawDecay(c, 0, 0, cw2 / 2, h, now);
      drawEcho(c, cw2 / 2, 0, cw2 / 2, h);
    } else {
      const h = (ch2 - bandH) / 2;
      drawDecay(c, 0, 0, cw2, h, now);
      drawEcho(c, 0, h, cw2, h);
    }
    drawBands(c, 0, ch2 - bandH, cw2, bandH);
  }
  function frameAxes(c, x0, y0, x1, y1) {
    c.strokeStyle = COL.border; c.lineWidth = 1;
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0, y1); c.lineTo(x1, y1); c.stroke();
  }
  function drawDecay(c, ox, oy, w, h, now) {
    const a = an;
    const x0 = ox + 46, x1 = ox + w - 14, y0 = oy + 26, y1 = oy + h - 30;
    const Ts = [a.ts, a.te].concat(state.log.map(function (l) { return l.T; })).filter(function (t) { return t > 0 && isFinite(t); });
    let tmax = Math.max(0.3, Math.min(14, Math.max.apply(null, Ts.length ? Ts : [1]) * 1.15));
    const tstep = niceStep(tmax, 5);
    tmax = Math.ceil(tmax / tstep) * tstep;
    const TX = function (t) { return x0 + (x1 - x0) * t / tmax; };
    const DY = function (db) { return y0 + (y1 - y0) * Math.min(70, -db) / 70; };
    c.save();
    c.font = fnt(10.5); c.fillStyle = COL.muted; c.textAlign = 'right';
    for (let db = 0; db >= -70; db -= 10) {
      const y = DY(db);
      c.strokeStyle = D.alpha(COL.muted, db === -60 ? 0.5 : 0.14); c.lineWidth = 1;
      if (db === -60) c.setLineDash([5, 4]);
      c.beginPath(); c.moveTo(x0, Math.round(y) + 0.5); c.lineTo(x1, Math.round(y) + 0.5); c.stroke();
      c.setLineDash([]);
      c.fillText(num(db, 0), x0 - 5, y + 3.5);
    }
    c.textAlign = 'center';
    for (let t = 0; t <= tmax + 1e-9; t += tstep) {
      const x = TX(t);
      c.strokeStyle = D.alpha(COL.muted, 0.1);
      c.beginPath(); c.moveTo(Math.round(x) + 0.5, y0); c.lineTo(Math.round(x) + 0.5, y1); c.stroke();
      c.fillText(num(t, tstep < 1 ? (tstep < 0.1 ? 2 : 1) : 0), x, y1 + 13);
    }
    frameAxes(c, x0, y0, x1, y1);
    c.fillText(T('時間（s，聲源停止後）', 'time (s after the source stops)'), (x0 + x1) / 2, y1 + 26);
    c.save(); c.translate(ox + 11, (y0 + y1) / 2); c.rotate(-Math.PI / 2); c.fillText(T('聲音位準（dB）', 'level (dB)'), 0, 0); c.restore();
    c.beginPath(); c.rect(x0, y0 - 2, x1 - x0, y1 - y0 + 4); c.clip();
    const line = function (T60, col, width, dash) {
      c.strokeStyle = col; c.lineWidth = width; c.setLineDash(dash || []);
      c.beginPath();
      if (T60 <= 0) { c.moveTo(x0, DY(0)); c.lineTo(x0, DY(-70)); }
      else { c.moveTo(x0, DY(0)); c.lineTo(TX(Math.min(tmax, T60 * 70 / 60)), DY(Math.max(-70, -60 * tmax / T60))); }
      c.stroke(); c.setLineDash([]);
    };
    state.log.forEach(function (l, i) { line(l.T, D.alpha(COL.muted, 0.55), 1.4, [2, 3]); l._i = i; });
    const selE = state.cfg.formula === 'eyring';
    line(a.ts, COL['rv-sab'], selE ? 1.6 : 3);
    line(a.te, COL['rv-eyr'], selE ? 3 : 1.6, [7, 4]);
    c.restore();
    // 紀錄的編號
    c.save();
    state.log.forEach(function (l, i) {
      if (!(l.T > 0)) return;
      const t = Math.min(tmax * 0.97, l.T);
      const db = -60 * t / l.T;
      D.pill(c, String(i + 1), TX(t), DY(db) - 3, COL.muted, 'center', fnt(10, 700));
    });
    // T60 標記
    const Tsel = a.T;
    if (Tsel > 0 && Tsel <= tmax) {
      const x = TX(Tsel);
      c.strokeStyle = D.alpha(selE ? COL['rv-eyr'] : COL['rv-sab'], 0.55); c.setLineDash([3, 3]); c.lineWidth = 1;
      c.beginPath(); c.moveTo(x, DY(-60)); c.lineTo(x, y1); c.stroke(); c.setLineDash([]);
      D.ball(c, x, DY(-60), 4, selE ? COL['rv-eyr'] : COL['rv-sab'], { shadow: false });
    }
    D.pill(c, T('賽賓 ', 'Sabine ') + secs(a.ts), x0 + 4, y0 - 4, COL['rv-sab'], 'left', fnt(11, 700));
    D.pill(c, T('艾林 ', 'Eyring ') + secs(a.te), x1, y0 - 4, COL['rv-eyr'], 'right', fnt(11, 700));
    // 播放時的游標（真實時間）
    const p = state.play;
    if (p && p.kind === 'clap' && p.T > 0) {
      const t = (now - p.t0) / 1000;
      if (t <= Math.min(tmax, p.T * 70 / 60)) {
        const db = -60 * t / p.T;
        D.ball(c, TX(t), DY(db), 5.5, COL.accent, { glow: 0.4 });
        D.pill(c, num(db, 0) + ' dB', TX(t) + 8, DY(db) - 6, COL.accent, 'left', fnt(11, 700));
      }
    }
    c.restore();
  }
  function drawEcho(c, ox, oy, w, h) {
    const a = an;
    const x0 = ox + 42, x1 = ox + w - 14, y0 = oy + 26, y1 = oy + h - 30;
    const heard = a.images.filter(function (m) { return m.level != null; });
    const lastD = heard.length ? heard[heard.length - 1].delay : a.t0;
    let tEnd = Math.max(a.t0 * 1.25 + 0.02, Math.min(lastD * 1.15, a.t0 + 0.6)) * 1000;
    const step = niceStep(tEnd, 5);
    tEnd = Math.ceil(tEnd / step) * step;
    const TX = function (ms) { return x0 + (x1 - x0) * ms / tEnd; };
    const LY = function (db) { return y1 - (y1 - y0) * Math.max(0, (db + 40) / 40); };
    c.save();
    c.font = fnt(10.5); c.fillStyle = COL.muted; c.textAlign = 'right';
    for (let db = 0; db >= -40; db -= 10) {
      const y = LY(db);
      c.strokeStyle = D.alpha(COL.muted, 0.14); c.lineWidth = 1;
      c.beginPath(); c.moveTo(x0, Math.round(y) + 0.5); c.lineTo(x1, Math.round(y) + 0.5); c.stroke();
      c.fillText(num(db, 0), x0 - 5, y + 3.5);
    }
    c.textAlign = 'center';
    for (let t = 0; t <= tEnd + 1e-9; t += step) c.fillText(num(t, step < 1 ? 1 : 0), TX(t), y1 + 13);
    frameAxes(c, x0, y0, x1, y1);
    c.fillText(T('時間（ms，從拍手算起）', 'time (ms after the clap)'), (x0 + x1) / 2, y1 + 26);
    c.save(); c.translate(ox + 9, (y0 + y1) / 2); c.rotate(-Math.PI / 2); c.fillText(T('比直達聲（dB）', 'vs direct (dB)'), 0, 0); c.restore();
    // 迴響尾巴（示意）：包絡 = 10 log((r0/rc)² × 1 ms / τ) − 60 (t − t0)/T60，τ = T60 / 13.8
    if (a.ts > 0 && heard.length && !state.dry) {
      const Tt = a.T > 0 ? a.T : a.ts;
      const tau = Tt / 13.8;
      const L0 = 10 * Math.log10(Math.pow(a.r0 / Math.max(1e-3, a.rc), 2) * 0.001 / tau);
      const tStart = heard[0].delay * 1000, mfp = 4 * a.V / a.S / C.C_SOUND * 1000;
      const env = function (ms) { const build = Math.min(1, Math.max(0, (ms - tStart) / (2 * mfp))); return L0 - 60 * (ms - a.t0 * 1000) / 1000 / Tt + 10 * Math.log10(Math.max(1e-6, build)); };
      c.save();
      c.beginPath(); c.rect(x0, y0, x1 - x0, y1 - y0); c.clip();
      const g = c.createLinearGradient(0, y0, 0, y1);
      g.addColorStop(0, D.alpha(COL.muted, 0.35)); g.addColorStop(1, D.alpha(COL.muted, 0.08));
      c.fillStyle = g;
      c.beginPath(); c.moveTo(TX(tStart), y1);
      for (let px = TX(tStart); px <= x1; px += 2) { const ms = (px - x0) / (x1 - x0) * tEnd; c.lineTo(px, LY(env(ms))); }
      c.lineTo(x1, y1); c.closePath(); c.fill();
      // 密密麻麻的細尖峰（固定的亂數，畫面不閃爍）
      let sd = 12345;
      c.strokeStyle = D.alpha(COL.muted, 0.45); c.lineWidth = 1;
      c.beginPath();
      for (let px = TX(tStart); px <= x1; px += 2.5) {
        sd = (sd * 16807) % 2147483647;
        const ms = (px - x0) / (x1 - x0) * tEnd, u = sd / 2147483647;
        const y = LY(env(ms) + 10 * Math.log10(0.15 + 0.85 * u));
        c.moveTo(px, y1); c.lineTo(px, y);
      }
      c.stroke();
      c.restore();
    }
    // 直達聲與反射的尖峰
    const spike = function (ms, db, col, wdt) {
      if (ms > tEnd) return;
      const x = TX(ms), y = LY(db);
      c.strokeStyle = col; c.lineWidth = wdt; c.lineCap = 'round';
      c.beginPath(); c.moveTo(x, y1); c.lineTo(x, y); c.stroke();
      c.fillStyle = col; c.beginPath(); c.arc(x, y, wdt * 0.9 + 1, 0, 2 * Math.PI); c.fill();
    };
    if (!state.dry) heard.slice().reverse().forEach(function (m) { spike(m.delay * 1000, m.level, m.order === 1 ? COL['rv-ray1'] : COL['rv-ray2'], m.order === 1 ? 2.2 : 1.6); });
    spike(a.t0 * 1000, 0, COL.text, 2.8);
    D.pill(c, T('直達聲 ', 'direct ') + num(a.t0 * 1000, 1) + ' ms', TX(a.t0 * 1000) + 6, y0 + 12, COL.text, 'left', fnt(11, 700));
    if (state.dry) D.pill(c, T('乾聲：只有直達聲', 'Dry: direct sound only'), x1, y0 + 30, COL.muted, 'right', fnt(11, 600));
    else if (a.first) D.pill(c, T('第一個反射 +', 'first reflection +') + num(a.itdg, 1) + ' ms', x1, y0 + 30, COL['rv-ray1'], 'right', fnt(11, 600));
    c.restore();
  }
  function drawBands(c, ox, oy, w, h) {
    const a = an;
    const x0 = ox + 14, x1 = ox + w - 14, yb = oy + h - 22, bh = 16;
    const lo = Math.log10(0.1), hi = Math.log10(10);
    const TX = function (t) { return x0 + (x1 - x0) * (Math.log10(Math.max(0.1, Math.min(10, t))) - lo) / (hi - lo); };
    c.save();
    c.font = fnt(11, 600); c.fillStyle = COL.muted; c.textAlign = 'left';
    const narrow = (x1 - x0) < 520;
    c.fillText(narrow ? T('常見的建議迴響時間（各書略有不同）', 'Usual recommended reverberation times') : T('常見的建議迴響時間（各書略有不同）', 'Reverberation times usually recommended (books differ a little)'), x0, oy + 14);
    D.roundRect(c, x0, yb - bh, x1 - x0, bh, 6);
    c.fillStyle = D.alpha(COL.muted, 0.1); c.fill();
    USE_BANDS.forEach(function (b, i) {
      const a1 = TX(b.lo), a2 = TX(b.hi);
      const col = i === 1 ? COL['rv-good'] : i === 3 ? COL['rv-sab'] : COL['rv-ray2'];
      c.fillStyle = D.alpha(col, 0.32);
      D.roundRect(c, a1, yb - bh, Math.max(3, a2 - a1), bh, 4); c.fill();
      c.fillStyle = COL.text; c.textAlign = 'center'; c.font = fnt(narrow ? 10 : 11, 600);
      const up = narrow && i % 2 === 1;
      c.fillText(T(b.zh, b.en), (a1 + a2) / 2, up ? yb - bh - 18 : yb - bh - 5);
    });
    c.font = fnt(10); c.fillStyle = COL.muted;
    [0.1, 0.2, 0.5, 1, 2, 5, 10].forEach(function (t) { c.textAlign = 'center'; c.fillText(t + ' s', TX(t), yb + 13); });
    const mark = function (t, col, dy) {
      if (!(t >= 0)) return;
      const x = TX(Math.max(0.1, t));
      c.fillStyle = col;
      c.beginPath(); c.moveTo(x, yb - bh - 1 + dy); c.lineTo(x - 6, yb - bh - 10 + dy); c.lineTo(x + 6, yb - bh - 10 + dy); c.closePath(); c.fill();
      c.strokeStyle = col; c.lineWidth = 2; c.beginPath(); c.moveTo(x, yb - bh); c.lineTo(x, yb); c.stroke();
    };
    mark(a.te, COL['rv-eyr'], 0);
    mark(a.ts, COL['rv-sab'], 0);
    c.restore();
  }

  // =====================================================================
  // 動畫
  // =====================================================================
  let raf = 0;
  function frame() {
    raf = 0;
    const now = performance.now();
    if (state.play && (now - state.play.t0) / 1000 > state.play.life) { state.play = null; updateStopBtn(); }
    if (!stage.classList.contains('is3d')) draw(now);
    drawCharts(now);
    if (view3 && view3.active) view3.frame();
    if ((state.play || (view3 && view3.active && view3.busy())) && !document.hidden) raf = requestAnimationFrame(frame);
  }
  function requestDraw() { if (!raf) raf = requestAnimationFrame(frame); }

  // =====================================================================
  // 聲音
  // =====================================================================
  let sayTimer = 0;
  function say(msg) { const el = $('status'); clearTimeout(sayTimer); sayTimer = setTimeout(function () { el.textContent = msg || ''; }, 30); }
  let rv = null;
  /** 迴響效果器（全頁共用一個）；直達聲與迴響的比例依臨界距離：迴響能量 ÷ 直達聲能量 = (r0/rc)² */
  function reverbFor(t60) {
    const wet = Math.max(0.08, Math.min(0.9, an.r0 / (an.r0 + Math.max(0.05, an.rc))));
    const tt = Math.max(0.05, Math.min(8, t60));
    if (!rv) rv = MA.reverb({ t60: tt, wet: wet, predelay: 0.012 });
    else rv.set(tt, wet);
    return rv;
  }
  function slowFactor() {
    const diag = Math.hypot(state.cfg.L, state.cfg.W);
    return Math.max(2, ANIM / (1.7 * diag / C.C_SOUND));
  }
  function clap() {
    MA.stopAll(0.03);
    const a = an, Tp = a.T;
    state.play = { kind: 'clap', t0: performance.now(), T: Tp, slow: slowFactor(), life: Math.max(ANIM + 0.2, Math.min(9.5, Tp * 70 / 60 + 0.3)) };
    let off = false;
    if (MA.enabled()) {
      const t0 = MA.now() + 0.04;
      const wet = !state.dry && Tp > 0.02;
      const r = wet ? reverbFor(Tp) : null;
      const base = { gain: 0.75, filter: 1800, q: 0.7, dur: 0.045, type: 'bandpass' };
      MA.hit(Object.assign({ at: t0, reverb: r }, base));
      if (!state.dry) {
        a.images.filter(function (m) { return m.level != null && m.level > -30; }).sort(function (p, q) { return q.level - p.level; }).slice(0, 12).forEach(function (m) {
          MA.hit(Object.assign({}, base, { at: t0 + (m.delay - a.t0), gain: base.gain * Math.pow(10, m.level / 20) }));
        });
      }
    } else off = soundOffHint();
    if (!off) say(state.dry ? T('乾聲的拍手：只有直達聲，沒有房間。', 'A dry clap: the direct sound only, no room.')
      : T('拍手：直達聲 ' + num(a.t0 * 1000, 1) + ' ms 後到，第一個反射再晚 ' + num(a.itdg, 1) + ' ms；迴響 ' + secs(Tp) + ' 後降低 60 分貝。',
        'Clap: the direct sound arrives after ' + num(a.t0 * 1000, 1) + ' ms, the first reflection ' + num(a.itdg, 1) + ' ms later; the reverberation drops 60 dB in ' + secs(Tp) + '.'));
    emitPlay('clap');
    updateStopBtn();
    requestDraw();
    if (view3 && view3.active) view3.onPlay();
  }
  /** 〈小星星〉前兩句（法國民謠，公有領域），C5 起 */
  const TWINKLE = [[72, 1], [72, 1], [79, 1], [79, 1], [81, 1], [81, 1], [79, 2], [77, 1], [77, 1], [76, 1], [76, 1], [74, 1], [74, 1], [72, 2]];
  const BEAT = 0.42;
  function melody() {
    MA.stopAll(0.03);
    const a = an, Tp = a.T;
    let t = 0;
    const notes = TWINKLE.map(function (n) { const o = { m: n[0], t: t, d: n[1] * BEAT, name: MT ? MT.noteName(n[0]) : String(n[0]) }; t += n[1] * BEAT; return o; });
    state.play = { kind: 'melody', t0: performance.now(), T: Tp, notes: notes, life: t + Math.min(8, Math.max(0.3, Tp)) * 0.6 };
    let off = false;
    if (MA.enabled()) {
      const t0 = MA.now() + 0.05;
      const r = !state.dry && Tp > 0.02 ? reverbFor(Tp) : null;
      notes.forEach(function (n) {
        MA.tone({ f0: MT.midiToFreq(n.m), partials: [1, 0.5, 0.3, 0.18, 0.1, 0.06], at: t0 + n.t, dur: n.d * 0.82,
          attack: 0.012, decay: 0.22, sustain: 0.45, release: 0.16, gain: 0.5, reverb: r });
      });
    } else off = soundOffHint();
    if (!off) say(state.dry ? T('〈小星星〉，乾聲（沒有房間的迴響）。', '“Twinkle, Twinkle”, dry (no room).')
      : T('〈小星星〉在' + presetName(state.preset) + '裡：迴響 ' + secs(Tp) + '。注意音和音之間有沒有連在一起。', '“Twinkle, Twinkle” in this room: reverberation ' + secs(Tp) + '. Listen whether the notes run into each other.'));
    emitPlay('melody');
    updateStopBtn();
    requestDraw();
  }
  function soundOffHint() {
    if (MA.enabled()) return false;
    say(MA.offHint());
    MA.flashSoundButton($('soundBtn'));
    return true;
  }
  $('clap').addEventListener('click', clap);
  $('melody').addEventListener('click', melody);
  $('stop').addEventListener('click', function () { stopAll(true); });
  function stopAll(msg) {
    const was = !!state.play || MA.playing();
    MA.stopAll(0.08);
    state.play = null;
    updateStopBtn();
    requestDraw();
    if (msg && was) say(T('已停止。', 'Stopped.'));
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && (state.play || MA.playing())) stopAll(true); });
  function updateStopBtn() { $('stop').disabled = !(state.play || MA.playing()); }
  MA.onChange(function () { updateStopBtn(); });

  // =====================================================================
  // 比較的房間（紀錄）
  // =====================================================================
  $('rec').addEventListener('click', function () {
    const a = an;
    state.log.push({ name: presetName(state.preset), V: a.V, A: a.A, ts: a.ts, te: a.te, T: a.T, people: a.people });
    if (state.log.length > 8) state.log.shift();
    renderLog();
    requestDraw();
    say(T('記下第 ' + state.log.length + ' 個房間：賽賓 ' + secs(a.ts) + '。', 'Kept room ' + state.log.length + ': Sabine ' + secs(a.ts) + '.'));
  });
  $('clear').addEventListener('click', function () {
    stopAll(false);
    state.log = [];
    renderLog();
    requestDraw();
    say(T('已清除比較的房間。', 'The kept rooms are cleared.'));
  });
  function renderLog() {
    const tb = $('log');
    if (!state.log.length) { tb.innerHTML = ''; $('logEmpty').hidden = false; return; }
    $('logEmpty').hidden = true;
    let h = '<tr><th>#</th><th>' + T('房間', 'Room') + '</th><th>V (m³)</th><th>' + T('人', 'People') + '</th><th>A (m²)</th><th>' + T('賽賓', 'Sabine') + '</th><th>' + T('艾林', 'Eyring') + '</th></tr>';
    state.log.forEach(function (l, i) {
      h += '<tr><td>' + (i + 1) + '</td><td>' + l.name + '</td><td>' + num(l.V, l.V < 100 ? 1 : 0) + '</td><td>' + l.people + '</td><td>' + num(l.A, l.A < 10 ? 2 : 1) + '</td><td>' + secs(l.ts) + '</td><td>' + secs(l.te) + '</td></tr>';
    });
    tb.innerHTML = h;
  }

  // =====================================================================
  // 在平面圖上拖曳聲源與聽者
  // =====================================================================
  function hitTest(x, y) {
    const a = an;
    const ds = Math.hypot(x - X(a.src.x), y - Y(a.src.y)), dl = Math.hypot(x - X(a.lis.x), y - Y(a.lis.y));
    const lim = 24;
    if (ds > lim && dl > lim) return null;
    return dl <= ds ? 'lis' : 'src';
  }
  function moveTo(which, x, y) {
    const R = C.RANGES;
    const u = Math.round(Math.max(R.u[0], Math.min(R.u[1], (x - P.ox) / P.s / state.cfg.L)) * 1000) / 1000;
    const v = Math.round(Math.max(R.v[0], Math.min(R.v[1], (P.oy - y) / P.s / state.cfg.W)) * 1000) / 1000;
    state.cfg[which] = { u: u, v: v };
    markCustom();
    recompute(); syncUI(); requestDraw();
  }
  cv.addEventListener('pointerdown', function (ev) {
    if (!P) return;
    const rc = cv.getBoundingClientRect();
    const which = hitTest(ev.clientX - rc.left, ev.clientY - rc.top);
    if (!which) return;
    ev.preventDefault();
    cv.setPointerCapture(ev.pointerId);
    state.drag = { id: ev.pointerId, which: which };
    cv.style.cursor = 'grabbing';
    if (state.play) { MA.stopAll(0.06); state.play = null; updateStopBtn(); }
  });
  cv.addEventListener('pointermove', function (ev) {
    const rc = cv.getBoundingClientRect();
    const x = ev.clientX - rc.left, y = ev.clientY - rc.top;
    if (!state.drag) { cv.style.cursor = hitTest(x, y) ? 'grab' : 'default'; return; }
    if (state.drag.id !== ev.pointerId) return;
    moveTo(state.drag.which, x, y);
  });
  function endDrag(ev) {
    if (!state.drag || state.drag.id !== ev.pointerId) return;
    const w = state.drag.which;
    state.drag = null;
    cv.style.cursor = 'grab';
    say((w === 'src' ? T('聲源', 'Source') : T('聽者', 'Listener')) + T('：距離 ', ': distance ') + num(an.r0, 2) + T(' m，直達聲 ', ' m, direct sound ') + num(an.t0 * 1000, 1) + ' ms' + (an.first ? T('，第一個反射 +', ', first reflection +') + num(an.itdg, 1) + ' ms' : '') + T('。', '.'));
    emitRoom('drag');
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);
  let kb = null, kbTimer = 0;
  if (window.LabKeys) {
    const mover = function (which) {
      return function (dx, dy, big) {
        if (!dx && !dy) return false;
        const R = C.RANGES, st = big ? 0.05 : 0.005, p = state.cfg[which];
        const u = Math.round(Math.max(R.u[0], Math.min(R.u[1], p.u + dx * st)) * 1000) / 1000;
        const v = Math.round(Math.max(R.v[0], Math.min(R.v[1], p.v - dy * st)) * 1000) / 1000;
        state.cfg[which] = { u: u, v: v };
        markCustom(); recompute(); syncUI(); requestDraw();
        clearTimeout(kbTimer); kbTimer = setTimeout(function () { emitRoom('key'); }, 400);
        return true;
      };
    };
    const desc = function (which) {
      return function () {
        const p = state.cfg[which];
        return (which === 'src' ? T('聲源', 'Source') : T('聽者', 'Listener')) + T('：沿長度 ', ': along the length ') + num(p.u * state.cfg.L, 2) + T(' m、沿寬度 ', ' m, across ') + num(p.v * state.cfg.W, 2) + T(' m；距離 ', ' m; distance ') + num(an.r0, 2) + ' m';
      };
    };
    kb = window.LabKeys.attach(cv, {
      label: T('房間平面圖。Enter 切換聲源或聽者，方向鍵移動，Shift 加方向鍵移動得更多。', 'Floor plan. Enter switches between the source and the listener, arrow keys move it, Shift for bigger steps.'),
      items: [
        { name: function () { return T('聲源', 'Source'); }, move: mover('src'), describe: desc('src') },
        { name: function () { return T('聽者', 'Listener'); }, move: mover('lis'), describe: desc('lis') }
      ],
      onChange: function () { requestDraw(); }
    });
  }

  // =====================================================================
  // 音效開關、任務事件
  // =====================================================================
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
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  function emitRoom(via) { emit('room', C.payload(an, { via: via, preset: state.preset })); }
  function emitPlay(kind) { emit('play', C.payload(an, { via: 'button', preset: state.preset, kind: kind, dry: state.dry })); }

  // =====================================================================
  // 分享目前的設定（滑桿、選單、按鈕由 classroom.js 記錄；這裡記完整設定與聲源、聽者的位置）
  // =====================================================================
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () { const c = state.cfg; return { v: 1, L: c.L, W: c.W, H: c.H, people: c.people, mats: Object.assign({}, c.mats), src: c.src, lis: c.lis, formula: c.formula, order: c.order, preset: state.preset, dry: state.dry }; },
    set: function (o) {
      if (!o || typeof o !== 'object') return;
      stopAll(false);
      state.cfg = C.normalize(Object.assign({}, state.cfg, o, { mats: Object.assign({}, state.cfg.mats, o.mats || {}) }));
      state.preset = C.PRESETS[o.preset] ? o.preset : 'custom';
      state.dry = !!o.dry;
      recompute();
      syncSliders(); syncMats(); syncUI(); resize();
    }
  });

  // =====================================================================
  // 3D 檢視（three.js 與 reverb-room-3d.js 都在第一次切到 3D 時才載入）
  // =====================================================================
  let view3 = null, threeLib = null, loadToken = 0;
  const host3 = $('view3'), viewMsg = $('viewMsg');
  function webglAvailable() {
    try { const x = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (x.getContext('webgl2') || x.getContext('webgl'))); } catch (e) { return false; }
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.ReverbRoom3D) { resolve(); return; }
      const s = document.createElement('script');
      const v = (document.querySelector('script[src*="reverb-room.js"]') || {}).src || '';
      const q = /\?v=[^&#]+/.exec(v);
      s.src = src + (q ? q[0] : '');
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('3D script failed')); };
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (threeLib) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    return loadScript('js/reverb-room-3d.js').then(function () {
      return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js')]);
    }).then(function (mods) { threeLib = { THREE: mods[0], OrbitControls: mods[1].OrbitControls }; return threeLib; });
  }
  function snapshot3() {
    const now = performance.now(), p = state.play;
    return {
      cfg: state.cfg, an: an, dry: state.dry, colors: COL,
      seats: function () { return seats(Math.min(an.people, 2000)); },
      // 拍手後經過的「物理時間」（慢動作換算），沒有在播就是 −1
      tPhys: p && p.kind === 'clap' && !reducedMotion && (now - p.t0) / 1000 < ANIM ? (now - p.t0) / 1000 / p.slow : -1
    };
  }
  function setPressed(mode) { $('view2d').setAttribute('aria-pressed', String(mode === '2d')); $('view3d').setAttribute('aria-pressed', String(mode === '3d')); }
  function setView(mode) {
    if (mode === '3d') {
      if (view3 && view3.active) return;
      const token = ++loadToken;
      setPressed('3d');
      if (!webglAvailable()) { fail3D(); return; }
      viewMsg.textContent = T('正在載入 3D 檢視…', 'Loading the 3D view…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return;
        try {
          stage.classList.add('is3d');
          view3 = window.ReverbRoom3D.create(lib, {
            host: host3, T: T, C: C, snapshot: snapshot3,
            matName: matName, surfName: surfName,
            reducedMotion: function () { return reducedMotion; },
            onLost: function () { setView('2d'); viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 平面圖。', 'The 3D graphics context was lost, so the view switched back to the 2D plan.'); }
          });
        } catch (err) {
          if (window.console) console.warn('3D view unavailable:', err);
          fail3D(); return;
        }
        viewMsg.textContent = '';
        $('resetCam').hidden = false;
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
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 平面圖。', 'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D plan is kept.');
    resize();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });

  // 給測試用的介面（不影響畫面）
  window.__rv = { state: state, an: function () { return an; }, clap: clap, melody: melody, stopAll: stopAll, applyPreset: applyPreset, view: function () { return view3; },
    screen: function (which) { const p = which === 'src' ? an.src : an.lis; return [X(p.x), Y(p.y)]; } };

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  buildMats();
  syncSliders();
  syncUI();
  renderLog();
  updateSoundButton();
  updateStopBtn();
  function themeChanged() {
    readColors();
    reducedMotion = D.reducedMotion();
    buildMats();
    syncUI(); renderLog(); updateSoundButton();
    if (view3 && view3.active) view3.onTheme();
    resize();
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && (ev.detail.name === 'lang' || ev.detail.name === 'fs')) themeChanged(); });
  if (window.ResizeObserver) {
    let lastW = 0, lastW2 = 0;
    new ResizeObserver(function () { if (cv.clientWidth !== lastW || cv2.clientWidth !== lastW2) { lastW = cv.clientWidth; lastW2 = cv2.clientWidth; resize(); } }).observe(stage);
  } else window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', function () { if (document.hidden) stopAll(false); else requestDraw(); });
  resize();
})();
