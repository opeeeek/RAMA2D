/* Moduł → model: zmiany schematu, podpór, przegubów i obciążeń w module przenoszone do modelu */
'use strict';
const G = require('./setup.js'), M = G.RMODEL, SEC = G.RSEC, D = G.RDES;
let fails = 0, n = 0;
const chk = (name, cond, info) => { n++; if (!cond) fails++; console.log(`${cond ? '✓' : '✖'} ${name}${info !== undefined ? ' – ' + info : ''}`); };
const near = (a, b, t) => Math.abs(a - b) <= (t || 1e-3);
const SECS = { C: { cls: 'C30/37', b: 300, h: 500 }, S: { cls: 'S355', prof: { typ: 'walc', seria: 'IPE', nr: 300 } }, D: { cls: 'GL24h', b: 160, h: 400 } };
const clone = o => JSON.parse(JSON.stringify(o));

// model → moduł (jak RA.syncDesign), edycja danych modułu, moduł → model (jak RA.fromModule)
function sync(P, el) {
  const R = M.analyze(P); if (!R.ok) throw new Error(R.errors.join('; '));
  const out = D.toModule(P, R, el); if (out.err) throw new Error(out.err);
  el.st = out.st; el.sch = out.sch; el.flip = !!out.flip; el.nodePts = out.nodePts || null; if (out.colSchD !== undefined) el.colSchD = out.colSchD;
  return R;
}
function edit(P, el, fn) {
  const R = sync(P, el), base = clone(el.st), st = clone(el.st);
  fn(st);
  const r = D.fromModule(P, R, el, base, st); el.st = r.st;
  if (r.msgs.length) console.log('  komunikaty:', r.msgs.join(' | '));
  sync(P, el);
  return r;
}
const xsOf = (P, el) => { const O = D.order(P, el.bars); return O.nodes.map(id => M.node(P, id).x); };
const supXs = el => el.sch.sups.map(s => +s.x.toFixed(3));
const caseLoad = (P, el, cid) => P.loads.filter(l => l.case === cid && el.bars.includes(l.bar) && l.kind === 'dist');

