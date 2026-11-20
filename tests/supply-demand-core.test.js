'use strict';
const assert = require('node:assert/strict');
const { market, stallCounts, marketEdit } = require('../js/supply-demand-core.js');
const base = { a: 60, b: 1, c: 20, d: 1, policy: 'free', price: 30 };
const read = changes => market({ ...base, ...changes });
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, a + ' ≠ ' + b);

const free = read({});
assert.equal(free.equilibriumPrice, 40);
assert.equal(free.traded, 20);
assert.equal(free.consume, 200);
assert.equal(free.produce, 200);
assert.equal(free.revenue, 800);
assert.deepEqual(stallCounts(free), { served: 10, waiting: 0, unsold: 0 });
const cap = read({ policy: 'ceiling' });
const floor = read({ policy: 'floor', price: 50 });
assert.equal(cap.shortage, 20);
assert.equal(floor.excess, 20);
assert.equal(cap.consume, 250);
assert.equal(cap.produce, 50);
assert.equal(floor.consume, cap.produce);
assert.equal(cap.loss, 100);
assert.equal(floor.loss, cap.loss);
assert.deepEqual(stallCounts(cap), { served: 5, waiting: 10, unsold: 0 });
assert.deepEqual(stallCounts(floor), { served: 5, waiting: 0, unsold: 10 });
assert.deepEqual(stallCounts(read({ policy: 'ceiling', price: 39.95 })), { served: 10, waiting: 1, unsold: 0 });
assert.equal(read({ policy: 'ceiling', price: 40 }).binding, false);
assert.equal(read({ policy: 'floor', price: 39 }).loss, 0);
const atCrossing = read({ b: .6, c: 22, d: 1.4, policy: 'floor', price: 48.6 });
assert.equal(atCrossing.binding, false);
assert.equal(atCrossing.excess, 0);
assert.equal(read({ policy: 'ceiling', price: 0 }).shortage, 60);

// 兩個截距分開或只在零杯處接觸時，三種制度都沒有市場。
for (const a of [10, 20]) {
  for (const policy of ['free', 'ceiling', 'floor']) {
    for (const price of [0, 10, 12, 15, 18, 20, 42]) {
      const r = read({ a, policy, price });
      assert.equal(r.equilibriumPrice, null);
      assert.equal(r.actualPrice, null);
      assert.equal(r.binding, false);
      for (const field of ['traded', 'equilibriumQty', 'demand', 'supply', 'shortage', 'excess', 'revenue',
        'consume', 'produce', 'surplus', 'freeConsume', 'freeProduce', 'freeSurplus', 'loss']) assert.equal(r[field], 0, field);
      assert.deepEqual(stallCounts(r), { served: 0, waiting: 0, unsold: 0 });
    }
  }
}
for (const slope of ['b', 'd']) for (const invalid of [0, -1, NaN, Infinity, undefined]) {
  for (const a of [10, 20, 60]) assert.throws(() => read({ a, [slope]: invalid }), RangeError);
}
// 有市場時，管制仍可使成交降至零。這種情況有均衡價，也有短缺或剩餘。
for (const [policy, price, gap] of [['ceiling', 20, 'shortage'], ['floor', 60, 'excess']]) {
  const r = read({ policy, price });
  assert.equal(r.equilibriumPrice, 40);
  assert.equal(r.actualPrice, price);
  assert.equal(r.binding, true);
  assert.equal(r.traded, 0);
  assert.equal(r[gap], 40);
}

// 用邊際願付和邊際成本積分，獨立驗算福利與未完成的交易。
for (const b of [.5, .93, 3]) for (const d of [.5, 1.7, 3]) {
  for (const policy of ['free', 'ceiling', 'floor']) for (const price of [0, 21.2, 41, 58.4, 110]) {
    const r = read({ b, d, policy, price }), q = r.traded;
    close(q, Math.min(r.demand, r.supply));
    close(r.revenue, r.actualPrice * q);
    close(r.consume, ((60 + 60 - b * q) / 2 - r.actualPrice) * q);
    close(r.produce, (r.actualPrice - (20 + 20 + d * q) / 2) * q);
    close(r.surplus, (40 - (b + d) * q / 2) * q);
    close(r.freeSurplus, 40 * r.equilibriumQty / 2);
    close(r.surplus + r.loss, r.freeSurplus);
    assert.ok(r.consume >= 0 && r.produce >= 0 && r.loss >= 0);
  }
}
assert.ok(read({ policy: 'ceiling', price: 23 }).consume < free.consume);
assert.equal(marketEdit(base,{...base,price:30.1}),null);
assert.equal(marketEdit(base,{...base,b:1.01}),'demand');
assert.equal(marketEdit(base,{...base,c:20.1}),'supply');
assert.equal(marketEdit(base,{...base,a:60.1,c:20.1}),'curves');
const controlled={...base,policy:'ceiling'};
assert.equal(marketEdit(base,controlled),'rule');
assert.equal(marketEdit(controlled,{...controlled,price:30.1}),'price');
assert.equal(marketEdit(controlled,{...controlled}),null);
require('../tools/mission-proofs/supply-demand.cjs');
console.log('20 題互斥掃描、正量均衡、無市場、斜率防呆、管制臨界、營收、有效配給與福利守恆通過');
