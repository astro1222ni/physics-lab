/* Horizontal motion while the pull is held. SI units throughout. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LearnPhysics = api;
})(globalThis, function () {
  'use strict';
  const mass = 10, g = 10, pull = 50, mu = 4 / 7;
  const angle43 = Math.atan2(3, 4) * 180 / Math.PI;
  const angle125 = Math.atan2(5, 12) * 180 / Math.PI;
  const kinetic = (m, speed) => 0.5 * m * speed ** 2;
  const potential = (m, height) => m * g * height;
  const work = (parallel, displacement) => parallel * displacement;
  const clean = x => Math.abs(x) < 1e-12 ? 0 : x;

  function forces(angle, surface = 'rough', direction = 1, velocity = direction) {
    const rad = Math.max(0, Math.min(90, angle)) * Math.PI / 180;
    const parallel = clean(pull * Math.cos(rad)) * direction;
    const perpendicular = clean(pull * Math.sin(rad));
    const normal = mass * g - perpendicular;
    const friction = surface === 'ice' ? 0 : -Math.sign(velocity) * mu * normal;
    return { F: pull, parallel, perpendicular, normal, weight: mass * g,
      friction, a: clean((parallel + friction) / mass) };
  }

  function initial(v = 1) {
    return { x: 0, distance: 0, v, elapsed: 0, WF: 0, Wf: 0, WN: 0, Wg: 0,
      K: kinetic(mass, v), initialK: kinetic(mass, v) };
  }

  // An ideal turn changes the sign of velocity without changing kinetic energy or accumulated work.
  function reverse(state) {
    return { ...state, v: clean(-state.v) };
  }

  function advance(state, controls, dt) {
    if (!Number.isFinite(dt) || dt <= 0 || !state.v) return state;
    const f = forces(controls.angle, controls.surface, controls.direction, state.v);
    const stopTime = f.a * state.v < 0 ? -state.v / f.a : Infinity;
    const h = Math.min(dt, stopTime);
    const v = h >= stopTime ? 0 : state.v + f.a * h;
    const dx = (state.v + v) * h * 0.5;
    return { ...state, x: clean(state.x + dx), distance: state.distance + Math.abs(dx),
      elapsed: state.elapsed + h, v, K: kinetic(mass, v),
      WF: state.WF + work(f.parallel, dx), Wf: state.Wf + work(f.friction, dx) };
  }

  // Exact constant-acceleration stop at a marked distance, even on a slow animation frame.
  function timeToDistance(state, controls, distance) {
    const speed = Math.abs(state.v);
    if (!Number.isFinite(distance) || !speed || distance < 0) return Infinity;
    const a = forces(controls.angle, controls.surface, controls.direction, state.v).a * Math.sign(state.v);
    const v2 = speed * speed + 2 * a * distance;
    return v2 < 0 ? Infinity : 2 * distance / (speed + Math.sqrt(v2));
  }

  function examples() {
    const weight = 3 * g, hand = work(weight, 2), gravity = work(-weight, 2);
    const dU = potential(5, 0.8);
    return { weight, hand, gravity, net: hand + gravity, backpackK: kinetic(5, 1.2),
      backpackWg: -dU + work(0, 15), dU };
  }
  function answers() {
    const options = [2, 4, 1, 0.5], ratio = kinetic(1, 6) / kinetic(1, 3);
    const p1 = work(forces(90, 'ice').parallel, 10);
    const f = forces(angle43), roundFriction = 2 * work(f.friction, 5);
    return { bucket: p1 === 0 ? 2 : p1 > 0 ? 0 : 3, trip: roundFriction < 0 ? 1 : roundFriction > 0 ? 2 : 0,
      angle: Math.acos(0) * 180 / Math.PI, cart: work(-30, 8), ratio, bike: options.indexOf(ratio) };
  }
  return { mass, g, pull, mu, angle43, angle125, kinetic, potential, work, forces, initial, advance,
    reverse, timeToDistance, examples, answers };
});
