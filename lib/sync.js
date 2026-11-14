// Dati condivisi del gruppo: una mappa chiave -> {v, ts, seq} per viaggio, più le foto.
// Archivio: ramo "data" del repository del viaggio su GitHub; in locale (senza GitHub) la cartella DATA_DIR.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const gh = require('./github');
const DIR = () => process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const okSlug = s => /^[a-z0-9-]{2,40}$/.test(s), okId = s => /^[a-z0-9]{4,40}$/i.test(s);
async function read(slug, file) {
  if (gh.hasGitHub()) return gh.getFile(slug, 'data/' + file);
  const p = path.join(DIR(), slug, file); return fs.existsSync(p) ? fs.readFileSync(p) : null;
}
async function write(slug, file, buf) {
  if (gh.hasGitHub()) return gh.putFile(slug, 'data/' + file, buf, 'data', 'dati: ' + file);
  const p = path.join(DIR(), slug, file); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, buf);
}
const cache = new Map(), queue = new Map();
function serial(slug, fn) { const p = (queue.get(slug) || Promise.resolve()).then(fn, fn); queue.set(slug, p.catch(() => {})); return p; }
async function loadTrip(slug) {
  if (cache.has(slug)) return cache.get(slug);
  const meta = await read(slug, 'meta.json'); if (!meta) return null;
  const st = await read(slug, 'state.json');
  const t = { meta: JSON.parse(meta.toString()), state: st ? JSON.parse(st.toString()) : { rev: 0, kv: {} } };
  cache.set(slug, t); return t;
}
async function initTrip(slug, users) { await write(slug, 'meta.json', JSON.stringify({ users, updated: new Date().toISOString() })); cache.delete(slug); }
// Autenticazione: gettone personale del partecipante (sbloccato sul telefono dalle sue credenziali).
async function auth(slug, token) {
  if (!okSlug(slug) || !/^[a-f0-9]{32}$/.test(String(token || ''))) return null;
  const t = await loadTrip(slug); if (!t) return null;
  const h = Buffer.from(crypto.createHash('sha256').update(token).digest('hex'));
  const u = (t.meta.users || []).find(x => { const a = Buffer.from(String(x.th)); return a.length === h.length && crypto.timingSafeEqual(a, h); });
  return u ? Object.assign({ user: u.id }, t) : null;
}
function merge(slug, t, since, changes) {
  return serial(slug, async () => {
    const st = (cache.get(slug) || t).state; let dirty = false; const now = Date.now();
    Object.keys(changes || {}).slice(0, 2000).forEach(k => {
      const c = changes[k]; if (!c || typeof k !== 'string' || k.length > 120 || typeof c.ts !== 'number') return;
      const ts = Math.min(c.ts, now + 60000), cur = st.kv[k];
      if (!cur || ts > cur.ts) { st.rev++; st.kv[k] = { v: c.v === undefined ? null : c.v, ts, seq: st.rev }; dirty = true; }
    });
    if (dirty) {
      const buf = JSON.stringify(st); if (buf.length > 4 * 1024 * 1024) throw new Error('dati del viaggio troppo grandi');
      await write(slug, 'state.json', buf);
    }
    const out = {}; Object.keys(st.kv).forEach(k => { if (st.kv[k].seq > (since || 0)) out[k] = { v: st.kv[k].v, ts: st.kv[k].ts }; });
    return { rev: st.rev, changes: out };
  });
}
const putPhoto = (slug, id, buf) => serial(slug, () => write(slug, 'photos/' + id + '.jpg', buf));
const getPhoto = (slug, id) => read(slug, 'photos/' + id + '.jpg');
// Numeri a consuntivo per l'archivio della madre: spese registrate e foto caricate.
async function stats(slug) { const t = await loadTrip(slug); if (!t) return null; const kv = t.state.kv; let spent = 0, exp = 0, photos = 0;
  Object.keys(kv).forEach(k => { const v = kv[k].v; if (v == null) return; if (k.startsWith('exp.')) { spent += +v.amt || 0; exp++; } else if (k.startsWith('ph.')) photos++; });
  return { spent: Math.round(spent * 100) / 100, expenses: exp, photos, changes: t.state.rev }; }
const putFile = (slug, file, buf) => serial(slug, () => write(slug, file, buf));
module.exports = { stats, putFile, getFile: read, okSlug, okId, initTrip, auth, merge, putPhoto, getPhoto };
