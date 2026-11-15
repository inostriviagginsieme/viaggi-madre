# I nostri viaggi insieme · webapp madre

Versione 2.1.1 (15 novembre 2026). La madre raccoglie i dati di un viaggio e genera una webapp figlia con indirizzo proprio: un repository GitHub e uno Static Site Render per ogni viaggio. Alla madre accede solo l'amministratore, con PIN. Alle figlie accedono solo i partecipanti, ciascuno con utente e password rilasciati dalla madre.

## Cosa fa la madre

Il modulo chiede destinazione, città di partenza, date, numero, nomi e foto dei partecipanti, mezzo di trasporto (volo, treno, automobile), orari già noti, alloggio, programma di massima, reference, ritmo e fascia di spesa. La generazione produce un'anteprima navigabile e uno zip. La pubblicazione parte solo dopo conferma. 

## Prenotazioni caricate

Nel modulo, sotto il mezzo di trasporto, si caricano i documenti delle prenotazioni già fatte: biglietti aerei e ferroviari, traghetti, noleggi, conferme d'albergo, in PDF o foto (fino a 8 file, 7,5 MB l'uno). Claude li legge prima di disegnare il viaggio ed estrae tratte, date, orari, sigle, compagnia, numero, codice di prenotazione, passeggeri, posti e alloggio. Questi dati diventano vincoli: le tappe di viaggio del primo e dell'ultimo giorno portano gli orari veri e il resto del programma si adatta. Se la prenotazione di andata è un volo o un treno e nel modulo era indicato un altro mezzo, vale la prenotazione. Le incongruenze che Claude rileva (date fuori dal periodo, passeggeri che non corrispondono) compaiono nel registro della generazione, prima dell'anteprima.

Nella figlia, sezione Arrivo, ogni tratta è un biglietto con orari, codice e passeggeri, e i documenti originali si aprono anche offline. Stanno dentro il contenuto cifrato del viaggio, quindi li vedono solo i partecipanti. Limite: i documenti incorporati non superano circa 4,5 MB in totale; quelli oltre vengono letti ma non allegati. Senza chiave Claude i documenti vengono allegati ma non letti.

## Prenotazioni aggiunte dal wallet della figlia (v1.7)

Quando un partecipante carica un documento nel wallet della figlia (PDF o immagine), la figlia lo manda alla madre (`POST /api/wallet/:slug/read`, autenticata con il token del viaggio), Claude lo legge e la figlia applica il risultato per tutto il gruppo: le tappe prenotate entrano nel programma del giorno giusto all'orario prenotato (check-in, check-out, voli, treni, ingressi con orario), oppure sostituiscono la tappa già prevista che coprono; un alloggio diventa il punto di partenza e di rientro delle giornate comprese tra arrivo e partenza; la voce corrispondente di Cosa manca viene chiusa; la prenotazione compare in Arrivo con codice e avvertenze. Ogni lettura resta nel wallet con il riepilogo di ciò che ha cambiato e un pulsante Annulla che riporta il programma com'era. Se il documento non riguarda il viaggio (date o luogo diversi) la figlia lo conserva nel wallet e non tocca il programma. Serve la madre sveglia: su piano gratuito la prima lettura dopo una pausa può richiedere fino a un minuto.

Dalla v1.7.1 i biglietti caricati alla creazione del viaggio compaiono anche nella scheda della tappa a cui si riferiscono (stesso giorno e orario dentro la tappa, oppure stesse sigle di partenza e arrivo), con il pulsante Apri. L'abbinamento lo fa la figlia, senza Claude. La conferma dell'alloggio caricata alla creazione non è ancora abbinata alle tappe di check-in.

## Prenotazioni e documenti del gruppo (v1.8)

La linguetta Arrivo si chiama Prenotazioni e raccoglie tutto ciò che riguarda prenotare e documentare il viaggio: cosa manca, le voci da prenotare (prima sotto Altro), le prenotazioni lette, l'alloggio, i percorsi e i Documenti del gruppo (il wallet, prima sotto Altro).

