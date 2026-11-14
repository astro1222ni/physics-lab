'use strict';

const { setTimeout: sleep } = require('node:timers/promises');
const archive = require('./replays.json');
const entriesFor = (slug, habit) => habit === 'desktop' ? archive[slug] || [] : [];
const missedRoute = '缺少介面路徑';
const evidenceNote = '本機假後端與任務面板已核對';

function missionRows(missions) {
  const indexes = {};
  for (const hidden of [false, true]) {
    const section = hidden ? '.ms-hcard' : '.ms-item';
    const ordered = missions.filter(m => !!m.hidden === hidden).sort((a, b) => a.level - b.level);
    indexes[section] = ordered.map(m => m.id);
  }
  return indexes;
}

async function badges(d) {
  await d.expand();
  const ids = await d.evaluate(rows => Object.entries(rows).flatMap(([selector, missions]) =>
    [...document.querySelectorAll(selector)].flatMap((item, index) =>
      item.querySelector('.ms-check') && item.checkVisibility() ? [missions[index]] : [])), missionRows(d.missions));
  return new Set(ids);
}

async function playReplay(d, entries, standalone) {
  const target = d.config.mission;
  const achieved = new Set();
  const pending = new Map();
  for (const entry of entries) {
    const interests = Object.keys(entry.goals).filter(id => !standalone[id] && (!target || target === id));
    if (!interests.length) continue;
    const limit = target ? entry.goals[target] : entry.actions.length;
    const initialSize = entry.actions[0]?.op === 'size' ? entry.actions[0] : { width: 1280, height: 900 };
    await d.page.setViewportSize({ width: initialSize.width, height: initialSize.height });
    await d.load(d.url, true);

    const initial = d.rec.step;
    const start = performance.now();
    const observations = new Map();
    if (target) {
      d.rec.mission = target;
      d.rec.missionStart = initial;
    }
    let steps = 0;
    let firstFailure;
    // 重播可包含前一題留下的設定，因此同一頁只在每條紀錄開始時清空。
    for (const action of entry.actions.slice(0, limit)) {
      const result = await d.act(action);
      if (!result.ok && !firstFailure) firstFailure = result;
      if (d.page.url() !== d.url) break;
      if (result.ok && action.op !== 'size' && !action.op.startsWith('await-')) steps += typeof result.result === 'number' ? result.result : 1;
      for (const earned of await d.status()) {
        if (!observations.has(earned.id)) observations.set(earned.id, { steps, lastStep: d.rec.step, elapsedMs: Math.round(performance.now() - start) });
      }
    }
    await sleep(450);
    for (const earned of await d.status()) {
      if (!observations.has(earned.id)) observations.set(earned.id, { steps, lastStep: d.rec.step, elapsedMs: Math.round(performance.now() - start) });
    }
    const visible = await badges(d);
    const earnedStars = new Map((await d.status()).map(x => [x.id, x.stars]));
    for (const m of d.missions) {
      if (!interests.includes(m.id) || achieved.has(m.id)) continue;
      const timing = observations.get(m.id);
      if (timing && visible.has(m.id) && earnedStars.get(m.id) === m.level * (m.hidden ? 2 : 1)) {
        d.rec.missions.push({
          id: m.id, level: m.level, hidden: !!m.hidden, status: '✓ 已得星', stars: earnedStars.get(m.id),
          firstStep: initial + 1, ...timing, note: evidenceNote, source: entry.source, viewport: initialSize
        });
        pending.delete(m.id);
        achieved.add(m.id);
      } else {
        pending.set(m.id, {
          id: m.id, level: m.level, hidden: !!m.hidden, status: '未得星', steps, firstStep: initial + 1, lastStep: d.rec.step,
          elapsedMs: Math.round(performance.now() - start), source: entry.source, viewport: initialSize,
          note: timing ? '假後端有紀錄，面板完成標記未核對' :
            firstFailure ? '重播第 ' + (firstFailure.step - initial) + ' 步操作未完成：' + firstFailure.error : '本次重播未觸發任務得星'
        });
      }
    }
    await d.rec.updateStars(d);
    d.rec.mission = null;
    d.rec.missionStart = null;
  }
  for (const m of d.missions) {
    if (standalone[m.id] || target && m.id !== target || d.rec.missions.some(x => x.id === m.id)) continue;
    const row = pending.get(m.id);
    if (row) {
      d.rec.missionStart = row.firstStep - 1;
      d.rec.add('pending', 'expert-mission', m.id + '：' + row.note, { mission: m.id, reproductionStep: row.lastStep - row.firstStep + 1 });
      d.rec.missionStart = null;
      d.rec.missions.push(row);
    } else {
      d.rec.missions.push({ id: m.id, level: m.level, hidden: !!m.hidden, status: missedRoute,
        note: '本站的證明尚未轉成公開介面步驟' });
    }
  }
  await d.page.setViewportSize(d.config.habit.viewport);
  await d.rec.saveFindings(d);
}

module.exports = { entriesFor, playReplay };
