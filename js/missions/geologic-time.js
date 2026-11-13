/* missions/geologic-time.js — 地層與地質年代 的任務（星星數 = 等級；隱藏任務 = 等級 × 2）
 *
 * 事件（js/geologic-time.js 只在使用者操作過之後才回報；載入頁面不算）：
 *   'story'：data = { scen（'A'／'B'）, t（百萬年前）, period, era, n（已發生的事件數）, dep（正在沉積的岩石或 null）, fossil（正在沉積的層的化石或 null）,
 *                    last（最近一個事件的種類）, eroding（正在侵蝕、沒有沉積）, angular（剛傾斜的地層正被侵蝕：角度不整合正在形成）, playing,
 *                    depUnit（正在沉積的單元編號或 null）, dated（這個剖面已經量到形成年代的單元） }；
 *   'measure'：data = { scen, unit（單元編號，−1＝基盤）, rock, kind（'base'、'pluton'、'dike'、'lava'、'ash'、'sed'）, sys（'U238'、'U235'、'K40'、'Rb87'、'C14'）,
 *                      ok, reason, age、sigma（百萬年）, what（'formation'／'detrital'）, formAge（這個單元真正形成的時間，百萬年）, k（這個單元用這個方法的第幾次量測）,
 *                      dated（這個剖面已經量到形成年代的單元）, best（{單元: 最好的形成年代}）, sysOk（這個單元量成功過的方法）, ages（{方法: [年代, 誤差, what]}）,
 *                      concord（同一單元的兩個鈾時鐘相差 < 0.5%） }；
 *   'order'：data = { scen, n（要排的事件數）, placed, correct（從最老開始連續正確的個數）, right（位置正確的個數）, done,  perfect, dated }；
 *   'sample'、'view'、'cam'：採樣、切換 3D 與視角。
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const St = function (ev) { return ev.type === 'story' ? ev.data : null; };
  const Me = function (ev) { return ev.type === 'measure' && ev.data.ok ? ev.data : null; };
  const Or = function (ev) { return ev.type === 'order' ? ev.data : null; };

  LabMission.register('geologic-time', [
    {
      id: 'geologic-time-1', level: 1,
      title: { zh: '寒武紀的海邊', en: 'A Cambrian shore' },
      desc: { zh: '在「地層的故事」把時間停在寒武紀，讓含三葉蟲的砂岩正在堆積。', en: 'In “The story”, stop the time in the Cambrian while the sandstone with trilobites is being laid down.' },
      check: function (ev) { const d = St(ev); return !!d && !d.playing && d.period === 'cambrian' && d.fossil === 'trilobite' && d.dep === 'sandstone'; }
    },
    {
      id: 'geologic-time-2', level: 2,
      title: { zh: '恐龍的最後一天', en: 'The dinosaurs’ last day' },
      desc: { zh: '把時間停在白堊紀與古近紀的交界：6600 萬年前（誤差 50 萬年內）。', en: 'Stop the time at the end of the Cretaceous: 66 million years ago (within 0.5 million years).' },
      check: function (ev) { const d = St(ev); return !!d && !d.playing && Math.abs(d.t - 66) <= 0.5; }
    },
    {
      id: 'geologic-time-3', level: 2,
      title: { zh: '火山灰的鈾時鐘', en: 'The uranium clock in an ash bed' },
      desc: { zh: '在「定年實驗室」用鈾–鉛法（鈾 238 或鈾 235）量出一層火山灰的年代。', en: 'In “Dating lab”, date a volcanic ash bed with uranium–lead (U-238 or U-235).' },
      check: function (ev) { const d = Me(ev); return !!d && d.kind === 'ash' && (d.sys === 'U238' || d.sys === 'U235'); }
    },
    {
      id: 'geologic-time-4', level: 2,
      title: { zh: '一萬多年前的木炭', en: 'Charcoal from the Ice Age' },
      desc: { zh: '用碳十四量出剖面一最上面礫石層裡木炭的年代。', en: 'Use carbon-14 to date the charcoal in the gravel at the top of Section 1.' },
      check: function (ev) { const d = Me(ev); return !!d && d.sys === 'C14' && d.scen === 'A'; }
    },
    {
      id: 'geologic-time-5', level: 3,
      title: { zh: '比砂岩還老的砂粒', en: 'Sand grains older than the sandstone' },
      desc: { zh: '量一層砂岩的鋯石，得到比這層砂岩本身至少老 5 億年的年代。這些砂粒是從哪裡來的？', en: 'Date the zircon in a sandstone and get an age at least 500 million years older than the sandstone itself. Where did those grains come from?' },
      check: function (ev) { const d = Me(ev); return !!d && d.what === 'detrital' && d.age - d.formAge >= 500; }
    },
    {
      id: 'geologic-time-6', level: 3,
      title: { zh: '一條直線說出年齡', en: 'An age from a straight line' },
      desc: { zh: '用銣–鍶等時線量出一塊火成岩的年代。', en: 'Date an igneous rock with a rubidium–strontium isochron.' },
      check: function (ev) { const d = Me(ev); return !!d && d.sys === 'Rb87' && d.what === 'formation'; }
    },
    {
      id: 'geologic-time-7', level: 4,
      title: { zh: '兩個時鐘對上了', en: 'Two clocks agree' },
      desc: { zh: '同一個岩體分別用鈾 238 和鈾 235 量，兩個年代相差不到 0.5%。', en: 'Date the same rock body with both uranium-238 and uranium-235, with the two ages less than 0.5% apart.' },
      check: function (ev) { const d = Me(ev); return !!d && d.concord && (d.sys === 'U238' || d.sys === 'U235'); }
    },
    {
      id: 'geologic-time-8', level: 4,
      title: { zh: '把恐龍夾住', en: 'Bracketing the dinosaurs' },
      desc: { zh: '在剖面一，把恐龍砂岩正下方的熔岩流和正上方的火山灰都量出形成年代，夾出恐龍生活的時代。', en: 'In Section 1, date both the lava flow just below the dinosaur sandstone and the ash bed just above it, bracketing when the dinosaurs lived.' },
      check: function (ev) { const d = Me(ev); return !!d && d.scen === 'A' && d.dated.indexOf(12) >= 0 && d.dated.indexOf(14) >= 0; }
    },
    {
      id: 'geologic-time-9', level: 3,
      title: { zh: '最年輕的岩脈', en: 'The youngest dike' },
      desc: { zh: '用鉀–氬法量出剖面一那條細細的玄武岩岩脈的年代。它比旁邊所有地層都年輕嗎？', en: 'Date the thin basalt dike in Section 1 with potassium–argon. Is it younger than every layer next to it?' },
      check: function (ev) { const d = Me(ev); return !!d && d.scen === 'A' && d.kind === 'dike' && d.sys === 'K40'; }
    },
    {
      id: 'geologic-time-10', level: 5,
      title: { zh: '偵探入門', en: 'Junior detective' },
      desc: { zh: '在「排出先後」把剖面二的所有事件，從最老到最新全部排對。', en: 'In “Put in order”, place every event in Section 2 correctly from oldest to youngest.' },
      check: function (ev) { const d = Or(ev); return !!d && d.scen === 'B' && d.perfect; }
    },
    {
      id: 'geologic-time-11', level: 7,
      title: { zh: '讀懂 17 億年', en: 'Reading 1.7 billion years' },
      desc: { zh: '把剖面一的所有事件，從最老到最新全部排對。', en: 'Place every event in Section 1 correctly from oldest to youngest.' },
      check: function (ev) { const d = Or(ev); return !!d && d.scen === 'A' && d.perfect; }
    },
    {
      id: 'geologic-time-h1', level: 3, hidden: true,
      riddle: { zh: '最底下的石頭，比闖進它身體的那團火還要老。', en: 'The stone at the very bottom is older than the fire that forced its way into it.' },
      check: function (ev) { const d = Me(ev); return !!d && d.scen === 'A' && d.kind === 'base' && d.what === 'formation' && d.age >= 1700 && d.dated.indexOf(0) >= 0; }
    },
    {
      id: 'geologic-time-h2', level: 3, hidden: true,
      riddle: { zh: '書被撕掉了好幾頁，你剛好停在那裡。', en: 'Pages are being torn from the book, and you stopped right there.' },
      check: function (ev) { const d = St(ev); return !!d && !d.playing && d.angular; }
    },
    {
      id: 'geologic-time-h3', level: 5, hidden: true,
      riddle: { zh: '四座鐘，各走各的速度，卻報出同一個時刻。', en: 'Four clocks, each ticking at its own pace, strike the same hour.' },
      check: function (ev) {
        const d = Me(ev); if (!d || !d.ages) return false;
        const ks = ['U238', 'U235', 'K40', 'Rb87'];
        if (!ks.every(function (k) { return d.ages[k] && d.ages[k][2] === 'formation'; })) return false;
        const mean = ks.reduce(function (s, k) { return s + d.ages[k][0]; }, 0) / 4;
        return ks.every(function (k) { return Math.abs(d.ages[k][0] - mean) <= 2.5 * d.ages[k][1]; });
      }
    },
    {
      id: 'geologic-time-h4', level: 6, hidden: true,
      riddle: { zh: '先問出那場灰的生日，再回到它從天而降的那一刻。', en: 'First learn the birthday of the ash, then go back to the moment it fell from the sky.' },
      check: function (ev) { const d = St(ev); return !!d && !d.playing && d.dep === 'ash' && (d.dated || []).indexOf(d.depUnit) >= 0; }
    },
    {
      id: 'geologic-time-h5', level: 5, hidden: true,
      riddle: { zh: '大地流出了火，你看著它鋪成一層石頭。', en: 'Fire flowed out of the ground, and you watched it spread into a layer of stone.' },
      check: function (ev) { const d = St(ev); return !!d && !d.playing && d.dep === 'basalt'; }
    },
    {
      id: 'geologic-time-h6', level: 7, hidden: true,
      riddle: { zh: '燒過的木頭說出了樹的死期；回到河已經在搬石頭、那棵樹卻還活著的時候。', en: 'The burnt wood told you when the tree died. Go back to when the river was already carrying stones but that tree was still alive.' },
      check: function (ev) { const d = St(ev); return !!d && !d.playing && d.scen === 'A' && d.dep === 'gravel' && (d.dated || []).indexOf(18) >= 0 && d.t >= 0.0121 && d.t < 0.03; }
    },
    {
      id: 'geologic-time-h7', level: 7, hidden: true,
      riddle: { zh: '有些沙子走了很遠；有些只是回到了家門口。', en: 'Some sand travels far; some only comes back to its own doorstep.' },
      check: function (ev) {
        const d = Me(ev); if (!d || d.scen !== 'A' || d.unit !== 1 || d.what !== 'detrital' || !d.best || d.best[-1] == null) return false;
        return Math.abs(d.age - d.best[-1]) / d.best[-1] < 0.01;
      }
    },
    {
      id: 'geologic-time-h8', level: 7, hidden: true,
      riddle: { zh: '一道裂痕的年紀，夾在兩次火之間。', en: 'The age of a crack, caught between two fires.' },
      check: function (ev) { const d = Me(ev); return !!d && d.scen === 'B' && d.dated.indexOf(3) >= 0 && d.dated.indexOf(6) >= 0; }
    },
    {
      id: 'geologic-time-h9', level: 8, hidden: true,
      riddle: { zh: '讓每一塊從火裡生出來的石頭，都說出自己的生日。', en: 'Make every stone that was born from fire tell you its birthday.' },
      check: function (ev) { const d = Me(ev); return !!d && d.scen === 'A' && [0, 7, 12, 14, 16].every(function (u) { return d.dated.indexOf(u) >= 0; }); }
    },
    {
      id: 'geologic-time-h10', level: 10, hidden: true,
      riddle: { zh: '眼睛讀出的故事，要請三座時鐘來簽名。', en: 'The story your eyes have read needs three clocks to sign it.' },
      check: function (ev) { const d = Or(ev); return !!d && d.scen === 'A' && d.perfect && (d.dated || []).length >= 3; }
    }
  ]);
})();
