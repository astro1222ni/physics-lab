/*
 * reaction-rate-3d.js — 「反應速率與碰撞學說」的 3D 立體檢視（可旋轉、縮放）
 *
 * three.js 由 reaction-rate.js 在切換到 3D 時才以 import() 動態載入，再傳進 Rate3D.create(lib, host)。
 * 這個檔案只「讀」化學核心的模擬狀態（分子位置、種類、方向、反應事件），不改變任何物理量；
 * 模擬由 reaction-rate.js 推進，所以 2D 與 3D 看的是同一批分子。
 * 場景座標 = 模擬座標（nm）減去容器中心：x 向右、y 向上、z 朝向觀眾。分子依真實比例（直徑 0.6 nm、容器 12 nm）。
 */
(function () {
  'use strict';
  const CAP = 400;     // 分子數上限（A、B 各 200）
  const FL = 90;       // 閃光的數量上限（與 2D 相同）

  function create(lib, H) {
    const THREE = lib.THREE;
    const K = window.RateCore;
    const T = H.T, host = H.host;
    const HL = K.L / 2, WL = HL + K.D / 2, R = K.D / 2;

    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('反應容器的 3D 立體檢視：分子 A、B、C、D 在玻璃箱中運動與碰撞（拖曳旋轉、雙指或滾輪縮放）',
      '3D view of the reaction box: molecules A, B, C and D moving and colliding in a glass box (drag to rotate, pinch or scroll to zoom)'));
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
    const camera = new THREE.PerspectiveCamera(32, 1.5, 0.5, 500);
    // 預設視角與 2D 透視圖相同（由右前上方看）
    const viewDir = new THREE.Vector3(0.532, 0.375, 0.759).normalize();
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.minDistance = 8;
    controls.maxDistance = 120;
    controls.enablePan = false;

    // ---------- 光源 ----------
    const hemi = new THREE.HemisphereLight(0xffffff, 0x8a8f99, 1.5);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.9);
    sun.position.set(-12, 30, 18);
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0xffffff, 0.5);
    rim.position.set(20, 6, -18);
    scene.add(rim);

    let colors = H.colors();
    const col = function (c) { return new THREE.Color(c || '#888888'); };

    // ---------- 容器：玻璃面、稜線、地板格線 ----------
    const box = new THREE.Group();
    scene.add(box);
    const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.07, roughness: 0.05, metalness: 0,
      side: THREE.BackSide, depthWrite: false });
    const glass = new THREE.Mesh(new THREE.BoxGeometry(2 * WL, 2 * WL, 2 * WL), glassMat);
    glass.renderOrder = 0;
    box.add(glass);
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.85 });
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2 * WL, 2 * WL, 2 * WL)), edgeMat);
    box.add(edges);
    // 稜線加粗：細長方柱
    const barMat = new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.4, metalness: 0.1, transparent: true, opacity: 0.9 });
    const barGeo = new THREE.CylinderGeometry(0.06, 0.06, 2 * WL, 6);
    const bars = new THREE.InstancedMesh(barGeo, barMat, 12);
    (function () {
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
      let k = 0;
      const axes = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
      const up = new THREE.Vector3(0, 1, 0);
      [0, 1, 2].forEach(function (ax) {
        q.setFromUnitVectors(up, axes[ax]);
        [-1, 1].forEach(function (a) {
          [-1, 1].forEach(function (b) {
            const o = [0, 0, 0], others = [0, 1, 2].filter(function (x) { return x !== ax; });
            o[others[0]] = a * WL; o[others[1]] = b * WL;
            p.set(o[0], o[1], o[2]);
            m.compose(p, q, s);
            bars.setMatrixAt(k++, m);
          });
        });
      });
      bars.instanceMatrix.needsUpdate = true;
    })();
    box.add(bars);
    // 地板：細格線＋淡色底
    const floorMat = new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.08, depthWrite: false });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(2 * WL, 2 * WL), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -WL + 0.002;
    box.add(floor);
    const grid = new THREE.GridHelper(2 * WL, 6, 0x888888, 0x888888);
    grid.position.y = -WL + 0.004;
    grid.material.transparent = true;
    grid.material.opacity = 0.18;
    grid.material.depthWrite = false;
    box.add(grid);

    // ---------- 分子 ----------
    const molMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.32, metalness: 0.05 });
    const mols = new THREE.InstancedMesh(new THREE.SphereGeometry(R, 20, 14), molMat, CAP);
    mols.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mols.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3);
    mols.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mols.frustumCulled = false;
    mols.count = 0;
    scene.add(mols);
    // 可反應的一端（A、C 的小帽）
    const capMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, metalness: 0.05, emissive: 0x000000 });
    const caps = new THREE.InstancedMesh(new THREE.SphereGeometry(R * 0.45, 12, 8), capMat, CAP);
    caps.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    caps.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3);
    caps.frustumCulled = false;
    caps.count = 0;
    scene.add(caps);
    // 地板上的影子（扁平的圓，越高越淡）
    const shTex = (function () {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      const t = new THREE.CanvasTexture(c); return t;
    })();
    const shMat = new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false, opacity: 0.6 });
    const shGeo = new THREE.PlaneGeometry(1, 1); shGeo.rotateX(-Math.PI / 2);
    const shadows = new THREE.InstancedMesh(shGeo, shMat, CAP);
    shadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    shadows.frustumCulled = false;
    shadows.count = 0;
    scene.add(shadows);

    // ---------- 閃光（Sprite） ----------
    function radialTex(ring) {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d');
      if (ring) {
        g.strokeStyle = 'rgba(255,255,255,1)'; g.lineWidth = 7; g.setLineDash([12, 10]);
        g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.stroke();
      } else {
        const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
        gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.75)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
        g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 4;
        g.beginPath(); g.arc(64, 64, 40, 0, Math.PI * 2); g.stroke();
      }
      return new THREE.CanvasTexture(c);
    }
    const glowTex = radialTex(false), ringTex = radialTex(true);
    const sprites = [];
    for (let i = 0; i < FL; i++) {
      const m = new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, depthTest: true });
      const sp = new THREE.Sprite(m);
      sp.visible = false;
      sp.renderOrder = 3;
      scene.add(sp);
      sprites.push(sp);
    }

    const spCols = [new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color()];
    const capCol = [new THREE.Color(), new THREE.Color()];
    function applyColors() {
      colors = H.colors();
      spCols[0].set(colors.A); spCols[1].set(colors.B); spCols[2].set(colors.C); spCols[3].set(colors.D);
      capCol[0].set('#ffffff'); capCol[1].set('#ffffff');
      const dark = !!colors.dark;
      hemi.intensity = dark ? 1.25 : 1.5;
      glassMat.color.set(dark ? 0x9fb4c8 : 0xffffff);
      glassMat.opacity = dark ? 0.09 : 0.07;
      floorMat.color.set(colors.text);
      floorMat.opacity = dark ? 0.06 : 0.05;
      grid.material.color.set(colors.text);
      grid.material.opacity = dark ? 0.16 : 0.14;
      shMat.opacity = dark ? 0.75 : 0.45;
    }
    let lastT = -1;
    function applyWall() {
      const r = H.run();
      const Tw = r.cfg.heat ? r.Tgas : r.cfg.T;
      if (Math.abs(Tw - lastT) < 2) return;
      lastT = Tw;
      const c = col(H.tempColor(Tw));
      edgeMat.color.copy(c);
      barMat.color.copy(c);
    }

    // ---------- 每一幀 ----------
    const m4 = new THREE.Matrix4(), v3 = new THREE.Vector3(), qI = new THREE.Quaternion(), sc = new THREE.Vector3();
    function update(now) {
      const s = H.sim(), N = Math.min(s.N, CAP);
      const steric = H.run().cfg.steric;
      const ma = mols.instanceMatrix.array, ca = mols.instanceColor.array;
      const sa = shadows.instanceMatrix.array;
      const cpa = caps.instanceMatrix.array, cca = caps.instanceColor.array;
      let nc = 0;
      for (let i = 0; i < N; i++) {
        const o = 16 * i, x = s.x[i] - HL, y = s.y[i] - HL, z = s.z[i] - HL;
        ma[o] = 1; ma[o + 1] = 0; ma[o + 2] = 0; ma[o + 3] = 0;
        ma[o + 4] = 0; ma[o + 5] = 1; ma[o + 6] = 0; ma[o + 7] = 0;
        ma[o + 8] = 0; ma[o + 9] = 0; ma[o + 10] = 1; ma[o + 11] = 0;
        ma[o + 12] = x; ma[o + 13] = y; ma[o + 14] = z; ma[o + 15] = 1;
        const c = spCols[s.sp[i]];
        ca[3 * i] = c.r; ca[3 * i + 1] = c.g; ca[3 * i + 2] = c.b;
        // 影子
        const h = (y + HL) / K.L, w = K.D * (1.1 + 0.6 * h);   // 越高影子越大越淡（材質透明度固定，用面積稀釋）
        sa[o] = w; sa[o + 1] = 0; sa[o + 2] = 0; sa[o + 3] = 0;
        sa[o + 4] = 0; sa[o + 5] = 1; sa[o + 6] = 0; sa[o + 7] = 0;
        sa[o + 8] = 0; sa[o + 9] = 0; sa[o + 10] = w; sa[o + 11] = 0;
        sa[o + 12] = x; sa[o + 13] = -WL + 0.01 + 0.0005 * (i % 7); sa[o + 14] = z; sa[o + 15] = 1;
        // 可反應的一端
        if (steric && (s.sp[i] === K.A || s.sp[i] === K.C)) {
          const q = 16 * nc;
          v3.set(x + s.ux[i] * R * 0.78, y + s.uy[i] * R * 0.78, z + s.uz[i] * R * 0.78);
          m4.compose(v3, qI, sc.set(1, 1, 1));
          m4.toArray(cpa, q);
          const cc = capCol[s.sp[i] === K.A ? 0 : 1];
          cca[3 * nc] = cc.r; cca[3 * nc + 1] = cc.g; cca[3 * nc + 2] = cc.b;
          nc++;
        }
      }
      mols.count = N; shadows.count = N; caps.count = nc;
      mols.instanceMatrix.needsUpdate = true; mols.instanceColor.needsUpdate = true;
      shadows.instanceMatrix.needsUpdate = true;
      caps.instanceMatrix.needsUpdate = true; if (caps.instanceColor) caps.instanceColor.needsUpdate = true;
      // 閃光
      const fl = H.flashes();
      for (let k = 0; k < FL; k++) {
        const sp = sprites[k], f = fl[k];
        if (!f) { sp.visible = false; continue; }
        const u = (now - f.t0) / H.FL_DUR;
        if (u < 0 || u > 1) { sp.visible = false; continue; }
        sp.visible = true;
        sp.position.set(f.x - HL, f.y - HL, f.z - HL);
        if (f.kind === 1) {
          sp.material.map = ringTex;
          sp.material.color.set(colors.muted);
          sp.material.opacity = 0.75 * (1 - u);
          sp.scale.setScalar(K.D * (1.4 + 1.4 * u));
        } else {
          sp.material.map = glowTex;
          sp.material.color.copy(spCols[f.kind === 2 ? 2 : 0]);
          sp.material.opacity = 0.95 * (1 - u);
          sp.scale.setScalar(K.D * (2.2 + 3 * u));
        }
      }
      applyWall();
      // 文字疊層
      const hd = H.hud();
      hudTL.textContent = hd.t + (hd.paused ? T('（已暫停）', ' (paused)') : '');
      hudTR.textContent = hd.temp;
      hudTR.style.color = hd.tcol;
    }

    // ---------- 相機 ----------
    function fit(force) {
      const dist = (WL * 1.95) / Math.tan(camera.fov * Math.PI / 360) / Math.min(1, camera.aspect) * 1.0;
      if (force) {
        controls.target.set(0, 0, 0);
        camera.position.copy(viewDir).multiplyScalar(dist);
      }
      camera.updateProjectionMatrix();
      controls.update();
    }
    let vw = 0, vh = 0, raf = 0;
    function canvasHeight(w) { return w < 560 ? Math.round(Math.max(320, w * 0.95)) : Math.round(Math.min(480, Math.max(380, w * 0.62))); }
    function resize3() {
      const w = host.clientWidth;
      if (!w) return;
      const h = canvasHeight(w);
      canvas.style.height = h + 'px';
      vw = w; vh = h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
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
      onTheme: function () { applyColors(); lastT = -1; requestRender(); },
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
        glowTex.dispose(); ringTex.dispose(); shTex.dispose();
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
      vw = w0; vh = h0;
      renderer.setSize(w0, h0, false);
      camera.aspect = w0 / h0;
    }
    fit(true);
    return api;
  }

  window.Rate3D = { create: create };
})();
