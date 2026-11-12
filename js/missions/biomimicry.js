/* missions/biomimicry.js — 仿生學的任務（星星數 = 等級 1–10；隱藏任務 = 等級 × 2）
 * 事件（js/biomimicry.js 送出）：
 *   'drop'：放下一顆水珠或落下一滴雨時。mat（材料代號，或 custom）、thY、hyst、a、b、h、smooth、V、mode（smooth／cassie／wenzel／spread）、
 *           theta、thA、thR、roll（滾落角，null = 垂直也不會滑）、r、phi、thc、Pcrit、Pdyn、impaled、metastable、
 *           rain、v（落下速度）、tilt（目前傾角）、gentleMode、gentleRoll（同一表面輕輕放的水珠）、stuck（目前傾角下不會動）
 *   'roll'：水珠滾出葉面時。tilt、roll、mode、V、merged（合體過）、rain、mat
 *   'clean'：清掉的灰塵每多 5% 時。frac、maxTilt（撒灰塵以來最大的傾角）、minV（雨的最小速度，沒下雨是 0）、rained、gentle、
 *            mixed（中途換過表面）、mat、mode、roll（目前表面輕放的狀態與滾落角）
 *   'surface'：表面設定改變時。
 *   'gecko'：壁虎重新判斷時。wall、m（kg）、f（貼住的剛毛比例）、hold、safety、use、feet、lifted（抬起的腳已經放開）、limit
 *   'pad'：掛上砝碼時。n、F（N）、load（g）、hold
 */
