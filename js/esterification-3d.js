/*
 * esterification-3d.js — 「酯化反應」的 3D 機構動畫（球棍模型，可旋轉、縮放；拖「反應進度」或按「播放反應」）
 *
 * three.js 由 esterification.js 在切換到 3D 時才以 import() 動態載入，再傳進 ES3D.create(lib, bridge)。
 * 原子座標（Å）全部來自 EsterCore.mechanism／mechAt：反應物 → 過渡（示意）→ 產物三個關鍵畫面之間平滑插值。
 * 只有反應物才有的鍵（例如 C–OH）在進度 0.3–0.7 之間變細消失，只有產物才有的鍵（例如 C–O–C）同時長出來。
 * 醇的氧若勾選「氧-18 標記」就畫成金色；真實的機構（Roberts & Urey 1938）中它留在酯裡，「錯誤的猜想」中它跑進水裡。
 */
(function () {
  'use strict';
  const RAD = { C: 0.36, O: 0.33, H: 0.22 };

  function create(lib, H) {
    const THREE = lib.THREE;
    const T = H.T, host = H.host;

    const canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', T('酯化反應機構的 3D 球棍模型：灰色是碳、紅色是氧、白色是氫、金色是氧-18（拖曳旋轉、雙指或滾輪縮放）',
      '3D ball-and-stick model of the esterification mechanism: grey is carbon, red is oxygen, white is hydrogen, gold is oxygen-18 (drag to rotate, pinch or scroll to zoom)'));
    host.appendChild(canvas);
    const hudTL = document.createElement('div'), hudTR = document.createElement('div'), hudBL = document.createElement('div');
    hudTL.className = 'r3-hud tl'; hudTR.className = 'r3-hud tr'; hudBL.className = 'r3-hud bl';
    [hudTL, hudTR, hudBL].forEach(function (d) { d.setAttribute('aria-hidden', 'true'); host.appendChild(d); });

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
    // 化學上的「上方」（醇靠近的方向，+z）在畫面上也朝上；視線從側面看，醇的靠近與水的離開都看得到
    camera.up.set(0, 0, 1);
    const viewDir = new THREE.Vector3(0, -1, 0.35).normalize();
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

    const sphere = new THREE.SphereGeometry(1, 36, 24);
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 18, 1);
    const std = function (c, r) { return new THREE.MeshStandardMaterial({ color: c, roughness: r == null ? 0.32 : r, metalness: 0.05 }); };
    const mat = { C: std(0x4a5260), O: std(0xe0453a), H: std(0xf2f4f7, 0.4), L: std(0xd39b06, 0.25) };
    mat.L.metalness = 0.35;
    const haloMat = new THREE.MeshBasicMaterial({ color: 0x0d7f57, transparent: true, opacity: 0.1, depthWrite: false });
    const group = new THREE.Group();
    scene.add(group);
    const UP = new THREE.Vector3(0, 1, 0);
    const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

    let mech = null, mkey = '', lab = null, balls = [], sticks = [], halos = [], radius = 4;
    /** 鍵：{ a, b, kind: 'both'|'R'|'P', o, meshes: [兩半 × 鍵級] } */
    function bondList(m) {
      const k = function (b) { return Math.min(b.a, b.b) + '-' + Math.max(b.a, b.b); };
      const R = {}, P = {};
      m.bondsR.forEach(function (b) { R[k(b)] = b; });
      m.bondsP.forEach(function (b) { P[k(b)] = b; });
      const out = [];
      Object.keys(R).forEach(function (s) { out.push({ a: R[s].a, b: R[s].b, o: R[s].o, kind: P[s] ? 'both' : 'R' }); });
      Object.keys(P).forEach(function (s) { if (!R[s]) out.push({ a: P[s].a, b: P[s].b, o: P[s].o, kind: 'P' }); });
      return out;
    }
    function elMat(i) { const a = mech.atoms[i]; return a.label && lab ? mat.L : mat[a.el] || mat.C; }
    function rebuild() {
      group.clear();
      balls = []; sticks = []; halos = [];
      mech = H.mech();
      mkey = H.key(); lab = H.label();
      mech.atoms.forEach(function (a, i) {
        const s = new THREE.Mesh(sphere, elMat(i));
        const r = RAD[a.el] || 0.3;
        s.scale.set(r, r, r);
        group.add(s);
        balls.push(s);
      });
      bondList(mech).forEach(function (b) {
        const n = b.o === 2 ? 2 : 1, meshes = [];
        for (let j = 0; j < n * 2; j++) {
          const m = new THREE.Mesh(cyl, j % 2 ? elMat(b.b) : elMat(b.a));
          group.add(m); meshes.push(m);
        }
        b.meshes = meshes;
        sticks.push(b);
      });
      // 產物的兩個分子（酯、水）各有一團淡淡的光暈，進度接近 1 時出現
      [mech.esterSet, mech.waterSet].forEach(function (set, j) {
        const h = new THREE.Mesh(sphere, j ? haloMat.clone() : haloMat);
        h.userData.set = set;
        h.renderOrder = -1;
        group.add(h); halos.push(h);
      });
      halos[1].material.color.set(0x2f6fd0);
      // 視線：垂直於「上方」與「羥基離開的方向」，再稍微從上、從羥基那側看
      const Cc = mech.atoms[0].R, Oh = mech.atoms[mech.iOh].R;
      const away = new THREE.Vector3(Oh[0] - Cc[0], Oh[1] - Cc[1], 0).normalize(), upv = new THREE.Vector3(0, 0, 1);
      const side = new THREE.Vector3().crossVectors(upv, away).normalize();
      viewDir.copy(side).addScaledVector(upv, 0.4).addScaledVector(away, 0.25).normalize();
      radius = 2;
      mech.atoms.forEach(function (a) { ['R', 'M', 'P'].forEach(function (k) { radius = Math.max(radius, Math.hypot(a[k][0], a[k][1], a[k][2]) + 0.6); }); });
    }
    function v(p) { return tmp.set(p[0], p[1], p[2]); }
    function place(m, p, q, r) {
      const d = tmp2.subVectors(q, p), L = d.length();
      if (L < 1e-6 || r < 1e-3) { m.visible = false; return; }
      m.visible = true;
      m.position.copy(p).addScaledVector(d, 0.5);
      m.scale.set(r, L, r);
      m.quaternion.setFromUnitVectors(UP, d.normalize());
    }
    function pose() {
      const p = H.progress();
      const X = window.EsterCore.mechAt(mech, p).map(function (q) { return new THREE.Vector3(q[0], q[1], q[2]); });
      balls.forEach(function (b, i) { b.position.copy(X[i]); });
      const sm = function (u) { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };
      const fadeOut = 1 - sm((p - 0.3) / 0.4), fadeIn = sm((p - 0.3) / 0.4);
      sticks.forEach(function (b) {
        const A = X[b.a], B = X[b.b];
        const ea = mech.atoms[b.a].el, eb = mech.atoms[b.b].el;
        const w = b.kind === 'both' ? 1 : b.kind === 'R' ? fadeOut : fadeIn;
        const r = (ea === 'H' || eb === 'H' ? 0.07 : b.o === 2 ? 0.072 : 0.1) * w;
        const mid = new THREE.Vector3().addVectors(A, B).multiplyScalar(0.5);
        if (b.o === 2) {
          // 雙鍵：兩根並排，偏移方向取垂直於鍵、靠近相機的方向
          const d = new THREE.Vector3().subVectors(B, A).normalize();
          let off = new THREE.Vector3().crossVectors(d, new THREE.Vector3(0, 0, 1));
          if (off.lengthSq() < 1e-6) off = new THREE.Vector3(1, 0, 0);
          off.normalize().multiplyScalar(0.115);
          [1, -1].forEach(function (sgn, j) {
            const a2 = A.clone().addScaledVector(off, sgn), b2 = B.clone().addScaledVector(off, sgn), m2 = mid.clone().addScaledVector(off, sgn);
            place(b.meshes[j * 2], a2, m2, r);
            place(b.meshes[j * 2 + 1], m2, b2, r);
          });
        } else {
          place(b.meshes[0], A, mid, r);
          place(b.meshes[1], mid, B, r);
        }
      });
      const hv = sm((p - 0.75) / 0.25);
      halos.forEach(function (h, j) {
        const set = h.userData.set;
        if (hv < 0.01) { h.visible = false; return; }
        const c = new THREE.Vector3();
        set.forEach(function (i) { c.add(X[i]); });
        c.multiplyScalar(1 / set.length);
        let r = 0.8;
        set.forEach(function (i) { r = Math.max(r, X[i].distanceTo(c) + 0.55); });
        h.visible = true;
        h.position.copy(c);
        h.scale.set(r, r, r);
        h.material.opacity = (j ? 0.12 : 0.09) * hv * (H.dark() ? 1.4 : 1);
      });
    }
    function applyColors() {
      const dark = H.dark();
      mat.C.color.set(dark ? 0x9aa3ae : 0x4a5260);
      mat.H.color.set(dark ? 0xe6e9ee : 0xf4f6f8);
      mat.O.color.set(dark ? 0xff5e50 : 0xe0453a);
      mat.L.color.set(dark ? 0xf2c230 : 0xd39b06);
    }

    function fit(force) {
      if (force) {
        const dist = radius / Math.sin(camera.fov * Math.PI / 360) / Math.min(1, camera.aspect) * 0.86;
        controls.target.set(0, 0, 0);
        camera.position.copy(viewDir).multiplyScalar(Math.max(4, dist));
      }
      camera.updateProjectionMatrix();
      controls.update();
    }
    let vw = 0, raf = 0;
    function sizeFor(w) { return Math.round(Math.min(w * 0.8, Math.max(320, w * 0.62))); }
    function resize3() {
      const w = host.clientWidth;
      if (!w) return;
      const h = sizeFor(w);
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
      hudTR.innerHTML = d.tr || '';
      hudBL.textContent = T('拖曳旋轉・滾輪或雙指縮放', 'Drag to rotate · scroll or pinch to zoom');
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
      /** refit 為 true 時重建模型並重新對準鏡頭；否則只更新座標（換了酸、醇或機構也會自動重建） */
      update: function (refit) {
        if (!api.active) return;
        const k2 = H.key();
        if (refit || k2 !== mkey || H.label() !== lab) { rebuild(); if (refit || k2 !== mkey) fit(true); }
        pose();
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
        halos.forEach(function (h) { if (h.material !== haloMat) h.material.dispose(); });
        group.clear();
        [sphere, cyl].forEach(function (g) { g.dispose(); });
        [mat.C, mat.O, mat.H, mat.L, haloMat].forEach(function (m) { m.dispose(); });
        renderer.dispose();
        renderer.forceContextLoss();
        canvas.remove(); hudTL.remove(); hudTR.remove(); hudBL.remove();
      }
    };

    applyColors();
    const w0 = host.clientWidth;
    if (w0) {
      const h0 = sizeFor(w0);
      canvas.style.height = h0 + 'px';
      vw = w0;
      renderer.setSize(w0, h0, false);
      camera.aspect = w0 / h0;
    }
    rebuild();
    pose();
    fit(true);
    requestRender();
    return api;
  }

  window.ES3D = { create: create };
})();
