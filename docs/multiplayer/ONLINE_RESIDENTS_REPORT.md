# Floor 5:s miljöfigurer i multiplayer

[PR #28](https://github.com/capstere/Cartridge-strike2/pull/28) startar på den mergade Classic-grunden `d17beff95f4de3125daa52831c0643809ce4f663`. Spelkodens revision är `4e3b5f5c40f09737b0096a0164cfbdca480feaf1` och byggidentiteten är `7451b4c779b581befe840b0affdde991946b9492e4865bbe451146344d7624b1`, protokoll 8. PR-beskrivningen länkar till kontrollerna på slutrevisionen.

## Publik drift

[Speladressen](https://cs2.capstere.com) kör release `c976c871d783fcfadb298a2e94dfc741d7468a89`,
protokoll 8 och byggidentitet `7451b4c779b581befe840b0affdde991946b9492e4865bbe451146344d7624b1`.
PR #28 mergades som `27518fa93c926b4e91a0279282bac1fff30b399e` efter
[sju godkända jobb på releasens exakta revision](https://github.com/capstere/Cartridge-strike2/actions/runs/44485465539).
Ordinarie [kontroll efter merge](https://github.com/capstere/Cartridge-strike2/actions/runs/44489223451) passerade.

Bytet skedde med noll rum och anslutningar. Systemd kör online på port 2568.
Originalprocessen på port 2567 och tunnelprocessen behöll sina PID:ar. Den
privata inbjudningsfilen är identisk med kopian före bytet. Driftverktyget
`cs2-online` använder fortsatt managern i den absoluta versionsbundna
sökvägen från protokoll 7-releasen. Den managerns tvåklientsprobe passerade
mot den stagade protokoll 8-releasen och protokoll 7 i två isolerade
originprocesser före aktivering.

Återställningsreleasen `f685ee759eef4f6183f2c135b6b251abbb3f1cd1` är länkad
som `previous` och konfigurationen sparades i
`/var/lib/cartridge-strike2-online/backups/20261119T084022788559Z/`.
Använd `sudo cs2-online rollback` när rummen är tomma. Efter aktivering
passerade driftproben mot den publika speladressen med två separata
inloggningar, avvisad obehörig anslutning, rörelse, skott och omladdning över
HTTPS/WSS. [Driftinstruktioner](../../deploy/online/README.md)

Två separat inloggade Chromium-klienter provspelade sedan protokoll 8 på den
publika adressen. I TDM fick båda samma sex NPC:er och åtta botar. En klient
gick via vanliga nätverksinputs till C08, såg originaldansen och fick
positionsljud. En skjuten Dansman blev död hos båda och musiken stoppades.
I ett publikt Classic-rum med botar och NPC:er köpte touchklienten rustning.
I ett separat publikt TDM-rum gick matchen till resultat och **Spela igen**
öppnade väntrummet med nytt match-ID i samma rum.

## Spela med NPC på Floor 5

Välj Classic eller Team Deathmatch och klicka på **Skapa rum**. Värden väljer **På** för **Zombies** och **Dansmannen** separat i väntrummet före **Redo** och **Starta match**. Båda står på **Av** i nya rum. På hela Floor 5 ger båda valen fem vanliga zombies och en Dansman när alla originalplatser är giltiga. De har egna identiteter och liv utanför 5v5 och gisslans uppdrag. En Classic-runda eller en TDM-match återskapar platserna. TDM-zombies kan också återvända under pågående match enligt spelets vanliga regler för avstånd, synlighet och väntetid. Dansmannen står i C08 (Sector H), direkt förbi den östra dörren från Sector E. Följ musiken. En Hollow Walker börjar sovande mellan fåtöljerna i I25, men kan ha vaknat och hunnit röra sig.

Servern kör originalens perceptions-, rörelse- och skadevägar. Klienterna får position, liv, hälsa, beteende, klipp och tidsankare. Serverns träffhistorik använder kroppens fysiska position, höjd och riktning i det aktuella livet. Klienterna laddar modeller per rumspopulation och behåller de delade resurserna i renderaren vid omspel och återinträde. Mobilläget begränsar animationsarbetet i presentationen. Det närmaste ljudet tonas med avstånd och väggar och stoppas vid död, paus och återställning.

Starta samma bygge separat med `npm ci --prefix server --ignore-scripts`, `npm run build --prefix server -- --check` och `PORT=2577 npm start --prefix server`. Öppna [loopbackversionen](http://127.0.0.1:2577/fps/?network=local), eller vidarebefordra port 2577 över SSH till din dator.

## Spelproven

- Två renderade klienter följde samma sex resident-ID:n och levande/döda tillstånd i TDM och Classic. TDM-provet sköt Dansmannen med spelets vanliga muskontroll, återanslöt observatören och startade om i samma rum. Vid Classic-rundbytet fick samtliga sex figurer nya livsidentiteter. Provet räknade faktiska ljudkällor och scenobjekt. Dansen matchade serverns klipp, dödsanimationen syntes, musiken stoppades vid död och återkom med högst en samtidig loop per klient. Sceninstanserna återanvändes. De 24 övriga Floor 5-livscyklerna är allmänna regressioner. [Renderade prov](https://github.com/capstere/Cartridge-strike2/actions/runs/44485465539/job/135432513503)

- Två SDK-klienter följde samma sex miljöfigurer medan tio lagplatser var fyllda. Endast värden kunde slå på figurerna. En ny klient och en återansluten klient fick samma livsidentiteter och döda Dansman. Omspel återställde honom med nytt liv. En tidigare träfftid kunde inte träffa det nya livet. Ett separat Classic-rum med enbart Dansmannen behöll gisslan och återställde figurens liv vid nästa runda.
- En liggande zombie kunde träffas via lagkompensationen med ett lågt skott och gick fri från ett högt skott. Verklig AI upptäckte spelaren, reste sig och startade sitt förvarnade angrepp. Ett skott avbröt det första angreppet. Ett senare fullföljt angrepp dödade spelaren med zombieidentitet i händelsen och gav normal TDM-respawn. Skadeprovet använde ett kast, ett knivhugg och verklig BotController-eld. Serverprovet visade att Dansmannens död inte gav lagpoäng eller någon spelarkill.

## Raspberry Pi 5 med och utan figurer

Samma spelrevision och Node 26.13.0, hela Floor 5, 60 Hz, en SDK-spelare och nio riktiga BotController med ordinarie spawnplatser. Fem sekunders uppvärmning följdes av 180 s per Classic-körning och 75 s per TDM-körning. Separat serverprocess, vanlig GC och ingen samtidig webbläsarkörning. Mätfönstret innehåller både strid och Classic-rundövergångar. Max och antal över trösklarna täcker hela respektive fönster. Intervall är väggklocktid från start till start. Exekvering är serverns arbete i `fixedTick`.

| Läge och mått | Uppdateringar | p95 ms | p99 ms | Max ms | >33 ms | >50 ms | >100 ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Classic av, exekvering | 10804 | 1,81 | 3,02 | 76,38 | 5 | 3 | 0 |
| Classic av, intervall | 10804 | 17,00 | 32,28 | 77,19 | 30 | 12 | 0 |
| Classic på, exekvering | 10803 | 2,16 | 3,60 | 60,68 | 7 | 2 | 0 |
| Classic på, intervall | 10803 | 16,95 | 32,28 | 72,61 | 33 | 10 | 0 |
| TDM av, exekvering | 4503 | 5,21 | 17,95 | 77,26 | 16 | 8 | 0 |
| TDM av, intervall | 4503 | 22,99 | 32,36 | 78,51 | 19 | 8 | 0 |
| TDM på, exekvering | 4503 | 5,45 | 17,44 | 77,69 | 14 | 7 | 0 |
| TDM på, intervall | 4503 | 21,29 | 32,34 | 78,07 | 19 | 7 | 0 |

Simuleringstid per fas enligt fasen när respektive uppdatering startade. Köp- och resultatfaser finns i Classic. Ett fasprov kan innehålla själva rundövergången.

| Läge och fas | Uppdateringar | p95 ms | p99 ms | Max ms | >33 ms | >50 ms | >100 ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Classic av, strid | 7594 | 1,47 | 2,65 | 75,75 | 4 | 3 | 0 |
| Classic av, köp | 2610 | 0,03 | 0,05 | 23,54 | 0 | 0 | 0 |
| Classic av, resultat | 600 | 0,02 | 0,04 | 8,59 | 0 | 0 | 0 |
| Classic på, strid | 7593 | 1,80 | 3,30 | 56,49 | 5 | 1 | 0 |
| Classic på, köp | 2610 | 0,04 | 0,06 | 59,37 | 2 | 1 | 0 |
| Classic på, resultat | 600 | 0,02 | 0,03 | 2,61 | 0 | 0 | 0 |
| TDM av, strid | 4503 | 4,75 | 17,50 | 76,64 | 16 | 8 | 0 |
| TDM på, strid | 4503 | 4,98 | 17,00 | 77,22 | 11 | 7 | 0 |

| Läge | En CPU-kärna, % | RSS vid slut, MiB | Utgående byte/s till SDK-klienten |
| --- | ---: | ---: | ---: |
| Classic av | 8,5 | 256,2 | 11004 |
| Classic på | 9,6 | 255,3 | 11917 |
| TDM av | 14,5 | 254,4 | 24729 |
| TDM på | 16,1 | 255,8 | 26771 |

Med figurer gick zombies 205 m i Classic och 115 m i TDM. Gisslan följde en bot i 28 m under Classic-körningen med figurer. Utan figurer gick gisslan 50 m och botar hann plantera och desarmera. Classic med figurer hade 72 botskott, jämfört med 64 utan figurer. TDM hade 124 respektive 111. Inga NPC-angrepp fullföljdes i belastningskörningarna. Angrepp, avbrott och spelardöd kontrollerades i det riktade AI-provet.

Classic ökade från p99 3,02 till 3,60 ms och från 11,0 till 11,9 kB/s till spelaren i detta prov. TDM ökade från 24,7 till 26,8 kB/s. Enstaka uppdateringar på upp till cirka 78 ms återstår. Plantering, eskort och strider varierade mellan körningarna, vilket påverkar enskilda toppar. Kartstorlek, 5v5 och samtliga sex figurer behölls. Det finns inga tecken på termisk strypning i mätfönstren.

Klientens nedladdning mäts separat från Pi-simuleringen. Full uppsättning hämtar 7 982 418 byte komprimerade originalmodeller, varav 1 810 602 byte för Dansmannen. Ett rum med figurer av hämtar inga av de tre modellfilerna. Det renderade provet loggar första modellhämtningen och två serier om nio renderade bildrutor på samma kamera med och utan figurer. Provet synkroniserar renderingsarbetet med GPU:n och mäter kostnaden per bild i scenen. Två macOS-prov med nio bilder per inställning gav olika ordning på medianerna. I det senare provet tog de tre lokala modellhämtningarna 146–461 ms. Provet gäller CI-maskinen och en C08-vy. Det finns ingen uppmätt bildfrekvens eller laddtid för fysiska telefoner.

## Återstår

Fysisk iPhone och Android är **NOT RUN**. Rök, flash, raketkastare och de två lokala golvspärrarna återstår.
