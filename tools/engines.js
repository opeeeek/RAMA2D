/* RAMA2D – wydzielenie silników obliczeniowych modułów (bez interfejsu) z plików modułów.
   Silniki są wykorzystywane w programie głównym „bezgłowo”: tablice materiałów i kształtowników,
   stany domyślne i normalizacja danych modułów, obliczenia kontrolne wytężenia elementów.
   Każdy silnik ładowany jest w osobnym zakresie (cień obiektów window/globalThis), więc nazwy
   EC2, EC5, BS z różnych programów nie kolidują. */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');

const DEFS = {
  BZB: { file: 'BelkaZB', pick: s => s.includes('root.EC2 = API'), ret: 'EC2' },
  SZB: { file: 'SlupZB', pick: s => s.includes('root.EC2 = API'), ret: 'EC2' },
  BDR: { file: 'BelkaDR', pick: s => s.includes('root.EC5 = API'), ret: 'EC5' },
  SDR: { file: 'SlupDrewniany', pick: s => s.includes('root.EC5 = API'), ret: 'EC5' },
  BST: { file: 'BelkaStal', pick: s => /^\/\* src\/engine\//.test(s), ret: 'BS' },
  SST: { file: 'SlupStal', pick: s => /^\/\* src\/engine\//.test(s), ret: 'BS' },
};
function scripts(html) {
  const out = [], re = /<script>([\s\S]*?)<\/script>/g; let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}
function engineCode(key, html) {
  const d = DEFS[key], parts = scripts(html).filter(d.pick);
  if (!parts.length) throw new Error(`Nie znaleziono silnika ${key} w ${d.file}.html`);
  return `(function () { var window = {}; var globalThis = window; var self = window; var module = undefined; var document = undefined;\n${parts.join('\n;\n')}\n;return window.${d.ret}; }).call({})`;
}
// kod JS definiujący RAMA_ENG = { BZB, SZB, … } (do pakietu programu)
function bundle(srcDir) {
  const dir = srcDir || path.join(ROOT, 'modules', 'src');
  const lines = ['/* silniki modułów (wydzielone automatycznie z modules/src/*.html przez tools/engines.js) */', 'var RAMA_ENG = {};'];
  Object.keys(DEFS).forEach(k => { const html = fs.readFileSync(path.join(dir, DEFS[k].file + '.html'), 'utf8'); lines.push(`RAMA_ENG.${k} = ${engineCode(k, html)};`); });
  return lines.join('\n');
}
// załadowanie w Node (testy)
function load(srcDir) {
  // eslint-disable-next-line no-new-func
  return new Function(bundle(srcDir) + '\nreturn RAMA_ENG;')();
}
module.exports = { DEFS, scripts, engineCode, bundle, load };
if (require.main === module) {
  const E = load();
  Object.keys(E).forEach(k => console.log(k, E[k] ? Object.keys(E[k]).length + ' eksportów' : 'BRAK'));
}
