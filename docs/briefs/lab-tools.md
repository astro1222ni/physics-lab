# 步驟指引、小鍵盤與實驗側板接法

元件不計算物理、不變更任務條件，也不代按器材按鈕。先載入 `lab-tools.css`（各元件也會按需補載），再載入 `js/stepguide.js`、`js/vpad.js`、`js/labside.js`。文字使用 LabSettings；沒有設定元件時預設繁體。

## LabStepGuide

```js
LabStepGuide.define([
  { target: '#power', action: 'tap', hint: ['接通電源', 'Switch on'] },
  { target: () => ({canvas:'#cv', at:()=>({x:100,y:80})}),
    action:'drag', dx:60, dy:-20, opener:'#view2d',
    hint:['拖動探針','Move the probe'] }
], {key:'my-lab'});
LabStepGuide.update(0, {key:'my-lab', auto:true});
```

- `target`：選擇器、元素、函式，或畫布點。`at()` 預設回傳畫布內的 CSS px；`client:true` 表示視窗 CSS 座標。
- `to`：拖曳終點，格式同畫布點。亦可用 `dx`、`dy`（CSS px）。
- `opener`：目標藏起來時先指向的按鈕，可為函式。收合 details 與 aria-controls 分頁也會自動尋找。
- `hint`：繁／英陣列、文字或函式。`action` 可為 tap、tick、drag。
- `key`：多組流程共用元件時用不同名稱，避免一般七步和自學七步互相覆蓋。
- `auto:true`：目前步驟自動跟進；人工指定的步驟會留到實際步驟改變。
- `hide()`、`setEnabled(bool)`、`toggleButton()`：隱藏提示、切換／儲存偏好、產生 44 px 開關。
- 元件只捲動目標，不 click 目標；裝飾層不接收指標。滾動容器的裁切也算可視範圍。

## LabVPad

```js
const pad=LabVPad.mount({
  id:'my-lab', canvas:document.querySelector('#cv'), objects:['n1','n2'],
  selected:()=>state.selected, select:id=>selectProbe(id),
  move:(dx,dy,id)=>moveProbe(id,dx,dy), record:()=>recordPoint(),
  point:id=>probeClientPoint(id), board:()=>boardClientRect(),
  reading:()=>meterText(), visible:()=>view==='2d'
});
```

- 實驗在 `move` 收到物理步距；預設 0.05，按鍵切換 0.01／0.05／0.5。斜向各軸都走一步。
- `point` 回傳視窗 CSS 座標，`board` 回傳 left／right／top／bottom。放大鏡從原畫布擷取 40 px 範圍畫成 120 px，實際倍率三倍。
- `visible` 控制 2D／3D 或非實驗情境；畫布離開視窗時自動收成圓鈕，回來後恢復原展開偏好。
- `viewport` 可回傳 `{width,height}`，預留側邊標籤的空間。
- 預設位置會讓開目前移動的探針；手動拖過後尊重自選位置。頂端把手可拖曳；不超出可見範圍，靠邊 14 px 內吸附，雙擊回預設。位置與收合偏好依 id 存本機，讀寫均有例外處理。
- 方向鍵按下先走一步，350 ms 後開始每 80 ms 一步；放開、取消、失焦、換 3D 都停止。
- 原實驗自行拖探針時呼叫 `pad.activity()`；兩秒後放大鏡淡出。`collapse(bool)`、`reset()`、`refresh()` 可由實驗主動呼叫。
- `dispose()` 移除本元件的畫面及連發計時。

## LabSide

```js
LabSide.mount({module:'my-lab',
  steps:()=>procedureState(),
  guide:i=>LabStepGuide.update(i,{key:'my-lab'}),
  study:()=>studyActive,
  focus:()=>document.querySelector('#stage').scrollIntoView({block:'start'})
});
```

- `steps()` 回傳 `{html,done,current}` 陣列，必須讀原步驟資料，不複製另一套判定。
- 任務讀 `LabMission.all()`、`_state.done`、`starsOf()`；僅顯示既有資料，隱藏任務不洩漏名稱與判定。
- `study` 為真時收起三個右側標籤，改用 LabPanel 五個分頁。原 `.fb-tab` 被移入同一列；原留言程式不用改。
- `LabSide.feedbackContent({beforeCompose})` 產生共用留言按鈕，呼叫 `LabComments.compose(text)`，只準備草稿。
- `LabSide.instance.open('steps'|'missions'|'comments')`、`close()`、`refresh()` 可由頁面呼叫。
- 桌機讓出 380 px，手機下方抽屜以把手拖高低；不鎖住畫布操作。

等位線範例在 `js/equipotential-controls.js`；一般七步由 EquipotentialLab.steps／guides 提供，自學七步由 LabSteps 接相同指引。

補充：`action` 也可傳回傳動作字串的函式，方便先指向探針選擇鈕，再顯示拖曳手勢。小鍵盤的 `refresh()` 會立即同步外部的物件選擇；實驗切換探針時應呼叫它，避免下一次指標操作落在舊位置。放大鏡會避開小鍵盤及目前針尖，使用者自己拖放的小鍵盤位置仍優先保留。

獨立自學頁可在 `<body data-comments-url="實驗代號.html">` 指定所屬實驗，或傳入 `feedbackContent({url})`。本頁沒有 `LabComments` 時會開啟該同源實驗頁，待 API 就緒後呼叫 `LabComments.compose`；只填草稿，不送出留言。嵌入實驗的 `.fb-tab` 由外層入口取代。

任務側板會呼叫主線 `LabMission.needOf(m)` 顯示「還差什麼」，不重寫條件；展開的清單隨實驗即時更新。「看全部條件」優先捲到可見的共用側板，並展開該任務。`LabSide.instance.open(tab)` 保證開啟，重複呼叫不會把側板關掉。

畫布只有少量露出、目前探針在可見範圍外，或頁面已捲離畫布時，小鍵盤先收成圓鈕；回到可操作的位置再展開。預設圓鈕放在可用範圍右下角，避免擋住上方的材質切換。放大鏡只在 `activity()` 之後出現。

入口若使用主線 `LabModeGate`，驗收與老師連結應明確寫 `?mode=lab` 或 `?mode=learn&study=1`。側板仍列出全部任務，並說明各模式的領星範圍；實際是否判定完全交給 `LabMission.modeAllows`，不在側板另寫限制。

自學底部收合列會納入目標可用範圍；只有一部分露出的按鈕仍顯示捲動箭頭，捲到完整可按後才顯示手勢。
