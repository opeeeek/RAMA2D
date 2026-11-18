/* =====================================================================
   RAMA2D – model projektu i przebieg analizy statycznej
   Projekt: węzły, pręty (przekrój, typ ramowy/kratowy, przeguby i
   połączenia podatne), podpory, przekroje, przypadki obciążeń i
   obciążenia, ustawienia kombinacji; elementy wymiarowane w modułach.
   Jednostki danych: m, kN, kNm, kN/m; wymiary przekrojów w mm.
   Kierunki obciążeń: 'Z' – pionowo (dodatnie w dół, grawitacja), 'X' –
   poziomo (dodatnie w prawo), 'z' – prostopadle do pręta (dodatnie w stronę
   spodu z̄), 'x' – wzdłuż pręta (od węzła początkowego do końcowego).
   Momenty skupione – dodatnie zgodnie z ruchem wskazówek zegara.
   ===================================================================== */
(function (root) {
'use strict';
const FEM = () => root.RFEM, SEC = () => root.RSEC, CMB = () => root.RCOMB;
const M = {};
M.VERSION = '1.0.0';
M.FORMAT = 'rama2d/1';

const clone = o => JSON.parse(JSON.stringify(o));
const num = (v, d) => { if (typeof v === 'number') return isFinite(v) ? v : d; if (v === '' || v === null || v === undefined) return d; const x = parseFloat(String(v).replace(',', '.')); return isFinite(x) ? x : d; };
M.num = num;

M.defaultSettings = () => ({
  comb: '610ab', gG: 1.35, gGinf: 1.0, gQ: 1.5, xi: 0.85, accPsi: 'psi1',
  order: 1,            // 1 – analiza I rzędu, 2 – II rzędu (P-Δ) dla kombinacji SGN
  nsub: 8,             // podział prętów na podelementy
  shear: 'auto',       // odkształcenia postaciowe (ścinanie): 'auto' – pręty drewniane (jak BelkaDR), 'all' – wszystkie, 'none' – pominięte
  buck: true,          // analiza wyboczeniowa (α_cr) dla kombinacji SGN
  grid: 0.5, snap: true,
});
M.newProject = () => ({
  format: M.FORMAT, app: 'RAMA2D',
  meta: { name: 'Projekt 1', author: '', object: '', note: '' },
  settings: M.defaultSettings(),
  nodes: [], bars: [], supports: [],
  sections: [],
  cases: [{ id: 'G1', name: 'Ciężar własny i obciążenia stałe', cat: 'G', sw: true, grp: '' }],
  loads: [], combUser: [],
  design: [],
  seq: { node: 1, bar: 1, sec: 1, load: 1, des: 1 },
});
M.SUP_TYPES = {
  fix: { n: 'utwierdzenie', ux: 1, uz: 1, ry: 1 },
  pin: { n: 'przegub nieprzesuwny', ux: 1, uz: 1, ry: 0 },
  rollX: { n: 'przegub przesuwny (przesuw poziomy)', ux: 0, uz: 1, ry: 0 },
  rollZ: { n: 'przegub przesuwny (przesuw pionowy)', ux: 1, uz: 0, ry: 0 },
  slideX: { n: 'utwierdzenie przesuwne (przesuw poziomy)', ux: 0, uz: 1, ry: 1 },
  slideZ: { n: 'utwierdzenie przesuwne (przesuw pionowy)', ux: 1, uz: 0, ry: 1 },
  spring: { n: 'podpora sprężysta', ux: 0, uz: 0, ry: 0 },
};
M.supKind = sp => { if (sp.kx > 0 || sp.kz > 0 || sp.kr > 0) return 'spring'; const k = Object.keys(M.SUP_TYPES).find(t => t !== 'spring' && !!M.SUP_TYPES[t].ux === !!sp.ux && !!M.SUP_TYPES[t].uz === !!sp.uz && !!M.SUP_TYPES[t].ry === !!sp.ry); return k || 'custom'; };

/* ---------------------------------------------------------------- normalizacja */
M.normalize = function (P0) {
  const D = M.newProject(), P = Object.assign(D, clone(P0 || {}));
  P.format = M.FORMAT;
  P.meta = Object.assign(M.newProject().meta, P.meta || {});
  P.settings = Object.assign(M.defaultSettings(), P.settings || {});
  ['nodes', 'bars', 'supports', 'sections', 'cases', 'loads', 'combUser', 'design'].forEach(k => { if (!Array.isArray(P[k])) P[k] = []; });
  P.nodes = P.nodes.map(n => ({ id: +n.id, x: num(n.x, 0), z: num(n.z, 0) }));
  P.bars = P.bars.map(b => ({ id: +b.id, n1: +b.n1, n2: +b.n2, sec: b.sec, type: b.type === 'truss' ? 'truss' : 'frame', rel: Array.isArray(b.rel) ? [relV(b.rel[0]), relV(b.rel[1])] : [null, null], role: ['auto', 'beam', 'col', 'brace'].includes(b.role) ? b.role : 'auto', name: b.name || '' }));
  P.supports = P.supports.map(s => ({ node: +s.node, ux: s.ux ? 1 : 0, uz: s.uz ? 1 : 0, ry: s.ry ? 1 : 0, kx: Math.max(0, num(s.kx, 0)), kz: Math.max(0, num(s.kz, 0)), kr: Math.max(0, num(s.kr, 0)), ang: num(s.ang, 0) }));
  P.sections = P.sections.map(s => Object.assign({ id: s.id, name: s.name || '', kEI: num(s.kEI, 1) }, s));
  if (!P.cases.length) P.cases = M.newProject().cases;
  P.cases = P.cases.map(c => ({ id: String(c.id), name: c.name || '', cat: CMB().CATS[c.cat] ? c.cat : 'G', qcat: c.qcat || 'B', alt: c.alt === 'high' ? 'high' : 'low', grp: c.grp || '', sw: !!c.sw, dur: c.dur || '', p0: num(c.p0, 0.7), p1: num(c.p1, 0.5), p2: num(c.p2, 0.3) }));
  P.loads = P.loads.map(l => Object.assign({}, l, { id: +l.id || 0 }));
  const mx = (arr, f) => arr.reduce((a, o) => Math.max(a, +f(o) || 0), 0);
  P.seq = Object.assign({ node: 1, bar: 1, sec: 1, load: 1, des: 1 }, P.seq || {});
  P.seq.node = Math.max(P.seq.node, mx(P.nodes, o => o.id) + 1); P.seq.bar = Math.max(P.seq.bar, mx(P.bars, o => o.id) + 1);
  P.seq.load = Math.max(P.seq.load, mx(P.loads, o => o.id) + 1);
  P.seq.sec = Math.max(P.seq.sec, mx(P.sections, o => String(o.id).replace(/\D/g, '')) + 1);
  P.seq.des = Math.max(P.seq.des, mx(P.design, o => String(o.id).replace(/\D/g, '')) + 1);
  return P;
};
function relV(v) { if (v === null || v === undefined || v === '' || v === false) return null; if (v === true || v === 'hinge') return 0; const x = +v; return isFinite(x) && x >= 0 ? x : null; }

/* ---------------------------------------------------------------- pomocnicze geometrii */
M.node = (P, id) => P.nodes.find(n => n.id === id);
M.bar = (P, id) => P.bars.find(b => b.id === id);
M.sec = (P, id) => P.sections.find(s => s.id === id);
M.barGeom = function (P, b) {
  const a = M.node(P, b.n1), c = M.node(P, b.n2); if (!a || !c) return null;
  const dx = c.x - a.x, dz = c.z - a.z, L = Math.hypot(dx, dz);
  return { a, b: c, dx, dz, L, c: L ? dx / L : 1, s: L ? dz / L : 0, ang: Math.atan2(dz, dx) * 180 / Math.PI };
};
// rola pręta: belka (≤ 45° od poziomu), słup (> 45°), pręt kratownicy
M.roleOf = function (P, b) {
  if (b.role && b.role !== 'auto') return b.role;
  if (b.type === 'truss') return 'brace';
  const g = M.barGeom(P, b); if (!g) return 'beam';
  return Math.abs(g.s) > Math.SQRT1_2 + 1e-9 ? 'col' : 'beam';
};
M.ROLE_N = { beam: 'belka', col: 'słup', brace: 'pręt kratowy / stężenie' };

/* ---------------------------------------------------------------- obciążenia → MES */
const DIR = { Z: [0, -1], X: [1, 0] };
// rozłożone: {kind:'dist', bar, dir, q1, q2, x1, x2 (względne 0–1), proj}
function distToLocal(ld, g) {
  const L = g.L, x1 = Math.max(0, Math.min(1, num(ld.x1, 0))) * L, x2 = Math.max(0, Math.min(1, num(ld.x2, 1))) * L;
  let q1 = num(ld.q1, 0), q2 = ld.q2 === '' || ld.q2 === undefined || ld.q2 === null ? q1 : num(ld.q2, q1);
  let px = 0, py = 0;
  if (ld.dir === 'z') { px = 0; py = -1; }
  else if (ld.dir === 'x') { px = 1; py = 0; }
  else {
    const d = DIR[ld.dir] || DIR.Z; px = d[0] * g.c + d[1] * g.s; py = -d[0] * g.s + d[1] * g.c;
    if (ld.proj) { const f = ld.dir === 'X' ? Math.abs(g.s) : Math.abs(g.c); q1 *= f; q2 *= f; }
  }
  if (!(x2 - x1 > 1e-9)) return null;
  return { t: 'q', x1, x2, px1: px * q1, px2: px * q2, py1: py * q1, py2: py * q2 };
}
function pointToLocal(ld, g) {
  const a = Math.max(0, Math.min(1, num(ld.x, 0.5))) * g.L, P = num(ld.P, 0);
  let px = 0, py = 0;
  if (ld.dir === 'z') py = -P; else if (ld.dir === 'x') px = P;
  else { const d = DIR[ld.dir] || DIR.Z; px = P * (d[0] * g.c + d[1] * g.s); py = P * (-d[0] * g.s + d[1] * g.c); }
  return { t: 'P', a, px, py };
}
M.loadPositions = function (P, b) {   // punkty skoków (siły i momenty skupione) – stacje wyników
  const g = M.barGeom(P, b), xs = [];
  P.loads.forEach(l => { if (l.bar === b.id && (l.kind === 'point' || l.kind === 'moment')) xs.push(Math.max(0, Math.min(1, num(l.x, 0.5))) * g.L); });
  return xs;
};
// obciążenia przypadku w formacie MES
M.caseFEM = function (P, ctx, lc) {
  const out = { nodal: [], el: [], settle: [] }, byEl = new Map();
  const elL = (ei) => { if (!byEl.has(ei)) { const o = { el: ei, loads: [] }; byEl.set(ei, o); out.el.push(o); } return byEl.get(ei).loads; };
  if (lc.sw) ctx.bars.forEach((b, ei) => { const g = ctx.geo[ei], p = ctx.props[ei]; if (!p || !(p.g > 0)) return; elL(ei).push({ t: 'q', x1: 0, x2: g.L, px1: -g.s * p.g, px2: -g.s * p.g, py1: -g.c * p.g, py2: -g.c * p.g, sw: true }); });
  P.loads.filter(l => l.case === lc.id).forEach(l => {
    if (l.kind === 'node') {
      const ni = ctx.nIdx.get(l.node); if (ni === undefined) return;
      out.nodal.push({ node: ni, Fx: num(l.Fx, 0), Fz: -num(l.Fz, 0), M: -num(l.M, 0) });
    } else if (l.kind === 'settle') {
      const ni = ctx.nIdx.get(l.node); if (ni === undefined) return;
      out.settle.push({ node: ni, ux: num(l.dx, 0) / 1000, uz: -num(l.dz, 0) / 1000, ry: -num(l.dr, 0) / 1000 });
    } else {
      const ei = ctx.bIdx.get(l.bar); if (ei === undefined) return;
      const g = ctx.geo[ei], p = ctx.props[ei];
      if (l.kind === 'dist') { const q = distToLocal(l, g); if (q) elL(ei).push(q); }
      else if (l.kind === 'point') elL(ei).push(pointToLocal(l, g));
      else if (l.kind === 'moment') elL(ei).push({ t: 'M', a: Math.max(0, Math.min(1, num(l.x, 0.5))) * g.L, m: -num(l.M, 0) });
      else if (l.kind === 'temp') elL(ei).push({ t: 'T', e0: p.alpha * num(l.dT, 0), k0: -p.alpha * num(l.dTg, 0) / p.h });
    }
  });
  return out;
};

/* ---------------------------------------------------------------- walidacja i model analizy */
M.prepare = function (P) {
  const errors = [], warnings = [];
  const used = new Set(); P.bars.forEach(b => { used.add(b.n1); used.add(b.n2); });
  const nodes = P.nodes.filter(n => used.has(n.id));
  const nIdx = new Map(); nodes.forEach((n, i) => nIdx.set(n.id, i));
  const bars = [], geo = [], props = [], bIdx = new Map();
  P.bars.forEach(b => {
    const g = M.barGeom(P, b);
    if (!g) { errors.push(`Pręt ${b.id}: brak węzła.`); return; }
    if (!(g.L > 1e-6)) { errors.push(`Pręt ${b.id}: zerowa długość.`); return; }
    const s = M.sec(P, b.sec);
    if (!s) { errors.push(`Pręt ${b.id}: nie przypisano przekroju.`); return; }
    const p = SEC().props(s);
    if (!p.ok) { errors.push(`Pręt ${b.id}: przekrój ${SEC().label(s)} – ${p.err}`); return; }
    bIdx.set(b.id, bars.length); bars.push(b); geo.push(g); props.push(p);
  });
  // pręty pokrywające się
  for (let i = 0; i < bars.length; i++) for (let j = i + 1; j < bars.length; j++) { const a = bars[i], b = bars[j]; if ((a.n1 === b.n1 && a.n2 === b.n2) || (a.n1 === b.n2 && a.n2 === b.n1)) errors.push(`Pręty ${a.id} i ${b.id} łączą te same węzły.`); }
  const sups = [];
  P.supports.forEach(s => { const ni = nIdx.get(s.node); if (ni === undefined) { warnings.push(`Podpora w węźle ${s.node} nie jest połączona z prętem – pominięto.`); return; } sups.push({ node: ni, ux: !!s.ux, uz: !!s.uz, ry: !!s.ry, kx: s.kx, kz: s.kz, kr: s.kr, ang: s.ang }); });
  if (!bars.length) errors.push('Model nie zawiera prętów.');
  if (bars.length && !sups.length) errors.push('Model nie ma podpór.');
  const nsub = Math.max(2, Math.min(24, Math.round(num(P.settings.nsub, 8))));
  const am = {
    nodes: nodes.map(n => ({ x: n.x, z: n.z })),
    els: bars.map((b, i) => ({ n1: nIdx.get(b.n1), n2: nIdx.get(b.n2), EA: props[i].EA, EI: props[i].EI, label: b.id,
      GA: P.settings.shear === 'all' || (P.settings.shear !== 'none' && props[i].mat === 'D') ? props[i].GA : 0,
      rel: b.type === 'truss' ? [0, 0] : [b.rel[0], b.rel[1]], nsub: b.type === 'truss' ? 4 : nsub })),
    sups,
  };
  return { errors, warnings, nodes, nIdx, bars, bIdx, geo, props, am };
};

/* ---------------------------------------------------------------- analiza */
M.analyze = function (P, opt) {
  opt = opt || {};
  const t0 = Date.now();
  const ctx = M.prepare(P);
  const R = { ok: false, errors: ctx.errors, warnings: ctx.warnings, ctx, cases: {}, t: 0 };
  if (ctx.errors.length) return R;
  let A;
  try { A = FEM().Analysis(ctx.am); } catch (e) { R.errors.push('Błąd budowy modelu: ' + e.message); return R; }
  R.A = A;
  if (A.sing) {
    const si = A.singInfo; let where = '';
    if (si) { if (si.node !== null && si.node !== undefined) where = ` – węzeł ${ctx.nodes[si.node].id}, kierunek ${si.dir}`; else if (si.sub !== undefined) where = ` – pręt ${ctx.bars[si.sub].id}, kierunek ${si.dir}`; }
    R.errors.push(`Układ geometrycznie zmienny (mechanizm)${where}. Sprawdź podpory, przeguby i połączenia prętów.`);
    return R;
  }
  if (A.freeRot && A.Sy.freeRot.length) { /* */ }
  // stacje wyników prętów (wspólne dla wszystkich przypadków)
  R.xs = ctx.bars.map(b => M.loadPositions(P, b));
  const cases = P.cases;
  cases.forEach(lc => {
    const L = M.caseFEM(P, ctx, lc);
    const res = FEM().solveCase(A, L);
    const bars = ctx.bars.map((b, ei) => FEM().memberResults(A, res, ei, R.xs[ei]));
    const reac = FEM().reactions(A, res);
    R.cases[lc.id] = { res, bars, reac, disp: ctx.nodes.map((n, i) => FEM().nodeDisp(A, res, i)), fem: L };
  });
  // kombinacje
  const s = P.settings;
  R.combos = CMB().list(cases, s, { user: P.combUser });
  R.env = {};
  ['ULS', 'CHAR', 'FREQ', 'QP', 'ACC'].forEach(t => { if (t === 'ACC' && !cases.some(CMB().isAcc)) return; R.env[t] = M.envelope(P, R, t); });
  // analiza II rzędu (P-Δ) – kombinacje SGN obliczane osobno
  if (+s.order === 2) {
    // kombinacje decydujące wg obwiedni liniowej (N, V, M w każdym punkcie) + kombinacje jawne o największym obciążeniu pionowym
    R.p2 = {}; const ul = [], seen = new Set();
    const addC = (c) => { const key = c.typ + '|' + Object.keys(c.f).sort().map(k => k + ':' + (+c.f[k]).toFixed(4)).join(','); if (seen.has(key)) return; seen.add(key); ul.push(c); };
    ['ULS', 'ACC'].forEach(typ => { const E = R.env[typ]; if (!E) return;
      E.bars.forEach(o => ['N', 'V', 'M'].forEach(k => ['max', 'min'].forEach(mm => (o[k + mm + 'C'] || []).forEach(d => { if (d) addC({ typ, f: CMB().factors(cases, d, s, typ), name: CMB().describe(cases, d), desc: d }); })))); });
    ul.forEach((c, i) => { c.id = 'P' + (i + 1); });
    ul.forEach(c => {
      const lc = M.comboFEM(P, ctx, c);
      const r = FEM().solveP2(A, lc);
      if (r.unstable) { R.p2[c.id] = { unstable: true }; R.warnings.push(`Kombinacja ${c.id}: utrata stateczności w analizie II rzędu (obciążenie ≥ krytyczne).`); return; }
      R.p2[c.id] = { res: r, bars: ctx.bars.map((b, ei) => FEM().memberResults(A, r, ei, R.xs[ei])), reac: FEM().reactions(A, r), disp: ctx.nodes.map((n, i) => FEM().nodeDisp(A, r, i)) };
    });
    R.p2list = ul;
    R.env.ULS = M.envelopeExplicit(P, R, ul.filter(c => c.typ === 'ULS' && R.p2[c.id] && !R.p2[c.id].unstable));
    if (R.env.ACC) R.env.ACC = M.envelopeExplicit(P, R, ul.filter(c => c.typ === 'ACC' && R.p2[c.id] && !R.p2[c.id].unstable));
  }
  R.ok = true; R.t = Date.now() - t0;
  return R;
};
// obciążenia kombinacji (do analizy II rzędu)
M.comboFEM = function (P, ctx, c) {
  const out = { nodal: [], el: [], settle: [] }, byEl = new Map();
  Object.keys(c.f).forEach(id => {
    const lc = P.cases.find(q => q.id === id); if (!lc) return; const f = c.f[id]; if (!f) return;
    const L = M.caseFEM(P, ctx, lc);
    L.nodal.forEach(p => out.nodal.push({ node: p.node, Fx: f * p.Fx, Fz: f * p.Fz, M: f * p.M }));
    L.settle.forEach(p => out.settle.push({ node: p.node, ux: f * p.ux, uz: f * p.uz, ry: f * p.ry }));
    L.el.forEach(g => { if (!byEl.has(g.el)) { const o = { el: g.el, loads: [] }; byEl.set(g.el, o); out.el.push(o); } const arr = byEl.get(g.el).loads; g.loads.forEach(ld => { const o = Object.assign({}, ld); ['px1', 'px2', 'py1', 'py2', 'px', 'py', 'm', 'e0', 'k0'].forEach(k => { if (o[k] !== undefined) o[k] *= f; }); arr.push(o); }); });
  });
  return out;
};
// wyniki kombinacji jawnej (liniowo z przypadków albo z analizy II rzędu)
M.comboResult = function (P, R, c) {
  if (R.p2 && R.p2[c.id] && !R.p2[c.id].unstable) return R.p2[c.id];
  const ids = Object.keys(c.f);
  const bars = R.ctx.bars.map((b, ei) => {
    const base = R.cases[ids[0]] ? R.cases[ids[0]].bars[ei] : null; if (!base) return [];
    return base.map((st, k) => { const o = { x: st.x, N: 0, V: 0, M: 0, w: 0, u: 0, gx: 0, gz: 0 }; ids.forEach(id => { const r = R.cases[id]; if (!r) return; const q = r.bars[ei][k], f = c.f[id]; ['N', 'V', 'M', 'w', 'u', 'gx', 'gz'].forEach(key => { o[key] += f * q[key]; }); }); return o; });
  });
  const reac = {}; Object.keys(R.cases[ids[0]] ? R.cases[ids[0]].reac : {}).forEach(n => { reac[n] = [0, 0, 0]; ids.forEach(id => { const r = R.cases[id]; if (r) r.reac[n].forEach((v, k) => { reac[n][k] += c.f[id] * v; }); }); });
  const disp = R.ctx.nodes.map((n, i) => { const d = [0, 0, 0]; ids.forEach(id => { const r = R.cases[id]; if (r) r.disp[i].forEach((v, k) => { d[k] += c.f[id] * v; }); }); return d; });
  return { bars, reac, disp };
};
// obwiednia „tylko niekorzystne” po przypadkach (analiza liniowa)
M.envelope = function (P, R, typ) {
  const cases = P.cases, s = P.settings, E = CMB().envelope, out = { typ, bars: [], reac: {}, disp: [] };
  const KEYS = typ === 'ULS' || typ === 'ACC' ? ['N', 'V', 'M'] : ['N', 'V', 'M', 'w', 'gx', 'gz'];
  R.ctx.bars.forEach((b, ei) => {
    const n = R.cases[cases[0].id].bars[ei].length, o = {};
    KEYS.forEach(k => { o[k + 'max'] = new Float64Array(n); o[k + 'min'] = new Float64Array(n); o[k + 'maxC'] = []; o[k + 'minC'] = []; });
    for (let i = 0; i < n; i++) KEYS.forEach(k => { const vals = {}; cases.forEach(c => { vals[c.id] = R.cases[c.id].bars[ei][i][k]; }); const e = E(cases, vals, s, typ); o[k + 'max'][i] = e.max; o[k + 'min'][i] = e.min; o[k + 'maxC'][i] = e.maxC; o[k + 'minC'][i] = e.minC; });
    o.x = R.cases[cases[0].id].bars[ei].map(q => q.x);
    out.bars.push(o);
  });
  Object.keys(R.cases[cases[0].id].reac).forEach(nd => { out.reac[nd] = [0, 1, 2].map(k => { const vals = {}; cases.forEach(c => { vals[c.id] = R.cases[c.id].reac[nd][k]; }); return E(cases, vals, s, typ); }); });
  R.ctx.nodes.forEach((nn, i) => { out.disp.push([0, 1, 2].map(k => { const vals = {}; cases.forEach(c => { vals[c.id] = R.cases[c.id].disp[i][k]; }); return E(cases, vals, s, typ); })); });
  return out;
};
// obwiednia z jawnych kombinacji (analiza II rzędu)
M.envelopeExplicit = function (P, R, list) {
  const out = { typ: 'ULS', bars: [], reac: {}, disp: [], explicit: true };
  const res = list.map(c => ({ c, r: M.comboResult(P, R, c) }));
  R.ctx.bars.forEach((b, ei) => {
    const n = R.cases[P.cases[0].id].bars[ei].length, o = {};
    ['N', 'V', 'M'].forEach(k => { o[k + 'max'] = new Float64Array(n).fill(-Infinity); o[k + 'min'] = new Float64Array(n).fill(Infinity); o[k + 'maxC'] = []; o[k + 'minC'] = []; });
    res.forEach(({ c, r }) => { const arr = r.bars[ei]; for (let i = 0; i < n; i++) ['N', 'V', 'M'].forEach(k => { const v = arr[i][k]; if (v > o[k + 'max'][i]) { o[k + 'max'][i] = v; o[k + 'maxC'][i] = { ref: c.id, name: c.name }; } if (v < o[k + 'min'][i]) { o[k + 'min'][i] = v; o[k + 'minC'][i] = { ref: c.id, name: c.name }; } }); });
    ['N', 'V', 'M'].forEach(k => { for (let i = 0; i < n; i++) { if (!isFinite(o[k + 'max'][i])) o[k + 'max'][i] = 0; if (!isFinite(o[k + 'min'][i])) o[k + 'min'][i] = 0; } });
    o.x = R.cases[P.cases[0].id].bars[ei].map(q => q.x);
    out.bars.push(o);
  });
  Object.keys(R.cases[P.cases[0].id].reac).forEach(nd => { out.reac[nd] = [0, 1, 2].map(k => { const e = { max: -Infinity, min: Infinity, maxC: null, minC: null }; res.forEach(({ c, r }) => { const v = r.reac[nd][k]; if (v > e.max) { e.max = v; e.maxC = { ref: c.id }; } if (v < e.min) { e.min = v; e.minC = { ref: c.id }; } }); if (!isFinite(e.max)) { e.max = 0; e.min = 0; } return e; }); });
  return out;
};
// analiza wyboczeniowa dla kombinacji c: α_cr, postać, długości wyboczeniowe prętów ściskanych
M.buckling = function (P, R, c, nModes) {
  const A = R.A, ctx = R.ctx;
  const lc = M.comboFEM(P, ctx, c), r = FEM().solveCase(A, lc), N = FEM().axial(A, r);
  if (!N.some(v => v < -1e-6)) return { none: true };
  let b;
  try { b = FEM().buckling(A, N, nModes || 1); } catch (e) { return { err: e.message }; }
  if (!b || !b.length || !isFinite(b[0].alpha)) return { none: true };
  const alpha = b[0].alpha;
  const Ncomp = ctx.bars.map((bb, ei) => { const info = A.M.elInfo[ei]; let mn = 0; for (let k = 0; k < info.ns; k++) mn = Math.min(mn, N[info.first + k]); return mn; });
  const Lcr = ctx.bars.map((bb, ei) => (Ncomp[ei] < -1e-6 ? Math.PI * Math.sqrt(ctx.props[ei].EI / (alpha * -Ncomp[ei])) : null));
  const modes = b.map(m => ({ alpha: m.alpha, disp: ctx.nodes.map((n, i) => [0, 1, 2].map(k => m.u[A.Sy.dofOf(i, k)])), u: m.u }));
  return { alpha, modes, Ncomp, Lcr, combo: c };
};
// wartości ekstremalne obwiedni (do tabel i opisu)
M.extremes = function (R, typ, ei) {
  const e = R.env[typ] && R.env[typ].bars[ei]; if (!e) return null;
  const pick = (arr, f) => { let bi = 0; for (let i = 1; i < arr.length; i++) if (f(arr[i], arr[bi])) bi = i; return { v: arr[bi], i: bi, x: e.x[bi] }; };
  const o = {};
  ['N', 'V', 'M', 'w'].forEach(k => { if (!e[k + 'max']) return; o[k + 'max'] = pick(e[k + 'max'], (a, b) => a > b); o[k + 'min'] = pick(e[k + 'min'], (a, b) => a < b); });
  return o;
};

/* ---------------------------------------------------------------- operacje edycyjne */
M.addNode = function (P, x, z, tol) {
  const t = tol === undefined ? 1e-6 : tol;
  const ex = P.nodes.find(n => Math.abs(n.x - x) <= t && Math.abs(n.z - z) <= t); if (ex) return ex;
  const n = { id: P.seq.node++, x: Math.round(x * 1e6) / 1e6, z: Math.round(z * 1e6) / 1e6 }; P.nodes.push(n); return n;
};
M.addBar = function (P, n1, n2, sec, o) {
  if (n1 === n2) return null;
  const ex = P.bars.find(b => (b.n1 === n1 && b.n2 === n2) || (b.n1 === n2 && b.n2 === n1)); if (ex) return ex;
  const b = Object.assign({ id: P.seq.bar++, n1, n2, sec, type: 'frame', rel: [null, null], role: 'auto', name: '' }, o || {}); P.bars.push(b); return b;
};
M.setSupport = function (P, node, type, extra) {
  P.supports = P.supports.filter(s => s.node !== node);
  if (!type || type === 'none') return null;
  const t = M.SUP_TYPES[type] || M.SUP_TYPES.pin;
  const s = Object.assign({ node, ux: t.ux, uz: t.uz, ry: t.ry, kx: 0, kz: 0, kr: 0, ang: 0 }, extra || {}); P.supports.push(s); return s;
};
M.deleteNodes = function (P, ids) {
  const set = new Set(ids);
  const bars = P.bars.filter(b => set.has(b.n1) || set.has(b.n2)).map(b => b.id);
  M.deleteBars(P, bars);
  P.nodes = P.nodes.filter(n => !set.has(n.id));
  P.supports = P.supports.filter(s => !set.has(s.node));
  P.loads = P.loads.filter(l => !(l.node !== undefined && set.has(l.node)));
};
M.deleteBars = function (P, ids) {
  const set = new Set(ids);
  P.bars = P.bars.filter(b => !set.has(b.id));
  P.loads = P.loads.filter(l => !(l.bar !== undefined && set.has(l.bar)));
  P.design.forEach(d => { d.bars = d.bars.filter(id => !set.has(id)); });
  P.design = P.design.filter(d => d.bars.length);
};
// podział pręta węzłem w punkcie t (0–1): obciążenia przenoszone na części
M.splitBar = function (P, barId, t) {
  const b = M.bar(P, barId), g = M.barGeom(P, b); if (!g || !(t > 1e-6 && t < 1 - 1e-6)) return null;
  const n = M.addNode(P, g.a.x + g.dx * t, g.a.z + g.dz * t);
  const b2 = { id: P.seq.bar++, n1: n.id, n2: b.n2, sec: b.sec, type: b.type, rel: [null, b.rel[1]], role: b.role, name: b.name };
  b.n2 = n.id; b.rel = [b.rel[0], null];
  P.bars.splice(P.bars.indexOf(b) + 1, 0, b2);
  const moved = [];
  P.loads.filter(l => l.bar === b.id).forEach(l => {
    if (l.kind === 'point' || l.kind === 'moment') { const x = num(l.x, 0.5); if (x > t) { l.bar = b2.id; l.x = (x - t) / (1 - t); } else l.x = x / t; }
    else if (l.kind === 'dist') {
      const x1 = num(l.x1, 0), x2 = num(l.x2, 1), q1 = num(l.q1, 0), q2 = l.q2 === '' || l.q2 === undefined ? q1 : num(l.q2, q1), qAt = x => x2 > x1 ? q1 + (q2 - q1) * (x - x1) / (x2 - x1) : q1;
      if (x2 <= t) { l.x1 = x1 / t; l.x2 = x2 / t; }
      else if (x1 >= t) { l.bar = b2.id; l.x1 = (x1 - t) / (1 - t); l.x2 = (x2 - t) / (1 - t); }
      else { const qt = qAt(t); moved.push(Object.assign({}, l, { id: P.seq.load++, bar: b2.id, x1: 0, x2: (x2 - t) / (1 - t), q1: qt, q2 })); l.x1 = x1 / t; l.x2 = 1; l.q2 = qt; }
    } else if (l.kind === 'temp') moved.push(Object.assign({}, l, { id: P.seq.load++, bar: b2.id }));
  });
  P.loads.push(...moved);
  P.design.forEach(d => { const i = d.bars.indexOf(b.id); if (i >= 0) d.bars.splice(i + 1, 0, b2.id); });
  return { node: n, bar: b2 };
};
// scalenie węzłów pokrywających się
M.mergeNodes = function (P, tol) {
  const t = tol || 1e-4, map = new Map();
  P.nodes.forEach((n, i) => { for (let j = 0; j < i; j++) { const m = P.nodes[j]; if (!map.has(m.id) && Math.abs(m.x - n.x) <= t && Math.abs(m.z - n.z) <= t) { map.set(n.id, m.id); break; } } });
  if (!map.size) return 0;
  P.bars.forEach(b => { if (map.has(b.n1)) b.n1 = map.get(b.n1); if (map.has(b.n2)) b.n2 = map.get(b.n2); });
  P.bars = P.bars.filter(b => b.n1 !== b.n2);
  P.supports.forEach(s => { if (map.has(s.node)) s.node = map.get(s.node); });
  P.loads.forEach(l => { if (l.node !== undefined && map.has(l.node)) l.node = map.get(l.node); });
  P.nodes = P.nodes.filter(n => !map.has(n.id));
  return map.size;
};
M.nextCaseId = function (P, cat) {
  const pre = cat === 'A' ? 'A' : cat === 'E' ? 'E' : cat;
  let k = 1; while (P.cases.some(c => c.id === pre + k)) k++; return pre + k;
};
M.bounds = function (P) {
  if (!P.nodes.length) return { x0: 0, x1: 10, z0: 0, z1: 6 };
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  P.nodes.forEach(n => { x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x); z0 = Math.min(z0, n.z); z1 = Math.max(z1, n.z); });
  return { x0, x1, z0, z1 };
};

root.RMODEL = M;
if (typeof module !== 'undefined' && module.exports) module.exports = M;
})(typeof window !== 'undefined' ? window : globalThis);
