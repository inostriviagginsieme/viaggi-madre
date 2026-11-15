// Credenziali dei partecipanti. Il contenuto del viaggio è cifrato (AES-256-GCM) dentro il sito statico:
// ogni partecipante ha utente e password che sbloccano la chiave del viaggio e un gettone personale per i dati condivisi.
const crypto = require('crypto');
const ITER = 310000, ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const normUser = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const normPass = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const uid = (slug, user) => sha(slug + ':' + user).slice(0, 24);
function newPass() { const b = crypto.randomBytes(8); let s = ''; for (let i = 0; i < 8; i++) s += ABC[b[i] % ABC.length]; return s.slice(0, 4) + '-' + s.slice(4); }
function gcm(key, plain) { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key, iv); return { iv, data: Buffer.concat([c.update(plain), c.final(), c.getAuthTag()]) }; }
function ungcm(key, iv, data) { const d = crypto.createDecipheriv('aes-256-gcm', key, iv); d.setAuthTag(data.subarray(data.length - 16)); return Buffer.concat([d.update(data.subarray(0, data.length - 16)), d.final()]); }
function wrap(slug, user, pass, payload) { const salt = crypto.randomBytes(16), k = crypto.pbkdf2Sync(normPass(pass), salt, ITER, 32, 'sha256'), w = gcm(k, payload); return { id: uid(slug, user), s: salt.toString('base64'), i: w.iv.toString('base64'), w: w.data.toString('base64') }; }
function unwrap(e, pass) { return ungcm(crypto.pbkdf2Sync(normPass(pass), Buffer.from(e.s, 'base64'), ITER, 32, 'sha256'), Buffer.from(e.i, 'base64'), Buffer.from(e.w, 'base64')); }
const adminSecret = () => process.env.CRED_SECRET || process.env.ADMIN_PIN || '';
// people: [{id, name}] -> utenti con nome utente unico
function usernames(people) { const seen = {}; return people.map(p => { let u = normUser(p.name) || 'ospite', b = u, n = 2; while (seen[u]) u = b + (n++); seen[u] = 1; return u; }); }
function issue(slug, people, tripKey) {
  const users = usernames(people), creds = [], entries = [], meta = [];
  people.forEach((p, i) => { const pass = newPass(), token = crypto.randomBytes(16);
    entries.push(wrap(slug, users[i], pass, Buffer.concat([tripKey, token])));
    creds.push({ name: p.name, user: users[i], pass }); meta.push({ id: p.id, name: p.name, th: sha(token.toString('hex')) }); });
  if (adminSecret()) entries.push(wrap(slug, '#admin', adminSecret(), Buffer.concat([tripKey, crypto.randomBytes(16)])));
  return { users, creds, entries, meta };
}
// Accesso famiglia: un solo utente con la password scelta dall'amministratore, uguale per tutti i siti dei viaggi passati. La password non viene salvata.
function issueFamily(slug, pass, tripKey) {
  const token = crypto.randomBytes(16), entries = [wrap(slug, 'famiglia', pass, Buffer.concat([tripKey, token]))];
  if (adminSecret()) entries.push(wrap(slug, '#admin', adminSecret(), Buffer.concat([tripKey, crypto.randomBytes(16)])));
  return { users: [], creds: [{ name: 'Famiglia', user: 'famiglia', pass: 'quella scelta nella madre' }], entries, meta: [{ id: 'fam', name: 'Famiglia', th: sha(token.toString('hex')) }] };
}
function seal(trip, pub, familyPass) {
  const tripKey = crypto.randomBytes(32), people = trip.people.map(p => ({ id: p.id, name: p.name })), is = familyPass ? issueFamily(trip.slug, familyPass, tripKey) : issue(trip.slug, people, tripKey);
  if (!familyPass) trip.people.forEach((p, i) => { p.u = is.users[i]; });
  const e = gcm(tripKey, Buffer.from(JSON.stringify(trip)));
  return { enc: Buffer.concat([e.iv, e.data]), auth: Object.assign({ v: 1, slug: trip.slug, iter: ITER, users: is.entries }, pub), creds: is.creds, meta: is.meta };
}
// Nuove credenziali per un viaggio già pubblicato: serve la voce amministratore dentro auth.json.
function reissue(auth, enc) {
  const a = (auth.users || []).find(u => u.id === uid(auth.slug, '#admin')); if (!a || !adminSecret()) throw new Error('Questo viaggio non ha la voce amministratore: le credenziali non si possono rigenerare.');
  let tripKey; try { tripKey = unwrap(a, adminSecret()).subarray(0, 32); } catch (e) { throw new Error('ADMIN_PIN o CRED_SECRET diverso da quello usato alla creazione del viaggio.'); }
  const trip = JSON.parse(ungcm(tripKey, enc.subarray(0, 12), enc.subarray(12)).toString());
  const is = issue(auth.slug, trip.people.map(p => ({ id: p.id, name: p.name })), tripKey);
  return { auth: Object.assign({}, auth, { users: is.entries }), creds: is.creds, meta: is.meta };
}
// Chiave del viaggio, dalla voce amministratore di auth.json: serve alla madre per depositare documenti cifrati (posta dei viaggi).
function tripKey(auth) { const a = (auth.users || []).find(u => u.id === uid(auth.slug, '#admin')); if (!a || !adminSecret()) return null; try { return unwrap(a, adminSecret()).subarray(0, 32); } catch (e) { return null; } }
module.exports = { tripKey, seal, reissue, sha, ITER };
