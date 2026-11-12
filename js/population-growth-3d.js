/*
 * population-growth-3d.js — 「族群成長」第二部分（兩個物種）的 3D 立體檢視（three.js）
 *
 * 由 js/population-growth.js 在使用者按「3D 立體」時才載入（three.js 也是那時才以 import() 載入）；切回 2D 時整個釋放。
 * 用法：window.PG3D.create({ THREE, OrbitControls }, 容器, bridge) → { active, frame, onShow, onTheme, resetCamera, rebuild, busy, dispose }
 *
 * 畫的是 2D 畫面同一次模擬（bridge.run().sim）在 (時間, 物種 1, 物種 2) 空間中的軌跡：
 *   往右是時間 t；往前是獵物（物種 1）；往上是掠食者（物種 2）。
 *   地板上的影子＝獵物隨時間的曲線，後牆上的影子＝掠食者隨時間的曲線，左牆上的影子＝相平面。
 *   掠食者–獵物的循環因此變成一條沿著時間前進的螺旋；有負荷量時螺旋越繞越小，收斂到平衡點的那條直線。
 */
(function () {
  'use strict';
  const FONT = 'system-ui, -apple-system, "Segoe UI", "Noto Sans TC", "PingFang TC", sans-serif';
  const RES = 3;
  const L = 10;        // 時間軸長度（場景單位）
  const S = 4;         // 兩個族群軸的長度
  const NSEG = 640;    // 軌跡管沿時間的段數
  const RADS = 10;     // 軌跡管圓周的段數

  function create(lib, host, B) {
    const THREE = lib.THREE;
    const T = B.T, D = B.D;
    let C = B.colors();

    // ---------- 畫布、HUD ----------
    const wrap = document.createElement('div');
    wrap.className = 'pg3-wrap';
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('兩個族群在「時間、物種 1、物種 2」空間中的 3D 軌跡；地板、後面、左面是三個方向的投影（可拖曳旋轉、縮放）', '3D path of the two populations in time–species 1–species 2 space, with its shadows on the floor, back wall and left wall (drag to rotate, pinch or scroll to zoom)'));
    wrap.appendChild(canvas);
    const hud = document.createElement('div');
    hud.className = 'pg3-hud';
    hud.setAttribute('aria-hidden', 'true');
    hud.innerHTML = '<div class="tl"><span data-k="t"></span><span class="m" data-k="v"></span></div><div class="br"><span class="m" data-k="note"></span></div>';
    wrap.appendChild(hud);
    host.appendChild(wrap);
    const hudEl = {};
    hud.querySelectorAll('[data-k]').forEach(function (e) { hudEl[e.getAttribute('data-k')] = e; });
    const hudLast = {};
    function setHud(k, s) { if (hudLast[k] !== s) { hudLast[k] = s; hudEl[k].textContent = s; } }

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
    const camera = new THREE.PerspectiveCamera(38, 1.5, 0.05, 200);
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.rotateSpeed = 0.85;
    controls.enablePan = false;
    controls.minDistance = 3;
    controls.maxDistance = 45;
    controls.maxPolarAngle = Math.PI * 0.55;

    const hemi = new THREE.HemisphereLight(0xffffff, 0x556070, 0.95);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 2.0);
    key.position.set(-2, 10, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const sc = key.shadow.camera;
    sc.left = -7; sc.right = 7; sc.top = 5; sc.bottom = -5; sc.near = 1; sc.far = 30;
    key.shadow.bias = -0.0005;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xffffff, 0.5);
    rim.position.set(5, 3, -6);
    scene.add(rim);

    function isDark() { return !!D.dark; }
    function col(s) { return new THREE.Color(s); }
    function disposeObject(obj) {
      obj.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
            if (m.map) m.map.dispose();
            m.dispose();
          });
        }
      });
    }

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
    function label(text, color, small) {
      const size = (small ? 10.5 : 12) * RES;
      const f = (small ? '600 ' : '700 ') + size + 'px ' + FONT;
      const c = document.createElement('canvas');
      let g = c.getContext('2d');
      g.font = f;
      const tw = g.measureText(text).width;
      const padX = 6 * RES, padY = 2 * RES;
      c.width = Math.ceil(tw + 2 * padX);
      c.height = Math.ceil(size * 1.3 + 2 * padY);
      g = c.getContext('2d');
      roundRect(g, RES * 0.5, RES * 0.5, c.width - RES, c.height - RES, (c.height - RES) / 2);
      g.fillStyle = D.alpha(D.c['canvas-bg'], isDark() ? 0.85 : 0.9);
      g.fill();
      g.strokeStyle = D.alpha(color, 0.5);
      g.lineWidth = RES;
      g.stroke();
      g.font = f;
      g.textBaseline = 'middle';
      g.fillStyle = color;
      g.fillText(text, padX, c.height / 2 + RES * 0.5);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false }));
      sp.userData = { lw: c.width / RES, lh: c.height / RES };
      sp.renderOrder = 30;
      fitLabel(sp);
      return sp;
    }
    function fitLabel(sp) {
      const k = 2 * Math.tan(camera.fov * Math.PI / 360) / Math.max(1, ch);
      sp.scale.set(sp.userData.lw * k, sp.userData.lh * k, 1);
    }

    // ---------- 座標 ----------
    const world = new THREE.Group();
    scene.add(world);
    let run = null, builtId = -1, builtVer = -1;
    let frame = null, tube = null, tubeMat = null, projF = null, projB = null, projL = null, eqLine = null, head = null, heads = [];
    function X(t) { return run ? t / run.tEnd * L - L / 2 : 0; }
    function Zp(x) { return run ? x / run.xM * S - S / 2 : 0; }     // 獵物（物種 1）：往前
    function Yp(y) { return run ? y / run.yM * S : 0; }              // 掠食者（物種 2）：往上

    /** 依時間（而不是弧長）取點的曲線，讓軌跡管的第 i 段剛好對應第 i 個時間點，可用 drawRange 逐段顯示 */
    class TimeCurve extends THREE.Curve {
      constructor(sim) { super(); this.sim = sim; }
      getPoint(u, target) {
        const s = this.sim, n = s.t.length - 1;
        const f = Math.max(0, Math.min(1, u)) * n, i = Math.min(n - 1, Math.floor(f)), w = f - i;
        const t = s.t[i] + (s.t[i + 1] - s.t[i]) * w, x = s.x[i] + (s.x[i + 1] - s.x[i]) * w, y = s.y[i] + (s.y[i + 1] - s.y[i]) * w;
        return (target || new THREE.Vector3()).set(X(t), Yp(y), Zp(x));
      }
      getPointAt(u, target) { return this.getPoint(u, target); }
      getTangentAt(u, target) { return this.getTangent(u, target); }
    }

    function lineOf(pts, color, opacity, dashed) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const m = dashed
        ? new THREE.LineDashedMaterial({ color: col(color), dashSize: 0.18, gapSize: 0.12, transparent: true, opacity: opacity })
        : new THREE.LineBasicMaterial({ color: col(color), transparent: true, opacity: opacity });
      const l = new THREE.Line(g, m);
      if (dashed) l.computeLineDistances();
      return l;
    }
    function niceStep(span, target) {
      const raw = span / target, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
      return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
    }

    // 地板、後牆、左牆與刻度
    function buildFrame() {
      if (frame) { world.remove(frame); disposeObject(frame); }
      frame = new THREE.Group();
      const nm = B.names();
      const shadow = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), new THREE.ShadowMaterial({ opacity: isDark() ? 0.45 : 0.15 }));
      shadow.rotation.x = -Math.PI / 2; shadow.position.y = -0.002; shadow.receiveShadow = true;
      frame.add(shadow);
      const wallMat = new THREE.MeshStandardMaterial({ color: col(D.c.surface || '#ffffff'), roughness: 0.95, transparent: true, opacity: isDark() ? 0.18 : 0.35, side: THREE.DoubleSide, depthWrite: false });
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(L, S), wallMat);
      floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, 0); floor.receiveShadow = true;
      frame.add(floor);
      const back = new THREE.Mesh(new THREE.PlaneGeometry(L, S), wallMat);
      back.position.set(0, S / 2, -S / 2);
      frame.add(back);
      const left = new THREE.Mesh(new THREE.PlaneGeometry(S, S), wallMat);
      left.rotation.y = Math.PI / 2; left.position.set(-L / 2, S / 2, 0);
      frame.add(left);
      // 格線
      const g = [];
      const ts = niceStep(run.tEnd, 6);
      for (let t = 0; t <= run.tEnd + 1e-9; t += ts) { const x = X(t); g.push(x, 0.001, -S / 2, x, 0.001, S / 2, x, 0, -S / 2 + 0.001, x, S, -S / 2 + 0.001); }
      for (let k = 0; k <= 4; k++) {
        const v = k / 4 * S;
        g.push(-L / 2, 0.001, v - S / 2, L / 2, 0.001, v - S / 2);           // 地板：獵物刻度
        g.push(-L / 2, v, -S / 2 + 0.001, L / 2, v, -S / 2 + 0.001);         // 後牆：掠食者刻度
        g.push(-L / 2 + 0.001, v, -S / 2, -L / 2 + 0.001, v, S / 2);         // 左牆
        g.push(-L / 2 + 0.001, 0, v - S / 2, -L / 2 + 0.001, S, v - S / 2);
      }
      const gg = new THREE.BufferGeometry();
      gg.setAttribute('position', new THREE.Float32BufferAttribute(g, 3));
      frame.add(new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: col(D.c.text), transparent: true, opacity: isDark() ? 0.12 : 0.1 })));
      // 刻度數字與軸名
      const tStep = ts * (L * ts / run.tEnd < (narrow ? 1.6 : 1.2) ? 2 : 1);
      for (let t = tStep; t <= run.tEnd + 1e-9; t += tStep) {
        const sp = label(B.num(t, 0), D.c.muted, true); sp.position.set(X(t), 0, S / 2 + 0.35); frame.add(sp);
      }
      const tl = label(T('時間（天）', 'Time (days)'), D.c.text); tl.position.set(L / 2 + 0.2, 0, S / 2 + 0.85); frame.add(tl);
      // 獵物軸：左前方的地板邊；掠食者軸：左後方的垂直邊（兩個都在左牆的相平面上）
      const xl = label(nm.x + ' ' + B.fmtN(run.xM), nm.cx); xl.position.set(-L / 2 - 0.2, 0, S / 2 + 0.3); frame.add(xl);
      const yl = label(nm.y + ' ' + B.fmtN(run.yM), nm.cy); yl.position.set(-L / 2, S + 0.3, -S / 2); frame.add(yl);
      const zl = label('0', D.c.muted, true); zl.position.set(-L / 2 - 0.25, 0, -S / 2 - 0.2); frame.add(zl);
      world.add(frame);
    }

    function clearTraj() {
      [tube, projF, projB, projL, eqLine, head].concat(heads).forEach(function (o) { if (o) { world.remove(o); disposeObject(o); } });
      tube = projF = projB = projL = eqLine = head = null; heads = [];
    }
    function build() {
      run = B.run();
      if (!run) return;
      builtId = run.id; builtVer = D.ver;
      clearTraj();
      buildFrame();
      const s = run.sim, nm = B.names();
      // 軌跡管
      const path = new TimeCurve(s);
      const geo = new THREE.TubeGeometry(path, NSEG, 0.055, RADS, false);
      tubeMat = new THREE.MeshStandardMaterial({ color: col(C['pg-n']), roughness: 0.4, metalness: 0.05, transparent: true, opacity: 1 });
      tube = new THREE.Mesh(geo, tubeMat);
      tube.castShadow = true;
      world.add(tube);
      // 三個投影
      const n = s.t.length;
      const pf = [], pb = [], pl = [];
      for (let i = 0; i < n; i++) {
        const x = X(s.t[i]);
        pf.push(x, 0.004, Zp(s.x[i]));
        pb.push(x, Yp(s.y[i]), -S / 2 + 0.004);
        pl.push(-L / 2 + 0.004, Yp(s.y[i]), Zp(s.x[i]));
      }
      projF = lineOf(pf, nm.cx, 0.9); world.add(projF);
      projB = lineOf(pb, nm.cy, 0.9); world.add(projB);
      projL = lineOf(pl, C['pg-n'], 0.75); world.add(projL);
      // 平衡點：沿著時間的一條虛線
      const eq = run.mode === 'pp' ? (run.eq.coexist ? run.eq : null) : (run.eq && run.eq.x > 0 && run.eq.y > 0 ? run.eq : null);
      if (eq && eq.x <= run.xM && eq.y <= run.yM) {
        eqLine = lineOf([-L / 2, Yp(eq.y), Zp(eq.x), L / 2, Yp(eq.y), Zp(eq.x)], C['pg-eq'], 0.9, true);
        world.add(eqLine);
      }
      // 目前位置
      head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 16), new THREE.MeshStandardMaterial({ color: col(C['pg-n']), roughness: 0.3, emissive: col(C['pg-n']), emissiveIntensity: isDark() ? 0.35 : 0.12 }));
      head.castShadow = true;
      world.add(head);
      [nm.cx, nm.cy, C['pg-n']].forEach(function (c) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), new THREE.MeshBasicMaterial({ color: col(c) }));
        heads.push(m); world.add(m);
      });
    }

    function update() {
      const r = B.run();
      if (!r) return;
      if (r.id !== builtId || r !== run || D.ver !== builtVer) build();
      const s = run.sim, n = s.t.length - 1;
      const tH = run.preview ? run.tEnd : run.head, frac = Math.max(0, Math.min(1, tH / run.tEnd));
      const seg = Math.round(frac * NSEG);
      tube.geometry.setDrawRange(0, seg * RADS * 6);
      tubeMat.opacity = run.preview ? 0.35 : 1;
      const cnt = Math.max(1, Math.round(frac * n) + 1);
      [projF, projB, projL].forEach(function (l) { l.geometry.setDrawRange(0, cnt); });
      const i = Math.min(n, Math.round(frac * n));
      const x = X(s.t[i]), py = Yp(s.y[i]), pz = Zp(s.x[i]);
      head.position.set(x, py, pz);
      head.visible = !run.preview;
      heads[0].position.set(x, 0.01, pz); heads[1].position.set(x, py, -S / 2 + 0.01); heads[2].position.set(-L / 2 + 0.01, py, pz);
      heads.forEach(function (h) { h.visible = !run.preview; });
      const nm = B.names();
      setHud('t', run.preview ? T('按「開始」看軌跡沿著時間前進', 'Press “Run” to send the path along in time') : T('第 ', 'Day ') + B.num(s.t[i], 1) + T(' 天', ''));
      setHud('v', nm.x + ' ' + B.fmtN(s.x[i]) + T('，', ', ') + nm.y + ' ' + B.fmtN(s.y[i]));
      setHud('note', T('地板：' + nm.x + '；後面：' + nm.y + '；左面：相平面', 'Floor: ' + nm.x + '; back wall: ' + nm.y + '; left wall: phase plane'));
    }

    // ---------- 相機 ----------
    let lastAspect = 0, narrow = false;
    function sizeOf(w) { return w < 560 ? Math.round(Math.max(380, Math.min(460, w * 1.15))) : 440; }
    function resetCamera() {
      const hf = 2 * Math.atan(Math.tan(camera.fov * Math.PI / 360) * camera.aspect);
      const dist = narrow ? Math.max(9, (L / 2 + 1.1) / Math.tan(hf / 2)) : Math.max(10, (L / 2 + 2.2) / Math.tan(hf / 2));
      const el = (narrow ? 20 : 22) * Math.PI / 180, az = (narrow ? 34 : 28) * Math.PI / 180;
      const tx = narrow ? -0.5 : 0;
      controls.target.set(tx, S * 0.4, 0.4);
      camera.position.set(tx + Math.sin(az) * Math.cos(el) * dist, S * 0.4 + Math.sin(el) * dist, 0.4 + Math.cos(az) * Math.cos(el) * dist);
      controls.update();
    }
    let raf = 0, moving = false;
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
      if (narrow !== (w < 560)) { narrow = w < 560; builtId = -1; }
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      scene.traverse(function (o) { if (o.isSprite) fitLabel(o); });
      if (Math.abs(camera.aspect - lastAspect) > 1e-3) {
        const first = !lastAspect;
        lastAspect = camera.aspect;
        if (first) resetCamera();
      }
      update();
      renderNow();
    }
    const ro = window.ResizeObserver ? new ResizeObserver(function () { resize3(); }) : null;
    if (ro) ro.observe(wrap); else window.addEventListener('resize', resize3);
    controls.addEventListener('change', requestRender);
    canvas.addEventListener('webglcontextlost', function (ev) {
      ev.preventDefault();
      if (!api.active) return;
      if (B.onContextLost) B.onContextLost();
    });

    const api = {
      active: true,
      frame: function () { update(); renderNow(); },
      busy: function () { return moving; },
      onShow: function () { lastAspect = 0; resize3(); },
      onTheme: function () {
        C = B.colors();
        builtId = -1;
        Object.keys(hudLast).forEach(function (k) { delete hudLast[k]; });
        update();
        requestRender();
      },
      rebuild: function () { builtId = -1; update(); requestRender(); },
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

    // 初始化
    const w0 = wrap.clientWidth;
    if (w0) {
      ch = sizeOf(w0); narrow = w0 < 560;
      canvas.style.height = ch + 'px';
      renderer.setSize(w0, ch, false);
      camera.aspect = w0 / ch;
      camera.updateProjectionMatrix();
      lastAspect = camera.aspect;
    }
    resetCamera();
    update();
    renderNow();
    return api;
  }

  window.PG3D = { create: create };
})();
