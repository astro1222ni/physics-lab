# 讓倪動手⚡高中全科模擬實驗室（Astro Ni Lab）— 專案備忘錄

高中物理・化學・生物・地球科學・數學互動模擬網站（11/12 起品牌名「Astro Ni 科學實驗室／Astro Ni Science Lab」；一個網站、五個科目、共用引擎；數學是 11/12 下午站長要求加入的第五科，科目代號 `math`）。網址：https://lab.astroni.org/（GitHub Pages 自訂網域，舊網址 astro1222ni.github.io/physics-lab/ 會自動轉過來）
推送到 `main` 後由 GitHub Pages 自動部署（約 1–2 分鐘）。
**接手或開新工作串時，先讀 `HANDOFF.md`**（目前狀態、開發工具、整合流程、待辦事項）。

**11/14 改名與四大類**（站長：「好，就照你最後的推薦，非常棒。」）：品牌改成「讓倪動手⚡高中全科模擬實驗室／Astro Ni Lab」（和「讓倪秒懂」「讓倪悟理」同系列，倪＝你）；首頁標誌是週期表的鎳格「28 Ni 倪」，Astro Ni 的 A 和 I 用 `--ai` 色標出，首頁頁尾有 AI 彩蛋句。首頁科目選單分四大類：數理（物理、化學、生物、地科、數學、資訊科技）、人文與社會（地理；國文、英文、歷史、公民製作中）、藝能科（音樂；美術、體育、健護、家政、生科製作中）、其他（全民國防、生涯規劃、探究與實作製作中）；規劃在 `G:\physics-lab-wt\規劃\四大類.md`。新科目上線時：在 `nav.domain-nav` 對應的 `h2.dgroup` 後面加 domain-tab、從 `.domain-soon` 拿掉該科名，科目區放在該大類的 `p.dgroup-band` 後面。分享卡的品牌字在 `tools/seo.cjs`（改了要 `--force` 重做）。

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
| `index.html` | 首頁：依物理分支分類、搜尋、全站統計 |
| `<模組>.html`、`js/<模組>.js`、`js/<模組>-core.js`、`tests/<模組>-core.test.js` | 各實驗模組 |
| `lab.css` | 共用樣式與色彩代號（淺色＋深色兩組），字體一律 `calc(Npx * var(--fs, 1))` |
| `js/settings.js` | 齒輪設定：繁體／简体／English、字體大小、淺色／深色、音效。放在每頁 `<head>` 緊接 `<meta charset>` |
| `js/hans-map.js` | 簡體對照表，由 `tools/build-hans.cjs` 產生（名詞對照在該檔 `PHRASES`，長詞先轉；依科目覆寫在 `SUBJECT_PHRASES`，例如數學頁的「向量」不轉成物理用的「矢量」，頁面清單由任務清單的分支自動算出，**新增數學實驗後要重跑 `node tools/build-hans.cjs`**） |
| `js/sound.js` | 共用音效（Web Audio 即時合成，壓縮器＋限幅器）：`tone`、`sweep`、`noise`、持續發聲 `voice`；手機小喇叭聽不到 200 Hz 以下，主要頻率放 250 Hz 以上 |
| `js/numinput.js` | 點擊滑桿數字直接輸入數值（`LabNum.value/set/clear/register`） |
| `js/stats.js` | 瀏覽人次、操作次數、累計操作時間、目前在線人數（Firebase Realtime Database，匿名數字；在線＝每分頁一個隨機代號的心跳，150 秒內有心跳算在線） |
| `js/missions.js` | 任務模式「倪的星星」：`LabMission.register/emit`、任務面板、慶祝畫面、寫入完成紀錄；管理員登入時自動同步 `missionDefs` |
| `js/missions/<模組>.js`、`js/missions/index.js` | 各實驗的任務定義；`index.js` 有三份清單：`LAB_MISSION_MODULES`（有任務的實驗）、`LAB_LIVE_MODULES`（已上線的實驗）、`LAB_MODULE_BRANCH`（實驗所屬分支），另有 `LAB_SUBJECTS`（八科：原本五科＋資訊科技 `info`、地理 `geog`、音樂 `music`）、`LAB_SUBJECT_OF(模組)`（實驗屬於哪一科，由分支推得）與 `LAB_SUBJECT_SHOWN(科目)`（新科標 `newSubject: true`，第一個實驗上線前排行榜與成就都不顯示這一科） |
| `js/achievements.js` | 成就系統（等級系列＋單項成就＋跨科＋隱藏成就），分頁：全科、物理、化學、生物、地球科學、數學，新科有實驗後才出現；由 `missions.js` 自動載入；登入後才載入 `js/chapter-map.js`（章制霸用） |
| `js/chapter-map.js` | 各章的已上線實驗，由 `tools/build-catalog.cjs` 從首頁產生（`npm run seo` 會更新，請勿手改） |
| `docs/directory/<科目>.json`、`tools/apply-directory.cjs` | 各科完整目錄（分支 → 章 → 已上線＋規劃中的實驗）；`node tools/apply-directory.cjs` 依目錄重建首頁的章目錄與章節順序（`--check` 只檢查）；格式見 `docs/directory/README.md` |
| `daily.html`、`js/daily.js`、`js/daily-core.js`、`tests/daily-core.test.js` | 每日任務與寶物：臺灣時間 00:00 換新十個（簡單 4、中等 3、困難 3），每個一天完成一次；`daily-core.js` 是抽題、掉寶機率、持有數（純函式、有單元測試），另有寶物圖示與「我的寶物」格子（daily.html 與排行榜頁共用，排行榜頁直接載入它）；`daily.js` 是每日任務頁、實驗頁橫幅（網址帶 `?daily=<任務代號>`）、掉寶動畫與寫入 |
| `leaderboard.html`、`js/leaderboard.js` | 排行榜，也就是帳號選單的「我的星星與成就」（全科總排名＋各科排名分頁、前 100 名、自己的全科與各科名次、我的寶物、公開設定、依科目分組的任務進度、我的成就、規則說明、管理員區） |
| `admin.html`、`js/admin.js` | 管理頁（11/14 站長：「個人明細也要」）：只有 `admins/<uid>` 讀得到；列出每個帳號的暱稱、星星、完成任務、成就、使用天數與操作時間，點一列看個人明細（任務紀錄、成就、每日任務與寶物、每天打開的實驗），可匯出 CSV。資料庫規則在 profiles、completions、bonus、userStats、achievements、daily、bag 上一層開放管理員讀取；不顯示 Google 姓名與電子郵件；`noindex`、不進網站地圖；管理員的帳號選單有連結 |
| `js/sharecard.js` | 成績卡（11/14 站長要求）：`LabMission.share(opts)` 按下才載入；畫 1080×1350 圖卡（全部科目／選科目／選實驗，名字可選完整、頭尾字、不顯示），手機用 `navigator.share` 分享到 IG、LINE、FB，另有存成圖片、複製圖片、複製文字；入口在排行榜「我的星星」與任務面板。科目範圍不寫全站分母、進度條和自己最多的一科比（全站總數太大會讓學生洩氣） |
| `js/search.js`、`js/math.js` | 首頁搜尋；KaTeX 公式排版 |
| `js/comments.js` | Google 登入與留言（只顯示自訂暱稱）；首次進站的登入提示（鼓勵完成任務，可按「先逛逛」跳過，每個瀏覽器只出現一次；實驗頁要先操作 3 次或在前景停留 40 秒才出現，首頁照舊）；`privacy.html` 為隱私說明 |
| `js/firebase-config.js` | Firebase 網頁設定（公開值，非密碼） |
| `firebase/database.rules.json` | 資料庫安全規則（修改後需請站長貼到 Firebase 主控台「規則」分頁並發布） |
| `vendor/` | KaTeX、three.js 等第三方檔案（內建，不依賴 CDN；Firebase SDK 例外，從 gstatic 載入） |
| `tools/stamp.py` | 在 HTML 的 CSS/JS 連結加版本號防快取；**修改 CSS/JS 後、commit 前執行** |
| `tools/make_live.py` | 把首頁「規劃中」卡片改成已上線的連結卡片 |
| `tools/run-tests.cjs`、`tools/check-pages.cjs` | `npm test`（全部單元測試）、`npm run check`／`npm run shots`（Playwright 版面與語言檢查，自帶伺服器） |
| `tools/mock-backend.js` | 測試用假 Firebase（任務、成就、留言、每日任務與寶物、各科排名，並模擬資料庫規則），Playwright `addInitScript` 載入；`localStorage.mockoffset` 可假造伺服器時間測換日 |
| `tools/make-qr.cjs` | 首頁 QR code（`img/qr-site.svg`），網址改了才重做 |
| `tools/mission-proofs/` | 各實驗「任務做得到」的證明腳本；改物理核心或任務條件後重跑 |
| `docs/briefs/` | 製作新模組、任務、替舊模組補任務的說明（交給背景助手時使用） |
| `js/drawkit.js` | 共用繪圖工具 `LabDraw`（立體球、木塊、陰影、標籤底框、箭頭、格線、背景，深淺色自動）；新畫面一律用它 |
| `js/thumbs.js`、`js/home.js`、`img/thumbs/` | 首頁縮圖（`npm run thumbs -- <代號>` 產生）、章名按鈕的實驗數 |
| `tools/seo.cjs`、`img/og/`、`sitemap.xml`、`robots.txt` | `npm run seo`：分享卡、每頁說明與 Open Graph、hreflang、結構化資料、網站地圖 |
| `tools/verify.cjs` | `npm run verify`：一鍵總檢查（單元測試、任務證明、靜態稽核、介面稽核、頁面檢查、試玩） |
| `tools/playtest.cjs`、`tools/playtest/exclude.cjs` | `npm run playtest [-- 代號…]`：自動試玩（像學生亂按、比對任務用字、抓錯誤與不合理數值），報告 `.shots/playtest-report.json`；verify 只重玩改過的實驗 |
| `docs/WORLD-CLASS.md`、`docs/auto-optimize-log.md` | 世界一流標準、待改清單、自動優化規則與紀錄（每週五 04:00 自動優化，11/13 站長改） |

