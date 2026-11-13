/* missions/gibbs-free-energy.js — 自由能與自發性的任務（星星數 = 等級 1–10；隱藏任務 = 等級 × 2） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/gibbs-free-energy.js 只在使用者按「記錄這一點」或「核對答案」時送出）：
  //   'record'：{ rx（'vap'…'ozone'／'custom'／'mys'）, mode（'real'／'custom'／'mys'）, T（K）, dH（kJ/mol）, dS（J/(mol·K)）,
  //              dG（kJ/mol）, lnK, log10K, K（可能是 Infinity／0，判定請用 lnK）, valid（在方程式各相合理的溫度範圍內）,
  //              seg（「全部清除」之間的段落）, earlier（同一段較早的紀錄，最多 60 筆，每筆欄位同上）}
  //   'answer'：未知反應按「核對答案」{ errH, errS（相對誤差）, nT（這個未知反應記錄過幾個不同溫度）, tries, revealed }
  const rec = function (ev) { return ev.type === 'record' && ev.data ? ev.data : null; };
  const ans = function (ev) { return ev.type === 'answer' && ev.data ? ev.data : null; };
  const real = function (d) { return d && d.mode === 'real'; };
  const all = function (d) { return (d.earlier || []).concat([d]); };
  const same = function (a, b, tol) { return Math.abs(a - b) <= tol; };
  const tstar = function (d) { return Math.abs(d.dS) > 1e-9 ? 1000 * d.dH / d.dS : NaN; };

  LabMission.register('gibbs-free-energy', [
    {
      id: 'gibbs-free-energy-1', level: 1,
      title: { zh: '水滾了', en: 'The water boils' },
      desc: { zh: '選「水的汽化」，把溫度調到 ΔG° < 0（變成自發），按「記錄這一點」。', en: 'Choose “Water vaporises”, raise the temperature until ΔG° < 0 (spontaneous) and press “Record this point”.' },
      check: function (ev) { const d = rec(ev); return real(d) && d.rx === 'vap' && d.dG < 0; }
    },
    {
      id: 'gibbs-free-energy-2', level: 2,
      title: { zh: '吸熱也能自發', en: 'Endothermic, yet spontaneous' },
      desc: { zh: '選「氯化銨溶解」，在 10–40 °C 之間記錄一筆：它吸熱（ΔH° > 0），卻是自發的（ΔG° < 0）。', en: 'Choose “NH4Cl dissolves” and record a point between 10 and 40 °C: it absorbs heat (ΔH° > 0) yet it is spontaneous (ΔG° < 0).' },
      check: function (ev) { const d = rec(ev); return real(d) && d.rx === 'nh4cl' && d.T >= 283.15 && d.T <= 313.15 && d.dH > 0 && d.dG < 0; }
    },
    {
      id: 'gibbs-free-energy-3', level: 3,
      title: { zh: '找到轉折溫度', en: 'Find the turning point' },
      desc: { zh: '選一個真實的反應，把溫度調到 |ΔG°| ≤ 1.0 kJ/mol（快要平衡了），按「記錄這一點」。', en: 'Choose a real reaction, tune the temperature until |ΔG°| ≤ 1.0 kJ/mol (almost at equilibrium) and press “Record this point”.' },
      check: function (ev) { const d = rec(ev); return real(d) && Math.abs(d.dG) <= 1.0; }
    },
    {
      id: 'gibbs-free-energy-4', level: 3,
      title: { zh: '臭氧不會自己長出來', en: 'Ozone will not make itself' },
      desc: { zh: '選「氧變成臭氧」，在同一段紀錄裡分別在 300 K 以下與 1200 K 以上各記錄一筆，兩筆都是 ΔG° > 0。', en: 'Choose “Oxygen to ozone” and, in the same set of records, record one point below 300 K and one above 1200 K, both with ΔG° > 0.' },
      check: function (ev) {
        const d = rec(ev);
        if (!real(d) || d.rx !== 'ozone') return false;
        const rs = all(d).filter(function (r) { return r.mode === 'real' && r.rx === 'ozone' && r.dG > 0; });
        return rs.some(function (r) { return r.T <= 300; }) && rs.some(function (r) { return r.T >= 1200; });
      }
    },
    {
      id: 'gibbs-free-energy-5', level: 4,
      title: { zh: '石灰窯', en: 'The lime kiln' },
      desc: { zh: '選「石灰石分解」，用剛好夠的溫度讓它自發：ΔG° < 0，而且溫度不超過轉折溫度 T* 加 5 K。', en: 'Choose “Limestone breaks down” and make it spontaneous with just enough heat: ΔG° < 0, at no more than 5 K above the turning temperature T*.' },
      check: function (ev) { const d = rec(ev); return real(d) && d.rx === 'caco3' && d.dG < 0 && d.T <= tstar(d) + 5; }
    },
    {
      id: 'gibbs-free-energy-6', level: 5,
      title: { zh: '冷熱兩樣情', en: 'Hot and cold, two answers' },
      desc: { zh: '同一個真實的反應，在同一段紀錄裡記錄兩筆：一筆自發（ΔG° < 0）、一筆不自發（ΔG° > 0）。', en: 'For one real reaction, record two points in the same set of records: one spontaneous (ΔG° < 0) and one not (ΔG° > 0).' },
      check: function (ev) {
        const d = rec(ev);
        if (!real(d)) return false;
        const rs = all(d).filter(function (r) { return r.mode === 'real' && r.rx === d.rx; });
        return rs.some(function (r) { return r.dG < 0; }) && rs.some(function (r) { return r.dG > 0; });
      }
    },
    {
      id: 'gibbs-free-energy-7', level: 5,
      title: { zh: '四種組合', en: 'All four combinations' },
      desc: { zh: '在同一段紀錄裡記錄四個真實的反應，ΔH° 與 ΔS° 的正負號四種組合（＋＋、＋−、−＋、−−）都要有。', en: 'In the same set of records, record four real reactions that cover all four sign combinations of ΔH° and ΔS° (++, +−, −+, −−).' },
      check: function (ev) {
        const d = rec(ev);
        if (!real(d)) return false;
        const q = {};
        all(d).forEach(function (r) { if (r.mode === 'real') q[(r.dH >= 0 ? '+' : '-') + (r.dS >= 0 ? '+' : '-')] = 1; });
        return Object.keys(q).length === 4;
      }
    },
    {
      id: 'gibbs-free-energy-8', level: 6,
      title: { zh: 'K = 1', en: 'K = 1' },
      desc: { zh: '讓一個真實反應的平衡常數 K 落在 0.995 到 1.005 之間（|ln K| ≤ 0.005），按「記錄這一點」。', en: 'Make the equilibrium constant K of a real reaction fall between 0.995 and 1.005 (|ln K| ≤ 0.005) and press “Record this point”.' },
      check: function (ev) { const d = rec(ev); return real(d) && Math.abs(d.lnK) <= 0.005; }
    },
    {
      id: 'gibbs-free-energy-9', level: 6,
      title: { zh: '設計一個反應', en: 'Design a reaction' },
      desc: { zh: '選「自訂反應」，設計一個低溫自發、高溫不自發，轉折溫度在 495–505 K 的反應；同一組 ΔH°、ΔS° 在 450 K 以下記錄一筆自發的、550 K 以上記錄一筆不自發的。', en: 'Choose “Custom reaction” and design one that is spontaneous when cold but not when hot, turning at 495–505 K; with the same ΔH° and ΔS°, record a spontaneous point below 450 K and a non-spontaneous one above 550 K.' },
      check: function (ev) {
        const d = rec(ev);
        if (!d || d.mode !== 'custom' || !(d.dH < 0 && d.dS < 0)) return false;
        const t = tstar(d);
        if (!(t >= 495 && t <= 505)) return false;
        const rs = all(d).filter(function (r) { return r.mode === 'custom' && same(r.dH, d.dH, 1e-6) && same(r.dS, d.dS, 1e-6); });
        return rs.some(function (r) { return r.T <= 450 && r.dG < 0; }) && rs.some(function (r) { return r.T >= 550 && r.dG > 0; });
      }
    },
    {
      id: 'gibbs-free-energy-10', level: 7,
      title: { zh: '破解未知反應', en: 'Crack the unknown reaction' },
      desc: { zh: '在下方的未知反應卡片按「開始」，在幾個溫度記錄 K，自己由 ΔG° = −RT ln K 算出 ΔH°，誤差在 5% 以內（揭曉答案之前）。', en: 'Press “Start” on the unknown-reaction card below, record K at several temperatures, work out ΔH° yourself from ΔG° = −RT ln K, within 5% (before revealing the answer).' },
      check: function (ev) { const d = ans(ev); return !!d && !d.revealed && d.errH <= 0.05; }
    },
    {
      id: 'gibbs-free-energy-11', level: 8,
      title: { zh: '完全破解', en: 'Fully cracked' },
      desc: { zh: '未知反應的 ΔH° 與 ΔS° 都算到誤差 2% 以內（揭曉答案之前）。', en: 'Find both ΔH° and ΔS° of the unknown reaction within 2% (before revealing the answer).' },
      check: function (ev) { const d = ans(ev); return !!d && !d.revealed && d.errH <= 0.02 && d.errS <= 0.02; }
    },
    {
      id: 'gibbs-free-energy-12', level: 10,
      title: { zh: '兩點定江山', en: 'Two points are enough' },
      desc: { zh: '這個未知反應只記錄兩個不同的溫度，就把 ΔH° 與 ΔS° 都算到誤差 1% 以內（揭曉答案之前）。', en: 'Record the unknown reaction at only two different temperatures and still find both ΔH° and ΔS° within 1% (before revealing the answer).' },
      check: function (ev) { const d = ans(ev); return !!d && !d.revealed && d.nT === 2 && d.errH <= 0.01 && d.errS <= 0.01; }
    },

    // ---------- 隱藏任務（只給隱晦的提示；完成時不說原因） ----------
    {
      // 冷敷包泡在冰水裡：NH4Cl 溶解 ΔH° > 0，但 ΔS° > 0 使 T* 只有 196 K，所以 0–5 °C 仍然自發（邊溶邊吸熱）
      id: 'gibbs-free-energy-h1', level: 3, hidden: true,
      riddle: { zh: '泡在冰水裡，它仍然執意散開，一邊散開，一邊讓身邊更冷。', en: 'Even sitting in ice water it insists on spreading out, and makes its surroundings colder as it goes.' },
      check: function (ev) { const d = rec(ev); return real(d) && d.rx === 'nh4cl' && d.valid && d.T <= 278.15 && d.dG < 0; }
    },
    {
      // 同樣約 700 K（400–450 °C 的工廠爐溫）：接觸法 2SO₂ + O₂ → 2SO₃ 自發，哈柏法 ΔG° > 0（K < 1），工廠仍為了速率用這個溫度
      id: 'gibbs-free-energy-h2', level: 4, hidden: true,
      riddle: { zh: '同一座爐火旁，一家欣然點頭；另一家明知帳面吃虧，仍為了快一點而留下。', en: 'Beside the same furnace, one maker nods gladly; the other stays on, knowing the books are against it, just to be quicker.' },
      check: function (ev) {
        const d = rec(ev);
        if (!real(d) || (d.rx !== 'haber' && d.rx !== 'so3')) return false;
        const rs = all(d).filter(function (r) { return r.mode === 'real' && r.T >= 650 && r.T <= 750; });
        const hb = rs.filter(function (r) { return r.rx === 'haber' && r.dG > 0; });
        const so = rs.filter(function (r) { return r.rx === 'so3' && r.dG < 0; });
        return hb.some(function (a) { return so.some(function (b) { return same(a.T, b.T, 10); }); });
      }
    },
    {
      // ΔS° = 0：ΔG° = ΔH°，溫度改變不了自發性
      id: 'gibbs-free-energy-h3', level: 5, hidden: true,
      riddle: { zh: '沒有混亂可以交換的，冷也好、熱也罷，都說服不了它。', en: 'With no disorder to trade, neither cold nor heat can win it over.' },
      check: function (ev) {
        const d = rec(ev);
        if (!d || d.mode !== 'custom' || Math.abs(d.dS) > 0.5 || Math.abs(d.dH) < 5) return false;
        const rs = all(d).filter(function (r) { return r.mode === 'custom' && Math.abs(r.dS) <= 0.5 && same(r.dH, d.dH, 0.01); });
        return rs.some(function (r) { return Math.abs(r.T - d.T) >= 800; });
      }
    },
    {
      // 3O₂ → 2O₃：ΔH° > 0、ΔS° < 0，K 在低溫小到 10 的 −98 次方以下（約 162–164 K，臭氧沸點之上的最冷處）
      id: 'gibbs-free-energy-h4', level: 6, hidden: true,
      riddle: { zh: '替天空縫一面盾，挑最冷的夜晚動手：成功的機會，小得數不完那一長串零。', en: 'Sew a shield for the sky on the coldest night you can: the odds have more zeros than you could ever count.' },
      check: function (ev) { const d = rec(ev); return real(d) && d.rx === 'ozone' && d.valid && d.log10K <= -98; }
    },
    {
      // 逆反應：自訂的 ΔH°、ΔS° 恰為某個真實反應的相反數、同一個溫度 → ΔG° 互為相反數
      id: 'gibbs-free-energy-h5', level: 6, hidden: true,
      riddle: { zh: '對著鏡子把來時路再走一遍，回到原點時，帳本剛好歸零。', en: 'Walk the same road again in the mirror; back where you began, the ledger reads exactly zero.' },
      check: function (ev) {
        const d = rec(ev);
        if (!d || d.mode !== 'custom') return false;
        return (d.earlier || []).some(function (r) { return r.mode === 'real' && same(r.T, d.T, 0.5) && same(d.dH, -r.dH, 0.3) && same(d.dS, -r.dS, 1.0); });
      }
    },
    {
      // 冰的熔化：ΔH = 6.01 kJ/mol、ΔS = 22.0 J/(mol·K)，在 273.15 K 平衡
      id: 'gibbs-free-energy-h6', level: 7, hidden: true,
      riddle: { zh: '親手寫下一座湖的身世：在不冷也不暖的那一刻，它猶豫不決。', en: 'Write the life story of a lake with your own hand: at the moment it is neither cold nor warm, it cannot make up its mind.' },
      check: function (ev) {
        const d = rec(ev);
        return !!d && d.mode === 'custom' && same(d.dH, 6.01, 0.06) && same(d.dS, 22.0, 0.3) && same(d.T, 273.15, 0.5) && Math.abs(d.dG) <= 0.05;
      }
    },
    {
      // 偶合反應：非自發（ΔG° ≥ 20）的真實反應，配上同溫度自發的自訂反應，總 ΔG° 剛好小於零（−5 到 −0.5 kJ/mol）
      id: 'gibbs-free-energy-h7', level: 8, hidden: true,
      riddle: { zh: '自己推不動的石頭，找一個愛往下滾的夥伴，兩個一起剛好翻過山頭。', en: 'A stone that will not roll on its own: find a partner who loves rolling downhill, and together just clear the hilltop.' },
      check: function (ev) {
        const d = rec(ev);
        if (!d || d.mode !== 'custom' || !(d.dG < 0)) return false;
        return (d.earlier || []).some(function (r) {
          if (r.mode !== 'real' || !r.valid || !(r.dG >= 20) || !same(r.T, d.T, 0.5)) return false;
          const mirror = same(d.dH, -r.dH, 0.3) && same(d.dS, -r.dS, 1.0);
          const sum = r.dG + d.dG;
          return !mirror && sum >= -5 && sum < -0.5;
        });
      }
    },
    {
      // 開放的窯：空氣中 CO₂ 分壓約 4.2 × 10^−4 bar，K = P(CO₂) 達到它時石灰石就開始分解（約 797 K，比 T* 低三百多度）
      id: 'gibbs-free-energy-h8', level: 8, hidden: true,
      riddle: { zh: '窯不必燒到書上說的那麼熱——只要天空肯收下它吐出的那一口氣。', en: 'The kiln need not be as hot as the book says — only hot enough for the sky to accept the breath it lets out.' },
      check: function (ev) { const d = rec(ev); return real(d) && d.rx === 'caco3' && d.lnK >= Math.log(4.0e-4) && d.lnK <= Math.log(4.4e-4); }
    },
    {
      // 聖母峰頂約 0.337 bar：水的蒸氣壓 K = P 時沸騰，近似算出約 71 °C
      id: 'gibbs-free-energy-h9', level: 9, hidden: true,
      riddle: { zh: '在世界的屋頂燒一壺水，它會比你想的更早翻滾。', en: 'Put a kettle on the roof of the world: it starts to roll sooner than you think.' },
      check: function (ev) { const d = rec(ev); return real(d) && d.rx === 'vap' && d.lnK >= Math.log(0.32) && d.lnK <= Math.log(0.355); }
    },
    {
      // N₂O₄ ⇌ 2NO₂ 在總壓 1 bar 下一半解離：α = 0.5 → K = 4α²/(1 − α²) = 4/3（約 329.6 K）
      id: 'gibbs-free-energy-h10', level: 10, hidden: true,
      riddle: { zh: '紅棕色的煙裡，正好一半的伴侶已經分手。', en: 'In the brown smoke, exactly half of the couples have already parted.' },
      check: function (ev) { const d = rec(ev); return real(d) && d.rx === 'n2o4' && d.valid && d.lnK >= Math.log(1.30) && d.lnK <= Math.log(1.37); }
    }
  ]);
})();
