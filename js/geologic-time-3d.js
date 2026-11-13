/*
 * geologic-time-3d.js — 「地層與地質年代」的 3D 檢視（three.js）：地層方塊圖
 *
 * 由 js/geologic-time.js 在使用者按「3D」時才載入；切回 2D 時整個釋放。
 * 用法：window.GeoTime3D.create({ THREE, OrbitControls }, 容器, bridge) → { active, frame, busy, onShow, onTheme, rebuild, resetCamera, camTo, dispose }
 *
 * 座標：x＝沿剖面（4 km → 8 單位）、y＝往岩壁裡面、z＝上（和 2D 一樣垂直誇大 ×1.15）。
 * 剖面是二維的（地層沿 y 方向不變），所以方塊的正面、背面就是 2D 剖面，左右兩側與頂面從剖面的邊緣與地表取色。
 */
(function () {
  'use strict';
  const VE = 1.15, BX = 8, DEPTH = 3.2;

  function create(lib, host, B) {
    const THREE = lib.THREE;
    const G = B.G, T = B.T, D = B.D;
    let C = B.colors();
    const SX = BX / G.W, ZC = (G.Z_HI + G.Z_LO) / 2;
    function px(x) { return (x - G.W / 2) * SX; }
    function pz(z) { return (z - ZC) * SX * VE; }

    // ---------- 畫布與 HUD ----------
    const wrap = document.createElement('div');
    wrap.className = 'c3-wrap';
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('3D 地層方塊：可拖曳旋轉、縮放', '3D block of strata: drag to rotate, pinch or scroll to zoom'));
    wrap.appendChild(canvas);
    const hud = document.createElement('div');
    hud.className = 'c3-hud';
    hud.setAttribute('aria-hidden', 'true');
    hud.innerHTML = '<div class="tl"><span data-k="a"></span><span class="m" data-k="b"></span></div><div class="br"><span class="m" data-k="note"></span></div>';
    wrap.appendChild(hud);
    host.appendChild(wrap);
    const hudEl = {}, hudLast = {};
    hud.querySelectorAll('[data-k]').forEach(function (e) { hudEl[e.getAttribute('data-k')] = e; });
    function setHud(k, html) { if (hudLast[k] !== html) { hudLast[k] = html; hudEl[k].innerHTML = html; } }

    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false }); }
    catch (e) { wrap.remove(); throw e; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1.6, 0.05, 400);
    camera.up.set(0, 0, 1);
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true; controls.dampingFactor = 0.12; controls.rotateSpeed = 0.7;
    controls.enablePan = false; controls.minDistance = 4; controls.maxDistance = 40;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x475569, 2.0));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.6); keyLight.position.set(-5, -9, 12); scene.add(keyLight);
    const fill = new THREE.DirectionalLight(0xfde68a, 0.45); fill.position.set(9, 6, 3); scene.add(fill);

    function disposeObject(obj) {
      obj.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); });
      });
    }
    function col(c) { return new THREE.Color(c || '#888888'); }

    // ---------- 文字標籤 ----------
    const RES = 3;
    let cw = 600, ch = 440;
    function makeLabelCanvas(text, color) {
      const font = '700 ' + 12 * RES + 'px ' + D.FONT;
      const c = document.createElement('canvas');
      let g = c.getContext('2d'); g.font = font;
      const tw = g.measureText(text).width;
      c.width = Math.ceil(tw + 12 * RES); c.height = Math.ceil(19 * RES);
      g = c.getContext('2d');
      const r = c.height / 2 - RES;
      g.beginPath(); g.moveTo(r + RES, RES); g.arcTo(c.width - RES, RES, c.width - RES, c.height - RES, r); g.arcTo(c.width - RES, c.height - RES, RES, c.height - RES, r);
      g.arcTo(RES, c.height - RES, RES, RES, r); g.arcTo(RES, RES, c.width - RES, RES, r); g.closePath();
      g.fillStyle = D.dark ? 'rgba(8,12,26,0.82)' : 'rgba(255,255,255,0.9)'; g.fill();
      g.strokeStyle = color; g.globalAlpha = 0.8; g.lineWidth = RES; g.stroke(); g.globalAlpha = 1;
      g.font = font; g.textBaseline = 'middle'; g.fillStyle = color; g.fillText(text, 6 * RES, c.height / 2 + RES * 0.5);
      return c;
    }
    function fitLabel(sp) { const k = 2 * Math.tan(camera.fov * Math.PI / 360) / Math.max(1, ch); sp.scale.set(sp.userData.lw * k, sp.userData.lh * k, 1); }
    function label(text, color, pos) {
      const c = makeLabelCanvas(text, color), tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false }));
      sp.userData = { isLabel: true, lw: c.width / RES, lh: c.height / RES };
      sp.renderOrder = 30; sp.position.set(pos[0], pos[1], pos[2]);
      fitLabel(sp);
      return sp;
    }
    function texOf(canvasEl) {
      const t = new THREE.CanvasTexture(canvasEl);
      t.colorSpace = THREE.SRGBColorSpace; t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
      return t;
    }
    function mesh(pos, uv, mat) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.computeVertexNormals();
      return new THREE.Mesh(geo, mat);
    }
    function line(pts, color, opacity) {
      const geo = new THREE.BufferGeometry().setFromPoints(pts.map(function (q) { return new THREE.Vector3(q[0], q[1], q[2]); }));
      return new THREE.Line(geo, new THREE.LineBasicMaterial({ color: col(color), transparent: true, opacity: opacity }));
    }

    // ---------- 方塊 ----------
    const world = new THREE.Group(); scene.add(world);
    let builtKey = '', texCanvas = null;
    function keyOf() {
      const S = B.S(), t = B.t(), n = G.countAt(S, t), dep = G.depositingAt(S, t);
      return S.id + '|' + n + '|' + (dep && dep.i === n ? Math.round(dep.frac * 100) : -1) + '|' + (D.dark ? 1 : 0) + '|' + B.state.mode + '|' + B.state.sel + '|' + (B.state.selPt ? B.state.selPt.x.toFixed(0) : '');
    }
    function build() {
      const key = keyOf();
      if (key === builtKey) return;
      builtKey = key;
      while (world.children.length) { const o = world.children.pop(); disposeObject(o); }
      const S = B.S(), t = B.t(), n = G.countAt(S, t);
      scene.background = col(D.dark ? '#0b1220' : '#e6eef7');
      // 貼圖（和 2D 剖面相同；空氣透明）
      const TW = 640, TH = 320;
      texCanvas = B.paint('front', TW, TH);
      const tex = texOf(texCanvas);
      const g2 = texCanvas.getContext('2d'), alphaData = g2.getImageData(0, 0, TW, TH).data;
      // 每一欄的地表（最上面的岩石像素）
      const NC = 160, surf = [];
      for (let i = 0; i <= NC; i++) {
        const ci = Math.min(TW - 1, Math.round(i / NC * (TW - 1)));
        let j = 0; while (j < TH - 1 && alphaData[4 * (j * TW + ci) + 3] < 128) j++;
        surf.push({ u: ci / (TW - 1), v: j / TH, z: G.Z_HI - j / TH * (G.Z_HI - G.Z_LO) });
      }
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, metalness: 0, alphaTest: 0.5, side: THREE.DoubleSide, transparent: false });
      const x0 = px(0), x1 = px(G.W), zt = pz(G.Z_HI), zb = pz(G.Z_LO), y0 = -DEPTH / 2, y1 = DEPTH / 2;
      // 正面與背面
      world.add(mesh([x0, y0, zb, x1, y0, zb, x1, y0, zt, x0, y0, zb, x1, y0, zt, x0, y0, zt], [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], mat));
      world.add(mesh([x1, y1, zb, x0, y1, zb, x0, y1, zt, x1, y1, zb, x0, y1, zt, x1, y1, zt], [1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 1, 1], mat));
      // 頂面（地表）：每一欄取剖面最上緣的顏色
      const tp = [], tu = [];
      const topMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
      for (let i = 0; i < NC; i++) {
        const a = surf[i], b = surf[i + 1];
        if (a.v >= 0.999 || b.v >= 0.999) continue;
        const xa = px(a.u * G.W), xb = px(b.u * G.W), za = pz(a.z), zb2 = pz(b.z), va = 1 - Math.min(0.999, a.v + 3 / TH), vb = 1 - Math.min(0.999, b.v + 3 / TH);
        tp.push(xa, y0, za, xb, y0, zb2, xb, y1, zb2, xa, y0, za, xb, y1, zb2, xa, y1, za);
        tu.push(a.u, va, b.u, vb, b.u, vb, a.u, va, b.u, vb, a.u, va);
        // 斷崖（相鄰兩欄高度不同）：補一塊直立面
        if (Math.abs(a.z - b.z) > 3) {
          const zl = Math.min(za, zb2), zh = Math.max(za, zb2), uu = (a.z > b.z ? a.u : b.u), vh = 1 - Math.min(0.999, (Math.min(a.v, b.v) + 3 / TH)), vl = 1 - Math.max(a.v, b.v);
          tp.push(xb, y0, zl, xb, y1, zl, xb, y1, zh, xb, y0, zl, xb, y1, zh, xb, y0, zh);
          tu.push(uu, vl, uu, vl, uu, vh, uu, vl, uu, vh, uu, vh);
        }
      }
      if (tp.length) world.add(mesh(tp, tu, topMat));
      // 左右兩側：剖面最左、最右一欄的顏色
      [0, NC].forEach(function (i) {
        const s = surf[i], x = i === 0 ? x0 : x1, u = i === 0 ? 0.002 : 0.998, z = pz(s.z), v = 1 - s.v;
        if (s.v >= 0.999) return;
        world.add(mesh([x, y0, zb, x, y1, zb, x, y1, z, x, y0, zb, x, y1, z, x, y0, z], [u, 0, u, 0, u, v, u, 0, u, v, u, v], topMat));
      });
      // 底面
      world.add(mesh([x0, y0, zb, x1, y1, zb, x1, y0, zb, x0, y0, zb, x0, y1, zb, x1, y1, zb], [0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0], new THREE.MeshStandardMaterial({ color: col(D.dark ? '#1f2937' : '#475569'), roughness: 1, side: THREE.DoubleSide })));
      // 海（正在堆積海相沉積時）
      const dep = G.depositingAt(S, t);
      const depNow = dep && dep.i === n ? S.events[dep.i] : null;
      if (depNow && (depNow.rock === 'limestone' || depNow.rock === 'shale' || ['trilobite', 'graptolite', 'ammonite'].indexOf(depNow.fossil) >= 0)) {
        const lv = G.levelAt(S, t), top = lv + (depNow.rock === 'shale' ? 140 : 70);
        const water = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, DEPTH, pz(top) - pz(lv)),
          new THREE.MeshStandardMaterial({ color: col(D.dark ? '#0e7490' : '#38bdf8'), transparent: true, opacity: 0.35, roughness: 0.2, depthWrite: false }));
        water.position.set(0, 0, (pz(top) + pz(lv)) / 2 + 0.002);
        world.add(water);
      }
      // 斷層面
      S.events.forEach(function (e, i) {
        if (e.type !== 'fault' || i >= n) return;
        let top = e.z0;
        for (let k = i + 1; k < n; k++) if (S.events[k].type === 'erode') top = Math.min(top, S.events[k].to);
        const xa = px(G.faultX(e, G.Z_LO)), xb = px(G.faultX(e, top)), za = pz(G.Z_LO), zb3 = pz(top);
        const fm = new THREE.MeshStandardMaterial({ color: col(D.dark ? '#fecaca' : '#7f1d1d'), transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
        world.add(mesh([xa, y0 - 0.01, za, xa, y1 + 0.01, za, xb, y1 + 0.01, zb3, xa, y0 - 0.01, za, xb, y1 + 0.01, zb3, xb, y0 - 0.01, zb3], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], fm));
      });
      // 不整合面：沿正面畫一條線
      S.events.forEach(function (e, k) {
        if (e.type !== 'erode' || k >= n) return;
        let seg = [];
        const flush = function () { if (seg.length > 1) world.add(line(seg, D.dark ? '#fde68a' : '#7c2d12', 0.95)); seg = []; };
        for (let xx = -400; xx <= G.W + 400; xx += 25) {
          const p = G.forward(S, xx, e.to, k, n);
          const above = G.rockAtTime(S, p[0], p[1] + 6, t), below = G.rockAtTime(S, p[0], p[1] - 6, t);
          const ok = p[0] >= 0 && p[0] <= G.W && above !== G.AIR && above > k && S.events[above].type === 'deposit' && below !== G.AIR && below < k;
          if (ok) seg.push([px(p[0]), y0 - 0.012, pz(p[1])]); else flush();
        }
        flush();
      });
      // 定年模式：採樣點
      if (B.state.mode === 'date' && B.state.selPt) {
        const p = B.state.selPt, pin = new THREE.Mesh(new THREE.SphereGeometry(0.08, 18, 12), new THREE.MeshStandardMaterial({ color: col(C['gt-sel']), emissive: col(C['gt-sel']), emissiveIntensity: 0.35 }));
        pin.position.set(px(p.x), y0 - 0.06, pz(p.z)); world.add(pin);
        world.add(label(B.unitName(B.state.sel), C['gt-sel'], [px(p.x), y0 - 0.1, pz(p.z) + 0.3]));
      }
      // 方位
      world.add(label(T('岩壁正面', 'Cliff face'), C.muted, [0, y0 - 0.1, zb - 0.3]));
    }

    function updateHud() {
      const S = B.S(), t = B.t(), m = B.state.mode;
      setHud('a', B.fmtT(t) + '・' + B.perName(G.periodAt(t) || 'precambrian'));
      setHud('b', m === 'order' ? T('在 2D 或下面的按鈕排順序', 'Use 2D or the buttons below to place events') : T('剖面 ', 'Section ') + (S.id === 'A' ? '1' : '2'));
      setHud('note', narrow ? T('垂直誇大 ×1.15', 'Vertical ×1.15') : T('正面、背面是剖面；頂面是當時的地表；波浪線＝不整合面、紅色面＝斷層；垂直誇大 ×1.15', 'Front and back: the cross-section; top: the land surface at that time; line = unconformity, red plane = fault; vertical ×1.15'));
    }

    // ---------- 相機 ----------
    function presetFor(kind) {
      const dir = kind === 'top' ? new THREE.Vector3(0, -0.05, 1) : kind === 'front' ? new THREE.Vector3(0, -1, 0.04) : new THREE.Vector3(0.75, -1, 0.62);
      dir.normalize();
      const span = 5.0;
      const fitD = span / Math.tan(camera.fov * Math.PI / 360) / Math.min(1, camera.aspect * 0.95);
      const tgt = new THREE.Vector3(0, 0, -0.1);
      return { pos: tgt.clone().add(dir.multiplyScalar(Math.min(controls.maxDistance, fitD))), tgt: tgt };
    }
    let camAnim = null;
    function camTo(kind, animate) {
      const Pp = presetFor(kind);
      if (!animate || B.reducedMotion) { camAnim = null; camera.position.copy(Pp.pos); controls.target.copy(Pp.tgt); controls.update(); render(); return; }
      camAnim = { t0: performance.now(), dur: 800, p0: camera.position.clone(), t0v: controls.target.clone(), p1: Pp.pos, t1: Pp.tgt };
      B.request();
    }
    function stepCam() {
      if (!camAnim) return;
      const A = camAnim, u = Math.min(1, (performance.now() - A.t0) / A.dur), e = 1 - Math.pow(1 - u, 3);
      const tg = A.t0v.clone().lerp(A.t1, e), d0 = A.p0.clone().sub(A.t0v), d1 = A.p1.clone().sub(A.t1);
      const len = d0.length() * (1 - e) + d1.length() * e, dir = d0.normalize().lerp(d1.normalize(), e);
      if (dir.lengthSq() < 1e-6) dir.copy(d1).normalize();
      controls.target.copy(tg); camera.position.copy(tg).add(dir.normalize().multiplyScalar(len));
      if (u >= 1) camAnim = null;
    }

    let moving = false, narrow = false;
    function render() {
      if (!api.active || document.hidden) return;
      const want = Math.min(window.devicePixelRatio || 1, 2);
      if (renderer.getPixelRatio() !== want) { renderer.setPixelRatio(want); renderer.setSize(cw, ch, false); }
      stepCam();
      moving = controls.update();
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
      camera.aspect = w / h; camera.updateProjectionMatrix();
      scene.traverse(function (o) { if (o.userData && o.userData.isLabel) fitLabel(o); });
      render();
    }
    const ro = window.ResizeObserver ? new ResizeObserver(function () { resize3(); }) : null;
    if (ro) ro.observe(wrap); else window.addEventListener('resize', resize3);
    controls.addEventListener('change', function () { B.request(); });
    canvas.addEventListener('webglcontextlost', function (ev) { ev.preventDefault(); if (api.active && B.onContextLost) B.onContextLost(); });

    function update() { build(); updateHud(); }
    const api = {
      active: true,
      frame: function () { update(); render(); },
      busy: function () { return !!camAnim || moving; },
      onShow: function () { resize3(); update(); camTo('tilt', false); },
      onTheme: function () { C = B.colors(); Object.keys(hudLast).forEach(function (k) { delete hudLast[k]; }); builtKey = ''; update(); render(); },
      rebuild: function () { builtKey = ''; B.request(); },
      resetCamera: function () { camTo('tilt', true); },
      camTo: function (kind) { camTo(kind, true); },
      dispose: function () {
        api.active = false;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        controls.dispose(); disposeObject(scene); renderer.dispose(); renderer.forceContextLoss(); wrap.remove();
      }
    };

    const w0 = wrap.clientWidth;
    if (w0) {
      narrow = w0 < 560; cw = w0; ch = sizeOf(w0);
      canvas.style.height = ch + 'px'; renderer.setSize(cw, ch, false);
      camera.aspect = cw / ch; camera.updateProjectionMatrix();
    }
    update();
    camTo('tilt', false);
    return api;
  }

  window.GeoTime3D = { create: create };
})();
