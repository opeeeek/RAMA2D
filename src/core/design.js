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
     schemat (rozpiętości, liczba przęseł, wsporniki), podpory (rodzaj,
     podatność), przeguby i węzły, obciążenia (zmienione, usunięte, nowe),
     warunki podparcia słupów, ustawienia kombinacji – przenoszone są
     różnice względem stanu, który moduł miał poprzednio,
   • kontrola wytężenia elementów silnikami modułów (bez otwierania modułu).
   Dane sterowane z modelu są w module odświeżane przy każdej zmianie
   modelu; pozostałe ustawienia modułu (zbrojenie, ekspozycja, stężenia,
   połączenia itd.) należą do modułu i są zachowywane.
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
    if (along < 0.2) return false;                                    // pręt prawie równoległy do ciągu
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
    const kv = sp && !sp.uz && sp.kz > 0 ? sp.kz : 0;      // podpora sprężysta (prostopadle do osi – dla belek poziomych)
    sups.push({ node: n, k, x: O.xs[k], fixed, kr, krParts: rs.parts, hinge, t, ext: !!sp, ux: !!(sp && sp.ux) || rs.parts.length > 0, kv });
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
    return { dof: { x: i === 0 || sp.ux, y: true, z: true, r }, kv: sp.kv > 0 ? Math.round(sp.kv) : '', kr: spring ? Math.round(sp.kr) : '', t: sp.t || prevC.t || '', hinge: sp.hinge && !(i === 0 || i === supList.length - 1), direct: prevC.direct !== false };
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
  const lw = new Set(), nodePts = {};
  let swAny = false;
  P.cases.forEach(lc => {
    if (lc.sw && lc.cat === 'G') swAny = true;
    const L = chainLoads(P, R, sch.O, lc, new Set(sch.sups.map(s => s.node)));
    L.warn.forEach(w => lw.add(w));
    if (!L.q.length && !L.P.length) return;
    nodePts[lc.id] = L.P.filter(p => p.node).map(p => ({ x: r3(X(p.x)), P: r3(p.P) }));
    // profil q(x) – jedna pozycja na przypadek (punkty x : q, skoki – dwa punkty w tym samym x)
    const segs = L.q.map(s => flip ? { x1: sch.O.L - s.x2, x2: sch.O.L - s.x1, q1: s.q2, q2: s.q1 } : s).sort((a, b) => a.x1 - b.x1);
    const pts = []; segs.forEach(s => { pts.push([r3(s.x1), r3(s.q1)]); pts.push([r3(s.x2), r3(s.q2)]); });
    const overl = segs.some((s, i) => i && s.x1 < segs[i - 1].x2 - 1e-6);
    const it = { rama: true, rcase: lc.id, name: `${lc.id} ${lc.name || ''}`.trim(), span: 0, el: '', dir: 'y', x1: '', x2: '', pts: L.P.map(p => ({ P: r3(p.P), Pz: 0, T: 0, a: r3(X(p.x)), ref: 'L' })) };
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
  return { st: E.normalize(S), warn, sch, flip, nodePts };
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
  // schemat w płaszczyźnie ramy wynikający z modelu (podstawa, głowica, usztywnienie) – nadpisywany, gdy zmieni się w modelu;
  // zmiana schematu w module wraca do modelu (D.colFromModule)
  const bF = sch.kb.k !== Infinity, tF = sch.kt.k !== Infinity;
  const der = sch.braced ? (bF ? (tF ? 'ff' : 'fp') : 'pp') : (bF && tF ? 'ffs' : 'cant');
  if (!prev || el.colSchD !== der) { S.buck.y.sch = der; S.buck.y.mode = sch.braced || tF ? 'k' : 'auto'; }
  if (!prev) { S.buck.z.sch = 'pp'; S.buck.z.mode = 'auto'; S.det.base = sch.found ? 'found' : 'col'; S.det.top = sch.colAbove ? 'cont' : 'anch'; }
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
  return { st: E.normalize(S), warn, sch, colSchD: der };
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
    const typ = sp.kv > 0 ? 'sprezyna' : fix ? 'utwierdzenie' : spring ? 'podatne' : 'przegub';
    return Object.assign({ ltb: fix ? 'pelne' : 'widelkowe', ss: sp.t || 100, c: 0, wezel: { typ: 'brak' } }, pv, { typ, kz: sp.kv > 0 ? r3(sp.kv / 1000) : '', kfi: spring || (sp.kv > 0 && fix) ? Math.round(fix ? 1e9 : sp.kr) : '', przesuwna: i > 0 && !sp.ux && typ === 'przegub' });
  });
  if (sch.inner.some(q => q.hinge)) warn.push('Przeguby wewnątrz belki – BelkaStal liczy belkę ciągłą bez przegubów pośrednich.');
  const nE = S.etapy.length, own = (S.obciazenia || []).filter(o => !o.rama);
  const obc = []; let swAny = false; const lw = new Set(), nodePts = {};
  P.cases.forEach(lc => {
    if (lc.sw && lc.cat === 'G') swAny = true;
    const L = chainLoads(P, R, sch.O, lc, new Set(sch.sups.map(q => q.node)));
    L.warn.forEach(w => lw.add(w));
    if (!L.q.length && !L.P.length) return;
    nodePts[lc.id] = L.P.filter(p => p.node).map(p => ({ x: r3(p.x), P: r3(p.P) }));
    const sklad = L.q.map(q => ({ typ: 'q', q0: r3(q.q1), q1: r3(q.q2), x0: r3(q.x1), x1: r3(q.x2), kier: 'z', wys: 'pas_g' })).concat(L.P.map(p => ({ typ: 'P', x: r3(p.x), P: r3(p.P), kier: 'z', wys: 'pas_g', ss: 100 })));
    const rodz = { G: 'G', Q: 'Q', S: 'S', W: 'W', T: 'T', E: 'Q', A: 'A' }[lc.cat];
    obc.push({ rama: true, id: lc.id, nazwa: lc.name || lc.id, rodzaj: rodz, kat: lc.cat === 'Q' ? 'Q-' + (lc.qcat || 'B') : undefined, etap: nE - 1, uklad: lc.cat === 'Q' ? 'szachownica' : 'staly', wyklucz: lc.grp || '', N: 0, sklad });
    if (lc.cat === 'E') warn.push(`Przypadek ${lc.id} (inne zmienne, ψ podane) – w BelkaStal przyjęto jako użytkowe kat. B.`);
  });
  lw.forEach(w => warn.push(`BelkaStal: pominięto ${w}.`));
  S.obciazenia = obc.concat(own);
  S.ciezarWlasny.auto = swAny;
  const NEd = axialULS(P, R, el); if (Math.abs(NEd) > 5) warn.push(`Siła podłużna z ramy w belce (SGN) ≈ ${r1(NEd)} kN – BelkaStal przyjmuje siłę podłużną w przypadkach; nie przekazano (sprawdź element w module słupa).`);
  return { st: B.J.normalize(S), warn, sch, nodePts };
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
  // płaszczyzna ramy = x–z (M_y); słup wycięty z ramy: podstawa jak w modelu (utwierdzenie / przegub / sprężyna), głowica swobodna
  // z siłami z ramy (N, H, M) albo – przy podstawie przegubowej lub głowicy podpartej poziomo w modelu – przegubowa nieprzesuwna (N, M)
  const bc = colBC(P, sch), topPin = bc.base === 'pin' || bc.topR;
  S.podpory.dol.y = bc.base === 'fix' ? 'utw' : bc.base === 'spr' ? 'spr' : 'prz'; S.podpory.dol.kry = bc.base === 'spr' ? Math.round(bc.kb) : '';
  S.podpory.gora.y = topPin ? 'prz' : 'swob'; S.schemat = 'wlasny';
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
    if (Math.abs(Ht) > 1e-6 && !topPin) sklad.push({ typ: 'H', x: '', kier: 'z', F: r3(SST_H * Ht), wys: 'srodek' });
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

