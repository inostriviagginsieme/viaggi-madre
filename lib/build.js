// Costruzione della webapp figlia: dati del viaggio (trip.json) e file del sito.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const sharp = require('sharp');
const creds = require('./creds');
const ai = require('./ai'), geo = require('./geo'), gem = require('./gemini'), demo = require('./demo');

const TPL = path.join(__dirname, '..', 'template');
const LEAF = path.join(__dirname, '..', 'node_modules', 'leaflet', 'dist');
const DOW = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
const MON = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const DAYC = ['#A76E49', '#C9975C', '#5E9BAC', '#6E8A8E', '#8A6F9E', '#6A8F6B', '#B5654F', '#4B7A8C'];
const PPLC = ['#A76E49', '#5E9BAC', '#6A8F6B', '#8A6F9E', '#C9975C', '#4B5C5D', '#B5654F', '#7A8F3C', '#3F6C8A', '#9A5C7A'];
const ACCENTS = ['#EE6A1F', '#1F8A8A', '#C8372D', '#2B6B55', '#6B4FA0', '#C0497A'];
const INK = '#1D2942', PAPER = '#ECE4D2';
// Caratteri della figlia, serviti dal sito stesso per funzionare offline.
const FONTS = [['big-shoulders-display', 'Big Shoulders Display', [700, 900]], ['ibm-plex-mono', 'IBM Plex Mono', [400, 500, 700]], ['archivo', 'Archivo', [400, 600, 700, 800]]];
const RANGES = { latin: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD', 'latin-ext': 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF' };
function fontFiles() {
  const out = []; let css = '';
  for (const [pkg, fam, ws] of FONTS) for (const w of ws) for (const sub of ['latin-ext', 'latin']) {
    const f = `${pkg}-${sub}-${w}-normal.woff2`, src = path.join(__dirname, '..', 'node_modules', '@fontsource', pkg, 'files', f);
    if (!fs.existsSync(src)) continue;
    out.push({ path: 'pwa/vendor/fonts/' + f, data: fs.readFileSync(src) });
    css += `@font-face{font-family:"${fam}";font-style:normal;font-weight:${w};font-display:swap;src:url(fonts/${f}) format("woff2");unicode-range:${RANGES[sub]}}\n`;
  }
  out.push({ path: 'pwa/vendor/fonts.css', data: css });
  return out;
}
const code3 = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
const MODES = { volo: 'In aereo', treno: 'In treno', auto: 'In automobile' };

const slugify = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 24);
const str = (v, n) => String(v == null ? '' : v).trim().slice(0, n || 4000);
const numOr = (v, d) => { const n = parseFloat(v); return isFinite(n) ? n : d; };
const hhmm = v => { const m = /^(\d{1,2})[:.](\d{2})/.exec(String(v || '')); return m ? String(Math.min(23, +m[1])).padStart(2, '0') + ':' + m[2] : ''; };
const httpUrl = u => /^https?:\/\//i.test(String(u || '')) ? String(u).trim() : '';
function dateList(start, end) {
  const out = [], a = new Date(start + 'T12:00:00Z'), b = new Date(end + 'T12:00:00Z');
  if (isNaN(a) || isNaN(b) || b < a) throw new Error('Date non valide');
  for (let d = new Date(a); d <= b && out.length < 21; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
  return out;
}
function dateLabel(s, e) {
  const a = new Date(s + 'T12:00:00Z'), b = new Date(e + 'T12:00:00Z');
  if (s === e) return a.getUTCDate() + ' ' + MON[a.getUTCMonth()] + ' ' + a.getUTCFullYear();
  if (a.getUTCMonth() === b.getUTCMonth()) return a.getUTCDate() + ' → ' + b.getUTCDate() + ' ' + MON[b.getUTCMonth()] + ' ' + b.getUTCFullYear();
  return a.getUTCDate() + ' ' + MON[a.getUTCMonth()] + ' → ' + b.getUTCDate() + ' ' + MON[b.getUTCMonth()] + ' ' + b.getUTCFullYear();
}
const hav = (a, b) => { const t = Math.PI / 180, x = (b.lon - a.lon) * t * Math.cos((a.lat + b.lat) / 2 * t), y = (b.lat - a.lat) * t; return Math.sqrt(x * x + y * y) * 6371; };
async function pool(items, n, fn) { let i = 0; const out = []; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } })); return out; }

