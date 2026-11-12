/* packet-routing.js — 「網路封包與路由」的畫面與互動（模擬在 packet-routing-core.js 的 World；共用繪圖工具 LabDraw 在 drawkit.js）
 *
 * 畫面只「呈現」核心算好的狀態：封包的位置由出發時間、傳輸時間、傳播延遲直接算出（儲存轉送），不另外做補間。
 * 光暈、波紋、碎片只是視覺回饋，不改任何數值。任務事件只在使用者操作之後送出（見 js/missions/packet-routing.js 開頭）。 */
(function () {
  'use strict';
  const RC = window.RoutingCore;
  const D = window.LabDraw;
  const FONT = D.FONT;
  const MONO = 'ui-monospace, "Cascadia Mono", Consolas, "Courier New", monospace';
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const alpha = D.alpha, shade = D.shade;
  const MS_PER_SEC = 8;          // 1 倍速：真實 1 秒 = 網路時間 8 毫秒
  const IDLE_FF = 8;             // 網路上沒有封包、只在等逾時：快轉 8 倍
  const MISSION_EVENTS = { delivered: 1, finished: 1, failed: 1, dropped: 1, trace: 1, dv: 1 };
  const fmt = function (x) { return String(Math.round(x * 100) / 100); };

  // ---------- 模擬與狀態 ----------
  const w = new RC.World('city');
  const state = {
    speed: 1, paused: false, ff: false,
    link: 0, router: -1, hoverLink: -1, hoverNode: -1, kbFocus: false,
    fx: [], chart: {}, chartKey: '', chartInfo: null,
    trace: [], selSeq: -1, firstDrop: false, lastSum: null,
    tableOld: null, tableKey: ''
  };
  state.router = w.net.gw[w.net.pc].router;

  // ---------- 色彩 ----------
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['canvas-bg', 'text', 'muted', 'border', 'accent', 'accent-soft', 'surface',
      'pr-wire', 'pr-path', 'pr-cut', 'pr-router', 'pr-host', 'pr-data', 'pr-ack', 'pr-probe', 'pr-icmp', 'pr-loop', 'pr-panel', 'pr-ok', 'pr-warn']
      .forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
  }
  function fnt(px, weight, family) { return (weight ? weight + ' ' : '') + px + 'px ' + (family || FONT); }
  function kindColor(kind) { return kind === 'data' ? C['pr-data'] : kind === 'ack' ? C['pr-ack'] : kind === 'probe' ? C['pr-probe'] : C['pr-icmp']; }
  function nodeName(i) {
    const n = w.net.nodes[i];
    if (n.id === 'PC') return T('電腦', 'Computer');
    if (n.id === 'SV') return T('伺服器', 'Server');
    return n.id;
  }

  // =====================================================================
  // 版面
  // =====================================================================
  const cv = $('cv'), ctx = cv.getContext('2d');
  const cv2 = $('cv2'), ctx2 = cv2.getContext('2d');
  const cv3 = $('cv3'), ctx3 = cv3.getContext('2d');
  const stage = $('stage');
  let dpr = 1, cw = 320, ch = 420, cw2 = 320, ch2 = 150, cw3 = 320, ch3 = 200;
  let G = { x0: 0, x1: 1, y0: 0, y1: 1, R: 14, narrow: false, TW: 6 };
  function resize() {
    const wv = cv.clientWidth;
    if (!wv) return;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    cw = wv;
    const narrow = cw < 560;
    // 窄螢幕把網路轉 90°：電腦在上、伺服器在下，路由器之間才有足夠的空間
    ch = Math.round(narrow ? Math.min(620, Math.max(430, cw * 1.45)) : Math.max(320, Math.min(480, cw * 0.56)));
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    const R = narrow ? 12.5 : Math.max(13, Math.min(21, cw / 40));
    const padX = narrow ? 30 : 22;
    G = narrow ? { x0: padX, x1: cw - padX - 24, y0: 52, y1: ch - 30, R: R, narrow: true, rot: true, TW: 5 }
      : { x0: padX + R * 0.6, x1: cw - padX - R * 0.6, y0: 48, y1: ch - 40, R: R, narrow: false, rot: false, TW: 6.5 };
    bgPattern = null;
    cw3 = cv3.clientWidth || cw;
    ch3 = cw3 < 560 ? 190 : 210;
    if (cv3.style.height !== ch3 + 'px') cv3.style.height = ch3 + 'px';
    cv3.width = Math.round(cw3 * dpr); cv3.height = Math.round(ch3 * dpr);
    resizeStrip();
    requestDraw();
  }
  function pos(i) {
    const n = w.net.nodes[i];
    const u = G.rot ? n.y : n.x, v = G.rot ? n.x : n.y;
    return { x: G.x0 + u * (G.x1 - G.x0), y: G.y0 + v * (G.y1 - G.y0) };
  }
  function nodeRad(i) { return w.net.nodes[i].host ? G.R * 1.3 : G.R; }
  /** 背景的淡點陣（預先畫好的圖樣） */
  let bgPattern = null;
  function backdropDots(c) {
    D.backdrop(c, cw, ch);
    if (!bgPattern) {
      const S = 26, pc = document.createElement('canvas');
      pc.width = pc.height = Math.round(S * dpr);
      const g = pc.getContext('2d');
      g.scale(dpr, dpr);
      g.fillStyle = alpha(C.text, D.dark ? 0.13 : 0.1);
      g.beginPath(); g.arc(S / 2, S / 2, 1.1, 0, Math.PI * 2); g.fill();
      bgPattern = c.createPattern(pc, 'repeat');
      if (bgPattern && bgPattern.setTransform && window.DOMMatrix) bgPattern.setTransform(new DOMMatrix().scale(1 / dpr));
    }
    if (bgPattern) { c.fillStyle = bgPattern; c.fillRect(0, 0, cw, ch); }
  }

  // ---------- 封包列的版面 ----------
  function stripParts() {
    const j = w.job;
    if (j && j.kind === 'msg') return j.parts;
    return RC.split(RC.cleanMsg($('msg').value), Math.round(val($('k'))));
  }
  function stripLayout(P, W) {
    const pad = 12, gap = 5;
    const bw = Math.max(26, Math.min(58, (W - 2 * pad + gap) / Math.max(1, P) - gap));
    const perRow = Math.max(1, Math.floor((W - 2 * pad + gap) / (bw + gap)));
    const rows = Math.ceil(P / perRow);
    const bh = 30, rowH = bh + gap;
    const top1 = 24, top2 = top1 + rows * rowH + 22;
    return { pad: pad, gap: gap, bw: bw, bh: bh, perRow: perRow, rows: rows, rowH: rowH, top1: top1, top2: top2, textY: top2 + rows * rowH + 18, H: top2 + rows * rowH + 30 };
  }
  function resizeStrip() {
    cw2 = cv2.clientWidth || cw;
    const j = w.job;
    const P = j && j.kind === 'trace' ? 1 : stripParts().length;
    const L = stripLayout(P, cw2);
    ch2 = Math.max(130, L.H);
    if (cv2.style.height !== ch2 + 'px') cv2.style.height = ch2 + 'px';
    cv2.width = Math.round(cw2 * dpr); cv2.height = Math.round(ch2 * dpr);
    requestDraw();
  }

  // =====================================================================
  // 主迴圈：依真實時間推進網路時間
  // =====================================================================
  let rafOn = false, lastT = 0;
  function active() { return w.evq.length > 0 || w.pkts.length > 0; }
  function requestDraw() { if (!rafOn) { rafOn = true; requestAnimationFrame(frame); } }
  function frame(t) {
    rafOn = false;
    const dt = lastT ? Math.min(1 / 30, (t - lastT) / 1000) : 1 / 60;
    lastT = t;
    if (!state.paused && active()) {
      state.ff = !w.busyNet() && !w.dvPending;
      w.advance(dt * MS_PER_SEC * state.speed * (state.ff ? IDLE_FF : 1));
    } else state.ff = false;
    const now = performance.now();
    state.fx = state.fx.filter(function (f) { return now - f.t0 < f.dur; });
    draw();
    if ((!state.paused && active()) || state.fx.length) requestDraw();
    else lastT = 0;
  }

  // =====================================================================
  // 網路圖
  // =====================================================================
  function draw() {
    drawNet();
    drawStrip();
    drawChart();
  }
  function linkGeom(l) {
    const a = pos(l.a), b = pos(l.b);
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    return { a: a, b: b, ux: dx / len, uy: dy / len, len: len };
  }
  function drawNet() {
    const c = ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    backdropDots(c);
    const net = w.net;
    const cp = w.currentPath();
    const onPath = {};
    for (let i = 1; i < cp.path.length; i++) { const l = RC.linkBetween(net, cp.path[i - 1], cp.path[i]); if (l) onPath[l.i] = true; }
    const pathCol = cp.loop ? C['pr-loop'] : C['pr-path'];
    const TW = G.TW;
    // ---- 連線（底層、目前的路的光暈）----
    net.links.forEach(function (l) {
      const g = linkGeom(l);
      const sel = l.i === state.link, hov = l.i === state.hoverLink;
      if (sel || hov) {
        // 選取的連線：空心的外框（不和「目前的路」的光暈混淆）
        c.save();
        c.lineCap = 'round';
        if (sel && state.kbFocus) c.setLineDash([7, 5]);
        c.strokeStyle = alpha(C.accent, sel ? 0.85 : 0.4);
        c.lineWidth = TW + 12;
        c.beginPath(); c.moveTo(g.a.x, g.a.y); c.lineTo(g.b.x, g.b.y); c.stroke();
        c.setLineDash([]);
        c.strokeStyle = C['canvas-bg'];
        c.lineWidth = TW + 8;
        c.beginPath(); c.moveTo(g.a.x, g.a.y); c.lineTo(g.b.x, g.b.y); c.stroke();
        c.restore();
      }
      if (!l.up) {
        c.save();
        c.lineCap = 'round';
        c.setLineDash([7, 6]);
        c.strokeStyle = alpha(C['pr-cut'], 0.8);
        c.lineWidth = 2.4;
        c.beginPath(); c.moveTo(g.a.x, g.a.y); c.lineTo(g.b.x, g.b.y); c.stroke();
        c.restore();
        return;
      }
      if (onPath[l.i]) {
        c.save();
        c.lineCap = 'round';
        c.strokeStyle = alpha(pathCol, D.dark ? 0.3 : 0.22);
        c.lineWidth = TW * 3.2;
        c.beginPath(); c.moveTo(g.a.x, g.a.y); c.lineTo(g.b.x, g.b.y); c.stroke();
        c.restore();
      }
      D.tube(c, function (p) { p.moveTo(g.a.x, g.a.y); p.lineTo(g.b.x, g.b.y); }, onPath[l.i] ? pathCol : C['pr-wire'], TW);
    });
    // ---- 延遲標籤與斷線記號（標籤避開節點、節點名字與成本小標）----
    const avoid = nodeLabelRects(c);
    net.links.forEach(function (l) {
      const g = linkGeom(l);
      let mx = (g.a.x + g.b.x) / 2, my = (g.a.y + g.b.y) / 2;
      if (l.up) {
        c.font = fnt(G.narrow ? 10.5 : 11.5, 600);
        const hw = (c.measureText(l.cost + (G.narrow ? '' : ' ms')).width + 12) / 2 + 1, hh = 9.5;
        // 依序試幾個位置：第一個完全不重疊的就用；都會重疊時，取重疊面積最小的
        const tries = [0.5, 0.4, 0.6, 0.32, 0.68, 0.25, 0.75, 0.2, 0.8], gap = 2;
        let bestA = Infinity;
        for (let k = 0; k < tries.length; k++) {
          const x = g.a.x + (g.b.x - g.a.x) * tries[k], y = g.a.y + (g.b.y - g.a.y) * tries[k];
          let area = 0;
          avoid.forEach(function (r) {
            const ox = Math.min(x + hw + gap, r.x + r.w) - Math.max(x - hw - gap, r.x);
            const oy = Math.min(y + hh + gap, r.y + r.h) - Math.max(y - hh - gap, r.y);
            if (ox > 0 && oy > 0) area += ox * oy;
          });
          if (area < bestA - 0.5) { bestA = area; mx = x; my = y; }
          if (!area) break;
        }
        avoid.push({ x: mx - hw, y: my - hh, w: 2 * hw, h: 2 * hh });   // 之後的標籤也避開這一個
      }
      if (!l.up) {
        c.save();
        c.fillStyle = C['canvas-bg'];
        c.strokeStyle = C['pr-cut'];
        c.lineWidth = 2;
        c.beginPath(); c.arc(mx, my, 8.5, 0, Math.PI * 2); c.fill(); c.stroke();
        c.lineCap = 'round';
        c.beginPath(); c.moveTo(mx - 4, my - 4); c.lineTo(mx + 4, my + 4); c.moveTo(mx + 4, my - 4); c.lineTo(mx - 4, my + 4); c.stroke();
        c.restore();
        return;
      }
      const txt = l.cost + (G.narrow ? '' : ' ms');
      const col = l.cost !== l.cost0 ? C.accent : C.muted;
      D.pill(c, txt, mx, my + 8, col, 'center', fnt(G.narrow ? 10.5 : 11.5, 600));
    });
    drawPackets(c);
    // ---- 節點 ----
    net.nodes.forEach(function (n) {
      const p = pos(n.i);
      if (n.host) drawHost(c, n, p.x, p.y);
      else drawRouter(c, p.x, p.y, G.R, C['pr-router'], n.i === state.router, n.i === state.hoverNode);
    });
    // ---- 標籤與到伺服器的成本 ----
    net.nodes.forEach(function (n) {
      const p = pos(n.i);
      const f = fnt(G.narrow ? 10.5 : 12, 700), col = n.host ? C.text : C['pr-router'];
      if (G.rot) D.pill(c, nodeName(n.i), p.x + (n.host ? G.R * 1.5 : G.R) + 5, p.y + 9, col, 'left', f);   // 直式：名字放右邊
      else D.pill(c, nodeName(n.i), p.x, p.y + (n.host ? G.R * 1.55 : G.R * 0.95) + 17, col, 'center', f);
      if (!n.host) {
        const cst = costToServer(n.i);
        const fb = fnt(G.narrow ? 9.5 : 10.5, 700), cb = cst.inf ? C['pr-warn'] : C.muted;
        if (G.rot) D.pill(c, cst.text, p.x - G.R - 4, p.y + 8, cb, 'right', fb);
        else D.pill(c, cst.text, p.x + G.R * 0.78, p.y - G.R * 0.62, cb, 'left', fb);
      }
    });
    drawEffects(c);
    // ---- 時間與速度 ----
    const tTxt = T('網路時間 ', 'Network time ') + w.t.toFixed(2) + ' ms';
    D.pill(c, tTxt, 10, 26, C.text, 'left', fnt(G.narrow ? 11 : 12.5, 600, FONT));
    let sTxt;
    if (state.paused) sTxt = T('暫停中', 'Paused');
    else if (state.ff && active()) sTxt = T('等逾時：快轉 ×8', 'Waiting for a timeout: ×8');
    else sTxt = (G.narrow ? '' : T('慢動作 ', 'Slow motion ')) + T('1 秒 = ', '1 s = ') + fmt(MS_PER_SEC * state.speed) + ' ms';
    D.pill(c, sTxt, cw - 10, 26, state.paused ? C['pr-warn'] : C.muted, 'right', fnt(G.narrow ? 10.5 : 12, 600));
    if (cp.loop) D.pill(c, T('路由迴圈！', 'Routing loop!'), cw / 2, ch - 8, C['pr-loop'], 'center', fnt(12, 700));
    else if (!cp.ok) D.pill(c, T('目前沒有路可以到伺服器', 'No route to the server right now'), cw / 2, ch - 8, C['pr-warn'], 'center', fnt(12, 700));
  }
  /** 節點本身、節點名字、成本小標所佔的範圍（給連線標籤避開） */
  function nodeLabelRects(c) {
    const out = [];
    const f = fnt(G.narrow ? 10.5 : 12, 700), fb = fnt(G.narrow ? 9.5 : 10.5, 700);
    w.net.nodes.forEach(function (n) {
      const p = pos(n.i), r = nodeRad(n.i);
      out.push({ x: p.x - r, y: p.y - r * 0.9, w: 2 * r, h: r * 1.8 });
      c.font = f;
      const tw = c.measureText(nodeName(n.i)).width + 12;
      if (G.rot) out.push({ x: p.x + (n.host ? G.R * 1.5 : G.R) + 5, y: p.y - 9, w: tw, h: 18 });
      else out.push({ x: p.x - tw / 2, y: p.y + (n.host ? G.R * 1.55 : G.R * 0.95), w: tw, h: 18 });
      if (!n.host) {
        c.font = fb;
        const bw = c.measureText(costToServer(n.i).text).width + 12;
        if (G.rot) out.push({ x: p.x - G.R - 4 - bw, y: p.y - 8, w: bw, h: 16 });
        else out.push({ x: p.x + G.R * 0.78, y: p.y - G.R * 0.62 - 16, w: bw, h: 16 });
      }
    });
    return out;
  }
  function costToServer(r) {
    const sv = w.net.sv;
    if (w.algo === 'dv' && w.dv) {
      const m = w.dv.metric[r][sv];
      return m >= RC.INF ? { text: '∞', inf: true } : { text: String(m), inf: false };
    }
    const d = w.ls.dist[r] ? w.ls.dist[r][sv] : Infinity;
    return d === Infinity ? { text: '∞', inf: true } : { text: String(d), inf: false };
  }

  /** 路由器：立體圓柱，頂面畫四個箭頭（路由器的傳統符號） */
  function drawRouter(c, x, y, R, col, selected, hover) {
    const h = R * 0.7, ry = R * 0.38;
    const top = y - h / 2, bottom = y + h / 2;
    D.contactShadow(c, x, bottom + ry * 0.7, R * 0.95, 0);
    if (selected || hover) {
      c.save();
      c.strokeStyle = alpha(C.accent, selected ? 0.75 : 0.4);
      c.lineWidth = 2.5;
      c.beginPath(); c.ellipse(x, y, R + 6, h / 2 + ry + 6, 0, 0, Math.PI * 2); c.stroke();
      c.restore();
    }
    const g = c.createLinearGradient(x - R, 0, x + R, 0);
    g.addColorStop(0, shade(col, -0.3));
    g.addColorStop(0.32, shade(col, 0.25));
    g.addColorStop(0.62, col);
    g.addColorStop(1, shade(col, -0.45));
    c.beginPath();
    c.moveTo(x - R, top);
    c.lineTo(x - R, bottom);
    c.ellipse(x, bottom, R, ry, 0, Math.PI, 0, true);
    c.lineTo(x + R, top);
    c.closePath();
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = alpha(shade(col, -0.5), 0.7);
    c.lineWidth = 1;
    c.stroke();
    const gt = c.createLinearGradient(0, top - ry, 0, top + ry);
    gt.addColorStop(0, shade(col, 0.6));
    gt.addColorStop(1, shade(col, 0.22));
    c.beginPath(); c.ellipse(x, top, R, ry, 0, 0, Math.PI * 2);
    c.fillStyle = gt; c.fill();
    c.strokeStyle = alpha(shade(col, 0.75), 0.8); c.lineWidth = 1; c.stroke();
    // 頂面的四個箭頭：左右兩個朝內、上下兩個朝外
    c.save();
    c.translate(x, top);
    c.scale(1, ry / R);
    c.strokeStyle = 'rgba(255,255,255,0.92)';
    c.fillStyle = 'rgba(255,255,255,0.92)';
    c.lineWidth = Math.max(1.3, R * 0.11);
    c.lineCap = 'round';
    const a = R * 0.72, b = R * 0.2, hd = R * 0.2;
    const arr = function (x0, y0, x1, y1) {
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
      const ang = Math.atan2(y1 - y0, x1 - x0);
      c.beginPath();
      c.moveTo(x1 + Math.cos(ang) * hd * 0.6, y1 + Math.sin(ang) * hd * 0.6);
      c.lineTo(x1 + Math.cos(ang + 2.5) * hd, y1 + Math.sin(ang + 2.5) * hd);
      c.lineTo(x1 + Math.cos(ang - 2.5) * hd, y1 + Math.sin(ang - 2.5) * hd);
      c.closePath(); c.fill();
    };
    arr(-a, 0, -b, 0); arr(a, 0, b, 0);
    arr(0, -b, 0, -a); arr(0, b, 0, a);
    c.restore();
    // 側面的指示燈
    c.fillStyle = alpha(C['pr-ack'], 0.95);
    c.beginPath(); c.arc(x - R * 0.45, y + h * 0.18, Math.max(1.4, R * 0.08), 0, Math.PI * 2); c.fill();
    c.fillStyle = alpha('#ffffff', 0.55);
    c.beginPath(); c.arc(x - R * 0.2, y + h * 0.18, Math.max(1.2, R * 0.065), 0, Math.PI * 2); c.fill();
  }
  /** 主機：電腦畫成螢幕，伺服器畫成機櫃 */
  function drawHost(c, n, x, y) {
    const R = G.R, col = C['pr-host'];
    const recent = state.fx.some(function (f) { return f.node === n.i && performance.now() - f.t0 < 300; });
    if (n.id === 'PC') {
      const sw = R * 2.4, sh = R * 1.7;
      D.contactShadow(c, x, y + sh * 0.5 + R * 0.55, R * 0.8, 0);
      // 腳架
      c.fillStyle = shade(col, -0.15);
      c.beginPath(); c.moveTo(x - R * 0.18, y + sh * 0.42); c.lineTo(x + R * 0.18, y + sh * 0.42); c.lineTo(x + R * 0.3, y + sh * 0.5 + R * 0.42); c.lineTo(x - R * 0.3, y + sh * 0.5 + R * 0.42); c.closePath(); c.fill();
      D.block(c, x - R * 0.62, y + sh * 0.5 + R * 0.38, R * 1.24, R * 0.2, shade(col, -0.05), { r: 2, shadow: false });
      D.block(c, x - sw / 2, y - sh / 2 - R * 0.1, sw, sh, col, { r: 5 });
      const scr = c.createLinearGradient(0, y - sh / 2, 0, y + sh / 2);
      scr.addColorStop(0, shade(C['pr-path'], D.dark ? -0.35 : 0.55));
      scr.addColorStop(1, shade(C['pr-path'], D.dark ? -0.6 : 0.2));
      D.roundRect(c, x - sw / 2 + 3, y - sh / 2 - R * 0.1 + 3, sw - 6, sh - 8, 3);
      c.fillStyle = scr; c.fill();
      c.fillStyle = 'rgba(255,255,255,0.35)';
      c.beginPath(); c.moveTo(x - sw / 2 + 4, y - sh / 2 - R * 0.1 + 4); c.lineTo(x - sw * 0.05, y - sh / 2 - R * 0.1 + 4); c.lineTo(x - sw * 0.3, y + sh * 0.25 - R * 0.1); c.lineTo(x - sw / 2 + 4, y + sh * 0.25 - R * 0.1); c.closePath(); c.fill();
      // 螢幕上的游標文字
      c.fillStyle = alpha(D.dark ? '#ffffff' : C.text, 0.75);
      c.fillRect(x - sw * 0.3, y - R * 0.18, sw * 0.38, 1.6);
      c.fillRect(x - sw * 0.3, y + R * 0.08, sw * 0.24, 1.6);
    } else {
      const bw = R * 1.6, bh = R * 2.6;
      D.contactShadow(c, x, y + bh / 2, bw * 0.6, 0);
      D.block(c, x - bw / 2, y - bh / 2, bw, bh, col, { r: 4 });
      for (let k = 0; k < 4; k++) {
        const yy = y - bh / 2 + bh * (0.15 + k * 0.21);
        D.roundRect(c, x - bw * 0.36, yy, bw * 0.72, bh * 0.12, 2);
        c.fillStyle = shade(col, D.dark ? -0.5 : -0.38); c.fill();
        c.fillStyle = k === 0 && recent ? C['pr-ack'] : alpha(C['pr-ack'], 0.75);
        c.beginPath(); c.arc(x + bw * 0.24, yy + bh * 0.06, Math.max(1.3, R * 0.075), 0, Math.PI * 2); c.fill();
      }
    }
  }

  // ---------- 封包 ----------
  function packetPos(p, t) {
    const wh = p.where; if (!wh) return null;
    const l = w.net.links[wh.link];
    const g = linkGeom(l);
    const fwd = wh.from === l.a;
    const ax = fwd ? g.a : g.b, bx = fwd ? g.b : g.a;
    const ux = fwd ? g.ux : -g.ux, uy = fwd ? g.uy : -g.uy;
    const side = fwd ? 1 : -1;
    const off = side * G.TW * 0.75;
    const nx = -g.uy * off, ny = g.ux * off;
    const r0 = nodeRad(wh.from) + 3, r1 = nodeRad(wh.to) + 3;
    const usable = Math.max(4, g.len - r0 - r1);
    return { a: ax, ux: ux, uy: uy, nx: nx, ny: ny, r0: r0, usable: usable, t: t, wh: wh };
  }
  function drawPackets(c) {
    const t = w.t;
    const queued = {};
    const P = w.job && w.job.kind === 'msg' ? w.job.P : 0;
    const PW = G.narrow ? 6.5 : 8;
    w.pkts.forEach(function (p) {
      const q = packetPos(p, t);
      if (!q) return;
      const wh = q.wh;
      const col = kindColor(p.kind);
      let s0, s1, waiting = false;
      if (t < wh.start - 1e-9) {
        const key = wh.link * 2 + (wh.from === w.net.links[wh.link].a ? 0 : 1);
        const k = queued[key] = (queued[key] || 0) + 1;
        if (k > 6) return;
        s0 = s1 = -(k - 1) * 7 - 2;   // 排隊的封包疊在出發點後面
        waiting = true;
      } else {
        const f = Math.min(1, (t - wh.start) / wh.prop);
        const tl = Math.max(0, (t - wh.start - wh.tx) / wh.prop);
        s0 = tl * q.usable; s1 = f * q.usable;
      }
      if (s1 - s0 < 7) { const m = (s0 + s1) / 2; s0 = m - 3.5; s1 = m + 3.5; }
      else if (!waiting) { s0 += 1.6; s1 -= 1.6; }   // 前後兩包之間留一點縫，看得出是不同的封包
      const x0 = q.a.x + q.ux * (q.r0 + s0) + q.nx, y0 = q.a.y + q.uy * (q.r0 + s0) + q.ny;
      const x1 = q.a.x + q.ux * (q.r0 + s1) + q.nx, y1 = q.a.y + q.uy * (q.r0 + s1) + q.ny;
      const W = waiting ? PW * 0.8 : PW;
      c.save();
      c.lineCap = 'round';
      if (waiting) c.globalAlpha = 0.7;
      c.strokeStyle = shade(col, -0.4); c.lineWidth = W + 2;
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
      c.strokeStyle = col; c.lineWidth = W;
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
      c.strokeStyle = alpha(shade(col, 0.75), 0.7); c.lineWidth = Math.max(1, W * 0.3);
      c.beginPath(); c.moveTo(x0, y0 - W * 0.18); c.lineTo(x1, y1 - W * 0.18); c.stroke();
      c.restore();
      if (p.kind === 'data' && P <= 24 && !waiting) {
        D.haloText(c, String(p.seq + 1), x1 + q.nx * 1.6, y1 + q.ny * 1.6 + 3.5, shade(col, D.dark ? 0.2 : -0.35), 'center', 'alphabetic', fnt(10, 700));
      }
    });
  }

  // ---------- 視覺回饋（不影響模擬）----------
  function addFx(f) { if (reducedMotion && f.deco) return; f.t0 = performance.now(); state.fx.push(f); if (state.fx.length > 80) state.fx.shift(); requestDraw(); }
  function drawEffects(c) {
    const now = performance.now();
    state.fx.forEach(function (f) {
      const u = (now - f.t0) / f.dur;
      if (u < 0 || u > 1) return;
      if (f.kind === 'ring') D.ripple(c, f.x, f.y, f.r || 10, u, f.color);
      else if (f.kind === 'burst') {
        c.save();
        for (let k = 0; k < 7; k++) {
          const a = k / 7 * Math.PI * 2 + f.seed;
          const r = 4 + 16 * u;
          c.fillStyle = alpha(f.color, 0.85 * (1 - u));
          c.beginPath(); c.arc(f.x + Math.cos(a) * r, f.y + Math.sin(a) * r, 2.2 * (1 - u) + 0.6, 0, Math.PI * 2); c.fill();
        }
        c.restore();
      } else if (f.kind === 'text') {
        c.save();
        c.globalAlpha = Math.min(1, 2.2 * (1 - u));
        D.pill(c, f.text, f.x, f.y - 14 - 16 * u, f.color, 'center', fnt(11, 700));
        c.restore();
      }
    });
  }

  // =====================================================================
  // 封包列（送出端、接收端、重組）
  // =====================================================================
  function stripBoxes(L, P, top) {
    const out = [];
    for (let s = 0; s < P; s++) {
      const row = Math.floor(s / L.perRow), col = s % L.perRow;
      const inRow = Math.min(L.perRow, P - row * L.perRow);
      const rowW = inRow * (L.bw + L.gap) - L.gap;
      const x0 = (cw2 - rowW) / 2;
      out.push({ x: x0 + col * (L.bw + L.gap), y: top + row * L.rowH, w: L.bw, h: L.bh });
    }
    return out;
  }
  function drawStrip() {
    const c = ctx2;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(c, cw2, ch2);
    const j = w.job;
    if (j && j.kind === 'trace') { drawTraceStrip(c, j); return; }
    const parts = stripParts();
    const P = parts.length;
    const L = stripLayout(P, cw2);
    const live = j && j.kind === 'msg';
    D.haloText(c, live ? T('電腦送出（序號）', 'Sent by the computer (sequence no.)') : T('預覽：訊息會切成這些封包', 'Preview: the message will be cut into these packets'), 12, 16, C.muted, 'left', 'alphabetic', fnt(12, 600));
    D.haloText(c, T('伺服器收到', 'Received by the server'), 12, L.top2 - 6, C.muted, 'left', 'alphabetic', fnt(12, 600));
    const top = stripBoxes(L, P, L.top1), bot = stripBoxes(L, P, L.top2);
    const showTxt = L.bw >= 30;
    for (let s = 0; s < P; s++) {
      const b = top[s];
      let fill = C['pr-panel'], stroke = alpha(C.muted, 0.5), txtCol = C.muted;
      if (live) {
        if (j.acked[s]) { fill = C['pr-ack']; stroke = shade(C['pr-ack'], -0.35); txtCol = '#ffffff'; }
        else if (j.attempts[s] > 0) { fill = C['pr-data']; stroke = shade(C['pr-data'], -0.35); txtCol = D.dark ? '#1b1300' : '#2b1a00'; }
        if (j.failed && !j.acked[s]) stroke = C['pr-cut'];
      }
      D.block(c, b.x, b.y, b.w, b.h, fill, { r: 5, shadow: !!live, stroke: stroke });
      if (s === state.selSeq) { c.save(); c.strokeStyle = C.accent; c.lineWidth = 2; D.roundRect(c, b.x - 2.5, b.y - 2.5, b.w + 5, b.h + 5, 7); c.stroke(); c.restore(); }
      c.fillStyle = txtCol;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      if (showTxt) {
        c.font = fnt(9.5, 700);
        c.fillText('#' + (s + 1), b.x + b.w / 2, b.y + 9);
        c.font = fnt(10.5, 600, MONO);
        c.fillText(clip(c, parts[s].replace(/ /g, '␣'), b.w - 6), b.x + b.w / 2, b.y + 21);
      } else {
        c.font = fnt(10.5, 700);
        c.fillText(String(s + 1), b.x + b.w / 2, b.y + b.h / 2);
      }
      if (live && j.attempts[s] > 1) {
        D.pill(c, '×' + j.attempts[s], b.x + b.w + 2, b.y + 8, C['pr-warn'], 'right', fnt(9.5, 700));
      }
      if (live && j.acked[s]) {
        c.strokeStyle = '#ffffff'; c.lineWidth = 1.8; c.lineCap = 'round';
        c.beginPath(); c.moveTo(b.x + b.w - 11, b.y + b.h - 8); c.lineTo(b.x + b.w - 8, b.y + b.h - 5); c.lineTo(b.x + b.w - 3.5, b.y + b.h - 11); c.stroke();
      }
    }
    for (let s = 0; s < P; s++) {
      const b = bot[s];
      const got = live && j.have[s];
      if (got) {
        D.block(c, b.x, b.y, b.w, b.h, C['pr-data'], { r: 5, stroke: shade(C['pr-data'], -0.35) });
        const ord = j.arrivals.indexOf(s) + 1;
        const late = ord > 0 && j.arrivals.slice(0, ord - 1).some(function (x) { return x > s; });
        c.fillStyle = D.dark ? '#1b1300' : '#2b1a00';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        if (showTxt) {
          c.font = fnt(10.5, 600, MONO);
          c.fillText(clip(c, parts[s].replace(/ /g, '␣'), b.w - 6), b.x + b.w / 2, b.y + 21);
          c.font = fnt(9.5, 700);
          c.fillText('#' + (s + 1), b.x + b.w / 2, b.y + 9);
        } else { c.font = fnt(10.5, 700); c.fillText(String(s + 1), b.x + b.w / 2, b.y + b.h / 2); }
        if (ord > 0) D.pill(c, String(ord), b.x + b.w + 2, b.y + 8, late ? C['pr-warn'] : C.muted, 'right', fnt(9, 700));
      } else {
        c.save();
        c.setLineDash([4, 3]);
        c.strokeStyle = alpha(C.muted, 0.55); c.lineWidth = 1.2;
        D.roundRect(c, b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1, 5); c.stroke();
        c.restore();
      }
      if (s === state.selSeq) { c.save(); c.strokeStyle = C.accent; c.lineWidth = 2; D.roundRect(c, b.x - 2.5, b.y - 2.5, b.w + 5, b.h + 5, 7); c.stroke(); c.restore(); }
    }
    // 重組出來的訊息
    let txt = '', rest = '';
    if (live) { txt = j.text; rest = j.msg.slice(txt.length).replace(/[^]/g, '·'); }
    else rest = parts.join('').replace(/[^]/g, '·');
    const y = L.textY;
    c.font = fnt(12, 600);
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    const lab = T('重組：', 'Reassembled: ');
    D.haloText(c, lab, 12, y, C.muted, 'left', 'alphabetic', fnt(12, 600));
    const lw = c.measureText(lab).width;
    c.font = fnt(13, 700, MONO);
    const avail = cw2 - 24 - lw;
    let a = txt, b = rest;
    while (c.measureText(a + b).width > avail && b.length) b = b.slice(0, -1);
    while (c.measureText(a + b).width > avail && a.length > 1) a = '…' + a.slice(2);
    D.haloText(c, a, 12 + lw, y, live && j.recvDone ? C['pr-ok'] : C.text, 'left', 'alphabetic', fnt(13, 700, MONO));
    const aw = c.measureText(a).width;
    D.haloText(c, b, 12 + lw + aw, y, alpha(C.muted, 0.8), 'left', 'alphabetic', fnt(13, 700, MONO));
    state.stripBoxes = { top: top, bot: bot };
  }
  function clip(c, s, maxW) {
    if (c.measureText(s).width <= maxW) return s;
    while (s.length > 1 && c.measureText(s + '…').width > maxW) s = s.slice(0, -1);
    return s + '…';
  }
  function drawTraceStrip(c, j) {
    D.haloText(c, T('追蹤路由：探測封包的 TTL 一次加 1', 'Traceroute: each probe has a TTL one larger'), 12, 18, C.muted, 'left', 'alphabetic', fnt(12, 600));
    const n = Math.max(j.k, 1);
    const bw = Math.max(34, Math.min(64, (cw2 - 24) / Math.max(4, n) - 6));
    let x = 12, y = 30;
    for (let k = 1; k <= n; k++) {
      if (x + bw > cw2 - 12) { x = 12; y += 52; }
      const line = j.lines[k - 1];
      const col = !line ? C['pr-probe'] : line.node < 0 ? C['pr-panel'] : line.kind === 'reached' ? C['pr-ack'] : C['pr-icmp'];
      D.block(c, x, y, bw, 26, col, { r: 5 });
      c.fillStyle = line && line.node < 0 ? C.muted : '#ffffff';
      c.font = fnt(10.5, 700); c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('TTL ' + k, x + bw / 2, y + 13);
      const who = !line ? '…' : line.node < 0 ? '*' : w.name(line.node) + (line.kind === 'unreach' ? ' !N' : '');
      D.haloText(c, who, x + bw / 2, y + 42, C.text, 'center', 'alphabetic', fnt(11, 700));
      x += bw + 6;
    }
    state.stripBoxes = null;
  }

  // =====================================================================
  // 時間圖：每包字數 → 送達時間
  // =====================================================================
  function drawChart() {
    const c = ctx3;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(c, cw3, ch3);
    const pts = state.chart[state.chartKey] || {};
    const ks = Object.keys(pts).map(Number).sort(function (a, b) { return a - b; });
    const L = 46, Rm = 14, Tp = 30, B = 34;
    const x0 = L, x1 = cw3 - Rm, y0 = Tp, y1 = ch3 - B;
    // 縱軸不從 0 開始（只看各點之間的差別），範圍取整齊的刻度
    let ymax = -Infinity, ymin = Infinity;
    ks.forEach(function (k) { ymax = Math.max(ymax, pts[k]); ymin = Math.min(ymin, pts[k]); });
    let step, ybot, ytop;
    if (!ks.length) { step = 10; ybot = 0; ytop = 40; }
    else {
      const span = Math.max(4, ymax - ymin);
      step = niceStep(span * 1.3 / 4);
      ybot = Math.max(0, Math.floor((ymin - span * 0.45) / step) * step);   // 最低點下方留空間放「目前最快」
      ytop = Math.ceil((ymax + span * 0.25) / step) * step;
    }
    const X = function (k) { return x0 + (k - 1) / 15 * (x1 - x0); };
    const Y = function (v) { return y1 - (v - ybot) / (ytop - ybot) * (y1 - y0); };
    c.strokeStyle = alpha(C.text, D.dark ? 0.1 : 0.08); c.lineWidth = 1;
    for (let v = ybot; v <= ytop + 1e-9; v += step) { const yy = Math.round(Y(v)) + 0.5; c.beginPath(); c.moveTo(x0, yy); c.lineTo(x1, yy); c.stroke(); D.haloText(c, fmt(v), x0 - 6, yy + 4, C.muted, 'right', 'alphabetic', fnt(11)); }
    for (let k = 1; k <= 16; k++) { if (cw3 < 420 && k % 2 === 1 && k !== 1) continue; D.haloText(c, String(k), X(k), y1 + 15, C.muted, 'center', 'alphabetic', fnt(11)); }
    c.strokeStyle = alpha(C.text, 0.35);
    c.beginPath(); c.moveTo(x0, y0 - 6); c.lineTo(x0, y1); c.lineTo(x1, y1); c.stroke();
    D.haloText(c, T('每包字數 k', 'characters per packet k'), x1, ch3 - 4, C.muted, 'right', 'alphabetic', fnt(11.5, 600));
    D.haloText(c, T('送達時間（ms）', 'arrival time (ms)'), 8, 16, C.muted, 'left', 'alphabetic', fnt(11.5, 600));
    if (!ks.length) {
      D.haloText(c, T('傳送訊息後，這裡會記下每包字數和送達時間。', 'After a message arrives, its packet size and arrival time are plotted here.'), (x0 + x1) / 2, (y0 + y1) / 2, C.muted, 'center', 'middle', fnt(12.5, 500));
      return;
    }
    if (state.chartInfo) {
      const info = state.chartInfo;
      const route = (info.algo === 'dv' ? T('距離向量', 'Distance vector') : T('連結狀態', 'Link state')) + ' · ' + info.hops + T(' 台路由器 · ', ' routers · ') + info.M + T(' 字', ' characters');
      D.haloText(c, route, x1, 16, C.muted, 'right', 'alphabetic', fnt(11.5, 600));
    }
    let best = ks[0];
    ks.forEach(function (k) { if (pts[k] < pts[best]) best = k; });
    c.save();
    c.strokeStyle = alpha(C['pr-data'], 0.65); c.lineWidth = 2; c.lineJoin = 'round';
    c.beginPath();
    ks.forEach(function (k, i) { if (i) c.lineTo(X(k), Y(pts[k])); else c.moveTo(X(k), Y(pts[k])); });
    c.stroke();
    c.restore();
    ks.forEach(function (k) { D.ball(c, X(k), Y(pts[k]), 4.5, k === best ? C['pr-ok'] : C['pr-data'], { glow: 0 }); });
    // 最快的點是最低點，標籤放在它下方，就不會蓋住其他點
    const lab = T('目前最快：k = ', 'Fastest so far: k = ') + best + T('，', ', ') + fmt(pts[best]) + ' ms';
    c.font = fnt(11, 700);
    const lw = c.measureText(lab).width + 12, by = Y(pts[best]);
    const lx = Math.min(x1 - lw / 2 - 2, Math.max(x0 + lw / 2 + 4, X(best)));
    D.pill(c, lab, lx, by + 28 <= y1 - 2 ? by + 28 : by - 9, C['pr-ok'], 'center', fnt(11, 700));
  }
  function niceStep(x) {
    const p = Math.pow(10, Math.floor(Math.log10(x)));
    const m = x / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
  }

  // =====================================================================
  // 音效（有節流；主要頻率都在 250 Hz 以上）
  // =====================================================================
  function sound() { const S = window.LabSound; return S && S.enabled() ? S : null; }
  const lastSnd = {};
  function sfx(kind, gapMs, fn) { const S = sound(); if (!S) return; const now = performance.now(); if (now - (lastSnd[kind] || -1e9) < gapMs) return; lastSnd[kind] = now; fn(S); }
  const SCALE = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23, 24];
  function sndDeliver(n, ooo) {
    sfx('deliver', 45, function (S) {
      if (ooo) S.tone({ freq: 466, dur: 0.09, type: 'triangle', gain: 0.12 });
      else S.tone({ freq: 392 * Math.pow(2, SCALE[Math.min(SCALE.length - 1, Math.max(0, n - 1))] / 12), dur: 0.11, type: 'sine', gain: 0.16 });
    });
  }
  function sndLost() { sfx('lost', 90, function (S) { S.noise({ dur: 0.07, gain: 0.2, filter: 1500, q: 1 }); S.tone({ freq: 300, dur: 0.12, type: 'triangle', gain: 0.1 }); }); }
  function sndRetx() { sfx('retx', 120, function (S) { S.tone({ freq: 620, dur: 0.05, type: 'square', gain: 0.05 }); S.tone({ freq: 465, dur: 0.06, type: 'square', gain: 0.05, delay: 0.06 }); }); }
  function sndTrace(star) { sfx('trace', 60, function (S) { S.tone({ freq: star ? 330 : 1046, dur: star ? 0.12 : 0.07, type: star ? 'triangle' : 'sine', gain: 0.13 }); }); }
  function sndDone() { sfx('done', 300, function (S) { S.sweep({ from: 520, to: 1040, dur: 0.3, type: 'triangle', gain: 0.12 }); }); }
  function sndFail() { sfx('fail', 300, function (S) { S.sweep({ from: 700, to: 280, dur: 0.4, type: 'sawtooth', gain: 0.08 }); }); }
  function sndCut(up) { sfx('cut', 60, function (S) { if (up) S.tone({ freq: 880, dur: 0.06, type: 'sine', gain: 0.12 }); else S.noise({ dur: 0.05, gain: 0.25, filter: 2600, q: 2 }); }); }
  function sndRound() { sfx('round', 80, function (S) { S.tone({ freq: 700, dur: 0.04, type: 'triangle', gain: 0.07 }); }); }
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

  // =====================================================================
  // 模擬事件 → 畫面、音效、任務
  // =====================================================================
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  let sayTimer = 0;
  function say(msg) { clearTimeout(sayTimer); sayTimer = setTimeout(function () { $('status').textContent = msg || ''; }, 20); }
  w.on(function (type, d) {
    if (MISSION_EVENTS[type]) emit(type, d);
    if (type === 'fx') onFx(d);
    else if (type === 'delivered') onDelivered(d);
    else if (type === 'finished') onFinished(d);
    else if (type === 'failed') onFailed(d);
    else if (type === 'dropped') onDropped(d);
    else if (type === 'trace') onTrace(d);
    else if (type === 'dv') onDv(d);
  });
  function lostPoint(f) {
    const wh = f.where;
    if (!wh) return null;
    const p = { where: wh };
    const q = packetPos(p, f.t);
    const fr = Math.min(1, Math.max(0, (f.t - wh.start) / wh.prop)), tl = Math.max(0, (f.t - wh.start - wh.tx) / wh.prop);
    const s = Math.max(0, (fr + tl) / 2) * q.usable;
    return { x: q.a.x + q.ux * (q.r0 + s) + q.nx, y: q.a.y + q.uy * (q.r0 + s) + q.ny };
  }
  function onFx(f) {
    if (f.kind === 'lost') {
      const pt = lostPoint(f);
      if (pt) {
        addFx({ kind: 'burst', x: pt.x, y: pt.y, dur: 600, color: kindColor(f.p.kind), seed: Math.random() * 6, deco: true });
        if (f.p.kind === 'data') addFx({ kind: 'text', x: pt.x, y: pt.y, dur: 1100, color: C['pr-cut'], text: f.reason === 'cut' ? T('斷線遺失', 'lost: cut') : T('遺失', 'lost') });
      }
      if (f.p.kind === 'data' || f.p.kind === 'ack') sndLost();
    } else if (f.kind === 'drop') {
      const p = pos(f.node);
      if (f.p.kind === 'data' || f.p.kind === 'probe') {
        addFx({ kind: 'ring', x: p.x, y: p.y, r: G.R, dur: 500, color: C['pr-cut'], deco: true });
        if (f.p.kind === 'data') addFx({ kind: 'text', x: p.x, y: p.y - G.R, dur: 1100, color: C['pr-cut'], text: f.reason === 'ttl' ? 'TTL = 0' : T('沒有路', 'no route') });
      }
      if (f.p.kind === 'data') sndLost();
    } else if (f.kind === 'deliver') {
      const p = pos(w.net.sv);
      addFx({ kind: 'ring', x: p.x, y: p.y, r: G.R, dur: 450, color: C['pr-data'], node: w.net.sv, deco: true });
      sndDeliver(w.job ? w.job.nextSeq : 1, f.ooo);
    } else if (f.kind === 'ack') {
      const p = pos(w.net.pc);
      addFx({ kind: 'ring', x: p.x, y: p.y, r: G.R * 0.9, dur: 380, color: C['pr-ack'], node: w.net.pc, deco: true });
    } else if (f.kind === 'retx') {
      sndRetx();
      say(T('第 ' + (f.seq + 1) + ' 包逾時沒有確認，重送。', 'No ACK for packet ' + (f.seq + 1) + ' before the timeout: resending.'));
    } else if (f.kind === 'done') {
      sndDone();
    } else if (f.kind === 'failed') {
      sndFail();
    } else if (f.kind === 'traceLine') {
      const ln = f.line;
      state.trace.push(ln);
      renderTrace();
      if (ln.node >= 0) { const p = pos(ln.node); addFx({ kind: 'ring', x: p.x, y: p.y, r: G.R, dur: 500, color: ln.kind === 'reached' ? C['pr-ack'] : C['pr-icmp'], deco: true }); }
      sndTrace(ln.node < 0);
    } else if (f.kind === 'hop') {
      if (f.p.kind === 'data' && f.p.looped && !reducedMotion) { const p = pos(f.node); addFx({ kind: 'ring', x: p.x, y: p.y, r: G.R * 0.8, dur: 350, color: C['pr-loop'], deco: true }); }
    }
    requestDraw();
  }
  function setResult(o) {
    $('rT').textContent = o.T || '—';
    $('rTh').textContent = o.Th || '—';
    $('rR').textContent = o.R == null ? '—' : String(o.R);
    $('rLost').textContent = o.Lost || '—';
    $('rO').textContent = o.O == null ? '—' : String(o.O);
  }
  function lostText(d) {
    const parts = [];
    if (d.lost.cut) parts.push(T('斷線 ', 'cut ') + d.lost.cut);
    if (d.lost.ttl) parts.push('TTL ' + d.lost.ttl);
    if (d.lost.loss) parts.push(T('隨機 ', 'random ') + d.lost.loss);
    if (d.lost.noroute) parts.push(T('無路 ', 'no route ') + d.lost.noroute);
    return parts.length ? d.lostData + T('（', ' (') + parts.join(T('、', ', ')) + T('）', ')') : '0';
  }
  function theoryOf(d) {
    if (d.paths !== 1 || d.topoChanged || d.lostAll || d.retx) return null;
    const ids = d.path.split('>'), net = w.net, props = [];
    for (let i = 1; i < ids.length; i++) { const l = RC.linkBetween(net, net.idx[ids[i - 1]], net.idx[ids[i]]); if (!l) return null; props.push(l.cost); }
    return RC.theoryTime(props, d.M, d.k);
  }
  function onDelivered(d) {
    state.lastSum = d;
    const th = theoryOf(d);
    setResult({ T: fmt(d.time) + ' ms', Th: th == null ? '—' : fmt(th) + ' ms', R: d.retx, Lost: lostText(d), O: d.ooo });
    if (th != null && d.loss === 0) {
      const key = d.topo + '|' + d.algo + '|' + d.msg + '|' + d.path;
      const pts = state.chart[key] = state.chart[key] || {};
      pts[d.k] = d.time;
      state.chartKey = key;
      state.chartInfo = { algo: d.algo, hops: d.hops, M: d.M };
    }
    say(T('伺服器收齊了：整封訊息在 ' + fmt(d.time) + ' ms 送達' + (d.retx ? '，重送 ' + d.retx + ' 次' : '') + (d.ooo ? '，有 ' + d.ooo + ' 包不照順序到達' : '') + '。',
      'The server has the whole message: it arrived after ' + fmt(d.time) + ' ms' + (d.retx ? ', with ' + d.retx + ' resends' : '') + (d.ooo ? ', ' + d.ooo + ' packets out of order' : '') + '.'));
    requestDraw();
  }
  function onFinished(d) {
    $('rR').textContent = String(d.retx);
    $('rLost').textContent = lostText(d);
  }
  function onFailed(d) {
    setResult({ T: T('送不到（放棄）', 'not delivered (gave up)'), R: w.job ? w.job.retx : null, Lost: w.job ? String(w.job.lostData) : '—', O: w.job ? w.job.ooo : null });
    say(T('同一包重送 ' + RC.MAX_RETX + ' 次還是沒有確認，電腦放棄了。伺服器只依序收到「' + d.text + '」。' + (d.partition ? '電腦和伺服器之間已經沒有路。' : ''),
      'The same packet was resent ' + RC.MAX_RETX + ' times without an ACK, so the computer gave up. The server only received “' + d.text + '” in order.' + (d.partition ? ' There is no route left between the computer and the server.' : '')));
  }
  function onDropped(d) {
    if (state.firstDrop) return;
    state.firstDrop = true;
    if (d.reason === 'ttl') say(T('第 ' + (d.seq + 1) + ' 包的 TTL 在 ' + d.at + ' 用完，被丟掉了' + (d.looped ? '（它在迴圈裡繞圈）' : '') + '。', 'Packet ' + (d.seq + 1) + ' ran out of TTL at ' + d.at + ' and was dropped' + (d.looped ? ' (it was going round a loop)' : '') + '.'));
    else if (d.reason === 'noroute') say(T('第 ' + (d.seq + 1) + ' 包' + (d.at ? '在 ' + d.at : '') + '找不到路，被丟掉了。', 'Packet ' + (d.seq + 1) + ' found no route' + (d.at ? ' at ' + d.at : '') + ' and was dropped.'));
  }
  function onTrace(d) {
    say(d.reached ? T('追蹤路由到達伺服器，一共 ' + d.lines + ' 站。', 'Traceroute reached the server in ' + d.lines + ' hops.')
      : T('追蹤路由沒有到達伺服器。', 'Traceroute did not reach the server.'));
    renderTrace();
  }
  function onDv(d) {
    renderTable();
    renderDvInfo();
    if (d.manual) sndRound();
    requestDraw();
  }

  // =====================================================================
  // 面板：讀數、路由表、連線、追蹤路由
  // =====================================================================
  const elMsg = $('msg'), elK = $('k'), elTtl = $('ttl'), elLoss = $('loss'), elSpeed = $('speed'), elCost = $('cost');
  function updateMsgReadout() {
    const msg = RC.cleanMsg(elMsg.value), k = Math.round(val(elK));
    const M = msg.length, P = M ? Math.ceil(M / k) : 0;
    $('ko').textContent = String(k);
    $('ttlo').textContent = String(Math.round(val(elTtl)));
    $('losso').textContent = String(Math.round(val(elLoss)));
    $('rM').textContent = String(M);
    $('rP').textContent = String(P);
    $('rL').textContent = M ? (RC.HEADER + Math.min(k, M)) + T(' 位元組', ' bytes') : '—';
    $('rH').textContent = M ? Math.round(RC.HEADER * P / (RC.HEADER * P + M) * 1000) / 10 + '%' : '—';
  }
  function renderDvInfo() {
    const el = $('dvInfo');
    if (w.algo !== 'dv') { el.textContent = T('連線一改變，每台路由器立刻用整張地圖重算。', 'When a link changes, every router recomputes at once from the whole map.'); return; }
    const r = w.dv.round;
    el.textContent = T('已交換 ' + r + ' 輪：' + (w.dv.converged ? '已收斂，路由表不再改變。' : '路由表還在變。'), r + ' exchange' + (r === 1 ? '' : 's') + ': ' + (w.dv.converged ? 'converged, the tables no longer change.' : 'the tables are still changing.'));
  }
  function renderTable() {
    const r = state.router, net = w.net, tab = $('rtab');
    const dests = [net.sv, net.pc].concat(net.routers.filter(function (x) { return x !== r; }));
    const key = net.id + '|' + r + '|' + w.algo;
    const old = state.tableKey === key ? state.tableOld : null;
    const rows = dests.map(function (d) {
      const nh = w.nextHop(r, d);
      let cost, inf = false;
      if (w.algo === 'dv' && w.dv) { const m = w.dv.metric[r][d]; inf = m >= RC.INF; cost = inf ? '∞ (16)' : m + T(' 跳', m === 1 ? ' hop' : ' hops'); }
      else { const dd = w.ls.dist[r][d]; inf = dd === Infinity; cost = inf ? '∞' : dd + ' ms'; }
      return { d: d, nh: nh >= 0 && !inf ? (nh === d ? T('直接送達', 'direct') : w.name(nh)) : '—', cost: cost, inf: inf };
    });
    let html = '<thead><tr><th>' + T('目的地', 'Destination') + '</th><th>' + T('下一站', 'Next hop') + '</th><th>' + T('成本', 'Cost') + '</th></tr></thead><tbody>';
    rows.forEach(function (row, i) {
      const o = old && old[i];
      const c1 = o && o.nh !== row.nh ? ' class="chg"' : '';
      const c2 = (o && o.cost !== row.cost ? 'chg ' : '') + (row.inf ? 'inf' : '');
      html += '<tr' + (row.d === net.sv ? ' class="sv"' : '') + '><td>' + nodeName(row.d) + '</td><td' + c1 + '>' + row.nh + '</td><td' + (c2 ? ' class="' + c2.trim() + '"' : '') + '>' + row.cost + '</td></tr>';
    });
    tab.innerHTML = html + '</tbody>';
    state.tableOld = rows; state.tableKey = key;
    // 改變的格子亮一下就好
    clearTimeout(state.chgTimer);
    if (tab.querySelector('.chg')) state.chgTimer = setTimeout(function () { tab.querySelectorAll('.chg').forEach(function (td) { td.classList.remove('chg'); }); }, 1200);
  }
  function linkLabel(l) {
    return w.net.nodes[l.a].id + ' – ' + w.net.nodes[l.b].id + T('（', ' (') + l.cost + ' ms' + (l.up ? '' : T('，已切斷', ', cut')) + T('）', ')');
  }
  function buildSelects() {
    const net = w.net;
    $('link').innerHTML = net.links.map(function (l) { return '<option value="' + l.i + '">' + linkLabel(l) + '</option>'; }).join('');
    $('router').innerHTML = net.routers.map(function (r) { return '<option value="' + r + '">' + net.nodes[r].id + '</option>'; }).join('');
    $('link').value = String(state.link);
    $('router').value = String(state.router);
  }
  function syncLinkUI() {
    const l = w.net.links[state.link];
    const opts = $('link').options;
    w.net.links.forEach(function (x, i) { if (opts[i]) opts[i].textContent = linkLabel(x); });
    $('link').value = String(state.link);
    if (window.LabNum) window.LabNum.set(elCost, l.cost); else elCost.value = l.cost;
    $('costo').textContent = String(l.cost);
    const cb = $('cutBtn');
    cb.textContent = l.up ? T('切斷', 'Cut') : T('接回', 'Reconnect');
    cb.classList.toggle('isCut', !l.up);
  }
  function renderTrace() {
    const tab = $('ttab');
    $('traceEmpty').hidden = state.trace.length > 0;
    if (!state.trace.length) { tab.innerHTML = ''; return; }
    const seen = {};
    let html = '<thead><tr><th>TTL</th><th>' + T('回報的節點', 'Reported by') + '</th><th>' + T('往返時間', 'Round trip') + '</th></tr></thead><tbody>';
    state.trace.forEach(function (ln) {
      let who, cls = '';
      if (ln.node < 0) { who = '*'; cls = 'star'; }
      else {
        who = nodeName(ln.node) + (ln.kind === 'unreach' ? ' !N' : '');
        if (ln.kind === 'ttl') { if (seen[ln.node]) cls = 'loop'; seen[ln.node] = true; }
      }
      html += '<tr><td>' + ln.k + '</td><td' + (cls ? ' class="' + cls + '"' : '') + '>' + who + '</td><td>' + (ln.rtt >= 0 ? fmt(ln.rtt) + ' ms' : '*') + '</td></tr>';
    });
    tab.innerHTML = html + '</tbody>';
  }
  function renderHeader() {
    const el = $('hdr');
    const j = w.job;
    if (j && j.kind === 'trace') {
      el.innerHTML = '<span>' + T('探測封包', 'Probe') + '</span><span><b>' + T('來源', 'Source') + '</b> ' + nodeName(w.net.pc) + '</span><span><b>' + T('目的', 'Destination') + '</b> ' + nodeName(w.net.sv) + '</span><span><b>TTL</b> 1, 2, 3, …</span>';
      return;
    }
    const parts = stripParts();
    const s = Math.max(0, Math.min(parts.length - 1, state.selSeq < 0 ? 0 : state.selSeq));
    const ttl = j && j.kind === 'msg' ? j.ttl : Math.round(val(elTtl));
    const data = parts[s] || '';
    el.innerHTML = '<span><b>' + T('封包', 'Packet') + ' #' + (s + 1) + '</b>' + T(' 的表頭：', ' header:') + '</span>' +
      '<span><b>' + T('來源', 'Source') + '</b> ' + nodeName(w.net.pc) + '</span>' +
      '<span><b>' + T('目的', 'Destination') + '</b> ' + nodeName(w.net.sv) + '</span>' +
      '<span><b>' + T('序號', 'Sequence no.') + '</b> ' + s + '</span>' +
      '<span><b>TTL</b> ' + ttl + '</span>' +
      '<span><b>' + T('大小', 'Size') + '</b> 4 + ' + data.length + ' = ' + (4 + data.length) + T(' 位元組', ' bytes') + '</span>' +
      '<span><b>' + T('資料', 'Data') + '</b> <code>' + escapeHtml(data) + '</code></span>';
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; }); }
  function setPause(on) {
    state.paused = on;
    const b = $('pauseBtn');
    b.setAttribute('aria-pressed', String(on));
    b.textContent = on ? T('繼續', 'Resume') : T('暫停', 'Pause');
    requestDraw();
  }
  function setAlgoUI() {
    $('algoLs').setAttribute('aria-pressed', String(w.algo === 'ls'));
    $('algoDv').setAttribute('aria-pressed', String(w.algo === 'dv'));
    $('xchgBtn').disabled = w.algo !== 'dv';
    renderTable(); renderDvInfo();
  }
  function afterTopology() { syncLinkUI(); renderTable(); renderDvInfo(); requestDraw(); }

  // ---------- 按鈕 ----------
  $('sendBtn').addEventListener('click', function () {
    const msg = RC.cleanMsg(elMsg.value);
    if (!msg.length) { say(T('請先輸入訊息（英文字母、數字或符號）。', 'Type a message first (English letters, digits or symbols).')); return; }
    setPause(false);
    state.firstDrop = false;
    state.selSeq = 0;
    w.send({ msg: msg, k: Math.round(val(elK)), ttl: Math.round(val(elTtl)), loss: Math.round(val(elLoss)) / 100 });
    setResult({});
    say(T('傳送「' + msg + '」：切成 ' + w.job.P + ' 個封包。', 'Sending “' + msg + '”: cut into ' + w.job.P + ' packets.'));
    resizeStrip(); renderHeader();
    requestDraw();
  });
  $('traceBtn').addEventListener('click', function () {
    setPause(false);
    state.trace = [];
    renderTrace();
    w.trace({ loss: Math.round(val(elLoss)) / 100 });
    say(T('追蹤路由：送出 TTL = 1 的探測封包……', 'Traceroute: sending a probe with TTL = 1…'));
    resizeStrip(); renderHeader();
    requestDraw();
  });
  $('pauseBtn').addEventListener('click', function () { setPause(!state.paused); });
  $('stepBtn').addEventListener('click', function () {
    setPause(true);
    if (w.stepEvent()) say(T('網路時間 ' + w.t.toFixed(2) + ' ms', 'Network time ' + w.t.toFixed(2) + ' ms'));
    else say(T('沒有下一個事件。', 'There is no next event.'));
    requestDraw();
  });
  $('wipeBtn').addEventListener('click', function () {
    w.cancelJob(); w.job = null;
    state.chart = {}; state.chartKey = ''; state.chartInfo = null;
    state.trace = []; state.fx = []; state.selSeq = -1; state.lastSum = null;
    setResult({}); renderTrace(); resizeStrip(); renderHeader();
    say(T('已全部清除；網路、連線和滑桿都沒有改變。', 'Cleared. The network, the links and the sliders are unchanged.'));
  });
  $('algoLs').addEventListener('click', function () { w.setAlgo('ls'); setAlgoUI(); requestDraw(); });
  $('algoDv').addEventListener('click', function () {
    w.setAlgo('dv'); setAlgoUI();
    say(T('距離向量：每台路由器一開始只認識鄰居，' + (w.auto ? '每 6 毫秒和鄰居交換一次路由表。' : '按「交換一輪」和鄰居交換路由表。'), 'Distance vector: at first every router only knows its neighbours; ' + (w.auto ? 'they swap tables every 6 ms.' : 'press “Exchange once” to swap tables.')));
    requestDraw();
  });
  $('auto').addEventListener('change', function () { w.setAuto(this.checked); renderDvInfo(); requestDraw(); });
  $('split').addEventListener('change', function () { w.setSplit(this.checked); renderDvInfo(); requestDraw(); });
  $('xchgBtn').addEventListener('click', function () { w.dvExchange(true); requestDraw(); });
  $('net').addEventListener('change', function () {
    w.reset(this.value);
    state.link = 0; state.router = w.net.gw[w.net.pc].router; state.trace = []; state.fx = []; state.selSeq = -1;
    state.tableOld = null;
    buildSelects(); syncLinkUI(); setResult({}); renderTrace(); renderTable(); renderDvInfo(); resizeStrip(); renderHeader();
    say(T('換成' + this.options[this.selectedIndex].textContent + '。', 'Switched to the ' + this.options[this.selectedIndex].textContent.replace(/\s*\(.*$/, '').toLowerCase() + '.'));
  });
  $('router').addEventListener('change', function () { state.router = +this.value; renderTable(); requestDraw(); });
  $('link').addEventListener('change', function () { state.link = +this.value; syncLinkUI(); requestDraw(); });
  elCost.addEventListener('input', function () {
    const v = Math.round(val(elCost));
    $('costo').textContent = String(v);
    if (w.setCost(state.link, v)) { const opts = $('link').options; if (opts[state.link]) opts[state.link].textContent = linkLabel(w.net.links[state.link]); renderTable(); requestDraw(); }
  });
  function toggleLink(i) {
    const l = w.net.links[i];
    w.setLink(i, !l.up);
    sndCut(l.up);
    say(T(w.net.nodes[l.a].id + ' – ' + w.net.nodes[l.b].id + (l.up ? ' 接回了。' : ' 切斷了。'), w.net.nodes[l.a].id + ' – ' + w.net.nodes[l.b].id + (l.up ? ' reconnected.' : ' cut.')));
    afterTopology();
  }
  $('cutBtn').addEventListener('click', function () { toggleLink(state.link); });
  $('restoreBtn').addEventListener('click', function () {
    if (w.restoreAll()) { sndCut(true); say(T('所有連線都接回了。', 'All links reconnected.')); }
    afterTopology();
  });
  elMsg.addEventListener('input', function () { updateMsgReadout(); if (!w.job || w.job.kind !== 'msg') { resizeStrip(); renderHeader(); } });
  elK.addEventListener('input', function () { updateMsgReadout(); if (!w.job || w.job.kind !== 'msg') { resizeStrip(); renderHeader(); } });
  elTtl.addEventListener('input', function () { updateMsgReadout(); if (!w.job || w.job.kind !== 'msg') renderHeader(); });
  elLoss.addEventListener('input', updateMsgReadout);
  elSpeed.addEventListener('input', function () { state.speed = Math.max(0.25, Math.min(4, val(elSpeed))); $('speedo').textContent = fmt(state.speed); requestDraw(); });

  // ---------- 網路圖：點連線切斷／接回、點路由器看路由表 ----------
  function hit(x, y) {
    const net = w.net;
    for (let i = 0; i < net.nodes.length; i++) { const p = pos(i); if (Math.hypot(p.x - x, p.y - y) < nodeRad(i) + 7) return { node: i }; }
    let best = -1, bd = 14;
    net.links.forEach(function (l) {
      const g = linkGeom(l);
      const t = Math.max(0, Math.min(1, ((x - g.a.x) * g.ux + (y - g.a.y) * g.uy) / g.len));
      const d = Math.hypot(g.a.x + g.ux * g.len * t - x, g.a.y + g.uy * g.len * t - y);
      if (d < bd) { bd = d; best = l.i; }
    });
    return best >= 0 ? { link: best } : null;
  }
  function local(e, el) { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  let down = null;
  cv.addEventListener('pointerdown', function (e) { down = local(e, cv); });
  cv.addEventListener('pointerup', function (e) {
    if (!down) return;
    const p = local(e, cv);
    const moved = Math.hypot(p.x - down.x, p.y - down.y);
    down = null;
    if (moved > 8) return;
    const h = hit(p.x, p.y);
    if (!h) return;
    if (h.node != null) {
      if (w.net.nodes[h.node].host) { say(nodeName(h.node)); return; }
      state.router = h.node; $('router').value = String(h.node); renderTable();
      say(T(w.net.nodes[h.node].id + ' 的路由表顯示在「路由」卡片裡。', 'The routing table of ' + w.net.nodes[h.node].id + ' is shown in the Routing card.'));
      requestDraw();
    } else { state.link = h.link; toggleLink(h.link); }
  });
  cv.addEventListener('pointerleave', function () { down = null; state.hoverLink = -1; state.hoverNode = -1; cv.style.cursor = 'default'; requestDraw(); });
  cv.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'touch') return;
    const p = local(e, cv);
    const h = hit(p.x, p.y);
    const hl = h && h.link != null ? h.link : -1, hn = h && h.node != null && !w.net.nodes[h.node].host ? h.node : -1;
    if (hl !== state.hoverLink || hn !== state.hoverNode) { state.hoverLink = hl; state.hoverNode = hn; cv.style.cursor = hl >= 0 || hn >= 0 ? 'pointer' : 'default'; requestDraw(); }
  });
  cv.addEventListener('focus', function () { state.kbFocus = true; requestDraw(); });
  cv.addEventListener('blur', function () { state.kbFocus = false; requestDraw(); });
  cv.addEventListener('keydown', function (e) {
    const n = w.net.links.length;
    let used = true;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') state.link = (state.link + 1) % n;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') state.link = (state.link + n - 1) % n;
    else if (e.key === 'Enter' || e.key === ' ') { toggleLink(state.link); }
    else used = false;
    if (!used) return;
    e.preventDefault();
    if (e.key !== 'Enter' && e.key !== ' ') { syncLinkUI(); say(linkLabel(w.net.links[state.link])); }
    requestDraw();
  });
  // 封包列：點封包看表頭
  cv2.addEventListener('click', function (e) {
    const sb = state.stripBoxes; if (!sb) return;
    const p = local(e, cv2);
    const all = sb.top.concat(sb.bot);
    for (let i = 0; i < all.length; i++) {
      const b = all[i];
      if (p.x >= b.x - 2 && p.x <= b.x + b.w + 2 && p.y >= b.y - 2 && p.y <= b.y + b.h + 2) { state.selSeq = i % sb.top.length; renderHeader(); requestDraw(); return; }
    }
  });

  // ---------- 測試用介面（Playwright 腳本使用；不影響一般操作） ----------
  window.RoutingLab = {
    world: w, state: state,
    /** 直接讓網路時間前進 ms 毫秒 */
    run: function (ms) { w.advance(ms); requestDraw(); },
    /** 一直推進到沒有事件（或最多 ms 毫秒） */
    settle: function (ms) { const end = w.t + (ms || 3000); while (w.evq.length && w.nextEventTime() <= end) w.advance(Math.min(50, end - w.t)); requestDraw(); },
    link: function (a, b) { const l = RC.linkBetween(w.net, w.net.idx[a], w.net.idx[b]); return l ? l.i : -1; }
  };

  // =====================================================================
  // 啟動
  // =====================================================================
  function themeChanged() { readColors(); bgPattern = null; renderTable(); renderTrace(); renderHeader(); updateSoundButton(); requestDraw(); }
  readColors();
  state.speed = Math.max(0.25, Math.min(4, val(elSpeed)));
  $('speedo').textContent = fmt(state.speed);
  w.setAuto($('auto').checked);
  w.setSplit($('split').checked);
  buildSelects();
  syncLinkUI();
  updateMsgReadout();
  setAlgoUI();
  renderTrace();
  renderHeader();
  updateSoundButton();
  setPause(false);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { if (cv.clientWidth !== lastW || cv2.clientWidth !== cw2 || cv3.clientWidth !== cw3) { lastW = cv.clientWidth; resize(); } }).observe(stage);
  } else window.addEventListener('resize', resize);
  resize();
})();
