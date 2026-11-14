'use strict';

const { setTimeout: sleep } = require('node:timers/promises');
const { createHash } = require('node:crypto');
const classic = require('../playtest.cjs');
const { intervals } = require('./model.cjs');
const { recipesFor } = require('./proofs.cjs');
const { deadline } = require('./driver.cjs');

const startName = /開始|播放|發射|測量|操作|放入|排入|launch|play|start|measure|push|enqueue/i;
const controlsName = (control, term) => {
  const key = classic.norm(term);
  return [control.label, control.name].some(name => classic.norm(name) === key) ||
    classic.matchName(term, [classic.norm(control.label), classic.norm(control.name)]);
};
const resetName = /重設|重來|全部清除|重置|restart|reset|clear all/i;
const wrongValues = ['中文', '', 'abc', '-'];
const stressValues = ['1e308', '-1e308', '長A'.repeat(4096), '🔬🧪🧭', '<b>試玩</b>'];
const action = (op, target, extra) => ({ op, ...(target ? { target } : {}), ...extra });
const startButton = controls => controls.find(x => x.kind === 'button' && x.primary && startName.test(x.name)) ||
  controls.find(x => x.kind === 'button' && startName.test(x.name)) || controls.find(x => x.kind === 'button' && x.primary);
const editor = item => item.kind === 'num' && !item.field;
const activate = item => action('click', item.selector);
const keyFor = item => item.kind === 'check' ? 'Space' : 'Enter';
const setValue = (item, value) => action('value', item.selector, { value: String(value), editor: editor(item) });
const rangeKey = (item, key) => action('press', item.selector, { key });
const mainCanvas = controls => controls.filter(x => x.kind === 'canvas').sort((a, b) => b.width * b.height - a.width * a.height)[0];
const larger = (a, b) => b.width * b.height - a.width * a.height;
const pureText = s => String(s || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

async function welcome(d) {
  if (await d.visible('.lab-welcome-skip')) await d.act(action('click', '.lab-welcome-skip'));
}

async function beginner(d) {
  const gap = () => ({ delay: 1000 + d.roll(2001), check: false });
  await welcome(d);
  await d.act(action('expand', null, { publicOnly: true }), gap());
  d.rec.metrics.firstStar = null;
  const start = d.elapsed();
  let elapsed = 0;
  while ((elapsed = d.elapsed() - start) < 300_000) {
    await welcome(d);
    const controls = await d.inventory();
    const main = startButton(controls);
    const simple = controls.filter(c => (['range', 'check'].includes(c.kind) || c.kind === 'select' && c.option.length) ||
      (c.kind === 'button' && /預設|範例|地球|default|example/i.test(c.name)));
    const reset = controls.find(x => x.kind === 'button' && resetName.test(x.name));
    const chance = d.roll(10);
    const selected = chance <= 5 && main ? main : d.pick(simple) || main;
    if (!selected) {
      d.rec.add('pending', 'beginner-setup', '沒有找到新手可開始操作的元件');
      break;
    }
    const next = selected.kind === 'range' ? rangeKey(selected, d.pick(['ArrowLeft', 'ArrowRight'])) :
      selected.kind === 'select' ? action('select', selected.selector, { value: d.pick(selected.option.slice(0, 3)).value }) : activate(selected);
    const observed = await d.act(next, gap());
    await d.rec.updateStars(d);
    if (d.rec.completed.size) break;
    if ((!observed.ok || chance === 9) && reset) await d.act(activate(reset), gap());
  }
  d.rec.metrics.firstStar = [...d.rec.completed.values()].sort((a, b) => a.step - b.step)[0] || null;
  d.rec.metrics.firstStarBudgetMs = 300_000;
  if (!d.rec.metrics.firstStar && elapsed >= 295_000) {
    d.rec.add('pending', 'beginner-stall', '新手按規則操作約 5 分鐘仍未得星');
  }
}

function screenMissions(d) {
  return d.evaluate(() => [...document.querySelectorAll('.ms-item')].filter(el => el.checkVisibility()).map(el => ({
    title: el.querySelector('.ms-title')?.textContent.trim(), desc: el.querySelector('.ms-desc')?.textContent.trim()
  })));
}

function bindings(text, controls) {
  const results = [];
  const seen = new Set();
  const add = (at, control, raw) => {
    const number = Number(raw.replace(/[−–]/g, '-'));
    const key = at + '|' + control.selector + '|' + number;
    if (seen.has(key)) return;
    seen.add(key);
    if (control.editor) results.push({ at, act: action('value', control.editor, { value: String(number), editor: true }) });
    else if (number === control.range.min || number === control.range.max) {
      results.push({ at, act: rangeKey(control, number === control.range.min ? 'Home' : 'End') });
    }
  };
  const quantity = '(?:=|＝|設(?:為|成|到)?|調(?:整)?(?:到|為|成|至)|至少|at least|to)\\s*(?:at least\\s*)?([−–+\\-]?\\d+(?:\\.\\d+)?)';
  const next = new RegExp('[「“"]([^」”"]+)[」”"]\\s*' + quantity, 'gi');
  for (const m of text.matchAll(next)) {
    const label = m[1];
    const c = controls.find(x => x.kind === 'range' && controlsName(x, label));
    if (c) add(m.index, c, m[2]);
  }
  for (const m of text.matchAll(/\b([a-z][a-z0-9]{0,4})\s*[=＝]\s*([−+\-]?\d+(?:\.\d+)?)/gi)) {
    const c = controls.find(x => x.kind === 'range' && classic.norm(x.name) === classic.norm(m[1]));
    if (c) add(m.index, c, m[2]);
  }
  return results;
}

async function student(d) {
  const opened = await d.act(action('expand', null, { publicOnly: true }));
  const cards = await screenMissions(d);
  if (!cards.length && d.missions.some(m => !m.hidden)) d.rec.add('pending', 'instruction-panel', '任務說明未展開，無法依畫面試作' + (opened.error ? '（' + opened.error + '）' : ''));
  const publicIds = d.missions.filter(m => !m.hidden);
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const known = publicIds.find(m => [m.title?.zh, m.title?.en].some(t => pureText(t) === card.title)) || publicIds[i];
    if (!known) continue;
    const id = known.id;
    if (d.config.mission && d.config.mission !== id) continue;
    if (i || d.config.mission) await d.load(d.url, true);
    const started = performance.now(), before = d.rec.step;
    const parsed = classic.extractTerms([{ id, title: {}, desc: { [d.config.habit.language === 'en' ? 'en' : 'zh']: card.desc }, level: known.level }])
      .filter(t => !t.formula && !d.rec.exclude.terms.some(x => classic.norm(t.term) === classic.norm(x)));
    const planned = await d.inventory();
    const events = [...parsed.map(t => ({ ...t, at: card.desc.indexOf(t.term) })), ...bindings(card.desc, planned)]
      .sort((a, b) => a.at - b.at);
    if (!events.length) {
      // 單一步驟有時直接寫在句首，例如「發射一次」。
      const simple = planned.find(c => c.kind === 'button' && classic.norm(c.name).length > 1 &&
        classic.norm(card.desc).startsWith(classic.norm(c.name)));
      if (simple) events.push({ act: activate(simple) });
    }
    const missing = [];
    let selected = 0;
    let attempt = 0;
    d.rec.mission = id;
    for (const event of events) {
      if (event.act) {
        const applied = await d.act(event.act);
        if (!applied.ok) missing.push('數值操作：' + event.act.target + '，' + applied.error);
        else selected++;
        continue;
      }
      const controls = await d.inventory();
      const match = name => classic.matchName(event.term, [classic.norm(name)]);
      const options = controls.flatMap(c => c.option.filter(o => match(o.label)).map(o => ({ c, o })));
      const item = controls.find(c => ['button', 'check'].includes(c.kind) && controlsName(c, event.term));
      if (!item && controls.some(c => c.kind === 'range' && controlsName(c, event.term))) continue;
      attempt++;
      if (!item && options.length !== 1) {
        if (event.ui) missing.push('第 ' + attempt + ' 個操作找不到「' + event.term + '」');
        continue;
      }
      const r = item ? await d.act(activate(item)) :
        await d.act(action('select', options[0].c.selector, { value: options[0].o.value }));
      if (!r.ok) missing.push('「' + event.term + '」：' + r.error);
      else selected++;
    }
    if (selected) {
      if (d.config.slug === 'projectile') {
        const label = await d.locator('#run').textContent();
        if (/暫停|Pause/i.test(label)) await d.act(action('await-projectile'));
      }
      await sleep(240);
    }
    const done = (await d.status()).some(x => x.id === id);
    await d.rec.updateStars(d);
    const note = missing.length ? missing.join('；') : !events.length ? '說明沒有可由規則抽出的元件或數值' :
      done ? '照畫面語句完成' : '目前的規則讀完說明仍未取得這顆星';
    d.rec.missions.push({ id, level: known.level, status: done ? '✓ 已得星' : '規則未能完成', steps: d.rec.step - before,
      elapsedMs: Math.round(performance.now() - started), note });
    if (missing.length) d.rec.add('pending', 'instruction', id + '：' + note, { mission: id });
    await d.rec.saveFindings(d);
  }
  d.rec.mission = null;
}

