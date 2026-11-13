/*
 * pitch-frequency-3d.js — 「音高與頻率」的 3D 頻率之梯（three.js）
 *
 * 由 js/pitch-frequency.js 在使用者按「3D 頻率之梯」時才載入（three.js 也是那時才以 import() 載入）；切回 2D 時整個釋放。
 * 用法：window.PitchFrequency3D.create({ THREE, OrbitControls }, 容器, bridge) → { active, frame, rebuild, setMode, onTheme, resetCamera, dispose }
 *
 * 88 個琴鍵排成一排（x = 鍵盤座標，和 2D 鍵盤同一套：每個八度 7 個白鍵寬），每個鍵上立一根柱子，高度 = 那個鍵的平均律頻率：
 *   線性高度：h ∝ f / f_C8，柱頂連成指數曲線 f = f_A0 · 2^((m − 21)/12)，右邊的柱子高得驚人（最右是最左的 152 倍）；
 *   對數高度：h ∝ log2(f / f_A0)，柱頂連成一條等斜率的直線，每個八度一樣高（耳朵聽到的「等距」）。
 * 兩種高度之間平滑過渡；目前的頻率是一根發亮的細棒（可以落在兩鍵之間）。柱子、琴鍵、柱頂小球都用 InstancedMesh。
 * 所有高度都由 pitch-frequency-core.js 算出（bridge.PC.ladderHeight），3D 只負責畫。
 */