I documenti aggiunti da un telefono non restano più su quel telefono. La scheda del documento (nome, tipo, tappa, chi l'ha caricato) viaggia con i dati condivisi, chiave `doc.<id>`; il file viene cifrato sul telefono con la chiave del viaggio (AES-256-GCM) e depositato nella madre (`PUT` e `GET /api/sync/:slug/doc/:id`, ramo `data` del repository del viaggio, cartella `docs/`). Gli altri telefoni lo scaricano alla sincronizzazione successiva, lo decifrano e lo tengono disponibile offline. La madre e GitHub conservano solo il file cifrato. Chi elimina un documento lo elimina per tutti i telefoni; il file cifrato resta nel ramo `data`. Limite: 10 MB per documento, oltre resta solo sul telefono che l'ha caricato. I documenti già presenti su un telefono prima della v1.8 vengono condivisi alla prima sincronizzazione.

## Aggiornare una figlia già pubblicata (v1.8.1)

Le figlie sono siti a sé: una modifica alla madre non le cambia da sola. In Archivio, sul viaggio, il pulsante Aggiorna l'app sostituisce nel repository del viaggio solo il codice (`pwa/index.html`, `pwa/app.js`, `pwa/sw.js`). Programma cifrato, credenziali, immagini e dati del gruppo (spese, foto, diario, documenti) non vengono toccati e Claude non viene chiamato. Render ripubblica il sito in uno o due minuti; sui telefoni: Altro, Aggiorna. Le funzioni che dipendono da contenuti generati (per esempio le Altre mete) richiedono comunque un viaggio generato con la versione nuova.

## Lettura dei documenti e posta dei viaggi (v1.9)

Lettura automatica. Ogni documento del gruppo non ancora letto viene letto una volta, senza che nessuno prema nulla: vale anche per i documenti aggiunti prima che la lettura esistesse. Accanto a un documento non letto c'è il pulsante Leggi. La lettura chiude anche i promemoria della lista Da prenotare che il documento soddisfa (per esempio «prenotare l'hotel per le notti dell'11 e 12» quando arriva la conferma di quell'hotel); Annulla li riapre. Verificato il 15/11/2026 sul viaggio vero con la conferma Booking: Claude ha letto in 21 secondi, ha sostituito le due tappe generiche di check-in e check-out e ha segnalato l'assenza di parcheggio.

