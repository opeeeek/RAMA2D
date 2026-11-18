/* RAMA2D – panel właściwości i okna dialogowe modelu */
(function () {
'use strict';
const RA = window.RA, Q = RA.Q, M = window.RMODEL, SEC = window.RSEC, CMB = window.RCOMB, D = window.RDES, GEN = window.RGEN;
const { $, $$, esc, fmt } = Q;
const UI = RA.ui = RA.ui || {};
const f2 = v => fmt(v, 2);

/* ------------------------------------------------------------ pasek nad rysunkiem */
UI.MODES = [['model', 'Model'], ['M', 'M'], ['V', 'V'], ['N', 'N'], ['w', 'Deformacja'], ['R', 'Reakcje'], ['eta', 'Wytężenie'], ['buck', 'Wyboczenie']];
UI.mbar = function () {
  const P = RA.P, R = RA.R, v = RA.view;
  const srcOpts = [];
  if (R && R.ok) {
    Object.keys(R.env).forEach(t => srcOpts.push([`ENV:${t}`, `Obwiednia – ${CMB.TYP_N[t]}${R.env[t].explicit ? ' (II rząd)' : ''}`]));
    P.cases.forEach(c => srcOpts.push([`case:${c.id}`, `Przypadek ${c.id} – ${c.name || CMB.CATS[c.cat].n}`]));
    R.combos.forEach(c => srcOpts.push([`combo:${c.id}`, `${c.id}: ${c.name}`]));
    Object.keys(R.buck || {}).forEach(id => R.buck[id].modes.forEach((m, k) => srcOpts.push([`buck:${id}:${k}`, `Wyboczenie – ${id}, postać ${k + 1} (α_cr = ${fmt(m.alpha, 2)})`])));
  }
  if (v.mode === 'buck' && !String(v.src).startsWith('buck:')) { const b = srcOpts.find(o => o[0].startsWith('buck:')); if (b) v.src = b[0]; }
  if (v.mode !== 'buck' && String(v.src).startsWith('buck:')) v.src = 'ENV:ULS';
  if (v.mode === 'w' && v.src === 'ENV:ULS') v.src = 'ENV:CHAR';
  const caseOpts = P.cases.map(c => `<option value="${esc(c.id)}" ${c.id === RA.activeCase ? 'selected' : ''}>${esc(c.id)} – ${esc(c.name || CMB.CATS[c.cat].n)}</option>`).join('');
  $('#mbar').innerHTML = `<div class="segsw">${UI.MODES.map(([k, l]) => `<button data-vm="${k}" class="${v.mode === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    ${v.mode !== 'model' && v.mode !== 'eta' ? `<select id="srcSel" title="Źródło wyników">${srcOpts.map(([k, l]) => `<option value="${esc(k)}" ${k === v.src ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
      <button class="btn sm" data-sc="0.7" title="Zmniejsz skalę wykresów">−</button><button class="btn sm" data-sc="1.4" title="Zwiększ skalę wykresów">+</button>` : ''}
    ${v.mode === 'model' ? `<label class="mlab">Przypadek obciążenia</label><select id="caseSel" title="Przypadek, do którego dodawane są obciążenia (widoczny na rysunku)">${caseOpts}</select><button class="btn sm" id="bCaseAdd" title="Nowy przypadek obciążenia">+ przypadek</button>` : ''}
    <span class="sp"></span>
    <label class="chk sm"><input type="checkbox" data-vo="labels" ${v.labels ? 'checked' : ''}>numery</label>
    <label class="chk sm"><input type="checkbox" data-vo="secLabels" ${v.secLabels ? 'checked' : ''}>przekroje</label>
    <label class="chk sm"><input type="checkbox" data-vo="grid" ${v.grid ? 'checked' : ''}>siatka</label>
    <label class="chk sm" title="Przyciąganie do siatki"><input type="checkbox" id="snapChk" ${P.settings.snap !== false ? 'checked' : ''}>przyciąganie</label>
    <span class="combo sm3" title="Rozstaw siatki [m]"><input id="gridIn" value="${Q.show(P.settings.grid)}"></span><span class="unit">m</span>`;
  $$('#mbar [data-vm]').forEach(b => b.onclick = () => { v.mode = b.dataset.vm; UI.mbar(); RA.cv.render(); });
  const ss = $('#srcSel'); if (ss) ss.onchange = () => { v.src = ss.value; RA.cv.render(); };
  $$('#mbar [data-sc]').forEach(b => b.onclick = () => { v.scaleK *= +b.dataset.sc; RA.cv.render(); });
  const cs = $('#caseSel'); if (cs) cs.onchange = () => { RA.activeCase = cs.value; RA.cv.render(); UI.inspector(); };
  const ca = $('#bCaseAdd'); if (ca) ca.onclick = () => UI.caseDialog();
  $$('#mbar [data-vo]').forEach(c => c.onchange = () => { v[c.dataset.vo] = c.checked; RA.cv.render(); });
  $('#snapChk').onchange = e => { P.settings.snap = e.target.checked; };
  $('#gridIn').onchange = e => { const g = Q.num(e.target.value); if (g > 0) { P.settings.grid = g; RA.cv.render(); } else e.target.value = Q.show(P.settings.grid); };
};

/* ------------------------------------------------------------ przekrój nowych prętów */
UI.curSec = () => { const P = RA.P; if (!P.sections.some(s => s.id === UI._cur)) UI._cur = P.sections[0] ? P.sections[0].id : null; return UI._cur; };
const secOpts = (cur, none) => (none ? `<option value="">—</option>` : '') + RA.P.sections.map(s => `<option value="${esc(s.id)}" ${s.id === cur ? 'selected' : ''}>${esc((s.name ? s.name + ' · ' : '') + SEC.fullLabel(s))}</option>`).join('');

/* ------------------------------------------------------------ inspektor (prawy panel) */
UI.inspector = function () {
  const el = $('#insp'); if (!el) return;
  UI.mbar();
  const P = RA.P, R = RA.R, sel = RA.sel;
  let h = '';
  const nb = sel.bars.size, nn = sel.nodes.size;
  if (nb === 1 && nn <= 2) h = barPanel([...sel.bars][0]);
  else if (nn === 1 && !nb) h = nodePanel([...sel.nodes][0]);
  else if (nb > 1 || nn > 1) h = multiPanel();
  else h = modelPanel();
  el.innerHTML = h;
  bindInsp(el);
};
function modelPanel() {
  const P = RA.P, R = RA.R;
  const nE = P.design.length;
  return `<div class="ibox"><h4>Model</h4>
    <table class="kv"><tr><td>Węzły</td><td>${P.nodes.length}</td></tr><tr><td>Pręty</td><td>${P.bars.length}</td></tr><tr><td>Podpory</td><td>${P.supports.length}</td></tr>
    <tr><td>Przekroje</td><td>${P.sections.length}</td></tr><tr><td>Przypadki obciążeń</td><td>${P.cases.length}</td></tr><tr><td>Obciążenia</td><td>${P.loads.length}</td></tr>
    <tr><td>Elementy wymiarowane</td><td>${nE}</td></tr>${R && R.ok ? `<tr><td>Kombinacje</td><td>${R.combos.length}</td></tr><tr><td>Czas analizy</td><td>${fmt(RA.anTime || 0, 0)} ms</td></tr>` : ''}</table>
    ${R && !R.ok ? `<div class="msgs">${R.errors.map(e => `<div class="msg err">${esc(e)}</div>`).join('')}</div>` : ''}
    ${R && R.ok && R.warnings.length ? `<div class="msgs">${R.warnings.slice(0, 6).map(e => `<div class="msg wrn">${esc(e)}</div>`).join('')}</div>` : ''}
  </div>
  <div class="ibox"><h4>Przekrój nowych prętów</h4><select data-i="cursec">${secOpts(UI.curSec())}</select>
    <div class="ibtn"><button class="btn sm" data-i="secs">Przekroje i materiały…</button><button class="btn sm" data-i="gen">Generator…</button></div></div>
  <div class="ibox"><h4>Jak modelować</h4><ul class="tips">
    <li><b>Generator</b> tworzy belki, ramy, kratownice i łuki – potem dowolnie je zmieniasz.</li>
    <li><b>Pręty</b> (B): klikaj kolejne punkty; współrzędne możesz wpisać w polu pod rysunkiem: <code>x; z</code>, <code>@dx; dz</code>, <code>&lt;L; kąt</code>.</li>
    <li><b>Podpory</b> (S), <b>przeguby</b> (H), <b>obciążenia</b> (L) – kliknij węzeł lub pręt. Prawy klik – menu kontekstowe.</li>
    <li>Wyniki (M, V, N, deformacja, reakcje) – przyciski nad rysunkiem; analiza odświeża się sama.</li>
    <li><b>Wymiarowanie</b>: prawy klik na pręcie → „Wymiaruj w module…” albo zakładka Wymiarowanie.</li></ul></div>`;
}
function nodePanel(id) {
  const P = RA.P, n = M.node(P, id), R = RA.R; if (!n) return modelPanel();
  const sp = P.supports.find(s => s.node === id), kind = sp ? M.supKind(sp) : 'none';
  const loads = P.loads.filter(l => l.node === id);
  let res = '';
  if (R && R.ok) { const i = R.ctx.nIdx.get(id); if (i !== undefined) { const r = RA.resOf(RA.view.src.startsWith('ENV') || RA.view.src.startsWith('buck') ? 'ENV:CHAR' : RA.view.src); if (r && r.disp) { const d = r.disp[i]; res += `<tr><td>u<sub>x</sub> / u<sub>z</sub></td><td>${fmt(d[0] * 1000, 2)} / ${fmt(d[1] * 1000, 2)}</td><td>mm</td></tr><tr><td>φ</td><td>${fmt(-d[2] * 1000, 3)}</td><td>mrad</td></tr>`; } else if (r && r.env && r.env.disp[i]) { const d = r.env.disp[i]; res += `<tr><td>u<sub>x</sub></td><td>${fmt(d[0].min * 1000, 1)}…${fmt(d[0].max * 1000, 1)}</td><td>mm</td></tr><tr><td>u<sub>z</sub></td><td>${fmt(d[1].min * 1000, 1)}…${fmt(d[1].max * 1000, 1)}</td><td>mm</td></tr>`; }
      if (sp && R.env.ULS) { const e = R.env.ULS.reac[i]; if (e) res += `<tr><td>R<sub>x</sub> (SGN)</td><td>${fmt(e[0].min, 1)}…${fmt(e[0].max, 1)}</td><td>kN</td></tr><tr><td>R<sub>z</sub> (SGN)</td><td>${fmt(e[1].min, 1)}…${fmt(e[1].max, 1)}</td><td>kN</td></tr>${sp.ry || sp.kr ? `<tr><td>M (SGN)</td><td>${fmt(-e[2].max, 1)}…${fmt(-e[2].min, 1)}</td><td>kNm</td></tr>` : ''}`; } } }
  return `<div class="ibox"><h4>Węzeł ${id}</h4><div class="fields0">
    ${Q.rowNum('x', 'x', n.x, 'm')}${Q.rowNum('z', 'z', n.z, 'm')}
    ${Q.rowSel('Podpora', 'sup', kind, [['none', 'brak']].concat(Object.keys(M.SUP_TYPES).map(k => [k, M.SUP_TYPES[k].n])).concat(kind === 'custom' ? [['custom', 'inna (zadana)']] : []))}
    ${sp ? `${Q.rowNum('k<sub>x</sub>', 'kx', sp.kx || '', 'kN/m', { ph: sp.ux ? 'sztywno' : '0' })}${Q.rowNum('k<sub>z</sub>', 'kz', sp.kz || '', 'kN/m', { ph: sp.uz ? 'sztywno' : '0' })}${Q.rowNum('k<sub>φ</sub>', 'kr', sp.kr || '', 'kNm/rad', { ph: sp.ry ? 'sztywno' : '0' })}${Q.rowNum('Kąt osi podpory', 'ang', sp.ang || 0, '°')}` : ''}
    </div><div class="ibtn"><button class="btn sm" data-i="nload">+ siła / moment</button>${sp ? '<button class="btn sm" data-i="settle">+ osiadanie</button>' : ''}<button class="btn sm dng" data-i="ndel">Usuń węzeł</button></div></div>
    ${loads.length ? `<div class="ibox"><h4>Obciążenia węzła</h4>${loadList(loads)}</div>` : ''}
    ${res ? `<div class="ibox"><h4>Wyniki</h4><table class="kv">${res}</table></div>` : ''}`;
}
function loadList(loads) {
  return `<table class="ltab">${loads.map(l => `<tr data-lid="${l.id}" class="${RA.sel.loads.has(l.id) ? 'on' : ''}"><td><i class="cdot" style="background:${(CMB.CATS[(RA.P.cases.find(c => c.id === l.case) || {}).cat] || {}).color || '#888'}"></i>${esc(l.case)}</td><td>${esc(UI.loadText(l))}</td><td><button class="lnk" data-ledit="${l.id}">zmień</button> <button class="lnk dng" data-ldel="${l.id}">✕</button></td></tr>`).join('')}</table>`;
}
UI.loadText = function (l) {
  const dir = { Z: '↓', X: '→', z: '⊥', x: '∥' }[l.dir] || '';
  if (l.kind === 'node') return [+l.Fx ? `F_x ${f2(+l.Fx)} kN` : '', +l.Fz ? `F_z ${f2(+l.Fz)} kN ↓` : '', +l.M ? `M ${f2(+l.M)} kNm ↻` : ''].filter(Boolean).join(', ') || '0';
  if (l.kind === 'settle') return `osiadanie ${[+l.dx ? 'Δx ' + f2(+l.dx) : '', +l.dz ? 'Δz ' + f2(+l.dz) + '↓' : '', +l.dr ? 'φ ' + f2(+l.dr) + ' mrad' : ''].filter(Boolean).join(', ')} mm`;
  if (l.kind === 'dist') { const q2 = l.q2 === '' || l.q2 === undefined ? l.q1 : l.q2; return `q ${f2(+l.q1)}${+q2 !== +l.q1 ? '…' + f2(+q2) : ''} kN/m ${dir}${l.proj ? ' (rzut)' : ''}${(+l.x1 || 0) > 0 || (l.x2 !== undefined && l.x2 !== '' && +l.x2 < 1) ? ` [${f2((+l.x1 || 0) * 100)}–${f2((l.x2 === '' || l.x2 === undefined ? 1 : +l.x2) * 100)}%]` : ''}`; }
  if (l.kind === 'point') return `P ${f2(+l.P)} kN ${dir} @ ${f2((+l.x || 0) * 100)}%`;
  if (l.kind === 'moment') return `M ${f2(+l.M)} kNm ↻ @ ${f2((+l.x || 0) * 100)}%`;
  if (l.kind === 'temp') return `ΔT ${f2(+l.dT || 0)} K, ΔT_d−g ${f2(+l.dTg || 0)} K`;
  return l.kind;
};
function barPanel(id) {
  const P = RA.P, b = M.bar(P, id), R = RA.R; if (!b) return modelPanel();
  const g = M.barGeom(P, b), s = M.sec(P, b.sec), el = D.elementOf(P, id);
  const loads = P.loads.filter(l => l.bar === id);
  const relOpt = v => (v === null ? 'rigid' : v === 0 ? 'hinge' : 'semi');
  let res = '';
  if (R && R.ok) { const ei = R.ctx.bIdx.get(id); if (ei !== undefined) { const ex = M.extremes(R, 'ULS', ei); if (ex) res = `<table class="kv"><tr><td>M<sub>max</sub> / M<sub>min</sub></td><td>${fmt(ex.Mmax.v, 1)} / ${fmt(ex.Mmin.v, 1)}</td><td>kNm</td></tr><tr><td>V<sub>max</sub> / V<sub>min</sub></td><td>${fmt(ex.Vmax.v, 1)} / ${fmt(ex.Vmin.v, 1)}</td><td>kN</td></tr><tr><td>N<sub>max</sub> / N<sub>min</sub></td><td>${fmt(ex.Nmax.v, 1)} / ${fmt(ex.Nmin.v, 1)}</td><td>kN</td></tr></table><p class="hint">Obwiednia SGN${R.env.ULS.explicit ? ' (II rząd)' : ''}.</p>`;
      const ec = M.extremes(R, 'CHAR', ei); if (ec && ec.wmax) res += `<table class="kv"><tr><td>ugięcie (char.)</td><td>${fmt(Math.max(Math.abs(ec.wmax.v), Math.abs(ec.wmin.v)) * 1000, 2)}</td><td>mm</td></tr></table>`;
      const lc = Object.values(R.buck || {}).filter(B => B.Lcr && B.Lcr[ei]).sort((a, c) => a.alpha - c.alpha)[0]; if (lc) res += `<table class="kv"><tr><td>L<sub>cr</sub> (α<sub>cr</sub> = ${fmt(lc.alpha, 2)})</td><td>${fmt(lc.Lcr[ei], 2)}</td><td>m</td></tr></table>`; } }
  return `<div class="ibox"><h4>Pręt ${id} <small>${esc(M.ROLE_N[M.roleOf(P, b)])}</small></h4>
    <table class="kv"><tr><td>Węzły</td><td>${b.n1} → ${b.n2}</td></tr><tr><td>Długość L</td><td>${f2(g.L)}</td><td>m</td></tr><tr><td>Kąt</td><td>${fmt(g.ang, 1)}</td><td>°</td></tr></table>
    <div class="fields0">
    <div class="row wide"><label>Przekrój</label><select data-f="sec">${secOpts(b.sec)}</select></div>
    ${Q.rowSel('Typ pręta', 'type', b.type, [['frame', 'ramowy (zginany)'], ['truss', 'kratowy (przeguby)']], { wide: true })}
    ${b.type === 'frame' ? Q.rowSel('Połączenie – początek', 'r0', relOpt(b.rel[0]), [['rigid', 'sztywne'], ['hinge', 'przegub'], ['semi', 'podatne k_φ']], { wide: true }) + (b.rel[0] > 0 ? Q.rowNum('k<sub>φ</sub> początek', 'k0', b.rel[0], 'kNm/rad') : '') + Q.rowSel('Połączenie – koniec', 'r1', relOpt(b.rel[1]), [['rigid', 'sztywne'], ['hinge', 'przegub'], ['semi', 'podatne k_φ']], { wide: true }) + (b.rel[1] > 0 ? Q.rowNum('k<sub>φ</sub> koniec', 'k1', b.rel[1], 'kNm/rad') : '') : ''}
    ${Q.rowSel('Rola (wymiarowanie)', 'role', b.role, [['auto', 'automatycznie'], ['beam', 'belka'], ['col', 'słup'], ['brace', 'stężenie / pręt kratowy']], { wide: true })}
    </div>
    <div class="ibtn"><button class="btn sm" data-i="bedit">Więcej…</button><button class="btn sm" data-i="bsplit">Podziel</button><button class="btn sm" data-i="bflip">Odwróć</button><button class="btn sm dng" data-i="bdel">Usuń</button></div></div>
  <div class="ibox"><h4>Obciążenia pręta</h4>${loads.length ? loadList(loads) : '<p class="hint">Brak obciążeń.</p>'}
    <div class="ibtn"><button class="btn sm" data-ladd="dist">+ rozłożone</button><button class="btn sm" data-ladd="point">+ siła</button><button class="btn sm" data-ladd="moment">+ moment</button><button class="btn sm" data-ladd="temp">+ temperatura</button></div></div>
  <div class="ibox"><h4>Wymiarowanie</h4>${el ? `<p>Element <b>${esc(el.name)}</b> – moduł ${D.MODS[el.mod].n} (${el.kind === 'beam' ? 'belka' : 'słup'})${el.res && el.res.eta !== null ? ` · η = <b class="${el.res.eta > 1 || !el.res.ok ? 'bad' : 'good'}">${fmt(el.res.eta * 100, 0)}%</b>` : ''}</p><div class="ibtn"><button class="btn sm pri" data-i="openmod" data-el="${el.id}">Otwórz w module ${D.MODS[el.mod].n}</button></div>` : s ? `<p class="hint">Pręt nie należy do elementu wymiarowanego.</p><div class="ibtn"><button class="btn sm pri" data-i="design">Wymiaruj w module ${D.MODS[D.modOfMat(s.mat)].n}</button></div>` : ''}</div>
  ${res ? `<div class="ibox"><h4>Wyniki</h4>${res}</div>` : ''}`;
}
function multiPanel() {
  const P = RA.P, sel = RA.sel;
  return `<div class="ibox"><h4>Zaznaczono: ${sel.bars.size} prętów, ${sel.nodes.size} węzłów</h4>
    ${sel.bars.size ? `<div class="fields0"><div class="row wide"><label>Przekrój zaznaczonych</label><select data-i="msec">${secOpts('', true)}</select></div>
    ${Q.rowSel('Typ', 'mtype', '', [['', '—'], ['frame', 'ramowy'], ['truss', 'kratowy']], { wide: true })}</div>` : ''}
    <div class="ibtn">${sel.bars.size ? '<button class="btn sm" data-i="mload">+ obciążenie rozłożone</button><button class="btn sm" data-i="mdesign">Wymiaruj zaznaczone</button>' : ''}<button class="btn sm" data-i="mcopy">Kopiuj / przesuń…</button><button class="btn sm dng" data-i="mdel">Usuń zaznaczone</button></div></div>`;
}
function bindInsp(el) {
  const P = RA.P;
  const nid = RA.sel.nodes.size === 1 && !RA.sel.bars.size ? [...RA.sel.nodes][0] : null;
  const bid = RA.sel.bars.size === 1 ? [...RA.sel.bars][0] : null;
  $$('[data-f]', el).forEach(f => f.addEventListener('change', () => {
    const k = f.dataset.f, v = f.type === 'checkbox' ? f.checked : f.tagName === 'SELECT' ? f.value : Q.num(f.value);
    if (nid !== null && RA.sel.nodes.size === 1 && !RA.sel.bars.size) {
      const n = M.node(P, nid);
      if (k === 'x' || k === 'z') { if (v === null) return; n[k] = v; }
      else if (k === 'sup') { const old = P.supports.find(s => s.node === nid); M.setSupport(P, nid, v === 'none' ? null : v, old && v === 'spring' ? { kx: old.kx, kz: old.kz, kr: old.kr } : null); if (v === 'spring') { const s = P.supports.find(q => q.node === nid); s.kz = s.kz || 10000; } }
      else { const s = P.supports.find(q => q.node === nid); if (s) { if (k === 'ang') s.ang = v || 0; else s[k] = v > 0 ? v : 0; } }
      RA.change(); return;
    }
    if (bid !== null) {
      const b = M.bar(P, bid);
      if (k === 'sec') b.sec = v;
      else if (k === 'type') { b.type = v; if (v === 'truss') b.rel = [null, null]; }
      else if (k === 'r0' || k === 'r1') { const i = +k[1]; b.rel[i] = v === 'rigid' ? null : v === 'hinge' ? 0 : (b.rel[i] > 0 ? b.rel[i] : 10000); }
      else if (k === 'k0' || k === 'k1') { b.rel[+k[1]] = v > 0 ? v : 0; }
      else if (k === 'role') b.role = v;
      RA.change(); return;
    }
    if (k === 'mtype' && v) { RA.sel.bars.forEach(id => { const b = M.bar(P, id); b.type = v; if (v === 'truss') b.rel = [null, null]; }); RA.change(); }
  }));
  const on = (sel, fn) => { const b = $(`[data-i="${sel}"]`, el); if (b) b.addEventListener(b.tagName === 'SELECT' ? 'change' : 'click', fn); };
  on('cursec', e => { UI._cur = e.target.value; });
  on('secs', () => UI.sections()); on('gen', () => UI.generator());
  on('nload', () => UI.loadDialog({ kind: 'node', node: nid })); on('settle', () => UI.loadDialog({ kind: 'settle', node: nid }));
  on('ndel', () => { M.deleteNodes(P, [nid]); RA.change(); });
  on('bedit', () => UI.barDialog(bid)); on('bsplit', () => UI.splitDialog(bid, 0.5));
  on('bflip', () => { const b = M.bar(P, bid); [b.n1, b.n2] = [b.n2, b.n1]; b.rel = [b.rel[1], b.rel[0]]; P.loads.filter(l => l.bar === bid).forEach(l => { if (l.x !== undefined) l.x = 1 - (+l.x || 0); if (l.kind === 'dist') { const x1 = +l.x1 || 0, x2 = l.x2 === '' || l.x2 === undefined ? 1 : +l.x2, q1 = l.q1, q2 = l.q2 === '' || l.q2 === undefined ? l.q1 : l.q2; l.x1 = 1 - x2; l.x2 = 1 - x1; l.q1 = q2; l.q2 = q1; if (l.dir === 'z' || l.dir === 'x') { l.q1 = -l.q1; l.q2 = -l.q2; } } if (l.kind === 'point' && (l.dir === 'z' || l.dir === 'x')) l.P = -l.P; if (l.kind === 'temp') l.dTg = -(+l.dTg || 0); }); RA.change(); });
  on('bdel', () => { M.deleteBars(P, [bid]); RA.change(); });
  on('openmod', e => RA.mod.open(e.target.dataset.el)); on('design', () => UI.designFromBar(bid));
  on('msec', e => { if (!e.target.value) return; RA.sel.bars.forEach(id => { M.bar(P, id).sec = e.target.value; }); RA.change(); });
  on('mload', () => UI.loadDialog({ kind: 'dist', bars: [...RA.sel.bars] }));
  on('mdesign', () => UI.designBars([...RA.sel.bars]));
  on('mcopy', () => UI.copyDialog());
  on('mdel', () => UI.deleteSel());
  $$('[data-ledit]', el).forEach(b => b.onclick = () => UI.loadDialog(P.loads.find(l => l.id === +b.dataset.ledit)));
  $$('[data-ldel]', el).forEach(b => b.onclick = () => { P.loads = P.loads.filter(l => l.id !== +b.dataset.ldel); RA.change(); });
  $$('[data-lid]', el).forEach(tr => tr.onclick = e => { if (e.target.closest('button')) return; const id = +tr.dataset.lid; RA.sel.loads.clear(); RA.sel.loads.add(id); const l = P.loads.find(q => q.id === id); if (l && l.case !== RA.activeCase) RA.activeCase = l.case; RA.cv.render(); UI.inspector(); });
  $$('[data-ladd]', el).forEach(b => b.onclick = () => UI.loadDialog({ kind: b.dataset.ladd, bar: bid, t: 0.5 }));
}
UI.deleteSel = function () {
  const P = RA.P, s = RA.sel;
  if (s.loads.size) { P.loads = P.loads.filter(l => !s.loads.has(l.id)); s.loads.clear(); RA.change(); return; }
  if (s.bars.size) M.deleteBars(P, [...s.bars]);
  if (s.nodes.size) M.deleteNodes(P, [...s.nodes]);
  s.bars.clear(); s.nodes.clear(); RA.change();
};

/* ------------------------------------------------------------ podpory */
UI.supportMenu = function (nid, x, y) {
  const P = RA.P, sp = P.supports.find(s => s.node === nid), cur = sp ? M.supKind(sp) : 'none';
  Q.menu(x, y, [{ label: `<b>Podpora w węźle ${nid}</b>`, dis: true }].concat(Object.keys(M.SUP_TYPES).map(k => ({ label: `${k === cur ? '● ' : ''}${M.SUP_TYPES[k].n}`, fn: () => { if (k === 'spring') { UI.nodeDialog(nid, 'spring'); return; } M.setSupport(P, nid, k); RA.change(); } }))).concat([{ sep: true }, { label: 'Podpora ukośna / sprężysta – parametry…', fn: () => UI.nodeDialog(nid) }, { label: 'Usuń podporę', fn: () => { M.setSupport(P, nid, null); RA.change(); }, dis: !sp }]));
};
UI.nodeDialog = function (nid, preset) {
  const P = RA.P, n = M.node(P, nid); if (!n) return;
  let sp = P.supports.find(s => s.node === nid);
  const s0 = sp ? Object.assign({}, sp) : { ux: 0, uz: 0, ry: 0, kx: 0, kz: 0, kr: 0, ang: 0 };
  if (preset === 'spring') Object.assign(s0, { ux: 0, uz: 0, ry: 0, kz: s0.kz || 10000 });
  const m = Q.modal(`<h3>Węzeł ${nid}</h3><div class="fields0">${Q.rowNum('x', 'x', n.x, 'm')}${Q.rowNum('z', 'z', n.z, 'm')}</div>
    <h4 class="dh">Podpora – blokady i sprężystości</h4><div class="supg">
    ${Q.chk('blokada przesuwu x (poziomo)', 'ux', s0.ux)}${Q.chk('blokada przesuwu z (pionowo)', 'uz', s0.uz)}${Q.chk('blokada obrotu φ (utwierdzenie)', 'ry', s0.ry)}</div>
    <div class="fields0">${Q.rowNum('Sprężystość k<sub>x</sub>', 'kx', s0.kx || '', 'kN/m', { ph: 'brak' })}${Q.rowNum('Sprężystość k<sub>z</sub>', 'kz', s0.kz || '', 'kN/m', { ph: 'brak' })}${Q.rowNum('Sprężystość obrotowa k<sub>φ</sub>', 'kr', s0.kr || '', 'kNm/rad', { ph: 'brak' })}${Q.rowNum('Kąt obrotu osi podpory', 'ang', s0.ang || 0, '°')}</div>
    <p class="hint">Sprężystość działa w kierunku bez blokady. Kąt obraca osie x, z podpory (podpora ukośna, np. na pochyłym podłożu).</p>
    <div class="dbtn"><button class="btn" data-a="del">Usuń podporę</button><span style="flex:1"></span><button class="btn" data-a="0">Anuluj</button><button class="btn pri" data-a="1">Zastosuj</button></div>`, 'sm');
  m.onclick = e => { const b = e.target.closest('[data-a]'); if (!b) return;
    if (b.dataset.a === '0') { Q.closeModal(); return; }
    if (b.dataset.a === 'del') { M.setSupport(P, nid, null); Q.closeModal(); RA.change(); return; }
    const o = Q.readFields(m);
    if (o.x !== '' && o.x !== null) n.x = o.x; if (o.z !== '' && o.z !== null) n.z = o.z;
    const any = o.ux || o.uz || o.ry || o.kx > 0 || o.kz > 0 || o.kr > 0;
    P.supports = P.supports.filter(s => s.node !== nid);
    if (any) P.supports.push({ node: nid, ux: o.ux ? 1 : 0, uz: o.uz ? 1 : 0, ry: o.ry ? 1 : 0, kx: o.kx > 0 ? o.kx : 0, kz: o.kz > 0 ? o.kz : 0, kr: o.kr > 0 ? o.kr : 0, ang: +o.ang || 0 });
    Q.closeModal(); RA.change(); };
};

/* ------------------------------------------------------------ pręt – okno właściwości */
UI.barDialog = function (bid) {
  const P = RA.P, b = M.bar(P, bid); if (!b) return; const g = M.barGeom(P, b);
  const m = Q.modal(`<h3>Pręt ${bid}</h3><p class="hint">Węzeł początkowy ${b.n1} (${f2(g.a.x)}; ${f2(g.a.z)}) → końcowy ${b.n2} (${f2(g.b.x)}; ${f2(g.b.z)}); L = ${f2(g.L)} m, kąt ${fmt(g.ang, 1)}°. Strona „spodu” (linia przerywana) – po prawej od kierunku węzeł początkowy → końcowy.</p>
    <div class="fields0"><div class="row wide"><label>Przekrój</label><select data-f="sec">${secOpts(b.sec)}</select></div>
    ${Q.rowTxt('Nazwa (opis)', 'name', b.name, 'np. rygiel osi A')}
    ${Q.rowSel('Typ pręta', 'type', b.type, [['frame', 'ramowy (zginany)'], ['truss', 'kratowy (przeguby na końcach)']], { wide: true })}
    ${Q.rowNum('Połączenie początek: k<sub>φ</sub>', 'k0', b.rel[0] === null ? '' : b.rel[0], 'kNm/rad', { ph: 'sztywne' })}
    ${Q.rowNum('Połączenie koniec: k<sub>φ</sub>', 'k1', b.rel[1] === null ? '' : b.rel[1], 'kNm/rad', { ph: 'sztywne' })}
    ${Q.rowNum('Długość L (przesuwa węzeł końcowy)', 'L', g.L, 'm')}</div>
    <p class="hint">k<sub>φ</sub> = 0 – przegub; puste – połączenie sztywne; wartość dodatnia – połączenie podatne (np. węzeł stalowy wg PN-EN 1993-1-8).</p>
    <div class="dbtn"><button class="btn" data-a="0">Anuluj</button><button class="btn pri" data-a="1">Zastosuj</button></div>`, 'sm');
  m.onclick = e => { const btn = e.target.closest('[data-a]'); if (!btn) return; if (btn.dataset.a === '0') { Q.closeModal(); return; }
    const o = Q.readFields(m); b.sec = o.sec; b.name = o.name || ''; b.type = o.type;
    b.rel = b.type === 'truss' ? [null, null] : [o.k0 === '' ? null : Math.max(0, +o.k0), o.k1 === '' ? null : Math.max(0, +o.k1)];
    if (o.L > 0 && Math.abs(o.L - g.L) > 1e-9) { const n2 = M.node(P, b.n2); n2.x = g.a.x + g.c * o.L; n2.z = g.a.z + g.s * o.L; }
    Q.closeModal(); RA.change(); };
};
UI.splitDialog = function (bid, t0) {
  const P = RA.P, b = M.bar(P, bid); if (!b) return; const g = M.barGeom(P, b);
  const m = Q.modal(`<h3>Podział pręta ${bid}</h3><div class="fields0">${Q.rowNum('Odległość od węzła początkowego', 'a', Math.round(g.L * t0 * 100) / 100, 'm')}${Q.rowNum('albo: liczba równych części', 'n', '', '', { ph: '—' })}</div>
    <div class="dbtn"><button class="btn" data-a="0">Anuluj</button><button class="btn pri" data-a="1">Podziel</button></div>`, 'sm');
  m.onclick = e => { const btn = e.target.closest('[data-a]'); if (!btn) return; if (btn.dataset.a === '0') { Q.closeModal(); return; }
    const o = Q.readFields(m);
    if (o.n > 1) { const n = Math.round(o.n); let cur = b.id; for (let k = n; k > 1; k--) { const r = M.splitBar(P, cur, 1 / k); if (r) cur = r.bar.id; } }
    else if (o.a > 0 && o.a < g.L) M.splitBar(P, bid, o.a / g.L);
    Q.closeModal(); RA.change(); };
};
UI.copyDialog = function () {
  const P = RA.P, sel = RA.sel;
  const m = Q.modal(`<h3>Kopiuj / przesuń zaznaczone</h3><div class="fields0">${Q.rowNum('Przesunięcie Δx', 'dx', 0, 'm')}${Q.rowNum('Przesunięcie Δz', 'dz', 0, 'm')}${Q.rowNum('Liczba kopii (0 – przesuń)', 'n', 1, '')}</div>
    ${Q.chk('kopiuj także obciążenia', 'cl', true)}<div class="dbtn"><button class="btn" data-a="0">Anuluj</button><button class="btn pri" data-a="1">Wykonaj</button></div>`, 'sm');
  m.onclick = e => { const btn = e.target.closest('[data-a]'); if (!btn) return; if (btn.dataset.a === '0') { Q.closeModal(); return; }
    const o = Q.readFields(m), dx = +o.dx || 0, dz = +o.dz || 0, n = Math.max(0, Math.round(+o.n || 0));
    const bars = [...sel.bars].map(id => M.bar(P, id)).filter(Boolean), nodes = new Set([...sel.nodes]); bars.forEach(b => { nodes.add(b.n1); nodes.add(b.n2); });
    if (n === 0) { nodes.forEach(id => { const q = M.node(P, id); q.x += dx; q.z += dz; }); M.mergeNodes(P, 1e-6); }
    else for (let k = 1; k <= n; k++) {
      const map = new Map(); nodes.forEach(id => { const q = M.node(P, id); map.set(id, M.addNode(P, q.x + dx * k, q.z + dz * k, 1e-6).id); });
      bars.forEach(b => { const nb = M.addBar(P, map.get(b.n1), map.get(b.n2), b.sec, { type: b.type, rel: b.rel.slice(), role: b.role }); if (nb && o.cl) P.loads.filter(l => l.bar === b.id).forEach(l => P.loads.push(Object.assign({}, l, { id: P.seq.load++, bar: nb.id }))); });
      if (o.cl) P.loads.filter(l => l.node !== undefined && nodes.has(l.node) && l.kind === 'node').forEach(l => P.loads.push(Object.assign({}, l, { id: P.seq.load++, node: map.get(l.node) })));
      P.supports.filter(s => nodes.has(s.node)).forEach(s => { if (!P.supports.some(q => q.node === map.get(s.node))) P.supports.push(Object.assign({}, s, { node: map.get(s.node) })); });
    }
    Q.closeModal(); RA.change(); };
};

/* ------------------------------------------------------------ obciążenia – okno */
UI.loadDialog = function (o) {
  const P = RA.P; if (!o) return;
  const edit = !!o.id;
  const l = edit ? o : Object.assign({ case: RA.activeCase, dir: 'Z', q1: '', q2: '', x1: 0, x2: 1, P: '', x: o.t !== undefined ? Math.round(o.t * 100) / 100 : 0.5, M: '', dT: '', dTg: '', Fx: '', Fz: '', dx: '', dz: '', dr: '' }, o);
  const kinds = l.node !== undefined ? [['node', 'Siła / moment w węźle'], ['settle', 'Osiadanie (przemieszczenie wymuszone)']] : [['dist', 'Rozłożone'], ['point', 'Siła skupiona'], ['moment', 'Moment skupiony'], ['temp', 'Temperatura']];
  const b = l.bar !== undefined ? M.bar(P, l.bar) : null, g = b ? M.barGeom(P, b) : null;
  const caseSel = `<div class="row wide"><label>Przypadek obciążenia</label><select data-f="case">${P.cases.map(c => `<option value="${esc(c.id)}" ${c.id === l.case ? 'selected' : ''}>${esc(c.id)} – ${esc(c.name || CMB.CATS[c.cat].n)}</option>`).join('')}</select></div>`;
  const dirs = [['Z', 'pionowo ↓ (globalnie, + w dół)'], ['X', 'poziomo → (globalnie, + w prawo)'], ['z', 'prostopadle do pręta (+ w stronę spodu)'], ['x', 'wzdłuż pręta (+ do węzła końcowego)']];
  const body = () => {
    const k = l.kind;
    if (k === 'node') return `${Q.rowNum('F<sub>x</sub> (→ +)', 'Fx', l.Fx, 'kN')}${Q.rowNum('F<sub>z</sub> (↓ +)', 'Fz', l.Fz, 'kN')}${Q.rowNum('M (↻ +)', 'M', l.M, 'kNm')}`;
    if (k === 'settle') return `${Q.rowNum('Δx (→ +)', 'dx', l.dx, 'mm')}${Q.rowNum('Δz (↓ +, osiadanie)', 'dz', l.dz, 'mm')}${Q.rowNum('φ (↻ +)', 'dr', l.dr, 'mrad')}<p class="hint">Przemieszczenie wymuszone działa w kierunkach zablokowanych podpory.</p>`;
    if (k === 'dist') return `${Q.rowSel('Kierunek', 'dir', l.dir, dirs, { wide: true })}${Q.rowNum('q<sub>1</sub> (początek)', 'q1', l.q1, 'kN/m')}${Q.rowNum('q<sub>2</sub> (koniec; puste = q<sub>1</sub>)', 'q2', l.q2, 'kN/m', { ph: '= q₁' })}
      ${Q.rowNum('od (względnie 0–1)', 'x1', l.x1, '', { ph: '0' })}${Q.rowNum('do (względnie 0–1)', 'x2', l.x2, '', { ph: '1' })}${g ? `<p class="hint">Długość pręta ${f2(g.L)} m (0,25 = ${f2(g.L * 0.25)} m).</p>` : ''}
      ${Q.chk('na rzut poziomy (Z) / pionowy (X) – np. śnieg na połaci', 'proj', l.proj)}`;
    if (k === 'point') return `${Q.rowSel('Kierunek', 'dir', l.dir, dirs, { wide: true })}${Q.rowNum('P', 'P', l.P, 'kN')}${Q.rowNum('Położenie (względnie 0–1)', 'x', l.x, '')}${g ? `<p class="hint">x = ${f2(g.L * (+l.x || 0))} m od węzła ${b.n1}.</p>` : ''}`;
    if (k === 'moment') return `${Q.rowNum('M (↻ +)', 'M', l.M, 'kNm')}${Q.rowNum('Położenie (względnie 0–1)', 'x', l.x, '')}`;
    if (k === 'temp') return `${Q.rowNum('ΔT równomierne (ogrzanie +)', 'dT', l.dT, 'K')}${Q.rowNum('ΔT<sub>d</sub> − ΔT<sub>g</sub> (spód − góra)', 'dTg', l.dTg, 'K')}<p class="hint">Spód – strona z linią przerywaną. α<sub>T</sub>: beton 1,0·10⁻⁵, stal 1,2·10⁻⁵, drewno 0,5·10⁻⁵ 1/K.</p>`;
    return '';
  };
  const draw = () => {
    const m = Q.modal(`<h3>${edit ? 'Zmiana obciążenia' : 'Nowe obciążenie'} – ${l.node !== undefined ? 'węzeł ' + l.node : o.bars ? `pręty ${o.bars.join(', ')}` : 'pręt ' + l.bar}</h3>
      <div class="segsw ksel">${kinds.map(([k, t]) => `<button data-k="${k}" class="${l.kind === k ? 'on' : ''}">${t}</button>`).join('')}</div>
      <div class="fields0">${caseSel}${body()}</div>
      <div class="dbtn">${edit ? '<button class="btn dng" data-a="del">Usuń</button><span style="flex:1"></span>' : ''}<button class="btn" data-a="0">Anuluj</button><button class="btn pri" data-a="1">${edit ? 'Zastosuj' : 'Dodaj'}</button></div>`, 'sm');
    $$('[data-k]', m).forEach(bt => bt.onclick = () => { Object.assign(l, Q.readFields(m)); l.kind = bt.dataset.k; draw(); });
    m.onclick = e => { const btn = e.target.closest('[data-a]'); if (!btn) return;
      if (btn.dataset.a === '0') { Q.closeModal(); return; }
      if (btn.dataset.a === 'del') { P.loads = P.loads.filter(q => q.id !== l.id); Q.closeModal(); RA.change(); return; }
      const v = Q.readFields(m); Object.assign(l, v);
      ['x1', 'x', 'x2'].forEach(k => { if (l[k] !== '' && l[k] !== undefined && l[k] !== null) l[k] = Math.max(0, Math.min(1, +l[k])); });
      if (l.kind === 'dist' && l.x2 === '') l.x2 = 1; if (l.kind === 'dist' && l.x1 === '') l.x1 = 0;
      const clean = Object.assign({}, l); delete clean.t; delete clean.bars;
      const keep = { node: ['id', 'case', 'kind', 'node', 'Fx', 'Fz', 'M'], settle: ['id', 'case', 'kind', 'node', 'dx', 'dz', 'dr'], dist: ['id', 'case', 'kind', 'bar', 'dir', 'q1', 'q2', 'x1', 'x2', 'proj'], point: ['id', 'case', 'kind', 'bar', 'dir', 'P', 'x'], moment: ['id', 'case', 'kind', 'bar', 'M', 'x'], temp: ['id', 'case', 'kind', 'bar', 'dT', 'dTg'] }[l.kind];
      const rec = {}; keep.forEach(k => { if (clean[k] !== undefined) rec[k] = clean[k]; });
      if (edit) { const i = P.loads.findIndex(q => q.id === l.id); P.loads[i] = rec; }
      else { (o.bars || [l.bar === undefined ? null : l.bar]).forEach((bid, i) => { const r = Object.assign({}, rec, { id: P.seq.load++ }); if (bid !== null) r.bar = bid; P.loads.push(r); }); }
      RA.activeCase = rec.case; Q.closeModal(); RA.change(); };
  };
  draw();
};

/* ------------------------------------------------------------ przypadki obciążeń */
UI.caseDialog = function (c0) {
  const P = RA.P, edit = !!c0, c = Object.assign({ name: '', cat: 'Q', qcat: 'B', alt: 'low', grp: '', sw: false, p0: 0.7, p1: 0.5, p2: 0.3, dur: '' }, c0 || {});
  const draw = () => {
    const m = Q.modal(`<h3>${edit ? 'Przypadek ' + esc(c.id) : 'Nowy przypadek obciążenia'}</h3><div class="fields0">
      ${Q.rowTxt('Nazwa', 'name', c.name, 'np. Śnieg – wariant (i)')}
      ${Q.rowSel('Rodzaj oddziaływania', 'cat', c.cat, Object.keys(CMB.CATS).map(k => [k, CMB.CATS[k].n]), { wide: true })}
      ${c.cat === 'Q' ? Q.rowSel('Kategoria (PN-EN 1991-1-1)', 'qcat', c.qcat, Object.keys(CMB.QCAT).map(k => [k, CMB.QCAT[k]]), { wide: true }) : ''}
      ${c.cat === 'S' ? Q.rowSel('Wysokość n.p.m.', 'alt', c.alt, [['low', 'H ≤ 1000 m'], ['high', 'H > 1000 m']], { wide: true }) : ''}
      ${c.cat === 'E' ? Q.rowNum('ψ<sub>0</sub>', 'p0', c.p0, '') + Q.rowNum('ψ<sub>1</sub>', 'p1', c.p1, '') + Q.rowNum('ψ<sub>2</sub>', 'p2', c.p2, '') : ''}
      ${!['G', 'A'].includes(c.cat) ? Q.rowTxt('Grupa wykluczająca', 'grp', c.grp, 'np. W (wiatr), S (śnieg)') : ''}
      ${Q.rowSel('Klasa trwania (drewno)', 'dur', c.dur, [['', 'automatycznie'], ['P', 'stałe'], ['L', 'długotrwałe'], ['M', 'średniotrwałe'], ['S', 'krótkotrwałe'], ['I', 'chwilowe']], { wide: true })}
      ${c.cat === 'G' ? Q.chk('ciężar własny prętów (automatycznie z przekrojów)', 'sw', c.sw) : ''}
      ${!['G', 'A'].includes(c.cat) ? Q.chk('układ szachownicowy – obciążenie każdego pręta osobno, tylko tam, gdzie niekorzystne', 'pattern', c.pattern === undefined ? c.cat === 'Q' : c.pattern) : ''}</div>
      <p class="hint">ψ wg PN-EN 1990 tabl. A1.1 (ZK). Przypadki z tą samą <b>grupą wykluczającą</b> nie działają jednocześnie (np. wiatr z lewej / z prawej, warianty śniegu) – także w modułach.</p>
      <div class="dbtn">${edit ? '<button class="btn dng" data-a="del">Usuń przypadek</button><span style="flex:1"></span>' : ''}<button class="btn" data-a="0">Anuluj</button><button class="btn pri" data-a="1">${edit ? 'Zastosuj' : 'Dodaj'}</button></div>`, 'sm');
    const cs = $('[data-f="cat"]', m); cs.onchange = () => { Object.assign(c, Q.readFields(m)); draw(); };
    m.onclick = async e => { const b = e.target.closest('[data-a]'); if (!b) return;
      if (b.dataset.a === '0') { Q.closeModal(); return; }
      if (b.dataset.a === 'del') { const n = P.loads.filter(l => l.case === c.id).length; Q.closeModal(); if (P.cases.length < 2) { Q.toast('Musi pozostać co najmniej jeden przypadek.'); return; } if (n && !(await Q.ask(`Usunąć przypadek ${esc(c.id)} wraz z ${n} obciążeniami?`, 'Usuń', true))) return; P.cases = P.cases.filter(q => q.id !== c.id); P.loads = P.loads.filter(l => l.case !== c.id); RA.change(); return; }
      Object.assign(c, Q.readFields(m));
      if (edit) { const i = P.cases.findIndex(q => q.id === c.id); P.cases[i] = Object.assign({}, c); }
      else { c.id = M.nextCaseId(P, c.cat); P.cases.push(Object.assign({}, c)); RA.activeCase = c.id; }
      Q.closeModal(); RA.change(); };
  };
  draw();
};

/* ------------------------------------------------------------ przekroje i materiały */
UI.sections = function (needNew) {
  const P = RA.P;
  const list = () => P.sections.map(s => { const p = SEC.props(s), used = P.bars.filter(b => b.sec === s.id).length; return `<tr data-sid="${esc(s.id)}"><td>${SEC.svg(s, 34)}</td><td><b>${esc(s.name || s.id)}</b><br><small>${esc(SEC.MAT_KIND[s.mat])}</small></td><td>${esc(SEC.fullLabel(s))}</td><td class="val">${p.ok ? fmt(p.A * 1e4, 1) : '—'}</td><td class="val">${p.ok ? fmt(p.I * 1e8, 0) : '—'}</td><td class="val">${p.ok ? fmt(p.g, 3) : '—'}</td><td class="val">${used}</td><td><button class="lnk" data-se="${esc(s.id)}">zmień</button> <button class="lnk" data-sd="${esc(s.id)}">kopiuj</button> ${used ? '' : `<button class="lnk dng" data-sx="${esc(s.id)}">✕</button>`}</td></tr>`; }).join('');
  const draw = () => {
    const m = Q.modal(`<h3>Przekroje i materiały</h3>
      <table class="ctab sectab"><thead><tr><th></th><th>Nazwa</th><th>Przekrój · materiał</th><th>A [cm²]</th><th>I [cm⁴]</th><th>g [kN/m]</th><th>pręty</th><th></th></tr></thead><tbody>${list() || '<tr><td colspan="8" class="hint">Brak przekrojów – dodaj pierwszy.</td></tr>'}</tbody></table>
      <div class="dbtn" style="justify-content:flex-start"><button class="btn" data-new="C">+ żelbetowy</button><button class="btn" data-new="S">+ stalowy</button><button class="btn" data-new="D">+ drewniany</button><span style="flex:1"></span><button class="btn pri" data-a="0">Zamknij</button></div>
      <p class="hint">Materiały i kształtowniki pochodzą z bibliotek modułów: beton (PN-EN 1992-1-1, tabl. 3.1), stal (PN-EN 10025, kształtowniki PN-EN 10365/10210/10219/10056), drewno (PN-EN 338, PN-EN 14080, LVL). Zmiana przekroju w module przenosi się tutaj automatycznie.</p>`, 'secwin');
    m.onclick = e => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.dataset.a === '0') { Q.closeModal(); return; }
      if (t.dataset.new) { UI.secEdit(SEC.make(t.dataset.new), true, draw); return; }
      if (t.dataset.se) { UI.secEdit(M.sec(P, t.dataset.se), false, draw); return; }
      if (t.dataset.sd) { const s = Object.assign(Q.clone(M.sec(P, t.dataset.sd)), { id: 's' + (P.seq.sec++), name: '' }); P.sections.push(s); RA.change(); draw(); return; }
      if (t.dataset.sx) { P.sections = P.sections.filter(s => s.id !== t.dataset.sx); RA.change(); draw(); }
    };
  };
  draw();
  if (needNew && !P.sections.length) UI.secEdit(SEC.make('C'), true, draw);
};
UI.secEdit = function (s0, isNew, back) {
  const P = RA.P, s = Q.clone(s0);
  const draw = () => {
    let fields = '';
    if (s.mat === 'C') {
      fields = Q.rowSel('Klasa betonu', 'cls', s.cls, SEC.concreteClasses().map(c => [c, c]), {}) + Q.rowSel('Kształt', 'shape', s.shape, [['rect', 'prostokątny b × h'], ['T', 'teowy'], ['circ', 'okrągły ⌀D'], ['ring', 'pierścieniowy ⌀D × t']], { wide: true });
      if (s.shape === 'rect') fields += Q.rowNum('b', 'b', s.b, 'mm') + Q.rowNum('h (w płaszczyźnie układu)', 'h', s.h, 'mm');
      if (s.shape === 'T') fields += Q.rowNum('b<sub>w</sub> (środnik)', 'b', s.b, 'mm') + Q.rowNum('h', 'h', s.h, 'mm') + Q.rowNum('b<sub>eff</sub> (półka)', 'beff', s.beff, 'mm') + Q.rowNum('h<sub>f</sub> (półka)', 'hf', s.hf, 'mm');
      if (s.shape === 'circ' || s.shape === 'ring') fields += Q.rowNum('D', 'D', s.D, 'mm');
      if (s.shape === 'ring') fields += Q.rowNum('t (ścianka)', 't', s.t, 'mm');
    } else if (s.mat === 'S') {
      const SS = SEC.steelSeries(), pr = s.prof;
      fields = Q.rowSel('Gatunek stali', 'cls', s.cls, SEC.steelGrades().map(c => [c, c]), {}) + Q.rowSel('Rodzaj', 'typ', pr.typ, Object.keys(SS).filter(k => !k.startsWith('_')).map(k => [k, SS[k].n]), { wide: true });
      const ser = (SS[pr.typ] || {}).serie || [];
      if (ser.length) { if (!ser.includes(pr.seria)) pr.seria = ser[0]; fields += Q.rowSel('Seria', 'seria', pr.seria, ser.map(x => [x, x]), {}); const lst = SEC.steelList(pr.seria); if (!lst.includes(String(pr.nr))) pr.nr = lst[Math.floor(lst.length / 2)]; fields += Q.rowSel('Kształtownik', 'nr', String(pr.nr), lst.map(x => [x, `${pr.seria} ${x.replace(/x/g, '×')}`]), {}); }
      if (pr.typ === 'spaw') { ['h', 'bg', 'tg', 'bd', 'td', 'tw'].forEach(k => { if (pr[k] === undefined) pr[k] = { h: 600, bg: 250, tg: 16, bd: 250, td: 16, tw: 10 }[k]; }); fields += Q.rowNum('h', 'p_h', pr.h, 'mm') + Q.rowNum('b pasa górnego', 'p_bg', pr.bg, 'mm') + Q.rowNum('t pasa górnego', 'p_tg', pr.tg, 'mm') + Q.rowNum('b pasa dolnego', 'p_bd', pr.bd, 'mm') + Q.rowNum('t pasa dolnego', 'p_td', pr.td, 'mm') + Q.rowNum('t<sub>w</sub> środnika', 'p_tw', pr.tw, 'mm'); }
      if (pr.typ === 'rura' || pr.typ === 'chs') fields += Q.rowSel('Wykonanie', 'wyk', pr.wyk || 'gor', [['gor', 'gorąco wykończone (PN-EN 10210)'], ['zimn', 'formowane na zimno (PN-EN 10219)']], { wide: true });
      if (pr.typ === 'dwuc') fields += Q.rowSel('Układ', 'uklad', pr.uklad || 'zew', [['zew', 'półkami na zewnątrz ] ['], ['wew', 'półkami do wewnątrz [ ]'], ['plecy', 'plecami ][']], { wide: true }) + Q.rowNum('Rozstaw gałęzi a (puste – auto)', 'p_a', pr.a || '', 'mm', { ph: 'auto' });
      fields += Q.chk('obrót o 90° – zginanie względem osi słabej z–z', 'rot', s.rot);
    } else {
      fields = `<div class="row wide"><label>Klasa drewna</label><select data-f="cls">${SEC.timberGroups().map(([g, l]) => `<optgroup label="${esc(g)}">${l.map(c => `<option ${c === s.cls ? 'selected' : ''}>${c}</option>`).join('')}</optgroup>`).join('')}</select></div>` + Q.rowSel('Kształt', 'shape', s.shape, [['rect', 'prostokątny'], ['round', 'okrągły']], { wide: true });
      if (s.shape === 'round') fields += Q.rowNum('D', 'D', s.D, 'mm');
      else fields += Q.rowNum('b (jednej części)', 'b', s.b, 'mm') + Q.rowNum('h (w płaszczyźnie układu)', 'h', s.h, 'mm') + Q.rowNum('liczba części obok siebie n', 'n', s.n || 1, '');
    }
    const p = SEC.props(s);
    const m = Q.modal(`<h3>${isNew ? 'Nowy przekrój' : 'Przekrój ' + esc(s.name || s.id)} – ${esc(SEC.MAT_KIND[s.mat])}</h3>
      <div class="seced"><div class="fields0">${Q.rowTxt('Nazwa (opcjonalnie)', 'name', s.name, 'np. Rygiel R1')}${fields}${Q.rowNum('Mnożnik sztywności EI (np. zarysowanie)', 'kEI', s.kEI || 1, '')}</div>
      <div class="secprev">${SEC.svg(s, 150)}<table class="kv">${p.ok ? `<tr><td>A</td><td>${fmt(p.A * 1e4, 2)}</td><td>cm²</td></tr><tr><td>I (w płaszczyźnie)</td><td>${fmt(p.I * 1e8, 1)}</td><td>cm⁴</td></tr><tr><td>I<sub>z</sub></td><td>${fmt(p.Iz * 1e8, 1)}</td><td>cm⁴</td></tr><tr><td>E</td><td>${fmt(p.E / 1e6, 1)}</td><td>GPa</td></tr><tr><td>g</td><td>${fmt(p.g, 3)}</td><td>kN/m</td></tr><tr><td>h</td><td>${fmt(p.h * 1000, 0)}</td><td>mm</td></tr>` : `<tr><td colspan="3" class="bad">${esc(p.err)}</td></tr>`}</table></div></div>
      <div class="dbtn"><button class="btn" data-a="0">Wróć</button><button class="btn pri" data-a="1" ${p.ok ? '' : 'disabled'}>${isNew ? 'Dodaj' : 'Zastosuj'}</button></div>`, 'secpop');
    $$('[data-f]', m).forEach(f => f.addEventListener('change', () => {
      const o = Q.readFields(m);
      Object.keys(o).forEach(k => {
        if (k.startsWith('p_')) s.prof[k.slice(2)] = o[k];
        else if (['typ', 'seria', 'nr', 'wyk', 'uklad'].includes(k) && s.mat === 'S') { if (k === 'typ' && s.prof.typ !== o.typ) s.prof = { typ: o.typ, seria: ((SEC.steelSeries()[o.typ] || {}).serie || [])[0], nr: '' }; else s.prof[k] = k === 'nr' && /^\d+$/.test(o[k]) ? +o[k] : o[k]; }
        else s[k] = o[k];
      });
      draw();
    }));
    m.onclick = e => { const b = e.target.closest('[data-a]'); if (!b) return;
      if (b.dataset.a === '0') { if (back) back(); else Q.closeModal(); return; }
      if (isNew) { s.id = 's' + (P.seq.sec++); P.sections.push(s); UI._cur = s.id; }
      else { const i = P.sections.findIndex(q => q.id === s0.id); P.sections[i] = s; }
      RA.change(); if (back) back(); else Q.closeModal(); };
  };
  draw();
};

