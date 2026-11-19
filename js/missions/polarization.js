(function () {
  'use strict';
  const slug = 'polarization';
  const near = (x, target, tolerance) => Math.abs(x - target) <= tolerance;
  const quarterSpan = 2 * Math.acos(2 ** -0.25) * 180 / Math.PI;
  const gap = (a, b) => {
    const difference = Math.abs(a - b) % 180;
    return Math.min(difference, 180 - difference);
  };
  const filters = (d, mode, sourceAngle) => d.mode === mode && d.sourceAngle === sourceAngle;
  const optics = (d, n1, n2) => d.mode === 'reflection' && d.incidentPol === 'unpolarized' && d.n1 === n1 && d.n2 === n2;
  const sameMedia = (a, b) => a.n1 === b.n1 && a.n2 === b.n2;
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

  const alongS = angle => gap(angle, 0) <= 0.02;
  const linear = d => d.mode !== 'reflection' && d.sourceAngle !== null;
  const unpolarizedReflection = d => d.mode === 'reflection' && d.incidentPol === 'unpolarized';
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
      '無偏振光從空氣射向玻璃（折射率 1.000 → 1.500）。檢偏片沿 s 方向，調到距布魯斯特角 0.02° 以內，讓反射光的偏振度顯示 100.00 % 再記錄。',
      'Send unpolarized light from air into glass (indices 1.000 to 1.500). Set the analyzer along s and tune incidence to within 0.02° of Brewster’s angle. Record when reflected polarization reads 100.00%.',
      d => optics(d, 1, 1.5) && alongS(d.analyzer) && near(d.inc, d.brewster, 0.02) && d.r.rs > 0 && d.r.rp < 5e-8),
    task(7, 7, '跨過臨界角', 'Across the critical angle',
      '無偏振光自玻璃射向空氣，檢偏片沿 s。在臨界角兩側各記一次，兩角相距不超過 0.30°，一次仍有折射、另一次已全反射。可從任一側開始。',
      'Send unpolarized light from glass into air with the analyzer along s. Record on either side of the critical angle, no more than 0.30° apart: once with refraction and once with total internal reflection, in either order.',
      compare(d => optics(d, 1.5, 1) && alongS(d.analyzer),
        (a, b) => a.r.totalInternal !== b.r.totalInternal && [a, b].some(d => d.r.angleT !== null && d.r.angleT < 90 && d.r.ts > 0) &&
          near(a.inc, b.inc, 0.3000001))),
    task(8, 8, '同樣亮的兩個角度', 'Two different angles, equal brightness',
      '三片偏振片，無偏振光，A 設 0°、C 設 60°。找出 0° 到 60° 之間的兩個 B 設定，兩次透射光強皆為 20.04 %（容許 0.02 個百分點），分別記錄。',
      'Use unpolarized light and three filters with A at 0° and C at 60°. Find and record two settings of B between 0° and 60° that yield 20.04%, within 0.02 percentage points.',
      compare(d => filters(d, 'three', null) && d.angles[0] === 0 && d.angles[2] === 60 &&
        d.angles[1] >= 0 && d.angles[1] <= 60 && near(d.intensity, 0.2004, 0.0002),
      (a, b) => Math.abs(a.angles[1] - b.angles[1]) > 1 && near(a.intensity, b.intensity, 0.0002))),
    task(9, 9, '旋轉檢偏片量到消光', 'Measure extinction with an analyzer',
      '讓無偏振光從折射率 1.200 的介質射入折射率 1.800 的介質。找出距布魯斯特角 0.01° 以內的入射角，先記錄 s 方向的光強，再旋轉檢偏片，讓讀數降到 0.00 % 並記錄。入射角保持不變。',
      'Use unpolarized light and indices 1.200 and 1.800. Find incidence within 0.01° of Brewster’s angle. Record the analyzer along s, then rotate it for a 0.00% reading and record. Keep incidence fixed.',
      compare(d => optics(d, 1.2, 1.8) && near(d.inc, d.brewster, 0.01),
      (a, b) => a.inc === b.inc && alongS(a.analyzer) && a.analyzed >= 0.07 && near(b.analyzer, 90, 0.02) &&
        b.analyzed < 1e-6)),
    task(10, 10, '從偏振度到四分之一', 'From polarization to one quarter',
      '用無偏振光，折射率 1.300 → 2.000。可點數字微調。先找較小的入射角，使反射光偏振度為 60.0 %（容許 0.10 個百分點），檢偏片沿 s。記下讀數後只轉檢偏片，直到透過它的光強為未檢偏反射光強的 25.0 %（容許 0.05 個百分點），再記錄。',
      'Use unpolarized light and indices 1.300 and 2.000. Tap a value for fine adjustment. Find the smaller incidence angle giving 60.0% reflected polarization (within 0.10 percentage points), with the analyzer along s. Record, then turn only the analyzer to pass 25.0% of the original reflected intensity, within 0.05 percentage points, and record again.',
      compare(d => optics(d, 1.3, 2) && d.inc < d.brewster && near(d.r.polarization, 0.60, 0.001),
      (a, b) => a.inc === b.inc && alongS(a.analyzer) && near(b.analyzed / b.r.reflected, 0.25, 0.0005))),

    hidden(1, 3, '兩道窄門和電場排成一直線，一絲光也沒少。換個明顯不同的朝向，再留一筆滿光。', 'Align two gates with the field and lose no light. Record full transmission again in a distinctly different direction.',
      compare(d => linear(d) && d.mode === 'two' && near(d.intensity, 1, 1e-9),
        (a, b) => gap(a.sourceAngle, b.sourceAngle) >= 30)),
    hidden(2, 4, '正對同一扇界面，讓純 s 和純 p 各照一次；兩道倒影一樣亮。', 'Face the same interface straight on. Record a pure s reflection and a pure p reflection of equal brightness.',
      compare(d => d.mode === 'reflection' && d.n1 !== d.n2 && d.inc === 0 && ['s', 'p'].includes(d.incidentPol),
        (a, b) => sameMedia(a, b) && a.incidentPol !== b.incidentPol && a.powers.reflected > 0 &&
          near(a.powers.reflected, b.powers.reflected, 1e-10))),
    hidden(3, 5, '折射率一致時，斜光像穿過一扇隱形的門。從相隔一大段的兩個斜角，留下直行無倒影的證據。', 'Match the indices to make the boundary disappear. Record straight paths with no reflection at two widely separated oblique angles.',
      compare(d => unpolarizedReflection(d) && d.n1 === d.n2 && d.inc > 0 && d.r.reflected === 0 && d.r.angleT === d.inc,
        (a, b) => sameMedia(a, b) && Math.abs(a.inc - b.inc) >= 30)),
    hidden(4, 5, '第一扇門已將光擋盡，末門卻朝著光源的電場。留住兩個不同的斜向中間片，看誰能喚回光。', 'The first gate extinguishes the source, and the last aligns with its field. Keep two oblique middle settings and see if either restores light.',
      compare(d => linear(d) && d.mode === 'three' && gap(d.sourceAngle, d.angles[0]) >= 89.99 &&
        gap(d.sourceAngle, d.angles[2]) <= 0.01 && gap(d.angles[0], d.angles[1]) > 0 && gap(d.angles[0], d.angles[1]) < 90 &&
        d.stages.every(s => s.intensity <= 1e-9),
        (a, b) => gap(a.sourceAngle, b.sourceAngle) <= 0.01 && gap(a.angles[1], b.angles[1]) >= 20)),
    hidden(5, 6, '兩扇斜門已經透出線偏振光。先留住這道光，再比較加了中間片後，多透過多少入射光。', 'Two oblique gates already pass linearly polarized light. Keep that reading and compare it with the much brighter path through a middle gate.',
      compare(d => linear(d) && d.noMiddle > 1e-6 && gap(d.angles[0], d.angles.at(-1)) < 89.99,
        (a, b) => a.mode !== b.mode && gap(a.sourceAngle, b.sourceAngle) <= 0.01 &&
          gap(a.angles[0], b.angles[0]) <= 0.01 && gap(a.angles.at(-1), b.angles.at(-1)) <= 0.01 &&
          [a, b].some(d => d.mode === 'three' && d.intensity - d.noMiddle >= 0.15))),
    hidden(6, 7, '把光源電場和兩道斜門一同轉過至少三分之一直角，接收器仍留著原本的明暗。', 'Turn the source field and both oblique gates together by at least a third of a right angle. The detector keeps the same partial light.',
      compare(d => linear(d) && d.mode === 'two' && d.intensity >= 0.1 && d.intensity <= 0.9,
        (a, b) => gap(a.sourceAngle, b.sourceAngle) >= 30 && near(a.intensity, b.intensity, 0.0001) &&
          a.angles.every((angle, i) => gap(b.angles[i] - angle, b.sourceAngle - a.sourceAngle) <= 0.01)), true),
    hidden(7, 7, '無偏振光斜照，倒影裡兩個分量明暗有別。檢偏片沿兩條互相垂直的對角線，各量到一半。', 'Oblique unpolarized light reflects with unequal components. Record half the reflected light on each of two perpendicular diagonals.',
      compare(d => unpolarizedReflection(d) && d.r.polarization > 0.1 && near(gap(d.analyzer, 0), 45, 0.02) &&
        near(d.analyzed / d.r.reflected, 0.5, 0.0004),
        (a, b) => sameMedia(a, b) && a.inc === b.inc && gap(a.analyzer, b.analyzer) >= 89.96)),
    hidden(8, 8, '只讓 s 光照向布魯斯特角。兩個折射率等比放大，再記一次，角度與倒影都不變。', 'Shine pure s light at Brewster’s angle. Scale both indices together and record again: the angle and reflected fraction stay fixed.',
      compare(d => d.mode === 'reflection' && d.incidentPol === 's' && d.brewster !== null && near(d.inc, d.brewster, 0.02),
        (a, b) => Math.abs(a.n1 - b.n1) >= 0.05 && a.n2 !== b.n2 &&
          near(a.n2 / a.n1, b.n2 / b.n1, 0.001) && near(a.inc, b.inc, 0.04) && near(a.r.rs, b.r.rs, 0.001))),
    hidden(9, 9, '沿斜斜的折射光原路折返，兩側介質互換；比對兩個角與窗上的兩道倒影。', 'Reverse an oblique refracted ray through the exchanged media. Compare the two angles and both reflected fractions.',
      compare(d => unpolarizedReflection(d) && d.n1 !== d.n2 && !d.r.totalInternal && d.r.angleT < 90 && d.inc >= 1,
        (a, b) => a.n1 === b.n2 && a.n2 === b.n1 && Math.max(a.inc, b.inc) >= 20 && Math.abs(a.inc - b.inc) > 0.04 &&
          near(a.inc, b.r.angleT, 0.02) && near(b.inc, a.r.angleT, 0.02) &&
          near(a.r.rs, b.r.rs, 0.0005) && near(a.r.rp, b.r.rp, 0.0005)), true),
    hidden(10, 10, '固定第一道門，末門明顯拉開兩種跨度；各自旋轉中間片，兩筆讀數都留住原光的四分之一。', 'Fix the first gate and choose two distinct outer spans. Adjust the middle gate to record a quarter of the original light at each span.',
      compare(d => filters(d, 'three', null) && gap(d.angles[0], d.angles[2]) >= 35 &&
        gap(d.angles[0], d.angles[2]) <= quarterSpan + 0.02 && near(d.intensity, 0.25, 0.0001),
        (a, b) => gap(a.angles[0], b.angles[0]) <= 0.01 &&
          Math.abs(gap(a.angles[0], a.angles[2]) - gap(b.angles[0], b.angles[2])) >= 15 &&
          near(a.intensity, b.intensity, 0.0001) && Math.abs(a.noMiddle - b.noMiddle) >= 0.10))
  ]);
})();
