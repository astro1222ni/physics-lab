/*
 * browser.cjs — 所有 Playwright 工具共用的瀏覽器啟動（站長 2026-11-11：「我想要減少 CPU 的負擔」）。
 *
 * 1. 用 Intel 內顯算畫面：預設的無頭 Chromium 用 SwiftShader 軟體算繪，畫布與 3D 全部吃 CPU。
 *    這裡查出 Intel 內顯的介面卡代號（LUID，每次開機會變，所以每次開機查一次並快取），
 *    用 --use-angle=d3d11 --use-adapter-luid=<高位>,<低位>（十進位）指定內顯。
 *    絕不用 4070（留給影片，要用必須包租約）：找不到內顯就退回軟體算繪。
 * 2. 降低優先權：本程式與它開的 Chromium 都改成「低於標準」，CPU 先讓給其他工作。
 *
 * 用法：const { launch } = require('./browser.cjs'); const browser = await launch();
 * 環境變數 LAB_GPU=cpu 可強制軟體算繪（例如懷疑內顯畫錯時對照）。
 * 非 Windows（雲端）一律用預設值。
 */
'use strict';
const os = require('os');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PS = `$src = @'
using System; using System.Runtime.InteropServices; using System.Text;
[StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct DXGI_ADAPTER_DESC1 { [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string Description; public uint VendorId, DeviceId, SubSysId, Revision; public UIntPtr DedicatedVideoMemory, DedicatedSystemMemory, SharedSystemMemory; public uint LuidLow; public int LuidHigh; public uint Flags; }
[ComImport, Guid("29038f61-3839-4626-91fd-086879011a05"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] public interface IDXGIAdapter1 { void a1(); void a2(); void a3(); void a4(); void a5(); void a6(); void a7(); [PreserveSig] int GetDesc1(out DXGI_ADAPTER_DESC1 d); }
[ComImport, Guid("770aae78-f26f-4dba-a829-253c83d1b387"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] public interface IDXGIFactory1 { void f1(); void f2(); void f3(); void f4(); void f5(); void f6(); void f7(); void f8(); void f9(); [PreserveSig] int EnumAdapters1(uint i, out IDXGIAdapter1 a); }
public static class LabDx { [DllImport("dxgi.dll")] static extern int CreateDXGIFactory1(ref Guid g, [MarshalAs(UnmanagedType.Interface)] out IDXGIFactory1 f);
 public static string List(){ var g=new Guid("770aae78-f26f-4dba-a829-253c83d1b387"); IDXGIFactory1 f; CreateDXGIFactory1(ref g,out f); var sb=new StringBuilder(); for(uint i=0;i<8;i++){ IDXGIAdapter1 a; if(f.EnumAdapters1(i,out a)!=0) break; DXGI_ADAPTER_DESC1 d; a.GetDesc1(out d); sb.AppendFormat("{0}|{1}|{2}|{3}\\n", d.VendorId, d.LuidHigh, d.LuidLow, d.Description);} return sb.ToString(); } }
'@
Add-Type -TypeDefinition $src
[LabDx]::List()`;

function intelLuid() {
  if (process.platform !== 'win32' || process.env.LAB_GPU === 'cpu') return null;
  const boot = Math.round((Date.now() / 1000 - os.uptime()) / 60); // 開機時間（分鐘），換開機就重查
  const cache = path.join(os.tmpdir(), 'physics-lab-igpu.json');
  try {
    const c = JSON.parse(fs.readFileSync(cache, 'utf8'));
    if (Math.abs(c.boot - boot) <= 1) return c.luid;
  } catch (e) { /* 沒有快取 */ }
  let luid = null;
  try {
    const out = execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', PS], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
    for (const line of out.split(/\r?\n/)) {
      const [vendor, hi, lo] = line.split('|');
      if (vendor === '32902') { luid = hi + ',' + lo; break; } // 0x8086 = Intel
    }
  } catch (e) { luid = null; }
  try { fs.writeFileSync(cache, JSON.stringify({ boot, luid })); } catch (e) { /* 忽略 */ }
  return luid;
}

