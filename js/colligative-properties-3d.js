/*
 * colligative-properties-3d.js — 「沸點上升與凝固點下降」的 3D 立體檢視（分子示意，可旋轉、縮放）
 *
 * three.js 由 colligative-properties.js 在切換到 3D 時才以 import() 動態載入，再傳進 Coll3D.create(lib, host)。
 * 這個檔案只「讀」頁面的狀態（同一次實驗的溫度、結冰比例、溶劑莫耳分率），不改變任何化學量。
 * 為什麼要立體：液面是一個「面」，溶質粒子占掉液面上的位置、溶劑分子能逃走的位置就少了；
 * 從斜上方看整片液面（或整片固液界面）才看得出「占位」的意思，側視的 2D 只看得到一排。
 *  - 沸點模式：一塊液體（上表面是液面），上方是蒸氣。蒸氣分子數依 x溶劑 × P°(T)（克勞修斯—克拉佩龍式），
 *    分子只從「溶劑」的表面位置蒸發，碰到液面就凝結；液面上溶質占的位置發亮標出。
 *  - 凝固點模式：底部是排列整齊的晶體（只有溶劑分子），厚度隨結冰比例增加；溶質粒子全部留在上方的液體裡。
 *  - 溶質粒子數放大 EXAG 倍（頁面註明）；真實 i 小於理想值時，畫出配對的離子（或雙分子）。
 */
