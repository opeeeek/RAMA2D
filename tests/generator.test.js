'use strict';
const G = require('./setup.js'), M = G.RMODEL, SEC = G.RSEC, GEN = G.RGEN;
let fails = 0;
Object.keys(GEN.TYPES).forEach(t => {
  const variants = [{}];
  if (t === 'truss') ['pratt', 'howe', 'warren', 'warrenv', 'k'].forEach(ty => ['par', 'trap', 'tri', 'mono', 'bow'].forEach(sh => variants.push({ type: ty, shape: sh })));
  if (t === 'arch') ['pin2', 'fix', 'pin3', 'tied'].forEach(s => variants.push({ sup: s, shape: 'circ' }));
  if (t === 'portal') variants.push({ spans: '6; 6; 8', H: '4; 3,5; 3,5', joint: 'hinge', base: 'fix' }, { spans: '6', H: '4', base: 'pin' });
  if (t === 'gable') variants.push({ ridge: 'hinge' }, { bays: 3, tie: 'yes', base: 'fix' });
  if (t === 'beam') variants.push({ spans: '3×5', cantL: 1.5, cantR: 2 });
  variants.forEach(v => {
    const P = M.newProject(); P.sections.push(Object.assign(SEC.make('S', { prof: { typ: 'walc', seria: 'HEB', nr: 200 } }), { id: 's1' }));
    P.cases = [{ id: 'G1', name: 'g', cat: 'G', sw: true }];
    const params = {}; GEN.TYPES[t].fields.forEach(f => { params[f[0]] = f[2]; }); Object.assign(params, v);
    GEN.apply(P, t, params, { _: 's1' });
    const R = M.analyze(M.normalize(P));
    const tag = `${t} ${JSON.stringify(v)}`;
    if (!R.ok) { fails++; console.log('✖', tag, R.errors); return; }
    // równowaga: Σ R_z = ciężar własny
    const W = R.ctx.props.reduce((a, p, i) => a + p.g * R.ctx.geo[i].L, 0), Rz = Object.values(R.cases.G1.reac).reduce((a, r) => a + r[1], 0);
    const okE = Math.abs(Rz - W) < 1e-6 * Math.max(1, W);
    if (!okE) fails++;
    console.log(okE ? '✓' : '✖', tag.padEnd(46), `węzły ${P.nodes.length}, pręty ${P.bars.length}, ΣRz = ${Rz.toFixed(3)} / G = ${W.toFixed(3)}, ${R.t} ms`);
  });
});
process.exit(fails ? 1 : 0);
