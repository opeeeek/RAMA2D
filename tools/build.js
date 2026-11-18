#!/usr/bin/env node
/* RAMA2D – budowanie programu: jeden plik dist/RAMA2D.html (jak oryginalne moduły – samodzielna aplikacja HTML/JS)
   zawierający: arkusz stylów BelkaŻB (wspólny wygląd), style RAMA2D, silniki modułów (bezgłowo), rdzeń obliczeniowy,
   interfejs oraz kompletne aplikacje modułów z łatkami integracyjnymi (osadzane w ramkach).
   Użycie: node tools/build.js   (opcjonalnie: --no-modules – bez aplikacji modułów, do szybkich testów) */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const ENG = require('./engines.js'), PATCH = require('./patches.js');
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const noMods = process.argv.includes('--no-modules');

const APPS = ['BelkaZB', 'SlupZB', 'BelkaStal', 'SlupStal', 'BelkaDR', 'SlupDrewniany'];
const CORE = ['src/core/fem.js', 'src/core/sections.js', 'src/core/combos.js', 'src/core/model.js', 'src/core/generator.js', 'src/core/design.js'];
const UI = ['src/ui/util.js', 'src/ui/canvas.js', 'src/ui/panels.js', 'src/ui/panes.js', 'src/ui/modules.js', 'src/ui/app.js'];

const safeScript = s => s.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
const tag = (code, name) => `<script>/* ${name} */\n${safeScript(code)}\n</script>`;

const t0 = Date.now();
let html = rd('src/index.html');
const zb = rd('modules/src/BelkaZB.html');
const m = /<style id="appcss">([\s\S]*?)<\/style>/.exec(zb);
if (!m) throw new Error('Nie znaleziono arkusza stylów BelkaŻB.');
html = html.replace('/*@@BASECSS@@*/', () => m[1]).replace('/*@@APPCSS@@*/', () => rd('src/css/app.css'));
const scripts = [];
scripts.push(tag(ENG.bundle(), 'silniki modułów: ' + Object.keys(ENG.DEFS).join(', ')));
CORE.forEach(f => scripts.push(tag(rd(f), f)));
if (!noMods) {
  const parts = ['var RAMA_MODSRC = {};'];
  APPS.forEach(a => { const src = PATCH.patched(a); parts.push(`RAMA_MODSRC[${JSON.stringify(a)}] = ${JSON.stringify(src)};`); });
  scripts.push(tag(parts.join('\n'), 'aplikacje modułów (modules/src + tools/patches.js)'));
}
UI.forEach(f => scripts.push(tag(rd(f), f)));
html = html.replace('<!--@@SCRIPTS@@-->', () => scripts.join('\n'));
fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
const out = path.join(ROOT, 'dist', 'RAMA2D.html');
fs.writeFileSync(out, html);
console.log(`✓ dist/RAMA2D.html – ${(html.length / 1048576).toFixed(2)} MB (${Date.now() - t0} ms)${noMods ? ' – bez modułów' : ''}`);
