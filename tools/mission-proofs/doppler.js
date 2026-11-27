/* 任務可達成的證明腳本（從製作時的暫存資料夾保存下來的快照）。用法：node tools/mission-proofs/doppler.js
 * 修改物理核心或任務條件後重跑，確認每個任務仍然做得到、預設狀態不會觸發任務。 */
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
// 用物理核心證明每個任務都做得到（模擬頁面的逐幀邏輯）
const DC = require(__ROOT + 'js/doppler-core.js');
const WX = 1400;
function P(o) {
  return { f: o.f || 2, v: o.v || 340, tStart: 0, src: { x: o.sx, y: 0, vx: o.vs, vy: 0 }, obs: { x: o.ox, y: o.oy, vx: o.vo || 0, vy: 0, t0: 0 } };
}
/** 模擬一趟：傳回 boom 時刻、統計 */
function run(o, dt) {
  dt = dt || 1 / 60;
  const p = P(o);
  let t = 0, prev = null;
  const r = { ratioMax: -Infinity, ratioMin: Infinity, heardTime: 0, tBoom: null, two: false, minDist: Infinity, theta: null };
  for (let i = 0; i < 200000; i++) {
    t += dt;
    const arr = DC.arrivals(p, t);
    if (prev && arr.length > prev.length && prev.length === 0 && o.vs >= (o.v || 340) && (arr.length === 2 || Math.abs(arr[0].fp) > 5 * p.f) && r.tBoom == null) {
      let lo = t - dt, hi = t;
      for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (DC.arrivals(p, m).length) hi = m; else lo = m; }
      r.tBoom = hi; r.theta = DC.machAngle(p.v, o.vs) * 180 / Math.PI;
    }
    if (arr.length) { const q = arr[0].fp / p.f; r.ratioMax = Math.max(r.ratioMax, q); r.ratioMin = Math.min(r.ratioMin, q); r.heardTime += dt; if (arr.length === 2) r.two = true; }
    const S = DC.sourceAt(p, t), O = DC.observerAt(p, t);
    r.minDist = Math.min(r.minDist, Math.hypot(O.x - S.x, O.y - S.y));
    prev = arr;
    if (o.vs > 0 && S.x > WX / 2 + 0.45 * WX) break;
    if ((o.vo || 0) !== 0 && Math.abs(O.x) > WX / 2 - 8) break;
    if (t > 120) break;
  }
  r.tEnd = t;
  return r;
}
function at(o, t) { const a = DC.arrivals(P(o), t); return { n: a.length, ratio: a[0] ? a[0].fp / (o.f || 2) : null, fp2: a[1] ? a[1].fp : null }; }
/** 找出 cond(t) 成立的時間區間（模擬時間） */
function windowOf(o, cond, t0, t1, h) {
  let first = null, last = null;
  for (let t = t0; t <= t1; t += h) if (cond(at(o, t))) { if (first == null) first = t; last = t; }
  return first == null ? null : [first, last];
}
const out = (k, v) => console.log(k.padEnd(12), JSON.stringify(v));

// 1：波源靠近預設，暫停時 f′/f > 1.01
const appr = { vs: 120, sx: -560, ox: 250, oy: -150 };
out('L1', windowOf(appr, (m) => m.n && m.ratio > 1.01, 0, 15, 0.01));
// 2：觀察者移動預設，v_o 改成 −120：f′/f ≥ 1.30
const obsm = { vs: 0, sx: -250, ox: 560, oy: -150, vo: -120 };
out('L2', windowOf(obsm, (m) => m.n && m.ratio >= 1.3, 0, 12, 0.01));
// 3：λ前 = (340 − 140)/2 = 100 m
out('L3', DC.wavelengthAhead(2, 340, 140));
// 4：讓波源以聲速前進，用一趟完整運動驗證觀察者接收到音爆。
{
  let missions;
  global.window = { LabMission: { register: (_, list) => { missions = list; } } };
  global.LabMission = window.LabMission;
  require(__ROOT + 'js/missions/doppler.js');
  const m = missions.find(entry => entry.id === 'doppler-4'), mem = {};
  const heard = v => {
    const o = { v, vs: v, vo: 0, sx: -600, ox: 200, oy: -170 };
    const r = run(o);
    if (r.tBoom == null) throw new Error('模擬沒有產生音爆：' + v + ' m/s');
    return { type: 'boom', data: { ...o, clean: true, tBoom: r.tBoom } };
  };
  if (!m.check(heard(340), mem)) throw Error(m.id);
  // 1：波源朝觀察者駛來（us > 0）應通過；波源已遠離（us < 0）但觀察者高速追趕導致 f′/f > 1.01 不應通過
  const m1 = missions.find(entry => entry.id === 'doppler-1');
  const aOk = DC.arrivals(P(appr), 2.5)[0];
  if (!aOk || !m1.check({ type: 'measure', data: { n: 1, vs: appr.vs, us: aOk.us, ratio: aOk.fp / 2 } }, {})) {
    throw Error('doppler-1 正例應通過');
  }
  const chase = { vs: 120, sx: 200, ox: -250, oy: -50, vo: 220 };
  const aChase = DC.arrivals(P(chase), 2.0)[0];
  if (!aChase || !(aChase.fp / 2 > 1.01) || !(aChase.us < 0)) {
    throw Error('doppler-1 反例條件未成立');
  }
  if (m1.check({ type: 'measure', data: { n: 1, vs: chase.vs, us: aChase.us, ratio: aChase.fp / 2 } }, {})) {
    throw Error('doppler-1 反例：波源遠離但觀察者追趕升調不應通過');
  }
}

