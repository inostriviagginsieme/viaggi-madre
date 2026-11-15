// I nostri viaggi insieme: webapp madre. Genera una webapp figlia per ogni viaggio, la pubblica su GitHub + Render,
// tiene l'archivio e fa da archivio condiviso (programma, spese, diario, foto) per i telefoni di ogni gruppo.
const express = require('express'), crypto = require('crypto'), path = require('path');
const { buildTrip } = require('./lib/build'), { makeZip } = require('./lib/zip');
const ai = require('./lib/ai'), gem = require('./lib/gemini'), gh = require('./lib/github'), rnd = require('./lib/render'), sync = require('./lib/sync'), demo = require('./lib/demo'), creds = require('./lib/creds'), archive = require('./lib/archive'), peecho = require('./lib/peecho'), { buildBook } = require('./lib/book');

const app = express();
app.disable('x-powered-by'); app.set('trust proxy', 1);
const publicUrl = req => (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || (req.protocol + '://' + req.get('host'))).replace(/\/$/, '');
const jobs = new Map();
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg' };

// ---- accesso alla madre: PIN di amministrazione ----
const fails = new Map();
function admin(req, res, next) {
  const pin = process.env.ADMIN_PIN;
  if (!pin) return next();
  const ip = req.ip, f = fails.get(ip) || { n: 0, t: 0 };
  if (f.n >= 8 && Date.now() - f.t < 10 * 60000) return res.status(429).json({ error: 'Troppi tentativi: riprova tra dieci minuti.' });
  const a = Buffer.from(crypto.createHash('sha256').update(String(req.get('x-admin-pin') || '')).digest('hex')), b = Buffer.from(crypto.createHash('sha256').update(pin).digest('hex'));
  if (crypto.timingSafeEqual(a, b)) { fails.delete(ip); return next(); }
  fails.set(ip, { n: f.n + 1, t: Date.now() });
  res.status(401).json({ error: 'PIN errato' });
}

app.get('/healthz', (req, res) => res.json({ ok: true }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: 0 }));

app.get('/api/config', admin, (req, res) => res.json({
  pin: !!process.env.ADMIN_PIN, claude: ai.hasClaude(), claudeModel: ai.MODEL(), gemini: gem.hasGemini(), geminiModel: gem.MODEL(), google: !!process.env.GOOGLE_MAPS_KEY,
  peecho: peecho.hasPeecho(), peechoEnv: peecho.ENV(), github: gh.hasGitHub(), owner: gh.OWNER() || '', render: rnd.hasRender(), url: publicUrl(req)
}));

