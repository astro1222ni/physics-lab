/*
 * flame-test-3d.js — 「焰色反應」的 3D 檢視：本生燈火焰的內焰與外焰、白金絲的位置、最熱的地方、鈷玻璃、背景燈與分光鏡的光路（可旋轉、縮放）
 *
 * three.js 由 flame-test.js 在切換到 3D 時才以 import() 動態載入，再傳進 FT3D.create(lib, host)。
 * 這個檔案只「讀」頁面算好的狀態（host.get()：火焰形狀、溫度、白金絲高度、焰色、最亮的幾條譜線），不做任何化學計算。
 * 長度單位：1 = 10 mm；燈管口在 y = 0，火焰沿 +y；光路沿 +x（燈 → 火焰 → 鈷玻璃 → 分光鏡），稜鏡把光依波長往 +z 方向分開。
 */
(function () {
  'use strict';
  const MM = 0.1;          // 1 mm = 0.1 單位
  const TUBE_R = 0.62;     // 燈管半徑（約 6 mm）
  const N_PROF = 40;

  function create(lib, H) {
    const THREE = lib.THREE;
    const T = H.T, host = H.host;

    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('本生燈與分光鏡的 3D 檢視：內焰、外焰、白金絲、最熱的地方與光路（拖曳旋轉、雙指或滾輪縮放）',
      '3D view of the Bunsen burner and spectroscope: inner cone, outer flame, platinum wire, hottest point and light path (drag to rotate, pinch or scroll to zoom)'));
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
    const camera = new THREE.PerspectiveCamera(34, 1.5, 0.1, 200);
    const viewDir = new THREE.Vector3(-0.35, 0.42, 1).normalize();
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.minDistance = 5;
    controls.maxDistance = 60;
    controls.enablePan = false;
    controls.maxPolarAngle = Math.PI * 0.53;

    const hemi = new THREE.HemisphereLight(0xffffff, 0x8a8f99, 1.25);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(-6, 14, 9);
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0xffffff, 0.45);
    rim.position.set(10, 4, -8);
    scene.add(rim);
    const glowLight = new THREE.PointLight(0xffaa66, 0, 8, 2);
    scene.add(glowLight);

    const disposables = [];
    function keep(x) { disposables.push(x); return x; }
    function std(color, o) { return keep(new THREE.MeshStandardMaterial(Object.assign({ color: color, roughness: 0.5, metalness: 0.2 }, o || {}))); }
    function glowMat(color, opacity) {
      return keep(new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    }

    // ---------- 桌面 ----------
    const tableMat = std(0xdfe3e8, { roughness: 0.9, metalness: 0 });
    const table = new THREE.Mesh(keep(new THREE.BoxGeometry(18, 0.16, 8)), tableMat);
    table.position.set(2.6, -3.2 - 0.08, 0.8);
    scene.add(table);

    // ---------- 本生燈 ----------
    const metal = std(0xb0b8c4, { metalness: 0.75, roughness: 0.3 });
    const brass = std(0xc9a35c, { metalness: 0.8, roughness: 0.32 });
    const dark = std(0x1a1c22, { metalness: 0, roughness: 0.8 });
    const base = new THREE.Mesh(keep(new THREE.CylinderGeometry(1.4, 1.6, 0.35, 40)), metal);
    base.position.y = -3.2 + 0.175; scene.add(base);
    const tube = new THREE.Mesh(keep(new THREE.CylinderGeometry(TUBE_R, TUBE_R, 2.85, 32, 1, true)), metal);
    tube.position.y = -1.425; scene.add(tube);
    const lip = new THREE.Mesh(keep(new THREE.TorusGeometry(TUBE_R, 0.04, 8, 32)), metal);
    lip.rotation.x = Math.PI / 2; scene.add(lip);
    const collar = new THREE.Mesh(keep(new THREE.CylinderGeometry(TUBE_R + 0.1, TUBE_R + 0.1, 0.55, 32)), brass);
    collar.position.y = -2.35; scene.add(collar);
    const hole = new THREE.Mesh(keep(new THREE.BoxGeometry(0.5, 0.26, 0.05)), dark);
    hole.position.set(0, -2.35, TUBE_R + 0.11); scene.add(hole);
    const gasPipe = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.12, 0.12, 1.6, 12)), std(0xd0704a, { metalness: 0, roughness: 0.6 }));
    gasPipe.rotation.z = Math.PI / 2; gasPipe.position.set(-1.9, -2.95, 0); scene.add(gasPipe);

    // ---------- 火焰（旋轉體） ----------
    function flameR(hmm, F) {
      const u = hmm / F.Hf;
      if (u < 0 || u > 1) return 0;
      return TUBE_R * 1.05 * (1 + 1.1 * Math.sin(Math.PI * Math.pow(u, 0.55) * 0.9)) * Math.pow(1 - u, 0.5);
    }
    function profile(F, h0, scale) {
      const pts = [];
      const a = Math.max(0, h0), b = F.Hf;
      if (b <= a) return null;
      pts.push(new THREE.Vector2(0, a * MM));
      for (let i = 0; i <= N_PROF; i++) { const hh = a + (b - a) * i / N_PROF; pts.push(new THREE.Vector2(Math.max(0.001, flameR(hh, F) * scale), hh * MM)); }
      return pts;
    }
    const outerMat = glowMat(0x5a78ff, 0.22);
    const sootMat = glowMat(0xffbe50, 0);
    const metalMat = glowMat(0xffffff, 0);
    const coneMat = glowMat(0x46c8e6, 0.55);
    const outer = new THREE.Mesh(new THREE.BufferGeometry(), outerMat); outer.renderOrder = 2; scene.add(outer);
    const sootM = new THREE.Mesh(new THREE.BufferGeometry(), sootMat); sootM.renderOrder = 3; scene.add(sootM);
    const metalM = new THREE.Mesh(new THREE.BufferGeometry(), metalMat); metalM.renderOrder = 4; scene.add(metalM);
    const cone = new THREE.Mesh(new THREE.BufferGeometry(), coneMat); cone.renderOrder = 5; scene.add(cone);
    const coneEdge = new THREE.LineSegments(new THREE.BufferGeometry(), keep(new THREE.LineBasicMaterial({ color: 0x3a7bff, transparent: true, opacity: 0.7 })));
    scene.add(coneEdge);
    function setGeo(mesh, geo) { if (mesh.geometry) mesh.geometry.dispose(); mesh.geometry = geo || new THREE.BufferGeometry(); }

    // ---------- 溫度柱（旁邊的色條）＋ 最熱點 ----------
    const tbCanvas = document.createElement('canvas'); tbCanvas.width = 4; tbCanvas.height = 256;
    const tbTex = keep(new THREE.CanvasTexture(tbCanvas));
    tbTex.colorSpace = THREE.SRGBColorSpace || tbTex.colorSpace;
    const tbar = new THREE.Mesh(keep(new THREE.BoxGeometry(0.22, 13.5, 0.22)), keep(new THREE.MeshBasicMaterial({ map: tbTex })));
    tbar.position.set(-2.6, 13.5 / 2, 0); scene.add(tbar);
    const hotMat = keep(new THREE.MeshStandardMaterial({ color: 0xd1453b, emissive: 0x7a1510, roughness: 0.4 }));
    const hotDot = new THREE.Mesh(keep(new THREE.OctahedronGeometry(0.2, 0)), hotMat); scene.add(hotDot);
    const hotRing = new THREE.Mesh(keep(new THREE.TorusGeometry(1, 0.025, 6, 48)), keep(new THREE.MeshBasicMaterial({ color: 0xd1453b, transparent: true, opacity: 0.7 })));
    hotRing.rotation.x = Math.PI / 2; scene.add(hotRing);

    // ---------- 白金絲 ----------
    const wireMat = keep(new THREE.MeshStandardMaterial({ color: 0xc9ced6, metalness: 0.9, roughness: 0.25, emissive: 0x000000 }));
    const wireG = new THREE.Group(); scene.add(wireG);
    const loop = new THREE.Mesh(keep(new THREE.TorusGeometry(0.22, 0.025, 8, 28)), wireMat);
    loop.rotation.y = Math.PI / 2; wireG.add(loop);
    const wireRod = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.02, 0.02, 2.2, 8)), wireMat);
    wireRod.rotation.x = Math.PI / 2; wireRod.position.z = 0.22 + 1.1; wireG.add(wireRod);
    const handle = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.11, 0.11, 2.2, 16)), std(0x8a6f4e, { metalness: 0, roughness: 0.7 }));
    handle.rotation.x = Math.PI / 2; handle.position.z = 0.22 + 2.2 + 1.1; wireG.add(handle);
    const bead = new THREE.Mesh(keep(new THREE.SphereGeometry(0.07, 12, 8)), std(0xf4f4f4, { metalness: 0, roughness: 0.6 }));
    bead.position.y = -0.2; wireG.add(bead);

    // ---------- 光路 ----------
    const XL = -4.2, XC = 2.6, XS = 3.4, LCOLL = 2.6;
    const lampMat = keep(new THREE.MeshBasicMaterial({ color: 0xffd090 }));
    const lamp = new THREE.Mesh(keep(new THREE.SphereGeometry(0.42, 24, 16)), lampMat);
    const lampHalo = new THREE.Mesh(keep(new THREE.SphereGeometry(0.9, 24, 16)), glowMat(0xffd090, 0.25));
    const lampStand = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.08, 0.08, 1, 10)), metal);
    scene.add(lamp); scene.add(lampHalo); scene.add(lampStand);
    const beamMat = keep(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }));
    const beam = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.035, 0.035, 1, 8)), beamMat);
    beam.rotation.z = Math.PI / 2; scene.add(beam);
    const coGlass = new THREE.Mesh(keep(new THREE.BoxGeometry(0.08, 2.2, 1.8)), keep(new THREE.MeshPhysicalMaterial({ color: 0x3355dd, transparent: true, opacity: 0.55, roughness: 0.1, metalness: 0, depthWrite: false })));
    scene.add(coGlass);
    const coll = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.28, 0.28, LCOLL, 24)), std(0x5e6876, { metalness: 0.6, roughness: 0.4 }));
    coll.rotation.z = Math.PI / 2; scene.add(coll);
    const slit = new THREE.Mesh(keep(new THREE.BoxGeometry(0.03, 0.4, 0.06)), keep(new THREE.MeshBasicMaterial({ color: 0xffffff })));
    scene.add(slit);
    const prism = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.62, 0.62, 0.9, 3)), keep(new THREE.MeshPhysicalMaterial({ color: 0xcfe2ff, transparent: true, opacity: 0.45, roughness: 0.05, metalness: 0, depthWrite: false })));
    scene.add(prism);
    const screenMat = std(0x101216, { metalness: 0, roughness: 0.9 });
    const screen = new THREE.Mesh(keep(new THREE.BoxGeometry(0.06, 0.9, 3.2)), screenMat);
    scene.add(screen);
    const rayGeo = keep(new THREE.CylinderGeometry(0.025, 0.025, 1, 6));
    const dotGeo = keep(new THREE.BoxGeometry(0.03, 0.7, 0.05));
    const rays = [];
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(rayGeo, keep(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false })));
      const d = new THREE.Mesh(dotGeo, keep(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 })));
      m.visible = false; d.visible = false; scene.add(m); scene.add(d); rays.push([m, d]);
    }

    // ---------- 標籤（貼圖文字） ----------
    const labels = [];
    function label(text, size) {
      const c = document.createElement('canvas'), g = c.getContext('2d');
      const f = '600 44px system-ui, -apple-system, "Segoe UI", "Noto Sans TC", sans-serif';
      g.font = f; const w = Math.ceil(g.measureText(text).width) + 36;
      c.width = w; c.height = 64;
      const tex = keep(new THREE.CanvasTexture(c));
      tex.colorSpace = THREE.SRGBColorSpace || tex.colorSpace;
      const sp = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true })));
      sp.renderOrder = 10;
      const s = size || 0.56; sp.scale.set(s * w / 64, s, 1);
      sp.userData = { c: c, tex: tex, text: text, f: f };
      labels.push(sp); scene.add(sp);
      return sp;
    }
    function paintLabels(isDark) {
      labels.forEach(function (sp) {
        const u = sp.userData, g = u.c.getContext('2d');
        g.clearRect(0, 0, u.c.width, u.c.height);
        g.fillStyle = isDark ? 'rgba(20,24,32,0.82)' : 'rgba(255,255,255,0.88)';
        const r = 16, w = u.c.width, h = u.c.height;
        g.beginPath(); g.moveTo(r, 2); g.lineTo(w - r, 2); g.quadraticCurveTo(w - 2, 2, w - 2, r); g.lineTo(w - 2, h - r); g.quadraticCurveTo(w - 2, h - 2, w - r, h - 2);
        g.lineTo(r, h - 2); g.quadraticCurveTo(2, h - 2, 2, h - r); g.lineTo(2, r); g.quadraticCurveTo(2, 2, r, 2); g.fill();
        g.font = u.f; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = isDark ? '#e8ecf3' : '#1f2430'; g.fillText(u.text, w / 2, h / 2 + 2);
        u.tex.needsUpdate = true;
      });
    }
    const lbOuter = label(T('外焰', 'Outer flame'));
    const lbCone = label(T('內焰', 'Inner cone'));
    const lbHot = label(T('最熱', 'Hottest'));
    const lbWire = label(T('白金絲', 'Platinum wire'));
    const lbCo = label(T('鈷玻璃', 'Cobalt glass'));
    const lbLamp = label(T('燈', 'Lamp'));
    const lbScope = label(T('分光鏡', 'Spectroscope'));
    const lbAir = label(T('空氣孔', 'Air hole'), 0.46);
    lbAir.position.set(0.9, -2.35, 1.0);

    function rgbHex(c) { return c ? (c[0] << 16) | (c[1] << 8) | c[2] : 0xffffff; }

    let isDark = false;
    function applyColors() {
      const st = H.get();
      isDark = !!st.dark;
      tableMat.color.setHex(isDark ? 0x2a2f3a : 0xdfe3e8);
      hemi.intensity = isDark ? 0.9 : 1.25;
      outerMat.opacity = isDark ? 0.3 : 0.2;
      // 深色背景用加法混色（發光感）；淺色背景加法混色會變成白色看不見，改用一般混色
      [outerMat, sootMat, metalMat, coneMat].forEach(function (m) { m.blending = isDark ? THREE.AdditiveBlending : THREE.NormalBlending; m.needsUpdate = true; });
      coneMat.color.setHex(isDark ? 0x46c8e6 : 0x2f8fd8);
      // 溫度色條
      paintBar(st);
      paintLabels(isDark);
    }

    // 溫度色柱：從燈管口到火焰頂上方 15 mm（隨空氣孔開度改變）
    let barKey = '';
    function paintBar(st) {
      const top = st.F.Hf + 15, key = top + '|' + st.air + '|' + isDark;
      if (key === barKey) return;
      barKey = key;
      const g = tbCanvas.getContext('2d');
      for (let y = 0; y < 256; y++) { g.fillStyle = st.tempColor(st.temperature((255 - y) / 255 * top)); g.fillRect(0, y, 4, 1); }
      tbTex.needsUpdate = true;
      tbar.scale.y = top / 135; tbar.position.y = top * MM / 2;
    }
    function update() {
      const st = H.get(), F = st.F;
      paintBar(st);
      // 火焰
      const pO = profile(F, 0, 1);
      setGeo(outer, pO ? new THREE.LatheGeometry(pO, 48) : null);
      sootMat.opacity = 0.75 * st.sootA;
      setGeo(sootM, st.sootA > 0 && pO ? new THREE.LatheGeometry(profile(F, 0, 0.95), 48) : null);
      const show = st.metals.length && st.bright > 0.01 && st.h < F.Hf + 10;
      const pM = show ? profile(F, st.h - 2, 0.92) : null;
      setGeo(metalM, pM ? new THREE.LatheGeometry(pM, 48) : null);
      if (pM) { metalMat.color.setHex(rgbHex(st.cobalt ? st.rgb : st.mrgb)); metalMat.opacity = 0.75 * st.bright * (1 - 0.7 * st.soot); }
      else metalMat.opacity = 0;
      if (F.Hc > 0) {
        const pts = [new THREE.Vector2(0.001, 0)];
        for (let i = 0; i <= 20; i++) { const u = i / 20; pts.push(new THREE.Vector2(Math.max(0.001, TUBE_R * 0.95 * (1 - u) * (1 - 0.25 * u)), u * F.Hc * MM)); }
        const lg = new THREE.LatheGeometry(pts, 40);
        setGeo(cone, lg);
        const eg = new THREE.EdgesGeometry(lg, 30);
        if (coneEdge.geometry) coneEdge.geometry.dispose(); coneEdge.geometry = eg;
        cone.visible = coneEdge.visible = true; lbCone.visible = true;
        lbCone.position.set(TUBE_R + 0.75, F.Hc * MM * 0.5, 0.6);
      } else { cone.visible = coneEdge.visible = false; lbCone.visible = false; }
      lbOuter.position.set(flameR(F.Hf * 0.6, F) + 0.9, F.Hf * 0.62 * MM, 0);
      // 最熱點
      hotDot.position.set(-2.6 - 0.35, F.hp * MM, 0);
      hotRing.position.set(0, F.hp * MM, 0);
      const rr = flameR(F.hp, F) + 0.12; hotRing.scale.set(rr, rr, rr);
      lbHot.position.set(-3.5, F.hp * MM + 0.35, 0);
      // 白金絲：從 +z 伸進火焰
      const wy = st.h * MM;
      wireG.position.set(0, wy, 0);
      const hot = Math.max(0, Math.min(1, (st.Tw - 900) / 900));
      wireMat.emissive.setRGB(hot * 1.0, hot * 0.45, hot * 0.15);
      bead.visible = st.metals.length > 0;
      lbWire.position.set(0.3, wy + 0.45, 2.2);
      glowLight.position.set(0, wy + 0.6, 0);
      glowLight.color.setHex(rgbHex(st.mrgb || [255, 170, 102]));
      glowLight.intensity = show ? 2.5 * st.bright : 0;
      // 光路（在白金絲上方 5 mm 的高度）
      const py = Math.min(st.h + 5, 135) * MM;
      lamp.visible = lampHalo.visible = lampStand.visible = lbLamp.visible = !!st.lamp;
      if (st.lamp) {
        lampMat.color.setHex(rgbHex(st.lampRGB)); lampHalo.material.color.setHex(rgbHex(st.lampRGB));
        lamp.position.set(XL, py, 0); lampHalo.position.copy(lamp.position);
        lampStand.scale.y = py + 3.2 - 0.42; lampStand.position.set(XL, (py - 0.42 - 3.2) / 2, 0);
        lbLamp.position.set(XL, py + 0.75, 0);
      }
      const x0 = st.lamp ? XL : 0.3;
      beam.scale.y = XS - x0; beam.position.set((XS + x0) / 2, py, 0);
      coGlass.visible = lbCo.visible = !!st.cobalt;
      coGlass.position.set(XC, py, 0); lbCo.position.set(XC, py + 1.35, 0);
      coll.position.set(XS + LCOLL / 2, py, 0); slit.position.set(XS - 0.01, py, 0);
      const xp = XS + LCOLL + 0.65;
      prism.position.set(xp, py, 0);
      lbScope.position.set(XS + LCOLL / 2, py + 0.65, 0);
      const xs = xp + 2.8;
      screen.position.set(xs, py, 1.25);
      // 色散的光：角度 ∝ 柯西色散（短波長偏得多）
      rays.forEach(function (r, i) {
        const q = st.rays[i];
        if (!q || !(st.vmax > 0)) { r[0].visible = r[1].visible = false; return; }
        const k = (1 / (q.lam * q.lam) - 1 / (800 * 800)) / (1 / (380 * 380) - 1 / (800 * 800));
        const ang = 0.12 + 0.55 * k;
        const dz = (xs - xp) * Math.tan(ang), len = Math.hypot(xs - xp, dz);
        const a = Math.max(0.12, Math.min(1, Math.sqrt(q.v / st.vmax)));
        r[0].material.color.setHex(rgbHex(q.rgb)); r[0].material.opacity = 0.85 * a;
        r[0].scale.y = len; r[0].position.set((xp + xs) / 2, py, dz / 2);
        r[0].rotation.set(0, 0, 0); r[0].rotation.z = Math.PI / 2; r[0].rotation.y = -Math.atan2(dz, xs - xp);
        r[0].rotation.order = 'YZX';
        r[1].material.color.setHex(rgbHex(q.rgb)); r[1].material.opacity = a;
        r[1].position.set(xs - 0.05, py, dz);
        r[0].visible = r[1].visible = true;
      });
      const hd = H.hud(); hudTL.textContent = hd.tl; hudTR.textContent = hd.tr;
      requestRender();
    }

    function fit(force) {
      // 整個場景（燈到屏、桌面到火焰頂）約寬 15、高 17：取直向與橫向都放得下的距離
      const t = Math.tan(camera.fov * Math.PI / 360);
      const dist = Math.max(9.2 / t, 8.6 / (t * camera.aspect));
      if (force) {
        controls.target.set(2.2, 4.2, 0.6);
        camera.position.copy(viewDir).multiplyScalar(dist).add(controls.target);
      }
      camera.updateProjectionMatrix();
      controls.update();
    }
    let vw = 0, raf = 0;
    function canvasHeight(w) { return w < 560 ? Math.round(Math.max(380, w * 1.05)) : 440; }
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
      update: function () { if (api.active) update(); },
      onTheme: function () { if (!api.active) return; applyColors(); update(); },
      resetCamera: function () { fit(true); requestRender(); },
      dispose: function () {
        api.active = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        document.removeEventListener('visibilitychange', onVisible);
        controls.dispose();
        const geos = new Set();
        scene.traverse(function (o) { if (o.geometry) geos.add(o.geometry); });
        geos.forEach(function (g) { g.dispose(); });
        disposables.forEach(function (d) { if (d && d.dispose) d.dispose(); });
        renderer.dispose();
        renderer.forceContextLoss();
        canvas.remove(); hudTL.remove(); hudTR.remove(); hudBL.remove();
      }
    };

    const w0 = host.clientWidth;
    if (w0) {
      const h0 = canvasHeight(w0);
      canvas.style.height = h0 + 'px';
      vw = w0;
      renderer.setSize(w0, h0, false);
      camera.aspect = w0 / h0;
    }
    applyColors();
    fit(true);
    update();
    return api;
  }

  window.FT3D = { create: create };
})();
