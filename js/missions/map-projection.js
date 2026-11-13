/* missions/map-projection.js — 地圖投影與變形的任務（星星數 = 等級；隱藏任務 = 等級 × 2）
 *
 * 事件（js/map-projection.js 只在使用者操作過之後才回報；載入頁面不算）：
 *   'map'：投影、參數、圖層、陸塊、量測點或航線改變時（拖曳中每 0.22 秒一次），data = MapProjectionCore.snapshot(…) = {
 *      proj（投影代號）, family（cyl／pseudo／conic／azi）, prop（conformal／equalArea／equidistant／compromise／perspective／greatCircle）,
 *      lam0、phiS、phi1、phi2、phi0（度）, n（圓錐常數）, img、grid、tissot（圖層）, heat, view（'2d'／'3d'）, unroll（3D 攤開 0–1）,
 *      shape：{ id, moved, lat, lon, trueArea, mapArea（km²）, ratio（地圖面積 ÷ 真實面積）, vsAfrica（地圖上 ÷ 原位非洲在地圖上）, trueVsAfrica } 或 null,
 *      probe：最新量測點 { lat, lon, visible, h, k, s（面積倍率）, omega（最大角度變形，度）, dist（方位投影：離中心 km）, az } 或 null,
 *      route：{ aLat, aLon, bLat, bLon, cityA, cityB（城市代號或 'custom'）, gc、rh（大圓、等角航線 km）, gcB、rhB（方位，度）,
 *               strG、strR（在目前地圖上偏離直線的比例，整條畫得出來才有值）, gcMaxLat（大圓的最高緯度） } 或 null,
 *      tw：臺灣本島範圍內的 { scale（最大比例誤差）, area（最大面積誤差） } 或 null }
 *   'cam'：3D 視角按鈕。
 */