// ---- prova dei collegamenti: una chiamata minima a ogni servizio, per scoprire un problema in dieci secondi e non a metà generazione ----
app.post('/api/selftest', admin, async (req, res) => {
  const out = {}, run = async (k, on, fn) => { if (!on) { out[k] = { ok: null, msg: 'non configurato' }; return; } try { out[k] = { ok: true, msg: await fn() }; } catch (e) { out[k] = { ok: false, msg: String(e.message || e).slice(0, 300) }; } };
  const get = async (url, headers) => { const r = await fetch(url, { headers, signal: AbortSignal.timeout(20000) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(r.status + ' ' + ((j.error && (j.error.message || j.error)) || j.message || j.error_message || '')); return j; };
  await Promise.all([
    run('claude', ai.hasClaude(), async () => { const o = await ai.selfTest(); return 'modello ' + ai.MODEL() + ', risposta ricevuta (' + o.citta + '), consegna in modalità ' + ai.outMode(); }),
    run('gemini', gem.hasGemini(), async () => { const j = await get('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { 'x-goog-api-key': process.env.GEMINI_API_KEY }); const names = (j.models || []).map(m => String(m.name).replace('models/', '')); if (!names.includes(gem.MODEL())) throw new Error('chiave valida, ma il modello ' + gem.MODEL() + ' non è tra quelli disponibili. Modelli immagine disponibili: ' + (names.filter(n => /image/.test(n)).join(', ') || 'nessuno')); return 'chiave valida, modello ' + gem.MODEL() + ' disponibile (la generazione di un\'immagine non è provata qui)'; }),
    run('google', !!process.env.GOOGLE_MAPS_KEY, async () => { const j = await get('https://maps.googleapis.com/maps/api/geocode/json?address=Firenze&key=' + process.env.GOOGLE_MAPS_KEY); if (j.status !== 'OK') throw new Error(j.status + ' ' + (j.error_message || '')); return 'Geocoding attivo (Routes si prova con un viaggio in auto)'; }),
    run('github', gh.hasGitHub(), async () => { const j = await get('https://api.github.com/user', { authorization: 'Bearer ' + process.env.GITHUB_TOKEN, 'user-agent': 'viaggi-madre' }); return 'token valido, utente ' + j.login + (j.login.toLowerCase() === gh.OWNER().toLowerCase() ? '' : ' (GITHUB_OWNER è ' + gh.OWNER() + ': deve essere un\'organizzazione di cui fai parte)'); }),
    run('render', rnd.hasRender(), async () => { const j = await get('https://api.render.com/v1/owners?limit=5', { authorization: 'Bearer ' + process.env.RENDER_API_KEY }); const o = (j[0] && (j[0].owner || j[0])) || {}; if (!o.id) throw new Error('nessun workspace'); return 'chiave valida, workspace ' + (o.name || o.id); })
  ]);
  res.json(out);
});

// ---- generazione: anteprima prima, pubblicazione poi ----
app.post('/api/trips', admin, express.json({ limit: '40mb' }), (req, res) => {
  const id = crypto.randomBytes(8).toString('hex'), job = { id, status: 'run', log: [], created: Date.now() };
  jobs.set(id, job);
  for (const [k, j] of jobs) if (Date.now() - j.created > 6 * 3600000) jobs.delete(k);
  const log = m => job.log.push(m);
  (async () => {
    try {
      const r = await buildTrip(req.body, { log, syncApi: publicUrl(req), taken: async s => (gh.hasGitHub() ? gh.repoExists(s) : [...jobs.values()].some(j => j.published && j.slug === s)) });
      Object.assign(job, { request: r.inp, files: r.files, trip: r.trip, slug: r.trip.slug, creds: r.creds, users: r.users, status: 'preview' });
      if (!gh.hasGitHub()) { await sync.initTrip(job.slug, r.users); job.url = '/preview/' + id + '/'; await archive.saveTrip(job); log('Viaggio registrato nell\'archivio locale.'); }
      log('Anteprima pronta.');
    } catch (e) { job.status = 'error'; job.error = e.message; log('Errore: ' + e.message); }
  })();
  res.json({ id });
});
const view = j => ({ id: j.id, status: j.status, log: j.log, error: j.error, slug: j.slug, creds: j.creds, title: j.trip && j.trip.title, days: j.trip && j.trip.days.length, stops: j.trip && Object.keys(j.trip.poi).length, url: j.url, repo: j.repo, dashboard: j.dashboard, warn: j.warn });
app.get('/api/jobs/:id', admin, (req, res) => { const j = jobs.get(req.params.id); if (!j) return res.status(404).json({ error: 'Lavoro non trovato (il server è stato riavviato): rigenera il viaggio.' }); res.json(view(j)); });
app.get('/api/jobs/:id/zip', (req, res) => { const j = jobs.get(req.params.id); if (!j || !j.files) return res.status(404).send('Non trovato'); res.set({ 'content-type': 'application/zip', 'content-disposition': 'attachment; filename="' + j.slug + '.zip"' }).send(makeZip(j.files.map(f => ({ path: j.slug + '/' + f.path, data: f.data })))); });
app.get('/preview/:id/*', (req, res) => {
  const j = jobs.get(req.params.id); if (!j || !j.files) return res.status(404).send('Anteprima scaduta');
  const p = 'pwa/' + (req.params[0] || 'index.html'), f = j.files.find(x => x.path === p);
  if (!f) return res.status(404).send('Non trovato');
  res.set('content-type', MIME[path.extname(p)] || 'application/octet-stream').set('cache-control', 'no-store').send(Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data));
});
app.post('/api/jobs/:id/publish', admin, (req, res) => {
  const j = jobs.get(req.params.id);
  if (!j || !j.files) return res.status(404).json({ error: 'Anteprima scaduta: rigenera il viaggio.' });
  if (!gh.hasGitHub()) return res.status(400).json({ error: 'Manca la configurazione GitHub (GITHUB_TOKEN e GITHUB_OWNER): scarica lo zip e pubblicalo a mano.' });
  if (j.status === 'publishing' || j.published) return res.json(view(j));
  j.status = 'publishing'; const log = m => j.log.push(m);
  (async () => {
    try {
      const t = j.trip, desc = `${t.title} · ${t.dateLabel} · ${t.people.map(p => p.name).join(', ')}`.slice(0, 340);
      log('Creo il repository GitHub ' + gh.OWNER() + '/' + j.slug + '…');
      const repo = await gh.createRepo(j.slug, desc); j.repo = repo.html_url;
      await gh.commitFiles(j.slug, 'main', j.files, 'Webapp del viaggio ' + t.title);
      await gh.ensureBranch(j.slug, 'data', 'main');
      await sync.initTrip(j.slug, j.users);
      if (rnd.hasRender()) {
        log('Creo il sito su Render…');
        try { const s = await rnd.createStaticSite(j.slug, repo.html_url); j.url = s.url; j.dashboard = s.dashboard; await gh.updateRepo(j.slug, { homepage: s.url }).catch(() => {}); log('Sito creato: il primo deploy richiede uno o due minuti.'); }
        catch (e) { j.warn = 'Repository creato, sito Render non creato (' + e.message + '). Crealo da Render: New, Static Site, repository ' + j.slug + ', publish directory pwa. Verifica che Render abbia accesso al repository.'; log(j.warn); }
      } else { j.warn = 'Repository creato. Manca RENDER_API_KEY: crea il sito da Render (New, Static Site, repository ' + j.slug + ', publish directory pwa).'; log(j.warn); }
      try { await archive.saveTrip(j); log('Viaggio registrato nell\'archivio (' + gh.OWNER() + '/' + archive.REPO() + ').'); } catch (e) { j.warn = (j.warn ? j.warn + ' ' : '') + 'Archivio non aggiornato: ' + e.message; log(j.warn); }
      j.published = true; j.status = 'done'; log('Fatto.');
    } catch (e) { j.status = 'preview'; j.error = e.message; log('Pubblicazione non riuscita: ' + e.message); }
  })();
  res.json(view(j));
});

// ---- archivio permanente di tutti i viaggi ----
app.get('/api/trips', admin, async (req, res) => { try { res.json({ trips: await archive.index(), permanent: gh.hasGitHub(), where: gh.hasGitHub() ? gh.OWNER() + '/' + archive.REPO() : 'cartella locale' }); } catch (e) { res.status(502).json({ error: e.message }); } });
app.post('/api/trips/manual', admin, express.json({ limit: '100kb' }), async (req, res) => {
  try {
    const b = req.body || {}, s = (v, n) => String(v == null ? '' : v).trim().slice(0, n), slug = s(b.slug, 40).toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!slug || !s(b.title, 60) || !/^\d{4}-\d{2}-\d{2}$/.test(s(b.start, 10))) return res.status(400).json({ error: 'Servono nome breve, titolo e data di inizio.' });
    if ((await archive.index()).some(e => e.slug === slug && e.generated)) return res.status(400).json({ error: 'Esiste già un viaggio generato con questo nome.' });
    const url = /^https?:\/\//i.test(s(b.url, 300)) ? s(b.url, 300) : '';
    res.json(await archive.addManual({ slug, title: s(b.title, 60), dateLabel: s(b.dateLabel, 60) || s(b.start, 10), start: s(b.start, 10), end: s(b.end, 10) || s(b.start, 10), dest: s(b.dest, 80), origin: '', mode: s(b.mode, 30), people: s(b.people, 300).split(',').map(x => x.trim()).filter(Boolean), url, repo: '' }));
  } catch (e) { res.status(502).json({ error: e.message }); }
});
app.get('/api/trips/:slug', admin, async (req, res) => {
  try {
    if (!sync.okSlug(req.params.slug)) return res.status(400).json({ error: 'Nome non valido' });
    const t = await archive.detail(req.params.slug); if (!t) return res.status(404).json({ error: 'Scheda non presente in archivio' });
    const N = t.people.length, budget = (t.budget || []).reduce((a, b) => a + b.amt * (b.per === 'persona' ? N : 1), 0);
    let live = null; try { live = await sync.stats(req.params.slug); } catch (e) {}
    res.json({ title: t.title, dateLabel: t.dateLabel, dest: t.dest, origin: t.origin, people: t.people.map(p => ({ name: p.name, face: p.face })), transport: { modeLabel: t.transport.modeLabel, summary: t.transport.summary, booked: t.transport.booked }, lodging: t.lodging, program: t.program, refs: t.refs,
      days: t.days.map(d => ({ label: d.dow + ' ' + d.n + ' ' + d.mon, title: d.title, stops: d.items.map(i => t.poi[i] && t.poi[i].n).filter(Boolean) })), budget, gen: t.gen, live });
  } catch (e) { res.status(502).json({ error: e.message }); }
});
app.get('/api/trips/:slug/zip', admin, async (req, res) => { try { const z = sync.okSlug(req.params.slug) && await archive.zip(req.params.slug); if (!z) return res.status(404).json({ error: 'Copia del sito non presente' }); res.set('content-type', 'application/zip').send(z); } catch (e) { res.status(502).json({ error: e.message }); } });

// ---- nuove credenziali per un viaggio già creato (le vecchie smettono di valere) ----
app.post('/api/trips/:slug/credentials', admin, async (req, res) => {
  try {
    const slug = req.params.slug; if (!sync.okSlug(slug)) return res.status(400).json({ error: 'Indirizzo non valido' });
    const job = [...jobs.values()].find(j => j.slug === slug && j.files), file = n => { const f = job && job.files.find(x => x.path === 'pwa/' + n); return f ? Buffer.from(f.data) : null; };
    const auth = gh.hasGitHub() ? await gh.getFile(slug, 'pwa/auth.json', 'main') : file('auth.json'), enc = gh.hasGitHub() ? await gh.getFile(slug, 'pwa/trip.enc', 'main') : file('trip.enc');
    if (!auth || !enc) return res.status(404).json({ error: 'Viaggio non trovato' });
    const r = creds.reissue(JSON.parse(auth.toString()), enc), data = JSON.stringify(r.auth);
    if (gh.hasGitHub()) await gh.commitFiles(slug, 'main', [{ path: 'pwa/auth.json', data }], 'Nuove credenziali dei partecipanti');
    else job.files.find(x => x.path === 'pwa/auth.json').data = data;
    await sync.initTrip(slug, r.meta);
    res.json({ creds: r.creds });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ---- dati condivisi e testi del fotolibro: chiamati dalle webapp figlie ----
const cors = (req, res, next) => { res.set({ 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type,x-trip-token', 'access-control-allow-methods': 'GET,POST,PUT,OPTIONS', 'access-control-max-age': '86400' }); if (req.method === 'OPTIONS') return res.sendStatus(204); next(); };
const trip = async (req, res, next) => { try { const t = await sync.auth(req.params.slug, req.get('x-trip-token')); if (!t) return res.status(401).json({ error: 'Accesso non valido: entra di nuovo con le tue credenziali' }); req.trip = t; next(); } catch (e) { res.status(502).json({ error: e.message }); } };
app.use(['/api/sync', '/api/book'], cors);
app.post('/api/sync/:slug', express.json({ limit: '2mb' }), trip, async (req, res) => { try { res.json(await sync.merge(req.params.slug, req.trip, +req.body.since || 0, req.body.changes)); } catch (e) { res.status(502).json({ error: e.message }); } });
app.put('/api/sync/:slug/photo/:id', express.raw({ type: 'image/jpeg', limit: '6mb' }), trip, async (req, res) => {
  if (!sync.okId(req.params.id) || !Buffer.isBuffer(req.body) || req.body.length < 100 || req.body[0] !== 0xFF || req.body[1] !== 0xD8) return res.status(400).json({ error: 'Foto non valida' });
  try { await sync.putPhoto(req.params.slug, req.params.id, req.body); res.json({ ok: true }); } catch (e) { res.status(502).json({ error: e.message }); }
});
app.get('/api/sync/:slug/photo/:id', trip, async (req, res) => {
  if (!sync.okId(req.params.id)) return res.status(400).end();
  try { const b = await sync.getPhoto(req.params.slug, req.params.id); if (!b) return res.status(404).end(); res.set({ 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=31536000' }).send(b); } catch (e) { res.status(502).end(); }
});
const bookCount = new Map();
app.post('/api/book/:slug', express.json({ limit: '1mb' }), trip, async (req, res) => {
  const k = req.params.slug + ':' + new Date().toISOString().slice(0, 10), n = bookCount.get(k) || 0;
  if (n >= 12) return res.status(429).json({ error: 'Limite giornaliero di generazioni raggiunto' });
  bookCount.set(k, n + 1);
  try {
    const b = req.body || {}, s = (v, m) => String(v == null ? '' : v).slice(0, m);
    const t = { title: s(b.trip && b.trip.title, 60), dest: { name: s(b.trip && b.trip.dest && b.trip.dest.name, 80) }, dates: { start: s(b.trip && b.trip.dates && b.trip.dates.start, 10), end: s(b.trip && b.trip.dates && b.trip.dates.end, 10) }, people: ((b.trip && b.trip.people) || []).slice(0, 12).map(p => ({ name: s(p.name, 40) })) };
    const body = { days: (b.days || []).slice(0, 21).map(d => ({ date: s(d.date, 10), title: s(d.title, 140), stops: (d.stops || []).slice(0, 16).map(x => s(x, 100)), diary: (d.diary || []).slice(0, 12).map(x => s(x, 800)), caps: (d.caps || []).slice(0, 40).map(x => s(x, 160)) })) };
    const book = ai.hasClaude() ? await ai.genBook(t, body) : demo.book(t, body);
    res.json({ book: { title: s(book.title, 80), dedication: s(book.dedication, 600), chapters: (book.chapters || []).slice(0, 21).map(c => ({ title: s(c.title, 120), text: s(c.text, 900) })), phrases: (book.phrases || []).slice(0, 10).map(x => s(x, 200)), closing: s(book.closing, 400) } });
  } catch (e) { res.status(502).json({ error: e.message }); }
});

// ---- fotolibro: impaginazione (partecipanti) e stampa con Peecho (solo amministratore) ----
const sigKey = () => process.env.CRED_SECRET || process.env.ADMIN_PIN || 'sviluppo';
const pdfSig = slug => crypto.createHmac('sha256', sigKey()).update('libro:' + slug).digest('hex').slice(0, 40);
const pdfUrl = (req, slug) => publicUrl(req) + '/libro/' + slug + '/' + pdfSig(slug) + '.pdf';
const pdfCount = new Map();
app.post('/api/book/:slug/pdf', express.json({ limit: '10kb' }), trip, async (req, res) => {
  const slug = req.params.slug, k = slug + ':' + new Date().toISOString().slice(0, 10), n = pdfCount.get(k) || 0;
  if (n >= 15) return res.status(429).json({ error: 'Limite giornaliero di impaginazioni raggiunto' });
  pdfCount.set(k, n + 1);
  try {
    const t = await archive.detail(slug); if (!t) return res.status(404).json({ error: 'Scheda del viaggio non presente in archivio' });
    t._icon = await archive.read(slug + '/icon.png');
    const r = await buildBook(t, req.trip.state.kv, id => sync.getPhoto(slug, id));
    await sync.putFile(slug, 'book/libro.pdf', r.pdf);
    const meta = { pages: r.pages, photos: r.photos, mb: Math.round(r.pdf.length / 104857.6) / 10, at: Date.now(), by: req.trip.user };
    await sync.merge(slug, req.trip, 0, { bookpdf: { v: meta, ts: Date.now() } });
    res.json(Object.assign({ url: pdfUrl(req, slug), missing: r.missing }, meta));
  } catch (e) { res.status(502).json({ error: e.message }); }
});
app.get('/libro/:slug/:sig.pdf', async (req, res) => {
  try {
    const slug = req.params.slug, a = Buffer.from(String(req.params.sig)), b = Buffer.from(sync.okSlug(slug) ? pdfSig(slug) : '');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(404).send('Non trovato');
    const f = await sync.getFile(slug, 'book/libro.pdf'); if (!f) return res.status(404).send('Fotolibro non ancora impaginato');
    res.set({ 'content-type': 'application/pdf', 'content-disposition': 'inline; filename="' + slug + '_fotolibro.pdf"', 'cache-control': 'no-store' }).send(f);
  } catch (e) { res.status(502).send('Errore'); }
});
const printFile = slug => slug + '/stampa.json';
const priceView = d => { const p = d.order_price_data || {}; return { state: d.order_state, product: p.total_wholesale_product_price_ex_taxes, shipping: p.total_wholesale_shipping_ex_taxes, exTax: p.total_wholesale_price_ex_taxes, total: p.total_wholesale_price_inc_taxes, currency: d.currency, tracking: d.tracking_url || '', lab: (d.fulfilment_location || {}).country_code || '' }; };
app.get('/api/trips/:slug/print', admin, async (req, res) => {
  try {
    const slug = req.params.slug; if (!sync.okSlug(slug)) return res.status(400).json({ error: 'Nome non valido' });
    const has = !!(await sync.getFile(slug, 'book/libro.pdf').catch(() => null)), o = await archive.read(printFile(slug));
    let order = o ? JSON.parse(o.toString()) : null;
    if (order && peecho.hasPeecho()) { try { order.price = priceView(await peecho.details(order.order_id)); await archive.write(printFile(slug), JSON.stringify(order)); } catch (e) { order.warn = e.message; } }
    res.json({ pdf: has ? pdfUrl(req, slug) : '', order, peecho: peecho.hasPeecho(), env: peecho.ENV() });
  } catch (e) { res.status(502).json({ error: e.message }); }
});
app.post('/api/trips/:slug/print/order', admin, express.json({ limit: '20kb' }), async (req, res) => {
  try {
    const slug = req.params.slug, b = req.body || {}, s = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
    if (!sync.okSlug(slug)) return res.status(400).json({ error: 'Nome non valido' });
    if (!peecho.hasPeecho()) return res.status(400).json({ error: 'Mancano PEECHO_API_KEY e PEECHO_SECRET nelle variabili d\'ambiente.' });
    const t = await archive.detail(slug), st = await sync.getFile(slug, 'state.json'), kv = st ? JSON.parse(st.toString()).kv : {};
    const meta = kv.bookpdf && kv.bookpdf.v; if (!t || !meta) return res.status(400).json({ error: 'Il fotolibro non è ancora stato impaginato dalla webapp del viaggio.' });
    const address = { first_name: s(b.first_name, 60), last_name: s(b.last_name, 60), address_line_1: s(b.address_line_1, 120), address_line_2: s(b.address_line_2, 120), zip_code: s(b.zip_code, 12), city: s(b.city, 60), country_code: (s(b.country_code, 2) || 'IT').toUpperCase() };
    if (!address.first_name || !address.last_name || !address.address_line_1 || !address.zip_code || !address.city || !/^\S+@\S+\.\S+$/.test(s(b.email, 120))) return res.status(400).json({ error: 'Servono nome, cognome, indirizzo, CAP, città ed email.' });
    const quantity = Math.max(1, Math.min(20, parseInt(b.quantity, 10) || 1));
    const order_id = await peecho.createOrder({ reference: slug + '-' + Date.now().toString(36), pdfUrl: pdfUrl(req, slug), pages: meta.pages, title: t.title, address, email: s(b.email, 120), quantity });
    const order = { order_id, env: peecho.ENV(), pages: meta.pages, quantity, address, created: new Date().toISOString(), paid: false, price: priceView(await peecho.details(order_id)) };
    await archive.write(printFile(slug), JSON.stringify(order));
    res.json({ order });
  } catch (e) { res.status(502).json({ error: e.message }); }
});
app.post('/api/trips/:slug/print/pay', admin, express.json({ limit: '5kb' }), async (req, res) => {
  try {
    const slug = req.params.slug, o = sync.okSlug(slug) && await archive.read(printFile(slug)); if (!o) return res.status(404).json({ error: 'Nessun ordine da approvare' });
    const order = JSON.parse(o.toString());
    if (order.paid) return res.status(409).json({ error: 'Ordine già approvato e pagato' });
    if (+req.body.order_id !== order.order_id) return res.status(400).json({ error: 'L\'ordine da approvare non corrisponde a quello in archivio' });
    const r = await peecho.pay(order.order_id);
    order.paid = true; order.paidAt = new Date().toISOString(); order.state = r.order_state;
    try { order.price = priceView(await peecho.details(order.order_id)); } catch (e) { /* lo stato si rilegge alla prossima apertura */ }
    await archive.write(printFile(slug), JSON.stringify(order));
    res.json({ order });
  } catch (e) { res.status(502).json({ error: e.message }); }
});

app.use((err, req, res, next) => { res.status(err.status || 500).json({ error: err.type === 'entity.too.large' ? 'Dati troppo grandi' : 'Errore del server' }); });
const port = process.env.PORT || 3000;
app.listen(port, () => console.log('I nostri viaggi insieme: in ascolto sulla porta ' + port));
