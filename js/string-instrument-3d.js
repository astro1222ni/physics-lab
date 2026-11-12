/*
 * string-instrument-3d.js — 「弦樂器：弦長、張力與品格」的 3D 立體檢視
 *
 * 這個檔案本身不依賴 three.js：使用者第一次按「3D 立體」時，string-instrument.js 才載入這個檔案與 vendor/three/，
 * 再呼叫 StringInstrument3D.create(lib, env) 建立場景；切回 2D 時 dispose() 釋放全部資源。
 *
 * 畫面上的物理量全部來自 env.snapshot()（與 2D 同一個物理核心 string-instrument-core.js）：
 *   弦長 L、品格位置 xₙ = L(1 − 2^(−n/12))（或 18 法則）、按弦或手指的位置、輕觸點、撥弦位置 β，
 *   以及振動的弦：模態疊加 y(u, t) = Σ aₙ gₙ sin(nπu) cos(2πn f₁ t)（慢動作，振幅放大）。
 * 場景座標（cm）：x 沿著弦（琴枕 x = 0、琴橋 x = L），y 是弦的排列方向（高音弦在遠處，和 2D 的指板一樣在上面），z 朝上。
 * 長度依真實比例；弦的粗細放大 SR 倍、振動幅度放大示意（畫面左下角有註明）。
 */
