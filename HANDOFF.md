# 交接說明（雲端工作串 → 本機工作串「Astro Ni 科學實驗室」）

交接日期：2026-11-11。接手的工作串請先讀完 **CLAUDE.md**（規則與慣例），再讀這份（目前狀態、工具、待辦）。

## 一、網站目前的狀態

- 網址：https://lab.astroni.org/ ，推送到 `main` 後由 GitHub Pages 自動部署，約 1–2 分鐘生效。
- **24 個實驗全部上線，每一個都有任務**：共 350 個任務，其中 72 個是隱藏任務，總計 1857 顆星。首頁已經沒有「規劃中」的卡片。

| 分支 | 實驗（代號） |
|---|---|
| 力學 | 拋體運動（projectile）、牛頓第二定律（newton-second）、斜面與摩擦力（incline-friction）、連體運動與阿特午機（atwood）、電梯中的視重（elevator）、一維碰撞（collision）、等速圓周運動（circular-motion）、彈簧振子與單擺（oscillation）、行星軌道與克卜勒定律（kepler） |
| 熱學 | 理想氣體分子模擬（ideal-gas）、比熱與熱平衡（specific-heat） |
| 波動與聲音 | 繩波的反射與駐波（standing-waves）、都卜勒效應（doppler） |
| 光學 | 折射與全反射（refraction）、透鏡與面鏡成像（lens-mirror）、雙狹縫干涉與單狹縫繞射（slit-interference） |
| 電磁學 | 電場與等位線（electric-field）、平行板電容器（capacitor）、直流電路（dc-circuit）、帶電粒子在磁場中運動（magnetic-particle）、法拉第定律與冷次定律（faraday） |
| 近代物理 | 光電效應（photoelectric）、氫原子能階與光譜（hydrogen-spectrum）、放射性衰變與半衰期（radioactive-decay） |

- 全站功能：
  - 搜尋、統計：瀏覽、操作、時間，以及「目前在線」人數。
  - 齒輪設定：繁體／简体／English、字體大小、深淺色、音效與音量。
  - Google 登入與留言；首次進站的登入提示，可按「先逛逛」略過。
  - 任務模式「倪的星星」、排行榜（含總星數進度條）、成就系統（數量級門檻 k、M、G、T）。

## 二、Firebase（專案 astro-ni-physics-lab）

- 資料庫規則：`firebase/database.rules.json` 的最新版本（含 `presence/` 在線人數）**已由站長貼到主控台並發布**。
- 以後只要改了規則檔，就要請站長再貼一次，**一步一步帶**：
  1. 打開 GitHub 上的規則檔，按「複製」：https://github.com/astro1222ni/physics-lab/blob/main/firebase/database.rules.json
  2. 打開 Firebase 規則頁，全選後貼上取代：https://console.firebase.google.com/project/astro-ni-physics-lab/database/astro-ni-physics-lab-default-rtdb/rules
  3. 按「發布」。
- **任務清單會自動同步**：站長用管理員帳號登入後，打開排行榜頁或任何實驗頁，`js/missions.js` 就會自動把新任務寫進 `missionDefs`。新增任務後，只要請站長登入並打開排行榜頁一次就好。2026-11-11 已同步全部 350 個任務。
- 本機可以連到 Firebase，雲端那邊連不到。但**測試時不要寫入正式資料庫**，請改用 `tools/mock-backend.js`。

## 三、本機開發環境

需要安裝 Git、Node.js（LTS）、Python 3。在專案資料夾執行：

```
npm install                       # 安裝 playwright 與 opencc-js（只是開發工具，網站本身不需要）
npx playwright install chromium   # 第一次使用 Playwright 時安裝瀏覽器
npm test                          # 所有物理核心單元測試（目前 24 個測試檔）
npm run check                     # 用 Playwright 打開全部頁面，檢查 4 種組合（自帶網頁伺服器）
npm run check -- kepler atwood    # 只檢查指定頁面
npm run shots -- kepler           # 同上，另外存截圖到 .shots/（一定要親自看）
npm run serve                     # 開本機網頁伺服器 http://localhost:8000/
npm run hans                      # 重新產生簡體對照表 js/hans-map.js（改了 tools/build-hans.cjs 的 PHRASES 之後）
python tools/stamp.py             # 版本號防快取（Windows 可用 py tools/stamp.py）
node tools/mission-proofs/<代號>.js # 證明該實驗的每個任務都做得到、預設狀態不會觸發（22 個實驗有保存；拋體、碰撞、克卜勒當初是直接在對話中驗證，沒有腳本）
```

- `.gitattributes` 規定一律用 LF 換行，Windows 上也不會整個檔案的換行被改掉。
- 修改任何實驗的物理核心或任務條件後，要重跑該實驗的 `tools/mission-proofs/` 腳本與 `npm test`。

## 四、新增實驗的流程（已經順過 20 幾次）

1. 製作：照 `docs/briefs/new-module.md`。任務照 `docs/briefs/missions.md`；替既有實驗補任務照 `docs/briefs/add-missions.md`。可以交給背景助手平行製作，但每個助手只能改自己的檔案。
2. 檢查助手的成果：
   - `npm test`
   - `npm run shots -- <代號>`，並親自看截圖
   - 抽查物理數字，例如用公式驗算畫面上的讀數
   - 確認沒有上標／下標數字字元
   - 隱藏任務的提示句要夠隱晦
3. 整合（只有主工作串做，不交給助手）：
   - `js/missions/index.js` 有三個地方要加：`LAB_MISSION_MODULES`、`LAB_LIVE_MODULES`、`LAB_MODULE_BRANCH`。
   - 首頁卡片：已有「規劃中」卡片時，用 `python tools/make_live.py <代號> <卡片標題> --desc … --desc-en … --keywords …`。這支工具已修正為逐張比對，不會再跨卡片誤改。沒有卡片時，照現有卡片的格式手動新增。
   - `python tools/stamp.py`。
4. 提交：**只 `git add` 這次要發布的檔案**，不要用 `git add -u`／`-A`，以免背景助手做到一半的檔案被推上線。然後 push 到 `main`。
5. 請站長登入並打開排行榜頁一次（自動同步任務），再告訴站長網址與重點。

