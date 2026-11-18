/* =====================================================================
   RAMA2D – silnik MES płaskich układów prętowych (ramy, belki, kratownice)
   • element belkowy Eulera–Bernoulliego 2D (u, w, φ w węźle), pręty dzielone
     na podelementy (wyniki pośrednie, efekt P-δ, wyboczenie prętów),
   • przeguby i połączenia podatne na końcach prętów (kondensacja statyczna),
     pręty kratownicowe (przeguby na obu końcach),
   • podpory: blokady ux, uz, φ, sprężyny kx, kz, kφ, podpory ukośne (kąt),
     osiadania i obroty wymuszone (przypadki obciążeń),
   • obciążenia: węzłowe, rozłożone liniowo-zmienne (częściowe), skupione,
     momenty skupione, temperatura równomierna i różnica temperatur,
   • analiza liniowa (I rzędu), analiza II rzędu P-Δ (iteracyjna, macierz
     geometryczna), liniowa analiza wyboczeniowa (mnożnik krytyczny α_cr,
     postać wyboczenia) – iteracja podprzestrzeni.
   Jednostki: kN, m (E w kN/m², A w m², I w m⁴), kąt w rad.
   Konwencja: oś lokalna x̄ od węzła początkowego do końcowego; strona „spodu”
   (włókna dolne, linia przerywana) – oś z̄ obrócona od x̄ o 90° zgodnie
   z ruchem wskazówek zegara (belka poziomo L→P: z̄ w dół; słup dół→góra: z̄ w prawo).
   M > 0 – rozciągane włókna od strony z̄; N > 0 – rozciąganie; V = dM/dx.
   ===================================================================== */
(function (root) {
'use strict';
const F = {};

/* ------------------------------------------------------------ algebra */
const zeros = n => new Float64Array(n);
function mat(n, m) { const a = []; for (let i = 0; i < n; i++) a.push(new Float64Array(m)); return a; }

// kondensacja statyczna: q = T·u (DOF zachowane), DOF „r” wyrugowane; k – macierz pełna (n×n), keep – indeksy zachowane
function condense(k, keep) {
  const n = k.length, rem = []; for (let i = 0; i < n; i++) if (!keep.includes(i)) rem.push(i);
  // T: n × keep.length ; dla zachowanych – jednostkowe, dla usuniętych: −k_rr⁻¹ k_ro
  const m = keep.length, T = mat(n, m);
  keep.forEach((d, j) => { T[d][j] = 1; });
  if (rem.length) {
    const r = rem.length, Krr = mat(r, r), Kro = mat(r, m);
    rem.forEach((a, i) => { rem.forEach((b, j) => { Krr[i][j] = k[a][b]; }); keep.forEach((b, j) => { Kro[i][j] = k[a][b]; }); });
    const X = solveDense(Krr, Kro.map(row => Array.from(row)), true);   // k_rr⁻¹ k_ro
    rem.forEach((a, i) => { for (let j = 0; j < m; j++) T[a][j] = X ? -X[i][j] : 0; });
  }
  return T;
}
// rozwiązanie gęste A·X = B (B – macierz kolumn jako wiersze r×m); zwraca null przy osobliwości
function solveDense(A0, B0, quiet) {
  const n = A0.length, A = A0.map(r => Array.from(r)), B = B0.map(r => Array.from(r)), m = B[0] ? B[0].length : 0;
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-300) { if (quiet) return null; throw new Error('macierz osobliwa'); }
    if (p !== c) { [A[p], A[c]] = [A[c], A[p]]; [B[p], B[c]] = [B[c], B[p]]; }
    for (let r = 0; r < n; r++) { if (r === c) continue; const f = A[r][c] / A[c][c]; if (!f) continue; for (let j = c; j < n; j++) A[r][j] -= f * A[c][j]; for (let j = 0; j < m; j++) B[r][j] -= f * B[c][j]; }
  }
  for (let r = 0; r < n; r++) for (let j = 0; j < m; j++) B[r][j] /= A[r][r];
  return B;
}
const TtKT = (T, k) => { const n = k.length, m = T[0].length, KT = mat(n, m), R = mat(m, m);
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) { let s = 0; for (let l = 0; l < n; l++) s += k[i][l] * T[l][j]; KT[i][j] = s; }
  for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) { let s = 0; for (let l = 0; l < n; l++) s += T[l][i] * KT[l][j]; R[i][j] = s; }
  return R; };
const Ttv = (T, v) => { const m = T[0].length, r = zeros(m); for (let j = 0; j < m; j++) { let s = 0; for (let l = 0; l < v.length; l++) s += T[l][j] * v[l]; r[j] = s; } return r; };
const Tv = (T, v) => { const n = T.length, r = zeros(n); for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < v.length; j++) s += T[i][j] * v[j]; r[i] = s; } return r; };

