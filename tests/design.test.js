/* Weryfikacja przenoszenia schematów do modułów: statyka liczona silnikiem modułu = statyka ramy */
'use strict';
const G = require('./setup.js'), M = G.RMODEL, SEC = G.RSEC, D = G.RDES, E = G.RAMA_ENG;
let fails = 0, n = 0;
const ok = (name, got, exp, tol) => { n++; const t = tol === undefined ? 0.01 : tol; const pass = Math.abs(exp) < 1e-6 ? Math.abs(got) < 1e-3 : Math.abs(got - exp) / Math.abs(exp) <= t; if (!pass) { fails++; console.log(`✖ ${name}: ${(+got).toFixed(3)} ≠ ${(+exp).toFixed(3)}`); } else console.log(`✓ ${name}: ${(+got).toFixed(3)}`); };
const proj = (mat, sec) => { const P = M.newProject(); P.sections.push(Object.assign(SEC.make(mat, sec), { id: 's1' })); P.sections.push(Object.assign(SEC.make(mat, sec), { id: 's2' })); P.cases = [{ id: 'G1', name: 'stałe', cat: 'G', sw: false }, { id: 'Q1', name: 'użytkowe', cat: 'Q', qcat: 'B' }]; return P; };
const SECS = { C: { cls: 'C30/37', b: 300, h: 500 }, S: { cls: 'S355', prof: { typ: 'walc', seria: 'IPE', nr: 300 } }, D: { cls: 'GL24h', b: 160, h: 400 } };
const mmax = a => a.reduce((m, v) => Math.max(m, v), -Infinity), mmin = a => a.reduce((m, v) => Math.min(m, v), Infinity);
// momenty przypadku G w module (kNm, spód rozciągany +)
function modM(el, st) {
  if (el.mod === 'ZB') { const R = E.BZB.calc(st); if (R.errors && R.errors.length) console.log('  błędy modułu:', R.errors); return { x: R.st.x.map(v => v / 1000), M: Array.from(R.st.E.G.My, v => v / 1e6) }; }
  if (el.mod === 'ST') { const R = E.BST.J.run(st); if (R.errors.length) console.log('  błędy modułu:', R.errors); const s = R.an.res[R.md.nE - 1]; const ids = Object.keys(s).filter(k => /^G/.test(k) && k !== 'G0'); const M0 = new Float64Array(R.an.xs.length); ids.forEach(k => s[k].tot.M.forEach((v, i) => { M0[i] += v; })); return { x: Array.from(R.an.xs, v => v / 1000), M: Array.from(M0, v => v / 1e6) }; }
  if (el.mod === 'DR') { const R = E.BDR.calc(st); if (R.errors && R.errors.length) console.log('  błędy modułu:', R.errors); const its = R.st.items.filter(o => o.cls === 'G' && !o.sw); const M0 = new Float64Array(R.st.stX.length); its.forEach(o => o.units.forEach(u => u.My.forEach((v, i) => { M0[i] += v; }))); return { x: R.st.stX, M: Array.from(M0) }; }
}
const at = (r, x) => { let b = 0; r.x.forEach((v, i) => { if (Math.abs(v - x) < Math.abs(r.x[b] - x)) b = i; }); return r.M[b]; };
const mainAt = (R, P, el, x) => { const O = D.order(P, el.bars); let k = O.xs.findIndex((v, i) => i > 0 && x <= v + 1e-9); const q = O.seq[k - 1], ei = R.ctx.bIdx.get(q.bar.id), xl = q.rev ? O.xs[k] - x : x - O.xs[k - 1]; const st = R.cases.G1.bars[ei]; let b = st[0]; st.forEach(s => { if (Math.abs(s.x - xl) < Math.abs(b.x - xl)) b = s; }); return (q.rev ? -1 : 1) * b.M; };