/* ------------------------------------------------------------ generator */
// domyślne przekroje grup prętów w generatorze (wg materiału układu)
const GEN_DEF = {
  C: { col: { shape: 'rect', b: 400, h: 400 }, beam: { shape: 'rect', b: 300, h: 600 }, top: { shape: 'rect', b: 250, h: 300 }, bot: { shape: 'rect', b: 250, h: 300 }, diag: { shape: 'rect', b: 250, h: 250 }, vert: { shape: 'rect', b: 250, h: 250 }, arch: { shape: 'rect', b: 400, h: 500 }, tie: { shape: 'rect', b: 250, h: 250 } },
  S: { col: { prof: { typ: 'walc', seria: 'HEB', nr: 240 } }, beam: { prof: { typ: 'walc', seria: 'IPE', nr: 400 } }, top: { prof: { typ: 'rura', seria: 'SHS', nr: '120x6' } }, bot: { prof: { typ: 'rura', seria: 'SHS', nr: '100x5' } }, diag: { prof: { typ: 'rura', seria: 'SHS', nr: '70x4' } }, vert: { prof: { typ: 'rura', seria: 'SHS', nr: '70x4' } }, arch: { prof: { typ: 'walc', seria: 'HEB', nr: 300 } }, tie: { prof: { typ: 'rura', seria: 'SHS', nr: '60x4' } } },
  D: { col: { cls: 'GL24h', shape: 'rect', b: 200, h: 200 }, beam: { cls: 'GL24h', shape: 'rect', b: 160, h: 480 }, top: { cls: 'C24', shape: 'rect', b: 50, h: 175 }, bot: { cls: 'C24', shape: 'rect', b: 50, h: 150 }, diag: { cls: 'C24', shape: 'rect', b: 50, h: 100 }, vert: { cls: 'C24', shape: 'rect', b: 50, h: 100 }, arch: { cls: 'GL24h', shape: 'rect', b: 160, h: 400 }, tie: { cls: 'C24', shape: 'rect', b: 75, h: 150 } },
};
const GEN_NAME = { col: 'Słupy', beam: 'Rygle', top: 'Pas górny', bot: 'Pas dolny', diag: 'Krzyżulce', vert: 'Słupki', arch: 'Łuk', tie: 'Ściąg' };
UI.generator = function (first) {
  const P = RA.P, types = GEN.TYPES;
  let type = UI._genType || 'portal'; const par = {};
  const cur = M.sec(P, UI.curSec());
  let mat = UI._genMat || (cur ? cur.mat : 'C');
  const secFor = {};
  const defSec = g => SEC.make(mat, Q.clone((GEN_DEF[mat] || GEN_DEF.C)[g] || (GEN_DEF[mat] || GEN_DEF.C).beam));
  const draw = () => {
    const T = types[type]; T.fields.forEach(f => { if (par[f[0]] === undefined) par[f[0]] = f[2]; });
    const fields = T.fields.map(f => f[3] ? Q.rowSel(f[1], f[0], par[f[0]], f[3], { wide: true }) : `<div class="row wide"><label>${esc(f[1])}</label><input class="txt" data-f="${f[0]}" value="${esc(par[f[0]])}"></div>`).join('');
    const ofMat = P.sections.filter(s => s.mat === mat);
    const grpRows = T.groups.map(g => {
      if (!secFor[g] || (secFor[g] !== '__auto' && !ofMat.some(s => s.id === secFor[g]))) secFor[g] = '__auto';
      return `<div class="row wide"><label>Przekrój: ${esc(GEN.GROUPS[g])}</label><select data-g="${g}"><option value="__auto" ${secFor[g] === '__auto' ? 'selected' : ''}>nowy: ${esc(SEC.fullLabel(defSec(g)))}</option>${ofMat.map(s => `<option value="${esc(s.id)}" ${s.id === secFor[g] ? 'selected' : ''}>${esc((s.name ? s.name + ' · ' : '') + SEC.fullLabel(s))}</option>`).join('')}<option value="__new">+ inny nowy przekrój…</option></select></div>`;
    }).join('');
    let prev = '';
    try { const B = GEN.build(type, par); prev = genPreview(B); } catch (e) { prev = `<p class="hint">${esc(e.message)}</p>`; }
    const m = Q.modal(`<h3>Generator układów</h3>
      <div class="gentypes">${Object.keys(types).map(k => `<button class="gt ${k === type ? 'on' : ''}" data-t="${k}">${genIcon(k)}<span>${esc(types[k].n)}</span></button>`).join('')}</div>
      <div class="genmat"><span>Materiał układu:</span><div class="segsw">${[['C', 'Żelbet'], ['S', 'Stal'], ['D', 'Drewno']].map(([k, l]) => `<button data-m="${k}" class="${mat === k ? 'on' : ''}">${l}</button>`).join('')}</div><span class="hint">moduł wymiarowania dobierany automatycznie wg materiału przekroju</span></div>
      <div class="gencols"><div><div class="fields0">${fields}${grpRows}</div>
        <div class="fields0">${Q.rowSel('Dołącz do modelu', 'mode', P.bars.length && !first ? 'add' : 'replace', [['replace', 'zastąp model'], ['add', 'dodaj do modelu']], { wide: true })}${Q.rowNum('przesunięcie Δx', 'dx', 0, 'm')}${Q.rowNum('przesunięcie Δz', 'dz', 0, 'm')}</div></div>
        <div class="genprev">${prev}</div></div>
      <p class="hint">Generator tworzy geometrię, podpory i przekroje – bez obciążeń. Obciążenia zadajesz w przypadkach (narzędzie „Obciążenie” albo prawy klik na pręcie).</p>
      <div class="dbtn"><button class="btn" data-a="0">${first ? 'Rysuj ręcznie' : 'Anuluj'}</button><button class="btn pri" data-a="1">Generuj</button></div>`, 'genwin');
    $$('[data-t]', m).forEach(b => b.onclick = () => { type = b.dataset.t; UI._genType = type; Object.keys(par).forEach(k => delete par[k]); draw(); });
    $$('[data-m]', m).forEach(b => b.onclick = () => { Object.assign(par, readPar(m)); mat = b.dataset.m; UI._genMat = mat; Object.keys(secFor).forEach(k => delete secFor[k]); draw(); });
    $$('[data-f]', m).forEach(f => f.addEventListener('change', () => { Object.assign(par, readPar(m)); draw(); }));
    $$('[data-g]', m).forEach(sl => sl.onchange = () => { if (sl.value === '__new') { const g = sl.dataset.g; Object.assign(par, readPar(m)); UI.secEdit(defSec(g), true, () => { secFor[g] = P.sections[P.sections.length - 1].id; draw(); }); return; } secFor[sl.dataset.g] = sl.value; });
    m.onclick = e => { const b = e.target.closest('[data-a]'); if (!b) return; if (b.dataset.a === '0') { Q.closeModal(); return; }
      const o = Q.readFields(m), map = {}, made = {};
      T.groups.concat(['_']).forEach(g => {
        const gg = g === '_' ? T.groups[0] : g;
        if (secFor[gg] && secFor[gg] !== '__auto') { map[g] = secFor[gg]; return; }
        const s = defSec(gg), key = D.secKey(s);
        let ex = P.sections.find(q => q.mat === mat && D.secKey(Object.assign({}, s, { kEI: q.kEI })) === D.secKey(q));
        if (!ex && made[key]) ex = made[key];
        if (!ex) { ex = Object.assign(s, { id: 's' + (P.seq.sec++), name: GEN_NAME[gg] || '' }); P.sections.push(ex); made[key] = ex; }
        map[g] = ex.id;
      });
      GEN.apply(P, type, par, map, { replace: o.mode === 'replace', dx: o.dx, dz: o.dz });
      UI._cur = map[T.groups[0]];
      Q.closeModal(); RA.change(); setTimeout(RA.cv.fit, 30); Q.toast(`Wygenerowano: ${types[type].n} (${SEC.MAT_KIND[mat].toLowerCase()}). Teraz zadaj obciążenia.`); };
  };
  const readPar = (m) => { const o = Q.readFields(m), out = {}; Object.keys(o).forEach(k => { if (!['mode', 'dx', 'dz'].includes(k)) out[k] = typeof o[k] === 'number' ? String(o[k]).replace('.', ',') : o[k]; }); return out; };
  draw();
};
function genPreview(B) {
  if (!B.nodes.length) return '';
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; B.nodes.forEach(n => { x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x); z0 = Math.min(z0, n.z); z1 = Math.max(z1, n.z); });
  const Wd = 340, Hd = 230, k = Math.min((Wd - 40) / Math.max(1e-6, x1 - x0), (Hd - 50) / Math.max(1e-6, z1 - z0), 60);
  const X = x => 20 + (x - x0) * k + (Wd - 40 - (x1 - x0) * k) / 2, Y = z => Hd - 30 - (z - z0) * k - (Hd - 50 - (z1 - z0) * k) / 2;
  let s = '';
  B.bars.forEach(b => { const a = B.nodes[b.a], c = B.nodes[b.b]; s += `<line x1="${X(a.x)}" y1="${Y(a.z)}" x2="${X(c.x)}" y2="${Y(c.z)}" stroke="${b.truss ? '#5b7fb5' : '#2f4f7f'}" stroke-width="${b.truss ? 1.5 : 2.5}"/>`; });
  B.sups.forEach(q => { const n = B.nodes[q.k]; s += `<path d="M${X(n.x)} ${Y(n.z)}l-6 10h12z" fill="${q.type === 'fix' ? '#2f4f7f' : 'none'}" stroke="#2f4f7f"/>`; });
  const L = x1 - x0, Hh = z1 - z0;
  s += `<text x="${Wd / 2}" y="${Hd - 6}" text-anchor="middle" class="gdim">L = ${fmt(L, 2)} m · H = ${fmt(Hh, 2)} m · węzły ${B.nodes.length}, pręty ${B.bars.length}</text>`;
  return `<svg width="${Wd}" height="${Hd}" viewBox="0 0 ${Wd} ${Hd}">${s}</svg>`;
}
function genIcon(k) {
  const I = { beam: 'M3 14h18M5 14l-2 4h4zM19 14l-2 4h4z', cant: 'M4 6v12M4 12h16', col: 'M12 3v16M8 19h8', portal: 'M5 20V6h14v14', gable: 'M4 20V9l8-5 8 5v11', truss: 'M3 16h18M3 8h18M3 16l4-8 4 8 4-8 4 8 2-8', arch: 'M3 18c3-12 15-12 18 0', roof: 'M2 17h20L12 6zM8 17l1.5-6.5M16 17l-1.5-6.5M8 17l4-11M16 17l-4-11' };
  return `<svg viewBox="0 0 24 24" width="30" height="30"><path d="${I[GEN.TYPES[k].icon] || I[k] || ''}" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>`;
}

