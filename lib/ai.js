// Claude API: contenuti del viaggio (destinazione, trasporto, itinerario, bagagli, preventivo, testi del fotolibro).
const MODEL = () => process.env.CLAUDE_MODEL || 'claude-sonnet-5-5';
const hasClaude = () => !!process.env.ANTHROPIC_API_KEY;

const STYLE = `Scrivi in italiano, tono caldo e concreto, da amico che conosce bene il posto. Frasi brevi. Niente trattini lunghi, niente emoji nel testo (le emoji vanno solo nei campi "ico"), niente formule vuote come "esperienza unica" o "perla nascosta". Ogni frase porta un fatto: un orario, un prezzo, un nome, un consiglio pratico. Se non sei sicuro di un prezzo o di un orario scrivilo come stima ("circa", "da verificare"). Non inventare nomi di locali: proponi solo luoghi che conosci come esistenti. Consegna il risultato come oggetto JSON con la struttura indicata, senza altro testo.`;

// Il risultato arriva come argomento di uno strumento: l'API consegna un oggetto già interpretato, quindi niente JSON malformato
// per una virgoletta non protetta dentro un testo lungo. Con la ricerca web attiva lo strumento non si può imporre: si torna al testo.
const TOOL = { name: 'consegna', description: 'Consegna il risultato finale, con la struttura richiesta nel messaggio.', input_schema: { type: 'object', additionalProperties: true } };
async function callClaude(system, user, maxTokens = 16000) {
  const web = process.env.CLAUDE_WEB_SEARCH === 'true';
  const body = { model: MODEL(), max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }; // user: testo oppure blocchi (documenti, immagini, testo)
  if (web) body.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }];
  else { body.tools = [TOOL]; body.tool_choice = { type: 'tool', name: 'consegna' }; }
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(600000)
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Claude API ' + r.status + ': ' + ((j.error && j.error.message) || 'errore'));
  if (j.stop_reason === 'max_tokens') throw new Error('risposta troncata per lunghezza');
  const tool = (j.content || []).find(b => b.type === 'tool_use' && b.name === 'consegna');
  return { obj: tool && tool.input && typeof tool.input === 'object' ? tool.input : null, text: (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('') };
}

