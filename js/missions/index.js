/*
 * missions/index.js — 所有有任務的模組清單（排行榜頁用來載入全部任務檔）
 * 新增某模組的任務時，在這裡加上它的代號與名稱。
 */
window.LAB_MISSION_MODULES = [
  { id: 'projectile', zh: '拋體運動', en: 'Projectile Motion' },
  { id: 'lens-mirror', zh: '透鏡與面鏡成像', en: 'Images in Lenses and Mirrors' },
  { id: 'doppler', zh: '都卜勒效應', en: 'The Doppler Effect' }
];

/* 網站上所有已上線的實驗（成就「全能物理學家」用）。新增實驗上線時一起更新。 */
window.LAB_LIVE_MODULES = ['projectile', 'collision', 'circular-motion', 'oscillation', 'slit-interference', 'refraction', 'electric-field', 'magnetic-particle', 'lens-mirror', 'doppler'];
