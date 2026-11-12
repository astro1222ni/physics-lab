/*
 * enzyme-kinetics-3d.js — 「酵素動力學」第一部分的 3D 活性曲面（three.js）
 *
 * 由 js/enzyme-kinetics.js 在使用者按「3D 活性曲面」時才載入（three.js 也是那時才以 import() 載入）；切回 2D 時整個釋放。
 * 用法：window.EK3D.create({ THREE, OrbitControls }, 容器, bridge) → { active, frame, onShow, onTheme, resetCamera, rebuild, resize, busy, dispose }
 *
 * 曲面：橫軸溫度 0–80 °C、縱深 pH 1–12，高度是「測量時間內的平均速率」（和溫度掃描同一個算法，bridge.ta() 秒），
 * 以最高點為 100%。五支試管畫成彩色小球，放在它們的（溫度, pH）上。
 */
(function () {
  'use strict';
  const TW = 16, PD = 13, HZ = 6;      // 曲面的寬、深、高（three.js 單位）
  const NTp = 81, NPp = 67;            // 格點數
  const T0 = 0, T1 = 80, P0 = 1, P1 = 12;

  function create(lib, host, BR) {
    const THREE = lib.THREE;
    const T = BR.T, D = BR.D, E = BR.E;
    let C = BR.colors();

    const wrap = document.createElement('div');
    wrap.className = 'ek3-wrap';
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('酵素活性的 3D 曲面：橫軸溫度、縱深 pH、高度是平均速率；彩色小球是五支試管（可拖曳旋轉、縮放）', '3D surface of enzyme activity: temperature across, pH in depth, average rate as height; coloured balls are the five tubes (drag to rotate, pinch or scroll to zoom)'));
    wrap.appendChild(canvas);
    const hud = document.createElement('div');
    hud.className = 'ek3-hud';
    hud.setAttribute('aria-hidden', 'true');
    hud.innerHTML = '<div class="tl"><span data-k="t"></span><span class="m" data-k="v"></span></div><div class="br"><span class="m" data-k="note"></span></div>';
    wrap.appendChild(hud);
    host.appendChild(wrap);
    const hudEl = {};
    hud.querySelectorAll('[data-k]').forEach(function (e) { hudEl[e.getAttribute('data-k')] = e; });
    const hudLast = {};
    function setHud(k, s) { if (hudLast[k] !== s) { hudLast[k] = s; hudEl[k].textContent = s; } }

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
    const camera = new THREE.PerspectiveCamera(36, 1.5, 0.1, 300);
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.rotateSpeed = 0.85;
    controls.enablePan = false;
    controls.minDistance = 10;
    controls.maxDistance = 70;
    controls.maxPolarAngle = Math.PI * 0.49;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.15));
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(-8, 16, 10);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xbfdcff, 0.5);
    rim.position.set(10, 6, -10);
    scene.add(rim);

    function col(s) { return new THREE.Color(s); }
    function disposeObject(obj) {
      obj.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); });
      });
    }
    function X(Tc) { return (Tc - T0) / (T1 - T0) * TW - TW / 2; }
    function Z(pH) { return (pH - P0) / (P1 - P0) * PD - PD / 2; }
    /** 文字貼圖 */
    function label(text, color, size) {
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
      const s = size || 0.55;
      sp.scale.set(s * w / c.height, s, 1);
      sp.renderOrder = 20;
      return sp;
    }
    // 顏色漸層：低 → 高
    const RAMP_L = ['#d5e3ec', '#8fc3d6', '#3fa99c', '#86c160', '#f0cf45', '#f08c0b'];
    const RAMP_D = ['#1e3a5f', '#2f6f8f', '#2f9e8f', '#7cc36a', '#f2d24b', '#f59e0b'];
    function ramp(f) {
      const RAMP = D.dark ? RAMP_D : RAMP_L;
      f = Math.max(0, Math.min(1, f)) * (RAMP.length - 1);
      const i = Math.min(RAMP.length - 2, Math.floor(f));
      return col(RAMP[i]).lerp(col(RAMP[i + 1]), f - i);
    }

    let world = null, builtKey = '', maxA = 1;
    function keyOf() {
      return [BR.enzyme(), Math.round(BR.ta()), D.dark, BR.tubes().map(function (t) { return t.T + ',' + t.pH; }).join(';'), BR.sel()].join('|');
    }
    function build() {
      const k = keyOf();
      if (k === builtKey && world) return;
      builtKey = k;
      if (world) { scene.remove(world); disposeObject(world); }
      world = new THREE.Group();
      scene.add(world);
      const enz = BR.enzyme(), ta = BR.ta();
      // 格點的平均速率
      const A = new Float32Array(NTp * NPp);
      maxA = 1e-9;
      for (let j = 0; j < NPp; j++) {
        const pH = P0 + (P1 - P0) * j / (NPp - 1);
        for (let i = 0; i < NTp; i++) {
          const Tc = T0 + (T1 - T0) * i / (NTp - 1);
          const a = E.assay(enz, Tc, pH, ta);
          A[j * NTp + i] = a; if (a > maxA) maxA = a;
        }
      }
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(NTp * NPp * 3), colr = new Float32Array(NTp * NPp * 3);
      for (let j = 0; j < NPp; j++) for (let i = 0; i < NTp; i++) {
        const n = j * NTp + i, f = A[n] / maxA;
        pos[3 * n] = X(T0 + (T1 - T0) * i / (NTp - 1)); pos[3 * n + 1] = f * HZ; pos[3 * n + 2] = Z(P0 + (P1 - P0) * j / (NPp - 1));
        const c = ramp(f); colr[3 * n] = c.r; colr[3 * n + 1] = c.g; colr[3 * n + 2] = c.b;
      }
      const idx = [];
      for (let j = 0; j < NPp - 1; j++) for (let i = 0; i < NTp - 1; i++) {
        const a = j * NTp + i, b = a + 1, c = a + NTp, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(colr, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const surf = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide }));
      world.add(surf);
      // 等高線般的格線（每 10 °C、每 1 pH）
      const lineMat = new THREE.LineBasicMaterial({ color: D.dark ? 0x0b1220 : 0x5b7083, transparent: true, opacity: D.dark ? 0.35 : 0.3 });
      for (let Tc = 10; Tc < T1; Tc += 10) {
        const i = Math.round((Tc - T0) / (T1 - T0) * (NTp - 1)), pts = [];
        for (let j = 0; j < NPp; j++) pts.push(new THREE.Vector3(X(Tc), A[j * NTp + i] / maxA * HZ + 0.02, Z(P0 + (P1 - P0) * j / (NPp - 1))));
        world.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
      }
      for (let pH = 2; pH < P1; pH += 1) {
        const j = Math.round((pH - P0) / (P1 - P0) * (NPp - 1)), pts = [];
        for (let i = 0; i < NTp; i++) pts.push(new THREE.Vector3(X(T0 + (T1 - T0) * i / (NTp - 1)), A[j * NTp + i] / maxA * HZ + 0.02, Z(pH)));
        world.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
      }
      // 底面與坐標軸
      const base = new THREE.Mesh(new THREE.PlaneGeometry(TW + 1, PD + 1), new THREE.MeshStandardMaterial({ color: col(D.dark ? '#1c2430' : '#e8edf2'), roughness: 0.95, transparent: true, opacity: 0.8 }));
      base.rotation.x = -Math.PI / 2; base.position.y = -0.02;
      world.add(base);
      const ax = new THREE.LineBasicMaterial({ color: col(D.c.muted) });
      const axPts = [[X(T0), 0, Z(P1) + 0.5, X(T1), 0, Z(P1) + 0.5], [X(T0) - 0.5, 0, Z(P0), X(T0) - 0.5, 0, Z(P1)], [X(T0) - 0.5, 0, Z(P1) + 0.5, X(T0) - 0.5, HZ, Z(P1) + 0.5]];
      axPts.forEach(function (q) { world.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(q[0], q[1], q[2]), new THREE.Vector3(q[3], q[4], q[5])]), ax)); });
      const tc = D.c.text;
      [0, 20, 40, 60, 80].forEach(function (Tc) { const s = label(Tc + ' °C', tc, 0.5); s.position.set(X(Tc), 0, Z(P1) + 1.3); world.add(s); });
      [2, 4, 6, 8, 10, 12].forEach(function (pH) { const s = label('pH ' + pH, tc, 0.5); s.position.set(X(T0) - 1.8, 0, Z(pH)); world.add(s); });
      const tl = label(T('溫度', 'Temperature'), D.c.muted, 0.55); tl.position.set(X(T1) + 1.6, 0, Z(P1) + 0.6); world.add(tl);
      const hl = label(T('平均速率', 'Average rate'), D.c.muted, 0.55); hl.position.set(X(T0) - 0.6, HZ + 0.7, Z(P1) + 0.5); world.add(hl);
      // 五支試管
      const tubes = BR.tubes(), sel = BR.sel();
      tubes.forEach(function (tb, i) {
        const Tc = Math.max(T0, Math.min(T1, tb.T)), pH = Math.max(P0, Math.min(P1, tb.pH));
        const h = E.assay(enz, Tc, pH, ta) / maxA * HZ;
        const r = i === sel ? 0.36 : 0.26;
        const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), new THREE.MeshStandardMaterial({ color: col(BR.seriesColor(i)), roughness: 0.3, emissive: col(BR.seriesColor(i)), emissiveIntensity: 0.25 }));
        m.position.set(X(Tc), h + r * 0.9, Z(pH));
        world.add(m);
        const stem = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(X(Tc), 0, Z(pH)), new THREE.Vector3(X(Tc), h, Z(pH))]),
          new THREE.LineDashedMaterial({ color: col(BR.seriesColor(i)), dashSize: 0.2, gapSize: 0.15 }));
        stem.computeLineDistances();
        world.add(stem);
        const s = label(String(i + 1), BR.seriesColor(i), 0.5); s.position.set(X(Tc), h + r * 2 + 0.4, Z(pH)); world.add(s);
      });
      // 最高點
      let bi = 0; for (let n = 1; n < A.length; n++) if (A[n] > A[bi]) bi = n;
      const bT = T0 + (T1 - T0) * (bi % NTp) / (NTp - 1), bP = P0 + (P1 - P0) * Math.floor(bi / NTp) / (NPp - 1);
      setHud('t', BR.E.ENZYMES[enz] ? T(BR.E.ENZYMES[enz].zh, BR.E.ENZYMES[enz].en) + T('：每點測量 ', ': ') + BR.num(ta / 60, 0) + T(' 分鐘', ' min per point') : '');
      setHud('v', T('最高點約 ', 'Peak near ') + BR.num(bT, 0) + ' °C、pH ' + BR.num(bP, 1));
      setHud('note', T('高度是測量時間內的平均速率（最高點 = 100%）', 'Height is the average rate over the measuring time (peak = 100%)'));
    }

    // ---------- 相機 ----------
    let lastAspect = 0, narrow = false;
    function sizeOf(w) { return w < 560 ? 460 : 470; }
    function resetCamera() {
      const dist = narrow ? 42 : 32;
      const el = 30 * Math.PI / 180, az = 24 * Math.PI / 180;
      controls.target.set(0.6, HZ * 0.18, 0.8);
      camera.position.set(0.6 + Math.sin(az) * Math.cos(el) * dist, HZ * 0.18 + Math.sin(el) * dist, 0.8 + Math.cos(az) * Math.cos(el) * dist);
      controls.update();
    }
    let raf = 0, moving = false;
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
      narrow = w < 560;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (Math.abs(camera.aspect - lastAspect) > 1e-3) {
        const first = !lastAspect;
        lastAspect = camera.aspect;
        if (first) resetCamera();
      }
      build();
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
      frame: function () { build(); renderNow(); },
      busy: function () { return moving; },
      onShow: function () { lastAspect = 0; resize3(); },
      resize: function () { resize3(); },
      onTheme: function () {
        C = BR.colors();
        builtKey = '';
        Object.keys(hudLast).forEach(function (k) { delete hudLast[k]; });
        build();
        requestRender();
      },
      rebuild: function () { builtKey = ''; build(); requestRender(); },
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
    void C;
    const w0 = wrap.clientWidth;
    if (w0) {
      narrow = w0 < 560;
      canvas.style.height = sizeOf(w0) + 'px';
      renderer.setSize(w0, sizeOf(w0), false);
      camera.aspect = w0 / sizeOf(w0);
      camera.updateProjectionMatrix();
      lastAspect = camera.aspect;
    }
    resetCamera();
    build();
    renderNow();
    return api;
  }
  window.EK3D = { create: create };
})();
