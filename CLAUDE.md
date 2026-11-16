# 讓倪動手⚡高中全科模擬實驗室（Astro Ni Lab）— 專案備忘錄

高中八科互動模擬網站：物理、化學、生物、地球科學、數學、資訊科技、地理、音樂，共用前端引擎。品牌是「讓倪動手⚡高中全科模擬實驗室／Astro Ni Lab」。網址：https://lab.astroni.org/（GitHub Pages 自訂網域，舊網址 astro1222ni.github.io/physics-lab/ 會自動轉過來）。
推送到 `main` 後由 GitHub Pages 自動部署（約 1–2 分鐘）。
**接手或開新工作串時，先讀 `HANDOFF.md`**（目前狀態、開發工具、整合流程、待辦事項）。

**11/14 改名與四大類**（站長：「好，就照你最後的推薦，非常棒。」）：品牌改成「讓倪動手⚡高中全科模擬實驗室／Astro Ni Lab」（和「讓倪秒懂」「讓倪悟理」同系列，倪＝你）；首頁標誌是週期表的鎳格「28 Ni 倪」，Astro Ni 的 A 和 I 用 `--ai` 色標出，首頁頁尾有 AI 彩蛋句。首頁科目選單分四大類：數理（物理、化學、生物、地科、數學、資訊科技）、人文與社會（地理；國文、英文、歷史、公民製作中）、藝能科（音樂；美術、體育、健護、家政、生科製作中）、其他（全民國防、生涯規劃、探究與實作製作中）；規劃在 `G:\physics-lab-wt\規劃\四大類.md`。新科目上線時：在 `LAB_SUBJECTS` 補 `page`（完整英文、小寫連字號）、`dom`（科目區舊 id）、`group`，從 `LAB_SUBJECT_GROUPS.soon` 移除該科；建立自己的根目錄科目頁與 `docs/directory/<科>.json`，卡片放在科目頁。`npm run seo` 自動產生首頁大卡、科目數字與錨點相容表。分享卡的品牌字在 `tools/seo.cjs`（改了要 `--force` 重做）。

## 與站長合作的方式

- **一律用繁體中文（臺灣用語）溝通**，不要用英文跟站長說話；系統的英文訊息要翻成中文說明。**連工具呼叫之間的一句進度、對話摘要接手後的第一則、指令旁的說明也一樣**（11/12 站長原話：「不要用英文跟我交談，寫入 skills，備忘錄。」）。寫任何一句前先看第一個字是不是中文字。同一天下午又犯（站長：「你還是用英文啊，你還是沒有學對。」）：做到中段就滑回英文，所以**連思考也用中文**，長工作的每一句都要檢查，不是只檢查開頭。
- 站長偏好「**一步一步來**」：需要站長在 GitHub、Firebase 等網站操作時，一次只給一個步驟，附上**可以直接點的完整網址**，等站長回覆或拍照確認後再給下一步。
- 站長常用平板拍螢幕照片回報；看照片時要確認細節（例如值有沒有引號）。
- 站長是高中物理老師（Astro Ni YouTube 頻道），網站給學生使用，學生多為未成年人：留言、隱私要保守設計。
- 有選擇要站長決定時，列出選項並給建議（先說推薦哪個、為什麼）。大批工作進行中只簡短回報進度，全部完成後再完整報告（附網址與重點）。
- 雲端無法試聽音效、無法在實機上測手感：這類事情要請站長在平板或手機上確認。

## 最高原則

1. **物理正確第一。** 每個模組的物理核心（`js/<模組>-core.js`）與畫面分離，並有 Node 單元測試（解析解、極限情況、守恆量）。
2. **美感與視覺享受同樣重要。** 就算是 2D 畫面，也要細緻、有立體感、有設計感。繪圖前必讀並遵守技能 `.claude/skills/physics-visual-design/SKILL.md`。美化不可改變任何物理量。
3. **學生操作不消耗任何 AI 額度**：純前端靜態網站，所有計算在瀏覽器中完成。

## 架構