(function () {
  'use strict';
  const FONT = 'system-ui, -apple-system, "Segoe UI", "Noto Sans TC", "PingFang TC", sans-serif';
  const PI = Math.PI, DEG = PI / 180;
  const U = 0.1;               // 一個白鍵寬（3D 單位）
  const HMAX = 3.2;            // 最高的柱子
  const MORPH = 0.75;          // 切換高度模式的過渡秒數

  function create(lib, host, B) {
    const THREE = lib.THREE;
    const T = B.T, D = B.D, PC = B.PC;
    let C = B.colors();
    const col = function (k) { return new THREE.Color(C[k] || k); };
    const isDark = function () { return !!D.dark; };
    const N = PC.KEY_HI - PC.KEY_LO + 1;
    const X0 = -PC.WHITE_COUNT * U / 2;
    const xOf = function (xk) { return X0 + xk * U; };

    // ---------- 畫布與資訊列 ----------
    const wrap = document.createElement('div');
    wrap.className = 't3-wrap';
    const canvas = document.createElement('canvas');
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', T('頻率之梯的 3D 立體檢視：88 個琴鍵上各立一根柱子，高度是那個鍵的頻率。線性高度時柱頂連成陡升的指數曲線，對數高度時變成每個八度一樣高的直線坡道。拖曳旋轉，滾輪或雙指縮放，方向鍵也可以轉動。',
      '3D frequency ladder: a bar stands on each of the 88 keys, as tall as that key’s frequency. With linear height the tops climb a steep exponential curve; with log height they form a straight ramp with every octave equally tall. Drag to rotate, scroll or pinch to zoom, or use the arrow keys.'));
    wrap.appendChild(canvas);
    const hud = document.createElement('div');
    hud.className = 't3-hud';
    hud.setAttribute('aria-hidden', 'true');
    hud.innerHTML = '<div class="tl"><span data-k="mode"></span><span class="c" data-k="cur"></span><span class="m" data-k="ratio"></span></div><div class="bl"><span class="m" data-k="tip"></span></div>';
    wrap.appendChild(hud);
    host.appendChild(wrap);
    const hudEl = {}, hudLast = {};
    hud.querySelectorAll('[data-k]').forEach(function (e) { hudEl[e.getAttribute('data-k')] = e; });
    function setHud(k, h) { if (hudLast[k] !== h) { hudLast[k] = h; hudEl[k].innerHTML = h; } }

    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true }); }
    catch (e) { wrap.remove(); throw e; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.05, 200);

    // ---------- 視角控制 ----------
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.rotateSpeed = 0.85;
    controls.screenSpacePanning = true;
    controls.maxPolarAngle = PI * 0.495;

    // ---------- 光線、環境反光、地面 ----------
    scene.add(new THREE.HemisphereLight(0xffffff, 0x3a4250, 0.85));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
    keyLight.position.set(-2.5, 6, 4.5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    const sc = keyLight.shadow.camera;
    sc.left = -3.4; sc.right = 3.4; sc.top = 3.4; sc.bottom = -3.4; sc.near = 0.5; sc.far = 20;
    keyLight.shadow.bias = -0.0008;
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
    fillLight.position.set(4, 2, -3);
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

    function disposeObject(obj) {
      obj.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); });
      });
    }
    function clearGroup(g) { g.children.slice().forEach(function (o) { g.remove(o); disposeObject(o); }); }
    function fsF() { return Math.max(1, Math.min(1.45, B.fs ? B.fs() : 1)); }
    /** 文字小牌（畫布貼圖的 Sprite，永遠面向鏡頭；文字用 2D fillText 畫，簡體自動轉換） */
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
      const hh = h * fsF();
      s.scale.set(hh * w / 80, hh, 1);
      return s;
    }
    function mat(color, opt) {
      opt = opt || {};
      return new THREE.MeshStandardMaterial({
        color: color, roughness: opt.rough == null ? 0.4 : opt.rough, metalness: opt.metal == null ? 0.05 : opt.metal,
        emissive: opt.emissive || 0x000000, emissiveIntensity: opt.ei == null ? 1 : opt.ei,
        transparent: opt.opacity != null, opacity: opt.opacity == null ? 1 : opt.opacity, depthWrite: opt.opacity == null || opt.opacity > 0.9
      });
    }

    // ---------- 靜態物件：地面、琴鍵（InstancedMesh） ----------
    const gStatic = new THREE.Group(), gDyn = new THREE.Group(), gLabels = new THREE.Group();
    scene.add(gStatic, gDyn, gLabels);
    let ground = null, whiteMesh = null, blackMesh = null, barMesh = null, capMesh = null, topLine = null, curRod = null, curCap = null, curGlow = null;
    const keysW = [], keysB = [];
    for (let m = PC.KEY_LO; m <= PC.KEY_HI; m++) (PC.isBlack(m) ? keysB : keysW).push(m);
    const dummy = new THREE.Object3D();

    function buildStatic() {
      clearGroup(gStatic);
      const gm = new THREE.Mesh(new THREE.PlaneGeometry(PC.WHITE_COUNT * U + 1.6, 2.4), new THREE.ShadowMaterial({ opacity: isDark() ? 0.45 : 0.18 }));
      gm.rotation.x = -PI / 2; gm.position.set(0, -0.06, 0.25); gm.receiveShadow = true;
      gStatic.add(gm); ground = gm;
      // 鍵盤底座
      const base = new THREE.Mesh(new THREE.BoxGeometry(PC.WHITE_COUNT * U + 0.08, 0.06, 0.62), mat(C['pf-keyb'], { rough: 0.5, metal: 0.1 }));
      base.position.set(0, -0.03, 0.3); base.castShadow = true; base.receiveShadow = true;
      gStatic.add(base);
      whiteMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(U * 0.94, 0.05, 0.56), mat(C['pf-key'], { rough: 0.35 }), keysW.length);
      keysW.forEach(function (m, i) { dummy.position.set(xOf(PC.keyCenter(m)), 0.025, 0.3); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); whiteMesh.setMatrixAt(i, dummy.matrix); });
      whiteMesh.receiveShadow = true;
      blackMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(U * 0.58, 0.05, 0.34), mat(C['pf-keyb'], { rough: 0.3, metal: 0.1 }), keysB.length);
      keysB.forEach(function (m, i) { dummy.position.set(xOf(PC.keyCenter(m)), 0.06, 0.19); dummy.updateMatrix(); blackMesh.setMatrixAt(i, dummy.matrix); });
      blackMesh.castShadow = true;
      whiteMesh.instanceColor = null;
      gStatic.add(whiteMesh, blackMesh);
      // 柱子與柱頂小球（每根一個 instance）
      barMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(U * 0.5, 1, U * 0.5), mat(0xffffff, { rough: 0.35, metal: 0.08 }), N);
      barMesh.castShadow = true;
      capMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(U * 0.32, 14, 10), mat(0xffffff, { rough: 0.25, metal: 0.1 }), N);
      gStatic.add(barMesh, capMesh);
      // 柱頂連線
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
      topLine = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: col('pf-lin'), transparent: true, opacity: 0.85 }));
      gStatic.add(topLine);
      // 目前的頻率：細棒＋發光小球
      curRod = new THREE.Mesh(new THREE.CylinderGeometry(U * 0.09, U * 0.09, 1, 10), mat(C['pf-cur'], { emissive: col('pf-cur'), ei: 0.55 }));
      curCap = new THREE.Mesh(new THREE.SphereGeometry(U * 0.42, 20, 14), mat(C['pf-cur'], { emissive: col('pf-cur'), ei: 0.6 }));
      curGlow = new THREE.Mesh(new THREE.SphereGeometry(U * 0.85, 20, 14), new THREE.MeshBasicMaterial({ color: col('pf-cur'), transparent: true, opacity: 0.18, depthWrite: false }));
      gStatic.add(curRod, curCap, curGlow);
    }

    // ---------- 高度（線性 ↔ 對數，平滑過渡） ----------
    let mode = B.data().mode === 'log' ? 'log' : 'lin';
    let mix = mode === 'log' ? 1 : 0, mixFrom = mix, mixTo = mix, mixT0 = 0;
    const heightOf = function (f, a4, u) { return HMAX * ((1 - u) * PC.ladderHeight(f, 'lin', a4) + u * PC.ladderHeight(f, 'log', a4)); };
    const cBar = new THREE.Color(), cTmp = new THREE.Color();
    function place() {
      const d = B.data(), u = mix;
      const pos = topLine.geometry.attributes.position;
      const linC = col('pf-lin'), logC = col('pf-log'), curC = col('pf-cur');
      const baseC = linC.clone().lerp(logC, u);
      for (let i = 0; i < N; i++) {
        const m = PC.KEY_LO + i, f = PC.etFreq(m, d.a4), h = Math.max(0.004, heightOf(f, d.a4, u));
        const x = xOf(PC.keyCenter(m)), z = PC.isBlack(m) ? 0.12 : 0.02;
        dummy.position.set(x, 0.05 + h / 2, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, h, 1); dummy.updateMatrix();
        barMesh.setMatrixAt(i, dummy.matrix);
        dummy.position.set(x, 0.05 + h, z); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
        capMesh.setMatrixAt(i, dummy.matrix);
        pos.setXYZ(i, x, 0.05 + h, z);
        // 顏色：同一個八度一樣的明暗交錯（看得出每個八度），目前的鍵亮起
        const oct = Math.floor((m - 21) / 12);
        cBar.copy(baseC).lerp(cTmp.set(isDark() ? 0x0b0f16 : 0xffffff), oct % 2 ? 0.28 : 0.0);
        if (m === d.midi) cBar.copy(curC);
        barMesh.setColorAt(i, cBar);
        capMesh.setColorAt(i, m === d.midi ? curC : cBar);
      }
      barMesh.instanceMatrix.needsUpdate = true; capMesh.instanceMatrix.needsUpdate = true;
      if (barMesh.instanceColor) barMesh.instanceColor.needsUpdate = true;
      if (capMesh.instanceColor) capMesh.instanceColor.needsUpdate = true;
      pos.needsUpdate = true;
      topLine.geometry.computeBoundingSphere();
      topLine.material.color.copy(baseC);
      // 目前的頻率（可以在兩鍵之間）
      const xc = xOf(PC.xOfMidi(d.mf)), hc = Math.max(0.004, heightOf(d.f, d.a4, u));
      curRod.position.set(xc, 0.05 + hc / 2, 0.24); curRod.scale.set(1, hc, 1);
      curCap.position.set(xc, 0.05 + hc, 0.24); curGlow.position.copy(curCap.position);
      placeLabels(u);
      hudText(d);
    }

    // 標籤：每個 A 的頻率（掛在柱頂旁）、八度的參考線
    let labelSet = [];
    function buildLabels() {
      clearGroup(gLabels);
      labelSet = [];
      const d = B.data();
      for (let m = 21; m <= 105; m += 12) {
        const f = PC.etFreq(m, d.a4);
        const s = label('A' + (Math.floor(m / 12) - 1) + ' ' + B.fx(f, f < 100 ? 1 : 0) + ' Hz', C.muted, 0.13, 600);
        gLabels.add(s);
        labelSet.push({ s: s, m: m, f: f });
      }
      const s8 = label('C8 ' + B.fx(PC.etFreq(108, d.a4), 0) + ' Hz', C.muted, 0.13, 600);
      gLabels.add(s8); labelSet.push({ s: s8, m: 108, f: PC.etFreq(108, d.a4) });
      // 八度參考線（每個 A 的高度畫一條細線，跟著模式移動）
      const lineMat = new THREE.LineBasicMaterial({ color: col('muted'), transparent: true, opacity: isDark() ? 0.35 : 0.3 });
      labelSet.forEach(function (q) {
        const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(xOf(-0.6), 0, -0.05), new THREE.Vector3(xOf(PC.keyCenter(q.m)), 0, -0.05)]);
        const ln = new THREE.Line(g, lineMat);
        gLabels.add(ln); q.ln = ln;
      });
      const nm = label(d.name, C['pf-cur'], 0.2, 800);
      gLabels.add(nm); labelSet.cur = nm;
    }
    function placeLabels(u) {
      const d = B.data();
      labelSet.forEach(function (q) {
        const h = heightOf(q.f, d.a4, u);
        q.s.position.set(xOf(PC.keyCenter(q.m)) - 0.02, 0.05 + h + 0.13, -0.08);
        q.ln.position.y = 0.05 + h;
      });
      if (labelSet.cur) {
        const hc = heightOf(d.f, d.a4, u);
        labelSet.cur.position.set(xOf(PC.xOfMidi(d.mf)), 0.05 + hc + 0.28, 0.24);
      }
    }
    function hudText(d) {
      const r = PC.etFreq(108, d.a4) / PC.etFreq(21, d.a4);
      const lin = mode === 'lin';
      setHud('mode', lin ? T('線性高度：柱高 ∝ 頻率', 'Linear height: bar ∝ frequency') : T('對數高度：柱高 ∝ log<sub>2</sub>（頻率）', 'Log height: bar ∝ log<sub>2</sub>(frequency)'));
      setHud('cur', B.fx(d.f, 2) + ' Hz・' + d.name + ' ' + (Math.abs(d.cents) < 0.05 ? '' : B.sg(d.cents, 1) + T(' 音分', '¢')));
      setHud('ratio', lin ? T('最右的柱子是最左的 ' + B.fx(r, 1) + ' 倍高；每高一個八度，柱子高一倍', 'The right-most bar is ' + B.fx(r, 1) + ' times the left-most; each octave up doubles the height')
        : T('每個八度一樣高（總高的 1/7.25）：耳朵聽到的等距', 'Every octave adds the same height (1/7.25 of the total): equal steps to the ear'));
      setHud('tip', lin ? T('左邊四個八度的柱子幾乎貼地：換成「對數高度」看看。', 'The four left-most octaves hardly leave the ground: try “Log height”.')
        : T('柱頂連成一條直線坡道；換回「線性高度」，看它彎成指數曲線。', 'The tops form one straight ramp; switch back to “Linear height” to see it bend into an exponential curve.'));
    }

    // ---------- 視角 ----------
    const fitC = new THREE.Vector3(0, HMAX * 0.42, 0);
    function fitDistance() {
      const vf = camera.fov * DEG, hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
      const w = PC.WHITE_COUNT * U + 0.5, h = HMAX + 0.8;
      return Math.max((h / 2) / Math.tan(vf / 2), (w / 2) / Math.tan(hf / 2)) * 1.08;
    }
    function resetCamera() {
      const d = fitDistance();
      controls.target.copy(fitC);
      camera.position.copy(fitC).addScaledVector(new THREE.Vector3(0.18, 0.32, 1).normalize(), d);
      controls.minDistance = 0.8; controls.maxDistance = d * 4;
      camera.near = 0.02; camera.far = d * 20 + 20;
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
      let more = controls.update();
      if (mix !== mixTo) {
        const reduce = D.reducedMotion && D.reducedMotion();
        const u = reduce ? 1 : Math.min(1, (performance.now() - mixT0) / (MORPH * 1000));
        const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;   // 介面過渡（只改畫法，不改任何物理量）
        mix = u >= 1 ? mixTo : mixFrom + (mixTo - mixFrom) * e;
        place();
        more = true;
      }
      renderer.render(scene, camera);
      if (more) requestRender();
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
      let used = true;
      if (ev.key === 'ArrowLeft') sph.theta -= step;
      else if (ev.key === 'ArrowRight') sph.theta += step;
      else if (ev.key === 'ArrowUp') sph.phi = Math.max(0.05, sph.phi - step);
      else if (ev.key === 'ArrowDown') sph.phi = Math.min(PI * 0.495, sph.phi + step);
      else used = false;
      if (!used) return;
      ev.preventDefault();
      camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(sph));
      controls.update();
      requestRender();
    });

    const api = {
      active: true,
      frame: function () { requestRender(); },
      /** 頻率、標準音、寫法改變時：重新擺放（柱子數量不變，只更新 instance） */
      rebuild: function () { buildLabels(); place(); requestRender(); },
      setMode: function (m) {
        m = m === 'log' ? 'log' : 'lin';
        if (m === mode) return;
        mode = m; mixFrom = mix; mixTo = m === 'log' ? 1 : 0; mixT0 = performance.now();
        hudText(B.data());
        requestRender();
      },
      onTheme: function () {
        C = B.colors();
        buildEnv();
        Object.keys(hudLast).forEach(function (k) { delete hudLast[k]; });
        buildStatic(); buildLabels(); place();
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
    buildStatic();
    buildLabels();
    place();
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

  window.PitchFrequency3D = { create: create };
})();
