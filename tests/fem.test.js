/* Testy silnika MES (rozwiązania analityczne). Uruchom: node tests/fem.test.js */
'use strict';
const F = require('../src/core/fem.js');
let fails = 0, n = 0;
const ok = (name, got, exp, tol) => { n++; const t = tol === undefined ? 1e-3 : tol; const e = Math.abs(got - exp) / Math.max(1e-9, Math.abs(exp)) ; const pass = Math.abs(exp) < 1e-9 ? Math.abs(got) < 1e-6 : e <= t; if (!pass) { fails++; console.log(`✖ ${name}: ${got} ≠ ${exp}`); } else console.log(`✓ ${name}: ${(+got).toPrecision(6)}`); };
const E = 210e6, A = 53.8e-4, I = 8356e-8, EA = E * A, EI = E * I;
const at = (rs, x, k) => { const r = rs.reduce((p, q) => Math.abs(q.x - x) < Math.abs(p.x - x) ? q : p); return r[k]; };
const maxAbs = (rs, k) => rs.reduce((m, r) => Math.abs(r[k]) > Math.abs(m) ? r[k] : m, 0);

// 1. belka swobodnie podparta, q = 10 kN/m w dół (lokalnie py = −10), L = 6
{ const am = { nodes: [{ x: 0, z: 0 }, { x: 6, z: 0 }], els: [{ n1: 0, n2: 1, EA, EI, nsub: 8 }], sups: [{ node: 0, ux: 1, uz: 1 }, { node: 1, uz: 1 }] };
  const Aa = F.Analysis(am), r = F.solveCase(Aa, { el: [{ el: 0, loads: [{ t: 'q', x1: 0, x2: 6, py1: -10, py2: -10 }] }] });
  const rs = F.memberResults(Aa, r, 0);
  ok('SS: M(L/2) = qL²/8', at(rs, 3, 'M'), 45); ok('SS: V(0) = qL/2', at(rs, 0, 'V'), 30); ok('SS: V(L) = −qL/2', at(rs, 6, 'V'), -30);
  ok('SS: w(L/2) = 5qL⁴/384EI (w>0 w dół)', at(rs, 3, 'w'), 5 * 10 * 6 ** 4 / (384 * EI));
  const R = F.reactions(Aa, r); ok('SS: R_A,z = 30', R[0][1], 30); ok('SS: R_B,z = 30', R[1][1], 30); ok('SS: R_A,x = 0', R[0][0], 0); }
// 2. wspornik – siła P = 20 kN w dół na końcu
{ const am = { nodes: [{ x: 0, z: 0 }, { x: 4, z: 0 }], els: [{ n1: 0, n2: 1, EA, EI, nsub: 4 }], sups: [{ node: 0, ux: 1, uz: 1, ry: 1 }] };
  const Aa = F.Analysis(am), r = F.solveCase(Aa, { nodal: [{ node: 1, Fz: -20 }] });
  const rs = F.memberResults(Aa, r, 0);
  ok('wspornik: M(0) = −PL', at(rs, 0, 'M'), -80); ok('wspornik: ugięcie końca PL³/3EI', -F.nodeDisp(Aa, r, 1)[1], 20 * 64 / (3 * EI));
  const R = F.reactions(Aa, r); ok('wspornik: R_z', R[0][1], 20); ok('wspornik: M utwierdzenia (+ przeciwnie do wskazówek)', R[0][2], 80); }
// 3. belka obustronnie utwierdzona q, trapez częściowy
{ const am = { nodes: [{ x: 0, z: 0 }, { x: 6, z: 0 }], els: [{ n1: 0, n2: 1, EA, EI, nsub: 6 }], sups: [{ node: 0, ux: 1, uz: 1, ry: 1 }, { node: 1, ux: 1, uz: 1, ry: 1 }] };
  const Aa = F.Analysis(am), r = F.solveCase(Aa, { el: [{ el: 0, loads: [{ t: 'q', x1: 0, x2: 6, py1: -12, py2: -12 }] }] });
  const rs = F.memberResults(Aa, r, 0);
  ok('FF: M(0) = −qL²/12', at(rs, 0, 'M'), -36); ok('FF: M(L/2) = qL²/24', at(rs, 3, 'M'), 18);
  // obciążenie trójkątne 0 → q na całej długości: M_A = −qL²/30, M_B = −qL²/20
  const r2 = F.solveCase(Aa, { el: [{ el: 0, loads: [{ t: 'q', x1: 0, x2: 6, py1: 0, py2: -10 }] }] }), rs2 = F.memberResults(Aa, r2, 0);
  ok('FF trójkąt: M_A = −qL²/30', at(rs2, 0, 'M'), -12); ok('FF trójkąt: M_B = −qL²/20', at(rs2, 6, 'M'), -18); }
