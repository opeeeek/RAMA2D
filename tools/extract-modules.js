#!/usr/bin/env node
/* RAMA2D – wyodrębnienie aplikacji modułów z plików .exe (host Go + WebView2).
   Każdy program (BelkaZB.exe, SlupZB.exe, BelkaStal.exe, SlupStal.exe, BelkaDR.exe,
   SlupDrewniany.exe) zawiera kompletną aplikację HTML/JS osadzoną w sekcji danych.
   Skrypt odnajduje dokument <!doctype html> … </html> i zapisuje go w modules/src/<Nazwa>.html.
   Użycie:  node tools/extract-modules.js [katalog_z_exe]   (domyślnie: katalog główny repozytorium) */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const SRC = process.argv[2] ? path.resolve(process.argv[2]) : ROOT;
const OUT = path.join(ROOT, 'modules', 'src');
const NAMES = ['BelkaZB', 'SlupZB', 'BelkaStal', 'SlupStal', 'BelkaDR', 'SlupDrewniany'];

function extract(buf) {
  const start = buf.indexOf(Buffer.from('<!doctype html>'));
  if (start < 0) throw new Error('brak osadzonego dokumentu HTML');
  // koniec: ostatnie „</html>” przed pierwszym bajtem binarnym po dokumencie
  const endTag = Buffer.from('</html>');
  let pos = start, end = -1;
  for (;;) {
    const i = buf.indexOf(endTag, pos);
    if (i < 0) break;
    let j = i + endTag.length;
    while (j < buf.length && (buf[j] === 0x0a || buf[j] === 0x0d || buf[j] === 0x20)) j++;
    const b = buf[j];
    if (j >= buf.length || b === 0 || (b < 9) || (b > 13 && b < 32)) { end = j; break; }
    pos = i + 1;
  }
  if (end < 0) throw new Error('nie znaleziono końca dokumentu');
  const html = buf.slice(start, end).toString('utf8');
  if (html.includes('�')) throw new Error('niepoprawne kodowanie UTF-8 – ekstrakcja przerwana');
  return html.replace(/\s+$/, '\n');
}

fs.mkdirSync(OUT, { recursive: true });
let n = 0;
NAMES.forEach(name => {
  const f = [path.join(SRC, name + '.exe'), path.join(SRC, 'modules', name + '.exe')].find(p => fs.existsSync(p));
  if (!f) { console.warn(`! brak ${name}.exe – pominięto`); return; }
  const html = extract(fs.readFileSync(f));
  fs.writeFileSync(path.join(OUT, name + '.html'), html);
  console.log(`✓ ${name}: ${(html.length / 1024).toFixed(0)} kB, ${html.split('\n').length} linii`);
  n++;
});
console.log(`Wyodrębniono ${n} modułów do ${path.relative(ROOT, OUT)}/`);
