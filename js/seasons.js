/* seasons.js — 「四季與太陽軌跡」的畫面與互動
 * 物理計算在 seasons-core.js；3D 檢視在 seasons-3d.js（three.js 切換到 3D 時才動態載入）。
 *
 * 主畫布分兩塊：
 *   左（窄螢幕在上）：地球繞日的軌道，從北方斜上方看（正投影，仰角 26°）。黃道座標 x 指向春分點、z 指向黃道北極；
 *     畫面右方 = 黃道 +y、畫面後方 = −x，所以 6 月的地球在左、12 月在右、3 月在後、9 月在前。尺寸未按比例。
 *   右（窄螢幕在下）：觀察者的天空（地平座標）。相機在南南東方（方位 160°）、仰角 28° 的正投影；半球代表天空。
 * 下方兩個小畫布：竿影俯視圖、同一束陽光照在地面（cos 效應）。另有一整年的變化圖。
 */
(function () {
  'use strict';
  const C = window.SeasonsCore;
  const LD = window.LabDraw;
  const cv = document.getElementById('cv');
  if (!C || !LD || !cv) return;
  const ctx = cv.getContext('2d');
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const isEn = function () { return !!(window.LabSettings && window.LabSettings.lang === 'en'); };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const A = LD.alpha, SH = LD.shade, MIX = LD.mix;
  const DEG = Math.PI / 180, RAD = 180 / Math.PI;
  const REAL_EPS = C.OBLIQ;
  const clamp = function (x, a, b) { return x < a ? a : x > b ? b : x; };
  const SEASONS = C.seasons();

  // =====================================================================
  // 地點
  // =====================================================================
  const LOCS = [
    { id: 'taipei', zh: '臺北', en: 'Taipei', full: ['臺北', 'Taipei'], lat: 25.03, lon: 121.56, zone: 8 },
    { id: 'taichung', zh: '臺中', en: 'Taichung', full: ['臺中', 'Taichung'], lat: 24.15, lon: 120.68, zone: 8 },
    { id: 'tainan', zh: '臺南', en: 'Tainan', full: ['臺南', 'Tainan'], lat: 22.99, lon: 120.2, zone: 8 },
    { id: 'hengchun', zh: '恆春', en: 'Hengchun', full: ['恆春', 'Hengchun'], lat: 22.0, lon: 120.75, zone: 8 },
    { id: 'chiayi', zh: '嘉義', en: 'Chiayi', full: ['嘉義・北回歸線', 'Chiayi, Tropic of Cancer'], lat: 23.44, lon: 120.42, zone: 8 },
    { id: 'hualien', zh: '花蓮', en: 'Hualien', full: ['花蓮・北回歸線', 'Hualien, Tropic of Cancer'], lat: 23.44, lon: 121.51, zone: 8 },
    { id: 'equator', zh: '赤道', en: 'Equator', full: ['赤道（印尼坤甸）', 'Equator (Pontianak, Indonesia)'], lat: 0, lon: 109.33, zone: 7 },
    { id: 'sydney', zh: '雪梨', en: 'Sydney', full: ['雪梨（澳洲）', 'Sydney, Australia'], lat: -33.87, lon: 151.21, zone: 10 },
    { id: 'tromso', zh: '特羅姆瑟', en: 'Tromsø', full: ['特羅姆瑟（挪威）', 'Tromsø, Norway'], lat: 69.65, lon: 18.96, zone: 1 },
    { id: 'npole', zh: '北極點', en: 'North Pole', full: ['北極點', 'North Pole'], lat: 90, lon: 0, zone: 0 },
    { id: 'spole', zh: '南極點', en: 'South Pole', full: ['南極點', 'South Pole'], lat: -90, lon: 0, zone: 0 }
  ];

  // =====================================================================
  // 陸地輪廓（經度, 緯度）：簡化的海岸線，只用來畫地球的外觀
  // =====================================================================
  const LAND = [
    // 歐亞大陸
    [-9.5,37,-8.9,38.5,-9.5,39.5,-8.7,41.5,-9.3,43,-8,43.7,-5.6,43.5,-3.6,43.5,-1.8,43.4,-1.3,44.5,-1.2,46.2,-2.3,47.1,-4.4,47.9,-4.7,48.6,-3,48.8,-1.6,48.7,-1.4,49.6,0.2,49.7,1.6,50.9,3.2,51.3,4.2,52.1,4.8,52.9,5.9,53.4,7.2,53.5,8.6,53.6,8.6,55.4,8.1,56.6,8.6,57.1,10.5,57.7,10.4,56.5,9.9,55.6,10.2,54.4,11.1,54,12.4,54.4,14,54,14.9,54.1,16.6,54.6,18.6,54.7,19.6,54.5,21,55.3,21.1,56.1,21.6,57.4,22.6,57.7,23.8,57.2,24.3,57.9,23.6,58.6,24.9,59.5,28,59.5,30.2,59.9,28.9,60.3,26.5,60.4,24.6,60,22.9,59.9,21.4,60.6,21.5,61.8,21.3,63,22.5,63.8,24.6,64.9,25.4,65.1,24.2,65.8,22.4,65.8,21.3,65,21.3,64.3,19.8,63.5,18,62.6,17.4,61.6,17.3,60.7,18.6,60.1,18.9,59.4,17.9,58.9,16.7,57.8,16.4,56.6,15.9,56.1,14.7,56.2,14.2,55.4,12.9,55.4,12.6,56.2,12.4,56.9,11.9,57.6,11.2,58.4,10.6,59.1,9.8,59,8.5,58.3,7,58,5.6,58.6,5.3,59.3,5,60.1,4.9,61.1,5.2,62,6.3,62.6,8,63.3,9.6,63.8,10.6,64.8,12.2,65.9,13.3,67,14.7,68.2,16,68.9,18,69.6,19.8,70,21.3,70.3,23.3,70.7,25.4,71.1,27.7,71,29.5,70.6,31.1,70.3,30,69.6,32.5,69.8,35.3,69.3,38,68.8,40.5,67.7,41.1,66.8,39.9,66.1,38,66,35.5,66.4,34.4,65.9,34.8,64.6,36.8,64.2,38,64.7,39.8,64.6,41,65.6,43.9,66.1,44.3,67.4,43.6,68.5,46.4,68.1,48.7,67.7,51.8,68.5,54.2,68.3,57,68.6,59.5,68.5,61,69,60.9,69.9,64.4,69.4,67.8,68.5,68.6,69.3,67,69.9,66.8,71.1,68.6,72.7,69.7,73,71.6,72.6,72.6,71.3,72,69.7,73.4,68.4,73.9,69.2,73.5,70.3,73,71,74.6,72.8,76,71.9,78.1,72.4,80.5,72.1,80.5,73.6,86.8,73.9,86.2,74.9,89,75.4,93,76,97.5,76,100.3,76.4,104.3,77.7,106.1,77.2,107.4,76.5,111.2,76.7,113.9,75.8,112.6,74.2,110.4,74.1,109.4,73.6,113,73.8,115.6,73.6,118.8,73.5,123.5,73,126.9,73.5,128.6,72.9,129.4,72,131.3,70.8,132.3,71.6,135.4,71.6,139.9,72.4,140.4,72.8,144.4,72.1,147,72.3,150.4,71.6,152,70.8,157,71,159.3,70.8,160.9,69.6,163.3,69.7,167.3,69.5,169.4,68.8,170.6,70,175.7,69.8,178.7,69.4,180,69.1,180,65.2,178.5,64.6,177,62.6,174,61.8,170.5,60,166,60.2,163.5,59.8,162,58,163.2,56.2,162,54.8,160,53.2,158.5,52.9,156.7,51.1,156,52.8,155.7,55.5,155.9,57.4,157.5,58.1,159.5,59.4,161.8,60.5,159.6,61.7,156.5,61.4,154.5,59.4,151.5,59.2,148.5,59.3,145,59.4,142.2,59.1,140,57.8,137.5,56.5,135.2,54.7,137.5,53.9,139.5,54.2,141.3,53.2,140.6,51,140.4,48.5,138.5,47,136,43.9,133,42.8,131.2,42.5,130.5,42.3,129.7,41,129.4,40,127.5,39.5,128.4,38.6,129.4,37,129.3,35.6,128.5,35,127,34.6,126.3,34.6,126.5,36,126.6,37.6,125.4,37.8,124.8,38.6,125.3,39.5,124.3,39.9,122.2,39.3,121.2,38.9,121.8,39.7,122.3,40.5,121,40.9,119.5,39.9,118,39.2,117.6,38.4,118.8,37.4,119.4,37.1,120.7,37.8,122.5,37.4,122.5,36.9,120.8,36.4,119.3,35,120.4,34.3,120.9,32.6,121.9,31.7,121.8,30.9,121.9,30,121.4,28.8,120.5,27.3,119.6,26,118.8,25,117.5,23.9,116.5,22.9,114.3,22.4,113.5,22.2,111.8,21.6,110.4,20.9,109.7,21.5,108.5,21.6,107.4,21.3,106.6,20.2,105.7,18.9,106.6,17.4,107.8,16.3,108.9,15.3,109.3,13.5,109.2,11.6,108,10.7,106.7,10.4,105,8.6,104.8,10.3,103.4,10.6,102.6,12.2,100.9,12.7,100.1,13.4,99.2,10.7,99.6,9.2,100.4,7.4,101.3,6.9,102.2,6.2,103.4,4.9,103.4,3.2,104.2,1.4,103.5,1.3,101.4,2.8,100.4,4.5,100.3,5.9,99.6,6.7,98.3,8.3,98.5,10.2,98.7,12.4,98.2,13.9,97.7,16.3,97.2,16.9,96.3,16.5,95.3,15.8,94.3,16,94.4,17.6,93.8,19.2,93,19.9,92.3,20.7,92,21.6,91.4,22.8,90.5,22.1,89.2,21.8,88.2,21.7,87,20.8,86.6,20,85.2,19.4,84.1,18.3,82.3,16.6,81.2,15.9,80.2,15,80.3,13.3,79.8,11.4,79.9,10.3,79.2,9.4,78.4,8.9,77.5,8.1,76.6,8.9,76.1,10.4,75.4,11.8,74.7,13.3,74.2,14.8,73.4,16.4,72.9,18.9,72.8,20.4,72.6,21.5,72.4,22.2,70.5,20.8,69,22.4,68.4,23.6,67.4,23.9,66.6,25.4,64.5,25.2,61.6,25.2,59.6,25.4,57.4,25.7,56.6,27,54.7,26.5,53.5,26.8,51.5,27.9,50.3,29.9,48.9,30.3,47.9,29.9,48.4,28.5,49.3,27.4,50.1,26.6,50.8,25,51.6,25.8,51.6,24.2,52.6,24.2,54,24.1,55.4,25.4,56.1,26.1,56.4,24.9,57.4,23.9,58.7,23.6,59.8,22.5,58.9,21,57.8,19.1,56.6,18.6,55.3,17.3,52.4,16.2,49.6,14.7,48.6,14,45.6,13.3,44,12.6,43.3,12.7,42.7,15.8,42.6,16.8,41.2,18.7,40,20.2,39.1,21.6,38.7,23.5,37.5,25,36.6,26.6,35.6,27.9,34.8,28.5,34.95,29.5,34.3,27.8,33.5,28.5,32.6,29.9,32.3,31.3,34.3,31.3,34.9,32.8,35.1,33.9,35.9,35.2,35.9,36.6,34.6,36.8,32.6,36.1,30.6,36.7,29.1,36.6,27.4,37,27.2,37.9,26.3,38.3,26.7,39.1,26.1,39.9,26.6,40.6,25.4,40.9,24,40.7,22.9,40.6,22.6,40.3,23.3,39.2,22.9,38.1,23.2,37.9,22.2,37.4,21.7,36.8,21.1,37.8,21.3,38.4,20.2,39.6,19.4,40.4,19.4,41.9,18.5,42.4,17.5,43,15.9,43.6,15.2,44.3,14.5,45.2,13.7,45.7,12.4,45.4,12.3,44.6,13.6,43.6,14.4,42.4,15.9,41.9,16.9,41.2,18.4,40.3,18.3,39.8,17,40.5,16.5,39.7,17.1,39,16.1,38,15.6,38.2,15.8,39.5,15,40.2,14.3,40.6,13,41.3,11.2,42.4,10.5,42.9,10.2,43.9,8.8,44.4,7.5,43.8,6.5,43.1,5,43.4,4,43.5,3.1,43.1,3.2,41.9,2.1,41.3,0.8,40.7,0,39.6,-0.4,39.1,0.2,38.7,-0.7,37.6,-1.5,37.3,-2.2,36.7,-4.4,36.7,-5.6,36],
    // 非洲
    [-5.6,35.9,-2,35.1,3,36.8,10,37.3,11,36.8,10.2,34.2,11.5,33.1,15.2,32.3,19,30.3,20.1,32,23,32.6,25,31.6,29,30.9,32.3,31.3,34.2,31.2,34.9,29.5,33.5,27.5,35.5,24,37.2,21,38.5,18,39.7,15.5,41.5,13.9,43.3,12.5,44.5,10.4,48,11.2,51.2,11.8,51,10.4,49.5,6.5,47.5,4.2,44.5,1.5,42,-1,40.2,-2.8,39.3,-4.6,39.7,-7,39.4,-8.5,40.5,-10.5,40.6,-15,37,-17.5,35.2,-21.5,35.5,-24,32.9,-26,32.5,-28.8,30.2,-31.3,27.5,-33.2,25.6,-34,22.5,-34,20,-34.8,18.4,-34,18.2,-31.6,16.5,-28.6,15.2,-26.6,14.5,-22.7,11.8,-17.3,12.3,-13.8,13.6,-11.5,13.2,-9,12.2,-6,9.5,-2.5,9.5,1,9.8,3.5,8.5,4.5,5.9,4.3,4.5,6.3,1.6,6.2,-2,4.7,-7.5,4.4,-11.5,6.8,-13.3,8.8,-15,11,-16.8,13.3,-17.5,14.7,-16.5,16.5,-16.2,20.2,-17,21.4,-15,24.5,-13.5,27,-9.8,29.6,-9.6,32.5,-6.8,34.1],
    // 北美洲
    [-166,68.9,-163.6,70.2,-156.6,71.3,-150,70.5,-141,69.6,-134.5,69.2,-128,70.1,-121,69.6,-114,68.3,-108,68.7,-101,67.8,-96,68.5,-94.5,71.9,-94,69,-88,68.5,-82,68,-81.5,66.5,-87,64.2,-90.5,63,-94,61,-94.8,59,-92.5,57,-88,56.5,-82.3,55.2,-82.2,53,-80,51.3,-79,54.5,-76.7,56,-77.5,58.5,-78,60.8,-77.5,62.5,-73,62.2,-70,61,-69.5,59,-65.5,59.8,-64.5,60.3,-61.5,56.5,-57.5,54.5,-55.7,52.2,-57,51.5,-60,50.2,-64,50.2,-67,49.3,-69.5,48,-66,48.9,-64.3,48.8,-65,47.8,-64.5,46.2,-61,45.3,-60,46,-63,44.6,-66,43.7,-66.2,45.1,-67.8,44.5,-70.2,43.6,-70.6,42.6,-70,41.8,-71.5,41.4,-74,40.6,-74,39.6,-75.5,38.5,-76,37,-75.6,35.3,-77,34.6,-79,33.5,-81,31.8,-81.4,30.3,-80.1,26.6,-80.4,25.2,-81.2,25.3,-82.6,27.7,-82.8,29.2,-84.3,30,-86,30.4,-88.5,30.3,-89.6,29.3,-90.5,29.1,-92,29.6,-94,29.6,-95.5,28.7,-97.2,27.5,-97.4,25.8,-97.7,23.5,-97.4,21.5,-96.4,19.5,-94.5,18.2,-92,18.6,-90.8,19.5,-90.4,21,-88,21.5,-86.8,21.2,-87.5,19.5,-88.2,17.6,-88.4,16,-86.4,15.8,-84,15.5,-83.3,14.7,-83.5,12,-83.7,10.9,-82.5,9.5,-81,8.8,-79.5,9.6,-77.4,8.6,-78.2,7.5,-80,7.3,-80.5,8.2,-82.5,8.2,-84.8,9.8,-85.8,11,-87.5,13,-90,13.8,-92.2,14.5,-94,16.1,-96.5,15.7,-99.5,16.8,-102,17.9,-105.4,19.8,-105.6,21.5,-106.8,23,-108.3,25.2,-109.4,26.6,-111.2,28,-112.8,30,-114.6,31.7,-114.2,30.2,-112.8,28.5,-112.2,27,-110.6,24.6,-109.6,23.2,-110.3,23.6,-112,24.9,-112.3,26.8,-114,28,-115.6,30.4,-117.1,32.5,-118.4,33.9,-120.6,34.6,-121.9,36.6,-122.5,37.8,-123.7,39,-124.2,40.5,-124.2,42,-124,44,-124,46.2,-124.6,48.2,-123,48.7,-123.2,49.3,-125,50,-127.5,50.8,-128.2,52.3,-130.2,54.2,-131.5,55.4,-133.5,57.2,-135.4,58.5,-137.8,58.9,-139.8,59.7,-142,60.1,-145.5,60.5,-148,60.6,-150.8,59.4,-153.3,58,-156,57,-159,55.9,-162.3,55,-164.5,54.5,-162,56,-158.5,57.5,-157.5,58.7,-161.9,58.7,-162.5,60,-165.2,60.6,-165,62.2,-164.2,63.2,-161,64.3,-163.7,64.6,-166.4,65.2,-168,65.6,-164.5,66.7,-163.8,67.6],
    // 南美洲
    [-77.3,8.6,-75.5,10.6,-74.2,11.3,-72.2,11.8,-71.3,12.4,-70,11.6,-68.3,10.6,-64.6,10.2,-62,10.6,-60.9,8.5,-59.3,8,-57,6,-54,5.8,-52,4.6,-51,3.5,-50,1.8,-50.5,0.2,-48.5,-1.2,-44.5,-2.4,-41.8,-2.9,-39,-3.9,-37.2,-4.9,-35.3,-5.5,-34.8,-7.5,-35.2,-9.2,-37,-11,-38.5,-13,-39.1,-15,-39.2,-17.6,-39.8,-19.6,-40.9,-21.9,-42,-23,-44.5,-23.3,-46.8,-24.2,-48.5,-26.1,-48.7,-28.5,-50.2,-30.4,-52,-32.3,-53.4,-33.8,-55,-34.9,-58.4,-34.6,-57,-36.3,-57.6,-38.2,-60,-38.9,-62.3,-38.8,-62.2,-40.6,-65,-41,-64.2,-42.3,-65.3,-44.6,-67.5,-46.2,-65.8,-47.8,-68.4,-50.1,-69.1,-51.7,-68.4,-52.4,-68.2,-53.5,-66.5,-55,-68.5,-55.5,-71,-55,-73,-53.5,-74.8,-52.1,-75.4,-49.5,-75.5,-46.8,-74.5,-45,-73.7,-43.4,-73.9,-41.5,-73.4,-39.5,-73.6,-37.2,-72.6,-35.5,-71.7,-33,-71.5,-30,-71.4,-27.5,-70.6,-25,-70.1,-21.5,-70.3,-18.4,-71.4,-17.6,-72.5,-16.6,-75.2,-15.3,-76.3,-13.6,-77.1,-12,-78.9,-8.6,-79.9,-6.9,-81.2,-5.9,-81.3,-4.2,-80.1,-3.3,-80.9,-2.1,-80.6,-0.5,-80.1,0.8,-79,1.6,-78.9,2.6,-77.4,4.1,-77.4,6.5,-77.9,7.3],
    // 澳洲、塔斯馬尼亞、紐西蘭
    [113.5,-22,114,-26.5,115,-29.5,115,-33.5,117.5,-35,121,-33.8,124,-33,126,-32.3,131,-31.5,134,-32.5,135.6,-34.8,137.8,-33,138,-35.5,140,-37.8,143.5,-38.8,146.3,-39,148,-37.8,150,-37.5,150.8,-34.5,152.5,-32,153.5,-28.5,153,-25,150.8,-22.6,149,-20.5,146.3,-19,145.4,-15,143.5,-14,142.5,-10.7,141.6,-12.8,141.5,-16.5,140,-17.7,137.5,-16,136.8,-12.2,132.6,-11.5,130.2,-12.8,129.4,-15,127,-14,125,-15.5,122.2,-17.5,121,-19.5,118.5,-20.4,116.5,-20.7,114.2,-21.8],
    [144.6,-40.7,148.3,-40.9,148,-43.2,146,-43.6,144.6,-41.5],
    [172.7,-34.5,174.6,-36.2,176,-37.6,178.5,-37.7,177,-39.3,176.8,-40.3,175.2,-41.6,174.6,-39.8,173.8,-39.2,174.6,-37.2],
    [172.6,-40.5,174.2,-41.7,173,-43.8,171.2,-44.4,170.7,-45.9,168.4,-46.6,166.5,-45.8,168.3,-44,170.8,-42.6],
    // 島嶼：臺灣、海南、日本、庫頁島、菲律賓、婆羅洲、蘇門答臘、爪哇、蘇拉威西、新幾內亞、斯里蘭卡、馬達加斯加
    [121.5,25.3,122,25,121.85,24.6,121.4,23.4,120.9,22.3,120.7,21.9,120.2,22.6,120.1,23.4,120.5,24.4,121,25],
    [108.6,19.2,110.3,20.1,111,19.6,110.1,18.4,109.2,18.3],
    [130.9,31.5,131.5,33.3,132.5,35.4,135.5,35.6,136.8,37.3,138.5,37.5,140,39.5,140,41.3,141.5,41.4,142,39.5,141,38.3,141,36,140.8,35.1,139.8,35,138.8,34.6,137,34.6,135.5,33.5,134,33.8,133,32.8,132,31,130.3,31.2],
    [140,41.5,141.5,42.5,143.5,42,145.5,43.3,144.5,44,141.9,45.5,141.2,43.2],
    [142,46,143.5,46.5,144.7,49,143,52,143,54.3,142.3,53.5,142.2,49],
    [120.5,18.5,122.3,18.5,122.2,16.3,121.5,15,124,13,123.3,12.8,121.8,14,120.6,14.4,119.8,16.3],
    [122,7,123.5,8,125.5,9.7,126.5,7.5,126,6.2,124.2,6.2],
    [109,1.5,110,1.7,111.5,2.8,113.5,3.2,115.4,5,117,7,119.3,5.3,118,4.4,118.5,1,117.5,0,116.5,-1.5,116.4,-3.8,114.5,-4,111.8,-3.4,110.2,-2.9,109,-0.5],
    [95.3,5.6,97.5,5.2,100.4,2.2,103.8,-1,106,-3.2,105.8,-5.8,104.5,-5.9,102.3,-4,100.3,-1,98.6,1.8],
    [105.2,-6.8,106,-6,108.3,-6.3,110.5,-6.9,112.7,-6.9,114.4,-7.8,112,-8.3,108.5,-7.8,106.5,-7.4],
    [119.5,-5.5,120.4,-5.5,120.5,-2.8,121.5,-1,123.3,-0.9,124.5,0.5,125,1.5,123,0.5,120.2,0.8,119.6,-0.5],
    [131,-1,134,-0.9,135.5,-3.3,138,-1.6,141,-2.6,145,-4.3,146,-5.5,147.8,-6,147.2,-7.5,148.5,-9,150.5,-10.3,147.5,-10,146,-8,144.2,-7.7,143.3,-9.2,141,-9.1,139,-8.1,138,-5.5,135,-4.4,133,-4,132,-2.8],
    [79.8,9.8,81,8.6,81.8,7,81,6,80,6,79.7,8],
    [49.3,-12,50.5,-15.5,49.5,-17.5,48,-22,47,-25,45,-25.5,43.5,-22,44.3,-18.5,44,-16.5,46.5,-15.7,48,-13.5],
    // 英國、愛爾蘭、冰島、紐芬蘭、古巴、海地島
    [-5.7,50,1.4,51.2,1.7,52.6,0,53.5,-1.6,55.6,-2,57,-3.9,57.6,-3,58.6,-5,58.6,-6.2,57.5,-5.6,56,-4.9,54.8,-3.3,54.9,-3,53.8,-4.6,53.3,-4.2,52.3,-5.2,51.7,-3.5,51.4],
    [-6,52,-6.3,54,-5.8,54.6,-7.3,55.3,-8.3,55.2,-10,54,-10,52,-9.5,51.6,-8,51.7],
    [-22.5,64,-24,65.5,-22,66.4,-16,66.5,-13.5,65.2,-15,64.3,-18.7,63.4,-21,63.8],
    [-59.4,47.6,-56,47.6,-53,46.7,-52.7,48.5,-55.6,49.9,-56,51.6,-57.5,50.6,-59,48.6],
    [-84.9,21.9,-83,22.9,-81,23.1,-78.6,22.4,-76,21,-74.2,20.2,-77.2,19.9,-78.5,21.5,-81.5,22.1,-83.8,21.8],
    [-74.4,18.5,-72.8,19.9,-70,19.7,-68.4,18.6,-71.5,17.6],
    // 北極海的島：巴芬島、埃爾斯米爾島、維多利亞島、斯瓦巴、新地島、楚科奇（換日線以東）
    [-78.5,72.5,-73,71.7,-69,70.3,-66.5,68.5,-62,66.8,-64,65.5,-65.5,63,-68.5,62.5,-71.7,63.8,-74,64.6,-77.5,64.3,-78,65.6,-74,67.3,-72.7,68.5,-76.7,69.3,-80,70,-85.5,71.5,-89.5,73.4,-85,73.7,-81,73.7],
    [-96,76.5,-89,74.6,-80,74.5,-78,77,-73,78.5,-64,81.5,-70,83,-85,82.6,-92,81,-95,79,-98,77.5],
    [-125,72,-117,74.3,-108,73.5,-104,71.5,-101.5,69.5,-106,68.8,-113,69.2,-118,69.5,-117,71,-124,70],
    [11,78.5,16,80,27,80.3,22,77.5,16,76.5],
    [52,71.5,56,73.5,60,76,68,77,62,74.5,56,71],
    [-180,65,-180,69,-175,67.5,-170,66.2,-172.5,64.5,-177,65]
  ];
  const ICE = [
    // 格陵蘭、南極洲
    [-73,78.2,-66,80.8,-56,82.2,-42,83.6,-28,83.3,-20,82,-12.5,81.6,-18.5,79.5,-18.5,76.5,-21.5,74,-23,71.5,-22,70.2,-25,68.7,-32,68,-37,65.8,-40.5,64.5,-42.5,61.5,-44,60,-46,60.8,-49,61.8,-51,64,-53,66.5,-54,69.4,-52,70.5,-55,72,-58,75.5,-62,76.2,-68,76.5],
    [-180,-90,180,-90,180,-78,170,-72,165,-70.5,150,-68.5,135,-66,120,-66.5,100,-65.5,88,-66.5,78,-68.5,70,-68,60,-67,50,-66.5,40,-69,30,-70,15,-70,0,-70.5,-10,-71.5,-20,-73.5,-30,-77,-45,-78.5,-55,-73,-58,-64,-62,-64.5,-65,-67,-68,-70,-75,-72.5,-90,-73,-100,-74,-110,-74.5,-125,-74,-140,-76,-150,-77.5,-165,-78.5,-180,-78]
  ];
  const LAKES = [
    // 裏海、黑海
    [47,45,49,46.6,51.5,47,53,45.3,51,44.5,52.8,41.8,53.9,40.5,53,39.3,53.8,37.3,51.5,36.8,49,37.5,48.8,38.8,49.5,40.3,48.5,41.8,47.5,43,46.8,44.4],
    [28,41.2,29.1,41.1,31.5,41.2,35,42,38.3,40.9,41.5,41.5,41.7,42.6,39.5,44,37.5,44.7,38.3,46.8,35,45.5,33.5,44.5,32.5,45.4,30.8,46.5,29.7,45.2,28.7,44,28,43]
  ];
  /** 把輪廓畫到等距圓柱投影的畫布上（w × h，經度 −180～180、緯度 90～−90） */
  function paintLand(g, w, h, colors) {
    const sx = w / 360, sy = h / 180;
    function poly(p) {
      g.beginPath();
      for (let i = 0; i < p.length; i += 2) {
        const x = (p[i] + 180) * sx, y = (90 - p[i + 1]) * sy;
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.closePath();
      g.fill();
    }
    g.fillStyle = colors.land; LAND.forEach(poly);
    g.fillStyle = colors.ice; ICE.forEach(poly);
    g.fillStyle = colors.lake; LAKES.forEach(poly);
  }
  // 2D 地球用的陸地遮罩（每 0.5°：0 海、1 陸、2 冰）
  const MW = 720, MH = 360;
  const MASK = new Uint8Array(MW * MH);
  (function () {
    const c = document.createElement('canvas'); c.width = MW; c.height = MH;
    const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, MW, MH);
    paintLand(g, MW, MH, { land: '#ff0000', ice: '#00ff00', lake: '#000000' });
    const d = g.getImageData(0, 0, MW, MH).data;
    for (let i = 0; i < MW * MH; i++) MASK[i] = d[i * 4] > 127 ? 1 : d[i * 4 + 1] > 127 ? 2 : 0;
  })();
  function landAt(lat, lon) {
    let x = Math.floor((lon + 180) * 2); x = ((x % MW) + MW) % MW;
    const y = clamp(Math.floor((90 - lat) * 2), 0, MH - 1);
    return MASK[y * MW + x];
  }

  // =====================================================================
  // 狀態
  // =====================================================================
  const reduce = LD.reducedMotion();
  const st = {
    loc: LOCS[0], lat: 25.03, lon: 121.56, zone: 8, day: 172, clock: 9.5, eps: REAL_EPS,
    refract: true, atmos: false, record: true, refArcs: true, labels: true,
    playing: false, mode: 'day', speed: 5, userPlay: false, user: false, dayF: 172,
    chart: 'Q'
  };
  // 竿影尖端的紀錄：cur = 目前這一天（每分鐘一點），old = 之前的天（淡淡的殘影）
  const rec = { cur: null, old: [], ana: null };
  const SPEED_DAY = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8];       // 小時／秒
  const SPEED_YEAR = [3, 5, 8, 12, 18, 24, 32, 45, 60, 90];         // 天／秒

  const elLat = $('lat'), elDay = $('day'), elClock = $('clock'), elEps = $('eps'), elSpeed = $('speed');
  const loc = function () { return { lat: st.lat, lon: st.lon, zone: st.zone, eps: st.eps, day: st.day, clock: st.clock }; };
  let snapKey = '', snapVal = null;
  function snap() {
    const k = [st.lat, st.lon, st.zone, st.day, st.clock, st.eps, st.refract, st.atmos].join('|');
    if (k !== snapKey) { snapKey = k; snapVal = C.snapshot(Object.assign(loc(), { refract: st.refract, atmos: st.atmos })); }
    return snapVal;
  }
  function seasonDay(k, zone) { return C.localOf(SEASONS[k], zone == null ? st.zone : zone).day; }
  function seasonOf(day) {
    for (const k of ['mar', 'jun', 'sep', 'dec']) if (seasonDay(k) === day) return k;
    return null;
  }
  function tNow() { return C.tOf(st.day, st.clock, st.zone); }

  // =====================================================================
  // 文字格式
  // =====================================================================
  function hm(h) {
    let x = Math.round(h * 60);
    let tag = '';
    if (x < 0) { x += 1440; tag = T('（前一天）', ' (day before)'); }
    if (x >= 1440) { x -= 1440; tag = T('（隔天）', ' (next day)'); }
    return String(Math.floor(x / 60)).padStart(2, '0') + ':' + String(x % 60).padStart(2, '0') + tag;
  }
  function dur(h) {
    const m = Math.round(h * 60);
    return isEn() ? Math.floor(m / 60) + ' h ' + (m % 60) + ' min' : Math.floor(m / 60) + ' 小時 ' + (m % 60) + ' 分';
  }
  const MON_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function dateText(n, short) {
    const d = C.dateOfDay(n);
    if (isEn()) return MON_EN[d.m - 1] + ' ' + d.d;
    return short ? d.m + '/' + d.d : d.m + ' 月 ' + d.d + ' 日';
  }
  function sgn(x, dec) { const s = Math.abs(x).toFixed(dec); return (x < 0 && +s !== 0 ? '−' : +s === 0 ? '' : '+') + s; }
  function latText(lat) {
    const a = Math.abs(lat).toFixed(2);
    if (+a === 0) return '0.00°';
    return isEn() ? a + '° ' + (lat > 0 ? 'N' : 'S') : (lat > 0 ? '北緯 ' : '南緯 ') + a + '°';
  }
  function latShort(lat) { const a = Math.abs(lat).toFixed(2); return +a === 0 ? '0.00°' : a + '°' + (lat > 0 ? 'N' : 'S'); }
  function lonText(lon) {
    const a = Math.abs(lon).toFixed(2);
    if (+a === 0) return '0.00°';
    return isEn() ? a + '° ' + (lon > 0 ? 'E' : 'W') : (lon > 0 ? '東經 ' : '西經 ') + a + '°';
  }
  function zoneText(z) { return 'UTC' + (z >= 0 ? '+' : '−') + Math.abs(z); }
  /** 方位角 → 「東偏北 5.7°」 */
  function dirText(az) {
    az = C.norm360(az);
    const names = isEn() ? ['N', 'E', 'S', 'W'] : ['北', '東', '南', '西'];
    const k = Math.round(az / 90) % 4, off = C.norm180(az - k * 90);
    if (Math.abs(off) < 0.05) return isEn() ? 'due ' + ['north', 'east', 'south', 'west'][k] : '正' + names[k];
    const side = off > 0 ? (k + 1) % 4 : (k + 3) % 4;
    return isEn() ? Math.abs(off).toFixed(1) + '° ' + names[side] + ' of ' + names[k] : names[k] + '偏' + names[side] + ' ' + Math.abs(off).toFixed(1) + '°';
  }
  function locName() {
    if (st.loc) return T(st.loc.full[0], st.loc.full[1]);
    return T('自訂緯度', 'Custom latitude');
  }

  // =====================================================================
  // 顏色
  // =====================================================================
  const tok = {};
  function readTokens() {
    const cs = getComputedStyle(document.documentElement);
    ['ss-sun', 'ss-ocean', 'ss-land', 'ss-ice', 'ss-night', 'ss-sky', 'ss-dusk', 'ss-ground', 'ss-soil', 'ss-pole'].forEach(function (k) {
      tok[k.slice(3)] = cs.getPropertyValue('--' + k).trim() || '#888888';
    });
    tok.rgb = {};
    ['ocean', 'land', 'ice', 'night'].forEach(function (k) { tok.rgb[k] = LD.rgb(tok[k]); });
  }
  function font(px, w) { return (w || '') + ' ' + px + 'px ' + LD.FONT; }

  // =====================================================================
  // 版面
  // =====================================================================
  let dpr = 1, W = 0, H = 0, narrow = false;
  const P = { orbit: { x: 0, y: 0, w: 0, h: 0 }, sky: { x: 0, y: 0, w: 0, h: 0 } };
  function layout() {
    W = cv.clientWidth;
    if (!W) return false;
    narrow = W < 640;
    if (narrow) {
      // 天空：天球半徑 Rd ≈ 0.44 W，高度 = 上方標題 40 + Rd (1 + sin 28°) + 下方標籤 46
      const h1 = Math.round(clamp(W * 0.82, 260, 340)), h2 = Math.round(40 + Math.min(W * 0.44, 200) * (1 + Math.sin(28 * DEG)) + 46);
      H = h1 + h2 + 8;
      P.orbit = { x: 0, y: 0, w: W, h: h1 };
      P.sky = { x: 0, y: h1 + 8, w: W, h: h2 };
    } else {
      H = Math.round(clamp(W * 0.48, 330, 440));
      const w1 = Math.round(W * 0.52);
      P.orbit = { x: 0, y: 0, w: w1, h: H };
      P.sky = { x: w1, y: 0, w: W - w1, h: H };
    }
    return true;
  }
  function resize() {
    if (!layout()) return;
    dpr = Math.min(3, window.devicePixelRatio || 1);
    cv.style.height = H + 'px';
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    bgKey = '';
    draw();
    drawSub();
  }

  // =====================================================================
  // 左：公轉軌道（黃道座標，AU）
  // =====================================================================
  const EL = 36 * DEG; // 視線仰角
  const VR = [0, 1, 0], VU = [-Math.sin(EL), 0, Math.cos(EL)], VO = [Math.cos(EL), 0, Math.sin(EL)]; // 畫面右、上、朝向觀看者
  let og = null;
  function orbitGeom() {
    const p = P.orbit;
    const rE = clamp(Math.min(p.w * 0.065, p.h * 0.08), 15, 28);
    const a = Math.max(60, Math.min(p.w / 2 - rE * 1.4 - 8, (p.h / 2 - rE * 1.6 - 40) / Math.sin(EL)));
    og = { rE: rE, rG: Math.max(11, rE * 0.6), a: a, cx: p.x + p.w / 2, cy: p.y + p.h * 0.52, rS: rE * 1.05 };
    return og;
  }
  function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function oproj(v) { return [og.cx + og.a * dot3(v, VR), og.cy - og.a * dot3(v, VU), dot3(v, VO)]; }
  /** 地球（日心黃道座標，AU）：太陽視黃經 λ 的反方向 */
  function earthPos(o) { const l = o.lambda * DEG; return [-o.R * Math.cos(l), -o.R * Math.sin(l), 0]; }
  /** 赤道座標 → 黃道座標 */
  function eq2ecl(v, eps) { const c = Math.cos(eps * DEG), s = Math.sin(eps * DEG); return [v[0], v[1] * c + v[2] * s, -v[1] * s + v[2] * c]; }
  function geo2eq(lat, lon, theta) {
    const la = lat * DEG, lo = (lon + theta) * DEG;
    return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
  }

  // ---- 地球的立體貼圖（每個像素算光照與經緯度） ----
  const earthCache = new Map();
  function earthSprite(r, o, eps, theta, ghost) {
    const key = [r.toFixed(1), dpr, o.lambda.toFixed(ghost ? 1 : 3), eps.toFixed(3), theta.toFixed(ghost ? 0 : 2), LD.ver, ghost ? 1 : 0].join('|');
    let sp = earthCache.get(key);
    if (sp) return sp;
    const rr = r * dpr, S = Math.ceil(2 * rr) + 2, c0 = S / 2;
    const c = document.createElement('canvas'); c.width = S; c.height = S;
    const g = c.getContext('2d');
    const img = g.createImageData(S, S), d = img.data;
    const l = o.lambda * DEG, sx = Math.cos(l), sy = Math.sin(l); // 太陽方向（由地球看）
    const ce = Math.cos(eps * DEG), se = Math.sin(eps * DEG);
    const OC = tok.rgb.ocean, LC = tok.rgb.land, IC = tok.rgb.ice, NC = tok.rgb.night;
    const dark = LD.dark;
    // 鏡面反射的半向量（太陽方向與視線方向的平分線）
    let hx = sx + VO[0], hy = sy + VO[1], hz = VO[2];
    const hn = Math.hypot(hx, hy, hz); hx /= hn; hy /= hn; hz /= hn;
    for (let py = 0; py < S; py++) {
      const v = (c0 - (py + 0.5)) / rr;
      for (let px = 0; px < S; px++) {
        const u = (px + 0.5 - c0) / rr, q = u * u + v * v;
        if (q > 1 + 2 / rr) continue;
        const rq = Math.sqrt(q);
        const edge = clamp((1 - rq) * rr + 0.5, 0, 1);
        if (edge <= 0) continue;
        const w = Math.sqrt(Math.max(0, 1 - q));
        // 畫面座標 → 黃道座標的法向量
        const nx = u * VR[0] + v * VU[0] + w * VO[0];
        const ny = u * VR[1] + v * VU[1] + w * VO[1];
        const nz = u * VR[2] + v * VU[2] + w * VO[2];
        const lit = nx * sx + ny * sy;
        // 黃道 → 赤道 → 經緯度
        const ey = ny * ce - nz * se, ez = ny * se + nz * ce;
        const lat = Math.asin(clamp(ez, -1, 1)) * RAD;
        const lon = Math.atan2(ey, nx) * RAD - theta;
        let type = landAt(lat, lon);
        if (type === 0 && Math.abs(lat) > 78) type = 2;
        const base = type === 1 ? LC : type === 2 ? IC : OC;
        // 白天：漫射＋海面反光；夜晚：暗藍、看得出淡淡的陸地；晨昏線柔和過渡
        const day = clamp((lit + 0.06) / 0.14, 0, 1);
        const sm = day * day * (3 - 2 * day);
        const diff = 0.3 + 0.7 * Math.max(0, lit);
        let spec = 0;
        if (type === 0 && lit > 0) { const nh = nx * hx + ny * hy + nz * hz; if (nh > 0.9) spec = Math.pow(nh, 60) * 0.55; }
        const limb = 0.72 + 0.28 * w;
        const nk = dark ? 0.22 : 0.3;
        let rC = (NC[0] * (1 - nk) + base[0] * nk * 0.6) * (1 - sm) + (base[0] * diff + 255 * spec) * sm;
        let gC = (NC[1] * (1 - nk) + base[1] * nk * 0.6) * (1 - sm) + (base[1] * diff + 255 * spec) * sm;
        let bC = (NC[2] * (1 - nk) + base[2] * nk * 0.6 + 18) * (1 - sm) + (base[2] * diff + 255 * spec) * sm;
        const i = (py * S + px) * 4;
        d[i] = clamp(rC * limb, 0, 255); d[i + 1] = clamp(gC * limb, 0, 255); d[i + 2] = clamp(bC * limb, 0, 255);
        d[i + 3] = 255 * edge * (ghost ? 0.92 : 1);
      }
    }
    g.putImageData(img, 0, 0);
    sp = { c: c, S: S };
    if (earthCache.size > 40) earthCache.clear();
    earthCache.set(key, sp);
    return sp;
  }
  /** 地球上的線：地軸、赤道、回歸線、極圈、晨昏線、直射點、觀察者 */
  function earthLines(g, X, Y, r, o, eps, theta, t, opts) {
    const toV = function (eqv) { const e = eq2ecl(eqv, eps); return [dot3(e, VR), dot3(e, VU), dot3(e, VO)]; };
    function circle(lat, color, width, dash, alpha) {
      g.save();
      g.strokeStyle = A(color, alpha);
      g.lineWidth = width;
      if (dash) g.setLineDash(dash);
      g.beginPath();
      let pen = false;
      for (let k = 0; k <= 96; k++) {
        const v = toV(geo2eq(lat, k * 3.75, theta));
        if (v[2] >= -0.02) {
          const x = X + v[0] * r, y = Y - v[1] * r;
          if (pen) g.lineTo(x, y); else { g.moveTo(x, y); pen = true; }
        } else pen = false;
      }
      g.stroke();
      g.restore();
    }
    const small = r < 18;
    circle(0, '#ffffff', small ? 0.8 : 1, null, 0.55);
    if (!small) {
      circle(eps, tok.sun, 1.1, [3, 2.5], 0.95);
      circle(-eps, tok.sun, 1.1, [3, 2.5], 0.95);
      circle(90 - eps, '#bfe3ff', 1, [2, 2.5], 0.8);
      circle(-(90 - eps), '#bfe3ff', 1, [2, 2.5], 0.8);
    }
    // 晨昏線：垂直於陽光的大圓（前半）
    if (!small) {
      const l = o.lambda * DEG, s = [Math.cos(l), Math.sin(l), 0];
      const a1 = [-s[1], s[0], 0], a2 = [0, 0, 1];
      g.save();
      g.strokeStyle = A(tok.sun, 0.55);
      g.lineWidth = 1;
      g.beginPath();
      let pen = false;
      for (let k = 0; k <= 72; k++) {
        const ang = k * 5 * DEG, e = [a1[0] * Math.cos(ang) + a2[0] * Math.sin(ang), a1[1] * Math.cos(ang) + a2[1] * Math.sin(ang), a2[2] * Math.sin(ang)];
        const v = [dot3(e, VR), dot3(e, VU), dot3(e, VO)];
        if (v[2] >= 0) { const x = X + v[0] * r, y = Y - v[1] * r; if (pen) g.lineTo(x, y); else { g.moveTo(x, y); pen = true; } } else pen = false;
      }
      g.stroke();
      g.restore();
    }
    // 地軸：兩極向外延伸，藏在地球後面的部分不畫
    const pn = toV([0, 0, 1]);
    g.save();
    g.lineCap = 'round';
    [1, -1].forEach(function (sgn1) {
      const ext = sgn1 > 0 ? 1.55 : 1.3;
      g.beginPath();
      let pen = false;
      for (let k = 0; k <= 20; k++) {
        const f = 1 + (ext - 1) * k / 20;
        const v = [pn[0] * f * sgn1, pn[1] * f * sgn1, pn[2] * f * sgn1];
        const vis = v[2] >= 0 || Math.hypot(v[0], v[1]) > 1.02;
        const x = X + v[0] * r, y = Y - v[1] * r;
        if (vis) { if (pen) g.lineTo(x, y); else { g.moveTo(x, y); pen = true; } } else pen = false;
      }
      g.strokeStyle = A(LD.c['canvas-bg'], 0.7);
      g.lineWidth = small ? 2.6 : 3.6;
      g.stroke();
      g.strokeStyle = sgn1 > 0 ? LD.c.text : A(LD.c.text, 0.65);
      g.lineWidth = small ? 1.2 : 1.8;
      g.stroke();
    });
    g.restore();
    if (!small && opts && opts.marks) {
      // 直射點
      const ss = C.subsolar(t, o);
      const vs = toV(geo2eq(ss.lat, ss.lon, theta));
      if (vs[2] > 0) {
        const x = X + vs[0] * r, y = Y - vs[1] * r;
        const gr = g.createRadialGradient(x, y, 0, x, y, 7);
        gr.addColorStop(0, A('#ffffff', 0.95)); gr.addColorStop(0.35, A(tok.sun, 0.9)); gr.addColorStop(1, A(tok.sun, 0));
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fill();
      }
      // 觀察者
      const vo = toV(geo2eq(st.lat, st.lon, theta));
      if (vo[2] > -0.05) {
        const x = X + vo[0] * r, y = Y - vo[1] * r;
        g.save();
        g.globalAlpha = vo[2] > 0 ? 1 : 0.4;
        g.fillStyle = LD.c.pos; g.strokeStyle = '#ffffff'; g.lineWidth = 1.5;
        g.beginPath(); g.arc(x, y, 3.6, 0, Math.PI * 2); g.fill(); g.stroke();
        g.restore();
      }
    }
  }
  function drawEarth(g, X, Y, r, o, eps, theta, t, ghost) {
    // 大氣光暈（向陽面亮一點）
    const glow = g.createRadialGradient(X, Y, r * 0.9, X, Y, r * 1.28);
    glow.addColorStop(0, A('#8cc8ff', LD.dark ? 0.45 : 0.32));
    glow.addColorStop(1, A('#8cc8ff', 0));
    g.fillStyle = glow;
    g.beginPath(); g.arc(X, Y, r * 1.28, 0, Math.PI * 2); g.fill();
    const sp = earthSprite(r, o, eps, theta, ghost);
    g.drawImage(sp.c, X - sp.S / dpr / 2, Y - sp.S / dpr / 2, sp.S / dpr, sp.S / dpr);
    earthLines(g, X, Y, r, o, eps, theta, t, { marks: !ghost });
  }

  // 星空（深色模式）與背景：離屏畫布，參數改變時才重畫
  const bgCv = document.createElement('canvas');
  let bgKey = '';
  function rand(seed) { let s = seed; return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
  function buildBg() {
    bgCv.width = cv.width; bgCv.height = cv.height;
    const g = bgCv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    [P.orbit, P.sky].forEach(function (p, i) {
      g.save();
      LD.roundRect(g, p.x, p.y, p.w, p.h, 8);
      g.clip();
      g.translate(p.x, p.y);
      LD.backdrop(g, p.w, p.h);
      if (i === 0) {
        // 繞日軌道：深色模式畫淡淡的星星，淺色模式畫極淡的點
        const R = rand(97);
        for (let k = 0; k < Math.round(p.w * p.h / 900); k++) {
          const x = R() * p.w, y = R() * p.h, m = R();
          g.fillStyle = A(LD.dark ? '#ffffff' : LD.c.text, LD.dark ? 0.15 + 0.5 * m * m : 0.05 + 0.08 * m);
          g.beginPath(); g.arc(x, y, 0.4 + m * 0.9, 0, Math.PI * 2); g.fill();
        }
      }
      g.restore();
    });
    if (!narrow) { // 兩塊之間的分隔線
      g.strokeStyle = A(LD.c.text, 0.08); g.lineWidth = 1;
      g.beginPath(); g.moveTo(P.sky.x + 0.5, 10); g.lineTo(P.sky.x + 0.5, H - 10); g.stroke();
    }
  }

  function drawOrbit(g) {
    orbitGeom();
    const p = P.orbit;
    const t = tNow();
    const o = C.sunAt(t, st.eps);
    g.save();
    LD.roundRect(g, p.x, p.y, p.w, p.h, 8);
    g.clip();
    // 軌道曲線（取一整年的位置）
    const pts = [];
    for (let k = 0; k <= 180; k++) { const oo = C.orbit(SEASONS.peri + k * 365.2596 / 180); pts.push(oproj(earthPos(oo))); }
    function orbitPart(front) {
      g.save();
      g.lineCap = 'round';
      for (let pass = 0; pass < 2; pass++) {
        g.beginPath();
        let pen = false;
        for (let k = 0; k < pts.length; k++) {
          const q = pts[k];
          if ((q[2] >= 0) === front) { if (pen) g.lineTo(q[0], q[1]); else { g.moveTo(q[0], q[1]); pen = true; } } else pen = false;
        }
        if (pass === 0) { g.strokeStyle = A(LD.c.text, front ? 0.16 : 0.08); g.lineWidth = front ? 4 : 3; }
        else { g.strokeStyle = A(LD.c.accent, front ? 0.85 : 0.45); g.lineWidth = front ? 1.8 : 1.3; }
        g.stroke();
      }
      g.restore();
    }
    // 地球們（四季的位置＋現在的位置），依遠近排序
    const items = [];
    const curPos = earthPos(o);
    const curP = oproj(curPos);
    ['mar', 'jun', 'sep', 'dec'].forEach(function (k) {
      const day = seasonDay(k);
      const tg = C.tOf(day, 12, st.zone);
      const og2 = C.sunAt(SEASONS[k], st.eps);
      const pos = earthPos(og2);
      const q = oproj(pos);
      if (Math.hypot(q[0] - curP[0], q[1] - curP[1]) < og.rE + og.rG + 2) return; // 和現在的地球重疊就不畫
      items.push({ k: k, q: q, o: og2, t: tg, ghost: true, theta: C.greenwich(tg, C.sunAt(tg, st.eps)) });
    });
    items.push({ k: 'now', q: curP, o: o, t: t, ghost: false, theta: C.greenwich(t, o) });
    items.sort(function (a, b) { return a.q[2] - b.q[2]; });
    orbitPart(false);
    // 太陽到現在地球的光束（示意）
    const sunP = oproj([0, 0, 0]);
    // 先畫在太陽後面的地球
    items.filter(function (it) { return it.q[2] < 0; }).forEach(drawItem);
    drawSun(g, sunP[0], sunP[1], og.rS);
    orbitPart(true);
    items.filter(function (it) { return it.q[2] >= 0; }).forEach(drawItem);
    function drawItem(it) {
      const r = it.ghost ? og.rG : og.rE;
      if (!it.ghost) {
        // 光線：太陽 → 地球（淡淡的楔形）
        const dx = it.q[0] - sunP[0], dy = it.q[1] - sunP[1], L = Math.hypot(dx, dy) || 1;
        const nx = -dy / L, ny = dx / L;
        const gr = g.createLinearGradient(sunP[0], sunP[1], it.q[0], it.q[1]);
        gr.addColorStop(0, A(tok.sun, LD.dark ? 0.22 : 0.18)); gr.addColorStop(1, A(tok.sun, 0.02));
        g.fillStyle = gr;
        g.beginPath();
        g.moveTo(sunP[0] + nx * og.rS * 0.5, sunP[1] + ny * og.rS * 0.5);
        g.lineTo(it.q[0] + nx * r * 0.95, it.q[1] + ny * r * 0.95);
        g.lineTo(it.q[0] - nx * r * 0.95, it.q[1] - ny * r * 0.95);
        g.lineTo(sunP[0] - nx * og.rS * 0.5, sunP[1] - ny * og.rS * 0.5);
        g.closePath(); g.fill();
      }
      drawEarth(g, it.q[0], it.q[1], r, it.o, st.eps, it.theta, it.t, it.ghost);
    }
    // 近日點、遠日點的記號
    const apsides = [[SEASONS.peri, T('近日點', 'Perihelion')], [SEASONS.aph, T('遠日點', 'Aphelion')]].map(function (m) {
      const q = oproj(earthPos(C.orbit(m[0])));
      g.save();
      g.fillStyle = LD.c.accent;
      g.translate(q[0], q[1]); g.rotate(Math.PI / 4);
      g.fillRect(-3.2, -3.2, 6.4, 6.4);
      g.restore();
      return { q: q, t: m[0], name: m[1] };
    });
    // 公轉方向箭頭（逆時針，畫在前方）
    const k0 = C.orbit(SEASONS.sep - 18), k1 = C.orbit(SEASONS.sep - 10);
    const q0 = oproj(earthPos(k0)), q1 = oproj(earthPos(k1));
    LD.arrow(g, q0[0], q0[1], q1[0], q1[1], A(LD.c.accent, 0.9), 2);
    // 北極星方向（右上角）：地軸在畫面上的方向
    const ax = Math.sin(st.eps * DEG), ay = Math.cos(st.eps * DEG) * Math.cos(EL);
    const an = Math.hypot(ax, ay) || 1;
    const Lp = narrow ? 24 : 30;
    const px0 = p.x + p.w - (narrow ? 22 : 28), py0 = p.y + 20 + Lp * 0.5 + 8;
    LD.arrow(g, px0 - ax / an * Lp * 0.5, py0 + ay / an * Lp * 0.5, px0 + ax / an * Lp * 0.5, py0 - ay / an * Lp * 0.5, LD.c.text, 1.8);
    drawStar(g, px0 + ax / an * (Lp * 0.5 + 8), py0 - ay / an * (Lp * 0.5 + 8), 5);
    let polBox = null;
    if (st.labels) {
      const pf = font(11, '600');
      g.font = pf;
      const tw = g.measureText(T('北極星', 'Polaris')).width;
      LD.haloText(g, T('北極星', 'Polaris'), px0 - 10, py0 + Lp * 0.5 + 4, LD.c.muted, 'right', 'alphabetic', pf);
      polBox = { x: px0 - 12 - tw, y: p.y + 8, w: tw + 40, h: Lp + 30 };
    }
    // 標題與比例說明
    const tb = LD.pill(g, T('地球繞日（由北方斜上方看）', 'The Earth around the Sun (seen from above the north)'), p.x + 8, p.y + 26, LD.c.text, 'left', font(narrow ? 11.5 : 12.5, '700'));
    const nb = LD.pill(g, T('尺寸未按比例', 'Sizes not to scale'), p.x + 8, p.y + p.h - 8, LD.c.muted, 'left', font(11, '600'));
    // 標籤：依序找不會重疊的位置（上、下、左、右）
    if (st.labels) {
      const boxes = [tb, nb];
      if (polBox) boxes.push(polBox);
      const avoid = [{ x: sunP[0], y: sunP[1], r: og.rS + 3 }];
      items.forEach(function (it) { avoid.push({ x: it.q[0], y: it.q[1], r: (it.ghost ? og.rG : og.rE * 1.3) + 3 }); }); // 主角地球連地軸一起避開
      apsides.forEach(function (a) { avoid.push({ x: a.q[0], y: a.q[1], r: 5 }); });
      const labels = [];
      labels.push({ text: dateText(st.day, true), color: LD.c.pos, f: font(12, '700'), x: curP[0], y: curP[1], r: og.rE * 1.6, prefs: ['above', 'below', 'right', 'left'] });
      items.forEach(function (it) {
        if (!it.ghost) return;
        const name = { mar: T('春分', 'Mar equinox'), jun: T('夏至', 'Jun solstice'), sep: T('秋分', 'Sep equinox'), dec: T('冬至', 'Dec solstice') }[it.k];
        labels.push({ text: name + ' ' + dateText(seasonDay(it.k), true), color: LD.c.muted, f: font(narrow ? 10.5 : 11.5, '600'), x: it.q[0], y: it.q[1], r: og.rG * 1.5, prefs: ['above', 'below', 'right', 'left'] });
      });
      apsides.forEach(function (a) {
        const d = C.dateOfDay(C.localOf(a.t, st.zone).day);
        const txt = a.name + ' ' + (isEn() ? MON_EN[d.m - 1] + ' ' + d.d : d.m + '/' + d.d) + (narrow ? '' : T('・', ' · ') + C.orbit(a.t).R.toFixed(3) + ' AU');
        labels.push({ text: txt, color: LD.c.accent, f: font(narrow ? 10.5 : 11, '600'), x: a.q[0], y: a.q[1], r: 6, prefs: ['below', 'above', a.q[0] > og.cx ? 'left' : 'right', 'below2', 'above2'] });
      });
      placePills(g, labels, boxes, avoid, p);
    }
    g.restore();
  }
  /** 依序放置標籤：每個標籤試幾個候選位置，選第一個不和既有標籤、物體重疊的位置 */
  function placePills(g, labels, boxes, avoid, b) {
    const overlap = function (r) {
      for (let i = 0; i < boxes.length; i++) { const o = boxes[i]; if (r.x < o.x + o.w + 2 && o.x < r.x + r.w + 2 && r.y < o.y + o.h + 2 && o.y < r.y + r.h + 2) return true; }
      for (let i = 0; i < avoid.length; i++) {
        const c = avoid[i], nx = clamp(c.x, r.x, r.x + r.w), ny = clamp(c.y, r.y, r.y + r.h);
        if (Math.hypot(nx - c.x, ny - c.y) < c.r) return true;
      }
      return false;
    };
    labels.forEach(function (it) {
      g.font = it.f;
      const m = g.measureText(it.text);
      const w = m.width + 12, h = LD.textHeight(m, 15) + 3;
      let best = null;
      for (let k = 0; k < it.prefs.length; k++) {
        const pf = it.prefs[k];
        let x, y;
        if (pf === 'above' || pf === 'above2') { x = it.x - w / 2; y = it.y - it.r - 4 - h - (pf === 'above2' ? h + 2 : 0); }
        else if (pf === 'below' || pf === 'below2') { x = it.x - w / 2; y = it.y + it.r + 4 + (pf === 'below2' ? h + 2 : 0); }
        else if (pf === 'left') { x = it.x - it.r - 6 - w; y = it.y - h / 2; }
        else { x = it.x + it.r + 6; y = it.y - h / 2; }
        x = clamp(x, b.x + 4, b.x + b.w - 4 - w);
        y = clamp(y, b.y + 4, b.y + b.h - 4 - h);
        const r = { x: x, y: y, w: w, h: h };
        if (!best) best = r;
        if (!overlap(r)) { best = r; break; }
      }
      boxes.push(best);
      LD.pill(g, it.text, best.x, best.y + best.h, it.color, 'left', it.f);
    });
  }
  function drawStar(g, x, y, r) {
    g.save();
    g.translate(x, y);
    g.fillStyle = tok.sun;
    g.strokeStyle = A(LD.c['canvas-bg'], 0.8); g.lineWidth = 2;
    g.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    g.closePath(); g.stroke(); g.fill();
    g.restore();
  }
  function drawSun(g, x, y, r) {
    const glow = g.createRadialGradient(x, y, r * 0.6, x, y, r * 2.8);
    glow.addColorStop(0, A(tok.sun, LD.dark ? 0.55 : 0.4));
    glow.addColorStop(0.4, A(tok.sun, LD.dark ? 0.16 : 0.12));
    glow.addColorStop(1, A(tok.sun, 0));
    g.fillStyle = glow;
    g.beginPath(); g.arc(x, y, r * 2.8, 0, Math.PI * 2); g.fill();
    const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.32, r * 0.1, x, y, r);
    gr.addColorStop(0, '#fffbe6'); gr.addColorStop(0.45, SH(tok.sun, 0.45)); gr.addColorStop(0.85, tok.sun); gr.addColorStop(1, SH(tok.sun, -0.18));
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }

  // =====================================================================
  // 右：觀察者的天空（地平座標：東、北、上）
  // =====================================================================
  const EC = 28 * DEG, AC = 160 * DEG;
  const SR = [-Math.cos(AC), Math.sin(AC), 0];
  const SU = [-Math.sin(AC) * Math.sin(EC), -Math.cos(AC) * Math.sin(EC), Math.cos(EC)];
  const SO = [Math.sin(AC) * Math.cos(EC), Math.cos(AC) * Math.cos(EC), Math.sin(EC)];
  let sg = null;
  function skyGeom() {
    const p = P.sky;
    const top = 40, bottom = narrow ? 40 : 46;
    const Rd = Math.max(80, Math.min(p.w * 0.44, (p.h - top - bottom) / (1 + Math.sin(EC))));
    sg = { Rd: Rd, cx: p.x + p.w / 2, cy: p.y + top + Rd };
    return sg;
  }
  function sproj(v, r) { r = r == null ? 1 : r; return [sg.cx + sg.Rd * r * dot3(v, SR), sg.cy - sg.Rd * r * dot3(v, SU), dot3(v, SO)]; }
  const hv = function (alt, az) { return C.horizVec(alt, az); };
  /** 某一天太陽的軌跡（由當天正午前 12 小時到後 12 小時） */
  let pathKey = '', pathPts = null;
  function dayPath() {
    const k = [st.lat, st.lon, st.zone, st.day, st.eps].join('|');
    if (k === pathKey) return pathPts;
    const s = snap();
    const pts = [];
    for (let i = 0; i <= 240; i++) {
      const c = s.noon - 12 + i * 0.1;
      const sl = C.sunLocal({ lat: st.lat, lon: st.lon, zone: st.zone, eps: st.eps, day: st.day, clock: c });
      pts.push({ c: c, alt: sl.alt, az: sl.az });
    }
    pathKey = k; pathPts = pts;
    return pts;
  }
  function refPath(dec) {
    const pts = [];
    for (let i = 0; i <= 144; i++) {
      const H = -180 + i * 2.5;
      const hz = C.horizontal(st.lat, dec, H);
      pts.push({ alt: hz.alt, az: hz.az, H: H });
    }
    return pts;
  }
  function strokePath(g, pts, sel, r) {
    g.beginPath();
    let pen = false;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (sel(p)) {
        const q = sproj(hv(p.alt, p.az), r);
        if (pen) g.lineTo(q[0], q[1]); else { g.moveTo(q[0], q[1]); pen = true; }
      } else pen = false;
    }
  }
  function skyColor(alt) {
    // 白天 → 黃昏（−6° 到 6°）→ 夜晚
    if (alt >= 6) return tok.sky;
    if (alt >= -1) return MIX(tok.dusk, tok.sky, (alt + 1) / 7);
    if (alt >= -8) return MIX(tok.night, tok.dusk, (alt + 8) / 7);
    return tok.night;
  }
  function drawSky(g) {
    skyGeom();
    const p = P.sky, s = snap(), Rd = sg.Rd, cx = sg.cx, cy = sg.cy;
    const eh = Rd * Math.sin(EC);
    g.save();
    LD.roundRect(g, p.x, p.y, p.w, p.h, 8);
    g.clip();
    // 天空（上半圓）
    const sc = skyColor(s.alt);
    const skyA = LD.dark ? 0.55 : 0.6;
    const gsky = g.createLinearGradient(0, cy - Rd, 0, cy + eh);
    gsky.addColorStop(0, A(SH(sc, LD.dark ? 0.05 : -0.1), skyA));
    gsky.addColorStop(1, A(SH(sc, LD.dark ? 0.12 : 0.35), skyA * 0.7));
    g.fillStyle = gsky;
    g.beginPath();
    g.arc(cx, cy, Rd, Math.PI, 0);
    g.ellipse(cx, cy, Rd, eh, 0, 0, Math.PI);
    g.closePath();
    g.fill();
    // 天球外框
    g.strokeStyle = A(LD.c.text, 0.18); g.lineWidth = 1;
    g.beginPath(); g.arc(cx, cy, Rd, Math.PI, 0); g.stroke();
    const path = dayPath();
    const ref = st.refArcs ? [st.eps, 0, -st.eps].map(function (d) { return { d: d, pts: refPath(d) }; }) : [];
    // 地平線以下的部分（被地面擋住：先畫，再蓋上半透明的地面）
    g.save();
    g.setLineDash([3, 4]);
    g.strokeStyle = A(tok.sun, 0.35); g.lineWidth = 1.2;
    strokePath(g, path, function (q) { return q.alt < 0; }); g.stroke();
    g.restore();
    if (s.alt < 0) { const q = sproj(hv(s.alt, s.az)); g.fillStyle = A(tok.sun, 0.3); g.beginPath(); g.arc(q[0], q[1], 6, 0, Math.PI * 2); g.fill(); }
    // 地面
    const gg = g.createRadialGradient(cx, cy + eh * 0.3, Rd * 0.1, cx, cy, Rd * 1.05);
    gg.addColorStop(0, A(SH(tok.ground, LD.dark ? 0.08 : 0.25), 0.92));
    gg.addColorStop(1, A(SH(tok.ground, LD.dark ? -0.15 : -0.12), 0.92));
    g.fillStyle = gg;
    g.beginPath(); g.ellipse(cx, cy, Rd, eh, 0, 0, Math.PI * 2); g.fill();
    // 地面的前緣厚度（立體感）
    g.fillStyle = A(SH(tok.soil, LD.dark ? -0.1 : 0), 0.85);
    g.beginPath(); g.ellipse(cx, cy, Rd, eh, 0, 0, Math.PI); g.ellipse(cx, cy + 6, Rd, eh, 0, Math.PI, 0, true); g.closePath(); g.fill();
    g.strokeStyle = A(LD.c.text, 0.25); g.lineWidth = 1;
    g.beginPath(); g.ellipse(cx, cy, Rd, eh, 0, 0, Math.PI * 2); g.stroke();
    // 地面的方位格線（每 30°）
    for (let az = 0; az < 360; az += 30) {
      const q = sproj(hv(0, az), 1), q0 = sproj(hv(0, az), 0.12);
      g.strokeStyle = A(LD.c.text, az % 90 ? 0.08 : 0.16); g.lineWidth = 1;
      g.beginPath(); g.moveTo(q0[0], q0[1]); g.lineTo(q[0], q[1]); g.stroke();
    }
    // 高度角 30°、60° 的圈（後半淡、前半濃）
    [30, 60].forEach(function (alt) {
      for (let front = 0; front < 2; front++) {
        g.strokeStyle = A(LD.c.text, front ? 0.13 : 0.07); g.lineWidth = 1;
        g.beginPath();
        let pen = false;
        for (let az = 0; az <= 360; az += 4) {
          const q = sproj(hv(alt, az));
          if ((q[2] >= 0) === !!front) { if (pen) g.lineTo(q[0], q[1]); else { g.moveTo(q[0], q[1]); pen = true; } } else pen = false;
        }
        g.stroke();
      }
    });
    // 子午線（北—天頂—南）
    g.save(); g.setLineDash([2, 4]); g.strokeStyle = A(LD.c.text, 0.18); g.lineWidth = 1;
    g.beginPath();
    for (let a = 0; a <= 180; a += 3) { const v = a <= 90 ? hv(a, 0) : hv(180 - a, 180); const q = sproj(v); if (a) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }
    g.stroke(); g.restore();
    // 天極軸：由地面中心指向仰角 |φ| 的天極（北半球朝北、南半球朝南）
    const poleAz = st.lat >= 0 ? 0 : 180, poleAlt = Math.abs(st.lat);
    const pq = sproj(hv(poleAlt, poleAz)), pc = sproj([0, 0, 0]);
    g.save();
    g.strokeStyle = A(LD.c.accent, 0.75); g.lineWidth = 1.6; g.setLineDash([6, 4]);
    g.beginPath(); g.moveTo(pc[0], pc[1]); g.lineTo(pq[0], pq[1]); g.stroke();
    g.restore();
    g.fillStyle = LD.c.accent; g.beginPath(); g.arc(pq[0], pq[1], 3.2, 0, Math.PI * 2); g.fill();
    // 分至日的參考軌跡（地平線以上，虛線）
    ref.forEach(function (rp) {
      g.save(); g.setLineDash([4, 4]); g.strokeStyle = A(LD.c.muted, 0.75); g.lineWidth = 1.1;
      strokePath(g, rp.pts, function (q) { return q.alt >= 0; }); g.stroke();
      g.restore();
    });
    // 年度模式：同一時刻的太陽位置（8 字形）
    if (rec.ana && rec.ana.key === anaKey()) {
      rec.ana.pts.forEach(function (q) {
        if (q.alt <= 0) return;
        const v = sproj(hv(q.alt, q.az));
        g.fillStyle = A(tok.sun, 0.7); g.beginPath(); g.arc(v[0], v[1], 1.8, 0, Math.PI * 2); g.fill();
      });
    }
    // 今天的太陽軌跡（地平線以上）
    g.save();
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = A(tok.sun, LD.dark ? 0.28 : 0.22); g.lineWidth = 7;
    strokePath(g, path, function (q) { return q.alt >= 0; }); g.stroke();
    g.strokeStyle = SH(tok.sun, LD.dark ? 0 : -0.1); g.lineWidth = 2.6;
    strokePath(g, path, function (q) { return q.alt >= 0; }); g.stroke();
    g.restore();
    // 日出、日落標籤的位置（先算好，整點數字碰到就不寫）
    const rsLab = [];
    if (!s.polar && st.labels) {
      [[s.riseAz, s.rise, T('日出 ', 'Rise ')], [s.setAz, s.set, T('日落 ', 'Set ')]].forEach(function (m) {
        const q = sproj(hv(0, m[0]));
        const txt = m[2] + hm(m[1]).slice(0, 5), f = font(11, '700');
        g.font = f;
        const tm = g.measureText(txt), w = tm.width + 12, h = LD.textHeight(tm, 15) + 3;
        const x0 = clamp(q[0] < cx ? q[0] - 6 - w : q[0] + 6, p.x + 4, p.x + p.w - 4 - w);
        const yb = clamp(q[1] + (q[2] >= 0 ? 22 : -6), p.y + 40, p.y + p.h - 4);
        rsLab.push({ txt: txt, f: f, x: x0, y: yb - h, w: w, h: h });
      });
    }
    if (st.labels) { // 「天頂」字樣也不要被整點數字蓋住（只加在最後，不影響上面兩個標籤的順序）
      const zq = sproj([0, 0, 1]);
      g.font = font(11, '600');
      const zw = g.measureText(T('天頂', 'Zenith')).width + 4;
      rsLab.push({ x: zq[0] - zw / 2, y: zq[1] - 18, w: zw, h: 14, zen: true });
    }
    const hitRS = function (x, y, w, h) {
      return rsLab.some(function (r) { return x < r.x + r.w + 2 && r.x < x + w + 2 && y < r.y + r.h + 2 && r.y < y + h + 2; });
    };
    // 整點記號
    path.forEach(function (q, i) {
      if (i === 0 || q.alt < 0) return;
      const prev = path[i - 1];
      const h0 = Math.floor(prev.c), h1 = Math.floor(q.c);
      if (h1 === h0) return;
      const f = (h1 - prev.c) / (q.c - prev.c);
      const alt = prev.alt + (q.alt - prev.alt) * f;
      let daz = C.norm180(q.az - prev.az);
      const az = prev.az + daz * f;
      if (alt < 0) return;
      const v = sproj(hv(alt, az));
      g.fillStyle = LD.c['canvas-bg']; g.strokeStyle = SH(tok.sun, -0.25); g.lineWidth = 1.2;
      g.beginPath(); g.arc(v[0], v[1], 2.6, 0, Math.PI * 2); g.fill(); g.stroke();
      const hh = ((h1 % 24) + 24) % 24;
      if (st.labels && hh % 3 === 0 && alt > 6) {
        const out = sproj(hv(alt, az), 1.09), hf = font(10.5, '700');
        g.font = hf;
        const hw = g.measureText(String(hh)).width + 4;
        if (!hitRS(out[0] - hw / 2, out[1] - 8, hw, 14)) LD.haloText(g, String(hh), out[0], out[1] + 4, SH(tok.sun, LD.dark ? 0.2 : -0.35), 'center', 'alphabetic', hf);
      }
    });
    // 日出、日落的方位
    if (!s.polar) {
      [[s.riseAz, s.rise, T('日出 ', 'Rise ')], [s.setAz, s.set, T('日落 ', 'Set ')]].forEach(function (m, i) {
        const q = sproj(hv(0, m[0]));
        g.fillStyle = SH(tok.sun, -0.15); g.beginPath(); g.arc(q[0], q[1], 3.5, 0, Math.PI * 2); g.fill();
        if (st.labels && rsLab[i]) {
          const r = rsLab[i];
          LD.pill(g, r.txt, r.x, r.y + r.h, SH(tok.sun, LD.dark ? 0.1 : -0.35), 'left', r.f);
        }
      });
    }
    // 竿子與影子（竿高 = 天球半徑的 0.2 倍，只為了看得清楚；影子方向與長度比例都正確）
    const GH = 0.2;
    if (s.alt > 0) {
      const sh = C.shadow(s.alt, s.az, GH);
      let L = sh.len, clipped = false;
      if (L > 0.96) { L = 0.96; clipped = true; }
      const ux = Math.sin(sh.az * DEG), uy = Math.cos(sh.az * DEG);
      const tip = sproj([ux * L, uy * L, 0]);
      const b1 = sproj([-uy * 0.012, ux * 0.012, 0]), b2 = sproj([uy * 0.012, -ux * 0.012, 0]);
      const gr = g.createLinearGradient(pc[0], pc[1], tip[0], tip[1]);
      gr.addColorStop(0, A(LD.dark ? '#000000' : LD.c.text, LD.dark ? 0.6 : 0.42));
      gr.addColorStop(1, A(LD.dark ? '#000000' : LD.c.text, clipped ? 0 : LD.dark ? 0.35 : 0.22));
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(b1[0], b1[1]); g.lineTo(tip[0], tip[1]); g.lineTo(b2[0], b2[1]); g.closePath(); g.fill();
    }
    // 竿子
    const top = sproj([0, 0, GH]);
    const pw = Math.max(2.5, Rd * 0.016);
    const gp = g.createLinearGradient(pc[0] - pw, 0, pc[0] + pw, 0);
    gp.addColorStop(0, SH(tok.pole, 0.35)); gp.addColorStop(0.5, tok.pole); gp.addColorStop(1, SH(tok.pole, -0.35));
    g.fillStyle = gp;
    g.fillRect(pc[0] - pw / 2, top[1], pw, pc[1] - top[1]);
    LD.ball(g, top[0], top[1], pw * 0.9, tok.pole, { shadow: false });
    // 高度角的示意（地面中心到太陽的虛線，與地面方向夾 h）
    if (s.alt > 0) {
      const sq = sproj(hv(s.alt, s.az)), gq = sproj(hv(0, s.az));
      g.save();
      g.setLineDash([4, 3]); g.strokeStyle = A(tok.sun, 0.85); g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(pc[0], pc[1]); g.lineTo(sq[0], sq[1]); g.stroke();
      g.strokeStyle = A(LD.c.text, 0.35);
      g.beginPath(); g.moveTo(pc[0], pc[1]); g.lineTo(gq[0], gq[1]); g.stroke();
      g.restore();
      const ar = 0.34;
      g.strokeStyle = A(tok.sun, 0.95); g.lineWidth = 1.6;
      g.beginPath();
      for (let k = 0; k <= 24; k++) { const a = s.alt * k / 24; const q = sproj(hv(a, s.az), ar); if (k) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }
      g.stroke();
      if (st.labels) {
        const lq = sproj(hv(s.alt / 2, s.az), ar + 0.1);
        const ht = 'h = ' + s.alt.toFixed(1) + '°', hf = font(11.5, '700');
        g.font = hf;
        const tm = g.measureText(ht), hw = tm.width + 12, hh = LD.textHeight(tm, 15) + 3;
        const left = lq[0] < pc[0];
        const bx = clamp(left ? lq[0] - hw : lq[0], p.x + 4, p.x + p.w - 4 - hw);
        // 碰到日出、日落的標籤就往上（或往下）挪
        let yb = lq[1] + 8;
        const tries = [0, -(hh + 3), -2 * (hh + 3), hh + 3];
        for (let k = 0; k < tries.length; k++) {
          const y = lq[1] + 8 + tries[k];
          if (y - hh < p.y + 40 || y > p.y + p.h - 4) continue;
          if (!hitRS(bx, y - hh, hw, hh)) { yb = y; break; }
        }
        LD.pill(g, ht, bx, yb, SH(tok.sun, LD.dark ? 0.15 : -0.4), 'left', hf);
      }
    }
    // 太陽
    if (s.alt >= -0.9) {
      const q = sproj(hv(s.alt, s.az));
      const r = Math.max(7, Rd * 0.055);
      drawSun(g, q[0], q[1], r * (s.alt < 0 ? 0.8 : 1));
      if (hover === 'sun' || drag === 'sun') { g.strokeStyle = A(LD.c.accent, 0.9); g.lineWidth = 2; g.beginPath(); g.arc(q[0], q[1], r + 5, 0, Math.PI * 2); g.stroke(); }
    }
    // 方位與天頂
    if (st.labels) {
      const names = isEn() ? ['N', 'E', 'S', 'W'] : ['北', '東', '南', '西'];
      [0, 90, 180, 270].forEach(function (az, i) {
        const q = sproj(hv(0, az), 1.08);
        LD.haloText(g, names[i], q[0], q[1] + 5, i === 0 ? LD.c.pos : LD.c.text, 'center', 'alphabetic', font(13, '700'));
      });
      const z = sproj([0, 0, 1]);
      LD.haloText(g, T('天頂', 'Zenith'), z[0], z[1] - 6, LD.c.muted, 'center', 'alphabetic', font(11, '600'));
      g.fillStyle = LD.c.muted; g.beginPath(); g.arc(z[0], z[1], 2, 0, Math.PI * 2); g.fill();
      const pl = sproj(hv(poleAlt, poleAz), 1.0);
      const ptxt = st.lat >= 0 ? T('北天極', 'N celestial pole') : T('南天極', 'S celestial pole');
      const pf = font(10.5, '600'), ptx = ptxt + ' ' + poleAlt.toFixed(1) + '°';
      g.font = pf;
      const pw2 = g.measureText(ptx).width + 12;
      LD.pill(g, ptx, clamp(pl[0] - pw2 / 2, p.x + 4, p.x + p.w - 4 - pw2), pl[1] + 22, LD.c.accent, 'left', pf);
    }
    // 標題
    LD.pill(g, T('觀察者的天空', 'The observer’s sky') + T('・', ' · ') + (st.loc ? T(st.loc.zh, st.loc.en) : latShort(st.lat)), p.x + 8, p.y + 26, LD.c.text, 'left', font(narrow ? 11.5 : 12.5, '700'));
    // 永晝、永夜
    if (s.polar) {
      LD.pill(g, s.polar === 'day' ? T('永晝：太陽整天不落下', 'Midnight sun: the Sun never sets') : T('永夜：太陽整天不升起', 'Polar night: the Sun never rises'),
        p.x + p.w / 2, p.y + p.h - 8, s.polar === 'day' ? SH(tok.sun, LD.dark ? 0.1 : -0.35) : LD.c.neg, 'center', font(12, '700'));
    }
    g.restore();
  }

  // =====================================================================
  // 主畫布
  // =====================================================================
  let hover = null, drag = null, kb = null, kbChart = null;
  function draw() {
    if (!W) return;
    const key = [W, H, dpr, LD.ver, narrow].join('|');
    if (key !== bgKey) { buildBg(); bgKey = key; }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(bgCv, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawOrbit(ctx);
    drawSky(ctx);
    if (hover === 'earth' || drag === 'earth') {
      const q = oproj(earthPos(C.sunAt(tNow(), st.eps)));
      ctx.strokeStyle = A(LD.c.accent, 0.9); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(q[0], q[1], og.rE + 6, 0, Math.PI * 2); ctx.stroke();
    }
    // 鍵盤焦點框（accent 色虛線圓角框）
    if (kb && kb.focused()) {
      let q, r;
      if (kb.index() === 0) { q = oproj(earthPos(C.sunAt(tNow(), st.eps))); r = og.rE + 10; }
      else { const s = snap(); q = sproj(hv(Math.max(s.alt, -2), s.az)); r = Math.max(7, sg.Rd * 0.055) + 9; }
      focusBox(ctx, q[0] - r, q[1] - r, 2 * r, 2 * r);
    }
  }
  function focusBox(g, x, y, w, h) {
    g.save();
    g.setLineDash([5, 4]);
    g.strokeStyle = LD.c.accent; g.lineWidth = 2;
    LD.roundRect(g, x, y, w, h, 8);
    g.stroke();
    g.restore();
  }

  // =====================================================================
  // 竿影俯視圖
  // =====================================================================
  const shCv = $('shCv'), bmCv = $('bmCv'), chart = $('chart');
  const shCtx = shCv.getContext('2d'), bmCtx = bmCv.getContext('2d'), chCtx = chart.getContext('2d');
  function prep(c, g) {
    const w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return null;
    const r = Math.min(3, window.devicePixelRatio || 1);
    if (c.width !== Math.round(w * r) || c.height !== Math.round(h * r)) { c.width = Math.round(w * r); c.height = Math.round(h * r); }
    g.setTransform(r, 0, 0, r, 0, 0);
    g.clearRect(0, 0, w, h);
    return { w: w, h: h };
  }
  function traceKey() { return [st.lat, st.lon, st.zone, st.day, st.eps].join('|'); }
  function anaKey() { return [st.lat, st.lon, st.zone, st.clock.toFixed(4), st.eps].join('|'); }
  function drawShadow() {
    const sz = prep(shCv, shCtx);
    if (!sz) return;
    const g = shCtx, w = sz.w, h = sz.h, s = snap();
    LD.backdrop(g, w, h);
    const cx = w / 2, cy = h / 2 + 8;
    const Lp = Math.min(w, h - 40) * 0.135; // 竿長的像素數
    const RV = 3.2;
    // 地面圓盤
    const gr = g.createRadialGradient(cx, cy, Lp * 0.5, cx, cy, Lp * RV);
    gr.addColorStop(0, A(SH(tok.ground, LD.dark ? 0.06 : 0.2), 1)); gr.addColorStop(1, A(SH(tok.ground, LD.dark ? -0.12 : -0.06), 1));
    g.fillStyle = gr;
    g.beginPath(); g.arc(cx, cy, Lp * RV, 0, Math.PI * 2); g.fill();
    g.strokeStyle = A(LD.c.text, 0.18); g.lineWidth = 1; g.stroke();
    // 1、2、3 倍竿長的圈
    for (let k = 1; k <= 3; k++) {
      g.save(); g.setLineDash([3, 4]); g.strokeStyle = A(LD.c.text, 0.16);
      g.beginPath(); g.arc(cx, cy, Lp * k, 0, Math.PI * 2); g.stroke(); g.restore();
      if (st.labels) LD.haloText(g, k + '×', cx + Lp * k * 0.707 + 2, cy + Lp * k * 0.707 + 11, LD.c.muted, 'left', 'alphabetic', font(10, '600'));
    }
    // 東西、南北線
    g.strokeStyle = A(LD.c.text, 0.12);
    g.beginPath(); g.moveTo(cx - Lp * RV, cy); g.lineTo(cx + Lp * RV, cy); g.moveTo(cx, cy - Lp * RV); g.lineTo(cx, cy + Lp * RV); g.stroke();
    const names = isEn() ? ['N', 'E', 'S', 'W'] : ['北', '東', '南', '西'];
    [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(function (d, i) {
      LD.haloText(g, names[i], cx + d[0] * (Lp * RV + 12), cy + d[1] * (Lp * RV + 12) + 4, i === 0 ? LD.c.pos : LD.c.text, 'center', 'alphabetic', font(12.5, '700'));
    });
    const toXY = function (q) { return [cx + q.x * Lp, cy - q.y * Lp]; };
    const inside = function (q) { return Math.hypot(q.x, q.y) <= RV; };
    function drawTrace(tr, alpha, marks) {
      const mins = Object.keys(tr.pts).map(Number).sort(function (a, b) { return a - b; });
      g.save();
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.strokeStyle = A(LD.c.neg, alpha); g.lineWidth = marks ? 2 : 1.4;
      g.beginPath();
      let pen = false, last = -9;
      mins.forEach(function (m) {
        const q = tr.pts[m];
        if (!inside(q) || m - last > 6) pen = false;
        if (inside(q)) { const xy = toXY(q); if (pen) g.lineTo(xy[0], xy[1]); else { g.moveTo(xy[0], xy[1]); pen = true; } }
        last = m;
      });
      g.stroke();
      if (marks) {
        mins.forEach(function (m) {
          if (m % 60) return;
          const q = tr.pts[m];
          if (!inside(q)) return;
          const xy = toXY(q);
          g.fillStyle = LD.c['canvas-bg']; g.strokeStyle = LD.c.neg; g.lineWidth = 1.2;
          g.beginPath(); g.arc(xy[0], xy[1], 2.6, 0, Math.PI * 2); g.fill(); g.stroke();
          if (st.labels) LD.haloText(g, String(m / 60), xy[0] + 5, xy[1] - 4, LD.c.neg, 'left', 'alphabetic', font(10, '700'));
        });
      }
      g.restore();
    }
    rec.old.forEach(function (tr) { drawTrace(tr, 0.28, false); });
    if (rec.cur && rec.cur.key === traceKey()) drawTrace(rec.cur, 0.9, true);
    // 年度模式：同一時刻的影子尖端
    if (rec.ana && rec.ana.key === anaKey()) {
      rec.ana.pts.forEach(function (q) {
        if (!q.tip || !inside(q.tip)) return;
        const xy = toXY(q.tip), m = C.dateOfDay(q.day).m;
        g.fillStyle = A(MIX(LD.c.neg, LD.c.pos, Math.abs(6.5 - m) / 5.5), 0.85);
        g.beginPath(); g.arc(xy[0], xy[1], 2, 0, Math.PI * 2); g.fill();
      });
    }
    // 影子
    if (s.alt > 0) {
      const sh = C.shadow(s.alt, s.az, 1);
      let L = sh.len, clipped = false;
      if (L > RV) { L = RV; clipped = true; }
      const ux = Math.sin(sh.az * DEG), uy = -Math.cos(sh.az * DEG);
      const tx = cx + ux * L * Lp, ty = cy + uy * L * Lp;
      const nx = -uy, ny = ux, bw = 4;
      const sgr = g.createLinearGradient(cx, cy, tx, ty);
      const ink = LD.dark ? '#000000' : LD.c.text;
      sgr.addColorStop(0, A(ink, LD.dark ? 0.7 : 0.5)); sgr.addColorStop(1, A(ink, clipped ? 0.05 : LD.dark ? 0.45 : 0.3));
      g.fillStyle = sgr;
      g.beginPath(); g.moveTo(cx + nx * bw, cy + ny * bw); g.lineTo(tx + nx * 1.5, ty + ny * 1.5); g.lineTo(tx - nx * 1.5, ty - ny * 1.5); g.lineTo(cx - nx * bw, cy - ny * bw); g.closePath(); g.fill();
      if (!clipped) { g.fillStyle = LD.c.neg; g.beginPath(); g.arc(tx, ty, 3.2, 0, Math.PI * 2); g.fill(); }
      // 太陽的方向（畫在圓盤外緣）
      const sx = cx - ux * (Lp * RV + 2), sy2 = cy - uy * (Lp * RV + 2);
      drawSun(g, clamp(sx, 12, w - 12), clamp(sy2, 12, h - 12), 6.5);
    }
    LD.contactShadow(g, cx, cy + 2, 7, 0);
    LD.ball(g, cx, cy, 6.5, tok.pole);
    // 文字
    const lines = [];
    if (s.alt > 0) {
      lines.push(T('影長 = ', 'Shadow = ') + (s.ratio < 0.0005 ? '0' : s.ratio < 100 ? s.ratio.toFixed(s.ratio < 10 ? 3 : 1) : s.ratio.toExponential(1)) + T(' × 竿長', ' × pole'));
      lines.push(T('影子指向 ', 'Points ') + dirText(s.shadowAz));
    } else lines.push(T('太陽在地平線下：沒有影子', 'The Sun is down: no shadow'));
    lines.forEach(function (tx, i) { LD.pill(g, tx, 8, 24 + i * 22, i ? LD.c.muted : LD.c.text, 'left', font(11.5, i ? '600' : '700')); });
    if (rec.ana && rec.ana.key === anaKey() && st.mode === 'year') LD.pill(g, T('每天 ', 'Every day at ') + hm(st.clock) + T(' 的影子尖端', ''), w - 8, h - 8, LD.c.muted, 'right', font(11, '600'));
  }

  // =====================================================================
  // 同一束陽光（cos 效應）
  // =====================================================================
  function drawBeam() {
    const sz = prep(bmCv, bmCtx);
    if (!sz) return;
    const g = bmCtx, w = sz.w, h = sz.h, s = snap();
    LD.backdrop(g, w, h);
    const gy = h - 50;
    const Wb = clamp(w * 0.17, 40, 72); // 1 m 的像素數
    // 大氣層
    if (st.atmos) {
      const ag = g.createLinearGradient(0, 30, 0, gy);
      ag.addColorStop(0, A(tok.sky, 0)); ag.addColorStop(1, A(tok.sky, LD.dark ? 0.5 : 0.7));
      g.fillStyle = ag; g.fillRect(0, 30, w, gy - 30);
    }
    // 地面
    const gg = g.createLinearGradient(0, gy, 0, h);
    gg.addColorStop(0, SH(tok.soil, LD.dark ? 0 : 0.15)); gg.addColorStop(1, SH(tok.soil, -0.25));
    g.fillStyle = gg; g.fillRect(0, gy, w, h - gy);
    g.fillStyle = A(SH(tok.ground, LD.dark ? 0.1 : -0.15), 1); g.fillRect(0, gy, w, 3);
    const hcl = s.alt;
    const gx = w * 0.56;
    if (hcl > 0.05) {
      const hr = hcl * DEG, ux = Math.cos(hr), uy = Math.sin(hr); // 光行進方向（向右下）
      const Lg = Wb / Math.sin(hr);
      const xa = gx - Lg / 2, xb = gx + Lg / 2;
      const far = Math.max(w, h) * 1.6;
      // 光束
      g.save();
      g.beginPath();
      g.moveTo(xa - ux * far, gy - uy * far); g.lineTo(xa, gy); g.lineTo(xb, gy); g.lineTo(xb - ux * far, gy - uy * far); g.closePath();
      const bgr = g.createLinearGradient(gx - ux * 200, gy - uy * 200, gx, gy);
      bgr.addColorStop(0, A(tok.sun, 0.12)); bgr.addColorStop(1, A(tok.sun, LD.dark ? 0.36 : 0.32));
      g.fillStyle = bgr; g.fill();
      g.clip();
      g.strokeStyle = A(SH(tok.sun, LD.dark ? 0.1 : -0.2), 0.75); g.lineWidth = 1.2;
      for (let k = 0; k <= 6; k++) {
        const x0 = xa + (xb - xa) * k / 6;
        g.beginPath(); g.moveTo(x0 - ux * far, gy - uy * far); g.lineTo(x0, gy); g.stroke();
        LD.arrow(g, x0 - ux * 30, gy - uy * 30, x0 - ux * 4, gy - uy * 4, A(SH(tok.sun, LD.dark ? 0.1 : -0.25), 0.9), 1.4);
      }
      g.restore();
      // 截面（垂直於光線的 1 m）
      const D = Math.min(h * 0.5, 120);
      const mx = gx - ux * D, my = gy - uy * D;
      const px = -uy, py = ux; // 垂直方向
      const c1 = [mx - px * Wb / 2, my - py * Wb / 2], c2 = [mx + px * Wb / 2, my + py * Wb / 2];
      g.strokeStyle = LD.c.text; g.lineWidth = 2.2; g.lineCap = 'round';
      g.beginPath(); g.moveTo(c1[0], c1[1]); g.lineTo(c2[0], c2[1]); g.stroke();
      LD.pill(g, T('截面 1 m²', 'Beam 1 m²'), c1[0] - 6, c1[1] + 4, LD.c.text, 'right', font(11.5, '700'));
      // 照到的地面
      const xa2 = Math.max(4, xa), xb2 = Math.min(w - 4, xb);
      g.fillStyle = A(tok.sun, 0.9); g.fillRect(xa2, gy - 2, xb2 - xa2, 5);
      g.strokeStyle = SH(tok.sun, -0.35); g.lineWidth = 1; g.strokeRect(xa2, gy - 2, xb2 - xa2, 5);
      // 角度
      g.strokeStyle = LD.c.text; g.lineWidth = 1.3;
      const ar = 26;
      g.beginPath(); g.arc(xb, gy, ar, Math.PI, Math.PI + hr); g.stroke();
      if (xb + 4 < w) LD.haloText(g, 'h', xb - ar - 10, gy - 6, LD.c.text, 'center', 'alphabetic', font(12, 'italic 700'));
      const area = 1 / Math.sin(hr);
      LD.pill(g, T('照到的地面 ', 'Ground lit ') + (area < 100 ? area.toFixed(2) : area.toFixed(0)) + ' m²', clamp(gx, 80, w - 80), gy + 30, SH(tok.sun, LD.dark ? 0.1 : -0.4), 'center', font(11.5, '700'));
    } else {
      LD.pill(g, T('太陽在地平線下：沒有直射的陽光', 'The Sun is down: no direct sunlight'), w / 2, gy - 40, LD.c.muted, 'center', font(12, '600'));
    }
    // 尺規（每 1 m）
    g.strokeStyle = A(LD.c.text, 0.45); g.lineWidth = 1;
    for (let k = -8; k <= 8; k++) {
      const x = gx + k * Wb;
      if (x < 2 || x > w - 2) continue;
      g.beginPath(); g.moveTo(x, gy + 4); g.lineTo(x, gy + 10); g.stroke();
    }
    // 讀數
    const I = s.I;
    const l1 = 'S = ' + Math.round(s.S) + ' W/m²';
    const l2 = s.alt > 0 ? 'I = S sin h' + (st.atmos ? T(' × 透射比', ' × transmission') : '') + ' = ' + Math.round(I) + ' W/m²' : 'I = 0';
    LD.pill(g, l1, 8, 24, LD.c.muted, 'left', font(11.5, '600'));
    LD.pill(g, l2, 8, 46, LD.c.text, 'left', font(12, '700'));
    if (st.atmos && s.alt > 0) LD.pill(g, T('大氣質量 AM = ', 'Air mass AM = ') + C.airMass(90 - s.alt).toFixed(2) + T('，透射 ', ', transmits ') + Math.round(C.transmit(s.alt) * 100) + '%', 8, 68, LD.c.muted, 'left', font(11, '600'));
  }

  // =====================================================================
  // 一整年的變化
  // =====================================================================
  let curveKey = '', curves = null;
  function getCurves() {
    const k = [st.lat, st.lon, st.zone, st.eps, st.refract, st.atmos].join('|');
    if (k !== curveKey) {
      const base = { lat: st.lat, lon: st.lon, zone: st.zone, eps: st.eps };
      curves = { a: C.yearCurve(base, st.refract, st.atmos), b: C.yearCurve(Object.assign({}, base, { lat: -st.lat }), st.refract, st.atmos) };
      curveKey = k;
    }
    return curves;
  }
  function niceStep(span, n) {
    const raw = span / n, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
  }
  let chartGeom = null;
  function drawChart() {
    const sz = prep(chart, chCtx);
    if (!sz) return;
    const g = chCtx, w = sz.w, h = sz.h;
    LD.backdrop(g, w, h);
    const cvs = getCurves();
    const mode = st.chart;
    const pick = function (c) { return mode === 'Q' ? c.Q : mode === 'len' ? c.len : mode === 'noon' ? c.noonAlt : c.R; };
    const ya = pick(cvs.a), yb = mode === 'R' ? null : pick(cvs.b);
    let lo, hi;
    if (mode === 'len') { lo = 0; hi = 24; }
    else if (mode === 'noon') { lo = Math.min(0, Math.floor(Math.min.apply(null, ya.concat(yb)) / 10) * 10); hi = 90; }
    else if (mode === 'R') { lo = 0.98; hi = 1.02; }
    else { lo = 0; const mx = Math.max.apply(null, ya.concat(yb)); hi = Math.max(10, Math.ceil(mx * 1.1 / 5) * 5); }
    const L = narrow ? 40 : 50, R = 12, Tp = 26, B = 28;
    const X = function (d) { return L + (d - 1) / 364 * (w - L - R); };
    const Y = function (v) { return h - B - (v - lo) / (hi - lo) * (h - Tp - B); };
    chartGeom = { L: L, R: R, w: w };
    // 格線
    const step = mode === 'len' ? 3 : mode === 'R' ? 0.01 : mode === 'noon' ? 15 : niceStep(hi - lo, 5);
    g.font = font(11);
    for (let v = lo; v <= hi + 1e-9; v += step) {
      const y = Math.round(Y(v)) + 0.5;
      g.strokeStyle = A(LD.c.text, 0.08); g.lineWidth = 1;
      g.beginPath(); g.moveTo(L, y); g.lineTo(w - R, y); g.stroke();
      LD.haloText(g, mode === 'R' ? v.toFixed(2) : String(Math.round(v * 10) / 10), L - 5, y + 4, LD.c.muted, 'right', 'alphabetic', font(10.5));
    }
    let md = 1;
    for (let m = 0; m < 12; m++) {
      const x = Math.round(X(md)) + 0.5;
      g.strokeStyle = A(LD.c.text, 0.07); g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, Tp); g.lineTo(x, h - B); g.stroke();
      if (!narrow || m % 2 === 0) LD.haloText(g, isEn() ? MON_EN[m] : (m + 1) + T('月', ''), X(md + 14), h - B + 16, LD.c.muted, 'center', 'alphabetic', font(10.5));
      md += C.MONTH_DAYS[m];
    }
    // 二分二至
    ['mar', 'jun', 'sep', 'dec'].forEach(function (k) {
      const x = Math.round(X(seasonDay(k))) + 0.5;
      g.save(); g.setLineDash([2, 3]); g.strokeStyle = A(LD.c.accent, 0.5); g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, Tp - 4); g.lineTo(x, h - B); g.stroke(); g.restore();
      const nm = { mar: T('春分', 'Mar eq.'), jun: T('夏至', 'Jun sol.'), sep: T('秋分', 'Sep eq.'), dec: T('冬至', 'Dec sol.') }[k];
      LD.haloText(g, nm, x, Tp - 8, LD.c.accent, 'center', 'alphabetic', font(10.5, '600'));
    });
    if (mode === 'R') {
      [[SEASONS.peri, T('近日點', 'Perihelion')], [SEASONS.aph, T('遠日點', 'Aphelion')]].forEach(function (m) {
        const d = C.localOf(m[0], st.zone).day, v = C.orbit(m[0]).R;
        LD.pill(g, m[1] + ' ' + v.toFixed(4), clamp(X(d), L + 50, w - R - 50), Y(v) + (v < 1 ? -6 : 22), LD.c.pos, 'center', font(10.5, '600'));
      });
    }
    function line(arr, color, width, dash, fill) {
      g.save();
      g.beginPath();
      arr.forEach(function (v, i) { const x = X(i + 1), y = Y(v); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
      if (fill) {
        g.lineTo(X(365), Y(lo)); g.lineTo(X(1), Y(lo)); g.closePath();
        const fg = g.createLinearGradient(0, Tp, 0, h - B);
        fg.addColorStop(0, A(color, 0.22)); fg.addColorStop(1, A(color, 0.02));
        g.fillStyle = fg; g.fill();
        g.beginPath();
        arr.forEach(function (v, i) { const x = X(i + 1), y = Y(v); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
      }
      g.strokeStyle = color; g.lineWidth = width; g.lineJoin = 'round';
      if (dash) g.setLineDash(dash);
      g.stroke();
      g.restore();
    }
    if (yb) line(yb, A(LD.c.muted, 0.9), 1.6, [5, 4], false);
    line(ya, LD.c.accent, 2.4, null, mode === 'Q');
    // 今天
    const x = X(st.day), v = ya[st.day - 1];
    g.strokeStyle = A(LD.c.pos, 0.6); g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(x, Tp); g.lineTo(x, h - B); g.stroke();
    LD.ball(g, x, Y(v), 4.5, LD.c.pos);
    if (kbChart && kbChart.focused()) focusBox(g, x - 12, Tp - 2, 24, h - B - Tp + 4);
    const unit = mode === 'Q' ? ' MJ/m²' : mode === 'len' ? ' h' : mode === 'noon' ? '°' : ' AU';
    const vt = mode === 'R' ? v.toFixed(4) : mode === 'len' ? dur(v) : v.toFixed(1);
    LD.pill(g, dateText(st.day, true) + '  ' + vt + (mode === 'len' ? '' : unit), clamp(x + 8, L + 4, w - 150), clamp(Y(v) - 10, Tp + 20, h - B - 4), LD.c.pos, 'left', font(11.5, '700'));
    // 單位
    const yl = mode === 'Q' ? 'MJ/m²' : mode === 'len' ? T('小時', 'h') : mode === 'noon' ? T('度', 'deg') : 'AU';
    LD.haloText(g, yl, 6, 14, LD.c.muted, 'left', 'alphabetic', font(10.5, '600'));
    // 說明
    const a = latShort(st.lat), b = latShort(-st.lat);
    let note;
    if (mode === 'R') note = T('日地距離：1 月初最近、7 月初最遠，只差約 3.4%；北半球的冬天反而離太陽比較近。', 'Earth–Sun distance: closest in early January, farthest in early July, only about 3.4% apart — the northern winter is actually nearer the Sun.');
    else {
      note = T('實線：', 'Solid: ') + a + T('；虛線：', '; dashed: ') + b + T('（另一個半球）。', ' (the other hemisphere). ');
      if (mode === 'Q') {
        const sa = cvs.a.Q.reduce(function (x, y) { return x + y; }, 0) / 1000, sb = cvs.b.Q.reduce(function (x, y) { return x + y; }, 0) / 1000;
        note += T('一年總日照量：', 'Total for the year: ') + a + ' ' + sa.toFixed(2) + ' GJ/m²，'.replace('，', T('，', ', ')) + b + ' ' + sb.toFixed(2) + ' GJ/m²' + T('（' + (st.atmos ? '計入大氣' : '大氣層頂端') + '）', st.atmos ? ' (through the air).' : ' (top of the atmosphere).');
      } else if (mode === 'len') note += T('晝長' + (st.refract ? '含' : '不含') + '大氣折射。', st.refract ? 'Day length includes refraction.' : 'Day length without refraction.');
      else note += T('正午高度角 = 90° − |φ − δ|，負值表示正午時太陽仍在地平線下。', 'Noon altitude = 90° − |φ − δ|; a negative value means the Sun is below the horizon even at noon.');
    }
    $('chartNote').textContent = note;
  }

  // =====================================================================
  // 讀數
  // =====================================================================
  function setHTML(id, h) { const el = $(id); if (el && el.innerHTML !== h) el.innerHTML = h; }
  function updateReadouts() {
    const s = snap();
    setHTML('rDec', sgn(s.dec, 2) + '°');
    setHTML('rR', s.R.toFixed(4) + ' AU<small>' + 'S = ' + Math.round(s.S) + ' W/m<sup>2</sup></small>');
    setHTML('rH', sgn(s.H, 1) + '°<small>' + (Math.abs(s.H) < 0.05 ? T('正午', 'noon') : s.H < 0 ? T('上午', 'morning') : T('下午', 'afternoon')) + T('・均時差 ', ' · equation of time ') + sgn(s.eot, 1) + T(' 分', ' min') + '</small>');
    setHTML('rAlt', s.alt.toFixed(2) + '°<small>' + T('天頂角 ', 'zenith angle ') + s.zen.toFixed(2) + '°</small>');
    setHTML('rAz', s.az.toFixed(1) + '°<small>' + dirText(s.az) + '</small>');
    setHTML('rNoon', hm(s.noon) + T('・', ' · ') + s.noonAlt.toFixed(2) + '°<small>90° − |φ − δ| = ' + s.noonFormula.toFixed(2) + '°</small>');
    if (s.polar) {
      const t = s.polar === 'day' ? T('永晝（不落下）', 'Midnight sun') : T('永夜（不升起）', 'Polar night');
      setHTML('rRise', t); setHTML('rSet', t);
    } else {
      setHTML('rRise', hm(s.rise) + '<small>' + T('方位 ', 'azimuth ') + s.riseAz.toFixed(1) + '°・'.replace('・', T('・', ' · ')) + dirText(s.riseAz) + '</small>');
      setHTML('rSet', hm(s.set) + '<small>' + T('方位 ', 'azimuth ') + s.setAz.toFixed(1) + '°・'.replace('・', T('・', ' · ')) + dirText(s.setAz) + '</small>');
    }
    setHTML('rLen', dur(s.dayLen) + '<small>' + T('黑夜 ', 'night ') + dur(24 - s.dayLen) + '</small>');
    setHTML('rShadow', s.alt > 0 ? (s.ratio < 0.0005 ? T('0（太陽在天頂）', '0 (Sun overhead)') : s.ratio < 1000 ? s.ratio.toFixed(3) : '> 1000') + '<small>1 / tan h</small>' : T('沒有影子', 'no shadow'));
    setHTML('rI', Math.round(s.I) + ' W/m<sup>2</sup><small>' + (st.atmos ? T('計入大氣（晴天直射光）', 'through the air (clear-sky direct light)') : 'S sin h') + '</small>');
    setHTML('rQ', s.Q.toFixed(1) + ' MJ/m<sup>2</sup><small>' + (s.Q / 3.6).toFixed(2) + ' kWh/m<sup>2</sup>' + T('・赤道同一天 ', ' · equator same day ') + s.Qeq.toFixed(1) + '</small>');
    // 狀態列
    let txt = locName() + T('・', ' · ') + dateText(st.day) + ' ' + hm(st.clock) + T('：', ': ');
    if (s.alt > 0) txt += T('太陽高度角 ', 'the Sun is ') + s.alt.toFixed(1) + T('°，方位角 ', '° high at azimuth ') + s.az.toFixed(1) + T('°（', '° (') + dirText(s.az) + T('）。', ').');
    else txt += T('太陽在地平線下 ', 'the Sun is ') + Math.abs(s.alt).toFixed(1) + T('°。', '° below the horizon.');
    if (s.polar === 'day') txt += T('今天永晝。', ' Midnight sun today.');
    else if (s.polar === 'night') txt += T('今天永夜。', ' Polar night today.');
    else if (Math.abs(st.clock - s.noon) < 1 / 60) txt += T('正午：太陽正在子午線上。', ' Noon: the Sun is on the meridian.');
    $('status').textContent = txt;
    $('locInfo').textContent = (st.loc ? locName() : T('自訂緯度', 'Custom latitude')) + T('：', ': ') + latText(st.lat) + T('、', ', ') + lonText(st.lon) + T('，', ', ') + zoneText(st.zone) + (st.loc ? '' : T('（經度、時區沿用上一個地點）', ' (longitude and time zone kept from the last place)'));
  }
  function outs() {
    $('lato').textContent = latShort(st.lat);
    $('dayo').textContent = dateText(st.day);
    $('clocko').textContent = hm(st.clock).slice(0, 5);
    $('epso').textContent = st.eps.toFixed(2) + '°';
    $('speedo').textContent = st.mode === 'day'
      ? T('一天 ≈ ', 'a day ≈ ') + Math.round(24 / SPEED_DAY[st.speed - 1]) + T(' 秒', ' s')
      : T('一年 ≈ ', 'a year ≈ ') + Math.round(365 / SPEED_YEAR[st.speed - 1]) + T(' 秒', ' s');
    const d = C.dateOfDay(st.day);
    const dp = $('datePick'), iso = '2026-' + String(d.m).padStart(2, '0') + '-' + String(d.d).padStart(2, '0');
    if (dp.value !== iso && document.activeElement !== dp) dp.value = iso;
    document.querySelectorAll('#locs button').forEach(function (b) { b.setAttribute('aria-pressed', String(!!st.loc && b.dataset.id === st.loc.id)); });
    const sea = seasonOf(st.day);
    document.querySelectorAll('#seasonBtns button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.season === sea)); });
    $('play').textContent = st.playing ? T('暫停', 'Pause') : T('播放', 'Play');
    $('modeDay').setAttribute('aria-pressed', String(st.mode === 'day'));
    $('modeYear').setAttribute('aria-pressed', String(st.mode === 'year'));
  }

  // =====================================================================
  // 竿影紀錄
  // =====================================================================
  function recordTip() {
    if (!st.record) return;
    const s = snap();
    if (st.mode === 'day' || !st.playing) {
      const key = traceKey();
      if (!rec.cur || rec.cur.key !== key) {
        if (rec.cur && Object.keys(rec.cur.pts).length > 1) { rec.old.push(rec.cur); if (rec.old.length > 5) rec.old.shift(); }
        rec.cur = { key: key, pts: {}, day: st.day, lat: st.lat };
      }
      if (s.alt > 0) {
        const m = Math.round(st.clock * 60);
        if (m >= 0 && m < 1440 && !rec.cur.pts[m]) {
          const sh = C.shadow(s.alt, s.az, 1);
          rec.cur.pts[m] = { x: sh.x, y: sh.y, alt: s.alt };
          emitTrace();
        }
      }
    }
  }
  function recordAna() {
    if (!st.record) return;
    const key = anaKey(), s = snap();
    if (!rec.ana || rec.ana.key !== key) rec.ana = { key: key, pts: [], days: {} };
    if (rec.ana.days[st.day]) return;
    rec.ana.days[st.day] = true;
    const sh = s.alt > 0 ? C.shadow(s.alt, s.az, 1) : null;
    rec.ana.pts.push({ day: st.day, alt: s.alt, az: s.az, tip: sh ? { x: sh.x, y: sh.y } : null });
    if (window.LabMission && st.user) {
      const n = Object.keys(rec.ana.days).length;
      const up = rec.ana.pts.filter(function (q) { return q.alt > 0; }).length;
      if (n >= 300) LabMission.emit('analemma', Object.assign(eventData(), { days: n, upDays: up }));
    }
  }
  function emitTrace() {
    if (!window.LabMission || !st.user || !rec.cur) return;
    const mins = Object.keys(rec.cur.pts).map(Number);
    if (mins.length < 2) return;
    const span = (Math.max.apply(null, mins) - Math.min.apply(null, mins)) / 60;
    // 尖端軌跡的彎曲程度：高度角 15° 以上的點，北向座標的最大差（竿長為 1）
    const ys = mins.filter(function (m) { return rec.cur.pts[m].alt >= 15; }).map(function (m) { return rec.cur.pts[m].y; });
    const bend = ys.length > 1 ? Math.max.apply(null, ys) - Math.min.apply(null, ys) : null;
    LabMission.emit('trace', Object.assign(eventData(), { span: span, count: mins.length, bend: bend }));
  }

  // =====================================================================
  // 任務事件
  // =====================================================================
  function eventData() {
    return Object.assign({}, snap(), {
      loc: st.loc ? st.loc.id : 'custom', season: seasonOf(st.day), realTilt: Math.abs(st.eps - REAL_EPS) < 0.005,
      mode: st.mode, playing: st.playing
    });
  }
  let lastEmit = 0;
  function emitState(force) {
    if (!window.LabMission || !st.user) return;
    const now = performance.now();
    if (!force && now - lastEmit < 250) return;
    lastEmit = now;
    LabMission.emit('state', eventData());
  }
  /** 使用者操作後：記下「使用者已經動手」，更新畫面並回報 */
  function userChanged() {
    st.user = true;
    refresh();
    emitState(true);
    scheduleAnnounce();
  }

  // =====================================================================
  // 螢幕閱讀器：重要結果在改參數後播報（aria-live），小畫面的描述最多每秒更新一次
  // =====================================================================
  const srSay = $('srSay');
  function say(text) {
    if (!srSay) return;
    srSay.textContent = '';
    setTimeout(function () { srSay.textContent = text; }, 30);
  }
  let announceTimer = 0;
  function scheduleAnnounce() {
    clearTimeout(announceTimer);
    announceTimer = setTimeout(function () { say(summaryText()); updateAria(true); }, 700);
  }
  function summaryText() {
    const s = snap();
    let t = locName() + T('，', ', ') + dateText(st.day) + T('：正午太陽高度角 ', ': noon altitude ') + s.noonAlt.toFixed(1) + '°';
    if (s.polar === 'day') t += T('，永晝。', ', midnight sun.');
    else if (s.polar === 'night') t += T('，永夜。', ', polar night.');
    else t += T('，晝長 ', ', day length ') + dur(s.dayLen) + T('，日出 ', ', sunrise ') + hm(s.rise) + T('、日落 ', ', sunset ') + hm(s.set) + T('。', '.');
    t += T(' 現在 ', ' At ') + hm(st.clock).slice(0, 5) + T(' 太陽高度角 ', ' the Sun is ') + s.alt.toFixed(1) + '°' + (s.alt > 0
      ? T('，影長是竿長的 ', ' high; the shadow is ') + (s.ratio < 100 ? s.ratio.toFixed(2) : '> 100') + T(' 倍，地面每平方公尺 ', ' times the pole, and each square metre of ground gets ') + Math.round(s.I) + ' W' + T('。', '.')
      : T('，在地平線下。', ', below the horizon.'));
    return t;
  }
  let lastAria = 0;
  function updateAria(force) {
    const now = performance.now();
    if (!force && now - lastAria < 1000) return;
    lastAria = now;
    const s = snap();
    shCv.setAttribute('aria-label', s.alt > 0
      ? T('竿影俯視圖：影長是竿長的 ' + (s.ratio < 100 ? s.ratio.toFixed(2) : '100 以上') + ' 倍，影子指向' + dirText(s.shadowAz) + '。',
        'Top view of the pole’s shadow: the shadow is ' + (s.ratio < 100 ? s.ratio.toFixed(2) : 'more than 100') + ' times the pole and points ' + dirText(s.shadowAz) + '.')
      : T('竿影俯視圖：太陽在地平線下，沒有影子。', 'Top view of the pole’s shadow: the Sun is below the horizon, so there is no shadow.'));
    bmCv.setAttribute('aria-label', s.alt > 0
      ? T('同一束陽光：太陽高度角 ' + s.alt.toFixed(1) + '°，截面 1 平方公尺的光照到 ' + (1 / Math.sin(s.alt * DEG)).toFixed(2) + ' 平方公尺的地面，每平方公尺 ' + Math.round(s.I) + ' 瓦。',
        'The same beam of sunlight: with the Sun ' + s.alt.toFixed(1) + '° high, a beam 1 square metre across lights ' + (1 / Math.sin(s.alt * DEG)).toFixed(2) + ' square metres of ground, ' + Math.round(s.I) + ' watts per square metre.')
      : T('同一束陽光：太陽在地平線下，沒有直射的陽光。', 'The same beam of sunlight: the Sun is below the horizon, so there is no direct sunlight.'));
  }

  // =====================================================================
  // 更新與播放
  // =====================================================================
  let drawPending = false;
  function requestDraw() {
    if (drawPending) return;
    drawPending = true;
    requestAnimationFrame(function () { drawPending = false; renderAll(); });
  }
  function renderAll() {
    if (view3 && view3.active) view3.update(); else draw();
    drawSub();
  }
  function drawSub() { drawShadow(); drawBeam(); drawChart(); }
  function refresh() {
    outs();
    updateReadouts();
    if (st.mode === 'day' || !st.playing) recordTip();
    requestDraw();
  }
  let raf = 0, lastT = 0, lastRead = 0, prevAlt = null, prevH = null;
  function needLoop() { return st.playing && !document.hidden; }
  function loop(ts) {
    raf = 0;
    const dt = lastT ? Math.min(1 / 30, (ts - lastT) / 1000) : 1 / 60;
    lastT = ts;
    if (st.playing) {
      if (st.mode === 'day') {
        let c = st.clock + dt * SPEED_DAY[st.speed - 1];
        if (c >= 24) c -= 24;
        st.clock = c;
        if (window.LabNum) LabNum.clear(elClock);
        elClock.value = String(c);
        const s = snap();
        const h0 = st.refract ? C.H0_REFRACT : 0;
        if (prevAlt != null && prevAlt <= h0 && s.alt > h0 && Math.abs(s.alt - prevAlt) < 5) onSunrise(s);
        if (prevAlt != null && prevAlt > h0 && s.alt <= h0 && Math.abs(s.alt - prevAlt) < 5) onSunset();
        if (prevH != null && prevH > 150 && s.H < -150 && s.alt > 0 && st.user && window.LabMission) LabMission.emit('midnight', eventData());
        if (prevH != null && prevH < 0 && s.H >= 0 && s.H < 30 && st.userPlay) say(T('正午 ', 'Noon ') + hm(s.noon).slice(0, 5) + T('：太陽高度角 ', ': the Sun is ') + s.noonAlt.toFixed(1) + T('°。', '° high.'));
        prevAlt = s.alt; prevH = s.H;
        recordTip();
      } else {
        st.dayF += dt * SPEED_YEAR[st.speed - 1];
        if (st.dayF >= 366) st.dayF -= 365;
        const d = Math.floor(st.dayF);
        if (d !== st.day) {
          st.day = d;
          if (window.LabNum) LabNum.clear(elDay);
          elDay.value = String(d);
          recordAna();
        }
      }
      if (ts - lastRead > 90) { lastRead = ts; outs(); updateReadouts(); emitState(false); updateAria(false); }
      renderAll();
    }
    if (needLoop()) raf = requestAnimationFrame(loop); else lastT = 0;
  }
  function kick() { if (!raf && needLoop()) { lastT = 0; raf = requestAnimationFrame(loop); } }
  function setPlaying(on, byUser) {
    st.playing = on;
    if (byUser) st.userPlay = on;
    prevAlt = null; prevH = null;
    if (on && st.mode === 'year') { st.dayF = st.day + 0.001; recordAna(); }
    outs();
    kick();
  }
  function onSunrise(s) {
    const S = window.LabSound;
    if (S && st.userPlay) { S.tone({ freq: 523, dur: 0.18, gain: 0.12 }); S.tone({ freq: 659, dur: 0.18, gain: 0.12, delay: 0.12 }); S.tone({ freq: 784, dur: 0.3, gain: 0.12, delay: 0.24 }); }
    if (st.userPlay && st.user && window.LabMission) LabMission.emit('sunrise', eventData());
    if (st.userPlay) say(T('日出 ', 'Sunrise ') + hm(st.clock).slice(0, 5) + T('，方位 ', ', azimuth ') + s.riseAz.toFixed(1) + '°' + T('。', '.'));
  }
  function onSunset() {
    const S = window.LabSound;
    if (S && st.userPlay) { S.tone({ freq: 784, dur: 0.18, gain: 0.1 }); S.tone({ freq: 659, dur: 0.18, gain: 0.1, delay: 0.12 }); S.tone({ freq: 523, dur: 0.32, gain: 0.1, delay: 0.24 }); }
    if (st.userPlay) say(T('日落 ', 'Sunset ') + hm(st.clock).slice(0, 5) + T('。', '.'));
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { kick(); requestDraw(); } });

  // =====================================================================
  // 控制項
  // =====================================================================
  // 地點按鈕
  const locBox = $('locs');
  LOCS.forEach(function (l) {
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.id = l.id; b.textContent = T(l.zh, l.en);
    b.title = T(l.full[0], l.full[1]) + ' ' + latShort(l.lat);
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', function () { setLoc(l); userChanged(); });
    locBox.appendChild(b);
  });
  function setLoc(l) {
    st.loc = l; st.lat = l.lat; st.lon = l.lon; st.zone = l.zone;
    if (window.LabNum) LabNum.set(elLat, l.lat); else elLat.value = l.lat;
    st.lat = l.lat;
  }
  function setDay(d, quiet) {
    d = clamp(Math.round(d), 1, 365);
    st.day = d; st.dayF = d;
    if (window.LabNum) LabNum.clear(elDay);
    elDay.value = String(d);
  }
  function setClock(c) {
    c = ((c % 24) + 24) % 24;
    st.clock = c;
    if (window.LabNum) LabNum.clear(elClock);
    elClock.value = String(c);
  }
  elLat.addEventListener('input', function () {
    const v = clamp(val(elLat), -90, 90);
    if (!st.loc || Math.abs(v - st.loc.lat) > 1e-9) st.loc = null;
    st.lat = v;
    userChanged();
  });
  elDay.addEventListener('input', function () { st.day = clamp(Math.round(val(elDay)), 1, 365); st.dayF = st.day; userChanged(); });
  elClock.addEventListener('input', function () {
    st.clock = clamp(val(elClock), 0, 24);
    if (st.clock >= 24) st.clock = 23.9999;
    if (st.playing && st.mode === 'day') setPlaying(false, true);
    userChanged();
  });
  elEps.addEventListener('input', function () { st.eps = clamp(val(elEps), 0, 90); earthCache.clear(); userChanged(); });
  elSpeed.addEventListener('input', function () { st.speed = clamp(Math.round(val(elSpeed)), 1, 10); outs(); });
  document.querySelectorAll('#seasonBtns button').forEach(function (b) {
    b.addEventListener('click', function () { setDay(seasonDay(b.dataset.season)); userChanged(); });
  });
  $('datePick').addEventListener('change', function () {
    const m = /^2026-(\d\d)-(\d\d)$/.exec(this.value) || /^\d{4}-(\d\d)-(\d\d)$/.exec(this.value);
    if (!m) return;
    const mo = +m[1], da = Math.min(+m[2], C.MONTH_DAYS[+m[1] - 1]);
    setDay(C.dayOfDate(mo, da));
    userChanged();
  });
  function nowAt(zone) {
    const d = new Date(Date.now() + zone * 3600e3);
    const mo = d.getUTCMonth() + 1, da = Math.min(d.getUTCDate(), C.MONTH_DAYS[mo - 1]);
    return { day: C.dayOfDate(mo, da), clock: d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600 };
  }
  $('today').addEventListener('click', function () { setDay(nowAt(st.zone).day); userChanged(); });
  $('jNow').addEventListener('click', function () { const n = nowAt(st.zone); setDay(n.day); setClock(n.clock); setPlaying(false, true); userChanged(); });
  $('jNoon').addEventListener('click', function () { setClock(snap().noon); setPlaying(false, true); userChanged(); });
  $('jRise').addEventListener('click', function () { const s = snap(); if (s.polar) { flash(s.polar); return; } setClock(s.rise); setPlaying(false, true); userChanged(); });
  $('jSet').addEventListener('click', function () { const s = snap(); if (s.polar) { flash(s.polar); return; } setClock(s.set); setPlaying(false, true); userChanged(); });
  function flash(polar) {
    $('status').textContent = polar === 'day' ? T('今天永晝：太陽整天不落下，沒有日出日落。', 'Midnight sun today: the Sun never sets, so there is no sunrise or sunset.')
      : T('今天永夜：太陽整天不升起，沒有日出日落。', 'Polar night today: the Sun never rises, so there is no sunrise or sunset.');
  }
  $('epsReal').addEventListener('click', function () { if (window.LabNum) LabNum.set(elEps, REAL_EPS); st.eps = REAL_EPS; earthCache.clear(); userChanged(); });
  $('epsZero').addEventListener('click', function () { if (window.LabNum) LabNum.set(elEps, 0); st.eps = 0; earthCache.clear(); userChanged(); });
  $('play').addEventListener('click', function () {
    st.user = true;
    setPlaying(!st.playing, true);
    if (!st.playing) userChanged(); // 暫停：讀數、狀態列對齊最後一刻，並回報這個「停住」的狀態
  });
  $('modeDay').addEventListener('click', function () { st.mode = 'day'; st.user = true; setPlaying(st.playing, st.playing); refresh(); });
  $('modeYear').addEventListener('click', function () { st.mode = 'year'; st.user = true; setPlaying(st.playing, st.playing); refresh(); });
  $('clear').addEventListener('click', function () {
    rec.cur = null; rec.old = []; rec.ana = null;
    recordTip();
    requestDraw();
    $('status').textContent = T('已清除所有竿影軌跡。', 'All shadow tracks cleared.');
  });
  [['optRefract', 'refract'], ['optAtmos', 'atmos'], ['optRecord', 'record'], ['optRef', 'refArcs'], ['optLabels', 'labels']].forEach(function (p) {
    $(p[0]).addEventListener('change', function (ev) { st[p[1]] = ev.target.checked; userChanged(); });
  });
  document.querySelectorAll('#chartBtns button').forEach(function (b) {
    b.addEventListener('click', function () { setChart(b.dataset.chart); });
  });
  // 喇叭按鈕
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  $('soundBtn').addEventListener('click', function () {
    if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound'));
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'sound') updateSoundButton(); });

  // ---------- 拖曳：軌道上的地球（改日期）、天空中的太陽（改時刻）、圖表（改日期） ----------
  function ptr(ev, el) { const r = el.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }
  function hitTest(x, y) {
    if (!og || !sg) return null;
    const q = oproj(earthPos(C.sunAt(tNow(), st.eps)));
    if (Math.hypot(x - q[0], y - q[1]) < og.rE + 12) return 'earth';
    const s = snap();
    if (s.alt > -1) { const v = sproj(hv(s.alt, s.az)); if (Math.hypot(x - v[0], y - v[1]) < Math.max(18, sg.Rd * 0.08)) return 'sun'; }
    return null;
  }
  function dragTo(x, y) {
    if (drag === 'earth') {
      // 畫面點 → 軌道面（z = 0）上的點 → 日心黃經 → 太陽黃經 → 日期
      const ey = (x - og.cx) / og.a, ex = (y - og.cy) / (og.a * Math.sin(EL));
      const lamE = Math.atan2(ey, ex) * RAD;
      const lamSun = C.norm360(lamE + 180);
      const t = C.timeOfLongitude(lamSun, tNow());
      let d = C.localOf(t, st.zone).day;
      d = ((d - 1) % 365 + 365) % 365 + 1;
      if (d !== st.day) { setDay(d); userChanged(); }
    } else if (drag === 'sun') {
      const pts = dayPath();
      let best = null, bd = 1e9;
      pts.forEach(function (q) { const v = sproj(hv(q.alt, q.az)); const d2 = (v[0] - x) * (v[0] - x) + (v[1] - y) * (v[1] - y); if (d2 < bd) { bd = d2; best = q; } });
      if (best) { setClock(best.c); if (st.playing && st.mode === 'day') setPlaying(false, true); userChanged(); }
    }
  }
  cv.addEventListener('pointerdown', function (ev) {
    const p = ptr(ev, cv);
    const h = hitTest(p[0], p[1]);
    if (!h) return;
    drag = h;
    ev.preventDefault();
    try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
    cv.style.cursor = 'grabbing';
    dragTo(p[0], p[1]);
  });
  cv.addEventListener('pointermove', function (ev) {
    const p = ptr(ev, cv);
    if (drag) { dragTo(p[0], p[1]); return; }
    if (ev.pointerType === 'mouse') {
      const h = hitTest(p[0], p[1]);
      if (h !== hover) { hover = h; cv.style.cursor = h ? 'grab' : 'default'; requestDraw(); }
    }
  });
  function endDrag() { if (drag) { drag = null; cv.style.cursor = hover ? 'grab' : 'default'; requestDraw(); } }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);
  cv.addEventListener('pointerleave', function () { if (!drag && hover) { hover = null; cv.style.cursor = 'default'; requestDraw(); } });
  let chartDrag = false;
  function chartAt(ev) {
    if (!chartGeom) return;
    const p = ptr(ev, chart);
    const f = (p[0] - chartGeom.L) / (chartGeom.w - chartGeom.L - chartGeom.R);
    const d = clamp(Math.round(1 + f * 364), 1, 365);
    if (d !== st.day) { setDay(d); userChanged(); }
  }
  chart.addEventListener('pointerdown', function (ev) { chartDrag = true; try { chart.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ } chartAt(ev); });
  chart.addEventListener('pointermove', function (ev) { if (chartDrag) chartAt(ev); });
  chart.addEventListener('pointerup', function () { chartDrag = false; });
  chart.addEventListener('pointercancel', function () { chartDrag = false; });

  // ---------- 鍵盤操作（與拖曳相同的限制、相同的任務事件） ----------
  function wrapDay(d) { return ((Math.round(d) - 1) % 365 + 365) % 365 + 1; }
  function keyDay(dx, dy, big) {
    const step = (dx || dy) * (big ? 10 : 1);
    if (!step) return false;
    setDay(wrapDay(st.day + step));
    userChanged();
    return true;
  }
  function describeDay() { return dateText(st.day) + T('，太陽赤緯 ', ', solar declination ') + sgn(snap().dec, 2) + '°'; }
  if (window.LabKeys) {
    kb = LabKeys.attach(cv, {
      label: T('四季與太陽軌跡的模擬畫布：左邊是地球繞太陽的軌道，右邊是觀察者的天空。按 Enter 切換要移動的物件（軌道上的地球改日期、天空中的太陽改時刻），方向鍵移動，Shift 加方向鍵移動得更多。',
        'Seasons simulation: the Earth’s orbit on the left, the observer’s sky on the right. Press Enter to choose the Earth on its orbit (date) or the Sun in the sky (time), use the arrow keys to move it, and hold Shift for bigger steps.'),
      items: [
        { name: function () { return T('軌道上的地球（日期，每步 1 天，Shift 10 天）', 'The Earth on its orbit (date: 1 day per step, 10 with Shift)'); },
          move: keyDay, describe: describeDay },
        { name: function () { return T('天空中的太陽（時刻，每步 5 分鐘，Shift 1 小時）', 'The Sun in the sky (time: 5 minutes per step, 1 hour with Shift)'); },
          move: function (dx, dy, big) {
            const step = (dx || dy) * (big ? 1 : 5 / 60);
            if (!step) return false;
            setClock(Math.round((st.clock + step) * 60) / 60);
            if (st.playing && st.mode === 'day') setPlaying(false, true);
            userChanged();
            return true;
          },
          describe: function () { const s = snap(); return hm(st.clock).slice(0, 5) + T('，太陽高度角 ', ', Sun altitude ') + s.alt.toFixed(1) + T('°，方位角 ', '°, azimuth ') + s.az.toFixed(1) + '°'; } }
      ],
      onChange: requestDraw
    });
    kbChart = LabKeys.attach(chart, {
      label: T('一整年的變化圖。左右方向鍵改日期（Shift 一次 10 天）。', 'Graph through the year. Use the left and right arrow keys to change the date (10 days with Shift).'),
      items: [{ name: function () { return T('圖上的日期', 'The date on the graph'); }, move: keyDay, describe: describeDay }],
      onChange: function () { drawChart(); }
    });
  }

  // ---------- 分享連結：地點的經度與時區、圖表內容（緯度、日期、時刻等滑桿由 classroom.js 自動記錄） ----------
  // classroom.js 由 settings.js 動態載入，可能比本程式晚執行：先放進 LAB_SHARE_EXTRAS，它載入後會自動登記
  function setChart(k) {
    const b = document.querySelector('#chartBtns button[data-chart="' + k + '"]');
    if (!b) return;
    st.chart = k;
    document.querySelectorAll('#chartBtns button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
    drawChart();
  }
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () { return { loc: st.loc ? st.loc.id : null, lon: st.lon, zone: st.zone, chart: st.chart }; },
    set: function (o) {
      if (!o || typeof o !== 'object') return;
      const l = LOCS.filter(function (x) { return x.id === o.loc; })[0];
      if (l && Math.abs(st.lat - l.lat) < 1e-6) { st.loc = l; st.lon = l.lon; st.zone = l.zone; }
      else {
        st.loc = null;
        const lon = +o.lon, z = Math.round(+o.zone);
        if (isFinite(lon)) st.lon = clamp(lon, -180, 180);
        if (isFinite(z)) st.zone = clamp(z, -12, 14);
      }
      if (typeof o.chart === 'string') setChart(o.chart);
      earthCache.clear();
      refresh();
    }
  });

  // =====================================================================
  // 3D 檢視（three.js 以 import() 延遲載入；場景在 seasons-3d.js）
  // =====================================================================
  let view3 = null, threeLib = null, loadToken = 0, scene3 = 'orbit', camEarth = false;
  const stage = $('stage'), viewMsg = $('viewMsg');
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
    catch (e) { return false; }
  }
  function loadThree() {
    if (threeLib) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js')]).then(function (mods) {
      threeLib = { THREE: mods[0], OrbitControls: mods[1].OrbitControls };
      return threeLib;
    });
  }
  function state3() {
    const t = tNow(), o = C.sunAt(t, st.eps), s = snap();
    const trace = rec.cur && rec.cur.key === traceKey() ? Object.keys(rec.cur.pts).map(Number).sort(function (a, b) { return a - b; }).map(function (m) { return [rec.cur.pts[m].x, rec.cur.pts[m].y, m]; }) : [];
    return {
      t: t, o: o, s: s, theta: C.greenwich(t, o), sub: C.subsolar(t, o), eps: st.eps, lat: st.lat, lon: st.lon, zone: st.zone, day: st.day, clock: st.clock,
      seasons: SEASONS, seasonDay: seasonDay, path: dayPath(), ref: st.refArcs ? [st.eps, 0, -st.eps] : [], labels: st.labels,
      trace: trace, ana: rec.ana && rec.ana.key === anaKey() ? rec.ana.pts : [], scene: scene3, camEarth: camEarth,
      locName: st.loc ? T(st.loc.zh, st.loc.en) : latShort(st.lat), dateText: dateText(st.day), timeText: hm(st.clock).slice(0, 5)
    };
  }
  function tokens3() { readTokens(); return Object.assign({}, tok, LD.c, { dark: LD.dark }); }
  function setPressed(mode) {
    $('view2d').setAttribute('aria-pressed', String(mode === '2d'));
    $('view3d').setAttribute('aria-pressed', String(mode === '3d'));
  }
  function camButtons() {
    $('sceneOrbit').setAttribute('aria-pressed', String(scene3 === 'orbit'));
    $('sceneSky').setAttribute('aria-pressed', String(scene3 === 'sky'));
    $('camEarth').hidden = scene3 !== 'orbit';
    $('camEarth').setAttribute('aria-pressed', String(camEarth));
  }
  function setView(mode) {
    if (mode === '3d') {
      if (view3 && view3.active) return;
      const token = ++loadToken;
      setPressed('3d');
      if (!webglAvailable() || !window.Seasons3D) { fail3D(); return; }
      viewMsg.textContent = T('正在載入 3D 檢視…', 'Loading the 3D view…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return;
        stage.classList.add('is3d');
        view3 = window.Seasons3D.create(lib, {
          host: $('view3'), core: C, T: T, state: state3, tokens: tokens3, land: { LAND: LAND, ICE: ICE, LAKES: LAKES, paint: paintLand },
          lost: function () { setView('2d'); viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D。', 'The 3D graphics context was lost, so the view switched back to 2D.'); }
        });
        viewMsg.textContent = '';
        $('resetCam').hidden = false;
        $('camBar').hidden = false;
        camButtons();
        view3.update();
        kick();
      }).catch(function (err) {
        if (token !== loadToken) return;
        if (window.console) console.warn('3D view unavailable:', err);
        fail3D();
      });
    } else {
      loadToken++;
      setPressed('2d');
      if (view3) { view3.dispose(); view3 = null; }
      stage.classList.remove('is3d');
      $('resetCam').hidden = true;
      $('camBar').hidden = true;
      if (/3D/.test(viewMsg.textContent) && !/2D/.test(viewMsg.textContent)) viewMsg.textContent = '';
      resize();
      kick();
    }
  }
  function fail3D() {
    if (view3) { try { view3.dispose(); } catch (e) { /* 忽略 */ } view3 = null; }
    stage.classList.remove('is3d');
    setPressed('2d');
    $('resetCam').hidden = true;
    $('camBar').hidden = true;
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D view is kept.');
    resize();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });
  $('sceneOrbit').addEventListener('click', function () { scene3 = 'orbit'; camButtons(); if (view3) { view3.setScene(scene3); view3.update(); } });
  $('sceneSky').addEventListener('click', function () { scene3 = 'sky'; camEarth = false; camButtons(); if (view3) { view3.setScene(scene3); view3.update(); } });
  $('camEarth').addEventListener('click', function () { camEarth = !camEarth; camButtons(); if (view3) { view3.setCamEarth(camEarth); view3.update(); } });

  // =====================================================================
  // 啟動
  // =====================================================================
  function onTheme() {
    readTokens();
    earthCache.clear();
    bgKey = '';
    if (view3 && view3.active) view3.onTheme();
    outs();
    updateReadouts();
    requestDraw();
  }
  readTokens();
  window.addEventListener('lab:themechange', onTheme);
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', onTheme);
  }
  // 讀取滑桿的初始值（頁面重新整理時瀏覽器可能保留舊值）
  st.lat = val(elLat); st.day = clamp(Math.round(val(elDay)), 1, 365); st.dayF = st.day; st.clock = val(elClock); st.eps = val(elEps); st.speed = Math.round(val(elSpeed));
  if (Math.abs(st.lat - LOCS[0].lat) > 1e-9) st.loc = null;
  st.refract = $('optRefract').checked; st.atmos = $('optAtmos').checked; st.record = $('optRecord').checked; st.refArcs = $('optRef').checked; st.labels = $('optLabels').checked;
  updateSoundButton();
  outs();
  updateReadouts();
  updateAria(true); // 小畫布的說明由程式寫（含英文），HTML 只放中文的預設值
  recordTip();
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { if (cv.clientWidth !== lastW) { lastW = cv.clientWidth; resize(); } }).observe(cv);
    const subs = [shCv, bmCv, chart];
    const lw = subs.map(function () { return 0; });
    new ResizeObserver(function () { let ch = false; subs.forEach(function (c, i) { if (c.clientWidth !== lw[i]) { lw[i] = c.clientWidth; ch = true; } }); if (ch) drawSub(); }).observe(chart);
    new ResizeObserver(function () { drawSub(); }).observe(shCv);
  }
  window.addEventListener('resize', function () { resize(); });
  resize();
  // 自動播放一天（不算使用者操作，不回報任務）；減少動態效果時預設暫停
  if (!reduce) setPlaying(true, false);
  // 測試用：讓 Playwright 讀取狀態
  window.__seasons = { st: st, snap: snap, rec: rec, view3: function () { return view3; }, setDay: setDay, setClock: setClock, setLoc: function (id) { const l = LOCS.filter(function (x) { return x.id === id; })[0]; if (l) { setLoc(l); userChanged(); } } };
})();
