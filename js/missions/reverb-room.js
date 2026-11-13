/* missions/reverb-room.js — 迴響與音樂廳的任務（星星數 = 等級；隱藏任務 = 等級 × 2）
 * 事件（js/reverb-room.js 發出，都在使用者操作之後；頁面載入與分享連結還原時不發）：
 *   'room'：改了房間（預設、滑桿放開、材料、人數、公式、拖曳聲源或聽者放開、鍵盤移動）。
 *   'play'：按「▶ 拍手」或「▶ 小星星」。
 *   兩種事件的資料都是 ReverbCore.payload(分析, { via, preset, kind, dry })：
 *     { L, W, H, V, S, A, Asurf, Apeople, people, peopleMax, abar, ts（賽賓 s）, te（艾林 s）, T, diff, formula, mats{面: 材料}, room, surf, open（開窗面數）,
 *       su, sv, lu, lv, r0（m）, t0（直達聲 ms）, itdg（第一個反射比直達聲晚的 ms）, itdgUp（不經地板的第一個反射）, firstWall, firstOrder,
 *       al{面: 500 Hz 吸音係數}, latSpread（四面牆第一次反射的到達時間差 ms）, mirror（四面牆反射中最強的 dB，相對直達聲）, echo（比直達聲晚 50 ms 以上的一次反射中最強的 dB）, rc（臨界距離 m）,
 *       via, preset（目前是哪個預設；改過就是 'custom'）, kind（'clap'／'melody'，play 才有）, dry（true = 乾聲） }
 *   ts、te 是 999 表示沒有吸音（無限長）；itdg 等是 −1、mirror／echo 是 −999 表示沒有那種反射。
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  /** 記住這個任務看過的事件（最多 80 個），給「先 A 後 B」的比較用 */
  const hist = function (mem, d) { mem.h = (mem.h || []).concat([d]).slice(-80); return mem.h.slice(0, -1); };
  const fin = function (t) { return t > 0 && t < 999; };
  const within = function (a, b, tol) { return fin(a) && fin(b) && Math.abs(a / b - 1) <= tol; };
  const between = function (v, lo, hi) { return v >= lo && v <= hi; };
  const isPlay = function (ev) { return ev.type === 'play'; };
  const ratioNear = function (r, want, tol) { return Math.abs(r / want - 1) <= tol || Math.abs(r * want - 1) <= tol; };

  LabMission.register('reverb-room', [
    {
      id: 'reverb-room-1', level: 1,
      title: { zh: '拍一下手', en: 'Clap once' },
      desc: { zh: '按「▶ 拍手」，聽聽看這個房間的迴響，並看衰減曲線怎麼往下掉。', en: 'Press “▶ Clap”, listen to the room’s reverberation and watch the decay curve fall.' },
      check: function (ev) { return isPlay(ev) && ev.data.kind === 'clap'; }
    },
    {
      id: 'reverb-room-2', level: 2,
      title: { zh: '乾聲與迴響', en: 'Dry and reverberant' },
      desc: { zh: '同一個房間，選「有迴響」聽一次、選「乾聲」再聽一次，比較兩者的差別。', en: 'In the same room, listen once with “Reverb” and once with “Dry”, and compare.' },
      check: function (ev, mem) {
        if (!isPlay(ev)) return false;
        const d = ev.data;
        return hist(mem, d).some(function (p) { return p.kind && p.room === d.room && p.dry !== d.dry; });
      }
    },
    {
      id: 'reverb-room-3', level: 2,
      title: { zh: '在浴室裡唱歌', en: 'Singing in the bathroom' },
      desc: { zh: '按「浴室」，再按「▶ 小星星」（要選「有迴響」）：磁磚讓尾音拖得很長。', en: 'Press “Bathroom”, then “▶ Twinkle” (with “Reverb” on): the tiles make every note linger.' },
      check: function (ev) { const d = ev.data; return isPlay(ev) && d.kind === 'melody' && d.preset === 'bathroom' && !d.dry && d.ts >= 1.5; }
    },
    {
      id: 'reverb-room-4', level: 3,
      title: { zh: '坐到最後面', en: 'The back row' },
      desc: { zh: '在平面圖上把聽者拖到離聲源很遠的地方，讓直達聲要 0.1 秒以上才傳到（聲音每秒只走 343 公尺）。', en: 'Drag the listener on the floor plan far from the source, so the direct sound takes at least 0.1 s to arrive (sound covers only 343 m per second).' },
      check: function (ev) { return ev.data.t0 >= 100; }
    },
    {
      id: 'reverb-room-5', level: 3,
      title: { zh: '空教室與坐滿的教室', en: 'Empty and full classroom' },
      desc: { zh: '同一間教室（尺寸與材料不變）：先讓「人數」是 0，再坐進 30 人以上，賽賓 T60 至少縮短 30%。', en: 'In the same classroom (same size and materials): first set “People” to 0, then seat 30 or more; Sabine’s T60 must drop by at least 30%.' },
      check: function (ev, mem) {
        const d = ev.data;
        const h = hist(mem, d);
        if (d.people < 30 || !fin(d.ts)) return false;
        return h.some(function (p) { return p.room === d.room && p.people === 0 && fin(p.ts) && d.ts <= 0.7 * p.ts; });
      }
    },
    {
      id: 'reverb-room-6', level: 4,
      title: { zh: '兩個公式意見一致', en: 'The two formulas agree' },
      desc: { zh: '讓賽賓與艾林算出的 T60 相差不到 1%：什麼樣的房間會這樣？', en: 'Make Sabine’s and Eyring’s T60 differ by less than 1%: what kind of room does that?' },
      check: function (ev) { const d = ev.data; return fin(d.ts) && fin(d.te) && d.diff <= 0.01; }
    },
    {
      id: 'reverb-room-7', level: 4,
      title: { zh: '適合上課的教室', en: 'A classroom fit for speech' },
      desc: { zh: '教室大小（體積 150–400 m³）、坐 30 人以上，把賽賓 T60 調到 0.6–0.8 秒：說話最清楚的範圍。', en: 'A classroom-sized room (volume 150–400 m³) with 30 or more people: bring Sabine’s T60 to 0.6–0.8 s, the range best for speech.' },
      check: function (ev) { const d = ev.data; return between(d.V, 150, 400) && d.people >= 30 && between(d.ts, 0.6, 0.8); }
    },
    {
      id: 'reverb-room-8', level: 5,
      title: { zh: '兩秒的音樂廳', en: 'A two-second concert hall' },
      desc: { zh: '體積 10000 m³ 以上、坐 1000 人以上，讓賽賓 T60 落在 2.0 ± 0.1 秒：交響樂最喜歡的長度。', en: 'Volume at least 10 000 m³ and 1000 or more people: put Sabine’s T60 at 2.0 ± 0.1 s, the length symphonic music loves.' },
      check: function (ev) { const d = ev.data; return d.V >= 10000 && d.people >= 1000 && between(d.ts, 1.9, 2.1); }
    },
    {
      id: 'reverb-room-9', level: 6,
      title: { zh: '艾林砍掉一半', en: 'Eyring cuts it in half' },
      desc: { zh: '公式選「艾林」，不把任何一面設成開窗，讓艾林公式算出的 T60 只剩賽賓的 0.45 倍以下（比一半還少）。', en: 'With the “Eyring” formula selected and no surface made an open window, make Eyring’s T60 at most 0.45 times Sabine’s (less than half).' },
      check: function (ev) { const d = ev.data; return d.formula === 'eyring' && d.open === 0 && fin(d.ts) && d.te <= 0.45 * d.ts; }
    },
    {
      id: 'reverb-room-10', level: 7,
      title: { zh: '在大教堂裡講道', en: 'Preaching in a cathedral' },
      desc: { zh: '體積 30000 m³ 以上的大空間，不把任何一面設成開窗，把賽賓 T60 降到 2 秒以下。', en: 'In a space of at least 30 000 m³, without making any surface an open window, bring Sabine’s T60 below 2 s.' },
      check: function (ev) { const d = ev.data; return d.V >= 30000 && d.open === 0 && fin(d.ts) && d.ts <= 2; }
    },
    {
      id: 'reverb-room-11', level: 8,
      title: { zh: '空著或坐滿都好用', en: 'Good empty or full' },
      desc: { zh: '設計一間教室（體積 150–400 m³）：空著（0 人）和坐 35 人以上時，賽賓 T60 都在 0.6–0.8 秒（尺寸與材料不變）。', en: 'Design a classroom (volume 150–400 m³) whose Sabine T60 is 0.6–0.8 s both empty (0 people) and with 35 or more people (same size and materials).' },
      check: function (ev, mem) {
        const d = ev.data;
        const h = hist(mem, d);
        if (!between(d.V, 150, 400) || !between(d.ts, 0.6, 0.8)) return false;
        const want = d.people === 0 ? function (p) { return p.people >= 35; } : d.people >= 35 ? function (p) { return p.people === 0; } : null;
        return !!want && h.some(function (p) { return p.room === d.room && between(p.ts, 0.6, 0.8) && want(p); });
      }
    },
    {
      id: 'reverb-room-12', level: 9,
      title: { zh: '最好的位子', en: 'The best seat' },
      desc: { zh: '體積 10000 m³ 以上、坐 1000 人以上、賽賓 T60 在 1.9–2.1 秒；聽者離聲源 15 m 以上，而且不經地板的第一個反射在直達聲後 20 ms 內到達。', en: 'Volume at least 10 000 m³, 1000 or more people, Sabine T60 1.9–2.1 s; the listener at least 15 m from the source, and the first reflection that does not touch the floor arrives within 20 ms of the direct sound.' },
      check: function (ev) {
        const d = ev.data;
        return d.V >= 10000 && d.people >= 1000 && between(d.ts, 1.9, 2.1) && d.r0 >= 15 && d.itdgUp >= 0 && d.itdgUp <= 20;
      }
    },

    // ---------------- 隱藏任務 ----------------
    {
      id: 'reverb-room-h1', level: 5, hidden: true,
      riddle: { zh: '牆都不見了，兩位學者還在爭：一位說聲音還會留一會兒，一位說一點也不剩。', en: 'The walls are gone, and two scholars still argue: one says the sound lingers a while, the other says nothing is left.' },
      check: function (ev) { const d = ev.data; return d.open === 6 && d.te === 0 && fin(d.ts); }
    },
    {
      id: 'reverb-room-h2', level: 7, hidden: true,
      riddle: { zh: '房子長大了一倍，尾音卻一點也沒有變長。', en: 'The house grew twice as big, yet the lingering note grew not at all.' },
      check: function (ev, mem) {
        const d = ev.data;
        return hist(mem, d).some(function (p) { return ratioNear(d.V / p.V, 2, 0.01) && within(d.ts, p.ts, 0.005); });
      }
    },
    {
      id: 'reverb-room-h3', level: 10, hidden: true,
      riddle: { zh: '一粒沙裡的歌，和一座殿堂裡的歌，餘音一樣長。', en: 'A song in a grain of sand and a song in a great temple linger just as long.' },
      check: function (ev, mem) {
        const d = ev.data;
        return hist(mem, d).some(function (p) { return Math.min(d.V, p.V) <= 20 && Math.max(d.V, p.V) >= 10000 && within(d.ts, p.ts, 0.005); });
      }
    },
    {
      id: 'reverb-room-h4', level: 6, hidden: true,
      riddle: { zh: '教授從隔壁的劇院借來一張張坐墊，那間誰也聽不清楚的講堂，終於安靜下來。', en: 'The professor borrowed cushions from the theatre next door, and the lecture room nobody could follow finally fell quiet.' },
      check: function (ev, mem) {
        const d = ev.data;
        const h = hist(mem, d);
        if (d.people <= 0 || !(d.ts <= 1) || d.V > 3000) return false;
        return h.some(function (p) { return p.room === d.room && p.people === 0 && fin(p.ts) && p.ts >= 5.5; });
      }
    },
    {
      id: 'reverb-room-h5', level: 4, hidden: true,
      riddle: { zh: '兩面鏡子面對面，其餘的牆都閉上了眼睛。', en: 'Two mirrors face each other while every other wall has closed its eyes.' },
      check: function (ev) {
        const a = ev.data.al, m = ev.data.mats;
        if (!a || !m) return false;
        // 閉上眼睛 = 貼上很會吸音的材料（開窗是牆不見了，不算）
        return [['front', 'back'], ['left', 'right'], ['floor', 'ceiling']].some(function (pr) {
          return a[pr[0]] <= 0.04 && a[pr[1]] <= 0.04 && Object.keys(a).every(function (s) { return pr.indexOf(s) >= 0 || (a[s] >= 0.9 && m[s] !== 'open'); });
        });
      }
    },
    {
      id: 'reverb-room-h6', level: 9, hidden: true,
      riddle: { zh: '四面牆約好了，在同一刻開口。', en: 'The four walls agreed to speak at the very same instant.' },
      check: function (ev) { const d = ev.data; return d.latSpread >= 0 && d.latSpread <= 0.3 && d.r0 >= 1; }
    },
    {
      id: 'reverb-room-h7', level: 8, hidden: true,
      riddle: { zh: '站上那條看不見的線：眼前的人和整個房間，對你說話一樣大聲。', en: 'Stand on the invisible line where the person in front of you and the whole room speak to you equally loud.' },
      check: function (ev) { const d = ev.data; return d.rc > 0 && Math.abs(d.r0 - d.rc) <= 0.01 * d.rc; }
    },
    {
      id: 'reverb-room-h8', level: 7, hidden: true,
      riddle: { zh: '小小的盒子，把一聲嘆息關得比大教堂還久。', en: 'A little box keeps a sigh locked in longer than a cathedral does.' },
      check: function (ev) { const d = ev.data; return d.V <= 100 && fin(d.ts) && d.ts >= 8; }
    },
    {
      id: 'reverb-room-h9', level: 8, hidden: true,
      riddle: { zh: '在山谷裡喊一聲，山過了一會兒才完整地喊回來；這間屋子也學會了。', en: 'Shout in a valley and, a moment later, the mountain shouts back whole; this room has learned the trick.' },
      check: function (ev) { return ev.data.echo >= -2; }
    },
    {
      id: 'reverb-room-h10', level: 6, hidden: true,
      riddle: { zh: '小人國照著蓋了一座一模一樣的廳，只是迴響短了一半。', en: 'Lilliput built an exact copy of the hall, only its reverberation is half as long.' },
      check: function (ev, mem) {
        const d = ev.data;
        const h = hist(mem, d);
        if (d.people !== 0) return false;
        return h.some(function (p) {
          return p.people === 0 && p.surf === d.surf && ratioNear(d.L / p.L, 2, 0.01) && ratioNear(d.W / p.W, 2, 0.01) && ratioNear(d.H / p.H, 2, 0.01) &&
            Math.abs(d.L / p.L - d.W / p.W) < 0.03 && Math.abs(d.L / p.L - d.H / p.H) < 0.03;
        });
      }
    }
  ]);
})();
