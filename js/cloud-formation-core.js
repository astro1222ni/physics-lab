/*
 * cloud-formation-core.js — 「絕熱冷卻與雲的形成」的物理核心（與畫面無關，可單獨用 Node 測試）
 *
 * 模型：一團「氣塊」（1 kg 乾空氣＋水氣＋凝結的液態水）從迎風山腳（海平面）被風推著沿山坡上升、越過山頂、
 * 再沿背風坡下沉回到海平面。氣塊的氣壓永遠等於同高度的環境氣壓（環境是靜力平衡的大氣），氣塊與環境不交換熱量（絕熱）。
 *
 *   1. 未飽和：乾絕熱，位溫 θ = T (p0/p)^κ 守恆，κ = Rd/cpd。氣塊溫度與環境相同時，每升高 1 km 降溫 g/cpd ≈ 9.75 K。
 *   2. 飽和：每一小步先乾絕熱膨脹，再做「飽和調整」——超過飽和的水氣凝結並放出潛熱：
 *        cpd (T' − T*) = Lv (r − r_s(T', p'))
 *      這就是熱力學第一定律 cpd dT − Rd T dp/p + Lv dr = 0（以每公斤乾空氣計），與 AMS Glossary 的飽和絕熱遞減率同一個方程式。
 *   3. 降水效率 e：每一步新凝結的水，有 e 的比例立刻落下成雨（離開氣塊），其餘留在氣塊裡成為雲滴。
 *      e = 1 是「假絕熱」（凝結水全部降下），e = 0 是「可逆濕絕熱」（雲滴全部留在氣塊裡，下沉時再蒸發回來）。
 *   4. 下沉：先乾絕熱壓縮增溫；氣塊裡還有雲滴時，雲滴蒸發吸熱（同一個方程式反過來），雲滴蒸發完後就只剩乾絕熱。
 *   5. 環境：地面氣溫 = 氣塊起始溫度，遞減率 Γe 到對流層頂（16 km，接近熱帶的對流層頂高度；
 *      若照 Γe 算到 16 km 會比 −80 °C 還冷，對流層頂就降到 −80 °C 的高度），以上等溫；
 *      氣壓由靜力平衡解析求出 p(z) = p0 (T(z)/T0)^(g/(Rd Γe))。環境只決定「氣壓與高度的關係」和「穩定度」（氣塊比環境暖或冷）。
 *   6. 自由對流：氣塊被山抬到「自由對流高度 LFC」以上，就比周圍暖、會自己往上衝，直到又和環境一樣冷的「平衡高度 EL」（積雨雲雲頂）。
 *      CAPE = g ∫ (Tp − Te)/Te dz（LFC 到 EL），CIN 是 LFC 以下負浮力的部分。
 *
 * 簡化（頁面「模擬方法」有寫）：不計冰相（凝固潛熱）與雲滴的熱容量；比熱用乾空氣的 cpd；浮力用溫度而非虛溫。
 *
 * 常數與公式來源：
 *   g = 9.806 65 m/s²（標準重力，SI 定義值）
 *   Rd = 287.04、cpd = 1005.7 J/(kg·K)、Rv = 461.5 J/(kg·K)、Lv(T) = (2.501 − 0.00237 T℃)×10^6 J/kg
 *     （D. Bolton, 1980: The computation of equivalent potential temperature. Mon. Wea. Rev. 108, 1046–1053）
 *   液態水的飽和水氣壓：D. M. Murphy & T. Koop, 2005: Review of the vapour pressures of ice and supercooled water
 *     for atmospheric applications. Q. J. R. Meteorol. Soc. 131, 1539–1565，式 (10)，適用 123–332 K。
 *   海平面標準氣壓 1013.25 hPa（U.S. Standard Atmosphere 1976）。
 * 單位：溫度 K、氣壓 Pa、高度 m、混合比 kg/kg（畫面上換成 °C、hPa、g/kg）。
 */
