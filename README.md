# Car Flopper

Ripara auto distrutte **insieme ai tuoi amici**, in 3D, direttamente su iPhone.

Un garage, un'auto incidentata, fino a 4 meccanici collegati con un codice stanza: cammini nel garage, ti avvicini al pezzo rotto e lo ripari tenendo premuto. In due sullo stesso pezzo si va piu' veloci. Sistema tutto e sblocchi l'auto successiva.

## Scarica l'ultima versione

[![Download IPA](https://img.shields.io/badge/SCARICA-ultima%20IPA-orange?style=for-the-badge)](https://github.com/federicotaar/car-flopper/releases/tag/v2026.11.02.12)

Oppure scegli una versione specifica dalla tab [Releases](https://github.com/federicotaar/car-flopper/releases).

## Installazione (iPhone, gratis)

Serve un Apple ID gratuito, niente account developer a pagamento.

1. Installa **AltStore** o **Sideloadly** sul tuo computer.
2. Scarica il file `.ipa` dal link qui sopra.
3. Installa l'IPA sul tuo iPhone con AltStore/Sideloadly.
4. Con l'Apple ID gratuito l'app va rinnovata ogni 7 giorni (AltStore lo fa in automatico sullo stesso Wi-Fi).

## Come si gioca

- **Crea garage**: genera un codice da 4 lettere e mandalo agli amici.
- **Entra**: inserisci il codice e scegli il tuo nickname. Niente account, niente email.
- **Ripara**: joystick a sinistra per camminare, trascina a destra per guardarti intorno. Quando sei vicino a un pezzo rotto compare il pulsante: tieni premuto per ripararlo.
- **Co-op**: piu' persone sullo stesso pezzo = riparazione piu' veloce.
- **Sblocca**: sistema l'auto per passare alla successiva. 3 auto: Rusty Coupe, Sideways 500, Garage Legend.

## Com'e' fatto

- **App**: Swift nativo + SceneKit (grafica low-poly costruita in codice, zero asset a pagamento).
- **Multiplayer**: Cloudflare Worker + Durable Objects (websocket) sul piano gratuito. Il server e' in `server/`.
- **Build**: GitHub Actions compila l'IPA non firmato a ogni push; ogni versione resta pubblicata nelle Releases.

## Stato

Il prossimo test della mano corregge la posa di riposo e mantiene il primo tratto dell'avambraccio in linea con il polso. Verifica visiva in corso: posa di riposo migliorata; schermo diagnostico verificato, contatto della chiave migliorato; manica continua nella chiave verificata; test di curva morbida sopra il pavimento in corso, naturalezza non ancora approvata. Prossima cattura diagnostica del pugno da sei lati, senza modifiche alla geometria di gioco. Non ancora incluso nell'IPA pubblicata.

In sviluppo attivo. La versione nelle Releases e' una **prerelease non verificata**: compila e il server multiplayer e' online e testato, ma l'app non e' ancora stata provata su un iPhone vero. Diventera' una release stabile dopo il test su dispositivo.

Funziona: lobby con codici stanza, 3D con camminata, riparazioni co-op in tempo reale, sblocco auto. Bug e idee: apri una issue.

---

_Car Flopper non e' affiliato con nessuna casa automobilistica. Le auto sono modelli low-poly originali disegnati in codice._
---

## English

### What is Car Flopper?
Repair wrecked cars **together with your friends**, in 3D, directly on iPhone.

One garage, one wrecked car, up to 4 mechanics connected by a 4-letter room code: walk around the garage, get close to a broken part, and hold to repair it. Two people on the same part repair faster. Fix everything to unlock the next car.

### Download
[![Download IPA](https://img.shields.io/badge/DOWNLOAD-latest%20IPA-orange?style=for-the-badge)](https://github.com/federicotaar/car-flopper/releases)

### Install (iPhone, free)
Requires a free Apple ID — no paid developer account.

1. Install **AltStore** or **Sideloadly** on your computer.
2. Download the `.ipa` from the link above.
3. Install the IPA on your iPhone with AltStore/Sideloadly.
4. With a free Apple ID the app must be re-signed every 7 days (AltStore does this automatically on the same Wi-Fi).

### How to play
- **Create garage**: generates a 4-letter code to send to friends.
- **Join**: enter the code and pick a nickname. No account, no email.
- **Repair**: left joystick to walk, drag on the right to look around. When close to a broken part a button appears: hold to repair.
- **Co-op**: more people on the same part = faster repair.
- **Unlock**: fix the car to move to the next. 3 cars: Rusty Coupe, Sideways 500, Garage Legend.

### How it's built
- **App**: native Swift + SceneKit (low-poly graphics built in code, zero paid assets).
- **Multiplayer**: Cloudflare Worker + Durable Objects (WebSocket) on the free tier. Server lives in `server/`.
- **Build**: GitHub Actions compiles an unsigned IPA on every push; every version is published in Releases.

### Status
Active development. The released build is an **unverified prerelease**: it compiles and the multiplayer server is online and tested, but the app has not yet been run on a real iPhone. It becomes a stable release after on-device testing.

Works: room lobbies with codes, 3D walking, real-time co-op repairs, car unlocking. Bugs and ideas: open an issue.

---

_Car Flopper is not affiliated with any automaker. Cars are original low-poly models drawn in code._

### Private validation 204

Room phase watchers are cancelled on leave and replacement, then recheck current room identity after every suspension. Simulator validation exercises stale phase/error callbacks, current-room transitions and leave/re-entry in the real app before normal gameplay capture. Installed-app204 compile and all five lifecycle cases passed; normal gameplay204 still reset during screwdriver after diagnostics and wrench completed. This does not diagnose or fix reset-by-peer transport failures. Hand geometry and the smooth sleeve202 remain unchanged.

### Private validation 205

Simulator repeating timers and delayed actions now belong to their room and are cancelled on leave. Left rooms stop ticking and ignore queued session callbacks. Installed-app tests add timer/delay cancellation and queued callbacks. Installed-app205 compiled and passed all seven lifecycle checks, including timer/delay cancellation and queued callbacks. One continuous gameplay room completed all four scripted repair rounds with no reset/TIMEOUT log matches. This single clean run does not erase204 transport failure; no reconnect or server change is included.

### Private validation 206

Dropped websocket connections now reconnect automatically instead of ending the session: the replacement socket is opened before the old one is retired so a solo room never goes empty mid-rejoin, and only exhausted retries surface a connection error. A rejoin gets a fresh player id; the server reaps the old entry and host ownership returns to the rejoined player. A still-held repair is re-sent after resume. Empty rooms stay resumable for two minutes so a solo player can rejoin and resume; fresh claims take the code only after the grace. Room-logic tests cover the grace, rejoin-state preservation and stale reclaim locally and pass. Installed-app206 compiled and passed all fourteen lifecycle checks: the live reconnect check rejoined the production room with a fresh player id in under a second, the ghost entry was reaped, host ownership returned to the rejoined player, no menu bounce occurred, and a dead room still gives up to menu after retries. The server grace change is committed but not deployed (no deploy path in-repo). The Cloudflare-side cause of the original reset remains unproven, and none of this changes hand geometry or realism.

### Private hand update 207

The pinky on round tool handles now closes with the other fingers: the pinky segments were rotated about the grip bore (57 degrees in roundGrip, 50 in roundSqueeze) and seated on the handle, touching only the roundGrip/roundSqueeze pose data in HandPoseV2Round.swift. Simulator repair captures compared with the pre-change control show the pinky wrapping the screwdriver handle at the roof and a slightly tighter fist at the workbench. The comparison cameras are only approximately matched, so this is a bounded improvement, not a finished hand. Known remaining defects: faceted silhouettes, blunt fingertips, and a dark jagged shard at the base of the index knuckle that predates this change - a sliver of faces there folds inside-out when the index finger curls, unchanged here. No release yet.