## 五、踩過的坑（已修好，但要記得）

- `make_live.py` 舊版會跨卡片比對，曾把折射、比熱、駐波、都卜勒、法拉第、光電效應的卡片弄錯，已全部修正。
- 繪圖文字也不可用 ⁸、₂ 這類上標／下標數字字元。HTML 用 `<sup>`／`<sub>`；畫布要自己畫小字上標，可參考 `js/kepler.js` 的 `fillSup`。
- 簡體對照：OpenCC 會把「抬」轉成「擡」、把「鎝」轉成缺字的「𨱏」，已在 `tools/build-hans.cjs` 用 `OVERRIDES` 修正。物理名詞的兩岸用語放在 `PHRASES`。
- 動態載入的檔案要帶版本號，否則會讀到舊快取：任務檔沿用 `missions.js`／`achievements.js` 的 `?v=`，簡體表沿用 `settings.js` 的 `?v=`。
- 「目前在線」是匿名心跳：每個分頁一個隨機代號，60 秒送一次，150 秒內有心跳就算在線。規則允許任何人寫入或刪除 `presence/`，被灌假人數只影響顯示。

## 六、還沒決定或待辦的事

0. **【站長指定，優先】現有實驗的 2D 優化與 3D 製作**
   - **背景**：
     - 最早的 5 個實驗（拋體、碰撞、電場、帶電粒子、雙狹縫）做過一輪視覺升級：commit 17a39ee、ae125ae、dbdb894、f70398f。
     - 其餘 19 個是照 `.claude/skills/physics-visual-design/SKILL.md` 新做的，由不同助手完成，風格與細緻度不完全一致。
     - 目前只有「帶電粒子在磁場中運動」有 3D 模式（2D／3D 切換、three.js 延遲載入、手指旋轉縮放），可以當範本。
   - **2D 優化**（24 個實驗全部）：
     1. 依視覺規範逐一檢視，對照修改前後的截圖（`npm run shots`）。
     2. 統一立體光影、陰影、標籤底框、箭頭樣式、色彩代號與深色模式。
     3. 修正擁擠、重疊、手機上太小的地方，同時把滑桿數字的觸控高度加大到 44 px。
     4. **美化不可改變任何物理量**，每個實驗做完都要跑 `npm test` 與 `npm run check`。
     5. 建議分批做，每批 4–6 個實驗，做完讓站長看對照截圖再繼續。
   - **3D 製作**：適合做 3D 的實驗，照帶電粒子的做法加「2D／3D」切換，保留 2D、延遲載入 three.js（`vendor/three`），手機不支援時自動留在 2D。建議優先順序：
     1. 電場與等位線 → 3D 等位面與電場線（等位線在 3D 其實是包住電荷的曲面）
     2. 行星軌道 → 可以轉視角看軌道平面、傾角
     3. 法拉第定律 → 立體的磁鐵、線圈與磁力線
     4. 理想氣體 → 目前是畫布模擬的立體透視，可改成真正可旋轉的 3D
     5. 未來的新實驗：水波干涉（起伏的水面）、電流的磁效應（螺線管、載流線圈的立體磁場）、光的偏振、電磁波
   - **開始前先問站長**：要先做 2D 優化還是 3D？3D 先做哪一個？做一個示範給站長看過再全面推廣。

1. **下一批實驗**（站長還沒選）。建議依序做：
   1. 等加速度直線運動（x–t、v–t、a–t 圖、自由落體）
   2. 功與能、力學能守恆（雲霄飛車、彈簧）
   3. 力的合成與分解、靜力平衡與力矩
   4. 電流的磁效應（直導線、線圈、螺線管、平行導線）
   5. 水波干涉
   6. 聲波與共鳴管
   7. 相對運動
   8. 交流電、發電機與變壓器
   9. 光的偏振
   10. 物質波與電子繞射
2. **光電效應的鉑功函數**：目前用 5.6 eV（手冊上多晶鉑的值），有些教科書寫 6.35 eV。已問站長，還沒回覆。
3. 建議先讓學生試用、收集回饋，例如哪裡看不懂、哪個任務太難、手機哪裡不好操作。
4. 小問題：滑桿旁可點擊的數字（`js/numinput.js` 的 `.lab-num`）觸控高度約 25 px，低於 44 px 的規範，可以考慮加大。
5. Firebase 免費方案（Spark）同時連線上限是 100。留言與任務使用即時連線，全班同時上線還好；如果人數會超過，要考慮升級，或減少即時監聽。

## 七、已知的簡化與可以再調整的地方（製作助手回報，頁面「模擬方法」大多已寫明）

- **理想氣體**：分子直徑放大以便看到碰撞，壓力比 NkT/V 高約 1–3%（畫面有標示修正）。絕熱時用粗糙器壁，活塞速度有限，絕熱壓縮後溫度比 PV^γ 高約 1–2%。手機實機流暢度待站長確認。
- **氫原子**：吸收的容許誤差 ±0.005 eV（真實譜線更窄）。放電管的激發模型是簡化的，但分支比精確。
- **比熱**：冰的比熱取 2100、水蒸氣取 2010（近似值）。
- **電梯**：讀數立即反映加速度，沒有模擬指針晃動。畫布解析度上限設為 2 倍，讓手機流暢。
- **斜面、連體運動**：靠著擋板靜止時，靜摩擦力怎麼分配不唯一，採用的假設已寫在頁面上。
- **直流電路**：燈泡視為固定電阻。
- **光電效應**：功率相同時，飽和電流與 λ 成正比（物理正確，但比課本多一層）。
- **任務難度可再斟酌**：
  - 等速圓周運動 -4「筆直向上」偏簡單。
  - 單擺隱藏任務 h2、h3 的提示句較好猜。
  - 雙狹縫 h3 很嚴格（需要 d/a ≥ 60）。
  - 連體運動 -12、比熱 -10 很嚴格。
  - 站長若覺得哪個太難或太簡單，就調整容許值並重跑證明腳本。
