/*
 * organic-isomers-3d.js — 「同分異構物」的 3D 球棍模型（可旋轉、縮放，點鍵選取後用「扭轉角」繞鍵轉動）
 *
 * three.js 由 organic-isomers.js 在切換到 3D 時才以 import() 動態載入，再傳進 OI3D.create(lib, bridge)。
 * 這個檔案只「讀」頁面算好的 3D 座標（OICore.embed3D 的結果，單位 Å；繞鍵旋轉後的座標也由頁面算），不改變任何化學數據。
 * 原子半徑（Å，球棍模型縮小後的大小）：C 0.36、O 0.33、H 0.22；鍵的兩半分別塗上兩端原子的顏色。
 * 雙鍵畫兩根並排的棍子，放在雙鍵碳的平面內；扭轉雙鍵時第二根（π 鍵）依 cos²θ 變淡、兩根往中間合併。
 * 2D 格子的 y 朝下，這裡把 y 反過來，讓 3D 一開始的方向和 2D 畫法相同。
 */
(function () {
  'use strict';
  const RAD = { C: 0.36, O: 0.33, H: 0.22 };

  function create(lib, H) {
    const THREE = lib.THREE;
    const T = H.T, host = H.host;

    const canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', T('分子的 3D 球棍模型：灰色是碳、紅色是氧、白色是氫（拖曳旋轉、雙指或滾輪縮放、點鍵選取）',
      '3D ball-and-stick model: grey is carbon, red is oxygen, white is hydrogen (drag to rotate, pinch or scroll to zoom, tap a bond to choose it)'));
    host.appendChild(canvas);
    const hudTL = document.createElement('div'), hudTR = document.createElement('div'), hudBL = document.createElement('div');
    hudTL.className = 'r3-hud tl'; hudTR.className = 'r3-hud tr'; hudBL.className = 'r3-hud bl';
    [hudTL, hudTR, hudBL].forEach(function (d) { d.setAttribute('aria-hidden', 'true'); host.appendChild(d); });
    hudBL.textContent = T('拖曳旋轉・滾輪或雙指縮放・點鍵選取', 'Drag to rotate · scroll or pinch to zoom · tap a bond');

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
    const camera = new THREE.PerspectiveCamera(32, 1.25, 0.1, 200);
    const viewDir = new THREE.Vector3(0.18, 0.32, 1).normalize();
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.enablePan = false;
    controls.minDistance = 3;
    controls.maxDistance = 60;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x7d8592, 1.15));
    const key = new THREE.DirectionalLight(0xffffff, 2.0);
    key.position.set(-5, 8, 10);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xffffff, 0.55);
    rim.position.set(7, -3, -8);
    scene.add(rim);

    // ---------- 共用的幾何與材質 ----------
    const sphere = new THREE.SphereGeometry(1, 36, 24);
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 18, 1);
    const torus = new THREE.TorusGeometry(0.46, 0.028, 8, 48, Math.PI * 1.6);
    const cone = new THREE.ConeGeometry(0.07, 0.17, 14);
    const std = function (c, r) { return new THREE.MeshStandardMaterial({ color: c, roughness: r == null ? 0.32 : r, metalness: 0.05 }); };
    const mat = { C: std(0x4a5260), O: std(0xe0453a), H: std(0xf2f4f7, 0.4) };
    const piMat = { C: std(0x4a5260), O: std(0xe0453a) };
    piMat.C.transparent = piMat.O.transparent = true;
    const selMat = new THREE.MeshBasicMaterial({ color: 0x2f6fd0, transparent: true, opacity: 0.28, depthWrite: false });
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x2f6fd0, roughness: 0.4, metalness: 0.1 });
    const pickMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    const group = new THREE.Group();
    scene.add(group);
    const picks = [];

    const UP = new THREE.Vector3(0, 1, 0);
    function v3(p) { return new THREE.Vector3(p.x, -p.y, p.z); }
    function stick(p, q, r, m, k) {
      const d = new THREE.Vector3().subVectors(q, p), L = d.length();
      if (L < 1e-6) return null;
      const s = new THREE.Mesh(cyl, m);
      s.position.copy(p).addScaledVector(d, 0.5);
      s.scale.set(r, L, r);
      s.quaternion.setFromUnitVectors(UP, d.normalize());
      if (k != null) s.userData.k = k;
      group.add(s);
      return s;
    }
    /** 兩半分別用兩端原子顏色的棍子 */
    function halfSticks(p, q, ea, eb, r, mats) {
      const m = new THREE.Vector3().addVectors(p, q).multiplyScalar(0.5);
      stick(p, m, r, mats[ea] || mats.C);
      stick(m, q, r, mats[eb] || mats.C);
    }
    let mol = null, radius = 3;
    function rebuild() {
      group.clear();
      picks.length = 0;
      mol = H.mol();
      if (!mol || !mol.atoms.length) return;
      const P = mol.atoms.map(v3);
      const nb = mol.atoms.map(function () { return []; });
      mol.bonds.forEach(function (b) { nb[b.a].push(b.b); nb[b.b].push(b.a); });
      radius = 1.2;
      P.forEach(function (p) { radius = Math.max(radius, p.length() + 0.6); });
      mol.atoms.forEach(function (a, i) {
        const s = new THREE.Mesh(sphere, mat[a.el] || mat.C);
        s.position.copy(P[i]);
        const r = RAD[a.el] || 0.3;
        s.scale.set(r, r, r);
        group.add(s);
      });
      const sel = H.selected();
      mol.bonds.forEach(function (b, k) {
        const p = P[b.a], q = P[b.b], ea = mol.atoms[b.a].el, eb = mol.atoms[b.b].el;
        const dir = new THREE.Vector3().subVectors(q, p).normalize();
        // 偏移方向：放在 a 端取代基的平面內
        let off = null;
        const ref = nb[b.a].filter(function (j) { return j !== b.b; })[0];
        if (ref != null) off = new THREE.Vector3().subVectors(P[ref], p).cross(dir).cross(dir);
        if (!off || off.lengthSq() < 1e-6) off = new THREE.Vector3(1, 0, 0).cross(dir);
        if (off.lengthSq() < 1e-6) off = new THREE.Vector3(0, 0, 1).cross(dir);
        off.normalize();
        const hr = ea === 'H' || eb === 'H' ? 0.07 : 0.1;
        if (b.o === 1) halfSticks(p, q, ea, eb, hr, mat);
        else if (b.o === 2) {
          const u = Math.max(0, Math.min(1, b.pi)), d = 0.115 * (0.15 + 0.85 * u);
          halfSticks(p.clone().addScaledVector(off, d), q.clone().addScaledVector(off, d), ea, eb, 0.072, mat);
          if (u > 0.02) {
            const mm = u > 0.995 ? mat : piMat;
            if (mm === piMat) { piMat.C.opacity = piMat.O.opacity = u; }
            halfSticks(p.clone().addScaledVector(off, -d), q.clone().addScaledVector(off, -d), ea, eb, 0.072, mm);
          }
        } else {
          const off2 = new THREE.Vector3().crossVectors(dir, off).normalize();
          halfSticks(p, q, ea, eb, 0.06, mat);
          halfSticks(p.clone().addScaledVector(off, 0.15), q.clone().addScaledVector(off, 0.15), ea, eb, 0.055, mat);
          halfSticks(p.clone().addScaledVector(off2, 0.15).addScaledVector(off, -0.075), q.clone().addScaledVector(off2, 0.15).addScaledVector(off, -0.075), ea, eb, 0.055, mat);
        }
        if (b.heavy) {
          const pk = stick(p, q, 0.34, pickMat, k);
          if (pk) picks.push(pk);
        }
        if (b.heavy && k === sel) {
          stick(p, q, 0.24, selMat);
          // 繞鍵旋轉的箭頭：鍵中點的一圈弧＋箭頭
          const m = new THREE.Vector3().addVectors(p, q).multiplyScalar(0.5);
          const ring = new THREE.Mesh(torus, ringMat);
          ring.position.copy(m);
          ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
          group.add(ring);
          const tip = new THREE.Mesh(cone, ringMat);
          const a = Math.PI * 1.6, loc = new THREE.Vector3(0.46 * Math.cos(a), 0.46 * Math.sin(a), 0);
          tip.position.copy(loc.applyQuaternion(ring.quaternion)).add(m);
          const tan = new THREE.Vector3(-Math.sin(a), Math.cos(a), 0).applyQuaternion(ring.quaternion);
          tip.quaternion.setFromUnitVectors(UP, tan.normalize());
          group.add(tip);
        }
      });
    }
    function applyColors() {
      const dark = H.dark();
      mat.C.color.set(dark ? 0x9aa3ae : 0x4a5260);
      piMat.C.color.set(dark ? 0x9aa3ae : 0x4a5260);
      mat.H.color.set(dark ? 0xe6e9ee : 0xf4f6f8);
      mat.O.color.set(dark ? 0xff5e50 : 0xe0453a);
      piMat.O.color.set(dark ? 0xff5e50 : 0xe0453a);
      const ac = H.accent();
      try { selMat.color.set(ac); ringMat.color.set(ac); } catch (e) { /* 顏色字串讀不到時保留預設 */ }
    }

    // ---------- 點選鍵 ----------
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
      const hit = ray.intersectObjects(picks, false)[0];
      if (hit) H.pick(hit.object.userData.k);
    });

    function fit(force) {
      if (force) {
        const dist = radius / Math.sin(camera.fov * Math.PI / 360) / Math.min(1, camera.aspect) * 1.02;
        controls.target.set(0, 0, 0);
        camera.position.copy(viewDir).multiplyScalar(Math.max(4, dist));
      }
      camera.updateProjectionMatrix();
      controls.update();
    }
    let vw = 0, raf = 0;
    function resize3() {
      const w = host.clientWidth;
      if (!w) return;
      const h = Math.round(w * 0.8);
      canvas.style.height = h + 'px';
      vw = w;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      fit(false);
      requestRender();
    }
    function hud() {
      const d = H.hud();
      hudTL.textContent = d.tl || '';
      hudTR.textContent = d.tr || '';
    }
    function renderNow() {
      if (!api.active || document.hidden) return;
      const moved = controls.update();
      hud();
      renderer.render(scene, camera);
      if (moved) requestRender();
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
      /** 重建模型；refit 為 true 時重新對準鏡頭（換分子時） */
      update: function (refit) {
        if (!api.active) return;
        rebuild();
        if (refit) fit(true);
        requestRender();
      },
      onTheme: function () { applyColors(); requestRender(); },
      resetCamera: function () { fit(true); requestRender(); },
      dispose: function () {
        api.active = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        document.removeEventListener('visibilitychange', onVisible);
        controls.dispose();
        group.clear();
        [sphere, cyl, torus, cone].forEach(function (g) { g.dispose(); });
        [mat.C, mat.O, mat.H, piMat.C, piMat.O, selMat, ringMat, pickMat].forEach(function (m) { m.dispose(); });
        renderer.dispose();
        renderer.forceContextLoss();
        canvas.remove(); hudTL.remove(); hudTR.remove(); hudBL.remove();
      }
    };

    applyColors();
    const w0 = host.clientWidth;
    if (w0) {
      const h0 = Math.round(w0 * 0.8);
      canvas.style.height = h0 + 'px';
      vw = w0;
      renderer.setSize(w0, h0, false);
      camera.aspect = w0 / h0;
    }
    rebuild();
    fit(true);
    requestRender();
    return api;
  }

  window.OI3D = { create: create };
})();
