# 交接說明（雲端工作串 → 本機工作串「Astro Ni 物理實驗室」）

交接日期：2026-11-11。接手的工作串請先讀完 **CLAUDE.md**（規則與慣例），再讀這份（目前狀態、工具、待辦）。

## 一、網站目前的狀態

- 網址：https://astro1222ni.github.io/physics-lab/ ，推送到 `main` 後由 GitHub Pages 自動部署，約 1–2 分鐘生效。
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
- **自動優化**：藍圖與待改清單在 `docs/WORLD-CLASS.md`，紀錄在 `docs/auto-optimize-log.md`。排程「每天 01:40｜Astro Ni 物理實驗室自動優化」照清單做 1–3 件、總檢查全過才推。**主工作串開始改網站時建立 `.editing`（已列入 .gitignore），push 完刪掉**；排程看到 8 小時內的 `.editing` 就跳過。
- **選修物理講義的必做實驗**（講義在 `D:\物理講義電子檔\選修物理Ⅰ–Ⅴ`，文字要用 CID→Big5 解碼才讀得到，方法在 `docs/briefs/textbook-experiment.md`）：自由落體與斜面運動（free-fall）、牛頓第二運動定律（newton-second，已有）、水波槽（ripple-tank）、氣柱的共鳴（resonance-tube）、折射率的測定（refractive-index）、薄透鏡成像（thin-lens）、干涉與繞射（slit-interference，已有）、等位線與電場（equipotential）、電流天平（current-balance）、認識電磁波（microwave）、歐姆定律與電路（ohms-law）、電子的荷質比（e-over-m）。選修物理Ⅱ沒有正式實驗。11/11 十二個全部上線（新做的 10 個放在首頁對應的章；荷質比、水波槽、等位線、電流天平、微波另有 3D）。縮圖取景設定在 `tools/make-thumbs.cjs` 的 PREP（可用 `eval` 先執行頁面測試介面，例如折射率用 `window.__ri.place` 插針）。

- **物理實驗室核可室**：要站長決定的事一律開卡 https://claude.ai/artifact/XEAkzxm5585i8fzHEiHMfQ （資料 `items/<id>`：ep、topic、title、body、links、media、order、status、created、result；站長的回覆在 `answers/<id>`：choice ok／change、note）。每次回到工作串先查 answers、照做、把卡改 closed 並寫 result。11/11 已決定：自動優化全自動、鉑功函數維持 5.6 eV 並註明 6.35 eV、「關於本站」頁與 CC BY-NC 4.0 授權。
- **關於本站與授權**：`about.html`（作者、物理怎麼把關、引用格式、授權、隱私）、`LICENSE.md`。首頁、排行榜、隱私說明頁尾都有連結；`tools/seo.cjs` 產生它的 `AboutPage` 結構化資料。內容寫到站長本人，改動前要開卡問站長。
- **3D 檢視共通做法**：three.js 只在第一次切到 3D 時載入；切回 2D 時 `dispose()` 先把 `active` 設成 false 再 `forceContextLoss()`，`webglcontextlost` 處理程式要先檢查 `active`（否則會誤跳「3D 中斷」）；透明材質先轉色彩空間再乘 alpha（否則玻璃變白霧）。
- **英文模式檢查的例外**：刻意保留的中文（人名、頻道名、中文引用範例）在元素上標 `lang="zh-Hant"`，`check-pages` 會略過。
