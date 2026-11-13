/*
 * hanoi-3d.js — 「河內塔」的 3D 立體檢視（three.js）
 *
 * 由 js/hanoi.js 在切到「3D 立體」時才載入（three.js 也是那時才以 import() 載入）；切回 2D 時整個釋放。
 * 用法：window.Hanoi3D.create({ THREE, OrbitControls }, 容器, bridge) → { active, frame, onTheme, resetCamera, dispose }
 *
 * 場景：木頭底座（上表面 y = 0），三根木柱在 x = −1、0、1（A、B、C）。盤子是有孔的漆面木盤（擠出的圓環＋圓角），
 * 每個盤的位置一律由 bridge.pose(盤, 抬高層數) 給（柱子編號可以是小數＝飛行中、第幾層），和 2D 用同一套動畫，所以兩邊永遠一致。
 * 點一根柱子（或柱子上的盤、底座靠近柱子的地方）＝ bridge.pegClick(柱)，和 2D 的點選完全相同；拖曳空白處轉動視角。
 */
(function () {
  'use strict';
  const FONT = 'system-ui, -apple-system, "Segoe UI", "Noto Sans TC", "PingFang TC", sans-serif';
  const PI = Math.PI, DEG = PI / 180;
  const SP = 1.0;                       // 柱距
  const RMAX = 0.46, RMIN = 0.15;        // 最大、最小盤的半徑
  const HOLE = 0.052, PEG_R = 0.034;     // 盤中間的孔、柱子的半徑
  const BASE_H = 0.13, BASE_D = 1.1, BASE_W = 2 * SP + 2 * RMAX + 0.3;

  function create(lib, host, B) {
    const THREE = lib.THREE;
    const T = B.T, D = B.D, PEG = B.HC.PEG;
    let C = B.colors();
    const col = function (c) { return new THREE.Color(c); };
    const isDark = function () { return !!D.dark; };

    // ---------- 畫布與資訊列 ----------
    const wrap = document.createElement('div');
    wrap.className = 'p3-wrap';
    const canvas = document.createElement('canvas');
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', T('河內塔的 3D 立體檢視：木頭底座上有 A、B、C 三根柱子。點一根柱子拿起最上面的盤，再點另一根柱子放下；拖曳空白處旋轉視角，滾輪或雙指縮放。鍵盤：1、2、3（或 A、B、C）選柱子，Backspace 是上一步，方向鍵轉動視角。',
      '3D view of the Tower of Hanoi: three pegs A, B and C on a wooden base. Tap a peg to pick up its top disc, then tap another peg to put it down; drag the background to rotate, scroll or pinch to zoom. Keyboard: 1, 2, 3 (or A, B, C) pick a peg, Backspace undoes, arrow keys turn the view.'));
    wrap.appendChild(canvas);
    const hud = document.createElement('div');
    hud.className = 'p3-hud';
    hud.setAttribute('aria-hidden', 'true');
    hud.innerHTML = '<div class="tl"><span data-k="mv"></span><span data-k="ds"></span><span class="m" data-k="tg"></span></div><div class="bl"><span data-k="nx"></span><span class="m" data-k="tip"></span></div>';
    wrap.appendChild(hud);
    host.appendChild(wrap);
    const hudEl = {}, hudLast = {};
    hud.querySelectorAll('[data-k]').forEach(function (e) { hudEl[e.getAttribute('data-k')] = e; });
    function setHud(k, h, cls) {
      const key = h + '|' + (cls || '');
      if (hudLast[k] === key) return;
      hudLast[k] = key;
      hudEl[k].innerHTML = h;
      hudEl[k].classList.toggle('ok', cls === 'ok');
    }

    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true }); }
    catch (e) { wrap.remove(); throw e; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 16 / 10, 0.05, 100);

    // ---------- 視角控制 ----------
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.rotateSpeed = 0.8;
    controls.enablePan = false;
    controls.minDistance = 2;
    controls.maxDistance = 14;
    controls.minPolarAngle = 0.12;
    controls.maxPolarAngle = 1.48;
    let startAng = null;
    controls.addEventListener('start', function () { startAng = [controls.getAzimuthalAngle(), controls.getPolarAngle()]; });
    controls.addEventListener('end', function () {
      if (!startAng) return;
      const turned = Math.abs(controls.getAzimuthalAngle() - startAng[0]) + Math.abs(controls.getPolarAngle() - startAng[1]);
      startAng = null;
      if (turned > 0.1) B.onRotate();
    });

    // ---------- 光線與環境反光（漆面要有東西可以反射） ----------
    const hemi = new THREE.HemisphereLight(0xffffff, 0x4a3a2a, 0.75);
    scene.add(hemi);
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.9);
    keyLight.position.set(1.8, 4.2, 2.8);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.left = -2.4; keyLight.shadow.camera.right = 2.4;
    keyLight.shadow.camera.top = 2.4; keyLight.shadow.camera.bottom = -2.4;
    keyLight.shadow.camera.near = 0.5; keyLight.shadow.camera.far = 12;
    keyLight.shadow.radius = 5;
    keyLight.shadow.bias = -0.0006;
    keyLight.shadow.normalBias = 0.01;
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
    fillLight.position.set(-3, 1.6, 1.2);
    scene.add(fillLight);
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.35);
    rimLight.position.set(0, 2, -3);
    scene.add(rimLight);
    const pmrem = new THREE.PMREMGenerator(renderer);
    let envRT = null;
    function buildEnv() {
      if (envRT) { envRT.dispose(); envRT = null; }
      const s = new THREE.Scene();
      const g = new THREE.SphereGeometry(10, 48, 24);
      const pos = g.attributes.position, cols = new Float32Array(pos.count * 3);
      const top = new THREE.Color(isDark() ? 0x5d6a80 : 0xffffff), bot = new THREE.Color(isDark() ? 0x0a0d12 : 0x6d6558);
      const c = new THREE.Color(), win = new THREE.Color(0xffffff);
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i) / 10, x = pos.getX(i) / 10, z = pos.getZ(i) / 10;
        const u = Math.max(0, Math.min(1, (y + 1) / 2));
        c.copy(bot).lerp(top, Math.pow(u, 0.75));
        // 一扇柔和的「窗」：讓漆面有一道亮的反光
        const w = Math.exp(-(Math.pow(x - 0.45, 2) + Math.pow(y - 0.55, 2) + Math.pow(z - 0.6, 2)) / 0.06);
        c.lerp(win, Math.min(1, w * (isDark() ? 0.7 : 0.9)));
        cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      s.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
      envRT = pmrem.fromScene(s, 0.03);
      s.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      scene.environment = envRT.texture;
    }

    // ---------- 貼圖：木紋 ----------
    function rng(seed) { let s = seed >>> 0; return function () { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
    /** 底座的木紋（實際顏色） */
    function woodTexture() {
      const c = document.createElement('canvas');
      c.width = 1024; c.height = 512;
      const g = c.getContext('2d'), r = rng(20231);
      const gr = g.createLinearGradient(0, 0, 0, 512);
      gr.addColorStop(0, D.shade(C.wood, 0.06)); gr.addColorStop(0.5, C.wood); gr.addColorStop(1, D.shade(C.wood, -0.06));
      g.fillStyle = gr; g.fillRect(0, 0, 1024, 512);
      for (let i = 0; i < 150; i++) {
        const y0 = r() * 512, amp = 2 + r() * 7, f = 0.003 + r() * 0.008, ph = r() * 7, lw = 0.6 + r() * 2.4;
        g.beginPath();
        for (let x = -10; x <= 1034; x += 8) {
          const y = y0 + amp * Math.sin(x * f + ph) + 1.5 * Math.sin(x * f * 3.7 + ph * 1.7);
          if (x === -10) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.strokeStyle = D.alpha(r() < 0.6 ? C.wood2 : D.shade(C.wood, 0.3), 0.12 + r() * 0.3);
        g.lineWidth = lw;
        g.stroke();
      }
      // 兩個木節
      [[300, 180], [760, 360]].forEach(function (k) {
        for (let j = 7; j >= 1; j--) {
          g.beginPath(); g.ellipse(k[0], k[1], 9 * j, 3.2 * j, 0, 0, 2 * PI);
          g.strokeStyle = D.alpha(C.wood2, 0.12 + 0.03 * (7 - j)); g.lineWidth = 1.6; g.stroke();
        }
      });
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.anisotropy = 8;
      return tex;
    }
    /** 盤子的木紋（接近白色，乘上盤子的漆色後只留下淡淡的紋路） */
    function grainTexture() {
      const c = document.createElement('canvas');
      c.width = c.height = 512;
      const g = c.getContext('2d'), r = rng(777);
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 120; i++) {
        const y0 = r() * 512, amp = 2 + r() * 6, f = 0.006 + r() * 0.014, ph = r() * 7;
        g.beginPath();
        for (let x = -8; x <= 520; x += 6) { const y = y0 + amp * Math.sin(x * f + ph); if (x === -8) g.moveTo(x, y); else g.lineTo(x, y); }
        g.strokeStyle = 'rgba(60,35,10,' + (0.05 + r() * 0.12).toFixed(3) + ')';
        g.lineWidth = 0.8 + r() * 2.2;
        g.stroke();
      }
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(1.3, 1.3);
      tex.anisotropy = 8;
      return tex;
    }
    function textSprite(text, color, h, bold) {
      const c = document.createElement('canvas');
      const W = 256, H = 96, px = 62;
      c.width = W; c.height = H;
      const g = c.getContext('2d');
      g.font = (bold ? '800 ' : '700 ') + px + 'px ' + FONT;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineJoin = 'round';
      g.lineWidth = 12; g.strokeStyle = isDark() ? 'rgba(10,14,20,0.85)' : 'rgba(255,255,255,0.92)';
      g.strokeText(text, W / 2, H / 2 + 2);
      g.fillStyle = color; g.fillText(text, W / 2, H / 2 + 2);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
      sp.scale.set(h * W / H, h, 1);
      sp.renderOrder = 10;
      return sp;
    }
    /** 盤上的編號（白字深邊，跟著盤子走，永遠朝向相機） */
    function numberSprite(d, color) {
      const c = document.createElement('canvas');
      c.width = c.height = 96;
      const g = c.getContext('2d');
      g.font = '800 62px ' + FONT;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineJoin = 'round';
      g.lineWidth = 11; g.strokeStyle = D.alpha(D.shade(color, -0.62), 0.92);
      g.strokeText(String(d), 48, 52);
      g.fillStyle = '#ffffff'; g.fillText(String(d), 48, 52);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      sp.renderOrder = 5;
      return sp;
    }

    // ---------- 物件 ----------
    const gStatic = new THREE.Group(), gDiscs = new THREE.Group(), gHint = new THREE.Group();
    scene.add(gStatic, gDiscs, gHint);
    let woodTex = null, grainTex = null;
    let base = null, pegs = [], caps = [], capMats = [], labels = [], goalRing = null, goalMat = null, table = null;
    let discs = [];                 // index = 盤號：{ mesh, mat, num, r, color }
    let n = 0, TH = 0.12, PH = 0.8, LIFT = 8;
    const X = function (p) { return (p - 1) * SP; };
    function dimsFor(k) {
      TH = Math.min(0.125, 0.92 / (k + 0.6));
      PH = Math.max(0.8, k * TH + 0.2);
      LIFT = (PH + 0.09) / TH;
    }
    function rOf(d) { return n === 1 ? 0.34 : RMIN + (RMAX - RMIN) * (d - 1) / (n - 1); }
    function disposeMesh(o) {
      o.traverse(function (m) {
        if (m.geometry) m.geometry.dispose();
        if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach(function (x) {
          if (x.map && x.map !== woodTex && x.map !== grainTex) x.map.dispose();
          x.dispose();
        });
      });
    }
    function clearGroup(g) { g.children.slice().forEach(function (o) { g.remove(o); disposeMesh(o); }); }

    function buildStatic() {
      clearGroup(gStatic);
      pegs = []; caps = []; capMats = []; labels = [];
      if (woodTex) woodTex.dispose();
      woodTex = woodTexture();
      // 桌面：只接影子
      table = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.ShadowMaterial({ opacity: isDark() ? 0.42 : 0.2 }));
      table.rotation.x = -PI / 2;
      table.position.y = -BASE_H - 0.001;
      table.receiveShadow = true;
      gStatic.add(table);
      // 底座：圓角的木塊
      const bev = 0.03;
      const sh = new THREE.Shape();
      const w2 = BASE_W / 2 - bev, d2 = BASE_D / 2 - bev, rr = 0.08;
      sh.moveTo(-w2 + rr, -d2); sh.lineTo(w2 - rr, -d2); sh.quadraticCurveTo(w2, -d2, w2, -d2 + rr);
      sh.lineTo(w2, d2 - rr); sh.quadraticCurveTo(w2, d2, w2 - rr, d2);
      sh.lineTo(-w2 + rr, d2); sh.quadraticCurveTo(-w2, d2, -w2, d2 - rr);
      sh.lineTo(-w2, -d2 + rr); sh.quadraticCurveTo(-w2, -d2, -w2 + rr, -d2);
      const bg = new THREE.ExtrudeGeometry(sh, { depth: BASE_H - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 4, curveSegments: 10 });
      bg.rotateX(-PI / 2);
      bg.translate(0, -(BASE_H - bev), 0);
      const tex = woodTex;
      tex.repeat.set(0.32, 0.9);
      tex.offset.set(0.5, 0.5);
      base = new THREE.Mesh(bg, new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.55, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.4 }));
      base.receiveShadow = true; base.castShadow = true;
      gStatic.add(base);
      // 柱子（木頭）、柱腳的小圓孔
      const pegMat = new THREE.MeshPhysicalMaterial({ color: col(C.peg), roughness: 0.42, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.3 });
      for (let p = 0; p < 3; p++) {
        const pg = new THREE.Mesh(new THREE.CylinderGeometry(PEG_R * 0.9, PEG_R, PH, 28), p ? pegMat.clone() : pegMat);
        pg.position.set(X(p), PH / 2, 0);
        pg.castShadow = true; pg.receiveShadow = true;
        pg.userData.peg = p;
        gStatic.add(pg); pegs.push(pg);
        const cm = new THREE.MeshPhysicalMaterial({ color: col(C.peg), roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.3, emissive: col(C.peg), emissiveIntensity: 0 });
        const cap = new THREE.Mesh(new THREE.SphereGeometry(PEG_R * 0.9, 24, 12, 0, 2 * PI, 0, PI / 2), cm);
        cap.position.set(X(p), PH, 0);
        cap.castShadow = true;
        cap.userData.peg = p;
        gStatic.add(cap); caps.push(cap); capMats.push(cm);
        const ring = new THREE.Mesh(new THREE.RingGeometry(PEG_R, PEG_R * 1.9, 32), new THREE.MeshBasicMaterial({ color: col(D.shade(C.wood, -0.6)), transparent: true, opacity: 0.55, depthWrite: false }));
        ring.rotation.x = -PI / 2;
        ring.position.set(X(p), 0.002, 0);
        gStatic.add(ring);
      }
      // 目標柱的光環
      goalMat = new THREE.MeshBasicMaterial({ color: col(C.goal), transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
      goalRing = new THREE.Mesh(new THREE.RingGeometry(RMAX + 0.015, RMAX + 0.05, 72), goalMat);
      goalRing.rotation.x = -PI / 2;
      goalRing.position.y = 0.003;
      goalRing.renderOrder = 2;
      gStatic.add(goalRing);
    }
    function buildLabels() {
      labels.forEach(function (l) { gStatic.remove(l); disposeMesh(l); });
      labels = [];
      const goal = B.goal();
      for (let p = 0; p < 3; p++) {
        const isG = p === goal;
        const l = textSprite(isG ? PEG[p] + T(' · 目標', ' · target') : PEG[p], isG ? C.goal : C.text, camera.aspect < 1.5 ? 0.2 : 0.14, isG);
        l.position.set(X(p), -BASE_H * 0.5, BASE_D / 2 + 0.08);
        gStatic.add(l); labels.push(l);
      }
    }
    function buildDiscs() {
      clearGroup(gDiscs);
      discs = [null];
      if (!grainTex) grainTex = grainTexture();
      for (let d = 1; d <= n; d++) {
        const r = rOf(d), bev = Math.min(0.018, TH * 0.2);
        const s = new THREE.Shape();
        s.absarc(0, 0, r - bev, 0, 2 * PI, false);
        const h = new THREE.Path();
        h.absarc(0, 0, HOLE + bev, 0, 2 * PI, true);
        s.holes.push(h);
        const geo = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.004, TH - 2 * bev - 0.006), bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 4, curveSegments: 72 });
        geo.rotateX(-PI / 2);
        geo.translate(0, bev + 0.003, 0);
        const color = C.d[d];
        const mat = new THREE.MeshPhysicalMaterial({
          color: col(color), map: grainTex, roughness: 0.4, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.07,
          emissive: col(color), emissiveIntensity: isDark() ? 0.1 : 0.02, envMapIntensity: 1.05
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true; mesh.receiveShadow = true;
        mesh.userData.disc = d;
        const num = numberSprite(d, color);
        const sz = Math.min(0.12, TH * 1.05);
        num.scale.set(sz, sz, 1);
        gDiscs.add(mesh, num);
        discs.push({ mesh: mesh, mat: mat, num: num, r: r, color: color, baseE: isDark() ? 0.1 : 0.02 });
      }
    }

    // ---------- 最短路的下一步（弧形箭頭） ----------
    let hintKey = '';
    function buildHint(hm) {
      const key = hm ? hm.from + '>' + hm.to + ':' + PH : '';
      if (key === hintKey) return;
      hintKey = key;
      clearGroup(gHint);
      if (!hm) return;
      const xa = X(hm.from), xb = X(hm.to), y0 = PH + 0.1, top = PH + 0.42 + 0.12 * Math.abs(hm.to - hm.from);
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(xa, y0, 0), new THREE.Vector3((xa + xb) / 2, top + 0.2, 0), new THREE.Vector3(xb, y0 + 0.06, 0));
      const mat = new THREE.MeshStandardMaterial({ color: col(C.hint), emissive: col(C.hint), emissiveIntensity: isDark() ? 0.55 : 0.3, roughness: 0.4, transparent: true, opacity: 0.92 });
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.016, 10, false), mat);
      gHint.add(tube);
      const end = curve.getPoint(1), tan = curve.getTangent(1);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.12, 18), mat.clone());
      cone.position.copy(end).addScaledVector(tan, 0.03);
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan.clone().normalize());
      gHint.add(cone);
    }

    // ---------- 每一格：盤子的位置與亮度 ----------
    const camDir = new THREE.Vector3();
    function place(t) {
      const sel = B.sel(), anim = B.animating(), fl = B.flash();
      camDir.copy(camera.position).sub(controls.target); camDir.y = 0;
      if (camDir.lengthSq() < 1e-6) camDir.set(0, 0, 1); else camDir.normalize();
      const flU = fl && t - fl.t0 < 700 ? (t - fl.t0) / 700 : -1;
      for (let d = 1; d <= n; d++) {
        const o = discs[d], q = B.pose(d, LIFT);
        let x = X(q.x);
        if (flU >= 0 && fl.disk === d) x += Math.sin((t - fl.t0) / 22) * 0.035 * (1 - flU);
        const y = q.y * TH;
        o.mesh.position.set(x, y, 0);
        o.num.position.set(x + camDir.x * (o.r + 0.03), y + TH * 0.5, camDir.z * (o.r + 0.03));
        let e = o.baseE, ec = o.color;
        if (q.sel) e = 0.3 + 0.12 * Math.sin(t / 180);
        if (flU >= 0 && fl.onto === d) { ec = C.bad; e = 0.75 * (1 - flU); }
        o.mat.emissive.set(ec);
        o.mat.emissiveIntensity = e;
      }
      // 拿起盤子時：可以放的柱頂變綠、不可以放的變紅
      for (let p = 0; p < 3; p++) {
        const m = capMats[p];
        let c = null;
        if (sel >= 0 && !anim && p !== sel) { const tp = B.top(p), d = B.top(sel); c = (!tp || tp > d) ? C.ok : C.bad; }
        m.color.set(c || C.peg);
        m.emissive.set(c || C.peg);
        m.emissiveIntensity = c ? 0.55 : 0;
        caps[p].scale.setScalar(c ? 1.5 : 1);
      }
      // 目標光環：完成時閃一下
      const goal = B.goal();
      goalRing.visible = goal >= 0;
      if (goal >= 0) {
        goalRing.position.x = X(goal);
        const sa = B.solvedAt(), u = sa ? (t - sa) / 1200 : 2;
        const s = u >= 0 && u < 1 ? 1 + 0.35 * Math.sin(PI * u) : 1;
        goalRing.scale.set(s, s, 1);
        goalMat.opacity = u >= 0 && u < 1 ? 1 : 0.8;
      }
      gHint.visible = !anim;
    }
    function updateHud() {
      const h = B.hud(), sel = B.sel();
      setHud('mv', T('步數 ', 'Moves ') + h.moves);
      if (h.done) setHud('ds', T('完成！', 'Done!') + (h.moves === h.fewest ? T('（最少步數）', ' (fewest)') : T('（最少 ' + h.fewest + ' 步）', ' (fewest ' + h.fewest + ')')), 'ok');
      else setHud('ds', T('離目標 ' + h.dist + ' 步', h.dist + ' to target'));
      const cu = B.custom();
      setHud('tg', cu ? T('目標：', 'Target: ') + cu : '');
      const hm = B.hint();
      setHud('nx', hm ? '<span style="color:var(--hn-hint)">' + T('下一步：盤 ' + hm.disk + '：' + PEG[hm.from] + ' → ' + PEG[hm.to], 'Next: disc ' + hm.disk + ': ' + PEG[hm.from] + ' → ' + PEG[hm.to]) + '</span>' : '');
      setHud('tip', sel >= 0 && B.top(sel)
        ? T('已拿起盤 ' + B.top(sel) + '：點另一根柱子放下（點同一根放回去）', 'Holding disc ' + B.top(sel) + ': tap another peg to put it down (the same peg puts it back)')
        : T('點柱子拿起、再點另一根放下；拖曳空白處轉動', 'Tap a peg to lift, another to drop; drag to turn'));
    }

    let lastRev = -1;
    function rebuild() {
      lastRev = B.rev;
      const k = B.n();
      if (k !== n) {
        n = k;
        dimsFor(n);
        buildStatic();
        buildDiscs();
        hintKey = '#';
        resetCamera(true);
      }
      buildLabels();
      buildHint(B.hint());
      updateHud();
    }

    // ---------- 點選柱子 ----------
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), zPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), hitPt = new THREE.Vector3();
    function nearestPeg(x) { let best = 0; for (let p = 1; p < 3; p++) if (Math.abs(x - X(p)) < Math.abs(x - X(best))) best = p; return best; }
    function pickPeg(ev) {
      const b = canvas.getBoundingClientRect();
      if (!b.width || !b.height) return -1;
      ndc.set(((ev.clientX - b.left) / b.width) * 2 - 1, -((ev.clientY - b.top) / b.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const objs = [base].concat(pegs, caps, discs.slice(1).map(function (o) { return o.mesh; }));
      const hits = ray.intersectObjects(objs, false);
      if (hits.length) {
        const h = hits[0], o = h.object;
        if (o.userData.peg != null) return o.userData.peg;
        if (o.userData.disc) return nearestPeg(o.position.x);
        return nearestPeg(h.point.x);
      }
      if (ray.ray.intersectPlane(zPlane, hitPt) && hitPt.y > -0.25 && hitPt.y < PH + 0.8 && Math.abs(hitPt.x) < SP + RMAX + 0.15) return nearestPeg(hitPt.x);
      return -1;
    }
    let down = null;
    canvas.addEventListener('pointerdown', function (ev) {
      if (ev.button != null && ev.button !== 0) return;
      down = { x: ev.clientX, y: ev.clientY, t: performance.now(), id: ev.pointerId };
    });
    canvas.addEventListener('pointerup', function (ev) {
      const dn = down;
      down = null;
      if (!dn || dn.id !== ev.pointerId) return;
      if (Math.hypot(ev.clientX - dn.x, ev.clientY - dn.y) > 7 || performance.now() - dn.t > 800) return;
      const p = pickPeg(ev);
      if (p >= 0) B.pegClick(p);
    });
    canvas.addEventListener('pointercancel', function () { down = null; });
    canvas.addEventListener('pointermove', function (ev) {
      if (down || ev.pointerType === 'touch') return;
      canvas.style.cursor = pickPeg(ev) >= 0 ? 'pointer' : '';
    });

    // ---------- 視角 ----------
    const target = new THREE.Vector3(0, 0.3, 0);
    let lastAspect = 0;
    function fitDistance() {
      const vf = camera.fov * DEG;
      const hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
      const hw = BASE_W / 2 + 0.12, hh = (PH + 0.75) / 2;
      return Math.max(hh / Math.tan(vf / 2), hw / Math.tan(hf / 2)) * (camera.aspect < 1.5 ? 0.92 : 1.1);
    }
    function resetCamera(quiet) {
      const d = fitDistance();
      target.set(0, PH * 0.5 - 0.06, 0);
      controls.target.copy(target);
      camera.position.copy(target).addScaledVector(new THREE.Vector3(0.24, 0.52, 1.0).normalize(), d);
      controls.maxDistance = d * 2.6;
      controls.minDistance = d * 0.45;
      camera.updateProjectionMatrix();
      controls.update();
      if (!quiet) requestRender();
    }

    // ---------- 繪製 ----------
    let raf = 0;
    function renderNow() {
      if (!api.active || document.hidden) return;
      const want = Math.min(window.devicePixelRatio || 1, 2);
      if (renderer.getPixelRatio() !== want) { renderer.setPixelRatio(want); resize3(); return; }
      if (B.rev !== lastRev) rebuild();
      const moved = controls.update();
      place(performance.now());
      renderer.render(scene, camera);
      if (moved) requestRender();
    }
    function requestRender() {
      if (raf || !api.active) return;
      raf = requestAnimationFrame(function () { raf = 0; renderNow(); });
    }
    function resize3() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (Math.abs(camera.aspect - lastAspect) > 1e-3) { lastAspect = camera.aspect; resetCamera(true); }
      renderNow();
    }
    const ro = window.ResizeObserver ? new ResizeObserver(function () { resize3(); }) : null;
    if (ro) ro.observe(canvas); else window.addEventListener('resize', resize3);
    controls.addEventListener('change', requestRender);
    const onVisible = function () { if (!document.hidden) requestRender(); };
    document.addEventListener('visibilitychange', onVisible);
    canvas.addEventListener('webglcontextlost', function (ev) {
      ev.preventDefault();
      if (!api.active) return;
      if (B.onContextLost) B.onContextLost();
    });
    // 鍵盤：1、2、3／A、B、C 選柱子，Backspace 上一步，方向鍵轉動視角
    canvas.addEventListener('keydown', function (ev) {
      const k = ev.key;
      const peg = { '1': 0, '2': 1, '3': 2, a: 0, b: 1, c: 2, A: 0, B: 1, C: 2 }[k];
      if (peg != null && !ev.ctrlKey && !ev.metaKey && !ev.altKey) { ev.preventDefault(); B.pegClick(peg); return; }
      if (k === 'Backspace') { ev.preventDefault(); B.undo(); return; }
      const step = (ev.shiftKey ? 15 : 5) * DEG;
      const off = camera.position.clone().sub(controls.target);
      const sph = new THREE.Spherical().setFromVector3(off);
      let used = true;
      if (k === 'ArrowLeft') sph.theta -= step;
      else if (k === 'ArrowRight') sph.theta += step;
      else if (k === 'ArrowUp') sph.phi = Math.max(controls.minPolarAngle, sph.phi - step);
      else if (k === 'ArrowDown') sph.phi = Math.min(controls.maxPolarAngle, sph.phi + step);
      else used = false;
      if (!used) return;
      ev.preventDefault();
      camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(sph));
      controls.update();
      requestRender();
      B.onRotate();
    });

    const api = {
      active: true,
      /** 主程式每次重畫時呼叫（動畫進行中每一格都會叫） */
      frame: function () {
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        renderNow();
      },
      onTheme: function () {
        C = B.colors();
        buildEnv();
        Object.keys(hudLast).forEach(function (k) { delete hudLast[k]; });
        if (grainTex) { grainTex.dispose(); grainTex = null; }
        n = 0; hintKey = '#';
        lastRev = -1;
        requestRender();
      },
      resetCamera: function () { resetCamera(); },
      dispose: function () {
        api.active = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        document.removeEventListener('visibilitychange', onVisible);
        controls.dispose();
        clearGroup(gDiscs); clearGroup(gHint); clearGroup(gStatic);
        if (woodTex) woodTex.dispose();
        if (grainTex) grainTex.dispose();
        if (envRT) envRT.dispose();
        pmrem.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        wrap.remove();
      }
    };

    buildEnv();
    const w0 = canvas.clientWidth, h0 = canvas.clientHeight;
    if (w0 && h0) {
      renderer.setSize(w0, h0, false);
      camera.aspect = w0 / h0;
      camera.updateProjectionMatrix();
      lastAspect = camera.aspect;
    }
    rebuild();
    resetCamera(true);
    renderNow();
    return api;
  }

  window.Hanoi3D = { create: create };
})();
