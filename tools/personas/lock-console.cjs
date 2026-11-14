'use strict';

// 共用鎖在 Windows 用 shell 啟動子程序。只在這一個鎖程序補上無主控台設定。
const cp = require('node:child_process');
if (process.platform === 'win32') {
  const { spawnSync } = cp;
  cp.spawnSync = (command, options) => spawnSync(command, { ...options, windowsHide: true });
}