function lowerPriority() {
  try { os.setPriority(0, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch (e) { /* 沒有權限就算了 */ }
}

/*
 * 3. 全機瀏覽器位子（站長 11/20 同意小幫手建議：整台電腦的網頁自動測試同時最多 2～3 組）。
 *    原因：記憶體從 96 GB 降到 64 GB，11/20 07:0x 同時 11 組、40 支無頭瀏覽器，
 *    可用記憶體掉到 3～4 GB，擋住 4070 的影片工作兩小時。
 *    和 G:/physics-lab-wt/規劃/音樂-工具/browser-lock.cjs 共用同一組位子與號碼牌，先來先用。
 *    - 已經由 browser-lock.cjs 包著（環境變數 LAB_BROWSER_SLOT）就不再排隊。
 *    - 同一個程式第一次開瀏覽器時取位子，最後一個瀏覽器關掉就還；子程序繼承，不重複取。
 *    - 沒有 G:/physics-lab-wt（雲端、別台電腦）或 LAB_BROWSER_NOQUEUE=1 時不排隊。
 */
const SLOT_BASE = process.env.LAB_BROWSER_SLOT_BASE || 'G:/physics-lab-wt/music-browser.lock'; // 測試可另指位子資料夾
const SLOT_MAX = 3;
const SLOT_STALE = 25 * 60 * 1000;
const TICKET_STALE = 2 * 60 * 1000;
const SLOT_GIVE_UP = 180 * 60 * 1000;
let slotDir = null, slotBeat = null, openBrowsers = 0;
const nap = ms => new Promise(r => setTimeout(r, ms));

function slotFree(dir) {
  try {
    const st = fs.statSync(dir);
    if (Date.now() - st.mtimeMs > SLOT_STALE) { fs.rmSync(dir, { recursive: true, force: true }); return true; }
    return false;
  } catch (e) { return true; }
}

function releaseSlot() {
  if (!slotDir) return;
  clearInterval(slotBeat); slotBeat = null;
  try { fs.rmSync(slotDir, { recursive: true, force: true }); } catch (e) { /* 忽略 */ }
  if (process.env.LAB_BROWSER_SLOT === slotDir) delete process.env.LAB_BROWSER_SLOT;
  slotDir = null;
}

async function takeSlot() {
  if (slotDir || process.platform !== 'win32' || process.env.LAB_BROWSER_SLOT || process.env.LAB_BROWSER_NOQUEUE === '1') return;
  if (!fs.existsSync(path.dirname(SLOT_BASE))) return;
  const slots = [SLOT_BASE];
  for (let i = 2; i <= SLOT_MAX; i++) slots.push(SLOT_BASE + '-' + i);
  const waitDir = SLOT_BASE + '.wait';
  try { fs.mkdirSync(waitDir, { recursive: true }); } catch (e) { /* 忽略 */ }
  const t0 = Date.now();
  // 11/20 站長：龍騰串最高優先。設 LAB_BROWSER_PRIORITY 時號碼牌以 ! 開頭，排在所有一般號碼牌前面。
  const ticketName = (process.env.LAB_BROWSER_PRIORITY ? '!' : '') + String(t0).padStart(15, '0') + '-' + process.pid + '-' + Math.random().toString(36).slice(2, 8) + '.txt';
  const ticket = path.join(waitDir, ticketName);
  const label = process.argv.slice(1).join(' ');
  const touch = () => {
    try {
      if (!fs.existsSync(ticket)) fs.writeFileSync(ticket, label + '\n' + new Date(t0).toISOString());
      else { const n = new Date(); fs.utimesSync(ticket, n, n); }
    } catch (e) { /* 忽略 */ }
  };
  const ahead = () => {
    let names;
    try { names = fs.readdirSync(waitDir).filter(n => n.endsWith('.txt')).sort(); } catch (e) { return 0; }
    let n = 0;
    for (const name of names) {
      if (name === ticketName) return n;
      const p = path.join(waitDir, name);
      try { if (Date.now() - fs.statSync(p).mtimeMs > TICKET_STALE) { fs.rmSync(p, { force: true }); continue; } } catch (e) { continue; }
      n++;
    }
    return n;
  };
  let lastTouch = 0, said = false;
  try {
    while (!slotDir) {
      if (Date.now() - lastTouch > 20000) { touch(); lastTouch = Date.now(); }
      const free = slots.filter(slotFree);
      if (ahead() < free.length) {
        for (const dir of free) {
          try { fs.mkdirSync(dir); slotDir = dir; break; }
          catch (e) {
            // 沙盒或權限不足無法寫入鎖目錄時立即報錯，避免誤判成「被搶走」而空轉 180 分鐘
            if (e && (e.code === 'EPERM' || e.code === 'EACCES' || e.code === 'EROFS')) {
              throw new Error('沒有權限寫入瀏覽器排隊鎖 ' + dir + '（' + e.code + '）；不可繞過排隊，請改以具備排隊鎖寫入權限的環境執行');
            }
            /* 被搶走了 */
          }
        }
      }
      if (slotDir) break;
      if (Date.now() - t0 > SLOT_GIVE_UP) throw new Error('等了 180 分鐘還拿不到瀏覽器位子（全機最多 ' + SLOT_MAX + ' 組）');
      if (!said) { console.log('（瀏覽器排隊中：全機最多 ' + SLOT_MAX + ' 組網頁測試，照先來先用排隊）'); said = true; }
      await nap(3000);
    }
  } finally {
    try { fs.rmSync(ticket, { force: true }); } catch (e) { /* 忽略 */ }
  }
  try { fs.writeFileSync(path.join(slotDir, 'owner.txt'), 'browser.cjs ' + label + '\n' + new Date().toISOString()); } catch (e) { /* 忽略 */ }
  if (said) console.log('（拿到瀏覽器位子：' + (slots.indexOf(slotDir) + 1) + ' 號）');
  process.env.LAB_BROWSER_SLOT = slotDir; // 子程序繼承，不再重複排隊
  slotBeat = setInterval(() => { try { const n = new Date(); fs.utimesSync(slotDir, n, n); } catch (e) { /* 忽略 */ } }, 60000);
  slotBeat.unref();
  process.once('exit', releaseSlot);
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP']) {
    try { process.once(sig, () => { releaseSlot(); process.exit(130); }); } catch (e) { /* 這個平台沒有這個訊號 */ }
  }
}

/** 啟動 Chromium：Intel 內顯、低於標準優先權、全機排隊。opts 會傳給 chromium.launch（args 會合併）。 */
async function launch(opts) {
  lowerPriority(); // 子行程（Chromium）會繼承「低於標準」
  await takeSlot();
  const { chromium } = require('playwright');
  const luid = intelLuid();
  const gpuArgs = luid ? ['--use-angle=d3d11', '--use-adapter-luid=' + luid, '--ignore-gpu-blocklist', '--enable-gpu-rasterization'] : [];
  const o = Object.assign({}, opts || {});
  o.args = gpuArgs.concat(o.args || []);
  let browser;
  try { browser = await chromium.launch(o); }
  catch (e) { if (openBrowsers === 0) releaseSlot(); throw e; }
  openBrowsers++;
  browser.on('disconnected', () => { openBrowsers--; if (openBrowsers <= 0) { openBrowsers = 0; releaseSlot(); } });
  browser.labGpu = luid ? 'Intel 內顯' : '軟體算繪（CPU）';
  return browser;
}

module.exports = { launch, lowerPriority, intelLuid };