- **待站長在實機上確認**：
  - 各實驗的音效好不好聽，雲端無法試聽，特別是電場的「滋」聲。
  - 帶電粒子 3D 在平板上旋轉順不順。

## 八、與站長合作（摘要，詳見 CLAUDE.md）

- 一律用繁體中文（臺灣用語）。
- 需要站長在網站上操作時，一次只給一步，附完整網址，等站長回覆或拍照確認再給下一步。
- 學生多為未成年人，留言與隱私都要保守設計。
- 物理正確第一，美感同樣重要，學生操作不消耗任何 AI 額度。

## 九、站長提過的需求（全部已完成，改版時不要倒退）

依時間順序：

1. 純前端、免費、不消耗 AI 額度的物理動畫網站。
2. 修正公式亂碼（改用 KaTeX、不用組合字元）。
3. 首頁依物理分支分類，用方格大按鈕排列，方便手指點。
4. 瀏覽人次、操作次數、累計操作時間（各實驗與全站），後來加上「目前在線人數」。
5. 首頁搜尋（含同義詞與英文）。
6. 齒輪設定：繁體、簡體、English、字體大小、深淺色。
7. Google 登入與留言：只顯示自訂暱稱，可檢舉，管理員可刪除。
8. 音效：
   - 要夠大聲，站長抱怨過兩次太小聲，所以加了壓縮器、限幅器與音量設定。
   - 適合的實驗都要有。
   - 預設關閉。
9. 3D：示範做在帶電粒子的螺旋運動。推廣到其他實驗的工作已交接，見第六節第 0 項。
10. 英文版、雙狹縫的白光選項、一維碰撞的彈簧（無質量、k 可調）。
11. 2D 畫面也要細緻、有立體感、有設計感，已寫進視覺技能與備忘錄。
12. 會累積紀錄的實驗要有「全部清除」。2026-11-11 檢查過：沒有「全部清除」的 8 個實驗都不會累積紀錄。
13. 滑桿數字可以直接點擊輸入，精度依實驗需要放寬。
14. 任務模式：
    - 倪的星星，難度 1–10 級，另有隱藏任務。
    - 排行榜：前 100 名加自己的名次，不公開時遮蔽暱稱。
    - 規則要看得到。
    - 成就系統：公開與隱藏，用數量級做長遠規劃。
    - 總星數進度條。
15. 牛頓運動定律的系列實驗：力學車、斜面、連體運動、電梯。
16. 首次進站的登入提示，可以「先逛逛」略過；雙狹縫任務的容許值放寬。
17. 交接到本機工作串（本文件）。
18. 2026-11-11：入口頁面每個實驗都要有縮圖；開始做 2D 優化與 3D（「3D 能做的就儘量做，同步做」）。
19. 2026-11-11：首頁分類改成「大分類（物理分支）→ 小分類（選修物理講義各章）」，小分類**只寫章名、不寫第幾章**。
20. 2026-11-11：選修物理講義裡的實驗，模擬是**必做**的實驗室（清單見第十節）。
21. 2026-11-11：「把它變成國際一流、最權威最知名的物理實驗室網站……每一個面向都要做到世界第一。自動優化要自動進行，不要我開口。」→ `docs/WORLD-CLASS.md`、每日自動優化（第十節）。
22. 2026-11-11：不要用英文跟站長交談（含進度回報、待辦清單）。

另外：`astro1222ni/personal-core-knowledge-info` 是 Google OAuth 審核用的說明網站。最早的實驗室副本已從該倉庫移除（commit c8caedd），以後不要把實驗室放回去。

## 十、本機工作串新增的工具與流程（2026-11-11）

- **首頁結構**：`<section class="branch">` 裡先有章名按鈕列 `<nav class="chapter-nav">`，再來是 `<div class="chapters">`，每章一個 `<section class="chapter" id="ch-…">`（章名 `<h3 class="chapter-head">`），卡片放在該章的 `<div class="modules">`。卡片只有縮圖、標題 `<h4 data-en>`、說明 `<p data-en>`。還沒有實驗的章，按鈕是 `<span class="soon">`；加了第一個實驗就改成 `<a href="#ch-…">`，數量徽章由 `js/home.js` 自動算。
- **縮圖**：`npm run thumbs -- <代號>`（`tools/make-thumbs.cjs`）。每個實驗 6 張（三語 × 深淺色）720×405 WebP，存 `img/thumbs/`，版本表自動寫進 `js/thumbs.js`；新實驗要在工具的 `PREP` 加一列（按哪個按鈕、等多久、裁哪裡）。
- **分享卡與搜尋引擎**：`npm run seo`（`tools/seo.cjs`）從首頁卡片與縮圖產生 1200×630 分享卡 `img/og/`、每頁 `<!-- SEO-BEGIN -->` 區塊（說明、Open Graph、hreflang、schema.org 結構化資料）、`sitemap.xml`、`robots.txt`。`js/settings.js` 支援 `?lang=en`／`?lang=zh-Hans` 網址（只當次套用，不蓋掉使用者存的語言；第一次來的訪客會記住）。
- **共用繪圖工具** `js/drawkit.js`（`window.LabDraw`）：立體球、木塊、陰影、標籤底框、箭頭、格線、背景，深淺色自動切換。2D 優化照 `docs/briefs/visual-polish.md`，3D 照 `docs/briefs/add-3d.md`，課本實驗照 `docs/briefs/textbook-experiment.md`。
- **一鍵總檢查**：`npm run verify`（`tools/verify.cjs`）＝單元測試＋全部任務證明＋靜態稽核＋介面稽核（觸控目標、對比、名稱、頁面重量）＋頁面檢查；`-- --quick` 只跑前三項。結果存 `.shots/verify-report.json`。發布前要全過。
- **自動優化**：藍圖與待改清單在 `docs/WORLD-CLASS.md`，紀錄在 `docs/auto-optimize-log.md`。排程「每天 01:40｜Astro Ni 科學實驗室自動優化」照清單做 1–3 件、總檢查全過才推。**主工作串開始改網站時建立 `.editing`（已列入 .gitignore），push 完刪掉**；排程看到 8 小時內的 `.editing` 就跳過。
- **選修物理講義的必做實驗**（講義在 `D:\物理講義電子檔\選修物理Ⅰ–Ⅴ`，文字要用 CID→Big5 解碼才讀得到，方法在 `docs/briefs/textbook-experiment.md`）：自由落體與斜面運動（free-fall）、牛頓第二運動定律（newton-second，已有）、水波槽（ripple-tank）、氣柱的共鳴（resonance-tube）、折射率的測定（refractive-index）、薄透鏡成像（thin-lens）、干涉與繞射（slit-interference，已有）、等位線與電場（equipotential）、電流天平（current-balance）、認識電磁波（microwave）、歐姆定律與電路（ohms-law）、電子的荷質比（e-over-m）。選修物理Ⅱ沒有正式實驗。11/11 十二個全部上線（新做的 10 個放在首頁對應的章；荷質比、水波槽、等位線、電流天平、微波另有 3D）。縮圖取景設定在 `tools/make-thumbs.cjs` 的 PREP（可用 `eval` 先執行頁面測試介面，例如折射率用 `window.__ri.place` 插針）。

