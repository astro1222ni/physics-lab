/* missions/greenhouse.js — 溫室效應與地球的能量平衡的任務（星星數 = 等級；隱藏任務 = 等級 × 2）
 *
 * 事件（js/greenhouse.js 只在使用者操作過之後才回報；載入頁面不算）：
 *   'state'：設定或溫度改變時（播放中每 0.25 秒一次），data = {
 *      S（太陽亮度 %，100 = 今天）, co2（ppm）, eps0（其他溫室氣體的紅外線吸收比例）, alpha0（反照率滑桿，冰回饋關閉時才用）,
 *      wv、ice（水氣回饋、冰反照率回饋是否開啟）,
 *      T（地表溫度 K）, N（能量不平衡 W/m²）, Teq（從現在的溫度出發最後會停下的平衡 K）,
 *      base（同樣設定但 CO₂ = 280 ppm 的平衡，即「1750 年」）, dT = T − base, dTeq = Teq − base,
 *      eq（|N| < 0.05 W/m² 且離平衡 0.05 K 內）, eps、alpha（實際的 ε、α）, iceFrac（冰覆蓋比例）, iceLat（冰緣緯度°）,
 *      snow（冰覆蓋 ≥ 95%：雪球地球）, t（年）,
 *      pathMax、pathMin（上一次手動設定溫度或清除之後，走過的最高、最低溫度 K）, wasSnow（這段路上曾經是雪球）}；
 *   'chart'、'view'、'cam'：切換圖表、3D 與視角。
 */
