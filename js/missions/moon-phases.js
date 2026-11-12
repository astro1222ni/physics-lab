/* missions/moon-phases.js — 月相與日月食的任務（星星數 = 等級 1–10）
 *
 * 事件（js/moon-phases.js 只在使用者操作過之後才回報；載入頁面與自動播放不算）：
 *   'state'：放開滑桿、拖曳結束、鍵盤移動、跳躍結束、按暫停、改勾選框時，data 為目前的物理量；
 *   'event'：時間前進時經過朔、上弦、望、下弦（寫進事件紀錄的那一刻），
 *            data = { kind: 'new'|'fq'|'full'|'lq', t, year, month, day, eclipse: 'none'|食的種類, eclKind: 'solar'|'lunar'|'', central, gap }；
 *   'step'：「+1 恆星月」「+1 朔望月」「下一次新月／滿月」跳躍結束，data.kind = 'sid'|'syn'|'new'|'full'；
 *   'cam'：3D 檢視按下視角按鈕，data.preset = 'edge'|'sun'|'top'。
 * 'state' 的 data：dLam（月球與太陽的黃經差，度）, illum（被照亮的比例 0–1）, phase（'new'|'waxC'|'fq'|'waxG'|'full'|'wanG'|'lq'|'wanC'）,
 *   hour, month, day, year, moonAlt, moonAz, sunAlt, sunAz（度，方位由北向東）, rising（月亮正在升高）,
 *   lunar（'none'|'penumbral'|'partial'|'total'）, solar（'none'|'partial'|'annular'|'total'，全球）, central, ruSurface（地面上的本影半徑 km，負值為偽本影）,
 *   local（台灣看到的日食）, localMag, dist（月地距離 km）, lat（月球黃緯，度）, dec（月球赤緯，度）…
 */
