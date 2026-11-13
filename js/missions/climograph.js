/* missions/climograph.js — 氣候圖與柯本氣候分類的任務（星星數 = 等級；隱藏任務 = 等級 × 2）
 *
 * 事件（js/climograph.js 只在使用者操作過之後才回報；載入頁面不算）：
 *   'clim'：換測站、修改月均溫或雨量、換半球、換 C／D 分界、從 7 月開始畫、釘選或清除比較、換檢視時。
 *     data = ClimographCore.snapshot(…) = {
 *       code（目前的類型）, group（第一個字母）, altCode（用另一個 C／D 分界時的類型）, cd（0 或 −3）,
 *       base（測站 id）, baseCode（測站原始資料、原本半球的類型）, edited（月資料和測站不同）, south（目前當作南半球）, startJul,
 *       MAT, MAP, Thot, Tcold, range, Tmon10, Pdry, Pwet, Pth, dryLine（10·Pth，mm）, desertLine, dryRatio, season, sShare,
 *       hot, cold, dry, wet（月份 0–11）, T[12], P[12],
 *       pins：[{ id（沒修改過的測站才有，否則 null）, code, MAP, MAT }], view（chart／dry／map）, moving（拖曳中）
 *     }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const K = window.ClimographCore;

  const M = function (ev) { return ev.type === 'clim' ? ev.data : null; };
  const ST = function (id) { return K && id ? K.STATION[id] : null; };
  /** 拖曳中的瞬間不算，放開才算 */
  const still = function (d) { return !!d && !d.moving; };
  const sameArr = function (a, b) { for (let i = 0; i < 12; i++) if (Math.abs(a[i] - b[i]) > 0.04) return false; return true; };
  /** 測站的原始資料、原本的半球 */
  const real = function (d) { const s = d && ST(d.base); return !!s && !d.edited && d.south === s.south; };
  const G = function (code) { return code ? code[0] : ''; };
  const origT = function (d) { return sameArr(d.T, ST(d.base).T); };
  const origP = function (d) { return sameArr(d.P, ST(d.base).P); };
  /** 和測站原始資料相比，改了幾個數值（24 個裡面） */
  const nDiff = function (d) {
    const s = ST(d.base); let n = 0;
    for (let i = 0; i < 12; i++) { if (Math.abs(d.T[i] - s.T[i]) > 0.04) n++; if (Math.abs(d.P[i] - s.P[i]) > 0.04) n++; }
    return n;
  };
  /** 畫面上的真實測站：沒修改過的目前測站＋沒修改過的釘選（同一站只算一次） */
  const realSet = function (d) {
    const out = [], seen = {};
    if (real(d)) { out.push({ id: d.base, code: d.code, MAT: d.MAT, MAP: d.MAP }); seen[d.base] = 1; }
    (d.pins || []).forEach(function (p) { if (p.id && !seen[p.id]) { seen[p.id] = 1; out.push(p); } });
    return out;
  };

  LabMission.register('climograph', [
    {
      id: 'climograph-1', level: 1,
      title: { zh: '乾燥的地方', en: 'A dry place' },
      desc: { zh: '選一個乾燥氣候（代號 B 開頭）的測站。', en: 'Choose a station with an arid climate (a code starting with B).' },
      check: function (ev) { const d = M(ev); return real(d) && d.group === 'B'; }
    },
    {
      id: 'climograph-2', level: 2,
      title: { zh: '一年溫差 40 °C', en: 'A 40 °C year' },
      desc: { zh: '找一個最熱月和最冷月的均溫相差 40 °C 以上的測站（不修改資料）。', en: 'Find a station whose warmest and coldest months differ by 40 °C or more (without changing the data).' },
      check: function (ev) { const d = M(ev); return real(d) && d.range >= 40; }
    },
    {
      id: 'climograph-3', level: 2,
      title: { zh: '臺灣的熱帶', en: 'Tropical Taiwan' },
      desc: { zh: '在臺灣的測站裡，找一個熱帶氣候（代號 A 開頭）的地方。', en: 'Among Taiwan’s stations, find one with a tropical climate (a code starting with A).' },
      check: function (ev) { const d = M(ev); return real(d) && ST(d.base).reg === 'tw' && d.group === 'A'; }
    },
    {
      id: 'climograph-4', level: 3,
      title: { zh: '夏天反而乾', en: 'Dry summers' },
      desc: { zh: '找一個「夏乾」的溫帶氣候測站：代號 Cs 開頭，也就是地中海型氣候。', en: 'Find a temperate station with dry summers: a code starting with Cs, the Mediterranean climate.' },
      check: function (ev) { const d = M(ev); return real(d) && /^Cs/.test(d.code); }
    },
    {
      id: 'climograph-5', level: 3,
      title: { zh: '把夏天放中間', en: 'Summer in the middle' },
      desc: { zh: '選一個南半球的測站，再按「從 7 月開始畫」，讓它的夏天落在氣候圖的中間。', en: 'Choose a Southern Hemisphere station and press “Start the chart in July” so its summer sits in the middle of the climograph.' },
      check: function (ev) { const d = M(ev); return real(d) && d.south && d.startJul; }
    },
    {
      id: 'climograph-6', level: 4,
      title: { zh: '三大類並排', en: 'Three groups side by side' },
      desc: { zh: '用「釘選比較」，讓畫面上（目前的測站加上釘選的）同時出現至少三種不同的大類（第一個字母不同）。', en: 'Use “Pin for comparison” so that the chart shows at least three different groups (different first letters), counting the current station and the pinned ones.' },
      check: function (ev) {
        const d = M(ev);
        if (!d || (d.pins || []).length < 2) return false;
        const g = {}; g[d.group] = 1; d.pins.forEach(function (p) { g[G(p.code)] = 1; });
        return Object.keys(g).length >= 3;
      }
    },
    {
      id: 'climograph-7', level: 4,
      title: { zh: '只改溫度，臺北變雨林', en: 'Taipei as a rainforest' },
      desc: { zh: '雨量不動，只修改臺北的月均溫，讓它變成熱帶雨林氣候（Af）。最少要改幾個月？', en: 'Without touching the rainfall, change only Taipei’s monthly temperatures until it becomes a tropical rainforest (Af). How few months must you change?' },
      check: function (ev) { const d = M(ev); return still(d) && d.base === 'taipei' && !d.south && origP(d) && d.code === 'Af'; }
    },
    {
      id: 'climograph-8', level: 5,
      title: { zh: '冬天少下一點雨', en: 'A drier winter' },
      desc: { zh: '溫度不動，只修改臺北的雨量，讓它從 Cfa 變成冬乾的 Cwa。', en: 'Without touching the temperatures, change only Taipei’s rainfall so that it turns from Cfa into Cwa, with a dry winter.' },
      check: function (ev) { const d = M(ev); return still(d) && d.base === 'taipei' && !d.south && origT(d) && d.code === 'Cwa'; }
    },
    {
      id: 'climograph-9', level: 5,
      title: { zh: '讓乾燥的地方溼起來', en: 'Out of the dry zone' },
      desc: { zh: '從一個乾燥氣候（B）的測站開始，溫度不動、只增加雨量（每個月都不少於原本），讓它不再是乾燥氣候。', en: 'Start from an arid (B) station. Keep the temperatures and only add rain (no month below its original value) until it is no longer arid.' },
      check: function (ev) {
        const d = M(ev), s = d && ST(d.base);
        if (!still(d) || !s || !d.edited || d.south !== s.south || d.group === 'B' || G(d.baseCode) !== 'B' || !origT(d)) return false;
        for (let i = 0; i < 12; i++) if (d.P[i] < s.P[i] - 0.04) return false;
        return true;
      }
    },
    {
      id: 'climograph-10', level: 6,
      title: { zh: 'C 還是 D？', en: 'C or D?' },
      desc: { zh: '把 C 與 D 的分界改成柯本原本的 −3 °C，找一個因此從 D 變成 C 的測站。', en: 'Switch the C/D boundary to Köppen’s original −3 °C and find a station that turns from D into C because of it.' },
      check: function (ev) { const d = M(ev); return real(d) && d.cd === -3 && d.group === 'C' && G(d.altCode) === 'D'; }
    },
    {
      id: 'climograph-11', level: 7,
      title: { zh: '年平均騙了你', en: 'Fooled by the averages' },
      desc: { zh: '用釘選比較找出兩個測站：年均溫相差不到 1 °C、年雨量相差不到 100 mm，大類（第一個字母）卻不同。兩個都不修改資料。', en: 'Using pins, show two stations whose annual mean temperatures differ by less than 1 °C and annual precipitation by less than 100 mm, yet whose groups (first letters) differ. Neither may be edited.' },
      check: function (ev) {
        const d = M(ev), L = d ? realSet(d) : [];
        for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
          const a = L[i], b = L[j];
          if (G(a.code) !== G(b.code) && Math.abs(a.MAT - b.MAT) < 1 && Math.abs(a.MAP - b.MAP) < 100) return true;
        }
        return false;
      }
    },
    {
      id: 'climograph-12', level: 8,
      title: { zh: '只改一個數字', en: 'Just one number' },
      desc: { zh: '24 個數值裡只改臺北的一個（某個月的均溫或雨量），讓它不再是溫帶（C）氣候。', en: 'Change just one of Taipei’s 24 numbers (one month’s temperature or rainfall) so that it is no longer a temperate (C) climate.' },
      check: function (ev) { const d = M(ev); return still(d) && d.base === 'taipei' && !d.south && nDiff(d) === 1 && d.group !== 'C'; }
    },

    // ---------- 隱藏任務 ----------
    {
      id: 'climograph-h1', level: 3, hidden: true,
      riddle: { zh: '十二頁月曆，一把傘也沒打開。', en: 'Twelve pages of the calendar, and not one umbrella opened.' },
      check: function (ev) { const d = M(ev); return still(d) && d.edited && d.MAP === 0; }
    },
    {
      id: 'climograph-h2', level: 4, hidden: true,
      riddle: { zh: '月曆翻了十二頁，溫度計一動也不動。', en: 'The calendar turned twelve pages; the thermometer never moved.' },
      check: function (ev) { const d = M(ev); return still(d) && d.edited && d.range === 0; }
    },
    {
      id: 'climograph-h3', level: 4, hidden: true,
      riddle: { zh: '赤道是一面鏡子，鏡子兩邊住著同名的你。', en: 'The equator is a mirror, and someone with your name lives on the other side.' },
      check: function (ev) {
        // 畫面上兩個真實測站：同類型、分在南北半球、緯度互為鏡像（相差 5° 以內）
        const d = M(ev), L = d ? realSet(d) : [];
        for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
          const a = ST(L[i].id), b = ST(L[j].id);
          if (L[i].code === L[j].code && a.south !== b.south && Math.abs(a.lat + b.lat) <= 5) return true;
        }
        return false;
      }
    },
    {
      id: 'climograph-h4', level: 5, hidden: true,
      riddle: { zh: '季節倒著過，島上也長出了橄欖。', en: 'Let the seasons run backwards, and olives grow on the island.' },
      check: function (ev) { const d = M(ev), s = d && ST(d.base); return !!s && s.reg === 'tw' && !d.edited && d.south !== s.south && /^Cs/.test(d.code); }
    },
    {
      id: 'climograph-h5', level: 6, hidden: true,
      riddle: { zh: '最冷的冬天，再省下幾片雪花。', en: 'The coldest winter saves a few more snowflakes.' },
      check: function (ev) { const d = M(ev); return still(d) && d.code === 'Dwd'; }
    },
    {
      id: 'climograph-h6', level: 7, hidden: true,
      riddle: { zh: '只差最後一滴。', en: 'Just one drop short.' },
      check: function (ev) { const d = M(ev); return still(d) && d.edited && d.group === 'B' && d.dryLine > 0 && d.MAP >= d.dryLine * 0.995; }
    },
    {
      id: 'climograph-h7', level: 7, hidden: true,
      riddle: { zh: '連最熱的那個月，冰也不肯讓步。', en: 'Even in the warmest month, the ice will not give way.' },
      check: function (ev) { const d = M(ev); return still(d) && d.edited && d.code === 'EF'; }
    },
    {
      id: 'climograph-h8', level: 8, hidden: true,
      riddle: { zh: '季風與莽原之間有一條看不見的線，踩在上面。', en: 'Between monsoon and savanna runs an invisible line. Stand on it.' },
      check: function (ev) {
        const d = M(ev), s = d && ST(d.base);
        // 要親手調整最乾的那個月（不是改別的月份碰巧碰到），而且那個月真的有下雨
        return still(d) && !!s && d.group === 'A' && d.Pdry >= 5 && d.Pdry < 60 && Math.abs(d.P[d.dry] - s.P[d.dry]) > 0.04 && Math.abs(d.Pdry - (100 - d.MAP / 25)) <= 0.5;
      }
    },
    {
      id: 'climograph-h9', level: 9, hidden: true,
      riddle: { zh: '用最少的雨，養活一片雨林。', en: 'Keep a rainforest alive on as little rain as possible.' },
      check: function (ev) { const d = M(ev); return still(d) && d.code === 'Af' && d.MAP <= 760; }
    },
    {
      id: 'climograph-h10', level: 10, hidden: true,
      riddle: { zh: '下了一公尺的雨，仍然被叫作乾。', en: 'A metre of rain, and still they call it dry.' },
      check: function (ev) { const d = M(ev); return still(d) && d.group === 'B' && d.MAP >= 1000; }
    }
  ]);
})();
