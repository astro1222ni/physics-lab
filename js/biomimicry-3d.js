/*
 * biomimicry-3d.js — 「仿生學」第一部分（蓮葉效應）的 3D 微結構（three.js）
 *
 * 由 js/biomimicry.js 在使用者按「3D 微結構」時才載入（three.js 也是那時才以 import() 載入）；切回 2D 時整個釋放。
 * 用法：window.BM3D.create({ THREE, OrbitControls }, 容器, bridge) → { active, frame, onShow, onTheme, resetCamera, rebuild, resize, busy, dispose }
 *
 * 畫的是目前的表面（bridge.surface()）與最近一顆水珠的狀態（bridge.state()）：
 *   方柱陣列按比例（一個週期 = 1 格；柱太高時壓縮，HUD 會說明）；水珠是球冠，接觸角照模擬，
 *   Cassie 時切在柱頂、底下是空氣，Wenzel 時切在底面、柱子泡在水裡。水珠比真實的小很多（真的約大上百倍）。
 */
(function () {
  'use strict';
  const NP = 18;          // 每邊幾根柱子
  const RS = 4.2;         // 水珠的球半徑（週期數，示意；接觸半徑 = RS·sin θ）
  const RC = 5.2;         // 攤開的水膜半徑（週期數，示意）
  const HMAX = 4;         // 柱高最多畫幾個週期

  function create(lib, host, BR) {
    const THREE = lib.THREE;
    const T = BR.T, D = BR.D;
    let C = BR.colors();

    const wrap = document.createElement('div');
    wrap.className = 'bm3-wrap';
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('表面微結構的 3D 圖：方柱陣列與上面的水珠（可拖曳旋轉、縮放）', '3D view of the surface microstructure: an array of square pillars with a water drop on it (drag to rotate, pinch or scroll to zoom)'));
    wrap.appendChild(canvas);
    const hud = document.createElement('div');
    hud.className = 'bm3-hud';
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
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.localClippingEnabled = true;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1.5, 0.1, 300);
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.rotateSpeed = 0.85;
    controls.enablePan = false;
    controls.minDistance = 6;
    controls.maxDistance = 70;
    controls.maxPolarAngle = Math.PI * 0.49;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x50604a, 1.0));
    const key = new THREE.DirectionalLight(0xffffff, 1.8);
    key.position.set(-10, 18, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const sc = key.shadow.camera;
    sc.left = -16; sc.right = 16; sc.top = 16; sc.bottom = -16; sc.near = 1; sc.far = 60;
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.02;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xbfdcff, 0.6);
    rim.position.set(12, 6, -10);
    scene.add(rim);

    function col(s) { return new THREE.Color(s); }
    function disposeObject(obj) {
      obj.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); });
      });
    }

    let world = null, builtKey = '';
    function keyOf(sf, st) {
      return [sf.a, sf.b, sf.h, st.mode, Math.round(st.theta * 10), D.dark, C['bm-water']].join('|');
    }
    function build() {
      const sf = BR.surface(), st = BR.state();
      const k = keyOf(sf, st);
      if (k === builtKey && world) return;
      builtKey = k;
      if (world) { scene.remove(world); disposeObject(world); }
      world = new THREE.Group();
      scene.add(world);
      const smooth = st.smooth;
      const p = sf.a + sf.b, aa = smooth ? 0 : sf.a / p;
      const hTrue = smooth ? 0 : sf.h / p, hh = Math.min(HMAX, hTrue);
      const half = NP / 2;
      // 底板
      const baseMat = new THREE.MeshStandardMaterial({ color: col(C['bm-pillar']).multiplyScalar(0.8), roughness: 0.85 });
      const base = new THREE.Mesh(new THREE.BoxGeometry(NP + 1, 0.6, NP + 1), baseMat);
      base.position.y = -0.3;
      base.receiveShadow = true;
      world.add(base);
      // 柱子
      if (!smooth && hh > 0) {
        const geo = new THREE.BoxGeometry(aa, hh, aa);
        const mat = new THREE.MeshStandardMaterial({ color: col(C['bm-pillar']), roughness: 0.6 });
        const inst = new THREE.InstancedMesh(geo, mat, NP * NP);
        const m4 = new THREE.Matrix4();
        let n = 0;
        for (let i = 0; i < NP; i++) for (let j = 0; j < NP; j++) {
          m4.makeTranslation(i - half + 0.5, hh / 2, j - half + 0.5);
          inst.setMatrixAt(n++, m4);
        }
        inst.castShadow = true; inst.receiveShadow = true;
        world.add(inst);
      }
      // 灰塵：落在水珠外面的柱頂上
      const dustMat = new THREE.MeshStandardMaterial({ color: col(C['bm-dirt']), roughness: 0.9 });
      const dustGeo = new THREE.IcosahedronGeometry(0.22, 1);
      let s = 9;
      const rnd = function () { s = (s * 16807) % 2147483647; return s / 2147483647; };
      for (let k2 = 0; k2 < 14; k2++) {
        const x = (rnd() - 0.5) * (NP - 1), z = (rnd() - 0.5) * (NP - 1);
        if (x * x + z * z < (RS + 1) * (RS + 1)) continue;
        const m = new THREE.Mesh(dustGeo, dustMat);
        m.position.set(x, (smooth ? 0 : hh) + 0.2, z);
        m.scale.setScalar(0.7 + rnd() * 0.8);
        m.castShadow = true;
        world.add(m);
      }
      // 水
      const waterCol = col(C['bm-water']);
      const wmat = new THREE.MeshPhongMaterial({
        color: waterCol, specular: 0xffffff, shininess: 140,
        transparent: true, opacity: D.dark ? 0.55 : 0.45, side: THREE.DoubleSide, depthWrite: false
      });
      if (st.mode === 'spread') {
        const film = new THREE.Mesh(new THREE.CylinderGeometry(RC * 1.6, RC * 1.6, Math.max(0.15, hh + 0.12), 64), wmat);
        film.position.y = Math.max(0.15, hh + 0.12) / 2;
        world.add(film);
      } else {
        const th = Math.max(5, st.theta) * Math.PI / 180;
        // 同樣體積的水珠：接觸角大，球冠就高而窄；這裡固定球半徑、只示意形狀
        const R = st.theta > 90 ? RS : Math.min(RC * 1.3 / Math.sin(th), 3 * RS);
        const rc = R * Math.sin(th);
        const y0 = st.mode === 'cassie' ? hh : 0;   // 切在哪一層
        const yc = y0 - R * Math.cos(th);
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y0);
        wmat.clippingPlanes = [plane];
        const sph = new THREE.Mesh(new THREE.SphereGeometry(R, 96, 64), wmat);
        sph.position.y = yc;
        sph.renderOrder = 10;
        world.add(sph);
        // 底面（看得到水底）
        const disc = new THREE.Mesh(new THREE.CircleGeometry(rc, 64), wmat.clone());
        disc.material.clippingPlanes = [];
        disc.rotation.x = -Math.PI / 2;
        disc.position.y = y0 + 0.01;
        disc.renderOrder = 9;
        world.add(disc);
        // 影子用的不透明替身（看不到）
        const shadowMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
        shadowMat.clippingPlanes = [plane];
        shadowMat.clipShadows = true;
        const ghost = new THREE.Mesh(new THREE.SphereGeometry(R, 48, 32), shadowMat);
        ghost.position.y = yc;
        ghost.castShadow = true;
        world.add(ghost);
        if (st.mode === 'cassie') {
          // 柱頂與水之間的空氣層，淡淡畫出
          const air = new THREE.Mesh(new THREE.CylinderGeometry(rc, rc, Math.max(0.05, hh - 0.02), 64, 1, true),
            new THREE.MeshBasicMaterial({ color: col(C['bm-air']), transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
          air.position.y = hh / 2;
          world.add(air);
        }
      }
      // HUD
      const mode = st.mode === 'cassie' ? T('Cassie：架在柱頂，底下是空氣', 'Cassie: on the tips, air below') :
        st.mode === 'wenzel' ? T('Wenzel：水填滿柱子之間', 'Wenzel: water fills between the pillars') :
          st.mode === 'spread' ? T('攤成一層水膜', 'spread into a film') : T('平面', 'smooth surface');
      setHud('t', mode);
      setHud('v', T('接觸角 ', 'contact angle ') + BR.num(st.theta, 1) + '°' + (smooth ? '' : T('　柱 a ', '   pillars a ') + BR.num(sf.a, 1) + ' / b ' + BR.num(sf.b, 1) + ' / h ' + BR.num(sf.h, 1) + ' µm'));
      setHud('note', (hTrue > HMAX ? T('柱高壓縮成 ' + HMAX + ' 個週期；', 'pillar height squeezed to ' + HMAX + ' periods; ') : '') + T('柱子按比例，水珠比真的小很多', 'pillars to scale; the drop is drawn far smaller than real'));
    }

    // ---------- 相機 ----------
    let lastAspect = 0, narrow = false, ch = 420;
    function sizeOf(w) { return w < 560 ? 460 : 470; }
    function resetCamera() {
      const dist = narrow ? 38 : 31;
      const el = 30 * Math.PI / 180, az = 38 * Math.PI / 180;
      controls.target.set(0, 3, 0);
      camera.position.set(Math.sin(az) * Math.cos(el) * dist, 3 + Math.sin(el) * dist, Math.cos(az) * Math.cos(el) * dist);
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
      ch = h;
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
    const w0 = wrap.clientWidth;
    if (w0) {
      ch = sizeOf(w0); narrow = w0 < 560;
      canvas.style.height = ch + 'px';
      renderer.setSize(w0, ch, false);
      camera.aspect = w0 / ch;
      camera.updateProjectionMatrix();
      lastAspect = camera.aspect;
    }
    resetCamera();
    build();
    renderNow();
    return api;
  }
  window.BM3D = { create: create };
})();