- **物理實驗室核可室**：要站長決定的事一律開卡 https://claude.ai/artifact/XEAkzxm5585i8fzHEiHMfQ （資料 `items/<id>`：ep、topic、title、body、links、media、order、status、created、result；站長的回覆在 `answers/<id>`：choice ok／change、note）。每次回到工作串先查 answers、照做、把卡改 closed 並寫 result。11/11 已決定：自動優化全自動、鉑功函數維持 5.6 eV 並註明 6.35 eV、「關於本站」頁與 CC BY-NC 4.0 授權。
- **關於本站與授權**：`about.html`（作者、物理怎麼把關、引用格式、授權、隱私）、`LICENSE.md`。首頁、排行榜、隱私說明頁尾都有連結；`tools/seo.cjs` 產生它的 `AboutPage` 結構化資料。內容寫到站長本人，改動前要開卡問站長。
- **3D 檢視共通做法**：three.js 只在第一次切到 3D 時載入；切回 2D 時 `dispose()` 先把 `active` 設成 false 再 `forceContextLoss()`，`webglcontextlost` 處理程式要先檢查 `active`（否則會誤跳「3D 中斷」）；透明材質先轉色彩空間再乘 alpha（否則玻璃變白霧）。
- **英文模式檢查的例外**：刻意保留的中文（人名、頻道名、中文引用範例）在元素上標 `lang="zh-Hant"`，`check-pages` 會略過。

## 十一、上課工具與第二批改版（2026-11-12）

- **首頁分兩大科目**：`<nav class="domain-nav">` 兩個大按鈕（物理 `#physics`、地球科學 `#earth`，數量由 `js/home.js` 算），右邊是本站 QR code（`img/qr-site.svg`，`.site-qr` 點一下放大投影）。`<section class="domain" id="physics">` 包住原本六個物理分支；`<section class="domain" id="earth">` 有四個分支：天文（astro）、固體地球（geo）、大氣（atmo）、海洋（ocean），色彩 `--b-astro`、`--b-geo`、`--b-atmo`、`--b-ocean`。地科分支還沒有實驗時顯示 `<p class="branch-soon">`；把卡片放進去時要拿掉它（整合腳本會處理）。搜尋結果的地科卡片前面加「地球科學・」。
- **`js/classroom.js`**（由 `settings.js` 自動載入，每頁都有，不必加標籤）：
  - 實驗區上方工具列：「投影」（全螢幕＋字放大 1.25 倍、收起留言與頁尾）、「分享」（網址 `#s=…` 記錄滑桿、選單、勾選框、按下的模式按鈕；QR code 可放大；LINE、Google Classroom、嵌入網頁的 iframe 程式碼）。
  - 畫布上拖曳出來的狀態由模組自己登記：`LabShare.register({ get, set })`。還原期間 `LabShare.restoring = true`，`missions.js` 不會判定任務完成。`settings.js` 在 `<head>` 就把 `#s=` 存進 `window.LAB_SHARE_HASH`（有些頁面一載入就 `history.replaceState` 洗掉網址的 `#`）。
  - `?embed=1`：`settings.js` 加上 `html.lab-embed`，只留標題與實驗本身，不跳登入提示，工具列多一個「開啟完整版」。
  - 「試試看」：頁面 `.lab` 前面放 `<p class="try-hint" data-en="Try it: …">試試看：…</p>`，每頁只出現一次（localStorage `lab-try:<代號>`），學生動手後自動收起。
  - 數據表（`table.data`／`.runs`／`.rec`／`.picks`／`.hist`／`.log`／`.pts`，或加 `data-export`）下方自動加「下載 CSV」（UTF-8 BOM）與「複製表格」。
  - 「相關實驗」：捲到說明區附近才載入 `js/catalog.js`（`tools/build-catalog.cjs` 從首頁產生，`npm run seo` 會一起跑），在說明區後面放 3 張卡。新實驗整合進首頁後要重跑 `npm run seo`。
  - 列印：深色模式自動換淺色再印、收起按鈕與留言，頁首多一行班級／座號／姓名／日期空格。
  - 頁尾「這個實驗最後更新：YYYY/MM/DD」：日期在 `js/catalog.js` 的 `u`（`tools/build-catalog.cjs` 從 git 算，還沒 commit 的算今天），所以**發布前最後一步也要跑 `npm run seo`**。
- **`js/keys.js`**（要用的頁面自己載入，放在頁面程式前）：`LabKeys.attach(canvas, { label, items: [{ name, move(dx, dy, big), describe }], onChange })`，Enter 換物件、方向鍵移動、Shift 大步、Esc 離開；用 `aria-live` 念出狀態。逐頁套用的規格在 `docs/briefs/classroom-pass.md`（試試看、參考資料、鍵盤、讀數播報、分享狀態、2D 精修）。
- **效能與連線**：沒登入的訪客不再下載全站任務檔（`achievements.js` 登入後才載）；留言區捲到附近才開始即時監聽，分頁在背景 3 分鐘就 `goOffline`（免費方案同時連線上限 100）。
- **頁首**：右上角登入鈕＋齒輪實際佔的寬度寫進 `--head-reserve`（`comments.js` 量），頁首第一行右側留白；900 px 以下第一行至少 40 px 高，標題排在按鈕下方。
- **推送一律非互動**：`git -c credential.interactive=never -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=60 push origin main`（11/12 曾因 Git Credential Manager 等登入視窗卡 6 小時）。

