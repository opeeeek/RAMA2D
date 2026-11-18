/* Element zdefiniowany w module → nowy element modelu: geometria, podpory, przekroje, obciążenia; statyka modułu
   po przeniesieniu (dane z modelu) = statyka modułu przed przeniesieniem (dane wprowadzone w module) */
'use strict';
const G = require('./setup.js'), M = G.RMODEL, D = G.RDES, E = G.RAMA_ENG;
let fails = 0, n = 0;
const chk = (name, cond, info) => { n++; if (!cond) fails++; console.log(`${cond ? '✓' : '✖'} ${name}${info !== undefined ? ' – ' + info : ''}`); };
const near = (a, b, t) => Math.abs(a - b) <= (t === undefined ? 1e-3 : t);
const clone = o => JSON.parse(JSON.stringify(o));
const at = (r, x) => { let b = 0; r.x.forEach((v, i) => { if (Math.abs(v - x) < Math.abs(r.x[b] - x)) b = i; }); return r.M[b]; };
// momenty od obciążeń stałych (bez ciężaru własnego) i zmiennych w module belki
function beamM(mod, st) {
  if (mod === 'ZB') { const R = E.BZB.calc(st); const s = R.st; const sum = k => Array.from(s.E[k] ? s.E[k].My : [], v => v / 1e6); return { G: { x: s.x.map(v => v / 1000), M: sum('G') } }; }
  if (mod === 'ST') { const R = E.BST.J.run(st); const s = R.an.res[R.md.nE - 1]; const M0 = new Float64Array(R.an.xs.length); Object.keys(s).forEach(k => { const c = R.md.cases.find(q => q.id === k); if (c && c.rodzaj === 'G' && k !== 'G0') s[k].tot.M.forEach((v, i) => { M0[i] += v; }); }); return { G: { x: Array.from(R.an.xs, v => v / 1000), M: Array.from(M0, v => v / 1e6) } }; }
  if (mod === 'DR') { const R = E.BDR.calc(st); const its = R.st.items.filter(o => o.cls === 'G' && !o.sw); const M0 = new Float64Array(R.st.stX.length); its.forEach(o => o.units.forEach(u => u.My.forEach((v, i) => { M0[i] += v; }))); return { G: { x: R.st.stX, M: Array.from(M0) } }; }
}
function sync(P, el) { const R = M.analyze(P); if (!R.ok) throw new Error(R.errors.join('; ')); const out = D.toModule(P, R, el); if (out.err) throw new Error(out.err); el.st = out.st; el.sch = out.sch; el.flip = !!out.flip; el.nodePts = out.nodePts || null; return R; }

