/* missions/magnetic-particle.js — 帶電粒子在磁場中運動的任務（星星數 = 等級 1–10）
 *
 * 事件（js/magnetic-particle.js 在使用者按「發射」後的動畫中回報；改任何滑桿粒子都會回到起點，所以一發之內設定不變）：
 *   每個事件都帶有這一發的設定：
 *     q（e）, m（u）, v（10^5 m/s）, B（mT，正＝射出紙面）, E（kV/m）, theta（v 與 B 夾角，度）, ang（紙面內發射方向，度）,
 *     region（是否只有右半邊有場）, x0, y0（出發點 cm）,
 *     r（cm，mv⊥/|q|B）, Tus（週期 μs）, pitch（螺距 cm，沿 +z 為正）, vd（E×B 漂移速率 m/s；B = 0 時為 null）
 *   'lap'：速度方向（v⊥）每轉滿一圈：n（第幾圈）, dir（+1 逆時針／−1 順時針）, tLap（轉滿第 n 圈的時刻 μs）, zLap（那時沿 B 的位移 cm）
 *   'cycle'：全空間有場時，每經過一個週期 T 的時刻：n, t（μs）, dx, dy, disp（離出發點的位移 cm）, vavg（平均速度 m/s）
 *   'region'：場區模式中，粒子由場外射入、再離開場區時：entryY, exitY（在邊界 x = 12 cm 上的進出位置 cm）, turnDeg（在場內轉過的角度，逆時針為正）, tField（μs）
 *   'exit'：粒子離開畫面（axis 'xy'）或沿 B 走超過 48 cm（axis 'z'）時：t（μs）, along（沿發射方向前進 cm）, maxDev（離發射直線最遠 cm）,
 *            disp（紙面內位移 cm）, z（cm）, turnDeg（速度轉過的總角度）
 */
