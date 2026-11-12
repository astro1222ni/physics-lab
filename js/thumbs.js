/*
 * thumbs.js — 首頁實驗卡片縮圖：依目前的語言（繁體／简体／English）與深淺色挑選對應的圖。
 * 圖與下面的版本表由 tools/make-thumbs.cjs 產生（npm run thumbs）；切換深淺色時立即換圖。
 */
(function () {
  'use strict';
  /* VERSIONS-BEGIN（由 tools/make-thumbs.cjs 自動產生，請勿手改） */
  const V = {
    "projectile": "2eecfc7c",
    "collision": "93fc727f",
    "circular-motion": "dfd21191",
    "oscillation": "73929225",
    "slit-interference": "ec9b5963",
    "refraction": "d84a32c2",
    "electric-field": "b7e04e19",
    "magnetic-particle": "ee92db45",
    "lens-mirror": "7df939c4",
    "doppler": "1452e117",
    "standing-waves": "aa517698",
    "capacitor": "1892a216",
    "kepler": "17a7f186",
    "dc-circuit": "3ea253ed",
    "photoelectric": "6a41d850",
    "faraday": "3d4fb57b",
    "radioactive-decay": "bcb9ed98",
    "hydrogen-spectrum": "8a24406b",
    "specific-heat": "92ca1070",
    "newton-second": "fb0e93b7",
    "incline-friction": "08f0de28",
    "ideal-gas": "62823f96",
    "atwood": "d3000b22",
    "elevator": "4c195732",
    "free-fall": "496f9a81",
    "ripple-tank": "c79a5e50",
    "resonance-tube": "f3474858",
    "refractive-index": "6b7eda7b",
    "e-over-m": "16c2176f",
    "ohms-law": "bd00af88",
    "equipotential": "b622662f",
    "thin-lens": "0dca541f",
    "microwave": "6fd86cc6",
    "current-balance": "26bbe3fc",
    "measurement": "c65e2ff7",
    "angular-momentum": "aa95a15f",
    "thin-film": "1cc1aa1a",
    "moon-phases": "845630f1",
    "earthquake": "d5e6194a",
    "torque-balance": "857c6b3d",
    "energy-coaster": "47981b92",
    "seasons": "d9138d00",
    "current-magnetic-field": "fb726177",
    "mendelian-inheritance": "ca6f2c4f",
    "acid-base-titration": "be286dd9",
    "tides": "effa63c4"
  };
  /* VERSIONS-END */

  const lang = (window.LabSettings && window.LabSettings.lang) || 'zh-Hant';
  const L = lang === 'en' ? 'en' : lang === 'zh-Hans' ? 'hans' : 'hant';
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function isDark() {
    const t = document.documentElement.getAttribute('data-theme');
    return t ? t === 'dark' : !!(mq && mq.matches);
  }
  function apply() {
    const theme = isDark() ? 'dark' : 'light';
    document.querySelectorAll('img.module-thumb[data-thumb]').forEach(function (img) {
      const s = img.getAttribute('data-thumb');
      if (!V[s]) { img.hidden = true; return; }
      const src = 'img/thumbs/' + s + '-' + L + '-' + theme + '.webp?v=' + V[s];
      if (img.getAttribute('src') !== src) img.setAttribute('src', src);
    });
  }
  apply();
  window.LabThumbs = { apply: apply }; // 實驗頁的「相關實驗」（classroom.js）插入卡片後呼叫
  window.addEventListener('lab:themechange', apply);
  if (mq) {
    if (mq.addEventListener) mq.addEventListener('change', apply);
    else if (mq.addListener) mq.addListener(apply);
  }
})();
