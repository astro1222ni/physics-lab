'use strict';
const assert = require('node:assert/strict');
const { launchCohorts, checkFresh } = require('../tools/catalog-dates.cjs');
const launch = require('../tools/catalog-launch.json');

const firstDay = '2026-11-14', lastBadgeDay = '2026-11-20';
const firstLabs = [
  { s: 'supply-demand', d: 'civ', l: firstDay },
  { s: 'perspective-drawing', d: 'art', l: firstDay }
];
const subjects = new Set(firstLabs.map(lab => lab.d));
const firstBatch = Object.fromEntries(Object.entries(launch.subjectLaunches).filter(([, p]) => subjects.has(p.subject)));
assert.deepEqual(Object.keys(firstBatch).sort(), firstLabs.map(lab => lab.s).sort());

const original = { s: 'projectile', d: 'physics', l: launch.modules.projectile.date };
const manifest = { modules: { projectile: launch.modules.projectile }, subjectLaunches: firstBatch };
const catalog = [original, ...firstLabs];
const history = { projectile: launch.modules.projectile };
for (const lab of firstLabs) {
  history[lab.s] = { date: firstDay, path: lab.s + '.html', commit: '8c481d65a5b27337c0646554f8937b9d900e4f66' };
}
const { siteDates, subjectLaunches } = launchCohorts(manifest, [original], catalog, history);
const check = (labs, day = lastBadgeDay) => checkFresh(labs, day, siteDates, subjectLaunches);

const firstWeek = check(catalog);
const nextWeek = check(catalog, '2026-11-21');
for (const lab of firstLabs) {
  assert.deepEqual(firstWeek[lab.d].incremental, [lab.s], '首批仍顯示新上架徽章');
  assert.deepEqual(firstWeek[lab.d].counted, [], '只有名單內的首站免計比例');
  assert.deepEqual(nextWeek[lab.d].incremental, [], '上架滿七天後徽章消失');
  const second = { s: 'second-lab', d: lab.d, l: lastBadgeDay };
  assert.deepEqual(check([...catalog, second])[lab.d].counted, ['second-lab'], '小科每七日至少可加 1 站（第二站）');
  const third = { s: 'third-lab', d: lab.d, l: lastBadgeDay };
  assert.throws(() => check([...catalog, second, third]), new RegExp(lab.d + ' 2/3：second-lab, third-lab'));
}
assert.deepEqual(check(catalog, firstDay).physics.initial, ['projectile']);
assert.deepEqual(check(catalog, firstDay).physics.incremental, [], '建站舊站沿用原徽章規則');
const extra = (d, l = firstDay) => ({ s: 'extra-' + d, d, l });
assert.throws(() => check([{ ...firstLabs[0], l: lastBadgeDay }, extra('civ', lastBadgeDay)]), /civ 2\/2/);
assert.throws(() => check([{ ...firstLabs[0], d: 'other' }, extra('other')]), /other 2\/2/);
assert.throws(() => check([{ s: 'unlisted', d: 'other', l: firstDay }, extra('other')]), /other 2\/2/);

const later = Array.from({ length: 9 }, (_, i) => ({
  s: 'later-' + i, d: 'civ', l: i < 3 ? lastBadgeDay : '2026-11-13'
}));
const atLimit = check([firstLabs[0], ...later]).civ;
assert.equal(atLimit.incremental.length, 4);
assert.equal(atLimit.counted.length, 3, '首站以外剛好 30% 通過');
assert.throws(() => check([firstLabs[0], ...later.map((lab, i) => i === 3 ? { ...lab, l: lastBadgeDay } : lab)]), /civ 4\/10/);

function verifyEntry(slug, proof) {
  return launchCohorts({ ...manifest, subjectLaunches: { [slug]: proof } }, [original], catalog, history);
}
const first = firstBatch['supply-demand'];
assert.deepEqual(Object.keys(first).sort(), ['path', 'subject'], '首站清單不寫死日期與 commit');
assert.equal(subjectLaunches['supply-demand'].date, firstDay, '首站上架日取自 HEAD 歷史');
assert.throws(() => verifyEntry('supply-demand', { ...first, path: 'wrong.html' }), /路徑不符/);
// 還沒 commit（HEAD 歷史沒有）：上架日算今天，仍免計比例並顯示徽章。
const preHistory = { ...history }; delete preHistory['perspective-drawing'];
const pre = launchCohorts(manifest, [original], catalog, preHistory).subjectLaunches;
assert.equal(pre['perspective-drawing'].date, null);
const today = lastBadgeDay, launchDay = [{ ...firstLabs[1], l: today }];
const preWeek = checkFresh(launchDay, today, siteDates, pre).art;
assert.deepEqual(preWeek.incremental, ['perspective-drawing'], '上線當天起顯示新徽章');
assert.deepEqual(preWeek.counted, [], '上線當天首站仍免計比例');
assert.deepEqual(checkFresh([...launchDay, { s: 'second-lab', d: 'art', l: today }], today, siteDates, pre).art.counted, ['second-lab'], '首站與第二站同日上線可以通過');
assert.throws(() => verifyEntry('supply-demand', { ...first, subject: 'art' }), /科目目錄不符/);
assert.throws(() => verifyEntry('missing', first), /科目目錄不符/);
assert.throws(() => verifyEntry('projectile', { ...history.projectile, subject: 'physics' }), /科目目錄不符/);
assert.throws(() => launchCohorts({ modules: { 'supply-demand': first } }, [original], catalog, history), /首次建站批次/);
console.log('首批科目的 Git 證據、七日徽章、建站舊站與後續新增的 30% 門檻全部通過。');
