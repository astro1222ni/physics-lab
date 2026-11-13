/* remote-sensing-core.js — 遙測：光譜反射、波段、假色合成與植生指標的計算核心（純函式，瀏覽器與 Node 共用）
 *
 * 每一種地表反射太陽光的比例（反射率）隨波長不同，這條「光譜曲線」就是它的指紋：
 *   健康植物：葉綠素吸收藍光與紅光（綠光多反射一點），700 nm 附近急升（紅邊），近紅外線反射很強（葉肉細胞），
 *            1450、1940 nm 被葉子裡的水吸收。
 *   水：可見光就很暗，近紅外線幾乎全被吸收；混濁的水在綠、紅光比較亮。
 *   土壤：隨波長慢慢變亮；溼土比乾土暗。都市（水泥、柏油、屋頂）：平平的、中等亮度。
 * 這裡的曲線是依 USGS 光譜庫典型樣本的形狀簡化成的平滑函數（教學用），不是逐點的實測值。
 *
 * 衛星把光分成幾個波段，每個波段量到的是那段波長的平均反射率。波段範圍用 Landsat 8／9 OLI 的定義。
 * 常用指數：NDVI = (NIR − Red)/(NIR + Red)、NDWI = (Green − NIR)/(Green + NIR)、NDBI = (SWIR1 − NIR)/(SWIR1 + NIR)。
 *
 * 虛擬場景：96 × 72 像元、每像元 30 m（約 2.9 × 2.2 km）的河谷：河、池塘、森林、城鎮、公園、稻田、休耕地與沙洲。
 * 稻田一年兩期（大約二月中插秧、六月中收割；八月初插秧、十一月中收割），插秧前後田裡有水。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RemoteCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const NX = 96, NY = 72, PIX = 30;
  const BANDS = [
    { id: 'b1', n: 1, lo: 433, hi: 453, zh: '海岸氣膠', en: 'Coastal' },
    { id: 'b2', n: 2, lo: 450, hi: 515, zh: '藍', en: 'Blue' },
    { id: 'b3', n: 3, lo: 525, hi: 600, zh: '綠', en: 'Green' },
    { id: 'b4', n: 4, lo: 630, hi: 680, zh: '紅', en: 'Red' },
    { id: 'b5', n: 5, lo: 845, hi: 885, zh: '近紅外', en: 'NIR' },
    { id: 'b6', n: 6, lo: 1560, hi: 1660, zh: '短波紅外 1', en: 'SWIR 1' },
    { id: 'b7', n: 7, lo: 2100, hi: 2300, zh: '短波紅外 2', en: 'SWIR 2' }
  ];
  const B = { coastal: 0, blue: 1, green: 2, red: 3, nir: 4, swir1: 5, swir2: 6 };

  const g = (x, m, s) => Math.exp(-0.5 * ((x - m) / s) * ((x - m) / s));
  const sg = (x, m, w) => 1 / (1 + Math.exp(-(x - m) / w));
  const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
  /** 水的吸收帶（相對深度）：970、1200、1450、1940 nm，以及 2000 nm 以後 */
  const waterBands = l => 0.035 * g(l, 975, 25) + 0.08 * g(l, 1200, 40) + 1.0 * g(l, 1450, 55) + 1.6 * g(l, 1940, 65) + 0.5 * sg(l, 2350, 60);

  // ---------------- 光譜曲線 ----------------
  /** 植物葉冠：vigor = 葉綠素（0 枯黃 – 1 健康），water = 葉子含水（0–1） */
  function vegetation(l, vigor, water) {
    const v = clamp01(vigor), w = clamp01(water == null ? v : water);
    // 可見光：健康時綠光有一個小峰；枯黃時紅光、綠光一起變亮
    const vis = 0.035 + 0.075 * v * g(l, 552, 32) + (1 - v) * (0.05 + 0.16 * sg(l, 545, 22));
    const nir = 0.26 + 0.24 * v;                          // 近紅外高原
    const edge = sg(l, 695 + 22 * v, 11 + 3 * (1 - v));    // 紅邊
    let r = vis + (nir - vis) * edge;
    // 近紅外之後慢慢下降，再被水吸收
    r *= (1 - 0.66 * sg(l, 1350, 90)) * (1 - (0.25 + 0.3 * w) * sg(l, 2000, 80));   // 葉子裡的水讓短波紅外變暗
    r *= Math.exp(-(0.45 + 1.4 * w) * waterBands(l));
    return r;
  }
  /** 土壤：moist = 溼度（0 乾 – 1 溼），bright = 亮度（0 暗土 – 1 沙） */
  function soil(l, moist, bright) {
    const m = clamp01(moist), b = clamp01(bright);
    let r = (0.07 + 0.13 * b) + (0.16 + 0.12 * b) * sg(l, 760, 210) + 0.05 * sg(l, 1600, 300);
    r *= 1 - 0.5 * m;
    r *= Math.exp(-(0.08 + 0.9 * m) * waterBands(l));
    return r;
  }
  /** 水：turb = 混濁度（0 清 – 1 很混濁） */
  function water(l, turb) {
    const t = clamp01(turb);
    let r = 0.016 + 0.05 * g(l, 470, 70) * (1 - sg(l, 620, 35));
    r += t * (0.07 * g(l, 610, 85) + 0.025 * g(l, 810, 45));
    r *= Math.exp(-2.5 * sg(l, 760, 25) * (1 - 0.3 * t));
    return r + 0.006 * (1 - sg(l, 1300, 120));   // 水面的鏡面反射與水中懸浮物，近紅外不會完全是 0
  }
  /** 都市：水泥、柏油、屋頂混在一起 */
  function urban(l) {
    return (0.15 + 0.08 * sg(l, 560, 120) + 0.09 * sg(l, 1300, 250)) * Math.exp(-0.15 * waterBands(l));
  }
  /** 一種地表在波段 b 的平均反射率（在波段內每 5 nm 取樣平均） */
  function bandMean(f, b) {
    const bd = BANDS[b];
    let s = 0, n = 0;
    for (let l = bd.lo; l <= bd.hi + 1e-9; l += 5) { s += f(l); n++; }
    return s / n;
  }
  const spectra = {
    vegetation: (vig, wat) => l => vegetation(l, vig, wat),
    soil: (m, b) => l => soil(l, m, b),
    water: t => l => water(l, t),
    urban: () => urban
  };

  /** 波段平均的快取：參數取到 0.01（反射率差不到 0.001，畫面與任務都看不出來） */
  const ZERO = [0, 0, 0, 0, 0, 0, 0], CACHE = new Map();
  function means(kind, a, b) {
    const ra = Math.round(clamp01(a) * 100), rb = Math.round(clamp01(b) * 100), key = kind + ra + '_' + rb;
    let m = CACHE.get(key);
    if (!m) {
      const f = kind === 'v' ? spectra.vegetation(ra / 100, rb / 100) : kind === 's' ? spectra.soil(ra / 100, rb / 100) : kind === 'w' ? spectra.water(ra / 100) : urban;
      m = BANDS.map((bd, i) => bandMean(f, i));
      if (CACHE.size > 20000) CACHE.clear();
      CACHE.set(key, m);
    }
    return m;
  }

  // ---------------- 指數 ----------------
  const nd = (a, b) => (a + b > 1e-9 ? (a - b) / (a + b) : 0);
  function indices(r) { return { ndvi: nd(r[B.nir], r[B.red]), ndwi: nd(r[B.green], r[B.nir]), ndbi: nd(r[B.swir1], r[B.nir]) }; }

  // ---------------- 稻作物候 ----------------
  const CROPS = [{ plant: 45, harvest: 165 }, { plant: 215, harvest: 320 }];
  /** 第 day 天、插秧日再偏移 shift 天的稻田狀態：{ lai, vigor, flood（田面積水比例）, stage } */
  function rice(day, shift, drought) {
    const dr = clamp01(drought || 0);
    for (const c of CROPS) {
      const p = c.plant + (shift || 0), h = c.harvest + (shift || 0), d = day - p;
      if (d >= -14 && d < 0) return { lai: 0, vigor: 0, flood: 0.9, stage: 'flood' };
      if (d >= 0 && day < h) {
        const lai = 5.2 * sg(d, 42, 9) * (1 - 0.45 * dr);
        const ripen = sg(d, h - p - 22, 6);
        const vigor = clamp01(1 - 0.75 * ripen - 0.55 * dr);
        const flood = d < 35 ? 0.8 * (1 - d / 35) : 0;
        return { lai, vigor, flood, stage: ripen > 0.5 ? 'ripe' : d < 25 ? 'young' : 'grow' };
      }
    }
    return { lai: 0, vigor: 0, flood: 0, stage: 'fallow' };
  }
  const coverOf = lai => 1 - Math.exp(-0.55 * lai);

  // ---------------- 場景 ----------------
  function hash(i, j, k) {
    let h = (i * 374761393 + j * 668265263 + (k || 0) * 2147483647) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  const riverY = x => 40 + 9 * Math.sin(x / 13 + 0.6) + 0.05 * x;
  const CLASS = ['water', 'forest', 'town', 'park', 'paddy', 'fallow', 'sand', 'pond'];
  /** 每個像元屬於哪一類，以及固定的屬性（稻田的插秧偏移、森林的密度） */
  const SCENE = (function () {
    const cls = new Uint8Array(NX * NY), shift = new Int8Array(NX * NY), dens = new Float32Array(NX * NY);
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const k = j * NX + i, ry = riverY(i), dy = j - ry;
      let c;
      if (Math.abs(dy) < 2.1 + 0.4 * Math.sin(i / 5)) c = 0;                         // 河
      else if (Math.abs(dy) < 4.3 && Math.sin(i / 9 + 1.3) > 0.55 && dy > 0) c = 6;      // 沙洲（凸岸）
      else if (Math.hypot(i - 14, j - 15) < 5.5) c = 7;                                // 池塘
      else if (i > 70 + 6 * Math.sin(j / 8) || (Math.hypot(i - 24, j - 64) < 13 && j > 56)) c = 1;  // 森林（東邊山丘與南邊小山）
      else if (i >= 38 && i <= 62 && j >= 6 && j <= 24) c = (i >= 47 && i <= 52 && j >= 12 && j <= 16) ? 3 : 2;  // 城鎮與公園
      else {
        // 田：6 × 5 像元一塊，田埂 1 像元
        const pi = Math.floor(i / 6), pj = Math.floor(j / 5);
        const r = hash(pi, pj, 7);
        c = r < 0.14 ? 5 : 4;
        shift[k] = Math.round((hash(pi, pj, 3) - 0.5) * 16);
      }
      cls[k] = c;
      dens[k] = 0.85 + 0.15 * hash(i, j, 11);
    }
    return { cls, shift, dens };
  })();
  function classAt(k) { return CLASS[SCENE.cls[k]]; }

  /**
   * 某一個像元的地表組成與每個波段的反射率。
   * o = { day（1–365）, drought（0–1）, turb（河水混濁 0–1）, haze（大氣霧霾 0–0.15） }
   * 回傳 { cls, mix: { veg, soil, water, urban }, vigor, lai, bands[7]（加上大氣與雜訊後衛星看到的）, surface[7]（地表本身） }
   */
  function pixel(k, o) {
    const i = k % NX, j = Math.floor(k / NX), c = SCENE.cls[k], dr = clamp01(o.drought || 0);
    const soilM = 0.55 * (1 - dr) + 0.05;
    let veg = 0, so = 0, wa = 0, ur = 0, vig = 0, lw = 0, lai = 0, turb = clamp01(o.turb || 0), sb = 0.35;
    switch (CLASS[c]) {
      case 'water': wa = 1; break;
      case 'pond': wa = 1; turb = 0.1; break;
      case 'forest': { lai = 5.5 * SCENE.dens[k] * (1 - 0.25 * dr); veg = coverOf(lai); so = 1 - veg; vig = 1 - 0.35 * dr; lw = 1 - 0.5 * dr; break; }
      case 'town': { const h = hash(i, j, 7); ur = 0.55 + 0.4 * h; veg = 0.8 * (1 - ur); so = 1 - ur - veg; // 屋頂、道路與行道樹混在一起
        vig = 0.85 - 0.4 * dr; lw = vig; lai = 1; break; }
      case 'park': lai = 3.5; veg = coverOf(lai); so = 1 - veg; vig = 0.95 - 0.55 * dr; lw = vig; break;
      case 'sand': so = 1; sb = 0.95; break;
      case 'fallow': so = 0.9; veg = 0.1; vig = 0.35; lw = 0.3; lai = 0.3; sb = Math.round((0.3 + 0.2 * hash(i, j, 8)) * 100) / 100; break;
      case 'paddy': {
        const s = rice(o.day, SCENE.shift[k], dr);
        lai = s.lai; vig = s.vigor; lw = Math.max(0.2, s.vigor);
        veg = coverOf(s.lai) * SCENE.dens[k];
        wa = (1 - veg) * s.flood; so = 1 - veg - wa;
        if (s.stage === 'fallow') { veg = 0.15; vig = 0.3; lw = 0.25; so = 0.85; wa = 0; }
        break;
      }
    }
    const mV = veg > 0 ? means('v', vig, lw) : ZERO, mS = so > 0 ? means('s', CLASS[c] === 'sand' ? 0.05 : soilM, sb) : ZERO;
    const mW = wa > 0 ? means('w', turb, 0) : ZERO, mU = ur > 0 ? means('u', 0, 0) : ZERO;
    const surface = BANDS.map((bd, b) => veg * mV[b] + so * mS[b] + wa * mW[b] + ur * mU[b]);
    const haze = o.haze || 0;
    const bands = surface.map((r, b) => {
      const lc = (BANDS[b].lo + BANDS[b].hi) / 2;
      return Math.max(0, r + haze * Math.pow(480 / lc, 4) + 0.004 * (hash(i, j, 100 + b) - 0.5));
    });
    const stage = CLASS[c] === 'paddy' ? rice(o.day, SCENE.shift[k], dr).stage : null;
    return { cls: CLASS[c], mix: { veg, soil: so, water: wa, urban: ur }, vigor: vig, lai, stage, bands, surface,
      param: { vig: Math.round(clamp01(vig) * 100) / 100, lw: Math.round(clamp01(lw) * 100) / 100, soilM: Math.round(clamp01(CLASS[c] === 'sand' ? 0.05 : soilM) * 100) / 100, sb: Math.round(sb * 100) / 100, turb: Math.round(turb * 100) / 100 } };
  }

  /** 整個場景：每一個波段一個 Float32Array，另外算 NDVI、NDWI、NDBI 與各類的平均 */
  function scene(o) {
    const N = NX * NY, bands = BANDS.map(() => new Float32Array(N));
    const ndvi = new Float32Array(N), ndwi = new Float32Array(N), ndbi = new Float32Array(N);
    const sum = {};
    CLASS.forEach(c => { sum[c] = { n: 0, ndvi: 0, ndwi: 0 }; });
    for (let k = 0; k < N; k++) {
      const p = pixel(k, o);
      for (let b = 0; b < 7; b++) bands[b][k] = p.bands[b];
      const x = indices(p.bands);
      ndvi[k] = x.ndvi; ndwi[k] = x.ndwi; ndbi[k] = x.ndbi;
      sum[p.cls].n++; sum[p.cls].ndvi += x.ndvi; sum[p.cls].ndwi += x.ndwi;
    }
    const mean = {}, meanW = {};
    CLASS.forEach(c => { mean[c] = sum[c].n ? sum[c].ndvi / sum[c].n : null; meanW[c] = sum[c].n ? sum[c].ndwi / sum[c].n : null; });
    return { bands, ndvi, ndwi, ndbi, mean, meanW };
  }

  /** 影像拉伸：下限取最暗 1% 的一半（不把暗處全部壓成黑，霧霾讓影像變亮變灰的樣子才看得出來）；上限取第 99 百分位 */
  function stretch(arr) {
    const s = Array.from(arr).sort((a, b) => a - b), n = s.length;
    const lo = 0.5 * Math.max(0, s[Math.floor(n * 0.01)]), hi = s[Math.min(n - 1, Math.floor(n * 0.99))];
    return { lo, hi: hi > lo + 1e-6 ? hi : lo + 1e-6 };
  }
  const COMPOSITES = {
    natural: [4, 3, 2], cir: [5, 4, 3], agri: [6, 5, 2], swir: [7, 6, 4], water: [5, 6, 4]
  };

  return {
    NX, NY, PIX, BANDS, B, CLASS, CROPS, COMPOSITES, SCENE,
    vegetation, soil, water, urban, bandMean, means, spectra, indices, nd, rice, coverOf, riverY, classAt, pixel, scene, stretch, hash
  };
});
