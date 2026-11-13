/*
 * water-hardness-3d.js — 「水的硬度」EDTA 滴定的 3D 微觀檢視（可旋轉、縮放）
 *
 * three.js 由 water-hardness.js 在切換到 3D 時才以 import() 動態載入，再傳進 Hard3D.create(lib, host)。
 * 這個檔案只「讀」頁面的狀態（Ca2+、Mg2+ 的比例、被 EDTA 螯合的比例、指示劑結合金屬的比例、溶液的顏色），
 * 不改變任何化學量。畫面是錐形瓶中「一小滴溶液」的示意：
 *   - 綠色大球 Ca2+、琥珀色小球 Mg2+（顆數照莫耳數比例，共 40 顆）；
 *   - 被 EDTA 螯合的離子外面有六個配位原子：2 個 N（藍）、4 個 O（紅），排成八面體，用鍵連到金屬；
 *   - 8 個指示劑分子：和金屬結合的是酒紅色、貼在一顆沒被螯合的離子旁；沒有結合的是藍色、自由漂動；
 *   - pH 12 時，沉澱的 Mg(OH)2 是聚在底部的白色小方塊。
 */
(function () {
  'use strict';
  const NION = 40, NIND = 8, R_DROP = 4.6;

  function create(lib, H) {
    const THREE = lib.THREE;
    const T = H.T, host = H.host;

    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('錐形瓶中一小滴溶液的 3D 微觀示意：Ca2+、Mg2+、包住金屬離子的 EDTA，以及指示劑分子（拖曳旋轉、雙指或滾輪縮放）',
      '3D sketch of a tiny drop of the solution in the flask: Ca2+, Mg2+, EDTA wrapped round metal ions, and indicator molecules (drag to rotate, pinch or scroll to zoom)'));
    canvas.setAttribute('role', 'img');
    host.appendChild(canvas);
    const huds = ['tl', 'tr', 'bl', 'br'].map(function (k) {
      const d = document.createElement('div');
      d.className = 'r3-hud ' + k; d.setAttribute('aria-hidden', 'true'); host.appendChild(d);
      return d;
    });
    const hudTL = huds[0], hudTR = huds[1], hudBL = huds[2], hudBR = huds[3];
    hudBL.textContent = T('拖曳旋轉・滾輪或雙指縮放', 'Drag to rotate · scroll or pinch to zoom');

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: 'default' });
    } catch (e) {
      canvas.remove(); huds.forEach(function (d) { d.remove(); });
      throw e;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1.5, 0.3, 200);
    const viewDir = new THREE.Vector3(0.25, 0.35, 1).normalize();
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.minDistance = 6;
    controls.maxDistance = 40;
    controls.enablePan = false;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 1.9);
    sun.position.set(-6, 12, 9);
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0xffffff, 0.5);
    rim.position.set(10, 3, -9);
    scene.add(rim);

    const Col = function (c) { return new THREE.Color(c || '#888888'); };

    // ---- 固定的亂數位置（同一顆離子永遠在同一個地方附近晃） ----
    let seed = 2024;
    const rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    function inBall(r) {
      for (;;) {
        const x = rnd() * 2 - 1, y = rnd() * 2 - 1, z = rnd() * 2 - 1;
        if (x * x + y * y + z * z <= 1) return new THREE.Vector3(x * r, y * r, z * r);
      }
    }
    // 離子之間至少隔 1.9：用簡單的拒絕取樣
    const ionPos = [];
    for (let i = 0; i < NION; i++) {
      let p, tries = 0;
      do { p = inBall(R_DROP - 1.1); tries++; } while (tries < 200 && ionPos.some(function (q) { return q.distanceTo(p) < 1.9; }));
      ionPos.push(p);
    }
    const ionPh = ionPos.map(function () { return { a: rnd() * 6.28, b: rnd() * 6.28, w: 0.5 + rnd() * 0.7 }; });
    const indPos = [], indRot = [];
    for (let i = 0; i < NIND; i++) { indPos.push(inBall(R_DROP - 0.8)); indRot.push(new THREE.Euler(rnd() * 6.28, rnd() * 6.28, rnd() * 6.28)); }
    // 八面體的六個方向：前兩個放 N，後四個放 O
    const OCT = [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]].map(function (a) { return new THREE.Vector3(a[0], a[1], a[2]); });
    const ionRot = ionPos.map(function () { return new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 6.28, rnd() * 6.28, rnd() * 6.28)); });

    // ---- 幾何與材質 ----
    const sphere = new THREE.SphereGeometry(1, 24, 16);
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 10);
    const box = new THREE.BoxGeometry(1, 1, 1);
    const mat = function (opts) { return new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.35, metalness: 0.05 }, opts)); };
    const mCa = mat({}), mMg = mat({}), mN = mat({}), mO = mat({}), mBond = mat({ roughness: 0.6 }), mRing = mat({ roughness: 0.6 });
    const mIndR = mat({}), mIndB = mat({}), mSolid = mat({ roughness: 0.8 });
    const imCa = new THREE.InstancedMesh(sphere, mCa, NION);
    const imMg = new THREE.InstancedMesh(sphere, mMg, NION);
    const imN = new THREE.InstancedMesh(sphere, mN, NION * 2);
    const imO = new THREE.InstancedMesh(sphere, mO, NION * 4);
    const imBond = new THREE.InstancedMesh(cyl, mBond, NION * 6);
    const imRing = new THREE.InstancedMesh(cyl, mRing, NION * 12);
    const imIndR = new THREE.InstancedMesh(sphere, mIndR, NIND * 3);
    const imIndB = new THREE.InstancedMesh(sphere, mIndB, NIND * 3);
    const imSolid = new THREE.InstancedMesh(box, mSolid, NION);
    [imCa, imMg, imN, imO, imBond, imRing, imIndR, imIndB, imSolid].forEach(function (m) { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); });
    // 溶液的小滴：半透明的球，顏色是瓶中溶液的顏色
    const dropMat = new THREE.MeshPhysicalMaterial({ transparent: true, opacity: 0.16, roughness: 0.1, metalness: 0, depthWrite: false, side: THREE.DoubleSide });
    const drop = new THREE.Mesh(new THREE.SphereGeometry(R_DROP + 0.4, 48, 32), dropMat);
    scene.add(drop);

    function applyColors() {
      const c = H.colors();
      mCa.color = Col(c.probe); mMg.color = Col(c.equi);
      mN.color = Col(c.neg); mO.color = Col(c.pos);
      mBond.color = Col(c.muted); mRing.color = Col(c.muted);
      mSolid.color = Col(c.white);
      hudBR.innerHTML = '<i style="background:' + c.probe + '"></i>Ca<sup>2+</sup> <i style="background:' + c.equi + '"></i>Mg<sup>2+</sup> <i style="background:' + c.neg + '"></i>N <i style="background:' + c.pos + '"></i>O';
    }

    const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), V2 = new THREE.Vector3(), S3 = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
    function put(im, i, pos, r) { S3.set(r, r, r); M4.compose(pos, Q.identity(), S3); im.setMatrixAt(i, M4); }
    function stick(im, i, a, b, r) {
      V.subVectors(b, a); const len = V.length();
      if (len < 1e-6) { S3.set(0, 0, 0); M4.compose(a, Q.identity(), S3); im.setMatrixAt(i, M4); return; }
      Q.setFromUnitVectors(UP, V.clone().normalize());
      V2.addVectors(a, b).multiplyScalar(0.5);
      S3.set(r, len, r);
      M4.compose(V2, Q, S3); im.setMatrixAt(i, M4);
    }
    let lastKey = '';
    function update(now) {
      const m = H.micro(), t = H.reduced ? 0 : now / 1000;
      const tot = m.nCa + m.nMg;
      let nCa = tot > 0 ? Math.round(NION * m.nCa / tot) : 0, nMgv = tot > 0 ? NION - nCa : 0;
      if (tot > 0 && m.nCa > 0 && nCa === 0) { nCa = 1; nMgv = NION - 1; }
      if (tot > 0 && m.nMg > 0 && nMgv === 0) { nMgv = 1; nCa = NION - 1; }
      const chCa = Math.round(m.fCa * nCa), chMg = Math.round(m.fMg * nMgv), solid = Math.round(m.mgSolid * nMgv);
      // 顏色
      const key = m.rgb.join(',');
      if (key !== lastKey) {
        lastKey = key;
        const cc = new THREE.Color(m.rgb[0] / 255, m.rgb[1] / 255, m.rgb[2] / 255);
        dropMat.color = cc;
        const c = H.colors();
        mIndR.color = Col(c.dark ? '#d0507a' : '#9b1d4a');
        mIndB.color = Col(c.dark ? '#5b8cff' : '#2346b8');
      }
      let iCa = 0, iMg = 0, iN = 0, iO = 0, iB = 0, iR = 0, iS = 0;
      const free = [];   // 沒被螯合、可以和指示劑結合的離子（Mg 優先）
      const pos = new THREE.Vector3();
      for (let i = 0; i < nCa + nMgv; i++) {
        const isCa = i < nCa, k = isCa ? i : i - nCa;
        const ph = ionPh[i];
        pos.copy(ionPos[i]);
        if (t) pos.add(V.set(0.18 * Math.sin(t * 0.9 * ph.w + ph.a), 0.18 * Math.sin(t * 0.7 * ph.w + ph.b), 0.18 * Math.cos(t * 0.8 * ph.w + ph.a)));
        if (!isCa && m.mode === 'B' && k < solid) {
          // Mg(OH)2：聚在小滴底部的白色固體
          const sx = (k % 4) - 1.5, sz = Math.floor(k / 4) % 4 - 1.5, sy = Math.floor(k / 16);
          V.set(sx * 0.62, -R_DROP + 0.55 + sy * 0.62, sz * 0.62);
          S3.set(0.58, 0.58, 0.58); M4.compose(V, Q.identity(), S3); imSolid.setMatrixAt(iS++, M4);
          continue;
        }
        const r = isCa ? 0.42 : 0.33;
        put(isCa ? imCa : imMg, isCa ? iCa++ : iMg++, pos, r);
        const chelated = isCa ? k < chCa : k >= nMgv - chMg;
        if (chelated) {
          const q = ionRot[i];
          const d = r + 0.5;
          const donors = OCT.map(function (o) { return o.clone().applyQuaternion(q).multiplyScalar(d).add(pos); });
          donors.forEach(function (p, j) {
            if (j < 2) put(imN, iN++, p, 0.2); else put(imO, iO++, p, 0.17);
            stick(imBond, iB++, pos, p, 0.045);
          });
          // EDTA 的骨架：把相鄰的配位原子連起來（示意六隻手是同一個分子）
          const ring = [[0, 2], [0, 4], [0, 3], [1, 5], [1, 2], [1, 3], [2, 5], [3, 4]];
          ring.forEach(function (e) { stick(imRing, iR++, donors[e[0]], donors[e[1]], 0.035); });
        } else {
          free.push({ p: pos.clone(), r: r, ca: isCa });
        }
      }
      // 指示劑：結合的貼在沒被螯合的離子旁（pH 10 先找 Mg，pH 12 只有 Ca）
      const nb = Math.min(NIND, Math.round(m.rf * NIND));
      free.sort(function (a, b) { return (a.ca === b.ca) ? 0 : (m.mode === 'A' ? (a.ca ? 1 : -1) : (a.ca ? -1 : 1)); });
      let iIR = 0, iIB = 0;
      for (let j = 0; j < NIND; j++) {
        const bound = j < nb && free.length > 0;
        let c;
        if (bound) {
          const f = free[j % free.length];
          c = f.p.clone().add(V.set(0, f.r + 0.42, 0).applyEuler(indRot[j]));
        } else {
          c = indPos[j].clone();
          if (t) c.add(V.set(0.3 * Math.sin(t * 0.6 + j), 0.3 * Math.cos(t * 0.5 + j * 2), 0.3 * Math.sin(t * 0.4 + j * 3)));
        }
        // 三個連在一起的扁球：萘環＋偶氮基＋萘環的示意
        const dir = V2.set(1, 0, 0).applyEuler(indRot[j]);
        for (let s = -1; s <= 1; s++) {
          const p = c.clone().addScaledVector(dir, s * 0.36);
          if (bound) put(imIndR, iIR++, p, 0.22); else put(imIndB, iIB++, p, 0.22);
        }
      }
      [[imCa, iCa], [imMg, iMg], [imN, iN], [imO, iO], [imBond, iB], [imRing, iR], [imIndR, iIR], [imIndB, iIB], [imSolid, iS]].forEach(function (a) {
        a[0].count = a[1]; a[0].instanceMatrix.needsUpdate = true;
      });
      const hd = H.hud();
      hudTL.textContent = hd.tl;
      hudTR.innerHTML = hd.tr + (tot <= 0 ? '<br>' + T('這瓶水沒有 Ca2+、Mg2+', 'No Ca2+ or Mg2+ in this water').replace('Ca2+', 'Ca<sup>2+</sup>').replace('Mg2+', 'Mg<sup>2+</sup>') : '');
    }

    function fit(reset) {
      const dist = (R_DROP + 1.2) / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.max(1, 1.15 / camera.aspect);
      if (reset) {
        controls.target.set(0, 0, 0);
        camera.position.copy(viewDir).multiplyScalar(dist);
      }
      camera.updateProjectionMatrix();
      controls.update();
    }
    let vw = 0, raf = 0;
    function canvasHeight(w) { return w < 560 ? Math.round(Math.max(320, w * 0.95)) : 480; }
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
      onTheme: function () { applyColors(); lastKey = ''; requestRender(); },
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
          if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (mm) { mats.add(mm); });
        });
        mats.forEach(function (mm) { mm.dispose(); });
        renderer.dispose();
        renderer.forceContextLoss();
        canvas.remove(); huds.forEach(function (d) { d.remove(); });
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

  window.Hard3D = { create: create };
})();