async function gifted(d) {
  const original = await d.inventory();
  const remaining = new Map(original.map(c => [c.selector, c]));
  const visited = new Set();
  await d.act(action('expand', null, { publicOnly: true }));
  for (let i = 0; i < 135 && remaining.size; i++) {
    const tab = await d.act(action('tab'));
    if (!tab.ok) break;
    const info = await d.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const css = getComputedStyle(el), r = el.getBoundingClientRect();
      return {
        selector: el.id ? '#' + CSS.escape(el.id) : el.dataset.ptId && '[data-pt-id="' + el.dataset.ptId + '"]',
        name: el.getAttribute('aria-label') || el.textContent.trim().slice(0, 55),
        inView: r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth,
        outlined: el.matches(':focus-visible') && (parseFloat(css.outlineWidth) > 0 && css.outlineStyle !== 'none' || css.boxShadow !== 'none')
      };
    });
    if (!info || !info.selector || !remaining.has(info.selector)) continue;
    const item = remaining.get(info.selector);
    remaining.delete(info.selector);
    visited.add(info.selector);
    if (!info.inView || !info.outlined) {
      d.rec.add('pending', 'focus', '鍵盤焦點的可見性待確認「' + (info.name || info.selector) + '」');
      await d.rec.saveFindings(d);
    }
    if (item.kind === 'range') {
      await d.act(action('key', null, { key: 'Home' }), { check: true });
      await d.act(action('key', null, { key: 'End' }), { check: true });
      await d.act(action('key', null, { key: 'ArrowLeft' }));
    } else if (editor(item)) {
      for (const boundary of ['min', 'max']) {
        await d.act(action('value', item.selector, { editor: true, boundary }), { check: true });
      }
    } else if ((item.kind === 'button' && item.selector === startButton(original)?.selector) || item.kind === 'check') {
      await d.act(action('key', null, { key: keyFor(item) }));
    }
  }
  await d.rec.updateStars(d);
  d.rec.metrics.keyboardReached = visited.size;
  d.rec.metrics.keyboardUnreached = [...remaining.values()].filter(x => ['button', 'check', 'num', 'range'].includes(x.kind)).map(x => x.selector);
  for (const m of d.rec.completed.values()) d.rec.missions.push({ id: m.id, status: '✓ 鍵盤得星', steps: m.step, elapsedMs: m.elapsedMs });
}

