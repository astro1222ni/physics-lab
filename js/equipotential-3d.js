/* equipotential-3d.js — 等位線實驗的 3D 電位地形（three.js 由頁面在切換到 3D 時才載入）
 * 曲面的高度＝導電紙上各點的電位（與 2D 同一個數值解，每隔一個格點取一點）。
 * 用法：Equipotential3D.create({ THREE, OrbitControls }, env) → { update, onTheme, resetCamera, dispose }
 */
(function () {
  'use strict';
  const EC = window.EquipotentialCore;
  const W = EC.SHEET_W, H = EC.SHEET_H;
  const HMAX = 9;             // 電源電壓對應的曲面高度（cm，場景單位）

  function create(lib, env) {
    const THREE = lib.THREE;
    const LD = window.LabDraw;
    const T = env.T;
    const host = env.host;
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('電位的 3D 地形：高度代表電位（可拖曳旋轉、縮放）', '3D landscape of the potential: height = potential (drag to rotate, pinch or scroll to zoom)'));
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

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1.33, 0.5, 2000);
    camera.up.set(0, 0, 1);    // 電位（高度）朝上；必須在建立 OrbitControls 之前設定
    const viewDir = new THREE.Vector3(0.32, -1.25, 1.0).normalize();
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.minDistance = 12;
    controls.maxDistance = 220;
    controls.maxPolarAngle = Math.PI * 0.49;

    const hemi = new THREE.HemisphereLight(0xffffff, 0x8a8a8a, 1.5);
    hemi.position.set(0, 0, 1);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.9);
    sun.position.set(-14, -18, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.radius = 4;
    sun.shadow.bias = -0.0008;
    const sc = sun.shadow.camera;
    sc.left = -W / 2 - 6; sc.right = W / 2 + 6; sc.bottom = -H / 2 - 6; sc.top = H / 2 + 6;
    sc.near = 1; sc.far = 120;
    scene.add(sun);
    scene.add(sun.target);

    const sx = function (x) { return x - W / 2; };
    const sy = function (y) { return y - H / 2; };
    const css = function (c) { const col = new THREE.Color(); col.setStyle(c); return col; };

    function disposeObject(obj) {
      obj.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); });
        }
      });
    }
    function clearGroup(g) {
      while (g.children.length) { const c = g.children.pop(); disposeObject(c); }
    }
    /** 文字標籤（Sprite，一律畫在最上層，有背景色描邊） */
    function label(text, color, size) {
      const c = document.createElement('canvas');
      const g = c.getContext('2d');
      const px = 56;
      g.font = '600 ' + px + 'px ' + LD.FONT;
      const w = Math.ceil(g.measureText(text).width) + 24;
      c.width = w; c.height = Math.ceil(px * 1.5);
      g.font = '600 ' + px + 'px ' + LD.FONT;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 12; g.lineJoin = 'round';
      g.strokeStyle = LD.c['canvas-bg'];
      g.strokeText(text, w / 2, c.height / 2);
      g.fillStyle = color;
      g.fillText(text, w / 2, c.height / 2);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
      sp.scale.set(size * w / c.height, size, 1);
      sp.renderOrder = 3;
      return sp;
    }

    // ---- 場景物件 ----
    const boardGroup = new THREE.Group();    // 底板、紙邊、電位軸（隨主題與電壓重建）
    const elGroup = new THREE.Group();       // 電極
    const lineGroup = new THREE.Group();     // 等高線、量到的等位線、電流線
    const markGroup = new THREE.Group();     // 記錄點
    scene.add(boardGroup, elGroup, lineGroup, markGroup);
    let surf = null, surfGeo = null, surfMat = null;
    const probes = {};

    let k = 0;          // 每伏特的高度（cm/V）
    function heightAt(sol, Veff, x, y) { return EC.potentialAt(sol, x, y) * Veff * k; }

    function buildSurface(d) {
      const sol = d.sol;
      const st = Math.max(1, Math.round(0.25 / sol.h));
      const nx = Math.floor((sol.nx - 1) / st) + 1, ny = Math.floor((sol.ny - 1) / st) + 1;
      const need = nx * ny;
      if (!surfGeo || surfGeo.userData.n !== need || surfGeo.userData.nx !== nx) {
        if (surf) { scene.remove(surf); surfGeo.dispose(); }
        surfGeo = new THREE.BufferGeometry();
        surfGeo.userData = { n: need, nx: nx, ny: ny };
        surfGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(need * 3), 3));
        surfGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(need * 3), 3));
        const idx = [];
        for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
          const a = j * nx + i, b = a + 1, c = a + nx, e = c + 1;
          idx.push(a, b, e, a, e, c);
        }
        surfGeo.setIndex(idx);
        if (!surfMat) surfMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0, side: THREE.DoubleSide });
        surf = new THREE.Mesh(surfGeo, surfMat);
        surf.castShadow = true; surf.receiveShadow = true;
        scene.add(surf);
      }
      const pos = surfGeo.attributes.position.array, colA = surfGeo.attributes.color.array;
      const neg = LD.rgb(LD.c.neg), pos2 = LD.rgb(LD.c.pos), mid = LD.rgb(LD.mix(LD.c.text, LD.c['canvas-bg'], LD.dark ? 0.35 : 0.55));
      const tmp = new THREE.Color();
      const on = d.V0eff > 0;
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const gi = (j * st) * sol.nx + i * st, o = (j * nx + i) * 3;
        const u = sol.V[gi];
        pos[o] = sx(i * st * sol.h); pos[o + 1] = sy(j * st * sol.h); pos[o + 2] = u * d.V0eff * k;
        let r, g, b;
        if (!on) { r = mid[0]; g = mid[1]; b = mid[2]; } else {
          const A = u < 0.5 ? neg : mid, B = u < 0.5 ? mid : pos2, t = u < 0.5 ? u * 2 : (u - 0.5) * 2;
          r = A[0] + (B[0] - A[0]) * t; g = A[1] + (B[1] - A[1]) * t; b = A[2] + (B[2] - A[2]) * t;
        }
        tmp.setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
        colA[o] = tmp.r; colA[o + 1] = tmp.g; colA[o + 2] = tmp.b;
      }
      surfGeo.attributes.position.needsUpdate = true;
      surfGeo.attributes.color.needsUpdate = true;
      surfGeo.computeVertexNormals();
      surfGeo.computeBoundingSphere();
    }

    function buildBoard(d) {
      clearGroup(boardGroup);
      // 實驗桌上的底板（有厚度，接收影子）
      const base = new THREE.Mesh(new THREE.BoxGeometry(W + 2.4, H + 2.4, 0.6),
        new THREE.MeshStandardMaterial({ color: css(LD.mix(LD.c.surface, LD.c.text, LD.dark ? 0.1 : 0.14)), roughness: 0.9 }));
      base.position.set(0, 0, -0.32);
      base.receiveShadow = true;
      boardGroup.add(base);
      // 紙邊
      const edge = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(sx(0), sy(0), 0.01), new THREE.Vector3(sx(W), sy(0), 0.01), new THREE.Vector3(sx(W), sy(H), 0.01), new THREE.Vector3(sx(0), sy(H), 0.01)]);
      boardGroup.add(new THREE.LineLoop(edge, new THREE.LineBasicMaterial({ color: css(LD.c.muted), transparent: true, opacity: 0.7 })));
      // 電位軸（放在紙的左前角，不會被曲面擋住）
      const V0 = d.V0, step = V0 <= 6 ? 1 : V0 <= 12 ? 2 : 4;
      const ax = sx(0) - 1.2, ay = sy(0) - 1.2, top = HMAX + 0.8;
      const pts = [new THREE.Vector3(ax, ay, 0), new THREE.Vector3(ax, ay, top)];
      const ticks = [];
      for (let v = 0; v <= V0 + 1e-9; v += step) {
        const z = v * (HMAX / V0);
        ticks.push(new THREE.Vector3(ax - 0.35, ay, z), new THREE.Vector3(ax + 0.35, ay, z));
        const lb = label(v + ' V', LD.c.muted, 1.25);
        lb.position.set(ax - 2.0, ay, z);
        boardGroup.add(lb);
      }
      const axMat = new THREE.LineBasicMaterial({ color: css(LD.c.text), transparent: true, opacity: 0.75 });
      boardGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), axMat));
      boardGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(ticks), axMat));
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.8, 16), new THREE.MeshStandardMaterial({ color: css(LD.c.text), roughness: 0.6 }));
      cone.rotation.x = Math.PI / 2;
      cone.position.set(ax, ay, top + 0.3);
      boardGroup.add(cone);
      const vl = label(T('電位', 'Potential'), LD.c.text, 1.35);
      vl.position.set(ax, ay, top + 1.7);
      boardGroup.add(vl);
      // x、y 的長度標示
      const xl = label('30 cm', LD.c.muted, 1.15); xl.position.set(0, sy(0) - 2.2, 0); boardGroup.add(xl);
      const yl = label('20 cm', LD.c.muted, 1.15); yl.position.set(sx(W) + 2.8, 0, 0); boardGroup.add(yl);
    }

    function buildElectrodes(d) {
      clearGroup(elGroup);
      const silver = LD.mix(LD.c.surface, LD.c.text, LD.dark ? 0.35 : 0.22);
      d.sol.els.forEach(function (e) {
        const h = Math.max(0.3, (e.V > 0 ? d.V0eff * k : 0) + 0.3);
        const rim = e.sign > 0 ? LD.c.pos : LD.c.neg;
        const mat = new THREE.MeshStandardMaterial({ color: css(LD.mix(silver, rim, 0.18)), metalness: 0.55, roughness: 0.32 });
        let m;
        if (e.kind === 'circle') {
          m = new THREE.Mesh(new THREE.CylinderGeometry(e.r, e.r, h, 40), mat);
          m.rotation.x = Math.PI / 2;
          m.position.set(sx(e.x), sy(e.y), h / 2 - 0.02);
        } else {
          m = new THREE.Mesh(new THREE.BoxGeometry(e.x1 - e.x0, e.y1 - e.y0, h), mat);
          m.position.set(sx((e.x0 + e.x1) / 2), sy((e.y0 + e.y1) / 2), h / 2 - 0.02);
        }
        m.castShadow = true; m.receiveShadow = true;
        elGroup.add(m);
        const lb = label(e.sign > 0 ? '+' : '−', rim, 1.9);
        const c = e.kind === 'circle' ? [e.x, e.y] : [(e.x0 + e.x1) / 2, e.y1 + 0.9];
        lb.position.set(sx(c[0]), sy(c[1]), h + 1.0);
        elGroup.add(lb);
      });
    }

    /** 把紙上的折線貼在曲面上（略高一點，避免被曲面遮住） */
    function drape(pts, d, lift) {
      const out = [];
      pts.forEach(function (p) { out.push(new THREE.Vector3(sx(p[0]), sy(p[1]), heightAt(d.sol, d.V0eff, p[0], p[1]) + lift)); });
      return out;
    }
    function buildLines(d) {
      clearGroup(lineGroup);
      if (d.V0eff <= 0) return;
      // 地形的等高線（每 1 V；電壓高時每 2 V）
      const V0 = d.V0, step = V0 <= 8 ? 1 : 2;
      const conMat = new THREE.LineBasicMaterial({ color: css(LD.c.equi), transparent: true, opacity: 0.9 });
      for (let v = step; v < V0 - 1e-9; v += step) {
        env.contour(v / V0).forEach(function (l) {
          const z = v * (d.V0eff / V0) * k + 0.05;
          const g = new THREE.BufferGeometry().setFromPoints(l.pts.map(function (p) { return new THREE.Vector3(sx(p[0]), sy(p[1]), z); }));
          lineGroup.add(l.closed ? new THREE.LineLoop(g, conMat) : new THREE.Line(g, conMat));
        });
      }
      // 電流線（沿著最陡的下坡）
      if (d.stream) {
        const sMat = new THREE.LineBasicMaterial({ color: css(LD.c.accent), transparent: true, opacity: 0.95 });
        d.stream.forEach(function (l) {
          lineGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(drape(l.pts, d, 0.07)), sMat));
        });
      }
      // 量到的等位線
      if (d.drawLines) {
        d.groups.forEach(function (g) {
          if (!g.path || g.pts.length < 2) return;
          const m = new THREE.LineBasicMaterial({ color: css(d.potColor(g.V)) });
          lineGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(drape(g.path, d, 0.09)), m));
        });
      }
    }

    function buildMarks(d) {
      clearGroup(markGroup);
      const geo = new THREE.SphereGeometry(0.26, 16, 12);
      const mats = {};
      d.groups.forEach(function (g) {
        const c = d.potColor(g.V);
        const mat = mats[c] || (mats[c] = new THREE.MeshStandardMaterial({ color: css(c), roughness: 0.4 }));
        g.idx.forEach(function (i) {
          const r = d.recs[i];
          const m = new THREE.Mesh(geo, mat);
          m.position.set(sx(r.x), sy(r.y), heightAt(d.sol, d.V0eff, r.x, r.y) + 0.22);
          m.castShadow = true;
          markGroup.add(m);
        });
      });
    }

    function makeProbe(color, name) {
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: css(color), roughness: 0.35, metalness: 0.1 });
      const needle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 10), new THREE.MeshStandardMaterial({ color: css(LD.mix(LD.c.surface, LD.c.text, 0.45)), metalness: 0.7, roughness: 0.3 }));
      needle.rotation.x = Math.PI / 2; needle.position.z = 0.6;
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 2.6, 18), mat);
      handle.rotation.x = Math.PI / 2; handle.position.z = 1.2 + 1.3;
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), mat);
      cap.position.z = 1.2 + 2.6;
      [needle, handle, cap].forEach(function (m) { m.castShadow = true; g.add(m); });
      const lb = label(name, color, 1.3);
      lb.position.z = 1.2 + 2.6 + 0.9;
      g.add(lb);
      scene.add(g);
      return g;
    }
    function buildProbes() {
      ['n1', 'n2'].forEach(function (id) { if (probes[id]) { scene.remove(probes[id]); disposeObject(probes[id]); } });
      probes.n2 = makeProbe(LD.c.pos, 'N2');
      probes.n1 = makeProbe(LD.dark ? LD.mix(LD.c.field, LD.c.muted, 0.4) : LD.c.field, 'N1');
    }

    // ---- 相機：讓整張紙與電位軸都在畫面裡 ----
    let fitKey = '';
    function fit(force) {
      const key = camera.aspect.toFixed(3);
      if (!force && key === fitKey) return;
      fitKey = key;
      const center = new THREE.Vector3(0, 0, HMAX * 0.4);
      const dir = force || !fitKey ? viewDir.clone() : camera.position.clone().sub(controls.target).normalize();
      const fwd = dir.clone().negate();
      const right = new THREE.Vector3().crossVectors(fwd, camera.up).normalize();
      const upv = new THREE.Vector3().crossVectors(right, fwd).normalize();
      const tv = Math.tan(camera.fov * Math.PI / 360), th = tv * camera.aspect;
      let dist = 1;
      [-W / 2 - 5, W / 2 + 3].forEach(function (X) {
        [-H / 2 - 2.5, H / 2 + 1].forEach(function (Y) {
          [-0.6, HMAX + 1.5].forEach(function (Z) {
            const c = new THREE.Vector3(X, Y, Z).sub(center);
            const depth = c.dot(dir);
            dist = Math.max(dist, depth + Math.abs(c.dot(right)) / th, depth + Math.abs(c.dot(upv)) / tv);
          });
        });
      });
      controls.target.copy(center);
      camera.position.copy(center).addScaledVector(dir, dist * 0.94);
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
    function resize3() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      fit(false);
      requestRender();
    }
    const ro = window.ResizeObserver ? new ResizeObserver(resize3) : null;
    if (ro) ro.observe(canvas); else window.addEventListener('resize', resize3);
    controls.addEventListener('change', requestRender);
    const onVisible = function () { if (!document.hidden) requestRender(); };
    document.addEventListener('visibilitychange', onVisible);
    canvas.addEventListener('webglcontextlost', function (ev) {
      ev.preventDefault();
      if (!api.active) return;   // 切回 2D 時自己釋放的，不是意外中斷
      if (env.onLost) env.onLost();
    });

    // ---- 依資料更新（只重建有變的部分） ----
    const keys = {};
    function update() {
      if (!api.active) return;
      const d = env.data();
      k = HMAX / (d.V0 || 1);
      const theme = LD.ver;
      const kSurf = [d.sol.key, d.V0eff, d.V0, theme].join('|');
      if (keys.surf !== kSurf) { keys.surf = kSurf; buildSurface(d); }
      const kBoard = [d.V0, theme].join('|');
      if (keys.board !== kBoard) { keys.board = kBoard; buildBoard(d); }
      const kEl = [d.sol.key, d.V0eff, d.V0, theme].join('|');
      if (keys.el !== kEl) { keys.el = kEl; buildElectrodes(d); }
      const kLines = [d.sol.key, d.V0eff, d.V0, theme, !!d.stream, d.drawLines, d.recs.length, d.groups.length,
        d.recs.length ? d.recs[d.recs.length - 1].x : 0].join('|');
      if (keys.lines !== kLines) { keys.lines = kLines; buildLines(d); }
      const kMarks = [d.sol.key, d.V0eff, theme, d.recs.length, d.recs.length ? d.recs[d.recs.length - 1].x : 0, d.groups.length].join('|');
      if (keys.marks !== kMarks) { keys.marks = kMarks; buildMarks(d); }
      if (keys.probes !== theme) { keys.probes = theme; buildProbes(); }
      [['n1', d.n1], ['n2', d.n2]].forEach(function (p) {
        const g = probes[p[0]];
        g.position.set(sx(p[1].x), sy(p[1].y), heightAt(d.sol, d.V0eff, p[1].x, p[1].y));
      });
      requestRender();
    }

    const api = {
      active: true,
      update: update,
      onTheme: function () { update(); },
      resetCamera: function () { fit(true); requestRender(); },
      dispose: function () {
        api.active = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        document.removeEventListener('visibilitychange', onVisible);
        controls.dispose();
        disposeObject(scene);
        renderer.dispose();
        renderer.forceContextLoss();
        canvas.remove();
      }
    };

    const w0 = canvas.clientWidth, h0 = canvas.clientHeight;
    if (w0 && h0) { renderer.setSize(w0, h0, false); camera.aspect = w0 / h0; camera.updateProjectionMatrix(); }
    fit(true);
    update();
    return api;
  }

  window.Equipotential3D = { create: create };
})();
