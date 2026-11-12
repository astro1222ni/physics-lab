/* missions/population-growth.js — 族群成長的任務（星星數 = 等級 1–10）
 * 事件（js/population-growth.js 送出）：
 *   'grow'：第一部分一次培養播完時。model（expo／logi）、stoch（是否一隻一隻數）、r、K（指數時 null）、N0、tEnd、
 *           Nend、Nmax、extinct、tExt、td（ln2/r）
 *   'inspect'：在族群數量圖上檢視某一刻（放開手指或按方向鍵後）。model、stoch、r、K、N0、t、N、frac（N/K）、rate、rmax（rK/4）
 *   'pp'：掠食者–獵物模擬播完時。a、b、c、d、K（沒有負荷量時 null）、E、x0、y0、tEnd、eqx、eqy、coexist、T0（小振幅週期）、
 *         period、lag、cycles、avgX、avgY（完整循環的平均）、amp（整段離平衡點最遠的相對距離）、startDev、endDev、xEnd、yEnd、key（a|b|c|d）
 *   'comp'：種間競爭模擬播完時。r1、r2、K1、K2、a12、a21、x0、y0、tEnd、kind（'1'／'2'／'coexist'／'bistable'）、eqx、eqy、
 *           xEnd、yEnd、startDev、endDev、winner（1、2 或 0）、key
 */
