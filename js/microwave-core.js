/*
 * microwave-core.js — 「認識電磁波（微波實驗）」的物理核心（與畫面無關，Node 可直接 require 測試）
 *
 * 單位：長度一律 cm、頻率 GHz、角度在介面上用「度」（內部換成弧度）。
 * 座標（俯視圖，數學座標，y 向上）：角度計的轉軸 O 在原點；固定臂在 O 的左方（−x 方向），
 * 發射器放在固定臂上、開口朝向 O（+x）；可動臂與固定臂的夾角 ψ 就是角度計的讀數（兩臂成一直線時 ψ = 180°）。
 *
 * 物理模型（細節見 microwave.html 的「模擬方法」）：
 *   1. 喇叭天線：從相位中心發出的球面波 e^{ikr}/r，振幅乘上方向圖（高斯形主瓣，半功率全寬 HPBW）。
 *      接收喇叭依互易性用同一個方向圖加權；小天線（探針）在水平面上不具方向性。
 *      發射器的電場是線偏振、沿鉛直方向（垂直於俯視圖的紙面）。
 *   2. 金屬板：理想導體，電場平行於板面，反射係數 Γ = −1。用物理光學（Kirchhoff 積分）沿板寬積分，
 *      板很寬時就是鏡像波源的波；板寬有限時自動包含板緣的繞射與板後的影子（Babinet 原理）。
 *   3. 偵測器：二極體檢波在小訊號時是平方律，電表讀數 ∝ |E|^2（沿接收天線方向的電場分量）。
 *   4. 稜鏡折射：發射喇叭的開口（11 cm、餘弦分布）貼在入射面，稜鏡內是準直的平面波；斜面上的口徑場
 *      （含菲涅耳穿透係數，TE）再以 Kirchhoff 積分傳到接收喇叭，接收喇叭以開口加權積分。司乃耳定律自動成立。
 *   5. 偏極柵：瓊斯（Jones）向量。金屬條平行方向的電場分量被擋下（反射），垂直方向的分量通過。
 */
