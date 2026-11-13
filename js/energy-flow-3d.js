/*
 * energy-flow-3d.js — 「生態系的能量流動」的 3D 階梯金字塔（three.js）
 *
 * 由 js/energy-flow.js 在使用者按「3D 金字塔」時才載入（three.js 也是那時才以 import() 載入）；切回 2D 時整個釋放。
 * 用法：window.EF3D.create({ THREE, OrbitControls }, 容器, bridge) → { active, onShow, onTheme, resetCamera, update, resize, dispose }
 *
 * 每一個營養階層一塊方板，由下（生產者）往上疊。數值與 2D 金字塔相同（bridge.data()，由核心 EFCore.pyramid 算出）：
 *   對數寬度：方板邊長 = 2D 長條的相對長度（同一套 barFracs）；
 *   真實比例：方板「面積」與數量成正比（邊長 ∝ 數量的平方根）。
 * 倒立的階層（比下面一階大）照實畫出：上面的板子會比下面的寬。只在參數改變、拖曳或換主題時重畫。
 */
(function () {
  'use strict';

  function create(lib, host, BR) {
    const THREE = lib.THREE;
    const T = BR.T, D = BR.D;
    const FONT = D.FONT;
    const RES = Math.min(2, window.devicePixelRatio || 1) * 1.5;
    let C = BR.colors();

    const wrap = document.createElement('div');
    wrap.className = 'ef3-wrap';
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('3D 營養階層金字塔：每一階一塊方板，生產者在最下面（可拖曳旋轉、縮放）',
      '3D trophic pyramid: one slab per level, producers at the bottom (drag to rotate, pinch or scroll to zoom)'));
    wrap.appendChild(canvas);
    const hud = document.createElement('div');
    hud.className = 'ef3-hud';
    hud.setAttribute('aria-hidden', 'true');
    hud.innerHTML = '<div class="tl"><span data-k="t"></span><span class="m" data-k="s"></span></div><div class="br"><span class="m" data-k="note"></span></div>';
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
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1.5, 0.05, 100);
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.rotateSpeed = 0.85;
    controls.enablePan = false;
    controls.minDistance = 3;
    controls.maxDistance = 18;
    controls.maxPolarAngle = Math.PI * 0.49;

    const hemi = new THREE.HemisphereLight(0xffffff, 0x5a5040, 1.0);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(-4, 7, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -4; key.shadow.camera.right = 4; key.shadow.camera.top = 4; key.shadow.camera.bottom = -4;
    key.shadow.camera.near = 1; key.shadow.camera.far = 20;
    key.shadow.radius = 4;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xcfe3ff, 0.45);
    rim.position.set(5, 3, -6);
    scene.add(rim);

    function disposeObject(obj) {
      obj.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); });
      });
    }

    // ---------- 地面 ----------
    const ground = new THREE.Mesh(new THREE.CircleGeometry(4.2, 64), new THREE.ShadowMaterial({ opacity: 0.22 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.25 });
    const ring = new THREE.Mesh(new THREE.RingGeometry(3.6, 3.62, 96), ringMat);
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.002;
    scene.add(ring);

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
    function label(text, sub, color) {
      const s1 = 12 * RES, s2 = 10.5 * RES;
      const f1 = '700 ' + s1 + 'px ' + FONT, f2 = '500 ' + s2 + 'px ' + FONT;
      const c = document.createElement('canvas');
      let g = c.getContext('2d');
      g.font = f1; const w1 = g.measureText(text).width;
      g.font = f2; const w2 = sub ? g.measureText(sub).width : 0;
      const padX = 7 * RES, padY = 3 * RES;
      c.width = Math.ceil(Math.max(w1, w2) + 2 * padX);
      c.height = Math.ceil(s1 * 1.25 + (sub ? s2 * 1.25 : 0) + 2 * padY);
      g = c.getContext('2d');
      roundRect(g, RES * 0.5, RES * 0.5, c.width - RES, c.height - RES, Math.min(10 * RES, (c.height - RES) / 2));
      g.fillStyle = D.alpha(D.c['canvas-bg'], D.dark ? 0.86 : 0.9);
      g.fill();
      g.strokeStyle = D.alpha(color, 0.6);
      g.lineWidth = RES;
      g.stroke();
      g.textBaseline = 'middle';
      g.font = f1; g.fillStyle = color;
      g.fillText(text, padX, padY + s1 * 0.62);
      if (sub) { g.font = f2; g.fillStyle = D.c.muted; g.fillText(sub, padX, padY + s1 * 1.25 + s2 * 0.6); }
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false }));
      sp.userData = { lw: c.width / RES, lh: c.height / RES };
      sp.center.set(0, 0.5);
      sp.renderOrder = 30;
      fitLabel(sp);
      return sp;
    }
    function fitLabel(sp) {
      const k = 2 * Math.tan(camera.fov * Math.PI / 360) / Math.max(1, ch);
      sp.scale.set(sp.userData.lw * k, sp.userData.lh * k, 1);
    }

    // ---------- 金字塔 ----------
    const pyramid = new THREE.Group();
    scene.add(pyramid);
    const H = 0.44, TH = 0.34, SMAX = 3.0;
    let lastKey = '';
    function slabColor(n, kind) {
      const base = new THREE.Color(C['ef-l' + (n + 1)]);
      if (kind === 'poll') base.lerp(new THREE.Color(C['ef-poll']), 0.6);
      return base;
    }
    function build() {
      const d = BR.data();
      const key = JSON.stringify([d.kind, d.scale, d.vals, d.names, D.dark, D.ver]);
      if (key === lastKey) return d;
      lastKey = key;
      disposeObject(pyramid);
      pyramid.clear();
      const N = d.N;
      for (let n = 0; n < N; n++) {
        const side = Math.max(0.03, SMAX * (d.scale === 'lin' ? Math.sqrt(d.fracs[n]) : d.fracs[n]));
        const geo = new THREE.BoxGeometry(side, TH, side);
        const col = slabColor(n, d.kind);
        const mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.55, metalness: 0.04, emissive: col.clone().multiplyScalar(0.06) });
        const m = new THREE.Mesh(geo, mat);
        m.position.y = TH / 2 + n * H;
        m.castShadow = true; m.receiveShadow = true;
        pyramid.add(m);
        // 上緣亮邊
        const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: col.clone().lerp(new THREE.Color(0xffffff), 0.45), transparent: true, opacity: 0.7 }));
        edge.position.copy(m.position);
        pyramid.add(edge);
        // 標籤
        const invTxt = n > 0 && d.inv[n] && d.kind !== 'poll' && d.kind !== 'energy' ? T('（倒立）', ' (inverted)') : '';
        const sp = label(d.names[n] + invTxt, d.fmt(d.vals[n]) + ' ' + d.unit, '#' + col.clone().lerp(new THREE.Color(D.dark ? 0xffffff : 0x000000), 0.25).getHexString());
        sp.position.set(Math.max(side, 0.5) / 2 + 0.18, TH / 2 + n * H, 0);
        pyramid.add(sp);
      }
      return d;
    }
    function apply() {
      const d = build();
      setHud('t', d.title);
      setHud('s', d.scale === 'lin' ? T('底面積 ∝ 數量（真實比例）', 'footprint area ∝ amount (true proportion)') : T('邊長同 2D 長條（對數刻度）', 'side = 2D bar length (log scale)'));
      setHud('note', T('拖曳旋轉・捏合縮放', 'Drag to rotate · pinch to zoom'));
    }
    function themeColors() {
      C = BR.colors();
      ringMat.color.set(D.c.text);
      ringMat.opacity = D.dark ? 0.22 : 0.16;
      ground.material.opacity = D.dark ? 0.35 : 0.2;
      lastKey = '';
    }

    // ---------- 相機、繪製 ----------
    let raf = 0, moving = false, lastAspect = 0, narrow = false;
    function sizeOf(w) { return w < 520 ? Math.round(Math.max(320, Math.min(400, w * 1.0))) : 440; }
    function resetCamera() {
      const N = BR.data().N;
      const cy = Math.max(0.6, N * H * 0.5);
      const d = narrow ? 9.2 : 7.4;
      camera.position.set(d * 0.62, cy + d * 0.42, d * 0.68);
      controls.target.set(0.4, cy, 0);
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
      ch = h;
      const nw = w < 520;
      if (nw !== narrow) { narrow = nw; lastAspect = 0; }
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      scene.traverse(function (o) { if (o.isSprite) fitLabel(o); });
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
      update: function () { apply(); requestRender(); },
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
      narrow = w0 < 520;
      ch = sizeOf(w0);
      canvas.style.height = ch + 'px';
      renderer.setSize(w0, ch, false);
      camera.aspect = w0 / ch;
      camera.updateProjectionMatrix();
      lastAspect = camera.aspect;
    }
    themeColors();
    apply();
    resetCamera();
    renderNow();
    return api;
  }
  window.EF3D = { create: create };
})();
