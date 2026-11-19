# Classic online på Floor 5

[Classic-PR #27](https://github.com/capstere/Cartridge-strike2/pull/27) utgår från main `39412f8c823610fd3f543971f0efba30f2a79ee3`. TDM-grunden mergades i [PR #26 efter sju godkända kontroller](https://github.com/capstere/Cartridge-strike2/actions/runs/44456517274). Classic-spelkodens commit är `f8e54aaad3f4ef994191f0289014d1dea34b3279`, protokoll 7 och byggidentitet `19eb2df3b9278ccff34a37b0de63f942ec71121d124200f8d5db34deb0536f27`.

## Spela Classic

Välj **Classic** när du skapar ett rum. En ensam värd kan starta med nio serverbotar. Varje rum har egna regler. Team Deathmatch behåller gratis utrustning och respawn. I Classic börjar ett liv med lagpistol och kniv. Under de första 15 sekunderna ger **B** eller **MER → KÖP** tillgång till lagets sortiment i startzonen. Startkapitalet är 800 krediter. Servern drar priset, betalar ut rundbelöning och förlustbonus och behåller överlevares utrustning. Sortimentet omfattar Pulse SMG, Arc Rifle eller Pulse Carbine, Breach Shotgun, Scout Rifle, HE och kroppsrustning.

Båda lagen kan vinna genom eliminering. Counter Analysts kan även detonera bomben eller rädda samtliga gisslan. Analysts kan desarmera eller försvara tills rundans 120 sekunder löper ut. En planterad bomb fortsätter även om sista angriparen dör. Håll **E** eller mobilens interaktionsknapp i tre sekunder för att plantera och fem för att desarmera. Bombens säkring är 40 sekunder. Tryck på interaktionsknappen för att ta upp en tappad bomb eller starta/stoppa eskort. För följaren in i räddningszonen. Servern använder Classics befintliga inställning för gisslanskada, avstängd.

Utslagna spelare kan följa levande lagkamrater. Befintliga spelare har 15 sekunders återanslutningsfrist. En ny spelare under pågående runda väntar till rundgränsen och tar över sin egen plats då. Första laget till fem vunna rundor vinner matchen. Omspel börjar i samma väntrum.

## Granskning och prov

- Rumsproven startade samtidigt Classic och TDM på samma server. Classic-spelarna började med 800 krediter, pistol och kniv, medan TDM-spelaren fick sin vanliga utrustning. Ett upprepat HE-köp drog 300 krediter en gång. Fel lag, zon, fas, otillräckliga pengar, full granatplats, otillåten utrustning och förra rundans köp avvisades. Död, överlevnad, rundbelöning, nytt köp, matchvinst och omspel gick genom servern.
- Två SDK-klienter använde hållinteraktionen för att plantera och desarmera. Släppt knapp och tyst input avbröt handlingen. Planterad bomb överlevde bärarens död. En desarmering vid exakt samma sluttid som explosionen gav detonation. Sen anslutning och återanslutning bevarade bombens ursprungliga deadline. En återansluten död spelare förblev död. En avbruten eskort kunde återupptas med samma gisslan.
- En ensam värd startade med nio BotController. I kontrollerade positioner tog en bot upp en tappad bomb och planterade, en försvarare desarmerade och en tilldelad eskortör hämtade sin gisslan och ledde följaren hela vägen in i zonen. En väntande människa ersatte sin bot först vid nästa rundgräns. Ett separat Floor 5-prov lät en fysisk följare passera en öppnande dörr och en krossad ruta. Provet för nästa runda kontrollerade att glaset återställdes.
- Två renderade Chromium-klienter i CI köpte HE på dator och rustning i mobilvy, såg rätt saldo, planterade med **E** och desarmerade med en hållen touchknapp. Båda klienterna visade rundresultatet. I det utökade provet startade spelaren dessutom en eskort med E, vände sig med piltangenten och gick in i räddningszonen med W. Båda klienterna registrerade samma räddade gisslan. [Renderad eskort](https://github.com/capstere/Cartridge-strike2/actions/runs/44459027593) Samma CI-jobb provade även TDM med åtta botar, glas, utrustning och samtidig rörelse/sikte/eld på mobil. [Körning på spelkodens revision](https://github.com/capstere/Cartridge-strike2/actions/runs/44458377862)
- Offline Classic och Endless behöll identiska händelse- och tillståndshashar i åtta återspelningar (9 600 tick). Driftpaketets 519 runtimefiler och sju driftprov passerade. HTTPS/WSS-proben på en isolerad inbjudningsinstans verifierade två klienter, rörelse, skott, omladdning och avslut. [Obligatoriska kontroller på aktuell PR-revision](https://github.com/capstere/Cartridge-strike2/pull/27/checks)

## Långa serveruppdateringar i Team Deathmatch

Samma Raspberry Pi 5, Node 26.13.1, hela Floor 5, en SDK-styrd människoplats och nio riktiga BotController. Servern gick på loopback i en egen process med mål 60 Hz. Fem sekunders uppvärmning följdes av 180 sekunders mätning vid ordinarie spawnplatser. Ingen framtvingad GC eller samtidig webbläsarkörning. Tabellen räknar över **hela mätperioden**, inklusive maximal tid och varje tröskelöverskridande. Exekvering mäter tiden i serverns fixedTick. Intervall mäter väggklocktid från en uppdaterings start till nästa. Jämförelsen använder samma mätkod på båda spelrevisionerna.

| Revision och mått | Antal | p95 ms | p99 ms | Max ms | >33 ms | >50 ms | >100 ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Före, exekvering | 10 792 | 7,23 | 22,08 | 152,42 | 51 | 16 | 3 |
| Efter, exekvering | 10 798 | 5,32 | 19,22 | 96,37 | 41 | 18 | 0 |
| Före, intervall | 10 792 | 25,54 | 32,48 | 152,61 | 67 | 18 | 3 |
| Efter, intervall | 10 798 | 25,23 | 32,46 | 96,55 | 55 | 20 | 0 |

Före var spelrevisionen `8c2f310b860dd791b1938d1efef32d311d640da8`. I den längsta uppdateringen tog vägval 143 ms och glasbrottet 6 ms. Även de två andra uppdateringarna över 100 ms dominerades av vägval. Den tidigare femminuterskörningens exakta 331 ms återkom aldrig under dessa tre minuter. Efterrevisionen `8486a8297103fd15d46e0dc1bee45da5986ff250` sprider botarnas vägberäkningar över tio fasta steg och undviker upprepade kapselprov vid blockerade ändpunkter och inuti rektangulära golv. Den behåller AI-beslut, strid och styrning i deras ordinarie takt. Treminutersprovet visar lägre max och p99. Uppdateringar över 50 ms förekommer fortfarande och ökade från 16 till 18. Enstaka kostsamma vägsökningar återstår, även när bara en bot planerar. Anropstiderna inkluderar eventuell naturlig GC. Den historiska toppen på 331 ms saknar egen profil. Nästa isolerade optimeringsprov är att dela upp en lång sökning över flera steg med oförändrade kollisionskontroller och kassera vägen vid en ändrad glasrevision.

## Classic på Raspberry Pi

Fem minuter på spelrevisionen ovan med normala startplatser, ordinarie rundtider, hela kartan, en SDK-spelare och nio aktiva botar. Servern gjorde 18 004 uppdateringar på 300,07 s. Under mätfönstret började tre nya rundor, botarna gick sammanlagt 3 386 m och avlossade 164 skott. Det registrerades 24 HE-kast, tre glasbrott, en plantering och en startad eskort. Gisslan gick 2,51 m i 52 uppdateringar. Ingen räddning eller desarmering inträffade under just detta prov. Fullföljd räddning och desarmering verifierades separat med riktiga botar i de kontrollerade scenarierna.

| Hela femminuterskörningen | p95 ms | p99 ms | Max ms | >33 ms | >50 ms | >100 ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Exekvering | 1,78 | 2,99 | 57,82 | 7 | 1 | 0 |
| Intervall mellan uppdateringar | 16,92 | 32,24 | 72,40 | 53 | 16 | 0 |

Själva simuleringen tog 1,24 ms vid p95 och 2,56 ms vid p99 för de sista 8 192 uppdateringarna. Högsta uppmätta kostnad var 7,72 ms för rundstart, 12,11 ms för glasbrott och 47,13 ms för ett taktiskt vägval. Under uppdateringar där gisslan rörde sig tog simuleringen som mest 57,40 ms. Dessa tider omfattar överlappande arbete och ska inte summeras. Medelarbetet inklusive serialisering var 1,03 ms per uppdatering. Serverprocessen använde 8,7 % av en CPU-kärna, 223,9 MiB RSS och 78,5 MiB använd heap vid slutmätningen. Utgående data var 12 123 byte/s till klienten. Inget nätverksmottryck eller termisk strypning registrerades och sista klientens avhopp tömde rummet.

Återskapa med `CS2_LOAD_MODE=classic CS2_LOAD_AI=1 CS2_LOAD_COUNTS=1 CS2_LOAD_SECONDS=300 node tools/network-load.mjs`. För TDM-jämförelsen används 180 sekunder utan `CS2_LOAD_MODE`. För båda körningarna användes naturlig GC. Verktygets särskilda heapkontroll med framtvingad GC är ett separat prov.

## Starta på separat loopbackport

Port 2577 svarade med kandidatens byggidentitet och HTTP 200. Kör från Classic-grenen på Pi:n och öppna [det lokala väntrummet](http://127.0.0.1:2577/fps/?network=local).

```sh
npm ci --prefix server --ignore-scripts
npm run build --prefix server -- --check
PORT=2577 npm start --prefix server
```

Från en annan dator kan du använda SSH-vidarebefordran med `ssh -N -L 2577:127.0.0.1:2577 jesperfredriksson@pi`. Använd Pi:ns vanliga SSH-namn och avsluta granskningsservern med Ctrl+C. Internetreleasen ligger kvar på 2568 och originaltjänsten på 2567.

## Återstår

Fysisk iPhone och Android är **NOT RUN** för denna kandidat. Prova särskilt köp under tidspress, hållinteraktion, ljud, bakgrund/återanslutning och en hel match med omspel. Nästa utvecklingssteg är serverägda zombies och därefter Dansmannen. Rök, flash och raketkastare återstår online. De två lokala golvspärrarna vid gamla vägglinjer ligger kvar som lågprioriterade kartfel.