/* ------------------------------------------------- macierze elementu (lokalne) */
// kolejność DOF lokalnych: [u1, v1, φ1, u2, v2, φ2] w układzie prawoskrętnym (x̄, ȳ = obrót x̄ o +90°), φ – przeciwnie do wskazówek
// GA – sztywność na ścinanie (κ·G·A); 0 / brak – belka Eulera–Bernoulliego, > 0 – belka Timoshenki (Φ = 12EI/(GA·L²))
function kLocal(EA, EI, L, GA) {
  const k = mat(6, 6), a = EA / L, ph = GA > 0 ? 12 * EI / (GA * L * L) : 0, b = EI / (L * L * L * (1 + ph));
  k[0][0] = a; k[0][3] = -a; k[3][0] = -a; k[3][3] = a;
  const B = [[12, 6 * L, -12, 6 * L], [6 * L, (4 + ph) * L * L, -6 * L, (2 - ph) * L * L], [-12, -6 * L, 12, -6 * L], [6 * L, (2 - ph) * L * L, -6 * L, (4 + ph) * L * L]];
  const id = [1, 2, 4, 5];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) k[id[i]][id[j]] = b * B[i][j];
  return k;
}
function kgLocal(N, L) {
  const k = mat(6, 6), c = N / (30 * L);
  const B = [[36, 3 * L, -36, 3 * L], [3 * L, 4 * L * L, -3 * L, -L * L], [-36, -3 * L, 36, -3 * L], [3 * L, -L * L, -3 * L, 4 * L * L]];
  const id = [1, 2, 4, 5];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) k[id[i]][id[j]] = c * B[i][j];
  return k;
}
// funkcje kształtu Hermite'a i ich pochodne w punkcie a ∈ [0, L]
function herm(a, L) {
  const x = a / L, x2 = x * x, x3 = x2 * x;
  return { N: [1 - 3 * x2 + 2 * x3, L * (x - 2 * x2 + x3), 3 * x2 - 2 * x3, L * (-x2 + x3)],
    dN: [(-6 * x + 6 * x2) / L, 1 - 4 * x + 3 * x2, (6 * x - 6 * x2) / L, -2 * x + 3 * x2] };
}
const GP = [[-0.7745966692414834, 0.5555555555555556], [0, 0.8888888888888888], [0.7745966692414834, 0.5555555555555556]];
// zastępcze obciążenia węzłowe f_eq (lokalne, 6) od obciążeń podelementu; obciążenia: {t:'q', x1, x2, px1, px2, py1, py2} | {t:'P', a, px, py} | {t:'M', a, m} | {t:'T', e0, k0}
function feq(loads, L, EA, EI) {
  const f = zeros(6);
  loads.forEach(ld => {
    if (ld.t === 'q') {
      const a = Math.max(0, ld.x1), b = Math.min(L, ld.x2); if (!(b - a > 1e-12)) return;
      const span = ld.x2 - ld.x1;
      const lin = (v1, v2, x) => span > 0 ? v1 + (v2 - v1) * (x - ld.x1) / span : v1;
      GP.forEach(([g, w]) => {
        const x = (a + b) / 2 + g * (b - a) / 2, wt = w * (b - a) / 2, h = herm(x, L);
        const px = lin(ld.px1 || 0, ld.px2 || 0, x), py = lin(ld.py1 || 0, ld.py2 || 0, x);
        f[0] += (1 - x / L) * px * wt; f[3] += (x / L) * px * wt;
        f[1] += h.N[0] * py * wt; f[2] += h.N[1] * py * wt; f[4] += h.N[2] * py * wt; f[5] += h.N[3] * py * wt;
      });
    } else if (ld.t === 'P') {
      const h = herm(ld.a, L);
      f[0] += (1 - ld.a / L) * (ld.px || 0); f[3] += (ld.a / L) * (ld.px || 0);
      f[1] += h.N[0] * (ld.py || 0); f[2] += h.N[1] * (ld.py || 0); f[4] += h.N[2] * (ld.py || 0); f[5] += h.N[3] * (ld.py || 0);
    } else if (ld.t === 'M') {
      const h = herm(ld.a, L);
      f[1] += h.dN[0] * ld.m; f[2] += h.dN[1] * ld.m; f[4] += h.dN[2] * ld.m; f[5] += h.dN[3] * ld.m;
    } else if (ld.t === 'T') {
      // e0 – odkształcenie swobodne osi (α·ΔT), k0 – krzywizna swobodna v'' (−α·ΔT_d/h)
      f[0] += -EA * (ld.e0 || 0); f[3] += EA * (ld.e0 || 0);
      f[2] += -EI * (ld.k0 || 0); f[5] += EI * (ld.k0 || 0);
    }
  });
  return f;
}