function parseJson(text) {
  let t = String(text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('risposta senza JSON');
  return JSON.parse(t.slice(a, b + 1));
}

// Fino a tre tentativi: il secondo e il terzo chiedono una risposta più asciutta.
async function askJson(system, user, maxTokens) {
  let last;
  for (let i = 0; i < 3; i++) {
    const extra = i === 0 ? '' : '\n\nATTENZIONE: il tentativo precedente non è andato a buon fine (' + last.message + '). Riprova con testi più brevi: descrizioni di 3 frasi, consigli di 2 frasi. Nessuna virgoletta doppia dentro i testi.';
    const u = typeof user === 'string' ? user + extra : (extra ? user.concat([{ type: 'text', text: extra }]) : user);
    try {
      const r = await callClaude(system, u, maxTokens);
      const o = r.obj && Object.keys(r.obj).length ? r.obj : parseJson(r.text);
      // Alcune risposte incapsulano il risultato in una sola chiave: si scarta l'involucro.
      const ks = Object.keys(o); return ks.length === 1 && o[ks[0]] && typeof o[ks[0]] === 'object' && !Array.isArray(o[ks[0]]) && !['days', 'segments', 'dest'].includes(ks[0]) ? o[ks[0]] : o;
    } catch (e) { last = e; if (/Claude API 4(0[01349])/.test(e.message)) throw e; }
  }
  throw new Error('Claude non ha prodotto un risultato valido dopo tre tentativi: ' + last.message);
}

function brief(inp) {
  return `VIAGGIO
Destinazione: ${inp.dest}
Partenza da: ${inp.origin || 'non indicata'}
Date: dal ${inp.start} al ${inp.end} (${inp.dates.length} giorni)
Partecipanti (${inp.people.length}): ${inp.people.map(p => p.name).join(', ')}
Mezzo scelto per raggiungere la destinazione: ${inp.mode}
Orari già noti: andata ${inp.outTime || 'da definire'}, ritorno ${inp.backTime || 'da definire'}
Alloggio: ${inp.lodging || 'non ancora scelto'}
Stile e ritmo richiesti: ${inp.style || 'equilibrato'}
Fascia di spesa: ${inp.budget || 'media'}
Prenotazioni già fatte, lette dai documenti caricati. Sono VINCOLANTI: orari, date, luoghi e nomi vanno riportati esattamente nelle tappe di viaggio (kind "fix") e il resto del programma si adatta a questi orari:
${inp.bookingsText || '(nessuna)'}
Programma di massima scritto da chi organizza (da rispettare e integrare, non da sostituire):
${inp.program || '(nessuno)'}
Reference condivise (link o appunti):
${(inp.refs || []).map(r => '- ' + (r.t ? r.t + ' ' : '') + r.u).join('\n') || '(nessuna)'}`;
}

async function genBase(inp) {
  const user = `${brief(inp)}

Produci il JSON con questa struttura esatta:
{
 "dest": {"name": "nome della destinazione in italiano", "country": "paese", "lat": 0, "lon": 0, "lang": "lingua locale", "langCode": "codice BCP-47 per la sintesi vocale, es. fr-FR", "currency": "valuta", "wikiTitle": "titolo esatto della voce su it.wikipedia.org"},
 "title": "titolo breve dell'app, es. Praga 2026",
 "planIntro": "due frasi che raccontano il taglio di questo viaggio per questo gruppo",
 "info": {
   "intro": "4-5 frasi: che posto è, cosa lo rende diverso, cosa aspettarsi in queste date",
   "history": "la storia in 6-8 frasi, con date e nomi",
   "climate": "clima tipico nel periodo del viaggio: temperature, pioggia, luce, cosa mettere in valigia",
   "facts": [["Lingua","..."],["Valuta","..."],["Fuso orario","..."],["Prese elettriche","..."],["Documenti","cosa serve a un cittadino italiano"],["Mance","..."]],
   "cards": [{"t":"titolo scheda pratica","ico":"emoji","h":[["voce","testo"]],"note":"nota finale"}],
   "phrases": [{"it":"Buongiorno","loc":"frase nella lingua locale","pron":"pronuncia all'italiana"}]
 },
 "transport": {
   "summary": "3-4 frasi: come conviene fare questo viaggio con il mezzo scelto, da dove a dove",
   "options": [{"t":"opzione concreta (compagnia e aeroporti, oppure treno e stazioni, oppure itinerario stradale)","d":"durata, cambi, quando prenotare, pro e contro","price":"stima a persona o totale, es. circa 90-140 € a/r"}],
   "tips": ["consiglio pratico"],
   "local": "come muoversi sul posto: mezzi, biglietti, app, taxi, costi",
   "iataFrom": "codice IATA aeroporto di partenza consigliato o stringa vuota",
   "iataTo": "codice IATA aeroporto di arrivo consigliato o stringa vuota",
   "stationFrom": "stazione di partenza o stringa vuota",
   "stationTo": "stazione di arrivo o stringa vuota"
 },
 "lodgingAdvice": "se l'alloggio non è scelto: 2-3 zone consigliate e perché; altrimenti un commento sulla posizione dell'alloggio",
 "pack": [{"cat":"Documenti","ico":"emoji","items":["..."]}],
 "budget": [{"cat":"trasporto|alloggio|pasti|visite|spostamenti|extra","label":"voce","amt":0,"per":"persona|gruppo","note":"come è stimato"}],
 "outline": [{"date":"AAAA-MM-GG","title":"titolo della giornata","theme":"zone e idea della giornata in una riga"}]
}
Vincoli: "cards" 3-4 schede (muoversi sul posto, soldi e trappole per turisti, numeri utili, cosa mangiare); "phrases" 8 frasi; "options" 3 opzioni ordinate dalla più conveniente; "pack" 5-6 categorie tarate su destinazione, stagione, mezzo e durata; "budget" 7-10 voci in euro che coprono tutte e sei le categorie, con importi realistici per la fascia di spesa indicata; "outline" esattamente una riga per ciascuna di queste date: ${inp.dates.join(', ')}. Il primo giorno tiene conto dell'arrivo, l'ultimo della partenza.`;
  return askJson(STYLE, user, 12000);
}

async function genDays(inp, base, chunk) {
  const user = `${brief(inp)}

Quadro già deciso del viaggio:
${(base.outline || []).map(o => `${o.date}: ${o.title} (${o.theme})`).join('\n')}

Scrivi adesso il programma dettagliato SOLO per queste date: ${chunk.join(', ')}.
JSON con questa struttura esatta:
{
 "days": [{
   "date": "AAAA-MM-GG",
   "title": "titolo della giornata",
   "intro": "4-5 frasi che raccontano la giornata in ordine, con gli orari principali",
   "start": "HH:MM di inizio giornata",
   "items": [{
     "n": "nome della tappa",
     "sub": "sottotitolo di una riga",
     "kind": "see|eat|fix",
     "ico": "una emoji",
     "min": 60,
     "at": "HH:MM solo se la tappa ha un orario fisso (volo, treno, prenotazione, ingresso a orario), altrimenti stringa vuota",
     "lat": 0, "lon": 0,
     "price": 0,
     "priceTxt": "prezzo a persona come testo, es. 13 € · fascia oraria online, oppure GRATIS",
     "stop": "come arrivarci: fermata, linea, minuti a piedi dalla tappa precedente",
     "url": "sito ufficiale se lo conosci con certezza, altrimenti stringa vuota",
     "urlTxt": "testo del pulsante",
     "desc": "4-6 frasi: cosa si vede o si mangia, la storia in breve, il percorso consigliato",
     "tip": "il consiglio da insider: orario giusto, cosa evitare, dove prenotare"
   }]
 }],
 "parked": [ ... 1-2 tappe di riserva nella stessa forma, nella zona di questa giornata ... ],
 "todo": [{"t":"cosa prenotare","d":"dove, quando, quanto costa","u":"link ufficiale o stringa vuota","uTxt":"testo del link","pri":1}]
}
Regole: 6-9 tappe per giornata piena, in ordine geografico sensato per ridurre gli spostamenti; pranzo e cena sono tappe "eat" con locali reali; "fix" per viaggio di andata e ritorno, trasferimenti da e per aeroporto o stazione, check-in, check-out, pause in alloggio; coordinate reali e precise di ogni tappa (null per le tappe in viaggio); "price" è il costo a persona in euro (0 se gratis o già pagato); "min" è la durata in minuti; giornate che non iniziano prima delle 9:00 salvo vincoli di viaggio; "todo" solo per ciò che va davvero prenotato in anticipo, con pri 1 (subito), 2 (nelle prossime settimane) o 3 (prima di partire). Integra le richieste del programma di massima e delle reference nelle giornate giuste.`;
  return askJson(STYLE, user, 16000);
}

// Lettura delle prenotazioni caricate (PDF o immagini): voli, treni, traghetti, noleggi, alloggi.
async function genBookings(inp, files) {
  const blocks = [];
  files.forEach((f, i) => {
    blocks.push({ type: 'text', text: 'Documento ' + (i + 1) + ': ' + f.name });
    blocks.push(f.type === 'application/pdf' ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: f.b64 } } : { type: 'image', source: { type: 'base64', media_type: f.type, data: f.b64 } });
  });
  blocks.push({ type: 'text', text: `Questi sono i documenti di prenotazione di un viaggio a ${inp.dest}, dal ${inp.start} al ${inp.end}, per ${inp.people.map(p => p.name).join(', ')}.
Estrai SOLO ciò che è scritto nei documenti, senza completare o dedurre. Se un dato non c'è, stringa vuota. JSON con questa struttura esatta:
{
 "segments": [{"doc": 1, "kind": "volo|treno|bus|traghetto|noleggio|altro", "dir": "andata|ritorno|interno", "from": "città o stazione o aeroporto di partenza", "fromCode": "sigla IATA o stringa vuota", "to": "arrivo", "toCode": "sigla IATA o stringa vuota", "date": "AAAA-MM-GG della partenza", "dep": "HH:MM", "arrDate": "AAAA-MM-GG dell'arrivo", "arr": "HH:MM", "carrier": "compagnia", "number": "numero volo o treno", "pnr": "codice prenotazione", "passengers": ["nomi come scritti"], "seats": "posti, carrozza, classe, bagaglio incluso", "notes": "terminal, check-in, condizioni utili"}],
 "lodging": {"name": "", "address": "", "checkin": "AAAA-MM-GG HH:MM", "checkout": "AAAA-MM-GG HH:MM", "pnr": "", "notes": ""},
 "warnings": ["incongruenze rilevate: date fuori dal periodo del viaggio, passeggeri che non corrispondono ai partecipanti, documenti illeggibili o non di prenotazione"]
}
Un segmento per ogni tratta. "lodging" solo se c'è una prenotazione di alloggio, altrimenti campi vuoti.` });
  return askJson('Sei un assistente che legge documenti di viaggio con precisione. Consegna il risultato come oggetto JSON con la struttura indicata, senza altro testo. Scrivi le note in italiano, senza emoji.', blocks, 6000);
}

