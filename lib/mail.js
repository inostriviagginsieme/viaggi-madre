// Posta dei viaggi: la madre legge la casella dedicata (Gmail via IMAP, password per le app), Claude assegna ogni messaggio
// al viaggio delle date corrispondenti e la madre deposita messaggio e allegati tra i documenti del gruppo di quel viaggio.
// La lettura del documento e la modifica del programma le fa poi la figlia, come per ogni documento aggiunto al wallet.
const crypto = require('crypto'), path = require('path');
const sharp = require('sharp'), PDFDocument = require('pdfkit');
const ai = require('./ai'), demo = require('./demo'), sync = require('./sync'), archive = require('./archive');
const hasMail = () => !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
const USER = () => process.env.GMAIL_USER || '';
const S = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
const F = n => path.join(__dirname, '..', 'assets', 'fonts', n + '.ttf');
const STATE = 'posta/stato.json';
let busy = false, lastPoll = 0, lastError = '';

async function loadState() { const b = await archive.read(STATE); const s = b ? JSON.parse(b.toString()) : {}; return { validity: s.validity || 0, last: s.last || 0, log: s.log || [] }; }
const saveState = s => archive.write(STATE, JSON.stringify({ validity: s.validity, last: s.last, log: s.log.slice(-200) }, null, 1));