['C', 'S', 'D'].forEach(mat => {
  console.log(`\n=== ${SEC.MAT_KIND[mat]} – belka ciągła 2 przęsła + wspornik, obciążenie trapezowe, siła skupiona, węzeł z obciążeniem ===`);
  const P = proj(mat, SECS[mat]);
  const pts = [[0, 0], [5, 0], [11, 0], [12.5, 0], [8, 0]].map(([x, z]) => M.addNode(P, x, z).id);
  M.addBar(P, pts[0], pts[1], 's1'); M.addBar(P, pts[1], pts[4], 's1'); M.addBar(P, pts[2], pts[4], 's1'); M.addBar(P, pts[2], pts[3], 's1');   // pręt 3 odwrócony
  M.setSupport(P, pts[0], 'pin'); M.setSupport(P, pts[1], 'rollX'); M.setSupport(P, pts[2], 'rollX');
  P.loads.push({ id: 1, case: 'G1', kind: 'dist', bar: 1, dir: 'Z', q1: 8, q2: 14, x1: 0, x2: 1 });
  P.loads.push({ id: 2, case: 'G1', kind: 'dist', bar: 2, dir: 'Z', q1: 10, x1: 0, x2: 1 });
  P.loads.push({ id: 3, case: 'G1', kind: 'dist', bar: 3, dir: 'Z', q1: 10, x1: 0, x2: 1 });
  P.loads.push({ id: 4, case: 'G1', kind: 'point', bar: 4, dir: 'Z', P: 12, x: 1 });
  P.loads.push({ id: 5, case: 'G1', kind: 'node', node: pts[4], Fz: 20 });
  P.loads.push({ id: 6, case: 'Q1', kind: 'dist', bar: 2, dir: 'Z', q1: 5, x1: 0, x2: 1 });
  const PN = M.normalize(P), R = M.analyze(PN);
  const prop = D.detect(PN); console.log('wykryte:', prop.map(q => `${q.kind}/${q.mod} pręty ${q.bars.join(',')} L=${q.L}`).join(' | '));
  const el = D.create(PN, prop[0]); const out = D.toModule(PN, R, el); if (out.err) { fails++; console.log('✖', out.err); return; }
  out.warn.forEach(w => console.log('  uwaga:', w));
  el.st = out.st; const mm = modM(el, out.st);
  [2.5, 5, 8, 11, 12.5].forEach(x => ok(`M(x=${x})`, at(mm, x), mainAt(R, PN, el, x), 0.02));
  const ck = D.check(el); console.log('  kontrola modułem:', JSON.stringify(ck).slice(0, 160));
});

console.log('\n=== rama portalowa – belka z podporami sprężystymi (rama zastępcza) ===');
['C', 'S', 'D'].forEach(mat => {
  const P = proj(mat, SECS[mat]);
  const a = M.addNode(P, 0, 0), b = M.addNode(P, 0, 4), c = M.addNode(P, 7, 4), d = M.addNode(P, 7, 0);
  M.addBar(P, a.id, b.id, 's2'); M.addBar(P, b.id, c.id, 's1'); M.addBar(P, d.id, c.id, 's2');
  M.setSupport(P, a.id, 'fix'); M.setSupport(P, d.id, 'fix');
  P.loads.push({ id: 1, case: 'G1', kind: 'dist', bar: 2, dir: 'Z', q1: 20, x1: 0, x2: 1 });
  const PN = M.normalize(P), R = M.analyze(PN);
  const prop = D.detect(PN).find(q => q.kind === 'beam'); const el = D.create(PN, prop); const out = D.toModule(PN, R, el);
  if (out.err) { fails++; console.log('✖', out.err); return; }
  el.st = out.st; const mm = modM(el, out.st);
  console.log(`  ${SEC.MAT_KIND[mat]}: k_φ podpór = ${out.sch.sups.map(s => Math.round(s.kr)).join(', ')} kNm/rad`);
  [0, 3.5, 7].forEach(x => ok(`  ${mat} M(x=${x}) rama zastępcza`, at(mm, x), mainAt(R, PN, el, x), 0.02));
});

