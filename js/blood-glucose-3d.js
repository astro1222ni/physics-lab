/*
 * blood-glucose-3d.js — 「血糖調節」第二部分的 3D 地形（three.js）
 *
 * 由 js/blood-glucose.js 在使用者按「3D 地形」時才載入（three.js 也是那時才以 import() 載入）；切回 2D 時整個釋放。
 * 用法：window.GL3D.create({ THREE, OrbitControls }, 容器, bridge) → { active, onShow, onTheme, resetCamera, rebuild, update, resize, busy, dispose }
 *
 * 曲面：橫向是 β 細胞功能（0–3 倍）、縱深是胰島素敏感度（0.1–2 倍），高度是喝 75 g 葡萄糖 2 小時後的血糖（40–400 mg/dL，超過的壓平在頂端）；
 * 數值來自頁面算好的 25 × 25 格點（每一格都是用核心跑一次完整的試驗）。顏色照判讀：正常、前期、糖尿病（也看空腹值）。
 * 兩片半透明的水平面是 2 小時的診斷門檻 140 與 200 mg/dL。地板上的曲線是目前病人的處置指數 β × 敏感度 = 常數（Kahn 1993 的雙曲線）。
 * 只在畫面改變（拖曳、換病人、換主題）時重畫，不常駐耗電。
 */
