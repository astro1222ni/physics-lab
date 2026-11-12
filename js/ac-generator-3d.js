/* ac-generator-3d.js — 交流發電機與變壓器的 3D 檢視（three.js 由頁面在切換到 3D 時才載入）
 * 發電機：N、S 磁極、可轉動的多匝線圈（有厚度）、滑環與電刷（或換向器）、磁力線、面積向量、
 *         兩長邊受的磁力、沿線圈流動的電荷（速率 ∝ 電流）、燈泡亮度 ∝ 瞬時功率。線圈角度與 2D 同步。
 * 變壓器：疊片鐵心、兩組線圈（螺旋管）、鐵心中的磁通量亮點（方向跟著 Φ、亮度跟著 |Φ|）、線圈上流動的電荷、負載燈泡。
 * 遠距輸電沒有 3D（頁面會留在 2D）。
 * 用法：ACGenerator3D.create({ THREE, OrbitControls }, env) → { active, update, rebuild, onTheme, resetCamera, dispose }
 * env：host、core、T、state()、tokens()、lost()
 */
(function () {
  'use strict';
  const S = 10;                 // 場景單位：1 m = 10 單位（發電機）
  const TAU = Math.PI * 2;

  function create(lib, env) {
    const THREE = lib.THREE;
    const LD = window.LabDraw;
    const T = env.T;
    const host = env.host;
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('3D 檢視：發電機的磁極、轉動的線圈與滑環，或變壓器的鐵心與兩組線圈（可拖曳旋轉、縮放）',
      '3D view: the generator’s poles, turning coil and slip rings, or the transformer’s core and two coils (drag to rotate, scroll or pinch to zoom)'));
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
    const camera = new THREE.PerspectiveCamera(34, 1.6, 0.3, 500);
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.minDistance = 6;
    controls.maxDistance = 120;

    const hemi = new THREE.HemisphereLight(0xffffff, 0x8a8a8a, 1.5);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.7);
    sun.position.set(6, 12, 14);
    scene.add(sun);

    const css = function (c) { const col = new THREE.Color(); col.setStyle(c); return col; };
    function disposeObject(obj) {
      obj.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); });
      });
    }
    function clearGroup(g) { while (g.children.length) { const c = g.children.pop(); disposeObject(c); } }
    /** 文字標籤（2D 畫布做成的 Sprite；parts 中的子陣列是下標） */
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
    /** 柔和光暈貼圖（燈泡、磁通量亮點用） */
    let glowTex = null;
    function glowTexture() {
      if (glowTex) return glowTex;
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d');
      const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      glowTex = new THREE.CanvasTexture(c);
      return glowTex;
    }
    function glowSprite(color, size) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: css(color), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
      s.scale.set(size, size, 1);
      return s;
    }
    const Y = new THREE.Vector3(0, 1, 0);
    /** 兩點之間的圓柱 */
    function rod(a, b, r, mat, seg) {
      const d = b.clone().sub(a), len = d.length();
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, Math.max(len, 1e-4), seg || 14), mat);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(Y, d.normalize());
      return m;
    }
    /** 沿 +y、長度 1 的箭頭（scale 長度用 setLen） */
    function arrow(color, r) {
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: css(color), roughness: 0.45, emissive: css(color), emissiveIntensity: LD.dark ? 0.25 : 0.08 });
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 12), mat);
      const head = new THREE.Mesh(new THREE.ConeGeometry(r * 2.6, r * 7, 18), mat);
      g.add(shaft, head);
      g.userData.setLen = function (L) {
        const h = Math.min(r * 7, L * 0.6), sl = Math.max(0.001, L - h);
        shaft.scale.y = sl; shaft.position.y = sl / 2;
        head.scale.y = h / (r * 7); head.position.y = sl + h / 2;
        g.visible = L > 0.05;
      };
      g.userData.setLen(1);
      return g;
    }

    const genGroup = new THREE.Group(), xfGroup = new THREE.Group();
    scene.add(genGroup, xfGroup);
    let s0 = null, tok = {}, mode = '';
    const keys = {};
    let lastNow = 0;

    // =================================================================
    // 發電機
    // =================================================================
    // 尺寸與 2D 斜視圖相同的做法：線圈依比例縮放（最大的一邊約 2 單位），磁極貼著線圈轉動的範圍
    let GE = null;
    function setGE(G) {
      const k = 0.2 / Math.max(G.w / 2, G.L / 4, 0.05);
      const hw = G.w / 2 * k * S, hl = G.L / 2 * k * S;
      const gap = hw + 0.6, my = hw + 0.3, mz = hl + 0.4, ring1 = hl + 0.7;
      GE = { hw: hw, hl: hl, gap: gap, mag: 1.4, my: my, mz: mz, ring1: ring1, ring2: ring1 + 0.55, ringT: 0.25, ringR: 0.45,
        axBack: -hl - 1.0, axFront: ring1 + 1.4, lamp: new THREE.Vector3(gap + 1.4 + 2.0, -my, mz + 0.9) };
    }
    /** 貼在面上的文字（不像 Sprite 會轉向相機，被擋住時也不會穿出來） */
    function facePlane(text, color, size) {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d');
      g.font = '800 96px ' + LD.FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = color; g.fillText(text, 64, 70);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    }
    let gen = null;     // 動態物件
    function buildGen() {
      clearGroup(genGroup);
      gen = {};
      const G = s0.G;
      setGE(G);
      const metal = function (col, rough, metalness) { return new THREE.MeshStandardMaterial({ color: css(col), roughness: rough == null ? 0.45 : rough, metalness: metalness == null ? 0.3 : metalness }); };
      // 底座
      const base = new THREE.Mesh(new THREE.BoxGeometry(2 * (GE.gap + GE.mag) + 1.2, 0.3, 2 * GE.mz + 1.2), metal(LD.mix(tok.iron, tok.surface, 0.55), 0.85, 0.1));
      base.position.set(0, -GE.my - 0.15, 0);
      genGroup.add(base);
      // 磁極（N 紅、S 藍）
      [[-1, tok.pos, 'N'], [1, tok.neg, 'S']].forEach(function (m) {
        const box = new THREE.Mesh(new THREE.BoxGeometry(GE.mag, GE.my * 2, GE.mz * 2), metal(m[1], 0.5, 0.15));
        box.position.set(m[0] * (GE.gap + GE.mag / 2), 0, 0);
        genGroup.add(box);
        const lb = facePlane(m[2], 'rgba(255,255,255,0.92)', 1.3);
        lb.position.set(m[0] * (GE.gap + GE.mag / 2), 0.1, GE.mz + 0.02);
        genGroup.add(lb);
      });
      // 磁力線（N → S）
      const field = new THREE.Group();
      const pts = [];
      const coneMat = new THREE.MeshBasicMaterial({ color: css(tok.field), transparent: true, opacity: 0.75 });
      [-0.75, -0.375, 0, 0.375, 0.75].forEach(function (yf) {
        const y = yf * GE.my;
        [-0.75, -0.25, 0.25, 0.75].forEach(function (zf) {
          const z = zf * GE.mz;
          pts.push(new THREE.Vector3(-GE.gap, y, z), new THREE.Vector3(GE.gap, y, z));
          const cone = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.26, 10), coneMat);
          cone.rotation.z = -Math.PI / 2;
          cone.position.set((z > 0 ? -0.6 : 0.6) * GE.gap, y, z);
          field.add(cone);
        });
      });
      field.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: css(tok.field), transparent: true, opacity: LD.dark ? 0.55 : 0.45 })));
      const bl = label(['B'], tok.field, 0.7); bl.position.set(0, GE.my + 0.45, -GE.mz * 0.6); field.add(bl);
      gen.field = field;
      genGroup.add(field);
      // 轉軸（固定位置，跟著線圈轉看不出來，所以不必轉）
      genGroup.add(rod(new THREE.Vector3(0, 0, GE.axBack), new THREE.Vector3(0, 0, GE.axFront), 0.12, metal(LD.mix(tok.iron, tok.text, 0.15), 0.35, 0.6)));
      // 轉動的部分：線圈、引線、滑環或換向器、面積向量、流動的電荷
      const rot = new THREE.Group();
      gen.rot = rot;
      genGroup.add(rot);
      const hw = GE.hw, hl = GE.hl;
      const rr = Math.min(0.22, 0.06 + 0.14 * Math.sqrt(G.N / 500));
      const copper = metal(tok.copper, 0.32, 0.75);
      const c = [new THREE.Vector3(0, hw, -hl), new THREE.Vector3(0, hw, hl), new THREE.Vector3(0, -hw, hl), new THREE.Vector3(0, -hw, -hl)];
      rot.add(rod(c[0], c[1], rr, copper), rod(c[2], c[3], rr, copper), rod(c[3], c[0], rr, copper));
      // 前面的短邊在中間斷開，兩端接引線
      const m1 = new THREE.Vector3(0, hw * 0.12, hl), m2 = new THREE.Vector3(0, -hw * 0.12, hl);
      rot.add(rod(c[1], m1, rr, copper), rod(c[2], m2, rr, copper));
      c.forEach(function (p) { const b = new THREE.Mesh(new THREE.SphereGeometry(rr, 14, 10), copper); b.position.copy(p); rot.add(b); });
      const brass = metal(LD.mix(tok.copper, '#d4b04a', 0.45), 0.28, 0.85);
      const leadMat = metal(LD.shade(tok.copper, -0.1), 0.4, 0.6);
      if (!s0.comm) {
        [GE.ring1, GE.ring2].forEach(function (z) {
          const ring = new THREE.Mesh(new THREE.CylinderGeometry(GE.ringR, GE.ringR, GE.ringT, 40), brass);
          ring.rotation.x = Math.PI / 2; ring.position.z = z + GE.ringT / 2;
          rot.add(ring);
        });
        rot.add(rod(m1, new THREE.Vector3(0, GE.ringR * 0.6, GE.ring1 + GE.ringT / 2), 0.05, leadMat, 8));
        rot.add(rod(m2, new THREE.Vector3(0, -GE.ringR * 0.6, GE.ring2 + GE.ringT / 2), 0.05, leadMat, 8));
      } else {
        // 換向器：兩片半環，缺口沿面積向量（局部 +x），兩片的中心在 ±y
        const gapA = 0.2, L = Math.PI - gapA;
        [[Math.PI / 2 + gapA / 2, brass], [-Math.PI / 2 + gapA / 2, metal(LD.shade(LD.mix(tok.copper, '#d4b04a', 0.45), -0.12), 0.3, 0.85)]].forEach(function (sg) {
          const geo = new THREE.CylinderGeometry(GE.ringR, GE.ringR, 0.4, 32, 1, false, sg[0], L);
          geo.rotateX(Math.PI / 2);
          const seg = new THREE.Mesh(geo, sg[1]);
          seg.position.z = GE.ring1 + 0.2;
          rot.add(seg);
        });
        rot.add(rod(m1, new THREE.Vector3(0, GE.ringR * 0.6, GE.ring1 + 0.05), 0.05, leadMat, 8));
        rot.add(rod(m2, new THREE.Vector3(0, -GE.ringR * 0.6, GE.ring1 + 0.05), 0.05, leadMat, 8));
      }
      // 面積向量（局部 +x）
      const av = arrow(tok.accent, 0.05);
      av.rotation.z = -Math.PI / 2;
      av.userData.setLen(Math.max(1.6, hw + 0.6));
      const al = label(['A'], tok.accent, 0.6); al.position.set(Math.max(1.6, hw + 0.6) + 0.35, 0.25, 0);
      const vecRot = new THREE.Group(); vecRot.add(av, al);
      gen.vecRot = vecRot;
      rot.add(vecRot);
      // 流動的電荷（沿線圈一圈）
      const dots = new THREE.Group();
      const dotMat = new THREE.MeshStandardMaterial({ color: css(tok.cur), emissive: css(tok.cur), emissiveIntensity: LD.dark ? 0.8 : 0.45, roughness: 0.4 });
      const per = 4 * hl + 4 * hw, n = 16;
      for (let k = 0; k < n; k++) { const d = new THREE.Mesh(new THREE.SphereGeometry(rr * 1.3 + 0.04, 10, 8), dotMat); d.userData.s = k * per / n; dots.add(d); }
      gen.dots = dots; gen.per = per; gen.hw = hw; gen.hl = hl; gen.rr = rr;
      rot.add(dots);
      // 電刷（固定）與外接導線
      const carbon = metal(LD.mix(tok.text, tok['canvas-bg'], LD.dark ? 0.55 : 0.25), 0.9, 0.05);
      const wireMat = new THREE.LineBasicMaterial({ color: css(LD.mix(tok.text, tok['canvas-bg'], 0.25)) });
      const brushes = s0.comm
        ? [new THREE.Vector3(-GE.ringR - 0.18, 0, GE.ring1 + 0.2), new THREE.Vector3(GE.ringR + 0.18, 0, GE.ring1 + 0.2)]
        : [new THREE.Vector3(0, -GE.ringR - 0.18, GE.ring1 + GE.ringT / 2), new THREE.Vector3(0, -GE.ringR - 0.18, GE.ring2 + GE.ringT / 2)];
      brushes.forEach(function (b, k) {
        const br = new THREE.Mesh(new THREE.BoxGeometry(s0.comm ? 0.36 : 0.22, s0.comm ? 0.22 : 0.36, 0.2), carbon);
        br.position.copy(b);
        genGroup.add(br);
        const lp = GE.lamp, zt = lp.z + (k ? 0.18 : -0.18);
        const p0 = b.clone().add(new THREE.Vector3(s0.comm ? (k ? 0.18 : -0.18) : 0, s0.comm ? 0 : -0.18, 0));
        const path = [p0, new THREE.Vector3(p0.x, lp.y - (k ? 0.35 : 0.2), p0.z), new THREE.Vector3(lp.x + (k ? 0.18 : -0.18), lp.y - (k ? 0.35 : 0.2), zt), new THREE.Vector3(lp.x + (k ? 0.18 : -0.18), lp.y, zt)];
        genGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(path), wireMat));
      });
      // 燈泡
      const lp = GE.lamp;
      const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.45, 20), metal(tok.iron, 0.5, 0.5));
      sock.position.set(lp.x, lp.y + 0.2, lp.z);
      genGroup.add(sock);
      gen.glassMat = new THREE.MeshStandardMaterial({ color: css(LD.mix(tok.lamp, '#ffffff', 0.5)), transparent: true, opacity: 0.55, roughness: 0.15, emissive: css(tok.lamp), emissiveIntensity: 0 });
      const glass = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 18), gen.glassMat);
      glass.position.set(lp.x, lp.y + 0.85, lp.z);
      gen.glass = glass;
      genGroup.add(glass);
      gen.halo = glowSprite(tok.lamp, 3.2);
      gen.halo.position.copy(glass.position);
      genGroup.add(gen.halo);
      gen.openLabel = label([T('開路', 'open')], tok.muted, 0.5);
      gen.openLabel.position.set(lp.x, lp.y + 1.3, lp.z);
      genGroup.add(gen.openLabel);
      // 兩長邊受的磁力（世界座標，沿 ±y）
      gen.fA = arrow(tok.pos, 0.05); gen.fB = arrow(tok.pos, 0.05);
      genGroup.add(gen.fA, gen.fB);
      const fl = label(['F'], tok.pos, 0.55); gen.fLabel = fl; genGroup.add(fl);
      gen.theta = label(['θ = 0°'], tok.accent, 0.55);
      genGroup.add(gen.theta);
      gen.thKey = '';
    }
    function dotPos(sv, hw, hl) {
      // 電流為正時的方向：A 邊（+y）沿 +z → 前短邊 +y → −y → B 邊（−y）沿 −z → 後短邊 −y → +y
      const L1 = 2 * hl, L2 = 2 * hw;
      let s = ((sv % (2 * L1 + 2 * L2)) + (2 * L1 + 2 * L2)) % (2 * L1 + 2 * L2);
      if (s < L1) return [0, hw, -hl + s];
      s -= L1; if (s < L2) return [0, hw - s, hl];
      s -= L2; if (s < L1) return [0, -hw, hl - s];
      s -= L1; return [0, -hw + s, -hl];
    }
    function moveGen(dt) {
      const G = s0.G, th = s0.theta, now = G.at(th);
      gen.rot.rotation.z = th;
      gen.field.visible = s0.show3.field;
      gen.vecRot.visible = s0.show3.vec;
      gen.dots.visible = s0.show3.dots && !G.open;
      // 電荷：速率 ∝ 電流（只在播放時移動；方向跟著電流）
      if (s0.playing && !G.open && G.iMax > 0) {
        const v = 3.2 * now.i / G.iMax;
        gen.dots.children.forEach(function (d) { d.userData.s += v * dt; });
      }
      gen.dots.children.forEach(function (d) { const p = dotPos(d.userData.s, gen.hw, gen.hl); d.position.set(p[0], p[1], p[2]); });
      // 燈泡
      const u = G.open ? 0 : Math.max(0, Math.min(1, now.pR / 200));
      gen.glassMat.emissiveIntensity = 2.2 * u;
      gen.glass.visible = !G.open;
      gen.halo.material.opacity = 0.9 * u;
      gen.halo.scale.setScalar(1.6 + 2.2 * u);
      gen.openLabel.visible = !!G.open;
      // 磁力：A 邊電流 +z、B 沿 +x → F 沿 +y（長度 ∝ |i|）
      const show = s0.show3.vec && !G.open && G.iMax > 0;
      const mag = show ? Math.abs(now.i) / G.iMax : 0;
      const c = Math.cos(th), s = Math.sin(th), hw = gen.hw;
      const pA = new THREE.Vector3(-s * hw, c * hw, 0), pB = pA.clone().negate();
      const sg = Math.sign(now.i) || 1;
      [[gen.fA, pA, sg], [gen.fB, pB, -sg]].forEach(function (f) {
        f[0].position.copy(f[1]).add(new THREE.Vector3(0, f[2] * (gen.rr + 0.05), 0));
        f[0].rotation.set(0, 0, f[2] > 0 ? 0 : Math.PI);
        f[0].userData.setLen(1.8 * mag);
        f[0].visible = mag > 0.05;
      });
      gen.fLabel.visible = mag > 0.3;
      gen.fLabel.position.copy(pA).add(new THREE.Vector3(0.35, sg * (1.8 * mag + 0.45), 0));
      const deg = Math.round(env.core.degNorm(th));
      if (gen.thKey !== deg) {
        gen.thKey = deg;
        genGroup.remove(gen.theta); disposeObject(gen.theta);
        gen.theta = label(['θ = ' + deg + '°'], tok.accent, 0.55);
        gen.theta.position.set(GE.gap + GE.mag / 2, GE.my + 0.7, -GE.mz * 0.5);
        genGroup.add(gen.theta);
      }
    }

    // =================================================================
    // 變壓器
    // =================================================================
    const XE = { w: 8, h: 6.4, t: 1.3, d: 1.3 };
    let xf = null;
    function helixPoints(x, y0, y1, r, n, steps) {
      const pts = [];
      const N = Math.max(8, n * (steps || 24));
      for (let k = 0; k <= N; k++) {
        const u = k / N, a = u * n * TAU;
        pts.push(new THREE.Vector3(x + r * Math.cos(a), y0 + (y1 - y0) * u, r * Math.sin(a)));
      }
      return pts;
    }
    function buildXf() {
      clearGroup(xfGroup);
      xf = {};
      const X = s0.X;
      const ironMat = new THREE.MeshStandardMaterial({ color: css(LD.shade(tok.iron, LD.dark ? 0.1 : 0.25)), roughness: 0.5, metalness: 0.3 });
      const w = XE.w, h = XE.h, t = XE.t, d = XE.d;
      [[0, h / 2 - t / 2, w, t], [0, -h / 2 + t / 2, w, t], [-w / 2 + t / 2, 0, t, h - 2 * t], [w / 2 - t / 2, 0, t, h - 2 * t]].forEach(function (b) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(b[2], b[3], d), ironMat);
        m.position.set(b[0], b[1], 0);
        xfGroup.add(m);
      });
      // 疊片紋（前後兩面）
      const lam = [];
      for (let k = 1; k < 7; k++) {
        const e = t * k / 7, x0 = -w / 2 + e, x1 = w / 2 - e, y0 = -h / 2 + e, y1 = h / 2 - e;
        [d / 2 + 0.005, -d / 2 - 0.005].forEach(function (z) {
          lam.push(new THREE.Vector3(x0, y0, z), new THREE.Vector3(x1, y0, z), new THREE.Vector3(x1, y0, z), new THREE.Vector3(x1, y1, z),
            new THREE.Vector3(x1, y1, z), new THREE.Vector3(x0, y1, z), new THREE.Vector3(x0, y1, z), new THREE.Vector3(x0, y0, z));
        });
      }
      xfGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(lam), new THREE.LineBasicMaterial({ color: css(LD.shade(tok.iron, -0.5)), transparent: true, opacity: 0.4 })));
      // 線圈（螺旋管）
      const k = s0.turns;
      const copper = new THREE.MeshStandardMaterial({ color: css(tok.copper), roughness: 0.32, metalness: 0.75 });
      const ya = -h / 2 + t + 0.35, yb = h / 2 - t - 0.35;
      xf.coils = [];
      [[-w / 2 + t / 2, X.N1], [w / 2 - t / 2, X.N2]].forEach(function (c, i) {
        const n = Math.max(1, Math.round(c[1] / k));
        const r = t * 0.5 * Math.SQRT2 + 0.18;
        const pts = helixPoints(c[0], ya, yb, r, n);
        const curve = new THREE.CatmullRomCurve3(pts);
        const tr = Math.max(0.035, Math.min(0.13, (yb - ya) / n * 0.32));
        const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.min(2400, pts.length * 2), tr, 8, false), copper);
        xfGroup.add(tube);
        xf.coils.push({ curve: curve, tr: tr });
        const lb = label(['N', [i ? '2' : '1'], ' = ' + c[1]], tok.text, 0.5);
        lb.position.set(c[0], -h / 2 - 0.45, d / 2 + 0.6);
        xfGroup.add(lb);
      });
      if (k > 1) {
        const kl = label([T('示意：每圈代表 ', 'Sketch: each loop stands for ') + k + T(' 匝', ' turns')], tok.muted, 0.42);
        kl.position.set(0, -h / 2 - 1.15, d / 2);
        xfGroup.add(kl);
      }
      const ph = label(['Φ'], tok.phi, 0.6); ph.position.set(0, h / 2 + 0.55, 0); xfGroup.add(ph);
      // 電荷（兩組線圈各一串）
      xf.dots = [];
      const dotMat = new THREE.MeshStandardMaterial({ color: css(tok.cur), emissive: css(tok.cur), emissiveIntensity: LD.dark ? 0.8 : 0.45, roughness: 0.4 });
      xf.coils.forEach(function (c) {
        const g = new THREE.Group();
        for (let q = 0; q < 18; q++) { const m = new THREE.Mesh(new THREE.SphereGeometry(c.tr * 1.15 + 0.03, 10, 8), dotMat); m.userData.s = q / 18; g.add(m); }
        xfGroup.add(g);
        xf.dots.push(g);
      });
      // 磁通量亮點（沿鐵心中線）
      xf.flux = new THREE.Group();
      xf.fluxMat = new THREE.MeshStandardMaterial({ color: css(tok.phi), emissive: css(tok.phi), emissiveIntensity: 1, roughness: 0.4, transparent: true, opacity: 1 });
      for (let q = 0; q < 16; q++) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), xf.fluxMat);
        m.userData.s = q / 16;
        const gl = glowSprite(tok.phi, 0.9); m.add(gl); m.userData.glow = gl;
        xf.flux.add(m);
      }
      xfGroup.add(xf.flux);
      xf.fluxS = 0;
      // 電源與負載
      const wireMat = new THREE.LineBasicMaterial({ color: css(LD.mix(tok.text, tok['canvas-bg'], 0.25)) });
      const sx = -w / 2 - 3.2, lx = w / 2 + 3.2;
      const srcCol = s0.dc ? LD.mix(tok.iron, tok.surface, 0.3) : LD.mix(tok.copper, tok.surface, 0.55);
      const src = new THREE.Mesh(s0.dc ? new THREE.BoxGeometry(1.0, 1.6, 0.8) : new THREE.CylinderGeometry(0.75, 0.75, 0.6, 32),
        new THREE.MeshStandardMaterial({ color: css(srcCol), roughness: 0.5, metalness: 0.2 }));
      if (!s0.dc) src.rotation.x = Math.PI / 2;
      src.position.set(sx, 0, 0);
      xfGroup.add(src);
      const sl = label([s0.X.source === 'dc' ? T('電池', 'Battery') : s0.X.source === 'gen' ? T('發電機', 'Generator') : T('交流電源', 'AC supply')], tok.muted, 0.45);
      sl.position.set(sx, -1.35, 0.5);
      xfGroup.add(sl);
      const lpos = new THREE.Vector3(lx, 0.6, 0);
      const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.45, 20), ironMat);
      sock.position.set(lx, -0.05, 0);
      xfGroup.add(sock);
      xf.glassMat = new THREE.MeshStandardMaterial({ color: css(LD.mix(tok.lamp, '#ffffff', 0.5)), transparent: true, opacity: 0.55, roughness: 0.15, emissive: css(tok.lamp), emissiveIntensity: 0 });
      const glass = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 18), xf.glassMat);
      glass.position.copy(lpos);
      xfGroup.add(glass);
      xf.halo = glowSprite(tok.lamp, 3); xf.halo.position.copy(lpos); xfGroup.add(xf.halo);
      const top = xf.coils.map(function (c) { return c.curve.getPoint(1); }), bot = xf.coils.map(function (c) { return c.curve.getPoint(0); });
      [[top[0], [sx, top[0].y + 0.6], [sx, 0.8]], [bot[0], [sx, bot[0].y - 0.6], [sx, -0.8]], [top[1], [lx, top[1].y + 0.6], [lx, 1.1]], [bot[1], [lx, bot[1].y - 0.6], [lx, -0.3]]].forEach(function (wr) {
        const p0 = wr[0];
        const path = [p0, new THREE.Vector3(p0.x, wr[1][1], 0.9), new THREE.Vector3(wr[1][0], wr[1][1], 0), new THREE.Vector3(wr[2][0], wr[2][1], 0)];
        xfGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(path), wireMat));
      });
    }
    function fluxPos(s) {
      // 鐵心中線（順時針：上 → 右 → 下 → 左）
      const m = XE.t / 2, x0 = -XE.w / 2 + m, x1 = XE.w / 2 - m, y0 = -XE.h / 2 + m, y1 = XE.h / 2 - m;
      const a = x1 - x0, b = y1 - y0, P = 2 * (a + b);
      let d = ((s % 1) + 1) % 1 * P;
      if (d < a) return [x0 + d, y1];
      d -= a; if (d < b) return [x1, y1 - d];
      d -= b; if (d < a) return [x1 - d, y0];
      d -= a; return [x0, y0 + d];
    }
    function moveXf(dt) {
      const X = s0.X, xn = s0.xnow;
      if (!xn) return;
      const u = xn.phiRef > 0 ? Math.max(-1, Math.min(1, xn.phi / xn.phiRef)) : 0, a = Math.abs(u);
      xf.flux.visible = s0.show3.field;
      if (!LD.reducedMotion()) xf.fluxS += (u >= 0 ? 1 : -1) * 0.06 * dt;
      xf.flux.children.forEach(function (m) {
        const p = fluxPos(m.userData.s + xf.fluxS);
        m.position.set(p[0], p[1], XE.d / 2 + 0.1);   // 畫在鐵心正面（鐵心不透明）
        m.visible = a > 0.02;
        m.scale.setScalar(0.5 + 0.6 * a);
        m.userData.glow.material.opacity = 0.75 * a;
      });
      xf.fluxMat.emissiveIntensity = 0.3 + 1.4 * a;
      xf.fluxMat.opacity = 0.35 + 0.65 * a;
      // 電荷：速率 ∝ 電流
      const refs = s0.dc ? [Math.max(1e-9, s0.dcRef1), Math.max(1e-9, s0.dcRef2)] : [Math.SQRT2 * X.I1, Math.SQRT2 * X.I2];
      const cur = [xn.i1, xn.i2];
      xf.dots.forEach(function (g, i) {
        g.visible = s0.show3.dots;
        const v = refs[i] > 0 ? Math.max(-1.5, Math.min(1.5, cur[i] / refs[i])) : 0;
        g.children.forEach(function (m) {
          if (s0.playing || s0.dc) m.userData.s += (i ? 1 : -1) * 0.05 * v * dt;
          const s = ((m.userData.s % 1) + 1) % 1;
          m.position.copy(xf.coils[i].curve.getPoint(s));
          m.visible = Math.abs(v) > 0.02;
        });
      });
      // 燈泡亮度 ∝ 瞬時功率
      const p2 = Math.abs(xn.v2 * xn.i2), lu = Math.max(0, Math.min(1, p2 / 200));
      xf.glassMat.emissiveIntensity = 2.2 * lu;
      xf.halo.material.opacity = 0.9 * lu;
      xf.halo.scale.setScalar(1.6 + 2.2 * lu);
    }

    // =================================================================
    // 相機
    // =================================================================
    const VIEW = { gen: new THREE.Vector3(0.25, 0.6, 1).normalize(), xf: new THREE.Vector3(0.35, 0.32, 1).normalize() };
    const BOX = { gen: { c: new THREE.Vector3(0.9, -0.4, 0.9), r: 8.4 }, xf: { c: new THREE.Vector3(0, 0, 0), r: 8.6 } };
    let fitKey = '';
    function fit(force) {
      const k = mode + '|' + camera.aspect.toFixed(3);
      if (!force && k === fitKey) return;
      fitKey = k;
      const b = BOX[mode] || BOX.gen;
      const dir = force ? (VIEW[mode] || VIEW.gen).clone() : camera.position.clone().sub(controls.target).normalize();
      const tv = Math.tan(camera.fov * Math.PI / 360), th = tv * camera.aspect;
      const dist = b.r / Math.min(tv, th) * 0.92;
      controls.target.copy(b.c);
      camera.position.copy(b.c).addScaledVector(dir, dist);
      camera.updateProjectionMatrix();
      controls.update();
    }

    // =================================================================
    // 繪製與更新
    // =================================================================
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
    const onVisible = function () { if (!document.hidden) { lastNow = 0; requestRender(); } };
    document.addEventListener('visibilitychange', onVisible);
    canvas.addEventListener('webglcontextlost', function (ev) {
      ev.preventDefault();
      if (!api.active) return;   // 切回 2D 時自己釋放的，不是意外中斷
      if (env.lost) env.lost();
    });

    function update() {
      if (!api.active) return;
      s0 = env.state();
      if (!s0 || !s0.G) return;
      const now = performance.now();
      const dt = lastNow ? Math.min(1 / 30, (now - lastNow) / 1000) : 0;
      lastNow = now;
      const modeChanged = s0.mode !== mode;
      if (modeChanged) { mode = s0.mode; keys.b = ''; }
      const theme = LD.ver;
      const kB = [mode, s0.key, theme, s0.comm, s0.dc, s0.turns, window.LabSettings && window.LabSettings.lang].join('|');
      if (keys.b !== kB) {
        keys.b = kB;
        tok = env.tokens ? env.tokens() : {};
        if (mode === 'gen') { clearGroup(xfGroup); xf = null; buildGen(); }
        else if (mode === 'xf') { clearGroup(genGroup); gen = null; buildXf(); }
        // 取景範圍：依實際的物件（不含標籤）算外接球
        const grp = mode === 'gen' ? genGroup : xfGroup, bb = new THREE.Box3();
        grp.traverse(function (o) { if (o.isMesh && o.geometry) { o.updateWorldMatrix(true, false); bb.expandByObject(o, false); } });
        if (!bb.isEmpty()) {
          const sp = bb.getBoundingSphere(new THREE.Sphere());
          const b = BOX[mode], nr = sp.radius * 0.95;
          // 只有範圍明顯改變（或換模式）才重新取景，免得每拉一次滑桿相機就跳
          if (modeChanged || !b.fixed || Math.abs(nr - b.r) > 0.25 * b.r) { b.c.copy(sp.center); b.r = nr; b.fixed = true; fit(true); }
        }
      }
      if (modeChanged) fit(true);
      genGroup.visible = mode === 'gen';
      xfGroup.visible = mode === 'xf';
      if (mode === 'gen' && gen) moveGen(dt);
      else if (mode === 'xf' && xf) moveXf(dt);
      requestRender();
    }

    const api = {
      active: true,
      scene: scene,   // 測試用
      update: update,
      rebuild: function () { keys.b = ''; update(); },
      onTheme: function () { keys.b = ''; update(); },
      resetCamera: function () { fit(true); requestRender(); },
      dispose: function () {
        api.active = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        document.removeEventListener('visibilitychange', onVisible);
        controls.dispose();
        disposeObject(scene);
        if (glowTex) glowTex.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        canvas.remove();
      }
    };

    const w0 = canvas.clientWidth, h0 = canvas.clientHeight;
    if (w0 && h0) { renderer.setSize(w0, h0, false); camera.aspect = w0 / h0; camera.updateProjectionMatrix(); }
    update();
    fit(true);
    return api;
  }

  window.ACGenerator3D = { create: create };
})();