| 檔案 | 用途 |
|---|---|
| `index.html` | 首頁大廳：我的狀態、四大類八科入口、最新上架、本機推薦；頁尾全站統計 |
| `<模組>.html`、`js/<模組>.js`、`js/<模組>-core.js`、`tests/<模組>-core.test.js` | 各實驗模組 |
| `lab.css` | 共用樣式與色彩代號（淺色＋深色兩組），字體一律 `calc(Npx * var(--fs, 1))` |
| `js/settings.js` | 齒輪設定：繁體／简体／English、字體大小、淺色／深色、音效。放在每頁 `<head>` 緊接 `<meta charset>` |
| `js/hans-map.js` | 簡體對照表，由 `tools/build-hans.cjs` 產生（名詞對照在該檔 `PHRASES`，長詞先轉；依科目覆寫在 `SUBJECT_PHRASES`，例如數學頁的「向量」不轉成物理用的「矢量」，頁面清單由任務清單的分支自動算出，**新增數學實驗後要重跑 `node tools/build-hans.cjs`**） |
| `js/sound.js` | 共用音效（Web Audio 即時合成，壓縮器＋限幅器）：`tone`、`sweep`、`noise`、持續發聲 `voice`；手機小喇叭聽不到 200 Hz 以下，主要頻率放 250 Hz 以上 |
| `js/numinput.js` | 點擊滑桿數字直接輸入數值（`LabNum.value/set/clear/register`） |
| `js/stats.js` | 瀏覽次數（每載入一次頁面 +1，不是人數；11/14 由「瀏覽人次」改名）、操作次數、累計操作時間、目前在線人數（Firebase Realtime Database，匿名數字；在線＝前景分頁每分鐘在 `/online/<分鐘>` 計數器加 1，算的是分頁不是人；寫不進去時退回舊的隨機代號心跳） |
| `js/missions.js` | 任務模式「倪的星星」：`LabMission.register/emit`、任務面板、慶祝畫面、寫入完成紀錄；管理員登入時自動同步 `missionDefs` |
| `js/missions/<模組>.js`、`js/missions/index.js` | 各實驗的任務定義；`index.js` 有三份清單：`LAB_MISSION_MODULES`（有任務的實驗）、`LAB_LIVE_MODULES`（已上線的實驗）、`LAB_MODULE_BRANCH`（實驗所屬分支），另有 `LAB_SUBJECTS`（八科：原本五科＋資訊科技 `info`、地理 `geog`、音樂 `music`）、`LAB_SUBJECT_OF(模組)`（實驗屬於哪一科，由分支推得）與 `LAB_SUBJECT_SHOWN(科目)`（新科標 `newSubject: true`，第一個實驗上線前排行榜與成就都不顯示這一科） |
| `js/achievements.js` | 成就系統（等級系列＋單項成就＋跨科＋隱藏成就），分頁：全科、物理、化學、生物、地球科學、數學，新科有實驗後才出現；由 `missions.js` 自動載入；登入後才載入 `js/chapter-map.js`（章制霸用） |
| `js/chapter-map.js` | 各章的已上線實驗，由 `tools/build-catalog.cjs` 從各科目頁產生（`npm run seo` 會更新，請勿手改） |
| `docs/directory/<科目>.json`、`tools/apply-directory.cjs` | 各科完整目錄（分支 → 章 → 已上線＋規劃中的實驗）；`node tools/apply-directory.cjs` 依目錄重建各科目頁的章目錄與章節順序（`--check` 只檢查）；格式見 `docs/directory/README.md` |
| `daily.html`、`js/daily.js`、`js/daily-core.js`、`tests/daily-core.test.js` | 每日任務與寶物：臺灣時間 00:00 換新十個（簡單 4、中等 3、困難 3），每個一天完成一次；`daily-core.js` 是抽題、掉寶機率、持有數（純函式、有單元測試），另有寶物圖示與「我的寶物」格子（daily.html 與排行榜頁共用，排行榜頁直接載入它）；`daily.js` 是每日任務頁、實驗頁橫幅（網址帶 `?daily=<任務代號>`）、掉寶動畫與寫入 |
| `leaderboard.html`、`js/leaderboard.js` | 排行榜，也就是帳號選單的「我的星星與成就」（全科總排名＋各科排名分頁、前 100 名、自己的全科與各科名次、六種寶物排行與本人名次、我的寶物、公開設定、依科目分組的任務進度、我的成就、規則說明、管理員區） |
| `admin.html`、`js/admin.js` | 管理頁（11/14 站長：「個人明細也要」）：只有 `admins/<uid>` 讀得到；列出每個帳號的暱稱、星星、完成任務、成就、使用天數與操作時間，點一列看個人明細（任務紀錄、成就、每日任務與寶物、每天打開的實驗），可匯出 CSV。資料庫規則在 profiles、completions、bonus、userStats、achievements、daily、bag 上一層開放管理員讀取；不顯示 Google 姓名與電子郵件；`noindex`、不進網站地圖；管理員的帳號選單有連結 |
| `js/sharecard.js` | 成績卡（11/14 站長要求）：`LabMission.share(opts)` 按下才載入；畫 1080×1350 圖卡（全部科目／選科目／選實驗，名字可選完整、頭尾字、不顯示），手機用 `navigator.share` 分享到 IG、LINE、FB，另有存成圖片、複製圖片、複製文字；入口在排行榜「我的星星」與任務面板。科目範圍不寫全站分母、進度條和自己最多的一科比（全站總數太大會讓學生洩氣） |
| `js/search.js`、`js/search-index.js`、`js/math.js` | 按需載入的全科／本科搜尋；KaTeX 公式排版 |
| `js/comments.js` | Google 登入與留言（只顯示自訂暱稱）；首次進站的登入提示（鼓勵完成任務，可按「先逛逛」跳過，每個瀏覽器只出現一次；實驗頁要先操作 3 次或在前景停留 40 秒才出現，首頁照舊）；`privacy.html` 為隱私說明 |
| `js/firebase-config.js` | Firebase 網頁設定（公開值，非密碼） |
| `firebase/database.rules.json` | 資料庫安全規則（修改後需請站長貼到 Firebase 主控台「規則」分頁並發布） |
| `vendor/` | KaTeX、three.js 等第三方檔案（內建，不依賴 CDN；Firebase SDK 例外，從 gstatic 載入） |
| `tools/stamp.py` | 在 HTML 的 CSS/JS 連結加版本號防快取；**修改 CSS/JS 後、commit 前執行** |
| `tools/make_live.py` | 把科目頁「規劃中」卡片改成已上線的連結卡片 |
| `tools/run-tests.cjs`、`tools/check-pages.cjs` | `npm test`（全部單元測試）、`npm run check`／`npm run shots`（Playwright 版面與語言檢查，自帶伺服器） |
| `tools/mock-backend.js` | 測試用假 Firebase（任務、成就、留言、每日任務與寶物、各科排名，並模擬資料庫規則），Playwright `addInitScript` 載入；`localStorage.mockoffset` 可假造伺服器時間測換日 |
| `tools/make-qr.cjs` | 首頁 QR code（`img/qr-site.svg`），網址改了才重做 |
| `tools/mission-proofs/` | 各實驗「任務做得到」的證明腳本；改物理核心或任務條件後重跑 |
| `docs/briefs/` | 製作新模組、任務、替舊模組補任務的說明（交給背景助手時使用） |
| `js/drawkit.js` | 共用繪圖工具 `LabDraw`（立體球、木塊、陰影、標籤底框、箭頭、格線、背景，深淺色自動）；新畫面一律用它 |
| `js/thumbs.js`、`js/home.js`、`js/home-core.js`、`js/subject.js`、`img/thumbs/` | 動態縮圖、首頁個人狀態與推薦、科目頁章數與分支黏頂列 |
| `tools/seo.cjs`、`img/og/`、`sitemap.xml`、`robots.txt` | `npm run seo`：分享卡、每頁說明與 Open Graph、hreflang、結構化資料、網站地圖 |
| `tools/verify.cjs` | `npm run verify`：一鍵總檢查（單元測試、任務證明、靜態稽核、介面稽核、頁面檢查、試玩） |
| `tools/playtest.cjs`、`tools/playtest/exclude.cjs` | `npm run playtest [-- 代號…]`：自動試玩（像學生亂按、比對任務用字、抓錯誤與不合理數值），報告 `.shots/playtest-report.json`；verify 只重玩改過的實驗 |
| `docs/WORLD-CLASS.md`、`docs/auto-optimize-log.md` | 世界一流標準、待改清單、自動優化規則與紀錄（每週五 04:00 自動優化，11/13 站長改） |

