/* missions/hubble-expansion.js — 哈伯定律與宇宙年齡的任務（星星數 = 等級；隱藏任務 = 等級 × 2）
 *
 * 事件（js/hubble-expansion.js 只在使用者操作過之後才回報；載入頁面不算）：
 *   'state'：任何設定改變時；'run'：膨脹播完（光到家或 a 到 3）、量完一個星系或「全部量一遍」量完、從大霹靂播到現在。
 *   共同欄位：mode（'expand'、'measure'、'age'）, chart, anim（動畫正在播放）。
 *   膨脹：a（尺度因子）, homeMW（家是銀河系）, targetMW（粉紅色的目標是銀河系）, hasTarget, dist（目標現在的距離 Mpc）, chi（共動距離）,
 *     v（目標的退行速度 km/s）, vc（v ÷ c）, H（km/s/Mpc）；run 另有 arrived（光到家了）, z（光的紅移）, vEmit（發光時目標的退行速度 ÷ c）。
 *   量測：method（'hubble'、'cepheid'、'sn'）, n（這個方法量了幾個星系）, H、sH（過原點的最小平方法）, rel（sH ÷ H）, age1（1/H，十億年）,
 *     ageL（用 Planck 的 Ωm、ΩΛ 算的年齡）, dmin、dmax（量到的距離的最小、最大值）, sel（選的星系代號）,
 *     last（剛剛「量這個星系」量的星系代號；「全部量一遍」與其他事件是 ''）, lastV（它的速度 km/s）, lastLocal（屬於本星系群）, lastReal（真實星系）,
 *     both（選的星系同時有造父變星與超新星的距離時，兩者的相對差）。
 *   年齡：H0, Om, OL, Ok, flat（|Ωk| ≤ 0.005）, model（預設模型代號；自己調過是 ''）, age（十億年；沒有大霹靂是 null）, bang,
 *     crunch（從現在到大崩墜的時間，十億年；不會大崩墜是 null）, recollapse, q0, zacc（開始加速的紅移；沒有是 null）, tH（1/H0）。
 */
