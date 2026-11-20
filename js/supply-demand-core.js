(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SupplyDemandCore = factory();
})(globalThis, function () {
  'use strict';
  // Inverse demand and supply. Quantities are continuous cups, prices are NT$/cup.
  function market({ a, b, c, d, policy, price }) {
    if (!Number.isFinite(b) || b <= 0 || !Number.isFinite(d) || d <= 0) {
      throw new RangeError('Demand and supply slope magnitudes must be finite and positive.');
    }
    // This station recognizes a market only at a positive-quantity intersection.
    if (a <= c) {
      return { equilibriumQty: 0, equilibriumPrice: null, actualPrice: null, binding: false,
        demand: 0, supply: 0, traded: 0, shortage: 0, excess: 0, revenue: 0,
        consume: 0, produce: 0, surplus: 0, freeConsume: 0, freeProduce: 0, freeSurplus: 0, loss: 0 };
    }
    const equilibriumQty = (a - c) / (b + d);
    const equilibriumPrice = c + d * equilibriumQty;
    // A decimal limit typed exactly at the crossing may differ by a floating-point ulp.
    const roundoff = 8 * Number.EPSILON * Math.max(1, Math.abs(equilibriumPrice), Math.abs(price ?? 0));
    const binding = (policy === 'ceiling' && price < equilibriumPrice - roundoff) ||
      (policy === 'floor' && price > equilibriumPrice + roundoff);
    const actualPrice = binding ? price : equilibriumPrice;
    const demand = binding ? Math.max(0, (a - actualPrice) / b) : equilibriumQty;
    const supply = binding ? Math.max(0, (actualPrice - c) / d) : equilibriumQty;
    const traded = Math.min(demand, supply);
    // Efficient rationing: the highest-valuing buyers and the least-cost sellers trade.
    const consume = traded > 0 ? traded * (a - actualPrice - b * traded / 2) : 0;
    const produce = traded > 0 ? traded * (actualPrice - c - d * traded / 2) : 0;
    const freeConsume = b * equilibriumQty ** 2 / 2;
    const freeProduce = d * equilibriumQty ** 2 / 2;
    return { equilibriumQty, equilibriumPrice, binding, actualPrice, demand, supply, traded, revenue: actualPrice * traded,
      shortage: Math.max(0, demand - supply), excess: Math.max(0, supply - demand),
      consume, produce, surplus: consume + produce, freeConsume, freeProduce,
      freeSurplus: freeConsume + freeProduce, loss: (b + d) * (equilibriumQty - traded) ** 2 / 2 };
  }

  // The last group in each pile or queue can represent a fraction of two cups.
  const cupsPerGroup = 2;
  function groups(quantity) {
    return Math.ceil(Math.max(0, quantity / cupsPerGroup - 1e-10));
  }
  function stallCounts(result) {
    return { served: groups(result.traded), waiting: groups(result.shortage), unsold: groups(result.excess) };
  }
  function marketEdit(before, after) {
    if (!before) return null;
    const demand=before.a!==after.a || before.b!==after.b, supply=before.c!==after.c || before.d!==after.d;
    if (demand && supply) return 'curves';
    if (demand) return 'demand';
    if (supply) return 'supply';
    if (before.policy !== after.policy) return 'rule';
    return after.policy !== 'free' && before.price !== after.price ? 'price' : null;
  }
  return { market, cupsPerGroup, stallCounts, marketEdit };
});
