/* coriolis.js — 「科氏力與大氣的運動」的畫面與互動
 * 物理計算全部在 coriolis-core.js；3D 地球在 coriolis-3d.js，切換到 3D 時才載入。 */
(function () {
  'use strict';
  const K = window.CoriolisCore;
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
  const SLOW = 1 / 3;                 // 轉盤的慢動作倍率
  const MAP_HALF = 1000e3;            // 地圖的上下半寬（m）
  const MAX_PARCELS = 12;
  const MAX_T = 240 * 3600;           // 每團空氣最多模擬 10 天
  const EMIT_EVERY = 3 * 3600;        // 每 3 小時（模擬時間）回報一次任務事件
  const TRAIL_EVERY = 600;            // 軌跡每 10 分鐘記一點

  // =====================================================================
  // 狀態
  // =====================================================================
  const el = {
    rpm: $('rpm'), v0t: $('v0t'), aim: $('aim'), r0: $('r0'),
    lat: $('lat'), grad: $('grad'), dp: $('dp'), fric: $('fric'), v0: $('v0'), dir0: $('dir0')
  };
  const state = {
    mode: 'turn',
    // 轉盤
    spin: 1, rpm: 10, v0t: 1, aim: 0, r0: 0,
    disk: 0,                          // 盤目前轉過的角度（慣性座標，rad）
    shots: [],                        // 發射紀錄（最新的在最後）
    // 地球上的風
    lat: 25, field: 'low', G: 1, dp: 20, k: 2e-5, v0: 0, dir0: 90,
    cur: { x: -400e3, y: 300e3 },     // 十字游標（m）
    parcels: [], nextId: 1, speed: 4, running: true,
    acted: false
  };
  function omega() { return state.spin * state.rpm * 2 * Math.PI / 60; }
  function fieldNow() { return { type: state.field, G: state.G, dp: state.dp }; }
  function fieldKey(F) { return F.type === 'uniform' ? 'u' + F.G : F.type === 'low' || F.type === 'high' ? F.type + F.dp : 'n'; }
  function readSliders() {
    state.rpm = val(el.rpm); state.v0t = val(el.v0t); state.aim = val(el.aim); state.r0 = val(el.r0);
    state.lat = val(el.lat); state.G = val(el.grad); state.dp = val(el.dp); state.k = val(el.fric) * 1e-5;
    state.v0 = val(el.v0); state.dir0 = val(el.dir0);
  }

  // =====================================================================
  // 顏色與文字
  // =====================================================================
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--text', '--muted', '--border', '--accent', '--accent-soft', '--surface',
      '--co-disk', '--co-disk2', '--co-rim', '--co-target', '--co-ball', '--co-launch', '--co-low', '--co-high', '--co-iso', '--co-map',
      '--co-pgf', '--co-cor', '--co-fri', '--co-vel', '--co-p1', '--co-p2', '--co-p3', '--co-p4', '--co-p5', '--co-p6']
      .forEach(function (k) { C[k.slice(2)] = cs.getPropertyValue(k).trim(); });
  }
  function num(v, d) {
    if (v == null || !isFinite(v)) return '—';
    let s = v.toFixed(d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  function outNum(v, lo, hi) {
    let t = v.toFixed(hi);
    if (hi > lo) t = t.replace(new RegExp('0{1,' + (hi - lo) + '}$'), '').replace(/\.$/, '');
    return t.replace('-', '−');
  }
  function setHTML(id, html) { const e = $(id); if (e && e.innerHTML !== html) e.innerHTML = html; }
  function setOut(inp, txt) { const o = inp.parentNode.querySelector('output'); if (o && o.textContent !== txt && !o.dataset.editing) o.textContent = txt; }
  /** 科學記號（HTML）：6.16×10<sup>−5</sup> */
  function sci(v, d) {
    if (!isFinite(v) || v === 0) return num(v, d);
    const e = Math.floor(Math.log10(Math.abs(v)));
    return num(v / Math.pow(10, e), d) + '×10<sup>' + String(e).replace('-', '−') + '</sup>';
  }
  function latName(lat) {
    const a = Math.abs(lat);
    if (a < 0.005) return T('赤道（0°）', 'the equator (0°)');
    return lat > 0 ? T('北緯 ', '') + outNum(a, 0, 2) + T('°', '° N') : T('南緯 ', '') + outNum(a, 0, 2) + T('°', '° S');
  }
  function latShort(lat) {
    const a = Math.abs(lat);
    if (a < 0.005) return '0°';
    return outNum(a, 0, 1) + (lat > 0 ? T('°N', '°N') : T('°S', '°S'));
  }
  function hours(sec) { return num(sec / 3600, sec < 36000 ? 2 : 1) + T(' 小時', ' h'); }
  /** 方位（吹向）：0＝北、90＝東 */
  function bearing(u, v) { let b = Math.atan2(u, v) / K.DEG; if (b < 0) b += 360; return b; }
  function compass(b) {
    const zh = ['北', '東北', '東', '東南', '南', '西南', '西', '西北'], en = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const i = Math.round(b / 45) % 8;
    return T(zh[i], en[i]);
  }
  function sideWord(miss) { return miss < 0 ? T('偏右 ', 'right by ') : T('偏左 ', 'left by '); }
  const PCOL = ['co-p1', 'co-p2', 'co-p3', 'co-p4', 'co-p5', 'co-p6'];

  // =====================================================================
  // 畫布
  // =====================================================================
  const cv = $('cv'), ctx = cv.getContext('2d');
  let cvSize = null;
  function fit(c, g) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth || 300, h = c.clientHeight || 300;
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: w, h: h, dpr: dpr };
  }
  function resizeCv() { cvSize = fit(cv, ctx); bgKey = ''; requestDraw(); }

  // =====================================================================
  // 轉盤
  // =====================================================================
  function turnLay() {
    const W = cvSize.w, H = cvSize.h;
    const top = 30, bot = 26;
    const pw = W / 2;
    const R = Math.max(30, Math.min(pw * 0.4, (H - top - bot) / 2 - 8));
    return { W: W, H: H, R: R, c1: [pw / 2, top + (H - top - bot) / 2], c2: [pw + pw / 2, top + (H - top - bot) / 2], pw: pw };
  }
  function rot(p, a) { const c = Math.cos(a), s = Math.sin(a); return [c * p[0] - s * p[1], s * p[0] + c * p[1]]; }
  /** 一次發射的持續時間（模擬秒）：離開盤面，或（球幾乎不動時）盤上看繞完一圈 */
  function shotEnd(sh) {
    const w = Math.abs(sh.res.omega);
    if (isFinite(sh.res.T) && sh.res.T < 20) return sh.res.T;
    return w > 1e-6 ? Math.min(2 * Math.PI / w, 60) : 3;
  }
  function launch() {
    acted();
    readSliders();
    const w = omega();
    const res = K.turntable({ omega: w, v0: state.v0t, aim: state.aim, r0: state.r0, R: 1 });
    state.shots.forEach(function (s) { s.old = true; });
    state.shots.push({ res: res, th: state.disk, tau: 0, done: false, end: 0,
      p: { spin: state.spin, rpm: state.rpm, v0: state.v0t, aim: state.aim, r0: state.r0 } });
    const sh = state.shots[state.shots.length - 1];
    sh.end = shotEnd(sh);
    if (state.shots.length > 6) state.shots.shift();
    const S = sound(); if (S) S.tone({ freq: 560, dur: 0.07, type: 'triangle', gain: 0.16 });
    setStatus(T('發射！', 'Launched!'));
    updateTurnResults();
    requestDraw();
  }
  function shotFinished(sh) {
    sh.done = true;
    const r = sh.res, p = sh.p;
    const Vm = Math.hypot(r.V[0], r.V[1]);
    const S = sound();
    if (isFinite(r.T) && r.T <= sh.end + 1e-9) {
      const hit = Math.abs(r.miss) <= 2;
      if (S) {
        if (hit) { S.tone({ freq: 880, dur: 0.14, gain: 0.2 }); setTimeout(function () { S.tone({ freq: 1320, dur: 0.22, gain: 0.16 }); }, 110); }
        else S.tone({ freq: 380, dur: 0.16, type: 'triangle', gain: 0.18 });
      }
      setStatus(hit ? T('打中目標！落點與目標只差 ', 'Hit! The ball lands only ') + num(Math.abs(r.miss), 1) + T('°。', '° from the target.')
        : T('球離開盤面：落點在目標', 'The ball leaves the turntable ') + sideWord(r.miss) + num(Math.abs(r.miss), 1) + T('°（從發射器看過去）。', '° of the target (seen from the launcher).'));
      emit('land', { spin: p.spin, rpm: p.rpm, v0: p.v0, aim: p.aim, r0: p.r0, miss: r.miss, T: r.T, V: Vm });
    } else {
      if (S) S.sweep({ from: 440, to: 660, dur: 0.4, gain: 0.14 });
      if (Vm < 0.02 && p.rpm > 0 && p.r0 > 0) {
        setStatus(T('從外面看，球停在原地一動也不動；站在盤上看，它卻繞了一整圈。', 'Seen from outside the ball stays where it is; seen from the turntable it goes once around.'));
      } else setStatus(T('球還在盤上。', 'The ball is still on the turntable.'));
      emit('still', { spin: p.spin, rpm: p.rpm, v0: p.v0, aim: p.aim, r0: p.r0, V: Vm, t: sh.tau });
    }
    updateTurnResults();
  }
  function updateTurnResults() {
    const sh = state.shots[state.shots.length - 1];
    const w = omega();
    setHTML('tCor', num(2 * Math.abs(w) * state.v0t, 2) + ' m/s²');
    const a = state.v0t > 0 ? K.aimToHit(Math.abs(w), state.v0t, 1) : Infinity;
    setHTML('tAim', !(a < 90) ? T('超過 90°：從中心發射打不中，要更快或盤轉慢一點', 'More than 90°: from the centre it cannot hit; launch faster or spin slower')
      : (w > 0 ? T('往逆時針（左）', '') : w < 0 ? T('往順時針（右）', '') : '') + num(a, 1) + '°' + (w > 0 ? T('', ' anticlockwise (to the left)') : w < 0 ? T('', ' clockwise (to the right)') : ''));
    if (!sh) { ['tFlight', 'tTurned', 'tMiss'].forEach(function (id) { setHTML(id, '—'); }); return; }
    const r = sh.res;
    const flew = isFinite(r.T) && r.T <= sh.end + 1e-9;
    setHTML('tFlight', flew ? num(r.T, 2) + ' s' : (sh.done ? T('沒有離開盤面', 'never leaves') : '…'));
    setHTML('tTurned', flew ? num(Math.abs(r.omega * r.T) / K.DEG, 1) + '°' : '—');
    setHTML('tMiss', !sh.done ? '…' : flew ? (Math.abs(r.miss) <= 2 ? T('打中！', 'Hit! ') + T('差 ', 'off by ') + num(Math.abs(r.miss), 1) + '°' : sideWord(r.miss) + num(Math.abs(r.miss), 1) + '°') : '—');
  }

  function drawDisk(c, R, ang, lay) {
    // 投影
    ctx.save();
    ctx.fillStyle = D.shadowInk(D.dark ? 0.5 : 0.18);
    ctx.beginPath(); ctx.ellipse(c[0] + 3, c[1] + 5, R + 4, R + 4, 0, 0, Math.PI * 2); ctx.fill();
    // 盤面
    const g = ctx.createRadialGradient(c[0] - R * 0.3, c[1] - R * 0.35, R * 0.1, c[0], c[1], R);
    g.addColorStop(0, D.shade(C['co-disk'], 0.35)); g.addColorStop(0.75, C['co-disk']); g.addColorStop(1, C['co-disk2']);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(c[0], c[1], R, 0, Math.PI * 2); ctx.fill();
    // 輻條與同心圓（跟著盤轉）
    ctx.strokeStyle = D.alpha(C['co-rim'], 0.28); ctx.lineWidth = 1;
    for (let i = 0; i < 12; i++) {
      const a = ang + i * Math.PI / 6;
      ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.lineTo(c[0] + R * Math.cos(a), c[1] - R * Math.sin(a)); ctx.stroke();
    }
    [0.25, 0.5, 0.75].forEach(function (f) { ctx.beginPath(); ctx.arc(c[0], c[1], R * f, 0, Math.PI * 2); ctx.stroke(); });
    // 盤緣
    ctx.strokeStyle = C['co-rim']; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(c[0], c[1], R, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = D.alpha('#ffffff', D.dark ? 0.12 : 0.5); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(c[0], c[1], R - 2, Math.PI * 1.05, Math.PI * 1.6); ctx.stroke();
    // 中心軸
    D.ball(ctx, c[0], c[1], 3, C['co-rim'], { shadow: false });
    ctx.restore();
  }
  /** 盤上的物件：r 為盤座標（m），ang 為盤的轉角 */
  function diskPt(c, R, p, ang) { const q = rot(p, ang); return [c[0] + q[0] * R, c[1] - q[1] * R]; }
  function drawLauncher(c, R, ang, r0, aim) {
    const p = diskPt(c, R, [-r0, 0], ang);
    const dir = ang + aim * K.DEG;
    ctx.save();
    ctx.translate(p[0], p[1]); ctx.rotate(-dir);
    ctx.fillStyle = C['co-launch'];
    ctx.strokeStyle = D.alpha(C['canvas-bg'], 0.8); ctx.lineWidth = 1.5;
    D.roundRect(ctx, -9, -5, 15, 10, 3); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(6, -3); ctx.lineTo(12, 0); ctx.lineTo(6, 3); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function drawTarget(c, R, ang) {
    const p = diskPt(c, R, [1, 0], ang);
    ctx.save();
    ctx.strokeStyle = C['co-target']; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(p[0], p[1], 8, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = C['co-target'];
    ctx.beginPath(); ctx.arc(p[0], p[1], 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  /** 盤外的轉向箭頭（ang0 起、逆時針為正） */
  function spinArrow(c, R, w, color) {
    if (Math.abs(w) < 1e-9) return;
    const r = R + 11, s = w > 0 ? 1 : -1;
    const a0 = Math.PI * 0.18, a1 = a0 + s * Math.PI * 0.32;
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(c[0], c[1], r, -a0, -a1, s > 0); ctx.stroke();
    const ex = c[0] + r * Math.cos(a1), ey = c[1] - r * Math.sin(a1);
    const tx = -Math.sin(a1) * s, ty = -Math.cos(a1) * s;
    D.arrow(ctx, ex - tx * 10, ey - ty * 10, ex + tx * 5, ey + ty * 5, color, 2.2);
    ctx.restore();
  }
  function drawTurn(now) {
    const L = turnLay(), W = L.W, H = L.H, R = L.R;
    D.backdrop(ctx, W, H);
    ctx.strokeStyle = D.alpha(C.border, 0.9); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(Math.round(W / 2) + 0.5, 8); ctx.lineTo(Math.round(W / 2) + 0.5, H - 8); ctx.stroke();
    const w = omega();
    const narrow = W < 520;
    const fTitle = '600 ' + (narrow ? 11 : 12.5) + 'px ' + FONT;
    D.pill(ctx, narrow ? T('從外面看', 'From outside') : T('從外面看（站在地上）', 'From outside (standing on the ground)'), L.c1[0], 24, C.text, 'center', fTitle);
    D.pill(ctx, narrow ? T('站在盤上看', 'Riding the turntable') : T('站在盤上看（跟著盤轉）', 'Riding the turntable (turning with it)'), L.c2[0], 24, C.text, 'center', fTitle);

    // 右邊（轉動座標）：外面的房間反向轉
    const room = -state.disk;
    ctx.save();
    ctx.strokeStyle = D.alpha(C.muted, 0.45); ctx.lineWidth = 1.5;
    for (let i = 0; i < 24; i++) {
      const a = room + i * Math.PI / 12, r1 = R + 4, r2 = R + (i % 6 === 0 ? 10 : 7);
      ctx.beginPath(); ctx.moveTo(L.c2[0] + r1 * Math.cos(a), L.c2[1] - r1 * Math.sin(a)); ctx.lineTo(L.c2[0] + r2 * Math.cos(a), L.c2[1] - r2 * Math.sin(a)); ctx.stroke();
    }
    ctx.restore();
    drawDisk(L.c1, R, state.disk, L);
    drawDisk(L.c2, R, 0, L);
    spinArrow(L.c1, R, w, C.accent);
    spinArrow(L.c2, R, -w, D.alpha(C.muted, 0.8));

    const cur = state.shots[state.shots.length - 1];
    // 瞄準線（盤上看：發射器指向哪裡）
    const aimNow = cur && !cur.done ? cur.p.aim : state.aim, r0Now = cur && !cur.done ? cur.p.r0 : state.r0;
    ctx.save();
    ctx.setLineDash([4, 5]); ctx.strokeStyle = D.alpha(C['co-launch'], 0.7); ctx.lineWidth = 1.4;
    const lp = [-r0Now, 0], ad = [Math.cos(aimNow * K.DEG), Math.sin(aimNow * K.DEG)];
    const bq = 2 * (lp[0] * ad[0] + lp[1] * ad[1]), cq = lp[0] * lp[0] + lp[1] * lp[1] - 1;
    const sAim = (-bq + Math.sqrt(bq * bq - 4 * cq)) / 2;
    const e2 = diskPt(L.c2, R, [lp[0] + ad[0] * sAim, lp[1] + ad[1] * sAim], 0), s2 = diskPt(L.c2, R, lp, 0);
    ctx.beginPath(); ctx.moveTo(s2[0], s2[1]); ctx.lineTo(e2[0], e2[1]); ctx.stroke();
    ctx.restore();

    // 軌跡
    state.shots.forEach(function (sh) {
      const r = sh.res, n = 90, tEnd = Math.min(sh.tau, sh.end);
      const col = sh.old ? D.alpha(C['co-ball'], 0.35) : C['co-ball'];
      [0, 1].forEach(function (side) {
        ctx.save();
        ctx.strokeStyle = col; ctx.lineWidth = sh.old ? 1.5 : 2.4; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.beginPath();
        for (let i = 0; i <= n; i++) {
          const t = tEnd * i / n, at = K.turntableAt(r, t);
          const q = side === 0 ? diskPt(L.c1, R, at.inertial, sh.th) : diskPt(L.c2, R, at.rotating, 0);
          if (i === 0) ctx.moveTo(q[0], q[1]); else ctx.lineTo(q[0], q[1]);
        }
        ctx.stroke();
        ctx.restore();
      });
      // 落點（盤上看）
      if (sh.done && r.exit && isFinite(r.T) && r.T <= sh.end + 1e-9) {
        const q = diskPt(L.c2, R, r.exit, 0);
        ctx.save();
        ctx.strokeStyle = sh.old ? D.alpha(C['co-ball'], 0.5) : C['co-ball']; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(q[0] - 5, q[1] - 5); ctx.lineTo(q[0] + 5, q[1] + 5); ctx.moveTo(q[0] + 5, q[1] - 5); ctx.lineTo(q[0] - 5, q[1] + 5); ctx.stroke();
        ctx.restore();
        if (!sh.old && Math.abs(r.miss) > 2) {
          // 目標到落點的弧
          ctx.save();
          ctx.strokeStyle = D.alpha(C['co-target'], 0.75); ctx.lineWidth = 2; ctx.setLineDash([3, 3]);
          const rr = R + 6;
          ctx.beginPath(); ctx.arc(L.c2[0], L.c2[1], rr, 0, -r.miss * K.DEG, r.miss > 0); ctx.stroke();
          ctx.restore();
          const am = r.miss * K.DEG / 2, rl = R + 20;
          D.pill(ctx, sideWord(r.miss) + num(Math.abs(r.miss), 1) + '°', L.c2[0] + rl * Math.cos(am), L.c2[1] - rl * Math.sin(am) + 8, C['co-target'], Math.cos(am) > 0.3 ? 'left' : 'center', '600 11.5px ' + FONT);
        }
      }
    });
    drawTarget(L.c1, R, state.disk);
    drawTarget(L.c2, R, 0);
    // 發射器（目前飛行中的那一發用發射時的設定）
    drawLauncher(L.c1, R, state.disk, r0Now, aimNow);
    drawLauncher(L.c2, R, 0, r0Now, aimNow);

    // 球與力
    if (cur) {
      const r = cur.res, t = Math.min(cur.tau, cur.end);
      const at = K.turntableAt(r, t);
      const offDisk = cur.done && isFinite(r.T) && r.T <= cur.end + 1e-9;
      const q1 = diskPt(L.c1, R, at.inertial, cur.th), q2 = diskPt(L.c2, R, at.rotating, 0);
      if (!cur.done && Math.abs(r.omega) > 1e-9) {
        // 盤上看的力（每公斤）：科氏 −2Ω×v′、離心 Ω²r′
        const vr = K.rotatingVelocity(r, t), w2 = r.omega;
        const cor = [2 * w2 * vr[1], -2 * w2 * vr[0]], cen = [w2 * w2 * at.rotating[0], w2 * w2 * at.rotating[1]];
        const mx = Math.max(Math.hypot(cor[0], cor[1]), Math.hypot(cen[0], cen[1]), 1e-9);
        const sc = Math.min(R * 0.45, 30 + 0 * mx) / mx;
        if (Math.hypot(cor[0], cor[1]) * sc > 3) D.arrow(ctx, q2[0], q2[1], q2[0] + cor[0] * sc, q2[1] - cor[1] * sc, C['co-cor'], 2.4);
        if (Math.hypot(cen[0], cen[1]) * sc > 3) D.arrow(ctx, q2[0], q2[1], q2[0] + cen[0] * sc, q2[1] - cen[1] * sc, C['co-pgf'], 2.2);
      }
      if (!offDisk) {
        D.ball(ctx, q1[0], q1[1], 6, C['co-ball']);
        D.ball(ctx, q2[0], q2[1], 6, C['co-ball']);
      }
    }
    // 底部：時間與慢動作
    const tNow = cur ? Math.min(cur.tau, cur.end) : 0;
    D.haloText(ctx, T('慢動作 1/3　', 'Slow motion ×1/3   ') + 't = ' + num(tNow, 2) + ' s', 8, H - 8, C.muted, 'left', 'alphabetic', '11.5px ' + FONT);
    const rpmTxt = state.rpm > 0 ? num(state.rpm, 1) + T(' 圈／分', ' rpm') + (state.spin > 0 ? T('，逆時針', ', anticlockwise') : T('，順時針', ', clockwise')) : T('盤不轉', 'not spinning');
    D.haloText(ctx, rpmTxt, W - 8, H - 8, C.muted, 'right', 'alphabetic', '11.5px ' + FONT);
    if (kb && kb.focused()) {
      ctx.save(); ctx.strokeStyle = C.accent; ctx.setLineDash([5, 4]); ctx.lineWidth = 2;
      D.roundRect(ctx, L.c2[0] - R - 16, L.c2[1] - R - 16, 2 * R + 32, 2 * R + 32, 12); ctx.stroke(); ctx.restore();
    }
  }

  // =====================================================================
  // 地球上的風：地圖
  // =====================================================================
  function mapLay(w, h, half) {
    const pad = 4;
    const s = (Math.min(h, w) - 2 * pad) / (2 * (half || MAP_HALF));
    const cx = w / 2, cy = h / 2;
    return { W: w, H: h, s: s, cx: cx, cy: cy,
      X: function (x) { return cx + x * s; }, Y: function (y) { return cy - y * s; },
      xOf: function (px) { return (px - cx) / s; }, yOf: function (py) { return (cy - py) / s; },
      xMax: (w / 2) / s, yMax: (h / 2) / s };
  }
  /** 氣壓底色（低解析度圖，放大畫） */
  let bg = null, bgKey = '';
  function pressureLayer(L, F) {
    const key = [L.W, L.H, fieldKey(F), D.ver].join('|');
    if (bg && bgKey === key) return bg;
    bgKey = key;
    const cs = 4, nx = Math.ceil(L.W / cs), ny = Math.ceil(L.H / cs);
    const c = document.createElement('canvas'); c.width = nx; c.height = ny;
    const g = c.getContext('2d'), img = g.createImageData(nx, ny);
    const base = D.rgb(C['co-map']), lo = D.rgb(C['co-low']), hi = D.rgb(C['co-high']);
    const ref = F.type === 'uniform' ? F.G * K.HPA / K.KM100 * L.yMax : F.dp * K.HPA;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x = L.xOf((i + 0.5) * cs), y = L.yOf((j + 0.5) * cs);
      let q = F.type === 'none' ? 0 : (K.pressure(F, x, y) - K.P0) / ref;
      q = Math.max(-1, Math.min(1, q));
      const tgt = q < 0 ? lo : hi, u = Math.abs(q);
      const o = 4 * (j * nx + i);
      img.data[o] = base[0] + (tgt[0] - base[0]) * u;
      img.data[o + 1] = base[1] + (tgt[1] - base[1]) * u;
      img.data[o + 2] = base[2] + (tgt[2] - base[2]) * u;
      img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    bg = c;
    return c;
  }
  /** 等壓線間隔（hPa）：線距太密時加大 */
  function isoStep(F, L) {
    let st = 2;
    if (F.type === 'uniform') { while (st / F.G * K.KM100 * L.s < 12 && st < 20) st *= 2; }
    else if (F.type === 'low' || F.type === 'high') { while (F.dp / st > 14) st *= 2; }
    return st;
  }
  function drawIsobars(g, L, F, labels) {
    if (F.type === 'none') return;
    const st = isoStep(F, L);
    g.save();
    g.strokeStyle = D.alpha(C['co-iso'], D.dark ? 0.55 : 0.5); g.lineWidth = 1.1;
    const lab = [];
    if (F.type === 'uniform') {
      const dy = st / F.G * K.KM100;     // 每條線相距（m）
      const n0 = Math.ceil(-L.yMax / dy), n1 = Math.floor(L.yMax / dy);
      for (let n = n0; n <= n1; n++) {
        const y = L.Y(n * dy);
        g.beginPath(); g.moveTo(0, y); g.lineTo(L.W, y); g.stroke();
        lab.push([L.W - 6, y - 3, (K.P0 / 100 - n * st), 'right']);
      }
    } else {
      const sg = F.sigma || K.SIGMA, sgn = F.type === 'low' ? -1 : 1;
      for (let m = 1; m * st < F.dp; m++) {
        const r = sg * Math.sqrt(2 * Math.log(F.dp / (m * st)));
        // 中心氣壓 P0 ∓ dp；從外往內每條差 st
        g.beginPath(); g.arc(L.X(0), L.Y(0), r * L.s, 0, Math.PI * 2); g.stroke();
        lab.push([L.X(0), L.Y(0) - r * L.s - 2, K.P0 / 100 + sgn * m * st, 'center']);
      }
    }
    g.restore();
    if (labels) lab.forEach(function (a, i) {
      if (a[1] < 14 || a[1] > L.H - 4) return;
      if (labels === 'map' && a[3] === 'right' && (a[1] < 36 || a[1] > L.H - 54)) return;   // 讓開右上的地點標籤與右下的指北、時間
      if (F.type !== 'uniform' && i % 2 === 1 && lab.length > 6) return;
      D.haloText(g, num(a[2], 0), a[0], a[1], D.alpha(C['co-iso'], 0.95), a[3], 'alphabetic', '10.5px ' + FONT);
    });
    if (F.type === 'low' || F.type === 'high') {
      const big = F.type === 'low' ? T('低', 'L') : T('高', 'H');
      D.haloText(g, big, L.X(0), L.Y(0), F.type === 'low' ? D.shade(C['co-pgf'], D.dark ? 0.2 : -0.2) : C['co-cor'], 'center', 'middle', '700 22px ' + FONT);
    } else if (F.type === 'uniform') {
      D.haloText(g, T('低壓', 'Low'), 10, 18, C['co-pgf'], 'left', 'alphabetic', '700 13px ' + FONT);
      D.haloText(g, T('高壓', 'High'), 10, L.H - (labels ? 52 : 10), C['co-cor'], 'left', 'alphabetic', '700 13px ' + FONT);
    }
  }
  function parcelColor(p) { return C[PCOL[(p.id - 1) % PCOL.length]]; }
  function drawTracks(g, L, opts) {
    const curKey = fieldKey(fieldNow());
    state.parcels.forEach(function (p, idx) {
      const stale = fieldKey(p.c.P.field) !== curKey;
      const col = parcelColor(p);
      const latest = idx === state.parcels.length - 1;
      g.save();
      g.globalAlpha = stale ? 0.3 : 1;
      g.strokeStyle = col; g.lineWidth = latest ? 2.4 : 1.8; g.lineJoin = 'round'; g.lineCap = 'round';
      g.beginPath();
      const tr = p.trail;
      for (let i = 0; i < tr.length; i += 2) {
        const x = L.X(tr[i]), y = L.Y(tr[i + 1]);
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.lineTo(L.X(p.c.s.x), L.Y(p.c.s.y));
      g.stroke();
      // 起點：小圓與緯度
      const sx = L.X(tr[0]), sy = L.Y(tr[1]);
      g.fillStyle = col;
      g.beginPath(); g.arc(sx, sy, 3, 0, Math.PI * 2); g.fill();
      if (!opts.texture) D.haloText(g, latShort(p.c.P.lat), sx + 5, sy - 5, col, 'left', 'alphabetic', '600 10.5px ' + FONT);
      g.restore();
      const hx = L.X(p.c.s.x), hy = L.Y(p.c.s.y);
      if (hx > -20 && hx < L.W + 20 && hy > -20 && hy < L.H + 20) {
        if (stale) { g.save(); g.globalAlpha = 0.35; D.ball(g, hx, hy, 5, col, { shadow: false }); g.restore(); }
        else D.ball(g, hx, hy, latest ? 6.5 : 5, col);
      }
    });
  }
  function drawForces(g, L) {
    const p = state.parcels[state.parcels.length - 1];
    if (!p || fieldKey(p.c.P.field) !== fieldKey(fieldNow())) return;
    const s = p.c.s, hx = L.X(s.x), hy = L.Y(s.y);
    if (hx < 0 || hx > L.W || hy < 0 || hy > L.H) return;
    const F = K.forces(p.c.P, s);
    const mags = [F.pgf, F.cor, F.fri].map(function (v) { return Math.hypot(v[0], v[1]); });
    const mx = Math.max.apply(null, mags);
    if (mx > 0) {
      const sc = 46 / mx;
      [[F.pgf, 'co-pgf'], [F.cor, 'co-cor'], [F.fri, 'co-fri']].forEach(function (a) {
        const v = a[0];
        if (Math.hypot(v[0], v[1]) * sc > 4) D.arrow(g, hx, hy, hx + v[0] * sc, hy - v[1] * sc, C[a[1]], 2.4);
      });
    }
    const sp = Math.hypot(s.u, s.v);
    if (sp > 0.05) {
      const len = Math.min(80, 8 + sp * 1.6);
      D.arrow(g, hx, hy, hx + s.u / sp * len, hy - s.v / sp * len, C['co-vel'], 2.8);
    }
  }
  function drawCursor(g, L) {
    const x = L.X(state.cur.x), y = L.Y(state.cur.y);
    g.save();
    g.strokeStyle = D.alpha(C.text, 0.75); g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(x - 10, y); g.lineTo(x - 3, y); g.moveTo(x + 3, y); g.lineTo(x + 10, y);
    g.moveTo(x, y - 10); g.lineTo(x, y - 3); g.moveTo(x, y + 3); g.lineTo(x, y + 10); g.stroke();
    g.beginPath(); g.arc(x, y, 6.5, 0, Math.PI * 2); g.stroke();
    // 初速方向
    if (state.v0 > 0) {
      const b = state.dir0 * K.DEG, len = Math.min(60, 10 + state.v0 * 1.6);
      D.arrow(g, x, y, x + Math.sin(b) * len, y - Math.cos(b) * len, D.alpha(C['co-vel'], 0.75), 2, { dash: [4, 3] });
    }
    g.restore();
  }
  function drawEarth(now) {
    const W = cvSize.w, H = cvSize.h;
    const L = mapLay(W, H);
    const F = fieldNow();
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(pressureLayer(L, F), 0, 0, W, H);
    ctx.restore();
    // 格線（每 500 km）
    D.grid(ctx, 0, 0, W, H, 500e3 * L.s, 100e3 * L.s, L.cx, L.cy);
    drawIsobars(ctx, L, F, 'map');
    drawTracks(ctx, L, {});
    drawForces(ctx, L);
    drawCursor(ctx, L);
    // 標示：地點、比例尺、指北
    const narrow = W < 480;
    D.pill(ctx, latName(state.lat) + (narrow ? '' : T('　摩擦 ', '   friction ') + outNum(state.k * 1e5, 0, 2)), W - 8, 24, C.text, 'right', '600 12px ' + FONT);
    const bar = 500e3 * L.s, bx = 12, by = H - 14;
    ctx.save();
    ctx.strokeStyle = C.text; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(bx, by - 4); ctx.lineTo(bx, by); ctx.lineTo(bx + bar, by); ctx.lineTo(bx + bar, by - 4); ctx.stroke();
    ctx.restore();
    D.haloText(ctx, '500 km', bx + bar / 2, by - 5, C.text, 'center', 'alphabetic', '11px ' + FONT);
    if (F.type !== 'none') D.haloText(ctx, T('等壓線每 ', 'Isobars every ') + isoStep(F, L) + ' hPa', bx, by - 22, C.muted, 'left', 'alphabetic', '11px ' + FONT);
    const nx = W - 18, ny = H - 46;
    D.arrow(ctx, nx, ny + 24, nx, ny, C.text, 2);
    D.haloText(ctx, T('北', 'N'), nx, ny + 38, C.text, 'center', 'alphabetic', '600 11.5px ' + FONT);
    const lp = state.parcels[state.parcels.length - 1];
    if (lp) D.haloText(ctx, 't = ' + num(lp.c.t / 3600, 1) + T(' 小時', ' h'), W - 34, H - 10, C.muted, 'right', 'alphabetic', '11.5px ' + FONT);
    if (!state.parcels.length) D.pill(ctx, T('點地圖，放出一團空氣', 'Tap the map to release air'), W / 2, H - 30, C.accent, 'center', '600 12.5px ' + FONT);
    if (kb && kb.focused()) {
      ctx.save(); ctx.strokeStyle = C.accent; ctx.setLineDash([5, 4]); ctx.lineWidth = 2;
      const x = L.X(state.cur.x), y = L.Y(state.cur.y);
      D.roundRect(ctx, x - 16, y - 16, 32, 32, 8); ctx.stroke(); ctx.restore();
    }
  }
  /** 3D 用的地圖貼圖（正方形，±1000 km） */
  function drawMapTexture(g, size) {
    const L = mapLay(size, size, MAP_HALF);
    const F = fieldNow();
    const layerSave = bg, keySave = bgKey;
    bg = null; bgKey = '';
    g.drawImage(pressureLayer(L, F), 0, 0, size, size);
    bg = layerSave; bgKey = keySave;
    D.grid(g, 0, 0, size, size, 500e3 * L.s, 0, L.cx, L.cy);
    drawIsobars(g, L, F, false);
    drawTracks(g, L, { texture: true });
    // 邊框
    g.strokeStyle = D.alpha(C.text, 0.6); g.lineWidth = 3; g.strokeRect(1.5, 1.5, size - 3, size - 3);
  }

  // =====================================================================
  // 地球上的風：放出與前進
  // =====================================================================
  function release(x, y) {
    acted();
    readSliders();
    const b = state.dir0 * K.DEG;
    const u = state.v0 * Math.sin(b), v = state.v0 * Math.cos(b);
    const c = K.parcel({ lat: state.lat, k: state.k, field: fieldNow() }, x, y, u, v);
    const p = { id: state.nextId++, c: c, trail: [x, y], nextTrail: TRAIL_EVERY, nextEmit: EMIT_EVERY, done: false, loopSaid: false, wSaid: 0, eyeSaid: false };
    state.parcels.push(p);
    if (state.parcels.length > MAX_PARCELS) state.parcels.shift();
    state.running = true;
    updatePlay();
    const S = sound(); if (S) S.tone({ freq: 660, dur: 0.06, type: 'sine', gain: 0.14 });
    setStatus(T('放出第 ', 'Released parcel #') + p.id + T(' 團空氣：', ' at ') + latName(state.lat) + T('，離中心 ', ', ') + num(Math.hypot(x, y) / 1e3, 0) + T(' km。', ' km from the centre.'));
    emit('release', { lat: state.lat, k: state.k * 1e5, field: state.field, v0: state.v0, dir: state.dir0 });
    updateNow(true);
    requestDraw();
  }
  function parcelEvent(p) { const d = K.snapshot(p.c); d.id = p.id; emit('parcel', d); }
  function stepParcels(simDt) {
    const curKey = fieldKey(fieldNow());
    state.parcels.forEach(function (p) {
      if (p.done || fieldKey(p.c.P.field) !== curKey) return;
      let left = Math.min(simDt, MAX_T - p.c.t);
      while (left > 1e-6) {
        const h = Math.min(left, p.nextTrail - p.c.t, p.nextEmit - p.c.t);
        K.advance(p.c, h, 60);
        left -= h;
        if (p.c.t >= p.nextTrail - 1e-6) { p.trail.push(p.c.s.x, p.c.s.y); p.nextTrail += TRAIL_EVERY; }
        if (p.c.t >= p.nextEmit - 1e-6) { parcelEvent(p); p.nextEmit += EMIT_EVERY; }
      }
      milestones(p);
      const far = Math.abs(p.c.s.x) > 8000e3 || Math.abs(p.c.s.y) > 8000e3;
      if (p.c.t >= MAX_T - 1e-6 || far) {
        p.done = true;
        p.trail.push(p.c.s.x, p.c.s.y);
        parcelEvent(p);
        if (p === state.parcels[state.parcels.length - 1])
          setStatus(far ? T('第 ', 'Parcel #') + p.id + T(' 團空氣已經遠遠離開地圖。', ' has left the map far behind.')
            : T('第 ', 'Parcel #') + p.id + T(' 團空氣已經模擬了 10 天。', ' has been followed for 10 days.'));
      }
    });
  }
  /** 轉滿一圈、繞中心一圈、進到中心：狀態列與音效 */
  function milestones(p) {
    const c = p.c, S = sound();
    if (c.loopT != null && !p.loopSaid) {
      p.loopSaid = true;
      parcelEvent(p);
      if (p === state.parcels[state.parcels.length - 1]) {
        setStatus(T('風向轉了一整圈，用了 ', 'The wind direction turned once around in ') + hours(c.loopT) +
          (c.P.field.type === 'none' ? T('（理論值 2π/|f| = ', ' (theory 2π/|f| = ') + hours(K.inertialPeriod(c.P.lat)) + T('）。', ').') : T('。', '.')));
        if (S) S.tone({ freq: 990, dur: 0.1, gain: 0.14 });
      }
    }
    const wn = Math.trunc(c.wind / (2 * Math.PI));
    if (Math.abs(wn) > Math.abs(p.wSaid)) {
      p.wSaid = wn;
      if (p === state.parcels[state.parcels.length - 1]) {
        setStatus(T('繞著中心轉了 ', 'Circled the centre ') + Math.abs(wn) + T(' 圈，', ' time' + (Math.abs(wn) > 1 ? 's' : '') + ', ') + (wn > 0 ? T('逆時針。', 'anticlockwise.') : T('順時針。', 'clockwise.')));
        if (S) S.tone({ freq: 740, dur: 0.07, gain: 0.12 });
      }
    }
    if (!p.eyeSaid && c.minR < 50e3 && c.P.field.type === 'low' && c.r0 > 60e3) {
      p.eyeSaid = true;
      parcelEvent(p);
      if (p === state.parcels[state.parcels.length - 1]) {
        setStatus(T('進到低氣壓中心 50 km 內，花了 ', 'Reached within 50 km of the low centre after ') + hours(c.t) + T('。', '.'));
        if (S) S.sweep({ from: 420, to: 880, dur: 0.35, gain: 0.14 });
      }
    }
  }

  // =====================================================================
  // 讀數
  // =====================================================================
  function refreshOutputs() {
    setOut(el.rpm, outNum(state.rpm, 1, 2));
    setOut(el.v0t, outNum(state.v0t, 2, 3));
    setOut(el.aim, outNum(state.aim, 1, 2));
    setOut(el.r0, outNum(state.r0, 2, 3));
    setOut(el.lat, outNum(state.lat, 1, 2));
    setOut(el.grad, outNum(state.G, 1, 2));
    setOut(el.dp, outNum(state.dp, 0, 1));
    setOut(el.fric, outNum(state.k * 1e5, 1, 2));
    setOut(el.v0, outNum(state.v0, 1, 2));
    setOut(el.dir0, outNum(state.dir0, 0, 1));
    $('gWrap').hidden = state.field !== 'uniform';
    $('dpWrap').hidden = !(state.field === 'low' || state.field === 'high');
  }
  function geoAt(F, x, y, lat) {
    const g = K.gradP(F, x, y), f = K.coriolisParam(lat);
    if (Math.abs(f) < 1e-12 || (g[0] === 0 && g[1] === 0)) return null;
    const u = -g[1] / (K.RHO * f), v = g[0] / (K.RHO * f);
    return { u: u, v: v, speed: Math.hypot(u, v) };
  }
  function updateEarthHints() {
    const f = K.coriolisParam(state.lat), Tp = K.inertialPeriod(state.lat);
    setHTML('latHint', 'f = 2Ω sin φ = <b>' + (Math.abs(f) < 1e-12 ? '0' : sci(f, 2)) + '</b> s<sup>−1</sup>' +
      T('，慣性振盪週期 ', '; inertial period ') + '<b>' + (isFinite(Tp) ? hours(Tp) : T('無限長', 'infinite')) + '</b>' + T('。', '.'));
    const F = fieldNow(), gw = geoAt(F, state.cur.x, state.cur.y, state.lat);
    setHTML('v0Hint', F.type === 'none' ? T('沒有氣壓差：沒有地轉風。給它初速，看它畫出慣性圓。', 'No pressure difference, so no geostrophic wind. Give it a starting wind and watch it draw an inertial circle.')
      : !gw ? T('赤道上 f = 0，沒有地轉風。', 'At the equator f = 0, so there is no geostrophic wind.')
      : T('在十字游標處，地轉風是 ', 'At the cross-hair the geostrophic wind is ') + '<b>' + num(gw.speed, 2) + ' m/s</b>' + T('，吹向 ', ', blowing toward ') + '<b>' + num(bearing(gw.u, gw.v), 1) + '°</b>' + T('（', ' (') + compass(bearing(gw.u, gw.v)) + T('）。', ').'));
  }
  function steadyText(p) {
    const P = p.c.P, F = P.field, f = K.coriolisParam(P.lat);
    if (F.type === 'uniform') {
      const sw = K.steadyWind(P);
      if (!sw) return T('赤道上沒有摩擦：沒有東西能讓它停下來，會一直加速。', 'At the equator without friction nothing balances the pressure force: it keeps speeding up.');
      if (P.k === 0) return T('沒有摩擦：繞著地轉風（', 'No friction: it circles around the geostrophic wind (') + num(sw.speed, 1) + ' m/s' + T('）打轉，週期 ', ') with period ') + hours(K.inertialPeriod(P.lat)) + T('。', '.');
      return T('最後會穩定成 ', 'It settles to ') + num(sw.speed, 1) + ' m/s' + T('，偏向低壓 α = ', ', crossing toward low pressure at α = ') + num(sw.angle, 1) + '°' + T('（tan α = k/|f|）。', ' (tan α = k/|f|).');
    }
    if (F.type === 'none') return Math.abs(f) < 1e-12 ? T('赤道上沒有科氏力：直線前進。', 'No Coriolis force at the equator: it goes straight.')
      : T('慣性圓：半徑 V/|f| = ', 'Inertial circle: radius V/|f| = ') + num(p.c.v0 / Math.abs(f) / 1e3, 0) + ' km' + T('，', ', ') + (f > 0 ? T('順時針。', 'clockwise.') : T('逆時針。', 'anticlockwise.'));
    if (Math.abs(f) < 1e-12) return T('赤道上沒有科氏力：直直衝向低壓中心（或從高壓衝出去）。', 'No Coriolis force at the equator: straight into the low (or straight out of the high).');
    const ccw = (F.type === 'low') === (f > 0);
    return (F.type === 'low' ? T('低氣壓：', 'Low: ') : T('高氣壓：', 'High: ')) + (ccw ? T('逆時針', 'anticlockwise') : T('順時針', 'clockwise')) +
      (P.k > 0 ? (F.type === 'low' ? T('旋入中心。', ', spiralling in.') : T('向外旋出。', ', spiralling out.')) : T('繞行（沒有摩擦，不會進到中心）。', ' circulation (no friction, so it does not reach the centre).'));
  }
  let lastNow = 0, lastSay = 0;
  function updateNow(force) {
    const t = performance.now();
    if (!force && t - lastNow < 150) return;
    lastNow = t;
    const p = state.parcels[state.parcels.length - 1];
    if (!p) {
      ['pT', 'pSpd', 'pVg', 'pDir', 'pAlpha', 'pDefl', 'pR', 'pTurns'].forEach(function (id) { setHTML(id, '—'); });
      setHTML('steadyHint', T('還沒有放出空氣。', 'No parcel released yet.'));
      return;
    }
    const d = K.snapshot(p.c), s = p.c.s, F = p.c.P.field;
    setHTML('pT', num(d.t, 1) + T(' 小時', ' h'));
    setHTML('pSpd', num(d.speed, 1) + ' m/s');
    setHTML('pVg', d.vg == null ? T('無限大（f = 0）', 'infinite (f = 0)') : F.type === 'none' ? '—' : num(d.vg, 1) + ' m/s');
    setHTML('pDir', d.speed < 0.05 ? '—' : num(bearing(s.u, s.v), 0) + '°' + T('（', ' (') + compass(bearing(s.u, s.v)) + T('）', ')'));
    setHTML('pAlpha', d.alpha == null ? '—' : num(d.alpha, 1) + '°');
    setHTML('pDefl', d.deflect == null ? '—' : (Math.abs(d.deflect) < 0.05 ? '0°' : (d.deflect > 0 ? T('往右 ', 'right ') : T('往左 ', 'left ')) + num(Math.abs(d.deflect), 1) + '°'));
    const round = F.type === 'low' || F.type === 'high';
    setHTML('pR', round ? num(d.r, 0) + ' km' : '—');
    setHTML('pTurns', round ? num(Math.abs(d.winding), 2) + (Math.abs(d.winding) < 0.005 ? '' : d.winding > 0 ? T('（逆時針）', ' (anticlockwise)') : T('（順時針）', ' (clockwise)')) : '—');
    setHTML('steadyHint', steadyText(p));
    if (force || !state.running) {
      const txt = T('第 ', 'Parcel ') + p.id + T(' 團空氣，', ', ') + num(d.t, 1) + T(' 小時，風速 ', ' h, speed ') + num(d.speed, 1) + ' m/s' +
        (d.speed >= 0.05 ? T('，吹向', ', toward ') + compass(bearing(s.u, s.v)) : '');
      if ($('srNow').textContent !== txt && t - lastSay > 900) { $('srNow').textContent = txt; lastSay = t; }
    }
  }

  // =====================================================================
  // 任務事件與音效
  // =====================================================================
  function emit(type, data) { if (state.acted && window.LabMission) window.LabMission.emit(type, data); }
  function acted() { state.acted = true; }
  function sound() { const S = window.LabSound; return S && S.enabled() ? S : null; }
  function setStatus(s) { $('status').textContent = s; }
  function updatePlay() { $('play').textContent = state.running ? T('暫停', 'Pause') : T('播放', 'Play'); }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }

  // =====================================================================
  // 控制項
  // =====================================================================
  function setMode(m, quiet) {
    state.mode = m;
    $('lab').classList.toggle('turn', m === 'turn');
    $('modeTurn').setAttribute('aria-pressed', String(m === 'turn'));
    $('modeEarth').setAttribute('aria-pressed', String(m === 'earth'));
    if (m === 'turn' && view3) setView('2d');
    cv.setAttribute('aria-label', m === 'turn' ? T('轉盤：左邊從外面看、右邊站在盤上看', 'Turntable: seen from outside on the left, from the turntable on the right')
      : T('地圖：氣壓分布與空氣的軌跡', 'Map: pressure pattern and the tracks of air parcels'));
    if (!quiet) setStatus(m === 'turn' ? T('轉盤：按「發射」推出一顆球。', 'Turntable: press “Launch the ball”.') : T('地球上的風：點地圖放出一團空氣。', 'Wind on the Earth: tap the map to release a parcel of air.'));
    updateViewNotes();
    requestAnimationFrame(function () { resizeCv(); });
  }
  $('modeTurn').addEventListener('click', function () { acted(); setMode('turn'); });
  $('modeEarth').addEventListener('click', function () { acted(); setMode('earth'); });
  function setSeg(id, attr, v) {
    document.querySelectorAll('#' + id + ' button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute(attr) === String(v))); });
  }
  document.querySelectorAll('#spinSeg button').forEach(function (b) {
    b.addEventListener('click', function () { acted(); state.spin = +b.getAttribute('data-spin'); setSeg('spinSeg', 'data-spin', state.spin); updateTurnResults(); requestDraw(); });
  });
  document.querySelectorAll('#fieldSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      acted();
      state.field = b.getAttribute('data-field');
      setSeg('fieldSeg', 'data-field', state.field);
      bgKey = '';
      refreshOutputs(); updateEarthHints(); updateNow(true); requestDraw();
    });
  });
  document.querySelectorAll('#speedSeg button').forEach(function (b) {
    b.addEventListener('click', function () { state.speed = +b.getAttribute('data-speed'); setSeg('speedSeg', 'data-speed', state.speed); });
  });
  Object.keys(el).forEach(function (k) {
    el[k].addEventListener('input', function () {
      acted(); readSliders();
      if (k === 'grad' || k === 'dp') bgKey = '';
      refreshOutputs(); updateEarthHints(); updateTurnResults(); requestDraw();
    });
    el[k].addEventListener('change', function () { readSliders(); refreshOutputs(); updateEarthHints(); updateTurnResults(); requestDraw(); });
  });
  $('launch').addEventListener('click', launch);
  $('play').addEventListener('click', function () { acted(); state.running = !state.running; updatePlay(); requestDraw(); });
  $('releaseBtn').addEventListener('click', function () { release(state.cur.x, state.cur.y); });
  $('clear').addEventListener('click', function () {
    if (state.mode === 'turn') { state.shots = []; updateTurnResults(); setStatus(T('已清除所有軌跡。', 'All tracks cleared.')); }
    else { state.parcels = []; setStatus(T('已清除所有空氣與軌跡。', 'All parcels and tracks cleared.')); updateNow(true); }
    requestDraw();
  });
  $('soundBtn').addEventListener('click', function () {
    const on = !(window.LabSettings && window.LabSettings.get('sound'));
    if (window.LabSettings) window.LabSettings.set('sound', on);
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'sound') updateSoundButton(); });

  // ---------- 點地圖 ----------
  function evPos(ev) { const r = cv.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }
  cv.addEventListener('pointerdown', function (ev) {
    if (state.mode !== 'earth' || (view3 && view3.active)) return;
    const L = mapLay(cvSize.w, cvSize.h), q = evPos(ev);
    state.cur = { x: L.xOf(q[0]), y: L.yOf(q[1]) };
    updateEarthHints();
    release(state.cur.x, state.cur.y);
  });

  // ---------- 鍵盤 ----------
  const kb = window.LabKeys ? window.LabKeys.attach(cv, {
    label: T('實驗畫布。轉盤：左右鍵改瞄準角、上下鍵改發射速度。地球上的風：方向鍵移動十字游標，Enter 放出空氣。',
      'Simulation canvas. Turntable: left/right change the aim, up/down the launch speed. Wind: arrow keys move the cross-hair, Enter releases air.'),
    items: [{
      name: function () { return state.mode === 'turn' ? T('發射器', 'Launcher') : T('十字游標', 'Cross-hair'); },
      move: function (dx, dy, big) {
        acted();
        if (state.mode === 'turn') {
          if (dx) { const a = Math.max(-90, Math.min(90, state.aim + dx * (big ? 5 : 0.5))); if (window.LabNum) window.LabNum.set(el.aim, a); else el.aim.value = a; }
          if (dy) { const v = Math.max(0, Math.min(3, state.v0t - dy * (big ? 0.25 : 0.05))); if (window.LabNum) window.LabNum.set(el.v0t, v); else el.v0t.value = v; }
          readSliders(); refreshOutputs(); updateTurnResults();
          return true;
        }
        const L = mapLay(cvSize.w, cvSize.h), st = big ? 200e3 : 50e3;
        state.cur = { x: Math.max(-L.xMax, Math.min(L.xMax, state.cur.x + dx * st)), y: Math.max(-L.yMax, Math.min(L.yMax, state.cur.y - dy * st)) };
        updateEarthHints();
        return true;
      },
      describe: function () {
        if (state.mode === 'turn') return T('瞄準角 ', 'Aim ') + num(state.aim, 1) + T('°，發射速度 ', '°, launch speed ') + num(state.v0t, 2) + ' m/s';
        return T('十字游標在中心', 'Cross-hair ') + (state.cur.x >= 0 ? T('以東 ', '') : T('以西 ', '')) + num(Math.abs(state.cur.x) / 1e3, 0) + T(' km、', ' km ' + (state.cur.x >= 0 ? 'east' : 'west') + ', ') +
          (state.cur.y >= 0 ? T('以北 ', '') : T('以南 ', '')) + num(Math.abs(state.cur.y) / 1e3, 0) + T(' km', ' km ' + (state.cur.y >= 0 ? 'north' : 'south') + ' of the centre');
      }
    }],
    onChange: function () { requestDraw(); }
  }) : null;
  cv.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    if (state.mode === 'earth') release(state.cur.x, state.cur.y);
    else launch();
  });

  // ---------- 分享：模式、分段按鈕與十字游標 ----------
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () { return { m: state.mode, sp: state.spin, fd: state.field, cx: Math.round(state.cur.x / 1e3), cy: Math.round(state.cur.y / 1e3) }; },
    set: function (o) {
      if (!o) return;
      if (o.sp === 1 || o.sp === -1) { state.spin = o.sp; setSeg('spinSeg', 'data-spin', o.sp); }
      if (['none', 'uniform', 'low', 'high'].indexOf(o.fd) >= 0) { state.field = o.fd; setSeg('fieldSeg', 'data-field', o.fd); bgKey = ''; }
      if (isFinite(o.cx) && isFinite(o.cy)) state.cur = { x: Math.max(-3000, Math.min(3000, +o.cx)) * 1e3, y: Math.max(-1000, Math.min(1000, +o.cy)) * 1e3 };
      readSliders(); refreshOutputs(); updateEarthHints(); updateTurnResults();
      if (o.m === 'turn' || o.m === 'earth') setMode(o.m, true);
      requestDraw();
    }
  });

  // =====================================================================
  // 繪圖迴圈
  // =====================================================================
  let raf = 0, lastFrame = 0;
  function requestDraw() { if (!raf) raf = requestAnimationFrame(loop); }
  function loop(now) {
    raf = 0;
    const dt = lastFrame ? Math.min(1 / 20, (now - lastFrame) / 1000) : 0;
    lastFrame = now;
    let busy = false;
    if (state.mode === 'turn') {
      const cur = state.shots[state.shots.length - 1];
      const flying = cur && !cur.done;
      if (dt > 0 && !document.hidden && (flying || !reducedMotion)) state.disk += omega() * dt * SLOW;
      if (flying && dt > 0) {
        cur.tau += dt * SLOW;
        if (cur.tau >= cur.end) { cur.tau = cur.end; shotFinished(cur); }
      }
      busy = flying || (!reducedMotion && state.rpm > 0);
      drawTurn(now);
    } else {
      const moving = state.running && state.parcels.some(function (p) { return !p.done; });
      if (moving && dt > 0 && !document.hidden) { stepParcels(dt * state.speed * 3600); updateNow(); }
      busy = moving;
      if (view3 && view3.active) { view3.frame(now); busy = busy || view3.busy(); }
      else drawEarth(now);
    }
    if (busy) raf = requestAnimationFrame(loop);
    else lastFrame = 0;
  }

  // =====================================================================
  // 3D 檢視（只在「地球上的風」；切換時才載入 three.js 與 coriolis-3d.js）
  // =====================================================================
  let view3 = null, threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  const bridge = {
    K: K, T: T, D: D, state: state, colors: function () { return C; }, reducedMotion: reducedMotion,
    num: num, latName: latName, hours: hours, drawMapTexture: drawMapTexture, mapHalf: MAP_HALF,
    request: function () { requestDraw(); },
    onCam: function (kind) { acted(); emit('cam', { preset: kind }); },
    onContextLost: function () {
      setView('2d');
      viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 地圖。', 'The 3D graphics context was lost, so the view switched back to the 2D map.');
    }
  };
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
    catch (e) { return false; }
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.Coriolis3D) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (threeLib && window.Coriolis3D) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    const own = new URL('js/coriolis-3d.js' + (SCRIPT_V ? '?v=' + SCRIPT_V : ''), document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js'), loadScript(own)]).then(function (mods) {
      if (!window.Coriolis3D) throw new Error('coriolis-3d.js did not load');
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
      viewMsg.textContent = T('正在載入 3D 地球…', 'Loading the 3D globe…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return;
        view3 = window.Coriolis3D.create(lib, host3, bridge);
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
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 地圖。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D map is kept.');
    updateViewNotes();
    resizeCv();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { acted(); setView('3d'); emit('view', { mode: '3d' }); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });
  ['Site', 'Space', 'Pole'].forEach(function (k) {
    $('cam' + k).addEventListener('click', function () { if (view3) { view3.camTo(k.toLowerCase()); bridge.onCam(k.toLowerCase()); } });
  });

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  readSliders();
  refreshOutputs();
  updatePlay();
  updateSoundButton();
  updateEarthHints();
  updateTurnResults();
  setMode('turn', true);
  // 語言切換也會發出 lab:themechange（settings.js），所以這裡一併更新文字
  function themeChanged() {
    readColors();
    bgKey = '';
    updatePlay(); updateSoundButton(); updateEarthHints(); updateTurnResults(); updateNow(true);
    cv.setAttribute('aria-label', state.mode === 'turn' ? T('轉盤：左邊從外面看、右邊站在盤上看', 'Turntable: seen from outside on the left, from the turntable on the right')
      : T('地圖：氣壓分布與空氣的軌跡', 'Map: pressure pattern and the tracks of air parcels'));
    if (view3 && view3.active) view3.onTheme();
    requestDraw();
  }
  const dm = window.matchMedia('(prefers-color-scheme: dark)');
  if (dm.addEventListener) dm.addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lw = 0, lh = 0;
    new ResizeObserver(function () { if (cv.clientWidth !== lw || cv.clientHeight !== lh) { lw = cv.clientWidth; lh = cv.clientHeight; if (lw > 0) resizeCv(); } }).observe(cv);
  } else window.addEventListener('resize', resizeCv);
  resizeCv();
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { lastFrame = 0; requestDraw(); } });
  setStatus(T('轉盤：按「發射」推出一顆球。', 'Turntable: press “Launch the ball”.'));
  updateNow(true);
  requestDraw();
  // 測試用（Playwright）
  window.__co = { state: state, K: K, launch: launch, release: release, setMode: setMode, setView: setView,
    run: function (simSec) { stepParcels(simSec); updateNow(true); requestDraw(); } };
})();
