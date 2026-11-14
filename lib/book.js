// Fotolibro: impagina in PDF le foto, il diario e i testi del viaggio nel formato della copertina rigida A4 orizzontale di Peecho.
// Regole del fornitore: un solo PDF con copertina, interno e retro come pagine singole, 297 x 210 mm, senza abbondanze né crocini,
// almeno 10 mm di margine, numero di pagine pari, da 24 a 300.
const path = require('path'), PDFDocument = require('pdfkit'), sharp = require('sharp');
const MM = 2.834645, W = 297 * MM, H = 210 * MM, M = 14 * MM, GAP = 5 * MM;
const INK = '#1D2942', PAPER = '#ECE4D2', LINE = '#B9AE95', INK2 = '#5E5848';
const F = n => path.join(__dirname, '..', 'assets', 'fonts', n + '.ttf');
const MONS = ['GEN', 'FEB', 'MAR', 'APR', 'MAG', 'GIU', 'LUG', 'AGO', 'SET', 'OTT', 'NOV', 'DIC'];
const dshort = D => (D.dow.slice(0, 3) + ' ' + ('0' + D.n).slice(-2) + ' ' + D.mon.slice(0, 3)).toUpperCase();
const val = (kv, k, d) => (kv[k] && kv[k].v != null ? kv[k].v : d);