// 4. rama portalowa utwierdzona, H = 10 kN w węźle górnym (słupy h = 4, rygiel 6, równe EI) – rozwiązanie klasyczne
{ const am = { nodes: [{ x: 0, z: 0 }, { x: 0, z: 4 }, { x: 6, z: 4 }, { x: 6, z: 0 }],
    els: [{ n1: 0, n2: 1, EA: EA * 1e4, EI, nsub: 4 }, { n1: 1, n2: 2, EA: EA * 1e4, EI, nsub: 4 }, { n1: 3, n2: 2, EA: EA * 1e4, EI, nsub: 4 }],
    sups: [{ node: 0, ux: 1, uz: 1, ry: 1 }, { node: 3, ux: 1, uz: 1, ry: 1 }] };
  const Aa = F.Analysis(am), r = F.solveCase(Aa, { nodal: [{ node: 1, Fx: 10 }] });
  // Kleinlogel: k = (I_b/L_b)/(I_c/h); M_podst = H·h/2 · (3k+1)/(6k+1); M_głow = H·h/2 − M_podst (k→∞: Hh/4, k→0: Hh/2)
  const k = (1 / 6) / (1 / 4), Mb = 10 * 4 / 2 * (3 * k + 1) / (6 * k + 1), Mt = 10 * 4 / 2 - Mb;
  const rc = F.memberResults(Aa, r, 0);
  ok('rama: |M podstawy słupa|', Math.abs(at(rc, 0, 'M')), Mb, 2e-3); ok('rama: |M głowicy słupa|', Math.abs(at(rc, 4, 'M')), Mt, 2e-3);
  const R = F.reactions(Aa, r); ok('rama: ΣRx = −H', R[0][0] + R[3][0], -10); }
// 5. przegub: belka dwuprzęsłowa z przegubem w podporze środkowej = dwie belki swobodne
{ const am = { nodes: [{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 10, z: 0 }], els: [{ n1: 0, n2: 1, EA, EI, nsub: 4, rel: [null, 0] }, { n1: 1, n2: 2, EA, EI, nsub: 4 }],
    sups: [{ node: 0, ux: 1, uz: 1 }, { node: 1, uz: 1 }, { node: 2, uz: 1 }] };
  const Aa = F.Analysis(am), r = F.solveCase(Aa, { el: [{ el: 0, loads: [{ t: 'q', x1: 0, x2: 5, py1: -8, py2: -8 }] }, { el: 1, loads: [{ t: 'q', x1: 0, x2: 5, py1: -8, py2: -8 }] }] });
  ok('przegub: M nad podporą = 0', at(F.memberResults(Aa, r, 1), 0, 'M'), 0); ok('przegub: M przęsła = qL²/8', at(F.memberResults(Aa, r, 0), 2.5, 'M'), 25); }
// 6. belka ciągła dwuprzęsłowa: M_B = −qL²/8
{ const am = { nodes: [{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 10, z: 0 }], els: [{ n1: 0, n2: 1, EA, EI, nsub: 4 }, { n1: 1, n2: 2, EA, EI, nsub: 4 }],
    sups: [{ node: 0, ux: 1, uz: 1 }, { node: 1, uz: 1 }, { node: 2, uz: 1 }] };
  const Aa = F.Analysis(am), lc = { el: [0, 1].map(e => ({ el: e, loads: [{ t: 'q', x1: 0, x2: 5, py1: -8, py2: -8 }] })) }, r = F.solveCase(Aa, lc);
  ok('ciągła: M_B = −qL²/8', at(F.memberResults(Aa, r, 0), 5, 'M'), -25); const R = F.reactions(Aa, r); ok('ciągła: R_B = 1,25qL', R[1][1], 50);
  // osiadanie podpory środkowej δ = 10 mm
  const r2 = F.solveCase(Aa, { settle: [{ node: 1, uz: -0.01 }] }); const MB = at(F.memberResults(Aa, r2, 0), 5, 'M');
  ok('osiadanie podpory środkowej: M_B = 3EIδ/L² (równanie trzech momentów)', MB, 3 * EI * 0.01 / 25, 1e-3); }
