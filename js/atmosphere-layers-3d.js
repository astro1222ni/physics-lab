/*
 * atmosphere-layers-3d.js — 「大氣分層、氣壓與標準大氣」的 3D 地球（three.js）
 *
 * 由 js/atmosphere-layers.js 在使用者按「3D 地球」時才載入（three.js 也是那時才以 import() 載入）；切回 2D 時整個釋放。
 * 用法：window.AtmosphereLayers3D.create({ THREE, OrbitControls }, 容器, bridge) → { active, frame, busy, onShow, onTheme, resetCamera, camTo, dispose }
 *
 * 場景座標：地球半徑 1，北極朝 +z，經度 0° 在 +x。大氣的厚度放大 EXAG 倍（真實比例只有地球半徑的 2%，看不見）。
 * 四個分層畫成發光的球殼（邊緣越亮，像從太空看到的地球邊緣），臺灣上空立一根高度柱：探測點、參考點、探空氣球都在柱子上。
 * 極光：地磁北極（約 80.7°N、72.7°W）與南極附近、磁緯約 67° 的環，100–120 km。
 */
(function () {
  'use strict';
  const DEG = Math.PI / 180;
  const EXAG = 20;
  const RE = 6371;
  const rOf = function (zkm) { return 1 + zkm * EXAG / RE; };

  function create(lib, host, B) {
    const THREE = lib.THREE;
    const K = B.K, T = B.T, state = B.state, D = B.D;
    let C = B.colors();

    // ---------- 畫布與 HUD ----------
    const wrap = document.createElement('div');
    wrap.className = 'c3-wrap';
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('地球與大氣分層的 3D 檢視：臺灣上空的高度柱、探測點與探空氣球（可拖曳旋轉、縮放）', '3D view of the Earth and the layers of its atmosphere: a height column above Taiwan with the probe and the weather balloon (drag to rotate, pinch or scroll to zoom)'));
    wrap.appendChild(canvas);
    const hud = document.createElement('div');
    hud.className = 'c3-hud';
    hud.setAttribute('aria-hidden', 'true');
    hud.innerHTML = '<div class="tl"><span data-k="probe"></span><span class="m" data-k="probe2"></span></div>' +
      '<div class="tr"><span data-k="layer"></span><span class="m" data-k="balloon"></span></div>' +
      '<div class="br"><span class="m" data-k="note"></span></div>';
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

    // 臺灣（23.5°N、121°E）的位置與當地的東、北方向
    const V = function (x, y, z) { return new THREE.Vector3(x, y, z); };
    const dirOf = function (lat, lon) { return V(Math.cos(lat * DEG) * Math.cos(lon * DEG), Math.cos(lat * DEG) * Math.sin(lon * DEG), Math.sin(lat * DEG)); };
    const N0 = dirOf(23.5, 121);
    const EAST = V(-Math.sin(121 * DEG), Math.cos(121 * DEG), 0);
    const NORTH = new THREE.Vector3().crossVectors(N0, EAST).normalize();

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1.6, 0.005, 100);
    // 畫面的「上」＝臺灣的鉛直方向：從側面看，高度柱是直立的（OrbitControls 建立時就讀 camera.up，所以要先設）
    camera.up.copy(N0);
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.rotateSpeed = 0.7;
    controls.enablePan = false;
    controls.minDistance = 0.45;
    controls.maxDistance = 9;


    // 太陽：從臺灣的東南上方照過來（下午，晝夜交界在畫面上看得到）
    scene.add(new THREE.HemisphereLight(0x9fb6d4, 0x18222e, 0.5));
    const sun = new THREE.DirectionalLight(0xffffff, 2.5);
    sun.position.copy(dirOf(-8, 160).multiplyScalar(6));
    scene.add(sun);

    const col = function (c) { return new THREE.Color(C[c] || c || '#888888'); };
    function disposeObject(obj) {
      obj.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m.map && m.map !== earthTex) m.map.dispose(); m.dispose(); });
      });
    }

    // ---------- 星空 ----------
    (function () {
      const n = 900, pos = new Float32Array(n * 3);
      let seed = 7;
      const rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      for (let i = 0; i < n; i++) {
        const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, r = 40;
        const s = Math.sqrt(1 - u * u);
        pos[i * 3] = r * s * Math.cos(th); pos[i * 3 + 1] = r * s * Math.sin(th); pos[i * 3 + 2] = r * u;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.3, sizeAttenuation: false, transparent: true, opacity: 0.7, depthWrite: false })));
    })();

    // ---------- 地球 ----------
    const earthGeo = new THREE.SphereGeometry(1, 128, 64);
    earthGeo.rotateX(Math.PI / 2);
    const earthMat = new THREE.MeshStandardMaterial({ color: 0x4a78a8, roughness: 0.9, metalness: 0 });
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

    // ---------- 發光的球殼（邊緣越亮） ----------
    function rimMaterial(color, strength, power, side) {
      return new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(color) }, uStrength: { value: strength }, uPower: { value: power } },
        vertexShader: 'varying vec3 vN; varying vec3 vV;\n' +
          'void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'uniform vec3 uColor; uniform float uStrength; uniform float uPower; varying vec3 vN; varying vec3 vV;\n' +
          'void main(){ float r = 1.0 - abs(dot(normalize(vN), normalize(vV))); float a = uStrength * pow(r, uPower); gl_FragColor = vec4(uColor * a, a); }',
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: side || THREE.FrontSide
      });
    }
    const TOPS = [K.geomet(11000) / 1000, K.geomet(51000) / 1000, 86, 120];
    const shells = [];
    TOPS.forEach(function (z, i) {
      const g = new THREE.SphereGeometry(rOf(z), 96, 48);
      const m = new THREE.Mesh(g, rimMaterial('#ffffff', [0.55, 0.42, 0.34, 0.3][i], 2.6));
      m.renderOrder = 4 + i;
      scene.add(m);
      shells.push(m);
    });
    // 臭氧層：25 km 附近一層淡紫色
    const ozone = new THREE.Mesh(new THREE.SphereGeometry(rOf(25), 96, 48), rimMaterial('#c084fc', 0.35, 5));
    ozone.renderOrder = 9;
    scene.add(ozone);

    // ---------- 極光環 ----------
    function auroraRing(poleLat, poleLon) {
      const P = dirOf(poleLat, poleLon);
      const a = Math.abs(P.z) > 0.9 ? V(1, 0, 0) : V(0, 0, 1);
      const U = new THREE.Vector3().crossVectors(P, a).normalize(), W = new THREE.Vector3().crossVectors(P, U).normalize();
      const n = 160, colat = 23 * DEG;
      const pos = [], uv = [], idx = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n * Math.PI * 2;
        const wob = colat + 0.03 * Math.sin(t * 5) + 0.02 * Math.sin(t * 11 + 1.3);
        const d = P.clone().multiplyScalar(Math.cos(wob)).add(U.clone().multiplyScalar(Math.sin(wob) * Math.cos(t))).add(W.clone().multiplyScalar(Math.sin(wob) * Math.sin(t)));
        [rOf(100), rOf(122)].forEach(function (r, k) { const q = d.clone().multiplyScalar(r); pos.push(q.x, q.y, q.z); uv.push(i / n, k); });
        if (i < n) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      const m = new THREE.ShaderMaterial({
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'varying vec2 vUv; void main(){ float v = vUv.y; float a = smoothstep(0.0,0.12,v) * (1.0 - smoothstep(0.35,1.0,v)) * (0.65 + 0.35*sin(vUv.x*180.0)); vec3 c = mix(vec3(0.25,1.0,0.5), vec3(1.0,0.3,0.45), smoothstep(0.55,1.0,v)); gl_FragColor = vec4(c*a*0.9, a*0.9); }',
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(g, m);
      mesh.renderOrder = 12;
      return mesh;
    }
    scene.add(auroraRing(80.7, -72.7));
    scene.add(auroraRing(-80.7, 107.3));

    // ---------- 臺灣上空的高度柱 ----------
    const column = new THREE.Group();
    scene.add(column);
    const at = function (zkm) { return N0.clone().multiplyScalar(rOf(zkm)); };
    (function () {
      const L = rOf(120) - 1;
      const g = new THREE.CylinderGeometry(0.0016, 0.0016, L, 10);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }));
      m.position.copy(at(60));
      m.quaternion.setFromUnitVectors(V(0, 1, 0), N0);
      m.renderOrder = 15;
      column.add(m);
    })();
    // 分界的小環
    const ringMats = [];
    TOPS.slice(0, 3).forEach(function (z, i) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false });
      ringMats.push([mat, i + 1]);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0018, 8, 40), mat);
      ring.position.copy(at(z));
      ring.quaternion.setFromUnitVectors(V(0, 0, 1), N0);
      ring.renderOrder = 16;
      column.add(ring);
    });

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
    // 釘在高度柱上的標籤：每一格依相機的左右方向偏移固定的像素，從哪個方向看都不會疊在柱子上
    const pinned = [];
    function pin(sp, zkm, side, px, keepFar) { sp.userData.pin = { z: zkm, side: side, px: px, keepFar: !!keepFar }; pinned.push(sp); return sp; }
    const tmpR = new THREE.Vector3(), tmpP = new THREE.Vector3();
    function placeLabels() {
      camera.updateMatrixWorld();
      tmpR.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
      const k = 2 * Math.tan(camera.fov * Math.PI / 360) / Math.max(1, ch);
      for (let i = pinned.length - 1; i >= 0; i--) {
        const sp = pinned[i];
        if (!sp.parent) { pinned.splice(i, 1); continue; }
        const q = sp.userData.pin;
        tmpP.copy(N0).multiplyScalar(rOf(q.z));
        const d = camera.position.distanceTo(tmpP);
        sp.position.copy(tmpP).addScaledVector(tmpR, q.side * q.px * d * k);
        sp.visible = q.keepFar || d < 2.4;   // 遠看整個地球時，柱子太短，層名會擠成一團，只留「臺灣」
      }
    }
    function fitLabel(sp) {
      const k = 2 * Math.tan(camera.fov * Math.PI / 360) / Math.max(1, ch);
      sp.scale.set(sp.userData.lw * k, sp.userData.lh * k, 1);
    }
    const LIGHT = ['#93c5fd', '#5eead4', '#c4b5fd', '#f9a8d4'];

    // 層名：沿著高度柱，偏向東邊
    const layerLabels = new THREE.Group();
    scene.add(layerLabels);
    function buildLayerLabels() {
      disposeObject(layerLabels); layerLabels.clear();
      const mids = [5.5, 31, 68.5, 103];
      // 層名在柱子右邊，臭氧層與探測點在左邊；臺灣寫在柱腳下方
      mids.forEach(function (z, i) {
        layerLabels.add(pin(label(B.layerName(i), LIGHT[i], at(z), false), z, 1, 12));
      });
      layerLabels.add(pin(label(T('臭氧層', 'Ozone layer'), '#d8b4fe', at(25), true), 25, -1, 12));
      layerLabels.add(pin(label(T('臺灣', 'Taiwan'), '#f1f5f9', at(-9), false), -9, 1, 4, true));
    }

    // ---------- 探測點、參考點、氣球 ----------
    const probe = new THREE.Mesh(new THREE.SphereGeometry(0.009, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    probe.renderOrder = 20;
    scene.add(probe);
    const probeRing = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.0024, 8, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }));
    probeRing.quaternion.setFromUnitVectors(V(0, 0, 1), N0);
    probeRing.renderOrder = 20;
    scene.add(probeRing);
    const refDot = new THREE.Mesh(new THREE.SphereGeometry(0.007, 20, 12), new THREE.MeshBasicMaterial({ color: 0xfbbf24 }));
    refDot.renderOrder = 19;
    scene.add(refDot);
    const balloonMat = new THREE.MeshStandardMaterial({ color: 0xfb7185, roughness: 0.35, metalness: 0, emissive: 0x3a0a14 });
    const balloon = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), balloonMat);
    balloon.renderOrder = 21;
    scene.add(balloon);
    const probeLabel = new THREE.Group();
    scene.add(probeLabel);

    // ---------- 更新 ----------
    let probeKey = '', labelKey = '', colorKey = '';
    function update() {
      const s = B.now();
      const ck = (D.dark ? 'd' : 'l') + T('a', 'b');
      if (ck !== colorKey) {
        colorKey = ck;
        shells.forEach(function (m, i) { m.material.uniforms.uColor.value.copy(col(B.LAYERS[i].c)).lerp(new THREE.Color(0xffffff), 0.2); });
        ringMats.forEach(function (p) { p[0].color.copy(col(B.LAYERS[p[1]].c)); });
        probe.material.color.copy(col('accent')); probeRing.material.color.copy(col('accent'));
        buildLayerLabels();
        labelKey = '';
      }
      probe.position.copy(at(state.z));
      probeRing.position.copy(at(state.z));
      if (state.ref) { refDot.visible = true; refDot.position.copy(at(state.ref.z)); } else refDot.visible = false;
      const pk = [state.z.toFixed(3), state.dT, T('a', 'b')].join('|');
      if (pk !== labelKey) {
        labelKey = pk;
        disposeObject(probeLabel); probeLabel.clear();
        probeLabel.add(pin(label(B.zLabel(state.z) + '・' + B.cel(s.T) + '・' + B.pText(s.P), '#ffffff', at(state.z), true), state.z, -1, 16));
      }
      // 氣球：照直徑放大（示意，放大很多倍），放在柱子北邊一點
      const b = state.balloon;
      if (b && state.bstate !== 'burst') {
        const st = K.balloonAt(b, b.z);
        balloon.visible = true;
        const r = 0.006 + st.D * 0.0016;
        balloon.scale.setScalar(r);
        balloon.position.copy(at(b.z / 1000 + 0.3)).add(NORTH.clone().multiplyScalar(0.018 + r));
      } else balloon.visible = false;
      setHud('probe', B.zLabel(state.z) + '・' + B.cel(s.T) + '・' + B.pText(s.P));
      setHud('probe2', T('頭上還有 ', 'Air above: ') + (s.above >= 0.001 ? B.num(s.above * 100, s.above >= 0.1 ? 1 : 3) + '%' : T('不到 0.1%', 'under 0.1%')) + T(' 的空氣', ''));
      setHud('layer', B.layerName(s.layer));
      setHud('balloon', b ? (state.bstate === 'burst' ? T('氣球在 ', 'Balloon burst at ') + B.zLabel(b.z / 1000) + T(' 爆破', '') : T('氣球 ', 'Balloon ') + B.zLabel(b.z / 1000)) : '');
      setHud('note', narrow ? T('大氣厚度放大 20 倍', 'Atmosphere ×20 thicker') : T('大氣的厚度放大 20 倍，氣球也畫大了', 'Atmosphere drawn 20 times thicker; balloon enlarged'));
    }

    // ---------- 相機 ----------
    let narrow = false;
    function sizeOf(w) { return w < 560 ? 400 : 440; }
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
      const k = camera.aspect < 1.2 ? 1.5 : 1;
      if (kind === 'taiwan') {
        // 從東南方的高處斜斜往下看臺灣與高度柱
        const tgt = at(50);
        return { pos: tgt.clone().add(N0.clone().multiplyScalar(0.48 * k)).add(EAST.clone().multiplyScalar(0.42 * k)).add(NORTH.clone().multiplyScalar(-0.5 * k)), tgt: tgt };
      }
      // 整個地球：從向陽的一側看，臺灣在畫面上半部
      if (kind === 'far') return { pos: N0.clone().multiplyScalar(0.55).add(sun.position.clone().normalize().multiplyScalar(0.75)).normalize().multiplyScalar(4.2 * k), tgt: V(0, 0, 0) };
      // 地球邊緣：從側面看高度柱，柱子立在地平線上
      const tgt = at(55);
      return { pos: tgt.clone().add(EAST.clone().multiplyScalar(1.2 * k)).add(N0.clone().multiplyScalar(0.03)).add(NORTH.clone().multiplyScalar(-0.3 * k)), tgt: tgt };
    }
    function camTo(kind, animate) {
      const P = presetFor(kind);
      if (!animate || B.reducedMotion) {
        camAnim = null;
        camera.position.copy(P.pos); controls.target.copy(P.tgt); controls.update(); render();
        return;
      }
      camAnim = { t0: performance.now(), dur: 900, p0: camera.position.clone(), t0v: controls.target.clone(), p1: P.pos, t1: P.tgt };
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
      placeLabels();
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
      onShow: function () { resize3(); camTo('limb', false); },
      onTheme: function () {
        C = B.colors();
        Object.keys(hudLast).forEach(function (k) { delete hudLast[k]; });
        colorKey = ''; labelKey = '';
        update(); render();
      },
      resetCamera: function () { camTo('limb', true); },
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
    camTo('limb', false);
    return api;
  }

  window.AtmosphereLayers3D = { create: create };
})();