const SP = {
  ZB: { spans: st => st.cont.spans, set: (st, v) => { st.cont.spans = v; }, cantR: (st, v) => { st.cont.cantR = v; }, sup: (st, i) => st.supCfg[i] },
  DR: { spans: st => st.cont.spans, set: (st, v) => { st.cont.spans = v; }, cantR: (st, v) => { st.cont.cantR = v; }, sup: (st, i) => st.supCfg[i] },
  ST: { spans: st => st.geom.przesla, set: (st, v) => { st.geom.przesla = v; }, cantR: (st, v) => { st.geom.wspP = v; }, sup: (st, i) => st.podpory[i] },
};
['C', 'S', 'D'].forEach(mat => {
  const mk = D.modOfMat(mat), H = SP[mk];
  console.log(`\n=== ${SEC.MAT_KIND[mat]} (${mk}) – belka ciągła 6 + 6 m ===`);
  let P = M.newProject(); P.sections.push(Object.assign(SEC.make(mat, SECS[mat]), { id: 's1' }));
  P.cases = [{ id: 'G1', name: 'stałe', cat: 'G', sw: false }, { id: 'Q1', name: 'użytkowe', cat: 'Q', qcat: 'B' }];
  const a = M.addNode(P, 0, 0), b = M.addNode(P, 6, 0), c = M.addNode(P, 12, 0);
  M.addBar(P, a.id, b.id, 's1'); M.addBar(P, b.id, c.id, 's1');
  M.setSupport(P, a.id, 'pin'); M.setSupport(P, b.id, 'rollX'); M.setSupport(P, c.id, 'rollX');
  P.loads.push({ id: 1, case: 'G1', kind: 'dist', bar: 1, dir: 'Z', q1: 10, x1: 0, x2: 1 }, { id: 2, case: 'G1', kind: 'dist', bar: 2, dir: 'Z', q1: 10, x1: 0, x2: 1 }, { id: 3, case: 'Q1', kind: 'dist', bar: 2, dir: 'Z', q1: 5, x1: 0, x2: 1 });
  P = M.normalize(P);
  const el = D.create(P, D.detect(P).find(q => q.kind === 'beam'));
  sync(P, el);
  chk('schemat początkowy', JSON.stringify(supXs(el)) === '[0,6,12]', supXs(el).join(', '));
  // 1. zmiana rozpiętości przęsła
  edit(P, el, st => { const s = H.spans(st).slice(); s[0] = 7; H.set(st, s); });
  chk('rozpiętość przęsła 1 → 7 m', JSON.stringify(supXs(el)) === '[0,7,13]', supXs(el).join(', '));
  // 2. nowy wspornik prawy
  edit(P, el, st => H.cantR(st, 1.5));
  chk('wspornik prawy 1,5 m', near(Math.max(...xsOf(P, el)), 14.5) && el.sch.cantR > 1.49, `koniec belki x = ${Math.max(...xsOf(P, el))}`);
  // 3. dodane przęsło (wspornik → przęsło 5 m) i usunięcie wspornika
  edit(P, el, st => { H.set(st, H.spans(st).concat([5])); H.cantR(st, 0); });
  chk('dodane przęsło 5 m', JSON.stringify(supXs(el)) === '[0,7,13,18]', supXs(el).join(', '));
  chk('  nowa podpora w modelu', P.supports.some(s => near(M.node(P, s.node).x, 18)));
  // 4. usunięte przęsło
  edit(P, el, st => { H.set(st, H.spans(st).slice(0, 2)); if (mk === 'ST') st.podpory = st.podpory.slice(0, 3); else st.supCfg = st.supCfg.slice(0, 3); });
  chk('usunięte przęsło', JSON.stringify(supXs(el)) === '[0,7,13]' && near(Math.max(...xsOf(P, el)), 13), supXs(el).join(', ') + ' / koniec ' + Math.max(...xsOf(P, el)));
  chk('  podpora usunięta z modelu', !P.supports.some(s => near(M.node(P, s.node).x, 18)) && !P.nodes.some(q => near(q.x, 18)));
  // 5. podpora środkowa → utwierdzenie
  edit(P, el, st => { const s = H.sup(st, 1); if (mk === 'ST') { s.typ = 'utwierdzenie'; s.przesuwna = false; } else s.dof = Object.assign({}, s.dof, { r: true }); s.kr = ''; });
  { const sp = P.supports.find(s => near(M.node(P, s.node).x, 7)); chk('podpora B utwierdzona', sp && sp.ry === 1, JSON.stringify(sp)); }
  // 6. podpora sprężysta pionowo
  edit(P, el, st => { const s = H.sup(st, 2); if (mk === 'ST') { s.typ = 'sprezyna'; s.kz = 20; s.kfi = ''; } else s.kv = mk === 'DR' ? 20 : 20000; });
  { const sp = P.supports.find(s => near(M.node(P, s.node).x, 13)); chk('podpora C sprężysta k_z = 20000 kN/m', sp && !sp.uz && near(sp.kz, 20000), JSON.stringify(sp)); }
  // 7. przegub w przęśle (BelkaŻB, BelkaDR – węzły użytkownika)
  if (mk !== 'ST') {
    edit(P, el, st => { st.nodes = [{ seg: 1, a: 2, hinge: true }]; });
    const nd = P.nodes.find(q => near(q.x, 9)), bs = nd ? P.bars.filter(q => q.n1 === nd.id || q.n2 === nd.id) : [];
    chk('przegub w x = 9 m', nd && bs.some(q => (q.n1 === nd.id ? q.rel[0] : q.rel[1]) === 0), nd ? bs.map(q => JSON.stringify(q.rel)).join(' ') : 'brak węzła');
    edit(P, el, st => { st.nodes = []; });
    const bs2 = nd ? P.bars.filter(q => q.n1 === nd.id || q.n2 === nd.id) : [];
    chk('  przegub usunięty', bs2.every(q => (q.n1 === nd.id ? q.rel[0] : q.rel[1]) !== 0));
  }
  // 8. obciążenia: zmiana wartości G1, usunięcie Q1, nowe obciążenie użytkowe
  const L0 = D._beamLoads(el, el.st);
  edit(P, el, st => {
    if (mk === 'ST') { const g = st.obciazenia.find(o => o.rama && o.id === 'G1'); g.sklad.forEach(k => { k.q0 = 12; k.q1 = 12; }); }
    else { const g = st.loads.perm.find(it => it.rama); if (mk === 'ZB') { g.shape = 'u'; g.q = 12; delete g.prof; g.x1 = ''; g.x2 = ''; } else st.loads.perm.filter(it => it.rama).forEach(it => { it.q = 12; it.q2 = ''; }); }
  });
  const g1 = caseLoad(P, el, 'G1'), tot = g1.reduce((s, l) => s + (+l.q1) * (l.x2 - l.x1) * M.barGeom(P, M.bar(P, l.bar)).L, 0);
  chk('G1 = 12 kN/m na całej belce', near(tot, 12 * 13, 0.05) && g1.every(l => near(+l.q1, 12)), `Σ = ${tot.toFixed(2)} kN (${g1.length} obc.)`);
  edit(P, el, st => { if (mk === 'ST') st.obciazenia = st.obciazenia.filter(o => o.id !== 'Q1'); else st.loads.var = st.loads.var.filter(it => !it.rama); });
  chk('Q1 usunięte z elementu', !caseLoad(P, el, 'Q1').length && P.cases.some(c => c.id === 'Q1'));
  const nc0 = P.cases.length;
  const r = edit(P, el, st => {
    if (mk === 'ST') st.obciazenia.push({ id: 'U1', nazwa: 'nowe użytkowe', rodzaj: 'Q', kat: 'Q-C', etap: st.etapy.length - 1, uklad: 'staly', wyklucz: '', N: 0, sklad: [{ typ: 'q', q0: 3, q1: '', x0: 0, x1: '', kier: 'z', wys: 'pas_g' }] });
    else if (mk === 'ZB') st.loads.var.push(G.RAMA_ENG.BZB.normItem({ kind: 'imp', cat: 'C', name: 'nowe użytkowe', q: 3, shape: 'u' }, 'imp'));
    else st.loads.var.push(G.RAMA_ENG.BDR.normItem({ kind: 'imp', cat: 'C', name: 'nowe użytkowe', q: 3, dir: 'y' }, 'imp'));
  });
  const nc = P.cases[P.cases.length - 1];
  chk('nowe obciążenie → nowy przypadek Q kat. C', P.cases.length === nc0 + 1 && nc.cat === 'Q' && nc.qcat === 'C' && caseLoad(P, el, nc.id).every(l => near(+l.q1, 3)) && caseLoad(P, el, nc.id).length > 0, `${nc.id} ${nc.qcat}, ${r.info.join('; ')}`);
  const own = mk === 'ST' ? el.st.obciazenia.filter(o => !o.rama) : el.st.loads.var.filter(it => !it.rama);
  const rama = mk === 'ST' ? el.st.obciazenia.filter(o => o.rama && o.id === nc.id) : el.st.loads.var.filter(it => it.rama && (it.rcase || it.link) === nc.id);
  chk('  w module jako pozycja z ramy (bez duplikatu)', !own.length && rama.length > 0, `własne ${own.length}, z ramy ${rama.length}`);
  void L0;
});

