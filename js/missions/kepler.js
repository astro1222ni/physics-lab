/* missions/kepler.js — 行星軌道與克卜勒定律的任務（星星數 = 等級 1–10）
 *
 * 事件（js/kepler.js 只在使用者親自發射的軌道上回報；載入頁面或切換天體時自動發射的軌道不算）：
 *   'launch'：按下發射時；'lap'：繞完一整圈時；'escape'：開放軌道飛出畫面時；'crash'：撞上中心天體時；
 *   'record'：第三定律紀錄表更新時（data.list 為使用者發射的封閉軌道紀錄）。
 * data 主要欄位（SI 與常用單位都有）：preset（'sun'|'earth'）, M（中心質量倍數）, r0, v0, vRel = v0/v圓, alpha（度）,
 *   e, type, closed, crash, a, T, rp, ra（m、s）, aAU, Tyr, Th, Tmin, rpKm, raKm, laps, sectors（是否顯示等時間扇形）
 */
(function () {
  'use strict';
  if (!window.LabMission) return;

  const remember = function (mem, d, n) { (mem.list = mem.list || []).push(d); if (mem.list.length > (n || 16)) mem.list.shift(); return mem.list; };
  const sameM = function (a, b) { return a.preset === b.preset && Math.abs(a.M - b.M) < 1e-9; };

  LabMission.register('kepler', [
    {
      id: 'kepler-1', level: 1,
      title: { zh: '發射升空', en: 'Lift-off' },
      desc: { zh: '自己設定條件，按「發射」送出一顆行星或衛星。', en: 'Set your own launch and press “Launch”.' },
      check: function (ev) { return ev.type === 'launch'; }
    },
    {
      id: 'kepler-2', level: 2,
      title: { zh: '繞一圈回來', en: 'Once around' },
      desc: { zh: '發射一條封閉軌道，讓它完整繞中心天體一圈（不可撞上中心天體）。', en: 'Launch a closed orbit and let it go all the way round once (without hitting the central body).' },
      check: function (ev) { return ev.type === 'lap' && ev.data.laps >= 1; }
    },
    {
      id: 'kepler-3', level: 2,
      title: { zh: '完美的圓', en: 'A perfect circle' },
      desc: { zh: '發射一條離心率 e < 0.001 的圓軌道。', en: 'Launch a circular orbit with eccentricity e < 0.001.' },
      check: function (ev) { return ev.type === 'launch' && ev.data.e < 0.001 && !ev.data.crash; }
    },
    {
      id: 'kepler-4', level: 3,
      title: { zh: '一去不回', en: 'Gone for good' },
      desc: { zh: '讓發射的物體脫離中心天體的束縛，飛出畫面不再回來。', en: 'Make the launched body escape: it leaves the screen and never comes back.' },
      check: function (ev) { return ev.type === 'escape'; }
    },
    {
      id: 'kepler-5', level: 4,
      title: { zh: '低軌道衛星', en: 'Low Earth orbit' },
      desc: { zh: '以地球（M = 1）為中心，發射一顆週期在 95 到 100 分鐘之間的衛星，並讓它繞完一圈。', en: 'Around the Earth (M = 1), launch a satellite with a period between 95 and 100 minutes and let it complete one orbit.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'lap' && d.preset === 'earth' && Math.abs(d.M - 1) < 1e-9 && d.Tmin >= 95 && d.Tmin <= 100;
      }
    },
    {
      id: 'kepler-6', level: 5,
      title: { zh: '地球同步衛星', en: 'Geostationary satellite' },
      desc: { zh: '以地球（M = 1）為中心，發射一條圓軌道（e < 0.01），週期等於一個恆星日 23.934 h（誤差 ±0.05 h）。', en: 'Around the Earth (M = 1), launch a circular orbit (e < 0.01) whose period is one sidereal day, 23.934 h (±0.05 h).' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'launch' && d.preset === 'earth' && Math.abs(d.M - 1) < 1e-9 && d.e < 0.01 && !d.crash && Math.abs(d.Th - 23.934) <= 0.05;
      }
    },
    {
      id: 'kepler-7', level: 5,
      title: { zh: '第三定律的證據', en: 'Evidence for the third law' },
      desc: { zh: '同一個中心質量下，在紀錄表中留下 3 條封閉軌道，其中最大的半長軸至少是最小的 4 倍。比較它們的 T²/a³。', en: 'Around the same central mass, record 3 closed orbits in the table, the largest semi-major axis at least 4 times the smallest. Compare their T²/a³.' },
      check: function (ev) {
        if (ev.type !== 'record') return false;
        const list = ev.data.list || [];
        return list.some(function (r) {
          const g = list.filter(function (o) { return sameM(o, r); });
          if (g.length < 3) return false;
          const as = g.map(function (o) { return o.a; });
          return Math.max.apply(null, as) >= 4 * Math.min.apply(null, as);
        });
      }
    },
    {
      id: 'kepler-8', level: 6,
      title: { zh: '同週期、不同形狀', en: 'Same period, different shape' },
      desc: { zh: '同一個中心質量下，發射兩條週期相等（誤差 0.2% 內）的封閉軌道，但兩者的離心率相差至少 0.3。', en: 'Around the same central mass, launch two closed orbits with equal periods (within 0.2%) whose eccentricities differ by at least 0.3.' },
      check: function (ev, mem) {
        if (ev.type !== 'launch') return false;
        const d = ev.data;
        if (!d.closed || d.crash) return false;
        return remember(mem, d).some(function (o) {
          return o !== d && sameM(o, d) && o.closed && !o.crash && Math.abs(o.T - d.T) <= 0.002 * d.T && Math.abs(o.e - d.e) >= 0.3;
        });
      }
    },
    {
      id: 'kepler-9', level: 7,
      title: { zh: '哈雷彗星', en: 'Halley’s comet' },
      desc: { zh: '以太陽為中心，發射一條 e ≥ 0.9 的細長橢圓，近日點距離至少 0.3 AU，並讓它繞完一整圈。', en: 'Around the Sun, launch a long thin ellipse with e ≥ 0.9 and a perihelion distance of at least 0.3 AU, and let it complete a full orbit.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'lap' && d.preset === 'sun' && d.e >= 0.9 && d.rp >= 0.3 * 1.495978707e11;
      }
    },
    {
      id: 'kepler-10', level: 8,
      title: { zh: '更重的太陽，一樣的一年', en: 'Heavier Sun, same year' },
      desc: { zh: '把太陽的質量調到至少 2 倍，發射一條週期剛好 1.000 年的封閉軌道（誤差 ±0.002 年）。', en: 'Make the Sun at least twice as massive and launch a closed orbit with a period of exactly 1.000 year (±0.002 yr).' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'launch' && d.preset === 'sun' && d.M >= 2 && d.closed && !d.crash && Math.abs(d.Tyr - 1) <= 0.002;
      }
    },
    {
      id: 'kepler-11', level: 9,
      title: { zh: '同步轉移軌道', en: 'Geostationary transfer orbit' },
      desc: { zh: '以地球（M = 1）為中心，從 r0 ≤ 7 000 km 處水平發射（α = 0°），讓遠地點剛好落在同步軌道 42 164 km（誤差 ±100 km）。', en: 'Around the Earth (M = 1), launch horizontally (α = 0°) from r0 ≤ 7,000 km so that the apogee lies exactly at the geostationary radius, 42,164 km (±100 km).' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'launch' && d.preset === 'earth' && Math.abs(d.M - 1) < 1e-9 && Math.abs(d.alpha) < 1e-9 &&
          d.r0 <= 7.0e6 + 1e-3 && d.closed && !d.crash && Math.abs(d.raKm - 42164) <= 100;
      }
    },
    {
      id: 'kepler-12', level: 10,
      title: { zh: '大師：擦過地表', en: 'Master: skimming the surface' },
      desc: { zh: '以地球為中心，讓衛星的近地點距離介於 6 371 km（地球半徑）與 6 400 km 之間——貼著地表掠過卻不撞上，並繞完一整圈。', en: 'Around the Earth, put the perigee between 6,371 km (the Earth’s radius) and 6,400 km — skimming the surface without hitting it — and complete a full orbit.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'lap' && d.preset === 'earth' && !d.crash && d.rpKm >= 6371 && d.rpKm <= 6400;
      }
    },
    // ---------- 隱藏任務：只給隱晦的提示 ----------
    {
      id: 'kepler-h1', level: 4, hidden: true,
      riddle: { zh: '時間公平地分給每一塊土地，不論胖瘦。', en: 'Time is shared out fairly among every plot of land, fat or thin.' },
      check: function (ev) { const d = ev.data; return ev.type === 'lap' && d.sectors && d.e >= 0.6; }
    },
    {
      id: 'kepler-h2', level: 7, hidden: true,
      riddle: { zh: '最遠與最近之間，藏著大自然偏愛的比例。', en: 'Between the farthest and the nearest hides the ratio nature loves.' },
      check: function (ev) { const d = ev.data; return ev.type === 'launch' && d.closed && !d.crash && Math.abs(d.ra / d.rp - (1 + Math.sqrt(5)) / 2) <= 0.005; }
    },
    {
      id: 'kepler-h3', level: 8, hidden: true,
      riddle: { zh: '它來了又走，回首時，來路與去路恰成直角。', en: 'It came and went; looking back, the road in and the road out meet square.' },
      check: function (ev) { const d = ev.data; return ev.type === 'escape' && d.type === 'hyperbola' && Math.abs(d.e - Math.SQRT2) <= 0.005; }
    }
  ]);
})();
