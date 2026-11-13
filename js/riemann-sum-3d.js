/*
 * riemann-sum-3d.js — 「黎曼和、定積分與旋轉體」的 3D 旋轉體（three.js）
 *
 * 由 js/riemann-sum.js 在使用者按「3D 旋轉體」時才載入（three.js 也是那時才以 import() 載入）；切回 2D 時整個釋放。
 * 用法：window.RiemannSum3D.create({ THREE, OrbitControls }, 容器, bridge) → { active, rebuild, onTheme, resetCamera, dispose }
 *
 * 場景座標：x 軸就是數學的 x 軸（旋轉軸），y 朝上，z 朝向觀眾；y = f(x) 繞 x 軸旋轉。
 * 圓盤與圓台的半徑、準確的旋轉體都從 RiemannCore 算出；3D 只負責畫。
 */
(function () {
  'use strict';
  const FONT = 'system-ui, -apple-system, "Segoe UI", "Noto Sans TC", "PingFang TC", sans-serif';
  const PI = Math.PI;

  function create(lib, host, B) {
    const THREE = lib.THREE, R = B.R, T = B.T, D = B.D, state = B.state;
    let C = B.colors();
    const isDark = function () { return !!D.dark; };

    // ---------- 畫布與資訊列 ----------
    const wrap = document.createElement('div');
    wrap.className = 's3-wrap';
    const canvas = document.createElement('canvas');
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', T('旋轉體的 3D 檢視：曲線繞 x 軸旋轉，用圓盤一片片疊起來。拖曳旋轉，滾輪或雙指縮放，方向鍵也可以轉動。',
      '3D view of the solid of revolution: the curve spun around the x-axis and built from thin discs. Drag to rotate, scroll or pinch to zoom, or use the arrow keys.'));
    wrap.appendChild(canvas);
    const hud = document.createElement('div');
    hud.className = 's3-hud';
    hud.setAttribute('aria-hidden', 'true');
    hud.innerHTML = '<div class="tl"><span data-k="v"></span><span data-k="vx"></span></div><div class="bl"><span class="m" data-k="tip"></span></div>';
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
    let lastAspect = 4 / 3;
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.rotateSpeed = 0.85;
    controls.screenSpacePanning = true;

    // ---------- 光線與環境反光 ----------
    scene.add(new THREE.HemisphereLight(0xffffff, 0x3a4250, 0.85));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.7);
    keyLight.position.set(6, 10, 9);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
    fillLight.position.set(-8, -4, -6);
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
        const u = Math.max(0, Math.min(1, (pos.getY(i) / 10 + 1) / 2));
        c.copy(bot).lerp(top, Math.pow(u, 0.75));
        cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      s.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
      envRT = pmrem.fromScene(s, 0.035);
      s.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      scene.environment = envRT.texture;
    }

    function disposeObject(obj) {
      obj.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); });
      });
    }
    function clearGroup(g) { g.children.slice().forEach(function (o) { g.remove(o); disposeObject(o); }); }
    function sprite(g, text, p, color, size) {
      const px = 64;
      const cv = document.createElement('canvas');
      const c0 = cv.getContext('2d');
      const font = '700 ' + px + 'px ' + FONT;
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
      const k = (size || 0.4) / px;
      s.scale.set(w * k, h * k, 1);
      s.position.set(p[0], p[1], p[2]);
      s.renderOrder = 10;
      g.add(s);
      return s;
    }

    // ---------- 場景 ----------
    const world = new THREE.Group();
    scene.add(world);
    let span = 4, rmax = 1, cx = 1;

    function build() {
      clearGroup(world);
      const q = B.quantities(), F0 = R.FUNCS[state.key], f = F0.f;
      const a = state.a, b = state.b, n = state.n, rule = B.rule3();
      cx = (a + b) / 2; span = b - a;
      rmax = 0;
      for (let i = 0; i <= 200; i++) rmax = Math.max(rmax, Math.abs(f(a + span * i / 200)));
      for (let i = 0; i < n; i++) { const d = R.disk(state.key, a, b, n, rule, i); rmax = Math.max(rmax, d.rl, d.rr); }
      rmax = Math.max(rmax, 0.2);
      const posC = new THREE.Color(C['rs-pos']), negC = new THREE.Color(C['rs-neg']);

      // x 軸（旋轉軸）
      const axLen = span * 0.18 + 0.3;
      const axMat = new THREE.LineBasicMaterial({ color: new THREE.Color(C.text), transparent: true, opacity: 0.7 });
      world.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a - axLen, 0, 0), new THREE.Vector3(b + axLen, 0, 0)]), axMat));
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.035 * Math.max(span, 2 * rmax) / 2, 0.12 * Math.max(span, 2 * rmax) / 2, 20),
        new THREE.MeshStandardMaterial({ color: new THREE.Color(C.text), roughness: 0.5 }));
      cone.rotation.z = -PI / 2; cone.position.set(b + axLen, 0, 0);
      world.add(cone);
      const ls = Math.max(span, 2 * rmax) * 0.045;
      sprite(world, 'x', [b + axLen + ls * 0.8, 0, 0], C.text, ls);
      sprite(world, 'a = ' + B.tr(a, 3), [a, -rmax - ls * 0.9, 0], C.muted, ls * 0.8);
      sprite(world, 'b = ' + B.tr(b, 3), [b, -rmax - ls * 0.9, 0], C.muted, ls * 0.8);

      // 圓盤（梯形法是圓台）；正負交錯兩種亮度，看得出一片一片
      const seg = n > 100 ? 40 : 56;
      for (let i = 0; i < n; i++) {
        const d = R.disk(state.key, a, b, n, rule, i), h = d.r - d.l;
        if (d.rl < 1e-6 && d.rr < 1e-6) continue;
        const mid = rule === 'trap' ? (f(d.l) + f(d.r)) / 2 : R.piece(state.key, a, b, n, rule === 'upper' || rule === 'lower' ? 'mid' : rule, i).y;
        const base = mid < 0 ? negC.clone() : posC.clone();
        const col = base.offsetHSL(0, 0, (i % 2 ? -0.06 : 0.04));
        const geo = new THREE.CylinderGeometry(Math.max(1e-4, d.rl), Math.max(1e-4, d.rr), h * (n > 1 ? 0.985 : 1), seg, 1, false);
        geo.rotateZ(PI / 2);       // 圓柱的軸 +y → −x：radiusTop 在左端
        const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: col, roughness: 0.38, metalness: 0.12, envMapIntensity: 0.9 }));
        m.position.set((d.l + d.r) / 2, 0, 0);
        world.add(m);
      }

      // 準確的旋轉體：半透明曲面
      const NX = 120, NT = 64;
      const pos = [], idx = [];
      for (let i = 0; i <= NX; i++) {
        const x = a + span * i / NX, r = Math.abs(f(x));
        for (let j = 0; j <= NT; j++) { const t = 2 * PI * j / NT; pos.push(x, r * Math.cos(t), r * Math.sin(t)); }
      }
      for (let i = 0; i < NX; i++) for (let j = 0; j < NT; j++) {
        const p0 = i * (NT + 1) + j, p1 = p0 + NT + 1;
        idx.push(p0, p1, p0 + 1, p1, p1 + 1, p0 + 1);
      }
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      sg.setIndex(idx);
      sg.computeVertexNormals();
      const skin = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({
        color: new THREE.Color(C['rs-area']), transparent: true, opacity: isDark() ? 0.22 : 0.2, side: THREE.DoubleSide, depthWrite: false, roughness: 0.3, metalness: 0
      }));
      skin.renderOrder = 3;
      world.add(skin);
      // 曲線本身（y = f(x)，在 z = 0 的平面上）與它的鏡像
      const cpts = [], mpts = [];
      for (let i = 0; i <= 200; i++) { const x = a + span * i / 200; cpts.push(new THREE.Vector3(x, f(x), 0)); mpts.push(new THREE.Vector3(x, -f(x), 0)); }
      const cm = new THREE.LineBasicMaterial({ color: new THREE.Color(C['rs-curve']) });
      world.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(cpts), cm));
      const mm = new THREE.LineDashedMaterial({ color: new THREE.Color(C['rs-curve']), dashSize: span / 60, gapSize: span / 90, transparent: true, opacity: 0.55 });
      const ml = new THREE.Line(new THREE.BufferGeometry().setFromPoints(mpts), mm);
      ml.computeLineDistances();
      world.add(ml);
      sprite(world, 'y = ' + B.fname(true), [b - span * 0.12, Math.max(f(b - span * 0.12), 0) + ls * 1.1, 0], C['rs-curve'], ls);

      // 資訊列
      const hide = !!state.chal;
      setHud('v', (rule === 'trap' ? T('圓台', 'Frustums') : T('圓盤', 'Discs')) + ' n = ' + n + T('：體積 ', ': volume ') + (hide ? '？' : B.num(q.V, 4)));
      setHud('vx', 'π∫f<sup>2</sup> dx = ' + (hide ? '？' : B.num(q.Vx, 4)));
      setHud('tip', T('拖曳旋轉・滾輪或雙指縮放', 'Drag to rotate · scroll or pinch to zoom'));
    }

    // ---------- 鏡頭與繪製 ----------
    let raf = 0;
    function requestRender() { if (!raf) raf = requestAnimationFrame(render); }
    function render() {
      raf = 0;
      if (!api.active) return;
      const moving = controls.update();
      renderer.render(scene, camera);
      if (moving) requestRender();
    }
    function resetCamera() {
      const size = Math.max(span, 2 * rmax);
      const dist = size * (camera.aspect < 1 ? 3.0 : 2.5);
      // 從半徑小的那一端斜看過去，大的圓盤才不會擋住其他的
      const f = R.FUNCS[state.key].f, side = Math.abs(f(state.a)) <= Math.abs(f(state.b)) ? -1 : 1;
      const dir = new THREE.Vector3(0.5 * side, 0.45, 1).normalize();
      controls.target.set(cx, 0, 0);
      camera.position.set(cx + dir.x * dist, dir.y * dist, dir.z * dist);
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
      const step = (ev.shiftKey ? 15 : 5) * PI / 180;
      const off = camera.position.clone().sub(controls.target);
      const sph = new THREE.Spherical().setFromVector3(off);
      let used = true;
      if (ev.key === 'ArrowLeft') sph.theta -= step;
      else if (ev.key === 'ArrowRight') sph.theta += step;
      else if (ev.key === 'ArrowUp') sph.phi = Math.max(0.05, sph.phi - step);
      else if (ev.key === 'ArrowDown') sph.phi = Math.min(PI - 0.05, sph.phi + step);
      else used = false;
      if (!used) return;
      ev.preventDefault();
      camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(sph));
      controls.update();
      requestRender();
    });

    let lastSpan = null;
    const api = {
      active: true,
      rebuild: function () {
        build();
        // 區間或函數改變時重設鏡頭（只改 n 或取法時不動）
        const k = state.key + '|' + state.a + '|' + state.b;
        if (k !== lastSpan) { lastSpan = k; resetCamera(); }
        requestRender();
      },
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
    lastSpan = state.key + '|' + state.a + '|' + state.b;
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

  window.RiemannSum3D = { create: create };
})();