## 十二、11/12 上午：新實驗、共用檔修正、全國營運的風險

- **新實驗（6 個）**：測量與不確定度（`ch-measurement`，力學第一章）、角動量守恆（`ch-momentum`）、力矩與靜力平衡（`ch-statics`）、薄膜干涉（物理光學）、月相與日月食（天文 `ch-sky`，含 3D）、地震波與震央定位（固體地球 `ch-quake`）。電容器、都卜勒加了 3D。
- **成就**：加了 `branch-astro`（伽利略的望遠鏡）、`branch-geo`（魏格納的拼圖）；大氣、海洋有實驗後再加 `branch-atmo`、`branch-ocean`（`branchDone` 已會算這兩個）。
- **分享狀態的登記**：頁面程式執行時 classroom.js 還沒載入，所以一律寫 `(window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({ get, set })`；classroom.js 載入時補登記（也會送出 `lab:shareready` 事件）。一頁好幾個 `.lab` 都會記；`#soundBtn` 不記。舊寫法「等 load 再 `LabShare.register`」也能用。
- **登入提示**：實驗頁要先操作 3 次（只算真的手動操作，按鈕裡的圖示不重複算）或在前景停留 40 秒才跳（`comments.js` 的 `whenEngaged`）；首頁照舊。
- **`npm run check`**：頁面可用空格或逗號分開，找不到的頁面直接報錯（之前逗號寫法會漏檢還顯示全部通過）；英文模式也檢查 aria-label、title、placeholder、alt。
- **簡體**：`tools/build-hans.cjs` 加了「游標尺／游標卡尺 → 游标卡尺」「震央 → 震中」（「游標」單獨出現仍轉「光标」）。
- **縮圖**：`make-thumbs.cjs` 先把 `lab-try:<代號>` 設好，不出現「試試看」，版面不會在截圖時移動。
- **搜尋引擎**：Google、Bing 都還沒收錄（11/12 查 site: 為 0）。`/physics-lab/robots.txt` 裡的 Sitemap 不會被讀（只讀網域最上層的 robots.txt），要在 Search Console 提交 `sitemap.xml`；正在一步一步帶站長做。
- **全國營運的風險**（站長 11/12 問「全臺高中都用會遇到什麼」，已開卡）：
  1. Firebase 免費方案同時連線 100（三個班就滿）→ 升級 Blaze＋預算警示（卡 lab-blaze-1112）。
  2. `stats.js` 在線人數：每分頁每 30 秒下載全站 presence，流量 ∝ N²（同時 1,000 人約 7 GB／小時）→ 改成每分鐘一個計數桶（流量 ∝ N），需要新的資料庫規則。
  3. 寫入：每分頁每分鐘約 5 次（flush 15 秒＋心跳 60 秒）→ 合併成 1–2 次。
  4. 排行榜 `countAbove` 下載所有較高分 → 改用分數分布。
  5. GitHub Pages 每月約 100 GB 流量 → 自己的網域（卡 lab-domain-1112），之後可搬 Cloudflare Pages，網址不變。換網域時 localStorage 會歸零、要重新登入。
  6. 灌分、留言審核、App Check、學校 Google 帳號（未滿 18 歲）可能不能登入第三方網站、學校網路過濾、個資保存與刪除、回報問題按鈕、只有站長一人有帳號。
- **四科並行**（站長：「我還要放化學跟生物，總共四個科目要同時並行」）：建議同一網站、首頁四大區、共用引擎；每科找審稿老師；化學、生物各先做 3 個試點（卡 lab-four-subjects-1112、lab-brand-name-1112）。

## 十三、11/12 下午：每日任務、各科排名、品牌與網域

