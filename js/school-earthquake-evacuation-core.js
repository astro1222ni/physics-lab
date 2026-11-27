/* 校園疏散。純函式；時間以廣播後實際出發為零，距離 m、時間 s、人數為整數。
 * NIST TN 1722 式 13、表 1（SFPE）：a=0.266 m^2/人、自由流密度 0.54 人/m^2；
 * 平面 k=1.40 m/s，7/11 英吋踏階 k=1.08。正式通行上限採 SFPE 第 5 版第 59 章
 * 表 59.1、59.2、59.4、59.5：自由步速 1.19／0.95 m/s，最大比流率 1.30／1.01。
 * https://link.springer.com/chapter/10.1007/978-1-4939-2565-0_59
 * https://www.scdf.gov.sg/docs/default-source/fire-safety-docs/preformance-based-approach-to-fsd/singapore-fire-engineering-guidelines-2nd-edition-%282025%29.pdf
 * https://nvlpubs.nist.gov/nistpubs/TechnicalNotes/NIST.TN.1722.pdf
 * CFPA-E 19:2023 F 表 11、SCDF 指引 4.4：走廊每側扣 0.20 m，樓梯牆、門框 0.15 m，量至扶手中心時扣 0.09 m。
 * https://cfpa-e.eu/app/uploads/2022/05/CFPA_E_Guideline_No_19_2023-F.pdf
 * https://www.scdf.gov.sg/docs/default-source/scdf-library/fssd-downloads/singapore-fire-safety-engineering-guidelines-2015_1.pdf
 * 氣象署地震測報中心 30 週年專刊圖 2-80：S 波 12600 km/h = 3.5 km/s。
 * https://scweb.cwa.gov.tw/webdata/PDF/中央氣象署地震測報中心成立30週年研討會論文集專刊.pdf
 * BGS 的典型地殼波速內選 P=6.0、S=3.5 km/s。波程 hypot(震央距離,深度)；
 * 氣象署第 84 題估算 15–20 s、通報再 1–2 s；第 86 題初估約 10–20 s。
 * 發震至本站收到設為 10–22 s，預設 17 s；深度情境 0–60 km，預設 10 km。
 * https://www.bgs.ac.uk/discovering-geology/earth-hazards/earthquakes/how-are-earthquakes-detected/
 * https://scweb.cwa.gov.tw/zh-tw/guidance/faqdetail/98
 * https://scweb.cwa.gov.tw/zh-tw/guidance/faqdetail/100
 * https://scweb.cwa.gov.tw/zh-tw/pws/info_d/2
 * https://link.springer.com/article/10.1007/s44195-023-00057-z
 * 避難步驟源自教育部國家防災日地震演練流程。https://disaster.moe.edu.tw/MOE_FILE/daolpU/news/video/1162/112年國家防災日演練計畫附件.pdf
 * https://www.moe.gov.tw/News_Content.aspx?n=9E7AC85F1954DDA8&s=15323BC98B564BE4&sms=169B8E91BB75571F
 * https://www.taivs.tp.edu.tw/static/webroot/G156445106809251/application/NW175678501030271.pdf
 * Helbing et al. (2000) https://doi.org/10.1038/35035023 、Garcimartín et al. (2014)
 * https://doi.org/10.1016/j.trpro.2014.09.085 支持特定擁擠情況下推擠會延遲通過。
 * 下方推擠函數只示範方向：自由期望速度提高到 k，入口取 3 m 排隊區，密度上限取
 * 1.5 倍臨界密度，再取基本圖下降支。這三項是自設模型，並非兩篇論文的實測係數。
 * Hamilton 等的校園演練觀察顯示班級啟動和行走時間不一。NIST TN 1839 及樓梯平台研究
 * 可見個別速度與兩股人流競合的影響。研究場域有別，以下選項為對照實驗，不作臺灣高中人口估計。
 * https://pure.atu.ie/en/publications/human-behaviour-during-evacuation-of-primary-schools-investigatio-3/
 * https://www.nist.gov/publications/movement-stairs-during-building-evacuations
 * https://www.nist.gov/publications/analysis-evacuation-travel-paths-stair-landings-means-conditional-probabilities
 * 六班開放互換起點。人數 ±20%、一般步速 0.85–1.15 倍、慢速 0.55–0.75 倍、慢速比例
 * 0–100%、班級準備時間與分散幅度為可重現的教學假設。準備時間從首個警訊起算，
 * 被停搖與廣播的安全下限截斷，再換算成廣播後延遲。所有時刻向上對齊半秒格。
 * 近、遠震按鈕只選取教學情境。距離、深度、收訊秒數分別為 (20,10,17)、(120,25,20)。
 * 兩者都再套用上述氣象署時間與 BGS 地殼波速模型，並非兩次真實地震的紀錄。
 * 所有校舍尺寸、班級配置、震動時間、0.5 s 步長及任務目標均為本虛構練習設定。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SchoolEvacuationCore = factory();
})(globalThis, function () {
  'use strict';
  const DT = 0.5, A = 0.266, FREE_D = 0.54, CRITICAL_D = 1 / (2 * A);
  const WAVE = 3.5, P_WAVE = 6, RECEIVED = 17;
  const classes = ['201', '202', '203', '301', '302', '303'];
  const limits = { size: [20, 40], west: [1, 2.4], east: [1, 2.4], corridor: [1.2, 4],
    door: [1, 3], distance: [10, 150], depth: [0, 60], received: [10, 22], shaking: [5, 60], delay: [0, 120], spread: [0, 60], slowShare: [0, 100] };
  const defaults = { size: 32, west: 1.5, east: 1.5, corridor: 2.4, door: 2, distance: 105,
    depth: 10, received: RECEIVED, delay: 0, spread: 0, slowShare: 0,
    sizesVary: false, speedsVary: false, delaysVary: false, seed: 20261127, merge: "arrival", origins: [0,1,2,3,4,5], shaking: 20, closed: -1, push: false, routes: [0, 1, 1, 0, 0, 1] };
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const classFloor = c => c < 3 ? 2 : 3;
  const roomLengths = [[9, 28], [19, 18], [29, 8]], fieldLengths = [18, 12];
  function config(input = {}) {
    const q = { ...defaults, ...input };
    for (const [key, bounds] of Object.entries(limits)) {
      const value = Number(q[key]);
      q[key] = clamp(Number.isFinite(value) ? value : defaults[key], ...bounds);
    }
    const starts = q.origins;
    q.origins = Array.isArray(starts) && starts.length === 6 && new Set(starts).size === 6 &&
      starts.every(n => Number.isInteger(n) && n >= 0 && n < 6) ? starts.slice() : defaults.origins.slice();
    q.seed = Number.isFinite(Number(q.seed)) ? Number(q.seed) >>> 0 : defaults.seed;
    q.merge = ['arrival','alternate','lower','upper'].includes(q.merge) ? q.merge : 'arrival';
    for (const key of ['sizesVary','speedsVary','delaysVary']) q[key] = q[key] === true;
    q.size = Math.round(q.size);
    q.closed = [0, 1].includes(q.closed) ? q.closed : -1;
    q.push = !!q.push;
    q.routes = classes.map((_, i) => (q.routes || defaults.routes)[i] === 1 ? 1 : 0);
    return q;
  }
  function warning({distance,depth=10,received=RECEIVED}) {
    const travel=Math.hypot(distance,depth),pArrival=travel/P_WAVE,sArrival=travel/WAVE;
    const raw=sArrival-received,blind=raw<=1e-12;
    return { raw, lead:blind?0:raw, blind, pArrival, sArrival };
  }
  function routeLength(c, side) {
    return roomLengths[c % 3][side] + (classFloor(c) - 1) * 7 + 1 + fieldLengths[side];
  }
  const shortest = classes.map((_, c) => Number(routeLength(c, 1) < routeLength(c, 0)));
  const quakePresets = {nearPreset:{distance:20,depth:10,received:17},farPreset:{distance:120,depth:25,received:20}};
  // Independent streams let a width or delay comparison reuse the same pupils.
  function draw(seed, stream, key) {
    let h = (seed ^ Math.imul(stream + 1, 0x9e3779b9) ^ Math.imul(key + 1, 0x85ebca6b)) >>> 0;
    h = Math.imul(h ^ h >>> 16, 0x21f0aaad);
    h = Math.imul(h ^ h >>> 15, 0x735a2d97);
    return ((h ^ h >>> 15) >>> 0) / 4294967296;
  }
  function population(q) {
    const lo = Math.ceil(q.size * .8), hi = Math.floor(q.size * 1.2);
    const sizes = classes.map((_, c) => q.sizesVary ? lo + Math.floor(draw(q.seed, 0, c) * (hi - lo + 1)) : q.size);
    const safe = warning(q).lead + q.shaking;
    const release = classes.map((_, c) => {
      const offset = q.delaysVary ? (2 * draw(q.seed, 1, c) - 1) * q.spread : 0;
      return Math.ceil(Math.max(0, q.delay + offset - safe) / DT) * DT;
    });
    const classOf = [], seatOf = [], groups = classes.map(() => []);
    for (let j = 0; j < Math.max(...sizes); j++) for (let c = 0; c < 6; c++) {
      if (j >= sizes[c]) continue;
      groups[c].push(classOf.length); classOf.push(c); seatOf.push(j);
    }
    const factors = new Float64Array(classOf.length).fill(1);
    let slowCount = 0;
    if (q.speedsVary) {
      const keyOf = id => seatOf[id] * 6 + classOf[id];
      const ids = classOf.map((_, id) => id).sort((a,b) => draw(q.seed,2,keyOf(a)) - draw(q.seed,2,keyOf(b)) || a-b);
      slowCount = Math.round(ids.length * q.slowShare / 100);
      ids.forEach((id, rank) => {
        const u = draw(q.seed, 3, keyOf(id));
        factors[id] = rank < slowCount ? .55 + .20 * u : .85 + .30 * u;
      });
    }
    return { sizes, release, safe, classOf, seatOf, groups, factors, slowCount };
  }
  function edge(kind, length, width, left, right) {
    const k = kind === 'stair' ? 1.08 : 1.4;
    const boundary = { hall: 0.20, door: 0.15, stair: 0.15, field: 0 }[kind];
    // Width in this building is wall to wall. For a handrail-centre span use 0.09 m on that side.
    const effective = Math.max(0, width - (left ?? boundary) - (right ?? boundary));
    const specific=kind==='stair'?1.01:1.30;
    return { kind, length, width, effective, k, free: speed(k, 0), specific, cap: effective * specific };
  }
  function speed(k, density) { return density<FREE_D?(k===1.08?.95:1.19):Math.max(0,k*(1-A*density)); }
  function crowdedFactor(density) {
    const r = clamp(density / CRITICAL_D, 1, 1.5);
    return r * (2 - r);
  }
  // Each FIFO has a service budget in persons per tick. Idle queues cannot bank spare capacity.
  // ready, enter and leave are integer ticks. Ties at a merge alternate by pupil then class.
  function pass(ids, link, ready, push, visit, people, merge = "arrival", origins) {
    if (!ids.length) return { firstStart: null, last: 0, peak: 0, maxDensity: 0, minFactor: 1 };
    if (!(link.cap > 0)) throw new RangeError('A closed passage cannot serve an assigned queue.');
    ids.sort((x, y) => ready[x] - ready[y] || x - y);
    const exits = new Int32Array(ids.length);
    const streams = [[], []], offsets = [0,0], arbitrate = merge !== 'arrival';
    let turn = 0, maxDensity = 0, minFactor = 1, firstStart = null;
    const pending = arbitrate ? ids.slice() : ids;
    // A floor may take precedence only over people already waiting at this landing.
    function nextPupil() {
      if (!arbitrate) return ids[head];
      let f = merge === 'alternate' ? turn : Number(merge === 'upper');
      if (offsets[f] === streams[f].length) f = 1 - f;
      turn = 1 - f;
      return streams[f][offsets[f]++];
    }
    let head = 0, arrived = 0, left = 0, tick = ready[ids[0]], credit = 0, peak = 0;
    while (head < ids.length) {
      if (arrived === head && ready[pending[head]] > tick) { tick = ready[pending[head]]; credit = 0; }
      while (arrived < ids.length && ready[pending[arrived]] <= tick) {
        const id = pending[arrived++];
        if (arbitrate) streams[Number(origins[people.classOf[id]] >= 3)].push(id);
      }
      while (left < head && exits[left] <= tick) left++;
      const queue = arrived - head;
      const desiredFree=push?link.k:link.free;
      const gateDensity=queue/(3*link.effective);
      const excessPressure=Math.max(0,gateDensity-CRITICAL_D)*(desiredFree/link.free-1);
      const atGate=link.kind==='stair'||link.kind==='door';
      const factor=atGate?crowdedFactor(CRITICAL_D+excessPressure):1;
      const flow=link.cap*factor;
      maxDensity=Math.max(maxDensity,gateDensity);minFactor=Math.min(minFactor,factor);
      peak = Math.max(peak, queue);
      credit += flow * DT;
      const n = Math.min(queue, Math.floor(credit + 1e-10));
      for (let i = 0; i < n; i++) {
        const id = nextPupil(), start = tick + 1;
        if (head === 0) firstStart = start * DT;
        const density = Math.min(CRITICAL_D, (head - left) / (link.effective * Math.max(link.length, 1)));
        const desired = (density<FREE_D?desiredFree:speed(link.k,density)) * (people ? people.factors[id] : 1);
        const finish = Math.max(head ? exits[head - 1] : 0, start + Math.ceil(link.length / desired / DT - 1e-10));
        if (visit) visit(id, ready[id], start, finish);
        exits[head++] = finish;
        ready[id] = finish;
      }
      credit=Math.max(0,credit-n);
      if(head===arrived)credit%=1;
      tick++;
    }
    return { firstStart, last: DT * exits[exits.length - 1], peak, maxDensity, minFactor };
  }
  function simulate(input, traces = true) {
    const q = config(input), people = population(q), total = people.classOf.length, ready = new Int32Array(total);
    const densities = { corridor: [0,0], stair: [0,0], stairFlowFactor: [1,1] };
    const firstMove = classes.map(() => null);
    const tracks = traces ? Array.from({ length: total }, () => []) : null;
    const sides = [[], []], upper = [[], []], feeders = [[[], []], [[], []]];
    const count = [0, 0], clear = [0, 0], peak = [0, 0], exitTicks=[[],[]];
    const first = [Infinity, Infinity], last = [0, 0], classLast = new Array(6).fill(0);
    const stalled = new Set(), ladder = [q.west, q.east].map(w => edge('stair', 7, w));
    const door = edge('door', 1, q.door), sharedHall = edge('hall', 4, q.corridor), capacities = [0, 0];
    const record = kind => tracks ? (id, wait, start, end) => tracks[id].push({ kind, wait: wait * DT, start: start * DT, end: end * DT }) : null;
    let distanceSum = 0;
    for (let c = 0; c < 6; c++) {
      const side = q.routes[c], origin = q.origins[c], group = people.groups[c];
      for (const id of group) ready[id] = people.release[c] / DT;
      if (side === q.closed) { group.forEach(id => stalled.add(id)); continue; }
      distanceSum += routeLength(origin, side) * group.length;
      count[side] += group.length;
      sides[side].push(...group);
      feeders[side][Number(origin >= 3)].push(...group);
      if (origin >= 3) upper[side].push(...group);
      const hall = pass(group, edge('hall', roomLengths[origin % 3][side] - 4, q.corridor), ready, q.push, record('hall'), people);
      firstMove[c] = hall.firstStart;
      densities.corridor[side] = Math.max(densities.corridor[side], hall.maxDensity);
    }
    for (const side of [0, 1]) {
      for (const group of feeders[side]) {
        const h = pass(group, sharedHall, ready, q.push, record('shared'), people);
        densities.corridor[side] = Math.max(densities.corridor[side], h.maxDensity);
      }
      const [low, high] = feeders[side];
      const supply = (low.length ? sharedHall.cap : 0) + (high.length ? Math.min(sharedHall.cap, ladder[side].cap) : 0);
      capacities[side] = Math.min(supply, ladder[side].cap, door.cap);
      pass(upper[side], ladder[side], ready, q.push, record('upper'), people);
      const stair = pass(sides[side], ladder[side], ready, q.push, record('lower'), people, q.merge, q.origins);
      densities.stair[side] = stair.maxDensity; densities.stairFlowFactor[side] = stair.minFactor;
      clear[side] = stair.last; peak[side] = stair.peak;
      exitTicks[side]=sides[side].map(id=>ready[id]);
      pass(sides[side], door, ready, q.push, record('door'), people);
      pass(sides[side], edge('field', fieldLengths[side], 8), ready, q.push, record('field'), people);
    }
    let end = 0;
    for (let id = 0; id < total; id++) {
      if (stalled.has(id)) continue;
      const t = ready[id] * DT, c = people.classOf[id], f = Number(q.origins[c] >= 3);
      first[f] = Math.min(first[f], t); last[f] = Math.max(last[f], t); classLast[c] = Math.max(classLast[c], t);
      end = Math.max(end, t);
    }
    const curve = new Uint16Array(Math.round(end / DT) + 1);
    for (let id = 0; id < total; id++) if (!stalled.has(id)) curve[ready[id]]++;
    for (let i = 1; i < curve.length; i++) curve[i] += curve[i - 1];
    const exitCurves=exitTicks.map(ticks=>{
      const values=new Uint16Array(curve.length);
      for(const tick of ticks)values[tick]++;
      for(let i=1;i<values.length;i++)values[i]+=values[i-1];
      return values;
    });
    const served = total - stalled.size;
    return { q, people, densities, firstMove, total, served, stalled: stalled.size, complete: served === total, end, classLast, first, last,
      clear, peak, count, capacities, capacity: capacities.reduce((sum, cap, i) => sum + (count[i] ? cap : 0), 0),
      meanDistance: served ? distanceSum / served : 0, shortest: q.routes.every((s, i) => s === shortest[q.origins[i]]),
      curve,exitCurves,stairCaps:ladder.map(l=>l.cap),tracks,chartEnd:Math.max(30,Math.ceil((end+15)/10)*10) };
  }
  function series(run,channel) {return channel==='west'?run.exitCurves[0]:channel==='east'?run.exitCurves[1]:run.curve;}
  function amount(run, t,channel='field') { const data=series(run,channel);return data[clamp(Math.floor(t/DT+1e-9),0,data.length-1)]; }
  function measure(run, x, y,channel='field') {
    const a = clamp(Math.min(x, y), 0, run.chartEnd), b = clamp(Math.max(x, y), 0, run.chartEnd);
    const samples = Array.from({ length: 5 }, (_, i) => amount(run, a + (b - a) * i / 4,channel));
    const slope = b > a ? (samples[4] - samples[0]) / (b - a) : 0;
    const step = samples[1] - samples[0];
    const capacity=channel==='field'?null:run.stairCaps[Number(channel==='east')];
    return { a, b, dt: b - a, n0: samples[0], n1: samples[4], samples, slope,channel,capacity,
      equal: step > 0 && samples.slice(1).every((v, i) => v - samples[i] === step),
      error: capacity?Math.abs(slope/capacity-1):null };
  }
  function facts(r) {
    return { total: r.total, served: r.served, complete: r.complete, end: r.end, closed: r.q.closed >= 0,
      used: r.count.filter(n => n > 0).length, stairGap: Math.abs(r.clear[0] - r.clear[1]), peak: Math.max(...r.peak),
      floorGap: r.last[1] - r.last[0], firstGap: r.first[1] - r.first[0], capacity: r.capacity };
  }
  function compare(base, next) {
    if (!base || !next || !base.complete || !next.complete) return null;
    const keys = Object.keys(defaults);
    const changed = keys.filter(k => Array.isArray(base.q[k]) ? base.q[k].some((v, i) => v !== next.q[k][i]) : base.q[k] !== next.q[k]);
    const key = changed.length === 1 ? changed[0] : '';
    return { key, changes: changed.length, priorShortest: base.shortest, delta: next.end - base.end,
      gain: 1 - next.end / base.end, growth: next.total / base.total - 1, meanDelta: next.meanDistance - base.meanDistance,
      widthDelta: ['west', 'east', 'corridor', 'door'].includes(key) ? next.q[key] - base.q[key] : 0,
      pushAdded: key === 'push' && next.q.push, baseTime: base.end, end: next.end };
  }
  // Schematic coordinates shared by the floor plan and cutaway. Heights follow the same floor changes.
  function position(run, id, time) {
    const c = run.people.classOf[id], origin = run.q.origins[c], j = run.people.seatOf[id], side = run.q.routes[c], sign = side ? 1 : -1;
    const room = (origin % 3 - 1) * 9, y = (classFloor(origin) - 1) * 4, sx = sign * 16;
    const column = Math.floor((j % 8) / 2);
    const seat = [room - 3.10 + column * 1.84 + (j % 2) * .63, y, -3.61 + Math.floor(j / 8) * 1.04];
    const lane = ((j % 5) - 2) * .17, hall = [sx + lane, y, 4];
    const place = [(c % 3 - 1) * 4.6 + (j % 8 - 3.5) * .4, 0, 13 + Number(c >= 3) * 3 + Math.floor(j / 8) * .40];
    const steps = run.tracks[id];
    if (!steps.length || time < steps[0].start) return { p: seat, kind: 'room', floor: classFloor(origin), waiting: !!steps.length && time >= 0 };
    for (const s of steps) {
      if (time >= s.end) continue;
      const v = clamp((time - s.start) / (s.end - s.start), 0, 1);
      let points, floor = classFloor(origin);
      if (s.kind === 'hall') points = [seat, [room + lane, y, 4], [sx - sign * 4 + lane, y, 4]];
      else if (s.kind === 'shared') points = [[sx - sign * 4 + lane, y, 4], hall];
      else if (s.kind === 'field') { floor = 1; points = [[sx + lane, 0, 7], [sx, 0, place[2]], place]; }
      else if (s.kind === 'door') { floor = 1; points = [[sx + lane, 0, 4], [sx + lane, 0, 7]]; }
      else {
        floor = s.kind === 'upper' ? 3 : 2;
        const top = (floor - 1) * 4;
        points = [[sx + lane, top, 4], [sx + lane, top - 2, -1], [sx + sign * 1.6 + lane, top - 2, -1],
          [sx + sign * 1.6 + lane, top - 4, 4], [sx + lane, top - 4, 4]];
      }
      const spans = points.slice(1).map((p, i) => Math.hypot(...p.map((x, a) => x - points[i][a])));
      let d = v * spans.reduce((a, b) => a + b, 0), i = 0;
      while (i < spans.length - 1 && d > spans[i]) d -= spans[i++];
      const p = points[i].map((x, a) => x + (points[i + 1][a] - x) * (d / (spans[i] || 1)));
      return { p, kind: s.kind, floor, waiting: time < s.start };
    }
    return { p: place, kind: 'assembled', floor: 1, waiting: false };
  }
  return { DT,A,FREE_D,CRITICAL_D,WAVE,P_WAVE,RECEIVED,classes,defaults,limits,shortest,quakePresets,config,warning,speed,
    crowdedFactor,edge,pass,routeLength,simulate,series,amount,measure,facts,compare,position,clamp };
});
