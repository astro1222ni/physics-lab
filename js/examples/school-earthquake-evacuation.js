(function (root, factory) {
  const data = factory();
  if (typeof module === 'object' && module.exports) module.exports = data;
  else {
    root.LAB_EXAMPLE_DATA = root.LAB_EXAMPLE_DATA || {};
    root.LAB_EXAMPLE_DATA['school-earthquake-evacuation'] = data;
    root.LabExamples?.define('school-earthquake-evacuation', data);
  }
})(globalThis, function () {
  'use strict';
  return [
    { n: 1, q: ['兩座樓梯都開放。怎樣分配六班，才能讓操場早點名？', 'Both stairs are open. How can six classes reach roll call earlier?'],
      state: { closed: -1, routes: [0, 1, 1, 0, 0, 1] },
      concept: [['瓶頸會限制同一時刻能通過的人數。', 'A bottleneck limits simultaneous discharge.']],
      sol: [['先試各走最短路線，儲存基準，再讓部分班級改走另一梯。', 'Try the shortest routes, save a baseline, then reassign some classes.']] },
    { n: 2, q: ['西梯封閉，哪些班得改走東梯才能點完名？', 'The west stair is closed. Which classes need a new route for a full roll call?'],
      state: { closed: 0, routes: [0, 1, 1, 0, 0, 1] },
      concept: [['被封閉的路線無法通行。', 'A closed route carries no flow.']],
      sol: [['把原先走西梯的班級改派東梯，再比較全校疏散時間。', 'Reassign west-bound classes to the east stair, then compare the full assembly time.']] },
    { n: 3, q: ['震央距離只有 20 km。沒有倒數時，第一個動作是什麼？', 'The epicentre is only 20 km away. What comes first without a countdown?'],
      state: { distance: 20 },
      concept: [['近震可能在警報前就開始搖晃。', 'Nearby shaking can arrive before an alert.']],
      sol: [['感到搖晃就趴下、掩護、穩住，再等搖晃停止與疏散廣播。', 'When shaking starts, drop, cover and hold on. Wait for shaking to stop and for the evacuation announcement.']] }
  ];
});