async function genBook(trip, body) {
  const user = `Fotolibro del viaggio "${trip.title}" (${trip.dest.name}, ${trip.dates.start} / ${trip.dates.end}).
Partecipanti: ${trip.people.map(p => p.name).join(', ')}.
Giornate, con tappe, righe di diario scritte dai partecipanti e didascalie delle foto:
${(body.days || []).map(d => `- ${d.date} · ${d.title}\n  Tappe: ${(d.stops || []).join(', ')}\n  Diario: ${(d.diary || []).join(' | ') || '(vuoto)'}\n  Didascalie: ${(d.caps || []).join(' | ') || '(nessuna)'}`).join('\n')}

Scrivi i testi del fotolibro. JSON:
{"title":"titolo di copertina, massimo 6 parole","dedication":"dedica di 2-3 frasi rivolta al gruppo","chapters":[{"title":"titolo della giornata","text":"3-4 frasi che raccontano la giornata usando i fatti del diario quando ci sono"}],"phrases":["6 frasi brevi da mettere tra le foto, ognuna legata a un momento preciso del viaggio"],"closing":"chiusura di 2 frasi"}
"chapters" ha esattamente una voce per giornata, nello stesso ordine. Usa i nomi dei partecipanti. Niente retorica: ironia leggera, dettagli veri.`;
  return askJson(STYLE.replace('da amico che conosce bene il posto', 'da chi ha fatto il viaggio con loro'), user, 4000);
}

module.exports = { hasClaude, genBookings, genBase, genDays, genBook, MODEL };
