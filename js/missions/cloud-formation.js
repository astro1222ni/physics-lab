/* missions/cloud-formation.js — 絕熱冷卻與雲的形成的任務（星星數 = 等級 1–10）
 *
 * 事件（js/cloud-formation.js 只在使用者操作過之後才回報；載入頁面與自動播放不算）：
 *   'state'：放開滑桿、拖曳結束、鍵盤移動、按暫停時，data 為目前的物理量：
 *            T0（迎風山腳氣溫 °C）, RH（迎風相對溼度 %）, H（山高 m）, eff（降水效率 %）, gamma（環境遞減率 °C/km）,
 *            Td0（露點 °C）, lcl（雲底＝舉升凝結高度 m，可能高過山頂）, cloud（有沒有成雲）, topT（山頂氣塊溫度 °C）,
 *            leeT（背風山腳溫度 °C）, leeRH（背風相對溼度 %）, foehn（背風比迎風暖幾度）, rain（每公斤空氣降下的水 g）,
 *            zEvap（背風坡雲消散的高度 m；等於山高表示背風坡沒有雲）, leeCloud（背風坡有雲）, lfc（自由對流高度 m 或 null）,
 *            el（雲頂 m 或 null）, cape（J/kg）, triggered（山把空氣抬過自由對流高度、長成積雨雲）, stability, view；
 *   'pass'：播放中氣塊往上穿過雲底，data = { z, T }；
 *   'cross'：播放中氣塊抵達背風山腳，data 同 'state'；
 *   'record'：按「記錄」，data = { n, a（上一筆或 null）, b（這一筆）, sameVer（兩筆之間參數沒變）, dz（高度差 m）, rate（每公里降溫 °C）, lcl }，
 *             a、b 為 { z, T（°C）, RH（%）, l（雲滴 g/kg）, branch（'up'|'top'|'down'）}；
 *   'view'、'cam'：切換 3D 與按下視角按鈕。
 */