(function () {
  'use strict';
  if (!window.LabMission) return;

  const C_KMS = 299792.458, EARTH = 4.54, STARS = 12.5;
  const any = function (ev) { return ev.type === 'state' || ev.type === 'run' ? ev.data : null; };
  const mode = function (ev, m) { const d = any(ev); return d && d.mode === m && !d.anim ? d : null; };
  const runOf = function (ev, m) { const d = ev.type === 'run' ? ev.data : null; return d && d.mode === m ? d : null; };
  const fitOf = function (ev, method, nMin) { const d = mode(ev, 'measure'); return d && d.method === method && d.n >= nMin && d.H != null ? d : null; };

  LabMission.register('hubble-expansion', [
    {
      id: 'hubble-expansion-1', level: 1,
      title: { zh: '空間在拉長', en: 'Space is stretching' },
      desc: { zh: '在「膨脹的宇宙」按「膨脹」，看粉紅色星系的光一路走到家。', en: 'In “The expanding universe”, press “Expand” and follow the pink galaxy’s light all the way home.' },
      check: function (ev) { return !!runOf(ev, 'expand'); }
    },
    {
      id: 'hubble-expansion-2', level: 2,
      title: { zh: '第一個星系', en: 'The first galaxy' },
      desc: { zh: '在「量哈伯常數」量第一個星系的距離與速度。', en: 'In “Measure Hubble’s constant”, measure the distance and velocity of your first galaxy.' },
      check: function (ev) { const d = runOf(ev, 'measure'); return !!d && d.n >= 1; }
    },
    {
      id: 'hubble-expansion-3', level: 2,
      title: { zh: '倒帶到起點', en: 'Rewind to the start' },
      desc: { zh: '在「宇宙的年齡」按「從大霹靂播放」，從開頭看到現在。', en: 'In “The age of the universe”, press “Play from the Big Bang” and watch from the beginning to now.' },
      check: function (ev) { return !!runOf(ev, 'age'); }
    },
    {
      id: 'hubble-expansion-4', level: 3,
      title: { zh: '到處都是中心', en: 'The centre is everywhere' },
      desc: { zh: '搬家到別的星系，再按「膨脹」看完：從那裡看，所有星系一樣都在遠離你。', en: 'Move home to another galaxy and press “Expand”: from there, too, every galaxy is moving away from you.' },
      check: function (ev) { const d = runOf(ev, 'expand'); return !!d && !d.homeMW; }
    },
    {
      id: 'hubble-expansion-5', level: 3,
      title: { zh: '迎面而來', en: 'Coming our way' },
      desc: { zh: '量仙女座星系：它的光譜是藍移，正以 300 km/s 朝我們飛來。', en: 'Measure the Andromeda galaxy: its spectrum is blueshifted, and it is heading towards us at 300 km/s.' },
      check: function (ev) { const d = runOf(ev, 'measure'); return !!d && d.last === 'm31'; }
    },
    {
      id: 'hubble-expansion-6', level: 4,
      title: { zh: '造父變星的尺', en: 'The Cepheid ruler' },
      desc: { zh: '用造父變星量至少 6 個星系，量出的哈伯常數和 70 差 10 % 以內。', en: 'Measure at least 6 galaxies with Cepheids and get a Hubble constant within 10 % of 70.' },
      check: function (ev) { const d = fitOf(ev, 'cepheid', 6); return !!d && Math.abs(d.H - 70) <= 7; }
    },
    {
      id: 'hubble-expansion-7', level: 5,
      title: { zh: '比地球還年輕', en: 'Younger than the Earth' },
      desc: { zh: '用哈伯 1929 年的尺度量至少 6 個星系：算出的哈伯時間比地球的年齡（45.4 億年）還短。', en: 'Use Hubble’s 1929 scale on at least 6 galaxies: the Hubble time comes out shorter than the age of the Earth (4.54 billion years).' },
      check: function (ev) { const d = fitOf(ev, 'hubble', 6); return !!d && d.age1 != null && d.age1 < EARTH; }
    },
    {
      id: 'hubble-expansion-8', level: 5,
      title: { zh: '宇宙的燈塔', en: 'Cosmic lighthouses' },
      desc: { zh: '用 Ia 型超新星量至少 8 個星系，哈伯常數的誤差在 3 % 以內。', en: 'Measure at least 8 galaxies with Type Ia supernovae and get Hubble’s constant to within 3 %.' },
      check: function (ev) { const d = fitOf(ev, 'sn', 8); return !!d && d.rel != null && d.rel <= 0.03; }
    },
    {
      id: 'hubble-expansion-9', level: 4,
      title: { zh: '年齡危機', en: 'The age crisis' },
      desc: { zh: '1990 年代的難題：在只有物質（Ωm = 1、ΩΛ = 0）的宇宙，把哈伯常數調到 72–74，宇宙竟比最老的恆星（125 億年）還年輕。', en: 'The puzzle of the 1990s: in a matter-only universe (Ωm = 1, ΩΛ = 0), set Hubble’s constant to 72–74 and the universe is younger than the oldest stars (12.5 billion years).' },
      check: function (ev) { const d = mode(ev, 'age'); return !!d && Math.abs(d.Om - 1) <= 0.01 && Math.abs(d.OL) <= 0.01 && d.H0 >= 72 && d.H0 <= 74 && d.age != null && d.age < STARS; }
    },
    {
      id: 'hubble-expansion-10', level: 5,
      title: { zh: '大崩墜', en: 'The Big Crunch' },
      desc: { zh: '調出一個 300 億年內就會停止膨脹、收縮到大崩墜的宇宙。', en: 'Make a universe that stops expanding and falls back into a Big Crunch within 30 billion years from now.' },
      check: function (ev) { const d = mode(ev, 'age'); return !!d && d.crunch != null && d.crunch <= 30; }
    },
    {
      id: 'hubble-expansion-11', level: 5,
      title: { zh: '很早就加速', en: 'Speeding up early' },
      desc: { zh: '在平坦的宇宙裡，讓膨脹從紅移 z ≥ 1 的時候就開始加速（Planck 的宇宙是 z ≈ 0.63）。', en: 'In a flat universe, make the expansion start speeding up at redshift z ≥ 1 or earlier (Planck’s universe: z ≈ 0.63).' },
      check: function (ev) { const d = mode(ev, 'age'); return !!d && d.flat && d.zacc != null && d.zacc >= 1; }
    },
    {
      id: 'hubble-expansion-12', level: 7,
      title: { zh: '只看遠方', en: 'Only the far ones' },
      desc: { zh: '用 Ia 型超新星只量 40 Mpc 以外的星系（至少 5 個），量出的哈伯常數和 70 差 3 % 以內：遠的星系本動速度的影響小。', en: 'With Type Ia supernovae, measure only galaxies beyond 40 Mpc (at least 5) and get Hubble’s constant within 3 % of 70: peculiar velocities matter less far away.' },
      check: function (ev) { const d = fitOf(ev, 'sn', 5); return !!d && d.dmin >= 40 && Math.abs(d.H - 70) <= 2.1; }
    },

    // ───── 隱藏任務 ─────
    {
      id: 'hubble-expansion-h1', level: 4, hidden: true,
      title: { zh: '長了一倍', en: 'Twice as long' },
      riddle: { zh: '它出發時的顏色，到這裡長了一倍。', en: 'The colour it set out with has doubled by the time it gets here.' },
      desc: { zh: '讓光到家時的紅移 z 在 0.98–1.02：波長拉長一倍，表示光在路上時宇宙也長大了一倍。', en: 'Get light home with a redshift z between 0.98 and 1.02: the wavelength doubled because the universe doubled in size on the way.' },
      check: function (ev) { const d = runOf(ev, 'expand'); return !!d && d.arrived && d.z >= 0.98 && d.z <= 1.02; }
    },
    {
      id: 'hubble-expansion-h2', level: 8, hidden: true,
      title: { zh: '比光還快', en: 'Faster than light' },
      riddle: { zh: '它跑得比光還快得多，它的光卻還是到了。', en: 'It runs away much faster than light, and yet its light still arrives.' },
      desc: { zh: '發光時退行速度至少 1.5 倍光速（遠在哈伯半徑外）的星系，它的光最後還是到家了：哈伯半徑跟著宇宙長大，把光追了進來。', en: 'Light sent by a galaxy receding at 1.5 times the speed of light or more (far beyond the Hubble radius) still reaches home: the Hubble radius grows and catches up with the light.' },
      check: function (ev) { const d = runOf(ev, 'expand'); return !!d && d.arrived && d.vEmit != null && d.vEmit >= 1.5; }
    },
    {
      id: 'hubble-expansion-h3', level: 5, hidden: true,
      title: { zh: '兩把尺', en: 'Two rulers' },
      riddle: { zh: '兩把不同的尺，量出同一個距離。', en: 'Two different rulers, one and the same distance.' },
      desc: { zh: '同一個星系同時用造父變星和 Ia 型超新星量，兩個距離相差不到 2 %：天文學家就是這樣用造父變星校準超新星（距離階梯）。', en: 'Measure the same galaxy with both Cepheids and a Type Ia supernova and get distances within 2 %: this is how Cepheids calibrate supernovae (the distance ladder).' },
      check: function (ev) { const d = mode(ev, 'measure'); return !!d && d.both != null && d.both <= 0.02; }
    },
    {
      id: 'hubble-expansion-h4', level: 5, hidden: true,
      title: { zh: '不是自己人', en: 'Not one of ours' },
      riddle: { zh: '它不在我們這一群，卻也朝我們飛來。', en: 'It is not in our group, yet it too is flying towards us.' },
      desc: { zh: '量一個不屬於本星系群、光譜卻是藍移的星系（例如 M81）：附近的星系，本動速度可以大過哈伯流。', en: 'Measure a galaxy outside the Local Group whose spectrum is blueshifted (M81, for example): nearby, peculiar motions can beat the Hubble flow.' },
      check: function (ev) { const d = runOf(ev, 'measure'); return !!d && !!d.last && d.lastV < 0 && d.lastLocal === false; }
    },
    {
      id: 'hubble-expansion-h5', level: 5, hidden: true,
      title: { zh: '回頭看老家', en: 'Looking back home' },
      riddle: { zh: '換個地方住，回頭看看老家。', en: 'Move somewhere else, then look back at your old home.' },
      desc: { zh: '搬到離銀河系 3000 Mpc 以上的星系，再讓銀河系的光到你的新家：從那裡看，是銀河系在遠離。', en: 'Move to a galaxy more than 3000 Mpc from the Milky Way and let the Milky Way’s light reach your new home: from there, it is the Milky Way that recedes.' },
      check: function (ev) { const d = runOf(ev, 'expand'); return !!d && d.arrived && !d.homeMW && d.targetMW && d.chi >= 3000; }
    },
    {
      id: 'hubble-expansion-h6', level: 7, hidden: true,
      title: { zh: '同樣的年紀', en: 'The same age' },
      riddle: { zh: '換一個常數，還是湊出同樣的歲數。', en: 'A different constant, and still the same age.' },
      desc: { zh: '把哈伯常數設成 70（± 0.5），在平坦的宇宙裡調出 138 億年（± 1 億年）的年齡。', en: 'With Hubble’s constant at 70 (± 0.5), make a flat universe 13.8 billion years old (± 0.1).' },
      check: function (ev) { const d = mode(ev, 'age'); return !!d && d.flat && Math.abs(d.H0 - 70) <= 0.5 && d.age != null && Math.abs(d.age - 13.8) <= 0.1; }
    },
    {
      id: 'hubble-expansion-h7', level: 9, hidden: true,
      title: { zh: '剛剛好的巧合', en: 'A neat coincidence' },
      riddle: { zh: '它的年紀剛好是倒數，裡面卻不是空無一物。', en: 'Its age is exactly the reciprocal, yet it is not empty.' },
      desc: { zh: '讓宇宙年齡剛好等於哈伯時間 1/H0（差 0.2 % 以內），而且物質 Ωm ≥ 0.1：減速和加速剛好抵消。我們的宇宙也很接近這樣。', en: 'Make the age equal to the Hubble time 1/H0 (within 0.2 %) with matter Ωm ≥ 0.1: the slowing and the speeding up cancel exactly. Our universe is close to this.' },
      check: function (ev) { const d = mode(ev, 'age'); return !!d && d.Om >= 0.1 && d.age != null && Math.abs(d.age / d.tH - 1) <= 0.002; }
    },
    {
      id: 'hubble-expansion-h8', level: 5, hidden: true,
      title: { zh: '沒有開始', en: 'No beginning' },
      riddle: { zh: '一直往回走，它從來沒有開始。', en: 'Go back and back: it never began.' },
      desc: { zh: '物質 Ωm 至少 0.1，卻調出一個沒有大霹靂的宇宙：暗能量太多，往回推時宇宙縮到一個最小值就反彈。', en: 'With matter Ωm of at least 0.1, make a universe with no Big Bang: with too much dark energy, running it backwards it shrinks to a minimum size and bounces.' },
      check: function (ev) { const d = mode(ev, 'age'); return !!d && d.Om >= 0.1 && !d.bang; }
    },
    {
      id: 'hubble-expansion-h9', level: 7, hidden: true,
      title: { zh: '不夠重也會回來', en: 'Back without the weight' },
      riddle: { zh: '物質不夠多，只差一點點，它還是會回來。', en: 'Not enough matter, only a tiny nudge, and still it comes back.' },
      desc: { zh: '物質 Ωm ≤ 1，只加一點點負的暗能量（−0.05 ≤ ΩΛ < 0），宇宙最後還是會大崩墜：負的暗能量越撐越大，總有一天把宇宙拉回來。', en: 'With matter Ωm ≤ 1, add only a little negative dark energy (−0.05 ≤ ΩΛ < 0) and the universe still ends in a Big Crunch: a negative dark energy grows as the universe grows and pulls it back in the end.' },
      check: function (ev) { const d = mode(ev, 'age'); return !!d && d.Om <= 1 && d.OL < 0 && d.OL >= -0.05 && d.recollapse && d.bang; }
    },
    {
      id: 'hubble-expansion-h10', level: 3, hidden: true,
      title: { zh: '最遠的一群', en: 'The farthest crowd' },
      riddle: { zh: '一千多個星系擠在一起，三億光年外。', en: 'More than a thousand galaxies crowded together, three hundred million light years away.' },
      desc: { zh: '量后髮座星系團：這頁最遠的星系團，只有超新星量得到。', en: 'Measure the Coma cluster: the farthest on this page, reachable only with supernovae.' },
      check: function (ev) { const d = runOf(ev, 'measure'); return !!d && d.last === 'coma'; }
    }
  ]);
})();