// warunki podparcia słupa w modelu: podstawa (fix – utwierdzenie, pin – przegub, spr – sprężyna k_b), głowica podparta poziomo (topR)
function colBC(P, sch) {
  const T = D.topo(P), sb = T.sup.get(sch.nb), stp = T.sup.get(sch.nt);
  const q0 = sch.O.seq[0], relB = q0.rev ? q0.bar.rel[1] : q0.bar.rel[0];
  let base = 'fix', kb = 0;
  if (relB === 0) base = 'pin';
  else if (sb) {
    const kS = sb.ry ? Infinity : sb.kr > 0 ? sb.kr : 0, kR = relB > 0 ? relB : Infinity;
    const k = kS === Infinity && kR === Infinity ? Infinity : kS > 0 ? 1 / (1 / kS + 1 / kR) : 0;
    base = k === Infinity ? 'fix' : k > 0 ? 'spr' : 'pin'; kb = base === 'spr' ? k : 0;
  }
  // słup oparty na pręcie (bez podpory zewnętrznej) – wolne ciało z utwierdzeniem: siły z ramy w głowicy, statyka dokładna
  return { base, kb, topR: !!(stp && (stp.ux || stp.kx > 0)), found: !!sb };
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
    return Object.assign({}, pv, { dof: { x: i === 0 || sp.ux, y: true, z: true, r: rigid || spring }, kv: sp.kv > 0 ? r3(sp.kv / 1000) : '', kr: spring ? Math.round(sp.kr) : '', t: sp.t || pv.t || '' });
  });
  const segB = (() => { const b = []; let x = 0; if (S.scheme === 'cont') { if (S.cont.cantL > 0) { b.push([0, S.cont.cantL]); x = S.cont.cantL; } S.cont.spans.forEach(L => { b.push([x, x + L]); x += L; }); if (S.cont.cantR > 0) b.push([x, x + S.cont.cantR]); } else b.push([0, S.geom.L]); return b; })();
  S.nodes = sch.inner.map(q => { const x = X(q.x), si = segB.findIndex(b => x > b[0] + 1e-6 && x < b[1] - 1e-6); return si < 0 ? null : { seg: si, a: r3(x - segB[si][0]), hinge: q.hinge }; }).filter(Boolean);
  const own = k => (S.loads[k] || []).filter(it => !it.rama);
  const perm = [], vr = [], acc = []; let swAny = false; const lw = new Set(), nodePts = {};
  P.cases.forEach(lc => {
    if (lc.sw && lc.cat === 'G') swAny = true;
    const L = chainLoads(P, R, sch.O, lc, new Set(sch.sups.map(q => q.node)));
    L.warn.forEach(w => lw.add(w));
    if (!L.q.length && !L.P.length) return;
    const segs = L.q.map(q => flip ? { x1: sch.O.L - q.x2, x2: sch.O.L - q.x1, q1: q.q2, q2: q.q1 } : q).sort((a, b) => a.x1 - b.x1);
    const pts = L.P.map(p => ({ P: r3(p.P), T: 0, a: r3(X(p.x)), ref: 'L' }));
    nodePts[lc.id] = L.P.filter(p => p.node).map(p => ({ x: r3(X(p.x)), P: r3(p.P) }));
    const base = { rama: true, rcase: lc.id, name: `${lc.id} ${lc.name || ''}`.trim(), dir: 'y', proj: 'len', span: 0, link: lc.id };
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
  return { st: E.normalize(S), warn, sch, flip, nodePts };
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
  const bc = colBC(P, sch), topPin = bc.base === 'pin' || bc.topR;
  S.supp.z.base = bc.base === 'pin' ? 'pin' : 'fix'; S.supp.z.kb = bc.base === 'spr' ? Math.round(bc.kb) : ''; S.supp.z.top = topPin ? 'pin' : 'free';
  const Lcr = colLcr(P, R, el, sch);
  S.buck.lefY = Lcr ? r3(Lcr) : ''; if (!Lcr) warn.push('Brak długości wyboczeniowej z analizy stateczności ramy – moduł przyjmie l_ef z własnego schematu.');
  const own = (S.loads.items || []).filter(it => !it.rama), items = []; let swAny = false;
  P.cases.forEach(lc => {
    if (lc.sw && lc.cat === 'G') swAny = true;
    const F = colEndForces(R, sch.O, lc), Lq = colLateral(P, R, sch.O, lc);
    const N = -F.Nt, Ht = colTopShear(F, Lq, sch.L);
    if (Math.abs(N) < 1e-6 && Math.abs(Ht) < 1e-6 && Math.abs(F.Mt) < 1e-6 && Math.abs(Lq.q) < 1e-9) return;
    const kind = KIND[lc.cat];
    const it = { rama: true, kind, name: `${lc.id} ${lc.name || ''}`.trim(), N: r2(N), Hz: topPin ? 0 : r3(SDR_H * Ht), My: r3(SDR_M * F.Mt), qz: r3(SDR_H * Lq.q), cat: lc.qcat || 'B', alt: lc.alt, grp: lc.grp || '', rev: false, dur: lc.dur || '' };
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
  const key = el.mod + '_' + el.kind, prev = el.st && (!el.stMod || el.stMod === key) ? el.st : null;   // dane innego modułu (zmiana materiału) – od nowa
  try { out = fn(P, R, el, prev); } catch (e) { console.error(e); return { err: 'Błąd przenoszenia danych: ' + e.message }; }
  if (!out.err && el.kind === 'beam') out.frameG = D.frameGMoments(P, R, { sch: out.sch }, !!out.flip);
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

/* ================================================================ moduł → model: schemat, podpory, przeguby, obciążenia
   Zmiany wprowadzone w module porównywane są ze stanem, który moduł miał poprzednio (dane bazowe), i tylko różnice
   przenoszone są do modelu: rozpiętości, liczba przęseł, wsporniki, rodzaj i podatność podpór, przeguby, węzły,
   obciążenia (zmienione, usunięte i nowe – nowe trafiają do przypadków modelu), ustawienia kombinacji, warunki
   podparcia słupów. Czego nie da się przenieść (np. podpora będąca prętem modelu) – komunikat, model bez zmian. */
const TOLX = 2e-3;                          // tolerancja położeń [m]
const r4 = v => Math.round(v * 1e4) / 1e4;
const SUPL = j => String.fromCharCode(65 + j);
// opis schematu belki w danych modułu: podpory i węzły pośrednie (x od lewego końca belki w module [m])
function beamDesc(el, st) {
  try {
    if (el.mod === 'ZB') {
      const E = ENG().BZB, md = E.beamModel(E.normalize(clone(st)));
      return { L: r3(md.Ltot / 1000), sups: md.sups.map(p => ({ x: r3(p.x / 1000), fx: !!p.fx, fy: !!p.fy, kv: p.kv > 0 ? r1(p.kv) : 0, r: !!(p.dof && p.dof.r), kr: p.dof && p.dof.r && p.kr > 0 ? r1(p.kr) : 0, hinge: !!p.hinge })),
        nodes: (md.unodes || []).map(q => ({ x: r3(q.x / 1000), hinge: !!q.hinge })) };
    }
    if (el.mod === 'DR') {
      const E = ENG().BDR, S = E.normalize(clone(st)), md = E.beamModel(S);
      return { L: r3(md.Ltot), sups: md.sups.map(p => ({ x: r3(p.x), fx: !!p.dof.x, fy: p.dof.y !== false, kv: +p.kv > 0 ? r1(+p.kv * 1000) : 0, r: !!p.dof.r, kr: p.dof.r && +p.kr > 0 ? r1(+p.kr) : 0, hinge: false })),
        nodes: (S.nodes || []).map(n => { const sg = md.segs[n.seg]; return sg && n.a > 1e-6 && n.a < sg.L - 1e-6 ? { x: r3(sg.x0 + n.a), hinge: !!n.hinge } : null; }).filter(Boolean) };
    }
    if (el.mod === 'ST') {
      const g = st.geom || {}, spans = (g.przesla || []).map(Number).filter(v => v > 0), cL = +g.wspL || 0, cR = +g.wspP || 0;
      const xs = [cL]; spans.forEach(v => xs.push(xs[xs.length - 1] + v));
      return { L: r3(xs[xs.length - 1] + cR), sups: xs.map((x, i) => {
        const p = (st.podpory || [])[i] || {}, t = p.typ || 'przegub', kz = +p.kz || 0, kf = +p.kfi || 0, sprR = (t === 'sprezyna' || t === 'podatne') && kf > 0;
        return { x: r3(x), fx: !p.przesuwna, fy: !(t === 'sprezyna' && !(kz > 0)), kv: t === 'sprezyna' && kz > 0 ? r1(kz * 1000) : 0, r: t === 'utwierdzenie' || sprR, kr: sprR && kf < 1e8 ? r1(kf) : 0, hinge: false };
      }), nodes: [] };
    }
  } catch (e) { console.error(e); }
  return null;
}
const sameSup = (a, b) => a && b && a.fx === b.fx && a.fy === b.fy && a.kv === b.kv && a.r === b.r && a.kr === b.kr && a.hinge === b.hinge;

// geometria i podpory belki z modułu → model
function beamGeomFromModule(P, el, base, st, info, msgs) {
  const sch = el.sch; if (!sch || !sch.O || !sch.sups.length) return false;
  const dO = beamDesc(el, base), dN = beamDesc(el, st); if (!dO || !dN || !dO.sups.length) return false;
  if (JSON.stringify(dO) === JSON.stringify(dN)) return false;
  if (!dN.sups.length || !(dN.L > 0.05)) { msgs.push('Belka w module bez podpór lub o zerowej długości – pominięto zmianę schematu.'); return false; }
  const O = sch.O, flip = !!el.flip, nO = dO.sups.length, nN = dN.sups.length;
  if (nO !== sch.sups.length || Math.abs(dO.L - O.L) > 0.01) return false;          // dane bazowe modułu nieaktualne względem modelu
  const modSup = i => sch.sups[flip ? nO - 1 - i : i];                                // podpora modelu ↔ podpora i modułu
  const A0 = M().node(P, modSup(0).node); if (!A0) return false;
  const A = { x: A0.x, z: A0.z }, t = [O.c, O.s], m = flip ? [-t[0], -t[1]] : t;
  const uOf = nd => (nd.x - A.x) * m[0] + (nd.z - A.z) * m[1];
  const uO = dO.sups.map(p => p.x - dO.sups[0].x), uN = dN.sups.map(p => p.x - dN.sups[0].x);
  // dopasowanie podpór: ta sama liczba – kolejno (zmiana rozpiętości), inna – wg położenia (dodane / usunięte przęsło)
  const match = new Array(nN).fill(-1);
  if (nO === nN) match.forEach((_, j) => { match[j] = j; });
  else { const used = new Set(); uN.forEach((u, j) => { const i = uO.findIndex((v, k) => !used.has(k) && Math.abs(v - u) < TOLX); if (i >= 0) { used.add(i); match[j] = i; } }); }
  const pairs = []; match.forEach((i, j) => { if (i >= 0) pairs.push([uO[i], uN[j]]); });
  const oS = -dO.sups[0].x, nS = -dN.sups[0].x, oE = dO.L - dO.sups[0].x, nE = dN.L - dN.sups[0].x;
  if (oS < -TOLX && nS < -TOLX) pairs.push([oS, nS]);                                            // wspornik lewy w obu stanach
  if (oE > uO[nO - 1] + TOLX && nE > uN[nN - 1] + TOLX && match[nN - 1] === nO - 1) pairs.push([oE, nE]);   // wspornik prawy
  pairs.sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < pairs.length; i++) if (!(pairs[i][1] > pairs[i - 1][1] + 1e-6)) { msgs.push('Nieprawidłowy układ podpór w module – pominięto zmianę geometrii.'); return false; }
  const map = u => {
    if (u <= pairs[0][0]) return u + pairs[0][1] - pairs[0][0];
    for (let i = 0; i < pairs.length - 1; i++) { const [a, a2] = pairs[i], [b, b2] = pairs[i + 1]; if (u <= b + 1e-12) return a2 + (u - a) * (b2 - a2) / (b - a); }
    const l = pairs[pairs.length - 1]; return u + l[1] - l[0];
  };
  let ch = false;
  // 1. przesunięcie węzłów wzdłuż osi elementu (oś pozioma / pionowa – cały układ wg rzutu, rama pozostaje regularna; oś ukośna – węzły ciągu)
  const moved = pairs.some(p => Math.abs(p[0] - p[1]) > 1e-6);
  if (moved) {
    const aligned = Math.abs(t[0]) > 0.999 || Math.abs(t[1]) > 0.999, only = aligned ? null : new Set(O.nodes);
    P.nodes.forEach(nd => { if (only && !only.has(nd.id)) return; const u = uOf(nd), d = map(u) - u; if (Math.abs(d) > 1e-9) { nd.x = Math.round((nd.x + d * m[0]) * 1e6) / 1e6; nd.z = Math.round((nd.z + d * m[1]) * 1e6) / 1e6; ch = true; } });
    info.push('rozpiętości');
  }
  const chain = () => { const Oc = D.order(P, el.bars); return Oc ? { Oc, us: Oc.nodes.map(id => uOf(M().node(P, id))) } : null; };
  const pt = u => ({ x: A.x + u * m[0], z: A.z + u * m[1] });
  // 2. końce belki: przedłużenie (nowy wspornik / przęsło) albo skrócenie (usunięty wspornik / przęsło)
  const extend = (C, u, low) => {
    const n = C.Oc.nodes, first = (C.us[0] < C.us[n.length - 1]) === low, endId = first ? n[0] : n[n.length - 1];
    const bar = (first ? C.Oc.seq[0] : C.Oc.seq[C.Oc.seq.length - 1]).bar, p = pt(u);
    const nn = M().addNode(P, p.x, p.z, 1e-4), b = M().addBar(P, endId, nn.id, bar.sec, { type: bar.type, role: bar.role });
    if (b && !el.bars.includes(b.id)) el.bars.push(b.id);
    ch = true; info.push('belka przedłużona');
  };
  const cut = (C, u, low) => {
    C.Oc.seq.forEach(q => { const u1 = uOf(M().node(P, q.bar.n1)), u2 = uOf(M().node(P, q.bar.n2)); if (Math.min(u1, u2) < u - TOLX && Math.max(u1, u2) > u + TOLX) M().splitBar(P, q.bar.id, (u - u1) / (u2 - u1)); });
    const del = el.bars.map(id => M().bar(P, id)).filter(b => { if (!b) return false; const u1 = uOf(M().node(P, b.n1)), u2 = uOf(M().node(P, b.n2)); return low ? Math.max(u1, u2) <= u + TOLX : Math.min(u1, u2) >= u - TOLX; }).map(b => b.id);
    if (!del.length) return;
    const nodes = new Set(); del.forEach(id => { const b = M().bar(P, id); nodes.add(b.n1); nodes.add(b.n2); });
    M().deleteBars(P, del);
    const keep = new Set(); el.bars.forEach(id => { const b = M().bar(P, id); if (b) { keep.add(b.n1); keep.add(b.n2); } });
    const orphan = [...nodes].filter(id => !P.bars.some(b => b.n1 === id || b.n2 === id));
    if (orphan.length) M().deleteNodes(P, orphan);
    if ([...nodes].some(id => !keep.has(id) && !orphan.includes(id))) msgs.push('Belkę skrócono – pręty dochodzące do usuniętej części pozostały w modelu (sprawdź je).');
    ch = true; info.push('belka skrócona');
  };
  let C = chain(); if (!C) return ch;
  { const lo = Math.min(...C.us); if (nS < lo - TOLX) extend(C, nS, true); else if (nS > lo + TOLX) cut(C, nS, true); }
  C = chain(); if (!C) return ch;
  { const hi = Math.max(...C.us); if (nE > hi + TOLX) extend(C, nE, false); else if (nE < hi - TOLX) cut(C, nE, false); }
  // 3. węzły ciągu w położeniach podpór i węzłów modułu (podział prętów)
  const nodeAt = u => {
    C = chain(); if (!C) return null;
    const k = C.us.findIndex(v => Math.abs(v - u) < TOLX); if (k >= 0) return C.Oc.nodes[k];
    for (let i = 0; i < C.Oc.seq.length; i++) {
      const a = C.us[i], b = C.us[i + 1]; if (!(Math.min(a, b) < u && Math.max(a, b) > u)) continue;
      const bar = C.Oc.seq[i].bar, u1 = uOf(M().node(P, bar.n1)), u2 = uOf(M().node(P, bar.n2));
      const r = M().splitBar(P, bar.id, (u - u1) / (u2 - u1)); ch = true; return r ? r.node.id : null;
    }
    return null;
  };
  const others = nid => P.bars.filter(b => (b.n1 === nid || b.n2 === nid) && !el.bars.includes(b.id));
  const chainAt = nid => el.bars.map(id => M().bar(P, id)).filter(b => b && (b.n1 === nid || b.n2 === nid));
  const relAt = (b, nid) => (b.n1 === nid ? b.rel[0] : b.rel[1]);
  const setRel = (b, nid, v) => { const i = b.n1 === nid ? 0 : 1; if (b.rel[i] !== v) { b.rel[i] = v; ch = true; } };
  // ciągłość obrotu belki z prętem podpierającym: koniec belki – przegub pręta belki, podpora pośrednia – przegub prętów podpierających
  const rotCont = (nid, rigid) => {
    const cb = chainAt(nid), ob = others(nid).filter(b => b.type !== 'truss');
    if (cb.length === 1) { setRel(cb[0], nid, rigid ? null : 0); if (rigid) ob.forEach(b => { if (relAt(b, nid) === 0) setRel(b, nid, null); }); }
    else ob.forEach(b => { if (rigid ? relAt(b, nid) === 0 : relAt(b, nid) !== 0) setRel(b, nid, rigid ? null : 0); });
  };
  const hingeAt = (nid, on) => {
    const cb = chainAt(nid); if (cb.length < 2) return;
    const has = cb.some(b => relAt(b, nid) === 0);
    if (on && !has) setRel(cb[0], nid, 0);
    if (!on && has) cb.forEach(b => { if (relAt(b, nid) === 0) setRel(b, nid, null); });
  };
  const incl = Math.abs(O.s) > 0.02;
  // 4. podpory
  dN.sups.forEach((nw, j) => {
    const i = match[j], od = i >= 0 ? dO.sups[i] : null;
    if (od && sameSup(od, nw)) return;
    const nid = nodeAt(uN[j]); if (nid === null) return;
    let sp = P.supports.find(s => s.node === nid);
    const mem = others(nid).length > 0;
    const fCh = !od || od.fx !== nw.fx || od.fy !== nw.fy || od.kv !== nw.kv, rCh = !od || od.r !== nw.r || od.kr !== nw.kr;
    if (!sp && mem) {
      // podparcie prętem modelu (słup, podciąg, wieszak)
      if (od && fCh) msgs.push(`Podpora ${SUPL(j)} jest prętem modelu – warunki przesuwu i podatność pionową zmień w modelu.`);
      if (!od || od.r !== nw.r) { if (od || !nw.r) { rotCont(nid, nw.r); info.push(`podpora ${SUPL(j)}: ${nw.r ? 'połączenie sztywne' : 'przegub'}`); } }
      else if (od.kr !== nw.kr) msgs.push(`Sztywność obrotowa podpory ${SUPL(j)} wynika z prętów dochodzących (rama zastępcza) – zmień ich przekroje lub połączenia w modelu.`);
    } else {
      const sp0 = sp ? Object.assign({}, sp) : null;
      if (!sp) { sp = { node: nid, ux: 0, uz: 0, ry: 0, kx: 0, kz: 0, kr: 0, ang: 0 }; P.supports.push(sp); ch = true; info.push(`nowa podpora ${SUPL(j)}`); }
      if (fCh) { if (incl) sp.ang = r1(O.ang); sp.ux = nw.fx ? 1 : 0; sp.kx = 0; sp.uz = nw.fy && !(nw.kv > 0) ? 1 : 0; sp.kz = nw.fy && nw.kv > 0 ? nw.kv : 0; ch = true; }
      if (rCh) {
        const memK = od && od.r && od.kr > 0 && sp0 ? Math.max(0, od.kr - (sp0.kr || 0)) : 0;     // udział prętów dochodzących w podatności
        sp.ry = nw.r && !(nw.kr > 0) ? 1 : 0; sp.kr = nw.r && nw.kr > 0 ? Math.max(1, r1(nw.kr - memK)) : 0; ch = true;
        if (mem && od && od.r !== nw.r) rotCont(nid, nw.r);
      }
      if (sp0 && (fCh || rCh)) info.push(`podpora ${SUPL(j)}`);
    }
    if (!od ? nw.hinge : od.hinge !== nw.hinge) { hingeAt(nid, nw.hinge); info.push(`przegub nad podporą ${SUPL(j)}`); }
  });
  // podpory usunięte w module
  if (nO !== nN) dO.sups.forEach((od, i) => {
    if (match.includes(i)) return;
    const nid = modSup(i).node; if (!M().node(P, nid)) return;
    const sp = P.supports.find(s => s.node === nid);
    if (sp) { P.supports = P.supports.filter(s => s !== sp); ch = true; info.push(`usunięto podporę ${SUPL(i)}`); }
    else if (others(nid).length) msgs.push(`Podpora ${SUPL(i)} jest prętem modelu (słup, podciąg, wieszak) – aby ją usunąć, usuń lub odłącz ten pręt w modelu.`);
  });
  // 5. węzły pośrednie i przeguby (gdy rozpiętości bez zmian)
  if (!moved) {
    const nu = d => d.nodes.map(q => ({ u: q.x - d.sups[0].x, hinge: q.hinge }));
    const a = nu(dO), b = nu(dN);
    b.forEach(q => { const o = a.find(v => Math.abs(v.u - q.u) < TOLX); if (o && o.hinge === q.hinge) return; const nid = nodeAt(q.u); if (nid === null) return; if (q.hinge || o) { hingeAt(nid, q.hinge); info.push(q.hinge ? 'przegub' : 'usunięto przegub'); } else info.push('węzeł'); });
    a.forEach(o => { if (!o.hinge || b.some(q => Math.abs(q.u - o.u) < TOLX)) return; C = chain(); if (!C) return; const k = C.us.findIndex(v => Math.abs(v - o.u) < TOLX); if (k >= 0) { hingeAt(C.Oc.nodes[k], false); info.push('usunięto przegub'); } });
  }
  return ch;
}

/* ---------------------------------------------------------------- obciążenia belki: moduł → model */
const LCAT = { perm: 'G', imp: 'Q', snow: 'S', wind: 'W', other: 'E', acc: 'A' };
// obciążenia w danych modułu: klucz → { rama, rcase, kind, q: [{x1, x2, q1, q2, g, proj}], P: [{x, P, g}], bad, off }
// (x – od lewego końca belki w module [m]; q, P – prostopadle do osi, w dół; g – kierunek grawitacyjny)
function beamLoads(el, st) {
  const out = {};
  const add = (key, o) => (out[key] = out[key] || Object.assign({ q: [], P: [], bad: [] }, o));
  const rkey = it => 'R:' + (it.rcase || it.link || String(it.name || '').split(' ')[0]);
  try {
    if (el.mod === 'ZB') {
      const E = ENG().BZB, S = E.normalize(clone(st)), lay = E.loadLayout(S), keys = {};
      ['perm', 'var', 'acc'].forEach(k => { let oi = 0; (S.loads[k] || []).forEach((it, i) => {
        const key = it.rama ? rkey(it) : `O:${k}:${oi++}`; keys[k + i] = key;
        add(key, { rama: !!it.rama, rcase: it.rama ? key.slice(2) : null, list: k, idx: [i], kind: k === 'perm' ? 'perm' : k === 'acc' ? 'acc' : it.kind, cat: it.cat, alt: it.alt, grp: it.grp, psi: [it.p0, it.p1, it.p2], name: it.name, off: !!it.off });
      }); });
      const take = (arr, k) => arr.forEach(r => {
        if (r.si === undefined) return; const e = out[keys[k + r.si]]; if (!e) return;
        const cy = r.cy === undefined ? 1 : r.cy;
        if (r.prof) for (let j = 0; j < r.prof.length - 1; j++) { const a = r.prof[j], b = r.prof[j + 1]; if (b[0] - a[0] > 0.5) e.q.push({ x1: a[0] / 1000, x2: b[0] / 1000, q1: a[1] * cy, q2: b[1] * cy }); }
        else if (r.qy) (r.ranges || [[r.x1, r.x2]]).forEach(([u, v]) => { if (v - u > 0.5) e.q.push({ x1: u / 1000, x2: v / 1000, q1: r.qy, q2: r.qy }); });
        r.pts.forEach(p => { if (p.Py) e.P.push({ x: p.x / 1000, P: p.Py }); if (p.Pz || p.T) e.bad.push('siła pozioma / moment skręcający'); });
        if (r.qz || r.mt) e.bad.push('obciążenie poziome / skręcanie');
      });
      take(lay.G, 'perm'); take(lay.vars, 'var'); take(lay.accs, 'acc');
    } else if (el.mod === 'DR') {
      const E = ENG().BDR, S = E.normalize(clone(st)), md = E.beamModel(S);
      ['perm', 'var', 'acc'].forEach(k => { let oi = 0; (S.loads[k] || []).forEach((it, i) => {
        const key = it.rama ? rkey(it) : `O:${k}:${oi++}`;
        const e = add(key, { rama: !!it.rama, rcase: it.rama ? key.slice(2) : null, list: k, idx: [], kind: k === 'perm' ? 'perm' : k === 'acc' ? 'acc' : it.kind, cat: it.cat, alt: it.alt, grp: it.grp, psi: [it.p0, it.p1, it.p2], dur: it.dur, name: it.name, off: false });
        e.idx.push(i); if (it.off) { e.off = true; return; }
        if (it.dir === 'z') { if (it.q || (it.pts || []).some(p => p.P)) e.bad.push('obciążenie boczne (z)'); return; }
        const rg = E.itemRange(it, md), q2 = it.q2 === '' ? +it.q : +it.q2, g = it.dir === 'g';
        if ((+it.q || q2) && rg.xb > rg.xa + 1e-6) e.q.push({ x1: rg.xa, x2: rg.xb, q1: +it.q, q2, g, proj: g && it.proj === 'hor' });
        (it.pts || []).forEach(p => { if (+p.P) e.P.push({ x: E.ptX(p, rg), P: +p.P, g }); if (+p.T) e.bad.push('moment skręcający'); });
        if (+it.mt) e.bad.push('skręcanie'); if (+it.N) e.bad.push('siła podłużna');
      }); });
    } else if (el.mod === 'ST') {
      const g = st.geom || {}, L = (+g.wspL || 0) + (g.przesla || []).reduce((a, v) => a + (+v || 0), 0) + (+g.wspP || 0), nE = (st.etapy || []).length || 1;
      const KND = { G: 'perm', Q: 'imp', S: 'snow', W: 'wind', T: 'other', A: 'acc' };
      let oi = 0;
      (st.obciazenia || []).forEach((o, i) => {
        const key = o.rama ? 'R:' + o.id : `O:obc:${oi++}`;
        const e = add(key, { rama: !!o.rama, rcase: o.rama ? o.id : null, list: 'obc', idx: [i], kind: KND[o.rodzaj] || null, cat: o.kat ? String(o.kat).replace(/^Q-/, '') : 'B', grp: o.wyklucz || '', name: o.nazwa, off: o.aktywne === false, skip: (+o.etap || 0) < nE - 1 });
        if (!e.kind) e.bad.push(`rodzaj oddziaływania ${o.rodzaj}`);
        (o.sklad || []).forEach(k => {
          if (k.kier === 'y') { e.bad.push('obciążenie poziome (Y)'); return; }
          if (k.typ === 'q') { const x0 = k.x0 === '' || k.x0 == null ? 0 : +k.x0, x1 = k.x1 === '' || k.x1 == null ? L : +k.x1, q0 = +k.q0 || 0, q1 = k.q1 === '' || k.q1 == null ? q0 : +k.q1; if (Math.abs(x1 - x0) > 1e-4 && (q0 || q1)) e.q.push(x0 <= x1 ? { x1: x0, x2: x1, q1: q0, q2: q1 } : { x1, x2: x0, q1, q2: q0 }); }
          else if (k.typ === 'P') { if (+k.P) e.P.push({ x: +k.x || 0, P: +k.P }); }
          else if (k.typ === 'M') e.bad.push('moment skupiony');
        });
        if (+o.N) e.bad.push('siła podłużna');
      });
    }
  } catch (e) { console.error(e); return null; }
  Object.values(out).forEach(e => { e.q.forEach(q => { q.x1 = r3(q.x1); q.x2 = r3(q.x2); q.q1 = r3(q.q1); q.q2 = r3(q.q2); }); e.P.forEach(p => { p.x = r3(p.x); p.P = r3(p.P); }); e.bad = Array.from(new Set(e.bad)); });
  return out;
}
const loadSig = e => JSON.stringify([e.q, e.P]);
// zapis obciążeń pozycji modułu na prętach ciągu (przypadek cid); skip – siły węzłowe przekazywane z ramy (bez dublowania)
function writeBeamLoads(P, el, cid, e, skip) {
  const O = D.order(P, el.bars); if (!O) return [];
  const ids = [], flip = !!el.flip, horiz = Math.abs(O.s) < 0.02, S = x => (flip ? O.L - x : x);
  const push = l => { l.id = P.seq.load++; l.case = cid; P.loads.push(l); ids.push(l.id); };
  e.q.forEach(q => {
    let a = S(q.x1), b = S(q.x2), qa = q.q1, qb = q.q2; if (a > b) { [a, b] = [b, a]; [qa, qb] = [qb, qa]; }
    const qAt = s => (b - a > 1e-12 ? qa + (qb - qa) * (s - a) / (b - a) : qa);
    O.seq.forEach((sq, k) => {
      const x0 = O.xs[k], x1 = O.xs[k + 1], Lb = x1 - x0, u = Math.max(a, x0), v = Math.min(b, x1); if (v - u < 1e-6) return;
      let t1 = (u - x0) / Lb, t2 = (v - x0) / Lb, q1 = qAt(u), q2 = qAt(v);
      if (sq.rev) { [t1, t2] = [1 - t2, 1 - t1]; [q1, q2] = [q2, q1]; }
      const dir = q.g || horiz ? 'Z' : 'z', sg = dir === 'z' && sq.rev ? -1 : 1;
      push({ kind: 'dist', bar: sq.bar.id, dir, q1: r3(sg * q1), q2: Math.abs(q1 - q2) < 1e-9 ? '' : r3(sg * q2), x1: r4(t1), x2: r4(t2), proj: !!q.proj });
    });
  });
  const used = new Set();
  e.P.forEach(p => {
    let Pv = p.P;
    if (skip) { const j = skip.findIndex((q, i) => !used.has(i) && Math.abs(q.x - p.x) < TOLX); if (j >= 0) { used.add(j); Pv = r3(Pv - skip[j].P); if (Math.abs(Pv) < 1e-6) return; } }
    const s = Math.max(0, Math.min(O.L, S(p.x)));
    let k = O.seq.findIndex((sq, i) => s >= O.xs[i] - 1e-9 && s <= O.xs[i + 1] + 1e-9); if (k < 0) k = O.seq.length - 1;
    const sq = O.seq[k], Lb = O.xs[k + 1] - O.xs[k]; let tt = Math.max(0, Math.min(1, (s - O.xs[k]) / Lb)); if (sq.rev) tt = 1 - tt;
    const dir = p.g || horiz ? 'Z' : 'z', sg = dir === 'z' && sq.rev ? -1 : 1;
    push({ kind: 'point', bar: sq.bar.id, dir, P: r3(sg * Pv), x: r4(tt) });
  });
  return ids;
}
// przypadek modelu dla nowego obciążenia z modułu: stałe – pierwszy przypadek G, zmienne i wyjątkowe – nowy przypadek (osobne oddziaływanie)
function caseFor(P, el, e) {
  const cat = LCAT[e.kind] || 'Q';
  if (cat === 'G') { const c = P.cases.find(q => q.cat === 'G'); if (c) return c; }
  const ps = e.psi || [];
  const c = { id: M().nextCaseId(P, cat), name: e.name || `${CMB().CATS[cat].n} – ${el.name}`, cat, qcat: cat === 'Q' ? (CMB().QCAT[e.cat] ? e.cat : 'B') : 'B', alt: e.alt === 'high' ? 'high' : 'low', grp: e.grp || '', sw: false, dur: e.dur || '',
    p0: isFinite(+ps[0]) ? +ps[0] : 0.7, p1: isFinite(+ps[1]) ? +ps[1] : 0.5, p2: isFinite(+ps[2]) ? +ps[2] : 0.3, pattern: cat === 'Q' };
  P.cases.push(c); return c;
}
function beamLoadsFromModule(P, el, base, st, info, msgs) {
  const Lo = beamLoads(el, base), Ln = beamLoads(el, st); if (!Lo || !Ln) return { ch: false, rm: [] };
  const xf = el.xfer || (el.xfer = {});
  const pend = new Set(); Object.values(xf).forEach(x => x.ids.forEach(id => pend.add(id)));
  const bars = new Set(el.bars), np = el.nodePts || {};
  let ch = false; const rm = [];
  // pozycje z ramy (przypadki modelu): zmienione lub usunięte w module
  Object.keys(Lo).forEach(k => {
    const o = Lo[k], n = Ln[k]; if (!o.rama) return;
    if (n && (n.off || o.off || loadSig(n) === loadSig(o))) return;
    const lc = P.cases.find(c => c.id === o.rcase); if (!lc) return;
    if (n && n.bad.length) msgs.push(`Obciążenie ${lc.id}: ${n.bad.join(', ')} – model przyjmuje tylko obciążenia w płaszczyźnie układu; pominięto.`);
    P.loads = P.loads.filter(l => !(l.case === lc.id && bars.has(l.bar) && (l.kind === 'dist' || l.kind === 'point') && !pend.has(l.id)));
    if (n) writeBeamLoads(P, el, lc.id, n, np[lc.id]);
    ch = true; info.push(n ? `obciążenia ${lc.id}` : `usunięto obciążenia ${lc.id} z elementu`);
  });
  // nowe pozycje dodane w module → przypadki modelu (pozycja usuwana z danych modułu, wraca jako pozycja „z ramy”)
  Object.keys(Ln).forEach(k => {
    const n = Ln[k]; if (n.rama) return;
    const x = xf[k], o = Lo[k];
    if (x) {                               // przeniesiona wcześniej, moduł nie otrzymał jeszcze danych z modelu
      rm.push(n);
      if (o && loadSig(o) === loadSig(n)) return;
      P.loads = P.loads.filter(l => !x.ids.includes(l.id));
      x.ids = n.off ? [] : writeBeamLoads(P, el, x.c, n, null); ch = true; info.push(`obciążenia ${x.c}`);
      return;
    }
    if (n.off || n.skip || (!n.q.length && !n.P.length)) return;      // wyłączona, etap montażu albo w trakcie wprowadzania
    if (o && !o.rama && loadSig(o) === loadSig(n)) return;              // pozycja modułu sprzed powiązania – bez zmian
    if (!n.kind) { msgs.push(`Obciążenie „${n.name || ''}”: ${n.bad.join(', ')} – nie przeniesiono do modelu.`); return; }
    if (n.bad.length) msgs.push(`Obciążenie „${n.name || ''}”: ${n.bad.join(', ')} – model przyjmuje tylko obciążenia w płaszczyźnie układu; pominięto te składowe.`);
    const lc = caseFor(P, el, n);
    xf[k] = { c: lc.id, ids: writeBeamLoads(P, el, lc.id, n, null) };
    rm.push(n); ch = true; info.push(`nowe obciążenie → przypadek ${lc.id}`);
  });
  return { ch, rm };
}
// usunięcie z danych modułu pozycji przeniesionych do modelu
function dropItems(el, st, rm) {
  if (!rm.length) return;
  if (el.mod === 'ST') { const del = new Set(rm.flatMap(e => e.idx)); st.obciazenia = (st.obciazenia || []).filter((o, i) => !del.has(i)); return; }
  ['perm', 'var', 'acc'].forEach(k => { const del = new Set(rm.filter(e => e.list === k).flatMap(e => e.idx)); if (del.size) st.loads[k] = st.loads[k].filter((it, i) => !del.has(i)); });
}

/* ---------------------------------------------------------------- słup: warunki podparcia moduł → model */
// opis: base – fix | pin | spr (k_b), top – free | pin | fix | slide
function colDesc(el, st) {
  try {
    if (el.mod === 'ZB') { const T = { pp: ['pin', 'pin'], cant: ['fix', 'free'], fp: ['fix', 'pin'], ff: ['fix', 'fix'], ffs: ['fix', 'slide'] }[((st.buck || {}).y || {}).sch]; return T ? { base: T[0], kb: 0, top: T[1] } : null; }
    if (el.mod === 'ST') { const d = (st.podpory || {}).dol || {}, g = (st.podpory || {}).gora || {}; const spr = d.y === 'spr' && +d.kry > 0; return { base: d.y === 'prz' || (d.y === 'spr' && !spr) ? 'pin' : spr ? 'spr' : 'fix', kb: spr ? +d.kry : 0, top: { swob: 'free', prz: 'pin', utw: 'fix', utwp: 'slide', spr: 'free' }[g.y] || 'free' }; }
    if (el.mod === 'DR') { const z = (st.supp || {}).z || {}; const spr = z.base === 'fix' && +z.kb > 0; return { base: z.base === 'pin' ? 'pin' : spr ? 'spr' : 'fix', kb: spr ? +z.kb : 0, top: { pin: 'pin', free: 'free', fix: 'fix', guided: 'slide' }[z.top] || 'pin' }; }
  } catch (e) { /* */ }
  return null;
}
function colFromModule(P, el, base, st, info, msgs) {
  const sch = el.sch; if (!sch || !sch.O) return false;
  const o = colDesc(el, base), n = colDesc(el, st); if (!o || !n || JSON.stringify(o) === JSON.stringify(n)) return false;
  let ch = false;
  const q0 = sch.O.seq[0], q1 = sch.O.seq[sch.O.seq.length - 1], nb = sch.nb, nt = sch.nt;
  const setRel = (b, nid, v) => { const i = b.n1 === nid ? 0 : 1; if (b.rel[i] !== v) { b.rel[i] = v; ch = true; } };
  if (o.base !== n.base || (n.base === 'spr' && o.kb !== n.kb)) {
    const sp = P.supports.find(s => s.node === nb);
    if (sp) { sp.ry = n.base === 'fix' ? 1 : 0; sp.kr = n.base === 'spr' ? n.kb : 0; if (n.base !== 'pin') setRel(q0.bar, nb, null); ch = true; }
    else setRel(q0.bar, nb, n.base === 'pin' ? 0 : n.base === 'spr' ? n.kb : null);     // słup oparty na pręcie – połączenie u podstawy
    info.push(`podstawa słupa: ${{ fix: 'utwierdzenie', pin: 'przegub', spr: 'podatne utwierdzenie' }[n.base]}`);
  }
  const restr = t => t === 'pin' || t === 'fix', rot = t => (t === 'pin' ? 'rel' : t === 'fix' || t === 'slide' ? 'rigid' : el.mod === 'ZB' ? 'rel' : null);
  // głowica: tylko gdy zmieniona w module – porównanie z rzeczywistym stanem modelu (w SłupStal / SłupDrewniany głowica wynika ze sposobu
  // przekazania sił z ramy, np. przy podstawie przegubowej głowica jest podparta)
  if (n.top !== o.top) {
    const bc = colBC(P, sch), actR = bc.topR || sch.braced;
    let sp = P.supports.find(q => q.node === nt);
    if (restr(n.top) && !actR) { if (!sp) { sp = { node: nt, ux: 1, uz: 0, ry: 0, kx: 0, kz: 0, kr: 0, ang: 0 }; P.supports.push(sp); } else sp.ux = 1; ch = true; info.push('głowica podparta poziomo (układ usztywniony)'); }
    else if (!restr(n.top) && actR) {
      if (bc.topR) { sp.ux = 0; sp.kx = 0; if (!sp.uz && !sp.ry && !(sp.kz > 0) && !(sp.kr > 0)) P.supports = P.supports.filter(q => q !== sp); ch = true; info.push('głowica bez podpory poziomej (układ przechyłowy)'); }
      else msgs.push('Układ jest usztywniony prętami stężeń lub podporami poziomymi innych węzłów – aby był przechyłowy, zmień to w modelu.');
    }
    const rn = rot(n.top), atTop = P.bars.filter(b => (b.n1 === nt || b.n2 === nt) && !el.bars.includes(b.id) && b.type !== 'truss');
    if (rn && atTop.length) {
      if (rn === 'rel') setRel(q1.bar, nt, 0);
      else { setRel(q1.bar, nt, null); if (atTop.every(b => (b.n1 === nt ? b.rel[0] : b.rel[1]) === 0)) atTop.forEach(b => setRel(b, nt, null)); }
      info.push(`głowica: ${rn === 'rel' ? 'przegub' : 'połączenie sztywne'}`);
    }
  }
  return ch;
}

/* ---------------------------------------------------------------- ustawienia kombinacji moduł → model */
function settingsFromModule(P, el, base, st, info) {
  if (el.mod === 'ST') return false;
  const pick = s => { const L = s && s.loads; if (!L) return null; return { comb: L.comb, gG: +L.gG, gQ: +L.gQ, xi: +L.xi, gGinf: L.gGinf !== undefined ? +L.gGinf : L.gGi !== undefined ? +L.gGi : undefined, accPsi: L.accPsi }; };
  const a = pick(base), b = pick(st); if (!a || !b) return false;
  let ch = false;
  Object.keys(b).forEach(k => { const v = b[k]; if (v === undefined || v === a[k] || (typeof v === 'number' && !(v > 0))) return; if (P.settings[k] !== v) { P.settings[k] = v; ch = true; } });
  if (ch) info.push('ustawienia kombinacji obciążeń');
  return ch;
}

/* ---------------------------------------------------------------- moduł → model: całość */
// base – dane, które moduł miał poprzednio (ostatnio przesłane lub zapisane przez moduł); st – nowe dane modułu (kopia)
D.fromModule = function (P, R, el, base, st) {
  const info = [], msgs = []; let changed = false;
  const nm = D.nameFromModule(el, st); if (nm && nm !== el.name) { el.name = nm; changed = true; info.push('nazwa'); }
  const secTxt = D.applyModuleSections(P, el, st); if (secTxt) { changed = true; info.push('przekrój ' + secTxt); }
  if (base) {
    if (el.kind === 'beam') {
      if (beamGeomFromModule(P, el, base, st, info, msgs)) changed = true;
      const L = beamLoadsFromModule(P, el, base, st, info, msgs); if (L.ch) changed = true; dropItems(el, st, L.rm);
    } else {
      if (D.geometryFromModule(P, R, el, st)) { changed = true; info.push('wysokość słupa'); }
      if (colFromModule(P, el, base, st, info, msgs)) changed = true;
    }
    if (settingsFromModule(P, el, base, st, info)) changed = true;
  } else if (D.geometryFromModule(P, R, el, st)) { changed = true; info.push('geometria'); }
  return { changed, info: Array.from(new Set(info)), msgs: Array.from(new Set(msgs)), st };
};
D._beamDesc = beamDesc; D._beamLoads = beamLoads; D._colDesc = colDesc;

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
  // niespełnione warunki bez wartości wytężenia (np. brak zbrojenia) – opis zamiast „0%”
  const failC = (r.checks || []).find(c => c.status === 'fail' && c.info !== true);
  const note = !ok && !(eta > 0) && failC ? (failC.name || failC.n || '').replace(/\s*–.*$/, '') : '';
  return { eta: !ok && !(eta > 0) ? null : eta, note, worst: worst ? (worst.name || worst.n || worst.nazwa || worst.opis || worst.id || '') : '', fails, errors: r.errors || [], ok, n: (r.checks || []).length, dev: D.deviation(el, r) };
};

/* ------------------------------------------------------------ zgodność schematu modułu ze statyką ramy */
// momenty od obciążeń stałych (G) liczone silnikiem modułu w punktach elementu belkowego [x (m), M (kNm)]
D.moduleGMoments = function (el, r) {
  try {
    if (el.mod === 'ZB') { const st = r.st; if (!st || !st.E || !st.E.G) return null; return { x: st.x.map(v => v / 1000), M: Array.from(st.E.G.My, v => v / 1e6) }; }
    if (el.mod === 'ST') { const s = r.an && r.md ? r.an.res[r.md.nE - 1] : null; if (!s) return null; const ids = Object.keys(s).filter(k => { const c = r.md.cases.find(q => q.id === k); return c && c.rodzaj === 'G'; }); const M0 = new Float64Array(r.an.xs.length); ids.forEach(k => s[k].tot.M.forEach((v, i) => { M0[i] += v; })); return { x: Array.from(r.an.xs, v => v / 1000), M: Array.from(M0, v => v / 1e6) }; }
    if (el.mod === 'DR') { const its = (r.st && r.st.items || []).filter(o => o.cls === 'G'); if (!its.length) return null; const M0 = new Float64Array(r.st.stX.length); its.forEach(o => o.units.forEach(u => u.My.forEach((v, i) => { M0[i] += v; }))); return { x: r.st.stX, M: Array.from(M0) }; }
  } catch (e) { /* */ }
  return null;
};
// największa różnica momentów G (moduł vs rama) odniesiona do max |M| w ramie
D.deviation = function (el, r) {
  if (el.kind !== 'beam' || !el.frameG) return null;
  const mm = D.moduleGMoments(el, r); if (!mm) return null;
  const F = el.frameG; let fmax = 1e-9, dmax = 0, at = null;
  F.forEach(p => { fmax = Math.max(fmax, Math.abs(p.M)); });
  F.forEach(p => { let bi = 0; mm.x.forEach((x, i) => { if (Math.abs(x - p.x) < Math.abs(mm.x[bi] - p.x)) bi = i; }); const d = Math.abs(mm.M[bi] - p.M); if (d > dmax) { dmax = d; at = { x: p.x, frame: p.M, mod: mm.M[bi] }; } });
  return { rel: dmax / fmax, at, fmax };
};
// momenty od obciążeń stałych w ramie wzdłuż elementu (w układzie modułu: x od początku ciągu lub od podpory wspornika)
D.frameGMoments = function (P, R, el, flip) {
  const O = el.sch && el.sch.O; if (!O || !R || !R.ok) return null;
  const G = P.cases.filter(c => c.cat === 'G'); if (!G.length) return null;
  const out = [];
  O.seq.forEach((q, k) => {
    const ei = R.ctx.bIdx.get(q.bar.id); if (ei === undefined) return;
    const L = O.xs[k + 1] - O.xs[k];
    [0.1, 0.3, 0.5, 0.7, 0.9].forEach(t => {
      const xl = t * L; let M0 = 0;
      G.forEach(c => { const st = R.cases[c.id].bars[ei]; let b = st[0]; st.forEach(s => { if (Math.abs(s.x - xl) < Math.abs(b.x - xl)) b = s; }); M0 += b.M; });
      const xc = q.rev ? O.xs[k + 1] - xl : O.xs[k] + xl, Mc = (q.rev ? -1 : 1) * M0;
      out.push({ x: flip ? O.L - xc : xc, M: flip ? Mc : Mc });
    });
  });
  return out;
};

root.RDES = D;
D._MAP = MAP;
if (typeof module !== 'undefined' && module.exports) module.exports = D;
})(typeof window !== 'undefined' ? window : globalThis);
