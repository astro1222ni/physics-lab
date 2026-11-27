/* DOM-free model. Frames contain analytical components, in either order. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./data/han-character-formation-lexicon.js'));
  else root.HanFormation = factory(root.HanLexicon);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (rows) {
  'use strict';
  const families = [...'寺青包工方令'];
  const types = {P:['象形','Pictograph'], I:['指事','Indicative'], M:['會意','Compound ideograph'], S:['形聲','Phonosemantic']};
  const roles = {whole:['整體表意','Whole form conveys meaning'], meaning:['表意','Meaning'], sound:['表音','Sound'],
    both:['表意兼表音','Meaning and sound'], mark:['表意（指示位置）','Meaning (position mark)'], base:['表意（定位基準）','Meaning (reference line)']};
  const markers = {'上標':['上方指示線','Upper mark'], '下標':['下方指示線','Lower mark'], '基線':['基準線','Baseline']};
  const words = rows.map(([char,reading,example,gloss,kind,parts,head,quote,source,moe]) => {
    const type = kind === 'B' ? 'S' : kind;
    const role = parts.map((p,i) => {
      if (type === 'P') return 'whole';
      if (type === 'I' && i === 1) return 'mark';
      if (p === '基線') return 'base';
      if (i === 1 && type === 'S') return kind === 'B' ? 'both' : 'sound';
      return 'meaning';
    });
    return {char,reading,example,gloss,type,parts,role,head,quote,source,moe,phonetic:type === 'S' ? parts[1] : null};
  });
  const byChar = new Map(words.map(w => [w.char,w]));
  const signature = parts => parts.filter(Boolean).slice().sort().join('|');
  const frames = new Map(words.map(w => [signature(w.parts),w]));
  const get = char => byChar.get(char);
  const members = family => words.filter(w => w.phonetic === family);
  const parts = [...new Set(words.flatMap(w => w.parts))];
  function assemble(frame) {
    if (!Array.isArray(frame) || frame.length > 2) return null;
    return frames.get(signature(frame)) || null;
  }
  function readingParts(reading) {
    if (!/^[˙]?[ㄅ-ㄩ]+[ˊˇˋ˙]?$/.test(reading)) throw new Error('Invalid Zhuyin syllable');
    const tone = reading.includes('˙') ? 5 : reading.includes('ˊ') ? 2 : reading.includes('ˇ') ? 3 : reading.includes('ˋ') ? 4 : 1;
    const letters = reading.replace(/[˙ˊˇˋ]/g,'');
    const onset = /^[ㄅ-ㄙ]/.test(letters) ? letters[0] : '';
    return {onset, rime:letters.slice(onset.length), tone};
  }
  const toneNames=[null,['一聲','Tone 1'],['二聲','Tone 2'],['三聲','Tone 3'],['四聲','Tone 4'],['輕聲','Tone 5']];
  function toneName(tone,english=false) {
    return toneNames[tone][english?1:0];
  }
  // A missing written symbol does not establish that the corresponding sounds match.
  function compare(left,right) {
    const a = readingParts(left), b = readingParts(right);
    const flags = ['onset','rime','tone'].map(k => a[k] === '' || b[k] === '' ? null : a[k] === b[k]);
    const mask = flags.reduce((n,same,i) => n + (same ? [4,2,1][i] : 0),0);
    return {a,b,flags,mask};
  }
  function classify(frame,type,soundPosition) {
    const w = assemble(frame);
    if (!w || !type || !['0','1','none'].includes(soundPosition)) return false;
    return w.type === type && (w.phonetic ? frame[Number(soundPosition)] === w.phonetic && soundPosition !== 'none' : soundPosition === 'none');
  }
  function matchSound(family,char,guess) {
    const w = get(char);
    return !!w && families.includes(family) && w.phonetic === family && Number.isInteger(guess)
      && compare(get(family).reading,w.reading).mask === guess;
  }
  // A page visit remembers who supplied the answer, independently of notebook entries.
  function constructionPractice() {
    const states = new Map();
    function state(char) { return states.get(char) || 'new'; }
    function submit(frame,type,position) {
      const w=assemble(frame);
      if(!w || !Object.hasOwn(types,type) || !['0','1','none'].includes(position))return 'incomplete';
      const before=state(w.char);
      if(before==='shown')return 'shown';
      if(classify(frame,type,position)){
        states.set(w.char,'solved');
        return 'solved';
      }
      if(before!=='solved')states.set(w.char,before==='new'?'miss':'eligible');
      return 'wrong';
    }
    function reveal(char) {
      if(state(char)!=='eligible')return false;
      states.set(char,'shown');
      return true;
    }
    function visible(char) { const s=state(char);return s==='solved'||s==='shown'; }
    return {state,submit,reveal,visible};
  }
  function start() { return {built:[],heard:[]}; }
  // Only correct submitted analyses enter the notebook. Revisiting never inflates it.
  function record(before,kind,char) {
    const key = kind === 'build' ? 'built' : 'heard';
    if (!get(char) || !['build','compare'].includes(kind)) return before;
    if (kind === 'compare' && !families.includes(get(char).phonetic)) return before;
    return {...before,[key]:[...new Set([...before[key],char])]};
  }
  function snapshot(book,act,char) {
    const built = book.built.map(get), heard = book.heard.map(get);
    const phon = built.filter(w => w.type === 'S');
    const groups = new Map();
    phon.forEach(w => {
      if (!groups.has(w.parts[0])) groups.set(w.parts[0],[]);
      groups.get(w.parts[0]).push(w);
    });
    const breadth = group => new Set(group.map(w=>w.phonetic)).size;
    const triples = [...groups.values()].filter(group=>breadth(group)>=3);
    const masks = heard.map(w => compare(get(w.phonetic).reading,w.reading).mask);
    return {act,char,built:book.built.slice(),heard:book.heard.slice(),types:[...new Set(built.map(w=>w.type))],
      compounds:built.filter(w=>w.type==='M').length,
      meaningBreadth:Math.max(0,...Array.from(groups.values(),breadth)),
      sharedChecked:Math.max(0,...triples.map(group=>breadth(group.filter(w=>book.heard.includes(w.char))))),
      families:[...new Set(heard.map(w=>w.phonetic))],masks:[...new Set(masks)]};
  }
  return {words,parts,types,roles,markers,families,get,members,assemble,readingParts,toneName,compare,classify,constructionPractice,matchSound,start,record,snapshot};
});
