/*
 * drum-modes.js — 「鼓與板的振動模態」頁面程式（畫面、聲音、操作、任務事件；物理都在 drum-modes-core.js）
 *
 * 任務事件（都在使用者操作之後才送）：
 *   'strike'：按「▶ 敲一下」、在鼓面上點一下或拖曳放開、按 P。資料 = DrumCore.payload(分析, { via, sel })
 *   'mode'  ：使用者選了單一模態（下拉選單、◀ ▶、點頻譜長條）。{ drum, key, m, n, ratio, f }
 */
(function () {
  'use strict';
  const C = window.DrumCore, MA = window.MusicAudio, D = window.LabDraw;
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const $ = function (id) { return document.getElementById(id); };
  const FONT = 'system-ui, -apple-system, "Segoe UI", "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif';
  const lab = $('lab'), stage = $('stage'), cv = $('cv'), cv2 = $('cv2');
  const ctx = cv.getContext('2d'), ctx2 = cv2.getContext('2d');
  const VIS_HZ = 0.5;      // 畫面上最低模態大約兩秒擺一次
  const VIS_DECAY = 5;     // 衰減也放慢 5 倍
  const GRID = 84;         // 鼓面色階的取樣格數

  // =====================================================================
  // 狀態
  // =====================================================================
  const state = {
    drum: C.DEFAULTS.drum, a: C.DEFAULTS.a, T: C.DEFAULTS.T, L: C.DEFAULTS.L, h: C.DEFAULTS.h,
    r: C.DEFAULTS.r, th: C.DEFAULTS.th, x: C.DEFAULTS.x, y: C.DEFAULTS.y, damp: C.DEFAULTS.damp,
    sel: 'all',          // 'all' 或模態代號
    hit: null,           // 最近一次敲擊：{ t0, info, coef: [{ key, D, tau, nu }] }
    drag: null,
    log: []
  };
  let reducedMotion = D.reducedMotion();
  const C2 = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['canvas-bg', 'text', 'muted', 'border', 'accent', 'surface', 'bg',
      'dm-up', 'dm-down', 'dm-skin', 'dm-node', 'dm-strike', 'dm-bar', 'dm-good', 'dm-warn', 'dm-rim', 'dm-copper', 'dm-shell', 'dm-plate', 'dm-felt']
      .forEach(function (k) { C2[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
    rgbCache = null;
  }
  function fnt(px, weight) { return (weight ? weight + ' ' : '') + px + 'px ' + FONT; }
  function num(v, dec) {
    if (v == null || !isFinite(v)) return '—';
    let s = v.toFixed(dec);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  function signed(v, dec) { if (v == null || !isFinite(v)) return '—'; return (v >= 0 ? '+' : '−') + num(Math.abs(v), dec); }
  function hz(f) { return f == null || !isFinite(f) ? '—' : num(f, f >= 1000 ? 0 : 1) + ' Hz'; }
  function modeName(key) { const p = key.split('-'); return '(' + p[0] + ', ' + p[1] + ')'; }
  function cfg() { return { drum: state.drum, a: state.a, T: state.T, L: state.L, h: state.h, r: state.r, th: state.th, x: state.x, y: state.y, damp: state.damp }; }
  function info() { return C.analyze(cfg()); }
  const circ = function () { return state.drum !== 'plate'; };

  // =====================================================================
  // 滑桿
  // =====================================================================
  const SL = {
    rad: { el: $('rad'), out: $('rado'), get: function () { return state.a * 100; }, set: function (v) { state.a = v / 100; }, dec: 1 },
    ten: { el: $('ten'), out: $('teno'), get: function () { return state.T; }, set: function (v) { state.T = v; }, dec: 0 },
    side: { el: $('side'), out: $('sideo'), get: function () { return state.L * 100; }, set: function (v) { state.L = v / 100; }, dec: 1 },
    thick: { el: $('thick'), out: $('thicko'), get: function () { return state.h; }, set: function (v) { state.h = v; }, dec: 2 },
    sr: { el: $('sr'), out: $('sro'), get: function () { return state.r; }, set: function (v) { state.r = v; }, dec: 3 },
    sth: { el: $('sth'), out: $('stho'), get: function () { return state.th; }, set: function (v) { state.th = v; }, dec: 0 },
    sx: { el: $('sx'), out: $('sxo'), get: function () { return state.x; }, set: function (v) { state.x = v; }, dec: 3 },
    sy: { el: $('sy'), out: $('syo'), get: function () { return state.y; }, set: function (v) { state.y = v; }, dec: 3 },
    damp: { el: $('damp'), out: $('dampo'), get: function () { return state.damp; }, set: function (v) { state.damp = v; }, dec: 1 }
  };
  function val(el) { return window.LabNum ? window.LabNum.value(el) : +el.value; }
  function showOut(s) {
    const v = s.get();
    if (s.out.dataset.editing) return;
    const exactDec = window.LabNum ? Math.min(window.LabNum.decimals(s.el), s.dec + 2) : s.dec;
    // 打字輸入的精確值多顯示幾位，拖曳時照滑桿的間隔
    let d = s.dec;
    const e = Math.abs(v * Math.pow(10, s.dec) - Math.round(v * Math.pow(10, s.dec)));
    if (e > 1e-6) d = exactDec;
    s.out.textContent = num(v, d);
  }
  function setSlider(s, v) {
    if (window.LabNum) window.LabNum.set(s.el, v); else s.el.value = v;
  }
  function syncSliders() {
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
      showOut(s);
      settingsChanged(k);
    });
  });
  /** 改了設定：還在響的敲擊停下（畫面與聲音一致），敲擊點改變則方向重算 */
  function settingsChanged(k) {
    if (state.hit && k !== 'damp') { MA.stopAll(0.08); state.hit = null; }
    if (k === 'sth' || k === 'sx' || k === 'sy' || k === 'sr') gridKey = '';
    syncUI();
    requestDraw();
  }

  // =====================================================================
  // 鼓的種類、單一模態
  // =====================================================================
  const DRUM_NOTE = {
    membrane: ['理想的圓形鼓膜：邊緣固定，只靠張力。模態頻率比是貝索函數零點的比，不是整數。', 'An ideal round membrane: fixed rim, tension only. The mode ratios are ratios of Bessel zeros, not whole numbers.'],
    timpani: ['定音鼓：同樣的鼓皮，加上空氣與鼓腔，(1,1)…(5,1) 的實測頻率比 1.00 : 1.50 : 1.98 : 2.44 : 2.94。', 'Timpani: the same head plus the air and the kettle; measured ratios of (1,1)…(5,1) are 1.00 : 1.50 : 1.98 : 2.44 : 2.94.'],
    plate: ['四邊簡支的方形鋁板：靠抗彎曲的硬度，頻率 ∝ m² + n²。', 'A square aluminium plate, simply supported: stiffness instead of tension, frequency ∝ m² + n².']
  };
  document.querySelectorAll('#drums button').forEach(function (b) {
    b.addEventListener('click', function () { setDrum(b.getAttribute('data-drum')); });
  });
  function setDrum(d) {
    if (C.DRUMS.indexOf(d) < 0 || d === state.drum) return;
    MA.stopAll(0.06);
    state.drum = d; state.hit = null; state.sel = 'all';
    gridKey = '';
    buildModeSel();
    syncUI();
    resize();
  }
  function modeList() { return C.modesOf(state.drum); }
  function buildModeSel() {
    const sel = $('modeSel');
    const inf = info();
    let html = '<option value="all">' + T('全部（敲擊後的疊加）', 'All (the sum after a strike)') + '</option>';
    inf.modes.slice().sort(function (p, q) { return p.f - q.f; }).forEach(function (o) {
      html += '<option value="' + o.key + '">' + modeName(o.key) + '　' + T('× ', '× ') + num(o.ratio, 3) + '</option>';
    });
    sel.innerHTML = html;
    sel.value = state.sel;
  }
  function sortedKeys() { return info().modes.slice().sort(function (p, q) { return p.f - q.f; }).map(function (o) { return o.key; }); }
  function selectMode(key, via) {
    if (key !== 'all' && !C.mode(info(), key)) return;
    state.sel = key;
    $('modeSel').value = key;
    gridKey = '';
    syncUI();
    requestDraw();
    if (key !== 'all' && via) {
      const o = C.mode(info(), key);
      emit('mode', { drum: state.drum, key: key, m: o.m, n: o.n, ratio: o.ratio, f: o.f, via: via });
      say(T('單一模態 ', 'Single mode ') + modeName(key) + T('：', ': ') + hz(o.f) + T('，是基準模態的 ', ', ') + num(o.ratio, 3) + T(' 倍。', ' × the reference mode.'));
    }
  }
  $('modeSel').addEventListener('change', function () { selectMode($('modeSel').value, 'select'); });
  function stepMode(d) {
    const keys = ['all'].concat(sortedKeys());
    let i = keys.indexOf(state.sel);
    i = Math.max(0, Math.min(keys.length - 1, i + d));
    selectMode(keys[i], 'step');
  }
  $('modePrev').addEventListener('click', function () { stepMode(-1); });
  $('modeNext').addEventListener('click', function () { stepMode(1); });

  // =====================================================================
  // 畫面文字
  // =====================================================================
  function syncUI() {
    lab.setAttribute('data-drum', state.drum);
    lab.setAttribute('data-sel', state.sel === 'all' ? 'all' : 'one');
    document.querySelectorAll('#drums button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-drum') === state.drum)); });
    $('drumNote').textContent = T(DRUM_NOTE[state.drum][0], DRUM_NOTE[state.drum][1]);
    const inf = info();
    const bk = modeName(inf.baseKey);
    $('rBaseL').textContent = T('基準頻率 f', 'Reference mode f') + bk;
    $('rBase').textContent = hz(inf.fBase);
    $('rNote').textContent = inf.note + ' ' + signed(inf.noteCents, 0) + T(' 音分', ' ¢');
    $('rRef').textContent = hz(inf.fH);
    $('rCL').textContent = circ() ? T('波速 c', 'Wave speed c') : T('彎曲剛度 D', 'Bending stiffness D');
    $('rC').textContent = circ() ? num(inf.c, 1) + ' m/s' : num(C.plateD(state.h / 1000), 1) + ' N·m';
    if (inf.silent) {
      $('rEx').textContent = T('幾乎無聲', 'almost silent'); $('rInh').textContent = '—'; $('rCen').textContent = '—';
    } else {
      $('rEx').textContent = inf.excited + ' / ' + inf.modes.length;
      $('rInh').textContent = num(inf.inharm, 1) + T(' 音分', ' ¢');
      $('rInh').className = inf.inharm < 20 ? 'good' : inf.inharm > 60 ? 'warn' : '';
      $('rCen').textContent = num(inf.centroid, 2) + ' × f' + T('最低', '_low');
    }
    if (state.sel !== 'all') {
      const o = C.mode(inf, state.sel);
      $('rSel').textContent = modeName(o.key) + ' ' + hz(o.f) + ' ×' + num(o.ratio, 3);
      $('modeNote').textContent = selNote(o);
    } else {
      $('rSel').textContent = T('全部', 'all');
      $('modeNote').textContent = T('選一個模態，看它單獨振動的形狀和節線；選「全部」看敲擊後所有模態的疊加。', 'Pick a mode to see its own shape and nodal lines; choose “All” to see every mode added up after a strike.');
    }
    renderTable(inf);
    updateLowHint(inf);
  }
  function selNote(o) {
    if (state.drum === 'plate') {
      return T('沿 x 方向 ' + (o.m - 1) + ' 條、沿 y 方向 ' + (o.n - 1) + ' 條節線（不含四邊）。頻率 ∝ ' + o.m + '² + ' + o.n + '² = ' + (o.m * o.m + o.n * o.n) + '。',
        (o.m - 1) + ' nodal line(s) across x and ' + (o.n - 1) + ' across y (edges not counted). Frequency ∝ ' + o.m + '² + ' + o.n + '² = ' + (o.m * o.m + o.n * o.n) + '.');
    }
    return T(o.m + ' 條直徑節線、' + o.n + ' 個節圓（含鼓邊）。' + (o.m ? '直徑節線的方向跟著敲擊點轉。' : '圓對稱：中心敲得出來。'),
      o.m + ' nodal diameter(s) and ' + o.n + ' nodal circle(s) including the rim. ' + (o.m ? 'The diameters turn with the striking point.' : 'Round: a strike at the centre excites it.'));
  }
  function renderTable(inf) {
    const tb = $('modeTable');
    const rows = inf.modes.filter(function (o) { return o.rel >= C.AUDIBLE && !inf.silent; }).sort(function (p, q) { return p.f - q.f; });
    let html = '<tr><th>' + T('模態', 'Mode') + '</th><th>' + T('頻率', 'Freq.') + '</th><th>' + T('比值', 'Ratio') + '</th><th>' + T('強度', 'Level') + '</th><th>' + T('離整數倍', 'Off') + '</th></tr>';
    rows.forEach(function (o) {
      html += '<tr' + (o.key === state.sel ? ' class="sel"' : '') + '><td>' + modeName(o.key) + '</td><td>' + num(o.f, 1) + '</td><td>' + num(o.ratio, 3) + '</td><td>' + num(o.rel * 100, 0) + '%</td><td class="' + (Math.abs(o.dev) < 20 ? 'ok' : Math.abs(o.dev) > 60 ? 'off' : '') + '">' + signed(o.dev, 0) + '¢</td></tr>';
    });
    tb.innerHTML = html;
    const hidden = inf.modes.length - rows.length;
    $('modeTableNote').textContent = inf.silent ? T('這一點幾乎敲不出聲音。', 'Almost no sound from this point.') :
      hidden ? T('另有 ' + hidden + ' 個模態在這裡沒有被敲出來（強度不到 1%）。', hidden + ' more mode(s) are not excited here (below 1%).') : T('全部模態都被敲出來了。', 'Every mode is excited.');
  }
  function updateLowHint(inf) {
    const el = $('lowHint');
    if (inf.fLow < 200) {
      el.hidden = false;
      el.textContent = T('手機或筆電的小喇叭放不出 200 Hz 以下的聲音：最低的模態可能聽不到，戴耳機或接喇叭比較準。', 'Small phone and laptop speakers cannot play below 200 Hz: you may not hear the lowest modes. Headphones or a speaker work better.');
    } else el.hidden = true;
  }

  // =====================================================================
  // 鼓面色階（每個模態的形狀先算成格點，畫的時候線性疊加）
  // =====================================================================
  let gridKey = '', shapes = {}, inside = null;
  function orient() { return state.th * Math.PI / 180; }
  function buildGrids() {
    const key = state.drum + '|' + (circ() ? state.th : 0);
    if (key === gridKey) return;
    gridKey = key;
    shapes = {};
    const N = GRID, list = modeList();
    inside = new Uint8Array(N * N);
    const rr = new Float32Array(N * N), tt = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const u = (i + 0.5) / N, v = (j + 0.5) / N, k = j * N + i;
      if (circ()) {
        const X = 2 * u - 1, Y = 1 - 2 * v;
        rr[k] = Math.sqrt(X * X + Y * Y); tt[k] = Math.atan2(Y, X);
        inside[k] = rr[k] < 1 ? 1 : 0;
      } else inside[k] = 1;
    }
    const o = orient();
    list.forEach(function (md) {
      const g = new Float32Array(N * N);
      if (circ()) {
        const tab = C.radialTable(md, 400);
        for (let k = 0; k < N * N; k++) {
          if (!inside[k]) continue;
          const p = rr[k] * 400, i0 = Math.floor(p), f = p - i0;
          const J = tab[i0] * (1 - f) + tab[Math.min(400, i0 + 1)] * f;
          g[k] = md.norm * J * (md.m ? Math.cos(md.m * (tt[k] - o)) : 1);
        }
      } else {
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
          const u = (i + 0.5) / N, v = 1 - (j + 0.5) / N;
          g[j * N + i] = md.norm * Math.sin(md.m * Math.PI * u) * Math.sin(md.n * Math.PI * v);
        }
      }
      shapes[md.key] = g;
    });
  }
  const off = document.createElement('canvas');
  off.width = GRID; off.height = GRID;
  const offCtx = off.getContext('2d');
  const img = offCtx.createImageData(GRID, GRID);
  let rgbCache = null;
  function rgbOf(c) { const r = D.rgb(c); return [r[0], r[1], r[2]]; }
  /** 目前每個模態的係數（−1…1 左右）：單一模態看它自己；全部看敲擊後的疊加 */
  function coefficients(now) {
    const out = {};
    const tv = (now - (state.hit ? state.hit.t0 : now)) / 1000;
    if (state.sel !== 'all') {
      const ph = reducedMotion ? 1 : Math.cos(2 * Math.PI * VIS_HZ * now / 1000);
      out[state.sel] = ph;
      return out;
    }
    if (!state.hit) return out;
    state.hit.coef.forEach(function (c) {
      const env = Math.exp(-tv / (VIS_DECAY * c.tau));
      out[c.key] = reducedMotion ? c.D * env : c.D * env * Math.sin(2 * Math.PI * c.nu * tv);
    });
    return out;
  }
  function paintField(now) {
    buildGrids();
    if (!rgbCache) rgbCache = { up: rgbOf(C2['dm-up']), down: rgbOf(C2['dm-down']), skin: rgbOf(state.drum === 'plate' ? C2['dm-plate'] : C2['dm-skin']) };
    const co = coefficients(now), keys = Object.keys(co);
    const N = GRID, d = img.data;
    let maxv = state.sel !== 'all' ? 0 : 1;
    const field = new Float32Array(N * N);
    keys.forEach(function (k) { const g = shapes[k], c = co[k]; if (!g || !c) return; for (let i = 0; i < N * N; i++) field[i] += c * g[i]; });
    if (state.sel !== 'all') { const g = shapes[state.sel]; for (let i = 0; i < N * N; i++) maxv = Math.max(maxv, Math.abs(g[i])); }
    else if (state.hit) maxv = state.hit.scale;
    const up = rgbCache.up, dn = rgbCache.down, sk = rgbCache.skin;
    for (let k = 0; k < N * N; k++) {
      const p = k * 4;
      // 圓外的格點也填鼓皮的顏色（場值為 0），畫的時候再用圓形裁切，邊緣才不會有鋸齒
      const v = maxv ? Math.max(-1, Math.min(1, field[k] / maxv)) : 0;
      const w = Math.pow(Math.abs(v), 0.75), t = v >= 0 ? up : dn;
      // 往上的地方稍微亮一點、往下的稍微暗一點：像斜光照在起伏的鼓皮上
      const lift = 1 + 0.12 * v;
      d[p] = Math.min(255, (sk[0] + (t[0] - sk[0]) * w) * lift);
      d[p + 1] = Math.min(255, (sk[1] + (t[1] - sk[1]) * w) * lift);
      d[p + 2] = Math.min(255, (sk[2] + (t[2] - sk[2]) * w) * lift);
      d[p + 3] = 255;
    }
    offCtx.putImageData(img, 0, 0);
  }

  // =====================================================================
  // 畫布尺寸與版面
  // =====================================================================
  let dpr = 1, cw = 0, ch = 0, cw2 = 0, ch2 = 0, Lo = null;
  function layout() {
    const pad = cw < 480 ? 14 : 22;
    const size = Math.min(cw - 2 * pad, 430);
    const top = 38;
    return { pad: pad, size: size, cx: cw / 2, cy: top + size / 2 + 8, R: size / 2, top: top, H: top + size + (cw < 560 ? 62 : 44), two: cw < 560 };
  }
  function resize() {
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    cw = w;
    Lo = layout();
    ch = Lo.H;
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    cw2 = cv2.clientWidth || cw;
    ch2 = cw2 < 560 ? 170 : 190;
    if (cv2.style.height !== ch2 + 'px') cv2.style.height = ch2 + 'px';
    cv2.width = Math.round(cw2 * dpr); cv2.height = Math.round(ch2 * dpr);
    requestDraw();
  }
  /** 鼓面座標（圓：r 0–1、th 弧度；方：x、y 0–1）→ 畫布座標 */
  function toCanvas(p) {
    if (circ()) return { x: Lo.cx + p.r * Lo.R * Math.cos(p.th), y: Lo.cy - p.r * Lo.R * Math.sin(p.th) };
    return { x: Lo.cx - Lo.R + p.x * 2 * Lo.R, y: Lo.cy + Lo.R - p.y * 2 * Lo.R };
  }
  function fromCanvas(x, y) {
    if (circ()) {
      const X = (x - Lo.cx) / Lo.R, Y = -(y - Lo.cy) / Lo.R;
      const r = Math.sqrt(X * X + Y * Y);
      let th = Math.atan2(Y, X) * 180 / Math.PI; if (th < 0) th += 360;
      return { r: r, th: th };
    }
    return { x: (x - (Lo.cx - Lo.R)) / (2 * Lo.R), y: (Lo.cy + Lo.R - y) / (2 * Lo.R) };
  }

  // =====================================================================
  // 繪圖：鼓面
  // =====================================================================
  function draw(now) {
    if (!Lo) return;
    const c = ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, cw, ch);
    D.backdrop && D.backdrop(c, cw, ch);
    paintField(now);
    const R = Lo.R, cx = Lo.cx, cy = Lo.cy;
    c.save();
    if (circ()) {
      // 鼓身（定音鼓：銅鼓腔；理想膜：木框）與陰影
      c.fillStyle = D.shadowInk(0.18);
      c.beginPath(); c.ellipse(cx + 4, cy + R + 10, R * 0.9, 9, 0, 0, 2 * Math.PI); c.fill();
      const ring = c.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.2, cx, cy, R * 1.08);
      const rimC = state.drum === 'timpani' ? C2['dm-copper'] : C2['dm-shell'];
      ring.addColorStop(0, D.shade(rimC, 0.35)); ring.addColorStop(0.75, rimC); ring.addColorStop(1, D.shade(rimC, -0.35));
      c.fillStyle = ring;
      c.beginPath(); c.arc(cx, cy, R + 10, 0, 2 * Math.PI); c.fill();
      c.save();
      c.beginPath(); c.arc(cx, cy, R, 0, 2 * Math.PI); c.clip();
      c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
      c.drawImage(off, cx - R, cy - R, 2 * R, 2 * R);
      // 斜光的柔和高光
      const gl = c.createRadialGradient(cx - R * 0.45, cy - R * 0.5, 0, cx - R * 0.2, cy - R * 0.2, R * 1.3);
      gl.addColorStop(0, 'rgba(255,255,255,0.22)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = gl; c.fillRect(cx - R, cy - R, 2 * R, 2 * R);
      c.restore();
      // 金屬箍與調音螺絲
      c.lineWidth = 4; c.strokeStyle = C2['dm-rim'];
      c.beginPath(); c.arc(cx, cy, R + 2, 0, 2 * Math.PI); c.stroke();
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4 + Math.PI / 8;
        D.ball ? D.ball(c, cx + (R + 6) * Math.cos(a), cy + (R + 6) * Math.sin(a), 3.2, C2['dm-rim']) : null;
      }
    } else {
      c.fillStyle = D.shadowInk(0.18);
      c.fillRect(cx - R + 8, cy - R + 10, 2 * R, 2 * R);
      c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
      c.drawImage(off, cx - R, cy - R, 2 * R, 2 * R);
      const gl = c.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
      gl.addColorStop(0, 'rgba(255,255,255,0.20)'); gl.addColorStop(0.5, 'rgba(255,255,255,0.03)'); gl.addColorStop(1, 'rgba(0,0,0,0.08)');
      c.fillStyle = gl; c.fillRect(cx - R, cy - R, 2 * R, 2 * R);
      c.lineWidth = 3; c.strokeStyle = C2['dm-rim'];
      c.strokeRect(cx - R, cy - R, 2 * R, 2 * R);
    }
    c.restore();
    drawNodal(c);
    drawStrikeMark(c, now);
    drawLabels(c, now);
  }
  function drawNodal(c) {
    if (state.sel === 'all') return;
    const md = modeList().filter(function (o) { return o.key === state.sel; })[0];
    if (!md) return;
    const R = Lo.R, cx = Lo.cx, cy = Lo.cy;
    c.save();
    c.strokeStyle = C2['dm-node']; c.lineWidth = 2.6; c.lineCap = 'round';
    c.shadowColor = C2['dm-node']; c.shadowBlur = 6;
    if (circ()) {
      C.nodalCircles(md).forEach(function (rn) { c.beginPath(); c.arc(cx, cy, rn * R, 0, 2 * Math.PI); c.stroke(); });
      C.nodalDiameters(md, orient()).forEach(function (a) {
        c.beginPath(); c.moveTo(cx - R * Math.cos(a), cy + R * Math.sin(a)); c.lineTo(cx + R * Math.cos(a), cy - R * Math.sin(a)); c.stroke();
      });
    } else {
      const nl = C.plateNodalLines(md);
      nl.xs.forEach(function (u) { const x = cx - R + u * 2 * R; c.beginPath(); c.moveTo(x, cy - R); c.lineTo(x, cy + R); c.stroke(); });
      nl.ys.forEach(function (v) { const y = cy + R - v * 2 * R; c.beginPath(); c.moveTo(cx - R, y); c.lineTo(cx + R, y); c.stroke(); });
    }
    c.restore();
  }
  function strikeP() { return circ() ? { r: state.r, th: orient() } : { x: state.x, y: state.y }; }
  function drawStrikeMark(c, now) {
    const p = toCanvas(strikeP());
    const age = state.hit ? (now - state.hit.t0) / 1000 : 9;
    c.save();
    if (age < 0.6 && !reducedMotion) {
      c.strokeStyle = D.alpha(C2['dm-strike'], 0.6 * (1 - age / 0.6));
      c.lineWidth = 2;
      c.beginPath(); c.arc(p.x, p.y, 8 + 40 * age, 0, 2 * Math.PI); c.stroke();
    }
    c.fillStyle = D.alpha(C2['dm-strike'], 0.22);
    c.beginPath(); c.arc(p.x, p.y, 12, 0, 2 * Math.PI); c.fill();
    c.fillStyle = C2['dm-strike']; c.strokeStyle = C2.surface; c.lineWidth = 2;
    c.beginPath(); c.arc(p.x, p.y, 6, 0, 2 * Math.PI); c.fill(); c.stroke();
    if (kb && kb.focused && kb.focused()) {
      c.setLineDash([4, 3]); c.strokeStyle = C2.accent; c.lineWidth = 2;
      c.beginPath(); c.arc(p.x, p.y, 17, 0, 2 * Math.PI); c.stroke();
    }
    c.restore();
  }
  function drawLabels(c) {
    const inf = info();
    c.save();
    c.font = fnt(13, 600);
    const name = state.drum === 'membrane' ? T('理想膜', 'Ideal membrane') : state.drum === 'timpani' ? T('定音鼓', 'Timpani') : T('方形薄板', 'Square plate');
    let txt = name;
    if (state.sel !== 'all') { const o = C.mode(inf, state.sel); txt += T('・模態 ', ' · mode ') + modeName(o.key) + '  ' + hz(o.f); }
    else txt += T('・基準 ', ' · reference ') + modeName(inf.baseKey) + '  ' + hz(inf.fBase);
    D.pill ? D.pill(c, Lo.pad, 10, txt, { font: fnt(13, 600) }) : (c.fillStyle = C2.text, c.fillText(txt, Lo.pad, 24));
    const slow = Math.round(inf.fLow / VIS_HZ);
    c.font = fnt(12);
    c.fillStyle = C2.muted;
    c.textAlign = 'right';
    c.fillText(reducedMotion ? T('靜止畫面（減少動態）', 'Still picture (reduced motion)') : T('慢動作：放慢約 ' + slow + ' 倍', 'Slow motion: about ' + slow + '× slower'), cw - Lo.pad, Lo.two ? ch - 32 : ch - 14);
    c.textAlign = 'left';
    const sp = circ() ? T('敲擊點 r/a = ', 'Strike r/a = ') + num(state.r, 3) + T('，θ = ', ', θ = ') + num(state.th, 0) + '°' : T('敲擊點 x/L = ', 'Strike x/L = ') + num(state.x, 3) + T('，y/L = ', ', y/L = ') + num(state.y, 3);
    c.fillText(sp, Lo.pad, ch - 14);
    c.restore();
  }

  // =====================================================================
  // 繪圖：頻譜
  // =====================================================================
  let barHit = [];
  function drawSpectrum(now) {
    if (!cw2) return;
    const c = ctx2, inf = info();
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, cw2, ch2);
    const padL = 34, padR = 14, top = 16, bot = 34;
    const W = cw2 - padL - padR, H = ch2 - top - bot;
    const maxH = inf.modes.reduce(function (m, o) { return Math.max(m, o.h); }, 1) * 1.06;
    const X = function (h) { return padL + W * h / maxH; };
    c.font = fnt(11);
    c.fillStyle = C2.muted; c.strokeStyle = D.alpha(C2.muted, 0.55);
    c.setLineDash([4, 4]); c.lineWidth = 1;
    for (let k = 1; k <= Math.floor(maxH); k++) {
      const x = X(k);
      c.beginPath(); c.moveTo(x, top); c.lineTo(x, top + H); c.stroke();
      // 刻度太密時只標 1、偶數或 5 的倍數
      const step = W / maxH < 16 ? (W / maxH < 9 ? 5 : 2) : 1;
      if (k === 1 || k % step === 0) { c.textAlign = 'center'; c.fillText(String(k), x, top + H + 14); }
    }
    c.setLineDash([]);
    c.strokeStyle = C2.border; c.beginPath(); c.moveTo(padL, top + H); c.lineTo(padL + W, top + H); c.stroke();
    c.textAlign = 'left'; c.fillStyle = C2.muted;
    c.fillText(T('f ÷ f', 'f ÷ f') + 'ref', padL + W - 46, top + H + 28);
    c.save(); c.translate(11, top + H / 2); c.rotate(-Math.PI / 2); c.textAlign = 'center'; c.fillText(T('振幅', 'amplitude'), 0, 0); c.restore();
    const live = {};
    if (state.hit) {
      const tv = (now - state.hit.t0) / 1000;
      state.hit.coef.forEach(function (q) { live[q.key] = Math.abs(q.D) / state.hit.peakD * Math.exp(-tv / (VIS_DECAY * q.tau)); });
    }
    barHit = [];
    const bw = Math.max(4, Math.min(10, W / 70));
    inf.modes.forEach(function (o) {
      const x = X(o.h);
      barHit.push({ x: x, key: o.key });
      const isSel = o.key === state.sel;
      if (o.rel < C.AUDIBLE || inf.silent) {
        c.strokeStyle = D.alpha(C2.muted, 0.8); c.lineWidth = 1.2;
        c.beginPath(); c.arc(x, top + H - 4, 3, 0, 2 * Math.PI); c.stroke();
        if (isSel) { c.strokeStyle = C2['dm-node']; c.lineWidth = 2; c.beginPath(); c.arc(x, top + H - 4, 6, 0, 2 * Math.PI); c.stroke(); }
        return;
      }
      const hgt = H * o.rel;
      c.strokeStyle = isSel ? C2['dm-node'] : D.alpha(C2['dm-bar'], 0.85); c.lineWidth = isSel ? 2.4 : 1.4;
      c.strokeRect(x - bw / 2, top + H - hgt, bw, hgt);
      const lv = live[o.key] || 0;
      if (lv > 0.002) {
        const g = c.createLinearGradient(0, top + H - hgt, 0, top + H);
        g.addColorStop(0, D.shade(C2['dm-bar'], 0.25)); g.addColorStop(1, C2['dm-bar']);
        c.fillStyle = g;
        c.fillRect(x - bw / 2, top + H - H * lv, bw, H * lv);
      }
      if (o.rel > 0.25 && W > 300) {
        c.fillStyle = C2.text; c.textAlign = 'center'; c.font = fnt(10);
        c.fillText(modeName(o.key).replace(/ /g, ''), x, top + H - hgt - 4);
      }
    });
    c.textAlign = 'left';
  }
  cv2.addEventListener('click', function (ev) {
    const rc = cv2.getBoundingClientRect(), x = ev.clientX - rc.left;
    let best = null, bd = 14;
    barHit.forEach(function (b) { const d = Math.abs(b.x - x); if (d < bd) { bd = d; best = b; } });
    if (best) selectMode(best.key === state.sel ? 'all' : best.key, 'bar');
  });

  // =====================================================================
  // 動畫
  // =====================================================================
  let raf = 0;
  function frame() {
    raf = 0;
    const now = performance.now();
    if (state.hit && (now - state.hit.t0) / 1000 > state.hit.life) state.hit = null;
    if (!stage.classList.contains('is3d')) draw(now);
    drawSpectrum(now);
    if (view3 && view3.active) view3.frame();
    if ((state.hit || (state.sel !== 'all' && !reducedMotion) || (view3 && view3.active && view3.busy())) && !document.hidden) raf = requestAnimationFrame(frame);
  }
  function requestDraw() { if (!raf) raf = requestAnimationFrame(frame); }

  // =====================================================================
  // 敲一下
  // =====================================================================
  let sayTimer = 0;
  function say(msg) { const el = $('status'); clearTimeout(sayTimer); sayTimer = setTimeout(function () { el.textContent = msg || ''; }, 30); }
  function soundOffHint() {
    if (MA.enabled()) return false;
    say(MA.offHint());
    MA.flashSoundButton($('soundBtn'));
    return true;
  }
  function strike(via) {
    MA.stopAll(0.03);
    const inf = info();
    const peakD = inf.modes.reduce(function (m, o) { return Math.max(m, o.amp); }, 0) || 1;
    // 幾乎無聲時不畫起伏（否則把極小的振幅放大成滿版的色階）
    const coef = inf.silent ? [] : inf.modes.filter(function (o) { return o.rel >= C.AUDIBLE; }).map(function (o) {
      return { key: o.key, D: o.D / peakD, tau: o.tau, nu: VIS_HZ * o.f / inf.fLow };
    });
    // 疊加後的最大高度（估計值：所有係數絕對值 × 模態最大值的和，再打個折，讓色階不會一直飽和）
    buildGrids();
    // 色階的滿格：最低模態第一個週期內，取 12 個時刻實際疊加出來的最大起伏
    let sc = 0;
    if (coef.length) {
      const nG = GRID * GRID, f = new Float32Array(nG);
      for (let s = 1; s <= 12; s++) {
        const t = s / 12 / VIS_HZ;
        f.fill(0);
        coef.forEach(function (q) {
          const g = shapes[q.key], w = q.D * Math.exp(-t / (VIS_DECAY * q.tau)) * Math.sin(2 * Math.PI * q.nu * t);
          for (let i = 0; i < nG; i++) f[i] += w * g[i];
        });
        for (let i = 0; i < nG; i++) if (Math.abs(f[i]) > sc) sc = Math.abs(f[i]);
      }
    }
    const longest = coef.reduce(function (m, q) { return Math.max(m, q.tau); }, 0.2);
    state.hit = { t0: performance.now(), info: inf, coef: coef, peakD: 1, scale: Math.max(0.05, sc), life: Math.min(25, VIS_DECAY * longest * 4) };
    let offMsg = false;
    if (!inf.silent) {
      if (MA.enabled()) {
        const modes = inf.modes.filter(function (o) { return o.rel >= C.AUDIBLE; }).sort(function (p, q) { return q.rel - p.rel; }).slice(0, 24)
          .map(function (o) { return { f: o.f, a: o.rel, tau: o.tau }; });
        MA.modal({ modes: modes, gain: 0.8, attack: 0.004, dur: Math.min(8, longest * 5) });
      } else offMsg = soundOffHint();
    }
    if (!offMsg) say(describe(inf));
    addLog(inf);
    emit('strike', C.payload(inf, { via: via, sel: state.sel }));
    updateStopBtn();
    requestDraw();
    if (view3 && view3.active) view3.onStrike();
  }
  function describe(inf) {
    if (inf.silent) return T('敲在這裡幾乎沒有聲音：每個模態在這一點都不動。', 'Almost no sound here: every mode is still at this point.');
    const s = inf.modes.filter(function (o) { return o.key === inf.strongest; })[0];
    return T('敲一下：' + inf.excited + ' 個模態響起，最強的是 ' + modeName(s.key) + '（' + hz(s.f) + '），偏離整數倍平均 ' + num(inf.inharm, 0) + ' 音分。',
      'Strike: ' + inf.excited + ' modes sound; the strongest is ' + modeName(s.key) + ' (' + hz(s.f) + '); on average ' + num(inf.inharm, 0) + ' ¢ off whole-number multiples.');
  }
  $('strike').addEventListener('click', function () { strike('button'); });
  $('hearMode').addEventListener('click', function () {
    if (state.sel === 'all') return;
    const o = C.mode(info(), state.sel);
    MA.stopAll(0.03);
    if (!MA.enabled()) { soundOffHint(); return; }
    MA.modal({ modes: [{ f: o.f, a: 1, tau: Math.max(0.4, o.tau) }], gain: 0.6, attack: 0.01, dur: Math.min(3.5, Math.max(1.5, o.tau * 4)) });
    say(T('只聽 ', 'Only ') + modeName(o.key) + T('：', ': ') + hz(o.f) + T('（純音）。', ' (a pure tone).'));
    updateStopBtn();
  });
  $('stop').addEventListener('click', function () { stopAll(true); });
  function stopAll(msg) {
    const was = !!state.hit || MA.playing();
    MA.stopAll(0.08);
    state.hit = null;
    updateStopBtn();
    requestDraw();
    if (msg && was) say(T('已停止。', 'Stopped.'));
  }
  function updateStopBtn() { $('stop').disabled = !(state.hit || MA.playing()); }
  MA.onChange(function () { updateStopBtn(); });
  $('clear').addEventListener('click', function () {
    stopAll(false);
    state.log = [];
    renderLog();
    say(T('已清除敲擊紀錄。', 'The striking record is cleared.'));
  });

  // =====================================================================
  // 敲擊紀錄
  // =====================================================================
  function drumShort(d) { return d === 'membrane' ? T('理想膜', 'Membrane') : d === 'timpani' ? T('定音鼓', 'Timpani') : T('方板', 'Plate'); }
  function addLog(inf) {
    state.log.unshift({
      drum: inf.drum, where: circ() ? 'r ' + num(inf.r, 3) : num(inf.x, 2) + ', ' + num(inf.y, 2),
      f: inf.fBase, base: inf.baseKey, ex: inf.silent ? 0 : inf.excited, inh: inf.silent ? null : inf.inharm, cen: inf.silent ? null : inf.centroid
    });
    state.log = state.log.slice(0, 8);
    renderLog();
  }
  function renderLog() {
    const tb = $('log');
    if (!state.log.length) { tb.innerHTML = ''; $('logEmpty').hidden = false; return; }
    $('logEmpty').hidden = true;
    let html = '<tr><th>' + T('鼓', 'Drum') + '</th><th>' + T('敲擊點', 'Point') + '</th><th>' + T('基準', 'Ref.') + '</th><th>' + T('模態數', 'Modes') + '</th><th>' + T('偏離', 'Off') + '</th><th>' + T('重心', 'Centre') + '</th></tr>';
    state.log.forEach(function (l) {
      html += '<tr><td>' + drumShort(l.drum) + '</td><td>' + l.where + '</td><td>' + num(l.f, 1) + '</td><td>' + l.ex + '</td><td>' + (l.inh == null ? '—' : num(l.inh, 0) + '¢') + '</td><td>' + (l.cen == null ? '—' : num(l.cen, 2)) + '</td></tr>';
    });
    tb.innerHTML = html;
  }

  // =====================================================================
  // 在鼓面上點、拖曳
  // =====================================================================
  function onHead(ev) {
    const rc = cv.getBoundingClientRect();
    const x = ev.clientX - rc.left, y = ev.clientY - rc.top;
    const p = fromCanvas(x, y);
    if (circ()) return p.r <= 1.02 ? p : null;
    return p.x >= -0.02 && p.x <= 1.02 && p.y >= -0.02 && p.y <= 1.02 ? p : null;
  }
  function applyPoint(p) {
    if (circ()) {
      state.r = Math.round(Math.max(0, Math.min(0.98, p.r)) * 1000) / 1000;
      state.th = Math.round(p.th) % 360;
      setSlider(SL.sr, state.r); setSlider(SL.sth, state.th);
      showOut(SL.sr); showOut(SL.sth);
    } else {
      state.x = Math.round(Math.max(0.02, Math.min(0.98, p.x)) * 1000) / 1000;
      state.y = Math.round(Math.max(0.02, Math.min(0.98, p.y)) * 1000) / 1000;
      setSlider(SL.sx, state.x); setSlider(SL.sy, state.y);
      showOut(SL.sx); showOut(SL.sy);
    }
    gridKey = '';
    syncUI();
    requestDraw();
  }
  cv.addEventListener('pointerdown', function (ev) {
    if (!Lo) return;
    const p = onHead(ev);
    if (!p) return;
    ev.preventDefault();
    cv.setPointerCapture(ev.pointerId);
    state.drag = { id: ev.pointerId };
    if (state.hit) { MA.stopAll(0.06); state.hit = null; }
    applyPoint(p);
  });
  cv.addEventListener('pointermove', function (ev) {
    if (!state.drag || state.drag.id !== ev.pointerId) return;
    const rc = cv.getBoundingClientRect();
    applyPoint(fromCanvas(ev.clientX - rc.left, ev.clientY - rc.top));
  });
  function endDrag(ev, cancel) {
    if (!state.drag || state.drag.id !== ev.pointerId) return;
    state.drag = null;
    if (!cancel) strike('canvas');
  }
  cv.addEventListener('pointerup', function (ev) { endDrag(ev, false); });
  cv.addEventListener('pointercancel', function (ev) { endDrag(ev, true); });
  cv.addEventListener('keydown', function (e) {
    if ((e.key === 'p' || e.key === 'P') && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); strike('key'); }
  });
  let kb = null;
  if (window.LabKeys) {
    kb = window.LabKeys.attach(cv, {
      label: T('鼓面畫布。方向鍵移動敲擊點（圓形鼓：左右改方位角、上下改離中心的距離），Shift 加方向鍵移動得更多，P 敲一下。',
        'Drumhead canvas. Arrow keys move the striking point (round drums: left/right turn the direction, up/down change the distance from the centre); Shift for bigger steps; P strikes.'),
      items: [{
        name: function () { return T('敲擊點', 'Striking point'); },
        move: function (dx, dy, big) {
          if (!dx && !dy) return false;
          if (circ()) {
            if (dx) state.th = ((state.th - dx * (big ? 15 : 1)) % 360 + 360) % 360;
            if (dy) state.r = Math.max(0, Math.min(0.98, Math.round((state.r - dy * (big ? 0.05 : 0.005)) * 1000) / 1000));
            setSlider(SL.sr, state.r); setSlider(SL.sth, state.th); showOut(SL.sr); showOut(SL.sth);
          } else {
            if (dx) state.x = Math.max(0.02, Math.min(0.98, Math.round((state.x + dx * (big ? 0.05 : 0.005)) * 1000) / 1000));
            if (dy) state.y = Math.max(0.02, Math.min(0.98, Math.round((state.y - dy * (big ? 0.05 : 0.005)) * 1000) / 1000));
            setSlider(SL.sx, state.x); setSlider(SL.sy, state.y); showOut(SL.sx); showOut(SL.sy);
          }
          settingsChanged('sth');
          return true;
        },
        describe: function () {
          return circ() ? T('敲擊點 r/a ', 'Striking point r/a ') + num(state.r, 3) + T('，方位角 ', ', direction ') + num(state.th, 0) + '°'
            : T('敲擊點 x/L ', 'Striking point x/L ') + num(state.x, 3) + T('，y/L ', ', y/L ') + num(state.y, 3);
        }
      }],
      onChange: function () { requestDraw(); }
    });
  }

  // =====================================================================
  // 音效開關
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

  // =====================================================================
  // 分享目前的設定
  // =====================================================================
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () { return { v: 1, drum: state.drum, a: state.a, T: state.T, L: state.L, h: state.h, r: state.r, th: state.th, x: state.x, y: state.y, damp: state.damp, sel: state.sel }; },
    set: function (o) {
      if (!o || typeof o !== 'object') return;
      const R = C.RANGES;
      const cl = function (v, k, d) { v = +v; return isFinite(v) ? Math.max(R[k][0], Math.min(R[k][1], v)) : d; };
      stopAll(false);
      if (C.DRUMS.indexOf(o.drum) >= 0) state.drum = o.drum;
      state.a = cl(o.a, 'a', state.a); state.T = cl(o.T, 'T', state.T); state.L = cl(o.L, 'L', state.L); state.h = cl(o.h, 'h', state.h);
      state.r = cl(o.r, 'r', state.r); state.th = Math.round(cl(o.th, 'th', state.th)); state.x = cl(o.x, 'x', state.x); state.y = cl(o.y, 'y', state.y);
      state.damp = cl(o.damp, 'damp', state.damp);
      gridKey = '';
      buildModeSel();
      state.sel = typeof o.sel === 'string' && C.mode(info(), o.sel) ? o.sel : 'all';
      $('modeSel').value = state.sel;
      syncSliders(); syncUI(); resize();
    }
  });

  // =====================================================================
  // 3D 檢視（three.js 與 drum-modes-3d.js 都在第一次切到 3D 時才載入）
  // =====================================================================
  let view3 = null, threeLib = null, loadToken = 0;
  const host3 = $('view3'), viewMsg = $('viewMsg');
  function webglAvailable() {
    try { const x = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (x.getContext('webgl2') || x.getContext('webgl'))); } catch (e) { return false; }
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.DrumModes3D) { resolve(); return; }
      const s = document.createElement('script');
      const v = (document.querySelector('script[src*="drum-modes.js"]') || {}).src || '';
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
    return loadScript('js/drum-modes-3d.js').then(function () {
      return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js')]);
    }).then(function (mods) { threeLib = { THREE: mods[0], OrbitControls: mods[1].OrbitControls }; return threeLib; });
  }
  /** 3D 需要的狀態：每個模態此刻的係數（和 2D 同一套） */
  function snapshot3() {
    const now = performance.now();
    return {
      drum: state.drum, orient: orient(), sel: state.sel, strike: strikeP(), coef: coefficients(now),
      scale: state.sel !== 'all' ? 1 : (state.hit ? state.hit.scale : 1), hitAge: state.hit ? (now - state.hit.t0) / 1000 : 99,
      a: state.a, L: state.L, colors: C2
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
          view3 = window.DrumModes3D.create(lib, {
            host: host3, T: T, C: C, snapshot: snapshot3,
            reducedMotion: function () { return reducedMotion; },
            onLost: function () { setView('2d'); viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 平面。', 'The 3D graphics context was lost, so the view switched back to 2D.'); }
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
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 平面。', 'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D view is kept.');
    resize();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });

  // 給測試用的介面（不影響畫面）
  window.__dm = { state: state, info: info, strike: strike, stopAll: stopAll, setDrum: setDrum, selectMode: selectMode, view: function () { return view3; } };

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  buildModeSel();
  syncSliders();
  syncUI();
  renderLog();
  updateSoundButton();
  updateStopBtn();
  function themeChanged() {
    readColors();
    reducedMotion = D.reducedMotion();
    buildModeSel();
    syncUI(); renderLog(); updateSoundButton();
    if (view3 && view3.active) view3.onTheme();
    requestDraw();
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
