/* missions/sun-energy.js — 太陽的能量：光度、太陽常數與核融合的任務（星星數 = 等級；隱藏任務 = 等級 × 2）
 *
 * 事件（js/sun-energy.js 只在使用者操作過之後才回報；載入頁面不算）：
 *   'state'：任何設定改變時；'run'：動畫播完一次（光度：一道光走到距離 d；地面：水盒曬完；核融合：看完一次 pp 鏈）。data 都是 {
 *      mode（'flux' 光度與太陽常數、'ground' 在地面量、'fusion' 核融合）, star（預設恆星的代號；自己調過就是 ''）,
 *      R（太陽半徑）, T（表面溫度 K）, M（太陽質量）, L（光度，以今天的太陽為 1）, d（距離 AU）, inside（距離在恆星裡面）,
 *      S（距離 d 處每平方公尺的功率 W/m²；在恆星裡面是 null）, Srel（S ÷ 今天地球的 1361 W/m²）, lam（輻射最強的波長 nm）,
 *      tLight（光走到 d 的秒數）, nuCm2（每平方公分每秒穿過的微中子數）,
 *      h（太陽高度角 °）, tau（大氣光學厚度）, alpha（水盒吸收率）, mw（水 g）, dur（曬的時間 min）,
 *      m（大氣質量）, Ig（地面照度 W/m²）, Iest（用水溫算出的照度 CΔT/(A·t)）, dT（水溫上升 °C）, P（吸收功率 W）,
 *      eqFrac（水溫上升 ÷ 平衡時的上升；1 是完全平衡）,
 *      lg（Langley 法：同一個 τ 的紀錄的直線 { n, S0, tau, r2, mMin, mMax }；不到兩種 m 是 null）, nrec,
 *      f（燒掉的質量比例）, rate（每秒的反應數）, dm（每秒少掉的質量 kg）, H（每秒用掉的氫 kg）, tChem、tGrav、tNuc（年）,
 *      chart, anim（目前模式的動畫正在播放） }。
 *   地面實驗一律用今天的太陽與 1 AU（大氣外 1361 W/m²）。
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const S0 = 1361.17, EARTH_AGE = 4.54e9;

  const run = function (ev) { return ev.type === 'run' ? ev.data : null; };
  const any = function (ev) { return ev.type === 'state' || ev.type === 'run' ? ev.data : null; };
  const mode = function (ev, m) { const d = any(ev); return d && d.mode === m ? d : null; };
  const runOf = function (ev, m) { const d = run(ev); return d && d.mode === m ? d : null; };
  const near = function (a, b, r) { return a != null && isFinite(a) && Math.abs(a / b - 1) <= r; };
  // 光度模式下用某顆預設恆星
  const fluxStar = function (ev, id) { const d = mode(ev, 'flux'); return d && d.star === id && !d.inside ? d : null; };
  const ground = function (ev) { const d = mode(ev, 'ground'); return d && !d.anim ? d : null; };
  const lg = function (ev) { const d = ground(ev); return d && d.lg ? d : null; };

  LabMission.register('sun-energy', [
    {
      id: 'sun-energy-1', level: 1,
      title: { zh: '八分多鐘的旅程', en: 'An eight-minute journey' },
      desc: { zh: '在「光度與太陽常數」按「送出一道光」，看它從恆星表面一路走到距離 d。', en: 'In “Luminosity”, press “Send a flash of light” and follow it from the star’s surface all the way to distance d.' },
      check: function (ev) { return !!runOf(ev, 'flux'); }
    },
    {
      id: 'sun-energy-2', level: 2,
      title: { zh: '曬一盒水', en: 'Sun a box of water' },
      desc: { zh: '在「在地面量」按「開始曬」，等黑色水盒曬完，記下第一筆量測。', en: 'In “On the ground”, press “Start” and let the black pan finish: your first measurement.' },
      check: function (ev) { return !!runOf(ev, 'ground'); }
    },
    {
      id: 'sun-energy-3', level: 2,
      title: { zh: '四個變一個', en: 'Four become one' },
      desc: { zh: '在「核融合」按「看一次核融合」，看完 4 個質子變成 1 個氦原子核。', en: 'In “Fusion”, press “Watch a fusion” and watch four protons become one helium nucleus.' },
      check: function (ev) { return !!runOf(ev, 'fusion'); }
    },
    {
      id: 'sun-energy-4', level: 3,
      title: { zh: '只剩四分之一', en: 'Down to a quarter' },
      desc: { zh: '今天的太陽，找到每平方公尺的功率剛好是地球的 1/4 的距離（誤差 1 % 內）。', en: 'For today’s Sun, find the distance where each square metre gets exactly 1/4 of what Earth gets (within 1 %).' },
      check: function (ev) { const d = fluxStar(ev, 'sun'); return !!d && near(d.S, S0 / 4, 0.01); }
    },
    {
      id: 'sun-energy-5', level: 3,
      title: { zh: '看不見的最亮處', en: 'The brightest colour you cannot see' },
      desc: { zh: '把恆星的表面溫度調低，讓輻射最強的波長落在 1000 nm 以上（紅外線）。', en: 'Lower the star’s surface temperature until its brightest wavelength is 1000 nm or longer (infrared).' },
      check: function (ev) { const d = any(ev); return !!d && d.mode !== 'ground' && d.lam >= 1000; }
    },
    {
      id: 'sun-energy-6', level: 4,
      title: { zh: '剛好和地球一樣老', en: 'Exactly as old as the Earth' },
      desc: { zh: '在「核融合」用今天的太陽，調整燒掉的質量比例，讓核融合能撐的時間剛好等於地球的年齡 45.4 億年（誤差 1 % 內）。', en: 'In “Fusion” with today’s Sun, adjust the fraction burned so fusion lasts exactly the age of the Earth, 4.54 billion years (within 1 %).' },
      check: function (ev) { const d = mode(ev, 'fusion'); return !!d && d.star === 'sun' && near(d.tNuc, EARTH_AGE, 0.01); }
    },
    {
      id: 'sun-energy-7', level: 4,
      title: { zh: '晴天也少一半', en: 'Half gone on a clear day' },
      desc: { zh: '在很乾淨的空氣裡（τ 0.3 以下）曬完一次，但地面的陽光只剩大氣外的一半以下。', en: 'Finish a measurement in clean air (τ 0.3 or less), yet with half or less of the sunlight above the air reaching the ground.' },
      check: function (ev) { const d = runOf(ev, 'ground'); return !!d && d.tau <= 0.3 && d.Ig <= 0.5 * S0; }
    },
    {
      id: 'sun-energy-8', level: 5,
      title: { zh: '一樣亮，熱兩倍', en: 'Just as bright, twice as hot' },
      desc: { zh: '做一顆表面溫度是太陽 2 倍以上、光度卻和今天的太陽一樣（誤差 2 % 內）的恆星。', en: 'Build a star at least twice as hot as the Sun’s surface, yet exactly as luminous as today’s Sun (within 2 %).' },
      check: function (ev) { const d = any(ev); return !!d && d.mode !== 'ground' && near(d.L, 1, 0.02) && d.T >= 2 * 5772; }
    },
    {
      id: 'sun-energy-9', level: 5,
      title: { zh: '量得準', en: 'An honest measurement' },
      desc: { zh: '曬完一次，用水溫算出的照度要達到真正地面照度的 95 % 以上。', en: 'Finish a measurement in which the irradiance worked out from the water temperature is at least 95 % of the true irradiance on the ground.' },
      check: function (ev) { const d = runOf(ev, 'ground'); return !!d && d.Iest >= 0.95 * d.Ig; }
    },
    {
      id: 'sun-energy-10', level: 5,
      title: { zh: '年輕太陽的地球', en: 'Earth under the young Sun' },
      desc: { zh: '用 45 億年前的太陽，找到收到的陽光和今天的地球一樣多的距離（誤差 1 % 內）。', en: 'With the Sun of 4.5 billion years ago, find the distance that receives as much sunlight as Earth does today (within 1 %).' },
      check: function (ev) { const d = fluxStar(ev, 'young'); return !!d && near(d.Srel, 1, 0.01); }
    },
    {
      id: 'sun-energy-11', level: 7,
      title: { zh: '從地面量到大氣外', en: 'From the ground to above the air' },
      desc: { zh: '用 Langley 法：同一個 τ 至少量 3 次、大氣質量 m 至少相差 1，外推出的大氣外太陽常數和 1361 W/m² 差 3 % 以內。', en: 'Use the Langley method: at least 3 measurements with the same τ, air masses at least 1 apart, extrapolating to within 3 % of 1361 W/m² above the air.' },
      check: function (ev) { const d = lg(ev); return !!d && d.lg.n >= 3 && d.lg.mMax - d.lg.mMin >= 1 && near(d.lg.S0, S0, 0.03); }
    },
    {
      id: 'sun-energy-12', level: 8,
      title: { zh: '大氣有多厚', en: 'How thick is the air' },
      desc: { zh: 'Langley 法：同一個 τ 至少量 4 次、m 至少相差 1.5，外推的太陽常數差 1 % 以內，斜率算出的 τ 也和設定差 0.01 以內。', en: 'Langley method: at least 4 measurements with the same τ, air masses at least 1.5 apart, the extrapolated value within 1 %, and the τ from the slope within 0.01 of the setting.' },
      check: function (ev) { const d = lg(ev); return !!d && d.lg.n >= 4 && d.lg.mMax - d.lg.mMin >= 1.5 && near(d.lg.S0, S0, 0.01) && Math.abs(d.lg.tau - d.tau) <= 0.01; }
    },

    // ───── 隱藏任務 ─────
    {
      id: 'sun-energy-h1', level: 3, hidden: true,
      title: { zh: '一瓦的陽光', en: 'One watt of sunshine' },
      riddle: { zh: '走得夠遠，整片天空的光只夠點亮最小的燈。', en: 'Go far enough and the whole sky’s light could barely run the smallest lamp.' },
      desc: { zh: '今天的太陽，每平方公尺剛好只收到 1 W（誤差 2 % 內）：大約在 37 AU，比海王星還遠。', en: 'Today’s Sun delivering only 1 W per square metre (within 2 %): about 37 AU, beyond Neptune.' },
      check: function (ev) { const d = fluxStar(ev, 'sun'); return !!d && near(d.S, 1, 0.02); }
    },
    {
      id: 'sun-energy-h2', level: 5, hidden: true,
      title: { zh: '太陽的餘燼', en: 'The Sun’s last ember' },
      riddle: { zh: '比地球還小，卻比太陽熱好幾倍；它的燃料早就燒完了。', en: 'Smaller than the Earth, many times hotter than the Sun, and its fuel long gone.' },
      desc: { zh: '在「核融合」做一顆白矮星：半徑 0.01 倍太陽以下、表面 20000–30000 K、質量 0.5–1.4 倍太陽。', en: 'In “Fusion”, build a white dwarf: radius 0.01 solar radii or less, surface 20 000–30 000 K, mass 0.5–1.4 solar masses.' },
      check: function (ev) { const d = mode(ev, 'fusion'); return !!d && d.R <= 0.01 && d.T >= 20000 && d.T <= 30000 && d.M >= 0.5 && d.M <= 1.4; }
    },
    {
      id: 'sun-energy-h3', level: 7, hidden: true,
      title: { zh: '收支平衡', en: 'Breaking even' },
      riddle: { zh: '曬得夠久，它就不再變熱了，太陽卻一直沒停。', en: 'Leave it long enough and it stops warming, though the Sun never stops.' },
      desc: { zh: '曬完一次，水溫的上升達到平衡值的 95 % 以上：吸收的陽光幾乎全部又散掉了。', en: 'Finish a measurement whose temperature rise reaches 95 % of the equilibrium value: nearly all the absorbed sunlight is lost again.' },
      check: function (ev) { const d = runOf(ev, 'ground'); return !!d && d.eqFrac >= 0.95; }
    },
    {
      id: 'sun-energy-h4', level: 4, hidden: true,
      title: { zh: '貼著地平線', en: 'Grazing the horizon' },
      riddle: { zh: '穿過十層天空，光還是夠亮。', en: 'Through ten skies, and the light is still bright.' },
      desc: { zh: '太陽低到大氣質量 10 以上，地面每平方公尺仍有 300 W 以上：只有非常乾淨的空氣才辦得到。', en: 'The Sun so low that the air mass is 10 or more, yet still 300 W per square metre on the ground: only very clean air allows it.' },
      check: function (ev) { const d = ground(ev); return !!d && d.m >= 10 && d.Ig >= 300; }
    },
    {
      id: 'sun-energy-h5', level: 6, hidden: true,
      title: { zh: '搬到古柏帶', en: 'Moving to the Kuiper belt' },
      riddle: { zh: '等它長大，溫暖的家要搬到冰的邊疆。', en: 'When it grows old and large, a warm home must move to the icy frontier.' },
      desc: { zh: '紅巨星階段的太陽，找到收到的陽光和今天的地球一樣多的距離（誤差 2 % 內）：大約 49 AU。', en: 'For the Sun as a red giant, find where the sunlight equals Earth’s today (within 2 %): about 49 AU.' },
      check: function (ev) { const d = fluxStar(ev, 'giant'); return !!d && near(d.Srel, 1, 0.02); }
    },
    {
      id: 'sun-energy-h6', level: 4, hidden: true,
      title: { zh: '眼睛最喜歡的顏色', en: 'The colour the eye loves most' },
      riddle: { zh: '讓最亮的顏色，剛好落在眼睛最敏感的地方。', en: 'Let the brightest colour land exactly where the eye is most sensitive.' },
      desc: { zh: '讓輻射最強的波長剛好是 550 nm（誤差 1 nm 內）：人眼在白天最敏感的黃綠光。', en: 'Put the brightest wavelength at exactly 550 nm (within 1 nm): the yellow-green where human daytime vision is most sensitive.' },
      check: function (ev) { const d = any(ev); return !!d && d.mode !== 'ground' && Math.abs(d.lam - 550) <= 1; }
    },
    {
      id: 'sun-energy-h7', level: 8, hidden: true,
      title: { zh: '霧霾裡的太陽常數', en: 'A solar constant through the haze' },
      riddle: { zh: '天空再髒，直線還是指得回天頂之外。', en: 'However dirty the sky, the straight line still points back beyond it.' },
      desc: { zh: '在很混濁的空氣（τ 0.6 以上）裡用 Langley 法：同一個 τ 至少 3 次、m 相差 1 以上，外推的太陽常數差 3 % 以內、τ 差 0.02 以內。', en: 'Use the Langley method in very hazy air (τ 0.6 or more): at least 3 measurements, air masses 1 or more apart, the extrapolated value within 3 % and τ within 0.02.' },
      check: function (ev) { const d = lg(ev); return !!d && d.tau >= 0.6 && d.lg.n >= 3 && d.lg.mMax - d.lg.mMin >= 1 && near(d.lg.S0, S0, 0.03) && Math.abs(d.lg.tau - d.tau) <= 0.02; }
    },
    {
      id: 'sun-energy-h8', level: 9, hidden: true,
      title: { zh: '只在中午量', en: 'Measuring only around noon' },
      riddle: { zh: '太陽一直待在高處，你仍然量到了天外。', en: 'The Sun never left the heights, and still you measured beyond the sky.' },
      desc: { zh: 'Langley 法的每一筆都在大氣質量 1.3 以內（太陽很高），至少 3 次，外推的太陽常數仍然差 1 % 以內：量得夠準，短短一段直線也能外推。', en: 'Every Langley measurement at an air mass of 1.3 or less (a high Sun), at least 3 of them, and the extrapolation still within 1 %: careful enough measurements make even a short line extrapolate well.' },
      check: function (ev) { const d = lg(ev); return !!d && d.lg.n >= 3 && d.lg.mMax <= 1.3 && near(d.lg.S0, S0, 0.01); }
    },
    {
      id: 'sun-energy-h9', level: 5, hidden: true,
      title: { zh: '最近的鄰居的行星', en: 'A planet next door' },
      riddle: { zh: '一顆暗紅的小星，貼身帶著一個世界。', en: 'A dim red star keeps a world close at its side.' },
      desc: { zh: '比鄰星，距離 0.048–0.049 AU：比鄰星 b 的軌道，收到的光接近地球的八成。', en: 'Proxima Centauri at 0.048–0.049 AU: the orbit of Proxima b, which gets nearly 80 % of Earth’s sunlight.' },
      check: function (ev) { const d = fluxStar(ev, 'proxima'); return !!d && d.d >= 0.048 && d.d <= 0.049; }
    },
    {
      id: 'sun-energy-h10', level: 4, hidden: true,
      title: { zh: '一百億個幽靈', en: 'Ten billion ghosts' },
      riddle: { zh: '每一秒，指甲大小的地方有這麼多過客，卻沒有一個停下來。', en: 'Every second this many travellers cross a fingernail, and not one stops.' },
      desc: { zh: '今天的太陽，找到每平方公分每秒穿過剛好 100 億個微中子的距離（誤差 2 % 內）：大約 2.55 AU，小行星帶。', en: 'For today’s Sun, find the distance where exactly ten billion neutrinos cross each square centimetre every second (within 2 %): about 2.55 AU, in the asteroid belt.' },
      check: function (ev) { const d = fluxStar(ev, 'sun'); return !!d && near(d.nuCm2, 1e10, 0.02); }
    }
  ]);
})();
