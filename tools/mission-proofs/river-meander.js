/* 任務可達成的證明腳本。用法：node tools/mission-proofs/river-meander.js（約 1–2 分鐘）
 * 修改核心或任務條件後重跑，確認每個任務都做得到、預設狀態不會觸發、隱藏任務彼此不會順便完成。
 * 事件 'river' 的內容和頁面一樣由 MeanderCore.snapshot 計算；頁面的時間推進就是重複 MeanderCore.step，
 * 每一步的長短只由河道決定，所以這裡的模擬和頁面上同樣的設定、同樣的操作得到一模一樣的河道。
 * 剖面資訊用 MeanderCore.sectionInfo（頁面也用它）；人工截彎用 MeanderCore.artificialCut（頁面點畫布就是呼叫它）。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const K = require(ROOT + 'js/river-meander-core.js');
const missions = [];
global.window = { MeanderCore: K, LabMission: { register: (id, list) => list.forEach(m => missions.push(m)) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/river-meander.js');
const byId = id => missions.find(m => m.id === 'river-meander-' + id);

let ok = 0, bad = 0;
function expect(label, cond, extra) {
  if (cond) { ok++; console.log('  ✓ ' + label + (extra ? '（' + extra + '）' : '')); }
  else { bad++; console.error('  ✗ ' + label + (extra ? '（' + extra + '）' : '')); }
}
const ev = (r, extra) => ({ type: 'river', data: K.snapshot(r, Object.assign({ running: false, act: 'run', tool: 'look', sel: null, selOx: null }, extra || {})) });
const firing = e => missions.filter(m => m.check(e)).map(m => m.id.replace('river-meander-', ''));
const hiddenOf = list => list.filter(x => x[0] === 'h');
const clone = r => Object.assign({}, r, { x: r.x.slice(), y: r.y.slice(), oxbows: r.oxbows.slice(), events: r.events.slice(), hist: [] });
const used = {};
function witness(id, e, note) {
  const f = firing(e);
  used[id] = e;
  expect(id + ' 做得到', f.indexOf(id) >= 0, note + '；同時完成：' + (f.filter(x => x !== id).join('、') || '無'));
  return f;
}
/** 模擬到條件成立（每一步檢查），回傳河道；做不到回傳 null */
function runUntil(o, cond, maxT) {
  const r = K.create(o);
  while (!cond(r)) { if (r.t > maxT) return null; K.step(r); }
  return r;
}
const sel = (r, i) => K.sectionInfo(r, i);

console.log('river-meander 任務證明\n');

console.log('[預設與一般操作]');
{
  const r = K.create({ W: 80, k: 8, seed: 1 });
  const acts = ['run', 'play', 'pause', 'step', 'param', 'tool', 'layer', 'reset', 'nocut'];
  expect('第 0 年、任何操作都不會完成任務', acts.every(a => firing(ev(r, { act: a })).length === 0));
  let any = [];
  for (let s = 1; s <= 30; s++) { const q = K.create({ W: 40 + 10 * (s % 13), k: 2 + (s % 29), seed: s }); any = any.concat(firing(ev(q, { act: 'pause' }))); }
  expect('30 條不同河谷、不同設定的第 0 年都不會完成任務', any.length === 0, any.join('、'));
}

