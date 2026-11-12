/*
 * linear-transform-3d.js — 「矩陣與線性變換」空間模式的 3D 立體（three.js）
 *
 * 由 js/linear-transform.js 在使用者按「3D 立體」時才載入（three.js 也是那時才以 import() 載入）；切回 2D 或平面模式時整個釋放。
 * 用法：window.LinearTransform3D.create({ THREE, OrbitControls }, 容器, bridge) → { active, frame, rebuild, onTheme, resetCamera, dispose }
 *
 * 場景座標就是數學座標：1 個單位 = 1，z 軸朝上（camera.up = (0, 0, 1)），右手系。
 * 矩陣從 bridge.matrix() 取得（已含漸變 t），3D 只負責畫：原來的單位立方體（虛線）、變形後的平行六面體、三個行向量。
 */
(function () {
  'use strict';
  const FONT = 'system-ui, -apple-system, "Segoe UI", "Noto Sans TC", "PingFang TC", sans-serif';
  const PI = Math.PI, DEG = PI / 180;

  function create(lib, host, B) {
    const THREE = lib.THREE, L = B.L, T = B.T, D = B.D;
    let C = B.colors();
    const col = function (k) { return new THREE.Color(C[k] || k); };
    const isDark = function () { return !!D.dark; };

    // ---------- 畫布與資訊列 ----------
    const wrap = document.createElement('div');
    wrap.className = 's3-wrap';
    const canvas = document.createElement('canvas');
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', T('線性變換的 3D 立體：坐標軸、地板格線、原來的單位立方體（虛線）、變形後的平行六面體與三個行向量。拖曳旋轉，滾輪或雙指縮放，方向鍵也可以轉動。',
      '3D view of the transformation: the axes, the floor grid, the original unit cube (dashed), the transformed parallelepiped and the three columns. Drag to rotate, scroll or pinch to zoom, or use the arrow keys.'));
    wrap.appendChild(canvas);
    const hud = document.createElement('div');
    hud.className = 's3-hud';
    hud.setAttribute('aria-hidden', 'true');
    hud.innerHTML = '<div class="tl"><span data-k="a"></span><span data-k="b"></span></div><div class="bl"><span class="m" data-k="tip"></span></div>';
    wrap.appendChild(hud);
    host.appendChild(wrap);
    const hudEl = {}, hudLast = {};
    hud.querySelectorAll('[data-k]').forEach(function (e) { hudEl[e.getAttribute('data-k')] = e; });
    function setHud(k, h) { if (hudLast[k] !== h) { hudLast[k] = h; hudEl[k].innerHTML = h; } }

    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true }); }
    catch (e) { wrap.remove(); throw e; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 4 / 3, 0.05, 500);
    camera.up.set(0, 0, 1);
    let lastAspect = 4 / 3;

    // ---------- 視角控制 ----------
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.rotateSpeed = 0.85;
    controls.screenSpacePanning = true;

    // ---------- 光線與環境反光 ----------
    scene.add(new THREE.HemisphereLight(0xffffff, 0x3a4250, 0.9));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
    keyLight.position.set(8, 5, 12);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.45);
    fillLight.position.set(-6, -8, 4);
    scene.add(fillLight);
    const pmrem = new THREE.PMREMGenerator(renderer);
    let envRT = null;
    function buildEnv() {
      if (envRT) { envRT.dispose(); envRT = null; }
      const s = new THREE.Scene();
      const g = new THREE.SphereGeometry(10, 32, 16);
      const pos = g.attributes.position, cols = new Float32Array(pos.count * 3);
      const top = new THREE.Color(isDark() ? 0x5d6a80 : 0xffffff), bot = new THREE.Color(isDark() ? 0x0a0d12 : 0x7d8794);
      const c = new THREE.Color();
      for (let i = 0; i < pos.count; i++) {
        const u = Math.max(0, Math.min(1, (pos.getZ(i) / 10 + 1) / 2));
        c.copy(bot).lerp(top, Math.pow(u, 0.75));
        cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      s.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
      envRT = pmrem.fromScene(s, 0.035);
      s.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      scene.environment = envRT.texture;
    }

    // ---------- 共用工具 ----------
    function disposeObject(obj) {
      obj.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); });
      });
    }
    function clearGroup(g) { g.children.slice().forEach(function (o) { g.remove(o); disposeObject(o); }); }
    const V3 = function (p) { return new THREE.Vector3(p[0], p[1], p[2]); };
    const UP = new THREE.Vector3(0, 1, 0);
    function mat(color, opt) {
      opt = opt || {};
      return new THREE.MeshStandardMaterial({
        color: color, roughness: opt.rough == null ? 0.4 : opt.rough, metalness: opt.metal == null ? 0.1 : opt.metal,
        transparent: opt.opacity != null, opacity: opt.opacity == null ? 1 : opt.opacity,
        depthWrite: opt.opacity == null, emissive: opt.emissive || 0x000000, emissiveIntensity: opt.ei || 0
      });
    }
    function arrow(g, p0, p1, color, r, opt) {
      const a = V3(p0), b = V3(p1), d = b.clone().sub(a), len = d.length();
      if (len < 1e-6) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(r * 2.2, 16, 12), mat(color));
        s.position.copy(a); g.add(s); return;
      }
      const dir = d.clone().normalize();
      const hl = Math.min(r * 7, len * 0.4), hr = r * 2.6;
      const q = new THREE.Quaternion().setFromUnitVectors(UP, dir);
      const m = mat(color, opt);
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len - hl, 16), m);
      shaft.quaternion.copy(q);
      shaft.position.copy(a).addScaledVector(dir, (len - hl) / 2);
      g.add(shaft);
      const head = new THREE.Mesh(new THREE.ConeGeometry(hr, hl, 24), m);
      head.quaternion.copy(q);
      head.position.copy(a).addScaledVector(dir, len - hl / 2);
      g.add(head);
    }
    function line(g, pts, color, opt) {
      opt = opt || {};
      const geo = new THREE.BufferGeometry().setFromPoints(pts.map(V3));
      const m = opt.dash ? new THREE.LineDashedMaterial({ color: color, dashSize: opt.dash, gapSize: opt.gap || opt.dash * 0.7, transparent: true, opacity: opt.opacity == null ? 1 : opt.opacity })
        : new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: opt.opacity == null ? 1 : opt.opacity });
      const l = new THREE.Line(geo, m);
      if (opt.dash) l.computeLineDistances();
      g.add(l);
      return l;
    }
    function polygon(g, pts, color, opacity) {
      const geo = new THREE.BufferGeometry();
      const arr = [];
      for (let i = 1; i + 1 < pts.length; i++) [pts[0], pts[i], pts[i + 1]].forEach(function (p) { arr.push(p[0], p[1], p[2]); });
      geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      geo.computeVertexNormals();
      const m = new THREE.MeshStandardMaterial({ color: color, transparent: true, opacity: opacity, side: THREE.DoubleSide, depthWrite: false, roughness: 0.55, metalness: 0.05 });
      const mesh = new THREE.Mesh(geo, m);
      mesh.renderOrder = 2;
      g.add(mesh);
      return mesh;
    }
    function sprite(g, text, p, color, size, italic) {
      const px = 64;
      const cv = document.createElement('canvas');
      const c0 = cv.getContext('2d');
      const font = (italic ? 'italic ' : '') + '700 ' + px + 'px ' + FONT;
      c0.font = font;
      const w = Math.ceil(c0.measureText(text).width) + 28, h = px + 28;
      cv.width = w; cv.height = h;
      const c = cv.getContext('2d');
      c.font = font; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = 12; c.lineJoin = 'round';
      c.strokeStyle = isDark() ? 'rgba(10,14,20,0.85)' : 'rgba(255,255,255,0.9)';
      c.strokeText(text, w / 2, h / 2 + 2);
      c.fillStyle = color; c.fillText(text, w / 2, h / 2 + 2);
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
      const k = (size || 0.5) / px;
      s.scale.set(w * k, h * k, 1);
      s.position.copy(V3(p));
      s.renderOrder = 10;
      g.add(s);
      return s;
    }
    function ball(g, p, r, color) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), mat(color));
      m.position.copy(V3(p));
      g.add(m);
    }

    // ---------- 場景 ----------
    const world = new THREE.Group();
    scene.add(world);
    let G = 3, R = 2;
    function extent() {
      let r = 1.75;
      L.CUBE_V.forEach(function (p) { r = Math.max(r, L.norm3(L.apply3(B.state.A3, p))); });
      return Math.min(r, 10);
    }
    function build() {
      clearGroup(world);
      R = extent();
      G = Math.max(2, Math.min(6, Math.ceil(R * 0.75)));
      const text = col('text'), muted = col('muted');
      const grid = new THREE.GridHelper(2 * G, 2 * G, muted, muted);
      grid.rotation.x = PI / 2;
      grid.material.transparent = true; grid.material.opacity = isDark() ? 0.22 : 0.28; grid.material.depthWrite = false;
      world.add(grid);
      [[1, 0, 0], [0, 1, 0], [0, 0, 1]].forEach(function (u, i) {
        arrow(world, [0, 0, 0], [u[0] * (G + 0.6), u[1] * (G + 0.6), u[2] * (G + 0.6)], text, 0.018, { opacity: 0.7 });
        line(world, [[0, 0, 0], [-u[0] * G, -u[1] * G, -u[2] * G]], muted, { dash: 0.15, gap: 0.12, opacity: 0.55 });
        sprite(world, ['x', 'y', 'z'][i], [u[0] * (G + 0.95), u[1] * (G + 0.95), u[2] * (G + 0.95)], C.text, 0.14 * G + 0.12, true);
      });
      ball(world, [0, 0, 0], 0.06, text);
      // 原來的單位立方體
      L.CUBE_E.forEach(function (e) { line(world, [L.CUBE_V[e[0]], L.CUBE_V[e[1]]], muted, { dash: 0.08, gap: 0.07, opacity: 0.8 }); });
      // 變形後的平行六面體
      const M = B.matrix(), det = L.det3(M), s = Math.abs(det) <= 1e-9 ? 0 : det > 0 ? 1 : -1;
      const W = L.CUBE_V.map(function (p) { return L.apply3(M, p); });
      const c = col(s < 0 ? 'lt-neg' : 'lt-pos');
      L.CUBE_F.forEach(function (f, i) { polygon(world, f.map(function (k) { return W[k]; }), c, i === 0 ? 0.3 : 0.17); });
      L.CUBE_E.forEach(function (e) { line(world, [W[e[0]], W[e[1]]], c, { opacity: 0.9 }); });
      // 三個行向量
      [[1, 'lt-i', 'i'], [2, 'lt-j', 'j'], [4, 'lt-k', 'k']].forEach(function (a, n) {
        const w = W[a[0]];
        arrow(world, [0, 0, 0], w, col(a[1]), n === B.state.col ? 0.06 : 0.048, { emissive: col(a[1]), ei: 0.1 });
        const len = L.norm3(w), u = len > 1e-6 ? [w[0] / len, w[1] / len, w[2] / len] : [0, 0, 1];
        sprite(world, a[2], [w[0] + u[0] * 0.3, w[1] + u[1] * 0.3, w[2] + u[2] * 0.3], C[a[1]], 0.12 * G + 0.1, true);
      });
      const tr = B.tr, rk = L.rank3(M);
      setHud('a', 'det A = ' + tr(det, 3));
      setHud('b', s === 0 ? (rk === 2 ? T('壓成一個平面', 'flattened into a plane') : rk === 1 ? T('壓成一條線', 'squashed onto a line') : T('壓成一點', 'squashed to a point'))
        : (s < 0 ? T('翻面，', 'flipped, ') : '') + T('體積 × ', 'volume × ') + tr(Math.abs(det), 3));
      setHud('tip', T('拖曳旋轉・滾輪縮放', 'Drag to rotate · scroll to zoom'));
    }

    // ---------- 繪製與鏡頭 ----------
    let raf = 0;
    function requestRender() {
      if (raf || !api.active) return;
      raf = requestAnimationFrame(function () {
        raf = 0;
        if (!api.active) return;
        const moving = controls.update();
        renderer.render(scene, camera);
        if (moving) requestRender();
      });
    }
    function resetCamera() {
      const e = L.viewBasis(B.yaw0, B.pitch0).e;
      const dist = (Math.max(G, R) + 0.5) * (camera.aspect < 1 ? 4.1 : 3.3);
      camera.position.set(e[0] * dist, e[1] * dist, e[2] * dist + 0.5);
      controls.target.set(0.3, 0.3, 0.8);
      camera.updateProjectionMatrix();
      controls.update();
      requestRender();
    }
    function resize3() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (Math.abs(camera.aspect - lastAspect) > 1e-3) { lastAspect = camera.aspect; resetCamera(); }
      requestRender();
    }
    const ro = window.ResizeObserver ? new ResizeObserver(function () { resize3(); }) : null;
    if (ro) ro.observe(canvas); else window.addEventListener('resize', resize3);
    controls.addEventListener('change', requestRender);
    const onVisible = function () { if (!document.hidden) requestRender(); };
    document.addEventListener('visibilitychange', onVisible);
    canvas.addEventListener('webglcontextlost', function (ev) {
      ev.preventDefault();
      if (!api.active) return;
      if (B.onContextLost) B.onContextLost();
    });
    canvas.addEventListener('keydown', function (ev) {
      const step = (ev.shiftKey ? 15 : 5) * DEG;
      const off = camera.position.clone().sub(controls.target);
      const tmp = new THREE.Vector3(off.x, off.z, -off.y);
      const sph = new THREE.Spherical().setFromVector3(tmp);
      let used = true;
      if (ev.key === 'ArrowLeft') sph.theta -= step;
      else if (ev.key === 'ArrowRight') sph.theta += step;
      else if (ev.key === 'ArrowUp') sph.phi = Math.max(0.05, sph.phi - step);
      else if (ev.key === 'ArrowDown') sph.phi = Math.min(PI - 0.05, sph.phi + step);
      else used = false;
      if (!used) return;
      ev.preventDefault();
      const v = new THREE.Vector3().setFromSpherical(sph);
      camera.position.copy(controls.target).add(new THREE.Vector3(v.x, -v.z, v.y));
      controls.update();
      requestRender();
    });

    const api = {
      active: true,
      frame: function () { requestRender(); },
      rebuild: function () { build(); requestRender(); },
      onTheme: function () {
        C = B.colors();
        buildEnv();
        Object.keys(hudLast).forEach(function (k) { delete hudLast[k]; });
        build();
        requestRender();
      },
      resetCamera: function () { resetCamera(); },
      dispose: function () {
        api.active = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        document.removeEventListener('visibilitychange', onVisible);
        controls.dispose();
        disposeObject(scene);
        if (envRT) envRT.dispose();
        pmrem.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        wrap.remove();
      }
    };

    buildEnv();
    build();
    const w0 = canvas.clientWidth, h0 = canvas.clientHeight;
    if (w0 && h0) {
      renderer.setSize(w0, h0, false);
      camera.aspect = w0 / h0;
      camera.updateProjectionMatrix();
      lastAspect = camera.aspect;
    }
    resetCamera();
    return api;
  }

  window.LinearTransform3D = { create: create };
})();