## 新增或修改模組的慣例

- 頁面結構照現有模組：`.crumbs` 導覽（首頁／科目／分支／章）、`.lab`（畫布＋控制面板）、`.notes`（KaTeX 公式與觀察重點）、頁尾。
- 頁尾前依序載入：KaTeX、`js/math.js`、物理核心、（有音效時）`js/sound.js`、`js/numinput.js`、`js/labdeck.js`、頁面程式、`js/firebase-config.js`、`js/stats.js data-module="<模組>"`、`js/comments.js`。
- **滑桿數字可直接輸入**（站長要求）：每個滑桿的數字放在同一個 `.slider` 的 `<output>`，由 `js/numinput.js` 自動變成可點擊輸入；讀值一律用 `LabNum.value(el)`，依實驗需要設定 `data-decimals`（打字精度可比滑桿細），`<output>` 顯示到該精度；非線性滑桿用 `LabNum.register`，程式改滑桿用 `LabNum.set` 或先 `LabNum.clear`。
- **任務模式與倪的星星**（站長要求）：每個實驗設計約 8–12 個任務，難度 1–10 級（一般任務星星數 = 等級；隱藏任務 = 等級 × 2，算法統一用 `LabMission.starsOf`），另加 **10 個隱藏任務**（只給隱晦的提示句，完成時只說「隱藏任務完成」不說原因；站長 11/12 深夜：「每一個實驗的隱藏任務增加到十個」。已上線的隱藏任務代號、等級、判定都不改，新增的接著編號 `<代號>-h4`…`h10`；10 個分散在 3–10 級、至少 3 個在 7 級以上；每個都要有科學意義，不可以是「亂按 N 次」這種條件；任務證明要證明預設不觸發、彼此不連帶完成，試玩不可誤觸）。任務面板分「一般任務」「隱藏任務」兩區，各有展開／收合按鈕；橫式寬螢幕（≥ 1240 px）任務模式開啟時，面板變成貼在右側的一欄（`html.ms-docked`），收起時只留右邊緣的小標籤。任務必須靠操作實驗達成特定標準（例如兩發射程相等），並先用物理核心確認每個任務都做得到。寫在 `js/missions/<模組>.js`（`LabMission.register`），模組程式在關鍵時刻 `LabMission.emit('事件', {物理量})`；頁面載入 `js/missions.js data-module="<模組>"` 與任務檔（在 firebase-config.js 之後）；把模組加入 `js/missions/index.js`。新增任務後不必請站長手動同步：站長用管理員帳號登入並打開排行榜頁或該實驗頁時，`missions.js` 會自動比對 `missionDefs` 並補上新任務（排行榜頁的「同步任務清單」按鈕保留作手動備用）。
- **全部清除**（站長要求）：會累積歷史紀錄的實驗（多條軌跡、比較用的舊軌跡、隨時間累積的圖表、統計直方圖等），在主要按鈕旁放「全部清除／Clear all」按鈕，清掉所有累積內容、回到可以重新開始的狀態，但保留目前的滑桿設定。
- **音效**（站長要求「適合的都做」）：有教學意義的事件才加聲音（光學等非聲學現象不加）；頁面放 `#soundBtn` 音效開關（參考 collision），預設關閉；主要頻率 ≥ 250 Hz；持續變化的聲音用 `LabSound.voice`。
- 公式一律用 KaTeX（`\( … \)`、`\[ … \]`）。**不可使用** Unicode 組合字元（例如向量箭頭 U+20D7）或上標數字字元 ⁰⁴⁵⁶⁷⁸⁹⁻（部分 Android 字型缺字）；讀數上標用 `<sup>`。
- 英文：靜態文字加 `data-en`／`data-en-html`／`data-en-placeholder`／`data-en-aria-label`；程式字串用 `LabSettings.t('中文', 'English')`；完成後 `<body data-en-ready>`。簡體自動轉換。
- 深淺色切換：模組要監聽 `lab:themechange`，重新讀取顏色並重畫。
- 科目頁：卡片放進對應科目頁的分支裡**對應課程的章**（`<section class="chapter" id="ch-…">`，章名不寫第幾章；細節見 HANDOFF.md 第十節），`data-module`、`data-keywords` 同義詞、`data-en`，已上線的卡片用 `<a class="module live">`；再跑 `node tools/apply-directory.cjs`、`npm run thumbs -- <代號>`、`npm run seo`、`node tools/fix-crumbs.cjs`、`node tools/build-hans.cjs`。
- 手機 390 px 不可出現左右捲動；控制項觸控目標至少 44 px。
- **手機上一頁或鄰近一頁就能操作完整**（11/16 站長：「必須所有的實驗室都要做這樣的優化設定」）：每個實驗頁在 `js/numinput.js` 後面載入 `js/labdeck.js`。寬度 ≤ 880 px（`.lab` 變單欄）時，右欄（`.lab > .panel`）裡有控制項的卡片自動收進主畫布正下方的分頁操作台，分頁名＝卡片標題；切換區被藏起來的卡片、分頁會跟著藏。要自己決定分頁時，卡片加 `data-deck="中文|English"`、`data-deck-order`，畫布下方放 `data-deck-anchor`（等位線就是這樣）；主開關加 `data-deck-top`；不要操作台的頁面在 `<body>` 加 `data-deck-auto="off"`。上線前跑 `npm run reach -- .shots/reach.json <代號>`：412×780 從主畫布頂到最遠看得到的操作控制項不可超過 1170 px。電腦版也一樣：步驟會叫學生按的鍵不可放在數據表或說明之後。
- **手機、平板橫放**（11/16 站長：「萬一手機跟平板是橫着放的時候，它要如何呈現，纔能夠在單一個畫面不卷動太多的情況下，呈現所有的操作按鈕跟按鍵，還有拉條」）：`js/labdeck.js` 有三種擺法，`LabDeck.mode` 看得到。
  - `stack`（≤ 880 px，手機直放、平板直放）：操作台在主畫布正下方。
  - `drawer`（觸控、橫放、高 ≤ 600 px，手機橫放）：操作台固定在右邊、自己捲動，左邊是實驗；主畫布太高時只把「畫布那一塊」縮窄置中，讓畫布整個放得進一屏，播放列維持原寬；畫布高度寫死、縮窄也不會變矮的就不縮。body 右邊多留 40 px 給「留言・回報」「學習說明」側標籤。
  - `panel`（觸控、寬 > 880 px，平板橫放）：操作台放進右欄頂端，右欄黏在螢幕上、自己捲動。
  - 沒選到的分頁用 `.labdeck-away`（隱形、不佔高度、保留寬度），不可改回 `hidden`／`display:none`：分頁裡的畫布量到寬度 0 會畫出負半徑而出錯。drawer／panel 的 CSS 包在和 js 同樣的媒體查詢裡，轉向那一瞬間不會把畫布擠成一條縫。
  - 滑鼠的電腦版不動。新做或大改實驗時用手機橫放 844×390、平板橫放 1180×820 各看一次。

