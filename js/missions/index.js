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
  { id: 'atwood', zh: '連體運動與阿特午機', en: 'Connected Bodies and the Atwood Machine' },
  { id: 'elevator', zh: '電梯中的視重（超重與失重）', en: 'Apparent Weight in an Elevator' },
  { id: 'refraction', zh: '折射與全反射', en: 'Refraction and Total Internal Reflection' },
  { id: 'slit-interference', zh: '雙狹縫干涉與單狹縫繞射', en: 'Double-Slit Interference and Single-Slit Diffraction' },
  { id: 'free-fall', zh: '自由落體與斜面上的運動', en: 'Free Fall and Motion on an Incline' },
  { id: 'ripple-tank', zh: '水波槽實驗', en: 'Ripple Tank' },
  { id: 'resonance-tube', zh: '氣柱的共鳴（共鳴管測聲速）', en: 'Resonance in an Air Column: Measuring the Speed of Sound' },
  { id: 'refractive-index', zh: '折射率的測定（插針法）', en: 'Measuring the Refractive Index (Pin Method)' },
  { id: 'e-over-m', zh: '電子的荷質比', en: 'Charge-to-Mass Ratio of the Electron' },
  { id: 'ohms-law', zh: '歐姆定律與電路（電阻的測量）', en: 'Ohm’s Law and Circuits: Measuring Resistance' },
  { id: 'equipotential', zh: '等位線與電場（導電紙實驗）', en: 'Equipotential Lines and the Electric Field (Conducting Paper)' },
  { id: 'thin-lens', zh: '薄透鏡的成像', en: 'Thin Lens Imaging' },
  { id: 'microwave', zh: '認識電磁波（微波實驗）', en: 'Meeting Electromagnetic Waves: Microwave Experiments' },
  { id: 'current-balance', zh: '電流天平', en: 'Current Balance' },
  { id: 'measurement', zh: '測量與不確定度（游標尺與螺旋測微器）', en: 'Measurement and Uncertainty: Vernier Caliper and Micrometer' },
  { id: 'angular-momentum', zh: '角動量守恆', en: 'Conservation of Angular Momentum' },
  { id: 'thin-film', zh: '薄膜干涉（肥皂膜、空氣劈與牛頓環）', en: 'Thin-Film Interference: Soap Films, Air Wedges and Newton\'s Rings' },
  { id: 'moon-phases', zh: '月相與日月食', en: 'Moon Phases and Eclipses' },
  { id: 'earthquake', zh: '地震波與震央定位', en: 'Seismic Waves and Locating an Epicenter' },
  { id: 'torque-balance', zh: '力矩與靜力平衡', en: 'Torque and Static Equilibrium' },
  { id: 'energy-coaster', zh: '雲霄飛車與力學能守恆', en: 'Roller Coaster and Conservation of Mechanical Energy' },
  { id: 'seasons', zh: '四季與太陽軌跡', en: 'Seasons and the Sun\'s Path' },
  { id: 'current-magnetic-field', zh: '電流的磁效應：直導線、線圈與螺線管的磁場', en: 'Magnetic Effects of Currents: Wires, Coils and Solenoids' },
  { id: 'mendelian-inheritance', zh: '孟德爾遺傳：豌豆雜交與卡方檢定', en: 'Mendelian Inheritance: Pea Crosses and the Chi-Square Test' },
  { id: 'acid-base-titration', zh: '酸鹼滴定', en: 'Acid–Base Titration' },
  { id: 'tides', zh: '潮汐：月球、太陽與兩個潮汐隆起', en: 'Tides: The Moon, the Sun and the Two Tidal Bulges' },
  { id: 'conic-sections', zh: '圓錐曲線：用平面切圓錐', en: 'Conic Sections: Slicing a Cone' },
  { id: 'molecular-shapes', zh: '分子的形狀：電子對互相推開（VSEPR）', en: 'Molecular Shapes: Electron Pairs Push Apart (VSEPR)' },
  { id: 'diffusion-osmosis', zh: '擴散與滲透：布朗運動、半透膜與細胞的漲縮', en: 'Diffusion and Osmosis: Brownian Motion, Membranes and Cells' },
  { id: 'trig-functions', zh: '三角函數：單位圓與正弦波', en: 'Trigonometric Functions: The Unit Circle and Sine Waves' },
  { id: 'reaction-rate', zh: '反應速率與碰撞學說', en: 'Reaction Rates and Collision Theory' },
  { id: 'action-potential', zh: '神經的動作電位：Hodgkin–Huxley 模型與神經衝動的傳導', en: 'The Action Potential: The Hodgkin–Huxley Model and Nerve Conduction' },
  { id: 'cloud-formation', zh: '絕熱冷卻與雲的形成', en: 'Adiabatic Cooling and Cloud Formation' },
  { id: 'chemical-equilibrium', zh: '化學平衡與勒沙特列原理', en: 'Chemical Equilibrium and Le Chatelier\'s Principle' },
  { id: 'coriolis', zh: '科氏力與大氣的運動', en: 'The Coriolis Effect and Moving Air' },
  { id: 'galton-board', zh: '高爾頓板與二項分布', en: 'Galton Board and the Binomial Distribution' },
  { id: 'derivative', zh: '導數與切線', en: 'Derivatives and Tangent Lines' },
  { id: 'heat-engine', zh: '熱機循環與熱力學第一定律', en: 'Heat Engines and the First Law of Thermodynamics' },
  { id: 'greenhouse', zh: '溫室效應與地球的能量平衡', en: 'The Greenhouse Effect and Earth’s Energy Balance' },
  { id: 'electrochemistry', zh: '化學電池與電解', en: 'Electrochemical Cells and Electrolysis' },
  { id: 'space-vectors', zh: '空間向量：內積、外積與平面', en: 'Space Vectors: Dot Product, Cross Product and Planes' },
  { id: 'population-growth', zh: '族群成長：指數、邏輯斯與掠食者–獵物', en: 'Population Growth: Exponential, Logistic, Predator and Prey' },
  { id: 'hardy-weinberg', zh: '哈溫平衡、遺傳漂變與天擇', en: 'Hardy–Weinberg, Genetic Drift and Natural Selection' }
];

