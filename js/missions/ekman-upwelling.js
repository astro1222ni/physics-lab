/* missions/ekman-upwelling.js — 洋流與氣候：艾克曼輸送、湧升流與聖嬰 的任務（星星數 = 等級；隱藏任務 = 等級 × 2）
 *
 * 事件（js/ekman-upwelling.js 只在使用者操作過之後才回報；載入頁面不算）：
 *   'spiral'：data = { lat（南半球為負）, U, windFrom, Av, z（探測深度 m）, f, tau, V0（表面流 m/s）, DE（艾克曼深度 m）, M（淨輸送 m²/s）,
 *                     windTo, surfAz, transAz, probeAz, probeSpeed, probeTurn（探測深度的流向比表面流多轉幾度，−180–180） }；
 *   'coast'：data = { lat, U, windFrom, coast（'W' 海在西邊／'E' 海在東邊）, H1（表層暖水厚度 m）, days, Moff（離岸輸送 m²/s，負＝向岸）,
 *                    bakun（湧升指數 m³/s／100 m）, w、wDay（岸邊湧升速度 m/s、m／天）, Rd, eta0（岸邊溫躍層抬升 m）, out（冷水露頭）,
 *                    front（露頭位置離岸 m）, sst0（岸邊海溫 °C）, no3（岸邊表層硝酸鹽 μmol/L）, tOut（露頭的天數）, playing }；
 *   'equator'：data = { p（信風應力是平常的幾倍）, U, tau, hW、hE（溫躍層深度 m）, deta（西減東的海面高度差 m）, sstE、sstW, anom（東太平洋海溫距平）,
 *                      state（'nino'／'neutral'／'nina'）, outcrop（溫躍層露出海面） }；
 *   'view'、'cam'：切換 3D 與視角。
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const Sp = function (ev) { return ev.type === 'spiral' && ev.data.U >= 1 ? ev.data : null; };
  const Co = function (ev) { return ev.type === 'coast' && ev.data.U >= 1 ? ev.data : null; };
  const Eq = function (ev) { return ev.type === 'equator' ? ev.data : null; };

  LabMission.register('ekman-upwelling', [
    {
      id: 'ekman-upwelling-1', level: 1,
      title: { zh: '南半球的螺旋', en: 'A Southern Hemisphere spiral' },
      desc: { zh: '切到南半球，選一個風向，讓淨艾克曼輸送往北流（偏差 10° 內）。表面流和淨輸送偏到風的哪一邊？', en: 'Switch to the Southern Hemisphere and choose a wind direction that makes the net Ekman transport flow north (within 10°). Which side of the wind do the surface current and the transport turn to?' },
      check: function (ev) { const d = Sp(ev); return !!d && d.lat <= -5 && Math.abs(((d.transAz + 540) % 360) - 180) <= 10; }
    },
    {
      id: 'ekman-upwelling-2', level: 2,
      title: { zh: '艾克曼深度 100 m', en: 'An Ekman depth of 100 m' },
      desc: { zh: '調緯度或渦黏滯係數，讓艾克曼深度 D_E 剛好是 100 m（誤差 1 m 內）。', en: 'Adjust the latitude or the eddy viscosity so the Ekman depth D_E is exactly 100 m (within 1 m).' },
      check: function (ev) { const d = Sp(ev); return !!d && Math.abs(d.DE - 100) <= 1; }
    },
    {
      id: 'ekman-upwelling-3', level: 3,
      title: { zh: '表面流 20 cm/s', en: 'A 20 cm/s surface current' },
      desc: { zh: '讓海面的海流速度剛好是 20 cm/s（誤差 0.5 cm/s 內）。', en: 'Make the current at the sea surface exactly 20 cm/s (within 0.5 cm/s).' },
      check: function (ev) { const d = Sp(ev); return !!d && Math.abs(d.V0 - 0.2) <= 0.005; }
    },
    {
      id: 'ekman-upwelling-4', level: 3,
      title: { zh: '每公尺 1 立方公尺', en: 'One cubic metre per metre' },
      desc: { zh: '讓淨艾克曼輸送剛好是 1.00 m²/s（誤差 0.02 內）：每 1 m 寬的海面，每秒搬走 1 m³ 的海水。', en: 'Make the net Ekman transport exactly 1.00 m²/s (within 0.02): every metre-wide strip of sea carries 1 m³ of water each second.' },
      check: function (ev) { const d = Sp(ev); return !!d && Math.abs(d.M - 1) <= 0.02; }
    },
    {
      id: 'ekman-upwelling-5', level: 3,
      title: { zh: '秘魯的湧升', en: 'Upwelling off Peru' },
      desc: { zh: '切到「沿岸湧升」：南緯 5°–20°、海在西邊的海岸（像秘魯），吹東南到南風（風從 120°–200° 吹來），讓湧升指數至少 100 m³/s，並讓岸邊海溫降到 15 °C 以下。', en: 'In “Coastal upwelling”, on a coast at 5°–20°S with the sea to the west (like Peru), with a south-east to south wind (blowing from 120°–200°), get an upwelling index of at least 100 m³/s and cool the coastal water below 15 °C.' },
      check: function (ev) { const d = Co(ev); return !!d && d.lat <= -5 && d.lat >= -20 && d.coast === 'W' && d.windFrom >= 120 && d.windFrom <= 200 && d.bakun >= 100 && d.sst0 <= 15; }
    },
    {
      id: 'ekman-upwelling-6', level: 3,
      title: { zh: '臺灣東岸的西南季風', en: 'The south-west monsoon off eastern Taiwan' },
      desc: { zh: '北半球、海在東邊的海岸，吹西南風（風從 215°–235° 吹來），讓湧升指數至少 50 m³/s。夏季的西南季風會讓臺灣東岸湧升嗎？', en: 'On a Northern Hemisphere coast with the sea to the east, with a south-westerly wind (blowing from 215°–235°), get an upwelling index of at least 50 m³/s. Does the summer south-west monsoon cause upwelling off eastern Taiwan?' },
      check: function (ev) { const d = Co(ev); return !!d && d.lat > 0 && d.coast === 'E' && d.windFrom >= 215 && d.windFrom <= 235 && d.bakun >= 50; }
    },
    {
      id: 'ekman-upwelling-7', level: 4,
      title: { zh: '厚暖水下的冷水', en: 'Cold water under a thick warm layer' },
      desc: { zh: '把表層暖水設成至少 60 m 厚，讓冷水在 5 天內（含第 5 天）湧到岸邊海面。', en: 'Make the warm surface layer at least 60 m thick, and bring cold water to the surface at the coast within 5 days.' },
      check: function (ev) { const d = Co(ev); return !!d && d.H1 >= 60 && d.out && d.days <= 5; }
    },
    {
      id: 'ekman-upwelling-8', level: 3,
      title: { zh: '沿岸下沉', en: 'Coastal downwelling' },
      desc: { zh: '讓艾克曼輸送把表層水推向岸邊，湧升指數小於等於 −100 m³/s，並讓風吹至少 2 天。岸邊的海溫會變嗎？', en: 'Make the Ekman transport push surface water towards the coast, with an upwelling index of −100 m³/s or less, and let the wind blow for at least 2 days. Does the coastal temperature change?' },
      check: function (ev) { const d = Co(ev); return !!d && d.bakun <= -100 && d.days >= 2; }
    },
    {
      id: 'ekman-upwelling-9', level: 5,
      title: { zh: '一天 25 公尺', en: '25 metres a day' },
      desc: { zh: '讓岸邊的湧升速度剛好是每天 25 m（誤差 0.3 m 內）。', en: 'Make the upwelling speed at the coast exactly 25 m per day (within 0.3 m).' },
      check: function (ev) { const d = Co(ev); return !!d && d.w > 0 && Math.abs(d.wDay - 25) <= 0.3; }
    },
    {
      id: 'ekman-upwelling-10', level: 3,
      title: { zh: '中等強度的聖嬰', en: 'A moderate El Niño' },
      desc: { zh: '切到「赤道太平洋」，減弱信風（但仍往西吹），讓東太平洋比平常暖 1.0–1.5 °C（美國 NOAA 分級的中等強度聖嬰）。雨雲跑到哪裡了？', en: 'In “Equatorial Pacific”, weaken the trade winds (still blowing west) until the east Pacific is 1.0–1.5 °C warmer than normal (a moderate El Niño on NOAA’s scale). Where did the rain clouds go?' },
      check: function (ev) { const d = Eq(ev); return !!d && d.p > 0 && d.anom >= 1 && d.anom < 1.5; }
    },
    {
      id: 'ekman-upwelling-11', level: 4,
      title: { zh: '反聖嬰，但溫躍層還在水裡', en: 'La Niña, with the thermocline still submerged' },
      desc: { zh: '增強信風，讓東太平洋比平常冷 0.5 °C 以上（類似反聖嬰），但東邊的溫躍層還沒露出海面。', en: 'Strengthen the trade winds until the east Pacific is at least 0.5 °C colder than normal (La Niña-like), without the eastern thermocline reaching the surface.' },
      check: function (ev) { const d = Eq(ev); return !!d && d.state === 'nina' && !d.outcrop; }
    },
    {
      id: 'ekman-upwelling-12', level: 4,
      title: { zh: '海面差半公尺', en: 'Half a metre of sea level' },
      desc: { zh: '調信風，讓西太平洋的海面剛好比東太平洋高 50 cm（誤差 1 cm 內）。', en: 'Adjust the trade winds so the sea surface in the west Pacific stands exactly 50 cm higher than in the east (within 1 cm).' },
      check: function (ev) { const d = Eq(ev); return !!d && Math.abs(d.deta - 0.5) <= 0.01; }
    },
    {
      id: 'ekman-upwelling-h1', level: 3, hidden: true,
      riddle: { zh: '在最深的地方，水往回走。', en: 'Down at the bottom, the water turns back.' },
      check: function (ev) { const d = Sp(ev); return !!d && Math.abs(d.probeTurn) >= 179; }
    },
    {
      id: 'ekman-upwelling-h2', level: 3, hidden: true,
      riddle: { zh: '東邊的海，比西邊高出一把尺。', en: 'The eastern sea stands a ruler’s length above the west.' },
      check: function (ev) { const d = Eq(ev); return !!d && Math.abs(d.deta + 0.3) <= 0.015; }
    },
    {
      id: 'ekman-upwelling-h3', level: 4, hidden: true,
      riddle: { zh: '三天之內，把深海的肥料送上海面。', en: 'Within three days, bring the fertiliser of the deep up to the surface.' },
      check: function (ev) { const d = Co(ev); return !!d && d.no3 >= 20 && d.days <= 3; }
    }
  ]);
})();