function normInput(b) {
  const people = (b.people || []).map(p => ({ name: str(p.name, 40), photo: typeof p.photo === 'string' && p.photo.startsWith('data:image/') ? p.photo : null })).filter(p => p.name).slice(0, 12);
  if (!people.length) throw new Error('Serve almeno un partecipante');
  const inp = {
    dest: str(b.dest, 80), origin: str(b.origin, 80), start: str(b.start, 10), end: str(b.end, 10), people,
    mode: MODES[b.mode] ? b.mode : 'volo', outTime: str(b.outTime, 120), backTime: str(b.backTime, 120), lodging: str(b.lodging, 200),
    style: str(b.style, 300), budget: str(b.budget, 40), program: str(b.program, 6000), booked: str(b.booked, 400),
    files: (b.bookings || []).filter(f => f && typeof f.data === 'string' && /^data:(application\/pdf|image\/(jpeg|png|webp));base64,/.test(f.data) && f.data.length < 11e6).slice(0, 8).map(f => ({ name: str(f.name, 80) || 'documento', type: f.data.slice(5, f.data.indexOf(';')), b64: f.data.slice(f.data.indexOf(',') + 1) })),
    refs: (b.refs || []).map(r => ({ t: str(r.t, 120), u: str(r.u, 500) })).filter(r => r.u).slice(0, 20), code: str(b.code, 20).toUpperCase().replace(/[^A-Z0-9]/g, '')
  };
  if (!inp.dest) throw new Error('Manca la destinazione');
  inp.dates = dateList(inp.start, inp.end);
  return inp;
}

function normItem(it, id, dest) {
  const lat = numOr(it.lat, null), lon = numOr(it.lon, null), ok = lat != null && lon != null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0);
  const kind = ['see', 'eat', 'fix'].includes(it.kind) ? it.kind : 'see';
  const p = { n: str(it.n, 120) || 'Tappa', sub: str(it.sub, 200), kind, ico: str(it.ico, 8) || (kind === 'eat' ? '🍽' : kind === 'fix' ? '🧭' : '📍'), min: Math.max(5, Math.min(600, Math.round(numOr(it.min, 60)))),
    lat: ok ? lat : null, lon: ok ? lon : null, price: Math.max(0, numOr(it.price, 0)), priceTxt: str(it.priceTxt, 160), stop: str(it.stop, 300), url: httpUrl(it.url), urlTxt: str(it.urlTxt, 60), desc: str(it.desc, 1600), tip: str(it.tip, 900) };
  const at = hhmm(it.at); if (at) p.at = at;
  return p;
}