async function invalidInput(d, item, raw) {
  const fields = d.rec.metrics.invalidInputs ??= [];
  const before = await d.locator(item.selector).textContent().catch(() => '');
  const r = await d.act(setValue(item, raw), { check: true });
  const result = await d.evaluate(sel => {
    const node = document.querySelector(sel);
    return { shown: node?.value || node?.textContent?.trim() || '', feedback: document.querySelector('.lab-num-hint')?.textContent?.trim() || '' };
  }, item.selector).catch(() => ({}));
  fields.push({ step: r.step, target: item.selector, input: raw.length > 100 ? raw.slice(0, 24) + '… (' + raw.length + ')' : raw,
    before: before?.trim().slice(0, 120), ok: r.ok, error: r.error, ...result });
}

async function clueless(d) {
  const controls = await d.inventory();
  const target = controls.filter(c => c.kind === 'button').sort((a, b) => Number(b.primary) - Number(a.primary) || larger(a, b))[0];
  if (target) for (let i = 0; i < 12; i++) await d.act(activate(target), { delay: 100 + d.roll(220) });
  const canvas = mainCanvas(await d.inventory());
  if (canvas) {
    for (let i = 0; i < 4; i++) {
      const coords = Array.from({ length: 4 }, () => 0.13 + d.rng() * 0.74);
      await d.act(action('drag', canvas.selector, { coords }), { check: true });
    }
  }
  const num = (await d.inventory()).find(c => c.kind === 'num' || c.kind === 'text');
  if (num) for (const invalid of wrongValues) await invalidInput(d, num, invalid);
  await d.act(action('history'), { check: true });
}

