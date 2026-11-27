'use strict';
const assert=require('node:assert/strict');
const C=require('../js/career-decision-balance-core.js');
const {verify}=require('../tools/mission-proofs/career-decision-balance.cjs');
const near=(a,b,tol=1e-9)=>assert(Math.abs(a-b)<=tol,a+' ≠ '+b);
const base=C.profiles[0].weights, a=C.analyze(0,base);
const tests=[
  ['學群獨立資料、三組權重與分數量尺',()=>{
    assert.equal(new Set(C.fields.map(([label])=>label)).size,18);
    for(let p=0;p<3;p++)for(let id=0;id<18;id++){
      const fields=[id,(id+1)%18,(id+2)%18];
      const record=C.ratingRow(p,id), model=C.evidence(p,[],{fields});
      assert.deepEqual(model.mean[0],record.mean);
      model.sigma[0].forEach((v,i)=>assert(v>=0 && v<=C.maxSigma(record.mean[i])+C.EPS));
    }
    assert.throws(()=>C.evidence(0,[],{fields:[1,1,2]}),RangeError);
    assert.throws(()=>C.evidence(0,[],{fields:[0,1,18]}),RangeError);
    for(const preset of C.presets)near(C.sum(C.normalize(preset)),1);
    assert(C.presets[1][0]>C.presets[1][1] && C.presets[2][5]>C.presets[2][1]);
  }],
  ['可調標準差、同種子重播、三種樣本量及信賴界',()=>{
    const conf={sigma:{'0,1':.15},seed:42};
    near(C.evidence(0,[],conf).sigma[0][1],.15);
    near(C.evidence(0,[4],conf).sigma[0][1],.15*C.activities[4].retain);
    assert.throws(()=>C.evidence(0,[],{sigma:{'0,0':1}}),RangeError);
    const samples=C.trialChoices.map(trials=>C.analyze(0,base,[],{...conf,trials}));
    for(const [i,s] of samples.entries()){
      near(C.sum(s.prob),1);near(s.margin,Math.sqrt(Math.log(40)/(2*C.trialChoices[i])));
      s.interval.forEach(([lo,hi],r)=>assert(lo>=0 && lo<=s.prob[r] && hi>=s.prob[r] && hi<=1));
      assert.deepEqual(s.prob,C.analyze(0,base,[],{...conf,trials:C.trialChoices[i]}).prob);
    }
    near(samples[0].margin/samples[2].margin,10);
    assert.notDeepEqual(samples[0].prob,samples[2].prob);
    assert.notDeepEqual(samples[1].prob,C.analyze(0,base,[],{...conf,seed:1984}).prob);
    for(const bad of [{seed:0},{seed:1.5},{trials:201}])assert.throws(()=>C.analyze(0,base,[],bad),RangeError);
    const fixed=C.analyze(0,base,[],{fixed:true});
    assert.deepEqual(fixed.prob,[1,0,0]);near(fixed.margin,0);near(fixed.gapSigma,0);
  }],
  ['最低分含等號，篩選後排名、翻盤、勝率與地形使用相同學群',()=>{
    const both=C.analyze(0,base,[],{floor:3.65});
    assert.deepEqual(both.eligible,[0,2]);assert.equal(both.prob[1],0);near(C.sum(both.prob),1);
    for(const p of both.pivots)for(const x of p.roots)near(C.ranking(C.score(both.model.mean,C.redistribute(both.w,both.pivots.indexOf(p),x)),both.eligible).gap,0);
    const facets=C.triangle(both.model.mean,both.w,[0,1,2],both.eligible);
    assert(facets.length>0 && facets.every(f=>f.winner!==1 && f.runner!==1));
    const one=C.analyze(0,base,[],{floor:3.95}),none=C.analyze(0,base,[],{floor:5});
    assert.deepEqual(one.rank.order,[0]);assert.deepEqual(one.prob,[1,0,0]);near(one.margin,0);
    assert.deepEqual(none.rank.order,[]);assert.equal(none.rank.first,-1);assert.deepEqual(none.prob,[0,0,0]);
    assert.deepEqual(C.triangle(a.model.mean,a.w,[0,1,2],none.eligible),[]);
    for(const s of [one,none])assert(Object.values(C.observation(s,s,0,[0,1,2],true)).every(Number.isFinite));
    assert.throws(()=>C.analyze(0,base,[],{floor:0}),RangeError);
  }],
  ['加權和的解析解、同比例縮放與零權重',()=>{
    near(a.totals[0],94.4/26);const b=C.analyze(0,base.map(v=>v*.4));
    a.totals.forEach((v,i)=>near(v,b.totals[i]));assert.deepEqual(a.prob,b.prob);
    assert.throws(()=>C.normalize([0,0,0,0,0,0]),RangeError);
    assert.throws(()=>C.normalize([2,1,1,0,-1,1]),RangeError);
    assert.deepEqual(C.score(a.model.mean,[0,1,0,0,0,0]),a.model.mean.map(r=>r[1]));
  }],
  ['臨界值只取最高包絡線，且交界的兩側確實翻盤',()=>{
    let n=0;
    for(const p of [0,1,2]){
      const now=C.analyze(p,C.profiles[p].weights);
      now.pivots.forEach((x,k)=>x.roots.forEach(t=>{
        const at=v=>C.ranking(C.score(now.model.mean,C.redistribute(now.w,k,v)));
        near(at(t).gap,0);assert.notEqual(at(t-1e-7).first,at(t+1e-7).first);n++;
      }));
    }
    assert(n>5);assert.equal(a.pivots[4].at,null);
    const dominated=[[3,4,4,4,4,4],[2,1,1,1,1,1],[1,2,2,2,2,2]];
    assert.equal(C.pivots(dominated,a.w)[0].at,null);
    const exceptions=C.pivots([[4,2,2,2,2,2],[3,1,1,1,1,1],[4,2,2,2,2,2]],a.w)[0];
    assert.deepEqual(exceptions.parallel,[[0,1],[1,2]]);assert.deepEqual(exceptions.coincident,[[0,2]]);
    assert.equal(exceptions.at,null);assert(a.pivots[4].endpoints.some(e=>e.at===1));
    // Identical high lines tied on one side of an intersection do not give a unique, new leader.
    assert.equal(C.pivots([[4,2,2,2,2,2],[4,2,2,2,2,2],[2,4,4,4,4,4]],a.w)[0].at,null);
    near(C.sum(C.redistribute([1,0,0,0,0,0],0,.6)),1);
  }],
  ['抽樣可重現，零散布與平手分攤的極限',()=>{
    const sigma=Array.from({length:3},()=>Array(6).fill(0));
    assert.deepEqual(C.probabilities({mean:a.model.mean,sigma},a.w),[1,0,0]);
    const ties=C.probabilities({mean:[a.model.mean[0],a.model.mean[0],a.model.mean[0]],sigma},a.w);
    ties.forEach(v=>near(v,1/3));near(C.sum(a.prob),1);assert.deepEqual(a.prob,C.analyze(0,base).prob);
  }],
  ['活動順序可交換，時間、目標格、散布與抽樣界限正確',()=>{
    for(let p=0;p<3;p++)for(let mask=0;mask<32;mask++){
      const ids=C.activities.map((_,i)=>i).filter(i=>mask&(1<<i));
      if(C.hours(ids)>C.BUDGET)continue;
      const m=C.evidence(p,ids);
      assert.deepEqual(m,C.evidence(p,ids.slice().reverse()));
      if(p===2){
        assert(m.mean[0].every((v,k)=>v>m.mean[1][k] && v>m.mean[2][k]));
        assert(C.pivots(m.mean,C.normalize(C.profiles[p].weights)).every(q=>q.at===null));
      }
      for(let r=0;r<3;r++)for(let c=0;c<6;c++){
        assert(m.mean[r][c]-Math.sqrt(3)*m.sigma[r][c]>=1 && m.mean[r][c]+Math.sqrt(3)*m.sigma[r][c]<=5);
        assert(m.sigma[r][c]<=C.evidence(p).sigma[r][c]);
      }
    }
    assert.deepEqual(C.addActivity([1,3,4],0),[1,3,4]);assert.deepEqual(C.addActivity([0],0),[0]);
    assert.throws(()=>C.evidence(0,[0,0]),RangeError);
    const w=[5,5,5,0,0,0];assert.deepEqual(C.analyze(0,w,[3]).prob,C.analyze(0,w).prob);
    const early=C.evidence(0,[0]),orig=C.evidence(0);
    for(let i=0;i<3;i++)near(early.sigma[i][3],orig.sigma[i][3]*C.activities[0].retain);
  }],
  ['三角形平面與真實地形逐面一致，覆蓋面積守恆',()=>{
    const axes=[0,1,2],facets=C.triangle(a.model.mean,a.w,axes);
    let area=0;
    for(const f of facets){
      const center=[0,0,0];
      f.poly.forEach(({p,h},i)=>{
        const w=C.sliceWeights(a.w,axes,p),s=C.score(a.model.mean,w);
        near(C.ranking(s).gap,h);near(C.sum(w),1);near(w[4],a.w[4]);
        p.forEach((v,k)=>center[k]+=v/f.poly.length);
        const q=f.poly[(i+1)%f.poly.length].p;area+=(p[0]*q[1]-p[1]*q[0])/2;
      });
      const v=C.score(a.model.mean,C.sliceWeights(a.w,axes,center));near(v[f.winner],Math.max(...v));
    }
    near(Math.abs(area),.5);assert.equal(new Set(facets.map(f=>f.winner)).size,3);
    const moved=C.sliderUnits(C.sliceWeights(a.w,axes,[1,0,0]),26);assert(Math.max(...moved)<=10);near(C.normalize(moved)[3],a.w[3]);
  }],
  ['固定其餘占比，單項差距隨占比線性變動',()=>{
    const delta=t=>{const s=C.score(a.model.mean,C.redistribute(a.w,0,t));return s[0]-s[1];};
    near(delta(.5),(delta(0)+delta(1))/2);assert(delta(.1)<delta(.5)&&delta(.5)<delta(.9));
  }],
  ['二十題各有兩解，預設與未提交不授星，逐對互斥加兩萬組成對回歸',()=>{
    const r=verify();assert.equal(Object.keys(r.witnesses).length,20);assert.equal(Object.keys(r.alternatives).length,20);
    assert.equal(r.pairs.length,190);assert.equal(r.count,20000);
  }]
];
for(const [name,fn] of tests){fn();console.log('✓ '+name);}
console.log(tests.length+' 組核心與任務驗證通過');
