/* missions/lines-circles.js — 直線與圓的任務（一般任務星星 = 等級；隱藏任務 = 等級 × 2）
 * 事件（js/lines-circles.js 發出，都在使用者操作之後）：
 *   'line'：「直線與圓」模式的設定改變。{ a, b, c（直線 ax + by + c = 0）, h, k, r（圓）, d（圓心到直線的距離）, rel（'apart' | 'tangent' | 'cross'）,
 *           chord（弦長；沒有相交時 null）, pts（交點）, foot（垂足）, disc（代入後的判別式）, chal（挑戰中） }
 *   'tan'：「過一點作切線」模式的設定改變。{ px, py, h, k, r, L（P 到圓心）, len（切線長）, angle（兩切線夾角，度）, on（P 在圓上）, inside }
 *   'drag'：在圖上拖曳放開。{ what（'center' | 'radius' | 'line' | 'P'） }
 *   'challenge'：挑戰答對一題。{ time（秒）, streak（連續答對幾題）, last3（最近三題總秒數，不到三題為 null） }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const near = function (v, want, tol) { return v != null && isFinite(v) && Math.abs(v - want) <= tol; };
  const slanted = function (d) { return Math.abs(d.a) > 1e-9 && Math.abs(d.b) > 1e-9; };
  const line = function (ev) { return ev.type === 'line' && !ev.data.chal; };

  LabMission.register('lines-circles', [
    {
      id: 'lines-circles-1', level: 1,
      title: { zh: '搬動圓', en: 'Move the circle' },
      desc: { zh: '在圖上拖曳圓心或圓周上的把手，移動圓或改變半徑。', en: 'Drag the centre or the handle on the circle to move it or change its radius.' },
      check: function (ev) { return ev.type === 'drag' && (ev.data.what === 'center' || ev.data.what === 'radius'); }
    },
    {
      id: 'lines-circles-2', level: 2,
      title: { zh: '畫一條直徑', en: 'Draw a diameter' },
      desc: { zh: '讓一條斜的直線（a、b 都不是 0）通過圓心：圓心到直線的距離 0.01 以內。', en: 'Make a slanted line (a and b both nonzero) pass through the centre: distance from the centre within 0.01.' },
      check: function (ev) { const d = ev.data; return line(ev) && slanted(d) && d.d != null && d.d <= 0.01; }
    },
    {
      id: 'lines-circles-3', level: 3,
      title: { zh: '剛好相切', en: 'Just touching' },
      desc: { zh: '讓一條斜的直線（a、b 都不是 0）和圓相切：距離 d 和半徑 r 差不到 0.005。', en: 'Make a slanted line (a and b both nonzero) tangent to the circle: d within 0.005 of r.' },
      check: function (ev) { const d = ev.data; return line(ev) && slanted(d) && d.rel === 'tangent'; }
    },
    {
      id: 'lines-circles-4', level: 4,
      title: { zh: '三種關係', en: 'All three cases' },
      desc: { zh: '同一個圓（不移動圓）上，讓直線依序或任意順序出現相離、相切、相交兩點三種情形。', en: 'Without moving the circle, make the line miss it, touch it and cut it (in any order).' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!line(ev) || !d.rel) return false;
        const key = d.h + ',' + d.k + ',' + d.r;
        if (mem.key !== key) { mem.key = key; mem.seen = {}; }
        mem.seen[d.rel] = true;
        return !!(mem.seen.apart && mem.seen.tangent && mem.seen.cross);
      }
    },
    {
      id: 'lines-circles-5', level: 4,
      title: { zh: '弦長 8', en: 'A chord of length 8' },
      desc: { zh: '半徑 5 的圓，讓直線切出長度 8 的弦（誤差 0.02 以內）。', en: 'With a circle of radius 5, make the line cut off a chord of length 8 (within 0.02).' },
      check: function (ev) { const d = ev.data; return line(ev) && near(d.r, 5, 1e-9) && near(d.chord, 8, 0.02); }
    },
    {
      id: 'lines-circles-6', level: 3,
      title: { zh: '切線長 4', en: 'Tangent length 4' },
      desc: { zh: '在「過一點作切線」模式，半徑 3 的圓，讓 P 的切線長是 4（誤差 0.02 以內）。', en: 'In “Tangents from a point” mode, with a circle of radius 3, make the tangent length from P equal to 4 (within 0.02).' },
      check: function (ev) { const d = ev.data; return ev.type === 'tan' && near(d.r, 3, 1e-9) && near(d.len, 4, 0.02); }
    },
    {
      id: 'lines-circles-7', level: 5,
      title: { zh: '兩條切線互相垂直', en: 'Perpendicular tangents' },
      desc: { zh: '讓從 P 出發的兩條切線夾角是 90°（誤差 0.2° 以內）。', en: 'Make the two tangents from P meet at 90° (within 0.2°).' },
      check: function (ev) { const d = ev.data; return ev.type === 'tan' && !d.on && near(d.angle, 90, 0.2); }
    },
    {
      id: 'lines-circles-8', level: 5,
      title: { zh: '只剩一條切線', en: 'Only one tangent' },
      desc: { zh: '把 P 放在圓上（P 到圓心的距離和半徑差不到 0.005），而且 P 不在通過圓心的水平線或鉛直線上。', en: 'Put P on the circle (its distance from the centre within 0.005 of r), but not on the horizontal or vertical line through the centre.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'tan' && d.on && Math.abs(d.px - d.h) > 0.05 && Math.abs(d.py - d.k) > 0.05;
      }
    },
    {
      id: 'lines-circles-9', level: 6,
      title: { zh: '切在 (3, 4)', en: 'Touching at (3, 4)' },
      desc: { zh: '圓 x² + y² = 25（圓心在原點、半徑 5），讓直線和圓相切在點 (3, 4)（切點誤差 0.02 以內）。', en: 'For the circle x² + y² = 25 (centre at the origin, radius 5), make the line touch it at the point (3, 4) (within 0.02).' },
      check: function (ev) {
        const d = ev.data;
        return line(ev) && near(d.h, 0, 1e-9) && near(d.k, 0, 1e-9) && near(d.r, 5, 1e-9) && d.rel === 'tangent' && d.foot && near(d.foot[0], 3, 0.02) && near(d.foot[1], 4, 0.02);
      }
    },
    {
      id: 'lines-circles-10', level: 6,
      title: { zh: '整數交點', en: 'Whole-number crossings' },
      desc: { zh: '讓一條斜的直線（a、b 都不是 0、不通過圓心）和圓相交兩點，而且兩個交點的坐標都是整數。', en: 'Make a slanted line (a and b nonzero, not through the centre) cut the circle at two points whose coordinates are all whole numbers.' },
      check: function (ev) {
        const d = ev.data;
        if (!line(ev) || !slanted(d) || d.rel !== 'cross' || !d.pts || d.pts.length !== 2 || !(d.d >= 0.1)) return false;
        return d.pts.every(function (p) { return near(p[0], Math.round(p[0]), 0.005) && near(p[1], Math.round(p[1]), 0.005); });
      }
    },
    {
      id: 'lines-circles-11', level: 5,
      title: { zh: '挑戰一題', en: 'One challenge' },
      desc: { zh: '按「出一題」，只調 c，讓直線和圓相切。', en: 'Press “New challenge” and adjust only c to make the line tangent to the circle.' },
      check: function (ev) { return ev.type === 'challenge'; }
    },
    {
      id: 'lines-circles-12', level: 8,
      title: { zh: '三連發', en: 'Three in a row' },
      desc: { zh: '連續答對三題挑戰，三題合計 90 秒以內。', en: 'Solve three challenges in a row, in 90 seconds or less in total.' },
      check: function (ev) { return ev.type === 'challenge' && ev.data.last3 != null && ev.data.last3 <= 90; }
    },
    {
      id: 'lines-circles-h1', level: 3, hidden: true,
      riddle: { zh: '走得越遠，兩條路看起來越像同一條。', en: 'The farther you walk, the more the two roads look like one.' },
      check: function (ev) { const d = ev.data; return ev.type === 'tan' && !d.on && !d.inside && d.angle != null && d.angle <= 10; }
    },
    {
      id: 'lines-circles-h2', level: 5, hidden: true,
      riddle: { zh: '一刀切下去，切口和半徑一樣長。', en: 'One cut, and the cut is exactly as long as the radius.' },
      check: function (ev) { const d = ev.data; return line(ev) && d.r >= 1 && d.chord != null && near(d.chord, d.r, 0.01); }
    }
  ]);
})();