console.log('=== belka ciągła 5 + 6 m zdefiniowana w module → model ===');
['ZB', 'ST', 'DR'].forEach(mod => {
  const st = D.newModuleState(mod, 'beam');
  if (mod === 'ST') {
    st.geom.przesla = [5, 6]; st.podpory = [{ typ: 'przegub' }, { typ: 'przegub', przesuwna: true }, { typ: 'przegub', przesuwna: true }];
    st.obciazenia = [
      { id: 'L1', nazwa: 'stałe', rodzaj: 'G', etap: 0, uklad: 'staly', wyklucz: '', N: 0, sklad: [{ typ: 'q', q0: 10, q1: '', x0: 0, x1: '', kier: 'z', wys: 'pas_g' }, { typ: 'P', x: 7, P: 20, kier: 'z', wys: 'pas_g', ss: 100 }] },
      { id: 'L2', nazwa: 'użytkowe', rodzaj: 'Q', kat: 'Q-C', etap: 0, uklad: 'szachownica', wyklucz: '', N: 0, sklad: [{ typ: 'q', q0: 5, q1: '', x0: 0, x1: '', kier: 'z', wys: 'pas_g' }] }];
  } else {
    st.scheme = 'cont'; st.cont.spans = [5, 6]; st.cont.cantL = 0; st.cont.cantR = 0; st.supCfg = [];
    const ni = mod === 'ZB' ? E.BZB.normItem : E.BDR.normItem;
    st.loads.perm = [ni({ name: 'stałe', q: 10, shape: 'u', dir: 'y', pts: [{ P: 20, a: 7, ref: 'L' }] }, 'perm')];
    st.loads.var = [ni({ kind: 'imp', cat: 'C', name: 'użytkowe', q: 5, shape: 'u', dir: 'y' }, 'imp')];
    if (mod === 'ZB') st.cont.geoSpans = [{ b: '', h: '' }, { b: 300, h: 700 }];
  }
  const S0 = mod === 'ST' ? E.BST.J.normalize(st) : mod === 'ZB' ? E.BZB.normalize(st) : E.BDR.normalize(st);
  const before = beamM(mod, S0);
  const P = M.normalize(M.newProject());
  const r = D.createFromModule(P, mod, 'beam', S0);
  if (r.err) { fails++; console.log('✖', mod, r.err); return; }
  if (r.msgs.length) console.log('  komunikaty:', r.msgs.join(' | '));
  const el = r.el; el.st = r.st;
  const xs = P.nodes.map(q => q.x).sort((a, b) => a - b);
  chk(`${mod}: węzły 0, 5, 11 m, 3 podpory, 2 pręty`, JSON.stringify(xs) === '[0,5,11]' && P.supports.length === 3 && P.bars.length === 2, `${xs.join(', ')} · podpory ${P.supports.length}`);
  chk(`${mod}:   element w module ${el.mod}/${el.kind}`, el.mod === mod && el.kind === 'beam' && el.bars.length === 2);
  const g = P.loads.filter(l => l.case === 'G1' && l.kind === 'dist'), q = P.cases.find(c => c.cat === 'Q');
  chk(`${mod}:   obciążenia: G1 10 kN/m, nowy przypadek Q kat. C 5 kN/m, siła 20 kN`, g.length === 2 && g.every(l => near(+l.q1, 10)) && q && q.qcat === 'C' && P.loads.filter(l => l.case === q.id).every(l => near(+l.q1, 5)) && P.loads.some(l => l.kind === 'point' && near(+l.P, 20)), `${P.cases.map(c => c.id + ':' + c.cat).join(' ')}`);
  if (mod === 'ZB') { const s2 = M.sec(P, M.bar(P, el.bars[1]).sec), s1 = M.sec(P, M.bar(P, el.bars[0]).sec); chk('ZB:   przekrój przęsła 2: 300×700, przęsła 1: 300×600', +s2.h === 700 && +s1.h === 600, `${s1.b}×${s1.h} / ${s2.b}×${s2.h}`); }
  const own = mod === 'ST' ? r.st.obciazenia.length : r.st.loads.perm.length + r.st.loads.var.length;
  chk(`${mod}:   pozycje modułu przeniesione (usunięte z danych modułu)`, own === 0);
  sync(P, el);
  const after = beamM(mod, el.st);
  [1, 2.5, 5, 7, 9, 11].forEach(x => { const a = at(before.G, x), b = at(after.G, x); chk(`${mod}:   M_G(x=${x}) moduł przed = po przeniesieniu`, near(a, b, Math.max(0.02 * Math.abs(a), 0.05)), `${a.toFixed(2)} / ${b.toFixed(2)} kNm`); });
  // dalsza praca – zmiana w module wraca do modelu
  const base = clone(el.st), st2 = clone(el.st);
  if (mod === 'ST') st2.geom.przesla = [5, 7]; else st2.cont.spans = [5, 7];
  D.fromModule(P, M.analyze(P), el, base, st2); sync(P, el);
  chk(`${mod}:   zmiana przęsła 2 → 7 m w module → model`, near(Math.max(...P.nodes.map(q => q.x)), 12));
});

console.log('\n=== drugi element z modułu – obok istniejącego układu ===');
{
  const P = M.normalize(M.newProject());
  const a = D.createFromModule(P, 'ZB', 'beam', D.newModuleState('ZB', 'beam')); a.el.st = a.st;
  const b = D.createFromModule(P, 'ST', 'col', D.newModuleState('ST', 'col')); b.el.st = b.st;
  const xs = b.el.bars.map(id => M.node(P, M.bar(P, id).n1).x);
  chk('słup stalowy z prawej strony belki (x ≥ 9 m), nazwy różne', xs[0] >= 9 && a.el.name !== b.el.name && P.design.length === 2, `x = ${xs[0]}, ${a.el.name} / ${b.el.name}`);
  const R = M.analyze(P); chk('  statyka obu elementów', R.ok, R.ok ? '' : R.errors.join('; '));
}