console.log('\n[公開任務]');
let base;   // W80 k8 種子 1：很多任務共用
{
  // 1：50 年
  const r = runUntil({ W: 80, k: 8, seed: 1 }, q => q.t >= 50, 60);
  witness('1', ev(r, { running: true }), '播放到第 ' + r.t.toFixed(1) + ' 年');
  const r0 = runUntil({ W: 80, k: 8, seed: 1 }, q => q.t >= 49, 60);
  expect('第 49 年還不算', !byId('1').check(ev(r0)));
}
{
  // 2：第一次自然截彎
  const r = runUntil({ W: 80, k: 8, seed: 1 }, q => q.cuts >= 1, 2000);
  witness('2', ev(r, { running: true }), 'W 80 m、k 8、第 ' + r.t.toFixed(0) + ' 年第一次截彎');
  base = r;
}
{
  // 3：點明顯的彎道；點直的地方不算
  const r = base, m = K.migration(r);
  let iB = -1, iS = -1;
  for (let i = 5; i < r.x.length - 5; i++) {
    const c = Math.abs(m.C[i] * r.W);
    if (iB < 0 && c >= 0.25 && c < 0.5) iB = i;
    if (iS < 0 && c < 0.05) iS = i;
  }
  witness('3', ev(r, { act: 'select', sel: sel(r, iB) }), '點第 ' + iB + ' 個節點，c = ' + (m.C[iB] * r.W).toFixed(2));
  expect('點幾乎直的地方不算', !byId('3').check(ev(r, { act: 'select', sel: sel(r, iS) })));
}
let r4;
{
  const r = runUntil({ W: 80, k: 8, seed: 1 }, q => K.sinuosity(q) >= 1.5, 2000);
  witness('4', ev(r, { running: true }), '第 ' + r.t.toFixed(0) + ' 年彎曲度 ' + K.sinuosity(r).toFixed(3));
  r4 = r;
}
{
  const r = runUntil({ W: 80, k: 8, seed: 1 }, q => K.snapshot(q).lakes >= 3, 3000);
  witness('5', ev(r, { running: true }), '第 ' + r.t.toFixed(0) + ' 年有 3 個還有水的牛軛湖');
}
{
  // 6：普通的人工截彎（找一個省下不多、頸部不窄的）
  const r = clone(base);
  let done = null;
  for (let i = 5; i < r.x.length - 5 && !done; i += 2) {
    const c = clone(r), res = K.artificialCut(c, r.x[i], r.y[i]);
    if (res && res.saved < 3000 && res.neck > 2.5 * r.W) { K.artificialCut(r, r.x[i], r.y[i]); done = res; }
  }
  witness('6', ev(r, { act: 'art', tool: 'cut' }), '截一個頸寬 ' + done.neck.toFixed(0) + ' m 的彎，省下 ' + done.saved.toFixed(0) + ' m');
  expect('按到截不了的地方（nocut）不算', !byId('6').check(ev(base, { act: 'nocut', tool: 'cut' })));
}
{
  const r = runUntil({ W: 140, k: 8, seed: 1 }, q => { const l = K.wavelength(q); return K.sinuosity(q) >= 1.2 && l != null && l >= 1500; }, 3000);
  witness('7', ev(r, { running: true }), 'W 140 m、第 ' + r.t.toFixed(0) + ' 年波長 ' + K.wavelength(r).toFixed(0) + ' m');
  expect('W 130 m 不算（即使波長夠長）', !byId('7').check({ type: 'river', data: Object.assign(K.snapshot(r), { W: 130 }) }));
}
{
  const r = runUntil({ W: 50, k: 8, seed: 1 }, q => { const l = K.wavelength(q); return K.sinuosity(q) >= 1.2 && l != null && l <= 600; }, 3000);
  witness('8', ev(r, { running: true }), 'W 50 m、第 ' + r.t.toFixed(0) + ' 年波長 ' + K.wavelength(r).toFixed(0) + ' m');
  const r2 = runUntil({ W: 80, k: 8, seed: 1 }, q => q.t >= 600, 700);
  expect('W 80 m 的波長不會小於 600 m', K.wavelength(r2) == null || K.wavelength(r2) > 600, String(K.wavelength(r2) && K.wavelength(r2).toFixed(0)));
}
{
  // 9：找頸部已經窄到 2W 以下的彎（快要自然截彎的時候）
  let found = null;
  const r = K.create({ W: 80, k: 8, seed: 1 });
  while (!found && r.t < 3000) {
    K.step(r);
    if (Math.floor(r.t) % 5) continue;
    for (let i = 5; i < r.x.length - 5 && !found; i += 2) {
      const c = clone(r), res = K.artificialCut(c, r.x[i], r.y[i]);
      if (res && res.neck <= 2 * r.W && res.saved < 5000) found = { i, res, t: r.t };
    }
  }
  const res = K.artificialCut(r, r.x[found.i], r.y[found.i]);
  witness('9', ev(r, { act: 'art', tool: 'cut' }), '第 ' + found.t.toFixed(0) + ' 年，頸寬 ' + res.neck.toFixed(0) + ' m（' + (res.neck / r.W).toFixed(2) + ' W）');
}
{
  const r = runUntil({ W: 80, k: 8, seed: 1 }, q => K.sinuosity(q) >= 3, 4000);
  witness('10', ev(r, { running: true }), '第 ' + r.t.toFixed(0) + ' 年彎曲度 ' + K.sinuosity(r).toFixed(3));
}
{
  const r = runUntil({ W: 60, k: 15, seed: 1 }, q => q.cuts >= 20, 4000);
  witness('11', ev(r, { running: true }), 'W 60 m、k 15、第 ' + r.t.toFixed(0) + ' 年截彎 20 次');
}
{
  const r = runUntil({ W: 80, k: 8, seed: 1 }, q => K.snapshot(q).oldest >= K.FILL_YR, 4000);
  witness('12', ev(r, { running: true }), '第 ' + r.t.toFixed(0) + ' 年最老的牛軛湖 ' + K.snapshot(r).oldest.toFixed(0) + ' 歲');
}

