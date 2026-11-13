/* missions/parallax.js — 恆星視差與秒差距的任務（星星數 = 等級；隱藏任務 = 等級 × 2）
 *
 * 事件（js/parallax.js 只在使用者操作過之後才回報；載入頁面不算）：
 *   'state'：任何設定改變時；'run'：一年的視差播完、拍完一張照片或「兩年拍 12 張」拍完、閃爍比對播完。data 都是 {
 *      mode（'orbit' 一年的視差、'measure' 量測距離、'baseline' 拉長基線）, star（預設恆星的代號；自己調過距離或黃緯是 ''）,
 *      d（真正的距離 pc）, p（真正的視差 ″）, beta、lam（黃緯、黃經 °）, pm（恆星有沒有自行）, mu（每年的自行 ″）,
 *      t（日期：從第 1 年 1 月 1 日起的年數）, opp（太陽黃經 − 恆星的衝的黃經，−180–180°；0 是恆星和太陽相對）,
 *      ellA、ellB（視差橢圓的半長軸、半短軸 ″）, nowX、nowY（今天的視差位移 ″）,
 *      inst（eye、bessel、ccd、hipparcos、gaia）, sigma（一張照片的誤差 ″）, n（照片張數）, span（照片的時間跨度，年）,
 *      gap（剛好兩張照片時的間隔，年；否則 null）, fitPM（同時解自行）,
 *      fp、fsp（量到的視差與它的標準差 ″；照片不夠是 null）, rel（fsp ÷ fp；fp ≤ 0 是 null）, err（|fp ÷ p − 1|）,
 *      B（基線 AU）, base（基線按鈕的代號）, theta（兩個觀測者看到的角位移 ″）, ratio（theta ÷ 2p）,
 *      chart, anim（目前模式的動畫正在播放） }。
 */