console.log('\n=== słupy: wspornik z siłą poziomą, momentem i wiatrem – siły w module = siły w ramie ===');
['C', 'S', 'D'].forEach(mat => {
  const P = proj(mat, mat === 'S' ? { cls: 'S355', prof: { typ: 'walc', seria: 'HEB', nr: 240 } } : mat === 'D' ? { cls: 'GL24h', b: 200, h: 240 } : { cls: 'C30/37', b: 400, h: 400 });
  const a = M.addNode(P, 0, 0), b = M.addNode(P, 0, 2), c = M.addNode(P, 0, 4.5);
  M.addBar(P, a.id, b.id, 's1'); M.addBar(P, c.id, b.id, 's1');   // drugi pręt odwrócony
  M.setSupport(P, a.id, 'fix');
  P.loads.push({ id: 1, case: 'G1', kind: 'node', node: c.id, Fz: 300, Fx: 6, M: 15 });
  P.loads.push({ id: 2, case: 'G1', kind: 'dist', bar: 1, dir: 'X', q1: 3, x1: 0, x2: 1 });
  P.loads.push({ id: 3, case: 'G1', kind: 'dist', bar: 2, dir: 'X', q1: 3, x1: 0, x2: 1 });
  const PN = M.normalize(P), R = M.analyze(PN);
  const prop = D.detect(PN); const el = D.create(PN, prop[0]);
  const out = D.toModule(PN, R, el); if (out.err) { fails++; console.log('✖', out.err); return; }
  el.st = out.st; out.warn.forEach(w => console.log('  uwaga:', w));
  const O = D.order(PN, el.bars);
  const mainBase = R.cases.G1.bars[R.ctx.bIdx.get(O.seq[0].bar.id)][0].M;
  const mainMid = (() => { const q = O.seq[1], ei = R.ctx.bIdx.get(q.bar.id), st = R.cases.G1.bars[ei]; const xl = 4.5 - 3.25; let bb = st[0]; st.forEach(s => { if (Math.abs(s.x - xl) < Math.abs(bb.x - xl)) bb = s; }); return -bb.M; })();
  let base, mid;
  if (mat === 'C') { const it = out.st.loads.items.find(i => i.rama); const d = E.SZB.itemDist(it, out.st, { L: 4500 }); const nn = d.y.M.length - 1; base = d.y.M[0] / 1e6; mid = d.y.M[Math.round(nn * 3.25 / 4.5)] / 1e6; }
  if (mat === 'S') { const Rr = E.SST.J.run(out.st); if (Rr.errors.length) console.log('  błędy:', Rr.errors); const idx = out.st.obciazenia.findIndex(o => o.rama); const sm = Rr.an.res['L' + idx].pl.y.sm; const i1 = sm.xs.reduce((b, v, i) => Math.abs(v - 3250) < Math.abs(sm.xs[b] - 3250) ? i : b, 0); base = sm.M[0] / 1e6; mid = sm.M[i1] / 1e6; }
  if (mat === 'D') { const Rr = E.SDR.calc(out.st); if (Rr.errors.length) console.log('  błędy:', Rr.errors); const id = Object.keys(Rr.resp).find(k => k !== 'G0'); const r = Rr.resp[id]; const xs = Rr.xs; const e1 = Math.round(3250 / (4500 / (xs.length - 1))); base = r.My[0] / 1e6; mid = r.My[2 * e1] / 1e6; }   // My: 2 wartości na element (początek, koniec)
  console.log(`  ${SEC.MAT_KIND[mat]}: rama M podstawy ${mainBase.toFixed(2)}, M(3,25) ${mainMid.toFixed(2)} | moduł ${base.toFixed(2)}, ${mid.toFixed(2)}`);
  ok(`  ${mat} |M podstawy|`, Math.abs(base), Math.abs(mainBase), 0.01); ok(`  ${mat} |M(3,25 m)|`, Math.abs(mid), Math.abs(mainMid), 0.02);
  ok(`  ${mat} zgodność znaku (M_mid/M_base)`, Math.sign(mid) * Math.sign(base), Math.sign(mainMid) * Math.sign(mainBase), 0);
});
console.log(`\n${n - fails}/${n} testów zaliczonych`); process.exit(fails ? 1 : 0);
