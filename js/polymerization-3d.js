/*
 * polymerization-3d.js — 「加成聚合與縮合聚合」放大圖的 3D 立體檢視（可旋轉、縮放）
 *
 * three.js 由 polymerization.js 在切換到 3D 時才以 import() 動態載入，再傳進 Poly3D.create(lib, host)。
 * 這個檔案只「讀」頁面放大圖的示意分子（位置在半徑 1 的球內），不改變任何化學量；
 * 2D 與 3D 看的是同一批分子：單體／重複單位是球，鍵是圓柱，縮合聚合沒反應的端基是小球，水分子是 O＋2 個 H。
 */
(function () {
  'use strict';
  const MAXB = 160;            // 珠子（單體或重複單位）
  const MAXS = 720;            // 小球：端基、水分子的原子、自由基記號
  const MAXL = 200;            // 鍵
  const MAXF = 40;             // 閃光
  const RB = 0.042 / 0.95;     // 珠子半徑（與 2D 相同：放大圖半徑的 0.042）
  const SC = 1;                // 球內座標 → 場景座標

  function create(lib, H) {
    const THREE = lib.THREE;
    const T = H.T, host = H.host;

    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('放大圖的 3D 立體檢視：單體、聚合物鏈與水分子（拖曳旋轉、雙指或滾輪縮放）',
      '3D view of the magnified sketch: monomers, polymer chains and water molecules (drag to rotate, pinch or scroll to zoom)'));
    canvas.setAttribute('role', 'img');
    host.appendChild(canvas);
    const hudTL = document.createElement('div'), hudTR = document.createElement('div'), hudBL = document.createElement('div');
    hudTL.className = 'r3-hud tl'; hudTR.className = 'r3-hud tr'; hudBL.className = 'r3-hud bl';
    [hudTL, hudTR, hudBL].forEach(function (d) { d.setAttribute('aria-hidden', 'true'); host.appendChild(d); });
    hudBL.textContent = T('拖曳旋轉・滾輪或雙指縮放', 'Drag to rotate · scroll or pinch to zoom');

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
    const camera = new THREE.PerspectiveCamera(32, 1.4, 0.1, 50);
    const viewDir = new THREE.Vector3(0.25, 0.35, 1).normalize();
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.minDistance = 1.6;
    controls.maxDistance = 12;
    controls.enablePan = false;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 1.9);
    sun.position.set(-4, 8, 6);
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0xffffff, 0.5);
    rim.position.set(6, 2, -6);
    scene.add(rim);

    // ---------- 液滴的邊界（半透明球殼）與底下的淡影 ----------
    const shellMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, roughness: 0.1, metalness: 0, depthWrite: false, side: THREE.BackSide });
    const shell = new THREE.Mesh(new THREE.SphereGeometry(SC * 0.98, 48, 32), shellMat);
    shell.renderOrder = 2;
    scene.add(shell);
    // 柔和的接觸陰影（中心濃、邊緣淡）
    const sc2 = document.createElement('canvas');
    sc2.width = sc2.height = 128;
    const sg2 = sc2.getContext('2d'), sgr = sg2.createRadialGradient(64, 64, 0, 64, 64, 64);
    sgr.addColorStop(0, 'rgba(0,0,0,1)'); sgr.addColorStop(0.55, 'rgba(0,0,0,0.45)'); sgr.addColorStop(1, 'rgba(0,0,0,0)');
    sg2.fillStyle = sgr; sg2.fillRect(0, 0, 128, 128);
    const shadowTex = new THREE.CanvasTexture(sc2);
    const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, color: 0x000000, transparent: true, opacity: 0.12, depthWrite: false });
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(SC * 1.7, SC * 1.7), shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -SC * 1.08;
    scene.add(shadow);

    // ---------- 分子（InstancedMesh） ----------
    const sphGeo = new THREE.SphereGeometry(1, 20, 14);
    const beadMat = new THREE.MeshStandardMaterial({ roughness: 0.38, metalness: 0.05 });
    const beads = new THREE.InstancedMesh(sphGeo, beadMat, MAXB);
    beads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(beads);
    const smallMat = new THREE.MeshStandardMaterial({ roughness: 0.32, metalness: 0.02 });
    const small = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 10), smallMat, MAXS);
    small.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(small);
    const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 12, 1);
    const bondMat = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.05 });
    const bonds = new THREE.InstancedMesh(cylGeo, bondMat, MAXL);
    bonds.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(bonds);
    // 先設一次顏色，確保 instanceColor 存在
    const tmpC = new THREE.Color(0x888888);
    for (let i = 0; i < MAXB; i++) beads.setColorAt(i, tmpC);
    for (let i = 0; i < MAXS; i++) small.setColorAt(i, tmpC);
    for (let i = 0; i < MAXL; i++) bonds.setColorAt(i, tmpC);

    // ---------- 閃光（成鍵、終止、水解）與自由基光暈 ----------
    const gc = document.createElement('canvas');
    gc.width = gc.height = 64;
    const gctx = gc.getContext('2d');
    const gg = gctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gg.addColorStop(0, 'rgba(255,255,255,1)'); gg.addColorStop(0.35, 'rgba(255,255,255,0.55)'); gg.addColorStop(1, 'rgba(255,255,255,0)');
    gctx.fillStyle = gg; gctx.fillRect(0, 0, 64, 64);
    const glowTex = new THREE.CanvasTexture(gc);
    const sprites = [];
    for (let i = 0; i < MAXF; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      sp.visible = false;
      scene.add(sp);
      sprites.push(sp);
    }

    let colors = H.colors();
    function applyColors() {
      colors = H.colors();
      const dk = colors.c.dark;
      shellMat.opacity = dk ? 0.07 : 0.1;
      shellMat.color.set(dk ? 0xbfd3ff : 0xffffff);
      shadowMat.opacity = dk ? 0.35 : 0.16;
    }

    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pv = new THREE.Vector3(), sv = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3(), a3 = new THREE.Vector3(), b3 = new THREE.Vector3();
    const qI = new THREE.Quaternion(), WHITE = new THREE.Color(0xffffff);
    function putSmall(k, x, y, z, r, color) {
      if (k >= MAXS) return k;
      pv.set(x, y, z); sv.set(r, r, r);
      m4.compose(pv, qI, sv);
      small.setMatrixAt(k, m4);
      tmpC.set(color);
      small.setColorAt(k, tmpC);
      return k + 1;
    }
    function update() {
      colors = H.colors();       // 換模式或聚合物時顏色會變
      const V = H.vis, B = V.beads, kind = H.kind(), u = colors.u, c = colors.c;
      const live = H.live();
      // 珠子
      let n = 0, ns = 0;
      for (let i = 0; i < B.length && n < MAXB; i++) {
        const b = B[i];
        let colr, r = RB;
        if (kind === 'add') { colr = b.k === 'm' ? u.m : u.p; if (b.k === 'm') r = RB * 0.86; }
        else colr = b.k === 'A' ? u.A : b.k === 'B' ? u.B : u.X;
        pv.set(b.x * SC, b.y * SC, b.z * SC); sv.set(r, r, r);
        m4.compose(pv, qI, sv);
        beads.setMatrixAt(n, m4);
        tmpC.set(colr);
        if (kind === 'add') { if (b.k === 'm') tmpC.lerp(WHITE, 0.45); else tmpC.multiplyScalar(0.8); }   // 單體淡、鏈深
        beads.setColorAt(n, tmpC);
        n++;
        // 縮合聚合：沒反應的端基（沿分子的方向 ±d）
        if (kind === 'cond') {
          const sx = Math.sin(b.ph), dx = sx * Math.cos(b.th), dy = sx * Math.sin(b.th), dz = Math.cos(b.ph);
          for (let s = 0; s < 2; s++) {
            if (b.e[s] >= 0) continue;
            const sg = s === 0 ? 1 : -1, gt = b.k === 'A' ? 'A' : b.k === 'B' ? 'B' : (s === 0 ? 'A' : 'B');
            ns = putSmall(ns, (b.x + sg * dx * RB) * SC, (b.y + sg * dy * RB) * SC, (b.z + sg * dz * RB) * SC, RB * 0.46, gt === 'A' ? u.nA : u.nB);
          }
        } else if (live[i]) {
          ns = putSmall(ns, (b.x + RB * 0.55) * SC, (b.y + RB * 0.55) * SC, (b.z + RB * 0.55) * SC, RB * 0.32, c.rad);
        }
      }
      beads.count = n;
      // 水分子：O 在中心，兩個 H 夾約 104.5°
      const W = V.water;
      for (let i = 0; i < W.length; i++) {
        const w = W[i], ro = RB * 0.55, rh = ro * 0.55, d = ro * 1.05;
        ns = putSmall(ns, w.x * SC, w.y * SC, w.z * SC, ro, c.O);
        const h1 = w.th + 0.91, h2 = w.th - 0.91 + Math.PI;
        ns = putSmall(ns, (w.x + Math.cos(h1) * d) * SC, (w.y + Math.sin(h1) * d) * SC, w.z * SC, rh, c.H);
        ns = putSmall(ns, (w.x + Math.cos(h2) * d) * SC, (w.y + Math.sin(h2) * d) * SC, w.z * SC, rh, c.H);
      }
      small.count = ns;
      // 鍵
      let nl = 0;
      const bcol = kind === 'add' ? u.p : mixHex(u.A, u.B);
      tmpC.set(bcol).multiplyScalar(0.8);
      V.bonds.forEach(function (bd) {
        if (nl >= MAXL) return;
        const p = B[bd[0]], s = B[bd[1]];
        a3.set(p.x * SC, p.y * SC, p.z * SC); b3.set(s.x * SC, s.y * SC, s.z * SC);
        dir.subVectors(b3, a3);
        const len = dir.length();
        if (len < 1e-6) return;
        q.setFromUnitVectors(up, dir.multiplyScalar(1 / len));
        pv.addVectors(a3, b3).multiplyScalar(0.5);
        sv.set(RB * 0.38, len, RB * 0.38);
        m4.compose(pv, q, sv);
        bonds.setMatrixAt(nl, m4);
        bonds.setColorAt(nl, tmpC);
        nl++;
      });
      bonds.count = nl;
      beads.instanceMatrix.needsUpdate = true; small.instanceMatrix.needsUpdate = true; bonds.instanceMatrix.needsUpdate = true;
      if (beads.instanceColor) beads.instanceColor.needsUpdate = true;
      if (small.instanceColor) small.instanceColor.needsUpdate = true;
      if (bonds.instanceColor) bonds.instanceColor.needsUpdate = true;
      // 閃光
      const fl = V.flashes;
      for (let k = 0; k < MAXF; k++) {
        const sp = sprites[k], f = fl[fl.length - 1 - k];
        if (!f) { sp.visible = false; continue; }
        sp.visible = true;
        sp.position.set(f.x * SC, f.y * SC, f.z * SC);
        sp.material.color.set(f.kind === 'cut' ? c.water : f.kind === 'link' ? c.accent : c.rad);
        sp.material.opacity = 0.9 * (1 - f.u);
        sp.scale.setScalar(RB * (3 + 6 * f.u));
      }
      const hd = H.hud();
      hudTL.textContent = hd.tl;
      hudTR.textContent = hd.tr;
    }
    function mixHex(a, b) { return new THREE.Color(a).lerp(new THREE.Color(b), 0.5).getStyle(); }

    function fit(force) {
      const dist = 1.45 / Math.tan(camera.fov * Math.PI / 360) / Math.min(1.1, camera.aspect);
      if (force) {
        controls.target.set(0, 0, 0);
        camera.position.copy(viewDir).multiplyScalar(dist);
      }
      camera.updateProjectionMatrix();
      controls.update();
    }
    let vw = 0, raf = 0;
    function canvasHeight(w) { return w < 560 ? Math.round(Math.max(320, w * 0.95)) : 420; }
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
      update();
      renderer.render(scene, camera);
      if (moved && !H.running()) requestRender();
    }
    function requestRender() {
      if (raf || !api.active) return;
      raf = requestAnimationFrame(function () { raf = 0; if (!H.running()) renderNow(); });
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
      frame: function () { if (api.active) renderNow(); },
      onTheme: function () { applyColors(); requestRender(); },
      resetCamera: function () { fit(true); requestRender(); },
      dispose: function () {
        api.active = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        document.removeEventListener('visibilitychange', onVisible);
        controls.dispose();
        const mats = new Set();
        scene.traverse(function (o) {
          if (o.geometry) o.geometry.dispose();
          if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { mats.add(m); });
        });
        mats.forEach(function (m) { m.dispose(); });
        glowTex.dispose();
        shadowTex.dispose();
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
    return api;
  }

  window.Poly3D = { create: create };
})();