(function () {
  'use strict';
  if (!window.LabMission) return;

  const run = function (ev) { return ev.type === 'run' ? ev.data : null; };
  const any = function (ev) { return ev.type === 'state' || ev.type === 'run' ? ev.data : null; };
  const mode = function (ev, m) { const d = any(ev); return d && d.mode === m ? d : null; };
  const runOf = function (ev, m) { const d = run(ev); return d && d.mode === m ? d : null; };
  // 量測模式、沒在連拍
  const meas = function (ev) { const d = mode(ev, 'measure'); return d && !d.anim ? d : null; };
  // 模型要對：恆星有自行時必須同時解自行，否則報告的誤差不可信
  const valid = function (d) { return d.fitPM || !d.pm; };
  const good = function (d, r) { return valid(d) && d.rel != null && d.rel <= r; };

  LabMission.register('parallax', [
    {
      id: 'parallax-1', level: 1,
      title: { zh: '繞太陽一圈', en: 'Once round the Sun' },
      desc: { zh: '在「一年的視差」按「播放一年」，看恆星在望遠鏡裡畫出的路徑。', en: 'In “A year of parallax”, press “Play a year” and watch the path the star draws in the telescope.' },
      check: function (ev) { return !!runOf(ev, 'orbit'); }
    },
    {
      id: 'parallax-2', level: 2,
      title: { zh: '第一張照片', en: 'The first photograph' },
      desc: { zh: '在「量測距離」拍下第一張照片。', en: 'In “Measure the distance”, take your first photograph.' },
      check: function (ev) { const d = runOf(ev, 'measure'); return !!d && d.n >= 1; }
    },
    {
      id: 'parallax-3', level: 2,
      title: { zh: '哪一顆在動', en: 'Which one moved' },
      desc: { zh: '在「拉長基線」按「閃爍比對」，看兩個觀測者拍到的恆星位置不一樣。', en: 'In “A longer baseline”, press “Blink” and see the star sit in a different place for the two observers.' },
      check: function (ev) { return !!runOf(ev, 'baseline'); }
    },
    {
      id: 'parallax-4', level: 3,
      title: { zh: '壓扁的橢圓', en: 'A flattened ellipse' },
      desc: { zh: '在「一年的視差」把恆星放到黃道上，讓視差橢圓的半短軸不到半長軸的 1 %：恆星只會來回走一條線。', en: 'In “A year of parallax”, put the star on the ecliptic so the ellipse’s short axis is under 1 % of the long one: the star just goes back and forth along a line.' },
      check: function (ev) { const d = mode(ev, 'orbit'); return !!d && d.ellB <= 0.01 * d.ellA; }
    },
    {
      id: 'parallax-5', level: 3,
      title: { zh: '畫一個圓', en: 'Draw a circle' },
      desc: { zh: '在「一年的視差」把恆星移到黃極附近，讓視差橢圓的半短軸至少是半長軸的 99.5 %：幾乎是一個圓。', en: 'In “A year of parallax”, move the star near the ecliptic pole so the short axis is at least 99.5 % of the long one: almost a circle.' },
      check: function (ev) { const d = mode(ev, 'orbit'); return !!d && d.ellB >= 0.995 * d.ellA; }
    },
    {
      id: 'parallax-6', level: 4,
      title: { zh: '最近的鄰居', en: 'Our nearest neighbour' },
      desc: { zh: '量比鄰星的距離：至少 6 張照片，距離的誤差在 5 % 以內。', en: 'Measure the distance to Proxima Centauri: at least 6 photos and a distance error within 5 %.' },
      check: function (ev) { const d = meas(ev); return !!d && d.star === 'proxima' && d.n >= 6 && good(d, 0.05); }
    },
    {
      id: 'parallax-7', level: 5,
      title: { zh: '1838 年', en: '1838' },
      desc: { zh: '像貝索一樣，用量日儀量天鵝座 61，距離的誤差在 10 % 以內：一張照片的誤差比視差的一半還大，要拍很多張。', en: 'Like Bessel, measure 61 Cygni with the heliometer to within 10 %: one photo’s error is more than half the parallax, so you need many photos.' },
      check: function (ev) { const d = meas(ev); return !!d && d.inst === 'bessel' && d.star === 'cyg61' && good(d, 0.1); }
    },
    {
      id: 'parallax-8', level: 3,
      title: { zh: '第谷的結論', en: 'Tycho’s conclusion' },
      desc: { zh: '用肉眼拍至少 6 張，量出的誤差比視差本身還大（或量出負的視差）：第谷因為看不到視差，認為地球不會動。', en: 'With the naked eye, take at least 6 photos and get an error larger than the parallax (or a negative parallax): seeing no parallax, Tycho concluded the Earth stands still.' },
      check: function (ev) { const d = meas(ev); return !!d && d.inst === 'eye' && d.n >= 6 && d.fp != null && (d.fp <= 0 || d.fsp >= d.fp); }
    },
    {
      id: 'parallax-9', level: 5,
      title: { zh: '北極星有多遠', en: 'How far is Polaris' },
      desc: { zh: '用依巴谷衛星量北極星，距離的誤差在 10 % 以內。', en: 'Measure Polaris with Hipparcos, with a distance error within 10 %.' },
      check: function (ev) { const d = meas(ev); return !!d && d.inst === 'hipparcos' && d.star === 'polaris' && good(d, 0.1); }
    },
    {
      id: 'parallax-10', level: 6,
      title: { zh: '紅超巨星', en: 'A red supergiant' },
      desc: { zh: '用 Gaia 量參宿四，距離的誤差在 1 % 以內。', en: 'Measure Betelgeuse with Gaia, with a distance error within 1 %.' },
      check: function (ev) { const d = meas(ev); return !!d && d.inst === 'gaia' && d.star === 'betelgeuse' && good(d, 0.01); }
    },
    {
      id: 'parallax-11', level: 4,
      title: { zh: '從太陽系邊緣看', en: 'From the edge of the Solar System' },
      desc: { zh: '在「拉長基線」讓比鄰星跳 30″ 以上：新視野號 2020 年就這樣拍到了。', en: 'In “A longer baseline”, make Proxima Centauri jump by 30″ or more: New Horizons did exactly this in 2020.' },
      check: function (ev) { const d = mode(ev, 'baseline'); return !!d && d.star === 'proxima' && d.theta >= 30; }
    },
    {
      id: 'parallax-12', level: 7,
      title: { zh: '一百秒差距之外', en: 'Beyond a hundred parsecs' },
      desc: { zh: '用地面望遠鏡＋CCD，量 100 pc 以外的自訂恆星，距離的誤差在 20 % 以內。', en: 'With a ground telescope and CCD, measure a custom star 100 pc or more away to within 20 %.' },
      check: function (ev) { const d = meas(ev); return !!d && d.inst === 'ccd' && d.star === '' && d.d >= 100 && good(d, 0.2); }
    },

    // ───── 隱藏任務 ─────
    {
      id: 'parallax-h1', level: 3, hidden: true,
      title: { zh: '一秒差距', en: 'One parsec' },
      riddle: { zh: '從那裡回頭看，地球和太陽只隔一秒。', en: 'Look back from there, and the Earth and the Sun are one second apart.' },
      desc: { zh: '在「拉長基線」自訂一顆剛好在 1 pc 的恆星，基線剛好 1 AU（都在 0.2 % 內）：地球到太陽的距離從那裡看是 1″，這就是秒差距的定義。', en: 'In “A longer baseline”, make a custom star exactly 1 pc away and set the baseline to exactly 1 AU (both within 0.2 %): from there the Earth–Sun distance spans 1″, the definition of the parsec.' },
      check: function (ev) { const d = mode(ev, 'baseline'); return !!d && d.star === '' && Math.abs(d.d - 1) <= 0.002 && Math.abs(d.B - 1) <= 0.002; }
    },
    {
      id: 'parallax-h2', level: 4, hidden: true,
      title: { zh: '整夜可見', en: 'Up all night' },
      riddle: { zh: '太陽落下時它升起，太陽升起時它落下。', en: 'It rises as the Sun sets and sets as the Sun rises.' },
      desc: { zh: '把日期調到某顆真實的恆星與太陽相對（衝，誤差 1° 內）：這時它整夜可見，視差位移全在黃緯方向。', en: 'Set the date to when a real star is opposite the Sun (within 1°): it is up all night, and the parallax shift is entirely in latitude.' },
      check: function (ev) { const d = any(ev); return !!d && d.mode !== 'baseline' && d.star !== '' && Math.abs(d.opp) <= 1; }
    },
    {
      id: 'parallax-h3', level: 5, hidden: true,
      title: { zh: '比無限遠還遠', en: 'Farther than infinity' },
      riddle: { zh: '它算出來的距離，是負的。', en: 'The distance it gives is negative.' },
      desc: { zh: '不用肉眼，拍至少 6 張，卻量出負的視差：恆星太遠，誤差把視差蓋過去了。Gaia 的資料裡也有很多負視差的恆星。', en: 'Without the naked eye, take at least 6 photos and measure a negative parallax: the star is so far that the errors swamp it. Gaia’s catalogue has many such stars.' },
      check: function (ev) { const d = meas(ev); return !!d && d.inst !== 'eye' && valid(d) && d.n >= 6 && d.fp != null && d.fp < 0; }
    },
    {
      id: 'parallax-h4', level: 7, hidden: true,
      title: { zh: '忘了它在跑', en: 'Forgetting that it runs' },
      riddle: { zh: '跑得最快的那顆，你卻當它站著不動。', en: 'The fastest runner of all, and you treated it as standing still.' },
      desc: { zh: '不用肉眼量巴納德星，只解視差（不解自行），至少 6 張照片，量出的視差和真正的值差 50 % 以上：自行每年 10″，比視差大 19 倍。', en: 'Measure Barnard’s Star (not by eye) solving for parallax only (no proper motion), with at least 6 photos, and miss the true parallax by 50 % or more: its proper motion of 10″ a year is 19 times the parallax.' },
      check: function (ev) { const d = meas(ev); return !!d && d.star === 'barnard' && d.inst !== 'eye' && d.pm && !d.fitPM && d.n >= 6 && d.err != null && d.err >= 0.5; }
    },
    {
      id: 'parallax-h5', level: 6, hidden: true,
      title: { zh: '相隔半年', en: 'Six months apart' },
      riddle: { zh: '兩張就夠，只要選對日子。', en: 'Two are enough, if you pick the right days.' },
      desc: { zh: '一顆沒有自行的恆星，只拍兩張、相隔半年（誤差 0.02 年內），只解視差，距離的誤差在 5 % 以內：課本上最經典的量法。', en: 'For a star with no proper motion, take just two photos half a year apart (within 0.02 years), solve for parallax only, and get the distance within 5 %: the textbook method.' },
      check: function (ev) { const d = meas(ev); return !!d && !d.pm && !d.fitPM && d.n === 2 && d.gap != null && Math.abs(d.gap - 0.5) <= 0.02 && good(d, 0.05); }
    },
    {
      id: 'parallax-h6', level: 8, hidden: true,
      title: { zh: '銀河的另一頭', en: 'Across the Galaxy' },
      riddle: { zh: '它發出的光，比金字塔還老。', en: 'Its light is older than the pyramids.' },
      desc: { zh: '用 Gaia 量 2000 pc 以外的自訂恆星，距離的誤差在 10 % 以內：光要走 6500 年以上。', en: 'Measure a custom star 2000 pc or more away with Gaia to within 10 %: its light has travelled for more than 6500 years.' },
      check: function (ev) { const d = meas(ev); return !!d && d.inst === 'gaia' && d.star === '' && d.d >= 2000 && good(d, 0.1); }
    },
    {
      id: 'parallax-h7', level: 7, hidden: true,
      title: { zh: '肉眼也看得出來', en: 'Even the naked eye' },
      riddle: { zh: '站得夠開，第谷也會改變主意。', en: 'Stand far enough apart, and even Tycho would change his mind.' },
      desc: { zh: '在「拉長基線」讓一顆真實的恆星跳 60″（1 角分）以上，連肉眼都分辨得出來。', en: 'In “A longer baseline”, make a real star jump by 60″ (one arcminute) or more, enough for the naked eye.' },
      check: function (ev) { const d = mode(ev, 'baseline'); return !!d && d.star !== '' && d.theta >= 60; }
    },
    {
      id: 'parallax-h8', level: 9, hidden: true,
      title: { zh: '四張就夠', en: 'Four will do' },
      riddle: { zh: '張數不多，每一張都拍在最遠的那一刻。', en: 'Not many shots, each taken at the farthest moment.' },
      desc: { zh: '用地面望遠鏡＋CCD 量比鄰星（含自行），最多 4 張照片，距離的誤差卻在 1 % 以內：要挑視差位移最大的日子，而且前後跨一年左右。', en: 'Measure Proxima Centauri (with proper motion) with a ground telescope and CCD, using at most 4 photos, to within 1 %: pick the days of largest shift and spread them over about a year.' },
      check: function (ev) { const d = meas(ev); return !!d && d.inst === 'ccd' && d.star === 'proxima' && d.pm && d.fitPM && d.n <= 4 && good(d, 0.01); }
    },
    {
      id: 'parallax-h9', level: 6, hidden: true,
      title: { zh: '1997 年的參宿四', en: 'Betelgeuse in 1997' },
      riddle: { zh: '那顆紅色的巨人，衛星第一次替它量了身。', en: 'The red giant, measured from orbit for the first time.' },
      desc: { zh: '用依巴谷衛星量參宿四，距離的誤差在 10 % 以內：要拍很多很多張。', en: 'Measure Betelgeuse with Hipparcos to within 10 %: it takes a great many photos.' },
      check: function (ev) { const d = meas(ev); return !!d && d.inst === 'hipparcos' && d.star === 'betelgeuse' && good(d, 0.1); }
    },
    {
      id: 'parallax-h10', level: 4, hidden: true,
      title: { zh: '紅色星球的天文台', en: 'An observatory on the red planet' },
      riddle: { zh: '換一顆行星住，看出去的星空就跳得更多。', en: 'Live on another planet, and the stars jump more.' },
      desc: { zh: '把基線設成火星軌道的直徑（3.0–3.1 AU）：在火星上量視差，基線比地球長 1.5 倍。', en: 'Set the baseline to the diameter of Mars’s orbit (3.0–3.1 AU): measured from Mars, the baseline is 1.5 times Earth’s.' },
      check: function (ev) { const d = mode(ev, 'baseline'); return !!d && d.B >= 3.0 && d.B <= 3.1; }
    }
  ]);
})();
