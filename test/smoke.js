// Collaudo in locale senza chiavi: genera un viaggio di prova, apre la figlia con Playwright, verifica sync e conti.
const { spawn } = require('child_process'), path = require('path'), sharp = require('sharp');
const { chromium } = require('playwright');
const B = 'http://localhost:3123', sleep = ms => new Promise(r => setTimeout(r, ms));
async function token(id, c) { const cr = require('crypto'), a = await (await fetch(B + '/preview/' + id + '/auth.json')).json();
  const e = a.users.find(u => u.id === cr.createHash('sha256').update(a.slug + ':' + c.user).digest('hex').slice(0, 24)), k = cr.pbkdf2Sync(c.pass.replace('-', ''), Buffer.from(e.s, 'base64'), a.iter, 32, 'sha256');
  const w = Buffer.from(e.w, 'base64'), d = cr.createDecipheriv('aes-256-gcm', k, Buffer.from(e.i, 'base64')); d.setAuthTag(w.subarray(w.length - 16));
  return Buffer.concat([d.update(w.subarray(0, w.length - 16)), d.final()]).subarray(32).toString('hex'); }
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const srv = spawn('node', ['server.js'], { cwd: path.join(__dirname, '..'), env: Object.assign({}, process.env, { PORT: '3123', ADMIN_PIN: '1234', DATA_DIR: (process.env.DATA_DIR = '/tmp/viaggi-data-' + Date.now()), ANTHROPIC_API_KEY: '', GITHUB_TOKEN: '', GEMINI_API_KEY: '', GOOGLE_MAPS_KEY: '', PEECHO_API_KEY: '', DEMO_GEO: '50.0755,14.4378' }), stdio: 'inherit' });
  await sleep(1500);
  try {
    let r = await fetch(B + '/api/config'); ok(r.status === 401, 'config senza PIN rifiutata');
    const H = { 'x-admin-pin': '1234', 'content-type': 'application/json' };
    const photo = 'data:image/jpeg;base64,' + (await sharp({ create: { width: 300, height: 300, channels: 3, background: '#c97' } }).jpeg().toBuffer()).toString('base64');
    r = await fetch(B + '/api/trips', { method: 'POST', headers: H, body: JSON.stringify({ dest: 'Praga', origin: 'Firenze', start: '2026-12-05', end: '2026-12-08', mode: 'auto', people: [{ name: 'Anna', photo }, { name: 'Bruno' }, { name: 'Carla', photo }], program: 'Castello e birra', introUrl: 'https://www.instagram.com/reel/Daln1CbuaCj/', surpriseText: 'Cena stellata offerta', surpriseDate: '2026-12-07', surpriseTime: '20:30', bookings: [{ name: 'volo.jpg', data: photo }], refs: [{ t: 'reel', u: 'https://example.com/x' }] }) });
    const { id } = await r.json(); let j;
    for (let i = 0; i < 60; i++) { j = await (await fetch(B + '/api/jobs/' + id, { headers: H })).json(); if (j.status !== 'run') break; await sleep(500); }
    console.log(j.log.join(' | '));
    ok(j.status === 'preview' && j.days === 4 && j.creds.length === 3 && j.creds[0].user === 'anna', 'anteprima generata: ' + j.slug + ', ' + j.days + ' giorni, ' + j.stops + ' tappe');
    r = await fetch(B + '/api/jobs/' + id + '/zip'); ok(r.ok && (await r.arrayBuffer()).byteLength > 100000, 'zip scaricabile');
    r = await fetch(B + '/preview/' + id + '/trip.json'); ok(r.status === 404, 'nessun dato del viaggio in chiaro nel sito');
    const pub = await (await fetch(B + '/preview/' + id + '/auth.json')).json();
    ok(!JSON.stringify(pub).toLowerCase().includes('anna') && !JSON.stringify(pub).includes(j.creds[0].pass.replace('-', '')), 'auth.json non contiene nomi né password');
    const enc = Buffer.from(await (await fetch(B + '/preview/' + id + '/trip.enc')).arrayBuffer()); ok(!enc.toString('latin1').includes('Castello'), 'trip.enc cifrato');
    const lg = j.log.join(' '); ok(/Prenotazioni lette: 1 tratta/.test(lg) && /Attenzione, prenotazioni/.test(lg), 'prenotazioni caricate: lette e segnalate nel registro');
    // sync
    const TOK = await token(id, j.creds[0]); const S = B + '/api/sync/' + j.slug, C = { 'content-type': 'application/json', 'x-trip-token': TOK };
    r = await fetch(S, { method: 'POST', headers: { 'content-type': 'application/json', 'x-trip-token': 'ab'.repeat(16) }, body: '{}' }); ok(r.status === 401, 'sync con gettone errato rifiutata');
    let s1 = await (await fetch(S, { method: 'POST', headers: C, body: JSON.stringify({ since: 0, changes: { 'exp.e1': { v: { what: 'Cena', amt: 90, who: 'p1', cat: 'pasti', split: [], ts: 1 }, ts: 1000 } } }) })).json();
    let s2 = await (await fetch(S, { method: 'POST', headers: C, body: JSON.stringify({ since: 0, changes: { 'exp.e1': { v: null, ts: 500 } } }) })).json();
    ok(s1.rev === 1 && s2.rev === 1 && s2.changes['exp.e1'].v.amt === 90, 'sync: vince la modifica più recente');
    const jpg = await sharp({ create: { width: 50, height: 50, channels: 3, background: '#39c' } }).jpeg().toBuffer();
    r = await fetch(S + '/photo/pabc1234', { method: 'PUT', headers: { 'content-type': 'image/jpeg', 'x-trip-token': TOK }, body: jpg }); ok(r.ok, 'foto caricata');
    r = await fetch(S + '/photo/pabc1234', { headers: { 'x-trip-token': TOK } }); ok(r.ok && (await r.arrayBuffer()).byteLength === jpg.length, 'foto riscaricata identica');
    r = await fetch(B + '/api/book/' + j.slug, { method: 'POST', headers: C, body: JSON.stringify({ trip: { title: 'Praga 2026', people: [{ name: 'Anna' }] }, days: [{ date: '2026-12-05', title: 'G1' }] }) }); ok(r.ok && (await r.json()).book.chapters.length === 1, 'testi fotolibro');
    // figlia nel browser: due telefoni
    const br = await chromium.launch(), errs = [];
    const mk = async n => { const cx = await br.newContext({ viewport: { width: 390, height: 844 } }); const p = await cx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/tile|openstreetmap|open-meteo|ERR_|Failed to load/.test(m.text())) errs.push(m.text()); }); p.on('dialog', d => d.accept()); await p.goto(B + '/preview/' + id + '/'); await p.waitForSelector('#lgU', { state: 'visible' }); if (n === 0) { await p.fill('#lgU', 'Anna'); await p.fill('#lgP', 'XXXX-XXXX'); await p.click('#lgB'); await sleep(1500); ok((await p.textContent('#lgE')).includes('non corretti'), 'password errata rifiutata'); await p.screenshot({ path: '/tmp/shot-login.png' }); } await p.fill('#lgU', j.creds[n].name); await p.fill('#lgP', j.creds[n].pass.toLowerCase()); await p.click('#lgB'); await p.waitForSelector('.pp', { timeout: 20000 }); await p.click('#intro .btn'); await sleep(700); return p; };
    const A = await mk(0), Z = await mk(1); await sleep(1500);
    ok(await A.evaluate(() => me().name) === 'Anna' && await Z.evaluate(() => me().name) === 'Bruno', 'ogni telefono entra come il proprio partecipante');
    for (const t of ['s-meta', 's-arrivo', 's-viaggio', 's-conti', 's-foto', 's-altro']) { await A.click(`#nav button[data-t="${t}"]`); await sleep(250); }
    await A.click('#nav button[data-t="s-conti"]');
    ok((await A.textContent('#s-conti')).includes('Cena'), 'telefono A vede la spesa arrivata dal server');
    await A.click('#nav button[data-t="s-arrivo"]'); const ar = await A.textContent('#s-arrivo'); ok(ar.includes('FLR → PRG') && ar.includes('PROVA1') && ar.includes('volo.jpg') && await A.evaluate(() => T.codes.join('-')) === 'FLR-PRG', 'prenotazione nella figlia: tratta, codice, documento, sigle in testata'); await A.screenshot({ path: '/tmp/shot-arrivo.png' });
    ok(ar.includes('Cosa manca al viaggio') && await A.locator('#s-arrivo a[href*="booking.com/searchresults.it.html?ss=Praga&checkin=2026-12-05&checkout=2026-12-08&group_adults=3"]').count() === 1 && await A.locator('#s-arrivo a[href*="kayak.it/flights/PRG-FLR/2026-12-08/3adults"]').count() === 1 && await A.locator('#s-arrivo a[href*="kayak.it/cars/Praga/2026-12-05/2026-12-08"]').count() === 1, 'cosa manca: link diretti di hotel, volo e auto con date e persone');
    await A.click('text=Segna come prenotato >> nth=0'); await sleep(200); ok((await A.textContent('#s-arrivo')).includes('2 voci ancora da prenotare'), 'voce mancante segnata come prenotata');
    await A.click('#nav button[data-t="s-meta"]'); const mt = await A.textContent('#s-meta'); ok(mt.includes('Città vicina di prova') && mt.includes('Consigli operativi') && await A.locator('#s-meta a[href*="rome2rio.com/it/s/Praga/"]').count() === 1 && await A.locator('#s-meta a[href*="getyourguide"]').count() === 1, 'città vicine con attrazioni e link, consigli operativi');
    { const tb = await A.evaluate(() => { const id = Object.keys(POI).find(k => /andata/i.test(POI[k].n)); detail(id); const t = document.querySelector('.sheet') ? document.querySelector('.sheet').textContent : document.body.textContent; closeSheet(); return { n: tripBk(id).length, t }; }); ok(tb.n === 1 && tb.t.includes('volo.jpg') && tb.t.includes('PROVA1'), 'scheda della tappa di viaggio: il biglietto caricato alla creazione è tra gli allegati'); }
    await A.click('#nav button[data-t="s-viaggio"]'); await A.click('#vChips .chip >> text=Tavola'); const tv = await A.textContent('#vBody'); ok(tv.includes('Quando prenotare') && tv.includes('Piano B') && !tv.includes('Cena stellata di prova'), 'Tavola: prenotazioni e piano B, sorpresa nascosta');
    const sec = await A.evaluate(() => { const id = Object.keys(POI).find(i => POI[i].secret); return [vp(id).n, POI[id].revealAt]; }); ok(sec[0] === 'Sorpresa' && sec[1] === '2026-12-07T17:30:00', 'tappa a sorpresa mascherata fino a tre ore prima (' + sec[1] + ')');
    await A.click('#vChips .chip >> text=Programma'); await A.click('#nav button[data-t="s-conti"]');
    await A.fill('#expWhat', 'Taxi'); await A.fill('#expAmt', '30'); await A.click('#s-conti .btn.sec >> text=Bruno'); await sleep(3800);
    await Z.click('#nav button[data-t="s-conti"]'); await Z.evaluate(() => sync(true)); await sleep(1500);
    const zc = await Z.textContent('#s-conti');
    ok(zc.includes('Taxi') && zc.includes('deve'), 'telefono Z riceve la spesa di A e vede i rimborsi');
    const st = await Z.evaluate(() => settle(balances().bal).map(s => s.from + '>' + s.to + ':' + s.amt.toFixed(2)));
    ok(JSON.stringify(st) === JSON.stringify(['p3>p1:40.00', 'p2>p1:10.00']), 'rimborsi corretti: ' + st.join(', '));
    await A.click('#nav button[data-t="s-viaggio"]'); await A.click('#vBody .tk:not(.fix):not(.pk) >> nth=0'); await A.click('text=Togli dal programma'); await sleep(3600);
    await Z.evaluate(() => sync(true)); await sleep(1200);
    ok(await Z.evaluate(() => parked().length) === await A.evaluate(() => parked().length) && await A.evaluate(() => parked().length) >= 2, 'spostamento di tappa condiviso tra i telefoni');
    await A.click('#vChips .chip >> nth=1'); await sleep(200); await A.click('text=Timbra: fatta >> nth=0'); await sleep(200); ok(await A.locator('.stamp').count() === 1, 'timbro sulla tappa fatta'); await A.screenshot({ path: '/tmp/shot-giorno.png' }); ok((await A.textContent('#vBody')).includes('Portami lì'), 'vista giorno');
    await A.click('#vChips .chip >> text=Mappa'); await sleep(900); ok(await A.locator('.pin').count() > 3, 'mappa con le tappe');
    await A.screenshot({ path: '/tmp/shot-mappa.png' });
    await Z.click('#nav button[data-t="s-foto"]'); await sleep(1200); ok(await Z.locator('.gcell').count() === 0, 'album vuoto finché nessuno registra la foto');
    await A.click('#nav button[data-t="s-foto"]'); await A.setInputFiles('#fileIn', { name: 'a.jpg', mimeType: 'image/jpeg', buffer: await sharp({ create: { width: 800, height: 600, channels: 3, background: '#7a5' } }).jpeg().toBuffer() }); await sleep(4500);
    await Z.evaluate(() => sync(true)); await sleep(2500); await Z.click('#nav button[data-t="s-foto"]');
    ok(await Z.locator('.gcell img[src^="blob:"]').count() === 1, 'foto di A arrivata sul telefono Z');
    await A.click('#bookBtn'); await sleep(1500); ok((await A.textContent('#bookBox')).includes('Dedica'), 'testi del fotolibro nella figlia');
