/* RAMA2D – ikona programu
   src/icon/icon.svg (duże rozmiary) i src/icon/icon-small.svg (16–32 px) →
     host/icon.png                 – 256 × 256 px,
     host/icon.ico                 – ikona wielorozmiarowa (16…256 px),
     host/rsrc_windows_amd64.syso  – zasoby Windows (RT_ICON, RT_GROUP_ICON nr 1) dołączane przez kompilator Go
                                     do RAMA2D.exe: ikona pliku w Eksploratorze, na pasku zadań i w oknie programu.
   Wymaga Playwright z przeglądarką Chromium (rasteryzacja SVG). Pliki wynikowe są w repozytorium – skrypt
   uruchamia się tylko po zmianie ikony:  node tools/icon.js */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const SIZES = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256];

async function rasterize() {
  const { chromium } = require('playwright');
  const big = fs.readFileSync(path.join(ROOT, 'src/icon/icon.svg'), 'utf8'), small = fs.readFileSync(path.join(ROOT, 'src/icon/icon-small.svg'), 'utf8');
  const b = await chromium.launch(), p = await b.newPage();
  const out = [];
  for (const s of SIZES) {
    const svg = (s <= 32 ? small : big).replace(/width="\d+" height="\d+"/, `width="${s}" height="${s}"`);
    const r = await p.evaluate(async ({ svg, s }) => {
      const img = new Image(); img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg))); await img.decode();
      const c = document.createElement('canvas'); c.width = c.height = s; const g = c.getContext('2d'); g.drawImage(img, 0, 0, s, s);
      const d = g.getImageData(0, 0, s, s).data; let bin = ''; for (let i = 0; i < d.length; i += 8192) bin += String.fromCharCode.apply(null, d.subarray(i, i + 8192));
      return { png: c.toDataURL('image/png').split(',')[1], rgba: btoa(bin) };
    }, { svg, s });
    out.push({ s, png: Buffer.from(r.png, 'base64'), rgba: Buffer.from(r.rgba, 'base64') });
  }
  await b.close();
  return out;
}
// obraz ikony: 256 px – PNG, mniejsze – DIB 32 bpp (BGRA od dołu + maska AND)
function iconImage(im) {
  if (im.s >= 256) return im.png;
  const s = im.s, rowM = Math.ceil(s / 32) * 4, hdr = Buffer.alloc(40), px = Buffer.alloc(s * s * 4), mask = Buffer.alloc(rowM * s);
  hdr.writeUInt32LE(40, 0); hdr.writeInt32LE(s, 4); hdr.writeInt32LE(2 * s, 8); hdr.writeUInt16LE(1, 12); hdr.writeUInt16LE(32, 14); hdr.writeUInt32LE(0, 16); hdr.writeUInt32LE(px.length + mask.length, 20);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const i = (y * s + x) * 4, o = ((s - 1 - y) * s + x) * 4;
    px[o] = im.rgba[i + 2]; px[o + 1] = im.rgba[i + 1]; px[o + 2] = im.rgba[i]; px[o + 3] = im.rgba[i + 3];
    if (im.rgba[i + 3] === 0) mask[(s - 1 - y) * rowM + (x >> 3)] |= 0x80 >> (x & 7);
  }
  return Buffer.concat([hdr, px, mask]);
}
function ico(imgs) {
  const head = Buffer.alloc(6 + 16 * imgs.length); head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(imgs.length, 4);
  let off = head.length; const data = [];
  imgs.forEach((im, k) => {
    const d = iconImage(im), e = 6 + 16 * k;
    head[e] = im.s >= 256 ? 0 : im.s; head[e + 1] = im.s >= 256 ? 0 : im.s; head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6); head.writeUInt32LE(d.length, e + 8); head.writeUInt32LE(off, e + 12);
    off += d.length; data.push(d);
  });
  return Buffer.concat([head].concat(data));
}
// plik obiektowy COFF z sekcją .rsrc (format zasobów PE); OffsetToData wpisów danych – relokacje IMAGE_REL_AMD64_ADDR32NB
function syso(imgs) {
  const icons = imgs.map((im, k) => ({ id: k + 1, data: iconImage(im), s: im.s }));
  const grp = Buffer.alloc(6 + 14 * icons.length); grp.writeUInt16LE(0, 0); grp.writeUInt16LE(1, 2); grp.writeUInt16LE(icons.length, 4);
  icons.forEach((ic, k) => { const e = 6 + 14 * k; grp[e] = ic.s >= 256 ? 0 : ic.s; grp[e + 1] = ic.s >= 256 ? 0 : ic.s; grp.writeUInt16LE(1, e + 4); grp.writeUInt16LE(32, e + 6); grp.writeUInt32LE(ic.data.length, e + 8); grp.writeUInt16LE(ic.id, e + 12); });
  const LANG = 0x0409;
  const types = [{ id: 3, items: icons.map(ic => ({ id: ic.id, data: ic.data })) }, { id: 14, items: [{ id: 1, data: grp }] }];   // RT_ICON, RT_GROUP_ICON (rosnąco)
  const dirSize = n => 16 + 8 * n;
  // układ: katalog główny, katalogi typów, katalogi nazw (języków), wpisy danych, dane
  let off = dirSize(types.length);
  types.forEach(t => { t.off = off; off += dirSize(t.items.length); });
  types.forEach(t => t.items.forEach(it => { it.off = off; off += dirSize(1); }));
  types.forEach(t => t.items.forEach(it => { it.de = off; off += 16; }));
  types.forEach(t => t.items.forEach(it => { off = (off + 7) & ~7; it.doff = off; off += it.data.length; }));
  const raw = Buffer.alloc((off + 7) & ~7);
  const dir = (at, ents) => { raw.writeUInt16LE(ents.length, at + 14); ents.forEach((e, i) => { raw.writeUInt32LE(e[0], at + 16 + 8 * i); raw.writeUInt32LE(e[1] >>> 0, at + 20 + 8 * i); }); };
  dir(0, types.map(t => [t.id, 0x80000000 | t.off]));
  types.forEach(t => dir(t.off, t.items.map(it => [it.id, 0x80000000 | it.off])));
  const rel = [];
  types.forEach(t => t.items.forEach(it => {
    dir(it.off, [[LANG, it.de]]);
    raw.writeUInt32LE(it.doff, it.de); raw.writeUInt32LE(it.data.length, it.de + 4);
    it.data.copy(raw, it.doff); rel.push(it.de);
  }));
  const fh = Buffer.alloc(20), sh = Buffer.alloc(40), rl = Buffer.alloc(10 * rel.length), sym = Buffer.alloc(18), str = Buffer.alloc(4);
  const pRaw = 60, pRel = pRaw + raw.length, pSym = pRel + rl.length;
  fh.writeUInt16LE(0x8664, 0); fh.writeUInt16LE(1, 2); fh.writeUInt32LE(0, 4); fh.writeUInt32LE(pSym, 8); fh.writeUInt32LE(1, 12); fh.writeUInt16LE(0, 16); fh.writeUInt16LE(0, 18);
  sh.write('.rsrc', 0, 'latin1'); sh.writeUInt32LE(raw.length, 16); sh.writeUInt32LE(pRaw, 20); sh.writeUInt32LE(pRel, 24); sh.writeUInt16LE(rel.length, 32); sh.writeUInt32LE(0x40000040, 36);
  rel.forEach((at, i) => { rl.writeUInt32LE(at, 10 * i); rl.writeUInt32LE(0, 10 * i + 4); rl.writeUInt16LE(3, 10 * i + 8); });
  sym.write('.rsrc', 0, 'latin1'); sym.writeUInt32LE(0, 8); sym.writeInt16LE(1, 12); sym.writeUInt16LE(0, 14); sym[16] = 3; sym[17] = 0;
  str.writeUInt32LE(4, 0);
  return Buffer.concat([fh, sh, raw, rl, sym, str]);
}

(async () => {
  const imgs = await rasterize();
  fs.writeFileSync(path.join(ROOT, 'host/icon.png'), imgs.find(q => q.s === 256).png);
  fs.writeFileSync(path.join(ROOT, 'host/icon.ico'), ico(imgs));
  fs.writeFileSync(path.join(ROOT, 'host/rsrc_windows_amd64.syso'), syso(imgs));
  console.log(`✓ host/icon.png, host/icon.ico, host/rsrc_windows_amd64.syso (${SIZES.join(', ')} px)`);
})().catch(e => { console.error(e); process.exit(1); });
