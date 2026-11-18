/* =====================================================================
   RAMA2D – kombinacje oddziaływań wg PN-EN 1990 (z Załącznikiem Krajowym)
   • kategorie przypadków: G – stałe, Q – użytkowe (kat. A–H), S – śnieg,
     W – wiatr, T – temperatura, E – inne zmienne (ψ podane), A – wyjątkowe;
   • ψ – PN-EN 1990 tabl. A1.1 (wartości jak w modułach – tablica PSI z BelkaŻB);
   • grupy wykluczające się (np. wiatr z lewej / z prawej; warianty
     obciążenia) – w kombinacji co najwyżej jeden przypadek z grupy;
   • dach kat. H nie występuje jednocześnie ze śniegiem ani wiatrem
     (PN-EN 1991-1-1, 3.3.2(1)) – dwie „rodziny” kombinacji;
   • SGN: 6.10 albo 6.10a i 6.10b (ξ), γ_G,sup / γ_G,inf; SGU: charakterystyczna
     6.14b, częsta 6.15b, quasi-stała 6.16b; wyjątkowa 6.11b (ψ₁ albo ψ₂);
   • obwiednie liczone metodą „tylko niekorzystne” dla każdej wielkości
     i punktu osobno (dokładne maksimum po wszystkich kombinacjach), lista
     jawnych kombinacji – do podglądu, analizy II rzędu i stateczności.
   ===================================================================== */