async function expert(d) {
  const recipes = recipesFor(d.config.slug);
  if (!d.missions.length) return;
  for (const m of d.missions) {
    if (d.config.mission && d.config.mission !== m.id) continue;
    const recipe = recipes[m.id];
    const id = m.id;
    if (!recipe) {
      d.rec.missions.push({ id, level: m.level, hidden: !!m.hidden, status: '缺少介面路徑', note: '本站的證明尚未轉成公開介面步驟' });
      continue;
    }
    d.rec.mission = id;
    await d.load(d.url, true);
    const start = performance.now();
    const first = d.rec.step;
    d.rec.missionStart = first;
    let steps = 0;
    let failed;
    for (const item of recipe) {
      const r = await d.act(item);
      if (!r.ok) { failed = r; break; }
      if (!item.op.startsWith('await-')) steps++;
    }
    const completed = await d.page.waitForFunction(mark => {
      const db = JSON.parse(localStorage.getItem('mdb') || '{}');
      return Boolean(db.completions?.u1?.[mark]);
    }, id, { timeout: 1500 }).then(() => true, () => false);
    const proof = await d.testMission(id);
    let badge = false;
    if (completed) {
      await d.expand();
        const section = m.hidden ? '.ms-hcard' : '.ms-item';
      // 面板依難度排序，同級任務保持登錄順序。用順位核對簡體與英文也能找到對應卡。
      const ordered = d.missions.filter(x => !!x.hidden === !!m.hidden).sort((a, b) => a.level - b.level);
      const idx = ordered.findIndex(x => x.id === id);
      badge = await d.evaluate(({ section, idx }) => !!document.querySelectorAll(section)[idx]?.querySelector('.ms-check'), { section, idx });
      await d.rec.updateStars(d);
    }
    const note = failed ? failed.error : completed ? badge ? '本機假後端與任務面板已核對' : '假後端已寫入，面板比對待確認' :
      proof.meets ? '實際事件通過本頁任務判定，假後端未取得星星' : '這條操作路徑未產生足以通過判定的事件';
    if (!completed || !badge) d.rec.add(!completed && !failed && proof.meets ? 'confirmed' : 'pending', 'expert-mission', id + '：' + note, { mission: id });
    d.rec.missions.push({ id, level: m.level, hidden: !!m.hidden, status: completed ? '✓ 已得星' : '未得星',
      steps, firstStep: first + 1, lastStep: d.rec.step, elapsedMs: Math.round(performance.now() - start), note, ...proof });
    await d.rec.saveFindings(d);
  }
  d.rec.mission = null;
  d.rec.missionStart = null;
}

async function heartbeat(d) {
  const clock = performance.now();
  const page = await deadline(d.page.evaluate(() => new Promise(resolve => {
    const t = performance.now(), start = document.visibilityState;
    requestAnimationFrame(() => resolve({ rafMs: Math.round(performance.now() - t), visible: start === 'visible' }));
  })), 3250, '動畫影格');
  return { ...page, roundTripMs: Math.round(performance.now() - clock) };
}

async function sampleHeap(d) {
  // 同一份文件、同樣的重複操作。回收後取樣，減少尚未回收的物件造成誤判。
  await deadline(d.cdp.send('HeapProfiler.collectGarbage'), 3200, '回收記憶體');
  const m = await deadline(d.cdp.send('Runtime.getHeapUsage'), 3200, '記憶體量測');
  return m.usedSize;
}