console.log('\n=== BelkaŻB – zmiana schematu: belka ciągła → wspornik, przegub nad podporą ===');
{
  let P = M.newProject(); P.sections.push(Object.assign(SEC.make('C', SECS.C), { id: 's1' }));
  P.cases = [{ id: 'G1', name: 'stałe', cat: 'G', sw: true }];
  const a = M.addNode(P, 0, 0), b = M.addNode(P, 5, 0), c = M.addNode(P, 10, 0);
  M.addBar(P, a.id, b.id, 's1'); M.addBar(P, b.id, c.id, 's1');
  M.setSupport(P, a.id, 'pin'); M.setSupport(P, b.id, 'rollX'); M.setSupport(P, c.id, 'rollX');
  P = M.normalize(P);
  const el = D.create(P, D.detect(P)[0]); sync(P, el);
  edit(P, el, st => { st.supCfg[1].hinge = true; });
  const bs = P.bars.filter(q => q.n1 === b.id || q.n2 === b.id);
  chk('przegub nad podporą B (belka Gerbera)', bs.some(q => (q.n1 === b.id ? q.rel[0] : q.rel[1]) === 0));
  edit(P, el, st => { st.scheme = 'cant'; st.geom.L = 3; st.supCfg = [{ dof: { x: true, y: true, z: true, r: true }, kv: '', kr: '', t: '', hinge: false }]; });
  chk('wspornik 3 m utwierdzony', el.sch.spans.length === 0 && near(el.sch.O.L, 3) && P.supports.length === 1 && P.supports[0].ry === 1, `L = ${el.sch.O.L}, podpory ${P.supports.length}`);
  edit(P, el, st => { st.scheme = 'ss'; st.geom.L = 6; st.supCfg = []; });
  chk('wspornik → belka jednoprzęsłowa 6 m', el.sch.spans.length === 1 && near(el.sch.spans[0], 6), `przęsła ${el.sch.spans.join(', ')}`);
}