(function () {
  'use strict';
  if (!window.LabMission) return;

  const M = function (ev) { return ev.type === 'map' ? ev.data : null; };
  const near = function (a, b, tol) { return a != null && Math.abs(a - b) <= tol; };
  const STRAIGHT = 2e-3;
  const straight = function (v) { return v != null && v < STRAIGHT; };
  const green = function (d) { return d.shape && d.shape.id === 'greenland' && d.shape.ratio != null; };
  const onTaipei = function (d) { return near(d.phi0, 25.03, 0.6) && near(d.lam0, 121.56, 0.6); };
  const city = function (c) { return typeof c === 'string' && c !== 'custom'; };

  LabMission.register('map-projection', [
    {
      id: 'map-projection-1', level: 1,
      title: { zh: '麥卡托地圖上的格陵蘭', en: 'Greenland on the Mercator map' },
      desc: { zh: '在麥卡托投影選「格陵蘭」（留在原位），讀出它在地圖上被放大成真實面積的 10 倍以上。', en: 'On the Mercator projection, pick “Greenland” (left where it is) and read that the map shows it more than 10 times its real area.' },
      check: function (ev) { const d = M(ev); return !!d && d.proj === 'mercator' && green(d) && !d.shape.moved && d.shape.ratio >= 10; }
    },
    {
      id: 'map-projection-2', level: 2,
      title: { zh: '把格陵蘭搬到赤道', en: 'Move Greenland to the equator' },
      desc: { zh: '在麥卡托地圖上把格陵蘭拖到赤道（中心在南北緯 3° 以內），它就縮回差不多真實的大小：放大倍率 1.1 倍以下。', en: 'On the Mercator map, drag Greenland to the equator (centre within 3° N or S): it shrinks to about its real size, enlarged no more than 1.1 times.' },
      check: function (ev) { const d = M(ev); return !!d && d.proj === 'mercator' && green(d) && d.shape.moved && Math.abs(d.shape.lat) <= 3 && d.shape.ratio <= 1.1; }
    },
    {
      id: 'map-projection-3', level: 2,
      title: { zh: '公平的地圖', en: 'A fair map' },
      desc: { zh: '換一張等積投影（例如等地球、莫爾維特），讓格陵蘭在地圖上的面積和真實面積相差不到 1%。', en: 'Switch to an equal-area projection (Equal Earth or Mollweide, for example) so that Greenland’s area on the map is within 1% of its real area.' },
      check: function (ev) { const d = M(ev); return !!d && d.prop === 'equalArea' && green(d) && near(d.shape.ratio, 1, 0.01); }
    },
    {
      id: 'map-projection-4', level: 3,
      title: { zh: '北緯 60° 的四倍', en: 'Four times at 60°' },
      desc: { zh: '在麥卡托地圖上點一個量測點，讓面積倍率落在 3.9–4.1 倍之間。想一想：這個地方的緯度是多少？為什麼？', en: 'On the Mercator map, place a measuring point where the area scale is between 3.9 and 4.1. Which latitude is it, and why?' },
      check: function (ev) { const d = M(ev); return !!d && d.proj === 'mercator' && d.probe && d.probe.visible && d.probe.s >= 3.9 && d.probe.s <= 4.1; }
    },
    {
      id: 'map-projection-5', level: 4,
      title: { zh: '跟非洲一樣大的錯覺', en: 'As big as Africa?' },
      desc: { zh: '在麥卡托地圖上移動格陵蘭，讓它在地圖上的面積和（原位的）非洲相差不到 3%。對照讀數：真實的格陵蘭只有非洲的幾分之一？', en: 'On the Mercator map, move Greenland until its area on the map is within 3% of Africa’s (Africa in place). Compare with the readout: what fraction of Africa is Greenland really?' },
      check: function (ev) { const d = M(ev); return !!d && d.proj === 'mercator' && green(d) && d.shape.moved && d.shape.vsAfrica != null && near(d.shape.vsAfrica, 1, 0.03); }
    },
    {
      id: 'map-projection-6', level: 4,
      title: { zh: '高爾－彼得斯的赤道', en: 'The equator of Gall–Peters' },
      desc: { zh: '選「等積圓柱」，把標準緯線 φs 調到 45°（高爾－彼得斯投影），在赤道附近（南北緯 2° 以內）放量測點：形狀被壓扁，角度變形至少 38.5°。', en: 'Choose “Cylindrical equal-area”, set the standard parallel φs to 45° (the Gall–Peters projection) and measure near the equator (within 2° N or S): shapes are squashed, with an angle distortion of at least 38.5°.' },
      check: function (ev) { const d = M(ev); return !!d && d.proj === 'cea' && near(d.phiS, 45, 0.5) && d.probe && d.probe.visible && Math.abs(d.probe.lat) <= 2 && d.probe.omega >= 38.5; }
    },
    {
      id: 'map-projection-7', level: 5,
      title: { zh: '不轉舵的船繞遠路', en: 'The ship that never turns takes the long way' },
      desc: { zh: '打開航線，從城市選單選兩座城市，讓等角航線（一路同一個羅盤方向）比大圓航線長 30% 以上。', en: 'Turn on the route and pick two cities from the menus so that the rhumb line (one compass bearing all the way) is at least 30% longer than the great circle.' },
      check: function (ev) { const d = M(ev); const r = d && d.route; return !!r && city(r.cityA) && city(r.cityB) && r.gc > 100 && r.rh / r.gc >= 1.3; }
    },
    {
      id: 'map-projection-8', level: 5,
      title: { zh: '給臺灣的圓錐', en: 'A cone for Taiwan' },
      desc: { zh: '選「蘭伯特等角圓錐」，調整兩條標準緯線，讓臺灣本島範圍內的比例誤差最大不超過 0.1%。', en: 'Choose “Lambert conformal conic” and adjust the two standard parallels so that the largest scale error over Taiwan is at most 0.1%.' },
      check: function (ev) { const d = M(ev); return !!d && d.proj === 'lcc' && d.tw && d.tw.scale <= 0.001; }
    },
    {
      id: 'map-projection-9', level: 6,
      title: { zh: '離臺北一萬公里', en: '10,000 km from Taipei' },
      desc: { zh: '用「等距方位」投影，把中心放在臺北（北緯 25°、東經 121.6° 附近，各 0.6° 以內），在地圖上找一個離臺北 9,900–10,100 公里的地方。', en: 'Use the azimuthal equidistant projection centred on Taipei (about 25° N, 121.6° E, each within 0.6°) and find a place 9,900–10,100 km from Taipei.' },
      check: function (ev) { const d = M(ev); return !!d && d.proj === 'aeqd' && onTaipei(d) && d.probe && d.probe.visible && d.probe.dist >= 9900 && d.probe.dist <= 10100; }
    },
    {
      id: 'map-projection-10', level: 7,
      title: { zh: '心射圖上的直線航線', en: 'A straight route on the gnomonic map' },
      desc: { zh: '在「心射」投影上畫出一條跨過赤道（一端在北半球、一端在南半球）、至少 6,000 公里的大圓航線，整條都在地圖上而且是直線（要移動地圖中心，讓兩端都離中心 70° 以內）。', en: 'On the gnomonic projection, show a great-circle route of at least 6,000 km that crosses the equator (one end in each hemisphere), entirely on the map and straight (move the centre so both ends are within 70° of it).' },
      check: function (ev) { const d = M(ev); const r = d && d.route; return !!r && d.proj === 'gnomonic' && r.aLat * r.bLat < 0 && r.gc >= 6000 && straight(r.strG); }
    },
    {
      id: 'map-projection-11', level: 8,
      title: { zh: '越過極點的捷徑', en: 'A shortcut over the pole' },
      desc: { zh: '拖曳航線的端點（至少拖一端），兩端都在南北緯 45° 以內，卻讓大圓航線幾乎正好越過北極或南極（緯度 89.5° 以上）。想一想：兩地的經度要差多少？', en: 'Drag the route’s ends (at least one of them) so that both are within 45° of the equator, yet the great circle passes almost exactly over the North or South Pole (latitude 89.5° or more). How far apart must their longitudes be?' },
      check: function (ev) { const d = M(ev); const r = d && d.route; return !!r && (!city(r.cityA) || !city(r.cityB)) && Math.abs(r.aLat) <= 45 && Math.abs(r.bLat) <= 45 && r.gcMaxLat >= 89.5; }
    },
    {
      id: 'map-projection-12', level: 9,
      title: { zh: '最好的兩條標準緯線', en: 'The best two standard parallels' },
      desc: { zh: '用「蘭伯特等角圓錐」，把臺灣本島範圍內的比例誤差壓到 0.025% 以下（可以點數字直接輸入，精確到 0.01°）。', en: 'With the Lambert conformal conic, push the largest scale error over Taiwan below 0.025% (tap the numbers to type them, to 0.01°).' },
      check: function (ev) { const d = M(ev); return !!d && d.proj === 'lcc' && d.tw && d.tw.scale <= 0.00025; }
    },

    // ---------- 隱藏任務 ----------
    {
      id: 'map-projection-h1', level: 3, hidden: true,
      riddle: { zh: '藍旗上的世界，被兩枝橄欖抱著。', en: 'A world on a blue flag, held by two olive branches.' },
      check: function (ev) { const d = M(ev); return !!d && d.proj === 'aeqd' && d.phi0 >= 89.5 && !d.img && d.grid && !d.tissot; }
    },
    {
      id: 'map-projection-h2', level: 4, hidden: true,
      riddle: { zh: '一南一北站得一樣遠，尖帽就成了筒。', en: 'Stand as far south as north, and the pointed hat becomes a tube.' },
      check: function (ev) { const d = M(ev); return !!d && d.family === 'conic' && d.n != null && Math.abs(d.n) <= 0.003 && Math.abs(d.phi1) >= 5; }
    },
    {
      id: 'map-projection-h3', level: 5, hidden: true,
      riddle: { zh: '退到無窮遠再回頭，家就在正中央。', en: 'Step back to infinity and turn around: home is right in the middle.' },
      check: function (ev) { const d = M(ev); return !!d && d.proj === 'ortho' && near(d.phi0, 23.7, 1.5) && near(d.lam0, 121, 1.5); }
    },
    {
      id: 'map-projection-h4', level: 5, hidden: true,
      riddle: { zh: '把尖帽一路壓扁，它就平躺成一張桌巾。', en: 'Press the pointed hat all the way down and it lies flat as a tablecloth.' },
      check: function (ev) { const d = M(ev); return !!d && d.family === 'conic' && d.n != null && Math.abs(d.n) >= 0.98; }
    },
    {
      id: 'map-projection-h5', level: 6, hidden: true,
      riddle: { zh: '最短的路和不轉舵的路，走成了同一條。', en: 'The shortest way and the never-turning way become one.' },
      check: function (ev) { const d = M(ev); const r = d && d.route; return !!r && r.gc >= 3000 && straight(r.strG) && straight(r.strR) && Math.abs(r.rh - r.gc) < 1; }
    },
    {
      id: 'map-projection-h6', level: 6, hidden: true,
      riddle: { zh: '被壓扁的世界裡，有一條線從來沒被壓扁。', en: 'In a squashed world there is one line that was never squashed.' },
      check: function (ev) { const d = M(ev); return !!d && d.proj === 'cea' && d.probe && d.probe.visible && Math.abs(d.probe.lat) >= 20 && d.probe.omega < 0.2; }
    },
    {
      id: 'map-projection-h7', level: 7, hidden: true,
      riddle: { zh: '折衷的世界裡，冰雪之島只在一條緯線上說實話。', en: 'In the compromise world, the island of ice tells the truth on only one parallel.' },
      check: function (ev) { const d = M(ev); return !!d && d.proj === 'robinson' && green(d) && d.shape.moved && near(d.shape.ratio, 1, 0.005); }
    },
    {
      id: 'map-projection-h8', level: 7, hidden: true,
      riddle: { zh: '攤開的扇面，剛好是半個月亮。', en: 'Unfolded, the fan is exactly half a moon.' },
      check: function (ev) { const d = M(ev); return !!d && d.view === '3d' && d.family === 'conic' && d.unroll >= 0.99 && d.n != null && near(Math.abs(d.n), 0.5, 0.01); }
    },
    {
      id: 'map-projection-h9', level: 8, hidden: true,
      riddle: { zh: '從家量出去，再也走不更遠了。', en: 'Measured from home, you cannot go any farther.' },
      check: function (ev) { const d = M(ev); return !!d && d.proj === 'aeqd' && onTaipei(d) && d.probe && d.probe.visible && d.probe.dist >= 19900; }
    },
    {
      id: 'map-projection-h10', level: 9, hidden: true,
      riddle: { zh: '冰原的兩端，不轉舵的船要多走一半的路。', en: 'Across the ice, the ship that never turns must sail half as far again.' },
      check: function (ev) { const d = M(ev); const r = d && d.route; return !!r && r.gc >= 1000 && r.rh / r.gc >= 1.52; }
    }
  ]);
})();
