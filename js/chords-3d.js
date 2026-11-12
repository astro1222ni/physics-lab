/*
 * chords-3d.js — 「和弦的頻率比」的 3D 檢視（three.js）：三個音畫出的立體李薩如曲線
 *
 * 由 js/chords.js 在使用者按「3D 曲線」時才載入（three.js 也是那時才以 import() 載入）；切回 2D 時整個釋放。
 * 用法：window.Chords3D.create({ THREE, OrbitControls }, 容器, bridge) → { active, update, onTheme, resetCamera, face, toggleGrow, dispose }
 *
 * 曲線：開著的音由低到高的前三個 f1 < f2 < f3，點 (x, y, z) = S·(sin 2πf1t, sin 2πf2t, sin 2πf3t)，t 從 0 到「顯示的時間」。
 *   （一律用正弦，不管音色；和 2D 波形用同一組頻率 ChordsCore.analyze(...).act[i].f。）
 *   純律：三個頻率的比是整數 a : b : c，t = T（= 1 ÷ 虛擬基頻）時三個正弦同時回到起點，曲線閉合成一個結。
 *   平均律：比是無理數，曲線永遠不會閉合；每過一個「純律週期」T_J 就錯開一點（2D 讀數的「錯開角度」）。
 *   有第四個音時，它的 sin 用顏色表示（第四維）。
 * 三面牆上是投影：地板 = 從上面看（x–y），後牆 = 從正面看（x–z），側牆 = 從側面看（y–z），各是兩個音的平面李薩如圖形。
 * 第一個週期（純律 T、平均律 T_J）用粗管子畫；之後的部分用細線，平均律時就看得到一圈一圈錯開。
 * 「讓曲線長出來」：約 7 秒把曲線從 t = 0 畫到「顯示的時間」，頭端一顆球；放慢倍數 = 7000 ÷ 顯示的毫秒數。
 * 用正交投影（OrthographicCamera），所以從上面、正面、側面看到的就是牆上的那個平面圖形。
 */
