/*
 * galton-board-3d.js — 「高爾頓板與二項分布」的 3D 釘板（three.js）
 *
 * 由 js/galton-board.js 在使用者按「3D 釘板」時才載入（three.js 也是那時才以 import() 載入）；切回 2D 時整個釋放。
 * 用法：window.Galton3D.create({ THREE, OrbitControls }, 容器, bridge) → { active, frame, rebuild, onTheme, resetCamera, dispose }
 *
 * 場景座標：1 個單位 = 釘子的水平間距。X 向右，Y 向上（第一層釘子在 Y = 0，第 r 層在 Y = −r·rh），Z 朝向觀看者。
 * 落球的位置、長條高度都直接取自 2D 的模擬（bridge），3D 只負責畫，兩邊看到的永遠是同一批球。
 */
(function () {
  'use strict';
  const FONT = 'system-ui, -apple-system, "Segoe UI", "Noto Sans TC", "PingFang TC", sans-serif';
  const PI = Math.PI, DEG = PI / 180;
  const MAX_BALLS = 300;
  const DEPTH = 0.7;            // 前後玻璃之間的距離（球的直徑約 0.5，剛好夾在這個夾層裡，和真的釘板一樣）

  function create(lib, host, B) {
    const THREE = lib.THREE;
    const T = B.T, D = B.D, state = B.state;
    let C = B.colors();
    const col = function (k) { return new THREE.Color(C[k] || k); };
    const isDark = function () { return !!D.dark; };

    // ---------- 畫布與資訊列 ----------
    const wrap = document.createElement('div');
    wrap.className = 'g3-wrap';
    const canvas = document.createElement('canvas');
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', T('高爾頓板的 3D 立體檢視：木板上的金屬釘、前面的玻璃、落下的球與收集球的格子。拖曳旋轉，滾輪或雙指縮放，方向鍵也可以轉動。',
      '3D view of the Galton board: metal pegs on a wooden board behind glass, the falling balls and the bins that collect them. Drag to rotate, scroll or pinch to zoom, or use the arrow keys.'));
    wrap.appendChild(canvas);
    const hud = document.createElement('div');
    hud.className = 'g3-hud';
    hud.setAttribute('aria-hidden', 'true');
    hud.innerHTML = '<div class="tl"><span data-k="n"></span><span class="m" data-k="s"></span></div><div class="bl"><span class="m" data-k="tip"></span></div>';
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
    const camera = new THREE.PerspectiveCamera(34, 4 / 3, 0.05, 500);
    let cw = 300, ch = 225;

    // ---------- 視角控制 ----------
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.rotateSpeed = 0.85;
    controls.screenSpacePanning = true;
    let startAng = null;
    controls.addEventListener('start', function () { startAng = [controls.getAzimuthalAngle(), controls.getPolarAngle()]; });
    controls.addEventListener('end', function () {
      if (!startAng) return;
      const turned = Math.abs(controls.getAzimuthalAngle() - startAng[0]) + Math.abs(controls.getPolarAngle() - startAng[1]);
      startAng = null;
      if (turned > 0.1) B.onRotate();
    });

    // ---------- 光線與環境反光 ----------
    const hemi = new THREE.HemisphereLight(0xffffff, 0x3a4250, 0.85);
    scene.add(hemi);
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.8);
    keyLight.position.set(5, 9, 12);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.45);
    fillLight.position.set(-8, 2, 6);
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

    // ---------- 共用工具 ----------
    function disposeObject(obj) {
      obj.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); });
      });
    }
    function clearGroup(g) { g.children.slice().forEach(function (o) { g.remove(o); disposeObject(o); }); }
    function box(w, h, d, color, opt) {
      opt = opt || {};
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({
        color: color, roughness: opt.rough == null ? 0.7 : opt.rough, metalness: opt.metal || 0,
        transparent: opt.opacity != null, opacity: opt.opacity == null ? 1 : opt.opacity, depthWrite: opt.opacity == null
      }));
      return m;
    }
    /** 木紋貼圖（程式產生，不需要外部圖檔） */
    function woodTexture() {
      const c = document.createElement('canvas');
      c.width = 256; c.height = 256;
      const g = c.getContext('2d');
      const base = new THREE.Color(C['gb-wood']);
      g.fillStyle = '#' + base.getHexString();
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 70; i++) {
        const y = Math.random() * 256, a = 0.04 + Math.random() * 0.07;
        g.strokeStyle = 'rgba(' + (Math.random() < 0.5 ? '0,0,0' : '255,255,255') + ',' + a + ')';
        g.lineWidth = 0.6 + Math.random() * 2.2;
        g.beginPath();
        g.moveTo(0, y);
        for (let x = 0; x <= 256; x += 16) g.lineTo(x, y + Math.sin(x / 40 + i) * 3);
        g.stroke();
      }
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      return tex;
    }

    // ---------- 物件 ----------
    const gStatic = new THREE.Group(), gBars = new THREE.Group();
    scene.add(gStatic, gBars);
    let geo = null, bars = [], marks = [], balls = null, fitC = new THREE.Vector3(), fitR = 6, fitH = 8, fitW = 8;
    function build() {
      clearGroup(gStatic); clearGroup(gBars);
      if (balls) { scene.remove(balls); disposeObject(balls); balls = null; }
      bars = []; marks = [];
      geo = B.geom();
      const n = geo.n, half = (n + 1) / 2;
      const yTop = -geo.top + 0.4, yBins = -geo.binsTop, yBase = -(geo.binsTop + geo.binsH);
      const x0 = -half - 0.35, x1 = half + 0.35;
      // 背板（木頭）
      const tex = woodTexture();
      tex.repeat.set((x1 - x0) / 6, (yTop - yBase) / 6);
      const back = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, yTop - yBase + 0.4, 0.2),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.78, metalness: 0 }));
      back.position.set(0, (yTop + yBase) / 2, -DEPTH / 2 - 0.1);
      gStatic.add(back);
      // 兩側與底座
      const wood = col('gb-wood').offsetHSL(0, 0, isDark() ? -0.05 : -0.12);
      const side = box(0.22, yTop - yBase + 0.4, DEPTH + 0.2, wood, { rough: 0.6 });
      side.position.set(x0 - 0.11, (yTop + yBase) / 2, 0); gStatic.add(side);
      const side2 = side.clone(); side2.position.x = x1 + 0.11; gStatic.add(side2);
      const base = box(x1 - x0 + 0.44, 0.3, DEPTH + 0.4, wood, { rough: 0.6 });
      base.position.set(0, yBase - 0.15, 0); gStatic.add(base);
      // 漏斗
      const fw = Math.min(1.6, half), fy0 = yTop - 0.1, fy1 = -geo.pegR - 2 * geo.ballR - 0.15;
      [-1, 1].forEach(function (sgn) {
        const xa = sgn * fw, xb = sgn * (geo.ballR * 1.6);
        const len = Math.hypot(xa - xb, fy0 - fy1);
        const f = box(len, 0.1, DEPTH, wood, { rough: 0.5 });
        f.position.set((xa + xb) / 2, (fy0 + fy1) / 2, 0);
        f.rotation.z = Math.atan2(fy0 - fy1, xa - xb);
        gStatic.add(f);
      });
      // 釘子（金屬圓柱，從背板穿到玻璃）
      const pegCount = n * (n + 1) / 2;
      const pegGeo = new THREE.CylinderGeometry(geo.pegR, geo.pegR, DEPTH, 16);
      pegGeo.rotateX(PI / 2);
      const pegMat = new THREE.MeshStandardMaterial({ color: col('gb-peg'), roughness: 0.28, metalness: 0.85 });
      const selMat = new THREE.MeshStandardMaterial({ color: col('gb-sel'), roughness: 0.3, metalness: 0.6, emissive: col('gb-sel'), emissiveIntensity: 0.25 });
      const pegs = new THREE.InstancedMesh(pegGeo, pegMat, Math.max(1, pegCount));
      const pegsSel = new THREE.InstancedMesh(pegGeo.clone(), selMat, Math.max(1, pegCount));
      const m4 = new THREE.Matrix4();
      let a = 0, b = 0;
      const sel = state.sel;
      for (let r = 0; r < n; r++) for (let j = 0; j <= r; j++) {
        m4.makeTranslation(j - r / 2, -r * geo.rh, 0);
        if (sel != null && j <= sel && sel <= j + (n - r)) pegsSel.setMatrixAt(b++, m4); else pegs.setMatrixAt(a++, m4);
      }
      pegs.count = a; pegsSel.count = b;
      gStatic.add(pegs, pegsSel);
      // 格子的隔板
      const div = box(0.07, geo.binsH, DEPTH, wood, { rough: 0.55 });
      for (let k = 0; k <= n + 1; k++) {
        const d = k === 0 ? div : div.clone();
        d.position.set(-half + k, (yBins + yBase) / 2, 0);
        gStatic.add(d);
      }
      // 長條（實驗）與理論的刻線
      for (let k = 0; k <= n; k++) {
        const isSel = k === sel;
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1, DEPTH * 0.86), new THREE.MeshPhysicalMaterial({
          color: isSel ? col('gb-sel') : col('gb-ball'), roughness: 0.35, metalness: 0.05, clearcoat: 0.6, clearcoatRoughness: 0.3,
          emissive: isSel ? col('gb-sel') : col('gb-ball'), emissiveIntensity: 0.08
        }));
        bar.position.set(-half + 0.5 + k, yBase, 0);
        bar.visible = false;
        gBars.add(bar); bars.push(bar);
        const mk = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: col('gb-theory') }));
        mk.position.set(-half + 0.5 + k, yBase, DEPTH / 2 + 0.03);
        mk.visible = false;
        gBars.add(mk); marks.push(mk);
      }
      // 前面的玻璃
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, yTop - yBase + 0.4), new THREE.MeshPhysicalMaterial({
        color: 0xffffff, roughness: 0.05, metalness: 0, transparent: true, opacity: isDark() ? 0.06 : 0.1, depthWrite: false, envMapIntensity: 1.2
      }));
      glass.position.set(0, (yTop + yBase) / 2, DEPTH / 2 + 0.01);
      glass.renderOrder = 10;
      gStatic.add(glass);
      // 球（最多 MAX_BALLS 顆同時在空中）
      balls = new THREE.InstancedMesh(new THREE.SphereGeometry(geo.ballR, 20, 14), new THREE.MeshPhysicalMaterial({
        color: col('gb-ball'), roughness: 0.22, metalness: 0.1, clearcoat: 0.9, clearcoatRoughness: 0.15, emissive: col('gb-ball'), emissiveIntensity: 0.1
      }), MAX_BALLS);
      balls.count = 0;
      balls.frustumCulled = false;
      scene.add(balls);
      // 取景範圍
      fitW = x1 - x0 + 0.6; fitH = yTop - yBase + 0.8;
      fitC.set(0, (yTop + yBase) / 2, 0);
      fitR = 0.5 * Math.hypot(fitW, fitH, DEPTH);
    }
    const m4 = new THREE.Matrix4();
    function updateDynamic() {
      if (!geo) return;
      const pos = B.balls();
      const cnt = Math.min(MAX_BALLS, pos.length / 2);
      for (let i = 0; i < cnt; i++) { m4.makeTranslation(pos[2 * i], -pos[2 * i + 1], 0); balls.setMatrixAt(i, m4); }
      balls.count = cnt;
      balls.instanceMatrix.needsUpdate = true;
      const yBase = -(geo.binsTop + geo.binsH);
      const hs = B.bars(), th = B.theory();
      for (let k = 0; k < bars.length; k++) {
        const h = hs[k] || 0;
        bars[k].visible = h > 0.01;
        bars[k].scale.y = Math.max(0.01, h);
        bars[k].position.y = yBase + h / 2;
        const show = th && state.show.theory;
        marks[k].visible = !!show;
        if (show) marks[k].position.y = yBase + th[k];
      }
      const st = B.stats();
      setHud('n', T('球數 N = ', 'Balls N = ') + B.intText(state.N));
      setHud('s', 'n = ' + state.n + T('，', ', ') + 'p = ' + (state.hidden ? '?' : B.G.trim(state.p, 2)) +
        (state.N ? T('，平均 ', ', mean ') + B.num(st.mean, 2) : ''));
      setHud('tip', T('轉到側面看看：球夾在兩片玻璃之間', 'Turn it sideways: the balls run between two sheets of glass'));
    }

    // ---------- 視角 ----------
    let lastAspect = 0;
    function fitDistance() {
      const vf = camera.fov * DEG;
      const hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
      const dv = (fitH / 2) / Math.tan(vf / 2), dh = (fitW / 2) / Math.tan(hf / 2);
      return Math.max(dv, dh) * 1.08 + DEPTH;
    }
    function resetCamera() {
      const d = fitDistance();
      controls.target.copy(fitC);
      camera.position.copy(fitC).addScaledVector(new THREE.Vector3(0.24, 0.12, 1).normalize(), d);
      controls.minDistance = fitR * 0.25;
      controls.maxDistance = fitR * 6;
      camera.near = fitR * 0.01; camera.far = fitR * 40;
      camera.updateProjectionMatrix();
      controls.update();
      requestRender();
    }

    // ---------- 繪製 ----------
    let raf = 0;
    function renderNow() {
      if (!api.active || document.hidden) return;
      const want = Math.min(window.devicePixelRatio || 1, 2);
      if (renderer.getPixelRatio() !== want) { renderer.setPixelRatio(want); resize3(); return; }
      updateDynamic();
      const moved = controls.update();
      renderer.render(scene, camera);
      if (moved) requestRender();
    }
    function requestRender() {
      if (raf || !api.active) return;
      raf = requestAnimationFrame(function () { raf = 0; renderNow(); });
    }
    function resize3() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      cw = w; ch = h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (Math.abs(camera.aspect - lastAspect) > 1e-3) { lastAspect = camera.aspect; resetCamera(); }
      renderNow();
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
    // 鍵盤：方向鍵繞著板子轉
    canvas.addEventListener('keydown', function (ev) {
      const step = (ev.shiftKey ? 15 : 5) * DEG;
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
      B.onRotate();
    });

    const api = {
      active: true,
      /** 主程式每一幀呼叫（球在動的時候） */
      frame: function () { renderNow(); },
      /** 層數、選取的格子、挑戰狀態改變時重建 */
      rebuild: function () { const oldN = geo && geo.n; build(); if (geo.n !== oldN) resetCamera(); requestRender(); },
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
      cw = w0; ch = h0;
      renderer.setSize(cw, ch, false);
      camera.aspect = cw / ch;
      camera.updateProjectionMatrix();
      lastAspect = camera.aspect;
    }
    resetCamera();
    return api;
  }

  window.Galton3D = { create: create };
})();
