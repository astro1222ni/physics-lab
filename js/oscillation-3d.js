/* oscillation-3d.js — 彈簧振子與單擺的 3D 檢視（three.js 由頁面在第一次切換到 3D 時才載入）
 *
 * 場景（y 朝上）：
 *   彈簧振子：氣墊軌道（前面貼尺）、左邊固定牆、螺旋彈簧（圈數固定、線徑不變，長度隨 x 伸縮）、木塊、
 *             平衡位置與 ±A 的淡色標記、速度與加速度箭頭。
 *   單擺：    底座、立柱與水平軸、輕桿、擺錘、擺動的圓弧、鉛直參考線、小角度近似的虛影、速度與切向加速度箭頭。
 *   相空間螺旋（可關閉）：橫軸 x（單擺 θ），縱軸 v/ω0（單擺 ω/ω0），兩軸同單位同比例；深度方向是時間，
 *             最前面（z = 0）是「現在」，越往後越早，深度範圍與 2D 圖表的時間窗相同（約最近 3 個週期）。
 *             底面是曲線的 x–t 投影，左牆是 v–t 投影；細虛線把實物連到螺旋上的目前點。
 * 物理：所有數值都直接取自頁面的物理狀態（js/oscillation-core.js 的解析解或數值積分，與 2D 同一個時刻、
 *   同一組取樣點），這裡不另外計算運動。彈簧：1 m = 10 個場景單位，相圖的橫軸與軌道對齊、同一個比例尺，
 *   所以木塊永遠在螺旋目前點的正下方。單擺：相圖用自己的刻度（1、2、5 進位的級距，軸上標數值）。
 *   木塊大小（隨 m 微調，與 2D 相同）、擺錘大小、彈簧粗細、箭頭與標籤大小只為了看得清楚，不依比例。
 * 用法：OscillationThree.create({ THREE, OrbitControls }, env) → { active, update, onTheme, resetCamera, viewFrom, dispose }
 *   env：host、T、state()、lost()
 */