- **實驗模式與學習模式分開**（11/16 站長：「我覺得實驗模式與學習模式還是要分開，在不同的頁面跟介面……所有的實驗室都改成這個模式」「同一個實驗的實驗模式跟學習模式的星星數是統一計算，但是要賺取星星，要各自到這兩個不同的界面去賺取」）：
  - 有學習模式的實驗在 `<head>` 的 settings.js 後面載入 `js/modegate.js`（`data-lab`／`data-learn` 寫三點功能與操作，`｜` 分隔，另附 `-en`）。網址：`代號.html` 入口選擇畫面（直放上下、橫放左右）；`?mode=lab` 實驗模式；`?mode=learn` 學習選單（學生自學／老師上課）；`?mode=learn&study=1` 學生自學；再加 `&class=1` 老師上課。`#s=`、`?embed=1` 直接進實驗模式；範例屬於學習模式，`?ex=N` 轉到 `?mode=learn&study=1&seg=6&ex=N`。實驗模式沒有範例鈕（.ex-bar）、沒有「學習說明」側板（.lp-*），由 lab.css 依 `html[data-lab-mode=lab]` 藏起（站長：「實驗模式不會有範例，實驗模式也不會有學習說明的側版」）。
  - 結果寫在 `<html data-lab-mode>`；`js/missions.js` 的 `modeAllows`：實驗模式只判定一般與隱藏任務，學習模式只判定自學任務（`study: true`），入口畫面都不判定。星星合計在同一個實驗。
  - 實驗模式不放自學入口：原本的「🎓 自學模式」按鈕、邀請自學的連結加 `data-learn-entry`（實驗模式自動藏起）。自學裡的「回實驗」換頁到 `?mode=lab`。
  - 目前：等位線已上；電流天平的自學版做好後接上；其他實驗 renew 後由各科子工作串做自學版時一起接。

