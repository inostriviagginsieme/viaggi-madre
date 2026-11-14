// Contenuti segnaposto per la modalità prova (senza chiave Claude). Servono a collaudare il giro completo.
function base(inp, gc) {
  const n = inp.dest;
  if (!gc && process.env.DEMO_GEO) { const a = process.env.DEMO_GEO.split(','); gc = { name: n, country: '', lat: +a[0], lon: +a[1] }; }
  return {
    dest: { name: (gc && gc.name) || n, country: (gc && gc.country) || '', lat: gc ? gc.lat : 0, lon: gc ? gc.lon : 0, lang: '', langCode: 'en-US', currency: 'euro', wikiTitle: (gc && gc.name) || n },
    title: ((gc && gc.name) || n) + ' ' + inp.start.slice(0, 4),
    planIntro: 'Programma di prova, generato senza Claude per collaudare l\'app.',
    info: { intro: 'Scheda di prova su ' + n + '. Con la chiave Claude qui compaiono descrizione, storia e consigli scritti per questo viaggio.', history: 'Testo di prova.', climate: 'Testo di prova.',
      facts: [['Lingua', 'da compilare'], ['Valuta', 'da compilare']], cards: [{ t: 'Muoversi sul posto', ico: '🚇', h: [['Mezzi', 'da compilare']], note: 'Scheda di prova.' }], phrases: [{ it: 'Buongiorno', loc: 'Good morning', pron: 'gud mornin' }] },
    transport: { summary: 'Indicazioni di prova per raggiungere ' + n + ' da ' + (inp.origin || 'casa') + '.', options: [{ t: 'Opzione di prova', d: 'Con la chiave Claude qui compaiono tre opzioni ordinate per convenienza.', price: 'circa 100 €' }], tips: ['Consiglio di prova.'], local: 'Testo di prova.', iataFrom: '', iataTo: '', stationFrom: '', stationTo: '' },
    lodgingAdvice: 'Testo di prova.',
    pack: [{ cat: 'Documenti', ico: '🪪', items: ['Carta d\'identità', 'Biglietti', 'Tessera sanitaria'] }, { cat: 'Abbigliamento', ico: '🧥', items: ['Scarpe comode', 'Giacca leggera'] }],
    budget: [{ cat: 'trasporto', label: 'Viaggio andata e ritorno', amt: 120, per: 'persona', note: 'stima di prova' }, { cat: 'alloggio', label: 'Alloggio', amt: 600, per: 'gruppo', note: 'stima di prova' }, { cat: 'pasti', label: 'Pranzi e cene', amt: 150, per: 'persona', note: '' }, { cat: 'visite', label: 'Ingressi', amt: 60, per: 'persona', note: '' }, { cat: 'spostamenti', label: 'Mezzi sul posto', amt: 25, per: 'persona', note: '' }, { cat: 'extra', label: 'Ricordi e imprevisti', amt: 50, per: 'persona', note: '' }],
    outline: inp.dates.map((d, i) => ({ date: d, title: 'Giornata ' + (i + 1), theme: 'centro' }))
  };
}
function days(inp, dest, chunk) {
  const o = (k, dx, dy) => ({ lat: dest.lat ? +(dest.lat + dy).toFixed(5) : null, lon: dest.lon ? +(dest.lon + dx).toFixed(5) : null });
  return {
    days: chunk.map(date => {
      const i = inp.dates.indexOf(date), first = i === 0, last = i === inp.dates.length - 1, items = [];
      if (first) items.push({ n: 'Viaggio di andata', sub: inp.outTime || 'orario da definire', kind: 'fix', ico: '🧭', min: 120, at: '08:00', lat: null, lon: null, price: 0, priceTxt: 'già nel preventivo', desc: 'Tappa di prova.', tip: '' });
      items.push(Object.assign({ n: 'Passeggiata in centro', sub: 'tappa di prova', kind: 'see', ico: '🚶', min: 90, at: '', price: 0, priceTxt: 'GRATIS', stop: 'a piedi', desc: 'Tappa di prova: con la chiave Claude qui compare una tappa vera.', tip: 'Consiglio di prova.' }, o(1, 0.004, 0.003)));
      items.push(Object.assign({ n: 'Pranzo', sub: 'locale da scegliere', kind: 'eat', ico: '🍽', min: 70, at: '13:00', price: 25, priceTxt: 'circa 25 € a testa', desc: 'Tappa di prova.', tip: '' }, o(2, -0.006, 0.002)));
      items.push(Object.assign({ n: 'Museo principale', sub: 'tappa di prova', kind: 'see', ico: '🖼', min: 120, at: '', price: 15, priceTxt: '15 €', desc: 'Tappa di prova.', tip: '' }, o(3, 0.012, -0.008)));
      items.push(Object.assign({ n: 'Cena', sub: 'locale da scegliere', kind: 'eat', ico: '🍷', min: 100, at: '20:00', price: 35, priceTxt: 'circa 35 € a testa', desc: 'Tappa di prova.', tip: '' }, o(4, -0.003, -0.004)));
      if (last) items.push({ n: 'Viaggio di ritorno', sub: inp.backTime || 'orario da definire', kind: 'fix', ico: '🧭', min: 120, at: '22:30', lat: null, lon: null, price: 0, priceTxt: '', desc: 'Tappa di prova.', tip: '' });
      return { date, title: 'Giornata ' + (i + 1) + ' di prova', intro: 'Giornata di prova.', start: first ? '08:00' : '09:30', items };
    }),
    parked: [Object.assign({ n: 'Mercato coperto', sub: 'riserva di prova', kind: 'see', ico: '🧺', min: 45, price: 0, priceTxt: 'GRATIS', desc: 'Tappa di riserva.', tip: '' }, o(5, 0.02, 0.01))],
    todo: chunk[0] === inp.dates[0] ? [{ t: 'Prenotare il viaggio', d: 'Voce di prova.', u: '', uTxt: '', pri: 1 }] : []
  };
}
function book(trip, body) {
  return { title: trip.title, dedication: 'Dedica di prova per ' + trip.people.map(p => p.name).join(', ') + '.', chapters: (body.days || []).map(d => ({ title: d.title, text: 'Testo di prova della giornata.' })), phrases: ['Frase di prova.'], closing: 'Chiusura di prova.' };
}
function bookings(inp, files) {
  return { segments: [{ doc: 1, kind: inp.mode === 'treno' ? 'treno' : 'volo', dir: 'andata', from: inp.origin || 'Partenza', fromCode: 'FLR', to: inp.dest, toCode: 'PRG', date: inp.start, dep: '07:15', arrDate: inp.start, arr: '09:05', carrier: 'Compagnia di prova', number: 'XX 1234', pnr: 'PROVA1', passengers: inp.people.map(p => p.name), seats: 'bagaglio a mano', notes: 'Lettura di prova: senza chiave Claude i documenti non vengono letti.' }], lodging: { name: '', address: '' }, warnings: ['Modalità prova: dati non letti dal documento.'] };
}
module.exports = { base, days, book, bookings };