(function () {
  'use strict';
  if (!window.LabMission) return;

  const isState = function (ev) { return ev.type === 'state' || ev.type === 'cross'; };
  const isRec = function (ev) { return ev.type === 'record' && ev.data.a && ev.data.sameVer && ev.data.rate != null; };
  const sat = function (r) { return r.RH >= 99.9; };
  const near = function (a, b, tol) { return a != null && Math.abs(a - b) <= tol; };
  // 真實的大氣：山腳沒有起霧（溼度低於 100%）、環境遞減率低於乾絕熱 9.8 °C/km（不是絕對不穩定）
  const real = function (d) { return d.RH < 100 && d.gamma < 9.8; };

  LabMission.register('cloud-formation', [
    {
      id: 'cloud-formation-1', level: 1,
      title: { zh: '雲出現了', en: 'A cloud appears' },
      desc: { zh: '先動手調一個條件（任何一個滑桿都可以），再讓風把氣塊推上山坡（播放中），看它在雲底冷到露點、長出雲來。', en: 'First change any setting yourself (any slider will do), then let the wind carry the parcel up the slope (while playing) until it cools to its dew point at the cloud base and a cloud forms.' },
      check: function (ev) { return ev.type === 'pass'; }
    },
    {
      id: 'cloud-formation-2', level: 2,
      title: { zh: '一千公尺的雲底', en: 'Cloud base at 1000 m' },
      desc: { zh: '調整氣溫與溼度，讓迎風坡的雲底剛好在 1000 m（誤差 20 m 以內），而且山比雲底高。', en: 'Adjust the temperature and humidity so the windward cloud base is at 1000 m (within 20 m), with the crest above it.' },
      check: function (ev) { return isState(ev) && ev.data.cloud && near(ev.data.lcl, 1000, 20); }
    },
    {
      id: 'cloud-formation-3', level: 3,
      title: { zh: '量乾絕熱遞減率', en: 'Measure the dry adiabatic lapse rate' },
      desc: { zh: '參數不變，在沒有雲的地方記錄兩個高度相差 1000 m 以上的點，算出每公里降溫 9.3–10.6 °C。', en: 'Without changing the settings, record two cloud-free points at least 1000 m apart in height and get a cooling of 9.3–10.6 °C per km.' },
      check: function (ev) {
        if (!isRec(ev)) return false;
        const d = ev.data;
        return d.dz >= 1000 && !sat(d.a) && !sat(d.b) && d.rate >= 9.3 && d.rate <= 10.6;
      }
    },
    {
      id: 'cloud-formation-4', level: 4,
      title: { zh: '雲裡比較慢冷', en: 'Slower cooling inside the cloud' },
      desc: { zh: '參數不變，在雲裡記錄兩個高度相差 1000 m 以上的點，量出每公里降溫比 8 °C 還少：凝結放出的潛熱在幫空氣保溫。', en: 'Without changing the settings, record two points inside the cloud at least 1000 m apart in height and get less than 8 °C of cooling per km: latent heat from condensation keeps the air warm.' },
      check: function (ev) {
        if (!isRec(ev)) return false;
        const d = ev.data;
        return d.dz >= 1000 && sat(d.a) && sat(d.b) && d.rate > 0 && d.rate < 8;
      }
    },
    {
      id: 'cloud-formation-5', level: 4,
      title: { zh: '焚風', en: 'Foehn' },
      desc: { zh: '讓背風山腳比迎風山腳暖 8 °C 以上。', en: 'Make the lee foot at least 8 °C warmer than the windward foot.' },
      check: function (ev) { return isState(ev) && ev.data.foehn >= 8; }
    },
    {
      id: 'cloud-formation-6', level: 5,
      title: { zh: '沒有雨就沒有焚風', en: 'No rain, no foehn' },
      desc: { zh: '讓山頂比雲底高 500 m 以上，但降水效率設為 0%（雲裡的水全部留在空氣裡），確認背風山腳和迎風山腳一樣溫度（差 0.05 °C 以內）。', en: 'Make the crest at least 500 m above the cloud base but set the precipitation efficiency to 0% (all cloud water stays in the air); check that the lee foot is as warm as the windward foot (within 0.05 °C).' },
      check: function (ev) {
        const d = ev.data;
        return isState(ev) && d.cloud && d.eff === 0 && d.H - d.lcl >= 500 && Math.abs(d.foehn) <= 0.05;
      }
    },
    {
      id: 'cloud-formation-7', level: 5,
      title: { zh: '雨影', en: 'Rain shadow' },
      desc: { zh: '迎風的空氣相對溼度 85% 以上，翻過山後背風山腳的相對溼度卻降到 20% 以下。', en: 'Start with air at 85% humidity or more on the windward side and bring the lee foot down to 20% or less.' },
      check: function (ev) { return isState(ev) && ev.data.RH >= 85 && ev.data.leeRH <= 20; }
    },
    {
      id: 'cloud-formation-8', level: 6,
      title: { zh: '背風坡的雲牆', en: 'The foehn wall' },
      desc: { zh: '讓背風坡留下一道貼著山脊的雲牆（背風雲底在山高的 80% 以上），而且它比迎風坡的雲底剛好高 1000 m（誤差 25 m 以內）。山腳不能起霧（溼度低於 100%），環境遞減率也要低於 9.8 °C/km。', en: 'Leave a cloud wall hugging the ridge on the lee side (lee cloud base at least 80% of the mountain height), exactly 1000 m above the windward cloud base (within 25 m). No fog at the foot (humidity below 100%), and an environmental lapse rate below 9.8 °C/km.' },
      check: function (ev) {
        const d = ev.data;
        return isState(ev) && real(d) && d.leeCloud && near(d.zEvap - d.lcl, 1000, 25) && d.zEvap >= 0.8 * d.H;
      }
    },
    {
      id: 'cloud-formation-9', level: 7,
      title: { zh: '地形雷雨', en: 'Mountain thunderstorm' },
      desc: { zh: '山腳不起霧、環境遞減率低於 9.8 °C/km。讓自由對流高度比雲底高 500 m 以上，山頂又只比它高 200 m 以內：山剛好把空氣推過去，長成雲頂 12–14 km 的積雨雲。', en: 'No fog at the foot and a lapse rate below 9.8 °C/km. Put the level of free convection at least 500 m above the cloud base, with the summit no more than 200 m above it: the mountain just barely pushes the air through, and it grows into a cumulonimbus topped at 12–14 km.' },
      check: function (ev) {
        const d = ev.data;
        return isState(ev) && real(d) && d.triggered && d.el >= 12000 && d.el <= 14000 && d.lfc - d.lcl >= 500 && d.H - d.lfc <= 200;
      }
    },
    {
      id: 'cloud-formation-10', level: 8,
      title: { zh: '小山大雷雨', en: 'Small hill, big storm' },
      desc: { zh: '山高不超過 800 m、山腳的空氣還沒飽和（雲底在 200 m 以上）、環境遞減率低於 9.8 °C/km，卻觸發雲頂 15 km 以上的積雨雲。', en: 'With a hill no higher than 800 m, unsaturated air at its foot (cloud base at 200 m or higher) and a lapse rate below 9.8 °C/km, set off a cumulonimbus topped at 15 km or more.' },
      check: function (ev) { const d = ev.data; return isState(ev) && real(d) && d.triggered && d.H <= 800 && d.lcl >= 200 && d.el >= 15000; }
    },
    {
      id: 'cloud-formation-11', level: 9,
      title: { zh: '三十五度的焚風', en: 'A 35 °C foehn' },
      desc: { zh: '迎風山腳 25.0 °C、降水效率 100%，調整溼度、山高與環境遞減率，讓背風山腳剛好 35.0 °C（誤差 0.1 °C 以內）。', en: 'With the windward foot at 25.0 °C and 100% precipitation efficiency, adjust the humidity, the mountain height and the environmental lapse rate so that the lee foot is exactly 35.0 °C (within 0.1 °C).' },
      check: function (ev) {
        const d = ev.data;
        return isState(ev) && near(d.T0, 25, 0.05) && d.eff === 100 && near(d.leeT, 35, 0.1);
      }
    },
    {
      id: 'cloud-formation-12', level: 10,
      title: { zh: '兩個雲底', en: 'Two cloud bases' },
      desc: { zh: '讓迎風坡的雲底在 500 m、背風坡的雲底在 2000 m（各自誤差 10 m 以內）。', en: 'Put the windward cloud base at 500 m and the lee cloud base at 2000 m (each within 10 m).' },
      check: function (ev) {
        const d = ev.data;
        return isState(ev) && d.leeCloud && near(d.lcl, 500, 10) && near(d.zEvap, 2000, 10);
      }
    },
    {
      id: 'cloud-formation-h1', level: 4, hidden: true,
      riddle: { zh: '最高處落下的，不是淚，是羽毛。', en: 'What falls from the highest place is not a tear but a feather.' },
      check: function (ev) { return isState(ev) && ev.data.cloud && ev.data.rain > 0 && ev.data.topT <= 0; }
    },
    {
      id: 'cloud-formation-h2', level: 6, hidden: true,
      riddle: { zh: '翻過山的風，連一滴汗都不肯留。', en: 'The wind that crossed the mountain would not keep a single drop of sweat.' },
      check: function (ev) { const d = ev.data; return isState(ev) && real(d) && d.H > 0 && d.RH >= 90 && d.leeRH <= 8; }
    },
    {
      id: 'cloud-formation-h3', level: 5, hidden: true,
      riddle: { zh: '沒有山，也有人往上爬。', en: 'No mountain, and still someone climbs.' },
      check: function (ev) { return isState(ev) && ev.data.H === 0 && ev.data.triggered; }
    }
  ]);
})();