## 任務、排行榜與成就（站長的設計決定）

- 任務、星星、成就都**必須登入 Google 帳號**才記錄。操作實驗本身永遠不需要登入。
- 每個任務只能領一次星星，星星數 = 難度等級（1–10）。隱藏任務的提示句要**非常非常隱晦**，完成時只恭喜、不說原因。
- **隱藏任務星星加倍**（11/12 晚上站長：「隱藏任務的星星給的數量要再更大方一點，因爲畢竟要瞎猜」，選「加倍並補發」）：隱藏任務 = 等級 × 2（最多 20 顆，規則上限 20）。`missionDefs` 存的是星星數，管理員開排行榜頁或實驗頁時自動同步成新數字；加倍以前就完成的人，登入後由 `missions.js` 的 `syncBonus` 自動補發差額，寫在 `bonus/<uid>/<任務>`（只增不減、完成紀錄 + 補發 = missionDefs、必須和 `scores` 一起寫且 `last` = 該任務、總分剛好加上差額）。`state.done[任務].stars` 是含補發的實得星數。以後若再改星數，照同一套：改 `starsOf`、改規則上限、請站長貼規則、再開排行榜頁同步。
- 排行榜公開前 100 名，登入後一定看得到自己的名次。同分同名次，先達到的人排前面。
- **寶物排行**（11/16 站長：「寶物收集的數量也要有一個排行榜。那個數量指的是拿過累計的總數量，不是他目前持有的數量。」選定「總價值＋分頁」）：在排行榜頁提供寶物總價值及銅幣、銀幣、金幣、鑽石、稀有鑰匙六個分頁。只計 bag 累計獲得，不扣 used；總價值＝cu＋10ag＋100au＋1000dia＋10000key，以銅幣為單位（例如「總價值 12,345 銅」）。站長原話：「十枚銅幣等效一枚銀幣，10枚銀幣等效1枚金幣，10枚金幣等效1顆鑽石，10顆鑽石等效1把稀有鑰匙。」這是排行價值，尚非兌換功能。
  - `treasureBoard/<uid>` 公開記錄 v、cu、ag、au、dia、key、at、name、pub、ta；各量必須等於同次寫入後的 bag，v 必須等於加權和，at 必須為伺服器現在時間，只有本人能寫。bag 本身仍不公開。每次掉寶和 bag、dm、daily 同一次 update，讀取失敗不擲骰、不寫入。
  - `ta/<項目>` 記錄達到目前該項累計量的時間；只有該項數值改變才更新，改名或取得其他種類不重設。各榜公開前 100 名、同分同名次、先達到的排前；邊界同分者先補齊再排序。登入後顯示自己的名次（包含 100 名外及零枚），不公開時依 `LabMission.mask` 遮名。
  - 已有寶物的帳號登入後，公開榜缺少或與 bag／暱稱／公開設定不一致時自動補寫；一致時不重寫。舊 bag 沒有各項歷史時間，第一次補寫以當時伺服器時間開始排序，不能聲稱還原歷史先後。暱稱／公開設定與星星榜、寶物榜同筆更新，保留原有達到時間。