// 7. temperatura: belka utwierdzona, ΔT = 20 K → N = −EAαΔT; różnica temperatur → M = EIαΔT/h
{ const am = { nodes: [{ x: 0, z: 0 }, { x: 6, z: 0 }], els: [{ n1: 0, n2: 1, EA, EI, nsub: 2 }], sups: [{ node: 0, ux: 1, uz: 1, ry: 1 }, { node: 1, ux: 1, uz: 1, ry: 1 }] };
  const Aa = F.Analysis(am), r = F.solveCase(Aa, { el: [{ el: 0, loads: [{ t: 'T', e0: 1.2e-5 * 20, k0: 0 }] }] });
  ok('temperatura: N = −EAαΔT', at(F.memberResults(Aa, r, 0), 3, 'N'), -EA * 1.2e-5 * 20);
  const h = 0.3, r2 = F.solveCase(Aa, { el: [{ el: 0, loads: [{ t: 'T', e0: 0, k0: -1.2e-5 * 15 / h }] }] });   // spód cieplejszy o 15 K
  ok('różnica temperatur (spód cieplejszy): M = +EIαΔT/h', at(F.memberResults(Aa, r2, 0), 3, 'M'), EI * 1.2e-5 * 15 / h); }
// 8. wyboczenie: pręt przegubowy P_cr = π²EI/L², wspornik π²EI/(4L²)
{ const L = 5, am = { nodes: [{ x: 0, z: 0 }, { x: 0, z: L }], els: [{ n1: 0, n2: 1, EA, EI, nsub: 8 }], sups: [{ node: 0, ux: 1, uz: 1 }, { node: 1, ux: 1 }] };
  const Aa = F.Analysis(am), r = F.solveCase(Aa, { nodal: [{ node: 1, Fz: -100 }] }), N = F.axial(Aa, r);
  const b = F.buckling(Aa, N, 2); ok('Euler przegub–przegub: α_cr·100 = π²EI/L²', b[0].alpha * 100, Math.PI ** 2 * EI / L ** 2, 2e-3);
  const am2 = { nodes: am.nodes, els: am.els, sups: [{ node: 0, ux: 1, uz: 1, ry: 1 }] }, A2 = F.Analysis(am2), r2 = F.solveCase(A2, { nodal: [{ node: 1, Fz: -100 }] });
  const b2 = F.buckling(A2, F.axial(A2, r2), 1); ok('Euler wspornik: π²EI/(4L²)', b2[0].alpha * 100, Math.PI ** 2 * EI / (4 * L * L), 2e-3);
  // P-Δ: wspornik z siłą poziomą H = 5 i P = 0,5 P_cr → wzmocnienie ugięcia ≈ 1/(1 − P/Pcr)·(1 + 0,23·P/Pcr) (dokładnie: tgu/u − …); porównanie z teorią II rzędu
  const Pcr = Math.PI ** 2 * EI / (4 * L * L), P = 0.5 * Pcr, H = 5, kk = Math.sqrt(P / EI);
  const r3 = F.solveP2(A2, { nodal: [{ node: 1, Fz: -P, Fx: H }] });
  const dEx = H / (P * kk) * (Math.tan(kk * L) - kk * L);
  ok('P-Δ wspornik: ugięcie II rzędu (rozw. dokładne)', F.nodeDisp(A2, r3, 1)[0], dEx, 5e-3); }
