/*
 * cell-division-3d.js — 「細胞分裂」第一部分的 3D 紡錘體（three.js）
 *
 * 由 js/cell-division.js 在使用者按「3D 紡錘體」時才載入（three.js 也是那時才以 import() 載入）；切回 2D 時整個釋放。
 * 用法：window.CD3D.create({ THREE, OrbitControls }, 容器, bridge) → { active, onShow, onTheme, resetCamera, rebuild, update, resize, dispose }
 *
 * 位置全部來自核心的 frame()：x 沿紡錘體（第一次分裂）、y 向上（2D 的 y 向下，所以取負號）、z 是赤道板上的另一個方向。
 * 中期板在 3D 裡是一個圓盤：染色體在 y–z 平面上排開，從側面看就是 2D 的一直線。
 * 每條染色分體是一串圓柱（依片段的來源上色：母方、父方），兩端與著絲點各一顆小球；幾何共用，播放時只改位置、方向與大小，不重建網格。
 * 只在畫面改變（播放、拖曳、換主題）時重畫。
 */
(function () {
  'use strict';

  function create(lib, host, BR) {
    const THREE = lib.THREE;
    const T = BR.T, D = BR.D;
    let C = BR.colors();

    const wrap = document.createElement('div');
    wrap.className = 'cd3-wrap';
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('3D 紡錘體：半透明的球是細胞，紅色與藍色的棒子是來自母方與父方的染色分體，綠色細線是紡錘絲，橘色是中心體，黃色是交叉（可拖曳旋轉、縮放）',
      '3D spindle: the see-through spheres are cells, the red and blue rods are chromatids from the mother and the father, thin green lines are spindle fibres, orange dots the centrosomes and yellow dots the chiasmata (drag to rotate, pinch or scroll to zoom)'));
    wrap.appendChild(canvas);
    const hud = document.createElement('div');
    hud.className = 'cd3-hud';
    hud.setAttribute('aria-hidden', 'true');
    hud.innerHTML = '<div class="tl"><span data-k="s"></span><span data-k="c"></span></div><div class="br"><span class="m" data-k="note"></span></div>';
    wrap.appendChild(hud);
    host.appendChild(wrap);
    const hudEl = {};
    hud.querySelectorAll('[data-k]').forEach(function (e) { hudEl[e.getAttribute('data-k')] = e; });
    function setHud(k, s) { if (hudEl[k].textContent !== s) hudEl[k].textContent = s; hudEl[k].style.display = s ? '' : 'none'; }

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    } catch (e) {
      wrap.remove();
      throw e;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1.5, 0.05, 100);
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.rotateSpeed = 0.85;
    controls.enablePan = false;
    controls.minDistance = 2.2;
    controls.maxDistance = 14;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x556070, 1.05));
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(-3, 5, 6);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xcfe3ff, 0.5);
    rim.position.set(4, 2, -6);
    scene.add(rim);

    function col(s) { return new THREE.Color(s); }
    function disposeObject(obj) {
      obj.traverse(function (o) {
        if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); });
      });
    }

    // ---------- 共用幾何 ----------
    const geoCyl = new THREE.CylinderGeometry(1, 1, 1, 14, 1, true); geoCyl.userData.shared = true;
    const geoBall = new THREE.SphereGeometry(1, 16, 12); geoBall.userData.shared = true;
    const geoCell = new THREE.SphereGeometry(1, 48, 32); geoCell.userData.shared = true;

    const root = new THREE.Group();
    scene.add(root);

    // ---------- 細胞、核（最多 4 個） ----------
    const cells = [], nuclei = [];
    function cellMat() { return new THREE.MeshPhysicalMaterial({ color: col(C['cd-cyto']), roughness: 0.35, transmission: 0, transparent: true, opacity: D.dark ? 0.16 : 0.22, depthWrite: false, side: THREE.DoubleSide }); }
    function memMat() { return new THREE.MeshBasicMaterial({ color: col(C['cd-mem']), transparent: true, opacity: 0.32, side: THREE.BackSide, depthWrite: false }); }
    function nucMat() { return new THREE.MeshStandardMaterial({ color: col(C['cd-nuc']), roughness: 0.6, transparent: true, opacity: 0.14, depthWrite: false }); }
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(geoCell, cellMat());
      const edge = new THREE.Mesh(geoCell, memMat()); edge.scale.setScalar(1.012);
      body.renderOrder = 2; edge.renderOrder = 1;
      g.add(edge); g.add(body);
      g.visible = false;
      root.add(g); cells.push(g);
      const nu = new THREE.Mesh(geoCell, nucMat()); nu.visible = false; nu.renderOrder = 3;
      root.add(nu); nuclei.push(nu);
    }
    // ---------- 中心體、交叉 ----------
    const poles = [];
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(geoBall, new THREE.MeshStandardMaterial({ color: col(C['cd-pole']), emissive: col(C['cd-pole']), emissiveIntensity: 0.45, roughness: 0.4 }));
      m.scale.setScalar(0.035); m.visible = false; root.add(m); poles.push(m);
    }
    const chiPool = [];
    function chiMesh(i) {
      while (chiPool.length <= i) {
        const m = new THREE.Mesh(geoBall, new THREE.MeshStandardMaterial({ color: col(C['cd-xo']), emissive: col(C['cd-xo']), emissiveIntensity: 0.6, roughness: 0.3, transparent: true }));
        m.scale.setScalar(0.03); m.renderOrder = 5; root.add(m); chiPool.push(m);
      }
      return chiPool[i];
    }
    // ---------- 紡錘絲（動態線段） ----------
    const MAXL = 600;
    const spBuf = new Float32Array(MAXL * 6);
    const spGeo = new THREE.BufferGeometry();
    spGeo.setAttribute('position', new THREE.BufferAttribute(spBuf, 3));
    const spMat = new THREE.LineBasicMaterial({ color: col(C['cd-spin']), transparent: true, opacity: 0.7 });
    const spLines = new THREE.LineSegments(spGeo, spMat);
    spLines.frustumCulled = false;
    root.add(spLines);

    // ---------- 染色分體 ----------
    let chroms = [];   // [{group, sig, parts:[{mesh, a, b}], caps:[m, m], cen, mats:[mat, pat]}]
    const chromRoot = new THREE.Group();
    root.add(chromRoot);
    function chromMats() {
      return [0, 1].map(function (o) {
        const c = o ? C['cd-pat'] : C['cd-mat'];
        return new THREE.MeshStandardMaterial({ color: col(c), roughness: 0.42, metalness: 0.05, transparent: true, opacity: 1 });
      });
    }
    function buildChrom(q) {
      const group = new THREE.Group();
      const mats = chromMats();
      // 片段在著絲點處切開，後期兩臂才能各自折向赤道（V 字）
      const cen0 = BR.rec().cens[q.p], pieces = [];
      q.segs.forEach(function (s) { if (s.a < cen0 && cen0 < s.b) { pieces.push({ a: s.a, b: cen0, o: s.o }, { a: cen0, b: s.b, o: s.o }); } else pieces.push(s); });
      const parts = pieces.map(function (s) {
        const m = new THREE.Mesh(geoCyl, mats[s.o]);
        group.add(m);
        return { mesh: m, a: s.a, b: s.b, o: s.o };
      });
      const caps = [q.segs[0].o, q.segs[q.segs.length - 1].o].map(function (o) { const m = new THREE.Mesh(geoBall, mats[o]); group.add(m); return m; });
      const cenMat = new THREE.MeshStandardMaterial({ color: col(D.shade(C['cd-mat'], -0.55)), roughness: 0.5, transparent: true });
      const cen = new THREE.Mesh(geoBall, cenMat);
      group.add(cen);
      chromRoot.add(group);
      return { group: group, sig: sigOf(q), parts: parts, caps: caps, cen: cen, mats: mats.concat([cenMat]) };
    }
    function sigOf(q) { return q.segs.map(function (s) { return s.a.toFixed(4) + s.o; }).join(','); }
    function clearChroms() {
      chroms.forEach(function (c) { chromRoot.remove(c.group); c.mats.forEach(function (m) { m.dispose(); }); });
      chroms = [];
    }
    const UP = new THREE.Vector3(0, 1, 0), tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion();

    // ---------- 每一幀 ----------
    function apply() {
      const fr = BR.frame(), rec = BR.rec();
      // 細胞
      cells.forEach(function (g, i) {
        const c = fr.cells[i];
        g.visible = !!c;
        if (c) { g.position.set(c.x, -c.y, 0); g.scale.setScalar(c.r); }
      });
      nuclei.forEach(function (m, i) {
        const nu = fr.nuclei[i];
        m.visible = !!nu && nu.a > 0.02;
        if (m.visible) { m.position.set(nu.x, -nu.y, 0); m.scale.setScalar(nu.r); m.material.opacity = 0.16 * nu.a; }
      });
      poles.forEach(function (m, i) {
        const p = fr.poles[i];
        m.visible = !!p;
        if (p) m.position.set(p.x, -p.y, p.z || 0);
      });
      // 染色分體
      if (chroms.length !== fr.chromatids.length || fr.chromatids.some(function (q, i) { return !chroms[i] || chroms[i].sig !== sigOf(q); })) {
        clearChroms();
        fr.chromatids.forEach(function (q) { chroms.push(buildChrom(q)); });
      }
      const cenPos = [];
      fr.chromatids.forEach(function (q, i) {
        const c = chroms[i];
        const vis = q.rep > 0.01;
        c.group.visible = vis;
        if (!vis) { cenPos.push(null); return; }
        const Lw = q.len * (1 + 0.9 * (1 - q.cond));
        const r = 0.017 * (0.3 + 0.7 * q.cond);
        c.group.position.set(q.x, -q.y, q.z);
        tmpV.set(Math.cos(q.ang), -Math.sin(q.ang), 0).normalize();
        tmpQ.setFromUnitVectors(UP, tmpV);
        c.group.quaternion.copy(tmpQ);
        const cen = rec.cens[q.p], bend = q.bend || 0, GAM = 0.42;
        // 局部座標：+y 是分體方向；後期長臂轉 −bend·GAM、短臂轉 −(π + bend·(π − GAM))（2D 的 y 朝下，3D 的 y 朝上，所以角度變號）
        const phL = -bend * GAM, phS = -(Math.PI + bend * (Math.PI - GAM));
        const cy0 = (cen - 0.5) * Lw;
        const armPos = function (t) { const ph = t >= cen ? phL : phS, d = Math.abs(t - cen) * Lw; return [-Math.sin(ph) * d, cy0 + Math.cos(ph) * d]; };
        c.parts.forEach(function (p) {
          const mid = armPos((p.a + p.b) / 2);
          p.mesh.position.set(mid[0], mid[1], 0);
          p.mesh.rotation.z = (p.a + p.b) / 2 >= cen ? phL : phS;
          p.mesh.scale.set(r, Math.max(1e-4, (p.b - p.a) * Lw), r);
        });
        const e0 = armPos(0), e1 = armPos(1);
        c.caps[0].position.set(e0[0], e0[1], 0); c.caps[0].scale.setScalar(r);
        c.caps[1].position.set(e1[0], e1[1], 0); c.caps[1].scale.setScalar(r);
        c.cen.position.set(0, (cen - 0.5) * Lw, 0); c.cen.scale.setScalar(r * 1.15);
        c.cen.visible = q.cond > 0.3;
        c.cen.material.color.set(D.shade(BR.K.originAt(q.segs, cen) ? C['cd-pat'] : C['cd-mat'], -0.55));
        c.mats.forEach(function (m) { m.opacity = q.rep; m.transparent = q.rep < 0.999; });
        cenPos.push(new THREE.Vector3(0, (cen - 0.5) * Lw, 0).applyQuaternion(tmpQ).add(c.group.position));
      });
      // 紡錘絲
      let k = 0;
      const seg = function (a, b) { if (k >= MAXL) return; spBuf.set([a.x, a.y, a.z, b.x, b.y, b.z], k * 6); k++; };
      const P = fr.poles.map(function (p) { return new THREE.Vector3(p.x, -p.y, p.z || 0); });
      if (fr.spindle > 0.01) {
        // 星狀體
        P.forEach(function (p) {
          for (let i = 0; i < 14; i++) {
            const th = Math.acos(1 - 2 * (i + 0.5) / 14), ph = i * 2.39996;
            const L = 0.13 * fr.spindle;
            seg(p, new THREE.Vector3(p.x + L * Math.sin(th) * Math.cos(ph), p.y + L * Math.cos(th), p.z + L * Math.sin(th) * Math.sin(ph)));
          }
        });
        // 極間微管
        const pairs = P.length === 2 ? [[0, 1]] : P.length === 4 ? [[0, 1], [2, 3]] : [];
        pairs.forEach(function (pp) {
          const A = P[pp[0]], B = P[pp[1]];
          const ax = new THREE.Vector3().subVectors(B, A).normalize();
          const u = new THREE.Vector3(0, 0, 1).cross(ax); if (u.lengthSq() < 1e-6) u.set(1, 0, 0); u.normalize();
          const v = new THREE.Vector3().crossVectors(ax, u).normalize();
          const mid = new THREE.Vector3().addVectors(A, B).multiplyScalar(0.5);
          for (let i = 0; i < 10; i++) {
            const a = i / 10 * Math.PI * 2, R = 0.16;
            const m = mid.clone().addScaledVector(u, Math.cos(a) * R).addScaledVector(v, Math.sin(a) * R);
            seg(A, m); seg(m, B);
          }
        });
        // 著絲點微管
        fr.chromatids.forEach(function (q, i) { if (q.pole >= 0 && P[q.pole] && cenPos[i]) seg(P[q.pole], cenPos[i]); });
      }
      spGeo.setDrawRange(0, k * 2);
      spGeo.attributes.position.needsUpdate = true;
      spMat.opacity = 0.75 * fr.spindle;
      spLines.visible = k > 0;
      // 交叉
      chiPool.forEach(function (m) { m.visible = false; });
      fr.chiasmata.forEach(function (x, i) {
        const m = chiMesh(i);
        m.visible = x.a > 0.02;
        m.position.set(x.x, -x.y, x.z || 0);
        m.material.opacity = x.a;
      });
      // 抬頭顯示
      const info = BR.info();
      setHud('s', (info.mode === 'mitosis' ? T('有絲分裂', 'Mitosis') : T('減數分裂', 'Meiosis')) + T('・', ' · ') + info.stage);
      setHud('c', T('每個細胞：', 'Per cell: ') + info.cells.map(function (c) { return c.chrom + T(' 條／', ' chr / ') + (Math.round(c.dna * 10) / 10) + 'C'; }).join(T('，', ', ')));
      setHud('note', T('示意圖（未依比例）・拖曳旋轉', 'Schematic (not to scale) · drag to rotate'));
    }

    function themeColors() {
      C = BR.colors();
      cells.forEach(function (g) { g.children[0].material.color.set(C['cd-mem']); g.children[1].material.color.set(C['cd-cyto']); g.children[1].material.opacity = D.dark ? 0.16 : 0.22; });
      nuclei.forEach(function (m) { m.material.color.set(C['cd-nuc']); });
      poles.forEach(function (m) { m.material.color.set(C['cd-pole']); m.material.emissive.set(C['cd-pole']); });
      chiPool.forEach(function (m) { m.material.color.set(C['cd-xo']); m.material.emissive.set(C['cd-xo']); });
      spMat.color.set(C['cd-spin']);
      clearChroms();
    }

    // ---------- 相機、繪製 ----------
    let raf = 0, moving = false, lastAspect = 0, narrow = false;
    function sizeOf(w) { return w < 520 ? Math.round(Math.max(300, Math.min(380, w * 0.95))) : 470; }
    function resetCamera() {
      const d = narrow ? 6.0 : 3.9;
      camera.position.set(d * 0.18, d * 0.32, d);
      controls.target.set(0, 0, 0);
      camera.updateProjectionMatrix();
      controls.update();
    }
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
      const nw = w < 520;
      if (nw !== narrow) { narrow = nw; lastAspect = 0; }
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (Math.abs(camera.aspect - lastAspect) > 1e-3) {
        const first = !lastAspect;
        lastAspect = camera.aspect;
        if (first) resetCamera();
      }
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
      onShow: function () { lastAspect = 0; resize3(); },
      resize: function () { resize3(); },
      onTheme: function () { themeColors(); apply(); requestRender(); },
      rebuild: function () { clearChroms(); apply(); requestRender(); },
      update: function () { apply(); requestRender(); },
      resetCamera: function () { resetCamera(); requestRender(); },
      dispose: function () {
        api.active = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        controls.dispose();
        clearChroms();
        disposeObject(scene);
        geoCyl.dispose(); geoBall.dispose(); geoCell.dispose(); spGeo.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        wrap.remove();
      }
    };
    const w0 = wrap.clientWidth;
    if (w0) {
      narrow = w0 < 520;
      canvas.style.height = sizeOf(w0) + 'px';
      renderer.setSize(w0, sizeOf(w0), false);
      camera.aspect = w0 / sizeOf(w0);
      camera.updateProjectionMatrix();
      lastAspect = camera.aspect;
    }
    apply();
    resetCamera();
    renderNow();
    return api;
  }
  window.CD3D = { create: create };
})();