console.log('\n=== słupy zdefiniowane w module → model (statyka modułu przed = po) ===');
const colM = (mod, st) => {
  if (mod === 'ZB') { const it = st.loads.items.find(i => i.N || i.Myt || i.Myb || i.qh || i.Hh); const d = E.SZB.itemDist(it, st, { L: st.geom.L * 1000 }); const nn = d.y.M.length - 1; return [0, 0.5, 1].map(t => d.y.M[Math.round(nn * t)] / 1e6); }
  if (mod === 'ST') { const R = E.BST && E.SST.J.run(st); const idx = st.obciazenia.findIndex(o => o.sklad && o.sklad.length); const sm = R.an.res['L' + idx].pl.y.sm; const H = st.geom.H * 1000; return [0, 0.5, 1].map(t => { const i = sm.xs.reduce((b, v, k) => Math.abs(v - t * H) < Math.abs(sm.xs[b] - t * H) ? k : b, 0); return sm.M[i] / 1e6; }); }
  if (mod === 'DR') { const R = E.SDR.calc(st); const id = Object.keys(R.resp).find(k => k !== 'G0'); const r = R.resp[id], nx = R.xs.length - 1; return [0, 0.5, 1].map(t => { const e = Math.min(nx - 1, Math.round(t * nx)); return t >= 1 ? r.My[2 * (nx - 1) + 1] / 1e6 : r.My[2 * e] / 1e6; }); }
};
[
  ['ZB', 'cant', st => { st.buck.y.sch = 'cant'; st.loads.items = [E.SZB.normItem(Object.assign(E.SZB.newItem('perm', { name: 'stałe', N: 500, Myt: 20, Myb: -45, qh: 2 })))]; }],
  ['ZB', 'pp', st => { st.buck.y.sch = 'pp'; st.loads.items = [E.SZB.normItem(Object.assign(E.SZB.newItem('perm', { name: 'stałe', N: 400, Myt: 15, Myb: -10, qh: 1.5 })))]; }],
  ['ST', 'utw–swob', st => { st.obciazenia = [{ id: 'L1', nazwa: 'stałe', rodzaj: 'G', wyklucz: '', aktywne: true, sklad: [{ typ: 'N', x: '', F: 400, ey: 0, ez: 0 }, { typ: 'H', x: '', kier: 'z', F: 10, wys: 'srodek' }, { typ: 'M', x: '', os: 'y', M: 15 }, { typ: 'q', kier: 'z', q0: 2, q1: '', x0: '', x1: '', wys: 'srodek' }] }]; }],
  ['ST', 'prz–prz', st => { st.podpory.dol.y = 'prz'; st.podpory.gora.y = 'prz'; st.obciazenia = [{ id: 'L1', nazwa: 'stałe', rodzaj: 'G', wyklucz: '', aktywne: true, sklad: [{ typ: 'N', x: '', F: 300, ey: 0, ez: 0 }, { typ: 'M', x: '', os: 'y', M: 12 }, { typ: 'q', kier: 'z', q0: 3, q1: '', x0: '', x1: '', wys: 'srodek' }] }]; }],
  ['DR', 'pin–pin', st => { st.loads.items = [E.SDR.normItem({ kind: 'perm', name: 'stałe', N: 80, qz: 1.5, My: 3 })]; }],
  ['DR', 'fix–free', st => { st.supp.z.base = 'fix'; st.supp.z.top = 'free'; st.loads.items = [E.SDR.normItem({ kind: 'perm', name: 'stałe', N: 60, Hz: 4, My: 2, qz: 1 })]; }],
].forEach(([mod, name, set]) => {
  const st = D.newModuleState(mod, 'col'); set(st);
  const S0 = mod === 'ZB' ? E.SZB.normalize(st) : mod === 'ST' ? E.SST.J.normalize(st) : E.SDR.normalize(st);
  if (mod === 'ST') S0.ciezarWlasny.auto = false; else S0.loads.sw = false;
  const before = colM(mod, S0);
  const P = M.normalize(M.newProject());
  const r = D.createFromModule(P, mod, 'col', S0);
  if (r.err) { fails++; console.log('✖', mod, name, r.err); return; }
  if (r.msgs.length) console.log('  komunikaty:', r.msgs.join(' | '));
  r.el.st = r.st; sync(P, r.el);
  const st2 = r.el.st; if (mod === 'ST') st2.ciezarWlasny.auto = false; else st2.loads.sw = false;
  const after = colM(mod, st2);
  chk(`${mod} ${name}: M podstawy / połowy / głowicy – moduł przed = po`, before.every((v, i) => near(v, after[i], Math.max(0.02 * Math.abs(v), 0.05))), `${before.map(v => v.toFixed(2)).join(', ')} | ${after.map(v => v.toFixed(2)).join(', ')}`);
  const nl = P.loads.find(l => l.kind === 'node' && l.Fz);
  chk(`${mod} ${name}:   siła podłużna w głowicy`, nl && near(+nl.Fz, mod === 'ZB' ? (name === 'cant' ? 500 : 400) : mod === 'ST' ? (name === 'prz–prz' ? 300 : 400) : (name === 'pin–pin' ? 80 : 60)));
});

console.log(`\n${n - fails}/${n} testów zaliczonych`);
process.exit(fails ? 1 : 0);