/* ------------------------------------------------------------ model analizy */
// am = { nodes:[{x,z}], els:[{n1,n2,EA,EI,GA,rel:[kφ1,kφ2] (null – sztywno, 0 – przegub, >0 – podatność kNm/rad), nsub}], sups:[{node, ux,uz,ry, kx,kz,kr, ang}] }
F.build = function (am) {
  const nodes = am.nodes.map(n => ({ x: n.x, z: n.z }));
  const subs = [];        // podelementy
  const elInfo = [];
  am.els.forEach((e, ei) => {
    const a = am.nodes[e.n1], b = am.nodes[e.n2];
    const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz);
    if (!(L > 1e-9)) throw new Error(`Pręt ${e.label || ei + 1} ma zerową długość.`);
    const c = dx / L, s = dz / L, ns = Math.max(1, Math.round(e.nsub || 1));
    const ids = [e.n1];
    for (let k = 1; k < ns; k++) { nodes.push({ x: a.x + dx * k / ns, z: a.z + dz * k / ns, sub: ei }); ids.push(nodes.length - 1); }
    ids.push(e.n2);
    const first = subs.length;
    for (let k = 0; k < ns; k++) {
      const r1 = k === 0 && e.rel ? e.rel[0] : null, r2 = k === ns - 1 && e.rel ? e.rel[1] : null;
      subs.push({ el: ei, k, n1: ids[k], n2: ids[k + 1], L: L / ns, x0: L * k / ns, c, s, EA: e.EA, EI: e.EI, GA: e.GA || 0, r1, r2 });
    }
    elInfo.push({ L, c, s, ns, first, ids });
  });
  const nn = nodes.length;
  // numeracja węzłów (odwrotny Cuthill–McKee) – mała szerokość pasma
  const adj = Array.from({ length: nn }, () => new Set());
  subs.forEach(q => { adj[q.n1].add(q.n2); adj[q.n2].add(q.n1); });
  const order = rcm(adj);
  const pos = new Int32Array(nn); order.forEach((n, i) => { pos[n] = i; });
  // przygotowanie podelementów: macierze lokalne skondensowane
  subs.forEach(q => prepSub(q));
  return { nodes, subs, elInfo, nn, pos, sups: am.sups || [], am };
};
function rcm(adj) {
  const n = adj.length, deg = adj.map(s => s.size), seen = new Uint8Array(n), out = [];
  const byDeg = Array.from({ length: n }, (_, i) => i).sort((a, b) => deg[a] - deg[b]);
  for (const s0 of byDeg) {
    if (seen[s0]) continue;
    const q = [s0]; seen[s0] = 1;
    while (q.length) { const v = q.shift(); out.push(v); Array.from(adj[v]).filter(w => !seen[w]).sort((a, b) => deg[a] - deg[b]).forEach(w => { seen[w] = 1; q.push(w); }); }
  }
  return out.reverse();
}
// macierz lokalna z uwzględnieniem połączeń podatnych / przegubów na końcach (kondensacja dodatkowych DOF obrotu końca pręta)
function prepSub(q) {
  const k6 = kLocal(q.EA, q.EI, q.L, q.GA);
  const extra = [];
  if (q.r1 !== null && q.r1 !== undefined) extra.push({ at: 2, k: q.r1 });
  if (q.r2 !== null && q.r2 !== undefined) extra.push({ at: 5, k: q.r2 });
  if (!extra.length) { q.T = null; q.k = k6; return; }
  // rozszerzony wektor: [u1, v1, φ1(węzeł), u2, v2, φ2(węzeł), θe…] – element pracuje na θe, sprężyna łączy φ węzła z θe
  const n = 6 + extra.length, K = mat(n, n);
  const map = [0, 1, 2, 3, 4, 5];
  extra.forEach((x, i) => { map[x.at] = 6 + i; });
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) K[map[i]][map[j]] += k6[i][j];
  extra.forEach((x, i) => { const a = x.at, b = 6 + i, kk = Math.max(0, x.k); K[a][a] += kk; K[b][b] += kk; K[a][b] -= kk; K[b][a] -= kk; });
  // przegub pełny (k = 0) – brak sprzężenia; drobna sztywność numeryczna wiersza θe nie jest potrzebna (k_θθ elementu > 0)
  const T = condense(K, [0, 1, 2, 3, 4, 5]);
  q.Kx = K; q.map = map; q.T = T; q.k = TtKT(T, K);
}
// macierz transformacji lokalne → globalne dla DOF [ux, uz, φ]: u_lok = R·u_glob
function rot(c, s) { return [[c, s, 0], [-s, c, 0], [0, 0, 1]]; }
function toGlobal(kl, c, s) {
  const R = rot(c, s), K = mat(6, 6), KR = mat(6, 6);
  const Rb = (i, j) => (Math.floor(i / 3) === Math.floor(j / 3) ? R[i % 3][j % 3] : 0);
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) { let v = 0; for (let l = 0; l < 6; l++) v += kl[i][l] * Rb(l, j); KR[i][j] = v; }
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) { let v = 0; for (let l = 0; l < 6; l++) v += Rb(l, i) * KR[l][j]; K[i][j] = v; }
  return K;
}
const vecToLocal = (v, c, s) => [c * v[0] + s * v[1], -s * v[0] + c * v[1], v[2], c * v[3] + s * v[4], -s * v[3] + c * v[4], v[5]];
const vecToGlobal = (v, c, s) => [c * v[0] - s * v[1], s * v[0] + c * v[1], v[2], c * v[3] - s * v[4], s * v[3] + c * v[4], v[5]];

/* ------------------------------------------------- macierz profilowa (skyline) LDLᵀ */
function Skyline(n) { this.n = n; this.first = new Int32Array(n).fill(n); }
Skyline.prototype.touch = function (i, j) { const r = Math.min(i, j), c = Math.max(i, j); if (r < this.first[c]) this.first[c] = r; };
Skyline.prototype.alloc = function () {
  const n = this.n; this.ptr = new Int32Array(n + 1);
  for (let j = 0; j < n; j++) { if (this.first[j] > j) this.first[j] = j; this.ptr[j + 1] = this.ptr[j] + (j - this.first[j] + 1); }
  this.a = new Float64Array(this.ptr[n]);
};
Skyline.prototype.idx = function (i, j) { const r = Math.min(i, j), c = Math.max(i, j); if (r < this.first[c]) return -1; return this.ptr[c] + (r - this.first[c]); };
Skyline.prototype.add = function (i, j, v) { const k = this.idx(i, j); if (k >= 0) this.a[k] += v; };
Skyline.prototype.get = function (i, j) { const k = this.idx(i, j); return k >= 0 ? this.a[k] : 0; };
Skyline.prototype.clone = function () { const s = new Skyline(this.n); s.first = this.first; s.ptr = this.ptr; s.a = Float64Array.from(this.a); return s; };
// rozkład LDLᵀ w miejscu (kolumnami); zwraca informację o osobliwości (najmniejszy względny element osiowy)
Skyline.prototype.factor = function () {
  const n = this.n, a = this.a, ptr = this.ptr, first = this.first, d0 = new Float64Array(n);
  for (let j = 0; j < n; j++) d0[j] = Math.abs(a[ptr[j] + j - first[j]]);
  let minRel = Infinity, minAt = -1, neg = 0;
  for (let j = 0; j < n; j++) {
    const fj = first[j], pj = ptr[j];
    // g_ij = a_ij − Σ_{k<i} l_ki · g_kj   (dla i < j), następnie l_ij = g_ij / d_i
    for (let i = fj; i < j; i++) {
      const fi = first[i], pi = ptr[i], k0 = Math.max(fi, fj);
      let s = a[pj + i - fj];
      for (let k = k0; k < i; k++) s -= a[pi + k - fi] * a[pj + k - fj];
      a[pj + i - fj] = s;
    }
    let dj = a[pj + j - fj];
    for (let k = fj; k < j; k++) { const g = a[pj + k - fj], dk = a[ptr[k] + k - first[k]]; const l = g / dk; dj -= l * g; a[pj + k - fj] = l; }
    const rel = Math.abs(dj) / (d0[j] || 1);
    if (rel < minRel) { minRel = rel; minAt = j; }
    if (dj < 0) neg++;
    if (!(Math.abs(dj) > 1e-12 * (d0[j] || 1))) { this.sing = true; this.singAt = this.singAt === undefined ? j : this.singAt; dj = d0[j] || 1; }
    a[pj + j - fj] = dj;
  }
  this.minRel = minRel; this.minAt = minAt; this.neg = neg;
  return this;
};
Skyline.prototype.solve = function (b) {
  const n = this.n, a = this.a, ptr = this.ptr, first = this.first, x = Float64Array.from(b);
  for (let j = 0; j < n; j++) { const fj = first[j], pj = ptr[j]; let s = x[j]; for (let k = fj; k < j; k++) s -= a[pj + k - fj] * x[k]; x[j] = s; }
  for (let j = 0; j < n; j++) x[j] /= a[ptr[j] + j - first[j]];
  for (let j = n - 1; j >= 0; j--) { const fj = first[j], pj = ptr[j], xj = x[j]; for (let k = fj; k < j; k++) x[k] -= a[pj + k - fj] * xj; }
  return x;
};

