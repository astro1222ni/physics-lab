/*
 * gene-expression-3d.js — 「DNA 複製、轉錄與轉譯」第一部分的 3D 雙股螺旋（three.js）
 *
 * 由 js/gene-expression.js 在使用者按「3D 雙股螺旋」時才載入（three.js 也是那時才以 import() 載入）；切回 2D 時整個釋放。
 * 用法：window.GE3D.create({ THREE, OrbitControls }, 容器, bridge) → { active, frame, onShow, onTheme, resetCamera, rebuild, resize, busy, dispose }
 *
 * B 型 DNA（Dickerson 等 1982）：每圈 10.5 對鹼基（每對轉 34.3°）、每對升高 0.34 nm、磷酸骨架半徑約 1 nm。
 * 兩股的醣苷鍵不在直徑兩端，而是相隔約 140°（小溝那一側），所以螺旋上有一條寬的大溝、一條窄的小溝。
 * 這裡 1 單位 = 1 nm；畫的是以選取的鹼基為中心、最多 31 對的一段（約三圈）。螺旋軸沿 x 軸，右手螺旋。
 * 鹼基畫成扁平的板子：嘌呤（A、G）占鹼基對長度的 58%，嘧啶（T、C）42%。不畫個別原子（示意）。
 */
(function () {
  'use strict';
  const RISE = 0.34, TWIST = 2 * Math.PI / 10.5, RP = 1.0, DELTA = 140 * Math.PI / 180;

  function create(lib, host, BR) {
    const THREE = lib.THREE;
    const T = BR.T, D = BR.D, G = BR.G;
    let C = BR.colors();

    const wrap = document.createElement('div');
    wrap.className = 'ge3-wrap';
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('DNA 雙股螺旋的 3D 模型：以選取的鹼基為中心，兩條骨架之間是彩色的鹼基對，看得到大溝和小溝（可拖曳旋轉、縮放）', '3D model of the DNA double helix, centred on the selected base: coloured base pairs between the two backbones, with the major and minor grooves (drag to rotate, pinch or scroll to zoom)'));
    wrap.appendChild(canvas);
    const hud = document.createElement('div');
    hud.className = 'ge3-hud';
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
    const camera = new THREE.PerspectiveCamera(34, 1.5, 0.1, 200);
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.rotateSpeed = 0.85;
    controls.enablePan = false;
    controls.minDistance = 5;
    controls.maxDistance = 40;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(-6, 10, 12);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xbfdcff, 0.55);
    rim.position.set(8, -4, -10);
    scene.add(rim);

    function col(s) { return new THREE.Color(s); }
    function disposeObject(obj) {
      obj.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); });
      });
    }
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
      const s = size || 0.4;
      sp.scale.set(s * w / c.height, s, 1);
      sp.renderOrder = 20;
      return sp;
    }
    function baseCol(b) { return C['ge-' + b.toLowerCase()] || '#888888'; }
    /** 第 k 對（以 0 為中心）兩股骨架的位置 */
    function P(k, strand) {
      const th = k * TWIST + (strand ? DELTA : 0);
      return new THREE.Vector3(k * RISE, RP * Math.cos(th), RP * Math.sin(th));
    }

    let world = null, builtKey = '', span = [0, 0];
    function keyOf() { return [BR.seq(), BR.sel(), D.dark, narrow].join('|'); }
    function build() {
      const k = keyOf();
      if (k === builtKey && world) return;
      builtKey = k;
      if (world) { scene.remove(world); disposeObject(world); }
      world = new THREE.Group();
      scene.add(world);
      const seq = BR.seq(), sel = BR.sel(), n = seq.length;
      const N = Math.min(n, narrow ? 17 : 31);
      let a = Math.max(0, Math.min(n - N, sel - Math.floor(N / 2)));
      const b = a + N;
      span = [a, b];
      const mid = sel;
      const xk = function (i) { return i - mid; };
      // 骨架：兩條平滑的管子
      const strandCols = [D.dark ? '#cbd5e1' : '#64748b', D.dark ? '#94a3b8' : '#475569'];
      [0, 1].forEach(function (s) {
        const pts = [];
        for (let i = a - 0.5; i <= b - 0.5 + 1e-9; i += 0.25) pts.push(P(xk(i), s));
        const curve = new THREE.CatmullRomCurve3(pts);
        const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, pts.length * 3, 0.17, 12, false),
          new THREE.MeshStandardMaterial({ color: col(strandCols[s]), roughness: 0.42, metalness: 0.15 }));
        world.add(tube);
        // 磷酸（每個核苷酸一顆）
        const pg = new THREE.SphereGeometry(0.2, 14, 10);
        const pm = new THREE.MeshStandardMaterial({ color: col(D.dark ? '#fbbf24' : '#d97706'), roughness: 0.35 });
        for (let i = a; i < b; i++) { const m = new THREE.Mesh(pg, pm); m.position.copy(P(xk(i) - 0.5, s)); world.add(m); }
      });
      // 鹼基對
      const xAxis = new THREE.Vector3(1, 0, 0);
      for (let i = a; i < b; i++) {
        const p1 = P(xk(i), 0), p2 = P(xk(i), 1);
        const u = p2.clone().sub(p1), len = u.length(); u.normalize();
        const w = new THREE.Vector3().crossVectors(u, xAxis).normalize();
        const v = new THREE.Vector3().crossVectors(w, u).normalize();
        const b1 = seq[i], b2 = G.complement(b1);
        const pur = function (q) { return q === 'A' || q === 'G'; };
        const f1 = pur(b1) ? 0.58 : 0.42;
        const isSel = i === sel;
        [[b1, 0, f1], [b2, f1, 1]].forEach(function (q) {
          const L = (q[2] - q[1]) * len - 0.06;
          const geo = new THREE.BoxGeometry(L, 0.13, isSel ? 0.62 : 0.5);
          const mat = new THREE.MeshStandardMaterial({ color: col(baseCol(q[0])), roughness: 0.5, emissive: col(baseCol(q[0])), emissiveIntensity: isSel ? 0.55 : 0.12 });
          const m = new THREE.Mesh(geo, mat);
          const c = p1.clone().add(u.clone().multiplyScalar(((q[1] + q[2]) / 2) * len));
          m.position.copy(c);
          m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(u, v, w));
          world.add(m);
        });
        if (isSel) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.035, 8, 48), new THREE.MeshBasicMaterial({ color: col(C['ge-sel']), transparent: true, opacity: 0.85 }));
          ring.rotation.y = Math.PI / 2; ring.position.set(xk(i) * RISE, 0, 0);
          world.add(ring);
          const s1 = label(b1 + '–' + b2, C['ge-sel'], 0.42); s1.position.set(xk(i) * RISE, 1.85, 0); world.add(s1);
        }
      }
      // 兩股的 5'、3' 端
      const tc = D.c.text;
      const ends = [[0, a - 0.5, "5'"], [0, b - 0.5, "3'"], [1, a - 0.5, "3'"], [1, b - 0.5, "5'"]];
      ends.forEach(function (q) { const p = P(xk(q[1]), q[0]); const s = label(q[2], tc, 0.38); s.position.set(p.x + (q[1] < mid ? -0.35 : 0.35), p.y * 1.3, p.z * 1.3); world.add(s); });
      // 大溝、小溝：在中間附近找溝的中心正對相機（+z）的位置
      function grooveAt(off, name) {
        let best = null, bd = 9;
        for (let i = a + 2; i < b - 2; i++) {
          const th = xk(i) * TWIST + off;
          const d = Math.abs(Math.atan2(Math.sin(th - Math.PI / 2), Math.cos(th - Math.PI / 2)));
          if (d < bd) { bd = d; best = i; }
        }
        if (best == null) return;
        const th = xk(best) * TWIST + off;
        const s = label(name, D.c.accent, 0.4);
        s.position.set(xk(best) * RISE, 1.75 * Math.cos(th), 1.75 * Math.sin(th));
        world.add(s);
      }
      grooveAt(DELTA / 2, T('小溝', 'Minor groove'));
      grooveAt(DELTA + (2 * Math.PI - DELTA) / 2, T('大溝', 'Major groove'));
      // 一圈的尺規
      if (N >= 12) {
        const x0 = (a - mid) * RISE, x1 = x0 + 10.5 * RISE, y = -1.75;
        const lm = new THREE.LineBasicMaterial({ color: col(D.c.muted) });
        world.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x0, y, 0), new THREE.Vector3(x1, y, 0)]), lm));
        [x0, x1].forEach(function (x) { world.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, y - 0.12, 0), new THREE.Vector3(x, y + 0.12, 0)]), lm)); });
        const s = label(T('一圈 10.5 對 ≈ 3.6 nm・直徑約 2 nm', 'One turn: 10.5 bp ≈ 3.6 nm · about 2 nm across'), D.c.muted, 0.34); s.position.set((x0 + x1) / 2 + 0.6, y - 0.38, 0); world.add(s);
      }
      setHud('t', T('第 ' + (a + 1) + '–' + b + ' 對鹼基（' + N + ' 對）', 'Base pairs ' + (a + 1) + '–' + b + ' (' + N + ')'));
      setHud('v', T('選取：第 ' + (sel + 1) + ' 對 ', 'Selected: pair ' + (sel + 1) + ' ') + seq[sel] + '–' + G.complement(seq[sel]));
      setHud('note', T('B 型 DNA：每圈 10.5 對、每對 0.34 nm（示意，不畫原子）', 'B-DNA: 10.5 bp per turn, 0.34 nm per bp (schematic, atoms not drawn)'));
    }

    // ---------- 相機 ----------
    let lastAspect = 0, narrow = false;
    function sizeOf(w) { return w < 560 ? 420 : 460; }
    function resetCamera() {
      const dist = narrow ? 16.5 : 13.5;
      const el = 16 * Math.PI / 180, az = 8 * Math.PI / 180;
      controls.target.set(0, 0, 0);
      camera.position.set(Math.sin(az) * Math.cos(el) * dist, Math.sin(el) * dist, Math.cos(az) * Math.cos(el) * dist);
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
      const nw = w < 560;
      if (nw !== narrow) { narrow = nw; builtKey = ''; }
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
      span: function () { return span.slice(); },
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
    resetCamera();
    build();
    renderNow();
    return api;
  }
  window.GE3D = { create: create };
})();
