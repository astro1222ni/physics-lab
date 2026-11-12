/* missions/atmosphere-layers.js — 大氣分層、氣壓與標準大氣的任務（星星數 = 等級；隱藏任務 = 等級 × 2）
 *
 * 事件（js/atmosphere-layers.js 只在使用者操作過之後才回報；載入頁面不算）：
 *   'state'：探測點或設定改變時，data = {
 *      z（探測高度 m）, dT（整層溫度偏差 K）, T（K）, P（Pa）, rho（kg/m³）, above（頭上空氣的比例 P/P0）,
 *      boil（水的沸點 °C；低於三相點時 null）, mfp（平均自由徑 m）, c（聲速 m/s）, H（尺度高度 m）,
 *      layer（0 對流層、1 平流層、2 中氣層、3 增溫層）, lapse（溫度遞減率 K/km）, Ts（海平面溫度 K）,
 *      rhoHe0（海平面的氦氣密度 kg/m³）, ref（參考點 {z, P, T} 或 null）, range, q, log }；
 *   'launch'：放飛，data = { type（'b300'、'b600'、'b1200'、'b3000'）, D0（地面直徑 m）, dT, v0（出發時的上升速率 m/s）, lift（淨浮力 kg） }；
 *   'burst'：氣球爆破，data = { type, D0, dT, v0, zBurst（m）, Pburst（Pa）, Tburst（K）, t（飛行時間 s）,
 *      flights（全部完成的飛行 [{type, D0, dT, v0, zBurst, Pburst}]，最後一筆就是這一次） }；
 *   'view'、'cam'：切換 3D 與視角。
 */
