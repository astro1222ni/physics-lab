/* missions/seawater.js — 海水的溫度、鹽度與密度（T–S 圖與水團）的任務（星星數 = 等級；隱藏任務 = 等級 × 2）
 *
 * 事件（js/seawater.js 只在使用者操作過之後才回報；載入頁面不算）：
 *   'water'：data = {
 *      TA、SA、TB、SB（兩團水的溫度 °C、鹽度）, f（混合比例：B 的比例）, TM、SM（混合水）,
 *      sA、sB、sM（以海面為參考的 σ = 密度 − 1000 kg/m³）, fA（A 的冰點）, tmdA（A 的最大密度溫度）, excess（混合水比兩者密度平均重多少）,
 *      zA、wA、zB、wB、zM、wM（放進目前剖面會停在的深度 m；w = 'surface'／'mid'／'bottom'）,
 *      prof（剖面代號）, range, pick（選到的水團）, pins, dragging（正在拖曳；放開時會再送一次 dragging = false） }；
 *   'pick'：選了一個水團，data = { id, from }；'range'、'pin'、'view'、'cam'：切換範圍、留下記號、3D 與視角。
 * 「調到某個值」的任務，拖曳途中掃過去不算，要放開（或用滑桿、打字、方向鍵）停在那裡。
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const W = function (ev) { return ev.type === 'water' ? ev.data : null; };
  const parked = function (ev) { const d = W(ev); return d && !d.dragging ? d : null; };
  const deep = function (w, z, zmin) { return w === 'bottom' || (w === 'mid' && z >= zmin); };
  const shallow = function (w, z, zmax) { return w === 'surface' || (w === 'mid' && z <= zmax); };

  LabMission.register('seawater', [
    {
      id: 'seawater-1', level: 1,
      title: { zh: '河水', en: 'River water' },
      desc: { zh: '把水團 A 的鹽度調到 1 以下，變成幾乎沒有鹽的河水。', en: 'Lower parcel A’s salinity to 1 or less, so it is almost salt-free river water.' },
      check: function (ev) { const d = parked(ev); return !!d && d.SA <= 1; }
    },
    {
      id: 'seawater-2', level: 2,
      title: { zh: 'σ = 25', en: 'σ = 25' },
      desc: { zh: '調整 A 的溫度或鹽度，讓它的 σ 剛好是 25.00（誤差 0.02 內），也就是密度 1025 kg/m³。', en: 'Adjust A’s temperature or salinity so its σ is exactly 25.00 (within 0.02), a density of 1025 kg/m³.' },
      check: function (ev) { const d = parked(ev); return !!d && Math.abs(d.sA - 25) <= 0.02; }
    },
    {
      id: 'seawater-3', level: 2,
      title: { zh: '冷到冰點', en: 'Down to freezing' },
      desc: { zh: '鹽度至少 30 的海水，把 A 的溫度調到剛好是它的冰點（誤差 0.05 °C 內）。海水的冰點比 0 °C 低多少？', en: 'With a salinity of at least 30, set A’s temperature right at its freezing point (within 0.05 °C). How far below 0 °C is it?' },
      check: function (ev) { const d = parked(ev); return !!d && d.SA >= 30 && Math.abs(d.TA - d.fA) <= 0.05; }
    },
    {
      id: 'seawater-4', level: 3,
      title: { zh: '冷熱不同，一樣重', en: 'Different temperatures, same weight' },
      desc: { zh: '讓 A 和 B 的溫度至少差 10 °C，密度卻一樣（σ 差 0.01 內）：兩團水要放在同一條等密度線上。', en: 'Make A and B differ by at least 10 °C yet have the same density (σ within 0.01): both must sit on the same density line.' },
      check: function (ev) { const d = parked(ev); return !!d && Math.abs(d.sA - d.sB) <= 0.01 && Math.abs(d.TA - d.TB) >= 10; }
    },
    {
      id: 'seawater-5', level: 3,
      title: { zh: '停在一千公尺', en: 'Settle at 1000 m' },
      desc: { zh: '選一個剖面，調整 A，讓它放進海裡會停在 980–1020 m 深。', en: 'Choose a profile and adjust A so that, released into the ocean, it settles between 980 and 1020 m.' },
      check: function (ev) { const d = parked(ev); return !!d && d.wA === 'mid' && d.zA >= 980 && d.zA <= 1020; }
    },
    {
      id: 'seawater-6', level: 4,
      title: { zh: '混合後變重', en: 'Heavier after mixing' },
      desc: { zh: '讓 A、B 一樣重（σ 差 0.02 內），混合比例在 0.4–0.6，而混合水的 σ 比兩者都大至少 0.1。', en: 'Make A and B equally dense (σ within 0.02), keep the mixing ratio between 0.4 and 0.6, and make the mixture’s σ at least 0.1 higher than both.' },
      check: function (ev) {
        const d = parked(ev);
        return !!d && Math.abs(d.sA - d.sB) <= 0.02 && d.f >= 0.4 && d.f <= 0.6 && d.sM >= Math.max(d.sA, d.sB) + 0.1;
      }
    },
    {
      id: 'seawater-7', level: 4,
      title: { zh: '最重的水團', en: 'The densest water mass' },
      desc: { zh: '以海面為參考（σθ），清單裡哪個水團最重？選它、按「設給 A」，再切到北大西洋剖面，看它停在哪裡。', en: 'Referenced to the surface (σθ), which water mass in the list is densest? Choose it, press “Copy to A”, then switch to the North Atlantic profile and see where it settles.' },
      check: function (ev) {
        const d = parked(ev);
        return !!d && d.pick === 'nadw' && d.prof === 'natl' && Math.abs(d.TA - 2.5) < 0.005 && Math.abs(d.SA - 34.92) < 0.005;
      }
    },
    {
      id: 'seawater-8', level: 4,
      title: { zh: '又暖又沉', en: 'Warm, yet it sinks' },
      desc: { zh: '讓溫度至少 15 °C 的 A 停在 1900–2100 m 深。暖水要怎樣才沉得下去？', en: 'Make A at least 15 °C warm and still settle between 1900 and 2100 m. How can warm water sink?' },
      check: function (ev) { const d = parked(ev); return !!d && d.TA >= 15 && d.wA === 'mid' && d.zA >= 1900 && d.zA <= 2100; }
    },
    {
      id: 'seawater-9', level: 5,
      title: { zh: '淡水最重的溫度', en: 'When fresh water is densest' },
      desc: { zh: '鹽度 0.5 以下的 A，調到它最重的那個溫度（誤差 0.05 °C 內）。那不是 0 °C。', en: 'With A’s salinity at 0.5 or less, set it to the temperature at which it is densest (within 0.05 °C). It is not 0 °C.' },
      check: function (ev) { const d = parked(ev); return !!d && d.SA <= 0.5 && Math.abs(d.TA - d.tmdA) <= 0.05; }
    },
    {
      id: 'seawater-10', level: 5,
      title: { zh: '兩條線相遇', en: 'Where the two lines meet' },
      desc: { zh: '把 A 放在冰點線和最大密度線交會的那一點（兩個溫度差 0.02 °C 內，A 的溫度在冰點 0.05 °C 內）。這個鹽度以上，海水冷到結冰都還是越冷越重。', en: 'Put A where the freezing line meets the maximum-density line (the two temperatures within 0.02 °C, A within 0.05 °C of freezing). Above this salinity, sea water keeps getting denser all the way down to freezing.' },
      check: function (ev) { const d = parked(ev); return !!d && Math.abs(d.tmdA - d.fA) <= 0.02 && Math.abs(d.TA - d.fA) <= 0.05; }
    },
    {
      id: 'seawater-11', level: 6,
      title: { zh: '淺水混成深水', en: 'Shallow waters make deep water' },
      desc: { zh: '兩團水各自都停在 500 m 以內（或浮在海面），混合後卻沉到 1000 m 以下（或海底）。', en: 'Both parcels on their own stay within 500 m (or float at the surface), yet their mixture sinks below 1000 m (or to the sea floor).' },
      check: function (ev) {
        const d = parked(ev);
        return !!d && shallow(d.wA, d.zA, 500) && shallow(d.wB, d.zB, 500) && deep(d.wM, d.zM, 1000);
      }
    },
    {
      id: 'seawater-h1', level: 5, hidden: true,
      riddle: { zh: '同樣的鹹，冷的卻浮在上面。', en: 'Equally salty, and yet the colder one floats.' },
      check: function (ev) { const d = parked(ev); return !!d && Math.abs(d.SA - d.SB) <= 0.01 && d.TB - d.TA >= 0.5 && d.sA < d.sB; }
    },
    {
      id: 'seawater-h2', level: 3, hidden: true,
      riddle: { zh: '一路沉到底，再也回不來。', en: 'All the way down, never to return.' },
      check: function (ev) { const d = parked(ev); return !!d && d.wA === 'bottom' && d.TA - d.fA <= 0.1 && d.TA >= d.fA; }
    },
    {
      id: 'seawater-h3', level: 4, hidden: true,
      riddle: { zh: '零下兩度的海，還在流動。', en: 'Two below zero, and the sea still flows.' },
      check: function (ev) { const d = parked(ev); return !!d && d.TA <= -2 && d.TA >= d.fA; }
    }
  ]);
})();