(function (root) {
  'use strict';

  const C = 2.99792458e8;          // 光速 m/s
  const DEG = Math.PI / 180;

  // 實驗器材（典型的學校微波實驗組；尺寸 cm）
  const KIT = {
    fGHz: 10.525,                  // 常見的耿氏二極體（Gunn）發射器頻率，λ ≈ 2.85 cm
    hpbw: 18,                      // 喇叭在水平面（H 面）的半功率全寬（度）；寬 11 cm、餘弦分布的開口 ≈ 68°·λ/11 cm
    pc: 3,                         // 相位中心在喇叭開口後方的距離
    hornLen: 11, mouthW: 11, mouthH: 8, boxW: 8, boxL: 9, boxH: 9,
    arm: 25,                       // 反射、折射實驗中，喇叭相位中心到轉軸的距離
    plateW: 25, plateH: 30,        // 金屬反射板
    dRef: 40,                      // 讀數的參考：兩喇叭正對、相距 40 cm 時 S = 1
    prismA: 30, prismH: 18,        // 稜鏡最小內角（度）與入射面的長度
    rho: 0.45,                     // 喇叭開口的電壓反射係數（兩喇叭正對時的多次反射）
    txS: 10, plateS: 70,           // 駐波實驗：發射器開口與反射板在尺上的刻度（相距 60 cm）
    meterFS: 1.0,                  // 毫安培計滿刻度（mA）
    meterK: 0.8                    // S = 1 且靈敏度 1× 時的讀數（mA）
  };
  // 各實驗的電表校正（靈敏度 1× 時讓讀數落在 0.5～0.9 mA 附近）
  const CAL = { reflect: 1.6, refract: 1.0, standing: 0.3, polar: 1.4 };
  // 稜鏡材料在約 10 GHz 的折射率 n = √εr（von Hippel, Dielectric Materials and Applications）
  const MATERIALS = { polystyrene: 1.59, paraffin: 1.49 };

  // ---------- 小工具 ----------
  function lambdaCm(fGHz) { return C / (fGHz * 1e9) * 100; }
  function freqGHz(lam) { return C / (lam / 100) / 1e9; }
  function wrapPi(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }

  /** 喇叭方向圖（電場振幅）：高斯主瓣，功率在 ±HPBW/2 處減半；背向（|α| ≥ 90°）為 0 */
  function hornAmp(alpha, hpbw) {
    const a = Math.abs(wrapPi(alpha));
    if (a >= Math.PI / 2) return 0;
    const h = (hpbw || KIT.hpbw) * DEG;
    return Math.exp(-2 * Math.LN2 * (a / h) * (a / h)) * Math.cos(a) ** 0.25; // cos^(1/4) 讓 90° 處平滑歸零
  }

  // ---------- 一般場景：發射喇叭＋（可有可無的）金屬板 ----------
  /*
   * 金屬板用物理光學（Kirchhoff 積分）處理：沿板寬方向（俯視圖中的線段）數值積分，
   * 鉛直方向（板夠高）用駐相法解析積分，得到「2.5 維」的核：
   *   I(P) = (e^{−iπ/4}/√λ) ∫ du · A(q) e^{ik(r+s)} · ½(cos θ入 + cos θ出) / √(r s (r+s))
   * 其中 A(q) 是喇叭往板上 q 點方向的方向圖振幅、r = |q − T|、s = |P − q|。
   * 板很寬時，駐相點給出 A/(r+s)：正好是鏡像波源的球面波。
   * 與發射器同側：反射波 = Γ·I = −I（理想導體、電場平行板面）。
   * 在板的另一側：Babinet 原理，被擋住的直接波 = 自由空間的波 − I。
   * 所以兩側都是「總場 = 直接波 − I(P)」。
   */
  function platePrep(sc) {
    const pl = sc.plate, tx = sc.tx, k = 2 * Math.PI / sc.lam;
    if (!pl) return null;
    let n = Math.ceil(pl.w / (sc.lam / 14));
    if (n % 2) n++;                                   // Simpson：偶數個區間
    const du = pl.w / n, tx_ = -pl.ny, ty_ = pl.nx;   // 板的切線方向
    const q = new Float64Array((n + 1) * 6);          // x, y, Re, Im, cos入, r
    const sT = (tx.x - pl.x) * pl.nx + (tx.y - pl.y) * pl.ny;
    for (let i = 0; i <= n; i++) {
      const u = -pl.w / 2 + i * du;
      const x = pl.x + u * tx_, y = pl.y + u * ty_;
      const dx = x - tx.x, dy = y - tx.y, r = Math.hypot(dx, dy);
      const w = (i === 0 || i === n) ? 1 : (i % 2 ? 4 : 2);
      const a = hornAmp(Math.atan2(dy, dx) - tx.ax, tx.hpbw) * w * du / 3 / Math.sqrt(r);
      const o = i * 6;
      q[o] = x; q[o + 1] = y; q[o + 2] = a * Math.cos(k * r); q[o + 3] = a * Math.sin(k * r);
      q[o + 4] = Math.abs(dx * pl.nx + dy * pl.ny) / r; q[o + 5] = r;
    }
    return { q: q, n: n, sT: sT, k: k, pre: 1 / Math.sqrt(sc.lam) };
  }
  /** I(P)（見上）；wfn(dx, dy) 為接收天線對傳播方向 (dx, dy) 的方向圖加權（可省略） */
  function plateIntegral(sc, pp, px, py, wfn) {
    const pl = sc.plate, q = pp.q, k = pp.k;
    let re = 0, im = 0;
    for (let i = 0; i <= pp.n; i++) {
      const o = i * 6;
      const dx = px - q[o], dy = py - q[o + 1];
      let s = Math.hypot(dx, dy);
      if (s < 0.3) s = 0.3;
      const cout = Math.abs(dx * pl.nx + dy * pl.ny) / s;
      let f = 0.5 * (q[o + 4] + cout) / Math.sqrt(s * (q[o + 5] + s));
      if (wfn) f *= wfn(dx / s, dy / s);
      if (f === 0) continue;
      const c = Math.cos(k * s), sn = Math.sin(k * s);
      re += f * (q[o + 2] * c - q[o + 3] * sn);
      im += f * (q[o + 2] * sn + q[o + 3] * c);
    }
    // 乘上 e^{−iπ/4}/√λ
    const h = Math.SQRT1_2 * pp.pre;
    return [h * (re + im), h * (im - re)];
  }

  /**
   * 點 (px, py) 的電場（鉛直分量）。sc = { lam, tx: {x, y, ax, hpbw}, plate: {x, y, nx, ny, w} | null }
   * 傳回 { re, im, dre, dim（直接波）, pre, pim（金屬板的貢獻 −I）}。
   * wfn：接收天線的方向圖加權（接收喇叭用；探針或畫場圖時省略）。
   */
  function fieldParts(sc, px, py, wfn, pp) {
    const k = 2 * Math.PI / sc.lam, tx = sc.tx;
    const dx = px - tx.x, dy = py - tx.y, r = Math.max(0.3, Math.hypot(dx, dy));
    let a = hornAmp(Math.atan2(dy, dx) - tx.ax, tx.hpbw) / r;
    if (wfn) a *= wfn(dx / r, dy / r);
    const dre = a * Math.cos(k * r), dim = a * Math.sin(k * r);
    let pre = 0, pim = 0;
    if (sc.plate) {
      const I = plateIntegral(sc, pp || platePrep(sc), px, py, wfn);
      pre = -I[0]; pim = -I[1];
    }
    return { re: dre + pre, im: dim + pim, dre: dre, dim: dim, pre: pre, pim: pim };
  }

  /** 點 (px, py) 的總電場（鉛直分量）[實部, 虛部]；pp 為 platePrep(sc) 的結果（畫場圖時重複使用） */
  function field(sc, px, py, pp) {
    const f = fieldParts(sc, px, py, null, pp);
    return [f.re, f.im];
  }

  /** 接收：rx = { x, y, ax, hpbw } 為喇叭（依方向圖加權），rx.probe = true 為小天線（不加權） */
  function received(sc, rx, pp) {
    const wfn = rx.probe ? null : function (dx, dy) { return hornAmp(Math.atan2(-dy, -dx) - rx.ax, rx.hpbw); };
    const f = fieldParts(sc, rx.x, rx.y, wfn, pp);
    return [f.re, f.im];
  }
  /** 正規化的訊號強度：S = |E|^2 ÷（兩喇叭正對、相距 dRef 時的 |E|^2） */
  function norm2(e) { return (e[0] * e[0] + e[1] * e[1]) * KIT.dRef * KIT.dRef; }

  // ---------- 實驗一：反射 ----------
  /**
   * p = { thetaI（入射角，度）, psi（角度計讀數，度）, plate（是否裝金屬板）, tilt（發射器軸的偏差，度）,
   *       dT, dR（相位中心到轉軸，cm）, lam, hpbw, plateW }
   */
  function reflectGeom(p) {
    const dT = p.dT || KIT.arm, dR = p.dR || KIT.arm;
    const th = (p.thetaI || 0) * DEG, ps = p.psi * DEG;
    const tx = { x: -dT, y: 0, ax: (p.tilt || 0) * DEG, hpbw: p.hpbw || KIT.hpbw };
    const rx = { x: -dR * Math.cos(ps), y: dR * Math.sin(ps), ax: -ps, hpbw: p.hpbw || KIT.hpbw };
    const plate = p.plate === false ? null : { x: 0, y: 0, nx: -Math.cos(th), ny: Math.sin(th), w: p.plateW || KIT.plateW };
    return { tx: tx, rx: rx, plate: plate };
  }
  function reflectSignal(p) {
    const g = reflectGeom(p);
    const sc = { lam: p.lam, tx: g.tx, plate: g.plate };
    const e = received(sc, g.rx);
    return norm2(e);
  }

  // ---------- 實驗二：稜鏡折射 ----------
  /** Fresnel 功率穿透率（TE，電場垂直入射面）：由折射率 n1 以入射角 ti 進入 n2 */
  function fresnelT(n1, n2, ti) {
    const s = n1 * Math.sin(ti) / n2;
    if (Math.abs(s) >= 1) return 0;
    const tt = Math.asin(s), ci = Math.cos(ti), ct = Math.cos(tt);
    const t = 2 * n1 * ci / (n1 * ci + n2 * ct);
    return (n2 * ct) / (n1 * ci) * t * t;
  }
  function fresnelR(n1, n2, ti) {
    const s = n1 * Math.sin(ti) / n2;
    if (Math.abs(s) >= 1) return 1;
    const tt = Math.asin(s), ci = Math.cos(ti), ct = Math.cos(tt);
    const r = (n1 * ci - n2 * ct) / (n1 * ci + n2 * ct);
    return r * r;
  }
  /** 中心射線的出射角（由斜面的法線量起，度）；全反射時傳回 NaN */
  function exitAngle(n, A) {
    const s = n * Math.sin(A * DEG);
    return s >= 1 ? NaN : Math.asin(s) / DEG;
  }
  /** 中心射線的偏向角 δ ＝ θ2 − A（度）；角度計讀數 ψ = 180° − δ */
  function deviation(n, A) { return exitAngle(n, A) - A; }

  /** 稜鏡的幾何（cm）：入射面鉛直（x = xF），斜面通過轉軸 O，最小內角 A 的頂點在下方、直角在上方 */
  function refractGeom(A, H) {
    A = (A == null ? KIT.prismA : A) * DEG; H = H || KIT.prismH;
    const w0 = (H / 2) * Math.tan(A);                  // 中心射線（y = 0）在稜鏡內走的距離
    const xF = -w0;
    return {
      xF: xF, w0: w0, H: H,
      pts: [{ x: xF, y: -H / 2 }, { x: xF, y: H / 2 }, { x: xF + H * Math.tan(A), y: H / 2 }], // 頂點 A、直角、第三頂點
      nx: Math.cos(A), ny: -Math.sin(A)                // 斜面朝外的法線（指向右下）
    };
  }
  /**
   * 稜鏡出射面（斜面）上的口徑場。發射喇叭的開口（寬 mouthW、TE10 餘弦分布）貼在入射面上，
   * 稜鏡內是準直的平面波（菲涅耳距離遠大於稜鏡厚度），斜面上的場 = 開口場 × 穿透係數 t（TE）× 相位 e^{inkx}。
   * p = { n, A, lam, tilt（度）}。傳回 { q: [x, y, Re, Im]…, n, th2, nx, ny }
   */
  function prismAperture(p) {
    const n = p.n, A = p.A * DEG, lam = p.lam, k = 2 * Math.PI / lam, W = KIT.mouthW;
    const g = refractGeom(p.A);
    const tau = (p.tilt || 0) * DEG, tin = Math.asin(Math.sin(tau) / n);
    const th1 = A, st = n * Math.sin(th1);
    if (st >= 1) return null;                          // 全反射
    const th2 = Math.asin(st);
    const t1 = 2 / (1 + n);                            // 入射面（正向入射）的振幅穿透係數
    const t2 = 2 * n * Math.cos(th1) / (n * Math.cos(th1) + Math.cos(th2));
    const N = Math.max(80, 2 * Math.ceil(W / (lam / 10)));
    const q = new Float64Array((N + 1) * 4);
    for (let i = 0; i <= N; i++) {
      const y = -W / 2 + W * i / N;
      const xh = g.xF + (y + g.H / 2) * Math.tan(A);
      const amp = Math.cos(Math.PI * y / W) * t1 * t2 * ((i === 0 || i === N) ? 1 : (i % 2 ? 4 : 2)) * (W / N / Math.cos(A)) / 3;
      const ph = n * k * Math.cos(tin) * (xh - g.xF) + k * Math.sin(tau) * y;
      q[4 * i] = xh; q[4 * i + 1] = y; q[4 * i + 2] = amp * Math.cos(ph); q[4 * i + 3] = amp * Math.sin(ph);
    }
    return { q: q, N: N, th2: th2, nx: g.nx, ny: g.ny, k: k };
  }
  /** 出射面以外一點的場（水平面上的 Kirchhoff 積分：核 e^{iks}/√s × 傾斜因子）[實部, 虛部] */
  function prismField(pa, px, py) {
    const q = pa.q, k = pa.k, c2 = Math.cos(pa.th2);
    let re = 0, im = 0;
    for (let i = 0; i <= pa.N; i++) {
      const o = 4 * i, dx = px - q[o], dy = py - q[o + 1];
      const s = Math.max(0.3, Math.hypot(dx, dy));
      const co = (dx * pa.nx + dy * pa.ny) / s;
      if (c2 + co <= 0) continue;                       // Kirchhoff 傾斜因子 ½(cos θ2 + cos θ出)，在斜面後方平滑地降到 0
      const f = 0.5 * (c2 + co) / Math.sqrt(s), c = Math.cos(k * s), sn = Math.sin(k * s);
      re += f * (q[o + 2] * c - q[o + 3] * sn); im += f * (q[o + 2] * sn + q[o + 3] * c);
    }
    return [re, im];
  }
  /** 接收喇叭（開口中心距 O 為 d、對準 O）以開口的餘弦分布加權、積分收到的場 */
  function apertureReceive(fieldFn, psi, d) {
    const W = KIT.mouthW, ps = psi * DEG, NR = 16;
    const cx = -d * Math.cos(ps), cy = d * Math.sin(ps), tx = Math.sin(ps), ty = Math.cos(ps);
    let re = 0, im = 0;
    for (let j = 0; j <= NR; j++) {
      const v = -W / 2 + W * j / NR, w = Math.cos(Math.PI * v / W) * ((j === 0 || j === NR) ? 1 : (j % 2 ? 4 : 2));
      const e = fieldFn(cx + v * tx, cy + v * ty);
      re += w * e[0]; im += w * e[1];
    }
    return re * re + im * im;
  }
  const refRefCache = {};
  /**
   * 稜鏡實驗的訊號 S。p = { n, A（度）, psi（度）, lam, tilt（度）}
   * 正規化：同一套計算把稜鏡換成空氣（n = 1）、接收器在 180° 時的讀數，乘上兩喇叭在這個距離正對時的 S。
   */
  function refractSignal(p) {
    const lam = p.lam, d = KIT.arm - KIT.pc;           // 接收喇叭開口到 O 的距離
    const pa = prismAperture(p);
    if (!pa) return 0;
    const key = lam.toFixed(6) + '|' + p.A;
    if (!refRefCache[key]) {
      const pa0 = prismAperture({ n: 1, A: p.A, lam: lam });
      const g = refractGeom(p.A), dTR = d - g.xF + 2 * KIT.pc;
      refRefCache[key] = { U: apertureReceive(function (x, y) { return prismField(pa0, x, y); }, 180, d), S: Math.pow(KIT.dRef / dTR, 2) };
    }
    const ref = refRefCache[key];
    return apertureReceive(function (x, y) { return prismField(pa, x, y); }, p.psi, d) / ref.U * ref.S;
  }

  // ---------- 實驗三：駐波 ----------
  /** 駐波實驗的場景（x = 尺上的刻度）：發射器開口在 txS、朝 +x；反射板在 plateS、板面朝向發射器 */
  function standingScene(p) {
    const plateS = p.plateS == null ? KIT.plateS : p.plateS, txS = p.txS == null ? KIT.txS : p.txS;
    return {
      lam: p.lam,
      tx: { x: txS - KIT.pc, y: 0, ax: (p.tilt || 0) * DEG, hpbw: p.hpbw || KIT.hpbw },
      plate: { x: plateS, y: 0, nx: -1, ny: 0, w: p.plateW || KIT.plateW }
    };
  }
  /** 探針在刻度 s（cm）、離軸 y 時的訊號 S；pp 可傳入 platePrep 的結果以加速 */
  function standingSignal(p, s, y, pp) {
    const sc = standingScene(p);
    return norm2(received(sc, { x: s, y: y || 0, probe: true }, pp));
  }
  /** 理論上的波節位置（兩道平面波的近似）：距反射板 m·λ/2（m = 0, 1, 2, …）的刻度 */
  function nodeNear(p, s) {
    const plateS = p.plateS == null ? KIT.plateS : p.plateS, h = p.lam / 2;
    return plateS - Math.round((plateS - s) / h) * h;
  }

  // ---------- 實驗四：偏振 ----------
  /**
   * p = { g1: {on, ang}, g2: {on, ang}（隙縫與水平的夾角，度）, rx（接收器繞軸轉的角度，度）,
   *       d（兩喇叭開口的距離 cm）, lam, leak（平行分量的穿透振幅，理想 0）, tPerp（垂直分量的穿透振幅，理想 1）}
   * 橫向座標 [h, v]：h 為水平（垂直於光束）、v 為鉛直。發射器的電場沿 v。
   * 傳回 { S, chain：[發射後, 柵 1 後, 柵 2 後] 的電場向量, amp：沿接收天線的振幅 }
   */
  function gridPass(E, ang, leak, tPerp) {
    const a = ang * DEG, sx = Math.cos(a), sy = Math.sin(a);     // 金屬條（隙縫）方向
    const px = -sy, py = sx;                                     // 通過的方向（垂直於金屬條）
    const ep = E[0] * px + E[1] * py, es = E[0] * sx + E[1] * sy;
    return [tPerp * ep * px + leak * es * sx, tPerp * ep * py + leak * es * sy];
  }
  function polarSignal(p) {
    const leak = p.leak || 0, tP = p.tPerp == null ? 1 : p.tPerp;
    let E = [0, 1];
    const chain = [E.slice()];
    if (p.g1 && p.g1.on) E = gridPass(E, p.g1.ang, leak, tP);
    chain.push(E.slice());
    if (p.g2 && p.g2.on) E = gridPass(E, p.g2.ang, leak, tP);
    chain.push(E.slice());
    const r = (p.rx || 0) * DEG;
    const amp = E[0] * (-Math.sin(r)) + E[1] * Math.cos(r);       // 接收天線方向 (−sin ρ, cos ρ)
    const d = p.d || KIT.dRef, rr = d + 2 * KIT.pc;                // 相位中心的距離
    let S = amp * amp * (KIT.dRef / rr) * (KIT.dRef / rr);
    if (p.lam) {
      // 兩喇叭之間的多次反射（接收器開口反射 → 發射器開口再反射，多走 2r）：讀數隨距離有 λ/2 週期的起伏
      const k = 2 * Math.PI / p.lam, q = KIT.rho * KIT.rho / 3;
      const cr = 1 + q * Math.cos(2 * k * rr), ci = q * Math.sin(2 * k * rr);
      S *= cr * cr + ci * ci;
    }
    return { S: S, chain: chain, amp: amp };
  }

  // ---------- 電表 ----------
  function meter(S, sens, mode) { return KIT.meterK * (sens == null ? 1 : sens) * (CAL[mode] || 1) * S; }

  // ---------- 數據分析 ----------
  /** 駐波：起點與終點相隔 N 個波節（不含起點）→ λ = 2|Δx|/N */
  function lambdaFromNodes(x0, x1, N) { return 2 * Math.abs(x1 - x0) / N; }
  /** 折射：角度計讀數 ψ → 偏向角 δ、折射角 θ2 = A + δ、n = sin θ2 / sin A */
  function prismFromPsi(psi, A) {
    const d = 180 - psi, t2 = A + d;
    return { delta: d, theta2: t2, n: Math.sin(t2 * DEG) / Math.sin(A * DEG) };
  }
  function mean(a) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return a.length ? s / a.length : NaN; }
  function sd(a) {
    if (a.length < 2) return NaN;
    const m = mean(a); let s = 0;
    for (let i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m);
    return Math.sqrt(s / (a.length - 1));
  }
  /** 過原點最佳直線 y = kx 的斜率 */
  function slopeThroughOrigin(xs, ys) {
    let sxy = 0, sxx = 0;
    for (let i = 0; i < xs.length; i++) { sxy += xs[i] * ys[i]; sxx += xs[i] * xs[i]; }
    return sxx > 0 ? sxy / sxx : NaN;
  }
  function pctErr(meas, ref) { return (meas - ref) / ref * 100; }

  /** 在 [a, b] 上以細格點＋黃金分割找 f 的極大或極小（極小時 sign = −1） */
  function extremum(f, a, b, sign, steps) {
    sign = sign || 1; steps = steps || 400;
    let best = a, bv = -Infinity;
    for (let i = 0; i <= steps; i++) {
      const x = a + (b - a) * i / steps, v = sign * f(x);
      if (v > bv) { bv = v; best = x; }
    }
    const h = (b - a) / steps;
    let lo = Math.max(a, best - h), hi = Math.min(b, best + h);
    const g = (Math.sqrt(5) - 1) / 2;
    for (let i = 0; i < 80; i++) {
      const x1 = hi - g * (hi - lo), x2 = lo + g * (hi - lo);
      if (sign * f(x1) > sign * f(x2)) hi = x2; else lo = x1;
    }
    return (lo + hi) / 2;
  }

  const api = {
    C: C, DEG: DEG, KIT: KIT, CAL: CAL, MATERIALS: MATERIALS,
    lambdaCm: lambdaCm, freqGHz: freqGHz, wrapPi: wrapPi,
    hornAmp: hornAmp, platePrep: platePrep, plateIntegral: plateIntegral,
    fieldParts: fieldParts, field: field, received: received, norm2: norm2,
    reflectGeom: reflectGeom, reflectSignal: reflectSignal,
    fresnelT: fresnelT, fresnelR: fresnelR, exitAngle: exitAngle, deviation: deviation,
    refractGeom: refractGeom, prismAperture: prismAperture, prismField: prismField,
    apertureReceive: apertureReceive, refractSignal: refractSignal,
    standingScene: standingScene, standingSignal: standingSignal, nodeNear: nodeNear,
    gridPass: gridPass, polarSignal: polarSignal,
    meter: meter, lambdaFromNodes: lambdaFromNodes, prismFromPsi: prismFromPsi,
    mean: mean, sd: sd, slopeThroughOrigin: slopeThroughOrigin, pctErr: pctErr, extremum: extremum
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MicrowaveCore = api;
})(this);