Posta dei viaggi. La madre legge la casella indicata in `GMAIL_USER` (IMAP di Gmail, con una password per le app in `GMAIL_APP_PASSWORD`: richiede la verifica in due passaggi sull'account Google). Per ogni messaggio nuovo Claude decide a quale viaggio appartiene confrontando le date del servizio con i periodi dei viaggi in archivio (tolleranza di un giorno), poi la madre deposita tra i documenti del gruppo di quel viaggio gli allegati PDF o immagine e, quando il testo contiene dati utili, il messaggio stesso impaginato in PDF. I file sono cifrati con la chiave del viaggio, che la madre recupera con ADMIN_PIN o CRED_SECRET. Alla prima apertura dell'app un solo telefono legge il documento e aggiorna il programma per tutti. In Impostazioni, Posta dei viaggi: stato, Leggi la posta adesso, registro dei messaggi e assegnazione a mano di quelli rimasti senza viaggio.

Quando legge. Ogni 5 minuti finché la madre è sveglia, all'avvio e a ogni sincronizzazione di una figlia. Sul piano gratuito di Render la madre dorme dopo 15 minuti senza traffico: in quel caso la posta viene letta appena qualcuno apre una webapp di viaggio o la madre. Per una lettura davvero continua serve il piano a pagamento. Alla prima lettura la madre prende i messaggi degli ultimi 60 giorni, 8 per volta. La casella non viene modificata: nessun messaggio è segnato come letto, spostato o cancellato.

Messaggi che non riguardano un viaggio (v1.9.2). Avvisi di sicurezza, pubblicità e notifiche vengono ignorati da soli: nel registro finiscono in un elenco chiuso, Ignorati, da cui si possono ripristinare. Un messaggio di viaggio rimasto senza viaggio mostra Assegna e Ignora. La lettura reale della casella è stata verificata il 15/11/2026 sul servizio pubblicato.

Limiti. La lettura IMAP non è coperta dai test automatici (dall'ambiente di sviluppo Gmail non è raggiungibile): il percorso collaudato parte dal messaggio già scaricato. Chiunque conosca l'indirizzo può scrivere alla casella e far entrare un documento in un viaggio: ogni modifica resta visibile tra i documenti, con Annulla. I viaggi nati fuori dalla madre non ricevono posta.

## Viaggi passati: siti ricordo, accesso famiglia, importazione in blocco (v2.0)

Sito ricordo. Un viaggio già fatto nasce con `past`: Claude non pianifica, ricostruisce il viaggio dai documenti e dagli appunti conservati, segnando come ricostruite le tappe che non risultano dalle fonti. La figlia non mostra conto alla rovescia, cose da prenotare, link di acquisto, mete in più, meteo e avvisi; la linguetta Prenotazioni diventa Documenti; restano programma correggibile, mappa, documenti del gruppo, conti, album, diario e fotolibro.

Accesso famiglia. Al posto di una password per persona e per sito, i siti importati hanno un solo utente, `famiglia`, con la password scelta dall'amministratore al momento dell'importazione (almeno 8 lettere o cifre, senza distinzione tra maiuscole e minuscole). La password non viene salvata da nessuna parte. Entrati, ognuno tocca il proprio nome per firmare foto e diario. Attenzione: il pulsante Credenziali dell'Archivio, usato su uno di questi siti, lo riporta alle password per persona.

Importazione in blocco. In Archivio, Importa i viaggi passati: si carica un pacchetto `.json` (un elemento per cartella di viaggio, con i PDF e il testo estratto da fogli, presentazioni e note), si indicano i viaggiatori abituali e la password della famiglia. Per ogni viaggio Claude inquadra destinazione, date, mezzo e viaggiatori dai documenti, poi la madre genera e pubblica senza passare dall'anteprima. I viaggi già in archivio (stessa cartella) si saltano; quelli senza date ricavabili restano in elenco come non riusciti e si creano a mano; un viaggio con date future diventa un sito completo, non un ricordo. La pagina va lasciata aperta fino alla fine: due o tre minuti a viaggio.

## Archivio compatto (v2.1)

L'elenco dell'Archivio è ordinato dal viaggio più recente al meno recente e diviso per anni, con una riga per viaggio: foto del luogo, titolo, date e partecipanti, e a destra le azioni come icone con il nome al passaggio del mouse (apri il sito, scheda, foto dal NAS, fotolibro, aggiorna l'app, nuove credenziali, copia del sito, repository). La foto del luogo arriva da Google (Places API New, con la stessa GOOGLE_MAPS_KEY: l'API va attivata sul progetto Google Cloud); se Places non è attivo si usa Wikipedia, e in mancanza l'icona dell'app. Le foto di Google restano solo in memoria e nella cache del browser, perché le condizioni di Google non ne permettono la conservazione. Prova i collegamenti ha la voce Luoghi, che dice se Places risponde.

## Foto del NAS (v2.0)

In Impostazioni si indica l'indirizzo di una cartella condivisa di un NAS Synology (link di condivisione di File Station, nella forma che compare nel browser: `https://…/sharing/CODICE`) e le cartelle delle foto, organizzate per anno e mese come i salvataggi automatici dei telefoni. In Archivio, Foto dal NAS su un viaggio: la madre elenca le foto la cui data cade nei giorni del viaggio, giornata per giornata con le anteprime; l'amministratore toglie le giornate che non c'entrano e porta le altre nell'album. Le foto entrano a 2000 pixel, 400 per volta, senza duplicati; i formati che la madre non apre (HEIC) passano dall'anteprima grande del NAS. L'abbinamento usa la data di modifica del file, che nei salvataggi dei telefoni coincide con lo scatto: non legge i dati EXIF. Indirizzo e cartelle stanno nell'archivio privato, non nel codice. Protocollo verificato dal browser sul NAS vero il 15/11/2026; il collegamento dalla madre è collaudato solo contro un NAS simulato.

## Altre mete (v1.7)

Alla creazione del viaggio Claude prepara, oltre al programma, una quindicina di mete non in programma, divise per categoria, ciascuna con durata, costo, link di prenotazione e l'indicazione della tappa che può sostituire. Nella figlia stanno sotto Viaggio, scheda Altre mete: con Metti in programma si sceglie il giorno e la tappa entra con orari, tragitti e costi ricalcolati. Con Una meta vostra il gruppo aggiunge un luogo proprio (nome, indirizzo o coordinate, durata), condiviso tra i telefoni e riportato nel fotolibro. Le altre mete nascono con il viaggio: i viaggi generati prima della v1.7 hanno solo Una meta vostra.

## Cosa manca, link di prenotazione, città vicine

Claude confronta le prenotazioni lette con le date del viaggio ed elenca ciò che manca: notti senza alloggio, tratte senza biglietto, trasferimenti, noleggi. La madre costruisce per ogni voce i link diretti, con date e persone già inserite: Booking e Kayak per gli alloggi, Kayak e Google Voli per i voli, Kayak per le auto, Rome2Rio e Google Maps per treni, bus e trasferimenti. Nella figlia stanno in Arrivo, sezione Cosa manca al viaggio, e ogni voce si segna come prenotata per tutto il gruppo. Formati verificati dal browser il 15/11/2026: Booking, Kayak voli, Kayak auto, Rome2Rio. Non verificato: la ricerca di GetYourGuide.

Ogni tappa ha nella scheda il link di prenotazione diretto quando Claude lo conosce, il sito ufficiale, la ricerca di biglietti e visite guidate su GetYourGuide e la scheda Google con orari, recensioni e prenotazione. La vista Tavola raccoglie pranzi e cene con quando prenotare e piano B. In Meta ci sono le città e i luoghi vicini, con attrazioni note e link, e i consigli operativi con spunta.

## Dalla webapp Parigi 2027

Confronto con la versione 9 di Parigi (15/11/2026). Già presenti: programma modificabile con ricalcolo, giornate, mappa, wallet, spese, album, diario, checklist, frasi con pronuncia, scheda Adesso, meteo, avvisi, calendario, stampa, ricerca. Aggiunte nella v1.6: vista Tavola, numero dei taxi in testa a ogni giornata, tappa a sorpresa che si svela da sola, video o reel di apertura, pulsante di installazione, invio dei documenti del wallet, richiamo serale al diario, diario nella stampa, schede pratiche e città vicine nella ricerca, pulsante Sulla mappa nella scheda. Non riportate: la mappa disegnata a mano di Parigi (sostituita dalla mappa interattiva, che vale per ogni destinazione), il visore dei documenti dentro l'app (si aprono in una scheda), lo svelamento della sorpresa con cinque tocchi.

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

Stile, dalla v1.6: copertina a tinta piatta con il nome della destinazione e l'anno in un carattere grande e pieno e l'illustrazione del simbolo del luogo; interno arioso su fondo chiaro, titoli in serif (Giorno 1, la data in basso), tre dati della giornata con piccoli segni colorati, la prima foto del giorno grande accanto al testo, timbro di viaggio, didascalie in corsivo. Dopo il frontespizio c'è la pagina Il percorso: una mappa schematica disegnata dalle coordinate delle tappe, un colore per giorno. L'illustrazione di copertina la genera Gemini alla creazione del viaggio (il colore di fondo della copertina si legge dall'immagine); senza Gemini la copertina usa un motivo grafico. Caratteri del PDF: Titan One, Cormorant Garamond, DM Sans.

Dalla sezione Foto della figlia un partecipante impagina il fotolibro. La madre compone un PDF A4 orizzontale (297 x 210 mm, senza abbondanze, margini di 18 mm, pagine pari, minimo 24). I testi sono quelli scritti da Claude con il pulsante dedicato; senza, il libro usa titoli e introduzioni del programma. Il PDF si sfoglia da un link firmato.

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

Claude è invitato a consegnare ogni risultato come argomento di uno strumento, che l'API restituisce già interpretato. L'obbligo di usare lo strumento non è ammesso da tutti i modelli (errore 400 del 15/11/2026 con `claude-sonnet-5-5`), quindi è un invito: se il modello rifiuta gli strumenti la madre passa al testo e lo ricorda. Il testo malformato, per esempio per una virgoletta non protetta, viene riparato prima di essere letto. Ogni chiamata ha tre tentativi, il secondo e il terzo con testi più brevi. Il programma si genera una giornata per chiamata: se una fallisce le altre restano e il registro lo segnala.

In Impostazioni, il pulsante Prova i collegamenti fa una chiamata minima a Claude, Gemini, Google, GitHub e Render e dice per ciascuno se funziona. Va premuto dopo ogni aggiornamento, prima di generare un viaggio.

## Collaudo

`npm test` avvia la madre senza chiavi, genera un viaggio di prova e verifica con due telefoni simulati accesso, cifratura, sincronizzazione, conti, mappa, foto, archivio e rigenerazione delle credenziali (85 controlli, compresi lettura di una prenotazione dal wallet, inserimento in programma all'orario prenotato e annullamento). Non sono collaudate in questa versione le chiamate reali a Claude, Gemini, Google, GitHub e Render: richiedono le chiavi.

## Struttura

`server.js` rotte e lavori · `lib/ai.js` Claude · `lib/gemini.js` immagini · `lib/geo.js` Google, Wikipedia, Open-Meteo · `lib/build.js` costruzione della figlia · `lib/creds.js` credenziali e cifratura · `lib/github.js`, `lib/render.js` pubblicazione · `lib/sync.js` dati condivisi · `lib/archive.js` archivio permanente · `lib/book.js` impaginazione del fotolibro · `lib/peecho.js` ordine di stampa · `template/` la webapp figlia · `public/` l'interfaccia della madre.
