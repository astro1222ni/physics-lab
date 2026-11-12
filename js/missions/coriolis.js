/* missions/coriolis.js — 科氏力與大氣的運動的任務（星星數 = 等級 1–10）
 *
 * 事件（js/coriolis.js 只在使用者操作過之後才回報；載入頁面不算）：
 *   轉盤
 *   'land'：球離開盤面，data = { spin（1 逆時針、−1 順時針）, rpm（每分鐘圈數）, v0（m/s）, aim（度）, r0（m）,
 *            miss（落點與目標的角度，正＝偏左、負＝偏右，從發射器看）, T（在盤上的時間 s）, V（慣性座標的速率 m/s）}；
 *   'still'：球一直沒有離開盤面（盤上看繞完一圈才回報），data = { spin, rpm, v0, aim, r0, V, t }；
 *   地球上的風（每團空氣各自保留放出時的設定）
 *   'release'：放出一團空氣，data = { lat, k（×10⁻⁵ s⁻¹）, field, v0, dir }；
 *   'parcel'：每 3 小時（模擬時間）、風向轉滿一圈、進到低壓中心 50 km 內、結束時回報，data 由 CoriolisCore.snapshot 算出：
 *            { id, t（h）, lat, k（×10⁻⁵ s⁻¹）, field（'none'|'uniform'|'low'|'high'）, G, dp, speed, vg, v0,
 *              alpha（吹向低壓的角度°）, deflect（相對氣壓梯度力往右偏的角度°）, r, r0, minR（km）,
 *              winding（繞中心的圈數，逆時針為正）, turns（風向轉的圈數）, loopT（風向第一次轉滿一圈的時間 h）,
 *              maxOff（進到中心之前偏離「直指中心」的最大角度°）, dirDev（與初速方向的最大差°）, spdErr（與地轉風速的最大相對差）, vmax }；
 *   'view'、'cam'：切換 3D 與按下視角按鈕。
 */
