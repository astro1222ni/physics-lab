'use strict';
const fs = require('node:fs');
const path = require('node:path');
const unit = require('../js/learn/phy-5-1.js');
const { estimate } = require('../js/learn.js');

const defaultInput = 'G:/physics-lab-wt/規劃/學習-5-1/voice/timings51.json';
const defaultOutput = path.resolve(__dirname, '../js/learn/phy-5-1-timings.js');

function convert(input) {
  if (!input || Array.isArray(input) || typeof input !== 'object') throw Error('Expected a page map');
  const out = { estimated: true, audio: { zh: {}, en: {} }, zh: {}, en: {} };
  for (const page of unit.pages) {
    const id = page.id;
    out.zh[id] = estimate(page.speech[0], 'zh');
    out.en[id] = estimate(page.speech[1], 'en');
    if (!Object.hasOwn(input, id)) continue;
    if (/^[57]-/.test(id)) throw Error('Interactive page has no narration: ' + id);
    const { dur, audio, marks } = input[id];
    if (!Number.isFinite(audio) || audio <= 0 || !Number.isFinite(dur) ||
        Math.abs(dur - audio - .6) > .1) throw Error('Invalid audio length or tail: ' + id);
    const expected = Object.keys(out.zh[id].marks);
    if (!marks || Object.keys(marks).length !== expected.length ||
        expected.some(k => !Number.isFinite(marks[k]) || marks[k] < 0 || marks[k] > audio) ||
        expected.some((k,i) => i && marks[k] < marks[expected[i-1]])) throw Error('Invalid cue list: ' + id);
    out.zh[id] = { dur, marks };
    out.audio.zh[id] = 'audio/study/' + unit.slug + '/' + id + '.m4a';
    out.estimated = false;
  }
  for (const id of Object.keys(input)) if (!Object.hasOwn(out.zh,id)) throw Error('Unknown page: ' + id);
  return out;
}
function serialize(data) {
  return '/* Seconds from page start, including the final 0.6-second hold. */\n' +
    '(function(root,data){\n  if(typeof module===\'object\' && module.exports)module.exports=data;\n' +
    '  else root.LearnTimings=data;\n})(globalThis,' + JSON.stringify(data,null,2) + ');\n';
}
if (require.main === module) {
  const args = process.argv.slice(2);
  let input = defaultInput, output = defaultOutput;
  for (let i = 0; i < args.length; i += 2) {
    if (!args[i+1] || !['--input','--output'].includes(args[i])) throw Error('Expected --input FILE or --output FILE');
    if (args[i] === '--input') input = args[i+1]; else output = args[i+1];
  }
  const result = convert(JSON.parse(fs.readFileSync(input,'utf8').replace(/^\uFEFF/,'')));
  fs.writeFileSync(output,serialize(result));
  console.log(Object.keys(result.audio.zh).length + ' Chinese recordings; ' + unit.pages.length + ' English estimates.');
}
module.exports = { convert, serialize };
