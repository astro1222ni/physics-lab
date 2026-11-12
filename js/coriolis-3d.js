/*
 * coriolis-3d.js — 「科氏力與大氣的運動」的 3D 地球（three.js）
 *
 * 由 js/coriolis.js 在使用者按「3D 地球」時才載入（three.js 也是那時才以 import() 載入）；切回 2D 時整個釋放。
 * 用法：window.Coriolis3D.create({ THREE, OrbitControls }, 容器, bridge) → { active, frame, busy, onShow, onTheme, resetCamera, camTo, dispose }
 *
 * 場景座標：地球半徑 1，北極朝 +z，經度 0 朝 +x、東經 90° 朝 +y（和 tides-3d.js 相同）。
 * 選定的地點放在東經 121°、緯度 φ（滑桿）；2D 地圖（±1000 km，和 2D 是同一份計算）以實際比例貼在這個地點的地表上。
 * 自轉軸畫出 Ω；在地點畫出 Ω 的垂直分量 Ω sin φ（讓水平的風轉彎的部分）與水平分量 Ω cos φ。
 */
(function () {
  'use strict';
  const DEG = Math.PI / 180;
  const RE = 6371e3;               // 地球半徑（m）
  const LON = 121 * DEG;           // 地點的經度（東經 121°）
  const TEX = 512;                 // 地圖貼圖大小（px）

  function create(lib, host, B) {
    const THREE = lib.THREE;
    const K = B.K, T = B.T, state = B.state, D = B.D;
    let C = B.colors();

    // ---------- 畫布與 HUD ----------
    const wrap = document.createElement('div');
    wrap.className = 'c3-wrap';
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('地球、自轉軸與所選地點的 3D 檢視（可拖曳旋轉、縮放）', '3D view of the Earth, its spin axis and the chosen place (drag to rotate, pinch or scroll to zoom)'));
    wrap.appendChild(canvas);
    const hud = document.createElement('div');
    hud.className = 'c3-hud';
    hud.setAttribute('aria-hidden', 'true');
    hud.innerHTML = '<div class="tl"><span data-k="where"></span><span class="m" data-k="comp"></span></div>' +
      '<div class="tr"><span class="m" data-k="time"></span></div>' +
      '<div class="br"><span class="m" data-k="scale"></span></div>';
    wrap.appendChild(hud);
    host.appendChild(wrap);
    const hudEl = {}, hudLast = {};
    hud.querySelectorAll('[data-k]').forEach(function (e) { hudEl[e.getAttribute('data-k')] = e; });
    function setHud(k, txt) { if (hudLast[k] !== txt) { hudLast[k] = txt; hudEl[k].textContent = txt; } }

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
    const camera = new THREE.PerspectiveCamera(34, 1.6, 0.01, 100);
    camera.up.set(0, 0, 1);
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.rotateSpeed = 0.7;
    controls.enablePan = false;
    controls.minDistance = 0.35;
    controls.maxDistance = 9;

    scene.add(new THREE.AmbientLight(0xffffff, 0.95));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    scene.add(sun);
    scene.add(sun.target);

    const col = function (c) { return new THREE.Color(C[c] || c || '#888888'); };
    function disposeObject(obj) {
      obj.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m.map && m.map !== mapTex && m.map !== earthTex) m.map.dispose(); m.dispose(); });
      });
    }

    // ---------- 地球 ----------
    const earthGeo = new THREE.SphereGeometry(1, 96, 48);
    earthGeo.rotateX(Math.PI / 2);
    const earthMat = new THREE.MeshStandardMaterial({ color: 0x4a78a8, roughness: 0.92, metalness: 0 });
    const earth = new THREE.Mesh(earthGeo, earthMat);
    scene.add(earth);
    let earthTex = null;
    new THREE.TextureLoader().load(new URL('img/tides/earth-2048.webp', document.baseURI).href, function (t) {
      if (!api.active) { t.dispose(); return; }
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      earthTex = t; earthMat.map = t; earthMat.color.set(0xffffff); earthMat.needsUpdate = true;
      B.request();
    }, undefined, function () { /* 載入失敗：保留素色的球 */ });
    // 大氣光暈
    const glow = new THREE.Mesh(new THREE.SphereGeometry(1.025, 64, 32), new THREE.MeshBasicMaterial({ color: 0x7fb4ff, transparent: true, opacity: 0.12, side: THREE.BackSide, depthWrite: false }));
    scene.add(glow);

    // ---------- 向量箭頭 ----------
    function arrowMesh(from, to, color, radius, opts) {
      opts = opts || {};
      const g = new THREE.Group();
      const d = new THREE.Vector3().subVectors(to, from), L = d.length();
      if (L < 1e-4) return g;
      const head = Math.min(L * 0.4, radius * 5.5);
      const mat = new THREE.MeshBasicMaterial({ color: color, depthTest: !opts.overlay, transparent: !!opts.overlay, opacity: 1 });
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, L - head, 12), mat);
      shaft.position.y = (L - head) / 2;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(radius * 2.4, head, 16), mat);
      cone.position.y = L - head / 2;
      g.add(shaft); g.add(cone);
      g.position.copy(from);
      g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      if (opts.overlay) g.traverse(function (o) { o.renderOrder = 20; });
      return g;
    }

    // ---------- 文字標籤（Sprite，固定像素大小） ----------
    const RES = 3;
    let cw = 600, ch = 440;
    function label(text, color, pos) {
      const font = '600 ' + 12 * RES + 'px ' + D.FONT;
      const c = document.createElement('canvas');
      let g = c.getContext('2d');
      g.font = font;
      const tw = g.measureText(text).width;
      c.width = Math.ceil(tw + 12 * RES); c.height = Math.ceil(19 * RES);
      g = c.getContext('2d');
      g.beginPath();
      const r = c.height / 2 - RES;
      g.moveTo(r + RES, RES); g.arcTo(c.width - RES, RES, c.width - RES, c.height - RES, r); g.arcTo(c.width - RES, c.height - RES, RES, c.height - RES, r);
      g.arcTo(RES, c.height - RES, RES, RES, r); g.arcTo(RES, RES, c.width - RES, RES, r); g.closePath();
      g.fillStyle = 'rgba(8,14,24,0.78)'; g.fill();
      g.strokeStyle = color; g.globalAlpha = 0.6; g.lineWidth = RES; g.stroke(); g.globalAlpha = 1;
      g.font = font; g.textBaseline = 'middle'; g.fillStyle = color; g.fillText(text, 6 * RES, c.height / 2 + RES * 0.5);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false }));
      sp.userData = { lw: c.width / RES, lh: c.height / RES, isLabel: true };
      sp.center.set(0, 0.5);
      sp.position.copy(pos);
      sp.renderOrder = 30;
      fitLabel(sp);
      return sp;
    }
    function fitLabel(sp) {
      const k = 2 * Math.tan(camera.fov * Math.PI / 360) / Math.max(1, ch);
      sp.scale.set(sp.userData.lw * k, sp.userData.lh * k, 1);
    }
    const LIGHT = { axis: '#fde68a', vert: '#fb923c', horiz: '#cbd5e1', text: '#f1f5f9' };

    // ---------- 自轉軸與轉向 ----------
    const axisGroup = new THREE.Group();
    scene.add(axisGroup);
    function buildAxis() {
      disposeObject(axisGroup); axisGroup.clear();
      const c = new THREE.Color(LIGHT.axis);
      axisGroup.add(arrowMesh(new THREE.Vector3(0, 0, -1.32), new THREE.Vector3(0, 0, 1.62), c, 0.009));
      axisGroup.add(label(T('Ω 地球自轉', 'Ω Earth’s spin'), LIGHT.axis, new THREE.Vector3(0.04, 0, 1.5)));
      // 轉向：北極上空逆時針的弧（往東轉）
      const pts = [], R = 0.32, z = 1.22;
      for (let i = 0; i <= 40; i++) { const a = -0.3 + i / 40 * Math.PI * 1.5; pts.push(new THREE.Vector3(R * Math.cos(a), R * Math.sin(a), z)); }
      const curve = new THREE.CatmullRomCurve3(pts);
      axisGroup.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.007, 8, false), new THREE.MeshBasicMaterial({ color: c })));
      const end = pts[pts.length - 1], prev = pts[pts.length - 3];
      const dir = new THREE.Vector3().subVectors(end, prev).normalize();
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.06, 14), new THREE.MeshBasicMaterial({ color: c }));
      cone.position.copy(end).addScaledVector(dir, 0.02);
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      axisGroup.add(cone);
    }

    // ---------- 地點：地圖貼片、Ω 的分量 ----------
    const mapCanvas = document.createElement('canvas');
    mapCanvas.width = TEX; mapCanvas.height = TEX;
    const mapCtx = mapCanvas.getContext('2d');
    const mapTex = new THREE.CanvasTexture(mapCanvas);
    mapTex.colorSpace = THREE.SRGBColorSpace;
    mapTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const siteGroup = new THREE.Group();
    scene.add(siteGroup);
    let frameV = null;                       // 地點的單位向量：上 n、東 e、北 nr
    function siteFrame(lat) {
      const ph = lat * DEG;
      const n = new THREE.Vector3(Math.cos(ph) * Math.cos(LON), Math.cos(ph) * Math.sin(LON), Math.sin(ph));
      const e = new THREE.Vector3(-Math.sin(LON), Math.cos(LON), 0);
      const nr = new THREE.Vector3(-Math.sin(ph) * Math.cos(LON), -Math.sin(ph) * Math.sin(LON), Math.cos(ph));
      return { n: n, e: e, nr: nr, ph: ph };
    }
    function buildSite() {
      disposeObject(siteGroup); siteGroup.clear();
      const F = siteFrame(state.lat);
      frameV = F;
      // 地圖貼片：以實際比例（±1000 km）貼在地表上
      const half = B.mapHalf / RE, N = 40;
      const geo = new THREE.PlaneGeometry(2, 2, N, N);
      const pos = geo.attributes.position, v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        const a = pos.getX(i), b = pos.getY(i);
        v.copy(F.n).addScaledVector(F.e, a * half).addScaledVector(F.nr, b * half).normalize().multiplyScalar(1.0035);
        pos.setXYZ(i, v.x, v.y, v.z);
      }
      geo.computeVertexNormals();
      const patch = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: mapTex, transparent: true, opacity: 0.84, side: THREE.DoubleSide, depthWrite: false }));
      patch.renderOrder = 5;
      siteGroup.add(patch);
      // 緯度圈
      const ring = [], rr = Math.cos(F.ph) * 1.004, zz = Math.sin(F.ph) * 1.004;
      if (rr > 0.01) {
        for (let i = 0; i <= 160; i++) { const a = i / 160 * Math.PI * 2; ring.push(new THREE.Vector3(rr * Math.cos(a), rr * Math.sin(a), zz)); }
        siteGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ring), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 })));
      }
      // Ω 的分量（畫在地點上方，不被地球擋住）
      const base = F.n.clone().multiplyScalar(1.004), L = 0.3, s = Math.sin(F.ph), c = Math.cos(F.ph);
      siteGroup.add(arrowMesh(base, base.clone().add(new THREE.Vector3(0, 0, L)), new THREE.Color(LIGHT.axis), 0.006, { overlay: true }));
      if (Math.abs(s) > 0.02) siteGroup.add(arrowMesh(base, base.clone().addScaledVector(F.n, L * s), new THREE.Color(LIGHT.vert), 0.008, { overlay: true }));
      if (Math.abs(c) > 0.02) siteGroup.add(arrowMesh(base, base.clone().addScaledVector(F.nr, L * c), new THREE.Color(LIGHT.horiz), 0.006, { overlay: true }));
      siteGroup.add(label('Ω', LIGHT.axis, base.clone().add(new THREE.Vector3(0.02, 0, L + 0.02))));
      if (Math.abs(s) > 0.02) siteGroup.add(label('Ω sin φ', LIGHT.vert, base.clone().addScaledVector(F.n, L * s + (s > 0 ? 0.03 : -0.03))));
      if (Math.abs(c) > 0.02) siteGroup.add(label('Ω cos φ', LIGHT.horiz, base.clone().addScaledVector(F.nr, L * c * 1.08)));
      // 太陽從地點的東南上方照來
      sun.position.copy(F.n).multiplyScalar(4).addScaledVector(F.e, 2.5).addScaledVector(F.nr, -1.5);
    }

    // ---------- 更新 ----------
    let siteKey = '', axisKey = '', texKey = '', lastTex = 0;
    function parcelsKey() {
      const p = state.parcels;
      return p.length + ':' + (p.length ? p[p.length - 1].id + ':' + p.map(function (q) { return q.c.t; }).join(',') : '');
    }
    function update(now) {
      const ak = T('a', 'b');
      if (axisKey !== ak) { axisKey = ak; buildAxis(); }
      const sk = state.lat + '|' + ak;
      if (siteKey !== sk) { siteKey = sk; buildSite(); }
      const tk = [state.field, state.G, state.dp, D.ver, parcelsKey()].join('|');
      const t = now || performance.now();
      if (texKey !== tk && (t - lastTex > 90 || !state.running)) {
        texKey = tk; lastTex = t;
        mapCtx.clearRect(0, 0, TEX, TEX);
        B.drawMapTexture(mapCtx, TEX);
        mapTex.needsUpdate = true;
      }
      const s = Math.sin(state.lat * DEG);
      setHud('where', B.latName(state.lat));
      setHud('comp', 'Ω sin φ = ' + B.num(s, 3) + ' Ω' + (narrow ? '' : T('（垂直分量，讓風轉彎）', ' (vertical part: turns the wind)')));
      const lp = state.parcels[state.parcels.length - 1];
      setHud('time', lp ? 't = ' + B.num(lp.c.t / 3600, 1) + T(' 小時', ' h') : '');
      setHud('scale', T('地圖寬 2000 km（實際比例）', 'Map 2000 km across (true scale)'));
    }

    // ---------- 相機 ----------
    let narrow = false;
    function sizeOf(w) { return w < 560 ? 380 : 440; }
    function resize3() {
      const w = wrap.clientWidth;
      if (!w) return;
      const h = sizeOf(w);
      if (canvas.style.height !== h + 'px') canvas.style.height = h + 'px';
      const nar = w < 560;
      if (nar !== narrow) { narrow = nar; Object.keys(hudLast).forEach(function (k) { delete hudLast[k]; }); }
      cw = w; ch = h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      scene.traverse(function (o) { if (o.userData && o.userData.isLabel) fitLabel(o); });
      render();
    }
    let camAnim = null;
    function presetFor(kind) {
      const F = frameV || siteFrame(state.lat);
      const k = camera.aspect < 1.2 ? 1.35 : 1;
      if (kind === 'space') {
        const side = new THREE.Vector3(Math.cos(LON + 0.55), Math.sin(LON + 0.55), 0);
        const pos = side.multiplyScalar(3.7 * k).add(new THREE.Vector3(0, 0, 1.2 * k));
        return { pos: pos, tgt: new THREE.Vector3(0, 0, 0.25) };
      }
      if (kind === 'pole') {
        return { pos: new THREE.Vector3(0.04 * Math.cos(LON), 0.04 * Math.sin(LON), 4.4 * k), tgt: new THREE.Vector3(0, 0, 0) };
      }
      // 這個地點：從斜上方往下看地圖
      const tgt = F.n.clone().multiplyScalar(1.04);
      const pos = F.n.clone().multiplyScalar(1 + 0.55 * k).addScaledVector(F.nr, -0.5 * k).addScaledVector(F.e, 0.12 * k);
      return { pos: pos, tgt: tgt };
    }
    function camTo(kind, animate) {
      const P = presetFor(kind);
      if (!animate || B.reducedMotion) {
        camAnim = null;
        camera.position.copy(P.pos); controls.target.copy(P.tgt); controls.update(); render();
        return;
      }
      camAnim = { t0: performance.now(), dur: 800, p0: camera.position.clone(), t0v: controls.target.clone(), p1: P.pos, t1: P.tgt };
      B.request();
    }
    function stepCam() {
      if (!camAnim) return;
      const A = camAnim;
      const u = Math.min(1, (performance.now() - A.t0) / A.dur), e = 1 - Math.pow(1 - u, 3);
      camera.position.copy(A.p0).lerp(A.p1, e);
      controls.target.copy(A.t0v).lerp(A.t1, e);
      if (u >= 1) camAnim = null;
    }
    let moving = false;
    function render() {
      if (!api.active || document.hidden) return;
      const want = Math.min(window.devicePixelRatio || 1, 2);
      if (renderer.getPixelRatio() !== want) { renderer.setPixelRatio(want); renderer.setSize(cw, ch, false); }
      stepCam();
      moving = controls.update();
      axisGroup.visible = camera.position.length() > 2.1;   // 靠近地點時，北極上空的軸與轉向弧只會擋住畫面
      renderer.render(scene, camera);
    }
    const ro = window.ResizeObserver ? new ResizeObserver(function () { resize3(); }) : null;
    if (ro) ro.observe(wrap); else window.addEventListener('resize', resize3);
    controls.addEventListener('change', function () { B.request(); });
    canvas.addEventListener('webglcontextlost', function (ev) {
      ev.preventDefault();
      if (api.active && B.onContextLost) B.onContextLost();
    });

    const api = {
      active: true,
      frame: function (now) { update(now); render(); },
      busy: function () { return !!camAnim || moving; },
      onShow: function () { resize3(); camTo('site', false); },
      onTheme: function () {
        C = B.colors();
        Object.keys(hudLast).forEach(function (k) { delete hudLast[k]; });
        texKey = ''; axisKey = ''; siteKey = '';
        update(); render();
      },
      resetCamera: function () { camTo('site', true); },
      camTo: function (kind) { camTo(kind, true); },
      dispose: function () {
        api.active = false;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        controls.dispose();
        disposeObject(scene);
        mapTex.dispose();
        if (earthTex) earthTex.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        wrap.remove();
      }
    };

    // 初始化
    const w0 = wrap.clientWidth;
    if (w0) {
      narrow = w0 < 560;
      cw = w0; ch = sizeOf(w0);
      canvas.style.height = ch + 'px';
      renderer.setSize(cw, ch, false);
      camera.aspect = cw / ch;
      camera.updateProjectionMatrix();
    }
    update();
    camTo('site', false);
    return api;
  }

  window.Coriolis3D = { create: create };
})();