(function () {
  'use strict';
  if (!window.LabMission) return;

  const S = function (ev) { return ev.type === 'state' ? ev.data : null; };
  const near = function (a, b, tol) { return a != null && Math.abs(a - b) <= tol; };
  /** 今天的太陽、預設的 ε0、反照率 0.30（冰回饋開啟時 α 由溫度決定） */
  const std = function (d) { return near(d.S, 100, 0.25) && near(d.eps0, 0.779, 0.0015) && (d.ice || near(d.alpha0, 0.3, 0.0005)); };
  const doubled = function (d) { return d.co2 >= 555 && d.co2 <= 565; };

  LabMission.register('greenhouse', [
    {
      id: 'greenhouse-1', level: 1,
      title: { zh: '沒有毯子的地球', en: 'An Earth without its blanket' },
      desc: { zh: '關掉回饋，把 ε0 調成 0（大氣不吸收紅外線），反照率 0.30、太陽 100%，讓地表到達平衡：溫度應該在 254–256 K。', en: 'With the feedbacks off, set ε0 to 0 (no infrared absorbed), albedo 0.30 and the Sun at 100%, and let the surface reach equilibrium: it should be 254–256 K.' },
      check: function (ev) { const d = S(ev); return !!d && !d.ice && d.eps0 <= 0.0005 && near(d.alpha0, 0.3, 0.0005) && near(d.S, 100, 0.25) && d.eq && d.T >= 254 && d.T <= 256; }
    },
    {
      id: 'greenhouse-2', level: 2,
      title: { zh: '瞬間的輻射強迫', en: 'The instant radiative forcing' },
      desc: { zh: '從 1750 年的地球（太陽 100%、預設的 ε0 與反照率、地表 288 K）出發，把 CO2 加倍到 550–570 ppm，在溫度還沒改變之前，讓能量不平衡 N 落在 3.5–3.9 W/m²。', en: 'Starting from the Earth of 1750 (Sun 100%, default ε0 and albedo, surface 288 K), double CO2 to 550–570 ppm and, before the temperature has changed, get an energy imbalance N of 3.5–3.9 W/m².' },
      check: function (ev) { const d = S(ev); return !!d && std(d) && d.co2 >= 550 && d.co2 <= 570 && d.N >= 3.5 && d.N <= 3.9; }
    },
    {
      id: 'greenhouse-3', level: 3,
      title: { zh: '只有普朗克回應', en: 'Planck response only' },
      desc: { zh: '兩種回饋都關掉，CO2 加倍（555–565 ppm），太陽 100%、預設 ε0 與反照率，讓地球到達新的平衡：比 1750 年暖 1.0–1.3 K。', en: 'With both feedbacks off, double CO2 (555–565 ppm), Sun 100%, default ε0 and albedo, and let the Earth reach its new equilibrium: 1.0–1.3 K warmer than in 1750.' },
      check: function (ev) { const d = S(ev); return !!d && !d.wv && !d.ice && std(d) && doubled(d) && d.eq && d.dT >= 1.0 && d.dT <= 1.3; }
    },
    {
      id: 'greenhouse-4', level: 4,
      title: { zh: '給地球撐一把陽傘', en: 'A sunshade for the planet' },
      desc: { zh: '回饋都關掉，CO2 至少 550 ppm，太陽 100%、預設 ε0，只靠加大反照率（例如在高空灑反光的微粒），讓地球平衡在 288 K ± 0.05 K。', en: 'With the feedbacks off, CO2 at least 550 ppm, Sun 100% and default ε0, raise only the albedo (for example with reflective particles high in the sky) so the Earth settles at 288 K ± 0.05 K.' },
      check: function (ev) { const d = S(ev); return !!d && !d.wv && !d.ice && near(d.S, 100, 0.25) && near(d.eps0, 0.779, 0.0015) && d.co2 >= 550 && d.alpha0 > 0.3 && d.eq && near(d.T, 288, 0.05); }
    },
    {
      id: 'greenhouse-5', level: 4,
      title: { zh: '水氣把暖化放大', en: 'Water vapour amplifies the warming' },
      desc: { zh: '只打開水氣回饋，CO2 加倍（555–565 ppm），太陽 100%、預設 ε0 與反照率，到達平衡時比 1750 年暖 2.4–2.8 K。', en: 'With only the water-vapour feedback on, double CO2 (555–565 ppm), Sun 100%, default ε0 and albedo: at equilibrium the Earth is 2.4–2.8 K warmer than in 1750.' },
      check: function (ev) { const d = S(ev); return !!d && d.wv && !d.ice && std(d) && doubled(d) && d.eq && d.dT >= 2.4 && d.dT <= 2.8; }
    },
    {
      id: 'greenhouse-6', level: 5,
      title: { zh: '平衡氣候敏感度', en: 'Equilibrium climate sensitivity' },
      desc: { zh: '兩種回饋都打開，CO2 加倍（555–565 ppm），太陽 100%、預設 ε0，到達平衡時比 1750 年暖 2.8–3.1 K（接近 IPCC 的最佳估計 3 K）。', en: 'With both feedbacks on, double CO2 (555–565 ppm), Sun 100%, default ε0: at equilibrium the Earth is 2.8–3.1 K warmer than in 1750 (close to the IPCC best estimate of 3 K).' },
      check: function (ev) { const d = S(ev); return !!d && d.wv && d.ice && std(d) && doubled(d) && d.eq && d.dT >= 2.8 && d.dT <= 3.1; }
    },
    {
      id: 'greenhouse-7', level: 5,
      title: { zh: '守住 1.5 °C', en: 'Holding the line at 1.5 °C' },
      desc: { zh: '兩種回饋都打開，太陽 100%、預設 ε0，找出讓地球最後比 1750 年暖 1.5 K ± 0.05 K 的 CO2 濃度，並讓地球真的到達這個平衡。', en: 'With both feedbacks on, Sun 100% and default ε0, find the CO2 level at which the Earth ends up 1.5 K ± 0.05 K warmer than in 1750, and let it actually reach that equilibrium.' },
      check: function (ev) { const d = S(ev); return !!d && d.wv && d.ice && std(d) && d.eq && near(d.dT, 1.5, 0.05); }
    },
    {
      id: 'greenhouse-8', level: 6,
      title: { zh: '雪球地球', en: 'Snowball Earth' },
      desc: { zh: '打開兩種回饋，CO2 維持 1750 年的 280 ppm（± 5）、預設 ε0，從溫暖的地球（280 K 以上）出發，只把太陽調暗一點點（不低於 95%），再靠時間（播放或跳到平衡）讓冰一路擴張到赤道附近，冰覆蓋至少 95%。這就是臨界點：只差幾個百分比，整個地球就結冰。', en: 'With both feedbacks on, CO2 kept at the 1750 level of 280 ppm (± 5) and the default ε0, start from a warm Earth (above 280 K), dim the Sun only a little (not below 95%), then let time run (Play or Jump to equilibrium) until the ice spreads almost to the equator: at least 95% ice cover. This is a tipping point: a few percent, and the whole planet freezes.' },
      check: function (ev) { const d = S(ev); return !!d && d.ice && d.wv && near(d.co2, 280, 5) && near(d.eps0, 0.779, 0.0015) && d.S >= 95 && d.snow && d.pathMax >= 280; }
    },
    {
      id: 'greenhouse-9', level: 7,
      title: { zh: '回不去了', en: 'No way back' },
      desc: { zh: '讓溫暖的地球（280 K 以上）結成雪球之後，把太陽調回 100%（± 0.5%），讓它到達平衡：仍然是雪球地球。', en: 'After freezing a warm Earth (above 280 K) into a snowball, bring the Sun back to 100% (± 0.5%) and let it reach equilibrium: it is still a snowball.' },
      check: function (ev) { const d = S(ev); return !!d && d.ice && near(d.S, 100, 0.5) && d.snow && d.eq && d.pathMax >= 280; }
    },
    {
      id: 'greenhouse-10', level: 8,
      title: { zh: '火山的二氧化碳', en: 'Volcanic carbon dioxide' },
      desc: { zh: '冰反照率回饋打開、水氣回饋關掉、太陽不超過 100.5%：其他溫室氣體（ε0）維持預設，把雪球地球只靠累積 CO2 融化，讓它到達 285 K 以上的平衡。（真實的雪球地球，可能就是靠火山噴出的 CO2 慢慢累積才融化。）', en: 'With the ice-albedo feedback on, the water-vapour feedback off, the Sun no brighter than 100.5% and the other greenhouse gases (ε0) left at their default, melt a snowball Earth by piling up CO2 alone, until it reaches an equilibrium above 285 K. (The real snowball Earths may have melted this way, as volcanic CO2 slowly built up.)' },
      check: function (ev) { const d = S(ev); return !!d && d.ice && !d.wv && d.S <= 100.5 && near(d.eps0, 0.779, 0.0015) && d.wasSnow && d.eq && d.T >= 285; }
    },
    {
      id: 'greenhouse-11', level: 7,
      title: { zh: '黯淡的年輕太陽', en: 'The faint young Sun' },
      desc: { zh: '約 40 億年前的太陽只有今天的 75% 左右，地球卻有液態的海洋。打開冰反照率回饋、太陽調到 75% 以下，讓地球到達冰點以上（273.15 K 以上）的平衡。光靠 CO2 不夠的話，想想當時大氣裡還有哪些溫室氣體（例如甲烷，用 ε0 調整）。', en: 'About 4 billion years ago the Sun gave only about 75% of today’s light, yet the Earth had liquid oceans. With the ice-albedo feedback on and the Sun at 75% or less, bring the Earth to an equilibrium above freezing (above 273.15 K). If CO2 alone is not enough, think about what other greenhouse gases the early air held (methane, for example, set with ε0).' },
      check: function (ev) { const d = S(ev); return !!d && d.ice && d.S <= 75 && d.eq && d.T > 273.15; }
    },
    {
      id: 'greenhouse-h1', level: 4, hidden: true,
      riddle: { zh: '一點光也不還，一點熱也不放。', en: 'Give back no light; let out no heat.' },
      check: function (ev) { const d = S(ev); return !!d && d.alpha <= 0.005 && d.eps >= 0.995 && d.eq && d.T >= 330; }
    },
    {
      id: 'greenhouse-h2', level: 6, hidden: true,
      riddle: { zh: '陽光多了一成，冰仍不肯讓步；連空氣裡的水，也站在冰那邊。', en: 'A tenth more sunlight, and still the ice will not yield; even the water in the air takes the ice’s side.' },
      check: function (ev) { const d = S(ev); return !!d && d.ice && d.wv && d.S >= 110 && d.snow && d.eq; }
    },
    {
      id: 'greenhouse-h3', level: 5, hidden: true,
      riddle: { zh: '白色停在極圈的門口。', en: 'The white stops at the polar circle’s door.' },
      check: function (ev) { const d = S(ev); return !!d && d.ice && d.eq && d.iceLat >= 66 && d.iceLat <= 67; }
    }
  ]);
})();
