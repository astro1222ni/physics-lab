/* equipotential-rig3d.js — 可旋轉的實驗器材全景；物理位置直接取自 2D 狀態。
 * 儀器外殼為示意尺寸；盤內、電極與探針以 cm 為單位，與核心一致。
 * three.js 與 OrbitControls 由頁面延遲載入，不新增外部連線。
 */
(function () {
  'use strict';
  function create(lib, env) {
    const THREE = lib.THREE, LD = window.LabDraw, T = env.T;
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('3D 器材全景。拖探針移動；拖空白轉視角，切到「平移」可上下左右拖曳；雙指或滾輪朝該處放大。', '3D apparatus. Drag a probe to move it; drag empty space to orbit, or switch to Pan to drag the view; pinch or scroll to zoom there.'));
    env.host.appendChild(canvas);
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true }); }
    catch (e) { canvas.remove(); throw e; }
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0, 0);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400);
    camera.up.set(0, 0, 1);
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true; controls.dampingFactor = 0.12;
    controls.minDistance = 25; controls.maxDistance = 150;
    controls.maxPolarAngle = Math.PI * 0.48;
    // 站長 11/16：3D 也要能上下左右、斜向拖曳平移，朝游標放大（共用 js/view3d-nav.js）
    const nav = window.LabView3DNav ? LabView3DNav.attach({ THREE: THREE, controls: controls, canvas: canvas, host: env.host, radius: 18, T: T }) : null;
    const hemi = new THREE.HemisphereLight(0xffffff, 0x6c7179, 2.2);
    hemi.position.set(0, 0, 40); scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 3);
    sun.position.set(-18, -12, 40); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024); sun.shadow.radius = 4; sun.shadow.bias = -0.0005;
    Object.assign(sun.shadow.camera, { left: -28, right: 28, top: 28, bottom: -28, near: 1, far: 100 });
    scene.add(sun, sun.target);
    const fixed = new THREE.Group(), live = new THREE.Group(), tableGroup = new THREE.Group(), effects = new THREE.Group();
    fixed.userData.rigFit = true; live.userData.rigFit = true; scene.add(tableGroup, fixed, live, effects);
    const probes = {}, wireGroup = new THREE.Group(); live.add(wireGroup);
    const css = function (c) { return new THREE.Color().setStyle(c); };
    const aqua = function () { return LD.mix(LD.c.neg, LD.c.probe, 0.52); };
    const reduced = LD.reducedMotion();
    let active = true, raf = 0, buildKey = '', wireKey = '', textKey = '', meterFace = null, supplyFace = null;
    let frameTime = 0, lastFrame = 0, currentData = null;
    const bubbles = [];

    function disposeObject(obj) {
      const gs = new Set(), ms = new Set(), ts = new Set();
      obj.traverse(function (o) {
        if (o.geometry) gs.add(o.geometry);
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { ms.add(m); if (m.map) ts.add(m.map); });
      });
      gs.forEach(function (g) { g.dispose(); }); ts.forEach(function (t) { t.dispose(); }); ms.forEach(function (m) { m.dispose(); });
    }
    function clear(g) { disposeObject(g); g.clear(); }
    function mat(color, metal, rough) { return new THREE.MeshStandardMaterial({ color: css(color), metalness: metal || 0, roughness: rough == null ? 0.45 : rough }); }
    function mesh(geo, material, group, x, y, z) {
      const m = new THREE.Mesh(geo, material); m.position.set(x || 0, y || 0, z || 0);
      m.castShadow = true; m.receiveShadow = true; group.add(m); return m;
    }
    function roundedShape(w, h, r) {
      r = Math.min(r, w / 2, h / 2);
      const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
      s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
      s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
      s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
    }
    function box(w, h, depth, group, material, x, y, z, r) {
      const geo = new THREE.ExtrudeGeometry(roundedShape(w, h, r || 0.3), { depth: depth, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.06, bevelThickness: 0.06, curveSegments: 8 });
      geo.translate(0, 0, -depth / 2); return mesh(geo, material, group, x, y, z);
    }
    function cylinder(r, length, group, material, x, y, z) {
      const m = mesh(new THREE.CylinderGeometry(r, r, length, 28), material, group, x, y, z); m.rotation.x = Math.PI / 2; return m;
    }
    function cable(points, color, radius) {
      const curve = new THREE.CatmullRomCurve3(points.map(function (p) { return new THREE.Vector3(p[0], p[1], p[2]); }));
      return mesh(new THREE.TubeGeometry(curve, 40, radius || 0.10, 7, false), mat(color, 0.08, 0.38), wireGroup);
    }
    function screen(group, w, h, x, y, z, front) {
      const c = document.createElement('canvas'); c.width = 768; c.height = 256;
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      const m = mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }), group, x, y, z);
      if (front) m.rotation.x = Math.PI / 2;
      m.castShadow = false; return { cv: c, tex: tex };
    }
    function writeFace(face, title, number, foot) {
      if (!face) return;
      const g = face.cv.getContext('2d');
      g.fillStyle = LD.shade(LD.c['canvas-bg'], -0.7); g.fillRect(0, 0, 768, 256);
      g.textAlign = 'left'; g.fillStyle = LD.shade(LD.c.probe, 0.6);
      g.font = '600 37px ' + LD.FONT; g.fillText(title, 28, 50);
      g.font = '700 112px ui-monospace, monospace'; g.fillText(number, 25, 164);
      g.font = '500 33px ' + LD.FONT; g.fillText(foot, 28, 219); face.tex.needsUpdate = true;
    }
    function probeLabel(id, color) {
      const c = document.createElement('canvas'); c.width = 128; c.height = 112;
      const g = c.getContext('2d');
      LD.roundRect(g, 3, 7, 122, 98, 14); g.fillStyle = LD.c.surface; g.fill();
      g.strokeStyle = color; g.lineWidth = 4; g.stroke(); g.textBaseline = 'alphabetic';
      g.font = '700 65px ' + LD.FONT; g.lineWidth = 10; g.lineJoin = 'round'; g.strokeStyle = LD.c['canvas-bg']; g.fillStyle = color;
      g.strokeText('N', 15, 72); g.fillText('N', 15, 72);
      g.font = '700 43px ' + LD.FONT; g.strokeText(id === 'n1' ? '1' : '2', 67, 91); g.fillText(id === 'n1' ? '1' : '2', 67, 91);
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
      s.scale.set(2.25, 1.95, 1); s.position.set(0.65, 0, 5.1); s.renderOrder = 4; return s;
    }
    function gridTexture(records) {
      const c = document.createElement('canvas'); c.width = 1200; c.height = 800;
      const g = c.getContext('2d'); g.fillStyle = LD.mix(LD.c.surface, LD.c.text, LD.dark ? 0.76 : 0.01);
      g.fillRect(0, 0, c.width, c.height);
      for (let x = 0; x <= 30; x++) {
        g.strokeStyle = LD.alpha(LD.c.neg, x % 5 ? 0.25 : 0.52); g.lineWidth = x % 5 ? 3 : 5;
        g.beginPath(); g.moveTo(x * 40, 0); g.lineTo(x * 40, 800); g.stroke();
      }
      for (let y = 0; y <= 20; y++) {
        g.strokeStyle = LD.alpha(LD.c.neg, y % 5 ? 0.25 : 0.52); g.lineWidth = y % 5 ? 3 : 5;
        g.beginPath(); g.moveTo(0, y * 40); g.lineTo(1200, y * 40); g.stroke();
      }
      (records || []).forEach(function (r) { g.beginPath(); g.arc(r.x * 40, 800 - r.y * 40, 7, 0, Math.PI * 2); g.fillStyle = LD.c.pos; g.fill(); });
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; return tex;
    }
    /** 木紋與碳紙皆是固定種子的材質紋理，只在重建器材時產生。 */
    function grainTexture(carbon) {
      const c = document.createElement('canvas'); c.width = 1024; c.height = 768;
      const g = c.getContext('2d'), rnd = window.EquipotentialCore.rng(carbon ? 201 : 1639);
      const warm = LD.mix(LD.c.pos, LD.c.equi, 0.55);
      const base = carbon ? LD.mix(LD.shade(LD.c.text, -0.94), LD.c['canvas-bg'], 0.07) : LD.shade(warm, LD.dark ? -0.67 : -0.42);
      g.fillStyle = base; g.fillRect(0, 0, c.width, c.height);
      for (let n = 0; n < (carbon ? 5000 : 650); n++) {
        g.strokeStyle = LD.alpha(LD.shade(base, n % 3 ? 0.35 : -0.6), carbon ? 0.12 : 0.14 + rnd() * 0.13);
        g.fillStyle = g.strokeStyle;
        if (carbon) { g.fillRect(rnd() * 1024, rnd() * 768, 0.8 + rnd() * 1.8, 0.8 + rnd()); continue; }
        const y = rnd() * 768, bend = 3 + rnd() * 11;
        g.lineWidth = 0.5 + rnd() * 1.8; g.beginPath(); g.moveTo(0, y);
        g.bezierCurveTo(250, y - bend, 600, y + bend, 1024, y + (rnd() - 0.5) * 15); g.stroke();
      }
      if (!carbon) for (let n = 0; n < 3; n++) {
        const x = 160 + rnd() * 750, y = 100 + rnd() * 550;
        for (let k = 1; k < 13; k++) { g.beginPath(); g.ellipse(x, y, 8 + k * 7, 2 + k * 1.8, 0, 0, Math.PI * 2); g.stroke(); }
      }
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; return tex;
    }
    function frontDisc(r, depth, material, x, y, z) {
      const m = cylinder(r, depth, fixed, material, x, y, z); m.rotation.x = 0; return m;
    }
    function supply() {
      const x = -8, y = 15, dark = mat(LD.shade(LD.c.text, -0.75), 0, 0.7);
      box(11, 6.3, 4.8, fixed, mat(LD.mix(LD.c.surface, LD.c.muted, 0.22), 0.16, 0.4), x, y, 2.55, 0.45);
      box(10.5, 0.14, 4.25, fixed, mat(LD.mix(LD.c.surface, LD.c.text, 0.12), 0.12, 0.3), x, 11.77, 2.55, 0.18);
      [-4, 4].forEach(function (dx) { [-2, 2].forEach(function (dy) { cylinder(0.42, 0.3, fixed, dark, x + dx, y + dy, 0.12); }); });
      for (let i = 0; i < 7; i++) box(0.12, 2.5, 0.025, fixed, dark, x + 2.7 + i * 0.27, y + 0.5, 5.02, 0.04);
      supplyFace = screen(fixed, 6.4, 2.2, x - 1.25, 11.57, 3.35, true);
      [3.45, 1.8].forEach(function (z) {
        frontDisc(0.62, 0.45, mat(LD.c.muted, 0.2, 0.28), x + 3.7, 11.47, z);
        box(0.10, 0.06, 0.39, fixed, mat(LD.c.surface), x + 3.7, 11.21, z + 0.1, 0.02);
      });
      [-1, 1].forEach(function (sign) {
        const px = x + (sign > 0 ? 2.9 : 0.7), color = sign > 0 ? LD.c.pos : LD.c.field;
        frontDisc(0.34, 0.3, mat(color, 0.08, 0.35), px, 11.48, 1.0);
        frontDisc(0.13, 0.34, mat(LD.shade(LD.c.text, -0.8), 0.7, 0.22), px, 11.43, 1.0);
      });
    }
    function multimeter(d) {
      const x = 8, y = 15, rubber = mat(LD.mix(LD.c.equi, LD.c.surface, 0.22), 0, 0.65);
      box(6.8, 4.2, 9.4, fixed, rubber, x, y, 4.85, 0.7);
      box(5.95, 0.16, 8.45, fixed, mat(LD.mix(LD.c.surface, LD.c.text, 0.10), 0.04, 0.45), x, 12.81, 4.9, 0.35);
      meterFace = screen(fixed, 5.35, 2.1, x, 12.59, 7.55, true);
      frontDisc(1.32, 0.3, mat(LD.shade(LD.c.text, -0.68), 0.05, 0.7), x, 12.57, 3.9);
      const pointer = box(0.25, 0.09, 1.85, fixed, mat(LD.c.surface), x, 12.38, 3.9, 0.08);
      pointer.rotation.y = d.meter === 'galv' ? -0.65 : d.ac ? 0.55 : -0.3;
      for (let i = 0; i < 9; i++) {
        const a = Math.PI * (0.1 + i * 0.1);
        box(0.11, 0.04, 0.24, fixed, mat(LD.c.text), x + Math.cos(a) * 1.64, 12.67, 3.9 + Math.sin(a) * 1.64, 0.02);
      }
      [6.6, 9.4].forEach(function (px, i) { frontDisc(0.34, 0.33, mat(i ? LD.c.pos : LD.c.field), px, 12.54, 1.1); });
    }
    function headphones() {
      const shell = mat(LD.mix(LD.c.field, LD.c.text, 0.45), 0.15, 0.3), pad = mat(LD.shade(LD.c.text, -0.6), 0, 0.85);
      box(5.8, 4.5, 0.4, fixed, mat(LD.mix(LD.c.surface, LD.c.text, 0.3), 0.65, 0.3), 8, 15.4, 0.2, 0.65);
      cylinder(0.2, 8.4, fixed, mat(LD.c.muted, 0.85, 0.22), 8, 16.1, 4.6);
      const hook = cylinder(0.22, 1.7, fixed, mat(LD.c.muted, 0.85, 0.22), 8, 15.5, 8.85); hook.rotation.x = 0;
      const p = [];
      for (let i = 0; i <= 48; i++) { const a = Math.PI * i / 48; p.push(new THREE.Vector3(8 + Math.cos(a) * 2.8, 15, 6 + Math.sin(a) * 2.9)); }
      mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(p), 48, 0.25, 9, false), shell, fixed);
      [5.2, 10.8].forEach(function (x) {
        box(1.35, 2.0, 2.65, fixed, shell, x, 15, 5.5, 0.6);
        box(0.42, 1.72, 2.2, fixed, pad, x + (x < 8 ? 0.7 : -0.7), 15, 5.5, 0.2);
      });
      meterFace = screen(fixed, 5.4, 1.0, 8, 13.01, 0.85, true);
    }
    function waterEdge(z, material) {
      const points = roundedShape(30, 20, 0.22).getPoints(28).map(function (p) { return new THREE.Vector3(p.x, p.y - 3, z); });
      mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, true), 120, 0.045, 5, true), material, fixed);
    }
    function makeBubbles(e) {
      const count = e.sign < 0 ? 24 : 8;
      const material = new THREE.MeshPhysicalMaterial({ color: css(LD.shade(aqua(), 0.85)), transparent: true, opacity: 0.7, roughness: 0.08, metalness: 0.1, clearcoat: 1, depthWrite: false });
      const m = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), material, count);
      const rim = new THREE.InstancedMesh(new THREE.TorusGeometry(0.9, 0.10, 5, 12), new THREE.MeshBasicMaterial({ color: css(LD.dark ? LD.shade(aqua(), 0.96) : LD.shade(aqua(), -0.5)), transparent: true, opacity: 0.82, depthWrite: false }), count);
      m.userData.electrolysis = true; effects.add(m, rim); bubbles.push({ mesh: m, rim: rim, e: e, count: count });
    }
    function animateEffects(d) {
      const emitting = d.medium === 'water' && d.power && !d.ac && d.V0eff > 0;
      const transform = new THREE.Object3D();
      bubbles.forEach(function (b) {
        b.mesh.visible = b.rim.visible = emitting; if (!emitting) return;
        for (let i = 0; i < b.count; i++) {
          const age = (frameTime * 0.42 + i * 0.618034) % 1, e = b.e;
          const a = i * 2.39996, r = (e.r || 0.32) + 0.12;
          const x = e.kind === 'circle' ? e.x + Math.cos(a) * r : (i % 2 ? e.x1 + 0.13 : e.x0 - 0.13);
          const y = e.kind === 'circle' ? e.y + Math.sin(a) * r : e.y0 + (e.y1 - e.y0) * ((i * 0.37) % 1);
          transform.position.set(x - 15 + Math.sin(a + age * 9) * 0.08, y - 13 + Math.cos(a + age * 6) * 0.06, 0.17 + age * 0.94);
          const size = (0.10 + i % 4 * 0.035) * (age > 0.94 ? (1 - age) / 0.06 : 1);
          transform.scale.setScalar(size); transform.quaternion.copy(camera.quaternion); transform.updateMatrix();
          b.mesh.setMatrixAt(i, transform.matrix); b.rim.setMatrixAt(i, transform.matrix);
        }
        b.mesh.instanceMatrix.needsUpdate = b.rim.instanceMatrix.needsUpdate = true;
      });
      return emitting;
    }
    function build(d) {
      clear(fixed); clear(live); clear(tableGroup); clear(effects); bubbles.length = 0;
      live.add(wireGroup); wireKey = ''; textKey = ''; meterFace = null; supplyFace = null;
      const water = d.medium === 'water', silver = mat(LD.mix(LD.c.surface, LD.c.text, 0.35), 0.8, 0.23);
      // 桌面有厚度與木紋方向；紋理以同一組主題色衍生。
      const table = box(52, 39, 0.8, tableGroup, mat(LD.shade(LD.mix(LD.c.pos, LD.c.equi, 0.55), LD.dark ? -0.7 : -0.5), 0, 0.9), 4, 2.5, -0.8, 1);
      table.receiveShadow = true;
      mesh(new THREE.PlaneGeometry(50.5, 37.5), new THREE.MeshStandardMaterial({ map: grainTexture(false), roughness: 0.83 }), tableGroup, 4, 2.5, -0.33).castShadow = false;
      box(31, 21, 0.28, fixed, mat(LD.mix(LD.c.surface, LD.c.text, 0.16), 0.06, 0.75), 0, -3, -0.1, 0.5);
      const paper = mesh(new THREE.PlaneGeometry(30, 20), new THREE.MeshStandardMaterial({ map: water ? gridTexture(d.recs) : grainTexture(true), roughness: 0.85 }), fixed, 0, -3, 0.13); paper.castShadow = false;
      if (!water) {
        box(8.7, 5.9, 0.06, fixed, mat(LD.c.surface), 20.7, -3, 0.08, 0.1);
        // 印刷格線保留原色；紙板本身仍承接光影，避免淺色強光把細格洗成全白。
        mesh(new THREE.PlaneGeometry(8.4, 5.6), new THREE.MeshBasicMaterial({ map: gridTexture(d.recs) }), fixed, 20.7, -3, 0.20).castShadow = false;
      }
      if (water) {
        const shape = roundedShape(31.2, 21.2, 0.7), hole = new THREE.Path(roundedShape(30, 20, 0.16).getPoints());
        shape.holes.push(hole);
        const acrylic = new THREE.MeshPhysicalMaterial({ color: css(aqua()), transparent: true, opacity: 0.28, transmission: 0.35, roughness: 0.08, metalness: 0, thickness: 0.6, ior: 1.49, depthWrite: false });
        mesh(new THREE.ExtrudeGeometry(shape, { depth: 1.8, bevelEnabled: true, bevelSegments: 2, bevelSize: 0.07, bevelThickness: 0.06, curveSegments: 16 }), acrylic, fixed, 0, -3, 0.1);
        const volume = new THREE.MeshPhysicalMaterial({ color: css(aqua()), transparent: true, opacity: 0.22, roughness: 0.12, clearcoat: 1, depthWrite: false });
        mesh(new THREE.BoxGeometry(30, 20, 0.96), volume, fixed, 0, -3, 0.62).castShadow = false;
        const waterMat = new THREE.MeshPhysicalMaterial({ color: css(aqua()), transparent: true, opacity: LD.dark ? 0.25 : 0.20, roughness: 0.08, metalness: 0.04, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide });
        const surface = mesh(new THREE.PlaneGeometry(30, 20), waterMat, fixed, 0, -3, 1.1); surface.castShadow = false;
        waterEdge(1.11, mat(LD.shade(aqua(), 0.58), 0.25, 0.17));
        waterEdge(1.88, new THREE.MeshPhysicalMaterial({ color: css(LD.shade(aqua(), 0.8)), transparent: true, opacity: 0.58, roughness: 0.1, depthWrite: false }));
        // 水面反光只作裝飾，不更改電位與水深。
        for (let i = 0; i < 5; i++) {
          const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-13 + i, -10 + i * 2.7, 1.12), new THREE.Vector3(-4 + i, -9.4 + i * 2.7, 1.12)]);
          fixed.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: css(LD.shade(aqua(), 0.8)), transparent: true, opacity: 0.27 })));
        }
      }
      d.sol.els.forEach(function (e) {
        const material = water ? mat(LD.mix(LD.c.pos, LD.c.equi, 0.55), 0.76, 0.25) : silver;
        const h = water ? 2.3 : 0.16;
        let x, y;
        if (e.kind === 'circle') {
          x = e.x - 15; y = e.y - 13; cylinder(e.r, h, fixed, material, x, y, h / 2 + 0.1);
          if (water) {
            mesh(new THREE.TorusGeometry(e.r + 0.045, 0.055, 8, 36), mat(LD.shade(aqua(), 0.85), 0.18, 0.12), fixed, x, y, 1.12);
            mesh(new THREE.TorusGeometry(e.r * 0.88, 0.035, 8, 36), mat(LD.shade(LD.mix(LD.c.pos, LD.c.equi, 0.55), 0.5), 0.75, 0.17), fixed, x, y, h + 0.11);
          }
        }
        else { x = (e.x0 + e.x1) / 2 - 15; y = (e.y0 + e.y1) / 2 - 13; box(e.x1 - e.x0, e.y1 - e.y0, h, fixed, material, x, y, h / 2 + 0.1, 0.12); }
        cylinder(0.24, 0.3, fixed, mat(e.sign > 0 ? LD.c.pos : LD.c.field), x, y, h + 0.28);
        if (water) makeBubbles(e);
      });
      supply();
      if (d.meter === 'phone') headphones(); else multimeter(d);
      ['n1', 'n2'].forEach(function (id) {
        const g = new THREE.Group(), color = id === 'n2' ? LD.c.pos : LD.c.field;
        cylinder(0.055, 1.5, g, silver, 0, 0, 0.75);
        cylinder(0.22, 2.7, g, mat(color, 0.05, 0.32), 0, 0, 2.85);
        cylinder(0.29, 0.16, g, mat(color, 0.1, 0.3), 0, 0, 1.48);
        cylinder(0.15, 0.5, g, mat(color), 0, 0, 4.4);
        g.add(probeLabel(id, color)); g.userData.probe = id; probes[id] = g; live.add(g);
      });
    }
    function updateWires(d) {
      const key = [d.n1.x, d.n1.y, d.n2.x, d.n2.y, d.sol.key, d.medium, d.meter, d.clip].join('|');
      if (key === wireKey) return; wireKey = key; clear(wireGroup);
      const z = d.medium === 'water' ? 0.4 : 0.12;
      d.sol.els.forEach(function (e) {
        const x = (e.kind === 'circle' ? e.x : (e.x0 + e.x1) / 2) - 15;
        const y = (e.kind === 'circle' ? e.y : e.y1) - 13;
        const color = e.sign > 0 ? LD.c.pos : LD.c.field;
        cable([[-8 + (e.sign > 0 ? 2.9 : 0.7), 11.35, 1], [-8 + (e.sign > 0 ? 2.9 : 0.7), 9, 1.0], [x, 8, 1.5], [x, y, d.medium === 'water' ? 2.65 : 0.5]], color, 0.12);
      });
      [['n1', d.n1], ['n2', d.n2]].forEach(function (a) {
        const x = a[1].x - 15, y = a[1].y - 13;
        const pz = a[0] === 'n1' && d.clip ? (d.medium === 'water' ? 2.4 : 0.26) : z;
        probes[a[0]].position.set(x, y, pz);
        const tx = d.meter === 'phone' ? (a[0] === 'n1' ? 5.2 : 10.8) : (a[0] === 'n1' ? 6.6 : 9.4);
        cable([[x, y, pz + 4.65], [x + (a[0] === 'n1' ? -2.5 : 2.5), y + 2, pz + 5], [tx, 10, 1.7], [tx, d.meter === 'phone' ? 15 : 12.35, d.meter === 'phone' ? 4.2 : 1.1]], a[0] === 'n1' ? LD.c.field : LD.c.pos, 0.085);
      });
    }
    function update() {
      if (!active) return;
      const d = env.data(), key = [LD.ver, d.sol.key, d.medium, d.meter, d.ac, d.recs.length].join('|');
      const rebuilt = key !== buildKey; currentData = d;
      if (rebuilt) { buildKey = key; build(d); }
      updateWires(d);
      const tk = [d.reading, d.V0, d.power, d.ac, d.current, LD.ver].join('|');
      if (tk !== textKey) {
        textKey = tk;
        writeFace(supplyFace, d.ac ? T('交流 · 1 kHz · RMS', 'AC · 1 kHz · RMS') : T('直流 · DC', 'DC'), d.V0.toFixed(1) + ' V', d.power ? (d.current * 1000).toFixed(2) + ' mA' : T('輸出關閉 · 0.00 mA', 'Output off · 0.00 mA'));
        writeFace(meterFace, d.meter === 'phone' ? T('耳機 · 零點偵測', 'Headphone null detector') : d.meter === 'galv' ? T('檢流計', 'Galvanometer') : d.ac ? 'ACV · RMS' : 'DCV', d.reading, d.meter === 'phone' ? T('聲音最小＝等電位', 'Quietest = equal potential') : 'COM                  V');
      }
      if (rebuilt) fit();
      requestRender();
    }
    function fit() {
      const center = new THREE.Vector3(currentData && currentData.medium === 'paper' ? 4.5 : 0, 2, 1.8), dir = new THREE.Vector3(0, -1, 1.6).normalize();
      const right = new THREE.Vector3().crossVectors(dir.clone().negate(), camera.up).normalize();
      const up = new THREE.Vector3().crossVectors(right, dir.clone().negate()).normalize();
      const tv = Math.tan(camera.fov * Math.PI / 360), th = tv * camera.aspect;
      let distance = 1;
      scene.updateMatrixWorld(true);
      [fixed, live].forEach(function (group) { group.traverse(function (o) {
        if (!o.geometry) return;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        const b = o.geometry.boundingBox;
        if (!b || b.isEmpty()) return;
        [b.min.x, b.max.x].forEach(function (x) { [b.min.y, b.max.y].forEach(function (y) { [b.min.z, b.max.z].forEach(function (z) {
          const p = new THREE.Vector3(x, y, z).applyMatrix4(o.matrixWorld).sub(center), depth = p.dot(dir);
          distance = Math.max(distance, depth + Math.abs(p.dot(right)) / th, depth + Math.abs(p.dot(up)) / tv);
        }); }); });
      }); });
      distance *= 1.02;
      controls.target.copy(center); camera.position.copy(center).addScaledVector(dir, distance);
      controls.update(); camera.updateProjectionMatrix();
      if (nav) nav.home();
    }
    function requestRender() {
      if (raf || !active || document.hidden || (env.isVisible && !env.isVisible())) return;
      raf = requestAnimationFrame(function (t) {
        raf = 0; if (!active || document.hidden || (env.isVisible && !env.isVisible())) { lastFrame = 0; return; }
        if (!reduced) frameTime += lastFrame ? Math.min((t - lastFrame) / 1000, 1 / 30) : 0;
        lastFrame = t;
        const movingBubbles = currentData && animateEffects(currentData);
        const moved = controls.update(); renderer.render(scene, camera); if (moved || (movingBubbles && !reduced)) requestRender();
      });
    }
    function resize() {
      const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
      renderer.setSize(w, h, false); camera.aspect = w / h; fit(); requestRender();
    }
    // 射線只選探針；拖空白仍由 OrbitControls 旋轉，不新增另一套物理狀態。
    const ray = new THREE.Raycaster(), pointer = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -1.1);
    let dragging = null;
    function point(ev) { const r = canvas.getBoundingClientRect(); pointer.set((ev.clientX - r.left) / r.width * 2 - 1, -(ev.clientY - r.top) / r.height * 2 + 1); ray.setFromCamera(pointer, camera); }
    function down(ev) {
      point(ev); const hits = ray.intersectObjects(Object.values(probes), true);
      let o = hits.length ? hits[0].object : null; while (o && !o.userData.probe) o = o.parent;
      // 以 CSS 像素補足至少 44 px 的探針觸控區，不放大實際探針。
      if (!o) {
        const rect = canvas.getBoundingClientRect(); let best = 22;
        Object.values(probes).forEach(function (probe) {
          const p = probe.position.clone().add(new THREE.Vector3(0, 0, 2.8)).project(camera);
          const dist = Math.hypot(ev.clientX - rect.left - (p.x + 1) * rect.width / 2, ev.clientY - rect.top - (1 - p.y) * rect.height / 2);
          if (dist < best) { best = dist; o = probe; }
        });
      }
      if (!o) return;
      plane.constant = env.data().medium === 'water' ? -1.1 : -0.12;
      const p = ray.ray.intersectPlane(plane, new THREE.Vector3());
      if (!p) return;
      dragging = { id: o.userData.probe, pointer: ev.pointerId, dx: p.x - o.position.x, dy: p.y - o.position.y };
      controls.enabled = false; canvas.setPointerCapture(ev.pointerId); ev.stopImmediatePropagation();
    }
    function move(ev) {
      if (!dragging || dragging.pointer !== ev.pointerId) return;
      point(ev); const p = ray.ray.intersectPlane(plane, new THREE.Vector3());
      if (p) env.moveProbe(dragging.id, p.x - dragging.dx + 15, p.y - dragging.dy + 13);
      ev.preventDefault(); ev.stopImmediatePropagation();
    }
    function up(ev) { if (!dragging || dragging.pointer !== ev.pointerId) return; dragging = null; controls.enabled = true; if (env.endProbe) env.endProbe(); }
    canvas.addEventListener('pointerdown', down, true); canvas.addEventListener('pointermove', move, true);
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    controls.addEventListener('change', requestRender);
    const ro = new ResizeObserver(resize); ro.observe(canvas);
    function visible() { if (!document.hidden) { update(); requestRender(); } }
    document.addEventListener('visibilitychange', visible);
    canvas.addEventListener('webglcontextlost', function (ev) { ev.preventDefault(); if (active && env.onLost) env.onLost(); });
    const api = {
      update: update, onTheme: update, resetCamera: function () { fit(); requestRender(); },
      dispose: function () {
        active = false; if (raf) cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); if (nav) nav.dispose();
        document.removeEventListener('visibilitychange', visible); disposeObject(scene);
        renderer.dispose(); renderer.forceContextLoss(); canvas.remove();
      }
    };
    update(); resize(); return api;
  }
  window.EquipotentialRig3D = { create: create };
})();
