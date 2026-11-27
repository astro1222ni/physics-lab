/* 115 學測自然物理 14 題：原卷題目與中英對照（數學式用 KaTeX）。由 規劃/學習-學測115/gen115.py 從 data115.json 產生；
   每題的畫面、動手與字幕在 js/exam/115/q<N>.js。英文版甲乙丙丁照影片英文字幕：起重機 P1–P4、恆星 time 1/2、四種力 force 1–4。 */
window.ExamTracks = window.ExamTracks || {};
window.Exam115 = (() => {
  const S=String.raw;
  const P11=[[S`如圖 5 所示，一塔式起重機將一個重物自地面甲點從靜止鉛直上拉，歷經乙、丙兩點後，停止於丁點。其中甲、乙兩點之間保持加速運動，乙、丙兩點之間為等速度運動，丙、丁兩點之間保持減速運動。回答 11-12 題。`,S`As shown in Figure 5, a tower crane lifts a load straight up from rest at point P1 on the ground. It passes points P2 and P3 and stops at point P4. Between P1 and P2 the load keeps accelerating, between P2 and P3 it moves at constant velocity, and between P3 and P4 it keeps decelerating. Answer questions 11–12.`]];
  const P17=[[S`表 1 為地球與月球的赤道日夜均溫。新的登月計畫將設計小型模組核反應器（簡稱 SMR），提供維生與探究的能源。SMR 的發電功率為 \(P_{\mathrm{e}}=300\ \mathrm{MW}\)，採用的核反應如圖 7 所示。一顆中子射入一個鈾核，激發核反應，產生核能 \(E_{\mathrm{N}}\)、一個鋇核、一個氪核與 3 顆中子。SMR 之核能轉換為電能的效率約是 33%。依據以上資料與所學，回答下列問題。`,S`Table 1 lists the average day and night temperatures at the equators of the Earth and the Moon. A new lunar programme will design a small modular reactor (SMR) to supply energy for life support and exploration. The SMR’s electrical output is \(P_{\mathrm{e}}=300\ \mathrm{MW}\), and it uses the nuclear reaction shown in Figure 7: a neutron strikes a uranium nucleus and triggers a reaction that releases nuclear energy \(E_{\mathrm{N}}\), one barium nucleus, one krypton nucleus and 3 neutrons. The SMR converts nuclear energy into electrical energy with an efficiency of about 33%. Use this information and what you have learned to answer the following questions.`],
   [S`表 1　\(\begin{array}{c|cc}\text{星球} & \text{日間} & \text{夜間}\\ \hline \text{地球} & 31\ {}^{\circ}\mathrm{C} & 23\ {}^{\circ}\mathrm{C}\\ \text{月球} & 121\ {}^{\circ}\mathrm{C} & -133\ {}^{\circ}\mathrm{C}\end{array}\)`,S`Table 1　\(\begin{array}{c|cc}\text{Body} & \text{Day} & \text{Night}\\ \hline \text{Earth} & 31\ {}^{\circ}\mathrm{C} & 23\ {}^{\circ}\mathrm{C}\\ \text{Moon} & 121\ {}^{\circ}\mathrm{C} & -133\ {}^{\circ}\mathrm{C}\end{array}\)`]];
  const P47=[[S`圖 17 為汞原子的部分能階 \(n\)（\(n=0, 1, 2,\ldots\)）與其能量 \(E_n\) 的示意圖，並以最高能量 \(E_0=0\ \mathrm{eV}\) 為參考能量，其中 \(1\ \mathrm{eV}=1.6\times10^{-19}\ \mathrm{J}\)，是常用能量單位。例如，晶片製程使用的 365 nm 紫外光（UV），其光子能量為 3.4 eV。`,S`Figure 17 shows some energy levels \(n\) (\(n=0, 1, 2,\ldots\)) of the mercury atom and their energies \(E_n\), taking the highest energy \(E_0=0\ \mathrm{eV}\) as the reference. Here \(1\ \mathrm{eV}=1.6\times10^{-19}\ \mathrm{J}\) is a common unit of energy. For example, the 365 nm ultraviolet light (UV) used in chip making has a photon energy of 3.4 eV.`],
   [S`晶片先進製程使用的 13.5 nm 極紫外光（EUV），並採用反射鏡來匯聚與引導，如圖 18 所示。然而 EUV 於反射鏡上無法全部被反射，仍會有部分透射與被吸收。`,S`Advanced chip making uses 13.5 nm extreme ultraviolet light (EUV), which is focused and guided by mirrors, as shown in Figure 18. However, a mirror cannot reflect all of the EUV; some of it is still transmitted or absorbed.`],
   [S`圖 19（a）為反射鏡面的局部放大圖，示意以重複的薄膜單元（實線框）加強 EUV 反射效率的機制，圖中的箭號 \(\mathrm{I_1}\) 代表一束射入表面的光線，箭號 \(\mathrm{R_1}\)、\(\mathrm{R_2}\)、\(\mathrm{R_3}\ldots\) 依序對應於 \(\mathrm{I_1}\) 光線從各個薄膜單元界面反射而出的光線。每一個薄膜單元包含兩層，EUV 在快波速介質（白色層）的波速大於在慢波速介質（灰色層）的波速。圖 19（a）薄膜單元內的點線僅供示意 \(\mathrm{R_1}\)、\(\mathrm{R_2}\)、\(\mathrm{R_3}\ldots\) 的反射來源，未能精確代表實際光線的反射與折射角度。`,S`Figure 19(a) is a magnified view of part of the mirror surface. It shows how repeated thin-film units (solid frames) raise the EUV reflectivity. The arrow \(\mathrm{I_1}\) is a ray striking the surface, and the arrows \(\mathrm{R_1}\), \(\mathrm{R_2}\), \(\mathrm{R_3}\ldots\) are, in order, the rays of \(\mathrm{I_1}\) reflected from the interfaces of successive thin-film units. Each unit has two layers: EUV travels faster in the fast-wave medium (white layer) than in the slow-wave medium (grey layer). The dotted lines inside the units in Figure 19(a) only indicate where \(\mathrm{R_1}\), \(\mathrm{R_2}\), \(\mathrm{R_3}\ldots\) come from; they do not show the actual angles of reflection and refraction.`],
   [S`已知普朗克常數為 \(h=6.63\times10^{-34}\ \mathrm{J\cdot s}\)，真空中光速為 \(c=3\times10^{8}\ \mathrm{m/s}\)。依據以上資料與所學，回答下列問題。`,S`Planck’s constant is \(h=6.63\times10^{-34}\ \mathrm{J\cdot s}\) and the speed of light in vacuum is \(c=3\times10^{8}\ \mathrm{m/s}\). Use this information and what you have learned to answer the following questions.`]];
  const P52=[[S`潮汐為永續能源。例如圖 20 所示，可在海灣口築堤壩以蓄水儲能於海灣內。漲潮時海水流入海灣，退潮時海水流出海灣，都經過壩底通道，可驅動水車發電機進行發電，假設漲、退潮發電量相同。圖 21 為另一種發電設施，潮汐造成海面升降，經由浮筒與連桿，推拉磁鐵相對於線圈運動，因而產生感應電流。`,S`Tides are a sustainable energy source. As shown in Figure 20, a dam can be built across the mouth of a bay to store water, and thus energy, inside the bay. At flood tide seawater flows into the bay and at ebb tide it flows out; both times it passes through a channel at the bottom of the dam and drives a water-turbine generator. Assume the flood and ebb tides generate equal amounts of electricity. Figure 21 shows another kind of generator: the tide raises and lowers the sea surface, and through a float and a connecting rod it pushes and pulls a magnet relative to a coil, producing an induced current.`]];
  const questions={
    10:{
      title:[S`汽車的 v-t 圖`,S`A car’s v–t graph`],lab:'newton-second',labName:[S`牛頓第二定律（力學車實驗）`,S`Newton’s second law: the dynamics cart`],figs:'fig4',
      ask:[S`有一部質量為 1000 公斤的汽車由靜止開始，在水平路面朝正東方直線加速至速度為 10 公尺/秒。接著它保持等速度前進，一段時間後因失去動力而減速至停止。若汽車的速度隨時間的變化如圖 4 所示，則下列敘述何者正確？`,S`A car of mass 1000 kg starts from rest and accelerates in a straight line due east on a level road to a speed of 10 m/s. It then keeps moving at constant velocity, and after a while it loses power and slows to a stop. If the car’s velocity varies with time as shown in Figure 4, which statement is correct?`],
      choices:[[S`汽車的加速度量值在減速階段為加速階段的 2 倍`,S`The magnitude of the car’s acceleration while slowing down is 2 times that while speeding up.`],
        [S`減速過程阻力對汽車所作的功為 \(-5\times10^{6}\) 焦耳`,S`While slowing down, the resistive force does \(-5\times10^{6}\) J of work on the car.`],
        [S`汽車的位移在減速階段為加速階段的 2 倍`,S`The car’s displacement while slowing down is 2 times its displacement while speeding up.`],
        [S`汽車在加速階段的位移為 50 公尺`,S`The car’s displacement while speeding up is 50 m.`],
        [S`整個過程中汽車的位移為 200 公尺`,S`The car’s displacement over the whole trip is 200 m.`]],
      key:'C',rate:77,shares:[8, 8, 78, 5, 3],
      hint:[S`v-t 圖的斜率代表什麼？圖線下的面積又代表什麼？把加速、等速、減速三段分開看。`,S`On a v–t graph, what does the slope tell you, and what does the area under the line tell you? Look at the speeding-up, steady and slowing-down stages separately.`],
      hands:[S`拉時間看面積長出來`,S`Scrub time and watch the area grow`],mid:'solveC',
      caption:[S`圖 4：汽車的 v-t 圖`,S`Figure 4: the car’s v–t graph`],
      focus:/斜率|面積|位移|加速度|三角形|功能定理|阻力|動能|slope|area|displacement|acceleration|triangle|work[- ]energy|friction|kinetic/i
    },
    11:{
      title:[S`起重機：力的方向`,S`Crane: which way is the force?`],lab:'elevator',labName:[S`電梯中的視重（超重與失重）`,S`Apparent weight in an elevator`],figs:'fig5',
      group:['第 11–12 題題組','Passage for questions 11–12'],passage:P11,
      ask:[S`假設重物的位移、速度、加速度與所受合力分別為 \(D\)、\(v\)、\(a\) 與 \(F\)，則下列敘述哪些正確？（應選 2 項）`,S`Let the load’s displacement, velocity, acceleration and net force be \(D\), \(v\), \(a\) and \(F\). Which statements are correct? (Choose 2.)`],
      choices:[[S`甲至乙、丙至丁兩段路程，\(F\) 的方向皆向上`,S`From P1 to P2 and from P3 to P4, \(F\) points upward in both stages.`],
        [S`甲至乙、丙至丁兩段路程，\(F\) 的方向皆向下`,S`From P1 to P2 and from P3 to P4, \(F\) points downward in both stages.`],
        [S`丙至丁段路程之中 \(D\) 與 \(F\) 的方向相同`,S`From P3 to P4, \(D\) and \(F\) point in the same direction.`],
        [S`丙至丁段路程之中 \(v\) 與 \(F\) 的方向相反`,S`From P3 to P4, \(v\) and \(F\) point in opposite directions.`],
        [S`丙至丁段路程之中 \(a\) 與 \(F\) 的方向相同`,S`From P3 to P4, \(a\) and \(F\) point in the same direction.`]],
      key:'DE',rate:42,full:34,shares:[43, 11, 39, 52, 52],
      hint:[S`先由「加速、等速、減速」判斷每一段加速度的方向；合力和加速度的方向有什麼關係？`,S`From “speeding up, constant speed, slowing down”, work out the direction of the acceleration in each stage. How is the direction of the net force related to that of the acceleration?`],
      hands:[S`拉時間看三個箭頭`,S`Scrub time and watch the three arrows`],mid:'solve',
      caption:[S`圖 5：塔式起重機`,S`Figure 5: the tower crane`],
      focus:/合力|加速度|速度|位移|同向|反向|向上|向下|net force|acceleration|velocity|displacement|same direction|opposite|up|down/i
    },
    12:{
      title:[S`起重機：動能與位能`,S`Crane: kinetic and potential energy`],lab:'energy-coaster',labName:[S`雲霄飛車與力學能守恆`,S`Roller coaster and conservation of mechanical energy`],figs:'fig5',
      group:['第 11–12 題題組','Passage for questions 11–12'],passage:P11,
      ask:[S`假設 \(\Delta U_{甲乙}\)、\(\Delta U_{乙丙}\) 及 \(\Delta U_{丙丁}\) 分別代表重物於甲至乙、乙至丙及丙至丁三段路程中起點與終點的重力位能變化量，\(\Delta K_{甲乙}\)、\(\Delta K_{乙丙}\) 及 \(\Delta K_{丙丁}\) 分別代表重物於甲至乙、乙至丙及丙至丁三段路程中起點與終點的動能變化量，則下列關係哪些正確？（應選 2 項）`,S`Let \(\Delta U_{12}\), \(\Delta U_{23}\) and \(\Delta U_{34}\) be the changes in the load’s gravitational potential energy between the start and end of the stages P1→P2, P2→P3 and P3→P4, and let \(\Delta K_{12}\), \(\Delta K_{23}\) and \(\Delta K_{34}\) be the changes in its kinetic energy over the same three stages. Which relations are correct? (Choose 2.)`],
      choices:[[S`\(\Delta U_{甲乙}+\Delta K_{甲乙}=0\)`,S`\(\Delta U_{12}+\Delta K_{12}=0\)`],
        [S`\(\Delta K_{甲乙}+\Delta K_{丙丁}=0\)`,S`\(\Delta K_{12}+\Delta K_{34}=0\)`],
        [S`\(\Delta U_{乙丙}+\Delta K_{乙丙}=0\)`,S`\(\Delta U_{23}+\Delta K_{23}=0\)`],
        [S`\(\Delta K_{甲乙}+\Delta K_{乙丙}+\Delta K_{丙丁}>0\)`,S`\(\Delta K_{12}+\Delta K_{23}+\Delta K_{34}>0\)`],
        [S`\(\Delta U_{甲乙}+\Delta U_{乙丙}+\Delta U_{丙丁}>0\)`,S`\(\Delta U_{12}+\Delta U_{23}+\Delta U_{34}>0\)`]],
      key:'BE',rate:42,full:31,shares:[21, 42, 32, 29, 68],
      hint:[S`重物一路往上，每段的高度變化決定 \(\Delta U\) 的正負；每段起點、終點的速率決定 \(\Delta K\) 的正負。`,S`The load rises the whole way, so the height change in each stage sets the sign of \(\Delta U\); the speeds at the start and end of each stage set the sign of \(\Delta K\).`],
      hands:[S`看三段的能量長條`,S`Watch the energy bars in three stages`],mid:'solveU',
      caption:[S`圖 5：塔式起重機`,S`Figure 5: the tower crane`],
      focus:/動能|位能|守恆|正功|拉力|加起來|kinetic|potential|conserved|positive work|tension|add/i
    },
    13:{
      title:[S`系外行星與都卜勒`,S`Exoplanets and the Doppler effect`],lab:'doppler',labName:[S`都卜勒效應`,S`The Doppler effect`],figs:'fig6',
      ask:[S`2019 年諾貝爾物理獎主題之一為對太陽系外行星系統的探究。實際上某一行星與某恆星皆以 x 點為圓心作圓周運動，如圖 6 所示。在甲時刻，該恆星接近地球。在乙時刻，該恆星遠離地球。已知在實驗室中，靜止光源發出與該恆星相同光譜線的頻率為 \(f_0\)。若地面測站與該恆星繞行的圓軌道共平面，則該恆星發出的相同光譜線，從地面測站觀測，所測得頻率 \(f\) 隨時間 \(t\) 的變化最接近下列何者？`,S`One topic of the 2019 Nobel Prize in Physics was the study of planetary systems outside the Solar System. A planet and its star both move in circles about point x, as shown in Figure 6. At time 1 the star is approaching the Earth; at time 2 it is moving away from the Earth. In the laboratory, a stationary source emits the same spectral line as the star at frequency \(f_0\). If the ground station lies in the plane of the star’s circular orbit, which graph best shows how the frequency \(f\) of that spectral line, measured at the ground station, varies with time \(t\)?`],
      choices:[[S`一直等於 \(f_0\)`,S`\(f=f_0\) all the time`],
        [S`甲時刻最低、乙時刻最高`,S`Lowest at time 1, highest at time 2`],
        [S`甲、乙時刻都最低，全程不高於 \(f_0\)`,S`Lowest at both times, never above \(f_0\)`],
        [S`甲、乙時刻都最高，全程不低於 \(f_0\)`,S`Highest at both times, never below \(f_0\)`],
        [S`甲時刻最高、乙時刻最低`,S`Highest at time 1, lowest at time 2`]],
      key:'E',rate:71,shares:[5, 15, 4, 4, 72],
      hint:[S`光源朝你靠近時，測到的頻率變高還是變低？甲、乙兩時刻，恆星的速度和視線各是什麼關係？`,S`When a source moves toward you, is the measured frequency higher or lower? At times 1 and 2, how is the star’s velocity related to the line of sight?`],
      hands:[S`拖恆星繞一圈看頻率`,S`Drag the star around and watch f`],mid:'solve',
      caption:[S`圖 6：恆星與行星繞 x 點轉`,S`Figure 6: star and planet orbit point x`],
      focus:/靠近|遠離|頻率|變高|變低|藍移|紅移|週期|approach\w*|reced\w*|frequency|higher|lower|blueshift|redshift|period/i
    },
    14:{
      title:[S`氦原子裡的四種力`,S`Four forces in a helium atom`],lab:'electric-field',labName:[S`電場與等位線`,S`Electric fields and equipotentials`],figs:'scene',
      ask:[S`一個氦原子的原子核內有兩個質子與兩個中子，而原子核外則有兩個電子環繞。若氦原子裡兩質子間的靜電力量值為甲，兩中子間的重力量值為乙，一個質子與一個電子間的靜電力量值為丙，兩質子間的強力量值為丁，則這四個量值間的大小關係為下列何者？`,S`A helium atom has two protons and two neutrons in its nucleus, with two electrons outside it. Let force 1 be the magnitude of the electrostatic force between the two protons, force 2 the magnitude of the gravitational force between the two neutrons, force 3 the magnitude of the electrostatic force between a proton and an electron, and force 4 the magnitude of the strong force between the two protons. Which correctly ranks these four magnitudes?`],
      choices:[[S`甲＝丁＞丙＞乙`,S`1 = 4 > 3 > 2`],
        [S`丁＞甲＝乙＞丙`,S`4 > 1 = 2 > 3`],
        [S`甲＞丙＞乙`,S`1 > 3 > 2`],
        [S`甲＝丙＞乙`,S`1 = 3 > 2`],
        [S`甲＞乙＞丙＞丁`,S`1 > 2 > 3 > 4`]],
      key:'C',rate:30,shares:[20, 29, 30, 18, 3],
      hint:[S`先比距離：原子核裡的粒子相距多遠？電子離原子核又多遠？再想靜電力和重力本身差了多少個數量級。`,S`Compare distances first: how far apart are particles inside the nucleus, and how far is an electron from it? Then think about how many orders of magnitude separate the electric and gravitational forces.`],
      hands:[S`比較四種力的大小`,S`Compare the four forces`],mid:'solve2',
      caption:[S`氦原子：原子核與電子`,S`Helium: nucleus and electrons`],
      focus:/距離|平方|強力|重力|靜電力|電力|十的|倍|distance|square\w*|strong|gravity|electric|times/i
    },
    15:{
      title:[S`電場的 SI 單位`,S`The SI unit of electric field`],lab:'electric-field',labName:[S`電場與等位線`,S`Electric fields and equipotentials`],figs:'scene',
      ask:[S`電場為單位正電荷在空間中任一位置所受的靜電力，電器內常以電場驅動帶電粒子，進行運算、控制與調節等工作。設 N 為牛頓、C 為庫侖、V 為伏特、A 為安培，則下列何者為電場的 SI 單位？`,S`The electric field is the electrostatic force on a unit positive charge at any point in space. Electrical devices often use electric fields to drive charged particles for computing, control and regulation. Let N be the newton, C the coulomb, V the volt and A the ampere. Which is the SI unit of the electric field?`],
      choices:[[S`\(\dfrac{\mathrm{C}}{\mathrm{N}}\)`,S`\(\dfrac{\mathrm{C}}{\mathrm{N}}\)`],
        [S`\(\dfrac{\mathrm{N}}{\mathrm{C}}\)`,S`\(\dfrac{\mathrm{N}}{\mathrm{C}}\)`],
        [S`\(\dfrac{\mathrm{V}}{\mathrm{A}}\)`,S`\(\dfrac{\mathrm{V}}{\mathrm{A}}\)`],
        [S`\(\dfrac{\mathrm{A}}{\mathrm{V}}\)`,S`\(\dfrac{\mathrm{A}}{\mathrm{V}}\)`],
        [S`\(\dfrac{\mathrm{N}^{2}}{\mathrm{C}}\)`,S`\(\dfrac{\mathrm{N}^{2}}{\mathrm{C}}\)`]],
      key:'B',rate:45,shares:[10, 45, 22, 15, 7],
      hint:[S`題目第一句就是定義：「單位正電荷」所受的「力」。力和電荷各用什麼單位？`,S`The first sentence is the definition: the force on a unit positive charge. What are the units of force and of charge?`],
      hands:[S`拼出電場的單位`,S`Build the unit of field`],mid:'solve',
      caption:[S`電場：每庫侖受多少力`,S`Field: force per coulomb`],
      focus:/電場|每|庫侖|牛頓|伏特|單位|電阻|field|per|coulomb|newton|volt|unit|resistance/i
    },
    16:{
      title:[S`電子的受力圖`,S`Force on the electron`],lab:'electric-field',labName:[S`電場與等位線`,S`Electric fields and equipotentials`],figs:'scene',
      ask:[S`假設氫原子中的質子位於 \(x\) 軸原點，則下列何者最接近電子所受靜電力 \(F\) 隨著位置 \(x\) 的變化？（令靜電力 \(F\) 朝 \(+x\) 方向為正值）`,S`Suppose the proton of a hydrogen atom sits at the origin of the \(x\)-axis. Which graph best shows how the electrostatic force \(F\) on the electron varies with its position \(x\)? (Take \(F\) as positive when it points in the \(+x\) direction.)`],
      choices:[[S`\(x>0\) 時為正、\(x<0\) 時為負的曲線`,S`Curves: positive for \(x>0\), negative for \(x<0\)`],
        [S`\(x>0\) 時為負、\(x<0\) 時為正的曲線`,S`Curves: negative for \(x>0\), positive for \(x<0\)`],
        [S`\(x>0\) 時為負、\(x<0\) 時為正的直線`,S`Lines: negative for \(x>0\), positive for \(x<0\)`],
        [S`\(x>0\) 時為正、\(x<0\) 時為負的直線`,S`Lines: positive for \(x>0\), negative for \(x<0\)`],
        [S`原點兩側都為負的曲線`,S`Curves: negative on both sides`]],
      key:'B',rate:42,shares:[32, 42, 7, 5, 14],
      hint:[S`電子和質子互相吸引還是排斥？電子在原點右邊時，力指向哪一邊？力的大小又怎麼隨距離改變？`,S`Do the electron and the proton attract or repel? When the electron is to the right of the origin, which way does the force point? And how does its size change with distance?`],
      hands:[S`拖電子看受力`,S`Drag the electron and watch the force`],mid:'solve',
      caption:[S`質子在原點，電子在 x`,S`Proton at the origin, electron at x`],
      focus:/吸引|指向原點|平方反比|正|負|attract\w*|toward the origin|inverse[- ]square|positive|negative/i
    },
    17:{
      title:[S`月球日夜的分子動能`,S`Molecular energy on the Moon`],lab:'ideal-gas',labName:[S`理想氣體分子模擬`,S`Ideal gas molecules`],figs:'table1',
      group:['第 17–18 題題組','Passage for questions 17–18'],passage:P17,
      ask:[S`已知氣體分子平均動能正比於其克氏溫度（絕對溫度），則在月球赤道處，相同氣體分子的平均動能於日間為夜間的多少倍？`,S`The average kinetic energy of gas molecules is proportional to their kelvin (absolute) temperature. At the Moon’s equator, how many times the night-time value is the daytime average kinetic energy of the same gas molecules?`],
      choices:[[S`31/23`,S`31/23`],
        [S`304/296`,S`304/296`],
        [S`121/133`,S`121/133`],
        [S`394/403`,S`394/403`],
        [S`394/140`,S`394/140`]],
      key:'E',rate:65,shares:[4, 9, 14, 8, 65],
      hint:[S`「正比於克氏溫度」：攝氏溫度要先換成什麼？注意月球夜間溫度的正負號。`,S`“Proportional to the kelvin temperature”: what must the Celsius values be converted to first? Watch the sign of the Moon’s night-time temperature.`],
      hands:[S`調溫度看分子跑多快`,S`Set the temperature, watch the molecules`],mid:'solve',
      caption:[S`表 1：赤道日夜均溫`,S`Table 1: equator day and night temperatures`],
      focus:/克氏|絕對溫度|273|平均動能|正比|攝氏|kelvin|absolute|average kinetic|proportional|Celsius/i
    },
    18:{
      title:[S`月球核反應器`,S`A reactor on the Moon`],lab:'radioactive-decay',labName:[S`放射性衰變與半衰期`,S`Radioactive decay and half-life`],figs:'fig7',
      group:['第 17–18 題題組','Passage for questions 17–18'],passage:P17,
      ask:[S`假設圖 7 中鈾核、氪核、鋇核及中子的質量分別為 \(M_{\mathrm{U}}\)、\(M_{\mathrm{Kr}}\)、\(M_{\mathrm{Ba}}\) 及 \(M_{\mathrm{n}}\)，核反應發生頻率控制為 \(R_{\mathrm{N}}\)（即每秒發生核反應的次數）。已知該核反應前後質量損失為 \(\Delta m=3.3\times10^{-28}\ \mathrm{kg}\)，光速為 \(c=3\times10^{8}\ \mathrm{m/s}\)，則下列有關該 SMR 發電的敘述，何者正確？`,S`Let the masses of the uranium nucleus, krypton nucleus, barium nucleus and neutron in Figure 7 be \(M_{\mathrm{U}}\), \(M_{\mathrm{Kr}}\), \(M_{\mathrm{Ba}}\) and \(M_{\mathrm{n}}\). The reaction rate is held at \(R_{\mathrm{N}}\) (the number of reactions per second). The mass lost in the reaction is \(\Delta m=3.3\times10^{-28}\ \mathrm{kg}\), and the speed of light is \(c=3\times10^{8}\ \mathrm{m/s}\). Which statement about the SMR’s power generation is correct?`],
      choices:[[S`\(\Delta m=M_{\mathrm{U}}-(M_{\mathrm{Kr}}+M_{\mathrm{Ba}})\)`,S`\(\Delta m=M_{\mathrm{U}}-(M_{\mathrm{Kr}}+M_{\mathrm{Ba}})\)`],
        [S`\(E_{\mathrm{N}}=\Delta m\times c\)`,S`\(E_{\mathrm{N}}=\Delta m\times c\)`],
        [S`\(E_{\mathrm{N}}\) 約為 \(3\times10^{-8}\ \mathrm{J}\)`,S`\(E_{\mathrm{N}}\) is about \(3\times10^{-8}\ \mathrm{J}\).`],
        [S`\(R_{\mathrm{N}}=\dfrac{P_{\mathrm{e}}\times33\%}{E_{\mathrm{N}}}\)`,S`\(R_{\mathrm{N}}=\dfrac{P_{\mathrm{e}}\times33\%}{E_{\mathrm{N}}}\)`],
        [S`\(R_{\mathrm{N}}\) 約為 \(3\times10^{19}\ \mathrm{Hz}\)`,S`\(R_{\mathrm{N}}\) is about \(3\times10^{19}\ \mathrm{Hz}\).`]],
      key:'E',rate:21,shares:[15, 19, 16, 29, 22],
      hint:[S`質量損失要把反應前後所有粒子都算進去；質能關係裡的 c 是幾次方？效率是「電能÷核能」，別把它乘反了。`,S`The mass loss must count every particle before and after the reaction — and what power of c appears in mass–energy equivalence? Efficiency is electrical energy ÷ nuclear energy; don’t apply it the wrong way round.`],
      hands:[S`算每秒分裂幾次`,S`Count fissions per second`],mid:'solveE',
      caption:[S`圖 7：鈾核分裂`,S`Figure 7: uranium fission`],
      focus:/質量|質能|核能|電能|效率|每秒|次|焦耳|瓦特|mass|nuclear|electric|efficiency|per second|joule|watt/i
    },
    47:{
      title:[S`汞原子的能階`,S`Mercury energy levels`],lab:'hydrogen-spectrum',labName:[S`氫原子能階與光譜`,S`Hydrogen energy levels and spectra`],figs:'fig17',
      group:['第 47–49 題題組','Passage for questions 47–49'],passage:P47,
      ask:[S`關於圖 17 汞原子能階之間的躍遷，下列何者可以發出波長為 365 nm 的 UV 光波？`,S`Of the transitions between the mercury energy levels in Figure 17, which one can emit UV light of wavelength 365 nm?`],
      choices:[[S`\(E_1\to E_3\)`,S`\(E_1\to E_3\)`],
        [S`\(E_1\to E_4\)`,S`\(E_1\to E_4\)`],
        [S`\(E_2\to E_4\)`,S`\(E_2\to E_4\)`],
        [S`\(E_2\to E_5\)`,S`\(E_2\to E_5\)`],
        [S`\(E_3\to E_4\)`,S`\(E_3\to E_4\)`]],
      key:'B',rate:64,shares:[8, 64, 14, 9, 4],
      hint:[S`放出的光子能量等於兩個能階的能量差；能階都是負值，越接近 0 越高。365 nm 的光子能量題目已經告訴你了。`,S`The emitted photon’s energy equals the difference between two levels. All the levels are negative, and closer to 0 means higher. The passage already gives the photon energy for 365 nm.`],
      hands:[S`點兩個能階看放出的光`,S`Pick two levels, see the light`],mid:'solve',
      caption:[S`圖 17：汞原子能階`,S`Figure 17: mercury energy levels`],
      focus:/能階|能量差|躍遷|光子|電子伏特|波長|level|energy difference|transition|photon|electron ?volt|wavelength/i
    },
    48:{
      title:[S`EUV 光子的能量`,S`Energy of an EUV photon`],lab:'photoelectric',labName:[S`光電效應`,S`The photoelectric effect`],figs:'fig18',
      group:['第 47–49 題題組','Passage for questions 47–49'],passage:P47,
      ask:[S`下列有關波長 \(\lambda\) 為 13.5 nm 的 EUV 光子能量 \(E\) 的敘述，哪些正確？（應選 2 項）`,S`Which statements about the energy \(E\) of an EUV photon of wavelength \(\lambda = 13.5\) nm are correct? (Choose 2.)`],
      choices:[[S`\(E=hc/\lambda\)`,S`\(E=hc/\lambda\)`],
        [S`\(E=h/\lambda\)`,S`\(E=h/\lambda\)`],
        [S`\(E=hc\lambda\)`,S`\(E=hc\lambda\)`],
        [S`\(E\) 約為 \(1.5\times10^{-17}\ \mathrm{J}\)`,S`\(E\) is about \(1.5\times10^{-17}\ \mathrm{J}\).`],
        [S`\(E\) 約為 \(5\times10^{-44}\ \mathrm{J}\)`,S`\(E\) is about \(5\times10^{-44}\ \mathrm{J}\).`]],
      key:'AD',rate:64,full:53,shares:[70, 15, 12, 71, 16],
      hint:[S`光子能量 \(E=hf\)；頻率和波長、光速有什麼關係？代數字時注意 nm 是 10 的幾次方公尺。`,S`A photon’s energy is \(E=hf\). How is the frequency related to the wavelength and the speed of light? When you plug in numbers, remember what power of ten metres a nanometre is.`],
      hands:[S`調波長看光子能量`,S`Set the wavelength, see the photon energy`],mid:'solve',
      caption:[S`圖 18：EUV 微影的反射鏡`,S`Figure 18: mirrors in EUV lithography`],
      focus:/普朗克|光速|波長|光子能量|單位|焦耳|Planck|speed of light|wavelength|photon energy|unit|joule/i
    },
    49:{
      title:[S`EUV 多層膜反射鏡`,S`The EUV multilayer mirror`],lab:'thin-film',labName:[S`薄膜干涉（肥皂膜、空氣劈與牛頓環）`,S`Thin-film interference`],figs:'fig19',
      group:['第 47–49 題題組','Passage for questions 47–49'],passage:P47,
      ask:[S`圖 19（a）示意運用重複的薄膜單元以加強 EUV 反射效率。每一個單元包含兩層，分別為快、慢波速介質。依據上述回答下列各問題。`,S`Figure 19(a) shows how repeated thin-film units raise the EUV reflectivity. Each unit has two layers, a fast-wave medium and a slow-wave medium. Based on the above, answer the following.`],
      fields:[
        {label:['(a) \\(\\mathrm{R_3}\\) 和 \\(\\mathrm{R_2}\\) 的相位','(a) Phase of \\(\\mathrm{R_3}\\) relative to \\(\\mathrm{R_2}\\)'],options:[['in',['同相：波峰對波峰、波谷對波谷','In phase: crest on crest, trough on trough']],['anti',['反相：波峰對波谷','Out of phase: crest on trough']],['quarter',['錯開四分之一波長','Shifted by a quarter wavelength']]]},
        {label:['(a) \\(\\mathrm{R_3}\\) 的振幅','(a) Amplitude of \\(\\mathrm{R_3}\\)'],options:[['less',['比 \\(\\mathrm{R_2}\\) 略小','Slightly smaller than \\(\\mathrm{R_2}\\)']],['same',['和 \\(\\mathrm{R_2}\\) 一樣','The same as \\(\\mathrm{R_2}\\)']],['more',['比 \\(\\mathrm{R_2}\\) 大','Larger than \\(\\mathrm{R_2}\\)']]]},
        {label:['(b) 反射線','(b) Reflected ray'],options:[['eq',['反射角＝入射角（與法線夾 30°）','Angle of reflection = angle of incidence (30° from the normal)']],['more',['反射角大於入射角','Angle of reflection larger than incidence']],['less',['反射角小於入射角','Angle of reflection smaller than incidence']]]},
        {label:['(b) 折射線','(b) Refracted ray'],options:[['iface',['比原路徑偏近界面（偏離法線）','Closer to the interface than the original path (away from the normal)']],['normal',['比原路徑偏近法線','Closer to the normal than the original path']],['straight',['沿原路徑直走','Straight along the original path']]]}
      ],
      fieldNote:['(a) 相位、振幅都對給 2 分；(b) 反射線 1 分、折射線 1 分。','(a) Phase and amplitude both right: 2 points. (b) Reflected ray 1 point, refracted ray 1 point.'],
      gradeNote:['這是網頁練習分數：原卷要在方格紙與極坐標圖上作圖；這裡只檢查你選的相位、振幅與兩條光線。','This is a practice score. The real exam asks you to draw on the grids; here only your choices are checked.'],
      async grade(fields){const [ph,amp,refl,refr]=fields.map(f=>f.value),a=ph==='in'&&amp==='less';return {parts:[a,refl==='eq'&&refr==='iface'],score:(a?2:0)+(refl==='eq'?1:0)+(refr==='iface'?1:0)};},
      marking:[S`(a) 2 分：所繪 \(\mathrm{R_3}\) 的圖形與 \(\mathrm{R_2}\) 相位相同（波峰對齊波峰、波谷對齊波谷），且振幅略小（波峰與波谷不可碰到上下虛線），即得滿分。(b) 2 分：反射線的反射角＝入射角，得 1 分；折射線比原來光線路徑更偏近界面（介於原路徑延長的虛線與界面之間），得 1 分。`,S`(a) 2 points: full marks if the sketched \(\mathrm{R_3}\) is in phase with \(\mathrm{R_2}\) (crest over crest, trough over trough) and has a slightly smaller amplitude (its crests and troughs must not reach the upper and lower dashed lines). (b) 2 points: 1 point for a reflected ray whose angle of reflection equals the angle of incidence; 1 point for a refracted ray bent closer to the interface than the original path (lying between the dashed extension of the original path and the interface).`],
      hint:[S`要讓各層反射光互相加強，\(\mathrm{R_3}\) 的波峰要對齊什麼？光從慢波速介質進入快波速介質時，折射角比入射角大還是小？`,S`For the reflections from different layers to reinforce one another, what must the crests of \(\mathrm{R_3}\) line up with? Going from the slow-wave medium into the fast-wave medium, is the angle of refraction larger or smaller than the angle of incidence?`],
      hands:[S`調 R3 的相位與振幅`,S`Tune the phase and size of R3`],mid:'solveA',
      caption:[S`圖 19：多層膜反射鏡`,S`Figure 19: the multilayer mirror`],
      focus:/同相|反相|振幅|建設性|破壞性|入射角|反射角|折射|法線|界面|in phase|out of phase|amplitude|constructive|destructive|incidence|reflection|refract\w*|normal|interface/i
    },
    52:{
      title:[S`潮汐發電`,S`Tidal power`],lab:'tides',labName:[S`潮汐：月球、太陽與兩個潮汐隆起`,S`Tides: the Moon, the Sun and two bulges`],figs:'fig20',
      group:['第 50–53 題題組','Passage for questions 50–53'],passage:P52,
      ask:[S`若設置圖 20 的水車發電機系統之海域每日有二次漲潮，平均每一次漲潮時經過水車發電機系統通道的海水體積 \(V\) 約為 \(2.5\times10^{6}\ \mathrm{m^3}\)，這些海水因為漲潮而被抬升的平均高度 \(h\) 約為 \(4\ \mathrm{m}\)。取重力加速度 \(g=10\ \mathrm{m/s^2}\)，1 度電能 \(=1\ \mathrm{kWh}=3.6\times10^{6}\ \mathrm{J}\)，海水密度 \(\rho\) 約為 \(10^{3}\ \mathrm{kg/m^3}\)。假設該設施將海水的重力位能轉為電能的效率約為 25%，則下列敘述哪些正確？（應選 2 項）`,S`Suppose the sea where the water-turbine generator of Figure 20 is installed has two flood tides a day. On average, the volume \(V\) of seawater passing through the generator channel on each flood tide is about \(2.5\times10^{6}\ \mathrm{m^3}\), and the tide raises this water by an average height \(h\) of about \(4\ \mathrm{m}\). Take \(g=10\ \mathrm{m/s^2}\), 1 unit (dù) of electricity \(=1\ \mathrm{kWh}=3.6\times10^{6}\ \mathrm{J}\), and seawater density \(\rho\) about \(10^{3}\ \mathrm{kg/m^3}\). If the facility converts the seawater’s gravitational potential energy into electrical energy with an efficiency of about 25%, which statements are correct? (Choose 2.)`],
      choices:[[S`平均每一次漲潮，進入該水車發電機系統的海水重力位能增加 \(\rho gh\)`,S`On each flood tide, on average, the gravitational potential energy of the seawater entering the generator system increases by \(\rho gh\).`],
        [S`平均每一次退潮，該水車發電機系統轉換海水重力位能的數量級為百萬焦耳`,S`On each ebb tide, on average, the gravitational potential energy the system converts is of the order of a million joules.`],
        [S`該海域每年漲潮次數約為 365 次`,S`This sea has about 365 flood tides a year.`],
        [S`該水車發電機系統每年產生電能約為 \(10^{7}\) 度`,S`The generator system produces about \(10^{7}\) kWh of electricity a year.`],
        [S`該水車發電機系統的運作機制牽涉萬有引力的作用與電磁感應`,S`The way the generator system works involves both universal gravitation and electromagnetic induction.`]],
      key:'DE',rate:38,full:18,shares:[30, 40, 13, 50, 61],
      hint:[S`先算一次漲潮的位能 \(mgh\)，海水質量＝密度×體積。一天有幾次漲潮、幾次退潮？兩者都發電，一年共幾次？`,S`First find the potential energy for one tide, \(mgh\), with mass = density × volume. How many flood and ebb tides are there each day? Both generate power — so how many times a year?`],
      hands:[S`調潮差與效率算發電量`,S`Set tide height and efficiency`],mid:'solveD',
      caption:[S`圖 20：海灣口堤壩`,S`Figure 20: the dam across the bay`],
      focus:/位能|密度|體積|漲潮|退潮|度|效率|萬有引力|電磁感應|potential|density|volume|flood|ebb|kWh|efficiency|gravitation|induction/i
    },
    53:{
      title:[S`磁鐵穿過線圈`,S`A magnet through a coil`],lab:'faraday',labName:[S`法拉第定律與冷次定律`,S`Faraday’s law and Lenz’s law`],figs:'fig22',
      group:['第 50–53 題題組','Passage for questions 50–53'],passage:P52,
      ask:[S`某同學用手帶動磁鐵相對於線圈運動，以模擬潮汐驅動圖 21 發電設施中磁鐵相對於線圈的運動，如圖 22 所示，並將線圈串接檢流計 G。圖 22 中線圈與導線所標示的箭號，亦即電流由下往上流經檢流計的方向，取為正；並取線圈中點為位置 \(z\) 的原點，且 \(z\) 向上為正。
該同學今將磁鐵從線圈下方，自靜止加速上提使磁鐵速度越來越快地穿過線圈。然後從錄影分析磁鐵位置 \(z\) 與感應電流 \(I\)，表 10 僅列出磁鐵在線圈外部的測量結果。
表 10　\(\begin{array}{c|cccc}|z|\ (\mathrm{cm}) & 5 & 10 & 15 & 20\\ \hline |I|\ (\mathrm{mA}) & 3.40 & 2.10 & 0.95 & 0.43\\ |I|\ (\mathrm{mA}) & 4.30 & 2.70 & 1.20 & 0.54\end{array}\)
（\(|z|<5\ \mathrm{cm}\) 時磁鐵一部分在線圈之內，原表這一欄不列數值。）`,S`To imitate how the tide moves the magnet relative to the coil in the generator of Figure 21, a student moves a magnet by hand relative to a coil, as shown in Figure 22, with the coil connected in series with a galvanometer G. The direction of the arrows on the coil and wire in Figure 22 — current flowing upward through the galvanometer — is taken as positive. The midpoint of the coil is the origin of position \(z\), with \(z\) positive upward.
The student now lifts the magnet from below the coil, starting from rest and speeding up, so that it passes through the coil faster and faster. The magnet’s position \(z\) and the induced current \(I\) are then analysed from a video; Table 10 lists only the measurements taken while the magnet was outside the coil.
Table 10　\(\begin{array}{c|cccc}|z|\ (\mathrm{cm}) & 5 & 10 & 15 & 20\\ \hline |I|\ (\mathrm{mA}) & 3.40 & 2.10 & 0.95 & 0.43\\ |I|\ (\mathrm{mA}) & 4.30 & 2.70 & 1.20 & 0.54\end{array}\)
(For \(|z|<5\ \mathrm{cm}\) part of the magnet is inside the coil; the original table gives no values there.)`],
      fields:[
        {label:['(a) \\(z<0\\) 時的電流','(a) Current when \\(z<0\\)'],options:[['neg',['\\(I<0\\)','\\(I<0\\)']],['pos',['\\(I>0\\)','\\(I>0\\)']]]},
        {label:['(a) 理由','(a) Reason'],options:[['lenz',['N 極靠近，線圈內向上的磁通量增加；感應電流要產生向下的磁場抵抗，和箭號方向相反','The N pole approaches, so the upward flux in the coil increases; the induced current makes a downward field to oppose it, against the arrows']],['arrow',['電流沿著圖上箭號的方向流','The current flows along the arrows in the figure']],['repel',['磁鐵被線圈往下推，所以電流為負','The coil pushes the magnet down, so the current is negative']]]},
        {label:['(b) 量值較大的一列屬於','(b) The row with larger currents belongs to'],options:[['up',['\\(z>0\\)','\\(z>0\\)']],['down',['\\(z<0\\)','\\(z<0\\)']]]},
        {label:['(b) 理由','(b) Reason'],options:[['fast',['磁鐵越來越快，同一個 \\(|z|\\) 在上方時速率較大，磁通量變化率較大','The magnet keeps speeding up, so at the same \\(|z|\\) it moves faster above the coil and the flux changes faster']],['near',['磁鐵在上方時離檢流計比較近','Above the coil the magnet is closer to the galvanometer']],['pole',['在上方時是 N 極對著線圈，磁場比較強','Above the coil the N pole faces it, so the field is stronger']]]},
        {label:['(c) 8 個點畫在哪裡','(c) Where the 8 points go'],options:[['q13',['第 1、3 象限；同一個 \\(|z|\\)，第 1 象限的點離橫軸較遠','Quadrants 1 and 3; at the same \\(|z|\\), the quadrant-1 point is farther from the axis']],['q31',['第 1、3 象限；同一個 \\(|z|\\)，第 3 象限的點離橫軸較遠','Quadrants 1 and 3; at the same \\(|z|\\), the quadrant-3 point is farther from the axis']],['q24',['第 2、4 象限','Quadrants 2 and 4']]]}
      ],
      fieldNote:['(a) 正負與理由都對給 1 分；(b) 列與理由都對給 1 分；(c) 選對給 2 分。','(a) Sign and reason both right: 1 point. (b) Row and reason both right: 1 point. (c) Right choice: 2 points.'],
      gradeNote:['這是網頁練習分數：原卷要寫理由、在方格紙上描點；這裡只檢查你選的答案與理由。','This is a practice score. The real exam asks you to explain and plot; here only your choices are checked.'],
      async grade(fields){const v=fields.map(f=>f.value),a=v[0]==='neg'&&v[1]==='lenz',b=v[2]==='up'&&v[3]==='fast',c=v[4]==='q13';return {parts:[a,b,c],score:(a?1:0)+(b?1:0)+(c?2:0)};},
      marking:[S`(a) 1 分：依冷次定律與法拉第感應定律，磁鐵 N 極的磁場（磁通量、磁力線數量）進入線圈漸增，線圈的感應電流產生抗衡磁場（線圈產生的磁場 N 極向下），故感應電流與圖 22 中電流反向，\(I<0\)。理由合理正確即得分。(b) 1 分：磁鐵加速上升，在 \(|z|\) 相同的位置（例如 \(z=5\) cm 與 \(z=-5\) cm），磁鐵在線圈上方的速率大於在下方，磁通量的時變率較大，感應電流也較大，所以量值較大的一列屬於 \(z>0\)。(c) 2 分：8 個點分布在第 1、3 象限，且在 \(|z|\) 相同的位置，量值較大的點在第 1 象限，即得滿分（\(z>0\)：4.30、2.70、1.20、0.54 mA；\(z<0\)：−3.40、−2.10、−0.95、−0.43 mA）。`,S`(a) 1 point: by Lenz’s law and Faraday’s law, the field (flux, number of field lines) of the magnet’s N pole entering the coil increases, so the induced current sets up an opposing field (the coil’s own N pole points down). The current therefore flows opposite to the arrows in Figure 22: \(I<0\). Any sound, correct reason earns the point. (b) 1 point: the magnet speeds up as it rises, so at the same \(|z|\) (e.g. \(z=5\) cm and \(z=-5\) cm) it moves faster above the coil than below it; the flux changes faster and the induced current is larger, so the larger row belongs to \(z>0\). (c) 2 points: full marks if the 8 points lie in the 1st and 3rd quadrants and, at the same \(|z|\), the larger magnitude is in the 1st quadrant (\(z>0\): 4.30, 2.70, 1.20, 0.54 mA; \(z<0\): −3.40, −2.10, −0.95, −0.43 mA).`],
      hint:[S`磁鐵由下往上靠近時，穿過線圈的磁通量怎麼變？冷次定律說感應電流要做什麼？磁鐵越跑越快，線圈上下兩邊哪一邊的磁通量變得比較快？`,S`As the magnet approaches from below, how does the flux through the coil change, and what does Lenz’s law say the induced current must do? The magnet keeps speeding up — on which side of the coil does the flux change faster?`],
      hands:[S`把磁鐵加速上提，畫出 I–z`,S`Lift the magnet faster and faster; plot I–z`],mid:'solveC',
      caption:[S`圖 22：磁鐵穿過線圈`,S`Figure 22: a magnet through a coil`],
      focus:/磁通量|增加|減少|冷次|感應|加速|速率|象限|flux|increas\w*|decreas\w*|Lenz|induced|faster|speed|quadrant/i
    }
  };
  for(const n of Object.keys(questions)){questions[n].file=true;if(questions[n].figs)questions[n].phoneArt=true;}
  const wanted=new URLSearchParams(location.search).get('q');
  const number=Object.hasOwn(questions,wanted)?Number(wanted):10;
  const add=(n,data)=>Object.assign(questions[n],data);
  return {number,question:questions[number],questions,add,year:115};
})();
window.ExamPaper=window.Exam115;
