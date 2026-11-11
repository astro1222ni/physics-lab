# Astro Ni 物理實驗室 — 專案備忘錄

高中物理互動模擬網站。網址：https://astro1222ni.github.io/physics-lab/
推送到 `main` 後由 GitHub Pages 自動部署（約 1–2 分鐘）。

## 與站長合作的方式

- **一律用繁體中文（臺灣用語）溝通**，不要用英文跟站長說話；系統的英文訊息要翻成中文說明。
- 站長偏好「**一步一步來**」：需要站長在 GitHub、Firebase 等網站操作時，一次只給一個步驟，附上**可以直接點的完整網址**，等站長回覆或拍照確認後再給下一步。
- 站長常用平板拍螢幕照片回報；看照片時要確認細節（例如值有沒有引號）。
- 站長是高中物理老師（Astro Ni YouTube 頻道），網站給學生使用，學生多為未成年人：留言、隱私要保守設計。

## 最高原則

1. **物理正確第一。** 每個模組的物理核心（`js/<模組>-core.js`）與畫面分離，並有 Node 單元測試（解析解、極限情況、守恆量）。
2. **美感與視覺享受同樣重要。** 就算是 2D 畫面，也要細緻、有立體感、有設計感。繪圖前必讀並遵守技能 `.claude/skills/physics-visual-design/SKILL.md`。美化不可改變任何物理量。
3. **學生操作不消耗任何 AI 額度**：純前端靜態網站，所有計算在瀏覽器中完成。

## 架構

| 檔案 | 用途 |
|---|---|
| `index.html` | 首頁：依物理分支分類、搜尋、全站統計 |
| `<模組>.html`、`js/<模組>.js`、`js/<模組>-core.js`、`tests/<模組>-core.test.js` | 各實驗模組 |
| `lab.css` | 共用樣式與色彩代號（淺色＋深色兩組），字體一律 `calc(Npx * var(--fs, 1))` |
| `js/settings.js` | 齒輪設定：繁體／简体／English、字體大小、淺色／深色、音效。放在每頁 `<head>` 緊接 `<meta charset>` |
| `js/hans-map.js` | 簡體對照表，由 `tools/build-hans.cjs` 產生（物理名詞對照在該檔 `PHRASES`） |
| `js/sound.js` | 共用音效（Web Audio 即時合成）；手機小喇叭聽不到 200 Hz 以下，主要頻率放 250 Hz 以上 |
| `js/stats.js` | 瀏覽人次、操作次數、累計操作時間（Firebase Realtime Database，匿名數字） |
| `js/comments.js` | Google 登入與留言（只顯示自訂暱稱）；`privacy.html` 為隱私說明 |
| `js/firebase-config.js` | Firebase 網頁設定（公開值，非密碼） |
| `firebase/database.rules.json` | 資料庫安全規則（修改後需請站長貼到 Firebase 主控台「規則」分頁並發布） |
| `vendor/` | KaTeX、three.js 等第三方檔案（內建，不依賴 CDN；Firebase SDK 例外，從 gstatic 載入） |
| `tools/stamp.py` | 在 HTML 的 CSS/JS 連結加版本號防快取；**修改 CSS/JS 後、commit 前執行** |

## 新增或修改模組的慣例

- 頁面結構照現有模組：`.crumbs` 導覽（首頁／分支／主題）、`.lab`（畫布＋控制面板）、`.notes`（KaTeX 公式與觀察重點）、頁尾。
- 頁尾前依序載入：KaTeX、`js/math.js`、物理核心、頁面程式、`js/firebase-config.js`、`js/stats.js data-module="<模組>"`、`js/comments.js`。
- 公式一律用 KaTeX（`\( … \)`、`\[ … \]`）。**不可使用** Unicode 組合字元（例如向量箭頭 U+20D7）或上標數字字元 ⁰⁴⁵⁶⁷⁸⁹⁻（部分 Android 字型缺字）；讀數上標用 `<sup>`。
- 英文：靜態文字加 `data-en`／`data-en-html`／`data-en-placeholder`／`data-en-aria-label`；程式字串用 `LabSettings.t('中文', 'English')`；完成後 `<body data-en-ready>`。簡體自動轉換。
- 深淺色切換：模組要監聽 `lab:themechange`，重新讀取顏色並重畫。
- 首頁：在對應分支加卡片（`data-module`、`data-keywords` 同義詞、`data-en`），已上線的卡片用 `<a class="module live">`。
- 手機 390 px 不可出現左右捲動；控制項觸控目標至少 44 px。

## 發布前檢查

1. `for t in tests/*.test.js; do node "$t"; done` 全部通過。
2. Playwright（已預裝，`require('playwright')`）實際開頁：390 px 與 1280 px、淺色／深色、繁體／簡體／English、字體特大；沒有主控台錯誤、沒有 `.katex-error`、英文模式沒有殘留中文；親自看截圖。
3. `python3 tools/stamp.py`，再 commit、push。

## Firebase（專案 astro-ni-physics-lab）

- Realtime Database（新加坡）：`stats/`、`comments/`、`profiles/`、`reports/`、`rateLimit/`、`admins/`。
- 新增管理員：請對方先在網站登入一次 → Firebase 主控台 Authentication「使用者」取得 UID → Realtime Database「資料」在 `admins` 底下新增 `UID: true`（布林值，不能有引號）。
- 此雲端工作環境連不到 Firebase 與 gstatic；Firebase 相關功能要用模擬後端測試，正式驗證請站長在網站上操作。