(function () {
  'use strict';
  if (!window.LabMission) return;

  const P = function (ev) { return ev.type === 'parcel' ? ev.data : null; };
  const near = function (a, b, tol) { return a != null && Math.abs(a - b) <= tol; };

  LabMission.register('coriolis', [
    {
      id: 'coriolis-1', level: 1,
      title: { zh: '轉盤上的一球', en: 'A ball on the turntable' },
      desc: { zh: '讓轉盤轉起來，推出一顆球，比較左右兩個畫面：同一顆球，兩種看法。', en: 'Spin the turntable and launch a ball. Compare the two panels: one ball, two points of view.' },
      check: function (ev) { return ev.type === 'land' && ev.data.rpm > 0; }
    },
    {
      id: 'coriolis-2', level: 2,
      title: { zh: '往右偏', en: 'Turned to the right' },
      desc: { zh: '在北半球（緯度 10° 以上）選平直等壓線，讓一團靜止的空氣出發，等到它的風向往氣壓梯度力的右邊偏 45° 以上。', en: 'In the northern hemisphere (latitude 10° or more) with straight isobars, release a parcel from rest and wait until its wind has turned at least 45° to the right of the pressure-gradient force.' },
      check: function (ev) {
        const d = P(ev);
        return !!d && d.field === 'uniform' && d.lat >= 10 && d.v0 === 0 && d.deflect != null && d.deflect >= 45;
      }
    },
    {
      id: 'coriolis-3', level: 3,
      title: { zh: '赤道上直直走', en: 'Straight in at the equator' },
      desc: { zh: '在赤道上的低氣壓旁讓一團靜止的空氣出發：它不轉彎，直直衝到中心 30 km 內。', en: 'At the equator, release a parcel from rest near a low: it does not turn and rushes straight to within 30 km of the centre.' },
      check: function (ev) {
        const d = P(ev);
        return !!d && Math.abs(d.lat) < 0.5 && d.field === 'low' && d.v0 === 0 && d.r0 > 100 && d.minR < 30 && d.maxOff < 2;
      }
    },
    {
      id: 'coriolis-4', level: 4,
      title: { zh: '瞄準會跑的目標', en: 'Aim at a moving target' },
      desc: { zh: '轉盤每分鐘至少 10 圈，調整瞄準角，讓球的落點與目標相差 2° 以內。', en: 'With the turntable at 10 turns per minute or more, adjust the aim so the ball lands within 2° of the target.' },
      check: function (ev) { return ev.type === 'land' && ev.data.rpm >= 10 && Math.abs(ev.data.miss) <= 2; }
    },
    {
      id: 'coriolis-5', level: 3,
      title: { zh: '逆時針的低氣壓', en: 'An anticlockwise low' },
      desc: { zh: '在北半球（緯度 10° 以上）的低氣壓旁放出空氣，讓它繞著中心逆時針轉滿一圈。', en: 'In the northern hemisphere (latitude 10° or more), release air near a low and let it circle the centre once, anticlockwise.' },
      check: function (ev) { const d = P(ev); return !!d && d.field === 'low' && d.lat >= 10 && d.winding >= 1; }
    },
    {
      id: 'coriolis-6', level: 5,
      title: { zh: '順時針的盤，往左偏', en: 'Clockwise turntable, turned left' },
      desc: { zh: '讓轉盤順時針轉（每分鐘至少 10 圈），從中心正對目標發射：球落在目標左邊至少 10°。', en: 'Spin the turntable clockwise (10 turns per minute or more) and launch from the centre straight at the target: the ball lands at least 10° to the left.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'land' && d.spin === -1 && d.rpm >= 10 && d.r0 === 0 && Math.abs(d.aim) <= 0.5 && d.miss >= 10;
      }
    },
    {
      id: 'coriolis-7', level: 5,
      title: { zh: '地轉風', en: 'The geostrophic wind' },
      desc: { zh: '平直等壓線、沒有摩擦，給空氣剛好的初速，讓它 24 小時都沿著等壓線吹：方向變化小於 3°、風速與地轉風相差不到 3%。', en: 'With straight isobars and no friction, give the parcel exactly the right starting wind so it blows along the isobars for 24 hours: direction changes by less than 3° and speed stays within 3% of the geostrophic wind.' },
      check: function (ev) {
        const d = P(ev);
        return !!d && d.field === 'uniform' && d.k === 0 && d.v0 > 0 && d.t >= 24 && d.dirDev < 3 && d.spdErr != null && d.spdErr < 0.03;
      }
    },
    {
      id: 'coriolis-8', level: 5,
      title: { zh: '順時針的高氣壓', en: 'A clockwise high' },
      desc: { zh: '在北半球（緯度 10° 以上）的高氣壓旁放出空氣，讓它繞著中心順時針轉滿一圈。', en: 'In the northern hemisphere (latitude 10° or more), release air near a high and let it circle the centre once, clockwise.' },
      check: function (ev) { const d = P(ev); return !!d && d.field === 'high' && d.lat >= 10 && d.winding <= -1; }
    },
    {
      id: 'coriolis-9', level: 6,
      title: { zh: '一天一圈', en: 'One circle a day' },
      desc: { zh: '沒有氣壓差、沒有摩擦，給空氣一個初速，調整緯度，讓它的風向轉滿一圈剛好用 24.0 小時（誤差 0.05 小時以內）。', en: 'With no pressure difference and no friction, give the parcel a starting wind and choose the latitude so its wind direction turns once around in 24.0 hours (within 0.05 h).' },
      check: function (ev) { const d = P(ev); return !!d && d.field === 'none' && d.k === 0 && near(d.loopT, 24, 0.05); }
    },
    {
      id: 'coriolis-10', level: 6,
      title: { zh: '摩擦讓風斜吹', en: 'Friction tilts the wind' },
      desc: { zh: '平直等壓線，調整摩擦，讓空氣吹了 48 小時以後，穿過等壓線偏向低壓 30°（誤差 1° 以內）。', en: 'With straight isobars, adjust the friction so that after 48 hours the wind crosses the isobars toward low pressure at 30° (within 1°).' },
      check: function (ev) { const d = P(ev); return !!d && d.field === 'uniform' && d.t >= 48 && near(d.alpha, 30, 1); }
    },
    {
      id: 'coriolis-11', level: 7,
      title: { zh: '颱風眼', en: 'Into the eye' },
      desc: { zh: '在北半球的低氣壓，48 小時內讓一團空氣逆時針繞中心至少 2 圈，並且進到中心 50 km 內。', en: 'Around a northern-hemisphere low, within 48 hours, make a parcel circle the centre anticlockwise at least twice and reach within 50 km of it.' },
      check: function (ev) {
        const d = P(ev);
        return !!d && d.field === 'low' && d.lat >= 5 && d.k > 0 && d.t <= 48 && d.winding >= 2 && d.minR < 50;
      }
    },
    {
      id: 'coriolis-12', level: 8,
      title: { zh: '南半球的氣旋', en: 'A southern cyclone' },
      desc: { zh: '在南半球的低氣壓，72 小時內讓一團空氣順時針繞中心至少 3 圈，並且進到中心 30 km 內。', en: 'Around a southern-hemisphere low, within 72 hours, make a parcel circle the centre clockwise at least three times and reach within 30 km of it.' },
      check: function (ev) {
        const d = P(ev);
        return !!d && d.field === 'low' && d.lat <= -5 && d.k > 0 && d.t <= 72 && d.winding <= -3 && d.minR < 30;
      }
    },
    {
      id: 'coriolis-h1', level: 5, hidden: true,
      riddle: { zh: '站在軸上，一圈只要半天。', en: 'Standing on the axis, one turn takes half a day.' },
      check: function (ev) { const d = P(ev); return !!d && d.field === 'none' && d.k === 0 && near(d.loopT, 11.97, 0.01); }
    },
    {
      id: 'coriolis-h2', level: 5, hidden: true,
      riddle: { zh: '什麼都不做，也會被世界帶著繞圈。', en: 'Do nothing, and the world still carries you round.' },
      check: function (ev) { const d = ev.data; return ev.type === 'still' && d.rpm >= 5 && d.r0 >= 0.3 && d.V < 0.02; }
    },
    {
      id: 'coriolis-h3', level: 5, hidden: true,
      riddle: { zh: '沒有人拉住它，它就一直奔向遠方。', en: 'With nothing to hold it back, it runs on and on.' },
      check: function (ev) { const d = P(ev); return !!d && d.field === 'uniform' && Math.abs(d.lat) < 0.5 && d.k === 0 && d.speed >= 100; }
    }
  ]);
})();
