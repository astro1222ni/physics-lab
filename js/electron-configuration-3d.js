/*
 * electron-configuration-3d.js — 「電子組態」的 3D 能階階梯（可旋轉、縮放）
 *
 * three.js 由 electron-configuration.js 在切換到 3D 時才以 import() 動態載入，再傳進 EC3D.create(lib, host)。
 * 這個檔案只「讀」頁面的軌域圖（host.boxes()），不改變任何組態。
 *
 * 場景：地面上 n（前 → 後，1 到 7）× l（左 → 右，s p d f）的格子，每個副層是一根柱子：
 *   柱高 = 0.35 + 0.8 (n + l − 1) + 0.16 n（同一個 n + l 是一層平台，同一層裡 n 大的稍高一點），
 *   所以從上面看是課本的對角線圖，從側面看是填入順序的階梯。高度只代表填入順序，不是真實能量。
 *   柱頂有 2l + 1 個軌域格；電子是站在格子上的箭頭（↑ 藍、↓ 紅，與 2D 相同）。
 *   半透明的「水面」停在目前最高（最後填入）的那根有電子的柱頂：照構築原理，水面以下的柱子都該填滿；
 *   例外原子與陽離子會看到水面下有沒填滿的柱子。
 */
(function () {
  'use strict';
  const LX = [0, 1.8, 4.6, 8.4];     // s、p、d、f 柱子中心的 x
  const SLOT = 0.5, DEPTH = 0.95, DZ = 1.3, XC = 4.95;
  function height(n, l) { return 0.35 + 0.8 * (n + l - 1) + 0.16 * n; }
  function px(l) { return LX[l] - XC; }
  function pz(n) { return (4 - n) * DZ; }

  function create(lib, H) {
    const THREE = lib.THREE;
    const T = H.T, host = H.host, SUB = H.SUB, NS = SUB.length;

    const canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', T('3D 能階階梯：每根柱子是一個副層，柱子越高越晚填；柱頂的箭頭是電子（拖曳旋轉、雙指或滾輪縮放）',
      '3D energy staircase: each pillar is a subshell, taller pillars fill later; the arrows on top are electrons (drag to rotate, pinch or scroll to zoom)'));
    host.appendChild(canvas);
    const hudTL = document.createElement('div'), hudTR = document.createElement('div'), hudBL = document.createElement('div');
    hudTL.className = 'r3-hud tl'; hudTR.className = 'r3-hud tr'; hudBL.className = 'r3-hud bl';
    [hudTL, hudTR, hudBL].forEach(function (d) { d.setAttribute('aria-hidden', 'true'); host.appendChild(d); });
    hudBL.textContent = T('柱高＝填入順序（n + l 規則）・半透明水面＝填到哪裡・拖曳旋轉', 'Height = filling order (n + l rule) · translucent water = how far it is filled · drag to rotate');

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: 'default' });
    } catch (e) {
      canvas.remove(); hudTL.remove(); hudTR.remove(); hudBL.remove();
      throw e;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1.5, 0.3, 300);
    const viewDir = new THREE.Vector3(-0.42, 0.62, 1).normalize();
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.minDistance = 5;
    controls.maxDistance = 60;
    controls.enablePan = false;
    controls.maxPolarAngle = Math.PI * 0.495;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 1.25));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(-7, 14, 9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const sc = sun.shadow.camera; sc.left = -10; sc.right = 10; sc.top = 10; sc.bottom = -10; sc.near = 1; sc.far = 40;
    sun.shadow.bias = -0.0008;
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0xffffff, 0.45);
    rim.position.set(10, 6, -10);
    scene.add(rim);

    // ---------- 地面 ----------
    const floorMat = new THREE.MeshStandardMaterial({ color: 0xdfe3e8, roughness: 0.9, metalness: 0 });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(13.2, 0.1, 10.6), floorMat);
    floor.position.set(0, -0.05, 0);
    floor.receiveShadow = true;
    scene.add(floor);

    // ---------- 文字貼圖 ----------
    const sprites = [];
    function makeLabel(w, h) {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const tex = new THREE.CanvasTexture(c);
      tex.anisotropy = 4;
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
      const sp = new THREE.Sprite(mat);
      sp.userData = { c: c, tex: tex, text: null };
      sprites.push(sp);
      return sp;
    }
    function paint(sp, text, sub, color) {
      const key = text + '|' + sub + '|' + color;
      if (sp.userData.text === key) return;
      sp.userData.text = key;
      const c = sp.userData.c, g = c.getContext('2d');
      g.clearRect(0, 0, c.width, c.height);
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      const big = Math.round(c.height * (sub ? 0.5 : 0.7));
      g.font = '700 ' + big + 'px system-ui, sans-serif';
      const y1 = sub ? c.height * 0.36 : c.height / 2;
      g.lineWidth = Math.max(4, big * 0.22); g.strokeStyle = colors.dark ? 'rgba(20,22,28,0.9)' : 'rgba(255,255,255,0.92)';
      g.strokeText(text, c.width / 2, y1);
      g.fillStyle = color; g.fillText(text, c.width / 2, y1);
      if (sub) {
        g.font = '600 ' + Math.round(c.height * 0.3) + 'px system-ui, sans-serif';
        g.lineWidth = 5; g.strokeText(sub, c.width / 2, c.height * 0.78);
        g.fillStyle = colors.muted; g.fillText(sub, c.width / 2, c.height * 0.78);
      }
      sp.userData.tex.needsUpdate = true;
    }

    // ---------- 柱子、軌域格、標籤 ----------
    let colors = H.colors();
    const pillarGeo = new THREE.BoxGeometry(1, 1, DEPTH);
    pillarGeo.translate(0, 0.5, 0);
    const slotGeo = new THREE.BoxGeometry(SLOT - 0.08, 0.05, DEPTH - 0.25);
    const slotMat = new THREE.MeshStandardMaterial({ color: 0xf4f5f7, roughness: 0.5, metalness: 0 });
    const pillars = [], labels = [], tops = [];
    SUB.forEach(function (s) {
      const h = height(s.n, s.l), w = s.m * SLOT + 0.2;
      const m = new THREE.Mesh(pillarGeo, new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.55, metalness: 0.05 }));
      m.scale.set(w, h, 1);
      m.position.set(px(s.l), 0, pz(s.n));
      m.castShadow = true; m.receiveShadow = true;
      scene.add(m); pillars.push(m); tops.push(h);
      for (let o = 0; o < s.m; o++) {
        const t = new THREE.Mesh(slotGeo, slotMat);
        t.position.set(px(s.l) + (o - (s.m - 1) / 2) * SLOT, h + 0.025, pz(s.n));
        t.receiveShadow = true;
        scene.add(t);
      }
      const lab = makeLabel(256, 128);
      lab.position.set(px(s.l), h + 0.78, pz(s.n));
      lab.scale.set(0.95, 0.475, 1);
      scene.add(lab); labels.push(lab);
    });
    // 軸的標籤：s p d f（前方）、n = 1…7（左側）
    const axisL = [], axisN = [];
    for (let l = 0; l < 4; l++) {
      const sp = makeLabel(128, 128); sp.position.set(px(l), 0.25, pz(1) + 1.25); sp.scale.set(0.7, 0.7, 1); scene.add(sp); axisL.push(sp);
    }
    for (let n = 1; n <= 7; n++) {
      const sp = makeLabel(256, 128); sp.position.set(px(0) - 1.35, 0.25, pz(n)); sp.scale.set(1.0, 0.5, 1); scene.add(sp); axisN.push(sp);
    }

    // ---------- 電子（站在格子上的箭頭） ----------
    const shaftGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.26, 12); shaftGeo.translate(0, 0.13, 0);
    const headGeo = new THREE.ConeGeometry(0.095, 0.17, 18); headGeo.translate(0, 0.26 + 0.085, 0);
    const upMat = new THREE.MeshStandardMaterial({ color: 0x2f6fd0, roughness: 0.35, metalness: 0.1 });
    const dnMat = new THREE.MeshStandardMaterial({ color: 0xd1453b, roughness: 0.35, metalness: 0.1 });
    const electrons = new Map();   // 's,o,spin' → group
    function electronPos(s, o, spin) {
      const S = SUB[s];
      return [px(S.l) + (o - (S.m - 1) / 2) * SLOT + (spin ? 0.11 : -0.11), tops[s] + 0.05, pz(S.n)];
    }
    function addElectron(s, o, spin, drop) {
      const g = new THREE.Group();
      const mat = spin ? dnMat : upMat;
      const a = new THREE.Mesh(shaftGeo, mat), b = new THREE.Mesh(headGeo, mat);
      a.castShadow = b.castShadow = true;
      g.add(a); g.add(b);
      if (spin) g.rotation.x = Math.PI;
      const p = electronPos(s, o, spin);
      g.userData = { y: p[1] + (spin ? 0.43 : 0), off: drop ? 1.6 : 0 };
      g.position.set(p[0], g.userData.y + g.userData.off, p[2]);
      scene.add(g);
      return g;
    }

    // ---------- 水面 ----------
    const waterMat = new THREE.MeshStandardMaterial({ color: 0x2f6fd0, transparent: true, opacity: 0.16, roughness: 0.2, metalness: 0, depthWrite: false, side: THREE.DoubleSide });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(13.2, 10.6), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.renderOrder = 3;
    scene.add(water);
    let waterY = 0, waterTo = 0;

    // ---------- 更新 ----------
    let first = true;
    function update() {
      colors = H.colors();
      const boxes = H.boxes();
      const want = new Set();
      let hi = -1;
      boxes.forEach(function (row, s) {
        let k = 0;
        row.forEach(function (e, o) { [0, 1].forEach(function (spin) { if (e[spin]) { want.add(s + ',' + o + ',' + spin); k++; } }); });
        if (k) hi = s;
        const S = SUB[s];
        const full = k === S.cap;
        const base = colors.block[S.l === 0 ? 's' : S.l === 1 ? 'p' : S.l === 2 ? 'd' : 'f'];
        const mat = pillars[s].material;
        mat.color.set(base);
        if (!k) mat.color.lerp(new THREE.Color(colors.dark ? 0x3a3d44 : 0xd6d9de), 0.6);
        paint(labels[s], S.label, k + '/' + S.cap, full ? colors.text : k ? colors.accent : colors.muted);
      });
      electrons.forEach(function (g, key) {
        if (!want.has(key)) { scene.remove(g); electrons.delete(key); }
      });
      want.forEach(function (key) {
        if (electrons.has(key)) return;
        const a = key.split(',').map(Number);
        electrons.set(key, addElectron(a[0], a[1], a[2], !first && !reduced));
      });
      first = false;
      waterTo = hi < 0 ? 0.001 : tops[hi] + 0.03;
      water.visible = hi >= 0;
      const hd = H.hud();
      hudTL.innerHTML = hd.tl;
      hudTR.innerHTML = hd.tr;
      requestRender();
    }
    function applyColors() {
      colors = H.colors();
      floorMat.color.set(colors.dark ? '#2a2d33' : '#e3e6ea');
      slotMat.color.set(colors.dark ? '#4a4f58' : '#f6f7f9');
      upMat.color.set(colors.up); dnMat.color.set(colors.down);
      waterMat.color.set(colors.accent);
      waterMat.opacity = colors.dark ? 0.22 : 0.16;
      ['s', 'p', 'd', 'f'].forEach(function (b, l) { paint(axisL[l], b, '', colors.text); });
      axisN.forEach(function (sp, k) { paint(sp, 'n = ' + (k + 1), '', colors.muted); });
      labels.forEach(function (sp) { sp.userData.text = null; });
    }
    const reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    function step() {
      let moving = false;
      electrons.forEach(function (g) {
        const u = g.userData;
        if (u.off > 0.002) { u.off *= 0.78; moving = true; } else u.off = 0;
        g.position.y = u.y + u.off;
      });
      const d = waterTo - waterY;
      if (Math.abs(d) > 0.003 && !reduced) { waterY += d * 0.15; moving = true; } else waterY = waterTo;
      water.position.y = waterY;
      return moving;
    }

    function fit(force) {
      const span = 17.5;
      const dist = (span * 0.5) / Math.tan(camera.fov * Math.PI / 360) / Math.min(1.25, camera.aspect);
      if (force) {
        controls.target.set(0, 3.0, -0.3);
        camera.position.copy(viewDir).multiplyScalar(dist).add(controls.target);
      }
      camera.updateProjectionMatrix();
      controls.update();
    }
    let vw = 0, raf = 0;
    function canvasHeight(w) { return w < 560 ? Math.round(Math.max(320, w * 0.95)) : 460; }
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
      const animating = step();
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
      onTheme: function () { applyColors(); update(); },
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
          if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { mats.add(m); });
        });
        [shaftGeo, headGeo, pillarGeo, slotGeo].forEach(function (g) { geos.add(g); });
        [upMat, dnMat, slotMat].forEach(function (m) { mats.add(m); });
        geos.forEach(function (g) { g.dispose(); });
        mats.forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); });
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
    waterY = waterTo; water.position.y = waterY;
    return api;
  }

  window.EC3D = { create: create };
})();