console.log('\n[隱藏任務]');
{
  // h1：點牛軛湖
  witness('h1', ev(base, { act: 'oxbow', selOx: { age: base.t - base.oxbows[0].t0, len: base.oxbows[0].len, art: false } }), '點第一個牛軛湖');
  expect('點河道不算 h1', !byId('h1').check(ev(base, { act: 'select', sel: sel(base, 50) })));
}
{
  // h2：急彎露出沙洲
  let found = null;
  const r = K.create({ W: 80, k: 8, seed: 1 });
  while (!found && r.t < 3000) {
    K.step(r);
    if (Math.floor(r.t) % 10) continue;
    const m = K.migration(r);
    for (let i = 3; i < r.x.length - 3; i++) { const s = K.sectionInfo(r, i, m); if (s.bar && !s.top) { found = { i, s }; break; } }
  }
  witness('h2', ev(r, { act: 'select', sel: found.s }), '第 ' + r.t.toFixed(0) + ' 年點曲率 c = ' + found.s.c.toFixed(2) + ' 的急彎');
  const notBar = sel(r, 2);
  expect('一般的彎沒有沙洲', !byId('h2').check(ev(r, { act: 'select', sel: notBar })));
}
{
  // h3：一年內四次自然截彎（河很窄、河岸很容易沖刷時才會發生）
  let r = null, sd = 0;
  for (sd = 1; sd <= 5 && !r; sd++) r = runUntil({ W: 40, k: 30, seed: sd }, q => q.minGap4 <= 1, 1500);
  witness('h3', ev(r, { running: true }), 'W 40 m、k 30、第 ' + (sd - 1) + ' 條河谷、第 ' + r.t.toFixed(0) + ' 年，四次截彎在 ' + r.minGap4.toFixed(2) + ' 年內');
  const r2 = runUntil({ W: 80, k: 8, seed: 1 }, q => q.t >= 1000, 1100);
  expect('預設設定前 1000 年沒有一年內四次截彎', !(r2.minGap4 <= 1), (isFinite(r2.minGap4) ? r2.minGap4.toFixed(1) : '—') + ' 年');
}
{
  // h4：點遷移最快的那個點（暫停時）
  const r = r4, m = K.migration(r);
  let best = 0; for (let i = 1; i < m.R1.length; i++) if (Math.abs(m.R1[i]) > Math.abs(m.R1[best])) best = i;
  witness('h4', ev(r, { act: 'select', sel: sel(r, best) }), '第 ' + r.t.toFixed(0) + ' 年點第 ' + best + ' 個節點，' + Math.abs(m.R1[best]).toFixed(2) + ' m/年');
  let near = 0; for (let i = 1; i < r.x.length - 1; i++) if (sel(r, i).top) near++;
  expect('符合的點很少（只有最快的那一小段）', near <= 4, near + ' 個節點，共 ' + r.x.length + ' 個');
  expect('時間在走時點到不算', !byId('h4').check(ev(r, { act: 'select', running: true, sel: sel(r, best) })));
  expect('用「往前 1 年」或其他操作帶著舊剖面不算', !byId('h4').check(ev(r, { act: 'step', sel: sel(r, best) })));
}
{
  // h5：暫停時彎曲度在 π ± 0.002（讀數顯示 3.140–3.143）（用「往前 1 年」一年一年走）
  const r = K.create({ W: 80, k: 4, seed: 1 });
  let hit = null;
  while (!hit && r.t < 6000) {
    const end = r.t + 1;
    while (r.t < end - 1e-9) K.step(r);
    if (Math.abs(K.sinuosity(r) - Math.PI) <= 0.002) hit = r.t;
  }
  witness('h5', ev(r, { act: 'step' }), 'W 80 m、k 4、按「往前 1 年」到第 ' + hit.toFixed(1) + ' 年，彎曲度 ' + K.sinuosity(r).toFixed(4));
  expect('同一刻時間在走時不算', !byId('h5').check(ev(r, { running: true })));
}
{
  // h6：一千年沒有自然截彎：河寬大、河岸難侵蝕
  const r = runUntil({ W: 160, k: 2, seed: 1 }, q => q.t >= 1000, 1100);
  witness('h6', ev(r, { running: true }), 'W 160 m、k 2，第 ' + r.t.toFixed(0) + ' 年還沒有截彎（彎曲度 ' + K.sinuosity(r).toFixed(2) + '）');
  const r2 = runUntil({ W: 80, k: 8, seed: 1 }, q => q.t >= 1000, 1100);
  expect('預設設定跑 1000 年做不到', !byId('h6').check(ev(r2, { running: true })), '截彎 ' + r2.cuts + ' 次');
}
let h8r;
{
  // h7：一刀省下 5 km 以上
  let found = null;
  const r = K.create({ W: 80, k: 8, seed: 1 });
  while (!found && r.t < 3000) {
    K.step(r);
    if (Math.floor(r.t) % 20 || r.t - Math.floor(r.t) > 0.9) continue;
    for (let i = 5; i < r.x.length - 5 && !found; i += 2) {
      const res = K.artificialCut(clone(r), r.x[i], r.y[i]);
      if (res && res.saved >= 5000 && res.after > 1.2) found = { i, t: r.t };
    }
  }
  const res = K.artificialCut(r, r.x[found.i], r.y[found.i]);
  witness('h7', ev(r, { act: 'art', tool: 'cut' }), '第 ' + found.t.toFixed(0) + ' 年一刀省下 ' + res.saved.toFixed(0) + ' m');
}
{
  // h8：從彎曲度 2.5 以上，用人工截彎拉直到 1.2 以下（每次挑讓彎曲度最低的那一刀）
  const r = runUntil({ W: 80, k: 8, seed: 1 }, q => q.maxSin >= 2.6, 3000);
  let taps = 0, e = null, early = [];
  while (K.sinuosity(r) > 1.2 && taps < 30) {
    let best = null;
    for (let i = 2; i < r.x.length - 2; i += 2) { const res = K.artificialCut(clone(r), r.x[i], r.y[i]); if (res && (!best || res.after < best.after)) best = { i, after: res.after }; }
    if (!best) break;
    K.artificialCut(r, r.x[best.i], r.y[best.i]); taps++;
    e = ev(r, { act: 'art', tool: 'cut' });
    if (K.sinuosity(r) > 1.2) early = early.concat(hiddenOf(firing(e)).filter(x => x === 'h8'));
  }
  witness('h8', e, '第 ' + r.t.toFixed(0) + ' 年從 ' + r.maxSin.toFixed(2) + ' 截 ' + taps + ' 刀拉直到 ' + K.sinuosity(r).toFixed(3));
  expect('還沒拉直到 1.2 以下的那幾刀不算', early.length === 0);
  h8r = r;
  // 沒有先彎到 2.5 的河，拉直不算
  const q = runUntil({ W: 80, k: 8, seed: 1 }, z => K.sinuosity(z) >= 1.6, 3000);
  let g = 0; while (K.sinuosity(q) > 1.2 && g++ < 30) { let best = null; for (let i = 2; i < q.x.length - 2; i += 2) { const res = K.artificialCut(clone(q), q.x[i], q.y[i]); if (res && (!best || res.after < best.after)) best = { i, after: res.after }; } if (!best) break; K.artificialCut(q, q.x[best.i], q.y[best.i]); }
  expect('只彎到 1.6 就拉直不算', !byId('h8').check(ev(q, { act: 'art', tool: 'cut' })), '最大彎曲度 ' + q.maxSin.toFixed(2) + '、拉直到 ' + K.sinuosity(q).toFixed(2));
}
{
  const r = runUntil({ W: 40, k: 8, seed: 1 }, q => K.sinuosity(q) >= 4.5, 6000);
  witness('h9', ev(r, { running: true }), 'W 40 m、第 ' + r.t.toFixed(0) + ' 年彎曲度 ' + K.sinuosity(r).toFixed(3));
}
{
  // h10：拉直之後讓它繼續流，直到彎曲度回到 2.5
  const r = h8r, ts = r.t;
  while (K.sinuosity(r) < 2.5 && r.t < ts + 5000) K.step(r);
  witness('h10', ev(r, { running: true }), '拉直後再過 ' + (r.t - ts).toFixed(0) + ' 年回到 ' + K.sinuosity(r).toFixed(3));
}

