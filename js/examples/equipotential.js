/* 範例題、給定曲線、板書共用一份資料；不複製成另一個實驗。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports=factory(require('../equipotential-study-core.js'));
  else { const data=factory(root.EquipotentialStudyCore);root.LAB_EXAMPLE_DATA=root.LAB_EXAMPLE_DATA||{};root.LAB_EXAMPLE_DATA.equipotential=data;root.LabExamples?.define('equipotential',data); }
})(typeof window!=='undefined'?window:this, function (S) {
  'use strict';
  const F=S.facts(),p=(a,b)=>[a,b],math=(n)=>n.toFixed(3);
  const data=[
    {n:1,q:p('水平導電紙，平行長條跨滿上下邊，相距 10 cm；左 +6 V、右 0 V，已穩定通電。2 V 與 4 V 線間的電場多大？','On a level conducting sheet, full-length parallel bars are 10 cm apart, left +6 V and right 0 V, with steady current. Given the 2 V and 4 V measured lines, find the field between them.'),
      state:{...S.base,type:'bars',d:10,clip:true,drawLines:true,drawField:false,n2:{x:15,y:10}},levels:[2,4],
      concept:[p('兩條平行長條跨滿絕緣邊界時，中間是均勻電場。','Full-length parallel bars with insulating side boundaries produce a uniform field between them.')],
      sol:[p('先認邊界：兩支長條跨滿上下邊，兩極之間的等位線是平行直線。','Identify the boundaries first. Full-length bars give straight, parallel equipotentials between them.'),p('兩線的電位差：\\(\\Delta V=4-2=2\\,\\mathrm V\\)。量垂直距離，不沿著彎路量。','The potential difference is \\(\\Delta V=4-2=2\\,\\mathrm V\\). Measure the perpendicular separation, not an arbitrary route.'),p('均勻場：\\(E=V_0/d=6/10=0.600\\,\\mathrm{V/cm}\\)。因此兩伏特的間距是 \\(2/0.600\\,\\mathrm{cm}\\)。','For a uniform field, \\(E=V_0/d=6/10=0.600\\,\\mathrm{V/cm}\\). The two-volt separation is therefore \\(2/0.600\\,\\mathrm{cm}\\).'),p('把紅探針放兩線之間，按「估算電場」。用題目給的兩條線驗算，誤差小於 10 % 就完成範例。','Put the red probe between the given lines and press “Estimate E”. Verify the result within 10% to complete the example.')]},
    {n:2,q:p('水平導電紙，圓極相距 14 cm、半徑 0.75 cm；左 +6 V、右 0 V，已穩定通電。A=(15,10)、B=(9.5,10) cm，何處電場強？','Level paper; circles 14 cm apart, radius 0.75 cm. Steady +6 V at left, 0 V at right. A=(15,10), B=(9.5,10) cm: which field is stronger?'),
      state:{...S.base,clip:true,drawLines:true,drawField:false,n2:{x:15,y:10}},levels:[F.VA-.1,F.VA+.1,F.VB-.1,F.VB+.1],
      concept:[p('電場看線的疏密；高電位本身不是電場較大的充分理由。','Field strength depends on contour spacing; high potential alone does not imply a strong field.')],
      sol:[p('先看相同電位差對應的間距：B 旁的線較密，所以猜 \\(E_B>E_A\\)。','Compare spacing for equal voltage gaps: the curves near B are closer, suggesting \\(E_B>E_A\\).'),p(`A 處的計算值為 \\(E_A=${math(F.A)}\\,\\mathrm{V/cm}\\)。先按「量 A」，再按估算。`,`Calculation gives \\(E_A=${math(F.A)}\\,\\mathrm{V/cm}\\). Choose “Measure A”, then estimate.`),p(`B 的計算值是 \\(E_B=${math(F.B)}\\,\\mathrm{V/cm}\\)，為 A 的 ${(F.B/F.A).toFixed(2)} 倍。`,`At B, \\(E_B=${math(F.B)}\\,\\mathrm{V/cm}\\), ${(F.B/F.A).toFixed(2)} times the value at A.`),p('按「量 B」再估算。兩處都驗證且判斷正確後，按「確認範例二」，將預測與量測連起來。','Choose “Measure B” and estimate again. After verifying both and ranking them correctly, confirm Example 2.')]},
    {n:3,q:p('水平水槽，0.1 % 鹽水深 1.0 cm；圓極相距 14 cm、半徑 0.75 cm。左 +6 V、右 0 V，理想直流已穩定。A=(15,10)、B=(9.5,10) cm，比較電位與電場大小。','Level tray; 0.1% salt water, depth 1.0 cm. Circles 14 cm apart, radius 0.75 cm; steady ideal DC, left +6 V, right 0 V. A=(15,10), B=(9.5,10) cm: rank V and E.'),
      state:{...S.base,medium:'water',clip:true,drawLines:true,drawField:false,n2:{x:15,y:10}},levels:[1,2,3,4,5],
      concept:[p('先找等位線的數字判斷電位，再看等電位差的線距判斷電場。','Read the contour values to compare potential, then compare spacing for equal voltage gaps to rank the field.')],
      sol:[p(`A 在 3 V 線上；B 位於 5 V 線內、靠正極，所以 \\(V_A<V_B\\)。計算值分別為 ${F.VA.toFixed(3)} V 與 ${F.VB.toFixed(3)} V。`,`A lies on 3 V. B is inside the 5 V contour near the positive electrode, so \\(V_A<V_B\\). The calculated potentials are ${F.VA.toFixed(3)} V and ${F.VB.toFixed(3)} V.`),p('相同 1 V 電位差，B 附近的等位線較密，因此 \\(E_A<E_B\\)。','For the same 1 V gap, the curves near B are closer, so \\(E_A<E_B\\).'),p('「電位高」與「電場強」是兩個不同的量。這張圖碰巧都由 B 較大，不能把它當成一般定律。','High potential and strong field describe different quantities. B happens to be larger in both here; that is not a general law.'),p('在範例分頁分別回答 V、E 的關係，再按確認。水槽與紙的均勻模型給出相同的線形。','Answer the V and E rankings separately in the Examples tab, then check them. The uniform tray and paper models give the same curve shapes.')]
    }
  ];
  return data;
});
