/* 每次觀測只提出一項問題。用原始結果判定，未完成掩護的演練不採計。 */
(function () {
  'use strict';
  const slug = 'school-earthquake-evacuation';
  const pair = (zh, en) => ({ zh, en });
  const num = n => Number.isFinite(n) ? (+n.toFixed(2)).toString() : '—';
  const rules = [];
  const instructions = {
    shelter: ['開始演練，依序完成三個掩護動作。', 'Start a drill and complete the three protective actions in order.'],
    roll: ['完成演練，在讀數頁記錄點名。', 'Finish a drill and record the roll call in Readings.'],
    stairs: ['完成演練，記錄兩座樓梯清空的時刻。', 'Finish a drill and record the stair clearance times.'],
    stairFlow: ['在讀數頁選一座樓梯出口，移動兩個游標再記錄斜率。', 'Choose a stair discharge in Readings, move the two cursors and record the slope.'],
    floors: ['完成演練，記錄各樓層到齊的時刻。', 'Finish a drill and record the floor arrival times.'],
    comparison: ['保存一輪為基準，再完成另一輪並比較。', 'Save one drill as a baseline, finish another, then compare.']
  };
  const rule = (test, report) => ({ test, report });
  const observed = (ok, zh, en, value, unit = '') => rule(ok, d => [zh + num(value(d)) + unit, en + num(value(d)) + unit]);
  const changed = (test, zh, en) => rule(test, d => [zh + '（這次改了 ' + d.changes + ' 項）', en + ' (' + d.changes + ' changed)']);
  function normal(n, level, title, desc, type, checks) {
    rules.push({ id: slug + '-' + n, level, title: pair(...title), desc: pair(...desc), needOn: [type],
      check: ev => ev.type === type && ev.data?.observed===true && checks.every(r => r.test(ev.data)),
      need(ctx) {
        const d = ctx.last(type);
        if (!d) return [[null, ...instructions[type]]];
        const missing = checks.filter(r => !r.test(d));
        return missing.length ? missing.map(r => [false, ...r.report(d)]) : [[true, '本次觀測符合條件。', 'This observation meets the conditions.']];
      } });
  }
  function hidden(n, level, zh, en, type, test) {
    rules.push({ id: slug + '-h' + n, level, hidden: true, needOn:[type], riddle: pair(zh, en),
      check: ev => ev.type === type && ev.data?.observed===true && test(ev.data) });
  }
  normal(1, 1, ['在搖晃前穩住', 'Ready before the shaking'], ['在有預警的演練中，趴下、掩護、穩住，讓三個動作都趕在搖晃之前。', 'In a drill with advance warning, drop, cover and hold on before shaking arrives.'], 'shelter', [
    observed(d => d.lead > 0 && d.margin > 0, '穩住時剩餘預警秒數 ', 'Warning time left on holding on: ', d => Math.max(0, d.margin), ' s')]);
  normal(2, 2, ['操場點名', 'Roll call on the field'], ['讓兩座開放的樓梯都分擔人流，全校在出發後 145 秒內到齊，記錄點名。', 'Use both open stairs and record a full roll call within 145 s of departure.'], 'roll', [
    observed(d => !d.closed && d.used === 2, '實際有人使用的樓梯數 ', 'Stairs carrying pupils: ', d => d.used),
    observed(d => d.complete && d.end <= 145, '本輪疏散秒數 ', 'Drill duration: ', d => d.end, ' s')]);
  normal(3, 3, ['一座樓梯也能到齊', 'One stair still gets everyone out'], ['封閉一座樓梯後重新分流，六班在 230 秒內完成點名。', 'With one stair closed, reroute all six classes and record a full roll call within 230 s.'], 'roll', [
    observed(d => d.closed, '封閉樓梯數 ', 'Closed stairs: ', d => Number(d.closed)),
    observed(d => d.complete && d.end <= 230, '本輪疏散秒數 ', 'Drill duration: ', d => d.end, ' s')]);
  normal(4, 4, ['兩梯接力收尾', 'Close finishes'], ['記錄兩座都有人的樓梯。讓最後一人先後離開兩梯，時間差在 5 秒以內。', 'Record two occupied stairs that clear at different times no more than 5 s apart.'], 'stairs', [
    observed(d => d.used === 2, '有通行紀錄的樓梯數 ', 'Stairs with traffic: ', d => d.used),
    observed(d => d.stairGap > 0 && d.stairGap <= 5, '清空時差 ', 'Clearance gap: ', d => d.stairGap, ' s')]);
  normal(5, 5, ['在樓梯出口量通量', 'Measure stair discharge'], ['在一座樓梯出口計數，取相隔至少 10 秒的兩點。使該處平均通過流率與該梯容量相差在 5% 以內。', 'Count at one stair discharge over at least 10 s. Measure mean throughput within 5% of that stair’s capacity.'], 'stairFlow', [
    observed(d => d.dt >= 10, '兩點時間間隔 ', 'Cursor span: ', d => d.dt, ' s'),
    observed(d => d.slope > 0 && d.error <= .05, '流率相對差 ', 'Relative flow difference: ', d => d.error * 100, '%')]);
  normal(6, 6, ['多走一點，早點到齊', 'Walk farther, finish sooner'], ['先保存各班走最短路線的基準。只改班級分流，讓全校疏散時間縮短至少 20%。', 'Save a baseline using each class’s shortest route. Change only the assignments to reduce total time by at least 20%.'], 'comparison', [
    changed(d => d.priorShortest && d.key === 'routes', '基準要走最短路線，這輪只比較分流。', 'Use a shortest-route baseline and compare assignments alone.'),
    observed(d => d.gain >= .2, '疏散時間縮短比例 ', 'Time reduction: ', d => d.gain * 100, '%')]);
  normal(7, 7, ['越急越慢', 'Hurrying costs time'], ['以有秩序的隊伍為基準。只換成推擠情境，找出全校反而更晚到齊的一對紀錄。', 'Save an orderly baseline. Change only to crowd pushing and find a pair where roll call finishes later.'], 'comparison', [
    changed(d => d.pushAdded, '兩輪只比較秩序與推擠。', 'Compare orderly movement with pushing alone.'),
    observed(d => d.delta > 0, '本輪比基準多用 ', 'Extra time this run: ', d => d.delta, ' s')]);
  normal(8, 8, ['樓上的最後一班', 'The upstairs tail'], ['三樓第一人比二樓晚到。調整分流，讓三樓最後一人仍能在二樓到齊後 5 秒內抵達。記錄樓層。', 'The first arrival from floor 3 is later. Route its last pupil to arrive within 5 s after floor 2 is complete. Record the floors.'], 'floors', [
    observed(d => d.firstGap > 0, '兩樓首位到達時差 ', 'First-arrival gap: ', d => d.firstGap, ' s'),
    observed(d => d.floorGap >= 0 && d.floorGap <= 5, '三樓比二樓晚到齊 ', 'Floor 3 finishes later by: ', d => d.floorGap, ' s')]);
  normal(9, 9, ['改建要找對地方', 'Widen the limiting stair'], ['保存基準，只加寬其中一座樓梯，讓六班到齊時間縮短至少一成。', 'Save a baseline. Widen only one stair to cut full assembly time by at least 10%.'], 'comparison', [
    changed(d => ['west', 'east'].includes(d.key) && d.widthDelta > 0, '只比較一座樓梯的加寬效果。', 'Isolate the widening of one stair.'),
    observed(d => d.gain >= .1, '疏散時間縮短比例 ', 'Time reduction: ', d => d.gain * 100, '%')]);
  normal(10, 10, ['同一刻點完名', 'No change at roll call'], ['固定人數、路線和通道，只提高期望步速。找出有無推擠在同一個半秒時格點完名的一對紀錄。', 'Keep enrolment, routes and passages fixed and increase only desired speed. Find a pair in which orderly and pushing runs finish on the same half-second tick.'], 'comparison', [
    changed(d => d.pushAdded, '基準有秩序，這輪只比較推擠。', 'Use an orderly baseline and change only to pushing.'),
    observed(d => d.delta === 0, '兩輪到齊時差 ', 'Assembly time difference: ', d => d.delta, ' s')]);
  hidden(1, 3, '桌腳還在手心，鈴聲卻沒能跑在地面前面。', 'A desk leg in your hand; the bell could not outrun the ground.', 'shelter', d => d.blind && d.shaking);
  hidden(2, 3, '點名簿已經寫滿，筆尖還在往右走。', 'The roll is full; the pencil keeps travelling right.', 'measure', d => d.dt >= 5 && d.n0 === d.total && d.n1 === d.n0);
  hidden(3, 4, '操場在等第一個腳印，時鐘照樣往前。', 'The clock moves while the field awaits its first footprint.', 'measure', d => d.dt >= 5 && d.n1 === 0);
  hidden(4, 8, '兩道扶手上，最後的回音落在同一拍。', 'The last echoes from two handrails land on one beat.', 'stairs', d => d.used === 2 && d.stairGap === 0);
  hidden(5, 7, '樓上的點名簿先闔上，樓下還有一個空格。', 'The upstairs roll closes while a downstairs name is still missing.', 'floors', d => d.floorGap < 0);
  hidden(6, 7, '走廊多出一點肩膀的空間，鐘面卻停在老地方。', 'Elbows gain room in the hallway; the clock stops at its old mark.', 'comparison', d => d.key === 'corridor' && d.widthDelta > 0 && d.delta === 0);
  hidden(7, 9, '沿著鉛筆線拾級而上，每段都聽見同樣多的腳步。', 'Along the pencil line, each interval echoes with the same number of footsteps.', 'intervals', d => d.channel==='field' && d.dt >= 20 && d.equal);
  hidden(8, 6, '門框往外移，操場的最後一個腳印還是準時落下。', 'The frame grows wider. The last footprint arrives on its old beat.', 'comparison', d => d.key === 'door' && d.widthDelta > 0 && d.delta === 0);
  hidden(9, 5, '一邊的欄杆收滿掌心，另一邊仍舊安靜。', 'One rail knows every palm. The other stays silent.', 'stairs', d => !d.closed && d.used === 1 && d.peak > 1);
  hidden(10, 10, '六班合計省了鞋底，卻多等了一段鐘聲。', 'Together the classes save shoe leather, but wait longer for the last bell.', 'comparison', d => d.key === 'routes' && d.meanDelta < -1e-9 && d.delta > 0);
  window.LabMission?.register(slug, rules);
})();
