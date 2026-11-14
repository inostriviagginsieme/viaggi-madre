// Peecho Print API v3: stampa del fotolibro. L'ordine nasce non pagato e resta fermo: parte in produzione solo con pay(),
// che scala il credito prepagato dell'account. Chiavi nelle variabili d'ambiente, mai nel repository.
const crypto = require('crypto');
const ENV = () => (process.env.PEECHO_ENV === 'prod' ? 'prod' : 'test');
const BASE = () => (ENV() === 'prod' ? 'https://www.peecho.com' : 'https://test.www.peecho.com') + '/rest/v3';
const hasPeecho = () => !!(process.env.PEECHO_API_KEY && process.env.PEECHO_SECRET);
// Copertina rigida A4 orizzontale, 200 g lucida, 24-300 pagine (codici letti dal pannello il 14/11/2026).
const OFFERING = () => +(process.env.PEECHO_OFFERING_ID || (ENV() === 'prod' ? 7674061 : 1352551));
async function call(method, path, body) {
  const r = await fetch(BASE() + path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60000) });
  const t = await r.text(); let j = {}; try { j = JSON.parse(t); } catch (e) { /* risposta non JSON */ }
  if (!r.ok) throw new Error('Peecho ' + r.status + ': ' + (j.message || j.error || j.custom_code || t.slice(0, 200)));
  return j;
}
async function createOrder({ reference, pdfUrl, pages, title, address, email, quantity }) {
  const j = await call('POST', '/order/', {
    merchant_api_key: process.env.PEECHO_API_KEY, currency: 'EUR', order_reference: reference,
    item_details: [{ item_reference: reference, offering_id: OFFERING(), quantity: quantity || 1,
      file_details: { content_url: pdfUrl, content_width: 297, content_height: 210, number_of_pages: pages, spine_details: { dynamic_spine_details: { text_font: 'Arial', text_size: 10, text_colour: '#ECE4D2', text_top: '', text_center: title, text_bottom: '' } } } }],
    address_details: { email_address: email, shipping_address: address }
  });
  return j.order_id;
}
const details = id => call('GET', '/order/details?merchantApiKey=' + encodeURIComponent(process.env.PEECHO_API_KEY) + '&orderId=' + id);
const pay = id => call('POST', '/order/payment', { order_id: id, merchant_api_key: process.env.PEECHO_API_KEY, secret: crypto.createHash('sha256').update(process.env.PEECHO_SECRET + String(id)).digest('hex') });
module.exports = { hasPeecho, ENV, OFFERING, createOrder, details, pay };
