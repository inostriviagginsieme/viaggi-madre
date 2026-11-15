# I nostri viaggi insieme · webapp madre

Versione 1.4 (15 novembre 2026). La madre raccoglie i dati di un viaggio e genera una webapp figlia con indirizzo proprio: un repository GitHub e uno Static Site Render per ogni viaggio. Alla madre accede solo l'amministratore, con PIN. Alle figlie accedono solo i partecipanti, ciascuno con utente e password rilasciati dalla madre.

## Cosa fa la madre

Il modulo chiede destinazione, città di partenza, date, numero, nomi e foto dei partecipanti, mezzo di trasporto (volo, treno, automobile), orari già noti, alloggio, programma di massima, reference, ritmo e fascia di spesa. La generazione produce un'anteprima navigabile e uno zip. La pubblicazione parte solo dopo conferma. 

## Prenotazioni caricate

Nel modulo, sotto il mezzo di trasporto, si caricano i documenti delle prenotazioni già fatte: biglietti aerei e ferroviari, traghetti, noleggi, conferme d'albergo, in PDF o foto (fino a 8 file, 7,5 MB l'uno). Claude li legge prima di disegnare il viaggio ed estrae tratte, date, orari, sigle, compagnia, numero, codice di prenotazione, passeggeri, posti e alloggio. Questi dati diventano vincoli: le tappe di viaggio del primo e dell'ultimo giorno portano gli orari veri e il resto del programma si adatta. Se la prenotazione di andata è un volo o un treno e nel modulo era indicato un altro mezzo, vale la prenotazione. Le incongruenze che Claude rileva (date fuori dal periodo, passeggeri che non corrispondono) compaiono nel registro della generazione, prima dell'anteprima.

Nella figlia, sezione Arrivo, ogni tratta è un biglietto con orari, codice e passeggeri, e i documenti originali si aprono anche offline. Stanno dentro il contenuto cifrato del viaggio, quindi li vedono solo i partecipanti. Limite: i documenti incorporati non superano circa 4,5 MB in totale; quelli oltre vengono letti ma non allegati. Senza chiave Claude i documenti vengono allegati ma non letti.

## Archivio di tutti i viaggi

La madre conserva ogni viaggio in modo permanente in un repository privato dedicato, `viaggi-archivio` (variabile `ARCHIVE_REPO`), che crea da sola al primo viaggio. Per ciascuno salva la scheda completa (`trip.json`), la richiesta originale senza le foto (`richiesta.json`), la copia integrale del sito (`sito.zip`) e una riga nell'indice. L'archivio non dipende dai repository delle figlie: se una figlia viene cancellata, la sua scheda e la copia del sito restano. Dall'Archivio si apre la webapp, si legge la scheda con programma, preventivo e consuntivo delle spese registrate, si scarica la copia del sito, si rigenerano le credenziali. I viaggi nati fuori dalla madre, come Parigi 2027 e Praga 2026, si aggiungono a mano dal modulo in fondo alla pagina.

Senza `GITHUB_TOKEN` l'archivio sta in una cartella locale che sul piano gratuito di Render si perde a ogni riavvio: la madre lo segnala in pagina.

Chi fa cosa:

- Claude scrive scheda della destinazione, storia, consigli pratici, frasi utili, opzioni di trasporto, programma giorno per giorno con tappe di riserva, prenotazioni da fare, lista bagagli, preventivo e, a viaggio in corso, i testi del fotolibro.
- Gemini disegna la caricatura di ogni partecipante e il logo dell'app. Senza chiave Gemini la figlia usa le foto ritagliate.
- Google Maps verifica le coordinate delle tappe e, per i viaggi in auto, calcola percorsi alternativi con chilometri, tempi e pedaggi (Routes API).
- Wikipedia e Wikimedia Commons danno le foto della destinazione. Open-Meteo dà il meteo.

## Cosa contiene una figlia

Sette sezioni: Gruppo (partecipanti con caricatura, logo), Meta (destinazione, foto, storia, meteo, schede pratiche, frasi con pronuncia), Arrivo (mezzo scelto, opzioni ordinate per convenienza, link di acquisto, strade), Viaggio (sintesi, giornate, mappa, tappe spostabili con ricalcolo di orari e costi, ricerca, stampa), Conti (preventivo per voce, spese di gruppo a N persone con quote, consuntivo, rimborsi minimi, CSV), Foto (album comune, diario, testi del fotolibro, invio a Journi, zip), Altro (prenotazioni, bagagli per partecipante, wallet dei biglietti, avvisi, calendario .ics, installazione).