async function imap(fn) {
  const { ImapFlow } = require('imapflow');
  const c = new ImapFlow({ host: process.env.GMAIL_IMAP_HOST || 'imap.gmail.com', port: 993, secure: true, auth: { user: USER(), pass: String(process.env.GMAIL_APP_PASSWORD).replace(/\s+/g, '') }, logger: false, socketTimeout: 60000 });
  c.on('error', () => {});
  let step = 'collegamento e accesso', lock;
  try { await c.connect(); step = 'apertura della posta in arrivo'; lock = await c.getMailboxLock('INBOX'); step = 'lettura dei messaggi'; return await fn(c); }
  catch (e) { throw new Error(explain(e, step)); }
  finally { if (lock) lock.release(); await c.logout().catch(() => {}); }
}
// imapflow risponde "Command failed" a quasi tutto: il motivo vero sta nella risposta del server.
function explain(e, step) {
  const srv = S(e.responseText || (e.response && String(e.response)) || '', 200), raw = S(e.message, 120), all = (srv + ' ' + raw + ' ' + (e.code || '')).toLowerCase();
  let why = '';
  if (e.authenticationFailed || /invalid credentials|authenticationfailed|application-specific|web login required|\[auth/.test(all)) why = /application-specific/.test(all) ? 'Google vuole una password per le app, non la password dell\'account: creala in Account Google, Sicurezza, Verifica in due passaggi, Password per le app, e mettila in GMAIL_APP_PASSWORD.' : 'Google ha rifiutato l\'accesso. Controlla che GMAIL_USER sia l\'indirizzo completo e che GMAIL_APP_PASSWORD sia una password per le app di 16 lettere (non la password dell\'account), creata con la verifica in due passaggi attiva.';
  else if (/enotfound|econnrefused|etimedout|timeout|socket|econnreset/.test(all)) why = 'Il server di posta non è raggiungibile dalla madre.';
  return 'Posta, ' + step + ': ' + (srv || raw || 'errore') + (why ? ' ' + why : '');
}
async function parse(source, uid) {
  const { simpleParser } = require('mailparser'); const m = await simpleParser(source);
  return { uid, from: S(m.from && m.from.text, 160), subject: S(m.subject, 200), date: (m.date || new Date()).toISOString(), text: String(m.text || '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 20000),
    att: (m.attachments || []).filter(a => a.content && a.content.length > 2000 && a.content.length < 9e6 && /^(application\/pdf|image\/(jpeg|png|webp))$/.test(a.contentType) && !(a.related && /^image\//.test(a.contentType) && a.content.length < 40000)).slice(0, 4).map(a => ({ name: S(a.filename, 80) || 'allegato', type: a.contentType, data: a.content })) };
}
// Messaggi nuovi: quelli arrivati dopo l'ultimo letto; alla prima lettura, gli ultimi 60 giorni. Al massimo 8 per volta. La casella non viene modificata.
async function fetchNew(st) {
  return imap(async c => {
    const validity = Number(c.mailbox.uidValidity || 0), fresh = !st.last || (st.validity && st.validity !== validity);
    const q = fresh ? { since: new Date(Date.now() - 60 * 864e5) } : { uid: (st.last + 1) + ':*' };
    const uids = ((await c.search(q, { uid: true })) || []).filter(u => fresh || u > st.last).sort((a, b) => a - b).slice(0, 8), out = [];
    for (const uid of uids) { const m = await c.fetchOne(String(uid), { source: true }, { uid: true }); if (m && m.source) out.push(await parse(m.source, uid)); }
    return { validity, msgs: out };
  });
}
const fetchOne = uid => imap(async c => { const m = await c.fetchOne(String(uid), { source: true }, { uid: true }); if (!m || !m.source) throw new Error('Messaggio non più presente nella casella'); return parse(m.source, uid); });

// Il messaggio come documento: una pagina PDF con mittente, oggetto, data e testo.
function mailPdf(msg) {
  return new Promise((res, rej) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 }), ch = []; doc.on('data', d => ch.push(d)); doc.on('end', () => res(Buffer.concat(ch))); doc.on('error', rej);
    doc.registerFont('sans', F('DMSans_400Regular')); doc.registerFont('sansb', F('DMSans_700Bold'));
    const clean = t => String(t || '').replace(/[^\x09\x0A\x20-\x7E -ɏ‐-‧€]/g, ' ');
    doc.font('sansb').fontSize(15).text(clean(msg.subject) || 'Messaggio');
    doc.moveDown(0.4).font('sans').fontSize(9.5).fillColor('#555').text('Da: ' + clean(msg.from) + '\nRicevuto: ' + msg.date.slice(0, 16).replace('T', ' ') + '\nCasella: ' + (USER() || 'posta dei viaggi'));
    doc.moveDown(0.8).fillColor('#000').fontSize(10.5).text(clean(msg.text).slice(0, 14000) || '(messaggio senza testo)', { lineGap: 2 });
    doc.end();
  });
}
const gcm = (key, plain) => { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key, iv); return Buffer.concat([iv, c.update(plain), c.final(), c.getAuthTag()]); };

// Un messaggio: Claude decide a quale viaggio appartiene; i documenti finiscono, cifrati, tra quelli del gruppo. keyOf(slug) restituisce la chiave del viaggio.
async function handle(msg, trips, keyOf, forced) {
  const row = { uid: msg.uid || 0, at: new Date().toISOString(), date: msg.date, from: msg.from, subject: msg.subject, slug: '', docs: 0, summary: '', note: '' };
  try {
    let r = forced ? { travel: true, slug: forced, summary: 'Assegnato a mano dall\'amministratore.', useBody: true } : ai.hasClaude() ? await ai.genMail(msg, trips) : demo.mail(msg, trips);
    r = r || {}; row.summary = S(r.summary, 300);
    const t = trips.find(x => x.slug === S(r.slug, 40));
    if (!t) { if (r.travel === false) row.ignored = true; row.note = r.travel === false ? 'Non riguarda un viaggio: ' + S(r.reason, 200) : 'Nessun viaggio con date corrispondenti' + (S(r.reason, 200) ? ': ' + S(r.reason, 200) : '') + '. Si assegna a mano.'; return row; }
    const key = await keyOf(t.slug); if (!key) { row.note = 'Viaggio trovato (' + t.title + ') ma la sua chiave non è recuperabile: ADMIN_PIN o CRED_SECRET diverso da quello della creazione.'; return row; }
    const docs = [];
    for (const a of msg.att) docs.push(a.type === 'application/pdf' ? { name: a.name.replace(/\.[^.]+$/, ''), type: 'application/pdf', data: a.data } : { name: a.name.replace(/\.[^.]+$/, ''), type: 'image/jpeg', data: await sharp(a.data).rotate().resize(2000, 2000, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer() });
    if ((!docs.length || r.useBody !== false) && msg.text.length > 80) docs.unshift({ name: 'Posta · ' + (S(msg.subject, 60) || 'messaggio'), type: 'application/pdf', data: await mailPdf(msg) });
    if (!docs.length) { row.slug = t.slug; row.note = 'Messaggio senza testo e senza allegati leggibili.'; return row; }
    const ch = {}, now = Date.now();
    for (let i = 0; i < docs.length; i++) { const id = 'm' + crypto.randomBytes(8).toString('hex'); await sync.putDoc(t.slug, id, gcm(key, docs[i].data)); ch['doc.' + id] = { v: { name: docs[i].name, type: docs[i].type, poi: '', who: 'mail', ts: now + i, read: 0, mail: S(msg.from, 80) }, ts: now + i }; }
    await sync.push(t.slug, ch);
    row.slug = t.slug; row.docs = docs.length; row.note = 'Depositato tra i documenti di ' + t.title + ': il programma si aggiorna alla prima apertura dell\'app da parte di un partecipante.';
  } catch (e) { row.note = 'Errore: ' + S(e.message, 240); row.error = true; }
  return row;
}
const activeTrips = async () => (await archive.index()).filter(t => t.generated && t.start && t.end && t.end >= new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)).map(t => ({ slug: t.slug, title: t.title, dest: t.dest, start: t.start, end: t.end, people: t.people || [] }));

async function poll(keyOf) {
  if (!hasMail()) return { ok: false, error: 'Casella non configurata' };
  if (busy) return { ok: true, busy: true };
  busy = true; lastPoll = Date.now(); let n = 0;
  try {
    const st = await loadState(), f = await fetchNew(st), trips = await activeTrips();
    const v0 = st.validity; if (st.validity !== f.validity) { st.validity = f.validity; st.last = 0; }
    for (const m of f.msgs) {
      const row = await handle(m, trips, keyOf), prev = st.log[st.log.length - 1];
      if (row.error) { if (!(prev && prev.error && prev.uid === row.uid)) st.log.push(row); break; } // un errore non fa avanzare: il messaggio si riprova alla lettura successiva
      st.log.push(row); st.last = Math.max(st.last, m.uid); n++;
    }
    if (f.msgs.length || v0 !== st.validity) await saveState(st);
    lastError = ''; return { ok: true, read: n };
  } catch (e) { lastError = S(e.message, 240); return { ok: false, error: lastError }; }
  finally { busy = false; }
}
async function assign(uid, slug, keyOf) {
  const st = await loadState(), trips = await activeTrips(); if (!trips.some(t => t.slug === slug)) throw new Error('Viaggio non valido');
  const row = await handle(await fetchOne(uid), trips, keyOf, slug);
  st.log = st.log.filter(x => x.uid !== uid).concat([row]); await saveState(st); return row;
}
// Messaggio consegnato a mano (collaudo e uso senza casella): stesso percorso della posta vera.
async function ingest(msg, keyOf) { const st = await loadState(), row = await handle(msg, await activeTrips(), keyOf, msg.slug); st.log.push(row); await saveState(st); return row; }
const isIgn = r => r.ignored === undefined ? /^Non riguarda un viaggio/.test(r.note || '') && !r.docs : !!r.ignored; // le righe scritte prima della v1.9.2 non hanno il campo
const status = async () => ({ on: hasMail(), user: USER(), last: lastPoll, error: lastError, busy, log: (await loadState()).log.slice(-80).reverse().map(r => Object.assign({}, r, { ignored: isIgn(r) })) });
// Ignora o ripristina un messaggio del registro: uid del messaggio, oppure l'istante di registrazione per quelli consegnati a mano.
async function ignore(uid, at, on) { const st = await loadState(); let n = 0; st.log.forEach(r => { if ((uid && r.uid === uid) || (!uid && at && r.at === at)) { r.ignored = !!on; n++; } }); if (!n) throw new Error('Messaggio non trovato nel registro'); await saveState(st); return { ok: true }; }
const check = () => imap(async c => 'casella ' + USER() + ', ' + (c.mailbox.exists || 0) + ' messaggi in arrivo');
module.exports = { ignore, hasMail, poll, assign, ingest, status, check, lastPoll: () => lastPoll };