async function buildBook(trip, kv, getPhoto) {
  const acc = (trip.palette && trip.palette.acc) || '#EE6A1F', book = val(kv, 'book', null) || {};
  const plan = val(kv, 'plan', null), people = trip.people, pname = id => (people.find(p => p.id === id) || {}).name || '';
  const doc = new PDFDocument({ size: [W, H], margin: 0, autoFirstPage: false, info: { Title: trip.title, Author: 'I nostri viaggi insieme' } });
  const chunks = []; doc.on('data', c => chunks.push(c)); const done = new Promise(r => doc.on('end', r));
  doc.registerFont('disp', F('BigShouldersDisplay_900Black')); doc.registerFont('disp7', F('BigShouldersDisplay_700Bold'));
  doc.registerFont('mono', F('JetBrainsMono_500Medium')); doc.registerFont('monob', F('JetBrainsMono_700Bold'));
  doc.registerFont('body', F('Archivo_400Regular')); doc.registerFont('bodyb', F('Archivo_700Bold'));
  let pages = 0;
  const page = bg => { doc.addPage(); pages++; doc.rect(0, 0, W, H).fill(bg || '#FFFFFF'); };
  const label = (t, x, y, c, o) => doc.font('mono').fontSize(8.5).fillColor(c || INK2).text(String(t).toUpperCase(), x, y, Object.assign({ characterSpacing: 1.4, lineBreak: false }, o || {}));
  const barcode = (x, y, w, h, c) => { let i = 0; const pat = [2, 2, 3, 2, 1, 4, 2, 1, 3, 3, 1, 2]; for (let p = x; p < x + w;) { const bw = pat[i % pat.length]; if (i % 2 === 0) doc.rect(p, y, Math.min(bw, x + w - p), h).fill(c); p += bw; i++; } };
  const dashed = (x1, y1, x2, y2, c) => doc.save().moveTo(x1, y1).lineTo(x2, y2).dash(5, { space: 4 }).lineWidth(1.3).strokeColor(c || LINE).stroke().restore();

  // ---- copertina ----
  const codes = trip.codes || ['', ''];
  page(INK);
  doc.rect(0, 0, W, 24 * MM).fill(acc);
  label('I nostri viaggi insieme', M, 10 * MM, '#FFFFFF'); label(trip.dateLabel || '', M, 10 * MM, '#FFFFFF', { width: W - 2 * M, align: 'right' });
  doc.font('disp').fontSize(170).fillColor(PAPER);
  const y0 = 44 * MM, wA = doc.widthOfString(codes[0] || ''), wB = doc.widthOfString(codes[1] || '');
  doc.text(codes[0] || '', M, y0, { lineBreak: false }); doc.text(codes[1] || '', W - M - wB, y0, { lineBreak: false });
  dashed(M + wA + 20, y0 + 92, W - M - wB - 20, y0 + 92, PAPER);
  label((trip.origin && trip.origin.name) || '', M, y0 + 172, PAPER); label(trip.dest.name, M, y0 + 172, PAPER, { width: W - 2 * M, align: 'right' });
  doc.font('disp').fontSize(46).fillColor(acc).text((book.title || trip.title).toUpperCase(), M, 138 * MM, { width: W - 2 * M - 50 * MM, height: 100, ellipsis: true });
  label(people.map(p => p.name).join(' · '), M, 184 * MM, PAPER);
  barcode(M, 190 * MM, 70 * MM, 7 * MM, PAPER);
  if (trip._icon) { const s = 40 * MM; doc.rect(W - M - s - 6, H - M - s - 6, s + 12, s + 12).fill(PAPER); doc.image(trip._icon, W - M - s, H - M - s, { width: s, height: s }); }

  // ---- dedica e passeggeri ----
  page(PAPER);
  doc.rect(0, 0, W, 6 * MM).fill(acc);
  label('Dedica', M, 26 * MM); doc.font('disp').fontSize(52).fillColor(INK).text(trip.title.toUpperCase(), M, 32 * MM, { lineBreak: false });
  doc.font('body').fontSize(17).fillColor(INK).text(book.dedication || 'A chi c\'era.', M, 60 * MM, { width: W * 0.58, height: 70 * MM, lineGap: 5, ellipsis: true });
  label('Passeggeri', M, 140 * MM);
  let px = M; const fs = 26 * MM;
  for (const p of people.slice(0, 8)) {
    doc.rect(px, 147 * MM, fs, fs * 1.12).fill(p.color || INK);
    if (p.face && p.face.startsWith('data:')) { try { const png = await sharp(Buffer.from(p.face.split(',')[1], 'base64')).resize(300, 336, { fit: 'cover' }).png().toBuffer(); doc.image(png, px, 147 * MM, { width: fs, height: fs * 1.12 }); } catch (e) { /* resta il riquadro colorato */ } }
    else doc.font('disp').fontSize(48).fillColor('#FFFFFF').text((p.name || '?')[0].toUpperCase(), px, 147 * MM + 14, { width: fs, align: 'center', lineBreak: false });
    label(p.name, px, 147 * MM + fs * 1.12 + 6, INK, { width: fs + 20 });
    px += fs + 9 * MM;
  }

  // ---- giornate ----
  const photos = Object.keys(kv).filter(k => k.startsWith('ph.') && kv[k].v).map(k => Object.assign({ id: k.slice(3) }, kv[k].v)).sort((a, b) => a.ts - b.ts);
  const per = photos.length >= 90 ? 4 : photos.length >= 45 ? 3 : photos.length >= 20 ? 2 : 1;
  let used = 0;
  for (let di = 0; di < trip.days.length; di++) {
    const D = trip.days[di], ch = (book.chapters || [])[di] || {}, ids = ((plan && plan[D.id]) || D.items).filter(i => trip.poi[i]);
    page(PAPER);
    doc.rect(0, 0, 6 * MM, H).fill(D.c || acc);
    doc.font('disp').fontSize(84).fillColor(INK).text(dshort(D), M + 4 * MM, 18 * MM, { lineBreak: false });
    label('Giorno ' + (di + 1) + ' di ' + trip.days.length, M + 4 * MM, 50 * MM);
    const colW = W * 0.5 - M - 8 * MM;
    doc.font('disp7').fontSize(28).fillColor(INK).text((ch.title || D.title || '').toUpperCase(), M + 4 * MM, 58 * MM, { width: colW, height: 70, ellipsis: true });
    doc.font('body').fontSize(12.5).fillColor(INK).text(ch.text || D.intro || '', M + 4 * MM, doc.y + 8, { width: colW, height: 62 * MM, lineGap: 3.5, ellipsis: true });
    let dy = Math.max(doc.y + 14, 140 * MM);
    for (const p of people) {
      const t = String(val(kv, 'diary.' + D.id + '.' + p.id, '') || '').trim(); if (!t || dy > H - M - 30) continue;
      label('Dal diario di ' + p.name, M + 4 * MM, dy, acc); doc.font('body').fontSize(11).fillColor(INK2).text(t, M + 4 * MM, dy + 13, { width: colW, height: Math.min(48, H - M - dy - 13), lineGap: 2, ellipsis: true }); dy = doc.y + 10;
    }
    const tx = W * 0.5 + 6 * MM, tw = W - M - tx; let ty = 20 * MM;
    label('Le tappe', tx, ty); ty += 16;
    ids.slice(0, 11).forEach((id, k) => {
      const p = trip.poi[id];
      dashed(tx, ty, tx + tw, ty);
      doc.font('monob').fontSize(11).fillColor(val(kv, 'ev.' + id) ? acc : INK).text(p.at || String(k + 1).padStart(2, '0'), tx, ty + 9, { lineBreak: false });
      doc.font('bodyb').fontSize(12.5).fillColor(INK).text(p.n, tx + 52, ty + 7, { width: tw - 52, height: 16, ellipsis: true });
      doc.font('mono').fontSize(7.5).fillColor(INK2).text(p.sub || '', tx + 52, ty + 23, { width: tw - 52, height: 10, ellipsis: true });
      ty += 40;
    });
    dashed(tx, ty, tx + tw, ty);
    // pagine di foto della giornata
    const ph = photos.filter(p => p.day === D.id);
    for (let i = 0; i < ph.length && pages < 296; i += per) {
      const grp = ph.slice(i, i + per), bufs = [];
      for (const p of grp) { try { const b = await getPhoto(p.id); if (b && b[0] === 0xFF && b[1] === 0xD8) bufs.push({ p, b }); } catch (e) { /* foto mancante: si salta */ } }
      if (!bufs.length) continue;
      page('#FFFFFF');
      const capH = 9 * MM, aw = W - 2 * M, ah = H - 2 * M - 6 * MM, n = bufs.length;
      const boxes = n === 1 ? [[M, M, aw, ah]] : n === 2 ? [[M, M, (aw - GAP) / 2, ah], [M + (aw + GAP) / 2, M, (aw - GAP) / 2, ah]]
        : n === 3 ? [[M, M, aw * 0.6 - GAP / 2, ah], [M + aw * 0.6 + GAP / 2, M, aw * 0.4 - GAP / 2, (ah - GAP) / 2], [M + aw * 0.6 + GAP / 2, M + (ah + GAP) / 2, aw * 0.4 - GAP / 2, (ah - GAP) / 2]]
        : [0, 1, 2, 3].map(k => [M + (k % 2) * (aw + GAP) / 2, M + Math.floor(k / 2) * (ah + GAP) / 2, (aw - GAP) / 2, (ah - GAP) / 2]);
      bufs.forEach((x, k) => {
        const [bx, by, bw, bh] = boxes[k], ih = bh - capH;
        doc.save().rect(bx, by, bw, ih).clip().image(x.b, bx, by, { cover: [bw, ih], align: 'center', valign: 'center' }).restore();
        doc.font('mono').fontSize(7.5).fillColor(INK2).text((pname(x.p.who).toUpperCase() + (x.p.cap ? '  ·  ' + x.p.cap : '')), bx, by + ih + 6, { width: bw, height: 10, ellipsis: true, characterSpacing: 0.6 });
        used++;
      });
      label(dshort(D), M, H - M - 2, INK2); label(trip.title, M, H - M - 2, INK2, { width: W - 2 * M, align: 'right' });
    }
  }

  // ---- chiusura ----
  page(PAPER);
  doc.rect(0, 0, W, 6 * MM).fill(acc);
  label('Arrivo', M, 26 * MM); doc.font('disp').fontSize(52).fillColor(INK).text('FINE DEL VIAGGIO', M, 32 * MM, { lineBreak: false });
  doc.font('body').fontSize(16).fillColor(INK).text(book.closing || '', M, 60 * MM, { width: W * 0.5, height: 50 * MM, lineGap: 5, ellipsis: true });
  const stops = trip.days.reduce((a, D) => a + ((plan && plan[D.id]) || D.items).length, 0);
  [['Giorni', trip.days.length], ['Tappe', stops], ['Foto', used], ['Passeggeri', people.length]].forEach((s, k) => { const x = M + k * 42 * MM; label(s[0], x, 150 * MM); doc.font('disp').fontSize(54).fillColor(INK).text(String(s[1]), x, 155 * MM, { lineBreak: false }); });
  let qy = 26 * MM; const qx = W * 0.5 + 16 * MM;
  (book.phrases || []).slice(0, 7).forEach(q => { dashed(qx, qy, W - M, qy); doc.font('body').fontSize(12).fillColor(INK).text(q, qx, qy + 9, { width: W - M - qx, height: 44, lineGap: 2, ellipsis: true }); qy = doc.y + 10; });

  // ---- pagine di appunti fino al minimo di stampa, poi retro ----
  while (pages < 23 || pages % 2 === 0) {
    page(PAPER); label('Appunti di viaggio', M, 20 * MM); label(trip.title, M, 20 * MM, INK2, { width: W - 2 * M, align: 'right' });
    for (let y = 36 * MM; y < H - M; y += 11 * MM) dashed(M, y, W - M, y);
  }
  page(INK);
  barcode(W / 2 - 35 * MM, 92 * MM, 70 * MM, 9 * MM, PAPER);
  label(trip.title + '  ·  ' + (trip.dateLabel || ''), 0, 108 * MM, PAPER, { width: W, align: 'center' });
  label('I nostri viaggi insieme', 0, 190 * MM, acc, { width: W, align: 'center' });
  doc.end(); await done;
  return { pdf: Buffer.concat(chunks), pages, photos: used, missing: photos.length - used };
}
module.exports = { buildBook, SIZE_MM: [297, 210] };