/* ------------------------------------------------- przygotowanie układu równań */
// DOF globalny węzła n: 3·pos[n] + {0,1,2}
F.system = function (M) {
  const nd = 3 * M.nn, dofOf = (n, k) => 3 * M.pos[n] + k;
  // więzy sztywne (eliminacja) i sprężyny / podpory ukośne (kara)
  const fixed = new Uint8Array(nd), springs = [];
  M.sups.forEach(sp => {
    const n = sp.node, ang = (sp.ang || 0) * Math.PI / 180;
    if (Math.abs(ang) < 1e-9) {
      if (sp.ux) fixed[dofOf(n, 0)] = 1; else if (sp.kx > 0) springs.push({ d: [dofOf(n, 0)], v: [1], k: sp.kx });
      if (sp.uz) fixed[dofOf(n, 1)] = 1; else if (sp.kz > 0) springs.push({ d: [dofOf(n, 1)], v: [1], k: sp.kz });
    } else {
      // osie podpory obrócone o kąt ang: kierunek „x̃” = (cos, sin), „z̃” = (−sin, cos)
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const dirs = [[sp.ux, sp.kx, [ca, sa]], [sp.uz, sp.kz, [-sa, ca]]];
      dirs.forEach(([rig, kk, v]) => { if (rig) springs.push({ d: [dofOf(n, 0), dofOf(n, 1)], v, k: 'pen' }); else if (kk > 0) springs.push({ d: [dofOf(n, 0), dofOf(n, 1)], v, k: kk }); });
    }
    if (sp.ry) fixed[dofOf(n, 2)] = 1; else if (sp.kr > 0) springs.push({ d: [dofOf(n, 2)], v: [1], k: sp.kr });
  });
  // obroty węzłów bez sztywności obrotowej (wszystkie pręty z przegubem) – blokowane (nieokreślone)
  const rotK = new Float64Array(M.nn);
  M.subs.forEach(q => { rotK[q.n1] += Math.abs(q.k[2][2]); rotK[q.n2] += Math.abs(q.k[5][5]); });
  springs.forEach(sp => { if (sp.d.length === 1 && sp.d[0] % 3 === 2) { /* sprężyna obrotowa */ } });
  const rotSpring = new Uint8Array(M.nn); M.sups.forEach(sp => { if (sp.kr > 0 || sp.ry) rotSpring[sp.node] = 1; });
  const freeRot = [];
  for (let n = 0; n < M.nn; n++) { const d = dofOf(n, 2); if (!fixed[d] && !rotSpring[n] && !(rotK[n] > 0)) { fixed[d] = 1; freeRot.push(n); } }
  // numeracja równań
  const eq = new Int32Array(nd).fill(-1); let ne = 0;
  for (let d = 0; d < nd; d++) if (!fixed[d]) eq[d] = ne++;
  const sky = new Skyline(ne);
  const elDofs = q => [dofOf(q.n1, 0), dofOf(q.n1, 1), dofOf(q.n1, 2), dofOf(q.n2, 0), dofOf(q.n2, 1), dofOf(q.n2, 2)];
  M.subs.forEach(q => { const ds = elDofs(q).map(d => eq[d]).filter(e => e >= 0); ds.forEach(i => ds.forEach(j => sky.touch(i, j))); });
  springs.forEach(sp => { const ds = sp.d.map(d => eq[d]).filter(e => e >= 0); ds.forEach(i => ds.forEach(j => sky.touch(i, j))); });
  sky.alloc();
  return { nd, dofOf, fixed, springs, eq, ne, sky, elDofs, freeRot };
};
// składanie macierzy sztywności (K) ewentualnie z macierzą geometryczną od sił N (Nsub – siła w podelementach)
F.assemble = function (M, Sy, Nsub, onlyKg) {
  const K = Sy.sky.clone(); K.a.fill(0);
  let maxD = 0;
  M.subs.forEach((q, i) => {
    let kl = onlyKg ? null : q.k;
    if (Nsub && Nsub[i]) {
      let kg = kgLocal(Nsub[i], q.L);
      if (q.T) kg = TtKT(q.T, expandKg(kg, q));
      kl = kl ? kl.map((r, a) => r.map((v, b) => v + kg[a][b])) : kg;
    }
    if (!kl) return;
    const kgl = toGlobal(kl, q.c, q.s), ds = Sy.elDofs(q).map(d => Sy.eq[d]);
    for (let a = 0; a < 6; a++) { if (ds[a] < 0) continue; for (let b = a; b < 6; b++) { if (ds[b] < 0) continue; const v = kgl[a][b]; if (v) K.add(ds[a], ds[b], v); } }
  });
  if (!onlyKg) {
    for (let j = 0; j < K.n; j++) maxD = Math.max(maxD, Math.abs(K.get(j, j)));
    const pen = 1e8 * (maxD || 1);
    Sy.pen = pen;
    Sy.springs.forEach(sp => {
      const kk = sp.k === 'pen' ? pen : sp.k;
      sp.d.forEach((da, a) => sp.d.forEach((db, b) => { const ea = Sy.eq[da], eb = Sy.eq[db]; if (ea >= 0 && eb >= 0 && ea <= eb) K.add(ea, eb, kk * sp.v[a] * sp.v[b] * (ea === eb && a !== b ? 2 : 1)); }));
    });
  }
  return K;
};
// macierz geometryczna w układzie rozszerzonym (DOF θe na końcach z połączeniem podatnym)
function expandKg(kg, q) {
  const n = q.Kx.length, K = mat(n, n);
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) K[q.map[i]][q.map[j]] += kg[i][j];
  return K;
}

