/* seasons-3d.js — 「四季與太陽軌跡」的 3D 立體檢視（three.js 由 seasons.js 以 import() 延遲載入後傳進來）
 *
 * 用法：const v = Seasons3D.create({ THREE, OrbitControls }, env)
 *   env.host     放畫布的元素
 *   env.core     SeasonsCore（位置全部由同一套物理計算）
 *   env.T        T('中文', 'English')
 *   env.state()  目前狀態：{ t, o（太陽黃經、距離…）, s（snapshot 讀數）, theta（格林威治時角）, sub（直射點）, eps, lat, lon, zone,
 *                day, clock, seasons, seasonDay(k), path（今天的太陽軌跡 [{c, alt, az}]）, ref（參考軌跡的赤緯）, labels,
 *                trace（竿影尖端 [[東, 北, 分鐘]]，以竿長為單位）, ana（每天同一時刻的太陽）, locName, dateText, timeText }
 *   env.tokens() 顏色（--ss-* 與 drawkit 的顏色）
 *   env.land     陸地輪廓與繪製函式（與 2D 相同）
 *   env.lost()   WebGL 環境中斷時呼叫
 * 回傳 { active, update(), frame(), onTheme(), resetCamera(), setScene('orbit'|'sky'), setCamEarth(bool), dispose() }
 *
 * 兩個場景共用一個繪圖器：
 *   地球繞日：黃道座標 (x, y, z) → 場景 (x, z, −y)，1 AU = 10 單位；太陽與地球的大小未按比例。
 *     地球的貼圖本地座標：X = 經度 0°、Y = 北極、Z = 西經 90°；先繞 Y 轉格林威治時角 θ，再繞 X 轉 −ε（地軸傾角）。
 *     晨昏線由每顆地球自己的「太陽方向」算（著色器），所以四季的小地球也都照對方向。
 *   觀察者的天空：地平座標 (東, 北, 上) → 場景 (東, 上, −北)，天球半徑 10、竿高 2（與 2D 相同的 0.2 倍）。
 *     竿影是平行光真正投下的陰影，長度 = 竿高 / tan h。
 */
