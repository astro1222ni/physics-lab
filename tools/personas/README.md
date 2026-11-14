# 多種玩家試玩

在實驗室工作樹根目錄執行。執行器使用 Node.js、Chromium、固定規則與本機假後端。Playwright 必須支援 WebSocket 攔截。Windows 使用專案的瀏覽器啟動工具和共用鎖，內顯可用才開始。瀏覽器只獲准連到這次在 127.0.0.1 建立的網站，假帳號固定為 u1，靜音。

| 指令 | 用途 |
| --- | --- |
| `npm run personas -- projectile ph-scale stack-queue --seed=7` | 三站、六種預設玩家 |
| `npm run personas -- data-compression --persona=scroll --seed=7` | 手機滑過畫布 |
| `npm run personas -- stack-queue --persona=interrupted --habit=mobile+english+dark` | 操作中離開或重新整理 |
| `node tools/personas.cjs projectile --persona=breaker --seed=7 --until=19` | 重現到第 19 步 |
| `node tools/personas.cjs projectile --persona=expert --mission=projectile-4 --seed=7` | 單獨核對一則任務 |
| `npm run personas -- --nightly --batch=30` | 夜間輪流跑下一批，臺灣時間 22:30–06:00 |
| `node tools/personas.cjs --help` | 玩家、習慣及其他參數 |

習慣可以用加號組合。用 `--no-shots` 省略證據截圖。正常報告在 `.shots/personas-report.json` 和 `.shots/personas-report.md`，單步與單任務重現使用 `personas-report-repro`，截圖保存在各批目錄。報告記下實際耗時與重現指令。程式結束碼 0 表示本批無確定問題或按夜間窗口停下，1 表示有確定問題，2 表示測試未能完成。主控台會解釋提前停止原因。

夜間批次的「站」包含六名預設玩家，每個玩家各占用一張瀏覽器頁面。工具每次都經同一把鎖，在 CPU 90% 以上或時間窗口結束時等待或停止。若某站只完成部分玩家，下次從尚未完成的玩家接續，進度寫在 `.shots/personas-rotation.json`。182 站以每次 30 站估算約需 7 個有效批次，主機忙碌可能增加天數。排程由主工作串另行安排。不同玩家、習慣、種子或站清單會開新一輪。

極聰明玩家使用 `tools/personas/proofs.cjs` 裡明列、從任務證明轉出的公開介面操作路徑。目前完整映射拋體運動、酸鹼值、堆疊與佇列；其餘任務在難度表逐筆標明缺少介面路徑。新增路徑應從假帳號的空白紀錄驗證，先由實際介面觸發事件，再核對星星與完成標記。紀錄的最短步數只適用於已成功跑過的路徑。

問題清單沿用 `tools/playtest/exclude.cjs` 裡已經人工確認的條目。快速連點的設定間隔為 10–30 毫秒，報告保存發送時刻。主執行緒逾時和五輪記憶體成長先列待確認，錄製、載入和系統負載也可能影響量測。