async function playbackFrames(d, target, canvas) {
  const running = async () => {
    const label = await d.locator(target).textContent({ timeout: 1500 });
    return /暫停|暂停|\bpause\b/i.test(label);
  };
  if (!target || !canvas || !await running()) return { active: false };
  const capture = () => d.locator(canvas).screenshot({ timeout: 2800 }).then(bytes => createHash('sha256').update(bytes).digest('hex'));
  const first = await capture();
  await sleep(3100);
  if (!await running()) return { active: false };
  const last = await capture();
  return { active: true, unchanged: first === last };
}

async function breaker(d) {
  const dims = d.config.habit.viewport;
  const metrics = d.rec.metrics;
  metrics.rounds = [];
  let countedLongTasks = 0;
  for (let i = 0; i < 5; i++) {
    const controls = await d.inventory();
    const target = startButton(controls) || controls.find(x => x.kind === 'button');
    if (target) {
      await d.act(activate(target));
      const range = (await d.inventory()).find(x => x.kind === 'range');
      if (range) await d.act(rangeKey(range, 'End'));
      const cadence = intervals(d.config.seed, d.config.slug, d.config.persona, 0);
      const result = await d.act(action('rapid', target.selector, { intervals: cadence }), { check: true });
      const flash = await heartbeat(d).catch(e => ({ error: e.message }));
      if (flash.error || flash.rafMs >= 3000) d.rec.add('pending', 'frame-stall', '快速操作後逾 3 秒未收到影格回呼，待核對動畫是否在有效狀態');
      metrics.rounds.push({ sequence: i + 1, step: result.step, input: result.result, frame: flash });
    } else metrics.rounds.push({ sequence: i + 1 });
    const canvas = mainCanvas(await d.inventory());
    if (i === 0 && target && canvas) {
      metrics.scene = await playbackFrames(d, target.selector, canvas.selector).catch(e => ({ error: e.message.split('\n')[0] }));
      if (metrics.scene.unchanged) d.rec.add('pending', 'still-frame', '播放控制仍顯示暫停，但相隔 3 秒的畫布截圖相同');
    }
    if (canvas) await d.act(action('drag', canvas.selector, { coords: [0.3, 0.65, 0.55, 0.32], fingers: 2 }));
    await d.act(action('size', null, { width: 844, height: 390 }), { check: true });
    await d.act(action('size', null, { width: dims.width, height: dims.height }), { check: true });
    const longs = await d.evaluate(() => window.__persona.long).catch(() => []);
    for (const task of longs.slice(countedLongTasks)) d.rec.add('pending', 'longtask', '主執行緒忙碌 ' + Math.round(task.ms) + ' ms（瀏覽器 PerformanceObserver）');
    countedLongTasks = longs.length;
    const record = metrics.rounds.at(-1);
    record.longTasks = longs;
    record.nativeHeapBytes = await sampleHeap(d).catch(() => null);
    await d.rec.saveFindings(d);
  }
  const heaps = metrics.rounds.map(r => r.nativeHeapBytes).filter(Number.isFinite);
  if (heaps.length === 5) {
    metrics.heapGrowth = (heaps[4] - heaps[0]) / heaps[0];
    if (metrics.heapGrowth > 0.5 && heaps.every((n, i) => !i || n >= heaps[i - 1])) {
      d.rec.add('pending', 'heap-growth', '五輪回收後 JS heap 持續增加，第一輪到第五輪增加 ' + (metrics.heapGrowth * 100).toFixed(1) + '%');
    }
  }
  const num = (await d.inventory()).find(c => c.kind === 'num' || c.kind === 'text');
  if (num) for (const raw of stressValues) await invalidInput(d, num, raw);
  if (await d.visible('#view3d')) {
    await d.act(action('click', '#view3d'));
    await d.act(action('size', null, { width: 390, height: 844 }));
    if (await d.visible('#view2d')) await d.act(action('click', '#view2d'));
  }
  for (const key of ['dark', 'light', 'dark']) await d.act(action('setting', null, { key: 'theme', value: key }));
  for (const lang of ['en', 'zh-Hans', 'zh-Hant']) await d.act(action('setting', null, { key: 'lang', value: lang }), { check: true });
  await d.act(action('reload', null, { early: true }), { check: true });
  await d.act(action('history', null, { count: 3 }), { check: true });
}

