(function () {
  'use strict';
  const C = window.HeatConductionCore;
  const D = window.LabDraw;
  const T = window.LabSettings.t;
  const N = window.LabNum;
  const $ = id => document.getElementById(id);
  const cv = $('cv');
  const ctx = cv.getContext('2d');
  cv.style.touchAction = 'pan-y';
  const names = key => T(C.materials[key].zh, C.materials[key].en);
  const val = id => N.value($(id));
  const format = (v, n = 2) => (Math.abs(v) < 0.5 * 10 ** -n ? 0 : v).toFixed(n).replace('-', '−');
  const controls = {
    length: 'cm', area: 'cm^2', fraction: '%', left: '°C', right: '°C', thickness: 'mm', deltaT: '°C'
  };
  const selection = { rod: { a: 'copper', b: 'steel' }, strip: { a: 'aluminum', b: 'steel' } };
  const modeButtons = [...$('modes').querySelectorAll('button')];
  const speedButtons = [...$('speedbar').querySelectorAll('button')];
  let mode = 'series';
  let speed = 20;
  let run;
  let strip;
  let profiles = [];
  let playing = false;
  let raf = 0;
  let last = 0;
  let lastRender = 0;
  let view;
  let lastLegendKey = '';
  let lastReadingTime = -Infinity;
  let thermalPaletteVersion = -1;
  let thermalPalette;
  let arrowScale;
  const flowPositions = [0.13, 0.31, 0.50, 0.69, 0.87];

  function selected() { return selection[mode === 'bimetal' ? 'strip' : 'rod']; }

  function drawMaterials() {
    for (const [id, slot] of [['materialA', 'a'], ['materialB', 'b']]) {
      for (const button of $(id).children) {
        button.hidden = mode === 'bimetal' && button.dataset.material === 'glass';
        button.setAttribute('aria-pressed', String(selected()[slot] === button.dataset.material));
        button.classList.toggle('primary', selected()[slot] === button.dataset.material);
      }
    }
  }

  function updateSettings() {
    $('rodControls').hidden = mode === 'bimetal';
    $('stripControls').hidden = mode !== 'bimetal';
    $('playback').hidden = mode === 'bimetal';
    $('materialLabelA').textContent = mode === 'bimetal' ? T('上層 A', 'Upper layer A') : T('棒 A', 'Rod A');
    $('materialLabelB').textContent = mode === 'bimetal' ? T('下層 B', 'Lower layer B') : T('棒 B', 'Rod B');
    $('fraction').labels[0].textContent = mode === 'parallel'
      ? T('A 棒的截面積占比', 'Rod A area share') : T('A 棒的長度占比', 'Rod A length share');
    $('modeHint').textContent = {
      series: T('兩棒頭尾相接，溫度在接面連續。', 'The rods meet end to end. Temperature is continuous at the junction.'),
      parallel: T('兩棒連到同一對熱庫，截面積加總固定。', 'The rods connect the same reservoirs. Their areas add to the fixed total.'),
      bimetal: T('兩層等厚，左端固定，右端可以自由彎曲。', 'The two layers are equally thick. The left end is fixed and the right end can bend.')
    }[mode];
    modeButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)));
    speedButtons.forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.speed) === speed)));
    drawMaterials();
    for (const [id, unit] of Object.entries(controls)) {
      const output = $(id + 'o');
      if (id === 'area') {
        const sup = document.createElement('sup');
        sup.textContent = '2';
        output.replaceChildren(val(id) + ' cm', sup);
      } else output.textContent = val(id) + ' ' + unit;
    }
  }

  function resetModel() {
    stop();
    $('recordNote').hidden = true;
    const length = val('length') / 100;
    if (mode === 'bimetal') {
      const { a, b } = selected();
      strip = C.expansion(a, b, length, val('thickness') / 1000, val('deltaT'));
    } else {
      run = C.createRun({ mode, ...selected(), length, area: val('area') / 10000,
        fraction: val('fraction') / 100, left: val('left'), right: val('right') });
    }
    updateSettings();
    render();
  }

  function read(label, value) {
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = label;
    dd.textContent = value;
    return [dt, dd];
  }

  function resistanceRow(label, suffix, value) {
    const row = read(label + ' R', format(value, 3) + ' K/W');
    const sub = document.createElement('sub');
    sub.textContent = suffix;
    row[0].append(sub);
    return row;
  }

  function readings() {
    const output = $('readout');
    const hint = $('readNote');
    hint.hidden = false;
    if (mode === 'bimetal') {
      output.replaceChildren(
        ...read(T('A 自由長度變化', 'A free length change'), format(strip.freeA * 1000, 3) + ' mm'),
        ...read(T('B 自由長度變化', 'B free length change'), format(strip.freeB * 1000, 3) + ' mm'),
        ...read(T('曲率半徑', 'Radius of curvature'), strip.curvature === 0 ? '∞' : format(1 / Math.abs(strip.curvature), 3) + ' m'),
        ...read(T('端點位移', 'Tip deflection'), format(strip.tip.y * 1000, 2) + ' mm'));
      hint.textContent = strip.curvature === 0 ? T('兩層等量伸縮，金屬片維持平直。', 'Both layers change length equally, and the strip stays straight.')
        : strip.curvature > 0 ? T('朝下層 B 彎。', 'Bends toward lower layer B.') : T('朝上層 A 彎。', 'Bends toward upper layer A.');
      return;
    }
    const m = run.model;
    const rows = [
      ...read(T('時間 t', 'Time t'), format(run.time, 1) + ' s'),
      ...read(T('穩態總熱流率', 'Total steady heat rate'), format(m.flow) + ' W'),
      ...read(T('等效熱阻', 'Effective thermal resistance'), format(m.resistance, 3) + ' K/W'),
      ...resistanceRow(mode === 'series' ? T('A 段熱阻', 'Section A resistance') : T('A 支路熱阻', 'Branch A resistance'),
        'A', m.resistances[0]),
      ...resistanceRow(mode === 'series' ? T('B 段熱阻', 'Section B resistance') : T('B 支路熱阻', 'Branch B resistance'),
        'B', m.resistances[1])
    ];
    if (mode === 'series') {
      const profile = profiles[0];
      const t = profile.temperatures[profile.x.length >> 1];
      rows.push(...read(T('當下接面溫度', 'Current junction temperature'), format(t) + ' °C'));
      rows.push(...read(T('穩態接面溫度', 'Steady junction temperature'), format(m.junction) + ' °C'));
      rows.push(...read(T('接面熱流率', 'Junction heat rate'), format(profile.flows[profile.flows.length >> 1]) + ' W'));
    } else {
      rows.push(...read(T('A 支路穩態熱流率', 'Branch A steady heat rate'), format(m.rates[0]) + ' W'));
      rows.push(...read(T('B 支路穩態熱流率', 'Branch B steady heat rate'), format(m.rates[1]) + ' W'));
    }
    output.replaceChildren(...rows);
    hint.textContent = T('熱流率以向右為正。', 'Rightward heat flow is positive.');
  }

  function temperatureColor(t) {
    if (thermalPaletteVersion !== D.ver) {
      const orange = getComputedStyle(document.documentElement).getPropertyValue('--b-mech');
      thermalPalette = [
        D.shade(D.c.neg, D.dark ? -0.44 : -0.36),
        D.c.neg,
        D.c.pos,
        D.shade(orange, D.dark ? 0.19 : 0.52)
      ];
      thermalPaletteVersion = D.ver;
    }
    const [cold, blue, red, orange] = thermalPalette;
    if (t <= 25) return D.mix(cold, blue, Math.max(0, t) / 25);
    if (t <= 75) return D.mix(blue, red, (t - 25) / 50);
    return D.mix(red, orange, Math.min(1, (t - 75) / 75));
  }

  function frame(x, y, w, h) {
    D.roundRect(ctx, x, y, w, h, 8);
    ctx.fillStyle = D.alpha(D.c.surface, 0.38);
    ctx.fill();
    ctx.strokeStyle = D.c.border;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function flowAt(branch, fraction) {
    const { faceX } = run.paths[branch];
    const x = fraction * run.model.length;
    const i = faceX.findIndex(pos => pos >= x);
    const q = profiles[branch].flows;
    return q[i - 1] + (q[i] - q[i - 1]) * (x - faceX[i - 1]) / (faceX[i] - faceX[i - 1]);
  }

  function insulation(left, y, width, height) {
    const top = y - height / 2 - 6;
    D.block(ctx, left + 1, top, width - 2, height + 12, D.shade(D.c.muted, D.dark ? -0.35 : 0.52));
    ctx.save();
    D.roundRect(ctx, left + 2, top, width - 4, height + 12, 6);
    ctx.clip();
    ctx.beginPath();
    for (let x = left; x < left + width + 8; x += 9) {
      ctx.moveTo(x, top + height + 12);
      ctx.lineTo(x + 12, top);
    }
    ctx.strokeStyle = D.alpha(D.c.field, 0.20);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  function drawRod(left, right, y, height, profile, index) {
    const m = run.model;
    const width = right - left;
    const gh = height * 0.76;
    D.contactShadow(ctx, (left + right) / 2, y + height * 0.65, width * 0.46, gh * 0.5);
    insulation(left, y, width, gh);
    D.block(ctx, left, y - gh / 2, width, gh, D.c.muted);
    D.roundRect(ctx, left + 1, y - gh / 2 + 1, width - 2, gh - 2, 5);
    ctx.save();
    ctx.clip();
    const horizontal = ctx.createLinearGradient(left, 0, right, 0);
    profile.x.forEach((x, i) => horizontal.addColorStop(Math.min(1, x / m.length), temperatureColor(profile.temperatures[i])));
    ctx.fillStyle = horizontal;
    ctx.fillRect(left, y - gh / 2, width, gh);
    const sheen = ctx.createLinearGradient(0, y - gh / 2, 0, y + gh / 2);
    const highlight = D.shade(D.c.surface, D.dark ? 0.80 : 0.20);
    const shadow = D.shade(D.c.field, -0.72);
    sheen.addColorStop(0, D.alpha(shadow, 0.26));
    sheen.addColorStop(0.18, D.alpha(highlight, 0.64));
    sheen.addColorStop(0.38, D.alpha(highlight, 0.13));
    sheen.addColorStop(0.62, D.alpha(shadow, 0));
    sheen.addColorStop(1, D.alpha(shadow, 0.65));
    ctx.fillStyle = sheen;
    ctx.fillRect(left, y - gh / 2, width, gh);
    ctx.restore();
    if (mode === 'series') {
      const split = left + width * m.parts[0].length / m.length;
      ctx.fillStyle = D.alpha(highlight, 0.85);
      ctx.fillRect(split - 1, y - gh / 2, 2, gh);
    } else {
      const slot = index === 0 ? 'a' : 'b';
      D.pill(ctx, slot.toUpperCase() + ' · ' + names(selected()[slot]), left + 12, y + 6, index === 0 ? D.c.pos : D.c.neg);
    }
    flowPositions.forEach(fraction => {
      const len = flowAt(index, fraction) / arrowScale * Math.min(65, width * 0.155);
      const x = left + fraction * width;
      const arrowY = y - gh / 2 - 12;
      D.arrow(ctx, x - len / 2, arrowY, x + len / 2, arrowY, D.c.field, 2.15);
    });
  }

  function referenceRate() {
    return Math.max(0.01, ...run.model.rates.map(Math.abs),
      ...profiles.flatMap((_, i) => flowPositions.map(x => Math.abs(flowAt(i, x)))));
  }

  function reservoir(x, top, width, height, temperature, left) {
    const tint = temperatureColor(temperature);
    D.contactShadow(ctx, x + width / 2, top + height, width * 0.65, 5);
    D.block(ctx, x + 2, top, width - 4, height, D.c.field);
    D.block(ctx, x + 5, top + 3, width - 10, height - 6, tint);
    for (let y = top + 8; y < top + height - 5; y += 7) {
      D.block(ctx, x, y, width, 3, D.mix(tint, D.c.field, 0.27));
    }
    const plate = left ? x + width - 5 : x;
    D.block(ctx, plate, top + 4, 5, height - 8, D.shade(tint, 0.24));
  }

  function plot(x, y, width, height) {
    const { model: m } = run;
    const left = x + 42, right = x + width - 14;
    const top = y + 31, bottom = y + height - 31;
    const wide = width > 430;
    const px = v => left + (right - left) * v / m.length;
    const extrema = [m.left, m.right, run.initial];
    const step = Math.max(10, Math.ceil((Math.max(...extrema) - Math.min(...extrema)) / 40) * 10);
    const lo = Math.floor(Math.min(...extrema) / step) * step;
    const hi = Math.max(lo + step * 2, Math.ceil(Math.max(...extrema) / step) * step);
    const py = t => bottom - (bottom - top) * (t - lo) / (hi - lo);
    frame(x, y, width, height);
    D.grid(ctx, left, top, right, bottom, (right - left) / 4, (right - left) / 16, left, bottom);
    D.haloText(ctx, 'T (°C)', left, y + 17, D.c.muted);
    D.haloText(ctx, 'x (cm)', right, y + height - 5, D.c.muted, 'right');
    const ticks = Math.max(1, Math.min(wide ? 4 : 3, Math.floor((bottom - top) / 17), Math.floor((hi - lo) / step)));
    for (let i = 0; i <= ticks; i++) {
      const t = lo + (hi - lo) * i / ticks;
      const p = py(t);
      ctx.beginPath(); ctx.moveTo(left, p); ctx.lineTo(right, p);
      ctx.lineWidth = 1; ctx.strokeStyle = D.alpha(D.c.text, 0.13); ctx.stroke();
      D.haloText(ctx, String(Number(t.toFixed(1))), left - 6, p, D.c.muted, 'right', 'middle');
    }
    for (let i = 0; i <= 4; i++) {
      const pos = m.length * i / 4;
      D.haloText(ctx, String(Number((pos * 100).toFixed(2))), px(pos), bottom + 15, D.c.muted, 'center');
    }
    if (mode === 'series') {
      const pxJ = px(m.parts[0].length);
      ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(pxJ, top); ctx.lineTo(pxJ, bottom);
      ctx.strokeStyle = D.c.muted; ctx.stroke(); ctx.setLineDash([]);
      D.pill(ctx, T('接面', 'Junction'), pxJ, y + 23, D.c.muted, 'center');
    }
    profiles.forEach((profile, i) => {
      const color = i === 0 ? D.c.pos : D.c.neg;
      const xs = profile.x;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      xs.forEach((v, j) => { if (j) ctx.lineTo(px(v), py(m.temperature(i, v))); else ctx.moveTo(px(v), py(m.temperature(i, v))); });
      ctx.setLineDash([5, 4]); ctx.strokeStyle = i === 0 ? D.c.probe : D.c.neg;
      ctx.lineWidth = 1.4; ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath();
      xs.forEach((v, j) => { if (j) ctx.lineTo(px(v), py(profile.temperatures[j])); else ctx.moveTo(px(v), py(profile.temperatures[j])); });
      ctx.strokeStyle = color; ctx.lineWidth = i === 0 ? 2.4 : 1.65; ctx.stroke();
    });
  }

  function drawConduction(w, h) {
    const pad = 8;
    const sceneH = h * (mode === 'parallel' ? 0.53 : 0.45);
    const m = run.model;
    const blockWidth = Math.max(26, Math.min(43, w * 0.069));
    const left = Math.max(48, w * 0.098), right = w - left;
    frame(pad, pad, w - 2 * pad, sceneH - pad * 1.5);
    const labelY = 31;
    D.pill(ctx, format(m.left, 1) + ' °C', left, labelY, D.c.text, 'center');
    D.pill(ctx, format(m.right, 1) + ' °C', right, labelY, D.c.text, 'center');
    D.pill(ctx, T('隔熱套', 'Insulation'), w / 2, labelY, D.c.muted, 'center');
    const parallel = mode === 'parallel';
    const rodHeight = Math.min(46, Math.max(20, sceneH * 0.24));
    const totalArea = m.parts[0].area + m.parts[1].area;
    profiles.forEach((p, i) => drawRod(left - 2, right + 2,
      parallel ? sceneH * (0.50 + 0.29 * i) : sceneH * 0.59,
      parallel ? rodHeight * Math.sqrt(m.parts[i].area / totalArea) : rodHeight, p, i));
    const top = Math.max(36, sceneH * (parallel ? 0.34 : 0.38));
    const bottom = sceneH * (parallel ? 0.90 : 0.79);
    reservoir(left - blockWidth, top, blockWidth, bottom - top, m.left, true);
    reservoir(right, top, blockWidth, bottom - top, m.right, false);
    if (!parallel) {
      const base = sceneH - 9;
      D.pill(ctx, 'A · ' + names(selected().a), w * 0.30, base, D.c.pos, 'center');
      D.pill(ctx, 'B · ' + names(selected().b), w * 0.70, base, D.c.neg, 'center');
    }
    plot(pad, sceneH + 2, w - 2 * pad, h - sceneH - 10);
  }

  function drawStrip(w, h) {
    const length = strip.arcLength;
    const points = Array.from({ length: 81 }, (_, i) => C.arcPoint(length * i / 80, strip.curvature));
    const highest = Math.min(0, strip.tip.y), lowest = Math.max(0, strip.tip.y);
    const furthest = Math.max(...points.map(p => p.x), length * 0.55);
    const scale = Math.min((w - 96) / furthest, (h - 91) / Math.max(lowest - highest, length * 0.16));
    const x = 45, y = h * 0.52 - scale * (lowest + highest) / 2;
    D.grid(ctx, 14, 32, w - 14, h - 35, 40, 10, x, y);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(w - 22, y);
    ctx.strokeStyle = D.c.muted; ctx.lineWidth = 1.3; ctx.setLineDash([6, 5]); ctx.stroke(); ctx.setLineDash([]);
    const thickness = Math.min(16, h * 0.065);
    [[-1, D.c.pos], [1, D.c.neg]].forEach(([sign, color]) => {
      D.tube(ctx, path => points.forEach((p, i) => {
        const theta = strip.curvature * length * i / 80;
        const xx = x + p.x * scale - sign * Math.sin(theta) * thickness / 4;
        const yy = y + p.y * scale + sign * Math.cos(theta) * thickness / 4;
        if (i) path.lineTo(xx, yy); else path.moveTo(xx, yy);
      }), color, thickness / 2);
    });
    D.block(ctx, x - 21, y - 16, 23, 32, D.c.muted);
    const tipX = x + strip.tip.x * scale, tipY = y + strip.tip.y * scale;
    D.arrow(ctx, tipX, y, tipX, tipY, D.c.probe, 2.2);
    D.pill(ctx, 'A · ' + names(selected().a), 14, 27, D.c.pos);
    D.pill(ctx, 'B · ' + names(selected().b), w - 14, 27, D.c.neg, 'right');
    D.pill(ctx, T('端點位移 ', 'Tip ') + format(strip.tip.y * 1000, 2) + ' mm', w / 2, h - 6, D.c.probe, 'center');
  }

  function draw2D() {
    const { width: w, height: h } = cv.getBoundingClientRect();
    if (!w || !h) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const dw = Math.round(w * dpr), dh = Math.round(h * dpr);
    if (cv.width !== dw || cv.height !== dh) { cv.width = dw; cv.height = dh; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(ctx, w, h);
    if (mode === 'bimetal') drawStrip(w, h);
    else drawConduction(w, h);
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

  function scene3D(THREE, group, cameraKey) {
    const vec = (...v) => new THREE.Vector3(...v);
    const color = value => new THREE.Color(value);
    function box(x, y, z, width, height, depth, tint) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth),
        new THREE.MeshStandardMaterial({ color: color(tint), roughness: 0.38 }));
      mesh.position.set(x, y, z);
      mesh.castShadow = true; mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    }
    if (mode === 'bimetal') {
      const n = 80;
      for (const [sign, tone] of [[1, D.c.pos], [-1, D.c.neg]]) {
        const position = [];
        const scale = 7 / strip.arcLength;
        const offset = -3.5;
        for (let i = 0; i <= n; i++) {
          const s = strip.arcLength * i / n;
          const p = C.arcPoint(s, strip.curvature);
          const u = strip.curvature * s;
          const half = 0.065;
          const xx = offset + scale * p.x + sign * half * Math.sin(u);
          const yy = -scale * p.y + sign * half * Math.cos(u);
          position.push(xx, yy, -0.48, xx, yy, 0.48);
        }
        const index = [];
        for (let i = 0; i < n; i++) index.push(2 * i, 2 * i + 2, 2 * i + 1, 2 * i + 1, 2 * i + 2, 2 * i + 3);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
        geometry.setIndex(index);
        geometry.computeVertexNormals();
        const plate = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: color(tone), side: THREE.DoubleSide, metalness: 0.16, roughness: 0.34 }));
        plate.castShadow = true; group.add(plate);
      }
      // 依曲線範圍置中；厚度與夾具為示意。
      const bounds = new THREE.Box3().setFromObject(group);
      const shift = -bounds.getCenter(vec()).y;
      group.children.forEach(obj => { obj.position.y += shift; });
      box(-3.55, shift, 0, 0.42, 0.47, 1.11, D.c.muted);
      label3D(THREE, group, 'A · ' + names(selected().a), D.c.pos, -3.6, shift + 0.55, 0);
      label3D(THREE, group, 'B · ' + names(selected().b), D.c.neg, -3.6, shift - 0.55, 0);
      return;
    }

    const m = run.model;
    const bodyLength = 7.4;
    const radius = 0.56;
    for (const [sign, temperature] of [[-1, m.left], [1, m.right]]) {
      const x = sign * (bodyLength / 2 + 0.29);
      const tint = temperatureColor(temperature);
      box(x, 0, 0, 0.57, 1.93, 2.18, D.c.muted);
      box(x - sign * 0.26, 0, 0, 0.10, 1.83, 2.08, D.shade(tint, 0.27));
      for (let y = -0.84; y <= 0.86; y += 0.24) box(x, y, 0, 0.68, 0.10, 2.27, tint);
    }
    const cut = cameraKey === 'side';
    label3D(THREE, group, format(m.left, 1) + ' °C', D.c.text, -3.8, 1.45, 0);
    label3D(THREE, group, format(m.right, 1) + ' °C', D.c.text, 3.8, 1.45, 0);
    label3D(THREE, group, T('隔熱套', 'Insulation'), D.c.muted, 0, 1.65, 0);
    profiles.forEach((profile, index) => {
      const r = profiles.length === 1 ? radius : radius * Math.sqrt(m.parts[index].area / (m.parts[0].area + m.parts[1].area));
      const y = profiles.length === 1 ? 0 : (index === 0 ? -0.36 : 0.36);
      const z = profiles.length === 1 ? 0 : (index === 0 ? 0.53 : -0.53);
      const sleeve = new THREE.CylinderGeometry(r + 0.13, r + 0.13, bodyLength, 32, 1, true, Math.PI * 0.33, Math.PI * 1.34);
      sleeve.rotateZ(-Math.PI / 2);
      const cover = new THREE.Mesh(sleeve, new THREE.MeshStandardMaterial({
        color: color(D.c.muted), side: THREE.DoubleSide, roughness: 0.78
      }));
      cover.position.set(0, y, z);
      group.add(cover);
      const rimMaterial = new THREE.MeshStandardMaterial({ color: color(D.shade(D.c.muted, 0.18)), roughness: 0.65 });
      for (const f of [-0.49, -0.25, 0, 0.25, 0.49]) {
        const rim = new THREE.Mesh(new THREE.TorusGeometry(r + 0.13, 0.022, 8, 24, Math.PI * 1.34), rimMaterial);
        rim.rotateY(Math.PI / 2);
        rim.rotateZ(Math.PI * 0.67);
        rim.position.set(bodyLength * f, y, z);
        group.add(rim);
      }
      const rings = profile.x.length;
      const sides = 32;
      const positions = [], colors = [], indices = [];
      profile.x.forEach((pos, i) => {
        const x = bodyLength * (pos / m.length - 0.5);
        const tint = color(temperatureColor(profile.temperatures[i]));
        for (let j = 0; j <= sides; j++) {
          const u = cut ? -Math.PI + j * Math.PI / sides : j * 2 * Math.PI / sides;
          positions.push(x, y + r * Math.cos(u), z + r * Math.sin(u));
          colors.push(tint.r, tint.g, tint.b);
          if (i && j) {
            const a = (i - 1) * (sides + 1) + j - 1;
            const b = a + sides + 1;
            indices.push(a, a + 1, b, a + 1, b + 1, b);
          }
        }
      });
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geometry.setIndex(indices); geometry.computeVertexNormals();
      const rod = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
        side: THREE.DoubleSide, vertexColors: true, roughness: 0.30, metalness: 0.12
      }));
      rod.castShadow = true; rod.receiveShadow = true;
      group.add(rod);
      if (mode === 'parallel') {
        const slot = index === 0 ? 'a' : 'b';
        label3D(THREE, group, slot.toUpperCase() + ' · ' + names(selected()[slot]), index === 0 ? D.c.pos : D.c.neg,
          -2.7, y - 0.38, z + r * 1.19);
      }
      if (cut) {
        const face = new THREE.PlaneGeometry(bodyLength, 2 * r, rings - 1, 1);
        const vertices = face.attributes.position;
        const faceColors = [];
        for (let j = 0; j < 2 * rings; j++) {
          const i = j % rings;
          vertices.setX(j, bodyLength * (profile.x[i] / m.length - 0.5));
          vertices.setY(j, y + vertices.getY(j));
          vertices.setZ(j, z);
          const tint = color(temperatureColor(profile.temperatures[i]));
          faceColors.push(tint.r, tint.g, tint.b);
        }
        face.setAttribute('color', new THREE.Float32BufferAttribute(faceColors, 3));
        group.add(new THREE.Mesh(face, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide })));
      }
      if (mode === 'series') {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.016, 8, 32),
          new THREE.MeshStandardMaterial({ color: color(D.c.surface) }));
        ring.rotateY(Math.PI / 2);
        ring.position.x = bodyLength * (m.parts[0].length / m.length - 0.5);
        group.add(ring);
        label3D(THREE, group, T('接面', 'Junction'), D.c.muted, ring.position.x, -0.68, 0.65);
      }
      for (const f of flowPositions) {
        const flux = flowAt(index, f);
        const len = 1.15 * Math.abs(flux) / arrowScale;
        if (len > 0.025) {
          const sign = Math.sign(flux);
          const arrow = new THREE.ArrowHelper(vec(sign, 0, 0), vec(bodyLength * (f - 0.5) - sign * len / 2, y + r + 0.24, z + r * 0.24),
            len, color(D.c.field), Math.min(len * 0.42, 0.2), Math.min(len * 0.27, 0.12));
          // ArrowHelper 的幾何由 three.js 共用，為本檢視建立獨立副本供回收。
          arrow.children.forEach(obj => { obj.geometry = obj.geometry.clone(); });
          group.add(arrow);
        }
      }
    });
  }

  function render() {
    if (mode !== 'bimetal') {
      profiles = run.paths.map((_, i) => C.sample(run, i));
      arrowScale = referenceRate();
    }
    const active = view && view.active;
    $('stageHint').textContent = mode === 'bimetal'
      ? T('紅色是上層 A，藍色是下層 B。厚度放大。', 'Red is upper layer A, and blue is lower layer B. The thickness is magnified.')
      : T('兩端為定溫熱庫，隔熱套使熱只沿棒長傳遞。棒色越暖，溫度越高。箭長與當地熱流率成正比，本刻度最長箭頭代表 ',
        'Fixed-temperature reservoirs contact insulated rods. Warmer colors show higher temperatures. Arrow length scales with local heat rate. Full length represents ') +
        format(arrowScale, 2) + ' W.';
    const legend = $('legend');
    const legendKey = mode + ':' + D.ver;
    const items = mode === 'bimetal' ? [] : [
      [D.c.pos, mode === 'series' ? T('當下溫度', 'Current temperature') : T('A 支路', 'Branch A')],
      ...(mode === 'parallel' ? [[D.c.neg, T('B 支路', 'Branch B')]] : []),
      [D.c.probe, T('虛線為穩態溫度', 'Dashed: steady temperature')]
    ];
    if (lastLegendKey !== legendKey) legend.replaceChildren(...items.map(([tint, caption]) => {
      const span = document.createElement('span');
      const line = document.createElement('i');
      line.style.backgroundColor = tint;
      span.append(line, ' ' + caption);
      return span;
    }));
    lastLegendKey = legendKey;
    $('status').textContent = mode === 'bimetal' ? '' : format(run.time, 1) + ' s · ' +
      (profiles.every(p => p.maxGap <= 0.5) ? T('已接近穩態', 'Near steady state') : T('暫態', 'Transient'));
    $('status').hidden = mode === 'bimetal';
    $('speedNote').textContent = T('播放速度（畫面 1 秒 = ', 'Playback speed (1 real second = ') + speed +
      T(' 模擬秒）', ' simulated seconds)');
    $('play').textContent = playing ? T('暫停導熱', 'Pause conduction') : run && run.time >= run.duration
      ? T('重新導熱', 'Restart conduction') : run && run.time > 0
        ? T('繼續導熱', 'Resume conduction') : T('開始導熱', 'Start conduction');
    if (!playing || run.time - lastReadingTime >= speed * 0.12) {
      readings();
      lastReadingTime = run ? run.time : -Infinity;
    }
    if (active) view.draw();
    else draw2D();
  }

  function stop() {
    playing = false;
    cancelAnimationFrame(raf);
    raf = 0;
    last = 0;
    lastRender = 0;
    lastReadingTime = -Infinity;
  }

  function tick(now) {
    if (!playing) return;
    const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 0;
    last = now;
    C.advance(run, run.time + dt * speed);
    if (run.time >= run.duration) { stop(); render(); return; }
    if (now - lastRender >= (view.active ? 100 : 32)) { render(); lastRender = now; }
    raf = requestAnimationFrame(tick);
  }

  function setMode(next) {
    if (next === mode) return;
    mode = next;
    resetModel();
  }

  for (const [id, slot] of [['materialA', 'a'], ['materialB', 'b']]) {
    for (const key of Object.keys(C.materials)) {
      const button = document.createElement('button');
      button.type = 'button'; button.id = id + '-' + key;
      button.dataset.material = key;
      button.textContent = names(key);
      button.addEventListener('click', () => { selected()[slot] = key; resetModel(); });
      $(id).append(button);
    }
  }
  Object.keys(controls).forEach(id => $(id).addEventListener('input', resetModel));
  modeButtons.forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
  speedButtons.forEach(button => button.addEventListener('click', () => { speed = Number(button.dataset.speed); updateSettings(); render(); }));
  $('play').addEventListener('click', () => {
    if (playing) stop();
    else {
      if (run.time >= run.duration) resetModel();
      playing = true; raf = requestAnimationFrame(tick);
    }
    render();
  });
  $('reset').addEventListener('click', resetModel);
  $('steady').addEventListener('click', () => { stop(); C.advance(run, run.duration); render(); });
  $('record').addEventListener('click', () => {
    const data = mode === 'bimetal'
      ? { mode, ...selected(), length: val('length') / 100,
        thickness: val('thickness') / 1000, deltaT: val('deltaT'), ...strip }
      : C.measureConduction(run);
    $('recordNote').textContent = T('已記錄目前讀數。', 'Current readings recorded.');
    $('recordNote').hidden = false;
    if (window.LabMission) window.LabMission.emit('recorded', data);
  });
  document.addEventListener('visibilitychange', () => { last = 0; });
  window.addEventListener('lab:themechange', render);
  (new ResizeObserver(draw2D)).observe(cv);
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: () => ({ materials: { ...selected() } }),
    set: data => {
      if (!data || !data.materials) return;
      for (const slot of ['a', 'b']) {
        const key = data.materials[slot];
        if (Object.hasOwn(C.materials, key) && !(mode === 'bimetal' && key === 'glass')) selected()[slot] = key;
      }
      resetModel();
    }
  });
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
      const light = new THREE.DirectionalLight(D.shade(D.c.surface, D.dark ? 0.83 : 0), 1.9);
      light.position.set(-3, 7, 5);
      light.castShadow = true;
      light.shadow.mapSize.set(512, 512);
      Object.assign(light.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6 });
      scene.add(light);
      const group = new THREE.Group();
      scene.add(group);
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ opacity: 0.21 }));
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

  view = installView(
    scene3D,
    T('導熱棒和熱流箭頭，或雙金屬片。拖曳旋轉，兩指縮放。', 'Conducting rods and heat-flow arrows, or the bimetallic strip. Drag to orbit or pinch to zoom.'),
    key => ({ face: [0, 1.9, 13.75], side: [0.6, 1.9, 13.7], default: [2.6, 3.3, 12.7] })[key],
    render
  );
  resetModel();
})();