await A.click('#nav button[data-t="s-viaggio"]'); await A.click('#vChips .chip >> text=Altre mete'); const xm = await A.textContent('#vBody'); ok(xm.includes('Galleria di prova') && xm.includes('Se piove') && xm.includes('Dove si incastra'), 'altre mete fuori programma, per categoria');
    await A.fill('#ownN', 'Il posto di Marta'); await A.click('text=Aggiungi alle mete'); await sleep(200); ok((await A.textContent('#vBody')).includes('Il posto di Marta'), 'meta propria aggiunta');
    const before = await A.evaluate(() => plan().d1.length);
    await A.click('#nav button[data-t="s-altro"]'); await A.setInputFiles('#docIn', { name: 'Booking.com Conferma.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 prova') }); await sleep(2500);
    const wl = await A.evaluate(() => ({ d1: plan().d1.map(i => POI[i].n), d3: plan().d3.map(i => POI[i].n), gap: g('gap.0'), lod: lodgings().map(x => x.n), sheet: document.getElementById('sheet').textContent, at: schedule(DAYS[0]).rows.filter(r => /Check-in/.test(r.p.n)).map(r => hhmm(r.st))[0] }));
    ok(wl.d1.length === before + 1 && wl.d1.includes('Check-in Hotel di prova') && wl.d3.includes('Check-out Hotel di prova') && wl.at === '15:00', 'prenotazione nel wallet: check-in e check-out entrano nel programma all\'ora giusta (' + wl.at + ')');
    ok(wl.gap === 1 && wl.lod.includes('Hotel di prova') && wl.sheet.includes('Prenotazione letta'), 'prenotazione nel wallet: voce mancante chiusa, alloggio registrato, riepilogo mostrato');
    await A.click('text=Vedi il programma'); await sleep(3600); await Z.evaluate(() => sync(true)); await sleep(1200);
    ok(await Z.evaluate(() => plan().d1.map(i => POI[i] && POI[i].n).includes('Check-in Hotel di prova') && g('gap.0') === 1), 'la modifica da wallet arriva sul telefono Z');
    const wid = await A.evaluate(() => keys('wlog.')[0].slice(5)); await A.evaluate(w => undoWallet(w), wid); await sleep(300);
    ok(await A.evaluate(() => plan().d1.length) === before && await A.evaluate(() => lodgings().length === 0 && keys('wlog.').length === 0), 'annullamento: programma e alloggio tornano come prima');
    await A.setInputFiles('#docIn', { name: 'Booking.com Conferma.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 prova') }); await sleep(2500); await A.evaluate(() => closeSheet()); await A.screenshot({ path: '/tmp/shot-wallet.png' });
    await A.evaluate(() => sync(true)); await sleep(1500); await Z.evaluate(() => sync(true)); await sleep(2000);
    const zd = await Z.evaluate(async () => { const d = wd(); const x = d[d.length - 1]; return { n: d.length, name: x && x.name, who: x && x.who, txt: x && x.blob ? await x.blob.text() : '', id: x && x.id }; });
    ok(zd.n === 2 && zd.name === 'Booking.com Conferma' && zd.txt === '%PDF-1.4 prova' && zd.who === 'p1', 'documenti condivisi: il file caricato da A arriva sul telefono Z, leggibile');
    { const fs = require('fs'), path = require('path'); const f = path.join(process.env.DATA_DIR, j.slug, 'docs', zd.id + '.bin'); const raw = fs.existsSync(f) ? fs.readFileSync(f) : Buffer.alloc(0); ok(raw.length > 28 && !raw.toString('latin1').includes('%PDF'), 'documenti condivisi: nella madre il file è cifrato'); }
    r = await fetch(B + '/api/sync/' + j.slug + '/doc/' + zd.id, { headers: { 'x-trip-token': 'a'.repeat(32) } }); ok(r.status === 401, 'documenti condivisi: non scaricabili senza credenziali');
    await Z.click('#nav button[data-t="s-arrivo"]'); const za = await Z.textContent('#s-arrivo'); ok(za.includes('Documenti del gruppo') && za.includes('Booking.com Conferma') && za.includes('Da prenotare') && (await Z.textContent('#nav')).includes('PRENOTAZIONI'), 'linguetta Prenotazioni: documenti del gruppo e voci da prenotare in un posto solo');
    await Z.evaluate(async id => { window.confirm = () => true; await delDoc(id); await sync(true); }, zd.id); await sleep(1200); await A.evaluate(() => sync(true)); await sleep(1500);
    ok(await A.evaluate(id => !wd().some(d => d.id === id) && !LD[id], zd.id), 'documenti condivisi: eliminato da Z, sparisce anche da A');
    { // posta dei viaggi: un messaggio con una data del viaggio finisce tra i documenti del gruppo e la figlia lo legge e aggiorna il programma
      const nw = await A.evaluate(() => keys('wlog.').length), t1 = await A.evaluate(() => (T.todo || []).map(t => g('todo.' + t.id) ? 1 : 0).join(''));
      r = await fetch(B + '/api/mail/ingest', { method: 'POST', headers: H, body: JSON.stringify({ from: 'Booking.com <noreply@booking.com>', subject: 'Conferma della prenotazione', text: 'Gentile cliente, la sua prenotazione è confermata. Arrivo 06/12/2026 dalle 15:00, partenza 07/12/2026 entro le 12:00. Numero di conferma 123.456. Hotel di prova, Via di prova 1, Praga. ' + 'Dettagli del soggiorno. '.repeat(5) }) }); const mr = await r.json();
      ok(r.ok && mr.slug === j.slug && mr.docs === 1, 'posta: il messaggio viene assegnato al viaggio delle date corrispondenti (' + (mr.note || mr.error) + ')');
      r = await fetch(B + '/api/mail/ingest', { method: 'POST', headers: H, body: JSON.stringify({ from: 'x@example.com', subject: 'Altro', text: 'Soggiorno dal 01/03/2031 al 04/03/2031 in un posto qualunque, con molte altre parole per superare la soglia minima del testo.' }) }); const mr2 = await r.json(); ok(r.ok && !mr2.slug && mr2.docs === 0, 'posta: un messaggio con date fuori da ogni viaggio resta non assegnato');
      r = await fetch(B + '/api/mail/ingest', { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } }); ok(r.status === 401, 'posta: consegna rifiutata senza PIN');
      await A.evaluate(() => sync(true)); await Z.evaluate(() => sync(true)); await sleep(12000); await Z.evaluate(() => sync(true)); await sleep(1500); await A.evaluate(() => sync(true)); await sleep(1500);
      const md = await A.evaluate(async () => { const d = wd().filter(x => x.who === 'mail')[0]; return d ? { read: d.read, head: d.blob ? (await d.blob.text()).slice(0, 5) : '', name: d.name, n: keys('wlog.').length, todo: (T.todo || []).map(t => g('todo.' + t.id) ? 1 : 0).join('') } : null; });
      ok(md && md.head === '%PDF-' && md.name.indexOf('Posta') === 0, 'posta: il messaggio arriva sul telefono come documento del gruppo, decifrato');
      ok(md && md.read === 1 && md.n === nw + 1, 'posta: un solo telefono legge il documento e aggiorna il programma per tutti');
      ok(md && md.todo.indexOf('1') >= 0 && await A.evaluate(() => keys('wlog.').some(k => (KV[k].v.todos || []).length === 1)), 'lettura: il promemoria da prenotare corrispondente viene chiuso');
      r = await fetch(B + '/api/mail', { headers: H }); const ms = await r.json(); ok(ms.on === false && ms.log.length === 2, 'posta: registro dei messaggi visibile dalla madre');
      const un = ms.log.find(x => !x.docs); r = await fetch(B + '/api/mail/ignore', { method: 'POST', headers: H, body: JSON.stringify({ uid: 0, at: un.at, on: true }) }); const ms2 = await (await fetch(B + '/api/mail', { headers: H })).json(); ok(r.ok && un.ignored === false && ms2.log.find(x => x.at === un.at).ignored === true && ms2.log.find(x => x.docs).ignored === false, 'posta: un messaggio non assegnato si può ignorare');
      await A.evaluate(() => closeSheet()); }
    await A.click('#nav button[data-t="s-foto"]'); await sleep(3600);
    await A.click('#pdfBtn'); await sleep(3500); const pm = await A.evaluate(() => g('bookpdf')); ok(pm && pm.pages >= 24 && pm.pages % 2 === 0 && pm.photos === 1, 'fotolibro impaginato: ' + (pm && pm.pages) + ' pagine, ' + (pm && pm.photos) + ' foto');
    const purl = await A.evaluate(() => S.pdfUrl); r = await fetch(purl); const pdf = Buffer.from(await r.arrayBuffer()); ok(r.ok && pdf.subarray(0, 5).toString() === '%PDF-', 'PDF del fotolibro scaricabile dal link firmato'); require('fs').writeFileSync('/tmp/libro.pdf', pdf);
    r = await fetch(purl.replace(/[0-9a-f]{40}/, 'a'.repeat(40))); ok(r.status === 404, 'PDF non raggiungibile senza firma');
    r = await fetch(B + '/api/trips/' + j.slug + '/print', { headers: H }); const pj = await r.json(); ok(pj.pdf === purl && pj.peecho === false, 'la madre vede il fotolibro; stampa spenta senza chiavi Peecho');
    r = await fetch(B + '/api/trips/' + j.slug + '/print/order', { method: 'POST', headers: H, body: '{}' }); ok(r.status === 400, 'ordine di stampa rifiutato senza chiavi');
    for (const [t, f] of [['s-gruppo', 'gruppo'], ['s-meta', 'meta'], ['s-arrivo', 'arrivo'], ['s-viaggio', 'viaggio'], ['s-conti', 'conti'], ['s-foto', 'foto'], ['s-altro', 'altro']]) { await A.click(`#nav button[data-t="${t}"]`); if (t === 's-viaggio') await A.click('#vChips .chip >> nth=0'); await sleep(300); await A.screenshot({ path: '/tmp/shot-' + f + '.png' }); }
    { const ix = await (await fetch(B + '/preview/' + id + '/index.html?pin=1234', { headers: H })).text(), sw = await (await fetch(B + '/preview/' + id + '/sw.js?pin=1234', { headers: H })).text(); const up = require('../lib/build').updateFiles(j.slug, ix, sw); const nsw = up[2].data, as = s => /var ASSETS=(\[[^\n]*?\]);/.exec(s)[1];
      ok(up.length === 3 && as(nsw) === as(sw) && /var CACHE="[^"]+"/.exec(nsw)[0] !== /var CACHE="[^"]+"/.exec(sw)[0] && up[0].data === ix && up[1].data.toString().includes('docSync') && !up.some(f => /trip\.enc|auth\.json/.test(f.path)), 'aggiornamento di una figlia pubblicata: solo codice, stesso titolo, stessa lista di file, contenuto e credenziali intatti');
      r = await fetch(B + '/api/trips/' + j.slug + '/update', { method: 'POST', headers: H }); ok(r.status === 400, 'aggiornamento rifiutato senza GitHub'); }
    { // viaggi passati: importazione, sito ricordo, accesso famiglia
      const imp = async body => { const q = await (await fetch(B + '/api/import', { method: 'POST', headers: H, body: JSON.stringify(body) })).json(); let v; for (let i = 0; i < 80; i++) { v = await (await fetch(B + '/api/jobs/' + q.id, { headers: H })).json(); if (v.status !== 'run') break; await sleep(500); } return Object.assign(v, { jid: q.id }); };
      const it = { folder: '2019/Berlino', year: 2019, name: 'Berlino', notes: 'Hotel Hilton dal 2019-11-01. Museo di Pergamo.', files: [{ name: 'Hilton.jpg', data: photo }], people: ['Francesco', 'Valentina'], familyPass: 'casa-nostra-1' };
      const v1 = await imp(it); ok(v1.status === 'done' && v1.slug === 'berlino2019' && v1.days === 3, 'importazione: la cartella 2019/Berlino diventa un viaggio dal 1 al 3 novembre 2019 (' + (v1.error || v1.slug) + ')');
      const v2 = await imp(it); ok(v2.status === 'done' && v2.skipped === true, 'importazione: un viaggio già in archivio viene saltato');
      const v3 = await imp(Object.assign({}, it, { folder: '2019/Ignoto', name: 'Ignoto', notes: 'senza date' })); ok(v3.status === 'error' && /Date del viaggio/.test(v3.error), 'importazione: senza date ricavabili il viaggio non viene creato');
      const v4 = await imp(Object.assign({}, it, { folder: '2020/Corta', name: 'Corta', familyPass: 'abc' })); ok(v4.status === 'error' && /password/i.test(v4.error), 'importazione: password della famiglia troppo corta rifiutata');
      const P = await (await br.newContext({ viewport: { width: 390, height: 844 } })).newPage(); const pe = []; P.on('pageerror', e => pe.push(e.message)); await P.goto(B + '/preview/' + v1.jid + '/'); await sleep(800);
      await P.fill('#lgU', 'famiglia'); await P.fill('#lgP', 'sbagliata99'); await P.click('#lgB'); await sleep(1500); const bad = await P.evaluate(() => !T);
      await P.fill('#lgP', 'CASA nostra 1'); await P.click('#lgB'); await sleep(2500);
      const pv = await P.evaluate(() => ({ in: !!T, past: T && T.past, fam: T && T.family, nav: document.getElementById('nav').innerText, todo: (T.todo || []).length, parked: (T.parked || []).length, gaps: (T.gaps || []).length, now: document.getElementById('s-gruppo').innerText, people: T.people.map(p => p.name).join(',') }));
      ok(bad && pv.in && pv.past === true && pv.fam === true, 'sito ricordo: si entra solo con utente famiglia e la password scelta');
      ok(/DOCUMENTI/.test(pv.nav) && !/PRENOTAZIONI/.test(pv.nav) && pv.todo === 0 && pv.parked === 0 && pv.gaps === 0 && /Viaggio del 2019/i.test(pv.now) && pv.people === 'Francesco,Valentina', 'sito ricordo: niente prenotazioni né mete in più, intestazione da viaggio fatto');
      await P.evaluate(() => closeIntro()); await sleep(700);
      await P.click('.pp >> nth=1'); await sleep(200); ok(await P.evaluate(() => me().name) === 'Valentina', 'accesso famiglia: ognuno sceglie il proprio nome');
      for (const t of ['s-meta', 's-arrivo', 's-viaggio', 's-conti', 's-foto', 's-altro']) { await P.click(`#nav button[data-t="${t}"]`); await sleep(200); }
      await P.evaluate(() => sync(true)); await sleep(1200); ok(pe.length === 0 && await P.evaluate(() => syncState) === 'ok', 'sito ricordo: tutte le sezioni si aprono e i dati si sincronizzano' + (pe.length ? ': ' + pe.join(' ; ') : '')); await P.screenshot({ path: '/tmp/shot-ricordo.png' }); await P.close(); }
    { // foto del NAS: un finto NAS Synology con lo stesso protocollo verificato sul NAS vero
      const http = require('http'), sharp = require('sharp'), jpg = await sharp({ create: { width: 900, height: 600, channels: 3, background: { r: 200, g: 120, b: 40 } } }).jpeg().toBuffer();
      const big = Buffer.concat([jpg, Buffer.alloc(40000)]), tsOf = d => Math.floor(new Date(d + 'T10:00:00Z').getTime() / 1000);
      const FS = { '/Foto/Tel/2019/11': [['a.jpg', '2019-11-01'], ['b.JPG', '2019-11-02'], ['c.heic', '2019-11-02'], ['fuori.jpg', '2019-11-20'], ['note.txt', '2019-11-01']] };
      const fake = http.createServer((q, s) => { const u = new URL(q.url, 'http://x'), ck = /sharing_sid=abc/.test(q.headers.cookie || '');
        if (u.pathname === '/sharing/CODE1') { s.writeHead(200, { 'set-cookie': 'sharing_sid=abc; path=/' }); return s.end('<html></html>'); }
        const fin = prm => { if (!ck) return s.end(JSON.stringify({ success: false, error: { code: 101 } })); const api = prm.get('api');
          if (api === 'SYNO.FolderSharing.List') { const fl = FS[JSON.parse(prm.get('folder_path'))]; if (!fl) return s.end(JSON.stringify({ success: false, error: { code: 408 } })); return s.end(JSON.stringify({ success: true, data: { total: fl.length, files: fl.map(f => ({ name: f[0], path: JSON.parse(prm.get('folder_path')) + '/' + f[0], isdir: false, additional: { size: 50000, time: { mtime: tsOf(f[1]) } } })) } })); }
          if (api === 'SYNO.FolderSharing.Download') { const p = JSON.parse(prm.get('path'))[0]; s.writeHead(200, { 'content-type': 'application/octet-stream' }); return s.end(/heic/.test(p) ? Buffer.from('non una foto') : big); }
          if (api === 'SYNO.FolderSharing.Thumb') { s.writeHead(200, { 'content-type': 'image/jpeg' }); return s.end(jpg); } s.end('{}'); };
        if (q.method === 'POST') { let b = ''; q.on('data', d => b += d); q.on('end', () => fin(new URLSearchParams(b))); } else fin(u.searchParams); }).listen(3124);
      r = await fetch(B + '/api/nas', { method: 'POST', headers: H, body: JSON.stringify({ url: 'https://gofile.me/x/y', roots: ['/Foto/Tel'] }) }); ok(r.status === 400, 'NAS: un link gofile.me non risolto viene rifiutato con la spiegazione');
      process.env.NODE_TLS = ''; r = await fetch(B + '/api/nas', { method: 'POST', headers: H, body: JSON.stringify({ url: 'http://127.0.0.1:3124/sharing/CODE1', roots: ['/Foto/Tel'] }) });
      const nc = await r.json(); ok(r.ok && nc.roots.length === 1, 'NAS: cartella configurata e raggiunta (' + (nc.error || 'ok') + ')');
      r = await fetch(B + '/api/trips/berlino2019/nas', { headers: H }); const nl = await r.json(); ok(r.ok && nl.total === 3 && nl.days.length === 2 && nl.days[1].n === 2, 'NAS: trovate le 3 foto scattate nei giorni del viaggio, escluse quella di altra data e i file non foto (' + (nl.error || nl.total) + ')');
      r = await fetch(B + '/api/trips/berlino2019/nas', { method: 'POST', headers: H, body: JSON.stringify({ days: ['2019-11-02'] }) }); let nj; for (let i = 0; i < 40; i++) { nj = await (await fetch(B + '/api/trips/berlino2019/nas/job', { headers: H })).json(); if (nj.status !== 'run') break; await sleep(300); }
      ok(nj.status === 'done' && nj.done === 2 && nj.failed === 0, 'NAS: importate le 2 foto della giornata scelta, compresa quella in formato HEIC tramite l\'anteprima del NAS (' + nj.msg + ')');
      r = await fetch(B + '/api/trips/berlino2019/nas', { method: 'POST', headers: H, body: JSON.stringify({ days: ['2019-11-02'] }) }); for (let i = 0; i < 40; i++) { nj = await (await fetch(B + '/api/trips/berlino2019/nas/job', { headers: H })).json(); if (nj.status !== 'run') break; await sleep(300); }
      ok(nj.status === 'done' && nj.done === 0 && nj.skipped === 2, 'NAS: una seconda importazione non duplica le foto');
      r = await fetch(B + '/api/nas/thumb?path=' + encodeURIComponent('/Foto/Tel/2019/11/a.jpg'), { headers: H }); ok(r.ok && r.headers.get('content-type') === 'image/jpeg', 'NAS: anteprime visibili dalla madre'); r = await fetch(B + '/api/nas/thumb?path=x'); ok(r.status === 401, 'NAS: niente anteprime senza PIN');
      fake.close(); }
    ok(errs.length === 0, 'nessun errore JavaScript nella figlia' + (errs.length ? ': ' + errs.join(' ; ') : ''));
    // madre
    const M = await (await br.newContext({ viewport: { width: 900, height: 900 } })).newPage(); M.on('pageerror', e => errs.push('madre: ' + e.message)); M.on('dialog', d => d.accept());
    await M.goto(B); await M.fill('#pin', '1234'); await M.click('text=Entra'); await M.waitForSelector('#dest', { state: 'visible' }); await M.screenshot({ path: '/tmp/shot-madre.png', fullPage: true });
    await M.click('text=Archivio'); await sleep(500); ok((await M.textContent('#arc')).includes('Praga') && (await M.textContent('#arc')).includes('Anna, Bruno, Carla'), 'archivio della madre con il viaggio');
    await M.click('text=Scheda'); await sleep(800); const dt = await M.textContent('#arcDet'); ok(dt.includes('Sabato 5 dicembre') && dt.includes('120') && dt.includes('Consuntivo'), 'scheda di archivio con programma e consuntivo');
    r = await fetch(B + '/api/trips/' + j.slug + '/zip', { headers: H }); ok(r.ok && (await r.arrayBuffer()).byteLength > 100000, 'copia del sito conservata in archivio');
    r = await fetch(B + '/api/trips/' + j.slug + '/zip'); ok(r.status === 401, 'archivio riservato all\'amministratore');
    await M.fill('#mSlug', 'parigi2027'); await M.fill('#mTitle', 'Parigi 2027'); await M.fill('#mStart', '2027-06-17'); await M.fill('#mEnd', '2027-06-20'); await M.fill('#mPeople', 'Rosetta, Concetta'); await M.click('text=Aggiungi all\'archivio'); await sleep(800);
    ok((await M.textContent('#arc')).indexOf('Parigi 2027') < (await M.textContent('#arc')).indexOf('Praga') && (await M.textContent('#arc')).includes('Rosetta'), 'viaggio esterno aggiunto e ordinato per data');
    await M.screenshot({ path: '/tmp/shot-archivio.png', fullPage: true });
    ok(!errs.some(e => e.startsWith('madre')), 'nessun errore JavaScript nella madre');
    await M.click('text=Credenziali'); await sleep(2500); ok((await M.textContent('#arcCred')).includes('carla'), 'nuove credenziali dalla madre');
    await Z.evaluate(() => sync(true)); await sleep(1200); ok((await Z.evaluate(() => syncState)) === 'err', 'le vecchie credenziali non sincronizzano più');
    await A.reload(); await sleep(1500); ok(await A.locator('.pp').count() === 3, 'riapertura senza nuovo login (anche offline)');
    await br.close();
  } catch (e) { console.error(e); process.exitCode = 1; }
  srv.kill();
})();