(function () {
  'use strict';
  const W = 6;          // 地板邊長（three.js 單位）
  const H = 3.2;        // 40 → 400 mg/dL 的高度
  const GMIN = 40, GMAX = 400;

  function create(lib, host, BR) {
    const THREE = lib.THREE;
    const T = BR.T, D = BR.D;
    let C = BR.colors();

    const wrap = document.createElement('div');
    wrap.className = 'gl3-wrap';
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('3D 地形：橫向是 β 細胞功能、縱深是胰島素敏感度、高度是喝 75 g 後 2 小時的血糖；綠色正常、黃色前期、紅色糖尿病；兩片半透明的面是 140 與 200 的門檻（可拖曳旋轉、縮放）',
      '3D landscape: β-cell function across, insulin sensitivity in depth and the 2-hour glucose after 75 g as height; green normal, yellow prediabetes, red diabetes; the two see-through planes are the 140 and 200 thresholds (drag to rotate, pinch or scroll to zoom)'));
    wrap.appendChild(canvas);
    const hud = document.createElement('div');
    hud.className = 'gl3-hud';
    hud.setAttribute('aria-hidden', 'true');
    hud.innerHTML = '<div class="tl"><span data-k="p"></span><span data-k="g"></span><span class="m" data-k="w"></span></div><div class="br"><span class="m" data-k="note"></span></div>';
    wrap.appendChild(hud);
    host.appendChild(wrap);
    const hudEl = {};
    hud.querySelectorAll('[data-k]').forEach(function (e) { hudEl[e.getAttribute('data-k')] = e; });
    function setHud(k, s) { if (hudEl[k].textContent !== s) hudEl[k].textContent = s; hudEl[k].style.display = s ? '' : 'none'; }

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    } catch (e) {
      wrap.remove();
      throw e;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1.5, 0.1, 200);
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.rotateSpeed = 0.85;
    controls.enablePan = false;
    controls.minDistance = 6;
    controls.maxDistance = 30;
    controls.maxPolarAngle = Math.PI * 0.49;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x556070, 1.0));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(-5, 9, 7);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xcfe3ff, 0.55);
    rim.position.set(6, 3, -8);
    scene.add(rim);

    function col(s) { return new THREE.Color(s); }
    function disposeObject(obj) {
      obj.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); });
      });
    }
    function label(text, color, hgt) {
      const c = document.createElement('canvas'), g = c.getContext('2d');
      const fs = 44;
      g.font = '600 ' + fs + 'px ' + D.FONT;
      const w = Math.ceil(g.measureText(text).width) + 16;
      c.width = w; c.height = fs + 16;
      g.font = '600 ' + fs + 'px ' + D.FONT;
      g.textBaseline = 'middle'; g.textAlign = 'center';
      g.lineWidth = 8; g.strokeStyle = D.dark ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.9)';
      g.strokeText(text, w / 2, c.height / 2);
      g.fillStyle = color; g.fillText(text, w / 2, c.height / 2);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
      const h = hgt || 0.32;
      sp.scale.set(h * w / c.height, h, 1);
      sp.renderOrder = 10;
      return sp;
    }

    // ---------- 座標 ----------
    function gr() { return BR.grid(); }
    function X(beta) { const q = gr(); return -W / 2 + W * beta / q.BMAX; }
    function Z(si) { const q = gr(); return W / 2 - W * (si - q.SMIN) / (q.SMAX - q.SMIN); }
    function Y(g) { return H * (Math.max(GMIN, Math.min(GMAX, g)) - GMIN) / (GMAX - GMIN); }
    function interp(beta, si) {
      const q = gr();
      const fi = Math.max(0, Math.min(q.NB - 1.0001, beta / q.BMAX * (q.NB - 1)));
      const fj = Math.max(0, Math.min(q.NS - 1.0001, (si - q.SMIN) / (q.SMAX - q.SMIN) * (q.NS - 1)));
      const i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j;
      if (j + 1 >= q.rows) return null;
      const L = function (a) { return (1 - u) * (1 - v) * a[j * q.NB + i] + u * (1 - v) * a[j * q.NB + i + 1] + (1 - u) * v * a[(j + 1) * q.NB + i] + u * v * a[(j + 1) * q.NB + i + 1]; };
      return { g0: L(q.g0), g2: L(q.g2) };
    }

    // ---------- 場景 ----------
    const root = new THREE.Group();
    scene.add(root);
    const fixed = new THREE.Group(), surf = new THREE.Group(), marks = new THREE.Group();
    root.add(fixed); root.add(surf); root.add(marks);
    function clear(gp) { while (gp.children.length) { const o = gp.children.pop(); disposeObject(o); } }

    function buildFixed() {
      clear(fixed);
      // 地板
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, W), new THREE.MeshStandardMaterial({ color: col(D.c.surface), roughness: 0.9, metalness: 0, transparent: true, opacity: 0.55 }));
      floor.rotation.x = -Math.PI / 2; floor.position.y = -0.005;
      fixed.add(floor);
      const lines = [];
      for (let k = 0; k <= 6; k++) {
        const x = -W / 2 + W * k / 6;
        lines.push(x, 0, -W / 2, x, 0, W / 2, -W / 2, 0, x, W / 2, 0, x);
      }
      const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
      fixed.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: col(D.c.border), transparent: true, opacity: 0.8 })));
      // 高度軸（左後角）
      const ax = [];
      const x0 = -W / 2, z0 = -W / 2;
      ax.push(x0, 0, z0, x0, Y(GMAX), z0);
      [100, 200, 300, 400].forEach(function (v) { ax.push(x0, Y(v), z0, x0 + 0.15, Y(v), z0); });
      const ag = new THREE.BufferGeometry(); ag.setAttribute('position', new THREE.Float32BufferAttribute(ax, 3));
      fixed.add(new THREE.LineSegments(ag, new THREE.LineBasicMaterial({ color: col(D.c.muted) })));
      [100, 200, 300, 400].forEach(function (v) { const l = label(String(v), D.c.muted, 0.26); l.position.set(x0 - 0.3, Y(v), z0); fixed.add(l); });
      const ly = label(T('2 小時血糖 mg/dL', '2-hour glucose mg/dL'), D.c.text, 0.3); ly.position.set(x0, Y(GMAX) + 0.35, z0); fixed.add(ly);
      // 軸名與刻度
      const lx = label(T('β 細胞功能 →', 'β-cell function →'), D.c.text, 0.32); lx.position.set(0, 0, W / 2 + 0.75); fixed.add(lx);
      [0, 1, 2, 3].forEach(function (b) { const l = label(String(b), D.c.muted, 0.26); l.position.set(X(b), 0, W / 2 + 0.32); fixed.add(l); });
      const lz = label(T('胰島素敏感度 →', 'Insulin sensitivity →'), D.c.text, 0.32); lz.position.set(W / 2 + 0.95, 0, 0); fixed.add(lz);
      [0.1, 1, 2].forEach(function (s) { const l = label(String(s), D.c.muted, 0.26); l.position.set(W / 2 + 0.32, 0, Z(s)); fixed.add(l); });
      // 門檻面 140、200
      [[140, 'gl-pre'], [200, 'gl-dm']].forEach(function (q) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(W, W), new THREE.MeshBasicMaterial({ color: col(C[q[1]]), transparent: true, opacity: D.dark ? 0.13 : 0.11, side: THREE.DoubleSide, depthWrite: false }));
        m.rotation.x = -Math.PI / 2; m.position.y = Y(q[0]); m.renderOrder = 2;
        fixed.add(m);
        const e = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(W, W)), new THREE.LineBasicMaterial({ color: col(C[q[1]]), transparent: true, opacity: 0.7 }));
        e.rotation.x = -Math.PI / 2; e.position.y = Y(q[0]);
        fixed.add(e);
        const l = label(q[0] + ' mg/dL', C[q[1]], 0.28); l.position.set(W / 2 + 0.45, Y(q[0]), -W / 2); fixed.add(l);
      });
    }

    function catColor(g0, g2) {
      const dx = BR.diagnose(g0, g2);
      return col(C[dx === 'normal' ? 'gl-ok' : dx === 'pre' ? 'gl-pre' : 'gl-dm']);
    }
    /** 曲面用的平滑顏色：判讀分數 sc（< 0 正常、0–1 前期、> 1 糖尿病，空腹與 2 小時取較嚴重者），交界處窄窄地漸變，避免鋸齒 */
    function smoothColor(g0, g2) {
      const sc = Math.max((g2 - 140) / 60, (g0 - 100) / 26);
      const ok = col(C['gl-ok']), pre = col(C['gl-pre']), dm = col(C['gl-dm']);
      const ss = function (a, b, v) { const u = Math.max(0, Math.min(1, (v - a) / (b - a))); return u * u * (3 - 2 * u); };
      const c = ok.clone().lerp(pre, ss(-0.06, 0.06, sc));
      return c.lerp(dm, ss(0.94, 1.06, sc));
    }
    let built = false;
    function buildSurface() {
      clear(surf);
      const q = gr();
      built = q.rows >= q.NS;
      if (!built) return;
      // 細分：把 25 × 25 格點雙線性內插成 97 × 97，曲面才會平滑
      const N = 97;
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(N * N * 3), colr = new Float32Array(N * N * 3);
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const beta = q.BMAX * i / (N - 1), si = q.SMIN + (q.SMAX - q.SMIN) * j / (N - 1);
        const v = interp(beta, si) || { g0: 400, g2: 400 };
        const k = (j * N + i) * 3;
        pos[k] = X(beta); pos[k + 1] = Y(v.g2); pos[k + 2] = Z(si);
        const c = smoothColor(v.g0, v.g2);
        // 越高越深一點，看得出起伏
        const sh = 1 - 0.28 * Math.min(1, Math.max(0, (v.g2 - 80) / 320));
        colr[k] = c.r * sh; colr[k + 1] = c.g * sh; colr[k + 2] = c.b * sh;
      }
      const idx = [];
      for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
        const a = j * N + i, b = a + 1, c2 = a + N, d = c2 + 1;
        idx.push(a, c2, b, b, c2, d);
      }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(colr, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.02, side: THREE.DoubleSide, transparent: true, opacity: 0.94 }));
      mesh.renderOrder = 1;
      surf.add(mesh);
      // 等距的格線（每 0.5 倍）
      const wl = [];
      const pushLine = function (pts) { for (let k = 0; k < pts.length - 1; k++) wl.push(pts[k][0], pts[k][1] + 0.01, pts[k][2], pts[k + 1][0], pts[k + 1][1] + 0.01, pts[k + 1][2]); };
      for (let b = 0.5; b < q.BMAX; b += 0.5) {
        const pts = []; for (let s = q.SMIN; s <= q.SMAX + 1e-9; s += 0.05) { const v = interp(b, s); if (v) pts.push([X(b), Y(v.g2), Z(s)]); } pushLine(pts);
      }
      for (let s = 0.5; s < q.SMAX; s += 0.5) {
        const pts = []; for (let b = 0; b <= q.BMAX + 1e-9; b += 0.05) { const v = interp(b, s); if (v) pts.push([X(b), Y(v.g2), Z(s)]); } pushLine(pts);
      }
      const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wl, 3));
      surf.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: col(D.dark ? '#ffffff' : '#1f2937'), transparent: true, opacity: D.dark ? 0.22 : 0.18 })));
    }

    function buildMarks() {
      clear(marks);
      const p = BR.patient(), q = gr();
      // 目前病人的處置指數雙曲線：地板上一條、曲面上一條
      const di = p.beta * p.si;
      if (di > 0.01) {
        const fl = [], sf = [];
        for (let b = Math.max(0.01, di / q.SMAX); b <= q.BMAX + 1e-9; b += 0.02) {
          const s = di / b; if (s < q.SMIN) break;
          fl.push(new THREE.Vector3(X(b), 0.01, Z(s)));
          if (built) { const v = interp(b, s); if (v) sf.push(new THREE.Vector3(X(b), Y(v.g2) + 0.04, Z(s))); }
        }
        if (fl.length > 1) marks.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(fl), new THREE.LineDashedMaterial({ color: col(D.c.text), dashSize: 0.12, gapSize: 0.08, transparent: true, opacity: 0.7 })).computeLineDistances());
        if (sf.length > 1) marks.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(sf), new THREE.LineBasicMaterial({ color: col(D.c.accent), transparent: true, opacity: 0.95 })));
      }
      // 做過試驗的病人
      (p.tests || []).forEach(function (t) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), new THREE.MeshStandardMaterial({ color: catColor(t.g0, t.g120), roughness: 0.4 }));
        s.position.set(X(t.beta), Y(t.g120) + 0.05, Z(t.si));
        marks.add(s);
      });
      // 目前病人：一根柱子＋一顆球
      const yTop = Y(p.g2);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, Math.max(0.01, yTop), 12), new THREE.MeshStandardMaterial({ color: col(D.c.text), transparent: true, opacity: 0.55 }));
      pole.position.set(X(p.beta), yTop / 2, Z(p.si));
      marks.add(pole);
      const ballCol = p.dx ? C[p.dx === 'normal' ? 'gl-ok' : p.dx === 'pre' ? 'gl-pre' : 'gl-dm'] : D.c.accent;
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.2, 32, 24), new THREE.MeshStandardMaterial({ color: col(ballCol), roughness: 0.3, metalness: 0.05, emissive: col(ballCol), emissiveIntensity: 0.25 }));
      ball.position.set(X(p.beta), yTop + 0.18, Z(p.si));
      ball.renderOrder = 5;
      marks.add(ball);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.22, 32), new THREE.MeshBasicMaterial({ color: col(D.c.text), transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(X(p.beta), 0.012, Z(p.si));
      marks.add(ring);
      // HUD
      const fmt = function (v, d) { return isFinite(v) ? v.toFixed(d) : '—'; };
      setHud('p', 'β ' + fmt(p.beta, 2) + T('・敏感度 ', ' · S ') + fmt(p.si, 2) + '・DI ' + fmt(di, 2));
      setHud('g', T('2 小時 ', '2 h ') + fmt(p.g2, 0) + ' mg/dL' + (p.dx ? T('・', ' · ') + T(p.dx === 'normal' ? '正常' : p.dx === 'pre' ? '前期' : '糖尿病', p.dx === 'normal' ? 'normal' : p.dx === 'pre' ? 'prediabetes' : 'diabetes') : ''));
      setHud('w', built ? '' : T('地形計算中…', 'Computing the landscape…'));
      setHud('note', T('高度＝喝 75 g 後 2 小時的血糖；虛線是同一個處置指數', 'Height = 2-hour glucose after 75 g; dashed: same disposition index'));
    }

    let raf = 0, moving = false, narrow = false, lastAspect = 0;
    function sizeOf(w) { return w < 560 ? 380 : 440; }
    function resetCamera() {
      const d = narrow ? 13.5 : 11;
      camera.position.set(d * 0.62, d * 0.55, d * 0.72);
      controls.target.set(0, 0.9, 0);
      camera.updateProjectionMatrix();
      controls.update();
    }
    function renderNow() {
      if (!api.active) return;
      moving = controls.update();
      renderer.render(scene, camera);
    }
    function requestRender() {
      if (raf || !api.active) return;
      raf = requestAnimationFrame(function () { raf = 0; renderNow(); if (moving) requestRender(); });
    }
    function resize3() {
      const w = wrap.clientWidth;
      if (!w) return;
      const h = sizeOf(w);
      if (canvas.style.height !== h + 'px') canvas.style.height = h + 'px';
      const nw = w < 560;
      if (nw !== narrow) { narrow = nw; lastAspect = 0; }
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (Math.abs(camera.aspect - lastAspect) > 1e-3) {
        const first = !lastAspect;
        lastAspect = camera.aspect;
        if (first) resetCamera();
      }
      renderNow();
    }
    const ro = window.ResizeObserver ? new ResizeObserver(function () { resize3(); }) : null;
    if (ro) ro.observe(wrap); else window.addEventListener('resize', resize3);
    controls.addEventListener('change', requestRender);
    canvas.addEventListener('webglcontextlost', function (ev) {
      ev.preventDefault();
      if (!api.active) return;
      if (BR.onContextLost) BR.onContextLost();
    });
    const api = {
      active: true,
      busy: function () { return moving; },
      onShow: function () { lastAspect = 0; resize3(); },
      resize: function () { resize3(); },
      onTheme: function () {
        C = BR.colors();
        buildFixed(); buildSurface(); buildMarks();
        requestRender();
      },
      rebuild: function () { buildSurface(); buildMarks(); requestRender(); },
      update: function () { buildMarks(); requestRender(); },
      resetCamera: function () { resetCamera(); requestRender(); },
      dispose: function () {
        api.active = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        controls.dispose();
        disposeObject(scene);
        renderer.dispose();
        renderer.forceContextLoss();
        wrap.remove();
      }
    };
    const w0 = wrap.clientWidth;
    if (w0) {
      narrow = w0 < 560;
      canvas.style.height = sizeOf(w0) + 'px';
      renderer.setSize(w0, sizeOf(w0), false);
      camera.aspect = w0 / sizeOf(w0);
      camera.updateProjectionMatrix();
      lastAspect = camera.aspect;
    }
    buildFixed(); buildSurface(); buildMarks();
    resetCamera();
    renderNow();
    return api;
  }
  window.GL3D = { create: create };
})();