/* ------------------------------------------------- obciążenia przypadku */
// lc = { nodal:[{node,Fx,Fz,M}], el:[{el, loads:[…lokalne, x w m od początku pręta]}], settle:[{node, ux, uz, ry}] }
function subLoads(M, lc) {
  const per = M.subs.map(() => []);
  (lc.el || []).forEach(g => {
    const info = M.elInfo[g.el]; if (!info) return;
    g.loads.forEach(ld => {
      for (let k = 0; k < info.ns; k++) {
        const qi = info.first + k, q = M.subs[qi], x0 = q.x0, x1 = q.x0 + q.L, last = k === info.ns - 1;
        if (ld.t === 'q') {
          const a = Math.max(ld.x1, x0), b = Math.min(ld.x2, x1); if (!(b - a > 1e-9)) continue;
          per[qi].push({ t: 'q', x1: ld.x1 - x0, x2: ld.x2 - x0, px1: ld.px1, px2: ld.px2, py1: ld.py1, py2: ld.py2, clipA: a - x0, clipB: b - x0 });
        } else if (ld.t === 'P' || ld.t === 'M') {
          if (ld.a >= x0 - 1e-9 && (ld.a < x1 - 1e-9 || last)) { per[qi].push(Object.assign({}, ld, { a: Math.min(q.L, Math.max(0, ld.a - x0)) })); break; }
        } else if (ld.t === 'T') per[qi].push(ld);
      }
    });
  });
  // obciążenie rozłożone obcięte do podelementu – przeliczenie wartości na granicach (lokalna liniowość zachowana)
  per.forEach(list => list.forEach(ld => {
    if (ld.t !== 'q') return;
    const span = ld.x2 - ld.x1, lin = (v1, v2, x) => span > 0 ? (v1 || 0) + ((v2 || 0) - (v1 || 0)) * (x - ld.x1) / span : (v1 || 0);
    const a = ld.clipA, b = ld.clipB;
    Object.assign(ld, { px1: lin(ld.px1, ld.px2, a), px2: lin(ld.px1, ld.px2, b), py1: lin(ld.py1, ld.py2, a), py2: lin(ld.py1, ld.py2, b), x1: a, x2: b });
    delete ld.clipA; delete ld.clipB;
  }));
  return per;
}
F.loadVector = function (M, Sy, lc) {
  const R = new Float64Array(Sy.ne), Fall = new Float64Array(Sy.nd);
  (lc.nodal || []).forEach(p => { const n = p.node; Fall[Sy.dofOf(n, 0)] += p.Fx || 0; Fall[Sy.dofOf(n, 1)] += p.Fz || 0; Fall[Sy.dofOf(n, 2)] += p.M || 0; });
  const per = subLoads(M, lc), fe = [];
  M.subs.forEach((q, i) => {
    let f = per[i].length ? feq(per[i], q.L, q.EA, q.EI) : null;
    if (f && q.T) f = Ttv(q.T, expandF(f, q));
    fe.push(f);
    if (!f) return;
    const g = vecToGlobal(f, q.c, q.s), ds = Sy.elDofs(q);
    for (let a = 0; a < 6; a++) Fall[ds[a]] += g[a];
  });
  // przemieszczenia wymuszone
  const pres = new Float64Array(Sy.nd);
  (lc.settle || []).forEach(s => { if (s.ux) pres[Sy.dofOf(s.node, 0)] = s.ux; if (s.uz) pres[Sy.dofOf(s.node, 1)] = s.uz; if (s.ry) pres[Sy.dofOf(s.node, 2)] = s.ry; });
  const hasPres = pres.some(v => v !== 0);
  if (hasPres) {
    M.subs.forEach(q => {
      const ds = Sy.elDofs(q), up = ds.map(d => pres[d]); if (!up.some(v => v)) return;
      const kg = toGlobal(q.k, q.c, q.s);
      for (let a = 0; a < 6; a++) { if (Sy.fixed[ds[a]]) continue; let s = 0; for (let b = 0; b < 6; b++) if (Sy.fixed[ds[b]]) s += kg[a][b] * up[b]; Fall[ds[a]] -= s; }
    });
  }
  for (let d = 0; d < Sy.nd; d++) if (Sy.eq[d] >= 0) R[Sy.eq[d]] += Fall[d];
  return { R, per, fe, pres, Fall };
};
function expandF(f, q) { const v = new Float64Array(q.Kx.length); for (let i = 0; i < 6; i++) v[q.map[i]] += f[i]; return v; }

