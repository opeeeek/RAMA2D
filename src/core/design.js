/* =====================================================================
   RAMA2D – elementy wymiarowane i wymiana danych z modułami
   • wykrywanie elementów: belki (ciągi współliniowych prętów z podporami –
     przęsła, wsporniki, węzły pośrednie) i słupy (kondygnacyjne),
   • model → moduł: schemat statyczny (przęsła, podpory, podatność obrotowa
     od prętów dochodzących – rama zastępcza, przeguby), przekrój, materiał,
     obciążenia charakterystyczne w przypadkach (jedno oddziaływanie modułu
     na przypadek modelu), siły przekazywane w węzłach połączeń (z analizy
     globalnej), siły na końcach słupów, długości wyboczeniowe,
   • moduł → model: przekrój (wymiary, kształtownik), materiał, nazwa,
   • kontrola wytężenia elementów silnikami modułów (bez otwierania modułu).
   Dane sterowane z modelu są w module nadpisywane przy każdej zmianie
   modelu; pozostałe ustawienia modułu (zbrojenie, ekspozycja, stężenia,
   połączenia itd.) należą do modułu i są zachowywane. Obciążenia dodane
   w module (bez znacznika „rama”) są zachowywane i nie wpływają na model.
   ===================================================================== */
(function (root) {
'use strict';
const M = () => root.RMODEL, SEC = () => root.RSEC, ENG = () => root.RAMA_ENG, CMB = () => root.RCOMB, FEM = () => root.RFEM;
const D = {};
const clone = o => JSON.parse(JSON.stringify(o));
const r3 = v => Math.round(v * 1000) / 1000, r2 = v => Math.round(v * 100) / 100, r1 = v => Math.round(v * 10) / 10;

D.MODS = {
  ZB: { n: 'Żelbet', mat: 'C', beam: { app: 'BelkaZB', eng: 'BZB', n: 'Belka żelbetowa' }, col: { app: 'SlupZB', eng: 'SZB', n: 'Słup żelbetowy' } },
  ST: { n: 'Stal', mat: 'S', beam: { app: 'BelkaStal', eng: 'BST', n: 'Belka stalowa' }, col: { app: 'SlupStal', eng: 'SST', n: 'Słup stalowy' } },
  DR: { n: 'Drewno', mat: 'D', beam: { app: 'BelkaDR', eng: 'BDR', n: 'Belka drewniana' }, col: { app: 'SlupDrewniany', eng: 'SDR', n: 'Słup drewniany' } },
};
D.modOfMat = mat => ({ C: 'ZB', S: 'ST', D: 'DR' }[mat] || 'ZB');

/* ------------------------------------------------------------ topologia */
D.topo = function (P) {
  const at = new Map(); P.nodes.forEach(n => at.set(n.id, []));
  P.bars.forEach(b => { if (at.has(b.n1)) at.get(b.n1).push(b); if (at.has(b.n2)) at.get(b.n2).push(b); });
  const sup = new Map(); P.supports.forEach(s => sup.set(s.node, s));
  return { at, sup };
};
const unit = (P, b) => { const g = M().barGeom(P, b); return g ? [g.dx / g.L, g.dz / g.L] : [1, 0]; };
const collinear = (P, a, b) => { const u = unit(P, a), v = unit(P, b); return Math.abs(u[0] * v[1] - u[1] * v[0]) < 1e-3; };
const other = (b, n) => (b.n1 === n ? b.n2 : b.n1);
const matOf = (P, b) => { const s = M().sec(P, b.sec); return s ? s.mat : null; };

// ciąg prętów współliniowych od pręta b (te same: rola, materiał; dla stali i drewna – ten sam przekrój); stop – węzeł dzielący
function grow(P, T, b0, ok, stopAt) {
  const chain = [b0], used = new Set([b0.id]);
  [b0.n1, b0.n2].forEach((start, side) => {
    let cur = b0, n = start;
    for (;;) {
      if (stopAt && stopAt(n, cur)) break;
      const cand = (T.at.get(n) || []).filter(q => !used.has(q.id) && ok(q) && collinear(P, cur, q));
      if (cand.length !== 1) break;
      const q = cand[0]; used.add(q.id);
      if (side === 0) chain.unshift(q); else chain.push(q);
      cur = q; n = other(q, n);
    }
  });
  return chain;
}
// uporządkowanie ciągu: węzły od początku (belka: od lewej; słup: od dołu)
D.order = function (P, barIds) {
  const bars = barIds.map(id => M().bar(P, id)).filter(Boolean);
  if (!bars.length) return null;
  const deg = new Map(); bars.forEach(b => { deg.set(b.n1, (deg.get(b.n1) || 0) + 1); deg.set(b.n2, (deg.get(b.n2) || 0) + 1); });
  const ends = Array.from(deg.keys()).filter(n => deg.get(n) === 1);
  if (ends.length !== 2) return null;
  const A = M().node(P, ends[0]), B = M().node(P, ends[1]);
  const dx = B.x - A.x, dz = B.z - A.z;
  const startAtA = Math.abs(dx) >= Math.abs(dz) ? dx > 0 : dz > 0;
  let n = startAtA ? A.id : B.id; const nodes = [n], seq = [], rest = bars.slice();
  while (rest.length) {
    const i = rest.findIndex(b => b.n1 === n || b.n2 === n); if (i < 0) return null;
    const b = rest.splice(i, 1)[0]; seq.push({ bar: b, rev: b.n1 !== n }); n = other(b, n); nodes.push(n);
  }
  const N0 = M().node(P, nodes[0]), N1 = M().node(P, nodes[nodes.length - 1]);
  const L = Math.hypot(N1.x - N0.x, N1.z - N0.z), c = (N1.x - N0.x) / L, s = (N1.z - N0.z) / L;
  let acc = 0; const xs = [0];
  seq.forEach(q => { acc += M().barGeom(P, q.bar).L; xs.push(acc); });
  return { seq, nodes, xs, L, c, s, ang: Math.atan2(s, c) * 180 / Math.PI };
};

/* ------------------------------------------------------------ wykrywanie elementów */
D.detect = function (P) {
  const T = D.topo(P), taken = new Set(); P.design.forEach(d => d.bars.forEach(id => taken.add(id)));
  const out = [], seen = new Set(), role = b => M().roleOf(P, b);
  P.bars.forEach(b => {
    if (seen.has(b.id) || taken.has(b.id) || b.type === 'truss') return;
    const r = role(b), mat = matOf(P, b); if (!mat || r === 'brace') return;
    let chain;
    if (r === 'beam') {
      chain = grow(P, T, b, q => !taken.has(q.id) && q.type !== 'truss' && role(q) === 'beam' && matOf(P, q) === mat && (mat === 'C' || q.sec === b.sec));
    } else {
      // słup: ciąg przez węzły bez innych prętów (podział słupa), przerwany w węzłach stropów
      chain = grow(P, T, b, q => !taken.has(q.id) && q.type !== 'truss' && role(q) === 'col' && matOf(P, q) === mat && q.sec === b.sec,
        (n) => (T.at.get(n) || []).length > 2 || T.sup.has(n) || P.loads.some(l => l.kind === 'node' && l.node === n && Math.abs(+l.Fx || 0) + Math.abs(+l.Fz || 0) > 0 && false));
    }
    chain.forEach(q => seen.add(q.id));
    const o = D.order(P, chain.map(q => q.id)); if (!o) return;
    out.push({ kind: r === 'beam' ? 'beam' : 'col', mod: D.modOfMat(mat), bars: o.seq.map(q => q.bar.id), L: o.L });
  });
  return out;
};
D.nextName = function (P, kind) {
  const pre = kind === 'col' ? 'S-' : 'B-'; let k = 1;
  while (P.design.some(d => d.name === pre + k)) k++; return pre + k;
};
D.create = function (P, prop) {
  const el = { id: 'd' + (P.seq.des++), mod: prop.mod, kind: prop.kind, bars: prop.bars.slice(), name: prop.name || D.nextName(P, prop.kind), opt: { rot: 'spring' }, st: null, imp: '', res: null };
  P.design.push(el); return el;
};
D.elementOf = (P, barId) => P.design.find(d => d.bars.includes(barId));

/* ------------------------------------------------------------ dane z analizy */
// siła węzła działająca na pręt (globalnie) na końcu przy węźle n – z wyników przypadku
function barEndForce(R, P, b, n, caseRes) {
  const ei = R.ctx.bIdx.get(b.id); if (ei === undefined) return [0, 0, 0];
  const A = R.A, info = A.M.elInfo[ei], atStart = b.n1 === n;
  const qi = atStart ? info.first : info.first + info.ns - 1, q = A.M.subs[qi], f = caseRes.res.ef[qi].f, k = atStart ? 0 : 3;
  return [q.c * f[k] - q.s * f[k + 1], q.s * f[k] + q.c * f[k + 1], f[k + 2]];
}
// sztywność obrotowa prętów dochodzących do węzła n (bez prętów ciągu), α·EI/L
function rotStiff(P, R, T, n, excl) {
  let k = 0; const parts = [];
  (T.at.get(n) || []).forEach(b => {
    if (excl.has(b.id) || b.type === 'truss') return;
    const relHere = b.n1 === n ? b.rel[0] : b.rel[1], relFar = b.n1 === n ? b.rel[1] : b.rel[0];
    if (relHere === 0) return;
    const s = M().sec(P, b.sec); if (!s) return;
    const p = SEC().props(s), g = M().barGeom(P, b); if (!p.ok) return;
    const far = other(b, n), fs = T.sup.get(far), farBars = (T.at.get(far) || []).filter(q => q.id !== b.id && q.type !== 'truss');
    let a;
    if (relFar === 0) a = 3;
    else if (fs && fs.ry) a = 4;
    else if (farBars.length) a = 4;            // węzeł ciągły – przyjęto utwierdzenie na końcu odległym (rama zastępcza)
    else if (fs && (fs.ux || fs.uz)) a = 3;
    else a = 0;
    // odkształcenia postaciowe (gdy uwzględniane w analizie): Φ = 12EI/(GA·L²); k = (4+Φ)/(1+Φ)·EI/L lub 12/(4+Φ)·EI/L
    const shear = P.settings.shear === 'all' || (P.settings.shear !== 'none' && s.mat === 'D');
    const ph = shear && p.GA > 0 ? 12 * p.EI / (p.GA * g.L * g.L) : 0;
    if (a === 4) a = (4 + ph) / (1 + ph); else if (a === 3) a = 12 / (4 + ph);
    let kk = a * p.EI / g.L;
    if (relHere > 0) kk = 1 / (1 / kk + 1 / relHere);
    if (kk > 0) { k += kk; parts.push({ bar: b.id, a, k: kk }); }
  });
  return { k, parts };
}
// czy węzeł n podpiera ciąg (podpora zewnętrzna z blokadą prostopadłą do osi ciągu, pręt poniżej, wieszak)
function isSupport(P, R, T, n, excl, dir) {
  const sp = T.sup.get(n);
  const perp = [-dir[1], dir[0]];
  if (sp) {
    const ang = (sp.ang || 0) * Math.PI / 180, ax = [[Math.cos(ang), Math.sin(ang)], [-Math.sin(ang), Math.cos(ang)]];
    if ((sp.ux || sp.kx > 0) && Math.abs(ax[0][0] * perp[0] + ax[0][1] * perp[1]) > 0.3) return true;
    if ((sp.uz || sp.kz > 0) && Math.abs(ax[1][0] * perp[0] + ax[1][1] * perp[1]) > 0.3) return true;
  }
  const N0 = M().node(P, n);
  return (T.at.get(n) || []).some(b => {
    if (excl.has(b.id)) return false;
    const o = M().node(P, other(b, n)), g = M().barGeom(P, b), u = [(o.x - N0.x) / g.L, (o.z - N0.z) / g.L];
    const along = Math.abs(u[0] * perp[0] + u[1] * perp[1]);
    if (along < 0.5) return false;                                    // pręt prawie równoległy do ciągu
    const below = (u[0] * perp[0] + u[1] * perp[1]) < 0;              // po stronie „spodu”
    if (below) return true;
    // wieszak: pręt powyżej rozciągany od obciążeń stałych
    if (R && R.ok) { const lc = P.cases.find(c => c.cat === 'G'); const ei = R.ctx.bIdx.get(b.id); if (lc && ei !== undefined) { const st = R.cases[lc.id].bars[ei]; if (st && st[0].N > 1e-3) return true; } }
    return false;
  });
}

/* ------------------------------------------------------------ obciążenia ciągu w przypadku */
// zwraca obciążenia w układzie ciągu: q – odcinki {x1,x2,q1,q2} (prostopadle, + w stronę spodu), qa – osiowe, P – siły skupione {x, P, Pa, M}
function chainLoads(P, R, O, lc, supportNodes) {
  const ctx = R.ctx, L = M().caseFEM(P, ctx, lc);
  const out = { q: [], P: [], warn: [] };
  O.seq.forEach((q, k) => {
    const ei = ctx.bIdx.get(q.bar.id), x0 = O.xs[k], Lb = O.xs[k + 1] - O.xs[k];
    const g = L.el.find(e => e.el === ei); if (!g) return;
    g.loads.forEach(ld => {
      if (ld.sw) return;                                         // ciężar własny prętów ciągu – liczony w module
      const sg = q.rev ? -1 : 1, X = x => (q.rev ? x0 + Lb - x : x0 + x);
      if (ld.t === 'q') { const a = X(ld.x1), b = X(ld.x2); const pa = -sg * (ld.py1 || 0), pb = -sg * (ld.py2 || 0); if (Math.abs(pa) + Math.abs(pb) > 1e-9) out.q.push(a < b ? { x1: a, x2: b, q1: pa, q2: pb } : { x1: b, x2: a, q1: pb, q2: pa }); }
      else if (ld.t === 'P') { const P0 = -sg * (ld.py || 0); if (Math.abs(P0) > 1e-9) out.P.push({ x: X(ld.a), P: P0 }); }
      else if (ld.t === 'M') out.warn.push('moment skupiony na pręcie');
      else if (ld.t === 'T') out.warn.push('obciążenie temperaturą');
    });
  });
  // węzły ciągu niebędące podporami: siły przekazywane na ciąg (obciążenia węzłowe, pręty dochodzące – z analizy globalnej)
  const cr = R.cases[lc.id];
  O.nodes.forEach((n, k) => {
    if (supportNodes.has(n)) return;
    const x = O.xs[k], F = [0, 0, 0];
    O.seq.forEach(q => { if (q.bar.n1 === n || q.bar.n2 === n) { const f = barEndForce(R, P, q.bar, n, cr); F[0] += f[0]; F[1] += f[1]; F[2] += f[2]; } });
    // usunięcie wkładu obciążeń prętów ciągu (zawarty w siłach końcowych jako reakcje utwierdzenia) – siły węzłowe = Σ końców − część od obciążeń przęsłowych
    // (dla węzła swobodnego ciągu Σ sił końcowych = obciążenie węzłowe + siły od prętów dochodzących)
    const perpDown = [O.s, -O.c];                                 // −ȳ ciągu
    const Pp = F[0] * perpDown[0] + F[1] * perpDown[1];
    if (Math.abs(Pp) > 1e-6) out.P.push({ x, P: Pp, node: true });
    if (Math.abs(F[2]) > 1e-3) out.warn.push('moment w węźle połączenia');
  });
  return out;
}
// siły na końcach pręta słupa: dolny (x=0) i górny koniec ciągu, z konwencją RAMA2D (N > 0 rozciąganie, M > 0 rozciąga stronę z̄)
function colEndForces(R, O, lc) {
  const cr = R.cases[lc.id], b0 = O.seq[0], b1 = O.seq[O.seq.length - 1];
  const ei0 = R.ctx.bIdx.get(b0.bar.id), ei1 = R.ctx.bIdx.get(b1.bar.id);
  const s0 = cr.bars[ei0], s1 = cr.bars[ei1];
  const bot = b0.rev ? s0[s0.length - 1] : s0[0], top = b1.rev ? s1[0] : s1[s1.length - 1];
  const sgn0 = b0.rev ? -1 : 1, sgn1 = b1.rev ? -1 : 1;     // pręt odwrócony: z̄ po drugiej stronie, V zmienia znak
  return { Nb: bot.N, Nt: top.N, Mb: sgn0 * bot.M, Mt: sgn1 * top.M, Vb: bot.V, Vt: top.V };
}

/* ------------------------------------------------------------ kategorie przypadków → moduły */
const KIND = { G: 'perm', Q: 'imp', S: 'snow', W: 'wind', T: 'other', E: 'other', A: 'acc' };
function psiOther(lc) { const p = CMB().psi(lc); return { p0: p[0], p1: p[1], p2: p[2] }; }
const DUR_DR = { P: 'P', L: 'L', M: 'M', S: 'S', I: 'I' };

/* ------------------------------------------------------------ analiza ciągu belki */
D.beamSchema = function (P, R, el) {
  const O = D.order(P, el.bars); if (!O) return { err: 'Pręty elementu nie tworzą ciągłego, współliniowego ciągu.' };
  const T = D.topo(P), excl = new Set(el.bars), dir = [O.c, O.s];
  const supN = new Set(), sups = [];
  O.nodes.forEach((n, k) => {
    if (!isSupport(P, R, T, n, excl, dir)) return;
    supN.add(n);
    const sp = T.sup.get(n), rs = rotStiff(P, R, T, n, excl);
    // przegub ciągu w węźle (zwolniony obrót pręta ciągu)
    let hinge = false;
    O.seq.forEach(q => { if (q.bar.n1 === n && q.bar.rel[0] === 0) hinge = true; if (q.bar.n2 === n && q.bar.rel[1] === 0) hinge = true; });
    const fixed = !!(sp && sp.ry);
    const kr = (sp && sp.kr > 0 ? sp.kr : 0) + rs.k;
    // szerokość podpory: wymiar przekroju pręta podpierającego w płaszczyźnie układu
    let t = '';
    (T.at.get(n) || []).filter(b => !excl.has(b.id)).forEach(b => { const s = M().sec(P, b.sec); if (s) { const p = SEC().props(s); if (p.ok) t = Math.max(+t || 0, Math.round(p.h * 1000)); } });
    sups.push({ node: n, k, x: O.xs[k], fixed, kr, krParts: rs.parts, hinge, t, ext: !!sp, ux: !!(sp && sp.ux) || rs.parts.length > 0 });
  });
  const warn = [];
  if (!sups.length) return { err: 'Element nie ma podpór (brak podpór zewnętrznych ani prętów podpierających w węzłach).' };
  const first = sups[0], last = sups[sups.length - 1];
  const cantL = first.x > 1e-6 ? first.x : 0, cantR = O.L - last.x > 1e-6 ? O.L - last.x : 0;
  const spans = []; for (let i = 0; i < sups.length - 1; i++) spans.push(sups[i + 1].x - sups[i].x);
  // węzły pośrednie (nie podpory) – podział na elementy, przeguby
  const inner = [];
  O.nodes.forEach((n, k) => {
    if (supN.has(n) || k === 0 || k === O.nodes.length - 1) return;
    let hinge = false; O.seq.forEach(q => { if ((q.bar.n1 === n && q.bar.rel[0] === 0) || (q.bar.n2 === n && q.bar.rel[1] === 0)) hinge = true; });
    inner.push({ node: n, x: O.xs[k], hinge });
  });
  // przekroje prętów w odcinkach
  const secAt = x => { let k = O.xs.findIndex((v, i) => i > 0 && x <= v + 1e-9); if (k < 1) k = 1; return M().sec(P, O.seq[k - 1].bar.sec); };
  return { O, sups, spans, cantL, cantR, inner, warn, secAt, sec0: M().sec(P, O.seq[0].bar.sec) };
};

/* ================================================================ ŻELBET – BelkaŻB */
const MAP = {};
MAP.ZB_beam = function (P, R, el, prev) {
  const E = ENG().BZB, sch = D.beamSchema(P, R, el); if (sch.err) return { err: sch.err };
  const S = prev ? E.normalize(clone(prev)) : E.normalize(E.defaultState());
  const warn = [];
  const s0 = sch.sec0, isT = s0.shape === 'T';
  if (s0.mat !== 'C') return { err: 'Przekrój elementu nie jest żelbetowy.' };
  if (s0.shape === 'circ' || s0.shape === 'ring') warn.push('Przekrój okrągły – BelkaŻB obsługuje przekroje prostokątne i teowe; przyjęto prostokąt o wymiarach ⌀×⌀.');
  S.meta.name = el.name;
  S.mat.concrete = s0.cls; S.mat.autoC = false;
  S.geom.type = isT ? 'T' : 'rect';
  S.geom.b = isT ? +s0.b : +(s0.shape === 'circ' || s0.shape === 'ring' ? s0.D : s0.b);
  S.geom.h = +(s0.shape === 'circ' || s0.shape === 'ring' ? s0.D : s0.h);
  if (isT) { S.geom.beff = +s0.beff; S.geom.hf = +s0.hf; S.geom.beffMode = 'manual'; }
  const nSp = sch.spans.length, oneCant = nSp === 0;
  // schemat
  let flip = false;
  if (oneCant) {
    // wspornik: BelkaŻB – utwierdzenie z lewej; gdy podpora jest na prawym końcu – oś odwrócona
    S.scheme = 'cant'; S.geom.L = r3(sch.O.L); flip = sch.sups[0].x > 1e-6;
    if (!sch.sups[0].fixed && !(sch.sups[0].kr > 0)) warn.push('Wspornik bez utwierdzenia w modelu – w module przyjęto utwierdzenie.');
  } else if (nSp === 1 && !sch.cantL && !sch.cantR) { S.scheme = 'ss'; S.geom.L = r3(sch.spans[0]); }
  else {
    S.scheme = 'cont';
    S.cont.spans = sch.spans.map(r3); S.cont.cantL = r3(sch.cantL); S.cont.cantR = r3(sch.cantR);
    if (nSp === 1) { S.cont.spans = [r3(sch.spans[0])]; S.cont.cantL = r3(sch.cantL); S.cont.cantR = r3(sch.cantR); }
  }
  const X = x => (flip ? sch.O.L - x : x);       // współrzędna w module
  // podpory
  const rotMode = (el.opt && el.opt.rot) || 'spring';
  const supList = flip ? sch.sups.slice().reverse() : sch.sups;
  S.supCfg = supList.map((sp, i) => {
    const prevC = (prev && prev.supCfg && prev.supCfg[i]) || {};
    const rigid = sp.fixed || rotMode === 'fix';
    const spring = !rigid && rotMode === 'spring' && sp.kr > 0;
    const r = oneCant ? true : (rigid || spring);
    return { dof: { x: i === 0 || sp.ux, y: true, z: true, r }, kv: '', kr: spring ? Math.round(sp.kr) : '', t: sp.t || prevC.t || '', hinge: sp.hinge && !(i === 0 || i === supList.length - 1), direct: prevC.direct !== false };
  });
  if (oneCant) S.supCfg = [S.supCfg[0]];
  // węzły pośrednie: numer odcinka i odległość od jego początku
  const segBounds = (() => { const b = []; let x = 0; if (S.scheme === 'cont') { if (S.cont.cantL > 0) { b.push([0, S.cont.cantL]); x = S.cont.cantL; } S.cont.spans.forEach(L => { b.push([x, x + L]); x += L; }); if (S.cont.cantR > 0) b.push([x, x + S.cont.cantR]); } else b.push([0, S.geom.L]); return b; })();
  S.nodes = sch.inner.map(q => { const x = X(q.x), si = segBounds.findIndex(b => x > b[0] + 1e-6 && x < b[1] - 1e-6); return si < 0 ? null : { seg: si, a: r3(x - segBounds[si][0]), hinge: q.hinge }; }).filter(Boolean);
  // przekroje przęseł (różne przekroje prętów ciągu)
  if (S.scheme === 'cont') S.cont.geoSpans = segBounds.filter((b, i) => !(S.cont.cantL > 0 && i === 0) && !(S.cont.cantR > 0 && i === segBounds.length - 1)).map(b => { const s = sch.secAt((flip ? sch.O.L - (b[0] + b[1]) / 2 : (b[0] + b[1]) / 2)); return s && (+s.b !== S.geom.b || +s.h !== S.geom.h) && s.shape !== 'T' ? { b: +s.b, h: +s.h } : { b: '', h: '' }; });
  // obciążenia
  const own = k => (S.loads[k] || []).filter(it => !it.rama);
  const perm = [], vr = [], acc = [];
  const lw = new Set();
  let swAny = false;
  P.cases.forEach(lc => {
    if (lc.sw && lc.cat === 'G') swAny = true;
    const L = chainLoads(P, R, sch.O, lc, new Set(sch.sups.map(s => s.node)));
    L.warn.forEach(w => lw.add(w));
    if (!L.q.length && !L.P.length) return;
    // profil q(x) – jedna pozycja na przypadek (punkty x : q, skoki – dwa punkty w tym samym x)
    const segs = L.q.map(s => flip ? { x1: sch.O.L - s.x2, x2: sch.O.L - s.x1, q1: s.q2, q2: s.q1 } : s).sort((a, b) => a.x1 - b.x1);
    const pts = []; segs.forEach(s => { pts.push([r3(s.x1), r3(s.q1)]); pts.push([r3(s.x2), r3(s.q2)]); });
    const overl = segs.some((s, i) => i && s.x1 < segs[i - 1].x2 - 1e-6);
    const it = { rama: true, name: `${lc.id} ${lc.name || ''}`.trim(), span: 0, el: '', dir: 'y', x1: '', x2: '', pts: L.P.map(p => ({ P: r3(p.P), Pz: 0, T: 0, a: r3(X(p.x)), ref: 'L' })) };
    if (segs.length === 1 && Math.abs(segs[0].q1 - segs[0].q2) < 1e-9) Object.assign(it, { shape: 'u', q: r3(segs[0].q1), x1: segs[0].x1 > 1e-6 ? r3(segs[0].x1) : '', x2: segs[0].x2 < sch.O.L - 1e-6 ? r3(segs[0].x2) : '' });
    else if (segs.length === 1) Object.assign(it, { shape: 't', q: r3(segs[0].q1), q2: r3(segs[0].q2), x1: r3(segs[0].x1), x2: r3(segs[0].x2) });
    else if (segs.length) {
      if (overl) { // nakładające się odcinki – suma na siatce punktów
        const xs = Array.from(new Set(segs.flatMap(s => [s.x1, s.x2]).map(r3))).sort((a, b) => a - b);
        const qAt = (x, side) => segs.reduce((a, s) => { const inside = side < 0 ? (x > s.x1 + 1e-9 && x <= s.x2 + 1e-9) : (x >= s.x1 - 1e-9 && x < s.x2 - 1e-9); return a + (inside ? s.q1 + (s.q2 - s.q1) * (x - s.x1) / (s.x2 - s.x1) : 0); }, 0);
        pts.length = 0; xs.forEach(x => { pts.push([x, r3(qAt(x, -1))]); pts.push([x, r3(qAt(x, 1))]); });
      }
      Object.assign(it, { shape: 'p', q: r3(Math.max(...pts.map(p => Math.abs(p[1])))), prof: pts.map(p => `${String(p[0]).replace('.', ',')}:${String(p[1]).replace('.', ',')}`).join('; ') });
    } else Object.assign(it, { shape: 'u', q: 0 });
    if (lc.cat === 'G') perm.push(E.normItem(it, 'perm'));
    else if (lc.cat === 'A') acc.push(E.normItem(it, 'acc'));
    else { const kind = KIND[lc.cat]; Object.assign(it, { kind, cat: lc.qcat || 'B', alt: lc.alt, grp: lc.grp || '' }, kind === 'other' ? psiOther(lc) : {}); vr.push(E.normItem(it, kind)); }
  });
  lw.forEach(w => warn.push(`BelkaŻB nie przyjmuje obciążenia: ${w} – pominięto (sprawdź wpływ w modelu).`));
  S.loads.perm = perm.concat(own('perm')); S.loads.var = vr.concat(own('var')); S.loads.acc = acc.concat(own('acc'));
  S.loads.sw = swAny;
  S.loads.comb = P.settings.comb; S.loads.gG = +P.settings.gG; S.loads.gQ = +P.settings.gQ; S.loads.xi = +P.settings.xi; S.loads.accPsi = P.settings.accPsi;
  // siła podłużna z ramy (SGN, ściskanie +) – gdy istotna
  const NEd = axialULS(P, R, el);
  S.loads.NEd = Math.abs(NEd) > 5 ? r1(NEd) : 0;
  if (Math.abs(NEd) > 5) warn.push(`Siła podłużna z ramy N_Ed = ${r1(NEd)} kN (${NEd > 0 ? 'ściskanie' : 'rozciąganie'}) – przyjęta w module jako stała na długości belki.`);
  if (Math.abs(sch.O.s) > 0.02) warn.push(`Belka nachylona (${r1(sch.O.ang)}°) – BelkaŻB liczy belkę poziomą; obciążenia przyjęto prostopadle do osi.`);
  return { st: E.normalize(S), warn, sch };
};
// siła podłużna SGN (ściskanie dodatnie) o największej wartości bezwzględnej w ciągu
function axialULS(P, R, el) {
  if (!R || !R.env || !R.env.ULS) return 0;
  let best = 0;
  el.bars.forEach(id => { const ei = R.ctx.bIdx.get(id); if (ei === undefined) return; const e = R.env.ULS.bars[ei]; for (let i = 0; i < e.x.length; i++) { const c = -e.Nmin[i], t = -e.Nmax[i]; if (Math.abs(c) > Math.abs(best)) best = c; if (Math.abs(t) > Math.abs(best)) best = t; } });
  return best;
}

/* ---------------------------------------------------------------- ŻELBET – SłupŻB */
D.colSchema = function (P, R, el) {
  const O = D.order(P, el.bars); if (!O) return { err: 'Pręty elementu nie tworzą ciągłego, współliniowego ciągu.' };
  if (O.ang < 45 || O.ang > 135) { /* słup pochylony */ }
  const T = D.topo(P), excl = new Set(el.bars);
  const nb = O.nodes[0], nt = O.nodes[O.nodes.length - 1], s = M().sec(P, O.seq[0].bar.sec), p = SEC().props(s);
  const L = O.L, EIc = p.EI;
  // podatność końców (PN-EN 1992-1-1, 5.8.3.2(3)): k = (θ/M)·(EI/l)
  const endK = (n, end) => {
    const sp = T.sup.get(n), relC = end === 'b' ? (O.seq[0].rev ? O.seq[0].bar.rel[1] : O.seq[0].bar.rel[0]) : (O.seq[O.seq.length - 1].rev ? O.seq[O.seq.length - 1].bar.rel[0] : O.seq[O.seq.length - 1].bar.rel[1]);
    if (relC === 0) return { k: Infinity, why: 'przegub pręta' };
    if (sp && sp.ry) return { k: 0, why: 'utwierdzenie' };
    // pręty dochodzące – belki (bez słupów współliniowych: EC2 – zastąpienie EI/l sumą słupów, gdy słup sąsiedni wpływa na obrót)
    const rs = rotStiff(P, R, T, n, excl);
    let kr = (sp && sp.kr > 0 ? sp.kr : 0), colEI = EIc / L;
    rs.parts.forEach(q => { const b = M().bar(P, q.bar); if (M().roleOf(P, b) === 'col' && collinear(P, b, O.seq[0].bar)) { const g = M().barGeom(P, b), pp = SEC().props(M().sec(P, b.sec)); colEI += pp.EI / g.L; } else kr += q.k; });
    if (!(kr > 0)) return { k: Infinity, why: sp ? 'przegub' : 'brak prętów utwierdzających' };
    return { k: colEI / kr, why: 'pręty dochodzące' };
  };
  const kb = endK(nb, 'b'), kt = endK(nt, 'g');
  // przechyłowość: węzeł górny bez podpory poziomej i bez stężeń (prętów kratowych) w układzie
  const braced = P.bars.some(b => b.type === 'truss') || P.supports.some(sp => sp.node !== nb && (sp.ux || sp.kx > 0) && M().node(P, sp.node).z > M().node(P, nb).z + 1e-6);
  // podparcie na fundamencie (podpora zewnętrzna w węźle dolnym) i słup kondygnacji wyższej (ciągłość zbrojenia, podstawa)
  const found = T.sup.has(nb);
  const colAbove = (T.at.get(nt) || []).some(b => !excl.has(b.id) && b.type !== 'truss' && M().roleOf(P, b) === 'col' && collinear(P, b, O.seq[0].bar));
  return { O, L, kb, kt, braced, sec: s, props: p, nb, nt, found, colAbove };
};
const kClamp = k => (k === Infinity ? 100 : Math.max(0.1, Math.min(100, r3(k))));
MAP.ZB_col = function (P, R, el, prev) {
  const E = ENG().SZB, sch = D.colSchema(P, R, el); if (sch.err) return { err: sch.err };
  const S = prev ? E.normalize(clone(prev)) : E.normalize(E.defaultState());
  const warn = [], s = sch.sec;
  if (s.mat !== 'C') return { err: 'Przekrój elementu nie jest żelbetowy.' };
  S.meta.name = el.name; S.mat.concrete = s.cls; S.geom.L = r3(sch.L);
  if (s.shape === 'circ') { S.geom.shape = 'circ'; S.geom.D = +s.D; }
  else if (s.shape === 'ring') { S.geom.shape = 'ring'; S.geom.pipe = { D: +s.D, t: +s.t }; }
  else if (s.shape === 'T') { S.geom.shape = 'T'; S.geom.tee = { bf: +s.beff, hf: +s.hf, bw: +s.b, h: +s.h }; }
  else { S.geom.shape = 'rect'; S.geom.b = +s.b; S.geom.h = +s.h; }
  // płaszczyzna ramy = płaszczyzna „h” (M_y); prostopadła – ustawienia modułu
  S.buck.same = false;
  if (!prev) { S.buck.y.sch = sch.braced ? 'pp' : (sch.kt.k === Infinity ? 'cant' : 'ffs'); S.buck.y.mode = sch.braced || sch.kt.k !== Infinity ? 'k' : 'auto'; S.buck.z.sch = 'pp'; S.buck.z.mode = 'auto';
    S.det.base = sch.found ? 'found' : 'col'; S.det.top = sch.colAbove ? 'cont' : 'anch'; }
  S.buck.y.k1 = kClamp(sch.kb.k); S.buck.y.k2 = kClamp(sch.kt.k);
  // obciążenia: siły na końcach słupa z analizy (przypadki) – kompensacja schematu modułu (M w module = M z ramy w każdym punkcie)
  const items = [], schY = S.buck.y.sch;
  const own = (S.loads.items || []).filter(it => !it.rama);
  let swAny = false;
  P.cases.forEach(lc => {
    if (lc.sw && lc.cat === 'G') swAny = true;
    const F = colEndForces(R, sch.O, lc), Lq = colLateral(P, R, sch.O, lc);
    const N = -F.Nt;                                    // siła w głowicy (ściskanie +)
    if (Math.abs(N) < 1e-6 && Math.abs(F.Mt) < 1e-6 && Math.abs(F.Mb) < 1e-6 && !Lq.q) return;
    const kind = KIND[lc.cat] === 'acc' ? null : KIND[lc.cat];
    if (!kind) { warn.push(`Przypadek wyjątkowy ${lc.id} – SłupŻB nie ma obciążeń wyjątkowych w danych; pominięto.`); return; }
    // konwencja SłupŻB: M = EI·w″, kierunek +h przeciwny do +X przy M_mod = M_rama (sprawdzone testem: tests/design.test.js)
    const it = E.newItem(kind, { rama: true, name: `${lc.id} ${lc.name || ''}`.trim(), N: r2(N), qh: r3(-SZB_SGN * Lq.q), cat: lc.qcat || 'B', alt: lc.alt, pm: false, grp: lc.grp || '' });
    if (kind === 'other') Object.assign(it, psiOther(lc));
    const comp = compensate(E, it, S, sch.L);
    it.Myb = r3(SZB_SGN * F.Mb - comp.b); it.Myt = r3(SZB_SGN * F.Mt - comp.t);
    items.push(E.normItem(it));
  });
  S.loads.mode = 'cases'; S.loads.items = items.concat(own); S.loads.sw = swAny;
  S.loads.comb = P.settings.comb; S.loads.gG = +P.settings.gG; S.loads.gGinf = +P.settings.gGinf; S.loads.gQ = +P.settings.gQ; S.loads.xi = +P.settings.xi;
  return { st: E.normalize(S), warn, sch };
};
let SZB_SGN = 1;
// moment w module od obciążeń poprzecznych pozycji (bez momentów końcowych) na końcach – do kompensacji
function compensate(E, it, S, Lm) {
  const t = Object.assign({}, it, { Myt: 0, Myb: 0, Mzt: 0, Mzb: 0, N: 0 });
  const g = { L: Lm * 1000 };
  const d = E.itemDist(t, S, g);
  const n = d.y.M.length - 1;
  return { b: d.y.M[0] / 1e6, t: d.y.M[n] / 1e6 };
}
// obciążenie poprzeczne słupa (równomierne – średnia) w kierunku „h” (+ w prawo dla słupa dół→góra, tj. +X)
function colLateral(P, R, O, lc) {
  const L = M().caseFEM(P, R.ctx, lc); let tot = 0, warn = false;
  O.seq.forEach((q, k) => {
    const ei = R.ctx.bIdx.get(q.bar.id), g = L.el.find(e => e.el === ei); if (!g) return;
    g.loads.forEach(ld => { if (ld.t === 'q') { const len = ld.x2 - ld.x1; tot += (q.rev ? 1 : -1) * ((ld.py1 || 0) + (ld.py2 || 0)) / 2 * len; if (Math.abs((ld.py1 || 0) - (ld.py2 || 0)) > 1e-9 || len < M().barGeom(P, q.bar).L - 1e-6) warn = true; } else if (ld.t === 'P' && Math.abs(ld.py || 0) > 1e-9) warn = true; });
  });
  // −ȳ pręta dół→góra = strona z̄ = prawo; py > 0 – w lewo
  return { q: tot / O.L, approx: warn };
}

/* ================================================================ STAL – BelkaStal */
MAP.ST_beam = function (P, R, el, prev) {
  const B = ENG().BST, sch = D.beamSchema(P, R, el); if (sch.err) return { err: sch.err };
  const S = prev ? B.J.normalize(clone(prev)) : (() => { const d = B.J.defaultState(); d.obciazenia = []; d.etapy = [{ id: 'E1', nazwa: 'Eksploatacja', typ: 'eksploatacja', opis: '' }]; d.stezenia = []; d.stezenieCiagle = Object.assign(d.stezenieCiagle, { odEtapu: 0, odEtapuD: 0 }); d.ciezarWlasny.etap = 0; return B.J.normalize(d); })();
  const warn = [], s = sch.sec0;
  if (s.mat !== 'S') return { err: 'Przekrój elementu nie jest stalowy.' };
  const okTyp = ['walc', 'ceow', 'kat', 'rura', 'spaw'];
  if (!okTyp.includes(s.prof.typ)) warn.push(`Kształtownik ${SEC().label(s)} – BelkaStal obsługuje dwuteowniki, ceowniki, kątowniki, rury prostokątne i blachownice; przyjęto IPE 300.`);
  if (s.rot) warn.push('Profil obrócony (zginanie względem osi słabej) – BelkaStal liczy zginanie względem osi y–y.');
  S.meta.nazwa = el.name;
  S.przekroj = okTyp.includes(s.prof.typ) ? clone(s.prof) : { typ: 'walc', seria: 'IPE', nr: 300 };
  S.material.gatunek = s.cls; if (!(ENG().BST.M.STAL[s.cls] || {}).pod || !ENG().BST.M.STAL[s.cls].pod.includes(S.material.podgatunek)) S.material.podgatunek = ((ENG().BST.M.STAL[s.cls] || {}).pod || ['J2'])[0];
  S.geom.przesla = sch.spans.map(r3); S.geom.wspL = r3(sch.cantL); S.geom.wspP = r3(sch.cantR);
  if (!sch.spans.length) { S.geom.przesla = []; if (sch.sups[0].x > 1e-6) { S.geom.wspL = r3(sch.sups[0].x); S.geom.wspP = 0; } else { S.geom.wspP = r3(sch.O.L); S.geom.wspL = 0; } }
  const rotMode = (el.opt && el.opt.rot) || 'spring';
  S.podpory = sch.sups.map((sp, i) => {
    const pv = (prev && prev.podpory && prev.podpory[i]) || {};
    const fix = sp.fixed || rotMode === 'fix' || !sch.spans.length;
    const spring = !fix && rotMode === 'spring' && sp.kr > 0;
    const typ = fix ? 'utwierdzenie' : spring ? 'podatne' : 'przegub';
    return Object.assign({ ltb: fix ? 'pelne' : 'widelkowe', ss: sp.t || 100, c: 0, wezel: { typ: 'brak' } }, pv, { typ, kfi: spring ? Math.round(sp.kr) : '', przesuwna: i > 0 && !sp.ux });
  });
  if (sch.inner.some(q => q.hinge)) warn.push('Przeguby wewnątrz belki – BelkaStal liczy belkę ciągłą bez przegubów pośrednich.');
  const nE = S.etapy.length, own = (S.obciazenia || []).filter(o => !o.rama);
  const obc = []; let swAny = false; const lw = new Set();
  P.cases.forEach(lc => {
    if (lc.sw && lc.cat === 'G') swAny = true;
    const L = chainLoads(P, R, sch.O, lc, new Set(sch.sups.map(q => q.node)));
    L.warn.forEach(w => lw.add(w));
    if (!L.q.length && !L.P.length) return;
    const sklad = L.q.map(q => ({ typ: 'q', q0: r3(q.q1), q1: r3(q.q2), x0: r3(q.x1), x1: r3(q.x2), kier: 'z', wys: 'pas_g' })).concat(L.P.map(p => ({ typ: 'P', x: r3(p.x), P: r3(p.P), kier: 'z', wys: 'pas_g', ss: 100 })));
    const rodz = { G: 'G', Q: 'Q', S: 'S', W: 'W', T: 'T', E: 'Q', A: 'A' }[lc.cat];
    obc.push({ rama: true, id: lc.id, nazwa: lc.name || lc.id, rodzaj: rodz, kat: lc.cat === 'Q' ? 'Q-' + (lc.qcat || 'B') : undefined, etap: nE - 1, uklad: lc.cat === 'Q' ? 'szachownica' : 'staly', wyklucz: lc.grp || '', N: 0, sklad });
    if (lc.cat === 'E') warn.push(`Przypadek ${lc.id} (inne zmienne, ψ podane) – w BelkaStal przyjęto jako użytkowe kat. B.`);
  });
  lw.forEach(w => warn.push(`BelkaStal: pominięto ${w}.`));
  S.obciazenia = obc.concat(own);
  S.ciezarWlasny.auto = swAny;
  const NEd = axialULS(P, R, el); if (Math.abs(NEd) > 5) warn.push(`Siła podłużna z ramy w belce (SGN) ≈ ${r1(NEd)} kN – BelkaStal przyjmuje siłę podłużną w przypadkach; nie przekazano (sprawdź element w module słupa).`);
  return { st: B.J.normalize(S), warn, sch };
};

/* ---------------------------------------------------------------- STAL – SłupStal */
MAP.ST_col = function (P, R, el, prev) {
  const B = ENG().SST, sch = D.colSchema(P, R, el); if (sch.err) return { err: sch.err };
  const S = prev ? B.J.normalize(clone(prev)) : (() => { const d = B.J.defaultState(); d.obciazenia = []; d.stezenia = []; return B.J.normalize(d); })();
  const warn = [], s = sch.sec;
  if (s.mat !== 'S') return { err: 'Przekrój elementu nie jest stalowy.' };
  const okTyp = ['walc', 'spaw', 'rura', 'chs', 'dwuc'];
  if (!okTyp.includes(s.prof.typ)) warn.push(`Kształtownik ${SEC().label(s)} – SłupStal obsługuje dwuteowniki, rury i słupy z dwóch ceowników; przyjęto HEB 200.`);
  S.meta.nazwa = el.name; S.geom.H = r3(sch.L);
  S.przekroj = okTyp.includes(s.prof.typ) ? clone(s.prof) : { typ: 'walc', seria: 'HEB', nr: 200 };
  S.material.gatunek = s.cls;
  // płaszczyzna ramy = x–z (M_y); wycięty słup: podstawa utwierdzona, głowica swobodna – siły z ramy na końcu (statyka dokładna)
  S.podpory.dol.y = 'utw'; S.podpory.gora.y = 'swob'; S.schemat = 'wlasny';
  if (!prev) S.podstawa.aktywna = !!sch.found;              // podstawa (blacha, kotwy) – tylko słup na fundamencie
  S.analiza.metoda = 'I';                                   // I rząd + elementy wg 6.3 z L_cr z analizy wyboczeniowej ramy (5.2.2(8))
  const Lcr = colLcr(P, R, el, sch);
  S.analiza.nadp.LcrY = Lcr ? r3(Lcr) : ''; S.analiza.nadp.muY = '';
  if (!Lcr) warn.push('Brak długości wyboczeniowej z analizy stateczności ramy (słup nieściskany?) – moduł przyjmie L_cr z własnego schematu.');
  const own = (S.obciazenia || []).filter(o => !o.rama), obc = []; let swAny = false;
  P.cases.forEach(lc => {
    if (lc.sw && lc.cat === 'G') swAny = true;
    const F = colEndForces(R, sch.O, lc), Lq = colLateral(P, R, sch.O, lc);
    const N = -F.Nt, sklad = [];
    if (Math.abs(N) > 1e-6) sklad.push({ typ: 'N', x: '', F: r2(N), ey: 0, ez: 0 });
    // siła poprzeczna i moment w głowicy (wolne ciało: równowaga z ramą), obciążenie rozłożone na wysokości
    const Ht = colTopShear(F, Lq, sch.L);
    if (Math.abs(Ht) > 1e-6) sklad.push({ typ: 'H', x: '', kier: 'z', F: r3(SST_H * Ht), wys: 'srodek' });
    if (Math.abs(F.Mt) > 1e-6) sklad.push({ typ: 'M', x: '', os: 'y', M: r3(SST_M * F.Mt) });
    if (Math.abs(Lq.q) > 1e-9) sklad.push({ typ: 'q', kier: 'z', q0: r3(SST_H * Lq.q), q1: '', x0: '', x1: '', wys: 'srodek' });
    if (!sklad.length) return;
    const rodz = { G: 'G', Q: 'Q', S: 'S', W: 'W', T: 'T', E: 'Q', A: 'A' }[lc.cat];
    obc.push({ rama: true, id: lc.id, nazwa: lc.name || lc.id, rodzaj: rodz, kat: lc.cat === 'Q' ? 'Q-' + (lc.qcat || 'B') : undefined, wyklucz: lc.grp || '', aktywne: true, sklad });
  });
  S.obciazenia = obc.concat(own); S.ciezarWlasny.auto = swAny;
  return { st: B.J.normalize(S), warn, sch };
};
let SST_H = 1, SST_M = -1;   // konwencje SłupStal: moment w głowicy dodatni przeciwnie do M_rama (tests/design.test.js)
// siła poprzeczna w głowicy (działająca na słup, w kierunku +X) z równowagi: M_b = M_t + H·L + q·L²/2 (konwencja ramy)
function colTopShear(F, Lq, L) { return F.Vt; }   // siła węzła na głowicę w kierunku +X (ȳ słupa = −X): H = −F₂ȳ = V(L)
// długość wyboczeniowa w płaszczyźnie ramy z analizy wyboczeniowej (najmniejszy α_cr przy ściskaniu elementu)
function colLcr(P, R, el, sch) {
  if (!R || !R.buck) return null;
  let best = null;
  Object.values(R.buck).forEach(B => { if (!B || !B.Lcr) return; el.bars.forEach(id => { const ei = R.ctx.bIdx.get(id); const v = B.Lcr[ei]; if (v && B.Ncomp[ei] < -1e-3) { if (!best || B.alpha < best.alpha) best = { alpha: B.alpha, L: v }; } }); });
  return best ? best.L : null;
}

/* ================================================================ DREWNO – BelkaDR */
MAP.DR_beam = function (P, R, el, prev) {
  const E = ENG().BDR, sch = D.beamSchema(P, R, el); if (sch.err) return { err: sch.err };
  const S = prev ? E.normalize(clone(prev)) : (() => { const d = E.defaultState(); d.loads.perm = []; d.loads.var = []; d.loads.acc = []; return E.normalize(d); })();
  const warn = [], s = sch.sec0;
  if (s.mat !== 'D') return { err: 'Przekrój elementu nie jest drewniany.' };
  if (s.shape === 'round') warn.push('Przekrój okrągły – BelkaDR liczy przekroje prostokątne; przyjęto kwadrat o boku ⌀.');
  S.meta.name = el.name; S.mat.cls = E.MATS[s.cls] ? s.cls : 'C24';
  S.geom.b = +(s.shape === 'round' ? s.D : s.b); S.geom.h = +(s.shape === 'round' ? s.D : s.h); S.geom.n = Math.max(1, Math.round(+s.n || 1));
  const flip = sch.spans.length === 0 && sch.sups[0].x > 1e-6;
  S.geom.beta = r1(flip ? -sch.O.ang : sch.O.ang);
  if (!sch.spans.length) { S.scheme = 'cant'; S.geom.L = r3(sch.O.L); }
  else if (sch.spans.length === 1 && !sch.cantL && !sch.cantR) { S.scheme = 'ss'; S.geom.L = r3(sch.spans[0]); }
  else { S.scheme = 'cont'; S.cont.spans = sch.spans.map(r3); S.cont.cantL = r3(sch.cantL); S.cont.cantR = r3(sch.cantR); }
  const X = x => (flip ? sch.O.L - x : x);
  const rotMode = (el.opt && el.opt.rot) || 'spring';
  const supList = flip ? sch.sups.slice().reverse() : sch.sups;
  S.supCfg = supList.map((sp, i) => {
    const pv = (prev && prev.supCfg && prev.supCfg[i]) || {};
    const rigid = sp.fixed || rotMode === 'fix' || !sch.spans.length, spring = !rigid && rotMode === 'spring' && sp.kr > 0;
    return Object.assign({}, pv, { dof: { x: i === 0 || sp.ux, y: true, z: true, r: rigid || spring }, kv: '', kr: spring ? Math.round(sp.kr) : '', t: sp.t || pv.t || '' });
  });
  const segB = (() => { const b = []; let x = 0; if (S.scheme === 'cont') { if (S.cont.cantL > 0) { b.push([0, S.cont.cantL]); x = S.cont.cantL; } S.cont.spans.forEach(L => { b.push([x, x + L]); x += L; }); if (S.cont.cantR > 0) b.push([x, x + S.cont.cantR]); } else b.push([0, S.geom.L]); return b; })();
  S.nodes = sch.inner.map(q => { const x = X(q.x), si = segB.findIndex(b => x > b[0] + 1e-6 && x < b[1] - 1e-6); return si < 0 ? null : { seg: si, a: r3(x - segB[si][0]), hinge: q.hinge }; }).filter(Boolean);
  const own = k => (S.loads[k] || []).filter(it => !it.rama);
  const perm = [], vr = [], acc = []; let swAny = false; const lw = new Set();
  P.cases.forEach(lc => {
    if (lc.sw && lc.cat === 'G') swAny = true;
    const L = chainLoads(P, R, sch.O, lc, new Set(sch.sups.map(q => q.node)));
    L.warn.forEach(w => lw.add(w));
    if (!L.q.length && !L.P.length) return;
    const segs = L.q.map(q => flip ? { x1: sch.O.L - q.x2, x2: sch.O.L - q.x1, q1: q.q2, q2: q.q1 } : q).sort((a, b) => a.x1 - b.x1);
    const pts = L.P.map(p => ({ P: r3(p.P), T: 0, a: r3(X(p.x)), ref: 'L' }));
    const base = { rama: true, name: `${lc.id} ${lc.name || ''}`.trim(), dir: 'y', proj: 'len', span: 0, link: lc.id };
    const kind = KIND[lc.cat];
    const dur = lc.dur && DUR_DR[lc.dur] ? lc.dur : '';
    const items = (segs.length ? segs : [null]).map((q, j) => Object.assign({}, base, q ? { q: r3(q.q1), q2: Math.abs(q.q2 - q.q1) > 1e-9 ? r3(q.q2) : '', x1: q.x1 > 1e-6 ? r3(q.x1) : '', x2: q.x2 < sch.O.L - 1e-6 ? r3(q.x2) : '' } : { q: 0 }, { pts: j === 0 ? pts : [] }));
    items.forEach(it => {
      if (lc.cat === 'G') perm.push(E.normItem(Object.assign(it, { kind: 'perm' }), 'perm'));
      else if (lc.cat === 'A') acc.push(E.normItem(Object.assign(it, { kind: 'acc' }), 'acc'));
      else { Object.assign(it, { kind, cat: lc.qcat || 'B', alt: lc.alt, grp: lc.grp || '', dur }, kind === 'other' ? psiOther(lc) : {}); vr.push(E.normItem(it, kind)); }
    });
  });
  lw.forEach(w => warn.push(`BelkaDR: pominięto ${w}.`));
  S.loads.perm = perm.concat(own('perm')); S.loads.var = vr.concat(own('var')); S.loads.acc = acc.concat(own('acc'));
  S.loads.sw = swAny; S.loads.comb = P.settings.comb; S.loads.gG = +P.settings.gG; S.loads.gGi = +P.settings.gGinf; S.loads.gQ = +P.settings.gQ; S.loads.xi = +P.settings.xi; S.loads.accPsi = P.settings.accPsi;
  return { st: E.normalize(S), warn, sch };
};

/* ---------------------------------------------------------------- DREWNO – SłupDrewniany */
MAP.DR_col = function (P, R, el, prev) {
  const E = ENG().SDR, sch = D.colSchema(P, R, el); if (sch.err) return { err: sch.err };
  const S = prev ? E.normalize(clone(prev)) : (() => { const d = E.defaultState(); d.loads.items = []; return E.normalize(d); })();
  const warn = [], s = sch.sec;
  if (s.mat !== 'D') return { err: 'Przekrój elementu nie jest drewniany.' };
  S.meta.name = el.name; S.geom.L = r3(sch.L);
  if (!E.MATS[s.cls]) warn.push(`Klasa ${s.cls} niedostępna w module SłupDrewniany – przyjęto C24.`);
  S.mat.cls = E.MATS[s.cls] ? s.cls : 'C24';
  if (s.shape === 'round') { S.geom.type = 'round'; S.geom.d = +s.D; }
  else { S.geom.type = 'rect'; S.geom.b = +s.b * Math.max(1, Math.round(+s.n || 1)); S.geom.h = +s.h; if ((+s.n || 1) > 1) warn.push('Przekrój wieloczęściowy – w SłupDrewniany przyjęto przekrój pełny o szerokości n·b.'); }
  // płaszczyzna ramy = x–z (wymiar h, M_y); wycięty słup: utwierdzenie u dołu, głowica swobodna – siły z ramy w głowicy
  S.supp.z.base = 'fix'; S.supp.z.top = 'free';
  const Lcr = colLcr(P, R, el, sch);
  S.buck.lefY = Lcr ? r3(Lcr) : ''; if (!Lcr) warn.push('Brak długości wyboczeniowej z analizy stateczności ramy – moduł przyjmie l_ef z własnego schematu.');
  const own = (S.loads.items || []).filter(it => !it.rama), items = []; let swAny = false;
  P.cases.forEach(lc => {
    if (lc.sw && lc.cat === 'G') swAny = true;
    const F = colEndForces(R, sch.O, lc), Lq = colLateral(P, R, sch.O, lc);
    const N = -F.Nt, Ht = colTopShear(F, Lq, sch.L);
    if (Math.abs(N) < 1e-6 && Math.abs(Ht) < 1e-6 && Math.abs(F.Mt) < 1e-6 && Math.abs(Lq.q) < 1e-9) return;
    const kind = KIND[lc.cat];
    const it = { rama: true, kind, name: `${lc.id} ${lc.name || ''}`.trim(), N: r2(N), Hz: r3(SDR_H * Ht), My: r3(SDR_M * F.Mt), qz: r3(SDR_H * Lq.q), cat: lc.qcat || 'B', alt: lc.alt, grp: lc.grp || '', rev: false, dur: lc.dur || '' };
    if (kind === 'other') Object.assign(it, psiOther(lc));
    items.push(E.normItem(it));
  });
  S.loads.items = items.concat(own); S.loads.sw = swAny;
  S.loads.comb = P.settings.comb; S.loads.gG = +P.settings.gG; S.loads.gGinf = +P.settings.gGinf; S.loads.gQ = +P.settings.gQ; S.loads.xi = +P.settings.xi; S.loads.accPsi = P.settings.accPsi;
  return { st: E.normalize(S), warn, sch };
};
let SDR_H = 1, SDR_M = -1;   // konwencje SłupDrewniany – jak SłupStal
D._sign = { set: (k, v) => { if (k === 'SZB') SZB_SGN = v; if (k === 'SST_H') SST_H = v; if (k === 'SST_M') SST_M = v; if (k === 'SDR_H') SDR_H = v; if (k === 'SDR_M') SDR_M = v; } };

/* ------------------------------------------------------------ model → moduł */
D.toModule = function (P, R, el) {
  if (!R || !R.ok) return { err: 'Brak wyników analizy modelu.' };
  const fn = MAP[el.mod + '_' + el.kind]; if (!fn) return { err: 'Nieznany moduł.' };
  let out;
  try { out = fn(P, R, el, el.st); } catch (e) { console.error(e); return { err: 'Błąd przenoszenia danych: ' + e.message }; }
  return out;
};
D.app = el => D.MODS[el.mod][el.kind].app;
D.engKey = el => D.MODS[el.mod][el.kind].eng;

/* ------------------------------------------------------------ moduł → model */
// przekrój i materiał z danych modułu (obiekt przekroju RAMA2D lub null, gdy bez zmian)
D.sectionFromModule = function (P, el, st) {
  const cur = M().sec(P, M().bar(P, el.bars[0]).sec); if (!cur) return null;
  const s = clone(cur); delete s.id; delete s.name;
  if (el.mod === 'ZB' && el.kind === 'beam') {
    s.mat = 'C'; s.cls = st.mat.concrete;
    if (st.geom.type === 'T') Object.assign(s, { shape: 'T', b: +st.geom.b, h: +st.geom.h, beff: +st.geom.beff, hf: +st.geom.hf });
    else if (cur.shape === 'circ' || cur.shape === 'ring') { /* bez zmian kształtu */ }
    else Object.assign(s, { shape: 'rect', b: +st.geom.b, h: +st.geom.h });
  } else if (el.mod === 'ZB') {
    s.mat = 'C'; s.cls = st.mat.concrete; const g = st.geom;
    if (g.shape === 'circ') Object.assign(s, { shape: 'circ', D: +g.D });
    else if (g.shape === 'ring') Object.assign(s, { shape: 'ring', D: +g.pipe.D, t: +g.pipe.t });
    else if (g.shape === 'T') Object.assign(s, { shape: 'T', beff: +g.tee.bf, hf: +g.tee.hf, b: +g.tee.bw, h: +g.tee.h });
    else if (g.shape === 'rect') Object.assign(s, { shape: 'rect', b: +g.b, h: +g.h });
  } else if (el.mod === 'ST') {
    s.mat = 'S'; s.cls = st.material.gatunek; s.prof = clone(st.przekroj); delete s.prof.Hcol;
  } else if (el.mod === 'DR') {
    s.mat = 'D'; s.cls = el.kind === 'beam' ? st.mat.cls : st.mat.cls;
    if (el.kind === 'beam') Object.assign(s, { shape: 'rect', b: +st.geom.b, h: +st.geom.h, n: +st.geom.n || 1 });
    else if (st.geom.type === 'round') Object.assign(s, { shape: 'round', D: +st.geom.d });
    else if (st.geom.type === 'rect') Object.assign(s, { shape: 'rect', b: +st.geom.b, h: +st.geom.h, n: 1 });
  }
  if (secKey(s) === secKey(cur)) return null;
  return s;
};
// zastosowanie przekroju z modułu w modelu: gdy przekrój jest współdzielony z prętami spoza elementu – nowy przekrój
D.applySection = function (P, el, s) {
  const bars = el.bars.map(id => M().bar(P, id)).filter(Boolean);
  const ids = new Set(bars.map(b => b.sec));
  const shared = P.bars.some(b => ids.has(b.sec) && !el.bars.includes(b.id));
  if (!shared && ids.size === 1) { const cur = M().sec(P, bars[0].sec); Object.assign(cur, s, { id: cur.id, name: cur.name }); return cur; }
  const ns = Object.assign({}, s, { id: 's' + (P.seq.sec++), name: el.name });
  P.sections.push(ns); bars.forEach(b => { b.sec = ns.id; });
  return ns;
};
const secKey = o => JSON.stringify(['mat', 'cls', 'shape', 'b', 'h', 'beff', 'hf', 'D', 't', 'n', 'rot', 'kEI', 'prof'].map(k => k === 'prof' ? (o.prof ? JSON.stringify(Object.keys(o.prof).filter(q => q !== 'Hcol').sort().map(q => [q, String(o.prof[q])])) : '') : (o[k] === undefined || o[k] === '' ? '' : String(o[k]))));
D.secKey = secKey;
// przekroje docelowe prętów elementu wg danych modułu (BelkaŻB / BelkaDR – wymiary osobno w przęsłach)
D.targetSections = function (P, el, st) {
  const base = D.sectionFromModule(P, el, st) || (() => { const c = clone(M().sec(P, M().bar(P, el.bars[0]).sec)); delete c.id; delete c.name; return c; })();
  const out = el.bars.map(() => base);
  const sch = el.sch;
  const perSpan = el.kind === 'beam' && sch && sch.O && st.scheme === 'cont' && (el.mod === 'ZB' ? st.cont && Array.isArray(st.cont.geoSpans) : st.segGeo && Object.keys(st.segGeo).length);
  if (!perSpan) return out;
  // granice odcinków modułu (wsporniki, przęsła) w układzie ciągu
  const C = st.cont, bnd = []; let x = 0;
  if (+C.cantL > 0) { bnd.push({ x0: 0, x1: +C.cantL, span: null, seg: 0 }); x = +C.cantL; }
  C.spans.forEach((L, i) => { bnd.push({ x0: x, x1: x + +L, span: i, seg: bnd.length }); x += +L; });
  if (+C.cantR > 0) bnd.push({ x0: x, x1: x + +C.cantR, span: null, seg: bnd.length });
  el.bars.forEach((id, k) => {
    const q = sch.O.seq.find(s => s.bar.id === id); if (!q) return;
    const i = sch.O.seq.indexOf(q), xm = (sch.O.xs[i] + sch.O.xs[i + 1]) / 2;
    const sg = bnd.find(b => xm >= b.x0 - 1e-6 && xm <= b.x1 + 1e-6); if (!sg) return;
    let b = '', h = '';
    if (el.mod === 'ZB' && sg.span !== null) { const g = C.geoSpans[sg.span] || {}; b = g.b; h = g.h; }
    if (el.mod === 'DR') { const g = st.segGeo[sg.seg] || {}; b = g.b; h = g.h; }
    if ((+b > 0 || +h > 0) && base.shape !== 'T' && base.shape !== 'circ' && base.shape !== 'ring') out[k] = Object.assign({}, base, { b: +b > 0 ? +b : base.b, h: +h > 0 ? +h : base.h });
  });
  return out;
};
// zastosowanie przekrojów z modułu w modelu; zwraca opis zmian lub null
D.applyModuleSections = function (P, el, st) {
  const tgt = D.targetSections(P, el, st), bars = el.bars.map(id => M().bar(P, id));
  const changed = bars.map((b, k) => b && secKey(M().sec(P, b.sec) || {}) !== secKey(tgt[k]));
  if (!changed.some(Boolean)) return null;
  const groups = new Map(); bars.forEach((b, k) => { if (!b || !changed[k]) return; const key = secKey(tgt[k]); if (!groups.has(key)) groups.set(key, { s: tgt[k], bars: [] }); groups.get(key).bars.push(b); });
  const labels = [];
  groups.forEach(({ s, bars: bs }) => {
    const curIds = new Set(bs.map(b => b.sec));
    // przekrój używany wyłącznie przez te pręty – zmiana w miejscu (zachowuje nazwę)
    if (curIds.size === 1) { const cid = [...curIds][0], users = P.bars.filter(b => b.sec === cid); if (users.every(u => bs.includes(u))) { const cur = M().sec(P, cid); Object.assign(cur, clone(s), { id: cur.id, name: cur.name, kEI: cur.kEI }); labels.push(SEC().fullLabel(cur)); return; } }
    // istniejący przekrój o tych samych parametrach albo nowy
    let ex = P.sections.find(q => secKey(q) === secKey(Object.assign({}, s, { kEI: q.kEI })));
    if (!ex) { ex = Object.assign(clone(s), { id: 's' + (P.seq.sec++), name: el.name }); P.sections.push(ex); }
    bs.forEach(b => { b.sec = ex.id; }); labels.push(SEC().fullLabel(ex));
  });
  return labels.join(', ');
};
// nazwa elementu z modułu
D.nameFromModule = (el, st) => (el.mod === 'ST' ? st.meta.nazwa : st.meta.name) || el.name;

/* ------------------------------------------------------------ geometria z modułu → model */
// zmiana rozpiętości przęseł / wsporników belki albo wysokości słupu w module: węzły modelu przesuwane wzdłuż osi elementu
// (odcinkami liniowo – cała część układu za zmienionym przęsłem przesuwa się, ramy pozostają regularne)
function moduleSpans(el, st) {
  if (el.kind === 'col') return { L: el.mod === 'ST' ? +st.geom.H : +st.geom.L };
  if (el.mod === 'ST') return { spans: (st.geom.przesla || []).map(Number), cL: +st.geom.wspL || 0, cR: +st.geom.wspP || 0 };
  if (st.scheme === 'cont') return { spans: st.cont.spans.map(Number), cL: +st.cont.cantL || 0, cR: +st.cont.cantR || 0 };
  if (st.scheme === 'ss') return { spans: [+st.geom.L], cL: 0, cR: 0 };
  return { cant: +st.geom.L };
}
D.geometryFromModule = function (P, R, el, st) {
  const sch = el.sch; if (!sch || !sch.O) return false;
  const O = sch.O, ms = moduleSpans(el, st), tol = 1e-4;
  let oldB, newB;
  if (el.kind === 'col') { if (!(ms.L > 0) || Math.abs(ms.L - sch.L) < tol) return false; oldB = [0, sch.L]; newB = [0, ms.L]; }
  else {
    const n = sch.sups.length;
    if (ms.cant !== undefined) { if (sch.spans.length) return false; const flip = sch.sups[0].x > 1e-6; if (Math.abs(ms.cant - O.L) < tol) return false; if (flip) return false; oldB = [0, O.L]; newB = [0, ms.cant]; }
    else {
      if (!ms.spans || ms.spans.length !== sch.spans.length) return false;
      const same = ms.spans.every((v, i) => Math.abs(v - sch.spans[i]) < tol) && Math.abs(ms.cL - sch.cantL) < tol && Math.abs(ms.cR - sch.cantR) < tol;
      if (same || !ms.spans.every(v => v > 0.05)) return false;
      oldB = [0].concat(sch.sups.map(q => q.x), [O.L]); newB = [0];
      let x = ms.cL; newB.push(x); ms.spans.forEach(v => { x += v; newB.push(x); }); newB.push(x + ms.cR);
      if (n !== ms.spans.length + 1) return false;
    }
  }
  const N0 = M().node(P, O.nodes[0]), t = [O.c, O.s];
  const map = s => { if (s <= oldB[0]) return s; for (let i = 0; i < oldB.length - 1; i++) { const a = oldB[i], b = oldB[i + 1]; if (s <= b + 1e-9) return b - a > 1e-9 ? newB[i] + (s - a) * (newB[i + 1] - newB[i]) / (b - a) : newB[i]; } return s + newB[newB.length - 1] - oldB[oldB.length - 1]; };
  P.nodes.forEach(nd => { const s = (nd.x - N0.x) * t[0] + (nd.z - N0.z) * t[1]; const d = map(s) - s; if (Math.abs(d) > 1e-12) { nd.x = Math.round((nd.x + d * t[0]) * 1e6) / 1e6; nd.z = Math.round((nd.z + d * t[1]) * 1e6) / 1e6; } });
  return true;
};

/* ------------------------------------------------------------ kontrola wytężenia silnikiem modułu */
D.check = function (el) {
  if (!el.st) return null;
  const E = ENG()[D.engKey(el)];
  let r;
  try { r = el.mod === 'ST' ? E.J.run(el.st) : E.calc(el.st); } catch (e) { return { err: e.message, eta: null, ok: false }; }
  const errs = (r.errors || []).length;
  // wytężenie: podsumowanie liczone przez moduł (jak w jego pasku stanu), w razie braku – maksimum ze sprawdzeń (bez informacyjnych)
  const sumEta = [r.maxUtil, r.uMax, r.maxEta].find(v => typeof v === 'number' && isFinite(v));
  let eta = 0, worst = null, wu = -1, fails = 0;
  (r.checks || []).forEach(c => {
    const u = c.util !== undefined ? c.util : c.ratio !== undefined ? c.ratio : c.b && c.b.r !== undefined ? c.b.r : c.eta;
    const st = c.status || (c.ok === false ? 'fail' : c.ok === true ? 'ok' : '');
    if (c.info === true || st === 'info' || st === 'skip') return;
    if (typeof u === 'number' && isFinite(u) && u > wu) { wu = u; worst = c; }
    if (st === 'fail' || c.ok === false || c.pass === false) fails++;
  });
  eta = sumEta !== undefined ? sumEta : Math.max(0, wu);
  if (typeof r.nFail === 'number') fails = r.nFail; else if (typeof r.fails === 'number') fails = r.fails;
  const ok = !errs && !fails && r.ok !== false && eta <= 1 + 1e-9;
  return { eta, worst: worst ? (worst.name || worst.n || worst.nazwa || worst.opis || worst.id || '') : '', fails, errors: r.errors || [], ok, n: (r.checks || []).length };
};

root.RDES = D;
D._MAP = MAP;
if (typeof module !== 'undefined' && module.exports) module.exports = D;
})(typeof window !== 'undefined' ? window : globalThis);
