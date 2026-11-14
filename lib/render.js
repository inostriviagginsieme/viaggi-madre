// Render: uno Static Site per viaggio, collegato al repository GitHub (cartella pwa, ramo main).
const API = 'https://api.render.com/v1';
const hasRender = () => !!process.env.RENDER_API_KEY;
async function rd(method, path, body) {
  const r = await fetch(API + path, { method, signal: AbortSignal.timeout(60000), headers: { authorization: 'Bearer ' + process.env.RENDER_API_KEY, accept: 'application/json', 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error('Render ' + r.status + ': ' + (j.message || JSON.stringify(j).slice(0, 200))); e.status = r.status; throw e; }
  return j;
}
async function ownerId() {
  if (process.env.RENDER_OWNER_ID) return process.env.RENDER_OWNER_ID;
  const o = await rd('GET', '/owners?limit=20');
  const first = (o[0] && (o[0].owner || o[0])) || {};
  if (!first.id) throw new Error('Render: nessun workspace trovato per questa API key');
  return first.id;
}
async function createStaticSite(name, repoUrl) {
  const j = await rd('POST', '/services', {
    type: 'static_site', name, ownerId: await ownerId(), repo: repoUrl, branch: 'main', autoDeploy: 'yes',
    serviceDetails: { buildCommand: '', publishPath: 'pwa', pullRequestPreviewsEnabled: 'no',
      headers: [{ path: '/sw.js', name: 'Cache-Control', value: 'no-cache' }, { path: '/index.html', name: 'Cache-Control', value: 'no-cache' }, { path: '/trip.enc', name: 'Cache-Control', value: 'no-cache' }, { path: '/auth.json', name: 'Cache-Control', value: 'no-cache' }, { path: '/app.js', name: 'Cache-Control', value: 'no-cache' }] }
  });
  const s = j.service || j;
  return { id: s.id, url: (s.serviceDetails && s.serviceDetails.url) || ('https://' + (s.slug || name) + '.onrender.com'), dashboard: s.dashboardUrl || '' };
}
module.exports = { hasRender, createStaticSite };
