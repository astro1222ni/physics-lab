/* missions/typhoon.js — 颱風：氣壓、風場與危險半圓的任務（星星數 = 等級；隱藏任務 = 等級 × 2）
 *
 * 事件（js/typhoon.js 只在使用者操作過之後才回報；載入頁面不算）：
 *   'storm'：颱風設定改變時，data = {
 *      pc（中心氣壓 hPa）, Rm（最大風速半徑 km）, B（Holland 形狀參數）, lat（緯度°，南半球為負）, c（移動速度 m/s）, hd（移動方向°，0 = 北、90 = 東）,
 *      dp（環境 1010 hPa 與中心的氣壓差）, vMax（含移動效應的地面最大風速 m/s）, vSym（不含移動的地面最大風速）, vGrad（最大梯度風）,
 *      cls（'td' 熱帶性低氣壓、'mild' 輕度、'moderate' 中度、'strong' 強烈，依 vMax 四捨五入到 0.1 m/s）,
 *      r7、r10（七級風、十級風暴風半徑 km，不含移動效應）, surge（倒氣壓效應的海面升高 cm）}；
 *   'pass'：颱風走完全程（或不動時跑完 48 小時）時，data = 'storm' 的全部欄位，加上
 *      t（模擬了幾小時）, st = [測站 A, 測站 B]，每個測站 = {
 *        maxW（最大風速 m/s）, maxWt（出現時間 h）, minP（最低氣壓 hPa）, minPt, rot（離中心 300 km 內風向累計轉了幾度，正＝順轉）,
 *        closest（最接近颱風中心的距離 km）, side（在路徑右邊為正、左邊為負 km）, eye（颱風眼經過：強風→小於 5 m/s→強風）, minW（眼中最小風速）}；
 *   'chart'、'view'、'cam'：切換圖表、3D 與視角。
 * 任何設定改變或測站移動都會讓颱風回到起點、紀錄清除，所以 'pass' 一定是同一組設定從頭跑到尾的結果。
 */
