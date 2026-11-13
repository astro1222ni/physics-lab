/*
 * beats-tuning-3d.js — 「拍頻與調音」的 3D 拍的螺旋（three.js）
 *
 * 由 js/beats-tuning.js 在學生按「3D 拍的螺旋」時才載入（three.js 也是那時才以 import() 載入）；切回 2D 時整個釋放。
 * 用法：window.BeatsTuning3D.create({ THREE, OrbitControls }, 容器, bridge) → { active, frame, rebuild, onTheme, resetCamera, dispose }
 *
 * 畫的是什麼：
 *   打拍的那一對泛音，參考音那根是長度 a 的相量，待調音那根是長度 b 的相量。改用「跟著參考泛音一起轉」的座標看，
 *   參考相量固定不動（沿 +Z），待調相量以相對角速度 2π·s 繞著參考相量的尖端轉（s = n·f2 − m·f1，有正負號）。
 *   兩者相加的尖端 z(t) = a + b·e^(i·2π·s·t) 沿著時間軸（X）展開成一條螺旋；它離時間軸的距離 |z| 就是響度包絡 A(t)。
 *   順著時間往右看：s > 0（寬、待調音偏高）逆時針轉，s < 0（窄、偏低）順時針轉；s = 0 時螺旋拉成一條直線（不拍）。
 *   這是 2D 包絡看不到的：包絡只看得到 |z|，看不出偏高還是偏低。
 *   地板上平放的是同一段時間的包絡 ±|z|（就是 2D 的「拍：響度的起伏」圖）。
 *   時間窗、相位和 2D 一樣（bridge.data()），所有數值由 beats-tuning-core.js 算出，3D 只負責畫。
 */
