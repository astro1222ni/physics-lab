/* missions/stars-hr.js — 恆星的顏色與亮度（黑體輻射與 HR 圖）的任務（星星數 = 等級；隱藏任務 = 等級 × 2）
 *
 * 事件（js/stars-hr.js 只在使用者操作過之後才回報；載入頁面不算）：
 *   'star'：data = {
 *      mode（'free'：溫度＋半徑；'ms'：主序星的質量）, T（K）, R（R☉）, L（L☉）, M（M☉，只有主序模式）, life（主序壽命 年，只有主序模式）,
 *      peak（峰值波長 nm）, cls（光譜型）, uv、vis、ir（紫外／可見光／紅外的比例）, white（色度離 D65 白點的距離）,
 *      mbol（絕對熱星等）, region, dragging（正在拖曳；放開時會再送一次 dragging = false）, pick（比較的真實恆星代號）, pins, spec }；
 *   'pick'：選了一顆真實恆星，data = { id, from（'chart'／'list'） }；
 *   'pin'、'chart'、'view'、'cam'：留下記號、切換光譜圖、3D 與視角。
 * 「把恆星調到某個值」的任務，拖曳途中掃過去不算，要放開（或用滑桿、打字、方向鍵）停在那裡。
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const S = function (ev) { return ev.type === 'star' ? ev.data : null; };
  const parked = function (ev) { const d = S(ev); return d && !d.dragging ? d : null; };
  const within = function (v, x, r) { return Math.abs(v - x) <= Math.abs(x) * r; };
  const AGE = 13.8e9;                       // 宇宙年齡（年）
  const R_EARTH = 6.371e6 / 6.957e8;        // 地球半徑（R☉）

  LabMission.register('stars-hr', [
    {
      id: 'stars-hr-1', level: 1,
      title: { zh: '紅色的星', en: 'A red star' },
      desc: { zh: '做一顆 M 型星：表面溫度低於 3900 K，看它是什麼顏色。', en: 'Make an M-type star: surface temperature below 3900 K. What colour is it?' },
      check: function (ev) { const d = parked(ev); return !!d && d.T < 3900; }
    },
    {
      id: 'stars-hr-2', level: 2,
      title: { zh: '峰值 500 nm', en: 'Peak at 500 nm' },
      desc: { zh: '調整溫度，讓光譜的峰值波長落在 500 nm（誤差 2 nm 內）。太陽本身差一點點，不算。', en: 'Set the temperature so the spectrum peaks at 500 nm (within 2 nm). The Sun itself is just outside.' },
      check: function (ev) { const d = parked(ev); return !!d && Math.abs(d.peak - 500) <= 2; }
    },
    {
      id: 'stars-hr-3', level: 3,
      title: { zh: '一半是紫外線', en: 'Half ultraviolet' },
      desc: { zh: '調整溫度，讓你的恆星發出的光剛好一半是紫外線（波長短於 380 nm；49.5%–50.5%）。', en: 'Set the temperature so exactly half of your star’s light is ultraviolet (shorter than 380 nm; 49.5–50.5%).' },
      check: function (ev) { const d = parked(ev); return !!d && d.uv >= 0.495 && d.uv <= 0.505; }
    },
    {
      id: 'stars-hr-4', level: 3,
      title: { zh: '一樣大，亮 100 倍', en: 'Same size, 100 times brighter' },
      desc: { zh: '半徑和太陽一樣（誤差 0.5% 內），光度變成太陽的 100 倍（誤差 2% 內）：溫度要多高？', en: 'Keep the radius equal to the Sun’s (within 0.5%) and make the luminosity 100 times the Sun’s (within 2%). How hot must it be?' },
      check: function (ev) { const d = parked(ev); return !!d && within(d.R, 1, 0.005) && within(d.L, 100, 0.02); }
    },
    {
      id: 'stars-hr-5', level: 3,
      title: { zh: '一樣熱，亮 100 倍', en: 'Same temperature, 100 times brighter' },
      desc: { zh: '表面溫度和太陽一樣（5772 K，誤差 0.5% 內），光度變成太陽的 100 倍（誤差 2% 內）：半徑要多大？', en: 'Keep the surface temperature equal to the Sun’s (5772 K, within 0.5%) and make the luminosity 100 times the Sun’s (within 2%). How big must it be?' },
      check: function (ev) { const d = parked(ev); return !!d && within(d.T, 5772, 0.005) && within(d.L, 100, 0.02); }
    },
    {
      id: 'stars-hr-6', level: 3,
      title: { zh: '最大的那一顆', en: 'The biggest of them all' },
      desc: { zh: '在 HR 圖或清單裡，找出這些真實恆星中半徑最大的那一顆，選它來比較。', en: 'On the diagram or in the list, find the real star with the largest radius and choose it for comparison.' },
      check: function (ev) { return ev.type === 'pick' && ev.data.id === 'betelgeuse'; }
    },
    {
      id: 'stars-hr-7', level: 4,
      title: { zh: '和地球一樣大', en: 'The size of the Earth' },
      desc: { zh: '做一顆和地球一樣大（半徑誤差 2% 內）、表面溫度 10000 K 以上的恆星。它在 HR 圖的哪裡？', en: 'Make a star as big as the Earth (radius within 2%) with a surface temperature of at least 10 000 K. Where does it sit on the diagram?' },
      check: function (ev) { const d = parked(ev); return !!d && within(d.R, R_EARTH, 0.02) && d.T >= 10000; }
    },
    {
      id: 'stars-hr-8', level: 4,
      title: { zh: '和宇宙一樣老', en: 'As old as the Universe' },
      desc: { zh: '在主序星模式找出主序壽命剛好等於宇宙年齡 138 億年（誤差 2% 內）的質量。', en: 'In main-sequence mode, find the mass whose main-sequence lifetime equals the age of the Universe, 13.8 billion years (within 2%).' },
      check: function (ev) { const d = parked(ev); return !!d && d.mode === 'ms' && within(d.life, AGE, 0.02); }
    },
    {
      id: 'stars-hr-9', level: 5,
      title: { zh: '主序帶上的天狼星', en: 'Sirius on the main sequence' },
      desc: { zh: '在主序星模式，做出和天狼星 A 一樣亮（25.4 倍太陽，誤差 2% 內）的主序星。它的質量是太陽的幾倍？', en: 'In main-sequence mode, make a star as luminous as Sirius A (25.4 Suns, within 2%). How many solar masses is it?' },
      check: function (ev) { const d = parked(ev); return !!d && d.mode === 'ms' && within(d.L, 25.4, 0.02); }
    },
    {
      id: 'stars-hr-10', level: 5,
      title: { zh: '複製天狼星 B', en: 'Copy Sirius B' },
      desc: { zh: '在溫度＋半徑模式，做出天狼星 B：溫度 24800 K（誤差 1% 內）、光度 0.025 倍太陽（誤差 3% 內）。', en: 'In temperature + radius mode, build Sirius B: 24 800 K (within 1%) and 0.025 times the Sun’s luminosity (within 3%).' },
      check: function (ev) { const d = parked(ev); return !!d && d.mode === 'free' && within(d.T, 24800, 0.01) && within(d.L, 0.025, 0.03); }
    },
    {
      id: 'stars-hr-11', level: 6,
      title: { zh: '最白的星', en: 'The whitest star' },
      desc: { zh: '黑體的顏色從紅、橘、白到藍，中間有一個溫度最接近純白（螢幕的白點 D65）。找到它（色度距離 0.0045 以內）。', en: 'Blackbody colours run from red through orange and white to blue; one temperature comes closest to pure white (the screen white point, D65). Find it (chromaticity distance within 0.0045).' },
      check: function (ev) { const d = parked(ev); return !!d && d.white <= 0.0045; }
    },
    {
      id: 'stars-hr-12', level: 7,
      title: { zh: '可見光最多', en: 'The most visible light' },
      desc: { zh: '找出讓可見光（380–750 nm）佔全部光最多的溫度：可見光比例要達到 46.72% 以上。峰值在可見光中間的溫度不是答案。', en: 'Find the temperature that puts the largest share of the light in the visible band (380–750 nm): at least 46.72%. The temperature that peaks in the middle of the visible band is not the answer.' },
      check: function (ev) { const d = parked(ev); return !!d && d.vis >= 0.4672; }
    },
    {
      id: 'stars-hr-h1', level: 4, hidden: true,
      riddle: { zh: '十萬盞燈，卻燒著最冷的顏色。', en: 'A hundred thousand lamps, burning the coldest colour.' },
      check: function (ev) { const d = parked(ev); return !!d && d.T < 4000 && d.L >= 0.95e5 && d.L <= 1.05e5; }
    },
    {
      id: 'stars-hr-h2', level: 5, hidden: true,
      riddle: { zh: '等它熄滅，宇宙要再活五十次。', en: 'Before it goes out, the Universe must live fifty times over.' },
      check: function (ev) { const d = parked(ev); return !!d && d.mode === 'ms' && d.life >= 50 * AGE && d.life <= 51 * AGE; }
    },
    {
      id: 'stars-hr-h3', level: 5, hidden: true,
      riddle: { zh: '一百萬分之一公尺。', en: 'One millionth of a metre.' },
      check: function (ev) { const d = parked(ev); return !!d && Math.abs(d.peak - 1000) <= 0.5; }
    }
  ]);
})();
