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
  const srv = spawn('node', ['server.js'], { cwd: path.join(__dirname, '..'), env: Object.assign({}, process.env, { PORT: '3123', ADMIN_PIN: '1234', DATA_DIR: '/tmp/viaggi-data-' + Date.now(), ANTHROPIC_API_KEY: '', GITHUB_TOKEN: '', GEMINI_API_KEY: '', GOOGLE_MAPS_KEY: '', PEECHO_API_KEY: '', DEMO_GEO: '50.0755,14.4378' }), stdio: 'inherit' });
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
    await A.click('#nav button[data-t="s-foto"]'); await sleep(3600);
    await A.click('#pdfBtn'); await sleep(3500); const pm = await A.evaluate(() => g('bookpdf')); ok(pm && pm.pages >= 24 && pm.pages % 2 === 0 && pm.photos === 1, 'fotolibro impaginato: ' + (pm && pm.pages) + ' pagine, ' + (pm && pm.photos) + ' foto');
    const purl = await A.evaluate(() => S.pdfUrl); r = await fetch(purl); const pdf = Buffer.from(await r.arrayBuffer()); ok(r.ok && pdf.subarray(0, 5).toString() === '%PDF-', 'PDF del fotolibro scaricabile dal link firmato'); require('fs').writeFileSync('/tmp/libro.pdf', pdf);
    r = await fetch(purl.replace(/[0-9a-f]{40}/, 'a'.repeat(40))); ok(r.status === 404, 'PDF non raggiungibile senza firma');
    r = await fetch(B + '/api/trips/' + j.slug + '/print', { headers: H }); const pj = await r.json(); ok(pj.pdf === purl && pj.peecho === false, 'la madre vede il fotolibro; stampa spenta senza chiavi Peecho');
    r = await fetch(B + '/api/trips/' + j.slug + '/print/order', { method: 'POST', headers: H, body: '{}' }); ok(r.status === 400, 'ordine di stampa rifiutato senza chiavi');
    for (const [t, f] of [['s-gruppo', 'gruppo'], ['s-meta', 'meta'], ['s-arrivo', 'arrivo'], ['s-viaggio', 'viaggio'], ['s-conti', 'conti'], ['s-foto', 'foto'], ['s-altro', 'altro']]) { await A.click(`#nav button[data-t="${t}"]`); if (t === 's-viaggio') await A.click('#vChips .chip >> nth=0'); await sleep(300); await A.screenshot({ path: '/tmp/shot-' + f + '.png' }); }
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
