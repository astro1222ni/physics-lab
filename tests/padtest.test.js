'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const { testPad } = require('../tools/padtest.cjs');

async function run({ loaded = true, mounted = 1, visible = true, singlePoint = false,
  stuck = false, brokenOpen = false, pageError, width = 412 } = {}) {
  const actions = [], listeners = new Map();
  let x = 2, y = 4, center = 'A', open = false, closed = false;
  const buttons = {
    '.vpad-body': {
      isVisible: async () => open,
      waitFor: async () => { if (!open) throw new Error('未展開'); }
    },
    '.vpad-launch': () => { open = !brokenOpen; },
    '[data-direction="5"]': () => { if (!stuck) x++; },
    '[data-direction="1"]': () => { y--; },
    '.vpad-select': () => { center = 'B'; }
  };
  const pad = {
    first: () => pad,
    isVisible: async () => visible,
    evaluate: async () => ({ x, y, center, selected: center }),
    locator(selector) {
      assert.ok(Object.hasOwn(buttons, selector), selector);
      const button = buttons[selector];
      const press = via => {
        assert.ok(selector !== '.vpad-select' || !singlePoint);
        actions.push([via, selector]);
        button();
      };
      return typeof button === 'object' ? button : {
        tap: async () => press('tap'),
        click: async () => press('click'),
        isDisabled: async () => singlePoint
      };
    }
  };
  const page = {
    setDefaultTimeout() {},
    on: (event, callback) => listeners.set(event, callback),
    goto: async () => {
      if (pageError) listeners.get('pageerror')(new Error(pageError));
      return { ok: () => true };
    },
    evaluate: async () => ({ loaded, mounted }),
    locator(selector) {
      assert.equal(selector, '.lab-vpad:visible');
      return pad;
    }
  };
  const browser = { newContext: async () => ({
    route: async () => {}, routeWebSocket: async () => {}, addInitScript: async () => {},
    newPage: async () => page, close: async () => { closed = true; }
  }) };
  const result = await testPad(browser, 'fixture', width, false);
  assert.ok(closed);
  return { ...result, actions };
}

test('單點中央格停用仍通過方向鍵，手機以觸控展開', async () => {
  const result = await run({ singlePoint: true });
  assert.deepEqual(result.reasons, []);
  assert.equal(result.singlePoint, true);
  assert.deepEqual(result.readings.map(({ x, y }) => [x, y]), [[2, 4], [3, 4], [3, 3]]);
  assert.deepEqual(result.actions, [
    ['tap', '.vpad-launch'], ['tap', '[data-direction="5"]'], ['tap', '[data-direction="1"]']
  ]);
});

test('桌機以滑鼠展開並切換中央格', async () => {
  const result = await run({ width: 1280 });
  assert.deepEqual(result.reasons, []);
  assert.ok(result.actions.every(([via]) => via === 'click'));
  assert.equal(result.readings.at(-1).center, 'B');
});

test('無共用小鍵盤與預設隱藏分別回報不適用', async () => {
  const absent = await run({ loaded: false, mounted: 0, visible: false });
  const hidden = await run({ visible: false });
  assert.equal(absent.notApplicable, '未載入共用小鍵盤');
  assert.equal(hidden.notApplicable, '預設模式未顯示小鍵盤');
  for (const result of [absent, hidden]) {
    assert.deepEqual(result.reasons, []);
    assert.deepEqual(result.actions, []);
  }
});

test('元件未掛載、無法展開、方向鍵無效及頁面例外均回報失敗', async () => {
  assert.deepEqual((await run({ mounted: 0, visible: false })).reasons, ['已載入共用元件但未掛載小鍵盤']);
  assert.deepEqual((await run({ brokenOpen: true })).reasons, ['展開小鍵盤操作失敗']);
  assert.deepEqual((await run({ stuck: true })).reasons, ['→ 未使 x 增加']);
  const error = await run({ visible: false, pageError: '頁面例外' });
  assert.deepEqual(error.reasons, ['主控台有錯誤']);
  assert.equal(error.notApplicable, undefined);
});

test('說明旗標印出用法並回傳 0', () => {
  for (const flag of ['--help', '-h']) {
    const help = spawnSync(process.execPath, [require.resolve('../tools/padtest.cjs'), flag], {
      encoding: 'utf8', windowsHide: true
    });
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /用法：.*--width/);
    assert.equal(help.stderr, '');
  }
});