(function (root) {
  'use strict';

  // ---------- 常數 ----------
  const G0 = 9.80665;
  const RD = 287.04;
  const CPD = 1005.7;
  const RV = 461.5;
  const EPS = RD / RV;            // 0.6220
  const KAPPA = RD / CPD;         // 0.2854
  const P0 = 101325;              // 海平面氣壓（Pa）
  const TK = 273.15;
  const GAMMA_D = G0 / CPD;       // 乾絕熱遞減率（K/m），≈ 9.751 K/km
  const ZTP = 16000;              // 環境的對流層頂（m）
  const TTP_MIN = 193.15;         // 對流層頂溫度的下限（−80 °C，接近熱帶冷點對流層頂）：遞減率很陡時對流層頂跟著降低
  const ZMAX = 20000;             // 自由對流最多算到這裡（m）
  const DZ = 5;                   // 積分步長（m）
  const FREE_DZ = 20;             // 山頂以上自由上升的步長（m）

  // ---------- 水氣 ----------
  /** 液態水面的飽和水氣壓（Pa），Murphy & Koop (2005) 式 (10) */
  function esat(T) {
    const lnT = Math.log(T);
    return Math.exp(54.842763 - 6763.22 / T - 4.210 * lnT + 0.000367 * T +
      Math.tanh(0.0415 * (T - 218.8)) * (53.878 - 1331.22 / T - 9.44523 * lnT + 0.014025 * T));
  }
  /** 汽化潛熱（J/kg），Bolton (1980) 式 (2) */
  function Lv(T) { return 2.501e6 - 2370 * (T - TK); }
  /** 混合比 ↔ 水氣壓 */
  function mixRatio(e, p) { return EPS * e / Math.max(p - e, 1); }
  function vapPress(r, p) { return r * p / (EPS + r); }
  /** 飽和混合比（kg/kg） */
  function rsat(T, p) { return mixRatio(esat(T), p); }
  /** 飽和水氣壓對溫度的導數（Pa/K）：克勞修斯－克拉伯龍近似，只用在牛頓法的斜率 */
  function desdT(T, es) { return es * Lv(T) / (RV * T * T); }
  /** 露點（K）：水氣壓 e 等於飽和水氣壓的溫度（牛頓法） */
  function dewpoint(e) {
    if (!(e > 0)) return NaN;
    // 起始值：Bolton 公式的反函數（誤差約 0.1 K），再用牛頓法修到 1e-9 K
    const x = Math.log(e / 611.2);
    let T = TK + 243.5 * x / (17.67 - x);
    for (let i = 0; i < 20; i++) {
      const es = esat(T);
      const step = (es - e) / desdT(T, es);
      T -= step;
      if (Math.abs(step) < 1e-9) break;
    }
    return T;
  }
  /** 相對溼度（0–1）＝ 水氣壓 ÷ 飽和水氣壓 */
  function relHum(T, r, p) { return vapPress(r, p) / esat(T); }

  // ---------- 環境大氣 ----------
  /** env = { Ts（地面氣溫 K）, gamma（遞減率 K/m）, ztp（對流層頂 m） } */
  function makeEnv(Ts, gammaKkm, ztp) {
    const gm = gammaKkm / 1000;
    let zt = ztp == null ? ZTP : ztp;
    if (ztp == null && gm > 0) zt = Math.min(zt, Math.max(1000, (Ts - TTP_MIN) / gm));
    const env = { Ts: Ts, gamma: gm, ztp: zt, Ttp: Ts - gm * zt };
    env.ptp = envPRaw(env, zt);
    return env;
  }
  function envT(env, z) { return z <= env.ztp ? env.Ts - env.gamma * z : env.Ttp; }
  function envPRaw(env, z) {
    if (Math.abs(env.gamma) < 1e-9) return P0 * Math.exp(-G0 * z / (RD * env.Ts));
    return P0 * Math.pow((env.Ts - env.gamma * z) / env.Ts, G0 / (RD * env.gamma));
  }
  /** 環境氣壓（Pa）：靜力平衡的解析解 */
  function envP(env, z) {
    if (z <= env.ztp) return envPRaw(env, z);
    return env.ptp * Math.exp(-G0 * (z - env.ztp) / (RD * env.Ttp));
  }

  // ---------- 氣塊 ----------
  /** 飽和絕熱遞減率（K/m）：AMS Glossary「saturation-adiabatic lapse rate」，假設氣塊溫度 ≈ 環境溫度 */
  function moistLapse(T, p) {
    const rs = rsat(T, p), L = Lv(T);
    return GAMMA_D * (1 + L * rs / (RD * T)) / (1 + L * L * rs * EPS / (CPD * RD * T * T));
  }
  /** 位溫（K） */
  function theta(T, p) { return T * Math.pow(P0 / p, KAPPA); }
  /** 相當位溫（K），Bolton (1980) 式 (43)：測試用來檢查濕絕熱過程 */
  function thetaE(T, p, r) {
    const e = vapPress(r, p) / 100; // hPa
    const TL = e > 0 ? 2840 / (3.5 * Math.log(T) - Math.log(e) - 4.805) + 55 : T;
    const rg = r * 1000;
    return T * Math.pow(P0 / p, 0.2854 * (1 - 0.28e-3 * rg)) * Math.exp((3.376 / TL - 0.00254) * rg * (1 + 0.81e-3 * rg));
  }
  /** Bolton (1980) 式 (15)：由氣溫與露點估計舉升凝結高度的溫度（K），誤差約 0.1 K；測試用 */
  function boltonTL(T, Td) { return 1 / (1 / (Td - 56) + Math.log(T / Td) / 800) + 56; }

  /**
   * 氣塊走一小步：從 s（{z, p, T, r, l, rain}）移到高度 z2。
   * 先乾絕熱，再做飽和調整（凝結放熱或雲滴蒸發吸熱）；新凝結的水有 eff 的比例落下。
   */
  function step(env, s, z2, eff) {
    const p2 = envP(env, z2);
    const Ts = s.T * Math.pow(p2 / s.p, KAPPA);
    let T = Ts, r = s.r, l = s.l, rain = s.rain;
    if (r <= 0 && l <= 0) return { z: z2, p: p2, T: T, r: r, l: 0, rain: rain };
    const es0 = esat(Ts);
    const rs0 = mixRatio(es0, p2);
    if (r > rs0 || l > 0) {
      // 解 cpd (T − Ts) = L (r − rs(T))：凝結（r > rs）時 T > Ts，蒸發時 T < Ts
      const L = Lv(Ts);
      let x = Ts, es = es0, rs = rs0;
      for (let i = 0; i < 30; i++) {
        const f = CPD * (x - Ts) - L * (r - rs);
        const df = CPD + L * rs * p2 / Math.max(p2 - es, 1) * L / (RV * x * x);
        const dx = f / df;
        x -= dx;
        es = esat(x); rs = mixRatio(es, p2);
        if (Math.abs(dx) < 1e-10) break;
      }
      const dc = r - rs; // > 0 凝結，< 0 蒸發
      if (dc >= 0) {
        T = x; r = rs;
        const fall = eff * dc;
        l += dc - fall; rain += fall;
      } else if (-dc <= l) {
        T = x; r = rs; l += dc;
      } else {
        // 雲滴全部蒸發還不到飽和
        T = Ts - L * l / CPD; r += l; l = 0;
      }
    }
    return { z: z2, p: p2, T: T, r: r, l: Math.max(0, l), rain: rain };
  }

  /** 由地面溫度（K）與相對溼度（0–1）得到起始氣塊 */
  function startParcel(T0, RH) {
    const e = Math.min(1, Math.max(0, RH)) * esat(T0);
    return { z: 0, p: P0, T: T0, r: mixRatio(e, P0), l: 0, rain: 0 };
  }

  /** 舉升凝結高度：乾絕熱上升（r 不變）到 r = r_s 的高度（二分法到 0.001 m） */
  function lcl(env, T0, RH) {
    const s0 = startParcel(T0, RH);
    const f = function (z) {
      const p = envP(env, z), T = T0 * Math.pow(p / P0, KAPPA);
      return rsat(T, p) - s0.r;
    };
    if (f(0) <= 0) return { z: 0, p: P0, T: T0 };
    let a = 0, b = ZMAX;
    if (f(b) > 0) return null;
    for (let i = 0; i < 80 && b - a > 1e-4; i++) { const m = (a + b) / 2; if (f(m) > 0) a = m; else b = m; }
    const z = (a + b) / 2, p = envP(env, z);
    return { z: z, p: p, T: T0 * Math.pow(p / P0, KAPPA) };
  }

  /** 把狀態加上露點、相對溼度等衍生量 */
  function dress(s, env) {
    const e = vapPress(s.r, s.p);
    s.Td = dewpoint(e);
    s.RH = Math.min(1, e / esat(s.T));
    s.Te = envT(env, s.z);
    return s;
  }

  /**
   * 完整模擬一次翻山。
   * params: { T0（地面氣溫 °C）, RH（相對溼度 0–1）, H（山高 m）, eff（降水效率 0–1）, gamma（環境遞減率 K/km）, ztp（可省略） }
   * 回傳：
   *   up: 上升段（0 → H）每 5 m 的狀態；down: 下沉段（H → 0）；free: 從地面一路上升到 20 km 的自由上升（同一套規則，用來找 LFC、EL）
   *   lcl: 舉升凝結高度 { z, p, T }（沒有成雲時 cloud = false）
   *   top: 山頂；lee: 背風山腳；zEvap: 背風坡雲滴蒸發完的高度（背風坡的雲底）
   *   foehn: 背風山腳 − 迎風山腳的溫度（K）；rain: 降下的水（kg/kg）
   *   rateDry, rateMoist, rateLee: 各段平均遞減率（K/km）
   *   lfc, el, cape, cin, triggered（山把氣塊抬到 LFC 以上）、stability（'stable'｜'conditional'｜'unstable'）
   */
  function simulate(params) {
    const T0 = params.T0 + TK;
    const RH = Math.min(1, Math.max(0, params.RH));
    const H = Math.max(0, params.H);
    const eff = Math.min(1, Math.max(0, params.eff));
    const env = makeEnv(T0, params.gamma, params.ztp);
    const s0 = startParcel(T0, RH);
    const L = lcl(env, T0, RH);
    const cloud = !!L && L.z < H;

    // 上升段
    const up = [dress(Object.assign({}, s0), env)];
    let s = s0;
    const nUp = Math.ceil(H / DZ);
    for (let i = 1; i <= nUp; i++) {
      s = step(env, s, Math.min(H, i * DZ), eff);
      up.push(dress(Object.assign({}, s), env));
    }
    const top = up[up.length - 1];
    // 下沉段
    const down = [top];
    let d = top, zEvap = top.l > 0 ? null : H;
    for (let i = nUp - 1; i >= 0; i--) {
      const prev = d;
      d = step(env, d, i * DZ, 0);
      down.push(dress(Object.assign({}, d), env));
      // 雲滴剛好蒸發完的高度（背風坡的雲底）：在這一步裡用二分法細算
      if (zEvap == null && prev.l > 0 && d.l <= 0) zEvap = evapLevel(env, prev, d.z);
    }
    if (zEvap == null) zEvap = 0; // 雲一直留到背風山腳（霧）
    const lee = down[down.length - 1];

    // 自由上升（判斷穩定度、LFC、EL、CAPE）：山頂以下就是上升段，山頂以上繼續用同一套規則往上算（步長 20 m）
    const free = [];
    for (let i = 0; i < up.length; i += 2) free.push({ z: up[i].z, T: up[i].T, Te: up[i].Te, l: up[i].l });
    if (free[free.length - 1].z < top.z) free.push({ z: top.z, T: top.T, Te: top.Te, l: top.l });
    let f = top;
    for (let z = Math.floor(H / FREE_DZ) * FREE_DZ + FREE_DZ; z <= ZMAX + 1e-6; z += FREE_DZ) {
      f = step(env, f, z, eff);
      free.push({ z: z, T: f.T, Te: envT(env, z), l: f.l });
    }
    const conv = convection(free, env);

    const zl = L ? Math.min(L.z, H) : H;
    const rateDry = zl > 1 ? (T0 - (L && L.z < H ? L.T : top.T)) / (zl / 1000) : NaN;
    const rateMoist = cloud && H - L.z > 1 ? (L.T - top.T) / ((H - L.z) / 1000) : NaN;
    const Tev = sampleDown(down, zEvap);
    const rateLee = zEvap > 1 ? (lee.T - Tev.T) / (zEvap / 1000) : NaN;
    const gs = moistLapse(T0, P0) * 1000;
    const stability = params.gamma > GAMMA_D * 1000 ? 'unstable' : (params.gamma > gs ? 'conditional' : 'stable');

    return {
      params: { T0: params.T0, RH: RH, H: H, eff: eff, gamma: params.gamma, ztp: env.ztp },
      env: env, up: up, down: down, free: free,
      start: up[0], lcl: L, cloud: cloud, top: top, lee: lee, zEvap: zEvap,
      foehn: lee.T - T0, rain: top.rain, liquidTop: top.l,
      rateDry: rateDry, rateMoist: rateMoist, rateLee: rateLee,
      gammaMoist0: gs, stability: stability,
      lfc: conv.lfc, el: conv.el, cape: conv.cape, cin: conv.cin,
      triggered: conv.lfc != null && conv.lfc <= H + 1e-6 && conv.el != null && conv.el > conv.lfc
    };
  }

  /** 下沉時雲滴蒸發完的高度：above 還有雲滴、zBelow 已經沒有，在兩者之間用二分法找 l = 0 */
  function evapLevel(env, above, zBelow) {
    let a = zBelow, b = above.z;
    for (let i = 0; i < 40; i++) {
      const m = (a + b) / 2;
      if (step(env, above, m, 0).l > 0) b = m; else a = m;
    }
    return (a + b) / 2;
  }

  /** 由自由上升的剖面找 LFC、EL、CAPE、CIN（浮力 b = 氣塊溫度 − 環境溫度；地面上 b = 0） */
  function convection(free, env) {
    let lfc = null, el = null, cape = 0, cin = 0;
    const b = function (s) { return s.T - s.Te; };
    for (let i = 1; i < free.length; i++) {
      const a = free[i - 1], c = free[i];
      const ba = b(a), bc = b(c);
      if (lfc == null) {
        if (bc > 0) {
          // 浮力由負（或零）轉正：自由對流高度
          lfc = a.z + (c.z - a.z) * (0 - ba) / (bc - ba + 1e-300);
          cape += G0 * 0.5 * (bc / c.Te) * (c.z - lfc);
        } else {
          cin += G0 * 0.5 * (ba / a.Te + bc / c.Te) * (c.z - a.z);
        }
      } else if (el == null) {
        if (bc <= 0) {
          const zc = a.z + (c.z - a.z) * ba / (ba - bc + 1e-300);
          cape += G0 * 0.5 * (ba / a.Te) * (zc - a.z);
          el = zc;
          break;
        }
        cape += G0 * 0.5 * (ba / a.Te + bc / c.Te) * (c.z - a.z);
      }
    }
    if (lfc != null && el == null) el = free[free.length - 1].z; // 20 km 還沒停（不會發生在合理的範圍）
    return { lfc: lfc, el: el, cape: lfc == null ? 0 : cape, cin: lfc == null ? NaN : cin };
  }

  /** 線性內插：上升段（z 遞增） */
  function sampleUp(up, z) { return sampleArr(up, z, 1); }
  /** 線性內插：下沉段（z 遞減） */
  function sampleDown(down, z) { return sampleArr(down, z, -1); }
  function sampleArr(arr, z, dir) {
    const n = arr.length;
    if (n === 1) return arr[0];
    if (dir > 0) {
      if (z <= arr[0].z) return arr[0];
      if (z >= arr[n - 1].z) return arr[n - 1];
    } else {
      if (z >= arr[0].z) return arr[0];
      if (z <= arr[n - 1].z) return arr[n - 1];
    }
    // 均勻步長：直接算索引
    let i = dir > 0 ? Math.floor((z - arr[0].z) / DZ) : Math.floor((arr[0].z - z) / DZ);
    i = Math.max(0, Math.min(n - 2, i));
    // 頭尾的步長可能不足 DZ：往前後修正
    while (i > 0 && (dir > 0 ? arr[i].z > z : arr[i].z < z)) i--;
    while (i < n - 2 && (dir > 0 ? arr[i + 1].z < z : arr[i + 1].z > z)) i++;
    const a = arr[i], b = arr[i + 1];
    const u = (z - a.z) / (b.z - a.z || 1);
    const o = {};
    ['z', 'p', 'T', 'r', 'l', 'rain', 'Td', 'RH', 'Te'].forEach(function (k) { o[k] = a[k] + (b[k] - a[k]) * u; });
    o.z = z;
    return o;
  }

  // ---------- 山的形狀（2D 與 3D 共用） ----------
  /** 路徑位置 u（0 迎風端 → 1 背風端）的地面高度（m）：兩側平地，中間 cos² 形的山 */
  const FOOT_W = 0.18, FOOT_L = 0.82;
  function terrain(u, H) {
    if (u <= FOOT_W || u >= FOOT_L) return 0;
    const x = (u - 0.5) / (0.5 - FOOT_W); // −1 … 1
    const c = Math.cos(x * Math.PI / 2);
    return H * c * c;
  }
  /** 路徑位置 u 上氣塊的狀態 */
  function stateAtU(res, u) {
    const z = terrain(u, res.params.H);
    const s = u <= 0.5 ? sampleUp(res.up, z) : sampleDown(res.down, z);
    s.u = u; s.branch = u < 0.5 ? 'up' : (u > 0.5 ? 'down' : 'top');
    return s;
  }
  /** 高度 z（0–H）在迎風坡（side < 0）或背風坡（side > 0）的路徑位置 u */
  function uAtZ(z, H, side) {
    if (H <= 0) return side < 0 ? FOOT_W : FOOT_L;
    const c = Math.sqrt(Math.min(1, Math.max(0, z / H)));
    const x = Math.acos(c) * 2 / Math.PI; // 0 … 1
    return 0.5 + (side < 0 ? -1 : 1) * x * (0.5 - FOOT_W);
  }

  const api = {
    G0: G0, RD: RD, CPD: CPD, RV: RV, EPS: EPS, KAPPA: KAPPA, P0: P0, TK: TK, GAMMA_D: GAMMA_D, ZTP: ZTP, TTP_MIN: TTP_MIN, ZMAX: ZMAX, DZ: DZ,
    FOOT_W: FOOT_W, FOOT_L: FOOT_L,
    esat: esat, Lv: Lv, mixRatio: mixRatio, vapPress: vapPress, rsat: rsat, dewpoint: dewpoint, relHum: relHum,
    makeEnv: makeEnv, envT: envT, envP: envP,
    moistLapse: moistLapse, theta: theta, thetaE: thetaE, boltonTL: boltonTL,
    step: step, startParcel: startParcel, lcl: lcl, simulate: simulate,
    sampleUp: sampleUp, sampleDown: sampleDown, terrain: terrain, stateAtU: stateAtU, uAtZ: uAtZ
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CloudCore = api;
})(typeof window !== 'undefined' ? window : this);
