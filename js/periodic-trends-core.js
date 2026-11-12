/*
 * periodic-trends-core.js — 「週期表與週期性」的化學核心（數據與計算，與畫面無關，Node 可直接 require）
 *
 * 數據來源（2026-11-12 下載並逐項核對）：
 *   - 原子量、電子組態、電負度（鮑林）、第一游離能（eV）、電子親和力（eV）、熔點與沸點（K）、密度（g/cm³）、標準狀態、元素類別：
 *     PubChem Periodic Table（美國國家醫學圖書館 NCBI；游離能取自 NIST Atomic Spectra Database，其他欄位整理自 CRC Handbook 等）
 *     https://pubchem.ncbi.nlm.nih.gov/periodic-table/ （CSV：https://pubchem.ncbi.nlm.nih.gov/rest/pug/periodictable/CSV）
 *   - 原子半徑：單鍵共價半徑（pm），P. Pyykkö & M. Atsumi, Chem. Eur. J. 15, 186–197 (2009)（自洽擬合，1–118 號同一套定義，含鈍氣）。
 *     由維基百科「Atomic radii of the elements (data page)」與「Covalent radius」兩頁的表格交叉核對，兩頁數值一致。
 *   電子親和力一欄（RAW 第 8 項）不採用：PubChem 有些是舊值（例如氟 3.339 eV，NIST 現值 3.4012 eV），頁面不顯示。
 *   空白（null）表示來源沒有數據：例如鈍氣沒有鮑林電負度、超重元素的大多數性質。
 *   電子組態標「預測」的是 109 號以後的理論值。
 *
 * 版面：照真正的週期表排（18 族、7 週期）；鑭系（57–71）與錒系（89–103）照一般課本放在下方兩列，第 3 族第 6、7 週期的格子是它們的位置記號。
 */