console.log('\n=== rama: rygiel na słupach – przegub rygla na słupie, słupy (podstawa, głowica) ===');
['C', 'S', 'D'].forEach(mat => {
  let P = M.newProject(); P.sections.push(Object.assign(SEC.make(mat, SECS[mat]), { id: 's1' }));
  P.sections.push(Object.assign(SEC.make(mat, mat === 'S' ? { cls: 'S355', prof: { typ: 'walc', seria: 'HEB', nr: 240 } } : mat === 'D' ? { cls: 'GL24h', b: 200, h: 240 } : { cls: 'C30/37', b: 400, h: 400 }), { id: 's2' }));
  P.cases = [{ id: 'G1', name: 'stałe', cat: 'G', sw: false }];
  const a = M.addNode(P, 0, 0), b = M.addNode(P, 0, 4), c = M.addNode(P, 6, 4), d = M.addNode(P, 6, 0);
  M.addBar(P, a.id, b.id, 's2'); M.addBar(P, b.id, c.id, 's1'); M.addBar(P, d.id, c.id, 's2');
  M.setSupport(P, a.id, 'fix'); M.setSupport(P, d.id, 'fix');
  P.loads.push({ id: 1, case: 'G1', kind: 'dist', bar: 2, dir: 'Z', q1: 20, x1: 0, x2: 1 }, { id: 2, case: 'G1', kind: 'node', node: b.id, Fx: 5 });
  P = M.normalize(P);
  const mk = D.modOfMat(mat), props = D.detect(P);
  const beam = D.create(P, props.find(q => q.kind === 'beam')), col = D.create(P, props.find(q => q.kind === 'col' && q.bars.includes(1)));
  sync(P, beam);
  edit(P, beam, st => { const s = SP[mk].sup(st, 0); if (mk === 'ST') { s.typ = 'przegub'; s.kfi = ''; } else { s.dof = Object.assign({}, s.dof, { r: false }); s.kr = ''; } });
  const rb = M.bar(P, 2);
  chk(`${mk}: rygiel przegubowo na słupie lewym`, rb.rel[0] === 0 && rb.rel[1] !== 0, JSON.stringify(rb.rel));
  sync(P, col);
  edit(P, col, st => { if (mk === 'ZB') st.buck.y.sch = 'pp'; else if (mk === 'ST') st.podpory.dol.y = 'prz'; else st.supp.z.base = 'pin'; });
  const sa = P.supports.find(s => s.node === a.id);
  chk(`${mk}: podstawa słupa → przegub`, sa && sa.ry === 0, JSON.stringify(sa));
  edit(P, col, st => { if (mk === 'ZB') st.buck.y.sch = 'ff'; else if (mk === 'ST') { st.podpory.dol.y = 'utw'; st.podpory.gora.y = 'utw'; } else { st.supp.z.base = 'fix'; st.supp.z.top = 'fix'; } });
  const sb = P.supports.find(s => s.node === b.id);
  chk(`${mk}: podstawa utwierdzona, głowica podparta poziomo`, P.supports.find(s => s.node === a.id).ry === 1 && sb && sb.ux === 1, JSON.stringify(sb));
  // statyka wyciętego słupa w module po zmianach = rama (podstawa w module jak w modelu)
  sync(P, col);
  const dsc = D._colDesc(col, col.st);
  chk(`${mk}: warunki słupa w module odpowiadają modelowi`, dsc.base === 'fix' && (mk === 'ZB' ? col.st.buck.y.sch === 'ff' : dsc.top === 'pin'), JSON.stringify(dsc));
});