## 新增或修改模組的慣例

- 頁面結構照現有模組：`.crumbs` 導覽（首頁／分支／主題）、`.lab`（畫布＋控制面板）、`.notes`（KaTeX 公式與觀察重點）、頁尾。
- 頁尾前依序載入：KaTeX、`js/math.js`、物理核心、（有音效時）`js/sound.js`、`js/numinput.js`、頁面程式、`js/firebase-config.js`、`js/stats.js data-module="<模組>"`、`js/comments.js`。
- **滑桿數字可直接輸入**（站長要求）：每個滑桿的數字放在同一個 `.slider` 的 `<output>`，由 `js/numinput.js` 自動變成可點擊輸入；讀值一律用 `LabNum.value(el)`，依實驗需要設定 `data-decimals`（打字精度可比滑桿細），`<output>` 顯示到該精度；非線性滑桿用 `LabNum.register`，程式改滑桿用 `LabNum.set` 或先 `LabNum.clear`。
- **任務模式與倪的星星**（站長要求）：每個實驗設計約 8–12 個任務，難度 1–10 級（一般任務星星數 = 等級；隱藏任務 = 等級 × 2，算法統一用 `LabMission.starsOf`），另加 **10 個隱藏任務**（只給隱晦的提示句，完成時只說「隱藏任務完成」不說原因；站長 11/12 深夜：「每一個實驗的隱藏任務增加到十個」。已上線的隱藏任務代號、等級、判定都不改，新增的接著編號 `<代號>-h4`…`h10`；10 個分散在 3–10 級、至少 3 個在 7 級以上；每個都要有科學意義，不可以是「亂按 N 次」這種條件；任務證明要證明預設不觸發、彼此不連帶完成，試玩不可誤觸）。任務面板分「一般任務」「隱藏任務」兩區，各有展開／收合按鈕；橫式寬螢幕（≥ 1240 px）任務模式開啟時，面板變成貼在右側的一欄（`html.ms-docked`），收起時只留右邊緣的小標籤。任務必須靠操作實驗達成特定標準（例如兩發射程相等），並先用物理核心確認每個任務都做得到。寫在 `js/missions/<模組>.js`（`LabMission.register`），模組程式在關鍵時刻 `LabMission.emit('事件', {物理量})`；頁面載入 `js/missions.js data-module="<模組>"` 與任務檔（在 firebase-config.js 之後）；把模組加入 `js/missions/index.js`。新增任務後不必請站長手動同步：站長用管理員帳號登入並打開排行榜頁或該實驗頁時，`missions.js` 會自動比對 `missionDefs` 並補上新任務（排行榜頁的「同步任務清單」按鈕保留作手動備用）。
- **全部清除**（站長要求）：會累積歷史紀錄的實驗（多條軌跡、比較用的舊軌跡、隨時間累積的圖表、統計直方圖等），在主要按鈕旁放「全部清除／Clear all」按鈕，清掉所有累積內容、回到可以重新開始的狀態，但保留目前的滑桿設定。
- **音效**（站長要求「適合的都做」）：有教學意義的事件才加聲音（光學等非聲學現象不加）；頁面放 `#soundBtn` 音效開關（參考 collision），預設關閉；主要頻率 ≥ 250 Hz；持續變化的聲音用 `LabSound.voice`。
- 公式一律用 KaTeX（`\( … \)`、`\[ … \]`）。**不可使用** Unicode 組合字元（例如向量箭頭 U+20D7）或上標數字字元 ⁰⁴⁵⁶⁷⁸⁹⁻（部分 Android 字型缺字）；讀數上標用 `<sup>`。
- 英文：靜態文字加 `data-en`／`data-en-html`／`data-en-placeholder`／`data-en-aria-label`；程式字串用 `LabSettings.t('中文', 'English')`；完成後 `<body data-en-ready>`。簡體自動轉換。
- 深淺色切換：模組要監聽 `lab:themechange`，重新讀取顏色並重畫。
- 首頁：卡片放進對應分支裡**選修物理講義的章**（`<section class="chapter" id="ch-…">`，章名不寫第幾章；細節見 HANDOFF.md 第十節），`data-module`、`data-keywords` 同義詞、`data-en`，已上線的卡片用 `<a class="module live">`；再跑 `npm run thumbs -- <代號>`、`npm run seo`。
- 手機 390 px 不可出現左右捲動；控制項觸控目標至少 44 px。