(function () {
  'use strict';
  if (!window.LabMission) return;

  const S = function (ev) { return ev.type === 'state' ? ev.data : null; };
  const Bu = function (ev) { return ev.type === 'burst' ? ev.data : null; };
  const near = function (a, b, tol) { return a != null && isFinite(a) && Math.abs(a - b) <= tol; };
  const std = function (d) { return Math.abs(d.dT) < 1e-9; };
  const TROPO = 11019.07;           // 對流層頂的幾何高度（位勢 11 km）
  const P0 = 101325;
  /** 這次飛行之前完成的飛行 */
  const before = function (d) { return (d.flights || []).slice(0, -1); };

  LabMission.register('atmosphere-layers', [
    {
      id: 'atmosphere-layers-1', level: 1,
      title: { zh: '玉山頂的空氣', en: 'The air on top of Yushan' },
      desc: { zh: '把探測點放到玉山主峰 3952 m（誤差 20 m 內），讀讀那裡的氣壓與水的沸點。', en: 'Put the probe on the summit of Yushan, 3952 m (within 20 m), and read the pressure and the boiling point of water there.' },
      check: function (ev) { const d = S(ev); return !!d && near(d.z, 3952, 20); }
    },
    {
      id: 'atmosphere-layers-2', level: 2,
      title: { zh: '一半的空氣在腳下', en: 'Half the air below your feet' },
      desc: { zh: '在標準大氣（ΔT = 0）裡，找到頭上只剩一半空氣的高度：頭上的空氣在 49.5%–50.5% 之間。', en: 'In the standard atmosphere (ΔT = 0), find the height where only half the air is still above you: between 49.5% and 50.5%.' },
      check: function (ev) { const d = S(ev); return !!d && std(d) && d.above >= 0.495 && d.above <= 0.505; }
    },
    {
      id: 'atmosphere-layers-3', level: 2,
      title: { zh: '天氣的天花板', en: 'The ceiling of the weather' },
      desc: { zh: '往上爬，找到溫度不再往上變冷的地方：把探測點放在對流層頂（誤差 100 m 內）。', en: 'Climb until the air stops getting colder: put the probe at the tropopause (within 100 m).' },
      check: function (ev) { const d = S(ev); return !!d && near(d.z, TROPO, 100); }
    },
    {
      id: 'atmosphere-layers-4', level: 3,
      title: { zh: '第一次探空', en: 'Your first sounding' },
      desc: { zh: '放飛一顆探空氣球，讓它一路飛到爆破。', en: 'Launch a weather balloon and let it fly until it bursts.' },
      check: function (ev) { return !!Bu(ev); }
    },
    {
      id: 'atmosphere-layers-5', level: 4,
      title: { zh: '地球上最冷的空氣', en: 'The coldest air on Earth' },
      desc: { zh: '在標準大氣（ΔT = 0）裡找到最冷的地方：溫度在 −86.2 °C 以下。', en: 'In the standard atmosphere (ΔT = 0), find the coldest place: −86.2 °C or colder.' },
      check: function (ev) { const d = S(ev); return !!d && std(d) && d.T <= 186.95; }
    },
    {
      id: 'atmosphere-layers-6', level: 5,
      title: { zh: '暖空氣比較厚', en: 'Warm air is thick' },
      desc: { zh: '把整層大氣調暖，讓 500 hPa 等壓面升到 5.9 km 以上，並把探測點放在 500 hPa（±1 hPa）。', en: 'Warm the whole column so that the 500 hPa surface rises above 5.9 km, and put the probe on it (500 ± 1 hPa).' },
      check: function (ev) { const d = S(ev); return !!d && near(d.P, 50000, 100) && d.z >= 5900; }
    },
    {
      id: 'atmosphere-layers-7', level: 5,
      title: { zh: '聖母峰頂的氣壓計', en: 'A barometer on Everest' },
      desc: { zh: '1981 年的醫學考察隊在聖母峰頂量到 337 hPa，比標準大氣高。把探測點放在聖母峰頂（8849 m ± 20 m），調整整層溫度，讓氣壓落在 335–339 hPa。', en: 'In 1981 a medical expedition measured 337 hPa on the summit of Everest — more than the standard atmosphere says. Put the probe on the summit (8849 ± 20 m) and change the column temperature until the pressure is 335–339 hPa.' },
      check: function (ev) { const d = S(ev); return !!d && near(d.z, 8849, 20) && d.P >= 33500 && d.P <= 33900; }
    },
    {
      id: 'atmosphere-layers-8', level: 6,
      title: { zh: '標準的探空', en: 'A textbook sounding' },
      desc: { zh: '在標準大氣（ΔT = 0）放飛 600 g 的氣球：出發時每秒上升 4.9–5.1 m，而且在 30.5 km 以上才爆破。', en: 'In the standard atmosphere (ΔT = 0), launch a 600 g balloon that leaves the ground at 4.9–5.1 m/s and does not burst below 30.5 km.' },
      check: function (ev) { const d = Bu(ev); return !!d && d.type === 'b600' && std(d) && d.v0 >= 4.9 && d.v0 <= 5.1 && d.zBurst >= 30500; }
    },
    {
      id: 'atmosphere-layers-9', level: 7,
      title: { zh: '尺度高度', en: 'One scale height' },
      desc: { zh: '在 11–20 km 溫度不變的那一層裡，記下一個參考點，再往上找到氣壓剛好變成它的 1/e（誤差 0.3%）的高度。兩點相距多遠？', en: 'Inside the isothermal layer between 11 and 20 km, mark a reference point, then climb to where the pressure is exactly 1/e of it (within 0.3%). How far apart are they?' },
      check: function (ev) {
        const d = S(ev);
        if (!d || !d.ref) return false;
        const inIso = function (z) { return z >= 11100 && z <= 20000; };
        return inIso(d.z) && inIso(d.ref.z) && d.z > d.ref.z && Math.abs(d.P / d.ref.P * Math.E - 1) <= 0.003;
      }
    },
    {
      id: 'atmosphere-layers-10', level: 8,
      title: { zh: '四十公里', en: 'Forty kilometres' },
      desc: { zh: '在標準大氣（ΔT = 0）放飛一顆氣球，讓它在 40 km 以上才爆破。', en: 'In the standard atmosphere (ΔT = 0), launch a balloon that does not burst below 40 km.' },
      check: function (ev) { const d = Bu(ev); return !!d && std(d) && d.zBurst >= 40000; }
    },
    {
      id: 'atmosphere-layers-11', level: 9,
      title: { zh: '冷天與熱天', en: 'A cold day and a hot day' },
      desc: { zh: '同一種氣球、同樣的地面直徑，在整層溫度相差至少 30 K 的兩種大氣裡各放飛一次。哪一次飛得高？', en: 'Fly the same balloon with the same ground diameter twice, in two atmospheres whose temperatures differ by at least 30 K. Which one goes higher?' },
      check: function (ev) {
        const d = Bu(ev);
        if (!d) return false;
        return before(d).some(function (f) {
          if (f.type !== d.type || Math.abs(f.D0 - d.D0) > 0.0005 || Math.abs(f.dT - d.dT) < 30) return false;
          const warm = d.dT > f.dT ? d : f, cold = d.dT > f.dT ? f : d;
          return warm.zBurst > cold.zBurst;
        });
      }
    },
    {
      id: 'atmosphere-layers-12', level: 10,
      title: { zh: '百分之九十九', en: 'Ninety-nine per cent' },
      desc: { zh: '讓氣球剛好在頭上只剩 1% 空氣的地方爆破：爆破時的氣壓是海平面的 0.99%–1.01%。', en: 'Make the balloon burst exactly where only 1% of the air is left above it: the pressure at bursting is 0.99%–1.01% of sea level.' },
      check: function (ev) { const d = Bu(ev); return !!d && Math.abs(d.Pburst / P0 - 0.01) <= 0.0001; }
    },

    // ---------- 隱藏任務 ----------
    {
      id: 'atmosphere-layers-h1', level: 3, hidden: true,
      title: { zh: '不用火就會滾', en: 'Boiling without a flame' },
      riddle: { zh: '在這裡，你的血不必生火就會滾。', en: 'Up here your blood would boil without any fire.' },
      desc: { zh: '水的沸點是 37 °C（體溫）的高度：阿姆斯壯極限，約 19 km。再往上，人一定要穿加壓衣。', en: 'Where water boils at 37 °C, body temperature: the Armstrong limit, about 19 km. Above it a pressure suit is a must.' },
      check: function (ev) { const d = S(ev); return !!d && d.boil != null && d.boil >= 36.8 && d.boil <= 37.2; }
    },
    {
      id: 'atmosphere-layers-h2', level: 4, hidden: true,
      title: { zh: '水的最後一站', en: 'Last stop for liquid water' },
      riddle: { zh: '再往上一步，冰就可以不必先變成水。', en: 'One more step up and ice need not become water first.' },
      desc: { zh: '水的沸點降到 0.3 °C 以下、還有液態水的最高處：再上去就低於三相點 611.657 Pa（約 34.6 km），冰會直接昇華。', en: 'The highest place where water can still be liquid, boiling below 0.3 °C: just above it the pressure drops under the triple point, 611.657 Pa (about 34.6 km), and ice turns straight into vapour.' },
      check: function (ev) { const d = S(ev); return !!d && d.boil != null && d.boil <= 0.3; }
    },
    {
      id: 'atmosphere-layers-h3', level: 5, hidden: true,
      title: { zh: '流星上方的海風', en: 'Seaside air above the meteors' },
      riddle: { zh: '在比流星還高的地方，找回海邊的溫度。', en: 'Higher than the meteors, find the temperature of the seaside.' },
      desc: { zh: '90 km 以上，溫度和海平面相差 0.3 K 以內：增溫層吸收太陽的極紫外線，114 km 附近就回到 15 °C，再往上更熱。', en: 'Above 90 km, within 0.3 K of the sea-level temperature: the thermosphere absorbs the Sun’s extreme ultraviolet and is back at 15 °C near 114 km — and hotter still above.' },
      check: function (ev) { const d = S(ev); return !!d && d.z > 90000 && near(d.T, d.Ts, 0.3); }
    },
    {
      id: 'atmosphere-layers-h4', level: 6, hidden: true,
      title: { zh: '不會長大的氣球', en: 'A balloon that cannot grow' },
      riddle: { zh: '一顆不會長大的氣球，帶著海邊的氦氣，最高只能停在這裡。', en: 'A balloon that cannot grow, carrying seaside helium, can rise no higher than this.' },
      desc: { zh: '空氣的密度等於海平面氦氣的密度（誤差 0.4%）：一個硬殼、沒有重量、在海邊裝滿氦氣的氣球，浮到這裡就停住（標準大氣約 15.9 km）。', en: 'Where the air is exactly as dense as helium at sea level (within 0.4%): a weightless rigid balloon filled with helium at the seaside would float up to here and stop (about 15.9 km in the standard atmosphere).' },
      check: function (ev) { const d = S(ev); return !!d && d.rhoHe0 > 0 && Math.abs(d.rho / d.rhoHe0 - 1) <= 0.004; }
    },
    {
      id: 'atmosphere-layers-h5', level: 6, hidden: true,
      title: { zh: '一公尺才遇見一次', en: 'One metre between meetings' },
      riddle: { zh: '在這裡，空氣分子要邁開正好一大步，才撞得到鄰居。', en: 'Up here an air molecule must take exactly one big stride before it meets a neighbour.' },
      desc: { zh: '標準大氣（ΔT = 0）裡平均自由徑 1.00–1.01 m 的高度（約 111 km）。海平面只有 66 nm，差了一千五百萬倍。', en: 'In the standard atmosphere (ΔT = 0), where the mean free path is 1.00–1.01 m (about 111 km). At sea level it is only 66 nm — fifteen million times shorter.' },
      check: function (ev) { const d = S(ev); return !!d && std(d) && d.mfp >= 1 && d.mfp <= 1.01; }
    },
    {
      id: 'atmosphere-layers-h6', level: 7, hidden: true,
      title: { zh: '撞上天花板', en: 'Hitting the ceiling' },
      riddle: { zh: '讓信使在天氣的天花板上粉身碎骨。', en: 'Let the messenger shatter against the ceiling of the weather.' },
      desc: { zh: '讓氣球剛好在對流層頂（11.02 km ± 150 m）爆破：要用小氣球、充很多氦氣。', en: 'Make a balloon burst right at the tropopause (11.02 km ± 150 m): a small balloon with a lot of helium.' },
      check: function (ev) { const d = Bu(ev); return !!d && near(d.zBurst, TROPO, 150); }
    },
    {
      id: 'atmosphere-layers-h7', level: 7, hidden: true,
      title: { zh: '一百公尺，一百帕', en: 'A hundred metres, a hundred pascals' },
      riddle: { zh: '往上一百步，空氣就少了一百份的重。', en: 'A hundred steps up, and the air above is a hundred parts lighter.' },
      desc: { zh: '找一個高度，參考點和探測點相距約 100 m（95–105 m），氣壓差剛好是每公尺 1 Pa（誤差 1%）：這就是靜力平衡 dP/dz = −ρg，那裡的密度約 0.102 kg/m³（約 19 km）。', en: 'Mark a point and move the probe about 100 m (95–105 m) away so that the pressure changes by exactly 1 Pa per metre (within 1%): this is hydrostatic balance dP/dz = −ρg, with a density of about 0.102 kg/m³ (near 19 km).' },
      check: function (ev) {
        const d = S(ev);
        if (!d || !d.ref) return false;
        const dz = Math.abs(d.z - d.ref.z), dP = Math.abs(d.P - d.ref.P);
        return dz >= 95 && dz <= 105 && Math.abs(dP / dz - 1) <= 0.01;
      }
    },
    {
      id: 'atmosphere-layers-h8', level: 8, hidden: true,
      title: { zh: '雨雪分界線', en: 'The rain–snow line' },
      riddle: { zh: '預報員說：五百四十以下，雨就會變成雪。', en: 'The forecaster says: below five-forty, the rain turns to snow.' },
      desc: { zh: '參考點在 1000 hPa、探測點在 500 hPa（各 ±1 hPa），兩者的厚度是 5395–5405 m。預報員常用 1000–500 hPa 厚度 540 dam 判斷下雨或下雪：空氣柱越冷越薄。', en: 'Reference point at 1000 hPa and probe at 500 hPa (each ±1 hPa), with a thickness of 5395–5405 m. Forecasters use a 1000–500 hPa thickness of 540 dam to tell rain from snow: the colder the column, the thinner it is.' },
      check: function (ev) {
        const d = S(ev);
        if (!d || !d.ref) return false;
        return near(d.ref.P, 100000, 100) && near(d.P, 50000, 100) && d.z - d.ref.z >= 5395 && d.z - d.ref.z <= 5405;
      }
    },
    {
      id: 'atmosphere-layers-h9', level: 9, hidden: true,
      title: { zh: '一樣的撐開比例', en: 'The same stretch' },
      riddle: { zh: '一大一小兩個信使，在同一層天空同時退休。', en: 'A big messenger and a small one retire in the same sky.' },
      desc: { zh: '兩種不同的氣球，在同樣的大氣裡爆破的高度相差 100 m 以內：只要 （爆破直徑／地面直徑）³ 一樣，就在同一個 P/T 爆破，和氣球多大無關。', en: 'Two different balloons, in the same atmosphere, burst within 100 m of each other: if (bursting diameter / ground diameter)³ is the same, they burst at the same P/T, however big they are.' },
      check: function (ev) {
        const d = Bu(ev);
        if (!d) return false;
        return before(d).some(function (f) { return f.type !== d.type && Math.abs(f.dT - d.dT) < 1e-9 && Math.abs(f.zBurst - d.zBurst) <= 100; });
      }
    },
    {
      id: 'atmosphere-layers-h10', level: 10, hidden: true,
      title: { zh: '又快又高', en: 'Fast and high' },
      riddle: { zh: '最重的信使，出發要和標準的一樣急，退休卻要比三十八公里還高。', en: 'The heaviest messenger must leave as briskly as the standard one, yet retire above thirty-eight kilometres.' },
      desc: { zh: '標準大氣（ΔT = 0）裡，3000 g 的氣球出發時每秒上升至少 5 m，又在 38 km 以上才爆破：充氣的範圍只有幾公分。', en: 'In the standard atmosphere (ΔT = 0), a 3000 g balloon that leaves the ground at 5 m/s or more and still bursts above 38 km: the fill has only a few centimetres of room.' },
      check: function (ev) { const d = Bu(ev); return !!d && d.type === 'b3000' && std(d) && d.v0 >= 5 && d.zBurst >= 38000; }
    }
  ]);
})();
