/*
 * missions/index.js — 所有有任務的模組清單（排行榜頁用來載入全部任務檔）
 * 新增某模組的任務時，在這裡加上它的代號與名稱。
 */
window.LAB_MISSION_MODULES = [
  { id: 'projectile', zh: '拋體運動', en: 'Projectile Motion' },
  { id: 'lens-mirror', zh: '透鏡與面鏡成像', en: 'Images in Lenses and Mirrors' },
  { id: 'doppler', zh: '都卜勒效應', en: 'The Doppler Effect' },
  { id: 'standing-waves', zh: '繩波的反射與駐波', en: 'Reflection of Waves on a String and Standing Waves' },
  { id: 'capacitor', zh: '平行板電容器', en: 'Parallel-Plate Capacitor' },
  { id: 'kepler', zh: '行星軌道與克卜勒定律', en: "Planetary Orbits and Kepler's Laws" },
  { id: 'collision', zh: '一維碰撞', en: 'Collisions in One Dimension' },
  { id: 'magnetic-particle', zh: '帶電粒子在磁場中運動', en: 'Charged Particles in a Magnetic Field' },
  { id: 'electric-field', zh: '電場與等位線', en: 'Electric Fields and Equipotentials' },
  { id: 'dc-circuit', zh: '直流電路', en: 'DC Circuits' },
  { id: 'photoelectric', zh: '光電效應', en: 'The Photoelectric Effect' },
  { id: 'faraday', zh: '法拉第定律與冷次定律', en: 'Faraday’s Law and Lenz’s Law' },
  { id: 'radioactive-decay', zh: '放射性衰變與半衰期', en: 'Radioactive Decay and Half-Life' },
  { id: 'circular-motion', zh: '等速圓周運動', en: 'Uniform Circular Motion' },
  { id: 'oscillation', zh: '彈簧振子與單擺', en: 'Spring Oscillator and Pendulum' },
  { id: 'hydrogen-spectrum', zh: '氫原子能階與光譜', en: 'Hydrogen Energy Levels and Spectra' },
  { id: 'specific-heat', zh: '比熱與熱平衡', en: 'Specific Heat and Thermal Equilibrium' },
  { id: 'newton-second', zh: '牛頓第二定律（力學車實驗）', en: 'Newton’s Second Law: The Dynamics Cart' },
  { id: 'incline-friction', zh: '斜面與摩擦力', en: 'Inclines and Friction' },
  { id: 'ideal-gas', zh: '理想氣體分子模擬', en: 'Ideal Gas Molecules' },
  { id: 'refraction', zh: '折射與全反射', en: 'Refraction and Total Internal Reflection' },
  { id: 'slit-interference', zh: '雙狹縫干涉與單狹縫繞射', en: 'Double-Slit Interference and Single-Slit Diffraction' }
];

/* 網站上所有已上線的實驗（成就「全能物理學家」用）。新增實驗上線時一起更新。 */
window.LAB_LIVE_MODULES = ['projectile', 'collision', 'circular-motion', 'oscillation', 'slit-interference', 'refraction', 'electric-field', 'magnetic-particle', 'lens-mirror', 'doppler', 'standing-waves', 'capacitor', 'kepler', 'dc-circuit', 'photoelectric', 'faraday', 'radioactive-decay', 'hydrogen-spectrum', 'specific-heat', 'newton-second', 'incline-friction', 'ideal-gas'];

/* 各實驗所屬的物理分支（成就「分支制霸」用）。新增實驗時一起加上。 */
window.LAB_MODULE_BRANCH = {
  'projectile': 'mech', 'collision': 'mech', 'newton-second': 'mech', 'incline-friction': 'mech', 'atwood': 'mech', 'elevator': 'mech', 'circular-motion': 'mech', 'oscillation': 'mech', 'kepler': 'mech',
  'ideal-gas': 'thermo', 'specific-heat': 'thermo',
  'standing-waves': 'wave', 'doppler': 'wave',
  'refraction': 'optics', 'lens-mirror': 'optics', 'slit-interference': 'optics',
  'electric-field': 'em', 'capacitor': 'em', 'dc-circuit': 'em', 'magnetic-particle': 'em', 'faraday': 'em',
  'photoelectric': 'modern', 'hydrogen-spectrum': 'modern', 'radioactive-decay': 'modern'
};