(function () {
  'use strict';
  const FONT = 'system-ui, -apple-system, "Segoe UI", "Noto Sans TC", "PingFang TC", sans-serif';
  const RES = 3;
  const PI = Math.PI, DEG = PI / 180, TAU = 2 * PI;
  const S = 2;              // 振幅 1 的長度
  const W = S + 0.32;       // 牆的位置
  const GROW_SEC = 7;
  const LINE_MIN = 400, LINE_MAX = 60000, LINE_PER_CYCLE = 28;
  const TUBE_MIN = 120, TUBE_MAX = 6000, TUBE_PER_CYCLE = 64;

  function create(lib, host, B) {
    const THREE = lib.THREE;
    const CC = B.CC, T = B.T, D = B.D, state = B.state;
    const alpha = D.alpha;
    let C = B.colors();
    const isDark = function () { return !!D.dark; };

    // ---------- 畫布與資訊列 ----------
    const wrap = document.createElement('div');
    wrap.className = 't3-wrap';
    const canvas = document.createElement('canvas');
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', T('和弦的 3D 曲線：最低的三個音分別當作 x、y、z 方向的正弦振動，畫出一條立體曲線；純律時曲線在一個週期後閉合成結，平均律時永遠閉不起來。三面牆上是從上面、正面、側面看的投影。拖曳旋轉，滾輪或雙指縮放，方向鍵也可以轉動。',
      '3D curve of the chord: the three lowest notes drive sine motions along x, y and z. In just intonation the curve closes into a knot after one period; in equal temperament it never closes. The three walls show the views from the top, the front and the side. Drag to rotate, scroll or pinch to zoom; the arrow keys also rotate.'));
    wrap.appendChild(canvas);
    const hud = document.createElement('div');
    hud.className = 't3-hud';
    hud.setAttribute('aria-hidden', 'true');
    hud.innerHTML = '<div class="tl"><span data-k="eq"></span><span class="p" data-k="p"></span><span class="m" data-k="w"></span></div><div class="bl"><span class="p" data-k="g"></span><span class="m" data-k="tip"></span></div>';
    let tipGone = false;
    function hideTip() { if (!tipGone) { tipGone = true; setHud('tip', ''); } }
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

    const scene = new THREE.Scene();
    let cw = 300, ch = 200, narrow = false;
    let viewH = 8;
    const camera = new THREE.OrthographicCamera(-8, 8, 6, -6, 0.1, 400);
    camera.up.set(0, 0, 1);
    const CAM_DIST = 60;
    function setFrustum() {
      const a = cw / Math.max(1, ch);
      camera.left = -viewH * a / 2; camera.right = viewH * a / 2;
      camera.top = viewH / 2; camera.bottom = -viewH / 2;
      camera.updateProjectionMatrix();
    }

    // ---------- 視角控制 ----------
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.rotateSpeed = 0.85;
    controls.screenSpacePanning = true;
    controls.minZoom = 0.25;
    controls.maxZoom = 10;
    let lastZoom = 1;
    controls.addEventListener('start', function () { hideTip(); });

    // ---------- 光線與環境反光 ----------
    const hemi = new THREE.HemisphereLight(0xffffff, 0x3a4250, 0.9);
    hemi.position.set(0, 0, 1);
    scene.add(hemi);
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.8);
    keyLight.position.set(6, -10, 14);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
    fillLight.position.set(-8, 6, 3);
    scene.add(fillLight);
    const pmrem = new THREE.PMREMGenerator(renderer);
    let envRT = null;
    function buildEnv() {
      if (envRT) { envRT.dispose(); envRT = null; }
      const s = new THREE.Scene();
      const g = new THREE.SphereGeometry(10, 32, 16);
      g.rotateX(PI / 2);
      const pos = g.attributes.position, cols = new Float32Array(pos.count * 3);
      const top = new THREE.Color(isDark() ? 0x5d6a80 : 0xffffff), bot = new THREE.Color(isDark() ? 0x0a0d12 : 0x7d8794);
      const c = new THREE.Color();
      for (let i = 0; i < pos.count; i++) {
        const u = Math.max(0, Math.min(1, (pos.getZ(i) / 10 + 1) / 2));
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
    function V(x, y, z) { return new THREE.Vector3(x, y, z); }
    function segs(pairs, color, opacity) {
      const pts = [];
      pairs.forEach(function (p) { pts.push(p[0], p[1]); });
      const l = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: opacity, depthWrite: false }));
      l.renderOrder = 2;
      return l;
    }
    function rod(a, b, r, color, emissive) {
      const dir = b.clone().sub(a), len = dir.length();
      const geo = new THREE.CylinderGeometry(r, r, len, 12, 1, false);
      const mat = new THREE.MeshPhysicalMaterial({ color: color, roughness: 0.35, metalness: 0, clearcoat: 0.5, emissive: color, emissiveIntensity: emissive == null ? 0.15 : emissive });
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(a).addScaledVector(dir, 0.5);
      m.quaternion.setFromUnitVectors(V(0, 1, 0), dir.normalize());
      return m;
    }
    function cone(at, dir, r, h, color) {
      const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 16), new THREE.MeshPhysicalMaterial({ color: color, roughness: 0.35, clearcoat: 0.5, emissive: color, emissiveIntensity: 0.15 }));
      m.position.copy(at).addScaledVector(dir, h / 2);
      m.quaternion.setFromUnitVectors(V(0, 1, 0), dir.clone().normalize());
      return m;
    }
    // 文字標籤（Sprite，固定像素大小）——與泛音列頁面相同的做法
    function label(text, color, opt) {
      opt = opt || {};
      const px = (opt.size || (narrow ? 11.5 : 13)) * RES;
      const font = (opt.weight || 700) + ' ' + px + 'px ' + FONT;
      const c = document.createElement('canvas');
      let g = c.getContext('2d');
      g.font = font;
      const w = g.measureText(text).width;
      const padX = 5 * RES, padY = 3 * RES;
      c.width = Math.ceil(w + 2 * padX);
      c.height = Math.ceil(px * 1.35 + 2 * padY);
      g = c.getContext('2d');
      g.font = font;
      g.textBaseline = 'middle'; g.textAlign = 'left'; g.lineJoin = 'round';
      if (opt.pill) {
        const h = c.height - 2, r = h / 2;
        g.beginPath();
        g.moveTo(r + 1, 1); g.lineTo(c.width - r - 1, 1); g.arc(c.width - r - 1, r + 1, r, -PI / 2, PI / 2); g.lineTo(r + 1, h + 1); g.arc(r + 1, r + 1, r, PI / 2, PI * 1.5);
        g.fillStyle = alpha(C['canvas-bg'], 0.9); g.fill();
        g.strokeStyle = alpha(color, 0.55); g.lineWidth = RES; g.stroke();
      } else {
        g.lineWidth = 4 * RES; g.strokeStyle = alpha(C['canvas-bg'], 0.92);
        g.strokeText(text, padX, c.height / 2);
      }
      g.fillStyle = color;
      g.fillText(text, padX, c.height / 2);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false }));
      sp.userData.lw = c.width / RES; sp.userData.lh = c.height / RES; sp.userData.isLabel = true;
      sp.renderOrder = 30;
      fitLabel(sp);
      const dir = opt.dir || [0, 0];
      const L = Math.hypot(dir[0], dir[1]);
      if (L > 0) {
        const dx = dir[0] / L, dy = dir[1] / L, gap = opt.gap == null ? 6 : opt.gap;
        sp.center.set(0.5 - dx * (sp.userData.lw / 2 + gap) / sp.userData.lw, 0.5 - dy * (sp.userData.lh / 2 + gap) / sp.userData.lh);
      }
      if (opt.at) sp.position.copy(opt.at);
      if (opt.axis) sp.userData.axis = opt.axis;
      return sp;
    }
    function fitLabel(sp) {
      const k = (camera.top - camera.bottom) / (Math.max(0.01, camera.zoom) * Math.max(1, ch));
      sp.scale.set(sp.userData.lw * k, sp.userData.lh * k, 1);
    }
    function sizeLabels() { scene.traverse(function (o) { if (o.userData && o.userData.isLabel) fitLabel(o); }); }

    // ---------- 物件 ----------
    const gWalls = new THREE.Group(), gAxes = new THREE.Group(), gCurve = new THREE.Group(), gProj = new THREE.Group();
    scene.add(gWalls, gProj, gAxes, gCurve);
    function wallMat(tint) {
      const base = new THREE.Color(C['canvas-bg']);
      base.lerp(new THREE.Color(tint), isDark() ? 0.08 : 0.1);
      if (!isDark()) base.lerp(new THREE.Color(C.text), 0.03);
      return new THREE.MeshStandardMaterial({ color: base, roughness: 0.92, metalness: 0, transparent: true, opacity: isDark() ? 0.72 : 0.8, side: THREE.DoubleSide, depthWrite: false });
    }
    function buildWalls() {
      clearGroup(gWalls);
      // 地板 z = −W（x–y）、後牆 y = +W（x–z）、側牆 x = −W（y–z）
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(2 * W, 2 * W), wallMat(C['ch-r']));
      floor.position.set(0, 0, -W);
      const bg = new THREE.PlaneGeometry(2 * W, 2 * W); bg.rotateX(PI / 2);
      const back = new THREE.Mesh(bg, wallMat(C['ch-5']));
      back.position.set(0, W, 0);
      const sg = new THREE.PlaneGeometry(2 * W, 2 * W); sg.rotateY(PI / 2);
      const side = new THREE.Mesh(sg, wallMat(C['ch-3']));
      side.position.set(-W, 0, 0);
      gWalls.add(floor, back, side);
      const minor = [], major = [];
      // 每面牆的十字（振幅 0）與 ±0.5、±1
      [-1, -0.5, 0, 0.5, 1].forEach(function (v) {
        const q = v * S, arr = v === 0 ? major : minor;
        arr.push([V(q, -W, -W + 0.004), V(q, W, -W + 0.004)], [V(-W, q, -W + 0.004), V(W, q, -W + 0.004)]);
        arr.push([V(q, W - 0.004, -W), V(q, W - 0.004, W)], [V(-W, W - 0.004, q), V(W, W - 0.004, q)]);
        arr.push([V(-W + 0.004, q, -W), V(-W + 0.004, q, W)], [V(-W + 0.004, -W, q), V(-W + 0.004, W, q)]);
      });
      // 外框
      [[-W, -W, -W, W, -W, -W], [W, -W, -W, W, W, -W], [W, W, -W, -W, W, -W], [-W, W, -W, -W, -W, -W],
        [-W, W, -W, -W, W, W], [W, W, -W, W, W, W], [-W, -W, -W, -W, -W, W], [-W, W, W, W, W, W], [-W, -W, W, -W, W, W]].forEach(function (q) {
        major.push([V(q[0], q[1], q[2]), V(q[3], q[4], q[5])]);
      });
      gWalls.add(segs(minor, C.text, isDark() ? 0.07 : 0.08), segs(major, C.text, 0.2));
      const sz = narrow ? 10.5 : 11.5;
      gWalls.add(label(T('上面（x–y）', 'top (x–y)'), C.muted, { at: V(-W, -W, -W), dir: [-1, -0.6], size: sz, weight: 600 }));
      gWalls.add(label(T('正面（x–z）', 'front (x–z)'), C.muted, { at: V(0, W, W), dir: [0, 1], size: sz, weight: 600 }));
      gWalls.add(label(T('側面（y–z）', 'side (y–z)'), C.muted, { at: V(-W, 0, W), dir: [-0.4, 1], size: sz, weight: 600 }));
    }

    // ---------- 曲線 ----------
    let built = null;       // { key, nLine, nTube, tubeSegs, radial, freqs, span, P, lineObjs:[], tube }
    let A = B.analysis();
    function curveKey() {
      return A.act.slice(0, 4).map(function (t) { return t.f.toFixed(6) + t.role; }).join(',') + '|' + state.span + '|' + A.tuning + '|' + (narrow ? 1 : 0);
    }
    function freqsOf() { return A.act.slice(0, 3).map(function (t) { return t.f; }); }
    function posAt(fr, t, out) {
      out.set(fr[0] != null ? S * Math.sin(TAU * fr[0] * t) : 0, fr[1] != null ? S * Math.sin(TAU * fr[1] * t) : 0, fr[2] != null ? S * Math.sin(TAU * fr[2] * t) : 0);
      return out;
    }
    function buildAxes() {
      clearGroup(gAxes);
      const sz = narrow ? 11 : 12.5;
      const ax = [
        { a: V(-S, -W, -W), b: V(S, -W, -W), dir: V(1, 0, 0), at: V(0, -W, -W), ld: [0, -1], axis: 'x' },
        { a: V(W, -S, -W), b: V(W, S, -W), dir: V(0, 1, 0), at: V(W, 0, -W), ld: [1, -0.5], axis: 'y' },
        { a: V(W, W, -S), b: V(W, W, S), dir: V(0, 0, 1), at: V(W, W, 0), ld: [1, 0], axis: 'z' }
      ];
      ax.forEach(function (q, i) {
        const t = A.act[i];
        if (!t) {
          gAxes.add(label(q.axis + T('：（沒有音）', ': (no note)'), C.muted, { at: q.at, dir: q.ld, size: sz, weight: 600, axis: q.axis }));
          return;
        }
        const color = new THREE.Color(B.roleColor(t.role));
        gAxes.add(rod(q.a, q.b, narrow ? 0.035 : 0.028, color));
        gAxes.add(cone(q.b, q.dir, narrow ? 0.09 : 0.075, 0.22, color));
        gAxes.add(label(q.axis + T('：', ': ') + t.name + (narrow ? '' : ' ' + B.hz(t.f) + ' Hz'), B.roleColor(t.role), { at: q.at, dir: q.ld, size: sz, pill: true, axis: q.axis }));
      });
    }
    function buildCurve() {
      clearGroup(gCurve); clearGroup(gProj);
      const fr = freqsOf();
      const span = state.span / 1000;
      const fmax = fr.length ? Math.max.apply(null, fr) : 1;
      const nLine = Math.max(LINE_MIN, Math.min(LINE_MAX, Math.round(span * fmax * LINE_PER_CYCLE)));
      const P = A.count ? (A.tuning === 'just' ? A.T : A.TJ) : span;
      const Pshown = Math.min(span, P);
      const tubeSegs = Math.max(TUBE_MIN, Math.min(TUBE_MAX, Math.round(Pshown * fmax * TUBE_PER_CYCLE)));
      const four = A.act[3] || null;
      const cPer = new THREE.Color(C['ch-per']), cWave = new THREE.Color(C['ch-wave']), cFour = four ? new THREE.Color(B.roleColor(four.role)) : null;
      const cTmp = new THREE.Color();
      const p = new THREE.Vector3();
      // 細線：整段 [0, 顯示的時間]
      const pos = new Float32Array((nLine + 1) * 3), col = new Float32Array((nLine + 1) * 3);
      const pf = new Float32Array((nLine + 1) * 3), pb = new Float32Array((nLine + 1) * 3), ps = new Float32Array((nLine + 1) * 3);
      for (let j = 0; j <= nLine; j++) {
        const t = span * j / nLine;
        posAt(fr, t, p);
        pos[3 * j] = p.x; pos[3 * j + 1] = p.y; pos[3 * j + 2] = p.z;
        pf[3 * j] = p.x; pf[3 * j + 1] = p.y; pf[3 * j + 2] = -W + 0.012;
        pb[3 * j] = p.x; pb[3 * j + 1] = W - 0.012; pb[3 * j + 2] = p.z;
        ps[3 * j] = -W + 0.012; ps[3 * j + 1] = p.y; ps[3 * j + 2] = p.z;
        if (cFour) cTmp.copy(cWave).lerp(cFour, (Math.sin(TAU * four.f * t) + 1) / 2);
        else cTmp.copy(cPer).lerp(cWave, Math.min(1, j / nLine * 1.4));
        col[3 * j] = cTmp.r; col[3 * j + 1] = cTmp.g; col[3 * j + 2] = cTmp.b;
      }
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      lg.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const line = new THREE.Line(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: isDark() ? 0.85 : 0.8 }));
      line.renderOrder = 3;
      gCurve.add(line);
      // 投影（牆上的平面李薩如圖形）
      const projCol = new THREE.Color(C['ch-wave']);
      const projs = [pf, pb, ps].map(function (arr) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
        const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: projCol, transparent: true, opacity: isDark() ? 0.38 : 0.32, depthWrite: false }));
        l.renderOrder = 1;
        gProj.add(l);
        return l;
      });
      // 粗管子：第一個週期（純律 T、平均律 T_J；比顯示的時間長就畫到顯示的時間）
      let tube = null, radial = 8;
      if (A.count) {
        class Path extends THREE.Curve {
          getPoint(u, target) { return posAt(fr, Pshown * u, target || new THREE.Vector3()); }
        }
        const geo = new THREE.TubeGeometry(new Path(), tubeSegs, narrow ? 0.05 : 0.042, radial, false);
        const tc = new Float32Array(geo.attributes.position.count * 3);
        const cLight = cPer.clone().lerp(new THREE.Color(isDark() ? 0xffffff : 0xfff7e6), 0.35);
        for (let i = 0; i <= tubeSegs; i++) {
          const t = Pshown * i / tubeSegs;
          if (cFour) cTmp.copy(cPer).lerp(cFour, (Math.sin(TAU * four.f * t) + 1) / 2);
          else cTmp.copy(cLight).lerp(cPer, i / tubeSegs);
          for (let j = 0; j <= radial; j++) { const k = (i * (radial + 1) + j) * 3; tc[k] = cTmp.r; tc[k + 1] = cTmp.g; tc[k + 2] = cTmp.b; }
        }
        geo.setAttribute('color', new THREE.BufferAttribute(tc, 3));
        tube = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.2, emissive: cPer, emissiveIntensity: 0.1 }));
        tube.renderOrder = 4;
        gCurve.add(tube);
      }
      // 起點（t = 0，三個正弦都是 0）
      const start = new THREE.Mesh(new THREE.SphereGeometry(narrow ? 0.085 : 0.07, 20, 14), new THREE.MeshPhysicalMaterial({ color: new THREE.Color(C.text), roughness: 0.3, clearcoat: 0.6 }));
      gCurve.add(start);
      // 生長時的頭
      const head = new THREE.Mesh(new THREE.SphereGeometry(narrow ? 0.12 : 0.1, 24, 16), new THREE.MeshPhysicalMaterial({ color: cPer, roughness: 0.25, clearcoat: 0.8, emissive: cPer, emissiveIntensity: 0.35 }));
      head.visible = false;
      gCurve.add(head);
      built = { key: curveKey(), nLine: nLine, tubeSegs: tubeSegs, radial: radial, fr: fr, span: span, Pshown: Pshown, line: line, projs: projs, tube: tube, head: head };
    }
    function showUpTo(u) {
      // u：0–1，曲線畫到 t = u × 顯示的時間
      const b = built;
      if (!b) return;
      const n = u >= 1 ? b.nLine + 1 : Math.max(1, Math.floor(u * b.nLine) + 1);
      b.line.geometry.setDrawRange(0, n);
      b.projs.forEach(function (l) { l.geometry.setDrawRange(0, n); });
      if (b.tube) {
        const tu = Math.min(1, u * b.span / b.Pshown);
        const k = tu >= 1 ? b.tubeSegs : Math.floor(tu * b.tubeSegs);
        b.tube.geometry.setDrawRange(0, k * b.radial * 6);
      }
      if (u < 1) { b.head.visible = true; posAt(b.fr, u * b.span, b.head.position); }
      else b.head.visible = false;
    }

    // ---------- 資訊列 ----------
    function updateHud() {
      const a = A;
      const names = a.act.slice(0, 3).map(function (t, i) { return '<b style="color:' + B.roleColor(t.role) + '">' + 'xyz'[i] + '</b> ' + t.name; }).join(T('　', '  '));
      setHud('eq', a.count ? names : '—');
      let p = '';
      if (a.count === 1) p = T('只有一個音：在 x 軸上來回', 'One note only: back and forth along x');
      else if (a.tuning === 'just') {
        const r = a.ints.join(' : ');
        p = a.T * 1000 <= state.span + 1e-9
          ? T('閉合 ✓ ', 'Closed ✓ ') + r + T('：每 ', ': every ') + B.msText(a.T) + T(' 回到起點', '')
          : T('週期 ', 'Period ') + B.msText(a.T) + T(' 比顯示的時間長：還沒閉合', ' is longer than the time shown: not closed yet');
      } else {
        p = T('平均律：每個純律週期錯開 ', 'Equal: slips ') + B.num(a.drift, 1) + T('°，永遠不閉合', '° every just period, never closes');
      }
      setHud('p', p);
      setHud('w', a.act[3] ? T('顏色＝第四個音 ', 'colour = 4th note ') + a.act[3].name : '');
      setHud('tip', tipGone || narrow ? '' : T('拖曳旋轉、滾輪或雙指縮放；上面的按鈕從上面、正面、側面看', 'Drag to rotate, scroll or pinch to zoom; the buttons above give the top, front and side views'));
    }
    function growHud() {
      if (!grow) { setHud('g', ''); return; }
      const slow = GROW_SEC * 1000 / state.span;
      setHud('g', T('生長中：t = ', 'Growing: t = ') + B.num(grow.u * state.span, state.span < 10 ? 2 : 1) + ' ms' + T('・放慢 ', ' · slowed ') + (slow >= 100 ? Math.round(slow) : B.num(slow, 0)) + T(' 倍', '×'));
    }

    // ---------- 生長動畫 ----------
    let grow = null;   // { t0, u }
    function startGrow() {
      if (!A.count) return;
      if (B.reducedMotion()) {
        showUpTo(1);
        requestRender();
        B.onGrowDone();
        return;
      }
      hideTip();
      grow = { t0: performance.now(), u: 0 };
      B.onGrowState(true);
      showUpTo(0);
      growHud();
      requestRender();
    }
    function stopGrow(done) {
      if (!grow) return;
      grow = null;
      showUpTo(1);
      growHud();
      B.onGrowState(false);
      requestRender();
      if (done) B.onGrowDone();
    }
    function stepGrow(now) {
      grow.u = Math.min(1, (now - grow.t0) / (GROW_SEC * 1000));
      if (grow.u >= 1) { stopGrow(true); return; }
      showUpTo(grow.u);
      growHud();
    }

    // ---------- 視角 ----------
    function defaultDir() { return V(narrow ? 0.62 : 0.6, -1, narrow ? 0.7 : 0.62).normalize(); }
    const fitC = V(0, 0, 0);
    function fitZoom(dir) {
      const d = dir.clone().normalize();
      const fwd = d.clone().negate();
      const right = new THREE.Vector3().crossVectors(fwd, V(0, 0, 1));
      if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
      right.normalize();
      const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
      const hw = cw / 2, hh = ch / 2;
      const hudN = 2 + (A.act[3] ? 1 : 0);
      const padS = 8, padT = 10 + hudN * 22, padB = (tipGone || narrow) && !grow ? 8 : 30;
      let s = Infinity;
      function fit(p, l, r, b, t) {
        const v = p.clone().sub(fitC), u = v.dot(right), w = v.dot(up);
        if (u > 1e-6) s = Math.min(s, Math.max(4, hw - padS - r) / u);
        if (u < -1e-6) s = Math.min(s, Math.max(4, hw - padS - l) / -u);
        if (w > 1e-6) s = Math.min(s, Math.max(4, hh - padT - t) / w);
        if (w < -1e-6) s = Math.min(s, Math.max(4, hh - padB - b) / -w);
      }
      [-W, W].forEach(function (x) { [-W, W].forEach(function (y) { [-W, W].forEach(function (z) { fit(V(x, y, z), 0, 0, 0, 0); }); }); });
      [gWalls, gAxes].forEach(function (g) {
        g.children.forEach(function (o) {
          if (!o.userData || !o.userData.isLabel || !labelVisible(o, d)) return;
          const lw = o.userData.lw, lh = o.userData.lh;
          fit(o.position, o.center.x * lw, (1 - o.center.x) * lw, o.center.y * lh, (1 - o.center.y) * lh);
        });
      });
      if (!isFinite(s)) return 1;
      return Math.max(controls.minZoom, Math.min(controls.maxZoom, s * viewH / Math.max(1, ch)));
    }
    /** 沿著某一軸看過去時，那一軸的標籤會疊到別的東西上：先藏起來 */
    function labelVisible(o, dir) {
      const ax = o.userData.axis;
      if (!ax) return true;
      return Math.abs(dir[ax]) < 0.95;
    }
    let anim = null;
    function goTo(dir, zoom, target) {
      if (B.reducedMotion()) { place(dir, zoom, target); return; }
      const from = { dir: camera.position.clone().sub(controls.target).normalize(), zoom: camera.zoom, target: controls.target.clone() };
      anim = { from: from, to: { dir: dir.clone().normalize(), zoom: zoom, target: target.clone() }, t0: performance.now(), dur: 650 };
      controls.enabled = false;
      requestRender();
    }
    function place(dir, zoom, target) {
      controls.target.copy(target);
      camera.position.copy(target).addScaledVector(dir.clone().normalize(), CAM_DIST);
      camera.zoom = zoom;
      camera.updateProjectionMatrix();
      controls.update();
      sizeLabels();
      lastZoom = camera.zoom;
      requestRender();
    }
    function stepAnim(now) {
      const a = anim;
      const u = Math.min(1, (now - a.t0) / a.dur);
      const e = 1 - Math.pow(1 - u, 3);
      const d0 = a.from.dir, d1 = a.to.dir;
      const om = Math.acos(Math.max(-1, Math.min(1, d0.dot(d1))));
      let dir;
      if (om < 1e-4) dir = d1.clone();
      else dir = d0.clone().multiplyScalar(Math.sin((1 - e) * om) / Math.sin(om)).add(d1.clone().multiplyScalar(Math.sin(e * om) / Math.sin(om)));
      const zoom = a.from.zoom * Math.pow(a.to.zoom / a.from.zoom, e);
      const target = a.from.target.clone().lerp(a.to.target, e);
      controls.target.copy(target);
      camera.position.copy(target).addScaledVector(dir.normalize(), CAM_DIST);
      camera.zoom = zoom;
      camera.updateProjectionMatrix();
      sizeLabels();
      lastZoom = zoom;
      if (u >= 1) { anim = null; controls.enabled = true; controls.update(); }
    }
    function faceDir(which) {
      // 稍微偏一點點，避免和「上方」向量（z）平行
      if (which === 'xy') return V(0, -0.002, 1).normalize();
      if (which === 'xz') return V(0, -1, 0.0001).normalize();
      if (which === 'yz') return V(1, 0, 0.0001).normalize();
      return defaultDir();
    }
    function face(which) {
      hideTip();
      const dir = faceDir(which);
      goTo(dir, fitZoom(dir), fitC);
    }
    function resetCamera() {
      setFrustum();
      anim = null; controls.enabled = true;
      place(defaultDir(), fitZoom(defaultDir()), fitC);
    }

    // ---------- 繪製 ----------
    let raf = 0, dirty = false;
    function rebuild() {
      A = B.analysis();
      if (!built || built.key !== curveKey()) {
        if (grow) { grow = null; growHud(); B.onGrowState(false); }
        buildAxes();
        buildCurve();
        showUpTo(1);
      }
      updateHud();
    }
    function renderNow() {
      if (!api.active || document.hidden) return;
      const want = Math.min(window.devicePixelRatio || 1, 2);
      if (renderer.getPixelRatio() !== want) { renderer.setPixelRatio(want); resize3(); return; }
      if (dirty) { dirty = false; rebuild(); }
      let moving = false;
      const now = performance.now();
      if (grow) { stepGrow(now); moving = !!grow; }
      if (anim) { stepAnim(now); moving = true; }
      else if (controls.update()) moving = true;
      if (Math.abs(camera.zoom - lastZoom) > 1e-6) { lastZoom = camera.zoom; sizeLabels(); }
      const dir = camera.position.clone().sub(controls.target).normalize();
      gAxes.children.forEach(function (o) { if (o.userData && o.userData.isLabel) o.visible = labelVisible(o, dir); });
      renderer.render(scene, camera);
      if (moving) requestRender();
    }
    function requestRender() {
      if (raf || !api.active) return;
      raf = requestAnimationFrame(function () { raf = 0; renderNow(); });
    }
    let lastAspect = 0;
    function resize3() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      cw = w; ch = h;
      renderer.setSize(w, h, false);
      const nar = w < 560;
      if (nar !== narrow) { narrow = nar; buildWalls(); built = null; dirty = true; }
      const asp = w / h;
      if (Math.abs(asp - lastAspect) > 1e-3) {
        const refit = lastAspect && !anim;
        lastAspect = asp;
        if (refit) {
          const d = camera.position.clone().sub(controls.target).normalize();
          camera.zoom = fitZoom(d);
          camera.updateProjectionMatrix();
        }
      }
      setFrustum();
      sizeLabels();
      renderNow();
    }
    const ro = window.ResizeObserver ? new ResizeObserver(function () { resize3(); }) : null;
    if (ro) ro.observe(canvas); else window.addEventListener('resize', resize3);
    controls.addEventListener('change', requestRender);
    const onVisible = function () {
      // 切到背景時停止生長（不算長完）
      if (document.hidden) { if (grow) stopGrow(false); }
      else requestRender();
    };
    document.addEventListener('visibilitychange', onVisible);
    canvas.addEventListener('webglcontextlost', function (ev) {
      ev.preventDefault();
      if (!api.active) return;
      if (B.onContextLost) B.onContextLost();
    });
    canvas.addEventListener('keydown', function (ev) {
      const step = (ev.shiftKey ? 15 : 5) * DEG;
      const off = camera.position.clone().sub(controls.target);
      const sph = new THREE.Spherical().setFromVector3(V(off.x, off.z, -off.y));
      let used = true;
      if (ev.key === 'ArrowLeft') sph.theta -= step;
      else if (ev.key === 'ArrowRight') sph.theta += step;
      else if (ev.key === 'ArrowUp') sph.phi = Math.max(0.05, sph.phi - step);
      else if (ev.key === 'ArrowDown') sph.phi = Math.min(PI - 0.05, sph.phi + step);
      else used = false;
      if (!used) return;
      ev.preventDefault();
      hideTip();
      anim = null; controls.enabled = true;
      const v = new THREE.Vector3().setFromSpherical(sph);
      camera.position.copy(controls.target).add(V(v.x, -v.z, v.y));
      controls.update();
      requestRender();
    });

    const api = {
      active: true,
      update: function () { dirty = true; requestRender(); },
      onTheme: function () {
        C = B.colors();
        buildEnv();
        Object.keys(hudLast).forEach(function (k) { delete hudLast[k]; });
        buildWalls();
        built = null;
        if (grow) { grow = null; B.onGrowState(false); }
        dirty = true;
        requestRender();
      },
      resetCamera: function () { resetCamera(); },
      face: function (which) { face(which); },
      toggleGrow: function () { if (grow) stopGrow(false); else startGrow(); },
      growing: function () { return !!grow; },
      dispose: function () {
        api.active = false;
        if (grow) { grow = null; B.onGrowState(false); }
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
    const w0 = canvas.clientWidth, h0 = canvas.clientHeight;
    if (w0 && h0) {
      narrow = w0 < 560;
      cw = w0; ch = h0;
      renderer.setSize(cw, ch, false);
      lastAspect = cw / ch;
    }
    setFrustum();
    buildWalls();
    rebuild();
    resetCamera();
    return api;
  }

  window.Chords3D = { create: create };
})();