/* ------------------------------------------------- wyniki */
// przemieszczenia wszystkich DOF z rozwiązania układu
function fullU(Sy, x, pres) { const u = new Float64Array(Sy.nd); for (let d = 0; d < Sy.nd; d++) u[d] = Sy.eq[d] >= 0 ? x[Sy.eq[d]] : (pres ? pres[d] : 0); return u; }
// siły na końcach podelementów (lokalne, siły węzłów działające na element) + przemieszczenia lokalne
function endForces(M, Sy, u, L, Nsub) {
  return M.subs.map((q, i) => {
    const ds = Sy.elDofs(q), ug = ds.map(d => u[d]), ul = vecToLocal(ug, q.c, q.s);
    let k = q.k;
    if (Nsub && Nsub[i]) { let kg = kgLocal(Nsub[i], q.L); if (q.T) kg = TtKT(q.T, expandKg(kg, q)); k = k.map((r, a) => r.map((v, b) => v + kg[a][b])); }
    const f = zeros(6); for (let a = 0; a < 6; a++) { let s = 0; for (let b = 0; b < 6; b++) s += k[a][b] * ul[b]; f[a] = s - (L.fe[i] ? L.fe[i][a] : 0); }
    // obroty końców elementu (przy przegubie – obrót pręta, nie węzła)
    let th1 = ul[2], th2 = ul[5];
    if (q.T) {
      const ext = Tv(q.T, ul);
      // uzupełnienie o część od obciążenia: θe = k_rr⁻¹ (f_r − k_ro u_o) – rozwiązanie rozszerzone
      const n = q.Kx.length, fx = L.fe[i] ? expandF(feqRaw(L.per[i], q), q) : new Float64Array(n);
      const rem = []; for (let r = 6; r < n; r++) rem.push(r);
      const Krr = rem.map(a => rem.map(b => q.Kx[a][b])), rhs = rem.map(a => { let s = fx[a]; for (let b = 0; b < 6; b++) s -= q.Kx[a][b] * ul[b]; return [s]; });
      const th = solveDense(Krr, rhs, true);
      rem.forEach((r, j) => { ext[r] = th ? th[j][0] : ext[r]; });
      if (q.map[2] >= 6) th1 = ext[q.map[2]];
      if (q.map[5] >= 6) th2 = ext[q.map[5]];
    }
    return { f, ul, th1, th2 };
  });
}
function feqRaw(list, q) { return list && list.length ? feq(list, q.L, q.EA, q.EI) : new Float64Array(6); }

// wartości N, V, M w punkcie x (lokalnym podelementu) z sił końcowych i obciążeń
function forcesAt(q, f, list, x) {
  let N = -f[0], V = f[1], Mm = -f[2] + x * f[1];
  (list || []).forEach(ld => {
    if (ld.t === 'q') {
      const a = Math.max(0, ld.x1), b = Math.min(x, ld.x2); if (!(b > a)) return;
      const span = ld.x2 - ld.x1, lin = (v1, v2, t) => span > 0 ? (v1 || 0) + ((v2 || 0) - (v1 || 0)) * (t - ld.x1) / span : (v1 || 0);
      // całki z funkcji liniowej p(t) na [a, b]: ∫p, ∫(x − t)p
      const pa = lin(ld.py1, ld.py2, a), pb = lin(ld.py1, ld.py2, b), qa = lin(ld.px1, ld.px2, a), qb = lin(ld.px1, ld.px2, b), h = b - a;
      V += (pa + pb) / 2 * h; N -= (qa + qb) / 2 * h;
      Mm += h * h * (pa / 3 + pb / 6) + (x - b) * (pa + pb) / 2 * h;   // ∫_a^b (x−t) p(t) dt
    } else if (ld.t === 'P') { if (ld.a < x - 1e-12 || (ld.a <= x + 1e-12 && ld._incl)) { V += ld.py || 0; N -= ld.px || 0; Mm += (x - ld.a) * (ld.py || 0); } }
    else if (ld.t === 'M') { if (ld.a < x - 1e-12 || (ld.a <= x + 1e-12 && ld._incl)) Mm -= ld.m; }
  });
  return { N, V, M: Mm };
}

/* ------------------------------------------------- rozwiązanie przypadku / kombinacji */
F.Analysis = function (am) {
  const M = F.build(am), Sy = F.system(M);
  const K = F.assemble(M, Sy).factor();
  const A = { M, Sy, K, sing: !!K.sing };
  if (K.sing) A.singInfo = singInfo(M, Sy, K.singAt);
  return A;
};
function singInfo(M, Sy, e) {
  let d = -1; for (let i = 0; i < Sy.nd; i++) if (Sy.eq[i] === e) { d = i; break; }
  if (d < 0) return null;
  const pos = Math.floor(d / 3), k = d % 3; let node = -1; for (let n = 0; n < M.nn; n++) if (M.pos[n] === pos) { node = n; break; }
  const nd = M.nodes[node] || {};
  return { node: nd.sub !== undefined ? null : node, sub: nd.sub, dir: ['X', 'Z', 'φ'][k] };
}
// lc – obciążenia; opt.N – siły osiowe w podelementach dla P-Δ (tablica) → macierz K+KG
F.solveCase = function (A, lc, opt) {
  opt = opt || {};
  const { M, Sy } = A;
  const L = F.loadVector(M, Sy, lc);
  let Kf = A.K;
  if (opt.N) { Kf = F.assemble(M, Sy, opt.N).factor(); if (Kf.sing || Kf.neg > 0) return { unstable: true }; }
  const x = Kf.solve(L.R), u = fullU(Sy, x, L.pres);
  const ef = endForces(M, Sy, u, L, opt.N);
  return { u, ef, L, lc };
};
// siła N w podelementach (średnia)
F.axial = function (A, res) { return A.M.subs.map((q, i) => { const f = res.ef[i].f; return -(f[0] - f[3]) / 2; }); };
// analiza II rzędu (P-Δ z macierzą geometryczną): iteracja sił osiowych
F.solveP2 = function (A, lc, maxIt) {
  let r = F.solveCase(A, lc), it = 0, N = F.axial(A, r), conv = false;
  for (it = 0; it < (maxIt || 20); it++) {
    const r2 = F.solveCase(A, lc, { N });
    if (r2.unstable) return { unstable: true, it };
    const N2 = F.axial(A, r2);
    let dn = 0, nm = 1e-9; N2.forEach((v, i) => { dn = Math.max(dn, Math.abs(v - N[i])); nm = Math.max(nm, Math.abs(v)); });
    r = r2; N = N2;
    if (dn / nm < 1e-5) { conv = true; break; }
  }
  r.N = N; r.it = it + 1; r.conv = conv; r.p2 = true;
  return r;
};

