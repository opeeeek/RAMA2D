/* RAMA2D – aplikacja: stan projektu, cofanie, pliki, analiza i synchronizacja z modułami */
(function () {
'use strict';
const RA = window.RA, Q = RA.Q, M = window.RMODEL, D = window.RDES, SEC = window.RSEC, CMB = window.RCOMB;
const { $, $$, esc, fmt } = Q;
RA.APP = 'RAMA2D'; RA.VERSION = '1.0.0';
RA.P = M.newProject(); RA.R = null;
RA.file = { path: '', dirty: false };
RA.sel = { nodes: new Set(), bars: new Set(), loads: new Set() };
RA.activeCase = 'G1';
RA.view = { mode: 'model', src: 'ENV:ULS', scaleK: 1, labels: true, secLabels: false, loads: true, grid: true };

/* ------------------------------------------------------------ host (program Windows) */
const pending = {}; let reqId = 0;
window.__hostReply = (id, res) => { const p = pending[id]; if (p) { delete pending[id]; p(res); } };
RA.inHost = () => typeof window.hostRequest === 'function';
RA.hostCall = (op, args) => new Promise(res => { const id = ++reqId; pending[id] = res; try { window.hostRequest(JSON.stringify(Object.assign({ id, op }, args))); } catch (e) { delete pending[id]; res({ ok: false, err: String(e) }); } });
const baseName = p => (p || '').split(/[\\/]/).pop();

/* ------------------------------------------------------------ cofanie / ponawianie */
const UNDO = [], REDO = [];
const PERSIST = ['id', 'mod', 'kind', 'bars', 'name', 'opt'];        // dane elementu zapisywane w historii (bez danych modułu i wyników)
const snap = () => { const P = RA.P, o = Object.assign({}, P, { design: P.design.map(d => { const q = {}; PERSIST.forEach(k => { q[k] = d[k]; }); return q; }) }); return JSON.stringify(o); };
let lastSnap = null;
function pushUndo() { const s = snap(); if (s === lastSnap) return; if (lastSnap) { UNDO.push(lastSnap); if (UNDO.length > 60) UNDO.shift(); } REDO.length = 0; lastSnap = s; }
function restore(s) {
  const keep = new Map(RA.P.design.map(d => [d.id, d]));
  const P = M.normalize(JSON.parse(s));
  // dane modułu i wyniki – z bieżącego elementu; moduł wynika z materiału przekroju (wybierany automatycznie w RA.syncDesign)
  P.design.forEach(d => { const k = keep.get(d.id); if (k) { Object.keys(k).forEach(q => { if (!PERSIST.includes(q)) d[q] = k[q]; }); d.mod = k.mod; } });
  RA.P = P; lastSnap = s; RA.cleanSel(); RA.change({ noUndo: true });
}
RA.undo = () => { if (!UNDO.length) { Q.toast('Brak operacji do cofnięcia.'); return; } REDO.push(lastSnap); restore(UNDO.pop()); };
RA.redo = () => { if (!REDO.length) { Q.toast('Brak operacji do ponowienia.'); return; } UNDO.push(lastSnap); restore(REDO.pop()); };
RA.cleanSel = () => {
  const P = RA.P; RA.sel.nodes = new Set([...RA.sel.nodes].filter(id => P.nodes.some(n => n.id === id)));
  RA.sel.bars = new Set([...RA.sel.bars].filter(id => P.bars.some(b => b.id === id))); RA.sel.loads = new Set([...RA.sel.loads].filter(id => P.loads.some(l => l.id === id)));
  if (!P.cases.some(c => c.id === RA.activeCase)) RA.activeCase = P.cases[0] ? P.cases[0].id : null;
};

/* ------------------------------------------------------------ zmiana modelu → analiza */
let anT = null;
RA.change = function (o) {
  o = o || {};
  if (!o.noUndo) pushUndo();
  if (!o.noDirty) { RA.file.dirty = true; RA.updateTitle(); }
  RA.cleanSel();
  if (RA.cv) RA.cv.render();
  if (RA.ui && RA.ui.inspector) RA.ui.inspector();
  clearTimeout(anT); anT = setTimeout(() => RA.analyze(o), o.now ? 0 : 120);
  RA.autosave();
};
RA.analyze = function (o) {
  o = o || {};
  const t0 = performance.now();
  try { RA.R = M.analyze(RA.P); } catch (e) { console.error(e); RA.R = { ok: false, errors: ['Błąd analizy: ' + e.message], warnings: [] }; }
  RA.R.buck = {};
  if (RA.R.ok && RA.P.settings.buck) RA.buckling();
  RA.anTime = performance.now() - t0;
  RA.syncDesign(o);
  if (RA.cv) RA.cv.render();
  if (RA.ui) { RA.ui.inspector(); RA.ui.refreshPane(); }
  RA.renderStatus();
};
// analiza wyboczeniowa dla kombinacji SGN o największym obciążeniu (ograniczona liczba)
RA.buckling = function () {
  const R = RA.R, P = RA.P;
  const list = R.combos.filter(c => c.typ === 'ULS' && (c.gl !== 'γG,inf'));
  // ranking: suma ściskania w prętach (przybliżenie z wyników przypadków)
  const score = c => { let s = 0; R.ctx.bars.forEach((b, ei) => { let n = 0; Object.keys(c.f).forEach(id => { const r = R.cases[id]; if (r) n += c.f[id] * r.bars[ei][0].N; }); if (n < 0) s -= n * R.ctx.geo[ei].L; }); return s; };
  const ranked = list.map(c => ({ c, s: score(c) })).filter(q => q.s > 1e-6).sort((a, b) => b.s - a.s).slice(0, 6);
  ranked.forEach(({ c }) => { try { const B = M.buckling(P, R, c, 3); if (B && !B.none && !B.err) R.buck[c.id] = B; } catch (e) { console.error(e); } });
  const vals = Object.values(R.buck); R.alphaMin = vals.length ? vals.reduce((a, b) => (b.alpha < a.alpha ? b : a)) : null;
};

/* ------------------------------------------------------------ elementy wymiarowane ↔ moduły */
RA.syncDesign = function (o) {
  const P = RA.P, R = RA.R; if (!R || !R.ok) return;
  P.design.forEach(el => {
    el.bars = el.bars.filter(id => P.bars.some(b => b.id === id));
    if (!el.bars.length) return;
    // moduł wybierany automatycznie wg materiału przekroju prętów elementu
    const mats = new Set(el.bars.map(id => { const s = M.sec(P, (M.bar(P, id) || {}).sec); return s ? s.mat : null; }));
    if (mats.size > 1 || mats.has(null)) { el.err = mats.has(null) ? 'Pręt elementu bez przekroju.' : 'Pręty elementu mają przekroje z różnych materiałów – podziel element lub ujednolić materiał.'; el.warn = []; return; }
    const mk = D.modOfMat([...mats][0]);
    if (mk !== el.mod) { el.mod = mk; el.st = null; el.stJson = undefined; el.modJson = undefined; el.xfer = null; el.res = null; el.colSchD = undefined; if (RA.mod) RA.mod.detach(el.id); }
    const out = D.toModule(P, R, el);
    if (out.err) { el.err = out.err; el.warn = []; return; }
    el.err = null; el.warn = out.warn; el.sch = out.sch; el.frameG = out.frameG || null; el.flip = !!out.flip; el.nodePts = out.nodePts || null;
    if (out.colSchD !== undefined) el.colSchD = out.colSchD;
    const js = JSON.stringify(out.st);
    if (js !== el.stJson) { el.st = out.st; el.stJson = js; el.stMod = el.mod + '_' + el.kind; el.res = null; if (RA.mod) RA.mod.push(el); }
  });
  P.design = P.design.filter(el => el.bars.length);
  RA.queueChecks();
};
// kontrola wytężenia elementów silnikami modułów – w tle, po jednym elemencie
let ckT = null;
RA.queueChecks = function () {
  clearTimeout(ckT);
  const step = () => {
    const el = RA.P.design.find(d => d.st && !d.res && !d.err);
    if (!el) { RA.renderStatus(); if (RA.ui) RA.ui.refreshDesign(); if (RA.cv && RA.view.mode === 'eta') RA.cv.render(); return; }
    el.res = D.check(el) || { eta: null };
    ckT = setTimeout(step, 10);
  };
  ckT = setTimeout(step, 60);
};
// dane z modułu (zmiana w module) → model: przekrój, materiał, nazwa, schemat, podpory, przeguby, obciążenia, ustawienia
// (różnice względem stanu, który moduł miał poprzednio – el.modJson)
RA.fromModule = function (el, st) {
  const P = RA.P;
  let base = null; try { base = el.modJson ? JSON.parse(el.modJson) : null; } catch (e) { base = null; }
  el.modJson = JSON.stringify(st);
  let r;
  try { r = D.fromModule(P, RA.R, el, base, JSON.parse(el.modJson)); } catch (e) { console.error(e); r = { changed: false, info: [], msgs: ['Błąd przenoszenia danych z modułu: ' + e.message], st }; }
  el.st = r.st; el.stJson = JSON.stringify(r.st); el.stMod = el.mod + '_' + el.kind; el.res = null;
  if (r.msgs.length) Q.toast(r.msgs.join(' '), 6500);
  if (r.changed) {
    if (!r.msgs.length) Q.toast(`${el.name}: zmiany z modułu przeniesione do modelu – ${r.info.join(', ')}.`, 3200);
    RA.change({ now: true }); return;
  }
  RA.file.dirty = true; RA.updateTitle(); RA.autosave();
  // zmiany nieprzeniesione do modelu – moduł otrzymuje z powrotem dane wynikające z modelu
  if (r.msgs.length) RA.syncDesign(); else RA.queueChecks();
};

/* ------------------------------------------------------------ status */
RA.renderStatus = function () {
  const el = $('#status'); if (!el) return;
  const R = RA.R, P = RA.P;
  if (!P.bars.length) { el.className = ''; el.textContent = 'Zacznij od modelu: generator lub rysowanie prętów'; return; }
  if (!R || !R.ok) { el.className = 'fail'; el.textContent = '✖ ' + ((R && R.errors[0]) || 'Brak wyników'); el.title = R ? R.errors.join('\n') : ''; return; }
  const des = P.design.filter(d => d.res);
  const bad = des.filter(d => d.res && (!d.res.ok || d.res.eta > 1 + 1e-9));
  const etaMax = des.reduce((a, d) => Math.max(a, d.res.eta || 0), 0);
  const a = R.alphaMin ? ` · α_cr = ${fmt(R.alphaMin.alpha, R.alphaMin.alpha < 10 ? 2 : 1)}` : '';
  if (bad.length) { el.className = 'fail'; el.textContent = `✖ Niespełnione warunki: ${bad.length} el.${a}`; }
  else if (R.warnings.length) { el.className = 'warn'; el.textContent = `⚠ Ostrzeżenia: ${R.warnings.length}${a}`; }
  else if (des.length) { el.className = 'ok'; el.textContent = `✔ Elementy: ${des.length} · η = ${fmt(etaMax * 100, 0)}%${a}`; }
  else { el.className = 'ok'; el.textContent = `✔ Statyka: ${P.cases.length} przyp., ${R.combos.length} komb.${a}`; }
  el.title = [].concat(R.warnings, bad.map(d => `${d.name}: η = ${fmt((d.res.eta || 0) * 100, 0)}%${d.res.worst ? ' – ' + d.res.worst : ''}`)).join('\n');
};

/* ------------------------------------------------------------ pliki */
RA.updateTitle = function () {
  const fn = RA.file.path ? baseName(RA.file.path) : 'bez nazwy';
  const f = $('#fileName'); if (f) f.textContent = (RA.file.dirty ? '● ' : '') + fn;
  const t = `RAMA2D – ${RA.P.meta.name || 'projekt'} [${fn}${RA.file.dirty ? ' *' : ''}]`;
  document.title = t;
  if (typeof window.hostTitle === 'function') { try { window.hostTitle(t); } catch (e) { /* */ } }
};
RA.projectJSON = function () {
  const P = Object.assign({}, RA.P, { design: RA.P.design.map(d => ({ id: d.id, mod: d.mod, kind: d.kind, bars: d.bars, name: d.name, opt: d.opt, st: d.st })) });
  return JSON.stringify({ app: 'RAMA2D', format: M.FORMAT, version: RA.VERSION, saved: new Date().toISOString(), project: P }, null, 1);
};
const safeName = ext => (RA.P.meta.name || 'projekt').replace(/[\\/:*?"<>|]+/g, '_').trim() + ext;
RA.save = async function (as) {
  if (RA.inHost()) {
    const r = await RA.hostCall('save', { path: as ? '' : RA.file.path, name: safeName('.rama2d'), content: RA.projectJSON(), filter: 'project' });
    if (r && r.ok) { RA.file.path = r.path; RA.file.dirty = false; RA.updateTitle(); RA.autosave(); Q.toast('Zapisano: ' + baseName(r.path)); } else if (r && r.err) Q.toast('Błąd zapisu: ' + r.err);
  } else { Q.download(safeName('.rama2d'), RA.projectJSON(), 'application/json'); RA.file.dirty = false; RA.updateTitle(); }
};
RA.load = function (text, path) {
  let o; try { o = JSON.parse(text); } catch (e) { Q.toast('To nie jest plik projektu RAMA2D (.rama2d / .json).'); return; }
  const P0 = o.project || o;
  if (!P0 || !Array.isArray(P0.nodes)) { Q.toast('Plik nie zawiera danych projektu RAMA2D.'); return; }
  RA.applyProject(M.normalize(P0), path);
  Q.toast('Wczytano: ' + (baseName(path) || RA.P.meta.name));
};
RA.applyProject = function (P, path, quiet) {
  P.design.forEach(d => { d.stJson = d.st ? JSON.stringify(d.st) : undefined; d.res = null; });
  RA.P = P; RA.file.path = path || ''; RA.file.dirty = false;
  RA.sel = { nodes: new Set(), bars: new Set(), loads: new Set() };
  RA.activeCase = P.cases[0] ? P.cases[0].id : null;
  UNDO.length = 0; REDO.length = 0; lastSnap = snap();
  $('#projName').value = P.meta.name || '';
  if (RA.mod) RA.mod.reset();
  RA.updateTitle();
  if (RA.cv) RA.cv.fit();
  RA.change({ noUndo: true, noDirty: true, now: true });
};
RA.open = async function () {
  if (RA.file.dirty && !(await Q.ask('Niezapisane zmiany zostaną utracone. Otworzyć inny projekt?', 'Otwórz'))) return;
  if (RA.inHost()) { const r = await RA.hostCall('open', { filter: 'project' }); if (r && r.ok) RA.load(r.content, r.path); else if (r && r.err) Q.toast('Błąd odczytu: ' + r.err); return; }
  const inp = $('#fileIn'); inp.value = ''; inp.onchange = () => { const f = inp.files[0]; if (f) f.text().then(t => RA.load(t, f.name)); }; inp.click();
};
RA.newProject = async function () {
  if (RA.file.dirty && !(await Q.ask('Niezapisane zmiany zostaną utracone. Utworzyć nowy projekt?', 'Nowy projekt'))) return;
  RA.applyProject(M.normalize(M.newProject()), '');
  setTimeout(() => RA.ui.generator(true), 50);
};
let asT = null;
RA.autosave = function () {
  clearTimeout(asT);
  asT = setTimeout(() => {
    let data; try { data = JSON.stringify({ project: JSON.parse(RA.projectJSON()).project, filePath: RA.file.path, dirty: RA.file.dirty }); } catch (e) { return; }
    if (typeof window.hostStore === 'function') { try { window.hostStore(data); } catch (e) { /* */ } }
    else { try { localStorage.setItem('rama2d-autosave', data); } catch (e) { /* */ } }
  }, 800);
};

/* ------------------------------------------------------------ zakładki */
RA.tab = 'model';
RA.selectTab = function (t) {
  RA.tab = t;
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  $$('#out > .pane').forEach(p => p.classList.toggle('on', p.id === 'p-' + t));
  if (t === 'model' && RA.cv) RA.cv.resize();
  if (RA.ui) RA.ui.refreshPane();
  if (['ZB', 'ST', 'DR'].includes(t) && RA.mod) RA.mod.show(t);
};

/* ------------------------------------------------------------ start */
RA.init = function () {
  let saved = window.__AUTOSAVE || null;
  if (!saved) { try { saved = JSON.parse(localStorage.getItem('rama2d-autosave') || 'null'); } catch (e) { saved = null; } }
  if (saved && saved.project) { try { RA.P = M.normalize(saved.project); RA.file.path = saved.filePath || ''; RA.file.dirty = !!saved.dirty; } catch (e) { RA.P = M.normalize(M.newProject()); } }
  else RA.P = M.normalize(M.newProject());
  RA.P.design.forEach(d => { d.stJson = d.st ? JSON.stringify(d.st) : undefined; });
  lastSnap = snap();
  $('#projName').value = RA.P.meta.name || '';
  $('#projName').addEventListener('input', e => { RA.P.meta.name = e.target.value; RA.file.dirty = true; RA.updateTitle(); RA.autosave(); });
  $$('#tabs button').forEach(b => b.addEventListener('click', () => RA.selectTab(b.dataset.tab)));
  $$('#top [data-act]').forEach(b => b.addEventListener('click', () => RA.act(b.dataset.act)));
  document.addEventListener('keydown', e => {
    const k = e.key.toLowerCase(), inField = /INPUT|SELECT|TEXTAREA/.test((e.target && e.target.tagName) || '');
    if (!RA.inHost() ? false : (e.key === 'F5' || (e.ctrlKey && k === 'r'))) { e.preventDefault(); return; }
    if (Q.isModal() && e.key !== 'Escape') return;
    if (e.ctrlKey && k === 's') { e.preventDefault(); RA.save(e.shiftKey); }
    else if (e.ctrlKey && k === 'o') { e.preventDefault(); RA.open(); }
    else if (e.ctrlKey && k === 'n') { e.preventDefault(); RA.newProject(); }
    else if (e.ctrlKey && k === 'p') { e.preventDefault(); RA.act('print'); }
    else if (e.ctrlKey && k === 'z' && !inField) { e.preventDefault(); RA.undo(); }
    else if (e.ctrlKey && (k === 'y' || (k === 'z' && e.shiftKey)) && !inField) { e.preventDefault(); RA.redo(); }
    else if (e.key === 'Escape') { Q.closeMenu(); if (Q.isModal()) Q.closeModal(); else if (RA.cv) RA.cv.escape(); }
    else if (!inField && RA.tab === 'model' && RA.cv) RA.cv.key(e);
  });
  $('#modal').addEventListener('mousedown', e => { if (e.target.id === 'modal' && !$('[data-a]', e.currentTarget)) Q.closeModal(); });
  window.addEventListener('resize', Q.debounce(() => { if (RA.cv) RA.cv.resize(); }, 120));
  RA.ui.init(); RA.cv.init(); if (RA.mod) RA.mod.init();
  RA.updateTitle();
  RA.cv.fit();
  RA.change({ noUndo: true, noDirty: true, now: true });
  if (window.__hostOpenFile) { const f = window.__hostOpenFile; window.__hostOpenFile = null; setTimeout(() => RA.load(f.content, f.path), 50); return; }
  if (!RA.P.bars.length) setTimeout(() => RA.ui.generator(true), 200);
};
RA.act = function (a) {
  ({ new: RA.newProject, open: RA.open, save: () => RA.save(false), saveas: () => RA.save(true), print: () => RA.ui.print(), exporthtml: () => RA.ui.exportReport(), about: () => RA.ui.about(), undo: RA.undo, redo: RA.redo }[a] || (() => {}))();
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', RA.init); else setTimeout(RA.init, 0);
})();
