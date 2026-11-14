// GitHub: un repository per viaggio. Ramo main = sito (cartella pwa), ramo data = dati condivisi del gruppo.
const API = 'https://api.github.com';
const hasGitHub = () => !!(process.env.GITHUB_TOKEN && process.env.GITHUB_OWNER);
const OWNER = () => process.env.GITHUB_OWNER;
const TOPIC = 'viaggio-figlia';
async function gh(method, path, body, raw) {
  const r = await fetch(API + path, {
    method, signal: AbortSignal.timeout(60000),
    headers: { authorization: 'Bearer ' + process.env.GITHUB_TOKEN, accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'viaggi-madre', 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  if (raw) { if (r.status === 404) return null; if (!r.ok) throw new Error('GitHub ' + r.status); return Buffer.from(await r.arrayBuffer()); }
  const j = r.status === 204 ? {} : await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error('GitHub ' + r.status + ' ' + path + ': ' + (j.message || '')); e.status = r.status; throw e; }
  return j;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function repoExists(name) { try { await gh('GET', `/repos/${OWNER()}/${name}`); return true; } catch (e) { if (e.status === 404) return false; throw e; } }
async function createRepo(name, description, homepage, plain) {
  const me = await gh('GET', '/user');
  const body = { name, description, homepage: homepage || '', private: process.env.GITHUB_PRIVATE !== 'false', auto_init: true };
  const repo = me.login.toLowerCase() === OWNER().toLowerCase() ? await gh('POST', '/user/repos', body) : await gh('POST', `/orgs/${OWNER()}/repos`, body);
  if (!plain) await gh('PUT', `/repos/${OWNER()}/${name}/topics`, { names: [TOPIC] }).catch(() => {});
  return repo;
}
async function updateRepo(name, patch) { return gh('PATCH', `/repos/${OWNER()}/${name}`, patch); }
// Un solo commit con tutti i file (testo e binari).
async function commitFiles(name, branch, files, message) {
  const base = `/repos/${OWNER()}/${name}`;
  let ref; for (let i = 0; i < 6; i++) { try { ref = await gh('GET', `${base}/git/ref/heads/${branch}`); break; } catch (e) { if (i === 5) throw e; await sleep(1500); } }
  const parent = ref.object.sha, pc = await gh('GET', `${base}/git/commits/${parent}`);
  const tree = [];
  for (const f of files) {
    const blob = await gh('POST', `${base}/git/blobs`, { content: Buffer.from(f.data).toString('base64'), encoding: 'base64' });
    tree.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
  }
  const t = await gh('POST', `${base}/git/trees`, { base_tree: pc.tree.sha, tree });
  const c = await gh('POST', `${base}/git/commits`, { message, tree: t.sha, parents: [parent] });
  await gh('PATCH', `${base}/git/refs/heads/${branch}`, { sha: c.sha });
  return c.sha;
}
async function ensureBranch(name, branch, from) {
  const base = `/repos/${OWNER()}/${name}`;
  try { await gh('GET', `${base}/git/ref/heads/${branch}`); return; } catch (e) { if (e.status !== 404) throw e; }
  const ref = await gh('GET', `${base}/git/ref/heads/${from || 'main'}`);
  await gh('POST', `${base}/git/refs`, { ref: 'refs/heads/' + branch, sha: ref.object.sha });
}
// Archivio dati: singoli file sul ramo data.
async function getFile(name, path, branch) { return gh('GET', `/repos/${OWNER()}/${name}/contents/${path}?ref=${branch || 'data'}`, null, true); }
async function putFile(name, path, buf, branch, message) {
  const p = `/repos/${OWNER()}/${name}/contents/${path}`;
  for (let i = 0; i < 4; i++) {
    let sha; try { sha = (await gh('GET', p + '?ref=' + (branch || 'data'))).sha; } catch (e) { if (e.status !== 404) throw e; }
    try { await gh('PUT', p, { message: message || 'dati', content: Buffer.from(buf).toString('base64'), branch: branch || 'data', sha }); return; }
    catch (e) { if (e.status !== 409 && e.status !== 422) throw e; await sleep(600 * (i + 1)); }
  }
  throw new Error('GitHub: scrittura non riuscita su ' + path);
}
async function listTrips() {
  const out = [];
  for (let page = 1; page <= 3; page++) {
    const rs = await gh('GET', `/user/repos?per_page=100&sort=created&affiliation=owner,organization_member&page=${page}`);
    rs.filter(r => r.owner.login.toLowerCase() === OWNER().toLowerCase() && (r.topics || []).includes(TOPIC)).forEach(r => out.push({ slug: r.name, description: r.description || '', url: r.homepage || '', repo: r.html_url, created: r.created_at }));
    if (rs.length < 100) break;
  }
  return out;
}
module.exports = { hasGitHub, OWNER, repoExists, createRepo, updateRepo, commitFiles, ensureBranch, getFile, putFile, listTrips };
