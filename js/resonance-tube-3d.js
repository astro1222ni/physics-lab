/*
 * resonance-tube-3d.js — 「氣柱的共鳴（共鳴管測聲速）」的 3D 立體檢視
 *
 * 這個檔案本身不依賴 three.js：使用者按「3D 立體」時，resonance-tube.js 才以 import() 載入
 * vendor/three/，再呼叫 ResonanceTube3D.create(lib, env) 建立場景；切回 2D 時 dispose() 釋放全部資源。
 *
 * 畫面上的物理量全部來自 env.snapshot()（與 2D 同一個物理核心 resonance-tube-core.js）：
 *   水面高度 L、空氣層的位移 u = U sin(ky) cos(ωt)（y 由水面往上量，慢動作）、
 *   位移振幅的包絡 ∝ G·|sin ky|（G 為多次反射的放大倍數）、波節與波腹（含管口修正 e）、
 *   已記錄的橡皮筋讀數。
 * 場景座標（cm）：z 朝上；管內底（L = 100 cm）z = Z0，管口 z = ZM = Z0 + 100。
 * 高度依真實比例；管徑放大 RS 倍示意（和 2D 一樣，放大寬度才看得見管內的空氣層），畫面左下角有註明。
 */
(function () {
  'use strict';
  const RS = 3;                 // 管徑放大倍數（示意）
  const Z0 = 7;                 // 管內底的高度
  const BASE_T = 1.6;           // 底座厚度
  const WALL = 0.32;            // 管壁厚（畫面上）
  const ROD = { x: 15, y: 7, r: 0.6 };
  const TANK = { x: 27, r: 4.2, h: 9, depth: 4 };   // 蓄水桶（水深 depth，水面與管內水面同高：連通管）
  const RULER_W = 4.2, RULER_TOP = 1.5;             // 米尺寬、0 刻度以上的長度
  const DISC_GAP = 1.8;         // 空氣層的靜止間距（cm）
  const MAXD = 70;              // 空氣層數上限
  const NR = 220, NS = 44;      // 位移振幅包絡面的格點（高度 × 圓周）
  const CLAMPS = [14, 84];      // 夾具位置（距管內底，cm）

  function create(lib, env) {
    const THREE = lib.THREE;
    const T = env.T, host = env.host, C = env.C;
    const LD = window.LabDraw;
    const LEN = (env.tubeLen || 1) * 100, ZM = Z0 + LEN;
    const reduced = function () { return !!(env.reducedMotion && env.reducedMotion()); };

    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('共鳴管的 3D 立體檢視：玻璃管、管內的水與空氣層、米尺、橡皮筋、音叉與蓄水桶（可拖曳旋轉、雙指或滾輪縮放、方向鍵平移）',
      '3D view of the resonance tube: the glass tube, the water and the layers of air inside, the scale, the rubber bands, the tuning fork and the reservoir (drag to rotate, pinch or scroll to zoom, arrow keys to pan)'));
    canvas.tabIndex = 0;
    host.appendChild(canvas);
    const layer = document.createElement('div');
    layer.className = 'rt3-labels';
    layer.setAttribute('aria-hidden', 'true');
    host.appendChild(layer);
    let renderer;
    try {
      // alpha：背景由 CSS 的徑向漸層提供（隨深淺色自動變化）
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

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 1, 3000);
    camera.up.set(0, 0, 1);
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.minDistance = 14;
    controls.maxDistance = 600;
    controls.maxPolarAngle = Math.PI * 0.86;   // 可以稍微由下往上看，但不鑽到桌面底下
    if (controls.listenToKeyEvents) controls.listenToKeyEvents(canvas);

    // ---------- 顏色（與 2D 相同的 CSS 代號） ----------
    const pal = {};
    function readPalette() {
      const cs = getComputedStyle(document.documentElement);
      pal.dark = !!LD.dark;
      pal.wave = cs.getPropertyValue('--b-wave').trim() || '#0e7490';
      ['accent', 'equi', 'pos', 'neg', 'text', 'muted'].forEach(function (k) { pal[k] = LD.c[k] || '#888888'; });
      pal.bg = LD.c['canvas-bg'] || (pal.dark ? '#111111' : '#ffffff');
      pal.water = LD.mix(pal.neg, pal.wave, 0.35);
    }
    function color(v) { return new THREE.Color(v); }

    // ---------- 環境光（玻璃的反光用）：上方一片亮的燈箱、四周灰牆 ----------
    let envTex = null;
    function buildEnvironment() {
      if (envTex) { envTex.dispose(); envTex = null; }
      const dk = pal.dark;
      const es = new THREE.Scene();
      const geo = new THREE.SphereGeometry(100, 32, 16);
      const cols = [];
      const pos = geo.attributes.position;
      const top = color(dk ? '#3a4650' : '#eef2f5'), mid = color(dk ? '#1c2328' : '#aeb7bd'), bot = color(dk ? '#0b0f12' : '#5d666b');
      const c = new THREE.Color();
      for (let i = 0; i < pos.count; i++) {
        const u = pos.getY(i) / 100;   // 這個球的 y 軸 = 世界的 z 軸（下面旋轉）
        if (u > 0) c.copy(mid).lerp(top, u); else c.copy(mid).lerp(bot, -u);
        cols.push(c.r, c.g, c.b);
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      const sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide }));
      sky.rotation.x = Math.PI / 2;
      es.add(sky);
      // 兩片長條燈：玻璃管上會映出細長的亮帶
      const pm0 = new THREE.MeshBasicMaterial({ color: color(dk ? '#d8d2c0' : '#ffffff').multiplyScalar(dk ? 2.2 : 3), side: THREE.DoubleSide });
      const p1 = new THREE.Mesh(new THREE.PlaneGeometry(14, 120), pm0);
      p1.position.set(-60, -55, 20); p1.lookAt(0, 0, 20);
      const p2 = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), pm0);
      p2.position.set(0, 0, 85);
      es.add(p1); es.add(p2);
      const pmrem = new THREE.PMREMGenerator(renderer);
      envTex = pmrem.fromScene(es, 0.02).texture;
      pmrem.dispose();
      geo.dispose(); sky.material.dispose(); p1.geometry.dispose(); p2.geometry.dispose(); pm0.dispose();
      scene.environment = envTex;
    }

    // ---------- 燈光 ----------
    const hemi = new THREE.HemisphereLight(0xffffff, 0x6b6b6b, 0.95);
    hemi.position.set(0, 0, 1);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(-55, -70, 190);
    sun.target.position.set(8, 3, 0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.radius = 4;
    sun.shadow.bias = -0.0005;
    const sc = sun.shadow.camera;
    sc.left = -80; sc.right = 80; sc.bottom = -80; sc.top = 80; sc.near = 20; sc.far = 450;
    scene.add(sun); scene.add(sun.target);
    const rim = new THREE.DirectionalLight(0xfff1dc, 0.9);   // 右後方的輪廓光：玻璃與金屬的邊緣亮起來
    rim.position.set(80, 60, 70);
    scene.add(rim);

    // ---------- 材質（共用；切換深淺色時只改顏色） ----------
    const M = {
      glassBack: new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.05, transparent: true, opacity: 0.12, side: THREE.BackSide, depthWrite: false, envMapIntensity: 1.2 }),
      glassFront: new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.04, transparent: true, opacity: 0.2, clearcoat: 1, clearcoatRoughness: 0.04, side: THREE.FrontSide, depthWrite: false, envMapIntensity: 1.6 }),
      water: new THREE.MeshPhysicalMaterial({ color: 0x3a7fb0, metalness: 0, roughness: 0.12, transparent: true, opacity: 0.72, depthWrite: false, envMapIntensity: 0.8 }),
      waterTop: new THREE.MeshPhysicalMaterial({ color: 0x8cc4e6, metalness: 0, roughness: 0.06, transparent: true, opacity: 0.88, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false }),
      steel: new THREE.MeshStandardMaterial({ color: 0xc9cfd4, metalness: 0.9, roughness: 0.28 }),
      iron: new THREE.MeshStandardMaterial({ color: 0x3b4146, metalness: 0.55, roughness: 0.5 }),
      rubber: new THREE.MeshStandardMaterial({ color: 0x2a2a2d, metalness: 0, roughness: 0.85 }),
      hose: new THREE.MeshPhysicalMaterial({ color: 0xc08a3e, metalness: 0, roughness: 0.42, clearcoat: 0.4 }),
      band: new THREE.MeshStandardMaterial({ color: 0xd9433b, metalness: 0, roughness: 0.6 }),
      rulerSide: new THREE.MeshStandardMaterial({ color: 0xe9e2d0, metalness: 0, roughness: 0.8 }),
      ruler: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0, roughness: 0.75 }),
      mark: new THREE.MeshBasicMaterial({ color: 0x0f766e }),
      env: new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.45, metalness: 0 }),
      disc: new THREE.MeshStandardMaterial({ color: 0x555555, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false, roughness: 0.6, metalness: 0 }),
      node: new THREE.MeshStandardMaterial({ color: 0x0f766e, metalness: 0.1, roughness: 0.35, transparent: true }),
      anti: new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.1, roughness: 0.3, transparent: true }),
      phone: new THREE.MeshStandardMaterial({ color: 0x25292d, metalness: 0.45, roughness: 0.35 }),
      screen: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0, roughness: 0.2, emissive: 0xffffff, emissiveIntensity: 0.85 })
    };
    // 玻璃的輪廓：視線掠過管壁的地方（側緣）比較不透明，像真的玻璃管一樣看得出邊界
    M.rim = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0x3f5f66) }, uBase: { value: 0.02 }, uRim: { value: 0.6 } },
      vertexShader: [
        'varying vec3 vN;', 'varying vec3 vV;',
        'void main() {',
        '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
        '  vN = normalize(normalMatrix * normal);', '  vV = normalize(-mv.xyz);',
        '  gl_Position = projectionMatrix * mv;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uColor;', 'uniform float uBase;', 'uniform float uRim;',
        'varying vec3 vN;', 'varying vec3 vV;',
        'void main() {',
        '  float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));',
        '  gl_FragColor = vec4(uColor, uBase + uRim * pow(f, 3.0));',
        '  #include <tonemapping_fragment>',
        '  #include <colorspace_fragment>',
        '}'
      ].join('\n'),
      transparent: true, depthWrite: false, side: THREE.DoubleSide
    });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.ShadowMaterial({ opacity: 0.2 }));
    ground.receiveShadow = true;
    scene.add(ground);

    function applyTheme() {
      readPalette();
      buildEnvironment();
      const dk = pal.dark;
      ground.material.opacity = dk ? 0.38 : 0.18;
      M.water.color.set(pal.water);
      M.waterTop.color.set(LD.mix(pal.water, '#ffffff', 0.45));
      M.env.color.set(pal.wave);
      M.env.emissive.set(pal.wave);
      M.env.emissiveIntensity = dk ? 0.35 : 0.18;
      M.disc.color.set(LD.mix(pal.text, pal.bg, dk ? 0.15 : 0.25));
      M.disc.opacity = dk ? 0.62 : 0.55;
      M.node.color.set(pal.accent);
      M.anti.color.set(pal.equi);
      M.band.color.set(pal.pos);
      M.mark.color.set(pal.accent);
      M.hose.color.set(LD.shade(pal.equi, dk ? -0.2 : -0.1));
      M.ruler.color.set(dk ? 0xbdb6a6 : 0xffffff);
      M.rulerSide.color.set(dk ? 0xa8a192 : 0xe9e2d0);
      M.glassFront.opacity = dk ? 0.16 : 0.2;
      M.rim.uniforms.uColor.value.set(dk ? '#cfe6ea' : '#3f5f66');
      M.rim.uniforms.uRim.value = dk ? 0.5 : 0.6;
      drawScreen(true);
    }

    // ---------- 工具 ----------
    function disposeGeometries(group) {
      group.traverse(function (o) { if (o.geometry) o.geometry.dispose(); });
      while (group.children.length) group.remove(group.children[0]);
    }
    function mesh(geo, mat, cast, recv) {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = !!cast; m.receiveShadow = !!recv;
      return m;
    }
    /** 沿 z 軸的圓柱（底在 z0、頂在 z1） */
    function zCyl(r0, r1, z0, z1, mat, seg, open) {
      const g = new THREE.CylinderGeometry(r1, r0, z1 - z0, seg || 32, 1, !!open);
      g.rotateX(Math.PI / 2);
      const m = mesh(g, mat, true, true);
      m.position.z = (z0 + z1) / 2;
      return m;
    }
    /** 由 (x0, y0) 水平延伸到 (x1, y1) 的方棒（高度 z） */
    function bar(x0, y0, x1, y1, z, w, mat) {
      const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
      const m = mesh(new THREE.BoxGeometry(len, w, w), mat, true, true);
      m.position.set((x0 + x1) / 2, (y0 + y1) / 2, z);
      m.rotation.z = Math.atan2(dy, dx);
      return m;
    }
    /** 透明玻璃：背面先畫（在水之前）、正面最後畫 */
    function glass(geo, group, x, y, z, rim) {
      const b = new THREE.Mesh(geo, M.glassBack), f = new THREE.Mesh(geo, M.glassFront);
      b.renderOrder = 0; f.renderOrder = 6;
      const ms = [b, f];
      if (rim) { const r = new THREE.Mesh(geo, M.rim); r.renderOrder = 7; ms.push(r); }
      ms.forEach(function (m) { m.position.set(x || 0, y || 0, z || 0); group.add(m); });
    }

    // ---------- 鐵架：底座、支柱 ----------
    const base = mesh(new THREE.BoxGeometry(48, 26, BASE_T), M.iron, true, true);
    base.position.set(8, 3, BASE_T / 2);
    scene.add(base);
    const rod = zCyl(ROD.r, ROD.r, BASE_T, ZM + 7, M.steel, 20);
    rod.position.x = ROD.x; rod.position.y = ROD.y;
    scene.add(rod);
    const rodCap = mesh(new THREE.SphereGeometry(ROD.r * 1.05, 16, 10), M.steel, true, false);
    rodCap.position.set(ROD.x, ROD.y, ZM + 7);
    scene.add(rodCap);

    // ---------- 米尺的刻度貼圖（0 在管口、往下到 100 cm；1 mm 小刻度） ----------
    const RH = LEN + RULER_TOP + (Z0 - BASE_T) + 0.05;  // 米尺立在底座上（底端略嵌入），頂端高出管口 RULER_TOP
    const rulerCv = document.createElement('canvas');
    const rulerTex = (function () {
      const H = 4096, ppc = H / RH, W = Math.round(RULER_W * ppc);
      rulerCv.width = W; rulerCv.height = H;
      const g = rulerCv.getContext('2d');
      const bg = g.createLinearGradient(0, 0, W, 0);
      bg.addColorStop(0, '#efe8d6'); bg.addColorStop(0.5, '#f7f2e6'); bg.addColorStop(1, '#ece4d0');
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
      const y0 = RULER_TOP * ppc;
      g.strokeStyle = '#17140f';
      for (let i = 0; i <= LEN * 10; i++) {
        const y = y0 + i * ppc / 10;
        const len = i % 100 === 0 ? W * 0.42 : i % 50 === 0 ? W * 0.32 : i % 10 === 0 ? W * 0.24 : W * 0.12;
        g.lineWidth = i % 100 === 0 ? 8 : i % 50 === 0 ? 6 : i % 10 === 0 ? 4.5 : 2.2;
        g.beginPath(); g.moveTo(W, y); g.lineTo(W - len, y); g.stroke();
      }
      g.fillStyle = '#17140f';
      g.font = '800 ' + Math.round(ppc * 1.45) + 'px system-ui, -apple-system, "Segoe UI", sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      for (let i = 0; i <= LEN; i += 10) g.fillText(String(i), W * 0.28, y0 + i * ppc);
      g.font = '600 ' + Math.round(ppc * 0.8) + 'px system-ui, -apple-system, "Segoe UI", sans-serif';
      g.textAlign = 'center';
      g.fillText('cm', W * 0.5, y0 + (LEN + 2.6) * ppc);
      const t = new THREE.CanvasTexture(rulerCv);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      return t;
    })();
    M.ruler.map = rulerTex;

    // ---------- 手機螢幕（App 發聲時）：頻率與正弦波 ----------
    const scrCv = document.createElement('canvas');
    scrCv.width = 160; scrCv.height = 300;
    const scrTex = new THREE.CanvasTexture(scrCv);
    scrTex.colorSpace = THREE.SRGBColorSpace;
    M.screen.map = scrTex; M.screen.emissiveMap = scrTex;
    let scrKey = '';
    function drawScreen(force, snap, tv) {
      const s = snap || lastSnap;
      const on = !!(s && s.src === 'app' && s.sounding);
      const ph = on && !reduced() ? (tv || 0) * 6 : 0;
      const key = (s ? s.label : '') + '|' + on + '|' + (on ? Math.round(ph * 20) : 0) + '|' + pal.wave;
      if (!force && key === scrKey) return;
      scrKey = key;
      const g = scrCv.getContext('2d'), W = scrCv.width, H = scrCv.height;
      g.fillStyle = '#0b1e24'; g.fillRect(0, 0, W, H);
      g.fillStyle = on ? '#e6fbff' : '#7d9aa2';
      g.font = '700 34px system-ui, -apple-system, "Segoe UI", sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(s ? s.label : '', W / 2, 54);
      g.strokeStyle = pal.wave || '#22d3ee'; g.globalAlpha = on ? 1 : 0.4; g.lineWidth = 4;
      g.beginPath();
      for (let i = 0; i <= 60; i++) { const x = 12 + (W - 24) * i / 60; const y = 160 + Math.sin(i / 60 * Math.PI * 6 + ph) * (on ? 34 : 10); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
      g.stroke();
      g.globalAlpha = 1;
      g.fillStyle = on ? '#22c55e' : '#3b4a4f';
      g.beginPath(); g.arc(W / 2, 252, 20, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#0b1e24';
      if (on) { g.fillRect(W / 2 - 8, 244, 6, 16); g.fillRect(W / 2 + 2, 244, 6, 16); }
      else { g.beginPath(); g.moveTo(W / 2 - 6, 242); g.lineTo(W / 2 + 9, 252); g.lineTo(W / 2 - 6, 262); g.closePath(); g.fill(); }
      scrTex.needsUpdate = true;
    }

    // ---------- 玻璃管、水、夾具、米尺、塞子（管徑改變時重建） ----------
    const tubeG = new THREE.Group(); scene.add(tubeG);
    const waterG = new THREE.Group(); scene.add(waterG);
    let Ri = 1, Ro = 1, rulerX = -10, builtR = -1;
    // 管內的水：單位高度的圓柱，用 scale.z 改變高度
    const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 48, 1, false);
    unitCyl.rotateX(Math.PI / 2); unitCyl.translate(0, 0, 0.5);
    const waterCol = new THREE.Mesh(unitCyl, M.water); waterCol.renderOrder = 1;
    const waterTop = new THREE.Mesh(new THREE.CircleGeometry(1, 48), M.waterTop); waterTop.renderOrder = 2;
    waterG.add(waterCol); waterG.add(waterTop);
    // 米尺上的水面記號
    const mark = new THREE.Mesh(new THREE.BoxGeometry(1, 0.14, 0.16), M.mark);
    scene.add(mark);
    function buildTube(r) {
      builtR = r;
      disposeGeometries(tubeG);
      Ri = r * 100 * RS; Ro = Ri + WALL;
      const zBot = Z0 - 2.2;
      // 玻璃管（外壁）與管口的厚度
      glass(new THREE.CylinderGeometry(Ro, Ro, ZM - zBot, 56, 1, true).rotateX(Math.PI / 2), tubeG, 0, 0, (ZM + zBot) / 2, true);
      glass(new THREE.RingGeometry(Ri, Ro, 56), tubeG, 0, 0, ZM);
      const lip = mesh(new THREE.TorusGeometry((Ri + Ro) / 2, WALL * 0.55, 10, 56), M.glassFront, false, false);
      lip.position.z = ZM; lip.renderOrder = 6; tubeG.add(lip);
      // 管底的橡皮塞與接頭
      tubeG.add(zCyl(Ro + 0.35, Ri, zBot - 1.3, Z0, M.rubber, 40));
      // 夾具：圓環＋橫桿＋支柱上的夾頭
      CLAMPS.forEach(function (h) {
        const z = Z0 + h;
        const ring = mesh(new THREE.TorusGeometry(Ro + 0.38, 0.36, 10, 48), M.steel, true, true);
        ring.position.z = z; tubeG.add(ring);
        const ang = Math.atan2(ROD.y, ROD.x);
        tubeG.add(bar(Math.cos(ang) * (Ro + 0.7), Math.sin(ang) * (Ro + 0.7), ROD.x, ROD.y, z, 0.7, M.steel));
        const boss = mesh(new THREE.BoxGeometry(2, 2, 2.4), M.iron, true, true);
        boss.position.set(ROD.x, ROD.y, z); boss.rotation.z = ang; tubeG.add(boss);
      });
      // 米尺：立在底座上，緊貼在管子左邊，0 刻度對齊管口
      rulerX = -(Ro + 1.3 + RULER_W / 2);
      const rTop = ZM + RULER_TOP, rBot = rTop - RH;
      const board = mesh(new THREE.BoxGeometry(RULER_W, 0.6, RH), M.rulerSide, true, true);
      board.position.set(rulerX, 0, (rTop + rBot) / 2); tubeG.add(board);
      const face = mesh(new THREE.PlaneGeometry(RULER_W, RH), M.ruler, false, true);
      face.rotation.x = Math.PI / 2;
      face.position.set(rulerX, -0.302, (rTop + rBot) / 2); tubeG.add(face);
      mark.geometry.dispose();
      mark.geometry = new THREE.BoxGeometry(RULER_W + 0.8, 0.14, 0.16);
      // 管內的水
      waterCol.scale.set(Ri - 0.02, Ri - 0.02, 1);
      waterTop.scale.set(Ri - 0.02, Ri - 0.02, 1);
      buildSource(true);
      bandKey = '';
    }

    // ---------- 蓄水桶（連通管：桶內水面與管內水面同高）與橡皮管 ----------
    const tankG = new THREE.Group(); scene.add(tankG);
    (function buildTank() {
      tankG.position.set(TANK.x, 0, 0);
      const zb = -TANK.depth;                      // 桶內底（相對於水面）
      glass(new THREE.CylinderGeometry(TANK.r, TANK.r, TANK.h + 0.4, 44, 1, true).rotateX(Math.PI / 2), tankG, 0, 0, zb - 0.4 + (TANK.h + 0.4) / 2, true);
      glass(new THREE.CircleGeometry(TANK.r, 44), tankG, 0, 0, zb - 0.4);
      const lipT = mesh(new THREE.TorusGeometry(TANK.r, 0.18, 8, 44), M.glassFront, false, false);
      lipT.position.z = zb + TANK.h; lipT.renderOrder = 6; tankG.add(lipT);
      const w = new THREE.Mesh(unitCyl, M.water);
      w.scale.set(TANK.r - 0.1, TANK.r - 0.1, TANK.depth); w.position.z = zb; w.renderOrder = 1; tankG.add(w);
      const wt = new THREE.Mesh(new THREE.CircleGeometry(TANK.r - 0.1, 44), M.waterTop);
      wt.renderOrder = 2; tankG.add(wt);
      tankG.add(zCyl(0.75, 0.75, zb - 1.8, zb - 0.4, M.rubber, 20));
      // 夾具
      const zc = zb + TANK.h * 0.6;
      const ring = mesh(new THREE.TorusGeometry(TANK.r + 0.3, 0.32, 10, 48), M.steel, true, true);
      ring.position.z = zc; tankG.add(ring);
      const rx = ROD.x - TANK.x, ang = Math.atan2(ROD.y, rx);
      tankG.add(bar(Math.cos(ang) * (TANK.r + 0.6), Math.sin(ang) * (TANK.r + 0.6), rx, ROD.y, zc, 0.7, M.steel));
      const boss = mesh(new THREE.BoxGeometry(2, 2, 2.4), M.iron, true, true);
      boss.position.set(rx, ROD.y, zc); boss.rotation.z = ang; tankG.add(boss);
    })();
    let hose = null, hoseEnd = NaN;
    function buildHose(zEnd) {
      hoseEnd = zEnd;
      if (hose) { scene.remove(hose); hose.geometry.dispose(); }
      const zs = Z0 - 2.2 - 1.3;                   // 管底接頭的下端
      const zLow = BASE_T + 0.62;
      const pts = [
        new THREE.Vector3(0, 0, zs), new THREE.Vector3(0, -0.8, zLow + 0.9), new THREE.Vector3(4, -3.2, zLow),
        new THREE.Vector3(TANK.x - 5, -3.4, zLow), new THREE.Vector3(TANK.x - 0.4, -1.2, Math.min(zLow + 1.1, zEnd - 0.6)),
        new THREE.Vector3(TANK.x, 0, zEnd)
      ];
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      hose = mesh(new THREE.TubeGeometry(curve, 72, 0.55, 12, false), M.hose, true, true);
      scene.add(hose);
    }

    // ---------- 聲源：音叉（叉臂上下振動，沿管軸送出聲波）或手機 ----------
    const srcG = new THREE.Group(); scene.add(srcG);
    srcG.position.z = ZM;
    let srcKind = '', tineHi = null, tineLo = null, tineLen = 1, srcLabelAt = new THREE.Vector3();
    function buildSource(force) {
      const kind = lastSnap && lastSnap.src === 'app' ? 'app' : 'fork';
      if (!force && kind === srcKind) return;
      srcKind = kind;
      disposeGeometries(srcG);
      tineHi = tineLo = null;
      if (kind === 'app') {
        const w = 6.4, h = 12.8, z0 = 1.6;
        const body = mesh(new THREE.BoxGeometry(w, 0.8, h), M.phone, true, false);
        body.position.set(0, 0, z0 + h / 2); srcG.add(body);
        const scr = mesh(new THREE.PlaneGeometry(w - 0.7, h - 1.6), M.screen, false, false);
        scr.rotation.x = Math.PI / 2; scr.position.set(0, -0.41, z0 + h / 2 + 0.2); srcG.add(scr);
        srcLabelAt.set(w / 2 + 0.6, 0, ZM + z0 + h * 0.75);
        return;
      }
      const gap = 1.25, th = 0.5, tw = 0.8, zLo = 1.5, zHi = zLo + gap, zMid = (zLo + zHi) / 2;
      const bendX = -Ri - 2.2, tipX = Ri * 0.84;
      tineLen = tipX - bendX;
      function tine(z) {
        const p = new THREE.Group();
        p.position.set(bendX, 0, z);
        const m = mesh(new THREE.BoxGeometry(tineLen, tw, th), M.steel, true, false);
        m.position.x = tineLen / 2;
        p.add(m); srcG.add(p);
        return p;
      }
      tineHi = tine(zHi); tineLo = tine(zLo);
      const bend = new THREE.TorusGeometry(gap / 2, th / 2, 10, 20, Math.PI);
      bend.rotateZ(Math.PI / 2); bend.rotateX(Math.PI / 2); bend.scale(1, tw / th, 1);
      const bm = mesh(bend, M.steel, true, false);
      bm.position.set(bendX, 0, zMid); srcG.add(bm);
      const stemG = new THREE.CylinderGeometry(0.36, 0.44, 8, 16);
      stemG.rotateZ(Math.PI / 2);
      const stem = mesh(stemG, M.steel, true, false);
      stem.position.set(bendX - gap / 2 - 4, 0, zMid); srcG.add(stem);
      const knob = mesh(new THREE.SphereGeometry(0.62, 16, 12), M.steel, true, false);
      knob.position.set(bendX - gap / 2 - 8.1, 0, zMid); srcG.add(knob);
      srcLabelAt.set(bendX - gap / 2 - 8.9, 0, ZM + zMid);
    }

    // ---------- 已記錄的橡皮筋 ----------
    const bandG = new THREE.Group(); scene.add(bandG);
    let bandKey = '';
    function buildBands(list) {
      const key = list.join(',') + '|' + Ro;
      if (key === bandKey) return;
      bandKey = key;
      disposeGeometries(bandG);
      list.forEach(function (L) {
        const m = mesh(new THREE.TorusGeometry(Ro + 0.16, 0.26, 10, 56), M.band, true, false);
        m.position.z = ZM - L * 100;
        bandG.add(m);
      });
    }

    // ---------- 位移振幅的包絡面（管內實線、管口外的 e 那一段較淡） ----------
    const envGeo = new THREE.BufferGeometry();
    const envPos = new Float32Array((NR + 1) * (NS + 1) * 3);
    const envCol = new Float32Array((NR + 1) * (NS + 1) * 4);
    (function () {
      const idx = [];
      for (let i = 0; i < NR; i++) for (let j = 0; j < NS; j++) {
        const a = i * (NS + 1) + j, b = a + 1, c = a + NS + 1, d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
      envGeo.setIndex(idx);
      envCol.fill(1);
      envGeo.setAttribute('position', new THREE.BufferAttribute(envPos, 3));
      envGeo.setAttribute('color', new THREE.BufferAttribute(envCol, 4));
    })();
    const cosT = [], sinT = [];
    for (let j = 0; j <= NS; j++) { const t = Math.PI / 2 + 2 * Math.PI * j / NS; cosT.push(Math.cos(t)); sinT.push(Math.sin(t)); }
    const envMesh = new THREE.Mesh(envGeo, M.env);
    envMesh.renderOrder = 3; envMesh.frustumCulled = false;
    scene.add(envMesh);
    function updateEnvelope(s, k, zW, eCm) {
      const zTop = ZM + eCm, span = zTop - zW, R0 = (Ri - 0.3) * s;
      const aIn = pal.dark ? 0.5 : 0.42, aOut = aIn * 0.4;
      for (let i = 0; i <= NR; i++) {
        const z = zW + span * i / NR;
        const rho = Math.max(0.02, R0 * Math.abs(Math.sin(k * (z - zW) / 100)));
        const al = z <= ZM ? aIn : aOut;
        for (let j = 0; j <= NS; j++) {
          const n = i * (NS + 1) + j;
          envPos[3 * n] = rho * cosT[j]; envPos[3 * n + 1] = rho * sinT[j]; envPos[3 * n + 2] = z;
          envCol[4 * n + 3] = al;
        }
      }
      envGeo.attributes.position.needsUpdate = true;
      envGeo.attributes.color.needsUpdate = true;
      envGeo.computeVertexNormals();
      envGeo.computeBoundingSphere();
    }

    // ---------- 空氣層（細圓環，慢動作上下振動：疏密就是聲波） ----------
    const discs = new THREE.InstancedMesh(new THREE.RingGeometry(0.8, 1, 44, 1), M.disc, MAXD);
    discs.renderOrder = 4; discs.frustumCulled = false;
    discs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(discs);
    const mtx = new THREE.Matrix4(), qI = new THREE.Quaternion(), vP = new THREE.Vector3(), vS = new THREE.Vector3();
    function updateDiscs(s, k, zW, ph) {
      const U = 0.95 * DISC_GAP * s, Rd = Ri * 0.84;
      let n = 0;
      for (let j = 1; n < MAXD; j++) {
        const z0 = zW + j * DISC_GAP;
        if (z0 > ZM - 0.5) break;
        const z = z0 + U * Math.sin(k * j * DISC_GAP / 100) * ph;
        vP.set(0, 0, Math.max(zW + 0.25, Math.min(ZM - 0.15, z)));
        vS.set(Rd, Rd, 1);
        mtx.compose(vP, qI, vS);
        discs.setMatrixAt(n++, mtx);
      }
      discs.count = n;
      discs.instanceMatrix.needsUpdate = true;
    }

    // ---------- 波節（菱形）與波腹（圓球）：畫在管子右側 ----------
    const nodeGeo = new THREE.OctahedronGeometry(0.75), antiGeo = new THREE.SphereGeometry(0.62, 16, 12);
    const nodePool = [], antiPool = [];
    function marker(pool, geo, mat, i) {
      while (pool.length <= i) { const m = new THREE.Mesh(geo, mat); m.renderOrder = 5; scene.add(m); pool.push(m); }
      return pool[i];
    }
    function updateMarkers(show, snap, vis) {
      let nN = 0, nA = 0;
      if (show) {
        const q = C.nodesAndAntinodes(snap.L, snap.f, snap.Tc, snap.r);
        const x = Ro + 1.9;
        q.nodes.forEach(function (Ln) { const m = marker(nodePool, nodeGeo, M.node, nN++); m.position.set(x, 0, ZM - Ln * 100); m.visible = true; });
        q.antinodes.forEach(function (La) { const m = marker(antiPool, antiGeo, M.anti, nA++); m.position.set(x, 0, ZM - La * 100); m.visible = true; });
        M.node.opacity = vis; M.anti.opacity = vis;
      }
      for (let i = nN; i < nodePool.length; i++) nodePool[i].visible = false;
      for (let i = nA; i < antiPool.length; i++) antiPool[i].visible = false;
    }

    // ---------- HTML 標籤（字體隨設定縮放、簡體自動轉換、深淺色由 CSS 代號決定） ----------
    const labels = [];
    function addLabel(cls) {
      const el = document.createElement('div');
      el.className = 'rt3-lbl ' + (cls || '');
      layer.appendChild(el);
      const L = { el: el, world: new THREE.Vector3(), ax: -50, ay: -50, dx: 0, dy: 0, show: true, html: '' };
      labels.push(L);
      return L;
    }
    function setHTML(L, html) { if (L.html !== html) { L.html = html; L.el.innerHTML = html; } }
    const lbSrc = addLabel(''); lbSrc.el.style.color = 'var(--accent)';
    const lbL = addLabel('');
    const note = document.createElement('div');
    note.className = 'rt3-lbl tick';
    note.style.cssText = 'top:auto;bottom:6px;left:8px;transform:none;';
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

    // ---------- 每一幀：由 snapshot 更新場景 ----------
    let lastSnap = null;
    function update() {
      const snap = env.snapshot();
      lastSnap = snap;
      if (snap.r !== builtR) buildTube(snap.r);
      buildSource(false);
      const zW = ZM - snap.L * 100;
      waterCol.scale.z = Math.max(0.01, zW - Z0);
      waterCol.position.z = Z0;
      waterTop.position.z = zW;
      mark.position.set(rulerX, -0.42, zW);
      tankG.position.z = zW;
      const zEnd = zW - TANK.depth - 1.8;
      if (!(Math.abs(zEnd - hoseEnd) < 0.25)) buildHose(zEnd);
      buildBands(snap.bands);
      const s = Math.min(1, snap.G / snap.Gref) * Math.min(1, snap.amp / 0.6);
      const ph = reduced() ? 1 : Math.cos(2 * Math.PI * snap.visF * snap.tVis);
      const showEnv = snap.showEnv && snap.amp > 0.004 && s > 0.003;
      envMesh.visible = showEnv;
      if (showEnv) updateEnvelope(s, snap.k, zW, snap.e * 100);
      discs.visible = !!snap.showParts;
      if (snap.showParts) updateDiscs(snap.amp > 0.004 ? s : 0, snap.k, zW, ph);
      updateMarkers(showEnv, snap, Math.max(0.35, Math.min(1, s * 3)));
      // 叉臂振動（越靠近尖端位移越大；慢動作）
      if (tineHi) {
        const a = snap.src === 'app' ? 0 : snap.amp;
        const d = a > 0.004 ? 0.34 * Math.min(1, a / 0.5) * (reduced() ? 0 : Math.cos(2 * Math.PI * snap.visF * 3 * snap.tVis)) : 0;
        tineHi.rotation.y = -d / tineLen;
        tineLo.rotation.y = d / tineLen;
      }
      if (srcKind === 'app') {
        drawScreen(false, snap, snap.tVis);
        M.screen.emissiveIntensity = snap.sounding ? 0.95 : 0.45;
      }
      // 標籤
      lbSrc.world.copy(srcLabelAt);
      if (srcKind === 'app') { lbSrc.ax = 0; lbSrc.dx = 6; } else { lbSrc.ax = -100; lbSrc.dx = -6; }
      setHTML(lbSrc, snap.label);
      lbL.world.set(rulerX - RULER_W / 2, -0.3, zW); lbL.ax = -100; lbL.dx = -6;
      setHTML(lbL, 'L = ' + (snap.L * 100).toFixed(1) + ' cm');
      const nt = T('高度依比例，管徑放大 ' + RS + ' 倍示意', 'heights to scale, tube width enlarged ' + RS + '×');
      if (note.textContent !== nt) note.textContent = nt;
    }

    // ---------- 相機：整支管子（含音叉與蓄水桶）放進畫面 ----------
    function fit() {
      const w = canvas.clientWidth || 640, h = canvas.clientHeight || 480, aspect = w / h;
      const zTop = ZM + 15;
      const target = new THREE.Vector3(8, 2, zTop / 2 - 3);     // 稍微偏下：左下角留給比例說明
      const dir = new THREE.Vector3(0.36, -1, 0.3).normalize();
      const halfH = zTop / 2 + 7, halfW = 30;
      const t = Math.tan(camera.fov * Math.PI / 360);
      const dist = Math.max(halfH / t, halfW / (t * aspect)) * 1.02;
      controls.target.copy(target);
      camera.position.copy(target).addScaledVector(dir, dist);
      camera.near = Math.max(0.5, dist / 60);
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
    let fitted = false;
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
      frame: function () { update(); renderNow(); },
      onTheme: function () { applyTheme(); requestRender(); },
      resetCamera: function () { fit(); requestRender(); },
      dispose: function () {
        view.active = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        document.removeEventListener('visibilitychange', onVisible);
        controls.dispose();
        scene.traverse(function (o) {
          if (o.geometry) o.geometry.dispose();
          if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { m.dispose(); });
        });
        Object.keys(M).forEach(function (k) { M[k].dispose(); });
        unitCyl.dispose(); nodeGeo.dispose(); antiGeo.dispose();
        rulerTex.dispose(); scrTex.dispose();
        if (envTex) envTex.dispose();
        renderer.dispose();
        try { renderer.forceContextLoss(); } catch (e) { /* 繪圖環境已中斷 */ }
        canvas.remove(); layer.remove();
      }
    };

    lastSnap = env.snapshot();
    applyTheme();
    update();
    resize3();
    requestRender();
    return view;
  }

  window.ResonanceTube3D = { create: create, RS: RS };
})();