(function () {
  'use strict';
  const DEG = Math.PI / 180;
  const SS = 10;            // 彈簧：1 m = 10 個場景單位
  const WALL = -0.5;        // 牆面位置（m，與 2D 相同）
  const TRACK_END = 0.45;   // 軌道右端（m）
  const DEPTH = 7;          // 時間軸（深度方向）的長度
  const VIEW_L = [0.25, 0.5, 1, 1.5, 2, 3];
  const PL = 4.2;           // 單擺：顯示用擺長級距 Lv 換成多少場景單位
  const HB = 2.4;           // 單擺相圖的半邊長
  const PX = -2.9;          // 單擺支點的 x
  const HP = PL + 0.9;      // 單擺支點的高度
  const PCY = HP - PL * 0.5; // 單擺相圖中心的高度（水平位置依擺幅決定，緊貼在擺動範圍右邊）
  const PR = [0.02, 0.05, 0.1, 0.2, 0.3, 0.5, 0.75, 1, 1.5, 2, 2.5, 3.2]; // 單擺相圖半邊長的級距（rad）
  const NH = 280, RAD = 7, COILS = 16, NC = COILS * 24 + 4;

  function niceStep(raw) {
    const e = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / e;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e;
  }
  function fmtNum(v, d) {
    let s = v.toFixed(d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  const clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };

  /**
   * 可每格更新的管子（固定頂點數，用平行移動的座標框架，不會在切線轉向時扭轉）：
   * update(P, m, radius(u), color(u)) — P 是 [x0,y0,z0, x1,y1,z1, …]，m 個點；u 從 0（第一點）到 1（最後一點）。
   */
  function TubeBuf(THREE, n, radial) {
    const nv = n * radial;
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3);
    const idx = new Uint16Array((n - 1) * radial * 6);
    let k = 0;
    for (let i = 0; i < n - 1; i++) {
      for (let j = 0; j < radial; j++) {
        const a = i * radial + j, b = i * radial + (j + 1) % radial, c = a + radial, d = b + radial;
        idx[k++] = a; idx[k++] = c; idx[k++] = b;
        idx[k++] = b; idx[k++] = c; idx[k++] = d;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.setDrawRange(0, 0);
    const cosj = [], sinj = [];
    for (let j = 0; j < radial; j++) { cosj.push(Math.cos(j / radial * Math.PI * 2)); sinj.push(Math.sin(j / radial * Math.PI * 2)); }
    function update(P, m, radius, color) {
      m = Math.min(m, n);
      if (m < 2) { geo.setDrawRange(0, 0); return; }
      let nx = 0, ny = 0, nz = 0;
      for (let i = 0; i < m; i++) {
        const i0 = Math.max(0, i - 1) * 3, i1 = Math.min(m - 1, i + 1) * 3;
        let tx = P[i1] - P[i0], ty = P[i1 + 1] - P[i0 + 1], tz = P[i1 + 2] - P[i0 + 2];
        let tl = Math.hypot(tx, ty, tz);
        if (tl < 1e-9) { tx = 0; ty = 0; tz = 1; tl = 1; }
        tx /= tl; ty /= tl; tz /= tl;
        if (i === 0) {
          // 第一個法向量：與切線最不平行的座標軸做外積
          const ax = Math.abs(tx), ay = Math.abs(ty), az = Math.abs(tz);
          let rx = 0, ry = 0, rz = 0;
          if (ax <= ay && ax <= az) rx = 1; else if (ay <= az) ry = 1; else rz = 1;
          nx = ty * rz - tz * ry; ny = tz * rx - tx * rz; nz = tx * ry - ty * rx;
        } else {
          // 平行移動：去掉沿新切線的分量
          const d = nx * tx + ny * ty + nz * tz;
          nx -= d * tx; ny -= d * ty; nz -= d * tz;
        }
        let nl = Math.hypot(nx, ny, nz);
        if (nl < 1e-9) { nx = ty; ny = -tx; nz = 0; nl = Math.hypot(nx, ny) || 1; }
        nx /= nl; ny /= nl; nz /= nl;
        const bx = ty * nz - tz * ny, by = tz * nx - tx * nz, bz = tx * ny - ty * nx;
        const u = m > 1 ? i / (m - 1) : 1, r = radius(u), c = color(u);
        const px = P[i * 3], py = P[i * 3 + 1], pz = P[i * 3 + 2];
        for (let j = 0; j < radial; j++) {
          const ox = cosj[j] * nx + sinj[j] * bx, oy = cosj[j] * ny + sinj[j] * by, oz = cosj[j] * nz + sinj[j] * bz;
          const v = (i * radial + j) * 3;
          pos[v] = px + r * ox; pos[v + 1] = py + r * oy; pos[v + 2] = pz + r * oz;
          nor[v] = ox; nor[v + 1] = oy; nor[v + 2] = oz;
          col[v] = c[0]; col[v + 1] = c[1]; col[v + 2] = c[2];
        }
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.normal.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      geo.setDrawRange(0, (m - 1) * radial * 6);
    }
    return { geo: geo, update: update };
  }

  function create(lib, env) {
    const THREE = lib.THREE;
    const LD = window.LabDraw;
    const T = env.T;
    const host = env.host;
    const canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    host.appendChild(canvas);
    // 右上角的時間資訊（與 2D 畫布的角落資訊相同）
    const clock = document.createElement('div');
    clock.className = 'clock3';
    clock.setAttribute('aria-hidden', 'true');
    host.appendChild(clock);

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    } catch (e) {
      canvas.remove(); clock.remove();
      throw e;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    const FOV = 34, FOV_FLAT = 5;    // 看投影（正前方、正上方）時用很窄的視角，近似正投影
    const camera = new THREE.PerspectiveCamera(FOV, 1.6, 0.3, 4000);
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.minDistance = 4;
    controls.maxDistance = 400;
    controls.maxPolarAngle = Math.PI / 2 - 0.004;   // 不鑽到地面底下
    const DEFAULT_DIR = new THREE.Vector3(0.62, 0.4, 1).normalize();   // 右前方略高：螺旋的深度看得出來
    const NARROW_DIR = new THREE.Vector3(0.5, 0.36, 1).normalize();

    const hemi = new THREE.HemisphereLight(0xffffff, 0x8a8f86, 1.2);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 3;
    sun.position.set(-6, 22, 12);
    sun.target.position.set(0, 0, -2);
    const sc = sun.shadow.camera;
    sc.left = -16; sc.right = 16; sc.top = 16; sc.bottom = -16; sc.near = 1; sc.far = 60;
    sc.updateProjectionMatrix();
    scene.add(sun, sun.target);
    const fill = new THREE.DirectionalLight(0xffffff, 0.75);
    fill.position.set(14, 10, 20);
    scene.add(fill);

    const css = function (c) { const col = new THREE.Color(); col.setStyle(c); return col; };
    const rgbArr = function (c) { const k = css(c); return [k.r, k.g, k.b]; };
    function disposeObject(obj) {
      obj.traverse(function (o) {
        if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
        if (o.material) {
          (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
            if (m.userData.shared) return;
            ['map', 'alphaMap'].forEach(function (k) { if (m[k] && !m[k].userData.shared) m[k].dispose(); });
            m.dispose();
          });
        }
      });
    }
    function clearGroup(g) { while (g.children.length) { const c = g.children.pop(); disposeObject(c); } }

    // ---------- 文字標籤（2D 畫布畫好再貼成 Sprite：settings.js 會自動轉簡體、依字體設定放大） ----------
    function p11() { return 1 / Math.tan(camera.fov * Math.PI / 360); }
    function applyScale(sp) {
      const H = canvas.clientHeight || 300;
      const sy = 2 * sp.userData.hpx / (H * p11());
      sp.scale.set(sy * sp.userData.aspect, sy, 1);
    }
    function spriteOf(c, hpx) {
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false }));
      s.userData.hpx = hpx;
      s.userData.aspect = c.width / c.height;
      applyScale(s);
      return s;
    }
    /** parts：字串或陣列，陣列裡的 [字] 是下標。size：螢幕上的字高（CSS px）。opt.pill：圓角底框；opt.cx／cy：錨點 */
    function label(parts, color, size, opt) {
      opt = opt || {};
      if (typeof parts === 'string') parts = [parts];
      const c = document.createElement('canvas');
      const g = c.getContext('2d');
      const px = 56, sp = Math.round(px * 0.68);
      const fm = (opt.weight || 600) + ' ' + px + 'px ' + LD.FONT, fs = (opt.weight || 600) + ' ' + sp + 'px ' + LD.FONT;
      let w = 0;
      parts.forEach(function (p) { g.font = Array.isArray(p) ? fs : fm; w += g.measureText(Array.isArray(p) ? p[0] : p).width; });
      const padX = opt.pill ? 30 : 14;
      const k = window.LabSettings ? 1 + ((+window.LabSettings.get('fs') || 1) - 1) * 0.7 : 1;
      c.width = Math.ceil(w) + padX * 2; c.height = Math.ceil(px * k * (opt.pill ? 1.75 : 1.55));
      if (opt.pill) {
        const r = c.height / 2 - 4;
        g.beginPath();
        g.moveTo(4 + r, 4); g.arcTo(c.width - 4, 4, c.width - 4, c.height - 4, r); g.arcTo(c.width - 4, c.height - 4, 4, c.height - 4, r);
        g.arcTo(4, c.height - 4, 4, 4, r); g.arcTo(4, 4, c.width - 4, 4, r); g.closePath();
        g.fillStyle = LD.alpha(LD.c.surface, LD.dark ? 0.9 : 0.94); g.fill();
        g.lineWidth = 4; g.strokeStyle = LD.alpha(color, 0.55); g.stroke();
      }
      let x = padX;
      g.textBaseline = 'middle'; g.lineJoin = 'round';
      parts.forEach(function (p) {
        const sub = Array.isArray(p), t = sub ? p[0] : p, y = c.height / 2 + (sub ? px * 0.26 : 0);
        g.font = sub ? fs : fm;
        if (!opt.pill) { g.lineWidth = 12; g.strokeStyle = LD.c['canvas-bg']; g.strokeText(t, x, y); }
        g.fillStyle = color; g.fillText(t, x, y);
        x += g.measureText(t).width;
      });
      const s = spriteOf(c, size * c.height / px);
      s.center.set(opt.cx == null ? 0.5 : opt.cx, opt.cy == null ? 0.5 : opt.cy);
      s.renderOrder = 10;
      return s;
    }

    // 地面四周漸淡的透明度貼圖
    const fadeTex = (function () {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const g = c.getContext('2d');
      const gr = g.createRadialGradient(128, 128, 30, 128, 128, 128);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.55, '#ffffff'); gr.addColorStop(1, '#000000');
      g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
      const t = new THREE.CanvasTexture(c);
      t.userData.shared = true;
      return t;
    })();

    // ---- 群組 ----
    const appGroup = new THREE.Group();     // 實物的靜態部分（地面、軌道、牆、支架…）
    const boxGroup = new THREE.Group();     // 相空間的框、軸、標籤、閉合曲線
    const dynGroup = new THREE.Group();     // 每格移動的東西
    const phaseDyn = new THREE.Group();     // 每格更新的螺旋、投影、目前點、連線
    scene.add(appGroup, boxGroup, dynGroup, phaseDyn);

    // ---------- 每格更新的物件（建一次、重複使用） ----------
    const helix = TubeBuf(THREE, NH, RAD);
    const helixMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.08, side: THREE.DoubleSide });
    const helixMesh = new THREE.Mesh(helix.geo, helixMat);
    helixMesh.frustumCulled = false;
    helixMesh.castShadow = false;
    phaseDyn.add(helixMesh);
    const P = new Float64Array(NH * 3);
    function lineBuf(n, dashed) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      geo.setDrawRange(0, 0);
      const mat = dashed ? new THREE.LineDashedMaterial({ dashSize: 0.16, gapSize: 0.12, transparent: true, depthWrite: false })
        : new THREE.LineBasicMaterial({ transparent: true, depthWrite: false });
      const l = new THREE.Line(geo, mat);
      l.frustumCulled = false;
      return l;
    }
    const projX = lineBuf(NH), projV = lineBuf(NH);    // x–t（底面）、v–t（左牆）投影
    phaseDyn.add(projX, projV);
    const tickSeg = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ transparent: true, depthWrite: false }));
    tickSeg.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(40 * 2 * 3), 3));
    tickSeg.frustumCulled = false;
    phaseDyn.add(tickSeg);
    const link = lineBuf(2, true);                       // 實物 ↔ 螺旋目前點
    phaseDyn.add(link);
    const dropLines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ dashSize: 0.08, gapSize: 0.08, transparent: true, depthWrite: false }));
    dropLines.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(4 * 3), 3));
    dropLines.frustumCulled = false;
    phaseDyn.add(dropLines);                             // 目前點到底面、左牆的投影細線
    const dotGeo = new THREE.SphereGeometry(1, 24, 16);
    dotGeo.userData.shared = true;
    const dotMat = new THREE.MeshStandardMaterial({ roughness: 0.25, metalness: 0.05 });
    const dot = new THREE.Mesh(dotGeo, dotMat);
    const dotX = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ transparent: true }));
    const dotV = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ transparent: true }));
    const gdot = new THREE.Mesh(dotGeo, new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.55, roughness: 0.6 }));
    phaseDyn.add(dot, dotX, dotV, gdot);

    // 彈簧（每格重建頂點）、木塊、擺桿、擺錘、虛影
    const coil = TubeBuf(THREE, NC, 8);
    const coilMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.55, side: THREE.DoubleSide });
    const coilMesh = new THREE.Mesh(coil.geo, coilMat);
    coilMesh.frustumCulled = false;
    coilMesh.castShadow = true;
    dynGroup.add(coilMesh);
    const CP = new Float64Array(NC * 3);
    const block = new THREE.Group();
    dynGroup.add(block);
    const rodMat = new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.6 });
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1, 14), rodMat);
    rod.castShadow = true;
    const bobMat = new THREE.MeshPhysicalMaterial({ roughness: 0.22, metalness: 0.1, clearcoat: 0.6, clearcoatRoughness: 0.25 });
    const bob = new THREE.Mesh(dotGeo, bobMat);
    bob.castShadow = true;
    const ghostBob = new THREE.Mesh(dotGeo, new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.28, roughness: 0.7, depthWrite: false }));
    const ghostRod = lineBuf(2, true);
    dynGroup.add(rod, bob, ghostBob, ghostRod);

    function makeArrow(radius) {
      const mat = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.05 });
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 1, 12), mat);
      const head = new THREE.Mesh(new THREE.ConeGeometry(radius * 2.7, radius * 7.5, 18), mat);
      const g = new THREE.Group();
      g.add(shaft, head);
      const up = new THREE.Vector3(0, 1, 0);
      return {
        group: g, mat: mat,
        set: function (from, vec) {
          const len = vec.length();
          if (len < 0.03) { g.visible = false; return; }
          g.visible = true;
          const hl = Math.min(radius * 7.5, len * 0.45), sl = len - hl;
          head.scale.setScalar(hl / (radius * 7.5));
          shaft.scale.set(1, Math.max(1e-3, sl), 1);
          shaft.position.set(0, sl / 2, 0);
          head.position.set(0, sl + hl / 2, 0);
          g.position.copy(from);
          g.quaternion.setFromUnitVectors(up, vec.clone().normalize());
        }
      };
    }
    const aV = makeArrow(0.05), aA = makeArrow(0.05);
    dynGroup.add(aV.group, aA.group);
    let lbV = null, lbA = null, lbKey = '';

    // ---------- 狀態與換算 ----------
    let st = null;
    const keys = {};
    let geo = null;  // 目前的幾何設定（依模式）

    /** 依目前模式與參數算出相圖、實物的位置與大小 */
    function computeGeo() {
      if (st.mode === 'spring') {
        const sp = st.sp;
        // 相圖的框：半邊長 1.2A（A 很小時至少 0.08 m，框比參考圓大，看得出振幅小）
        const Rb = Math.max(sp.A * 1.2, 0.08) * SS;
        const bw = sp.bw * SS, bh = sp.bw * 0.86 * SS;
        const oy = bh + 1.25 + Rb;  // 相圖原點在軌道正上方，框底留空間給速度、加速度箭頭
        return {
          mode: 'spring', Rb: Rb, ox: 0, oy: oy, k: SS, bw: bw, bh: bh,
          // 取景用：實物、相圖
          appBox: [WALL * SS - 0.9, -0.6, -1.3, TRACK_END * SS + 0.3, 3.5, 1.4],
          phaseBox: [-Rb - 0.5, oy - Rb - 0.2, -DEPTH - 0.3, Rb + 1.6, oy + Rb + 0.8, 0.3]
        };
      }
      const pe = st.pe;
      const th0 = Math.abs(pe.th0) * DEG;
      const need = Math.max(th0, pe.wmax / pe.w0) * 1.06;
      const R = PR.find(function (v) { return v >= need - 1e-12; }) || PR[PR.length - 1];
      const ks = HB / R;
      const Ls = PL / pe.Lv;  // 1 m = Ls 場景單位
      const up = Math.max(0, -Math.cos(th0));
      const L = pe.L * Ls, side = Math.max(0.45, Math.sin(Math.min(th0, Math.PI / 2))) * L;  // 擺錘左右最遠到哪裡
      const pcx = PX + side + 1.0 + HB;
      return {
        mode: 'pendulum', Rb: HB, R: R, ox: pcx, oy: PCY, k: ks, Ls: Ls, L: L,
        bobR: clamp(0.3 * Math.cbrt(pe.m / 0.5), 0.2, 0.42),
        appBox: [PX - side - 0.7, -0.1, -1.6, PX + side + 0.5, HP + Math.max(0.7, L * up + 0.6), 0.9],
        phaseBox: [pcx - HB - 0.6, PCY - HB - 0.3, -DEPTH - 0.4, pcx + HB + 1.8, PCY + HB + 0.9, 0.4]
      };
    }

    // ---------- 靜態：彈簧的軌道、牆、尺 ----------
    function rulerTexture() {
      const c = document.createElement('canvas');
      const span = TRACK_END - WALL;  // m
      c.width = 2048; c.height = 128;
      const g = c.getContext('2d');
      const X = function (x) { return (x - WALL) / span * c.width; };
      g.fillStyle = LD.alpha(LD.c.surface, LD.dark ? 0.82 : 0.95);
      g.fillRect(0, 0, c.width, c.height);
      g.strokeStyle = LD.c.text;
      g.lineCap = 'butt';
      for (let i = Math.ceil(WALL * 100); i <= Math.floor(TRACK_END * 100); i++) {
        const x = Math.round(X(i / 100)) + 0.5, major = i % 10 === 0, mid = i % 5 === 0;
        g.globalAlpha = major ? 0.8 : mid ? 0.55 : 0.35;
        g.lineWidth = major ? 3 : 2;
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x, major ? 46 : mid ? 32 : 20); g.stroke();
      }
      g.globalAlpha = 1;
      g.fillStyle = LD.c.text;
      g.font = '600 46px ' + LD.FONT;
      g.textAlign = 'center'; g.textBaseline = 'top';
      for (let i = -4; i <= 4; i++) {
        const x = i / 10;
        if (x < WALL + 0.03 || x > TRACK_END - 0.09) continue; // 右端留給「x (m)」
        g.fillStyle = i === 0 ? LD.c.text : LD.c.muted;
        g.fillText(fmtNum(x, 1), X(x), 56);
      }
      g.textAlign = 'right';
      g.fillStyle = LD.c.muted;
      g.fillText('x (m)', c.width - 10, 56);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      return t;
    }
    function buildGround(cx, cz, y, size) {
      const field = LD.mix(LD.c.surface, LD.c.accent, LD.dark ? 0.18 : 0.12);
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({
        color: css(field), roughness: 0.96, metalness: 0, transparent: true, alphaMap: fadeTex, depthWrite: false }));
      ground.rotation.x = -Math.PI / 2;
      ground.position.set(cx, y, cz);
      ground.receiveShadow = true;
      ground.renderOrder = -2;
      appGroup.add(ground);
    }
    function buildSpringApp() {
      const metal = LD.mix(LD.c.field, LD.c.surface, LD.dark ? 0.25 : 0.55);
      buildGround(0, -2.5, -0.5, 34);
      // 氣墊軌道（上面光滑）：本體＋頂面亮色條
      const tl = (TRACK_END - WALL) * SS;
      const track = new THREE.Mesh(new THREE.BoxGeometry(tl, 0.5, 1.5), new THREE.MeshStandardMaterial({ color: css(metal), roughness: 0.32, metalness: 0.55 }));
      track.position.set(WALL * SS + tl / 2, -0.25, 0);
      track.castShadow = true; track.receiveShadow = true;
      appGroup.add(track);
      // 前面的尺（與物理座標同一個比例：1 cm 一格）
      const ruler = new THREE.Mesh(new THREE.PlaneGeometry(tl, 0.42), new THREE.MeshBasicMaterial({ map: rulerTexture(), transparent: true }));
      ruler.position.set(WALL * SS + tl / 2, -0.25, 0.752);
      appGroup.add(ruler);
      // 牆
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.6, 3.9, 2.6), new THREE.MeshStandardMaterial({ color: css(LD.dark ? LD.mix(LD.c.surface, LD.c.field, 0.3) : LD.mix(LD.c.field, LD.c.surface, 0.4)), roughness: 0.85 }));
      wall.position.set(WALL * SS - 0.3, 1.45, 0);
      wall.castShadow = true; wall.receiveShadow = true;
      appGroup.add(wall);
      // 牆上的固定座
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.08, geo.bh * 0.5, geo.bh * 0.5), new THREE.MeshStandardMaterial({ color: css(metal), roughness: 0.3, metalness: 0.6 }));
      plate.position.set(WALL * SS + 0.04, geo.bh / 2, 0);
      appGroup.add(plate);
      // 平衡位置（實線較明顯）與 ±A：檯面上的淡色虛線（橫跨軌道寬度）
      const mk = function (x, op) {
        const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, 0.006, -0.74), new THREE.Vector3(x, 0.006, 0.74)]),
          new THREE.LineDashedMaterial({ color: css(LD.c.text), dashSize: 0.08, gapSize: 0.07, transparent: true, opacity: op, depthWrite: false }));
        l.computeLineDistances();
        appGroup.add(l);
      };
      const A = Math.abs(st.sp.x0) * SS;
      mk(0, LD.dark ? 0.75 : 0.6);
      mk(A, LD.dark ? 0.45 : 0.35);
      mk(-A, LD.dark ? 0.45 : 0.35);
      const l0 = label('x = 0', LD.c.text, 11.5, { pill: true, cy: 1 });
      l0.position.set(0, -0.52, 0.8);   // 軌道前緣下方（不擋住木塊）
      appGroup.add(l0);
      // 木塊（大小隨 m 微調，與 2D 相同；示意）＋前面的質量標籤
      const bw = geo.bw, bh = geo.bh;
      const body = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bw), new THREE.MeshPhysicalMaterial({ color: css(LD.c.neg), roughness: 0.38, metalness: 0.05, clearcoat: 0.5, clearcoatRoughness: 0.3 }));
      body.position.set(0, bh / 2, 0);
      body.castShadow = true; body.receiveShadow = true;
      const hook = new THREE.Mesh(new THREE.BoxGeometry(0.08, bh * 0.36, bh * 0.36), new THREE.MeshStandardMaterial({ color: css(metal), roughness: 0.3, metalness: 0.6 }));
      hook.position.set(-bw / 2 - 0.04, bh / 2, 0);
      clearGroup(block);
      block.add(body, hook);
      // 木塊正面印上質量（貼圖：白字＋淡淡的暗影，和 2D 相同）
      const mc = document.createElement('canvas');
      mc.width = 256; mc.height = 128;
      const mg = mc.getContext('2d');
      const mtxt = fmtNum(st.sp.m, Math.round(st.sp.m * 100) % 10 ? 2 : 1) + ' kg';
      mg.font = '700 64px ' + LD.FONT;
      const tw = mg.measureText(mtxt).width;
      if (tw > 236) mg.font = '700 ' + Math.floor(64 * 236 / tw) + 'px ' + LD.FONT;
      mg.textAlign = 'center'; mg.textBaseline = 'middle';
      mg.fillStyle = 'rgba(0,0,0,0.3)'; mg.fillText(mtxt, 128, 68);
      mg.fillStyle = '#ffffff'; mg.fillText(mtxt, 128, 64);
      const mtex = new THREE.CanvasTexture(mc);
      mtex.colorSpace = THREE.SRGBColorSpace;
      mtex.anisotropy = 4;
      const plateM = new THREE.Mesh(new THREE.PlaneGeometry(bw * 0.92, bw * 0.46), new THREE.MeshBasicMaterial({ map: mtex, transparent: true, depthWrite: false }));
      plateM.position.set(0, bh / 2, bw / 2 + 0.004);
      block.add(plateM);
      dynGroup.visible = true;
    }

    // ---------- 靜態：單擺的支架、圓弧 ----------
    function buildPendApp() {
      const metal = LD.mix(LD.c.field, LD.c.surface, LD.dark ? 0.25 : 0.55);
      const pe = st.pe;
      buildGround(1, -2.5, 0, 34);
      const mStd = new THREE.MeshStandardMaterial({ color: css(metal), roughness: 0.3, metalness: 0.6 });
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.16, 1.4), new THREE.MeshStandardMaterial({ color: css(LD.mix(LD.c.field, LD.c.surface, LD.dark ? 0.1 : 0.35)), roughness: 0.7 }));
      base.position.set(PX, 0.08, -1.05);
      base.castShadow = true; base.receiveShadow = true;
      const postH = HP + 0.25;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, postH, 18), mStd);
      post.position.set(PX, postH / 2, -1.05);
      post.castShadow = true;
      const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.15, 16), mStd);
      axle.rotation.x = Math.PI / 2;
      axle.position.set(PX, HP, -0.5);
      axle.castShadow = true;
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.1, 18, 12), mStd);
      cap.position.set(PX, HP, 0.05);
      appGroup.add(base, post, axle, cap);
      // 鉛直參考線
      const vline = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(PX, HP, 0), new THREE.Vector3(PX, HP - geo.L - geo.bobR - 0.3, 0)]),
        new THREE.LineDashedMaterial({ color: css(LD.c.muted), dashSize: 0.12, gapSize: 0.12, transparent: true, opacity: 0.7, depthWrite: false }));
      vline.computeLineDistances();
      appGroup.add(vline);
      // 擺動的圓弧（−θ0 到 +θ0）：淡色寬帶＋虛線
      const th0 = Math.abs(pe.th0) * DEG;
      const band = new THREE.Mesh(new THREE.TorusGeometry(geo.L, geo.bobR * 0.9, 8, 96, 2 * th0), new THREE.MeshBasicMaterial({ color: css(LD.c.neg), transparent: true, opacity: LD.dark ? 0.07 : 0.06, depthWrite: false }));
      band.position.set(PX, HP, 0);
      band.rotation.z = -Math.PI / 2 - th0;
      band.scale.z = 0.12;
      appGroup.add(band);
      const arc = [];
      for (let i = 0; i <= 120; i++) { const a = -th0 + 2 * th0 * i / 120; arc.push(new THREE.Vector3(PX + geo.L * Math.sin(a), HP - geo.L * Math.cos(a), 0)); }
      const arcLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(arc), new THREE.LineDashedMaterial({ color: css(LD.c.muted), dashSize: 0.1, gapSize: 0.1, transparent: true, opacity: 0.75, depthWrite: false }));
      arcLine.computeLineDistances();
      appGroup.add(arcLine);
      clearGroup(block);
      dynGroup.visible = true;
    }

    // ---------- 相空間的框、軸、標籤、閉合曲線 ----------
    function addLines(group, pts, color, op, dashed, order) {
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      const m = dashed ? new THREE.LineDashedMaterial({ color: css(color), dashSize: dashed[0], gapSize: dashed[1], transparent: true, opacity: op, depthWrite: false })
        : new THREE.LineBasicMaterial({ color: css(color), transparent: true, opacity: op, depthWrite: false });
      const l = new THREE.Line(g, m);
      if (dashed) l.computeLineDistances();
      l.renderOrder = order || 1;
      group.add(l);
      return l;
    }
    function addSegs(group, pts, color, op) {
      const l = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: css(color), transparent: true, opacity: op, depthWrite: false }));
      l.renderOrder = 1;
      group.add(l);
      return l;
    }
    function buildBox() {
      clearGroup(boxGroup);
      if (!st.show3.phase) return;
      const g = geo, ox = g.ox, oy = g.oy, R = g.Rb, D = DEPTH;
      const V = function (x, y, z) { return new THREE.Vector3(x, y, z); };
      const tx = LD.c.text, dk = LD.dark;
      // 底面（x–t 投影）、左牆（v–t 投影）：淡色半透明面
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(2 * R, D), new THREE.MeshBasicMaterial({ color: css(LD.c.neg), transparent: true, opacity: dk ? 0.07 : 0.05, side: THREE.DoubleSide, depthWrite: false }));
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(ox, oy - R, -D / 2);
      const wallP = new THREE.Mesh(new THREE.PlaneGeometry(D, 2 * R), new THREE.MeshBasicMaterial({ color: css(LD.c.pos), transparent: true, opacity: dk ? 0.06 : 0.04, side: THREE.DoubleSide, depthWrite: false }));
      wallP.rotation.y = Math.PI / 2;
      wallP.position.set(ox - R, oy, -D / 2);
      // 正面（現在）也鋪一層極淡的底，相圖看得出邊界
      const front = new THREE.Mesh(new THREE.PlaneGeometry(2 * R, 2 * R), new THREE.MeshBasicMaterial({ color: css(LD.c.accent), transparent: true, opacity: dk ? 0.05 : 0.035, side: THREE.DoubleSide, depthWrite: false }));
      front.position.set(ox, oy, 0);
      [floor, wallP, front].forEach(function (m) { m.renderOrder = 0; boxGroup.add(m); });
      // 框線
      const e = [];
      [[0], [-D]].forEach(function (z) {
        z = z[0];
        e.push(V(ox - R, oy - R, z), V(ox + R, oy - R, z), V(ox + R, oy - R, z), V(ox + R, oy + R, z),
          V(ox + R, oy + R, z), V(ox - R, oy + R, z), V(ox - R, oy + R, z), V(ox - R, oy - R, z));
      });
      [[-R, -R], [R, -R], [-R, R]].forEach(function (c) { e.push(V(ox + c[0], oy + c[1], 0), V(ox + c[0], oy + c[1], -D)); });
      addSegs(boxGroup, e, tx, dk ? 0.3 : 0.22);
      // 底面與左牆中線（x = 0、v = 0 隨時間往後延伸）
      addSegs(boxGroup, [V(ox, oy - R + 0.004, 0), V(ox, oy - R + 0.004, -D), V(ox - R + 0.004, oy, 0), V(ox - R + 0.004, oy, -D)], tx, dk ? 0.22 : 0.16);
      // 正面的兩條座標軸（穿過原點）
      addSegs(boxGroup, [V(ox - R, oy, 0.002), V(ox + R, oy, 0.002), V(ox, oy - R, 0.002), V(ox, oy + R, 0.002)], tx, dk ? 0.62 : 0.5);
      // 軸名與刻度
      const sp = g.mode === 'spring';
      const fs = 12.5;
      const lx = label(sp ? 'x (m)' : 'θ (rad)', LD.c.neg, fs, { weight: 700, cx: 0 });
      lx.position.set(ox + R + 0.12, oy, 0);
      const lv = label(sp ? ['v/ω', ['0'], ' (m)'] : ['ω/ω', ['0'], ' (rad)'], LD.c.pos, fs, { weight: 700, cy: 0 });
      lv.position.set(ox, oy + R + 0.12, 0);
      const lnow = label(T('現在', 'now'), LD.c.text, 11.5, { pill: true, cy: 1 });
      lnow.position.set(ox - R, oy - R - 0.12, 0);
      const lold = label('t − ' + fmtNum(st.Wd, st.Wd < 10 ? 2 : 1) + ' s', LD.c.muted, 11.5, { pill: true, cx: 1 });
      lold.position.set(ox - R - 0.12, oy - R, -D);
      const lt = label(T('時間 t（越往後越早）', 'time t (further back = earlier)'), LD.c.muted, 11.5, { weight: 600, cy: 0 });
      lt.position.set(ox - R, oy + R + 0.08, -D * 0.6);
      // 正前方看（時間軸縮成一點）時藏起時間軸的標籤；正上方看時藏起縱軸名，避免疊在一起
      lnow.userData.hideHead = lold.userData.hideHead = lt.userData.hideHead = true;
      lv.userData.hideTop = true;
      boxGroup.add(lx, lv, lnow, lold, lt);
      // 刻度：彈簧標 ±A，單擺標相圖邊緣的值
      const ticks = [];
      if (sp) {
        const A = Math.abs(st.sp.x0) * SS;
        ticks.push(V(A, oy - 0.1, 0.003), V(A, oy + 0.1, 0.003), V(-A, oy - 0.1, 0.003), V(-A, oy + 0.1, 0.003));
        const la = label('+A', LD.c.muted, 11, { weight: 600, cy: 1 }), lb = label('−A', LD.c.muted, 11, { weight: 600, cy: 1 });
        la.position.set(A, oy - 0.14, 0); lb.position.set(-A, oy - 0.14, 0);
        boxGroup.add(la, lb);
      } else {
        const dec = g.R < 0.1 ? 2 : g.R < 1 ? (g.R * 10 % 1 ? 2 : 1) : 1;
        const t1 = label(fmtNum(g.R, dec), LD.c.muted, 11, { weight: 600, cy: 1 });
        t1.position.set(ox + R, oy - 0.14, 0);
        const t2 = label(fmtNum(g.R, dec), LD.c.muted, 11, { weight: 600, cx: 0 });
        t2.position.set(ox + 0.14, oy + R, 0);
        t2.userData.hideTop = true;
        boxGroup.add(t1, t2);
      }
      if (ticks.length) addSegs(boxGroup, ticks, tx, 0.6);
      // 閉合曲線（只在無阻尼時；正前方看就是它）
      if (sp) {
        if (!(st.sp.b > 0)) {
          const A = Math.abs(st.sp.x0) * SS, c = [];
          for (let i = 0; i <= 128; i++) { const a = i / 128 * Math.PI * 2; c.push(V(A * Math.cos(a), oy + A * Math.sin(a), 0.004)); }
          addLines(boxGroup, c, LD.c.accent, dk ? 0.6 : 0.5, [0.12, 0.1]);
          const lr = label(T('參考圓（半徑 A）', 'reference circle (radius A)'), LD.c.accent, 11.5, { weight: 600, cx: 0, cy: 0 });
          lr.position.set(A * 0.72 + 0.1, oy + A * 0.72 + 0.1, 0);
          lr.userData.hideTop = true;
          boxGroup.add(lr);
        }
      } else {
        const pe = st.pe, th0 = Math.abs(pe.th0) * DEG, k = g.k;
        const inBox = function (x, y) { return Math.abs(x) <= g.R + 1e-9 && Math.abs(y) <= g.R + 1e-9; };
        if (!(pe.b > 0)) {
          // 能量守恆的等能曲線：ω/ω0 = ±√(2(cos θ − cos θ0))
          const c = [];
          for (let i = 0; i <= 200; i++) {
            const ph = i / 200 * Math.PI * 2, th = th0 * Math.sin(ph);
            const w = Math.sqrt(Math.max(0, 2 * (Math.cos(th) - Math.cos(th0)))) * (Math.cos(ph) >= 0 ? -1 : 1);
            c.push(V(ox + th * k, oy + w * k, 0.004));
          }
          addLines(boxGroup, c, LD.c.accent, dk ? 0.6 : 0.5, [0.12, 0.1]);
        }
        if (st.show.ghost) {
          // 小角度近似的相圖：半徑 θ0 的圓
          const c = [];
          for (let i = 0; i <= 128; i++) { const a = i / 128 * Math.PI * 2; c.push(V(ox + th0 * k * Math.cos(a), oy + th0 * k * Math.sin(a), 0.003)); }
          addLines(boxGroup, c, LD.c.muted, 0.75, [0.06, 0.08]);
        }
        if (g.R >= 1.5) {
          // 分界線（separatrix）：ω/ω0 = ±2 cos(θ/2)，剛好能擺到正上方的運動
          [1, -1].forEach(function (sg) {
            let seg = [];
            for (let i = 0; i <= 160; i++) {
              const th = -Math.PI + 2 * Math.PI * i / 160, w = sg * 2 * Math.cos(th / 2);
              if (inBox(th, w)) seg.push(V(ox + th * k, oy + w * k, 0.002));
              else if (seg.length) { if (seg.length > 1) addLines(boxGroup, seg, LD.c.equi, 0.7, [0.05, 0.07]); seg = []; }
            }
            if (seg.length > 1) addLines(boxGroup, seg, LD.c.equi, 0.7, [0.05, 0.07]);
          });
          const ls = label(T('分界線', 'separatrix'), LD.c.equi, 11, { weight: 600, cy: 0 });
          ls.position.set(ox, oy + Math.min(2, g.R) * k + 0.08, 0);
          ls.userData.hideTop = true;
          boxGroup.add(ls);
        }
      }
      // 彈簧：平衡位置的虛線一路延伸到相圖底面（x = 0 就是 v 軸）
      if (sp) addLines(boxGroup, [V(0, 0, 0), V(0, oy - R, 0)], LD.c.muted, 0.45, [0.1, 0.1]);
      boxGroup.traverse(function (o) { if (o.isSprite && o.userData.hpx) applyScale(o); });
    }

    // ---------- 顏色（主題改變時重設） ----------
    let colKey = -1;
    function dynColors() {
      if (colKey === LD.ver) return;
      colKey = LD.ver;
      const acc = css(LD.c.accent);
      dotMat.color.copy(acc);
      dotMat.emissive.copy(acc).multiplyScalar(LD.dark ? 0.35 : 0.12);
      dotX.material.color.copy(css(LD.c.neg));
      dotV.material.color.copy(css(LD.c.pos));
      gdot.material.color.copy(css(LD.c.muted));
      projX.material.color.copy(css(LD.c.neg)); projX.material.opacity = LD.dark ? 0.9 : 0.85;
      projV.material.color.copy(css(LD.c.pos)); projV.material.opacity = LD.dark ? 0.9 : 0.85;
      tickSeg.material.color.copy(css(LD.c.text)); tickSeg.material.opacity = LD.dark ? 0.5 : 0.4;
      link.material.color.copy(css(LD.c.text)); link.material.opacity = LD.dark ? 0.6 : 0.45;
      dropLines.material.color.copy(css(LD.c.muted)); dropLines.material.opacity = 0.55;
      rodMat.color.copy(css(LD.mix(LD.c.field, LD.c.surface, LD.dark ? 0.35 : 0.6)));
      bobMat.color.copy(css(LD.c.neg));
      ghostBob.material.color.copy(css(LD.c.muted));
      ghostRod.material.color.copy(css(LD.c.muted)); ghostRod.material.opacity = 0.7;
      aV.mat.color.copy(css(LD.c.pos));
      aA.mat.color.copy(css(LD.c.equi));
      colHelix = rgbArr(LD.dark ? LD.c.accent : LD.mix(LD.c.accent, '#ffffff', 0.12));
      colBg = rgbArr(LD.c['canvas-bg']);
      colCoil = rgbArr(LD.c.accent);
      lbKey = '';
    }
    let colHelix = [0, 0.5, 0.4], colBg = [1, 1, 1], colCoil = [0, 0.5, 0.4];
    function arrowLabels() {
      const key = LD.ver + '|' + st.mode;
      if (key === lbKey && lbV) return;
      lbKey = key;
      [lbV, lbA].forEach(function (l) { if (l) { dynGroup.remove(l); disposeObject(l); } });
      lbV = label('v', LD.c.pos, 13, { weight: 700 });
      lbA = label(st.mode === 'spring' ? 'a' : ['a', ['t']], LD.c.equi, 13, { weight: 700 });
      dynGroup.add(lbV, lbA);
    }

    // ---------- 每格：實物 ----------
    const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
    function moveSpring() {
      const sp = st.sp, x = sp.x * SS, bw = geo.bw, bh = geo.bh;
      block.position.set(x, 0, 0);
      rod.visible = bob.visible = ghostBob.visible = ghostRod.visible = false;
      coilMesh.visible = true;
      // 螺旋彈簧：牆面到木塊左側，圈數固定、線徑不變，圈距隨長度改變
      const xa = WALL * SS + 0.08, xb = x - bw / 2 - 0.08;
      const lead = Math.min(0.25, (xb - xa) * 0.06);
      const x0 = xa + lead, x1 = xb - lead, yc = bh / 2, rc = bh * 0.3;
      let n = 0;
      const put = function (px, py, pz) { CP[n * 3] = px; CP[n * 3 + 1] = py; CP[n * 3 + 2] = pz; n++; };
      put(xa, yc, 0);
      const steps = NC - 4;
      for (let j = 0; j <= steps; j++) {
        const a = j / steps * COILS * Math.PI * 2;
        put(x0 + (x1 - x0) * j / steps, yc + rc * Math.cos(a), rc * Math.sin(a));
      }
      put(x1 + lead * 0.5, yc, 0);
      put(xb, yc, 0);
      const wire = 0.035 + 0.035 * (sp.k - 2) / 98;  // 越硬的彈簧線越粗（示意，與 2D 相同）
      coil.update(CP, n, function () { return wire; }, function () { return colCoil; });
      // 箭頭（長度 ∝ 量值，以本次最大值為滿格；放在木塊前上方，不擋住連到相圖的虛線）
      arrowLabels();
      const show = st.show.arrows, maxLen = 1.4;
      aV.group.visible = aA.group.visible = lbV.visible = lbA.visible = false;
      if (show) {
        const lv = sp.vmax > 0 ? sp.v / sp.vmax * maxLen : 0;
        const la = sp.amax > 0 ? clamp(sp.a / sp.amax, -1.2, 1.2) * maxLen : 0;
        const z = bw / 2 + 0.25;
        aV.set(tmpA.set(x, bh + 0.28, z), tmpB.set(lv, 0, 0));
        aA.set(tmpA.set(x, bh + 0.7, z), tmpB.set(la, 0, 0));
        lbV.visible = aV.group.visible; lbA.visible = aA.group.visible;
        lbV.position.set(x + lv + Math.sign(lv || 1) * 0.28, bh + 0.28, z);
        lbA.position.set(x + la + Math.sign(la || 1) * 0.28, bh + 0.7, z);
      }
      return [x, bh, 0];
    }
    function movePend() {
      const pe = st.pe, th = pe.th, L = geo.L, r = geo.bobR;
      coilMesh.visible = false;
      const bx = PX + L * Math.sin(th), by = HP - L * Math.cos(th);
      rod.visible = bob.visible = true;
      tmpA.set(PX, HP, 0); tmpB.set(bx, by, 0);
      rod.position.copy(tmpA).add(tmpB).multiplyScalar(0.5);
      rod.scale.set(1, Math.max(1e-3, L - r * 0.6), 1);
      rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tmpB.clone().sub(tmpA).normalize());
      bob.position.set(bx, by, 0);
      bob.scale.setScalar(r);
      // 小角度近似的虛影
      const gs = st.show.ghost;
      ghostBob.visible = ghostRod.visible = gs;
      if (gs) {
        const gx = PX + L * Math.sin(pe.gth), gy = HP - L * Math.cos(pe.gth);
        ghostBob.position.set(gx, gy, -0.02);
        ghostBob.scale.setScalar(r);
        const a = ghostRod.geometry.attributes.position.array;
        a[0] = PX; a[1] = HP; a[2] = -0.02; a[3] = gx; a[4] = gy; a[5] = -0.02;
        ghostRod.geometry.attributes.position.needsUpdate = true;
        ghostRod.geometry.setDrawRange(0, 2);
        ghostRod.computeLineDistances();
      }
      // 速度、切向加速度（沿切線；畫在擺錘內側，與 2D 相同）
      arrowLabels();
      aV.group.visible = aA.group.visible = lbV.visible = lbA.visible = false;
      if (st.show.arrows) {
        const maxLen = 1.3, tx = Math.cos(th), ty = Math.sin(th), rx = Math.sin(th), ry = -Math.cos(th);
        const lv = pe.wmax > 0 ? pe.om / pe.wmax * maxLen : 0;
        const la = pe.amax > 0 ? clamp(pe.al / pe.amax, -1.2, 1.2) * maxLen : 0;
        const ov = -(r + 0.22), oa = -(r + 0.62);
        const v0x = bx + rx * ov, v0y = by + ry * ov, a0x = bx + rx * oa, a0y = by + ry * oa;
        aV.set(tmpA.set(v0x, v0y, 0.06), tmpB.set(tx * lv, ty * lv, 0));
        aA.set(tmpA.set(a0x, a0y, 0.06), tmpB.set(tx * la, ty * la, 0));
        if (Math.abs(lv) > 0.2) { lbV.visible = true; lbV.position.set(v0x + tx * (lv + Math.sign(lv) * 0.28), v0y + ty * (lv + Math.sign(lv) * 0.28), 0.06); }
        if (Math.abs(la) > 0.2) { lbA.visible = true; lbA.position.set(a0x + tx * (la + Math.sign(la) * 0.3), a0y + ty * (la + Math.sign(la) * 0.3), 0.06); }
      }
      return [bx, by, 0];
    }

    // ---------- 每格：相空間螺旋 ----------
    function movePhase(objPt) {
      const on = st.show3.phase;
      phaseDyn.visible = on;
      if (!on) return;
      const g = geo, S = st.S, pts = S.pts, n = pts.length, ox = g.ox, oy = g.oy, k = g.k, R = g.Rb;
      const sp = g.mode === 'spring';
      const w0 = sp ? st.sp.w0 : st.pe.w0;
      const tNow = S.t, Wd = st.Wd;
      const step = Math.max(1, Math.ceil(n / (NH - 1)));
      let m = 0;
      const pxA = projX.geometry.attributes.position.array, pvA = projV.geometry.attributes.position.array;
      const add = function (q) {
        const xv = sp ? q.x : q.x * DEG, vv = q.v / w0;
        const X = ox + xv * k, Y = oy + vv * k, Z = -(tNow - q.t) / Wd * DEPTH;
        P[m * 3] = X; P[m * 3 + 1] = Y; P[m * 3 + 2] = Z;
        pxA[m * 3] = X; pxA[m * 3 + 1] = oy - R + 0.006; pxA[m * 3 + 2] = Z;
        pvA[m * 3] = ox - R + 0.006; pvA[m * 3 + 1] = Y; pvA[m * 3 + 2] = Z;
        m++;
      };
      for (let i = 0; i < n && m < NH - 1; i += step) add(pts[i]);
      if (n && (n - 1) % step !== 0) add(pts[n - 1]);
      // 管子：越舊越細、顏色越淡（往背景色混合）
      const base = Math.max(0.03, Math.min(0.075, R * 0.025));
      const ch = colHelix, cb = colBg, tmpc = [0, 0, 0];
      helix.update(P, m, function (u) { return base * (0.35 + 0.65 * u); }, function (u) {
        const f = 0.15 + 0.85 * Math.pow(u, 1.3);
        tmpc[0] = cb[0] + (ch[0] - cb[0]) * f; tmpc[1] = cb[1] + (ch[1] - cb[1]) * f; tmpc[2] = cb[2] + (ch[2] - cb[2]) * f;
        return tmpc;
      });
      projX.geometry.attributes.position.needsUpdate = true;
      projV.geometry.attributes.position.needsUpdate = true;
      projX.geometry.setDrawRange(0, m);
      projV.geometry.setDrawRange(0, m);
      // 目前點與它在底面、左牆上的投影
      const cx = P[(m - 1) * 3], cy = P[(m - 1) * 3 + 1];
      dot.position.set(cx, cy, 0);
      dot.scale.setScalar(base * 2.6);
      dotX.position.set(cx, oy - R + 0.01, 0); dotX.scale.setScalar(base * 1.5);
      dotV.position.set(ox - R + 0.01, cy, 0); dotV.scale.setScalar(base * 1.5);
      const dl = dropLines.geometry.attributes.position.array;
      dl[0] = cx; dl[1] = cy; dl[2] = 0; dl[3] = cx; dl[4] = oy - R; dl[5] = 0;
      dl[6] = cx; dl[7] = cy; dl[8] = 0; dl[9] = ox - R; dl[10] = cy; dl[11] = 0;
      dropLines.geometry.attributes.position.needsUpdate = true;
      dropLines.computeLineDistances();
      // 小角度近似（單擺虛影）在相圖上的點
      gdot.visible = !sp && st.show.ghost;
      if (gdot.visible) { gdot.position.set(ox + st.pe.gth * k, oy + st.pe.gom / w0 * k, 0); gdot.scale.setScalar(base * 1.9); }
      // 實物 ↔ 目前點
      const la = link.geometry.attributes.position.array;
      la[0] = objPt[0]; la[1] = objPt[1]; la[2] = objPt[2]; la[3] = cx; la[4] = cy; la[5] = 0;
      link.geometry.attributes.position.needsUpdate = true;
      link.geometry.setDrawRange(0, 2);
      link.computeLineDistances();
      // 底面左緣的時間刻度（隨時間往後捲動）
      const ts = niceStep(Wd / 5), ta = tickSeg.geometry.attributes.position.array;
      let q = 0;
      for (let j = Math.ceil((tNow - Wd) / ts - 1e-9); j * ts <= tNow + 1e-9 && q < 40; j++) {
        if (j * ts < 0) continue;
        const z = -(tNow - j * ts) / Wd * DEPTH;
        ta.set([ox - R, oy - R, z, ox - R + 0.22, oy - R, z], q * 6); q++;
      }
      tickSeg.geometry.attributes.position.needsUpdate = true;
      tickSeg.geometry.setDrawRange(0, q * 2);
    }

    // ---------- 取景 ----------
    let fitKey = '', tween = null, viewMode = 'default';
    function boxPts(b) {
      const out = [];
      [b[0], b[3]].forEach(function (x) { [b[1], b[4]].forEach(function (y) { [b[2], b[5]].forEach(function (z) { out.push(new THREE.Vector3(x, y, z)); }); }); });
      return out;
    }
    function contentPts(which) {
      const ph = st.show3.phase;
      if (which === 'real' || !ph) return boxPts(geo.appBox);
      if (which === 'top') return boxPts(geo.phaseBox);
      if (which === 'front' && geo.mode === 'pendulum') return boxPts(geo.appBox).concat(boxPts([geo.phaseBox[0], geo.phaseBox[1], 0, geo.phaseBox[3], geo.phaseBox[4], 0]));
      if (which === 'front') return boxPts([geo.phaseBox[0], -1.1, 0, geo.phaseBox[3], geo.phaseBox[4], 0]);
      return boxPts(geo.appBox).concat(boxPts(geo.phaseBox));
    }
    function fitFor(dir, pts, fov) {
      const c = new THREE.Vector3();
      const lo = pts[0].clone(), hi = pts[0].clone();
      pts.forEach(function (p) { lo.min(p); hi.max(p); });
      c.addVectors(lo, hi).multiplyScalar(0.5);
      const d = dir.clone().normalize();
      const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), d);
      if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
      right.normalize();
      const upv = new THREE.Vector3().crossVectors(d, right).normalize();
      const tv = Math.tan(fov * Math.PI / 360), th = tv * camera.aspect;
      let dist = 0;
      pts.forEach(function (p) {
        const r = p.clone().sub(c);
        const along = r.dot(d);
        dist = Math.max(dist, along + Math.abs(r.dot(right)) / th, along + Math.abs(r.dot(upv)) / tv);
      });
      return { center: c, dist: dist * 1.04 + 0.3 };
    }
    function dirFor(which) {
      if (which === 'front') return new THREE.Vector3(0, 0, 1);
      if (which === 'top') return new THREE.Vector3(0, 1, 0.012).normalize();
      if (which === 'real') return new THREE.Vector3(0.28, 0.3, 1).normalize();
      if (geo && geo.mode === 'pendulum') return new THREE.Vector3(camera.aspect < 1.3 ? 0.3 : 0.4, 0.3, 1).normalize();
      return (camera.aspect < 1.3 ? NARROW_DIR : DEFAULT_DIR).clone();
    }
    function fit(force, which, animate) {
      which = which || viewMode;
      const key = camera.aspect.toFixed(3) + '|' + geo.mode + '|' + st.show3.phase + '|' + geo.appBox.join(',') + '|' + geo.phaseBox.map(function (v) { return v.toFixed(2); }).join(',') + '|' + which;
      if (!force && key === fitKey) return;
      fitKey = key;
      viewMode = which;
      const flat = which === 'front' || which === 'top';
      const fov = flat ? FOV_FLAT : FOV;
      const d = (force ? dirFor(which) : camera.position.clone().sub(controls.target).normalize());
      const f = fitFor(d, contentPts(which), fov);
      const toPos = f.center.clone().addScaledVector(d, f.dist);
      const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (animate && !reduce) {
        tween = { t0: performance.now(), p0: camera.position.clone(), q0: controls.target.clone(), p1: toPos, q1: f.center, d1: d, dist: f.dist, f0: camera.fov, f1: fov };
        requestRender();
        return;
      }
      tween = null;
      setFov(fov);
      controls.target.copy(f.center);
      camera.position.copy(toPos);
      camera.updateProjectionMatrix();
      controls.update();
    }
    function setFov(f) {
      if (Math.abs(camera.fov - f) < 1e-6) return;
      camera.fov = f;
      camera.updateProjectionMatrix();
      scene.traverse(function (o) { if (o.isSprite && o.userData.hpx) applyScale(o); });
    }
    function stepTween() {
      if (!tween) return false;
      const u = Math.min(1, (performance.now() - tween.t0) / 520), e = 1 - Math.pow(1 - u, 3);
      controls.target.lerpVectors(tween.q0, tween.q1, e);
      const d0 = tween.p0.clone().sub(tween.q0), r0 = d0.length();
      const dir = d0.normalize().lerp(tween.d1, e).normalize();
      // 視角變窄時距離同步拉遠，畫面大小連續（tan(fov/2)·距離 大致不變）
      const f = tween.f0 + (tween.f1 - tween.f0) * e;
      setFov(f);
      camera.position.copy(controls.target).addScaledVector(dir, r0 + (tween.dist - r0) * e);
      if (u >= 1) tween = null;
      return true;
    }

    // ---------- 繪製 ----------
    let raf = 0;
    function renderNow() {
      if (!api.active || document.hidden) return;
      const want = Math.min(window.devicePixelRatio || 1, 2);
      if (renderer.getPixelRatio() !== want) { renderer.setPixelRatio(want); resize3(); return; }
      const tw = stepTween();
      const moved = controls.update();
      const dir = camera.position.clone().sub(controls.target).normalize();
      const head = Math.abs(dir.z) > 0.96, top = dir.y > 0.96;
      boxGroup.children.forEach(function (o) {
        if (o.userData.hideHead) o.visible = !head;
        if (o.userData.hideTop) o.visible = !top;
      });
      renderer.render(scene, camera);
      if (moved || tw) requestRender();
    }
    function requestRender() {
      if (raf || !api.active) return;
      raf = requestAnimationFrame(function () { raf = 0; renderNow(); });
    }
    function resize3() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      scene.traverse(function (o) { if (o.isSprite && o.userData.hpx) applyScale(o); });
      if (geo) fit(false);
      requestRender();
    }
    const ro = window.ResizeObserver ? new ResizeObserver(resize3) : null;
    if (ro) ro.observe(canvas); else window.addEventListener('resize', resize3);
    controls.addEventListener('change', requestRender);
    controls.addEventListener('start', function () { tween = null; });  // 使用者自己轉動：保留目前視角寬度，直到按其他視角按鈕
    const onVisible = function () { if (!document.hidden) requestRender(); };
    document.addEventListener('visibilitychange', onVisible);
    canvas.addEventListener('webglcontextlost', function (ev) {
      ev.preventDefault();
      if (!api.active) return;   // 切回 2D 時自己釋放的，不是意外中斷
      if (env.lost) env.lost();
    });

    // ---------- 依資料更新（只重建有變的部分） ----------
    function update() {
      if (!api.active) return;
      st = env.state();
      const lang = window.LabSettings && window.LabSettings.lang;
      const theme = LD.ver + '|' + lang;
      const ng = computeGeo();
      const sp = st.mode === 'spring';
      const kApp = theme + '|' + st.mode + '|' + (sp ? [st.sp.bw, st.sp.m, Math.abs(st.sp.x0)].join(',') : [st.pe.Lv, st.pe.L, st.pe.m, Math.abs(st.pe.th0)].join(','));
      const kBox = theme + '|' + st.mode + '|' + st.show3.phase + '|' + st.Wd.toPrecision(6) + '|' + (sp ? [ng.Rb, st.sp.x0, st.sp.b].join(',') : [ng.R, st.pe.th0, st.pe.b, st.pe.L, st.pe.g, st.show.ghost].join(','));
      const modeChanged = !geo || geo.mode !== ng.mode;
      geo = ng;
      if (keys.app !== kApp) {
        keys.app = kApp;
        clearGroup(appGroup);
        if (sp) buildSpringApp(); else buildPendApp();
      }
      if (keys.box !== kBox) { keys.box = kBox; buildBox(); }
      if (modeChanged) fit(true, 'default', false);
      else fit(false);
      dynColors();
      const objPt = sp ? moveSpring() : movePend();
      movePhase(objPt);
      // 右上角
      const per = sp ? (st.sp.regime === 'over' || st.sp.regime === 'critical' ? '2π√(m/k) = ' + fmtNum(st.sp.T0, 3) + ' s' : 'T = ' + fmtNum(st.sp.Tshow, 3) + ' s')
        : 'T = ' + fmtNum(st.pe.Tex, 3) + ' s';
      let txt = 't = ' + fmtNum(st.S.t, 2) + ' s\n' + per;
      if (st.speed !== 1) txt += '\n' + (st.speed < 1 ? T('慢動作 ', 'Slow motion ') : T('快轉 ', 'Fast ')) + st.speed + '×';
      if (clock.textContent !== txt) clock.textContent = txt;
      const al = sp ? T('3D 彈簧振子：氣墊軌道上的木塊與彈簧；旁邊的相空間螺旋橫軸是 x、縱軸是 v/ω0、深度是時間（可拖曳旋轉、滾輪或兩指縮放）',
        '3D spring oscillator: the block and spring on an air track, beside a phase-space helix with x across, v/ω0 up and time in depth (drag to rotate, scroll or pinch to zoom)')
        : T('3D 單擺：支架、輕桿與擺錘；旁邊的相空間螺旋橫軸是 θ、縱軸是 ω/ω0、深度是時間（可拖曳旋轉、滾輪或兩指縮放）',
          '3D pendulum: the stand, light rod and bob, beside a phase-space helix with θ across, ω/ω0 up and time in depth (drag to rotate, scroll or pinch to zoom)');
      if (canvas.getAttribute('aria-label') !== al) canvas.setAttribute('aria-label', al);
      requestRender();
    }

    const api = {
      active: true,
      update: update,
      onTheme: function () { lbKey = ''; keys.app = ''; keys.box = ''; update(); },
      /** 重設視角：右前方略高，實物與螺旋都看得到 */
      resetCamera: function () { if (geo) fit(true, 'default', true); },
      /** 換視角：'real' 看實物、'front' 從正前方看相圖（參考圓）、'top' 從上方看（x–t 圖） */
      viewFrom: function (which) { if (geo) fit(true, which, true); },
      dispose: function () {
        api.active = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        document.removeEventListener('visibilitychange', onVisible);
        controls.dispose();
        disposeObject(scene);
        dotGeo.dispose();
        fadeTex.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        canvas.remove();
        clock.remove();
      }
    };

    const w0 = canvas.clientWidth, h0 = canvas.clientHeight;
    if (w0 && h0) { renderer.setSize(w0, h0, false); camera.aspect = w0 / h0; camera.updateProjectionMatrix(); }
    update();
    fit(true, 'default', false);
    requestRender();
    return api;
  }

  window.OscillationThree = { create: create };
})();
