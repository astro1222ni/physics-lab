/* missions/newton-second.js — 牛頓第二定律（力學車實驗）的任務（星星數 = 等級 1–10） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/newton-second.js 發出；SI 單位，角度 thDeg 用度）：
  //   run：每次放開小車、跑完（撞上擋板、中途停下或拉不動）之後
  //        { attached, M, m（取下時為 0）, Mtot, mu, thDeg, tanTheta, mystery, mysteryId, v0, a（理論加速度）, T, W（mg）, f,
  //          freq, noise, moved, reachedEnd, stopped, xEnd, vEnd, tEnd, aMeas（紙帶 v–t 斜率）, intercept, r2,
  //          nStrips（用來擬合的紙條數）, nDots, N, tau }
  //   recut：跑完後改變每條紙條的間隔數 N（同一條紙帶重新剪）；欄位同 run
  //   series：圖表加入一點或切換橫軸 { exp: 1 | 2, axis: 'F' | 'm' | 'inv' | 'invM', n,
  //           points: [{ M, m, Mtot, F, a（紙帶量得）, mu, thDeg, mystery, mysteryId, noise }] }
  const EPS = 1e-9;
  const G = 9.8, D = 0.5;
  const fit = function (xs, ys) { return window.NewtonSecondCore.fitLine(xs, ys); };
  const same = function (pts, key) { return pts.every(function (p) { return Math.abs(p[key] - pts[0][key]) <= 5e-4; }); };
  const spread = function (vals) { return Math.max.apply(null, vals) / Math.min.apply(null, vals); };
  const ran = function (ev) { return ev.type === 'run' && ev.data.moved; };

  LabMission.register('newton-second', [
    {
      id: 'newton-second-1', level: 1,
      title: { zh: '第一條紙帶', en: 'Your first tape' },
      desc: { zh: '掛上吊掛物、放開小車，讓它一路跑到擋板。', en: 'With the hanging mass on, release the cart and let it run all the way to the end stop.' },
      check: function (ev) { return ran(ev) && ev.data.attached && ev.data.reachedEnd; }
    },
    {
      id: 'newton-second-2', level: 2,
      title: { zh: '換一台計時器', en: 'A different timer' },
      desc: { zh: '改用 50 Hz 的打點計時器，讓每條紙條仍然代表 0.1 s，並剪出至少 8 條紙條。', en: 'Switch to a 50 Hz ticker timer, still make every strip stand for 0.1 s, and cut at least 8 strips.' },
      check: function (ev) {
        const d = ev.data;
        return (ev.type === 'run' || ev.type === 'recut') && d.moved && d.freq === 50 && d.N === 5 && d.nStrips >= 8;
      }
    },
    {
      id: 'newton-second-3', level: 3,
      title: { zh: '正好 1 m/s²', en: 'Exactly 1 m/s²' },
      desc: { zh: '掛著吊掛物跑到擋板，讓紙帶量得的加速度是 1.00 m/s²（誤差 ±0.01 m/s²）。', en: 'With the hanging mass on, make the acceleration measured from the tape 1.00 m/s² (±0.01 m/s²).' },
      check: function (ev) {
        const d = ev.data;
        return ran(ev) && d.attached && d.reachedEnd && d.nStrips >= 3 && Math.abs(d.aMeas - 1) <= 0.01;
      }
    },
    {
      id: 'newton-second-4', level: 3,
      title: { zh: '平衡摩擦力', en: 'Balance the friction' },
      desc: { zh: '在有摩擦的軌道上（μ ≥ 0.010），取下吊掛物、推一下小車，讓它等速跑到擋板：紙帶量得 |a| ≤ 0.01 m/s²。', en: 'On a track with friction (μ ≥ 0.010), take the hanging mass off and push the cart so that it runs to the end stop at constant velocity: |a| ≤ 0.01 m/s² from the tape.' },
      check: function (ev) {
        const d = ev.data;
        return ran(ev) && !d.attached && d.reachedEnd && d.mu >= 0.01 - EPS && d.nStrips >= 3 && Math.abs(d.aMeas) <= 0.01;
      }
    },
    {
      id: 'newton-second-5', level: 4,
      title: { zh: '近似成立的時候', en: 'When T ≈ mg holds' },
      desc: { zh: '掛著吊掛物跑到擋板，讓繩張力 T 與吊掛物重量 mg 相差不到 2%，而且紙帶量得的加速度至少 0.15 m/s²。', en: 'With the hanging mass on, run to the end stop so that the string tension T is within 2% of the hanging weight mg, with an acceleration of at least 0.15 m/s² from the tape.' },
      check: function (ev) {
        const d = ev.data;
        return ran(ev) && d.attached && d.reachedEnd && d.nStrips >= 3 && d.T >= 0.98 * d.W && d.aMeas >= 0.15;
      }
    },
    {
      id: 'newton-second-6', level: 5,
      title: { zh: '彎下去的 a–F 圖', en: 'The bending a–F graph' },
      desc: { zh: '在實驗一的圖上，所有點的小車質量 M 都相同、只改變吊掛物 m，取至少 5 點，而且拉力最大的那一點，加速度比課本近似 mg/M 小 25% 以上。', en: 'In Experiment 1, keep the cart mass M the same for every point and change only the hanging mass m. Get at least 5 points, with the largest-force point at least 25% below the textbook approximation mg/M.' },
      check: function (ev) {
        if (ev.type !== 'series' || ev.data.exp !== 1) return false;
        const pts = ev.data.points;
        if (pts.length < 5 || !same(pts, 'M')) return false;
        const top = pts.reduce(function (b, p) { return p.F > b.F ? p : b; }, pts[0]);
        return top.a <= 0.75 * top.F / top.M;
      }
    },
    {
      id: 'newton-second-7', level: 6,
      title: { zh: '通過原點', en: 'Through the origin' },
      desc: { zh: '在有摩擦的軌道上（μ ≥ 0.010）做實驗一：總質量 M + m 固定、至少 5 點、最大拉力至少是最小拉力的 3 倍，a–F 最佳直線的截距在 ±0.01 m/s² 內，r² ≥ 0.999。', en: 'On a track with friction (μ ≥ 0.010), do Experiment 1 with the total mass M + m fixed: at least 5 points, the largest force at least 3 times the smallest, and an a–F best-fit line with intercept within ±0.01 m/s² and r² ≥ 0.999.' },
      check: function (ev) {
        if (ev.type !== 'series' || ev.data.exp !== 1) return false;
        const pts = ev.data.points;
        if (pts.length < 5 || !same(pts, 'Mtot') || !pts.every(function (p) { return p.mu >= 0.01 - EPS; })) return false;
        const F = pts.map(function (p) { return p.F; });
        if (spread(F) < 3 - EPS) return false;
        const f = fit(F, pts.map(function (p) { return p.a; }));
        return !!f && Math.abs(f.intercept) <= 0.01 && f.r2 >= 0.999;
      }
    },
    {
      id: 'newton-second-8', level: 6,
      title: { zh: '神秘軌道', en: 'The mystery track' },
      desc: { zh: '開啟「未知摩擦的軌道」並平衡它的摩擦力：取下吊掛物、推一下小車，跑到擋板時紙帶量得 |a| ≤ 0.005 m/s²。', en: 'Turn on the mystery track and balance its friction: with the hanging mass off, push the cart to the end stop with |a| ≤ 0.005 m/s² from the tape.' },
      check: function (ev) {
        const d = ev.data;
        return ran(ev) && d.mystery && !d.attached && d.reachedEnd && d.nStrips >= 3 && Math.abs(d.aMeas) <= 0.005;
      }
    },
    {
      id: 'newton-second-9', level: 7,
      title: { zh: '質量的倒數', en: 'One over the mass' },
      desc: { zh: '在有摩擦的軌道上（μ ≥ 0.010）做實驗二：吊掛物質量 m 固定、至少 5 點、最大的 M + m 至少是最小的 2 倍，a 對 1/(M + m) 的最佳直線截距在 ±0.01 m/s² 內，r² ≥ 0.999。', en: 'On a track with friction (μ ≥ 0.010), do Experiment 2 with the hanging mass m fixed: at least 5 points, the largest M + m at least twice the smallest, and a best-fit line of a against 1/(M + m) with intercept within ±0.01 m/s² and r² ≥ 0.999.' },
      check: function (ev) {
        if (ev.type !== 'series' || ev.data.exp !== 2) return false;
        const pts = ev.data.points;
        if (pts.length < 5 || !same(pts, 'm') || !pts.every(function (p) { return p.mu >= 0.01 - EPS; })) return false;
        if (spread(pts.map(function (p) { return p.Mtot; })) < 2 - EPS) return false;
        const f = fit(pts.map(function (p) { return 1 / p.Mtot; }), pts.map(function (p) { return p.a; }));
        return !!f && Math.abs(f.intercept) <= 0.01 && f.r2 >= 0.999;
      }
    },
    {
      id: 'newton-second-10', level: 8,
      title: { zh: '用小車量 g', en: 'Measure g with a cart' },
      desc: { zh: '在有摩擦的軌道上（μ ≥ 0.020）做實驗一：總質量固定、至少 4 點，以 m 為橫軸，用「斜率 × (M + m)」求出 g，與 9.8 m/s² 相差不到 0.5%。', en: 'On a track with friction (μ ≥ 0.020), do Experiment 1 with the total mass fixed and at least 4 points. With m on the horizontal axis, find g = slope × (M + m), within 0.5% of 9.8 m/s².' },
      check: function (ev) {
        if (ev.type !== 'series' || ev.data.exp !== 1 || ev.data.axis !== 'm') return false;
        const pts = ev.data.points;
        if (pts.length < 4 || !same(pts, 'Mtot') || !pts.every(function (p) { return p.mu >= 0.02 - EPS; })) return false;
        const f = fit(pts.map(function (p) { return p.m; }), pts.map(function (p) { return p.a; }));
        return !!f && Math.abs(f.slope * pts[0].Mtot / G - 1) <= 0.005;
      }
    },
    {
      id: 'newton-second-11', level: 9,
      title: { zh: '剛好一秒', en: 'One second flat' },
      desc: { zh: '在「未知摩擦的軌道」上、軌道不墊高（θ = 0），掛著吊掛物，讓小車從放開到撞上擋板恰好 1.00 s（±0.01 s）。', en: 'On the mystery track, with the track level (θ = 0) and the hanging mass on, make the cart reach the end stop exactly 1.00 s after release (±0.01 s).' },
      check: function (ev) {
        const d = ev.data;
        return ran(ev) && d.mystery && d.attached && Math.abs(d.thDeg) < EPS && d.reachedEnd && Math.abs(d.tEnd - 1) <= 0.01;
      }
    },
    {
      id: 'newton-second-12', level: 10,
      title: { zh: '大師：神秘軌道上的 g', en: 'Master: g on the mystery track' },
      desc: { zh: '在同一條「未知摩擦的軌道」上（中途不重開）做實驗一：總質量固定、至少 5 點、最大拉力至少是最小的 2 倍，以 m 為橫軸用「斜率 × (M + m)」求出 g，與 9.8 m/s² 相差不到 0.2%。', en: 'On one and the same mystery track (do not switch it off and on), do Experiment 1 with the total mass fixed: at least 5 points, the largest force at least twice the smallest. With m on the horizontal axis, find g = slope × (M + m) within 0.2% of 9.8 m/s².' },
      check: function (ev) {
        if (ev.type !== 'series' || ev.data.exp !== 1 || ev.data.axis !== 'm') return false;
        const pts = ev.data.points;
        if (pts.length < 5 || !same(pts, 'Mtot')) return false;
        if (!pts.every(function (p) { return p.mystery && p.mysteryId === pts[0].mysteryId; })) return false;
        if (spread(pts.map(function (p) { return p.F; })) < 2 - EPS) return false;
        const f = fit(pts.map(function (p) { return p.m; }), pts.map(function (p) { return p.a; }));
        return !!f && Math.abs(f.slope * pts[0].Mtot / G - 1) <= 0.002;
      }
    },
    // ---------- 隱藏任務：只給隱晦的提示 ----------
    {
      id: 'newton-second-h1', level: 3, hidden: true,
      riddle: { zh: '線拉得緊緊的，紙帶卻只記得同一個地方。', en: 'The string is taut, yet the tape remembers only one place.' },
      check: function (ev) { return ev.type === 'run' && ev.data.attached && !ev.data.moved; }
    },
    {
      id: 'newton-second-h2', level: 5, hidden: true,
      riddle: { zh: '桌上的旅人忘了自己躺在桌上，幾乎跟得上窗外的雨滴。', en: 'The traveller forgets the table beneath it and almost keeps pace with the raindrops outside.' },
      check: function (ev) {
        const d = ev.data;
        return ran(ev) && d.attached && d.reachedEnd && d.nStrips >= 3 && d.aMeas >= 0.7 * G;
      }
    },
    {
      id: 'newton-second-h3', level: 7, hidden: true,
      riddle: { zh: '最溫柔的抵達：走到盡頭，卻沒有驚動任何人。', en: 'The gentlest arrival: it reaches the very end without disturbing anyone.' },
      check: function (ev) {
        const d = ev.data;
        return ran(ev) && !d.attached && d.v0 > 0 && d.a < 0 && d.stopped && D - d.xEnd <= 0.005;
      }
    }
  ]);
})();
