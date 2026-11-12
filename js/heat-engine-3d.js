/* heat-engine-3d.js — 熱機循環的 3D 檢視（three.js 由頁面在切換到 3D 時才載入）
 * 場景：理想氣體的狀態曲面 T = PV/(nR)（V、P 為水平兩軸，T 為高度），循環畫成曲面上的管狀路徑，
 * 狀態小球沿路徑移動並有落到底面的垂直虛線；底面是同一個循環的 P–V 圖（面積依熱機／冰箱上色）。
 * 用法：HeatEngine3D.create({ THREE, OrbitControls }, env) → { active, update, rebuild, onTheme, resetCamera, dispose }
 * env：host、core、T、state()（循環、座標範圍、目前狀態、等溫線溫度、溫度色階）、tokens()、lost()
 */
(function () {
  'use strict';
  const SX = 22, SY = 22, SZ = 13;     // 場景大小：V 方向、P 方向、T 方向（場景單位）

  function niceCeil(x) {
    const p = Math.pow(10, Math.floor(Math.log10(x))), m = x / p;
    return (m <= 1 ? 1 : m <= 1.5 ? 1.5 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 3 ? 3 : m <= 4 ? 4 : m <= 5 ? 5 : m <= 6 ? 6 : m <= 8 ? 8 : 10) * p;
  }

  function create(lib, env) {
    const THREE = lib.THREE;
    const LD = window.LabDraw;
    const T = env.T, C = env.core;
    const host = env.host;
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('3D 狀態曲面：水平兩軸是體積與壓力，高度是溫度；循環是曲面上的一條路徑（可拖曳旋轉、縮放）',
      '3D state surface: the horizontal axes are volume and pressure, the height is temperature; the cycle is a path on the surface (drag to rotate, scroll or pinch to zoom)'));
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

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1.6, 0.5, 2000);
    camera.up.set(0, 0, 1);      // 溫度朝上；必須在建立 OrbitControls 之前設定
    const viewDir = new THREE.Vector3(-0.55, -1.4, 1.0).normalize();   // 從原點那一側看：V 向右、P 向後、T 向上
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.minDistance = 14;
    controls.maxDistance = 200;

    const hemi = new THREE.HemisphereLight(0xffffff, 0x8a8a8a, 1.6);
    hemi.position.set(0, 0, 1);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(-10, -24, 40);
    scene.add(sun);

    const css = function (c) { const col = new THREE.Color(); col.setStyle(c); return col; };
    function disposeObject(obj) {
      obj.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); });
        }
      });
    }
    function clearGroup(g) { while (g.children.length) { const c = g.children.pop(); disposeObject(c); } }
    /** 文字標籤（2D 畫布做成的 Sprite，畫在最上層；parts 陣列中的子陣列是下標） */
    function label(parts, color, size) {
      if (typeof parts === 'string') parts = [parts];
      const c = document.createElement('canvas');
      const g = c.getContext('2d');
      const px = 56, sp = Math.round(px * 0.7);
      const fm = '600 ' + px + 'px ' + LD.FONT, fs = '600 ' + sp + 'px ' + LD.FONT;
      let w = 0;
      parts.forEach(function (p) { g.font = Array.isArray(p) ? fs : fm; w += g.measureText(Array.isArray(p) ? p[0] : p).width; });
      c.width = Math.ceil(w) + 26; c.height = Math.ceil(px * 1.55);
      let x = 13;
      g.textBaseline = 'middle'; g.lineJoin = 'round';
      parts.forEach(function (p) {
        const sub = Array.isArray(p), t = sub ? p[0] : p, y = c.height / 2 + (sub ? px * 0.26 : 0);
        g.font = sub ? fs : fm;
        g.lineWidth = 12; g.strokeStyle = LD.c['canvas-bg']; g.strokeText(t, x, y);
        g.fillStyle = color; g.fillText(t, x, y);
        x += g.measureText(t).width;
      });
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
      s.scale.set(size * c.width / c.height, size, 1);
      s.renderOrder = 5;
      return s;
    }

    // ---- 群組 ----
    const axesGroup = new THREE.Group();     // 底面、格線、座標軸與刻度
    const surfGroup = new THREE.Group();     // 狀態曲面與等溫線
    const cycGroup = new THREE.Group();      // 循環管線、頂點、底面投影
    const dynGroup = new THREE.Group();      // 狀態小球與落線
    scene.add(axesGroup, surfGroup, cycGroup, dynGroup);

    // 目前的換算
    let s0 = null, Vmax = 10, Pmax = 1000, Ttop = 1000, nR = 8.314;
    const xV = function (V) { return V / Vmax * SX - SX / 2; };          // V（L）→ 場景 x
    const yP = function (P) { return P / Pmax * SY - SY / 2; };          // P（kPa）→ 場景 y
    const zT = function (Tk) { return Tk / Ttop * SZ; };                 // T（K）→ 場景高度

    function buildAxes(tok) {
      clearGroup(axesGroup);
      const ax = s0.axis;
      // 底板
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(SX, SY), new THREE.MeshStandardMaterial({
        color: css(LD.mix(LD.c.surface, LD.c.text, LD.dark ? 0.06 : 0.04)), roughness: 0.95, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
      floor.position.z = -0.02;
      axesGroup.add(floor);
      // 格線（V、P 兩個方向）
      const gpts = [], gmin = [];
      for (let v = 0; v <= ax.V + 1e-9; v += ax.sV / 5) {
        const major = Math.abs(v / ax.sV - Math.round(v / ax.sV)) < 1e-6;
        (major ? gpts : gmin).push(new THREE.Vector3(xV(v), -SY / 2, 0), new THREE.Vector3(xV(v), SY / 2, 0));
      }
      for (let p = 0; p <= ax.P + 1e-9; p += ax.sP / 5) {
        const major = Math.abs(p / ax.sP - Math.round(p / ax.sP)) < 1e-6;
        (major ? gpts : gmin).push(new THREE.Vector3(-SX / 2, yP(p), 0), new THREE.Vector3(SX / 2, yP(p), 0));
      }
      axesGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(gpts), new THREE.LineBasicMaterial({ color: css(LD.c.text), transparent: true, opacity: LD.dark ? 0.16 : 0.14 })));
      axesGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(gmin), new THREE.LineBasicMaterial({ color: css(LD.c.text), transparent: true, opacity: LD.dark ? 0.06 : 0.05 })));
      // 三個座標軸（從原點出發，末端有圓錐）
      const axMat = new THREE.LineBasicMaterial({ color: css(LD.c.text), transparent: true, opacity: 0.8 });
      const coneMat = new THREE.MeshStandardMaterial({ color: css(LD.c.text), roughness: 0.6 });
      const o = new THREE.Vector3(-SX / 2, -SY / 2, 0);
      // V、P 軸從原點出發；T 軸立在右前角（V 最大、P = 0），刻度數字才不會和 P 軸的數字擠在一起
      const oT = new THREE.Vector3(SX / 2, -SY / 2, 0);
      const ends = [new THREE.Vector3(SX / 2 + 1.4, -SY / 2, 0), new THREE.Vector3(-SX / 2, SY / 2 + 1.4, 0), new THREE.Vector3(SX / 2, -SY / 2, SZ + 1.2)];
      ends.forEach(function (e, i) {
        axesGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([i === 2 ? oT : o, e]), axMat));
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.8, 16), coneMat);
        if (i === 0) cone.rotation.z = -Math.PI / 2;
        else if (i === 2) cone.rotation.x = Math.PI / 2;
        cone.position.copy(e);
        axesGroup.add(cone);
      });
      // 刻度與數字
      const tk = [];
      const fmt = function (v, st) { return st < 1 ? v.toFixed(st < 0.1 ? 2 : 1) : String(Math.round(v)); };
      for (let v = 0; v <= ax.V + 1e-9; v += ax.sV) {
        tk.push(new THREE.Vector3(xV(v), -SY / 2, 0), new THREE.Vector3(xV(v), -SY / 2 - 0.45, 0));
        const lb = label(fmt(v, ax.sV), LD.c.muted, 1.1); lb.position.set(xV(v), -SY / 2 - 1.3, 0); axesGroup.add(lb);
      }
      for (let p = ax.sP; p <= ax.P + 1e-9; p += ax.sP) {
        tk.push(new THREE.Vector3(-SX / 2, yP(p), 0), new THREE.Vector3(-SX / 2 - 0.45, yP(p), 0));
        const lb = label(fmt(p, ax.sP), LD.c.muted, 1.1); lb.position.set(-SX / 2 - 1.9, yP(p), 0); axesGroup.add(lb);
      }
      const tStep = niceCeil(Ttop / 5) === Ttop ? Ttop / 5 : niceCeil(Ttop / 5);
      for (let t = tStep; t <= Ttop + 1e-9; t += tStep) {
        tk.push(new THREE.Vector3(SX / 2, -SY / 2, zT(t)), new THREE.Vector3(SX / 2 + 0.35, -SY / 2 - 0.35, zT(t)));
        const lb = label(String(Math.round(t)), LD.c.muted, 1.1); lb.position.set(SX / 2 + 1.5, -SY / 2 - 1.1, zT(t)); axesGroup.add(lb);
      }
      axesGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(tk), axMat));
      const lv = label(['V', ' (L)'], LD.c.text, 1.25); lv.position.set(SX * 0.18, -SY / 2 - 3.3, 0); axesGroup.add(lv);
      const lp = label(['P', ' (kPa)'], LD.c.text, 1.25); lp.position.set(-SX / 2 - 0.4, SY / 2 + 2.6, 0); axesGroup.add(lp);
      const lt = label(['T', ' (K)'], LD.c.text, 1.25); lt.position.set(SX / 2, -SY / 2, SZ + 2.4); axesGroup.add(lt);
      void tok;
    }

    // ---- 狀態曲面 T = PV/(nR)：只畫 T ≤ Ttop 的部分（高溫的角落切掉，邊緣用細格子） ----
    function buildSurface(tok) {
      clearGroup(surfGroup);
      if (!s0.show3.surf && !s0.show3.iso) return;
      if (s0.show3.surf) {
        const N = 90, pos = [], col = [], idx = [], id = new Int32Array((N + 1) * (N + 1)).fill(-1);
        const tmp = new THREE.Color();
        // 曲面上 T 超過 Ttop 的地方，把頂點沿 P 方向拉回 T = Ttop 的曲線上，邊緣就會是平滑的等溫線
        for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
          const V = Math.max(1e-6, i / N * Vmax), P = j / N * Pmax;
          let Tk = P * V / nR, Pp = P;
          if (Tk > Ttop) { Pp = Ttop * nR / V; Tk = Ttop; }
          id[j * (N + 1) + i] = pos.length / 3;
          pos.push(xV(V), yP(Pp), zT(Tk));
          tmp.setStyle(s0.tempColor(Tk));
          col.push(tmp.r, tmp.g, tmp.b);
        }
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
          const a = id[j * (N + 1) + i], b = id[j * (N + 1) + i + 1], c = id[(j + 1) * (N + 1) + i], d = id[(j + 1) * (N + 1) + i + 1];
          // 四個角都被拉回同一條等溫線時，這一格面積為零，略過
          const P0 = pos[a * 3 + 1], P3 = pos[d * 3 + 1], P1 = pos[b * 3 + 1], P2 = pos[c * 3 + 1];
          if (Math.abs(P0 - P2) < 1e-6 && Math.abs(P1 - P3) < 1e-6) continue;
          idx.push(a, b, d, a, d, c);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        geo.setIndex(idx);
        geo.computeVertexNormals();
        const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0, transparent: true, opacity: LD.dark ? 0.5 : 0.46, side: THREE.DoubleSide, depthWrite: false });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.renderOrder = 1;
        surfGroup.add(mesh);
      }
      if (s0.show3.iso) {
        s0.isoLevels.forEach(function (Tk) {
          if (Tk > Ttop) return;
          const pts = [], k = nR * Tk, V0 = Math.max(k / Pmax, Vmax * 0.002);
          if (V0 >= Vmax) return;
          for (let i = 0; i <= 80; i++) {
            const V = V0 * Math.pow(Vmax / V0, i / 80);
            pts.push(new THREE.Vector3(xV(V), yP(k / V), zT(Tk) + 0.02));
          }
          const c = s0.tempColor(Tk);
          surfGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: css(LD.dark ? LD.shade(c, 0.25) : LD.shade(c, -0.2)), transparent: true, opacity: 0.85 })));
          const lb = label(Math.round(Tk) + ' K', LD.dark ? LD.shade(c, 0.25) : LD.shade(c, -0.3), 0.85);
          const Vl = V0 * Math.pow(Vmax / V0, 0.62);
          lb.position.set(xV(Vl) + 0.6, yP(k / Vl) + 0.3, zT(Tk) + 0.5);
          surfGroup.add(lb);
        });
      }
    }

    // ---- 循環：管狀路徑（依過程上色）、編號頂點、底面投影與面積 ----
    let segMeshes = [];
    function buildCycle(tok) {
      clearGroup(cycGroup);
      segMeshes = [];
      const cyc = s0.cyc;
      if (!cyc) return;
      const kc = { isoT: tok.isoT, adiabat: tok.adia, isoV: tok.isoV, isoP: tok.isoP, line: tok.line };
      const proj = [];
      cyc.segs.forEach(function (s, i) {
        const pts = [];
        for (let k = 0; k <= 64; k++) {
          const q = s.at(k / 64);
          const p = new THREE.Vector3(xV(q.V * 1e3), yP(q.P / 1e3), zT(q.T));
          pts.push(p);
          proj.push(new THREE.Vector2(p.x, p.y));
        }
        const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
        const color = css(kc[s.kind] || tok.line);
        const mat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.38, metalness: 0.1, emissive: color, emissiveIntensity: 0 });
        const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 96, 0.17, 10, false), mat);
        mesh.renderOrder = 2;
        cycGroup.add(mesh);
        segMeshes.push(mesh);
        // 絕熱段：管子外面加一圈虛線樣式的小環，和 2D 的虛線對應
        if (s.kind === 'adiabat') {
          const ringMat = new THREE.MeshStandardMaterial({ color: css(LD.c['canvas-bg']), roughness: 0.6 });
          for (let k = 1; k < 12; k++) {
            const t = k / 12, p = curve.getPointAt(t), tg = curve.getTangentAt(t);
            const ring = new THREE.Mesh(new THREE.TorusGeometry(0.175, 0.04, 6, 16), ringMat);
            ring.position.copy(p);
            ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tg);
            cycGroup.add(ring);
          }
        }
        // 方向箭頭（路徑中點的小圓錐）
        const mid = curve.getPointAt(0.5), tg = curve.getTangentAt(0.5);
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.0, 18), new THREE.MeshStandardMaterial({ color: color, roughness: 0.4 }));
        cone.position.copy(mid);
        cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tg);
        cycGroup.add(cone);
      });
      // 頂點與編號
      const vMat = new THREE.MeshStandardMaterial({ color: css(LD.c.text), roughness: 0.5 });
      const vGeo = new THREE.SphereGeometry(0.28, 18, 12);
      cyc.verts.forEach(function (s, i) {
        const p = new THREE.Vector3(xV(s.V * 1e3), yP(s.P / 1e3), zT(s.T));
        const m = new THREE.Mesh(vGeo, vMat); m.position.copy(p); cycGroup.add(m);
        const lb = label(String(i + 1), LD.c.text, 1.05); lb.position.set(p.x, p.y, p.z + 0.95); cycGroup.add(lb);
      });
      // 底面投影：面積（熱機橘、冰箱藍）與路徑
      if (s0.show3.proj) {
        const fillCol = css(cyc.Wout >= 0 ? tok.eng : tok.fri);
        const addFill = function (pts2) {
          const shape = new THREE.Shape(pts2);
          const m = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: fillCol, transparent: true, opacity: LD.dark ? 0.3 : 0.26, side: THREE.DoubleSide, depthWrite: false }));
          m.position.z = 0.01;
          cycGroup.add(m);
        };
        if (cyc.type === 'custom' && cyc.crossings > 0) {
          C.loops(cyc.verts.map(function (s) { return { V: s.V * 1e3, P: s.P / 1e3 }; })).forEach(function (l) {
            const sgn = l.area >= 0 ? 1 : -1;
            const m = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(l.pts.map(function (q) { return new THREE.Vector2(xV(q.V), yP(q.P)); }))),
              new THREE.MeshBasicMaterial({ color: css(sgn > 0 ? tok.eng : tok.fri), transparent: true, opacity: LD.dark ? 0.3 : 0.26, side: THREE.DoubleSide, depthWrite: false }));
            m.position.z = 0.01;
            cycGroup.add(m);
          });
        } else addFill(proj);
        const lp = proj.map(function (p) { return new THREE.Vector3(p.x, p.y, 0.03); });
        cycGroup.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(lp), new THREE.LineBasicMaterial({ color: css(LD.c.text), transparent: true, opacity: 0.6 })));
      }
    }

    // ---- 狀態小球、落到底面的垂直虛線、底面的投影點 ----
    let ball = null, ballMat = null, drop = null, dot = null;
    function buildDyn() {
      clearGroup(dynGroup);
      ballMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.05, emissive: 0x000000 });
      ball = new THREE.Mesh(new THREE.SphereGeometry(0.5, 28, 18), ballMat);
      ball.renderOrder = 4;
      dynGroup.add(ball);
      const dg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)]);
      drop = new THREE.Line(dg, new THREE.LineDashedMaterial({ color: css(LD.c.text), dashSize: 0.35, gapSize: 0.25, transparent: true, opacity: 0.75 }));
      dynGroup.add(drop);
      dot = new THREE.Mesh(new THREE.CircleGeometry(0.3, 24), new THREE.MeshBasicMaterial({ color: css(LD.c.text), transparent: true, opacity: 0.85 }));
      dot.position.z = 0.04;
      dynGroup.add(dot);
    }
    function moveDyn() {
      const cs = s0.cur;
      if (!cs || !ball) return;
      const x = xV(cs.V), y = yP(cs.P), z = zT(cs.T);
      ball.position.set(x, y, z);
      const c = css(s0.tempColor(cs.T));
      ballMat.color.copy(c);
      ballMat.emissive.copy(c).multiplyScalar(LD.dark ? 0.35 : 0.15);
      const a = drop.geometry.attributes.position.array;
      a[0] = x; a[1] = y; a[2] = z; a[3] = x; a[4] = y; a[5] = 0.02;
      drop.geometry.attributes.position.needsUpdate = true;
      drop.computeLineDistances();
      dot.position.x = x; dot.position.y = y;
      segMeshes.forEach(function (m, i) { m.material.emissiveIntensity = i === s0.seg ? (LD.dark ? 0.55 : 0.35) : 0; });
    }

    // ---- 相機：讓整個盒子（三軸與標籤）都在畫面裡 ----
    let fitKey = '';
    function fit(force) {
      const key = camera.aspect.toFixed(3);
      if (!force && key === fitKey) return;
      fitKey = key;
      const center = new THREE.Vector3(0, 0, SZ * 0.38);
      const dir = force ? viewDir.clone() : camera.position.clone().sub(controls.target).normalize();
      const fwd = dir.clone().negate();
      const right = new THREE.Vector3().crossVectors(fwd, camera.up).normalize();
      const upv = new THREE.Vector3().crossVectors(right, fwd).normalize();
      const tv = Math.tan(camera.fov * Math.PI / 360), th = tv * camera.aspect;
      let dist = 1;
      [-SX / 2 - 3, SX / 2 + 4].forEach(function (X) {
        [-SY / 2 - 3, SY / 2 + 3.5].forEach(function (Y) {
          [-0.5, SZ + 3].forEach(function (Z) {
            const c = new THREE.Vector3(X, Y, Z).sub(center);
            const depth = c.dot(dir);
            dist = Math.max(dist, depth + Math.abs(c.dot(right)) / th, depth + Math.abs(c.dot(upv)) / tv);
          });
        });
      });
      controls.target.copy(center);
      camera.position.copy(center).addScaledVector(dir, dist * (camera.aspect < 1 ? 0.9 : 0.92));
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
      if (env.lost) env.lost();
    });

    // ---- 依資料更新（只重建有變的部分；狀態小球每格都移動） ----
    const keys = {};
    function update() {
      if (!api.active) return;
      s0 = env.state();
      if (!s0.cyc) return;
      const tok = env.tokens ? env.tokens() : {};
      const cyc = s0.cyc;
      nR = cyc.n * C.R;
      Vmax = s0.axis.V; Pmax = s0.axis.P;
      // 溫度軸：最高溫再高一些，取整齊的數；自訂循環固定由座標範圍決定上限（拖曳時軸不跳動）
      const Tneed = Math.max(cyc.Tmax * 1.18, 100);
      if (!keys.Ttop || Tneed > keys.Ttop || Tneed < keys.Ttop * 0.5) keys.Ttop = niceCeil(Tneed);
      Ttop = keys.Ttop;
      const theme = LD.ver;
      const kAx = [Vmax, Pmax, Ttop, theme, window.LabSettings && window.LabSettings.lang].join('|');
      if (keys.ax !== kAx) { keys.ax = kAx; buildAxes(tok); }
      const kS = [kAx, nR, s0.show3.surf, s0.show3.iso, s0.Trng[0], s0.Trng[1], s0.isoLevels.join(',')].join('|');
      if (keys.surf !== kS) { keys.surf = kS; buildSurface(tok); }
      const kC = [kAx, s0.key, s0.show3.proj].join('|');
      if (keys.cyc !== kC) { keys.cyc = kC; buildCycle(tok); }
      if (keys.dyn !== theme) { keys.dyn = theme; buildDyn(); }
      moveDyn();
      requestRender();
    }

    const api = {
      active: true,
      update: update,
      rebuild: function () { keys.cyc = ''; update(); },
      onTheme: function () { keys.ax = ''; keys.surf = ''; keys.cyc = ''; keys.dyn = ''; update(); },
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

  window.HeatEngine3D = { create: create };
})();