console.log('\n[互不干擾]');
{
  const H = Object.keys(used).filter(x => x[0] === 'h');
  H.forEach(id => {
    const others = hiddenOf(firing(used[id])).filter(x => x !== id);
    expect(id + ' 的做法不會順便完成其他隱藏任務', others.length === 0, others.join('、'));
  });
  const P = Object.keys(used).filter(x => x[0] !== 'h');
  const leak = [];
  P.forEach(id => { const h = hiddenOf(firing(used[id])); if (h.length) leak.push(id + '→' + h.join('、')); });
  expect('公開任務的做法不會順便完成隱藏任務', leak.length === 0, leak.join('；'));
}

console.log('\n[隨機操作]');
{
  // 像學生亂玩：隨機的河谷與設定，跑一段時間、偶爾暫停、亂點河道、亂截彎
  const R = K.rng(2026), cnt = {}, tries = 120;
  for (let n = 0; n < tries; n++) {
    const W = 40 + 10 * Math.floor(R() * 13), k = 2 + Math.floor(R() * 29), r = K.create({ W, k, seed: 1 + Math.floor(R() * 999) });
    const hits = new Set();
    const look = (extra) => hiddenOf(firing(ev(r, extra))).forEach(x => hits.add(x));
    const years = 50 + R() * 450;
    while (r.t < years) {
      const end = r.t + 10 + R() * 60;
      while (r.t < end) K.step(r);
      look({ running: true });
      const a = R();
      if (a < 0.3) look({ act: 'pause' });
      else if (a < 0.55) { const i = 1 + Math.floor(R() * (r.x.length - 2)); look({ act: 'select', sel: sel(r, i) }); }
      else if (a < 0.7) { const i = 1 + Math.floor(R() * (r.x.length - 2)); if (K.artificialCut(r, r.x[i] + (R() - 0.5) * W, r.y[i] + (R() - 0.5) * W)) look({ act: 'art', tool: 'cut' }); }
    }
    hits.forEach(x => { cnt[x] = (cnt[x] || 0) + 1; });
  }
  const worst = Object.keys(cnt).map(x => x + ' ' + cnt[x]).join('、') || '都沒有';
  // h4（點到最快的點）與 h2（點到沙洲）亂點偶爾會中，放寬到 5%；其他低於 2%
  const lim = { h2: 0.05, h4: 0.05 };
  expect('隨機河谷與設定、亂玩 ' + tries + ' 次，隱藏任務碰巧完成的比例夠低', Object.keys(cnt).every(x => cnt[x] / tries < (lim[x] || 0.02)), worst);
}

const pub = missions.filter(m => !m.hidden), hid = missions.filter(m => m.hidden);
console.log('\n合計：' + ok + ' 項通過，' + bad + ' 項失敗');
console.log('公開 ' + pub.length + ' 個（' + pub.reduce((a, m) => a + m.level, 0) + ' 顆星），隱藏 ' + hid.length + ' 個（' + hid.reduce((a, m) => a + 2 * m.level, 0) + ' 顆星）；7 級以上的隱藏任務 ' + hid.filter(m => m.level >= 7).length + ' 個');
if (bad) process.exitCode = 1;
