// Fotolibro di viaggio: copertina a tinta piatta con titolo grande e illustrazione della destinazione, interno arioso con
// titoli in serif, data, dati della giornata, mappa del percorso, timbri. PDF per la copertina rigida A4 orizzontale di Peecho:
// un solo file con copertina, interno e retro come pagine singole, 297 x 210 mm, senza abbondanze, margini di almeno 10 mm, pagine pari, 24-300.
const path = require('path'), PDFDocument = require('pdfkit'), sharp = require('sharp');
const MM = 2.834645, W = 297 * MM, H = 210 * MM, M = 18 * MM, GAP = 3 * MM;
const PAGE = '#F2F4F3', WHITE = '#FBFBFA', INK = '#23395B', SOFT = '#6C7A8C', RULE = '#C9D0D6';
const F = n => path.join(__dirname, '..', 'assets', 'fonts', n + '.ttf');
// Coppie fondo e titolo per la copertina quando non c'è l'illustrazione (con l'illustrazione il fondo si legge dall'immagine).
const COVERS = [['#C9CDBE', '#B3261E'], ['#2F4FA2', '#F4EBD0'], ['#F2A0B4', '#FFF6E0'], ['#E9DFC6', '#B3402E'], ['#1F6F64', '#F6D25A'], ['#F3C64B', '#23395B']];
const val = (kv, k, d) => (kv[k] && kv[k].v != null ? kv[k].v : d);
const hav = (a, b) => { const t = Math.PI / 180, x = (b.lon - a.lon) * t * Math.cos((a.lat + b.lat) / 2 * t), y = (b.lat - a.lat) * t; return Math.sqrt(x * x + y * y) * 6371; };
const lum = hex => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
const hex = (r, g, b) => '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');

