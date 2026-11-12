/* projectile-3d.js — 拋體運動的 3D 檢視（three.js 由頁面在第一次切換到 3D 時才載入）
 *
 * 場景（y 朝上；物理的 x 是場景 x、物理的 y 是場景 y，運動所在的鉛直面是 z = 0）：
 *   實驗場地面（接收柔和陰影）、發射台與發射器（砲管依仰角傾斜）、鉛直面上淡淡的格線、
 *   預測軌跡（虛線管）、目前軌跡（實心管＋靠近球的漸淡拖尾光）、比較軌跡（各自的顏色與編號）、
 *   飛行中的球與它在正下方地面上的影子（太陽在頭頂正上方）、影子走過的軌跡與等時距標記、
 *   速度向量與分量、最高點與落地點標記。
 * 物理：所有位置都直接取自頁面的物理狀態（js/projectile-core.js 算出的預測、比較軌跡與飛行中的狀態），
 *   x、y 用同一個比例尺換成場景單位（整條軌跡約 30 個單位寬或高），所以形狀與 2D 完全相同。
 *   球、砲管、箭頭粗細與標籤大小是為了看得清楚，不依比例。
 * 用法：ProjectileThree.create({ THREE, OrbitControls }, env) → { active, update, onTheme, resetCamera, viewFrom, dispose }
 *   env：host、T、state()、lost()
 */
