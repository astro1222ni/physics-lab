/*
 * stars-hr-3d.js — 「恆星的顏色與亮度」的 3D 大小比較（three.js）
 *
 * 由 js/stars-hr.js 在使用者按「3D」時才載入（three.js 也是那時才以 import() 載入）；切回 2D 時整個釋放。
 * 用法：window.Stars3D.create({ THREE, OrbitControls }, 容器, bridge) → { active, frame, busy, onShow, onTheme, resetCamera, camTo, dispose }
 *
 * 場景單位 = 太陽半徑（R☉）。你的恆星放在原點，比較的恆星、太陽、地球依序排在右邊（x 軸），全部依真實比例；
 * 顏色 = 黑體顏色（StarsCore.colorHex），表面加上臨邊昏暗（limb darkening，線性係數 0.6，示意）。
 * 星球在畫面上小於幾個像素時，改用固定大小的圓圈標出位置。
 */
(function () {
  'use strict';
  const R_EARTH_SUN = 6.371e6 / 6.957e8;

  function create(lib, host, B) {
    const THREE = lib.THREE;
    const K = B.K, T = B.T, D = B.D;
    let C = B.colors();

    // ---------- 畫布與 HUD ----------
    const wrap = document.createElement('div');
    wrap.className = 'c3-wrap';
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('依真實比例的 3D 大小比較：你的恆星、比較的恆星、太陽和地球（可拖曳旋轉、縮放）',
      'True-to-scale 3D size comparison of your star, the comparison star, the Sun and the Earth (drag to rotate, pinch or scroll to zoom)'));
    wrap.appendChild(canvas);
    const hud = document.createElement('div');
    hud.className = 'c3-hud';
    hud.setAttribute('aria-hidden', 'true');
    hud.innerHTML = '<div class="tl"><span data-k="me"></span><span class="m" data-k="cmp"></span></div>' +
      '<div class="br"><span class="m" data-k="note"></span></div>';
    wrap.appendChild(hud);
    host.appendChild(wrap);
    const hudEl = {}, hudLast = {};
    hud.querySelectorAll('[data-k]').forEach(function (e) { hudEl[e.getAttribute('data-k')] = e; });
    function setHud(k, html) { if (hudLast[k] !== html) { hudLast[k] = html; hudEl[k].innerHTML = html; } }

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
    } catch (e) {
      wrap.remove();
      throw e;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x03050b, 1);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1.6, 0.001, 1e5);
    camera.up.set(0, 0, 1);
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.rotateSpeed = 0.7;
    controls.enablePan = false;
    controls.zoomSpeed = 1.4;

    // 背景星空（畫在螢幕空間的貼圖，不跟著尺度變）
    function starfield() {
      const c = document.createElement('canvas'); c.width = 1024; c.height = 640;
      const g = c.getContext('2d');
      const bg = g.createRadialGradient(512, 280, 40, 512, 320, 700);
      bg.addColorStop(0, '#121a33'); bg.addColorStop(1, '#03050b');
      g.fillStyle = bg; g.fillRect(0, 0, 1024, 640);
      let seed = 11;
      const rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      for (let i = 0; i < 520; i++) {
        const x = rnd() * 1024, y = rnd() * 640, a = 0.15 + rnd() * 0.5, r = rnd() < 0.06 ? 1.4 : 0.7;
        g.fillStyle = 'rgba(226,232,240,' + a.toFixed(2) + ')'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      }
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    }
    scene.background = starfield();
    scene.add(new THREE.AmbientLight(0xffffff, 0.25));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
    keyLight.position.set(-1, -0.6, 0.5);
    scene.add(keyLight);

    function disposeObject(obj) {
      obj.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); });
      });
    }

    // ---------- 文字標籤（Sprite，固定像素大小） ----------
    const RES = 3;
    let cw = 600, ch = 440;
    function makeLabelCanvas(text, color) {
      const font = '700 ' + 12 * RES + 'px ' + D.FONT;
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
      g.fillStyle = 'rgba(8,12,26,0.82)'; g.fill();
      g.strokeStyle = color; g.globalAlpha = 0.75; g.lineWidth = RES; g.stroke(); g.globalAlpha = 1;
      g.font = font; g.textBaseline = 'middle'; g.fillStyle = color; g.fillText(text, 6 * RES, c.height / 2 + RES * 0.5);
      return c;
    }
    function label(text, color) {
      const c = makeLabelCanvas(text, color);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false }));
      sp.userData = { lw: c.width / RES, lh: c.height / RES, isLabel: true, text: text };
      sp.renderOrder = 30;
      fitLabel(sp);
      return sp;
    }
    function fitLabel(sp) {
      const k = 2 * Math.tan(camera.fov * Math.PI / 360) / Math.max(1, ch);
      sp.scale.set(sp.userData.lw * k, sp.userData.lh * k, 1);
    }
    function setLabel(sp, text, color) {
      if (sp.userData.text === text && sp.userData.color === color) return;
      const c = makeLabelCanvas(text, color);
      sp.material.map.dispose();
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
      sp.material.map = tex; sp.material.needsUpdate = true;
      sp.userData.lw = c.width / RES; sp.userData.lh = c.height / RES; sp.userData.text = text; sp.userData.color = color;
      fitLabel(sp);
    }
    // 小到看不見時的位置圈（固定像素）
    function ringTexture() {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d');
      g.strokeStyle = '#ffffff'; g.lineWidth = 4; g.beginPath(); g.arc(32, 32, 26, 0, Math.PI * 2); g.stroke();
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    }
    const ringTex = ringTexture();
    function glowTexture() {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d');
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    }
    const glowTex = glowTexture();

    // ---------- 星球 ----------
    // 恆星表面：黑體顏色＋線性臨邊昏暗＋淡淡的米粒組織（示意）
    const starVS = 'varying vec3 vN; varying vec3 vV; varying vec3 vP;\n' +
      'void main(){ vP = position; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }';
    const starFS = 'uniform vec3 uColor; uniform float uTime; varying vec3 vN; varying vec3 vV; varying vec3 vP;\n' +
      'float h(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453); }\n' +
      'float n3(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);\n' +
      '  return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }\n' +
      'void main(){ float mu = clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);\n' +
      '  float limb = 1.0 - 0.6 * (1.0 - mu);\n' +
      '  vec3 q = normalize(vP) * 18.0 + vec3(0.0, 0.0, uTime * 0.05);\n' +
      '  float gran = 0.92 + 0.08 * (0.6 * n3(q) + 0.4 * n3(q * 2.3));\n' +
      '  vec3 c = uColor * limb * gran + vec3(1.0) * pow(mu, 6.0) * 0.12;\n' +
      '  gl_FragColor = vec4(c, 1.0);\n' +
      '  #include <colorspace_fragment>\n}';
    function makeStar() {
      const grp = new THREE.Group();
      const mat = new THREE.ShaderMaterial({ uniforms: { uColor: { value: new THREE.Color(1, 1, 1) }, uTime: { value: 0 } }, vertexShader: starVS, fragmentShader: starFS });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), mat);
      grp.add(mesh);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.32 }));
      glow.scale.set(3.2, 3.2, 1);
      grp.add(glow);
      return { grp: grp, mesh: mesh, glow: glow, mat: mat };
    }
    function makeEarth() {
      const grp = new THREE.Group();
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 40), new THREE.MeshStandardMaterial({ color: 0x2f6fd6, roughness: 0.7, metalness: 0, emissive: 0x0b2350, emissiveIntensity: 0.6 }));
      grp.add(mesh);
      return { grp: grp, mesh: mesh };
    }
    function makeRing(color) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, color: new THREE.Color(color), transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false }));
      sp.renderOrder = 25;
      return sp;
    }
    const bodies = {
      me: Object.assign(makeStar(), { key: 'me' }),
      cmp: Object.assign(makeStar(), { key: 'cmp' }),
      sun: Object.assign(makeStar(), { key: 'sun' }),
      earth: Object.assign(makeEarth(), { key: 'earth' })
    };
    Object.keys(bodies).forEach(function (k) {
      const b = bodies[k];
      scene.add(b.grp);
      b.ring = makeRing('#e2e8f0'); scene.add(b.ring);
      b.label = label(k, '#e2e8f0'); scene.add(b.label);
    });

    // ---------- 排版：真實比例，依序排在 x 軸上 ----------
    let layout = null, layoutKey = '';
    function computeLayout() {
      const cur = B.cur(), ps = B.pickStar();
      const list = [{ key: 'me', R: cur.R, T: cur.T }];
      if (ps && ps.id !== 'sun') list.push({ key: 'cmp', R: ps.R, T: ps.T, star: ps });
      list.push({ key: 'sun', R: 1, T: K.T_SUN });
      list.push({ key: 'earth', R: R_EARTH_SUN });
      let x = 0;
      list.forEach(function (b, i) {
        if (i === 0) { b.x = 0; x = b.R; return; }
        const gap = 0.6 * b.R + 0.12 * list[i - 1].R;
        b.x = x + gap + b.R; x = b.x + b.R;
      });
      const minX = -list[0].R, maxX = x;
      let maxR = 0; list.forEach(function (b) { maxR = Math.max(maxR, b.R); });
      return { list: list, minX: minX, maxX: maxX, maxR: maxR, cx: (minX + maxX) / 2, span: Math.max(maxX - minX, 2 * maxR) };
    }
    function applyLayout() {
      const lay = computeLayout();
      const ps = B.pickStar();
      const key = lay.list.map(function (b) { return b.key + ':' + b.R.toPrecision(5) + ':' + (b.T || 0).toFixed(0); }).join('|') + (ps ? ps.id : '');
      if (key === layoutKey) return;
      layoutKey = key;
      const prev = layout;
      layout = lay;
      Object.keys(bodies).forEach(function (k) { const b = bodies[k]; b.grp.visible = false; b.ring.visible = false; b.label.visible = false; b.info = null; });
      lay.list.forEach(function (b) {
        const o = bodies[b.key];
        o.grp.visible = true; o.label.visible = true; o.info = b;
        o.grp.position.set(b.x, 0, 0);
        o.grp.scale.setScalar(b.R);
        if (o.mat) {
          const lin = K.rgbLinear(b.T);
          o.mat.uniforms.uColor.value.setRGB(lin[0], lin[1], lin[2], THREE.LinearSRGBColorSpace);
          o.glow.material.color.setRGB(lin[0], lin[1], lin[2], THREE.LinearSRGBColorSpace);
        }
        const name = b.key === 'me' ? T('你的恆星', 'Your star') : b.key === 'cmp' ? B.starName(b.star) : b.key === 'sun' ? T('太陽', 'Sun') : T('地球', 'Earth');
        const col = b.key === 'me' ? (C['st-me'] || '#f472b6') : b.key === 'cmp' ? '#67e8f9' : b.key === 'sun' ? '#fde68a' : '#93c5fd';
        setLabel(o.label, name, col);
        o.ring.material.color.set(col);
      });
      // 尺度變了：相機和目標一起等比例縮放（保留使用者轉好的角度與相對遠近）
      if (prev) {
        const k = lay.span / prev.span;
        const off = camera.position.clone().sub(controls.target).multiplyScalar(k);
        const tgt = controls.target.clone().sub(new THREE.Vector3(prev.cx, 0, 0)).multiplyScalar(k).add(new THREE.Vector3(lay.cx, 0, 0));
        controls.target.copy(tgt);
        camera.position.copy(tgt).add(off);
        if (camAnim) { camAnim = null; }
      }
      setLimits();
    }
    function setLimits() {
      let minR = Infinity; layout.list.forEach(function (b) { minR = Math.min(minR, b.R); });
      controls.minDistance = minR * 1.6;
      controls.maxDistance = layout.span * 6;
    }

    // ---------- 相機 ----------
    function fitDist(size) { return size / 2 / Math.tan(camera.fov * Math.PI / 360) / Math.min(1, camera.aspect) * 1.15; }
    function presetFor(kind) {
      const dir = new THREE.Vector3(0.18, -1, 0.32).normalize();
      if (kind === 'mine') {
        const R = layout.list[0].R;
        const tgt = new THREE.Vector3(0, 0, 0);
        return { pos: tgt.clone().add(dir.multiplyScalar(fitDist(2.6 * R))), tgt: tgt };
      }
      const tgt = new THREE.Vector3(layout.cx, 0, 0);
      return { pos: tgt.clone().add(dir.multiplyScalar(fitDist(layout.span))), tgt: tgt };
    }
    let camAnim = null;
    function camTo(kind, animate) {
      const P = presetFor(kind);
      if (!animate || B.reducedMotion) {
        camAnim = null;
        camera.position.copy(P.pos); controls.target.copy(P.tgt); controls.update(); render();
        return;
      }
      // 尺度差很多時用對數插值距離，避免一下子衝太快
      camAnim = { t0: performance.now(), dur: 900, p0: camera.position.clone(), t0v: controls.target.clone(), p1: P.pos, t1: P.tgt };
      B.request();
    }
    function stepCam() {
      if (!camAnim) return;
      const A = camAnim;
      const u = Math.min(1, (performance.now() - A.t0) / A.dur), e = 1 - Math.pow(1 - u, 3);
      const tg = A.t0v.clone().lerp(A.t1, e);
      const d0 = A.p0.clone().sub(A.t0v), d1 = A.p1.clone().sub(A.t1);
      const l0 = d0.length(), l1 = d1.length();
      const dir = d0.normalize().lerp(d1.normalize(), e).normalize();
      const len = Math.exp(Math.log(l0) * (1 - e) + Math.log(l1) * e);
      controls.target.copy(tg);
      camera.position.copy(tg).add(dir.multiplyScalar(len));
      if (u >= 1) camAnim = null;
    }

    // ---------- 每幀：標籤位置、位置圈、HUD ----------
    const tmp = new THREE.Vector3();
    function placeLabels() {
      const tanH = Math.tan(camera.fov * Math.PI / 360);
      const items = [];
      Object.keys(bodies).forEach(function (k) {
        const o = bodies[k];
        if (!o.info) return;
        const p = o.grp.position, dist = Math.max(1e-9, camera.position.distanceTo(p));
        const rpx = o.info.R / (dist * tanH) * (ch / 2);
        tmp.copy(p).project(camera);
        const sx = (tmp.x + 1) / 2 * cw, sy = (1 - tmp.y) / 2 * ch;
        const small = rpx < 4;
        o.ring.visible = small && tmp.z < 1;
        if (o.ring.visible) {
          const k2 = 2 * tanH / Math.max(1, ch), s = 14;
          o.ring.scale.set(s * k2, s * k2, 1);
          o.ring.position.copy(p);
        }
        if (o.glow) o.glow.visible = rpx > 0.6;
        items.push({ o: o, sx: sx, sy: sy, off: Math.max(small ? 9 : rpx * 1.05, 7) + 6, w: o.label.userData.lw, h: o.label.userData.lh, z: tmp.z });
      });
      // 由大到小排，重疊的標籤往上疊
      items.sort(function (a, b) { return b.o.info.R - a.o.info.R; });
      const placed = [];
      items.forEach(function (it) {
        // 標籤不可超出畫面左右邊：調整水平錨點
        const cx = Math.max(1 - (cw - 4 - it.sx) / it.w, Math.min(0.5, (it.sx - 4) / it.w));
        it.cx = isFinite(cx) ? Math.max(0, Math.min(1, cx)) : 0.5;
        it.sx = it.sx + (0.5 - it.cx) * it.w;
        let off = it.off;
        for (let guard = 0; guard < 8; guard++) {
          const top = it.sy - off - it.h, bot = it.sy - off;
          const hit = placed.some(function (q) { return Math.abs(q.sx - it.sx) < (q.w + it.w) / 2 + 4 && !(bot < q.top - 3 || top > q.bot + 3); });
          if (!hit) break;
          off += it.h + 4;
        }
        placed.push({ sx: it.sx, w: it.w, top: it.sy - off - it.h, bot: it.sy - off });
        it.o.label.position.copy(it.o.grp.position);
        it.o.label.center.set(it.cx, -off / it.h);
        it.o.label.visible = it.z < 1;
      });
    }
    function update() {
      applyLayout();
      const cur = B.cur(), ps = B.pickStar();
      setHud('me', T('你的恆星：半徑 ', 'Your star: radius ') + B.sci(cur.R, 3) + T(' 倍太陽＝地球的 ', ' × Sun = ') + B.sci(cur.R / R_EARTH_SUN, 3) + T(' 倍', ' × Earth'));
      setHud('cmp', ps ? B.starName(ps) + T('：半徑 ', ': radius ') + B.sci(ps.R, 3) + T(' 倍太陽', ' × Sun') : '');
      setHud('note', narrow ? T('真實比例；太小的以圓圈標出', 'True scale; tiny ones are circled')
        : T('依真實比例（單位：太陽半徑）；在畫面上太小的星球以圓圈標出位置，可以拉近看', 'True to scale (unit: solar radius); bodies too small to see are circled — zoom in to see them'));
    }
    let moving = false, narrow = false;
    function render() {
      if (!api.active || document.hidden) return;
      const want = Math.min(window.devicePixelRatio || 1, 2);
      if (renderer.getPixelRatio() !== want) { renderer.setPixelRatio(want); renderer.setSize(cw, ch, false); }
      stepCam();
      moving = controls.update();
      const dist = camera.position.distanceTo(controls.target);
      camera.near = Math.max(1e-6, dist * 1e-3);
      camera.far = dist * 20 + layout.span * 10;
      camera.updateProjectionMatrix();
      placeLabels();
      renderer.render(scene, camera);
    }
    function sizeOf(w) { return w < 560 ? 420 : 500; }
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
    const ro = window.ResizeObserver ? new ResizeObserver(function () { resize3(); }) : null;
    if (ro) ro.observe(wrap); else window.addEventListener('resize', resize3);
    controls.addEventListener('change', function () { B.request(); });
    canvas.addEventListener('webglcontextlost', function (ev) {
      ev.preventDefault();
      if (api.active && B.onContextLost) B.onContextLost();
    });

    let t0 = performance.now();
    const api = {
      active: true,
      frame: function (tnow) {
        update();
        if (!B.reducedMotion) { const s = ((tnow || performance.now()) - t0) / 1000; ['me', 'cmp', 'sun'].forEach(function (k) { bodies[k].mat.uniforms.uTime.value = s; }); }
        render();
      },
      busy: function () { return !!camAnim || moving || !B.reducedMotion; },
      onShow: function () { resize3(); update(); camTo('fit', false); },
      onTheme: function () {
        C = B.colors();
        Object.keys(hudLast).forEach(function (k) { delete hudLast[k]; });
        layoutKey = '';
        update(); render();
      },
      resetCamera: function () { camTo('fit', true); },
      camTo: function (kind) { camTo(kind, true); },
      dispose: function () {
        api.active = false;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        controls.dispose();
        disposeObject(scene);
        if (scene.background && scene.background.dispose) scene.background.dispose();
        ringTex.dispose(); glowTex.dispose();
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
    camTo('fit', false);
    return api;
  }

  window.Stars3D = { create: create };
})();