async function interrupted(d) {
  const controls = await d.inventory();
  const initial = startButton(controls);
  const starRoute = {
    projectile: [action('click', '#run'), action('await-projectile')],
    'ph-scale': [action('click', '#measure')],
    'stack-queue': [...Array.from({ length: 3 }, () => action('click', '#bPush')), ...Array.from({ length: 3 }, () => action('click', '#bPop'))]
  }[d.config.slug];
  if (starRoute) {
    for (const item of starRoute) await d.act(item);
    await sleep(150);
    await d.rec.updateStars(d);
  } else if (initial) await d.act(activate(initial));
  await welcome(d);
  const guide = (await d.inventory()).find(x => x.kind === 'range');
  if (guide) await d.act(rangeKey(guide, 'End'));
  for (const nav of ['history', 'reload', 'history']) {
    const before = await d.status();
    const selectedBefore = await d.snapshotState();
    const result = await d.act(action(nav), { check: true });
    const after = await d.status();
    const selectedAfter = await d.snapshotState();
    const mismatched = selectedBefore.controls.filter(([id, value]) => selectedAfter.controls.some(([key, next]) => key === id && next !== value));
    const lost = before.filter(x => !after.some(y => x.id === y.id && x.stars === y.stars));
    (d.rec.metrics.resume ??= []).push({ step: result.step, nav, ok: result.ok, error: result.error, before, after, selectedBefore, selectedAfter, mismatched });
    if (lost.length) d.rec.add('confirmed', 'lost-star', '回到此頁後，已取得的星星紀錄遺失 ' + lost.map(x => x.id).join('、'));
  }
  if (initial && await d.visible(initial.selector)) await d.act(activate(initial), { check: true });
}

async function scroll(d) {
  d.rec.metrics.scroll = [];
  for (const [width, height] of [[640, 360], [390, 844]]) {
    await d.act(action('size', null, { width, height }));
    const specific = d.config.slug === 'data-compression';
    const c = specific ? { selector: '#cv' } : mainCanvas(await d.inventory());
    if (!c) continue;
    const gestures = specific ? [[0.45, 0.32, 0.45, 0.15, 1]] : [[0.45, 0.45, 0.45, 0.13], [0.6, 0.72, 0.6, 0.23]];
    for (const coords of gestures) {
      if (specific) await d.act(action('click', '#patBlank'));
      await d.stagePoint(c.selector, coords[0], coords[1], !!coords[4]);
      const before = await d.snapshotState();
      const result = await d.act(action('drag', c.selector, { coords }), { check: true });
      await sleep(320);
      const after = await d.snapshotState();
      const changed = before.controls.filter(([id, value]) => after.controls.some(([k, v]) => k === id && v !== value));
      const edited = before.outputs.filter(([id, value]) => after.outputs.some(([k, v]) => k === id && v !== value));
      d.rec.metrics.scroll.push({ step: result.step, width, height, canvas: c.selector, beforeY: before.y, afterY: after.y,
        ok: result.ok, error: result.error, changed, edited });
      if (result.ok && Math.abs(after.y - before.y) > 20 && (edited.length || changed.length)) {
        const black = specific && edited.find(([id]) => id === 'rBlack');
        const updated = black && after.outputs.find(([id]) => id === black[0])?.[1];
        d.rec.add(black ? 'confirmed' : 'pending', 'scroll-edit', black
          ? '手機畫布往上滑時頁面捲動，空白格讀數從 ' + black[1] + ' 變成 ' + updated
          : '直線滑過畫布時頁面捲動且控制或讀數有變化，請核對是否誤觸');
        await d.rec.saveFindings(d);
      }
    }
  }
}

const players = { beginner, student, gifted, clueless, expert, breaker, interrupted, scroll };
function play(persona, driver) { return players[persona](driver); }
module.exports = { play, bindings };
