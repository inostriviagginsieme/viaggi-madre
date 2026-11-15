// Geografia e servizi esterni: geocodifica, strade Google, Wikipedia, link di acquisto.
const sharp = require('sharp');
const UA = { 'user-agent': 'viaggi-madre/1.0 (webapp personale di pianificazione viaggi)' };
async function getJson(url, opt) {
  const r = await fetch(url, Object.assign({ signal: AbortSignal.timeout(20000) }, opt || {}));
  if (!r.ok) throw new Error('http ' + r.status);
  return r.json();
}
// Open-Meteo: gratuito, senza chiave.
async function geocodeCity(name) {
  try {
    const j = await getJson('https://geocoding-api.open-meteo.com/v1/search?count=1&language=it&name=' + encodeURIComponent(name));
    const g = j.results && j.results[0];
    return g ? { name: g.name, country: g.country, lat: g.latitude, lon: g.longitude, tz: g.timezone } : null;
  } catch (e) { return null; }
}
// Google Geocoding API: coordinate precise di alloggio e tappe.
async function googleGeocode(q) {
  const key = process.env.GOOGLE_MAPS_KEY; if (!key) return null;
  try {
    const j = await getJson('https://maps.googleapis.com/maps/api/geocode/json?language=it&key=' + key + '&address=' + encodeURIComponent(q));
    const g = j.results && j.results[0];
    return g ? { lat: g.geometry.location.lat, lon: g.geometry.location.lng, addr: g.formatted_address } : null;
  } catch (e) { return null; }
}
// Google Routes API: percorsi in auto con alternative e pedaggi.
async function googleRoutes(origin, dest) {
  const key = process.env.GOOGLE_MAPS_KEY; if (!key) return [];
  try {
    const j = await getJson('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'routes.description,routes.distanceMeters,routes.duration,routes.routeLabels,routes.travelAdvisory.tollInfo' },
      body: JSON.stringify({ origin: { address: origin }, destination: { address: dest }, travelMode: 'DRIVE', routingPreference: 'TRAFFIC_AWARE', computeAlternativeRoutes: true, extraComputations: ['TOLLS'], languageCode: 'it', units: 'METRIC' })
    });
    return (j.routes || []).slice(0, 3).map(r => {
      const tolls = (((r.travelAdvisory || {}).tollInfo || {}).estimatedPrice || []).map(p => (Number(p.units || 0) + (p.nanos || 0) / 1e9).toFixed(2).replace('.', ',') + ' ' + (p.currencyCode || '')).join(' + ');
      return { summary: r.description ? 'via ' + r.description : '', km: (r.distanceMeters || 0) / 1000, min: Math.round(parseInt(r.duration || '0', 10) / 60), toll: tolls };
    });
  } catch (e) { return []; }
}
function mapsDirUrl(origin, dest, mode) {
  return 'https://www.google.com/maps/dir/?api=1&origin=' + encodeURIComponent(origin) + '&destination=' + encodeURIComponent(dest) + '&travelmode=' + (mode || 'driving');
}
// Wikipedia in italiano: testo di riferimento e foto con attribuzione.
async function wiki(title, maxPhotos) {
  const out = { extract: '', url: '', photos: [] };
  if (!title) return out;
  const t = encodeURIComponent(title.replace(/ /g, '_'));
  try {
    const s = await getJson('https://it.wikipedia.org/api/rest_v1/page/summary/' + t, { headers: UA });
    out.extract = s.extract || ''; out.url = (s.content_urls && s.content_urls.desktop && s.content_urls.desktop.page) || '';
    const m = await getJson('https://it.wikipedia.org/api/rest_v1/page/media-list/' + t, { headers: UA });
    const items = (m.items || []).filter(i => i.type === 'image' && i.srcset && i.srcset.length && /\.(jpe?g)$/i.test(i.title || '') && !/(mappa|map|stemma|flag|bandiera|logo|coat|locator|icon)/i.test(i.title || ''));
    for (const it of items) {
      if (out.photos.length >= (maxPhotos || 5)) break;
      try {
        let src = it.srcset[it.srcset.length - 1].src; if (src.startsWith('//')) src = 'https:' + src;
        src = src.replace(/\/\d+px-/, '/1280px-');
        const r = await fetch(src, { headers: UA, signal: AbortSignal.timeout(20000) }); if (!r.ok) continue;
        const buf = await sharp(Buffer.from(await r.arrayBuffer())).resize(1200, 900, { fit: 'cover' }).webp({ quality: 72 }).toBuffer();
        out.photos.push({ buf, cap: (it.caption && it.caption.text || '').trim().slice(0, 120), credit: 'Wikimedia Commons' });
      } catch (e) { /* salta la foto */ }
    }
  } catch (e) { /* senza rete o voce mancante: si prosegue senza */ }
  return out;
}
// Foto che identifica un luogo. Prima Google (Places API New: ricerca testuale, poi la prima foto del luogo), altrimenti Wikipedia.
async function googlePlacePhoto(q) {
  const key = process.env.GOOGLE_MAPS_KEY; if (!key) return null;
  const r = await fetch('https://places.googleapis.com/v1/places:searchText', { method: 'POST', signal: AbortSignal.timeout(20000), headers: { 'content-type': 'application/json', 'x-goog-api-key': key, 'x-goog-fieldmask': 'places.displayName,places.photos' }, body: JSON.stringify({ textQuery: q, languageCode: 'it', pageSize: 1 }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Places ' + r.status + ' ' + ((j.error && j.error.message) || '').slice(0, 160));
  const ph = (((j.places || [])[0] || {}).photos || [])[0]; if (!ph || !ph.name) return null;
  const i = await fetch('https://places.googleapis.com/v1/' + ph.name + '/media?maxWidthPx=480&key=' + key, { signal: AbortSignal.timeout(20000) }); if (!i.ok) throw new Error('Places foto ' + i.status);
  return Buffer.from(await i.arrayBuffer());
}
async function placePhoto(q) {
  let buf = null, src = '';
  try { buf = await googlePlacePhoto(q); if (buf) src = 'google'; } catch (e) { /* Places non attivo sulla chiave: si passa a Wikipedia */ }
  if (!buf) { const w = await wiki(String(q).split(',')[0].trim(), 1); if (w.photos[0]) { buf = w.photos[0].buf; src = 'wikipedia'; } }
  if (!buf) return null;
  return { src, data: await sharp(buf).resize(192, 192, { fit: 'cover', position: 'attention' }).webp({ quality: 74 }).toBuffer() };
}
module.exports = { placePhoto, googlePlacePhoto, geocodeCity, googleGeocode, googleRoutes, mapsDirUrl, wiki };