/* 網站上所有已上線的實驗（成就「全能物理學家」用）。新增實驗上線時一起更新。 */
window.LAB_LIVE_MODULES = ['projectile', 'collision', 'circular-motion', 'oscillation', 'slit-interference', 'refraction', 'electric-field', 'magnetic-particle', 'lens-mirror', 'doppler', 'standing-waves', 'capacitor', 'kepler', 'dc-circuit', 'photoelectric', 'faraday', 'radioactive-decay', 'hydrogen-spectrum', 'specific-heat', 'newton-second', 'incline-friction', 'ideal-gas', 'atwood', 'elevator', 'free-fall', 'ripple-tank', 'resonance-tube', 'refractive-index', 'e-over-m', 'ohms-law', 'equipotential', 'thin-lens', 'microwave', 'current-balance', 'measurement', 'angular-momentum', 'thin-film', 'moon-phases', 'earthquake', 'torque-balance', 'energy-coaster', 'seasons', 'current-magnetic-field', 'mendelian-inheritance', 'acid-base-titration', 'tides', 'conic-sections', 'molecular-shapes', 'diffusion-osmosis', 'trig-functions', 'reaction-rate', 'action-potential', 'cloud-formation', 'chemical-equilibrium', 'coriolis', 'galton-board', 'derivative', 'heat-engine', 'greenhouse', 'electrochemistry', 'space-vectors', 'population-growth', 'hardy-weinberg'];

/* 各實驗所屬的物理分支（成就「分支制霸」用）。新增實驗時一起加上。 */
window.LAB_MODULE_BRANCH = {
  'projectile': 'mech', 'collision': 'mech', 'newton-second': 'mech', 'incline-friction': 'mech', 'atwood': 'mech', 'elevator': 'mech', 'circular-motion': 'mech', 'oscillation': 'mech', 'kepler': 'mech',
  'ideal-gas': 'thermo', 'specific-heat': 'thermo',
  'standing-waves': 'wave', 'doppler': 'wave',
  'refraction': 'optics', 'lens-mirror': 'optics', 'slit-interference': 'optics',
  'electric-field': 'em', 'capacitor': 'em', 'dc-circuit': 'em', 'magnetic-particle': 'em', 'faraday': 'em',
  'photoelectric': 'modern', 'hydrogen-spectrum': 'modern', 'radioactive-decay': 'modern',
  'free-fall': 'mech',
  'ripple-tank': 'wave',
  'resonance-tube': 'wave',
  'refractive-index': 'optics',
  'e-over-m': 'modern',
  'ohms-law': 'em',
  'equipotential': 'em',
  'thin-lens': 'optics',
  'microwave': 'em',
  'current-balance': 'em',
  'measurement': 'mech',
  'angular-momentum': 'mech',
  'thin-film': 'optics',
  'moon-phases': 'astro',
  'earthquake': 'geo',
  'torque-balance': 'mech',
  'energy-coaster': 'mech',
  'seasons': 'astro',
  'current-magnetic-field': 'em',
  'mendelian-inheritance': 'genetics',
  // 化學
  'acid-base-titration': 'acidbase',
  'molecular-shapes': 'matter',
  'reaction-rate': 'equilibrium',
  'chemical-equilibrium': 'equilibrium',
  'electrochemistry': 'acidbase',
  // 生物
  'diffusion-osmosis': 'cell',
  'action-potential': 'physiology',
  'population-growth': 'ecology',
  'hardy-weinberg': 'evolution',
  'heat-engine': 'thermo',
  // 地球科學
  'cloud-formation': 'atmo',
  'coriolis': 'atmo',
  'greenhouse': 'atmo',
  'tides': 'ocean',
  'conic-sections': 'geometry',
  'trig-functions': 'geometry',
  'galton-board': 'probability',
  'space-vectors': 'vectors',
  'derivative': 'calculus'
};

/* 四個科目與各自的分支（各科排名、各科成就用）。順序就是畫面上的順序；新增科目的分支時一起更新。 */
window.LAB_SUBJECTS = [
  { id: 'phy', zh: '物理', en: 'Physics', branches: ['mech', 'thermo', 'wave', 'optics', 'em', 'modern'] },
  { id: 'chem', zh: '化學', en: 'Chemistry', branches: ['matter', 'reaction', 'equilibrium', 'acidbase', 'organic'] },
  { id: 'bio', zh: '生物', en: 'Biology', branches: ['cell', 'genetics', 'physiology', 'ecology', 'evolution'] },
  { id: 'earth', zh: '地球科學', en: 'Earth Science', branches: ['astro', 'geo', 'atmo', 'ocean'] },
  { id: 'math', zh: '數學', en: 'Mathematics', branches: ['algebra', 'geometry', 'vectors', 'probability', 'calculus'] }
];
/* 實驗代號 → 科目代號（phy、chem、bio、earth、math） */
window.LAB_SUBJECT_OF = function (moduleId) {
  const b = (window.LAB_MODULE_BRANCH || {})[moduleId];
  const S = window.LAB_SUBJECTS;
  for (let i = 0; i < S.length; i++) if (S[i].branches.indexOf(b) >= 0) return S[i].id;
  return 'phy';
};
