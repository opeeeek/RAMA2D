/* RAMA2D – zakładki: obciążenia i kombinacje, wyniki, stateczność, wymiarowanie, raport */
(function () {
'use strict';
const RA = window.RA, Q = RA.Q, M = window.RMODEL, SEC = window.RSEC, CMB = window.RCOMB, D = window.RDES;
const { $, $$, esc, fmt } = Q;
const UI = RA.ui;
const f1 = v => fmt(v, 1), f2 = v => fmt(v, 2);

UI.init = function () {
  UI.mbar(); UI.inspector();
};
UI.refreshPane = function () {
  const t = RA.tab;
  if (t === 'loads') UI.paneLoads();
  else if (t === 'res') UI.paneRes();
  else if (t === 'stab') UI.paneStab();
  else if (t === 'des') UI.paneDes();
  else if (t === 'report') UI.paneReport();
  else if (['ZB', 'ST', 'DR'].includes(t) && RA.mod) RA.mod.refreshBar(t);
};
UI.refreshDesign = function () { if (RA.tab === 'des') UI.paneDes(); if (['ZB', 'ST', 'DR'].includes(RA.tab) && RA.mod) RA.mod.refreshBar(RA.tab); if (RA.tab === 'model') UI.inspector(); };

/* ------------------------------------------------------------ obciążenia i kombinacje */
UI.paneLoads = function () {
  const P = RA.P, R = RA.R, s = P.settings, el = $('#p-loads');
  const caseRows = P.cases.map(c => { const n = P.loads.filter(l => l.case === c.id).length, psi = CMB.psi(c); return `<tr><td><i class="cdot" style="background:${CMB.CATS[c.cat].color}"></i><b>${esc(c.id)}</b></td><td>${esc(c.name || '')}</td><td>${esc(CMB.CATS[c.cat].n)}${c.cat === 'Q' ? ' – kat. ' + esc(CMB.QCAT[c.qcat] || c.qcat) : ''}${c.cat === 'S' && c.alt === 'high' ? ' (H > 1000 m)' : ''}</td><td>${c.cat === 'G' || c.cat === 'A' ? '—' : psi.map(v => fmt(v, 1)).join(' / ')}</td><td>${esc(c.grp || '')}</td><td>${c.sw ? '✔' : ''}</td><td class="val">${n}</td><td><button class="lnk" data-ce="${esc(c.id)}">zmień</button></td></tr>`; }).join('');
  const loadRows = P.cases.map(c => { const ls = P.loads.filter(l => l.case === c.id); if (!ls.length) return ''; return `<tr class="g"><td colspan="4">${esc(c.id)} – ${esc(c.name || CMB.CATS[c.cat].n)}</td></tr>` + ls.map(l => `<tr><td>${l.bar !== undefined ? 'pręt ' + l.bar : 'węzeł ' + l.node}</td><td>${esc({ dist: 'rozłożone', point: 'siła skupiona', moment: 'moment', temp: 'temperatura', node: 'węzłowe', settle: 'osiadanie' }[l.kind])}</td><td>${esc(UI.loadText(l))}</td><td><button class="lnk" data-le="${l.id}">zmień</button> <button class="lnk dng" data-ld="${l.id}">✕</button></td></tr>`).join(''); }).join('');
  const combos = R && R.ok ? R.combos : [];
  el.innerHTML = `<div class="pcols"><div>
    <div class="box"><h4>Przypadki obciążeń</h4><table class="ctab"><thead><tr><th>Ozn.</th><th>Nazwa</th><th>Rodzaj</th><th>ψ₀ / ψ₁ / ψ₂</th><th>Grupa</th><th>Ciężar wł.</th><th>Obc.</th><th></th></tr></thead><tbody>${caseRows}</tbody></table>
      <div class="ibtn"><button class="btn pri sm" data-a="cadd">+ przypadek</button><button class="btn sm" data-a="wind">+ wiatr z lewej i z prawej (grupa W)</button></div>
      <p class="hint">Grupa wykluczająca – przypadki z tą samą grupą nie działają jednocześnie (kierunki wiatru, warianty śniegu, układy obciążenia). Ciężar własny prętów liczony jest z przekrojów (żelbet 25 kN/m³, stal wg kształtownika, drewno ρ<sub>mean</sub>).</p></div>
    <div class="box"><h4>Obciążenia</h4>${loadRows ? `<table class="ctab"><thead><tr><th>Miejsce</th><th>Rodzaj</th><th>Wartość</th><th></th></tr></thead><tbody>${loadRows}</tbody></table>` : '<p class="hint">Brak obciążeń. Zadaj je na rysunku: narzędzie „Obciążenie” (L) albo prawy klik na pręcie / węźle.</p>'}</div>
  </div><div>
    <div class="box"><h4>Kombinacje (PN-EN 1990)</h4><div class="fields0">
      ${Q.rowSel('Kombinacje SGN', 'comb', s.comb, [['610ab', 'wzory 6.10a i 6.10b (ZK – zalecane)'], ['610', 'wzór 6.10']], { wide: true })}
      ${Q.rowNum('γ<sub>G,sup</sub>', 'gG', s.gG, '')}${Q.rowNum('γ<sub>G,inf</sub>', 'gGinf', s.gGinf, '')}${Q.rowNum('γ<sub>Q</sub>', 'gQ', s.gQ, '')}${Q.rowNum('ξ (6.10b)', 'xi', s.xi, '')}
      ${Q.rowSel('Wyjątkowa 6.11b – wiodące zmienne', 'accPsi', s.accPsi, [['psi1', 'ψ₁ (wartość częsta)'], ['psi2', 'ψ₂ (prawie stała)']], { wide: true })}</div>
      <h4 class="dh">Analiza</h4><div class="fields0">
      ${Q.rowSel('Analiza SGN', 'order', String(s.order), [['1', 'I rzędu (liniowa)'], ['2', 'II rzędu P-Δ (kombinacje decydujące)']], { wide: true })}
      ${Q.rowSel('Odkształcenia postaciowe', 'shear', s.shear, [['auto', 'pręty drewniane (jak BelkaDR)'], ['all', 'wszystkie pręty (Timoshenko)'], ['none', 'pomijane (Euler–Bernoulli)']], { wide: true })}
      ${Q.rowNum('Podział prętów na elementy', 'nsub', s.nsub, '')}
      ${Q.chk('analiza wyboczeniowa (α<sub>cr</sub>, długości wyboczeniowe)', 'buck', s.buck)}</div>
      <p class="hint">Obwiednie liczone są dokładnie dla każdej wielkości (oddziaływania zmienne tylko niekorzystnie, grupy wykluczające, dach kat. H bez śniegu i wiatru). Moduły wymiarowania tworzą kombinacje z przypadków samodzielnie – z tymi samymi współczynnikami.</p></div>
    <div class="box"><h4>Lista kombinacji (${combos.length})</h4><div class="clist">${combos.map(c => `<div class="crow"><span class="ctag ${c.typ}">${c.id}</span> ${esc(c.name)}</div>`).join('') || '<p class="hint">Brak (model niepoliczony).</p>'}</div>
      <div class="ibtn"><button class="btn sm" data-a="uadd">+ kombinacja własna</button></div>
      ${(P.combUser || []).map((u, i) => `<div class="crow"><span class="ctag U">U${i + 1}</span> ${esc(u.name || '')} <button class="lnk" data-ue="${i}">zmień</button> <button class="lnk dng" data-ux="${i}">✕</button></div>`).join('')}</div>
  </div></div>`;
  $$('[data-f]', el).forEach(f => f.onchange = () => { const o = Q.readFields(el); ['gG', 'gGinf', 'gQ', 'xi'].forEach(k => { if (o[k] > 0) s[k] = o[k]; }); s.comb = o.comb; s.accPsi = o.accPsi; s.order = +o.order; s.shear = o.shear; s.buck = !!o.buck; if (o.nsub >= 2) s.nsub = Math.min(24, Math.round(o.nsub)); RA.change(); });
  $$('[data-ce]', el).forEach(b => b.onclick = () => UI.caseDialog(P.cases.find(c => c.id === b.dataset.ce)));
  $$('[data-le]', el).forEach(b => b.onclick = () => UI.loadDialog(P.loads.find(l => l.id === +b.dataset.le)));
  $$('[data-ld]', el).forEach(b => b.onclick = () => { P.loads = P.loads.filter(l => l.id !== +b.dataset.ld); RA.change(); });
  $$('[data-ue]', el).forEach(b => b.onclick = () => UI.userCombo(+b.dataset.ue));
  $$('[data-ux]', el).forEach(b => b.onclick = () => { P.combUser.splice(+b.dataset.ux, 1); RA.change(); });
  el.onclick = e => { const b = e.target.closest('[data-a]'); if (!b) return;
    if (b.dataset.a === 'cadd') UI.caseDialog();
    if (b.dataset.a === 'uadd') UI.userCombo(-1);
    if (b.dataset.a === 'wind') { ['z lewej', 'z prawej'].forEach(t => { const id = M.nextCaseId(P, 'W'); P.cases.push({ id, name: 'Wiatr ' + t, cat: 'W', qcat: 'B', alt: 'low', grp: 'W', sw: false, p0: 0.6, p1: 0.2, p2: 0, dur: '' }); }); RA.change(); Q.toast('Dodano przypadki wiatru (grupa W). Zadaj obciążenia w każdym z nich.'); } };
};
UI.userCombo = function (i) {
  const P = RA.P, u = i >= 0 ? Q.clone(P.combUser[i]) : { name: '', typ: 'ULS', f: {} };
  const m = Q.modal(`<h3>Kombinacja własna</h3><div class="fields0">${Q.rowTxt('Nazwa', 'name', u.name, 'np. montaż')}${Q.rowSel('Typ', 'typ', u.typ, Object.keys(CMB.TYP_N).map(k => [k, CMB.TYP_N[k]]), { wide: true })}
    ${P.cases.map(c => Q.rowNum(`${esc(c.id)} – ${esc(c.name || '')}`, 'c_' + c.id, u.f[c.id] || '', '×', { ph: '0' })).join('')}</div>
    <div class="dbtn"><button class="btn" data-a="0">Anuluj</button><button class="btn pri" data-a="1">Zapisz</button></div>`, 'sm');
  m.onclick = e => { const b = e.target.closest('[data-a]'); if (!b) return; if (b.dataset.a === '0') { Q.closeModal(); return; }
    const o = Q.readFields(m); u.name = o.name; u.typ = o.typ; u.f = {}; P.cases.forEach(c => { const v = o['c_' + c.id]; if (+v) u.f[c.id] = +v; });
    if (i >= 0) P.combUser[i] = u; else P.combUser.push(u); Q.closeModal(); RA.change(); };
};

/* ------------------------------------------------------------ wyniki – tabele */
UI.resSrc = 'ENV:ULS';
UI.paneRes = function () {
  const P = RA.P, R = RA.R, el = $('#p-res');
  if (!R || !R.ok) { el.innerHTML = `<div class="msgs">${((R && R.errors) || ['Brak wyników – zbuduj model.']).map(e => `<div class="msg err">${esc(e)}</div>`).join('')}</div>`; return; }
  const opts = [];
  Object.keys(R.env).forEach(t => opts.push([`ENV:${t}`, `Obwiednia – ${CMB.TYP_N[t]}`]));
  P.cases.forEach(c => opts.push([`case:${c.id}`, `Przypadek ${c.id} – ${c.name || CMB.CATS[c.cat].n}`]));
  R.combos.forEach(c => opts.push([`combo:${c.id}`, `${c.id}: ${c.name}`]));
  if (!opts.some(o => o[0] === UI.resSrc)) UI.resSrc = 'ENV:ULS';
  const res = RA.resOf(UI.resSrc), env = !!res.env;
  // reakcje
  const reacRows = R.ctx.nodes.map((n, i) => { const sp = P.supports.find(s => s.node === n.id); if (!sp) return ''; const r = env ? res.env.reac[i] : res.reac[i]; if (!r) return ''; return `<tr><td>${n.id}</td>${[0, 1, 2].map(k => env ? `<td class="val">${f1(k === 2 ? -r[k].max : r[k].min)}</td><td class="val">${f1(k === 2 ? -r[k].min : r[k].max)}</td>` : `<td class="val" colspan="2">${f1(k === 2 ? -r[k] : r[k])}</td>`).join('')}</tr>`; }).join('');
  // przemieszczenia węzłów
  const dispRows = (res.disp || (res.env && res.env.disp && res.env.disp.length && !env ? null : null)) ? R.ctx.nodes.map((n, i) => { const d = res.disp[i]; return `<tr><td>${n.id}</td><td class="val">${f2(d[0] * 1000)}</td><td class="val">${f2(d[1] * 1000)}</td><td class="val">${fmt(-d[2] * 1000, 3)}</td></tr>`; }).join('') :
    (env && res.env.disp.length ? R.ctx.nodes.map((n, i) => { const d = res.env.disp[i]; return `<tr><td>${n.id}</td><td class="val">${f2(d[0].min * 1000)} … ${f2(d[0].max * 1000)}</td><td class="val">${f2(d[1].min * 1000)} … ${f2(d[1].max * 1000)}</td><td class="val">${fmt(-d[2].max * 1000, 3)} … ${fmt(-d[2].min * 1000, 3)}</td></tr>`; }).join('') : '');
  // pręty – wartości ekstremalne i na końcach
  const barRows = R.ctx.bars.map((b, ei) => {
    const g = R.ctx.geo[ei], s = M.sec(P, b.sec);
    if (env) { const e = res.env.bars[ei], mx = k => Math.max(...e[k + 'max']), mn = k => Math.min(...e[k + 'min']); return `<tr><td>${b.id}</td><td>${esc(SEC.label(s))}</td><td class="val">${f2(g.L)}</td><td class="val">${f1(mn('N'))}</td><td class="val">${f1(mx('N'))}</td><td class="val">${f1(mn('V'))}</td><td class="val">${f1(mx('V'))}</td><td class="val">${f1(mn('M'))}</td><td class="val">${f1(mx('M'))}</td></tr>`; }
    const st = res.bars[ei], a = st[0], z = st[st.length - 1], mM = st.reduce((p, q) => Math.abs(q.M) > Math.abs(p.M) ? q : p);
    return `<tr><td>${b.id}</td><td>${esc(SEC.label(s))}</td><td class="val">${f2(g.L)}</td><td class="val">${f1(a.N)}</td><td class="val">${f1(z.N)}</td><td class="val">${f1(a.V)}</td><td class="val">${f1(z.V)}</td><td class="val">${f1(a.M)} / ${f1(z.M)}</td><td class="val">${f1(mM.M)} @ ${f2(mM.x)}</td></tr>`;
  }).join('');
  el.innerHTML = `<div class="rbar"><label>Wyniki:</label><select id="resSel">${opts.map(([k, l]) => `<option value="${esc(k)}" ${k === UI.resSrc ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select><button class="btn sm" id="csvBtn">Eksport CSV</button>
    <span class="hint">${R.p2 ? 'SGN: analiza II rzędu (P-Δ) dla kombinacji decydujących. ' : ''}Konwencja: N &gt; 0 rozciąganie; M &gt; 0 – rozciągane włókna od strony spodu (linia przerywana); reakcje R<sub>x</sub> → +, R<sub>z</sub> ↑ +, M ↻ +.</span></div>
    <div class="pcols"><div><div class="box"><h4>Reakcje podporowe [kN, kNm]</h4><table class="ctab"><thead><tr><th>węzeł</th>${['R<sub>x</sub>', 'R<sub>z</sub>', 'M'].map(t => env ? `<th>${t} min</th><th>${t} max</th>` : `<th colspan="2">${t}</th>`).join('')}</tr></thead><tbody>${reacRows}</tbody></table>
      ${!env ? (() => { let sx = 0, sz = 0; Object.values(res.reac).forEach(r => { sx += r[0]; sz += r[1]; }); return `<p class="hint">Σ R<sub>x</sub> = ${f2(sx)} kN, Σ R<sub>z</sub> = ${f2(sz)} kN</p>`; })() : ''}</div>
      ${dispRows ? `<div class="box"><h4>Przemieszczenia węzłów</h4><table class="ctab"><thead><tr><th>węzeł</th><th>u<sub>x</sub> [mm]</th><th>u<sub>z</sub> [mm] (↑ +)</th><th>φ [mrad] (↻ +)</th></tr></thead><tbody>${dispRows}</tbody></table></div>` : ''}</div>
      <div><div class="box"><h4>Siły w prętach</h4><table class="ctab"><thead><tr><th>pręt</th><th>przekrój</th><th>L [m]</th>${env ? '<th>N<sub>min</sub></th><th>N<sub>max</sub></th><th>V<sub>min</sub></th><th>V<sub>max</sub></th><th>M<sub>min</sub></th><th>M<sub>max</sub></th>' : '<th>N początek</th><th>N koniec</th><th>V początek</th><th>V koniec</th><th>M pocz. / kon.</th><th>|M|<sub>max</sub> @ x</th>'}</tr></thead><tbody>${barRows}</tbody></table></div></div></div>`;
  $('#resSel').onchange = e => { UI.resSrc = e.target.value; UI.paneRes(); };
  $('#csvBtn').onclick = () => UI.csv(res);
};
UI.csv = function (res) {
  const R = RA.R, P = RA.P, L = ['pret;x [m];' + (res.env ? 'Nmin;Nmax;Vmin;Vmax;Mmin;Mmax' : 'N [kN];V [kN];M [kNm];w [mm]')];
  R.ctx.bars.forEach((b, ei) => {
    if (res.env) { const e = res.env.bars[ei]; e.x.forEach((x, i) => L.push([b.id, x, e.Nmin[i], e.Nmax[i], e.Vmin[i], e.Vmax[i], e.Mmin[i], e.Mmax[i]].map(v => typeof v === 'number' ? String(Math.round(v * 1000) / 1000).replace('.', ',') : v).join(';'))); }
    else res.bars[ei].forEach(s => L.push([b.id, s.x, s.N, s.V, s.M, s.w * 1000].map(v => String(Math.round(v * 1000) / 1000).replace('.', ',')).join(';')));
  });
  Q.download((P.meta.name || 'wyniki') + ' – siły.csv', '﻿' + L.join('\r\n'), 'text/csv');
};

/* ------------------------------------------------------------ stateczność */
UI.paneStab = function () {
  const P = RA.P, R = RA.R, el = $('#p-stab');
  if (!R || !R.ok) { el.innerHTML = '<p class="hint">Brak wyników.</p>'; return; }
  const B = Object.values(R.buck || {}).sort((a, b) => a.alpha - b.alpha);
  const rows = B.map(b => `<tr><td><span class="ctag ULS">${esc(b.combo.id)}</span> ${esc(b.combo.name)}</td><td class="val"><b class="${b.alpha < 3 ? 'bad' : b.alpha < 10 ? 'warnc' : 'good'}">${fmt(b.alpha, 2)}</b></td><td>${b.modes.map((m, k) => `<button class="lnk" data-bm="${esc(b.combo.id)}:${k}">postać ${k + 1} (${fmt(m.alpha, 2)})</button>`).join(' ')}</td></tr>`).join('');
  const best = B[0];
  const lcr = best ? R.ctx.bars.map((b, ei) => { if (!best.Lcr[ei]) return ''; const g = R.ctx.geo[ei], p = R.ctx.props[ei]; return `<tr><td>${b.id}</td><td>${esc(M.ROLE_N[M.roleOf(P, b)])}</td><td>${esc(SEC.label(M.sec(P, b.sec)))}</td><td class="val">${f1(-best.Ncomp[ei])}</td><td class="val">${f2(g.L)}</td><td class="val">${f2(best.Lcr[ei])}</td><td class="val">${f2(best.Lcr[ei] / g.L)}</td><td class="val">${f1(best.Lcr[ei] / Math.sqrt(p.I / p.A))}</td></tr>`; }).join('') : '';
  el.innerHTML = `<div class="pcols"><div><div class="box"><h4>Mnożniki obciążenia krytycznego <span class="nt">α<sub>cr</sub></span></h4>
    ${B.length ? `<table class="ctab"><thead><tr><th>Kombinacja (SGN)</th><th>α<sub>cr</sub></th><th>Postacie</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="hint">Brak kombinacji ze ściskaniem prętów (lub analiza wyboczeniowa wyłączona w zakładce Obciążenia i kombinacje).</p>'}
    <p class="hint">PN-EN 1993-1-1, 5.2.1(3): analiza I rzędu jest dopuszczalna, gdy α<sub>cr</sub> ≥ 10 (sprężysta). Gdy 3 ≤ α<sub>cr</sub> &lt; 10 – efekty II rzędu (np. P-Δ w zakładce Obciążenia i kombinacje lub współczynnik 1/(1−1/α<sub>cr</sub>), 5.2.2(5)). PN-EN 1992-1-1, 5.8.2(6): efekty II rzędu można pominąć, gdy są mniejsze niż 10% efektów I rzędu.</p>
    ${best ? `<div class="ibtn"><button class="btn sm pri" data-bm="${esc(best.combo.id)}:0">Pokaż postać wyboczenia na rysunku</button></div>` : ''}</div></div>
    <div><div class="box"><h4>Długości wyboczeniowe w płaszczyźnie układu${best ? ` <span class="nt">(α<sub>cr</sub> = ${fmt(best.alpha, 2)})</span>` : ''}</h4>
    ${lcr ? `<table class="ctab"><thead><tr><th>pręt</th><th>rola</th><th>przekrój</th><th>N<sub>Ed</sub> [kN]</th><th>L [m]</th><th>L<sub>cr</sub> [m]</th><th>μ = L<sub>cr</sub>/L</th><th>λ</th></tr></thead><tbody>${lcr}</tbody></table>` : '<p class="hint">—</p>'}
    <p class="hint">L<sub>cr</sub> = π·√(EI / (α<sub>cr</sub>·N<sub>Ed</sub>)) – z globalnej postaci wyboczenia (PN-EN 1993-1-1, 5.2.2(8)); dla prętów słabo ściskanych wartości są duże i nie są miarodajne. Długości przekazywane są do modułów słupów (SłupStal – L<sub>cr,y</sub>, SłupDrewniany – l<sub>ef,y</sub>); SłupŻB liczy l<sub>0</sub> ze sztywności węzłów (5.8.3.2, k₁, k₂).</p></div></div></div>`;
  $$('[data-bm]', el).forEach(b => b.onclick = () => { RA.view.mode = 'buck'; RA.view.src = 'buck:' + b.dataset.bm; RA.selectTab('model'); });
};

/* ------------------------------------------------------------ wymiarowanie */
UI.paneDes = function () {
  const P = RA.P, R = RA.R, el = $('#p-des');
  const props = D.detect(P);
  const row = d => { const r = d.res, eta = r && r.eta !== null && r.eta !== undefined ? r.eta : null; const st = d.err ? `<span class="bad">${esc(d.err)}</span>` : !r ? '<span class="hint">obliczanie…</span>' : r.err ? `<span class="bad">${esc(r.err)}</span>` : eta === null ? `<b class="bad">${esc(r.note || 'niespełnione warunki')}</b>${r.fails ? ` · niespełnione: ${r.fails}` : ''} <small class="hint">– uzupełnij dane w module (np. „Dobierz zbrojenie”)</small>` : `<span class="ub"><i style="width:${Math.min(100, (eta || 0) * 100)}%;background:${(eta || 0) > 1 || !r.ok ? 'var(--fail)' : (eta || 0) > 0.9 ? 'var(--warn)' : 'var(--ok)'}"></i></span> <b class="${(eta || 0) > 1 || !r.ok ? 'bad' : 'good'}">${fmt((eta || 0) * 100, 0)}%</b>${r.fails ? ` · niespełnione: ${r.fails}` : ''}${r.errors && r.errors.length ? ` · <span class="bad">${esc(r.errors[0])}</span>` : ''}`;
    const dv = RA.mod && RA.mod.devText(d);
    const s = M.sec(P, (M.bar(P, d.bars[0]) || {}).sec);
    return `<tr><td><b>${esc(d.name)}</b></td><td>${esc(D.MODS[d.mod][d.kind].n)}</td><td>${d.bars.join(', ')}</td><td>${esc(SEC.fullLabel(s))}</td><td>${d.sch && d.sch.spans ? `${d.sch.spans.length} przęsł.${d.sch.cantL ? ' + wsp. L' : ''}${d.sch.cantR ? ' + wsp. P' : ''}` : d.sch && d.sch.L ? `L = ${f2(d.sch.L)} m` : ''}</td><td>${st}${r && r.worst ? `<br><small class="hint">${esc(r.worst)}</small>` : ''}${dv ? `<br><small class="warnc" title="${esc(dv)}">⚠ schemat modułu odbiega od ramy (M<sub>G</sub> różni się o ${fmt(d.res.dev.rel * 100, 0)}%) – najedź, aby zobaczyć szczegóły</small>` : ''}</td><td><button class="btn sm pri" data-open="${d.id}">Otwórz w module</button> <button class="lnk dng" data-dx="${d.id}">usuń</button></td></tr>`; };
  el.innerHTML = `<div class="box"><h4>Elementy wymiarowane (${P.design.length})</h4>
    ${P.design.length ? `<table class="ctab"><thead><tr><th>Element</th><th>Moduł</th><th>Pręty</th><th>Przekrój</th><th>Schemat</th><th>Wytężenie (silnik modułu)</th><th></th></tr></thead><tbody>${P.design.map(row).join('')}</tbody></table>` : '<p class="hint">Brak elementów. Dodaj je z listy poniżej albo prawym klikiem na pręcie („Wymiaruj w module…”).</p>'}
    <p class="hint">Wytężenie liczone jest silnikiem modułu (BelkaŻB, SłupŻB, BelkaStal, SłupStal, BelkaDR, SłupDrewniany) na bieżących danych – także bez otwierania modułu. Zmiana modelu (geometria, obciążenia, przekroje) przelicza elementy automatycznie; zmiana przekroju lub materiału w module wraca do modelu.</p></div>
    <div class="box"><h4>Wykryte elementy do wymiarowania (${props.length})</h4>
    ${props.length ? `<table class="ctab"><thead><tr><th>Rodzaj</th><th>Moduł</th><th>Pręty</th><th>Długość</th><th></th></tr></thead><tbody>${props.map((q, i) => `<tr><td>${q.kind === 'beam' ? 'belka (ciąg prętów)' : 'słup'}</td><td>${esc(D.MODS[q.mod][q.kind].n)}</td><td>${q.bars.join(', ')}</td><td class="val">${f2(q.L)} m</td><td><button class="btn sm" data-add="${i}">Dodaj</button></td></tr>`).join('')}</tbody></table>
      <div class="ibtn"><button class="btn pri sm" data-a="all">Dodaj wszystkie</button></div>` : '<p class="hint">Wszystkie belki i słupy są już elementami wymiarowanymi (pręty kratowe wymiaruje się jako elementy ściskane/rozciągane w modułach słupów – zmień rolę pręta na „słup”).</p>'}
    <p class="hint">Belka = ciąg współliniowych prętów z podporami (przęsła, wsporniki); podporami są podpory zewnętrzne i pręty dochodzące od spodu (słupy, ściany). Słup = pręt pionowy między węzłami stropów. Rolę pręta możesz zmienić w jego właściwościach.</p></div>`;
  $$('[data-open]', el).forEach(b => b.onclick = () => RA.mod.open(b.dataset.open));
  $$('[data-dx]', el).forEach(b => b.onclick = () => { P.design = P.design.filter(d => d.id !== b.dataset.dx); RA.change(); });
  $$('[data-add]', el).forEach(b => b.onclick = () => { D.create(P, props[+b.dataset.add]); RA.change({ now: true }); });
  const all = $('[data-a="all"]', el); if (all) all.onclick = () => { props.forEach(q => D.create(P, q)); RA.change({ now: true }); };
};

/* ------------------------------------------------------------ raport */
UI.paneReport = function () { $('#p-report').innerHTML = `<div class="rtools"><button class="btn pri" id="rPrint">Drukuj / PDF</button> <button class="btn" id="rHtml">Zapisz raport HTML</button> <span class="hint">Raporty wymiarowania elementów są dostępne w modułach (zakładka „Raport obliczeń” modułu).</span></div><div id="report">${UI.reportHTML()}</div>`; $('#rPrint').onclick = UI.print; $('#rHtml').onclick = UI.exportReport; };
UI.reportHTML = function () {
  const P = RA.P, R = RA.R, s = P.settings;
  const h = [];
  h.push(`<h1>${esc(P.meta.name || 'Projekt')}</h1><p class="hint">RAMA2D ${RA.VERSION} · ${new Date().toLocaleString('pl-PL')}${P.meta.author ? ' · ' + esc(P.meta.author) : ''}</p>`);
  h.push(`<h2>1. Model</h2><p>Układ płaski: ${P.nodes.length} węzłów, ${P.bars.length} prętów, ${P.supports.length} podpór. Analiza MES (elementy belkowe ${s.shear === 'none' ? 'Eulera–Bernoulliego' : s.shear === 'all' ? 'Timoshenki' : 'Eulera–Bernoulliego, pręty drewniane – Timoshenki'}), podział prętów na ${s.nsub} elementów, analiza ${+s.order === 2 ? 'II rzędu P-Δ dla kombinacji SGN' : 'I rzędu'}.</p>`);
  const fig = (mode, src, title, o) => { try { return `<div class="rfig"><div class="rft">${title}</div>${RA.cv.snapshot(mode, src, o)}</div>`; } catch (e) { return ''; } };
  h.push(fig('model', null, 'Schemat układu – numery węzłów i prętów, podpory', { loads: false }));
  P.cases.forEach(c => { if (P.loads.some(l => l.case === c.id)) h.push(fig('model', null, `Obciążenia – przypadek ${esc(c.id)} ${esc(c.name || '')} (wartości charakterystyczne)`, { case: c.id, labels: false })); });
  RA._repFigs = R && R.ok;
  h.push(`<h3>Węzły i podpory</h3><table class="ctab"><tr><th>węzeł</th><th>x [m]</th><th>z [m]</th><th>podpora</th></tr>${P.nodes.map(n => { const sp = P.supports.find(q => q.node === n.id); return `<tr><td>${n.id}</td><td class="val">${f2(n.x)}</td><td class="val">${f2(n.z)}</td><td>${sp ? esc((M.SUP_TYPES[M.supKind(sp)] || { n: 'zadana' }).n) + (sp.kx || sp.kz || sp.kr ? ` (k = ${[sp.kx, sp.kz, sp.kr].map(v => fmt(v || 0, 0)).join(' / ')})` : '') + (sp.ang ? `, kąt ${f1(sp.ang)}°` : '') : ''}</td></tr>`; }).join('')}</table>`);
  h.push(`<h3>Pręty</h3><table class="ctab"><tr><th>pręt</th><th>węzły</th><th>L [m]</th><th>przekrój</th><th>typ</th><th>połączenia</th></tr>${P.bars.map(b => { const g = M.barGeom(P, b); return `<tr><td>${b.id}</td><td>${b.n1}–${b.n2}</td><td class="val">${g ? f2(g.L) : ''}</td><td>${esc(SEC.fullLabel(M.sec(P, b.sec)))}</td><td>${b.type === 'truss' ? 'kratowy' : 'ramowy'}</td><td>${b.type === 'truss' ? 'przegubowe' : b.rel.map(r => r === null ? 'sztywne' : r === 0 ? 'przegub' : 'k = ' + fmt(r, 0)).join(' / ')}</td></tr>`; }).join('')}</table>`);
  h.push(`<h3>Przekroje</h3><table class="ctab"><tr><th>przekrój</th><th>A [cm²]</th><th>I [cm⁴]</th><th>E [GPa]</th><th>g [kN/m]</th></tr>${P.sections.map(x => { const p = SEC.props(x); return `<tr><td>${esc((x.name ? x.name + ' · ' : '') + SEC.fullLabel(x))}</td><td class="val">${fmt(p.A * 1e4, 2)}</td><td class="val">${fmt(p.I * 1e8, 0)}</td><td class="val">${fmt(p.E / 1e6, 1)}</td><td class="val">${fmt(p.g, 3)}</td></tr>`; }).join('')}</table>`);
  h.push(`<h2>2. Obciążenia</h2><table class="ctab"><tr><th>przypadek</th><th>rodzaj</th><th>ψ₀/ψ₁/ψ₂</th><th>grupa</th><th>obciążenia</th></tr>${P.cases.map(c => `<tr><td>${esc(c.id)} ${esc(c.name || '')}</td><td>${esc(CMB.CATS[c.cat].n)}${c.cat === 'Q' ? ' ' + esc(c.qcat) : ''}</td><td>${c.cat === 'G' || c.cat === 'A' ? '—' : CMB.psi(c).map(v => fmt(v, 1)).join('/')}</td><td>${esc(c.grp || '')}</td><td>${[c.sw ? 'ciężar własny prętów' : ''].concat(P.loads.filter(l => l.case === c.id).map(l => `${l.bar !== undefined ? 'pręt ' + l.bar : 'węzeł ' + l.node}: ${esc(UI.loadText(l))}`)).filter(Boolean).join('<br>')}</td></tr>`).join('')}</table>
    <p>Kombinacje wg PN-EN 1990: ${s.comb === '610ab' ? 'wzory 6.10a i 6.10b' : 'wzór 6.10'}, γ<sub>G,sup</sub> = ${fmt(s.gG, 2)}, γ<sub>G,inf</sub> = ${fmt(s.gGinf, 2)}, γ<sub>Q</sub> = ${fmt(s.gQ, 2)}, ξ = ${fmt(s.xi, 2)}${R && R.ok ? `; liczba kombinacji: ${R.combos.length}` : ''}.</p>`);
  if (R && R.ok) {
    h.push(`<h2>3. Wyniki</h2>`);
    h.push(fig('M', 'ENV:ULS', 'Obwiednia momentów zginających M<sub>Ed</sub> [kNm] – SGN', { labels: false }));
    h.push(fig('V', 'ENV:ULS', 'Obwiednia sił poprzecznych V<sub>Ed</sub> [kN] – SGN', { labels: false }));
    h.push(fig('N', 'ENV:ULS', 'Obwiednia sił podłużnych N<sub>Ed</sub> [kN] – SGN (+ rozciąganie)', { labels: false }));
    if (R.env.CHAR) h.push(fig('w', 'ENV:CHAR', 'Deformacja – obwiednia SGU (kombinacja charakterystyczna), przemieszczenia przeskalowane', { labels: false }));
    h.push(fig('R', 'ENV:ULS', 'Reakcje podporowe – obwiednia SGN [kN, kNm]', { labels: false }));
    h.push(`<h3>Obwiednia SGN – wartości ekstremalne w prętach</h3><table class="ctab"><tr><th>pręt</th><th>N<sub>min</sub></th><th>N<sub>max</sub></th><th>V<sub>min</sub></th><th>V<sub>max</sub></th><th>M<sub>min</sub></th><th>M<sub>max</sub></th></tr>${R.ctx.bars.map((b, ei) => { const e = R.env.ULS.bars[ei], mx = k => Math.max(...e[k + 'max']), mn = k => Math.min(...e[k + 'min']); return `<tr><td>${b.id}</td>${['N', 'V', 'M'].map(k => `<td class="val">${f1(mn(k))}</td><td class="val">${f1(mx(k))}</td>`).join('')}</tr>`; }).join('')}</table>`);
    h.push(`<h3>Reakcje (obwiednia SGN) [kN, kNm]</h3><table class="ctab"><tr><th>węzeł</th><th>R<sub>x</sub></th><th>R<sub>z</sub></th><th>M</th></tr>${R.ctx.nodes.map((n, i) => { if (!P.supports.some(q => q.node === n.id)) return ''; const r = R.env.ULS.reac[i]; return `<tr><td>${n.id}</td><td class="val">${f1(r[0].min)} … ${f1(r[0].max)}</td><td class="val">${f1(r[1].min)} … ${f1(r[1].max)}</td><td class="val">${f1(-r[2].max)} … ${f1(-r[2].min)}</td></tr>`; }).join('')}</table>`);
    const B = Object.values(R.buck || {}).sort((a, b) => a.alpha - b.alpha);
    if (B.length) h.push(`<h3>Stateczność</h3><p>Najmniejszy mnożnik obciążenia krytycznego α<sub>cr</sub> = <b>${fmt(B[0].alpha, 2)}</b> (kombinacja ${esc(B[0].combo.name)}).${B[0].alpha >= 10 ? ' α<sub>cr</sub> ≥ 10 – analiza I rzędu wystarczająca (PN-EN 1993-1-1, 5.2.1(3)).' : ' α<sub>cr</sub> < 10 – należy uwzględnić efekty II rzędu.'}</p>`);
  } else h.push(`<div class="msgs">${((R && R.errors) || []).map(e => `<div class="msg err">${esc(e)}</div>`).join('')}</div>`);
  if (P.design.length) h.push(`<h2>4. Wymiarowanie elementów</h2><table class="ctab"><tr><th>element</th><th>moduł</th><th>pręty</th><th>przekrój</th><th>wytężenie</th><th>stan</th></tr>${P.design.map(d => `<tr><td>${esc(d.name)}</td><td>${esc(D.MODS[d.mod][d.kind].n)}</td><td>${d.bars.join(', ')}</td><td>${esc(SEC.fullLabel(M.sec(P, (M.bar(P, d.bars[0]) || {}).sec)))}</td><td class="val">${d.res && d.res.eta !== null ? fmt(d.res.eta * 100, 0) + '%' : '—'}</td><td>${d.res ? (d.res.ok && d.res.eta <= 1 ? 'spełnione' : 'NIESPEŁNIONE') + (d.res.worst ? ` (${esc(d.res.worst)})` : '') : ''}</td></tr>`).join('')}</table><p class="hint">Pełne obliczenia elementów – raporty modułów.</p>`);
  h.push(`<p class="hint" style="margin-top:20px">Program jest narzędziem pomocniczym. Wyniki wymagają weryfikacji przez osobę z odpowiednimi uprawnieniami budowlanymi.</p>`);
  return h.join('');
};
UI.reportDoc = function () {
  const css = ($('#appcss') || {}).textContent || '';
  return `<!doctype html><html lang="pl" data-theme="light"><head><meta charset="utf-8"><title>${esc(RA.P.meta.name || 'RAMA2D')} – raport</title><style>${css}\nhtml,body{height:auto}body{overflow:auto;padding:20px 16px}#report svg{max-width:100%;height:auto}</style></head><body><div id="report">${UI.reportHTML()}</div></body></html>`;
};
UI.exportReport = async function () {
  const name = (RA.P.meta.name || 'projekt').replace(/[\\/:*?"<>|]+/g, '_') + ' – raport.html';
  if (RA.inHost()) { const r = await RA.hostCall('save', { path: '', name, content: UI.reportDoc(), filter: 'html' }); if (r && r.ok) Q.toast('Zapisano raport.'); return; }
  Q.download(name, UI.reportDoc(), 'text/html');
};
UI.print = function () { RA.selectTab('report'); setTimeout(() => window.print(), 200); };
UI.about = function () {
  const m = Q.modal(`<h3>RAMA2D ${RA.VERSION} – płaskie układy prętowe z wymiarowaniem wg Eurokodów</h3>
    <p><b>Model i statyka</b> – belki, słupy, ramy, kratownice, łuki: rysowanie, generator, przekroje żelbetowe, stalowe i drewniane, przeguby i połączenia podatne, podpory sztywne, sprężyste i ukośne, obciążenia rozłożone (trapezowe, częściowe, na rzut), skupione, momenty, temperatura, osiadania, ciężar własny. MES: analiza I i II rzędu (P-Δ), analiza wyboczeniowa (α<sub>cr</sub>, długości wyboczeniowe), odkształcenia postaciowe.</p>
    <p><b>Kombinacje</b> – PN-EN 1990 z ZK: 6.10 / 6.10a,b, SGU charakterystyczna, częsta, quasi-stała, wyjątkowa; grupy wykluczające się; obwiednie.</p>
    <p><b>Moduły</b> (oryginalne programy połączone w środowisko): <b>Żelbet</b> – BelkaŻB i SłupŻB (PN-EN 1992-1-1), <b>Stal</b> – BelkaStal i SłupStal (PN-EN 1993-1-1), <b>Drewno</b> – BelkaDR i SłupDrewniany (PN-EN 1995-1-1). Schemat elementu z modelu jest przenoszony do modułu (przęsła, podpory z podatnością od prętów dochodzących, obciążenia w przypadkach, siły na końcach słupów, długości wyboczeniowe); zmiana przekroju lub materiału w module wraca do modelu i statyki – automatycznie, w obie strony.</p>
    <p>Skróty: V zaznacz, B pręty, N węzeł, S podpora, L obciążenie, H przegub, D usuń, F dopasuj, Del usuń zaznaczone, Ctrl+Z/Y cofnij/ponów, Ctrl+S zapisz, Ctrl+O otwórz.</p>
    <p style="font-size:12px;color:var(--ink3)">Program jest narzędziem pomocniczym. Wyniki wymagają weryfikacji przez osobę z odpowiednimi uprawnieniami budowlanymi.</p>
    <div class="dbtn"><button class="btn pri" data-a="0">Zamknij</button></div>`);
  m.onclick = e => { if (e.target.closest('[data-a]')) Q.closeModal(); };
};
})();
