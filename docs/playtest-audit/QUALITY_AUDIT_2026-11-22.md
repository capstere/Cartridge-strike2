# Kvalitetsgranskning av Cartridge-Strike 2, 22 november 2026

Spelprov med båda lagen tog sig från lobby till strid och tillbaka. Den automatiserade spelarplatsen och serverbotar kunde genomföra Classic-uppdrag, och samma auktoritativa regler gick att följa från två separata klienter. Den största verifierade störningen var en lång paus i en redan pågående match när någon annan skapade ett rum. Tre avgränsade ändringar gick igenom oberoende granskning. Inga ändringar gjordes i vapnens balans, banans geometri eller AI:s beslutsregler.

| Ändring | Granskat huvud | Merge till main | CI på slutrevisionen |
| --- | --- | --- | --- |
| [#34 · Endless HUD](https://github.com/capstere/Cartridge-strike2/pull/34) | `f289392a263ec55df568b41627a1241b98afde05` | `267362dbb3a39eb223c043136dbb884bd3b2d832` | [7/7](https://github.com/capstere/Cartridge-strike2/actions/runs/45029591905) |
| [#35 · Omladdning under Classic-köp](https://github.com/capstere/Cartridge-strike2/pull/35) | `89f03fbb941f46d95105464d6ed8a1251d35eb8b` | `1e3f46bf0dd5cbeb3be09782a9a59467cb38eb1d` | [7/7](https://github.com/capstere/Cartridge-strike2/actions/runs/45030381788) |
| [#36 · Samtidiga Floor 5-rum](https://github.com/capstere/Cartridge-strike2/pull/36) | `5ae888f8f3c25c3994982279d568a882b26f87e1` | `d14eed3725b4428fa61cdaa743f6543c8394e661` | [7/7](https://github.com/capstere/Cartridge-strike2/actions/runs/45031066448) |

Granskaren godkände varje exakt PR-huvud. Det första regressionsprovet för #36 visade att glasprovet använde en värld som saknade nätverkslägets glasinställning. Slutrevisionen startade tre riktiga nätverksvärldar och testade glas, vägval, reset och att ett annat rums vägar förblev intakta.

## Vad som faktiskt körs

| Ansvar | Kodväg och kontrollerad gräns |
| --- | --- |
| Spelregler | `src/fps/game.mjs`, `config.mjs` och `action-rules.mjs` driver den fasta simuleringen, utrustning, skada och vinstvillkor. Offline har en lokal Game. Servern kör samma regler via `server/headless.mjs`. |
| Multiplayer | `server/network-room.mjs` äger rum och aktörer. `match-lifecycle.mjs` och `classic-round.mjs` hanterar lagplatser, generationer och rundor. `lag-compensation.mjs` prövar historiska skott. HE och raketer har levande serverprojektiler. |
| Klient | `src/fps/network/session.mjs` tar emot Colyseus-patchar, bekräftar input och återskapar lokala rörelsesteg. `src/fps/movement.mjs` och `shared/multiplayer/world.mjs` används för samma rörelse och dörrgeometri på båda sidor. |
| AI och värld | `bots.mjs`, `bot-tactics.mjs`, `navigation.mjs` och `world.mjs` under `src/fps/` hanterar perception, uppdrag och vägval. `physics.mjs`, `doors.mjs`, `start-elevators.mjs` och `destructible-glass.mjs` avgör gångbara passager. `zombies.mjs` driver även de neutrala figurerna separat från lagplatserna. |
| Presentation | `src/fps/app.mjs` kopplar den spelbara sidan till `render.mjs`, `render-engine.mjs`, figurernas riggar och `riposte-audio.mjs`. `floor-audio.mjs` äger Dansmannens musik. `combat-hud.mjs`, `focus-hud.mjs`, `minimap-cache.mjs` och `mobile-controls.mjs` delar på HUD, karta och touch. |
| Åtkomst | `server/access.mjs`, `pilot-access.mjs` och `local-server.mjs` avgränsar ursprung, privat inloggning, anropsstorlek och antal rum. `server/team-comms.mjs` använder spelarens aktiva plats och liv samt sänder radio till lagkamrater. Annat replikerat rumstillstånd har annan synlighet. |
| Distribution | `tools/build-network.mjs`, `build-info.json` och `shared/multiplayer/build.mjs` binder ihop server, klient, karta och kollisionskontrakt. `deploy/pilot/stage-release.sh` och den versionsbundna `deploy/online/manage.py` sköter staging, tomrumskontroll, verifiering och återställning. GitHub Pages publicerar offlineversionen. |

Auditens bas var `8d59d740c1b9b8f0eef9510b836ac8b4c8ed0dc7`. Skillnaden från då installerade `d8e780acae2d9998b2e2cf0d7f719e0c958b0fb9` bestod av handovertext. Den aktiva banan läses från `levels/manifest.json`. Den äldre syntetiska nätverkskartan, Frontline och historiska prov är inte spelarens aktuella Floor 5. Nätverksservern använder de låsta Colyseus-paketen i `server/package-lock.json` och webbläsaren den paketerade SDK:n. Delar av banan importeras från `furniture-editor/build/` och `furniture-editor/library/`.

## Fel och observationer

| Prioritet | Vad spelaren märker och när | Orsak, belägg och åtgärd |
| --- | --- | --- |
| P1, lindrat | När någon skapade en andra lobby stannade en aktiv matchs positionsuppdateringar cirka tre sekunder. | `server/headless.mjs`, `src/fps/world.mjs`, `src/fps/navigation.mjs` och `src/fps/bot-tactics.mjs` byggde hela grafen och de taktiska startvägarna synkront för varje rum. Processprofilen lade cirka 33 respektive 29 procent där. PR #36 återskapar separata noder och kanter från en mall knuten till kartfilens innehåll och kopierar startvägarna. Ett kallt rum byggs fortfarande från grunden. |
| P2, rättat | En Classic-överlevare med ett delvis tömt magasin kunde se omladdningen löpa ut under köpperioden och ändå stå kvar med för få patroner. | Köpgrenen i `src/fps/game.mjs` hoppade över överföringen vid vapnets deadline. Före ändringen stod P9 kvar på 19/80 efter 2,017 s trots en deadline på 1,55 s. PR #35 använder samma slutförande i köp och strid. Ett verkligt vapenbyte avbryter det. |
| P2, rättat | I offline Endless med kontrollområde skrev två HUD-paneler över varandra. På en emulerad liggande vy, 844 × 390, överlappade de med 340 × 36 CSS-pixlar i Ren. | `src/fps/combat-hud.mjs` dolde målremsan korrekt. `src/fps/app.mjs` visade den igen senare i samma uppdatering. PR #34 begränsar Classic-specifik synlighet till Classic online. Överlappningen blev 0 och kontrollpanelens storlek förblev 340 × 45. Full hade redan 0 överlappning på denna skärm men visade en redundant remsa. |
| P2, uppmätt | Även en ensam aktiv TDM-match kan få sena uppdateringar vid botvägval. | I sex körningar låg 97,3–98,6 procent av den dyraste tickens exekvering i väganrop. I ett separat 118,29 ms intervall tog föregående tick 96,10 ms, varav 94,31 i vägval. Mätverktygets stickprov tog ytterligare 21,01 ms. Det går inte att tillskriva samtliga observerade pauser en enda orsak. |
| P2 i dubbel mjukvarurendering | En raket kan explodera tyst och en bekräftad radioorder sakna replik. Både strid och undertexter fortsätter. | På aktuell kod kom tre av fyra raketljud och den egna radiorepliken till `src/fps/audio.mjs` efter gränsen på 400 ms i speltid. Separat accelererad CI klarade slutprovet. Frekvensen på fysiska spelenheter är okänd. Behåll gränsen tills tidsstämplar från en riktig enhet finns. |
| P3, bekräftat i komponentprov | Flera lokalt förutsagda nätskott kan visa en enda utkastad hylsa. En avbruten gevärsomladdning kan lämna en kort ljudeffekt kvar. | `src/fps/effects.mjs` behandlar händelser som saknar serienummer som samma händelse. Fem egna skott gav en hylsa i effekthanteraren. `src/fps/reload-foley.mjs` nycklar rösten med aktörsobjektet medan `src/fps/network/session.mjs` ersätter objekt vid uppdatering. Ett avbrott gav noll stoppanrop efter objektbyte och ett stopp med samma objekt. Inget av proven visade ändrad ammunition eller skada. |

De två tidigare rapporterade lokala golvspärrarna saknar verifierade koordinater. Dörrprovet använder 51 dörrar från två håll. Att de passagerna fungerar prövar ett annat påstående än att hela golvet är fritt från fel.

### Vad som skyddar rättningarna

- **#34.** `tools/mobile-smoke.cjs` kontrollerar panelernas synlighet under aktiv Endless. Det separata Pi-provet mätte panelernas rektanglar i båda HUD-lägena. Riskytan var att dölja Classic-målet eller åskådarens information. CI startade båda lägena och prövade resultat och åskådarvy.
- **#35.** Två regressionsfall i `tools/multiplayer-foundation.test.mjs` misslyckades i ursprunglig kod. Båda passerade efter ändringen. `tools/online-classic-browser.mjs` lämnade en spelare vid liv med delvis tömt magasin, bytte runda och tryckte på touchknappen för omladdning. Serverns ammunition och HUD uppdaterades under köpperioden. Byte av vapen, reservammunition, död och rundgräns var de viktiga riskerna. Endast den redan accepterade omladdningen får avslutas.
- **#36.** `server/test/prepared-floor-navigation.test.mjs` jämför riktade kanter, kostnader och motsvarande vägar, bryter glas i ett rum och återställer det medan två andra rum behåller sin egen geometri och navigering. Att dela muterbara noder eller återanvända en väg genom återställt glas var de huvudsakliga riskerna. `tools/network-room-startup.mjs` mäter ett nytt rums påverkan från en separat ansluten SDK-process.

## Spelprov och vad de mäter

- **Offline Classic.** Renderad Chromium på Pi, Floor 5, seed 42, Analysts, en spelare och nio riktiga botar, fem zombies och Dansmannen. Lagval, start, köp av rustning, radio, rörelse, pistolskott och omladdning gick genom spelkontrollerna. Matchen spelades till fem riktiga elimineringsvinster på 386,98 simulerade sekunder. Resultatskärmen visade 5–0 och knappen återförde spelaren till lobbyn. Provet snabbade upp den ordinarie fasta klockan. Spelaren stod stilla efter öppningskontrollerna.
- **Offline Endless.** Counter Analysts valde raketkastaren i utrustningsmenyn. Två skott mot golvet och en omladdning gav 100 → 25 → 0 HP och registrerad självdöd utan lagpoäng. Åskådarvyn, återkomst med 100 HP, paus, fortsatt tid efter återupptagande och återgång till lobbyn fungerade. Båda offlineflödena kördes på `89f03fbb941f46d95105464d6ed8a1251d35eb8b`.
- **Multiplayer.** Separata Chromium-klienter och emulerad touch går genom de verkliga lobby-, meny- och spelkontrollerna. CI har scenarier för privat inloggning över HTTPS/WSS, muslås, utrustning, glas, HE, raketer, Classic-köp, eskort, plantering och desarmering, TDM-omspel samt synlig Dansman med positionsljud. Platser och vissa tidsgränser sätts för att öva särskilda situationer. Nätverksmatrisen använder två renderade klienter och upp till åtta extra protokollklienter. De 24 allmänna livscyklerna kontrollerar bland annat lyssnare, modeller och GPU-resurser. Residenternas återanslutning, död och nya liv har ett eget prov.
- **Kontroll och säkerhet.** Tester av auktoritativa regler övar lagbyte, värdbyte, reservplatser, död, gamla kontrollgenerationer, projektilägare, tre verkliga botsvårigheter och eget lag med friendly fire av och på. Privata lagmeddelanden prövas med lagkamrat och motståndare. Läskontrollen omfattade även sessionens behörighet, storleks- och kögränser samt städning. Ordinarie spelarflöden används publikt. Fysisk iPhone, fysisk Android, hörselbedömning och subjektiv vapenbalans är **NOT RUN**.

På slutrevisionen gick fyra ytterligare renderade offlineprov på Floor 5 igenom utan sidfel. Spelaren tog sig 122 m till North Laboratory och planterade själv. I motståndarlaget gick spelaren 35 m och desarmerade en botplanterad bomb genom att hålla interaktionsknappen i fem spelsekunder. Räddningsprovet gick 234 m. Spelaren eskorterade ett gisslan, en bot det andra och båda nådde räddningszonen. Efter en riktig död visade åskådarkameran lagkamraterna C-02 → C-03 → C-02 när spelaren bytte framåt och bakåt. Varje scenario hade tio lagaktörer och fem vanliga zombies. Testföraren använde motorns navigeringsgraf för hörnval, skickade syntetiska tangent- och musrörelser och stegade den vanliga simuleringen. Förflyttningen gick genom ordinarie kollision. Proven verifierar passage och målinteraktion. Hur lätt en ny spelare hittar på egen hand återstår att bedöma.

Ett första macOS-försök på #34 registrerade inte den flygande raketmodellen före nedslag på den touchstyrda klienten. Den andra klienten renderade projektilen och båda fick ljud och samma dödstillstånd. Omkörning på samma commit passerade, liksom efterföljande #35 och #36. Separata historiska Pi-prov hade visat raket- och radiohändelser efter ljudmotorns åldersgräns på 400 ms i `src/fps/audio.mjs`. Hårdvaruaccelererad CI hade också ett enstaka missat ljud i föregående leverans. Det finns inte stöd för att varje sådan miss orsakas av mjukvarurendering. Ljudets åldersgräns behölls.

Samtliga sju slutjobb godkändes. Nätverksmatrisens sju scenarier täckte 2–10 platser och 0–250 ms simulerad tur-och-retur-tid. Det största fallet hade två riktiga webbläsare och åtta SDK-klienter. Slutrevisionen passerade även 236 spel-/verktygstester, 41 servertester och 102 dörransatser.

Det renderade startprovet i `tools/match-flow-browser.mjs` fördröjde en inläsning, avbröt den, klickade Start följt av Enter och återhämtade sig efter HTTP 503 genom att klicka Försök igen. Det provet använde den syntetiska testnivån. Separata nivåtester validerade Floor 5, och modellproven kontrollerade delade klipp, separata animationstillstånd för aktörerna och städning av ljud och zombiemodeller. `tools/mobile-reliability-browser.mjs` skickade samtidiga touchhändelser för rörelse, blick och eld, roterade till porträtt, kontrollerade paus och startade om. De 24 rumscyklerna är återinträden i multiplayer. Den här körningen innehöll ingen privat Studio-export genom hela den sparade karaktärens väljarflöde. En användares verkliga sparade figurer och nivåer ingick inte i underlaget.

Den paketerade releasen innehåller 519 kontrollerade runtimefiler inklusive `fps/index.html` (58 766 334 byte). `tools/build-network.mjs --check` validerar klient/server-kontraktet. `tools/verify-owner-runtime.mjs` verifierar det paketerade spelet. Tidigare testdata för andra releaser har behandlats som jämförelsematerial.

I slutkörningens två 960 × 540-bilder gick det att läsa hälsa och ammunition i varsitt nedre hörn utan att de korsade siktet. Resultattavlan visade fem rader per lag och den egna raden var markerad med både bakgrund och ”du”. Kart- och radiohjälpen under minikartan var den minsta texten i stridsvyn. Det motiverar läsbarhetsprov i handen innan någon permanent utvidgning av HUD:en övervägs. De renderade flödena mäter att kontrollerna går att använda. De ger inget mänskligt omdöme om rekylkänsla eller hur rolig nästa match blir.

På den faktiska slutkoden kördes även en riktad lokal ljudspårning med två synliga Pi-webbläsare, åtta botar och aktiva Web Audio-kontexter. Klienterna mottog samma raket. Ålder nedan är skillnaden mellan händelsens speltid och klientens simulerade tid vid anropet till ljudhanteraren. På datorvyn var avfyrningen 219 ms gammal och schemalade två ljudkällor. Explosionen var 2 653 ms gammal och föll bort. På touchvyn föll både avfyrning (1 199 ms) och explosion (849 ms) bort. Den egna radiotexten visades men ljudet kom till ljudhanteraren efter 4 383 ms och spelades aldrig. Motståndarens ljudhanterare såg ingen radiohändelse. Lagpaketens nätverkssynlighet kontrollerades i separata nätprov. Det dubbelrenderade ljudprovet **misslyckades** på Pi:n. Det visar att ljud faktiskt kan utebli under den belastningen. Provet avgör inte hur vanligt det är på en telefon eller en speldator. På båda plattformarna behövs tidsstämplar för patchankomst, bild och ljud innan åldersgränsen kan omprövas.

## Rumsstart under TDM

|Mått i millisekunder|Före|Efter|
|---|---:|---:|
|Första lobby, två kalla processer med kontinuerlig SDK|3 152–3 214|3 201–3 274|
|Ytterligare lobby, första rum med kontinuerlig 60 Hz-SDK|3 016–3 080|951–1 011|
|Faktiskt tickintervall i befintligt rum, kontinuerlig SDK|2 982–3 037|929–1 016|
|Andra rummets grafbygge, kontinuerlig SDK|1 087–1 175|28–41|
|Patchgap till fortsatt ansluten SDK med 1 s inmatningsgräns, direkt parent/slutrevision|2 977 och 2 893|973 och 994|

Kontinuerliga SDK-sändningar gav stängning 4002 på båda försöken på dåvarande driftbygge och även i extra kontroll på direkta parenten, där kärnan loggade att meddelandegränsen träffades. Fyra extra kandidatrum bevarade den ständigt sändande SDK-klienten. SDK-varianten med spelets gräns för inmatning efter 1 s utan patch behöll samtliga anslutningar före och efter. Detta prov använder ingen renderer eller reconnect-watchdog. Före höll SDK:n 119 och 114 ramar, efter noll vid båda rumsskapandena. Med två faktiska levande rum i denna variant var RSS 296,5/289,0 MiB före/efter vid första extra lobbyn och 345,8/342,1 MiB vid andra. Ett processpar med naturlig GC kan inte avgöra en minnesförbättring. Den återstående nästan sekundlånga pausen är mätbar.

Den separata CPU-profilen av gammal kod visade 33,4 % grafkonstruktion, 28,7 % ursprungliga taktiska rutter, 13,0 % fysik, 4,3 % GC. Den verifierade direkta orsaken är synkront nybygge på eventloopen som också driver det befintliga rummet. Processens enda grundmall för aktuell Floor 5-filhash håller 66 714 numeriska nod-/kantfält och de fyra förberäknade ruttsamlingarna. Varje rum äger sina grafobjekt, vägcache, dörrar och glas.

## Ticktid, intervall och resurser

Pi 5 rev 1.1 med fyra Cortex-A76-kärnor, Node 26.13.0 i provet och 26.13.1 i drift. Hela Floor 5, 60 Hz, patch var 50:e ms och naturlig GC. Varje process fick 5 s uppvärmning. Följande percentiler och överskridanden omfattar därefter hela mätfönstret (90 s i TDM, 180 s i Classic). Ett loopbackanslutet SDK-säte skickade rörelse och eld tillsammans med nio verkliga serverbotar på Normal. Residentvalen gav antingen noll eller sex figurer. Ingen webbläsare körde samtidigt. CPU avser en kärna och utgående trafik WebSocket-nyttolast till en klient.

| Revision, läge och figurer | Tickar | Arbete p50/p95/p99/max ms | >33/50/100 | Intervall p50/p95/p99/max ms | >33/50/100 | CPU % | RSS/heap MiB | Ut KiB/s |
| --- | ---: | --- | --- | --- | --- | ---: | --- | ---: |
| Driftbas 1, TDM, 0 | 5402 | 1.07 / 5.45 / 16.99 / 82.03 | 17/8/0 | 16.17 / 19.92 / 32.31 / 82.80 | 23/8/0 | 14.5 | 249.6/98.7 | 23.70 |
| Driftbas 1, TDM, 6 | 5399 | 1.40 / 5.67 / 18.80 / 81.72 | 15/6/0 | 16.16 / 22.03 / 32.44 / 117.04 | 20/7/1 | 16.5 | 261.0/115.7 | 25.49 |
| Driftbas 2, TDM, 0 | 5402 | 1.08 / 5.29 / 18.22 / 72.99 | 15/9/0 | 16.17 / 22.21 / 32.34 / 73.19 | 16/9/0 | 14.3 | 260.3/98.0 | 23.98 |
| Driftbas 2, TDM, 6 | 5402 | 1.35 / 5.79 / 19.22 / 73.71 | 16/8/0 | 16.16 / 21.57 / 32.37 / 74.62 | 20/9/0 | 16.4 | 269.8/114.9 | 25.54 |
| Driftbas 3, TDM, 0 | 5401 | 1.12 / 5.44 / 18.49 / 86.74 | 17/9/0 | 16.17 / 21.14 / 32.28 / 87.20 | 20/9/0 | 15.0 | 251.0/91.1 | 24.15 |
| Driftbas 3, TDM, 6 | 5401 | 1.34 / 5.72 / 18.87 / 76.56 | 15/6/0 | 16.17 / 21.14 / 32.43 / 93.97 | 21/6/0 | 16.8 | 259.2/88.7 | 25.69 |
| Kandidat, TDM, 0 | 5403 | 1.17 / 6.00 / 19.83 / 81.19 | 20/10/0 | 16.16 / 22.32 / 32.48 / 81.59 | 27/10/0 | 15.2 | 264.8/107.0 | 23.66 |
| Kandidat, TDM, 6 | 5401 | 1.41 / 5.89 / 19.17 / 76.28 | 20/8/0 | 16.17 / 23.04 / 32.37 / 80.94 | 25/8/0 | 17.0 | 269.7/93.1 | 25.42 |
| Direkt föregångare, Classic, 6 | 10805 | 1.04 / 2.16 / 3.99 / 68.66 | 10/3/0 | 16.13 / 17.20 / 32.32 / 71.41 | 31/12/0 | 10.1 | 261.4/78.9 | 12.11 |
| Kandidat, Classic, 6 | 10804 | 1.25 / 2.27 / 3.46 / 46.66 | 3/0/0 | 16.16 / 16.91 / 32.20 / 65.12 | 31/8/0 | 10.5 | 254.5/71.4 | 13.04 |

TDM-baslinjen var då driftsatta `d8e780acae2d9998b2e2cf0d7f719e0c958b0fb9`. Classic-paret använde `89f03fbb941f46d95105464d6ed8a1251d35eb8b` och slutrevisionen `5ae888f8f3c25c3994982279d568a882b26f87e1`. Rumsstartens första kandidatpar använde `c594d7553f5d90fde899e6735765b758e1016a46`, med identisk spelkod. Den enda senare ändringen startade regressionstestets världar med nätverkslägets ordinarie glaströsklar.

TDM gav 118–155 botavfyrningar per baslinjefönster, noll rapporterad backpressure och noll kvarvarande rum efter avhopp. Ett separat profilerat TDM-intervall på 118,29 ms innehöll en 96,10 ms tick och 21,01 ms stickprovsarbete i testservern. Stickproven tog 5,6–32,1 ms. För Classic var p95 under strid/köp/resultat 2,31/0,57/0,53 ms före och 2,45/0,54/0,52 efter. Båda Classic-fönstren innehöll två nya rundor och en bombplantering. Föregångaren fick dessutom desarmering och fyra eskortstarter med 108,2 m gisslanrörelse. Kandidaten fick ingen eskort i det fönstret. Skillnader i stridsutfall och en körning per kandidatfall begränsar jämförelsen. Ingen generell vinst för ticktid, FPS eller minne är visad.

Ett separat 15 s vapentest med tio SDK-aktörer gav 30 SMG-skott respektive 30 avfyrade och exploderade raketer, som mest fem raketer samtidigt. P95 för tickarbete blev 1,40 respektive 1,63 ms, CPU 13,0 respektive 14,8 procent, utgående trafik 16,95 respektive 17,36 KiB/s. Inga av dessa tickexekveringar gick över 33 ms.

För att upprepa serverproven, installera de låsta serverberoendena och ange den absoluta sökvägen till mätbygget i `CS2_BENCH_ROOT`. Kör en process åt gången.

```sh
node tools/network-room-startup.mjs
CS2_LOAD_AI=1 CS2_LOAD_COUNTS=1 CS2_LOAD_MODE=tdm CS2_LOAD_RESIDENTS=1 CS2_LOAD_SECONDS=90 node tools/network-load.mjs
CS2_LOAD_AI=1 CS2_LOAD_COUNTS=1 CS2_LOAD_MODE=classic CS2_LOAD_RESIDENTS=1 CS2_LOAD_SECONDS=180 node tools/network-load.mjs
```

## Rendering

| Pi 5, statisk kameravy | Före | Efter |
| --- | ---: | ---: |
| Bildintervall median / p95 / max, ms | 383,2 / 400,0 / 433,3 | 383,3 / 416,7 / 716,7 |
| Anrop till renderern, median / p95 / max, ms | 27,9 / 32,8 / 39,6 | 28,5 / 33,2 / 34,2 |
| Draw calls / trianglar per bild | 200 / 173 514 | 200 / 173 514 |

Provet höll samma Floor 5-kamera, seed, köpfas, tio lagaktörer, canvas på 450 × 270 och Chromium med SwiftShader. Varje revision fick tio uppvärmningsbilder och 24 mätbilder. Bildintervallet inkluderar webbläsarens schemaläggning och mjukvarurendering. En enda serie per revision ger ingen stabil uppskattning av svansarna.

I macOS-CI användes Metal, 960 × 540, DPR 1 och två renderade klienter med åtta extra SDK-klienter i belastningsfallet. Vid noll tillagd RTT gav föregångaren till #36 8,8 / 13,1 FPS och slutrevisionen 8,3 / 10,7 FPS för de två vyerna. Bildintervallens p95 var 233,3 / 150,0 respektive 250,0 / 183,3 ms. Varje fönster var sju sekunder. Antalet ritningar skilde sig mellan matcherna. Dessa korta prov visar variation och begränsad bildfrekvens i testmiljöerna. Spelarens telefon och en fysisk speldator kräver egna mätningar.

## Stabilitet och återinträden

På den mergade koden kördes tio separata SDK-klienter med strid i C08, avsiktliga verkliga socketavbrott, byte av frivilliga platser och omspel på loopback. Efter 622 mätsekunder hade de bytt plats 20 gånger, återanslutit 11 gånger och registrerat 923 riktiga stridsrespawns. Sista provpunkten låg i match 18. Verktyget kontrollerade samma antal aktörer och platser, historikens och indataköns gränser och lika många socketlyssnare mellan klienterna vid varje provpunkt. Senaste loggade heap efter framtvingad GC var 69.2 MiB.

Körningen avslutades kontrollerat på operatörssidan efter tjugo platsbyten när granskningen skulle avslutas. Både klientprocessen och den isolerade serverprocessen stängdes. Den valfria fulla 30-minuterskörningen och dess slutjämförelse av minne är **NOT RUN**. Siffrorna ovan beskriver det observerade delfönstret. Noll kvarvarande rum efter vanligt avhopp verifierades i de separata AI-körningarna. Verklig 15-sekunders återanslutningsfrist prövades i servertesterna. Normala tickmätningar ovan kördes separat med naturlig GC.

## Granskad publik release

Aktiv release `d14eed3725b4428fa61cdaa743f6543c8394e661`, spelversion 0.18.0, protokoll 11, protokollhash `6ed5ea19797e9019b7c9a1aa8327d1cbcd669b52e7b05ee0ce375232b975ed1e`, byggidentitet `801c1f926936855e670d958da1c63d1d433e0894fcef28df6873c593cca11bb1`. Efter merge gick [Node-kontrollen](https://github.com/capstere/Cartridge-strike2/actions/runs/45033439827) och [Pages-publiceringen](https://github.com/capstere/Cartridge-strike2/actions/runs/45033439424) igenom. Den publika offlineadressens byggfil gav HTTP 200 och samma byggidentitet.

Managern är fäst vid `f685ee759eef4f6183f2c135b6b251abbb3f1cd1`. Dess verifieringsprobe fungerade isolerat mot både den nya releasen och återställningsreleasen. Båda använde tillfälliga privata loopbackinstanser. Före aktivering var antalet rum och anslutningar noll. Samma privata konfiguration låg kvar och processerna för originaltjänsten på 2567 och tunneln behöll sina PID. Efter ompekning körde onlinetjänsten på 127.0.0.1:2568 under systemd.

På [speladressen](https://cs2.capstere.com) öppnade två separat inloggade SDK-klienter ett privat Floor 5-rum över HTTPS/WSS. De valde Redo och Start, såg båda spelarnas rörelse (0,28 m vardera), delade skotthändelser och såg magasinen gå från 29 till 30 vid omladdning. Fel rumskod avvisades och båda lämnade genom den ordinarie funktionen.

Ett andra publikt Classic-rum använde två nya inloggningar. Efter ett verkligt P9-skott och ordinarie rundtimeout behöll överlevaren 19/80 vid nästa köpperiod. Båda klienterna såg magasinet och reserven ändras till 20/79 efter 1,60 spelsekunder, medan fasen fortfarande var köp.

Verifierad återställningsrelease `d8e780acae2d9998b2e2cf0d7f719e0c958b0fb9`, privat säkerhetskopia `20261122T145255858184Z`. Ordinarie återställning är `sudo cs2-online rollback`. [Driftinstruktioner](../../deploy/online/README.md).

## Fem nästa steg

| Ordning | Arbete och beslutspunkt | Nytta / insats / risk |
| --- | --- | --- |
| 1 | Profilera den kvarvarande pausen på omkring en sekund vid andra rummet. Mät konstruktion av fysik, scen och kollisionskontrakt separat. Jämför en avgränsad prototyp med exakt samma två levande rum och deras kollisionsdata. | Hög / medel–stor / medel |
| 2 | Fånga de dyraste enskilda botvägvalen med start, mål och blockerare. Pröva en ändring först när samma rutt fortfarande fungerar genom dörrar, glas och uppdragsmål. | Hög vid tio aktörer / medel / medel |
| 3 | Spela samma raket- och radiosituation på fysisk iPhone, Android och hårdvaruaccelererad dator. Registrera patchankomst, bildintervall, ljudets ålder och fokus vid en miss. Prova också samtidig rörelse, sikte och eld samt rotation. | Hög för mobil och ljud / liten–medel / låg |
| 4 | Bekräfta de två presentationsfelen i en renderad klient. Följ hylsans händelse-ID över fem skott och omladdningsljudets liv över en vapenändring. | Måttlig / liten / låg |
| 5 | Fånga en kort inspelning med rum, riktning och läge för vardera rapporterad golvspärr. Kontrollera kapseln mot just de två ytorna innan en kartändring övervägs. | Lokal / liten efter lokalisering / låg |
