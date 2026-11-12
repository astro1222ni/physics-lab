/* missions/regression.js — 散布圖、相關係數與迴歸直線的任務（一般任務星星 = 等級；隱藏任務 = 等級 × 2）
 * 事件（js/regression.js 發出，都在使用者操作之後）：
 *   'pts'：點或設定改變（加點、拖曳放開、刪點、換資料、我的直線）。
 *          { n, r, m, c（迴歸直線 y = m x + c；不能算時 null）, mx, my, sse（最小的殘差平方和）, set（'default' | 'pos' | 'neg' | 'none' | 'I'–'IV' | 'empty' | 'edited'）,
 *            mine（我的直線開著時 { m, c, sse }，否則 null）, quad（二次擬合 { a, R2 } 或 null）, zview（標準化）, chal（挑戰中） }
 *   'add'：在圖上加了一個點。{ n（加之後）, before: { n, r, m, c }, after: { r, m, c } }
 *   'drag'：拖曳一個點放開。{ n, r0（開始拖之前的 r）, r1（放開後的 r） }
 *   'squares'：打開或關掉「殘差平方」。{ on, n }
 *   'dataset'：按了範例資料。{ set }
 *   'challenge'：猜相關係數，猜完一題。{ hit, guess, r, streak（連續猜中幾題） }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const near = function (v, want, tol) { return v != null && isFinite(v) && Math.abs(v - want) <= tol; };
  const pts = function (ev) { return ev.type === 'pts' && !ev.data.chal; };

  LabMission.register('regression', [
    {
      id: 'regression-1', level: 1,
      title: { zh: '點一個點', en: 'Plot a point' },
      desc: { zh: '在散布圖上點一下，加一個新的點。', en: 'Tap the scatter plot to add a new point.' },
      check: function (ev) { return ev.type === 'add'; }
    },
    {
      id: 'regression-2', level: 1,
      title: { zh: '殘差變成正方形', en: 'Residuals as squares' },
      desc: { zh: '打開「殘差平方」，看每個點的殘差畫成的正方形。', en: 'Turn on “Squared residuals” and look at the square drawn on each residual.' },
      check: function (ev) { return ev.type === 'squares' && ev.data.on && ev.data.n >= 2; }
    },
    {
      id: 'regression-3', level: 2,
      title: { zh: '強烈的正相關', en: 'Strong positive correlation' },
      desc: { zh: '至少 5 個點，讓相關係數 r ≥ 0.9。', en: 'With at least 5 points, make the correlation coefficient r ≥ 0.9.' },
      check: function (ev) { const d = ev.data; return pts(ev) && d.n >= 5 && d.r != null && d.r >= 0.9; }
    },
    {
      id: 'regression-4', level: 3,
      title: { zh: '強烈的負相關', en: 'Strong negative correlation' },
      desc: { zh: '至少 5 個點，讓相關係數 r ≤ −0.9。', en: 'With at least 5 points, make the correlation coefficient r ≤ −0.9.' },
      check: function (ev) { const d = ev.data; return pts(ev) && d.n >= 5 && d.r != null && d.r <= -0.9; }
    },
    {
      id: 'regression-5', level: 3,
      title: { zh: '看不出直線關係', en: 'No straight-line relation' },
      desc: { zh: '至少 6 個點，讓相關係數 |r| ≤ 0.05。', en: 'With at least 6 points, make |r| ≤ 0.05.' },
      check: function (ev) { const d = ev.data; return pts(ev) && d.n >= 6 && near(d.r, 0, 0.05); }
    },
    {
      id: 'regression-6', level: 4,
      title: { zh: '用手畫出最好的直線', en: 'The best line by hand' },
      desc: { zh: '至少 5 個點、|r| ≥ 0.3，打開「我的直線」，調斜率和截距，讓它的殘差平方和不超過最小值的 1.02 倍。', en: 'With at least 5 points and |r| ≥ 0.3, turn on “My line” and adjust its slope and intercept until its sum of squared residuals is at most 1.02 times the minimum.' },
      check: function (ev) {
        const d = ev.data;
        return pts(ev) && d.mine && d.n >= 5 && d.r != null && Math.abs(d.r) >= 0.3 && d.mine.sse <= 1.02 * d.sse + 1e-9;
      }
    },
    {
      id: 'regression-7', level: 3,
      title: { zh: '安斯康姆四重奏', en: 'Anscombe’s quartet' },
      desc: { zh: '把四組安斯康姆資料（I、II、III、IV）都打開看一次，比較它們的 r 和迴歸直線。', en: 'Open all four Anscombe data sets (I, II, III and IV) and compare their r and regression lines.' },
      check: function (ev, mem) {
        if (ev.type !== 'dataset' || ['I', 'II', 'III', 'IV'].indexOf(ev.data.set) < 0) return false;
        mem.seen = mem.seen || {}; mem.seen[ev.data.set] = true;
        return Object.keys(mem.seen).length === 4;
      }
    },
    {
      id: 'regression-8', level: 5,
      title: { zh: '一個離群值', en: 'One outlier' },
      desc: { zh: '至少 8 個點、r ≥ 0.5 時，只拖曳一個點（拖一次），讓 r 掉到 0.1 以下。', en: 'With at least 8 points and r ≥ 0.5, drag a single point (one drag) so that r drops below 0.1.' },
      check: function (ev) { const d = ev.data; return ev.type === 'drag' && !d.chal && d.n >= 8 && d.r0 != null && d.r0 >= 0.5 && d.r1 != null && d.r1 < 0.1; }
    },
    {
      id: 'regression-9', level: 6,
      title: { zh: '排成一直線', en: 'All in a line' },
      desc: { zh: '至少 5 個點，而且都在同一條斜直線上：|r| ≥ 0.99999。打開「對齊格線」比較好排。', en: 'Put at least 5 points on one slanted straight line: |r| ≥ 0.99999. “Snap to grid” helps.' },
      check: function (ev) { const d = ev.data; return pts(ev) && d.n >= 5 && d.r != null && Math.abs(d.r) >= 0.99999; }
    },
    {
      id: 'regression-10', level: 6,
      title: { zh: '迴歸直線就是 y = x', en: 'The regression line is y = x' },
      desc: { zh: '至少 6 個點，點不能都在一條直線上（0.8 ≤ r ≤ 0.98），讓迴歸直線的斜率和 1 差不到 0.02、截距和 0 差不到 0.1。', en: 'With at least 6 points that are not all on a line (0.8 ≤ r ≤ 0.98), make the regression line’s slope within 0.02 of 1 and its intercept within 0.1 of 0.' },
      check: function (ev) {
        const d = ev.data;
        return pts(ev) && d.n >= 6 && d.r != null && d.r >= 0.8 && d.r <= 0.98 && near(d.m, 1, 0.02) && near(d.c, 0, 0.1);
      }
    },
    {
      id: 'regression-11', level: 5,
      title: { zh: '猜中相關係數', en: 'Guess the correlation' },
      desc: { zh: '按「出一題」，只看散布圖猜 r，誤差 0.05 以內算猜中。', en: 'Press “New challenge”, look at the scatter plot only and guess r to within 0.05.' },
      check: function (ev) { return ev.type === 'challenge' && ev.data.hit; }
    },
    {
      id: 'regression-12', level: 8,
      title: { zh: '連猜三中', en: 'Three in a row' },
      desc: { zh: '連續猜中三題相關係數（每題誤差 0.05 以內）。', en: 'Guess the correlation of three challenges in a row, each to within 0.05.' },
      check: function (ev) { return ev.type === 'challenge' && ev.data.hit && ev.data.streak >= 3; }
    },
    {
      id: 'regression-h1', level: 5, hidden: true,
      riddle: { zh: '排得整整齊齊的隊伍，卻說自己和誰都沒有關係。', en: 'A perfectly orderly line-up that claims to be related to nothing at all.' },
      check: function (ev) {
        // 點整齊地排在一條拋物線上（二次擬合 R² ≥ 0.999、真的彎），r 卻幾乎是 0
        const d = ev.data;
        return pts(ev) && d.n >= 5 && near(d.r, 0, 0.02) && d.quad && d.quad.R2 != null && d.quad.R2 >= 0.999 && Math.abs(d.quad.a) >= 0.05;
      }
    },
    {
      id: 'regression-h2', level: 6, hidden: true,
      riddle: { zh: '新客人入座，天平連晃都沒晃。', en: 'A new guest sits down and the scales do not even wobble.' },
      check: function (ev) {
        // 加一個點，迴歸直線與 r 幾乎都沒變：點要加在平均點 (x̄, ȳ) 附近（原本的點不能幾乎排成直線，否則加在直線上任何地方都行）
        const d = ev.data;
        if (ev.type !== 'add' || d.chal || !d.before || d.before.n < 4 || d.before.r == null || Math.abs(d.before.r) > 0.98 || d.after.r == null) return false;
        return near(d.after.m, d.before.m, 0.002) && near(d.after.c, d.before.c, 0.02) && near(d.after.r, d.before.r, 0.002);
      }
    }
  ]);
})();
