'use strict';

const path = require('node:path');
const { setTimeout: sleep } = require('node:timers/promises');
const classic = require('../playtest.cjs');
const { displayedPK, accurateConcentration } = require('./proofs.cjs');
const { command, profiles } = require('./model.cjs');
const { Driver, openContext, deadline } = require('./driver.cjs');
const { play } = require('./strategies.cjs');

class Halt extends Error {}

function validNumberEditor(target) { return !!target.editor || target.kind === 'num'; }
function diagnosis(message) { return String(message).split('\n')[0].slice(0, 220); }

class Record {
  constructor(config, dir) {
    this.config = config;
    this.dir = dir;
    this.step = 0;
    this.blockedRequests = 0;
    this.dialogs = [];
    this.items = [];
    this.keys = new Map();
    this.missions = [];
    this.completed = new Map();
    this.actions = [];
    this.metrics = {};
    this.scale = {};
    this.exclude = classic.exclOf(classic.loadExclude(), config.slug);
    this.ex = this.exclude;
    this.shots = 0;
    this.opts = { noShots: true }; // 舊試玩檢查只回傳發現，由此遊玩紀錄保存當步的獨立截圖。
    this.start = performance.now();
  }

  add(level, kind, msg, extra) {
    const mission = extra?.mission || this.mission || null;
    const reproductionStep = this.config.persona === 'expert' && mission === this.mission && this.missionStart != null
      ? this.step - this.missionStart : this.step;
    const key = [kind, (extra?.key || msg).slice(0, 200), mission].join('|');
    const old = this.keys.get(key);
    if (old) {
      old.count++;
      if (level === 'confirmed' && old.level === 'pending') {
        old.level = level;
        old.step = this.step;
        old.reproductionStep = reproductionStep;
        old.repro = command(this.config, reproductionStep, mission);
        old.shot = null;
        this.unshot.add(old);
      }
      return null;
    }
    const item = { level, kind, msg, step: this.step, reproductionStep, count: 1, shot: null, repro: command(this.config, reproductionStep, mission) };
    if (mission) item.mission = mission;
    this.keys.set(key, item);
    this.items.push(item);
    this.unshot.add(item);
    return item;
  }

  unshot = new Set();

  async snapshot(driver, label, element) {
    if (this.config.noShots || this.shots >= 24) return null;
    this.shots++;
    const dir = path.join(this.dir, 'personas', this.config.id);
    const filename = [this.config.slug, this.config.persona, label, this.shots].join('-') + '.png';
    try {
      if (element) await driver.locator(element).scrollIntoViewIfNeeded({ timeout: 1400 });
      await deadline(driver.page.screenshot({ path: path.join(dir, filename), timeout: 3000 }), 3800, '截圖');
      return ['personas', this.config.id, filename].join('/');
    } catch { return null; }
  }

  async saveFindings(driver) {
    if (!this.unshot.size) return;
    const items = [...this.unshot];
    this.unshot.clear();
    const home = await driver.evaluate(() => [scrollX, scrollY]).catch(() => null);
    const shots = new Map();
    for (const item of items) {
      const id = item.kind === 'slider' ? /（#([a-zA-Z0-9_-]+)）/.exec(item.msg)?.[1] : null;
      const selector = id ? '[id="' + id + '"]' : null;
      if (!shots.has(selector)) shots.set(selector, await this.snapshot(driver, 'step-' + this.step, selector));
      item.shot = shots.get(selector);
    }
    if (home && shots.size && [...shots.keys()].some(Boolean)) {
      // 取證不應改變下一次觸控的起始捲動位置。
      await driver.evaluate(([x, y]) => scrollTo({ left: x, top: y, behavior: 'instant' }), home).catch(() => {});
    }
  }

  async updateStars(driver) {
    for (const entry of await driver.status()) {
      if (this.completed.has(entry.id)) continue;
      const result = { ...entry, step: this.step, elapsedMs: Math.round(performance.now() - this.start) };
      this.completed.set(entry.id, result);
    }
  }

  async inspect(driver) {
    const url = driver.page.url();
    if (url.startsWith(driver.origin + '/')) {
      const state = { scale: this.scale, url, path: new URL(url).pathname };
      try { await classic.check(driver.page, this, state); }
      catch (error) {
        if (!/Execution context was destroyed|Cannot find context/.test(error.message)) throw error;
        await driver.ready();
        await classic.check(driver.page, this, state);
      }
    }
    await this.saveFindings(driver);
  }

  result(gpu) {
    return {
      slug: this.config.slug, subject: this.config.subject, persona: this.config.persona, habit: this.config.habit,
      seed: this.config.seed, gpu, elapsedMs: Math.round(performance.now() - this.start),
      completed: [...this.completed.values()], missions: this.missions, findings: this.items,
      actions: this.actions, metrics: this.metrics, blockedRequests: this.blockedRequests, dialogs: this.dialogs,
      screenshot: this.screenshot ?? null, aborted: !!this.aborted
    };
  }
}

async function shownHydronium(d) {
  const value = await d.locator('#nowTbl tbody tr:nth-child(5) td').evaluate(el => {
    const exp = (el.querySelector('sup')?.textContent || '').replace(/[−–]/g, '-');
    const mantissa = el.textContent.trim().split(/[×x]/)[0];
    return Number(mantissa) * (exp ? 10 ** Number(exp) : 1);
  });
  return { value };
}

