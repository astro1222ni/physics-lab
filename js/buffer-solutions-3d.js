/*
 * buffer-solutions-3d.js — 「緩衝溶液」的 3D 微觀檢視（可旋轉、縮放）
 *
 * three.js 由 buffer-solutions.js 在切換到 3D 時才以 import() 動態載入，再傳進 BufSol3D.create(lib, host)。
 * 這個檔案只「讀」頁面算好的粒子數（host.snapshot()：兩杯各有幾顆弱酸、共軛鹼、H3O+、OH-），
 * 不改變任何化學量。左邊立方體是緩衝溶液、右邊是對照溶液；每一顆 = 緩衝溶液中弱酸與共軛鹼總量的 1/48。
 * 加酸時：H3O+ 從液面上方落下，撞上一顆共軛鹼，把 H+ 交給它（共軛鹼 → 弱酸），自己變成水而消失；
 * 加鹼時：OH- 落下找上一顆弱酸，拿走它的 H+（弱酸 → 共軛鹼），自己也變成水。
 * 對照溶液沒有共軛鹼可以接手，加進去的 H3O+／OH- 只能自由地留在水中，所以 pH 大幅改變。
 * 稀釋時粒子數（莫耳數）不變，只有立方體（體積）變大。
 */
(function () {
  'use strict';
  const MAXA = 1600;          // 原子實例上限
  const FL = 48;              // 反應閃光
  const CX = 1.8;             // 兩個立方體中心離原點的距離
  const S100 = 1.55;          // 100 mL 時的邊長
  const FLY = 750;            // 離子落下、找到對象所需的時間（毫秒）
  const FADE = 450;

  function create(lib, H) {
    const THREE = lib.THREE;
    const T = H.T, host = H.host;

    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('兩杯溶液的 3D 微觀檢視：弱酸、共軛鹼、H3O+ 與 OH- 粒子（拖曳旋轉、雙指或滾輪縮放）',
      '3D microscopic view of the two solutions: weak acid, conjugate base, H3O+ and OH- particles (drag to rotate, pinch or scroll to zoom)'));
    canvas.setAttribute('role', 'img');
    host.appendChild(canvas);
    const hudTL = document.createElement('div'), hudTR = document.createElement('div'), hudBL = document.createElement('div');
    hudTL.className = 'r3-hud tl'; hudTR.className = 'r3-hud tr'; hudBL.className = 'r3-hud bl';
    [hudTL, hudTR, hudBL].forEach(function (d) { d.setAttribute('aria-hidden', 'true'); host.appendChild(d); });

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: 'default' });
    } catch (e) {
      canvas.remove(); hudTL.remove(); hudTR.remove(); hudBL.remove();
      throw e;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1.5, 0.3, 200);
    const viewDir = new THREE.Vector3(0.12, 0.5, 1).normalize();
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.minDistance = 3;
    controls.maxDistance = 30;
    controls.enablePan = false;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 1.9);
    sun.position.set(-5, 10, 8);
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0xffffff, 0.5);
    rim.position.set(8, 3, -8);
    scene.add(rim);

    let colors = H.colors();
    const reduced = !!H.reduced;
    const FLOOR = -1.1;

    // ---------- 地面的柔和陰影 ----------
    const shadowTex = (function () {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 8, 64, 64, 64);
      gr.addColorStop(0, 'rgba(0,0,0,0.42)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.14)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(c);
    })();
    const glowTex = (function () {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    })();

    // ---------- 兩個立方體（玻璃＋液體） ----------
    const cubes = [0, 1].map(function (k) {
      const grp = new THREE.Group();
      grp.position.x = (k ? 1 : -1) * CX;
      scene.add(grp);
      const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = FLOOR - 0.005;
      grp.add(shadow);
      const liqMat = new THREE.MeshStandardMaterial({ color: 0x88aacc, transparent: true, opacity: 0.16, roughness: 0.15, depthWrite: false, side: THREE.DoubleSide });
      const liq = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), liqMat);
      liq.renderOrder = 2;
      grp.add(liq);
      const edgeMat = new THREE.LineBasicMaterial({ color: 0x5a6878, transparent: true, opacity: 0.7 });
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), edgeMat);
      grp.add(edges);
      // 液面（稍亮的薄片）
      const topMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide });
      const top = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), topMat);
      top.rotation.x = -Math.PI / 2;
      top.renderOrder = 3;
      grp.add(top);
      return { grp: grp, shadow: shadow, liq: liq, liqMat: liqMat, edges: edges, edgeMat: edgeMat, top: top, topMat: topMat, side: S100, target: S100 };
    });
    function layoutCube(cb) {
      const s = cb.side;
      cb.liq.scale.set(s, s, s); cb.liq.position.y = FLOOR + s / 2;
      cb.edges.scale.set(s, s, s); cb.edges.position.y = FLOOR + s / 2;
      cb.top.scale.set(s * 0.995, s * 0.995, 1); cb.top.position.y = FLOOR + s - 0.002;
      cb.shadow.scale.set(s * 1.7, s * 1.7, 1);
    }
    cubes.forEach(layoutCube);

    // ---------- 原子（同一個 InstancedMesh） ----------
    const atomMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.32, metalness: 0.05 });
    const atoms = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 16, 12), atomMat, MAXA);
    atoms.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    atoms.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXA * 3), 3);
    atoms.instanceColor.setUsage(THREE.DynamicDrawUsage);
    atoms.frustumCulled = false;
    atoms.count = 0;
    atoms.renderOrder = 1;
    scene.add(atoms);

    // 反應閃光
    const sprites = [];
    for (let k = 0; k < FL; k++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      sp.visible = false;
      scene.add(sp);
      sprites.push(sp);
    }
    const flashes = [];

    // 各種粒子的原子組成：[顏色鍵, x, y, z, 半徑]
    const RH = 0.042;
    const MOL = {
      HA: [['HA', 0, 0, 0, 0.088], ['Hatom', 0.104, 0.03, 0, RH]],
      A: [['A', 0, 0, 0, 0.092]],
      H: [['H3O', 0, 0, 0, 0.062], ['Hatom', 0.07, 0.035, 0, RH * 0.85], ['Hatom', -0.035, 0.035, 0.06, RH * 0.85], ['Hatom', -0.035, 0.035, -0.06, RH * 0.85]],
      OH: [['OH', 0, 0, 0, 0.066], ['Hatom', 0.078, 0.02, 0, RH * 0.85]]
    };

    // ---------- 粒子 ----------
    let parts = [];
    let lastRun = -1;
    function rnd() { return Math.random() - 0.5; }
    function newPart(c, sp, now, fadeIn) {
      return { c: c, sp: sp, next: null, x: rnd() * 0.9, y: rnd() * 0.9, z: rnd() * 0.9, vx: rnd() * 0.06, vy: rnd() * 0.06, vz: rnd() * 0.06,
        ax: Math.random() * 6.28, ay: Math.random() * 6.28, wa: rnd() * 1.6, born: fadeIn ? now : now - 1e4, die: 0, fly: null, busy: false };
    }
    function effSp(p) { return p.next || p.sp; }
    function counts(c) {
      const n = { HA: 0, A: 0, H: 0, OH: 0 };
      parts.forEach(function (p) {
        if (p.c !== c || p.die) return;
        if (p.fly && p.fly.target) return;        // 正要去反應的離子：反應完就變成水
        n[effSp(p)]++;
      });
      return n;
    }
    function pick(c, sp, k) {
      const pool = parts.filter(function (p) { return p.c === c && !p.die && !p.busy && !(p.fly && p.fly.target) && effSp(p) === sp; });
      const out = [];
      while (out.length < k && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
      return out;
    }
    /** 依頁面給的顆數對帳；有反應就播「離子落下→交接 H+」的動畫 */
    function sync() {
      const snap = H.snapshot(), now = performance.now();
      cubes.forEach(function (cb, k) { cb.target = S100 * Math.cbrt(Math.max(1, snap.cubes[k].V) / 100); if (reduced) { cb.side = cb.target; layoutCube(cb); } });
      if (snap.run !== lastRun) {
        lastRun = snap.run;
        parts = [];
        flashes.length = 0;
        snap.cubes.forEach(function (q, c) {
          ['HA', 'A', 'H', 'OH'].forEach(function (sp) { for (let i = 0; i < q[sp]; i++) parts.push(newPart(c, sp, now, !reduced)); });
        });
        cubes.forEach(function (cb) { cb.side = cb.target; layoutCube(cb); });
      } else {
        snap.cubes.forEach(function (q, c) {
          let cur = counts(c);
          let stagger = 0;
          const step = function () { const d = stagger; stagger = Math.min(stagger + 55, 900); return d; };
          // 加酸：H3O+ 把 H+ 交給共軛鹼
          if (q.HA > cur.HA && q.A < cur.A) {
            pick(c, 'A', Math.min(q.HA - cur.HA, cur.A - q.A)).forEach(function (t) { react(c, 'H', t, 'HA', now + step()); });
          }
          // 加鹼：OH- 從弱酸拿走 H+
          if (q.A > cur.A && q.HA < cur.HA) {
            pick(c, 'HA', Math.min(q.A - cur.A, cur.HA - q.HA)).forEach(function (t) { react(c, 'OH', t, 'A', now + step()); });
          }
          cur = counts(c);
          ['HA', 'A', 'H', 'OH'].forEach(function (sp) {
            const d = q[sp] - cur[sp];
            if (d > 0) {
              for (let i = 0; i < d; i++) {
                const p = newPart(c, sp, now, !reduced);
                if (!reduced && (sp === 'H' || sp === 'OH')) dropIn(p, now + step());
                parts.push(p);
              }
            } else if (d < 0) {
              pick(c, sp, -d).forEach(function (p) { p.die = reduced ? now - FADE : now; });
            }
          });
        });
      }
      liquidColors();
      hud();
      if (reduced) settle(performance.now());
      requestRender();
    }
    function dropIn(p, t0) {
      p.fly = { t0: t0, fx: p.x * 0.6, fy: 1.25, fz: p.z * 0.6, target: null };
    }
    function react(c, ion, target, toSp, t0) {
      target.busy = true;
      target.next = toSp;
      if (reduced) { target.sp = toSp; target.next = null; target.busy = false; return; }
      const p = newPart(c, ion, t0, true);
      p.fly = { t0: t0, fx: rnd() * 0.5, fy: 1.25, fz: rnd() * 0.5, target: target };
      parts.push(p);
    }
    /** 減少動態：不播動畫，直接到最後狀態 */
    function settle(now) {
      parts = parts.filter(function (p) { return !p.die; });
      parts.forEach(function (p) { if (p.next) { p.sp = p.next; p.next = null; } p.busy = false; p.fly = null; p.born = now - 1e4; });
    }

    function liquidColors() {
      cubes.forEach(function (cb, k) {
        cb.liqMat.color.set(H.liquid(k));
        cb.liqMat.opacity = H.uind() ? (colors.dark ? 0.24 : 0.2) : (colors.dark ? 0.1 : 0.08);
      });
    }
    function hud() {
      const h = H.hud();
      hudTL.innerHTML = h.tl; hudTR.innerHTML = h.tr; hudBL.innerHTML = h.bl;
    }
    function applyColors() {
      colors = H.colors();
      cubes.forEach(function (cb) {
        cb.edgeMat.color.set(colors.dark ? 0xb8c6d6 : 0x4d5b6b);
        cb.edgeMat.opacity = colors.dark ? 0.55 : 0.65;
        cb.topMat.opacity = colors.dark ? 0.06 : 0.12;
      });
      liquidColors();
    }

    // ---------- 每一幀 ----------
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e3 = new THREE.Euler(), pv = new THREE.Vector3(), sv = new THREE.Vector3(), off = new THREE.Vector3();
    const tmpC = new THREE.Color();
    let lastT = 0;
    function ease(u) { return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; }
    function step(now) {
      const dt = Math.min(0.05, lastT ? (now - lastT) / 1000 : 0);
      lastT = now;
      cubes.forEach(function (cb) {
        if (Math.abs(cb.side - cb.target) > 1e-4) { cb.side += (cb.target - cb.side) * (1 - Math.exp(-dt / 0.25)); layoutCube(cb); }
      });
      // 布朗運動（只是畫面）
      if (!reduced) {
        parts.forEach(function (p) {
          if (p.fly && now >= p.fly.t0) return;
          const kick = 0.5 * dt;
          p.vx += rnd() * kick; p.vy += rnd() * kick; p.vz += rnd() * kick;
          const sp = Math.hypot(p.vx, p.vy, p.vz), vm = 0.09;
          if (sp > vm) { p.vx *= vm / sp; p.vy *= vm / sp; p.vz *= vm / sp; }
          p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          if (Math.abs(p.x) > 0.45) { p.x = Math.sign(p.x) * 0.45; p.vx = -p.vx; }
          if (Math.abs(p.y) > 0.45) { p.y = Math.sign(p.y) * 0.45; p.vy = -p.vy; }
          if (Math.abs(p.z) > 0.45) { p.z = Math.sign(p.z) * 0.45; p.vz = -p.vz; }
          p.ax += p.wa * dt; p.ay += p.wa * 0.7 * dt;
        });
      }
      // 落下的離子
      parts.forEach(function (p) {
        const f = p.fly;
        if (!f || now < f.t0) return;
        const u = Math.min(1, (now - f.t0) / FLY), e = ease(u);
        const tx = f.target ? f.target.x : f.tx == null ? (f.tx = rnd() * 0.8) : f.tx;
        const ty = f.target ? f.target.y + 0.06 : f.ty == null ? (f.ty = rnd() * 0.8) : f.ty;
        const tz = f.target ? f.target.z : f.tz == null ? (f.tz = rnd() * 0.8) : f.tz;
        p.x = f.fx + (tx - f.fx) * e; p.y = f.fy + (ty - f.fy) * e; p.z = f.fz + (tz - f.fz) * e;
        if (u >= 1) {
          if (f.target) {
            const t = f.target;
            if (t.next) { t.sp = t.next; t.next = null; }
            t.busy = false;
            p.die = now;
            flashes.push({ c: p.c, x: t.x, y: t.y, z: t.z, t0: now, kind: p.sp });
            if (flashes.length > FL) flashes.shift();
          }
          p.fly = null;
        }
      });
      parts = parts.filter(function (p) { return !p.die || now - p.die < FADE; });
    }
    function draw(now) {
      let k = 0;
      for (let i = 0; i < parts.length && k < MAXA; i++) {
        const p = parts[i], cb = cubes[p.c], s = cb.side;
        if (p.fly && now < p.fly.t0) continue;            // 還沒開始落下
        const half = s * 0.92;
        pv.set(cb.grp.position.x + p.x * half, FLOOR + s / 2 + p.y * half, p.z * half);
        let sc = 1;
        if (p.born && now - p.born < FADE) sc = Math.max(0.05, (now - p.born) / FADE);
        if (p.die) sc = Math.max(0.01, 1 - (now - p.die) / FADE);
        e3.set(p.ax, p.ay, 0);
        q.setFromEuler(e3);
        const mol = MOL[p.sp];
        for (let j = 0; j < mol.length && k < MAXA; j++) {
          const at = mol[j];
          off.set(at[1], at[2], at[3]).applyQuaternion(q);
          const r = at[4] * sc;
          sv.set(r, r, r);
          m4.compose(off.add(pv), q, sv);
          atoms.setMatrixAt(k, m4);
          tmpC.set(colors[at[0]] || '#888888');
          atoms.setColorAt(k, tmpC);
          k++;
        }
      }
      atoms.count = k;
      atoms.instanceMatrix.needsUpdate = true;
      if (atoms.instanceColor) atoms.instanceColor.needsUpdate = true;
      for (let s = 0; s < FL; s++) {
        const sp = sprites[s], f = flashes[flashes.length - 1 - s];
        if (!f) { sp.visible = false; continue; }
        const u = (now - f.t0) / 600;
        if (u < 0 || u > 1) { sp.visible = false; continue; }
        const cb = cubes[f.c], half = cb.side * 0.92;
        sp.visible = true;
        sp.position.set(cb.grp.position.x + f.x * half, FLOOR + cb.side / 2 + f.y * half, f.z * half);
        sp.material.color.set(f.kind === 'H' ? colors.H3O : colors.OH);
        sp.material.opacity = 0.9 * (1 - u);
        sp.scale.setScalar(0.12 + 0.35 * u);
      }
    }
    function busy(now) {
      if (reduced) return false;
      return true;   // 布朗運動一直在動；隱藏分頁或切回 2D 時停止
    }

    // ---------- 相機、尺寸、迴圈 ----------
    function fit(force) {
      const span = 2 * CX + 2.6;
      const dist = (span * 0.5) / Math.tan(camera.fov * Math.PI / 360) / Math.min(1.25, camera.aspect);
      if (force) {
        controls.target.set(0, -0.25, 0);
        camera.position.copy(viewDir).multiplyScalar(dist).add(controls.target);
      }
      camera.updateProjectionMatrix();
      controls.update();
    }
    let vw = 0, raf = 0;
    function canvasHeight(w) { return w < 560 ? Math.round(Math.max(420, w * 1.4)) : 440; }
    function resize3() {
      const w = host.clientWidth;
      if (!w) return;
      const h = canvasHeight(w);
      canvas.style.height = h + 'px';
      vw = w;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      fit(false);
      requestRender();
    }
    function frame(t) {
      raf = 0;
      if (!api.active || document.hidden) return;
      const now = performance.now();
      const moved = controls.update();
      step(now);
      draw(now);
      renderer.render(scene, camera);
      if (busy(now) || moved) raf = requestAnimationFrame(frame);
      else lastT = 0;
    }
    function requestRender() {
      if (raf || !api.active || document.hidden) return;
      raf = requestAnimationFrame(frame);
    }
    const ro = window.ResizeObserver ? new ResizeObserver(function () { if (host.clientWidth !== vw) resize3(); }) : null;
    if (ro) ro.observe(host); else window.addEventListener('resize', resize3);
    controls.addEventListener('change', requestRender);
    const onVisible = function () { lastT = 0; if (!document.hidden) requestRender(); };
    document.addEventListener('visibilitychange', onVisible);
    canvas.addEventListener('webglcontextlost', function (ev) {
      ev.preventDefault();
      if (api.active) H.contextLost();
    });

    const api = {
      active: true,
      sync: function () { if (api.active) sync(); },
      onTheme: function () { applyColors(); hud(); requestRender(); },
      resetCamera: function () { fit(true); requestRender(); },
      particles: function () { return parts.length; },
      dispose: function () {
        api.active = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        document.removeEventListener('visibilitychange', onVisible);
        controls.dispose();
        const mats = new Set();
        scene.traverse(function (o) {
          if (o.geometry) o.geometry.dispose();
          if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { mats.add(m); });
        });
        mats.forEach(function (m) { m.dispose(); });
        glowTex.dispose(); shadowTex.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        canvas.remove(); hudTL.remove(); hudTR.remove(); hudBL.remove();
      }
    };

    applyColors();
    const w0 = host.clientWidth;
    if (w0) {
      const h0 = canvasHeight(w0);
      canvas.style.height = h0 + 'px';
      vw = w0;
      renderer.setSize(w0, h0, false);
      camera.aspect = w0 / h0;
    }
    fit(true);
    sync();
    return api;
  }

  window.BufSol3D = { create: create };
})();
