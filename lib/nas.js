// Foto del NAS: la madre legge una cartella condivisa di un NAS Synology (link di condivisione di File Station), trova le foto scattate nei giorni
// di un viaggio dalla data del file e, dopo la conferma dell'amministratore, le porta nell'album del viaggio.
// Protocollo verificato dal browser il 15/11/2026: elenco SYNO.FolderSharing.List, scaricamento SYNO.FolderSharing.Download, anteprima SYNO.FolderSharing.Thumb, con il cookie rilasciato dalla pagina del link.
const crypto = require('crypto'), sharp = require('sharp');
const archive = require('./archive'), sync = require('./sync'), gh = require('./github');
const CFG = 'nas/config.json', IMG = /\.(jpe?g|png|heic|heif)$/i;
let sess = null;
async function config() { const b = await archive.read(CFG); return b ? JSON.parse(b.toString()) : { url: '', roots: [] }; }
async function setConfig(url, roots) {
  url = String(url || '').trim(); const m = /^(?:https:\/\/[a-z0-9.-]+|http:\/\/127\.0\.0\.1:\d+)\/sharing\/([A-Za-z0-9_-]{4,40})\/?$/.exec(url);
  if (url && !m) throw new Error(/gofile\.me/.test(url) ? 'Serve l\'indirizzo completo del NAS: apri il link gofile.me nel browser, aspetta che compaia l\'elenco dei file e copia l\'indirizzo della pagina (finisce con /sharing/ e un codice).' : 'Indirizzo non valido: deve essere del tipo https://…/sharing/CODICE');
  const c = { url, roots: (roots || []).map(r => String(r).trim().replace(/\/+$/, '')).filter(r => r.startsWith('/')).slice(0, 6) }; sess = null;
  await archive.write(CFG, JSON.stringify(c, null, 1)); return c;
}
async function session() {
  if (sess && Date.now() - sess.at < 20 * 60000) return sess;
  const c = await config(); if (!c.url) throw new Error('Cartella del NAS non configurata');
  const u = new URL(c.url), r = await fetch(c.url, { redirect: 'manual', signal: AbortSignal.timeout(30000), headers: { 'user-agent': 'Mozilla/5.0 viaggi-madre' } });
  const ck = (r.headers.getSetCookie ? r.headers.getSetCookie() : []).map(x => x.split(';')[0]).filter(x => /^sharing_sid=/.test(x));
  if (!ck.length) throw new Error('Il NAS non ha aperto la condivisione (risposta ' + r.status + '): il link è scaduto, protetto da password o il NAS è spento.');
  sess = { at: Date.now(), origin: u.origin, id: u.pathname.split('/').filter(Boolean).pop(), cookie: ck.join('; '), roots: c.roots }; return sess;
}
async function list(path) {
  const s = await session(), out = [];
  for (let off = 0; off < 20000; off += 1000) {
    const r = await fetch(s.origin + '/sharing/webapi/entry.cgi', { method: 'POST', signal: AbortSignal.timeout(60000), headers: { cookie: s.cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ api: 'SYNO.FolderSharing.List', method: 'list', version: '2', _sharing_id: JSON.stringify(s.id), offset: String(off), limit: '1000', sort_by: 'name', sort_direction: 'ASC', additional: JSON.stringify(['size', 'time']), folder_path: JSON.stringify(path) }) });
    const j = await r.json().catch(() => ({}));
    if (!j.success) { if (j.error && j.error.code === 408) return out; if (j.error && (j.error.code === 101 || j.error.code === 119)) sess = null; throw new Error('NAS, elenco di ' + path + ': errore ' + ((j.error && j.error.code) || r.status)); }
    (j.data.files || []).forEach(f => out.push({ name: f.name, path: f.path, dir: !!f.isdir, size: (f.additional || {}).size || 0, mtime: ((f.additional || {}).time || {}).mtime || 0 }));
    if (off + 1000 >= (j.data.total || 0)) break;
  }
  return out;
}
const qs = o => Object.keys(o).map(k => k + '=' + encodeURIComponent(o[k])).join('&');
async function get(api, params) { const s = await session(), r = await fetch(s.origin + '/sharing/webapi/entry.cgi?' + qs(Object.assign({ api, version: '2', _sharing_id: JSON.stringify(s.id) }, params)), { headers: { cookie: s.cookie }, signal: AbortSignal.timeout(120000) }); if (!r.ok) throw new Error('NAS ' + r.status); return Buffer.from(await r.arrayBuffer()); }
const download = path => get('SYNO.FolderSharing.Download', { method: 'download', mode: 'download', stdhtml: 'false', path: JSON.stringify([path]) });
const thumb = (path, size) => get('SYNO.FolderSharing.Thumb', { method: 'get', size: size || 'medium', path: JSON.stringify(path) });
const romeDate = sec => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date(sec * 1000));
const photoId = path => 'n' + crypto.createHash('sha1').update(path).digest('hex').slice(0, 18);
// Radici: cartelle organizzate per anno e mese (…/AAAA/MM/file), come i salvataggi automatici dei telefoni. Una cartella mancante non è un errore.
async function candidates(start, end) {
  const s = await session(), months = []; let d = new Date(start.slice(0, 7) + '-01T12:00:00Z'); const last = end.slice(0, 7);
  while (d.toISOString().slice(0, 7) <= last && months.length < 4) { months.push(d.toISOString().slice(0, 7)); d.setUTCMonth(d.getUTCMonth() + 1); }
  const found = [];
  for (const root of s.roots) for (const ym of months) {
    const [y, m] = ym.split('-');
    for (const p of [root + '/' + y + '/' + m, root + '/' + y + '/' + String(+m)]) {
      let fl; try { fl = await list(p); } catch (e) { if (/errore (408|418|414|400)/.test(e.message)) continue; throw e; }
      for (const f of fl) { if (f.dir || !IMG.test(f.name) || f.size < 30000) continue; const day = romeDate(f.mtime); if (day >= start && day <= end) found.push({ path: f.path, name: f.name, day, ts: f.mtime * 1000, size: f.size, id: photoId(f.path) }); }
      if (fl.length) break;
    }
  }
  found.sort((a, b) => a.ts - b.ts); return found;
}
// Una foto pronta per l'album: JPEG a 2000 pixel. I formati che sharp non apre (HEIC) passano dall'anteprima grande del NAS.
async function prepare(f) {
  try { if (/\.hei[cf]$/i.test(f.name)) throw new Error('heic'); return await sharp(await download(f.path)).rotate().resize(2000, 2000, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer(); }
  catch (e) { const t = await thumb(f.path, 'large'); if (t[0] !== 0xFF || t[1] !== 0xD8) throw new Error('formato non leggibile'); return t; }
}
const jobs = new Map();
// Importa nell'album le foto dei giorni scelti. Ripetibile: le foto già presenti si saltano.
function importPhotos(trip, days, max) {
  const slug = trip.slug, job = { slug, status: 'run', done: 0, skipped: 0, failed: 0, total: 0, msg: 'Cerco le foto…' }; jobs.set(slug, job);
  (async () => {
    try {
      const all = (await candidates(trip.dates.start, trip.dates.end)).filter(f => !days || days.includes(f.day)), t = await sync.state(slug), who = (trip.people[0] || {}).id || 'p1';
      const todo = all.filter(f => { const k = t.kv['ph.' + f.id]; if (k) { job.skipped++; return false; } return true; }).slice(0, max || 400);
      job.total = todo.length; job.msg = 'Porto ' + todo.length + ' foto nell\'album…';
      const dayId = d => { const x = (trip.days || []).find(y => y.date === d); return x ? x.id : (trip.days[0] || {}).id; };
      for (let i = 0; i < todo.length; i += 12) {
        const batch = [], ch = {};
        for (const f of todo.slice(i, i + 12)) { try { batch.push({ id: f.id, data: await prepare(f) }); ch['ph.' + f.id] = { v: { day: dayId(f.day), who, cap: '', ts: f.ts, src: 'nas' }, ts: Date.now() }; } catch (e) { job.failed++; } }
        if (batch.length) { await sync.putPhotos(slug, batch); await sync.push(slug, ch); job.done += batch.length; }
      }
      job.status = 'done'; job.msg = job.done + ' foto aggiunte all\'album' + (job.skipped ? ', ' + job.skipped + ' già presenti' : '') + (job.failed ? ', ' + job.failed + ' non leggibili' : '') + (all.length - job.skipped > todo.length ? '. Ne restano altre: ripeti l\'importazione.' : '.');
    } catch (e) { job.status = 'error'; job.msg = e.message; }
  })();
  return job;
}
module.exports = { config, setConfig, candidates, thumb, importPhotos, job: slug => jobs.get(slug) || null, list };