- 暱稱公開顯示，使用者要為自己的暱稱負責。選擇不公開時，只顯示第一個與最後一個字（`LabMission.mask`）。
- 成就分公開與隱藏兩種，不加星星。站長說「以後實驗會非常非常多」，所以成就要做長遠：系列等級的門檻用數量級（k、M、G、T），級數很多，稱號要有意境。
- 規則說明寫在排行榜頁，學生看得到。改了規則或判定方式，要同步更新說明。
- **各科排名**（11/12 站長要求）：全科總排名＋各科各自的排名（物理、化學、生物、地球科學、數學；資訊科技、地理、音樂第一個實驗上線後出現）；`scores/<uid>/s/<科目>` 存各科星星（只增不減、加總不超過總星數），`sa/<科目>` 是該科最後得星時間（同分時先達到的排前面）。舊紀錄由 `missions.js` 的 `syncSubjects` 自動補算。
- **成就分類**：全科成就（總星數、探索、全制霸、章制霸 `chapter`、分支制霸系列 `branches`、排行榜、每日任務、勤學、跨科等）與各科成就（`<科目>-stars`、`<科目>-explore`、`<科目>-full`、`<科目>-chapter` 系列、分支制霸、`<科目>-rank-100/10/1`）。還沒有實驗的科目顯示「製作中」；還沒有實驗的分支不顯示分支成就。
- **成就隨實驗擴張**（11/12 晚上站長：「你的成就係統要再擴張，因為這個實驗室越來越多了。」）：
  - 探索、全制霸、章制霸、分支制霸都是「每多一個實驗、一章、一個分支就多一級」，新實驗上線不必改程式。
  - 稱號寫到各科 60 個實驗、全科 300 個實驗。
  - 跨科成就（`cross-visit／mission／full／chapter／branch`）要求物理、化學、生物、地球科學、數學五科都做到（`CROSS5`）；之後加的科目不改它的條件。
  - **加新科目**（11/12 深夜加資訊、地理、音樂時定下的做法）：`js/missions/index.js` 的 `LAB_SUBJECTS` 加一筆（`newSubject: true`）、`js/achievements.js` 的 `SUBJ`、`BRANCH_SUBJ`、`SUBJ_TITLES` 與各分支的 `branch-<分支>`、`lab.css` 的 `--d-<科目>`／`--b-<分支>`／`.sb-<科目>`、`firebase/database.rules.json` 三處（`.indexOn`、`s` 的加總、`$subj` 的清單，**新科實驗上線前一定要先請站長貼規則**，否則學生在新科得的星星會被規則擋掉）、`tools/mock-backend.js` 的 `SUBJ`；上線時建立科目頁，設定 LAB_SUBJECTS.page/dom/group，從 LAB_SUBJECT_GROUPS 的製作中清單移除該科，重跑產生工具、排行榜規則說明的科目列舉。科目頁的科目區依 `docs/directory/<科目>.json` 建立分支與章，卡片縮排保留 12 格；再跑 `node tools/apply-directory.cjs <科目>` 補章目錄（科目頁不存在就略過）；該科特有的簡體用語放 `tools/build-hans.cjs` 的 `SUBJECT_PHRASES.<科目>`（只轉該科頁面），不要放全站 `PHRASES`。
  - 新分支上線時要在 `LIST` 補一個 `branch-<分支>` 成就，名稱用該領域代表人物的器物或故事。
