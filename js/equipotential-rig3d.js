/* equipotential-rig3d.js — 可旋轉的實驗器材全景；物理位置直接取自 2D 狀態。
 * 儀器外殼為示意尺寸；盤內、電極與探針以 cm 為單位，與核心一致。
 * three.js 與 OrbitControls 由頁面延遲載入，不新增外部連線。
 */
(function () {
  'use strict';
  function create(lib, env) {
    const THREE = lib.THREE, LD = window.LabDraw, T = env.T;
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('3D 器材全景。拖探針移動，拖空白轉視角，雙指縮放。', '3D apparatus. Drag a probe to move it, drag empty space to orbit, pinch to zoom.'));
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
    const hemi = new THREE.HemisphereLight(0xffffff, 0x6c7179, 2.2);
    hemi.position.set(0, 0, 40); scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 3);
    sun.position.set(-18, -12, 40); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024); sun.shadow.radius = 4; sun.shadow.bias = -0.0005;
    Object.assign(sun.shadow.camera, { left: -28, right: 28, top: 28, bottom: -28, near: 1, far: 100 });
    scene.add(sun, sun.target);
    const fixed = new THREE.Group(), live = new THREE.Group(); scene.add(fixed, live);
    const probes = {}, wireGroup = new THREE.Group(); live.add(wireGroup);
    const css = function (c) { return new THREE.Color().setStyle(c); };
    const aqua = function () { return LD.mix(LD.c.neg, LD.c.probe, 0.52); };
    let active = true, raf = 0, buildKey = '', wireKey = '', textKey = '', meterFace = null, supplyFace = null;

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
    function screen(group, w, h, x, y, z) {
      const c = document.createElement('canvas'); c.width = 768; c.height = 256;
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      const m = mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }), group, x, y, z);
      m.castShadow = false; return { cv: c, tex: tex };
    }
    function writeFace(face, title, number, foot) {
      if (!face) return;
      const g = face.cv.getContext('2d');
      g.fillStyle = LD.shade(LD.c['canvas-bg'], -0.7); g.fillRect(0, 0, 768, 256);
      g.textAlign = 'left'; g.fillStyle = LD.shade(LD.c.probe, 0.6);
      g.font = '600 37px ' + LD.FONT; g.fillText(title, 28, 50);
      g.font = '700 89px ui-monospace, monospace'; g.fillText(number, 25, 151);
      g.font = '500 33px ' + LD.FONT; g.fillText(foot, 28, 219); face.tex.needsUpdate = true;
    }
    function probeLabel(id, color) {
      const c = document.createElement('canvas'); c.width = 128; c.height = 112;
      const g = c.getContext('2d'); g.textBaseline = 'alphabetic';
      g.font = '700 65px ' + LD.FONT; g.lineWidth = 10; g.lineJoin = 'round'; g.strokeStyle = LD.c['canvas-bg']; g.fillStyle = color;
      g.strokeText('N', 15, 72); g.fillText('N', 15, 72);
      g.font = '700 43px ' + LD.FONT; g.strokeText(id === 'n1' ? '1' : '2', 67, 91); g.fillText(id === 'n1' ? '1' : '2', 67, 91);
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
      s.scale.set(1.8, 1.6, 1); s.position.z = 5.6; s.renderOrder = 4; return s;
    }
    function gridTexture(water) {
      const c = document.createElement('canvas'); c.width = 1200; c.height = 800;
      const g = c.getContext('2d'); g.fillStyle = water ? LD.shade(LD.c.surface, LD.dark ? -0.08 : -0.02) : LD.mix(LD.c.text, LD.c['canvas-bg'], LD.dark ? 0.8 : 0.15);
      g.fillRect(0, 0, c.width, c.height);
      for (let x = 0; x <= 30; x++) {
        g.strokeStyle = LD.alpha(water ? LD.c.text : LD.shade(LD.c.surface, 0.5), x % 5 ? 0.32 : 0.58); g.lineWidth = x % 5 ? 3 : 5;
        g.beginPath(); g.moveTo(x * 40, 0); g.lineTo(x * 40, 800); g.stroke();
      }
      for (let y = 0; y <= 20; y++) {
        g.strokeStyle = LD.alpha(water ? LD.c.text : LD.shade(LD.c.surface, 0.5), y % 5 ? 0.32 : 0.58); g.lineWidth = y % 5 ? 3 : 5;
        g.beginPath(); g.moveTo(0, y * 40); g.lineTo(1200, y * 40); g.stroke();
      }
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; return tex;
    }
    function instrument(x, y, isSupply, d) {
      const body = mat(isSupply ? LD.mix(LD.c.surface, LD.c.muted, 0.22) : LD.mix(LD.c.equi, LD.c.surface, 0.6), 0.1, 0.42);
      box(11, 6.6, 2.8, fixed, body, x, y, 1.5, 0.45);
      const rubber = mat(LD.shade(LD.c.text, -0.6), 0, 0.8);
      [-4, 4].forEach(function (dx) { [-2, 2].forEach(function (dy) { cylinder(0.5, 0.35, fixed, rubber, x + dx, y + dy, 0.1); }); });
      for (let i = 0; i < 5; i++) box(0.13, 1.4, 0.025, fixed, rubber, x + 3.8 + i * 0.25, y + 1.25, 2.94, 0.06);
      const face = screen(fixed, 7.7, 2.65, x - 0.6, y + 0.7, 2.97);
      const knob = cylinder(0.68, 0.38, fixed, mat(LD.c.muted, 0.15), x - 3.7, y - 1.9, 3.05);
      box(0.10, 0.5, 0.04, fixed, mat(LD.c.surface), knob.position.x, knob.position.y, 3.28, 0.03);
      [-1, 1].forEach(function (sign) { cylinder(0.28, 0.25, fixed, mat(sign > 0 ? LD.c.pos : LD.c.field), x + (sign > 0 ? 2.5 : 0.5), y - 2.1, 3); });
      if (isSupply) supplyFace = face; else meterFace = face;
    }
    function headphones() {
      const shell = mat(LD.mix(LD.c.field, LD.c.text, 0.45), 0.15, 0.3), pad = mat(LD.shade(LD.c.text, -0.6), 0, 0.85);
      const p = [];
      for (let i = 0; i <= 48; i++) { const a = Math.PI * i / 48; p.push(new THREE.Vector3(8 + Math.cos(a) * 3.4, 14 + Math.sin(a) * 2.3, 1.9 + Math.sin(a) * 0.8)); }
      mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(p), 48, 0.25, 9, false), shell, fixed);
      [4.6, 11.4].forEach(function (x) { box(1.6, 3, 1.4, fixed, shell, x, 13.6, 1.5, 0.7); box(1.25, 2.6, 0.4, fixed, pad, x, 13.6, 0.7, 0.5); });
      meterFace = screen(fixed, 7.3, 1.85, 8, 17.7, 0.3);
    }
    function build(d) {
      clear(fixed); clear(live); live.add(wireGroup); wireKey = ''; textKey = '';
      const water = d.medium === 'water', silver = mat(LD.mix(LD.c.surface, LD.c.text, 0.35), 0.8, 0.23);
      // 桌面有厚度與木紋方向；紋理以同一組主題色衍生。
      const table = box(41, 40, 0.8, fixed, mat(LD.mix(LD.c.surface, LD.c.probe, LD.dark ? 0.06 : 0.10), 0, 0.9), 0, 3, -0.8, 1);
      table.receiveShadow = true;
      const wood = mat(LD.mix(LD.c.surface, LD.c.muted, 0.22), 0, 1);
      for (let i = 0; i < 17; i++) box(38, 0.025, 0.005, fixed, wood, 0, -15 + i * 2.15, -0.33, 0.01);
      box(31, 21, 0.28, fixed, mat(LD.mix(LD.c.surface, LD.c.text, 0.16), 0.06, 0.75), 0, -3, -0.1, 0.5);
      const paper = mesh(new THREE.PlaneGeometry(30, 20), new THREE.MeshStandardMaterial({ map: gridTexture(water), roughness: 0.85 }), fixed, 0, -3, 0.13); paper.castShadow = false;
      if (water) {
        const shape = roundedShape(31.2, 21.2, 0.7), hole = new THREE.Path(roundedShape(30, 20, 0.16).getPoints());
        shape.holes.push(hole);
        const acrylic = new THREE.MeshPhysicalMaterial({ color: css(aqua()), transparent: true, opacity: 0.28, transmission: 0.35, roughness: 0.08, metalness: 0, thickness: 0.6, ior: 1.49, depthWrite: false });
        mesh(new THREE.ExtrudeGeometry(shape, { depth: 1.8, bevelEnabled: true, bevelSegments: 2, bevelSize: 0.07, bevelThickness: 0.06, curveSegments: 16 }), acrylic, fixed, 0, -3, 0.1);
        const waterMat = new THREE.MeshPhysicalMaterial({ color: css(aqua()), transparent: true, opacity: LD.dark ? 0.23 : 0.18, roughness: 0.13, metalness: 0.08, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide });
        const surface = mesh(new THREE.PlaneGeometry(30, 20), waterMat, fixed, 0, -3, 1.1); surface.castShadow = false;
        // 水面反光只作裝飾，不更改電位與水深。
        for (let i = 0; i < 5; i++) {
          const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-13 + i, -10 + i * 2.7, 1.12), new THREE.Vector3(-4 + i, -9.4 + i * 2.7, 1.12)]);
          fixed.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: css(LD.shade(aqua(), 0.8)), transparent: true, opacity: 0.27 })));
        }
      }
      d.sol.els.forEach(function (e) {
        const material = water ? mat(LD.mix(LD.c.pos, LD.c.probe, 0.44), 0.76, 0.25) : silver;
        const h = water ? 2.3 : 0.16;
        let x, y;
        if (e.kind === 'circle') { x = e.x - 15; y = e.y - 13; cylinder(e.r, h, fixed, material, x, y, h / 2 + 0.1); }
        else { x = (e.x0 + e.x1) / 2 - 15; y = (e.y0 + e.y1) / 2 - 13; box(e.x1 - e.x0, e.y1 - e.y0, h, fixed, material, x, y, h / 2 + 0.1, 0.12); }
        cylinder(0.24, 0.3, fixed, mat(e.sign > 0 ? LD.c.pos : LD.c.field), x, y, h + 0.28);
      });
      instrument(-8, 15, true, d);
      if (d.meter === 'phone') headphones(); else instrument(8, 15, false, d);
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
      const key = [d.n1.x, d.n1.y, d.n2.x, d.n2.y, d.sol.key, d.medium, d.meter].join('|');
      if (key === wireKey) return; wireKey = key; clear(wireGroup);
      const z = d.medium === 'water' ? 1.1 : 0.12;
      d.sol.els.forEach(function (e) {
        const x = (e.kind === 'circle' ? e.x : (e.x0 + e.x1) / 2) - 15;
        const y = (e.kind === 'circle' ? e.y : e.y1) - 13;
        const color = e.sign > 0 ? LD.c.pos : LD.c.field;
        cable([[-8 + (e.sign > 0 ? 2.5 : 0.5), 12.9, 3.2], [-8 + (e.sign > 0 ? 2.5 : 0.5), 10, 2.5], [x, 9, 2.4], [x, y, d.medium === 'water' ? 2.65 : 0.5]], color, 0.12);
      });
      [['n1', d.n1], ['n2', d.n2]].forEach(function (a) {
        const x = a[1].x - 15, y = a[1].y - 13;
        probes[a[0]].position.set(x, y, z);
        const tx = d.meter === 'phone' ? (a[0] === 'n1' ? 4.6 : 11.4) : 8 + (a[0] === 'n1' ? 0.5 : 2.5);
        cable([[x, y, z + 4.65], [x + (a[0] === 'n1' ? -2.5 : 2.5), y + 2, z + 5], [tx, 9.4, 1.7], [tx, 12.9, d.meter === 'phone' ? 1.6 : 3.2]], a[0] === 'n1' ? LD.c.field : LD.c.pos, 0.085);
      });
    }
    function update() {
      if (!active) return;
      const d = env.data(), key = [LD.ver, d.sol.key, d.medium, d.meter].join('|');
      if (key !== buildKey) { buildKey = key; build(d); }
      updateWires(d);
      const tk = [d.reading, d.V0, d.power, d.ac, d.current, LD.ver].join('|');
      if (tk !== textKey) {
        textKey = tk;
        writeFace(supplyFace, d.ac ? 'AC · 1 kHz · RMS' : 'DC', d.power ? d.V0.toFixed(1) + ' V' : 'OFF', d.power ? (d.current * 1000).toFixed(2) + ' mA' : '0.00 mA');
        writeFace(meterFace, d.meter === 'phone' ? T('耳機 · 零點偵測', 'Headphone null detector') : d.meter === 'galv' ? T('檢流計', 'Galvanometer') : d.ac ? 'ACV · RMS' : 'DCV', d.reading, d.meter === 'phone' ? T('聲音最小＝等電位', 'Quietest = equal potential') : 'COM                  V');
      }
      requestRender();
    }
    function fit() {
      const center = new THREE.Vector3(0, 2, 0), dir = new THREE.Vector3(0.35, -1.2, 1.1).normalize();
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
      distance *= 1.04;
      controls.target.copy(center); camera.position.copy(center).addScaledVector(dir, distance);
      controls.update(); camera.updateProjectionMatrix();
    }
    function requestRender() {
      if (raf || !active || document.hidden) return;
      raf = requestAnimationFrame(function () {
        raf = 0; if (!active || document.hidden) return;
        const moved = controls.update(); renderer.render(scene, camera); if (moved) requestRender();
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
        active = false; if (raf) cancelAnimationFrame(raf); ro.disconnect(); controls.dispose();
        document.removeEventListener('visibilitychange', visible); disposeObject(scene);
        renderer.dispose(); renderer.forceContextLoss(); canvas.remove();
      }
    };
    update(); resize(); return api;
  }
  window.EquipotentialRig3D = { create: create };
})();
