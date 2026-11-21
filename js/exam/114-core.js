/* SI units except where the graph explicitly uses mV and mA. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ExamPhysics = api;
})(globalThis, function () {
  'use strict';
  const earthRadius = 6371000, mu = 3.986e14;
  function orbit(heightKm, mass = 1) {
    const radius = earthRadius + heightKm * 1000;
    const speed = Math.sqrt(mu / radius);
    return {radius, speed, period: 2 * Math.PI * radius / speed, acceleration: mu / radius ** 2,
      potential: -mu * mass / radius, energy: -mu * mass / (2 * radius)};
  }
  function frequencyRatio(beta) { return Math.sqrt((1 - beta) / (1 + beta)); }
  // Equal schematic stage durations. Integrated speed gives continuous position.
  function flight(t, real) {
    const time = Math.max(0, Math.min(3,t)), maxBeta = real ? 0.0001 : 0.32;
    const ramp = Math.min(time,1,3-time);
    const distance = time <= 1 ? time*time/2 : time <= 2 ? time-.5 : 2-(3-time)**2/2;
    return {beta:maxBeta*ramp, ratio:frequencyRatio(maxBeta*ramp), distance:distance/2};
  }
  const samples = [[-80,-.89],[-60,-.756],[-40,-.621],[-20,-.478],[0,-.335],[20,-.204],[40,-.07],[60,.07]];
  function fit(points) {
    const mean = axis => points.reduce((s,p)=>s+p[axis],0)/points.length;
    const x=mean(0), y=mean(1);
    const slope=points.reduce((s,p)=>s+(p[0]-x)*(p[1]-y),0)/points.reduce((s,p)=>s+(p[0]-x)**2,0);
    const intercept=y-slope*x;
    return {slope,intercept,voltage:-intercept/slope,resistance:1/slope,current:v=>slope*v+intercept};
  }
  function measure(line, a, b) {
    const voltage=b-a, current=line.current(b)-line.current(a);
    return {voltage,current,resistance:current ? voltage/current : null};
  }
  function multiple(selected, key) {
    const errors=[...'ABCDE'].filter(letter=>selected.includes(letter)!==key.includes(letter)).length;
    return {errors,score:selected.length ? Math.max(0,2*(5-2*errors)/5) : 0};
  }
  async function gradeChannel(fields, engine) {
    const limits=[[50,5,{mV:1,V:1000}],[150,25,{'Ω':1,'kΩ':1000}]];
    const parts=await Promise.all(limits.map(([center,tol,units],i)=>{
      const {value,unit}=fields[i], parsed=engine.numeric(value);
      if (!Object.hasOwn(units,unit)||!parsed||parsed.unit) return false;
      return engine.gradeNumber(String(parsed.value*units[unit]),center,{absolute:tol,relative:0});
    }));
    return {parts,score:parts.filter(Boolean).length*2};
  }
  // ── 其餘 11 題（11/21）。題目給的常數照題目，不換更精確的值。
  const HC_EV_NM = 1239.84; // h c，單位 eV·nm
  function single(selected, key) { const ok = selected === key; return {errors: ok ? 0 : 1, score: ok ? 2 : 0}; }
  // 數量級：係數 ≥ √10 才進位（站長上課講法）
  function magnitude(x) { const e = Math.floor(Math.log10(x)), m = x / 10 ** e; return m >= Math.sqrt(10) ? e + 1 : e; }
  // 第 20 題：Q = mL，L 先換成 J/kg
  function melt(energy, kcalPerKg = 80, kJPerKcal = 4) { const latent = kcalPerKg * kJPerKcal * 1000; return {latent, mass: energy / latent}; }
  // 第 21 題：一座水庫的位能增加 ρVgh
  function lift(energy, volume = 8e7, density = 1000, g = 10, height = 4000) {
    const perReservoir = density * volume * g * height; return {mass: density * volume, perReservoir, count: energy / perReservoir};
  }
  // 第 22 題：距離＝光速×傳訊時間；平均速率＝路徑長÷時間
  function trip(lightMinutes = 10, days = 200, c = 3e8) {
    const distance = c * lightMinutes * 60, time = days * 86400; return {distance, time, speed: distance / time};
  }
  // 第 24 題：氫原子能階 E_n = −13.6/n² eV
  const level = n => -13.6 / (n * n);
  function emission(upper, lower) { const energy = level(upper) - level(lower); return {energy, wavelength: HC_EV_NM / energy}; }
  // 第 25 題：雙狹縫，u＝位置／條紋間距；單狹縫包絡寬度比 0.2
  function slit(u, ratio = 0.2) { const s = Math.PI * u * ratio, env = s ? Math.sin(s) / s : 1; return Math.cos(Math.PI * u) ** 2 * env * env; }
  function random(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function electrons(n, seed = 1, span = 4.6) { const r = random(seed), out = []; while (out.length < n) { const u = (r() * 2 - 1) * span; if (r() < slit(u)) out.push([u, r()]); } return out; }
  // 第 27 題：一次線圈電流 I = I₀ sin ωt，二次線圈 ε = −M dI/dt；直流時 ε = 0
  function induction(t, {freq = 1, current = 1, mutual = 1, ac = true} = {}) {
    if (!ac) return {current, flux: mutual * current, emf: 0};
    const w = 2 * Math.PI * freq; return {current: current * Math.sin(w * t), flux: mutual * current * Math.sin(w * t), emf: -mutual * current * w * Math.cos(w * t)};
  }
  // 第 47 題：因次 [kg, m, s, A, K]
  const DIM = {e: [0, 0, 1, 1, 0], E: [1, 2, -3, -1, 0], T: [0, 0, 0, 0, 1], alpha: [1, 2, -2, 0, -1]}, JOULE = [1, 2, -2, 0, 0];
  const units = terms => terms.reduce((acc, [sym, pow]) => acc.map((v, i) => v + pow * DIM[sym][i]), [0, 0, 0, 0, 0]);
  const isEnergy = terms => units(terms).every((v, i) => v === JOULE[i]);
  // 第 48 題：E ∝ 絕對溫度
  const voltageRatio = (celsius1, celsius2) => (celsius1 + 273.15) / (celsius2 + 273.15);
  // 第 50、51 題
  const photonEV = nm => HC_EV_NM / nm;
  function cutoff(gap, h = 6.63e-34, c = 3e8, e = 1.6e-19) { return h * c / (gap * e) * 1e9; }
  async function gradeCatalyst(fields, engine) {
    const scale = {nm: 1, 'μm': 1000, m: 1e9}, {value, unit} = fields[0], parsed = engine.numeric(value);
    const a = Object.hasOwn(scale, unit) && !!parsed && !parsed.unit && await engine.gradeNumber(String(parsed.value * scale[unit]), 390, {absolute: 10, relative: 0});
    const b = fields[1].value === '<' && fields[2].value === 'longer';
    return {parts: [a, b], score: (a ? 2 : 0) + (b ? 2 : 0)};
  }
  return {earthRadius,mu,orbit,frequencyRatio,flight,samples,fit,measure,multiple,gradeChannel,
    HC_EV_NM,single,magnitude,melt,lift,trip,level,emission,slit,random,electrons,induction,DIM,units,isEnergy,voltageRatio,photonEV,cutoff,gradeCatalyst};
});
