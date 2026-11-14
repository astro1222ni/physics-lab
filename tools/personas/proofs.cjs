'use strict';



const click = target => ({ op: 'click', target });
const press = (target, key) => ({ op: 'press', target, key });
const value = (target, n, editor = true, commit = true) => ({ op: 'value', target, value: String(n), editor, commit });
const times = (count, target) => Array.from({ length: count }, () => click(target));
const sequence = (slug, data) => Object.fromEntries(Object.entries(data).map(([id, actions]) => [slug + '-' + id, actions.flat()]));

// tools/mission-proofs/projectile.js 的 SOL。每發的預設參數與頁面一致，保留未變更的值以縮短路徑。
function projectile() {
  const def = { v0: 20, theta: 45, h0: 0, g: 9.8, drag: false, k: 0.01 };
  const witnesses = {
    1: [{}], 2: [{ v0: 32 }], 3: [{ theta: 0, h0: 20, v0: 10 }, { theta: 0, h0: 20, v0: 25 }],
    4: [{ theta: 30 }, { theta: 60 }], 5: [{ h0: 40, theta: 30 }], 6: [{ h0: 20, v0: 21.5, theta: 8 }],
    7: [{ g: 1.62, theta: 30, v0: 13.68 }], 8: [{ drag: true }, { v0: 17.5 }],
    9: [{ h0: 20, theta: 18 }, { h0: 20, theta: 51 }], 10: [{ drag: true, k: 0.00501, v0: 45.5, theta: 34 }],
    11: [{ theta: 76 }], 12: [{}, { h0: 10, v0: 17.72, theta: 37.1 }],
    h1: [{ theta: 90 }], h2: [{ g: 1.62, v0: 50 }], h3: [{ v0: 50, theta: 78.5 }],
    h4: [{ theta: 0, h0: 2.5, v0: 7 }], h5: [{ theta: 0, h0: 10, v0: 5 }, { theta: 0, h0: 40, v0: 5 }],
    h6: [{ v0: 29.98 }, { v0: 29.98, drag: true, k: 0.0162 }], h7: [{ v0: 30, drag: true, k: 0.05, theta: 35.7 }],
    h8: [{ v0: 22.26, h0: 20, drag: true }], h9: [{ v0: 16 }, { v0: 6.5, g: 1.62 }],
    h10: [{ v0: 40, drag: true, k: 0.02, theta: 20 }, { v0: 40, drag: true, k: 0.02, theta: 55.7 }]
  };
  const actions = flights => {
    let last = def;
    const out = [];
    for (const flight of flights) {
      const next = { ...def, ...flight };
      for (const key of ['v0', 'theta', 'h0', 'g', 'drag', 'k']) {
        if (next[key] === last[key]) continue;
        if (key === 'drag') out.push(press('#drag', 'Space'));
        else if (key === 'k' && !next.drag) next.k = last.k;
        else if (key === 'g' && [1.62, 3.71, 9.8].includes(next.g)) out.push(click('[data-g="' + next.g + '"]'));
        else out.push(value('#' + key + 'o', next[key]));
      }
      out.push(click('#run'), { op: 'await-projectile' });
      last = next;
    }
    return out;
  };
  return sequence('projectile', Object.fromEntries(Object.entries(witnesses).map(([id, flights]) => [
    id, id === 'h2' ? [press('#speed', 'End'), ...actions(flights)] : actions(flights)
  ])));
}

// tools/mission-proofs/ph-scale.js 的公開與隱藏見證。未知酸一律從頁面的可見讀數推算。
function phScale() {
  const { solution } = require('../../js/ph-scale-core.js');
  const sp = (id, species) => click('#sp' + id + ' [data-sp="' + species + '"]');
  const c = (id, logC) => value('#c' + id + 'o', logC);
  const temp = t => value('#tempo', t);
  const measure = click('#measure');
  const at = (sp, c, t = 25) => solution(sp, c, t);
  const round = n => Math.round(n * 100) / 100;
  const range = (low, high) => Array.from({ length: (high - low) * 100 + 1 }, (_, i) => round(low + i / 100));
  const nearest = (lo, hi, f) => range(lo, hi).reduce((b, x) => f(x) < f(b) ? x : b, lo);
  const alpha10 = range(-4, 0).filter(x => at('CH3COOH', x).alpha >= 0.1).at(-1);
  const matchStrong = nearest(-3, 0, x => Math.abs(at('CH3COOH', x).pH - at('HCl', -3).pH));
  const ammonia = nearest(-4, 0, x => Math.abs(at('NH3', x).pH - 11));
  const matchHF = nearest(-3, 0, x => Math.abs(at('CH3COOH', x).pH - at('HF', -3).pH));
  const hfHalf = nearest(-5, 0, x => Math.abs(at('HF', x).alpha - 0.5));
  const bases = range(-8, 0).filter(x => { const hot = at('NaOH', x, 100); return hot.pH < 7 && hot.oh >= 10 * hot.h; });
  const ph = {
    1: [measure], 2: [sp('B', 'NaOH'), c('B', -2), measure], 3: [click('#dilA')], 4: [c('B', -2), measure],
    5: [sp('B', 'NaOH'), c('B', -2), measure], 6: [c('B', alpha10), measure], 7: [click('#dilB')],
    8: [c('A', -3), c('B', matchStrong), measure], 9: [sp('B', 'NH3'), c('B', ammonia), measure],
    10: [sp('A', 'HF'), c('A', -3), c('B', matchHF), measure],
    11: [sp('A', 'HX'), c('A', -1), measure, { op: 'ph-answer', logC: -1, decimals: 2 }],
    12: [sp('A', 'HX'), c('A', -1), measure, { op: 'ph-answer', logC: -1, decimals: 2 }],
    h1: [sp('A', 'water'), measure, temp(95), measure],
    h2: [c('A', -5), times(3, '#dilA')], h3: [c('A', 0), sp('B', 'NaOH'), c('B', 0), measure],
    h4: [sp('A', 'HCN'), c('A', -5.5), sp('B', 'water'), measure],
    h5: [c('A', -6), sp('B', 'HF'), c('B', -6), measure],
    h6: [sp('B', 'NaOH'), c('B', bases[Math.floor(bases.length / 2)]), measure, temp(100), measure],
    h7: [sp('A', 'HCN'), c('A', -5), times(3, '#dilA')],
    h8: [sp('A', 'HCN'), c('A', -1), times(3, '#dilA')],
    h9: [sp('A', 'HF'), c('A', hfHalf), measure],
    h10: [sp('A', 'HX'), { op: 'ph-find', initialLogC: -2 }, measure, { op: 'ph-answer', decimals: 3 }]
  };
  return sequence('ph-scale', ph);
}

