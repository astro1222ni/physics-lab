/* 任務可達成的證明腳本（從製作時的暫存資料夾保存下來的快照）。用法：node tools/mission-proofs/electric-field.cjs
 * 修改物理核心或任務條件後重跑，確認每個任務仍然做得到、預設狀態不會觸發任務。 */
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const FC = require(__ROOT + 'js/field-core.js');
let defs = [];
global.LabMission = { register: (id, list) => { defs = list.map(m => Object.assign({ mem: {} }, m)); } }; global.window = { LabMission: global.LabMission };
require(__ROOT + 'js/missions/electric-field.js');
const W = 12, H = 8, VIEW = { x0: 0, x1: W, y0: 0, y1: H };
const byId = id => defs.find(m => m.id === 'electric-field-' + id);
function src(qA, qB, d) { return [{ x: W / 2 - d / 2, y: H / 2, q: qA, label: 'A' }, { x: W / 2 + d / 2, y: H / 2, q: qB, label: 'B' }]; }
function snapshot(ch, x, y, q, m) {
  const i = FC.probeInfo(ch, x, y);
  return { qA: ch[0].q, qB: ch[1].q, xA: ch[0].x, yA: ch[0].y, xB: ch[1].x, yB: ch[1].y, d: Math.hypot(ch[0].x - ch[1].x, ch[0].y - ch[1].y),
    x, y, q, m, ex: i.ex, ey: i.ey, E: i.E, Esum: i.Esum, dir: i.dir, V: i.V, Vsum: i.Vsum };
}
const sig = ch => ch.map(c => [c.x, c.y, c.q].join(',')).join(';');
/** 模擬頁面：釋放後每幀推進，產生 return / pause / end 事件 */
function run(ch, x, y, q, m, opts) {
  opts = opts || {}; const evs = [];
  const p = { x, y, vx: 0, vy: 0, q, m };
  const r = { x0: x, y0: y, V0: FC.potentialAt(ch, x, y), total0: FC.energy(ch, p).total, clean: true, maxD: 0, returned: false };
  const data = () => { const en = FC.energy(ch, p); return Object.assign(snapshot(ch, p.x, p.y, q, m), { x0: r.x0, y0: r.y0, V0: r.V0, total0: r.total0, clean: r.clean, sig: sig(ch), v: Math.hypot(p.vx, p.vy) * 100, K: en.K, U: en.U, total: en.total }); };
  for (let f = 0; f < (opts.frames || 60 * 60); f++) {
    const stop = FC.advance(ch, p, opts.dt || 1 / 60, { bounds: VIEW, stopRadius: 0.3 });
    const dist = Math.hypot(p.x - x, p.y - y); r.maxD = Math.max(r.maxD, dist);
    if (!r.returned && r.maxD >= 1 && dist < 0.15) { r.returned = true; evs.push({ type: 'return', data: { x0: x, y0: y, dist, maxDist: r.maxD, qA: ch[0].q, qB: ch[1].q, q, m, clean: true } }); }
    if (opts.pauseIf && opts.pauseIf(p)) evs.push({ type: 'pause', data: data() });
    if (stop) { evs.push({ type: 'end', data: Object.assign(data(), { reason: stop.reason, hit: stop.charge != null ? stop.charge : -1, hitQ: stop.reason === 'hit' ? ch[stop.charge].q : 0 }) }); break; }
  }
  return evs;
}
function feed(m, evs) { let ok = false; evs.forEach(e => { if (m.check(e, m.mem)) ok = true; }); return ok; }
const probeEv = (ch, x, y, q = 1, m = 1) => ({ type: 'probe', data: Object.assign(snapshot(ch, x, y, q, m), { key: 'probe' }) });
function fresh() { defs.forEach(d => d.mem = {}); }
const results = [];
function prove(id, desc, fn) { fresh(); const m = defs.find(d => d.id === 'electric-field-' + id); const ok = fn(m); results.push([id, m.level, ok, desc]); }
/** 在解附近（±r cm）以 0.01 cm 格點檢查有多少點也成立（點擊容錯） */
function tolerance(m, ch, x, y, r = 0.06) { let n = 0, t = 0; for (let dx = -r; dx <= r + 1e-9; dx += 0.01) for (let dy = -r; dy <= r + 1e-9; dy += 0.01) { t++; if (m.check(probeEv(ch, x + dx, y + dy), {})) n++; } return n + '/' + t; }

