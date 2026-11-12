/*
 * space-vectors-3d.js — 「空間向量：內積、外積與平面」的 3D 空間（three.js）
 *
 * 由 js/space-vectors.js 在使用者按「3D 空間」時才載入（three.js 也是那時才以 import() 載入）；切回 2D 時整個釋放。
 * 用法：window.SpaceVec3D.create({ THREE, OrbitControls }, 容器, bridge) → { active, frame, rebuild, onTheme, resetCamera, dispose }
 *
 * 場景座標就是數學座標：1 個單位 = 1，z 軸朝上（camera.up = (0, 0, 1)），右手系。
 * 所有數值（內積、外積、垂足……）都從 bridge.quantities() 取得，3D 只負責畫。
 */
(function () {
  'use strict';
  const FONT = 'system-ui, -apple-system, "Segoe UI", "Noto Sans TC", "PingFang TC", sans-serif';
  const PI = Math.PI, DEG = PI / 180;

  function create(lib, host, B) {
    const THREE = lib.THREE, SV = B.SV, T = B.T, D = B.D, state = B.state;
    let C = B.colors();
    const col = function (k) { return new THREE.Color(C[k] || k); };
    const isDark = function () { return !!D.dark; };

    // ---------- 畫布與資訊列 ----------
    const wrap = document.createElement('div');
    wrap.className = 's3-wrap';
    const canvas = document.createElement('canvas');
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', T('空間向量的 3D 檢視：坐標軸、地板格線、向量與它們圍出的圖形。拖曳旋轉，滾輪或雙指縮放，方向鍵也可以轉動。',
      '3D view of the space vectors: the axes, the floor grid, the vectors and the shapes they span. Drag to rotate, scroll or pinch to zoom, or use the arrow keys.'));
    wrap.appendChild(canvas);
    const hud = document.createElement('div');
    hud.className = 's3-hud';
    hud.setAttribute('aria-hidden', 'true');
    hud.innerHTML = '<div class="tl"><span data-k="a"></span><span data-k="b"></span></div><div class="bl"><span class="m" data-k="tip"></span></div>';
    wrap.appendChild(hud);
    host.appendChild(wrap);
    const hudEl = {}, hudLast = {};
    hud.querySelectorAll('[data-k]').forEach(function (e) { hudEl[e.getAttribute('data-k')] = e; });
    function setHud(k, h) { if (hudLast[k] !== h) { hudLast[k] = h; hudEl[k].innerHTML = h; } }

    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true }); }
    catch (e) { wrap.remove(); throw e; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 4 / 3, 0.05, 500);
    camera.up.set(0, 0, 1);
    let cw = 300, ch = 225, lastAspect = 4 / 3;

    // ---------- 視角控制 ----------
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.rotateSpeed = 0.85;
    controls.screenSpacePanning = true;
    let startAng = null;
    controls.addEventListener('start', function () { startAng = [controls.getAzimuthalAngle(), controls.getPolarAngle()]; });
    controls.addEventListener('end', function () {
      if (!startAng) return;
      const turned = Math.abs(controls.getAzimuthalAngle() - startAng[0]) + Math.abs(controls.getPolarAngle() - startAng[1]);
      startAng = null;
      if (turned > 0.3) B.onRotate();
    });

    // ---------- 光線與環境反光 ----------
    scene.add(new THREE.HemisphereLight(0xffffff, 0x3a4250, 0.9));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
    keyLight.position.set(8, 5, 12);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.45);
    fillLight.position.set(-6, -8, 4);
    scene.add(fillLight);
    const pmrem = new THREE.PMREMGenerator(renderer);
    let envRT = null;
    function buildEnv() {
      if (envRT) { envRT.dispose(); envRT = null; }
      const s = new THREE.Scene();
      const g = new THREE.SphereGeometry(10, 32, 16);
      const pos = g.attributes.position, cols = new Float32Array(pos.count * 3);
      const top = new THREE.Color(isDark() ? 0x5d6a80 : 0xffffff), bot = new THREE.Color(isDark() ? 0x0a0d12 : 0x7d8794);
      const c = new THREE.Color();
      for (let i = 0; i < pos.count; i++) {
        const u = Math.max(0, Math.min(1, (pos.getZ(i) / 10 + 1) / 2));
        c.copy(bot).lerp(top, Math.pow(u, 0.75));
        cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      s.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
      envRT = pmrem.fromScene(s, 0.035);
      s.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      scene.environment = envRT.texture;
    }

    // ---------- 共用工具 ----------
    function disposeObject(obj) {
      obj.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); });
      });
    }
    function clearGroup(g) { g.children.slice().forEach(function (o) { g.remove(o); disposeObject(o); }); }
    const V3 = function (p) { return new THREE.Vector3(p[0], p[1], p[2]); };
    const UP = new THREE.Vector3(0, 1, 0);
    function mat(color, opt) {
      opt = opt || {};
      return new THREE.MeshStandardMaterial({
        color: color, roughness: opt.rough == null ? 0.4 : opt.rough, metalness: opt.metal == null ? 0.1 : opt.metal,
        transparent: opt.opacity != null, opacity: opt.opacity == null ? 1 : opt.opacity,
        depthWrite: opt.opacity == null, side: opt.side || THREE.FrontSide,
        emissive: opt.emissive || 0x000000, emissiveIntensity: opt.ei || 0
      });
    }
    /** 箭頭：圓柱＋圓錐，從 p0 指向 p1；r 是桿子的半徑 */
    function arrow(g, p0, p1, color, r, opt) {
      opt = opt || {};
      const a = V3(p0), b = V3(p1), d = b.clone().sub(a), len = d.length();
      if (len < 1e-6) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(r * 2.2, 16, 12), mat(color));
        s.position.copy(a); g.add(s); return;
      }
      const dir = d.clone().normalize();
      const hl = Math.min(r * 7, len * 0.4), hr = r * 2.6;
      const q = new THREE.Quaternion().setFromUnitVectors(UP, dir);
      const m = mat(color, opt);
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len - hl, 16), m);
      shaft.quaternion.copy(q);
      shaft.position.copy(a).addScaledVector(dir, (len - hl) / 2);
      g.add(shaft);
      const head = new THREE.Mesh(new THREE.ConeGeometry(hr, hl, 24), m);
      head.quaternion.copy(q);
      head.position.copy(a).addScaledVector(dir, len - hl / 2);
      g.add(head);
    }
    function line(g, pts, color, opt) {
      opt = opt || {};
      const geo = new THREE.BufferGeometry().setFromPoints(pts.map(V3));
      const m = opt.dash ? new THREE.LineDashedMaterial({ color: color, dashSize: opt.dash, gapSize: opt.gap || opt.dash * 0.7, transparent: true, opacity: opt.opacity == null ? 1 : opt.opacity })
        : new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: opt.opacity == null ? 1 : opt.opacity });
      const l = new THREE.Line(geo, m);
      if (opt.dash) l.computeLineDistances();
      g.add(l);
      return l;
    }
    /** 凸多邊形（頂點依序）填色 */
    function polygon(g, pts, color, opacity) {
      const geo = new THREE.BufferGeometry();
      const arr = [];
      for (let i = 1; i + 1 < pts.length; i++) [pts[0], pts[i], pts[i + 1]].forEach(function (p) { arr.push(p[0], p[1], p[2]); });
      geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      geo.computeVertexNormals();
      const m = new THREE.MeshStandardMaterial({ color: color, transparent: true, opacity: opacity, side: THREE.DoubleSide, depthWrite: false, roughness: 0.6, metalness: 0 });
      const mesh = new THREE.Mesh(geo, m);
      mesh.renderOrder = 2;
      g.add(mesh);
      return mesh;
    }
    /** 文字精靈（永遠面向鏡頭） */
    function sprite(g, text, p, color, size, italic) {
      const px = 64;
      const cv = document.createElement('canvas');
      const c0 = cv.getContext('2d');
      const font = (italic ? 'italic ' : '') + '700 ' + px + 'px ' + FONT;
      c0.font = font;
      const w = Math.ceil(c0.measureText(text).width) + 28, h = px + 28;
      cv.width = w; cv.height = h;
      const c = cv.getContext('2d');
      c.font = font; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = 12; c.lineJoin = 'round';
      c.strokeStyle = isDark() ? 'rgba(10,14,20,0.85)' : 'rgba(255,255,255,0.9)';
      c.strokeText(text, w / 2, h / 2 + 2);
      c.fillStyle = color; c.fillText(text, w / 2, h / 2 + 2);
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
      const k = (size || 0.5) / px;
      s.scale.set(w * k, h * k, 1);
      s.position.copy(V3(p));
      s.renderOrder = 10;
      g.add(s);
      return s;
    }
    function ball(g, p, r, color, opt) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), mat(color, opt));
      m.position.copy(V3(p));
      g.add(m);
    }
    function arcPts(u, v, r, n) {
      const th = Math.acos(Math.max(-1, Math.min(1, SV.dot(u, v))));
      const w = SV.unit(SV.sub(v, SV.scale(u, SV.dot(u, v))));
      const out = [];
      for (let i = 0; i <= n; i++) { const t = th * i / n; out.push(SV.add(SV.scale(u, r * Math.cos(t)), SV.scale(w, r * Math.sin(t)))); }
      return out;
    }
    function rightMark(g, p, u1, u2, s, color) {
      line(g, [SV.add(p, SV.scale(u1, s)), SV.add(SV.add(p, SV.scale(u1, s)), SV.scale(u2, s)), SV.add(p, SV.scale(u2, s))], color);
    }

    // ---------- 場景 ----------
    const world = new THREE.Group();
    scene.add(world);
    let G = 4, R = 4;
    function tipLabel(name, from, v, color, size, italic) {
      const tip = SV.add(from, v), u = SV.unit(v);
      sprite(world, name, SV.add(tip, SV.scale(u, 0.45 + 0.15 * name.length / 3)), color, size || 0.5, italic !== false);
    }
    function vec(name, v, color, from, opt) {
      from = from || [0, 0, 0];
      opt = opt || {};
      arrow(world, from, SV.add(from, v), col(color), opt.r || 0.055, { emissive: col(color), ei: 0.08 });
      if (name) tipLabel(name, from, v, C[color] || color, opt.size, opt.italic);
      if (state.show.drop && !opt.noDrop) {
        const tip = SV.add(from, v);
        if (Math.abs(tip[2]) > 1e-9) {
          line(world, [tip, [tip[0], tip[1], 0]], col(color), { dash: 0.12, gap: 0.12, opacity: 0.6 });
          ball(world, [tip[0], tip[1], 0], 0.05, col(color), { opacity: 0.7 });
        }
      }
    }
    function build() {
      clearGroup(world);
      const q = B.quantities();
      R = B.extentOf(q);
      G = Math.max(4, Math.min(12, Math.ceil(R)));
      const text = col('text'), muted = col('muted');
      // 地板格線（z = 0）
      const grid = new THREE.GridHelper(2 * G, 2 * G, muted, muted);
      grid.rotation.x = PI / 2;
      grid.material.transparent = true; grid.material.opacity = isDark() ? 0.22 : 0.28; grid.material.depthWrite = false;
      world.add(grid);
      polygon(world, [[-G, -G, 0], [G, -G, 0], [G, G, 0], [-G, G, 0]], col('text'), isDark() ? 0.035 : 0.03);
      // 坐標軸
      [[1, 0, 0], [0, 1, 0], [0, 0, 1]].forEach(function (u, i) {
        arrow(world, [0, 0, 0], SV.scale(u, G + 0.7), text, 0.022, { opacity: 0.75 });
        line(world, [[0, 0, 0], SV.scale(u, -G)], muted, { dash: 0.15, gap: 0.12, opacity: 0.6 });
        sprite(world, ['x', 'y', 'z'][i], SV.scale(u, G + 1.15), C.text, 0.55, true);
        for (let k = 2; k <= G; k += 2) sprite(world, String(k), SV.add(SV.scale(u, k), i === 2 ? [0.25, 0.25, 0] : [0, 0, -0.28]), C.muted, 0.32, false);
      });
      ball(world, [0, 0, 0], 0.07, text);
      const hide = !!state.chal, m = state.mode;
      if (m === 'inner') buildInner(q, hide);
      else if (m === 'cross') buildCross(q, hide);
      else if (m === 'volume') buildVolume(q, hide);
      else buildPlane(q, hide);
      // 資訊列
      const num = B.num;
      if (m === 'inner') { setHud('a', 'a · b = ' + num(q.dot, 2)); setHud('b', 'θ = ' + (hide || q.angle == null ? '？' : num(q.angle, 1) + '°')); }
      else if (m === 'cross') { setHud('a', 'a × b = ' + B.vtxt(q.cross, 2)); setHud('b', T('面積 ', 'area ') + (hide ? '？' : num(q.area, 2))); }
      else if (m === 'volume') { setHud('a', 'a · (b × c) = ' + (hide ? '？' : num(q.triple, 2))); setHud('b', ''); }
      else { setHud('a', 'Q = ' + B.vtxt(q.q)); setHud('b', T('距離 ', 'distance ') + (hide || q.dist == null ? '？' : num(q.dist, 2))); }
      setHud('tip', T('拖曳旋轉・滾輪縮放', 'Drag to rotate · scroll to zoom'));
    }
    function buildInner(q, hide) {
      const a = q.a, b = q.b, ok = !SV.isZero(a) && !SV.isZero(b);
      vec('a', a, 'sv-a'); vec('b', b, 'sv-b');
      if (!ok) return;
      if (state.show.proj && q.proj) {
        const ua = SV.unit(a), pr = q.proj;
        const t0 = Math.min(0, SV.dot(pr, ua)) - 0.6, t1 = Math.max(q.la, SV.dot(pr, ua)) + 0.6;
        line(world, [SV.scale(ua, t0), SV.scale(ua, t1)], col('sv-a'), { dash: 0.2, gap: 0.15, opacity: 0.5 });
        line(world, [b, pr], col('sv-proj'), { dash: 0.15, gap: 0.1 });
        const perp = SV.sub(b, pr);
        if (SV.norm(perp) > 0.15) rightMark(world, pr, SV.scale(ua, SV.dot(pr, ua) >= 0 ? -1 : 1), SV.unit(perp), 0.3, col('sv-proj'));
        if (!SV.isZero(pr)) arrow(world, [0, 0, 0], pr, col('sv-proj'), 0.075, { emissive: col('sv-proj'), ei: 0.1 });
      }
      if (state.show.arc && q.angle > 0.5 && q.angle < 179.5) {
        const r = Math.max(0.5, Math.min(q.la, q.lb) * 0.32);
        const pts = arcPts(SV.unit(a), SV.unit(b), r, 32);
        polygon(world, [[0, 0, 0]].concat(pts), col('accent'), 0.22);
        line(world, pts, col('accent'));
        sprite(world, hide ? 'θ' : 'θ = ' + B.num(q.angle, 1) + '°', SV.scale(pts[16], 1.6), C.accent, 0.38, hide);
      }
    }
    function buildCross(q, hide) {
      const a = q.a, b = q.b, ab = SV.add(a, b), ok = !SV.isZero(a) && !SV.isZero(b);
      vec('a', a, 'sv-a'); vec('b', b, 'sv-b');
      if (!ok) return;
      if (q.area > 1e-9) {
        polygon(world, [[0, 0, 0], a, ab, b], col('sv-x'), 0.24);
        line(world, [a, ab, b], col('sv-x'), { dash: 0.15, gap: 0.1, opacity: 0.8 });
        sprite(world, hide ? T('面積 ？', 'area ?') : T('面積 ', 'area ') + B.num(q.area, 2), SV.scale(ab, 0.5), C['sv-x'], 0.36, false);
        const k = B.crossScale(q), X = SV.scale(q.cross, k);
        vec('a × b' + (k < 1 ? T('（1/' + Math.round(1 / k) + ' 長）', ' (1/' + Math.round(1 / k) + ' scale)') : ''), X, 'sv-x', null, { r: 0.065, size: 0.42, italic: false });
        rightMark(world, [0, 0, 0], SV.unit(X), SV.unit(a), 0.3, col('sv-x'));
        rightMark(world, [0, 0, 0], SV.unit(X), SV.unit(b), 0.3, col('sv-x'));
        if (state.show.arc) {
          const r = Math.max(0.6, Math.min(q.la, q.lb) * 0.42);
          const pts = arcPts(SV.unit(a), SV.unit(b), r, 30);
          line(world, pts.slice(0, 26), col('sv-x'));
          arrow(world, pts[25], pts[30], col('sv-x'), 0.02);
        }
      } else sprite(world, 'a × b = 0', [0, 0, 0.6], C['sv-x'], 0.4, false);
    }
    function buildVolume(q, hide) {
      const a = q.a, b = q.b, c = q.c;
      vec('a', a, 'sv-a'); vec('b', b, 'sv-b'); vec('c', c, 'sv-c');
      const O = [0, 0, 0], ab = SV.add(a, b), ac = SV.add(a, c), bc = SV.add(b, c), abc = SV.add(ab, c);
      const V = [O, a, b, c, ab, ac, bc, abc];
      const faces = [[0, 1, 4, 2], [3, 5, 7, 6], [0, 1, 5, 3], [2, 4, 7, 6], [0, 2, 6, 3], [1, 4, 7, 5]];
      const color = col(q.triple >= 0 ? 'sv-c' : 'sv-x');
      faces.forEach(function (f, i) { polygon(world, f.map(function (k) { return V[k]; }), color, i === 4 ? 0.3 : 0.14); });
      const E = [[0, 1], [0, 2], [0, 3], [1, 4], [1, 5], [2, 4], [2, 6], [3, 5], [3, 6], [4, 7], [5, 7], [6, 7]];
      E.forEach(function (e) { line(world, [V[e[0]], V[e[1]]], color, { opacity: 0.75 }); });
      if (Math.abs(q.triple) > 1e-9 && !SV.isZero(q.bc)) {
        const u = SV.unit(q.bc), h = SV.dot(a, u), f = SV.sub(a, SV.scale(u, h));
        line(world, [a, f], col('sv-a'), { dash: 0.15, gap: 0.1 });
        ball(world, f, 0.05, col('sv-a'));
      }
      if (!hide) sprite(world, Math.abs(q.triple) < 1e-9 ? T('體積 0', 'volume 0') : 'V = ' + B.num(Math.abs(q.triple), 2), SV.add(abc, [0, 0, 0.6]), C[q.triple >= 0 ? 'sv-c' : 'sv-x'], 0.4, false);
    }
    function buildPlane(q, hide) {
      const n = q.n;
      ball(world, q.q, 0.13, col('probe'), { emissive: col('probe'), ei: 0.25 });
      sprite(world, 'Q', SV.add(q.q, [0, 0, 0.45]), C.probe, 0.5, true);
      if (state.show.drop && Math.abs(q.q[2]) > 1e-9) line(world, [q.q, [q.q[0], q.q[1], 0]], col('probe'), { dash: 0.12, gap: 0.12, opacity: 0.6 });
      if (SV.isZero(n)) { sprite(world, T('n = 0：沒有平面', 'n = 0: no plane'), [0, 0, 1], C['sv-n'], 0.4, false); return; }
      const Rb = B.boxR(q);
      const pts = SV.planeBoxPolygon(n, q.d, Rb);
      if (pts.length) {
        polygon(world, pts, col('sv-plane'), 0.28);
        line(world, pts.concat([pts[0]]), col('sv-plane'));
        // 平面上的格線
        const Bp = SV.planeBasis(n), p0 = SV.planePoint(n, q.d), span = Rb * 2;
        const inside = function (p) { return p.every(function (x) { return Math.abs(x) <= Rb + 1e-6; }); };
        for (let i = -span; i <= span; i++) {
          [[Bp.u, Bp.v], [Bp.v, Bp.u]].forEach(function (uv) {
            const segPts = [];
            for (let t = -span; t <= span; t += 0.25) { const p = SV.add(p0, SV.add(SV.scale(uv[0], i), SV.scale(uv[1], t))); if (inside(p)) segPts.push(p); }
            if (segPts.length > 1) line(world, [segPts[0], segPts[segPts.length - 1]], col('sv-plane'), { opacity: 0.3 });
          });
        }
        const ctr = SV.scale(pts.reduce(SV.add, [0, 0, 0]), 1 / pts.length);
        const base = p0.every(function (x) { return Math.abs(x) <= Rb + 1e-9; }) ? p0 : ctr;
        const nd = SV.scale(SV.unit(n), Math.min(2.4, Math.max(1.4, q.ln)));
        vec('n', nd, 'sv-n', base, { noDrop: true });
      }
      if (Math.abs(q.sdist) > 1e-9) {
        line(world, [q.q, q.foot], col('probe'), { dash: 0.15, gap: 0.1 });
        ball(world, q.foot, 0.07, col('sv-plane'));
        sprite(world, 'F', SV.add(q.foot, [0, 0, -0.35]), C['sv-plane'], 0.42, true);
        const Bp = SV.planeBasis(n);
        rightMark(world, q.foot, SV.scale(Bp.w, q.sdist > 0 ? 1 : -1), Bp.u, 0.3, col('probe'));
        sprite(world, hide ? T('距離 ？', 'distance ?') : T('距離 ', 'distance ') + B.num(q.dist, 2), SV.scale(SV.add(q.q, q.foot), 0.5), C.probe, 0.36, false);
      }
    }

    // ---------- 繪製與鏡頭 ----------
    let raf = 0;
    function requestRender() {
      if (raf || !api.active) return;
      raf = requestAnimationFrame(function () {
        raf = 0;
        if (!api.active) return;
        const moving = controls.update();
        renderer.render(scene, camera);
        if (moving) requestRender();
      });
    }
    function resetCamera() {
      const e = SV.viewBasis(B.yaw0, B.pitch0).e;
      const dist = Math.max(G, R) * (camera.aspect < 1 ? 3.9 : 3.2);
      camera.position.set(e[0] * dist, e[1] * dist, e[2] * dist + 0.5);
      controls.target.set(0, 0, Math.min(1.5, R * 0.2));
      camera.updateProjectionMatrix();
      controls.update();
      requestRender();
    }
    function resize3() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      cw = w; ch = h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (Math.abs(camera.aspect - lastAspect) > 1e-3) { lastAspect = camera.aspect; resetCamera(); }
      requestRender();
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
    canvas.addEventListener('keydown', function (ev) {
      const step = (ev.shiftKey ? 15 : 5) * DEG;
      const off = camera.position.clone().sub(controls.target);
      // z 軸朝上：先轉到 y 朝上的座標算球座標，再轉回來
      const tmp = new THREE.Vector3(off.x, off.z, -off.y);
      const sph = new THREE.Spherical().setFromVector3(tmp);
      let used = true;
      if (ev.key === 'ArrowLeft') sph.theta -= step;
      else if (ev.key === 'ArrowRight') sph.theta += step;
      else if (ev.key === 'ArrowUp') sph.phi = Math.max(0.05, sph.phi - step);
      else if (ev.key === 'ArrowDown') sph.phi = Math.min(PI - 0.05, sph.phi + step);
      else used = false;
      if (!used) return;
      ev.preventDefault();
      const v = new THREE.Vector3().setFromSpherical(sph);
      camera.position.copy(controls.target).add(new THREE.Vector3(v.x, -v.z, v.y));
      controls.update();
      requestRender();
      B.onRotate();
    });

    const api = {
      active: true,
      frame: function () { requestRender(); },
      rebuild: function () { build(); requestRender(); },
      onTheme: function () {
        C = B.colors();
        buildEnv();
        Object.keys(hudLast).forEach(function (k) { delete hudLast[k]; });
        build();
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
        disposeObject(scene);
        if (envRT) envRT.dispose();
        pmrem.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        wrap.remove();
      }
    };

    buildEnv();
    build();
    const w0 = canvas.clientWidth, h0 = canvas.clientHeight;
    if (w0 && h0) {
      cw = w0; ch = h0;
      renderer.setSize(cw, ch, false);
      camera.aspect = cw / ch;
      camera.updateProjectionMatrix();
      lastAspect = camera.aspect;
    }
    resetCamera();
    return api;
  }

  window.SpaceVec3D = { create: create };
})();
