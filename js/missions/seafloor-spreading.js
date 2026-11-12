/* missions/seafloor-spreading.js — 海底擴張與磁條帶的任務（星星數 = 等級；隱藏任務 = 等級 × 2）
 *
 * 事件（js/seafloor-spreading.js 只在使用者操作過之後才回報；載入頁面不算）：
 *   'state'：data = {
 *      uL、uR（左右半擴張速率 cm/yr）, sym, zs（磁力計在海面下 km）, tau（時間：幾 Ma 前）, playing, mystery（神秘海脊進行中）,
 *      dragging（正在拖曳船；放開時會再送一次 dragging = false）,
 *      cx（船的位置 km，右為正）, cAge（船下方地殼的年齡 Ma）, cBorn（形成於幾 Ma 前）, cPol（±1，年表外 0）, cIn（在年表內）,
 *      cDepth（GDH1 水深 m）, cHeat（熱流 mW/m²）, cB（磁異常 nT）,
 *      bmL、bmR（布容／松山邊界在左右離中洋脊 km）, Bmax（剖面上最大的磁異常 nT）,
 *      ja、cobb（右側的加拉米佑、卡布山正向亞期在磁異常裡看不看得出獨立的峰：SeafloorCore.resolved，和螢幕無關）, R }；
 *   'tape'：從 8 Ma 前一路播放到現在，data = { uL, uR }；
 *   'guess'：神秘海脊送出答案，data = { u（答案）, g（猜的）, err（相對誤差） }；
 *   'chart'、'view'、'cam'：切換圖表、3D 與視角。
 * 神秘海脊進行中，和船下方地殼有關的任務都不算（速率是藏起來的）。
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const S = function (ev) { return ev.type === 'state' ? ev.data : null; };
  const open = function (ev) { const d = S(ev); return d && !d.mystery ? d : null; };
  /** 「把船停在某處」的任務：拖曳途中掃過去不算，要放開（或用方向鍵）停在那裡 */
  const parked = function (ev) { const d = open(ev); return d && !d.dragging ? d : null; };
  const REV = window.SeafloorCore ? window.SeafloorCore.reversals(window.SeafloorCore.T_MAX) : [];

  LabMission.register('seafloor-spreading', [
    {
      id: 'seafloor-spreading-1', level: 1,
      title: { zh: '八百萬年的錄音帶', en: 'An eight-million-year tape' },
      desc: { zh: '從 800 萬年前開始播放，一路看到現在：中洋脊兩邊長出一條條正向、反向的磁條帶。', en: 'Play from 8 million years ago all the way to the present and watch normal and reversed stripes grow on both sides of the ridge.' },
      check: function (ev) { return ev.type === 'tape'; }
    },
    {
      id: 'seafloor-spreading-2', level: 2,
      title: { zh: '布容邊界', en: 'The Brunhes boundary' },
      desc: { zh: '在現在（0 Ma）把船開到布容正向期和松山反向期的交界正上方（誤差 1 km 內）。', en: 'At the present day (0 Ma), put the ship right above the boundary between the Brunhes normal and Matuyama reversed chrons (within 1 km).' },
      check: function (ev) {
        const d = parked(ev); if (!d || d.tau > 0.0005) return false;
        const x = Math.abs(d.cx), b = d.cx > 0 ? d.bmR : d.bmL;
        return x > 0.5 && Math.abs(x - b) <= 1;
      }
    },
    {
      id: 'seafloor-spreading-3', level: 2,
      title: { zh: '貼近海床', en: 'Hugging the seafloor' },
      desc: { zh: '把磁力計放深，讓剖面上最大的磁異常達到 1000 nT 以上。', en: 'Lower the magnetometer until the largest anomaly on the section reaches 1000 nT or more.' },
      check: function (ev) { const d = S(ev); return !!d && d.Bmax >= 1000; }
    },
    {
      id: 'seafloor-spreading-4', level: 3,
      title: { zh: '停在奧杜威', en: 'Stop in the Olduvai' },
      desc: { zh: '讓時間停在奧杜威正向亞期（1.778–1.945 Ma 前）：在松山反向期中間，中洋脊短暫地產生正向的地殼。', en: 'Stop time inside the Olduvai normal subchron (1.778–1.945 Ma ago): in the middle of the Matuyama reversed chron, the ridge briefly makes normal crust.' },
      check: function (ev) { const d = S(ev); return !!d && !d.playing && d.tau >= 1.778 && d.tau <= 1.945; }
    },
    {
      id: 'seafloor-spreading-5', level: 3,
      title: { zh: '水深 3000 公尺', en: '3000 metres down' },
      desc: { zh: '找到海床水深 3000 m 的地方（誤差 5 m 內），讀出那裡地殼的年齡。', en: 'Find where the seafloor is 3000 m deep (within 5 m) and read off the age of the crust there.' },
      check: function (ev) { const d = parked(ev); return !!d && Math.abs(d.cDepth - 3000) <= 5; }
    },
    {
      id: 'seafloor-spreading-6', level: 4,
      title: { zh: '熱流 200', en: 'Heat flow 200' },
      desc: { zh: '把船開到熱流 200 mW/m² 的地方（誤差 3 以內）。', en: 'Put the ship where the heat flow is 200 mW/m² (within 3).' },
      check: function (ev) { const d = parked(ev); return !!d && d.cAge >= 0.05 && Math.abs(d.cHeat - 200) <= 3; }
    },
    {
      id: 'seafloor-spreading-7', level: 4,
      title: { zh: '一邊快一邊慢', en: 'One side fast, one side slow' },
      desc: { zh: '取消勾選「兩邊一樣快（對稱擴張）」，讓一邊的布容邊界離中洋脊剛好是另一邊的 2 倍（誤差 1% 內）。', en: 'Untick “Same rate on both sides (symmetric)” and make the Brunhes boundary on one side exactly twice as far from the ridge as on the other (within 1%).' },
      check: function (ev) {
        const d = open(ev); if (!d || d.tau >= 0.781 || !(d.bmL > 0) || !(d.bmR > 0)) return false;
        const q = d.bmR / d.bmL;
        return Math.abs(q - 2) <= 0.02 || Math.abs(1 / q - 2) <= 0.02;
      }
    },
    {
      id: 'seafloor-spreading-8', level: 5,
      title: { zh: '海面上的極限', en: 'The limit at the surface' },
      desc: { zh: '磁力計留在海面（0 km），把右邊的半擴張速率調到 1.3 cm/yr 以下，卻仍然看得出加拉米佑亞期的峰。', en: 'Keep the magnetometer at the surface (0 km), turn the right half-rate down to 1.3 cm/yr or less, and still resolve the Jaramillo peak.' },
      check: function (ev) { const d = open(ev); return !!d && d.zs < 0.005 && d.uR <= 1.3 && d.ja; }
    },
    {
      id: 'seafloor-spreading-9', level: 5,
      title: { zh: '慢速脊上的加拉米佑', en: 'Jaramillo on a slow ridge' },
      desc: { zh: '把右邊的半擴張速率調到 0.9–1.0 cm/yr（像大西洋中洋脊那麼慢），再把磁力計放深，讓加拉米佑亞期的峰重新出現。', en: 'Set the right half-rate to 0.9–1.0 cm/yr (as slow as the Mid-Atlantic Ridge), then lower the magnetometer until the Jaramillo peak reappears.' },
      check: function (ev) { const d = open(ev); return !!d && d.uR >= 0.9 && d.uR <= 1.0 && d.ja; }
    },
    {
      id: 'seafloor-spreading-10', level: 6,
      title: { zh: '神秘海脊', en: 'Mystery ridge' },
      desc: { zh: '按「出一題神秘海脊」，只靠磁條帶量出它的半擴張速率，誤差 5% 內。', en: 'Press “New mystery ridge” and, from the magnetic stripes alone, measure its half-rate to within 5%.' },
      check: function (ev) { return ev.type === 'guess' && ev.data.err <= 0.05; }
    },
    {
      id: 'seafloor-spreading-11', level: 8,
      title: { zh: '神準的海洋學家', en: 'Sharp-eyed oceanographer' },
      desc: { zh: '神秘海脊的半擴張速率，誤差 1% 內。', en: 'Measure a mystery ridge’s half-rate to within 1%.' },
      check: function (ev) { return ev.type === 'guess' && ev.data.err <= 0.01; }
    },
    {
      id: 'seafloor-spreading-h1', level: 4, hidden: true,
      riddle: { zh: '找到這卷錄音帶的第一個字。', en: 'Find the very first word on this tape.' },
      check: function (ev) { const d = S(ev); return !!d && !d.dragging && d.tau < 0.0005 && d.cIn && d.cBorn >= 8.0; }
    },
    {
      id: 'seafloor-spreading-h2', level: 6, hidden: true,
      riddle: { zh: '一萬兩千年的一眨眼，慢吞吞的海也記得。', en: 'A twelve-thousand-year blink, and even a sluggish sea remembers it.' },
      check: function (ev) { const d = open(ev); return !!d && d.uR <= 1.2 && d.cobb; }
    },
    {
      id: 'seafloor-spreading-h3', level: 5, hidden: true,
      riddle: { zh: '在南北交換的那一瞬間按下暫停。', en: 'Press pause at the very instant north and south trade places.' },
      check: function (ev) {
        const d = S(ev); if (!d || d.playing || !(d.tau > 0)) return false;
        return REV.some(function (t) { return Math.abs(d.tau - t) <= 0.001; });
      }
    }
  ]);
})();