console.log('\n=== siła węzłowa w przęśle – edycja przypadku w module bez dublowania; wspornik z podporą z prawej; rama 2-nawowa ===');
['C', 'S', 'D'].forEach(mat => {
  const mk = D.modOfMat(mat);
  let P = M.newProject(); P.sections.push(Object.assign(SEC.make(mat, SECS[mat]), { id: 's1' }));
  P.cases = [{ id: 'G1', name: 'stałe', cat: 'G', sw: false }];
  const a = M.addNode(P, 0, 0), b = M.addNode(P, 4, 0), c = M.addNode(P, 8, 0);
  M.addBar(P, a.id, b.id, 's1'); M.addBar(P, b.id, c.id, 's1');
  M.setSupport(P, a.id, 'pin'); M.setSupport(P, c.id, 'rollX');
  P.loads.push({ id: 1, case: 'G1', kind: 'dist', bar: 1, dir: 'Z', q1: 10, x1: 0, x2: 1 }, { id: 2, case: 'G1', kind: 'node', node: b.id, Fz: 20 });
  P = M.normalize(P);
  const el = D.create(P, D.detect(P)[0]);
  edit(P, el, st => {
    if (mk === 'ST') st.obciazenia.find(o => o.id === 'G1').sklad.filter(k => k.typ === 'q').forEach(k => { k.q0 = 15; k.q1 = 15; });
    else if (mk === 'ZB') { const g = st.loads.perm.find(it => it.rama); if (g.shape === 'u') g.q = 15; else { g.shape = 'u'; g.q = 15; g.x1 = ''; g.x2 = 4; delete g.prof; } }
    else st.loads.perm.filter(it => it.rama).forEach(it => { it.q = 15; });
  });
  const pts = P.loads.filter(l => l.case === 'G1' && l.kind === 'point'), nl = P.loads.filter(l => l.kind === 'node');
  chk(`${mk}: siła węzłowa zachowana, bez siły skupionej na pręcie`, nl.length === 1 && +nl[0].Fz === 20 && !pts.length, `węzłowe ${nl.length}, skupione ${pts.length}`);
  const R = M.analyze(P), Rz = Object.values(R.cases.G1.reac).reduce((s, r) => s + r[1], 0);
  chk(`${mk}:   ΣR = 15·4 + 20 = 80 kN`, near(Rz, 80, 0.01), Rz.toFixed(3));
});
{
  // wspornik z utwierdzeniem na prawym końcu (BelkaŻB – oś odwrócona) – zmiana długości w module
  let P = M.newProject(); P.sections.push(Object.assign(SEC.make('C', SECS.C), { id: 's1' }));
  P.cases = [{ id: 'G1', name: 'stałe', cat: 'G', sw: true }];
  const a = M.addNode(P, 0, 0), b = M.addNode(P, 2, 0); M.addBar(P, a.id, b.id, 's1'); M.setSupport(P, b.id, 'fix');
  P = M.normalize(P);
  const el = D.create(P, D.detect(P)[0]); sync(P, el);
  edit(P, el, st => { st.geom.L = 2.6; });
  chk('wspornik (utwierdzenie z prawej) 2 → 2,6 m: koniec swobodny przesunięty w lewo', near(M.node(P, a.id).x, -0.6) && near(M.node(P, b.id).x, 2), `x = ${M.node(P, a.id).x}, ${M.node(P, b.id).x}`);
}
{
  // rama 2-nawowa: zmiana przęsła rygla przesuwa słupy (rama pozostaje regularna)
  let P = M.newProject(); P.sections.push(Object.assign(SEC.make('S', SECS.S), { id: 's1' }), Object.assign(SEC.make('S', { cls: 'S355', prof: { typ: 'walc', seria: 'HEB', nr: 200 } }), { id: 's2' }));
  P.cases = [{ id: 'G1', name: 'stałe', cat: 'G', sw: true }];
  const n = [[0, 0], [0, 4], [6, 4], [6, 0], [12, 4], [12, 0]].map(([x, z]) => M.addNode(P, x, z).id);
  M.addBar(P, n[0], n[1], 's2'); M.addBar(P, n[3], n[2], 's2'); M.addBar(P, n[5], n[4], 's2'); M.addBar(P, n[1], n[2], 's1'); M.addBar(P, n[2], n[4], 's1');
  [0, 3, 5].forEach(i => M.setSupport(P, n[i], 'fix'));
  P = M.normalize(P);
  const el = D.create(P, D.detect(P).find(q => q.kind === 'beam'));
  edit(P, el, st => { st.geom.przesla = [6, 7.5]; });
  chk('rama 2-nawowa: nawa 2 → 7,5 m, słup skrajny przesunięty (pionowy)', near(M.node(P, n[4]).x, 13.5) && near(M.node(P, n[5]).x, 13.5) && near(M.node(P, n[2]).x, 6), `x = ${M.node(P, n[4]).x} / ${M.node(P, n[5]).x}`);
}

console.log(`\n${n - fails}/${n} testów zaliczonych`);
process.exit(fails ? 1 : 0);
