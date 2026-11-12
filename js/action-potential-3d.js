/*
 * action-potential-3d.js — 「神經的動作電位」第二部分（軸突傳導）的 3D 立體檢視（three.js）
 *
 * 由 js/action-potential.js 在使用者按「3D 立體」時才載入（three.js 也是那時才以 import() 載入）；切回 2D 時整個釋放。
 * 用法：window.AP3D.create({ THREE, OrbitControls }, 容器, bridge) → { active, frame, onShow, onTheme, resetCamera, rebuild, busy, dispose }
 *
 * 所有數值來自 action-potential-core.js 的同一條軸突（bridge.cable()），與 2D 畫面是同一份計算：
 *   軸突表面的顏色與微微鼓起＝此刻那一點的膜電位；上方的曲線＝V(x)。
 * 示意：軸突的粗細大幅放大（真實的 0.05–1 mm 在 10 cm 長的軸突上幾乎看不見）；鼓起的幅度只是讓電位看得見，不是真的變粗。
 * 場景座標：x 沿著軸突（1 單位 = 1 cm，中心在原點），y 向上。
 */
(function () {
  'use strict';
  const FONT = 'system-ui, -apple-system, "Segoe UI", "Noto Sans TC", "PingFang TC", sans-serif';
  const RES = 3;
  const SEG = 240;     // 軸突沿長度的網格數
  const RAD = 36;      // 圓周的網格數

  function create(lib, host, B) {
    const THREE = lib.THREE;
    const K = B.K, T = B.T, D = B.D;
    const LEN = B.CAB_L, HALF = LEN / 2;
    let C = B.colors();

    // ---------- 畫布、HUD ----------
    const wrap = document.createElement('div');
    wrap.className = 'ap3-wrap';
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('軸突的 3D 立體檢視：表面顏色是膜電位，上方的曲線是此刻沿軸突的膜電位（可拖曳旋轉、縮放）', '3D view of the axon: the surface colour is the membrane potential and the curve above is the potential along the axon right now (drag to rotate, pinch or scroll to zoom)'));
    wrap.appendChild(canvas);
    const hud = document.createElement('div');
    hud.className = 'ap3-hud';
    hud.setAttribute('aria-hidden', 'true');
    hud.innerHTML = '<div class="tl"><span data-k="t"></span><span class="m" data-k="v"></span></div><div class="br"><span class="m" data-k="note"></span></div>';
    wrap.appendChild(hud);
    host.appendChild(wrap);
    const hudEl = {};
    hud.querySelectorAll('[data-k]').forEach(function (e) { hudEl[e.getAttribute('data-k')] = e; });
    const hudLast = {};
    function setHud(k, s) { if (hudLast[k] !== s) { hudLast[k] = s; hudEl[k].textContent = s; } }

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    } catch (e) {
      wrap.remove();
      throw e;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1.5, 0.05, 200);
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.rotateSpeed = 0.85;
    controls.enablePan = false;
    controls.minDistance = 2.5;
    controls.maxDistance = 40;
    controls.maxPolarAngle = Math.PI * 0.62;

    const hemi = new THREE.HemisphereLight(0xffffff, 0x556070, 0.9);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(-3, 9, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const sc = key.shadow.camera;
    sc.left = -7; sc.right = 7; sc.top = 4; sc.bottom = -4; sc.near = 1; sc.far = 30;
    key.shadow.bias = -0.0005;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xffffff, 0.6);
    rim.position.set(4, 2, -6);
    scene.add(rim);

    function isDark() { return !!D.dark; }
    function col(s) { return new THREE.Color(s); }
    function disposeObject(obj) {
      obj.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
            if (m.map) m.map.dispose();
            m.dispose();
          });
        }
      });
    }

    // ---------- 文字標籤（Sprite，固定像素大小） ----------
    let ch = 300;
    function roundRect(g, x, y, w, h, r) {
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    }
    function labelCanvas(text, color) {
      const size = 12 * RES;
      const f = '700 ' + size + 'px ' + FONT;
      const c = document.createElement('canvas');
      let g = c.getContext('2d');
      g.font = f;
      const tw = g.measureText(text).width;
      const padX = 6 * RES, padY = 2 * RES;
      c.width = Math.ceil(tw + 2 * padX);
      c.height = Math.ceil(size * 1.3 + 2 * padY);
      g = c.getContext('2d');
      roundRect(g, RES * 0.5, RES * 0.5, c.width - RES, c.height - RES, (c.height - RES) / 2);
      g.fillStyle = D.alpha(D.c['canvas-bg'], isDark() ? 0.85 : 0.9);
      g.fill();
      g.strokeStyle = D.alpha(color, 0.55);
      g.lineWidth = RES;
      g.stroke();
      g.font = f;
      g.textBaseline = 'middle';
      g.fillStyle = color;
      g.fillText(text, padX, c.height / 2 + RES * 0.5);
      return c;
    }
    function label(text, color) {
      const c = labelCanvas(text, color);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false }));
      sp.userData = { lw: c.width / RES, lh: c.height / RES };
      sp.renderOrder = 30;
      fitLabel(sp);
      return sp;
    }
    function fitLabel(sp) {
      const k = 2 * Math.tan(camera.fov * Math.PI / 360) / Math.max(1, ch);
      sp.scale.set(sp.userData.lw * k, sp.userData.lh * k, 1);
    }

    // ---------- 場景物件 ----------
    const world = new THREE.Group();
    scene.add(world);
    let axon = null, axonGeo = null, baseR = 0.4, myelinGroup = null, curve = null, ribbon = null, elGroup = null, ground = null, ruler = null;
    let built = '';
    function radiusOf(d) { return 0.16 + 0.42 * (Math.log10(d) - 1.69897) / 1.30103; } // 示意：粗細放大

    function buildGround() {
      if (ground) { world.remove(ground); disposeObject(ground); }
      ground = new THREE.Group();
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(40, 24), new THREE.ShadowMaterial({ opacity: isDark() ? 0.45 : 0.16 }));
      plane.rotation.x = -Math.PI / 2;
      plane.position.y = -1.25;
      plane.receiveShadow = true;
      ground.add(plane);
      // 刻度尺（每 1 cm）
      const pts = [];
      for (let x = 0; x <= LEN + 1e-9; x += 1) { pts.push(x - HALF, -1.24, 1.1, x - HALF, -1.24, 1.1 + (x % 5 === 0 ? 0.35 : 0.2)); }
      pts.push(-HALF, -1.24, 1.1, HALF, -1.24, 1.1);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const line = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: col(D.c.muted), transparent: true, opacity: 0.7 }));
      ground.add(line);
      [0, 5, 10].forEach(function (x) {
        const sp = label(x + ' cm', D.c.muted);
        sp.position.set(x - HALF, -1.2, 1.75);
        ground.add(sp);
      });
      world.add(ground);
    }
    function buildAxon() {
      const d = B.diam(), my = B.myelin();
      const k = d.toFixed(1) + '|' + my + '|' + D.ver;
      if (k === built && axon) return;
      built = k;
      [axon, myelinGroup, curve, ribbon].forEach(function (o) { if (o) { world.remove(o); disposeObject(o); } });
      baseR = radiusOf(d);
      // 軸突：沿 x 的圓管，每個頂點的顏色與半徑每一幀依膜電位更新
      axonGeo = new THREE.CylinderGeometry(1, 1, LEN, RAD, SEG, false);
      axonGeo.rotateZ(-Math.PI / 2);   // 圓柱的軸改成 x
      const n = axonGeo.attributes.position.count;
      axonGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
      axonGeo.userData.base = Float32Array.from(axonGeo.attributes.position.array);
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.0 });
      axon = new THREE.Mesh(axonGeo, mat);
      axon.castShadow = true;
      world.add(axon);
      // 髓鞘（示意）：每 0.5 cm 一個蘭氏結，中間包一節半透明的髓鞘
      myelinGroup = new THREE.Group();
      if (my) {
        const gap = 0.5, mR = baseR * 1.55 + 0.05;
        const mmat = new THREE.MeshStandardMaterial({ color: col(C['ap-myelin']), roughness: 0.4, transparent: true, opacity: 0.62, depthWrite: false });
        for (let i = 0; i * gap < LEN - 1e-9; i++) {
          const len = gap - 0.07;
          const m = new THREE.Mesh(new THREE.CylinderGeometry(mR, mR, len, 28, 1, false), mmat);
          m.rotation.z = Math.PI / 2;
          m.position.x = (i + 0.5) * gap - HALF;
          m.castShadow = true;
          myelinGroup.add(m);
        }
      }
      world.add(myelinGroup);
      // 上方的 V(x) 曲線與帶狀面
      const N = SEG + 1;
      const cg = new THREE.BufferGeometry();
      cg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3));
      curve = new THREE.Line(cg, new THREE.LineBasicMaterial({ color: col(C['ap-v']) }));
      world.add(curve);
      const rg = new THREE.BufferGeometry();
      rg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 2 * 3), 3));
      const idx = [];
      for (let i = 0; i < SEG; i++) { const a = 2 * i, b = a + 1, c = a + 2, e = a + 3; idx.push(a, c, b, b, c, e); }
      rg.setIndex(idx);
      ribbon = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: col(C['ap-v']), transparent: true, opacity: isDark() ? 0.22 : 0.16, side: THREE.DoubleSide, depthWrite: false }));
      world.add(ribbon);
    }
    // 電極：刺激電極從上方斜插下來，記錄電極從前下方伸過來
    let elKey = '';
    function buildElectrodes() {
      const es = B.electrodes();
      const k = es.map(function (e) { return e.id + e.x.toFixed(3); }).join('|') + '|' + baseR.toFixed(3) + '|' + D.ver;
      if (k === elKey && elGroup) return;
      elKey = k;
      if (elGroup) { world.remove(elGroup); disposeObject(elGroup); }
      elGroup = new THREE.Group();
      const outer = B.myelin() ? baseR * 1.55 + 0.05 : baseR;
      es.forEach(function (e) {
        const x = e.x - HALF;
        const c3 = col(e.col);
        const mat = new THREE.MeshStandardMaterial({ color: c3, roughness: 0.3, metalness: 0.5 });
        const len = 1.25;
        const g = new THREE.CylinderGeometry(0.035, 0.012, len, 12);
        const m = new THREE.Mesh(g, mat);
        m.castShadow = true;
        let tip, dir;
        if (e.up) { dir = new THREE.Vector3(0, 1, 0.35).normalize(); tip = new THREE.Vector3(x, outer * 0.95, 0); }
        else { dir = new THREE.Vector3(0, -0.55, 1).normalize(); tip = new THREE.Vector3(x, -outer * 0.4, outer * 0.85); }
        m.position.copy(tip).addScaledVector(dir, len / 2);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.clone().negate());
        elGroup.add(m);
        const sp = label(e.name, e.col);
        sp.position.copy(tip).addScaledVector(dir, len + 0.22);
        elGroup.add(sp);
      });
      world.add(elGroup);
    }

    // ---------- 每一幀：依膜電位上色、鼓起 ----------
    const cRest = new THREE.Color(), cHot = new THREE.Color(), cCold = new THREE.Color(), tmp = new THREE.Color();
    function refreshColors() {
      cRest.set(isDark() ? D.shade(C['ap-axo'], 0.18) : D.shade(C['ap-axo'], -0.06));
      cHot.set(C['ap-v']);
      cCold.set(C['ap-k']);
    }
    function vOf(cab, xcm) {
      const u = xcm / cab.dx, i = Math.max(0, Math.min(cab.N - 2, Math.floor(u))), f = Math.max(0, Math.min(1, u - i));
      return cab.V[i] + (cab.V[i + 1] - cab.V[i]) * f;
    }
    function update() {
      buildAxon();
      buildElectrodes();
      const cab = B.cable();
      const rest = cab.rest;
      const pos = axonGeo.attributes.position, base = axonGeo.userData.base, colA = axonGeo.attributes.color;
      const n = pos.count;
      // 每一個長度位置先算一次
      const ring = new Float32Array(SEG + 1), us = new Float32Array(SEG + 1);
      for (let j = 0; j <= SEG; j++) {
        const xcm = j / SEG * LEN;
        const v = vOf(cab, xcm);
        const u = Math.max(0, Math.min(1, (v - rest) / 95));
        us[j] = v < rest ? -Math.min(1, (rest - v) / 20) : u;
        ring[j] = baseR * (1 + 0.16 * u);
      }
      for (let i = 0; i < n; i++) {
        const bx = base[3 * i], by = base[3 * i + 1], bz = base[3 * i + 2];
        const j = Math.max(0, Math.min(SEG, Math.round((bx + HALF) / LEN * SEG)));
        const rr = Math.hypot(by, bz);
        const s = rr > 1e-6 ? ring[j] : 0;
        pos.array[3 * i] = bx; pos.array[3 * i + 1] = by * s; pos.array[3 * i + 2] = bz * s;
        const u = us[j];
        if (u >= 0) tmp.copy(cRest).lerp(cHot, Math.pow(u, 0.8)); else tmp.copy(cRest).lerp(cCold, Math.min(0.5, -u * 0.5));
        colA.array[3 * i] = tmp.r; colA.array[3 * i + 1] = tmp.g; colA.array[3 * i + 2] = tmp.b;
      }
      pos.needsUpdate = true; colA.needsUpdate = true;
      axonGeo.computeVertexNormals();
      // V(x) 曲線：基線在軸突上方
      const y0 = (B.myelin() ? baseR * 1.55 : baseR) + 0.75, sY = 1.5 / 100;
      const cp = curve.geometry.attributes.position, rp = ribbon.geometry.attributes.position;
      for (let j = 0; j <= SEG; j++) {
        const xcm = j / SEG * LEN, x = xcm - HALF;
        const y = y0 + (vOf(cab, xcm) - rest) * sY;
        cp.array[3 * j] = x; cp.array[3 * j + 1] = y; cp.array[3 * j + 2] = 0;
        rp.array[6 * j] = x; rp.array[6 * j + 1] = y0; rp.array[6 * j + 2] = 0;
        rp.array[6 * j + 3] = x; rp.array[6 * j + 4] = y; rp.array[6 * j + 5] = 0;
      }
      cp.needsUpdate = true; rp.needsUpdate = true;
      curve.geometry.computeBoundingSphere(); ribbon.geometry.computeBoundingSphere();
      // HUD
      const run = B.run();
      setHud('t', run ? 't = ' + B.num(cab.t, 2) + ' ms' : T('按「刺激軸突」開始', 'Press “Stimulate the axon”'));
      setHud('v', run && run.data && run.data.v != null ? T('傳導速度 ', 'Speed ') + B.num(run.data.v, 1) + ' m/s' : B.num(B.diam(), 0) + ' µm' + (B.myelin() ? T('・有髓鞘', ' · myelinated') : ''));
      setHud('note', T('示意：粗細放大、表面鼓起只為了看見電位', 'Schematic: thickness exaggerated; the bulge only makes the voltage visible'));
    }

    // ---------- 相機 ----------
    let cw = 300, lastAspect = 0;
    function sizeOf(w) { return w < 560 ? Math.round(Math.max(340, Math.min(440, w * 1.05))) : 420; }
    function resetCamera() {
      const hf = 2 * Math.atan(Math.tan(camera.fov * Math.PI / 360) * camera.aspect);
      const dist = Math.max(8, (HALF + 1.2) / Math.tan(hf / 2) * 1.02);
      const el = 24 * Math.PI / 180, az = -20 * Math.PI / 180;
      controls.target.set(0, 0.3, 0);
      camera.position.set(Math.sin(az) * Math.cos(el) * dist, 0.3 + Math.sin(el) * dist, Math.cos(az) * Math.cos(el) * dist);
      controls.update();
    }
    let raf = 0, moving = false;
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
      cw = w; ch = h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      scene.traverse(function (o) { if (o.isSprite) fitLabel(o); });
      if (Math.abs(camera.aspect - lastAspect) > 1e-3) {
        const first = !lastAspect;
        lastAspect = camera.aspect;
        if (first) resetCamera();
      }
      update();
      renderNow();
    }
    const ro = window.ResizeObserver ? new ResizeObserver(function () { resize3(); }) : null;
    if (ro) ro.observe(wrap); else window.addEventListener('resize', resize3);
    controls.addEventListener('change', requestRender);
    canvas.addEventListener('webglcontextlost', function (ev) {
      ev.preventDefault();
      if (!api.active) return;
      if (B.onContextLost) B.onContextLost();
    });

    const api = {
      active: true,
      frame: function () { update(); renderNow(); },
      busy: function () { return moving; },
      onShow: function () { lastAspect = 0; resize3(); },
      onTheme: function () {
        C = B.colors();
        refreshColors();
        built = ''; elKey = '';
        buildGround();
        Object.keys(hudLast).forEach(function (k) { delete hudLast[k]; });
        update();
        requestRender();
      },
      rebuild: function () { built = ''; elKey = ''; update(); requestRender(); },
      resetCamera: function () { resetCamera(); requestRender(); },
      dispose: function () {
        api.active = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        controls.dispose();
        disposeObject(scene);
        renderer.dispose();
        renderer.forceContextLoss();
        wrap.remove();
      }
    };

    // 初始化
    refreshColors();
    const w0 = wrap.clientWidth;
    if (w0) {
      cw = w0; ch = sizeOf(w0);
      canvas.style.height = ch + 'px';
      renderer.setSize(cw, ch, false);
      camera.aspect = cw / ch;
      camera.updateProjectionMatrix();
      lastAspect = camera.aspect;
    }
    buildGround();
    resetCamera();
    update();
    renderNow();
    return api;
  }

  window.AP3D = { create: create };
})();
