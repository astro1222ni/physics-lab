/*
 * seafloor-spreading-3d.js — 「海底擴張與磁條帶」的 3D 方塊圖（three.js）
 *
 * 由 js/seafloor-spreading.js 在使用者按「3D」時才載入（three.js 也是那時才以 import() 載入）；切回 2D 時整個釋放。
 * 用法：window.Seafloor3D.create({ THREE, OrbitControls }, 容器, bridge) → { active, frame, busy, onShow, onTheme, resetCamera, camTo, dispose }
 *
 * 場景座標：x 橫越中洋脊（±R km 對應 ±6 單位），y 沿著中洋脊（±3 單位，示意），z 向上，海面 z = 0、每 km 水深 0.6 單位。
 * 海床（磁性層頂面）照 GDH1 深度、依極性上色；正面切開是剖面（0.5 km 磁性層＋下部地殼）；
 * 船沿 y = 0 航行，海面上方的曲線是 2D 畫面同一份磁異常（SeafloorCore.profile）。全部是畫面用的示意比例，物理量都在核心算。
 */
(function () {
  'use strict';
  const HX = 6, HY = 3, VZ = 0.6, ZMAX = 5;

  function create(lib, host, B) {
    const THREE = lib.THREE;
    const K = B.K, T = B.T, state = B.state, D = B.D;
    let C = B.colors();

    // ---------- 畫布與 HUD ----------
    const wrap = document.createElement('div');
    wrap.className = 'c3-wrap';
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('海底擴張的 3D 方塊圖：海床依磁極性上色，正面是剖面，海面上方是船量到的磁異常（可拖曳旋轉、縮放）',
      '3D block diagram of seafloor spreading: the seafloor is coloured by magnetic polarity, the front face is a cross-section and the curve above the sea is the anomaly measured by the ship (drag to rotate, pinch or scroll to zoom)'));
    wrap.appendChild(canvas);
    const hud = document.createElement('div');
    hud.className = 'c3-hud';
    hud.setAttribute('aria-hidden', 'true');
    hud.innerHTML = '<div class="tl"><span data-k="time"></span><span class="m" data-k="ship"></span></div>' +
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

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1.6, 0.05, 200);
    camera.up.set(0, 0, 1);
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.rotateSpeed = 0.7;
    controls.enablePan = false;
    controls.minDistance = 5;
    controls.maxDistance = 32;

    scene.add(new THREE.HemisphereLight(0xdbe8ff, 0x2a2420, 0.95));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(-6, -8, 12);
    scene.add(sun);

    const col = function (c) { return new THREE.Color(C[c] || c || '#888888'); };
    function disposeObject(obj) {
      obj.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); });
      });
    }

    // ---------- 文字標籤（Sprite，固定像素大小） ----------
    const RES = 3;
    let cw = 600, ch = 440;
    function label(text, color, p, cx) {
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
      g.fillStyle = 'rgba(8,14,24,0.78)'; g.fill();
      g.strokeStyle = color; g.globalAlpha = 0.7; g.lineWidth = RES; g.stroke(); g.globalAlpha = 1;
      g.font = font; g.textBaseline = 'middle'; g.fillStyle = color; g.fillText(text, 6 * RES, c.height / 2 + RES * 0.5);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false }));
      sp.userData = { lw: c.width / RES, lh: c.height / RES, isLabel: true };
      sp.center.set(cx != null ? cx : 0.5, 0.5);
      sp.position.copy(p);
      sp.renderOrder = 30;
      fitLabel(sp);
      return sp;
    }
    function fitLabel(sp) {
      const k = 2 * Math.tan(camera.fov * Math.PI / 360) / Math.max(1, ch);
      sp.scale.set(sp.userData.lw * k, sp.userData.lh * k, 1);
    }

    // ---------- 方塊圖（設定一變就整組重建） ----------
    let block = null, blockKey = '';
    const zOf = function (km) { return -km * VZ; };
    /** 海床的分段：年表內用核心的分段（含每次反轉），年表外補上灰色的舊地殼 */
    function segments(R) {
      const pr = B.prof(), r = B.rates(), segs = [];
      pr.els.forEach(function (e) {
        const a = Math.max(-R, e.a), b = Math.min(R, e.b);
        if (b <= a) return;
        segs.push({ a: a, b: b, pol: e.pol });
      });
      [[1, r.uR], [-1, r.uL]].forEach(function (q) {
        const s = q[0], u = q[1] * K.KM_PER_MA, edge = Math.max(0, (K.T_MAX - state.tau) * u);
        if (edge >= R) return;
        const n = 12;
        for (let i = 0; i < n; i++) {
          const x0 = edge + (R - edge) * i / n, x1 = edge + (R - edge) * (i + 1) / n;
          segs.push(s > 0 ? { a: x0, b: x1, pol: 0 } : { a: -x1, b: -x0, pol: 0 });
        }
      });
      segs.sort(function (p, q) { return p.a - q.a; });
      return segs;
    }
    function polColor(p) { return p > 0 ? col('sf-n') : p < 0 ? col('sf-r') : col('sf-old'); }
    function buildBlock() {
      const R = B.range(), X = function (x) { return x / R * HX; };
      const g = new THREE.Group();
      const segs = segments(R);
      const floorZ = function (x) { return zOf(B.seafloorZ(x)); };
      // 頂面（海床）：每段一塊，顏色不跨段混合 → 條帶邊界是銳利的
      const tp = [], tc = [], fp = [], fc = [];
      const crustTop = col('sf-crust').multiplyScalar(0.95), crustBot = col('sf-crust').multiplyScalar(0.55);
      function quad(arr, carr, p, c) {           // p：四個點 [x, y, z]，c：四個顏色
        [0, 1, 2, 0, 2, 3].forEach(function (i) { arr.push(p[i][0], p[i][1], p[i][2]); carr.push(c[i].r, c[i].g, c[i].b); });
      }
      segs.forEach(function (s) {
        const xa = X(s.a), xb = X(s.b), za = floorZ(s.a), zb = floorZ(s.b), c = polColor(s.pol);
        quad(tp, tc, [[xa, -HY, za], [xb, -HY, zb], [xb, HY, zb], [xa, HY, za]], [c, c, c, c]);
        // 正面：磁性層 0.5 km
        const la = za - K.LAYER * VZ, lb = zb - K.LAYER * VZ;
        quad(fp, fc, [[xa, -HY, la], [xb, -HY, lb], [xb, -HY, zb], [xa, -HY, za]], [c, c, c, c]);
        // 正面：下部地殼與地函（上亮下暗）
        quad(fp, fc, [[xa, -HY, zOf(ZMAX)], [xb, -HY, zOf(ZMAX)], [xb, -HY, lb], [xa, -HY, la]], [crustBot, crustBot, crustTop, crustTop]);
      });
      function mesh(p, c, opts) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
        geo.computeVertexNormals();
        return new THREE.Mesh(geo, new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, roughness: 0.8, metalness: 0.02, side: THREE.DoubleSide }, opts || {})));
      }
      g.add(mesh(tp, tc, { roughness: 0.7 }));
      g.add(mesh(fp, fc, { roughness: 0.9 }));
      // 兩個側面與背面（灰褐色）
      const sideMat = new THREE.MeshStandardMaterial({ color: col('sf-crust').multiplyScalar(0.7), roughness: 0.95, side: THREE.DoubleSide });
      [-1, 1].forEach(function (s) {
        const x = s * HX, z = floorZ(s * R);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute([x, -HY, zOf(ZMAX), x, HY, zOf(ZMAX), x, HY, z, x, -HY, zOf(ZMAX), x, HY, z, x, -HY, z], 3));
        geo.computeVertexNormals();
        g.add(new THREE.Mesh(geo, sideMat));
      });
      // 中洋脊軸：發光的裂谷線與正面的岩漿庫
      const axisZ = floorZ(0) + 0.02;
      const axis = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 2 * HY, 12), new THREE.MeshStandardMaterial({ color: col('sf-magma'), emissive: col('sf-magma'), emissiveIntensity: 0.9 }));
      axis.position.set(0, 0, axisZ);
      g.add(axis);
      // 岩漿庫：放射漸層貼圖（中心亮橘、往外透明），貼在正面中洋脊正下方
      const mc = document.createElement('canvas'); mc.width = 256; mc.height = 128;
      const mg = mc.getContext('2d'), grd = mg.createRadialGradient(128, 128, 4, 128, 128, 128);
      grd.addColorStop(0, 'rgba(255,237,180,0.95)'); grd.addColorStop(0.25, D.alpha(C['sf-magma'] || '#f97316', 0.85));
      grd.addColorStop(0.65, D.alpha(C['sf-magma'] || '#f97316', 0.3)); grd.addColorStop(1, D.alpha(C['sf-magma'] || '#f97316', 0));
      mg.fillStyle = grd; mg.fillRect(0, 0, 256, 128);
      const mtex = new THREE.CanvasTexture(mc); mtex.colorSpace = THREE.SRGBColorSpace;
      const magma = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.6), new THREE.MeshBasicMaterial({ map: mtex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      magma.rotation.x = Math.PI / 2;
      magma.position.set(0, -HY - 0.01, zOf(ZMAX) + 0.8);
      magma.renderOrder = 3;
      g.add(magma);
      // 擴張方向：海床上兩個箭頭
      const r = B.rates();
      [[1, r.uR], [-1, r.uL]].forEach(function (q) {
        const len = 0.35 + 0.12 * q[1], x0 = q[0] * 2.4;
        const ar = new THREE.ArrowHelper(new THREE.Vector3(q[0], 0, 0), new THREE.Vector3(x0 - q[0] * len / 2, HY * 0.55, floorZ(x0 / HX * R) + 0.08), len, 0xfde68a, 0.2, 0.13);
        g.add(ar);
      });
      // 海面（半透明）
      const sea = new THREE.Mesh(new THREE.PlaneGeometry(2 * HX, 2 * HY), new THREE.MeshStandardMaterial({ color: col('sf-sea1'), transparent: true, opacity: 0.2, roughness: 0.2, depthWrite: false, side: THREE.DoubleSide }));
      sea.renderOrder = 5;
      g.add(sea);
      // 海水（正面那片薄薄的藍，讓水深看得出來）
      const wp = [];
      for (let i = 0; i < 80; i++) {
        const x0 = -R + 2 * R * i / 80, x1 = -R + 2 * R * (i + 1) / 80;
        wp.push(X(x0), -HY, 0, X(x1), -HY, 0, X(x1), -HY, floorZ(x1), X(x0), -HY, 0, X(x1), -HY, floorZ(x1), X(x0), -HY, floorZ(x0));
      }
      const wgeo = new THREE.BufferGeometry(); wgeo.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
      const water = new THREE.Mesh(wgeo, new THREE.MeshBasicMaterial({ color: col('sf-sea2'), transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
      water.renderOrder = 4;
      g.add(water);
      // 磁異常曲線：在航線（y = 0）的海面上方
      const pr = B.prof();
      let bm = 0; for (let i = 0; i < pr.B.length; i++) bm = Math.max(bm, Math.abs(pr.B[i]));
      const Bm = Math.max(100, bm * 1.08), Z0 = 1.6, AZ = 1.1;
      const lp = [], cp = [], cc = [];
      const cN = col('sf-n'), cR = col('sf-r');
      for (let i = 0; i < pr.xs.length; i++) {
        const x = X(pr.xs[i]), z = Z0 + pr.B[i] / Bm * AZ;
        lp.push(x, 0, z);
        if (i) {
          const xp = X(pr.xs[i - 1]), zp = Z0 + pr.B[i - 1] / Bm * AZ, c = (pr.B[i] + pr.B[i - 1]) >= 0 ? cN : cR;
          cp.push(xp, 0, Z0, x, 0, Z0, x, 0, z, xp, 0, Z0, x, 0, z, xp, 0, zp);
          for (let k = 0; k < 6; k++) cc.push(c.r, c.g, c.b);
        }
      }
      const lgeo = new THREE.BufferGeometry(); lgeo.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
      g.add(new THREE.Line(lgeo, new THREE.LineBasicMaterial({ color: 0xf1f5f9 })));
      const fgeo = new THREE.BufferGeometry(); fgeo.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3)); fgeo.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
      const fill = new THREE.Mesh(fgeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
      fill.renderOrder = 6;
      g.add(fill);
      const zg = new THREE.BufferGeometry(); zg.setAttribute('position', new THREE.Float32BufferAttribute([-HX, 0, Z0, HX, 0, Z0], 3));
      g.add(new THREE.Line(zg, new THREE.LineBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.6 })));
      // 船、拖纜與磁力計
      const xs = X(state.cx);
      const ship = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.1), new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.5 }));
      hull.position.z = 0.05; ship.add(hull);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.1), new THREE.MeshStandardMaterial({ color: 0xe11d48, roughness: 0.5 }));
      cab.position.set(0.02, 0, 0.15); ship.add(cab);
      ship.position.set(xs, 0, 0);
      g.add(ship);
      const fishZ = zOf(state.zs);
      const tow = new THREE.BufferGeometry(); tow.setAttribute('position', new THREE.Float32BufferAttribute([xs - 0.18, 0, 0.02, xs - 0.3, 0, fishZ], 3));
      g.add(new THREE.Line(tow, new THREE.LineBasicMaterial({ color: 0x334155 })));
      const fish = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 10), new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0x6b4e00, roughness: 0.4 }));
      fish.scale.set(1.8, 1, 1); fish.position.set(xs - 0.3, 0, fishZ);
      g.add(fish);
      const Bc = B.anomalyAt(state.cx);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 10), new THREE.MeshStandardMaterial({ color: col('sf-cursor'), emissive: col('sf-cursor'), emissiveIntensity: 0.6 }));
      dot.position.set(xs, 0, Z0 + Bc / Bm * AZ);
      g.add(dot);
      const vline = new THREE.BufferGeometry(); vline.setAttribute('position', new THREE.Float32BufferAttribute([xs, 0, 0.2, xs, 0, Z0 + Bc / Bm * AZ], 3));
      g.add(new THREE.Line(vline, new THREE.LineDashedMaterial({ color: col('sf-cursor'), dashSize: 0.08, gapSize: 0.06 })).computeLineDistances());
      // 標籤
      g.add(label(T('中洋脊', 'Ridge axis'), '#fde68a', new THREE.Vector3(0, HY, axisZ + 0.35)));
      g.add(label(T('磁異常', 'Anomaly'), '#e2e8f0', new THREE.Vector3(-HX * 0.8, 0, Z0 + AZ + 0.35), 0.5));
      g.add(label((Bc >= 0 ? '+' : '') + B.num(Bc, 0) + ' nT', C['sf-cursor'] || '#c026d3', new THREE.Vector3(xs, 0, Z0 + Bc / Bm * AZ + 0.32)));
      return g;
    }
    function update() {
      const r = B.rates();
      const key = [r.uL, r.uR, state.tau, state.zs, B.range(), state.cx, B.prof().B.length].join('|');
      if (key !== blockKey) {
        blockKey = key;
        if (block) { scene.remove(block); disposeObject(block); }
        block = buildBlock();
        scene.add(block);
      }
      setHud('time', (state.tau < 0.0005 ? T('現在', 'Present day') : B.maText(state.tau)) + '・' + B.chronName(state.tau));
      const B0 = B.anomalyAt(state.cx);
      setHud('ship', T('船：離中洋脊 ', 'Ship: ') + B.num(Math.abs(state.cx), 1) + T(' km，', ' km from the ridge, ') + (B0 >= 0 ? '+' : '') + B.num(B0, 0) + ' nT');
      const ex = (B.range() / HX) * VZ;
      setHud('note', narrow ? T('示意：垂直放大約 ', 'Vertical exaggeration ≈ ×') + B.num(ex, 0) + T(' 倍', '')
        : T('示意圖：垂直放大約 ' + B.num(ex, 0) + ' 倍；海床顏色＝磁極性（橘：正向、藍：反向、灰：800 萬年以前）', 'Not to scale: vertical exaggeration ≈ ×' + B.num(ex, 0) + '; seafloor colour = polarity (orange normal, blue reversed, grey older than 8 Myr)'));
    }

    // ---------- 相機 ----------
    let narrow = false;
    function sizeOf(w) { return w < 560 ? 400 : 470; }
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
      const k = camera.aspect < 1.2 ? 1.6 : 1;
      if (kind === 'top') return { pos: new THREE.Vector3(0, -0.01, 17 * k), tgt: new THREE.Vector3(0, 0, -1) };
      if (kind === 'front') return { pos: new THREE.Vector3(0, -17 * k, -0.6), tgt: new THREE.Vector3(0, 0, -0.6) };
      return { pos: new THREE.Vector3(-4 * k, -12.5 * k, 6.5 * k), tgt: new THREE.Vector3(0, 0, -0.8) };
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
      onShow: function () { resize3(); camTo('tilt', false); },
      onTheme: function () {
        C = B.colors();
        Object.keys(hudLast).forEach(function (k) { delete hudLast[k]; });
        blockKey = '';
        update(); render();
      },
      resetCamera: function () { camTo('tilt', true); },
      camTo: function (kind) { camTo(kind, true); },
      dispose: function () {
        api.active = false;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        controls.dispose();
        disposeObject(scene);
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
    camTo('tilt', false);
    return api;
  }

  window.Seafloor3D = { create: create };
})();