(function () {
  'use strict';
  if (!window.LabMission) return;

  const near = function (a, b, tol) { return Math.abs(a - b) <= tol; };
  const rel = function (a, b, r) { return Math.abs(a - b) <= r * Math.max(Math.abs(a), Math.abs(b), 1e-12); };
  const same = function (a, b) { return Math.abs(a - b) < 1e-9; };
  const remember = function (mem, d, n) { (mem.list = mem.list || []).push(d); if (mem.list.length > (n || 16)) mem.list.shift(); return mem.list; };
  const pureB = function (d) { return d.E === 0 && d.q !== 0 && d.B !== 0; };
  // 場區模式、純磁場、垂直於 B 射入（質譜儀類任務）
  const spectro = function (ev) { const d = ev.data; return ev.type === 'region' && pureB(d) && d.theta === 90; };
  const sameShot = function (a, b) { return same(a.v, b.v) && same(a.B, b.B) && same(a.ang, b.ang) && same(a.x0, b.x0) && same(a.y0, b.y0); };

  // 用第一圈的實測軸向位移和週期比較斜射；排除沿軸與平面圓的退化解。
  function firstHelix(ev) {
    const d = ev.data;
    return ev.type === 'lap' && d.manualLaunch && d.n === 1 && pureB(d) && !d.region &&
      d.r > 0.1 && Math.abs(d.zLap) > 0.1;
  }
  // 比較相鄰的有效觀測；兩發可交換順序。
  function compareHelices(ev, mem, match) {
    if (!firstHelix(ev)) return false;
    const d = ev.data, old = mem.last;
    mem.last = d;
    if (!old || old.q !== d.q || old.m !== d.m || old.ang !== d.ang) return false;
    return match(old, d) || match(d, old);
  }
  // 初速可打到 0.01，俯仰角可打到 0.1 度；比例比較留 0.3% 給輸入取整。
  const scaled = (a, b) => rel(a, b, 0.003);

  LabMission.register('magnetic-particle', [
    {
      id: 'magnetic-particle-1', level: 1,
      title: { zh: '繞一圈', en: 'One full turn' },
      desc: { zh: '調整粒子或磁場設定，親自按發射或繼續，讓粒子在磁場中完整繞一圈。', en: 'Change a particle or field setting, press Launch or Resume and let it complete one full turn in the field.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'lap' && d.manualLaunch && d.n >= 1 - 1e-9 && (d.B !== 100 || d.q !== 2 || d.m !== 4 || d.v !== 3 || d.theta !== 90 || d.ang !== 0 || d.E !== 0 || d.region);
      }
    },
    {
      id: 'magnetic-particle-2', level: 2,
      title: { zh: '逆時針旋轉', en: 'Counterclockwise' },
      desc: { zh: '磁場維持射出紙面（B > 0），讓粒子逆時針繞完一整圈。', en: 'Keep the field pointing out of the page (B > 0) and make the particle go once around counterclockwise.' },
      check: function (ev) { const d = ev.data; return ev.type === 'lap' && d.n >= 1 && d.B > 0 && d.dir > 0; }
    },
    {
      id: 'magnetic-particle-3', level: 3,
      title: { zh: '半徑 5 公分', en: 'A 5 cm radius' },
      desc: { zh: '只有磁場（E = 0）、v 垂直於 B（θ = 90°），讓粒子繞一整圈，圓軌道半徑剛好 5.00 cm（誤差 ±0.05 cm）。', en: 'With only a magnetic field (E = 0) and v perpendicular to B (θ = 90°), complete a full circle whose radius is exactly 5.00 cm (±0.05 cm).' },
      check: function (ev) { const d = ev.data; return ev.type === 'lap' && pureB(d) && d.theta === 90 && near(d.r, 5, 0.05); }
    },
    {
      id: 'magnetic-particle-4', level: 4,
      title: { zh: '快慢一樣久', en: 'Fast or slow, same time' },
      desc: { zh: '只有磁場、θ = 90°，粒子（q、m）與 B 都不變，用兩個相差至少 2 倍的速率各繞一圈，比較兩次繞一圈所花的時間（相差 1% 內）。', en: 'With only a magnetic field and θ = 90°, keeping the particle (q, m) and B the same, complete one turn at two speeds at least a factor of 2 apart and compare the time each takes (within 1%).' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'lap' || d.n !== 1 || !pureB(d) || d.theta !== 90 || d.v <= 0) return false;
        return remember(mem, d).some(function (o) {
          return o !== d && same(o.q, d.q) && same(o.m, d.m) && same(o.B, d.B) && o.theta === 90 && o.E === 0 &&
            Math.max(o.v, d.v) >= 2 * Math.min(o.v, d.v) && rel(o.tLap, d.tLap, 0.01);
        });
      }
    },
    {
      id: 'magnetic-particle-5', level: 5,
      title: { zh: '速度選擇器', en: 'Velocity selector' },
      desc: { zh: '同時開電場與磁場（不用場區），讓速率至少 400 km/s（滑桿上的 4.0）的帶電粒子筆直穿越畫面：沿直線前進至少 20 cm 後離開畫面，偏離直線不超過 0.05 cm。', en: 'With both an electric and a magnetic field on (no field region), send a charged particle moving at least 400 km/s (4.0 on the slider) straight across the view: at least 20 cm along a straight line before leaving, never more than 0.05 cm off it.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'exit' && d.axis === 'xy' && d.q !== 0 && d.B !== 0 && d.E !== 0 && !d.region &&
          d.v >= 4 && d.along >= 20 && d.maxDev <= 0.05;
      }
    },
    {
      id: 'magnetic-particle-6', level: 5,
      title: { zh: '十圈三微秒', en: 'Ten turns in 3 μs' },
      desc: { zh: '只有磁場，讓粒子剛好在 t = 3.00 μs 時轉滿第 10 圈（誤差 ±0.02 μs）。', en: 'With only a magnetic field, make the particle finish its 10th turn at exactly t = 3.00 μs (±0.02 μs).' },
      check: function (ev) { const d = ev.data; return ev.type === 'lap' && d.n === 10 && pureB(d) && near(d.tLap, 3, 0.02); }
    },
    {
      id: 'magnetic-particle-7', level: 6,
      title: { zh: '轉個直角', en: 'A right-angle turn' },
      desc: { zh: '勾選「只有右半邊有場」、只有磁場、θ = 90°，讓粒子從左邊射入場區，離開場區時速度方向剛好轉了 90°（誤差 ±1°）。', en: 'Tick “Field only in the right half”, use only a magnetic field and θ = 90°, and fire the particle into the field region from the left so that it leaves with its velocity turned by exactly 90° (±1°).' },
      check: function (ev) { return spectro(ev) && near(Math.abs(ev.data.turnDeg), 90, 1); }
    },
    {
      id: 'magnetic-particle-8', level: 6,
      title: { zh: '靜止出發的漂移', en: 'Drifting from rest' },
      desc: { zh: '由靜止釋放（v = 0），開電場與磁場（不用場區），經過至少 3 個週期後，粒子的平均速度剛好是 300 km/s（誤差 1% 內）。', en: 'Release the particle from rest (v = 0) with both fields on (no field region) so that after at least 3 periods its average velocity is exactly 300 km/s (within 1%).' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'cycle' && d.n >= 3 && d.v === 0 && d.E !== 0 && rel(d.vavg, 3e5, 0.01);
      }
    },
    {
      id: 'magnetic-particle-9', level: 7,
      title: { zh: '質譜儀的盲點', en: 'The spectrometer’s blind spot' },
      desc: { zh: '場區模式、只有磁場、θ = 90°：用電荷與質量都不同的兩種粒子，以相同的速率、B、發射方向與出發點射入，讓兩者從同一點離開場區（相差 0.02 cm 內）。', en: 'Field region, magnetic field only, θ = 90°: with two particles that differ in both charge and mass, but the same speed, B, launch direction and starting point, make both leave the field region at the same point (within 0.02 cm).' },
      check: function (ev, mem) {
        if (!spectro(ev)) return false;
        const d = ev.data;
        return remember(mem, d).some(function (o) {
          return o !== d && sameShot(o, d) && !same(o.q, d.q) && !same(o.m, d.m) && near(o.exitY, d.exitY, 0.02);
        });
      }
    },
    {
      id: 'magnetic-particle-10', level: 8,
      title: { zh: '同位素分離', en: 'Separating isotopes' },
      desc: { zh: '場區模式、只有磁場、θ = 90°：電荷、速率、B、發射方向與出發點都相同，只改質量，讓兩發粒子離開場區的位置相距 4.00 cm（誤差 ±0.05 cm）。', en: 'Field region, magnetic field only, θ = 90°: keeping the charge, speed, B, launch direction and starting point the same and changing only the mass, make two shots leave the field region 4.00 cm apart (±0.05 cm).' },
      check: function (ev, mem) {
        if (!spectro(ev)) return false;
        const d = ev.data;
        return remember(mem, d).some(function (o) {
          return o !== d && sameShot(o, d) && same(o.q, d.q) && !same(o.m, d.m) && near(Math.abs(o.exitY - d.exitY), 4, 0.05);
        });
      }
    },
    {
      id: 'magnetic-particle-11', level: 9,
      title: { zh: '螺旋設計師', en: 'Helix designer' },
      desc: { zh: '只有磁場，讓粒子做螺旋運動並繞完一圈：螺旋半徑 2.00 cm（誤差 ±0.05 cm），每繞一圈沿 B 前進 10.0 cm（誤差 ±0.1 cm）。可切換 3D 檢視觀察。', en: 'With only a magnetic field, make the particle spiral and complete a turn: helix radius 2.00 cm (±0.05 cm) and 10.0 cm of travel along B per turn (±0.1 cm). Switch to the 3D view to watch.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'lap' && pureB(d) && near(d.r, 2, 0.05) && near(Math.abs(d.zLap) / d.n, 10, 0.1);
      }
    },
    {
      id: 'magnetic-particle-12', level: 10,
      title: { zh: '大師：擺線工程師', en: 'Master: cycloid engineer' },
      desc: { zh: '由靜止釋放（v = 0），開電場與磁場（不用場區），畫出至少 3 個拱：相鄰兩個尖點相距 4.00 cm（誤差 ±0.04 cm），而且平均速度至少 300 km/s。', en: 'Release the particle from rest (v = 0) with both fields on (no field region) and draw at least 3 arches: neighbouring cusps 4.00 cm apart (±0.04 cm), with an average velocity of at least 300 km/s.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'cycle' && d.n >= 3 && d.v === 0 && d.E !== 0 && near(d.disp / d.n, 4, 0.04) && d.vavg >= 3e5 * (1 - 1e-9);
      }
    },
    // ---------- 隱藏任務：只給隱晦的提示 ----------
    {
      id: 'magnetic-particle-h1', level: 3, hidden: true,
      riddle: { zh: '無牽無掛的旅人，穿過再強的風也不必轉彎。', en: 'A traveller with no ties crosses even the strongest wind without ever turning.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'exit' && d.axis === 'xy' && d.q === 0 && d.B !== 0 && d.v > 0 && d.along >= 10 && d.maxDev <= 0.01;
      }
    },
    {
      id: 'magnetic-particle-h2', level: 4, hidden: true,
      riddle: { zh: '與風同行的人，感覺不到風。', en: 'Whoever walks with the wind never feels the wind.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'exit' && d.axis === 'z' && pureB(d) && d.v > 0 &&
          Math.abs(d.r) <= 1e-9 && d.disp <= 0.01 + 1e-9;
      }
    },
    {
      id: 'magnetic-particle-h3', level: 7, hidden: true,
      riddle: { zh: '陰與陽各自旋舞，卻踏上同一條路。', en: 'Yin and yang each whirl their own way, yet set out on the same road.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'cycle' || d.n < 2 || d.v !== 0 || d.E === 0 || d.disp < 0.5) return false;
        return remember(mem, d).some(function (o) {
          return o !== d && o.n >= 2 && o.q === -d.q && same(o.m, d.m) && same(o.E, d.E) && same(o.B, d.B) &&
            (o.dx * d.dx + o.dy * d.dy) > 0.9 * o.disp * d.disp;
        });
      }
    },
    {
      id: 'magnetic-particle-h4', level: 3, hidden: true,
      riddle: { zh: '線軸上的一匝，剛好遮住自己的影子。', en: 'One turn hides its own shadow.' },
      desc: { zh: '斜射粒子在正 z 方向前進一個軌道直徑時，橫向恰好繞一圈。', en: 'In one turn the particle advances one orbit diameter along positive z.' },
      check: function (ev) {
        return firstHelix(ev) && scaled(ev.data.zLap, 2 * ev.data.r);
      }
    },
    {
      id: 'magnetic-particle-h5', level: 4, hidden: true,
      riddle: { zh: '倒著走的人，把較長的路留給影子。', en: 'Walking backwards, the traveller leaves the longer road to a shadow.' },
      desc: { zh: '一圈後沿負 z 的位移量為圓周長的一半，平行方向動能為垂直方向動能的四分之一。', en: 'The backward pitch is half the circumference, so axial kinetic energy is one quarter of transverse kinetic energy.' },
      check: function (ev) {
        return firstHelix(ev) && scaled(ev.data.zLap, -Math.PI * ev.data.r);
      }
    },
    {
      id: 'magnetic-particle-h6', level: 6, hidden: true,
      riddle: { zh: '門縫裡藏著一片蜂巢。', en: 'A sliver of honeycomb fits in the doorway.' },
      desc: { zh: '粒子在半平面磁場中轉過 60 度，進出口相隔 2.00 cm，這段弦長等於迴旋半徑。', en: 'In the half-plane field, bend through 60 degrees with entry and exit 2.00 cm apart. This chord equals the orbit radius.' },
      check: function (ev) {
        const d = ev.data;
        // 0.1 度輸入與場界積分留 0.4 度；速率末位與場界定位留 0.015 cm。
        return spectro(ev) && d.manualLaunch && near(Math.abs(d.turnDeg), 60, 0.4) &&
          near(Math.abs(d.exitY - d.entryY), 2, 0.015);
      }
    },
    {
      id: 'magnetic-particle-h7', level: 7, hidden: true,
      riddle: { zh: '井口只留下同一個圓，井壁卻記得方向。', en: 'The well mouth remembers one circle, its walls two directions.' },
      desc: { zh: '保持粒子、速率和磁場相同，以互補俯仰角各繞一圈，得到相同半徑與大小相等、方向相反的螺距。', en: 'At fixed speed and field, supplementary pitch angles give equal radii and opposite pitches.' },
      check: function (ev, mem) {
        return compareHelices(ev, mem, (a, b) => a.B === b.B && a.v === b.v &&
          near(a.theta + b.theta, 180, 0.051) && scaled(a.r, b.r) && scaled(a.zLap, -b.zLap));
      }
    },
    {
      id: 'magnetic-particle-h8', level: 8, hidden: true,
      riddle: { zh: '小小的拓印，連縱深都沒有遺漏。', en: 'Even the depth survives in the smaller print.' },
      desc: { zh: '保持斜射初速不變，把磁場加倍，驗證半徑、螺距和週期都減半。', en: 'Double the field at the same oblique launch velocity and measure half the radius, pitch and period.' },
      check: function (ev, mem) {
        return compareHelices(ev, mem, (a, b) => a.v === b.v && a.theta === b.theta && b.B === 2 * a.B &&
          scaled(a.r, 2 * b.r) && scaled(a.zLap, 2 * b.zLap) && scaled(a.tLap, 2 * b.tLap));
      }
    },
    {
      id: 'magnetic-particle-h9', level: 9, hidden: true,
      riddle: { zh: '旅人換了步伐，舊鞋印卻一個也沒空下來。', en: 'A different pace fills every old footprint.' },
      desc: { zh: '斜射方向不變，速率與磁場同時加倍，驗證螺旋大小不變而週期減半。', en: 'Double both speed and field without changing direction. The helix keeps its dimensions but takes half the time per turn.' },
      check: function (ev, mem) {
        return compareHelices(ev, mem, (a, b) => a.theta === b.theta && b.B === 2 * a.B &&
          same(b.v, 2 * a.v) && scaled(a.r, b.r) && scaled(a.zLap, b.zLap) && scaled(a.tLap, 2 * b.tLap));
      }
    },
    {
      id: 'magnetic-particle-h10', level: 10, hidden: true,
      riddle: { zh: '兩座旋梯通到同一扇窗，外緣卻碰不到彼此。', en: 'Two spiral stairs reach the same window, their rims far apart.' },
      desc: { zh: '在同一磁場調整速率和俯仰角，使橫向速度加倍、軸向速度不變，量得雙倍半徑、相同螺距與週期。', en: 'Vary speed and pitch angle at fixed field to double transverse speed while preserving axial speed. Measure twice the radius at the same pitch and period.' },
      check: function (ev, mem) {
        return compareHelices(ev, mem, (a, b) => a.B === b.B && a.theta !== b.theta && a.v !== b.v &&
          scaled(b.r, 2 * a.r) && scaled(a.zLap, b.zLap) && scaled(a.tLap, b.tLap));
      }
    }
  ].map(m => {
    if (!m.hidden || !m.desc) return m;
    // 兩種任務面板都讀 riddle；在面板重繪時依目前帳號的完成紀錄選文。
    const clue = m.riddle;
    const shown = () => LabMission._state?.done?.[m.id] ? m.desc : clue;
    return { ...m, riddle: { get zh() { return shown().zh; }, get en() { return shown().en; } } };
  }));
})();
