/*
 * reverb-room-core.js — 「迴響與音樂廳：賽賓公式」的物理核心（不碰 DOM，瀏覽器與 Node 都能用）
 *
 * 內容：
 *   材料表：500 Hz 的吸音係數（pyroomacoustics 材料資料庫收錄的量測值；「開窗」= 1 是賽賓自己定義的吸音單位）
 *   賽賓公式 T60 = 0.161 V / A，A = Σ S_i α_i + N × 每人吸音量
 *   艾林公式 T60 = 0.161 V / (−S ln(1 − ᾱ))，ᾱ = A / S（吸音多的房間比較準；ᾱ → 1 時 T60 → 0）
 *   聲能指數衰減：聲音位準 L(t) = −60 t / T60（dB）
 *   鏡像源（長方體房間，1–2 階）：每個反射等於從牆外的「鏡中聲源」直線傳來；路徑長、到達時間、
 *     經過哪幾面牆、反射後的強度（每碰一面牆能量乘上 1 − α，再加上距離平方反比）
 *   臨界距離 r_c = √(A / 16π)：直達聲與迴響聲一樣強的距離（無指向性聲源）
 *
 * 座標：x 沿房間長度 L（前牆 x = 0、後牆 x = L），y 沿寬度 W（左牆 y = 0、右牆 y = W；面向前牆時的左右），z 朝上（地板 0、天花板 H）。
 * 聲源與聽者在平面圖上的位置用比例 u = x/L、v = y/W 表示（換房間大小時跟著縮放）；高度固定：聲源 1.5 m、聽者耳朵 1.2 m。
 * 單位：長度 m、面積 m²、體積 m³、時間 s（讀數另有 ms）。
 * 用法：瀏覽器 window.ReverbCore；Node require('./reverb-room-core.js')。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ReverbCore = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** 聲速（20 °C 的乾燥空氣，343 m/s） */
  const C_SOUND = 343;
  /** 賽賓常數：24 ln 10 / c ≈ 0.161 s/m（公式裡寫 0.161） */
  const K_SABINE = 0.161;
  /** 每位聽眾（坐在木椅上）增加的吸音量，m² 賽賓：由「木椅上的聽眾、每平方公尺 1 人」500 Hz α = 0.56 減去地板本身約 0.05 推得 */
  const PERSON_A = 0.5;
  /** 每平方公尺地板最多坐幾人 */
  const MAX_PER_M2 = 2;
  const SRC_Z = 1.5, LIS_Z = 1.2;

  /**
   * 500 Hz 的吸音係數。資料：pyroomacoustics 材料資料庫（各材料的原始量測表），括號內是資料庫裡的項目。
   * 「開窗」：打開的窗戶，聲音出去就不回來，α = 1；賽賓就是用「一平方英尺的開窗」當吸音量的單位。
   */
  const MATERIALS = {
    concrete: { a: 0.03, zh: '粗糙混凝土', en: 'Rough concrete', src: 'rough_concrete' },
    tile: { a: 0.01, zh: '光滑磁磚', en: 'Smooth tiles', src: 'ceramic_tiles' },
    plaster: { a: 0.06, zh: '石膏板（上漆）', en: 'Plasterboard (painted)', src: 'plasterboard' },
    wood: { a: 0.10, zh: '木板', en: 'Wood panelling', src: 'wood_16mm' },
    glass: { a: 0.04, zh: '玻璃窗', en: 'Glass window', src: 'glass_window' },
    carpet: { a: 0.30, zh: '地毯', en: 'Carpet', src: 'carpet_tufted_9m' },
    curtain: { a: 0.65, zh: '厚窗簾', en: 'Heavy curtains', src: 'curtains_cotton_0.5' },
    panel: { a: 0.92, zh: '吸音板', en: 'Absorbing panels', src: 'rockwool_50mm_80kgm3' },
    open: { a: 1.00, zh: '開窗（全吸收）', en: 'Open window (absorbs all)', src: 'Sabine' }
  };
  const MAT_KEYS = Object.keys(MATERIALS);
  const SURFACES = ['floor', 'ceiling', 'front', 'back', 'left', 'right'];
  const SURF_NAMES = {
    floor: ['地板', 'Floor'], ceiling: ['天花板', 'Ceiling'], front: ['前牆', 'Front wall'],
    back: ['後牆', 'Back wall'], left: ['左牆', 'Left wall'], right: ['右牆', 'Right wall']
  };
  /** 控制項範圍（與 reverb-room.html 的滑桿一致） */
  const RANGES = { L: [2, 80], W: [1.5, 50], H: [2, 35], people: [0, 2000], u: [0.03, 0.97], v: [0.03, 0.97] };

  /** 房間預設（典型尺寸；材料是常見的組合，不是某一間真實房間的量測） */
  const PRESETS = {
    classroom: { zh: '教室', en: 'Classroom', L: 9, W: 8, H: 3.2, people: 0,
      mats: { floor: 'tile', ceiling: 'plaster', front: 'concrete', back: 'wood', left: 'glass', right: 'glass' },
      src: { u: 0.12, v: 0.5 }, lis: { u: 0.7, v: 0.35 } },
    bathroom: { zh: '浴室', en: 'Bathroom', L: 2.5, W: 1.8, H: 2.4, people: 0,
      mats: { floor: 'tile', ceiling: 'plaster', front: 'wood', back: 'tile', left: 'tile', right: 'tile' },
      src: { u: 0.45, v: 0.5 }, lis: { u: 0.6, v: 0.42 } },
    living: { zh: '客廳', en: 'Living room', L: 6, W: 4.5, H: 2.8, people: 3,
      mats: { floor: 'wood', ceiling: 'plaster', front: 'plaster', back: 'glass', left: 'curtain', right: 'plaster' },
      src: { u: 0.2, v: 0.5 }, lis: { u: 0.75, v: 0.55 } },
    hall: { zh: '音樂廳', en: 'Concert hall', L: 45, W: 22, H: 17, people: 1700,
      mats: { floor: 'wood', ceiling: 'plaster', front: 'wood', back: 'wood', left: 'wood', right: 'wood' },
      src: { u: 0.08, v: 0.5 }, lis: { u: 0.55, v: 0.4 } },
    cathedral: { zh: '大教堂', en: 'Cathedral', L: 60, W: 25, H: 22, people: 600,
      mats: { floor: 'wood', ceiling: 'concrete', front: 'concrete', back: 'glass', left: 'wood', right: 'wood' },
      src: { u: 0.1, v: 0.5 }, lis: { u: 0.6, v: 0.45 } },
    studio: { zh: '錄音室', en: 'Recording studio', L: 5, W: 4, H: 3, people: 0,
      mats: { floor: 'wood', ceiling: 'panel', front: 'glass', back: 'panel', left: 'panel', right: 'panel' },
      src: { u: 0.5, v: 0.5 }, lis: { u: 0.25, v: 0.5 } }
  };
  const PRESET_KEYS = Object.keys(PRESETS);
  const DEFAULT_PRESET = 'classroom';

  /** 依預設建立完整設定（複製，不共用物件） */
  function presetConfig(key) {
    const p = PRESETS[key] || PRESETS[DEFAULT_PRESET];
    return { L: p.L, W: p.W, H: p.H, people: p.people, mats: Object.assign({}, p.mats), src: Object.assign({}, p.src), lis: Object.assign({}, p.lis), formula: 'sabine', order: 2 };
  }
  const DEFAULTS = presetConfig(DEFAULT_PRESET);

  // ======================= 幾何 =======================
  function areas(L, W, H) {
    return { floor: L * W, ceiling: L * W, front: W * H, back: W * H, left: L * H, right: L * H };
  }
  function volume(L, W, H) { return L * W * H; }
  function surfaceArea(L, W, H) { return 2 * (L * W + W * H + L * H); }
  function maxPeople(L, W) { return Math.min(RANGES.people[1], Math.floor(MAX_PER_M2 * L * W + 1e-9)); }
  function alphaOf(key) { const m = MATERIALS[key]; return m ? m.a : 0; }

  // ======================= 迴響時間 =======================
  /** 賽賓公式（A ≤ 0 時傳回 Infinity：沒有吸音，聲音永遠不會消失） */
  function sabine(V, A) { return A > 0 ? K_SABINE * V / A : Infinity; }
  /** 艾林公式（ᾱ ≥ 1 時 T60 = 0：每次碰到牆就全部被吸收） */
  function eyring(V, S, abar) {
    if (!(abar > 0)) return Infinity;
    if (abar >= 1) return 0;
    return K_SABINE * V / (-S * Math.log(1 - abar));
  }
  /** 衰減曲線：第 t 秒的位準（dB，相對開始時） */
  function decayDb(t, T60) { return T60 > 0 ? -60 * t / T60 : (t > 0 ? -Infinity : 0); }
  /** 臨界距離：直達聲能量 ∝ 1/(4πr²)，迴響聲能量 ∝ 4/A，兩者相等時 r = √(A/16π) */
  function criticalDistance(A) { return Math.sqrt(Math.max(0, A) / (16 * Math.PI)); }
  /** 吸音量的明細 */
  function absorption(cfg) {
    const ar = areas(cfg.L, cfg.W, cfg.H);
    const rows = SURFACES.map(function (s) {
      const a = alphaOf(cfg.mats[s]);
      return { surf: s, mat: cfg.mats[s], S: ar[s], alpha: a, A: ar[s] * a };
    });
    const nMax = maxPeople(cfg.L, cfg.W);
    const n = Math.max(0, Math.min(nMax, Math.round(cfg.people || 0)));
    const Asurf = rows.reduce(function (s, r) { return s + r.A; }, 0);
    const Apeople = n * PERSON_A;
    return { rows: rows, Asurf: Asurf, Apeople: Apeople, A: Asurf + Apeople, people: n, peopleMax: nMax };
  }

  // ======================= 鏡像源 =======================
  /** 一個方向的鏡像座標：k 是鏡像編號（|k| = 這個方向上反射的次數） */
  function imageCoord(k, s, D) { return k % 2 === 0 ? k * D + s : (k + 1) * D - s; }
  /** 展開座標折回房間內 */
  function fold(x, D) {
    let m = x % (2 * D);
    if (m < 0) m += 2 * D;
    return m > D ? 2 * D - m : m;
  }
  /** 聲源與聽者的實際座標 */
  function positions(cfg) {
    return {
      src: { x: cfg.src.u * cfg.L, y: cfg.src.v * cfg.W, z: Math.min(SRC_Z, cfg.H - 0.3) },
      lis: { x: cfg.lis.u * cfg.L, y: cfg.lis.v * cfg.W, z: Math.min(LIS_Z, cfg.H - 0.3) }
    };
  }
  /**
   * 列出 1 到 maxOrder 階的鏡像源與反射路徑。
   * 每個：{ k: [kx, ky, kz], order, img {x,y,z}, r（路徑長）, delay（s）, walls（依碰到的順序）, pts（聲源 → 反射點… → 聽者）, gain（能量比 Π(1 − α)）, level（dB，相對直達聲；gain = 0 時是 null） }
   */
  function images(cfg, maxOrder) {
    maxOrder = maxOrder == null ? 2 : maxOrder;
    const P = positions(cfg), S = P.src, R = P.lis;
    const D = { x: cfg.L, y: cfg.W, z: cfg.H };
    const r0 = dist(S, R);
    const out = [];
    for (let kx = -maxOrder; kx <= maxOrder; kx++) for (let ky = -maxOrder; ky <= maxOrder; ky++) for (let kz = -maxOrder; kz <= maxOrder; kz++) {
      const ord = Math.abs(kx) + Math.abs(ky) + Math.abs(kz);
      if (ord === 0 || ord > maxOrder) continue;
      const I = { x: imageCoord(kx, S.x, D.x), y: imageCoord(ky, S.y, D.y), z: imageCoord(kz, S.z, D.z) };
      const r = dist(I, R);
      // 展開的直線（由聽者 t = 0 到鏡像源 t = 1）穿過哪些牆面
      const hits = [];
      ['x', 'y', 'z'].forEach(function (ax) {
        const a = R[ax], b = I[ax], len = D[ax];
        if (a === b) return;
        const lo = Math.min(a, b), hi = Math.max(a, b);
        for (let j = Math.ceil(lo / len - 1e-12); j * len <= hi + 1e-12; j++) {
          const p = j * len;
          if (p <= lo + 1e-12 || p >= hi - 1e-12) continue;
          const t = (p - a) / (b - a);
          const even = ((j % 2) + 2) % 2 === 0;
          const wall = ax === 'x' ? (even ? 'front' : 'back') : ax === 'y' ? (even ? 'left' : 'right') : (even ? 'floor' : 'ceiling');
          hits.push({ t: t, wall: wall });
        }
      });
      hits.sort(function (p, q) { return q.t - p.t; }); // 由聲源那一端開始
      const pts = [{ x: S.x, y: S.y, z: S.z }];
      let gain = 1;
      hits.forEach(function (h) {
        const u = { x: R.x + h.t * (I.x - R.x), y: R.y + h.t * (I.y - R.y), z: R.z + h.t * (I.z - R.z) };
        pts.push({ x: fold(u.x, D.x), y: fold(u.y, D.y), z: fold(u.z, D.z), wall: h.wall });
        gain *= 1 - alphaOf(cfg.mats[h.wall]);
      });
      pts.push({ x: R.x, y: R.y, z: R.z });
      const level = gain > 0 ? 10 * Math.log10(gain) + 20 * Math.log10(r0 / r) : null;
      out.push({ k: [kx, ky, kz], order: ord, img: I, r: r, delay: r / C_SOUND, walls: hits.map(function (h) { return h.wall; }), pts: pts, gain: gain, level: level });
    }
    out.sort(function (p, q) { return p.delay - q.delay; });
    return out;
  }
  function dist(a, b) { const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z; return Math.sqrt(dx * dx + dy * dy + dz * dz); }
  /** 路徑長（依序連接 pts 的折線長；應該等於鏡像源到聽者的直線距離） */
  function pathLength(pts) { let s = 0; for (let i = 1; i < pts.length; i++) s += dist(pts[i - 1], pts[i]); return s; }

  // ======================= 整體分析 =======================
  const WALLS4 = ['front', 'back', 'left', 'right'];
  function analyze(cfg) {
    cfg = normalize(cfg);
    const V = volume(cfg.L, cfg.W, cfg.H), S = surfaceArea(cfg.L, cfg.W, cfg.H);
    const ab = absorption(cfg);
    const abar = ab.A / S;
    const ts = sabine(V, ab.A), te = eyring(V, S, abar);
    const P = positions(cfg);
    const r0 = dist(P.src, P.lis);
    const imgs = images(cfg, cfg.order);
    const heard = imgs.filter(function (m) { return m.level != null; });
    const t0 = r0 / C_SOUND;
    const first = heard[0] || null;
    const firstUp = heard.filter(function (m) { return m.walls.indexOf('floor') < 0; })[0] || null; // 不經過地板的第一個反射
    const first1 = imgs.filter(function (m) { return m.order === 1; });
    const lat = WALLS4.map(function (w) { return first1.filter(function (m) { return m.walls[0] === w; })[0]; });
    const latHeard = lat.every(function (m) { return m && m.level != null; });
    const latSpread = latHeard ? (Math.max.apply(null, lat.map(function (m) { return m.delay; })) - Math.min.apply(null, lat.map(function (m) { return m.delay; }))) * 1000 : null;
    let mirror = null, echo = null;
    first1.forEach(function (m) {
      if (m.level == null) return;
      if (WALLS4.indexOf(m.walls[0]) >= 0 && (mirror == null || m.level > mirror)) mirror = m.level;
      if ((m.delay - t0) * 1000 >= 50 && (echo == null || m.level > echo)) echo = m.level;
    });
    const open = SURFACES.filter(function (s) { return cfg.mats[s] === 'open'; }).length;
    return {
      cfg: cfg, L: cfg.L, W: cfg.W, H: cfg.H, V: V, S: S, A: ab.A, Asurf: ab.Asurf, Apeople: ab.Apeople, rows: ab.rows,
      people: ab.people, peopleMax: ab.peopleMax, abar: abar, ts: ts, te: te,
      T: cfg.formula === 'eyring' ? te : ts,
      diff: isFinite(ts) && ts > 0 ? (ts - te) / ts : 0,
      src: P.src, lis: P.lis, r0: r0, t0: t0, images: imgs,
      first: first, firstUp: firstUp,
      itdg: first ? (first.delay - t0) * 1000 : null,
      itdgUp: firstUp ? (firstUp.delay - t0) * 1000 : null,
      latSpread: latSpread, mirror: mirror, echo: echo,
      rc: criticalDistance(ab.A), open: open
    };
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  /** 補齊缺欄位、限制在範圍內（分享連結與測試都會用到） */
  function normalize(c) {
    c = c || {};
    const d = DEFAULTS, R = RANGES;
    const num = function (v, k, def) { v = +v; return isFinite(v) ? clamp(v, R[k][0], R[k][1]) : def; };
    const o = {
      L: num(c.L, 'L', d.L), W: num(c.W, 'W', d.W), H: num(c.H, 'H', d.H),
      mats: {}, formula: c.formula === 'eyring' ? 'eyring' : 'sabine', order: c.order === 1 ? 1 : 2
    };
    SURFACES.forEach(function (s) { o.mats[s] = c.mats && MATERIALS[c.mats[s]] ? c.mats[s] : d.mats[s]; });
    o.people = Math.round(clamp(isFinite(+c.people) ? +c.people : d.people, 0, maxPeople(o.L, o.W)));
    const pos = function (p, def) { p = p || {}; return { u: num(p.u, 'u', def.u), v: num(p.v, 'v', def.v) }; };
    o.src = pos(c.src, d.src); o.lis = pos(c.lis, d.lis);
    return o;
  }
  /** 房間（尺寸與材料）的代號：判斷「同一個房間」用 */
  function roomKey(cfg) { return [cfg.L, cfg.W, cfg.H].map(function (v) { return v.toFixed(2); }).join('x') + '|' + SURFACES.map(function (s) { return cfg.mats[s]; }).join(','); }
  function surfKey(cfg) { return SURFACES.map(function (s) { return cfg.mats[s]; }).join(','); }
  const finiteOr = function (v, d) { return v == null || !isFinite(v) ? d : v; };
  /** 任務事件的資料（js/reverb-room.js 與任務證明都用它，保證一致） */
  function payload(a, extra) {
    const c = a.cfg;
    const al = {};
    SURFACES.forEach(function (s) { al[s] = alphaOf(c.mats[s]); });
    const o = {
      L: c.L, W: c.W, H: c.H, V: a.V, S: a.S, A: a.A, Asurf: a.Asurf, Apeople: a.Apeople, people: a.people, peopleMax: a.peopleMax,
      abar: a.abar, ts: finiteOr(a.ts, 999), te: finiteOr(a.te, 999), T: finiteOr(a.T, 999), diff: a.diff, formula: c.formula,
      mats: Object.assign({}, c.mats), al: al, room: roomKey(c), surf: surfKey(c), open: a.open,
      su: c.src.u, sv: c.src.v, lu: c.lis.u, lv: c.lis.v,
      r0: a.r0, t0: a.t0 * 1000, itdg: finiteOr(a.itdg, -1), itdgUp: finiteOr(a.itdgUp, -1),
      firstWall: a.first ? a.first.walls[0] : '', firstOrder: a.first ? a.first.order : 0,
      latSpread: finiteOr(a.latSpread, -1), mirror: finiteOr(a.mirror, -999), echo: finiteOr(a.echo, -999), rc: a.rc
    };
    return Object.assign(o, extra || {});
  }

  return {
    C_SOUND: C_SOUND, K_SABINE: K_SABINE, PERSON_A: PERSON_A, MAX_PER_M2: MAX_PER_M2, SRC_Z: SRC_Z, LIS_Z: LIS_Z,
    MATERIALS: MATERIALS, MAT_KEYS: MAT_KEYS, SURFACES: SURFACES, SURF_NAMES: SURF_NAMES, RANGES: RANGES,
    PRESETS: PRESETS, PRESET_KEYS: PRESET_KEYS, DEFAULT_PRESET: DEFAULT_PRESET, DEFAULTS: DEFAULTS, presetConfig: presetConfig,
    areas: areas, volume: volume, surfaceArea: surfaceArea, maxPeople: maxPeople, alphaOf: alphaOf,
    sabine: sabine, eyring: eyring, decayDb: decayDb, criticalDistance: criticalDistance, absorption: absorption,
    imageCoord: imageCoord, fold: fold, positions: positions, images: images, dist: dist, pathLength: pathLength,
    analyze: analyze, normalize: normalize, roomKey: roomKey, surfKey: surfKey, payload: payload, clamp: clamp
  };
}));
