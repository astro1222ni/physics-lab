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
    if (mem.previous && result(mem.previous, d)) return true;
    mem.previous = d;
    return false;
  };
  const check = criterion => (ev, mem) => ev.type === 'recorded' && criterion(ev.data, mem);
  const task = (number, level, zh, en, descZh, descEn, criterion) => ({
    id: slug + '-' + number, level, title: { zh, en }, desc: { zh: descZh, en: descEn }, check: check(criterion)
  });
  const hidden = (number, level, zh, en, criterion) => ({
    id: slug + '-h' + number, level, hidden: true, riddle: { zh, en },
    check: (ev, mem) => (ev.type === 'recorded' || ev.type === 'state-changed') && criterion(ev.data, mem)
  });

  window.LabMission.register(slug, [
    task(1, 1, '高溫在右邊', 'The hot end is on the right',
      '串聯鋁棒與鋼棒，讓右端至少比左端高 30 °C。快轉後記錄讀數，看看熱流率的正負號。',
      'Put aluminum and steel in series, with the right end at least 30 °C warmer. Fast-forward and record the readings. Check the sign of the heat rate.',
      d => rod(d, 'series', 'aluminum', 'steel') && d.right - d.left >= 30 && d.flow < 0),
    task(2, 2, '接面取中點', 'Halfway in temperature',
      '串聯兩根鋁棒，各占一半長度，兩端設為 80 °C 與 20 °C。快轉後記下 50 °C 的接面。',
      'Join two equal-length aluminum sections between 80 °C and 20 °C. Fast-forward and record a junction at 50 °C.',
      d => rod(d, 'series', 'aluminum', 'aluminum') && d.left === 80 && d.right === 20 &&
        d.fraction === 0.5 && near(d.currentJunction, 50, 0.1)),
    task(3, 3, '兩路各半', 'An even split',
      '用兩根鋼棒並聯。令左端比右端至少高 40 °C，讓兩路各分到一半的熱流，再記錄近穩態讀數。',
      'Put two steel rods in parallel with the left end at least 40 °C warmer. Split the heat rate evenly and record the near-steady readings.',
      d => rod(d, 'parallel', 'steel', 'steel') && d.left - d.right >= 40 && near(d.rates[0] / d.flow, 0.5, 0.002)),
    task(4, 4, '先快後齊', 'Uneven first, even later',
      '以銅、鋼各半串聯。總長 10 cm、左端 80 °C、右端 20 °C。開始導熱後趁接面仍比穩態低至少 25 °C 記一次，快轉後再記一次。',
      'Join equal lengths of copper and steel, 10 cm in total, between 80 °C and 20 °C. Once conduction starts, record while the junction is at least 25 °C below its steady value. Then fast-forward and record again.',
      compare(d => d.mode === 'series' && materials(d, 'copper', 'steel') && near(d.length, 0.10, 1e-9) &&
        d.fraction === 0.5 && d.left === 80 && d.right === 20 && d.time > 0,
      (a, b) => same(a, b, ['area']) && a.junction - a.currentJunction >= 25 &&
        a.flowSpread > Math.abs(a.flow) && steady(b) && b.flowSpread <= 0.02 * Math.abs(b.flow))),
    task(5, 5, '加熱與冷卻', 'Heating and cooling',
      '用鋁當雙金屬片的 A 層、鋼當 B 層。分別在 ΔT = +60 °C 與 −60 °C 記錄，保持長度與厚度相同。',
      'Use aluminum above steel in the bimetal strip. Record at +60 °C and −60 °C without changing its length or thickness.',
      compare(d => d.mode === 'bimetal' && materials(d, 'aluminum', 'steel') && Math.abs(d.deltaT) === 60,
        (a, b) => same(a, b, ['length', 'thickness']) && a.deltaT === -b.deltaT &&
          a.tip.y * b.tip.y < 0 && near(a.curvature, -b.curvature, 1e-9))),
    task(6, 6, '三瓦的鋼棒', 'Three watts through steel',
      '把兩段鋼串聯成 40 cm 長的棒，兩端設為 60 °C 與 20 °C。調整總截面積，使近穩態熱流率為 3.00 ± 0.01 W 並記錄。',
      'Join two steel sections into a 40 cm rod between 60 °C and 20 °C. Adjust its total area for a near-steady heat rate of 3.00 ± 0.01 W and record.',
      d => rod(d, 'series', 'steel', 'steel') && near(d.length, 0.40, 1e-9) && d.left === 60 &&
        d.right === 20 && near(d.flow, 3, 0.01)),
    task(7, 7, '異材同流', 'Different rods, equal rates',
      '並聯黃銅 A 與鋼 B。總長 30 cm、總截面積 6 cm²，兩端設定 80 °C、20 °C。調整 A 棒的截面積占比，讓兩支路的熱流率相差不超過 0.02 W，再記錄近穩態讀數。',
      'Put brass A and steel B in parallel. Use a 30 cm length and 6 square centimeters in total, between 80 °C and 20 °C. Adjust the area share of A to bring the branch rates within 0.02 W, then record near steady state.',
      d => rod(d, 'parallel', 'brass', 'steel') && near(d.area, 0.0006, 1e-9) &&
        near(d.length, 0.30, 1e-9) && d.left === 80 && d.right === 20 && near(d.rates[0], d.rates[1], 0.02)),
    task(8, 8, '兩路分成三比一', 'Split the rate three to one',
      '用鋁 A、鋼 B 並聯。長 30 cm，兩端 90 °C、10 °C。設定占比與總截面積，使 A、B 分別流過 6.00 W 與 2.00 W（各容許 0.02 W），快轉後記錄。',
      'Put aluminum A and steel B in parallel, 30 cm long, between 90 °C and 10 °C. Choose the share and total area for 6.00 W through A and 2.00 W through B (within 0.02 W each). Fast-forward and record.',
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
      '雙金屬片以鋁為上層、鋼為下層，原長 40 cm，升溫 100 °C。調整總厚度，讓端點向下移動 60.00 ± 0.15 mm，記錄讀數。',
      'Use a 40 cm strip with aluminum above steel and heat it by 100 °C. Choose a total thickness that moves the tip down 60.00 ± 0.15 mm and record.',
      d => d.mode === 'bimetal' && materials(d, 'aluminum', 'steel') && near(d.length, 0.40, 1e-9) &&
        d.deltaT === 100 && near(d.tip.y, 0.06, 0.00015)),

    hidden(1, 3, '兩封一樣的信，途中竟仍有回音。', 'Two identical letters still leave an echo between them.',
      d => d.mode === 'series' && materials(d, 'copper', 'brass') && d.time > 0 &&
        d.left === d.right && d.left >= 60 && d.flow === 0 &&
        d.endFlows[0] > 0 && d.endFlows[1] < 0 && d.maxGap >= 15),
    hidden(2, 4, '兩位舞者並肩退一步，影子仍是一條直線。', 'The dancers step back in unison and cast one straight shadow.',
      d => d.mode === 'bimetal' && materials(d, 'brass', 'brass') && d.deltaT <= -40 &&
        d.curvature === 0 && d.freeA < 0 && d.freeA === d.freeB),
    hidden(3, 5, '同一幅風景，兩條路上的車聲卻不同。', 'The roads have identical scenery but very different traffic.',
      d => rod(d, 'parallel', 'copper', 'glass') && d.left - d.right >= 50 &&
        near(d.rates[0] / d.rates[1], 390, 0.1)),
    hidden(4, 6, '最窄的門分走了較長的落日。', 'The narrow door takes the longer share of sunset.',
      d => rod(d, 'series', 'glass', 'copper') && d.left > d.right &&
        d.fraction <= 0.25 && (d.junction - d.right) / (d.left - d.right) < 0.011),
    hidden(5, 6, '長者轉身，短者留在原地看。', 'The longer one turns while the shorter one looks on.',
      d => d.mode === 'bimetal' && materials(d, 'copper', 'brass') && d.deltaT >= 50 &&
        d.freeB > d.freeA && near(d.tip.y, -0.005, 0.00008)),
    hidden(6, 7, '渡口換了岸，水位還守著一把尺。', 'The crossing trades banks and keeps the same mark on the gauge.',
      compare(d => rod(d, 'series', 'aluminum', 'brass') && near(d.fraction, 2 / 3, 0.001) &&
        Math.abs(d.left - d.right) === 80,
      (a, b) => same(a, b, ['area', 'length', 'fraction']) && a.left === b.right && a.right === b.left &&
        near(a.junction, b.junction, 0.07) && near(a.flow, -b.flow, 1e-9))),
    hidden(7, 7, '一面看似散去，另一面卻把它們都收下。', 'At one boundary it seems to leave, at the other it all comes in.',
      d => d.mode === 'series' && materials(d, 'steel', 'glass') && d.left === 0 && d.right === 40 &&
        d.time > 0 && d.endFlows.every(q => q < 0) && Math.abs(d.endFlows[0]) > 5 * Math.abs(d.endFlows[1]) &&
        d.maxGap > 8),
    hidden(8, 8, '鐘擺換了一座橋，節拍成了兩聲。', 'The pendulum takes another bridge and its beat becomes a pair.',
      compare(d => ['series', 'parallel'].includes(d.mode) && materials(d, 'copper', 'steel') &&
        steady(d) && d.left - d.right >= 50 && d.fraction < 0.35,
      (a, b) => a.mode !== b.mode && same(a, b, ['length', 'area', 'fraction', 'left', 'right']) &&
        near((a.mode === 'series' ? b.flow / a.flow : a.flow / b.flow), 2, 0.005))),
    hidden(9, 9, '一曲換了拍子，兩個句尾仍同聲。', 'A change of meter leaves both lines ending in unison.',
      compare(d => d.mode === 'bimetal' && materials(d, 'brass', 'steel') &&
        [50, 100].includes(d.deltaT),
      (a, b) => a.deltaT !== b.deltaT && a.length === b.length && Math.abs(a.thickness - b.thickness) >= 0.001 &&
        near(a.curvature, b.curvature, 0.001) && Math.abs(a.tip.y - b.tip.y) <= 0.00015)),
    hidden(10, 10, '船退得恰好，兩岸的影子都沒有挪。', 'The boat backs up exactly far enough to leave both banks unchanged.',
      compare(d => rod(d, 'series', 'brass', 'steel') && near(d.length, 0.40, 1e-9) &&
        d.left < 50 && d.right >= 90 && near(d.flow, -12.5, 0.025),
      (a, b) => Math.abs(b.fraction - a.fraction) >= 0.20 && a.area === b.area &&
        a.left !== b.left && a.right !== b.right && near(a.junction, b.junction, 0.15)))
  ]);
})();
