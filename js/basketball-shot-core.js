(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./projectile-core.js'));
  else root.BasketballShotCore = factory(root.ProjectileCore);
})(globalThis, function (P) {
  'use strict';
  const g = 9.8, rad = Math.PI / 180;
  const rimHeight = 3.05, rimRadius = .225, airDensity = 1.2;
  const court = { freeThrow: 4.23, threePoint: 6.75, boardOffset: .375, boardBottom: 2.90,
    boardWidth: 1.80, boardHeight: 1.05, restitution: .75 };
  const balls = { shot: { mass: .62, diameter: .245, cd: .50 }, throw: { mass: .19, diameter: .097, cd: .35 } };
  const ballRadius = balls.shot.diameter / 2;
  function dragPerMass(ball) {
    const radius = ball.diameter / 2;
    return .5 * airDensity * ball.cd * Math.PI * radius ** 2 / ball.mass;
  }
  function params(p, mode) {
    return { v0: p.speed, theta: p.angle, h0: p.height, g, k: p.drag ? dragPerMass(balls[mode]) : 0 };
  }
  function onBoardFace(y) {
    return y >= court.boardBottom + ballRadius && y <= court.boardBottom + court.boardHeight - ballRadius;
  }
  // Envelope of vacuum trajectories through the point (distance, rimHeight).
  function minimumSpeed(distance, height) {
    const rise = rimHeight - height;
    return { speed: Math.sqrt(g * (Math.hypot(distance, rise) + rise)),
      angle: 45 + Math.atan2(rise, distance) / (2 * rad) };
  }
  function heightEnvelope(speed, distance, height) {
    const v2=speed*speed;
    return height+v2/(2*g)-g*distance*distance/(2*v2);
  }
  function entryProjection(crossing,distance) {
    if(!crossing)return null;
    const sine=-crossing.vy/Math.hypot(crossing.vx,crossing.vy);
    return {opening:2*rimRadius*sine,offset:(crossing.x-distance)*Math.sign(crossing.vx)*sine};
  }
  function step(p, s, dt) {
    if (p.k) return P.rk4(p, s, dt);
    return { t: s.t + dt, x: s.x + dt * s.vx, y: s.y + dt * (s.vy - g * dt / 2),
      vx: s.vx, vy: s.vy - g * dt };
  }
  function rootTime(p, start, dt, before) {
    let lo = 0, hi = dt;
    for (let i = 0; i < 32; i++) {
      const mid = (lo + hi) / 2;
      if (before(step(p, start, mid))) lo = mid; else hi = mid;
    }
    return step(p, start, hi);
  }
  function bestRange(p) { return P.optimalAngle(params(p, 'throw')); }

  function shot(p) {
    const q = params(p, 'shot'), boardX = p.distance + court.boardOffset - ballRadius;
    let s = P.initialState(q), apex = s, firstRim = null, crossing = null, board = null;
    let clearance = Infinity;
    const points = [[s.x, s.y, 0]];
    // Continue a diagnostic path past a rim contact to answer "was the centre aimed
    // correctly?" Only the physical path up to that contact is drawn or animated.
    function segment(a, b) {
      const dx = b.x - a.x, dy = b.y - a.y, dt = b.t - a.t;
      let top = null;
      if (a.vy > 0 && b.vy <= 0) {
        top = rootTime(q, a, dt, z => z.vy > 0);
        if (top.y > rimHeight && b.y <= rimHeight) crossing = descending(top, b);
      }
      if (a.y >= rimHeight && b.y <= rimHeight && dy < 0) crossing = descending(a, b);
      for (const side of [-1, 1]) {
        const x = p.distance + side * rimRadius;
        const den = dx * dx + dy * dy;
        if (!den) continue;
        const u = Math.min(1, Math.max(0, ((x - a.x) * dx + (rimHeight - a.y) * dy) / den));
        let gap = Math.hypot(a.x + dx * u - x, a.y + dy * u - rimHeight) - ballRadius;
        let closestTime = dt * u;
        if (gap < .14) {
          const approaching = z => (z.x - x) * z.vx + (z.y - rimHeight) * z.vy < 0;
          const closest = !approaching(a) ? a : approaching(b) ? b : rootTime(q, a, dt, approaching);
          closestTime = closest.t - a.t;
          gap = Math.hypot(closest.x - x, closest.y - rimHeight) - ballRadius;
        }
        clearance = Math.min(clearance, gap);
        if (gap > 0 || firstRim) continue;
        const hit = rootTime(q, a, closestTime, z => Math.hypot(z.x - x, z.y - rimHeight) > ballRadius);
        firstRim = { ...hit, side: side < 0 ? 'front' : 'back' };
        points.push([hit.x, hit.y, hit.t]);
      }
      if (top && (!firstRim || top.t <= firstRim.t) && top.y > apex.y) apex = top;
      if (!firstRim) {
        points.push([b.x, b.y, b.t]);
        if (b.y > apex.y) apex = b;
      } else if (firstRim.y > apex.y) apex = firstRim;
    }
    function descending(a, b) {
      const h = rootTime(q, a, b.t - a.t, z => z.y > rimHeight);
      return { ...h, angle: Math.atan2(-h.vy, Math.abs(h.vx)) / rad };
    }
    const dt = 1 / 240;
    while (s.t < 8) { // Longest supported flight is under four seconds.
      let end = step(q, s, dt);
      if (!board && s.vx > 0 && s.x <= boardX && end.x >= boardX) {
        const hit = rootTime(q, s, dt, z => z.x < boardX);
        if (onBoardFace(hit.y)) {
          segment(s, hit);
          const out = { ...hit, vx: -court.restitution * hit.vx };
          board = { t: hit.t, x: hit.x, y: hit.y, vxIn: hit.vx, vyIn: hit.vy, vxOut: out.vx, vyOut: out.vy };
          end = step(q, out, end.t - hit.t);
          s = out;
        }
      }
      if (end.y <= 0 && end.vy < 0) {
        end = rootTime(q, s, end.t - s.t, z => z.y > 0);
        end.y = 0;
        segment(s, end); s = end; break;
      }
      segment(s, end); s = end;
    }
    const end = firstRim || s;
    if (board && board.t > end.t) board = null;
    const scored = !firstRim && !!crossing && Math.abs(crossing.x - p.distance) < rimRadius;
    const bank = scored && board !== null && board.t < crossing.t;
    const events = [];
    if (board) events.push({ type: 'board', t: board.t });
    if (scored) events.push({ type: 'net', t: crossing.t });
    if (firstRim) events.push({ type: 'rim', t: firstRim.t });
    events.sort((a, b) => a.t - b.t);
    const projection=entryProjection(crossing,p.distance);
    return { method: q.k ? 'numeric' : 'analytic', points, T: end.t, R: end.x, H: apex.y, tApex: apex.t,
      vLand: firstRim ? null : Math.hypot(end.vx, end.vy), vxLand: firstRim ? null : end.vx,
      vyLand: firstRim ? null : end.vy, crossing, opening:projection?.opening??null,viewOffset:projection?.offset??null,
      margin:firstRim?0:clearance, rimHit: firstRim, board, scored, bank, events,
      outcome: scored ? (bank ? 'bank' : 'swish') : firstRim ? firstRim.side : 'miss' };
  }
  function launch(p) {
    if (p.mode !== 'throw') return shot(p);
    const r = P.predict(params(p, 'throw'));
    return { ...r, landingAngle: Math.atan2(-r.vyLand, r.vxLand) / rad, outcome: 'land',
      events: [], scored: false, margin: null, crossing: null, opening: null, board: null, rimHit: null, bank: false };
  }
  function measurement(p, result, best) {
    const { points, events, ...r } = result;
    return { ...p, ...r, bestAngle: best?.theta ?? null, bestRange: best?.R ?? null,
      envelope:p.mode==='shot'&&!p.drag?heightEnvelope(p.speed,p.distance,p.height):null,
      minimum: p.mode === 'shot' && !p.drag ? minimumSpeed(p.distance, p.height) : null };
  }
  return { launch, bestRange, minimumSpeed, heightEnvelope, entryProjection, measurement, dragPerMass, onBoardFace,
    court, balls, rimHeight, rimRadius, ballRadius, airDensity, g };
});