(function () {
  'use strict';
  const NX = 13, NZ = 13, NY = 7;     // 溶劑格點
  const SP = 0.78;                    // 格點間距
  const RM = 0.3;                     // 溶劑分子半徑
  const MAXV = 90;                    // 蒸氣分子上限
  const W = NX * SP, D = NZ * SP, HL = NY * SP, HV = 6.5;

  function rnd(k) { const s = Math.sin(k * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); }

  function create(lib, H) {
    const THREE = lib.THREE;
    const T = H.T, host = H.host;

    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('分子示意的 3D 立體檢視：液面與蒸氣，或固液界面（拖曳旋轉、雙指或滾輪縮放）',
      '3D molecular view: the liquid surface and vapour, or the solid–liquid interface (drag to rotate, pinch or scroll to zoom)'));
    canvas.setAttribute('role', 'img');
    host.appendChild(canvas);
    const huds = ['tl', 'tr', 'bl', 'br'].map(function (p) { const d = document.createElement('div'); d.className = 'r3-hud ' + p; d.setAttribute('aria-hidden', 'true'); host.appendChild(d); return d; });
    huds[2].textContent = T('拖曳旋轉・滾輪或雙指縮放', 'Drag to rotate · scroll or pinch to zoom');

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: 'default' });
    } catch (e) {
      canvas.remove(); huds.forEach(function (d) { d.remove(); });
      throw e;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1.5, 0.5, 300);
    const viewDir = new THREE.Vector3(0.55, 0.62, 1).normalize();
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.minDistance = 8;
    controls.maxDistance = 60;
    controls.enablePan = false;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 1.35));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(-8, 18, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const sc = sun.shadow.camera; sc.left = -12; sc.right = 12; sc.top = 12; sc.bottom = -12; sc.near = 1; sc.far = 50;
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0xffffff, 0.45);
    rim.position.set(10, 4, -10);
    scene.add(rim);

    // ---------- 底座與容器 ----------
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x5d6670, roughness: 0.8, metalness: 0.1 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(W + 1.6, 0.4, D + 1.6), baseMat);
    base.position.y = -0.2 - 0.05;
    base.receiveShadow = true;
    scene.add(base);
    const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, roughness: 0.05, metalness: 0, depthWrite: false, side: THREE.DoubleSide });
    const box = new THREE.Mesh(new THREE.BoxGeometry(W + 0.3, HL + HV, D + 0.3), glassMat);
    box.position.y = (HL + HV) / 2;
    box.renderOrder = 3;
    scene.add(box);
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.5 });
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry), edgeMat);
    edges.position.copy(box.position);
    scene.add(edges);
    // 液體（半透明色塊）與液面
    const liqMat = new THREE.MeshStandardMaterial({ color: 0x88bbdd, transparent: true, opacity: 0.18, roughness: 0.1, depthWrite: false });
    const liq = new THREE.Mesh(new THREE.BoxGeometry(W + 0.2, 1, D + 0.2), liqMat);
    liq.renderOrder = 2;
    scene.add(liq);
    const surfMat = new THREE.MeshStandardMaterial({ color: 0x88bbdd, transparent: true, opacity: 0.22, roughness: 0.05, depthWrite: false, side: THREE.DoubleSide });
    const surf = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.2, D + 0.2), surfMat);
    surf.rotation.x = -Math.PI / 2;
    surf.renderOrder = 2;
    scene.add(surf);
    // 晶體（固體）色塊
    const iceMat = new THREE.MeshStandardMaterial({ color: 0xe8f6ff, transparent: true, opacity: 0.3, roughness: 0.2, depthWrite: false });
    const ice = new THREE.Mesh(new THREE.BoxGeometry(W + 0.2, 1, D + 0.2), iceMat);
    ice.renderOrder = 2;
    scene.add(ice);

    // ---------- 分子 ----------
    const NS = NX * NY * NZ;
    const molMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.05 });
    const mols = new THREE.InstancedMesh(new THREE.SphereGeometry(RM, 14, 10), molMat, NS);
    mols.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mols.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(NS * 3), 3);
    mols.castShadow = true; mols.receiveShadow = true;
    mols.frustumCulled = false;
    scene.add(mols);
    const soMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.28, metalness: 0.05, emissive: 0x000000 });
    const solA = new THREE.InstancedMesh(new THREE.SphereGeometry(RM * 1.45, 18, 12), soMat, NS);
    const solB = new THREE.InstancedMesh(new THREE.SphereGeometry(RM * 1.45, 18, 12), soMat, NS);
    [solA, solB].forEach(function (m) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(NS * 3), 3);
      m.castShadow = true; m.frustumCulled = false; m.count = 0;
      scene.add(m);
    });
    // 液面上被溶質占的位置：發亮的圓環
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffcc33, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
    const rings = new THREE.InstancedMesh(new THREE.RingGeometry(RM * 1.7, RM * 2.1, 24), ringMat, NX * NZ);
    rings.frustumCulled = false; rings.count = 0;
    scene.add(rings);
    const vapMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.05, transparent: true, opacity: 0.95 });
    const vap = new THREE.InstancedMesh(new THREE.SphereGeometry(RM, 12, 8), vapMat, MAXV);
    vap.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    vap.frustumCulled = false; vap.count = 0;
    scene.add(vap);

    let colors = H.colors();
    function applyColors() {
      colors = H.colors();
      const r = H.run();
      edgeMat.color.set(colors.muted);
      baseMat.color.set(colors.dark ? 0x3b4148 : 0x8d969f);
      glassMat.opacity = colors.dark ? 0.06 : 0.09;
      const lc = H.liquidColor();
      liqMat.color.set(lc); surfMat.color.set(lc);
      liqMat.opacity = colors.dark ? 0.22 : 0.2;
      molMat.color.set(0xffffff);
      vapMat.color.set(colors.mol[r.solvent] || '#888888');
      ringMat.color.set(colors.accent);
      iceMat.color.set(colors.ice);
    }

    // 蒸氣分子：位置、速度
    const vp = [];
    for (let k = 0; k < MAXV; k++) vp.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 });
    let surfaceY = HL, solventSites = [];
    function emit(v) {
      if (!solventSites.length) return false;
      const s = solventSites[Math.floor(Math.random() * solventSites.length)];
      v.on = true; v.x = s[0]; v.z = s[1]; v.y = surfaceY + RM;
      const sp = 2.2 + Math.random() * 1.6, th = Math.random() * Math.PI * 2, up = 0.55 + Math.random() * 0.45;
      v.vy = sp * up; v.vx = sp * Math.sqrt(1 - up * up) * Math.cos(th); v.vz = sp * Math.sqrt(1 - up * up) * Math.sin(th);
      return true;
    }

    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pv = new THREE.Vector3(), sv = new THREE.Vector3(1, 1, 1), tmpC = new THREE.Color();
    const qFlat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    const solC3 = new THREE.Color();
    let phase = 0;
    function slotPos(ix, iy, iz) { return [-W / 2 + SP / 2 + ix * SP + (iy % 2 ? SP * 0.25 : 0), SP / 2 + iy * SP, -D / 2 + SP / 2 + iz * SP + (iy % 2 ? SP * 0.25 : 0)]; }
    function update(dt) {
      const r = H.run();
      if (!r) return;
      if (!H.reducedMotion) phase += dt;
      const f = r.mode === 'f';
      const x1 = H.moleFrac();
      const x2 = Math.min(0.4, (1 - x1) * H.exag);
      const so = r.w2 > 0 ? r.so : null;
      const solCol = colors.mol[r.solvent] || '#888888';
      const iceCol = colors.ice;
      solC3.set(solCol);
      // 結冰的層數
      const ff = f ? H.frozen() : 0;
      const nIce = f && r.nucleated ? Math.min(NY - 2, Math.max(1, Math.round(NY * (0.15 + 1.1 * ff)))) : 0;
      const amp = H.reducedMotion ? 0 : 0.07 + 0.002 * Math.max(0, r.T + 20);
      // 液體頂（沸騰模式整塊都是液體；凝固模式也一樣，晶體從底部長）
      surfaceY = NY * SP;
      liq.scale.set(1, Math.max(0.01, surfaceY - nIce * SP), 1);
      liq.position.y = nIce * SP + (surfaceY - nIce * SP) / 2;
      surf.position.y = surfaceY + 0.01;
      surf.visible = !f;
      ice.visible = nIce > 0;
      ice.scale.set(1, Math.max(0.01, nIce * SP), 1);
      ice.position.y = nIce * SP / 2;
      let k = 0, a = 0, b = 0, nr = 0;
      solventSites = [];
      const ions = so && so.ions;
      const pairFrac = ions && !r.ideal ? (ions.length - r.i) / Math.max(1, ions.length - 1) : 0;
      for (let iy = 0; iy < NY; iy++) {
        for (let ix = 0; ix < NX; ix++) {
          for (let iz = 0; iz < NZ; iz++) {
            const idx = (iy * NX + ix) * NZ + iz;
            const p = slotPos(ix, iy, iz);
            const solid = iy < nIce;
            const jx = solid ? 0 : amp * Math.sin(phase * 5.3 + idx * 1.7), jy = solid ? 0 : amp * Math.sin(phase * 4.1 + idx * 2.3), jz = solid ? 0 : amp * Math.cos(phase * 4.7 + idx * 0.9);
            const isS = !solid && so && rnd(idx + 300) < x2;
            pv.set(p[0] + jx, p[1] + jy, p[2] + jz);
            if (isS) {
              const top = iy === NY - 1;
              let cA, cB = null;
              if (ions) { cA = colors.ion[ions[0]]; if (rnd(idx + 900) < pairFrac) cB = colors.ion[ions[1]]; }
              else { cA = colors.ion[so.key] || colors.ion.X; if (so.dimer && !r.ideal) cB = cA; }
              m4.compose(pv, q.identity(), sv.set(1, 1, 1));
              solA.setMatrixAt(a, m4); solA.setColorAt(a, tmpC.set(cA)); a++;
              if (cB) {
                pv.x += RM * 2.6;
                m4.compose(pv, q.identity(), sv.set(ions ? 1.15 : 1, ions ? 1.15 : 1, ions ? 1.15 : 1));
                solB.setMatrixAt(b, m4); solB.setColorAt(b, tmpC.set(cB)); b++;
                pv.x -= RM * 2.6;
              }
              if (top && !f) { pv.y = surfaceY + 0.03; m4.compose(pv, qFlat, sv.set(1, 1, 1)); rings.setMatrixAt(nr++, m4); }
            } else {
              m4.compose(pv, q.identity(), sv.set(1, 1, 1));
              mols.setMatrixAt(k, m4);
              tmpC.set(solid ? iceCol : solCol);
              if (solid) tmpC.lerp(solC3, 0.35);   // 晶體：偏白的溶劑色
              mols.setColorAt(k, tmpC);
              k++;
              if (iy === NY - 1) solventSites.push([p[0], p[2]]);
            }
          }
        }
      }
      mols.count = k; solA.count = a; solB.count = b; rings.count = f ? 0 : nr;
      [mols, solA, solB, rings].forEach(function (m) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; });
      // 蒸氣
      if (!f) {
        const target = Math.min(MAXV, Math.round(70 * H.vaporP() / 101.325));
        let on = 0;
        vp.forEach(function (v) { if (v.on) on++; });
        const ddt = H.reducedMotion ? 0 : Math.min(0.05, dt);
        if (H.reducedMotion) {
          // 靜止畫面：直接放 target 個在固定位置
          vp.forEach(function (v, i) { v.on = i < target; if (v.on) { v.x = (rnd(i + 11) - 0.5) * W; v.z = (rnd(i + 23) - 0.5) * D; v.y = surfaceY + 0.6 + rnd(i + 37) * (HV - 1.2); } });
        } else {
          // 蒸發：少於平衡數目時從溶劑的表面位置冒出
          let need = target - on;
          for (let i = 0; i < MAXV && need > 0; i++) if (!vp[i].on && Math.random() < 0.15) { if (emit(vp[i])) need--; }
          vp.forEach(function (v) {
            if (!v.on) return;
            v.x += v.vx * ddt; v.y += v.vy * ddt; v.z += v.vz * ddt;
            if (Math.abs(v.x) > W / 2 - RM) { v.vx = -v.vx; v.x = Math.sign(v.x) * (W / 2 - RM); }
            if (Math.abs(v.z) > D / 2 - RM) { v.vz = -v.vz; v.z = Math.sign(v.z) * (D / 2 - RM); }
            if (v.y > surfaceY + HV - RM) { v.vy = -Math.abs(v.vy); }
            if (v.y < surfaceY + RM && v.vy < 0) {
              // 碰到液面就凝結；數目太多時不再補回
              v.on = false;
              if (on <= target) emit(v); else on--;
            }
          });
        }
        let n = 0;
        vp.forEach(function (v) { if (!v.on || n >= MAXV) return; m4.compose(pv.set(v.x, v.y, v.z), q.identity(), sv.set(1, 1, 1)); vap.setMatrixAt(n++, m4); });
        vap.count = n;
        vap.instanceMatrix.needsUpdate = true;
      } else vap.count = 0;
      const hd = H.hud();
      huds[0].textContent = hd.tl;
      huds[1].innerHTML = hd.tr;
      huds[3].textContent = hd.br;
    }

    function fit(force) {
      const span = Math.max(W, HL + HV) * 1.25;
      const dist = (span * 0.6) / Math.tan(camera.fov * Math.PI / 360) / Math.min(1.25, camera.aspect);
      if (force) {
        controls.target.set(0, (HL + HV) * 0.42, 0);
        camera.position.copy(viewDir).multiplyScalar(dist).add(controls.target);
      }
      camera.updateProjectionMatrix();
      controls.update();
    }
    let vw = 0;
    function canvasHeight(w) { return w < 560 ? Math.round(Math.max(320, w * 0.95)) : 430; }
    function resize3() {
      const w = host.clientWidth;
      if (!w) return;
      const h = canvasHeight(w);
      canvas.style.height = h + 'px';
      vw = w;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      fit(false);
      H.kick();
    }
    const ro = window.ResizeObserver ? new ResizeObserver(function () { if (host.clientWidth !== vw) resize3(); }) : null;
    if (ro) ro.observe(host); else window.addEventListener('resize', resize3);
    controls.addEventListener('change', function () { H.kick(); });
    canvas.addEventListener('webglcontextlost', function (ev) {
      ev.preventDefault();
      if (api.active) H.contextLost();
    });

    const api = {
      active: true,
      /** 頁面主迴圈每一幀呼叫一次；傳回鏡頭是否還在滑動（阻尼） */
      frame: function (dt) {
        if (!api.active || document.hidden) return false;
        const moved = controls.update();
        update(dt || 0);
        renderer.render(scene, camera);
        return !!moved;
      },
      animating: function () { return api.active; },
      rebuild: function () { applyColors(); vp.forEach(function (v) { v.on = false; }); },
      onTheme: function () { applyColors(); },
      resetCamera: function () { fit(true); },
      dispose: function () {
        api.active = false;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        controls.dispose();
        const mats = new Set();
        scene.traverse(function (o) {
          if (o.geometry) o.geometry.dispose();
          if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { mats.add(m); });
        });
        mats.forEach(function (m) { m.dispose(); });
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

  window.Coll3D = { create: create };
})();
