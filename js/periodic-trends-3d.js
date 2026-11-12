/*
 * periodic-trends-3d.js — 「週期表與週期性」的 3D 立體長條圖（可旋轉、縮放，點長條選元素）
 *
 * three.js 由 periodic-trends.js 在切換到 3D 時才以 import() 動態載入，再傳進 PT3D.create(lib, host)。
 * 這個檔案只「讀」頁面的狀態：每個元素的格子位置、0–1 的相對數值與顏色（host.cell(Z)），不改變任何數據。
 * 長條高度 = 0.12 + 3.2 × 相對數值（密度用對數，與 2D 色階相同）；沒有數據的元素是扁平的灰色格子。
 * 場景：每格 1 × 1，第 1–7 週期在 z = 0–6，鑭系、錒系兩列在 z = 7.5、8.5；整張表置中。
 */
(function () {
  'use strict';
  const HMAX = 3.2, H0 = 0.12, FLAT = 0.05;
  const CX = 9.5, CZ = 4.75;
  const ATL = 16, TILE = 64;   // 符號圖集：16 × 8 格，每格 64 px

  function create(lib, H) {
    const THREE = lib.THREE;
    const T = H.T, host = H.host, N = H.N;

    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('週期表的 3D 立體長條圖：長條越高，數值越大（拖曳旋轉、雙指或滾輪縮放、點長條選元素）',
      '3D bar chart of the periodic table: the taller the bar, the larger the value (drag to rotate, pinch or scroll to zoom, tap a bar to choose it)'));
    canvas.setAttribute('role', 'img');
    host.appendChild(canvas);
    const hudTL = document.createElement('div'), hudTR = document.createElement('div'), hudBL = document.createElement('div');
    hudTL.className = 'r3-hud tl'; hudTR.className = 'r3-hud tr'; hudBL.className = 'r3-hud bl';
    [hudTL, hudTR, hudBL].forEach(function (d) { d.setAttribute('aria-hidden', 'true'); host.appendChild(d); });
    hudBL.textContent = T('拖曳旋轉・滾輪或雙指縮放・點長條選元素', 'Drag to rotate · scroll or pinch to zoom · tap a bar');

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: 'default' });
    } catch (e) {
      canvas.remove(); hudTL.remove(); hudTR.remove(); hudBL.remove();
      throw e;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1.5, 0.3, 300);
    const viewDir = new THREE.Vector3(-0.28, 0.95, 1).normalize();
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.minDistance = 6;
    controls.maxDistance = 70;
    controls.enablePan = false;
    controls.maxPolarAngle = Math.PI * 0.49;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 1.35));
    const sun = new THREE.DirectionalLight(0xffffff, 1.7);
    sun.position.set(-8, 16, 10);
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0xffffff, 0.45);
    rim.position.set(12, 5, -10);
    scene.add(rim);

    function xz(row, col) { return [col - CX, (row <= 7 ? row - 1 : 7.5 + (row - 9)) - CZ + 0.5]; }

    // ---------- 底板 ----------
    const plateMat = new THREE.MeshStandardMaterial({ color: 0xdfe3e8, roughness: 0.85, metalness: 0 });
    const plate = new THREE.Mesh(new THREE.BoxGeometry(19.2, 0.12, 10.6), plateMat);
    plate.position.set(0, -0.06, 0.15);
    scene.add(plate);

    // ---------- 符號圖集 ----------
    const atlas = document.createElement('canvas');
    atlas.width = ATL * TILE; atlas.height = 8 * TILE;
    const ag = atlas.getContext('2d');
    function drawAtlas() {
      ag.clearRect(0, 0, atlas.width, atlas.height);
      ag.textAlign = 'center'; ag.textBaseline = 'middle';
      ag.lineJoin = 'round';
      for (let i = 0; i <= N; i++) {
        const s = i === 0 ? '?' : H.cell(i).sym;
        const x = (i % ATL) * TILE + TILE / 2, y = Math.floor(i / ATL) * TILE + TILE / 2;
        ag.font = '700 ' + (s.length > 1 ? 30 : 36) + 'px system-ui, sans-serif';
        ag.lineWidth = 7; ag.strokeStyle = 'rgba(20,22,28,0.85)'; ag.strokeText(s, x, y + 2);
        ag.fillStyle = '#ffffff'; ag.fillText(s, x, y + 2);
      }
    }
    drawAtlas();
    const atlasTex = new THREE.CanvasTexture(atlas);
    atlasTex.anisotropy = 4;
    const labelMat = new THREE.MeshBasicMaterial({ map: atlasTex, transparent: true, depthWrite: false });
    function tileGeo(i) {
      const geo = new THREE.PlaneGeometry(0.78, 0.78);
      const u0 = (i % ATL) / ATL, v1 = 1 - Math.floor(i / ATL) / 8, du = 1 / ATL, dv = 1 / 8;
      const uv = geo.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) * du, v1 - (1 - uv.getY(k)) * dv);
      uv.needsUpdate = true;
      return geo;
    }

    // ---------- 長條 ----------
    const boxGeo = new THREE.BoxGeometry(0.86, 1, 0.86);
    boxGeo.translate(0, 0.5, 0);
    const bars = [null], labels = [null], qGeo = tileGeo(0);
    const hNow = new Float32Array(N + 1), hTo = new Float32Array(N + 1);
    for (let Z = 1; Z <= N; Z++) {
      const c = H.cell(Z), p = xz(c.row, c.col);
      const m = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.55, metalness: 0.05 }));
      m.position.set(p[0], 0, p[1]);
      m.userData.Z = Z;
      scene.add(m); bars.push(m);
      const lab = new THREE.Mesh(tileGeo(Z), labelMat);
      lab.rotation.x = -Math.PI / 2;
      lab.position.set(p[0], 0, p[1]);
      lab.renderOrder = 2;
      lab.userData.geo = lab.geometry;
      scene.add(lab); labels.push(lab);
      hNow[Z] = FLAT;
    }
    // 選取記號：浮在長條上方的倒三角錐＋外框
    const markMat = new THREE.MeshStandardMaterial({ color: 0x2f6fd0, roughness: 0.35, metalness: 0.1, emissive: 0x000000 });
    const mark = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.5, 24), markMat);
    mark.rotation.x = Math.PI;
    scene.add(mark);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x2f6fd0 });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.6, 4, 1, Math.PI / 4), ringMat);
    ring.rotation.x = -Math.PI / 2;
    scene.add(ring);

    let colors = H.colors();
    function heightOf(c) { return c.cat ? 0.35 : c.t == null ? FLAT : H0 + HMAX * Math.max(0, Math.min(1, c.t)); }
    function update() {
      colors = H.colors();
      for (let Z = 1; Z <= N; Z++) {
        const c = H.cell(Z), m = bars[Z];
        hTo[Z] = heightOf(c);
        m.material.color.set(c.color);
        m.material.transparent = c.noData || c.hidden;
        m.material.opacity = c.noData ? 0.55 : c.hidden ? 0.7 : 1;
        labels[Z].geometry = c.hidden ? qGeo : labels[Z].userData.geo;
      }
      requestRender();
    }
    function applyColors() {
      colors = H.colors();
      plateMat.color.set(colors.dark ? '#2a2d33' : '#dfe3e8');
      markMat.color.set(colors.accent); ringMat.color.set(colors.accent);
    }
    let animating = false;
    function step() {
      let moving = false;
      for (let Z = 1; Z <= N; Z++) {
        const d = hTo[Z] - hNow[Z];
        if (Math.abs(d) > 0.002) { hNow[Z] += d * 0.18; moving = true; } else hNow[Z] = hTo[Z];
        bars[Z].scale.y = hNow[Z];
        labels[Z].position.y = hNow[Z] + 0.01;
      }
      const s = H.selected(), b = bars[s];
      mark.position.set(b.position.x, hNow[s] + 0.55, b.position.z);
      ring.position.set(b.position.x, 0.012, b.position.z);
      const hd = H.hud();
      hudTL.textContent = hd.tl;
      hudTR.textContent = hd.tr;
      return moving;
    }

    // ---------- 點選 ----------
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    let down = null;
    canvas.addEventListener('pointerdown', function (e) { down = [e.clientX, e.clientY]; });
    canvas.addEventListener('pointerup', function (e) {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down[0], e.clientY - down[1]);
      down = null;
      if (moved > 6) return;
      const r = canvas.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(bars.slice(1), false)[0];
      if (hit) H.select(hit.object.userData.Z);
    });

    function fit(force) {
      const span = 21;
      const dist = (span * 0.5) / Math.tan(camera.fov * Math.PI / 360) / Math.min(1.35, camera.aspect);
      if (force) {
        controls.target.set(0, 0.8, 0.3);
        camera.position.copy(viewDir).multiplyScalar(dist).add(controls.target);
      }
      camera.updateProjectionMatrix();
      controls.update();
    }
    let vw = 0, raf = 0;
    function canvasHeight(w) { return w < 560 ? Math.round(Math.max(300, w * 0.9)) : 440; }
    function resize3() {
      const w = host.clientWidth;
      if (!w) return;
      const h = canvasHeight(w);
      canvas.style.height = h + 'px';
      vw = w;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      fit(false);
      requestRender();
    }
    function renderNow() {
      if (!api.active || document.hidden) return;
      const moved = controls.update();
      animating = step();
      renderer.render(scene, camera);
      if (moved || animating) requestRender();
    }
    function requestRender() {
      if (raf || !api.active) return;
      raf = requestAnimationFrame(function () { raf = 0; renderNow(); });
    }
    const ro = window.ResizeObserver ? new ResizeObserver(function () { if (host.clientWidth !== vw) resize3(); }) : null;
    if (ro) ro.observe(host); else window.addEventListener('resize', resize3);
    controls.addEventListener('change', requestRender);
    const onVisible = function () { if (!document.hidden) requestRender(); };
    document.addEventListener('visibilitychange', onVisible);
    canvas.addEventListener('webglcontextlost', function (ev) {
      ev.preventDefault();
      if (api.active) H.contextLost();
    });

    const api = {
      active: true,
      update: function () { if (api.active) update(); },
      onTheme: function () { applyColors(); drawAtlas(); atlasTex.needsUpdate = true; update(); },
      resetCamera: function () { fit(true); requestRender(); },
      dispose: function () {
        api.active = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        document.removeEventListener('visibilitychange', onVisible);
        controls.dispose();
        const mats = new Set(), geos = new Set();
        scene.traverse(function (o) {
          if (o.geometry) geos.add(o.geometry);
          if (o.userData && o.userData.geo) geos.add(o.userData.geo);
          if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { mats.add(m); });
        });
        geos.add(qGeo);
        geos.forEach(function (g) { g.dispose(); });
        mats.forEach(function (m) { m.dispose(); });
        atlasTex.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        canvas.remove(); hudTL.remove(); hudTR.remove(); hudBL.remove();
      }
    };

    applyColors();
    const w0 = host.clientWidth;
    if (w0) {
      const h0 = canvasHeight(w0);
      canvas.style.height = h0 + 'px';
      vw = w0;
      renderer.setSize(w0, h0, false);
      camera.aspect = w0 / h0;
    }
    fit(true);
    update();
    return api;
  }

  window.PT3D = { create: create };
})();
