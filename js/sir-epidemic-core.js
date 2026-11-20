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

  // Days, view and saved references are different observations of the same four inputs.
  function scenarioKey(d) {
    return [d.basic,d.immune,d.mask,d.air].map(value=>Number(value.toFixed(10))).join('/');
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
  function groupAt(seat, counts) {
    const rank = (seat * 137 + 89) % PEOPLE;
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

  function simulate({ basic, immune, mask, air, seed = .01 }) {
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
    return { ...settings, ...summary, ...point, counts: population(point), start: points[0],
      yesterday, tomorrow: points[Math.min(day+1, points.length-1)], maskOnlyRe: settings.basic * (1 - settings.mask) * points[0].s,
      airOnlyRe: settings.basic * (1 - settings.air) * points[0].s };
  }
  return { DAYS, PEOPLE, GAMMA, scenarioKey, casebook, reReading, population, groupAt, simulate, measurement, integrateIncidence };
});
