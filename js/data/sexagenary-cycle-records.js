/* 書目與年代隨站打包。歷史資料只摘錄名稱、年數，文字與圖像自製。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SexagenaryRecords = factory();
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const sources = {
    war: ['國防部〈抗日戰史概述〉', 'Ministry of National Defense, historical chronology', 'https://www.mnd.gov.tw/en/informationservices/publication/70697'],
    reform: ['教育部《重編國語辭典修訂本》「百日維新」', 'Ministry of Education, entry on the Hundred Days’ Reform', 'https://dict.revised.moe.edu.tw/dictView.jsp?ID=14390&la=0&powerMode=0'],
    republic: ['總統府〈國父〉', 'Office of the President, biography of Sun Yat-sen', 'https://www.president.gov.tw/Page/49'],
    years: ['內政部戶政司〈年歲對照表〉', 'Department of Household Registration, year concordance', 'https://www.ris.gov.tw/documents/html/8/1/219.html'],
    cycle: ['香港天文台〈天干和地支〉', 'Hong Kong Observatory, Heavenly Stems and Earthly Branches', 'https://www.hko.gov.hk/tc/gts/time/stemsandbranches.htm', 'https://www.hko.gov.hk/en/gts/time/stemsandbranches.htm'],
    zodiac: ['香港天文台〈十二生肖〉', 'Hong Kong Observatory, The 12-Year Animal Cycle', 'https://www.hko.gov.hk/tc/gts/time/12animals.htm', 'https://www.hko.gov.hk/en/gts/time/12animals.htm'],
    anchor: ['香港天文台《1984 年公曆與農曆日期對照表》', 'Hong Kong Observatory, 1984 calendar', 'https://www.hko.gov.hk/tc/gts/time/calendar/pdf/files/1984.pdf'],
    boundary: ['香港天文台〈今夕是何年？〉', 'Hong Kong Observatory, Which year is it?', 'https://www.hko.gov.hk/tc/education/astronomy-and-time/time-service/00506-what-year-is-it-today.html'],
    bc: ['美國太空總署〈Year Dating Conventions〉', 'NASA, Year Dating Conventions', 'https://eclipse.gsfc.nasa.gov/SEhelp/dates.html']
  };
  const events = [
    { year:1894, title:['甲午戰爭開戰','First Sino-Japanese War begins'], reign:'guangxu', era:['光緒二十年','Guangxu 20'], source:'war' },
    { year:1895, title:['馬關條約簽訂','Treaty of Shimonoseki signed'], reign:'guangxu', era:['光緒二十一年','Guangxu 21'], source:'war' },
    { year:1898, title:['戊戌變法','Hundred Days’ Reform'], reign:'guangxu', era:['光緒二十四年','Guangxu 24'], source:'reform' },
    { year:1911, title:['辛亥革命・武昌起義','Xinhai Revolution: Wuchang Uprising'], reign:'xuantong', era:['宣統三年','Xuantong 3'], source:'republic' }
  ];
  return { sources, events };
});