(function () {
  'use strict';
  if (!window.LabMission) return;

  const St = function (ev) { return ev.type === 'storm' || ev.type === 'pass' ? ev.data : null; };
  const P = function (ev) { return ev.type === 'pass' ? ev.data : null; };
  /** 兩個測站分在路徑兩側、和路徑的距離差 ≤ 10 km（公平比較）；回傳 [右側, 左側] */
  function pair(d) {
    const a = d.st[0], b = d.st[1];
    if (!(a.side * b.side < 0) || Math.abs(Math.abs(a.side) - Math.abs(b.side)) > 10 || Math.abs(a.side) > 300) return null;
    return a.side > 0 ? [a, b] : [b, a];
  }
  const any = function (d, f) { return d.st.some(f); };

  LabMission.register('typhoon', [
    {
      id: 'typhoon-1', level: 1,
      title: { zh: '輕度颱風', en: 'A mild typhoon' },
      desc: { zh: '調整中心氣壓與其他設定，讓這個熱帶氣旋成為「輕度颱風」（最大風速 17.2–32.6 m/s）。', en: 'Adjust the central pressure and the other settings so that this tropical cyclone becomes a mild typhoon (maximum wind 17.2–32.6 m/s).' },
      check: function (ev) { const d = St(ev); return !!d && d.cls === 'mild'; }
    },
    {
      id: 'typhoon-2', level: 2,
      title: { zh: '強烈颱風', en: 'A severe typhoon' },
      desc: { zh: '把颱風增強成「強烈颱風」：最大風速 51.0 m/s 以上。', en: 'Strengthen it into a severe typhoon: maximum wind 51.0 m/s or more.' },
      check: function (ev) { const d = St(ev); return !!d && d.cls === 'strong'; }
    },
    {
      id: 'typhoon-3', level: 2,
      title: { zh: '一個順轉、一個逆轉', en: 'One veers, one backs' },
      desc: { zh: '讓颱風走完全程：同一次裡，一個測站的風向順轉（順時針）90° 以上，另一個逆轉（逆時針）90° 以上。', en: 'Let the typhoon complete its run so that, in the same run, the wind at one station veers (turns clockwise) by 90° or more and at the other backs (turns anticlockwise) by 90° or more.' },
      check: function (ev) { const d = P(ev); return !!d && any(d, function (s) { return s.rot >= 90; }) && any(d, function (s) { return s.rot <= -90; }); }
    },
    {
      id: 'typhoon-4', level: 3,
      title: { zh: '南半球也是右邊順轉', en: 'Right veers down south too' },
      desc: { zh: '把颱風搬到南緯 10° 以南，讓它走完全程：在路徑右邊的測站，風向一樣順轉 90° 以上。', en: 'Move the storm south of 10° S and let it complete its run: the station on the right of the track still sees the wind veer by 90° or more.' },
      check: function (ev) { const d = P(ev); return !!d && d.lat <= -10 && d.c > 0 && any(d, function (s) { return s.side > 0 && s.rot >= 90; }); }
    },
    {
      id: 'typhoon-5', level: 3,
      title: { zh: '巨大的暴風圈', en: 'A huge gale circle' },
      desc: { zh: '做出七級風暴風半徑 300 km 以上的颱風。', en: 'Make a typhoon whose force-7 gale radius is 300 km or more.' },
      check: function (ev) { const d = St(ev); return !!d && d.r7 >= 300; }
    },
    {
      id: 'typhoon-6', level: 4,
      title: { zh: '颱風眼經過', en: 'The eye passes over' },
      desc: { zh: '讓颱風眼正好經過一個測站：風先變強、再突然減弱到 5 m/s 以下、然後又變強。', en: 'Let the eye pass right over a station: the wind rises, suddenly drops below 5 m/s, then rises again.' },
      check: function (ev) { const d = P(ev); return !!d && any(d, function (s) { return s.eye; }); }
    },
    {
      id: 'typhoon-7', level: 5,
      title: { zh: '剛好跨過強颱門檻', en: 'Barely severe' },
      desc: { zh: '讓最大風速剛好跨過強烈颱風的門檻：51.0–51.4 m/s（顯示到小數一位）。', en: 'Put the maximum wind just over the severe-typhoon threshold: 51.0–51.4 m/s (to one decimal place).' },
      check: function (ev) { const d = St(ev); return !!d && d.cls === 'strong' && d.vMax < 51.45; }
    },
    {
      id: 'typhoon-8', level: 5,
      title: { zh: '北半球的危險半圓', en: 'The dangerous semicircle (north)' },
      desc: { zh: '在北半球，把兩個測站放在路徑兩側、離路徑一樣遠（相差 10 km 內）。颱風走完後，右側測站的最大風速要比左側大 8 m/s 以上。', en: 'In the northern hemisphere, put the two stations on opposite sides of the track at the same distance (within 10 km). After the run, the strongest wind on the right must beat the left by 8 m/s or more.' },
      check: function (ev) { const d = P(ev); if (!d || !(d.lat > 0) || !(d.c > 0)) return false; const q = pair(d); return !!q && q[0].maxW - q[1].maxW >= 8; }
    },
    {
      id: 'typhoon-9', level: 6,
      title: { zh: '小而猛', en: 'Small but fierce' },
      desc: { zh: '做出強烈颱風，但七級風暴風半徑只有 90–100 km：強而緊密。', en: 'Make a severe typhoon whose force-7 gale radius is only 90–100 km: strong but compact.' },
      check: function (ev) { const d = St(ev); return !!d && d.cls === 'strong' && d.r7 >= 90 && d.r7 <= 100; }
    },
    {
      id: 'typhoon-10', level: 6,
      title: { zh: '南半球的危險半圓', en: 'The dangerous semicircle (south)' },
      desc: { zh: '在南緯 10° 以南，兩個測站放在路徑兩側、離路徑一樣遠（相差 10 km 內）。颱風走完後，左側測站的最大風速要比右側大 8 m/s 以上。', en: 'South of 10° S, put the two stations on opposite sides of the track at the same distance (within 10 km). After the run, the strongest wind on the left must beat the right by 8 m/s or more.' },
      check: function (ev) { const d = P(ev); if (!d || !(d.lat <= -10) || !(d.c > 0)) return false; const q = pair(d); return !!q && q[1].maxW - q[0].maxW >= 8; }
    },
    {
      id: 'typhoon-11', level: 5,
      title: { zh: '氣壓計量到颱風中心', en: 'The barometer meets the centre' },
      desc: { zh: '颱風以 3 m/s 以上的速度移動，讓一個測站量到的最低氣壓，和颱風中心氣壓相差不到 0.5 hPa。', en: 'With the storm moving at 3 m/s or more, make one station record a lowest pressure within 0.5 hPa of the central pressure.' },
      check: function (ev) { const d = P(ev); return !!d && d.c >= 3 && any(d, function (s) { return s.minP - d.pc <= 0.5; }); }
    },
    {
      id: 'typhoon-12', level: 7,
      title: { zh: '17 級以上的風', en: 'Beyond force 17' },
      desc: { zh: '讓一個測站在颱風經過時量到 61.3 m/s 以上的風（蒲福 17 級以上），而且風向轉了 150° 以上。', en: 'Make one station record a wind of 61.3 m/s or more (above Beaufort force 17) as the storm passes, with the wind direction turning by 150° or more.' },
      check: function (ev) { const d = P(ev); return !!d && any(d, function (s) { return s.maxW >= 61.3 && Math.abs(s.rot) >= 150; }); }
    },
    {
      id: 'typhoon-h1', level: 4, hidden: true,
      riddle: { zh: '再低一格，就和傳說並肩。', en: 'One notch lower, and you would stand beside the legend.' },
      check: function (ev) { const d = St(ev); return !!d && Math.abs(d.pc - 870.5) < 0.05; }
    },
    {
      id: 'typhoon-h2', level: 5, hidden: true,
      riddle: { zh: '它不肯走，風就一直吹。', en: 'It will not leave, so the wind will not stop.' },
      check: function (ev) { const d = P(ev); return !!d && d.c === 0 && d.t >= 47.99 && any(d, function (s) { return s.maxW >= 13.9; }); }
    },
    {
      id: 'typhoon-h3', level: 5, hidden: true,
      riddle: { zh: '在不該有漩渦的地方，硬要它轉起來。', en: 'Where no whirl should be, make one spin anyway.' },
      check: function (ev) { const d = St(ev); return !!d && Math.abs(d.lat) < 0.5 && d.vMax >= 17.2; }
    }
  ]);
})();