(function () {
  'use strict';
  if (!window.LabMission) return;

  const isState = function (ev) { return ev.type === 'state'; };
  const eclEvent = function (ev, kind, type) { return ev.type === 'event' && ev.data.eclKind === kind && ev.data.eclipse === type; };

  LabMission.register('moon-phases', [
    {
      id: 'moon-phases-1', level: 1,
      title: { zh: '圓滿', en: 'Full and round' },
      desc: { zh: '讓月球被照亮的比例達到 99.5% 以上（滿月）。', en: 'Make at least 99.5% of the Moon’s disk lit (a full moon).' },
      check: function (ev) { return isState(ev) && ev.data.illum >= 0.995; }
    },
    {
      id: 'moon-phases-2', level: 2,
      title: { zh: '上弦月', en: 'First quarter' },
      desc: { zh: '把月球放到上弦的位置：月球與太陽的黃經差在 89°～91°。', en: 'Put the Moon at first quarter: 89° to 91° east of the Sun in ecliptic longitude.' },
      check: function (ev) { return isState(ev) && Math.abs(ev.data.dLam - 90) <= 1; }
    },
    {
      id: 'moon-phases-3', level: 2,
      title: { zh: '傾斜五度', en: 'Five degrees of tilt' },
      desc: { zh: '在 3D 立體檢視中按「沿交點線側看」，看出月球軌道面與黃道面的夾角。', en: 'In the 3D view, press “Along the nodes” and see the angle between the Moon’s orbit and the ecliptic.' },
      check: function (ev) { return ev.type === 'cam' && ev.data.preset === 'edge'; }
    },
    {
      id: 'moon-phases-4', level: 3,
      title: { zh: '黃昏的眉月', en: 'Evening crescent' },
      desc: { zh: '觀測地點選「臺灣」，讓台灣在日落後的黃昏（太陽高度 −12°～−1°）看到西方天空的眉月（月亮高度 5° 以上、方位在西南到西北之間）。', en: 'With the observing site set to Taiwan, let Taiwan see a waxing crescent in the western sky at dusk: Sun 1° to 12° below the horizon, Moon at least 5° high between southwest and northwest.' },
      check: function (ev) {
        const d = ev.data;
        return isState(ev) && d.phase === 'waxC' && d.sunAlt <= -1 && d.sunAlt >= -12 && d.moonAlt >= 5 && d.moonAz >= 225 && d.moonAz <= 315;
      }
    },
    {
      id: 'moon-phases-5', level: 3,
      title: { zh: '差了兩天多', en: 'Two days short' },
      desc: { zh: '各按一次「+1 恆星月」與「+1 朔望月」，比較兩者差了多少天。', en: 'Press “+1 sidereal month” and “+1 synodic month” once each and compare the difference.' },
      check: function (ev, mem) {
        if (ev.type !== 'step') return false;
        if (ev.data.kind === 'sid') mem.sid = true;
        if (ev.data.kind === 'syn') mem.syn = true;
        return !!(mem.sid && mem.syn);
      }
    },
    {
      id: 'moon-phases-6', level: 4,
      title: { zh: '上弦月幾點升起', en: 'When does first quarter rise?' },
      desc: { zh: '觀測地點選「臺灣」，讓上弦月（黃經差 85°～95°）正從台灣的東方地平線升起（月亮高度 −1°～2.5°、方位在東北到東南之間）。那時是幾點？', en: 'With the observing site set to Taiwan, catch a first-quarter moon (85° to 95° from the Sun) rising over Taiwan’s eastern horizon (altitude −1° to 2.5°, between northeast and southeast). What time is it?' },
      check: function (ev) {
        const d = ev.data;
        return isState(ev) && d.dLam >= 85 && d.dLam <= 95 && d.rising && d.moonAlt >= -1 && d.moonAlt <= 2.5 && d.moonAz >= 45 && d.moonAz <= 135;
      }
    },
    {
      id: 'moon-phases-7', level: 4,
      title: { zh: '紅銅色的月亮', en: 'A copper-red Moon' },
      desc: { zh: '製造一次月全食：整個月球進入地球的本影。', en: 'Make a total lunar eclipse: the whole Moon inside the Earth’s umbra.' },
      check: function (ev) { return (isState(ev) && ev.data.lunar === 'total') || eclEvent(ev, 'lunar', 'total'); }
    },
    {
      id: 'moon-phases-8', level: 5,
      title: { zh: '火環', en: 'Ring of fire' },
      desc: { zh: '製造一次日環食：月球的本影尖端到不了地面，月球周圍露出一圈太陽。', en: 'Make an annular solar eclipse: the tip of the Moon’s umbra falls short of the ground and a ring of Sun shows around the Moon.' },
      check: function (ev) { return (isState(ev) && ev.data.solar === 'annular') || eclEvent(ev, 'solar', 'annular'); }
    },
    {
      id: 'moon-phases-9', level: 5,
      title: { zh: '白晝變黑夜', en: 'Day turns to night' },
      desc: { zh: '製造一次日全食：月球的本影落到地面上。', en: 'Make a total solar eclipse: the Moon’s umbra reaches the ground.' },
      check: function (ev) { return (isState(ev) && ev.data.solar === 'total') || eclEvent(ev, 'solar', 'total'); }
    },
    {
      id: 'moon-phases-10', level: 6,
      title: { zh: '只擦過半影', en: 'Only the penumbra' },
      desc: { zh: '讓時間前進經過一次滿月，記錄到一次「半影月食」：月球只經過地球的半影，沒有碰到本影。', en: 'Let time run through a full moon and record a penumbral lunar eclipse: the Moon passes only through the penumbra, missing the umbra.' },
      check: function (ev) { return eclEvent(ev, 'lunar', 'penumbral'); }
    },
    {
      id: 'moon-phases-11', level: 8,
      title: { zh: '食季', en: 'Eclipse season' },
      desc: { zh: '讓時間前進，在 16 天之內先後記錄到一次日食與一次月食（同一個食季）。', en: 'Let time run and record a solar eclipse and a lunar eclipse within 16 days of each other (the same eclipse season).' },
      check: function (ev, mem) {
        if (ev.type !== 'event' || !ev.data.eclKind || ev.data.eclipse === 'none') return false;
        const list = mem.list = (mem.list || []).filter(function (e) { return Math.abs(ev.data.t - e.t) < 40; });
        const ok = list.some(function (e) { return e.k !== ev.data.eclKind && Math.abs(ev.data.t - e.t) <= 16; });
        list.push({ k: ev.data.eclKind, t: ev.data.t });
        return ok;
      }
    },
    {
      id: 'moon-phases-12', level: 10,
      title: { zh: '台灣的日全食', en: 'Totality over Taiwan' },
      desc: { zh: '觀測地點選「臺灣」，讓台灣在白天（太陽高度 5° 以上）看到日全食：月球的本影正好落在台灣。', en: 'With the observing site set to Taiwan, let Taiwan see a total solar eclipse in daytime (Sun at least 5° high): the Moon’s umbra falls right on Taiwan.' },
      check: function (ev) { return isState(ev) && ev.data.local === 'total' && ev.data.sunAlt >= 5; }
    },
    {
      id: 'moon-phases-h1', level: 5, hidden: true,
      riddle: { zh: '同一頁日曆，盛滿兩次。', en: 'One page of the calendar, filled twice.' },
      check: function (ev, mem) {
        if (ev.type !== 'event' || ev.data.kind !== 'full') return false;
        const key = ev.data.year + '-' + ev.data.month;
        const list = mem.full = (mem.full || []).filter(function (e) { return Math.abs(ev.data.t - e.t) < 40; });
        const ok = list.some(function (e) { return e.key === key && Math.abs(ev.data.t - e.t) > 20; });
        list.push({ key: key, t: ev.data.t });
        return ok;
      }
    },
    {
      id: 'moon-phases-h2', level: 8, hidden: true,
      riddle: { zh: '黑色的針尖，輕輕點在大地上。', en: 'A black needle-point, barely touching the ground.' },
      check: function (ev) { const d = ev.data; return isState(ev) && d.central && (d.solar === 'total' || d.solar === 'annular') && Math.abs(d.ruSurface) <= 5; }
    },
    {
      id: 'moon-phases-h3', level: 6, hidden: true,
      riddle: { zh: '每隔十八年多，它走到太陽從不去的北方。', en: 'Every eighteen-odd years it walks where the Sun never goes, far in the north.' },
      check: function (ev) { return isState(ev) && ev.data.dec >= 28; }
    }
  ]);
})();