async function perform(d, a) {
  switch (a.op) {
    case 'expand': return d.expand(a.publicOnly);
    case 'click': return d.click(a.target);
    case 'press': return d.pressTarget(a.target, a.key);
    case 'tab': return d.page.keyboard.press('Tab');
    case 'key': return d.page.keyboard.press(a.key);
    case 'value': return d.type(a.target, a.value, !!a.editor, a.commit !== false, a.boundary);
    case 'select': return d.select(a.target, a.value);
    case 'drag': {
      const old = d.page.url();
      await d.drag(a.target, a.coords, a.fingers);
      await sleep(140);
      if (d.page.url() !== old) {
        const arrived = d.page.url();
        d.record.add('pending', 'gesture-navigation', '畫布手勢後跳到另一頁「' + arrived.replace(d.origin, '') + '」');
        await d.load();
        return { navigation: arrived.replace(d.origin, '') };
      }
      return;
    }
    case 'rapid': return d.rapid(a.target, a.intervals);
    case 'setting': return d.setting(a.key, a.value);
    case 'size': return d.page.setViewportSize({ width: a.width, height: a.height });
    case 'reload':
      await d.page.reload({ waitUntil: a.early ? 'commit' : 'domcontentloaded' });
      if (a.early) await d.page.reload({ waitUntil: 'domcontentloaded' });
      return d.ready();
    case 'history':
      return d.history(a.count || 1);
    case 'await-projectile':
      await d.page.waitForFunction(() => /再發射|Launch again/i.test(document.querySelector('#run')?.textContent || ''), null, { timeout: 42_000, polling: 125 });
      return;
    case 'ph-find': {
      const { value: h } = await shownHydronium(d);
      const logC = accurateConcentration(h, a.initialLogC);
      if (!Number.isFinite(logC)) throw new Error('無法從公開讀數推算濃度');
      if (logC !== a.initialLogC) await d.type('#cAo', logC, true);
      d.unknownLogC = logC;
      return { shownHydronium: h, chosenLogC: logC };
    }
    case 'ph-answer': {
      const { value: h } = await shownHydronium(d);
      const answer = displayedPK(h, a.logC ?? d.unknownLogC);
      if (!Number.isFinite(answer)) throw new Error('無法從公開讀數計算 pKa');
      await d.type('#ansK', answer.toFixed(a.decimals), false);
      return { shownHydronium: h, submitted: answer.toFixed(a.decimals) };
    }
    default: throw new Error('未知操作：' + a.op);
  }
}

async function run(browser, root, origin, config, missions, dir) {
  const rec = new Record(config, dir);
  let session, d;
  let fatal;
  try {
    session = await openContext(browser, root, origin, { ...config, welcome: profiles[config.persona].welcome }, missions, rec);
    d = new Driver(session, origin, config, rec);
    d.rng = classic.rngOf(config.seed, config.slug + ':' + config.persona);
    d.roll = n => Math.floor(d.rng() * n);
    d.pick = xs => xs.length ? xs[d.roll(xs.length)] : undefined;
    d.elapsed = () => performance.now() - rec.start;
    d.missions = missions;
    d.rec = rec;
    d.canStart = () => Date.now() < config.deadline && !d.page.isClosed();
    d.act = async (action, opt = {}) => {
      if (!d.canStart()) throw new Halt('單頁已達執行上限');
      if (config.until !== null && rec.step >= config.until) throw new Halt();
      const time = performance.now();
      rec.step++;
      const row = { step: rec.step, ...(rec.mission ? { mission: rec.mission } : {}), ...action, ok: false };
      rec.actions.push(row);
      try {
        if (opt.delay) await sleep(opt.delay);
        await d.markStep(rec.step);
        const value = await perform(d, action);
        if (value !== undefined) row.result = value;
        row.ok = true;
      } catch (error) { row.error = diagnosis(error.message); }
      row.ms = Math.round(performance.now() - time);
      if (opt.check || rec.step % 8 === 0 || config.until === rec.step) await rec.inspect(d);
      else await rec.saveFindings(d);
      return row;
    };
    await d.load(d.origin + '/index.html');
    await d.load();
    rec.loaded = true;
    if (config.until === null && !config.mission) {
      await sleep(config.persona === 'beginner' ? 10_000 : 250);
      await rec.updateStars(d);
      for (const entry of rec.completed.values()) {
        if (entry.stars > 0 && config.persona === 'beginner') rec.add('confirmed', 'idle-mission', '前 10 秒未操作即得星：' + entry.id, { mission: entry.id });
      }
    }
    await rec.inspect(d);
    if (config.persona === 'gifted') rec.metrics.keyboardTabLimit = 135;
    if (config.until !== 0) await play(config.persona, d, validNumberEditor);
    await rec.updateStars(d);
    await rec.inspect(d);
  } catch (e) {
    fatal = e;
    rec.aborted = !rec.loaded || !(e instanceof Halt) || !!e.message;
    if (!(e instanceof Halt) || e.message) {
      rec.add('pending', 'tool', '這一組提早結束。' + diagnosis(e.message));
    }
  } finally {
    if (d) {
      await rec.saveFindings(d).catch(() => {});
      if (config.until != null || ['breaker', 'expert', 'interrupted', 'scroll'].includes(config.persona) || fatal) {
        rec.screenshot = await rec.snapshot(d, 'final').catch(() => null);
      }
      await deadline(session.ctx.close(), 4500, '關閉測試分頁').catch(() => {});
    }
  }
  return rec.result(browser.labGpu);
}

module.exports = { run };
