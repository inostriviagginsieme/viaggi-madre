// I nostri viaggi insieme: webapp madre. Genera una webapp figlia per ogni viaggio, la pubblica su GitHub + Render,
// tiene l'archivio e fa da archivio condiviso (programma, spese, diario, foto) per i telefoni di ogni gruppo.
const express = require('express'), crypto = require('crypto'), path = require('path');
const { buildTrip, normItem, str: S_, hhmm: HM, isDate } = require('./lib/build'), geoLib = require('./lib/geo'), { makeZip } = require('./lib/zip');
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
  peecho: peecho.hasPeecho(), peechoEnv: peecho.ENV(), github: gh.hasGitHub(), owner: gh.OWNER() || '', render: rnd.hasRender(), url: publicUrl(req), mail: require('./lib/mail').hasMail(), mailUser: process.env.GMAIL_USER || ''
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
    run('luoghi', !!process.env.GOOGLE_MAPS_KEY, async () => { const b = await geoLib.googlePlacePhoto('Firenze, Italia'); return b ? 'Places attivo: foto dei luoghi da Google' : 'Places risponde ma senza foto'; }),
    run('posta', require('./lib/mail').hasMail(), () => require('./lib/mail').check()),
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
      Object.assign(job, { request: r.inp, files: r.files, trip: r.trip, slug: r.trip.slug, cover: r.cover, creds: r.creds, users: r.users, status: 'preview' });
      if (!gh.hasGitHub()) { await sync.initTrip(job.slug, r.users); job.url = '/preview/' + id + '/'; await archive.saveTrip(job); log('Viaggio registrato nell\'archivio locale.'); }
      log('Anteprima pronta.');
    } catch (e) { job.status = 'error'; job.error = e.message; log('Errore: ' + e.message); }
  })();
  res.json({ id });
});
const view = j => ({ id: j.id, status: j.status, log: j.log, error: j.error, slug: j.slug, creds: j.creds, skipped: j.skipped, title: j.trip ? j.trip.title : j.title, days: j.trip ? j.trip.days.length : j.nDays, stops: j.trip ? Object.keys(j.trip.poi).length : j.nStops, url: j.url, repo: j.repo, dashboard: j.dashboard, warn: j.warn });
app.get('/api/jobs/:id', admin, (req, res) => { const j = jobs.get(req.params.id); if (!j) return res.status(404).json({ error: 'Lavoro non trovato (il server è stato riavviato): rigenera il viaggio.' }); res.json(view(j)); });
app.get('/api/jobs/:id/zip', (req, res) => { const j = jobs.get(req.params.id); if (!j || !j.files) return res.status(404).send('Non trovato'); res.set({ 'content-type': 'application/zip', 'content-disposition': 'attachment; filename="' + j.slug + '.zip"' }).send(makeZip(j.files.map(f => ({ path: j.slug + '/' + f.path, data: f.data })))); });
app.get('/preview/:id/*', (req, res) => {
  const j = jobs.get(req.params.id); if (!j || !j.files) return res.status(404).send('Anteprima scaduta');
  const p = 'pwa/' + (req.params[0] || 'index.html'), f = j.files.find(x => x.path === p);
  if (!f) return res.status(404).send('Non trovato');
  res.set('content-type', MIME[path.extname(p)] || 'application/octet-stream').set('cache-control', 'no-store').send(Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data));
});
async function publishJob(j) {
  const log = m => j.log.push(m);
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
}
app.post('/api/jobs/:id/publish', admin, (req, res) => {
  const j = jobs.get(req.params.id);
  if (!j || !j.files) return res.status(404).json({ error: 'Anteprima scaduta: rigenera il viaggio.' });
  if (!gh.hasGitHub()) return res.status(400).json({ error: 'Manca la configurazione GitHub (GITHUB_TOKEN e GITHUB_OWNER): scarica lo zip e pubblicalo a mano.' });
  if (j.status === 'publishing' || j.published) return res.json(view(j));
  j.status = 'publishing'; publishJob(j);
  res.json(view(j));
});