async function buildBook(trip, kv, getPhoto) {
  const book = val(kv, 'book', null) || {}, plan = val(kv, 'plan', null), people = trip.people;
  const pname = id => (people.find(p => p.id === id) || {}).name || '';
  const idsOf = D => ((plan && plan[D.id]) || D.items).filter(i => trip.poi[i]);
  const seed = [...trip.slug].reduce((a, c) => a + c.charCodeAt(0), 0);
  let [CBG, CT] = COVERS[seed % COVERS.length], cover = trip._cover || null;
  if (cover) { try { const px = await sharp(cover).extract({ left: 4, top: 4, width: 8, height: 8 }).resize(1, 1).raw().toBuffer(); CBG = hex(px[0], px[1], px[2]); CT = lum(CBG) > 0.6 ? '#B3261E' : '#FFF6E0'; cover = await sharp(cover).png().toBuffer(); } catch (e) { cover = null; } }
  const ACC = lum(CT) < 0.6 ? CT : INK;
  const doc = new PDFDocument({ size: [W, H], margin: 0, autoFirstPage: false, info: { Title: trip.title, Author: 'I nostri viaggi insieme' } });
  const chunks = []; doc.on('data', c => chunks.push(c)); const done = new Promise(r => doc.on('end', r));
  doc.registerFont('title', F('TitanOne_400Regular')); doc.registerFont('serif', F('CormorantGaramond_500Medium')); doc.registerFont('serifi', F('CormorantGaramond_500Medium_Italic'));
  doc.registerFont('serifb', F('CormorantGaramond_700Bold')); doc.registerFont('sans', F('DMSans_400Regular')); doc.registerFont('sansb', F('DMSans_700Bold'));
  let pages = 0;
  const page = bg => { doc.addPage(); pages++; doc.rect(0, 0, W, H).fill(bg); };
  const small = (t, x, y, o) => doc.font('sans').fontSize(8).fillColor((o && o.color) || SOFT).text(String(t).toUpperCase(), x, y, Object.assign({ characterSpacing: 1.6, lineBreak: false }, o || {}));
  const rule = (x1, y, x2) => doc.moveTo(x1, y).lineTo(x2, y).lineWidth(0.6).strokeColor(RULE).stroke();
  // Timbro di viaggio: due anelli, luogo e data, leggermente ruotato.
  const stamp = (cx, cy, r, top, mid, col, ang) => { doc.save().rotate(ang, { origin: [cx, cy] }).lineWidth(1.6).strokeColor(col).circle(cx, cy, r).stroke().lineWidth(0.7).circle(cx, cy, r - 4).stroke();
    doc.font('sansb').fontSize(6.5).fillColor(col).text(String(top).toUpperCase().slice(0, 16), cx - r, cy - 15, { width: 2 * r, align: 'center', characterSpacing: 1, lineBreak: false });
    doc.font('serifb').fontSize(15).text(mid, cx - r, cy - 7, { width: 2 * r, align: 'center', lineBreak: false });
    doc.font('sansb').fontSize(6).text(String(trip.dates.start).slice(0, 4), cx - r, cy + 10, { width: 2 * r, align: 'center', characterSpacing: 1.5, lineBreak: false }); doc.restore(); };
  const img = (buf, x, y, w, h) => doc.save().rect(x, y, w, h).clip().image(buf, x, y, { cover: [w, h], align: 'center', valign: 'center' }).restore();
  const year = String(trip.dates.start).slice(0, 4), name = trip.dest.name;

  // ---- copertina: tinta piatta, titolo grande, illustrazione ----
  page(CBG);
  doc.font('title').fontSize(name.length > 9 ? 64 : 84).fillColor(CT).text(name.toUpperCase(), 20 * MM, 18 * MM, { width: W * 0.62, lineGap: -8 });
  doc.text(year, 20 * MM, doc.y - 4, { lineBreak: false });
  if (cover) doc.image(cover, W * 0.42, H * 0.2, { fit: [W * 0.54, H * 0.72], align: 'center', valign: 'center' });
  else { const cx = W * 0.7, cy = H * 0.56; doc.circle(cx + 60, cy - 70, 62).fill(CT); doc.fillOpacity(0.9).polygon([cx - 170, cy + 120], [cx - 60, cy - 40], [cx + 40, cy + 120]).fill(lum(CBG) > 0.6 ? INK : '#FFFFFF').fillOpacity(0.55).polygon([cx - 40, cy + 120], [cx + 70, cy - 10], [cx + 190, cy + 120]).fill(lum(CBG) > 0.6 ? INK : '#FFFFFF').fillOpacity(1); }
  small(people.map(p => p.name).join('  ·  '), 20 * MM, H - 22 * MM, { color: CT });

  // ---- frontespizio ----
  page(PAGE);
  doc.font('serif').fontSize(64).fillColor(INK).text(book.title || trip.title, M, 52 * MM, { width: W - 2 * M, align: 'center' });
  doc.font('serifi').fontSize(21).fillColor(ACC).text(trip.dateLabel || '', M, doc.y + 2, { width: W - 2 * M, align: 'center' });
  rule(W / 2 - 30, doc.y + 16, W / 2 + 30);
  doc.font('serifi').fontSize(17).fillColor(INK).text(book.dedication || '', W * 0.22, doc.y + 30, { width: W * 0.56, align: 'center', lineGap: 4, height: 62 * MM, ellipsis: true });
  small(people.map(p => p.name).join('  ·  '), M, H - M - 6, { width: W - 2 * M, align: 'center' });

  // ---- il percorso: mappa schematica dalle coordinate delle tappe ----
  const pts = []; trip.days.forEach((D, di) => idsOf(D).forEach(id => { const p = trip.poi[id]; if (typeof p.lat === 'number' && typeof p.lon === 'number') pts.push({ di, lat: p.lat, lon: p.lon }); }));
  if (pts.length >= 3) {
    page(PAGE);
    doc.font('serif').fontSize(44).fillColor(INK).text('Il percorso', M, 24 * MM, { lineBreak: false });
    doc.font('serifi').fontSize(15).fillColor(SOFT).text([(trip.origin && trip.origin.name) || '', name].filter(Boolean).join(' → '), M, 43 * MM, { lineBreak: false });
    let ly = 62 * MM;
    trip.days.forEach((D, di) => { doc.circle(M + 4, ly + 6, 4).fill(D.c || ACC); doc.font('sansb').fontSize(8).fillColor(INK).text((D.dow + ' ' + D.n + ' ' + D.mon).toUpperCase(), M + 16, ly + 1, { characterSpacing: 1.2, lineBreak: false }); doc.font('serifi').fontSize(12).fillColor(SOFT).text(D.title, M + 16, ly + 12, { width: W * 0.3, height: 15, ellipsis: true }); ly += 34; });
    const bx = W * 0.42, by = M, bw = W - M - bx, bh = H - 2 * M, la = pts.map(p => p.lat), lo = pts.map(p => p.lon), c = Math.cos((Math.min(...la) + Math.max(...la)) / 2 * Math.PI / 180);
    const x0 = Math.min(...lo) * c, x1 = Math.max(...lo) * c, y0 = Math.min(...la), y1 = Math.max(...la), sc = Math.min((bw - 40) / Math.max(x1 - x0, 1e-5), (bh - 40) / Math.max(y1 - y0, 1e-5));
    const X = p => bx + bw / 2 + ((p.lon * c) - (x0 + x1) / 2) * sc, Y = p => by + bh / 2 - (p.lat - (y0 + y1) / 2) * sc;
    doc.roundedRect(bx, by, bw, bh, 6).fill('#E6EBEA');
    trip.days.forEach((D, di) => { const pp = pts.filter(p => p.di === di); if (pp.length > 1) { doc.moveTo(X(pp[0]), Y(pp[0])); pp.slice(1).forEach(p => doc.lineTo(X(p), Y(p))); doc.lineWidth(2).lineJoin('round').strokeColor(D.c || ACC).stroke(); }
      pp.forEach((p, k) => { doc.circle(X(p), Y(p), 6.5).fill(D.c || ACC); doc.font('sansb').fontSize(6.5).fillColor('#FFFFFF').text(String(k + 1), X(p) - 6.5, Y(p) - 4, { width: 13, align: 'center', lineBreak: false }); }); });
    stamp(bx + bw - 44, by + bh - 44, 30, name, year, ACC, -12);
  }

  // ---- giornate ----
  const photos = Object.keys(kv).filter(k => k.startsWith('ph.') && kv[k].v).map(k => Object.assign({ id: k.slice(3) }, kv[k].v)).sort((a, b) => a.ts - b.ts);
  const per = photos.length >= 90 ? 4 : photos.length >= 45 ? 3 : photos.length >= 20 ? 2 : 1;
  const load = async p => { try { const b = await getPhoto(p.id); return b && b[0] === 0xFF && b[1] === 0xD8 ? { p, b } : null; } catch (e) { return null; } };
  const cap = (x, bx, y, bw) => doc.font('serifi').fontSize(10.5).fillColor(SOFT).text([pname(x.p.who), x.p.cap].filter(Boolean).join(' · '), bx, y, { width: bw, height: 13, ellipsis: true });
  let used = 0, flip = 0;
  for (let di = 0; di < trip.days.length; di++) {
    const D = trip.days[di], ch = (book.chapters || [])[di] || {}, ids = idsOf(D), ph = photos.filter(p => p.day === D.id);
    const geo = ids.map(i => trip.poi[i]).filter(p => typeof p.lat === 'number'); let km = 0; for (let i = 1; i < geo.length; i++) { const d = hav(geo[i - 1], geo[i]) * 1.28; if (d < 1.5) km += d; }
    const first = ph.length ? await load(ph[0]) : null, colW = first ? W * 0.36 : W * 0.5 - M;
    page(PAGE);
    doc.font('serif').fontSize(54).fillColor(INK).text('Giorno ' + (di + 1), M, 30 * MM, { lineBreak: false });
    doc.font('serifi').fontSize(19).fillColor(ACC).text(ch.title || D.title || '', M, 52 * MM, { width: colW, height: 50, ellipsis: true });
    let fy = Math.max(doc.y + 14, 74 * MM);
    const fact = (shape, t) => { doc.fillColor(D.c || ACC); if (shape === 0) doc.circle(M + 3, fy + 5, 3).fill(); else if (shape === 1) doc.polygon([M, fy + 8], [M + 3, fy + 1], [M + 6, fy + 8]).fill(); else doc.rect(M, fy + 2, 6, 6).fill(); doc.font('sans').fontSize(9).fillColor(INK).text(t, M + 14, fy, { width: colW - 14, height: 12, ellipsis: true }); fy += 16; };
    if (ids.length) fact(0, trip.poi[ids[0]].n + (ids.length > 1 ? ' → ' + trip.poi[ids[ids.length - 1]].n : ''));
    if (km > 0.2) fact(1, km.toFixed(1).replace('.', ',') + ' km a piedi');
    fact(2, ids.length + ' tappe' + (ph.length ? ' · ' + ph.length + ' foto' : ''));
    doc.font('serif').fontSize(13).fillColor(INK).text(ch.text || D.intro || '', M, fy + 10, { width: colW, height: 42 * MM, lineGap: 3, ellipsis: true });
    let dy = doc.y + 10;
    for (const p of people) { const t = String(val(kv, 'diary.' + D.id + '.' + p.id, '') || '').trim(); if (!t || dy > H - M - 70) continue; doc.font('serifi').fontSize(12).fillColor(SOFT).text('«' + t + '» ' + p.name, M, dy, { width: colW, height: Math.min(44, H - M - 60 - dy), lineGap: 2, ellipsis: true }); dy = doc.y + 6; }
    doc.font('serif').fontSize(38).fillColor(ACC).text(D.n + ' ' + D.mon, M, H - M - 40, { lineBreak: false });
    if (first) { const bx = W * 0.44, bw = W - M - bx, bh = H - 2 * M - 14; img(first.b, bx, M, bw, bh); cap(first, bx, M + bh + 5, bw); used++; stamp(bx - 40, H - M - 86, 26, name, ('0' + D.n).slice(-2) + '.' + String(D.date).slice(5, 7), D.c || ACC, di % 2 ? 10 : -12); }
    else { const tx = W * 0.5 + 8 * MM, tw = W - M - tx; let ty = 30 * MM; small('Le tappe', tx, ty); ty += 18;
      ids.slice(0, 11).forEach((id, k) => { const p = trip.poi[id]; rule(tx, ty, tx + tw); doc.font('sansb').fontSize(8).fillColor(D.c || ACC).text(p.at || String(k + 1).padStart(2, '0'), tx, ty + 10, { lineBreak: false }); doc.font('serif').fontSize(15).fillColor(INK).text(p.n, tx + 40, ty + 5, { width: tw - 40, height: 18, ellipsis: true }); doc.font('serifi').fontSize(10.5).fillColor(SOFT).text(p.sub || '', tx + 40, ty + 22, { width: tw - 40, height: 13, ellipsis: true }); ty += 38; });
      rule(tx, ty, tx + tw); stamp(W - M - 40, H - M - 40, 28, name, ('0' + D.n).slice(-2) + '.' + String(D.date).slice(5, 7), D.c || ACC, -12); }
    // pagine di foto della giornata
    const rest = ph.slice(first ? 1 : 0);
    for (let i = 0; i < rest.length && pages < 296; i += per) {
      const bufs = (await Promise.all(rest.slice(i, i + per).map(load))).filter(Boolean); if (!bufs.length) continue;
      page(WHITE); flip++;
      const capH = 8 * MM, aw = W - 2 * M, ah = H - 2 * M, n = bufs.length, big = aw * 0.62;
      const boxes = n === 1 ? [[M, M, aw, ah]] : n === 2 ? [[M, M, (aw - GAP) / 2, ah], [M + (aw + GAP) / 2, M, (aw - GAP) / 2, ah]]
        : n === 3 ? (flip % 2 ? [[M, M, big - GAP / 2, ah], [M + big + GAP / 2, M, aw - big - GAP / 2, (ah - GAP) / 2], [M + big + GAP / 2, M + (ah + GAP) / 2, aw - big - GAP / 2, (ah - GAP) / 2]] : [[M + aw - big + GAP / 2, M, big - GAP / 2, ah], [M, M, aw - big - GAP / 2, (ah - GAP) / 2], [M, M + (ah + GAP) / 2, aw - big - GAP / 2, (ah - GAP) / 2]])
        : [0, 1, 2, 3].map(k => [M + (k % 2) * (aw + GAP) / 2, M + Math.floor(k / 2) * (ah + GAP) / 2, (aw - GAP) / 2, (ah - GAP) / 2]);
      bufs.forEach((x, k) => { const [bx, by, bw, bh] = boxes[k], ih = bh - capH; img(x.b, bx, by, bw, ih); cap(x, bx, by + ih + 4, bw); used++; });
    }
  }

  // ---- chiusura ----
  page(PAGE);
  doc.font('serif').fontSize(54).fillColor(INK).text('Fine del viaggio', M, 30 * MM, { lineBreak: false });
  doc.font('serifi').fontSize(18).fillColor(INK).text(book.closing || '', M, 56 * MM, { width: W * 0.42, height: 46 * MM, lineGap: 4, ellipsis: true });
  const stops = trip.days.reduce((a, D) => a + idsOf(D).length, 0);
  [['Giorni', trip.days.length], ['Tappe', stops], ['Foto', used], ['In viaggio', people.length]].forEach((s, k) => { const x = M + k * 34 * MM; doc.font('serif').fontSize(46).fillColor(ACC).text(String(s[1]), x, 148 * MM, { lineBreak: false }); small(s[0], x, 168 * MM); });
  let qy = 30 * MM; const qx = W * 0.56;
  (book.phrases || []).slice(0, 7).forEach(q => { doc.font('serifi').fontSize(14).fillColor(INK).text(q, qx, qy, { width: W - M - qx, height: 40, lineGap: 2, ellipsis: true }); qy = doc.y + 8; rule(qx, qy, qx + 40); qy += 10; });

  // ---- appunti fino al minimo di stampa, poi retro ----
  while (pages < 23 || pages % 2 === 0) { page(PAGE); doc.font('serifi').fontSize(20).fillColor(SOFT).text('Appunti', M, 22 * MM, { lineBreak: false }); for (let y = 42 * MM; y < H - M; y += 12 * MM) rule(M, y, W - M); }
  page(CBG);
  doc.font('title').fontSize(22).fillColor(CT).text((name + ' ' + year).toUpperCase(), 0, H / 2 - 14, { width: W, align: 'center', lineBreak: false });
  small('I nostri viaggi insieme', 0, H - 24 * MM, { width: W, align: 'center', color: CT });
  doc.end(); await done;
  return { pdf: Buffer.concat(chunks), pages, photos: used, missing: photos.length - used, spine: CT };
}
module.exports = { buildBook };