(function () {
  'use strict';
  const SR = 2.5;               // 弦的粗細放大倍數（示意）
  const AMP = 3.0;              // 振動：形狀函數的 1 對應 3 cm（放大示意）
  const NX = 180, NRAD = 10;    // 振動弦的管狀網格（沿弦 × 圓周）
  const MAXN = 24;              // 節點光點的上限

  function create(lib, env) {
    const THREE = lib.THREE;
    const T = env.T, S = env.S, host = env.host;
    const LD = window.LabDraw;

    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('弦樂器的 3D 立體檢視：琴頸、指板、金屬品條、弦、按弦的手指與振動的弦（可拖曳旋轉、雙指或滾輪縮放、方向鍵平移）',
      '3D view of the string instrument: the neck, fingerboard, metal frets, strings, the pressing finger and the vibrating string (drag to rotate, pinch or scroll to zoom, arrow keys to pan)'));
    canvas.tabIndex = 0;
    host.appendChild(canvas);
    const layer = document.createElement('div');
    layer.className = 'si3-labels';
    layer.setAttribute('aria-hidden', 'true');
    host.appendChild(layer);
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
    renderer.toneMappingExposure = 1.0;
    const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 1, 3000);
    camera.up.set(0, 0, 1);
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.minDistance = 6;
    controls.maxDistance = 600;
    controls.maxPolarAngle = Math.PI * 0.82;
    if (controls.listenToKeyEvents) controls.listenToKeyEvents(canvas);

    // ---------- 顏色（與 2D 相同的 CSS 代號） ----------
    const pal = {};
    function readPalette() {
      const cs = getComputedStyle(document.documentElement);
      const g = function (k, d) { return cs.getPropertyValue('--' + k).trim() || d; };
      pal.dark = !!LD.dark;
      ['si-wave', 'si-pick', 'si-touch', 'si-r18', 'si-finger', 'si-rose', 'si-ebony', 'si-top', 'si-varnish', 'si-rod', 'si-fret', 'accent', 'text', 'muted']
        .forEach(function (k) { pal[k] = g(k, '#888888'); });
    }
    function color(v) { return new THREE.Color(v); }

    // ---------- 燈光：天光＋主光（投影）＋右後方的輪廓光（金屬品條與弦會亮起來） ----------
    const hemi = new THREE.HemisphereLight(0xffffff, 0x6b6157, 1.0);
    hemi.position.set(0, 0, 1);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 2.0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.radius = 4;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    scene.add(sun); scene.add(sun.target);
    const rim = new THREE.DirectionalLight(0xfff1dc, 1.0);
    scene.add(rim);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.ShadowMaterial({ opacity: 0.2, depthWrite: false }));
    ground.receiveShadow = true;
    scene.add(ground);

    // 簡單的環境反射（金屬品條與亮光漆用）：上亮下暗的球
    let envTex = null;
    function buildEnvironment() {
      if (envTex) { envTex.dispose(); envTex = null; }
      const dk = pal.dark;
      const es = new THREE.Scene();
      const geo = new THREE.SphereGeometry(100, 32, 16);
      const cols = [];
      const pos = geo.attributes.position;
      const top = color(dk ? '#4a535c' : '#f4f6f8'), mid = color(dk ? '#22282d' : '#b9bfc4'), bot = color(dk ? '#0d1013' : '#6b6560');
      const c = new THREE.Color();
      for (let i = 0; i < pos.count; i++) {
        const u = pos.getY(i) / 100;
        if (u > 0) c.copy(mid).lerp(top, u); else c.copy(mid).lerp(bot, -u);
        cols.push(c.r, c.g, c.b);
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      const sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide }));
      sky.rotation.x = Math.PI / 2;
      es.add(sky);
      const pm0 = new THREE.MeshBasicMaterial({ color: color('#ffffff').multiplyScalar(dk ? 2 : 3), side: THREE.DoubleSide });
      const p1 = new THREE.Mesh(new THREE.PlaneGeometry(120, 18), pm0);
      p1.position.set(0, -40, 70); p1.lookAt(0, 0, 0);
      es.add(p1);
      const pmrem = new THREE.PMREMGenerator(renderer);
      envTex = pmrem.fromScene(es, 0.02).texture;
      pmrem.dispose();
      geo.dispose(); sky.material.dispose(); p1.geometry.dispose(); pm0.dispose();
      scene.environment = envTex;
    }

    // ---------- 紋理（全部由程式畫，不用圖檔） ----------
    function rng(seed) { let s = seed; return function () { s = (s * 16807) % 2147483647; return s / 2147483647; }; }
    /** 木紋：沿 x 方向的長紋路（雲杉直紋、玫瑰木、楓木） */
    function woodCanvas(base, o) {
      o = o || {};
      const W = o.w || 1024, H = o.h || 256;
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d');
      g.fillStyle = base; g.fillRect(0, 0, W, H);
      const r = rng(o.seed || 7);
      const n = o.lines || 110;
      for (let k = 0; k < n; k++) {
        const y = r() * H, a = 0.03 + r() * (o.contrast || 0.12), w = 0.6 + r() * (o.width || 2.4);
        const ph = r() * 6.28, f = (1 + r() * 3) * Math.PI * 2 / W, amp = (o.wave || 3) * r();
        g.strokeStyle = 'rgba(' + (o.ink || '45,22,8') + ',' + a.toFixed(3) + ')';
        g.lineWidth = w;
        g.beginPath();
        for (let x = 0; x <= W; x += 8) { const yy = y + amp * Math.sin(ph + x * f); if (x) g.lineTo(x, yy); else g.moveTo(x, yy); }
        g.stroke();
      }
      if (o.sheen) {   // 亮光漆的柔和反光帶
        const gr = g.createLinearGradient(0, 0, 0, H);
        gr.addColorStop(0, 'rgba(255,255,255,0.10)'); gr.addColorStop(0.5, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.10)');
        g.fillStyle = gr; g.fillRect(0, 0, W, H);
      }
      return c;
    }
    const owned = [];   // 這一次建樂器用到的材質與紋理（換樂器或換深淺色時釋放）
    function tex(c, o) {
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = maxAniso;
      if (o && o.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
      owned.push(t);
      return t;
    }
    /** 世界座標 UV（ExtrudeGeometry 的頂面）：把 [x0, x0 + w] × [y0, y0 + h] 對到整張紋理 */
    function fitUV(t, x0, y0, w, h) { t.repeat.set(1 / w, 1 / h); t.offset.set(-x0 / w, -y0 / h); return t; }
    function mat(M) { owned.push(M); return M; }

    // ---------- 共用的材質（深淺色切換時只改顏色） ----------
    const M = {
      fret: new THREE.MeshStandardMaterial({ color: 0xd2d6da, metalness: 1, roughness: 0.22, envMapIntensity: 1.2 }),
      bone: new THREE.MeshStandardMaterial({ color: 0xf1ead9, metalness: 0, roughness: 0.42 }),
      pearl: new THREE.MeshStandardMaterial({ color: 0xf4efe6, metalness: 0.1, roughness: 0.3 }),
      nylon: new THREE.MeshPhysicalMaterial({ color: 0xf2e9d4, metalness: 0, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.2 }),
      wound: new THREE.MeshStandardMaterial({ color: 0xd2b27a, metalness: 0.85, roughness: 0.38 }),
      steel: new THREE.MeshStandardMaterial({ color: 0xd9dde1, metalness: 1, roughness: 0.18 }),
      finger: new THREE.MeshStandardMaterial({ color: 0xc98a64, metalness: 0, roughness: 0.62 }),
      nail: new THREE.MeshStandardMaterial({ color: 0xf0d3c2, metalness: 0, roughness: 0.3 }),
      ghost: new THREE.MeshStandardMaterial({ color: 0xc98a64, metalness: 0, roughness: 0.62, transparent: true, opacity: 0.5, depthWrite: false }),
      ring: new THREE.MeshBasicMaterial({ color: 0x0f766e }),
      node: new THREE.MeshBasicMaterial({ color: 0x0f766e }),
      glow: new THREE.MeshBasicMaterial({ color: 0x0f766e, transparent: true, opacity: 0.28, depthWrite: false }),
      pick: new THREE.MeshPhysicalMaterial({ color: 0xc2410c, metalness: 0, roughness: 0.25, clearcoat: 1 }),
      r18: new THREE.MeshBasicMaterial({ color: 0xbe185d, transparent: true, opacity: 0.9 }),
      bowStick: new THREE.MeshPhysicalMaterial({ color: 0x5a2a12, metalness: 0, roughness: 0.35, clearcoat: 0.8 }),
      bowHair: new THREE.MeshStandardMaterial({ color: 0xf3ecdc, metalness: 0, roughness: 0.9 }),
      hole: new THREE.MeshBasicMaterial({ color: 0x0b0705 })
    };
    const selMats = {};   // 選中那條弦：同材質再加一點自發光（顏色 = 2D 的弦色）
    ['nylon', 'wound', 'steel'].forEach(function (k) { selMats[k] = M[k].clone(); });

    function applyColors() {
      readPalette();
      M.finger.color.set(pal['si-finger']);
      M.ghost.color.set(pal['si-finger']);
      M.ring.color.set(pal['si-touch']);
      M.node.color.set(pal['si-touch']);
      M.glow.color.set(pal['si-touch']);
      M.pick.color.set(pal['si-pick']);
      M.r18.color.set(pal['si-r18']);
      M.fret.color.set(pal['si-fret']).lerp(color('#ffffff'), 0.25);
      Object.keys(selMats).forEach(function (k) {
        selMats[k].color.copy(M[k].color).lerp(color(pal['si-wave']), 0.55);
        selMats[k].emissive = color(pal['si-wave']);
        selMats[k].emissiveIntensity = pal.dark ? 0.6 : 0.3;
      });
      ground.material.opacity = pal.dark ? 0.45 : 0.18;
      buildEnvironment();
    }

    // ---------- 幾何小工具 ----------
    const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 14, 1, false);
    const sphereGeo = new THREE.SphereGeometry(1, 24, 16);
    const Y = new THREE.Vector3(0, 1, 0);
    /** 兩點之間的圓柱（用共用的單位圓柱縮放與旋轉） */
    function placeCyl(mesh, a, b, r) {
      const d = new THREE.Vector3().subVectors(b, a);
      const len = d.length() || 1e-6;
      mesh.position.copy(a).addScaledVector(d, 0.5);
      mesh.scale.set(r, len, r);
      mesh.quaternion.setFromUnitVectors(Y, d.divideScalar(len));
      return mesh;
    }
    function cyl(a, b, r, m, parent) {
      const mesh = placeCyl(new THREE.Mesh(unitCyl, m), a, b, r);
      mesh.castShadow = true;
      (parent || scene).add(mesh);
      return mesh;
    }
    function box(x0, x1, y0, y1, z0, z1, m, parent) {
      const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      mesh.castShadow = true; mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    }
    /** 平面輪廓（x–y）往上擠出：從 z0 到 z1 */
    function extrude(shape, z0, z1, mats, bevel, parent) {
      const b = bevel || 0;
      const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.01, z1 - z0 - 2 * b), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: 3, curveSegments: 48 });
      g.translate(0, 0, z0 + b);
      const mesh = new THREE.Mesh(g, mats);
      mesh.castShadow = true; mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    }
    /** 琴身輪廓：由沿長度的寬度表（[比例, 寬度]）做出左右對稱的平滑封閉曲線 */
    function outline(x0, len, table) {
      const pts = [];
      pts.push(new THREE.Vector3(x0, 0, 0));
      table.forEach(function (p) { pts.push(new THREE.Vector3(x0 + p[0] * len, -p[1] / 2, 0)); });
      pts.push(new THREE.Vector3(x0 + len, 0, 0));
      for (let k = table.length - 1; k >= 0; k--) pts.push(new THREE.Vector3(x0 + table[k][0] * len, table[k][1] / 2, 0));
      const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
      return new THREE.Shape(curve.getPoints(220).map(function (v) { return new THREE.Vector2(v.x, v.y); }));
    }

    // =====================================================================
    // 樂器（換樂器、弦長、品格規則、選弦、深淺色時重建）
    // =====================================================================
    let inst = null;      // { group, geo: {…} }
    let builtKey = '';
    function keyOf(snap) {
      return [snap.inst, snap.L.toFixed(4), snap.rule, snap.show18 || snap.rule === 'r18', snap.si, pal.dark,
        snap.strings.map(function (s) { return s.kind + s.d.toFixed(3); }).join(',')].join('|');
    }
    function disposeInst() {
      if (!inst) return;
      scene.remove(inst.group);
      inst.group.traverse(function (o) { if (o.geometry && o.geometry !== unitCyl && o.geometry !== sphereGeo) o.geometry.dispose(); });
      inst = null;
      owned.splice(0).forEach(function (r) { r.dispose(); });
    }
    function buildInstrument(snap) {
      disposeInst();
      const group = new THREE.Group();
      scene.add(group);
      const Lc = snap.L * 100;
      const n = snap.strings.length;
      let geo;
      if (snap.inst === 'guitar') geo = buildGuitar(group, Lc, snap);
      else if (snap.inst === 'violin') geo = buildViolin(group, Lc, snap);
      else geo = buildErhu(group, Lc, snap);
      geo.L = Lc; geo.n = n;
      geo.y = function (i, x) { return (i - (n - 1) / 2) * (geo.sN + (geo.sB - geo.sN) * x / Lc); };
      geo.z = function (x) { return geo.zN + (geo.zB - geo.zN) * x / Lc; };
      geo.r = snap.strings.map(function (s) { return Math.max(0.055, s.d / 20 * SR); });
      // 弦（選中的那條另外畫，會振動）
      const kinds = snap.strings.map(function (s) { return s.kind; });
      for (let i = 0; i < n; i++) {
        const m = M[kinds[i]] || M.nylon, r = geo.r[i];
        const nut = new THREE.Vector3(0, geo.y(i, 0), geo.zN + r), br = new THREE.Vector3(Lc, geo.y(i, Lc), geo.zB + r);
        const a = geo.headEnd(i), b = geo.tailEnd(i);
        cyl(a, nut, r, m, group);
        cyl(br, b, r, m, group);
        if (i !== snap.si) cyl(nut, br, r, m, group);
      }
      geo.selMat = selMats[kinds[snap.si]] || selMats.nylon;
      ground.position.z = geo.groundZ;
      sun.position.set(Lc * 0.25 - 40, -70, 150);
      sun.target.position.set(Lc / 2, 0, 0);
      const sc = sun.shadow.camera, half = Math.max(60, Lc * 0.75);
      sc.left = -half; sc.right = half; sc.bottom = -half; sc.top = half; sc.near = 20; sc.far = 500;
      sc.updateProjectionMatrix();
      rim.position.set(Lc + 80, 70, 60);
      inst = { group: group, geo: geo };
      deadA.material = deadB.material = geo.selMat;
      tube.material = geo.selMat;
    }

    /** 古典吉他：玫瑰木指板（到第 19 品）、金屬品條、雲杉面板與音孔、琴橋 */
    function buildGuitar(group, Lc, snap) {
      const sL = Lc / 65;
      const rule = snap.rule;
      const xEnd = Lc * (1 - Math.pow(2, -19.6 / 12));
      const w0 = 5.2, w1 = 5.2 + 1.0 * xEnd / (Lc / 2);
      const wAt = function (x) { return w0 + (w1 - w0) * x / xEnd; };
      // 琴身（第 12 品接琴身；整體依弦長等比例）
      const bx0 = Lc / 2 - 0.5 * sL, blen = 49 * sL;
      const shape = outline(bx0, blen, [[0.02, 15 * sL], [0.18, 27 * sL], [0.3, 28.5 * sL], [0.43, 24 * sL], [0.56, 30 * sL], [0.72, 36.5 * sL], [0.88, 33 * sL], [0.97, 20 * sL]]);
      const hx = Lc * 0.735, hr = Math.min(4.3 * sL, 4.3);
      const hole = new THREE.Path(); hole.absarc(hx, 0, hr, 0, Math.PI * 2, true);
      shape.holes.push(hole);
      const bw = blen, bh = 37 * sL;
      // 面板紋理：雲杉直紋＋音孔花紋
      const tc = woodCanvas(pal['si-top'], { w: 2048, h: Math.round(2048 * bh / bw), seed: 77, lines: 260, contrast: 0.1, width: 2, wave: 1.5, ink: '120,80,30' });
      {
        const g = tc.getContext('2d'), W = tc.width, H = tc.height;
        const cx = (hx - bx0) / bw * W, cy = H / 2, R = hr / bw * W;
        const rings = [[1.13, '#2f6b4f'], [1.2, '#7a4520'], [1.27, '#d8c49a'], [1.33, '#2f6b4f'], [1.4, '#7a4520']];
        rings.forEach(function (rr) { g.strokeStyle = rr[1]; g.lineWidth = R * 0.065; g.beginPath(); g.arc(cx, cy, R * rr[0], 0, Math.PI * 2); g.stroke(); });
        // 鑲嵌的小方格
        for (let k = 0; k < 72; k++) {
          const a = k / 72 * Math.PI * 2;
          g.fillStyle = k % 2 ? '#c98a3a' : '#2f6b4f';
          g.beginPath(); g.arc(cx + Math.cos(a) * R * 1.235, cy + Math.sin(a) * R * 1.235, R * 0.022, 0, Math.PI * 2); g.fill();
        }
      }
      const topTex = fitUV(tex(tc), bx0, -bh / 2, bw, bh);
      const topMat = mat(new THREE.MeshPhysicalMaterial({ map: topTex, roughness: 0.42, clearcoat: 0.7, clearcoatRoughness: 0.18 }));
      const sideTex = tex(woodCanvas('#4a2716', { seed: 13, contrast: 0.22, ink: '20,8,2' }), { repeat: true });
      sideTex.repeat.set(0.02, 0.2);
      const sideMat = mat(new THREE.MeshPhysicalMaterial({ map: sideTex, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.15 }));
      extrude(shape, -10.6, -0.6, [topMat, sideMat], 0.25, group);
      // 音孔裡面是暗的
      const disc = new THREE.Mesh(new THREE.CircleGeometry(hr * 1.02, 48), M.hole);
      disc.position.set(hx, 0, -9.5); group.add(disc);
      // 琴橋：綁弦座（玫瑰木）＋骨質弦枕（弦長量到這裡）
      const bridgeTex = tex(woodCanvas(pal['si-rose'], { seed: 5, contrast: 0.18 }));
      const roseMat = mat(new THREE.MeshPhysicalMaterial({ map: bridgeTex, roughness: 0.45, clearcoat: 0.4 }));
      const bwid = Math.min(19, 19 * sL + 2);
      box(Lc - 1.2, Lc + 2.0, -bwid / 2, bwid / 2, -0.6, 0.15, roseMat, group);
      box(Lc - 0.15, Lc + 0.15, -4, 4, 0.15, 0.95, M.bone, group);
      // 琴頸背（桃花心木）與琴頭殘段
      const neckLen = bx0 + 2;
      const neckShape = new THREE.Shape();
      neckShape.absellipse(0, 0, w0 / 2, 2.3, Math.PI, 2 * Math.PI, false);
      neckShape.lineTo(-w0 / 2, 0);
      const ng = new THREE.ExtrudeGeometry(neckShape, { depth: neckLen, bevelEnabled: false, curveSegments: 24 });
      ng.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1));
      ng.translate(0, 0, -0.6);
      const neckTex = tex(woodCanvas('#7a4a2a', { seed: 21, contrast: 0.14, ink: '40,18,6' }), { repeat: true });
      neckTex.repeat.set(0.04, 0.4);
      const neckMat = mat(new THREE.MeshPhysicalMaterial({ map: neckTex, roughness: 0.4, clearcoat: 0.6 }));
      const neck = new THREE.Mesh(ng, neckMat); neck.castShadow = true; group.add(neck);
      box(-17, 0, -2.95, 2.95, -2.0, -0.6, neckMat, group);
      box(-15.5, -2.5, -1.9, -0.9, -0.62, -0.55, M.hole, group);
      box(-15.5, -2.5, 0.9, 1.9, -0.62, -0.55, M.hole, group);
      for (let k = 0; k < 3; k++) {
        const x = -4.5 - k * 3.6;
        cyl(new THREE.Vector3(x, -2.95, -1.2), new THREE.Vector3(x, 2.95, -1.2), 0.42, M.bone, group);
      }
      // 指板（玫瑰木，梯形）
      const fb = new THREE.Shape();
      fb.moveTo(0, -w0 / 2); fb.lineTo(xEnd, -w1 / 2); fb.lineTo(xEnd, w1 / 2); fb.lineTo(0, w0 / 2); fb.closePath();
      const fbTex = fitUV(tex(woodCanvas(pal['si-rose'], { w: 2048, h: 256, seed: 41, lines: 140, contrast: 0.2, ink: '15,6,2', sheen: true })), 0, -w1 / 2, xEnd, w1);
      const fbMat = mat(new THREE.MeshStandardMaterial({ map: fbTex, roughness: 0.55 }));
      extrude(fb, -0.6, 0, [fbMat, roseMat], 0, group);
      // 品條（金屬圓柱，一半嵌在指板裡）
      for (let k = 1; k <= 19; k++) {
        const x = S.fretX(k, Lc, rule), hw = wAt(x) / 2;
        cyl(new THREE.Vector3(x, -hw, 0), new THREE.Vector3(x, hw, 0), 0.1, M.fret, group);
      }
      // 指板上的圓點
      const dotGeo = new THREE.CircleGeometry(0.32, 24);
      const dotAt = function (x, y) { const d = new THREE.Mesh(dotGeo, M.pearl); d.position.set(x, y, 0.004); group.add(d); };
      [3, 5, 7, 9, 15, 17, 19].forEach(function (k) { dotAt((S.fretX(k - 1, Lc, rule) + S.fretX(k, Lc, rule)) / 2, 0); });
      { const xm = (S.fretX(11, Lc, rule) + S.fretX(12, Lc, rule)) / 2; dotAt(xm, -1.3); dotAt(xm, 1.3); }
      // 18 法則（或 2^(1/12)）的品格：淡色細線對照
      if (snap.show18 || rule === 'r18') {
        const other = rule === 'r18' ? 'et' : 'r18';
        const lm = rule === 'r18' ? mat(new THREE.MeshBasicMaterial({ color: color(pal['si-fret']), transparent: true, opacity: 0.9 })) : M.r18;
        for (let k = 1; k <= 19; k++) {
          const x = S.fretX(k, Lc, other), hw = wAt(x) / 2 + 0.6;
          box(x - 0.05, x + 0.05, -hw, hw, 0.0, 0.03, lm, group);
        }
      }
      // 琴枕（骨）
      box(-0.55, 0, -w0 / 2, w0 / 2, -0.6, 0.32, M.bone, group);
      return {
        zN: 0.32, zB: 0.95, sN: 0.86, sB: 1.16, fretTop: 0.1, frets: true, xEnd: xEnd, wAt: wAt, groundZ: -10.9,
        headEnd: function (i) { return new THREE.Vector3(-4.5 - (i % 3) * 3.6, (i < 3 ? -1 : 1) * 1.4 - (i - 2.5) * 0.12, -1.2); },
        tailEnd: function (i) { return new THREE.Vector3(Lc + 1.7, (i - 2.5) * 1.16, 0.42); },
        stopZ: function (x, r) { return 0.1 + r; },
        view: { x0: -18, x1: bx0 + blen + 1, halfH: 14, z: -2 }
      };
    }

    /** 小提琴：烏木指板（沒有品）、上漆的琴身與 f 孔、楓木琴碼 */
    function buildViolin(group, Lc, snap) {
      const sL = Lc / 32.8;
      const xEnd = 0.82 * Lc;
      const w0 = 2.4, w1 = 4.2;
      const wAt = function (x) { return w0 + (w1 - w0) * x / xEnd; };
      const bx0 = Lc - 19.5 * sL, blen = 35.5 * sL, bh = 20.6 * sL;
      const shape = outline(bx0, blen, [[0.03, 9 * sL], [0.14, 15.5 * sL], [0.24, 16.8 * sL], [0.35, 13.5 * sL], [0.44, 11 * sL], [0.53, 13.5 * sL], [0.7, 20.3 * sL], [0.84, 19.5 * sL], [0.96, 11 * sL]]);
      const varnish = '#' + color(pal['si-varnish']).lerp(color('#5a1806'), 0.42).getHexString();
      const tc = woodCanvas(varnish, { w: 2048, h: Math.round(2048 * bh / blen), seed: 31, lines: 240, contrast: 0.14, width: 1.6, wave: 1.2, ink: '40,12,2', sheen: true });
      {
        // f 孔：琴碼兩側，長軸沿琴身
        const g = tc.getContext('2d'), W = tc.width, H = tc.height;
        const ux = function (x) { return (x - bx0) / blen * W; }, vy = function (y) { return H / 2 - y / bh * H; };
        [-1, 1].forEach(function (sg) {
          const yc = sg * 5.2 * sL, half = 3.8 * sL;
          g.strokeStyle = '#140802'; g.fillStyle = '#140802'; g.lineCap = 'round';
          g.lineWidth = 0.38 * sL / blen * W;
          g.beginPath();
          g.moveTo(ux(Lc - half), vy(yc + sg * 0.9 * sL));
          g.bezierCurveTo(ux(Lc - half * 0.3), vy(yc + sg * 1.4 * sL), ux(Lc + half * 0.3), vy(yc - sg * 1.4 * sL), ux(Lc + half), vy(yc - sg * 0.6 * sL));
          g.stroke();
          const R = 0.42 * sL / blen * W;
          g.beginPath(); g.arc(ux(Lc - half), vy(yc + sg * 0.9 * sL), R, 0, Math.PI * 2); g.fill();
          g.beginPath(); g.arc(ux(Lc + half), vy(yc - sg * 0.6 * sL), R, 0, Math.PI * 2); g.fill();
          // 中間的刻口
          g.lineWidth = 0.12 * sL / blen * W;
          g.beginPath(); g.moveTo(ux(Lc), vy(yc - 0.5 * sL)); g.lineTo(ux(Lc), vy(yc + 0.5 * sL)); g.stroke();
        });
        // 鑲邊（purfling）：沿輪廓內縮一圈的細黑線，這裡畫成柔和的暗邊
        const gr = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.62);
        gr.addColorStop(0, 'rgba(255,220,160,0.10)'); gr.addColorStop(1, 'rgba(30,8,0,0.35)');
        g.fillStyle = gr; g.fillRect(0, 0, W, H);
      }
      const topTex = fitUV(tex(tc), bx0, -bh / 2, blen, bh);
      const topMat = mat(new THREE.MeshPhysicalMaterial({ map: topTex, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12 }));
      const sideMat = mat(new THREE.MeshPhysicalMaterial({ color: color(varnish).multiplyScalar(0.75), roughness: 0.3, clearcoat: 1 }));
      extrude(shape, -5.6, -1.8, [topMat, sideMat], 0.7, group);
      // 琴碼（楓木薄片）
      const mapleMat = mat(new THREE.MeshStandardMaterial({ map: tex(woodCanvas('#e2c896', { seed: 9, contrast: 0.08 })), roughness: 0.6 }));
      {
        // 琴碼的輪廓（y–z 平面）：兩隻腳、中間的拱形缺口、上緣是弧形；沿 x 擠出 0.4 cm
        const bs = new THREE.Shape();
        bs.moveTo(-2.1, -1.8); bs.lineTo(-1.2, -1.8); bs.lineTo(-1.0, -1.35);
        bs.quadraticCurveTo(0, -0.6, 1.0, -1.35); bs.lineTo(1.2, -1.8); bs.lineTo(2.1, -1.8);
        bs.lineTo(1.95, 1.4); bs.quadraticCurveTo(0, 1.75, -1.95, 1.4); bs.closePath();
        const heart = new THREE.Path(); heart.absellipse(0, 0.25, 0.35, 0.45, 0, Math.PI * 2, true);
        bs.holes.push(heart);
        const bg = new THREE.ExtrudeGeometry(bs, { depth: 0.36, bevelEnabled: false, curveSegments: 20 });
        bg.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1));
        bg.translate(Lc - 0.18, 0, 0);
        const bm = new THREE.Mesh(bg, mapleMat); bm.castShadow = true; group.add(bm);
      }
      // 拉弦板（烏木）
      const ebTex = tex(woodCanvas(pal['si-ebony'], { seed: 3, contrast: 0.12, ink: '0,0,0', sheen: true }));
      const ebMat = mat(new THREE.MeshPhysicalMaterial({ map: ebTex, roughness: 0.32, clearcoat: 0.6 }));
      {
        // 拉弦板：靠琴碼那端寬、往尾端收窄，尾端圓弧
        const x0 = Lc + 3.5, x1 = Lc + 14 * sL;
        const tp = new THREE.Shape();
        tp.moveTo(x0, -2.0); tp.quadraticCurveTo(x0 - 0.5, 0, x0, 2.0);
        tp.lineTo(x1 - 0.8, 1.0); tp.quadraticCurveTo(x1 + 0.2, 0, x1 - 0.8, -1.0); tp.closePath();
        extrude(tp, -1.5, 0.2, [ebMat, ebMat], 0.18, group);
      }
      // 琴頸與弦軸箱
      const neckMat = mat(new THREE.MeshPhysicalMaterial({ color: color(pal['si-varnish']).multiplyScalar(0.85), roughness: 0.35, clearcoat: 0.8 }));
      box(-0.3, bx0 + 1, -1.3, 1.3, -2.6, -0.5, neckMat, group);
      box(-9.5, -0.3, -1.25, 1.25, -2.4, -0.3, neckMat, group);
      box(-8.8, -1.0, -0.8, 0.8, -0.32, -0.28, M.hole, group);
      {
        // 琴頭的渦卷：兩圈半徑漸小的圓環＋中心的眼
        const sx = -10.8, sz = -1.0;
        const ring = function (R, r, y) {
          const t = new THREE.Mesh(new THREE.TorusGeometry(R, r, 14, 40), neckMat);
          t.rotation.x = Math.PI / 2; t.position.set(sx, y, sz); t.castShadow = true; group.add(t);
        };
        ring(1.25, 0.42, 0); ring(0.72, 0.3, 0);
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.42, 18, 12), neckMat);
        eye.position.set(sx, 0, sz); eye.scale.set(1, 1.9, 1); group.add(eye);
        box(-10.2, -9.4, -1.2, 1.2, -2.4, -0.3, neckMat, group);
      }
      for (let k = 0; k < 4; k++) {
        const x = -2.5 - k * 1.8, sg = k % 2 ? 1 : -1;
        cyl(new THREE.Vector3(x, 0, -1.3), new THREE.Vector3(x, sg * 3.4, -1.3), 0.32, ebMat, group);
      }
      // 指板（烏木）
      const fb = new THREE.Shape();
      fb.moveTo(0, -w0 / 2); fb.lineTo(xEnd, -w1 / 2); fb.quadraticCurveTo(xEnd + 0.4, 0, xEnd, w1 / 2); fb.lineTo(0, w0 / 2); fb.closePath();
      const fbTex = fitUV(tex(woodCanvas(pal['si-ebony'], { w: 2048, h: 256, seed: 53, lines: 90, contrast: 0.1, ink: '0,0,0', sheen: true })), 0, -w1 / 2, xEnd, w1);
      const fbMat = mat(new THREE.MeshPhysicalMaterial({ map: fbTex, roughness: 0.3, clearcoat: 0.5 }));
      extrude(fb, -0.5, 0, [fbMat, ebMat], 0, group);
      box(-0.4, 0, -w0 / 2, w0 / 2, -0.5, 0.12, ebMat, group);   // 上弦枕
      return {
        zN: 0.12, zB: 1.6, sN: 0.55, sB: 1.13, frets: false, xEnd: xEnd, wAt: wAt, groundZ: -6,
        headEnd: function (i) { return new THREE.Vector3(-2.5 - (3 - i) * 1.8, (i - 1.5) * 0.3, -0.6); },
        tailEnd: function (i) { return new THREE.Vector3(Lc + 4.5, (i - 1.5) * 0.9, 0.25); },
        stopZ: function (x, r) { return x <= xEnd ? r : 0.12 + r; },
        view: { x0: -13, x1: bx0 + blen + 1, halfH: 11, z: -1.5 }
      };
    }

    /** 二胡：琴桿、千斤、六角琴筒（蒙蟒皮）與琴碼；沒有指板，手指在空中按弦 */
    function buildErhu(group, Lc, snap) {
      const sL = Lc / 40;
      const rodTex = tex(woodCanvas(pal['si-rod'], { seed: 61, contrast: 0.2, ink: '0,0,0', sheen: true }), { repeat: true });
      rodTex.repeat.set(1, 1);
      const rodMat = mat(new THREE.MeshPhysicalMaterial({ map: rodTex, roughness: 0.32, clearcoat: 0.9, clearcoatRoughness: 0.15 }));
      // 琴桿：從琴頭貫穿到琴筒
      cyl(new THREE.Vector3(-22, 0, 0), new THREE.Vector3(Lc + 4.5 * sL, 0, 0), 1.15, rodMat, group);
      // 琴頭（略彎的頂端）與兩個琴軸
      const top = new THREE.Mesh(new THREE.SphereGeometry(1.3, 20, 14), rodMat);
      top.position.set(-22, 0, 0); top.castShadow = true; group.add(top);
      [-17, -12].forEach(function (x, k) {
        const sg = k ? 1 : -1;
        cyl(new THREE.Vector3(x, 0, 0), new THREE.Vector3(x, sg * 6.5, 0), 0.45, rodMat, group);
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.9, 18, 12), rodMat);
        knob.position.set(x, sg * 6.5, 0); knob.scale.set(1, 0.7, 1); knob.castShadow = true; group.add(knob);
      });
      // 琴筒：六角柱，軸朝上，頂面蒙蟒皮；琴碼站在皮上
      const R = 4.6 * sL, zTop = 2.8, zBot = -6.5;
      const skin = document.createElement('canvas'); skin.width = skin.height = 512;
      {
        const g = skin.getContext('2d');
        g.fillStyle = '#d6ccb6'; g.fillRect(0, 0, 512, 512);
        const r = rng(19);
        for (let y = -10; y < 530; y += 22) {
          for (let x = -10 + ((y / 22) % 2) * 15; x < 530; x += 30) {
            const s = 0.55 + 0.45 * r();
            g.fillStyle = 'rgba(' + Math.round(60 + 40 * s) + ',' + Math.round(48 + 30 * s) + ',' + Math.round(30 + 20 * s) + ',0.55)';
            g.beginPath(); g.moveTo(x, y); g.lineTo(x + 15, y + 11); g.lineTo(x + 30, y); g.lineTo(x + 15, y - 11); g.closePath(); g.fill();
            g.strokeStyle = 'rgba(245,238,220,0.55)'; g.lineWidth = 2; g.stroke();
          }
        }
      }
      const skinMat = mat(new THREE.MeshStandardMaterial({ map: tex(skin), roughness: 0.75 }));
      const drumGeo = new THREE.CylinderGeometry(R, R, zTop - zBot, 6, 1, false);
      drumGeo.rotateX(Math.PI / 2);
      const drum = new THREE.Mesh(drumGeo, [rodMat, skinMat, rodMat]);
      drum.position.set(Lc + 1.0 * sL, 0, (zTop + zBot) / 2);
      drum.rotation.z = Math.PI / 6;
      drum.castShadow = true; drum.receiveShadow = true;
      group.add(drum);
      // 琴碼（小木塊）與琴托
      const bridgeMat = mat(new THREE.MeshStandardMaterial({ map: tex(woodCanvas('#c9a46a', { seed: 4, contrast: 0.12 })), roughness: 0.6 }));
      box(Lc - 0.35, Lc + 0.35, -0.9, 0.9, zTop, 3.9, bridgeMat, group);
      cyl(new THREE.Vector3(Lc + 1.0 * sL, 0, zBot), new THREE.Vector3(Lc + 1.0 * sL, 0, zBot - 2.2), 0.9, rodMat, group);
      // 千斤：把兩條弦拉向琴桿的繩圈（相當於琴枕）
      const knotMat = mat(new THREE.MeshStandardMaterial({ color: 0xe8dcbc, roughness: 0.85 }));
      for (let k = -2; k <= 2; k++) {
        const t = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.12, 8, 28), knotMat);
        t.position.set(k * 0.24, 0, 0.75); t.rotation.y = Math.PI / 2; t.scale.set(1, 0.85, 1);
        t.castShadow = true; group.add(t);
      }
      return {
        zN: 1.8, zB: 3.9, sN: 0.7, sB: 0.7, frets: false, xEnd: 0, wAt: function () { return 2; }, groundZ: -9,
        headEnd: function (i) { return new THREE.Vector3(i ? -12 : -17, 0, 0.3); },
        tailEnd: function (i) { return new THREE.Vector3(Lc + 3.5 * sL, (i - 0.5) * 0.5, zTop + 0.2); },
        stopZ: function (x, r) { return geoZ(x) - 0.45 + r; },
        view: { x0: -24, x1: Lc + 8, halfH: 9, z: 0 }
      };
      function geoZ(x) { return 1.8 + (3.9 - 1.8) * x / Lc; }
    }

    // =====================================================================
    // 會動的東西：振動的弦（自己做的管狀網格）、死段、手指、輕觸點、節點、撥片、弓
    // =====================================================================
    const tubeGeo = new THREE.BufferGeometry();
    const tPos = new Float32Array((NX + 1) * NRAD * 3), tNor = new Float32Array((NX + 1) * NRAD * 3);
    {
      const idx = [];
      for (let k = 0; k < NX; k++) {
        for (let j = 0; j < NRAD; j++) {
          const a = k * NRAD + j, b = k * NRAD + (j + 1) % NRAD, c = (k + 1) * NRAD + j, d = (k + 1) * NRAD + (j + 1) % NRAD;
          idx.push(a, c, b, b, c, d);
        }
      }
      tubeGeo.setIndex(idx);
      tubeGeo.setAttribute('position', new THREE.BufferAttribute(tPos, 3).setUsage(THREE.DynamicDrawUsage));
      tubeGeo.setAttribute('normal', new THREE.BufferAttribute(tNor, 3).setUsage(THREE.DynamicDrawUsage));
    }
    const ringCos = [], ringSin = [];
    for (let j = 0; j < NRAD; j++) { ringCos.push(Math.cos(j / NRAD * Math.PI * 2)); ringSin.push(Math.sin(j / NRAD * Math.PI * 2)); }
    const tube = new THREE.Mesh(tubeGeo, selMats.nylon);
    tube.castShadow = true; tube.frustumCulled = false;
    scene.add(tube);
    const deadA = new THREE.Mesh(unitCyl, selMats.nylon), deadB = new THREE.Mesh(unitCyl, selMats.nylon);
    deadA.castShadow = deadB.castShadow = true;
    scene.add(deadA); scene.add(deadB);

    /** 手指：圓潤的指尖＋指甲＋往後延伸的指節 */
    function makeFinger(m) {
      const g = new THREE.Group();
      const ball = function (r, pos, sx, sy, sz) {
        const b = new THREE.Mesh(sphereGeo, m);
        b.scale.set(r * (sx || 1), r * (sy || 1), r * (sz || 1)); b.position.copy(pos); b.castShadow = true; g.add(b);
        return b;
      };
      const seg = function (a, b, r) { const c = placeCyl(new THREE.Mesh(unitCyl, m), a, b, r); c.castShadow = true; g.add(c); };
      const p0 = new THREE.Vector3(0, 0, 0.15), p1 = new THREE.Vector3(0, -0.85, 2.05), p2 = new THREE.Vector3(0.1, -3.6, 2.95);
      ball(0.74, new THREE.Vector3(0, 0, 0.05), 1.08, 1, 0.9);   // 指腹
      seg(p0, p1, 0.7);
      ball(0.76, p1);
      seg(p1, p2, 0.8);
      ball(0.86, p2);
      if (m === M.finger) {
        const nail = new THREE.Mesh(sphereGeo, M.nail);
        nail.scale.set(0.5, 0.2, 0.62); nail.position.set(0, -0.62, 0.95); nail.rotation.x = 0.42;
        g.add(nail);
      }
      g.visible = false;
      scene.add(g);
      return g;
    }
    const finger = makeFinger(M.finger);
    const ghost = makeFinger(M.ghost);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.07, 10, 32), M.ring);
    ring.visible = false; scene.add(ring);
    const nodeGeo = new THREE.SphereGeometry(0.32, 18, 12), glowGeo = new THREE.SphereGeometry(0.8, 18, 12);
    const nodes = [];
    for (let k = 0; k < MAXN; k++) {
      const m = new THREE.Mesh(nodeGeo, M.node), g = new THREE.Mesh(glowGeo, M.glow);
      m.add(g); m.visible = false; scene.add(m); nodes.push(m);
    }
    // 撥片（圓角三角形，薄）
    const pickShape = new THREE.Shape();
    pickShape.moveTo(-0.9, 0.55); pickShape.quadraticCurveTo(0, 1.05, 0.9, 0.55); pickShape.quadraticCurveTo(0.6, -0.35, 0, -0.95); pickShape.quadraticCurveTo(-0.6, -0.35, -0.9, 0.55);
    const pickGeo = new THREE.ExtrudeGeometry(pickShape, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.05, bevelSegments: 2, curveSegments: 16 });
    const pick = new THREE.Mesh(pickGeo, M.pick);
    pick.castShadow = true; pick.visible = false; scene.add(pick);
    // 弓（拉弓時）：弓桿＋馬尾，垂直於弦
    const bow = new THREE.Group();
    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.9, 34, 0.08), M.bowHair);
    hair.position.set(0, 0, 0.05); hair.castShadow = true; bow.add(hair);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 36, 12), M.bowStick);
    stick.position.set(0, 0, 1.25); stick.castShadow = true; bow.add(stick);
    bow.visible = false; scene.add(bow);

    const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vS = new THREE.Vector3();
    /** 振動弦：中心線由琴橋（u = 0）到停止點（u = 1），位移加在 y 方向（和面板平行，古典吉他撥弦的方向） */
    function updateTube(B, Sp, r, live) {
      for (let k = 0; k <= NX; k++) {
        const u = k / NX;
        const dy = live ? AMP * S.shapeAt(u, live.amps, live.phase, live.decay, live.bow) : 0;
        const cx = B.x + (Sp.x - B.x) * u, cy = B.y + (Sp.y - B.y) * u + dy, cz = B.z + (Sp.z - B.z) * u;
        for (let j = 0; j < NRAD; j++) {
          const p = (k * NRAD + j) * 3;
          tPos[p] = cx; tPos[p + 1] = cy + r * ringCos[j]; tPos[p + 2] = cz + r * ringSin[j];
          tNor[p] = 0; tNor[p + 1] = ringCos[j]; tNor[p + 2] = ringSin[j];
        }
      }
      tubeGeo.attributes.position.needsUpdate = true;
      tubeGeo.attributes.normal.needsUpdate = true;
      tubeGeo.computeBoundingSphere();
    }
    function along(B, Sp, u, live, out) {
      const dy = live ? AMP * S.shapeAt(u, live.amps, live.phase, live.decay, live.bow) : 0;
      return out.set(B.x + (Sp.x - B.x) * u, B.y + (Sp.y - B.y) * u + dy, B.z + (Sp.z - B.z) * u);
    }

    // ---------- HTML 標籤（字體隨設定縮放、簡體自動轉換、深淺色由 CSS 代號決定） ----------
    const labels = [];
    function addLabel(cls) {
      const el = document.createElement('div');
      el.className = 'si3-lbl ' + (cls || '');
      layer.appendChild(el);
      const L = { el: el, world: new THREE.Vector3(), ax: -50, ay: -100, dx: 0, dy: -6, show: false, html: '' };
      labels.push(L);
      return L;
    }
    function setHTML(L, html) { if (L.html !== html) { L.html = html; L.el.innerHTML = html; } }
    const lbStop = addLabel(''), lbPick = addLabel(''), lbNode = addLabel(''), lbGapA = addLabel('note'), lbGapB = addLabel('note');
    lbStop.el.style.color = 'var(--si-finger)';
    lbPick.el.style.color = 'var(--si-pick)';
    lbNode.el.style.color = 'var(--si-touch)';
    const note = document.createElement('div');
    note.className = 'si3-lbl note';
    note.style.cssText = 'top:auto;bottom:6px;left:8px;transform:none;white-space:normal;max-width:calc(100% - 16px);';
    layer.appendChild(note);
    const tv = new THREE.Vector3();
    function placeLabels() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      labels.forEach(function (L) {
        if (!L.show) { if (L.el.style.display !== 'none') L.el.style.display = 'none'; return; }
        tv.copy(L.world).project(camera);
        if (tv.z > 1 || tv.z < -1) { L.el.style.display = 'none'; return; }
        const x = (tv.x + 1) / 2 * w + L.dx, y = (1 - tv.y) / 2 * h + L.dy;
        if (L.el.style.display === 'none') L.el.style.display = '';
        L.el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) translate(' + L.ax + '%,' + L.ay + '%)';
      });
    }
    const mm = function (cm) { return (cm * 10).toFixed(1); };

    // =====================================================================
    // 每一幀：由 snapshot 更新場景
    // =====================================================================
    function update() {
      const snap = env.snapshot();
      const key = keyOf(snap);
      if (key !== builtKey || !inst) { buildInstrument(snap); builtKey = key; }
      const g = inst.geo, Lc = g.L, si = snap.si, r = g.r[si];
      const inf = snap.inf, live = snap.live;
      // 停止點：按弦的品格（或手指）；輕觸與空弦時是琴枕
      const nut = vA.set(0, g.y(si, 0), g.zN + r).clone();
      const B = new THREE.Vector3(Lc, g.y(si, Lc), g.zB + r);
      const xs = Lc - inf.Leff * 100;
      let Sp;
      const pressed = inf.hand === 'press' && xs > 1e-6;
      if (pressed) Sp = new THREE.Vector3(xs, g.y(si, xs), g.stopZ(xs, r));
      else Sp = nut.clone();
      updateTube(B, Sp, r, live);
      // 死段（琴枕到手指）：吉他壓到品條上，手指在品條後面一點
      if (pressed) {
        let xf = xs;
        if (g.frets && inf.fret) {
          const xp = S.fretX(inf.fret - 1, Lc, snap.rule);
          xf = xs - 0.3 * (xs - xp);
        }
        const F = new THREE.Vector3(xf, g.y(si, xf), g.frets ? g.fretTop + r * 0.6 : Sp.z);
        placeCyl(deadA, nut, F, r); deadA.visible = true;
        if (xf < xs - 1e-6) { placeCyl(deadB, F, Sp, r); deadB.visible = true; } else deadB.visible = false;
        finger.position.set(xf, F.y, F.z + r + 0.62);
        finger.rotation.set(0, 0, 0);
        finger.visible = true;
        lbStop.show = true;
        lbStop.world.set(xf, F.y, F.z + 2.2);
        setHTML(lbStop, g.frets ? T('第 ' + inf.fret + ' 品', 'fret ' + inf.fret) : T('手指 +' + inf.finger.toFixed(2) + ' 半音', 'finger +' + inf.finger.toFixed(2) + ' st'));
      } else {
        deadA.visible = deadB.visible = false;
        finger.visible = false;
        lbStop.show = false;
      }
      // 輕觸：半透明的手指、弦上的小環、節點光點
      const touching = inf.hand === 'touch';
      ghost.visible = ring.visible = touching;
      let nN = 0;
      if (touching) {
        const xt = inf.touch * Lc, zt = g.z(xt) + r;
        ghost.position.set(xt, g.y(si, xt), zt + 0.7);
        ring.position.set(xt, g.y(si, xt), zt);
        ring.rotation.set(0, Math.PI / 2, 0);
        const k = inf.lowest;
        if (k && k >= 2) {
          for (let j = 1; j < k && nN < MAXN; j++) {
            along(B, Sp, j / k, live, vS);
            nodes[nN].position.copy(vS);
            nodes[nN].visible = true;
            nN++;
          }
          lbNode.show = true;
          along(B, Sp, (k - 1) / k, live, lbNode.world); lbNode.world.z += 1.0;
          setHTML(lbNode, T('節點（第 ' + k + ' 泛音）', 'nodes (harmonic ' + k + ')'));
        } else lbNode.show = false;
      } else lbNode.show = false;
      for (let j = nN; j < MAXN; j++) nodes[j].visible = false;
      // 撥弦點或弓
      const beta = snap.beta;
      along(B, Sp, beta, live, vS);
      const bowing = !!(live && live.bow);
      bow.visible = bowing;
      pick.visible = !bowing;
      if (bowing) {
        bow.position.set(vS.x, vS.y, vS.z + r + 0.04);
        bow.rotation.set(0, 0, 0.12);
        lbPick.world.set(vS.x, vS.y - 14, vS.z + 2.4);
        setHTML(lbPick, T('弓', 'bow'));
      } else {
        pick.position.set(vS.x, vS.y - 0.2, vS.z + r + 0.9);
        pick.rotation.set(-0.5, 0, Math.PI / 2);
        lbPick.world.set(vS.x, vS.y, vS.z + 2.4);
        setHTML(lbPick, T('撥弦點 β = ', 'pluck β = ') + beta.toFixed(2));
      }
      lbPick.show = true;
      // 品格越往琴身越密：第 1 格與第 19 格的寬度
      if (g.frets) {
        const w1 = S.fretX(1, Lc, snap.rule), x18 = S.fretX(18, Lc, snap.rule), x19 = S.fretX(19, Lc, snap.rule);
        lbGapA.show = lbGapB.show = true;
        lbGapA.world.set(w1 / 2, -g.wAt(w1 / 2) / 2 - 0.4, 0); lbGapA.ay = 0; lbGapA.dy = 6;
        lbGapB.world.set((x18 + x19) / 2, -g.wAt(x19) / 2 - 0.4, 0); lbGapB.ay = 0; lbGapB.dy = 6;
        setHTML(lbGapA, T('第 1 格 ', 'fret 1: ') + mm(w1) + ' mm');
        setHTML(lbGapB, T('第 19 格 ', 'fret 19: ') + mm(x19 - x18) + ' mm');
      } else lbGapA.show = lbGapB.show = false;
      const narrow = (canvas.clientWidth || 640) < 480;
      const nt = narrow ? T('比例真實；弦粗放大 ' + SR + ' 倍、振動放大', 'to scale; strings ' + SR + '× thicker, motion exaggerated')
        : T('弦長與品格依真實比例；弦的粗細放大 ' + SR + ' 倍、振動幅度放大示意', 'lengths and frets to scale; strings drawn ' + SR + '× thicker, vibration exaggerated');
      if (note.textContent !== nt) note.textContent = nt;
      return snap;
    }

    // ---------- 相機：整條弦（琴枕到琴橋）放進畫面 ----------
    function fit() {
      if (!inst) return;
      const v = inst.geo.view;
      const w = canvas.clientWidth || 640, h = canvas.clientHeight || 400, aspect = w / h;
      const target = new THREE.Vector3((v.x0 + v.x1) / 2, 0, v.z);
      const portrait = aspect < 1;
      const dir = (portrait ? new THREE.Vector3(-0.42, -0.1, 1) : new THREE.Vector3(0, -0.62, 1)).normalize();
      const along = (v.x1 - v.x0) / 2, across = v.halfH;
      const needW = portrait ? across : along, needH = portrait ? along : across;
      // 直向畫面：琴頭在下方，註記改放上方，才不會蓋住琴枕與第 1 品
      note.style.top = portrait ? '6px' : 'auto';
      note.style.bottom = portrait ? 'auto' : '6px';
      const t = Math.tan(camera.fov * Math.PI / 360);
      const dist = Math.max(needH / t, needW / (t * aspect)) * (portrait ? 1.08 : 1.06);
      controls.target.copy(target);
      camera.position.copy(target).addScaledVector(dir, dist);
      camera.near = Math.max(0.3, dist / 80);
      camera.far = dist * 12;
      camera.updateProjectionMatrix();
      controls.update();
    }

    // ---------- 繪製（只在需要時畫：狀態改變、相機移動） ----------
    let raf = 0;
    function renderNow() {
      if (!view.active || document.hidden) return;
      const want = Math.min(window.devicePixelRatio || 1, 2);
      if (renderer.getPixelRatio() !== want) { renderer.setPixelRatio(want); resize3(); return; }
      const moved = controls.update();
      renderer.render(scene, camera);
      placeLabels();
      if (moved) requestRender();
    }
    function requestRender() {
      if (raf || !view.active) return;
      raf = requestAnimationFrame(function () { raf = 0; renderNow(); });
    }
    let fitted = false, lastInst = '', lastL = 1;
    function resize3() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (!fitted) { fit(); fitted = true; }
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
      frame: function () {
        const snap = update();
        // 換了樂器、或弦長改變超過 15%：重新對準相機（小幅調整時保留學生轉好的視角）
        if (snap.inst !== lastInst || Math.abs(inst.geo.L / lastL - 1) > 0.15) {
          lastInst = snap.inst; lastL = inst.geo.L;
          if (fitted) fit();
        }
        renderNow();
      },
      onTheme: function () { applyColors(); builtKey = ''; update(); requestRender(); },
      resetCamera: function () { fit(); requestRender(); },
      dispose: function () {
        view.active = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        document.removeEventListener('visibilitychange', onVisible);
        controls.dispose();
        disposeInst();
        scene.traverse(function (o) {
          if (o.geometry && o.geometry !== unitCyl && o.geometry !== sphereGeo) o.geometry.dispose();
        });
        Object.keys(M).forEach(function (k) { M[k].dispose(); });
        Object.keys(selMats).forEach(function (k) { selMats[k].dispose(); });
        ground.material.dispose();
        unitCyl.dispose(); sphereGeo.dispose(); tubeGeo.dispose(); nodeGeo.dispose(); glowGeo.dispose(); pickGeo.dispose();
        if (envTex) envTex.dispose();
        renderer.dispose();
        try { renderer.forceContextLoss(); } catch (e) { /* 繪圖環境已中斷 */ }
        canvas.remove(); layer.remove();
      }
    };

    applyColors();
    { const s0 = update(); lastInst = s0.inst; lastL = inst.geo.L; }
    resize3();
    requestRender();
    return view;
  }

  window.StringInstrument3D = { create: create, SR: SR };
})();