(function () {
  'use strict';
  const SPAN = 30;          // 軌跡最大的寬或高換成多少場景單位
  const DEG = Math.PI / 180;

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

  function create(lib, env) {
    const THREE = lib.THREE;
    const LD = window.LabDraw;
    const T = env.T;
    const host = env.host;
    const canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', T('3D 拋體運動：鉛直面上的軌跡、飛行中的球與它在地面正下方的影子（可拖曳旋轉、滾輪或兩指縮放）',
      '3D projectile motion: the path in a vertical plane, the ball in flight and its shadow directly below on the ground (drag to rotate, scroll or pinch to zoom)'));
    host.appendChild(canvas);
    // 右上角的時間資訊（與 2D 畫布右上角相同）
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
    const camera = new THREE.PerspectiveCamera(34, 1.5, 0.3, 3000);
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.minDistance = 6;
    controls.maxDistance = 400;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;   // 不鑽到地面底下
    const DEFAULT_DIR = new THREE.Vector3(-0.32, 0.42, 1).normalize();   // 斜前方、略高：鉛直面與地面都看得到
    const NARROW_DIR = new THREE.Vector3(-0.18, 0.36, 1).normalize();    // 窄畫面：比較正面，軌跡佔的寬度大一點
    function defaultDir() { return camera.aspect < 1.4 ? NARROW_DIR : DEFAULT_DIR; }

    // 燈光：半球光＋頭頂正上方的太陽（投影子，影子落在正下方）＋斜前方的補光（不投影）
    const hemi = new THREE.HemisphereLight(0xffffff, 0x8a8f86, 1.25);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.35);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 3;
    scene.add(sun, sun.target);
    const fill = new THREE.DirectionalLight(0xffffff, 0.9);
    fill.position.set(-14, 16, 26);
    scene.add(fill);

    const css = function (c) { const col = new THREE.Color(); col.setStyle(c); return col; };
    function disposeObject(obj) {
      obj.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
            ['map', 'alphaMap'].forEach(function (k) { if (m[k] && !m[k].userData.shared) m[k].dispose(); });
            m.dispose();
          });
        }
      });
    }
    function clearGroup(g) { while (g.children.length) { const c = g.children.pop(); disposeObject(c); } }

    /** 標籤在螢幕上的大小固定（CSS 像素），不隨遠近縮放：手機上也看得清楚 */
    const P11 = 1 / Math.tan(camera.fov * Math.PI / 360);
    function applyScale(sp) {
      const H = canvas.clientHeight || 300;
      const sy = 2 * sp.userData.hpx / (H * P11);
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
    /**
     * 文字標籤：2D 畫布畫好再貼成 Sprite（settings.js 會自動把 fillText 轉成簡體、依字體設定放大）。
     * parts：字串或陣列，陣列裡的 [字] 是下標。size：螢幕上的字高（CSS px，未乘字體設定）。opt.pill：圓角底框。
     */
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
      const k = window.LabSettings ? 1 + ((+window.LabSettings.get('fs') || 1) - 1) * 0.7 : 1; // 與 settings.js 的畫布字體倍率相同
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
    /** 比較軌跡的編號：彩色小圓＋白字 */
    function badge(n, color, size) {
      const c = document.createElement('canvas');
      c.width = c.height = 96;
      const g = c.getContext('2d');
      const gr = g.createRadialGradient(36, 34, 4, 48, 48, 44);
      gr.addColorStop(0, LD.shade(color, 0.35)); gr.addColorStop(0.6, color); gr.addColorStop(1, LD.shade(color, -0.3));
      g.fillStyle = gr;
      g.beginPath(); g.arc(48, 48, 42, 0, Math.PI * 2); g.fill();
      g.lineWidth = 5; g.strokeStyle = LD.alpha(LD.c['canvas-bg'], 0.9); g.stroke();
      g.font = '700 54px ' + LD.FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#ffffff'; g.fillText(String(n), 48, 51);
      const s = spriteOf(c, size);
      s.renderOrder = 11;
      return s;
    }

    // 虛線管用的條紋貼圖（沿管子長度方向重複）
    const dashTex = (function () {
      const c = document.createElement('canvas');
      c.width = 64; c.height = 4;
      const g = c.getContext('2d');
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, 30, 4);
      const t = new THREE.CanvasTexture(c);
      t.wrapS = THREE.RepeatWrapping;
      t.userData.shared = true;
      return t;
    })();
    // 地面四周漸淡的透明度貼圖（中心不透明、邊緣透明）
    const fadeTex = (function () {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const g = c.getContext('2d');
      const gr = g.createRadialGradient(128, 128, 40, 128, 128, 128);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.62, '#ffffff'); gr.addColorStop(1, '#000000');
      g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
      const t = new THREE.CanvasTexture(c);
      t.userData.shared = true;
      return t;
    })();

    /** 折線點 [[x, y], …]（場景座標）→ 平滑曲線；太近的點略過，避免切線變成 NaN */
    function curveOf(pts, maxN) {
      const out = [];
      const step = Math.max(1, Math.ceil(pts.length / (maxN || 320)));
      for (let i = 0; i < pts.length; i += step) out.push(pts[i]);
      if (out[out.length - 1] !== pts[pts.length - 1]) out.push(pts[pts.length - 1]);
      const v = [];
      out.forEach(function (p) {
        const q = new THREE.Vector3(p[0], p[1], 0);
        if (!v.length || q.distanceTo(v[v.length - 1]) > 1e-4) v.push(q);
      });
      if (v.length < 2) return null;
      return new THREE.CatmullRomCurve3(v, false, 'centripetal');
    }
    function tube(curve, radius, mat, segs) {
      return new THREE.Mesh(new THREE.TubeGeometry(curve, segs || Math.min(640, curve.points.length * 2 + 8), radius, 8, false), mat);
    }
    function dashedTube(curve, radius, color, opacity, period) {
      const tex = dashTex.clone();
      tex.userData = {};
      tex.needsUpdate = true;
      tex.repeat.x = Math.max(1, curve.getLength() / period);
      const mat = new THREE.MeshBasicMaterial({ color: css(color), alphaMap: tex, transparent: true, opacity: opacity, alphaTest: 0.35, depthWrite: false });
      return tube(curve, radius, mat);
    }

    // ---- 群組 ----
    const groundGroup = new THREE.Group();   // 地面、地面格線
    const planeGroup = new THREE.Group();    // 鉛直面的格線與刻度
    const rigGroup = new THREE.Group();      // 發射台、發射器、仰角
    const predGroup = new THREE.Group();     // 預測軌跡、理想拋物線、最高點與落地點
    const ghostGroup = new THREE.Group();    // 比較軌跡
    const trailGroup = new THREE.Group();    // 目前軌跡（每格重建）
    const beadGroup = new THREE.Group();     // 等時距標記（球與影子）
    const dynGroup = new THREE.Group();      // 球、影子、速度向量
    scene.add(groundGroup, planeGroup, rigGroup, predGroup, ghostGroup, trailGroup, beadGroup, dynGroup);

    // 目前的換算：場景座標 = 物理座標（m）× S
    let st = null, S = 1, box = null;

    // ---------- 地面與鉛直面 ----------
    function buildGround() {
      clearGroup(groundGroup);
      const gx0 = box.x0 - 8, gx1 = box.x1 + 8, size = Math.max(gx1 - gx0, 46) * 1.6;
      const cx = (box.x0 + box.x1) / 2;
      const field = LD.mix(LD.c.surface, LD.c.accent, LD.dark ? 0.22 : 0.16);
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({
        color: css(field), roughness: 0.96, metalness: 0, transparent: true, alphaMap: fadeTex, depthWrite: false }));
      ground.rotation.x = -Math.PI / 2;
      ground.position.set(cx, 0, 0);
      ground.receiveShadow = true;
      ground.renderOrder = -2;
      groundGroup.add(ground);
      // 地面格線（與鉛直面同一個間距；只畫在軌跡附近）
      const step = box.step, gpts = [], zr = box.zr;
      for (let x = Math.ceil(box.x0 / step) * step; x <= box.x1 + 1e-6; x += step) gpts.push(new THREE.Vector3(x, 0.004, -zr), new THREE.Vector3(x, 0.004, zr));
      for (let z = -Math.floor(zr / step) * step; z <= zr + 1e-6; z += step) gpts.push(new THREE.Vector3(box.x0, 0.004, z), new THREE.Vector3(box.x1, 0.004, z));
      const gl = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(gpts), new THREE.LineBasicMaterial({ color: css(LD.c.text), transparent: true, opacity: LD.dark ? 0.1 : 0.09, depthWrite: false }));
      gl.renderOrder = -1;
      groundGroup.add(gl);
      // x 軸（鉛直面與地面的交線）
      const ax = new THREE.Mesh(new THREE.BoxGeometry(box.x1 - box.x0, 0.05, 0.05), new THREE.MeshStandardMaterial({ color: css(LD.c.text), roughness: 0.7 }));
      ax.position.set((box.x0 + box.x1) / 2, 0.025, 0);
      groundGroup.add(ax);
      // 太陽的投影範圍跟著場景大小走
      const sc = sun.shadow.camera;
      sun.position.set(cx, 80, 0.001);
      sun.target.position.set(cx, 0, 0);
      sc.left = -(box.x1 - box.x0) / 2 - 6; sc.right = (box.x1 - box.x0) / 2 + 6;
      sc.top = zr + 4; sc.bottom = -zr - 4;
      sc.near = 1; sc.far = 80 + box.y1 + 5;
      sc.updateProjectionMatrix();
    }

    function buildPlane() {
      clearGroup(planeGroup);
      if (!st.show3.plane) return;
      // 淡淡的鉛直面（運動永遠在這個平面裡）
      const w = box.x1 - box.x0, h = box.y1;
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: css(LD.c.accent), transparent: true, opacity: LD.dark ? 0.05 : 0.035, side: THREE.DoubleSide, depthWrite: false }));
      pl.position.set(box.x0 + w / 2, h / 2, 0);
      pl.renderOrder = 0;
      planeGroup.add(pl);
      const major = [], minor = [], step = box.step, sub = step / 5;
      for (let x = Math.ceil(box.x0 / sub) * sub; x <= box.x1 + 1e-6; x += sub) {
        const isMaj = Math.abs(x / step - Math.round(x / step)) < 1e-6;
        (isMaj ? major : minor).push(new THREE.Vector3(x, 0, 0), new THREE.Vector3(x, h, 0));
      }
      for (let y = sub; y <= h + 1e-6; y += sub) {
        const isMaj = Math.abs(y / step - Math.round(y / step)) < 1e-6;
        (isMaj ? major : minor).push(new THREE.Vector3(box.x0, y, 0), new THREE.Vector3(box.x1, y, 0));
      }
      const mk = function (pts, op) {
        const l = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: css(LD.c.text), transparent: true, opacity: op, depthWrite: false }));
        l.renderOrder = 0;
        planeGroup.add(l);
      };
      mk(major, LD.dark ? 0.16 : 0.13);
      mk(minor, LD.dark ? 0.06 : 0.05);
      // 刻度數字：x 在地面前緣、y 在鉛直面左緣
      const m = box.tick / S, fsz = 11.5;
      const dec = Math.max(0, -Math.floor(Math.log10(m) + 1e-9));
      for (let i = Math.ceil(box.x0 / box.tick); i * box.tick <= box.x1 - box.tick * 0.6; i++) {
        if (i < 0) continue; // 發射點左邊不標負的刻度（和 2D 一樣）
        const lb = label(fmtNum(i * m, dec), LD.c.muted, fsz, { weight: 500, cy: 1 });
        lb.position.set(i * box.tick, -0.25, 0.9);
        planeGroup.add(lb);
      }
      for (let j = 1; j * box.tick <= h - box.tick * 0.3; j++) {
        const lb = label(fmtNum(j * m, dec), LD.c.muted, fsz, { weight: 500, cx: 1 });
        lb.position.set(box.x0 - 0.35, j * box.tick, 0);
        planeGroup.add(lb);
      }
      const lx = label('x (m)', LD.c.text, 12.5, { cx: 0, cy: 1 });
      lx.position.set(box.x1 + 0.3, -0.25, 0.9);
      planeGroup.add(lx);
      const ly = label('y (m)', LD.c.text, 12.5, { cx: 0, cy: 0 });
      ly.position.set(box.x0, h + 0.25, 0);
      planeGroup.add(ly);
    }

    // ---------- 發射台、發射器與仰角 ----------
    function buildRig() {
      clearGroup(rigGroup);
      const h0 = st.p.h0 * S, th = st.p.theta * DEG;
      const metal = LD.mix(LD.c.muted, LD.c.text, 0.25);
      const stone = LD.mix(LD.c.border, LD.c.muted, LD.dark ? 0.32 : 0.28);
      if (h0 > 0) {
        const w = 1.3;
        const tower = new THREE.Mesh(new THREE.BoxGeometry(w, h0, w), new THREE.MeshStandardMaterial({ color: css(stone), roughness: 0.9 }));
        tower.position.set(-w / 2, h0 / 2, 0);
        tower.castShadow = true; tower.receiveShadow = true;
        rigGroup.add(tower);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.24, Math.min(0.18, h0), w + 0.24), new THREE.MeshStandardMaterial({ color: css(LD.shade(stone, LD.dark ? 0.2 : 0.35)), roughness: 0.8 }));
        cap.position.set(-w / 2, h0 - Math.min(0.18, h0) / 2, 0);
        cap.castShadow = true; cap.receiveShadow = true;
        rigGroup.add(cap);
      }
      const mMat = new THREE.MeshStandardMaterial({ color: css(metal), roughness: 0.35, metalness: 0.55 });
      const dMat = new THREE.MeshStandardMaterial({ color: css(LD.shade(metal, -0.35)), roughness: 0.5, metalness: 0.4 });
      // 轉軸兩側的支架（從台面到轉軸）
      [-0.34, 0.34].forEach(function (z) {
        const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.5, 0.1), dMat);
        cheek.position.set(-0.05, h0 + 0.02, z);
        cheek.castShadow = true;
        rigGroup.add(cheek);
      });
      const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.8, 16), dMat);
      axle.rotation.x = Math.PI / 2;
      axle.position.set(0, h0, 0);
      rigGroup.add(axle);
      // 砲管：沿仰角方向（裝飾，長度不依比例）
      const L = 1.7;
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, L, 24, 1, true), mMat);
      barrel.rotation.z = th - Math.PI / 2;
      barrel.position.set(Math.cos(th) * L / 2, h0 + Math.sin(th) * L / 2, 0);
      barrel.castShadow = true;
      rigGroup.add(barrel);
      const muzzle = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.05, 10, 24), dMat);
      muzzle.position.set(Math.cos(th) * L, h0 + Math.sin(th) * L, 0);
      muzzle.lookAt(muzzle.position.clone().add(new THREE.Vector3(Math.cos(th), Math.sin(th), 0)));
      rigGroup.add(muzzle);
      const hub = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 16), mMat);
      hub.position.set(0, h0, 0);
      hub.castShadow = true;
      rigGroup.add(hub);
      // 仰角：鉛直面上的水平虛線、圓弧與度數
      const r = 2.4;
      const ref = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, h0, 0), new THREE.Vector3(r + 0.9, h0, 0)]),
        new THREE.LineDashedMaterial({ color: css(LD.c.muted), dashSize: 0.22, gapSize: 0.18, transparent: true, opacity: 0.9 }));
      ref.computeLineDistances();
      rigGroup.add(ref);
      if (th > 0) {
        const arc = [];
        for (let i = 0; i <= 32; i++) { const a = th * i / 32; arc.push(new THREE.Vector3(r * Math.cos(a), h0 + r * Math.sin(a), 0)); }
        rigGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(arc), new THREE.LineBasicMaterial({ color: css(LD.c.muted) })));
        const fan = new THREE.Mesh(new THREE.CircleGeometry(r, 32, 0, th), new THREE.MeshBasicMaterial({ color: css(LD.c.accent), transparent: true, opacity: LD.dark ? 0.16 : 0.1, side: THREE.DoubleSide, depthWrite: false }));
        fan.position.set(0, h0, 0.001);
        rigGroup.add(fan);
      }
      const deg = label(fmtNum(st.p.theta, st.p.theta % 1 ? 1 : 0) + '°', LD.c.muted, 12, { cx: 0 });
      deg.position.set((r + 0.45) * Math.cos(th / 2), h0 + (r + 0.45) * Math.sin(th / 2), 0);
      rigGroup.add(deg);
    }

    // ---------- 預測軌跡、理想拋物線、最高點與落地點 ----------
    const sc = function (pts) { return pts.map(function (q) { return [q[0] * S, q[1] * S, q[2]]; }); };
    function interpX(pts, t) {
      for (let i = 1; i < pts.length; i++) {
        if (pts[i][2] >= t) {
          const a = pts[i - 1], b = pts[i], f = b[2] > a[2] ? (t - a[2]) / (b[2] - a[2]) : 0;
          return a[0] + (b[0] - a[0]) * f;
        }
      }
      return pts[pts.length - 1][0];
    }
    function buildPred() {
      clearGroup(predGroup);
      if (!st.show.pred) return;
      const pr = st.pred;
      if (st.drag && st.ideal) {
        const ci = curveOf(sc(st.ideal.points));
        if (ci) predGroup.add(dashedTube(ci, 0.045, LD.c.muted, 0.85, 0.75));
      }
      const cp = curveOf(sc(pr.points));
      if (cp) predGroup.add(dashedTube(cp, 0.06, LD.c.accent, 0.9, 0.8));
      // 最高點：圓環標記＋到地面的細虛線＋標籤
      if (pr.tApex > 0) {
        const xa = interpX(pr.points, pr.tApex) * S, ya = pr.H * S;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.06, 10, 28), new THREE.MeshStandardMaterial({ color: css(LD.c.accent), roughness: 0.4 }));
        ring.position.set(xa, ya, 0);
        predGroup.add(ring);
        const drop = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(xa, ya - 0.3, 0), new THREE.Vector3(xa, 0.01, 0)]),
          new THREE.LineDashedMaterial({ color: css(LD.c.accent), dashSize: 0.1, gapSize: 0.22, transparent: true, opacity: 0.55 }));
        drop.computeLineDistances();
        predGroup.add(drop);
        const lb = label('H = ' + fmtNum(pr.H, 2) + ' m', LD.c.accent, 12, { pill: true, cy: 0 });
        lb.position.set(xa, ya + 0.45, 0);
        predGroup.add(lb);
      }
      // 落地點：地面上的小旗＋標籤
      if (pr.R > 0) {
        const xr = pr.R * S;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 8), new THREE.MeshStandardMaterial({ color: css(LD.c.accent), roughness: 0.5 }));
        pole.position.set(xr, 0.55, 0);
        pole.castShadow = true;
        predGroup.add(pole);
        const fl = new THREE.Shape();
        fl.moveTo(0, 0); fl.lineTo(0.55, -0.17); fl.lineTo(0, -0.34); fl.closePath();
        const flag = new THREE.Mesh(new THREE.ShapeGeometry(fl), new THREE.MeshStandardMaterial({ color: css(LD.c.accent), roughness: 0.6, side: THREE.DoubleSide }));
        flag.position.set(xr + 0.03, 1.1, 0);
        flag.castShadow = true;
        predGroup.add(flag);
        const lb = label('R = ' + fmtNum(pr.R, 2) + ' m', LD.c.accent, 12, { pill: true, cy: 0 });
        lb.position.set(xr, 1.45, 0);
        predGroup.add(lb);
      }
    }

    // ---------- 比較軌跡 ----------
    function buildGhosts() {
      clearGroup(ghostGroup);
      st.ghosts.forEach(function (g) {
        const col = LD.c[st.ghostColors[g.color]] || LD.c.muted;
        const c = curveOf(sc(g.pts));
        if (!c) return;
        const m = tube(c, 0.055, new THREE.MeshStandardMaterial({ color: css(col), roughness: 0.45, transparent: true, opacity: 0.72, depthWrite: false }));
        m.renderOrder = 1;
        ghostGroup.add(m);
        const last = g.pts[g.pts.length - 1];
        const end = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), new THREE.MeshStandardMaterial({ color: css(col), roughness: 0.4 }));
        end.position.set(last[0] * S, last[1] * S, 0);
        ghostGroup.add(end);
        // 編號放在下降段（飛行時間的 72% 處）的外側：不和最高點的 H、落地點的 R 標籤疊在一起；
        // 互補角的兩條軌跡落點相同，但這個時刻的位置不同，編號也不會疊在一起
        const tEnd = last[2], tq = 0.72 * tEnd;
        let q = last;
        for (let i = 1; i < g.pts.length; i++) if (g.pts[i][2] >= tq) { q = g.pts[i]; break; }
        const b = badge(g.n, col, 19);
        b.position.set(q[0] * S + 0.45, q[1] * S + 0.55, 0);
        ghostGroup.add(b);
      });
    }

    // ---------- 目前軌跡：實心管＋靠近球的漸淡拖尾光 ----------
    const trailMat = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.05 });
    const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false });
    let trailLen = -1;
    function buildTrail() {
      const f = st.fly, tr = f.trail;
      if (tr.length === trailLen && !f.running) return;
      trailLen = tr.length;
      while (trailGroup.children.length) { const c = trailGroup.children.pop(); c.geometry.dispose(); }
      if (tr.length < 2) return;
      const c = curveOf(sc(tr), 200);
      if (!c) return;
      const m = tube(c, 0.1, trailMat);
      m.castShadow = false;
      trailGroup.add(m);
      // 拖尾光：最近一小段時間，越新越亮、越粗
      const tw = Math.max(0.12, 0.16 * (st.pred.T || 1)), tNow = f.s.t;
      if (!f.running) return;
      let i0 = tr.length - 1;
      while (i0 > 0 && tr[i0 - 1][2] >= tNow - tw) i0--;
      const seg = tr.slice(Math.max(0, i0 - 1));
      const cg = curveOf(sc(seg), 60);
      if (!cg) return;
      const segs = Math.max(8, cg.points.length * 2), rad = 8;
      const geo = new THREE.TubeGeometry(cg, segs, 0.26, rad, false);
      const n = geo.attributes.position.count, col = new Float32Array(n * 4), base = css(LD.c.accent);
      for (let v = 0; v < n; v++) {
        const u = Math.floor(v / (rad + 1)) / segs;
        col[v * 4] = base.r; col[v * 4 + 1] = base.g; col[v * 4 + 2] = base.b;
        col[v * 4 + 3] = (LD.dark ? 0.32 : 0.22) * u * u;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
      const glow = new THREE.Mesh(geo, glowMat);
      glow.renderOrder = 3;
      trailGroup.add(glow);
    }

    // ---------- 等時距標記：軌跡上的白色小珠＋地面上影子的位置（水平間距相等） ----------
    const beadMat = new THREE.MeshStandardMaterial({ roughness: 0.4 });
    const beadRing = new THREE.MeshBasicMaterial({ });
    const markMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
    const linkMat = new THREE.LineDashedMaterial({ dashSize: 0.12, gapSize: 0.18, transparent: true, depthWrite: false });
    const beadGeo = new THREE.SphereGeometry(0.15, 14, 10), ringGeo = new THREE.TorusGeometry(0.17, 0.035, 8, 20), markGeo = new THREE.CircleGeometry(0.17, 20);
    let beadKey = '';
    function buildBeads() {
      const f = st.fly, tr = f.trail, dt = st.markerStep;
      const pts = [];
      if (st.show.dots && dt > 0 && tr.length > 1) {
        let m = 1;
        for (let i = 1; i < tr.length; i++) {
          while (m * dt <= tr[i][2] + 1e-9) {
            const a = tr[i - 1], b = tr[i], u = b[2] > a[2] ? (m * dt - a[2]) / (b[2] - a[2]) : 1;
            pts.push([(a[0] + (b[0] - a[0]) * u) * S, (a[1] + (b[1] - a[1]) * u) * S]);
            m++;
          }
        }
      }
      const key = pts.length + '|' + S + '|' + LD.ver + '|' + st.show3.shadow + '|' + (pts.length ? pts[0][0] : 0);
      if (key === beadKey) return;
      beadKey = key;
      while (beadGroup.children.length) { const c = beadGroup.children.pop(); if (c.geometry !== beadGeo && c.geometry !== ringGeo && c.geometry !== markGeo) c.geometry.dispose(); }
      if (!pts.length) return;
      const links = [];
      pts.forEach(function (p) {
        const b = new THREE.Mesh(beadGeo, beadMat); b.position.set(p[0], p[1], 0); beadGroup.add(b);
        const r = new THREE.Mesh(ringGeo, beadRing); r.position.set(p[0], p[1], 0.001); beadGroup.add(r);
        if (st.show3.shadow) {
          const mk = new THREE.Mesh(markGeo, markMat); mk.rotation.x = -Math.PI / 2; mk.position.set(p[0], 0.012, 0); mk.renderOrder = 2; beadGroup.add(mk);
          if (p[1] > 0.3) links.push(new THREE.Vector3(p[0], p[1] - 0.18, 0), new THREE.Vector3(p[0], 0.02, 0));
        }
      });
      if (links.length) {
        const l = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(links), linkMat);
        l.computeLineDistances();
        beadGroup.add(l);
      }
    }

    // ---------- 球、影子、速度向量 ----------
    const ballMat = new THREE.MeshPhysicalMaterial({ roughness: 0.28, metalness: 0.05, clearcoat: 0.7, clearcoatRoughness: 0.25 });
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.42, 36, 24), ballMat);
    ball.castShadow = false; // 球的影子用下面的柔和圓影畫（太陽在頭頂正上方，影子就在正下方）
    const blobTex = (function () {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d');
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      const t = new THREE.CanvasTexture(c);
      t.userData.shared = true;
      return t;
    })();
    const blobMat = new THREE.MeshBasicMaterial({ alphaMap: blobTex, transparent: true, depthWrite: false });
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.25), blobMat);
    blob.rotation.x = -Math.PI / 2;
    blob.renderOrder = 2;
    dynGroup.add(blob);
    ball.renderOrder = 4;
    dynGroup.add(ball);
    // 影子走過的地面軌跡（從發射點正下方到影子目前的位置）
    const trackMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
    const track = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.16), trackMat);
    track.rotation.x = -Math.PI / 2;
    track.renderOrder = 1;
    dynGroup.add(track);
    const dropMat = new THREE.LineDashedMaterial({ dashSize: 0.18, gapSize: 0.14, transparent: true, depthWrite: false });
    const drop = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 1, 0)]), dropMat);
    dynGroup.add(drop);

    function makeArrow(radius) {
      const mat = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.05 });
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 1, 12), mat);
      const head = new THREE.Mesh(new THREE.ConeGeometry(radius * 2.7, radius * 7.5, 18), mat);
      const g = new THREE.Group();
      g.add(shaft, head);
      g.renderOrder = 5;
      const up = new THREE.Vector3(0, 1, 0);
      return {
        group: g, mat: mat,
        set: function (from, vec) {
          const len = vec.length();
          if (len < 1e-4) { g.visible = false; return; }
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
    const aV = makeArrow(0.075), aX = makeArrow(0.06), aY = makeArrow(0.06), aXs = makeArrow(0.05);
    dynGroup.add(aV.group, aX.group, aY.group, aXs.group);
    const compLines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineDashedMaterial({ dashSize: 0.14, gapSize: 0.1, transparent: true, opacity: 0.8 }));
    dynGroup.add(compLines);
    let lbV = null, lbX = null, lbY = null, lbKey = '';
    function arrowLabels() {
      const key = LD.ver + '|' + (window.LabSettings && window.LabSettings.lang);
      if (key === lbKey && lbV) return;
      lbKey = key;
      [lbV, lbX, lbY].forEach(function (l) { if (l) { dynGroup.remove(l); disposeObject(l); } });
      lbV = label('v', LD.c.pos, 13, { weight: 700 });
      lbX = label(['v', ['x']], LD.c.neg, 13, { weight: 700 });
      lbY = label(['v', ['y']], LD.c.equi, 13, { weight: 700 });
      dynGroup.add(lbV, lbX, lbY);
    }
    // 落地瞬間的地面波紋（純裝飾；減少動態效果時頁面不會傳 puff）
    const puffMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const puffRing = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 40), puffMat);
    puffRing.rotation.x = -Math.PI / 2;
    puffRing.renderOrder = 2;
    dynGroup.add(puffRing);

    let colKey = -1;
    function dynColors() {
      if (colKey === LD.ver) return;
      colKey = LD.ver;
      const acc = css(LD.c.accent);
      ballMat.color.copy(acc);
      ballMat.emissive.copy(acc).multiplyScalar(LD.dark ? 0.18 : 0.04);
      trailMat.color.copy(acc);
      trailMat.emissive.copy(acc).multiplyScalar(LD.dark ? 0.2 : 0.05);
      trackMat.color.copy(css(LD.c.text)); trackMat.opacity = LD.dark ? 0.34 : 0.22;
      blobMat.color.copy(css(LD.dark ? '#000000' : LD.c.text)); blobMat.opacity = LD.dark ? 0.8 : 0.5;
      dropMat.color.copy(css(LD.c.text)); dropMat.opacity = LD.dark ? 0.45 : 0.35;
      beadMat.color.copy(css(LD.c.surface));
      beadRing.color.copy(acc);
      markMat.color.copy(css(LD.c.text)); markMat.opacity = LD.dark ? 0.6 : 0.5;
      linkMat.color.copy(css(LD.c.text)); linkMat.opacity = LD.dark ? 0.28 : 0.2;
      aV.mat.color.copy(css(LD.c.pos));
      aX.mat.color.copy(css(LD.c.neg));
      aXs.mat.color.copy(css(LD.c.neg)); aXs.mat.transparent = true; aXs.mat.opacity = 0.75;
      aY.mat.color.copy(css(LD.c.equi));
      compLines.material.color.copy(css(LD.c.muted));
      puffMat.color.copy(acc);
      beadKey = '';
    }

    function moveDyn() {
      const s = st.fly.s;
      const x = s.x * S, y = s.y * S;
      ball.position.set(x, y + 0, 0);
      // 影子：太陽在頭頂，影子就在球的正下方；地面上的淡色帶是影子走過的路
      const sh = st.show3.shadow;
      blob.visible = sh;
      blob.position.set(x, 0.014, 0);
      track.visible = sh && s.x > 0;
      if (track.visible) { track.scale.x = x; track.position.set(x / 2, 0.008, 0); }
      drop.visible = sh && y > 0.5;
      if (drop.visible) {
        const a = drop.geometry.attributes.position.array;
        a[0] = x; a[1] = y - 0.45; a[2] = 0; a[3] = x; a[4] = 0.02; a[5] = 0;
        drop.geometry.attributes.position.needsUpdate = true;
        drop.computeLineDistances();
      }
      // 速度向量（箭頭長度 ∝ 速度；以無阻力落地速率為基準，與 2D 相同的比例原則）
      const kv = 6 / st.vref;
      const from = new THREE.Vector3(x, y, 0);
      arrowLabels();
      const showV = st.show.v, showC = st.show.comp;
      aV.group.visible = false; aX.group.visible = false; aY.group.visible = false; aXs.group.visible = false;
      lbV.visible = lbX.visible = lbY.visible = false; compLines.visible = false;
      if (showV) {
        aV.set(from, new THREE.Vector3(s.vx * kv, s.vy * kv, 0));
        lbV.visible = aV.group.visible;
        lbV.position.set(x + s.vx * kv + 0.35, y + s.vy * kv + 0.35, 0);
      }
      if (showC) {
        aX.set(from, new THREE.Vector3(s.vx * kv, 0, 0));
        aY.set(from, new THREE.Vector3(0, s.vy * kv, 0));
        lbX.visible = aX.group.visible; lbY.visible = aY.group.visible;
        lbX.position.set(x + s.vx * kv * 0.5, y - 0.55, 0);
        lbY.position.set(x - 0.6, y + s.vy * kv * 0.5, 0);
        if (sh && y > 0.5) { aXs.set(new THREE.Vector3(x, 0.05, 0), new THREE.Vector3(s.vx * kv, 0, 0)); }
        if (showV) {
          compLines.visible = true;
          const a = compLines.geometry.attributes.position.array;
          const tx = x + s.vx * kv, ty = y + s.vy * kv;
          a.set([tx, y, 0, tx, ty, 0, x, ty, 0, tx, ty, 0]);
          compLines.geometry.attributes.position.needsUpdate = true;
          compLines.computeLineDistances();
        }
      }
      // 落地波紋
      const pf = st.puff;
      puffRing.visible = !!pf;
      if (pf) {
        const e = 1 - Math.pow(1 - pf.u, 3);
        puffRing.position.set(pf.x * S, 0.02, 0);
        puffRing.scale.setScalar(0.4 + 2.4 * e);
        puffMat.opacity = 0.6 * (1 - pf.u);
      }
      // 右上角的時間資訊
      const txt = 't = ' + fmtNum(s.t, 2) + ' s' + (st.markerStep > 0 && st.show.dots ? '\n' + T('標記間隔 ', 'Marker interval ') + fmtNum(st.markerStep, st.markerStep < 0.1 ? 2 : st.markerStep < 1 ? 1 : 0) + ' s' : '');
      if (clock.textContent !== txt) clock.textContent = txt;
    }

    // ---------- 場景範圍（與 2D 的自動縮放相同：預測、理想、比較、目前軌跡都放得進來） ----------
    function computeBox() {
      let xmax = 1, ymax = Math.max(1, st.p.h0);
      const scan = function (pts) { for (let i = 0; i < pts.length; i++) { if (pts[i][0] > xmax) xmax = pts[i][0]; if (pts[i][1] > ymax) ymax = pts[i][1]; } };
      scan(st.pred.points);
      if (st.drag && st.ideal) scan(st.ideal.points);
      st.ghosts.forEach(function (g) { scan(g.pts); });
      scan(st.fly.trail);
      const span = Math.max(xmax * 1.1, ymax * 1.12);
      const s = SPAN / span;
      const tick = niceStep(span / 6) * s;      // 刻度間距（場景單位）
      const step = tick;                       // 主格線與刻度一致
      const x0 = -0.05 * xmax * s - 1.6;       // 左邊留給發射台
      const x1 = Math.max(xmax * 1.1 * s, x0 + SPAN * 0.4);
      const y1 = Math.max(ymax * 1.12 * s, (x1 - x0) * 0.3);
      return { S: s, x0: x0, x1: Math.ceil(x1 / step) * step, y1: Math.ceil(y1 / step) * step, tick: tick, step: step, zr: Math.max(6, Math.ceil(SPAN * 0.32 / step) * step) };
    }

    // ---------- 相機：讓鉛直面上的軌跡（含刻度）整個在畫面裡 ----------
    let fitKey = '', tween = null;
    function fitDistance(dir) {
      const center = new THREE.Vector3((box.x0 + box.x1) / 2, box.y1 * 0.5, 0);
      const fwd = dir.clone().negate();
      const right = new THREE.Vector3().crossVectors(fwd, camera.up).normalize();
      if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
      const upv = new THREE.Vector3().crossVectors(right, fwd).normalize();
      const tv = Math.tan(camera.fov * Math.PI / 360), th = tv * camera.aspect;
      let dist = 1;
      [box.x0 - 1.5, box.x1 + 2.5].forEach(function (X) {
        [-1.4, box.y1 + 1.2].forEach(function (Y) {
          [-0.6, 1.4].forEach(function (Z) {
            const c = new THREE.Vector3(X, Y, Z).sub(center);
            const depth = c.dot(dir);
            dist = Math.max(dist, depth + Math.abs(c.dot(right)) / th, depth + Math.abs(c.dot(upv)) / tv);
          });
        });
      });
      // 標籤的大小固定在螢幕像素，窄畫面要多留一點邊
      return { center: center, dist: dist * (1.02 + 48 / Math.max(240, canvas.clientWidth || 600)) };
    }
    function fit(force, dir, animate) {
      const key = camera.aspect.toFixed(3) + '|' + [box.x0, box.x1, box.y1].map(function (v) { return v.toFixed(2); }).join(',');
      if (!force && key === fitKey) return;
      fitKey = key;
      const d = (dir || (force ? defaultDir() : camera.position.clone().sub(controls.target).normalize())).clone().normalize();
      const f = fitDistance(d);
      const toPos = f.center.clone().addScaledVector(d, f.dist);
      if (animate && !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) {
        tween = { t0: performance.now(), p0: camera.position.clone(), q0: controls.target.clone(), p1: toPos, q1: f.center, d1: d, dist: f.dist };
        requestRender();
        return;
      }
      tween = null;
      controls.target.copy(f.center);
      camera.position.copy(toPos);
      camera.updateProjectionMatrix();
      controls.update();
    }
    function stepTween() {
      if (!tween) return false;
      const u = Math.min(1, (performance.now() - tween.t0) / 450), e = 1 - Math.pow(1 - u, 3);
      controls.target.lerpVectors(tween.q0, tween.q1, e);
      // 沿球面插值方向，距離線性插值（避免直線穿過場景）
      const d0 = tween.p0.clone().sub(tween.q0), r0 = d0.length();
      const dir = d0.normalize().lerp(tween.d1, e).normalize();
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
      if (box) fit(false);
      requestRender();
    }
    const ro = window.ResizeObserver ? new ResizeObserver(resize3) : null;
    if (ro) ro.observe(canvas); else window.addEventListener('resize', resize3);
    controls.addEventListener('change', requestRender);
    controls.addEventListener('start', function () { tween = null; });
    const onVisible = function () { if (!document.hidden) requestRender(); };
    document.addEventListener('visibilitychange', onVisible);
    canvas.addEventListener('webglcontextlost', function (ev) {
      ev.preventDefault();
      if (!api.active) return;   // 切回 2D 時自己釋放的，不是意外中斷
      if (env.lost) env.lost();
    });

    // ---------- 依資料更新（只重建有變的部分；球、影子、箭頭每格都移動） ----------
    const keys = {};
    function update() {
      if (!api.active) return;
      st = env.state();
      const nb = computeBox();
      const lang = window.LabSettings && window.LabSettings.lang;
      const kBox = [nb.S.toPrecision(6), nb.x0, nb.x1, nb.y1].join('|');
      if (keys.box !== kBox) { keys.box = kBox; box = nb; S = nb.S; keys.ground = ''; keys.plane = ''; keys.rig = ''; keys.pred = ''; keys.ghost = ''; trailLen = -1; beadKey = ''; fit(false); }
      const theme = LD.ver + '|' + lang;
      const kG = theme;
      if (keys.ground !== kG) { keys.ground = kG; buildGround(); }
      const kP = theme + '|' + st.show3.plane;
      if (keys.plane !== kP) { keys.plane = kP; buildPlane(); }
      const kR = theme + '|' + st.p.h0 + '|' + st.p.theta;
      if (keys.rig !== kR) { keys.rig = kR; buildRig(); }
      const kPr = theme + '|' + st.predKey + '|' + st.show.pred;
      if (keys.pred !== kPr) { keys.pred = kPr; buildPred(); }
      const kGh = theme + '|' + st.ghosts.map(function (g) { return g.n; }).join(',');
      if (keys.ghost !== kGh) { keys.ghost = kGh; buildGhosts(); }
      if (keys.theme !== theme) { keys.theme = theme; trailLen = -1; }
      dynColors();
      buildTrail();
      buildBeads();
      moveDyn();
      requestRender();
    }

    const api = {
      active: true,
      update: update,
      onTheme: function () { lbKey = ''; update(); },
      /** 重設視角：斜前方 */
      resetCamera: function () { if (box) fit(true, defaultDir(), true); },
      /** 換視角：'side' 從側面（就是 2D 那張圖）、'top' 從正上方（軌跡變成一條直線） */
      viewFrom: function (which) {
        if (!box) return;
        const d = which === 'side' ? new THREE.Vector3(0, 0, 1) : which === 'top' ? new THREE.Vector3(0, 1, 0.035).normalize() : defaultDir();
        fit(true, d, true);
      },
      dispose: function () {
        api.active = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        document.removeEventListener('visibilitychange', onVisible);
        controls.dispose();
        disposeObject(scene);
        [beadGeo, ringGeo, markGeo].forEach(function (g) { g.dispose(); });
        dashTex.dispose(); fadeTex.dispose(); blobTex.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        canvas.remove();
        clock.remove();
      }
    };

    const w0 = canvas.clientWidth, h0 = canvas.clientHeight;
    if (w0 && h0) { renderer.setSize(w0, h0, false); camera.aspect = w0 / h0; camera.updateProjectionMatrix(); }
    update();
    fit(true);
    requestRender();
    return api;
  }

  window.ProjectileThree = { create: create };
})();
