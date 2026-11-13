/* 任務可達成的證明腳本。用法：node tools/mission-proofs/reverb-room.js
 * 用核心 js/reverb-room-core.js 證明每個任務在介面的範圍內（滑桿的間隔）做得到，事件資料和 js/reverb-room.js 送出的一樣；
 * 預設狀態與只按房間預設不會完成任何隱藏任務；每個隱藏任務的解不會順便完成另一個隱藏任務；附反例確認條件不是太寬。
 * 介面：長 L 2–80 m、寬 W 1.5–50 m、高 H 2–35 m（間隔 0.1）；人數 0–min(2000, 2LW)（間隔 1）；六面材料各 9 種；
 *       聲源與聽者在平面圖上的位置 u、v 0.03–0.97（拖曳取到 0.001，鍵盤每步 0.005）。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
global.window = {};
const C = require(ROOT + 'js/reverb-room-core.js');
const missions = [];
global.window = { LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/reverb-room.js');
const byId = id => missions.find(m => m.id === 'reverb-room-' + id);
const r3 = v => Math.round(v * 1000) / 1000;
const r1 = v => Math.round(v * 10) / 10;

// ---------- 與 js/reverb-room.js 相同的事件資料 ----------
const cfgOf = (preset, o) => {
  const c = C.presetConfig(preset || 'classroom');
  o = o || {};
  Object.keys(o).forEach(k => { c[k] = k === 'mats' ? Object.assign({}, c.mats, o.mats) : o[k]; });
  return C.normalize(c);
};
const ev = (type, c, extra) => ({ type: type, data: C.payload(C.analyze(c), Object.assign({ via: 'test', preset: 'custom' }, extra || {})) });
const room = (c, extra) => ev('room', c, extra);
const play = (c, kind, dry, preset) => ev('play', c, { kind: kind, dry: !!dry, preset: preset || 'custom' });
const A = c => C.analyze(c);

let fail = 0;
const found = {};
function expect(id, events, want, note) {
  const m = byId(id); m.mem = {};
  let ok = false;
  events.forEach(e => { ok = !!m.check(e, m.mem) || ok; });
  const pass = ok === want;
  if (!pass) fail++;
  if (want && pass && !found[id]) found[id] = events;
  console.log((pass ? '  ✓ ' : '  ✗ ') + String(id).padEnd(4) + (want ? '達成：' : '不觸發：') + note);
}
function need(id, v, what) { if (v == null) { fail++; console.log('  ✗ ' + id + ' 在滑桿格點上找不到：' + what); } return v; }
const f2 = v => v.toFixed(2), f3 = v => v.toFixed(3);

// ---------- 預設狀態與房間預設 ----------
console.log('預設狀態（教室 9 × 8 × 3.2 m、0 人）與六個房間預設');
{
  const evs = [room(cfgOf()), play(cfgOf(), 'clap', false, 'classroom'), play(cfgOf(), 'melody', false, 'classroom')];
  const hit = missions.filter(m => { m.mem = {}; return evs.some(e => m.check(e, m.mem)); }).map(m => m.id);
  if (hit.join() !== 'reverb-room-1') { fail++; console.log('  ✗ 預設完成了：' + hit.join('、')); }
  else console.log('  ✓ 預設只有按「▶ 拍手」會完成任務 1');
  const evs2 = [];
  C.PRESET_KEYS.forEach(k => { const c = cfgOf(k); evs2.push(room(c, { preset: k }), play(c, 'clap', false, k), play(c, 'melody', false, k)); });
  const hit2 = missions.filter(m => m.hidden).filter(m => { m.mem = {}; return evs2.some(e => m.check(e, m.mem)); }).map(m => m.id);
  if (hit2.length) { fail++; console.log('  ✗ 只按房間預設就完成隱藏任務：' + hit2.join('、')); }
  else console.log('  ✓ 依序按六個房間預設、各拍手與播放一次，不會完成任何隱藏任務');
  C.PRESET_KEYS.forEach(k => { const a = A(cfgOf(k)); console.log('     ' + k.padEnd(10) + 'V ' + a.V.toFixed(0).padStart(6) + ' m³  A ' + a.A.toFixed(1).padStart(7) + '  賽賓 ' + f3(a.ts) + ' s  艾林 ' + f3(a.te) + ' s  r_c ' + f2(a.rc) + ' m'); });
}

// ---------- 公開任務 ----------
console.log('\n公開任務');
const cls = cfgOf();
expect('1', [play(cls, 'clap')], true, '按「▶ 拍手」');
expect('1', [play(cls, 'melody')], false, '只播小星星');
expect('2', [play(cls, 'clap', false), play(cls, 'clap', true)], true, '同一間教室，有迴響 → 乾聲');
expect('2', [play(cls, 'clap', false), play(cfgOf('hall'), 'clap', true)], false, '換了房間');
{
  const b = cfgOf('bathroom');
  expect('3', [play(b, 'melody', false, 'bathroom')], true, '浴室 賽賓 ' + f2(A(b).ts) + ' s，播小星星');
  expect('3', [play(b, 'melody', true, 'bathroom')], false, '乾聲不算');
  expect('3', [play(b, 'clap', false, 'bathroom')], false, '拍手不算');
}
{
  const c = cfgOf('hall', { lis: { u: 0.97, v: 0.5 } });
  expect('4', [room(c)], true, '音樂廳聽者拖到 u 0.97：直達聲 ' + A(c).t0.toFixed(3) + ' s');
  expect('4', [room(cfgOf('hall'))], false, '音樂廳預設位置 ' + (A(cfgOf('hall')).t0 * 1000).toFixed(0) + ' ms');
}
{
  const c35 = cfgOf('classroom', { people: 35 });
  expect('5', [room(cls), room(c35)], true, '0 人 ' + f2(A(cls).ts) + ' s → 35 人 ' + f2(A(c35).ts) + ' s');
  expect('5', [room(c35), room(cls)], false, '順序反了');
  expect('5', [room(cls), room(cfgOf('classroom', { people: 35, L: 10 }))], false, '同時改了尺寸');
}
{
  const c = cfgOf('classroom', { mats: { floor: 'tile', ceiling: 'tile', front: 'tile', back: 'tile', left: 'tile', right: 'tile' } });
  expect('6', [room(c)], true, '全部磁磚：相差 ' + (A(c).diff * 100).toFixed(2) + '%');
  expect('6', [room(cls)], false, '預設教室相差 ' + (A(cls).diff * 100).toFixed(2) + '%');
}
{
  const c = cfgOf('classroom', { people: 35, mats: { back: 'panel' } });
  expect('7', [room(c)], true, '教室後牆吸音板、35 人：賽賓 ' + f3(A(c).ts) + ' s');
  expect('7', [room(cfgOf('classroom', { people: 35 }))], false, '只坐 35 人：' + f2(A(cfgOf('classroom', { people: 35 })).ts) + ' s');
}
{
  let n8 = null;
  for (let n = 1000; n <= 1980; n++) if (A(cfgOf('hall', { people: n })).ts <= 2.1) { n8 = n; break; }
  need('8', n8, '音樂廳人數');
  if (n8) expect('8', [room(cfgOf('hall', { people: n8 }))], true, '音樂廳坐 ' + n8 + ' 人：賽賓 ' + f3(A(cfgOf('hall', { people: n8 })).ts) + ' s');
  expect('8', [room(cfgOf('hall'))], false, '預設 1700 人 ' + f2(A(cfgOf('hall')).ts) + ' s');
}
{
  const c = cfgOf('studio', { formula: 'eyring', mats: { floor: 'panel', front: 'panel' } });
  expect('9', [room(c)], true, '錄音室地板與前牆也改吸音板、選艾林：艾林 ÷ 賽賓 = ' + f3(A(c).te / A(c).ts));
  const c1 = cfgOf('studio', { formula: 'eyring', mats: { floor: 'panel' } });
  expect('9', [room(c1)], false, '只改地板：艾林 ÷ 賽賓 = ' + f3(A(c1).te / A(c1).ts) + '（還不到 0.45）');
  expect('9', [room(cfgOf('studio', { mats: { floor: 'panel', front: 'panel' } }))], false, '同一個房間但公式是賽賓');
  expect('9', [room(cfgOf('studio', { formula: 'eyring' }))], false, '錄音室預設 ' + f3(A(cfgOf('studio')).te / A(cfgOf('studio')).ts));
  const o = cfgOf('classroom', { mats: { floor: 'open', ceiling: 'open', front: 'open', back: 'open', left: 'open', right: 'open' } });
  expect('9', [room(o)], false, '全開窗不算');
}
{
  const c = cfgOf('cathedral', { mats: { ceiling: 'panel', left: 'panel', right: 'panel' } });
  expect('10', [room(c)], true, '大教堂天花板與兩側長牆改吸音板：賽賓 ' + f2(A(c).ts) + ' s');
  expect('10', [room(cfgOf('cathedral', { mats: { ceiling: 'panel' } }))], false, '只改天花板：' + f2(A(cfgOf('cathedral', { mats: { ceiling: 'panel' } })).ts) + ' s');
}
{
  // 找一間教室：空著與 35 人時都在 0.6–0.8 s（快速掃描吸音量，再用任務條件確認）
  let sol = null;
  const dims = [];
  for (let L = 9; L <= 12.0001 && !sol; L = r1(L + 0.1)) for (let W = 8; W <= 10; W = r1(W + 0.5)) dims.push([L, W, 3.2]);
  const M = C.MAT_KEYS.filter(k => k !== 'open');
  outer: for (const d of dims) {
    const V = d[0] * d[1] * d[2];
    if (V < 150 || V > 400) continue;
    for (const ce of M) for (const bk of M) for (const lf of M) for (const fl of ['tile', 'wood', 'carpet']) {
      const c = cfgOf('classroom', { L: d[0], W: d[1], H: d[2], mats: { floor: fl, ceiling: ce, back: bk, left: lf } });
      const a0 = A(c).ts, a1 = A(Object.assign({}, c, { people: 35 })).ts;
      if (a0 >= 0.6 && a0 <= 0.8 && a1 >= 0.6 && a1 <= 0.8) { sol = c; break outer; }
    }
  }
  need('11', sol, '空與滿都在 0.6–0.8 s 的教室');
  if (sol) {
    const full = Object.assign({}, sol, { people: 35 });
    expect('11', [room(sol), room(full)], true, sol.L + ' × ' + sol.W + ' × ' + sol.H + ' m，' + JSON.stringify(sol.mats) + '：0 人 ' + f3(A(sol).ts) + ' s、35 人 ' + f3(A(full).ts) + ' s');
    expect('11', [room(full), room(sol)], true, '順序反過來');
    expect('11', [room(cfgOf('classroom', { people: 35, mats: { back: 'panel' } })), room(cfgOf('classroom', { mats: { back: 'panel' } }))], false, '任務 7 的教室空著時太長：' + f2(A(cfgOf('classroom', { mats: { back: 'panel' } })).ts) + ' s');
  }
}
{
  // 音樂廳坐滿、T 1.9–2.1：找聽者離聲源 15 m 以上、不經地板的第一個反射 20 ms 內的位置
  let n = null;
  for (let k = 1000; k <= 1980; k++) if (A(cfgOf('hall', { people: k })).ts <= 2.05) { n = k; break; }
  let sol = null;
  for (let u = 0.3; u <= 0.97 && !sol; u = r3(u + 0.01)) for (let v = 0.03; v <= 0.97; v = r3(v + 0.01)) {
    const c = cfgOf('hall', { people: n, lis: { u: u, v: v } });
    if (byId('12').check(room(c), {})) { sol = c; break; }
  }
  need('12', sol, '好座位');
  if (sol) {
    const a = A(sol);
    expect('12', [room(sol)], true, '坐 ' + n + ' 人（' + f3(a.ts) + ' s），聽者 u ' + sol.lis.u + ' v ' + sol.lis.v + '：距離 ' + f2(a.r0) + ' m，不經地板的第一個反射 ' + a.itdgUp.toFixed(1) + ' ms（' + a.firstUp.walls.join('→') + '）');
  }
  expect('12', [room(cfgOf('hall', { people: n }))], false, '預設座位：' + A(cfgOf('hall', { people: n })).itdgUp.toFixed(1) + ' ms');
}

// ---------- 隱藏任務 ----------
console.log('\n隱藏任務');
const OPEN = { floor: 'open', ceiling: 'open', front: 'open', back: 'open', left: 'open', right: 'open' };
{
  const c = cfgOf('classroom', { mats: OPEN });
  expect('h1', [room(c)], true, '六面都開窗：艾林 ' + A(c).te + ' s、賽賓 ' + f3(A(c).ts) + ' s');
  expect('h1', [room(cfgOf('classroom', { mats: Object.assign({}, OPEN, { floor: 'tile' }) }))], false, '五面開窗');
}
{
  let sol = null;
  for (let L = 17.5; L <= 18.5 && !sol; L = r1(L + 0.1)) for (let W = 7.6; W <= 8.4 && !sol; W = r1(W + 0.1)) for (let H = 3; H <= 3.4 && !sol; H = r1(H + 0.1)) for (let n = 0; n <= 30 && !sol; n++) {
    const c = cfgOf('classroom', { L: L, W: W, H: H, people: n });
    const m = byId('h2'); m.mem = {}; m.check(room(cls), m.mem); if (m.check(room(c), m.mem)) sol = c;
  }
  need('h2', sol, '長度加倍後補人數');
  if (sol) expect('h2', [room(cls), room(sol)], true, '教室 ' + f3(A(cls).ts) + ' s → ' + sol.L + ' × ' + sol.W + ' × ' + sol.H + ' m、坐 ' + sol.people + ' 人：' + f3(A(sol).ts) + ' s（V ' + A(cls).V.toFixed(1) + ' → ' + A(sol).V.toFixed(1) + '）');
  expect('h2', [room(cls), room(cfgOf('classroom', { L: 18 }))], false, '只把長度加倍：' + f3(A(cfgOf('classroom', { L: 18 })).ts) + ' s');
}
{
  const b = cfgOf('bathroom'), tb = A(b).ts;
  let sol = null;
  for (let n = 1000; n <= 1980 && !sol; n++) { const c = cfgOf('hall', { people: n, mats: { floor: 'carpet' } }); if (Math.abs(A(c).ts / tb - 1) <= 0.005) sol = c; }
  need('h3', sol, '音樂廳與浴室同 T');
  if (sol) expect('h3', [room(b), room(sol)], true, '浴室 ' + f3(tb) + ' s（' + A(b).V.toFixed(1) + ' m³）→ 音樂廳地毯、坐 ' + sol.people + ' 人：' + f3(A(sol).ts) + ' s（體積比 ' + (A(sol).V / A(b).V).toFixed(0) + '）');
  expect('h3', [room(b), room(cfgOf('living'))], false, '浴室與客廳：體積比只有 ' + (A(cfgOf('living')).V / A(b).V).toFixed(1));
}
{
  const hard = cfgOf('classroom', { mats: { floor: 'tile', ceiling: 'tile', front: 'tile', back: 'tile', left: 'tile', right: 'tile' } });
  let sol = null;
  for (let n = 1; n <= 144 && !sol; n++) { const c = Object.assign({}, hard, { people: n }); if (A(c).ts <= 1) sol = c; }
  need('h4', sol, '坐墊');
  if (sol) expect('h4', [room(hard), room(sol)], true, '全磁磚空教室 ' + f2(A(hard).ts) + ' s → 坐 ' + sol.people + ' 人：' + f3(A(sol).ts) + ' s');
  expect('h4', [room(cls), room(cfgOf('classroom', { people: 144 }))], false, '預設教室只有 ' + f2(A(cls).ts) + ' s');
}
{
  // 顫動回聲：兩面相對的牆是硬的，其餘四面都是吸音板或開窗
  const c = cfgOf('classroom', { mats: { floor: 'panel', ceiling: 'panel', front: 'panel', back: 'panel', left: 'tile', right: 'glass' } });
  expect('h5', [room(c)], true, '左牆磁磚、右牆玻璃，其餘四面吸音板：賽賓 ' + f3(A(c).ts) + ' s');
  const c2 = cfgOf('studio', { mats: { floor: 'tile', ceiling: 'concrete', front: 'panel' } });
  expect('h5', [room(c2)], true, '錄音室前牆改吸音板，地板磁磚、天花板混凝土（上下兩面相對）');
  expect('h5', [room(cfgOf('classroom', { mats: { floor: 'open', ceiling: 'open', front: 'open', back: 'open', left: 'glass', right: 'glass' } }))], false, '兩側玻璃、其他四面開窗（走向 h1 的路上）：開窗不算閉眼');
  expect('h5', [room(cfgOf('studio'))], false, '錄音室預設：前牆玻璃，對面是吸音板');
  expect('h5', [room(cfgOf('classroom', { mats: { floor: 'carpet', ceiling: 'panel', front: 'panel', back: 'panel', left: 'tile', right: 'glass' } }))], false, '地板是地毯（α 0.30）不算全閉眼');
}
{
  let sol = null;
  for (let u = 0.5; u <= 0.97 && !sol; u = r3(u + 0.001)) {
    const c = cfgOf('classroom', { src: { u: u, v: 0.5 }, lis: { u: r3(1 - u), v: 0.5 } });
    if (byId('h6').check(room(c), {})) sol = c;
  }
  need('h6', sol, '四面牆同時');
  if (sol) expect('h6', [room(sol)], true, '教室 9 × 8：聲源 u ' + sol.src.u + '、聽者 u ' + sol.lis.u + '（v 都是 0.5）：四面牆的反射時間差 ' + A(sol).latSpread.toFixed(3) + ' ms');
  const sq = cfgOf('classroom', { W: 9, src: { u: 0.4, v: 0.4 }, lis: { u: 0.6, v: 0.6 } });
  expect('h6', [room(sq)], true, '正方形 9 × 9：對角對稱 (0.4, 0.4)、(0.6, 0.6)：' + A(sq).latSpread.toFixed(3) + ' ms');
  expect('h6', [room(cfgOf('classroom', { src: { u: 0.5, v: 0.5 }, lis: { u: 0.5, v: 0.5 } }))], false, '聲源和聽者疊在一起（距離不到 1 m）');
}
{
  const h = cfgOf('hall');
  const rc = A(h).rc, S = C.positions(h).src;
  let sol = null;
  for (let u = 0.09; u <= 0.4 && !sol; u = r3(u + 0.001)) { const c = cfgOf('hall', { lis: { u: u, v: 0.5 } }); if (byId('h7').check(room(c), {})) sol = c; }
  need('h7', sol, '臨界距離');
  if (sol) expect('h7', [room(sol)], true, '音樂廳 r_c = ' + f2(rc) + ' m；聽者 u ' + sol.lis.u + '（v 0.5）距離 ' + f3(A(sol).r0) + ' m');
  void S;
}
{
  // 體積 100 m³ 以內、賽賓 T60 8 秒以上（比大教堂預設的 ' + f2(A(cfgOf('cathedral')).ts) + ' 秒還長）
  const T6 = { floor: 'tile', ceiling: 'tile', front: 'tile', back: 'tile', left: 'tile', right: 'tile' };
  let sol = null;
  for (let s = 4; s <= 4.7 && !sol; s = r1(s + 0.1)) { const c = cfgOf('classroom', { L: s, W: s, H: s, mats: T6 }); if (byId('h8').check(room(c), {})) sol = c; }
  need('h8', sol, '小盒子');
  if (sol) expect('h8', [room(sol)], true, sol.L + ' m 的立方體、六面磁磚：V ' + A(sol).V.toFixed(1) + ' m³，賽賓 ' + f2(A(sol).ts) + ' s（大教堂預設 ' + f2(A(cfgOf('cathedral')).ts) + ' s）');
  const bt = cfgOf('bathroom', { mats: T6 });
  expect('h8', [room(bt)], false, '浴室六面磁磚只有 ' + f2(A(bt).ts) + ' s');
}
{
  let sol = null;
  const T6 = { floor: 'tile', ceiling: 'tile', front: 'tile', back: 'tile', left: 'tile', right: 'tile' };
  for (let W = 20; W <= 50 && !sol; W = r1(W + 1)) { const c = cfgOf('classroom', { L: 80, W: W, H: 3.2, mats: T6, src: { u: 0.03, v: 0.03 }, lis: { u: 0.97, v: 0.03 } }); if (byId('h9').check(room(c), {})) sol = c; }
  need('h9', sol, '回聲');
  if (sol) {
    const a = A(sol), e = a.images.filter(m => m.order === 1 && m.level != null && (m.delay - a.t0) * 1000 >= 50).sort((p, q) => q.level - p.level)[0];
    expect('h9', [room(sol)], true, '80 × ' + sol.W + ' × 3.2 m 全磁磚，兩人都貼左牆、分站兩端：' + e.walls[0] + ' 反射晚 ' + ((e.delay - a.t0) * 1000).toFixed(0) + ' ms、' + e.level.toFixed(2) + ' dB');
  }
  // 房間預設裡聲源與聽者走遍整個平面也不會有這種回聲
  let worst = -999, where = '';
  C.PRESET_KEYS.forEach(k => {
    for (let su = 0.03; su <= 0.97; su = r3(su + 0.16)) for (let sv = 0.03; sv <= 0.97; sv = r3(sv + 0.16))
      for (let u = 0.03; u <= 0.97; u = r3(u + 0.04)) for (let v = 0.03; v <= 0.97; v = r3(v + 0.04)) {
        const e = A(cfgOf(k, { src: { u: su, v: sv }, lis: { u: u, v: v } })).echo;
        if (e != null && e > worst) { worst = e; where = k + ' 聲源 (' + su + ', ' + sv + ') 聽者 (' + u + ', ' + v + ')'; }
      }
  });
  if (worst >= -2) { fail++; console.log('  ✗ h9 在房間預設裡移動聽者就會完成：' + where); }
  else console.log('  ✓ h9 不觸發：六個房間預設裡聲源與聽者走遍平面，最強的晚到反射 ' + worst.toFixed(2) + ' dB（' + where + '）');
}
{
  const big = cfgOf('classroom', { L: 18, W: 16, H: 6.4 });
  expect('h10', [room(cls), room(big)], true, '教室每邊都加倍：' + f3(A(cls).ts) + ' → ' + f3(A(big).ts) + ' s');
  const c2 = cfgOf('hall', { people: 0 }), small = cfgOf('hall', { people: 0, L: 22.5, W: 11, H: 8.5 });
  expect('h10', [room(c2), room(small)], true, '空音樂廳每邊減半：' + f3(A(c2).ts) + ' → ' + f3(A(small).ts) + ' s');
  expect('h10', [room(cls), room(cfgOf('classroom', { L: 18, W: 16, H: 6.4, people: 10 }))], false, '加倍後坐了人');
  expect('h10', [room(cls), room(cfgOf('classroom', { L: 18, W: 16, H: 3.2 }))], false, '只加倍長和寬');
}

// ---------- 隱藏任務互不順帶完成 ----------
console.log('\n隱藏任務的解不會順便完成另一個隱藏任務');
{
  const hid = missions.filter(m => m.hidden);
  let bad = 0;
  hid.forEach(m => {
    const evs = found[m.id.replace('reverb-room-', '')];
    if (!evs) { bad++; console.log('  ✗ ' + m.id + ' 沒有示範解'); return; }
    hid.forEach(o => {
      if (o === m) return;
      o.mem = {};
      let hit = false;
      evs.forEach(e => { hit = o.check(e, o.mem) || hit; });
      if (hit) { bad++; console.log('  ✗ ' + m.id + ' 的解也完成了 ' + o.id); }
    });
  });
  if (bad) fail += bad; else console.log('  ✓ 10 個隱藏任務的示範解都只完成自己');
}

// ---------- 亂按：隱藏任務很少誤觸 ----------
console.log('\n亂按 6000 次（隨機預設、隨機改一個設定、隨機拖曳）');
{
  let seed = 11;
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const hits = {}, firstAt = {};
  missions.forEach(m => { m.mem = {}; });
  let c = cfgOf();
  for (let i = 0; i < 6000; i++) {
    const r = rand();
    if (r < 0.08) c = cfgOf(C.PRESET_KEYS[Math.floor(rand() * 6)]);
    else if (r < 0.2) c = C.normalize(Object.assign({}, c, { L: r1(2 + rand() * 78) }));
    else if (r < 0.3) c = C.normalize(Object.assign({}, c, { W: r1(1.5 + rand() * 48.5) }));
    else if (r < 0.4) c = C.normalize(Object.assign({}, c, { H: r1(2 + rand() * 33) }));
    else if (r < 0.55) c = C.normalize(Object.assign({}, c, { people: Math.floor(rand() * 2001) }));
    else if (r < 0.75) { const s = C.SURFACES[Math.floor(rand() * 6)], mm = Object.assign({}, c.mats); mm[s] = C.MAT_KEYS[Math.floor(rand() * 9)]; c = C.normalize(Object.assign({}, c, { mats: mm })); }
    else c = C.normalize(Object.assign({}, c, { [rand() < 0.5 ? 'src' : 'lis']: { u: r3(0.03 + rand() * 0.94), v: r3(0.03 + rand() * 0.94) } }));
    const e = rand() < 0.15 ? play(c, rand() < 0.5 ? 'clap' : 'melody', rand() < 0.3) : room(c);
    missions.forEach(m => { if (m.check(e, m.mem)) { hits[m.id] = (hits[m.id] || 0) + 1; if (firstAt[m.id] == null) firstAt[m.id] = i + 1; } });
  }
  missions.forEach(m => console.log('  ' + m.id.padEnd(16) + String(hits[m.id] || 0).padStart(6) + ' 次' + (firstAt[m.id] ? '（第一次在第 ' + firstAt[m.id] + ' 步）' : '')));
}

console.log(fail ? '\n✗ 有 ' + fail + ' 項不通過' : '\n✓ 全部通過');
process.exit(fail ? 1 : 0);
