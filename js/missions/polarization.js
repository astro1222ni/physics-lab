(function () {
  'use strict';
  const slug = 'polarization';
  const near = (x, target, tolerance) => Math.abs(x - target) <= tolerance;
  const glassAirCritical = Math.asin(1 / 1.5) * 180 / Math.PI;
  const gap = (a, b) => {
    const difference = Math.abs(a - b) % 180;
    return Math.min(difference, 180 - difference);
  };
  const filters = (d, mode, sourceAngle) => d.mode === mode && d.sourceAngle === sourceAngle;
  const optics = (d, n1, n2) => d.mode === 'reflection' && d.n1 === n1 && d.n2 === n2;
  const sameMedia = (a, b) => a.n1 === b.n1 && a.n2 === b.n2;
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
    task(1, 1, '轉到全暗', 'Turn the light out',
      '用無偏振光和兩片偏振片。旋轉檢偏片 C，讓接收器全暗，再記錄讀數。',
      'Use unpolarized light and two filters. Rotate analyzer C until the detector goes dark, then record.',
      d => filters(d, 'two', null) && d.intensity <= 1e-8),
    task(2, 2, '再分一半', 'Half of what got through',
      '用無偏振光和兩片偏振片。讓檢偏片 C 再擋住 A 後光強的一半，接收器讀到 25.00 %（容許 0.02 個百分點）時記錄。',
      'Use unpolarized light and two filters. Make analyzer C pass half of the light from A. Record a detector reading of 25.00% within 0.02 percentage points.',
      d => filters(d, 'two', null) && near(d.intensity, 0.25, 0.0002)),
    task(3, 3, '中途多一片，反而亮起來', 'An extra filter lets light through',
      '用三片偏振片與無偏振光。A 設 0°、C 設 90°，把 B 轉到 30°，看 C 後光強與抽掉 B 的讀數差多少，再記錄。',
      'Use three filters and unpolarized light. Set A to 0°, C to 90°, and B to 30°. Compare the readings with and without B and record.',
      d => filters(d, 'three', null) && d.angles[0] === 0 && d.angles[1] === 30 && d.angles[2] === 90 &&
        d.noMiddle <= 1e-8 && near(d.intensity, 0.09375, 1e-8)),
    task(4, 4, '入射方向也算數', 'The incident direction matters',
      '線偏振光的電場方向設定 30°。使用兩片，讓 A、C 的透光軸互相平行。調整兩軸，使接收器顯示 75.00 %（容許 0.02 個百分點）再記錄。',
      'Set a linearly polarized source to 30°. Keep both filter axes parallel and rotate them to get 75.00% at the detector, within 0.02 percentage points. Record the result.',
      d => filters(d, 'two', 30) && gap(...d.angles) <= 0.01 && near(d.intensity, 0.75, 0.0002)),
    task(5, 5, '送過某一個比例', 'Solve for the analyzer angle',
      '無偏振光通過兩片。固定 A 在 0°，調整 C，使接收器顯示 17.00 %（容許 0.01 個百分點）再記錄。',
      'Pass unpolarized light through two filters. Keep A at 0° and adjust C to get 17.00% within 0.01 percentage points, then record.',
      d => filters(d, 'two', null) && d.angles[0] === 0 && near(d.intensity, 0.17, 0.0001)),
    task(6, 6, '只剩 s 的角度', 'Find the angle that leaves s',
      '空氣射向玻璃（折射率 1.000 → 1.500）。檢偏片沿 s 方向，調到距布魯斯特角 0.02° 以內，讓反射光的偏振度顯示 100.00 % 再記錄。',
      'Send light from air into glass (indices 1.000 to 1.500). Set the analyzer along s and tune incidence to within 0.02° of Brewster’s angle. Record when reflected polarization reads 100.00%.',
      d => optics(d, 1, 1.5) && d.analyzer === 0 && near(d.inc, d.brewster, 0.02) && d.r.rs > 0 && d.r.rp < 5e-8),
    task(7, 7, '跨過臨界角', 'Across the critical angle',
      '讓光從玻璃射向空氣。先找出距臨界角不到 0.05°、仍有折射的讀數，再把入射角增加不超過 0.10°，記下全反射的讀數。兩次都保持檢偏片在 0°。',
      'Send light from glass into air. Record refraction within 0.05° below the critical angle. Increase incidence by at most 0.10° and record total internal reflection. Keep the analyzer at 0°.',
      compare(d => optics(d, 1.5, 1) && d.analyzer === 0,
      (a, b) => !a.r.totalInternal && a.inc < glassAirCritical && glassAirCritical - a.inc < 0.05 && b.r.totalInternal &&
        b.inc > a.inc && near(b.inc, a.inc, 0.10))),
    task(8, 8, '同樣亮的兩個角度', 'Two different angles, equal brightness',
      '三片偏振片，無偏振光，A 設 0°、C 設 60°。找出 0° 到 60° 之間的兩個 B 設定，兩次透射光強皆為 20.04 %（容許 0.02 個百分點），分別記錄。',
      'Use unpolarized light and three filters with A at 0° and C at 60°. Find and record two settings of B between 0° and 60° that yield 20.04%, within 0.02 percentage points.',
      compare(d => filters(d, 'three', null) && d.angles[0] === 0 && d.angles[2] === 60 &&
        d.angles[1] >= 0 && d.angles[1] <= 60 && near(d.intensity, 0.2004, 0.0002),
      (a, b) => Math.abs(a.angles[1] - b.angles[1]) > 1 && near(a.intensity, b.intensity, 0.0002))),
    task(9, 9, '旋轉檢偏片量到消光', 'Measure extinction with an analyzer',
      '讓折射率 1.200 的入射光射向 1.800。找出距布魯斯特角 0.01° 以內的入射角，先記錄 s 方向的光強，再旋轉檢偏片，讓讀數降到 0.00 % 並記錄。入射角保持不變。',
      'Use indices 1.200 and 1.800. Find incidence within 0.01° of Brewster’s angle. Record the analyzer along s, then rotate it for a 0.00% reading and record. Keep incidence fixed.',
      compare(d => optics(d, 1.2, 1.8) && near(d.inc, d.brewster, 0.01),
      (a, b) => a.inc === b.inc && a.analyzer === 0 && a.analyzed >= 0.07 && near(b.analyzer, 90, 0.02) &&
        b.analyzed < 1e-6)),
    task(10, 10, '從偏振度到四分之一', 'From polarization to one quarter',
      '用折射率 1.300 → 2.000。先找最小的入射角，使反射光偏振度為 60.0 %（容許 0.05 個百分點），檢偏片沿 s。記下讀數後只轉檢偏片，直到透過它的光強為未檢偏反射光強的 25.0 %（容許 0.05 個百分點），再記錄。',
      'Use indices 1.300 and 2.000. Find the smaller incidence angle giving 60.0% reflected polarization (within 0.05 percentage points), with the analyzer along s. Record, then turn only the analyzer to pass 25.0% of the original reflected intensity, within 0.05 percentage points, and record again.',
      compare(d => optics(d, 1.3, 2) && d.inc < d.brewster && near(d.r.polarization, 0.60, 0.0005),
      (a, b) => a.inc === b.inc && a.analyzer === 0 && near(b.analyzed / b.r.reflected, 0.25, 0.0005))),

    hidden(1, 3, '兩扇門敞開，影子卻在門外停步。', 'Both doors are open and the shadow waits outside.',
      d => filters(d, 'two', 25) && d.angles[0] === 25 && gap(d.angles[0], d.angles[1]) === 0 && near(d.intensity, 1, 1e-9)),
    hidden(2, 4, '鏡中兩個影子，一前一後卻同樣深。', 'Two shadows in the mirror are equally deep.',
      d => optics(d, 1.4, 2.2) && d.inc === 0 && d.r.rs > 0 &&
        near(d.r.rs, d.r.rp, 1e-10) && near(d.analyzed, d.r.reflected / 2, 1e-10)),
    hidden(3, 5, '門楣仍在，門檻卻沒有留下痕跡。', 'The doorway remains but the threshold leaves no trace.',
      d => d.mode === 'reflection' && d.n1 === d.n2 && d.n1 > 1 && d.inc >= 30 &&
        d.r.reflected === 0 && d.r.angleT === d.inc && d.brewster === null),
    hidden(4, 5, '旅人換了一件衣裳，手裡仍是空的。', 'The traveler changes coats and still carries nothing.',
      d => filters(d, 'three', 10) && d.angles[0] === 100 && d.angles[1] === 55 && d.angles[2] === 10 &&
        d.stages.every(s => s.intensity === 0)),
    hidden(5, 6, '一截短廊讓原來的腳步多了一道回聲。', 'A short passage adds an echo to the footsteps.',
      d => filters(d, 'three', 10) && d.angles[0] === 30 && d.angles[2] === 70 &&
        d.intensity - d.noMiddle >= 0.17),
    hidden(6, 7, '戲台轉了身，燈火從頭到尾都沒有改。', 'The stage turns and every lamp keeps its brightness.',
      compare(d => d.mode === 'two' && d.sourceAngle !== null && near(d.intensity, 0.5625, 1e-8),
      (a, b) => Math.abs(a.sourceAngle - b.sourceAngle) >= 30 &&
        near(gap(a.angles[0], a.sourceAngle), 30, 0.001) && near(gap(a.angles[0], a.angles[1]), 30, 0.001) &&
        near((b.angles[0] - a.angles[0] + 180) % 180, (b.sourceAngle - a.sourceAngle + 180) % 180, 0.001) &&
        near((b.angles[1] - a.angles[1] + 180) % 180, (b.sourceAngle - a.sourceAngle + 180) % 180, 0.001))),
    hidden(7, 7, '濃淡不均的兩幅畫，轉過去竟同樣明。', 'Two uneven portraits turn and become equally bright.',
      d => optics(d, 1.4, 2.2) && d.inc > 35 && d.inc < 45 && d.r.polarization > 0.5 &&
        d.analyzer === 45 && near(d.analyzed / d.r.reflected, 0.5, 1e-9)),
    hidden(8, 8, '搖晃兩邊的把手，門口的影子沒有縮短。', 'Both handles move and the shadow holds its length.',
      compare(d => d.mode === 'reflection' && d.n1 >= 1.1 && d.n2 > d.n1 + 0.3 &&
        Math.abs(d.inc - d.brewster) <= 0.01 && d.analyzer === 0 && Math.abs(d.n2 / d.n1 - 1.6) <= 0.002,
      (a, b) => !sameMedia(a, b) && a.n1 !== b.n1 && a.n2 !== b.n2 &&
        near(a.inc, b.inc, 0.01) && near(a.r.reflected, b.r.reflected, 0.0001))),
    hidden(9, 9, '沿原路回家，窗上的兩道倒影仍在。', 'Take the old path home and the window keeps both reflections.',
      compare(d => d.mode === 'reflection' && d.analyzer === 0 && !d.r.totalInternal &&
        ((d.n1 === 1.3 && d.n2 === 1.8) || (d.n1 === 1.8 && d.n2 === 1.3)),
      (a, b) => a.n1 === b.n2 && a.n2 === b.n1 && near(a.inc, b.r.angleT, 0.012) &&
        near(b.inc, a.r.angleT, 0.012) && near(a.r.rs, b.r.rs, 0.00012) &&
        near(a.r.rp, b.r.rp, 0.00012) && a.r.polarization > 0.9)),
    hidden(10, 10, '新橋跨得較長，卻抵達相同的暮色。', 'A longer crossing arrives at the very same dusk.',
      compare(d => filters(d, 'three', null) && d.angles[0] === 0 && d.angles[2] >= 35 && d.angles[2] <= 85 &&
        near(d.intensity, 0.25, 0.0001),
      (a, b) => Math.abs(a.angles[2] - b.angles[2]) >= 15 &&
        near(a.intensity, b.intensity, 0.0001) && Math.abs(a.noMiddle - b.noMiddle) >= 0.10))
  ]);
})();
