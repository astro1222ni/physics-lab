/*
 * hardy-weinberg-3d.js — 「哈溫平衡」第二部分（許多族群）的 3D 曲面（three.js）
 *
 * 由 js/hardy-weinberg.js 在使用者按「3D 曲面」時才載入（three.js 也是那時才以 import() 載入）；切回 2D 時整個釋放。
 * 用法：window.HW3D.create({ THREE, OrbitControls }, 容器, bridge) → { active, frame, onShow, onTheme, resetCamera, rebuild, busy, dispose }
 *
 * 畫的是 2D 畫面同一次模擬（bridge.run().sim）：
 *   往右是 A 的頻率 p（0 到 1，分成 20 格）；往後是世代；高度是「落在那一格的族群占幾成」。
 *   一開始所有族群擠在 p0 那一格（一道高牆），漂變讓它一代一代攤平（木村的擴散）；
 *   左右兩道彩帶是 A 已經消失（p = 0）與已經固定（p = 1）的族群比例，只增不減。
 *   地板上的實線是所有族群的平均 p，虛線是無限大族群的軌跡。
 */
(function () {
  'use strict';
  const FONT = 'system-ui, -apple-system, "Segoe UI", "Noto Sans TC", "PingFang TC", sans-serif';
  const RES = 3;
  const L = 8;         // p 軸長度
  const Z = 8;         // 世代軸長度
  const S = 3.6;       // 高度：比例 1 的高度
  const B = 20;        // p 的格數
  const GAP = 0.55;    // 消失／固定彩帶離曲面的距離
  const MAXROWS = 160;

  function create(lib, host, BR) {
    const THREE = lib.THREE;
    const T = BR.T, D = BR.D;
    let C = BR.colors();

    // ---------- 畫布、HUD ----------
    const wrap = document.createElement('div');
    wrap.className = 'hw3-wrap';
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('各族群 A 頻率的分布隨世代變化的 3D 曲面：往右是 p、往後是世代、高度是族群比例；左右兩道彩帶是 A 消失與固定的族群（可拖曳旋轉、縮放）', '3D surface of how the frequency of A is spread over the populations, generation by generation: p to the right, generations going back, height = share of populations; the ribbons on either side are populations that lost or fixed A (drag to rotate, pinch or scroll to zoom)'));
    wrap.appendChild(canvas);
    const hud = document.createElement('div');
    hud.className = 'hw3-hud';
    hud.setAttribute('aria-hidden', 'true');
    hud.innerHTML = '<div class="tl"><span data-k="t"></span><span class="m" data-k="v"></span></div><div class="br"><span class="m" data-k="note"></span></div>';
    wrap.appendChild(hud);
    host.appendChild(wrap);
    const hudEl = {};
    hud.querySelectorAll('[data-k]').forEach(function (e) { hudEl[e.getAttribute('data-k')] = e; });
    const hudLast = {};
    function setHud(k, s) { if (hudLast[k] !== s) { hudLast[k] = s; hudEl[k].textContent = s; } }

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    } catch (e) {
      wrap.remove();
      throw e;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1.5, 0.05, 200);
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.rotateSpeed = 0.85;
    controls.enablePan = false;
    controls.minDistance = 3;
    controls.maxDistance = 45;
    controls.maxPolarAngle = Math.PI * 0.52;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x556070, 1.0));
    const key = new THREE.DirectionalLight(0xffffff, 1.8);
    key.position.set(-4, 10, 7);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const sc = key.shadow.camera;
    sc.left = -8; sc.right = 8; sc.top = 7; sc.bottom = -7; sc.near = 1; sc.far = 30;
    key.shadow.bias = -0.0005;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xffffff, 0.55);
    rim.position.set(6, 4, -7);
    scene.add(rim);

    function isDark() { return !!D.dark; }
    function col(s) { return new THREE.Color(s); }
    function disposeObject(obj) {
      obj.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
            if (m.map) m.map.dispose();
            m.dispose();
          });
        }
      });
    }

    // ---------- 文字標籤（Sprite，固定像素大小） ----------
    let ch = 300;
    function roundRect(g, x, y, w, h, r) {
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    }
    function label(text, color, small) {
      const size = (small ? 10.5 : 12) * RES;
      const f = (small ? '600 ' : '700 ') + size + 'px ' + FONT;
      const c = document.createElement('canvas');
      let g = c.getContext('2d');
      g.font = f;
      const tw = g.measureText(text).width;
      const padX = 6 * RES, padY = 2 * RES;
      c.width = Math.ceil(tw + 2 * padX);
      c.height = Math.ceil(size * 1.3 + 2 * padY);
      g = c.getContext('2d');
      roundRect(g, RES * 0.5, RES * 0.5, c.width - RES, c.height - RES, (c.height - RES) / 2);
      g.fillStyle = D.alpha(D.c['canvas-bg'], isDark() ? 0.85 : 0.9);
      g.fill();
      g.strokeStyle = D.alpha(color, 0.5);
      g.lineWidth = RES;
      g.stroke();
      g.font = f;
      g.textBaseline = 'middle';
      g.fillStyle = color;
      g.fillText(text, padX, c.height / 2 + RES * 0.5);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false }));
      sp.userData = { lw: c.width / RES, lh: c.height / RES };
      sp.renderOrder = 30;
      fitLabel(sp);
      return sp;
    }
    function fitLabel(sp) {
      const k = 2 * Math.tan(camera.fov * Math.PI / 360) / Math.max(1, ch);
      sp.scale.set(sp.userData.lw * k, sp.userData.lh * k, 1);
    }
    function lineOf(pts, color, opacity, dashed) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const m = dashed
        ? new THREE.LineDashedMaterial({ color: col(color), dashSize: 0.16, gapSize: 0.11, transparent: true, opacity: opacity })
        : new THREE.LineBasicMaterial({ color: col(color), transparent: true, opacity: opacity });
      const l = new THREE.Line(g, m);
      if (dashed) l.computeLineDistances();
      return l;
    }
    function niceStep(span, target) {
      const raw = span / target, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
      return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
    }

    // ---------- 座標 ----------
    const world = new THREE.Group();
    scene.add(world);
    let run = null, builtId = -1, builtVer = -1, narrow = false;
    let frame = null, surf = null, ribL = null, ribR = null, meanLine = null, detLine = null, cursor = null, tagL = null, tagR = null, ribVals = null, tagKey = '';
    let rows = 0, step = 1, cols = B + 2, gensBuilt = 1, fmax = 1, smoothNote = 0;
    const CLIP = 1.15;   // 曲面最高畫到 CLIP·S（一開始全部族群擠在同一格的尖峰會被削平）
    function Xp(p) { return p * L - L / 2; }
    function Zg(t) { return Z / 2 - t / gensBuilt * Z; }

    function buildFrame() {
      if (frame) { world.remove(frame); disposeObject(frame); }
      frame = new THREE.Group();
      const shadow = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), new THREE.ShadowMaterial({ opacity: isDark() ? 0.45 : 0.15 }));
      shadow.rotation.x = -Math.PI / 2; shadow.position.y = -0.003; shadow.receiveShadow = true;
      frame.add(shadow);
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(L + 2 * GAP + 0.6, Z), new THREE.MeshStandardMaterial({ color: col(D.c.surface || '#ffffff'), roughness: 0.95, transparent: true, opacity: isDark() ? 0.2 : 0.4, depthWrite: false }));
      floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
      frame.add(floor);
      const g = [];
      for (let k = 0; k <= 4; k++) { const x = Xp(k / 4); g.push(x, 0.002, Z / 2, x, 0.002, -Z / 2); }
      const ts = niceStep(gensBuilt, 5);
      for (let t = 0; t <= gensBuilt + 1e-9; t += ts) { const z = Zg(t); g.push(-L / 2, 0.002, z, L / 2, 0.002, z); }
      // 後面的高度刻度（曲面的比例 fmax/2、fmax）
      for (let k = 1; k <= 2; k++) { const y = k / 2 * S; g.push(-L / 2, y, -Z / 2, L / 2, y, -Z / 2); }
      g.push(-L / 2, 0, -Z / 2, -L / 2, S, -Z / 2, L / 2, 0, -Z / 2, L / 2, S, -Z / 2);
      const gg = new THREE.BufferGeometry();
      gg.setAttribute('position', new THREE.Float32BufferAttribute(g, 3));
      frame.add(new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: col(D.c.text), transparent: true, opacity: isDark() ? 0.14 : 0.12 })));
      // 刻度與軸名
      [[0, '0'], [0.5, '0.5'], [1, '1']].forEach(function (a) { const sp = label(a[1], D.c.muted, true); sp.position.set(Xp(a[0]), 0, Z / 2 + 0.4); frame.add(sp); });
      const pl = label(T('A 的頻率 p', 'frequency of A, p'), D.c.text); pl.position.set(Xp(0.5), 0, Z / 2 + 0.95); frame.add(pl);
      const g0 = label(T('第 0 代', 'gen. 0'), D.c.muted, true); g0.position.set(L / 2 + GAP + 1.0, 0, Z / 2); frame.add(g0);
      const gl = label(T('第 ', 'gen. ') + gensBuilt + T(' 代', ''), D.c.text, true); gl.position.set(L / 2 + GAP + 1.0, 0, -Z / 2); frame.add(gl);
      const pc = function (f) { return BR.num(100 * f, f < 0.1 ? 1 : 0) + '%'; };
      const yl = label(T('族群的 ', '') + pc(fmax) + T('', ' of populations'), D.c.muted, true); yl.position.set(0, S + 0.2, -Z / 2); frame.add(yl);
      const yh = label(pc(fmax / 2), D.c.muted, true); yh.position.set(0, S / 2 + 0.15, -Z / 2); frame.add(yh);
      world.add(frame);
    }

    function clearAll() {
      [surf, ribL, ribR, meanLine, detLine, cursor, tagL, tagR].forEach(function (o) { if (o) { world.remove(o); disposeObject(o); } });
      surf = ribL = ribR = meanLine = detLine = cursor = tagL = tagR = null; ribVals = null;
    }
    function build() {
      run = BR.run();
      builtVer = D.ver;
      clearAll();
      if (!run) { builtId = -2; gensBuilt = 100; buildFrame(); return; }
      builtId = run.id; tagKey = '';
      const sim = run.sim, H = BR.H;
      gensBuilt = sim.gens;
      step = Math.max(1, Math.ceil(sim.gens / MAXROWS));
      rows = Math.floor(sim.gens / step) + 1;
      // 高度刻度：取第 3 代以後中間各格比例的最大值（起點那道尖牆另外削平），讓攤開後的分布看得清楚
      let mx = 0;
      for (let t = Math.min(sim.gens, 3); t <= sim.gens; t += step) {
        const hs = H.histogram(sim, t, B);
        for (let i = 0; i < B; i++) mx = Math.max(mx, hs.h[i] / sim.pops);
      }
      fmax = Math.max(0.05, Math.min(1, Math.ceil(mx * 20) / 20));
      buildFrame();
      // 曲面：每一列是一個世代的直方圖（兩端補 0，讓邊緣落到地板）
      const pos = new Float32Array(rows * cols * 3), colr = new Float32Array(rows * cols * 3);
      const lost = new Float32Array(rows), fixed = new Float32Array(rows);
      const cLo = col(C['hw-seg']), cHi = col(C['hw-eq']), tmp = new THREE.Color();
      const hw = Math.max(0, Math.round(sim.gens / 60));   // 曲面沿世代取前後 hw 代的平均，讓統計雜訊不要蓋過形狀
      smoothNote = hw > 0 ? 2 * hw + 1 : 0;
      for (let r = 0; r < rows; r++) {
        const t = Math.min(sim.gens, r * step);
        const hs = H.histogram(sim, t, B);
        if (hw > 0 && t >= 3) {
          let n = 1;
          for (let d = 1; d <= hw; d++) [t - d, t + d].forEach(function (tt) {
            if (tt < 3 || tt > sim.gens) return;
            const h2 = H.histogram(sim, tt, B);
            for (let i = 0; i < B; i++) hs.h[i] += h2.h[i];
            n++;
          });
          for (let i = 0; i < B; i++) hs.h[i] /= n;
        }
        lost[r] = hs.lost / sim.pops; fixed[r] = hs.fixed / sim.pops;
        const z = Zg(t);
        for (let c = 0; c < cols; c++) {
          let x, f;
          if (c === 0) { x = Xp(0); f = 0; } else if (c === cols - 1) { x = Xp(1); f = 0; } else { x = Xp((c - 0.5) / B); f = hs.h[c - 1] / sim.pops; }
          const i = (r * cols + c) * 3;
          pos[i] = x; pos[i + 1] = Math.min(CLIP, f / fmax) * S; pos[i + 2] = z;
          tmp.copy(cLo).lerp(cHi, Math.min(1, f / fmax));
          colr[i] = tmp.r; colr[i + 1] = tmp.g; colr[i + 2] = tmp.b;
        }
      }
      const idx = [];
      for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
        const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
        idx.push(a, d, b, b, d, e);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(colr, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      surf = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.02, side: THREE.DoubleSide, transparent: true, opacity: 0.94 }));
      surf.castShadow = true; surf.receiveShadow = true;
      world.add(surf);
      // 左右彩帶：A 消失、A 固定的比例
      // 彩帶做成有寬度的「堤」：兩側立面＋上面，從正前方看也看得到高度
      const RW = 0.42;
      function ribbon(vals, x, color) {
        const p = new Float32Array(rows * 4 * 3), id = [];
        for (let r = 0; r < rows; r++) {
          const z = Zg(Math.min(sim.gens, r * step)), i = r * 12, h = vals[r] * S;
          p[i] = x - RW / 2; p[i + 1] = 0; p[i + 2] = z;
          p[i + 3] = x - RW / 2; p[i + 4] = h; p[i + 5] = z;
          p[i + 6] = x + RW / 2; p[i + 7] = h; p[i + 8] = z;
          p[i + 9] = x + RW / 2; p[i + 10] = 0; p[i + 11] = z;
          if (r < rows - 1) {
            const a = r * 4, b = a + 4;
            for (let k = 0; k < 3; k++) id.push(a + k, b + k, a + k + 1, a + k + 1, b + k, b + k + 1);
          }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(p, 3));
        g.setIndex(id);
        g.computeVertexNormals();
        const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: col(color), roughness: 0.5, side: THREE.DoubleSide, transparent: true, opacity: 0.88 }));
        m.castShadow = true;
        return m;
      }
      // 彩帶自己的刻度：高度 S＝全部族群（100%）
      ribL = ribbon(lost, -L / 2 - GAP, C['hw-lost']); world.add(ribL);
      ribR = ribbon(fixed, L / 2 + GAP, C['hw-fix']); world.add(ribR);
      ribVals = { lost: lost, fixed: fixed };
      tagL = label('0%', C['hw-lost'], true); world.add(tagL);
      tagR = label('0%', C['hw-fix'], true); world.add(tagR);
      // 地板上的平均 p 與無限大族群的軌跡
      const pm = [], pd = [];
      for (let r = 0; r < rows; r++) {
        const t = Math.min(sim.gens, r * step), z = Zg(t);
        pm.push(Xp(sim.meanP[t]), 0.012, z);
        pd.push(Xp(sim.det[t]), 0.01, z);
      }
      meanLine = lineOf(pm, D.c.text, 0.95); world.add(meanLine);
      detLine = lineOf(pd, C['hw-eq'], 0.9, true); world.add(detLine);
      // 檢視中的世代：一條亮線描出那一列的直方圖
      const cg = new THREE.BufferGeometry();
      cg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cols * 3), 3));
      cursor = new THREE.Line(cg, new THREE.LineBasicMaterial({ color: col(D.c.accent), transparent: true, opacity: 0.95, depthTest: false }));
      cursor.renderOrder = 20;
      world.add(cursor);
    }

    function update() {
      const r0 = BR.run();
      if ((r0 ? r0.id : -2) !== builtId || r0 !== run || D.ver !== builtVer) build();
      if (!run) {
        setHud('t', T('按「開始演化」，曲面會一代一代長出來', 'Press “Evolve” and the surface grows generation by generation'));
        setHud('v', ''); setHud('note', '');
        return;
      }
      const sim = run.sim;
      const head = Math.min(sim.gens, BR.head());
      const shown = Math.max(1, Math.min(rows, Math.floor(head / step) + 1));
      surf.geometry.setDrawRange(0, Math.max(0, shown - 1) * (cols - 1) * 6);
      ribL.geometry.setDrawRange(0, Math.max(0, shown - 1) * 18);
      ribR.geometry.setDrawRange(0, Math.max(0, shown - 1) * 18);
      meanLine.geometry.setDrawRange(0, shown);
      detLine.geometry.setDrawRange(0, rows);
      // 游標列
      const cg = BR.cur(), rr = Math.min(shown - 1, Math.round(cg / step));
      const src = surf.geometry.attributes.position.array, dst = cursor.geometry.attributes.position;
      for (let c = 0; c < cols; c++) { const i = (rr * cols + c) * 3; dst.array[c * 3] = src[i]; dst.array[c * 3 + 1] = src[i + 1] + 0.02; dst.array[c * 3 + 2] = src[i + 2]; }
      dst.needsUpdate = true;
      cursor.geometry.computeBoundingSphere();
      // 彩帶頂端的百分比（跟著播放的最前端）
      const lr = shown - 1, zt = Zg(Math.min(sim.gens, lr * step));
      const key = shown + '|' + D.ver;
      if (key !== tagKey) {
        tagKey = key;
        [['L', tagL, ribVals.lost, -L / 2 - GAP, 'hw-lost', T('A 消失 ', 'A lost ')], ['R', tagR, ribVals.fixed, L / 2 + GAP, 'hw-fix', T('A 固定 ', 'A fixed ')]].forEach(function (a) {
          const v = a[2][lr], txt = a[5] + BR.num(100 * v, 0) + '%';
          let sp = a[1];
          if (!sp || sp.userData.txt !== txt) {
            if (sp) { world.remove(sp); disposeObject(sp); }
            sp = label(txt, C[a[4]], true); sp.userData.txt = txt; world.add(sp);
            if (a[0] === 'L') tagL = sp; else tagR = sp;
          }
          sp.position.set(a[3], v * S + 0.28, zt);
        });
      }
      const c = BR.H.census(sim, cg);
      setHud('t', T('第 ', 'Generation ') + cg + T(' 代', ''));
      setHud('v', T('平均 p = ', 'mean p = ') + BR.num(sim.meanP[cg], 3) + T('，固定 ', ', fixed ') + c.fixed + T('，消失 ', ', lost ') + c.lost);
      if (narrow) setHud('note', T('高度＝落在那個頻率的族群比例', 'height = share of populations at that frequency'));
      else setHud('note', T('曲面高度＝落在那個頻率的族群比例', 'surface height = share of populations at that frequency') + (smoothNote ? T('（相鄰 ' + smoothNote + ' 代平均）', ' (mean of ' + smoothNote + ' generations)') : '') + T('；兩側彩帶：A 消失／固定（全高＝100%）', '; side ribbons: A lost / fixed (full height = 100%)'));
    }

    // ---------- 相機 ----------
    let lastAspect = 0;
    function sizeOf(w) { return w < 560 ? Math.round(Math.max(380, Math.min(460, w * 1.15))) : 450; }
    function resetCamera() {
      const hf = 2 * Math.atan(Math.tan(camera.fov * Math.PI / 360) * camera.aspect);
      const half = L / 2 + GAP + 1.6;
      const dist = narrow ? Math.max(12.5, (half - 0.6) / Math.tan(hf / 2) + Z / 2 - 1.5) : Math.max(16, half / Math.tan(hf / 2) + Z / 2 + 1);
      const el = 36 * Math.PI / 180, az = 14 * Math.PI / 180;
      controls.target.set(0.3, S * 0.2, -0.3);
      camera.position.set(0.3 + Math.sin(az) * Math.cos(el) * dist, S * 0.2 + Math.sin(el) * dist, -0.3 + Math.cos(az) * Math.cos(el) * dist);
      controls.update();
    }
    let raf = 0, moving = false;
    function renderNow() {
      if (!api.active) return;
      moving = controls.update();
      renderer.render(scene, camera);
    }
    function requestRender() {
      if (raf || !api.active) return;
      raf = requestAnimationFrame(function () { raf = 0; renderNow(); if (moving) requestRender(); });
    }
    function resize3() {
      const w = wrap.clientWidth;
      if (!w) return;
      const h = sizeOf(w);
      if (canvas.style.height !== h + 'px') canvas.style.height = h + 'px';
      ch = h;
      if (narrow !== (w < 560)) { narrow = w < 560; builtId = -3; tagKey = ''; }
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      scene.traverse(function (o) { if (o.isSprite) fitLabel(o); });
      if (Math.abs(camera.aspect - lastAspect) > 1e-3) {
        const first = !lastAspect;
        lastAspect = camera.aspect;
        if (first) resetCamera();
      }
      update();
      renderNow();
    }
    const ro = window.ResizeObserver ? new ResizeObserver(function () { resize3(); }) : null;
    if (ro) ro.observe(wrap); else window.addEventListener('resize', resize3);
    controls.addEventListener('change', requestRender);
    canvas.addEventListener('webglcontextlost', function (ev) {
      ev.preventDefault();
      if (!api.active) return;
      if (BR.onContextLost) BR.onContextLost();
    });
    const api = {
      active: true,
      frame: function () { update(); renderNow(); },
      busy: function () { return moving; },
      onShow: function () { lastAspect = 0; resize3(); },
      onTheme: function () {
        C = BR.colors();
        builtId = -3; tagKey = '';
        Object.keys(hudLast).forEach(function (k) { delete hudLast[k]; });
        update();
        requestRender();
      },
      rebuild: function () { builtId = -3; update(); requestRender(); },
      resetCamera: function () { resetCamera(); requestRender(); },
      dispose: function () {
        api.active = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        controls.dispose();
        disposeObject(scene);
        renderer.dispose();
        renderer.forceContextLoss();
        wrap.remove();
      }
    };
    const w0 = wrap.clientWidth;
    if (w0) {
      ch = sizeOf(w0); narrow = w0 < 560;
      canvas.style.height = ch + 'px';
      renderer.setSize(w0, ch, false);
      camera.aspect = w0 / ch;
      camera.updateProjectionMatrix();
      lastAspect = camera.aspect;
    }
    resetCamera();
    update();
    renderNow();
    return api;
  }
  window.HW3D = { create: create };
})();
