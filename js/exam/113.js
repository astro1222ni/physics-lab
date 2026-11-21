/* 113 學測自然物理 12 題：原卷題目與中英對照（數學式用 KaTeX）。每題的畫面、動手與字幕在 js/exam/113/q<N>.js。 */
window.ExamTracks = window.ExamTracks || {};
window.Exam113 = (() => {
  const S=String.raw;
  const P22=[[S`高能的粒子束或 X 光束可用於治療惡性腫瘤（癌症）。每單位質量的人體組織所吸收的射束能量稱為吸收劑量。射束通常對準腫瘤照射，癌細胞與正常細胞吸收射束的能量後，DNA 會遭到破壞，而癌細胞死亡的機率較正常細胞為高。`,
    S`High-energy particle beams or X-ray beams can be used to treat malignant tumors (cancer). The beam energy absorbed per unit mass of body tissue is called the absorbed dose. A beam is usually aimed at the tumor; after cancer cells and normal cells absorb its energy, their DNA is damaged, and cancer cells are more likely to die than normal cells.`],
   [S`圖 8 顯示的是電子、質子、和兩個能量不同的 X 光等四種射束之吸收劑量隨進入表皮深度的變化。圖中各射束名稱下，註明該射束中單一粒子或光子入射人體時的能量，其中 \(1.0\ \mathrm{MeV}\) 約為 \(1.6\times10^{-13}\ \mathrm{J}\)。`,
    S`Figure 8 shows how the absorbed dose of four beams — electrons, protons and X-rays of two different energies — varies with depth below the skin. Under each beam’s name is the energy of a single particle or photon entering the body; \(1.0\ \mathrm{MeV}\) is about \(1.6\times10^{-13}\ \mathrm{J}\).`]];
  const P24=[[S`電冰箱的操作原理是利用低溫的冷媒來冷卻冰箱裡的食物，再用壓縮機壓縮吸收熱能後的冷媒，提高其溫度，以利於其後之散熱過程。冷媒經散熱片把熱能釋放到周遭空氣中後，經過降溫、降壓又可以用來冷卻冰箱裡的食物，如此構成冷卻的循環，而循環過程會消耗電能。`,
    S`A refrigerator uses a cold refrigerant to cool the food inside. A compressor then compresses the refrigerant that has absorbed heat, raising its temperature so it can release heat afterwards. After the refrigerant gives its heat to the surrounding air through the cooling fins, it is cooled and depressurized and can cool the food again. This forms a cooling cycle, and the cycle consumes electrical energy.`]];
  const P26=[[S`汽車的安全系統判斷車身受到撞擊而急遽減速時，裝在方向盤裡的安全氣囊即會充氣彈出，透過內部氣體的緩衝，配合安全帶的作用，來降低駕駛人受到的衝擊力。`,
    S`When a car’s safety system detects a collision and a sudden deceleration, the airbag in the steering wheel inflates. The cushion of gas inside, together with the seat belt, reduces the impact force on the driver.`],
   [S`圖 9 為一款汽車安全氣囊的充氣壓力與充氣時間的關係圖（\(100\ \mathrm{kPa}\) 大約為 1 大氣壓）。在駕駛人撞擊到安全氣囊前，必須要有足夠的時間讓安全氣囊至少充氣達飽和壓力的一半以上，才能藉由緩衝達到保護駕駛人的效果。依據上述文字與圖 9，回答第 26～27 題。`,
    S`Figure 9 shows the inflation pressure of a car airbag against inflation time (\(100\ \mathrm{kPa}\) is about 1 atmosphere). Before the driver hits the airbag, there must be enough time for it to reach at least half of its saturation pressure; only then can it cushion and protect the driver. Use the text and Figure 9 to answer questions 26–27.`]];
  const P44=[[S`如圖 18 所示，一金屬導線製成的線圈迴路固定不動，迴路中有一電阻 \(R\)。迴路左側環圈甲的正上方有一下端為 S 極的細長磁鐵棒。假設磁鐵棒的磁力線僅穿過環圈甲，且迴路中金屬導線的電阻可忽略。`,
    S`As shown in Figure 18, a circuit made of metal wire is fixed in place and contains a resistor \(R\). Directly above loop A on the left of the circuit is a long, thin bar magnet whose lower end is an S pole. Assume the magnet’s field lines pass only through loop A, and the resistance of the wire itself is negligible.`]];
  const questions={
    19:{
      title:['核能發電','Nuclear power'],lab:'radioactive-decay',labName:['放射性衰變與半衰期','Radioactive decay and half-life'],
      ask:[S`臺灣目前的核能電廠利用核燃料以發電，全部過程中主要牽涉到以下哪些形式的能量轉換與反應？（應選 3 項）`,
        S`Taiwan’s nuclear power plants use nuclear fuel to generate electricity. Which forms of energy conversion and reaction are mainly involved in the whole process? Choose three.`],
      choices:[['質能轉換','Mass–energy conversion'],['聲能轉電能','Sound energy to electrical energy'],['熱能轉動能','Thermal energy to kinetic energy'],['核融合','Nuclear fusion'],['核分裂','Nuclear fission']],
      key:'ACE',rate:75,full:67,shares:[93,3,88,29,86],
      hint:['從鈾原子核開始，一路追到插座：能量先從哪裡來、變成什麼、再推動什麼？電廠用的是把大原子核打碎，還是把小原子核黏起來？','Follow the energy from the uranium nucleus to the socket: where does it come from, what does it become, what does it drive? Does the plant split big nuclei or join small ones?'],
      hands:['排出能量鏈','Build the energy chain'],mid:'solve',
      caption:['核能電廠：從原子核到插座','A nuclear plant: from the nucleus to the socket'],
      focus:/核分裂|核融合|質能轉換|質量|熱能|動能|電能|渦輪|發電機|fission|fusion|mass–energy|mass|heat|kinetic energy|electrical energy|turbine|generator/i
    },
    20:{
      title:['四種基本交互作用','Fundamental interactions'],lab:'radioactive-decay',labName:['放射性衰變與半衰期','Radioactive decay and half-life'],
      ask:[S`下列關於基本交互作用的敘述，哪些正確？（應選 2 項）`,S`Which statements about the fundamental interactions are correct? Choose two.`],
      choices:[['基本交互作用中，僅有重力的作用範圍可達無窮遠，故為星系形成的主要原因','Of the fundamental interactions, only gravity has an infinite range, so it is the main reason galaxies form.'],
        ['電子繞著原子核運動，主要是因為重力','Electrons move around the nucleus mainly because of gravity.'],
        ['單獨的中子可藉由弱力衰變為質子、電子和其他粒子','A free neutron can decay through the weak interaction into a proton, an electron and other particles.'],
        ['弱力與強力的作用範圍比原子的尺度還小','The ranges of the weak and strong interactions are smaller than the size of an atom.'],
        ['質子與中子間有強力，但中子與中子間並沒有強力','There is a strong force between a proton and a neutron, but none between two neutrons.']],
      key:'CD',rate:62,full:50,shares:[21,13,74,75,20],
      hint:['電力跟重力一樣都是平方反比，範圍都到無窮遠；那 A 的「僅有」對嗎？強力在乎粒子帶不帶電嗎？','The electric force, like gravity, is inverse-square with infinite range. So is A’s “only” right? Does the strong force care about charge?'],
      hands:['拉遠距離比四種力','Pull apart and compare the forces'],mid:'solve',
      caption:['四種基本交互作用的作用範圍','The ranges of the four fundamental interactions'],
      focus:/重力|電磁力|電力|強力|弱力|無窮遠|平方成反比|衰變|中子|質子|電中性|gravity|electromagnet\w*|electric force|strong force|weak force|infinite|inverse|decay|neutron|proton|neutral/i
    },
    21:{
      title:['眼睛與相機的成像','Eyes and cameras'],lab:'lens-mirror',labName:['透鏡與面鏡成像','Images in lenses and mirrors'],figs:'fig7',
      ask:[S`眼球的主要結構及成像原理，和相機類似，如圖 7 所示。光進入眼球時，會經過「角膜」、「瞳孔」與「水晶體」，「瞳孔」如同相機的光圈，可縮放以控制進光量的多寡；而「角膜」與「水晶體」如同相機鏡頭中的透鏡。最後成像在「視網膜」，如同相機的感光元件。下列敘述，何者正確？`,
        S`The structure of the eye and the way it forms images are similar to a camera, as shown in Figure 7. Light entering the eye passes through the cornea, the pupil and the lens. The pupil works like the camera’s aperture, opening and closing to control how much light enters, while the cornea and the lens work like the lenses in a camera lens. The image finally forms on the retina, like the camera’s image sensor. Which statement is correct?`],
      choices:[['進入眼球的光可在視網膜上成像，主要由於干涉現象','Light entering the eye forms an image on the retina mainly because of interference.'],
        ['物體成像在視網膜的前方或後方，可配戴凹透鏡或凸透鏡來矯正，主要是利用光的繞射現象','When the image forms in front of or behind the retina, concave or convex lenses can correct it, mainly by using diffraction of light.'],
        ['若遠處物體的成像位置在相機的感光元件之前，可改用感光程度更高的元件，使影像由模糊變為清晰','If a distant object’s image forms in front of the camera’s sensor, switching to a more sensitive sensor makes the blurry image sharp.'],
        ['遠方物體在照相機感光元件上形成倒立實像，在眼睛的視網膜上也是形成倒立實像','A distant object forms an inverted real image on a camera’s sensor, and also an inverted real image on the eye’s retina.'],
        ['若成像模糊，照相機是調整鏡頭與感光元件的距離，而眼睛則只靠縮放瞳孔，使成像清晰','To fix a blurry image, a camera changes the distance between lens and sensor, while the eye only opens or closes the pupil.']],
      key:'D',rate:50,shares:[3,7,19,51,22],
      hint:['瞳孔管的是「多亮」還是「多清楚」？眼睛要改變清楚程度，改的是水晶體的什麼？','Does the pupil control brightness or sharpness? To change sharpness, what does the eye change about its lens?'],
      hands:['幫眼睛對焦','Focus the eye'],mid:'solve',
      caption:['圖 7：眼睛與相機','Figure 7: the eye and the camera'],
      focus:/瞳孔|光圈|水晶體|睫狀肌|焦距|折射|倒立|實像|視網膜|感光|看遠|pupil|aperture|lens|ciliary|focal length|refraction|inverted|real image|retina|sensor|far away/i
    },
    22:{
      title:['射束的粒子與光子','Particles and photons in the beams'],lab:'photoelectric',labName:['光電效應','The photoelectric effect'],
      group:['第 22–23 題題組','Passage for questions 22–23'],passage:P22,open:true,figs:'fig8',
      ask:[S`關於上述四種射束的敘述，下列哪些正確？（應選 2 項）`,S`Which statements about the four beams are correct? Choose two.`],
      choices:[[S`質子射束的粒子與 \(\alpha\) 射線的粒子相同`,S`The particles in the proton beam are the same as the particles of \(\alpha\) rays.`],
        ['質子束的粒子數密度必為電子束粒子數密度的 37.5 倍','The particle number density of the proton beam must be 37.5 times that of the electron beam.'],
        [S`\(20\ \mathrm{MeV}\) 之 X 光的光子頻率為 \(4\ \mathrm{MeV}\) 之 X 光的光子頻率的 5 倍`,S`The photon frequency of the \(20\ \mathrm{MeV}\) X-ray is 5 times that of the \(4\ \mathrm{MeV}\) X-ray.`],
        [S`\(150\ \mathrm{MeV}\) 之質子的速率和 \(4\ \mathrm{MeV}\) 之光子的速率相同`,S`A \(150\ \mathrm{MeV}\) proton has the same speed as a \(4\ \mathrm{MeV}\) photon.`],
        ['四種射束中，只有 X 光束能夠穿透 15 公分厚的細胞組織','Of the four beams, only the X-ray beams can pass through 15 cm of tissue.']],
      key:'CE',rate:47,full:31,shares:[22,22,54,26,66],
      hint:['圖上寫的能量是「一顆」粒子的，還是「一整束」的？光子能量 E = hf，能量變 5 倍，頻率變幾倍？看圖 8 在 15 公分處還有哪幾條曲線。','Is the energy on the graph for one particle or for the whole beam? With E = hf, if the energy is 5 times larger, what about the frequency? Which curves are still above zero at 15 cm?'],
      hands:['15 公分探針','Probe at 15 cm'],mid:'solve',
      caption:['圖 8：四種射束的吸收劑量','Figure 8: absorbed dose of four beams'],
      focus:/一顆|頻率|光子|光速|質量|阿爾法|α|氦|15 公分|能量|強度|one particle|frequency|photon|speed of light|mass|alpha|helium|15 cm|energy|intensity/i
    },
    23:{
      title:['深度與吸收劑量','Depth and absorbed dose'],lab:'radioactive-decay',labName:['放射性衰變與半衰期','Radioactive decay and half-life'],
      group:['第 22–23 題題組','Passage for questions 22–23'],passage:P22,open:true,figs:'fig8',
      ask:[S`若有癌細胞存在於表皮下某處，則依據上面所提供的資訊，下列敘述哪些可以達到「儘量殺除癌細胞、保留正常細胞」的最佳效果？（應選 2 項）`,
        S`Suppose cancer cells lie somewhere below the skin. Based on the information above, which choices best achieve “kill as many cancer cells as possible while sparing normal cells”? Choose two.`],
      choices:[['癌細胞在表皮下 10 公分處，應使用電子束','Cancer cells 10 cm below the skin: use the electron beam.'],
        ['癌細胞在表皮下 10 至 11 公分處，應使用質子束','Cancer cells 10 to 11 cm below the skin: use the proton beam.'],
        [S`癌細胞在表皮下 0 至 2 公分處，應使用 \(4\ \mathrm{MeV}\) 之 X 光束`,S`Cancer cells 0 to 2 cm below the skin: use the \(4\ \mathrm{MeV}\) X-ray beam.`],
        [S`癌細胞在表皮下 2 至 10 公分處，應使用 \(20\ \mathrm{MeV}\) 之 X 光束`,S`Cancer cells 2 to 10 cm below the skin: use the \(20\ \mathrm{MeV}\) X-ray beam.`],
        ['癌細胞在表皮下 3 至 8 公分處，可以結合電子束及質子束一起使用','Cancer cells 3 to 8 cm below the skin: combine the electron and proton beams.']],
      key:'BD',rate:58,full:45,shares:[6,70,41,74,10],
      hint:['兩件事要同時成立：腫瘤那一段劑量高，腫瘤前後的正常組織劑量低。看 X 光過了 2 公分有沒有停下來。','Two things at once: a high dose where the tumor is, and a low dose in the healthy tissue before and after it. Does the X-ray stop after 2 cm?'],
      hands:['選射束打腫瘤','Pick a beam for the tumor'],mid:'solve',
      caption:['圖 8：哪一束最適合？','Figure 8: which beam fits best?'],
      focus:/布拉格峰|尖峰|正常細胞|癌細胞|腫瘤|劑量|電子束|質子束|X 光|停下來|Bragg peak|peak|healthy|tumor|dose|electron beam|proton beam|X-ray|stop/i
    },
    24:{
      title:['冰箱的冷卻循環','The refrigeration cycle'],lab:'heat-engine',labName:['熱機循環與熱力學第一定律','Heat engines and the first law of thermodynamics'],
      group:['第 24–25 題題組','Passage for questions 24–25'],passage:P24,open:true,
      ask:[S`下列有關電冰箱的敘述，哪些正確？（應選 2 項）`,S`Which statements about refrigerators are correct? Choose two.`],
      choices:[['電冰箱是利用電能作功把冰箱內的熱能轉移到冰箱外','A refrigerator uses electrical energy to do work that moves heat from inside to outside.'],
        ['電冰箱裡面的壓縮機的功能是把冷媒降溫並增加其壓力','The compressor cools the refrigerant and raises its pressure.'],
        ['於密閉隔熱室內打開空冰箱的門，通電並經長時間運轉後，平均室溫會提高','In a sealed, insulated room, if an empty refrigerator runs for a long time with its door open, the average room temperature rises.'],
        ['冷媒冷卻冰箱裡的食物時是處於低溫高壓狀態','While cooling the food, the refrigerant is cold and at high pressure.'],
        ['冷媒的溫度低於室溫仍然可以將其熱能直接傳給周遭的空氣','Even when colder than the room, the refrigerant can pass its heat directly to the surrounding air.']],
      key:'AC',rate:49,full:36,shares:[66,19,61,23,31],
      hint:['熱自己只會從熱的跑到冷的。冷媒要把熱丟給空氣，它得比空氣熱還是冷？房間密閉隔熱，電能最後跑去哪？','Heat flows on its own only from hot to cold. To give heat to the air, must the refrigerant be hotter or colder than it? In a sealed room, where does the electrical energy end up?'],
      hands:['密閉房間開冰箱','Open the fridge in a sealed room'],mid:'room',
      caption:['冰箱：把熱從裡面搬到外面','A fridge moves heat from inside to outside'],
      focus:/高溫|低溫|壓縮|冷媒|散熱|搬熱|能量守恆|電能|室溫|代價|電費|hot|cold|compress\w*|refrigerant|coils|moves heat|energy conservation|electrical energy|room temperature|price|electricity bill/i
    },
    25:{
      title:['性能係數與度電','COP and kilowatt-hours'],lab:'heat-engine',labName:['熱機循環與熱力學第一定律','Heat engines and the first law of thermodynamics'],
      group:['第 24–25 題題組','Passage for questions 24–25'],passage:P24,
      ask:[S`冰箱、冷凍庫的效率可看其性能係數，其定義為：\(\text{性能係數}=\dfrac{\text{轉移的熱能}}{\text{輸入的功}}\)。若一電冰箱性能係數為 2.5，則輸入 1.0 度電約可轉移多少熱能？（\(1\ \text{度電}=1\ \mathrm{kW}\cdot\mathrm{h}\)，輸入的功可視為輸入的電能）`,
        S`The efficiency of a refrigerator or freezer is given by its coefficient of performance, defined as \(\text{COP}=\dfrac{\text{heat moved}}{\text{work input}}\). If a refrigerator has a COP of 2.5, about how much heat can it move with 1.0 kWh of electricity? (\(1\ \text{kWh}=1\ \mathrm{kW}\cdot\mathrm{h}\); treat the work input as the electrical energy input.)`],
      choices:['3.6\\times10^{6}','7.2\\times10^{6}','9.0\\times10^{6}','1.1\\times10^{7}','1.4\\times10^{7}'].map(v=>[S`\(`+v+S`\ \mathrm{J}\)`,S`\(`+v+S`\ \mathrm{J}\)`]),
      key:'C',rate:53,shares:[14,18,53,8,7],
      hint:['先把 1 度電換成焦耳：1 千瓦用 1 小時是幾瓦乘幾秒？再乘上性能係數。','First convert 1 kWh to joules: 1 kilowatt for 1 hour is how many watts times how many seconds? Then multiply by the COP.'],
      hands:['性能係數計算器','COP calculator'],mid:'solve',
      caption:['付 1 份電，搬 2.5 份熱','Pay for one, move two and a half'],
      focus:/性能係數|度電|焦耳|3600|千瓦|搬走的熱|COP|kilowatt-hour|joules|3600|kilowatt|heat moved|heat taken/i
    },
    26:{
      title:['安全氣囊的壓力門檻','The airbag’s pressure threshold'],lab:'ideal-gas',labName:['理想氣體分子模擬','Ideal gas molecules'],
      group:['第 26–27 題題組','Passage for questions 26–27'],passage:P26,open:true,figs:'fig9',
      ask:[S`根據圖 9，開始充氣的安全氣囊，至少約需時多少，可達保護駕駛人的氣壓？`,S`According to Figure 9, at least about how long does an inflating airbag take to reach a pressure that protects the driver?`],
      choices:['10','20','30','40','50'].map(v=>[S`\(`+v+S`\ \mathrm{ms}\)`,S`\(`+v+S`\ \mathrm{ms}\)`]),
      key:'C',rate:77,shares:[1,3,77,9,9],
      hint:['題目要取一半的是壓力還是時間？先找曲線最後平平的壓力，取一半，再橫著找到曲線、往下讀時間。','Is it the pressure or the time that is halved? Find where the curve levels off, take half of that pressure, go across to the curve, then read down to the time.'],
      hands:['找半飽和壓力','Find half the saturation pressure'],mid:'solve',
      caption:['圖 9：安全氣囊的充氣壓力','Figure 9: airbag inflation pressure'],
      focus:/飽和壓力|一半|毫秒|kPa|縱軸|橫軸|至少|saturation pressure|half|ms|kPa|vertical axis|least time/i
    },
    27:{
      title:['碰撞中的定力','A constant force in a crash'],lab:'collision',labName:['一維碰撞','Collisions in one dimension'],
      group:['第 26–27 題題組','Passage for questions 26–27'],passage:P26,figs:'fig9',
      ask:[S`質量為 \(50\ \mathrm{kg}\) 的駕駛人在國道開車，以 \(108\ \mathrm{km/h}\)（即 \(30\ \mathrm{m/s}\)）的速度向東前進。假設該車在發生正面撞擊的瞬間，安全帶與車體支撐立即開始施予駕駛人一個固定的水平力，而方向盤的轉軸也立即收縮，致使方向盤向前水平移動，安全氣囊也開始充氣。若駕駛人接觸到氣囊時，其速度為 \(54\ \mathrm{km/h}\) 向東，而安全氣囊充氣恰達飽和壓力的一半，則駕駛人受到的水平定力約為多少？`,
        S`A \(50\ \mathrm{kg}\) driver is on the freeway at \(108\ \mathrm{km/h}\) (that is, \(30\ \mathrm{m/s}\)) heading east. At the instant of a head-on collision, the seat belt and the car body immediately begin to exert a constant horizontal force on the driver; the steering column also collapses at once, so the steering wheel moves forward horizontally, and the airbag starts to inflate. When the driver touches the airbag, the driver’s velocity is \(54\ \mathrm{km/h}\) east and the airbag has just reached half its saturation pressure. About how large is the constant horizontal force on the driver?`],
      choices:['150000','25000','8880','1000','250'].map(v=>[S`\(`+v+S`\ \mathrm{N}\)`,S`\(`+v+S`\ \mathrm{N}\)`]),
      key:'B',rate:51,shares:[6,51,14,14,14],
      hint:['速度從 30 降到 15 公尺每秒，花了多少時間？答案藏在第 26 題：充到飽和壓力一半要幾毫秒。毫秒要換成秒。','The speed drops from 30 to 15 m/s. How long does that take? The answer is in question 26: how many milliseconds to reach half the saturation pressure. Convert ms to s.'],
      hands:['調整緩衝時間','Change the stopping time'],mid:'story',
      caption:['30 毫秒內從 30 降到 15 公尺每秒','From 30 to 15 m/s in 30 ms'],
      focus:/毫秒|0\.03|動量|加速度|向西|兩萬五千|25000|安全帶|爭取|平均力|ms|0\.03|momentum|acceleration|west|25,000|seat belt|buy|average force/i
    },
    44:{
      title:['磁鐵穿越環圈的磁力','The force on a magnet through a loop'],lab:'faraday',labName:['法拉第定律與冷次定律','Faraday’s law and Lenz’s law'],
      group:['第 44–46 題題組','Passage for questions 44–46'],passage:P44,open:true,figs:'fig18',
      ask:[S`考慮磁鐵棒以等速度朝環圈甲移動前進，穿過環圈甲，至完全移離環圈甲的整個過程，下列敘述何者正確？`,
        S`Consider the whole process in which the bar magnet moves at constant velocity toward loop A, passes through it and moves completely away from it. Which statement is correct?`],
      choices:[['迴路產生應電流，其值隨時間增加而持續增大','An induced current flows whose value keeps increasing with time.'],
        ['迴路產生應電流，其值隨時間增加而持續減小','An induced current flows whose value keeps decreasing with time.'],
        ['迴路產生應電流，其方向恆為順時針方向','An induced current flows, always clockwise.'],
        ['迴路產生應電流，其方向恆為逆時針方向','An induced current flows, always counterclockwise.'],
        ['若迴路對移動磁鐵棒施加磁力，則其方向恆向上','If the circuit exerts a magnetic force on the moving magnet, the force is always upward.']],
      key:'E',rate:34,shares:[8,13,25,19,34],
      hint:['磁鐵靠近時穿過環圈的磁通量變多，離開時變少：電流方向會不會反過來？冷次定律說感應電流要反抗什麼？','As the magnet approaches the flux through the loop increases; as it leaves, the flux decreases. Does the current reverse? What does Lenz’s law say the induced current opposes?'],
      hands:['拖磁鐵穿過環圈','Drag the magnet through the loop'],mid:'solve',
      caption:['圖 18：磁鐵棒與線圈迴路','Figure 18: the bar magnet and the circuit'],
      focus:/冷次定律|磁通量|反抗|推|拉|向上|永動機|能量守恆|恆為|Lenz’s law|flux|oppos\w*|push|pull|upward|perpetual motion|energy conservation|always/i
    },
    45:{
      title:['感應電流的大小','The size of the induced current'],lab:'faraday',labName:['法拉第定律與冷次定律','Faraday’s law and Lenz’s law'],
      group:['第 44–46 題題組','Passage for questions 44–46'],passage:P44,figs:'fig18',
      ask:[S`磁鐵棒以等速度朝環圈甲前進，當磁鐵棒中心與環圈甲中心之距離為 \(d\) 時，迴路的應電流量值為 \(I\)。在磁鐵棒速度或迴路性質改變下，而迴路電阻仍為 \(R\)、磁鐵棒中心與環圈甲中心之距離仍為 \(d\) 時，下列敘述哪些正確？（應選 2 項）`,
        S`The bar magnet moves toward loop A at constant velocity. When the distance between the magnet’s center and loop A’s center is \(d\), the induced current has magnitude \(I\). Now the magnet’s speed or the circuit is changed, while the resistance is still \(R\) and the distance is still \(d\). Which statements are correct? Choose two.`],
      choices:[['若將環圈甲的面積增大，但磁鐵棒速度不變，則 \\(I\\) 不會改變','If loop A’s area is increased but the magnet’s speed is unchanged, \\(I\\) does not change.'],
        ['若將環圈乙的面積增大，但磁鐵棒速度不變，則 \\(I\\) 不會改變','If loop B’s area is increased but the magnet’s speed is unchanged, \\(I\\) does not change.'],
        ['若迴路完全不變，但磁鐵棒以較快速度朝環圈甲前進，則 \\(I\\) 的量值將減小','If the circuit is unchanged but the magnet moves toward loop A faster, the magnitude of \\(I\\) decreases.'],
        ['若迴路完全不變，但磁鐵棒以較快速度朝環圈甲前進，則 \\(I\\) 的量值將增大','If the circuit is unchanged but the magnet moves toward loop A faster, the magnitude of \\(I\\) increases.'],
        ['若環圈甲、乙的圈數加倍，但面積不變、且磁鐵棒速度不變，則 \\(I\\) 不會改變','If loops A and B have twice as many turns, with the same areas and the same magnet speed, \\(I\\) does not change.']],
      key:'BD',rate:60,full:48,shares:[15,67,16,72,18],
      hint:['感應電流看三件事：圈數、磁通量變得多快、電阻。每個選項改的是哪一件？乙裡面有沒有磁力線穿過？','The induced current depends on the turns, how fast the flux changes and the resistance. Which one does each choice change? Do any field lines pass through loop B?'],
      hands:['改速度、圈數、面積','Change speed, turns and area'],mid:'solve',
      caption:['圖 18：哪些改變會影響電流？','Figure 18: what changes the current?'],
      focus:/法拉第定律|圈數|變化率|電阻|磁通量|乙|變快|加倍|Faraday’s law|turns|rate of change|resistance|flux|loop B|faster|doubl\w*/i
    },
    46:{
      title:['畫出離開時的應電流','Draw the current as the magnet leaves'],lab:'faraday',labName:['法拉第定律與冷次定律','Faraday’s law and Lenz’s law'],
      group:['第 44–46 題題組','Passage for questions 44–46'],passage:P44,figs:'fig18',points:4,
      ask:[S`磁鐵棒以等速度朝環圈甲前進，在時間為 3 秒時磁鐵棒 S 極恰接觸環圈甲中心，在時間為 6 秒時磁鐵棒中心在環圈甲中心。電流以逆時針方向為正，迴路的應電流在 0～6 秒隨時間變化的曲線圖如圖 19 所示。考慮磁鐵棒從開始等速移進至完全移離環圈甲的過程，回答下列問題。
（a）試繪製出迴路在時間 6～12 秒的應電流隨時間變化的曲線圖，並以箭頭與文字註明磁鐵棒 N 極恰脫離環圈甲中心的時間點。（2 分）
（b）說明所繪應電流方向及曲線形狀的理由為何？（2 分）
（網頁版改成下面的選擇與填空；原卷是在答題卷上作圖。）`,
        S`The bar magnet moves toward loop A at constant velocity. At 3 s its S pole just reaches the center of loop A; at 6 s the magnet’s center is at the center of loop A. Counterclockwise current is positive. Figure 19 shows the induced current from 0 to 6 s. Consider the whole process from the magnet moving in to moving completely away from loop A.
(a) Draw the induced current from 6 to 12 s, and mark with an arrow and words the moment the magnet’s N pole just leaves the center of loop A. (2 points)
(b) Explain the reasons for the direction and the shape of the current you drew. (2 points)
(On this page you answer with the choices below; on the real exam you draw on the answer sheet.)`],
      fields:[
        {label:['(a) 6–12 秒的電流','(a) Current from 6 to 12 s'],options:[['pos',['一個正的尖峰','One positive peak']],['neg',['一個負的尖峰','One negative peak']],['zero',['一直是零','Zero throughout']],['both',['先正後負','Positive, then negative']]]},
        {label:['(a) 曲線的形狀','(a) Shape of the curve'],options:[['point',['和 0–6 秒對 (6 s, 0) 點對稱','Point-symmetric with 0–6 s about (6 s, 0)']],['copy',['把 0–6 秒原樣搬過去','The 0–6 s curve copied over unchanged']],['mirror',['對 6 秒的鉛直線左右翻過去（仍是負的）','Flipped about the line t = 6 s (still negative)']]]},
        {label:['(a) N 極恰脫離環圈甲中心','(a) N pole just leaves the center of loop A'],units:['s','ms']},
        {label:['(b) 方向的理由','(b) Reason for the direction'],options:[['dec',['磁鐵離開，磁通量減少；冷次定律「少了就補」，電流反向成逆時針（正）','The magnet leaves, so the flux decreases; by Lenz’s law the current reverses to counterclockwise (positive)']],['inc',['磁鐵離開，磁通量增加，電流反抗，成逆時針（正）','The magnet leaves, so the flux increases; the current opposes it and is counterclockwise (positive)']],['pole',['N 極和 S 極磁性相反，所以電流反向','The N and S poles are opposite, so the current reverses']]]}
      ],
      fieldNote:['(a) 兩格加時間都對給 2 分；(b) 選對理由給 2 分。','(a) Both choices and the time right: 2 points. (b) The right reason: 2 points.'],
      gradeNote:['這是網頁練習分數：原卷要親手作圖、寫理由；這裡只檢查你選的形狀、時間和理由。','This is a practice score. The real exam asks you to draw and explain; here only your choices, the time and the reason are checked.'],
      async grade(fields,engine){
        const [sign,shape,time,why]=fields, t=engine.numeric(time.value), s=t&&!t.unit?t.value*({s:1,ms:.001}[time.unit]??NaN):NaN;
        const a=sign.value==='pos'&&shape.value==='point'&&Math.abs(s-9)<=.3, b=why.value==='dec';
        return {parts:[a,b],score:(a?2:0)+(b?2:0)};
      },
      marking:['大考中心評分原則：(a) 6–12 秒畫出正的曲線，和 0–6 秒對 (6 秒, 0) 點對稱，並在 9 秒處用箭頭與文字標出 N 極恰脫離環圈甲中心；(b) 磁鐵移離時磁通量減少，依冷次定律，應電流轉為逆時針（正），磁鐵等速穿越，前後曲線對中心點呈點對稱。','CEEC marking: (a) a positive curve from 6 to 12 s, point-symmetric with 0–6 s about (6 s, 0), with an arrow and words marking 9 s as the moment the N pole leaves the center of loop A; (b) as the magnet leaves, the flux decreases, so by Lenz’s law the current turns counterclockwise (positive); because the magnet moves at constant speed, the two halves are point-symmetric about the center.'],
      hint:['磁鐵離開時，穿過環圈的磁通量變多還是變少？S 極 3 秒到中心、磁鐵中心 6 秒到中心，那 N 極幾秒離開中心？','As the magnet leaves, does the flux through the loop increase or decrease? The S pole reaches the center at 3 s and the magnet’s center at 6 s; when does the N pole leave it?'],
      hands:['畫出 6–12 秒','Draw 6–12 s'],mid:'mark',
      caption:['圖 19：0–6 秒的應電流','Figure 19: induced current from 0 to 6 s'],
      focus:/點對稱|對稱|逆時針|正的|9 秒|九秒|N 極|S 極|磁通量|少了就補|point-symmetric|symmetric|counterclockwise|positive|9 s|N pole|S pole|flux|makes? up/i
    }
  };
  for(const n of Object.keys(questions)){questions[n].file=true;if(questions[n].figs)questions[n].phoneArt=true;} // 有原卷圖的題目：手機也顯示圖（exam.css body[data-fig]）
  const wanted=new URLSearchParams(location.search).get('q');
  const number=Object.hasOwn(questions,wanted)?Number(wanted):19;
  const add=(n,data)=>Object.assign(questions[n],data);
  return {number,question:questions[number],questions,add,year:113};
})();
window.ExamPaper=window.Exam113;
