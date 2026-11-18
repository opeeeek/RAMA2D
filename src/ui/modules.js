/* RAMA2D – moduły wymiarowania osadzone w programie (oryginalne aplikacje BelkaŻB, SłupŻB, BelkaStal, SłupStal,
   BelkaDR, SłupDrewniany) i dwukierunkowa wymiana danych z modelem.
   Każda aplikacja działa w osobnej ramce (srcdoc – ten sam origin, izolowane zmienne globalne).
   Dane wejściowe: window.__AUTOSAVE (start) i setState (później); zmiany w module: window.hostStore (autozapis modułu). */
(function () {
'use strict';
const RA = window.RA, Q = RA.Q, M = window.RMODEL, SEC = window.RSEC, D = window.RDES;
const { $, $$, esc, fmt } = Q;
const MOD = RA.mod = {};
const APPS = { BelkaZB: { set: w => w.BZ.setState }, SlupZB: { set: w => w.SZ.setState }, BelkaDR: { set: w => w.BD.setState }, SlupDrewniany: { set: w => w.SD.setState }, BelkaStal: { set: w => w.BS.A.setState }, SlupStal: { set: w => w.BS.A.setState } };
const frames = {};                     // app → { iframe, ready, elId }
const cur = { ZB: { kind: 'beam', beam: null, col: null }, ST: { kind: 'beam', beam: null, col: null }, DR: { kind: 'beam', beam: null, col: null } };
const appOf = (mk, kind) => D.MODS[mk][kind].app;
const elById = id => RA.P.design.find(d => d.id === id);

/* ------------------------------------------------------------ most (wywoływany z ramek modułów) */
window.RAMA_BRIDGE = {
  initial(app) {
    const f = frames[app]; const el = f && f.elId ? elById(f.elId) : null;
    if (!el || !el.st || D.app(el) !== app) return null;
    el.modJson = JSON.stringify(el.st); el.xfer = null;
    return { state: JSON.parse(el.modJson) };
  },
  store(app, data) {
    const f = frames[app]; if (!f || !f.elId) return;
    const el = elById(f.elId); if (!el || D.app(el) !== app) return;     // element przeniesiony do innego modułu (zmiana materiału)
    let o; try { o = JSON.parse(data); } catch (e) { return; }
    const st = o && o.state; if (!st) return;
    const js = JSON.stringify(st); if (js === el.stJson || js === el.modJson) return;
    RA.fromModule(el, st);
    MOD.refreshBar(el.mod);
  },
  // zapis plików z modułu (raport, DXF, ODT) – przez host programu, gdy działa w oknie Windows
  hostRequest: null,
  key(app, e) { if (e.ctrlKey && /^[sonz y]$/i.test(e.key)) { RA.act({ s: 'save', o: 'open', n: 'new' }[e.key.toLowerCase()] || ''); return true; } return false; },
};
if (typeof window.hostRequest === 'function') {
  const map = {}; let rid = 0;
  const orig = window.__hostReply;
  window.__hostReply = (id, res) => { const m = map[id]; if (m) { delete map[id]; try { m.w.__hostReply(m.id, res); } catch (e) { /* */ } return; } orig(id, res); };
  window.RAMA_BRIDGE.hostRequest = (app, json, w) => { const o = JSON.parse(json), nid = 900000 + (++rid); map[nid] = { w, id: o.id }; o.id = nid; window.hostRequest(JSON.stringify(o)); };
}

/* ------------------------------------------------------------ ramka modułu */
function prelude(app) {
  return `<script>(function(){var B=parent.RAMA_BRIDGE;window.__RAMA_EMBED=true;window.__AUTOSAVE=B.initial(${JSON.stringify(app)});window.hostStore=function(d){B.store(${JSON.stringify(app)},d)};if(B.hostRequest)window.hostRequest=function(j){B.hostRequest(${JSON.stringify(app)},j,window)};
window.addEventListener('keydown',function(e){if(e.ctrlKey&&/^[son]$/i.test(e.key)){e.preventDefault();e.stopImmediatePropagation();parent.RA.act({s:'save',o:'open',n:'new'}[e.key.toLowerCase()]);}},true);
try{var ls=window.localStorage;}catch(e){}})();<\/script>
<style>#bNew,#bOpen,#bSave,#bSaveAs,#bCloud,#fileName,.beamtabs,[data-btab],[data-badd],[data-bdel]{display:none!important}#top .tb .sep:first-of-type{display:none}</style>`;
}
function ensureFrame(app) {
  if (frames[app] && frames[app].iframe) return frames[app];
  const src = (window.RAMA_MODSRC || {})[app];
  const f = frames[app] = frames[app] || {};
  const host = $('#mf-' + app);
  if (!src) { host.innerHTML = `<div class="msg err">Brak kodu modułu ${esc(app)} w pakiecie programu.</div>`; return f; }
  const ifr = document.createElement('iframe'); ifr.className = 'modframe'; ifr.title = app;
  f.iframe = ifr; f.ready = false;
  ifr.addEventListener('load', () => { f.ready = true; if (f.pending) { const p = f.pending; f.pending = null; MOD.setState(app, p); } });
  ifr.srcdoc = src.replace(/<head>/i, '<head>' + prelude(app));
  host.innerHTML = ''; host.appendChild(ifr);
  return f;
}
MOD.setState = function (app, st) {
  const f = frames[app]; if (!f || !f.iframe) return;
  if (!f.ready) { f.pending = st; return; }
  try {
    const w = f.iframe.contentWindow;
    const el = f.elId ? elById(f.elId) : null;
    if (el && D.app(el) === app) { el.modJson = JSON.stringify(st); el.xfer = null; }     // stan, który ma teraz moduł (podstawa porównań zmian z modułu)
    APPS[app].set(w)(JSON.parse(JSON.stringify(st)));
    // nazwa elementu w polu modułu (nie wszystkie moduły odświeżają je w setState)
    const pn = w.document.getElementById('projName'), nm = st.meta && (st.meta.name || st.meta.nazwa);
    if (pn && nm !== undefined && document.activeElement !== f.iframe) pn.value = nm;
  } catch (e) { console.error('setState ' + app, e); }
};
// ostrzeżenie: schemat belki w module odbiega od statyki ramy (momenty od obciążeń stałych)
MOD.devText = function (el) {
  const d = el.res && el.res.dev; if (!d || !(d.rel > 0.15) || !d.at) return '';
  return `Schemat modułu odbiega od statyki ramy: moment od obciążeń stałych w x = ${fmt(d.at.x, 2)} m – moduł ${fmt(d.at.mod, 1)} kNm, rama ${fmt(d.at.frame, 1)} kNm (różnica ${fmt(d.rel * 100, 0)}% max |M| = ${fmt(d.fmax, 1)} kNm). Element pracuje w układzie ramowym (np. rygiel ramy dwuspadowej, belka w ramie przechyłowej) – sprawdź wymiarowanie na siłach z ramy (zakładka Wyniki) lub zmień rodzaj podpór od prętów dochodzących.`;
};
// przesłanie danych elementu do jego modułu (gdy jest w nim otwarty); podczas wpisywania wartości w polu modułu – po opuszczeniu pola
const typing = f => { try { if (document.activeElement !== f.iframe) return false; const a = f.iframe.contentWindow.document.activeElement; return !!a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && !/^(checkbox|radio|button|submit|range|color|file)$/i.test(a.type))); } catch (e) { return false; } };
MOD.push = function (el) {
  const app = D.app(el), f = frames[app];
  if (!f || f.elId !== el.id || !f.iframe) return;
  if (f.ready && typing(f)) {
    if (!f.deferT) {
      const go = () => { if (typing(f)) { f.deferT = setTimeout(go, 400); return; } f.deferT = null; const e2 = f.elId ? elById(f.elId) : null; if (e2 && e2.st && D.app(e2) === app) { MOD.setState(app, e2.st); MOD.refreshBar(e2.mod); } };
      f.deferT = setTimeout(go, 400);
    }
    MOD.refreshBar(el.mod); return;
  }
  if (f.deferT) { clearTimeout(f.deferT); f.deferT = null; }
  MOD.setState(app, el.st);
  MOD.refreshBar(el.mod);
};
// element przeniesiony do innego modułu (zmiana materiału przekroju) – odłączenie od ramki poprzedniego modułu
MOD.detach = function (elId) {
  Object.keys(frames).forEach(app => { const f = frames[app]; if (f.elId === elId) { f.elId = null; if (f.deferT) { clearTimeout(f.deferT); f.deferT = null; } } });
  Object.keys(cur).forEach(mk => { ['beam', 'col'].forEach(k => { if (cur[mk][k] === elId) cur[mk][k] = null; }); });
};
MOD.reset = function () { Object.keys(frames).forEach(app => { const f = frames[app]; f.elId = null; }); Object.keys(cur).forEach(k => { cur[k].beam = null; cur[k].col = null; }); };
MOD.init = function () {
  ['ZB', 'ST', 'DR'].forEach(mk => {
    $('#p-' + mk).innerHTML = `<div class="modws"><div class="modbar" id="mb-${mk}"></div><div class="modhost">${['beam', 'col'].map(k => `<div class="mframe" id="mf-${appOf(mk, k)}" data-kind="${k}"></div>`).join('')}</div></div>`;
  });
};
MOD.open = function (elId) {
  const el = elById(elId); if (!el) return;
  const c = cur[el.mod]; c.kind = el.kind; c[el.kind] = el.id;
  RA.selectTab(el.mod);
};
MOD.show = function (mk) {
  const c = cur[mk], P = RA.P;
  const els = P.design.filter(d => d.mod === mk && d.kind === c.kind);
  if (!els.some(d => d.id === c[c.kind])) c[c.kind] = els[0] ? els[0].id : null;
  ['beam', 'col'].forEach(k => { const h = $('#mf-' + appOf(mk, k)); if (h) h.style.display = k === c.kind ? '' : 'none'; });
  const app = appOf(mk, c.kind), el = c[c.kind] ? elById(c[c.kind]) : null;
  MOD.refreshBar(mk);
  if (!el) { const h = $('#mf-' + app); if (h && !(frames[app] && frames[app].free)) { h.innerHTML = emptyHTML(mk, c.kind); bindEmpty(h, mk, c.kind); if (frames[app]) { frames[app].iframe = null; frames[app].elId = null; } } return; }
  const f = frames[app] || (frames[app] = {});
  f.free = false;
  if (!el.st) { RA.analyze(); }
  if (f.elId !== el.id || !f.iframe) {
    f.elId = el.id;
    if (!f.iframe) ensureFrame(app); else MOD.setState(app, el.st);
  }
};
function emptyHTML(mk, kind) {
  const props = D.detect(RA.P).filter(q => q.mod === mk && q.kind === kind);
  const nm = D.MODS[mk][kind].n;
  return `<div class="modempty"><h3>${esc(nm)} – brak elementów z modelu</h3>
    <p>Element do wymiarowania to ${kind === 'beam' ? 'belka – ciąg prętów ze schematem przęseł i podpór' : 'słup – pręt pionowy między węzłami'} z przekrojem ${esc(SEC.MAT_KIND[D.MODS[mk].mat].toLowerCase())}. Schemat, przekrój i obciążenia zostaną przeniesione z modelu, a zmiany przekroju w module wrócą do modelu.</p>
    ${props.length ? `<table class="ctab"><thead><tr><th>Pręty</th><th>Długość</th><th></th></tr></thead><tbody>${props.map((q, i) => `<tr><td>${q.bars.join(', ')}</td><td class="val">${fmt(q.L, 2)} m</td><td><button class="btn sm pri" data-np="${i}">Wymiaruj</button></td></tr>`).join('')}</tbody></table>` : `<p class="hint">W modelu nie ma ${kind === 'beam' ? 'belek' : 'słupów'} z takim materiałem. Zmień przekrój prętów w modelu albo użyj modułu niezależnie.</p>`}
    <div class="ibtn"><button class="btn sm" data-free="1">Otwórz moduł bez powiązania z modelem</button></div></div>`;
}
function bindEmpty(h, mk, kind) {
  const props = D.detect(RA.P).filter(q => q.mod === mk && q.kind === kind);
  $$('[data-np]', h).forEach(b => b.onclick = () => { const el = D.create(RA.P, props[+b.dataset.np]); RA.change({ now: true }); MOD.open(el.id); });
  const fb = $('[data-free]', h); if (fb) fb.onclick = () => { const app = appOf(mk, kind), f = frames[app] || (frames[app] = {}); f.elId = null; f.free = true; f.iframe = null; ensureFrame(app); MOD.refreshBar(mk); };
}
MOD.refreshBar = function (mk) {
  const bar = $('#mb-' + mk); if (!bar) return;
  const c = cur[mk], P = RA.P;
  const cnt = k => P.design.filter(d => d.mod === mk && d.kind === k).length;
  const els = P.design.filter(d => d.mod === mk && d.kind === c.kind);
  const el = c[c.kind] ? elById(c[c.kind]) : null;
  const app = appOf(mk, c.kind), f = frames[app];
  let info = '';
  if (el) {
    const sch = el.sch, r = el.res;
    const schTxt = !sch ? '' : el.kind === 'beam' ? `${sch.spans.length ? sch.spans.length + ' przęsł. ' + sch.spans.map(v => fmt(v, 2)).join(' + ') + ' m' : 'wspornik'}${sch.cantL ? ` · wspornik L ${fmt(sch.cantL, 2)} m` : ''}${sch.cantR ? ` · wspornik P ${fmt(sch.cantR, 2)} m` : ''}` : `L = ${fmt(sch.L, 2)} m${sch.kb ? ` · k₁ = ${sch.kb.k === Infinity ? '∞' : fmt(sch.kb.k, 2)}, k₂ = ${sch.kt.k === Infinity ? '∞' : fmt(sch.kt.k, 2)}` : ''}`;
    const sups = el.kind === 'beam' && sch ? sch.sups.map((s, i) => `${String.fromCharCode(65 + i)}: ${s.fixed ? 'utwierdzenie' : s.kr > 0 && (el.opt || {}).rot !== 'pin' ? 'k<sub>φ</sub> = ' + fmt(s.kr, 0) + ' kNm/rad' : 'przegub'}${s.t ? ', t = ' + s.t + ' mm' : ''}`).join('; ') : '';
    info = `<span class="lk" title="Dane sterowane z modelu: schemat (przęsła, podpory), przekrój, materiał, obciążenia. Zmiana przekroju lub materiału w module wraca do modelu.">⇄ powiązany z modelem</span>
      <span class="li"><b>${esc(el.name)}</b> · pręty ${el.bars.join(', ')} · ${esc(schTxt)}</span>
      ${r && r.eta !== null && r.eta !== undefined ? `<span class="li ${r.eta > 1 || !r.ok ? 'bad' : 'good'}">η = ${fmt(r.eta * 100, 0)}%</span>` : r && r.note ? `<span class="li bad">${esc(r.note)}</span>` : ''}
      ${MOD.devText(el) ? `<span class="li devw" title="${esc(MOD.devText(el))}">⚠ schemat ≠ rama (${fmt(el.res.dev.rel * 100, 0)}%)</span>` : ''}
      ${el.kind === 'beam' ? `<label class="li">podpory od prętów dochodzących: <select id="rot-${mk}"><option value="spring" ${(el.opt || {}).rot !== 'pin' && (el.opt || {}).rot !== 'fix' ? 'selected' : ''}>sprężyste (rama zastępcza)</option><option value="pin" ${(el.opt || {}).rot === 'pin' ? 'selected' : ''}>przegubowe</option><option value="fix" ${(el.opt || {}).rot === 'fix' ? 'selected' : ''}>utwierdzone</option></select></label>` : ''}
      <button class="btn sm" id="show-${mk}">Pokaż w modelu</button>
      ${(el.warn && el.warn.length) || el.err ? `<button class="btn sm wbtn" id="warn-${mk}">⚠ ${el.err ? 1 : el.warn.length}</button>` : ''}
      ${sups ? `<div class="lsup">Podpory: ${sups}</div>` : ''}`;
  } else if (f && f.free) info = '<span class="li hint">Moduł bez powiązania z modelem – obliczenia niezależne (dane nie są zapisywane w projekcie).</span>';
  bar.innerHTML = `<div class="segsw"><button data-k="beam" class="${c.kind === 'beam' ? 'on' : ''}">Belki (${cnt('beam')})</button><button data-k="col" class="${c.kind === 'col' ? 'on' : ''}">Słupy (${cnt('col')})</button></div>
    ${els.length ? `<select id="el-${mk}">${els.map(d => `<option value="${d.id}" ${el && d.id === el.id ? 'selected' : ''}>${esc(d.name)}${d.res && d.res.eta !== null && d.res.eta !== undefined ? ` – η ${fmt(d.res.eta * 100, 0)}%` : ''}</option>`).join('')}</select>` : ''}
    ${info}`;
  $$('[data-k]', bar).forEach(b => b.onclick = () => { c.kind = b.dataset.k; MOD.show(mk); });
  const es = $('#el-' + mk); if (es) es.onchange = () => { c[c.kind] = es.value; MOD.show(mk); };
  const rs = $('#rot-' + mk); if (rs && el) rs.onchange = () => { el.opt = Object.assign({}, el.opt, { rot: rs.value }); RA.change({ now: true }); };
  const sb = $('#show-' + mk); if (sb && el) sb.onclick = () => { RA.sel.bars = new Set(el.bars); RA.sel.nodes.clear(); RA.sel.loads.clear(); RA.selectTab('model'); RA.cv.render(); RA.ui.inspector(); };
  const wmodal = () => { const dv = MOD.devText(el); const m = Q.modal(`<h3>${esc(el.name)} – uwagi do przeniesienia danych</h3>${el.err ? `<div class="msg err">${esc(el.err)}</div>` : ''}${dv ? `<div class="msg wrn">${esc(dv)}</div>` : ''}<ul>${(el.warn || []).map(w => `<li>${esc(w)}</li>`).join('')}</ul><div class="dbtn"><button class="btn pri" data-a="0">Zamknij</button></div>`); m.onclick = e => { if (e.target.closest('[data-a]')) Q.closeModal(); }; };
  const wb = $('#warn-' + mk); if (wb && el) wb.onclick = wmodal;
  const dw = $('.devw', bar); if (dw && el) { dw.style.cursor = 'pointer'; dw.onclick = wmodal; }
};
})();
