/* missions/quake-early-warning.js — 地震預警與盲區的任務（星星數 = 等級；隱藏任務 = 等級 × 2）
 *
 * 事件（js/quake-early-warning.js 只在使用者操作過之後才回報；載入頁面不算）：
 *   'state'：任何設定改變時；'alarm'：播放中到了發布警報的時刻；'run'：播放完一次。三種的 data 都是 {
 *      preset（真實地震的代號；改過震央、規模、深度就是 ''）, M, dM（初報規模的誤差）, Mest（初報規模）, h（km）, lon, lat, x, y（km）,
 *      spacing（測站間距 km）, n（要幾站收到 P 波）, proc（計算與發送 s）, onsite, sea（外海測站）,
 *      Ta（發布警報的時刻 s）, tFirst, TaNoSea（不算外海站時的 Ta）, rb（盲區半徑 km）, rbOn（現地型盲區半徑）,
 *      rAlert（發警報的半徑；不發是 −1；整個地圖是 Infinity）, r4、r5（真實 4 級、5 級以上的半徑）, issue（有沒有發布）, nst（測站數）,
 *      site（選定的地方）、cities（十二個城市，鍵是城市代號 TPE、HUA、KHH、TXG、TTT、HCN、ILA、CYI、HSZ、TNN、PEH、SML）：每個都是 {
 *        id, d（震央距離 km）, R（震源距離）, tP, tS, sp（S−P 時差）, pga（gal）, I（模型震度 0–5，5 是 5 級以上）, Iest（預估震度）,
 *        alerted（有沒有收到警報）, lead（區域型預警時間 s，沒收到是 null）, leadOn（現地型預警時間，沒開是 null）, best（兩者較長的）, blind } }。
 */
