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

/** 啟動 Chromium：Intel 內顯、低於標準優先權。opts 會傳給 chromium.launch（args 會合併）。 */
async function launch(opts) {
  lowerPriority(); // 子行程（Chromium）會繼承「低於標準」
  const { chromium } = require('playwright');
  const luid = intelLuid();
  const gpuArgs = luid ? ['--use-angle=d3d11', '--use-adapter-luid=' + luid, '--ignore-gpu-blocklist', '--enable-gpu-rasterization'] : [];
  const o = Object.assign({}, opts || {});
  o.args = gpuArgs.concat(o.args || []);
  const browser = await chromium.launch(o);
  browser.labGpu = luid ? 'Intel 內顯' : '軟體算繪（CPU）';
  return browser;
}

module.exports = { launch, lowerPriority, intelLuid };
