'use strict';

const assert = require('node:assert/strict');
const { scan } = require('../tools/lint-float-eq.cjs');

const source = [
  '// 假比較：x === 42',
  '/* x !== 42 */',
  'const text = "x === 42"; const pattern = /x !== 42/;',
  'if (d2(id, a, k) !== 0 && Math.abs(fp.slope) === 1) run();',
  'if (Math.abs(a % Math.PI) === Math.PI / 2) run();',
  'if (0.5 === value || p === -1 || value == .5 || value != 1e-9) run();',
  'if (xs.length === 0 || 0 === sampleCount || k === 0 || cursor.index() !== 1) run();',
  "if (typeof n === 'number' || model === 'abs') run();",
  'if (n % 2 === 0 || terms[n - 1] === 0 || a + phaseIdx === 0) run();',
  'if (x === 1 + y || 2 * y === z) run();',
  'if (compute()',
  '    === (0.5)) run();'
].join('\n');

const hits = scan(source);
assert.deepEqual(hits.filter(hit => hit.kind === 'number' && !hit.skipped).map(({ line, snippet }) => [line, snippet]), [
  [4, 'd2(id, a, k) !== 0'],
  [4, 'Math.abs(fp.slope) === 1'],
  [5, 'Math.abs(a % Math.PI) === Math.PI / 2'],
  [6, '0.5 === value'],
  [6, 'p === -1'],
  [6, 'value == .5'],
  [6, 'value != 1e-9'],
  [7, 'k === 0'],
  [9, 'terms[n - 1] === 0'],
  [9, 'a + phaseIdx === 0'],
  [12, 'compute() === (0.5)']
]);
assert.deepEqual(hits.filter(hit => hit.skipped).map(hit => hit.snippet), [
  'xs.length === 0', '0 === sampleCount', 'cursor.index() !== 1', 'n % 2 === 0'
]);
assert.deepEqual(hits.filter(hit => hit.kind === 'string' && !hit.skipped).map(hit => hit.snippet), [
  "typeof n === 'number'", "model === 'abs'"
]);

const regression = scan([
  'st.I === 0; k === -4; d.k === 0; o.n === 0; tempK === 0; forceN === 0;',
  'x === 2 * Math.PI; x === 1 / 2; (2 * (Math.PI - 1)) !== x; x === 2 ** -(1 + 2);',
  'i % 2 === 1; n % 2 === 0; sampleCount % (2) === 0; Math.trunc(value) % 2 === 0;',
  'h % 0.5 === 0; k % 2 === 0; i % 0.5 === 0; offset + i % 2 === 0;',
  'ev.button === 0; event.buttons !== 0; node.nodeType == 1; 0 === input.selectedIndex;',
  'Math.round(v) === 0; 0 === Math.floor(v); Math.sign(v) === -1; Math.ceil(v) === 0;',
  'Math.round(v) / 2 === 0; Math.sign(v) + x === 0; obj.Math.floor(v) === 0;',
  'x >= 0 === flag; flag === 0 < x; x << 1 === 0; x === 2 * Math.PI > y;',
  "'1' == 1; typeof v === 0;"
].join('\n'));
assert.deepEqual(regression.filter(hit => hit.kind === 'number' && !hit.skipped).map(hit => hit.snippet), [
  'st.I === 0', 'k === -4', 'd.k === 0', 'o.n === 0', 'tempK === 0', 'forceN === 0',
  'x === 2 * Math.PI', 'x === 1 / 2', '(2 * (Math.PI - 1)) !== x', 'x === 2 ** -(1 + 2)',
  'h % 0.5 === 0', 'k % 2 === 0', 'i % 0.5 === 0', 'offset + i % 2 === 0',
  'Math.round(v) / 2 === 0', 'Math.sign(v) + x === 0', 'obj.Math.floor(v) === 0', 'x << 1 === 0'
]);
assert.deepEqual(regression.filter(hit => hit.skipped).map(hit => hit.snippet), [
  'i % 2 === 1', 'n % 2 === 0', 'sampleCount % (2) === 0', 'Math.trunc(value) % 2 === 0',
  'ev.button === 0', 'event.buttons !== 0', 'node.nodeType == 1', '0 === input.selectedIndex',
  'Math.round(v) === 0', '0 === Math.floor(v)', 'Math.sign(v) === -1', 'Math.ceil(v) === 0', 'typeof v === 0'
]);
assert.deepEqual(regression.filter(hit => hit.kind === 'string').map(hit => hit.snippet), ["'1' == 1"]);
