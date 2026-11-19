(function () {
  'use strict';
  const slug = 'heat-conduction';
  const near = (x, target, tolerance) => Math.abs(x - target) <= tolerance;
  const materials = (d, a, b) => d.a === a && d.b === b;
  const steady = d => d.time > 0 && d.maxGap <= 0.5;
  const same = (a, b, fields) => fields.every(key => a[key] === b[key]);
  const rod = (d, mode, a, b) => d.mode === mode && materials(d, a, b) && steady(d);
  const compare = (accept, result) => (d, mem) => {
    if (!accept(d)) return false;
    const history = mem.history || (mem.history = []);
    const matched = history.some(previous => result(previous, d));
    history.push(d);
    if (history.length > 20) history.shift();
    return matched;
  };
  const check = (criterion, onChange = false) => (ev, mem) => {
    if (ev.type === 'records-cleared') { delete mem.history; return false; }
    return (ev.type === 'recorded' || (onChange && ev.type === 'state-changed' && !ev.data.modeEntry)) && criterion(ev.data, mem);
  };
  const task = (number, level, zh, en, descZh, descEn, criterion) => ({
    id: slug + '-' + number, level, title: { zh, en }, desc: { zh: descZh, en: descEn }, check: check(criterion)
  });
  const hidden = (number, level, zh, en, criterion, onChange = false) => ({
    id: slug + '-h' + number, level, hidden: true, riddle: { zh, en },
    check: check(criterion, onChange)
  });

  const dimensions = ['a', 'b', 'length', 'area'];
  const rodSettings = [...dimensions, 'fraction', 'left', 'right'];
  const relative = (a, b, tolerance) => Math.abs(a - b) <= tolerance * Math.max(Math.abs(a), Math.abs(b));
  const warmEnds = d => d.mode === 'series' && d.left === d.right && d.left > 20 && d.time > 0;
  const unevenInflow = d => d.endFlows[0] < 0 && d.endFlows[1] < 0 &&
    Math.abs(d.endFlows[0]) > 5 * Math.abs(d.endFlows[1]) && d.maxGap > 8;
  const stableSeries = d => d.mode === 'series' && d.a !== d.b && steady(d) && Math.abs(d.left - d.right) >= 10;
  const stripShape = (a, b) => same(a, b, ['a', 'b', 'length']);
  window.LabMission.register(slug, [
    task(1, 1, '高溫在右邊', 'The hot end is on the right',
      '串聯鋁棒與鋼棒，讓右端至少比左端高 30 °C。快轉後記錄讀數，看看熱流率的正負號。',
      'Put aluminum and steel in series, with the right end at least 30 °C warmer. Fast-forward and record the readings. Check the sign of the heat rate.',
      d => d.mode === 'series' && steady(d) && (materials(d, 'aluminum', 'steel') || materials(d, 'steel', 'aluminum')) && d.right - d.left >= 30 && d.flow < 0),
    task(2, 2, '接面取中點', 'Halfway in temperature',
      '串聯兩根鋁棒，各占一半長度，兩端設為 80 °C 與 20 °C。快轉後記下 50 °C 的接面。',
      'Join two equal-length aluminum sections between 80 °C and 20 °C. Fast-forward and record a junction at 50 °C.',
      d => rod(d, 'series', 'aluminum', 'aluminum') && Math.min(d.left, d.right) === 20 && Math.max(d.left, d.right) === 80 &&
        d.fraction === 0.5 && near(d.currentJunction, 50, 0.1)),
    task(3, 3, '兩路各半', 'An even split',
      '用兩根鋼棒並聯。令左端比右端至少高 40 °C，讓兩路各分到一半的熱流，再記錄近穩態讀數。',
      'Put two steel rods in parallel with the left end at least 40 °C warmer. Split the heat rate evenly and record the near-steady readings.',
      d => rod(d, 'parallel', 'steel', 'steel') && d.left - d.right >= 40 && near(d.rates[0] / d.flow, 0.5, 0.002)),
    task(4, 4, '先快後齊', 'Uneven first, even later',
      '以銅、鋼各半串聯。總長 30 cm、左端 80 °C、右端 20 °C。選 1× 開始導熱，可先暫停，趁接面仍比穩態低至少 25 °C 記一次，快轉後再記一次。',
      'Join equal lengths of copper and steel, 30 cm in total, left end 80 °C and right end 20 °C. Start at 1× and pause if needed. Record while the junction is at least 25 °C below its steady value. Then fast-forward and record again.',
      compare(d => d.mode === 'series' && materials(d, 'copper', 'steel') && near(d.length, 0.30, 1e-9) &&
        d.fraction === 0.5 && d.left === 80 && d.right === 20 && d.time > 0,
      (a, b) => same(a, b, ['area']) && a.junction - a.currentJunction >= 25 &&
        steady(b) && b.flowSpread <= 0.02 * Math.abs(b.flow))),
    task(5, 5, '加熱與冷卻', 'Heating and cooling',
      '用鋁當雙金屬片的 A 層、鋼當 B 層。分別在 ΔT = +60 °C 與 −60 °C 記錄，保持長度與厚度相同。',
      'Use aluminum above steel in the bimetal strip. Record at +60 °C and −60 °C without changing its length or thickness.',
      compare(d => d.mode === 'bimetal' && materials(d, 'aluminum', 'steel') && Math.abs(d.deltaT) === 60,
        (a, b) => same(a, b, ['length', 'thickness']) && a.deltaT === -b.deltaT &&
          a.tip.y * b.tip.y < 0 && near(a.curvature, -b.curvature, 1e-9))),
    task(6, 6, '三瓦的鋼棒', 'Three watts through steel',
      '把兩段鋼串聯成 40 cm 長的棒，左端 60 °C、右端 20 °C。調整總截面積，使近穩態熱流率為 3.00 ± 0.01 W 並記錄。',
      'Join two steel sections into a 40 cm rod with the left end at 60 °C and the right at 20 °C. Adjust its total area for a near-steady heat rate of 3.00 ± 0.01 W and record.',
      d => rod(d, 'series', 'steel', 'steel') && near(d.length, 0.40, 1e-9) && d.left === 60 &&
        d.right === 20 && near(d.flow, 3, 0.01)),
    task(7, 7, '異材同流', 'Different rods, equal rates',
      '並聯黃銅 A 與鋼 B。總長 30 cm、總截面積 6 平方公分，左端 80 °C、右端 20 °C。調整 A 棒的截面積占比，讓兩支路的熱流率相差不超過 0.05 W，再記錄近穩態讀數。',
      'Put brass A and steel B in parallel. Use a 30 cm length and 6 square centimeters in total, with the left end at 80 °C and the right at 20 °C. Adjust the area share of A to bring the branch rates within 0.05 W, then record near steady state.',
      d => rod(d, 'parallel', 'brass', 'steel') && near(d.area, 0.0006, 1e-9) &&
        near(d.length, 0.30, 1e-9) && d.left === 80 && d.right === 20 && near(d.rates[0], d.rates[1], 0.05)),
    task(8, 8, '兩路分成三比一', 'Split the rate three to one',
      '用鋁 A、鋼 B 並聯。長 30 cm，左端 90 °C、右端 10 °C。可點數字輸入，設定占比與總截面積，使 A、B 分別流過 6.00 W 與 2.00 W（各容許 0.02 W），快轉後記錄。',
      'Put aluminum A and steel B in parallel, 30 cm long, with the left end at 90 °C and the right at 10 °C. Tap a value for fine adjustment. Choose the share and total area for 6.00 W through A and 2.00 W through B (within 0.02 W each). Fast-forward and record.',
      d => rod(d, 'parallel', 'aluminum', 'steel') && near(d.length, 0.30, 1e-9) && d.left === 90 &&
        d.right === 10 && near(d.rates[0], 6, 0.02) && near(d.rates[1], 2, 0.02)),
    task(9, 9, '換位置，保留熱流率', 'Swap positions, keep the rate',
      '把銅 A、鋼 B 串聯，A 占 60.0 %，左端 100 °C、右端 20 °C。記下近穩態讀數，再互換材料位置與長度占比，保留總長、總截面積與兩端溫度。再記一次，對照接面與熱流率。',
      'Put copper A and steel B in series, with A taking 60.0% of the length, between 100 °C and 20 °C. Record near steady state, then swap the materials and length shares without changing total length, area or endpoint temperatures. Record and compare the junction and rate.',
      compare(d => d.mode === 'series' && steady(d) && d.left === 100 && d.right === 20 &&
        ((materials(d, 'copper', 'steel') && d.fraction === 0.60) ||
          (materials(d, 'steel', 'copper') && d.fraction === 0.40)),
      (a, b) => a.a === b.b && same(a, b, ['area', 'length']) && near(a.flow, b.flow, 1e-9) &&
        Math.abs(a.junction - b.junction) > 40)),
    task(10, 10, '讓端點下彎六公分', 'Six centimeters down',
      '雙金屬片以鋁為上層、鋼為下層，原長 40 cm，升溫 100 °C。調整總厚度，讓端點向下移動 60.00 ± 0.35 mm，記錄讀數。',
      'Use a 40 cm strip with aluminum above steel and heat it by 100 °C. Choose a total thickness that moves the tip down 60.00 ± 0.35 mm and record.',
      d => d.mode === 'bimetal' && materials(d, 'aluminum', 'steel') && near(d.length, 0.40, 1e-9) &&
        d.deltaT === 100 && near(d.tip.y, 0.06, 0.00035)),

    hidden(1, 3, '兩端同暖，熱曾從兩岸湧入。等到滿池同溫，再留一筆。', 'Two equally warm banks once fed the pool. Keep a second reading when the pool is warm throughout.',
      compare(warmEnds, (a, b) => same(a, b, rodSettings) &&
        [a, b].some(d => d.maxGap >= 10 && d.endFlows[0] > 0 && d.endFlows[1] < 0) &&
        [a, b].some(d => steady(d) && d.endFlows.every(q => Math.abs(q) < 0.01)))),
    hidden(2, 4, '同材的雙層，一冷一暖各留一道筆直的影子，伸縮恰好相抵。', 'Twin layers of one metal cast straight shadows in heat and cold. Their length changes cancel.',
      compare(d => d.mode === 'bimetal' && d.a === d.b && d.deltaT !== 0 && d.curvature === 0,
        (a, b) => stripShape(a, b) && a.thickness === b.thickness && a.deltaT === -b.deltaT &&
          near(a.freeA, -b.freeA, 1e-10))),
    hidden(3, 5, '並行的細路先勝過寬路。把兩路的寬窄對調，記下同一溫度線背後的兩次分流。', 'The narrow parallel path first carries more heat. Exchange the areas and record both flow splits behind the same temperature profile.',
      compare(d => d.mode === 'parallel' && d.a !== d.b && steady(d) && Math.abs(d.left - d.right) >= 10,
        (a, b) => same(a, b, [...dimensions, 'left', 'right']) && near(a.fraction + b.fraction, 1, 0.001) &&
          Math.abs(a.fraction - b.fraction) >= 0.19 && [a, b].some(d => (d.fraction - 0.5) *
            (Math.abs(d.rates[0]) - Math.abs(d.rates[1])) < 0) && Math.abs(a.rates[0]) !== Math.abs(b.rates[0]))),
    hidden(4, 6, '不到三分之一的短棒扛下幾乎整段溫降；連長度一起換邊，它還扛得住嗎？把兩幅圖留下。', 'A rod under a third of the length takes nearly the entire temperature drop. Trade places, keeping each rod’s length, and keep both profiles.',
      compare(d => stableSeries(d) && Math.min(d.fraction, 1 - d.fraction) < 1 / 3 &&
        Math.max(...d.resistances) / d.resistance >= 0.99 &&
        (d.fraction < 0.5) === (d.resistances[0] > d.resistances[1]),
      (a, b) => a.a === b.b && a.b === b.a && near(a.fraction + b.fraction, 1, 0.001) &&
        same(a, b, ['length', 'area', 'left', 'right']) && relative(a.flow, b.flow, 0.002))),
    hidden(5, 6, '暖意不變，上下兩層交換座位。兩筆端點讀數能否成為彼此的倒影？', 'Keep the warming and swap the top and bottom layers. Can the two tip readings mirror each other?',
      compare(d => d.mode === 'bimetal' && d.a !== d.b && d.deltaT > 0 && Math.abs(d.tip.y) >= 0.001,
        (a, b) => a.a === b.b && a.b === b.a && same(a, b, ['length', 'thickness', 'deltaT']) &&
          near(a.tip.y, -b.tip.y, 1e-10))),
    hidden(6, 7, '異材兩段平分溫降。熱庫互換後，兩筆接面溫度是否還停在中點？', 'Two different rods share the drop equally. Exchange the reservoirs and compare both junction readings with the midpoint.',
      compare(d => stableSeries(d) && relative(d.resistances[0], d.resistances[1], 0.005),
        (a, b) => same(a, b, [...dimensions, 'fraction']) && a.left === b.right && a.right === b.left &&
          near(a.junction, b.junction, 0.003 * Math.abs(a.left - a.right)) && relative(a.flow, -b.flow, 0.001))),
    hidden(7, 7, '冷岸在左、暖岸在右。兩端的熱都往左時，先記下出口超過入口五倍的瞬間，再等收支相抵。', 'Cold on the left, warm on the right. Catch leftward flow when outflow exceeds five times inflow, then record the balanced budget.',
      compare(d => d.mode === 'series' && d.left < 20 && d.right > 20 && d.time > 0,
        (a, b) => same(a, b, rodSettings) && (unevenInflow(a) || unevenInflow(b)) &&
          [a, b].some(d => steady(d) && relative(d.endFlows[0], d.endFlows[1], 0.01)))),
    hidden(8, 8, '保留異材棒的占比，一次接成橋，一次分成兩路。哪個占比讓分流的總量正好翻倍？', 'Keep the share of two different materials. Compare series and parallel. Which share doubles the total heat rate?',
      compare(d => ['series', 'parallel'].includes(d.mode) && d.a !== d.b && steady(d) && Math.abs(d.left - d.right) >= 10,
        (a, b) => a.mode !== b.mode && same(a, b, rodSettings) &&
          near(a.mode === 'series' ? b.flow / a.flow : a.flow / b.flow, 2, 0.005))),
    hidden(9, 9, '同一副異材雙層，溫差放大，厚度也跟著長了一大截。兩條弧還能有同樣的曲率嗎？', 'Give the same two metals a much larger temperature change and a proportionally thicker strip. Can both arcs keep their curvature?',
      compare(d => d.mode === 'bimetal' && d.a !== d.b && d.curvature !== 0,
        (a, b) => stripShape(a, b) && Math.max(Math.abs(a.deltaT / b.deltaT), Math.abs(b.deltaT / a.deltaT)) >= 1.5 &&
          Math.abs(a.thickness - b.thickness) >= 0.0008 - 1e-12 && relative(a.curvature, b.curvature, 0.005)), true),
    hidden(10, 10, '接面挪過五分之一棒長，兩岸各調冷暖。能讓接面溫度與流過它的熱同時守住原讀數嗎？', 'Move the joint by a fifth of the rod and retune both reservoirs. Can you recover the same junction temperature and signed heat rate?',
      compare(stableSeries, (a, b) => same(a, b, dimensions) && Math.abs(a.fraction - b.fraction) >= 0.20 - 1e-10 &&
        a.left !== b.left && a.right !== b.right && relative(a.flow, b.flow, 0.005) && near(a.junction, b.junction, 0.15)))
  ]);
})();