/* ------------------------------------------------------------ tabele węzłów i prętów (edycja) */
UI.tables = function () {
  const P = RA.P;
  const draw = () => {
    const m = Q.modal(`<h3>Tabele modelu</h3><div class="tcols">
      <div><h4 class="dh">Węzły</h4><table class="ctab etab"><thead><tr><th>nr</th><th>x [m]</th><th>z [m]</th><th>podpora</th></tr></thead><tbody>${P.nodes.map(n => { const s = P.supports.find(q => q.node === n.id); return `<tr><td>${n.id}</td><td><input data-n="${n.id}" data-k="x" value="${Q.show(n.x)}"></td><td><input data-n="${n.id}" data-k="z" value="${Q.show(n.z)}"></td><td>${s ? esc(M.SUP_TYPES[M.supKind(s)] ? M.SUP_TYPES[M.supKind(s)].n : 'inna') : ''}</td></tr>`; }).join('')}</tbody></table>
        <div class="ibtn"><button class="btn sm" data-a="nadd">+ węzeł</button></div></div>
      <div><h4 class="dh">Pręty</h4><table class="ctab etab"><thead><tr><th>nr</th><th>węzeł 1</th><th>węzeł 2</th><th>przekrój</th><th>typ</th><th>L [m]</th></tr></thead><tbody>${P.bars.map(b => { const g = M.barGeom(P, b); return `<tr><td>${b.id}</td><td><input data-b="${b.id}" data-k="n1" value="${b.n1}"></td><td><input data-b="${b.id}" data-k="n2" value="${b.n2}"></td><td><select data-b="${b.id}" data-k="sec">${secOpts(b.sec)}</select></td><td><select data-b="${b.id}" data-k="type"><option value="frame" ${b.type === 'frame' ? 'selected' : ''}>ramowy</option><option value="truss" ${b.type === 'truss' ? 'selected' : ''}>kratowy</option></select></td><td class="val">${g ? f2(g.L) : '—'}</td></tr>`; }).join('')}</tbody></table>
        <div class="ibtn"><button class="btn sm" data-a="badd">+ pręt</button></div></div></div>
      <div class="dbtn"><button class="btn pri" data-a="0">Zamknij</button></div>`, 'ctab');
    $$('input[data-n]', m).forEach(i => i.onchange = () => { const v = Q.num(i.value); if (v === null) return; M.node(P, +i.dataset.n)[i.dataset.k] = v; RA.change(); });
    $$('[data-b]', m).forEach(i => i.onchange = () => { const b = M.bar(P, +i.dataset.b), k = i.dataset.k; if (k === 'n1' || k === 'n2') { const v = Math.round(Q.num(i.value)); if (!M.node(P, v) || v === b[k === 'n1' ? 'n2' : 'n1']) { Q.toast('Nieprawidłowy numer węzła.'); i.value = b[k]; return; } b[k] = v; } else { b[k] = i.value; if (k === 'type' && i.value === 'truss') b.rel = [null, null]; } RA.change(); draw(); });
    m.onclick = e => { const b = e.target.closest('[data-a]'); if (!b) return; if (b.dataset.a === '0') { Q.closeModal(); return; }
      if (b.dataset.a === 'nadd') { const bb = M.bounds(P); M.addNode(P, P.nodes.length ? bb.x1 + 1 : 0, 0); RA.change(); draw(); }
      if (b.dataset.a === 'badd') { if (P.nodes.length < 2) { Q.toast('Potrzebne są co najmniej dwa węzły.'); return; } const ns = P.nodes.slice(-2); if (!M.addBar(P, ns[0].id, ns[1].id, UI.curSec())) Q.toast('Pręt już istnieje.'); RA.change(); draw(); } };
  };
  draw();
};

