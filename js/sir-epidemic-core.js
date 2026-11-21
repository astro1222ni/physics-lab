(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SirEpidemicCore = factory();
})(globalThis, function () {
  'use strict';
  const DAYS = 180, PEOPLE = 400, GAMMA = 1 / 5;
  const fields = ['s', 'i', 'r'];
  const fraction = n => Math.max(0, Math.min(1, n));
  const immunityThreshold = k => k > 1 ? 1 - 1 / k : 0;

  // The marker uses the unrounded value even if the displayed number rounds to 1.000.
  function reReading(value) {
    if(value<.95||value>1.05) return {number:value.toFixed(2),side:null};
    const side=Math.abs(value-1)<=4*Number.EPSILON?0:Math.sign(value-1);
    return {number:value.toFixed(3),side};
  }

  const DEFAULT_SEED = 1121, MIXING = .078, ALPHA = .5;
  // Mastrandrea et al. (2015): two participants per recorded encounter, five school days.
  const CONTACTS = 2 * 67613 / (327 * 5);
  const bound = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  function school({classes=10, size=40, varied=false, seed=DEFAULT_SEED}={}) {
    classes=bound(Math.round(classes),4,16); size=bound(Math.round(size),20,45);
    let state=seed>>>0;
    const sizes=Array.from({length:classes},()=>{
      state=(Math.imul(state,1664525)+1013904223)>>>0;
      return varied ? bound(Math.round(size*(.75+.5*state/4294967296)),15,50) : size;
    });
    const total=sizes.reduce((a,b)=>a+b,0), starts=[], rowStarts=[];
    let offset=0, rows=0;
    for(let j=0;j<classes;j++) {
      starts.push(offset); offset+=sizes[j];
      if(j%2===0) {rowStarts.push(rows); rows+=Math.ceil(Math.max(sizes[j],sizes[j+1]||0)/10);}
    }
    return {classes,size,varied,seed:seed>>>0,sizes,total,starts,rowStarts,rows};
  }
  function schoolKey(d) {
    const cfg=d.school || {};
    return [cfg.classes??10,cfg.size??40,Number(!!cfg.varied),cfg.seed??DEFAULT_SEED,
      d.mixing??MIXING,d.origin??-1].join('/');
  }
  const defaultKey=schoolKey({});
  // Preserve keys saved by the published version for the standard school.
  function scenarioKey(d) {
    const key=[d.basic,d.immune,d.mask,d.air].map(value=>Number(value.toFixed(10))).join('/');
    const layout=schoolKey(d);
    return layout===defaultKey ? key : key+'/'+layout;
  }
  function casebook(entries=[]) {
    const pages=new Map(entries);
    return {
      owner(d) { return pages.get(scenarioKey(d)) || null; },
      record(d, matches) {
        const key=scenarioKey(d);
        if (!pages.has(key) && matches.length===1) pages.set(key,matches[0]);
        return pages.get(key) || null;
      },
      entries() { return Array.from(pages); }
    };
  }

  // Hamilton rounding. Equal remainders go to S, I, R in that order.
  function population(point, total = PEOPLE) {
    if(point.counts && point.counts.s+point.counts.i+point.counts.r===total) return point.counts;
    const raw = fields.map(key => Math.max(0, point[key]) * total);
    const whole = raw.map(Math.floor);
    const order = [0, 1, 2].sort((a, b) =>
      (raw[b] - whole[b]) - (raw[a] - whole[a]) || a - b);
    const missing = total - whole.reduce((sum, n) => sum + n, 0);
    for (let j = 0; j < missing; j++) whole[order[j]]++;
    return { s: whole[0], i: whole[1], r: whole[2] };
  }

  // The same 20 x 20 roll call in both views. A fixed permutation spreads
  // colour through the classes without implying individual contact histories.
  const multipliers = new Map([[400,137]]);
  function groupAt(seat, counts, total=PEOPLE) {
    let multiplier=multipliers.get(total);
    if(!multiplier) {
      multiplier=137;
      function gcd(a,b) {while(b) [a,b]=[b,a%b]; return a;}
      while(gcd(multiplier,total)!==1) multiplier++;
      multipliers.set(total,multiplier);
    }
    const rank = (seat * multiplier + 89) % total;
    if (rank < counts.r) return 'r';
    return rank < counts.r + counts.i ? 'i' : 's';
  }

  // Solve A = S(0) [1 - exp(-k (I(0) + A))] for the additional infections.
  function finalNew(s, i, k) {
    if (!i || !s || !k) return 0;
    let low = 0, high = s;
    for (let j = 0; j < 56; j++) {
      const a = (low + high) / 2;
      if (-s * Math.expm1(-k * (i + a)) > a) low = a;
      else high = a;
    }
    return (low + high) / 2;
  }

  function singleGroup({ basic, immune, mask, air, seed = .01 }) {
    const immune0 = fraction(immune);
    const i0 = Math.min(fraction(seed), 1 - immune0);
    const s0 = Math.max(0, 1 - immune0 - i0);
    const effective = Math.max(0, basic) * (1 - fraction(mask)) * (1 - fraction(air));
    const beta = GAMMA * effective;
    const initialRe = effective * s0;
    function rate(s, i) {
      const flow = beta * s * i;
      return [-flow, flow - GAMMA * i];
    }
    function step(s, i, h) {
      const a = rate(s, i);
      const b = rate(s + h * a[0] / 2, i + h * a[1] / 2);
      const c = rate(s + h * b[0] / 2, i + h * b[1] / 2);
      const d = rate(s + h * c[0], i + h * c[1]);
      const nextS = Math.max(0, Math.min(s, s + h/6 * (a[0] + 2*b[0] + 2*c[0] + d[0])));
      const nextI = i + h/6 * (a[1] + 2*b[1] + 2*c[1] + d[1]);
      return [nextS, Math.max(0, Math.min(1 - nextS, i + (s - nextS), nextI))];
    }
    const h = .1;
    function locateZero(day, s, i, indicator) {
      let low = 0, high = h;
      for (let k = 0; k < 36; k++) {
        const mid = (low + high) / 2;
        if (indicator(...step(s, i, mid)) > 0) low = mid;
        else high = mid;
      }
      const offset = (low + high) / 2, [sc, ic] = step(s, i, offset);
      return { day: day + offset, s: sc, i: ic, re: effective * sc };
    }
    const excess = s => effective * s - 1;
    const growth = (s, i) => beta * s * i - GAMMA * i;
    const rising = i0 > 0 && initialRe > 1 + 4*Number.EPSILON;
    let s = s0, i = i0, peak = i0, peakDay = 0, peaked = false, crossing = null;
    function point(day, r, dailyNew) {
      return { day, s, i, r, re: effective * s, cumulativeInfected: s0 - s,
        dailyIncidence: beta * s * i, dailyNew };
    }
    const points = [point(0, immune0, 0)];
    for (let n = 1; n <= DAYS * 10; n++) {
      const [nextS, nextI] = step(s, i, h);
      const dayBefore = (n - 1) / 10;
      if (rising && !crossing && excess(s) > 0 && excess(nextS) <= 0) {
        crossing = locateZero(dayBefore, s, i, excess);
      }
      if (rising && !peaked && growth(s,i) > 0 && growth(nextS,nextI) <= 0) {
        const top = locateZero(dayBefore, s, i, growth);
        peak = top.i; peakDay = top.day; peaked = true;
      } else if (rising && !peaked && nextI > peak) {
        peak = nextI; peakDay = n / 10;
      }
      s = nextS; i = nextI;
      if (n % 10 === 0) {
        const dailyNew = points[points.length - 1].s - s;
        points.push(point(n / 10, fraction(1 - s - i), dailyNew));
      }
    }
    const finalInfected = i0 + finalNew(s0, i0, effective);
    return {
      points, initialRe, effective, peak, peakDay, crossing, reCrossDay: crossing?.day ?? null,
      newByEnd: s0 - s, finalInfected, finalNonSusceptible: fraction(immune0 + finalInfected),
      threshold: immunityThreshold(basic), effectiveThreshold: immunityThreshold(effective)
    };
  }

  // In class-fraction coordinates the next-generation matrix is diag(s * local)
  // plus the rank-one product (s * pool) weights'. This is similar to the
  // matrix in headcounts and has the same eigenvalues.
  function radius(s, local, pool, weights) {
    const diag=s.map((v,j)=>v*local[j]);
    let lo=Math.max(...diag);
    const mass=s.reduce((sum,v,j)=>sum+v*weights[j],0)*pool;
    if(!mass || diag.every(v=>v===lo)) return lo+mass;
    let hi=lo+mass;
    for(let k=0;k<48;k++) {
      const x=(lo+hi)/2;
      if(x===lo || x===hi) break;
      let sum=0;
      for(let j=0;j<s.length;j++) if(s[j]) sum+=pool*weights[j]*s[j]/(x-diag[j]);
      if(sum>1) lo=x; else hi=x;
    }
    return (lo+hi)/2;
  }

  // For a candidate school-wide attack fraction z, each class has a scalar
  // final-size equation. The outer bisection enforces their weighted sum.
  function finalSizes(s,i,local,pool,weights,k) {
    function attack(j,z) {
      const force=k*(local[j]*i[j]+pool*z);
      if(!force || !s[j]) return 0;
      let lo=0, hi=s[j];
      for(let n=0;n<48;n++) {
        const a=(lo+hi)/2;
        if(-s[j]*Math.expm1(-force-k*local[j]*a)>a) lo=a; else hi=a;
      }
      return (lo+hi)/2;
    }
    let lo=i.reduce((sum,v,j)=>sum+weights[j]*v,0), hi=1;
    if(!lo) return i.slice();
    if(pool && k) for(let n=0;n<48;n++) {
      const z=(lo+hi)/2;
      const total=i.reduce((sum,v,j)=>sum+weights[j]*(v+attack(j,z)),0);
      if(total>z) lo=z; else hi=z;
    }
    return i.map((v,j)=>v+attack(j,(lo+hi)/2));
  }

  function grouped(settings, campus, local, pool, origin) {
    const {sizes,total}=campus, n=sizes.length, w=sizes.map(v=>v/total);
    const avg=a=>a.reduce((sum,v,j)=>sum+v*w[j],0);
    const immune=fraction(settings.immune), seed=fraction(settings.seed??.01);
    const initialI=w.map((weight,j)=>Math.min(1-immune,origin<0?seed:j===origin?seed/weight:0));
    const initialS=initialI.map(v=>Math.max(0,1-immune-v)), s0=avg(initialS);
    const basic=settings.basic, k=basic*(1-fraction(settings.mask))*(1-fraction(settings.air));
    const schoolR0=basic*radius(w.map(()=>1),local,pool,w), effective=schoolR0*(1-settings.mask)*(1-settings.air);
    const initialFactor=radius(initialS,local,pool,w);
    const initialRe=k*initialFactor;
    // State = [class S fractions, class I fractions]. R follows from conservation.
    function rate(state,out) {
      let meanI=0;
      for(let j=0;j<n;j++) meanI+=w[j]*state[n+j];
      for(let j=0;j<n;j++) {
        const flow=GAMMA*k*state[j]*(local[j]*state[n+j]+pool*meanI);
        out[j]=-flow; out[n+j]=flow-GAMMA*state[n+j];
      }
    }
    const temp=new Float64Array(2*n), stages=Array.from({length:4},()=>new Float64Array(2*n));
    function step(state,h,out) {
      rate(state,stages[0]);
      for(let a=1;a<4;a++) {
        const dt=a===3?h:h/2;
        for(let j=0;j<temp.length;j++) temp[j]=state[j]+dt*stages[a-1][j];
        rate(temp,stages[a]);
      }
      for(let j=0;j<temp.length;j++) out[j]=state[j]+h/6*(stages[0][j]+2*stages[1][j]+2*stages[2][j]+stages[3][j]);
    }
    const sPart=y=>Array.from(y.subarray(0,n)), iPart=y=>Array.from(y.subarray(n));
    function measureState(y,day) {
      const ss=sPart(y), ii=iPart(y), s=avg(ss), i=avg(ii);
      const dailyIncidence=GAMMA*k*ss.reduce((sum,v,j)=>sum+w[j]*v*(local[j]*ii[j]+pool*i),0);
      return {day,s,i,r:fraction(1-s-i),re:k*radius(ss,local,pool,w),dailyIncidence,
        cumulativeInfected:s0-s,groups:ss.map((v,j)=>({s:v,i:ii[j],r:fraction(1-v-ii[j])}))};
    }
    let y=Float64Array.from(initialS.concat(initialI)), next=new Float64Array(2*n);
    const first=measureState(y,0); first.dailyNew=0;
    const points=[first], trial=new Float64Array(2*n);
    let peak=first.i, peakDay=0, crossing=null;
    function growth(state) {
      rate(state,temp);
      let v=0; for(let j=0;j<n;j++) v+=w[j]*temp[n+j];
      return v;
    }
    function locate(state,day,indicator) {
      let lo=0,hi=.1;
      for(let m=0;m<36;m++) {
        const mid=(lo+hi)/2;
        step(state,mid,trial);
        if(indicator(trial)>0) lo=mid; else hi=mid;
      }
      step(state,(lo+hi)/2,trial);
      return measureState(trial,day+(lo+hi)/2);
    }
    let previousGrowth=growth(y);
    for(let day=1;day<=DAYS;day++) {
      const yesterday=y.slice();
      for(let a=0;a<10;a++) {
        step(y,.1,next);
        const g=growth(next);
        if(previousGrowth>0 && g<=0) {
          const top=locate(y,day-1+a/10,growth);
          if(top.i>peak) {peak=top.i;peakDay=top.day;}
        }
        previousGrowth=g;
        [y,next]=[next,y];
      }
      const p=measureState(y,day), prev=points[day-1];
      if(!crossing && prev.re>1 && p.re<=1) {
        let left=yesterday, right=new Float64Array(2*n);
        const excess=state=>k*radius(sPart(state),local,pool,w)-1;
        for(let a=0;a<10;a++) {
          step(left,.1,right);
          if(excess(right)<=0) {crossing=locate(left,day-1+a/10,excess);break;}
          [left,right]=[right,left];
        }
      }
      if(p.i>peak) {peak=p.i;peakDay=day;}
      p.dailyNew=prev.s-p.s; points.push(p);
    }
    const finalByClass=finalSizes(initialS,initialI,local,pool,w,k), finalInfected=avg(finalByClass);
    return {points,schoolR0,initialFactor,initialRe,effective,peak,peakDay,crossing,reCrossDay:crossing?.day??null,
      newByEnd:points[DAYS].cumulativeInfected,finalByClass,finalInfected,finalNonSusceptible:fraction(immune+finalInfected),
      threshold:immunityThreshold(schoolR0),effectiveThreshold:immunityThreshold(effective)};
  }

  // Walk back from the last roll. Preserve Hamilton headcounts whenever they
  // fit the next day; otherwise move the fewest seats while retaining I.
  function roundedDay(point,total,later) {
    const raw=population(point,total);
    if(!later || raw.s>=later.s && raw.r<=later.r) return raw;
    const s=Math.max(raw.s,later.s,total-raw.i-later.r);
    const r=Math.max(0,total-s-raw.i);
    return {s,i:total-s-r,r};
  }
  // Apportion the rounded school totals using each class's fractional deficit.
  // A seat can leave S or enter R once, even when a pupil revisits an earlier day.
  function classRegisters(points,campus) {
    const {sizes}=campus;
    const counts=sizes.map(n=>({s:n,i:0,r:0}));
    function distribute(amount,from,to,groups,score) {
      while(amount-->0) {
        let best=-1, bestScore=-Infinity;
        for(let j=0;j<sizes.length;j++) {
          if(!counts[j][from]) continue;
          const value=score(counts[j],groups[j],sizes[j]);
          if(value>bestScore) {best=j;bestScore=value;}
        }
        counts[best][from]--;counts[best][to]++;
      }
    }
    points.forEach((p,day)=>{
      const groups=p.groups || sizes.map(()=>p);
      if(day===0) {
        distribute(p.counts.i,'s','i',groups,(c,g,n)=>n*g.i-c.i);
        distribute(p.counts.r,'s','r',groups,(c,g,n)=>n*g.r-c.r);
      } else {
        const prev=points[day-1].counts;
        distribute(prev.s-p.counts.s,'s','i',groups,(c,g,n)=>c.s-n*g.s);
        distribute(p.counts.r-prev.r,'i','r',groups,(c,g,n)=>n*g.r-c.r);
      }
      p.classCounts=counts.map(c=>({...c}));
    });
  }
  // Closed classrooms without initial cases keep their opening register for the
  // whole run. Rounding the school first could otherwise put a red seat there.
  function isolatedRegisters(points,campus,origin) {
    const {sizes}=campus;
    const raw=sizes.map((n,j)=>j===origin?0:n*points[0].groups[j].r);
    const removed=raw.map(Math.floor);
    const byRemainder=sizes.map((_,j)=>j).filter(j=>j!==origin)
      .sort((a,b)=>(raw[b]-removed[b])-(raw[a]-removed[a]));
    const extra=Math.round(raw.reduce((a,b)=>a+b,0))-removed.reduce((a,b)=>a+b,0);
    for(const j of byRemainder.slice(0,extra)) removed[j]++;
    const fixed=sizes.map((n,j)=>({s:n-removed[j],i:0,r:removed[j]}));
    let later=null;
    for(let day=points.length-1;day>=0;day--) {
      const p=points[day];
      later=roundedDay(p.groups[origin],sizes[origin],later);
      p.classCounts=fixed.slice();
      p.classCounts[origin]=later;
      p.counts=p.classCounts.reduce((a,b)=>({s:a.s+b.s,i:a.i+b.i,r:a.r+b.r}),{s:0,i:0,r:0});
    }
  }
  function simulate(settings) {
    const campus=school(settings.school), mixing=settings.mixing??MIXING, origin=settings.origin??-1;
    const local=campus.sizes.map(size=>(1-mixing)*(size/40)**ALPHA);
    const pool=mixing*(campus.total/PEOPLE)**ALPHA;
    const symmetric=origin<0 && campus.sizes.every(n=>n===campus.sizes[0]);
    const legacy=origin<0 && !campus.varied && campus.classes===10 && campus.size===40;
    let result;
    if(symmetric) {
      const scale=local[0]+pool, schoolR0=settings.basic*scale;
      result=singleGroup({...settings,basic:schoolR0});
      result.schoolR0=schoolR0; result.initialFactor=scale*result.points[0].s;
    } else result=grouped(settings,campus,local,pool,origin);
    result.campus=campus; result.legacy=legacy;
    result.contacts=local.map(v=>CONTACTS*(v+pool));
    if(mixing===0 && origin>=0) {
      isolatedRegisters(result.points,campus,origin);
      return result;
    }
    let later=null;
    for(let day=DAYS;day>=0;day--) {
      const p=result.points[day];
      // 11/21：點名一律取整成易感不增、移出不減（試玩 T5），標準學校也一樣。
      p.counts=roundedDay(p,campus.total,later);
      later=p.counts;
    }
    if(!legacy) classRegisters(result.points,campus);
    return result;
  }

  function seatAt(campus,j,index) {
    const row=campus.rowStarts[Math.floor(j/2)]+Math.floor(index/10), col=(j%2)*10+index%10;
    return {row,col,oldSeat:row*20+col,seat:campus.starts[j]+index};
  }
  function seatGroup(d,j,index) {
    if(d.legacy) return groupAt(seatAt(d.campus,j,index).oldSeat,d.counts);
    return groupAt(index,d.classCounts[j],d.campus.sizes[j]);
  }

  // Integrate the sampled instantaneous rate for playback, splitting at day boundaries.
  function integrateIncidence(points, from, to) {
    const end = Math.min(to, points.length - 1);
    let t = Math.max(0, from), total = 0;
    while (t < end) {
      const day = Math.floor(t), next = Math.min(day + 1, end);
      const startRate = points[day].dailyIncidence;
      const slope = points[day + 1].dailyIncidence - startRate;
      total += (next - t) * (startRate + slope * ((t + next)/2 - day));
      t = next;
    }
    return total;
  }

  function measurement(settings, result, day) {
    const { points, ...summary } = result;
    const point = points[day], yesterday = points[Math.max(0, day - 1)];
    return { ...settings, ...summary, ...point, start: points[0], schoolKey:schoolKey(settings),
      yesterday, tomorrow: points[Math.min(day+1, points.length-1)], maskOnlyRe: settings.basic * (1 - settings.mask) * result.initialFactor,
      airOnlyRe: settings.basic * (1 - settings.air) * result.initialFactor };
  }
  return { DAYS, PEOPLE, GAMMA, MIXING, DEFAULT_SEED, school, schoolKey, scenarioKey, casebook, reReading,
    population, groupAt, seatAt, seatGroup, simulate, measurement, integrateIncidence };
});
