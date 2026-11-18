/* =====================================================================
   RAMA2D – generator układów prętowych (bez obciążeń przykładowych)
   Belki (jedno- i wieloprzęsłowe, wsporniki), słupy, ramy portalowe,
   ramy wielonawowe i wielokondygnacyjne, ramy dwuspadowe (hale),
   kratownice (Pratta, Howe’a, Warrena, Warrena ze słupkami, K, Fink)
   o pasach równoległych, trapezowe, trójkątne i pulpitowe, łuki.
   Generator zwraca fragment modelu (węzły, pręty, podpory) z przekrojami
   przypisanymi grupom prętów; fragment jest dołączany do projektu
   (z ewentualnym przesunięciem) i scalany w węzłach wspólnych.
   ===================================================================== */
(function (root) {
'use strict';
const G = {};
const num = (v, d) => { const x = parseFloat(String(v).replace(',', '.')); return isFinite(x) ? x : d; };
const list = (v, d) => { const a = String(v === undefined ? '' : v).split(/[;\s]+/).map(t => t.trim()).filter(Boolean).flatMap(t => { const m = t.match(/^(\d+)\s*[x×*]\s*([\d.,]+)$/i); if (m) return Array(+m[1]).fill(num(m[2], 0)); return [num(t, NaN)]; }).filter(x => isFinite(x) && x > 0); return a.length ? a : d; };
G.list = list;

// grupy prętów (do przypisania przekrojów)
G.GROUPS = { beam: 'belki / rygle', col: 'słupy', top: 'pas górny', bot: 'pas dolny', diag: 'krzyżulce', vert: 'słupki', arch: 'łuk', tie: 'ściąg' };

G.TYPES = {
  beam: { n: 'Belka (jedno- lub wieloprzęsłowa)', icon: 'beam', groups: ['beam'],
    fields: [['spans', 'Przęsła [m] (np. 6 albo 5; 6; 5 albo 3×6)', '6'], ['cantL', 'Wspornik lewy [m]', '0'], ['cantR', 'Wspornik prawy [m]', '0'],
      ['sup1', 'Podpora skrajna lewa', 'pin', [['pin', 'przegub nieprzesuwny'], ['rollX', 'przegub przesuwny'], ['fix', 'utwierdzenie']]],
      ['supM', 'Podpory pośrednie', 'rollX', [['rollX', 'przegub przesuwny'], ['pin', 'przegub nieprzesuwny'], ['fix', 'utwierdzenie']]],
      ['sup2', 'Podpora skrajna prawa', 'rollX', [['rollX', 'przegub przesuwny'], ['pin', 'przegub nieprzesuwny'], ['fix', 'utwierdzenie']]]] },
  cant: { n: 'Wspornik', icon: 'cant', groups: ['beam'], fields: [['L', 'Długość L [m]', '2,5'], ['side', 'Utwierdzenie', 'L', [['L', 'z lewej'], ['R', 'z prawej']]]] },
  col: { n: 'Słup', icon: 'col', groups: ['col'], fields: [['H', 'Wysokość H [m] (kondygnacje: 3,5; 3,2)', '4'],
      ['base', 'Podstawa', 'fix', [['fix', 'utwierdzenie'], ['pin', 'przegub']]], ['top', 'Głowica', 'free', [['free', 'swobodna (wspornik)'], ['rollZ', 'przegub nieprzesuwny poziomo'], ['slideZ', 'utwierdzenie przesuwne pionowo']]]] },
  portal: { n: 'Rama portalowa / wielonawowa', icon: 'portal', groups: ['beam', 'col'],
    fields: [['spans', 'Rozpiętości naw [m] (np. 12 albo 6; 6)', '6'], ['H', 'Wysokości kondygnacji [m] (od dołu, np. 4; 3,3)', '4'],
      ['base', 'Podstawy słupów', 'fix', [['fix', 'utwierdzone'], ['pin', 'przegubowe']]], ['joint', 'Połączenia rygli ze słupami', 'rigid', [['rigid', 'sztywne'], ['hinge', 'przegubowe (rygle swobodnie podparte)']]],
      ['cantL', 'Wspornik rygli z lewej [m]', '0'], ['cantR', 'Wspornik rygli z prawej [m]', '0']] },
  gable: { n: 'Rama z ryglami pochyłymi (hala)', icon: 'gable', groups: ['beam', 'col'],
    fields: [['roof', 'Dach', 'gable', [['gable', 'dwuspadowy w każdej nawie'], ['gable1', 'dwuspadowy – jedna kalenica, słupy wewnętrzne'], ['mono', 'jednospadowy (pulpitowy)'], ['saw', 'piłowy (szedowy) – jednospadowy w każdej nawie']]],
      ['spans', 'Rozpiętości naw [m] (np. 18 albo 12; 12)', '18'], ['H', 'Wysokość słupów w okapie H [m]', '6'],
      ['alpha', 'Kąt nachylenia rygli α [°]', '10'], ['f', 'albo wyniesienie kalenicy f [m] (gdy α puste)', ''],
      ['base', 'Podstawy słupów', 'pin', [['pin', 'przegubowe'], ['fix', 'utwierdzone']]], ['joint', 'Połączenie rygli ze słupami', 'rigid', [['rigid', 'sztywne (rama)'], ['hinge', 'przegubowe']]],
      ['ridge', 'Kalenica', 'rigid', [['rigid', 'sztywna'], ['hinge', 'przegub (rama trójprzegubowa)']]],
      ['tie', 'Ściąg rygli', 'no', [['no', 'brak'], ['yes', 'ściąg na poziomie okapu (pręt kratowy)']]], ['ovh', 'Okap – wysięg rygla poza słup [m]', '0']] },
  roof: { n: 'Wiązar dachowy', icon: 'roof', groups: ['top', 'bot', 'diag'],
    fields: [['roof', 'Dach', 'gable', [['gable', 'dwuspadowy'], ['mono', 'jednospadowy (pulpitowy)']]], ['L', 'Rozpiętość L (w osiach podpór) [m]', '10'], ['alpha', 'Kąt nachylenia dachu α [°]', '30'],
      ['type', 'Wypełnienie', 'fink', [['fink', 'W (Fink) – 2 przedziały połaci'], ['fink2', 'WW (podwójny Fink) – 3 przedziały połaci'], ['howe', 'Howe’a (słupki i krzyżulce)'], ['pratt', 'Pratta (słupki i krzyżulce)'], ['warren', 'Warrena (W, bez słupków)']]],
      ['n', 'Liczba przedziałów pasa dolnego (Howe, Pratt, Warren)', '6'], ['h0', 'Wysokość w podporze h₀ [m] (0 – wiązar ostry)', '0'], ['ovh', 'Okap – wysięg pasa górnego (poziomo) [m]', '0,6'],
      ['chords', 'Pasy', 'cont', [['cont', 'ciągłe (sztywne w węzłach), krzyżulce przegubowe'], ['pin', 'wszystkie pręty przegubowe']]]] },
  truss: { n: 'Kratownica', icon: 'truss', groups: ['top', 'bot', 'diag', 'vert'],
    fields: [['L', 'Rozpiętość L [m]', '18'], ['n', 'Liczba przedziałów (parzysta dla układów symetrycznych)', '6'],
      ['shape', 'Kształt', 'par', [['par', 'pasy równoległe'], ['trap', 'trapezowa (dwuspadowa)'], ['tri', 'trójkątna (dwuspadowa)'], ['mono', 'pulpitowa (jednospadowa)'], ['bow', 'łukowa (pas górny paraboliczny)']]],
      ['h', 'Wysokość (przy podporze dla trapezowej/pulpitowej) h [m]', '1,8'], ['hm', 'Wysokość w środku / na drugim końcu [m] (trapez, trójkąt, łuk, pulpit)', '2,5'],
      ['type', 'Układ krzyżulców', 'pratt', [['pratt', 'Pratta (N) – krzyżulce rozciągane'], ['howe', 'Howe’a – krzyżulce ściskane'], ['warren', 'Warrena (W)'], ['warrenv', 'Warrena ze słupkami'], ['k', 'K (krzyżulce do połowy słupka)']]],
      ['sup', 'Podparcie', 'bot', [['bot', 'w węzłach pasa dolnego'], ['top', 'w węzłach pasa górnego']]], ['chords', 'Pasy', 'cont', [['cont', 'ciągłe (sztywne w węzłach), krzyżulce przegubowe'], ['pin', 'wszystkie pręty przegubowe']]]] },
  arch: { n: 'Łuk', icon: 'arch', groups: ['arch', 'tie'],
    fields: [['L', 'Rozpiętość L [m]', '20'], ['f', 'Strzałka f [m]', '4'], ['n', 'Liczba prętów (odcinków) łuku', '16'], ['shape', 'Kształt osi', 'par', [['par', 'parabola'], ['circ', 'łuk kołowy']]],
      ['sup', 'Podparcie', 'pin2', [['pin2', 'dwuprzegubowy'], ['fix', 'utwierdzony'], ['pin3', 'trójprzegubowy'], ['tied', 'ze ściągiem (przegub + przesuwna)']]]] },
};

// wynik: { nodes:[{k,x,z}], bars:[{a,b,grp,truss,rel}], sups:[{k,type}] } – k: klucz węzła
function Builder() { this.nodes = []; this.bars = []; this.sups = []; this.map = new Map(); }
Builder.prototype.n = function (x, z) { const key = `${Math.round(x * 1e4)}|${Math.round(z * 1e4)}`; if (!this.map.has(key)) { this.map.set(key, this.nodes.length); this.nodes.push({ x: Math.round(x * 1e6) / 1e6, z: Math.round(z * 1e6) / 1e6 }); } return this.map.get(key); };
Builder.prototype.b = function (a, b, grp, o) { if (a === b) return; this.bars.push(Object.assign({ a, b, grp }, o || {})); };
Builder.prototype.s = function (k, type) { this.sups.push({ k, type }); };

G.build = function (type, p) {
  const B = new Builder();
  if (type === 'beam') {
    const sp = list(p.spans, [6]), cL = num(p.cantL, 0), cR = num(p.cantR, 0);
    let x = 0; const xs = [];
    if (cL > 0) { B.n(0, 0); x = cL; }
    xs.push(x); sp.forEach(L => { x += L; xs.push(x); });
    if (cL > 0) B.b(B.n(0, 0), B.n(xs[0], 0), 'beam');
    for (let i = 0; i < xs.length - 1; i++) B.b(B.n(xs[i], 0), B.n(xs[i + 1], 0), 'beam');
    if (cR > 0) B.b(B.n(x, 0), B.n(x + cR, 0), 'beam');
    xs.forEach((xx, i) => B.s(B.n(xx, 0), i === 0 ? (p.sup1 || 'pin') : i === xs.length - 1 ? (p.sup2 || 'rollX') : (p.supM || 'rollX')));
  } else if (type === 'cant') {
    const L = num(p.L, 2.5), a = B.n(0, 0), b = B.n(L, 0); B.b(a, b, 'beam'); B.s(p.side === 'R' ? b : a, 'fix');
  } else if (type === 'col') {
    const hs = list(p.H, [4]); let z = 0; B.n(0, 0);
    hs.forEach(h => { B.b(B.n(0, z), B.n(0, z + h), 'col'); z += h; });
    B.s(B.n(0, 0), p.base || 'fix'); if (p.top && p.top !== 'free') B.s(B.n(0, z), p.top);
  } else if (type === 'portal') {
    const sp = list(p.spans, [6]), hs = list(p.H, [4]), cL = num(p.cantL, 0), cR = num(p.cantR, 0), hinge = p.joint === 'hinge';
    const xs = [0]; sp.forEach(L => xs.push(xs[xs.length - 1] + L));
    const zs = [0]; hs.forEach(h => zs.push(zs[zs.length - 1] + h));
    xs.forEach(x => { for (let j = 0; j < hs.length; j++) B.b(B.n(x, zs[j]), B.n(x, zs[j + 1]), 'col'); B.s(B.n(x, 0), p.base || 'fix'); });
    for (let j = 1; j < zs.length; j++) {
      for (let i = 0; i < sp.length; i++) B.b(B.n(xs[i], zs[j]), B.n(xs[i + 1], zs[j]), 'beam', hinge ? { rel: [0, 0] } : null);
      if (cL > 0) B.b(B.n(-cL, zs[j]), B.n(0, zs[j]), 'beam');
      if (cR > 0) B.b(B.n(xs[xs.length - 1], zs[j]), B.n(xs[xs.length - 1] + cR, zs[j]), 'beam');
    }
  } else if (type === 'gable') {
    // rama z ryglami pochyłymi: dach dwuspadowy w każdej nawie / jedna kalenica / jednospadowy / piłowy
    const sp = p.spans !== undefined && String(p.spans).trim() !== '' ? list(p.spans, [18]) : Array(Math.max(1, Math.round(num(p.bays, 1)))).fill(num(p.L, 18));
    const H = num(p.H, 6), roof = p.roof || 'gable';
    const useA = p.alpha !== undefined && String(p.alpha).trim() !== '' && isFinite(num(p.alpha, NaN));
    const ta = useA ? Math.tan(Math.max(0, Math.min(75, num(p.alpha, 10))) * Math.PI / 180) : null;
    const rise = run => (useA ? run * ta : num(p.f, 1.5));
    const xs = [0]; sp.forEach(L => xs.push(xs[xs.length - 1] + L)); const W = xs[xs.length - 1], nb = sp.length;
    const hingeJ = p.joint === 'hinge', ovh = Math.max(0, num(p.ovh, 0));
    const col = (x, ztop) => { const a = B.n(x, 0), t = B.n(x, ztop); B.b(a, t, 'col'); B.s(a, p.base || 'pin'); return t; };
    // pręt rygla z ewentualnym przegubem na końcach przy słupach (rel: [początek, koniec])
    const raf = (x0, z0, x1, z1, r0, r1) => B.b(B.n(x0, z0), B.n(x1, z1), 'beam', (r0 || r1) ? { rel: [r0 ? 0 : null, r1 ? 0 : null] } : null);
    if (roof === 'gable') {
      for (let k = 0; k < nb; k++) {
        const x0 = xs[k], x1 = xs[k + 1], xm = (x0 + x1) / 2, f = rise(sp[k] / 2);
        col(x0, H); col(x1, H);
        raf(x0, H, xm, H + f, hingeJ, p.ridge === 'hinge'); raf(xm, H + f, x1, H, false, hingeJ);
        if (p.tie === 'yes') B.b(B.n(x0, H), B.n(x1, H), 'tie', { truss: true });
      }
    } else if (roof === 'gable1') {
      const xm = W / 2, f = rise(W / 2), z = x => H + f * (1 - Math.abs(x - xm) / (W / 2));
      const pts = Array.from(new Set(xs.concat([xm]).map(v => Math.round(v * 1e6) / 1e6))).sort((a, b) => a - b);
      xs.forEach(x => col(x, z(x)));
      for (let i = 0; i < pts.length - 1; i++) raf(pts[i], z(pts[i]), pts[i + 1], z(pts[i + 1]), hingeJ && (i === 0 || xs.includes(pts[i])) && pts[i] !== xm, (hingeJ && xs.includes(pts[i + 1]) && pts[i + 1] !== xm) || (p.ridge === 'hinge' && Math.abs(pts[i + 1] - xm) < 1e-9));
      if (p.tie === 'yes') { const tx = xs.slice(); for (let i = 0; i < tx.length - 1; i++) B.b(B.n(tx[i], H), B.n(tx[i + 1], H), 'tie', { truss: true }); xs.slice(1, -1).forEach(x => { /* słup wewnętrzny dzielony węzłem ściągu */ const t = B.n(x, H); const bi = B.bars.findIndex(q => q.grp === 'col' && B.nodes[q.a].x === x); if (bi >= 0 && Math.abs(z(x) - H) > 1e-6) { const q = B.bars[bi]; B.bars.splice(bi, 1, { a: q.a, b: t, grp: 'col' }, { a: t, b: q.b, grp: 'col' }); } }); }
    } else if (roof === 'mono') {
      const f = rise(W), z = x => H + f * x / W;
      xs.forEach(x => col(x, z(x)));
      for (let i = 0; i < nb; i++) raf(xs[i], z(xs[i]), xs[i + 1], z(xs[i + 1]), hingeJ, hingeJ);
    } else {   // piłowy
      for (let k = 0; k < nb; k++) {
        const x0 = xs[k], x1 = xs[k + 1], f = rise(sp[k]);
        if (k === 0) col(x0, H);
        const t = col(x1, H + f);
        raf(x0, H, x1, H + f, hingeJ, hingeJ);
        if (k < nb - 1) { const mid = B.n(x1, H); const bi = B.bars.findIndex(q => q.grp === 'col' && q.b === t); if (bi >= 0) { const q = B.bars[bi]; B.bars.splice(bi, 1, { a: q.a, b: mid, grp: 'col' }, { a: mid, b: t, grp: 'col' }); } }
      }
    }
    // okapy – wysięg rygli poza słupy skrajne wzdłuż połaci
    if (ovh > 0) {
      const zL = B.nodes.filter(q => Math.abs(q.x) < 1e-9).reduce((m, q) => Math.max(m, q.z), 0);
      const zR = B.nodes.filter(q => Math.abs(q.x - W) < 1e-9).reduce((m, q) => Math.max(m, q.z), 0);
      const sL = roof === 'gable' ? rise(sp[0] / 2) / (sp[0] / 2) : roof === 'gable1' ? rise(W / 2) / (W / 2) : roof === 'mono' ? rise(W) / W : rise(sp[0]) / sp[0];
      const sR = roof === 'gable' ? rise(sp[nb - 1] / 2) / (sp[nb - 1] / 2) : roof === 'gable1' ? rise(W / 2) / (W / 2) : roof === 'mono' ? -rise(W) / W : -rise(sp[nb - 1]) / sp[nb - 1];
      B.b(B.n(-ovh, zL - ovh * sL), B.n(0, zL), 'beam'); B.b(B.n(W, zR), B.n(W + ovh, zR - ovh * sR), 'beam');
    }
  } else if (type === 'roof') {
    // wiązar dachowy o zadanym kącie nachylenia połaci
    const L = num(p.L, 10), ta = Math.tan(Math.max(1, Math.min(75, num(p.alpha, 30))) * Math.PI / 180), h0 = Math.max(0, num(p.h0, 0)), ovh = Math.max(0, num(p.ovh, 0));
    const mono = p.roof === 'mono', ty = p.type || 'fink', Ht = mono ? h0 + L * ta : h0 + L / 2 * ta;
    const zt = x => (mono ? h0 + x * ta : h0 + (L / 2 - Math.abs(x - L / 2)) * ta);
    const tr = { truss: true }, ch = p.chords === 'pin' ? { truss: true } : null;
    if ((ty === 'fink' || ty === 'fink2') && !mono) {
      const nbt = ty === 'fink' ? 3 : 5, nt = ty === 'fink' ? 2 : 3;
      const bot = []; for (let i = 0; i <= nbt; i++) bot.push(B.n(L * i / nbt, 0));
      const tx = []; for (let j = 0; j <= 2 * nt; j++) tx.push(L * j / (2 * nt));
      const top = tx.map(x => (Math.abs(zt(x)) < 1e-9 ? B.n(x, 0) : B.n(x, zt(x))));
      for (let i = 0; i < nbt; i++) B.b(bot[i], bot[i + 1], 'bot', ch);
      for (let j = 0; j < 2 * nt; j++) B.b(top[j], top[j + 1], 'top', ch);
      if (h0 > 1e-6) { B.b(bot[0], top[0], 'diag', tr); B.b(bot[nbt], top[2 * nt], 'diag', tr); }
      const webs = ty === 'fink' ? [[1, 1], [1, 2], [2, 2], [2, 3]] : [[1, 1], [1, 2], [2, 2], [2, 3], [3, 3], [3, 4], [4, 4], [4, 5]];
      webs.forEach(([bi, tj]) => B.b(bot[bi], top[tj], 'diag', tr));
      B.s(bot[0], 'pin'); B.s(bot[nbt], 'rollX');
    } else {
      const n = Math.max(2, 2 * Math.round(Math.max(2, num(p.n, 6)) / 2));
      const T = G.build('truss', { L, n, shape: mono ? 'mono' : (h0 > 1e-6 ? 'trap' : 'tri'), h: h0, hm: Ht, type: ['pratt', 'howe', 'warren'].includes(ty) ? ty : 'howe', sup: 'bot', chords: p.chords });
      T.nodes.forEach(q => B.n(q.x, q.z)); T.bars.forEach(q => B.b(B.n(T.nodes[q.a].x, T.nodes[q.a].z), B.n(T.nodes[q.b].x, T.nodes[q.b].z), q.grp === 'vert' ? 'diag' : q.grp, { truss: q.truss, rel: q.rel }));
      T.sups.forEach(s => B.s(B.n(T.nodes[s.k].x, T.nodes[s.k].z), s.type));
    }
    if (ovh > 0) {
      B.b(B.n(-ovh, zt(0) - ovh * ta), B.n(0, zt(0)), 'top');
      if (mono) B.b(B.n(L, Ht), B.n(L + ovh, Ht + ovh * ta), 'top'); else B.b(B.n(L, zt(L)), B.n(L + ovh, zt(L) - ovh * ta), 'top');
    }
  } else if (type === 'truss') {
    const L = num(p.L, 18), n = Math.max(2, Math.round(num(p.n, 6))), h0 = num(p.h, 1.8), hm = num(p.hm, 2.5), dx = L / n, shp = p.shape || 'par', ty = p.type || 'pratt';
    const ht = i => { const x = i * dx; if (shp === 'par') return h0; if (shp === 'mono') return h0 + (hm - h0) * x / L;
      if (shp === 'tri') return Math.max(0, hm * (1 - Math.abs(2 * x / L - 1)));
      if (shp === 'bow') return h0 + (hm - h0) * (1 - (2 * x / L - 1) ** 2);
      return h0 + (hm - h0) * (1 - Math.abs(2 * x / L - 1)); };
    const pinAll = p.chords === 'pin', bot = [], top = [];
    for (let i = 0; i <= n; i++) { bot.push(B.n(i * dx, 0)); const h = ht(i); top.push(h > 1e-6 ? B.n(i * dx, h) : bot[i]); }
    const tr = { truss: true }, ch = pinAll ? { truss: true } : null;
    for (let i = 0; i < n; i++) { B.b(bot[i], bot[i + 1], 'bot', ch); if (top[i] !== top[i + 1]) B.b(top[i], top[i + 1], 'top', ch); }
    for (let i = 0; i <= n; i++) if (top[i] !== bot[i] && (ty !== 'warren' || i === 0 || i === n)) B.b(bot[i], top[i], 'vert', tr);
    for (let i = 0; i < n; i++) {
      const left = i < n / 2;
      if (ty === 'pratt') { if (left) B.b(top[i], bot[i + 1], 'diag', tr); else B.b(bot[i], top[i + 1], 'diag', tr); }
      else if (ty === 'howe') { if (left) B.b(bot[i], top[i + 1], 'diag', tr); else B.b(top[i], bot[i + 1], 'diag', tr); }
      else if (ty === 'warren' || ty === 'warrenv') { if (i % 2 === 0) B.b(bot[i], top[i + 1], 'diag', tr); else B.b(top[i], bot[i + 1], 'diag', tr); }
      else if (ty === 'k') {
        if (left) { if (top[i + 1] !== bot[i + 1]) { const mj = B.n((i + 1) * dx, ht(i + 1) / 2); B.b(mj, top[i], 'diag', tr); B.b(mj, bot[i], 'diag', tr); } }
        else if (top[i] !== bot[i]) { const mi = B.n(i * dx, ht(i) / 2); B.b(mi, top[i + 1], 'diag', tr); B.b(mi, bot[i + 1], 'diag', tr); }
      }
    }
    if (ty === 'k') { // słupki dzielone węzłem w połowie wysokości
      const vb = B.bars.filter(q => q.grp === 'vert'); vb.forEach(q => { const za = B.nodes[q.a], zb = B.nodes[q.b], m = B.map.get(`${Math.round(za.x * 1e4)}|${Math.round((za.z + zb.z) / 2 * 1e4)}`); if (m !== undefined) { const i = B.bars.indexOf(q); B.bars.splice(i, 1, { a: q.a, b: m, grp: 'vert', truss: true }, { a: m, b: q.b, grp: 'vert', truss: true }); } });
    }
    const sup = p.sup === 'top' ? top : bot;
    B.s(sup[0], 'pin'); B.s(sup[n], 'rollX');
  } else if (type === 'arch') {
    const L = num(p.L, 20), f = num(p.f, 4), n = Math.max(4, Math.round(num(p.n, 16)));
    const R = (L * L / 4 + f * f) / (2 * f);
    const zAt = x => p.shape === 'circ' ? Math.sqrt(Math.max(0, R * R - (x - L / 2) ** 2)) - (R - f) : 4 * f * x * (L - x) / (L * L);
    const ks = []; for (let i = 0; i <= n; i++) { const x = L * i / n; ks.push(B.n(x, zAt(x))); }
    for (let i = 0; i < n; i++) B.b(ks[i], ks[i + 1], 'arch', p.sup === 'pin3' && i === n / 2 - 1 ? { rel: [null, 0] } : null);
    if (p.sup === 'fix') { B.s(ks[0], 'fix'); B.s(ks[n], 'fix'); }
    else if (p.sup === 'tied') { B.s(ks[0], 'pin'); B.s(ks[n], 'rollX'); B.b(ks[0], ks[n], 'tie', { truss: true }); }
    else { B.s(ks[0], 'pin'); B.s(ks[n], 'pin'); }
  }
  return B;
};

// dołączenie wygenerowanego układu do projektu: secByGrp – id przekroju dla grupy; dx, dz – przesunięcie
G.apply = function (P, type, params, secByGrp, opt) {
  const M = root.RMODEL; opt = opt || {};
  const B = G.build(type, params), ox = num(opt.dx, 0), oz = num(opt.dz, 0);
  if (opt.replace) { P.nodes = []; P.bars = []; P.supports = []; P.loads = []; P.design = []; }
  const ids = B.nodes.map(q => M.addNode(P, q.x + ox, q.z + oz, 1e-4).id);
  const newBars = [];
  B.bars.forEach(q => { const b = M.addBar(P, ids[q.a], ids[q.b], secByGrp[q.grp] || secByGrp._ || (P.sections[0] && P.sections[0].id), { type: q.truss ? 'truss' : 'frame', rel: q.rel ? q.rel.slice() : [null, null] }); if (b) newBars.push(b.id); });
  B.sups.forEach(s => { if (!P.supports.some(q => q.node === ids[s.k])) M.setSupport(P, ids[s.k], s.type); });
  return { nodes: ids, bars: newBars };
};

root.RGEN = G;
if (typeof module !== 'undefined' && module.exports) module.exports = G;
})(typeof window !== 'undefined' ? window : globalThis);