(function () {
  'use strict';
  if (!window.LabMission) return;

  const RAIN4 = 0.5 * 1000 * 4 * 4;   // 4 m/s 雨滴的動態壓力（Pa）

  LabMission.register('biomimicry', [
    {
      id: 'biomimicry-1', level: 1,
      title: { zh: '站起來的水珠', en: 'A drop that stands up' },
      desc: { zh: '放一顆接觸角至少 150° 的水珠（超疏水）。', en: 'Place a drop with a contact angle of at least 150° (superhydrophobic).' },
      check: function (ev) { return ev.type === 'drop' && ev.data.theta >= 150 && ev.data.mode === 'cassie'; }
    },
    {
      id: 'biomimicry-2', level: 2,
      title: { zh: '越粗糙越親水', en: 'Rougher and wetter' },
      desc: { zh: '用平面接觸角小於 90° 的材料加上微結構，讓水珠的接觸角比平面時再小至少 15°（或乾脆攤開）。', en: 'On a material whose flat contact angle is below 90°, add a microstructure so the drop’s angle drops at least 15° below the flat value (or spreads out completely).' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'drop' && d.thY < 90 && !d.smooth && (d.mode === 'spread' || (d.mode === 'wenzel' && d.theta <= d.thY - 15));
      }
    },
    {
      id: 'biomimicry-3', level: 2,
      title: { zh: '倒掛天花板', en: 'Upside down' },
      desc: { zh: '把牆轉到天花板（至少 175°），壁虎還貼得住。', en: 'Turn the wall into a ceiling (at least 175°) with the gecko still holding on.' },
      check: function (ev) { return ev.type === 'gecko' && ev.data.wall >= 175 && ev.data.hold; }
    },
    {
      id: 'biomimicry-4', level: 3,
      title: { zh: '一點點就滾', en: 'It takes so little' },
      desc: { zh: '葉面只傾斜 5° 以內，就讓一顆水珠滾出葉面。', en: 'Tilt the leaf by no more than 5° and still get a drop to roll off it.' },
      check: function (ev) { return ev.type === 'roll' && ev.data.tilt <= 5; }
    },
    {
      id: 'biomimicry-5', level: 4,
      title: { zh: '洗乾淨', en: 'Washed clean' },
      desc: { zh: '撒好灰塵後，傾角一直不超過 10°，用水珠帶走至少 90% 的灰塵。', en: 'After sprinkling the dust, never tilt beyond 10° and let the drops carry off at least 90% of it.' },
      check: function (ev) { return ev.type === 'clean' && ev.data.frac >= 0.9 && ev.data.maxTilt <= 10; }
    },
    {
      id: 'biomimicry-6', level: 4,
      title: { zh: '一平方毫米', en: 'One square millimetre' },
      desc: { zh: '讓 1 mm² 的黏著墊吊住至少 10 g 的砝碼。', en: 'Make the 1 mm² pad hold a weight of at least 10 g.' },
      check: function (ev) { return ev.type === 'pad' && ev.data.hold && ev.data.load >= 10; }
    },
    {
      id: 'biomimicry-7', level: 5,
      title: { zh: '雨打穿了', en: 'Broken through' },
      desc: { zh: '在輕放的水珠會滾走的葉面上（傾角至少 10°），讓一滴雨把空氣墊打穿、黏在葉面上不動。', en: 'On a leaf tilted at least 10° where a gently placed drop would roll away, have a rain drop break through the air cushion and stay stuck.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'drop' && d.rain && d.impaled && d.stuck && d.tilt >= 10 && d.gentleMode === 'cassie' && d.gentleRoll != null && d.gentleRoll < d.tilt;
      }
    },
    {
      id: 'biomimicry-8', level: 6,
      title: { zh: '不怕大雨', en: 'Rain-proof' },
      desc: { zh: '每秒至少 4 公尺的雨滴落下，水珠還是架在空氣墊上（Cassie），接觸角至少 150°。', en: 'Rain drops falling at 4 m/s or more still land on the air cushion (Cassie) with a contact angle of at least 150°.' },
      check: function (ev) { const d = ev.data; return ev.type === 'drop' && d.rain && d.v >= 4 && d.mode === 'cassie' && d.theta >= 150; }
    },
    {
      id: 'biomimicry-9', level: 6,
      title: { zh: '剛剛好', en: 'Just enough' },
      desc: { zh: '至少 200 g 的壁虎倒吊在天花板（至少 175°）：撐得住，但安全係數不超過 1.1。', en: 'Hang a gecko of at least 200 g from the ceiling (at least 175°) so that it holds, with a safety factor of no more than 1.1.' },
      check: function (ev) { const d = ev.data; return ev.type === 'gecko' && d.wall >= 175 && d.m >= 0.2 - 1e-9 && d.hold && d.safety <= 1.1; }
    },
    {
      id: 'biomimicry-10', level: 7,
      title: { zh: '抬起一隻腳', en: 'One foot up' },
      desc: { zh: '至少 100 g 的壁虎在天花板上抬起一隻腳（腳趾翻過脫離角），剩下三隻腳還撐得住，而且安全係數不超過 1.5。', en: 'A gecko of at least 100 g on the ceiling lifts one foot (its toe curls past the release angle) and the other three still hold, with a safety factor of no more than 1.5.' },
      check: function (ev) { const d = ev.data; return ev.type === 'gecko' && d.wall >= 175 && d.m >= 0.1 - 1e-9 && d.lifted && d.feet === 3 && d.hold && d.safety <= 1.5; }
    },
    {
      id: 'biomimicry-11', level: 8,
      title: { zh: '蓮葉設計師', en: 'Leaf designer' },
      desc: { zh: '用石蠟、柱高不超過 10 µm：放一顆接觸角至少 160°、滾落角不超過 1° 的水珠，而且這個表面擋得住每秒 4 公尺的雨。', en: 'With paraffin wax and pillars no taller than 10 µm, place a drop with a contact angle of at least 160° and a roll-off angle of at most 1°, on a surface that also withstands rain at 4 m/s.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'drop' && !d.rain && d.mat === 'wax' && !d.smooth && d.h <= 10 && d.mode === 'cassie' && d.theta >= 160 && d.roll != null && d.roll <= 1 && d.Pcrit >= RAIN4;
      }
    },
    {
      id: 'biomimicry-12', level: 10,
      title: { zh: '雨中的蓮葉', en: 'A lotus in the rain' },
      desc: { zh: '用石蠟：撒好灰塵後只靠每秒至少 4 公尺的雨、傾角一直不超過 5°、中途不換表面，洗掉至少 95% 的灰塵。', en: 'With paraffin wax: after sprinkling the dust, use only rain at 4 m/s or more, never tilt beyond 5° and keep the same surface, and wash off at least 95% of the dust.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'clean' && d.frac >= 0.95 && d.mat === 'wax' && d.gentle === 0 && d.rained > 0 && d.minV >= 4 && d.maxTilt <= 5 && !d.mixed;
      }
    },
    {
      id: 'biomimicry-h1', level: 3, hidden: true,
      riddle: { zh: '全部擠在一起，反而抓不住。', en: 'All squeezed into one, it cannot hold on.' },
      check: function (ev) { return ev.type === 'pad' && ev.data.n === 1 && !ev.data.hold && ev.data.load >= 1; }
    },
    {
      id: 'biomimicry-h2', level: 5, hidden: true,
      riddle: { zh: '站在天平的正中間。', en: 'Balanced right in the middle.' },
      check: function (ev) { const d = ev.data; return ev.type === 'drop' && !d.smooth && d.thY > 90 && d.thc != null && Math.abs(d.thY - d.thc) <= 1; }
    },
    {
      id: 'biomimicry-h3', level: 4, hidden: true,
      riddle: { zh: '一滴不夠，就再來一滴。', en: 'If one drop is not enough, add another.' },
      check: function (ev) { const d = ev.data; return ev.type === 'roll' && d.merged && d.mode !== 'cassie'; }
    }
  ]);
})();