async function makeImages(inp, destName, pal, log) {
  const files = [], faces = [], srcs = [];
  for (let i = 0; i < inp.people.length; i++) {
    const p = inp.people[i]; let face = null;
    if (p.photo) {
      try {
        const raw = Buffer.from(p.photo.split(',')[1], 'base64');
        const jpg = await sharp(raw).rotate().resize(768, 768, { fit: 'cover', position: 'attention' }).jpeg({ quality: 85 }).toBuffer();
        srcs.push(jpg);
        let img = jpg, car = false;
        if (gem.hasGemini()) { try { img = await gem.genImage(gem.facePrompt(p.name), [jpg]); car = true; } catch (e) { log('Caricatura di ' + p.name + ' non riuscita (' + e.message + '): uso la foto.'); } }
        const webp = await sharp(img).resize(256, 256, { fit: 'cover' }).webp({ quality: 80 }).toBuffer();
        face = 'data:image/webp;base64,' + webp.toString('base64');
        faces.push({ buf: await sharp(img).resize(200, 200, { fit: 'cover' }).png().toBuffer(), car });
      } catch (e) { log('Foto di ' + p.name + ' non leggibile: uso l\'iniziale.'); }
    }
    p.face = face;
  }
  let logo = null, note = '';
  if (gem.hasGemini() && srcs.length) {
    try { logo = await gem.genImage(gem.logoPrompt(destName, Math.min(srcs.length, 6)), srcs.slice(0, 6)); note = 'Disegnato da Gemini a partire dalle foto dei partecipanti: è l\'icona dell\'app sul telefono.'; }
    catch (e) { log('Logo con Gemini non riuscito (' + e.message + '): compongo il logo dalle faccine.'); }
  }
  if (!logo) {
    const f = faces.slice(0, 4), pos = [[[256, 270, 150]], [[176, 280, 118], [336, 280, 118]], [[256, 190, 104], [156, 340, 104], [356, 340, 104]], [[166, 176, 100], [346, 176, 100], [166, 356, 100], [346, 356, 100]]][Math.max(0, f.length - 1)];
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="512" height="512"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${pal.navy}"/><stop offset=".7" stop-color="${pal.navy2}"/><stop offset="1" stop-color="${pal.butter}"/></linearGradient></defs><rect width="512" height="512" fill="url(#g)"/>`;
    if (!f.length) svg += `<path d="M256 96c-66 0-118 52-118 116 0 86 118 204 118 204s118-118 118-204c0-64-52-116-118-116z" fill="${pal.butter}"/><circle cx="256" cy="212" r="46" fill="${pal.navy}"/>`;
    f.forEach((x, i) => { const [cx, cy, r] = pos[i]; svg += `<clipPath id="c${i}"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath><circle cx="${cx}" cy="${cy}" r="${r + 8}" fill="#FFF7EE"/><image x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" clip-path="url(#c${i})" xlink:href="data:image/png;base64,${x.buf.toString('base64')}"/>`; });
    logo = await sharp(Buffer.from(svg + '</svg>')).png().toBuffer();
    note = f.length ? 'Composto dalle faccine dei partecipanti: è l\'icona dell\'app sul telefono.' : 'Icona dell\'app sul telefono.';
  }
  for (const s of [512, 192, 180]) files.push({ path: 'pwa/icon-' + s + '.png', data: await sharp(logo).resize(s, s, { fit: 'cover' }).png().toBuffer() });
  return { files, note };
}

async function buildTrip(body, opt) {
  const log = opt.log || (() => {}), inp = normInput(body), useAi = ai.hasClaude();
  // Prenotazioni caricate: Claude le legge e diventano vincoli del programma.
  let bk = { segments: [], lodging: {}, warnings: [] };
  if (inp.files.length) {
    log('Leggo ' + inp.files.length + (inp.files.length === 1 ? ' documento di prenotazione…' : ' documenti di prenotazione…'));
    try { bk = Object.assign(bk, useAi ? await ai.genBookings(inp, inp.files) : demo.bookings(inp, inp.files)); } catch (e) { log('Lettura delle prenotazioni non riuscita (' + e.message + '): proseguo con i dati del modulo.'); }
    bk.segments = (bk.segments || []).slice(0, 16).map(x => ({ doc: Math.max(1, Math.min(inp.files.length, parseInt(x.doc, 10) || 1)), kind: str(x.kind, 12) || 'altro', dir: ['andata', 'ritorno', 'interno'].includes(x.dir) ? x.dir : 'interno', from: str(x.from, 80), fromCode: str(x.fromCode, 3).toUpperCase(), to: str(x.to, 80), toCode: str(x.toCode, 3).toUpperCase(), date: /^\d{4}-\d{2}-\d{2}$/.test(str(x.date, 10)) ? str(x.date, 10) : '', dep: hhmm(x.dep), arrDate: /^\d{4}-\d{2}-\d{2}$/.test(str(x.arrDate, 10)) ? str(x.arrDate, 10) : '', arr: hhmm(x.arr), carrier: str(x.carrier, 60), number: str(x.number, 20), pnr: str(x.pnr, 20), passengers: (x.passengers || []).slice(0, 12).map(n => str(n, 60)), seats: str(x.seats, 200), notes: str(x.notes, 400) })).filter(x => x.from || x.to);
    const line = x => `- ${x.kind} ${x.dir}: ${x.from}${x.fromCode ? ' (' + x.fromCode + ')' : ''} ${x.date} ${x.dep} → ${x.to}${x.toCode ? ' (' + x.toCode + ')' : ''} ${x.arrDate && x.arrDate !== x.date ? x.arrDate + ' ' : ''}${x.arr}, ${x.carrier} ${x.number}${x.seats ? ', ' + x.seats : ''}${x.notes ? '. ' + x.notes : ''}`;
    const L = bk.lodging || {}, lod = str(L.name, 80) ? { name: str(L.name, 80), address: str(L.address, 160), checkin: str(L.checkin, 20), checkout: str(L.checkout, 20), pnr: str(L.pnr, 20), notes: str(L.notes, 300) } : null;
    bk.lodging = lod;
    inp.bookingsText = bk.segments.map(line).concat(lod ? [`- alloggio: ${lod.name}, ${lod.address}, check-in ${lod.checkin}, check-out ${lod.checkout}${lod.notes ? '. ' + lod.notes : ''}`] : []).join('\n');
    const seg = d => bk.segments.find(x => x.dir === d), tm = x => x ? `${x.fromCode || x.from} ${x.dep} → ${x.toCode || x.to} ${x.arr}` : '';
    const ak = (seg('andata') || {}).kind; if ((ak === 'volo' || ak === 'treno') && ak !== inp.mode) { log('Il mezzo indicato nel modulo era ' + inp.mode + ', la prenotazione di andata è un ' + ak + ': uso ' + ak + '.'); inp.mode = ak; }
    if (!inp.outTime) inp.outTime = tm(seg('andata')); if (!inp.backTime) inp.backTime = tm(seg('ritorno'));
    if (!inp.lodging && lod) inp.lodging = [lod.name, lod.address].filter(Boolean).join(', ');
    if (!inp.booked && bk.segments.length) inp.booked = 'Prenotazioni lette dai documenti caricati: ' + bk.segments.length + (bk.segments.length === 1 ? ' tratta' : ' tratte') + (lod ? ' e l\'alloggio' : '') + '.';
    (bk.warnings || []).slice(0, 8).forEach(w => log('Attenzione, prenotazioni: ' + str(w, 300)));
    log('Prenotazioni lette: ' + bk.segments.length + (bk.segments.length === 1 ? ' tratta' : ' tratte') + (lod ? ', alloggio ' + lod.name : '') + '.');
  }
  log(useAi ? 'Claude studia la destinazione e imposta il viaggio…' : 'Modalità prova (manca ANTHROPIC_API_KEY): contenuti segnaposto.');
  const gc = await geo.geocodeCity(inp.dest);
  const base = useAi ? await ai.genBase(inp) : demo.base(inp, gc);
  const d = base.dest || {};
  const dest = { name: str(d.name, 80) || inp.dest, country: str(d.country, 60) || (gc && gc.country) || '', lat: numOr(d.lat, 0), lon: numOr(d.lon, 0), lang: str(d.lang, 40), langCode: str(d.langCode, 12) || 'en-US', currency: str(d.currency, 30) };
  if (gc && (!dest.lat || hav(dest, gc) > 80)) { dest.lat = gc.lat; dest.lon = gc.lon; }
  const year = inp.start.slice(0, 4), root = slugify(body.slug) || (slugify(dest.name) || 'viaggio') + year;
  let slug = root; for (let i = 2; opt.taken && await opt.taken(slug) && i < 30; i++) slug = root + '-' + i;
  const acc = ACCENTS[parseInt(crypto.createHash('md5').update(slug).digest('hex').slice(0, 6), 16) % ACCENTS.length], pal = { acc, navy: INK, navy2: acc, butter: PAPER };

  log('Claude scrive il programma giorno per giorno (' + inp.dates.length + ' giorni)…');
  const chunks = []; for (let i = 0; i < inp.dates.length; i += 2) chunks.push(inp.dates.slice(i, i + 2));
  const parts = await pool(chunks, 3, c => useAi ? ai.genDays(inp, base, c) : demo.days(inp, dest, c));
  const poi = {}, days = [], parked = [], todo = [];
  const byDate = {}; parts.forEach(p => (p.days || []).forEach(x => { byDate[str(x.date, 10)] = x; }));
  inp.dates.forEach((date, i) => {
    const x = byDate[date] || { items: [] }, dt = new Date(date + 'T12:00:00Z'), ids = [];
    (x.items || []).slice(0, 14).forEach((it, k) => { const id = 'd' + (i + 1) + 't' + (k + 1); poi[id] = normItem(it, id, dest); ids.push(id); });
    const o = (base.outline || [])[i] || {};
    days.push({ id: 'd' + (i + 1), date, dow: DOW[dt.getUTCDay()], n: String(dt.getUTCDate()), mon: MON[dt.getUTCMonth()], c: DAYC[i % DAYC.length], title: str(x.title || o.title, 140) || 'Giornata ' + (i + 1), intro: str(x.intro || o.theme, 1200), start: hhmm(x.start) || '09:30', items: ids });
  });
  parts.forEach((p, pi) => {
    (p.parked || []).slice(0, 6).forEach((it, k) => { const id = 'r' + (pi + 1) + 't' + (k + 1), q = normItem(it, id, dest); if (q.kind === 'fix') q.kind = 'see'; delete q.at; poi[id] = q; parked.push(id); });
    (p.todo || []).slice(0, 10).forEach(t => { if (str(t.t)) todo.push({ id: 't' + (todo.length + 1), t: str(t.t, 160), d: str(t.d, 400), u: httpUrl(t.u), uTxt: str(t.uTxt, 40), pri: [1, 2, 3].includes(+t.pri) ? +t.pri : 2 }); });
  });

  // Alloggio e coordinate precise con Google, se la chiave c'è.
  let lodging = null;
  if (inp.lodging) { const g = await geo.googleGeocode(inp.lodging + ', ' + dest.name); lodging = { n: inp.lodging.split(',')[0], addr: g ? g.addr : inp.lodging, lat: g ? g.lat : null, lon: g ? g.lon : null }; }
  if (process.env.GOOGLE_MAPS_KEY) {
    log('Google verifica le coordinate delle tappe…');
    const ids = Object.keys(poi).filter(id => poi[id].kind !== 'fix');
    await pool(ids, 5, async id => { const g = await geo.googleGeocode(poi[id].n + ', ' + dest.name); if (g && hav(g, dest) < 80) { poi[id].lat = g.lat; poi[id].lon = g.lon; } });
  }
  Object.keys(poi).forEach(id => { const p = poi[id]; if (p.lat != null && dest.lat && hav(p, dest) > 400) { p.lat = null; p.lon = null; } });

  // Trasporto.
  const bt = base.transport || {}, X = { mode: inp.mode, modeLabel: MODES[inp.mode], summary: str(bt.summary, 1200), options: (bt.options || []).slice(0, 4).map(o => ({ t: str(o.t, 200), d: str(o.d, 600), price: str(o.price, 80) })), tips: (bt.tips || []).slice(0, 6).map(t => str(t, 400)), local: str(bt.local, 1200), booked: inp.booked,
    bookings: bk.segments, lodgingBooking: bk.lodging || null, params: { out: [inp.start, inp.outTime].filter(Boolean).join(' · '), back: [inp.end, inp.backTime].filter(Boolean).join(' · ') }, links: [], routes: [] };
  const from = inp.origin || 'Italia';
  if (inp.mode === 'volo') {
    const ap = [str(bt.iataFrom, 4), str(bt.iataTo, 4)].filter(Boolean).join(' → ');
    X.links = [{ t: 'Cerca e acquista su Volagratis', u: 'https://www.volagratis.com/voli' }, { t: 'Confronta i prezzi su Google Voli', u: 'https://www.google.com/travel/flights?q=' + encodeURIComponent(`voli da ${from} a ${dest.name} il ${inp.start} ritorno ${inp.end} ${inp.people.length} adulti`) }];
    X.linkNote = 'Volagratis non accetta una ricerca già compilata dall\'esterno: nel modulo inserisci ' + (ap ? 'gli aeroporti ' + ap : from + ' e ' + dest.name) + ', andata ' + inp.start + ', ritorno ' + inp.end + ', ' + inp.people.length + ' passeggeri.';
  } else if (inp.mode === 'treno') {
    const st = [str(bt.stationFrom, 60), str(bt.stationTo, 60)].filter(Boolean).join(' → ');
    X.links = [{ t: 'Cerca e acquista su Trenitalia', u: 'https://www.trenitalia.com/' }];
    X.linkNote = 'Trenitalia non accetta una ricerca già compilata dall\'esterno: nel modulo inserisci ' + (st || from + ' → ' + dest.name) + ', andata ' + inp.start + ', ritorno ' + inp.end + ', ' + inp.people.length + ' passeggeri.';
  } else {
    const to = lodging && lodging.addr ? lodging.addr : dest.name + (dest.country ? ', ' + dest.country : '');
    X.links = [{ t: 'Apri il percorso in Google Maps', u: geo.mapsDirUrl(from, to) }];
    X.routes = (await geo.googleRoutes(from, to)).map(r => Object.assign(r, { url: geo.mapsDirUrl(from, to) }));
    if (!X.routes.length) X.linkNote = process.env.GOOGLE_MAPS_KEY ? 'Google non ha restituito percorsi per questa tratta: il link apre comunque la navigazione.' : 'Manca la chiave Google Maps sulla webapp madre: distanze, tempi e pedaggi si vedono aprendo il link.';
  }

  // Destinazione: foto e fonte da Wikipedia.
  log('Raccolgo foto e notizie sulla destinazione…');
  const w = await geo.wiki(str(d.wikiTitle) || dest.name, 5), files = [], bi = base.info || {};
  const info = { intro: str(bi.intro, 1500), history: str(bi.history, 3000), climate: str(bi.climate, 800), facts: (bi.facts || []).slice(0, 10).map(r => [str(r[0], 40), str(r[1], 300)]),
    cards: (bi.cards || []).slice(0, 6).map(c => ({ t: str(c.t, 60), ico: str(c.ico, 8), h: (c.h || []).slice(0, 10).map(r => [str(r[0], 40), str(r[1], 500)]), note: str(c.note, 500) })),
    phrases: (bi.phrases || []).slice(0, 12).map(p => ({ it: str(p.it, 60), loc: str(p.loc, 120), pron: str(p.pron, 120) })), photos: [],
    source: 'Testi proposti da Claude' + (w.photos.length ? ', foto da Wikimedia Commons (voce «' + (str(d.wikiTitle) || dest.name) + '» di Wikipedia)' : '') + '. Meteo da Open-Meteo.' };
  w.photos.forEach((p, i) => { const f = 'img/dest' + (i + 1) + '.webp'; files.push({ path: 'pwa/' + f, data: p.buf }); info.photos.push({ u: f, cap: p.cap, credit: p.credit }); });

  log(gem.hasGemini() ? 'Gemini disegna le caricature e il logo…' : 'Preparo faccine e logo (senza Gemini: niente caricature)…');
  const im = await makeImages(inp, dest.name, pal, log); files.push(...im.files);

  const CATS = ['trasporto', 'alloggio', 'pasti', 'visite', 'spostamenti', 'extra'];
  const trip = {
    v: 1, ver: '1 · ' + new Date().toISOString().slice(0, 10), slug, title: str(base.title, 40) || dest.name + ' ' + year, dateLabel: dateLabel(inp.start, inp.end), dest, origin: { name: inp.origin }, dates: { start: inp.start, end: inp.end },
    people: inp.people.map((p, i) => ({ id: 'p' + (i + 1), name: p.name, color: PPLC[i % PPLC.length], face: p.face })), logoNote: im.note, palette: { acc }, docs: (() => { let tot = 0; return inp.files.filter(f => (tot += f.b64.length) < 6e6).map(f => ({ name: f.name, type: f.type, data: 'data:' + f.type + ';base64,' + f.b64 })); })(),
    codes: [(bk.segments.find(x => x.dir === 'andata') || {}).fromCode || (inp.mode === 'volo' && str(bt.iataFrom, 3).toUpperCase()) || code3(inp.origin) || 'QUI', (bk.segments.find(x => x.dir === 'andata') || {}).toCode || (inp.mode === 'volo' && str(bt.iataTo, 3).toUpperCase()) || code3(dest.name)],
    planIntro: str(base.planIntro, 500), program: inp.program, refs: inp.refs.map(r => ({ t: r.t, u: httpUrl(r.u) })).filter(r => r.u), transport: X, lodging, lodgingAdvice: str(base.lodgingAdvice, 900), info, days, poi, parked, todo,
    pack: (base.pack || []).slice(0, 8).map(c => ({ cat: str(c.cat, 40), ico: str(c.ico, 8), items: (c.items || []).slice(0, 14).map(x => str(x, 120)).filter(Boolean) })).filter(c => c.items.length),
    budget: (base.budget || []).slice(0, 14).map((b, i) => ({ id: 'b' + (i + 1), cat: CATS.includes(b.cat) ? b.cat : 'extra', label: str(b.label, 80), amt: Math.max(0, Math.round(numOr(b.amt, 0))), per: b.per === 'gruppo' ? 'gruppo' : 'persona', note: str(b.note, 160) })),
    localMode: 'transit', sync: opt.syncApi ? { api: opt.syncApi } : null, gen: { at: new Date().toISOString(), model: useAi ? ai.MODEL() : 'prova', images: gem.hasGemini() ? gem.MODEL() : 'nessuno' }
  };

  // File del sito.
  const sealed = creds.seal(trip, { title: trip.title, dateLabel: trip.dateLabel, palette: { acc } });
  const html = fs.readFileSync(path.join(TPL, 'index.html'), 'utf8').replace(/__THEME__/g, INK).replace(/__TITLE__/g, trip.title.replace(/[<>&"]/g, ''));
  files.push({ path: 'pwa/index.html', data: html }, { path: 'pwa/app.js', data: fs.readFileSync(path.join(TPL, 'app.js')) }, { path: 'pwa/trip.enc', data: sealed.enc }, { path: 'pwa/auth.json', data: JSON.stringify(sealed.auth) });
  files.push({ path: 'pwa/vendor/leaflet.js', data: fs.readFileSync(path.join(LEAF, 'leaflet.js')) }, { path: 'pwa/vendor/leaflet.css', data: fs.readFileSync(path.join(LEAF, 'leaflet.css')) });
  files.push(...fontFiles());
  files.push({ path: 'pwa/manifest.webmanifest', data: JSON.stringify({ name: trip.title, short_name: trip.title, start_url: './', scope: './', display: 'standalone', orientation: 'portrait', background_color: '#CFC6B1', theme_color: INK, lang: 'it', icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }] }, null, 1) });
  const assets = ['./', 'index.html', 'app.js', 'trip.enc', 'auth.json', 'manifest.webmanifest'].concat(files.filter(f => f.path.startsWith('pwa/') && !/index\.html|app\.js|trip\.enc|auth\.json|sw\.js|manifest/.test(f.path)).map(f => f.path.slice(4)));
  files.push({ path: 'pwa/sw.js', data: fs.readFileSync(path.join(TPL, 'sw.js'), 'utf8').replace('__CACHE__', slug + '-' + Date.now()).replace('__ASSETS__', JSON.stringify(assets)) });
  files.push({ path: 'render.yaml', data: `services:\n  - type: web\n    name: ${slug}\n    runtime: static\n    buildCommand: ""\n    staticPublishPath: pwa\n    headers:\n      - path: /sw.js\n        name: Cache-Control\n        value: no-cache\n      - path: /index.html\n        name: Cache-Control\n        value: no-cache\n      - path: /trip.enc\n        name: Cache-Control\n        value: no-cache\n      - path: /auth.json\n        name: Cache-Control\n        value: no-cache\n      - path: /app.js\n        name: Cache-Control\n        value: no-cache\n` });
  files.push({ path: '.gitignore', data: '.DS_Store\nnode_modules/\n' });
  files.push({ path: 'README.md', data: `# ${trip.title}\n\nWebapp del viaggio a ${dest.name}, ${trip.dateLabel}. Generata da «I nostri viaggi insieme» il ${trip.gen.at.slice(0, 10)}.\n\n- Sito: cartella \`pwa\` (Static Site su Render, publish directory \`pwa\`).\n- Dati del viaggio: \`pwa/trip.enc\`, cifrato. Si apre solo con le credenziali dei partecipanti (\`pwa/auth.json\` contiene le chiavi cifrate, non le password).\n- Dati condivisi del gruppo (programma modificato, spese, diario, foto): ramo \`data\`, scritto dalla webapp madre.\n` });
  return { trip, files, inp, creds: sealed.creds, users: sealed.meta };
}
module.exports = { buildTrip, slugify };
