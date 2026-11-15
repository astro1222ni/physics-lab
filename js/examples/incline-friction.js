/* 同一份資料供自學單元、斜面實驗與 Node 驗證使用。符號沿核心的斜面座標。 */
(function(root){
  'use strict';
  const data=[
    {n:1,src:['改寫自 C4-04 講義範例 2；數值自訂','Adapted from C4-04 handout, example 2; new values'],
      q:['2 kg 木塊靜止在 25° 木斜面上，沒有外加推力。摩擦力多大，沿斜面朝哪裡？','A 2 kg block rests on a 25° wooden incline with no applied push. What is the friction force, and which way does it act?'],
      state:{i:{surf:'wood',theta:25,mass:2,force:0,v0:0},b:['#modeAlong','#startTop']},
      sol:[['先假想斜面光滑：木塊想往下滑，所以摩擦力沿斜面向上。','Imagine a smooth incline: the block would slide down, so friction acts up the incline.'],
        ['木塊沒滑，沿斜面的合力是零。摩擦力抵消重力沿斜面的分量。','The block is at rest, so the net force along the incline is zero. Friction balances the downslope component of weight.'],
        ['f = mg sin 25° = 8.28 N，沿斜面向上。','f = mg sin 25° = 8.28 N, up the incline.'],
        ['這個接觸面的上限是 8.88 N，撐得住；8.28 N 才是這一刻需要的大小。','The limit for these surfaces is 8.88 N, enough to hold. The friction needed now is only 8.28 N.']],
      steps:[{t:['按「放手」，確認木塊保持靜止','Press “Release” and check that the block stays at rest'],check:s=>s.type==='release'&&s.holds,hold:0}]
    },
    {n:2,src:['改寫自本單元「靜摩擦力被動變化」','Adapted from this unit: static friction adjusts'],
      q:['2 kg 木塊在 20° 木斜面上，先用 10 N 沿斜面往上推。摩擦力朝哪裡？把推力慢慢減到零，方向會不會翻？','Push a 2 kg block up a 20° wooden incline with 10 N. Which way does friction act? Slowly reduce the push to zero: does friction reverse?'],
      state:{i:{surf:'wood',theta:20,mass:2,force:10,v0:0},b:['#modeAlong','#startTop']},
      sol:[['重力沿斜面的分量是 6.70 N，往下。先比較其他的力，不要看到靜摩擦就亂代公式。','The downslope component of weight is 6.70 N. Compare the other forces first; do not substitute a formula just because friction is static.'],
        ['10 N 推力比較大，木塊想往上滑；f = 10 − 6.70 = 3.30 N，往下。','The 10 N push would drive it up, so f = 10 − 6.70 = 3.30 N, down the incline.'],
        ['推力減到約 6.70 N 時，其他力已經平衡，f = 0。','At about 6.70 N, the other forces already balance and f = 0.'],
        ['推力繼續減到零，木塊改成想往下滑；f = 6.70 N，往上。全程都沒滑，上限是 9.21 N。','At zero push, the block would slide down; f = 6.70 N, up. It stays at rest throughout; the limit is 9.21 N.']],
      steps:[{t:['把 F 減到約 6.7 N，看 f 變成零','Reduce F to about 6.7 N and watch f reach zero'],check:s=>Math.abs(s.f)<.3&&s.theta===20&&s.phase!=='run',hold:.4},
        {t:['繼續減到零，看摩擦力翻成往上','Reduce F to zero and watch friction turn upslope'],check:s=>Math.abs(s.F)<.1&&s.f< -6&&s.theta===20,hold:.4}]
    },
    {n:3,src:['改寫自 C4-04 講義範例 3（握杯）；以牆面木塊模擬','Adapted from C4-04 handout, example 3 (holding a cup); modelled with a block against a wall'],
      q:['用 20 N 水平力，把 0.5 kg 木塊壓在直立木牆上，木塊不滑。摩擦力多大？壓力加到 40 N，摩擦力會變嗎？','Press a 0.5 kg block against a vertical wooden wall with a horizontal 20 N force. It stays at rest. What is the friction? Does it change if the push rises to 40 N?'],
      state:{i:{surf:'wood',theta:90,mass:.5,force:20,v0:0},b:['#modeHoriz','#startTop']},
      sol:[['先看接觸面：木塊沒滑，就是靜摩擦。它想往下掉，摩擦力就向上。','The surfaces do not slip, so friction is static. The block would fall down, so friction acts upward.'],
        ['上下要平衡，f = mg = 4.90 N。水平的壓力不用拿來當摩擦力。','Vertical forces balance: f = mg = 4.90 N. The horizontal push is not the friction force.'],
        ['壓力加到 40 N，木塊仍沒滑，f 還是 4.90 N。','At a 40 N push the block still rests, so f is still 4.90 N.'],
        ['改變的是上限：由 10 N 變成 20 N。握更緊比較不容易掉，不代表摩擦力一定變大。','The limit changes from 10 N to 20 N. Gripping harder makes slipping less likely; it need not increase friction.']],
      steps:[{t:['把水平推力調到 40 N，比較摩擦力','Set the horizontal push to 40 N and compare friction'],check:s=>s.theta===90&&s.mode==='horiz'&&Math.abs(s.F-40)<.2&&Math.abs(s.f+4.9)<.01,hold:.5}]
    }
  ];
  if(typeof module!=='undefined'&&module.exports)module.exports=data;
  else { root.LAB_EXAMPLE_DATA=root.LAB_EXAMPLE_DATA || {};root.LAB_EXAMPLE_DATA['incline-friction']=data;
    if(root.LabExamples)root.LabExamples.define('incline-friction',data); }
})(typeof window!=='undefined'?window:this);
