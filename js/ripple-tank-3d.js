/*
 * ripple-tank-3d.js — 「水波槽實驗」的 3D 立體檢視
 *
 * 這個檔案本身不依賴 three.js：使用者按「3D 立體」時，ripple-tank.js 才以 import() 載入
 * vendor/three/，再呼叫 RippleTank3D.create(lib, host, bridge) 建立場景；切回 2D 時 dispose() 釋放全部資源。
 *
 * 畫面與 2D 用同一個模擬（ripple-tank-core.js 的格點波動方程式）：
 *   水面：每個格點（太密時每隔幾格取一點）的高度 = 靜水面 + 位移 × EXAG（波高放大，才看得見）；
 *         法向量由相鄰格點的高度差直接算出，光照出波峰、波谷的起伏。
 *   白紙：放在桌面上，貼上與 2D 相同的投影影像（點光源時依放大率 M 放大）。
 *   器材：玻璃底水槽、鋁框與桌腳、四周海綿、直線起波器（或點波源），障礙物、薄壓克力板、燈。
 *
 * 場景座標（cm）：sx = x − W/2、sy = y − H/2；z 朝上，桌面（白紙）z = 0，
 * 水槽玻璃底的上表面 z = 25（水面到紙的距離 d），水面 z = 25 + 水深。
 */
