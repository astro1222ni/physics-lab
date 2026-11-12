/* climograph-core.js — 「氣候圖與柯本氣候分類」的核心（與畫面無關，Node 可直接 require）
 *
 * 柯本－蓋格（Köppen–Geiger）分類，判定規則照 Peel、Finlayson 與 McMahon（2007）以及 Beck 等（2018）：
 *   月均溫 T[12]（°C）、月降水 P[12]（mm），夏半年 = 北半球 4–9 月、南半球 10–3 月。
 *   MAT 年均溫、MAP 年降水、Thot 最熱月、Tcold 最冷月、Tmon10 月均溫高於 10 °C 的月數、Pdry 最乾月，
 *   Psdry／Pswet 夏半年最乾／最溼月、Pwdry／Pwwet 冬半年最乾／最溼月。
 *   乾燥門檻 Pth：冬半年雨量占 70% 以上 → 2·MAT；夏半年占 70% 以上 → 2·MAT + 28；其他 → 2·MAT + 14（單位 cm，比較時 ×10 換成 mm）。
 *   判定順序：E（Thot < 10）→ B（MAP < 10·Pth）→ A（Tcold ≥ 18）→ C（Tcold > 0 °C；可改用柯本原本的 −3 °C）→ D。
 *   A：Af（Pdry ≥ 60）、Am（Pdry ≥ 100 − MAP/25）、Aw（其他）。
 *   B：BW（MAP < 5·Pth）或 BS；h（MAT ≥ 18）或 k。
 *   C、D 第二個字母：s（Psdry < 40 且 Psdry < Pwwet/3）、w（Pwdry < Pswet/10）、f（都不是）；s 和 w 同時成立時，看哪半年雨量少。
 *   第三個字母：a（Thot ≥ 22）、b（Tmon10 ≥ 4）、c（其他），D 類冬季 Tcold ≤ −38 為 d。
 *   E：ET（Thot > 0）、EF（Thot ≤ 0）。
 * 測站資料：臺灣是中央氣象署 1991–2020 氣候平均值；其他是 WMO 1991–2020 氣候平均值（NOAA NCEI 典藏）。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ClimographCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MONTH_ZH = ['1 月', '2 月', '3 月', '4 月', '5 月', '6 月', '7 月', '8 月', '9 月', '10 月', '11 月', '12 月'];
  const MONTH_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const SUMMER_N = [3, 4, 5, 6, 7, 8];          // 4–9 月（0 起算）
  const SUMMER_S = [9, 10, 11, 0, 1, 2];        // 10–3 月
  const T_MIN = -50, T_MAX = 40, P_MAX = 900;   // 編輯範圍

  const r1 = function (v) { return Math.round(v * 10) / 10; };
  const sum = function (a) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s; };
  const pick = function (a, idx) { return idx.map(function (i) { return a[i]; }); };

  /** 各種統計量；south = true 表示南半球（夏半年是 10–3 月） */
  function stats(T, P, south) {
    const sIdx = south ? SUMMER_S : SUMMER_N, wIdx = south ? SUMMER_N : SUMMER_S;
    const MAT = sum(T) / 12, MAP = sum(P);
    const Thot = Math.max.apply(null, T), Tcold = Math.min.apply(null, T);
    const Tmon10 = T.filter(function (t) { return t > 10; }).length;
    const Ps = pick(P, sIdx), Pw = pick(P, wIdx);
    const PsSum = sum(Ps), PwSum = sum(Pw);
    const Pdry = Math.min.apply(null, P), Pwet = Math.max.apply(null, P);
    const season = MAP <= 0 ? 'even' : PwSum >= 0.7 * MAP ? 'winter' : PsSum >= 0.7 * MAP ? 'summer' : 'even';
    const Pth = 2 * MAT + (season === 'winter' ? 0 : season === 'summer' ? 28 : 14);
    return {
      MAT: MAT, MAP: MAP, Thot: Thot, Tcold: Tcold, range: Thot - Tcold, Tmon10: Tmon10,
      hot: T.indexOf(Thot), cold: T.indexOf(Tcold), dry: P.indexOf(Pdry), wet: P.indexOf(Pwet),
      Pdry: Pdry, Pwet: Pwet, Psdry: Math.min.apply(null, Ps), Pswet: Math.max.apply(null, Ps),
      Pwdry: Math.min.apply(null, Pw), Pwwet: Math.max.apply(null, Pw),
      Ps: PsSum, Pw: PwSum, sShare: MAP > 0 ? PsSum / MAP : 0.5, season: season, Pth: Pth,
      dryLine: 10 * Pth, desertLine: 5 * Pth
    };
  }

  /**
   * 判定柯本－蓋格類型。opts.cd：C／D 的分界（0 或 −3 °C，預設 0）。
   * 傳回 { code, group, letters, s（統計量）, steps：[{ k（規則代號）, ok, v（數值） }] }，steps 由頁面翻成文字。
   */
  function classify(T, P, south, opts) {
    const cd = opts && opts.cd != null ? opts.cd : 0;
    const s = stats(T, P, south), steps = [];
    let code;
    const step = function (k, ok, v) { steps.push({ k: k, ok: ok, v: v || {} }); return ok; };
    if (step('E', s.Thot < 10, { Thot: s.Thot })) {
      code = step('EF', s.Thot <= 0, { Thot: s.Thot }) ? 'EF' : 'ET';
    } else if (step('B', s.MAP < s.dryLine, { MAP: s.MAP, line: s.dryLine, Pth: s.Pth, season: s.season, MAT: s.MAT })) {
      const w = step('BW', s.MAP < s.desertLine, { MAP: s.MAP, line: s.desertLine }) ? 'W' : 'S';
      const h = step('h', s.MAT >= 18, { MAT: s.MAT }) ? 'h' : 'k';
      code = 'B' + w + h;
    } else if (step('A', s.Tcold >= 18, { Tcold: s.Tcold })) {
      if (step('Af', s.Pdry >= 60, { Pdry: s.Pdry })) code = 'Af';
      else code = step('Am', s.Pdry >= 100 - s.MAP / 25, { Pdry: s.Pdry, line: 100 - s.MAP / 25 }) ? 'Am' : 'Aw';
    } else {
      const G = step('C', s.Tcold > cd, { Tcold: s.Tcold, cd: cd }) ? 'C' : 'D';
      const sOk = s.Psdry < 40 && s.Psdry < s.Pwwet / 3, wOk = s.Pwdry < s.Pswet / 10;
      let L2;
      if (sOk && wOk) L2 = s.Ps < s.Pw ? 's' : 'w';
      else L2 = sOk ? 's' : wOk ? 'w' : 'f';
      step('s', sOk, { Psdry: s.Psdry, Pwwet: s.Pwwet, line: Math.min(40, s.Pwwet / 3) });
      step('w', wOk, { Pwdry: s.Pwdry, Pswet: s.Pswet, line: s.Pswet / 10 });
      let L3;
      if (step('a', s.Thot >= 22, { Thot: s.Thot })) L3 = 'a';
      else if (step('b', s.Tmon10 >= 4, { Tmon10: s.Tmon10 })) L3 = 'b';
      else if (G === 'D' && step('d', s.Tcold <= -38, { Tcold: s.Tcold })) L3 = 'd';
      else L3 = 'c';
      code = G + L2 + L3;
    }
    return { code: code, group: code[0], s: s, steps: steps };
  }

  /** 類型名稱與標準配色（Beck 等 2018 的配色） */
  const TYPES = {
    Af: ['熱帶雨林氣候', 'Tropical rainforest', '#0000ff'],
    Am: ['熱帶季風氣候', 'Tropical monsoon', '#0078ff'],
    Aw: ['熱帶莽原氣候', 'Tropical savanna', '#46aafa'],
    BWh: ['熱沙漠氣候', 'Hot desert', '#ff0000'],
    BWk: ['冷沙漠氣候', 'Cold desert', '#ff9696'],
    BSh: ['熱草原氣候（半乾燥）', 'Hot semi-arid (steppe)', '#f5a500'],
    BSk: ['冷草原氣候（半乾燥）', 'Cold semi-arid (steppe)', '#ffdc64'],
    Csa: ['地中海型氣候（夏熱）', 'Mediterranean, hot summer', '#ffff00'],
    Csb: ['地中海型氣候（夏暖）', 'Mediterranean, warm summer', '#c8c800'],
    Csc: ['地中海型氣候（夏涼）', 'Mediterranean, cool summer', '#969600'],
    Cwa: ['冬乾溫暖氣候（夏熱）', 'Dry-winter humid subtropical', '#96ff96'],
    Cwb: ['冬乾溫暖氣候（夏暖，多在高地）', 'Dry-winter subtropical highland', '#64c864'],
    Cwc: ['冬乾溫暖氣候（夏涼）', 'Dry-winter, cool summer', '#329632'],
    Cfa: ['溼潤副熱帶氣候', 'Humid subtropical', '#c8ff50'],
    Cfb: ['溫帶海洋性氣候', 'Oceanic', '#64ff50'],
    Cfc: ['副極地海洋性氣候', 'Subpolar oceanic', '#32c800'],
    Dsa: ['夏乾大陸性氣候（夏熱）', 'Dry-summer continental, hot summer', '#ff00ff'],
    Dsb: ['夏乾大陸性氣候（夏暖）', 'Dry-summer continental, warm summer', '#c800c8'],
    Dsc: ['夏乾副極地氣候', 'Dry-summer subarctic', '#963296'],
    Dsd: ['夏乾副極地氣候（冬季極寒）', 'Dry-summer subarctic, severe winter', '#966496'],
    Dwa: ['冬乾大陸性氣候（夏熱）', 'Dry-winter continental, hot summer', '#aaafff'],
    Dwb: ['冬乾大陸性氣候（夏暖）', 'Dry-winter continental, warm summer', '#5a78dc'],
    Dwc: ['冬乾副極地氣候', 'Dry-winter subarctic', '#4b50b4'],
    Dwd: ['冬乾副極地氣候（冬季極寒）', 'Dry-winter subarctic, severe winter', '#320087'],
    Dfa: ['溼潤大陸性氣候（夏熱）', 'Humid continental, hot summer', '#00ffff'],
    Dfb: ['溼潤大陸性氣候（夏暖）', 'Humid continental, warm summer', '#37c8ff'],
    Dfc: ['副極地氣候', 'Subarctic', '#007d7d'],
    Dfd: ['副極地氣候（冬季極寒）', 'Subarctic, severe winter', '#00465f'],
    ET: ['苔原氣候', 'Tundra', '#b2b2b2'],
    EF: ['冰原氣候', 'Ice cap', '#666666']
  };
  const GROUPS = {
    A: ['熱帶氣候', 'Tropical'], B: ['乾燥氣候', 'Arid'], C: ['溫帶氣候', 'Temperate'], D: ['冷溫帶（大陸性）氣候', 'Continental'], E: ['極地氣候', 'Polar']
  };

  // ---------- 測站（id、中文、英文、區域、緯度、經度、海拔 m、資料來源、統計期間、月均溫、月降水） ----------
  // 區域：tw 臺灣、as 亞洲、eu 歐洲、af 非洲、na 北美洲、sa 南美洲、oc 大洋洲。how = 'tmm'：該站沒有月均溫，以（月均最高 + 月均最低）÷ 2 代替。
  const STATIONS = [
    { id: 'taipei', zh: '臺北', en: 'Taipei', reg: 'tw', lat: 25, lon: 121.5, elev: 6, src: 'cwa', per: '1991–2020',
      T: [16.4, 16.9, 18.8, 22.3, 25.6, 28.2, 29.9, 29.5, 27.7, 24.6, 21.9, 18.2],
      P: [90.5, 143.2, 157.2, 152.5, 239.9, 345, 226.1, 337.8, 315.2, 150.2, 83.2, 88.7] },
    { id: 'keelung', zh: '基隆', en: 'Keelung', reg: 'tw', lat: 25.1, lon: 121.7, elev: 27, src: 'cwa', per: '1991–2020',
      T: [16.1, 16.4, 18.1, 21.6, 24.8, 27.6, 29.5, 29.1, 27.2, 24.2, 21.5, 18],
      P: [327.8, 349.8, 274.4, 211.1, 284.1, 290.4, 119.5, 211.4, 390.1, 377.6, 396.9, 356.6] },
    { id: 'tamsui', zh: '淡水', en: 'Tamsui', reg: 'tw', lat: 25.2, lon: 121.5, elev: 19, src: 'cwa', per: '1991–2020',
      T: [15.4, 15.7, 17.7, 21.4, 24.7, 27.3, 29, 28.7, 26.9, 23.6, 21, 17.3],
      P: [105.9, 148, 153.4, 157.6, 239.8, 257.4, 119.8, 218.3, 290.1, 165.8, 104.2, 112.4] },
    { id: 'anbu', zh: '鞍部', en: 'Anbu', reg: 'tw', lat: 25.2, lon: 121.5, elev: 838, src: 'cwa', per: '1991–2020',
      T: [10.3, 11.2, 13.2, 16.6, 19.6, 22.2, 23.4, 23, 21.1, 17.9, 15.4, 11.8],
      P: [296.7, 291.3, 246.7, 222.3, 334, 341.1, 230.9, 400.8, 724.6, 683.6, 502.5, 422.6] },
    { id: 'zhuzihu', zh: '竹子湖', en: 'Zhuzihu', reg: 'tw', lat: 25.2, lon: 121.5, elev: 607, src: 'cwa', per: '1991–2020',
      T: [12, 12.8, 14.8, 18.2, 21.3, 23.7, 25, 24.7, 22.9, 19.8, 17.2, 13.5],
      P: [220, 233.1, 193.1, 176.5, 279, 310.6, 215.7, 414.4, 662.8, 649.7, 430.6, 358.2] },
    { id: 'pengjia', zh: '彭佳嶼', en: 'Pengjia Islet', reg: 'tw', lat: 25.6, lon: 122.1, elev: 102, src: 'cwa', per: '1991–2020',
      T: [15.8, 16.2, 17.7, 20.7, 23.6, 26.3, 28.1, 28, 26.4, 23.8, 21.1, 17.6],
      P: [115.9, 122.2, 134.9, 130, 193.8, 190.9, 109.6, 185.9, 196.7, 124.5, 121.9, 127] },
    { id: 'hsinchu', zh: '新竹', en: 'Hsinchu', reg: 'tw', lat: 24.8, lon: 121, elev: 27, src: 'cwa', per: '1992–2020',
      T: [15.7, 16, 18, 21.9, 25.2, 27.9, 29.3, 28.9, 27.3, 24.4, 21.5, 17.7],
      P: [76.5, 121, 157.8, 162.6, 245.4, 253.6, 120.2, 197.1, 174.5, 53.6, 51.1, 57.7] },
    { id: 'taichung', zh: '臺中', en: 'Taichung', reg: 'tw', lat: 24.1, lon: 120.7, elev: 84, src: 'cwa', per: '1991–2020',
      T: [17, 17.7, 20.1, 23.5, 26.4, 28.1, 28.9, 28.4, 27.8, 25.5, 22.6, 18.7],
      P: [36.6, 63, 86.9, 126.8, 249.6, 329, 303.3, 340.8, 147.5, 25, 23.8, 30.5] },
    { id: 'chiayi', zh: '嘉義', en: 'Chiayi', reg: 'tw', lat: 23.5, lon: 120.4, elev: 27, src: 'cwa', per: '1991–2020',
      T: [16.8, 17.7, 20.2, 23.5, 26.3, 28.3, 28.9, 28.4, 27.4, 24.8, 22, 18.4],
      P: [27.5, 44.9, 53, 86.6, 170, 318.7, 387.4, 443.9, 212.3, 30.2, 21.5, 25.8] },
    { id: 'tainan', zh: '臺南', en: 'Tainan', reg: 'tw', lat: 23, lon: 120.2, elev: 41, src: 'cwa', per: '1991–2020',
      T: [17.9, 18.9, 21.6, 24.9, 27.4, 28.8, 29.3, 28.9, 28.5, 26.3, 23.4, 19.6],
      P: [20.7, 21.6, 30.4, 69.8, 165.6, 370.5, 374.6, 466.1, 170.5, 30.8, 23.8, 16.2] },
    { id: 'kaohsiung', zh: '高雄', en: 'Kaohsiung', reg: 'tw', lat: 22.6, lon: 120.3, elev: 2, src: 'cwa', per: '1991–2020',
      T: [19.7, 20.7, 23, 25.7, 27.8, 28.9, 29.4, 28.9, 28.5, 26.9, 24.5, 21.2],
      P: [19.1, 17.7, 32.3, 68.4, 202.2, 416.2, 377.2, 512.4, 224.5, 53.4, 25.6, 19.2] },
    { id: 'hengchun', zh: '恆春', en: 'Hengchun', reg: 'tw', lat: 22, lon: 120.8, elev: 22, src: 'cwa', per: '1991–2020',
      T: [21.1, 21.7, 23.3, 25.4, 27.3, 28.4, 28.7, 28.3, 27.8, 26.5, 24.7, 22.2],
      P: [21.8, 23.2, 16, 35.2, 146.6, 350.7, 391.3, 533.4, 320.3, 125.3, 58.3, 29] },
    { id: 'yilan', zh: '宜蘭', en: 'Yilan', reg: 'tw', lat: 24.8, lon: 121.8, elev: 7, src: 'cwa', per: '1991–2020',
      T: [16.6, 17.1, 19, 21.9, 24.7, 27.3, 28.9, 28.6, 26.8, 23.8, 21.1, 17.9],
      P: [155.2, 147, 115.3, 125.5, 222.5, 189.6, 140.3, 243.4, 409.6, 428.1, 335.8, 232.2] },
    { id: 'hualien', zh: '花蓮', en: 'Hualien', reg: 'tw', lat: 24, lon: 121.6, elev: 16, src: 'cwa', per: '1991–2020',
      T: [18.3, 18.7, 20.3, 22.8, 25.3, 27.5, 28.7, 28.4, 27, 24.9, 22.5, 19.7],
      P: [57.6, 74.7, 76.7, 76.6, 186.9, 165.5, 198.5, 258.8, 329.9, 350.6, 175.1, 83.6] },
    { id: 'chenggong', zh: '成功', en: 'Chenggong', reg: 'tw', lat: 23.1, lon: 121.4, elev: 34, src: 'cwa', per: '1991–2020',
      T: [19, 19.4, 20.9, 23.2, 25.4, 27.3, 28.1, 27.9, 27, 25.2, 22.9, 20.2],
      P: [67.3, 70.1, 70.1, 88.3, 159.8, 170.8, 245.5, 342.2, 329.3, 283.1, 153.3, 87.2] },
    { id: 'taitung', zh: '臺東', en: 'Taitung', reg: 'tw', lat: 22.8, lon: 121.2, elev: 9, src: 'cwa', per: '1991–2020',
      T: [19.7, 20.2, 21.8, 24.1, 26.4, 28.3, 29.1, 28.8, 27.7, 25.8, 23.6, 20.8],
      P: [33.1, 40.7, 36.5, 64.8, 138.3, 201.9, 250.2, 316.4, 295.6, 215, 99.3, 45.8] },
    { id: 'dawu', zh: '大武', en: 'Dawu', reg: 'tw', lat: 22.4, lon: 120.9, elev: 8, src: 'cwa', per: '1991–2020',
      T: [20.5, 21, 22.5, 24.7, 26.6, 28.3, 28.7, 28.2, 27.4, 26, 24.2, 21.6],
      P: [42.5, 44.3, 42.8, 72.4, 174.7, 367.6, 388.1, 458.2, 391.4, 203.3, 92.9, 46.4] },
    { id: 'lanyu', zh: '蘭嶼', en: 'Lanyu (Orchid Island)', reg: 'tw', lat: 22, lon: 121.6, elev: 324, src: 'cwa', per: '1991–2020',
      T: [18.6, 19, 20.4, 22.3, 24.3, 25.9, 26.2, 26, 25.3, 23.7, 21.9, 19.5],
      P: [249.9, 190.7, 135.2, 142.9, 247.2, 245.8, 252, 328.8, 361.1, 299, 282.6, 243.5] },
    { id: 'penghu', zh: '澎湖', en: 'Penghu', reg: 'tw', lat: 23.6, lon: 119.6, elev: 11, src: 'cwa', per: '1991–2020',
      T: [17.1, 17.4, 19.9, 23.2, 25.9, 27.9, 28.9, 28.6, 28, 25.5, 22.7, 19.1],
      P: [20.9, 38.1, 50.7, 77.9, 117.8, 148, 163.2, 229.4, 100.3, 30.1, 26, 28.1] },
    { id: 'dongji', zh: '東吉島', en: 'Dongji Island', reg: 'tw', lat: 23.3, lon: 119.7, elev: 43, src: 'cwa', per: '1991–2020',
      T: [18.1, 18.5, 20.7, 23.6, 26, 27.8, 28.7, 28.4, 27.6, 25.5, 23.1, 19.9],
      P: [21.8, 28.9, 38.4, 70.8, 117.3, 183.9, 189.9, 243.3, 108.3, 35.6, 32.9, 26.1] },
    { id: 'sunmoonlake', zh: '日月潭', en: 'Sun Moon Lake', reg: 'tw', lat: 23.9, lon: 120.9, elev: 1018, src: 'cwa', per: '1991–2020',
      T: [14.4, 15.2, 16.9, 19.2, 21.1, 22.3, 22.9, 22.7, 22.2, 20.6, 18.6, 15.6],
      P: [56.7, 72, 103.1, 174.6, 354.6, 441.6, 394.5, 422.9, 192.1, 50.3, 38.4, 42.2] },
    { id: 'alishan', zh: '阿里山', en: 'Alishan', reg: 'tw', lat: 23.5, lon: 120.8, elev: 2413, src: 'cwa', per: '1991–2020',
      T: [6.5, 7.3, 9.5, 11.5, 13.1, 14.4, 14.7, 14.6, 14, 12.4, 10.7, 8],
      P: [86.8, 109.9, 146.6, 223.9, 510.5, 674.7, 694.7, 813.1, 402.7, 141.2, 66.9, 69.7] },
    { id: 'yushan', zh: '玉山', en: 'Yushan', reg: 'tw', lat: 23.5, lon: 121, elev: 3845, src: 'cwa', per: '1991–2020',
      T: [-0.5, -0.2, 1.4, 3.6, 6, 7.4, 8, 7.8, 7.4, 6.6, 4.1, 1.2],
      P: [83.7, 67.2, 94.8, 201.2, 423.6, 459.6, 434.2, 516, 297.2, 145.1, 98.3, 81.6] },
    { id: 'singapore', zh: '新加坡（樟宜）', en: 'Singapore (Changi)', reg: 'as', lat: 1.4, lon: 104, elev: 14, src: 'wmo', per: '1991–2020',
      T: [26.8, 27.3, 27.8, 28.2, 28.6, 28.5, 28.2, 28.1, 28, 27.9, 27.2, 26.8],
      P: [221.6, 105, 151.1, 163.8, 163.8, 137.1, 144.8, 148.9, 124.6, 166.4, 254.1, 332.1] },
    { id: 'hongkong', zh: '香港', en: 'Hong Kong', reg: 'as', lat: 22.3, lon: 114.2, elev: 32, src: 'wmo', per: '1991–2020',
      T: [16.5, 17.1, 19.5, 23, 26.3, 28.3, 28.9, 28.7, 27.9, 25.7, 22.2, 18.2],
      P: [33.2, 38.9, 75.3, 153, 290.6, 491.5, 385.8, 453.2, 321.4, 120.3, 39.3, 28.8] },
    { id: 'shanghai', zh: '上海', en: 'Shanghai', reg: 'as', lat: 31.4, lon: 121.5, elev: 9, src: 'wmo', per: '1991–2020',
      T: [4.9, 6.5, 10.3, 15.7, 20.9, 24.4, 28.8, 28.5, 24.7, 19.7, 13.9, 7.5],
      P: [69.8, 64, 86.5, 77.1, 90.2, 196.7, 146.9, 210.1, 116.5, 71.4, 57.5, 49.3] },
    { id: 'beijing', zh: '北京', en: 'Beijing', reg: 'as', lat: 39.9, lon: 116.3, elev: 32, src: 'wmo', per: '1991–2020',
      T: [-2.7, 0.6, 7.5, 15.1, 21.3, 25.3, 27.2, 26.1, 21.2, 13.8, 5.2, -1],
      P: [2.2, 5.8, 8.6, 21.7, 36.1, 72.4, 169.7, 113.4, 53.7, 28.7, 13.5, 2.2] },
    { id: 'seoul', zh: '首爾', en: 'Seoul', reg: 'as', lat: 37.6, lon: 127, elev: 85, src: 'wmo', per: '1991–2020',
      T: [-2, 0.7, 6.1, 12.6, 18.3, 22.7, 25.3, 26.1, 21.7, 15, 7.5, 0.2],
      P: [16.8, 28.2, 36.9, 72.9, 103.6, 129.5, 414.4, 348.2, 141.5, 52.2, 51.1, 22.6] },
    { id: 'tokyo', zh: '東京', en: 'Tokyo', reg: 'as', lat: 35.7, lon: 139.8, elev: 25, src: 'wmo', per: '1991–2020',
      T: [5.4, 6.1, 9.4, 14.3, 18.8, 21.9, 25.7, 26.9, 23.3, 18, 12.5, 7.7],
      P: [59.7, 56.5, 116, 133.7, 139.7, 167.8, 156.2, 154.7, 224.9, 234.8, 96.3, 57.9] },
    { id: 'bangkok', zh: '曼谷', en: 'Bangkok', reg: 'as', lat: 13.7, lon: 100.6, elev: 3, src: 'wmo', per: '1991–2020',
      T: [27.4, 28.6, 29.7, 30.7, 30.3, 29.7, 29.2, 29, 28.6, 28.4, 28.4, 27.3],
      P: [23.6, 21.4, 51, 93.3, 216.8, 198.5, 189.7, 227.1, 335.9, 288.7, 44.6, 11.6] },
    { id: 'mumbai', zh: '孟買', en: 'Mumbai', reg: 'as', lat: 19.1, lon: 72.8, elev: 14, src: 'wmo', per: '1991–2020', how: 'tmm',
      T: [24, 24.9, 27.1, 28.8, 30.4, 29.6, 27.9, 27.7, 27.9, 28.8, 27.8, 25.5],
      P: [0.2, 0.2, 0.1, 0.1, 7.3, 526.3, 919.9, 560.8, 383.5, 91.3, 11, 1.6] },
    { id: 'newdelhi', zh: '新德里', en: 'New Delhi', reg: 'as', lat: 28.6, lon: 77.2, elev: 211, src: 'wmo', per: '1991–2020', how: 'tmm',
      T: [13.8, 17.4, 22.8, 28.9, 32.9, 33.4, 31.6, 30.5, 29.6, 26.2, 20.7, 15.6],
      P: [19.2, 21.5, 19.1, 12.5, 29.4, 80.6, 195.8, 226.8, 128, 14.1, 4.1, 8] },
    { id: 'lhasa', zh: '拉薩', en: 'Lhasa', reg: 'as', lat: 29.7, lon: 91.1, elev: 3650, src: 'wmo', per: '1991–2020',
      T: [-0.3, 2.7, 6.1, 9.2, 13.2, 16.7, 16.5, 15.8, 14.2, 9.8, 4.1, 0.3],
      P: [0.9, 1.9, 3.5, 8.3, 31.1, 84, 140.5, 129.8, 64.8, 6.5, 0.9, 0.7] },
    { id: 'ulaanbaatar', zh: '烏蘭巴托', en: 'Ulaanbaatar', reg: 'as', lat: 47.9, lon: 106.8, elev: 1303, src: 'wmo', per: '1991–2020',
      T: [-21.3, -16.2, -6.7, 3, 10.3, 16.6, 19, 16.6, 10, 0.9, -10.6, -19],
      P: [2.1, 2.8, 4.6, 8.4, 21.7, 47.2, 74.5, 65.4, 27.9, 8.6, 6.3, 3.5] },
    { id: 'riyadh', zh: '利雅德', en: 'Riyadh', reg: 'as', lat: 24.7, lon: 46.7, elev: 620, src: 'wmo', per: '1991–2020',
      T: [14.6, 17.5, 21.5, 27.2, 33, 36, 36.8, 36.9, 33.7, 28.5, 21.4, 16.4],
      P: [15.4, 6.1, 21.1, 24.3, 5.4, 0, 0, 0.5, 0, 1, 11.4, 14.7] },
    { id: 'tehran', zh: '德黑蘭', en: 'Tehran', reg: 'as', lat: 35.7, lon: 51.3, elev: 1191, src: 'wmo', per: '1991–2020',
      T: [4.7, 7, 11.8, 17.6, 23.2, 28.8, 31.4, 30.5, 26.3, 19.6, 11.6, 6.5],
      P: [31.7, 32.9, 42.5, 34.8, 14, 2.3, 2.3, 1.4, 0.9, 13.6, 30.9, 31.8] },
    { id: 'moscow', zh: '莫斯科', en: 'Moscow', reg: 'eu', lat: 55.8, lon: 37.6, elev: 147, src: 'wmo', per: '1991–2020',
      T: [-6.2, -5.9, -0.7, 6.9, 13.6, 17.3, 19.7, 17.6, 11.9, 5.8, -0.5, -4.4],
      P: [53, 43.9, 38.9, 36.6, 61.2, 77.1, 83.8, 78.2, 66.1, 70, 52, 50.9] },
    { id: 'yakutsk', zh: '雅庫次克', en: 'Yakutsk', reg: 'as', lat: 62, lon: 129.7, elev: 98, src: 'wmo', per: '1991–2020',
      T: [-36.9, -32.9, -19.1, -3.7, 8, 17, 19.9, 15.6, 6.4, -6.9, -25.9, -37],
      P: [9.7, 8.5, 6.3, 7.9, 20.1, 29.5, 40.1, 37.1, 29.6, 18.6, 16.9, 8.5] },
    { id: 'verkhoyansk', zh: '維科揚斯克', en: 'Verkhoyansk', reg: 'as', lat: 67.5, lon: 133.4, elev: 136, src: 'wmo', per: '1991–2020',
      T: [-44.7, -42.2, -28.8, -10.8, 4.2, 14.2, 16.7, 12.1, 2.7, -13.6, -33.7, -43.4],
      P: [5.9, 5.3, 4.6, 4, 15.7, 30.1, 34.7, 29.4, 22.1, 12.8, 11.1, 6.1] },
    { id: 'oymyakon', zh: '奧伊米亞康', en: 'Oymyakon', reg: 'as', lat: 63.2, lon: 143.2, elev: 740, src: 'wmo', per: '1991–2020',
      T: [-45.7, -42.2, -30.2, -12.7, 3.6, 12.7, 15.3, 10.8, 2.5, -13.8, -34.4, -44.9],
      P: [6.3, 6.7, 5.3, 5.4, 15, 38.5, 46.5, 39.2, 24.5, 13.4, 12.6, 7.1] },
    { id: 'london', zh: '倫敦', en: 'London', reg: 'eu', lat: 51.5, lon: -0.5, elev: 25, src: 'wmo', per: '1991–2020',
      T: [5.6, 5.8, 7.9, 10.5, 13.7, 16.8, 19, 18.7, 15.9, 12.3, 8.4, 5.9],
      P: [58.8, 45, 38.8, 42.3, 45.9, 47.2, 45.8, 52.8, 49.6, 65.1, 66.6, 57] },
    { id: 'paris', zh: '巴黎', en: 'Paris', reg: 'eu', lat: 48.8, lon: 2.3, elev: 75, src: 'wmo', per: '1991–2020',
      T: [5.4, 6, 9.2, 12.2, 15.6, 18.8, 20.9, 20.8, 17.2, 13.2, 8.7, 5.9],
      P: [47.6, 41.8, 45.2, 45.8, 69, 51.3, 59.4, 58, 44.7, 55.2, 54.3, 62] },
    { id: 'rome', zh: '羅馬', en: 'Rome', reg: 'eu', lat: 41.8, lon: 12.2, elev: 5, src: 'wmo', per: '1991–2020',
      T: [8.5, 9, 11.2, 13.8, 17.8, 21.8, 24.4, 24.7, 21.2, 17.4, 13.1, 9.4],
      P: [53.8, 57.9, 51.5, 46.7, 37.1, 18.7, 12.3, 23.3, 59.8, 90, 98.9, 72.6] },
    { id: 'madrid', zh: '馬德里', en: 'Madrid', reg: 'eu', lat: 40.5, lon: -3.6, elev: 609, src: 'wmo', per: '1991–2020',
      T: [6, 7.4, 10.6, 13, 17.1, 22.4, 25.7, 25.3, 20.7, 15.3, 9.7, 6.6],
      P: [28.1, 29.5, 32.5, 39.1, 40.8, 20.3, 9.1, 10, 25.4, 57.3, 47.3, 34.3] },
    { id: 'reykjavik', zh: '雷克雅維克', en: 'Reykjavík', reg: 'eu', lat: 64.1, lon: -21.9, elev: 52, src: 'wmo', per: '1991–2020',
      T: [0.7, 0.5, 1.2, 3.7, 6.7, 9.8, 11.6, 11, 8.5, 4.9, 2.2, 0.8],
      P: [87.1, 90.6, 80.7, 59, 52.6, 43.3, 49.9, 64.5, 87, 79.8, 86.5, 94.9] },
    { id: 'cairo', zh: '開羅', en: 'Cairo', reg: 'af', lat: 30.1, lon: 31.4, elev: 64, src: 'wmo', per: '1991–2020',
      T: [14.4, 15.6, 18.3, 21.8, 25.6, 28.2, 29.1, 29.2, 27.6, 24.6, 20, 15.9],
      P: [4.8, 3.8, 6.3, 1.3, 0.2, 0, 0, 0, 0, 0.7, 4.3, 3.4] },
    { id: 'aswan', zh: '亞斯文', en: 'Aswan', reg: 'af', lat: 24, lon: 32.8, elev: 192, src: 'wmo', per: '1991–2020',
      T: [16.3, 18.6, 22.9, 28, 32.2, 34.4, 35.1, 35, 32.7, 29.2, 22.7, 17.6],
      P: [0.1, 0, 0.6, 0.3, 0.1, 0, 0, 0, 0.1, 0.7, 0, 0.1] },
    { id: 'dakar', zh: '達卡（塞內加爾）', en: 'Dakar', reg: 'af', lat: 14.7, lon: -17.5, elev: 24, src: 'wmo', per: '1991–2020', how: 'tmm',
      T: [22.2, 21.6, 21.8, 22.1, 23.4, 26.1, 27.6, 27.9, 28, 28.4, 26.8, 24.4],
      P: [1.2, 0.4, 0.1, 0, 0, 7, 52.8, 165.6, 138.4, 26.3, 0.3, 0.4] },
    { id: 'bamako', zh: '巴馬科', en: 'Bamako', reg: 'af', lat: 12.5, lon: -8, elev: 380, src: 'wmo', per: '1991–2020',
      T: [24.9, 27.9, 30.6, 32.3, 31.6, 29.1, 26.8, 26.1, 26.7, 27.8, 26.7, 25.1],
      P: [2.1, 0.8, 3.7, 17.7, 70.9, 129.9, 227.4, 263.8, 175.7, 52.6, 2.2, 0] },
    { id: 'capetown', zh: '開普敦', en: 'Cape Town', reg: 'af', lat: -34, lon: 18.6, elev: 42, src: 'wmo', per: '1991–2020',
      T: [21.8, 21.9, 20.5, 17.9, 15.4, 13.2, 12.7, 13, 14.5, 16.9, 18.6, 20.7],
      P: [9.4, 9.6, 12.5, 40.1, 61.1, 92.3, 84.8, 72.4, 44.3, 28.4, 25.3, 12.8] },
    { id: 'miami', zh: '邁阿密', en: 'Miami', reg: 'na', lat: 25.8, lon: -80.3, elev: 9, src: 'wmo', per: '1991–2020',
      T: [20.3, 21.5, 22.8, 24.8, 26.7, 28.2, 28.9, 29, 28.3, 26.7, 23.8, 21.8],
      P: [46.6, 54.5, 62.5, 85.5, 160.6, 266.9, 187, 243.2, 259.6, 194.3, 89.6, 62] },
    { id: 'phoenix', zh: '鳳凰城', en: 'Phoenix', reg: 'na', lat: 33.4, lon: -112, elev: 337, src: 'wmo', per: '1991–2020',
      T: [13.8, 15.5, 19, 22.9, 27.8, 33, 35.3, 34.6, 31.8, 25.2, 18.4, 13.2],
      P: [22.1, 22.1, 21, 5.7, 3.2, 0.6, 23, 23.6, 14.6, 14.3, 14.6, 18.7] },
    { id: 'sanfrancisco', zh: '舊金山', en: 'San Francisco', reg: 'na', lat: 37.6, lon: -122.4, elev: 2, src: 'wmo', per: '1991–2020',
      T: [10.7, 11.9, 13, 14.1, 15.5, 17, 17.8, 18.3, 18.5, 17.1, 13.6, 10.8],
      P: [98.9, 100.5, 69.4, 34.6, 12.1, 3.6, 0, 1, 1.9, 20.2, 51.8, 105.1] },
    { id: 'seattle', zh: '西雅圖', en: 'Seattle', reg: 'na', lat: 47.4, lon: -122.3, elev: 113, src: 'wmo', per: '1991–2020',
      T: [6, 6.7, 8.4, 10.7, 14.2, 16.7, 19.5, 19.7, 17, 12.1, 8, 5.6],
      P: [146.7, 95.6, 105.8, 80.9, 47.7, 36.8, 15.1, 24.7, 41, 99.4, 160.4, 145.2] },
    { id: 'chicago', zh: '芝加哥', en: 'Chicago', reg: 'na', lat: 42, lon: -87.9, elev: 201, src: 'wmo', per: '1991–2020',
      T: [-3.8, -1.8, 3.9, 9.8, 15.9, 21.4, 24.1, 23.2, 19.1, 12.2, 5.1, -0.8],
      P: [50.5, 50, 62.3, 95.3, 114.1, 104.2, 94.4, 107.8, 81, 87.2, 61.4, 53.5] },
    { id: 'fairbanks', zh: '費爾班克斯', en: 'Fairbanks', reg: 'na', lat: 64.8, lon: -147.9, elev: 132, src: 'wmo', per: '1991–2020',
      T: [-22.4, -17.7, -11.8, 0.9, 10.2, 16.1, 17.2, 13.9, 7.6, -3.2, -15.5, -20.2],
      P: [15.4, 13.2, 10.1, 8.7, 13.8, 37.5, 57.5, 53.4, 34.3, 19.3, 18.8, 14.4] },
    { id: 'utqiagvik', zh: '烏特恰維克', en: 'Utqiaġvik', reg: 'na', lat: 71.3, lon: -156.8, elev: 9, src: 'wmo', per: '1991–2020',
      T: [-24.2, -24.4, -23.6, -15.5, -5.2, 2.2, 5.4, 4.3, 0.9, -6, -14.6, -21.3],
      P: [3.7, 5.4, 4.5, 4.5, 7.2, 10.9, 24.8, 27.6, 19.7, 13.8, 9.3, 5.7] },
    { id: 'nuuk', zh: '努克', en: 'Nuuk', reg: 'na', lat: 64.2, lon: -51.7, elev: 80, src: 'wmo', per: '1991–2020',
      T: [-7.7, -8.3, -7.8, -3.2, 1.1, 4.7, 7, 6.7, 3.9, 0.1, -3.3, -5.3],
      P: [72.8, 55.4, 59.2, 53, 60.5, 61.7, 75.5, 92.7, 106, 79.7, 82.6, 74.9] },
    { id: 'mexicocity', zh: '墨西哥城', en: 'Mexico City', reg: 'na', lat: 19.4, lon: -99.2, elev: 2309, src: 'wmo', per: '1991–2020',
      T: [15.1, 16.9, 18.7, 19.9, 19.9, 18.9, 17.8, 18, 17.3, 17, 16.3, 15.6],
      P: [4.8, 5.2, 9.6, 16.9, 45.9, 108.9, 133.2, 132.1, 124.4, 57.2, 14.7, 2.3] },
    { id: 'manaus', zh: '馬瑙斯', en: 'Manaus', reg: 'sa', lat: -3.1, lon: -60, elev: 61, src: 'wmo', per: '1991–2020',
      T: [26.6, 26.6, 26.6, 26.7, 27, 27.3, 27.5, 28.2, 28.6, 28.5, 28, 27.2],
      P: [305.6, 296.8, 320.9, 331, 233.3, 117.2, 67.1, 56.1, 79, 113.9, 188, 253.5] },
    { id: 'belem', zh: '貝倫', en: 'Belém', reg: 'sa', lat: -1.4, lon: -48.4, elev: 7, src: 'wmo', per: '1991–2020',
      T: [26.3, 26.1, 26.3, 26.5, 26.8, 26.9, 26.8, 27.1, 27.3, 27.3, 27.4, 27],
      P: [393.8, 437.8, 506.3, 465.5, 323.6, 205.8, 156, 128.7, 120.1, 135.8, 151.4, 283.5] },
    { id: 'antofagasta', zh: '安托法加斯塔', en: 'Antofagasta', reg: 'sa', lat: -23.4, lon: -70.4, elev: 112, src: 'wmo', per: '1991–2020',
      T: [20.2, 20.2, 19.1, 17.3, 15.7, 14.5, 13.8, 14, 14.6, 15.6, 17.1, 18.7],
      P: [0, 0, 0.8, 0.1, 0.2, 1.5, 0.4, 0.8, 0.2, 0.2, 0.1, 0.1] },
    { id: 'santiago', zh: '聖地牙哥（智利）', en: 'Santiago (Chile)', reg: 'sa', lat: -33.4, lon: -70.8, elev: 482, src: 'wmo', per: '1991–2020',
      T: [21.4, 20.7, 18.8, 15, 11.5, 8.8, 8.2, 9.7, 12.1, 14.8, 17.8, 20],
      P: [0.3, 0.9, 3.4, 13.4, 32.6, 66.5, 38.9, 34.1, 17.1, 8.4, 3.7, 2.2] },
    { id: 'buenosaires', zh: '布宜諾斯艾利斯', en: 'Buenos Aires', reg: 'sa', lat: -34.8, lon: -58.5, elev: 20, src: 'wmo', per: '1991–2020',
      T: [24.1, 23, 21, 17.1, 13.6, 10.8, 9.8, 11.8, 13.8, 16.8, 20, 22.7],
      P: [99.8, 108.5, 100.1, 100.6, 70.3, 48.4, 56.9, 59.3, 65.4, 106.6, 99.5, 99.5] },
    { id: 'darwin', zh: '達爾文', en: 'Darwin', reg: 'oc', lat: -12.4, lon: 130.9, elev: 30, src: 'wmo', per: '1991–2020',
      T: [28.5, 28.3, 28.5, 28.6, 27.3, 25.6, 25.2, 25.9, 28, 29.3, 29.6, 29.3],
      P: [470.7, 412.4, 313.7, 105.1, 20.7, 2.2, 0.9, 0.8, 14.3, 68.9, 143.5, 279.3] },
    { id: 'alicesprings', zh: '愛麗絲泉', en: 'Alice Springs', reg: 'oc', lat: -23.8, lon: 133.9, elev: 546, src: 'wmo', per: '1991–2020',
      T: [29.4, 28.2, 25.5, 21, 15.7, 12.3, 12.2, 14.5, 19.7, 23.1, 26.1, 28],
      P: [48.9, 40.7, 19.3, 19.3, 18, 10.3, 12.1, 3.8, 7.6, 18.7, 33.8, 40.1] },
    { id: 'perth', zh: '伯斯', en: 'Perth', reg: 'oc', lat: -31.9, lon: 116, elev: 15, src: 'wmo', per: '1991–2020',
      T: [24.9, 25, 23.1, 19.8, 16.4, 14.2, 13.3, 13.7, 14.8, 17.2, 20.2, 22.9],
      P: [15.8, 16.6, 17.9, 30.7, 81.4, 123.9, 139.6, 122.1, 78.9, 33.6, 28.7, 9.6] },
    { id: 'sydney', zh: '雪梨', en: 'Sydney', reg: 'oc', lat: -33.9, lon: 151.2, elev: 39, src: 'wmo', per: '1991–2020',
      T: [23.7, 23.8, 22.4, 19.7, 16.9, 14.2, 13.6, 14.7, 17.1, 19.1, 20.8, 22.5],
      P: [91.1, 131.5, 117.5, 114.1, 100.8, 143.2, 80.3, 75.1, 63.4, 67.5, 90.6, 73] }
  ];

  const STATION = {};
  STATIONS.forEach(function (s) { s.south = s.lat < 0; STATION[s.id] = s; });

  /** 頁面與任務共用的快照：st = { T, P, south, cd, base（測站 id）, edited, startJul, pins：[{ id 或 null, T, P, south }], view } */
  function snapshot(st) {
    const k = classify(st.T, st.P, st.south, { cd: st.cd });
    const alt = classify(st.T, st.P, st.south, { cd: st.cd === 0 ? -3 : 0 });
    const s = k.s, r = function (v) { return Math.round(v * 100) / 100; };
    const base = st.base ? STATION[st.base] : null;
    const baseCode = base ? classify(base.T, base.P, base.south, { cd: st.cd }).code : null;
    const pins = (st.pins || []).map(function (p) {
      const c = classify(p.T, p.P, p.south, { cd: st.cd });
      return { id: p.id || null, code: c.code, MAP: r(c.s.MAP), MAT: r(c.s.MAT) };
    });
    return {
      code: k.code, group: k.group, altCode: alt.code, cd: st.cd,
      base: st.base || null, baseCode: baseCode, edited: !!st.edited, south: !!st.south, startJul: !!st.startJul,
      MAT: r(s.MAT), MAP: r(s.MAP), Thot: r(s.Thot), Tcold: r(s.Tcold), range: r(s.range), Tmon10: s.Tmon10,
      Pdry: r(s.Pdry), Pwet: r(s.Pwet), Pth: r(s.Pth), dryLine: r(s.dryLine), desertLine: r(s.desertLine),
      dryRatio: s.dryLine > 0 ? r(s.MAP / s.dryLine) : null, season: s.season, sShare: r(s.sShare),
      hot: s.hot, cold: s.cold, dry: s.dry, wet: s.wet,
      T: st.T.map(r1), P: st.P.map(r1), pins: pins, view: st.view || 'chart'
    };
  }

  return {
    MONTH_ZH: MONTH_ZH, MONTH_EN: MONTH_EN, SUMMER_N: SUMMER_N, SUMMER_S: SUMMER_S, T_MIN: T_MIN, T_MAX: T_MAX, P_MAX: P_MAX,
    stats: stats, classify: classify, TYPES: TYPES, GROUPS: GROUPS, STATIONS: STATIONS, STATION: STATION, snapshot: snapshot
  };
});
