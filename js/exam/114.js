/* Original question text and bilingual labels. Inline mathematics uses KaTeX. */
window.Exam114 = (() => {
  const S=String.raw;
  const questions={
    19:{
      title:['衛星的軌道','Satellite orbits'],lab:'kepler',labName:['克卜勒行星運動定律','Kepler’s laws'],
      stem:['國際太空站（簡稱 ISS）主要用於進行微重力環境下的各種實驗，其繞行地球的週期為 90 分鐘，而任何質量的同步衛星，其繞行地球的週期和地球自轉的週期相同。', 'The International Space Station (ISS) hosts experiments in microgravity. Its orbital period is 90 minutes. A synchronous satellite of any mass has an orbital period equal to Earth’s rotation period.'],
      ask:[S`已知沿圓形軌道繞行地球的物體，其動能 \(K\) 與重力位能 \(U\) 的關係為 \(K=-\tfrac12 U\)。若 ISS 與某同步衛星的軌道皆近似圓形，則 ISS 與該同步衛星比較時，下列敘述哪些正確？（應選 2 項）`,S`For an object in a circular Earth orbit, kinetic energy \(K\) and gravitational potential energy \(U\) satisfy \(K=-\tfrac12 U\). If both orbits are approximately circular, which statements about the ISS compared with the synchronous satellite must be true? Choose two.`],
      choices:[['ISS 的軌道半徑一定比較大','The ISS must have a larger orbital radius.'],['ISS 的總力學能一定比較大','The ISS must have greater total mechanical energy.'],['ISS 的重力位能一定比較大','The ISS must have greater gravitational potential energy.'],['ISS 的速率一定比較大','The ISS must have greater speed.'],['ISS 的加速度量值一定比較大','The ISS must have a greater acceleration magnitude.']],
      key:'DE',rate:41,shares:[17,32,34,63,47],
      hint:['先比週期：90 分鐘和 24 小時，週期短的軌道半徑比較大還是小？再看題目說「任何質量」：和衛星質量有關的量，能「一定」比較嗎？','Compare 90 minutes with 24 hours. Which orbit has the smaller radius? Can you rank a mass-dependent quantity when either satellite could be more massive?'],
      hands:['調整軌道高度','Adjust the orbit'],mid:'solve',
      groups:{wrong:['常見錯選','Common choices'],flip:['位能的正負','Potential energy'],flip2:['衛星質量','Satellite mass'],solve:['向心加速度','Centripetal acceleration'],radius:['比較半徑','Compare radii'],kepler:['克卜勒第三定律','Kepler’s third law'],judge:['判斷選項','Evaluate the choices'],alt:['能量驗算','Check the energy'],trick:['適用條件','When the rule applies']}
    },
    23:{
      title:['太空船的訊號','Signals from a spacecraft'],lab:'doppler',labName:['都卜勒效應','Doppler effect'],
      group:['第 22–23 題題組','Passage for questions 22–23'],
      passage:[['搭載火星探測器的太空船，加速脫離地球引力後，以等速飛行一段距離，然後減速準備登陸火星，過程中太空船持續遠離地球，歷經約 200 天的飛行抵達火星。從火星以電磁波傳訊到地球，約需 10 分鐘才能收到訊號。太空船飛行過程持續向地球傳送電磁波，用以監測飛行速度。','A spacecraft carrying a Mars probe accelerates away from Earth, cruises at constant speed and then slows down for landing. It keeps moving away from Earth throughout the roughly 200-day flight. A radio signal from Mars takes about 10 minutes to reach Earth. The spacecraft continuously sends electromagnetic waves to Earth so its speed can be monitored.']],
      ask:[S`太空船停在地球表面上所發出的電磁波由地球監控站測得的頻率為 \(f_0\)。若太空船飛行過程，從地球監控站所測得的電磁波頻率為 \(f\)，則下列過程的頻率關係，哪些正確？（應選 2 項）`,S`When the spacecraft is at rest on Earth, the ground station measures its signal frequency as \(f_0\). During flight the station measures frequency \(f\). Which relations are correct? Choose two.`],
      choices:[['加速過程','Accelerating'],['加速過程','Accelerating'],['等速過程','Cruising'],['等速過程','Cruising'],['減速過程','Slowing down']].map((label,i)=>label.map(s=>s+' '+['\\(f<f_0\\)','\\(f=f_0\\)','\\(f=f_0\\)','\\(f<f_0\\)','\\(f>f_0\\)'][i])),
      key:'AD',rate:49,shares:[68,17,38,50,19],
      hint:['都卜勒效應看的是波源有沒有在靠近或遠離你，不是速度有沒有在變。三段過程，太空船都在做什麼？','Think about motion toward or away from the receiver. What is the spacecraft doing in all three stages?'],
      hands:['追蹤接收頻率','Track the received frequency'],mid:'ft',
      groups:{wrong:['等速的迷思','The cruising misconception'],flip:['遠離地球','Receding from Earth'],judge:['判斷選項','Evaluate the choices'],ft:['頻率隨時間變化','Frequency over time'],redshift:['紅移','Redshift'],trick:['判斷方向','Check the direction']}
    },
    49:{
      title:['鈉離子通道的電流與電壓','Current and voltage in a sodium channel'],lab:'ohms-law',labName:['歐姆定律','Ohm’s law'],
      group:['第 47–49 題題組與圖 12–14','Passage and figures 12–14 for questions 47–49'],
      passage:[
        ['2024 年諾貝爾物理獎主題是仿效腦部神經網路，藉由變化數據節點之間連通的強弱，奠定人工智慧（AI）的基礎。圖 12 為探究神經細胞之間的連通機制，是 1963 年諾貝爾生理學或醫學獎主題的示意圖。通過神經細胞膜傳訊的機制放大圖如圖 13。','The 2024 Nobel Prize in Physics recognized work that laid foundations for AI by imitating neural networks and varying the strength of connections between data nodes. Figure 12 illustrates the mechanism of communication between neurons, the subject of the 1963 Nobel Prize in Physiology or Medicine. Figure 13 enlarges the mechanism for signaling across the cell membrane.'],
        [S`電路模型如圖 14，模型中 \(C_{\rm M}\) 代表細胞膜的內、外表面，以及其間的不導電物質。\(R_{\rm Na}\) 與 \(R_{\rm K}\) 為可變電阻，可以改變神經細胞之間連通的強弱，以處理資訊。其中 \(E_{\rm Na}\)、\(E_{\rm K}\) 與 \(E_{\rm L}\) 分別為離子 \(\mathrm{Na}^+\)、\(\mathrm K^+\) 與其他離子的平衡電壓，相當於等效電池，可以推送或聚集對應的離子，維持細胞內外離子濃度差異。`,S`In the circuit model (figure 14), \(C_{\rm M}\) represents the inner and outer membrane surfaces and the insulating material between them. The variable resistors \(R_{\rm Na}\) and \(R_{\rm K}\) change the connection strength between neurons for information processing. The equilibrium voltages \(E_{\rm Na},E_{\rm K},E_{\rm L}\) for sodium, potassium and other ions act as batteries that move or accumulate their respective ions, maintaining the concentration differences across the cell membrane.`],
        [S`已知平衡電壓為 \(E=-\frac{\alpha T}{e}\log\!\left(\frac{n_{內}}{n_{外}}\right)\)，其中 \(n_{內}\) 與 \(n_{外}\) 分別為細胞內部與外部的離子濃度，\(\alpha>0\) 為轉換常數，\(T\) 為絕對溫度，\(e\) 為基本電量。依據以上資料回答下列問題。`,S`The equilibrium voltage is \(E=-\frac{\alpha T}{e}\log\!\left(\frac{n_{\rm in}}{n_{\rm out}}\right)\), where the two concentrations are those inside and outside the cell, respectively, \(\alpha>0\) is a conversion constant, \(T\) is absolute temperature and \(e\) is the elementary charge. Use this information to answer the questions.`]
      ],
      ask:[S`圖 15 為科學家探究細胞膜 \(\mathrm{Na}^+\) 通道在導通狀況下的簡化直流電路，電壓 \(V\) 為細胞內外的電位差，\(I_{\rm Na}\) 為 \(\mathrm{Na}^+\) 電流。假設 \(\mathrm{Na}^+\) 通道的 \(I_{\rm Na}\)–\(V\) 特性為線性，且 \(E_{\rm Na}\) 為定值。圖 16 為實驗分析結果的數據與趨勢線，縱軸為電流 \(I_{\rm Na}\)，橫軸為電壓 \(V\)。若已知 \(V=E_{\rm Na}+I_{\rm Na}R_{\rm Na}\)，試分析並計算鈉離子通道的（a）平衡電壓 \(E_{\rm Na}\)，（b）電阻值 \(R_{\rm Na}\)。`,S`Figure 15 shows a simplified DC circuit for a conducting sodium channel. \(V\) is the potential difference across the membrane and \(I_{\rm Na}\) is the sodium current. Assume a linear current–voltage characteristic and constant \(E_{\rm Na}\). Figure 16 shows measurements and a trend line, with current on the vertical axis and voltage on the horizontal axis. Given \(V=E_{\rm Na}+I_{\rm Na}R_{\rm Na}\), find (a) the equilibrium voltage and (b) the channel resistance.`],
      hint:[S`（a）\(V=E_{\rm Na}+I_{\rm Na}R_{\rm Na}\)。電流為 0 時，\(V\) 等於什麼？在圖上找電流是 0 的地方。（b）縱軸是電流、橫軸是電壓，斜率是 \(R\) 還是 \(1/R\)？`,S`(a) Set the current to zero. What does \(V\) equal at that point on the graph? (b) With current vertical and voltage horizontal, is the slope \(R\) or \(1/R\)?`],
      hands:['用兩點量電阻','Measure resistance with two points'],mid:'solveB',
      groups:{wrong:['辨認座標軸','Read the axes'],solveA:['讀取平衡電壓','Read the equilibrium voltage'],solveB:['量出電阻','Measure the resistance'],grade:['給分範圍','Marking ranges'],alt:['聯立兩式','Solve two equations'],joke:['細胞裡的電池','The cell’s battery'],trick:['斜率與截距','Slope and intercept']}
    }
  };
  const wanted=new URLSearchParams(location.search).get('q');
  const number=Object.hasOwn(questions,wanted)?Number(wanted):19;
  return {number,question:questions[number],questions};
})();