(function () {
  'use strict';
  const RC = window.RippleCore;
  const TANK = RC ? RC.TANK : { W: 0.36, H: 0.27, sponge: 0.03, paper: 0.25, bar: 0.042, dipR: 0.004 };
  const EXAG = 30;                     // 波高放大倍數（3D 才看得到起伏；2D 投影不受影響）
  const W = TANK.W * 100, H = TANK.H * 100;
  const ZB = TANK.paper * 100;         // 玻璃底上表面
  const GLASS = 0.5;                   // 玻璃底厚度
  const WALL_H = 3.6;                  // 槽壁高度（由玻璃底算起）
  const OBST_H = 2.2;                  // 障礙物高度

  function create(lib, host, api) {
    const THREE = lib.THREE;
    const T = api.T;
    const st = api.state;
    const colors = function () { return api.colors(); };
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('水波槽的 3D 立體檢視：水面的波紋、水槽、起波器、障礙物與白紙上的投影（可拖曳旋轉、雙指或滾輪縮放、方向鍵平移）',
      '3D view of the ripple tank: the rippling water, the tank, the generator, barriers and the projection on the paper (drag to rotate, pinch or scroll to zoom, arrow keys to pan)'));
    canvas.tabIndex = 0;
    host.appendChild(canvas);
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    } catch (e) {
      canvas.remove();
      throw e;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.localClippingEnabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 4 / 3, 0.5, 2000);
    camera.up.set(0, 0, 1);
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.minDistance = 12;
    controls.maxDistance = 400;
    controls.maxPolarAngle = Math.PI * 0.62;
    if (controls.listenToKeyEvents) controls.listenToKeyEvents(canvas);

    // ---------- 環境光（反射用）：簡單的房間——上方一片亮的燈箱、四周灰牆 ----------
    let envTex = null;
    function buildEnvironment() {
      if (envTex) { envTex.dispose(); envTex = null; }
      const dk = colors().dark;
      const es = new THREE.Scene();
      const geo = new THREE.SphereGeometry(100, 32, 16);
      const cols = [];
      const pos = geo.attributes.position;
      const top = new THREE.Color(dk ? '#3a4650' : '#e8eef2'), mid = new THREE.Color(dk ? '#1c2328' : '#aab4ba'), bot = new THREE.Color(dk ? '#0b0f12' : '#5d666b');
      const c = new THREE.Color();
      for (let i = 0; i < pos.count; i++) {
        const u = pos.getY(i) / 100; // 這個球的 y 軸 = 世界的 z 軸（下面旋轉）
        if (u > 0) c.copy(mid).lerp(top, u); else c.copy(mid).lerp(bot, -u);
        cols.push(c.r, c.g, c.b);
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      const sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide }));
      sky.rotation.x = Math.PI / 2;
      es.add(sky);
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(dk ? '#d8d2c0' : '#ffffff').multiplyScalar(dk ? 2.2 : 3), side: THREE.DoubleSide }));
      panel.position.set(0, 0, 80);
      es.add(panel);
      const pm = new THREE.PMREMGenerator(renderer);
      envTex = pm.fromScene(es, 0.02).texture;
      pm.dispose();
      geo.dispose(); sky.material.dispose(); panel.geometry.dispose(); panel.material.dispose();
      scene.environment = envTex;
    }

    // ---------- 燈光 ----------
    const hemi = new THREE.HemisphereLight(0xffffff, 0x6b6b6b, 0.9);
    hemi.position.set(0, 0, 1);
    scene.add(hemi);
    // 主光：大致由上方照下（和實驗的燈同方向），水槽框、桌腳的影子落在白紙上
    const sun = new THREE.DirectionalLight(0xffffff, 1.7);
    sun.position.set(14, -22, 120);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.radius = 3;
    sun.shadow.bias = -0.0006;
    const sc = sun.shadow.camera;
    sc.left = -48; sc.right = 48; sc.bottom = -40; sc.top = 40; sc.near = 20; sc.far = 220;
    scene.add(sun); scene.add(sun.target);
    // 斜射的側光：讓水面的波峰、波谷明暗分明
    const rim = new THREE.DirectionalLight(0xfff1dc, 1.1);
    rim.position.set(-70, -40, 45);
    scene.add(rim);

    // ---------- 工具 ----------
    const sx = function (x) { return x * 100 - W / 2; };
    const sy = function (y) { return y * 100 - H / 2; };
    function disposeObject(obj) {
      obj.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m.map && m.map !== projTex) m.map.dispose(); m.dispose(); });
      });
    }
    function col(name, fb) { return new THREE.Color(colors()[name] || fb || '#888888'); }
    // 水槽內的範圍（障礙物、壓克力板、水面都只畫在這裡面）
    const clipTank = [
      new THREE.Plane(new THREE.Vector3(1, 0, 0), W / 2), new THREE.Plane(new THREE.Vector3(-1, 0, 0), W / 2),
      new THREE.Plane(new THREE.Vector3(0, 1, 0), H / 2), new THREE.Plane(new THREE.Vector3(0, -1, 0), H / 2)
    ];
    /** 文字標籤（Sprite；描邊用畫布背景色，永遠畫在最上層） */
    function label(text, color, size) {
      const c = document.createElement('canvas');
      const g = c.getContext('2d');
      const px = 56;
      const font = '600 ' + px + 'px system-ui, -apple-system, "Segoe UI", "Noto Sans TC", sans-serif';
      g.font = font;
      const w = Math.ceil(g.measureText(text).width) + 28;
      c.width = w; c.height = Math.ceil(px * 1.55);
      g.font = font;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 12; g.lineJoin = 'round';
      g.strokeStyle = colors()['canvas-bg'];
      g.strokeText(text, w / 2, c.height / 2);
      g.fillStyle = color;
      g.fillText(text, w / 2, c.height / 2);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
      sp.scale.set(size * w / c.height, size, 1);
      sp.renderOrder = 5;
      return sp;
    }
    function box(w, d, h, mat) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, d, h), mat);
      m.castShadow = true; m.receiveShadow = true;
      return m;
    }

    // ---------- 桌面、白紙與投影 ----------
    const projTex = new THREE.CanvasTexture(api.image());
    projTex.colorSpace = THREE.SRGBColorSpace;
    projTex.minFilter = THREE.LinearFilter;
    projTex.generateMipmaps = false;
    const tableMat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 });
    const table = new THREE.Mesh(new THREE.PlaneGeometry(220, 170), tableMat);
    table.position.z = -0.12;
    table.receiveShadow = true;
    scene.add(table);
    const paperMat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(76, 60), paperMat);
    paper.position.z = -0.05;
    paper.receiveShadow = true;
    scene.add(paper);
    // 投影：燈光本身的亮暗，不再受場景燈光影響
    const projMat = new THREE.MeshBasicMaterial({ map: projTex, toneMapped: false });
    const proj = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), projMat);
    proj.position.z = 0.02;
    scene.add(proj);

    // ---------- 水槽（玻璃底、玻璃壁、鋁框、桌腳） ----------
    const tank = new THREE.Group();
    scene.add(tank);
    const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xdff3f0, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
    const frameMat = new THREE.MeshStandardMaterial({ roughness: 0.38, metalness: 0.75 });
    const legMat = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.7 });
    function buildTank() {
      disposeObject(tank);
      tank.clear();
      frameMat.color.set(colors().dark ? '#8d989e' : '#a9b3b8');
      legMat.color.set(colors().dark ? '#6c767c' : '#8a949a');
      const bottom = new THREE.Mesh(new THREE.BoxGeometry(W + 1.2, H + 1.2, GLASS), glassMat);
      bottom.position.z = ZB - GLASS / 2;
      tank.add(bottom);
      const wt = 0.4, wz = ZB - GLASS + WALL_H / 2;
      [[0, H / 2 + wt / 2, W + 2 * wt, wt], [0, -H / 2 - wt / 2, W + 2 * wt, wt], [W / 2 + wt / 2, 0, wt, H], [-W / 2 - wt / 2, 0, wt, H]].forEach(function (p) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(p[2], p[3], WALL_H), glassMat);
        m.position.set(p[0], p[1], wz);
        tank.add(m);
      });
      // 鋁框：上緣與下緣
      const fw = 1.4, fh = 0.9;
      [ZB - GLASS - fh / 2, ZB - GLASS + WALL_H + fh / 2 - 0.2].forEach(function (z) {
        [[0, H / 2 + fw / 2, W + 2 * fw, fw], [0, -H / 2 - fw / 2, W + 2 * fw, fw], [W / 2 + fw / 2, 0, fw, H], [-W / 2 - fw / 2, 0, fw, H]].forEach(function (p) {
          const m = box(p[2], p[3], fh, frameMat);
          m.position.set(p[0], p[1], z);
          tank.add(m);
        });
      });
      // 桌腳（四根）
      const legH = ZB - GLASS - fh;
      [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (s) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, legH, 14), legMat);
        leg.rotation.x = Math.PI / 2;
        leg.position.set(s[0] * (W / 2 + fw / 2), s[1] * (H / 2 + fw / 2), legH / 2);
        leg.castShadow = true;
        tank.add(leg);
        const foot = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.1, 0.5, 16), legMat);
        foot.rotation.x = Math.PI / 2;
        foot.position.set(leg.position.x, leg.position.y, 0.25);
        foot.castShadow = true;
        tank.add(foot);
      });
    }

    // ---------- 水面 ----------
    const waterMat = new THREE.MeshStandardMaterial({ roughness: 0.04, metalness: 0.0, transparent: true, opacity: 0.86, side: THREE.DoubleSide, clippingPlanes: clipTank, envMapIntensity: 1.6 });
    let water = null, wgeo = null, wmap = null, wa = 0, wb = 0, wStride = 1, wH = [];
    function buildWater() {
      const sim = api.sim();
      if (water) { scene.remove(water); wgeo.dispose(); water = null; }
      if (!sim) return;
      wStride = Math.max(1, Math.ceil(Math.sqrt(sim.nx * sim.ny / 32000)));
      wa = Math.floor((sim.nx - 1) / wStride) + 1;
      wb = Math.floor((sim.ny - 1) / wStride) + 1;
      const n = wa * wb;
      const pos = new Float32Array(3 * n), nor = new Float32Array(3 * n);
      wmap = new Int32Array(n);
      wH = new Float32Array(n);
      for (let b = 0; b < wb; b++) {
        for (let a = 0; a < wa; a++) {
          const v = b * wa + a, i = 1 + a * wStride, j = 1 + b * wStride;
          wmap[v] = j * sim.NX + i;
          pos[3 * v] = sx((i - 0.5) * sim.dx);
          pos[3 * v + 1] = sy((j - 0.5) * sim.dx);
          pos[3 * v + 2] = 0;
          nor[3 * v + 2] = 1;
        }
      }
      const idx = new Uint32Array((wa - 1) * (wb - 1) * 6);
      let q = 0;
      for (let b = 0; b < wb - 1; b++) {
        for (let a = 0; a < wa - 1; a++) {
          const v = b * wa + a;
          idx[q++] = v; idx[q++] = v + 1; idx[q++] = v + wa;
          idx[q++] = v + 1; idx[q++] = v + wa + 1; idx[q++] = v + wa;
        }
      }
      wgeo = new THREE.BufferGeometry();
      wgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      wgeo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      wgeo.setIndex(new THREE.BufferAttribute(idx, 1));
      wgeo.attributes.position.setUsage(THREE.DynamicDrawUsage);
      wgeo.attributes.normal.setUsage(THREE.DynamicDrawUsage);
      wgeo.computeBoundingSphere();
      water = new THREE.Mesh(wgeo, waterMat);
      water.position.z = ZB + st.h * 100;
      water.renderOrder = 2;
      scene.add(water);
      lastN = -1;
    }
    let lastN = -1, lastField = null;
    function updateWater(force) {
      const sim = api.sim();
      if (!sim || !water) return;
      const field = api.field();
      if (!force && sim.n === lastN && field === lastField && !(st.strobe)) return;
      lastN = sim.n; lastField = field;
      water.position.z = ZB + st.h * 100;
      const pos = wgeo.attributes.position.array, nor = wgeo.attributes.normal.array;
      const s = 0.1 * EXAG; // mm → cm，再放大
      const n = wa * wb;
      if (field) for (let v = 0; v < n; v++) wH[v] = field[wmap[v]] * s;
      else wH.fill(0);
      const hx = 2 * wStride * sim.dx * 100;
      for (let b = 0; b < wb; b++) {
        const b0 = b > 0 ? b - 1 : b, b1 = b < wb - 1 ? b + 1 : b;
        for (let a = 0; a < wa; a++) {
          const v = b * wa + a;
          const a0 = a > 0 ? a - 1 : a, a1 = a < wa - 1 ? a + 1 : a;
          const gx = (wH[b * wa + a1] - wH[b * wa + a0]) / (hx * (a1 - a0) / 2 || 1);
          const gy = (wH[b1 * wa + a] - wH[b0 * wa + a]) / (hx * (b1 - b0) / 2 || 1);
          const il = 1 / Math.sqrt(gx * gx + gy * gy + 1);
          pos[3 * v + 2] = wH[v];
          nor[3 * v] = -gx * il; nor[3 * v + 1] = -gy * il; nor[3 * v + 2] = il;
        }
      }
      wgeo.attributes.position.needsUpdate = true;
      wgeo.attributes.normal.needsUpdate = true;
    }

    // ---------- 會隨設定改變的器材：海綿、起波器、障礙物、壓克力板、燈 ----------
    const gear = new THREE.Group();
    scene.add(gear);
    const labels = new THREE.Group();
    scene.add(labels);
    let barGroup = null;       // 起波器（會上下振動）
    let barRest = 0;
    let rays = null;
    function acrylicMat(tint, op) {
      return new THREE.MeshPhysicalMaterial({ color: tint, roughness: 0.12, metalness: 0, transparent: true, opacity: op, clippingPlanes: clipTank, side: THREE.DoubleSide, clearcoat: 0.6, clearcoatRoughness: 0.1 });
    }
    function buildGear() {
      disposeObject(gear); gear.clear();
      disposeObject(labels); labels.clear();
      const C = colors(), dk = C.dark;
      const zw = ZB + st.h * 100;
      const textCol = C.text, mutedCol = C.muted;
      // 海綿（槽壁四周、略高出水面）
      if (st.sponge) {
        const sw = TANK.sponge * 100, sh = st.h * 100 + 0.9;
        const spMat = new THREE.MeshStandardMaterial({ color: dk ? '#8f7634' : '#cdb062', roughness: 1, metalness: 0 });
        [[0, H / 2 - sw / 2, W, sw], [0, -H / 2 + sw / 2, W, sw], [W / 2 - sw / 2, 0, sw, H - 2 * sw], [-W / 2 + sw / 2, 0, sw, H - 2 * sw]].forEach(function (p) {
          const m = box(p[2], p[3], sh, spMat);
          m.position.set(p[0], p[1], ZB + sh / 2);
          gear.add(m);
        });
        const lb = label(T('海綿', 'Sponge'), mutedCol, 2.4);
        lb.position.set(W / 2 - sw / 2, -H / 2 + 3, zw + 2.4);
        labels.add(lb);
      }
      // 起波器：一根橫桿（直線波）或桿上裝小球（點波源），由馬達吊著
      barGroup = new THREE.Group();
      const barMat = new THREE.MeshStandardMaterial({ color: dk ? '#c9ced2' : '#5b6670', roughness: 0.35, metalness: 0.55 });
      const pts = api.sourcePoints();
      const isBar = st.src === 'bar';
      const bx = isBar ? sx(TANK.bar) : sx(pts[0][0]);
      const barLen = H - 1.5;
      const barZ = isBar ? 0.35 : 1.6;       // 橫桿中心相對水面的高度
      const bar = box(0.9, barLen, 0.8, barMat);
      bar.position.set(bx, 0, barZ);
      barGroup.add(bar);
      if (!isBar) {
        const r = Math.max(0.45, TANK.dipR * 100 * 1.15);
        const dipMat = new THREE.MeshStandardMaterial({ color: dk ? '#e2e6ea' : '#3d4750', roughness: 0.25, metalness: 0.6 });
        pts.forEach(function (p) {
          const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), dipMat);
          ball.position.set(sx(p[0]), sy(p[1]), r * 0.55);
          ball.castShadow = true;
          barGroup.add(ball);
          const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, barZ - r * 0.5, 8), dipMat);
          rod.rotation.x = Math.PI / 2;
          rod.position.set(sx(p[0]), sy(p[1]), (barZ + r * 0.5) / 2 + r * 0.3);
          barGroup.add(rod);
          // 小球不在橫桿正下方時，加一段橫的支臂
          if (Math.abs(sx(p[0]) - bx) > 0.3) {
            const arm = box(Math.abs(sx(p[0]) - bx), 0.25, 0.25, dipMat);
            arm.position.set((sx(p[0]) + bx) / 2, sy(p[1]), barZ);
            barGroup.add(arm);
          }
        });
      }
      // 馬達（偏心輪）與吊桿
      const motor = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 2.6, 24), new THREE.MeshStandardMaterial({ color: dk ? '#5c6a74' : '#37424b', roughness: 0.4, metalness: 0.6 }));
      motor.position.set(bx, 0, barZ + 3.4);
      motor.castShadow = true;
      barGroup.add(motor);
      [-barLen / 2 + 2, barLen / 2 - 2].forEach(function (y) {
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 3, 8), barMat);
        rod.rotation.x = Math.PI / 2;
        rod.position.set(bx, y, barZ + 1.9);
        barGroup.add(rod);
      });
      const hanger = box(0.5, barLen - 3, 0.5, barMat);
      hanger.position.set(bx, 0, barZ + 3.4);
      barGroup.add(hanger);
      barRest = zw;
      barGroup.position.z = zw;
      gear.add(barGroup);
      // 支架：從馬達水平伸出水槽外，再立柱到桌面
      const standMat = new THREE.MeshStandardMaterial({ color: dk ? '#7a858c' : '#6c777e', roughness: 0.4, metalness: 0.7 });
      const armZ = zw + barZ + 3.4;
      const armX0 = -W / 2 - 7;
      const arm = box(bx - armX0, 0.7, 0.7, standMat);
      arm.position.set((bx + armX0) / 2, 0, armZ);
      gear.add(arm);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, armZ, 12), standMat);
      pole.rotation.x = Math.PI / 2;
      pole.position.set(armX0, 0, armZ / 2);
      pole.castShadow = true;
      gear.add(pole);
      const base = box(7, 9, 0.8, standMat);
      base.position.set(armX0, 0, 0.4);
      gear.add(base);
      const lg = label(st.src === 'bar' ? T('直線起波器', 'Straight generator') : st.src === 'pair' ? T('兩個點波源', 'Two dippers') : T('點波源', 'Dipper'), textCol, 2.8);
      lg.position.set(bx, -H / 2 + 2.5, zw + barZ + 6.8);
      labels.add(lg);

      // 障礙物、壓克力板
      const obMat = acrylicMat(dk ? '#9fc6d8' : '#7fa9bd', 0.82);
      if (st.part === 2 && st.shape === 'straight') addRect(api.barObj(), obMat, OBST_H);
      if (st.part === 2 && st.shape !== 'straight') addArc(api.arcObj(), obMat);
      if (st.part === 4) api.diffSolids().forEach(function (o) { addRect(o, obMat, OBST_H); });
      if (st.part === 2 || st.part === 4) {
        const o = st.part === 2 ? (st.shape === 'straight' ? api.barObj() : api.arcObj()) : api.diffSolids()[0];
        const lb = label(st.part === 2 ? T('障礙物', 'Barrier') : st.diff === 'slit' ? T('狹縫', 'Slit') : T('障礙物', 'Barrier'), textCol, 2.7);
        const lx = o.vx != null ? o.vx : st.part === 4 ? st.diffX : o.cx;
        lb.position.set(sx(lx), st.part === 4 && st.diff === 'slit' ? sy(st.slitA / 2 + TANK.H / 2) + 4 : sy(o.cy) + 5, ZB + OBST_H + 2.2);
        labels.add(lb);
      }
      if (st.part === 3) {
        const p = api.plateObj();
        const t = Math.max(0.1, (st.h - p.h2) * 100);
        const pm = acrylicMat(dk ? '#c8e8ff' : '#bfe2f5', 0.5);
        const m = new THREE.Mesh(new THREE.BoxGeometry(p.w * 100, p.len * 100, t), pm);
        m.position.set(sx(p.cx), sy(p.cy), ZB + t / 2);
        m.rotation.z = p.ang;
        m.receiveShadow = true;
        gear.add(m);
        const lb = label(T('淺水區（薄壓克力板）', 'Shallow water (thin plate)'), C.accent, 2.7);
        lb.position.set(sx(p.cx), sy(p.cy) - 4, zw + 3.2);
        labels.add(lb);
      }
      buildLamp();
      const lp = label(T('白紙上的投影', 'Projection on the paper'), textCol, 3.3);
      lp.position.set(0, -H / 2 * api.magnif() - 6, 1.5);
      labels.add(lp);
      const lt = label(T('水槽（玻璃底）', 'Tank (glass bottom)'), mutedCol, 2.5);
      lt.position.set(W / 2 + 2, H / 2 + 2, ZB - 3);
      labels.add(lt);
      layoutProjection();
    }
    function addRect(o, mat, h) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(o.len * 100, o.thick * 100, h), mat);
      m.position.set(sx(o.cx), sy(o.cy), ZB + h / 2);
      m.rotation.z = o.ang;
      m.castShadow = true; m.receiveShadow = true;
      gear.add(m);
    }
    function addArc(o, mat) {
      const Ro = (o.R + o.thick / 2) * 100, Ri = (o.R - o.thick / 2) * 100;
      const a0 = o.ang - o.half, a1 = o.ang + o.half;
      const sh = new THREE.Shape();
      sh.moveTo(Ro * Math.cos(a0), Ro * Math.sin(a0));
      sh.absarc(0, 0, Ro, a0, a1, false);
      sh.lineTo(Ri * Math.cos(a1), Ri * Math.sin(a1));
      sh.absarc(0, 0, Ri, a1, a0, true);
      sh.closePath();
      const g = new THREE.ExtrudeGeometry(sh, { depth: OBST_H, bevelEnabled: false, curveSegments: 48 });
      const m = new THREE.Mesh(g, mat);
      m.position.set(sx(o.cx), sy(o.cy), ZB);
      m.castShadow = true; m.receiveShadow = true;
      gear.add(m);
    }
    /** 燈：點光源（小燈泡＋燈罩，高度 L）或平行光（大燈箱）；淡淡的光線畫到白紙上 */
    function buildLamp() {
      const zw = ZB + st.h * 100;
      const M = api.magnif();
      const warm = colors().dark ? '#ffe6a8' : '#e0a92a';
      const lampG = new THREE.Group();
      const shadeMat = new THREE.MeshStandardMaterial({ color: colors().dark ? '#4f5a61' : '#39444c', roughness: 0.5, metalness: 0.5, side: THREE.DoubleSide });
      const bulbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff6dc').multiplyScalar(1.6), toneMapped: false });
      const rayPts = [];
      const corners = [[-W / 2, -H / 2], [W / 2, -H / 2], [W / 2, H / 2], [-W / 2, H / 2]];
      let lampZ;
      if (st.light === 'point') {
        lampZ = zw + st.lampH * 100;
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(1.1, 20, 14), bulbMat);
        bulb.position.set(0, 0, lampZ);
        lampG.add(bulb);
        const cone = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 5, 4, 28, 1, true), shadeMat);
        cone.rotation.x = Math.PI / 2;
        cone.position.set(0, 0, lampZ + 1.2);
        lampG.add(cone);
        const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 30, 6), shadeMat);
        cord.rotation.x = Math.PI / 2;
        cord.position.set(0, 0, lampZ + 18);
        lampG.add(cord);
        corners.forEach(function (c) { rayPts.push(0, 0, lampZ, c[0] * M, c[1] * M, 0.05); });
      } else {
        lampZ = zw + 55;
        const boxM = new THREE.Mesh(new THREE.BoxGeometry(W + 10, H + 10, 2.4), shadeMat);
        boxM.position.set(0, 0, lampZ + 1.2);
        lampG.add(boxM);
        const glow = new THREE.Mesh(new THREE.PlaneGeometry(W + 8, H + 8), bulbMat);
        glow.position.set(0, 0, lampZ - 0.05);
        glow.rotation.x = Math.PI;
        lampG.add(glow);
        corners.forEach(function (c) { rayPts.push(c[0], c[1], lampZ, c[0], c[1], 0.05); });
      }
      gear.add(lampG);
      const rg = new THREE.BufferGeometry();
      rg.setAttribute('position', new THREE.Float32BufferAttribute(rayPts, 3));
      rays = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: warm, transparent: true, opacity: colors().dark ? 0.35 : 0.5, depthWrite: false }));
      gear.add(rays);
      const ll = label(st.light === 'point' ? T('點光源（燈泡）', 'Point lamp') : T('平行光源', 'Parallel light'), warm, 3);
      ll.position.set(0, -6, lampZ + 3.5);
      labels.add(ll);
    }
    function layoutProjection() {
      const sim = api.sim();
      if (!sim) return;
      const M = api.magnif();
      proj.scale.set(sim.nx * sim.dx * 100 * M, sim.ny * sim.dx * 100 * M, 1);
      proj.position.x = (sim.nx * sim.dx * 100 - W) / 2 * M;
      proj.position.y = (sim.ny * sim.dx * 100 - H) / 2 * M;
      paper.scale.set(Math.max(1, M * 0.95), Math.max(1, M * 0.95), 1);
    }

    // ---------- 顏色（深淺色主題） ----------
    function applyTheme() {
      const C = colors(), dk = C.dark;
      tableMat.color.set(dk ? '#2a2420' : '#c9b49a');
      paperMat.color.set(dk ? '#9a9d9e' : '#f6f4ee');
      const wv = new THREE.Color(C['b-wave'] || '#0e7490');
      waterMat.color.copy(wv).lerp(new THREE.Color(dk ? '#06222b' : '#4fa3b8'), dk ? 0.4 : 0.35);
      waterMat.opacity = dk ? 0.86 : 0.84;
      hemi.intensity = dk ? 0.75 : 0.95;
      hemi.groundColor.set(dk ? '#20272b' : '#6b6b6b');
      buildEnvironment();
    }

    // ---------- 相機 ----------
    function fit(animate) {
      void animate;
      const dir = new THREE.Vector3(0.3, -1.0, 0.95).normalize();
      const target = new THREE.Vector3(0, -1, ZB * 0.62);
      const w = canvas.clientWidth || 640, h = canvas.clientHeight || 480;
      const aspect = w / h;
      // 讓水槽與底下的白紙都進入畫面
      const R = 35;
      const vf = camera.fov * Math.PI / 180;
      const hf = 2 * Math.atan(Math.tan(vf / 2) * aspect);
      const dist = R / Math.sin(Math.min(vf, hf) / 2) * 0.86;
      controls.target.copy(target);
      camera.position.copy(target).addScaledVector(dir, dist);
      camera.near = Math.max(0.5, dist / 300);
      camera.far = dist * 12;
      camera.updateProjectionMatrix();
      controls.update();
    }

    // ---------- 繪製 ----------
    let raf = 0;
    function renderNow() {
      if (!view.active || document.hidden) return;
      const want = Math.min(window.devicePixelRatio || 1, 2);
      if (renderer.getPixelRatio() !== want) { renderer.setPixelRatio(want); resize3(); return; }
      const moved = controls.update();
      renderer.render(scene, camera);
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
      if (!fitted) { fit(false); fitted = true; }
      requestRender();
    }
    const ro = window.ResizeObserver ? new ResizeObserver(resize3) : null;
    if (ro) ro.observe(canvas); else window.addEventListener('resize', resize3);
    controls.addEventListener('change', requestRender);
    const onVisible = function () { if (!document.hidden) requestRender(); };
    document.addEventListener('visibilitychange', onVisible);
    canvas.addEventListener('webglcontextlost', function (ev) {
      ev.preventDefault();
      // dispose() 會呼叫 forceContextLoss()，Chrome 之後才非同步送出這個事件：那時已經切回 2D，不算中斷
      if (!view.active) return;
      api.lost();
    });

    let imgTick = 0;
    function update() {
      updateWater(false);
      if (barGroup) {
        const d = api.drive();
        barGroup.position.z = barRest + d * 0.1 * EXAG;
      }
      // 投影影像：每兩幀更新一次（省下計算光強度的時間）
      if ((imgTick++ & 1) === 0) { api.image(); projTex.needsUpdate = true; }
    }

    const view = {
      active: true,
      frame: function () { update(); renderNow(); },
      onRebuild: function () {
        buildWater();
        projTex.image = api.image();
        projTex.dispose();
        projTex.needsUpdate = true;
        buildGear();
        updateWater(true);
        requestRender();
      },
      onGeometry: function () { buildGear(); updateWater(true); requestRender(); },
      onImage: function () { projTex.needsUpdate = true; },
      onTheme: function () { applyTheme(); buildTank(); buildGear(); projTex.needsUpdate = true; requestRender(); },
      resetCamera: function () { fit(true); requestRender(); },
      dispose: function () {
        view.active = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        document.removeEventListener('visibilitychange', onVisible);
        controls.dispose();
        disposeObject(scene);
        projTex.dispose();
        if (envTex) envTex.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        canvas.remove();
      }
    };

    applyTheme();
    buildTank();
    buildWater();
    buildGear();
    updateWater(true);
    resize3();
    requestRender();
    return view;
  }

  window.RippleTank3D = { create: create, EXAG: EXAG };
})();
