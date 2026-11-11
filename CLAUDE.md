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
| `js/sound.js` | 共用音效（Web Audio 即時合成，壓縮器＋限幅器）：`tone`、`sweep`、`noise`、持續發聲 `voice`；手機小喇叭聽不到 200 Hz 以下，主要頻率放 250 Hz 以上 |
| `js/numinput.js` | 點擊滑桿數字直接輸入數值（`LabNum.value/set/clear/register`） |
| `js/stats.js` | 瀏覽人次、操作次數、累計操作時間、目前在線人數（Firebase Realtime Database，匿名數字；在線＝每分頁一個隨機代號的心跳，150 秒內有心跳算在線） |
| `js/comments.js` | Google 登入與留言（只顯示自訂暱稱）；首次進站的登入提示（鼓勵完成任務，可按「先逛逛」跳過，每個瀏覽器只出現一次）；`privacy.html` 為隱私說明 |
| `js/firebase-config.js` | Firebase 網頁設定（公開值，非密碼） |
| `firebase/database.rules.json` | 資料庫安全規則（修改後需請站長貼到 Firebase 主控台「規則」分頁並發布） |
| `vendor/` | KaTeX、three.js 等第三方檔案（內建，不依賴 CDN；Firebase SDK 例外，從 gstatic 載入） |
| `tools/stamp.py` | 在 HTML 的 CSS/JS 連結加版本號防快取；**修改 CSS/JS 後、commit 前執行** |

## 新增或修改模組的慣例

- 頁面結構照現有模組：`.crumbs` 導覽（首頁／分支／主題）、`.lab`（畫布＋控制面板）、`.notes`（KaTeX 公式與觀察重點）、頁尾。
- 頁尾前依序載入：KaTeX、`js/math.js`、物理核心、（有音效時）`js/sound.js`、`js/numinput.js`、頁面程式、`js/firebase-config.js`、`js/stats.js data-module="<模組>"`、`js/comments.js`。
- **滑桿數字可直接輸入**（站長要求）：每個滑桿的數字放在同一個 `.slider` 的 `<output>`，由 `js/numinput.js` 自動變成可點擊輸入；讀值一律用 `LabNum.value(el)`，依實驗需要設定 `data-decimals`（打字精度可比滑桿細），`<output>` 顯示到該精度；非線性滑桿用 `LabNum.register`，程式改滑桿用 `LabNum.set` 或先 `LabNum.clear`。
- **任務模式與倪的星星**（站長要求）：每個實驗設計約 8–12 個任務，難度 1–10 級（星星數 = 等級），另加 2–3 個**隱藏任務**（只給隱晦的提示句，完成時只說「隱藏任務完成」不說原因）。任務必須靠操作實驗達成特定標準（例如兩發射程相等），並先用物理核心確認每個任務都做得到。寫在 `js/missions/<模組>.js`（`LabMission.register`），模組程式在關鍵時刻 `LabMission.emit('事件', {物理量})`；頁面載入 `js/missions.js data-module="<模組>"` 與任務檔（在 firebase-config.js 之後）；把模組加入 `js/missions/index.js`。新增任務後不必請站長手動同步：站長用管理員帳號登入並打開排行榜頁或該實驗頁時，`missions.js` 會自動比對 `missionDefs` 並補上新任務（排行榜頁的「同步任務清單」按鈕保留作手動備用）。
- **全部清除**（站長要求）：會累積歷史紀錄的實驗（多條軌跡、比較用的舊軌跡、隨時間累積的圖表、統計直方圖等），在主要按鈕旁放「全部清除／Clear all」按鈕，清掉所有累積內容、回到可以重新開始的狀態，但保留目前的滑桿設定。
- **音效**（站長要求「適合的都做」）：有教學意義的事件才加聲音（光學等非聲學現象不加）；頁面放 `#soundBtn` 音效開關（參考 collision），預設關閉；主要頻率 ≥ 250 Hz；持續變化的聲音用 `LabSound.voice`。
- 公式一律用 KaTeX（`\( … \)`、`\[ … \]`）。**不可使用** Unicode 組合字元（例如向量箭頭 U+20D7）或上標數字字元 ⁰⁴⁵⁶⁷⁸⁹⁻（部分 Android 字型缺字）；讀數上標用 `<sup>`。
- 英文：靜態文字加 `data-en`／`data-en-html`／`data-en-placeholder`／`data-en-aria-label`；程式字串用 `LabSettings.t('中文', 'English')`；完成後 `<body data-en-ready>`。簡體自動轉換。
- 深淺色切換：模組要監聽 `lab:themechange`，重新讀取顏色並重畫。
- 首頁：在對應分支加卡片（`data-module`、`data-keywords` 同義詞、`data-en`），已上線的卡片用 `<a class="module live">`。
- 手機 390 px 不可出現左右捲動；控制項觸控目標至少 44 px。

## 發布前檢查

1. `for t in tests/*.test.js; do node "$t"; done` 全部通過。
2. Playwright（已預裝，`require('playwright')`）實際開頁：390 px 與 1280 px、淺色／深色、繁體／簡體／English、字體特大；沒有主控台錯誤、沒有 `.katex-error`、英文模式沒有殘留中文；親自看截圖。
3. `python3 tools/stamp.py`，再 commit、push。背景同時有其他工作在改檔時，只 `git add` 自己要發布的檔案（不要用 `git add -u`／`-A`，以免把別人做到一半的檔案推上線）。

## Firebase（專案 astro-ni-physics-lab）

- Realtime Database（新加坡）：`stats/`、`presence/`、`comments/`、`profiles/`、`reports/`、`rateLimit/`、`admins/`。
- 新增管理員：請對方先在網站登入一次 → Firebase 主控台 Authentication「使用者」取得 UID → Realtime Database「資料」在 `admins` 底下新增 `UID: true`（布林值，不能有引號）。
- 此雲端工作環境連不到 Firebase 與 gstatic；Firebase 相關功能要用模擬後端測試，正式驗證請站長在網站上操作。
