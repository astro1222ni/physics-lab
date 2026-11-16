/* 自學的可驗證資料：物理量與題圖全部呼叫既有核心，不另造電場。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./equipotential-core.js'));
  else root.EquipotentialStudyCore = factory(root.EquipotentialCore);
})(typeof window !== 'undefined' ? window : this, function (C) {
  'use strict';
  const base = { type: 'circles', d: 14, a: 0.75, L: 20, V0: 6, medium: 'paper', ac: false, noise: false };
  let cached;
  function facts() {
    if (cached) return cached;
    const s = C.solve(base), contour = {};
    [1, 2, 3, 4, 5].forEach(v => { contour[v] = C.contour(s, v); });
    cached = { sol: s, contour, A: C.fieldAt(s, 15, 10).E, B: C.fieldAt(s, 9.5, 10).E,
      VA: C.potentialAt(s, 15, 10), VB: C.potentialAt(s, 9.5, 10),
      edge2: contour[2][0].pts[0][0], closed1: contour[1][0].closed, closed5: contour[5][0].closed };
    return cached;
  }
  /** 題目給定的量測線，與學生親手記錄分開；採等弧長取點，避免平滑後失真。 */
  function givenRecords(config, levels) {
    const s = C.solve(config), recs = [];
    levels.forEach(v => {
      const line = C.contour(s, v).sort((a, b) => b.pts.length - a.pts.length)[0];
      if (!line) return;
      const pts = line.pts, n = Math.min(48, pts.length - 1), distances = [0];
      for (let i = 1; i < pts.length; i++) distances.push(distances[i-1] + Math.hypot(pts[i][0]-pts[i-1][0], pts[i][1]-pts[i-1][1]));
      for (let k = 0; k < n; k++) {
        const target = distances.at(-1) * k / (line.closed ? n : n-1);
        let i = 1; while (i < distances.length-1 && distances[i] < target) i++;
        const t = (target-distances[i-1]) / (distances[i]-distances[i-1] || 1);
        const x = pts[i-1][0] + t*(pts[i][0]-pts[i-1][0]), y = pts[i-1][1] + t*(pts[i][1]-pts[i-1][1]);
        recs.push({ x,y,xt:x,yt:y,n1x:config.type==='bars'?15+config.d/2:22,n1y:10,clip:true,V1:0,V2:v,dV:v,reading:v,lineReading:v,text:v.toFixed(2)+' V',meter:'dmm',given:true });
      }
    });
    return recs;
  }
  return { base, facts, givenRecords };
});
