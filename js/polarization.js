(function () {
  'use strict';
  const C = window.PolarizationCore;
  const D = window.LabDraw;
  const T = window.LabSettings.t;
  const N = window.LabNum;
  const $ = id => document.getElementById(id);
  const scene = $('scene');
  const graph = $('graph');
  scene.style.touchAction = 'pan-y';
  graph.style.touchAction = 'pan-y';
  const modeButtons = [...$('modes').querySelectorAll('button')];
  const val = id => N.value($(id));
  const format = (v, n = 2) => v.toFixed(n);
  const percent = (v, n = 2) => format(v * 100, n) + ' %';
  const rad = Math.PI / 180;
  const filterIds = { two: ['A', 'C'], three: ['A', 'B', 'C'] };
  // A fixed set of sample directions keeps the unpolarized illustration still.
  const sampleDirections = [19, 121, 72, 151].map(C.axis);
  let mode = 'two';
  let unpolarized = true;
  let state;
  let view;

  function colors() {
    return {
      light: D.c.equi, axis: getComputedStyle(document.documentElement).getPropertyValue('--b-optics').trim(),
      pass: D.c.probe, stop: D.c.pos, s: D.c.neg, p: D.c.pos
    };
  }

  function updateSettings() {
    const reflection = mode === 'reflection';
    $('sourceCard').hidden = reflection;
    $('filterCard').hidden = reflection;
    $('mediumCard').hidden = !reflection;
    $('filterOptions').hidden = reflection;
    $('reflectionOptions').hidden = !reflection;
    $('middleRow').hidden = mode !== 'three';
    $('sourceAngleRow').hidden = unpolarized;
    $('sourceUnpolarized').setAttribute('aria-pressed', String(unpolarized));
    $('sourceLinear').setAttribute('aria-pressed', String(!unpolarized));
    $('sourceNote').textContent = unpolarized
      ? T('理想的第一片偏振片讓一半的入射光強通過。', 'The first ideal polarizer transmits half the incident intensity.')
      : T('第一片透射的光強也遵守馬呂斯定律。', 'The intensity after the first filter also follows Malus’s law.');
    modeButtons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
    ['sourceAngle', 'angleA', 'angleB', 'angleC', 'n1', 'n2', 'incident', 'reflectionAnalyzer'].forEach(id => {
      $(id + 'o').textContent = val(id) + (id[0] === 'n' ? '' : '°');
    });
  }

  function update() {
    $('recordNote').hidden = true;
    if (mode === 'reflection') {
      const n1 = val('n1'), n2 = val('n2'), inc = val('incident');
      const r = C.fresnel(n1, n2, inc);
      const analyzer = val('reflectionAnalyzer');
      state = { n1, n2, inc, r, analyzer, brewster: C.brewsterAngle(n1, n2),
        analyzed: C.reflectedThroughAnalyzer(r, analyzer) };
    } else {
      const ids = filterIds[mode];
      const angles = ids.map(id => val('angle' + id));
      const sourceAngle = unpolarized ? null : val('sourceAngle');
      state = { ids, angles, sourceAngle, ...C.transmit(angles, sourceAngle) };
      state.noMiddle = C.transmit([angles[0], angles.at(-1)], sourceAngle).intensity;
    }
    updateSettings();
    render();
  }

  function row(label, value) {
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = label;
    dd.textContent = value;
    return [dt, dd];
  }

  function updateReadings() {
    const read = $('readout');
    const note = $('readNote');
    note.hidden = false;
    if (mode === 'reflection') {
      const { r, brewster } = state;
      read.replaceChildren(
        ...row(T('折射角', 'Refraction angle'), r.angleT === null ? '—' : format(r.angleT) + '°'),
        ...row(T('布魯斯特角', 'Brewster’s angle'), brewster === null ? '—' : format(brewster) + '°'),
        ...row(T('s 反射率', 's reflectance'), percent(r.rs)),
        ...row(T('p 反射率', 'p reflectance'), percent(r.rp)),
        ...row(T('無偏振光反射率', 'Unpolarized reflectance'), percent(r.reflected)),
        ...row(T('反射光的偏振度', 'Reflected polarization'), r.polarization === null ? '—' : percent(r.polarization)),
        ...row(T('檢偏片後光強', 'After the analyzer'), percent(state.analyzed)));
      note.textContent = brewster === null ? T('兩側折射率相同，界面沒有反射。', 'Matching refractive indices produce no reflection.')
        : r.totalInternal ? T('全反射：s、p 反射率皆為 100 %。', 'Total internal reflection: both reflectances are 100%.')
          : Math.abs(state.inc - brewster) <= 0.05
            ? T('接近布魯斯特角，反射光幾乎只剩 s 分量。', 'Near Brewster’s angle, almost all reflected light is s-polarized.')
            : T('s 垂直入射面，p 平行入射面。', 's is perpendicular to the plane of incidence, and p lies in it.');
      return;
    }
    const { stages, ids } = state;
    const rows = stages.flatMap((stage, i) => row(T(ids[i] + ' 後光強', 'After ' + ids[i]), percent(stage.intensity)));
    rows.push(...row(T('A、C 軸夾角', 'Angle between A and C'), format(C.angleBetween(state.angles[0], state.angles.at(-1))) + '°'));
    if (mode === 'three') rows.push(...row(T('抽掉 B 的光強', 'Intensity without B'), percent(state.noMiddle)));
    read.replaceChildren(...rows);
    note.textContent = T('以入射光強為 100 %。', 'The original incident intensity is 100%.');
  }

  function pill(ctx, label, x, y, color = D.c.text) {
    D.pill(ctx, label, x, y, color, 'center');
  }

  function line(ctx, color, width, points, dash = []) {
    ctx.beginPath();
    points.forEach(([x, y], i) => { if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.setLineDash(dash); ctx.stroke(); ctx.setLineDash([]);
  }

  function beam(ctx, a, b, power, tint, maxWidth) {
    if (power <= 1e-9) {
      line(ctx, D.alpha(D.c.muted, 0.44), 1.05, [a, b], [3, 5]);
      return;
    }
    line(ctx, D.alpha(tint, 0.29), maxWidth * 1.8 * power, [a, b]);
    line(ctx, D.mix(tint, D.c.text, 0.13), maxWidth * power, [a, b]);
  }

  function drawFilters(ctx, w, h) {
    const tint = colors();
    const { stages, ids } = state;
    const rowY = h * 0.31;
    const diodeX = w * 0.89;
    const emitterX = w * 0.1;
    const dx = (diodeX - emitterX) / (stages.length + 1);
    const anchor = i => emitterX + dx * (i + 1);
    const intensity = [1, ...stages.map(s => s.intensity)];
    const baseX = [emitterX, ...stages.map((_, i) => anchor(i)), diodeX];
    D.grid(ctx, 12, 15, w - 12, h * 0.52, 44, 11, emitterX, rowY);
    D.contactShadow(ctx, w / 2, rowY + h * 0.145, w * 0.39, h * 0.035);
    intensity.forEach((power, i) => {
      beam(ctx, [baseX[i], rowY], [baseX[i + 1], rowY], power, tint.light, Math.min(13, w * 0.032));
      const glyphs = i === 0 && state.sourceAngle === null
        ? sampleDirections : [i === 0 ? C.axis(state.sourceAngle) : stages[i - 1].field];
      const length = Math.min(31, dx * 0.36);
      glyphs.forEach((field, j) => {
        const x = baseX[i] + dx * (glyphs.length === 1 ? 0.50 : 0.33 + 0.17 * j);
        // An oblique projection of the plane perpendicular to the beam.
        const fx = field.x * length * 0.48;
        const fy = -(field.y + field.x * 0.28) * length;
        D.arrow(ctx, x, rowY, x + fx, rowY + fy, i ? tint.pass : D.c.field, 1.7);
      });
    });
    const casing = Math.max(12, Math.min(29, w * 0.046));
    D.block(ctx, emitterX - casing * 0.85, rowY - casing * 0.68, casing * 1.65, casing * 1.36, D.c.field);
    D.ball(ctx, emitterX + casing * 0.55, rowY, casing * 0.3, tint.light, { glow: 0.28 });
    D.block(ctx, diodeX - casing * 0.4, rowY - casing * 0.93, casing * 0.8, casing * 1.86, D.c.field);
    D.ball(ctx, diodeX - casing * 0.24, rowY, casing * 0.27,
      D.mix(D.c.field, tint.light, Math.sqrt(state.intensity)), { glow: state.intensity });
    const labelY = Math.max(24, rowY - Math.max(casing, h * 0.133));
    pill(ctx, T('光源', 'Source'), emitterX, labelY);
    pill(ctx, T('接收器', 'Detector'), diodeX, labelY);
    stages.forEach((stage, i) => {
      const x = anchor(i);
      const half = Math.min(36, h * 0.12);
      D.block(ctx, x - 7, rowY - half, 14, half * 2, tint.axis);
      D.block(ctx, x - 3, rowY + half, 6, 9, D.c.muted);
      pill(ctx, ids[i], x, labelY, tint.axis);
    });
    const y = h * 0.72;
    const radius = Math.min(w * 0.095, h * 0.157, 56);
    const spacing = w / stages.length;
    stages.forEach((stage, i) => {
      const x = spacing * (i + 0.5);
      const to = v => [x + v.x * radius, y - v.y * radius];
      const outline = D.alpha(tint.axis, 0.57);
      ctx.beginPath(); ctx.arc(x, y, radius, 0, 2 * Math.PI);
      ctx.fillStyle = D.alpha(tint.axis, 0.095); ctx.fill();
      ctx.lineWidth = 1.2; ctx.strokeStyle = outline; ctx.stroke();
      line(ctx, D.alpha(D.c.muted, 0.38), 1, [[x, y - radius], [x, y + radius]]);
      line(ctx, tint.axis, 1.2, [to({ x: -stage.axis.x, y: -stage.axis.y }), to(stage.axis)], [4, 3]);
      if ($('components').checked) D.arrow(ctx, x, y, ...to(stage.rejected), tint.stop, 2.5, { dash: [4, 3] });
      D.arrow(ctx, x, y, ...to(stage.field), tint.pass, 2.75);
      pill(ctx, ids[i] + ' · ' + stage.angle + '°', x, y - radius - 3, tint.axis);
      pill(ctx, percent(stage.intensity), x, Math.min(h - 3, y + radius + 23), tint.pass);
    });
  }

  function drawReflection(ctx, w, h) {
    const tint = colors();
    const { inc, n1, n2, r } = state;
    const x = w / 2, y = h * 0.58;
    const distance = Math.min(w * 0.41, h * 0.51);
    const ray = (angle, sx, sy) => [x + sx * Math.sin(angle * rad) * distance, y + sy * Math.cos(angle * rad) * distance];
    const medium = ctx.createLinearGradient(0, y, 0, h);
    medium.addColorStop(0, D.alpha(tint.s, 0.08));
    medium.addColorStop(1, D.alpha(tint.s, 0.29));
    ctx.fillStyle = medium; ctx.fillRect(0, y, w, h - y);
    D.grid(ctx, 10, 10, w - 10, h - 10, 40, 10, x, y);
    line(ctx, tint.s, 2, [[8, y], [w - 8, y]]);
    line(ctx, D.c.muted, 1.2, [[x, 12], [x, h - 12]], [5, 4]);
    const beamIn = ray(inc, -1, -1), beamR = ray(inc, 1, -1);
    const [ux, uy] = [Math.sin(inc * rad), -Math.cos(inc * rad)];
    const analyzer = [x + (beamR[0] - x) * 0.61, y + (beamR[1] - y) * 0.61];
    beam(ctx, [x, y], analyzer, r.reflected, tint.axis, 16);
    beam(ctx, analyzer, beamR, state.analyzed, tint.pass, 16);
    D.arrow(ctx, ...beamIn, x, y, D.mix(tint.light, D.c.text, 0.25), 2.75);
    if (r.angleT !== null && r.reflected < 1 - 1e-10) {
      const refracted = ray(r.angleT, 1, 1);
      refracted[1] = Math.min(h - 19, refracted[1]);
      if (r.angleT < 89.999 && refracted[1] === h - 19) refracted[0] = x + Math.tan(r.angleT * rad) * (refracted[1] - y);
      D.arrow(ctx, x, y, ...refracted, tint.light, 2.2 + 2.4 * Math.sqrt(1 - r.reflected));
    }
    const [ax, ay] = analyzer;
    const cos = Math.cos(state.analyzer * rad);
    const sin = Math.sin(state.analyzer * rad);
    const px = -uy, py = ux;
    line(ctx, tint.axis, 5, [[ax - px * 13, ay - py * 13], [ax + px * 13, ay + py * 13]]);
    line(ctx, D.alpha(D.c.surface, 0.72), 1.4, [[ax - px * 10, ay - py * 10], [ax + px * 10, ay + py * 10]]);
    D.arrow(ctx, ax - (px * sin + 0.42 * cos) * 11, ay - (py * sin - 0.58 * cos) * 11,
      ax + (px * sin + 0.42 * cos) * 11, ay + (py * sin - 0.58 * cos) * 11, tint.pass, 1.9);
    if (inc >= 21 && r.reflected > 1e-9) {
      const sx = x + (beamR[0] - x) * 0.35, sy = y + (beamR[1] - y) * 0.35;
      if (r.rs > 1e-9) D.ball(ctx, sx, sy, Math.sqrt(r.rs) * 8.5, tint.s);
      const pLength = 22 * Math.sqrt(r.rp);
      D.arrow(ctx, sx, sy, sx + px * pLength, sy + py * pLength, tint.p, 1.8);
    }
    if (inc > 0) {
      ctx.beginPath(); ctx.arc(x, y, Math.min(30, distance * 0.28), -Math.PI / 2 - inc * rad, -Math.PI / 2);
      ctx.lineWidth = 1.25; ctx.strokeStyle = D.c.muted; ctx.stroke();
    }
    D.ball(ctx, x, y, 3.8, D.c.field, { glow: 0.16 });
    D.pill(ctx, 'n1 = ' + n1, w - 13, y - 8, D.c.text, 'right');
    D.pill(ctx, 'n2 = ' + n2, 12, y + 28, D.c.text);
    const labels = [
      [T('入射', 'Incident') + ' ' + format(inc, 1) + '°', 13, 27, D.c.text],
      [T('檢偏後', 'Analyzed') + ' ' + percent(state.analyzed), w - 13, 27, tint.pass]
    ];
    labels.forEach(([label, lx, ly, color], i) => D.pill(ctx, label, lx, ly, color, i ? 'right' : 'left'));
    if (r.angleT !== null && r.reflected < 1 - 1e-10)
      D.pill(ctx, T('折射', 'Refracted') + ' ' + format(r.angleT, 1) + '°', w - 13, h - 9, tint.light, 'right');
    else D.pill(ctx, r.totalInternal ? T('全反射', 'Total internal reflection') : T('臨界角', 'Critical angle'),
      w - 13, h - 9, tint.axis, 'right');
  }

  function drawChart(ctx, w, h) {
    const tint = colors();
    const reflection = mode === 'reflection';
    const scanB = mode === 'three';
    const maxAngle = reflection ? 90 : 180;
    const top = 26, bottom = h - 29, left = 38, right = w - 18;
    const max = reflection || !unpolarized ? 1 : 0.5;
    const px = theta => left + (right - left) * theta / maxAngle;
    const py = i => bottom - (bottom - top) * i / max;
    D.grid(ctx, left, top, right, bottom, (right - left) / 6, (right - left) / 18, left, bottom);
    const traces = [[], []];
    for (let j = 0; j <= 180; j++) {
      const theta = maxAngle * j / 180;
      if (reflection) {
        const { rs, rp } = C.fresnel(state.n1, state.n2, theta);
        traces[0].push([px(theta), py(rs)]);
        traces[1].push([px(theta), py(rp)]);
      } else {
        const angles = state.angles.slice();
        angles[1] = theta;
        traces[0].push([px(theta), py(C.transmit(angles, state.sourceAngle).intensity)]);
      }
    }
    for (const fraction of [0, 0.5, 1]) {
      const yy = py(max * fraction);
      line(ctx, D.alpha(D.c.muted, 0.36), 1, [[left, yy], [right, yy]]);
      D.haloText(ctx, String(max * fraction * 100), left - 5, yy, D.c.muted, 'right', 'middle');
    }
    if (!reflection) {
      ctx.beginPath(); ctx.moveTo(left, bottom); traces[0].forEach(([xx, yy]) => ctx.lineTo(xx, yy));
      ctx.lineTo(right, bottom); ctx.closePath();
      const fill = ctx.createLinearGradient(0, top, 0, bottom);
      fill.addColorStop(0, D.alpha(tint.axis, 0.37)); fill.addColorStop(1, D.alpha(tint.axis, 0.07));
      ctx.fillStyle = fill; ctx.fill();
      line(ctx, tint.axis, 2.4, traces[0]);
      if (scanB) line(ctx, tint.stop, 1.45, [[left, py(state.noMiddle)], [right, py(state.noMiddle)]], [4, 4]);
    } else {
      line(ctx, tint.s, 2.25, traces[0]);
      line(ctx, tint.p, 2.25, traces[1], [5, 3]);
      if (state.brewster !== null && $('brewsterMark').checked) {
        const x = px(state.brewster);
        line(ctx, tint.pass, 1.3, [[x, top], [x, bottom]], [3, 4]);
        D.vecLabel(ctx, 'θ', 'B', x, top + 10, tint.pass);
      }
    }
    const theta = reflection ? state.inc : state.angles[1];
    const current = px(theta);
    line(ctx, D.alpha(D.c.field, 0.80), 1.15, [[current, top], [current, bottom]], [3, 3]);
    const markers = reflection ? [[state.r.rs, tint.s], [state.r.rp, tint.p]] : [[state.intensity, tint.axis]];
    markers.forEach(([value, color]) => D.ball(ctx, current, py(value), 3.4, color, { glow: 0.1 }));
    for (let i = 0; i <= 4; i++) {
      const angle = i * maxAngle / 4;
      D.haloText(ctx, angle + '°', px(angle), bottom + 14, D.c.muted, 'center');
    }
    const xLabel = reflection ? T('入射角', 'Incidence angle') : scanB ? T('中間片 B 角度', 'Middle filter B angle') : T('檢偏片 C 角度', 'Analyzer C angle');
    D.haloText(ctx, reflection ? 'R (%)' : 'I / I0 (%)', left, 17, D.c.muted);
    D.haloText(ctx, xLabel, w / 2, h - 3, D.c.muted, 'center');
  }

  function onCanvas(canvas, draw) {
    const { width, height } = canvas.getBoundingClientRect();
    if (!width || !height) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.round(width * dpr), h = Math.round(height * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(ctx, width, height);
    draw(ctx, width, height);
  }

  function label3D(THREE, group, text, color, x, y, z) {
    const canvas = document.createElement('canvas');
    canvas.width = 320; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const font = '600 23px ' + D.FONT;
    const box = D.pill(ctx, text, 12, 42, color, 'left', font);
    // 裁到標籤本身，讓標籤中心與指定座標重合。
    const crop = document.createElement('canvas');
    crop.width = Math.ceil(box.w + 4); crop.height = Math.ceil(box.h + 4);
    crop.getContext('2d').drawImage(canvas, box.x - 2, box.y - 2, crop.width, crop.height, 0, 0, crop.width, crop.height);
    const texture = new THREE.CanvasTexture(crop);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
    sprite.position.set(x, y, z);
    const height = 0.31;
    sprite.scale.set(height * crop.width / crop.height, height, 1);
    sprite.renderOrder = 5;
    group.add(sprite);
  }

  function scene3D(THREE, group) {
    const V = (...v) => new THREE.Vector3(...v);
    const tint = colors();
    function mesh(geometry, color, options = {}) {
      const m = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.36, ...options }));
      m.castShadow = !options.transparent;
      m.receiveShadow = true;
      group.add(m);
      return m;
    }

    function poly(points, color, opacity = 1) {
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({ color, opacity, transparent: opacity < 1 })));
    }

    function arrow(from, delta, color) {
      const length = delta.length();
      if (length <= 0.016) return;
      const a = new THREE.ArrowHelper(delta.clone().normalize(), from, length, new THREE.Color(color),
        Math.min(length * 0.38, 0.19), Math.min(length * 0.27, 0.12));
      a.children.forEach(o => { o.geometry = o.geometry.clone(); });
      group.add(a);
    }

    if (mode === 'reflection') {
      const { inc, r } = state;
      const medium = mesh(new THREE.BoxGeometry(7.6, 0.72, 3.1), tint.s, { transparent: true, opacity: 0.22, depthWrite: false });
      medium.position.y = -0.37;
      mesh(new THREE.PlaneGeometry(6.7, 4.8), tint.s, { transparent: true, opacity: 0.073, side: THREE.DoubleSide, depthWrite: false });
      poly([V(0, -1.03, 0), V(0, 2.3, 0)], D.c.muted, 0.60);
      poly([V(-3.35, 0, 0), V(3.35, 0, 0)], D.c.muted, 0.60);
      const origin = V(0, 0, 0), ri = inc * rad;
      const incoming = V(-Math.sin(ri), Math.cos(ri), 0).multiplyScalar(3.2);
      const reflected = V(-incoming.x, incoming.y, 0);
      const direction = reflected.clone().normalize();
      const analyzer = reflected.clone().multiplyScalar(0.66);
      const normal = V(Math.cos(ri), -Math.sin(ri), 0);
      const angle = state.analyzer * rad;
      const axis = normal.clone().multiplyScalar(Math.sin(angle)).add(V(0, 0, Math.cos(angle)));
      const filter = mesh(new THREE.TorusGeometry(0.43, 0.045, 10, 32), tint.axis);
      filter.quaternion.setFromUnitVectors(V(0, 0, 1), direction);
      filter.position.copy(analyzer);
      poly([analyzer.clone().addScaledVector(axis, -0.37), analyzer.clone().addScaledVector(axis, 0.37)], tint.pass);
      arrow(incoming, incoming.clone().negate(), tint.light);
      if (r.reflected > 1e-9) arrow(origin, analyzer, tint.axis);
      if (state.analyzed > 1e-9) arrow(analyzer, reflected.clone().sub(analyzer), tint.pass);
      else poly([analyzer, reflected], D.c.muted, 0.24);
      if (r.angleT !== null && r.reflected < 1 - 1e-10) {
        const rt = r.angleT * rad;
        arrow(origin, V(Math.sin(rt), -Math.cos(rt), 0).multiplyScalar(1.8), tint.light);
      }
      if (r.reflected > 1e-10) {
        const point = reflected.clone().multiplyScalar(0.38);
        arrow(point, V(0, 0, Math.sqrt(r.rs / 2) * 1.35), tint.s);
        arrow(point, normal.multiplyScalar(Math.sqrt(r.rp / 2) * 1.35), tint.p);
      }
      return;
    }

    const { stages, sourceAngle } = state;
    const start = -4.0, end = 4.0;
    const dx = (end - start) / (stages.length + 1);
    const at = i => start + dx * (i + 1);
    const wave = (field, a, b, color, phase = 0) => {
      if (Math.hypot(field.x, field.y) < 1e-12) return;
      const points = Array.from({ length: 39 }, (_, i) => {
        const x = a + i * (b - a) / 38;
        const amplitude = 0.86 * Math.cos(4.7 * (x - start) + phase);
        return V(x, field.y * amplitude, field.x * amplitude);
      });
      poly(points, color);
    };
    const instrument = new THREE.CylinderGeometry(0.36, 0.36, 0.54, 32);
    instrument.rotateZ(Math.PI / 2);
    mesh(instrument, D.c.field).position.x = start;
    mesh(instrument, D.c.field).position.x = end;
    const receiver = mesh(new THREE.SphereGeometry(0.23, 24, 16), D.mix(D.c.field, tint.light, Math.sqrt(state.intensity)),
      { emissive: tint.light, emissiveIntensity: Math.sqrt(state.intensity) });
    receiver.position.x = end - 0.26;
    label3D(THREE, group, T('光源', 'Source'), D.c.text, start, 0.8, 0);
    label3D(THREE, group, percent(state.intensity), D.c.probe, end, 0.8, 0);
    poly([V(start, 0, 0), V(end, 0, 0)], D.c.muted, 0.51);
    if (sourceAngle === null) {
      sampleDirections.forEach((field, i) => {
        const x = start + 0.39 + (at(0) - start - 0.5) * i / (sampleDirections.length - 1);
        arrow(V(x, 0, 0), V(0, 0.57 * field.y, 0.57 * field.x), tint.light);
      });
    } else wave(C.axis(sourceAngle), start + 0.3, at(0), tint.light);
    stages.forEach((stage, i) => {
      const x = at(i);
      const ring = mesh(new THREE.TorusGeometry(1.03, 0.061, 10, 48), D.c.field, { metalness: 0.17 });
      ring.rotateY(Math.PI / 2); ring.position.x = x;
      label3D(THREE, group, state.ids[i] + ' · ' + stage.angle + '°', tint.axis, x, 1.28, 0);
      const filter = mesh(new THREE.CircleGeometry(1.035, 48), tint.axis, { transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false });
      filter.rotateY(Math.PI / 2); filter.position.x = x;
      const foot = mesh(new THREE.BoxGeometry(0.22, 0.1, 0.8), D.c.muted);
      foot.position.set(x, -1.01, 0);
      const { axis, field, rejected } = stage;
      poly([V(x + 0.012, -axis.y, -axis.x), V(x + 0.012, axis.y, axis.x)], tint.axis);
      arrow(V(x + 0.1, 0, 0), V(0, 1.25 * field.y, 1.25 * field.x), tint.pass);
      if ($('components').checked) arrow(V(x - 0.1, 0, 0), V(0, 1.25 * rejected.y, 1.25 * rejected.x), tint.stop);
      wave(field, x, i + 1 === stages.length ? end - 0.29 : at(i + 1), tint.pass);
    });
  }

  function render() {
    const tint = colors();
    updateReadings();
    $('sceneHint').textContent = mode === 'reflection'
      ? T('入射角從法線量起。藍色為 s 電場，紅色為 p 電場，綠色光束通過檢偏片。可點圖調入射角。', 'Measure incidence from the normal. Blue marks the s field and red marks the p field. The green beam passes through the analyzer. Tap the graph to set incidence.')
      : view && view.active
        ? T('沿途短箭頭與波形表示電場。透光軸為紫色，綠色分量通過，紅色分量被擋下。', 'Small arrows and waves show the field. Purple marks the transmission axes, with passed components in green and blocked components in red.')
        : T('光束越寬，光強越大。沿途短箭頭表示電場方向。透光軸為紫色，綠色分量通過，紅色分量被擋下。', 'Beam width scales with intensity. Small arrows show field directions. Purple marks the transmission axes, with passed components in green and blocked components in red.');
    const keys = mode === 'reflection' ? [[tint.s, 's'], [tint.p, 'p']]
      : [[tint.axis, T('透光軸', 'Transmission axis')], [tint.pass, T('通過', 'Passed')], [tint.stop, T('被擋', 'Blocked')]];
    $('legend').replaceChildren(...keys.map(([color, label]) => {
      const item = document.createElement('span'), bar = document.createElement('i');
      bar.style.backgroundColor = color;
      item.append(bar, ' ' + label);
      return item;
    }));
    if (view && view.active) view.draw();
    else drawScene2D();
    drawGraph();
  }

  function drawGraph() {
    const width = graph.clientWidth;
    if (!width) return;
    const height = Math.round(width * (width <= 450 ? 0.50 : 0.32));
    if (graph.clientHeight !== height) graph.style.height = height + 'px';
    onCanvas(graph, drawChart);
  }

  function reportMission(event) {
    if (!window.LabMission || (window.LabShare && window.LabShare.restoring)) return;
    window.LabMission.emit(event, { mode, ...state });
  }

  graph.addEventListener('click', event => {
    const { width, left } = graph.getBoundingClientRect();
    const u = Math.max(0, Math.min(1, (event.clientX - left - 38) / (width - 56)));
    const id = mode === 'reflection' ? 'incident' : mode === 'three' ? 'angleB' : 'angleC';
    N.set($(id), u * (mode === 'reflection' ? 90 : 180));
  });

  modeButtons.forEach(b => b.addEventListener('click', () => {
    if (mode === b.dataset.mode) return;
    mode = b.dataset.mode;
    update();
    reportMission('state-changed');
  }));
  [['sourceUnpolarized', true], ['sourceLinear', false]].forEach(([id, next]) => {
    $(id).addEventListener('click', () => {
      if (unpolarized === next) return;
      unpolarized = next;
      update();
      reportMission('state-changed');
    });
  });
  ['angleA', 'angleB', 'angleC', 'sourceAngle', 'n1', 'n2', 'incident', 'reflectionAnalyzer'].forEach(id => {
    $(id).addEventListener('input', update);
    $(id).addEventListener('change', () => {
      // The two values of a media preset represent one committed setting.
      if (!applyingPreset) reportMission('state-changed');
    });
  });
  ['components', 'brewsterMark'].forEach(id => $(id).addEventListener('input', update));
  let applyingPreset = false;
  [['airGlass', 1, 1.5], ['glassAir', 1.5, 1]].forEach(([id, n1, n2]) => {
    $(id).addEventListener('click', () => {
      if (val('n1') === n1 && val('n2') === n2) return;
      applyingPreset = true;
      try {
        N.set($('n1'), n1);
        N.set($('n2'), n2);
      } finally {
        applyingPreset = false;
      }
      reportMission('state-changed');
    });
  });
  $('record').addEventListener('click', () => {
    $('recordNote').textContent = T('已記錄目前讀數。', 'Current readings recorded.');
    $('recordNote').hidden = false;
    reportMission('recorded');
  });
  function drawScene2D() {
    const width = scene.clientWidth;
    if (!width || !state) return;
    const height = Math.round(width * (width <= 460 ? 0.64 : 0.625));
    if (scene.clientHeight !== height) scene.style.height = height + 'px';
    onCanvas(scene, mode === 'reflection' ? drawReflection : drawFilters);
  }
  new ResizeObserver(drawScene2D).observe(scene);
  new ResizeObserver(drawGraph).observe(graph);
  window.addEventListener('lab:themechange', render);
  // 3D 沿用既有實驗的延遲載入、環繞相機與 WebGL 中斷退回方式。
  function installView(drawScene, label, cameraPositions, refresh) {
    const host = $('view3');
    let generation = 0;
    let view = null;

    function makeView(THREE, OrbitControls) {
      const canvas = document.createElement('canvas');
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', label);
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(32, 1.5, 0.1, 120);
      const controls = new OrbitControls(camera, canvas);
      controls.enableDamping = true;
      controls.dampingFactor = 0.13;
      controls.minDistance = 6;
      controls.maxDistance = 31;
      scene.add(new THREE.HemisphereLight(D.c.surface, D.c.muted, 2.1));
      const light = new THREE.DirectionalLight(D.shade(D.c.surface, D.dark ? 0.83 : 0), 2.5);
      light.position.set(-3, 7, 5);
      light.castShadow = true;
      light.shadow.mapSize.set(512, 512);
      Object.assign(light.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6 });
      scene.add(light);
      const group = new THREE.Group();
      scene.add(group);
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ opacity: 0.17 }));
      ground.rotateX(-Math.PI / 2);
      ground.position.y = -1.05;
      ground.receiveShadow = true;
      scene.add(ground);
      host.append(canvas);
      let frame = 0;
      let cameraKey = 'default';

      function request() {
        if (frame || document.hidden) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          controls.update();
          renderer.render(scene, camera);
        });
      }

      function resize() {
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        if (!width || !height) return;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
        request();
      }

      function clear() {
        const geometries = new Set();
        const materials = new Set();
        const textures = new Set();
        group.traverse(obj => {
          if (obj.geometry) geometries.add(obj.geometry);
          if (obj.material) {
            materials.add(obj.material);
            if (obj.material.map) textures.add(obj.material.map);
          }
        });
        geometries.forEach(g => g.dispose());
        materials.forEach(m => m.dispose());
        textures.forEach(t => t.dispose());
        group.clear();
      }

      function cameraAt(key) {
        cameraKey = key;
        camera.position.set(...cameraPositions(key));
        controls.target.set(0, 0.1, 0);
        controls.update();
        request();
      }

      const observer = new ResizeObserver(resize);
      observer.observe(canvas);
      controls.addEventListener('change', request);
      document.addEventListener('visibilitychange', request);
      canvas.addEventListener('webglcontextlost', event => {
        event.preventDefault();
        if (canvas.isConnected) switchTo2D(T('3D 連線中斷，已回到平面檢視。', 'The 3D context was lost. The 2D view is active.'));
      });
      cameraAt('default');
      return {
        cameraAt,
        draw() {
          clear();
          drawScene(THREE, group, cameraKey);
          const bounds = new THREE.Box3().setFromObject(group);
          ground.position.y = Math.min(-1.05, bounds.min.y - 0.04);
          request();
        },
        dispose() {
          canvas.remove();
          observer.disconnect();
          document.removeEventListener('visibilitychange', request);
          controls.removeEventListener('change', request);
          controls.dispose();
          cancelAnimationFrame(frame);
          clear();
          ground.geometry.dispose();
          ground.material.dispose();
          light.shadow.dispose();
          renderer.dispose();
          renderer.forceContextLoss();
        }
      };
    }

    function showMessage(message) {
      $('viewMsg').textContent = message;
      $('viewMsg').hidden = !message;
    }

    function switchTo2D(message = '') {
      generation++;
      if (view) view.dispose();
      view = null;
      $('view2').hidden = false;
      host.hidden = true;
      $('cameraOptions').hidden = true;
      $('view2d').setAttribute('aria-pressed', 'true');
      $('view3d').setAttribute('aria-pressed', 'false');
      showMessage(message);
      refresh();
    }

    $('view2d').addEventListener('click', () => switchTo2D());
    $('view3d').addEventListener('click', async () => {
      if (view) return;
      const token = ++generation;
      showMessage(T('載入 3D…', 'Loading 3D…'));
      try {
        const [THREE, orbit] = await Promise.all([
          import('../vendor/three/three.module.min.js'), import('../vendor/three/OrbitControls.js')
        ]);
        if (generation !== token) return;
        view = makeView(THREE, orbit.OrbitControls);
        $('view2').hidden = true;
        host.hidden = false;
        $('cameraOptions').hidden = false;
        $('view2d').setAttribute('aria-pressed', 'false');
        $('view3d').setAttribute('aria-pressed', 'true');
        showMessage('');
        refresh();
      } catch (error) {
        if (generation === token) switchTo2D(T('此裝置目前無法開啟 3D，請使用平面檢視。', '3D is unavailable on this device. Use the 2D view.'));
      }
    });
    [['camFace', 'face'], ['camSide', 'side'], ['resetCam', 'default']].forEach(([id, key]) => {
      $(id).addEventListener('click', () => { if (view) { view.cameraAt(key); view.draw(); } });
    });

    return {
      get active() { return view !== null; },
      draw() { if (view) view.draw(); }
    };
  }

  view = installView(scene3D,
    T('立體檢視：偏振片、電場與光線。拖曳旋轉，兩指縮放。', '3D view of the polarizing filters, electric field and rays. Drag to orbit or pinch to zoom.'),
    key => ({ face: [10, 1.2, 0.3], side: [0, 1.8, 13.4], default: [2.8, 3.0, 12.1] })[key],
    render
  );
  update();
})();