È una PWA installabile che funziona offline. Programma, spese, bagagli, diario e foto sono in comune tra i telefoni del gruppo: la madre li salva sul ramo `data` del repository del viaggio.

## Grafica delle figlie

Direzione scelta da Francesco: Carta d'imbarco. L'intestazione è la carta d'imbarco del gruppo (sigle di partenza e arrivo, passeggeri, date, codice a barre, conto alla rovescia), ogni tappa è un biglietto con il talloncino dell'orario, le tappe fatte prendono il timbro, la barra in basso è fatta di cartellini da valigia. Carta color paglia e inchiostro blu notte sono fissi; il colore della compagnia cambia a ogni viaggio. Caratteri Big Shoulders Display, IBM Plex Mono e Archivo, serviti dal sito stesso per funzionare offline. Le altre due proposte scartate (Manifesto, Rivista) sono in `design/proposte.html`.

## Fotolibro stampato (Peecho)

Dalla sezione Foto della figlia un partecipante impagina il fotolibro. La madre compone un PDF A4 orizzontale (297 x 210 mm, senza abbondanze, margini di 14 mm, pagine pari, minimo 24) con copertina a carta d'imbarco, dedica e passeggeri, una apertura per giornata con testo, diario e tappe, le foto in ordine con didascalia, chiusura con le frasi e i numeri del viaggio, pagine di appunti fino al minimo di stampa, retro. I testi sono quelli scritti da Claude con il pulsante dedicato; senza, il libro usa titoli e introduzioni del programma. Il PDF si sfoglia da un link firmato.

La stampa la ordina solo l'amministratore, dall'Archivio, pulsante Fotolibro: indirizzo di spedizione, preventivo, approvazione. Il preventivo crea su Peecho un ordine sospeso e mostra libro, spedizione e totale con IVA letti dall'ordine. L'ordine parte in produzione solo con Approva e manda in stampa, che scala il credito prepagato dell'account. Prodotto: copertina rigida A4 orizzontale, carta lucida 200 g, 6,20 € più 0,21 € a pagina all'ingrosso (letto dal pannello il 14/11/2026).

Variabili: `PEECHO_API_KEY`, `PEECHO_SECRET`, `PEECHO_ENV` (`test` predefinito, `prod` per stampare davvero), `PEECHO_OFFERING_ID` facoltativa per cambiare formato. Prima del primo ordine Peecho richiede i dati societari nel pannello (Settings, API, Company details), partita IVA compresa, sia in prova sia in produzione.

Limiti. Le foto condivise sono a 2000 pixel sul lato lungo: a pagina intera stampano a circa 170 punti per pollice, sotto i 300 consigliati; con due o più foto per pagina la resa migliora. Le chiamate a Peecho non sono collaudate dai test automatici: l'unica chiamata reale fatta, dall'ambiente di prova, è stata respinta per i dati societari mancanti. Durante il preventivo e fino alla presa in carico del file la madre deve restare sveglia, perché Peecho scarica il PDF dal suo indirizzo.

## Sicurezza degli accessi

Il contenuto del viaggio è cifrato dentro il sito (`trip.enc`, AES-256-GCM). `auth.json` contiene, per ogni partecipante, la chiave del viaggio cifrata con la sua password (PBKDF2-SHA256, 310.000 iterazioni): né nomi né password in chiaro. Le password sono mostrate una sola volta a fine generazione e non sono salvate da nessuna parte. Dall'Archivio, il pulsante Credenziali ne genera di nuove per tutto il gruppo e invalida le precedenti: funziona se `ADMIN_PIN` (o `CRED_SECRET`) è lo stesso usato alla creazione.

Limiti da conoscere. L'icona dell'app, cioè il logo con le caricature, e le foto della destinazione restano pubbliche per chi conosce l'indirizzo: l'icona deve esserlo perché il telefono possa installare l'app. Le password sono di otto caratteri: adeguate a un programma di viaggio, non a dati riservati. Il repository del viaggio è privato.

## Pubblicazione della madre

