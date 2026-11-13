/*
 * drum-modes-3d.js — 「鼓與板的振動模態」的 3D 立體檢視
 *
 * 這個檔案本身不依賴 three.js：使用者第一次按「3D 立體」時，drum-modes.js 才載入這個檔案與 vendor/three/，
 * 再呼叫 DrumModes3D.create(lib, env) 建立場景；切回 2D 時 dispose() 釋放全部資源。
 *
 * 畫面上的起伏全部來自 env.snapshot()（與 2D 同一套係數）：每個模態此刻的係數 coef[key] × 模態形狀（DrumCore.modeValue）。
 * 場景座標（cm）：鼓面在 z = 0 的平面上，z 朝上。鼓的半徑、板的邊長依真實比例；起伏的高度放大示意（畫面上有註明）。
 */
(function () {
  'use strict';
  const NR = 44, NT = 120;   // 圓形鼓面：半徑方向 × 圓周方向的格數
  const NS = 72;             // 方板：每邊格數
  const AMP = 0.16;          // 形狀函數的最大值對應「半徑（或半邊長）× 0.16」的高度（放大示意）

  function create(lib, env) {
    const THREE = lib.THREE, C = env.C, T = env.T, host = env.host;

    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('鼓面的 3D 立體檢視：振動中的鼓皮或金屬板、鼓身與敲擊點（可拖曳旋轉、雙指或滾輪縮放）',
      '3D view of the vibrating drumhead or metal plate, the drum body and the striking point (drag to rotate, pinch or scroll to zoom)'));
    canvas.tabIndex = 0;
    host.appendChild(canvas);
    const layer = document.createElement('div');
    layer.className = 'dm3-labels';
    layer.setAttribute('aria-hidden', 'true');
    host.appendChild(layer);
    const note = document.createElement('div');
    note.className = 'dm3-lbl note';
    note.style.left = '8px'; note.style.top = 'auto'; note.style.bottom = '6px';
    layer.appendChild(note);
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    } catch (e) {
      canvas.remove(); layer.remove();
      throw e;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 1, 3000);
    camera.up.set(0, 0, 1);
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.minDistance = 10;
    controls.maxDistance = 600;
    controls.maxPolarAngle = Math.PI * 0.8;

    // ---------- 顏色 ----------
    const pal = {};
    function readPalette() {
      const cs = getComputedStyle(document.documentElement);
      ['dm-up', 'dm-down', 'dm-skin', 'dm-node', 'dm-strike', 'dm-rim', 'dm-copper', 'dm-shell', 'dm-plate', 'dm-felt', 'text', 'canvas-bg']
        .forEach(function (k) { pal[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
      const bg = new THREE.Color(pal['canvas-bg']);
      pal.dark = (bg.r + bg.g + bg.b) / 3 < 0.35;
    }
    const col = function (v) { return new THREE.Color(v); };

    // ---------- 燈光、地面、環境反射 ----------
    const hemi = new THREE.HemisphereLight(0xffffff, 0x5b524a, 1.1);
    hemi.position.set(0, 0, 1);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    scene.add(sun); scene.add(sun.target);
    const rimL = new THREE.DirectionalLight(0xfff1dc, 0.8);
    scene.add(rimL);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.ShadowMaterial({ opacity: 0.2, depthWrite: false }));
    ground.receiveShadow = true;
    scene.add(ground);
    let envTex = null;
    function buildEnvironment() {
      if (envTex) { envTex.dispose(); envTex = null; }
      const es = new THREE.Scene();
      const geo = new THREE.SphereGeometry(100, 32, 16);
      const cols = [], pos = geo.attributes.position, c = new THREE.Color();
      const top = col(pal.dark ? '#4a535c' : '#f4f6f8'), mid = col(pal.dark ? '#22282d' : '#b9bfc4'), bot = col(pal.dark ? '#0d1013' : '#6b6560');
      for (let i = 0; i < pos.count; i++) {
        const u = pos.getY(i) / 100;
        if (u > 0) c.copy(mid).lerp(top, u); else c.copy(mid).lerp(bot, -u);
        cols.push(c.r, c.g, c.b);
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      const sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide }));
      sky.rotation.x = Math.PI / 2;
      es.add(sky);
      const pmrem = new THREE.PMREMGenerator(renderer);
      envTex = pmrem.fromScene(es, 0.02).texture;
      pmrem.dispose(); geo.dispose(); sky.material.dispose();
      scene.environment = envTex;
    }

    // ---------- 材質 ----------
    const M = {
      skin: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0, side: THREE.DoubleSide }),
      metalSkin: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.55, side: THREE.DoubleSide }),
      rim: new THREE.MeshStandardMaterial({ roughness: 0.25, metalness: 0.9 }),
      shell: new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.1 }),
      copper: new THREE.MeshStandardMaterial({ roughness: 0.28, metalness: 0.85, side: THREE.DoubleSide }),
      leg: new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.8 }),
      node: new THREE.LineBasicMaterial({ transparent: true, opacity: 0.95, depthTest: false }),
      strike: new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.1, emissive: 0x000000 }),
      felt: new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 }),
      stick: new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0, color: 0x9a6a3c }),
      ring: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide })
    };
    function applyColors() {
      readPalette();
      M.rim.color.set(pal['dm-rim']);
      M.shell.color.set(pal['dm-shell']);
      M.copper.color.set(pal['dm-copper']);
      M.leg.color.set(pal['dm-rim']);
      M.node.color.set(pal['dm-node']);
      M.strike.color.set(pal['dm-strike']);
      M.strike.emissive.set(pal['dm-strike']).multiplyScalar(0.25);
      M.felt.color.set(pal['dm-felt']);
      M.ring.color.set(pal['dm-strike']);
      cUp = col(pal['dm-up']); cDn = col(pal['dm-down']);
      buildEnvironment();
      builtKey = '';
    }
    let cUp = col('#c2410c'), cDn = col('#1d4ed8'), cBase = col('#eeeeee');

    // ---------- 鼓面網格與每個模態在每個頂點的形狀 ----------
    let head = null, bodyGroup = null, nodeLines = null, builtKey = '', R = 30, shapes = null, nv = 0, base = null;
    const disposables = [];
    function own(o) { disposables.push(o); return o; }
    function clearDrum() {
      [head, bodyGroup, nodeLines].forEach(function (o) {
        if (!o) return;
        scene.remove(o);
        o.traverse(function (q) { if (q.geometry) q.geometry.dispose(); });
      });
      head = bodyGroup = nodeLines = null;
    }
    function headGeometry(drum, size) {
      const pos = [], idx = [], pts = [];
      if (drum !== 'plate') {
        pos.push(0, 0, 0); pts.push({ r: 0, th: 0 });
        for (let i = 1; i <= NR; i++) {
          const r = i / NR;
          for (let j = 0; j < NT; j++) {
            const th = 2 * Math.PI * j / NT;
            pos.push(size * r * Math.cos(th), size * r * Math.sin(th), 0);
            pts.push({ r: r, th: th });
          }
        }
        for (let j = 0; j < NT; j++) idx.push(0, 1 + j, 1 + (j + 1) % NT);
        for (let i = 1; i < NR; i++) {
          const a0 = 1 + (i - 1) * NT, b0 = 1 + i * NT;
          for (let j = 0; j < NT; j++) {
            const j1 = (j + 1) % NT;
            idx.push(a0 + j, b0 + j, b0 + j1, a0 + j, b0 + j1, a0 + j1);
          }
        }
      } else {
        for (let j = 0; j <= NS; j++) for (let i = 0; i <= NS; i++) {
          const u = i / NS, v = j / NS;
          pos.push(size * (2 * u - 1), size * (2 * v - 1), 0);
          pts.push({ x: u, y: v });
        }
        for (let j = 0; j < NS; j++) for (let i = 0; i < NS; i++) {
          const a = j * (NS + 1) + i;
          idx.push(a, a + 1, a + NS + 2, a, a + NS + 2, a + NS + 1);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      return { g: g, pts: pts };
    }
    function buildBody(drum, size) {
      const grp = new THREE.Group();
      if (drum === 'membrane') {
        const h = size * 0.55;
        const shell = new THREE.Mesh(new THREE.CylinderGeometry(size * 1.01, size * 1.01, h, 96, 1, true), M.shell);
        shell.rotation.x = Math.PI / 2; shell.position.z = -h / 2 - 0.2;
        shell.castShadow = true;
        grp.add(shell);
        const bottom = new THREE.Mesh(new THREE.CircleGeometry(size * 1.01, 64), M.shell);
        bottom.position.z = -h - 0.2;
        grp.add(bottom);
        [0, -h].forEach(function (z) {
          const hoop = new THREE.Mesh(new THREE.TorusGeometry(size * 1.03, Math.max(0.35, size * 0.025), 12, 96), M.rim);
          hoop.position.z = z - 0.1; hoop.castShadow = true;
          grp.add(hoop);
        });
        for (let k = 0; k < 8; k++) {
          const a = (k + 0.5) * Math.PI / 4;
          const lug = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.022, size * 0.022, h * 0.8, 12), M.rim);
          lug.rotation.x = Math.PI / 2;
          lug.position.set((size * 1.06) * Math.cos(a), (size * 1.06) * Math.sin(a), -h / 2);
          grp.add(lug);
        }
        grp.userData.lift = h + 0.2;
      } else if (drum === 'timpani') {
        // 鼓腔：半球形的銅鍋（旋轉曲面），下面三支腳
        const prof = [];
        const depth = size * 0.85;
        for (let i = 0; i <= 24; i++) {
          const t = i / 24, ang = t * Math.PI / 2;
          prof.push(new THREE.Vector2(size * 1.01 * Math.cos(ang) + 0.001, -depth * Math.sin(ang)));
        }
        prof.reverse();
        const bowl = new THREE.Mesh(new THREE.LatheGeometry(prof, 96), M.copper);
        bowl.rotation.x = Math.PI / 2;
        bowl.castShadow = true;
        grp.add(bowl);
        const hoop = new THREE.Mesh(new THREE.TorusGeometry(size * 1.03, Math.max(0.4, size * 0.03), 12, 96), M.rim);
        hoop.castShadow = true;
        grp.add(hoop);
        const legH = size * 0.6;
        for (let k = 0; k < 3; k++) {
          const a = k * 2 * Math.PI / 3 + Math.PI / 6;
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.025, size * 0.03, depth * 0.6 + legH, 12), M.leg);
          leg.rotation.x = Math.PI / 2;
          leg.position.set(size * 0.62 * Math.cos(a), size * 0.62 * Math.sin(a), -(depth * 0.6 + legH) / 2 - depth * 0.35);
          leg.castShadow = true;
          grp.add(leg);
        }
        grp.userData.lift = depth * 0.95 + legH;
      } else {
        // 簡支方板：四邊各一條細的支撐稜，下面四支腳
        const h = size * 0.5;
        [[0, -1], [0, 1], [-1, 0], [1, 0]].forEach(function (d) {
          const len = 2 * size;
          const bar = new THREE.Mesh(new THREE.BoxGeometry(d[0] ? 0.8 : len, d[0] ? len : 0.8, 1.2), M.rim);
          bar.position.set(d[0] * size, d[1] * size, -0.7);
          bar.castShadow = true;
          grp.add(bar);
        });
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (d) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, h, 10), M.leg);
          leg.rotation.x = Math.PI / 2;
          leg.position.set(d[0] * size, d[1] * size, -h / 2 - 1.3);
          leg.castShadow = true;
          grp.add(leg);
        });
        grp.userData.lift = h + 1.3;
      }
      return grp;
    }
    function buildNodal(snap, md) {
      const grp = new THREE.Group();
      const z = 0.25;
      const addLine = function (pts) {
        const g = new THREE.BufferGeometry().setFromPoints(pts);
        const l = new THREE.Line(g, M.node);
        l.renderOrder = 5;
        grp.add(l);
      };
      if (snap.drum !== 'plate') {
        C.nodalCircles(md).forEach(function (rn) {
          const pts = [];
          for (let j = 0; j <= 128; j++) { const a = 2 * Math.PI * j / 128; pts.push(new THREE.Vector3(R * rn * Math.cos(a), R * rn * Math.sin(a), z)); }
          addLine(pts);
        });
        C.nodalDiameters(md, snap.orient).forEach(function (a) {
          addLine([new THREE.Vector3(-R * Math.cos(a), -R * Math.sin(a), z), new THREE.Vector3(R * Math.cos(a), R * Math.sin(a), z)]);
        });
      } else {
        const nl = C.plateNodalLines(md);
        nl.xs.forEach(function (u) { const x = R * (2 * u - 1); addLine([new THREE.Vector3(x, -R, z), new THREE.Vector3(x, R, z)]); });
        nl.ys.forEach(function (v) { const y = R * (2 * v - 1); addLine([new THREE.Vector3(-R, y, z), new THREE.Vector3(R, y, z)]); });
      }
      return grp;
    }

    // 敲擊點與鼓棒
    const strikeDot = new THREE.Mesh(own(new THREE.SphereGeometry(1, 20, 14)), M.strike);
    strikeDot.castShadow = true;
    scene.add(strikeDot);
    const mallet = new THREE.Group();
    const malletHead = new THREE.Mesh(own(new THREE.SphereGeometry(1, 24, 16)), M.felt);
    malletHead.castShadow = true;
    mallet.add(malletHead);
    const malletStick = new THREE.Mesh(own(new THREE.CylinderGeometry(0.22, 0.26, 1, 10)), M.stick);
    malletStick.castShadow = true;
    mallet.add(malletStick);
    scene.add(mallet);
    const ripple = new THREE.Mesh(own(new THREE.RingGeometry(0.9, 1, 48)), M.ring);
    ripple.renderOrder = 4;
    scene.add(ripple);

    function rebuild(snap) {
      const size = snap.drum === 'plate' ? snap.L * 50 : snap.a * 100;   // 半徑或半邊長（cm）
      const key = snap.drum + '|' + size.toFixed(2) + '|' + (snap.drum === 'plate' ? 0 : snap.orient.toFixed(4)) + '|' + snap.sel;
      if (key === builtKey) return false;
      const sizeChanged = !head || Math.abs(size - R) > 1e-6 || head.userData.drum !== snap.drum;
      builtKey = key;
      R = size;
      if (sizeChanged || !head) {
        clearDrum();
        const hg = headGeometry(snap.drum, R);
        head = new THREE.Mesh(hg.g, snap.drum === 'plate' ? M.metalSkin : M.skin);
        head.userData.drum = snap.drum;
        head.userData.pts = hg.pts;
        head.castShadow = true; head.receiveShadow = true;
        scene.add(head);
        bodyGroup = buildBody(snap.drum, R);
        scene.add(bodyGroup);
        nv = hg.pts.length;
        base = hg.g.attributes.position.array.slice();
        cBase = col(snap.drum === 'plate' ? pal['dm-plate'] : pal['dm-skin']);
      }
      // 每個模態在每個頂點的形狀（方位角換了也要重算）
      shapes = {};
      const pts = head.userData.pts;
      C.modesOf(snap.drum).forEach(function (md) {
        const a = new Float32Array(nv);
        for (let i = 0; i < nv; i++) {
          a[i] = C.modeValue(snap.drum, md, pts[i], snap.orient);
        }
        shapes[md.key] = a;
      });
      if (nodeLines) { scene.remove(nodeLines); nodeLines.traverse(function (q) { if (q.geometry) q.geometry.dispose(); }); nodeLines = null; }
      if (snap.sel !== 'all') {
        const md = C.modesOf(snap.drum).filter(function (o) { return o.key === snap.sel; })[0];
        if (md) { nodeLines = buildNodal(snap, md); scene.add(nodeLines); }
      }
      // 整組往上抬，讓腳站在地面上
      const lift = bodyGroup.userData.lift || 0;
      ground.position.z = -lift;
      if (sizeChanged) fitPending = true;
      return true;
    }

    // ---------- 每一格：依係數更新鼓面高度與顏色 ----------
    let lastMoving = false;
    function update() {
      const snap = env.snapshot();
      rebuild(snap);
      const pos = head.geometry.attributes.position, colA = head.geometry.attributes.color;
      const P = pos.array, Cc = colA.array;
      const keys = Object.keys(snap.coef);
      const field = new Float32Array(nv);
      let moving = false;
      keys.forEach(function (k) {
        const s = shapes[k], c = snap.coef[k];
        if (!s || !c) return;
        moving = true;
        for (let i = 0; i < nv; i++) field[i] += c * s[i];
      });
      let peak = 0;
      if (snap.sel !== 'all') { const s = shapes[snap.sel]; if (s) for (let i = 0; i < nv; i++) peak = Math.max(peak, Math.abs(s[i])); }
      else peak = snap.scale || 1;
      const k = AMP * R / (snap.sel !== 'all' ? (peak || 1) : Math.max(0.05, peak));
      const tmp = new THREE.Color();
      for (let i = 0; i < nv; i++) {
        const z = field[i] * k;
        P[3 * i] = base[3 * i]; P[3 * i + 1] = base[3 * i + 1]; P[3 * i + 2] = z;
        const v = Math.max(-1, Math.min(1, z / (AMP * R)));
        tmp.copy(cBase).lerp(v >= 0 ? cUp : cDn, Math.pow(Math.abs(v), 0.75));
        Cc[3 * i] = tmp.r; Cc[3 * i + 1] = tmp.g; Cc[3 * i + 2] = tmp.b;
      }
      pos.needsUpdate = true; colA.needsUpdate = true;
      if (moving || lastMoving) head.geometry.computeVertexNormals();
      lastMoving = moving;

      // 敲擊點、鼓棒與漣漪
      const sp = snap.strike;
      const sx = snap.drum === 'plate' ? R * (2 * sp.x - 1) : R * sp.r * Math.cos(sp.th);
      const sy = snap.drum === 'plate' ? R * (2 * sp.y - 1) : R * sp.r * Math.sin(sp.th);
      const dotR = Math.max(0.5, R * 0.03);
      strikeDot.scale.setScalar(dotR);
      strikeDot.position.set(sx, sy, dotR * 0.6);
      const mR = Math.max(1, R * 0.07);
      const age = snap.hitAge;
      const lift = age < 0.12 ? 0 : Math.min(1, (age - 0.12) / 0.35);
      const hover = mR + (env.reducedMotion() ? R * 0.35 : R * 0.08 + R * 0.3 * lift);
      malletHead.scale.setScalar(mR);
      const stickLen = R * 0.9;
      malletStick.scale.set(1, stickLen, 1);
      malletStick.position.set(0, -stickLen / 2 - mR * 0.6, mR * 0.25);
      malletStick.rotation.x = -0.25;
      mallet.position.set(sx, sy, hover);
      mallet.rotation.z = Math.atan2(sy, sx) + Math.PI / 2;
      if (age < 0.7 && !env.reducedMotion()) {
        ripple.visible = true;
        const s = dotR * (2 + age * 22);
        ripple.scale.set(s, s, 1);
        ripple.position.set(sx, sy, 0.3);
        M.ring.opacity = 0.6 * (1 - age / 0.7);
      } else ripple.visible = false;

      const narrow = (canvas.clientWidth || 640) < 480;
      const nt = narrow ? T('大小真實；起伏放大、慢動作', 'to scale; motion exaggerated and slowed')
        : T('鼓的大小依真實比例；起伏的高度放大、時間放慢示意', 'drum size to scale; height of the motion exaggerated and time slowed down');
      if (note.textContent !== nt) note.textContent = nt;
      return snap;
    }

    // ---------- 相機 ----------
    let fitPending = true;
    function fit() {
      const w = canvas.clientWidth || 640, h = canvas.clientHeight || 400, aspect = w / h;
      const lift = bodyGroup ? bodyGroup.userData.lift : R;
      const target = new THREE.Vector3(0, 0, -lift * 0.3);
      const dir = new THREE.Vector3(0.15, -0.95, 0.85).normalize();
      const t = Math.tan(camera.fov * Math.PI / 360);
      const need = R * 1.25;
      const dist = Math.max(need / t, need / (t * aspect)) * 1.25;
      controls.target.copy(target);
      camera.position.copy(target).addScaledVector(dir, dist);
      camera.near = Math.max(0.3, dist / 80);
      camera.far = dist * 12;
      camera.updateProjectionMatrix();
      controls.minDistance = R * 0.6;
      controls.maxDistance = dist * 4;
      const sd = R * 3;
      sun.position.set(-R * 1.2, -R * 1.6, R * 3.2);
      sun.target.position.set(0, 0, -lift);
      sun.shadow.camera.left = -sd; sun.shadow.camera.right = sd; sun.shadow.camera.top = sd; sun.shadow.camera.bottom = -sd;
      sun.shadow.camera.near = 1; sun.shadow.camera.far = R * 10;
      sun.shadow.camera.updateProjectionMatrix();
      rimL.position.set(R * 2, R * 2, R * 1.5);
      controls.update();
      fitPending = false;
    }

    let raf = 0;
    function renderNow() {
      if (!view.active || document.hidden) return;
      if (fitPending) fit();
      const moved = controls.update();
      renderer.render(scene, camera);
      if (moved) requestRender();
    }
    function requestRender() {
      if (raf || !view.active) return;
      raf = requestAnimationFrame(function () { raf = 0; update(); renderNow(); });
    }
    function resize3() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      requestRender();
    }
    const ro = window.ResizeObserver ? new ResizeObserver(resize3) : null;
    if (ro) ro.observe(canvas); else window.addEventListener('resize', resize3);
    controls.addEventListener('change', requestRender);
    const onVisible = function () { if (!document.hidden) requestRender(); };
    document.addEventListener('visibilitychange', onVisible);
    canvas.addEventListener('webglcontextlost', function (ev) {
      ev.preventDefault();
      if (view.active && env.onLost) env.onLost();
    });

    const view = {
      active: true,
      frame: function () { update(); renderNow(); },
      busy: function () { return controls.enableDamping && raf !== 0; },
      onStrike: function () { requestRender(); },
      onTheme: function () { applyColors(); cBase = col(head && head.userData.drum === 'plate' ? pal['dm-plate'] : pal['dm-skin']); requestRender(); },
      resetCamera: function () { fit(); requestRender(); },
      dispose: function () {
        view.active = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        document.removeEventListener('visibilitychange', onVisible);
        controls.dispose();
        clearDrum();
        disposables.forEach(function (g) { g.dispose(); });
        Object.keys(M).forEach(function (k) { M[k].dispose(); });
        ground.geometry.dispose(); ground.material.dispose();
        if (envTex) envTex.dispose();
        renderer.dispose();
        try { renderer.forceContextLoss(); } catch (e) { /* 繪圖環境已中斷 */ }
        canvas.remove(); layer.remove();
      }
    };

    applyColors();
    update();
    resize3();
    requestRender();
    return view;
  }

  window.DrumModes3D = { create: create };
})();
