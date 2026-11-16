/* 自學與實驗共用題目；受力正負號仍沿用原物理核心。 */
(function(root){
  'use strict';
  const data=[
    {n:1,q:['木板傾斜 25°。2 kg 木塊原本靜止在木板上，沒有外加拉力。摩擦力多大、朝哪裡？','A board is tilted at 25°. A 2 kg block starts at rest on it, with no applied pull. Find the friction and its direction.'],
      state:{i:{surf:'wood',theta:25,mass:2,force:0,v0:0},b:['#modeAlong','#startTop']},
      sol:[['先假想木板光滑：木塊想往下滑，所以靜摩擦力 \\(f_s\\) 沿斜面向上。','Imagine a smooth board: the block would slide down, so static friction \\(f_s\\) acts up the incline.'],
        ['木塊沒滑，沿斜面合力為零。\\(f_s\\) 抵消重力沿斜面的分量。','The block does not slip, so the net force along the incline is zero. \\(f_s\\) balances the downslope component of weight.'],
        ['\\(f_s=mg\\sin25^\\circ=8.28\\ \\mathrm{N}\\)，沿斜面向上。','\\(f_s=mg\\sin25^\\circ=8.28\\ \\mathrm{N}\\), up the incline.'],
        ['\\(f_{s,\\max}=8.88\\ \\mathrm{N}\\)，撐得住；8.28 N 才是這一刻需要的大小。','\\(f_{s,\\max}=8.88\\ \\mathrm{N}\\), enough to hold. Only 8.28 N is needed now.']],
      steps:[{t:['按「放手」，確認木塊保持靜止','Press “Release” and check that the block stays at rest'],check:s=>s.type==='release'&&s.holds,hold:0}]},
    {n:2,q:['木板傾斜 20°。2 kg 木塊原本靜止，用 10 N 沿斜面向上拉，仍沒滑。拉力減到零，摩擦力怎麼變？','A 2 kg block starts at rest on a 20° board. A 10 N upslope pull does not move it. How does friction change as the pull falls to zero?'],
      state:{i:{surf:'wood',theta:20,mass:2,force:10,v0:0},b:['#modeAlong','#startTop']},
      sol:[['重力沿斜面的分量是 6.70 N，往下。先比較其他力，別看到靜摩擦就亂代公式。','The downslope component of weight is 6.70 N. Compare the other forces first; do not rush to substitute a friction formula.'],
        ['10 N 拉力較大，木塊想往上滑；\\(f_s=10-6.70=3.30\\ \\mathrm{N}\\)，往下。','The 10 N pull would drive it up, so \\(f_s=10-6.70=3.30\\ \\mathrm{N}\\), down the incline.'],
        ['拉力減到約 6.70 N，其他力已經平衡，\\(f_s=0\\)。','At a pull of about 6.70 N, the other forces balance and \\(f_s=0\\).'],
        ['拉力減到零，木塊想往下滑；\\(f_s=6.70\\ \\mathrm{N}\\)，往上。全程未滑，上限 \\(f_{s,\\max}=9.21\\ \\mathrm{N}\\)。','At zero pull, the block would slide down: \\(f_s=6.70\\ \\mathrm{N}\\), upslope. It rests throughout; \\(f_{s,\\max}=9.21\\ \\mathrm{N}\\).']],
      steps:[{t:['把拉力減到約 6.7 N，看靜摩擦力歸零','Reduce the pull to about 6.7 N and watch static friction reach zero'],check:s=>Math.abs(s.f)<.3&&s.theta===20&&s.phase!=='run',hold:.4},{t:['繼續減到零，看靜摩擦力改為向上','Reduce the pull to zero and watch static friction turn upslope'],check:s=>Math.abs(s.F)<.1&&s.f< -6&&s.theta===20,hold:.4}]},
    {n:3,q:['繩子穿過光滑牆孔，用 20 N 水平拉力把 0.5 kg 木塊拉向直立木牆。木塊原本靜止，仍沒滑。摩擦力多大？拉力加倍呢？','A rope through a smooth wall opening pulls a 0.5 kg block horizontally against a vertical wooden wall with 20 N. It starts and remains at rest. Find friction, then double the pull.'],
      state:{i:{surf:'wood',theta:90,mass:.5,force:20,v0:0},b:['#modeHoriz','#startTop']},
      sol:[['先看接觸面：木塊沒滑，就是靜摩擦。它想往下掉，\\(f_s\\) 就向上。','The block does not slip, so friction is static. It would fall down, so \\(f_s\\) acts upward.'],
        ['上下平衡，\\(f_s=mg=4.90\\ \\mathrm{N}\\)。水平拉力不是摩擦力。','Vertical forces balance: \\(f_s=mg=4.90\\ \\mathrm{N}\\). The horizontal pull is not the friction force.'],
        ['拉力加到 40 N，木塊仍沒滑，\\(f_s\\) 仍是 4.90 N。','At a 40 N pull the block still rests, so \\(f_s\\) remains 4.90 N.'],
        ['改變的是上限：\\(f_{s,\\max}\\) 從 10 N 變成 20 N。比較不容易滑落，不代表這一刻的靜摩擦力一定變大。','The limit changes: \\(f_{s,\\max}\\) rises from 10 N to 20 N. Making slipping less likely need not increase the static friction needed now.']],
      steps:[{t:['把水平拉力調到 40 N，比較靜摩擦力','Set the horizontal pull to 40 N and compare static friction'],check:s=>s.theta===90&&s.mode==='horiz'&&Math.abs(s.F-40)<.2&&Math.abs(s.f+4.9)<.01,hold:.5}]}
  ];
  if(typeof module!=='undefined'&&module.exports)module.exports=data;else{root.LAB_EXAMPLE_DATA=root.LAB_EXAMPLE_DATA||{};root.LAB_EXAMPLE_DATA['incline-friction']=data;root.LabExamples?.define('incline-friction',data);}
})(typeof window!=='undefined'?window:this);