- **每日任務**（11/16 站長新規格，取代先前掉寶規則）：每天從已上線、非隱藏的任務隨機抽十個（簡單 1–3 級 4 個、中等 4–6 級 3 個、困難 7–10 級 3 個，盡量不同實驗；同一人同一天固定）。每個一天只能完成一次，十個做完這一天就結束，兩次完成至少隔 10 秒。以前沒領過星星的任務照樣得星；金色實心「+N 顆星」與灰色虛線「N 顆星已領過」維持區別。
  - **11/16 站長原話**：「每日任務的掉寶，金銀銅鑽石、鑰匙改爲各自獨立計算幾率……只要完成，至少會掉一枚銅幣。那最多就是銅、銀、金、鑽石、鑰匙都會掉落，但是掉落幾率：等級越高的寶物，掉落的機率越低，但掉落的幾率以及掉落的數量，不再與星星的數量有關係……各種寶物的掉落數量照原本的設定有上限。」「但掉落的機率會與任務的難度有關。」
  - L＝任務等級 1–10，t＝(L−1)/9。五種各自獨立判定：銅幣 100%；銀幣 0.30＋0.30t；金幣 0.10＋0.18t；鑽石 0.02＋0.07t；稀有鑰匙 0.005＋0.030t。可以同時掉五種，至少有銅幣。新任務與領過星星的任務採用相同規則，星星數及星星比例不影響機率與數量。
  - 數量權重固定：銅幣 1–5 枚（5:4:3:2:1）、銀幣 1–3 枚（3:2:1）、金幣 1–2 枚（2:1）；鑽石與稀有鑰匙各 1 個。不隨難度或星星改變。`dropChances(level)` 回傳五種各自的機率；`roll(level, rand)` 回傳 `[{item, qty}, …]`，至少一筆。`qtyTable(item)`／`qtyMean(item)` 為固定分布；`starBoost`、`siteStars` 保留供統計使用，掉寶不使用。
  - 每次完成只呼叫一次 `update`，一起寫每日紀錄的 n、at、done、bag/dm 加一及所有掉落的數量。bag 不再限制最多一種寶物變動；各欄每次增加上限維持 cu +5、ag +3、au +2、dia +1、key +1、dm +1，舊版只增加一種也相容。動畫依銅、銀、金、鑽石、鑰匙揭曉並顯示各自數量；五種全掉時顯示「五寶齊發」，音效主頻至少 250 Hz。
- **寶物持有數**：`bag/<uid>` 的 cu、ag、au、dia、key 是「累計獲得」（只增不減）；之後的消費功能把用掉的數量記在 `bag/<uid>/used/<寶物>`，「現在剩下」＝累計獲得－已使用（`LabDailyCore.holdings`）。「我的星星與成就」（排行榜頁）與每日任務頁都顯示，**左邊累計獲得、右邊現在剩下**（站長指定的順序）。`used` 目前規則不准寫，做消費功能時再開。**寶物的用途站長說「以後再規劃」**；目前是前端擲骰、規則只能限制速度與數量，寶物有實際用途前要改成 Cloud Functions（需 Blaze 方案）在伺服器擲骰。

## 上線後不可隨意更動的約定
- **Google Search Console**（11/13 站長驗證通過，網址前置字元 https://lab.astroni.org/、HTML 標記）：`index.html` 的 `<meta name="google-site-verification" …>` **不可刪除**，刪了驗證會失效；它在 SEO 自動區塊外面，`npm run seo` 不會動到。

- **實驗代號（slug）與網址不改**：統計、任務、成就、留言都用它當鍵，站長的 YouTube 影片也可能連到這些網址。
- **已上線任務的代號與等級不改**：已完成的紀錄與總分都依賴它們。要調整難度，就改判定條件或容許值；真的要改等級或刪除任務，先和站長討論對已完成者的影響。成就系列的代號（`<系列>-<級>`）也一樣。
- **同一時間只讓一個工作串修改網站**：換工作串前，舊的先 `git push`，新的先 `git pull`，避免互相覆蓋。

## 發布前檢查

0. 開始改網站時建立 `.editing`（每日自動優化看到就跳過），push 完刪掉。
1. `npm run verify` 全過（含 `npm test`、任務證明、頁面檢查；提醒清單列進 `docs/WORLD-CLASS.md`）。
2. `npm run check`（Playwright）實際開頁，並用 `npm run shots -- <代號>` 存截圖親自看：390 px 與 1280 px、淺色／深色、繁體／簡體／English、字體特大；沒有主控台錯誤、沒有 `.katex-error`、英文模式沒有殘留中文；親自看截圖。
3. `python3 tools/stamp.py`，再 commit、push（推送一律用 `git -c credential.interactive=never -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=60 push origin main`：要登入時不會跳出看不到的視窗乾等，卡住 60 秒就停；失敗就開核可卡請站長登入，不可讓它掛整晚）。背景同時有其他工作在改檔時，只 `git add` 自己要發布的檔案（不要用 `git add -u`／`-A`，以免把別人做到一半的檔案推上線）。

