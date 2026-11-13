/*
 * pentatonic-3d.js — 「五聲音階：宮商角徵羽」的 3D 檢視（three.js）
 *
 * 由 js/pentatonic.js 在使用者按「3D 弦與五度螺旋」時才載入（three.js 也是那時才以 import() 載入）；切回 2D 時整個釋放。
 * 用法：window.Pentatonic3D.create({ THREE, OrbitControls }, 容器, bridge) → { active, frame, rebuild, onTheme, resetCamera, dispose }
 *
 * 左邊：三分損益產生的弦，由低音到高音並排立在琴橋上，每根的高度 ∝ 弦長（五聲的五根像一架小豎琴）。
 * 右邊：五度螺旋。地板是 12 格鐘面（和 2D 鐘面同一個方向：C 在後方，從上往下看順時針）；
 *   第 k 個產生的音，角度 = 宮 + k 個純五度（每個 701.955 音分，一圈 1200 音分），高度 = 第 k 層。
 *   每個球都有一條垂直線落到地板，地板上的落點就是它在八度裡的位置；半音（地板上的弧）與第 13 個音的畢氏音差都畫在地板上。
 * 所有數值都由 pentatonic-core.js 算出（bridge.data()），3D 只負責畫。
 */
(function () {
  'use strict';
  const FONT = 'system-ui, -apple-system, "Segoe UI", "Noto Sans TC", "PingFang TC", sans-serif';
  const PI = Math.PI, TAU = 2 * PI, DEG = PI / 180;
  const FIFTH_CENTS = 1200 * Math.log2(1.5);
  const RAD = 1;              // 螺旋的半徑
  const SPX = 1.45;           // 螺旋的中心（x）
  const HPX = -1.75;          // 豎琴的中心（x）
  const HMAX = 2.1;           // 最長的弦的高度
  const VIEW = { x: 0.1, y: 0.5, z: 1 };

  function create(lib, host, B) {
    const THREE = lib.THREE;
    const T = B.T, D = B.D;
    let C = B.colors();
    const col = function (k) { return new THREE.Color(C[k] || k); };
    const isDark = function () { return !!D.dark; };

    // ---------- 畫布與資訊列 ----------
    const wrap = document.createElement('div');
    wrap.className = 't3-wrap';
    const canvas = document.createElement('canvas');
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', T('3D 檢視：左邊是三分損益產生的弦，由低到高並排，高度就是弦長；右邊是五度螺旋，每個新的音轉一個純五度、升高一層，地板是 12 格鐘面。拖曳旋轉，滾輪或雙指縮放，方向鍵也可以轉動。',
      '3D view: on the left, the strings made by the rule stand from low to high, each as tall as its length; on the right, the spiral of fifths, where each new note turns one pure fifth and rises one storey above a 12-cell clock. Drag to rotate, scroll or pinch to zoom, or use the arrow keys.'));
    wrap.appendChild(canvas);
    const hud = document.createElement('div');
    hud.className = 't3-hud';
    hud.setAttribute('aria-hidden', 'true');
    hud.innerHTML = '<div class="tl"><span data-k="nm"></span><span class="m" data-k="cur"></span><span class="x" data-k="lo"></span></div><div class="bl"><span class="m" data-k="tip"></span></div>';
    wrap.appendChild(hud);
    host.appendChild(wrap);
    const hudEl = {}, hudLast = {};
    hud.querySelectorAll('[data-k]').forEach(function (e) { hudEl[e.getAttribute('data-k')] = e; });
    function setHud(k, h) { if (hudLast[k] !== h) { hudLast[k] = h; hudEl[k].textContent = h; } }

    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true }); }
    catch (e) { wrap.remove(); throw e; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    const VIEW_DIR = new THREE.Vector3(VIEW.x, VIEW.y, VIEW.z).normalize();
    const camera = new THREE.PerspectiveCamera(34, 4 / 3, 0.05, 200);

    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.rotateSpeed = 0.85;
    controls.screenSpacePanning = true;

    // ---------- 光線與環境反光 ----------
    scene.add(new THREE.HemisphereLight(0xffffff, 0x3a4250, 0.9));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
    keyLight.position.set(2, 8, 5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -4.5; keyLight.shadow.camera.right = 4.5; keyLight.shadow.camera.top = 4; keyLight.shadow.camera.bottom = -4;
    keyLight.shadow.camera.near = 1; keyLight.shadow.camera.far = 22;
    keyLight.shadow.radius = 4;
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.45);
    fillLight.position.set(-5, 3, -4);
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
    /** 鐘面上 c 音分（從 C 算起，可以超過 1200）的方向、半徑 r、高度 y 的位置（以螺旋中心為原點） */
    function S(cents, y, r) {
      const a = cents / 1200 * TAU, rr = r == null ? RAD : r;
      return new THREE.Vector3(SPX + rr * Math.sin(a), y, -rr * Math.cos(a));
    }
    function mat(color, opt) {
      opt = opt || {};
      return new THREE.MeshStandardMaterial({
        color: color, roughness: opt.rough == null ? 0.35 : opt.rough, metalness: opt.metal == null ? 0.1 : opt.metal,
        emissive: opt.emissive || 0x000000, emissiveIntensity: opt.ei == null ? 1 : opt.ei, side: opt.side || THREE.FrontSide,
        transparent: opt.opacity != null, opacity: opt.opacity == null ? 1 : opt.opacity, depthWrite: opt.opacity == null || opt.opacity > 0.9
      });
    }
    function sphere(p, r, material) { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), material); m.position.copy(p); m.castShadow = true; return m; }
    function rod(a, b, r, material) {
      const d = new THREE.Vector3().subVectors(b, a), len = d.length();
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, Math.max(1e-4, len), 10, 1, true), material);
      m.position.copy(a).addScaledVector(d, 0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      m.castShadow = true;
      return m;
    }
    function tubeThrough(points, r, material) {
      if (points.length < 2) return null;
      const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
      const m = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(8, points.length * 2), r, 8, false), material);
      m.castShadow = true;
      return m;
    }
    function fsF() { return Math.max(1, Math.min(1.45, B.fs ? B.fs() : 1)); }
    function narrow() { const w = canvas.clientWidth; return !!w && w < 560; }
    function label(text, color, h, weight) {
      const c = document.createElement('canvas'), g = c.getContext('2d');
      const px = 56, font = (weight || 600) + ' ' + px + 'px ' + FONT;
      g.font = font;
      const w = Math.ceil(g.measureText(text).width) + 28;
      c.width = w; c.height = 80;
      g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineJoin = 'round'; g.lineWidth = 12; g.strokeStyle = D.alpha(C['canvas-bg'], 0.9); g.strokeText(text, w / 2, 42);
      g.fillStyle = color; g.fillText(text, w / 2, 42);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      const hh = h * fsF() * (narrow() ? 1.5 : 1);
      s.scale.set(hh * w / 80, hh, 1);
      return s;
    }
    const roleColor = function (x) { return x.idx >= 5 ? C['pt-extra'] : x.idx === 0 ? C['pt-gong'] : C['pt-poly']; };

    // ---------- 物件 ----------
    const gHarp = new THREE.Group(), gSpiral = new THREE.Group(), gLabels = new THREE.Group();
    scene.add(gHarp, gSpiral, gLabels);
    let fitC = new THREE.Vector3(0, 1.1, 0), fitH = 3.6, fitW = 6.4;

    function build() {
      [gHarp, gSpiral, gLabels].forEach(clearGroup);
      const d = B.data(), c = d.c, gong = d.gong;
      const n = c.notes.length;
      const playIdx = d.playing ? d.playing.chainIdx : -1;
      const nw = narrow();
      const hStep = 0.17;
      const topY = 0.25 + (B.P.GEN_MAX - 1) * hStep;
      fitC.set((HPX + SPX) / 2 + 0.1, topY / 2, 0.1); fitH = topY + 1.0; fitW = (SPX + RAD + 0.6) - (HPX - 1.35) + (nw ? 0.6 : 0);

      // ===== 左：豎琴 =====
      const maxLen = c.order === 'sun' ? c.L0 : c.L0 * 4 / 3;
      const sc = HMAX / maxLen;
      const sx = Math.min(0.3, 2.5 / Math.max(5, n));
      const sorted = c.sorted;
      const harpW = Math.max(5, n) * sx;
      const x0 = HPX - (sorted.length - 1) * sx / 2;
      const wood = mat(C['pt-wood'], { rough: 0.55, metal: 0.05 });
      const bridgeM = new THREE.Mesh(new THREE.BoxGeometry(harpW + 0.3, 0.12, 0.4), wood);
      bridgeM.position.set(HPX, -0.06, 0); bridgeM.castShadow = true; bridgeM.receiveShadow = true;
      gHarp.add(bridgeM);
      // 八度範圍：最長的弦與它的一半
      const bandM = mat(C.accent, { opacity: isDark() ? 0.12 : 0.08, side: THREE.DoubleSide, rough: 0.8 });
      const band = new THREE.Mesh(new THREE.PlaneGeometry(harpW + 0.3, HMAX / 2), bandM);
      band.position.set(HPX, HMAX * 0.75, -0.16);
      gHarp.add(band);
      const lineM = mat(C.muted, { opacity: 0.5 });
      [HMAX / 2, HMAX].forEach(function (y) { gHarp.add(rod(new THREE.Vector3(HPX - harpW / 2 - 0.15, y, -0.16), new THREE.Vector3(HPX + harpW / 2 + 0.15, y, -0.16), 0.006, lineM)); });
      sorted.forEach(function (x, j) {
        const px = x0 + j * sx, h = x.len.value * sc;
        const isT = x.idx === d.tonicIdx, on = x.idx === playIdx;
        const cc = roleColor(x);
        const sm = mat(on ? C.accent : cc, { emissive: on ? col('accent') : new THREE.Color(cc), ei: on ? 0.7 : 0.15, metal: 0.4, rough: 0.3 });
        gHarp.add(rod(new THREE.Vector3(px, 0, 0), new THREE.Vector3(px, h, 0), x.idx === 0 ? 0.022 : 0.016, sm));
        gHarp.add(sphere(new THREE.Vector3(px, h, 0), isT ? 0.065 : 0.05, isT ? mat(C['pt-tonic'], { emissive: col('pt-tonic'), ei: 0.3 }) : sm));
        const lt = label(B.fmtLen(x.len.value), x.int ? C.text : C['pt-extra'], 0.15, 700);
        lt.position.set(px, h + 0.17 + ((nw || n > 7) && j % 2 ? 0.17 : 0), 0);
        gLabels.add(lt);
        const ln = label(x.role ? B.chainRole(x) : String(x.idx + 1), isT ? C['pt-tonic'] : cc, 0.15, 700);
        ln.position.set(px, -0.24 - ((nw || n > 7) && j % 2 ? 0.17 : 0), 0.22);
        gLabels.add(ln);
      });
      const ht = label(T('弦（低 → 高）', 'Strings (low → high)'), C.muted, 0.15, 600);
      ht.position.set(HPX, -0.62, 0.22);
      gLabels.add(ht);

      // ===== 右：五度螺旋 =====
      const gongC = gong * 100;
      const floor = new THREE.Mesh(new THREE.CylinderGeometry(RAD + 0.32, RAD + 0.4, 0.1, 64), mat(D.mix(C.surface, C['canvas-bg'], 0.3), { rough: 0.7, metal: 0.05 }));
      floor.position.set(SPX, -0.06, 0);
      floor.receiveShadow = true;
      gSpiral.add(floor);
      const tickM = mat(C.muted, { rough: 0.6 });
      const used = {};
      c.notes.forEach(function (x) { const k = (gong + x.pcG) % 12; if (!used[k]) used[k] = x; });
      for (let pc = 0; pc < 12; pc++) {
        const x = used[pc];
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, 0.16), x ? mat(roleColor(x)) : tickM);
        m.position.copy(S(pc * 100, 0.0, RAD + 0.2));
        m.rotation.y = -pc / 12 * TAU;
        gSpiral.add(m);
        const s = label(B.pcName(pc), x ? C.text : C.muted, 0.16, x ? 700 : 500);
        s.position.copy(S(pc * 100, 0.06, RAD + 0.47));
        gLabels.add(s);
      }
      // 螺旋管
      const pts = [];
      const posOf = function (i) { return { a: gongC + i * FIFTH_CENTS, y: 0.25 + i * hStep }; };
      for (let i = 0; i < n; i++) {
        const p = posOf(i);
        pts.push(S(p.a, p.y));
        if (i < n - 1) {
          const q = posOf(i + 1);
          for (let k = 1; k < 8; k++) { const u = k / 8; pts.push(S(p.a + (q.a - p.a) * u, p.y + (q.y - p.y) * u)); }
        }
      }
      const tube = tubeThrough(pts, 0.012, mat(D.mix(C['pt-poly'], C.muted, 0.35), { opacity: 0.8, rough: 0.4 }));
      if (tube) gSpiral.add(tube);
      // 球、垂直線、地板上的落點
      const dropM = mat(C.muted, { opacity: 0.45 });
      c.notes.forEach(function (x, i) {
        const p = posOf(i), top = S(p.a, p.y), bot = S(p.a, 0.012);
        const isT = x.idx === d.tonicIdx, on = i === playIdx;
        const cc = roleColor(x);
        gSpiral.add(rod(top, bot, 0.005, dropM));
        const fm = mat(cc, { emissive: new THREE.Color(cc), ei: 0.25 });
        const dot = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.012, 20), fm);
        dot.position.copy(bot);
        gSpiral.add(dot);
        gSpiral.add(sphere(top, on ? 0.085 : isT ? 0.07 : 0.055, on ? mat(C.accent, { emissive: col('accent'), ei: 0.8 }) : isT ? mat(C['pt-tonic'], { emissive: col('pt-tonic'), ei: 0.3 }) : mat(cc, { emissive: new THREE.Color(cc), ei: 0.2, metal: 0.2 })));
        const nm = label((i + 1) + ' ' + (x.role ? B.chainRole(x) : ''), isT ? C['pt-tonic'] : cc, 0.14, 700);
        nm.position.copy(S(p.a, p.y + 0.02, RAD + 0.26));
        gLabels.add(nm);
      });
      // 半音：地板上的紅色弧（走短的那一邊）
      const hM = mat(C['pt-h'], { emissive: col('pt-h'), ei: 0.45 });
      const arcFloor = function (ca, cb, r, material, rad) {
        let dlt = ((cb - ca) % 1200 + 1200) % 1200;
        if (dlt > 600) dlt -= 1200;
        const ap = [];
        for (let k = 0; k <= 12; k++) ap.push(S(ca + dlt * k / 12, 0.03, r));
        const m = tubeThrough(ap, rad, material);
        if (m) gSpiral.add(m);
      };
      // 8 個音以後每一步都是半音，就不再一一標出
      if (n <= 7) c.semitonePairs.forEach(function (pr) {
        const a = c.notes[pr[0]], b = c.notes[pr[1]];
        arcFloor(gongC + a.cents, gongC + b.cents, RAD * 0.86, hM, 0.02);
      });
      if (c.comma) {
        const xM = mat(C['pt-extra'], { emissive: col('pt-extra'), ei: 0.5 });
        arcFloor(gongC + c.notes[0].cents, gongC + c.notes[12].cents + 1200, RAD * 0.72, xM, 0.022);
        const s = label(T('音差 ', 'comma ') + B.fx(c.comma.cents, 2) + T(' 音分', ' cents'), C['pt-extra'], 0.15, 700);
        s.position.copy(S(gongC, 0.2, RAD * 0.45));
        gLabels.add(s);
      }
      const st = label(T('五度螺旋（地板是鐘面）', 'Spiral of fifths (floor = clock)'), C.muted, 0.15, 600);
      st.position.set(SPX, -0.32, RAD + 0.75);
      gLabels.add(st);

      // 資訊列
      const kinds = c.kinds.map(function (k) { return k.p + '/' + k.q + ' ×' + k.count; }).join(T('、', ', '));
      setHud('nm', T('三分損益產生 ' + n + ' 個音（' + (c.order === 'sun' ? '先損' : '先益') + '），宮 = ' + B.pcName(gong), n + ' note' + (n > 1 ? 's' : '') + ' made by the rule (' + (c.order === 'sun' ? 'remove first' : 'add first') + '), gong = ' + B.pcName(gong)));
      setHud('cur', n > 1 ? T('步伐：', 'Steps: ') + kinds : T('按「下一步 ▶」產生下一個音', 'Press “Next ▶” to make the next note'));
      setHud('lo', c.comma ? T('第 13 個音差 ' + B.fx(c.comma.cents, 2) + ' 音分回不到宮', 'Note 13 misses gong by ' + B.fx(c.comma.cents, 2) + ' cents')
        : c.semitonePairs.length && n <= 7 ? T('地板上的弧：半音（' + c.semitonePairs.length + ' 個）', 'Arcs on the floor: half steps (' + c.semitonePairs.length + ')')
          : c.semitonePairs.length ? T('8 個音以後到處都是半音', 'From 8 notes on there are half steps everywhere') : '');
      setHud('tip', T('從正上方看螺旋就是 2D 鐘面；每往上一層就多轉一個純五度。', 'Seen from straight above the spiral is the 2D clock; each storey up turns one more pure fifth.'));
    }

    // ---------- 視角 ----------
    let lastAspect = 0, lastNarrow = null;
    function fitDistance() {
      const vf = camera.fov * DEG;
      const hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
      const dv = (fitH / 2) / Math.tan(vf / 2), dh = (fitW / 2) / Math.tan(hf / 2);
      return Math.max(dv, dh) * 1.06 + 0.6;
    }
    function resetCamera() {
      const dist = fitDistance();
      controls.target.copy(fitC);
      camera.position.copy(fitC).addScaledVector(VIEW_DIR, dist);
      controls.minDistance = 1.5;
      controls.maxDistance = dist * 4;
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
      const nw = narrow();
      if (nw !== lastNarrow) { lastNarrow = nw; build(); lastAspect = 0; }
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
    canvas.addEventListener('keydown', function (ev) {
      const step = (ev.shiftKey ? 15 : 5) * DEG;
      const off = camera.position.clone().sub(controls.target);
      const sph = new THREE.Spherical().setFromVector3(off);
      let usedKey = true;
      if (ev.key === 'ArrowLeft') sph.theta -= step;
      else if (ev.key === 'ArrowRight') sph.theta += step;
      else if (ev.key === 'ArrowUp') sph.phi = Math.max(0.05, sph.phi - step);
      else if (ev.key === 'ArrowDown') sph.phi = Math.min(PI - 0.05, sph.phi + step);
      else usedKey = false;
      if (!usedKey) return;
      ev.preventDefault();
      camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(sph));
      controls.update();
      requestRender();
    });

    // 播放時只在「正在響的音」改變時重建（由 pentatonic.js 呼叫 rebuild）
    const api = {
      active: true,
      frame: function () { requestRender(); },
      rebuild: function () { build(); requestRender(); },
      onTheme: function () {
        C = B.colors();
        buildEnv();
        Object.keys(hudLast).forEach(function (k) { delete hudLast[k]; });
        build();
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
    build();
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

  window.Pentatonic3D = { create: create };
})();
