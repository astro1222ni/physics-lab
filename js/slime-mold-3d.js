/*
 * slime-mold-3d.js — 「黏菌找路」第二部分（臺灣鐵路網）的 3D 地形（three.js）
 *
 * 由 js/slime-mold.js 在使用者按「3D 地形」時才載入（three.js 也是那時才以 import() 載入）；切回 2D 時整個釋放。
 * 用法：window.SM3D.create({ THREE, OrbitControls }, 容器, bridge) → { active, frame, onShow, onTheme, resetCamera, rebuild, resize, busy, dispose }
 *
 * 畫的是 2D 地圖同一次模擬（bridge.net().sim）：
 *   示意地形（中央山脈、海岸山脈，高度放大約 10 倍）；黃色管子的粗細 ∝ D^(1/4)（Poiseuille：D ∝ r⁴），貼著地面；
 *   深色虛線是臺鐵主要路線（簡化），紫色虛線是最小生成樹；燕麥片是有食物的城市。
 */
(function () {
  'use strict';
  const FONT = 'system-ui, -apple-system, "Segoe UI", "Noto Sans TC", "PingFang TC", sans-serif';
  const SPAN = 10;      // 臺灣南北長度畫成 10 個單位
  const HS = 0.75;      // 示意高度 1 → 0.75 個單位（約放大 10 倍）
  const RMAX = 0.055;   // 最粗的管子半徑
  const GRID_KM = 2.5;  // 地形網格的間距

  function create(lib, host, BR) {
    const THREE = lib.THREE;
    const T = BR.T, D = BR.D, S = BR.S, TW = BR.TW, TG = TW.g, CITY = BR.CITY;
    let C = BR.colors();

    // ---------- 畫布、HUD ----------
    const wrap = document.createElement('div');
    wrap.className = 'sm3-wrap';
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('臺灣的 3D 示意地形：黃色是黏菌的管子，深色虛線是臺鐵主要路線，燕麥片是有食物的城市（可拖曳旋轉、縮放）', '3D sketch of Taiwan’s terrain: yellow tubes are the slime mould, the dark dashed line is the main railway, oat flakes mark cities with food (drag to rotate, pinch or scroll to zoom)'));
    wrap.appendChild(canvas);
    const hud = document.createElement('div');
    hud.className = 'sm3-hud';
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
    // 標籤照螢幕像素比畫（縮太多倍、筆畫多的字會糊掉）
    const RES = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1.5, 0.05, 200);
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.rotateSpeed = 0.85;
    controls.enablePan = false;
    controls.minDistance = 2.5;
    controls.maxDistance = 40;
    controls.maxPolarAngle = Math.PI * 0.47;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x4a5868, 1.05));
    const key = new THREE.DirectionalLight(0xffffff, 1.9);
    key.position.set(-6, 9, -4);   // 光從西北方來（和 2D 地圖的陰影一致）
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const sc = key.shadow.camera;
    sc.left = -7; sc.right = 7; sc.top = 7; sc.bottom = -7; sc.near = 1; sc.far = 30;
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.02;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xffffff, 0.45);
    rim.position.set(6, 4, 7);
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
    function label(text, color, small) {
      const size = (small ? 10.5 : 12) * RES;
      const f = (small ? '600 ' : '700 ') + size + 'px ' + FONT;
      const c = document.createElement('canvas');
      let g = c.getContext('2d');
      g.font = f;
      const tw = g.measureText(text).width;
      const padX = 5 * RES, padY = 2 * RES;
      c.width = Math.ceil(tw + 2 * padX);
      c.height = Math.ceil(size * 1.3 + 2 * padY);
      g = c.getContext('2d');
      roundRect(g, RES * 0.5, RES * 0.5, c.width - RES, c.height - RES, (c.height - RES) / 2);
      g.fillStyle = D.alpha(D.c['canvas-bg'], isDark() ? 0.82 : 0.86);
      g.fill();
      g.font = f;
      g.textBaseline = 'middle';
      g.fillStyle = color;
      g.fillText(text, padX, c.height / 2 + RES * 0.5);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.generateMipmaps = true;
      tex.anisotropy = 4;
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

    // ---------- 座標 ----------
    let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity;
    S.COAST_KM.forEach(function (p) { bx0 = Math.min(bx0, p[0]); bx1 = Math.max(bx1, p[0]); by0 = Math.min(by0, p[1]); by1 = Math.max(by1, p[1]); });
    const K = SPAN / (by1 - by0), CX = (bx0 + bx1) / 2, CY = (by0 + by1) / 2;
    function wx(x) { return (x - CX) * K; }
    function wz(y) { return -(y - CY) * K; }
    function hy(h) { return h * HS; }

    const world = new THREE.Group();
    scene.add(world);
    let land = null, sea = null, overlay = null, tubes = null, joints = null, cities = null;
    let builtVer = -1, lastSim = null, lastSteps = -1, narrow = false, overlayKey = '';

    // ---------- 地形（一次） ----------
    function rgb3(c) { const x = col(c); return [x.r, x.g, x.b]; }
    function buildLand() {
      if (land) { world.remove(land); disposeObject(land); }
      if (sea) { world.remove(sea); disposeObject(sea); }
      const nx = Math.ceil((bx1 - bx0) / GRID_KM) + 3, ny = Math.ceil((by1 - by0) / GRID_KM) + 3;
      const pos = [], colr = [], idx = [], ins = new Uint8Array(nx * ny);
      const lo = rgb3(C['sm-low']), mid = rgb3(C['sm-mid']), hi = rgb3(C['sm-high']);
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const x = bx0 - GRID_KM + i * GRID_KM, y = by0 - GRID_KM + j * GRID_KM;
        const inn = S.inside(x, y);
        ins[j * nx + i] = inn ? 1 : 0;
        const h = inn ? S.elev(x, y) : 0;
        pos.push(wx(x), inn ? hy(h) + 0.012 : -0.02, wz(y));
        let c;
        if (h < 0.4) { const u = Math.max(0, (h - 0.04) / 0.36); c = [lo[0] + (mid[0] - lo[0]) * u, lo[1] + (mid[1] - lo[1]) * u, lo[2] + (mid[2] - lo[2]) * u]; }
        else { const u = Math.min(1, (h - 0.4) / 0.6); c = [mid[0] + (hi[0] - mid[0]) * u, mid[1] + (hi[1] - mid[1]) * u, mid[2] + (hi[2] - mid[2]) * u]; }
        colr.push(c[0], c[1], c[2]);
      }
      for (let j = 0; j + 1 < ny; j++) for (let i = 0; i + 1 < nx; i++) {
        const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
        // 至少兩個角在陸地上才畫（海岸線比較平順）
        // 頂點順序讓法向量朝上（z 軸朝南）
        if (ins[a] + ins[b] + ins[c] >= 2) idx.push(a, b, c);
        if (ins[b] + ins[c] + ins[d] >= 2) idx.push(b, d, c);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      land = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 }));
      land.receiveShadow = true;
      world.add(land);
      // 海：中間不透明、邊緣淡出
      const gc = document.createElement('canvas');
      gc.width = gc.height = 256;
      const gg = gc.getContext('2d'), rg = gg.createRadialGradient(128, 128, 40, 128, 128, 128);
      rg.addColorStop(0, D.alpha(C['sm-sea'], 0.95)); rg.addColorStop(0.7, D.alpha(C['sm-sea'], 0.8)); rg.addColorStop(1, D.alpha(C['sm-sea'], 0));
      gg.fillStyle = rg; gg.fillRect(0, 0, 256, 256);
      const stex = new THREE.CanvasTexture(gc);
      stex.colorSpace = THREE.SRGBColorSpace;
      const seaMat = new THREE.MeshStandardMaterial({ map: stex, roughness: 0.6, metalness: 0.02, transparent: true, depthWrite: false });
      sea = new THREE.Mesh(new THREE.CircleGeometry(SPAN * 0.7, 72), seaMat);
      sea.rotation.x = -Math.PI / 2; sea.position.y = -0.005; sea.receiveShadow = true;
      world.add(sea);
    }

    // ---------- 鐵路、最小生成樹、城市 ----------
    function nodeY(n) { return hy(TG.h[n]); }
    function segLines(ok, color, opacity, dash, lift) {
      const pts = [];
      for (let e = 0; e < TG.m; e++) if (ok[e]) {
        const a = TG.ea[e], b = TG.eb[e];
        pts.push(wx(TG.x[a]), nodeY(a) + lift, wz(TG.y[a]), wx(TG.x[b]), nodeY(b) + lift, wz(TG.y[b]));
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const m = new THREE.LineDashedMaterial({ color: col(color), dashSize: dash[0], gapSize: dash[1], transparent: true, opacity: opacity, depthTest: true });
      const l = new THREE.LineSegments(g, m);
      l.computeLineDistances();
      l.renderOrder = 5;
      return l;
    }
    function oatMesh(r) {
      const geo = new THREE.SphereGeometry(r, 18, 12);
      geo.scale(1, 0.32, 0.7);
      const m = new THREE.MeshStandardMaterial({ color: col(C['sm-food']), roughness: 0.85 });
      const mesh = new THREE.Mesh(geo, m);
      mesh.castShadow = true;
      return mesh;
    }
    function buildOverlay() {
      const net = BR.net();
      if (overlay) { world.remove(overlay); disposeObject(overlay); }
      if (cities) { world.remove(cities); disposeObject(cities); }
      overlay = new THREE.Group();
      if (BR.showRail()) overlay.add(segLines(BR.RAIL, C['sm-rail'], 0.85, [0.09, 0.06], 0.045));
      if (BR.showMst() && net.mst) overlay.add(segLines(net.mst, C['sm-mst'], 0.95, [0.03, 0.05], 0.06));
      world.add(overlay);
      cities = new THREE.Group();
      CITY.forEach(function (c, i) {
        const n = TW.city[c.id], x = wx(TG.x[n]), z = wz(TG.y[n]), y = nodeY(n);
        if (net.on[i]) {
          const o = oatMesh(0.085);
          o.position.set(x, y + 0.05, z); o.rotation.y = i * 1.3;
          cities.add(o);
        } else {
          const d = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 14), new THREE.MeshStandardMaterial({ color: col(D.c.muted || '#888888'), roughness: 0.7 }));
          d.position.set(x, y + 0.02, z);
          cities.add(d);
        }
        const east = { kee: 1, tpe: 1, ila: 1, hun: 1, ttt: 1, pif: 1, hch: 1 }[c.id] === 1;
        const sp = label(T(c.zh, c.en), net.on[i] ? (D.c.text || '#222222') : (D.c.muted || '#777777'), true);
        sp.center.set(east ? -0.08 : 1.08, 0.5);
        sp.position.set(x, y + 0.14, z);
        cities.add(sp);
      });
      world.add(cities);
    }

    // ---------- 管子（InstancedMesh：每段一個圓柱、每個交會點一顆球） ----------
    const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
    function buildTubes() {
      if (tubes) { world.remove(tubes); disposeObject(tubes); }
      if (joints) { world.remove(joints); disposeObject(joints); }
      const mat = new THREE.MeshStandardMaterial({ color: col(C['sm-tube']), roughness: 0.38, metalness: 0.05, emissive: col(C['sm-tube']), emissiveIntensity: isDark() ? 0.18 : 0.06 });
      tubes = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 10, 1, true), mat, TG.m);
      tubes.castShadow = true;
      tubes.count = 0;
      joints = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), mat, TG.n);
      joints.castShadow = true;
      joints.count = 0;
      world.add(tubes); world.add(joints);
      lastSteps = -1;
    }
    const rNode = new Float32Array(TG.n);
    function updateTubes() {
      const net = BR.net(), s = net.sim;
      if (!s) { tubes.count = 0; joints.count = 0; return; }
      let Dmax = 0;
      for (let e = 0; e < TG.m; e++) if (s.D[e] > Dmax) Dmax = s.D[e];
      rNode.fill(0);
      let k = 0;
      for (let e = 0; e < TG.m; e++) {
        const dv = s.D[e];
        if (dv < BR.THR) continue;
        const r = Math.max(0.006, RMAX * Math.pow(Math.min(1, dv / (Dmax || 1)), 0.25));
        const a = TG.ea[e], b = TG.eb[e];
        const ax = wx(TG.x[a]), ay = nodeY(a) + r * 0.8, az = wz(TG.y[a]);
        const bx = wx(TG.x[b]), by = nodeY(b) + r * 0.8, bz = wz(TG.y[b]);
        dir.set(bx - ax, by - ay, bz - az);
        const len = dir.length();
        dir.multiplyScalar(1 / len);
        tmpQ.setFromUnitVectors(up, dir);
        tmpP.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
        tmpS.set(r, len, r);
        tmpM.compose(tmpP, tmpQ, tmpS);
        tubes.setMatrixAt(k++, tmpM);
        if (r > rNode[a]) rNode[a] = r;
        if (r > rNode[b]) rNode[b] = r;
      }
      tubes.count = k;
      tubes.instanceMatrix.needsUpdate = true;
      let j = 0;
      tmpQ.identity();
      for (let n = 0; n < TG.n; n++) {
        const r = rNode[n];
        if (!r) continue;
        tmpP.set(wx(TG.x[n]), nodeY(n) + r * 0.8, wz(TG.y[n]));
        tmpS.set(r, r, r);
        tmpM.compose(tmpP, tmpQ, tmpS);
        joints.setMatrixAt(j++, tmpM);
      }
      joints.count = j;
      joints.instanceMatrix.needsUpdate = true;
      tubes.computeBoundingSphere(); joints.computeBoundingSphere();
    }

    // ---------- 更新 ----------
    function update() {
      const net = BR.net();
      if (builtVer !== D.ver) {
        builtVer = D.ver;
        buildLand(); buildTubes(); overlayKey = '';
      }
      const ok = (BR.showRail() ? 'r' : '') + (BR.showMst() ? 'm' : '') + net.on.join('') + (net.mst ? net.mst.length : 0) + '|' + (net.sim ? net.params.M : '');
      if (ok !== overlayKey || lastSim !== net.sim) { overlayKey = ok; buildOverlay(); }
      if (lastSim !== net.sim || (net.sim && net.sim.steps !== lastSteps)) {
        lastSim = net.sim; lastSteps = net.sim ? net.sim.steps : -1;
        updateTubes();
      }
      const st = net.stats;
      setHud('t', net.sim ? T('時間 ', 'time ') + BR.num(net.sim.t, 0) + (net.done ? T('（已穩定）', ' (settled)') : (net.sim.steps ? T('（還在調整）', ' (adapting)') : '')) : T('至少要兩個城市', 'At least two cities'));
      setHud('v', st ? T('總長 ', 'length ') + BR.num(st.TL, 0) + ' km' + T('，容錯 ', ', tolerance ') + BR.pct(st.FT, 0) : '');
      setHud('note', narrow ? T('高度放大約 10 倍', 'height × ~10') : T('示意地形，高度放大約 10 倍；管子越粗導度越大', 'sketched terrain, height × ~10; thicker tube = more conductance'));
    }

    // ---------- 相機 ----------
    let lastAspect = 0;
    function sizeOf(w) { return w < 560 ? 620 : 600; }
    function resetCamera() {
      const hf = camera.fov * Math.PI / 180;
      const fitH = SPAN * 0.62 / Math.tan(hf / 2);
      const dist = Math.max(10, narrow ? fitH * 1.05 / Math.min(1, camera.aspect * 1.6) : fitH);
      const el = 52 * Math.PI / 180, az = -16 * Math.PI / 180;   // 從西南方往北看
      controls.target.set(0, 0.2, 0.2);
      camera.position.set(Math.sin(az) * Math.cos(el) * dist, 0.2 + Math.sin(el) * dist, 0.2 + Math.cos(az) * Math.cos(el) * dist);
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
      ch = h;
      narrow = w < 560;
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
      if (BR.onContextLost) BR.onContextLost();
    });
    const api = {
      active: true,
      frame: function () { update(); renderNow(); },
      busy: function () { return moving; },
      onShow: function () { lastAspect = 0; resize3(); },
      resize: function () { resize3(); },
      onTheme: function () {
        C = BR.colors();
        builtVer = -1;
        Object.keys(hudLast).forEach(function (k) { delete hudLast[k]; });
        update();
        requestRender();
      },
      rebuild: function () { overlayKey = ''; lastSteps = -2; update(); requestRender(); },
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
    const w0 = wrap.clientWidth;
    if (w0) {
      ch = sizeOf(w0); narrow = w0 < 560;
      canvas.style.height = ch + 'px';
      renderer.setSize(w0, ch, false);
      camera.aspect = w0 / ch;
      camera.updateProjectionMatrix();
      lastAspect = camera.aspect;
    }
    resetCamera();
    update();
    renderNow();
    return api;
  }
  window.SM3D = { create: create };
})();