## 任務、排行榜與成就（站長的設計決定）

- 任務、星星、成就都**必須登入 Google 帳號**才記錄。操作實驗本身永遠不需要登入。
- 每個任務只能領一次星星，星星數 = 難度等級（1–10）。隱藏任務的提示句要**非常非常隱晦**，完成時只恭喜、不說原因。
- **隱藏任務星星加倍**（11/12 晚上站長：「隱藏任務的星星給的數量要再更大方一點，因爲畢竟要瞎猜」，選「加倍並補發」）：隱藏任務 = 等級 × 2（最多 20 顆，規則上限 20）。`missionDefs` 存的是星星數，管理員開排行榜頁或實驗頁時自動同步成新數字；加倍以前就完成的人，登入後由 `missions.js` 的 `syncBonus` 自動補發差額，寫在 `bonus/<uid>/<任務>`（只增不減、完成紀錄 + 補發 = missionDefs、必須和 `scores` 一起寫且 `last` = 該任務、總分剛好加上差額）。`state.done[任務].stars` 是含補發的實得星數。以後若再改星數，照同一套：改 `starsOf`、改規則上限、請站長貼規則、再開排行榜頁同步。
- 排行榜公開前 100 名，登入後一定看得到自己的名次。同分同名次，先達到的人排前面。
- 暱稱公開顯示，使用者要為自己的暱稱負責。選擇不公開時，只顯示第一個與最後一個字（`LabMission.mask`）。
- 成就分公開與隱藏兩種，不加星星。站長說「以後實驗會非常非常多」，所以成就要做長遠：系列等級的門檻用數量級（k、M、G、T），級數很多，稱號要有意境。
- 規則說明寫在排行榜頁，學生看得到。改了規則或判定方式，要同步更新說明。
- **各科排名**（11/12 站長要求）：全科總排名＋各科各自的排名（物理、化學、生物、地球科學、數學；資訊科技、地理、音樂第一個實驗上線後出現）；`scores/<uid>/s/<科目>` 存各科星星（只增不減、加總不超過總星數），`sa/<科目>` 是該科最後得星時間（同分時先達到的排前面）。舊紀錄由 `missions.js` 的 `syncSubjects` 自動補算。
- **成就分類**：全科成就（總星數、探索、全制霸、章制霸 `chapter`、分支制霸系列 `branches`、排行榜、每日任務、勤學、跨科等）與各科成就（`<科目>-stars`、`<科目>-explore`、`<科目>-full`、`<科目>-chapter` 系列、分支制霸、`<科目>-rank-100/10/1`）。還沒有實驗的科目顯示「製作中」；還沒有實驗的分支不顯示分支成就。
- **成就隨實驗擴張**（11/12 晚上站長：「你的成就係統要再擴張，因為這個實驗室越來越多了。」）：
  - 探索、全制霸、章制霸、分支制霸都是「每多一個實驗、一章、一個分支就多一級」，新實驗上線不必改程式。
  - 稱號寫到各科 60 個實驗、全科 300 個實驗。
  - 跨科成就（`cross-visit／mission／full／chapter／branch`）要求物理、化學、生物、地球科學、數學五科都做到（`CROSS5`）；之後加的科目不改它的條件。
  - **加新科目**（11/12 深夜加資訊、地理、音樂時定下的做法）：`js/missions/index.js` 的 `LAB_SUBJECTS` 加一筆（`newSubject: true`）、`js/achievements.js` 的 `SUBJ`、`BRANCH_SUBJ`、`SUBJ_TITLES` 與各分支的 `branch-<分支>`、`lab.css` 的 `--d-<科目>`／`--b-<分支>`／`.sb-<科目>`、`firebase/database.rules.json` 三處（`.indexOn`、`s` 的加總、`$subj` 的清單，**新科實驗上線前一定要先請站長貼規則**，否則學生在新科得的星星會被規則擋掉）、`tools/mock-backend.js` 的 `SUBJ`；上線時再加首頁的科目分頁與科目區、排行榜規則說明的科目列舉。首頁科目區用目錄檔 `docs/directory/<科目>.json` 的分支與章（資訊科 11/13 上線時用的腳本做法：科目區照數學的結構插在頁尾前、卡片縮排 12 格，再跑 `node tools/apply-directory.cjs <科目>` 補章目錄；新科還沒放上首頁時 apply-directory 會略過它）；該科特有的簡體用語放 `tools/build-hans.cjs` 的 `SUBJECT_PHRASES.<科目>`（只轉該科頁面），不要放全站 `PHRASES`。
  - 新分支上線時要在 `LIST` 補一個 `branch-<分支>` 成就，名稱用該領域代表人物的器物或故事。
