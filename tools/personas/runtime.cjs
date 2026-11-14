'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { setTimeout: sleep } = require('node:timers/promises');
const { pathToFileURL } = require('node:url');

const LOCK_FILE = 'G:/physics-lab-wt/規劃/音樂-工具/browser-lock.cjs';
const LOCK_DIR = 'G:/physics-lab-wt/music-browser.lock';
const LOCK_PRELOAD = path.join(__dirname, 'lock-console.cjs');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PAGE_WORKER_MAX_MS = 16 * 60_000;
const CHILD_DEADLINE_MS = PAGE_WORKER_MAX_MS + 44 * 60_000;

function underLock(token) {
  return lockAge(token) != null;
}

function lockAge(token) {
  if (!/^[a-f0-9]{32}$/.test(token || '')) return null;
  try {
    const owner = fs.readFileSync(path.join(LOCK_DIR, 'owner.txt'), 'utf8');
    return owner.includes(token) ? Date.now() - fs.statSync(LOCK_DIR).mtimeMs : null;
  } catch { return null; }
}

function childStatus(lock, CLI, token) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(lock)) { reject(new Error('找不到共用瀏覽器鎖：' + lock)); return; }
    const preload = pathToFileURL(LOCK_PRELOAD).href;
    const child = spawn(process.execPath, ['--import=' + preload, lock, 'run', '--', process.execPath, CLI, '--page-worker=' + token], {
      stdio: 'inherit', windowsHide: true
    });
    const expires = setTimeout(() => reject(new Error('等候共用瀏覽器鎖或單頁結果超時')), CHILD_DEADLINE_MS);
    child.once('error', error => { clearTimeout(expires); reject(error); });
    child.once('exit', code => { clearTimeout(expires); resolve(code); });
  });
}

function launchOpts(chromium) {
  const executablePath = fs.existsSync(chromium.executablePath()) ? undefined : fs.existsSync(CHROME) ? CHROME : undefined;
  return { executablePath, timeout: 30_000, args: [
    '--mute-audio', '--disable-background-networking', '--disable-component-update', '--no-pings',
    '--no-proxy-server', '--disable-quic', '--dns-prefetch-disable', '--overscroll-history-navigation=0',
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost',
    '--force-webrtc-ip-handling-policy=disable_non_proxied_udp'
  ] };
}

function cpuTotals() {
  return os.cpus().reduce((totals, cpu) => {
    totals.idle += cpu.times.idle;
    totals.all += Object.values(cpu.times).reduce((sum, v) => sum + v, 0);
    return totals;
  }, { idle: 0, all: 0 });
}

async function waitForCpu(canStart) {
  while (canStart()) {
    const a = cpuTotals();
    await sleep(1000);
    const b = cpuTotals();
    const capacity = b.all - a.all;
    if (capacity > 0 && (b.idle - a.idle) / capacity >= 0.1) return canStart();
    console.log('全機 CPU 超過 90% 或無法量測，等候下一頁');
    await sleep(2500);
  }
  return false;
}

module.exports = { LOCK_FILE, PAGE_WORKER_MAX_MS, underLock, lockAge, childStatus, launchOpts, waitForCpu };
