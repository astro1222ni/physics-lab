/*
 * crystal-structures-3d.js — 「晶體結構與堆積」的 3D 立體檢視 CS3D（可旋轉、縮放、點原子看配位）
 *
 * three.js 由 crystal-structures.js 在切換到 3D 時才以 import() 動態載入，再傳進 CS3D.create(lib, host)。
 * 這個檔案只「讀」頁面的模型 host.model()（原子、鄰居、空隙、配位多面體，座標以晶格常數 a 或疊疊看的半徑 r 為單位），
 * 不做任何化學計算；2D 與 3D 畫的是同一個模型。
 * 座標對應：模型 (x, y, z)（z 朝上，六方最密的 c 軸）→ three.js (x, z, −y)（y 朝上）；整體縮放 U 讓模型的外接球半徑約 2.2。
 * 「只看晶胞內的部分」用裁切平面（clipping planes）切掉晶胞外的球，切口補上同色的圓片，看得出角上只剩 1/8、面上 1/2。
 */
(function () {
  'use strict';
  const FIT = 2.2;

  function create(lib, H) {
    const THREE = lib.THREE;
    const T = H.T, host = H.host;

    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('晶體的 3D 立體檢視：晶胞、原子、鄰居與空隙（拖曳旋轉、雙指或滾輪縮放、點原子看它的鄰居）',
      '3D view of the crystal: the unit cell, its atoms, neighbours and holes (drag to rotate, pinch or scroll to zoom, tap an atom to see its neighbours)'));
    canvas.setAttribute('role', 'img');
    host.appendChild(canvas);
    const hudTL = document.createElement('div'), hudTR = document.createElement('div'), hudBL = document.createElement('div');
    hudTL.className = 'r3-hud tl'; hudTR.className = 'r3-hud tr'; hudBL.className = 'r3-hud bl';
    [hudTL, hudTR, hudBL].forEach(function (d) { d.setAttribute('aria-hidden', 'true'); host.appendChild(d); });
    hudBL.textContent = T('拖曳旋轉・滾輪或雙指縮放・點原子看鄰居', 'Drag to rotate · scroll or pinch to zoom · tap an atom');

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: 'default' });
    } catch (e) {
      canvas.remove(); hudTL.remove(); hudTR.remove(); hudBL.remove();
      throw e;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.localClippingEnabled = true;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1.5, 0.1, 200);
    const viewDir = new THREE.Vector3(0.62, 0.42, 1).normalize();
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.minDistance = 3;
    controls.maxDistance = 40;
    controls.enablePan = false;

    const hemi = new THREE.HemisphereLight(0xffffff, 0x7d8590, 1.45);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.9);
    sun.position.set(-5, 9, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -5; sun.shadow.camera.right = 5; sun.shadow.camera.top = 5; sun.shadow.camera.bottom = -5;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 30;
    sun.shadow.radius = 4;
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0xffffff, 0.55);
    rim.position.set(7, 2, -8);
    scene.add(rim);
    // 地面的柔和影子
    const groundMat = new THREE.ShadowMaterial({ opacity: 0.16 });
    const ground = new THREE.Mesh(new THREE.CircleGeometry(6, 48), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    let colors = H.colors();
    let root = new THREE.Group();
    scene.add(root);
    let built = -1, U = 1, pickables = [], tween = null;
    const sphereHi = new THREE.SphereGeometry(1, 32, 22), sphereLo = new THREE.SphereGeometry(1, 20, 14);
    const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true);
    const capGeo = new THREE.CircleGeometry(1, 40);
    const shared = [sphereHi, sphereLo, cylGeo, capGeo];
    let mats = [];
    let textures = [];
    let fracLabels = [];
    let layerLabels = [];   // 疊疊看的層字母：每幀放在鏡頭右側、柱子外面
    let layerR = 0;   // 「只看晶胞內」的比例標籤：只顯示朝向鏡頭那一半的，背面的不透出來

    function W(p) { return new THREE.Vector3(p[0] * U, p[2] * U, -p[1] * U); }
    function Wn(n) { return new THREE.Vector3(n[0], n[2], -n[1]); }

    function mat(color, o) {
      o = o || {};
      const m = new THREE.MeshStandardMaterial({
        color: new THREE.Color(color), roughness: o.rough == null ? 0.38 : o.rough, metalness: o.metal == null ? 0.18 : o.metal,
        transparent: o.opacity != null && o.opacity < 1, opacity: o.opacity == null ? 1 : o.opacity,
        depthWrite: !(o.opacity != null && o.opacity < 1), side: o.side || THREE.FrontSide,
        clippingPlanes: o.clip || null, clipShadows: !!o.clip, emissive: new THREE.Color(o.emissive || 0x000000), emissiveIntensity: o.ei || 1
      });
      mats.push(m);
      return m;
    }
    /** 用 2D 畫布畫文字貼圖（簡體由 settings.js 自動轉換） */
    function textSprite(text, color, px) {
      const c = document.createElement('canvas');
      const g = c.getContext('2d');
      const f = '700 ' + (px || 40) + 'px system-ui, -apple-system, "Segoe UI", "Noto Sans TC", sans-serif';
      g.font = f;
      const w = Math.ceil(g.measureText(text).width) + 24, h = (px || 40) + 22;
      c.width = w; c.height = h;
      g.font = f; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineJoin = 'round'; g.lineWidth = 8;
      g.strokeStyle = colors.dark ? 'rgba(10,14,16,0.88)' : 'rgba(255,255,255,0.92)';
      g.strokeText(text, w / 2, h / 2 + 1);
      g.fillStyle = color; g.fillText(text, w / 2, h / 2 + 1);
      const tex = new THREE.CanvasTexture(c);
      textures.push(tex);
      const sm = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
      mats.push(sm);
      const sp = new THREE.Sprite(sm);
      sp.userData.aspect = w / h;
      sp.renderOrder = 10;
      return sp;
    }

    function clearRoot() {
      scene.remove(root);
      root.traverse(function (o) { if (o.geometry && shared.indexOf(o.geometry) < 0) o.geometry.dispose(); });
      mats.forEach(function (m) { m.dispose(); });
      textures.forEach(function (t) { t.dispose(); });
      mats = []; textures = [];
      root = new THREE.Group();
      scene.add(root);
      pickables = [];
      fracLabels = [];
      layerLabels = [];
    }

    /** 區域的裁切平面（模型座標：n·p ≤ d 在裡面） */
    function regionPlanes(M) {
      const P = [];
      if (M.cell === 'cube') {
        const h = M.n / 2;
        [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].forEach(function (n) { P.push({ n: n, d: h }); });
      } else {
        const ap = M.n * Math.sqrt(3) / 2, hz = M.n * M.ca / 2;
        for (let k = 0; k < 6; k++) { const t = (30 + 60 * k) * Math.PI / 180; P.push({ n: [Math.cos(t), Math.sin(t), 0], d: ap }); }
        P.push({ n: [0, 0, 1], d: hz }); P.push({ n: [0, 0, -1], d: hz });
      }
      return P;
    }
    function toThreePlanes(P, eps) {
      return P.map(function (q) { return new THREE.Plane(Wn(q.n).negate(), q.d * U + (eps || 0)); });
    }
    function boxLines(M) {
      const pts = [];
      const add = function (a, b) { pts.push(W(a), W(b)); };
      if (M.cell === 'cube') {
        const h = M.n / 2;
        for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) {
          const x = i ^ j;
          if (x !== 1 && x !== 2 && x !== 4) continue;
          const pa = [(i & 1 ? h : -h), (i & 2 ? h : -h), (i & 4 ? h : -h)], pb = [(j & 1 ? h : -h), (j & 2 ? h : -h), (j & 4 ? h : -h)];
          add(pa, pb);
        }
      } else {
        const R = M.n, hz = M.n * M.ca / 2;
        for (let k = 0; k < 6; k++) {
          const t0 = k * Math.PI / 3, t1 = (k + 1) * Math.PI / 3;
          add([R * Math.cos(t0), R * Math.sin(t0), -hz], [R * Math.cos(t1), R * Math.sin(t1), -hz]);
          add([R * Math.cos(t0), R * Math.sin(t0), hz], [R * Math.cos(t1), R * Math.sin(t1), hz]);
          add([R * Math.cos(t0), R * Math.sin(t0), -hz], [R * Math.cos(t0), R * Math.sin(t0), hz]);
        }
      }
      return pts;
    }
    function innerLines(M) {
      // 2×2×2、3×3×3 時，每個晶胞的分界線（淡）
      const pts = [];
      if (M.cell !== 'cube' || M.n < 2) return pts;
      const h = M.n / 2;
      for (let i = 0; i <= M.n; i++) for (let j = 0; j <= M.n; j++) {
        const a = -h + i, b = -h + j;
        pts.push(W([a, b, -h]), W([a, b, h]));
        pts.push(W([a, -h, b]), W([a, h, b]));
        pts.push(W([-h, a, b]), W([h, a, b]));
      }
      return pts;
    }

    function build() {
      const M = H.model();
      if (!M) return;
      clearRoot();
      built = M.ver;
      U = FIT / Math.max(0.8, M.bound);
      const geo = M.atoms.length > 140 ? sphereLo : sphereHi;
      const focus = M.sel >= 0;
      const isCell = M.kind === 'cell';
      const metal = isCell && M.cr && M.cr.r != null && M.cr.rc == null;
      const planes = isCell && M.cut ? regionPlanes(M) : null;
      const clip = planes ? toThreePlanes(planes, 1e-4) : null;
      const matCache = {};
      const atomMat = function (color, opacity, emissive, noClip) {
        const key = color + '|' + opacity + '|' + (emissive || '') + '|' + (noClip ? 1 : 0);
        if (!matCache[key]) matCache[key] = mat(color, { opacity: opacity, metal: metal ? 0.35 : 0.08, rough: metal ? 0.3 : 0.42, clip: noClip ? null : clip, emissive: emissive, ei: 0.35 });
        return matCache[key];
      };
      // 原子
      M.atoms.forEach(function (a, i) {
        let op = 1;
        if (focus && !a.sel && !a.nb) op = 0.14;
        else if (M.see) op = 0.32;   // 顯示空隙時原子變半透明，才看得到裡面的洞
        const m = atomMat(a.color, op, a.sel ? colors.accent : null);
        const mesh = new THREE.Mesh(geo, m);
        mesh.position.copy(W(a.p));
        mesh.scale.setScalar(Math.max(0.01, a.r * U));
        mesh.castShadow = op === 1;
        mesh.userData.idx = i;
        if (op < 1) mesh.renderOrder = 3;
        root.add(mesh);
        if (isCell) pickables.push(mesh);
      });
      // 切口的圓片
      if (planes) {
        const capClip = toThreePlanes(planes, 2e-3 * U);
        const capCache = {};
        M.atoms.forEach(function (a) {
          if (focus && !a.sel && !a.nb) return;
          planes.forEach(function (q) {
            const dist = q.d - (q.n[0] * a.p[0] + q.n[1] * a.p[1] + q.n[2] * a.p[2]);
            if (Math.abs(dist) >= a.r - 1e-6) return;
            const rr = Math.sqrt(a.r * a.r - dist * dist);
            const key = a.color;
            if (!capCache[key]) capCache[key] = mat(new THREE.Color(a.color).multiplyScalar(0.82).getStyle(), { side: THREE.DoubleSide, clip: capClip, metal: 0.05, rough: 0.6 });
            const cap = new THREE.Mesh(capGeo, capCache[key]);
            const c = [a.p[0] + q.n[0] * (dist - 1e-3), a.p[1] + q.n[1] * (dist - 1e-3), a.p[2] + q.n[2] * (dist - 1e-3)];
            cap.position.copy(W(c));
            cap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), Wn(q.n));
            cap.scale.setScalar(rr * U);
            root.add(cap);
          });
        });
      }
      // 鄰近晶胞的鄰居（半透明）
      M.ghosts.forEach(function (a) {
        const mesh = new THREE.Mesh(geo, atomMat(a.color, 0.55, null, true));
        mesh.position.copy(W(a.p));
        mesh.scale.setScalar(Math.max(0.01, a.r * U));
        mesh.renderOrder = 4;
        root.add(mesh);
      });
      // 配位：鍵與多面體
      if (focus) {
        const A = W(M.atoms[M.sel].p);
        const bm = mat(colors.accent, { metal: 0.1, rough: 0.35, emissive: colors.accent, ei: 0.25 });
        M.bonds.forEach(function (b) {
          const B = W(b[1]);
          const len = A.distanceTo(B);
          const cyl = new THREE.Mesh(cylGeo, bm);
          cyl.position.copy(A).add(B).multiplyScalar(0.5);
          cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
          cyl.scale.set(0.035 * FIT / 2.2, len, 0.035 * FIT / 2.2);
          cyl.renderOrder = 5;
          root.add(cyl);
        });
        if (M.poly && M.poly.faces.length) {
          const pos = [];
          M.poly.faces.forEach(function (f) {
            for (let k = 1; k < f.idx.length - 1; k++) {
              [f.idx[0], f.idx[k], f.idx[k + 1]].forEach(function (j) { const v = W(M.poly.pts[j]); pos.push(v.x, v.y, v.z); });
            }
          });
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
          g.computeVertexNormals();
          const pm = new THREE.MeshBasicMaterial({ color: new THREE.Color(colors.accent), transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false });
          mats.push(pm);
          const poly = new THREE.Mesh(g, pm);
          poly.renderOrder = 6;
          root.add(poly);
          const epos = [];
          M.poly.faces.forEach(function (f) {
            for (let k = 0; k < f.idx.length; k++) {
              const a = W(M.poly.pts[f.idx[k]]), b = W(M.poly.pts[f.idx[(k + 1) % f.idx.length]]);
              epos.push(a.x, a.y, a.z, b.x, b.y, b.z);
            }
          });
          const eg = new THREE.BufferGeometry();
          eg.setAttribute('position', new THREE.Float32BufferAttribute(epos, 3));
          const lm = new THREE.LineBasicMaterial({ color: new THREE.Color(colors.accent), transparent: true, opacity: 0.75, depthWrite: false });
          mats.push(lm);
          const lines = new THREE.LineSegments(eg, lm);
          lines.renderOrder = 7;
          root.add(lines);
        }
      }
      // 空隙
      M.voids.forEach(function (v) {
        const m = atomMat(v.color, 1, v.color);
        const mesh = new THREE.Mesh(sphereLo, m);
        mesh.position.copy(W(v.p));
        mesh.scale.setScalar(Math.max(0.01, v.r * U));
        mesh.castShadow = true;
        root.add(mesh);
      });
      // 晶胞的稜
      if (isCell) {
        const lg = new THREE.BufferGeometry().setFromPoints(boxLines(M));
        const lm = new THREE.LineBasicMaterial({ color: new THREE.Color(colors.text), transparent: true, opacity: 0.7 });
        mats.push(lm);
        root.add(new THREE.LineSegments(lg, lm));
        const inner = innerLines(M);
        if (inner.length) {
          const ig = new THREE.BufferGeometry().setFromPoints(inner);
          const im = new THREE.LineBasicMaterial({ color: new THREE.Color(colors.text), transparent: true, opacity: 0.18 });
          mats.push(im);
          root.add(new THREE.LineSegments(ig, im));
        }
        // 只看晶胞內：1 個晶胞時標出每個原子在晶胞內的比例
        if (M.cut && M.n === 1 && !focus) {
          const FR = function (f) { return f === 1 ? '1' : f === 0.5 ? '1/2' : f === 0.25 ? '1/4' : f === 0.125 ? '1/8' : Math.abs(f - 1 / 6) < 1e-9 ? '1/6' : Math.abs(f - 1 / 3) < 1e-9 ? '1/3' : f.toFixed(2); };
          M.atoms.forEach(function (a) {
            const sp = textSprite(FR(a.frac), a.frac === 1 ? colors.probe : colors.text, 40);
            // 標籤往晶胞中心挪一點，落在看得到的那一塊上
            const p = a.p.slice(), L = Math.hypot(p[0], p[1], p[2]) || 1, sh = Math.min(a.r * 0.55, L);
            const q = [p[0] - p[0] / L * sh, p[1] - p[1] / L * sh, p[2] - p[2] / L * sh];
            sp.position.copy(W(q));
            const hgt = 0.22 * FIT / 2.2;
            sp.scale.set(hgt * sp.userData.aspect, hgt, 1);
            sp.userData.anchor = W(a.p);
            fracLabels.push(sp);
            root.add(sp);
          });
        }
      } else {
        // 疊疊看：每一層旁邊標字母
        const seq = M.seq;
        const seen = {};
        M.atoms.forEach(function (a) {
          if (seen[a.li]) return;
          seen[a.li] = true;
          const sp = textSprite(seq[a.li], colors.L[a.layer], 44);
          sp.position.copy(W([-(M.RP + 1.8), 0, a.p[2]]));
          sp.userData.y = a.p[2] * U;
          const hgt = 0.3;
          sp.scale.set(hgt * sp.userData.aspect, hgt, 1);
          layerLabels.push(sp);
          root.add(sp);
        });
        layerR = (M.RP + 1.9) * U;
      }
      // 地面放在最下方
      let ymin = Infinity;
      M.atoms.concat(M.ghosts).forEach(function (a) { ymin = Math.min(ymin, (a.p[2] - a.R) * U); });
      ground.position.y = (isFinite(ymin) ? ymin : -FIT) - 0.12;
      const hd = H.hud();
      hudTL.textContent = hd.tl; hudTR.textContent = hd.tr;
    }

    function applyColors() {
      colors = H.colors();
      groundMat.opacity = colors.dark ? 0.3 : 0.16;
      hemi.intensity = colors.dark ? 1.25 : 1.45;
    }

    function fit(force) {
      const dist = (FIT * 1.35) / Math.tan(camera.fov * Math.PI / 360) / Math.min(1.2, Math.max(0.75, camera.aspect));
      if (force) {
        controls.target.set(0, 0, 0);
        camera.up.set(0, 1, 0);
        camera.position.copy(viewDir).multiplyScalar(dist);
      }
      camera.updateProjectionMatrix();
      controls.update();
    }
    let vw = 0, raf = 0;
    function canvasHeight(w) { return w < 640 ? Math.round(Math.max(340, Math.min(480, w * 1.05))) : 460; }
    function resize3() {
      const w = host.clientWidth;
      if (!w) return;
      const h = canvasHeight(w);
      canvas.style.height = h + 'px';
      vw = w;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      fit(false);
      requestRender();
    }
    function renderNow() {
      if (!api.active || document.hidden) return;
      const M = H.model();
      if (M && M.ver !== built) build();
      let moving = controls.update();
      if (tween) {
        const u = Math.min(1, (performance.now() - tween.t0) / tween.dur);
        const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
        camera.position.copy(tween.from).lerp(tween.to, e);
        camera.lookAt(controls.target);
        if (u >= 1) tween = null;
        moving = true;
      }
      if (layerLabels.length) {
        camera.updateMatrixWorld();
        const rt = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
        rt.y = 0;
        if (rt.lengthSq() < 1e-6) rt.set(1, 0, 0);
        rt.normalize().multiplyScalar(layerR);
        layerLabels.forEach(function (sp) { sp.position.set(rt.x, sp.userData.y, rt.z); });
      }
      if (fracLabels.length) {
        const cd = camera.position.clone().sub(controls.target).normalize();
        fracLabels.forEach(function (sp) { sp.visible = sp.userData.anchor.dot(cd) >= -0.02 * U; });
      }
      renderer.render(scene, camera);
      if (moving) requestRender();
    }
    function requestRender() {
      if (raf || !api.active) return;
      raf = requestAnimationFrame(function () { raf = 0; renderNow(); });
    }
    const ro = window.ResizeObserver ? new ResizeObserver(function () { if (host.clientWidth !== vw) resize3(); }) : null;
    if (ro) ro.observe(host); else window.addEventListener('resize', resize3);
    controls.addEventListener('change', requestRender);
    const onVisible = function () { if (!document.hidden) requestRender(); };
    document.addEventListener('visibilitychange', onVisible);
    canvas.addEventListener('webglcontextlost', function (ev) {
      ev.preventDefault();
      if (api.active) H.contextLost();
    });
    // 點原子
    const ray = new THREE.Raycaster(), mv = new THREE.Vector2();
    let down = null;
    canvas.addEventListener('pointerdown', function (ev) { down = { x: ev.clientX, y: ev.clientY }; });
    canvas.addEventListener('pointerup', function (ev) {
      if (!down) return;
      const moved = Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 6;
      down = null;
      if (moved || !pickables.length) return;
      const b = canvas.getBoundingClientRect();
      mv.set((ev.clientX - b.left) / b.width * 2 - 1, -(ev.clientY - b.top) / b.height * 2 + 1);
      ray.setFromCamera(mv, camera);
      const hits = ray.intersectObjects(pickables, false).filter(function (h) { return !h.object.material.transparent; });
      if (hits.length) H.pick(hits[0].object.userData.idx);
    });

    const api = {
      active: true,
      update: function () { requestRender(); },
      frame: function () { requestRender(); },
      onTheme: function () { applyColors(); built = -1; requestRender(); },
      resetCamera: function () { tween = null; fit(true); requestRender(); },
      lookAlong: function () {
        const M = H.model();
        if (!M) return;
        const ax = Wn(M.axis).normalize();
        const dist = camera.position.distanceTo(controls.target);
        const to = ax.clone().multiplyScalar(dist);
        // 視線剛好對準 y 軸時，加一點點傾斜，避免 OrbitControls 在極點卡住
        if (Math.abs(ax.y) > 0.999) to.add(new THREE.Vector3(0, 0, dist * 0.02));
        if (H.reduced) { camera.position.copy(to); camera.lookAt(controls.target); controls.update(); requestRender(); return; }
        tween = { from: camera.position.clone(), to: to, t0: performance.now(), dur: 700 };
        requestRender();
      },
      dispose: function () {
        api.active = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        document.removeEventListener('visibilitychange', onVisible);
        controls.dispose();
        clearRoot();
        shared.forEach(function (g) { g.dispose(); });
        ground.geometry.dispose(); groundMat.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        canvas.remove(); hudTL.remove(); hudTR.remove(); hudBL.remove();
      }
    };

    applyColors();
    const w0 = host.clientWidth;
    if (w0) {
      const h0 = canvasHeight(w0);
      canvas.style.height = h0 + 'px';
      vw = w0;
      renderer.setSize(w0, h0, false);
      camera.aspect = w0 / h0;
    }
    fit(true);
    return api;
  }

  window.CS3D = { create: create };
})();
