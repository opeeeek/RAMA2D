/* wspólne przygotowanie środowiska testów (Node): silniki modułów + rdzeń RAMA2D */
'use strict';
globalThis.RAMA_ENG = require('../tools/engines.js').load();
['fem', 'sections', 'combos', 'model'].forEach(f => require('../src/core/' + f + '.js'));
const extra = ['generator', 'design'];
extra.forEach(f => { try { require('../src/core/' + f + '.js'); } catch (e) { if (!/Cannot find module/.test(e.message)) throw e; } });
module.exports = globalThis;
