// Google Gemini (immagini): caricature dei partecipanti e logo del viaggio.
// Prova prima l'API Interactions (documentazione corrente), poi generateContent come ripiego.
const MODEL = () => process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image';
const hasGemini = () => !!process.env.GEMINI_API_KEY;
const BASE = 'https://generativelanguage.googleapis.com/v1beta/';
function findImage(o, depth) {
  if (!o || typeof o !== 'object' || (depth || 0) > 8) return null;
  if (typeof o.data === 'string' && o.data.length > 2000 && (o.type === 'image' || /image/.test(o.mime_type || o.mimeType || ''))) return o.data;
  for (const k of Object.keys(o)) { const f = findImage(o[k], (depth || 0) + 1); if (f) return f; }
  return null;
}
async function post(path, body) {
  const r = await fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY }, body: JSON.stringify(body), signal: AbortSignal.timeout(180000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error('Gemini ' + r.status + ': ' + ((j.error && j.error.message) || 'errore')); e.status = r.status; throw e; }
  return j;
}
// images: array di Buffer JPEG. Ritorna un Buffer (PNG o JPEG) oppure lancia un errore.
async function genImage(prompt, images) {
  const imgs = (images || []).map(b => b.toString('base64'));
  let data = null, firstErr = null;
  try {
    const j = await post('interactions', { model: MODEL(), input: [{ type: 'text', text: prompt }].concat(imgs.map(d => ({ type: 'image', mime_type: 'image/jpeg', data: d }))), response_format: { type: 'image', aspect_ratio: '1:1' } });
    data = findImage(j);
  } catch (e) { firstErr = e; }
  if (!data) {
    const j = await post('models/' + MODEL() + ':generateContent', { contents: [{ parts: [{ text: prompt }].concat(imgs.map(d => ({ inline_data: { mime_type: 'image/jpeg', data: d } }))) }], generationConfig: { responseModalities: ['IMAGE'] } }).catch(e => { throw firstErr || e; });
    data = findImage(j);
  }
  if (!data) throw new Error('Gemini non ha restituito un\'immagine');
  return Buffer.from(data, 'base64');
}
const facePrompt = name => `Trasforma la persona di questa foto in una caricatura a colori, stile illustrazione editoriale simpatica e rispettosa: testa leggermente grande, tratti riconoscibili, sorriso, linee pulite, colori piatti e caldi. Solo testa e spalle, centrata, sfondo tinta unita color crema. Nessun testo, nessuna cornice. Formato quadrato.`;
const logoPrompt = (dest, n) => `Crea il logo quadrato di un'app di viaggio: ${n === 1 ? 'la persona della foto' : 'le ' + n + ' persone delle foto'} in caricatura, stesso stile di illustrazione editoriale simpatica con colori piatti e caldi, in gruppo e sorridenti, davanti al simbolo più riconoscibile di ${dest}. Composizione compatta che resta leggibile anche in piccolo come icona di un telefono, sfondo pieno fino ai bordi, nessun testo, nessuna cornice.`;
module.exports = { hasGemini, genImage, facePrompt, logoPrompt, MODEL };
