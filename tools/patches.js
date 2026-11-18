/* RAMA2D – łatki integracyjne modułów (stosowane przy budowaniu; pliki w modules/src pozostają oryginalne).
   Każda łatka musi trafić dokładnie w jedno miejsce kodu – w przeciwnym razie budowanie jest przerywane
   (np. po podmianie programu na nowszą wersję), z informacją, którą łatkę trzeba dostosować.
   Zakres łatek jest celowo minimalny:
   1) grupy wzajemnie wykluczających się obciążeń zmiennych (pole „grp” – np. wiatr z lewej / z prawej)
      w generatorach kombinacji BelkaŻB, SłupŻB i BelkaDR (BelkaStal i SłupStal mają to natywnie – pole „wyklucz”,
      SłupDrewniany – warianty wiatru i śniegu),
   2) funkcja setState w BelkaStal i SłupStal (pozostałe moduły ją mają) – wymiana danych z programem głównym. */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');

const PATCHES = {
  BelkaZB: [
    { id: 'excl-families', why: 'grupy wykluczające się obciążeń zmiennych (it.grp) – osobne rodziny kombinacji',
      find: 'function families(vars) {',
      repl: `function families(vars) { return exclFam(vars, families0(vars)); }
// RAMA2D: obciążenia zmienne z tą samą grupą (it.grp) wykluczają się – w rodzinie kombinacji występuje co najwyżej jedno z nich
function exclFam(vars, fams) {
  const out = [];
  fams.forEach(F => {
    const grp = {}; F.set.forEach(i => { const g = vars[i].it && vars[i].it.grp; if (g) (grp[g] = grp[g] || []).push(i); });
    let sets = [{ set: F.set.slice(), tag: F.tag }];
    Object.keys(grp).forEach(g => { const mem = grp[g]; if (mem.length < 2) return; const nx = []; sets.forEach(s => mem.forEach(k => nx.push({ set: s.set.filter(i => !mem.includes(i) || i === k), tag: s.tag + ' [' + (vars[k].it.name || 'wariant ' + (k + 1)) + ']' }))); sets = nx.slice(0, 64); });
    out.push(...sets);
  });
  return out;
}
function families0(vars) {` },
    { id: 'excl-qp', why: 'kombinacja quasi-stała – po jednym obciążeniu z każdej grupy wykluczającej (największe ψ₂·Q)',
      find: "  const QP = [{ name: 'quasi-stała', gs: 1, gi: 1, q: vars.map((v, i) => [i, v.psi.p2]).filter(t => t[1] > 0), a: null, lead: null }];",
      repl: "  const QP = exclFam(vars, [{ set: vars.map((_, i) => i), tag: '' }]).map(F => ({ name: 'quasi-stała' + F.tag, gs: 1, gi: 1, q: F.set.map(i => [i, vars[i].psi.p2]).filter(t => t[1] > 0), a: null, lead: null }));" },
    { id: 'cont-1span', why: 'belka ciągła z jednym przęsłem i wspornikiem (wspornikami) – import z modelu ramy',
      find: '  if (C.spans.length < 2) C.spans.push(C.spans[0]);',
      repl: '  if (C.spans.length < 2 && !(num(C.cantL, 0) > 0 || num(C.cantR, 0) > 0)) C.spans.push(C.spans[0]);   // RAMA2D: jedno przęsło ze wspornikami' },
  ],
  SlupZB: [
    { id: 'excl-subsets', why: 'grupy wykluczające się obciążeń zmiennych (it.grp)',
      find: '    if (pres.some(isH) && pres.some(isSW)) return;          // dach kat. H nie łączy się ze śniegiem / wiatrem',
      repl: '    if (pres.some(isH) && pres.some(isSW)) return;          // dach kat. H nie łączy się ze śniegiem / wiatrem\n    { const gs = pres.map(i => items[i].grp).filter(Boolean); if (new Set(gs).size < gs.length) return; }   // RAMA2D: grupy wykluczające się (it.grp)' },
  ],
  BelkaDR: [
    { id: 'excl-split', why: 'grupy wykluczające się obciążeń zmiennych (it.grp) – kombinacje rozdzielane na warianty',
      find: "  { const f = {}; Q.forEach(o => { f[o.key] = o.psi.p2; }); out.qp.push({ id: ++id, type: 'QP', eq: '6.16b', gs: 1, gi: 1, f, lead: null, desc: desc(1, f) }); }\n  return out;\n}",
      repl: `  { const f = {}; Q.forEach(o => { f[o.key] = o.psi.p2; }); out.qp.push({ id: ++id, type: 'QP', eq: '6.16b', gs: 1, gi: 1, f, lead: null, desc: desc(1, f) }); }
  // RAMA2D: obciążenia z jednej grupy (it.grp) nie działają jednocześnie – kombinacja z kilkoma z nich rozdzielana na warianty
  { const grp = {}; Q.forEach(o => { const g = o.it && o.it.grp; if (g) (grp[g] = grp[g] || []).push(o.key); });
    const GR = Object.values(grp).filter(a => a.length > 1);
    if (GR.length) Object.keys(out).forEach(t => { const res = []; out[t].forEach(c => {
      let vs = [c.f];
      GR.forEach(mem => { const nx = []; vs.forEach(f => { const on = mem.filter(k => f[k]); if (on.length < 2) { nx.push(f); return; } const keep = c.lead && on.includes(c.lead) ? [c.lead] : on; keep.forEach(k => { const g = Object.assign({}, f); on.forEach(q => { if (q !== k) delete g[q]; }); nx.push(g); }); }); vs = nx; });
      if (vs.length === 1) { res.push(c); return; }
      vs.forEach(f => res.push(Object.assign({}, c, { f, id: ++id, desc: desc(c.gs, f) })));
    }); out[t] = res; }); }
  return out;
}` },
  ],
  BelkaStal: [
    { id: 'setState', why: 'wymiana danych z programem głównym (jak U.setState w pozostałych modułach)',
      find: 'A.init = init;\n})();',
      repl: "A.init = init;\nA.setState = (st) => { S = J.normalize(st); BEAMS = null; curB = 0; vStage = null; selSpans.clear(); rendered = {}; $('#projName').value = S.meta.nazwa || ''; renderInputs(); recalc(); updateTitle(); };   // RAMA2D\n})();" },
  ],
  SlupStal: [
    { id: 'setState', why: 'wymiana danych z programem głównym (jak U.setState w pozostałych modułach)',
      find: 'A.init = init;\n})();',
      repl: "A.init = init;\nA.setState = (st) => { S = J.normalize(st); COLS = null; curC = 0; rendered = {}; $('#projName').value = S.meta.nazwa || ''; renderInputs(); recalc(); updateTitle(); };   // RAMA2D\n})();" },
  ],
  SlupDrewniany: [],
};

function apply(name, html) {
  (PATCHES[name] || []).forEach(p => {
    const n = html.split(p.find).length - 1;
    if (n !== 1) throw new Error(`Łatka ${name}/${p.id}: wzorzec występuje ${n}× (oczekiwano 1). Dostosuj tools/patches.js do nowej wersji programu.`);
    html = html.replace(p.find, () => p.repl);
  });
  return html;
}
function patched(name, dir) {
  const f = path.join(dir || path.join(ROOT, 'modules', 'src'), name + '.html');
  return apply(name, fs.readFileSync(f, 'utf8'));
}
module.exports = { PATCHES, apply, patched };