function displayedPK(h, logC) {
  const { Kw, kaFrom } = require('../../js/ph-scale-core.js');
  return -Math.log10(kaFrom(h, 10 ** logC, Kw(25)));
}

function accurateConcentration(h, logC) {
  const { solution } = require('../../js/ph-scale-core.js');
  const pk = displayedPK(h, logC);
  const solved = Array.from({ length: 31 }, (_, i) => -3 + i / 10);
  let best = { factor: 0, logC };
  for (const lc of solved) {
    const x = solution('HX', lc, 25, 10 ** -pk).h;
    const rounded = Number(x.toPrecision(3));
    const factor = rounded / 10 ** Math.floor(Math.log10(rounded));
    if (factor > best.factor) best = { factor, logC: Number(lc.toFixed(1)) };
  }
  return best.logC;
}

// tools/mission-proofs/stack-queue.js 的 Sim 操作映射到頁面按鈕。
function stackQueue() {
  const mode = m => click('[data-mode="' + m + '"]');
  const expr = s => [value('#expr', s, false, false), click('#endBtn')];
  const exprs = list => list.flatMap(expr);
  const push = n => times(n, '#bPush'), pop = n => times(n, '#bPop');
  const enq = n => times(n, '#bEnq'), deq = n => times(n, '#bDeq'), rot = n => times(n, '#bRot');
  const left = n => times(n, '#bToL'), right = n => times(n, '#bToR');
  const ringEnq = n => times(n, '#rEnq'), ringDeq = n => times(n, '#rDeq');
  return sequence('stack-queue', {
    1: [push(3), pop(3)], 2: [enq(3), deq(3)], 3: [value('#capo', 3), push(4)],
    4: [mode('paren'), expr('{[(1+2)*3]-4}/5')],
    5: [mode('paren'), exprs(['(1+2))', '((1+2)', '[1+2)'])],
    6: [mode('postfix'), expr('1 2 + 3 + 4 *')],
    7: [push(3), pop(2), push(2), pop(3)],
    8: [mode('ring'), value('#ringNo', 5), ringEnq(4), ringDeq(1), ringEnq(2)],
    9: [mode('infix'), expr('(3 + 4) * 2 - 1'), click('#toEvalBtn'), click('#endBtn')],
    10: [enq(5), left(5), right(5)],
    11: [click('[data-rk="stack"]'), push(3), times(3, '#bAB'), times(2, '#bPopB'), push(3), click('#bPopB'), times(3, '#bAB'), times(3, '#bPopB')],
    12: [mode('infix'), expr('1 + 2 * 2 ^ 2 ^ 2')],
    h1: [mode('postfix'), expr('1 2 + 3 + 4 + 5 + 6 +')],
    h2: [mode('infix'), exprs(['1 + 2 + 3', '((1 + 2)) + 3'])],
    h3: [mode('paren'), expr('([)]')],
    h4: [mode('ring'), press('#wrap', 'Space'), value('#ringNo', 4), ringEnq(4), ringDeq(4), ringEnq(1)],
    h5: [mode('postfix'), exprs(['9 2 / 2 *', '9 2 2 / *'])],
    h6: [mode('infix'), expr('2 ^ 3 ^ 2')],
    h7: [enq(4), rot(3), deq(1), rot(2), deq(1), rot(1), deq(2)],
    h8: [mode('paren'), exprs(['((()))', '(()())', '(())()', '()(())', '()()()'])],
    h9: [enq(6), ...Array.from({ length: 5 }, () => [rot(2), deq(1)]).flat(2)],
    h10: [press('#auto', 'Space'), ...[3, 1, 2, 5, 4].flatMap(n => [value('#valo', n), click('#bEnq')]),
      left(2), right(1), left(1), right(2), left(2), right(2)]
  });
}

const adapters = { projectile, 'ph-scale': phScale, 'stack-queue': stackQueue };
const recipesFor = slug => adapters[slug]?.() || {};
module.exports = { recipesFor, displayedPK, accurateConcentration };
