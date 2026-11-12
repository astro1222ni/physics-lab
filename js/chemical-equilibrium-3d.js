/*
 * chemical-equilibrium-3d.js — 「化學平衡與勒沙特列原理」的 3D 立體檢視（可旋轉、縮放）
 *
 * three.js 由 chemical-equilibrium.js 在切換到 3D 時才以 import() 動態載入，再傳進 Eq3D.create(lib, host)。
 * 這個檔案只「讀」頁面的狀態（分子示意的位置、氣體顏色、體積比例、溫度），不改變任何化學量；
 * 2D 與 3D 看的是同一批分子。
 * 場景：注射筒沿 x 軸橫放，筒身半徑 1、全長 6（對應最大體積），針頭在左、活塞在右。
 */
(function () {
  'use strict';
  const MAXA = 250 * 6;   // 原子數上限（分子 250 個 × 最多 6 個原子）
  const FL = 60;
  const RB = 1, LB = 6, X0 = -LB / 2;

  function create(lib, H) {
    const THREE = lib.THREE;
    const T = H.T, host = H.host;

    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('注射筒的 3D 立體檢視：玻璃筒裡的分子、活塞與水浴（拖曳旋轉、雙指或滾輪縮放）',
      '3D view of the syringe: the molecules in the glass barrel, the piston and the water bath (drag to rotate, pinch or scroll to zoom)'));
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
    const camera = new THREE.PerspectiveCamera(30, 1.5, 0.3, 200);
    const viewDir = new THREE.Vector3(0.18, 0.42, 1).normalize();
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.minDistance = 4;
    controls.maxDistance = 40;
    controls.enablePan = false;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 1.9);
    sun.position.set(-6, 12, 9);
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0xffffff, 0.5);
    rim.position.set(10, 3, -9);
    scene.add(rim);

    let colors = H.colors();
    const C = function (c) { return new THREE.Color(c || '#888888'); };
    const axisX = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0));

    // ---------- 水浴（外圍半透明圓筒） ----------
    const bathMat = new THREE.MeshStandardMaterial({ color: 0x888888, transparent: true, opacity: 0.16, roughness: 0.2, depthWrite: false, side: THREE.DoubleSide });
    const bath = new THREE.Mesh(new THREE.CylinderGeometry(RB * 1.32, RB * 1.32, LB + 0.3, 48, 1, true), bathMat);
    bath.quaternion.copy(axisX);
    bath.renderOrder = 3;
    scene.add(bath);
    const bathCapMat = bathMat.clone();
    [-1, 1].forEach(function (s) {
      const cap = new THREE.Mesh(new THREE.RingGeometry(RB * 1.02, RB * 1.32, 48), bathCapMat);
      cap.rotation.y = Math.PI / 2;
      cap.position.x = s * (LB + 0.3) / 2;
      cap.renderOrder = 3;
      scene.add(cap);
    });
    // ---------- 玻璃筒身 ----------
    const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0, depthWrite: false, side: THREE.DoubleSide });
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(RB, RB, LB, 48, 1, true), glassMat);
    glass.quaternion.copy(axisX);
    glass.renderOrder = 2;
    scene.add(glass);
    // 刻度環
    const tickMat = new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.6 });
    for (let k = 1; k < 10; k++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(RB * 1.004, 0.008, 4, 48, Math.PI * 0.5), tickMat);
      ring.rotation.y = Math.PI / 2;
      ring.rotation.x = Math.PI * 0.25;
      ring.position.x = X0 + LB * k / 10;
      scene.add(ring);
    }
    // 筒口凸緣、針頭
    const metalMat = new THREE.MeshStandardMaterial({ color: 0xc9d0d8, roughness: 0.35, metalness: 0.6 });
    const flange = new THREE.Mesh(new THREE.CylinderGeometry(RB * 1.55, RB * 1.55, 0.08, 40), new THREE.MeshStandardMaterial({ color: 0xb8c0c8, transparent: true, opacity: 0.55, roughness: 0.2 }));
    flange.quaternion.copy(axisX);
    flange.position.x = -X0 + 0.04;
    scene.add(flange);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(RB * 0.3, RB * 0.95, 0.5, 32), metalMat);
    tip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1, 0, 0));
    tip.position.x = X0 - 0.25;
    scene.add(tip);
    const needle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.7, 12), metalMat);
    needle.quaternion.copy(axisX);
    needle.position.x = X0 - 0.85;
    scene.add(needle);
    // ---------- 氣體顏色（比爾定律） ----------
    const gasMat = new THREE.MeshBasicMaterial({ color: 0x9c4a1a, transparent: true, opacity: 0, depthWrite: false });
    const gas = new THREE.Mesh(new THREE.CylinderGeometry(RB * 0.985, RB * 0.985, 1, 40), gasMat);
    gas.quaternion.copy(axisX);
    gas.renderOrder = 1;
    scene.add(gas);
    // ---------- 活塞與推桿 ----------
    const rubberMat = new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.75, metalness: 0 });
    const plunger = new THREE.Mesh(new THREE.CylinderGeometry(RB * 0.99, RB * 0.99, 0.28, 40), rubberMat);
    plunger.quaternion.copy(axisX);
    scene.add(plunger);
    const rodMat = new THREE.MeshStandardMaterial({ color: 0xe6eaee, roughness: 0.3, metalness: 0.3 });
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, LB * 0.95, 20), rodMat);
    rod.quaternion.copy(axisX);
    scene.add(rod);
    const thumb = new THREE.Mesh(new THREE.CylinderGeometry(RB * 0.9, RB * 0.9, 0.1, 36), rodMat);
    thumb.quaternion.copy(axisX);
    scene.add(thumb);

    // ---------- 原子（同一個 InstancedMesh，每個原子一個實例） ----------
    const atomMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.32, metalness: 0.05, transparent: true, opacity: 1 });
    const atoms = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 10), atomMat, MAXA);
    atoms.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    atoms.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXA * 3), 3);
    atoms.instanceColor.setUsage(THREE.DynamicDrawUsage);
    atoms.frustumCulled = false;
    atoms.count = 0;
    scene.add(atoms);

    // ---------- 閃光 ----------
    const glowTex = (function () {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    })();
    const sprites = [];
    for (let k = 0; k < FL; k++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      sp.visible = false;
      scene.add(sp);
      sprites.push(sp);
    }

    function applyColors() {
      colors = H.colors();
      tickMat.color.set(colors.muted);
      glassMat.opacity = colors.dark ? 0.1 : 0.14;
      metalMat.color.set(colors.dark ? 0x9aa5b1 : 0xc9d0d8);
    }

    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e3 = new THREE.Euler(), pv = new THREE.Vector3(), sv = new THREE.Vector3(), off = new THREE.Vector3();
    const tmpC = new THREE.Color();
    const R0 = 0.072;            // 原子半徑單位（與 2D 相同：筒身半徑的 0.072）
    function update(now) {
      const frac = H.gasFrac();
      const xP = X0 + LB * frac;
      const len = xP - X0;
      // 氣體色柱
      const tint = H.tint();
      gas.scale.set(1, Math.max(0.001, len), 1);
      gas.position.x = X0 + len / 2;
      if (tint && tint.a > 0.004) { gasMat.color.set(tint.color); gasMat.opacity = Math.min(0.85, tint.a * 0.75); gas.visible = true; } else gas.visible = false;
      // 活塞
      plunger.position.x = xP + 0.14;
      rod.position.x = xP + 0.28 + LB * 0.95 / 2;
      thumb.position.x = xP + 0.28 + LB * 0.95 + 0.05;
      // 水浴顏色
      const tc = H.tempColor();
      bathMat.color.set(tc); bathCapMat.color.set(tc);
      bathMat.opacity = colors.dark ? 0.2 : 0.16; bathCapMat.opacity = bathMat.opacity;
      // 原子
      const ps = H.parts();
      const half = RB - R0 * 1.6;
      let k = 0;
      for (let i = 0; i < ps.length && k < MAXA; i++) {
        const p = ps[i], mol = H.MOL[p.sp];
        const fade = Math.min(1, (now - p.born) / 250);
        pv.set(X0 + p.u * len, p.v * half, p.w * half);
        e3.set(p.tilt, 0, p.a);
        q.setFromEuler(e3);
        for (let j = 0; j < mol.length && k < MAXA; j++) {
          const at = mol[j];
          off.set(at[1] * R0, at[2] * R0, 0).applyQuaternion(q);
          const r = H.ATOM_R[at[0]] * R0 * (0.4 + 0.6 * fade);
          sv.set(r, r, r);
          m4.compose(off.add(pv), q, sv);
          atoms.setMatrixAt(k, m4);
          tmpC.set(colors.atom[at[0]] || '#888888');
          atoms.setColorAt(k, tmpC);
          k++;
        }
      }
      atoms.count = k;
      atoms.instanceMatrix.needsUpdate = true;
      if (atoms.instanceColor) atoms.instanceColor.needsUpdate = true;
      // 閃光
      const fl = H.flashes();
      for (let s = 0; s < FL; s++) {
        const sp = sprites[s], f = fl[fl.length - 1 - s];
        if (!f) { sp.visible = false; continue; }
        const u = (now - f.t0) / H.FL_DUR;
        if (u < 0 || u > 1) { sp.visible = false; continue; }
        sp.visible = true;
        sp.position.set(X0 + f.u * len, f.v * half, f.w * half);
        sp.material.color.set(f.kind ? colors.probe : colors.accent);
        sp.material.opacity = 0.9 * (1 - u);
        sp.scale.setScalar(R0 * (3 + 5 * u));
      }
      const hd = H.hud();
      hudTL.textContent = hd.tl;
      hudTR.textContent = hd.tr;
      hudTR.style.color = hd.tcol;
    }

    function fit(force) {
      const span = LB + 2.6;
      const dist = (span * 0.45) / Math.tan(camera.fov * Math.PI / 360) / Math.min(1.25, camera.aspect);
      if (force) {
        controls.target.set(0.9, 0, 0);
        camera.position.copy(viewDir).multiplyScalar(dist).add(controls.target);
      }
      camera.updateProjectionMatrix();
      controls.update();
    }
    let vw = 0, raf = 0;
    function canvasHeight(w) { return w < 560 ? Math.round(Math.max(300, w * 0.84)) : 400; }
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
      update(performance.now());
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

  window.Eq3D = { create: create };
})();