/* ------------------------------------------------- wyboczenie: K φ = λ (−K_G) φ */
F.buckling = function (A, Nsub, nModes) {
  const { M, Sy } = A, n = Sy.ne;
  if (!n) return null;
  const KG = F.assemble(M, Sy, Nsub.map(v => -v), true);    // −K_G (dodatnio określona dla ściskania)
  const mulKG = (x) => { const y = new Float64Array(n), a = KG.a, ptr = KG.ptr, first = KG.first;
    for (let j = 0; j < n; j++) { const fj = first[j], pj = ptr[j]; for (let i = fj; i < j; i++) { const v = a[pj + i - fj]; y[i] += v * x[j]; y[j] += v * x[i]; } y[j] += a[pj + j - fj] * x[j]; }
    return y; };
  const nm = Math.max(1, nModes || 1), q = Math.min(n, Math.max(2 * nm, nm + 6));
  // wektory startowe: losowe (deterministyczne) + przekątna KG
  let seed = 12345; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff - 0.5; };
  let X = []; for (let k = 0; k < q; k++) { const v = new Float64Array(n); for (let i = 0; i < n; i++) v[i] = rnd() + (k === 0 ? Math.abs(KG.get(i, i)) : 0); X.push(v); }
  let lam = null, prev = null, vecs = null;
  const mulK = (x) => { const y = new Float64Array(n), K0 = A.Kraw || (A.Kraw = F.assemble(M, Sy)); const a = K0.a, ptr = K0.ptr, first = K0.first;
    for (let j = 0; j < n; j++) { const fj = first[j], pj = ptr[j]; for (let i = fj; i < j; i++) { const v = a[pj + i - fj]; y[i] += v * x[j]; y[j] += v * x[i]; } y[j] += a[pj + j - fj] * x[j]; }
    return y; };
  for (let it = 0; it < 60; it++) {
    const Y = X.map(x => A.K.solve(mulKG(x)));
    // Rayleigh–Ritz: (Yᵀ KG Y) z = μ (Yᵀ K Y) z,  μ = 1/λ
    const KY = Y.map(mulK), GY = Y.map(mulKG);
    const Kr = mat(q, q), Gr = mat(q, q);
    for (let a = 0; a < q; a++) for (let b = 0; b < q; b++) { let s1 = 0, s2 = 0; for (let i = 0; i < n; i++) { s1 += Y[a][i] * KY[b][i]; s2 += Y[a][i] * GY[b][i]; } Kr[a][b] = s1; Gr[a][b] = s2; }
    const eg = genEig(Gr, Kr); if (!eg) break;
    // największe dodatnie μ → najmniejsze dodatnie λ
    const order = eg.val.map((v, i) => i).sort((a, b) => eg.val[b] - eg.val[a]);
    X = order.map(j => { const v = new Float64Array(n); for (let a = 0; a < q; a++) { const c = eg.vec[a][j]; if (c) for (let i = 0; i < n; i++) v[i] += c * Y[a][i]; } return v; });
    lam = order.map(j => (eg.val[j] > 1e-14 ? 1 / eg.val[j] : Infinity)).slice(0, nm);
    vecs = X.slice(0, nm);
    if (prev && lam.every((l, i) => Math.abs(l - prev[i]) <= 1e-7 * Math.abs(l))) break;
    prev = lam;
    X.forEach(v => { let m = 0; for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(v[i])); if (m > 0) for (let i = 0; i < n; i++) v[i] /= m; });
  }
  if (!lam) return null;
  return lam.map((l, k) => ({ alpha: l, u: (() => { const u = new Float64Array(Sy.nd); let m = 0; for (let d = 0; d < Sy.nd; d++) if (Sy.eq[d] >= 0) { u[d] = vecs[k][Sy.eq[d]]; if (d % 3 !== 2) m = Math.max(m, Math.abs(u[d])); } if (m > 0) for (let d = 0; d < Sy.nd; d++) u[d] /= m; return u; })() }));
};
// uogólnione symetryczne zagadnienie własne A z = μ B z (B dodatnio określona) – redukcja Choleskiego + Jacobi
function genEig(Am, Bm) {
  const n = Am.length, L = mat(n, n);
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let s = Bm[i][j]; for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
    if (i === j) { if (!(s > 0)) return null; L[i][i] = Math.sqrt(s); } else L[i][j] = s / L[j][j];
  }
  // C = L⁻¹ A L⁻ᵀ
  const Li = mat(n, n); for (let i = 0; i < n; i++) { Li[i][i] = 1 / L[i][i]; for (let j = 0; j < i; j++) { let s = 0; for (let k = j; k < i; k++) s -= L[i][k] * Li[k][j]; Li[i][j] = s / L[i][i]; } }
  const C = mat(n, n), T = mat(n, n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { let s = 0; for (let k = 0; k < n; k++) s += Li[i][k] * Am[k][j]; T[i][j] = s; }
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { let s = 0; for (let k = 0; k < n; k++) s += T[i][k] * Li[j][k]; C[i][j] = s; }
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const v = (C[i][j] + C[j][i]) / 2; C[i][j] = v; C[j][i] = v; }
  const J = jacobi(C);
  // z = L⁻ᵀ y
  const vec = mat(n, n); for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < n; j++) s += Li[j][i] * J.vec[j][k]; vec[i][k] = s; }
  return { val: J.val, vec };
}
function jacobi(S0) {
  const n = S0.length, a = S0.map(r => Array.from(r)), v = mat(n, n); for (let i = 0; i < n; i++) v[i][i] = 1;
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] * a[i][j];
    if (off < 1e-30) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(a[p][q]) < 1e-300) continue;
      const th = (a[q][q] - a[p][p]) / (2 * a[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
      for (let k = 0; k < n; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < n; k++) { const vkp = v[k][p], vkq = v[k][q]; v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq; }
    }
  }
  return { val: a.map((r, i) => r[i]), vec: v };
}

