/* Lesson copy follows the approved beat sheet. Marks precede their spoken cue. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./phy-5-1-core.js'));
  else root.LearnUnit = factory(root.LearnPhysics);
})(globalThis, function (C) {
  'use strict';
  const segments = [
    ['引起動機','Warm-up'], ['先預測','Predict'], ['觀念：功','Work'], ['觀念：能量','Energy'],
    ['動手','Try it'], ['範例','Examples'], ['隨堂三題','Quiz'], ['小結','Recap']
  ];
  const pages = [
    {
      id: "1-1",
      title: ["舉著書包站半小時","Holding a schoolbag"],
      speech: ["上課前先問你一件事哈。你把一個四公斤的書包穩穩舉在胸前，一動也不動，在走廊上站了半小時，手痠到快斷掉了。[[zero]]結果物理老師跟你說——這半小時裡，你對書包，一焦耳的功都沒作。很不公平，對不對？","Let me ask you something before class. You hold a four-kilogram schoolbag steady in front of your chest and stand motionless in the corridor for half an hour. Your arms are about to give out. [[zero]]Then your physics teacher says that, in that whole half hour, you did not do a single joule of work on the bag. Feels unfair, doesn’t it?"],
      caption: ["手很痠，物理卻說：**作功＝0**？","Sore arms, yet physics says **zero work**?"]
    },
    {
      id: "1-2",
      title: ["拖書包的年代","Schoolbags on wheels"],
      speech: ["還有一種更常見的。我不知道你們有沒有經過那個年代哈，國小書很多，背不動，[[drag]]只好用拖的，好像空中少爺、空中小姐要去上班一樣。這時候手拉的方向，跟書包走的方向，[[angle]]並不是同一個方向。那這樣，手的拉力對書包作了多少功？今天就是要把這兩件事講清楚。","Here’s a more familiar one. I don’t know if you remember those days. In primary school, our books were too heavy to carry, so we [[drag]]towed our bags like flight attendants on their way to work. The direction your hand pulls and the direction the bag moves [[angle]]aren’t the same. How much work does your hand’s pull do on the bag? Today we’ll sort out both questions."],
      caption: ["拉的方向和走的方向**不一樣**，功怎麼算？","The pull and the motion point **different ways**. How much work?"],
      video: [26,135]
    },
    {
      id: "2-1",
      title: ["預測一","First prediction"],
      speech: ["先猜猜看，不用怕猜錯。你提著一桶水，在水平的走廊上，水桶高度不變，等速走了十公尺。[[ask]]這段路上，你的手對水桶作了多少功？","Take a guess. It’s fine to get it wrong. You carry a bucket of water ten metres down a level corridor at a constant speed and keep the bucket at the same height. [[ask]]How much work does your hand do on the bucket along the way?"],
      caption: ["提水桶**水平等速**走 10 m，手作了**多少功**？","Carry a bucket 10 m **horizontally at constant speed**. How much **work** does your hand do?"],
      prompt: ["這段路上，你的手對水桶作了多少功？","How much work does your hand do on the bucket?"]
    },
    {
      id: "2-2",
      title: ["預測二","Second prediction"],
      speech: ["第二題。行李箱在粗糙的水平地面上，你把它往右拉過去五公尺，再拉回原來的地方。[[back]]來回一趟，總位移是零。那地面的摩擦力，這一趟對行李箱作的是正功、負功，還是零？","Second question. On a rough, level floor, you pull a suitcase five metres to the right, then pull it back to where it started. [[back]]The displacement for the round trip is zero. Does friction from the floor do positive, negative or zero work on the suitcase over the whole trip?"],
      caption: ["拉去又拉回，摩擦力作功是**正、負還是零**？","Out and back: is the work by friction **positive, negative or zero**?"],
      prompt: ["那地面的摩擦力，這一趟對行李箱作的是正功、負功，還是零？","Does friction from the floor do positive, negative or zero work on the suitcase over the whole trip?"]
    },
    {
      id: "3-1",
      title: ["作功和能量","Work and energy"],
      speech: ["作功的英文叫 work，所以符號寫 W。要對物體作功，你一定要有能量。[[transfer]]作了功之後，能量會從一個東西跑到另一個東西，[[change]]或者換一種形態，像滑動的木塊被摩擦力煞停，動能就變成熱能。","In English we call it work, so we use the symbol W. To do work on an object, you need energy. [[transfer]]When work is done, energy moves from one thing to another [[change]]or changes form. When friction brings a sliding block to rest, for example, its kinetic energy becomes thermal energy."],
      caption: ["作功＝**搬運或轉換能量**","Work **transfers or transforms energy**"],
      video: [26,44]
    },
    {
      id: "3-2",
      title: ["力和位移同方向","Force along the displacement"],
      speech: ["國中學過，一個固定的力拉著物體，讓它沿著力的方向移動，我們就說這個力對物體作了功。力和位移同方向的時候，[[w1]]功就是力乘以位移，W 等於 F 乘以 S；方向相反，就要加一個負號。單位呢，力用牛頓、位移用公尺，[[joule]]牛頓乘公尺，我們叫它焦耳，紀念焦耳這位物理學家。","In junior high, you learned that a constant force pulling an object through a displacement along the force does work on it. When force and displacement point the same way, [[w1]]work is force times displacement: W equals F times S. If they point opposite ways, add a minus sign. What about the units? Force in newtons times displacement in metres gives the [[joule]]newton metre, called a joule in honour of the physicist James Joule."],
      caption: ["同向 \\(W=FS\\)、反向加負號，單位**焦耳 J**","Same direction: \\(W=FS\\). Opposite directions: add a minus sign. Unit: **joule (J)**."]
    },
    {
      id: "3-3",
      title: ["有夾角：分解力","Resolving the force"],
      speech: ["可是拖行李箱的時候，力是斜的。假設拉力是五十牛頓，拉桿的方向是水平四格、往上三格，往右拉了十公尺。我們把拉力[[split]]拆成兩個互相垂直的分量，剛好是國中學過的三、四、五直角三角形：一個跟位移[[par]]平行，四十牛頓；一個跟位移[[perp]]垂直，三十牛頓。垂直的那個，對作功沒有效果；[[eff]]只有平行的那個才算數。所以 W 等於 F 平行乘以 S，四十乘十，四百焦耳。","When you tow a suitcase, the pull is tilted. Suppose it is fifty newtons, the handle rises three squares for every four across, and you pull the case ten metres to the right. [[split]]Resolve the pull into two perpendicular components. It’s that familiar three-four-five right triangle. One component is [[par]]parallel to the displacement: forty newtons. The other is [[perp]]perpendicular: thirty newtons. The perpendicular part does nothing for the work. [[eff]]Only the parallel component counts. W equals the parallel component times S: forty times ten, four hundred joules."],
      caption: ["只有**和位移平行**的分力才作功","Only the force **parallel to the displacement** does work"],
      video: [26,264],
      note: ["之後數學學了三角比，平行分力可寫成 \\(F\\cos\\theta\\)，所以 \\(W=FS\\cos\\theta\\)。","When you learn trigonometric ratios, the parallel component can be written \\(F\\cos\\theta\\), so \\(W=FS\\cos\\theta\\)."]
    },
    {
      id: "3-4",
      title: ["另一種拆法：分解位移","Resolving the displacement"],
      speech: ["也可以反過來，不拆力，[[sp]]改拆位移：把十公尺拆成沿著拉力方向的那一段，用同樣三、四、五的比例，剛好是八公尺。五十牛頓乘八公尺，一樣是四百焦耳。講義和課本常寫「力乘以沿施力方向的位移」，就是這一種。我習慣在下標加平行的符號，提醒自己：互相平行的那一段才有效。","We can do it the other way around. Keep the force whole and [[sp]]split the displacement. With the same three-four-five ratio, the part of the ten metres along the pull is eight metres. Fifty newtons times eight metres still gives four hundred joules. That’s what books mean by force times displacement along the force. I put a parallel sign in the subscript to remind myself that only the parallel part counts."],
      caption: ["拆力或拆位移，**答案一樣**","Resolve force or displacement. **Same answer**."]
    },
    {
      id: "3-5",
      title: ["正功、負功、零功","Positive, negative and zero work"],
      speech: ["功是純量，沒有方向，但是有正負。力和位移同方向或夾銳角，[[pos]]作正功；反方向或夾鈍角，[[neg]]作負功，要加負號；剛好垂直，[[none]]不作功。這個正負，不是方向哦，[[meaning]]是在說這個力把能量交給物體，還是從物體拿走能量。","Work is a scalar. It has no direction, but it does have a sign. If force and displacement point the same way or form an acute angle, the force does [[pos]]positive work. If they point opposite ways or form an obtuse angle, it does [[neg]]negative work: include the minus sign. If they are perpendicular, it does [[none]]zero work. The sign doesn’t specify a direction. [[meaning]]It tells you whether this force gives energy to the object or takes energy from it."],
      caption: ["正負是**交出或拿走能量**，不是方向","The sign tells whether this force **gives or takes away energy**, not its direction."],
      video: [26,595]
    },
    {
      id: "3-6",
      title: ["作功為零的三種情況","Three ways work can be zero"],
      speech: ["什麼時候作功是零？[[f0]]第一，根本沒有力。[[s0]]第二，有力但沒位移，像推一面推不動的牆，或你舉著書包站著不動——手痠，是肌肉在耗能發熱，可是書包沒動，手對書包作的功還是零。[[ninety]]第三，力和位移一直垂直：提著水桶水平等速走、光滑桌面上用繩子拉著小球做等速圓周運動，還有物體在固定地面上滑的時候，地面的正向力，都不作功。","When is work zero? [[f0]]First, when there is no force. [[s0]]Second, when a force acts but there is no displacement. Push a wall that won’t budge, or hold that schoolbag still. Your arms ache because your muscles use energy and release heat, but your hand does zero work on the motionless bag. [[ninety]]Third, when the force stays perpendicular to the displacement. Think of carrying a bucket horizontally at constant speed, a string pulling a ball in uniform circular motion on a smooth table, or the normal force on an object sliding along a fixed floor. Each of those forces does zero work."],
      caption: ["沒力、沒位移、**力和位移垂直**→ 不作功","No force, no displacement, or **force perpendicular to motion**"],
      video: [26,799]
    },
    {
      id: "3-7",
      title: ["位移為零，作功不一定為零","Back where you started"],
      speech: ["最危險的想法來了。把行李箱等速拉過去五公尺，再拉回原點，總位移是零，所以拉力不作功？你中途換邊拉，力的方向變了，我們分段看。[[go]]去程，水平的分力四十牛頓和位移同方向，四十乘五，正兩百焦耳；[[come]]回程你換邊拉，水平分力還是和位移同方向，又是正兩百焦耳。正功加正功，[[waste]]結果告訴我一個功都沒作？那真的是做白工了。力的方向會變，作功就不可以結果論，[[sum]]要分段計算，再全部加起來，正四百焦耳。","Here’s the tricky one. Pull a suitcase five metres at a constant speed and return to the start. Zero displacement, so zero work by the pull? You change sides to pull it back. The force changes direction. Take each leg separately. [[go]]On the way out, the forty-newton horizontal component points along the displacement. Forty times five is positive two hundred joules. [[come]]On the way back, the horizontal component still points along the displacement: another positive two hundred. Positive plus positive, [[waste]]and you tell me no work was done? Now that would be wasted work! When the force changes direction, the endpoint can’t tell the whole story. [[sum]]Calculate each leg and add: positive four hundred joules."],
      caption: ["作功**要分段算再累加**，不可結果論","**Add the work on each leg** of the trip"],
      video: [26,1159]
    },
    {
      id: "3-8",
      title: ["摩擦力和重力","Friction and gravity"],
      speech: ["那摩擦力呢？行李箱是等速的，所以摩擦力跟水平分力一樣大，也是四十牛頓。去程，摩擦力和位移相反，負兩百焦耳；回程，還是相反，又是負兩百焦耳。[[fric]]所以一趟下來，摩擦力作了負四百焦耳，不是零。重力呢？地面是水平的，重力一直垂直位移，[[grav]]不作功。如果是把板擦沿著黑板推上去，再推回原來的高度，重力先作負功、再作正功，加起來剛好是零——重力只看高度差，這個特權，5-3 再講。","What about friction? The suitcase travels at constant speed, so friction matches the horizontal component: forty newtons. On the way out, friction opposes displacement: negative two hundred joules. On the way back, it still opposes displacement: another negative two hundred. [[fric]]For the round trip that makes negative four hundred joules, not zero. And gravity? On a level floor it stays perpendicular to displacement and does [[grav]]zero work. Push a chalkboard eraser up the board and then back to its original height. Gravity does negative work and then positive work, which cancel. Gravity only cares about the height difference. We’ll see why in section five-three."],
      caption: ["摩擦力去回都**作負功**；水平地面上重力**不作功**","Friction does **negative work both ways**. On level ground gravity **does no work**."]
    },
    {
      id: "4-1",
      title: ["能量是作功的本領","What energy can do"],
      speech: ["作功要有能量，所以能量就是[[ability]]作功的本領，單位也是焦耳。能量有很多種樣子，我們一個一個點亮。","Work takes energy. Energy is the [[ability]]ability to do work, and its unit is also the joule. Energy comes in many forms. Let’s light them up one at a time."],
      caption: ["能量＝**作功的本領**，單位 J","Energy is the **ability to do work**, measured in joules"]
    },
    {
      id: "4-2",
      title: ["動能","Kinetic energy"],
      speech: ["東西[[move]]在動，就有動能，K 等於二分之一 m v 平方，m 是質量，用公斤；v 是速率，用公尺每秒。動能只看速率大小，不管往哪裡跑，[[nonneg]]所以它沒有方向，也不會是負的。[[double]]同一個物體，速率變兩倍，動能變幾倍？是四倍，不是兩倍。","When something [[move]]moves, it has kinetic energy. K equals one half m v squared. Use kilograms for mass m and metres per second for speed v. Kinetic energy depends on how fast something moves, regardless of its direction. [[nonneg]]It has no direction and cannot be negative. [[double]]For the same object, double the speed. What happens to the kinetic energy? Four times as much, not twice as much."],
      caption: ["\\(K=\\tfrac12mv^2\\)：同一物體**速率兩倍，動能四倍**","\\(K=\\tfrac12mv^2\\): for the same object, **double the speed, quadruple the energy**."],
      video: [27,0]
    },
    {
      id: "4-3",
      title: ["重力位能","Gravitational potential energy"],
      speech: ["位能的英文是 potential，潛在的。書放在高處，[[high]]它潛藏著往下掉、作功的本領。在地表附近，重力位能 U 等於 m g h：m 用公斤，h 是離零位面的高度，用公尺。零位面可以自己選，通常拿地面當零；比零位面低，位能就是負的。還有，位能其實是物體和地球一起擁有的。[[lift]]你把書抬高，重力作多少負功，位能就增加多少；[[fall]]書掉下來，重力作多少正功，位能就減少多少，而且只看高度差，跟走哪條路無關。","Potential means having a possibility in reserve. A book on a high shelf [[high]]has the potential to fall and do work. Near Earth’s surface, gravitational potential energy U equals m g h. Use kilograms for m and metres for h, the height above the zero level. You choose that level, often the floor. Below it, the potential energy is negative. The object and Earth share this energy. [[lift]]Lift the book: its potential energy rises by as much as the negative work done by gravity. [[fall]]Let it fall: its potential energy falls by as much as the positive work done by gravity. Only the height difference matters; the path makes no difference."],
      caption: ["\\(U=mgh\\)（可正可負）：重力作負功→**位能增**，作正功→**位能減**","\\(U=mgh\\) can have either sign. Negative work by gravity: **U rises**. Positive work: **U falls**."],
      video: [27,663]
    },
    {
      id: "4-4",
      title: ["彈性位能與力學能","Elastic and mechanical energy"],
      speech: ["[[spring]]彈簧、弓弦這種有彈性的東西，被壓縮或拉長，就儲存了彈性位能，形變越大存越多。拿原長當零，所以它不會是負的。[[mech]]動能加上位能，包括重力位能和彈性位能，就叫力學能。","[[spring]]Springs and bowstrings store elastic potential energy when you compress or stretch them. More deformation stores more energy. Take the natural length as zero, so this energy cannot be negative. [[mech]]Kinetic energy plus potential energy, including gravitational and elastic potential energy, is mechanical energy."],
      caption: ["彈性位能 **≥ 0**・力學能 \\(E=K+U\\)","Elastic potential energy **≥ 0** · Mechanical energy \\(E=K+U\\)"]
    },
    {
      id: "4-5",
      title: ["其他形式的能量","Other forms of energy"],
      speech: ["除了力學能，還有：[[heat]]熱能，[[chem]]燃料和食物裡的化學能，[[elec]]讓家電運作的電能，[[light]]太陽光、燈光帶著的光能，[[nuke]]還有藏在原子核裡的核能。這些能量可以互相轉換、搬來搬去，作功就是其中很重要的一種方式。","Besides mechanical energy there is [[heat]]thermal energy, [[chem]]chemical energy in fuels and food, [[elec]]electrical energy that runs appliances, [[light]]light energy in sunlight and lamplight, and [[nuke]]nuclear energy inside atomic nuclei. Energy can change form and move between objects. Doing work is one important way this happens."],
      caption: ["熱能、化學能、電能、光能、核能","Thermal, chemical, electrical, light and nuclear energy"]
    },
    {
      id: "4-6",
      title: ["加碼：為什麼是 \\(\\tfrac12mv^2\\)","Bonus: why one half m v squared?"],
      speech: ["這頁是加碼，推導講義沒有，考試大概不會考，但結論很好用。可是我跟你說，[[exam]]考試不會考的，才是人生的決勝點。物體沿直線、受固定的合力，用合力等於 m a，加上等加速度公式，[[derive]]推一推就會發現：合力作的功，剛好等於二分之一 m v 平方的變化。所以動能才要這樣定義。","This is an extra. The derivation isn’t in the handout and probably won’t be on the exam, but the result is very useful. Let me tell you: [[exam]]what won’t be on the exam can be what makes the difference in life. For an object moving in a straight line under a constant net force, combine net force equals mass times acceleration with the constant-acceleration equation. [[derive]]A little algebra shows that net work equals the change in one half m v squared. That’s why we define kinetic energy this way."],
      caption: ["**合力**作功＝**動能變化**","Work by the **net force** = **change in kinetic energy**"],
      video: [27,446]
    },
    {
      id: "5-1",
      title: ["調整拉桿","Set the handle"],
      speech: ["拖拉桿把夾角拉到「水平 4、鉛直 3」那一格（F_∥＝40 N）。","Drag the handle to the four-horizontal, three-vertical notch. The parallel force is 40 N."],
      caption: ["拖拉桿把夾角拉到「水平 4、鉛直 3」那一格","Drag to **4 across, 3 up**."]
    },
    {
      id: "5-2",
      title: ["等速拉行 10 m","Pull through 10 m"],
      speech: ["按住「拉」讓行李箱往右走 10 m：等速，W_F 長條到 400 J、W_f 到 −400 J。","Hold Pull and move the suitcase ten metres to the right. It moves at constant speed. Work by the pull reaches 400 J and work by friction reaches minus 400 J."],
      caption: ["按住「拉」讓行李箱往右走 10 m","Hold **Pull** for 10 m on the rough floor."]
    },
    {
      id: "5-3",
      title: ["冰面上垂直拉","Pull vertically on ice"],
      speech: ["換「冰面」，把拉桿拖到垂直地面並按住「拉」：箱子照樣等速滑，W_F 一直 0、速率不變。","Switch to ice, drag the handle straight up and hold Pull. The suitcase keeps gliding at constant speed and the work by the pull stays zero."],
      caption: ["換「冰面」，把拉桿拖到垂直地面並按住「拉」","Switch to ice, raise the handle vertically and hold Pull."]
    },
    {
      id: "5-4",
      title: ["掉頭回原點","Turn back to the start"],
      speech: ["回「粗糙地面」，4:3 角度拉過去 5 m，按「掉頭」再拉回原點：摩擦力合計 −400 J、W_F 合計＋400 J、總位移 0。","Return to the rough floor, pull five metres at the four-to-three setting, turn around and pull back to the start. Friction does minus four hundred joules and the pull does plus four hundred joules. Total displacement is zero."],
      caption: ["回「粗糙地面」，4:3 角度拉過去 5 m，按「掉頭」再拉回原點","Pull **5 m out and 5 m back** on the rough floor."]
    },
    {
      id: "6-1",
      title: ["範例一","Worked example 1"],
      speech: ["等速，代表[[eq]]合力是零，所以手往上托的力，大小等於重力，三乘十，三十牛頓。[[a1]]手往上、位移往上，作正功，三十乘二，正六十焦耳。[[a2]]重力往下、位移往上，反方向，負三十乘二，負六十焦耳。[[a3]]合力是零，作功當然是零；你也可以把前面兩個加起來，六十加負六十，一樣是零。","Constant speed means [[eq]]zero net force, so the hand balances the weight: thirty newtons. [[a1]]The hand pushes up and the displacement is up. Positive work: thirty times two, plus sixty joules. [[a2]]Gravity points down and displacement up: minus sixty joules. [[a3]]The net force is zero, so its work is zero. Or add the two answers: sixty minus sixty is still zero."],
      caption: ["範例一","Worked example 1"],
      prompt: ["手托一個 3 kg 的物體，讓它鉛直等速度緩緩上升 2 m（忽略空氣阻力，g 取 10 \\(\\mathrm{m/s^2}\\)）。求：(1) 手對物體作的功 (2) 重力對物體作的功 (3) 合力對物體作的功。","A hand raises a 3 kg object vertically through 2 m at constant speed. Ignore air resistance and take g = 10 \\(\\mathrm{m/s^2}\\). Find the work on the object by (1) the hand, (2) gravity and (3) the net force."]
    },
    {
      id: "6-2",
      title: ["範例二","Worked example 2"],
      speech: ["[[k]]動能，二分之一乘五乘一點二的平方，三點六焦耳。[[wg]]重力要分段：鉛直提起來那段，重力五十牛頓和位移相反，負五十乘零點八，負四十焦耳；水平走那段，重力和位移垂直，零。加起來負四十焦耳。[[du]]重力位能的變化是 m g 乘高度差，五乘十乘零點八，增加四十焦耳。你看，重力作的功，剛好是位能變化的負值。","[[k]]Kinetic energy is one half times five times one point two squared: three point six joules. [[wg]]For gravity, take it in stages. In the vertical lift, the fifty-newton weight opposes displacement: minus fifty times zero point eight, or minus forty joules. In the horizontal walk, gravity is perpendicular to displacement and does zero work. The total is minus forty joules. [[du]]The change in gravitational potential energy is m g times the height change. Five times ten times zero point eight is a gain of forty joules. The work by gravity is the negative of the change in potential energy."],
      caption: ["範例二","Worked example 2"],
      prompt: ["5 kg 的背包，先從地面鉛直提到 0.8 m 高，再以 1.2 m/s 的速度等速水平走 15 m；水平走時背包一直維持 0.8 m 高（g 取 10 \\(\\mathrm{m/s^2}\\)）。求：(1) 水平走時背包的動能 (2) 整段過程重力對背包作的功 (3) 背包的重力位能變化。","A 5 kg backpack is first lifted vertically from the floor to 0.8 m. It is then carried horizontally for 15 m at a constant speed of 1.2 m/s, staying 0.8 m above the floor. Take g = 10 \\(\\mathrm{m/s^2}\\). Find (1) its kinetic energy during the walk, (2) the work by gravity over the whole trip and (3) its change in gravitational potential energy."]
    },
    {
      id: "7-1",
      title: ["在圖上操作","Set the angle"],
      speech: ["重 100 N 的行李箱在光滑冰面上向右等速滑行。你持續用 50 N 的力拉著拉桿，想讓拉力不對箱子作功，拉桿要拖到什麼角度？","A suitcase weighing 100 N glides to the right at constant speed on smooth ice. You keep pulling its handle with a force of 50 N. At what angle must you set the handle for the pull to do zero work on the suitcase?"],
      caption: ["重 100 N 的行李箱在光滑冰面上向右等速滑行。你持續用 50 N 的力拉著拉桿，想讓拉力不對箱子作功，拉桿要拖到什麼角度？","A suitcase weighing 100 N glides to the right at constant speed on smooth ice. You keep pulling its handle with a force of 50 N. At what angle must you set the handle for the pull to do zero work on the suitcase?"],
      prompt: ["重 100 N 的行李箱在光滑冰面上向右等速滑行。你持續用 50 N 的力拉著拉桿，想讓拉力不對箱子作功，拉桿要拖到什麼角度？","A suitcase weighing 100 N glides to the right at constant speed on smooth ice. You keep pulling its handle with a force of 50 N. At what angle must you set the handle for the pull to do zero work on the suitcase?"]
    },
    {
      id: "7-1b",
      title: ["一句話複習頁","One-sentence review"],
      speech: ["對物體來說，某個力作正功＝把能量交給物體；作負功＝從物體拿走能量；作零功＝這個力沒有傳能量給物體。","For an object, positive work by a particular force means that force gives energy to the object. Negative work means it takes energy away. Zero work means it transfers no energy to the object."],
      caption: ["對物體來說，某個力作正功＝把能量交給物體；作負功＝從物體拿走能量；作零功＝這個力沒有傳能量給物體。","For an object, positive work by a particular force means that force gives energy to the object. Negative work means it takes energy away. Zero work means it transfers no energy to the object."]
    },
    {
      id: "7-2",
      title: ["填數字","Enter a number"],
      speech: ["工人用水平 30 N 的力，把拖車在粗糙水平地面上沿直線等速拉了 8 m（忽略空氣阻力）。地面摩擦力對拖車作功多少焦耳？","A worker pulls a cart 8 m in a straight line at constant speed across a rough, level floor with a horizontal force of 30 N. Ignore air resistance. How many joules of work does friction from the floor do on the cart?"],
      caption: ["工人用水平 30 N 的力，把拖車在粗糙水平地面上沿直線等速拉了 8 m（忽略空氣阻力）。地面摩擦力對拖車作功多少焦耳？","A worker pulls a cart 8 m in a straight line at constant speed across a rough, level floor with a horizontal force of 30 N. Ignore air resistance. How many joules of work does friction from the floor do on the cart?"],
      prompt: ["工人用水平 30 N 的力，把拖車在粗糙水平地面上沿直線等速拉了 8 m（忽略空氣阻力）。地面摩擦力對拖車作功多少焦耳？","A worker pulls a cart 8 m in a straight line at constant speed across a rough, level floor with a horizontal force of 30 N. Ignore air resistance. How many joules of work does friction from the floor do on the cart?"]
    },
    {
      id: "7-2b",
      title: ["一句話複習頁","One-sentence review"],
      speech: ["功、動能、位能都是純量，單位都是焦耳 J＝N·m。","Work, kinetic energy and potential energy are all scalars. Their unit is the joule: one joule equals one newton metre."],
      caption: ["功、動能、位能都是純量，單位都是焦耳 J＝N·m。","Work, kinetic energy and potential energy are all scalars. Their unit is the joule: one joule equals one newton metre."]
    },
    {
      id: "7-3",
      title: ["選擇","Choose an answer"],
      speech: ["同一輛腳踏車（總質量不變），速率從 3 m/s 加快到 6 m/s，動能變成原來的幾倍？","The same bicycle and rider, with unchanged total mass, speed up from 3 m/s to 6 m/s. How many times its original value is the kinetic energy?"],
      caption: ["同一輛腳踏車（總質量不變），速率從 3 m/s 加快到 6 m/s，動能變成原來的幾倍？","The same bicycle and rider, with unchanged total mass, speed up from 3 m/s to 6 m/s. How many times its original value is the kinetic energy?"],
      prompt: ["同一輛腳踏車（總質量不變），速率從 3 m/s 加快到 6 m/s，動能變成原來的幾倍？","The same bicycle and rider, with unchanged total mass, speed up from 3 m/s to 6 m/s. How many times its original value is the kinetic energy?"]
    },
    {
      id: "8-1",
      title: ["三句帶走","Three things to take away"],
      speech: ["三句話帶走。第一，只有和位移平行的分力才作功，同方向是正的 F 平行乘 S，反方向要加負號。第二，力的方向會變，作功要分段算再累加，位移為零，作功不一定為零。第三，能量是作功的本領，動能二分之一 m v 平方，重力位能 m g h，作功可以讓能量搬家、換形態。","Three things to take away. First, only the component parallel to the displacement does work. In the same direction, work is positive F parallel times S. In the opposite direction, add a minus sign. Second, if the force changes direction, calculate work in stages and add. Zero displacement does not guarantee zero work. Third, energy is the ability to do work. Kinetic energy is one half m v squared and gravitational potential energy is m g h. Doing work can transfer energy or change its form."],
      caption: ["平行分力才作功・**分段累加**・\\(K=\\tfrac12mv^2\\)、\\(U=mgh\\)","Parallel component · **add work in stages** · \\(K=\\tfrac12mv^2\\), \\(U=mgh\\)"]
    },
    {
      id: "8-2",
      title: ["成績卡","Your scorecard"],
      speech: ["做完了，給自己拍拍手。下一節 5-2，我們要鑽進微觀的世界，看熱到底是什麼。","You made it. Give yourself a hand! Next time, in section 5-2, we’ll dive into the microscopic world to see what heat really is."],
      caption: ["得分、拿到的學習星星","Your score and your **learning stars**."]
    }
  ];
  const choices = {
    '2-1': [['正功，和水桶重量乘上 10 m 一樣大','Positive: weight times 10 m'],['正功，但比較小','Positive, but smaller'],['零','Zero'],['負功','Negative']],
    '2-2': [['零，因為位移是零','Zero because displacement is zero'],['負功','Negative work'],['正功','Positive work']],
    '7-3': [['2','2'],['4','4'],['不變','Unchanged'],['1/2','1/2']]
  };
  const feedback = {
    '7-1': [['水平拉時力和位移同方向，作的正功最大，不是零。','A horizontal pull points along the displacement and does the greatest positive work, not zero.'],['斜拉時還有和位移平行的分力，還是會作正功；要讓平行分力變成零，拉力得和位移垂直。','A tilted pull still has a component along the displacement and does positive work. To make that component zero, the pull must be perpendicular to the displacement.']],
    '7-2': [['摩擦力和位移方向相反，要加負號。','Friction acts opposite the displacement. Include the minus sign.'],['功是力乘位移，兩個都要乘進去。','Work is force times displacement. Include both factors.']],
    '7-3': [['質量不變時，動能和速率的平方成正比，速率變 2 倍，動能變 \\(2^2\\)＝4 倍。','At constant mass, kinetic energy is proportional to the square of speed. Doubling speed multiplies kinetic energy by \\(2^2\\), or four.'],[],['速率變了，動能就變了。','Changing speed changes kinetic energy.'],['速率變大，動能變大，不會變小。','When speed increases, kinetic energy increases; it does not decrease.']]
  };
  const reveal = {
    '3-6': ['ninety','預測一：C。水桶水平等速、高度不變，手只要撐住重力，拉力鉛直朝上，跟水平位移垂直，所以作功是零。','Prediction 1: C. The bucket travels horizontally at constant speed and height. The hand balances its weight with an upward pull, perpendicular to the horizontal displacement, so its work is zero.'],
    '3-8': ['fric','預測二：B。摩擦力去回都作負功。','Prediction 2: B. Friction does negative work on both legs.']
  };
  const steps = [
    { target: '#angle-handle', action:'drag', hint:['拉桿把手','Handle'], goal:['水平 4、鉛直 3','4 across, 3 up'] },
    { target: '#pull', action:'hold', hint:['拉','Pull'], goal:['等速拉行 10 m','Pull 10 m at constant speed'] },
    { target: '#surface', targets:['#surface','#angle-handle','#pull'], action:'tap', hint:['地面、拉桿把手、拉','Surface, handle and Pull'], goal:['冰面、垂直拉、速率不變','Ice, vertical pull, constant speed'] },
    { target:'#turn', targets:['#turn','#pull'], action:'tap', hint:['掉頭、拉','Turn and pull'], goal:['去、回各 5 m','5 m out and 5 m back'] }
  ];
  const labs = [['incline-friction.html?mode=lab','斜面與摩擦力','Inclines and friction'],['energy-coaster.html?mode=lab','動能與位能','Kinetic and potential energy']];
  const videos = {26:'XP_tp1oXvN4',27:'M8LXxVWY_64'};
  const E = C.examples(), A = C.answers(), f = C.forces(C.angle43);
  const half = C.work(f.parallel,5), total = half * 2, friction = C.work(f.friction,5);
  const J = '\\,\\mathrm J';
  // Each row has the cue that reveals it and a KaTeX expression. Colors come from the same palette as the scene.
  function board(id, paint, en) {
    const q = (k,s) => '{\\color{'+paint[k]+'}'+s+'}';
    const F=q('F','F'), P=q('parallel','F_{\\parallel}'), S=q('S','S'), K=q('K','K'), U=q('U','U');
    const N=q('normal','N'), G=q('weight','mg'), V=q('perp','F_{\\perp}'), Fr=q('friction','f_k');
    const WF=q('positive','W_F'), Wf=q('negative','W_f'), Wg=q('weight','W_g'), all='W_{\\mathrm{'+(en?'net':'合')+'}}';
    const rows = {
      '1-1':[['zero',S+'=0,\\quad W=0'+J]], '1-2':[['angle','\\theta=\\angle('+F+','+S+')']],
      '2-1':[['',S+'=10\\,\\mathrm m']], '2-2':[['back','\\Delta x=0']],
      '3-1':[['transfer','W\\;\\longrightarrow\\;\\Delta E']],
      '3-2':[['w1','\\text{'+(en?'Same way':'同向')+'}\\quad W='+F+S],['w1','\\text{'+(en?'Opposite':'反向')+'}\\quad W=-'+F+S],['joule','1\\,\\mathrm J=1\\,\\mathrm{N\\cdot m}']],
      '3-3':[['par',P+'='+f.parallel+'\\,\\mathrm N'],['perp',V+'='+f.perpendicular+'\\,\\mathrm N'],['eff','W='+P+S+'='+f.parallel+'\\times10='+total+J]],
      '3-4':[['sp',q('S','S_{\\parallel}')+'='+C.work(10,f.parallel/C.pull)+'\\,\\mathrm m'],['sp','W='+F+q('S','S_{\\parallel}')+'=50\\times8='+total+J]],
      '3-5':[['pos','W=+'+P+S],['neg','W=-'+P+S],['none','W=0']],
      '3-6':[['f0',F+'=0'],['s0',S+'=0'],['ninety',F+'\\perp '+S]],
      '3-7':[['go',q('positive','W_{F,1}')+'=+'+half+J],['come',q('positive','W_{F,2}')+'=+'+half+J],['sum',WF+'='+half+'+'+half+'='+total+J]],
      '3-8':[['fric',Wf+'='+friction+friction+'='+friction*2+J],['grav',Wg+'=0'+J]],
      '4-1':[['ability','[E]=\\mathrm J']], '4-2':[['move',K+'=\\tfrac12mv^2'],['double','2v\\;\\longrightarrow\\;'+A.ratio+K]],
      '4-3':[['high',U+'=mgh'],['fall',Wg+'=-\\Delta '+U]],
      '4-4':[['spring',q('spring','U_{\\rm e}')+'\\geq0'],['mech','E='+K+'+'+U]],
      '4-6':[['derive','v^2=v_0^2+2aS'],['derive','aS=\\tfrac12(v^2-v_0^2)'],['derive',q('F','F_{\\mathrm{'+(en?'net':'合')+'}}')+'=ma'],['derive',all+'='+q('F','F_{\\mathrm{'+(en?'net':'合')+'}}')+S+'=\\tfrac12mv^2-\\tfrac12mv_0^2']],
      '5-1':[['',P+'=\\tfrac45 '+F+'='+f.parallel+'\\,\\mathrm N']], '5-2':[['',Fr+'=\\mu_k('+G+'-'+V+')']], '5-3':[['',N+'='+G+'-'+V]], '5-4':[['',all+'=\\Delta '+K]],
      '6-1':[['eq',q('F','F_{\\rm '+(en?'hand':'手')+'}')+'='+G+'=3\\times10='+E.weight+'\\,\\mathrm N'],['a1',q('positive','W_{\\rm '+(en?'hand':'手')+'}')+'=+30\\times2=+'+E.hand+J],['a2',Wg+'=-30\\times2='+E.gravity+J],['a3',all+'=(+'+E.hand+')+('+E.gravity+')='+E.net]],
      '6-2':[['k',K+'=\\tfrac12\\times5\\times1.2^2='+Number(E.backpackK.toFixed(2))+J],['wg',Wg+'=(-5\\times10\\times0.8)+0='+E.backpackWg+J],['du','\\Delta '+U+'=mg\\Delta h=5\\times10\\times0.8=+'+E.dU+J]],
      '7-1b':[['',q('positive','W>0')+'\\qquad '+q('negative','W<0')+'\\qquad W=0']],
      '7-2b':[['','1\\,\\mathrm J=1\\,\\mathrm{N\\cdot m}']],
      '8-1':[['','W=\\pm '+P+S],['',K+'=\\tfrac12mv^2'],['',U+'=mgh']]
    };
    return rows[id] || [];
  }
  return { id:'learn-phy-5-1', slug:'phy-5-1', segments, pages, steps, choices, feedback, reveal, labs, videos, board };
});