// ---- importazione dei viaggi passati: una cartella di documenti diventa un sito ricordo, generato e pubblicato senza passare dall'anteprima ----
app.post('/api/import', admin, express.json({ limit: '60mb' }), (req, res) => {
  const b = req.body || {}, id = crypto.randomBytes(8).toString('hex'), job = { id, status: 'run', log: [], created: Date.now(), imported: true };
  jobs.set(id, job); const log = m => job.log.push(m);
  (async () => {
    try {
      const people = (b.people || []).map(x => S_(x, 40)).filter(Boolean).slice(0, 8); if (!people.length) throw new Error('Mancano i viaggiatori abituali');
      const files = (b.files || []).filter(f => f && /^data:(application\/pdf|image\/(jpeg|png|webp));base64,/.test(String(f.data || '')) && f.data.length < 11e6).slice(0, 8);
      const item = { folder: S_(b.folder, 80), year: parseInt(b.year, 10) || 0, name: S_(b.name, 80), notes: String(b.notes || '').slice(0, 12000), people };
      if (!item.folder || !item.name) throw new Error('Elemento del pacchetto non valido');
      if ((await archive.index()).some(t => t.folder === item.folder)) { job.status = 'done'; job.skipped = true; log('Già in archivio: salto.'); return; }
      log('Claude inquadra il viaggio dai documenti (' + files.length + ' file)…');
      const fr = ai.hasClaude() ? await ai.genFrame(item, files.map(f => ({ name: S_(f.name, 80), type: f.data.slice(5, f.data.indexOf(';')), b64: f.data.slice(f.data.indexOf(',') + 1) }))) : demo.frame(item);
      if (!fr || fr.ok === false || !isDate(fr.start) || !isDate(fr.end)) throw new Error('Date del viaggio non ricavabili dai documenti' + (fr && S_(fr.reason, 200) ? ': ' + S_(fr.reason, 200) : '') + '. Va creato a mano dal modulo Nuovo viaggio.');
      const start = fr.start <= fr.end ? fr.start : fr.end, end = fr.start <= fr.end ? fr.end : fr.start, past = end < new Date().toISOString().slice(0, 10);
      const names = (Array.isArray(fr.people) ? fr.people : []).map(x => S_(x, 40).split(' ')[0]).filter(x => /^[A-Za-zÀ-ÿ'-]{2,}$/.test(x)).filter((x, i, a) => a.indexOf(x) === i).slice(0, 10);
      log('Inquadrato: ' + (S_(fr.dest, 80) || item.name) + ', dal ' + start + ' al ' + end + ', ' + (names.length ? names : people).join(', ') + (past ? '' : '. Viaggio non ancora fatto: sito completo, non ricordo') + '.');
      const r = await buildTrip({ dest: S_(fr.dest, 80) || item.name, origin: S_(fr.origin, 80) || 'Firenze', start, end, mode: fr.mode, people: (names.length ? names : people).map(n => ({ name: n })), lodging: S_(fr.lodging, 200),
        program: [S_(fr.notes, 1500), item.notes].filter(Boolean).join('\n\n').slice(0, 6000), bookings: files, past, familyPass: b.familyPass, folder: item.folder },
        { log, syncApi: publicUrl(req), taken: async s => (gh.hasGitHub() ? gh.repoExists(s) : [...jobs.values()].some(j => j !== job && j.slug === s)) });
      Object.assign(job, { request: r.inp, files: r.files, trip: r.trip, slug: r.trip.slug, cover: r.cover, creds: r.creds, users: r.users, status: 'preview' });
      if (!gh.hasGitHub()) { await sync.initTrip(job.slug, r.users); job.url = '/preview/' + id + '/'; await archive.saveTrip(job); job.status = 'done'; log('Viaggio registrato nell\'archivio locale.'); return; }
      job.status = 'publishing'; await publishJob(job);
      if (job.published) { job.title = job.trip.title; job.nDays = job.trip.days.length; job.nStops = Object.keys(job.trip.poi).length; job.files = null; job.trip = null; job.request = null; job.cover = null; } // 36 viaggi in fila: la memoria va liberata
    } catch (e) { job.status = 'error'; job.error = e.message; log('Errore: ' + e.message); }
  })();
  res.json({ id });
});

// ---- archivio permanente di tutti i viaggi ----
app.get('/api/trips', admin, async (req, res) => { try { res.json({ trips: await archive.index(), permanent: gh.hasGitHub(), where: gh.hasGitHub() ? gh.OWNER() + '/' + archive.REPO() : 'cartella locale' }); } catch (e) { res.status(502).json({ error: e.message }); } });
// Porta una figlia già pubblicata all'ultima versione dell'app senza rigenerare il viaggio: niente Claude, nessun dato toccato.
app.post('/api/trips/:slug/update', admin, async (req, res) => {
  const slug = req.params.slug;
  if (!sync.okSlug(slug)) return res.status(400).json({ error: 'Viaggio non valido' });
  if (!gh.hasGitHub()) return res.status(400).json({ error: 'Manca la configurazione GitHub: l\'aggiornamento si fa solo sui viaggi pubblicati.' });
  try {
    const [ix, sw] = await Promise.all([gh.getFile(slug, 'pwa/index.html', 'main'), gh.getFile(slug, 'pwa/sw.js', 'main')]);
    if (!ix || !sw) return res.status(404).json({ error: 'Repository del viaggio non trovato o senza sito.' });
    const files = require('./lib/build').updateFiles(slug, ix.toString(), sw.toString());
    await gh.commitFiles(slug, 'main', files, 'Aggiornamento dell\'app alla versione ' + require('./package.json').version);
    res.json({ ok: true, version: require('./package.json').version });
  } catch (e) { res.status(502).json({ error: e.message }); }
});
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
const trip = async (req, res, next) => { try { mailTick(); } catch (e) {} try { const t = await sync.auth(req.params.slug, req.get('x-trip-token')); if (!t) return res.status(401).json({ error: 'Accesso non valido: entra di nuovo con le tue credenziali' }); req.trip = t; next(); } catch (e) { res.status(502).json({ error: e.message }); } };
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
// Documenti del gruppo: arrivano già cifrati dal telefono con la chiave del viaggio, la madre li deposita senza poterli leggere.
app.put('/api/sync/:slug/doc/:id', express.raw({ type: 'application/octet-stream', limit: '11mb' }), trip, async (req, res) => {
  if (!sync.okId(req.params.id) || !Buffer.isBuffer(req.body) || req.body.length < 29) return res.status(400).json({ error: 'Documento non valido' });
  try { await sync.putDoc(req.params.slug, req.params.id, req.body); res.json({ ok: true }); } catch (e) { res.status(502).json({ error: e.message }); }
});
app.get('/api/sync/:slug/doc/:id', trip, async (req, res) => {
  if (!sync.okId(req.params.id)) return res.status(400).end();
  try { const b = await sync.getDoc(req.params.slug, req.params.id); if (!b) return res.status(404).end(); res.set({ 'content-type': 'application/octet-stream', 'cache-control': 'private, max-age=31536000' }).send(b); } catch (e) { res.status(502).end(); }
});
// Foto del luogo per l'elenco dell'archivio. Quelle di Google restano solo in memoria (le condizioni di Google non permettono di conservarle); quelle di Wikipedia si salvano nell'archivio.
const placeCache = new Map();
app.get('/api/trips/:slug/place', admin, async (req, res) => {
  try { const slug = req.params.slug; if (!sync.okSlug(slug)) return res.status(400).end();
    let p = placeCache.get(slug);
    if (!p) { const t = (await archive.index()).find(x => x.slug === slug); if (!t) return res.status(404).end();
      const saved = process.env.GOOGLE_MAPS_KEY ? null : await archive.read(slug + '/luogo.webp');
      p = saved ? { src: 'wikipedia', data: saved } : await geoLib.placePhoto(t.dest || t.title);
      if (p && p.src === 'wikipedia' && !saved) archive.write(slug + '/luogo.webp', p.data).catch(() => {});
      placeCache.set(slug, p || { none: true }); }
    if (!p || p.none) return res.status(404).end();
    res.set({ 'content-type': 'image/webp', 'cache-control': 'private, max-age=604800', 'x-foto': p.src }).send(p.data);
  } catch (e) { res.status(502).end(); }
});

// ---- foto del NAS ----
const nas = require('./lib/nas');
app.get('/api/nas', admin, async (req, res) => { try { res.json(await nas.config()); } catch (e) { res.status(502).json({ error: e.message }); } });
app.post('/api/nas', admin, express.json({ limit: '10kb' }), async (req, res) => { try { const c = await nas.setConfig(req.body.url, req.body.roots); if (c.url) await nas.list(c.roots[0] || '/').catch(e => { throw new Error('Indirizzo salvato, ma la prima cartella non si apre: ' + e.message); }); res.json(c); } catch (e) { res.status(400).json({ error: e.message }); } });
app.get('/api/trips/:slug/nas', admin, async (req, res) => {
  try { const t = await archive.detail(req.params.slug); if (!t) return res.status(404).json({ error: 'Viaggio non trovato' });
    const all = await nas.candidates(t.dates.start, t.dates.end), kv = (await sync.state(t.slug)).kv, days = {};
    all.forEach(f => { const d = days[f.day] = days[f.day] || { date: f.day, n: 0, have: 0, sample: [] }; d.n++; if (kv['ph.' + f.id] && kv['ph.' + f.id].v) d.have++; if (d.sample.length < 6) d.sample.push(f.path); });
    res.json({ total: all.length, days: Object.keys(days).sort().map(k => days[k]), job: nas.job(t.slug) });
  } catch (e) { res.status(502).json({ error: e.message }); }
});
app.post('/api/trips/:slug/nas', admin, express.json({ limit: '20kb' }), async (req, res) => {
  try { const t = await archive.detail(req.params.slug); if (!t) return res.status(404).json({ error: 'Viaggio non trovato' }); const j = nas.job(t.slug); if (j && j.status === 'run') return res.json(j);
    res.json(nas.importPhotos(t, Array.isArray(req.body.days) ? req.body.days.map(String) : null, 400)); } catch (e) { res.status(502).json({ error: e.message }); }
});
app.get('/api/trips/:slug/nas/job', admin, (req, res) => res.json(nas.job(req.params.slug) || { status: 'none' }));
app.get('/api/nas/thumb', admin, async (req, res) => { try { const b = await nas.thumb(String(req.query.path || ''), 'small'); res.set({ 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=86400' }).send(b); } catch (e) { res.status(502).end(); } });

// ---- posta dei viaggi ----
const mail = require('./lib/mail');
const keyOf = async slug => { try { const job = [...jobs.values()].find(j => j.slug === slug && j.files), f = job && job.files.find(x => x.path === 'pwa/auth.json'); const a = gh.hasGitHub() ? await gh.getFile(slug, 'pwa/auth.json', 'main') : f ? Buffer.from(f.data) : null; return a ? creds.tripKey(JSON.parse(a.toString())) : null; } catch (e) { return null; } };
const mailTick = () => { if (mail.hasMail() && Date.now() - mail.lastPoll() > 120000) mail.poll(keyOf).catch(() => {}); };
if (mail.hasMail()) { setTimeout(mailTick, 8000); setInterval(mailTick, 5 * 60000); }
app.get('/api/mail', admin, async (req, res) => { try { res.json(await mail.status()); } catch (e) { res.status(502).json({ error: e.message }); } });
app.post('/api/mail/poll', admin, async (req, res) => { const r = await mail.poll(keyOf); if (!r.ok) return res.status(502).json({ error: r.error }); res.json(Object.assign(r, await mail.status())); });
app.post('/api/mail/assign', admin, express.json({ limit: '10kb' }), async (req, res) => { try { res.json(await mail.assign(parseInt(req.body.uid, 10), String(req.body.slug || ''), keyOf)); } catch (e) { res.status(502).json({ error: e.message }); } });
app.post('/api/mail/ignore', admin, express.json({ limit: '10kb' }), async (req, res) => { try { res.json(await mail.ignore(parseInt(req.body.uid, 10) || 0, String(req.body.at || ''), req.body.on !== false)); } catch (e) { res.status(502).json({ error: e.message }); } });
app.post('/api/mail/ingest', admin, express.json({ limit: '20mb' }), async (req, res) => {
  try { const b = req.body || {}; res.json(await mail.ingest({ uid: 0, from: S_(b.from, 160), subject: S_(b.subject, 200), date: new Date().toISOString(), text: String(b.text || '').slice(0, 20000), slug: b.slug ? S_(b.slug, 40) : '',
    att: (b.attachments || []).slice(0, 4).map(a => { const m = /^data:(application\/pdf|image\/(?:jpeg|png|webp));base64,/.exec(String(a.data || '')); return m ? { name: S_(a.name, 80) || 'allegato', type: m[1], data: Buffer.from(a.data.slice(a.data.indexOf(',') + 1), 'base64') } : null; }).filter(Boolean) }, keyOf)); } catch (e) { res.status(502).json({ error: e.message }); }
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

// ---- wallet della figlia: una prenotazione aggiunta viene letta da Claude e torna come modifiche al programma ----
const wCount = new Map();
app.use('/api/wallet', cors);
app.post('/api/wallet/:slug/read', express.json({ limit: '14mb' }), trip, async (req, res) => {
  const slug = req.params.slug, k = slug + ':' + new Date().toISOString().slice(0, 10), n = wCount.get(k) || 0;
  if (n >= 40) return res.status(429).json({ error: 'Limite giornaliero di letture raggiunto' });
  wCount.set(k, n + 1);
  try {
    const b = req.body || {}, d = String(b.data || ''), m = /^data:(application\/pdf|image\/(?:jpeg|png|webp));base64,/.exec(d);
    if (!m) return res.status(400).json({ error: 'Documento non leggibile: servono PDF o immagini' });
    const c = b.ctx || {}, ctx = { dest: S_(c.dest, 80), start: S_(c.start, 10), end: S_(c.end, 10), people: (c.people || []).slice(0, 12).map(x => S_(x, 40)),
      days: (c.days || []).slice(0, 21).map(x => ({ date: S_(x.date, 10), title: S_(x.title, 140), stops: (x.stops || []).slice(0, 20).map(y => ({ at: S_(y.at, 5), n: S_(y.n, 120), kind: S_(y.kind, 4) })) })),
      gaps: (c.gaps || []).slice(0, 12).map(x => ({ i: parseInt(x.i, 10) || 0, kind: S_(x.kind, 14), t: S_(x.t, 140), date: S_(x.date, 10), dateEnd: S_(x.dateEnd, 10) })),
      todo: (c.todo || []).slice(0, 30).map(x => ({ id: S_(x.id, 12), t: S_(x.t, 160), d: S_(x.d, 240) })).filter(x => x.id) };
    if (!isDate(ctx.start) || !isDate(ctx.end) || !ctx.days.length) return res.status(400).json({ error: 'Contesto del viaggio mancante' });
    const file = { name: S_(b.name, 80) || 'documento', type: m[1], b64: d.slice(d.indexOf(',') + 1) };
    const r = ai.hasClaude() ? await ai.genWallet(ctx, file) : demo.wallet(ctx, file);
    const dates = new Set(ctx.days.map(x => x.date)), num = v => { const f = parseFloat(v); return isFinite(f) && f !== 0 ? f : null; };
    const items = (r.items || []).slice(0, 8).filter(x => dates.has(S_(x.date, 10)) && HM(x.at)).map(x => Object.assign(normItem(x, '', {}), { date: S_(x.date, 10), replaces: S_(x.replaces, 120) }));
    let lod = null; const L = r.lodging || {};
    if (S_(L.name, 80) && isDate(L.checkinDate) && isDate(L.checkoutDate)) {
      lod = { n: S_(L.name, 80), addr: S_(L.address, 160), lat: num(L.lat), lon: num(L.lon), from: L.checkinDate, to: L.checkoutDate, checkin: HM(L.checkinTime), checkout: HM(L.checkoutTime), pnr: S_(L.pnr, 24), note: S_(L.notes, 400) };
      if (lod.lat == null || lod.lon == null) { const g = await geoLib.googleGeocode([lod.n, lod.addr].filter(Boolean).join(', ')); if (g) { lod.lat = g.lat; lod.lon = g.lon; } }
      items.forEach(it => { if (it.lat == null && lod.lat != null && /check|hotel|alloggio/i.test(it.n + ' ' + it.sub)) { it.lat = lod.lat; it.lon = lod.lon; } });
    }
    const B = r.booking || {}, bk = (S_(B.from, 80) || S_(B.to, 80)) && isDate(B.date) ? { doc: 0, kind: S_(B.kind, 12) || 'altro', dir: 'interno', from: S_(B.from, 80), fromCode: S_(B.fromCode, 3).toUpperCase(), to: S_(B.to, 80), toCode: S_(B.toCode, 3).toUpperCase(), date: B.date, dep: HM(B.dep), arrDate: isDate(B.arrDate) ? B.arrDate : '', arr: HM(B.arr), carrier: S_(B.carrier, 60), number: S_(B.number, 20), pnr: S_(B.pnr, 24), passengers: (B.passengers || []).slice(0, 12).map(x => S_(x, 60)), seats: S_(B.seats, 200), notes: S_(B.notes, 400) } : null;
    res.json({ relevant: r.relevant !== false && (items.length > 0 || !!lod || !!bk), summary: S_(r.summary, 300), items, lodging: lod, booking: bk, gapsDone: (r.gapsDone || []).slice(0, 12).map(x => parseInt(x, 10)).filter(x => x >= 0 && x < 12), todoDone: (Array.isArray(r.todoDone) ? r.todoDone : []).map(x => S_(x, 12)).filter(x => ctx.todo.some(t => t.id === x)), warnings: (r.warnings || []).slice(0, 6).map(x => S_(x, 300)) });
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
    t._cover = await archive.read(slug + '/cover.png');
    Object.keys(req.trip.state.kv).forEach(k => { const v = req.trip.state.kv[k].v; if (k.startsWith('poi.') && v && typeof v === 'object') t.poi[k.slice(4)] = v; });
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
