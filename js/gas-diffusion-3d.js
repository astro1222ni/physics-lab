/*
 * gas-diffusion-3d.js — 「氣體擴散與逸散（格雷厄姆定律）」的 3D 立體檢視（可旋轉、縮放）
 *
 * three.js 由 gas-diffusion.js 在切換到 3D 時才以 import() 動態載入，再傳進 Gd3D.create(lib, host)。
 * 這個檔案只「讀」頁面的狀態（管中小點的位置、白煙環、容器裡的分子），不改變任何化學量；2D 與 3D 看的是同一批資料。
 * 擴散：玻璃管沿 x 軸橫放，長 LT、內半徑 RT，兩端是棉花與橡皮塞；白煙環是一圈白色雲團與管壁上的白霜。
 * 逸散：兩個立方玻璃容器並排，底部中央各有一個小孔，逸出的分子往下掉進真空。
 */
(function () {
  'use strict';
  const LT = 8, RT = 0.48, X0 = -LT / 2;
  const MAXD = 520;           // 管中小點的上限
  const MAXA = 2 * 40 * 7 + 2 * 30 * 7;   // 容器分子的原子上限
  const NPUFF = 60;
  const BOX = 2.2, GAP = 0.9;

  function create(lib, H) {
    const THREE = lib.THREE;
    const T = H.T, host = H.host;

    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('3D 立體檢視：玻璃管裡兩種氣體擴散、相遇生成白煙環；逸散模式是兩個有小孔的玻璃容器（拖曳旋轉、雙指或滾輪縮放）',
      '3D view: two gases spreading along a glass tube and forming a white ring where they meet; in effusion mode, two glass containers with pinholes (drag to rotate, pinch or scroll to zoom)'));
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
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.minDistance = 3;
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
    const axisX = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0));
    const tubeG = new THREE.Group(), effG = new THREE.Group();
    scene.add(tubeG); scene.add(effG);

    // ======================= 擴散：玻璃管 =======================
    const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.14, roughness: 0.05, metalness: 0, depthWrite: false, side: THREE.DoubleSide });
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(RT * 1.08, RT * 1.08, LT + 1.0, 48, 1, true), glassMat);
    glass.quaternion.copy(axisX);
    glass.renderOrder = 3;
    tubeG.add(glass);
    // 管壁的高光條（細長的白色條帶）
    const hlMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false });
    const hl = new THREE.Mesh(new THREE.CylinderGeometry(RT * 1.085, RT * 1.085, LT + 0.8, 24, 1, true, Math.PI * 0.08, Math.PI * 0.08), hlMat);
    hl.quaternion.copy(axisX);
    hl.renderOrder = 4;
    tubeG.add(hl);
    // 棉花（一團白色小球）與橡皮塞
    const cottonMat = new THREE.MeshStandardMaterial({ color: 0xf2f4f6, roughness: 0.95, metalness: 0 });
    const cottonL = new THREE.Group(), cottonR = new THREE.Group();
    const cottonGeo = new THREE.SphereGeometry(1, 12, 9);
    [cottonL, cottonR].forEach(function (g, side) {
      for (let i = 0; i < 16; i++) {
        const m = new THREE.Mesh(cottonGeo, cottonMat);
        const a = i * 2.39996, rr = RT * 0.45 * Math.sqrt((i % 8) / 8);
        const s = RT * (0.36 + 0.08 * Math.sin(i * 1.7));
        m.scale.setScalar(s);
        m.position.set((side ? 1 : -1) * (0.08 + 0.32 * (i / 16)), Math.cos(a) * rr, Math.sin(a) * rr);
        g.add(m);
      }
      g.position.x = side ? -X0 + 0.05 : X0 - 0.05;
      tubeG.add(g);
    });
    const stopMat = new THREE.MeshStandardMaterial({ color: 0x8c5a4f, roughness: 0.8, metalness: 0 });
    [-1, 1].forEach(function (s) {
      const st = new THREE.Mesh(new THREE.CylinderGeometry(RT * 1.25, RT * 1.05, 0.42, 36), stopMat);
      st.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-s, 0, 0));
      st.position.x = s * (LT / 2 + 0.62);
      tubeG.add(st);
    });
    // 支架與桌面陰影
    const standMat = new THREE.MeshStandardMaterial({ color: 0x7d858f, roughness: 0.5, metalness: 0.5 });
    [-0.3, 0.3].forEach(function (u) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 12), standMat);
      leg.position.set(u * LT, -RT - 0.45, 0);
      tubeG.add(leg);
      const clamp = new THREE.Mesh(new THREE.TorusGeometry(RT * 1.12, 0.035, 8, 32), standMat);
      clamp.rotation.y = Math.PI / 2;
      clamp.position.x = u * LT;
      tubeG.add(clamp);
    });
    const shadowTex = (function () {
      const c = document.createElement('canvas'); c.width = 128; c.height = 32;
      const g = c.getContext('2d'), gr = g.createRadialGradient(64, 16, 2, 64, 16, 62);
      gr.addColorStop(0, 'rgba(0,0,0,0.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.setTransform(1, 0, 0, 0.25, 0, 12); g.fillStyle = gr; g.fillRect(0, -64, 128, 128);
      return new THREE.CanvasTexture(c);
    })();
    const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(LT + 2, 1.6), shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -RT - 0.9;
    tubeG.add(shadow);
    // 刻度環
    const tickMat = new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.55 });
    const ticks = [];
    for (let k = 0; k <= 10; k++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(RT * 1.09, 0.006, 4, 40, Math.PI * 0.6), tickMat);
      ring.rotation.y = Math.PI / 2;
      ring.rotation.x = Math.PI * 0.2;
      ring.position.x = X0 + LT * k / 10;
      ticks.push(ring);
      tubeG.add(ring);
    }
    // 管中小點（兩種氣體共用一個 InstancedMesh）
    const dotMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0 });
    const dotsM = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), dotMat, MAXD);
    dotsM.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    dotsM.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXD * 3), 3);
    dotsM.frustumCulled = false;
    dotsM.count = 0;
    tubeG.add(dotsM);
    // 白煙：柔和的雲團精靈＋管壁白霜
    const puffTex = (function () {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    })();
    const puffs = [];
    for (let i = 0; i < NPUFF; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false, color: 0xffffff }));
      const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * RT * 0.8;
      sp.userData = { u: (Math.random() + Math.random() + Math.random() - 1.5) / 1.5, y: Math.cos(a) * r, z: Math.sin(a) * r, s: 0.35 + Math.random() * 0.35, ph: Math.random() * 6.28 };
      sp.visible = false;
      sp.renderOrder = 5;
      tubeG.add(sp);
      puffs.push(sp);
    }
    const frostMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const frost = new THREE.Mesh(new THREE.CylinderGeometry(RT * 1.0, RT * 1.0, 1, 40, 1, true), frostMat);
    frost.quaternion.copy(axisX);
    frost.renderOrder = 2;
    tubeG.add(frost);
    // 放大鏡的位置：一圈綠色的環
    const lensMat = new THREE.MeshBasicMaterial({ color: 0x0d7f57, transparent: true, opacity: 0.85 });
    const lens = new THREE.Mesh(new THREE.TorusGeometry(RT * 1.28, 0.03, 8, 48), lensMat);
    lens.rotation.y = Math.PI / 2;
    tubeG.add(lens);

    // ======================= 逸散：兩個容器 =======================
    const boxGlass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, roughness: 0.05, depthWrite: false, side: THREE.DoubleSide });
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x9fb4c8, transparent: true, opacity: 0.8 });
    const tintMats = [];
    const boxes = [];
    [0, 1].forEach(function (k) {
      const g = new THREE.Group();
      const cx = (k ? 1 : -1) * (BOX / 2 + GAP / 2);
      g.position.set(cx, 0.6, 0);
      const box = new THREE.Mesh(new THREE.BoxGeometry(BOX, BOX, BOX), boxGlass);
      box.renderOrder = 3;
      g.add(box);
      g.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(BOX, BOX, BOX)), edgeMat));
      const tm = new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.06, depthWrite: false, side: THREE.BackSide });
      tintMats.push(tm);
      g.add(new THREE.Mesh(new THREE.BoxGeometry(BOX * 0.99, BOX * 0.99, BOX * 0.99), tm));
      // 底部的小孔（黑色小圓）與下方的漏斗
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.06, 20), new THREE.MeshBasicMaterial({ color: 0x111418 }));
      hole.rotation.x = Math.PI / 2;
      hole.position.y = -BOX / 2 - 0.002;
      g.add(hole);
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 0.4, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0x9aa5b1, roughness: 0.4, metalness: 0.5, side: THREE.DoubleSide }));
      pipe.position.y = -BOX / 2 - 0.2;
      g.add(pipe);
      effG.add(g);
      boxes.push(g);
    });
    const vac = new THREE.Mesh(new THREE.BoxGeometry(2 * BOX + GAP + 0.8, 0.9, BOX + 0.4), new THREE.MeshStandardMaterial({ color: 0x2b3440, transparent: true, opacity: 0.35, roughness: 0.6, depthWrite: false }));
    vac.position.y = 0.6 - BOX / 2 - 0.9;
    effG.add(vac);
    const atomMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.32, metalness: 0.05, transparent: true, opacity: 1 });
    const atoms = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 10), atomMat, MAXA);
    atoms.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    atoms.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXA * 3), 3);
    atoms.frustumCulled = false;
    atoms.count = 0;
    effG.add(atoms);
    // 每個分子固定的深度（z）與旋轉傾角
    const ZS = [];
    for (let i = 0; i < 400; i++) ZS.push([Math.random() * 2 - 1, Math.random() * 6.283]);

    function applyColors() {
      colors = H.colors();
      tickMat.color.set(colors.muted);
      glassMat.opacity = colors.dark ? 0.12 : 0.16;
      boxGlass.opacity = colors.dark ? 0.1 : 0.13;
      lensMat.color.set(colors.accent);
      hlMat.opacity = colors.dark ? 0.18 : 0.4;
      edgeMat.color.set(colors.dark ? 0x7d93a8 : 0x8aa2ba);
      shadowMat.opacity = colors.dark ? 0.9 : 0.6;
    }

    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e3 = new THREE.Euler(), pv = new THREE.Vector3(), sv = new THREE.Vector3(), off = new THREE.Vector3();
    const tmpC = new THREE.Color(), q0 = new THREE.Quaternion();
    function updTube(now) {
      const tb = H.tube();
      tubeG.visible = true; effG.visible = false;
      if (!tb) { dotsM.count = 0; return; }
      const L = tb.L, xs = function (xcm) { return X0 + LT * xcm / L; };
      // 刻度：每 10% 管長一圈
      // 小點
      let k = 0;
      [0, 1].forEach(function (side) {
        const ds = H.dots(side);
        tmpC.set(H.gasColor(side ? tb.acid : tb.base));
        for (let i = 0; i < ds.length && k < MAXD; i++) {
          const d = ds[i];
          let y = d.y, z = d.z;
          const rr = Math.hypot(y, z);
          if (rr > 1) { y /= rr; z /= rr; }
          pv.set(xs(d.x), y * (RT - 0.05), z * (RT - 0.05));
          const r = 0.026 * Math.max(0.2, d.a);
          sv.set(r, r, r);
          m4.compose(pv, q0, sv);
          dotsM.setMatrixAt(k, m4);
          dotsM.setColorAt(k, tmpC);
          k++;
        }
      });
      dotsM.count = k;
      dotsM.instanceMatrix.needsUpdate = true;
      if (dotsM.instanceColor) dotsM.instanceColor.needsUpdate = true;
      // 棉花沾溼後略帶顏色
      cottonMat.color.set(tb.wet ? '#eef1f3' : '#f6f7f8');
      // 白煙環
      const rg = tb.ring, amp = tb.amp;
      if (rg && amp > 0) {
        const w = 0.012 * L + 0.02 * L * Math.sqrt(Math.max(0, tb.t - rg.t) / rg.t);
        const xr = xs(rg.x), wl = LT * w / L;
        const still = !H.running();
        puffs.forEach(function (sp) {
          const u = sp.userData;
          sp.visible = true;
          sp.position.set(xr + u.u * wl * 1.6 + (still ? 0 : 0.01 * Math.sin(now * 0.0007 + u.ph)), u.y, u.z);
          sp.material.opacity = 0.5 * amp * Math.exp(-u.u * u.u * 1.1);
          sp.scale.setScalar(RT * u.s * (0.8 + 0.6 * amp) * 2);
        });
        frost.visible = true;
        frost.scale.set(1, Math.max(0.01, 2 * wl), 1);
        frost.position.x = xr;
        frostMat.opacity = 0.55 * amp;
      } else {
        puffs.forEach(function (sp) { sp.visible = false; });
        frost.visible = false;
      }
      lens.position.x = X0 + LT * tb.lensU;
    }
    function updEff() {
      tubeG.visible = false; effG.visible = true;
      const ef = H.eff();
      if (!ef) { atoms.count = 0; return; }
      const ch = H.cham(), esc = H.escaping(), now = performance.now();
      let k = 0, zi = 0;
      const R0 = 0.035;
      [0, 1].forEach(function (b) {
        tintMats[b].color.set(H.tempTint(b ? ef.TB : ef.TA));
        const sp = b ? ef.B : ef.A;
        const mol = H.MOL[sp] || H.MOL.X;
        const cx = boxes[b].position.x, cy = boxes[b].position.y, half = BOX / 2 - 0.08;
        const put = function (x, y, z, ang, tilt, sc) {
          e3.set(tilt, 0, ang);
          q.setFromEuler(e3);
          for (let j = 0; j < mol.length && k < MAXA; j++) {
            const at = mol[j];
            off.set(at[1] * R0, -at[2] * R0, 0).applyQuaternion(q);
            const r = (H.ATOM_R[at[0]] || 1) * R0 * sc;
            sv.set(r, r, r);
            pv.set(x, y, z);
            m4.compose(off.add(pv), q, sv);
            atoms.setMatrixAt(k, m4);
            tmpC.set(colors.el[at[0]] || '#888888');
            atoms.setColorAt(k, tmpC);
            k++;
          }
        };
        ch[b].forEach(function (m, i) {
          const zz = ZS[(zi + i) % ZS.length];
          put(cx + (m.x - 0.5) * 2 * half, cy - (m.y - 0.5) * 2 * half, zz[0] * half, m.ang, zz[1], 1);
        });
        zi += 40;
        esc[b].forEach(function (e) {
          const u = Math.min(1, (now - e.t0) / 900);
          put(cx + (e.x - 0.5) * 2 * half, cy - BOX / 2 - (e.y - 0.96) * 2 * half - 0.05, 0, e.ang, 0.3, Math.max(0.05, 1 - u));
        });
      });
      atoms.count = k;
      atoms.instanceMatrix.needsUpdate = true;
      if (atoms.instanceColor) atoms.instanceColor.needsUpdate = true;
    }
    function update(now) {
      if (H.mode() === 'diff') updTube(now); else updEff();
      const hd = H.hud();
      hudTL.textContent = hd.tl;
      hudTR.textContent = hd.tr;
    }

    function fit(force) {
      const diff = H.mode() === 'diff';
      const span = diff ? LT + 2.2 : 2 * BOX + GAP + 1.4;
      const dist = (span * (diff ? 0.4 : 0.48)) / Math.tan(camera.fov * Math.PI / 360) / Math.min(1.25, camera.aspect);
      if (force) {
        const dir = diff ? new THREE.Vector3(0.12, 0.5, 1).normalize() : new THREE.Vector3(0.35, 0.45, 1).normalize();
        controls.target.set(0, diff ? 0 : 0.2, 0);
        camera.position.copy(dir).multiplyScalar(dist).add(controls.target);
      }
      camera.updateProjectionMatrix();
      controls.update();
    }
    let vw = 0, raf = 0;
    function canvasHeight(w) { return w < 560 ? Math.round(Math.max(300, w * 0.84)) : 420; }
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
      rebuild: function () { fit(true); requestRender(); },
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
        puffTex.dispose(); shadowTex.dispose();
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

  window.Gd3D = { create: create };
})();