(function () {
  'use strict';
  if (!window.LabMission) return;

  const pp = function (ev) { return ev.type === 'pp'; };
  const comp = function (ev) { return ev.type === 'comp'; };
  function remember(mem, key, item, max) {
    const a = mem[key] || (mem[key] = []);
    a.push(item);
    if (a.length > (max || 30)) a.shift();
    return a;
  }

  LabMission.register('population-growth', [
    {
      id: 'population-growth-1', level: 1,
      title: { zh: 'J 型曲線', en: 'The J curve' },
      desc: { zh: '用指數成長培養一個族群，讓它在觀察期間至少變成原來的 10 倍。', en: 'Grow a population exponentially until it is at least 10 times what you started with.' },
      check: function (ev) { const d = ev.data; return ev.type === 'grow' && d.model === 'expo' && !d.extinct && d.Nend >= 10 * d.N0; }
    },
    {
      id: 'population-growth-2', level: 2,
      title: { zh: 'S 型曲線', en: 'The S curve' },
      desc: { zh: '用邏輯斯成長，從不到負荷量十分之一的族群開始，培養到至少負荷量的 95%。', en: 'With logistic growth, start below a tenth of the carrying capacity and grow to at least 95% of it.' },
      check: function (ev) { const d = ev.data; return ev.type === 'grow' && d.model === 'logi' && d.N0 <= 0.1 * d.K && d.Nend >= 0.95 * d.K; }
    },
    {
      id: 'population-growth-3', level: 3,
      title: { zh: '五天翻一倍', en: 'Double in five days' },
      desc: { zh: '選一個內在成長率 r，讓指數成長的族群剛好每 5 天變成兩倍（誤差 0.1 天以內），並培養一次。', en: 'Pick an intrinsic growth rate r so that an exponentially growing population doubles every 5 days (within 0.1 day), and grow it once.' },
      check: function (ev) { const d = ev.data; return ev.type === 'grow' && d.model === 'expo' && Math.abs(d.td - 5) <= 0.1; }
    },
    {
      id: 'population-growth-4', level: 3,
      title: { zh: '此起彼落', en: 'Rise and fall' },
      desc: { zh: '讓掠食者與獵物至少完成兩個完整的循環：獵物的高峰先到，掠食者隨後。', en: 'Let predator and prey go through at least two full cycles: the prey peak comes first and the predators follow.' },
      check: function (ev) { const d = ev.data; return pp(ev) && d.cycles >= 2 && d.lag > 0 && d.lag < 0.5 * d.period && d.amp > 0.05; }
    },
    {
      id: 'population-growth-5', level: 4,
      title: { zh: '成長最快的時刻', en: 'The steepest moment' },
      desc: { zh: '邏輯斯成長、從不超過負荷量四分之一的族群開始，在族群數量圖上找出族群成長最快的那一刻（N/K 與答案相差不到 0.03）。', en: 'With logistic growth from at most a quarter of the carrying capacity, find on the population graph the moment the population grows fastest (N/K within 0.03 of the answer).' },
      check: function (ev) { const d = ev.data; return ev.type === 'inspect' && d.model === 'logi' && d.N0 <= 0.25 * d.K && Math.abs(d.frac - 0.5) < 0.03; }
    },
    {
      id: 'population-growth-6', level: 4,
      title: { zh: '小族群的厄運', en: 'Small and unlucky' },
      desc: { zh: '一隻一隻數，從至少 3 隻開始、r 大於 0：族群照平均應該成長，卻因為運氣不好而滅絕。', en: 'Counting individuals, start with at least 3 and r above 0: on average it should grow, yet by bad luck it dies out.' },
      check: function (ev) { const d = ev.data; return ev.type === 'grow' && d.stoch && d.r > 0 && d.N0 >= 3 && d.extinct; }
    },
    {
      id: 'population-growth-7', level: 5,
      title: { zh: '靜止的平衡', en: 'Perfect balance' },
      desc: { zh: '獵物沒有負荷量時，選一個起點，讓兩個族群在整段模擬中離平衡點都不到 2%（至少模擬一個小振幅週期）。', en: 'With no carrying capacity for the prey, choose a start so that both populations stay within 2% of the equilibrium for the whole run (at least one small-cycle period long).' },
      check: function (ev) { const d = ev.data; return pp(ev) && d.K == null && d.coexist && d.amp < 0.02 && d.tEnd >= d.T0; }
    },
    {
      id: 'population-growth-8', level: 6,
      title: { zh: '量出週期', en: 'Time the cycle' },
      desc: { zh: '換一組和預設不同的 a 與 d，獵物沒有負荷量，從平衡點附近出發（離平衡點不超過 10%），跑至少三個循環，量到的週期和 2π/√(a′d′) 相差不到 3%。', en: 'Change a and d from their defaults, give the prey no carrying capacity, start within 10% of the equilibrium and run at least three cycles: the measured period must be within 3% of 2π/√(a′d′).' },
      check: function (ev) {
        const d = ev.data;
        return pp(ev) && d.K == null && Math.abs(d.a - 1) > 1e-6 && Math.abs(d.d - 0.8) > 1e-6 && d.amp <= 0.1 && d.cycles >= 3 && Math.abs(d.period / d.T0 - 1) < 0.03;
      }
    },
    {
      id: 'population-growth-9', level: 6,
      title: { zh: '循環平息了', en: 'The cycles die down' },
      desc: { zh: '替獵物加上負荷量，讓兩個物種都能存活：從離平衡點超過 20% 的地方出發，最後兩者都回到平衡點 5% 以內。', en: 'Give the prey a carrying capacity that still lets both species live: start more than 20% from the equilibrium and end with both within 5% of it.' },
      check: function (ev) { const d = ev.data; return pp(ev) && d.K != null && d.coexist && d.startDev > 0.2 && d.endDev < 0.05; }
    },
    {
      id: 'population-growth-10', level: 7,
      title: { zh: '競爭排斥', en: 'Competitive exclusion' },
      desc: { zh: '讓兩個物種競爭，最後一種少於自己負荷量的 1%，另一種在自己負荷量的 5% 以內。', en: 'Let two species compete until one is below 1% of its carrying capacity and the other is within 5% of its own.' },
      check: function (ev) {
        const d = ev.data;
        if (!comp(ev)) return false;
        return (d.yEnd < 0.01 * d.K2 && Math.abs(d.xEnd / d.K1 - 1) < 0.05) || (d.xEnd < 0.01 * d.K1 && Math.abs(d.yEnd / d.K2 - 1) < 0.05);
      }
    },
    {
      id: 'population-growth-11', level: 8,
      title: { zh: '和平共存', en: 'Living together' },
      desc: { zh: '調整競爭係數，讓兩個物種共存：從離中間平衡點超過 20% 的地方出發，最後兩者都停在平衡點 5% 以內。', en: 'Adjust the competition coefficients so that both species coexist: start more than 20% from the inner equilibrium and end with both within 5% of it.' },
      check: function (ev) { const d = ev.data; return comp(ev) && d.kind === 'coexist' && d.startDev > 0.2 && d.endDev < 0.05; }
    },
    {
      id: 'population-growth-12', level: 10,
      title: { zh: '沃爾泰拉的漁獲之謎', en: 'Volterra’s fishing puzzle' },
      desc: { zh: '同樣的 a、b、c、d、獵物沒有負荷量，各跑一次不捕撈與有捕撈的模擬（都至少兩個完整循環）。有捕撈時，獵物的平均數量要比不捕撈時多 20% 以上，掠食者的平均數量則變少。', en: 'With the same a, b, c, d and no carrying capacity for the prey, run once without fishing and once with fishing (each at least two full cycles). With fishing, the average prey must be at least 20% higher than without, and the average predators lower.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!(pp(ev) && d.K == null && d.coexist && d.cycles >= 2 && isFinite(d.avgX) && isFinite(d.avgY))) return false;
        const prev = (mem.runs || []).filter(function (p) { return p.key === d.key && (p.E === 0) !== (d.E === 0); });
        const ok = prev.some(function (p) {
          const off = p.E === 0 ? p : d, on = p.E === 0 ? d : p;
          return on.avgX >= 1.2 * off.avgX && on.avgY < off.avgY;
        });
        remember(mem, 'runs', { key: d.key, E: d.E, avgX: d.avgX, avgY: d.avgY });
        return ok;
      }
    },
    {
      id: 'population-growth-h1', level: 5, hidden: true,
      riddle: { zh: '桌子太小，客人只好離席。', en: 'When the table is too small, the guests leave.' },
      check: function (ev) { const d = ev.data; return pp(ev) && d.K != null && !d.coexist && d.y0 >= 5 && d.yEnd < 0.01 * d.y0 && d.xEnd > 1; }
    },
    {
      id: 'population-growth-h2', level: 7, hidden: true,
      riddle: { zh: '同一片天地，換一個開場，就換一個主人。', en: 'The same land, a different opening, a different owner.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!(comp(ev) && d.kind === 'bistable' && d.winner)) return false;
        const ok = (mem.bi || []).some(function (p) { return p.key === d.key && p.winner !== d.winner; });
        remember(mem, 'bi', { key: d.key, winner: d.winner });
        return ok;
      }
    },
    {
      id: 'population-growth-h3', level: 4, hidden: true,
      riddle: { zh: '數著數著，就比所有的你我還多。', en: 'Keep counting, until there are more than all of us.' },
      check: function (ev) { return ev.type === 'grow' && ev.data.Nmax >= 8e9; }
    }
  ]);
})();