## Firebase（專案 astro-ni-physics-lab）

- Realtime Database（新加坡）：`stats/`、`presence/`、`comments/`、`profiles/`、`reports/`、`rateLimit/`、`admins/`、`missionDefs/`、`completions/`、`bonus/`（隱藏任務加倍的補發）、`scores/`（含各科 `s/`、`sa/`）、`userStats/`、`achievements/`、`daily/`（每日任務：日序 `d`、`picks`、掉寶次數 `n`、時間 `at`、`done`）、`bag/`（私人寶物累計）、`treasureBoard/`（公開寶物排行，六項索引及各項達到時間）。
- 免費方案（Spark）限制：同時連線 100、儲存 1 GB、每月下載 10 GB。
- 新增管理員：請對方先在網站登入一次 → Firebase 主控台 Authentication「使用者」取得 UID → Realtime Database「資料」在 `admins` 底下新增 `UID: true`（布林值，不能有引號）。
- 雲端工作環境連不到 Firebase 與 gstatic；本機可以連，但測試一律用 `tools/mock-backend.js`，不要寫入正式資料庫。正式驗證請站長在網站上操作。

## 首頁與科目頁（2026-11-15，home-v2）

- 八科頁：physics、chemistry、biology、earth-science、mathematics、information-technology、geography、music（皆在根目錄）。唯一頁名／分類來源是 LAB_SUBJECTS 與 LAB_SUBJECT_GROUPS。
- 首頁沒有分支、章或完整實驗卡列。原本科目區完整搬到科目頁；實驗 slug、網址、任務、星星、成就、catalog 的 s/d/b/c 與章制霸對照不變。搬遷不變量在 tools/home-v2-invariants.json。
- 新實驗卡片加入對應科目頁；新科目先建科目頁和目錄，再讓首頁的製作中文字列變成科目按鍵。請勿再跑一次性 tools/split-home.cjs。
- npm run seo 先 build-catalog，再 SEO：科目卡數字、規劃數、最新四張、上架日、相似實驗、搜尋索引、同步錨點轉址表、科目分享卡／結構化資料／網站地圖。科目頁為非實驗頁，不得進入任務試玩或縮圖的實驗清單。
- search-index.js 只在聚焦搜尋或 ?q= 時載入。科目頁以 data-scope 限定本科，另連全科搜尋。home.js 在首次繪製後載入 catalog；LabThumbs.apply(root) 支援新卡與深淺色。
- stats.js 的 labHist 只存本機，最多 200 筆；推薦純前端，日期固定排序，限制同章／同科數並保留跨科。排行榜將本人全科名次存 labRank:<uid>，首頁只顯示快取，不現算排名。
- 首頁個人資料只讀 profiles/<uid>、scores/<uid>、daily/<uid>、completions/<uid>、bag/<uid>，共五筆且共用暱稱資料；既有登入選單另查一次 admins/<uid> 權限。未登入不查帳號節點，絕不讀全份 scores。統計為匿名節點，sessionStorage 快取五分鐘。
- 首頁狀態摘要與唯一主色按鈕連到星星／成就，名次快取7天失效，五寶物顯示扣除已用後的剩餘數；每日任務獨立暖金橫幅，臺灣00:00換日。入口登入以sessionStorage.labAfterLogin保留popup／redirect目的地，取消不跳頁。
- 科目按鍵沿用舊domain-tab的52 px圖示、23 px科名、13.5 px分支；3／2／1欄（1100／561斷點）、5 px厚邊、明算深淺色edge token。製作中只用文字列；最新與推薦各4張（同章／同科最多2、跨科至少1），冷啟動4科、8日涵蓋八科，跨科理由須x或cosine≥0.25。
- 日期用全分支最早新增紀錄，含改名與舊路徑；catalog-launch.json綁定首次建站182筆，真實日期保留但不計後續新徽章，其他七日新增超過該科30%即失敗。
- 科目整頁截圖前逐段捲動停300 ms，再等所有縮圖解碼；科目切換與黏頂列有24 px方向漸層，手機回頂端44 px圓形、頁底72 px。390×844首屏含完整每日橫幅與第一按鍵上緣；不再要求1280首屏全部八科。
- 課本切換預留 hidden 結構。build-catalog 找到 docs/textbook/<科>.json 才啟用，保留 view=textbook 與本機版本選擇；本次沒有課本資料。
- 本次工作不 stamp、不 push、不合併；供審稿素材在 .shots/home-v2-r2/總表.html 與 總表/，後者不 commit。