// ---------- 2. 新隱藏任務 ----------
{
  const assert = require('node:assert/strict');
  const missionPath = require.resolve(__ROOT + 'js/missions/doppler.js');
  let missions;
  LabMission.register = (_, list) => { missions = list; };
  delete require.cache[missionPath];
  require(missionPath);

  const defaults = { f: 2, v: 340, vs: 120, vo: 0, sx: -560, ox: 250, oy: -90 };
  const approach = { oy: -150 };
  const recede = { sx: -380, ox: -520, oy: -150 };
  const observer = { vs: 0, vo: -100, sx: -250, ox: 560, oy: -150 };
  const sonic = { vs: 340, sx: -600, ox: 200, oy: -170 };
  const supersonic = { vs: 544, sx: -620, ox: 150, oy: -200 };
  const dt = 1 / 240; // 60 Hz 顯示更新，開啟慢動作時每幀前進 1/240 s。

  function play(runs) {
    const completed = new Set(), memory = new Map(missions.map(m => [m.id, {}]));
    const readings = [];
    for (const [k, [input, pauses = [], finish = false]] of runs.entries()) {
      const o = { ...defaults, ...input };
      for (const [key, min, max, decimals] of [
        ['f', 0.5, 4, 2], ['v', 150, 600, 1], ['vs', 0, 700, 1], ['vo', -150, 150, 1]
      ]) {
        assert.ok(o[key] >= min && o[key] <= max && +o[key].toFixed(decimals) === o[key], key + '=' + o[key]);
      }
      assert.ok(Math.abs(o.sx) <= 680 && Math.abs(o.ox) < 680 && Math.abs(o.oy) <= 300, '起點在畫布內');
      // 每趟在 t = 0 前設定位置與速度。重新開始保留任務記憶，播放中途只暫停或繼續。
      const p = P(o), stats = run(o, dt);
      const emit = (type, t, extra) => {
        const S = DC.sourceAt(p, t), O = DC.observerAt(p, t);
        const data = { ...o, t, sx: S.x, ox: O.x, oy: O.y, M: o.vs / o.v,
          dist: Math.hypot(O.x - S.x, O.y - S.y), clean: true, run: k + 1, ...extra };
        readings.push({ type, data });
        for (const m of missions) {
          if (!completed.has(m.id) && m.check({ type, data }, memory.get(m.id))) completed.add(m.id);
        }
      };
      const actions = pauses.map(t => [Math.round(t / dt) * dt, 'measure']);
      if (finish) actions.push([stats.tEnd, 'runEnd']);
      const lastTime = actions.at(-1)?.[0] ?? 0;
      if (stats.tBoom != null) {
        const frameTime = Math.ceil(stats.tBoom / dt) * dt;
        if (frameTime <= lastTime) actions.unshift([frameTime, 'boom']);
      }
      actions.sort((a, b) => a[0] - b[0]);
      for (const [t, type] of actions) {
        assert.ok(t <= stats.tEnd, '量測時間不超過該趟終點');
        if (type === 'boom') {
          emit(type, t, { tBoom: stats.tBoom, theta: stats.theta });
        } else if (type === 'runEnd') {
          emit(type, t, { ...stats, heard: stats.heardTime > 0, boom: stats.tBoom != null });
        } else {
          const arrivals = DC.arrivals(p, t), [a, b] = arrivals;
          emit(type, t, { n: arrivals.length, ratio: a ? a.fp / o.f : null, fp: a?.fp ?? null,
            fp2: b?.fp ?? null, us: a?.us ?? null, uo: a?.uo ?? null,
            lambdaFront: DC.wavelengthAhead(o.f, o.v, o.vs), lambdaBack: DC.wavelengthBehind(o.f, o.v, o.vs) });
        }
      }
    }
    return { completed, readings };
  }

  function mid(window) {
    assert.ok(window, '需要可暫停量測的時間窗');
    return (window[0] + window[1]) / 2;
  }
  const newSolutions = {
    'doppler-h4': [[{ ...recede, v: 390, vs: 130, f: 2.4 }, [2]]],
    'doppler-h5': [[{ ...recede, vs: 85, f: 1.3 }, [4]], [{ ...recede, vs: 85, f: 2.6 }, [4]]],
    'doppler-h6': [[{ ...approach, vs: 85, vo: -85, oy: -15 }, [3]]],
    'doppler-h7': [[{ ...supersonic, v: 250, vs: 350 }, [], true],
      [{ ...supersonic, v: 400, vs: 560 }, [], true]],
    'doppler-h8': [[{ ...supersonic, oy: -110 }, [], true], [{ ...supersonic, oy: -220 }, [], true]],
    'doppler-h9': [[observer, [4.6, 11.6]]],
    'doppler-h10': [[{ ...supersonic, vs: 612 }, [], true], [{ ...supersonic, vs: 612, vo: 120 }, [], true]]
  };
  const hidden = missions.filter(m => m.hidden);
  const ids = Object.keys(newSolutions);
  const newDone = completed => [...completed].filter(id => ids.includes(id));
  try {
    assert.equal(hidden.length, 10);
    assert.ok(hidden.every(m => Number.isInteger(m.level) && m.level >= 3 && m.level <= 10));
    assert.ok(hidden.filter(m => m.level > 7).length >= 3);
    assert.deepEqual(newDone(play([[{}, [], true]]).completed), [], '載入後預設自動播放至結束');
    assert.deepEqual(newDone(play([[{}, [1]]]).completed), [], '只在預設播放途中按一次暫停');
    for (const [id, runs] of Object.entries(newSolutions)) {
      const { completed, readings } = play(runs);
      console.log(id, '各趟設定、暫停秒數、是否跑完', JSON.stringify(runs.map(([o, ...rest]) => [{ ...defaults, ...o }, ...rest])),
        '讀數', JSON.stringify(readings.filter(r => r.type !== 'runEnd').map(({ type, data: d }) => type === 'boom'
          ? { type, tBoom_s: +d.tBoom.toFixed(6), theta_deg: +d.theta.toFixed(4), M: d.M }
          : { type, t_s: +d.t.toFixed(4), xObs_m: +d.ox.toFixed(2), n: d.n, fp_Hz: d.fp,
            ratio: d.ratio, lambdaFront_m: d.lambdaFront, lambdaBack_m: d.lambdaBack })));
      assert.deepEqual([...completed].filter(x => hidden.some(m => m.id === x)), [id], id + ' 隱藏任務互斥');
    }
    assert.deepEqual(newDone(play([[observer, [4.6]], [{ ...observer, f: 3 }, [11.6]]]).completed), [],
      'h9 拆成兩趟（各暫停一次）不能完成：要同一趟走過波源');
    const movingSource = { ...defaults, ...approach, vs: 80 };
    const movingListener = { ...defaults, ...observer, vo: -120.3 };
    const ratio = at(movingSource, 3).ratio;
    const listenerTime = mid(windowOf(movingListener, m => m.n === 1 && Math.abs(m.ratio - ratio) <= 0.005 * ratio, 0, 6, 0.005));
    const oldSolutions = {
      'doppler-1': [[approach, [3]]],
      'doppler-2': [[{ ...observer, vo: -120 }, [2]]],
      'doppler-3': [[{ ...approach, vs: 140 }, [2]]],
      'doppler-4': [[sonic, [], true]],
      'doppler-5': [[{ vs: 170, ox: 400, oy: 0 }, [3]]],
      'doppler-6': [[approach, [mid(windowOf({ ...defaults, ...approach },
        m => m.n === 1 && Math.abs(m.ratio - 1) <= 0.005, 6, 9, 0.0005))]]],
      'doppler-7': [[{ ...supersonic, vs: 680 }, [], true]],
      'doppler-8': [[movingSource, [3]], [movingListener, [listenerTime]]],
      'doppler-9': [[{ ...approach, ox: -400, vo: 120 }, [], true]],
      'doppler-10': [[{ ...supersonic, v: 250, vs: 400, ox: 330 }, [], true]],
      'doppler-h1': [[{ ...observer, v: 150, ox: -350, oy: -50, vo: 150 }, [3.5]]],
      'doppler-h2': [[supersonic, [mid(windowOf({ ...defaults, ...supersonic }, m => m.n === 2, 0, 4, 0.001))]]],
      'doppler-h3': [[{ ...approach, oy: 0 }, [], true]]
    };
    const combined = play(Object.values(oldSolutions).flat()).completed;
    assert.deepEqual(newDone(combined), [], '依序完成一般任務與 h1–h3');
    assert.deepEqual(missions.filter(m => !ids.includes(m.id) && !combined.has(m.id)).map(m => m.id), [],
      '一般任務與 h1–h3 都必須完成');
    console.log('✓ 共 10 個隱藏任務，等級、互斥、預設、單一操作與舊任務連做均通過');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
