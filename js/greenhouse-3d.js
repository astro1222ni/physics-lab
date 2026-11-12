/*
 * greenhouse-3d.js — 「溫室效應與地球的能量平衡」的 3D 地球（three.js）
 *
 * 由 js/greenhouse.js 在使用者按「3D 地球」時才載入（three.js 也是那時才以 import() 載入）；切回 2D 時整個釋放。
 * 用法：window.Greenhouse3D.create({ THREE, OrbitControls }, 容器, bridge) → { active, frame, busy, onShow, onTheme, resetCamera, camTo, dispose }
 *
 * 場景座標：地球半徑 1，北極朝 +z，太陽在 +x 方向（平行光）。
 * 冰帽：兩極各一頂球冠，冰緣緯度由 GreenhouseCore.iceLatitude 決定（冰帽面積和＝冰覆蓋比例，和 2D 同一份計算）。
 * 大氣層：半徑 1.06 的半透明球殼，不透明度隨 ε；箭頭粗細 ∝ 能量流（W/m²），和 2D 的比例一致（示意，未依比例的是大氣厚度與箭頭長度）。
 */
(function () {
  'use strict';
  const DEG = Math.PI / 180;

  function create(lib, host, B) {
    const THREE = lib.THREE;
    const K = B.K, T = B.T, state = B.state, D = B.D;
    let C = B.colors();

    // ---------- 畫布與 HUD ----------
    const wrap = document.createElement('div');
    wrap.className = 'c3-wrap';
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('地球、冰帽、大氣層與能量流的 3D 檢視（可拖曳旋轉、縮放）', '3D view of the Earth, its ice caps, the atmosphere and the energy flows (drag to rotate, pinch or scroll to zoom)'));
    wrap.appendChild(canvas);
    const hud = document.createElement('div');
    hud.className = 'c3-hud';
    hud.setAttribute('aria-hidden', 'true');
    hud.innerHTML = '<div class="tl"><span data-k="temp"></span><span class="m" data-k="bal"></span></div>' +
      '<div class="tr"><span class="m" data-k="ae"></span></div>' +
      '<div class="br"><span class="m" data-k="ice"></span><span class="m" data-k="note"></span></div>';
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
    controls.minDistance = 1.6;
    controls.maxDistance = 9;

    // 太陽在 +x：白天的半球亮、夜晚的半球只有很弱的環境光
    scene.add(new THREE.HemisphereLight(0x8fa8c8, 0x101820, 0.16));
    const sun = new THREE.DirectionalLight(0xffffff, 2.6);
    sun.position.set(5, 0, 0);
    scene.add(sun);

    const col = function (c) { return new THREE.Color(C[c] || c || '#888888'); };
    function disposeObject(obj) {
      obj.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m.map && m.map !== earthTex) m.map.dispose(); m.dispose(); });
      });
    }

    // ---------- 地球 ----------
    const earthGeo = new THREE.SphereGeometry(1, 96, 48);
    earthGeo.rotateX(Math.PI / 2);
    const earthMat = new THREE.MeshStandardMaterial({ color: 0x4a78a8, roughness: 0.9, metalness: 0 });
    const earth = new THREE.Mesh(earthGeo, earthMat);
    earth.rotation.z = -0.6;          // 讓亞洲與太平洋面向太陽
    scene.add(earth);
    let earthTex = null;
    new THREE.TextureLoader().load(new URL('img/tides/earth-2048.webp', document.baseURI).href, function (t) {
      if (!api.active) { t.dispose(); return; }
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      earthTex = t; earthMat.map = t; earthMat.color.set(0xffffff); earthMat.needsUpdate = true;
      B.request();
    }, undefined, function () { /* 載入失敗：保留素色的球 */ });

    // ---------- 冰帽 ----------
    const iceMat = new THREE.MeshStandardMaterial({ color: 0xf4f8fc, roughness: 0.55, metalness: 0, transparent: true, opacity: 0.94 });
    const iceGroup = new THREE.Group();
    scene.add(iceGroup);
    function buildIce(lat) {
      iceGroup.children.forEach(function (m) { m.geometry.dispose(); });
      iceGroup.clear();
      if (!(lat < 89.8)) return;
      const th = (90 - lat) * DEG;
      [[0, th], [Math.PI - th, th]].forEach(function (p) {
        const g = new THREE.SphereGeometry(1.004, 96, Math.max(4, Math.ceil(th / Math.PI * 48)), 0, Math.PI * 2, p[0], p[1]);
        g.rotateX(Math.PI / 2);
        iceGroup.add(new THREE.Mesh(g, iceMat));
      });
    }

    // ---------- 大氣層 ----------
    const atmFront = new THREE.MeshBasicMaterial({ color: 0x7fb4ff, transparent: true, opacity: 0.1, depthWrite: false });
    const atmBack = new THREE.MeshBasicMaterial({ color: 0x7fb4ff, transparent: true, opacity: 0.16, side: THREE.BackSide, depthWrite: false });
    const atmGeo = new THREE.SphereGeometry(1.06, 64, 32);
    const atm1 = new THREE.Mesh(atmGeo, atmBack), atm2 = new THREE.Mesh(atmGeo, atmFront);
    atm1.renderOrder = 2; atm2.renderOrder = 3;
    scene.add(atm1); scene.add(atm2);

    // ---------- 箭頭 ----------
    function arrowMesh(from, to, color, radius, opacity) {
      const g = new THREE.Group();
      const d = new THREE.Vector3().subVectors(to, from), L = d.length();
      if (L < 1e-4 || radius < 1e-4) return g;
      if (opacity == null) opacity = 1;
      const head = Math.min(L * 0.45, Math.max(radius * 4.5, 0.05));
      const mat = new THREE.MeshBasicMaterial({ color: color, transparent: opacity < 1, opacity: opacity, depthWrite: opacity >= 1 });
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, L - head, 14), mat);
      shaft.position.y = (L - head) / 2;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(Math.max(radius * 2.1, 0.022), head, 18), mat);
      cone.position.y = L - head / 2;
      g.add(shaft); g.add(cone);
      g.position.copy(from);
      g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      g.traverse(function (o) { o.renderOrder = 10; });
      return g;
    }

    // ---------- 文字標籤（Sprite，固定像素大小） ----------
    const RES = 3;
    let cw = 600, ch = 440;
    function label(text, color, pos, anchorRight) {
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
      sp.center.set(anchorRight ? 1 : 0, 0.5);
      sp.position.copy(pos);
      sp.renderOrder = 30;
      fitLabel(sp);
      return sp;
    }
    function fitLabel(sp) {
      const k = 2 * Math.tan(camera.fov * Math.PI / 360) / Math.max(1, ch);
      sp.scale.set(sp.userData.lw * k, sp.userData.lh * k, 1);
    }
    const LIGHT = { sun: '#fcd34d', refl: '#fde68a', ir: '#f87171', ir2: '#fb923c' };

    // 能量流：粗細 ∝ W/m²（半徑 = R0·√(W/340)，讓截面積 ∝ 能量）
    const flowGroup = new THREE.Group();
    scene.add(flowGroup);
    const R0 = 0.022;
    const rad = function (w) { return R0 * Math.sqrt(Math.max(0, w) / 340); };
    function buildFlows(f) {
      disposeObject(flowGroup); flowGroup.clear();
      const V = function (x, y, z) { return new THREE.Vector3(x, y, z); };
      // 陽光：從 +x 平行射來
      [[0, 0.35], [0, -0.35], [0.38, 0], [-0.38, 0]].forEach(function (o, i) {
        const y = o[0], z = o[1] + (i < 2 ? 0 : 0);
        const x1 = Math.sqrt(Math.max(0, 1.06 * 1.06 - y * y - z * z));
        flowGroup.add(arrowMesh(V(2.6, y, z), V(x1 + 0.02, y, z), new THREE.Color(LIGHT.sun), rad(f.incoming)));
      });
      flowGroup.add(label(T('陽光 ', 'Sunlight ') + B.num(f.incoming, 0) + ' W/m²', LIGHT.sun, V(2.6, 0, 0.5), true));
      // 反射：從白天半球往外
      [[25, 35], [-30, -25]].forEach(function (p) {
        const la = p[0] * DEG, lo = p[1] * DEG;
        const n = V(Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la));
        flowGroup.add(arrowMesh(n.clone().multiplyScalar(1.07), n.clone().multiplyScalar(1.07).add(V(0.75, n.y * 0.25, n.z * 0.25)), new THREE.Color(LIGHT.refl), rad(f.reflected), 0.95));
      });
      flowGroup.add(label(T('反射 ', 'Reflected ') + B.num(f.reflected, 0), LIGHT.refl, V(1.75, -0.62, -0.62)));
      // 射向太空的紅外線：全球（白天、夜晚都有）往外
      const out = [];
      for (let i = 0; i < 8; i++) { const lo = (i / 8) * Math.PI * 2 + 0.3; out.push([((i % 2) ? 28 : -22) * DEG, lo]); }
      out.push([62 * DEG, 2.2], [-60 * DEG, 4.2]);
      const Lout = 0.28 + 0.3 * f.olr / 240;
      out.forEach(function (p) {
        const n = V(Math.cos(p[0]) * Math.cos(p[1]), Math.cos(p[0]) * Math.sin(p[1]), Math.sin(p[0]));
        flowGroup.add(arrowMesh(n.clone().multiplyScalar(1.065), n.clone().multiplyScalar(1.065 + Lout), new THREE.Color(LIGHT.ir), rad(f.olr), 0.92));
      });
      flowGroup.add(label(T('射向太空的紅外線 ', 'Infrared to space ') + B.num(f.olr, 0), LIGHT.ir, V(-0.4, -1.1, 1.0)));
      // 回輻射：從大氣層往下
      for (let i = 0; i < 6; i++) {
        const lo = (i / 6) * Math.PI * 2 + 0.8, la = (i % 2 ? -12 : 15) * DEG;
        const n = V(Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la));
        if (f.atmDown > 1) flowGroup.add(arrowMesh(n.clone().multiplyScalar(1.2), n.clone().multiplyScalar(1.012), new THREE.Color(LIGHT.ir2), rad(f.atmDown) * 0.8, 0.9));
      }
      if (f.atmDown > 1) flowGroup.add(label(T('回輻射 ', 'Back radiation ') + B.num(f.atmDown, 0), LIGHT.ir2, V(-1.05, 0.9, -0.55), true));
    }

    // ---------- 更新 ----------
    let iceKey = '', flowKey = '', atmKey = '';
    function update() {
      const c = B.now(), f = c.f;
      const ik = state.ice ? c.iceLat.toFixed(1) : 'none';
      if (ik !== iceKey) { iceKey = ik; buildIce(state.ice ? c.iceLat : 90); }
      const fk = [f.incoming, f.reflected, f.olr, f.atmDown].map(function (v) { return Math.round(v); }).join('|') + T('a', 'b');
      if (fk !== flowKey) { flowKey = fk; buildFlows(f); }
      const ak = f.eps.toFixed(3) + (D.dark ? 'd' : 'l');
      if (ak !== atmKey) {
        atmKey = ak;
        const a = col('gh-atm').lerp(new THREE.Color(0xffffff), 0.35);
        atmFront.color.copy(a); atmBack.color.copy(a);
        atmFront.opacity = 0.015 + 0.13 * f.eps;
        atmBack.opacity = 0.03 + 0.2 * f.eps;
      }
      setHud('temp', T('地表 ', 'Surface ') + B.num(state.T, 1) + ' K（' + B.num(state.T - 273.15, 1) + ' °C）');
      setHud('bal', 'N = ' + (f.N >= 0.005 ? '+' : '') + B.num(f.N, 2) + ' W/m²' + (narrow ? '' : Math.abs(f.N) < 0.05 ? T('（收支平衡）', ' (balanced)') : f.N > 0 ? T('（變暖中）', ' (warming)') : T('（變冷中）', ' (cooling)')));
      setHud('ae', 'α ' + B.num(f.alpha, 3) + '・ε ' + B.num(f.eps, 3));
      setHud('ice', B.iceText());
      setHud('note', narrow ? T('示意：大氣厚度未依比例', 'Not to scale') : T('示意圖：大氣厚度與箭頭長度未依比例；箭頭粗細 ∝ 能量', 'Not to scale: atmosphere thickness and arrow lengths; arrow thickness ∝ energy'));
    }

    // ---------- 相機 ----------
    let narrow = false;
    function sizeOf(w) { return w < 560 ? 380 : 420; }
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
      const k = camera.aspect < 1.2 ? 1.45 : 1;
      if (kind === 'sun') return { pos: new THREE.Vector3(4.6 * k, 1.3 * k, 1.1 * k), tgt: new THREE.Vector3(0.3, 0, 0) };
      if (kind === 'pole') return { pos: new THREE.Vector3(0.9 * k, 0.15, 4.8 * k), tgt: new THREE.Vector3(0.4, 0, 0) };
      return { pos: new THREE.Vector3(1.4 * k, -5.0 * k, 1.5 * k), tgt: new THREE.Vector3(k > 1 ? 0.85 : 0.55, 0, 0) };
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
      frame: function () { update(); render(); },
      busy: function () { return !!camAnim || moving; },
      onShow: function () { resize3(); camTo('side', false); },
      onTheme: function () {
        C = B.colors();
        Object.keys(hudLast).forEach(function (k) { delete hudLast[k]; });
        flowKey = ''; atmKey = '';
        update(); render();
      },
      resetCamera: function () { camTo('side', true); },
      camTo: function (kind) { camTo(kind, true); },
      dispose: function () {
        api.active = false;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        controls.dispose();
        disposeObject(scene);
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
    camTo('side', false);
    return api;
  }

  window.Greenhouse3D = { create: create };
})();
