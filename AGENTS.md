# AGENTS.md — 給 Codex 的工作規則（Astro Ni 科學實驗室）

這份是 Codex 的入口。完整的專案規則在 `CLAUDE.md`（架構、慣例、任務與星星、上線約定），目前狀態在 `HANDOFF.md`。動手前兩份都要讀。本檔只寫 Codex 和 Claude 分工時**另外**要守的事。

## 分工（11/14 站長決定）

- **Codex**：照交辦單寫新實驗的程式（頁面、物理核心、單元測試、任務檔、任務證明、英文），修試玩報告找到的問題，做試玩。
- **Claude（主工作串）**：寫規格、改共用檔、審查、合併、上線。
- 交辦單放在 `G:\Claude與Codex共用交談區\`，標題寫「收件：Codex」。要站長在 Codex 工作串親自交辦後才開始。

## 在哪裡做

- 只在自己的工作樹 `G:\physics-lab-wt\codex`（分支 `codex-pilot`，或交辦單指定的分支）裡改檔、commit。
- **不 push、不合併、不改 `main`**。`G:\physics-lab`（主線）和其他科目的工作樹（`G:\physics-lab-wt\<科目>`）都只讀。
- **共用檔不要改**，需要改的寫進交件單，由 Claude 合併時改：
  - `index.html`、`js/missions/index.js`、`js/achievements.js`、`lab.css`
  - `js/missions.js`、`js/settings.js`、`js/numinput.js`、`js/drawkit.js`、`js/sound.js`、`js/hans-map.js`
  - `firebase/database.rules.json`、`tools/mock-backend.js`
  - `docs/directory/*.json`、`CLAUDE.md`、`HANDOFF.md`、`AGENTS.md`
- 新實驗只新增自己的檔案：`<代號>.html`、`js/<代號>.js`、`js/<代號>-core.js`、`tests/<代號>-core.test.js`、`js/missions/<代號>.js`、`tools/mission-proofs/<代號>.cjs`，以及縮圖。

## 品質標準（和 Claude 做的一樣）

- 動手前先讀這三份：`docs/briefs/new-module.md`、`docs/briefs/missions.md`、`.claude/skills/physics-visual-design/SKILL.md`。也找一個同分支、已上線的實驗當範本，照它的結構寫。
- 科學正確第一：核心和畫面分開，單元測試要包含解析解、極限情況、守恆量。
- 任務：一般任務約 8–12 個、隱藏任務 10 個，難度 1–10 級。每個任務都要用證明腳本證明做得到、預設狀態不會觸發。
- 畫面：2D 和 3D 都要細緻。手機 390 px 不可左右捲動，觸控目標至少 44 px。深淺色、繁體／简体／English 都要對，英文模式不可殘留中文。
- 公式用 KaTeX。不可使用 Unicode 上標或組合字元（例如 ⁰⁴⁻、向量箭頭 U+20D7），上標用 `<sup>`。
- 在工作樹裡跑 `npm test`、`node tools/check-pages.cjs <代號>`、`npm run shots -- <代號>`、`node tools/playtest.cjs <代號>`，並親眼看截圖。

## 安全（必守）

- 絕不寫入正式 Firebase：測試一律載入 `tools/mock-backend.js`，並擋掉所有外部連線。
- 瀏覽器一律用 `require('<工作樹>/tools/browser.cjs').launch()`（Intel 內顯、低優先）。用 `node "G:/physics-lab-wt/規劃/音樂-工具/browser-lock.cjs" run -- <指令>` 排隊，同一時間只開一個瀏覽器。不用 4070，不用 computer use 控制桌面。
- 學生多為未成年：不加任何收集個資的功能。

## 交件

完成後寫交件單到 `G:\physics-lab-wt\交件\<科目>-Codex-<代號>-<日期>.md`，在共用交談區留一則回覆（標題寫「收件：Claude」），全部用繁體中文。交件單要寫：
- commit 編號與改了哪些檔
- 物理或科學依據、測試結果、任務清單（代號、等級、判定條件）、證明結果
- 截圖路徑
- 合併時要改的共用檔：首頁卡片（中英說明、`data-keywords`）、`LAB_MISSION_MODULES`／`LAB_LIVE_MODULES`／`LAB_MODULE_BRANCH`，以及縮圖設定
- 還沒確定、要站長決定的事