/* ------------------------------------------------- wyniki prętów (stacje) */
// stacje pręta: x [m] wzdłuż pręta; dla każdej: N, V, M, przemieszczenia lokalne (u, w) – w > 0 w stronę z̄ (spód)
F.memberResults = function (A, res, ei, xsExtra) {
  const { M } = A, info = M.elInfo[ei], out = [];
  const xs = new Set();
  for (let k = 0; k < info.ns; k++) { const q = M.subs[info.first + k]; [0, 0.25, 0.5, 0.75].forEach(t => xs.add(+(q.x0 + t * q.L).toFixed(9))); }
  xs.add(+info.L.toFixed(9));
  (xsExtra || []).forEach(x => { if (x > 1e-9 && x < info.L - 1e-9) xs.add(+x.toFixed(9)); });
  const list = Array.from(xs).sort((a, b) => a - b);
  const jumps = new Set((xsExtra || []).map(x => +x.toFixed(9)));
  list.forEach(x => {
    const both = jumps.has(x) && x > 1e-9 && x < info.L - 1e-9;
    (both ? [false, true] : [null]).forEach(right => out.push(evalAt(A, res, ei, x, right)));
  });
  return out;
};
function evalAt(A, res, ei, x, right) {
  const { M } = A, info = M.elInfo[ei];
  let k = Math.min(info.ns - 1, Math.max(0, Math.floor(x / (info.L / info.ns) + 1e-9)));
  if (right === false && k > 0 && Math.abs(x - M.subs[info.first + k].x0) < 1e-9) k--;
  const qi = info.first + k, q = M.subs[qi], xl = Math.min(q.L, Math.max(0, x - q.x0)), r = res.ef[qi];
  const list = (res.L.per[qi] || []).map(ld => (ld.t === 'P' || ld.t === 'M') && right && Math.abs(ld.a - xl) < 1e-9 ? Object.assign({}, ld, { _incl: true }) : ld);
  const fr = forcesAt(q, r.f, list, xl);
  // przemieszczenia: Hermite z obrotów końców elementu (przegub – obrót pręta)
  const ul = r.ul, h = herm(xl, q.L), t = xl / q.L;
  const v = h.N[0] * ul[1] + h.N[1] * r.th1 + h.N[2] * ul[4] + h.N[3] * r.th2;
  const u = (1 - t) * ul[0] + t * ul[3];
  // P-Δ: moment w podelementie z uwzględnieniem ugięcia między węzłami (N·Δv) – ujęty przez podział pręta
  return { x, N: fr.N, V: fr.V, M: fr.M, u, w: -v, gx: q.c * u - q.s * v, gz: q.s * u + q.c * v };
}
// reakcje podporowe: Σ sił końcowych (globalnie) w węźle − obciążenie węzłowe
F.reactions = function (A, res) {
  const { M, Sy } = A, R = {};
  const acc = new Float64Array(Sy.nd);
  M.subs.forEach((q, i) => { const g = vecToGlobal(res.ef[i].f, q.c, q.s), ds = Sy.elDofs(q); for (let a = 0; a < 6; a++) acc[ds[a]] += g[a]; });
  // obciążenia węzłowe przypadku
  const P = new Float64Array(Sy.nd); (res.L && res.L.Fall) && (() => { /* Fall zawiera też zastępcze obciążenia elementów – odtwarzamy tylko węzłowe */ })();
  (res.lc && res.lc.nodal || []).forEach(p => { P[Sy.dofOf(p.node, 0)] += p.Fx || 0; P[Sy.dofOf(p.node, 1)] += p.Fz || 0; P[Sy.dofOf(p.node, 2)] += p.M || 0; });
  M.sups.forEach(sp => { const n = sp.node; R[n] = [0, 1, 2].map(k => acc[Sy.dofOf(n, k)] - P[Sy.dofOf(n, k)]); });
  return R;
};
F.nodeDisp = (A, res, n) => [0, 1, 2].map(k => res.u[A.Sy.dofOf(n, k)]);

/* ------------------------------------------------- kombinacja liniowa wyników */
F.combine = function (A, list) {   // list: [{res, f}]
  const nd = A.Sy.nd, u = new Float64Array(nd);
  const ef = A.M.subs.map(() => ({ f: zeros(6), ul: zeros(6), th1: 0, th2: 0 }));
  const per = A.M.subs.map(() => []);
  const nodal = [];
  list.forEach(({ res, f }) => {
    if (!f) return;
    for (let d = 0; d < nd; d++) u[d] += f * res.u[d];
    res.ef.forEach((e, i) => { for (let a = 0; a < 6; a++) { ef[i].f[a] += f * e.f[a]; ef[i].ul[a] += f * e.ul[a]; } ef[i].th1 += f * e.th1; ef[i].th2 += f * e.th2; });
    res.L.per.forEach((pl, i) => pl.forEach(ld => per[i].push(scaleLoad(ld, f))));
    (res.lc && res.lc.nodal || []).forEach(p => nodal.push({ node: p.node, Fx: f * (p.Fx || 0), Fz: f * (p.Fz || 0), M: f * (p.M || 0) }));
  });
  return { u, ef, L: { per }, lc: { nodal } };
};
function scaleLoad(ld, f) {
  const o = Object.assign({}, ld);
  ['px1', 'px2', 'py1', 'py2', 'px', 'py', 'm', 'e0', 'k0'].forEach(k => { if (o[k] !== undefined) o[k] *= f; });
  return o;
}

F._test = { kLocal, kgLocal, herm, feq, condense, Skyline, genEig, jacobi, forcesAt, subLoads };
root.RFEM = F;
if (typeof module !== 'undefined' && module.exports) module.exports = F;
})(typeof window !== 'undefined' ? window : globalThis);
