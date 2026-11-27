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
assert.deepEqual(hits.filter(hit => !hit.skipped).map(({ line, snippet }) => [line, snippet]), [
  [4, 'd2(id, a, k) !== 0'],
  [4, 'Math.abs(fp.slope) === 1'],
  [5, 'Math.abs(a % Math.PI) === Math.PI / 2'],
  [6, '0.5 === value'],
  [6, 'p === -1'],
  [6, 'value == .5'],
  [6, 'value != 1e-9'],
  [9, 'n % 2 === 0'],
  [9, 'terms[n - 1] === 0'],
  [9, 'a + phaseIdx === 0'],
  [12, 'compute() === (0.5)']
]);
assert.deepEqual(hits.filter(hit => hit.skipped).map(hit => hit.snippet), [
  'xs.length === 0', '0 === sampleCount', 'k === 0', 'cursor.index() !== 1',
  "typeof n === 'number'", "model === 'abs'"
]);