// ---- solutions ----
prove('1', '電偶極預設 ±3 nC、d=4；試探 +1 nC 從 (4.5, 4) 釋放 → 撞上 B', m => feed(m, run(src(3, -3, 4), 4.5, 4, 1, 1)));
prove('2', '「單一電荷」預設（A=+3、B=0），試探 +1 nC 從 (8, 4) 釋放 → 離開畫面', m => feed(m, run([{ x: 6, y: 4, q: 3 }, { x: 10.5, y: 1.5, q: 0 }], 8, 4, 1, 1)));
prove('3', '電偶極 ±3、d=4，試探 −1 nC 從 (10, 4) 釋放 → 向右離開', m => feed(m, run(src(3, -3, 4), 10, 4, -1, 1)));
prove('4', '等量同號 +3、+3、d=9，試探放在中點 (6, 4)', m => { const ch = src(3, 3, 9); console.log('  4 tol', tolerance(m, ch, 6, 4, 0.12)); return feed(m, [probeEv(ch, 6, 4)]); });
prove('5', '不等量 +4、−2、d=4；放在零電位圓最右點 (12.0, 4)… 改用最上點 (9.33, 6.67)', m => { const ch = src(4, -2, 4); console.log('  5 tol', tolerance(m, ch, 9.333, 6.667, 0.1)); return feed(m, [probeEv(ch, 9.333, 6.667)]); });
prove('6', '電偶極 ±3、d=4；放在 A 左上方 (3.3, 6.8)', m => { const ch = src(3, -3, 4); let best = null; for (let y = 6.6; y <= 7; y += 0.01) { const e = probeEv(ch, 3.3, y); if (m.check(e, {})) { best = y; break; } } console.log('  6 at y', best && best.toFixed(2), 'tol', tolerance(m, ch, 3.3, best + 0.03)); return best != null; });
prove('7', '電偶極 ±3、d=4，試探 +1 nC 從 (2, 6) 釋放：m=4 g 一次、改 m=1 g 再一次 → 2 倍速率', m => { const ch = src(3, -3, 4); return !feed(m, run(ch, 2, 6, 1, 4)) && feed(m, run(ch, 2, 6, 1, 1)); });
prove('8', '電偶極 ±3、d=4，試探 +0.1 nC、m=5 g 從 (5, 5)（V0≈+1054 V）釋放，穿越中垂線時暫停', m => {
  const ch = src(3, -3, 4); let win = 0, Kr = null;
  const evs = run(ch, 5, 5, 0.1, 5, { pauseIf: p => { const ok = Math.abs(FC.potentialAt(ch, p.x, p.y)) <= 0.05 * 1054; if (ok) win++; return ok; } });
  const pe = evs.find(e => e.type === 'pause'); if (pe) Kr = pe.data.K / (0.1e-9 * pe.data.V0);
  console.log('  8 window frames', win, '(' + (win / 60).toFixed(2) + ' s)', 'K/(qV0)=', Kr && Kr.toFixed(3));
  return feed(m, evs);
});
prove('9', '+4、−2、d=2（A 在 5、B 在 7）：零電場點在 B 外側 2/(√2−1)=4.83 cm → (11.83, 4)', m => { const ch = src(4, -2, 2); console.log('  9 tol', tolerance(m, ch, 11.83, 4, 0.1)); return feed(m, [probeEv(ch, 11.83, 4)]); });
prove('10', '電偶極 ±3、d=4，從 (3, 4) 先用 q=+1 釋放得 K1≈1.820 μJ，再改 q=+2.75 → K≈5.004 μJ', m => { const ch = src(3, -3, 4); const e1 = run(ch, 3, 4, 1, 1); console.log('  10 K1', (e1.at(-1).data.K * 1e6).toFixed(3)); const e2 = run(ch, 3, 4, 2.75, 1); console.log('  10 K2', (e2.at(-1).data.K * 1e6).toFixed(3)); return feed(m, e2); });
prove('11', '電偶極 ±1、d=6（A 在 3、B 在 9）：放在 (2.515, 6.85)', m => { const ch = src(1, -1, 6); console.log('  11 tol', tolerance(m, ch, 2.515, 6.85, 0.08)); return feed(m, [probeEv(ch, 2.515, 6.85)]); });
prove('12', '+4、−2、d=4：零電位圓（圓心 (9.33, 4)、半徑 2.67）最低點 (9.333, 1.333)', m => { const ch = src(4, -2, 4); console.log('  12 tol', tolerance(m, ch, 9.333, 1.333, 0.08)); return feed(m, [probeEv(ch, 9.333, 1.333)]); });
prove('h1', '「等量同號」預設（+3、+3、d=4，試探在 (6, 6)），把 q 改成 −1 → 沿中垂線上下振盪、回到起點', m => feed(m, run(src(3, 3, 4), 6, 6, -1, 1, { frames: 600 })));
prove('h2', 'A=+5、B=−5、間距 1 cm（滑桿最小）', m => feed(m, [probeEv(src(5, -5, 1), 6, 6)]));
prove('h3', '±5 nC、d=4；試探 +3 nC、m=0.2 g 從 A 右邊 0.75 cm (4.75, 4) 釋放 → 撞 B', m => { const evs = run(src(5, -5, 4), 4.75, 4, 3, 0.2); console.log('  h3 v', evs.at(-1).data.v.toFixed(1), 'cm/s'); return feed(m, evs); });
// h3 at 30 fps too
console.log('h3 30fps v', run(src(5, -5, 4), 4.75, 4, 3, 0.2, { dt: 1 / 30 }).at(-1).data.v.toFixed(1));
console.log('h1 30fps', run(src(3, 3, 4), 6, 6, -1, 1, { dt: 1 / 30, frames: 300 }).filter(e => e.type === 'return').length);
console.log('7 30fps ratio', (() => { const ch = src(3, -3, 4); const a = run(ch, 2, 6, 1, 4, { dt: 1 / 30 }).at(-1).data.v, b = run(ch, 2, 6, 1, 1, { dt: 1 / 30 }).at(-1).data.v; return (b / a).toFixed(4); })());
console.log('\n結果：'); results.forEach(r => console.log((r[2] ? '✓' : '✗'), r[0], 'L' + r[1], r[3]));

// ---- 預設狀態與預設情境不會觸發 ----
console.log('\n預設／預設情境（只做「放置」或直接釋放）不應觸發：');
const scen = [['default', src(3, -3, 4), 6, 6], ['dipole', src(3, -3, 4), 6, 6], ['like', src(3, 3, 4), 6, 6], ['unequal', src(4, -2, 4), 6, 6], ['single', [{ x: 6, y: 4, q: 3 }, { x: 10.5, y: 1.5, q: 0 }], 8, 4]];
scen.forEach(([n, ch, x, y]) => {
  fresh();
  const evs = [probeEv(ch, x, y)].concat(run(ch, x, y, 1, 1, { frames: 60 * 30 }));
  const hit = defs.filter(m => feed(m, evs)).map(m => m.id.replace('electric-field-', ''));
  console.log('  ', n, '→', hit.join(',') || '（無）');
});