- **每日任務**（11/12 站長設計，同日改版）：每天從已上線、非隱藏的任務隨機抽**十個**（簡單 1–3 級 4 個、中等 4–6 級 3 個、困難 7–10 級 3 個，盡量不同實驗；同一人同一天抽到的固定）。**每個每日任務一天只能完成一次，十個做完這一天就結束**（站長：「不如每一天有十個隨機的每日任務，這十個做完，這一天就不能再多做了」；沒有重做）。以前沒領過星星的任務照樣得星；**掉寶一律看機率**（星星比例 0 時 ★1–★10 為 25%–60%，全拿滿時 50%–100%，中間線性內插；11/13 站長改），任務越難、星星越多越高，新任務和做過的任務一樣（站長：「首次完成得星但掉寶的機遇與重做是一樣的」）。兩次完成至少隔 10 秒（規則）。每次掉寶只掉一種寶物（不會同時掉兩種）：銅幣 1–5、銀幣 1–3、金幣 1–2、鑽石 1、稀有鑰匙 1；錢幣的數量也跟著同一個運氣（難度＋星星比例）連動，越好越偏多（`qtyTable`：運氣 0 權重 5:4:3:2:1，運氣 1 倒過來），鑽石與鑰匙最多 1 個（站長：「掉寶數量也隨之連動，但是鑽石跟鑰匙最多就是只有一個」）。掉寶機率與稀有寶物的機率隨任務難度、以及**玩家星星 ÷ 全站目前總星數**的比例提高（站長：「他目前持有的星星數跟本站最大可以持有的星星數這個比值，纔是影響他掉寶的機率的判則」；全站加任務、玩家沒跟上，機率就下降；不再用固定 2000 顆）。任務卡上的星星分兩種：金色實心「+N 顆星」＝完成可以拿到的新星星；灰色虛線「N 顆星已領過」＝不會再加星（站長要求畫面與文字都要分開）。
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

- Realtime Database（新加坡）：`stats/`、`presence/`、`comments/`、`profiles/`、`reports/`、`rateLimit/`、`admins/`、`missionDefs/`、`completions/`、`bonus/`（隱藏任務加倍的補發）、`scores/`（含各科 `s/`、`sa/`）、`userStats/`、`achievements/`、`daily/`（每日任務：日序 `d`、`picks`、掉寶次數 `n`、時間 `at`、`done`）、`bag/`（寶物）。
- 免費方案（Spark）限制：同時連線 100、儲存 1 GB、每月下載 10 GB。
- 新增管理員：請對方先在網站登入一次 → Firebase 主控台 Authentication「使用者」取得 UID → Realtime Database「資料」在 `admins` 底下新增 `UID: true`（布林值，不能有引號）。
- 雲端工作環境連不到 Firebase 與 gstatic；本機可以連，但測試一律用 `tools/mock-backend.js`，不要寫入正式資料庫。正式驗證請站長在網站上操作。
