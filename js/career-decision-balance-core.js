/* 決策平衡單。所有模型運算只收數值，不存取 DOM、網址或儲存空間。
 * ColleGo! 大學選才與高中育才輔助系統：https://collego.edu.tw/highschool/collegelist
 * 大考中心十八學群對照：https://www.ceec.edu.tw/xmdoc/cont?sid=0K079355778709222204&xsmsid=0J325537256835299426
 * 課綱「涯 Ca-V-1、Ca-V-2、Ba-V-3」：https://stv.naer.edu.tw/data/course_outline/pta_18531_5238547_60214.pdf
 * 加法價值模型，權重代表某項從量尺最低到最高的改變有多重要：
 * https://www.gov.uk/government/publications/green-book-supplementary-guidance-multi-criteria-decision-analysis/use-of-multi-criteria-decision-analysis-in-options-appraisal-of-economic-cases
 * 翻盤距離採「第一名」的絕對權重變動：Triantaphyllou & Sánchez (1997), Decision Sciences 28, 151–194.
 * https://bit.csc.lsu.edu/trianta/Journal_PAPERS1/MCDM_SensitivityAnalysis_by_Triantaphyllou1.pdf
 * 本站在其餘權重按比例分配的截線上聯立兩條加權直線，且檢查交點位於最高分包絡線。
 * 均勻分布的半寬為 sqrt(3)σ；獨立抽樣後逐次傳播至輸出：JCGM 101:2008 §§6.4.2, 7。
 * https://www.bipm.org/en/doi/10.59161/jcgm101-2008
 * 排名接受度的解讀可參考 Lahdelma 與 Salminen (2001)：https://sal.aalto.fi/publications/abstracts/plah01.html
 * 3 個角色、6 項、1–5 分等距適配尺度、0–10 相對權重、20 小時與 2,000 次均依本站教案。
 * 下列分數、σ、隱藏目標、活動時數與殘留比例都是虛構教材設定，無實證分級或生涯預測意義。
 * 種子只供重現；EPS 解決浮點平手；任務門檻是練習目標。所有可能的抽樣值均落在 1–5。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CareerBalance = factory();
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  const BUDGET = 20, TRIALS = 2000, SEED = 11202026, EPS = 1e-9;
  const sum = a => a.reduce((s, v) => s + v, 0);
  const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
  const span = a => Math.max(...a) - Math.min(...a);
  const same = (a, b) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= EPS);
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const criteria = [
    ['興趣', 'Interest'], ['能力', 'Skills'], ['價值觀', 'Values'],
    ['未來發展', 'Prospects'], ['學習環境', 'Environment'], ['可負擔程度', 'Affordability']
  ];
  const fields = [['數理化學群', 'Math, physics & chemistry'], ['資訊學群', 'Computing'], ['建築設計學群', 'Architecture & design']];
  // 學群名稱見 ColleGo! https://collego.edu.tw/Highschool/CollegeList ；英文為介面短譯。
  fields.push(...[['工程','Engineering'],['醫藥衛生','Medicine & health'],['生命科學','Life sciences'],
    ['生物資源','Bioresources'],['地球環境','Earth & environment'],['藝術','Arts'],['社會心理','Social sciences & psychology'],
    ['大眾傳播','Communication'],['外語','Languages'],['文史哲','Humanities'],['教育','Education'],['法政','Law & politics'],
    ['管理','Management'],['財經','Finance'],['遊憩運動','Recreation & sport']].map(([zh,en])=>[zh+'學群',en]));
  const defaultFields=[0,1,2], trialChoices=[200,2000,20000];
  const presets=[[5,5,5,5,5,5],[10,3,3,3,3,3],[3,3,3,3,3,10]];
  const profiles = [
    {name:['小安', 'An'], weights:[6,5,5,4,3,3],
      mean:[[4.35,2.9,3.55,3.35,3.6,3.95],[3.55,4.35,2.9,4.05,3.6,3],[2.9,3.55,4.35,3.55,3.6,3.65]],
      sigma:[[.36,.55,.48,.62,.46,.45],[.65,.36,.58,.5,.46,.56],[.62,.55,.36,.55,.46,.52]],
      truth:[[4.65,3.9,3.9,3.65,3.5,4.1],[2.65,3.35,3.2,3.2,3.35,3.15],[4.25,4.15,4.55,4.1,4.1,3.8]]},
    {name:['小庭', 'Ting'], weights:[8,7,3,5,2,2],
      mean:[[3.4,3.1,4.25,3.5,3.4,4.2],[4.45,4.15,3,3.9,3.75,2.7],[3.65,3.65,4.4,3.6,4,3.8]],
      sigma:[[.5,.55,.4,.6,.5,.4],[.3,.44,.65,.55,.5,.65],[.63,.55,.33,.59,.47,.57]],
      truth:[[3.85,3.75,4.4,3.75,4,4.25],[3.5,3.2,3.45,3.55,3.5,3.05],[4.4,4.35,4.6,3.95,4.35,4]]},
    {name:['小宇','Yu'], weights:[3,3,2,2,2,10],
      mean:[[4.18,4.08,4.22,4.20,4.22,4.25],[4,3.75,3.25,4.05,3.5,3.45],[3.9,3.5,4.15,3.6,3.9,3.05]],
      sigma:[[.42,.48,.39,.43,.40,.42],[.55,.62,.55,.51,.62,.62],[.59,.57,.45,.6,.5,.67]],
      truth:[[4.50,4.50,4.50,4.45,4.58,4.55],[4.05,3.95,3.60,4.10,3.60,4.10],[4.15,3.90,4.18,3.80,4.05,3.75]]}
  ];
  // [學群、考量] 是活動會提供線索的格子；retain 是尚未釐清的比例。
  const activities = [
    {name:['訪談學長姊','Peer interview'], hours:3, retain:.45, cells:[[0,3],[1,3],[2,3],[0,5],[1,5],[2,5]]},
    {name:['參加設計營','Design camp'], hours:8, retain:.22, cells:[[2,0],[2,2],[2,4]]},
    {name:['試上資訊公開課','Computing open course'], hours:4, retain:.30, cells:[[1,0],[1,1]]},
    {name:['參訪校園','Campus visit'], hours:5, retain:.35, cells:[[0,4],[1,4],[2,4]]},
    {name:['試做專題作品','Mini project'], hours:6, retain:.28, cells:[[0,0],[0,1],[2,0],[2,1]]}
  ];
  function normalize(raw) {
    if (raw.length !== 6 || !raw.every(v => Number.isFinite(v) && v >= 0) || !sum(raw)) throw RangeError('weights');
    const total = sum(raw);
    return raw.map(v => v / total);
  }
  function hours(ids) { return sum(ids.map(i => activities[i].hours)); }
  function addActivity(ids, i) {
    if (!activities[i] || ids.includes(i) || hours(ids) + activities[i].hours > BUDGET) return ids;
    return ids.concat(i);
  }
  // 另外十五張卡依案例、學群及考量編號產生固定的虛構題材，沒有使用學生資料或官方分數。
  function ratingRow(profile, id) {
    const person=profiles[profile];
    if (id<3) return {mean:person.mean[id],sigma:person.sigma[id],truth:person.truth[id]};
    const row={mean:[],sigma:[],truth:[]};
    for (let c=0;c<6;c++) {
      const key=(id+1)*(c+3)*31+(profile+2)*(id+7)*19+c*c*11;
      row.mean.push((260+key%151)/100);
      row.sigma.push((20+key%31)/100);
      row.truth.push((255+(key*17+c*13)%176)/100);
    }
    return row;
  }
  // 由 m ± √3σ 落在 1–5 解出上限；參見頁首 JCGM 101 的矩形分布。
  const maxSigma=m=>Math.min(m-1,5-m)/Math.sqrt(3);
  function evidence(profile, ids = [], settings = {}) {
    const p = profiles[profile];
    if (!p || new Set(ids).size !== ids.length || !ids.every(i => activities[i]) || hours(ids) > BUDGET) throw RangeError('plan');
    const selected=settings.fields||defaultFields;
    if(selected.length!==3 || new Set(selected).size!==3 || !selected.every(i=>Number.isInteger(i)&&fields[i]))throw RangeError('fields');
    const rows=selected.map(id=>ratingRow(profile,id));
    const left = rows.map(row => row.mean.map(() => 1));
    // Canonical order also keeps overlapping updates bit-for-bit reproducible.
    for (const i of ids.slice().sort((a,b) => a-b)) {
      for (const [r,c] of activities[i].cells) left[r][c] *= activities[i].retain;
    }
    const mean=rows.map((row,r)=>row.mean.map((v,c)=>v+(row.truth[c]-v)*(1-left[r][c])));
    const sigma=rows.map((row,r)=>row.sigma.map((v,c)=>{
      const value=settings.sigma?.[selected[r]+','+c] ?? v;
      if(!Number.isFinite(value)||value<0||value>maxSigma(row.mean[c])+EPS)throw RangeError('sigma');
      return settings.fixed?0:Math.min(value*left[r][c],maxSigma(mean[r][c]));
    }));
    return {mean,sigma};
  }
  function score(mean, w) { return mean.map(row => dot(row, w)); }
  function ranking(values, eligible = defaultFields) {
    const order = eligible.slice().sort((a,b) => values[b] - values[a] || a - b);
    const tied = order.filter(i => values[order[0]] - values[i] <= EPS);
    return {order, tied, first:tied.length === 1 ? order[0] : -1, gap:order.length>1 ? Math.max(0, values[order[0]] - values[order[1]]) : 0};
  }
  function redistribute(w, k, x) {
    const rest = sum(w.filter((_, i) => i !== k));
    return w.map((v,i) => i === k ? x : (1 - x) * (rest > EPS ? v / rest : 1/5));
  }
  // Convert shares back to sliders without changing their ratios, even at a triangle vertex.
  function sliderUnits(w, previousTotal) {
    const total = Math.min(previousTotal, 10 / Math.max(...w));
    return w.map(v => clamp(v * total, 0, 10));
  }
  function pivots(mean, w, eligible = defaultFields) {
    return w.map((current, k) => {
      const off = score(mean, redistribute(w, k, 0)), on = mean.map(row => row[k]);
      const slope = on.map((v,i) => v - off[i]);
      const crossings = [], parallel = [], coincident = [], endpoints = [];
      for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) {
        if(!eligible.includes(a)||!eligible.includes(b))continue;
        const den = slope[a] - slope[b];
        if (Math.abs(den) < EPS) {
          (Math.abs(off[a]-off[b]) < EPS ? coincident : parallel).push([a,b]);
          continue;
        }
        const x = (off[b] - off[a]) / den;
        if (Math.abs(x)<=EPS || Math.abs(1-x)<=EPS) {
          endpoints.push({at:x<.5?0:1, pair:[a,b]});
        } else if (x>0 && x<1 && !crossings.some(v=>Math.abs(v-x)<=EPS)) {
          crossings.push(x);
        }
      }
      const breaks = [0,...crossings.sort((a,b)=>a-b),1];
      const leaderAt = x => ranking(off.map((v,i)=>v+x*slope[i]),eligible).first;
      // Between consecutive crossings the complete ordering is constant. A real switch
      // has two different, unique leaders, so a lower crossing or a persistent tie is excluded.
      const roots = crossings.filter((x,i)=>{
        const left=leaderAt((breaks[i]+x)/2), right=leaderAt((x+breaks[i+2])/2);
        return left>=0 && right>=0 && left!==right;
      });
      roots.sort((a,b) => Math.abs(a-current) - Math.abs(b-current) || a-b);
      return {roots,parallel,coincident,endpoints, at:roots[0] ?? null, delta:roots.length ? roots[0] - current : null,
        flat:eligible.length>1 && span(eligible.map(i=>on[i])) < EPS, endStable:eligible.length>1 && ranking(off,eligible).first >= 0 && ranking(off,eligible).first === ranking(on,eligible).first};
    });
  }
  // Fixed, independent uniform variates per cell. Reusing the same draws pairs all comparisons.
  // 非零 32 位元種子，xorshift32：Marsaglia (2003), https://www.jstatsoft.org/article/view/v008i14
  let cachedSeed, cachedDraws;
  function unitSamples(seed, trials) {
    if (!Number.isInteger(seed)||seed<1||seed>0xffffffff||!trialChoices.includes(trials))throw RangeError('sampling');
    if(seed===cachedSeed && cachedDraws.length>=trials*18)return cachedDraws;
    let s = seed;
    const table = new Float64Array(trials * 18);
    for (let j=0; j<table.length; j++) {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
      table[j] = ((s >>> 0) / 4294967296 * 2 - 1) * Math.sqrt(3);
    }
    cachedSeed=seed;cachedDraws=table;return table;
  }
  function probabilities(model, w, totals = score(model.mean, w), settings = {}, eligible = defaultFields) {
    const trials=settings.trials??TRIALS, draws=unitSamples(settings.seed??SEED,trials);
    if(!eligible.length)return [0,0,0];
    const allowed=defaultFields.map(i=>eligible.includes(i));
    const spread = model.sigma.flatMap(row => row.map((s,c) => s * w[c]));
    const wins = [0,0,0], sample = [0,0,0];
    let j = 0;
    for (let t=0; t<trials; t++) {
      for (let r=0; r<3; r++) {
        let v = totals[r];
        for (let c=0; c<6; c++) v += spread[r*6+c] * draws[j++];
        sample[r] = allowed[r]?v:-Infinity;
      }
      const max = Math.max(sample[0],sample[1],sample[2]);
      const n = (max-sample[0] <= EPS) + (max-sample[1] <= EPS) + (max-sample[2] <= EPS);
      for (let r=0; r<3; r++) if (max-sample[r] <= EPS) wins[r] += 1/n;
    }
    return wins.map(v => v / trials);
  }
  // 先以平均評分篩選，等於下限仍合格，再替合格者排名。門檻由使用者選定。
  // HM Treasury「options framework filter」：見頁首英國政府 MCDA 指引 §3。
  // 教材的 95% 單一學群抽樣誤差界取自 Hoeffding 雙尾不等式，平手的分數亦落於 [0,1]。
  // https://nowak.ece.wisc.edu/ece901_concentration.pdf
  // 各格獨立是假設；正相關另有共變異項：https://www.nist.gov/pml/nist-technical-note-1297/nist-tn-1297-appendix-law-propagation-uncertainty
  const errorBound=n=>Math.sqrt(Math.log(2/.05)/(2*n));
  function analyze(profile, raw, ids = [], settings = {}) {
    const model = evidence(profile, ids,settings), w = normalize(raw), totals = score(model.mean, w);
    const {floor=1,floorCriterion=5}=settings;
    if(!Number.isFinite(floor)||floor<1||floor>5||!Number.isInteger(floorCriterion)||!criteria[floorCriterion])throw RangeError('threshold');
    const eligible=defaultFields.filter(i=>model.mean[i][floorCriterion]>=floor);
    const rank = ranking(totals,eligible), prob = probabilities(model,w,totals,settings,eligible);
    const [a,b] = rank.order;
    const gapSigma = b===undefined?0:Math.hypot(...w.map((v,i) => v * Math.hypot(model.sigma[a][i],model.sigma[b][i])));
    const trials=settings.trials??TRIALS;
    const margin=eligible.length<2 || model.sigma.every(row=>row.every(s=>s===0))?0:errorBound(trials);
    const interval=prob.map((p,i)=>eligible.includes(i)?[Math.max(0,p-margin),Math.min(1,p+margin)]:[0,0]);
    const missionReady=eligible.length===3 && !settings.fixed && !Object.keys(settings.sigma||{}).length && trials>=TRIALS;
    return {eligible,margin,interval,missionReady,profile, raw:raw.slice(), ids:ids.slice(), model,w,totals,rank,prob,gapSigma,pivots:pivots(model.mean,w,eligible),hours:hours(ids)};
  }
  // Exact leading regions on a barycentric slice. Remaining three criterion shares stay fixed.
  function sliceWeights(w, axes, bary) {
    const mass = sum(axes.map(i => w[i]));
    const out = w.slice();
    axes.forEach((i,j) => { out[i] = mass * bary[j]; });
    return out;
  }
  function triangle(mean, w, axes, eligible = defaultFields) {
    const corners = [[1,0,0],[0,1,0],[0,0,1]];
    const v = corners.map(b => score(mean,sliceWeights(w,axes,b)));
    const diff = (p,a,b) => p.reduce((s,x,i) => s + x * (v[i][a]-v[i][b]),0);
    function cut(poly,a,b) {
      const out = [];
      for (let i=0; i<poly.length; i++) {
        const p = poly[i], q = poly[(i+1)%poly.length], f = diff(p,a,b), g = diff(q,a,b);
        if (f >= -EPS) out.push(p);
        if ((f > EPS && g < -EPS) || (f < -EPS && g > EPS)) out.push(p.map((x,k) => x + (q[k]-x) * f/(f-g)));
      }
      return out;
    }
    if(eligible.length<2)return [];
    const facets = [];
    for (let a=0; a<3; a++) for (let b=0; b<3; b++) {
      if (a===b || !eligible.includes(a) || !eligible.includes(b)) continue;
      const c = 3-a-b;
      // An identically tied pair has just one ordering over an entire face.
      if ((a>b && v.every(t=>Math.abs(t[a]-t[b])<EPS)) || (eligible.includes(c) && b>c && v.every(t=>Math.abs(t[b]-t[c])<EPS))) continue;
      const top=cut(corners,a,b);
      const poly = eligible.includes(c)?cut(top,b,c):top;
      const twiceArea=poly.reduce((s,p,i)=>{
        const q=poly[(i+1)%poly.length];return s+p[0]*q[1]-p[1]*q[0];
      },0);
      if (Math.abs(twiceArea)>EPS) facets.push({winner:a, runner:b, poly:poly.map(p=>({p, h:Math.max(0,diff(p,a,b))}))});
    }
    return facets;
  }
  function comparison(now, before) {
    const w = now.w, old = before.w;
    const one = w.map((v,k) => Math.abs(old[k]-v)>EPS && same(redistribute(old,k,v),w) ? k : -1).filter(k=>k>=0);
    const k = one.length ? one[0] : -1;
    const sameModel = now.profile === before.profile && same(now.ids.slice().sort(),before.ids.slice().sort());
    return {sameModel:+sameModel, equalShares:+same(old,w), rawChanged:+!same(before.raw,now.raw),
      single:+(k>=0), shift:k<0?0:Math.abs(old[k]-w[k]), flatShift:+(k>=0 && now.pivots[k].flat),
      oldFirst:before.rank.first, oldGap:before.rank.gap, oldChance:before.prob[before.rank.order[0]]??0, oldPeak:Math.max(...before.prob),
      sameFirst:+(now.rank.first>=0 && now.rank.first===before.rank.first),
      flipped:+(now.rank.first>=0 && before.rank.first>=0 && now.rank.first!==before.rank.first),
      probChange:Math.max(...now.prob.map((v,i)=>Math.abs(v-before.prob[i]))),
      oldSigma:before.gapSigma, scoresMoved:+!same(now.totals,before.totals)};
  }
  // 基準由學生親手留下。畫面在換案例、學群或抽樣設定時會清除它。
  function readingHistory(now,saved,k,view) {
    if(!saved || saved.profile!==now.profile)return {};
    return {savedChances:+(view==='chance' && !saved.ids.length && same(saved.w,now.w)),
      testedEndpoint:+(saved.w[k]>=1-EPS && now.w[k]<1-EPS && same(saved.ids,now.ids) &&
        saved.rank.first>=0 && saved.rank.first===now.rank.first)};
  }
  // Public mission payload contains scalar results only. Neither raw nor normalised preferences leave this core.
  function observation(now, before, criterion, axes, revised) {
    const p = now.pivots[criterion], finite = now.pivots.filter(t=>t.delta!==null).map(t=>Math.abs(t.delta));
    const best = finite.length ? Math.min(...finite) : null;
    const comparable=now.missionReady && before.missionReady;
    return Object.assign(comparison(now,before), comparable?{}:{modelLimited:1}, {
      revised:+(revised && now.missionReady && before.missionReady), first:now.rank.first, ties:now.rank.tied.length, gap:now.rank.gap,
      active:now.w.filter(v=>v>EPS).length, gapSigma:now.gapSigma, chance:now.prob[now.rank.order[0]]??0,
      probSpan:span(now.prob), scoreSpan:span(now.totals), hasPivot:+(p.delta!==null),
      distance:p.delta===null ? -1 : Math.abs(p.delta), nearest:+(best!==null && p.delta!==null && Math.abs(Math.abs(p.delta)-best)<EPS),
      flat:+p.flat, stable:+p.endStable, interior:+axes.every(i=>now.w[i]>EPS), spent:now.hours,
      regions:new Set(triangle(now.model.mean,now.w,axes,now.eligible).map(f=>f.winner)).size,
      tightened:+now.model.sigma.some((row,r)=>row.some((s,c)=>s<before.model.sigma[r][c]-EPS))
    });
  }
  return {BUDGET,TRIALS,SEED,EPS,trialChoices,presets,maxSigma,ratingRow:(profile,id)=>{const {mean,sigma}=ratingRow(profile,id);return {mean:mean.slice(),sigma:sigma.slice()};},errorBound,criteria,fields,profiles:profiles.map(p=>({name:p.name, weights:p.weights})),activities,
    sum,span,same,clamp,normalize,hours,addActivity,evidence,score,ranking,redistribute,sliderUnits,pivots,
    probabilities,analyze,sliceWeights,triangle,comparison,observation,readingHistory};
});