// 9. kratownica trójkątna: dwa pręty ukośne 45°, siła 10 kN w dół w węźle szczytowym
{ const am = { nodes: [{ x: 0, z: 0 }, { x: 2, z: 2 }, { x: 4, z: 0 }], els: [{ n1: 0, n2: 1, EA, EI, nsub: 1, rel: [0, 0] }, { n1: 1, n2: 2, EA, EI, nsub: 1, rel: [0, 0] }, { n1: 0, n2: 2, EA, EI, nsub: 1, rel: [0, 0] }],
    sups: [{ node: 0, ux: 1, uz: 1 }, { node: 2, uz: 1 }] };
  const Aa = F.Analysis(am), r = F.solveCase(Aa, { nodal: [{ node: 1, Fz: -10 }] });
  ok('kratownica: N krzyżulca = −5√2', at(F.memberResults(Aa, r, 0), 1, 'N'), -5 * Math.SQRT2); ok('kratownica: N pasa dolnego = +5', at(F.memberResults(Aa, r, 2), 1, 'N'), 5); }
// 10. podpora ukośna 30°: belka swobodna z podporą przesuwną pod kątem; połączenie podatne
{ const am = { nodes: [{ x: 0, z: 0 }, { x: 6, z: 0 }], els: [{ n1: 0, n2: 1, EA, EI, nsub: 4 }], sups: [{ node: 0, ux: 1, uz: 1 }, { node: 1, uz: 1, ang: 30 }] };
  const Aa = F.Analysis(am), r = F.solveCase(Aa, { el: [{ el: 0, loads: [{ t: 'q', x1: 0, x2: 6, py1: -10, py2: -10 }] }] }), R = F.reactions(Aa, r);
  ok('podpora ukośna: R_B ⊥ (składowa z)', R[1][1], 30, 1e-4); ok('podpora ukośna: R_B,x = −R·tg30°', R[1][0], -30 * Math.tan(Math.PI / 6), 1e-4);
  // belka utwierdzona z połączeniem podatnym kφ = 4EI/L na obu końcach: M_A = −qL²/12 · 2/3 ·… (dla kφ = αEI/L: M = −qL²/12 · α/(α+2))
  const kf = 4 * EI / 6, am2 = { nodes: am.nodes, els: [{ n1: 0, n2: 1, EA, EI, nsub: 4, rel: [kf, kf] }], sups: [{ node: 0, ux: 1, uz: 1, ry: 1 }, { node: 1, ux: 1, uz: 1, ry: 1 }] };
  const A2 = F.Analysis(am2), r2 = F.solveCase(A2, { el: [{ el: 0, loads: [{ t: 'q', x1: 0, x2: 6, py1: -10, py2: -10 }] }] });
  ok('połączenie podatne: M_A = −qL²/12·α/(α+2), α = 4', at(F.memberResults(A2, r2, 0), 0, 'M'), -30 * 4 / 6); }
// 11. siła skupiona i moment skupiony na pręcie
{ const am = { nodes: [{ x: 0, z: 0 }, { x: 6, z: 0 }], els: [{ n1: 0, n2: 1, EA, EI, nsub: 5 }], sups: [{ node: 0, ux: 1, uz: 1 }, { node: 1, uz: 1 }] };
  const Aa = F.Analysis(am), r = F.solveCase(Aa, { el: [{ el: 0, loads: [{ t: 'P', a: 2, py: -30 }] }] });
  const rs = F.memberResults(Aa, r, 0, [2]);
  ok('siła skupiona: M(a) = P·a·b/L', at(rs, 2, 'M'), 30 * 2 * 4 / 6); ok('siła skupiona: V lewa', rs.find(q => Math.abs(q.x - 2) < 1e-9).V, 20);
  const r2 = F.solveCase(Aa, { el: [{ el: 0, loads: [{ t: 'M', a: 3, m: 12 }] }] }), rs2 = F.memberResults(Aa, r2, 0, [3]);
  const pts = rs2.filter(q => Math.abs(q.x - 3) < 1e-9); ok('moment skupiony: skok M = −m (przeciwnie do wskazówek)', pts[1].M - pts[0].M, -12); }
console.log(`\n${n - fails}/${n} testów zaliczonych`);
process.exit(fails ? 1 : 0);
