'use strict';
const G = require('./setup.js'), M = G.RMODEL, SEC = G.RSEC, C = G.RCOMB;
let fails = 0, n = 0;
const ok = (name, got, exp, tol) => { n++; const t = tol === undefined ? 2e-3 : tol; const pass = Math.abs(exp) < 1e-9 ? Math.abs(got) < 1e-6 : Math.abs(got - exp) / Math.abs(exp) <= t; if (!pass) { fails++; console.log(`✖ ${name}: ${got} ≠ ${exp}`); } else console.log(`✓ ${name}: ${(+got).toPrecision(6)}`); };
// rama portalowa żelbetowa 6 m × 4 m
const P = M.newProject();
P.sections.push(Object.assign(SEC.make('C', { cls: 'C30/37', b: 300, h: 500 }), { id: 's1' }));
P.sections.push(Object.assign(SEC.make('S', { cls: 'S355', prof: { typ: 'walc', seria: 'HEB', nr: 200 } }), { id: 's2' }));
P.sections.push(Object.assign(SEC.make('D', { cls: 'GL24h', b: 140, h: 400 }), { id: 's3' }));
['s1', 's2', 's3'].forEach(id => { const p = SEC.props(M.sec(P, id)); console.log(id, SEC.fullLabel(M.sec(P, id)), 'A', p.A.toFixed(5), 'I', p.I.toExponential(3), 'E', p.E.toExponential(3), 'g', p.g.toFixed(3)); });
const a = M.addNode(P, 0, 0), b = M.addNode(P, 0, 4), c = M.addNode(P, 6, 4), d = M.addNode(P, 6, 0);
M.addBar(P, a.id, b.id, 's1'); M.addBar(P, b.id, c.id, 's1'); M.addBar(P, d.id, c.id, 's1');
M.setSupport(P, a.id, 'fix'); M.setSupport(P, d.id, 'fix');
P.cases = [{ id: 'G1', name: 'stałe', cat: 'G', sw: false }, { id: 'Q1', name: 'użytkowe', cat: 'Q', qcat: 'B' }, { id: 'W1', name: 'wiatr L', cat: 'W', grp: 'W' }, { id: 'W2', name: 'wiatr P', cat: 'W', grp: 'W' }];
P.loads.push({ id: 1, case: 'G1', kind: 'dist', bar: 2, dir: 'Z', q1: 20, x1: 0, x2: 1 });
P.loads.push({ id: 2, case: 'Q1', kind: 'dist', bar: 2, dir: 'Z', q1: 10, x1: 0, x2: 1 });
P.loads.push({ id: 3, case: 'W1', kind: 'node', node: b.id, Fx: 10 });
P.loads.push({ id: 4, case: 'W2', kind: 'node', node: c.id, Fx: -10 });
const PN = M.normalize(P);
const R = M.analyze(PN);
console.log('errors', R.errors, 'warnings', R.warnings, 't', R.t, 'ms combos', R.combos.length);
const mid = arr => arr[Math.floor(arr.length / 2)];
// G: rama symetryczna – reakcje pionowe = qL/2
ok('G: R_z podpory = 60', R.cases.G1.reac[0][1], 60);
ok('W1: ΣR_x = −10', R.cases.W1.reac[0][0] + R.cases.W1.reac[3][0], -10);
// obwiednia SGN: maksymalny moment przęsła rygla ≥ 1,35G + 1,5Q (+ψ0·W)
const e = R.env.ULS.bars[1], i = e.x.findIndex(x => Math.abs(x - 3) < 1e-6);
const MG = R.cases.G1.bars[1][i].M, MQ = R.cases.Q1.bars[1][i].M, MW1 = R.cases.W1.bars[1][i].M, MW2 = R.cases.W2.bars[1][i].M;
const exp610b = 0.85 * 1.35 * MG + 1.5 * MQ + 1.5 * 0.6 * Math.max(0, MW1, MW2), exp610a = 1.35 * MG + 1.5 * 0.7 * MQ + 1.5 * 0.6 * Math.max(0, MW1, MW2);
ok('obwiednia SGN M_max środek rygla', e.Mmax[i], Math.max(exp610a, exp610b));
console.log(' kombinacja decydująca:', C.describe(PN.cases, e.MmaxC[i]));
// lista jawna: maksimum z listy = obwiednia
let best = -Infinity; R.combos.filter(q => q.typ === 'ULS').forEach(q => { const r = M.comboResult(PN, R, q); best = Math.max(best, r.bars[1][i].M); });
ok('obwiednia = max z kombinacji jawnych', best, e.Mmax[i]);
// wyboczenie: kombinacja z największym obciążeniem
const cb = R.combos.find(q => q.typ === 'ULS' && q.lead === 'Q1' && q.gl === 'γG,sup');
const B = M.buckling(PN, R, cb, 2);
console.log('α_cr =', B.alpha.toFixed(2), 'Lcr słupów:', B.Lcr.map(v => v ? v.toFixed(2) : '-').join(', '));
// II rząd
PN.settings.order = 2; const R2 = M.analyze(PN);
console.log('P-Δ: kombinacji', Object.keys(R2.p2).length, 'M_podst. słupa I/II rz.:', R.env.ULS.bars[0].Mmin[0].toFixed(2), R2.env.ULS.bars[0].Mmin[0].toFixed(2), 't', R2.t, 'ms');
// podział pręta
const P3 = M.normalize(PN); const sp = M.splitBar(P3, 2, 0.25); const R3 = M.analyze(P3);
ok('podział rygla nie zmienia reakcji', R3.cases.G1.reac[0][1], 60);
console.log(`\n${n - fails}/${n} testów zaliczonych`); process.exit(fails ? 1 : 0);