- **每日任務與寶物**（站長原話：「登入之後的每日任務……完成它可以得到隨機的銅幣、銀幣、金幣、鑽石以及稀有鑰匙」「這些物品有些什麼用途？我們以後再規劃」）：`daily.html`、`js/daily.js`、`js/daily-core.js`（單元測試 `tests/daily-core.test.js`）。首頁、排行榜頁、每個實驗的任務列都有入口；實驗頁網址帶 `?daily=<任務代號>` 進入每日任務模式（任務模式自動打開，做過的任務也會重新判定）。設計細節見 CLAUDE.md「任務、排行榜與成就」。
- **各科排名與成就分類**（站長：「每個科目要有各自的排名以及全科總排名。每個科目都有各自的成就以及整體的成就」）：排行榜與成就都有「全科／物理／化學／生物／地球科學」分頁；化學、生物還沒有實驗，顯示「製作中」。各科名次的成就門檻跟著該科總星數走（10%／40%／70%），榜上至少 50／100 人才開放。
- **資料庫規則**：`firebase/database.rules.json` 新增 `daily/`、`bag/`，`scores` 加 `s/`、`sa/` 與索引（站長已發布，11/12 10:22 推送 14a4654）。
- **每日任務改版（11/12 中午，13:14 推送 79553a3；新規則站長 13:1x 已發布）**：站長看過後改成每天十個、每個一天只能完成一次、十個做完就結束（沒有重做）；掉寶一律看機率（新任務照樣得星）。規則跟著改：`n` ≤ 10、`picks` 改成十個的陣列（鍵 0–9，仍接受舊版 easy／mid／hard，讓舊程式在換版空檔也能寫）、寶物一次最多一種有變動。今天已經用舊版三個任務的人，載入時會保留原本三個（含完成紀錄）再補滿十個。任務卡的星星分「+N 顆星」（可得）與「N 顆星已領過」兩種徽章，上方有圖例。「我的星星與成就」（排行榜頁）在我的名次下方加「我的寶物」：每格左邊累計獲得、右邊現在剩下（站長指定）。
- **掉寶的星星加成改成比例（11/12 13:2x）**：站長：「他目前持有的星星數跟本站最大可以持有的星星數這個比值，纔是影響他掉寶的機率的判則」。`starBoost(stars, total)` = 玩家星星 ÷ 全站目前總星數（`siteStars(LM.all())`，所有實驗所有任務的等級加總，含隱藏任務；11/12 是 43 個實驗、631 個任務、3,327 顆星），不再固定 2000 顆。`luck`、`table`、`repeatChance` 都多一個 `total` 參數，`roll(level, stars, total, sure, rand)`。全站加任務（例如化學、生物上線）時，玩家星星沒跟上，機率就下降。每次只掉一種；錢幣數量也跟同一個運氣連動（`qtyTable`、`qtyMean`；運氣 0 時銅幣 1–5 枚權重 5:4:3:2:1、平均 2.3 枚，運氣 1 時倒過來、平均 3.7 枚），鑽石與鑰匙最多 1 個（站長 13:3x）。每日任務頁的機率表下面多一張「掉到時的平均數量」。
- **換行符號（11/12）**：`tools/stamp.py` 以前用 `write_text`，在 Windows 會把整個檔案寫成 CRLF；79553a3 因此帶進 CRLF，f6996c4 已改回 LF，stamp.py 改用 `write_bytes`。提交前若 `git diff --stat` 出現整檔幾百行的改動，先查換行。
- **生物上線（11/12 14:5x，49914cc）**：孟德爾遺傳（mendelian-inheritance，15 任務 80 顆星，分支 genetics）。首頁生物區在地科前面，五個分支 cell／genetics／physiology／ecology／evolution 與章名是暫定的（站長 11/12：「先照你的暫定」）。簡體對照「機率→概率」全站適用（站長：「可以這樣做」）。`tools/build-catalog.cjs` 改成依首頁 `<section class="domain" id>` 判斷科目（catalog 的 d：physics／chemistry／biology／earth），`js/search.js`、`js/classroom.js` 也認得所有科目。遺傳、演化淺色分支色加深（#3f6212、#854d0e）。分享卡中文標題斷行改成 `ogTitle`（先「：」後、「（」前，再在「與、和、及、、」最平均處分，每行 ≤ 7 字）。**新任務要站長用管理員帳號登入、打開排行榜頁才會登記到 missionDefs**，沒登記前學生完成也拿不到星星（11/12 15:0x 已請他做）。
- **化學上線（11/12 15:5x，95581c3）**：酸鹼滴定（acid-base-titration，15 任務 79 顆星，分支 acidbase、章 ch-acidbase「酸鹼反應」）。化學五個分支 matter 物質與結構、reaction 化學反應與能量、equilibrium 反應速率與平衡、acidbase 酸鹼與氧化還原、organic 有機與生活化學（暫定）；成就 `branch-acidbase`「阿瑞尼斯的離子」。簡體化學用語在 `tools/build-hans.cjs`（當量點→化学计量点、半當量點→半中和点、活栓→活塞、瑞香草酚→百里酚、莫耳→摩尔…）。首頁科目卡片：手機一欄、561 px 起兩欄、900 px 起三欄（五科＋QR code 六格排滿）。助手回報待站長確認：指示劑變色範圍、隱藏提示夠不夠隱晦、簡體用語、化學分支名稱、音效試聽。
- **數學科（11/12 15:2x 站長：「試着加入數學這個科目」）**：科目代號 `math`（首頁區塊 id `math`），五個分支 algebra 代數與函數、geometry 三角與幾何、vectors 向量與空間、probability 機率與統計、calculus 微積分（章名也是暫定，各三章）。科目色 `--d-math`（淺 #0e7490／深 #67e8f9），分支色在 lab.css 最後一段。首頁標題改成「高中物理・化學・生物・地球科學・數學｜互動模擬實驗室」，`tools/seo.cjs` 的首頁標題與分享卡底字同步。`firebase/database.rules.json` 的各科星星多認 `math`（indexOn、加總、兩處 regex）；**數學實驗上線前站長必須先把新規則貼到主控台**，否則學生完成數學任務時 `s/math` 寫不進去、整筆完成紀錄失敗。（11/12 16:1x 站長已貼，用 `scores.json?orderBy="s/math"` 唯讀查詢確認索引已生效。）成就：`math-stars`／`math-explore`／`math-full` 系列（稱號「數的啟蒙」…「萬物皆數」）；分支制霸成就等該分支有實驗時再加（幾何預定「阿波羅尼奧斯的圓錐」）。第一個實驗：圓錐曲線 `conic-sections`（geometry，有 3D 丹德林球）。
- **實測腳本**：每日任務、掉寶、規則拒絕、換日、各科排行榜、成就分頁的 Playwright 實測（只用假資料庫、外連全擋）在工作串暫存區；要再測可以照 CLAUDE.md 的 mock-backend 說明重寫，`mockoffset` 可以假造伺服器時間。
- **品牌與網域**：品牌改成「Astro Ni 科學實驗室／Astro Ni Science Lab」，首頁標題「高中物理・化學・生物・地球科學｜互動模擬實驗室」（站長在核可室選甲）。網址改成 https://lab.astroni.org/（`tools/seo.cjs` 的 `SITE`、robots.txt、引用格式、QR code 都換了；舊網址 GitHub 會 301 轉過來）。換網域後 localStorage 歸零，使用者要重新登入；Firebase Authentication 的「授權網域」已加入 lab.astroni.org（11/12 核對過）。
- **月相觀測地點**：月相實驗加了 20 個地點的選單（手動經緯度、臺灣〔預設，數值不變〕、18 個世界城市），月出月落和美國海軍天文台的時刻比對誤差 ≤ 0.51 分鐘；任務 4、6、12 只在選臺灣時判定（說明已註明）。
- **CODATA 2022**：庫侖常數改用 8.9875517862e9 N·m²/C²（`field-core.js`），原子質量單位 1.66053906892e-27 kg（`ideal-gas-core.js`、`magnetic-particle-core.js`）。