(function () {
  'use strict';
  if (!window.LabMission) return;

  const st = function (ev) { return ev.type === 'state' ? ev.data : null; };
  const run = function (ev) { return ev.type === 'run' ? ev.data : null; };
  const any = function (ev) { return ev.type === 'state' || ev.type === 'run' || ev.type === 'alarm' ? ev.data : null; };
  const near = function (a, b, tol) { return a != null && isFinite(a) && Math.abs(a - b) <= tol; };
  const CITY_IDS = ['TPE', 'HUA', 'KHH', 'TXG', 'TTT', 'HCN', 'ILA', 'CYI', 'HSZ', 'TNN', 'PEH', 'SML'];
  const isCity = function (id) { return CITY_IDS.indexOf(id) >= 0; };

  LabMission.register('quake-early-warning', [
    {
      id: 'quake-early-warning-1', level: 1,
      title: { zh: '波的賽跑', en: 'The race of the waves' },
      desc: { zh: '按「發生地震」，從頭看到尾：P 波、警報與 S 波，誰先到哪裡？', en: 'Press “Earthquake!” and watch to the end: which arrives where first — the P wave, the alert or the S wave?' },
      check: function (ev) { return !!run(ev); }
    },
    {
      id: 'quake-early-warning-2', level: 2,
      title: { zh: '來不及的城市', en: 'A city too close' },
      desc: { zh: '在 2024 花蓮地震裡，選一個在盲區裡的城市：它有收到警報，S 波卻比警報先到。', en: 'In the 2024 Hualien earthquake, choose a city inside the blind zone: it gets the alert, but the S wave arrives first.' },
      check: function (ev) { const d = any(ev); return !!d && d.preset === 'hualien2024' && isCity(d.site.id) && d.site.alerted && d.site.lead <= 0; }
    },
    {
      id: 'quake-early-warning-3', level: 3,
      title: { zh: '十秒的距離', en: 'Ten seconds apart' },
      desc: { zh: '找一個地方，S 波比 P 波晚 10 秒到（S − P 時差 9.9–10.1 秒）。它離震源多遠？', en: 'Find a place where the S wave comes 10 s after the P wave (S − P between 9.9 and 10.1 s). How far is it from the focus?' },
      check: function (ev) { const d = any(ev); return !!d && d.site.sp >= 9.9 && d.site.sp <= 10.1; }
    },
    {
      id: 'quake-early-warning-4', level: 3,
      title: { zh: '沒有盲區的地震', en: 'No blind zone' },
      desc: { zh: '一個規模 6 以上、會發布警報的地震，卻完全沒有盲區（盲區半徑 0）。', en: 'An earthquake of magnitude 6 or more that triggers an alert but has no blind zone at all (radius 0).' },
      check: function (ev) { const d = any(ev); return !!d && d.M >= 6 && d.issue && d.rb === 0; }
    },
    {
      id: 'quake-early-warning-5', level: 4,
      title: { zh: '更密的地震站', en: 'A denser network' },
      desc: { zh: '2024 花蓮地震不變，「要幾個站收到 P 波才發布」維持 6、「計算與發送的時間」維持 4 秒，只改「地震站的間距」，讓盲區半徑小於 25 km。', en: 'Keep the 2024 Hualien earthquake, keep “Stations needed before the alert” at 6 and “Computing and sending time” at 4 s, and change only the “Station spacing” to bring the blind zone below 25 km.' },
      check: function (ev) { const d = any(ev); return !!d && d.preset === 'hualien2024' && d.n === 6 && near(d.proc, 4, 1e-9) && !d.sea && d.rb > 0 && d.rb < 25; }
    },
    {
      id: 'quake-early-warning-6', level: 4,
      title: { zh: '自己的耳朵', en: 'Your own ears' },
      desc: { zh: '打開現地型預警，找一個地方：區域型的警報來不及（在盲區裡），現地型卻能提早收到。', en: 'Turn on the on-site warning and find a place where the regional alert is too late (blind zone) but the on-site one still comes first.' },
      check: function (ev) { const d = any(ev); return !!d && d.onsite && d.site.alerted && d.site.lead <= 0 && d.site.leadOn > 0; }
    },
    {
      id: 'quake-early-warning-7', level: 5,
      title: { zh: '低估的初報', en: 'An underestimate' },
      desc: { zh: '在 2024 花蓮地震裡把初報規模調低，找一個實際搖到 4 級以上、卻沒有收到警報的城市（那一天真的發生過）。', en: 'In the 2024 Hualien earthquake, make the first magnitude estimate too low and find a city that really shakes at intensity 4 or more but gets no alert (this really happened that day).' },
      check: function (ev) { const d = any(ev); return !!d && d.preset === 'hualien2024' && d.dM < 0 && d.issue && isCity(d.site.id) && d.site.I >= 4 && !d.site.alerted; }
    },
    {
      id: 'quake-early-warning-8', level: 5,
      title: { zh: '海底的哨兵', en: 'Sentinels on the seafloor' },
      desc: { zh: '打開外海地震站，讓警報比沒有外海站時提早至少 3 秒。地震要發生在哪裡？', en: 'Turn on the offshore stations and make the alert at least 3 s earlier than without them. Where must the earthquake be?' },
      check: function (ev) { const d = any(ev); return !!d && d.sea && d.issue && d.TaNoSea - d.Ta >= 3; }
    },
    {
      id: 'quake-early-warning-9', level: 4,
      title: { zh: '三十公里的盲區', en: 'A 30 km blind zone' },
      desc: { zh: '調整預警系統或地震，讓盲區半徑剛好 30 km（29.5–30.5 km）。', en: 'Adjust the system or the earthquake so that the blind zone is exactly 30 km (29.5–30.5 km).' },
      check: function (ev) { const d = any(ev); return !!d && d.issue && d.rb >= 29.5 && d.rb <= 30.5; }
    },
    {
      id: 'quake-early-warning-10', level: 6,
      title: { zh: '整整一分鐘', en: 'A whole minute' },
      desc: { zh: '規模不超過 7.5 的地震：讓選定的地方搖到 4 級以上，卻有至少 60 秒的預警時間。', en: 'With a magnitude of 7.5 or less, make the chosen place shake at intensity 4 or more, yet have at least 60 s of warning.' },
      check: function (ev) { const d = any(ev); return !!d && d.M <= 7.5 && d.site.alerted && d.site.I >= 4 && d.site.best >= 60; }
    },
    {
      id: 'quake-early-warning-11', level: 7,
      title: { zh: '救回臺中', en: 'Saving Taichung' },
      desc: { zh: '1999 集集地震不變，選臺中。只改預警系統（至少要 4 站、計算至少 2 秒，不用現地型），讓臺中的區域型預警時間至少 5 秒。', en: 'Keep the 1999 Chi-Chi earthquake and choose Taichung. Change only the system (at least 4 stations and 2 s of computing, no on-site warning) to give Taichung at least 5 s of regional warning.' },
      check: function (ev) { const d = any(ev); return !!d && d.preset === 'chichi1999' && d.dM === 0 && d.n >= 4 && d.proc >= 2 && d.site.id === 'TXG' && d.site.lead >= 5; }
    },
    {
      id: 'quake-early-warning-12', level: 8,
      title: { zh: '沒有人措手不及', en: 'Nobody caught off guard' },
      desc: { zh: '規模 7 以上、深度 20 km 以內、初報準確的地震：至少 6 個城市搖到 4 級以上，而且每一個搖到 4 級以上的城市都提早收到警報。', en: 'A magnitude 7+ earthquake no deeper than 20 km, with an accurate first estimate: at least 6 cities shake at intensity 4 or more, and every one of them is warned in advance.' },
      check: function (ev) {
        const d = any(ev); if (!d || d.M < 7 || d.h > 20 || d.dM !== 0) return false;
        const hit = CITY_IDS.filter(function (k) { return d.cities[k].I >= 4; });
        return hit.length >= 6 && hit.every(function (k) { return d.cities[k].best > 0; });
      }
    },
    // ---------- 隱藏任務 ----------
    {
      id: 'quake-early-warning-h1', level: 3, hidden: true,
      title: { zh: '比 P 波還快', en: 'Faster than the P wave' },
      riddle: { zh: '大地還沒有一點動靜，消息已經先到了好一陣子。', en: 'The ground has not stirred at all, yet the news arrived a good while ago.' },
      desc: { zh: '規模不超過 7.5 的地震，選定的地方收到警報後，還要再等至少 30 秒，P 波才到：無線電比任何地震波都快得多。', en: 'With a magnitude of 7.5 or less, the chosen place gets the alert at least 30 s before even the P wave: radio is far faster than any seismic wave.' },
      check: function (ev) { const d = any(ev); return !!d && d.M <= 7.5 && d.site.alerted && d.site.tP - d.Ta >= 30; }
    },
    {
      id: 'quake-early-warning-h2', level: 4, hidden: true,
      title: { zh: '盲區的邊上', en: 'On the edge of the blind zone' },
      riddle: { zh: '警告與搖晃，同時敲門。', en: 'The warning and the shaking knock at the same moment.' },
      desc: { zh: '選定的地方收到區域型警報的時刻，和 S 波抵達只差 0.2 秒以內：正好站在盲區的邊界上。', en: 'At the chosen place the regional alert and the S wave arrive within 0.2 s of each other: right on the edge of the blind zone.' },
      check: function (ev) { const d = any(ev); return !!d && d.site.alerted && near(d.site.lead, 0, 0.2); }
    },
    {
      id: 'quake-early-warning-h3', level: 5, hidden: true,
      title: { zh: '最快的極限', en: 'The fastest possible' },
      riddle: { zh: '不等第二個人開口，也不多想一秒。', en: 'Without waiting for a second voice, without thinking a second longer.' },
      desc: { zh: '只要 1 個站收到 P 波、計算時間 0 秒，而且盲區半徑小於 10 km：區域型預警的理論極限（真實系統這樣做會常常誤報）。', en: 'One station and 0 s of computing, with a blind zone under 10 km: the theoretical limit of a regional warning (a real system doing this would raise many false alarms).' },
      check: function (ev) { const d = any(ev); return !!d && d.issue && d.n === 1 && d.proc === 0 && d.rb < 10; }
    },
    {
      id: 'quake-early-warning-h4', level: 6, hidden: true,
      title: { zh: '海峽裡的地震', en: 'A quake in the strait' },
      riddle: { zh: '浪底下的大地翻身，海中的那群島仍及時聽見了鐘聲。', en: 'The ground turned over beneath the waves, yet the islands out at sea heard the bell in time.' },
      desc: { zh: '震央在臺灣海峽（東經 120° 以西、北緯 22.8°–24.6°），澎湖搖到 4 級以上，卻提早至少 5 秒收到區域型警報：附近幾乎沒有地震站，警報要等海峽兩邊的站。', en: 'An epicentre in the Taiwan Strait (west of 120°E, between 22.8° and 24.6°N): Penghu shakes at intensity 4 or more yet gets the regional alert at least 5 s ahead — with almost no stations nearby, the alert has to wait for stations on both sides of the strait.' },
      check: function (ev) { const d = any(ev); if (!d || !(d.lon <= 120 && d.lat >= 22.8 && d.lat <= 24.6)) return false; const c = d.cities.PEH; return c.alerted && c.I >= 4 && c.lead >= 5; }
    },
    {
      id: 'quake-early-warning-h5', level: 7, hidden: true,
      title: { zh: '狼來了', en: 'Crying wolf' },
      riddle: { zh: '喊了狼來了，來的卻只是一隻小狗。', en: 'Someone cried wolf, and only a little dog turned up.' },
      desc: { zh: '初報規模高估 0.3–0.7，選定的地方提早 10 秒以上收到警報，實際卻只搖到 3 級以下：高估換來的是誤報。', en: 'The first estimate is 0.3–0.7 too high: the chosen place is warned more than 10 s ahead but really shakes at intensity 3 or less — an overestimate means false alarms.' },
      check: function (ev) { const d = any(ev); return !!d && d.dM >= 0.3 && d.dM <= 0.7 && d.site.alerted && d.site.I <= 3 && d.site.lead >= 10; }
    },
    {
      id: 'quake-early-warning-h6', level: 7, hidden: true,
      title: { zh: '兩種耳朵', en: 'Two kinds of ears' },
      riddle: { zh: '自己的耳朵和遠方的消息，在同一刻說出同一句話。', en: 'Your own ears and the news from afar say the same thing at the same instant.' },
      desc: { zh: '開現地型預警，選定的地方區域型與現地型的預警時間相差 0.2 秒以內，而且都大於 0：再遠一點，區域型就比較快。', en: 'With on-site warning on, the regional and on-site warning times at the chosen place differ by less than 0.2 s and are both positive: any farther and the regional alert wins.' },
      check: function (ev) { const d = any(ev); return !!d && d.onsite && d.site.alerted && d.site.lead > 0 && near(d.site.lead, d.site.leadOn, 0.2); }
    },
    {
      id: 'quake-early-warning-h7', level: 9, hidden: true,
      title: { zh: '湖邊的警報', en: 'An alarm by the lake' },
      riddle: { zh: '湖邊的人，在大地翻身之前就聽見了。', en: 'The people by the lake heard it before the land rolled over.' },
      desc: { zh: '1999 集集地震不變，至少 3 站、計算至少 1 秒、不用現地型，日月潭仍提早收到區域型警報。', en: 'Keep the 1999 Chi-Chi earthquake; with at least 3 stations, at least 1 s of computing and no on-site warning, Sun Moon Lake still gets the regional alert first.' },
      check: function (ev) { const d = any(ev); return !!d && d.preset === 'chichi1999' && d.dM === 0 && !d.onsite && d.n >= 3 && d.proc >= 1 && d.cities.SML.lead > 0; }
    },
    {
      id: 'quake-early-warning-h8', level: 10, hidden: true,
      title: { zh: '十二盞燈', en: 'Twelve lamps' },
      riddle: { zh: '從北到南、隔著海峽，十二盞燈都亮了，沒有一盞遲到。', en: 'From north to south and across the strait, all twelve lamps lit up — not one of them late.' },
      desc: { zh: '一場地震、一般的預警系統（至少 6 站、計算至少 4 秒），十二個城市全部收到區域型警報，而且每一個都在 S 波之前。', en: 'One earthquake and an ordinary system (at least 6 stations and 4 s of computing): all twelve cities get the regional alert, every one of them before the S wave.' },
      check: function (ev) { const d = any(ev); return !!d && d.n >= 6 && d.proc >= 4 && CITY_IDS.every(function (k) { const c = d.cities[k]; return c.alerted && c.lead > 0; }); }
    },
    {
      id: 'quake-early-warning-h9', level: 8, hidden: true,
      title: { zh: '北方的四十秒', en: 'Forty seconds in the north' },
      riddle: { zh: '北方的城，等了四十多個滴答，大地才開始晃。', en: 'The northern city waited forty-odd ticks before the ground began to shake.' },
      desc: { zh: '規模不超過 7.5 的地震，臺北搖到 4 級以上，而且提早至少 40 秒收到區域型警報。', en: 'With a magnitude of 7.5 or less, Taipei shakes at intensity 4 or more and gets the regional alert at least 40 s ahead.' },
      check: function (ev) { const d = any(ev); if (!d || d.M > 7.5) return false; const c = d.cities.TPE; return c.alerted && c.I >= 4 && c.lead >= 40; }
    },
    {
      id: 'quake-early-warning-h10', level: 6, hidden: true,
      title: { zh: '沒有人廣播的時候', en: 'When nobody broadcasts' },
      riddle: { zh: '沒有人廣播，你身邊的儀器卻先喊了。', en: 'Nobody broadcast anything, yet the instrument beside you shouted first.' },
      desc: { zh: '初報規模不到 5、沒有發布警報，選定的地方卻搖到 4 級以上，而且現地型預警提早至少 2 秒。', en: 'The first estimate is below 5 and no alert is sent, yet the chosen place shakes at intensity 4 or more and the on-site warning comes at least 2 s early.' },
      check: function (ev) { const d = any(ev); return !!d && !d.issue && d.onsite && d.site.I >= 4 && d.site.leadOn >= 2; }
    }
  ]);
})();
