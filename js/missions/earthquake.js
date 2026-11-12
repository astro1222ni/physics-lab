/* missions/earthquake.js — 地震波與震央定位的任務（星星數 = 等級 1–10） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/earthquake.js 發出；距離 km、時間 s、角度用度）：
  //   quake1：模式一，按「播放／發生地震」後播完一次（自動播放不算）
  //           { h, x（震央距離 Δ）, R, vp, vs, ratio, tP, tS, sp（S−P）, tR, medium: 'liquid' | 'solid' }
  //   chain：模式一，使用者播放時長條裡的 S 波脈衝撞到界面、反射完畢 { medium, vp, vs, rP, tP, rS, tS }
  //   params1：模式一，放開滑桿、打完數字或切換長條右半段 { vp, vs, ratio, nu（帕松比）, h, x, medium, prev }
  //   locate：模式二按「定位」{ n（用了幾站）, err（估計震央與真實震央的距離）, hEst, hTrue, depthErr, candidates（1 或 2）,
  //           collinear, lineOff, manual（全部游標都是自己拖的、這個地震沒用過自動判讀）, auto, revealed（定位時真實震央已顯示）,
  //           source: 'random' | 'manual' | 'preset', errMode, k, vpc, vsc, rms }
  //   reveal：模式二按「顯示真實震央」{ source }
  //   ray3：模式三，放開「出射角」滑桿（目前顯示的每一種波各一個）{ wave: 'P' | 'S', takeoff, phase, turnR（最深處的半徑）, deepest, delta, blocked }
  //   station3：模式三，放開測站（拖曳或滑桿）{ deg, P（收得到 P 或 PKP）, S（收得到直接 S 波）, IK（收得到 PKIKP）, inner, wave, sMax, pMax, pkpMin }
  const R_CMB = 3480;
  const own = function (d) { return d.manual && !d.auto && !d.revealed; }; // 自己量、還沒看答案

  LabMission.register('earthquake', [
    {
      id: 'earthquake-1', level: 1,
      title: { zh: '過不了水的 S 波', en: 'S waves can’t cross water' },
      desc: { zh: '長條右半段選「液體（水）」，按「發生地震」，看 S 波脈衝撞上水面後全部反射回來。', en: 'Set the right half of the strip to “Liquid (water)”, press “Make an earthquake” and watch the S pulse bounce back completely from the water.' },
      check: function (ev) { return ev.type === 'chain' && ev.data.medium === 'liquid'; }
    },
    {
      id: 'earthquake-2', level: 3,
      title: { zh: '相差 5 秒', en: 'Five seconds apart' },
      desc: { zh: '調整震源深度或測站位置，讓地震儀量到的 S−P 時間差是 5.00 秒（±0.05 s），並播完一次地震。', en: 'Adjust the focal depth or the station position so that the seismometer records an S−P time of 5.00 s (±0.05 s), and play a whole earthquake.' },
      check: function (ev) { return ev.type === 'quake1' && Math.abs(ev.data.sp - 5) <= 0.05; }
    },
    {
      id: 'earthquake-3', level: 3,
      title: { zh: '典型的岩石', en: 'A typical rock' },
      desc: { zh: '調整地殼的 P 波與 S 波速度，讓 VP/VS = √3（帕松比 0.25；誤差 ±0.005）。', en: 'Adjust the P- and S-wave speeds of the crust so that VP/VS = √3 (Poisson’s ratio 0.25; within ±0.005).' },
      check: function (ev) { return ev.type === 'params1' && Math.abs(ev.data.ratio - Math.sqrt(3)) <= 0.005; }
    },
    {
      id: 'earthquake-4', level: 3,
      title: { zh: '兩站不夠', en: 'Two stations are not enough' },
      desc: { zh: '測站數選 2，量好兩站的 S−P 後按「定位」，看兩個圓交出兩個可能的震央。', en: 'Choose 2 stations, measure both S−P times and press “Locate”: the two circles give two possible epicenters.' },
      check: function (ev) { return ev.type === 'locate' && ev.data.n === 2 && ev.data.candidates === 2; }
    },
    {
      id: 'earthquake-5', level: 5,
      title: { zh: '三站定震央', en: 'Three stations, one epicenter' },
      desc: { zh: '隨機地震、還沒顯示真實震央時，自己拖曳游標量 3 個測站的 S−P 並定位，震央誤差在 10 km 以內（不可用自動判讀）。', en: 'For a random earthquake whose epicenter is still hidden, place the cursors yourself at 3 stations and locate it to within 10 km (no auto-pick).' },
      check: function (ev) { const d = ev.data; return ev.type === 'locate' && d.n === 3 && d.candidates === 1 && own(d) && d.err <= 10; }
    },
    {
      id: 'earthquake-6', level: 6,
      title: { zh: '鏡子裡的震央', en: 'The epicenter in the mirror' },
      desc: { zh: '把 3 個以上的測站拖成一直線再定位，得到以那條直線為鏡子、左右對稱的兩個答案。', en: 'Drag 3 or more stations into a straight line and locate: you get two answers, mirror images across that line.' },
      check: function (ev) { const d = ev.data; return ev.type === 'locate' && d.n >= 3 && d.collinear && d.candidates === 2; }
    },
    {
      id: 'earthquake-7', level: 7,
      title: { zh: '有雜訊的真實世界', en: 'The noisy real world' },
      desc: { zh: '打開「含誤差」，隨機地震、還沒顯示真實震央時，自己量 3 站以上並定位，震央誤差在 20 km 以內。', en: 'With “Include errors” on, for a random earthquake whose epicenter is still hidden, measure 3 or more stations yourself and locate it to within 20 km.' },
      check: function (ev) { const d = ev.data; return ev.type === 'locate' && d.errMode && d.n >= 3 && d.candidates === 1 && own(d) && d.err <= 20; }
    },
    {
      id: 'earthquake-8', level: 8,
      title: { zh: '連深度一起定', en: 'Depth as well' },
      desc: { zh: '震源深度至少 15 km 的隨機地震（還沒顯示真實震央），自己量 3 站以上定位：震央誤差 10 km 以內、深度誤差 4 km 以內。', en: 'For a random earthquake at least 15 km deep (epicenter still hidden), measure 3 or more stations yourself: epicenter within 10 km and depth within 4 km.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'locate' && d.n >= 3 && d.candidates === 1 && own(d) && d.hTrue >= 15 && d.err <= 10 && d.depthErr <= 4;
      }
    },
    {
      id: 'earthquake-9', level: 10,
      title: { zh: '步步逼近', en: 'Closing in' },
      desc: { zh: '打開「含誤差」，隨機地震、還沒顯示真實震央時，自己量 4 站以上定位，震央與深度的誤差都在 3 km 以內。提示：先粗定位，再把測站移近。', en: 'With “Include errors” on, for a random earthquake whose epicenter is still hidden, measure 4 or more stations yourself and get both the epicenter and the depth to within 3 km. Hint: locate roughly first, then move the stations closer.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'locate' && d.errMode && d.n >= 4 && d.candidates === 1 && own(d) && d.err <= 3 && d.depthErr <= 3;
      }
    },
    {
      id: 'earthquake-10', level: 2,
      title: { zh: '被外核擋下', en: 'Stopped by the outer core' },
      desc: { zh: '在「地球內部與陰影區」調整出射角，讓標示的 S 波射線一路走到液態外核、被擋下來。', en: 'In “Earth’s interior”, set the take-off angle so the highlighted S ray reaches the liquid outer core and is stopped.' },
      check: function (ev) { return ev.type === 'ray3' && ev.data.wave === 'S' && ev.data.blocked; }
    },
    {
      id: 'earthquake-11', level: 4,
      title: { zh: 'S 波陰影區的邊界', en: 'Edge of the S shadow' },
      desc: { zh: '把測站放在剛好收不到 S 波的地方：在 S 波陰影區裡，但離邊界不到 2°。', en: 'Put the station where the S wave just stops arriving: inside the S shadow zone, less than 2° from its edge.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'station3' && !d.S && d.deg >= d.sMax && d.deg <= d.sMax + 2;
      }
    },
    {
      id: 'earthquake-12', level: 6,
      title: { zh: '雷曼的發現', en: 'Lehmann’s discovery' },
      desc: { zh: '找一個 P 波、S 波都收不到，卻收得到穿過內核的微弱 P 波（PKIKP）的測站位置。', en: 'Find a station position that receives neither P nor S waves, yet does receive the faint P wave that crossed the inner core (PKIKP).' },
      check: function (ev) { const d = ev.data; return ev.type === 'station3' && !d.P && !d.S && d.IK; }
    },
    {
      id: 'earthquake-h1', level: 6, hidden: true,
      riddle: { zh: '它俯身吻過深淵的邊緣，又全身而退。', en: 'It leans down to kiss the rim of the abyss, and slips away unharmed.' },
      check: function (ev) { const d = ev.data; return ev.type === 'ray3' && d.wave === 'P' && d.phase === 'P' && d.turnR - R_CMB <= 25; }
    },
    {
      id: 'earthquake-h2', level: 5, hidden: true,
      riddle: { zh: '有一種石頭，被拉長時反而變胖。', en: 'There is a stone that grows fatter when you stretch it.' },
      check: function (ev) { return ev.type === 'params1' && ev.data.nu < 0; }
    },
    {
      id: 'earthquake-h3', level: 3, hidden: true,
      riddle: { zh: '穿過一切，抵達腳底下的另一面。', en: 'Through everything, to the far side beneath your feet.' },
      check: function (ev) { return ev.type === 'station3' && ev.data.deg >= 179.5 && ev.data.IK; }
    }
  ]);
})();