## 十四、11/12 16:3x 重開 Claude 前的斷點（重開後從這裡接）

- **潮汐（tides）還沒上線**：分支已合併到本機 main（acb50eb），整合改動**還沒 commit**（工作目錄裡：首頁 #ocean 卡片 `ch-ocean-motion`、`js/missions/index.js`、`js/achievements.js` 的 `branch-ocean`「牛頓的潮汐」、`tools/check-pages.cjs` 加 jpg／webp 類型、縮圖 `js/thumbs.js`、`img/og/tides.jpg`、catalog、sitemap、versions.json、所有 html 版本號）。總檢查跑到一半（單元測試、任務證明已過）因重開停掉。**重開後**：`npm run verify` → 看截圖 → `git add` 指定檔 → 檢查沒有 CRLF → commit → push → 正式站核對 tides.html → 請站長用管理員帳號開 https://lab.astroni.org/leaderboard.html 登記潮汐 14 個任務 → 唯讀確認 missionDefs → 清掉工作樹 agent-ac05a4f746b6729f8。
- **圓錐曲線（conic-sections，數學第一個實驗）**：分支 `worktree-agent-acaa6752860e2f86b`（57392da，7 個新檔），已審查通過；只剩左側剖面圖「directrix 2」和 K₂ 標籤重疊，助手已改成「先收集標籤、依優先順序避開」，WIP commit e721fd2（只改 js/conic-sections.js），**還沒在瀏覽器驗證**：重開後先跑暫存區的 cs-labels.cjs（若暫存區被清就重寫）、重拍 2D 截圖親眼看、npm test、證明、`npm run check -- conic-sections`，再合併。合併要做：`js/missions/index.js` 加進 LAB_MISSION_MODULES／LAB_LIVE_MODULES，LAB_MODULE_BRANCH 設 `geometry`（LAB_SUBJECT_OF 才會算成 math，否則星星記到物理）；首頁 #geometry 把「圓錐曲線」的 soon 改成連到 `#ch-conics`，加 `section.chapter#ch-conics` 與卡片（中英說明、data-keywords 見助手回報）並拿掉 branch-soon；成就加 `branch-geometry`「阿波羅尼奧斯的圓錐」；跑縮圖、build-hans、seo、stamp、verify、push；請站長開排行榜頁登記 15 個任務。
- **地震波補 3D＋震央標記**：分支 `worktree-agent-af30665efc7ca0e47`。站長 11/12 指出「高階任務要求指出震央位置，卻沒有介面可以點出震央」。要求：學生在地圖上放震央標記、「定位」判定學生的標記、深度用 h² = D² − r² 推算、電腦解在學生確認後才顯示（確認前叫出不算自己完成）、任務代號與等級不改。**WIP commit fdd2be4（頁面現在載入會出錯，不可合併）**：3D 三個模式在 1280 淺色繁中畫得出來；核心加了 chordCenter、depthAt、pairErr（25 項測試過）；js/earthquake.js 加了放標記、拖曳、「確認我的震央」、電腦解。還沒做：earthquake.html 補 #solveBtn、#clearMarks、data-mk、data-nudge、myPos、myH；endDrag／moveDrag 的標記分支與點一下放置、鍵盤、bridge.placeMark、3D 顯示標記；任務 4–9 判定與中英說明、證明腳本、端到端測試、390／深色／英文截圖、npm test／check。重開後用同一份說明派新助手接手這個分支。完成後審查、合併、上線。
- **自動試玩系統（A 層，站長 16:3x 選「先只做 A」）**：分支 `worktree-agent-a1ba38e1676578d14`，`tools/playtest.cjs`：任務說明引號裡的元件名稱要在頁面上找得到、固定種子亂按約 150 步（抓頁面錯誤、NaN／undefined、左右溢出、畫布空白、滑桿與顯示值不符）、預設狀態不可觸發任務、數值合理性；報告 `.shots/playtest-report.json`；verify 加「試玩」階段只跑改過的實驗。跑完全站後把確定的問題分派修正。**11/12 16:4x 站長更正：「A 層你做，然後 B 層給 Codex 執行。」** A 層由 Claude 的工作樹助手做（16:5x 重新派出）。B 層（AI 扮學生、只靠介面玩每個任務，先試 earthquake、acid-base-titration、mendelian-inheritance、moon-phases、projectile 五個）的規格在 `G:\Claude與Codex共用交談區6-11-12_164457_Claude_B層AI扮學生試玩交辦（取代164225）.txt`；Codex 的背景助理說要站長在 Codex 工作串親自交辦才開始。Codex 測正式站、擋外連加假後端、G:\physics-lab 只讀，紀錄放 `G:\physics-lab-playtest-b\`，回覆存在交談區（標題「收件：Claude」）。Claude 核對後分派修正。**B 層（AI 扮學生試玩）等 A 的結果修完再問站長。**
- **站長三個問題已回答（16:2x）**：學校 Google 帳號登不進去 → 學校 Workspace 對未滿 18 歲帳號預設封鎖第三方登入，請資訊組在管理控制台 API 控制項把用戶端 ID `608190591554-1vhhbgc73vlsrd0rqdsf3rtkjstchnr6.apps.googleusercontent.com` 設為受信任（可提議在登入失敗時加說明，站長還沒回）；4070 留給影片、維持內顯；試玩系統如上。
- **之後**：續派新實驗（同時最多約 3 個助手）、清掉化學工作樹的空殼資料夾、最後一次 push 後刪 `.editing`、更新看板 `G:\Claude\tools\helper\dash\lab\lab_status.json`。
- **重開後進度（11/12 17:xx）**：潮汐 16:5x 上線（e5242a7），14 個任務已登記（missionDefs 共 675）。地震波補 3D＋學生標震央已合併（f06faba）：學生在 2D／3D 地圖點「我的震央」、按「確認我的震央」判定標記位置、深度 h² = d² − Δ² 取平均、確認前看電腦解算 auto；任務 4、6 要標兩個交點（pairErr ≤ 10 km）、5、7、8、9 只標一點；證明腳本任務 7 三站門檻 270→255、另加四站一行。已知：測站很遠又含誤差時推算深度常是 0 km（d² 誤差大，物理正確）；分享連結不帶標記。新派：生物「擴散與滲透」`diffusion-osmosis`（cell 分支、建議章 ch-membrane）。

## 十五、11/12 晚上：版面平衡、五科子工作串、全面試玩

- **版面平衡 `js/lab-layout.js`**（站長：「中間有很大的空空洞的地方是沒有使用到的」）：寬螢幕（≥ 881 px）把控制面板尾端的卡片搬到畫布下方的 `div.panel.lab-spill`（報紙式分欄），試每一種切法取最低；焦點所在的卡片不動；窄螢幕全部還原。測試介面 `window.__labLayout`。f9c21ca 上線。
- **每日任務冷卻補記**：兩次完成不到 10 秒時，達成結果存在 localStorage `dl-pending-v1`，倒數完自動寫入；離開頁面也會在回每日頁時補記（Codex 第三部分回報的中度問題）。
- **五科子工作串**（站長：「各開5個子工作串，各自設計及擴充：物理、化學、生物、地球科學以及數學」「也包含要處理擴充它的 2D 以及 3D。還有各個實驗室的任務模式」）：lab-phy、lab-chem、lab-bio、lab-earth、lab-math。各自在 `G:\physics-lab-wt\<科目>` 工作樹 commit、不 push，交件單寫到 `G:\physics-lab-wt\交件\`，由主工作串審查、合併、上線。共用檔（首頁、任務清單、成就、簡體、規則）只有主工作串改。
- **全面試玩**：Claude 試玩工作串 lab-playtest（副本 `G:\physics-lab-playtest-claude\site`，報告在 `...\報告\`，02:40 停、02:50 前交總結）；Codex 測 `G:\physics-lab-playtest-b`，回覆在共用交談區。科學內容審查（06 號報告，高 1、中 6、低 26）已按科目轉給五科子工作串；酸鹼滴定效能問題（緊急 U1）轉化學串。
- **19:xx 推送**：Codex 第一部分修正（地震波揭曉文字與測站點擊門檻、numinput 先清編輯旗標再送事件、圓錐曲線快速切法提示）＋化學「分子的形狀」molecular-shapes（matter 分支、ch-bonds 章、成就 branch-matter「門得列夫的週期表」）＋生物「擴散與滲透」diffusion-osmosis（cell 分支、ch-membrane 章、成就 branch-cell「虎克的軟木塞」）。上線後要請站長用管理員帳號開排行榜頁登記任務。
- **隱藏任務星星加倍與補發**（站長選「加倍並補發」，ec23744）：`starsOf(m) = (m.hidden ? 2 : 1) × 等級`；`missionDefs` 上限改 20；新節點 `bonus/<uid>/<任務>` 補發差額（規則見 CLAUDE.md）；排行榜、成就、每日任務的全站總星數都改用 `starsOf`；假後端模擬全部規則，端到端測試（scratchpad bonus-e2e）全過。**上線順序很重要**：站長要先把新規則貼到 Firebase 主控台，再用管理員帳號開排行榜頁同步；規則沒貼前同步會整批被拒（舊規則上限 10），連新實驗的任務也登記不了。
- **第二批合併**：物理科學審查修正（lab-phy 0d63c70）、數學「三角函數」trig-functions（geometry 分支、ch-trig 章，放在圓錐曲線之前）、化學「反應速率與碰撞學說」reaction-rate（equilibrium 分支、ch-rate 章、成就 branch-equilibrium「勒沙特列的天平」）。縮圖設定：trig-functions 靠左裁（anchorX 0）、reaction-rate 往下裁（anchor 0.7）。
- **6366ea2 推送**（20:0x）：上面這批（隱藏任務加倍、物理修正、三角函數、反應速率）上線，正式站唯讀核對：首頁 51 張卡、兩個新頁沒有錯誤、排行榜規則已寫 2 倍。
- **第三批**：生物「神經的動作電位」action-potential（physiology 分支、ch-nerve 章、成就 branch-physiology「霍奇金與赫胥黎的烏賊」；簡體把生物的「電位」轉成「电位」不是「电势」，長詞先轉）、地科「絕熱冷卻與雲的形成」cloud-formation（atmo 分支第一個實驗、ch-atmo-water 章、成就 branch-atmo「霍華德的雲」）、放射衰變播放速度 10× 顯示成 1× 的錯誤。
- **自動試玩系統 A 層** `tools/playtest.cjs`（`npm run playtest [-- 代號…]`）：像學生一樣自動玩每個實驗（只載入、亂按 150 步含 390 px 與 3D 切換、英文探索、任務用字比對），抓頁面錯誤、NaN、左右捲動、空白畫布、滑桿顯示與數值不一致、預設狀態就完成任務、數值不合理。報告 `.shots/playtest-report.json`，每條附截圖與重現指令（`--seed=1112 --until=步數`）；誤報排除清單 `tools/playtest/exclude.cjs`（每條寫原因）。`npm run verify` 多了「試玩」階段，只重玩頁面、自己的程式、任務檔有改過的實驗（版本號與四頁以上共用的程式不算）；確定問題讓 verify 失敗，待確認列提醒。全站跑一次約 86 分鐘。第一次全站結果：確定問題只有放射衰變速度顯示（已修）與月相打數字後不更新（numinput 已在 b7edce7 修好）；待確認：hydrogen-spectrum-6、specific-heat-6、equipotential-4 的用字，以及亂按就完成的 tides-11（10 級）、torque-balance-10、current-magnetic-field-h3、moon-phases-h3、earthquake-12、tides-h3。
- **待辦**：lab-chem（H1、M3、M4、L14、U1 酸鹼滴定效能）、lab-earth（M1、M5、L1–L7、M2）、lab-bio（L15、L16）、lab-math（L13）的科學審查修正與新實驗待交件；分子形狀 5 件事、擴散參數、反應速率與三角函數交件單的確認事項待站長回覆。