1. GitHub, account `inostriviagginsieme`: crea il repository `viaggi-madre` e carica il contenuto di questa cartella (senza `node_modules`).
2. GitHub, Settings, Developer settings, Personal access tokens (classic): crea un token con scope `repo`. È `GITHUB_TOKEN`.
3. Render, account `inostriviagginsieme`: New, Blueprint, scegli `viaggi-madre`. Il file `render.yaml` crea il servizio e chiede le chiavi. Verifica in Account Settings che l'app GitHub di Render abbia accesso a tutti i repository dell'account, compresi quelli futuri: senza, Render non vede i repository delle figlie.
4. Render, Account Settings, API Keys: crea la chiave. È `RENDER_API_KEY`.
5. Google Cloud: attiva Geocoding API e Routes API e crea la chiave `GOOGLE_MAPS_KEY`. Google AI Studio: crea `GEMINI_API_KEY`.
6. Console Anthropic: `ANTHROPIC_API_KEY`.

| Variabile | A cosa serve | Senza |
|---|---|---|
| `ADMIN_PIN` | accesso dell'amministratore alla madre | chiunque abbia l'indirizzo può generare viaggi |
| `ANTHROPIC_API_KEY`, `CLAUDE_MODEL` | contenuti del viaggio | contenuti segnaposto (modalità prova) |
| `CLAUDE_WEB_SEARCH=true` | facoltativa: Claude verifica sul web prezzi e orari | Claude usa solo ciò che conosce |
| `GEMINI_API_KEY`, `GEMINI_IMAGE_MODEL` | caricature e logo | foto ritagliate |
| `GOOGLE_MAPS_KEY` | coordinate delle tappe, strade in auto | coordinate proposte da Claude, nessun percorso |
| `GITHUB_TOKEN`, `GITHUB_OWNER` | repository delle figlie, archivio permanente, dati condivisi | solo anteprima e zip, archivio non permanente |
| `PEECHO_API_KEY`, `PEECHO_SECRET`, `PEECHO_ENV` | ordine di stampa del fotolibro | il fotolibro si impagina ma non si ordina |
| `RENDER_API_KEY` | creazione automatica del sito di ogni figlia | il sito si crea a mano da Render |
| `CRED_SECRET` | facoltativa: segreto per rigenerare le credenziali, al posto del PIN | si usa `ADMIN_PIN` |

## Limiti noti

- Piano gratuito di Render: la madre va in pausa dopo 15 minuti senza traffico e riparte in circa un minuto. Le figlie sono siti statici e non vanno mai in pausa; solo la prima sincronizzazione dopo una pausa della madre è lenta. Il piano a pagamento elimina l'attesa.
- Journi non pubblica un'interfaccia per app esterne. La figlia invia le foto all'app Journi dal menu di condivisione del telefono oppure produce lo zip con foto ordinate e testi.
- I prezzi di Volagratis, Trenitalia e degli hotel non sono interrogati: non esistono interfacce aperte utilizzabili (verifica del 14/11/2026).
- Volagratis e Trenitalia non accettano ricerche già compilate dall'esterno: la figlia apre il sito e mostra i dati da inserire. I prezzi indicati da Claude sono stime.
- Itinerario, prezzi e orari sono proposte di Claude e vanno verificati prima di prenotare. Per questo la pubblicazione passa sempre dall'anteprima.

## Affidabilità della generazione

Claude consegna ogni risultato come argomento di uno strumento, non come testo: l'API restituisce un oggetto già interpretato e sparisce l'errore di JSON malformato visto al primo viaggio reale (15/11/2026). Ogni chiamata ha tre tentativi, il secondo e il terzo con testi più brevi. Il programma si genera una giornata per chiamata: se una giornata fallisce le altre restano, la giornata resta vuota e il registro lo segnala. Con `CLAUDE_WEB_SEARCH=true` lo strumento non si può imporre e si torna al testo, quindi quella modalità è meno affidabile.

## Collaudo

`npm test` avvia la madre senza chiavi, genera un viaggio di prova e verifica con due telefoni simulati accesso, cifratura, sincronizzazione, conti, mappa, foto, archivio e rigenerazione delle credenziali (40 controlli). Non sono collaudate in questa versione le chiamate reali a Claude, Gemini, Google, GitHub e Render: richiedono le chiavi.

## Struttura

`server.js` rotte e lavori · `lib/ai.js` Claude · `lib/gemini.js` immagini · `lib/geo.js` Google, Wikipedia, Open-Meteo · `lib/build.js` costruzione della figlia · `lib/creds.js` credenziali e cifratura · `lib/github.js`, `lib/render.js` pubblicazione · `lib/sync.js` dati condivisi · `lib/archive.js` archivio permanente · `lib/book.js` impaginazione del fotolibro · `lib/peecho.js` ordine di stampa · `template/` la webapp figlia · `public/` l'interfaccia della madre.
