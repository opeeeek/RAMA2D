/* =====================================================================
   RAMA2D – przekroje i materiały prętów
   Tablice materiałów i kształtowników pochodzą bezpośrednio z silników
   modułów (RAMA_ENG): beton – BelkaŻB (tab. 3.1 PN-EN 1992-1-1),
   stal – SłupStal/BelkaStal (PN-EN 10025, kształtowniki PN-EN 10365,
   10210, 10219, 10056), drewno – BelkaDR (PN-EN 338, PN-EN 14080, LVL).
   Dzięki temu przekrój zadany w modelu jest identyczny z przekrojem
   w module wymiarowania.
   Jednostki zwracane przez props(): A [m²], I [m⁴], E [kN/m²], g [kN/m], h [m].
   ===================================================================== */
(function (root) {
'use strict';
const SEC = {};
const ENG = () => root.RAMA_ENG;

SEC.MAT_KIND = { C: 'Żelbet / beton', S: 'Stal', D: 'Drewno' };
SEC.MOD_OF = { C: 'ZB', S: 'ST', D: 'DR' };
SEC.ALPHA_T = { C: 1.0e-5, S: 1.2e-5, D: 0.5e-5 };     // współczynniki rozszerzalności cieplnej [1/K] (PN-EN 1992-1-1 3.1.3(5), PN-EN 1993-1-1 3.2.6)
SEC.NU = { C: 0.2, S: 0.3, D: 0.3 };
SEC.GAMMA_C = 25;                                       // ciężar żelbetu [kN/m³] (PN-EN 1991-1-1, tabl. A.1) – jak w modułach Żelbet
SEC.GAMMA_S = 78.5;

SEC.concreteClasses = () => ENG().BZB.CONC_NAMES.slice();
SEC.steelGrades = () => Object.keys(ENG().SST.M.STAL);
SEC.timberGroups = () => {
  const E = ENG().BDR, out = [];
  E.FAM_ORDER.filter(f => f !== 'U').forEach(f => out.push([E.FAM[f].name, E.MAT_LIST.filter(m => m.fam === f).map(m => m.id)]));
  return out;
};
SEC.timberMat = (cls) => ENG().BDR.MATS[cls] || ENG().BDR.MATS.C24;
SEC.steelSeries = () => {
  const P = ENG().SST.P, BP = ENG().BST.P;
  return {
    walc: { n: 'Dwuteownik walcowany', serie: ['IPE', 'HEA', 'HEB', 'HEM'] },
    ceow: { n: 'Ceownik', serie: ['UPN', 'UPE'] },
    kat: { n: 'Kątownik', serie: ['L', 'LN'] },
    rura: { n: 'Rura kwadratowa / prostokątna', serie: ['SHS', 'RHS'] },
    chs: { n: 'Rura okrągła (CHS)', serie: ['CHS'] },
    dwuc: { n: 'Dwa ceowniki (słup złożony)', serie: ['UPN', 'UPE'] },
    spaw: { n: 'Dwuteownik spawany', serie: [] },
    _P: P, _BP: BP,
  };
};
SEC.steelList = (seria) => ENG().SST.P.lista(seria).map(String);

// domyślne przekroje
SEC.defaults = {
  C: { mat: 'C', cls: 'C30/37', shape: 'rect', b: 300, h: 500, beff: 1000, hf: 150, D: 400, t: 100 },
  S: { mat: 'S', cls: 'S355', prof: { typ: 'walc', seria: 'IPE', nr: 300 }, rot: false },
  D: { mat: 'D', cls: 'C24', shape: 'rect', b: 100, h: 200, n: 1, D: 200 },
};
SEC.make = (mat, o) => Object.assign(JSON.parse(JSON.stringify(SEC.defaults[mat] || SEC.defaults.C)), { kEI: 1 }, o || {});

const fmt0 = v => String(Math.round(v * 10) / 10).replace('.', ',');
// opis przekroju
SEC.label = function (s) {
  if (!s) return '—';
  if (s.mat === 'S') { let g; try { g = ENG().SST.P.geom(Object.assign({ Hcol: 6000 }, s.prof)); } catch (e) { return 'błędny profil'; } return (g.nazwa || '').replace(/ \(PN-EN 10\d+\)/, '') + (s.rot ? ' ⟲' : ''); }
  if (s.mat === 'D') return s.shape === 'round' ? `⌀${s.D}` : `${s.n > 1 ? s.n + '×' : ''}${s.b}×${s.h}`;
  if (s.shape === 'T') return `T ${s.beff}×${s.hf}/${s.b}×${s.h}`;
  if (s.shape === 'circ') return `⌀${s.D}`;
  if (s.shape === 'ring') return `⌀${s.D}×${s.t}`;
  return `${s.b}×${s.h}`;
};
SEC.fullLabel = s => s ? `${SEC.label(s)} · ${s.cls}` : '—';

// charakterystyki przekroju (wymiary w mm na wejściu)
SEC.props = function (s) {
  const out = { ok: true, err: '', mat: s.mat };
  try {
    if (s.mat === 'S') {
      const P = ENG().SST.P, pr = P.props(Object.assign({ Hcol: 6000 }, s.prof));
      const rot = !!s.rot;
      out.A = pr.A * 1e-6; out.I = (rot ? pr.Iz : pr.Iy) * 1e-12; out.Iz = (rot ? pr.Iy : pr.Iz) * 1e-12;
      out.h = (rot ? pr.b : pr.h) / 1000; out.b = (rot ? pr.h : pr.b) / 1000;
      out.E = ENG().SST.U.E * 1e3; out.G = ENG().SST.U.G * 1e3;
      out.g = pr.gk; out.name = pr.nazwa; out.W = (rot ? pr.Wel_z : pr.Wel_y) * 1e-9;
    } else if (s.mat === 'D') {
      const m = SEC.timberMat(s.cls);
      out.E = m.E0m * 1e6; out.G = m.Gm * 1e6;
      if (s.shape === 'round') { const D = +s.D / 1000; out.A = Math.PI * D * D / 4; out.I = Math.PI * D ** 4 / 64; out.Iz = out.I; out.h = D; out.b = D; }
      else { const n = Math.max(1, Math.round(+s.n || 1)), b = +s.b / 1000, h = +s.h / 1000; out.A = n * b * h; out.I = n * b * h ** 3 / 12; out.Iz = h * (n * b) ** 3 / 12; out.h = h; out.b = n * b; }
      out.gamma = Math.round(m.rhom / 10) / 10;         // kN/m³ – jak w BelkaDR (ρ_mean)
      out.g = out.gamma * out.A;
    } else {
      const c = ENG().BZB.CONCRETE[s.cls] || ENG().BZB.CONCRETE['C30/37'];
      out.E = c.Ecm * 1e6; out.G = out.E / (2 * (1 + SEC.NU.C));
      const b = +s.b / 1000, h = +s.h / 1000;
      if (s.shape === 'T') {
        const bf = +s.beff / 1000, hf = Math.min(+s.hf / 1000, h);
        const A1 = bf * hf, A2 = b * (h - hf), z1 = hf / 2, z2 = hf + (h - hf) / 2, A = A1 + A2, zc = (A1 * z1 + A2 * z2) / A;
        out.A = A; out.I = bf * hf ** 3 / 12 + A1 * (zc - z1) ** 2 + b * (h - hf) ** 3 / 12 + A2 * (z2 - zc) ** 2; out.Iz = hf * bf ** 3 / 12 + (h - hf) * b ** 3 / 12;
        out.h = h; out.b = bf; out.zc = zc;
      } else if (s.shape === 'circ') { const D = +s.D / 1000; out.A = Math.PI * D * D / 4; out.I = Math.PI * D ** 4 / 64; out.Iz = out.I; out.h = D; out.b = D; }
      else if (s.shape === 'ring') { const D = +s.D / 1000, d = Math.max(0, D - 2 * (+s.t / 1000)); out.A = Math.PI * (D * D - d * d) / 4; out.I = Math.PI * (D ** 4 - d ** 4) / 64; out.Iz = out.I; out.h = D; out.b = D; }
      else { out.A = b * h; out.I = b * h ** 3 / 12; out.Iz = h * b ** 3 / 12; out.h = h; out.b = b; }
      out.g = SEC.GAMMA_C * out.A;
    }
    const k = +s.kEI > 0 ? +s.kEI : 1;
    out.EA = out.E * out.A; out.EI = out.E * out.I * k; out.alpha = SEC.ALPHA_T[s.mat] || 1e-5;
    if (!(out.A > 0 && out.I > 0 && out.E > 0)) { out.ok = false; out.err = 'Niepoprawne wymiary przekroju.'; }
  } catch (e) { out.ok = false; out.err = e.message; out.A = out.I = out.E = 0; }
  return out;
};

// rysunek przekroju (SVG, mm) – prosty kontur do list i okien
SEC.svg = function (s, size) {
  const W = size || 64, pad = 4;
  let shapes = [];
  if (s.mat === 'S') {
    try {
      const g = ENG().SST.P.geom(Object.assign({ Hcol: 6000 }, s.prof)), pts = (ENG().SST.P.props(g).rings || [ENG().SST.P.props(g).pts]);
      let ymin = Infinity, ymax = -Infinity, zmin = Infinity, zmax = -Infinity;
      pts.forEach(r => r.forEach(p => { const y = p[0], z = p[1]; ymin = Math.min(ymin, y); ymax = Math.max(ymax, y); zmin = Math.min(zmin, z); zmax = Math.max(zmax, z); }));
      const sc = (W - 2 * pad) / Math.max(ymax - ymin, zmax - zmin), rot = !!s.rot;
      const d = pts.map(r => 'M' + r.map(p => { let y = (p[0] - (ymin + ymax) / 2) * sc, z = (p[1] - (zmin + zmax) / 2) * sc; if (rot) [y, z] = [z, y]; return `${(W / 2 + y).toFixed(1)},${(W / 2 - z).toFixed(1)}`; }).join('L') + 'Z').join('');
      shapes.push(`<path d="${d}" fill="var(--secS, #9fb3cf)" fill-rule="evenodd" stroke="var(--ink2, #445)" stroke-width="0.8"/>`);
    } catch (e) { /* */ }
  } else {
    const fill = s.mat === 'D' ? 'var(--secD, #e3c48f)' : 'var(--secC, #cfd3da)';
    const p = SEC.props(s); const bw = p.b * 1000, hh = p.h * 1000, sc = (W - 2 * pad) / Math.max(bw, hh);
    const cx = W / 2, cy = W / 2;
    if (s.shape === 'circ' || s.shape === 'round') shapes.push(`<circle cx="${cx}" cy="${cy}" r="${hh * sc / 2}" fill="${fill}" stroke="#445" stroke-width="0.8"/>`);
    else if (s.shape === 'ring') shapes.push(`<circle cx="${cx}" cy="${cy}" r="${hh * sc / 2}" fill="${fill}" stroke="#445" stroke-width="0.8"/><circle cx="${cx}" cy="${cy}" r="${Math.max(0, hh / 2 - s.t) * sc}" fill="var(--panel,#fff)" stroke="#445" stroke-width="0.8"/>`);
    else if (s.shape === 'T') {
      const bf = +s.beff * sc, hf = +s.hf * sc, b = +s.b * sc, h = +s.h * sc, x0 = cx - bf / 2, y0 = cy - h / 2;
      shapes.push(`<path d="M${x0},${y0}h${bf}v${hf}h${-(bf - b) / 2}v${h - hf}h${-b}v${-(h - hf)}h${-(bf - b) / 2}z" fill="${fill}" stroke="#445" stroke-width="0.8"/>`);
    } else {
      const n = s.mat === 'D' ? Math.max(1, Math.round(+s.n || 1)) : 1, b1 = (+s.b) * sc, h = hh * sc, x0 = cx - n * b1 / 2, y0 = cy - h / 2;
      for (let i = 0; i < n; i++) shapes.push(`<rect x="${x0 + i * b1}" y="${y0}" width="${b1}" height="${h}" fill="${fill}" stroke="#445" stroke-width="0.8"/>`);
    }
  }
  return `<svg width="${W}" height="${W}" viewBox="0 0 ${W} ${W}" class="secsvg">${shapes.join('')}</svg>`;
};

root.RSEC = SEC;
if (typeof module !== 'undefined' && module.exports) module.exports = SEC;
})(typeof window !== 'undefined' ? window : globalThis);