(function (root) {
  'use strict';
  const F_KJ = 96.48533212;   // 1 eV/粒子 = 96.485 kJ/mol（F = N_A·e）
  // [符號, 英文名, 原子量, 電子組態, 電負度, 共價半徑 pm, 第一游離能 eV, 電子親和力 eV, 熔點 K, 沸點 K, 密度 g/cm³, 狀態, 類別, 組態是預測]
  const RAW = [
    ["H", "Hydrogen", "1.0080", "1s1", 2.2, 32, 13.598, 0.754, 13.81, 20.28, 8.988e-05, "g", "nm", 0],   // 1
    ["He", "Helium", "4.00260", "1s2", null, 46, 24.587, null, 0.95, 4.22, 0.0001785, "g", "ng", 0],   // 2
    ["Li", "Lithium", "7.0", "[He]2s1", 0.98, 133, 5.392, 0.618, 453.65, 1615, 0.534, "s", "alk", 0],   // 3
    ["Be", "Beryllium", "9.012183", "[He]2s2", 1.57, 102, 9.323, null, 1560, 2744, 1.85, "s", "ae", 0],   // 4
    ["B", "Boron", "10.81", "[He]2s2 2p1", 2.04, 85, 8.298, 0.277, 2348, 4273, 2.37, "s", "mtd", 0],   // 5
    ["C", "Carbon", "12.011", "[He]2s2 2p2", 2.55, 75, 11.26, 1.263, 3823, 4098, 2.267, "s", "nm", 0],   // 6
    ["N", "Nitrogen", "14.007", "[He]2s2 2p3", 3.04, 71, 14.534, null, 63.15, 77.36, 0.0012506, "g", "nm", 0],   // 7
    ["O", "Oxygen", "15.999", "[He]2s2 2p4", 3.44, 63, 13.618, 1.461, 54.36, 90.2, 0.001429, "g", "nm", 0],   // 8
    ["F", "Fluorine", "18.99840316", "[He]2s2 2p5", 3.98, 64, 17.423, 3.339, 53.53, 85.03, 0.001696, "g", "hal", 0],   // 9
    ["Ne", "Neon", "20.180", "[He]2s2 2p6", null, 67, 21.565, null, 24.56, 27.07, 0.0008999, "g", "ng", 0],   // 10
    ["Na", "Sodium", "22.9897693", "[Ne]3s1", 0.93, 155, 5.139, 0.548, 370.95, 1156, 0.97, "s", "alk", 0],   // 11
    ["Mg", "Magnesium", "24.305", "[Ne]3s2", 1.31, 139, 7.646, null, 923, 1363, 1.74, "s", "ae", 0],   // 12
    ["Al", "Aluminum", "26.981538", "[Ne]3s2 3p1", 1.61, 126, 5.986, 0.441, 933.437, 2792, 2.7, "s", "ptm", 0],   // 13
    ["Si", "Silicon", "28.085", "[Ne]3s2 3p2", 1.9, 116, 8.152, 1.385, 1687, 3538, 2.3296, "s", "mtd", 0],   // 14
    ["P", "Phosphorus", "30.97376200", "[Ne]3s2 3p3", 2.19, 111, 10.487, 0.746, 317.3, 553.65, 1.82, "s", "nm", 0],   // 15
    ["S", "Sulfur", "32.07", "[Ne]3s2 3p4", 2.58, 103, 10.36, 2.077, 388.36, 717.75, 2.067, "s", "nm", 0],   // 16
    ["Cl", "Chlorine", "35.45", "[Ne]3s2 3p5", 3.16, 99, 12.968, 3.617, 171.65, 239.11, 0.003214, "g", "hal", 0],   // 17
    ["Ar", "Argon", "39.9", "[Ne]3s2 3p6", null, 96, 15.76, null, 83.8, 87.3, 0.0017837, "g", "ng", 0],   // 18
    ["K", "Potassium", "39.0983", "[Ar]4s1", 0.82, 196, 4.341, 0.501, 336.53, 1032, 0.89, "s", "alk", 0],   // 19
    ["Ca", "Calcium", "40.08", "[Ar]4s2", 1, 171, 6.113, null, 1115, 1757, 1.54, "s", "ae", 0],   // 20
    ["Sc", "Scandium", "44.95591", "[Ar]4s2 3d1", 1.36, 148, 6.561, 0.188, 1814, 3109, 2.99, "s", "tm", 0],   // 21
    ["Ti", "Titanium", "47.867", "[Ar]4s2 3d2", 1.54, 136, 6.828, 0.079, 1941, 3560, 4.5, "s", "tm", 0],   // 22
    ["V", "Vanadium", "50.9415", "[Ar]4s2 3d3", 1.63, 134, 6.746, 0.525, 2183, 3680, 6, "s", "tm", 0],   // 23
    ["Cr", "Chromium", "51.996", "[Ar]3d5 4s1", 1.66, 122, 6.767, 0.666, 2180, 2944, 7.15, "s", "tm", 0],   // 24
    ["Mn", "Manganese", "54.93804", "[Ar]4s2 3d5", 1.55, 119, 7.434, null, 1519, 2334, 7.3, "s", "tm", 0],   // 25
    ["Fe", "Iron", "55.84", "[Ar]4s2 3d6", 1.83, 116, 7.902, 0.163, 1811, 3134, 7.874, "s", "tm", 0],   // 26
    ["Co", "Cobalt", "58.93319", "[Ar]4s2 3d7", 1.88, 111, 7.881, 0.661, 1768, 3200, 8.86, "s", "tm", 0],   // 27
    ["Ni", "Nickel", "58.693", "[Ar]4s2 3d8", 1.91, 110, 7.64, 1.156, 1728, 3186, 8.912, "s", "tm", 0],   // 28
    ["Cu", "Copper", "63.55", "[Ar]4s1 3d10", 1.9, 112, 7.726, 1.228, 1357.77, 2835, 8.933, "s", "tm", 0],   // 29
    ["Zn", "Zinc", "65.4", "[Ar]4s2 3d10", 1.65, 118, 9.394, null, 692.68, 1180, 7.134, "s", "tm", 0],   // 30
    ["Ga", "Gallium", "69.723", "[Ar]4s2 3d10 4p1", 1.81, 124, 5.999, 0.3, 302.91, 2477, 5.91, "s", "ptm", 0],   // 31
    ["Ge", "Germanium", "72.63", "[Ar]4s2 3d10 4p2", 2.01, 121, 7.9, 1.35, 1211.4, 3106, 5.323, "s", "mtd", 0],   // 32
    ["As", "Arsenic", "74.92159", "[Ar]4s2 3d10 4p3", 2.18, 121, 9.815, 0.81, 1090, 887, 5.776, "s", "mtd", 0],   // 33
    ["Se", "Selenium", "78.97", "[Ar]4s2 3d10 4p4", 2.55, 116, 9.752, 2.021, 493.65, 958, 4.809, "s", "nm", 0],   // 34
    ["Br", "Bromine", "79.90", "[Ar]4s2 3d10 4p5", 2.96, 114, 11.814, 3.365, 265.95, 331.95, 3.11, "l", "hal", 0],   // 35
    ["Kr", "Krypton", "83.80", "[Ar]4s2 3d10 4p6", 3, 117, 14, null, 115.79, 119.93, 0.003733, "g", "ng", 0],   // 36
    ["Rb", "Rubidium", "85.468", "[Kr]5s1", 0.82, 210, 4.177, 0.468, 312.46, 961, 1.53, "s", "alk", 0],   // 37
    ["Sr", "Strontium", "87.62", "[Kr]5s2", 0.95, 185, 5.695, null, 1050, 1655, 2.64, "s", "ae", 0],   // 38
    ["Y", "Yttrium", "88.90584", "[Kr]5s2 4d1", 1.22, 163, 6.217, 0.307, 1795, 3618, 4.47, "s", "tm", 0],   // 39
    ["Zr", "Zirconium", "91.22", "[Kr]5s2 4d2", 1.33, 154, 6.634, 0.426, 2128, 4682, 6.52, "s", "tm", 0],   // 40
    ["Nb", "Niobium", "92.90637", "[Kr]5s1 4d4", 1.6, 147, 6.759, 0.893, 2750, 5017, 8.57, "s", "tm", 0],   // 41
    ["Mo", "Molybdenum", "95.95", "[Kr]5s1 4d5", 2.16, 138, 7.092, 0.746, 2896, 4912, 10.2, "s", "tm", 0],   // 42
    ["Tc", "Technetium", "96.90636", "[Kr]5s2 4d5", 1.9, 128, 7.28, 0.55, 2430, 4538, 11, "s", "tm", 0],   // 43
    ["Ru", "Ruthenium", "101.1", "[Kr]5s1 4d7", 2.2, 125, 7.361, 1.05, 2607, 4423, 12.1, "s", "tm", 0],   // 44
    ["Rh", "Rhodium", "102.9055", "[Kr]5s1 4d8", 2.28, 125, 7.459, 1.137, 2237, 3968, 12.4, "s", "tm", 0],   // 45
    ["Pd", "Palladium", "106.42", "[Kr]4d10", 2.2, 120, 8.337, 0.557, 1828.05, 3236, 12, "s", "tm", 0],   // 46
    ["Ag", "Silver", "107.868", "[Kr]5s1 4d10", 1.93, 128, 7.576, 1.302, 1234.93, 2435, 10.501, "s", "tm", 0],   // 47
    ["Cd", "Cadmium", "112.41", "[Kr]5s2 4d10", 1.69, 136, 8.994, null, 594.22, 1040, 8.69, "s", "tm", 0],   // 48
    ["In", "Indium", "114.818", "[Kr]5s2 4d10 5p1", 1.78, 142, 5.786, 0.3, 429.75, 2345, 7.31, "s", "ptm", 0],   // 49
    ["Sn", "Tin", "118.71", "[Kr]5s2 4d10 5p2", 1.96, 140, 7.344, 1.2, 505.08, 2875, 7.287, "s", "ptm", 0],   // 50
    ["Sb", "Antimony", "121.760", "[Kr]5s2 4d10 5p3", 2.05, 140, 8.64, 1.07, 903.78, 1860, 6.685, "s", "mtd", 0],   // 51
    ["Te", "Tellurium", "127.6", "[Kr]5s2 4d10 5p4", 2.1, 136, 9.01, 1.971, 722.66, 1261, 6.232, "s", "mtd", 0],   // 52
    ["I", "Iodine", "126.9045", "[Kr]5s2 4d10 5p5", 2.66, 133, 10.451, 3.059, 386.85, 457.55, 4.93, "s", "hal", 0],   // 53
    ["Xe", "Xenon", "131.29", "[Kr]5s2 4d10 5p6", 2.6, 131, 12.13, null, 161.36, 165.03, 0.005887, "g", "ng", 0],   // 54
    ["Cs", "Cesium", "132.9054520", "[Xe]6s1", 0.79, 232, 3.894, 0.472, 301.59, 944, 1.93, "s", "alk", 0],   // 55
    ["Ba", "Barium", "137.33", "[Xe]6s2", 0.89, 196, 5.212, null, 1000, 2170, 3.62, "s", "ae", 0],   // 56
    ["La", "Lanthanum", "138.9055", "[Xe]6s2 5d1", 1.1, 180, 5.577, 0.5, 1191, 3737, 6.15, "s", "lan", 0],   // 57
    ["Ce", "Cerium", "140.116", "[Xe]6s2 4f1 5d1", 1.12, 163, 5.539, 0.5, 1071, 3697, 6.77, "s", "lan", 0],   // 58
    ["Pr", "Praseodymium", "140.90766", "[Xe]6s2 4f3", 1.13, 176, 5.464, null, 1204, 3793, 6.77, "s", "lan", 0],   // 59
    ["Nd", "Neodymium", "144.24", "[Xe]6s2 4f4", 1.14, 174, 5.525, null, 1294, 3347, 7.01, "s", "lan", 0],   // 60
    ["Pm", "Promethium", "144.91276", "[Xe]6s2 4f5", null, 173, 5.55, null, 1315, 3273, 7.26, "s", "lan", 0],   // 61
    ["Sm", "Samarium", "150.4", "[Xe]6s2 4f6", 1.17, 172, 5.644, null, 1347, 2067, 7.52, "s", "lan", 0],   // 62
    ["Eu", "Europium", "151.964", "[Xe]6s2 4f7", null, 168, 5.67, null, 1095, 1802, 5.24, "s", "lan", 0],   // 63
    ["Gd", "Gadolinium", "157.25", "[Xe]6s2 4f7 5d1", 1.2, 169, 6.15, null, 1586, 3546, 7.9, "s", "lan", 0],   // 64
    ["Tb", "Terbium", "158.92535", "[Xe]6s2 4f9", null, 168, 5.864, null, 1629, 3503, 8.23, "s", "lan", 0],   // 65
    ["Dy", "Dysprosium", "162.500", "[Xe]6s2 4f10", 1.22, 167, 5.939, null, 1685, 2840, 8.55, "s", "lan", 0],   // 66
    ["Ho", "Holmium", "164.93033", "[Xe]6s2 4f11", 1.23, 166, 6.022, null, 1747, 2973, 8.8, "s", "lan", 0],   // 67
    ["Er", "Erbium", "167.26", "[Xe]6s2 4f12", 1.24, 165, 6.108, null, 1802, 3141, 9.07, "s", "lan", 0],   // 68
    ["Tm", "Thulium", "168.93422", "[Xe]6s2 4f13", 1.25, 164, 6.184, null, 1818, 2223, 9.32, "s", "lan", 0],   // 69
    ["Yb", "Ytterbium", "173.05", "[Xe]6s2 4f14", null, 170, 6.254, null, 1092, 1469, 6.9, "s", "lan", 0],   // 70
    ["Lu", "Lutetium", "174.9667", "[Xe]6s2 4f14 5d1", 1.27, 162, 5.426, null, 1936, 3675, 9.84, "s", "lan", 0],   // 71
    ["Hf", "Hafnium", "178.49", "[Xe]6s2 4f14 5d2", 1.3, 152, 6.825, null, 2506, 4876, 13.3, "s", "tm", 0],   // 72
    ["Ta", "Tantalum", "180.9479", "[Xe]6s2 4f14 5d3", 1.5, 146, 7.89, 0.322, 3290, 5731, 16.4, "s", "tm", 0],   // 73
    ["W", "Tungsten", "183.84", "[Xe]6s2 4f14 5d4", 2.36, 137, 7.98, 0.815, 3695, 5828, 19.3, "s", "tm", 0],   // 74
    ["Re", "Rhenium", "186.207", "[Xe]6s2 4f14 5d5", 1.9, 131, 7.88, 0.15, 3459, 5869, 20.8, "s", "tm", 0],   // 75
    ["Os", "Osmium", "190.2", "[Xe]6s2 4f14 5d6", 2.2, 129, 8.7, 1.1, 3306, 5285, 22.57, "s", "tm", 0],   // 76
    ["Ir", "Iridium", "192.22", "[Xe]6s2 4f14 5d7", 2.2, 122, 9.1, 1.565, 2719, 4701, 22.42, "s", "tm", 0],   // 77
    ["Pt", "Platinum", "195.08", "[Xe]6s1 4f14 5d9", 2.28, 123, 9, 2.128, 2041.55, 4098, 21.46, "s", "tm", 0],   // 78
    ["Au", "Gold", "196.96657", "[Xe]6s1 4f14 5d10", 2.54, 124, 9.226, 2.309, 1337.33, 3129, 19.282, "s", "tm", 0],   // 79
    ["Hg", "Mercury", "200.59", "[Xe]6s2 4f14 5d10", 2, 133, 10.438, null, 234.32, 629.88, 13.5336, "l", "tm", 0],   // 80
    ["Tl", "Thallium", "204.383", "[Xe]6s2 4f14 5d10 6p1", 1.62, 144, 6.108, 0.2, 577, 1746, 11.8, "s", "ptm", 0],   // 81
    ["Pb", "Lead", "207", "[Xe]6s2 4f14 5d10 6p2", 2.33, 144, 7.417, 0.36, 600.61, 2022, 11.342, "s", "ptm", 0],   // 82
    ["Bi", "Bismuth", "208.98040", "[Xe]6s2 4f14 5d10 6p3", 2.02, 151, 7.289, 0.946, 544.55, 1837, 9.807, "s", "ptm", 0],   // 83
    ["Po", "Polonium", "208.98243", "[Xe]6s2 4f14 5d10 6p4", 2, 145, 8.417, 1.9, 527, 1235, 9.32, "s", "mtd", 0],   // 84
    ["At", "Astatine", "209.98715", "[Xe]6s2 4f14 5d10 6p5", 2.2, 147, 9.5, 2.8, 575, null, 7, "s", "hal", 0],   // 85
    ["Rn", "Radon", "222.01758", "[Xe]6s2 4f14 5d10 6p6", null, 142, 10.745, null, 202, 211.45, 0.00973, "g", "ng", 0],   // 86
    ["Fr", "Francium", "223.01973", "[Rn]7s1", 0.7, null, 3.9, 0.47, 300, null, null, "s", "alk", 0],   // 87
    ["Ra", "Radium", "226.02541", "[Rn]7s2", 0.9, 201, 5.279, null, 973, 1413, 5, "s", "ae", 0],   // 88
    ["Ac", "Actinium", "227.02775", "[Rn]7s2 6d1", 1.1, 186, 5.17, null, 1324, 3471, 10.07, "s", "act", 0],   // 89
    ["Th", "Thorium", "232.038", "[Rn]7s2 6d2", 1.3, 175, 6.08, null, 2023, 5061, 11.72, "s", "act", 0],   // 90
    ["Pa", "Protactinium", "231.03588", "[Rn]7s2 5f2 6d1", 1.5, 169, 5.89, null, 1845, null, 15.37, "s", "act", 0],   // 91
    ["U", "Uranium", "238.0289", "[Rn]7s2 5f3 6d1", 1.38, 170, 6.194, null, 1408, 4404, 18.95, "s", "act", 0],   // 92
    ["Np", "Neptunium", "237.048172", "[Rn]7s2 5f4 6d1", 1.36, 171, 6.266, null, 917, 4175, 20.25, "s", "act", 0],   // 93
    ["Pu", "Plutonium", "244.06420", "[Rn]7s2 5f6", 1.28, 172, 6.06, null, 913, 3501, 19.84, "s", "act", 0],   // 94
    ["Am", "Americium", "243.061380", "[Rn]7s2 5f7", 1.3, 166, 5.993, null, 1449, 2284, 13.69, "s", "act", 0],   // 95
    ["Cm", "Curium", "247.07035", "[Rn]7s2 5f7 6d1", 1.3, 166, 6.02, null, 1618, 3400, 13.51, "s", "act", 0],   // 96
    ["Bk", "Berkelium", "247.07031", "[Rn]7s2 5f9", 1.3, 168, 6.23, null, 1323, null, 14, "s", "act", 0],   // 97
    ["Cf", "Californium", "251.07959", "[Rn]7s2 5f10", 1.3, 168, 6.3, null, 1173, null, null, "s", "act", 0],   // 98
    ["Es", "Einsteinium", "252.0830", "[Rn]7s2 5f11", 1.3, 165, 6.42, null, 1133, null, null, "s", "act", 0],   // 99
    ["Fm", "Fermium", "257.09511", "[Rn]5f12 7s2", 1.3, 167, 6.5, null, 1800, null, null, "s", "act", 0],   // 100
    ["Md", "Mendelevium", "258.09843", "[Rn]7s2 5f13", 1.3, 173, 6.58, null, 1100, null, null, "s", "act", 0],   // 101
    ["No", "Nobelium", "259.10100", "[Rn]7s2 5f14", 1.3, 176, 6.65, null, 1100, null, null, "s", "act", 0],   // 102
    ["Lr", "Lawrencium", "266.120", "[Rn]7s2 5f14 6d1", 1.3, null, null, null, 1900, null, null, "s", "act", 0],   // 103
    ["Rf", "Rutherfordium", "267.122", "[Rn]7s2 5f14 6d2", null, null, null, null, null, null, null, "s", "tm", 0],   // 104
    ["Db", "Dubnium", "268.126", "[Rn]7s2 5f14 6d3", null, null, null, null, null, null, null, "s", "tm", 0],   // 105
    ["Sg", "Seaborgium", "269.128", "[Rn]7s2 5f14 6d4", null, null, null, null, null, null, null, "s", "tm", 0],   // 106
    ["Bh", "Bohrium", "270.133", "[Rn]7s2 5f14 6d5", null, null, null, null, null, null, null, "s", "tm", 0],   // 107
    ["Hs", "Hassium", "269.1336", "[Rn]7s2 5f14 6d6", null, null, null, null, null, null, null, "s", "tm", 0],   // 108
    ["Mt", "Meitnerium", "277.154", "[Rn]7s2 5f14 6d7", null, null, null, null, null, null, null, "s", "tm", 1],   // 109
    ["Ds", "Darmstadtium", "282.166", "[Rn]7s2 5f14 6d8", null, null, null, null, null, null, null, "s?", "tm", 1],   // 110
    ["Rg", "Roentgenium", "282.169", "[Rn]7s2 5f14 6d9", null, null, null, null, null, null, null, "s?", "tm", 1],   // 111
    ["Cn", "Copernicium", "286.179", "[Rn]7s2 5f14 6d10", null, null, null, null, null, null, null, "s?", "tm", 1],   // 112
    ["Nh", "Nihonium", "286.182", "[Rn]5f14 6d10 7s2 7p1", null, null, null, null, null, null, null, "s?", "ptm", 1],   // 113
    ["Fl", "Flerovium", "290.192", "[Rn]7s2 7p2 5f14 6d10", null, null, null, null, null, null, null, "s?", "ptm", 1],   // 114
    ["Mc", "Moscovium", "290.196", "[Rn]7s2 7p3 5f14 6d10", null, null, null, null, null, null, null, "s?", "ptm", 1],   // 115
    ["Lv", "Livermorium", "293.205", "[Rn]7s2 7p4 5f14 6d10", null, null, null, null, null, null, null, "s?", "ptm", 1],   // 116
    ["Ts", "Tennessine", "294.211", "[Rn]7s2 7p5 5f14 6d10", null, null, null, null, null, null, null, "s?", "hal", 1],   // 117
    ["Og", "Oganesson", "295.216", "[Rn]7s2 7p6 5f14 6d10", null, null, null, null, null, null, null, "g?", "ng", 1],   // 118
  ];
  const ZH = ('氫 氦 鋰 鈹 硼 碳 氮 氧 氟 氖 鈉 鎂 鋁 矽 磷 硫 氯 氬 鉀 鈣 鈧 鈦 釩 鉻 錳 鐵 鈷 鎳 銅 鋅 鎵 鍺 砷 硒 溴 氪 ' +
    '銣 鍶 釔 鋯 鈮 鉬 鎝 釕 銠 鈀 銀 鎘 銦 錫 銻 碲 碘 氙 銫 鋇 鑭 鈰 鐠 釹 鉕 釤 銪 釓 鋱 鏑 鈥 鉺 銩 鐿 鎦 鉿 鉭 鎢 錸 鋨 銥 鉑 金 汞 ' +
    '鉈 鉛 鉍 釙 砈 氡 鍅 鐳 錒 釷 鏷 鈾 錼 鈽 鋂 鋦 鉳 鉲 鑀 鐨 鍆 鍩 鐒 鑪 𨧀 𨭎 𨨏 𨭆 䥑 鐽 錀 鎶 鉨 鈇 鏌 鉝 鿬 鿫').split(' ');
  const CATS = {
    alk: ['鹼金屬', 'Alkali metal'], ae: ['鹼土金屬', 'Alkaline earth metal'], tm: ['過渡金屬', 'Transition metal'],
    ptm: ['過渡後金屬', 'Post-transition metal'], mtd: ['類金屬', 'Metalloid'], nm: ['非金屬', 'Nonmetal'], hal: ['鹵素', 'Halogen'],
    ng: ['鈍氣', 'Noble gas'], lan: ['鑭系元素', 'Lanthanide'], act: ['錒系元素', 'Actinide']
  };
  const METAL_CATS = { alk: 1, ae: 1, tm: 1, ptm: 1, lan: 1, act: 1 };

  const EL = [null];
  RAW.forEach(function (r, i) {
    const Z = i + 1;
    EL.push({
      Z: Z, sym: r[0], en: r[1], zh: ZH[i], mass: r[2], cfg: r[3], EN: r[4], r: r[5],
      IE: r[6] == null ? null : r[6] * F_KJ,
      mp: r[8], bp: r[9], rho: r[10], state: r[11].charAt(0), stateExpected: r[11].length > 1, cat: r[12], predicted: !!r[13]
    });
  });
  const N = EL.length - 1;

  // ---------------- 位置 ----------------
  const PERIOD_END = [2, 10, 18, 36, 54, 86, 118];
  function period(Z) { for (let p = 0; p < PERIOD_END.length; p++) if (Z <= PERIOD_END[p]) return p + 1; return null; }
  /**
   * 元素在週期表上的位置：period 週期、group 族（鑭系、錒系為 null）、row/col 是畫面上的列與行（1 起算；鑭系 row 9、錒系 row 10）
   */
  function pos(Z) {
    const p = period(Z);
    if ((Z >= 57 && Z <= 71) || (Z >= 89 && Z <= 103)) {
      const f = Z <= 71 ? Z - 57 : Z - 89;
      return { period: p, group: null, row: Z <= 71 ? 9 : 10, col: 3 + f, f: true };
    }
    let g;
    if (Z === 1) g = 1;
    else if (Z === 2) g = 18;
    else if (p <= 3) { const s = PERIOD_END[p - 2] + 1, k = Z - s; g = k < 2 ? k + 1 : k + 11; }
    else if (p <= 5) g = Z - PERIOD_END[p - 2];
    else { const s = PERIOD_END[p - 2]; g = Z - s <= 2 ? Z - s : Z - s - 14; }
    return { period: p, group: g, row: p, col: g, f: false };
  }
  function block(Z) {
    const q = pos(Z);
    if (q.f) return 'f';
    if (Z === 2 || q.group <= 2) return 's';
    if (q.group >= 13) return 'p';
    return 'd';
  }
  /** 某一族（1–18）的元素，由上到下 */
  function groupMembers(g) { const out = []; for (let Z = 1; Z <= N; Z++) if (pos(Z).group === g) out.push(Z); return out; }
  /** 某一週期的主表元素（不含鑭系、錒系），由左到右 */
  function periodMembers(p) { const out = []; for (let Z = 1; Z <= N; Z++) { const q = pos(Z); if (q.period === p && !q.f) out.push(Z); } return out.sort(function (a, b) { return pos(a).col - pos(b).col; }); }

  // ---------------- 電子組態 ----------------
  const L = 'spdf';
  const CORE = { He: 2, Ne: 10, Ar: 18, Kr: 36, Xe: 54, Rn: 86 };
  /** 電子組態 → [[n, l, 電子數], …]（展開鈍氣核心；依 n、l 排序） */
  function subshells(Z) {
    const map = {};
    const addCfg = function (cfg) {
      const m = cfg.match(/^\[([A-Z][a-z]?)\]/);
      if (m) addCfg(EL[CORE[m[1]]].cfg);
      (cfg.replace(/^\[[A-Za-z]+\]/, '').match(/\d[spdf]\d+/g) || []).forEach(function (t) {
        const n = +t.charAt(0), l = L.indexOf(t.charAt(1)), c = +t.slice(2);
        const k = n + ',' + l;
        map[k] = (map[k] || 0) + c;
      });
    };
    addCfg(EL[Z].cfg);
    return Object.keys(map).map(function (k) { const a = k.split(','); return [+a[0], +a[1], map[k]]; })
      .sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
  }
  /** 各主層（n = 1, 2, …）的電子數 */
  function shells(Z) {
    const out = [];
    subshells(Z).forEach(function (s) { while (out.length < s[0]) out.push(0); out[s[0] - 1] += s[2]; });
    return out;
  }
  /** 主族元素的價電子數（最外層 s + p）；過渡元素傳回 null */
  function valence(Z) {
    const b = block(Z);
    if (b === 'd' || b === 'f') return null;
    const sh = subshells(Z), nmax = sh.reduce(function (a, s) { return Math.max(a, s[0]); }, 0);
    return sh.filter(function (s) { return s[0] === nmax && s[1] <= 1; }).reduce(function (a, s) { return a + s[2]; }, 0);
  }
  /** 有效核電荷（史萊特規則）：價層一個電子感受到的 Z − S；只用於主族元素（教學用的近似） */
  function slaterZeff(Z) {
    const sh = subshells(Z), nmax = sh.reduce(function (a, s) { return Math.max(a, s[0]); }, 0);
    let same = 0, in1 = 0, in2 = 0;
    sh.forEach(function (s) {
      if (s[0] === nmax && s[1] <= 1) same += s[2];        // 同一層的 s、p
      else if (s[0] === nmax - 1) in1 += s[2];             // 內一層（含 (n−1)d）
      else if (s[0] < nmax - 1) in2 += s[2];               // 更內層（含 (n−2)f）
    });
    const S = (nmax === 1 ? 0.30 : 0.35) * (same - 1) + 0.85 * in1 + 1.0 * in2;
    return Z - S;
  }

  // ---------------- 性質 ----------------
  const PROPS = {
    r:   { zh: '原子半徑', en: 'Atomic radius', unit: 'pm', dec: 0, get: function (e) { return e.r; } },
    IE:  { zh: '第一游離能', en: 'First ionization energy', unit: 'kJ/mol', dec: 0, get: function (e) { return e.IE; } },
    EN:  { zh: '電負度', en: 'Electronegativity', unit: '', dec: 2, get: function (e) { return e.EN; } },
    mp:  { zh: '熔點', en: 'Melting point', unit: '°C', dec: 0, get: function (e) { return e.mp == null ? null : e.mp - 273.15; } },
    rho: { zh: '密度', en: 'Density', unit: 'g/cm³', dec: 3, log: true, get: function (e) { return e.rho; } }
  };
  function value(Z, prop) { return PROPS[prop].get(EL[Z]); }
  /** 這個性質有數據的元素中，最大與最小的 */
  function extremes(prop, filter) {
    let hi = null, lo = null;
    for (let Z = 1; Z <= N; Z++) {
      if (filter && !filter(Z)) continue;
      const v = value(Z, prop);
      if (v == null) continue;
      if (hi == null || v > value(hi, prop)) hi = Z;
      if (lo == null || v < value(lo, prop)) lo = Z;
    }
    return { max: hi, min: lo };
  }
  function isMetal(Z) { return !!METAL_CATS[EL[Z].cat]; }

  // ---------------- 猜猜看 ----------------
  const GAME_PROPS = ['r', 'IE', 'EN'];
  /** 猜猜看的候選元素：1–56、72–86 號裡有這個性質數據的主族元素（過渡金屬變化小、不好由趨勢推，先不考） */
  function candidates(prop) {
    const out = [];
    for (let Z = 1; Z <= 86; Z++) {
      if (Z >= 57 && Z <= 71) continue;
      const b = block(Z);
      if (b !== 's' && b !== 'p') continue;
      if (value(Z, prop) == null) continue;
      if (Z === 1) continue;   // 氫的位置特殊
      out.push(Z);
    }
    return out;
  }
  function pick(prop, r, avoid) {
    r = r || Math.random;
    const c = candidates(prop).filter(function (Z) { return Z !== avoid; });
    return c[Math.floor(r() * c.length) % c.length];
  }
  /** 猜測的相對誤差 */
  function guessErr(guess, actual) { return Math.abs(guess - actual) / Math.abs(actual); }

  const api = {
    F_KJ: F_KJ, EL: EL, N: N, CATS: CATS, PROPS: PROPS, GAME_PROPS: GAME_PROPS,
    period: period, pos: pos, block: block, groupMembers: groupMembers, periodMembers: periodMembers,
    subshells: subshells, shells: shells, valence: valence, slaterZeff: slaterZeff,
    value: value, extremes: extremes, isMetal: isMetal, candidates: candidates, pick: pick, guessErr: guessErr
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PTCore = api;
})(typeof window !== 'undefined' ? window : this);
