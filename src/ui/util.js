/* RAMA2D – narzędzia interfejsu (wspólne): DOM, formatowanie liczb, okna, menu, komunikaty */
(function () {
'use strict';
const RA = window.RA = window.RA || {};
const Q = RA.Q = {};
Q.$ = (s, el) => (el || document).querySelector(s);
Q.$$ = (s, el) => Array.from((el || document).querySelectorAll(s));
Q.esc = s => String(s === undefined || s === null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// liczby po polsku: przecinek dziesiętny, spacja tysięcy
Q.fmt = (v, dp) => {
  if (v === null || v === undefined || v === '' || !isFinite(v)) return '—';
  const d = dp === undefined ? 2 : dp; let s = (+v).toFixed(d);
  if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
  const [a, b] = s.split('.'); const neg = a.startsWith('-'), ai = neg ? a.slice(1) : a;
  const g = ai.length > 4 ? ai.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : ai;
  return (neg ? '−' : '') + g + (b ? ',' + b : '');
};
Q.fmtS = (v, dp) => { const s = Q.fmt(v, dp); return v > 0 ? '+' + s : s; };
Q.num = s => { if (typeof s === 'number') return s; const x = parseFloat(String(s === undefined || s === null ? '' : s).replace(/\s/g, '').replace('−', '-').replace(',', '.')); return isFinite(x) ? x : null; };
Q.show = v => (v === '' || v === null || v === undefined) ? '' : String(Math.round(v * 1e6) / 1e6).replace('.', ',');
// etykiety: wewnętrzne napisy programu mogą zawierać znaczniki <sub>, <sup>, <b> – przepuszczane; pozostałe znaki escapowane
Q.sym = s => { s = String(s === undefined || s === null ? '' : s); if (/<(sub|sup|b|i)>/.test(s)) return s; return Q.esc(s).replace(/_\{([^}]*)\}/g, '<sub>$1</sub>').replace(/\^\{([^}]*)\}/g, '<sup>$1</sup>'); };
Q.clone = o => JSON.parse(JSON.stringify(o));
Q.uid = (() => { let i = 0; return p => (p || 'u') + (++i); })();

Q.toast = (msg, ms) => { const t = Q.$('#toast'); t.textContent = msg; t.style.display = 'block'; clearTimeout(Q.toast.t); Q.toast.t = setTimeout(() => { t.style.display = 'none'; }, ms || 2600); };
// okno modalne
Q.modal = (html, cls) => {
  const m = Q.$('#modal'); m.innerHTML = `<div class="dlg ${cls || ''}">${html}</div>`; m.style.display = 'flex';
  const f = Q.$('input:not([type=checkbox]), select, textarea', m); if (f) setTimeout(() => { try { f.focus(); if (f.select) f.select(); } catch (e) { /* */ } }, 30);
  return m;
};
Q.closeModal = () => { const m = Q.$('#modal'); m.style.display = 'none'; m.innerHTML = ''; if (Q.onClose) { const f = Q.onClose; Q.onClose = null; f(); } };
Q.isModal = () => Q.$('#modal').style.display === 'flex';
Q.ask = (msg, ok, danger) => new Promise(res => {
  const m = Q.modal(`<p>${msg}</p><div class="dbtn"><button class="btn" data-a="0">Anuluj</button><button class="btn ${danger ? 'danger' : 'pri'}" data-a="1">${Q.esc(ok || 'OK')}</button></div>`, 'sm');
  m.onclick = e => { const b = e.target.closest('[data-a]'); if (b) { m.onclick = null; Q.closeModal(); res(b.dataset.a === '1'); } };
  setTimeout(() => { const b = Q.$('[data-a="1"]', m); if (b) b.focus(); }, 40);
});
// menu kontekstowe: items – [{label, fn, dis, sep}]
Q.menu = (x, y, items) => {
  Q.closeMenu(); Q._menuT = Date.now();
  const el = document.createElement('div'); el.className = 'ctxmenu';
  items.forEach(it => {
    if (it.sep) { el.appendChild(document.createElement('hr')); return; }
    const b = document.createElement('button'); b.type = 'button'; b.innerHTML = it.label; if (it.dis) b.disabled = true;
    b.onclick = () => { Q.closeMenu(); it.fn && it.fn(); }; el.appendChild(b);
  });
  document.body.appendChild(el);
  const r = el.getBoundingClientRect();
  el.style.left = Math.min(x, window.innerWidth - r.width - 6) + 'px'; el.style.top = Math.min(y, window.innerHeight - r.height - 6) + 'px';
  setTimeout(() => { const f = Q.$('button:not(:disabled)', el); if (f) f.focus(); }, 0);
};
Q.closeMenu = () => Q.$$('.ctxmenu').forEach(e => e.remove());
// zamykanie menu kliknięciem obok (z pominięciem zdarzenia, które je otworzyło – pointerdown → mousedown)
document.addEventListener('mousedown', e => { if (Date.now() - (Q._menuT || 0) < 80) return; if (!e.target.closest('.ctxmenu')) Q.closeMenu(); });

// pola formularza (jak w modułach): wiersz z etykietą
Q.rowNum = (label, key, val, unit, o) => { o = o || {}; return `<div class="row"><label>${Q.sym(label)}</label><div class="combo"><input data-f="${key}" value="${Q.esc(Q.show(val))}" ${o.ph ? `placeholder="${Q.esc(o.ph)}"` : ''} ${o.ro ? 'readonly' : ''} spellcheck="false" autocomplete="off"></div><span class="unit">${Q.sym(unit || '')}</span></div>`; };
Q.rowSel = (label, key, val, opts, o) => { o = o || {}; return `<div class="row ${o.wide ? 'wide' : ''}"><label>${Q.sym(label)}</label><select data-f="${key}">${opts.map(([v, l]) => `<option value="${Q.esc(v)}" ${String(v) === String(val) ? 'selected' : ''}>${Q.esc(l)}</option>`).join('')}</select>${o.wide ? '' : '<span></span>'}</div>`; };
Q.rowTxt = (label, key, val, ph) => `<div class="row wide"><label>${Q.sym(label)}</label><input class="txt" data-f="${key}" value="${Q.esc(val || '')}" placeholder="${Q.esc(ph || '')}" spellcheck="false" autocomplete="off"></div>`;
Q.chk = (label, key, val) => `<label class="chk"><input type="checkbox" data-f="${key}" ${val ? 'checked' : ''}><span>${Q.sym(label)}</span></label>`;
// odczyt pól z kontenera: zwraca obiekt {klucz: wartość} (liczby jako liczby, gdy się da)
// liczba tylko wtedy, gdy całe pole jest liczbą (np. „6; 7” pozostaje tekstem – lista rozpiętości)
const NUMRE = /^[-−+]?\s*\d[\d\s ]*([.,]\d+)?([eE][-+]?\d+)?$/;
Q.readFields = (el) => { const o = {}; Q.$$('[data-f]', el).forEach(f => { const k = f.dataset.f; if (f.type === 'checkbox') o[k] = f.checked; else if (f.tagName === 'SELECT') o[k] = f.value; else { const v = f.value.trim(); o[k] = v === '' ? '' : (NUMRE.test(v) ? Q.num(v) : v); } }); return o; };
Q.download = (name, content, mime) => { const a = document.createElement('a'); a.href = URL.createObjectURL(content instanceof Blob ? content : new Blob([content], { type: (mime || 'text/plain') + ';charset=utf-8' })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800); };
Q.debounce = (fn, ms) => { let t = null; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
// ikony (SVG, obrys)
Q.ICON = {
  select: '<path d="M5 3l12 9-5 1 3 6-2 1-3-6-4 4z"/>',
  bar: '<circle cx="5" cy="19" r="2"/><circle cx="19" cy="5" r="2"/><path d="M6.5 17.5 17.5 6.5"/>',
  node: '<circle cx="12" cy="12" r="3"/><path d="M3 12h6M15 12h6"/>',
  support: '<path d="M12 4v8M6 18l6-6 6 6z"/><path d="M4 21h16"/>',
  load: '<path d="M12 3v14M7 12l5 5 5-5"/><path d="M4 21h16"/>',
  dist: '<path d="M4 6h16M6 6v9M10 6v9M14 6v9M18 6v9M4 18h16"/>',
  hinge: '<path d="M3 12h6M15 12h6"/><circle cx="12" cy="12" r="3"/>',
  split: '<path d="M3 12h18"/><path d="M12 7v10"/>',
  del: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>',
  fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  gen: '<path d="M4 20V9l8-5 8 5v11"/><path d="M4 9h16M8 20v-7h8v7"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
  sec: '<path d="M5 4h14v4h-5v8h5v4H5v-4h5V8H5z"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9h18M3 14h18M9 4v16"/>',
  measure: '<path d="M3 17 17 3l4 4L7 21z"/><path d="M8 12l2 2M11 9l2 2M14 6l2 2"/>',
};
Q.icon = (k, sz) => `<svg viewBox="0 0 24 24" width="${sz || 18}" height="${sz || 18}" aria-hidden="true">${Q.ICON[k] || ''}</svg>`;
})();
