/* e-over-m-3d.js — 「電子的荷質比」的 3D 立體檢視（three.js 由 e-over-m.js 以 import() 延遲載入後傳進來）
 *
 * 用法：const v = EOverM3D.create({ THREE, OrbitControls }, env)
 *   env.host     放畫布的元素
 *   env.core     EOverMCore（磁力線用同一套物理計算）
 *   env.T        T('中文', 'English')
 *   env.state()  目前狀態（cm）：{ power, bright, orbit, orbVer, I, V, xL, xR, eye, show, Vm, Im, warm, slow }
 *   env.tokens() 顏色（--eom-* 與 drawkit 的顏色）
 *   env.lost()   WebGL 環境中斷時呼叫
 * 回傳 { active, update(), frame(t), onTheme(), resetCamera(), dispose() }
 *
 * 場景座標與 2D 相同（cm）：原點在玻璃球中心，x 向右、y 向上、z 沿線圈軸指向觀察者（B 的方向）。
 * 實驗在暗室中進行，所以 3D 的背景一律是深色（發光的電子束才看得清楚）。
 */
(function () {
  'use strict';

  function create(lib, env) {
    const THREE = lib.THREE, C = env.core, T = env.T;
    const APP = C.APP;
    const RB = APP.bulbR * 100, RBO = RB + 0.15;
    const GX = APP.gun.x * 100, GY = APP.gun.y * 100;
    const COIL_R = APP.R * 100, COIL_Z = APP.R * 50;
    const SD = APP.scaleD * 100, EL = APP.eyeL * 100, THICK = APP.cursorThick * 100, ZERO = APP.scaleZero * 100;
    const BASE = { x0: -19.6, x1: 19.6, y0: -25.3, y1: -17.25, z0: -11, z1: 11 };
    let tok = env.tokens();

    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('電子荷質比實驗裝置的 3D 立體檢視：兩個亥姆霍茲線圈、玻璃球中發光的電子束、電子槍、標尺與游標、磁力線（可拖曳旋轉、縮放）',
      '3D view of the e/m apparatus: the two Helmholtz coils, the glowing beam in the glass bulb, the electron gun, the scale and cursors, and field lines (drag to rotate, pinch or scroll to zoom)'));
    env.host.appendChild(canvas);
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    } catch (e) { canvas.remove(); throw e; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1.3, 0.5, 3000);
    const target0 = new THREE.Vector3(0, -3.5, 0);
    const viewDir = new THREE.Vector3(0.42, 0.4, 1).normalize();
    camera.position.copy(target0).addScaledVector(viewDir, 90);
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.minDistance = 14;
    controls.maxDistance = 320;
    controls.target.copy(target0);

    // ---- 環境反射（自己組一個簡單的攝影棚：深色牆＋幾片柔光板），讓銅線與玻璃有真實的反光 ----
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    const envBox = new THREE.Mesh(new THREE.BoxGeometry(100, 100, 100), new THREE.MeshBasicMaterial({ color: 0x1a2024, side: THREE.BackSide }));
    envScene.add(envBox);
    [[0, 48, 0, 60, 60, 2.2], [-48, 10, 20, 30, 50, 1.2], [48, 5, 10, 24, 40, 0.8], [0, 10, 48, 50, 20, 0.6]].forEach(function (p) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(p[3], p[4]), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(p[5]), side: THREE.DoubleSide }));
      m.position.set(p[0], p[1], p[2]);
      m.lookAt(0, 0, 0);
      envScene.add(m);
    });
    const envRT = pmrem.fromScene(envScene, 0.04);
    scene.environment = envRT.texture;
    envScene.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });

    // ---- 燈光 ----
    const hemi = new THREE.HemisphereLight(0xdfe9ff, 0x1c2226, 0.7);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff4e6, 1.6);
    sun.position.set(28, 55, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.radius = 5;
    sun.shadow.bias = -0.0008;
    const sc = sun.shadow.camera;
    sc.left = -40; sc.right = 40; sc.bottom = -40; sc.top = 40; sc.near = 10; sc.far = 160;
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xcfe0ff, 0.55); // 由左後方來的補光，背面不會一片黑
    fill.position.set(-40, 25, -45);
    scene.add(fill);
    const glowLight = new THREE.PointLight(0x52f5d9, 0, 0, 2);
    scene.add(glowLight);

    // ---- 小工具 ----
    const owned = []; // 需要釋放的材質、貼圖
    function own(x) { owned.push(x); return x; }
    function canvasTex(c, srgb) {
      const t = new THREE.CanvasTexture(c);
      if (srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      return own(t);
    }
    function glowTex(inner) {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d');
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(inner, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      return canvasTex(c);
    }
    const glowT = glowTex(0.25), softT = glowTex(0.5);
    function glowSprite(tex, color, size) {
      const m = own(new THREE.SpriteMaterial({ map: tex, color: color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      const sp = new THREE.Sprite(m);
      sp.scale.set(size, size, 1);
      sp.renderOrder = 4;
      return sp;
    }
    function std(color, metal, rough, extra) {
      return own(new THREE.MeshStandardMaterial(Object.assign({ color: color, metalness: metal, roughness: rough }, extra || {})));
    }
    function mesh(geo, mat, cast, recv) {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = cast !== false; m.receiveShadow = recv !== false;
      return m;
    }
    /** 文字標籤：深色半透明圓角底＋淺色字（Sprite，永遠畫在最上層） */
    const labels = [];
    const leaderMat = own(new THREE.LineBasicMaterial({ color: 0xdbe7ec, transparent: true, opacity: 0.55, depthTest: false }));
    function label(text, color, size, pos, anchor) {
      const c = document.createElement('canvas'), g = c.getContext('2d'), px = 56;
      const f = '600 ' + px + 'px system-ui, -apple-system, "Segoe UI", "Noto Sans TC", sans-serif';
      g.font = f;
      const w = Math.ceil(g.measureText(text).width) + 44, h = Math.ceil(px * 1.55);
      c.width = w; c.height = h;
      g.font = f;
      const r = h * 0.32;
      g.beginPath();
      g.moveTo(r, 2); g.lineTo(w - r, 2); g.quadraticCurveTo(w - 2, 2, w - 2, r); g.lineTo(w - 2, h - r); g.quadraticCurveTo(w - 2, h - 2, w - r, h - 2);
      g.lineTo(r, h - 2); g.quadraticCurveTo(2, h - 2, 2, h - r); g.lineTo(2, r); g.quadraticCurveTo(2, 2, r, 2); g.closePath();
      g.fillStyle = 'rgba(8,13,16,0.78)'; g.fill();
      g.lineWidth = 3; g.strokeStyle = color; g.globalAlpha = 0.65; g.stroke(); g.globalAlpha = 1;
      g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, w / 2, h / 2 + 2);
      // 標籤在螢幕上保持固定大小（不隨遠近縮放），size 是相對於畫面高度的比例
      const sp = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: canvasTex(c), transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false })));
      sp.userData.k = w / h; sp.userData.size = size;
      sp.scale.set(size * w / h, size, 1);
      sp.center.set(0.5, 0);
      sp.renderOrder = 10;
      sp.position.copy(pos);
      labels.push(sp);
      scene.add(sp);
      if (anchor) { // 指引線：從標籤到它所指的東西
        const g2 = new THREE.BufferGeometry().setFromPoints([pos, anchor]);
        const ln = new THREE.Line(g2, leaderMat);
        ln.renderOrder = 9;
        sp.userData.leader = ln;
        scene.add(ln);
      }
      return sp;
    }

    // ---- 桌面（接收影子，邊緣淡出） ----
    const tableC = document.createElement('canvas'); tableC.width = tableC.height = 256;
    (function () {
      const g = tableC.getContext('2d');
      const gr = g.createRadialGradient(128, 128, 30, 128, 128, 128);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.6, '#bbbbbb'); gr.addColorStop(1, '#000000');
      g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    })();
    const table = mesh(new THREE.PlaneGeometry(130, 100), std(0x2b3338, 0, 0.85, { transparent: true, alphaMap: canvasTex(tableC, false), depthWrite: false }), false, true);
    table.rotation.x = -Math.PI / 2;
    table.position.set(0, BASE.y0 - 0.01, 4);
    scene.add(table);

    // ---- 電源供應器（底座）：前面板貼圖畫電表、文字；旋鈕、開關是立體的 ----
    const panelC = document.createElement('canvas');
    panelC.width = Math.round((BASE.x1 - BASE.x0) * 40); panelC.height = Math.round((BASE.y1 - BASE.y0) * 40);
    const panelTex = canvasTex(panelC);
    const baseMat = std(0x353d42, 0.25, 0.5);
    const panelMat = std(0xffffff, 0.15, 0.5, { map: panelTex });
    const base = mesh(new THREE.BoxGeometry(BASE.x1 - BASE.x0, BASE.y1 - BASE.y0, BASE.z1 - BASE.z0),
      [baseMat, baseMat, std(0x343c41, 0.3, 0.5), baseMat, panelMat, baseMat]);
    base.position.set((BASE.x0 + BASE.x1) / 2, (BASE.y0 + BASE.y1) / 2, (BASE.z0 + BASE.z1) / 2);
    scene.add(base);
    const SEG = { '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', '-': 'g', ' ': '' };
    function seg7(g, text, xr, yc, h, on, led) {
      const cells = [];
      for (let i = 0; i < text.length; i++) {
        if (text[i] === '.') { if (cells.length) cells[cells.length - 1].dot = true; continue; }
        cells.push({ ch: text[i], dot: false });
      }
      const w = h * 0.56, gap = h * 0.2, t = h * 0.13, sk = h * 0.1, dg = h * 0.3;
      let x = xr - cells.length * (w + gap) + gap - cells.filter(function (c) { return c.dot; }).length * dg;
      g.lineCap = 'round';
      cells.forEach(function (c) {
        const segs = SEG[c.ch] || '', top = yc - h / 2;
        const P = function (px, py) { return [x + px + sk * (1 - py / h), top + py]; };
        const D = {
          a: [[t * 0.6, 0], [w - t * 0.6, 0]], d: [[t * 0.6, h], [w - t * 0.6, h]], g: [[t * 0.6, h / 2], [w - t * 0.6, h / 2]],
          b: [[w, t * 0.6], [w, h / 2 - t * 0.5]], c: [[w, h / 2 + t * 0.5], [w, h - t * 0.6]],
          f: [[0, t * 0.6], [0, h / 2 - t * 0.5]], e: [[0, h / 2 + t * 0.5], [0, h - t * 0.6]]
        };
        'abcdefg'.split('').forEach(function (k) {
          const lit = on && segs.indexOf(k) >= 0, p = P(D[k][0][0], D[k][0][1]), q = P(D[k][1][0], D[k][1][1]);
          g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]);
          if (lit) { g.strokeStyle = 'rgba(255,80,60,0.35)'; g.lineWidth = t * 2.4; g.stroke(); g.strokeStyle = led; g.lineWidth = t; g.stroke(); }
          else { g.strokeStyle = 'rgba(255,60,50,0.08)'; g.lineWidth = t; g.stroke(); }
        });
        if (c.dot) { const d = P(w + (gap + dg) * 0.5, h); g.beginPath(); g.arc(d[0], d[1] - t * 0.3, t * 0.75, 0, Math.PI * 2); g.fillStyle = on ? led : 'rgba(255,60,50,0.08)'; g.fill(); }
        x += w + gap + (c.dot ? dg : 0);
      });
    }
    let panelKey = '';
    function drawPanel(s) {
      const key = [s.power, s.Vm, s.Im, tok.led, T('a', 'b')].join('|');
      if (key === panelKey) return;
      panelKey = key;
      const g = panelC.getContext('2d'), W = panelC.width, H = panelC.height, k = 40;
      const u = function (x) { return (x - BASE.x0) * k; }, v = function (y) { return (BASE.y1 - y) * k; };
      const gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, '#3a4348'); gr.addColorStop(0.1, '#262d31'); gr.addColorStop(1, '#161b1e');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      [[0, 1.4 * k], [W - 1.4 * k, W]].forEach(function (p) {
        const tg = g.createLinearGradient(p[0], 0, p[1], 0);
        tg.addColorStop(0, '#6f7a80'); tg.addColorStop(0.5, '#c9d1d5'); tg.addColorStop(1, '#5b656a');
        g.fillStyle = tg; g.fillRect(p[0], 0, p[1] - p[0], H);
      });
      g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(0, 0, W, 3);
      const led = tok.led || '#ff3b30';
      const f = function (px, w) { return (w || '600') + ' ' + px + 'px system-ui, -apple-system, "Segoe UI", "Noto Sans TC", sans-serif'; };
      [[-8.6, T('加速電壓 (V)', 'Voltage (V)'), s.power ? String(s.Vm).padStart(3, ' ') : '   '],
        [3.4, T('線圈電流 (A)', 'Current (A)'), s.power ? s.Im.toFixed(2) : ' .  ']].forEach(function (d) {
        const w = 7.2 * k, h = 2.5 * k, x0 = u(d[0]) - w / 2, y0 = v(-18.45);
        g.font = f(0.62 * k); g.fillStyle = '#c3ccd0'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
        g.fillText(d[1], u(d[0]), y0 - 0.22 * k);
        g.fillStyle = '#070909'; g.fillRect(x0, y0, w, h);
        g.strokeStyle = '#5b6569'; g.lineWidth = 3; g.strokeRect(x0, y0, w, h);
        seg7(g, d[2], x0 + w - 0.55 * k, y0 + h / 2, h * 0.66, s.power, led);
      });
      g.font = f(0.62 * k); g.fillStyle = '#c3ccd0'; g.textAlign = 'center';
      g.fillText(T('電源', 'Power'), u(14.2), v(-18.45) - 0.22 * k);
      g.font = f(0.55 * k); g.textAlign = 'left'; g.fillStyle = 'rgba(255,255,255,0.4)';
      g.fillText('e/m', u(-17.6), v(-20.0));
      g.fillText('N = 130', u(-17.6), v(-21.9));
      g.fillText('R = 15 cm', u(-17.6), v(-23.8));
      panelTex.needsUpdate = true;
    }
    // 旋鈕
    const knobMat = std(0xc4ccd0, 0.85, 0.32), knobMarkMat = std(0x1d2326, 0.1, 0.6);
    function knob(x, y) {
      const grp = new THREE.Group();
      const body = mesh(new THREE.CylinderGeometry(1.15, 1.25, 1.1, 40), knobMat);
      body.rotation.x = Math.PI / 2; body.position.z = 0.55;
      const cap = mesh(new THREE.CylinderGeometry(0.85, 1.15, 0.18, 40), knobMat);
      cap.rotation.x = Math.PI / 2; cap.position.z = 1.19;
      const mark = mesh(new THREE.BoxGeometry(0.75, 0.16, 0.06), knobMarkMat, false);
      mark.position.set(0.55, 0, 1.3);
      grp.add(body, cap, mark);
      grp.position.set(x, y, BASE.z1);
      scene.add(grp);
      return grp;
    }
    const knobV = knob(-8.6, -23.3), knobI = knob(3.4, -23.3);
    const switchMat = std(0xc62f28, 0.05, 0.45);
    const powerSw = mesh(new THREE.BoxGeometry(1.9, 2.7, 0.7), switchMat);
    powerSw.position.set(14.2, -21.3, BASE.z1 + 0.35);
    scene.add(powerSw);
    const ledMat = std(0x3a1513, 0, 0.4, { emissive: 0x000000 });
    const powerLed = mesh(new THREE.SphereGeometry(0.33, 20, 12), ledMat, false);
    powerLed.position.set(14.2, -24.0, BASE.z1 + 0.1);
    scene.add(powerLed);

    // ---- 亥姆霍茲線圈：銅線繞成的環（剖面為圓角矩形的旋轉體），表面畫一圈圈的導線 ----
    const windC = document.createElement('canvas'); windC.width = 8; windC.height = 1024;
    (function () {
      const g = windC.getContext('2d');
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, 8, 1024);
      for (let i = 0; i < 96; i++) {
        const y = i * 1024 / 96;
        const gr = g.createLinearGradient(0, y, 0, y + 1024 / 96);
        gr.addColorStop(0, '#6d6d6d'); gr.addColorStop(0.25, '#ffffff'); gr.addColorStop(0.55, '#e6e6e6'); gr.addColorStop(1, '#6d6d6d');
        g.fillStyle = gr; g.fillRect(0, y, 8, 1024 / 96);
      }
    })();
    const windTex = canvasTex(windC);
    windTex.wrapS = windTex.wrapT = THREE.RepeatWrapping;
    const windBump = canvasTex(windC, false);
    const copperMat = std(0xb9733a, 0.75, 0.32, { map: windTex, bumpMap: windBump, bumpScale: 0.6, envMapIntensity: 1.1 });
    function coilGeo() {
      const r0 = COIL_R - 1.15, r1 = COIL_R + 1.15, h = 1.1, c = 0.35, pts = [];
      const arc = function (cx, cy, a0, a1) { for (let i = 0; i <= 4; i++) { const a = a0 + (a1 - a0) * i / 4; pts.push(new THREE.Vector2(cx + c * Math.cos(a), cy + c * Math.sin(a))); } };
      // 由內側下方開始，逆時針繞剖面一圈
      arc(r0 + c, -h + c, Math.PI, Math.PI * 1.5);
      arc(r1 - c, -h + c, Math.PI * 1.5, Math.PI * 2);
      arc(r1 - c, h - c, 0, Math.PI * 0.5);
      arc(r0 + c, h - c, Math.PI * 0.5, Math.PI);
      pts.push(pts[0].clone());
      const g = new THREE.LatheGeometry(pts, 160);
      g.rotateX(Math.PI / 2); // 旋轉軸由 y 改成 z
      return g;
    }
    const coilG = coilGeo();
    const clipMat = std(0xeeeae0, 0, 0.5), footMat = std(0x30383d, 0.3, 0.55);
    [-COIL_Z, COIL_Z].forEach(function (z) {
      const c = mesh(coilG, copperMat);
      c.position.z = z;
      scene.add(c);
      // 白色固定夾（上、左上、右上）
      [Math.PI / 2, Math.PI * 0.1, Math.PI * 0.9].forEach(function (a) {
        const clip = mesh(new THREE.BoxGeometry(1.9, 2.8, 2.6), clipMat);
        clip.position.set(Math.cos(a) * COIL_R, Math.sin(a) * COIL_R, z);
        clip.rotation.z = a - Math.PI / 2;
        scene.add(clip);
      });
      // 底下的腳座
      const fTop = -COIL_R - 0.9, fh = fTop - BASE.y1;
      const foot = mesh(new THREE.BoxGeometry(4.2, fh, 3.2), footMat);
      foot.position.set(0, BASE.y1 + fh / 2, z);
      scene.add(foot);
    });

    // ---- 玻璃球、頸部、燈座、電子槍 ----
    const fresnel = own(new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(0xdff6ff) }, power: { value: 2.6 }, strength: { value: 0.55 }, base: { value: 0.025 } },
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform vec3 color; uniform float power; uniform float strength; uniform float base; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), power); gl_FragColor = vec4(color, clamp(base + strength * f, 0.0, 1.0)); }',
      transparent: true, depthWrite: false, side: THREE.DoubleSide
    }));
    const glassMat = own(new THREE.MeshPhysicalMaterial({
      color: 0xffffff, metalness: 0, roughness: 0.04, transparent: true, opacity: 0.08, depthWrite: false,
      clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.6, side: THREE.FrontSide
    }));
    const bulbG = new THREE.SphereGeometry(RBO, 72, 48);
    const bulbRim = new THREE.Mesh(bulbG, fresnel); bulbRim.renderOrder = 5;
    const bulbSkin = new THREE.Mesh(bulbG, glassMat); bulbSkin.renderOrder = 6;
    scene.add(bulbRim, bulbSkin);
    const neckG = new THREE.CylinderGeometry(1.9, 1.9, 3.6, 40, 1, true);
    const neckRim = new THREE.Mesh(neckG, fresnel); neckRim.position.y = -8.9; neckRim.renderOrder = 5;
    const neckSkin = new THREE.Mesh(neckG, glassMat); neckSkin.position.y = -8.9; neckSkin.renderOrder = 6;
    scene.add(neckRim, neckSkin);
    const socket = mesh(new THREE.CylinderGeometry(2.6, 2.6, 4.3, 48), std(0x20262a, 0.2, 0.55));
    socket.position.y = -12.75; scene.add(socket);
    const metalMat = std(0x9aa7ad, 0.9, 0.3);
    const ring = mesh(new THREE.CylinderGeometry(2.75, 2.75, 0.9, 48), metalMat);
    ring.position.y = -10.85; scene.add(ring);
    const pillar = mesh(new THREE.CylinderGeometry(1.6, 1.8, -14.9 - BASE.y1, 32), std(0x171c1f, 0.2, 0.6));
    pillar.position.y = (-14.9 + BASE.y1) / 2; scene.add(pillar);
    // 電子槍：陰極柱（直立）、槍管（水平，出口在 (GX, GY)）、陽極圓盤
    const stem = mesh(new THREE.CylinderGeometry(0.5, 0.55, 5.4, 24), metalMat);
    stem.position.set(-0.65, -7.7, 0); scene.add(stem);
    const barrel = mesh(new THREE.CylinderGeometry(0.38, 0.38, 1.35, 24), metalMat);
    barrel.rotation.z = Math.PI / 2; barrel.position.set(GX - 0.675, GY, 0); scene.add(barrel);
    const anode = mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.16, 32), metalMat);
    anode.rotation.z = Math.PI / 2; anode.position.set(GX - 0.08, GY, 0); scene.add(anode);
    const heater = glowSprite(softT, new THREE.Color(0xff9a3c), 2.4);
    heater.position.set(-0.65, -9.6, 0); scene.add(heater);
    const gunGlow = glowSprite(glowT, new THREE.Color(0x52f5d9), 1.3);
    gunGlow.position.set(GX + 0.1, GY, 0); scene.add(gunGlow);
    const hitGlow = glowSprite(glowT, new THREE.Color(0x52f5d9), 2.2);
    scene.add(hitGlow);

    // ---- 標尺與游標（在玻璃球前方 d = 9.5 cm 的平面） ----
    const scaleC = document.createElement('canvas'); scaleC.width = 1712; scaleC.height = 128;
    (function () {
      const g = scaleC.getContext('2d'), k = 80, x0 = 0.7 * k; // 標尺 0 刻度在左端往內 0.7 cm
      g.fillStyle = '#f1ede1'; g.fillRect(0, 0, 1712, 128);
      g.strokeStyle = '#2a2a26'; g.fillStyle = '#2a2a26';
      for (let i = 0; i <= 200; i++) {
        const x = x0 + i / 10 * k, isCm = i % 10 === 0, isHalf = i % 5 === 0;
        g.lineWidth = isCm ? 3 : 2;
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x, (isCm ? 0.75 : isHalf ? 0.5 : 0.3) * k); g.stroke();
        if (isCm) { g.font = '700 34px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillText(String(i / 10), x, 124); }
      }
      g.font = '600 22px system-ui, sans-serif'; g.textAlign = 'right'; g.fillText('cm', 1700, 124);
    })();
    const rulerMat = std(0xffffff, 0, 0.6, { map: canvasTex(scaleC) });
    const rulerSide = std(0xe2ddcf, 0, 0.6);
    const scaleBar = mesh(new THREE.BoxGeometry(21.4, 1.6, 0.9), [rulerSide, rulerSide, rulerSide, rulerSide, rulerMat, rulerSide]);
    scaleBar.position.set(0, -14.5, SD);
    scene.add(scaleBar);
    [-10.95, 10.95].forEach(function (x) {
      const post = mesh(new THREE.BoxGeometry(0.6, -13.7 - BASE.y1, 0.9), footMat);
      post.position.set(x, (BASE.y1 + -13.7) / 2, SD);
      scene.add(post);
    });
    const handleMat = std(0x15191b, 0.2, 0.55);
    const acrylMat = own(new THREE.MeshPhysicalMaterial({ color: 0xdff3ff, metalness: 0, roughness: 0.08, transparent: true, opacity: 0.16, depthWrite: false, clearcoat: 1, envMapIntensity: 1.3 }));
    const hairMat = own(new THREE.MeshBasicMaterial({ color: 0xff4d4d, toneMapped: false }));
    const hairBackMat = own(new THREE.MeshBasicMaterial({ color: 0xff4d4d, transparent: true, opacity: 0.6, toneMapped: false }));
    function cursor(sg) {
      // sg = −1：左游標（把手在左邊）；+1：右游標
      const grp = new THREE.Group();
      const hTop = 6.4, hBot = -13.6, hh = hTop - hBot, yc = (hTop + hBot) / 2;
      const handle = mesh(new THREE.BoxGeometry(1.2, hh, THICK), handleMat);
      handle.position.set(sg * 1.35, yc, 0);
      const acr = new THREE.Mesh(new THREE.BoxGeometry(1.1, hh, THICK), acrylMat);
      acr.position.set(-sg * 0.2, yc, 0); acr.renderOrder = 7;
      const front = new THREE.Mesh(new THREE.BoxGeometry(0.05, hh - 0.3, 0.02), hairMat);
      front.position.set(0, yc, THICK / 2 + 0.012);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.05, hh - 0.3, 0.02), hairBackMat);
      back.position.set(0, yc, -THICK / 2 - 0.012);
      const idx = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.7, 3), hairMat);
      idx.rotation.z = Math.PI; idx.position.set(0, hBot - 0.15, THICK / 2 - 0.3);
      grp.add(handle, acr, front, back, idx);
      grp.position.z = SD;
      scene.add(grp);
      return grp;
    }
    const curL = cursor(-1), curR = cursor(1);

    // ---- 電子束（管狀的發光體：亮的核心＋兩層柔和的光暈）與運動中的電子 ----
    const beamGroup = new THREE.Group();
    scene.add(beamGroup);
    const beamMats = [
      own(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })),
      own(new THREE.MeshBasicMaterial({ color: 0x52f5d9, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })),
      own(new THREE.MeshBasicMaterial({ color: 0x52f5d9, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
    ];
    const beamR = [0.075, 0.26, 0.75], beamA = [1.0, 0.34, 0.1];
    let beamMeshes = [], beamVer = -1;
    function rebuildBeam(o) {
      beamMeshes.forEach(function (m) { beamGroup.remove(m); m.geometry.dispose(); });
      beamMeshes = [];
      if (!o || !o.pts || o.pts.length < 2) return;
      const step = Math.max(1, Math.ceil(o.pts.length / 900));
      const v = [];
      for (let i = 0; i < o.pts.length; i += step) v.push(new THREE.Vector3(o.pts[i][0], o.pts[i][1], o.pts[i][2]));
      const last = o.pts[o.pts.length - 1];
      if (v[v.length - 1].distanceTo(new THREE.Vector3(last[0], last[1], last[2])) > 1e-6) v.push(new THREE.Vector3(last[0], last[1], last[2]));
      if (v.length < 2) return;
      const curve = new THREE.CatmullRomCurve3(v, false, 'centripetal');
      const segs = Math.min(2600, v.length * 2);
      beamR.forEach(function (r, i) {
        const g = new THREE.TubeGeometry(curve, segs, r, i === 0 ? 6 : 10, false);
        const m = new THREE.Mesh(g, beamMats[i]);
        m.renderOrder = 3 + (i ? 0 : 1);
        beamMeshes.push(m);
        beamGroup.add(m);
      });
    }
    const dots = [];
    const dotGroup = new THREE.Group(); scene.add(dotGroup);
    for (let i = 0; i < 9; i++) {
      const d = glowSprite(glowT, new THREE.Color(0xffffff), 0.75);
      d.visible = false; dots.push(d); dotGroup.add(d);
    }

    // ---- 磁力線（由 core 的線圈磁場算出；只在通電時顯示，越亮表示電流越大） ----
    const fieldGroup = new THREE.Group(); scene.add(fieldGroup);
    const fieldMat = own(new THREE.LineBasicMaterial({ color: 0xbfd6e0, transparent: true, opacity: 0.4, depthWrite: false }));
    const coneMat = own(new THREE.MeshBasicMaterial({ color: 0xbfd6e0, transparent: true, opacity: 0.6, depthWrite: false }));
    let coneRef = null;
    (function buildField() {
      const cfg = { N: APP.N, R: APP.R, I: 1, uniform: false };
      const seeds = [3.5, 8, 11.6, 13];
      const segPts = [];
      const coneG = new THREE.ConeGeometry(0.45, 1.4, 14);
      const up = new THREE.Vector3(0, 1, 0);
      const addCone = function (p, d) {
        const c = new THREE.Mesh(coneG, coneMat);
        c.position.copy(p);
        c.quaternion.setFromUnitVectors(up, d.clone().normalize());
        fieldGroup.add(c);
        return c;
      };
      seeds.forEach(function (rho0, si) {
        let line = C.fieldLine(rho0 / 100, 0, cfg, { ds: 0.0025, maxLen: 1.4, box: 0.25 }).map(function (p) { return [p[0] * 100, p[1] * 100]; });
        const closed = line.length > 2 && Math.hypot(line[line.length - 1][0] - line[0][0], line[line.length - 1][1] - line[0][1]) < 0.5;
        if (!closed) { // 對 z = 0 平面鏡射，補上另一半
          const mir = line.slice(1).reverse().map(function (p) { return [p[0], -p[1]]; });
          line = mir.concat(line);
        }
        // 箭頭位置：前方線圈外側（z ≈ 11 cm，B 指向 +z）與最外側的回程（B 指向 −z）
        let iFront = -1, iOut = 0;
        line.forEach(function (p, i) {
          if (iFront < 0 && p[1] >= 11 && Math.abs(p[0]) < COIL_R - 1.5) iFront = i;
          if (Math.abs(p[0]) > Math.abs(line[iOut][0])) iOut = i;
        });
        // 水平面（φ = 0）兩側＋垂直面（φ = 90°）的上半部
        [[0, 1], [0, -1], [Math.PI / 2, 1]].forEach(function (pp, k) {
          const phi = pp[0], sgn = pp[1];
          const map = function (p) { const r = sgn * p[0]; return new THREE.Vector3(r * Math.cos(phi), r * Math.sin(phi), p[1]); };
          for (let i = 1; i < line.length; i++) {
            const a = map(line[i - 1]), b = map(line[i]);
            if (a.y < BASE.y1 + 0.3 || b.y < BASE.y1 + 0.3) continue;
            segPts.push(a.x, a.y, a.z, b.x, b.y, b.z);
          }
          if (k < 2) {
            [iFront, iOut].forEach(function (i0, j) {
              if (i0 < 1 || i0 > line.length - 2 || (j === 1 && closed && rho0 > 12)) return;
              const c = addCone(map(line[i0]), map(line[i0 + 1]).sub(map(line[i0 - 1])));
              if (j === 0 && sgn === 1 && si === 2) coneRef = c;
            });
          }
        });
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(segPts, 3));
      const ls = new THREE.LineSegments(g, fieldMat);
      ls.renderOrder = 2;
      fieldGroup.add(ls);
    })();

    // ---- 視差：眼睛與視線（開啟「視差」時） ----
    const eyeGroup = new THREE.Group(); scene.add(eyeGroup);
    const eyeBall = mesh(new THREE.SphereGeometry(0.9, 24, 16), std(0xf3f5f6, 0, 0.3), false, false);
    const pupil = mesh(new THREE.SphereGeometry(0.42, 16, 12), std(0x1b2226, 0, 0.3), false, false);
    pupil.position.z = -0.62;
    eyeBall.add(pupil);
    eyeGroup.add(eyeBall);
    const sightMat = own(new THREE.LineDashedMaterial({ color: 0xffa54f, dashSize: 0.8, gapSize: 0.5, transparent: true, opacity: 0.9 }));
    const sightGeo = new THREE.BufferGeometry();
    sightGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Array(12).fill(0), 3));
    const sight = new THREE.LineSegments(sightGeo, sightMat);
    eyeGroup.add(sight);

    // ---- 名稱標示 ----
    let labelSet = [];
    const LS = 0.026; // 標籤高度（約為畫面高度的比例）
    function buildLabels() {
      labelSet.forEach(function (l) {
        scene.remove(l); l.material.map.dispose(); l.material.dispose();
        if (l.userData.leader) { scene.remove(l.userData.leader); l.userData.leader.geometry.dispose(); }
      });
      labels.length = 0;
      labelSet = [
        label(T('亥姆霍茲線圈', 'Helmholtz coils'), '#e9b98a', LS, new THREE.Vector3(-15, 19.5, COIL_Z + 1), new THREE.Vector3(-9.2, 12.3, COIL_Z + 1.15)),
        label(T('玻璃球（低壓氦氣）', 'Bulb (low-pressure helium)'), '#e7f3f6', LS, new THREE.Vector3(9, 11.5, 0), new THREE.Vector3(5.0, 6.3, 0)),
        label(T('電子槍', 'Electron gun'), '#d3dde1', LS, new THREE.Vector3(-10.5, -10.5, 5), new THREE.Vector3(-0.65, -8.6, 0)),
        label(T('標尺與游標', 'Scale and cursors'), '#f1ede1', LS, new THREE.Vector3(15.5, -11.8, SD), new THREE.Vector3(10.7, -14.5, SD + 0.45)),
        label(T('電源供應器', 'Power supply'), '#c3ccd0', LS, new THREE.Vector3(-14.5, BASE.y1 + 0.4, BASE.z1 - 1)),
        label('B', '#cfe3ea', LS, coneRef ? coneRef.position.clone().add(new THREE.Vector3(0, 0.8, 0)) : new THREE.Vector3(8, 1, 11))
      ];
      labelSet[5].userData.field = true;
      labelSet.eye = label(T('眼睛', 'Eye'), '#ffcf9f', LS, new THREE.Vector3(0, 1.4, SD + EL));
      labelSet.push(labelSet.eye);
      labelSet.eye.userData.eye = true;
    }
    buildLabels();

    // ---- 顏色（深淺色切換時更新） ----
    function applyColors() {
      tok = env.tokens();
      const c = function (k, d) { return new THREE.Color(tok[k] || d); };
      copperMat.color.copy(c('copper', '#b9733a'));
      beamMats[0].color.copy(c('beam', '#52f5d9')).lerp(new THREE.Color(0xffffff), 0.7);
      beamMats[1].color.copy(c('beam', '#52f5d9'));
      beamMats[2].color.copy(c('beam', '#52f5d9'));
      gunGlow.material.color.copy(c('beam', '#52f5d9'));
      hitGlow.material.color.copy(c('beam', '#52f5d9'));
      dots.forEach(function (d) { d.material.color.copy(c('beam', '#52f5d9')).lerp(new THREE.Color(0xffffff), 0.6); });
      glowLight.color.copy(c('beam', '#52f5d9'));
      heater.material.color.copy(c('heat', '#ff9a3c'));
      hairMat.color.copy(c('hair', '#ff4d4d'));
      hairBackMat.color.copy(c('hair', '#ff4d4d'));
      metalMat.color.copy(c('metal', '#9aa7ad'));
      sightMat.color.copy(c('heat', '#ffa54f'));
      panelKey = '';
    }

    // ---- 相機 ----
    function fit(force) {
      const r = 31; // 整組裝置（含底座）的外接球半徑（cm）
      const vf = camera.fov * Math.PI / 360, hf = Math.atan(Math.tan(vf) * camera.aspect);
      const dist = r / Math.sin(Math.min(vf, hf)) * 0.92;
      const dir = force ? viewDir.clone() : camera.position.clone().sub(controls.target).normalize();
      if (force) controls.target.copy(target0);
      camera.position.copy(controls.target).addScaledVector(dir, dist);
      camera.near = Math.max(0.5, dist / 200); camera.far = dist * 20;
      camera.updateProjectionMatrix();
      controls.update();
    }

    // ---- 繪製 ----
    let raf = 0;
    function renderNow() {
      if (!api.active || document.hidden) return;
      const want = Math.min(window.devicePixelRatio || 1, 2);
      if (renderer.getPixelRatio() !== want) { renderer.setPixelRatio(want); resize3(); return; }
      const moved = controls.update();
      renderer.render(scene, camera);
      if (moved) requestRender();
    }
    function requestRender() {
      if (raf || !api.active) return;
      raf = requestAnimationFrame(function () { raf = 0; renderNow(); });
    }
    let lastAspect = 0;
    function resize3() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (Math.abs(camera.aspect - lastAspect) > 0.01) { lastAspect = camera.aspect; fit(false); }
      const ls = camera.aspect < 1.1 ? 0.03 : LS;
      labels.forEach(function (l) { l.scale.set(ls * l.userData.k, ls, 1); });
      requestRender();
    }
    const ro = window.ResizeObserver ? new ResizeObserver(resize3) : null;
    if (ro) ro.observe(canvas); else window.addEventListener('resize', resize3);
    controls.addEventListener('change', requestRender);
    const onVisible = function () { if (!document.hidden) requestRender(); };
    document.addEventListener('visibilitychange', onVisible);
    canvas.addEventListener('webglcontextlost', function (ev) {
      ev.preventDefault();
      if (!api.active) return; // dispose() 自己呼叫 forceContextLoss() 時也會觸發，不是真的中斷
      if (env.lost) env.lost();
    });

    // ---- 依狀態更新 ----
    let cur = null;
    function update() {
      const s = env.state();
      cur = s;
      if (s.orbVer !== beamVer) { beamVer = s.orbVer; rebuildBeam(s.orbit); }
      const b = s.bright || 0;
      beamGroup.visible = b > 0 && beamMeshes.length > 0;
      beamMats.forEach(function (m, i) { m.opacity = beamA[i] * b; });
      gunGlow.visible = b > 0; gunGlow.material.opacity = 0.75 * b;
      const o = s.orbit;
      hitGlow.visible = b > 0 && !!(o && o.hitGlass && o.end);
      if (hitGlow.visible) { hitGlow.position.set(o.end[0], o.end[1], o.end[2]); hitGlow.material.opacity = 0.9 * b; }
      glowLight.intensity = 26 * b;
      heater.visible = !!s.power; heater.material.opacity = 0.9 * (s.warm || 0);
      curL.position.x = s.xL; curR.position.x = s.xR;
      drawPanel(s);
      const kr = function (frac) { const a2 = -225 + 270 * Math.max(0, Math.min(1, frac)); return -a2 * Math.PI / 180; };
      knobV.rotation.z = kr(s.V / 300); knobI.rotation.z = kr(s.I / 2.5);
      switchMat.color.set(s.power ? 0xd8362e : 0x6e211d);
      powerSw.rotation.x = s.power ? -0.16 : 0.16;
      ledMat.emissive.set(s.power ? (tok.led || '#ff3b30') : '#000000');
      ledMat.emissiveIntensity = s.power ? 2.2 : 0;
      ledMat.color.set(s.power ? 0xff6a5c : 0x3a1513);
      const fOn = !!(s.show && s.show.field && s.power && s.I > 0);
      fieldGroup.visible = fOn;
      if (fOn) { const f = Math.min(1, s.I / 2); fieldMat.opacity = 0.16 + 0.42 * f; coneMat.opacity = 0.3 + 0.55 * f; }
      const showL = !s.show || s.show.labels !== false;
      labelSet.forEach(function (l) {
        l.visible = showL && (!l.userData.field || fOn) && (!l.userData.eye || s.eye != null);
        if (l.userData.leader) l.userData.leader.visible = l.visible;
      });
      // 視差：眼睛在游標平面前方 L，視線穿過兩個游標的前細線，延長到電子束的平面
      eyeGroup.visible = s.eye != null;
      if (s.eye != null) {
        const ez = SD + EL, fz = SD + THICK / 2;
        eyeBall.position.set(s.eye, 0, ez);
        labelSet.eye.position.set(s.eye, 1.4, ez);
        const arr = sightGeo.attributes.position;
        [s.xL, s.xR].forEach(function (xw, i) {
          const k = ez / (ez - fz); // 由眼睛經過 (xw, fz) 延長到 z = 0
          arr.setXYZ(2 * i, s.eye, 0, ez);
          arr.setXYZ(2 * i + 1, s.eye + (xw - s.eye) * k, 0, 0);
        });
        arr.needsUpdate = true;
        sight.computeLineDistances();
        sightGeo.computeBoundingSphere();
      }
      placeDots(lastT);
      requestRender();
    }
    let lastT = 0;
    function placeDots(t) {
      const s = cur, o = s && s.orbit;
      const on = !!(s && s.show && s.show.dots && s.bright > 0 && o && o.total > 0 && isFinite(o.v));
      dotGroup.visible = on;
      if (!on) return;
      const n = Math.max(3, Math.min(9, Math.round(o.total / 6)));
      const spacing = o.total / n, vAnim = o.v * 100 * (s.slow || 16e-9);
      for (let k = 0; k < dots.length; k++) {
        const d = dots[k];
        if (k >= n) { d.visible = false; continue; }
        const L = (t * vAnim + k * spacing) % o.total;
        let lo = 0, hi = o.len.length - 1;
        while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (o.len[mid] <= L) lo = mid; else hi = mid; }
        const a = o.pts[lo], c = o.pts[hi], u = (L - o.len[lo]) / Math.max(1e-9, o.len[hi] - o.len[lo]);
        d.position.set(a[0] + (c[0] - a[0]) * u, a[1] + (c[1] - a[1]) * u, a[2] + (c[2] - a[2]) * u);
        d.material.opacity = Math.min(1, 0.95 * s.bright);
        d.visible = true;
      }
    }

    const api = {
      active: true,
      update: update,
      frame: function (t) { lastT = t; placeDots(t); if (raf) { cancelAnimationFrame(raf); raf = 0; } renderNow(); },
      onTheme: function () { applyColors(); update(); },
      resetCamera: function () { fit(true); requestRender(); },
      dispose: function () {
        api.active = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        document.removeEventListener('visibilitychange', onVisible);
        controls.dispose();
        scene.traverse(function (o) {
          if (o.geometry) o.geometry.dispose();
          if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); });
        });
        owned.forEach(function (x) { if (x && x.dispose) x.dispose(); });
        envRT.dispose(); pmrem.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        canvas.remove();
      }
    };

    applyColors();
    const w0 = canvas.clientWidth, h0 = canvas.clientHeight;
    if (w0 && h0) { renderer.setSize(w0, h0, false); camera.aspect = w0 / h0; camera.updateProjectionMatrix(); lastAspect = camera.aspect; }
    fit(true);
    return api;
  }

  window.EOverM3D = { create: create };
})();
