// Archivio permanente di tutti i viaggi. Vive in un repository privato dedicato (ARCHIVE_REPO, predefinito viaggi-archivio):
// per ogni viaggio la scheda completa (trip.json), la richiesta originale, la copia del sito (sito.zip) e una riga nell'indice.
// Senza GitHub l'archivio sta nella cartella DATA_DIR, che sul piano gratuito di Render non sopravvive ai riavvii.
const fs = require('fs'), path = require('path');
const sharp = require('sharp'), gh = require('./github'), { makeZip } = require('./zip');
const REPO = () => process.env.ARCHIVE_REPO || 'viaggi-archivio';
const DIR = () => path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), '_archivio');
let ready = false, chain = Promise.resolve();
const serial = fn => { const p = chain.then(fn, fn); chain = p.catch(() => {}); return p; };
async function ensure() {
  if (ready || !gh.hasGitHub()) return;
  if (!(await gh.repoExists(REPO()))) await gh.createRepo(REPO(), 'Archivio di tutti i viaggi generati da I nostri viaggi insieme', '', true);
  ready = true;
}
async function read(file) {
  if (gh.hasGitHub()) { await ensure(); return gh.getFile(REPO(), file, 'main'); }
  const p = path.join(DIR(), file); return fs.existsSync(p) ? fs.readFileSync(p) : null;
}
async function write(file, buf) {
  if (gh.hasGitHub()) { await ensure(); return gh.putFile(REPO(), file, buf, 'main', 'archivio: ' + file); }
  const p = path.join(DIR(), file); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, buf);
}
async function index() { const b = await read('index.json'); return b ? JSON.parse(b.toString()) : []; }
const upsert = entry => serial(async () => { const ix = (await index()).filter(e => e.slug !== entry.slug); ix.push(entry); ix.sort((a, b) => String(b.start).localeCompare(String(a.start))); await write('index.json', JSON.stringify(ix, null, 1)); return entry; });
async function saveTrip(job) {
  const t = job.trip, icon = job.files.find(f => f.path === 'pwa/icon-192.png'), req = Object.assign({}, job.request, { people: (job.request.people || []).map(p => ({ name: p.name })), files: (job.request.files || []).map(f => ({ name: f.name, type: f.type })) });
  await write(t.slug + '/trip.json', JSON.stringify(t));
  const big = job.files.find(f => f.path === 'pwa/icon-512.png'); if (big) await write(t.slug + '/icon.png', big.data);
  if (job.cover) await write(t.slug + '/cover.png', job.cover);
  await write(t.slug + '/richiesta.json', JSON.stringify(req, null, 1));
  await write(t.slug + '/sito.zip', makeZip(job.files.map(f => ({ path: t.slug + '/' + f.path, data: f.data }))));
  return upsert({ slug: t.slug, title: t.title, dateLabel: t.dateLabel, start: t.dates.start, end: t.dates.end, dest: t.dest.name + (t.dest.country ? ', ' + t.dest.country : ''), origin: t.origin.name, mode: t.transport.modeLabel, people: t.people.map(p => p.name),
    days: t.days.length, stops: Object.keys(t.poi).length, url: job.url || '', repo: job.repo || '', created: t.gen.at, generated: true,
    icon: icon ? 'data:image/webp;base64,' + (await sharp(icon.data).resize(96, 96).webp({ quality: 70 }).toBuffer()).toString('base64') : '' });
}
const addManual = e => upsert(Object.assign({ generated: false, created: new Date().toISOString(), days: 0, stops: 0, icon: '' }, e));
async function detail(slug) { const b = await read(slug + '/trip.json'); return b ? JSON.parse(b.toString()) : null; }
const zip = slug => read(slug + '/sito.zip');
module.exports = { read, write, index, saveTrip, addManual, detail, zip, REPO };