(function () {
  'use strict';
  const FONT = 'system-ui, -apple-system, "Segoe UI", "Noto Sans TC", "PingFang TC", sans-serif';
  const PI = Math.PI, TAU = 2 * PI, DEG = PI / 180;
  const LEN = 6;             // 時間軸長度（一個時間窗）
  const RAD = 1.15;          // 響度最大（a + b）時的半徑

  function create(lib, host, B) {
    const THREE = lib.THREE;
    const T = B.T, D = B.D, Core = B.Core;
    let C = B.colors();
    const col = function (k) { return new THREE.Color(C[k] || k); };
    const isDark = function () { return !!D.dark; };

    // ---------- 畫布與資訊列 ----------
    const wrap = document.createElement('div');
    wrap.className = 'c3-wrap';
    const canvas = document.createElement('canvas');
    canvas.tabIndex = 0;
    wrap.appendChild(canvas);
    const hud = document.createElement('div');
    hud.className = 'c3-hud';
    hud.setAttribute('aria-hidden', 'true');
    hud.innerHTML = '<div class="tl"><span data-k="pair"></span><span data-k="turn"></span><span class="m" data-k="win"></span></div><div class="bl"><span class="m" data-k="tip"></span></div>';
    wrap.appendChild(hud);
    host.appendChild(wrap);
    const hudEl = {}, hudLast = {};
    hud.querySelectorAll('[data-k]').forEach(function (e) { hudEl[e.getAttribute('data-k')] = e; });
    function setHud(k, h, cls) {
      const key = (cls || '') + '|' + h;
      if (hudLast[k] !== key) { hudLast[k] = key; hudEl[k].innerHTML = h; hudEl[k].className = cls || ''; }
    }
    function updateAria() {
      canvas.setAttribute('aria-label', T('拍的 3D 螺旋：時間從左往右，打拍那一對泛音的相量相加，尖端畫出螺旋，離中心軸的距離就是響度；逆時針轉代表待調音偏高，順時針代表偏低。拖曳旋轉，滾輪或雙指縮放，方向鍵也可以轉動。',
        '3D beat spiral: time runs from left to right; the phasors of the beating pair of overtones are added and the tip traces a spiral whose distance from the axis is the loudness; anticlockwise means the tuned note is sharp, clockwise flat. Drag to rotate, scroll or pinch to zoom, or use the arrow keys.'));
    }
    updateAria();

    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true }); }
    catch (e) { wrap.remove(); throw e; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 16 / 10, 0.05, 500);

    // ---------- 視角控制 ----------
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.rotateSpeed = 0.85;
    controls.screenSpacePanning = true;

    // ---------- 光線與環境反光 ----------
    scene.add(new THREE.HemisphereLight(0xffffff, 0x3a4250, 0.85));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
    keyLight.position.set(-2, 8, 5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -4.5; keyLight.shadow.camera.right = 4.5;
    keyLight.shadow.camera.top = 3; keyLight.shadow.camera.bottom = -3;
    keyLight.shadow.camera.near = 1; keyLight.shadow.camera.far = 20;
    keyLight.shadow.radius = 4;
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.45);
    fillLight.position.set(5, 2, -4);
    scene.add(fillLight);
    const pmrem = new THREE.PMREMGenerator(renderer);
    let envRT = null;
    function buildEnv() {
      if (envRT) { envRT.dispose(); envRT = null; }
      const s = new THREE.Scene();
      const g = new THREE.SphereGeometry(10, 32, 16);
      const pos = g.attributes.position, cols = new Float32Array(pos.count * 3);
      const top = new THREE.Color(isDark() ? 0x5d6a80 : 0xffffff), bot = new THREE.Color(isDark() ? 0x0a0d12 : 0x7d8794);
      const c = new THREE.Color();
      for (let i = 0; i < pos.count; i++) {
        const u = Math.max(0, Math.min(1, (pos.getY(i) / 10 + 1) / 2));
        c.copy(bot).lerp(top, Math.pow(u, 0.75));
        cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      s.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
      envRT = pmrem.fromScene(s, 0.035);
      s.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      scene.environment = envRT.texture;
    }

    // ---------- 共用工具 ----------
    function disposeObject(obj) {
      obj.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); });
      });
    }
    function clearGroup(g) { g.children.slice().forEach(function (o) { g.remove(o); disposeObject(o); }); }
    function mat(color, opt) {
      opt = opt || {};
      return new THREE.MeshStandardMaterial({
        color: color, roughness: opt.rough == null ? 0.35 : opt.rough, metalness: opt.metal == null ? 0.1 : opt.metal,
        emissive: opt.emissive || 0x000000, emissiveIntensity: opt.ei == null ? 1 : opt.ei,
        transparent: opt.opacity != null, opacity: opt.opacity == null ? 1 : opt.opacity, depthWrite: opt.opacity == null || opt.opacity > 0.9,
        side: opt.side || THREE.FrontSide
      });
    }
    function fsF() { return Math.max(1, Math.min(1.45, B.fs ? B.fs() : 1)); }
    /** 文字小牌（畫布貼圖的 Sprite，永遠面向鏡頭）；sub 是接在後面的下標，tail 是下標後面的字 */
    function label(text, color, h, weight, sub, tail) {
      const c = document.createElement('canvas'), g = c.getContext('2d');
      const px = 56, font = (weight || 600) + ' ' + px + 'px ' + FONT, fontS = (weight || 600) + ' ' + Math.round(px * 0.66) + 'px ' + FONT;
      g.font = font;
      const w1 = g.measureText(text).width, w3 = tail ? g.measureText(tail).width : 0;
      g.font = fontS;
      const w2 = sub ? g.measureText(sub).width + 3 : 0;
      const w = Math.ceil(w1 + w2 + w3) + 28;
      c.width = w; c.height = 84;
      g.lineJoin = 'round'; g.lineWidth = 12; g.strokeStyle = D.alpha(C['canvas-bg'], 0.9);
      g.textAlign = 'left'; g.textBaseline = 'middle';
      g.font = font; g.strokeText(text, 14, 42); g.fillStyle = color; g.fillText(text, 14, 42);
      if (sub) { g.font = fontS; g.strokeText(sub, 14 + w1 + 2, 56); g.fillText(sub, 14 + w1 + 2, 56); }
      if (tail) { g.font = font; g.strokeText(tail, 14 + w1 + w2, 42); g.fillText(tail, 14 + w1 + w2, 42); }
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
      s.renderOrder = 10;
      const hh = h * fsF();
      s.scale.set(hh * w / 84, hh, 1);
      return s;
    }
    /** 箭頭（圓柱＋圓錐），建立一次，之後用 set(p0, p1) 移動 */
    const UP = new THREE.Vector3(0, 1, 0);
    function makeArrow(color, r) {
      const m = mat(color, { emissive: new THREE.Color(color), ei: 0.18, rough: 0.3 });
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 10), m);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r * 2.6, 1, 16), m);
      shaft.castShadow = true; cone.castShadow = true;
      const g = new THREE.Group();
      g.add(shaft, cone);
      const d = new THREE.Vector3();
      g.userData.set = function (p0, p1) {
        d.subVectors(p1, p0);
        const len = d.length();
        g.visible = len > 1e-3;
        if (!g.visible) return;
        const head = Math.min(len * 0.4, r * 6);
        shaft.scale.y = len - head; shaft.position.y = (len - head) / 2;
        cone.scale.y = head; cone.position.y = len - head / 2;
        g.position.copy(p0);
        g.quaternion.setFromUnitVectors(UP, d.normalize());
      };
      return g;
    }

    // ---------- 物件 ----------
    const gBase = new THREE.Group(), gHelix = new THREE.Group(), gCur = new THREE.Group(), gLabels = new THREE.Group();
    scene.add(gBase, gHelix, gCur, gLabels);
    const FLOOR = -RAD - 0.45;
    const X = function (u) { return (u - 0.5) * LEN; };      // u = 時間窗裡的位置 0–1
    let dat = null, R = 1, built = { ws: -1, key: '' };

    function buildBase() {
      clearGroup(gBase);
      const slab = new THREE.Mesh(new THREE.BoxGeometry(LEN + 0.8, 0.05, 2 * RAD + 1.2), mat(isDark() ? D.shade(C.surface, 0.06) : D.shade(C.surface, -0.03), { rough: 0.85, metal: 0 }));
      slab.position.y = FLOOR - 0.03;
      slab.receiveShadow = true;
      gBase.add(slab);
      // 時間軸（中心軸）與箭頭
      const axMat = mat(col('muted'), { rough: 0.5 });
      const ax = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, LEN + 0.3, 8), axMat);
      ax.rotation.z = PI / 2;
      gBase.add(ax);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.16, 14), axMat);
      tip.rotation.z = -PI / 2; tip.position.x = LEN / 2 + 0.23;
      gBase.add(tip);
      // 地板上的時間刻度
      const tickMat = new THREE.LineBasicMaterial({ color: col('muted'), transparent: true, opacity: 0.5 });
      for (let i = 0; i <= 10; i++) {
        const x = X(i / 10), z0 = RAD + 0.35;
        gBase.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, FLOOR + 0.003, z0), new THREE.Vector3(x, FLOOR + 0.003, z0 + (i % 5 ? 0.06 : 0.12))]), tickMat));
      }
      // 地板上的中線（包絡的 0）
      gBase.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(X(0), FLOOR + 0.004, 0), new THREE.Vector3(X(1), FLOOR + 0.004, 0)]),
        new THREE.LineBasicMaterial({ color: col('muted'), transparent: true, opacity: 0.35 })));
    }

    // 響度 → 顏色（暗 → 燈的顏色）
    const cLo = new THREE.Color(), cHi = new THREE.Color(), cTmp = new THREE.Color();
    function loudColor(u, out) { return out.copy(cLo).lerp(cHi, Math.max(0, Math.min(1, u))); }
    function setLoudColors() {
      cHi.copy(col('bt-lamp'));
      cLo.copy(col('bt-ref')).lerp(new THREE.Color(isDark() ? 0x1e293b : 0xcbd5e1), 0.35);
    }

    /** 時間窗裡第 u（0–1）處的相量尖端 */
    function tipAt(u) {
      const t = dat.ws + u * dat.win;
      const th = dat.thNow + TAU * dat.s * (t - dat.tPlay);
      const re = dat.a + dat.b * Math.cos(th), im = dat.b * Math.sin(th);
      return { x: X(u), y: R * im, z: R * re, len: Math.hypot(re, im), th: th };
    }
    function loudU(len) { const lo = Math.abs(dat.a - dat.b), hi = dat.a + dat.b; return (len - lo) / Math.max(1e-9, hi - lo); }

    function buildHelix() {
      clearGroup(gHelix); clearGroup(gLabels);
      dat = B.data();
      built = { ws: dat.ws, key: '' };
      setLoudColors();
      // 文字：時間軸
      const lt = label(T('時間 t', 'time t'), C.muted, 0.17, 700);
      lt.position.set(LEN / 2 + 0.35, 0.22, 0);
      gLabels.add(lt);
      const l0 = label('0', C.muted, 0.14, 600), l1 = label(B.fx(dat.win, dat.win < 1 ? 2 : 0) + T(' 秒', ' s'), C.muted, 0.14, 600);
      l0.position.set(X(0), FLOOR + 0.05, RAD + 0.72); l1.position.set(X(1), FLOOR + 0.05, RAD + 0.72);
      gLabels.add(l0, l1);
      if (!dat.hasPair) {
        const m = label(T('純音：沒有重合的泛音，沒有相量可以相加', 'Pure tones: no coinciding overtones, nothing to add'), C.muted, 0.18, 700);
        m.position.set(0, 0.6, 0);
        gLabels.add(m);
        buildCursor();
        placeCursor();
        return;
      }
      R = RAD / (dat.a + dat.b);
      // 螺旋（相量尖端的軌跡）：取樣點數隨圈數增加
      const turns = Math.abs(dat.s) * dat.win;
      const N = Math.min(2400, Math.max(240, Math.ceil(turns * 72)));
      const pts = [];
      for (let i = 0; i <= N; i++) { const p = tipAt(i / N); pts.push(new THREE.Vector3(p.x, p.y, p.z)); }
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      const RS = 8;
      const tube = new THREE.TubeGeometry(curve, N, 0.028, RS, false);
      const cols = new Float32Array(tube.attributes.position.count * 3);
      for (let i = 0; i <= N; i++) {
        loudColor(loudU(tipAt(i / N).len), cTmp);
        for (let j = 0; j <= RS; j++) { const k = (i * (RS + 1) + j) * 3; cols[k] = cTmp.r; cols[k + 1] = cTmp.g; cols[k + 2] = cTmp.b; }
      }
      tube.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      const helix = new THREE.Mesh(tube, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.15, emissive: col('bt-lamp'), emissiveIntensity: isDark() ? 0.12 : 0.04 }));
      helix.castShadow = true;
      gHelix.add(helix);
      // 輻條：每 1/48 個時間窗，從中心軸連到螺旋（長度 = 響度）
      const SP = 48, sp = new Float32Array(SP * 6 + 6), sc = new Float32Array(SP * 6 + 6);
      for (let i = 0; i <= SP; i++) {
        const p = tipAt(i / SP), u = loudU(p.len);
        loudColor(u, cTmp);
        sp.set([p.x, 0, 0, p.x, p.y, p.z], i * 6);
        sc.set([cTmp.r, cTmp.g, cTmp.b, cTmp.r, cTmp.g, cTmp.b], i * 6);
      }
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
      sg.setAttribute('color', new THREE.BufferAttribute(sc, 3));
      gHelix.add(new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: isDark() ? 0.55 : 0.6 })));
      // 參考相量尖端的軌跡（在轉動的座標裡固定不動）：一條虛線
      const rail = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(X(0), 0, R * dat.a), new THREE.Vector3(X(1), 0, R * dat.a)]),
        new THREE.LineDashedMaterial({ color: col('bt-ref'), transparent: true, opacity: 0.55, dashSize: 0.1, gapSize: 0.07 }));
      rail.computeLineDistances();
      gHelix.add(rail);
      // 地板上的包絡帶：±|z|（就是 2D 的包絡圖平放在地上）
      const M = Math.min(1200, Math.max(200, Math.ceil(turns * 40))), pos = new Float32Array((M + 1) * 6), idx = [];
      for (let i = 0; i <= M; i++) {
        const p = tipAt(i / M), w = R * p.len;
        pos.set([p.x, FLOOR + 0.006, -w, p.x, FLOOR + 0.006, w], i * 6);
        if (i < M) { const a = 2 * i; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
      }
      const fg = new THREE.BufferGeometry();
      fg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      fg.setIndex(idx);
      gHelix.add(new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ color: col('bt-sum'), transparent: true, opacity: isDark() ? 0.32 : 0.26, side: THREE.DoubleSide, depthWrite: false })));
      const edge = function (sgn) {
        const p = [];
        for (let i = 0; i <= M; i++) { const q = tipAt(i / M); p.push(new THREE.Vector3(q.x, FLOOR + 0.008, sgn * R * q.len)); }
        return new THREE.Line(new THREE.BufferGeometry().setFromPoints(p), new THREE.LineBasicMaterial({ color: col('bt-sum') }));
      };
      gHelix.add(edge(1), edge(-1));
      const lf = label(T('地板：響度包絡 ±|z|', 'floor: envelope ±|z|'), C['bt-sum'], 0.15, 700);
      lf.position.set(X(0) + 0.9, FLOOR + 0.06, -RAD - 0.35);
      gLabels.add(lf);
      buildCursor();
      placeCursor();
    }

    // 目前時刻的切片：參考相量、待調相量、合成相量、待調相量尖端能走的圓（建立一次，每一幀只移動）
    let cur = null;
    function buildCursor() {
      clearGroup(gCur);
      cur = null;
      if (!dat || !dat.hasPair) return;
      const an = dat.an;
      cur = {
        ra: makeArrow(C['bt-ref'], 0.022), rb: makeArrow(C['bt-tun'], 0.018), rz: makeArrow(C.accent, 0.026),
        ring: new THREE.Mesh(new THREE.TorusGeometry(R * dat.b, 0.006, 6, 64), mat(C['bt-tun'], { opacity: 0.5 })),
        disk: new THREE.Mesh(new THREE.CircleGeometry(R * (dat.a + dat.b) + 0.05, 64), new THREE.MeshBasicMaterial({ color: col('text'), transparent: true, opacity: isDark() ? 0.05 : 0.04, side: THREE.DoubleSide, depthWrite: false })),
        ballMat: mat(C['bt-lamp'], { emissive: col('bt-lamp'), ei: 0.4, metal: 0.2, rough: 0.25 }),
        la: label(an.m > 1 ? an.m + 'f' : 'f', C['bt-ref'], 0.16, 700, '1'),
        lb: label(an.n > 1 ? an.n + 'f' : 'f', C['bt-tun'], 0.16, 700, '2'),
        lr: label(T('|z| = 響度', '|z| = loudness'), C.accent, 0.15, 700)
      };
      cur.ring.rotation.y = PI / 2; cur.disk.rotation.y = PI / 2;
      cur.ball = new THREE.Mesh(new THREE.SphereGeometry(0.06, 20, 14), cur.ballMat);
      cur.ball.castShadow = true;
      gCur.add(cur.ra, cur.rb, cur.rz, cur.ring, cur.disk, cur.ball, cur.la, cur.lb, cur.lr);
    }
    const vO = new THREE.Vector3(), vA = new THREE.Vector3(), vQ = new THREE.Vector3();
    function placeCursor() {
      if (cur && dat && dat.hasPair) {
        const u = dat.playing ? Math.max(0, Math.min(1, (dat.tPlay - dat.ws) / dat.win)) : 0;
        const p = tipAt(u), x = p.x;
        vO.set(x, 0, 0); vA.set(x, 0, R * dat.a); vQ.set(x, p.y, p.z);
        cur.ra.userData.set(vO, vA); cur.rb.userData.set(vA, vQ); cur.rz.userData.set(vO, vQ);
        cur.ring.position.copy(vA);
        cur.disk.position.copy(vO);
        const lu = loudU(p.len);
        loudColor(lu, cTmp);
        cur.ballMat.color.copy(cTmp); cur.ballMat.emissive.copy(cTmp); cur.ballMat.emissiveIntensity = 0.2 + 0.6 * lu;
        cur.ball.position.copy(vQ);
        cur.la.position.copy(vA).add(new THREE.Vector3(0, -0.2, 0.14));
        cur.lb.position.copy(vQ).add(new THREE.Vector3(0, 0.2, 0.16));
        cur.lr.position.copy(vO).lerp(vQ, 0.5).add(new THREE.Vector3(0, 0.16, -0.22));
      }
      setHuds();
      requestRender();
    }
    function setHuds() {
      const d = dat;
      if (!d || !d.hasPair) {
        setHud('pair', T('純音的', 'Pure-tone ') + B.ivName(d ? d.an.iv : 'unison') + T('：沒有打拍的泛音', ': no beating overtones'), 'm');
        setHud('turn', ''); setHud('win', '');
      } else {
        const a = d.an;
        setHud('pair', (a.m > 1 ? a.m : '') + 'f<sub>1</sub>' + T('（長 ', ' (length ') + '1/' + a.m + T('）＋ ', ') + ') + (a.n > 1 ? a.n : '') + 'f<sub>2</sub>' + T('（長 ', ' (length ') + '1/' + a.n + T('）', ')'));
        if (Math.abs(d.s) < 1e-9) setHud('turn', T('不轉：螺旋拉成直線，不拍', 'No turning: the spiral is a straight line, no beats'), 'ok');
        else setHud('turn', T('每秒轉 ' + B.fx(Math.abs(d.s), 2) + ' 圈，', B.fx(Math.abs(d.s), 2) + ' turns a second, ') +
          (d.s > 0 ? T('逆時針 → 偏高（寬）', 'anticlockwise → sharp (wide)') : T('順時針 → 偏低（窄）', 'clockwise → flat (narrow)')), d.s > 0 ? 'w' : '');
        setHud('win', T('時間窗 ', 'Window ') + B.fx(d.win, d.win < 1 ? 2 : 0) + T(' 秒（順著時間往右看轉向）', ' s (look along time to see the turning)'), 'm');
      }
      setHud('tip', d && d.playing ? T('播放中：切片跟著時間走，小球離軸的距離就是此刻的響度。', 'Playing: the slice moves with time; the ball’s distance from the axis is the loudness now.')
        : T('按「▶ 播放」切片會跟著時間走。調音旋鈕改變螺旋的轉速與轉向。', 'Press “▶ Play” and the slice moves with time. The tuning knob changes how fast and which way the spiral turns.'), 'm');
    }

    // ---------- 視角 ----------
    let lastAspect = 0;
    // 直式畫面從斜前方沿著時間軸看（螺旋看起來更像螺旋，也放得下）；橫式從側前方看
    function viewDir() {
      return (camera.aspect < 1.2 ? new THREE.Vector3(-0.95, 0.5, 0.62) : new THREE.Vector3(-0.42, 0.42, 1)).normalize();
    }
    /** 讓整個場景（時間軸、螺旋、地板）剛好放進畫面：把盒子的八個角投影到相機的左右、上下方向 */
    function fitDistance(dir, target) {
      const vf = camera.fov * DEG;
      const tv = Math.tan(vf / 2) * 0.92, th = Math.tan(vf / 2) * camera.aspect * 0.92;
      const fwd = dir.clone().negate();
      const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
      const up = new THREE.Vector3().crossVectors(right, fwd);
      const FL = -RAD - 0.45;
      let d = 2;
      [-LEN / 2 - 0.3, LEN / 2 + 0.8].forEach(function (x) {
        [FL, RAD + 0.35].forEach(function (y) {
          [-RAD - 0.35, RAD + 0.9].forEach(function (z) {
            const p = new THREE.Vector3(x, y, z).sub(target);
            const depth = p.dot(dir);
            d = Math.max(d, depth + Math.abs(p.dot(right)) / th, depth + Math.abs(p.dot(up)) / tv);
          });
        });
      });
      return d;
    }
    function resetCamera() {
      controls.target.set(0, -0.15, 0);
      // 盒子的角落多半是空的地板，橫式畫面再拉近一點，讓螺旋大一些
      const dir = viewDir(), d = fitDistance(dir, controls.target) * (camera.aspect < 1.2 ? 0.92 : 0.8);
      camera.position.copy(controls.target).addScaledVector(dir, d);
      controls.minDistance = 1.5;
      controls.maxDistance = d * 3 + 6;
      camera.near = 0.05; camera.far = d * 20 + 50;
      camera.updateProjectionMatrix();
      controls.update();
      requestRender();
    }

    // ---------- 繪製 ----------
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
    function resize3() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (Math.abs(camera.aspect - lastAspect) > 1e-3) { lastAspect = camera.aspect; resetCamera(); }
      renderNow();
    }
    const ro = window.ResizeObserver ? new ResizeObserver(function () { resize3(); }) : null;
    if (ro) ro.observe(canvas); else window.addEventListener('resize', resize3);
    controls.addEventListener('change', requestRender);
    const onVisible = function () { if (!document.hidden) requestRender(); };
    document.addEventListener('visibilitychange', onVisible);
    canvas.addEventListener('webglcontextlost', function (ev) {
      ev.preventDefault();
      if (!api.active) return;
      if (B.onContextLost) B.onContextLost();
    });
    // 鍵盤：方向鍵轉動視角
    canvas.addEventListener('keydown', function (ev) {
      const step = (ev.shiftKey ? 15 : 5) * DEG;
      const off = camera.position.clone().sub(controls.target);
      const sph = new THREE.Spherical().setFromVector3(off);
      let used = true;
      if (ev.key === 'ArrowLeft') sph.theta -= step;
      else if (ev.key === 'ArrowRight') sph.theta += step;
      else if (ev.key === 'ArrowUp') sph.phi = Math.max(0.05, sph.phi - step);
      else if (ev.key === 'ArrowDown') sph.phi = Math.min(PI - 0.05, sph.phi + step);
      else used = false;
      if (!used) return;
      ev.preventDefault();
      camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(sph));
      controls.update();
      requestRender();
    });

    function buildAll() {
      buildBase();
      buildHelix();
    }

    const api = {
      active: true,
      /** 每一幀（播放中）：移動切片；進到下一個時間窗就重畫螺旋 */
      frame: function () {
        const d = B.data();
        if (d.ws !== built.ws || d.playing !== (dat && dat.playing)) { buildHelix(); return; }
        dat = d;
        placeCursor();
      },
      /** 設定改變：重畫螺旋 */
      rebuild: function () { buildHelix(); },
      onTheme: function () {
        C = B.colors();
        buildEnv();
        Object.keys(hudLast).forEach(function (k) { delete hudLast[k]; });
        updateAria();
        buildAll();
        requestRender();
      },
      resetCamera: function () { resetCamera(); },
      dispose: function () {
        api.active = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        document.removeEventListener('visibilitychange', onVisible);
        controls.dispose();
        disposeObject(scene);
        if (envRT) envRT.dispose();
        pmrem.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        wrap.remove();
      }
    };

    buildEnv();
    buildAll();
    const w0 = canvas.clientWidth, h0 = canvas.clientHeight;
    if (w0 && h0) {
      renderer.setSize(w0, h0, false);
      camera.aspect = w0 / h0;
      camera.updateProjectionMatrix();
      lastAspect = camera.aspect;
    }
    resetCamera();
    return api;
  }

  window.BeatsTuning3D = { create: create };
})();
