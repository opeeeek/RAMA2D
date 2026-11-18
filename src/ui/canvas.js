/* RAMA2D – rysunek modelu (SVG): modelowanie, obciążenia, wyniki */
(function () {
'use strict';
const RA = window.RA, Q = RA.Q, M = window.RMODEL, SEC = window.RSEC, CMB = window.RCOMB, D = window.RDES;
const { $, $$, esc, fmt } = Q;
const CV = RA.cv = {};
let svg = null, W = 900, H = 600;
const V = { cx: 5, cz: 2, k: 60 };
let tool = 'select', drawFrom = null, mouse = null, snapPt = null, drag = null, hoverId = null;
const SNAP_PX = 10, HIT_BAR = 7;
const X = x => (x - V.cx) * V.k + W / 2, Y = z => -(z - V.cz) * V.k + H / 2;
const wx = sx => (sx - W / 2) / V.k + V.cx, wz = sy => -(sy - H / 2) / V.k + V.cz;
const f2 = v => (Math.round(v * 100) / 100).toString().replace('.', ',');

CV.TOOLS = [
  ['select', 'Zaznacz / przesuń (V)', 'select'], ['bar', 'Rysuj pręty (B) – klik, klik…; Esc kończy', 'bar'], ['node', 'Węzeł na pręcie – podział pręta (N)', 'split'],
  ['support', 'Podpora (S) – kliknij węzeł', 'support'], ['load', 'Obciążenie (L) – kliknij pręt lub węzeł', 'load'], ['hinge', 'Przegub na końcu pręta (H) – kliknij przy węźle', 'hinge'],
  ['del', 'Usuń (D) – kliknij element', 'del'],
];
CV.setTool = t => { tool = t; drawFrom = null; $$('#mtools [data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t)); CV.render(); CV.status(); };
CV.tool = () => tool;

/* ------------------------------------------------------------ inicjalizacja */
CV.init = function () {
  const wrap = $('#cvwrap');
  wrap.innerHTML = '<svg id="cv" class="cvsvg" xmlns="http://www.w3.org/2000/svg"></svg>';
  svg = $('#cv');
  $('#mtools').innerHTML = CV.TOOLS.map(([k, t, ic]) => `<button data-tool="${k}" title="${esc(t)}" class="${k === tool ? 'on' : ''}">${Q.icon(ic, 20)}</button>`).join('') +
    `<span class="msep"></span><button data-mact="gen" title="Generator układów">${Q.icon('gen', 20)}</button><button data-mact="sec" title="Przekroje i materiały">${Q.icon('sec', 20)}</button><button data-mact="tables" title="Tabele węzłów i prętów">${Q.icon('table', 20)}</button>` +
    `<span class="msep"></span><button data-mact="undo" title="Cofnij (Ctrl+Z)">${Q.icon('undo', 20)}</button><button data-mact="redo" title="Ponów (Ctrl+Y)">${Q.icon('redo', 20)}</button><button data-mact="fit" title="Dopasuj widok (F)">${Q.icon('fit', 20)}</button>`;
  $$('#mtools [data-tool]').forEach(b => b.addEventListener('click', () => CV.setTool(b.dataset.tool)));
  $$('#mtools [data-mact]').forEach(b => b.addEventListener('click', () => ({ gen: () => RA.ui.generator(), sec: () => RA.ui.sections(), tables: () => RA.ui.tables(), undo: RA.undo, redo: RA.redo, fit: CV.fit })[b.dataset.mact]()));
  svg.addEventListener('wheel', onWheel, { passive: false });
  svg.addEventListener('pointerdown', onDown);
  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerup', onUp);
  svg.addEventListener('dblclick', onDbl);
  svg.addEventListener('contextmenu', e => e.preventDefault());
  svg.addEventListener('pointerleave', () => { mouse = null; snapPt = null; CV.renderOver(); });
  const cmd = $('#cmdline');
  cmd.addEventListener('keydown', e => { if (e.key === 'Enter') { CV.command(cmd.value); cmd.value = ''; } else if (e.key === 'Escape') { cmd.value = ''; cmd.blur(); CV.escape(); } e.stopPropagation(); });
  CV.resize();
};
CV.resize = function () { const r = $('#cvwrap').getBoundingClientRect(); if (r.width < 10) return; W = r.width; H = r.height; svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); CV.render(); };
CV.fit = function () {
  const P = RA.P; const r = $('#cvwrap').getBoundingClientRect(); if (r.width > 10) { W = r.width; H = r.height; }
  const b = M.bounds(P); const dx = Math.max(1, b.x1 - b.x0), dz = Math.max(1, b.z1 - b.z0);
  V.k = Math.min((W - 160) / dx, (H - 160) / dz, 400); if (!(V.k > 2)) V.k = 40;
  V.cx = (b.x0 + b.x1) / 2; V.cz = (b.z0 + b.z1) / 2; CV.render();
};
CV.escape = function () { if (drawFrom) { drawFrom = null; CV.render(); return; } if (drag) { drag = null; CV.render(); return; } if (RA.sel.nodes.size || RA.sel.bars.size || RA.sel.loads.size) { RA.sel.nodes.clear(); RA.sel.bars.clear(); RA.sel.loads.clear(); CV.render(); RA.ui.inspector(); return; } if (tool !== 'select') CV.setTool('select'); };
CV.key = function (e) {
  const k = e.key.toLowerCase(); if (e.ctrlKey || e.altKey || e.metaKey) { if (e.ctrlKey && k === 'a') { e.preventDefault(); RA.P.bars.forEach(b => RA.sel.bars.add(b.id)); RA.P.nodes.forEach(n => RA.sel.nodes.add(n.id)); CV.render(); RA.ui.inspector(); } return; }
  const map = { v: 'select', b: 'bar', n: 'node', s: 'support', l: 'load', h: 'hinge', d: 'del' };
  if (map[k]) { CV.setTool(map[k]); e.preventDefault(); }
  else if (k === 'f') { CV.fit(); e.preventDefault(); }
  else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); RA.ui.deleteSel(); }
  else if (/^[0-9@<\-]$/.test(e.key) && (tool === 'bar')) { const c = $('#cmdline'); c.focus(); }
};

/* ------------------------------------------------------------ trafienia i przyciąganie */
function nearNode(sx, sy, tol) { let best = null, bd = tol || SNAP_PX; RA.P.nodes.forEach(n => { const d = Math.hypot(X(n.x) - sx, Y(n.z) - sy); if (d < bd) { bd = d; best = n; } }); return best; }
function nearBar(sx, sy, tol) {
  let best = null, bd = tol || HIT_BAR;
  RA.P.bars.forEach(b => { const g = M.barGeom(RA.P, b); if (!g) return; const ax = X(g.a.x), ay = Y(g.a.z), bx = X(g.b.x), by = Y(g.b.z); const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy; let t = L2 ? ((sx - ax) * dx + (sy - ay) * dy) / L2 : 0; t = Math.max(0, Math.min(1, t)); const d = Math.hypot(ax + t * dx - sx, ay + t * dy - sy); if (d < bd) { bd = d; best = { bar: b, t, g }; } });
  return best;
}
function snap(sx, sy, o) {
  o = o || {};
  const n = nearNode(sx, sy); if (n) return { x: n.x, z: n.z, node: n, kind: 'węzeł ' + n.id };
  const P = RA.P, g = +P.settings.grid || 0.5, useGrid = P.settings.snap !== false;
  const hb = nearBar(sx, sy, 6);
  if (hb && !o.noBar) {
    // punkt na pręcie: zaokrąglenie do siatki wzdłuż pręta lub do 1/n długości
    let t = hb.t; const L = hb.g.L;
    const cand = [0.5, 1 / 3, 2 / 3, 0.25, 0.75].find(f => Math.abs(t - f) * L * V.k < 8);
    if (cand !== undefined) t = cand; else if (useGrid) t = Math.round(t * L / g) * g / L;
    t = Math.max(0, Math.min(1, t));
    return { x: hb.g.a.x + hb.g.dx * t, z: hb.g.a.z + hb.g.dz * t, bar: hb.bar, t, kind: `pręt ${hb.bar.id}, ${f2(t * L)} m` };
  }
  let x = wx(sx), z = wz(sy);
  if (useGrid) { x = Math.round(x / g) * g; z = Math.round(z / g) * g; }
  // przyciąganie ortogonalne do punktu początkowego rysowania
  if (drawFrom && !o.free) { const a = M.node(RA.P, drawFrom); if (a) { if (Math.abs(X(x) - X(a.x)) < 8) x = a.x; if (Math.abs(Y(z) - Y(a.z)) < 8) z = a.z; } }
  return { x: Math.round(x * 1e6) / 1e6, z: Math.round(z * 1e6) / 1e6, kind: useGrid ? 'siatka' : '' };
}
// węzeł w punkcie przyciągnięcia (istniejący, z podziałem pręta lub nowy)
function nodeAt(sp) {
  const P = RA.P;
  if (sp.node) return sp.node;
  if (sp.bar && sp.t > 1e-6 && sp.t < 1 - 1e-6) { const r = M.splitBar(P, sp.bar.id, sp.t); return r ? r.node : null; }
  if (sp.bar) return M.node(P, sp.t < 0.5 ? sp.bar.n1 : sp.bar.n2);
  return M.addNode(P, sp.x, sp.z, 1e-6);
}

/* ------------------------------------------------------------ zdarzenia */
function pos(e) { const r = svg.getBoundingClientRect(); return { sx: e.clientX - r.left, sy: e.clientY - r.top }; }
function onWheel(e) {
  e.preventDefault(); const p = pos(e), x0 = wx(p.sx), z0 = wz(p.sy);
  const f = Math.exp(-e.deltaY * 0.0015); V.k = Math.max(2, Math.min(5000, V.k * f));
  V.cx = x0 - (p.sx - W / 2) / V.k; V.cz = z0 + (p.sy - H / 2) / V.k; CV.render();
}
function onDown(e) {
  const p = pos(e); svg.setPointerCapture(e.pointerId);
  if (e.button === 1 || e.button === 2 || (e.button === 0 && e.altKey)) { drag = { pan: true, sx: p.sx, sy: p.sy, cx: V.cx, cz: V.cz, moved: false, btn: e.button }; return; }
  if (e.button !== 0) return;
  if (tool === 'select') {
    const n = nearNode(p.sx, p.sy, 8);
    if (n) { if (!e.shiftKey && !RA.sel.nodes.has(n.id)) { RA.sel.nodes.clear(); RA.sel.bars.clear(); RA.sel.loads.clear(); } RA.sel.nodes.add(n.id); drag = { node: n.id, sx: p.sx, sy: p.sy, x0: n.x, z0: n.z, moved: false }; CV.render(); RA.ui.inspector(); return; }
    const hb = nearBar(p.sx, p.sy);
    if (hb) { if (e.shiftKey) { if (RA.sel.bars.has(hb.bar.id)) RA.sel.bars.delete(hb.bar.id); else RA.sel.bars.add(hb.bar.id); } else { RA.sel.nodes.clear(); RA.sel.bars.clear(); RA.sel.loads.clear(); RA.sel.bars.add(hb.bar.id); } CV.render(); RA.ui.inspector(); return; }
    drag = { box: true, sx: p.sx, sy: p.sy, ex: p.sx, ey: p.sy, add: e.shiftKey };
    return;
  }
  CV.clickTool(p, e);
}
function onMove(e) {
  const p = pos(e);
  if (drag && drag.pan) { const dx = p.sx - drag.sx, dy = p.sy - drag.sy; if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true; V.cx = drag.cx - dx / V.k; V.cz = drag.cz + dy / V.k; CV.render(); return; }
  if (drag && drag.box) { drag.ex = p.sx; drag.ey = p.sy; CV.renderOver(); return; }
  if (drag && drag.node !== undefined) {
    if (!drag.moved && Math.hypot(p.sx - drag.sx, p.sy - drag.sy) < 4) return;
    drag.moved = true; const n = M.node(RA.P, drag.node); const sp = snap(p.sx, p.sy, { noBar: true });
    if (sp.node && sp.node.id !== n.id) { snapPt = sp; } else { n.x = sp.node ? sp.node.x : sp.x; n.z = sp.node ? sp.node.z : sp.z; }
    CV.render(); return;
  }
  mouse = { sx: p.sx, sy: p.sy };
  snapPt = (tool === 'bar' || tool === 'node' || tool === 'select') ? snap(p.sx, p.sy) : null;
  // podświetlenie elementu pod kursorem
  const n = nearNode(p.sx, p.sy, 8), hb = n ? null : nearBar(p.sx, p.sy);
  const hid = n ? 'n' + n.id : hb ? 'b' + hb.bar.id : null;
  if (hid !== hoverId) { hoverId = hid; CV.render(); } else CV.renderOver();
  CV.status();
}
function onUp(e) {
  const p = pos(e);
  if (drag && drag.pan) { const d = drag; drag = null; if (!d.moved && d.btn === 2) CV.context(p, e); return; }
  if (drag && drag.box) {
    const d = drag; drag = null;
    const x0 = Math.min(d.sx, d.ex), x1 = Math.max(d.sx, d.ex), y0 = Math.min(d.sy, d.ey), y1 = Math.max(d.sy, d.ey);
    if (!d.add) { RA.sel.nodes.clear(); RA.sel.bars.clear(); RA.sel.loads.clear(); }
    if (x1 - x0 > 4 || y1 - y0 > 4) {
      const inside = n => X(n.x) >= x0 && X(n.x) <= x1 && Y(n.z) >= y0 && Y(n.z) <= y1;
      RA.P.nodes.forEach(n => { if (inside(n)) RA.sel.nodes.add(n.id); });
      RA.P.bars.forEach(b => { const a = M.node(RA.P, b.n1), c = M.node(RA.P, b.n2); if (a && c && inside(a) && inside(c)) RA.sel.bars.add(b.id); });
    }
    CV.render(); RA.ui.inspector(); return;
  }
  if (drag && drag.node !== undefined) {
    const d = drag; drag = null;
    if (d.moved) {
      const n = M.node(RA.P, d.node);
      if (snapPt && snapPt.node && snapPt.node.id !== n.id) { n.x = snapPt.node.x; n.z = snapPt.node.z; const k = M.mergeNodes(RA.P, 1e-6); snapPt = null; if (k) Q.toast('Węzły połączone.'); }
      RA.change();
    }
  }
}
function onDbl(e) { const p = pos(e); const n = nearNode(p.sx, p.sy, 8); if (n) { RA.ui.nodeDialog(n.id); return; } const hb = nearBar(p.sx, p.sy); if (hb) RA.ui.barDialog(hb.bar.id); }

CV.clickTool = function (p, e) {
  const P = RA.P;
  if (tool === 'bar') {
    const sp = snap(p.sx, p.sy);
    CV.addPoint(sp); return;
  }
  if (tool === 'node') { const hb = nearBar(p.sx, p.sy); if (!hb) { Q.toast('Kliknij pręt, aby wstawić węzeł.'); return; } const sp = snap(p.sx, p.sy); if (sp.node) { Q.toast('W tym miejscu jest już węzeł.'); return; } if (sp.bar) { M.splitBar(P, sp.bar.id, sp.t); RA.change(); } return; }
  if (tool === 'support') { const n = nearNode(p.sx, p.sy, 12); if (!n) { Q.toast('Kliknij węzeł, aby zadać podporę.'); return; } RA.ui.supportMenu(n.id, e.clientX, e.clientY); return; }
  if (tool === 'load') {
    if (!RA.activeCase) { Q.toast('Najpierw dodaj przypadek obciążenia.'); return; }
    const n = nearNode(p.sx, p.sy, 9); if (n) { RA.ui.loadDialog({ kind: 'node', node: n.id }); return; }
    const hb = nearBar(p.sx, p.sy); if (hb) { RA.ui.loadDialog({ kind: 'dist', bar: hb.bar.id, t: hb.t }); return; }
    Q.toast('Kliknij pręt (obciążenie prętowe) albo węzeł (siła węzłowa).'); return;
  }
  if (tool === 'hinge') {
    const hb = nearBar(p.sx, p.sy, 10); if (!hb) { Q.toast('Kliknij pręt przy węźle, w którym ma być przegub.'); return; }
    const b = hb.bar, end = hb.t < 0.5 ? 0 : 1; if (b.type === 'truss') { Q.toast('Pręt kratowy – przeguby na obu końcach.'); return; }
    b.rel[end] = b.rel[end] === null ? 0 : null; RA.change(); Q.toast(`Pręt ${b.id}, koniec ${end === 0 ? 'początkowy' : 'końcowy'}: ${b.rel[end] === null ? 'połączenie sztywne' : 'przegub'}`); return;
  }
  if (tool === 'del') {
    const n = nearNode(p.sx, p.sy, 8); if (n) { M.deleteNodes(P, [n.id]); RA.change(); return; }
    const hb = nearBar(p.sx, p.sy); if (hb) { M.deleteBars(P, [hb.bar.id]); RA.change(); }
  }
};
CV.addPoint = function (sp) {
  const P = RA.P;
  if (!P.sections.length) { RA.ui.sections(true); Q.toast('Najpierw zdefiniuj przekrój prętów.'); return; }
  const n = nodeAt(sp); if (!n) return;
  if (drawFrom && drawFrom !== n.id) {
    const sec = RA.ui.curSec(); const b = M.addBar(P, drawFrom, n.id, sec);
    if (b) { RA.lastBar = b.id; }
    RA.change();
  } else RA.change({ noUndo: false });
  drawFrom = n.id;
};
// linia poleceń: „x; z”, „@dx; dz” (względnie), „<L; α” (długość i kąt względem ostatniego punktu)
CV.command = function (s) {
  const t = s.trim(); if (!t) return;
  const parts = t.replace(/^[@<]/, '').split(/[;\s]+/).map(Q.num);
  if (parts.length < 2 || parts.some(v => v === null)) { Q.toast('Podaj: x; z  albo  @dx; dz  albo  <L; kąt[°]'); return; }
  let x = parts[0], z = parts[1];
  const a = drawFrom ? M.node(RA.P, drawFrom) : null;
  if (t[0] === '@') { if (!a) { Q.toast('Brak punktu początkowego – podaj współrzędne bezwzględne.'); return; } x = a.x + parts[0]; z = a.z + parts[1]; }
  if (t[0] === '<') { if (!a) { Q.toast('Brak punktu początkowego.'); return; } const r = parts[1] * Math.PI / 180; x = a.x + parts[0] * Math.cos(r); z = a.z + parts[0] * Math.sin(r); }
  if (tool !== 'bar') CV.setTool('bar');
  const ex = RA.P.nodes.find(n => Math.abs(n.x - x) < 1e-6 && Math.abs(n.z - z) < 1e-6);
  CV.addPoint(ex ? { node: ex } : { x: Math.round(x * 1e6) / 1e6, z: Math.round(z * 1e6) / 1e6 });
};
CV.context = function (p, e) {
  const P = RA.P, n = nearNode(p.sx, p.sy, 8), hb = n ? null : nearBar(p.sx, p.sy);
  if (drawFrom) { drawFrom = null; CV.render(); return; }
  if (n) {
    Q.menu(e.clientX, e.clientY, [
      { label: `<b>Węzeł ${n.id}</b> (${f2(n.x)}; ${f2(n.z)})`, dis: true },
      { label: 'Właściwości węzła…', fn: () => RA.ui.nodeDialog(n.id) },
      { label: 'Podpora…', fn: () => RA.ui.supportMenu(n.id, e.clientX, e.clientY) },
      { label: 'Obciążenie węzłowe…', fn: () => RA.ui.loadDialog({ kind: 'node', node: n.id }) },
      { label: 'Osiadanie / przemieszczenie wymuszone…', fn: () => RA.ui.loadDialog({ kind: 'settle', node: n.id }), dis: !P.supports.some(s => s.node === n.id) },
      { sep: true }, { label: 'Usuń węzeł', fn: () => { M.deleteNodes(P, [n.id]); RA.change(); } }]);
    return;
  }
  if (hb) {
    const b = hb.bar, el = D.elementOf(P, b.id), mat = (M.sec(P, b.sec) || {}).mat;
    const items = [
      { label: `<b>Pręt ${b.id}</b> – ${esc(SEC.fullLabel(M.sec(P, b.sec)))}`, dis: true },
      { label: 'Właściwości pręta…', fn: () => RA.ui.barDialog(b.id) },
      { label: 'Obciążenie rozłożone…', fn: () => RA.ui.loadDialog({ kind: 'dist', bar: b.id }) },
      { label: 'Siła skupiona…', fn: () => RA.ui.loadDialog({ kind: 'point', bar: b.id, t: hb.t }) },
      { label: 'Moment skupiony…', fn: () => RA.ui.loadDialog({ kind: 'moment', bar: b.id, t: hb.t }) },
      { label: 'Temperatura…', fn: () => RA.ui.loadDialog({ kind: 'temp', bar: b.id }) },
      { sep: true },
      { label: 'Wstaw węzeł (podziel pręt)…', fn: () => RA.ui.splitDialog(b.id, hb.t) },
      { label: `Przegub na początku: ${b.rel[0] === null ? 'dodaj' : 'usuń'}`, fn: () => { b.rel[0] = b.rel[0] === null ? 0 : null; RA.change(); }, dis: b.type === 'truss' },
      { label: `Przegub na końcu: ${b.rel[1] === null ? 'dodaj' : 'usuń'}`, fn: () => { b.rel[1] = b.rel[1] === null ? 0 : null; RA.change(); }, dis: b.type === 'truss' },
      { sep: true },
      el ? { label: `Otwórz element <b>${esc(el.name)}</b> w module ${D.MODS[el.mod].n}`, fn: () => RA.mod.open(el.id) } : { label: `Wymiaruj w module ${mat ? D.MODS[D.modOfMat(mat)].n : ''}…`, fn: () => RA.ui.designFromBar(b.id), dis: !mat },
      { sep: true }, { label: 'Usuń pręt', fn: () => { M.deleteBars(P, [b.id]); RA.change(); } }];
    Q.menu(e.clientX, e.clientY, items); return;
  }
  Q.menu(e.clientX, e.clientY, [{ label: 'Dopasuj widok', fn: CV.fit }, { label: 'Generator układów…', fn: () => RA.ui.generator() }, { label: 'Przekroje i materiały…', fn: () => RA.ui.sections() }, { sep: true }, { label: RA.view.labels ? 'Ukryj numery' : 'Pokaż numery', fn: () => { RA.view.labels = !RA.view.labels; CV.render(); } }]);
};

/* ------------------------------------------------------------ rysowanie */
const C = { bar: { C: '#7d8696', S: '#2f5f9e', D: '#b07a2c' }, sel: '#e0761b', hov: '#1d5bb8' };
function supSym(sp, x, y) {
  const s = 14, a = -(sp.ang || 0), kind = M.supKind(sp);
  let g = '';
  const hatch = (y0, w) => { let h = `<path d="M${-w} ${y0}H${w}" class="sup"/>`; for (let i = -w; i < w; i += 5) h += `<path d="M${i} ${y0 + 6}L${i + 5} ${y0}" class="suph"/>`; return h; };
  if (kind === 'fix') g = hatch(0, 13).replace(`d="M-13 0H13"`, 'd="M-13 0H13"');
  else if (kind === 'pin') g = `<path d="M0 0L-8 ${s}H8Z" class="supf"/>` + hatch(s, 12);
  else if (kind === 'rollX') g = `<path d="M0 0L-8 ${s - 4}H8Z" class="supf"/><path d="M-11 ${s}H11" class="sup"/>` + hatch(s + 3, 12);
  else if (kind === 'rollZ') g = `<g transform="rotate(-90)"><path d="M0 0L-8 ${s - 4}H8Z" class="supf"/><path d="M-11 ${s}H11" class="sup"/>${hatch(s + 3, 12)}</g>`;
  else if (kind === 'slideX') g = `<path d="M-10 0H10" class="sup"/><path d="M-10 5H10" class="sup"/>` + hatch(9, 12);
  else if (kind === 'slideZ') g = `<g transform="rotate(-90)"><path d="M-10 0H10" class="sup"/><path d="M-10 5H10" class="sup"/>${hatch(9, 12)}</g>`;
  else if (kind === 'spring') g = `<path d="M0 0l-5 3 10 4-10 4 10 4-5 3v4" class="sup"/>` + hatch(22, 10) + (sp.kr > 0 ? `<path d="M-9 -2a9 9 0 1 0 18 0" class="sup" fill="none"/>` : '');
  else g = `<path d="M0 0L-8 ${s}H8Z" class="supf" stroke-dasharray="2 2"/>` + hatch(s, 12);
  if (kind === 'fix' && false) g += '';
  return `<g transform="translate(${x},${y}) rotate(${a})">${g}</g>`;
}
function arrow(x1, y1, x2, y2, cls, head) {
  const h = head || 7, ang = Math.atan2(y2 - y1, x2 - x1), a1 = ang + Math.PI * 0.85, a2 = ang - Math.PI * 0.85;
  return `<path d="M${x1},${y1}L${x2},${y2}M${x2},${y2}L${x2 + h * Math.cos(a1)},${y2 + h * Math.sin(a1)}M${x2},${y2}L${x2 + h * Math.cos(a2)},${y2 + h * Math.sin(a2)}" class="${cls}"/>`;
}
function txt(x, y, s, cls, anchor) { return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" class="${cls || ''}" text-anchor="${anchor || 'middle'}">${esc(s)}</text>`; }

CV.render = function () {
  if (!svg) return;
  const P = RA.P, R = RA.R, out = [];
  // siatka
  if (RA.view.grid) {
    const g = +P.settings.grid || 0.5; let step = g; while (step * V.k < 12) step *= 2;
    const x0 = Math.floor(wx(0) / step) * step, x1 = wx(W), z0 = Math.floor(wz(H) / step) * step, z1 = wz(0);
    let d = '', d2 = '';
    for (let x = x0; x <= x1; x += step) { const sx = X(x).toFixed(1); (Math.abs(Math.round(x / (step * 5)) * step * 5 - x) < 1e-9 ? d2 : d) !== null; if (Math.abs(x / (step * 5) - Math.round(x / (step * 5))) < 1e-6) d2 += `M${sx} 0V${H}`; else d += `M${sx} 0V${H}`; }
    for (let z = z0; z <= z1; z += step) { const sy = Y(z).toFixed(1); if (Math.abs(z / (step * 5) - Math.round(z / (step * 5))) < 1e-6) d2 += `M0 ${sy}H${W}`; else d += `M0 ${sy}H${W}`; }
    out.push(`<path d="${d}" class="grid"/><path d="${d2}" class="grid2"/>`);
    out.push(`<path d="M${X(0)} ${Y(0) - 6}V${Y(0) + 6}M${X(0) - 6} ${Y(0)}H${X(0) + 6}" class="origin"/>`);
  }
  const mode = RA.view.mode, res = (R && R.ok && mode !== 'model') ? RA.resOf(RA.view.src) : null;
  // wykresy pod prętami
  if (res) out.push(CV.diagrams(res));
  // pręty
  const etaCol = mode === 'eta' ? etaColors() : null;
  P.bars.forEach(b => {
    const g = M.barGeom(P, b); if (!g) return;
    const s = M.sec(P, b.sec), mat = s ? s.mat : 'C';
    const ax = X(g.a.x), ay = Y(g.a.z), bx = X(g.b.x), by = Y(g.b.z);
    const sel = RA.sel.bars.has(b.id), hov = hoverId === 'b' + b.id;
    let col = C.bar[mat] || '#777'; if (etaCol && etaCol[b.id]) col = etaCol[b.id];
    const w = b.type === 'truss' ? 2.2 : 3.6;
    if (sel || hov) out.push(`<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="${sel ? C.sel : C.hov}" stroke-opacity=".35" stroke-width="${w + 8}" stroke-linecap="round"/>`);
    out.push(`<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="${col}" stroke-width="${w}" stroke-linecap="round" class="barln"/>`);
    // linia spodu (strona z̄) – pręty ramowe
    if (b.type !== 'truss' && Math.hypot(bx - ax, by - ay) > 30 && mode === 'model') {
      const nx = g.s, ny = -g.c; // z̄ w świecie: (s, −c) → ekran (s, c)
      const o = 5, ex = nx * o, ey = -ny * o, k0 = 0.12, k1 = 0.88;
      out.push(`<line x1="${ax + (bx - ax) * k0 + ex}" y1="${ay + (by - ay) * k0 + ey}" x2="${ax + (bx - ax) * k1 + ex}" y2="${ay + (by - ay) * k1 + ey}" class="botln"/>`);
    }
    // przeguby
    const L = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / L, uy = (by - ay) / L;
    [0, 1].forEach(end => { const r = b.type === 'truss' ? 0 : b.rel[end]; if (r === null || r === undefined) return; const px = end ? bx - ux * 9 : ax + ux * 9, py = end ? by - uy * 9 : ay + uy * 9; out.push(`<circle cx="${px}" cy="${py}" r="4" class="${r > 0 ? 'semi' : 'hinge'}"/>`); });
    if (b.type === 'truss') { [0, 1].forEach(end => { const px = end ? bx - ux * 7 : ax + ux * 7, py = end ? by - uy * 7 : ay + uy * 7; out.push(`<circle cx="${px}" cy="${py}" r="2.6" class="hinge"/>`); }); }
    if (RA.view.labels && L > 26) { const mx = (ax + bx) / 2, my = (ay + by) / 2, ox = -uy * 11, oy = ux * 11; out.push(`<g class="blab${sel ? ' on' : ''}"><rect x="${mx - ox - 9}" y="${my - oy - 7}" width="18" height="13" rx="3"/>${txt(mx - ox, my - oy + 3.5, String(b.id), 'blt')}</g>`); }
    if (RA.view.secLabels && L > 60 && s) { const mx = (ax + bx) / 2, my = (ay + by) / 2; out.push(`<text x="${mx}" y="${my}" dy="${18}" class="seclab" transform="rotate(${-Math.atan2(g.dz, g.dx) * 180 / Math.PI > 90 || -Math.atan2(g.dz, g.dx) * 180 / Math.PI < -90 ? 180 - Math.atan2(g.dz, g.dx) * 180 / Math.PI : -Math.atan2(g.dz, g.dx) * 180 / Math.PI} ${mx} ${my})" text-anchor="middle">${esc(SEC.label(s))}</text>`); }
  });
  // podpory
  P.supports.forEach(sp => { const n = M.node(P, sp.node); if (n) out.push(supSym(sp, X(n.x), Y(n.z))); });
  // obciążenia aktywnego przypadku
  if (RA.view.loads && (mode === 'model' || RA.view.loadsOnRes)) out.push(CV.loadsSVG(RA.activeCase));
  // reakcje
  if (res && mode === 'R') out.push(CV.reactions(res));
  // węzły
  P.nodes.forEach(n => {
    const sel = RA.sel.nodes.has(n.id), hov = hoverId === 'n' + n.id, x = X(n.x), y = Y(n.z);
    out.push(`<rect x="${x - 3.5}" y="${y - 3.5}" width="7" height="7" class="node${sel ? ' on' : ''}${hov ? ' hov' : ''}"/>`);
    if (RA.view.labels) out.push(txt(x + 7, y - 7, String(n.id), 'nlab', 'start'));
  });
  svg.innerHTML = `<g>${out.join('')}</g><g id="over"></g>`;
  CV.renderOver();
  CV.legend(res);
};
// warstwa robocza: kursor przyciągania, linia rysowania, ramka zaznaczenia
CV.renderOver = function () {
  const o = svg && svg.querySelector('#over'); if (!o) return;
  let s = '';
  if (drawFrom && mouse && tool === 'bar') { const a = M.node(RA.P, drawFrom); const sp = snapPt || snap(mouse.sx, mouse.sy); if (a) { const L = Math.hypot(sp.x - a.x, sp.z - a.z), ang = Math.atan2(sp.z - a.z, sp.x - a.x) * 180 / Math.PI; s += `<line x1="${X(a.x)}" y1="${Y(a.z)}" x2="${X(sp.x)}" y2="${Y(sp.z)}" class="rubber"/>` + txt((X(a.x) + X(sp.x)) / 2 + 8, (Y(a.z) + Y(sp.z)) / 2 - 8, `L = ${f2(L)} m, α = ${f2(ang)}°`, 'rubtxt', 'start'); } }
  if (snapPt && mouse && (tool === 'bar' || tool === 'node')) s += `<circle cx="${X(snapPt.x)}" cy="${Y(snapPt.z)}" r="${snapPt.node ? 7 : 5}" class="snap${snapPt.node ? ' n' : snapPt.bar ? ' b' : ''}"/>`;
  if (drag && drag.box) { const x0 = Math.min(drag.sx, drag.ex), y0 = Math.min(drag.sy, drag.ey); s += `<rect x="${x0}" y="${y0}" width="${Math.abs(drag.ex - drag.sx)}" height="${Math.abs(drag.ey - drag.sy)}" class="selbox"/>`; }
  o.innerHTML = s;
};
CV.status = function () {
  const el = $('#mstatTxt'); if (!el) return;
  const T = { select: 'Zaznaczanie: klik – element, Shift – dodaj, przeciągnij – ramka / przesuń węzeł; prawy klik – menu; kółko – zoom; środkowy/prawy przycisk – przesuwanie widoku', bar: drawFrom ? 'Rysowanie: kliknij kolejny punkt (lub wpisz współrzędne niżej); Esc / prawy klik – koniec' : 'Rysowanie prętów: kliknij punkt początkowy (węzeł, punkt na pręcie lub siatki)', node: 'Kliknij pręt, aby wstawić węzeł (podział pręta)', support: 'Kliknij węzeł, aby wybrać rodzaj podpory', load: `Kliknij pręt lub węzeł – obciążenie w przypadku ${RA.activeCase || '—'}`, hinge: 'Kliknij pręt przy węźle – przegub na tym końcu pręta (ponownie – usuń)', del: 'Kliknij węzeł lub pręt, aby go usunąć' };
  const c = snapPt && mouse ? `x = ${f2(snapPt.x)}  z = ${f2(snapPt.z)}${snapPt.kind ? '  · ' + snapPt.kind : ''}` : (mouse ? `x = ${f2(wx(mouse.sx))}  z = ${f2(wz(mouse.sy))}` : '');
  el.innerHTML = `<span class="mcoord">${esc(c)}</span><span>${esc(T[tool] || '')}</span>`;
};

// migawka rysunku (SVG jako tekst) w zadanym trybie – do raportu; widok użytkownika zostaje przywrócony
CV.snapshot = function (mode, src, o) {
  o = o || {};
  if (!svg) return '';
  const keep = Object.assign({}, RA.view), keepV = Object.assign({}, V), keepSel = RA.sel, keepCase = RA.activeCase;
  const keepW = W, keepH = H;
  W = o.w || 1000; H = o.h || 560;
  RA.view.mode = mode; RA.view.src = src || RA.view.src; RA.view.grid = false; RA.view.labels = o.labels !== false; RA.view.scaleK = 1; RA.view.loads = o.loads !== false;
  RA.sel = { nodes: new Set(), bars: new Set(), loads: new Set() };
  if (o.case) RA.activeCase = o.case;
  const b = M.bounds(RA.P), dx = Math.max(1, b.x1 - b.x0), dz = Math.max(1, b.z1 - b.z0);
  V.k = Math.min((W - 180) / dx, (H - 170) / dz, 400); V.cx = (b.x0 + b.x1) / 2; V.cz = (b.z0 + b.z1) / 2;
  hoverId = null;
  CV.render();
  const out = `<svg class="cvsvg" xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${svg.innerHTML.replace(/<g id="over"><\/g>/, '')}</svg>`;
  Object.assign(RA.view, keep); Object.assign(V, keepV); RA.sel = keepSel; RA.activeCase = keepCase; W = keepW; H = keepH;
  CV.render();
  return out;
};

/* ------------------------------------------------------------ obciążenia na rysunku */
CV.loadsSVG = function (caseId) {
  const P = RA.P, out = [], lc = P.cases.find(c => c.id === caseId); if (!lc) return '';
  const col = (CMB.CATS[lc.cat] || {}).color || '#1d5bb8';
  const sc = 26;    // wysokość wykresu obciążenia [px] dla największej wartości
  const loads = P.loads.filter(l => l.case === caseId);
  const qmax = Math.max(1e-9, ...loads.filter(l => l.kind === 'dist').map(l => Math.max(Math.abs(+l.q1 || 0), Math.abs(l.q2 === '' || l.q2 === undefined ? +l.q1 || 0 : +l.q2))));
  if (lc.sw) P.bars.forEach(b => { const g = M.barGeom(P, b); if (!g) return; out.push(txt((X(g.a.x) + X(g.b.x)) / 2, (Y(g.a.z) + Y(g.b.z)) / 2 + 16, '', '')); });
  loads.forEach(l => {
    const sel = RA.sel.loads.has(l.id), cls = `ld${sel ? ' on' : ''}`;
    if (l.kind === 'node') {
      const n = M.node(P, l.node); if (!n) return; const x = X(n.x), y = Y(n.z);
      const Fx = +l.Fx || 0, Fz = +l.Fz || 0, Mm = +l.M || 0;
      if (Fz) { const d = Fz > 0 ? 1 : -1; out.push(`<g class="${cls}" style="--lc:${col}" data-load="${l.id}">${arrow(x, y - d * 46, x, y - d * 6, 'la', 8)}${txt(x + 6, y - d * 46 + (d > 0 ? 0 : 10), `${f2(Math.abs(Fz))} kN`, 'ltx', 'start')}</g>`); }
      if (Fx) { const d = Fx > 0 ? 1 : -1; out.push(`<g class="${cls}" style="--lc:${col}">${arrow(x - d * 46, y, x - d * 6, y, 'la', 8)}${txt(x - d * 30, y - 6, `${f2(Math.abs(Fx))} kN`, 'ltx')}</g>`); }
      if (Mm) { const cw = Mm > 0; out.push(`<g class="${cls}" style="--lc:${col}"><path d="M${x - 14},${y - 8}A16 16 0 1 ${cw ? 1 : 0} ${x + 14},${y - 8}" class="la"/>${cw ? arrow(x + 10, y - 16, x + 14, y - 8, 'la', 6) : arrow(x - 10, y - 16, x - 14, y - 8, 'la', 6)}${txt(x, y - 28, `${f2(Math.abs(Mm))} kNm`, 'ltx')}</g>`); }
      return;
    }
    if (l.kind === 'settle') { const n = M.node(P, l.node); if (!n) return; out.push(`<g class="${cls}" style="--lc:${col}">${txt(X(n.x), Y(n.z) + 34, `Δ ${[+l.dx ? 'x ' + f2(+l.dx) : '', +l.dz ? 'z ' + f2(+l.dz) : '', +l.dr ? 'φ ' + f2(+l.dr) : ''].filter(Boolean).join(', ')} mm`, 'ltx')}</g>`); return; }
    const b = M.bar(P, l.bar); if (!b) return; const g = M.barGeom(P, b); if (!g) return;
    const pt = t => ({ x: X(g.a.x + g.dx * t), y: Y(g.a.z + g.dz * t) });
    if (l.kind === 'dist') {
      const t1 = +l.x1 || 0, t2 = l.x2 === '' || l.x2 === undefined ? 1 : +l.x2, q1 = +l.q1 || 0, q2 = l.q2 === '' || l.q2 === undefined ? q1 : +l.q2;
      // kierunek strzałek na ekranie
      let dx, dy;
      if (l.dir === 'Z') { dx = 0; dy = 1; } else if (l.dir === 'X') { dx = 1; dy = 0; } else if (l.dir === 'z') { dx = g.s; dy = g.c; } else { dx = g.c; dy = -g.s; }
      const A = pt(t1), B = pt(t2), h1 = sc * q1 / qmax, h2 = sc * q2 / qmax;
      const a0 = { x: A.x - dx * h1, y: A.y - dy * h1 }, b0 = { x: B.x - dx * h2, y: B.y - dy * h2 };
      let s = `<path d="M${A.x},${A.y}L${a0.x},${a0.y}L${b0.x},${b0.y}L${B.x},${B.y}" class="lq"/>`;
      const n = Math.max(2, Math.min(14, Math.round(Math.hypot(B.x - A.x, B.y - A.y) / 22)));
      for (let i = 0; i <= n; i++) { const t = i / n, px = A.x + (B.x - A.x) * t, py = A.y + (B.y - A.y) * t, h = h1 + (h2 - h1) * t; if (Math.abs(h) > 3) s += arrow(px - dx * h, py - dy * h, px, py, 'la', 5); }
      const lab = Math.abs(q1 - q2) < 1e-9 ? `${f2(q1)}` : `${f2(q1)}…${f2(q2)}`;
      s += txt((a0.x + b0.x) / 2, (a0.y + b0.y) / 2 - 5, `${lab} kN/m${l.proj ? ' (rzut)' : ''}${l.dir === 'z' ? ' ⊥' : l.dir === 'x' ? ' ∥' : ''}`, 'ltx');
      out.push(`<g class="${cls}" style="--lc:${col}">${s}</g>`);
    } else if (l.kind === 'point') {
      const p = pt(+l.x || 0), P0 = +l.P || 0; let dx, dy;
      if (l.dir === 'Z') { dx = 0; dy = 1; } else if (l.dir === 'X') { dx = 1; dy = 0; } else if (l.dir === 'z') { dx = g.s; dy = g.c; } else { dx = g.c; dy = -g.s; }
      const d = P0 >= 0 ? 1 : -1;
      out.push(`<g class="${cls}" style="--lc:${col}">${arrow(p.x - dx * d * 42, p.y - dy * d * 42, p.x - dx * d * 4, p.y - dy * d * 4, 'la', 8)}${txt(p.x - dx * d * 42 + 6, p.y - dy * d * 42 - 4, `${f2(Math.abs(P0))} kN`, 'ltx', 'start')}</g>`);
    } else if (l.kind === 'moment') {
      const p = pt(+l.x || 0), Mm = +l.M || 0, cw = Mm > 0;
      out.push(`<g class="${cls}" style="--lc:${col}"><path d="M${p.x - 13},${p.y - 7}A15 15 0 1 ${cw ? 1 : 0} ${p.x + 13},${p.y - 7}" class="la"/>${cw ? arrow(p.x + 9, p.y - 15, p.x + 13, p.y - 7, 'la', 6) : arrow(p.x - 9, p.y - 15, p.x - 13, p.y - 7, 'la', 6)}${txt(p.x, p.y - 26, `${f2(Math.abs(Mm))} kNm`, 'ltx')}</g>`);
    } else if (l.kind === 'temp') {
      const p = pt(0.5); out.push(`<g class="${cls}" style="--lc:${col}">${txt(p.x, p.y + 20, `ΔT = ${f2(+l.dT || 0)} K${+l.dTg ? `, ΔT_d−g = ${f2(+l.dTg)} K` : ''}`, 'ltx')}</g>`);
    }
  });
  if (lc.sw) out.push(`<text x="${12}" y="${H - 34}" class="ltx" style="fill:${col}">+ ciężar własny prętów (automatycznie)</text>`);
  return out.join('');
};

/* ------------------------------------------------------------ wyniki */
// źródło wyników: 'case:G1' | 'combo:ULS3' | 'ENV:ULS' | 'ENV:CHAR' | 'ENV:FREQ' | 'ENV:QP' | 'ENV:ACC' | 'buck:<comboId>:<k>'
RA.resOf = function (src) {
  const R = RA.R, P = RA.P; if (!R || !R.ok) return null;
  const [kind, id, k] = String(src || 'ENV:ULS').split(':');
  if (kind === 'case' && R.cases[id]) { const c = R.cases[id]; return { bars: c.bars, reac: c.reac, disp: c.disp, label: `przypadek ${id}` }; }
  if (kind === 'combo') { const c = R.combos.find(q => q.id === id) || (R.p2list || []).find(q => q.id === id); if (c) { const r = M.comboResult(P, R, c); return { bars: r.bars, reac: r.reac, disp: r.disp, label: c.name, p2: !!(R.p2 && R.p2[c.id]) }; } }
  if (kind === 'ENV' && R.env[id]) { const e = R.env[id]; return { env: e, label: 'obwiednia ' + CMB.TYP_N[id] + (e.explicit ? ' (II rząd)' : '') }; }
  if (kind === 'buck' && R.buck[id]) { const B = R.buck[id], m = B.modes[+k || 0]; return { buck: B, mode: m, label: `postać wyboczenia ${(+k || 0) + 1}: α_cr = ${fmt(m.alpha, 2)}` }; }
  const e = R.env.ULS; return e ? { env: e, label: 'obwiednia SGN' } : null;
};
function etaColors() {
  const out = {}; RA.P.design.forEach(d => { if (!d.res || d.res.eta === null || d.res.eta === undefined) return; const e = d.res.eta; const c = e > 1 ? '#c0262d' : e > 0.9 ? '#e0761b' : e > 0.7 ? '#d6a91a' : e > 0.4 ? '#4c9a3a' : '#2f7fbf'; d.bars.forEach(id => { out[id] = c; }); });
  return out;
}
CV.diagrams = function (res) {
  const P = RA.P, R = RA.R, mode = RA.view.mode, out = [];
  if (!['M', 'V', 'N', 'w', 'buck'].includes(mode)) return '';
  const B = M.bounds(P), size = Math.max(B.x1 - B.x0, B.z1 - B.z0, 1);
  if (mode === 'w' || mode === 'buck') {
    // deformacja (ugięcia) lub postać wyboczenia
    let maxD = 1e-12; const shapes = [];
    R.ctx.bars.forEach((b, ei) => {
      let pts;
      if (res.mode) { const A = R.A, info = A.M.elInfo[ei]; pts = info.ids.map((nid, k) => { const nd = A.M.nodes[nid]; const u = [0, 1].map(j => res.mode.u[A.Sy.dofOf(nid, j)]); return { x: nd.x, z: nd.z, ux: u[0], uz: u[1] }; }); }
      else if (res.bars) pts = res.bars[ei].map(st => ({ x: R.ctx.geo[ei].a.x + R.ctx.geo[ei].c * st.x, z: R.ctx.geo[ei].a.z + R.ctx.geo[ei].s * st.x, ux: st.gx, uz: st.gz }));
      else if (res.env && res.env.bars[ei].gxmax) { const e = res.env.bars[ei]; pts = e.x.map((x, i) => ({ x: R.ctx.geo[ei].a.x + R.ctx.geo[ei].c * x, z: R.ctx.geo[ei].a.z + R.ctx.geo[ei].s * x, ux: Math.abs(e.gxmax[i]) > Math.abs(e.gxmin[i]) ? e.gxmax[i] : e.gxmin[i], uz: Math.abs(e.gzmax[i]) > Math.abs(e.gzmin[i]) ? e.gzmax[i] : e.gzmin[i] })); }
      if (!pts) return; pts.forEach(p => { maxD = Math.max(maxD, Math.hypot(p.ux, p.uz)); }); shapes.push(pts);
    });
    const sc = 0.08 * size / maxD * RA.view.scaleK;
    shapes.forEach(pts => out.push(`<polyline points="${pts.map(p => `${X(p.x + p.ux * sc).toFixed(1)},${Y(p.z + p.uz * sc).toFixed(1)}`).join(' ')}" class="defl"/>`));
    if (!res.mode && res.disp) R.ctx.nodes.forEach((n, i) => { const d = res.disp[i]; const v = Math.hypot(d[0], d[1]) * 1000; if (v > maxD * 1000 * 0.3) out.push(txt(X(n.x + d[0] * sc) + 6, Y(n.z + d[1] * sc) - 6, `${fmt(v, 1)} mm`, 'dval', 'start')); });
    if (res.mode) out.push(`<text x="12" y="${H - 14}" class="dval">${esc(res.label)}</text>`);
    return out.join('');
  }
  const key = mode;
  // skala: największa rzędna = 9% rozmiaru modelu
  let vmax = 1e-9;
  R.ctx.bars.forEach((b, ei) => { if (res.bars) res.bars[ei].forEach(st => { vmax = Math.max(vmax, Math.abs(st[key])); }); else { const e = res.env.bars[ei]; for (let i = 0; i < e.x.length; i++) vmax = Math.max(vmax, Math.abs(e[key + 'max'][i]), Math.abs(e[key + 'min'][i])); } });
  const sc = 0.09 * size / vmax * RA.view.scaleK, dp = vmax >= 100 ? 1 : 2;
  const cls = key === 'M' ? 'dM' : key === 'V' ? 'dV' : 'dN';
  R.ctx.bars.forEach((b, ei) => {
    const g = R.ctx.geo[ei], nx = g.s, nz = -g.c;   // z̄ (spód) w świecie
    const sgn = key === 'M' ? 1 : -1;               // M – po stronie rozciąganej (z̄); V, N – dodatnie po stronie przeciwnej
    const P0 = x => ({ x: g.a.x + g.c * x, z: g.a.z + g.s * x });
    const poly = (xs, vs) => { const p = xs.map((x, i) => { const q = P0(x), o = sgn * vs[i] * sc; return `${X(q.x + nx * o).toFixed(1)},${Y(q.z + nz * o).toFixed(1)}`; }); const a = P0(xs[0]), z = P0(xs[xs.length - 1]); return `${X(a.x).toFixed(1)},${Y(a.z).toFixed(1)} ${p.join(' ')} ${X(z.x).toFixed(1)},${Y(z.z).toFixed(1)}`; };
    const lab = (x, v) => { if (Math.abs(v) < vmax * 0.02) return ''; const q = P0(x), o = sgn * v * sc + Math.sign(sgn * v || 1) * 11 / V.k; return txt(X(q.x + nx * o), Y(q.z + nz * o) + 4, fmt(v, dp), 'dval'); };
    let xs, sets;
    if (res.bars) { xs = res.bars[ei].map(s => s.x); sets = [res.bars[ei].map(s => s[key])]; }
    else { const e = res.env.bars[ei]; xs = e.x; sets = [Array.from(e[key + 'max']), Array.from(e[key + 'min'])]; }
    sets.forEach((vs, si) => out.push(`<polygon points="${poly(xs, vs)}" class="${cls}${si ? ' env2' : ''}"/>`));
    // opisy: końce i ekstrema
    const Lpx = g.L * V.k; if (Lpx < 30) return;
    sets.forEach(vs => {
      const lbl = new Set([0, vs.length - 1]); let im = 0; vs.forEach((v, i) => { if (Math.abs(v) > Math.abs(vs[im])) im = i; }); if (im > 0 && im < vs.length - 1 && Math.abs(vs[im]) > 1.05 * Math.max(Math.abs(vs[0]), Math.abs(vs[vs.length - 1]))) lbl.add(im);
      lbl.forEach(i => out.push(lab(xs[i], vs[i])));
    });
  });
  return out.join('');
};
CV.reactions = function (res) {
  const P = RA.P, R = RA.R, out = [];
  R.ctx.nodes.forEach((n, i) => {
    const rr = res.reac ? res.reac[i] : (res.env ? res.env.reac[i] : null); if (!rr) return;
    const x = X(n.x), y = Y(n.z);
    const vals = res.env ? rr.map(e => (Math.abs(e.max) > Math.abs(e.min) ? e.max : e.min)) : rr;
    const txtv = k => res.env ? `${fmt(rr[k].min, 1)}…${fmt(rr[k].max, 1)}` : fmt(vals[k], 1);
    if (Math.abs(vals[1]) > 1e-6) { const d = vals[1] > 0 ? 1 : -1; out.push(`<g class="rea">${arrow(x, y + d * 50 + 14, x, y + 14, 'ra', 8)}${txt(x + 6, y + 62, `R_z = ${txtv(1)} kN`, 'rtx', 'start')}</g>`); }
    if (Math.abs(vals[0]) > 1e-6) { const d = vals[0] > 0 ? 1 : -1; out.push(`<g class="rea">${arrow(x - d * 52, y + 22, x - d * 6, y + 22, 'ra', 8)}${txt(x - d * 30, y + 36, `R_x = ${txtv(0)} kN`, 'rtx')}</g>`); }
    if (Math.abs(vals[2]) > 1e-6) out.push(`<g class="rea">${txt(x, y + 78, `M = ${res.env ? `${fmt(-rr[2].max, 1)}…${fmt(-rr[2].min, 1)}` : fmt(-vals[2], 1)} kNm`, 'rtx')}</g>`);
  });
  return out.join('');
};
CV.legend = function (res) {
  const el = $('#mlegend'); if (!el) return;
  const R = RA.R, mode = RA.view.mode;
  if (mode === 'model') { el.innerHTML = ''; return; }
  if (mode === 'eta') { el.innerHTML = '<span class="lg"><i style="background:#2f7fbf"></i>η ≤ 40%</span><span class="lg"><i style="background:#4c9a3a"></i>≤ 70%</span><span class="lg"><i style="background:#d6a91a"></i>≤ 90%</span><span class="lg"><i style="background:#e0761b"></i>≤ 100%</span><span class="lg"><i style="background:#c0262d"></i>&gt; 100%</span><span class="lg">pręty bez elementu – kolor materiału</span>'; return; }
  el.innerHTML = res ? `<span class="lg">${esc(res.label || '')}${res.p2 ? ' · analiza II rzędu' : ''}</span><span class="lg">${{ M: 'M [kNm] – po stronie włókien rozciąganych', V: 'V [kN]', N: 'N [kN] (+ rozciąganie)', w: 'deformacja (przemieszczenia przeskalowane)', R: 'reakcje [kN, kNm]; M dodatnie zgodnie ze wskazówkami zegara', buck: 'postać wyboczenia (przeskalowana)' }[mode] || ''}</span>` : `<span class="lg">${R && !R.ok ? esc(R.errors[0] || '') : 'brak wyników'}</span>`;
};
})();