(function (root) {
'use strict';
const C = {};
C.CATS = {
  G: { n: 'stałe (G)', perm: true, color: '#4a5466' },
  Q: { n: 'użytkowe (Q)', color: '#1d5bb8' },
  S: { n: 'śnieg (S)', color: '#0e8fa8' },
  W: { n: 'wiatr (W)', color: '#1d7f3c' },
  T: { n: 'temperatura (T)', color: '#b35c00' },
  E: { n: 'inne zmienne (ψ podane)', color: '#6a3fb5' },
  A: { n: 'wyjątkowe (A)', acc: true, color: '#c0262d' },
};
C.QCAT = { A: 'A – mieszkalne', B: 'B – biura', C: 'C – zebrań', D: 'D – handlowe', E: 'E – magazyny', F: 'F – pojazdy ≤ 30 kN', G: 'G – pojazdy 30–160 kN', H: 'H – dachy' };
const PSI_DEF = {
  A: [0.7, 0.5, 0.3], B: [0.7, 0.5, 0.3], C: [0.7, 0.7, 0.6], D: [0.7, 0.7, 0.6], E: [1.0, 0.9, 0.8], F: [0.7, 0.7, 0.6], G: [0.7, 0.5, 0.3], H: [0, 0, 0],
  S: [0.5, 0.2, 0.0], SH: [0.7, 0.5, 0.2], W: [0.6, 0.2, 0.0], T: [0.6, 0.5, 0.0],
};
function psiTable() {
  const E = root.RAMA_ENG && root.RAMA_ENG.BZB, P = E && E.PSI;
  const t = {}; Object.keys(PSI_DEF).forEach(k => { const q = P && P[k]; t[k] = q ? [q.p0, q.p1, q.p2] : PSI_DEF[k]; });
  return t;
}
C.psi = function (lc) {
  const T = psiTable();
  if (lc.cat === 'Q') return T[lc.qcat] || T.B;
  if (lc.cat === 'S') return lc.alt === 'high' ? T.SH : T.S;
  if (lc.cat === 'W') return T.W;
  if (lc.cat === 'T') return T.T;
  if (lc.cat === 'E') return [+lc.p0 || 0, +lc.p1 || 0, +lc.p2 || 0];
  return [0, 0, 0];
};
C.isPerm = lc => lc.cat === 'G';
C.isAcc = lc => lc.cat === 'A';
C.isVar = lc => !C.isPerm(lc) && !C.isAcc(lc);

// rodziny: dach kat. H – bez śniegu i wiatru (i odwrotnie)
function families(vars) {
  const H = vars.filter(v => v.cat === 'Q' && v.qcat === 'H'), SW = vars.filter(v => v.cat === 'S' || v.cat === 'W');
  if (H.length && SW.length) return [{ set: vars.filter(v => !SW.includes(v)), tag: 'dach kat. H, bez śniegu/wiatru' }, { set: vars.filter(v => !H.includes(v)), tag: 'śnieg/wiatr, bez kat. H' }];
  return [{ set: vars, tag: '' }];
}
// grupy: przypadki z tą samą nazwą grupy wykluczają się wzajemnie; bez grupy – osobne „grupy” jednoelementowe
function groupsOf(set) {
  const g = new Map();
  set.forEach(v => { const k = v.grp ? 'g:' + v.grp : 'c:' + v.id; if (!g.has(k)) g.set(k, []); g.get(k).push(v); });
  return Array.from(g.values());
}

/* ---------------------------------------------------- obwiednia „tylko niekorzystne” */
// vals: { caseId → wartość } (jedna wielkość w jednym punkcie); s – ustawienia; zwraca {max, min, maxC, minC} dla typu
// typ: 'ULS' | 'CHAR' | 'FREQ' | 'QP' | 'ACC'
C.envelope = function (cases, vals, s, typ) {
  const perm = cases.filter(C.isPerm), vars = cases.filter(C.isVar), accs = cases.filter(C.isAcc);
  const G = perm.reduce((a, c) => a + (vals[c.id] || 0), 0);
  const gS = typ === 'ULS' ? s.gG : 1, gI = typ === 'ULS' ? s.gGinf : 1, gQ = typ === 'ULS' ? s.gQ : 1;
  const best = { max: -Infinity, min: Infinity, maxC: null, minC: null };
  const consider = (v, desc) => { if (v > best.max) { best.max = v; best.maxC = desc; } if (v < best.min) { best.min = v; best.minC = desc; } };
  // G niekorzystne: ξ·γ_G,sup (6.10b) albo γ_G,sup; korzystne: γ_G,inf (bez ξ)
  const unf = sign => (sign > 0 ? G >= 0 : G <= 0);
  const gPart = (sign, xi) => (unf(sign) ? xi * gS * G : gI * G);
  const gTag = sign => (unf(sign) ? 'sup' : 'inf');
  const fams = families(vars);
  [1, -1].forEach(sign => {
    const pick = v => (sign > 0 ? Math.max(0, v) : Math.min(0, v));
    fams.forEach(F => {
      const grps = groupsOf(F.set);
      const acc = (fac, excl) => { let t = 0; const ids = []; grps.forEach(gr => { if (excl && gr.includes(excl)) return; let bv = 0, bid = null; gr.forEach(v => { const x = pick((vals[v.id] || 0) * fac(v)); if (Math.abs(x) > Math.abs(bv)) { bv = x; bid = v.id; } }); t += bv; if (bid) ids.push(bid); }); return { t, ids }; };
      if (typ === 'ULS') {
        const xi = s.comb === '610' ? 1 : s.xi;
        if (s.comb === '610ab') {   // 6.10a: G·γ + ψ₀·γ_Q·ΣQ
          const a = acc(v => gQ * C.psi(v)[0]);
          consider(gPart(sign, 1) + a.t, { ref: '6.10a', lead: null, q: a.ids, g: gTag(sign) });
        }
        consider(gPart(sign, xi), { ref: s.comb === '610' ? '6.10' : '6.10b', lead: null, q: [], g: gTag(sign) });
        F.set.forEach(L => {
          const vL = pick((vals[L.id] || 0) * gQ); if (!vL) return;
          const a = acc(v => gQ * C.psi(v)[0], L), tot = gPart(sign, xi) + vL + a.t;
          consider(tot, { ref: s.comb === '610' ? '6.10' : '6.10b', lead: L.id, q: a.ids, g: gTag(sign) });
        });
      } else if (typ === 'CHAR' || typ === 'FREQ') {
        consider(G, { ref: typ === 'CHAR' ? '6.14b' : '6.15b', lead: null, q: [] });
        F.set.forEach(L => {
          const fL = typ === 'CHAR' ? 1 : C.psi(L)[1], vL = pick((vals[L.id] || 0) * fL); if (!vL) return;
          const a = acc(v => (typ === 'CHAR' ? C.psi(v)[0] : C.psi(v)[2]), L);
          consider(G + vL + a.t, { ref: typ === 'CHAR' ? '6.14b' : '6.15b', lead: L.id, q: a.ids });
        });
      } else if (typ === 'QP') {
        const a = acc(v => C.psi(v)[2]); consider(G + a.t, { ref: '6.16b', lead: null, q: a.ids });
      } else if (typ === 'ACC') {
        const pl = s.accPsi === 'psi2' ? 2 : 1;
        accs.forEach(Ak => {
          const base = G + (vals[Ak.id] || 0);
          const a0 = acc(v => C.psi(v)[2]); consider(base + a0.t, { ref: '6.11b', acc: Ak.id, lead: null, q: a0.ids });
          F.set.forEach(L => { const vL = pick((vals[L.id] || 0) * C.psi(L)[pl]); if (!vL) return; const a = acc(v => C.psi(v)[2], L); consider(base + vL + a.t, { ref: '6.11b', acc: Ak.id, lead: L.id, q: a.ids }); });
        });
      }
    });
  });
  if (!isFinite(best.max)) { best.max = 0; best.min = 0; }
  return best;
};

/* ---------------------------------------------------- jawna lista kombinacji */
// zwraca [{id, name, typ, ref, f: {caseId: współczynnik}, lead}]
C.list = function (cases, s, opt) {
  opt = opt || {};
  const perm = cases.filter(C.isPerm), vars = cases.filter(C.isVar), accs = cases.filter(C.isAcc);
  const out = [], seen = new Set(), cap = opt.cap || 400;
  const push = (typ, ref, fG, terms, lead, extra) => {
    const f = {}; perm.forEach(c => { f[c.id] = fG; }); terms.forEach(([id, k]) => { if (k) f[id] = (f[id] || 0) + k; });
    const key = typ + '|' + Object.keys(f).sort().map(k => k + ':' + f[k].toFixed(4)).join(',');
    if (seen.has(key) || out.length >= cap) return; seen.add(key);
    const name = `${ref}: ` + Object.keys(f).filter(k => f[k]).map(k => `${fmtF(f[k])}·${nameOf(cases, k)}${k === lead ? '*' : ''}`).join(' + ');
    out.push(Object.assign({ id: typ + (out.filter(c => c.typ === typ).length + 1), typ, ref, f, lead, name }, extra || {}));
  };
  const fams = families(vars);
  fams.forEach(F => {
    const grps = groupsOf(F.set);
    // podzbiory oddziaływań zmiennych: z każdej grupy wykluczającej – brak albo jeden przypadek (ograniczenie liczby)
    let sels = [[]];
    const total = grps.reduce((a, g) => a * (g.length + 1), 1);
    if (total <= (opt.maxSets || 256)) grps.forEach(g => { const nx = []; sels.forEach(sl => { nx.push(sl); g.forEach(v => nx.push(sl.concat([v]))); }); sels = nx; });
    else { // zbyt wiele – wszystkie grupy obecne (z każdym członkiem grupy) oraz każdy przypadek osobno
      let full = [[]]; grps.forEach(g => { const nx = []; full.forEach(sl => g.forEach(v => nx.push(sl.concat([v])))); full = nx.slice(0, 128); });
      sels = full.concat(F.set.map(v => [v])).concat([[]]);
    }
    sels.sort((a, b) => b.length - a.length);
    sels.forEach(V => {
      const xi = s.comb === '610' ? 1 : s.xi;
      [[s.gG, 'γG,sup'], [s.gGinf, 'γG,inf']].forEach(([gg, gl]) => {
        if (s.comb === '610ab') push('ULS', '6.10a', gg, V.map(v => [v.id, s.gQ * C.psi(v)[0]]), null, { gl });
        const g2 = gl === 'γG,inf' ? gg : xi * gg;
        if (!V.length) push('ULS', s.comb === '610' ? '6.10' : '6.10b', g2, [], null, { gl });
        V.forEach(L => push('ULS', s.comb === '610' ? '6.10' : '6.10b', g2, V.map(v => [v.id, s.gQ * (v === L ? 1 : C.psi(v)[0])]), L.id, { gl }));
      });
      if (!V.length) { push('CHAR', '6.14b', 1, [], null); push('FREQ', '6.15b', 1, [], null); }
      V.forEach(L => push('CHAR', '6.14b', 1, V.map(v => [v.id, v === L ? 1 : C.psi(v)[0]]), L.id));
      V.forEach(L => push('FREQ', '6.15b', 1, V.map(v => [v.id, v === L ? C.psi(v)[1] : C.psi(v)[2]]), L.id));
      push('QP', '6.16b', 1, V.map(v => [v.id, C.psi(v)[2]]), null);
      const pl = s.accPsi === 'psi2' ? 2 : 1;
      accs.forEach(Ak => {
        push('ACC', '6.11b', 1, [[Ak.id, 1]].concat(V.map(v => [v.id, C.psi(v)[2]])), null, { acc: Ak.id });
        V.forEach(L => push('ACC', '6.11b', 1, [[Ak.id, 1]].concat(V.map(v => [v.id, v === L ? C.psi(v)[pl] : C.psi(v)[2]])), L.id, { acc: Ak.id }));
      });
    });
  });
  (opt.user || []).forEach((u, i) => { const f = {}; Object.keys(u.f || {}).forEach(k => { if (+u.f[k]) f[k] = +u.f[k]; }); out.push({ id: 'U' + (i + 1), typ: u.typ || 'ULS', ref: 'własna', f, lead: null, name: u.name || `Kombinacja własna ${i + 1}`, user: true }); });
  return out;
};
const fmtF = v => (Math.round(v * 1000) / 1000).toString().replace('.', ',');
const nameOf = (cases, id) => { const c = cases.find(q => q.id === id); return c ? c.short || c.id : id; };
// współczynniki kombinacji z opisu obwiedni (do analizy II rzędu kombinacji decydujących)
C.factors = function (cases, d, s, typ) {
  const f = {}, perm = cases.filter(C.isPerm), psi = id => C.psi(cases.find(c => c.id === id) || {});
  if (!d) return f;
  if (typ === 'ULS') {
    const gG = d.g === 'inf' ? s.gGinf : (d.ref === '6.10b' ? s.xi * s.gG : s.gG);
    perm.forEach(c => { f[c.id] = gG; });
    if (d.lead) f[d.lead] = s.gQ;
    (d.q || []).forEach(id => { f[id] = s.gQ * psi(id)[0]; });
  } else if (typ === 'ACC') {
    perm.forEach(c => { f[c.id] = 1; }); if (d.acc) f[d.acc] = 1;
    const pl = s.accPsi === 'psi2' ? 2 : 1; if (d.lead) f[d.lead] = psi(d.lead)[pl];
    (d.q || []).forEach(id => { f[id] = psi(id)[2]; });
  } else {
    perm.forEach(c => { f[c.id] = 1; });
    if (d.lead) f[d.lead] = typ === 'FREQ' ? psi(d.lead)[1] : 1;
    (d.q || []).forEach(id => { f[id] = typ === 'CHAR' ? psi(id)[0] : psi(id)[2]; });
  }
  return f;
};
C.TYP_N = { ULS: 'SGN (podstawowa)', CHAR: 'SGU charakterystyczna', FREQ: 'SGU częsta', QP: 'SGU quasi-stała', ACC: 'SGN wyjątkowa' };
C.describe = function (cases, d) {
  if (!d) return '';
  const nm = id => nameOf(cases, id);
  const parts = []; if (d.acc) parts.push(nm(d.acc) + ' (wyj.)'); if (d.lead) parts.push(nm(d.lead) + '*'); (d.q || []).forEach(id => parts.push(nm(id)));
  return `${d.ref}${parts.length ? ': G + ' + parts.join(' + ') : ': G'}`;
};

root.RCOMB = C;
if (typeof module !== 'undefined' && module.exports) module.exports = C;
})(typeof window !== 'undefined' ? window : globalThis);