(function () {
  'use strict';

  function create(lib, env) {
    const THREE = lib.THREE, C = env.core, T = env.T;
    const DEG = Math.PI / 180;
    const AU = 10, RE = 0.8, RG = 0.5, RS = 1.5;
    const DOME = 10, POLE = 2;
    let tok = env.tokens();
    let cur = null;
    let sceneName = 'orbit', camEarth = false;

    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('四季與太陽軌跡的 3D 立體檢視：地球繞太陽公轉（地軸傾斜、晨昏線、直射點），或觀察者頭頂的天球（地平面、太陽軌跡、竿影）。可拖曳旋轉、縮放',
      '3D view of the seasons: the Earth orbiting the Sun (tilted axis, day–night line, subsolar point), or the sky dome above an observer (horizon, the Sun’s path, the pole’s shadow). Drag to rotate, pinch or scroll to zoom'));
    env.host.appendChild(canvas);
    const hud = document.createElement('div');
    hud.className = 'k3-hud';
    hud.innerHTML = '<div class="tl"><span></span><span class="m"></span></div><div class="br"><span class="m"></span></div>';
    env.host.appendChild(hud);
    const hudTL = hud.querySelectorAll('.tl span'), hudBR = hud.querySelector('.br span');

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    } catch (e) { canvas.remove(); hud.remove(); throw e; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const camera = new THREE.PerspectiveCamera(36, 1.4, 0.05, 3000);
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.minDistance = 2;
    controls.maxDistance = 140;

    // ---- 小工具 ----
    const owned = [];
    function own(x) { owned.push(x); return x; }
    function canvasTex(c, srgb) {
      const t = new THREE.CanvasTexture(c);
      if (srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      return own(t);
    }
    const V = function (x, y, z) { return new THREE.Vector3(x, y, z); };
    /** 黃道座標（AU）→ 軌道場景 */
    function e3(v, k) { k = k == null ? AU : k; return V(v[0] * k, v[2] * k, -v[1] * k); }
    /** 地平座標（東, 北, 上）→ 天空場景 */
    function h3(v, r) { r = r == null ? DOME : r; return V(v[0] * r, v[2] * r, -v[1] * r); }
    function hv(alt, az) { return C.horizVec(alt, az); }
    function earthPos(o) { const l = o.lambda * DEG; return [-o.R * Math.cos(l), -o.R * Math.sin(l), 0]; }
    const F3 = function (px, w) { return (w || '600') + ' ' + px + 'px system-ui, -apple-system, "Segoe UI", "Noto Sans TC", sans-serif'; };
    function fsScale() {
      const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fs'));
      return v > 0 ? Math.min(1.5, v) : 1;
    }

    // ---- 名稱標示（畫布文字，簡體轉換由 settings.js 處理） ----
    const labels = [];
    let LS = 0.026;
    function makeLabel(color, cy, pri) {
      const mat = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false });
      const sp = new THREE.Sprite(mat);
      sp.renderOrder = 10;
      sp.center.set(0.5, cy == null ? 0 : cy);
      // pri：標示互相重疊時，優先保留數字大的；cx0、cy0：原本的錨點（靠近畫布邊緣時會暫時移動）
      sp.userData = { text: null, color: color, k: 1, pri: pri == null ? 1 : pri, cx0: 0.5, cy0: cy == null ? 0 : cy };
      labels.push(sp);
      return sp;
    }
    function setLabel(sp, text, color) {
      color = color || sp.userData.color;
      if (sp.userData.text === text && sp.userData.drawn === color) return;
      sp.userData.text = text; sp.userData.drawn = color;
      const c = document.createElement('canvas'), g = c.getContext('2d'), px = 52, f = F3(px);
      g.font = f;
      const w = Math.ceil(g.measureText(text).width) + 40, h = Math.ceil(px * 1.5);
      c.width = w; c.height = h;
      g.font = f;
      const r = h * 0.32;
      g.beginPath();
      g.moveTo(r, 2); g.lineTo(w - r, 2); g.quadraticCurveTo(w - 2, 2, w - 2, r); g.lineTo(w - 2, h - r); g.quadraticCurveTo(w - 2, h - 2, w - r, h - 2);
      g.lineTo(r, h - 2); g.quadraticCurveTo(2, h - 2, 2, h - r); g.lineTo(2, r); g.quadraticCurveTo(2, 2, r, 2); g.closePath();
      g.fillStyle = 'rgba(8,13,20,0.8)'; g.fill();
      g.lineWidth = 3; g.strokeStyle = color; g.globalAlpha = 0.6; g.stroke(); g.globalAlpha = 1;
      g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, w / 2, h / 2 + 2);
      if (sp.material.map) sp.material.map.dispose();
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      sp.material.map = tex;
      sp.material.needsUpdate = true;
      sp.userData.k = w / h;
      sp.scale.set(LS * sp.userData.k, LS, 1);
    }
    const LBL = { text: '#e8eef2', sun: '#ffd27a', accent: '#9cc8ff', pos: '#ff9a8a', muted: '#c3ccd2', neg: '#8fd0ff' };

    function lineMat(color, opacity, dashed) {
      const o = { color: color, transparent: opacity < 1, opacity: opacity, depthWrite: opacity >= 1 };
      return own(dashed ? new THREE.LineDashedMaterial(Object.assign(o, { dashSize: dashed[0], gapSize: dashed[1] })) : new THREE.LineBasicMaterial(o));
    }
    function lineFrom(points, mat, loop) {
      const g = new THREE.BufferGeometry().setFromPoints(points);
      const l = loop ? new THREE.LineLoop(g, mat) : new THREE.Line(g, mat);
      if (mat.isLineDashedMaterial) l.computeLineDistances();
      return l;
    }
    function circlePts(n) { const p = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; p.push(V(Math.cos(a), 0, Math.sin(a))); } return p; }
    const unitCircleGeo = own(new THREE.BufferGeometry().setFromPoints(circlePts(160)));

    /** 太陽的光暈（加法混合的貼圖） */
    const glowC = document.createElement('canvas'); glowC.width = glowC.height = 128;
    (function () {
      const g = glowC.getContext('2d');
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(0.18, 'rgba(255,214,120,0.75)'); gr.addColorStop(0.45, 'rgba(255,180,80,0.22)'); gr.addColorStop(1, 'rgba(255,170,60,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    })();
    const glowTex = canvasTex(glowC);
    function glowSprite(size, opacity) {
      const sp = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: opacity == null ? 1 : opacity, toneMapped: false })));
      sp.scale.set(size, size, 1);
      sp.userData.glow = { size: size, opacity: opacity == null ? 1 : opacity };
      return sp;
    }
    const sunSurfC = document.createElement('canvas'); sunSurfC.width = 256; sunSurfC.height = 128;
    (function () { // 太陽表面：淡淡的米粒組織
      const g = sunSurfC.getContext('2d');
      g.fillStyle = '#ffcf5a'; g.fillRect(0, 0, 256, 128);
      let s = 7;
      const rnd = function () { s = (s * 16807) % 2147483647; return s / 2147483647; };
      for (let i = 0; i < 1400; i++) {
        g.fillStyle = rnd() < 0.5 ? 'rgba(255,248,214,0.35)' : 'rgba(230,140,40,0.22)';
        g.beginPath(); g.arc(rnd() * 256, rnd() * 128, 1 + rnd() * 3, 0, Math.PI * 2); g.fill();
      }
    })();
    const sunTex = canvasTex(sunSurfC);

    // =====================================================================
    // 地球貼圖與著色器
    // =====================================================================
    const texC = document.createElement('canvas'); texC.width = 2048; texC.height = 1024;
    const earthTex = canvasTex(texC);
    function paintEarth() {
      const g = texC.getContext('2d'), w = texC.width, h = texC.height;
      const gr = g.createLinearGradient(0, 0, 0, h);
      const oc = tok.ocean;
      gr.addColorStop(0, oc); gr.addColorStop(0.5, oc); gr.addColorStop(1, oc);
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      // 陸地先畫在透明的另一張畫布上，加上淡淡的明暗（source-atop 只落在陸地上），再疊到海洋上
      const lc = document.createElement('canvas'); lc.width = w; lc.height = h;
      const lg = lc.getContext('2d');
      env.land.paint(lg, w, h, { land: tok.land, ice: tok.ice, lake: tok.ocean });
      lg.globalCompositeOperation = 'source-atop';
      let s = 11;
      const rnd = function () { s = (s * 16807) % 2147483647; return s / 2147483647; };
      for (let i = 0; i < 2600; i++) {
        const x = rnd() * w, y = h * (0.08 + rnd() * 0.84), r = 3 + rnd() * 14;
        lg.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)';
        lg.beginPath(); lg.arc(x, y, r, 0, Math.PI * 2); lg.fill();
      }
      g.drawImage(lc, 0, 0);
      // 南北極的海冰
      g.fillStyle = tok.ice;
      g.fillRect(0, 0, w, h * 0.06);
      earthTex.needsUpdate = true;
    }
    const EARTH_VS = [
      'varying vec2 vUv; varying vec3 vN; varying vec3 vV;',
      'void main() {',
      '  vUv = uv;',
      '  vec4 wp = modelMatrix * vec4(position, 1.0);',
      '  vN = normalize(mat3(modelMatrix) * normal);',
      '  vV = normalize(cameraPosition - wp.xyz);',
      '  gl_Position = projectionMatrix * viewMatrix * wp;',
      '}'
    ].join('\n');
    const EARTH_FS = [
      'uniform sampler2D map; uniform vec3 sunDir; uniform vec3 nightCol; uniform vec3 oceanCol; uniform float rimK;',
      'varying vec2 vUv; varying vec3 vN; varying vec3 vV;',
      'void main() {',
      '  vec3 N = normalize(vN), Vv = normalize(vV);',
      '  vec3 base = texture2D(map, vUv).rgb;',
      '  float l = dot(N, sunDir);',
      '  float day = smoothstep(-0.05, 0.07, l);',
      '  vec3 lit = base * (0.2 + 0.95 * max(l, 0.0));',
      '  float ocean = 1.0 - smoothstep(0.01, 0.05, distance(base, oceanCol));',
      '  vec3 H = normalize(sunDir + Vv);',
      '  float spec = ocean * pow(max(dot(N, H), 0.0), 70.0) * 0.55 * step(0.0, l);',
      '  vec3 dark = nightCol + base * 0.07;',
      '  vec3 col = mix(dark, lit + vec3(spec), day);',
      '  float rim = pow(1.0 - max(dot(N, Vv), 0.0), 3.0);',
      '  col += vec3(0.22, 0.45, 0.95) * rim * rimK * (0.2 + 0.8 * day);',
      '  gl_FragColor = vec4(col, 1.0);',
      '  #include <colorspace_fragment>',
      '}'
    ].join('\n');
    function earthMat() {
      return own(new THREE.ShaderMaterial({
        uniforms: { map: { value: earthTex }, sunDir: { value: V(1, 0, 0) }, nightCol: { value: new THREE.Color(0x0b1830) }, oceanCol: { value: new THREE.Color(0x1d5f9a) }, rimK: { value: 1 } },
        vertexShader: EARTH_VS, fragmentShader: EARTH_FS, toneMapped: false
      }));
    }
    const earthMats = [];

    // =====================================================================
    // 場景一：地球繞日
    // =====================================================================
    const so = new THREE.Scene();
    so.add(new THREE.AmbientLight(0xffffff, 0.6));
    // 星空
    const starGeo = own(new THREE.BufferGeometry());
    (function () {
      const n = 1100, a = new Float32Array(n * 3);
      let s = 5;
      const rnd = function () { s = (s * 16807) % 2147483647; return s / 2147483647; };
      for (let i = 0; i < n; i++) {
        const z = rnd() * 2 - 1, ph = rnd() * Math.PI * 2, r = Math.sqrt(1 - z * z) * 600;
        a[i * 3] = r * Math.cos(ph); a[i * 3 + 1] = z * 600; a[i * 3 + 2] = r * Math.sin(ph);
      }
      starGeo.setAttribute('position', new THREE.BufferAttribute(a, 3));
    })();
    const starMat = own(new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.7, depthWrite: false }));
    so.add(new THREE.Points(starGeo, starMat));
    // 太陽
    const sunMesh = new THREE.Mesh(own(new THREE.SphereGeometry(RS, 48, 32)), own(new THREE.MeshBasicMaterial({ map: sunTex, color: 0xffffff, toneMapped: false })));
    so.add(sunMesh);
    const sunGlow = glowSprite(RS * 5, 0.9);
    so.add(sunGlow);
    // 軌道與黃道面
    const S = C.seasons();
    const orbitPts = [];
    for (let k = 0; k <= 360; k++) orbitPts.push(e3(earthPos(C.orbit(S.peri + k * 365.2596 / 360))));
    const orbitMat = lineMat(0x4f8fd6, 0.9);
    const orbitLine = lineFrom(orbitPts, orbitMat);
    so.add(orbitLine);
    const planeMat = own(new THREE.MeshBasicMaterial({ color: 0x4f8fd6, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false }));
    const plane = new THREE.Mesh(own(new THREE.CircleGeometry(AU * 1.12, 128)), planeMat);
    plane.rotation.x = -Math.PI / 2;
    so.add(plane);
    // 每月 1 日的小點
    const monthDotGeo = own(new THREE.SphereGeometry(0.07, 12, 8));
    const monthDotMat = own(new THREE.MeshBasicMaterial({ color: 0x4f8fd6 }));
    (function () {
      let d = 1;
      for (let m = 0; m < 12; m++) {
        const t = C.tOf(d, 0, 0);
        const dot = new THREE.Mesh(monthDotGeo, monthDotMat);
        dot.position.copy(e3(earthPos(C.orbit(t))));
        so.add(dot);
        d += C.MONTH_DAYS[m];
      }
    })();
    // 公轉方向箭頭
    const arrowMat = own(new THREE.MeshBasicMaterial({ color: 0x4f8fd6 }));
    const arrowGeo = own(new THREE.ConeGeometry(0.22, 0.6, 16));
    [S.sep - 12, S.mar - 12].forEach(function (t) {
      const p0 = e3(earthPos(C.orbit(t))), p1 = e3(earthPos(C.orbit(t + 2)));
      const m = new THREE.Mesh(arrowGeo, arrowMat);
      m.position.copy(p0);
      m.quaternion.setFromUnitVectors(V(0, 1, 0), p1.clone().sub(p0).normalize());
      so.add(m);
    });
    // 近日點、遠日點
    const apsGeo = own(new THREE.OctahedronGeometry(0.2));
    const apsMat = own(new THREE.MeshBasicMaterial({ color: 0x4f8fd6 }));
    const aps = [S.peri, S.aph].map(function (t) {
      const m = new THREE.Mesh(apsGeo, apsMat);
      m.position.copy(e3(earthPos(C.orbit(t))));
      so.add(m);
      const lb = makeLabel(LBL.accent, 1.15, 0.8);
      lb.position.copy(m.position);
      so.add(lb);
      return { t: t, m: m, lb: lb };
    });

    // ---- 地球（主角＋四季的小地球） ----
    const sphereGeo = own(new THREE.SphereGeometry(1, 96, 64));
    const axisGeo = own(new THREE.CylinderGeometry(0.013, 0.013, 3.2, 10));
    axisGeo.translate(0, 0.15, 0); // 北端伸出 1.75 倍半徑，南端 1.45 倍
    const axisMat = own(new THREE.MeshBasicMaterial({ color: 0xeeeeee }));
    const eqMat = lineMat(0xffffff, 0.75);
    const tropMat = lineMat(0xffc24a, 0.95, [0.06, 0.05]);
    const polarMat = lineMat(0xbfe3ff, 0.9, [0.04, 0.05]);
    function ringLine(mat) {
      const l = new THREE.LineLoop(unitCircleGeo, mat);
      if (mat.isLineDashedMaterial) l.computeLineDistances();
      return l;
    }
    function makeEarth(r, main) {
      const g = new THREE.Group();
      const tilt = new THREE.Group();
      g.add(tilt);
      const mat = earthMat();
      earthMats.push(mat);
      const sph = new THREE.Mesh(sphereGeo, mat);
      sph.scale.setScalar(r);
      tilt.add(sph);
      const ax = new THREE.Mesh(axisGeo, axisMat);
      ax.scale.set(main ? 1.4 : 1, r, main ? 1.4 : 1);
      tilt.add(ax);
      const rings = [];
      const addRing = function (mat2, kind) { const l = ringLine(mat2); l.userData.kind = kind; tilt.add(l); rings.push(l); return l; };
      addRing(eqMat, 'eq');
      if (main) { addRing(tropMat, 'tn'); addRing(tropMat, 'ts'); addRing(polarMat, 'pn'); addRing(polarMat, 'ps'); }
      const e = { g: g, tilt: tilt, sph: sph, mat: mat, r: r, rings: rings };
      so.add(g);
      return e;
    }
    function placeRings(e, eps) {
      e.rings.forEach(function (l) {
        const lat = { eq: 0, tn: eps, ts: -eps, pn: 90 - eps, ps: -(90 - eps) }[l.userData.kind] * DEG;
        const k = e.r * 1.006;
        l.position.y = k * Math.sin(lat);
        l.scale.set(k * Math.cos(lat), 1, k * Math.cos(lat));
        l.visible = Math.cos(lat) > 0.02;
      });
    }
    function orientEarth(e, pos, eps, theta) {
      e.g.position.copy(pos);
      e.tilt.rotation.x = -eps * DEG;
      e.sph.rotation.y = theta * DEG;
      e.mat.uniforms.sunDir.value.copy(pos).multiplyScalar(-1).normalize();
    }
    const earth = makeEarth(RE, true);
    const ghosts = ['mar', 'jun', 'sep', 'dec'].map(function (k) {
      const e = makeEarth(RG, false);
      e.k = k;
      e.lb = makeLabel(LBL.muted, 0, 1);
      so.add(e.lb);
      return e;
    });
    // 晨昏線、直射點、觀察者
    const termMat = lineMat(0xffc24a, 0.95);
    const term = new THREE.LineLoop(unitCircleGeo, termMat);
    so.add(term);
    const subMat = own(new THREE.MeshBasicMaterial({ color: 0xfff1b8 }));
    const subDot = new THREE.Mesh(own(new THREE.SphereGeometry(0.045, 16, 12)), subMat);
    so.add(subDot);
    const subGlow = glowSprite(0.42, 1);
    so.add(subGlow);
    const obsMat = own(new THREE.MeshBasicMaterial({ color: 0xd1453b }));
    const obsDot = new THREE.Mesh(own(new THREE.SphereGeometry(0.075, 16, 12)), obsMat);
    earth.sph.add(obsDot);
    const obsStick = new THREE.Mesh(own(new THREE.CylinderGeometry(0.018, 0.018, 0.22, 8)), obsMat);
    earth.sph.add(obsStick);
    // 標示
    const lbSun = makeLabel(LBL.sun, 0, 2); so.add(lbSun);
    const lbPolaris = makeLabel(LBL.text, 0, 1.5); so.add(lbPolaris);

    // =====================================================================
    // 場景二：觀察者的天空
    // =====================================================================
    const ss = new THREE.Scene();
    const hemi = new THREE.HemisphereLight(0xeaf2ff, 0x4a4032, 0.9);
    ss.add(hemi);
    const sunLight = new THREE.DirectionalLight(0xfff2dc, 2.2);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.radius = 3;
    sunLight.shadow.bias = -0.0004;
    sunLight.shadow.normalBias = 0.02;
    (function () { const c = sunLight.shadow.camera; c.left = -DOME; c.right = DOME; c.bottom = -DOME; c.top = DOME; c.near = 1; c.far = 80; })();
    ss.add(sunLight);
    ss.add(sunLight.target);
    // 地面（貼圖：北方朝上、東方朝右；同心圓是 1、2、3、4 倍竿長）
    const groundC = document.createElement('canvas'); groundC.width = groundC.height = 1024;
    const groundTex = canvasTex(groundC);
    function paintGround() {
      const g = groundC.getContext('2d'), n = 1024, c = n / 2, R = n / 2;
      g.clearRect(0, 0, n, n);
      const gr = g.createRadialGradient(c, c, R * 0.05, c, c, R);
      gr.addColorStop(0, tok.ground); gr.addColorStop(1, tok.ground);
      g.fillStyle = gr; g.beginPath(); g.arc(c, c, R, 0, Math.PI * 2); g.fill();
      let s = 3;
      const rnd = function () { s = (s * 16807) % 2147483647; return s / 2147483647; };
      for (let i = 0; i < 3000; i++) {
        g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.035)';
        const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * R;
        g.beginPath(); g.arc(c + rr * Math.cos(a), c + rr * Math.sin(a), 1 + rnd() * 3.5, 0, Math.PI * 2); g.fill();
      }
      const ink = tok.dark ? 'rgba(255,255,255,' : 'rgba(20,30,30,';
      g.lineWidth = 2;
      for (let k = 1; k <= 4; k++) {
        g.strokeStyle = ink + '0.22)';
        g.setLineDash([10, 10]);
        g.beginPath(); g.arc(c, c, R * k * POLE / DOME, 0, Math.PI * 2); g.stroke();
      }
      g.setLineDash([]);
      for (let a = 0; a < 360; a += 10) {
        const r0 = a % 90 === 0 ? 0.06 : a % 30 === 0 ? 0.86 : 0.93;
        g.strokeStyle = ink + (a % 90 === 0 ? '0.32)' : '0.22)');
        g.lineWidth = a % 90 === 0 ? 3 : 2;
        const sx = Math.sin(a * DEG), sy = -Math.cos(a * DEG);
        g.beginPath(); g.moveTo(c + sx * R * r0, c + sy * R * r0); g.lineTo(c + sx * R * 0.995, c + sy * R * 0.995); g.stroke();
      }
      g.strokeStyle = ink + '0.4)'; g.lineWidth = 4;
      g.beginPath(); g.arc(c, c, R - 3, 0, Math.PI * 2); g.stroke();
      groundTex.needsUpdate = true;
    }
    const groundMat = own(new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95, metalness: 0 }));
    const groundGeo = own(new THREE.CircleGeometry(DOME, 128));
    groundGeo.rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.receiveShadow = true;
    ss.add(ground);
    const soilMat = own(new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 1, side: THREE.DoubleSide }));
    const soil = new THREE.Mesh(own(new THREE.CylinderGeometry(DOME, DOME * 0.97, 0.6, 128, 1, true)), soilMat);
    soil.position.y = -0.3;
    ss.add(soil);
    const soilBottom = new THREE.Mesh(own(new THREE.CircleGeometry(DOME * 0.97, 64)), soilMat);
    soilBottom.rotation.x = Math.PI / 2; soilBottom.position.y = -0.6;
    ss.add(soilBottom);
    // 天球（半透明）與格線
    const domeMat = own(new THREE.MeshBasicMaterial({ color: 0x9fd0ff, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }));
    const dome = new THREE.Mesh(own(new THREE.SphereGeometry(DOME, 72, 24, 0, Math.PI * 2, 0, Math.PI / 2)), domeMat);
    ss.add(dome);
    const gridMat = lineMat(0x8899aa, 0.28);
    [30, 60].forEach(function (alt) {
      const l = new THREE.LineLoop(unitCircleGeo, gridMat);
      l.scale.set(DOME * Math.cos(alt * DEG), 1, DOME * Math.cos(alt * DEG));
      l.position.y = DOME * Math.sin(alt * DEG);
      ss.add(l);
    });
    for (let az = 0; az < 360; az += 30) {
      const pts = [];
      for (let a = 0; a <= 90; a += 3) pts.push(h3(hv(a, az)));
      ss.add(lineFrom(pts, az % 180 === 0 ? lineMat(0x8899aa, 0.45, [0.25, 0.2]) : gridMat));
    }
    const rimLine = new THREE.LineLoop(unitCircleGeo, lineMat(0x8899aa, 0.5));
    rimLine.scale.set(DOME, 1, DOME); rimLine.position.y = 0.01;
    ss.add(rimLine);
    // 天極軸
    const poleAxisMat = lineMat(0x4f8fd6, 0.95, [0.35, 0.22]);
    let poleAxis = null;
    const poleDot = new THREE.Mesh(own(new THREE.SphereGeometry(0.14, 16, 12)), own(new THREE.MeshBasicMaterial({ color: 0x4f8fd6 })));
    ss.add(poleDot);
    // 參考軌跡（夏至、春秋分、冬至）與今天的軌跡
    const refMat = lineMat(0x9aa4ae, 0.85, [0.3, 0.22]);
    let refLines = [], refKey = '';
    const pathMat = own(new THREE.MeshBasicMaterial({ color: 0xffb020 }));
    const pathGlowMat = own(new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.25, depthWrite: false }));
    let pathMesh = null, pathGlow = null, pathRef = null;
    const hourGeo = own(new THREE.SphereGeometry(0.1, 12, 8));
    const hourMat = own(new THREE.MeshBasicMaterial({ color: 0xffffff }));
    const hourDots = [], hourLbs = [];
    for (let i = 0; i < 26; i++) {
      const d = new THREE.Mesh(hourGeo, hourMat); d.visible = false; ss.add(d); hourDots.push(d);
      const lb = makeLabel(LBL.sun, 0.5, 0.5); lb.visible = false; ss.add(lb); hourLbs.push(lb);
    }
    // 太陽
    const skySun = new THREE.Mesh(own(new THREE.SphereGeometry(0.5, 32, 20)), own(new THREE.MeshBasicMaterial({ map: sunTex, toneMapped: false })));
    ss.add(skySun);
    const skyGlow = glowSprite(4.2, 0.95);
    ss.add(skyGlow);
    // 竿子
    const poleMat = own(new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 0.55, metalness: 0.1 }));
    const pole = new THREE.Mesh(own(new THREE.CylinderGeometry(0.09, 0.11, POLE, 24)), poleMat);
    pole.position.y = POLE / 2; pole.castShadow = true;
    ss.add(pole);
    const poleTop = new THREE.Mesh(own(new THREE.SphereGeometry(0.16, 24, 16)), poleMat);
    poleTop.position.y = POLE; poleTop.castShadow = true;
    ss.add(poleTop);
    // 竿影的長條（與平行光的陰影重合，讓低太陽時的長影也看得清楚）：寬 = 竿的直徑，長 = 竿高 / tan h
    const stripGeo = own(new THREE.PlaneGeometry(1, 1));
    stripGeo.rotateX(-Math.PI / 2); stripGeo.translate(0, 0, -0.5); // 從原點往 −z（北方）延伸 1 單位
    const stripMat = own(new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    const strip = new THREE.Mesh(stripGeo, stripMat);
    strip.position.y = 0.012; strip.renderOrder = 2;
    ss.add(strip);
    const tipMat = own(new THREE.MeshBasicMaterial({ color: 0xd1453b }));
    const tipDot = new THREE.Mesh(own(new THREE.CylinderGeometry(0.12, 0.12, 0.02, 20)), tipMat);
    ss.add(tipDot);
    // 竿影尖端的軌跡（預留 1440 段）
    const traceGeo = own(new THREE.BufferGeometry());
    traceGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(1440 * 2 * 3), 3));
    const traceMat = lineMat(0xd1453b, 0.95);
    const traceLines = new THREE.LineSegments(traceGeo, traceMat);
    traceLines.frustumCulled = false;
    ss.add(traceLines);
    // 一年中同一時刻的太陽（8 字形）
    const anaGeo = own(new THREE.BufferGeometry());
    anaGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(400 * 3), 3));
    const anaMat = own(new THREE.PointsMaterial({ color: 0xffb020, size: 5, sizeAttenuation: false, transparent: true, opacity: 0.9 }));
    const anaPts = new THREE.Points(anaGeo, anaMat);
    anaPts.frustumCulled = false;
    ss.add(anaPts);
    // 日出、日落
    const rsGeo = own(new THREE.SphereGeometry(0.14, 14, 10));
    const rsMat = own(new THREE.MeshBasicMaterial({ color: 0xe08a00 }));
    const riseDot = new THREE.Mesh(rsGeo, rsMat), setDot = new THREE.Mesh(rsGeo, rsMat);
    ss.add(riseDot); ss.add(setDot);
    // 高度角
    const altArcGeo = own(new THREE.BufferGeometry());
    altArcGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(33 * 3), 3));
    const altArc = new THREE.Line(altArcGeo, lineMat(0xffc24a, 1));
    altArc.frustumCulled = false;
    ss.add(altArc);
    const rayGeo = own(new THREE.BufferGeometry());
    rayGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const ray = new THREE.Line(rayGeo, lineMat(0xffc24a, 0.7, [0.2, 0.15]));
    ray.frustumCulled = false;
    ss.add(ray);
    // 標示
    const lbDir = ['N', 'E', 'S', 'W'].map(function (k, i) {
      const lb = makeLabel(i === 0 ? LBL.pos : LBL.text, 0.5, 2.5);
      lb.position.copy(h3(hv(0, i * 90), DOME * 1.1)).setY(0.3);
      ss.add(lb);
      return lb;
    });
    const lbZen = makeLabel(LBL.muted, 0, 0.2); lbZen.position.set(0, DOME + 0.2, 0); ss.add(lbZen);
    const lbPole = makeLabel(LBL.accent, 0, 1.6); ss.add(lbPole);
    const lbRise = makeLabel(LBL.sun, 1.2, 1.8), lbSet = makeLabel(LBL.sun, 1.2, 1.8);
    ss.add(lbRise); ss.add(lbSet);
    const lbAlt = makeLabel(LBL.sun, 0.5, 2.2); ss.add(lbAlt);

    // =====================================================================
    // 顏色
    // =====================================================================
    function col(k, d) { return new THREE.Color(tok[k] || d); }
    function applyColors() {
      tok = env.tokens();
      paintEarth();
      paintGround();
      const night = col('night', '#0b1830').multiplyScalar(0.55), ocean = col('ocean', '#1d5f9a');
      earthMats.forEach(function (m) { m.uniforms.nightCol.value.copy(night); m.uniforms.oceanCol.value.copy(ocean); m.uniforms.rimK.value = tok.dark ? 1 : 0.8; });
      const acc = col('accent', '#2f6fd0');
      orbitMat.color.copy(acc); planeMat.color.copy(acc); monthDotMat.color.copy(acc); arrowMat.color.copy(acc); apsMat.color.copy(acc);
      planeMat.opacity = tok.dark ? 0.07 : 0.06;
      axisMat.color.copy(col('text', '#eeeeee'));
      if (!tok.dark) axisMat.color.lerp(new THREE.Color(0x000000), 0.1);
      starMat.color.copy(tok.dark ? new THREE.Color(0xffffff) : col('text', '#333333'));
      starMat.opacity = tok.dark ? 0.75 : 0.18;
      const sunC = col('sun', '#f2a516');
      // 淺色背景上，加法混合的光暈會把畫面洗白：改成一般混合、縮小、變淡
      [sunGlow, skyGlow, subGlow].forEach(function (gl) {
        const u = gl.userData.glow, m = gl.material;
        const b = tok.dark ? THREE.AdditiveBlending : THREE.NormalBlending;
        if (m.blending !== b) { m.blending = b; m.needsUpdate = true; }
        m.opacity = u.opacity * (tok.dark ? 1 : 0.55);
        const k = tok.dark ? 1 : 0.75;
        gl.scale.set(u.size * k, u.size * k, 1);
      });
      pathMat.color.copy(sunC); pathGlowMat.color.copy(sunC); anaMat.color.copy(sunC);
      rsMat.color.copy(sunC).lerp(new THREE.Color(0x000000), 0.2);
      termMat.color.copy(sunC); tropMat.color.copy(sunC);
      poleAxisMat.color.copy(acc); poleDot.material.color.copy(acc);
      stripMat.opacity = tok.dark ? 0.42 : 0.26;
      tipMat.color.copy(col('neg', '#d1453b')); traceMat.color.copy(col('neg', '#d1453b'));
      obsMat.color.copy(col('pos', '#d1453b'));
      poleMat.color.copy(col('pole', '#8a6a48'));
      soilMat.color.copy(col('soil', '#7a5a3a'));
      refMat.color.copy(col('muted', '#9aa4ae'));
      gridMat.color.copy(col('muted', '#8899aa'));
      hemi.groundColor.copy(col('soil', '#4a4032'));
    }

    // =====================================================================
    // 相機
    // =====================================================================
    const saved = { orbit: null, sky: null };
    function defaultView() {
      const tall = camera.aspect < 1.1;
      if (sceneName === 'orbit') {
        const el = (tall ? 52 : 27) * DEG;
        return {
          target: V(0, 0, 0), dir: V(Math.cos(el), Math.sin(el), 0),
          key: [V(11.5, 0, 0), V(-11.5, 0, 0), V(0, 0, 11.5), V(0, 0, -11.5), V(0, 3.2, 0), V(0, -1.6, 0), V(0, 2.4, 10.3), V(0, 2.4, -10.3)]
        };
      }
      const ec = (tall ? 34 : 24) * DEG, ac = 160 * DEG;
      return {
        target: V(0, 3.2, 0), dir: V(Math.sin(ac) * Math.cos(ec), Math.sin(ec), -Math.cos(ac) * Math.cos(ec)),
        key: [V(DOME * 1.12, 0, 0), V(-DOME * 1.12, 0, 0), V(0, 0, DOME * 1.12), V(0, 0, -DOME * 1.12), V(0, DOME + 0.8, 0), V(0, -0.6, DOME), V(0, -0.6, -DOME)]
      };
    }
    function fit() {
      const v = defaultView();
      const tv = Math.tan(camera.fov * Math.PI / 360), th = tv * camera.aspect;
      const dir = v.dir.clone().normalize();
      controls.target.copy(v.target);
      const right = new THREE.Vector3().crossVectors(V(0, 1, 0), dir).normalize();
      const up = new THREE.Vector3().crossVectors(dir, right);
      let d = 5;
      v.key.forEach(function (p) {
        const q = p.clone().sub(v.target);
        d = Math.max(d, q.dot(dir) + Math.abs(q.dot(right)) / th, q.dot(dir) + Math.abs(q.dot(up)) / tv);
      });
      d *= 1.04;
      camera.position.copy(v.target).addScaledVector(dir, d);
      camera.near = 0.05; camera.far = 3000;
      camera.updateProjectionMatrix();
      controls.update();
    }
    function saveCam() { saved[sceneName] = { p: camera.position.clone(), t: controls.target.clone(), earth: camEarth }; }
    let lastEarth = null;
    function followEarth(pos) {
      if (!camEarth || sceneName !== 'orbit') { lastEarth = null; return; }
      if (lastEarth) {
        const d = pos.clone().sub(lastEarth);
        camera.position.add(d); controls.target.add(d);
      } else {
        // 第一次：把相機移到地球旁，從側面（稍微偏向陽側）的上方看，同時看到白天、夜晚與晨昏線
        const toSun = pos.clone().multiplyScalar(-1).normalize();
        const side = new THREE.Vector3().crossVectors(V(0, 1, 0), toSun).normalize();
        const dir = toSun.clone().multiplyScalar(0.35).addScaledVector(side, 0.9).add(V(0, 0.45, 0)).normalize();
        controls.target.copy(pos);
        camera.position.copy(pos).addScaledVector(dir, RE * 8.5);
      }
      lastEarth = pos.clone();
    }

    // =====================================================================
    // 依狀態更新
    // =====================================================================
    function updateOrbit(s) {
      const o = s.o, pos = e3(earthPos(o));
      orientEarth(earth, pos, s.eps, s.theta);
      placeRings(earth, s.eps);
      const sunDir = pos.clone().multiplyScalar(-1).normalize();
      // 晨昏線：與太陽方向垂直的大圓
      term.position.copy(pos);
      term.quaternion.setFromUnitVectors(V(0, 1, 0), sunDir);
      term.scale.setScalar(RE * 1.008);
      // 直射點（太陽方向與地表的交點；與核心的 δ、經度一致）
      subDot.position.copy(pos).addScaledVector(sunDir, RE * 1.01);
      subGlow.position.copy(subDot.position);
      // 觀察者（在地球自轉的座標裡）
      const la = s.lat * DEG, lo = s.lon * DEG;
      const local = V(Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo));
      obsDot.position.copy(local).multiplyScalar(1.02);
      obsStick.position.copy(local).multiplyScalar(1.1);
      obsStick.quaternion.setFromUnitVectors(V(0, 1, 0), local);
      // 四季的小地球
      ghosts.forEach(function (e) {
        const og = C.sunAt(s.seasons[e.k], s.eps);
        const gp = e3(earthPos(og));
        const day = s.seasonDay(e.k);
        const tg = C.tOf(day, 12, s.zone);
        orientEarth(e, gp, s.eps, C.greenwich(tg, C.sunAt(tg, s.eps)));
        placeRings(e, s.eps);
        const near = gp.distanceTo(pos) < RE + RG + 0.5;
        e.g.visible = !near;
        const d = C.dateOfDay(day);
        const tallG = camera.aspect < 1.1;
        const name = tallG
          ? { mar: T('春分', 'Equinox'), jun: T('夏至', 'Solstice'), sep: T('秋分', 'Equinox'), dec: T('冬至', 'Solstice') }[e.k]
          : { mar: T('春分', 'Mar equinox'), jun: T('夏至', 'Jun solstice'), sep: T('秋分', 'Sep equinox'), dec: T('冬至', 'Dec solstice') }[e.k];
        setLabel(e.lb, name + ' ' + (T('', 'x') === 'x' ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.m - 1] + ' ' + d.d : d.m + '/' + d.d));
        e.lb.position.copy(gp).add(V(0, RG * 2.1, 0));
        e.lb.visible = s.labels && !near;
      });
      aps.forEach(function (a, i) {
        const d = C.dateOfDay(C.localOf(a.t, s.zone).day);
        const en = T('', 'x') === 'x';
        const date = en ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.m - 1] + ' ' + d.d : d.m + '/' + d.d;
        const tall = camera.aspect < 1.1;
        setLabel(a.lb, (i ? T('遠日點 ', 'Aphelion ') : T('近日點 ', 'Perihelion ')) + date + (tall ? '' : T('・', ' · ') + C.orbit(a.t).R.toFixed(3) + ' AU'));
        // 放在軌道外側、稍低，避開地球與四季的小地球
        a.lb.position.copy(a.m.position).multiply(V(1.09, 0, 1.09)).add(V(0, -0.25, 0));
        a.lb.visible = s.labels && !camEarth;
      });
      // 地軸北端：指向北極星
      const north = V(0, Math.cos(s.eps * DEG), -Math.sin(s.eps * DEG));
      setLabel(lbPolaris, T('指向北極星', 'Toward Polaris'));
      lbPolaris.position.copy(pos).addScaledVector(north, RE * 2.05);
      lbPolaris.visible = s.labels;
      setLabel(lbSun, T('太陽', 'Sun'));
      lbSun.position.set(0, RS * 1.35, 0);
      lbSun.visible = s.labels;
      followEarth(pos);
    }
    function skyColor(alt) {
      const sky = col('sky', '#8ec5f0'), dusk = col('dusk', '#f0a070'), night = col('night', '#0b1830');
      if (alt >= 6) return sky;
      if (alt >= -1) return dusk.lerp(sky, (alt + 1) / 7);
      if (alt >= -8) return night.lerp(dusk, (alt + 8) / 7);
      return night;
    }
    /** 只留地平線以上的部分：切成幾段，穿過地平線的地方內插到地平線上；整圈都在上面時是一個封閉圈。
     *  q：[{alt, az}]；closed：q 首尾相連（參考軌跡是一整圈時角） */
    function upRuns(q, closed) {
      const n = q.length, up = q.map(function (p) { return p.alt >= 0; });
      const vec = function (p) { return h3(hv(p.alt, p.az)); };
      const cross = function (a, b) {
        const v = vec(a).lerp(vec(b), a.alt / (a.alt - b.alt));
        v.y = 0;
        return v.setLength(DOME);
      };
      const wrap = closed || vec(q[0]).distanceTo(vec(q[n - 1])) < 0.6;
      if (up.every(Boolean)) {
        const pts = q.map(vec);
        if (wrap && !closed) pts.pop();
        pts.loop = wrap;
        return [pts];
      }
      const runs = [];
      let run = null;
      const s0 = wrap ? up.indexOf(false) : 0;
      for (let k = 0; k < n; k++) {
        const i = (s0 + k) % n, j = wrap ? (i + n - 1) % n : i - 1;
        if (up[i]) {
          if (!run) { run = []; run.loop = false; if (j >= 0 && !up[j]) run.push(cross(q[j], q[i])); }
          run.push(vec(q[i]));
        } else if (run) {
          run.push(cross(q[j], q[i]));
          runs.push(run); run = null;
        }
      }
      if (run) {
        if (wrap && !up[s0]) run.push(cross(q[(s0 + n - 1) % n], q[s0]));
        runs.push(run);
      }
      return runs;
    }
    function rebuildPath(s) {
      if (pathRef === s.path) return;
      pathRef = s.path;
      [pathMesh, pathGlow].forEach(function (grp) { if (grp) { ss.remove(grp); grp.children.forEach(function (m) { m.geometry.dispose(); }); } });
      pathMesh = new THREE.Group(); pathGlow = new THREE.Group();
      upRuns(s.path, false).forEach(function (run) {
        if (run.length < 2) return;
        const curve = new THREE.CatmullRomCurve3(run, run.loop, 'centripetal');
        pathMesh.add(new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(16, run.length * 2), 0.055, 8, run.loop), pathMat));
        pathGlow.add(new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(16, run.length), 0.16, 8, run.loop), pathGlowMat));
      });
      ss.add(pathMesh); ss.add(pathGlow);
    }
    function rebuildRef(s) {
      const k = s.lat + '|' + s.ref.join(',');
      if (k === refKey) return;
      refKey = k;
      refLines.forEach(function (l) { ss.remove(l); l.geometry.dispose(); });
      refLines = [];
      s.ref.forEach(function (dec) {
        const q = [];
        for (let H = -180; H < 180; H += 2) q.push(C.horizontal(s.lat, dec, H));
        upRuns(q, true).forEach(function (run) {
          if (run.length < 2) return;
          const l = lineFrom(run, refMat, run.loop);
          ss.add(l);
          refLines.push(l);
        });
      });
      if (poleAxis) { ss.remove(poleAxis); poleAxis.geometry.dispose(); }
      const pa = Math.abs(s.lat), paz = s.lat >= 0 ? 0 : 180;
      const pe = h3(hv(pa, paz), DOME * 1.06);
      poleAxis = lineFrom([V(0, 0, 0), pe], poleAxisMat);
      ss.add(poleAxis);
      poleDot.position.copy(pe);
      lbPole.position.copy(pe).add(V(0, 0.35, 0));
    }
    function updateSky(s) {
      const sn = s.s;
      rebuildPath(s);
      rebuildRef(s);
      setLabel(lbPole, (s.lat >= 0 ? T('北天極 ', 'N celestial pole ') : T('南天極 ', 'S celestial pole ')) + Math.abs(s.lat).toFixed(1) + '°');
      lbPole.visible = s.labels;
      // 天空的顏色與光線
      const up = sn.alt > 0;
      const sky = skyColor(sn.alt);
      domeMat.color.copy(sky);
      domeMat.opacity = up ? 0.14 : 0.2;
      const day = Math.max(0, Math.min(1, (sn.alt + 4) / 14));
      hemi.intensity = 0.25 + 0.6 * day;
      hemi.color.copy(new THREE.Color(0x6c7fa8).lerp(new THREE.Color(0xeaf2ff), day));
      // 太陽
      const sv = h3(hv(sn.alt, sn.az));
      skySun.position.copy(sv); skyGlow.position.copy(sv);
      skySun.visible = skyGlow.visible = sn.alt > -1.5;
      sunLight.position.copy(h3(hv(sn.alt, sn.az), 40));
      sunLight.intensity = up ? 3.4 * Math.min(1, sn.alt / 4 + 0.2) : 0;
      sunLight.castShadow = up;
      // 整點記號
      let n = 0;
      const path = s.path;
      for (let i = 1; i < path.length && n < hourDots.length; i++) {
        const a = path[i - 1], b = path[i];
        const h = Math.floor(b.c);
        if (h === Math.floor(a.c)) continue;
        const f = (h - a.c) / (b.c - a.c);
        const va = h3(hv(a.alt, a.az)), vb = h3(hv(b.alt, b.az));
        const p = va.lerp(vb, f).setLength(DOME);
        if (p.y < 0) continue;
        hourDots[n].position.copy(p); hourDots[n].visible = true;
        const hh = ((h % 24) + 24) % 24;
        const lb = hourLbs[n];
        if (s.labels && hh % 3 === 0) { setLabel(lb, String(hh)); lb.position.copy(p).multiplyScalar(1.07); lb.visible = true; } else lb.visible = false;
        n++;
      }
      for (; n < hourDots.length; n++) { hourDots[n].visible = false; hourLbs[n].visible = false; }
      // 日出、日落
      const showRS = !sn.polar;
      riseDot.visible = setDot.visible = showRS;
      lbRise.visible = lbSet.visible = showRS && s.labels;
      if (showRS) {
        riseDot.position.copy(h3(hv(0, sn.riseAz)));
        setDot.position.copy(h3(hv(0, sn.setAz)));
        setLabel(lbRise, T('日出 ', 'Rise ') + hmText(sn.rise));
        setLabel(lbSet, T('日落 ', 'Set ') + hmText(sn.set));
        lbRise.position.copy(riseDot.position).setY(-0.25);
        lbSet.position.copy(setDot.position).setY(-0.25);
      }
      // 竿影尖端與軌跡
      if (up) {
        const sh = C.shadow(sn.alt, sn.az, POLE);
        const tip = V(sh.x, 0.02, -sh.y);
        tipDot.visible = sh.len < DOME;
        tipDot.position.copy(tip);
        // 長條：沿影子的方位角，超出地面的部分截掉
        strip.visible = sh.len > 0.05;
        strip.scale.set(0.2, 1, Math.min(sh.len, DOME * 0.995));
        strip.rotation.y = -Math.atan2(sh.x, sh.y); // 方位角從北往東量；場景中北 = −z、東 = +x
      } else { tipDot.visible = false; strip.visible = false; }
      const tp = traceGeo.attributes.position.array;
      let m = 0;
      const tr = s.trace;
      for (let i = 1; i < tr.length && m < 1440; i++) {
        const a = tr[i - 1], b = tr[i];
        if (b[2] - a[2] > 6) continue;
        if (Math.hypot(a[0], a[1]) * POLE > DOME || Math.hypot(b[0], b[1]) * POLE > DOME) continue;
        tp.set([a[0] * POLE, 0.03, -a[1] * POLE, b[0] * POLE, 0.03, -b[1] * POLE], m * 6);
        m++;
      }
      traceGeo.setDrawRange(0, m * 2);
      traceGeo.attributes.position.needsUpdate = true;
      // 8 字形
      const ap = anaGeo.attributes.position.array;
      let k = 0;
      s.ana.forEach(function (q) {
        if (q.alt <= 0 || k >= 400) return;
        const v = h3(hv(q.alt, q.az));
        ap[k * 3] = v.x; ap[k * 3 + 1] = v.y; ap[k * 3 + 2] = v.z;
        k++;
      });
      anaGeo.setDrawRange(0, k);
      anaGeo.attributes.position.needsUpdate = true;
      // 高度角
      altArc.visible = ray.visible = lbAlt.visible = up;
      if (up) {
        const arr = altArcGeo.attributes.position.array;
        for (let i = 0; i <= 32; i++) { const v = h3(hv(sn.alt * i / 32, sn.az), 3.2); arr[i * 3] = v.x; arr[i * 3 + 1] = v.y; arr[i * 3 + 2] = v.z; }
        altArcGeo.attributes.position.needsUpdate = true;
        const r = rayGeo.attributes.position.array;
        r[0] = 0; r[1] = 0; r[2] = 0; r[3] = sv.x; r[4] = sv.y; r[5] = sv.z;
        rayGeo.attributes.position.needsUpdate = true;
        ray.computeLineDistances();
        setLabel(lbAlt, 'h = ' + sn.alt.toFixed(1) + '°');
        lbAlt.position.copy(h3(hv(sn.alt / 2, sn.az), 3.6));
        lbAlt.visible = s.labels;
      }
      const en = T('', 'x') === 'x';
      ['N', 'E', 'S', 'W'].forEach(function (k2, i) { setLabel(lbDir[i], en ? k2 : '北東南西'[i]); lbDir[i].visible = s.labels; });
      setLabel(lbZen, T('天頂', 'Zenith'));
      lbZen.visible = s.labels;
    }
    function hmText(h) {
      let x = Math.round(h * 60);
      x = ((x % 1440) + 1440) % 1440;
      return String(Math.floor(x / 60)).padStart(2, '0') + ':' + String(x % 60).padStart(2, '0');
    }
    function updateHud(s) {
      const sn = s.s;
      hudTL[0].textContent = s.locName + T('・', ' · ') + s.dateText + ' ' + s.timeText;
      hudTL[1].textContent = sceneName === 'orbit'
        ? T('太陽赤緯 δ = ', 'Declination δ = ') + (sn.dec >= 0 ? '+' : '−') + Math.abs(sn.dec).toFixed(2) + T('°・日地距離 ', '° · Earth–Sun ') + sn.R.toFixed(4) + ' AU'
        : T('高度角 h = ', 'Altitude h = ') + sn.alt.toFixed(1) + T('°・方位角 A = ', '° · azimuth A = ') + sn.az.toFixed(1) + '°';
      if (sceneName === 'orbit') hudBR.textContent = T('尺寸未按比例；地軸傾角 ', 'Sizes not to scale; axial tilt ') + s.eps.toFixed(2) + '°';
      else hudBR.textContent = sn.alt > 0 ? T('竿高 = 天球半徑的 0.2 倍；影長 = ', 'Pole = 0.2 × dome radius; shadow = ') + (sn.ratio < 1000 ? sn.ratio.toFixed(3) : '> 1000') + T(' 倍竿長', ' × pole')
        : T('太陽在地平線下', 'The Sun is below the horizon');
    }
    function update() {
      const s = env.state();
      cur = s;
      labels.forEach(function (l) { if (l.userData.hidOverlap) { l.visible = true; l.userData.hidOverlap = false; } });
      if (s.scene && s.scene !== sceneName) setScene(s.scene, true);
      if (s.camEarth !== undefined && s.camEarth !== camEarth) setCamEarth(s.camEarth, true);
      if (sceneName === 'orbit') updateOrbit(s); else updateSky(s);
      updateHud(s);
      requestRender();
    }

    // ---- 繪製 ----
    let raf = 0;
    function renderNow() {
      if (!api.active || document.hidden) return;
      const want = Math.min(window.devicePixelRatio || 1, 2);
      if (renderer.getPixelRatio() !== want) { renderer.setPixelRatio(want); resize3(); return; }
      const moved = controls.update();
      const scene = sceneName === 'orbit' ? so : ss;
      if (sceneName === 'sky' && lbAlt.visible) {
        // 「h = …」放在高度角弧線遠離竿子的一側
        const a = lbAlt.position.clone().project(camera), b = V(0, POLE * 0.6, 0).project(camera);
        lbAlt.userData.cx0 = a.x >= b.x ? -0.06 : 1.06;
      }
      layoutLabels(scene);
      renderer.render(scene, camera);
      if (moved) requestRender();
    }
    /** 標示的版面：靠近畫布邊緣的往內移（不被切掉）；互相重疊時，優先保留重要的 */
    function layoutLabels(scene) {
      const P = camera.projectionMatrix.elements, px = P[0], py = P[5];
      const m = 0.015, pad = 0.006;
      // 左上、右下的文字框：標示碰到時往下（或往上）移開
      const cr = canvas.getBoundingClientRect();
      const box = function (el) {
        const r = el.getBoundingClientRect();
        if (!r.width || !cr.width) return null;
        return { x0: (r.left - cr.left) / cr.width * 2 - 1, x1: (r.right - cr.left) / cr.width * 2 - 1, y0: 1 - (r.bottom - cr.top + 4) / cr.height * 2, y1: 1 - (r.top - cr.top - 4) / cr.height * 2 };
      };
      const tl = box(hud.querySelector('.tl')), br = box(hud.querySelector('.br'));
      const list = [];
      labels.forEach(function (sp) {
        const u = sp.userData;
        if (u.hidOverlap) { sp.visible = true; u.hidOverlap = false; }
        if (!sp.visible || sp.parent !== scene || !sp.material.map) return;
        const a = sp.position.clone().project(camera);
        if (a.z > 1 || a.z < -1) return;
        const w = sp.scale.x * px, h = sp.scale.y * py;
        let cx = u.cx0, cy = u.cy0;
        if (a.x - cx * w < -1 + m) cx = (a.x + 1 - m) / w;
        if (a.x + (1 - cx) * w > 1 - m) cx = 1 - (1 - m - a.x) / w;
        if (a.y - cy * h < -1 + m) cy = (a.y + 1 - m) / h;
        if (a.y + (1 - cy) * h > 1 - m) cy = 1 - (1 - m - a.y) / h;
        cx = Math.max(-0.15, Math.min(1.15, cx));
        const lx0 = a.x - cx * w, lx1 = lx0 + w;
        if (tl && lx0 < tl.x1 && lx1 > tl.x0 && a.y + (1 - cy) * h > tl.y0) cy = Math.max(cy, 1 - (tl.y0 - a.y) / h);
        if (br && lx0 < br.x1 && lx1 > br.x0 && a.y - cy * h < br.y1) cy = Math.min(cy, (a.y - br.y1) / h);
        cy = Math.max(-0.4, Math.min(2.4, cy));
        sp.center.set(cx, cy);
        const x0 = lx0, y0 = a.y - cy * h;
        list.push({ sp: sp, pri: u.pri, x0: x0 - pad, x1: x0 + w + pad, y0: y0 - pad, y1: y0 + h + pad });
      });
      list.sort(function (p, q) { return q.pri - p.pri; });
      const kept = [];
      list.forEach(function (r) {
        for (let i = 0; i < kept.length; i++) {
          const k = kept[i];
          if (r.x0 < k.x1 && r.x1 > k.x0 && r.y0 < k.y1 && r.y1 > k.y0) { r.sp.visible = false; r.sp.userData.hidOverlap = true; return; }
        }
        kept.push(r);
      });
    }
    function requestRender() {
      if (raf || !api.active) return;
      raf = requestAnimationFrame(function () { raf = 0; renderNow(); });
    }
    let lastAspect = 0;
    function labelScale() {
      LS = (camera.aspect < 1.1 ? 0.032 : 0.026) * fsScale();
      labels.forEach(function (l) { l.scale.set(LS * l.userData.k, LS, 1); });
    }
    function resize3() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (Math.abs(camera.aspect - lastAspect) > 0.01) {
        const first = !lastAspect;
        lastAspect = camera.aspect;
        if (first || !camEarth) fit();
      }
      labelScale();
      if (cur) update(); else requestRender();
    }
    const ro = window.ResizeObserver ? new ResizeObserver(resize3) : null;
    if (ro) ro.observe(canvas); else window.addEventListener('resize', resize3);
    controls.addEventListener('change', requestRender);
    const onVisible = function () { if (!document.hidden) requestRender(); };
    document.addEventListener('visibilitychange', onVisible);
    canvas.addEventListener('webglcontextlost', function (ev) {
      ev.preventDefault();
      if (!api.active) return;
      if (env.lost) env.lost();
    });

    function setScene(name, quiet) {
      if (name === sceneName) return;
      saveCam();
      sceneName = name;
      if (name !== 'orbit') camEarth = false;
      lastEarth = null;
      const sv = saved[name];
      if (sv) { camera.position.copy(sv.p); controls.target.copy(sv.t); camEarth = name === 'orbit' && sv.earth; controls.update(); }
      else fit();
      controls.minDistance = name === 'orbit' ? 1.2 : 2;
      if (!quiet) update();
    }
    function setCamEarth(on, quiet) {
      camEarth = !!on && sceneName === 'orbit';
      lastEarth = null;
      if (!camEarth) fit();
      if (!quiet) update();
    }

    const api = {
      active: true,
      update: update,
      frame: function () { update(); if (raf) { cancelAnimationFrame(raf); raf = 0; } renderNow(); },
      onTheme: function () { applyColors(); labelScale(); update(); },
      resetCamera: function () { camEarth = false; lastEarth = null; fit(); requestRender(); },
      setScene: function (n) { setScene(n, false); },
      setCamEarth: function (on) { setCamEarth(on, false); },
      dispose: function () {
        api.active = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        document.removeEventListener('visibilitychange', onVisible);
        controls.dispose();
        [so, ss].forEach(function (sc) {
          sc.traverse(function (o) {
            if (o.geometry) o.geometry.dispose();
            if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); });
          });
        });
        labels.forEach(function (l) { if (l.material.map) l.material.map.dispose(); l.material.dispose(); });
        owned.forEach(function (x) { if (x && x.dispose) x.dispose(); });
        renderer.dispose();
        renderer.forceContextLoss();
        canvas.remove();
        hud.remove();
      }
    };

    applyColors();
    const w0 = canvas.clientWidth, h0 = canvas.clientHeight;
    if (w0 && h0) { renderer.setSize(w0, h0, false); camera.aspect = w0 / h0; camera.updateProjectionMatrix(); lastAspect = camera.aspect; }
    labelScale();
    fit();
    return api;
  }

  window.Seasons3D = { create: create };
})();