/* ------------------------------------------------------------ przekrój prętów z menu kontekstowego */
UI.sectionMenu = function (ids, x, y) {
  const P = RA.P, bars = ids.map(id => M.bar(P, id)).filter(Boolean);
  const cur = new Set(bars.map(b => b.sec)), one = cur.size === 1 ? [...cur][0] : null;
  const assign = sid => { bars.forEach(b => { b.sec = sid; }); UI._cur = sid; RA.change(); Q.toast(`Przekrój ${SEC.fullLabel(M.sec(P, sid))} → pręty ${ids.join(', ')}`); };
  const items = [{ label: `<b>Przekrój – pręty ${esc(ids.join(', '))}</b>`, dis: true }];
  ['C', 'S', 'D'].forEach(mt => {
    const ls = P.sections.filter(s => s.mat === mt); if (!ls.length) return;
    items.push({ label: `<small>${esc(SEC.MAT_KIND[mt])}</small>`, dis: true });
    ls.forEach(s => items.push({ label: `${s.id === one ? '● ' : '&nbsp;&nbsp; '}${esc((s.name ? s.name + ' · ' : '') + SEC.fullLabel(s))}`, fn: () => assign(s.id) }));
  });
  items.push({ sep: true });
  [['C', 'żelbetowy'], ['S', 'stalowy'], ['D', 'drewniany']].forEach(([mt, n]) => items.push({ label: `+ nowy przekrój ${n}…`, fn: () => UI.secEdit(SEC.make(mt), true, () => { assign(P.sections[P.sections.length - 1].id); Q.closeModal(); }) }));
  items.push({ label: 'Przekroje i materiały…', fn: () => UI.sections() });
  Q.menu(x, y, items);
};

/* ------------------------------------------------------------ wymiarowanie z rysunku */
UI.designFromBar = function (bid) {
  const P = RA.P; const ex = D.elementOf(P, bid);
  if (ex) { const s = M.sec(P, (M.bar(P, bid) || {}).sec); if (s && D.modOfMat(s.mat) !== ex.mod) { RA.syncDesign(); } RA.mod.open(ex.id); return; }
  const prop = D.detect(P).find(q => q.bars.includes(bid));
  if (!prop) { Q.toast('Ten pręt nie może być wymiarowany jako belka lub słup (pręt kratowy, brak przekroju?).'); return; }
  const el = D.create(P, prop); RA.change({ now: true });
  setTimeout(() => RA.mod.open(el.id), 40);
};
UI.designBars = function (ids) {
  const P = RA.P, props = D.detect(P).filter(q => q.bars.some(id => ids.includes(id)));
  if (!props.length) { Q.toast('Zaznaczone pręty należą już do elementów lub nie nadają się do wymiarowania.'); return; }
  props.forEach(q => D.create(P, q)); RA.change({ now: true }); Q.toast(`Utworzono elementów: ${props.length}.`); RA.selectTab('des');
};
})();
