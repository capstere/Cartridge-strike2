# Första kompletta privata onlinereleasen

Datum: 18 november 2026. [Release-PR #24](https://github.com/capstere/Cartridge-strike2/pull/24).

## Release och driftsstatus

Spelimplementation och releasepaket: **`d886a10060b8fbf9b2d3034e8c8d0ad46a8a39d1`**.
Runtime-kontrakt: protokoll **5**, build
`3af2145a3d18bdbd58d53ebeb6f35f3309531892085dfe376b5aaab9098a473c`.
Map-hash `89283f437623457a10da37be29a282a41591f202270051ba940549ba01b4b050` och
collision-hash `a5351e073a01ac95466acf4346acf9812f4265224e56712ce3e889085a42b6d9`
är oförändrade. Alla 519 levererade runtime-filer kontrolleras separat mot
`build-info.json`; kontraktet innehåller inte dokumentation eller testkod.

**Driftsatt på Pi:n**, med matchande klient och server. Aktivering, verklig
rollback till PASS 4, återaktivering och publik HTTPS/WSS-speltrafik är godkända.
Det avslutade 30-minutersprovet redovisas nedan. Inga inbjudningar, privata
rumskoder eller publika pilotadresser publiceras i denna rapport.

PR #23 granskades på `1c2041fd2d2ab54b5f83d858bfe6b01f07e74935` med sju godkända
jobb i [44255639016](https://github.com/capstere/Cartridge-strike2/actions/runs/44255639016)
och mergades utan undantag som `c8aa5b5d15f8d517f0b9a0515eed269b9e68f1d5`.
Den tidigare driftsatta `1c2041fd`-releasen behålls som rollback, inklusive dess matchande
klient och server.

Pi:n inspekterades före ändringar: Pi 5 Model B Rev 1.1, 16 GB, Debian 12 ARM64.
Originaltjänsten `cartridge-strike2` kör Node **26.13.0** från
`/home/jesperfredriksson/.local/node/bin/node` på **2567**. Onlinetjänsten använder
`/usr/bin/node` **26.13.1** och loopback **2568**. Ursprunglig PID 46794 och
originaltjänstens checkout bevaras. Utveckling och mätningar använder en separat
checkout och operativsystemstilldelade lediga loopbackportar.

## Implementerat beteende

| System | Viktigaste ändrade filer |
| --- | --- |
| Matchregler och auktoritet | `shared/multiplayer/rules.mjs`, `server/match-lifecycle.mjs`, `server/network-room.mjs`, `server/network-schema.mjs` |
| RTT och historiska träffar | `server/lag-compensation.mjs`, `server/test/lag-compensation.test.mjs`, `server/test/match-lifecycle.test.mjs` |
| Klientflöde och HUD | `src/fps/app.mjs`, `src/fps/network/room-ui.mjs`, `src/fps/network/session.mjs`, `src/fps/network/menu.mjs` |
| Inloggning och paketering | `server/pilot-access.mjs`, `server/local-server.mjs`, `server/package*.json`, `tools/build-network.mjs`, `shared/multiplayer/build.mjs`, `build-info.json` |
| Drift och validering | `deploy/online/`, `deploy/pilot/`, `tools/online-match-browser.mjs`, `tools/network-pilot-*.mjs`, `tools/network-load*.mjs`, `.github/workflows/` |

Den befintliga Game-simuleringen, Colyseus, delad rörelse, prediction och
interpolation driver fortfarande Floor 5. Inga botar fyller människoplatser.
Classic/Endless offline, grafik, karaktärer, animationer, ljud och kartan behålls.

`shared/multiplayer/rules.mjs` äger standarderna: **600 sekunder**, **50 fiendekills**,
**3 sekunders nedräkning**, **högst 5 människor per lag**. Ett rum kan startas med
en människa i vardera laget. Väntrummet visar dessa regler, namn, lag, laddnings-
och anslutningsstatus, personlig Redo och Start för rumsägaren.

Serverns tillstånd är `waiting → countdown → active → results → waiting`.
Transportens gamla `ready` betyder fortfarande att klienten laddat färdigt.
`playerReady` är spelarens separata val. Alla anslutna spelare måste vara laddade
och redo, med båda lagen representerade. Servern kontrollerar lagbyten och
kapacitet. Lagbyte nollställer Redo och byter säkert aktörens kontrolleridentitet.

Serverns klocka bestämmer start och sluttid. Fiendekills räknas av den befintliga
skademodellen. Poängkontrollen sker efter hela tickens skadebatch: om samtidiga
slutkills ger samma slutpoäng blir resultatet oavgjort. Ett resultat publiceras
bara en gång. Vid tidsgränsen vinner högre poäng; lika ger oavgjort.
Resultatet fryser lagpoäng och personliga kills/deaths för de deltagare som finns
kvar i rummet. Lämnade spelare behåller inte en reserverad scoreboard-rad efter
att deras 15-sekunders reservation har löpt ut.

Rörelse- och stridsinput accepteras bara i aktiv match. Väntrum, nedräkning och
resultat pausar matchsimuleringen. Spelarens pausmeny pausar bara egna kontroller;
under en aktiv match är spelaren fortfarande sårbar. Dörrar, hissar, spawnluckor,
kollision, ammunition, reload, skada, respawn och skydd förblir serverägda.

Sen anslutning till en aktiv match ger en vanlig säker spawn efter asset-ready.
En anslutning under resultat ser det frysta resultatet och kan spela nästa match.
Om ett lag saknar anslutna, laddade spelare i 15 sekunder avslutas matchen med
walkover; om båda lagen är borta blir det oavgjort. Ett avbrott i nedräkningen
återgår till väntrum. Ägaren behåller ägarskapet under reconnect-reservationen.
Vid definitivt utträde överförs det till den äldsta anslutna platsen, annars en
kvarvarande reserverad plats. Rummet blir användbart efter grace-perioden.

Alla kan välja **Spela igen** från resultatet. Det första giltiga kommandot
återgår till samma väntrum och höjer match-ID; dubblerade kommandon ignoreras.
Redo återställs. Liv-ID och kontroll-epoch ökar, input och handlingar töms,
lagpoäng/inventarier/hälsa återställs och säkra spawnpositioner väljs. Tickankare,
skott, tidigare kroppars rewindidentiteter, lokala effekter, prediction och
interpolation återställs eller blir ogiltiga. Gamla match/liv/anslutningsmeddelanden
kan inte skjuta eller starta nästa match.

## Anslutning, UI och lag compensation

Rumslänken innehåller bara rum-ID och transportval. Inbjudan respektive privat
rumskod skickas separat. Inbjudans yttre clipboard-whitespace trimmas fortfarande;
case och interna tecken ändras inte. Länken behåller rum-ID genom inloggningen.
Delning använder Web Share, därefter clipboard och ett markerbart textfält som
fallback. Utgången cookie eller serveromstart erbjuder **Logga in igen**.
Spelarens återanslutning kräver explicit Fortsätt för kontroller och ljud.

Den befintliga 500 ms absoluta rewindgränsen behålls: tidigare 250 ms belastnings-
prov gav cirka 310 ms SDK-RTT plus 100 ms visningsbuffert. Gränsen är inte en
rättighet att välja vilken historisk träff som helst. Tick/stämpel, liv, epoch,
framtida/för gamla/skickade skott samt ammunition och cooldown valideras separat.
Colyseus-historierna omfattar spelarkapslar, dörrvinklar och hissens position.

RTT är ett **obetrott övre mått**, inte bevis för fysisk nätlatens. Varje svar måste
matcha serverns senaste slumpnonce och aktuell klient. Ett prov är färskt i högst
**4 sekunder**. Saknade, obesvarade, gamla eller oförenliga prov ger **live hits**
utan historisk fördel; vanlig skjutning fungerar fortfarande. Anslutningens lägsta
observerade RTT kan bara sjunka, så senare avsiktligt fördröjda svar kan inte höja
budgeten. Reconnect tömmer gamla prov och kräver nya. Svar som är NaN, negativa,
över 1 sekund, förfalskade eller från en gammal probe uppdaterar inte budgeten.

Konsekvent klientfördröjning från första svaret kan inte skiljas perfekt från en
långsam nätväg. Säkerhetsgarantierna är därför den oberoende tick/liv-kontrollen,
serverns kollisionshistorik och den absoluta 500 ms-gränsen, inte tillit till ett
eko. Ett ändrat legitimt nät kan tillfälligt få live-träffar tills anslutningen
har en användbar tidsprofil. Inga klienter kan lämna skada eller färdiga träffar.

Npm-registret kontrollerades den 18 november: installerad SDK **0.18.10** är
också publicerad `latest`; ingen nyare publicerad uppgradering med en minimal
JOIN-rättning fanns att använda. Den dokumenterade SDK-gränsen finns kvar: ett andra avbrott mitt i ersättnings-
anslutningens JOIN kan förlora identitetskontinuiteten. Testet kräver säkert avslut,
ingen kvarhängande aktör och fungerande ny autentiserad anslutning. Ett normalt
återanslutningsförlopp bevarar identitet, lag, hälsa, ammo och poäng och ger inget
extra spawnskydd. Ingen egen SDK- eller autentiseringsimplementation har införts.

## Automatiserad funktionell evidens

Lokalt på Mac: **228 core-tester**, **23 server-/protokolltester**, **7 tester av
driftverktygen**, runtime-manifest och buildkontrakt godkända. De nya testerna
bevisar lobbyauktoritet, lagbyte, dubbla Start/Spela igen, simultana slutkills,
tidsseger/oavgjort, gammal matchinput, ägarbyte, late join, countdown-avbrott,
walkover efter grace och RTT-fallen ovan. Tidigare dörr-, kollisions-, behörighets-,
rumisolations-, kapacitets-, reconnect- och backpressuretester behålls.

`tools/online-match-browser.mjs`: två separata Chromium-processer autentiseras
var för sig och använder levererad UI över HTTPS/WSS med lokalt pinnat certifikat.
En klient har touch-emulering. Testet utför Redo/Start, verkliga tangent- och
touchrörelser, touch-eld, riktig skada, död och
automatisk respawn, 2–0 poängseger, samma-rum-rematch, 1–0 tidsseger, 0–0 oavgjort,
lagbyte, ägarbyte, utträde och återhämtning efter utgången cookie. Personliga
kills/deaths och exakt samma resultat kontrolleras hos båda klienterna.

**Publikt slutprov efter aktivering, 18 november 09:02 UTC: PASS.** Två separata
Chromium-processer på MacBooken autentiserades genom den riktiga Cloudflare-
adressen till Pi:n och spelade med levererade standarder **600 sekunder/50 kills**.
Båda såg två laddade aktörer och 51 dörrar. Rörelse (0.35 m), skott (30 → 29)
och färdig reload (30) replikerades över WSS. Hela tiominutersmatchen slutade
0–0 med exakt samma frysta resultat på båda klienterna. Spela igen, Redo, Start
och Fortsätt gav match 2 i samma rum med återställd ammo; ny skjutning bekräftades.
Utträde tog bort värdens aktör utan att bryta vännen. Inga browserundantag uppstod.
Detta prov verifierar verklig offentlig TLS/WSS och ordinarie matchtid, men är
inte två fysiska spelare eller två oberoende WAN-nät. Det provar inte skada mellan
aktörerna; skada, död och respawn bevisas av den separata renderade stridssviten.

Enbart serverns testfixture kortar tid/poänggräns och placerar nya liv i en fri
C08-stridsposition. Den skriver inte skada, ammo eller poäng. Dessa inställningar
är fabriksargument i tester, inte HTTP-parametrar, klientmeddelanden, produktions-
variabler eller en debug-route. Produktionsstandarderna är kvar. Äldre fokuserade
kollisions-/stridstester använder explicit kontinuerlig testmatch; den nya sviten
kontrollerar produktionsflödet.

Alla sju GitHub-jobb på det driftsatta paketet `d886a100` är **PASS** i
[44267713626](https://github.com/capstere/Cartridge-strike2/actions/runs/44267713626).
Även den tidigare serverimplementationen `a3ce3460` klarade alla sju i
[44264144000](https://github.com/capstere/Cartridge-strike2/actions/runs/44264144000).
Slutlig dokumentations-/driftrevision måste också klara alla sju före merge;
dess exakta revision och körning anges i PR #24. Den ändrar inte levererade
spelfiler. Driftverktygets sista spärr väntar även ut återanslutningsreservationer
med noll anslutna sockets; testet kräver att ingen fil eller tjänst ändras då.
Offline Classic/Endless, mobil, karaktärs-/animationsdelning,
resurslivscykler, Floor 5, LAN, Windows/Linux/macOS, WebKit och 24 renderade
livscykler finns kvar. Windows använder fortfarande **en renderad klient och en
SDK-peer**. macOS/Linux behåller sina två renderade klienter. Inget av detta är
fysisk iPhone/Android-testning. CI-artefakter har kort retention, 3–7 dagar.

## Nätmatris och klientmätningar

Apple M1/Metal, DPR 1. Varje rad har två renderade klienter och 0/2/8 SDK-peers.
Fördröjningen bevarar WebSocket-ordningen; icke-noll-rader har ungefär ±20 ms
jitter. Några Mac-renderingar överlappade andra lokala browserkontroller; detta
är funktionell stress och ingen isolerad telefon- eller GPU-prestandamätning.
Tomma samples redovisas som `null`/N/A, aldrig som lyckad noll-latens.
[Kompakta mätdata och resultat](online/evidence.json) behåller sample-antal och
percentiler. Remote display-offset p95 var **0.033–0.063 m** i dessa serier.

| Människoslots | Tillagd RTT ms | Mätt RTT ms | FPS klient A/B | Frame p95 ms | Korrigering p95 m | Träffbekräftelse p95 ms | Max pending A/B |
| ---: | ---: | --- | --- | --- | --- | --- | --- |
| 2 | 0 | 25 / 27 | 60.0 / 60.0 | 16.7 / 16.7 | .024 / .017 | 62.3 / 62.2 | 6 / 5 |
| 4 | 0 | 31 / 25 | 58.7 / 60.0 | 16.8 / 16.7 | .016 / .014 | 63.2 / 49.1 | 5 / 5 |
| 10 | 0 | 30 / 21 | 52.9 / 58.9 | 33.3 / 16.8 | .017 / .010 | 65.1 / 56.5 | 5 / 4 |
| 10 | 50 | 77 / 74 | 46.9 / 59.3 | 33.4 / 16.8 | .033 / .032 | 151.4 / 124.3 | 9 / 9 |
| 10 | 100 | 140 / 128 | 43.0 / 58.0 | 33.4 / 16.8 | .038 / .038 | 263.3 / 228.4 | 15 / 13 |
| 10 | 150 | 199 / 180 | 45.4 / 59.3 | 33.4 / 16.8 | .033 / .040 | 287.4 / 228.3 | 17 / 18 |
| 10 | 250 | 278 / 274 | 52.6 / 59.9 | 33.4 / 16.7 | .028 / .021 | 316.0 / 310.0 | 21 / 20 |

Alla rader PASS. Varje renderad klient måste få nya bekräftade och deduplicerade
skott efter uppvärmningen; tidigare totalsummor kan inte uppfylla kontrollen.
Inputbacklog är klientens ännu obekräftade inputs; serverkön är separat begränsad
till 12 och coalescas per tick. Matrisen provar avbrott under strid, explicit
Resume, 4 s blockerad browsertråd, 3.2 s CDP freeze/resume och syntetisk blur.
**Riktig transportförlust/retransmission: NOT RUN**. Slumpmässigt kastade snapshots
används inte som påstått TCP-loss-test.

## Pi-kapacitet före/efter

Samma fysiska Pi, separat auktoritetsprocess, 5 s uppvärmning och 45 s mätning
per 2/4/10 SDK-klienter. Inga tunga browser-/regressionsjobb körde samtidigt på
Pi:n. Testet använder kontinuerlig match och C08-spawnfixture för jämförelse med
[tidigare Pi-baslinje](pass4/README.md#measurements). Befintliga tjänster var igång.
Ingen telefon-FPS härleds från serverlast.

| SDK-klienter | Sim p95 före → efter | Tickarbete p99 före → efter | Utgående KB/s per klient före → efter | CPU % av en kärna före → efter |
| ---: | ---: | ---: | ---: | ---: |
| 2 | .24 → .229 ms | 1.16 → 1.231 ms | 6.03 → 6.10 | 7.2 → 7.94 |
| 4 | .57 → .626 ms | 3.25 → 1.490 ms | 13.97 → 15.06 | 8.3 → 10.37 |
| 10 | 1.17 → 1.258 ms | 6.27 → 5.833 ms | 39.17 → 40.13 | 13.9 → 15.65 |

Tio klienter: simulering p50/p95/p99 **.427/1.258/5.155 ms**; total tickarbete
**.831/1.853/5.833 ms**; serialisering **.838/1.465/1.854 ms**; projektion
**.222/.265/.281 ms**. RSS **236.75 MiB**, efter-GC heap **64.22 MiB**.
Faktiskt schemaläggningsintervall p50/p95/p99 **16.20/18.10/32.34 ms**;
event-loop delay **10.09/10.84/12.02 ms** vid 10 ms samplingsupplösning.
Temperatur efter serierna **39.15–40.8 °C**, `throttled=0x0`.

Simulering p95 <8 ms, tickarbete p99 <16.67 ms och trafik <50 KB/s per klient
klaras i denna kapacitetsserie. Ett strikt schemaläggningsintervall p99 <16.67 ms
klaras **inte**, liksom i baslinjen. Mätprovet gör GC inför femsekunderssamplingen,
vilket påverkar enskilda schemaläggningstoppar. Ingen ny spekulativ renderer-
optimering eller visuell kvalitetsminskning infördes; skillnaderna mot baslinjen
motiverar inte en omskrivning.

## 30-minutersprov

**PASS — 1 800.27 uppmätta sekunder**, tio officiella SDK-klienter, 20
join/leave-byten, **30 återanslutningar**, **2 730 faktiska combat-respawns** efter
uppvärmningen och **52 avslutade match-/rematchövergångar**. Sista match-ID var 53.
Testmatcherna var 90 sekunder/30 kills; skott, reload, skada och respawn använde
vanliga serverregler. Alla tio slutklienter sköt och fick träffar.

Efter varmperioden ökade den jämförda efter-GC heap-toppen **0.60 MiB**. Slutlig
heap/RSS var **65.51/242.67 MiB**; efter utträde heap **28.02 MiB** och **0 rum,
0 spelarsockets**. Antalet socket-listeners var konstant **7**, inputkön högst
**2** av tillåtna 12 och historiken högst **64 ticks**. Livsbyten vid matchreset
räknas separat från faktiska combat-respawns. Ingen ackumulerande resursökning,
krasch eller obegränsad kö observerades.

Slutligt mätfönster: simulering p50/p95/p99 **.327/1.084/3.594 ms**, tickarbete
**.692/1.651/4.230 ms**, serialisering **.717/1.307/1.661 ms**. Faktiskt tickmedel
över provet var **59.90 Hz**, intervall p99 **32.37 ms**. CPU **12.61 % av en
kärna**, utgående WebSocket-payload **40.85 KB/s per klient**. Temperatur
**39.7–44.1 °C**, alltid `throttled=0x0`. TLS/TCP-overhead ingår inte i payload-
mätningen. Kostnadshistoriken begränsas till senaste 8 192 samples; femsekunders-
samplingen gör GC. Tomma omedelbara reset-histogram används inte som latensmått.

Provet körde serverimplementationen i `a3ce3460` med build `7c77e7ac…`. Den
slutliga klienträttningen för en sen delningscallback gav release `d886a100` och
ny build `3af2145a…`. Git-diff kontrollerar att **all server-, simulations-,
protokoll-, kart- och kollisionskod är identisk**; endast klientens `room-ui.mjs`,
genererad build-identitet/manifest och två browserharnesser skiljer. Båda fulla
kontrakten och exakt fillista finns i mätdata. Detta är ett 30-minutersprov av
den slutliga serverimplementationen, inte av telefonrendering. Slutpaketets nya
identitet verifieras separat genom staged preflight och publik gameplay.
Två korta förprov avbröts när valideringen färdigställdes; de räknas inte som
genomförda 30-minutersprov.

Reproducerbart på Pi:n, utan samtidigt tung rendering:

```sh
CS2_SOAK=1 CS2_LOAD_COUNTS=10 CS2_LOAD_SECONDS=1800 \
  CS2_LOAD_OUTPUT=test-results/online/pi-soak-30m.json \
  node --import ./server/register-shared.mjs tools/network-load.mjs
```

## Drift och kvarstående extern förutsättning

[Driftverktygen](../../deploy/online/README.md) bevarar releaser och privat
konfiguration, vägrar rutinaktivering medan något rum finns kvar (inklusive
återanslutningsreservationer), byter version atomärt,
startar bara port-2568-tjänsten och verifierar två autentiserade offentliga
HTTPS/WSS-SDK-klienters riktiga speltrafik. Verifieringsfel återställer tidigare
release. Den slutliga staged releasen provades också i en separat systemd-tjänst på
ledig loopbackport 51941: tio separata autentiseringar gav 1/1, 2/2 och 5/5
roster; två peers verifierade rörelse, skott och reload. SIGKILL av testprocessen
gav automatisk återstart. Efter kodbyte/omstart avvisades gammal inbjudan och
gammal cookie, medan ny inbjudan och nytt spel fungerade. Det var HTTP/WS med
proxyheaders på loopback, inte ett publikt HTTPS-prov. Testtjänsten togs bort;
originalets PID 46794 och pilotens PID 70884 var oförändrade.

Den faktiska aktiveringen av `d886a100` verifierade två separata autentiseringar,
Ready/Start, WSS-rörelse, skott, reload och gemensamma skottevents. Därefter
återställdes den riktiga onlinetjänsten till `1c2041fd`: samma publika spelprov
klarades med dess gamla build `c3b56739…`. Återaktivering av `d886a100` klarade
provet igen. Rollbacklänken pekar fortfarande på `1c2041fd`. Den versionsbundna
driftverktygslänken fungerar även när `current` pekar på den äldre releasen.

`stop-public` provades på den faktiska tunneln: offentlig åtkomst gav HTTP 530
när tjänsten stoppats/inaktiverats. Återöppning gav HTTP 200 och godkänt
autentiserat HTTPS/WSS-spel. Quick Tunnel fick då en ny adress; den delades privat
med ägaren. Efter bytet anslöt **tio separat autentiserade SDK-klienter**, med
1/1 → 2/2 → 5/5 roster. Två peers verifierade rörelse, skott och färdig reload;
alla tio lämnade korrekt. Detta är inte tio renderade eller fysiska enheter.

Tjänsterna och readiness-timern är enabled. Onlineprocessen och cloudflared har
systemd/PID 1 som förälder och behöver inte MacBook eller Codex. Onlineprocessen
återstartas automatiskt; den tillfälliga tunnelns restart-policy respekterar det
absoluta slutdatumet. Journalens egen namnrymd har 64 MB beständig/16 MB tillfällig
gräns och sju dagars retention. En privat konfigurationsbackup och den gamla
releasen finns kvar. `/var/lib/cartridge-strike2-online/release-receipt.json`
registrerar commit, kontrakt, enhetsstatus och slutdatum utan hemligheter eller
speladress. Faktisk omstart av hela Pi:n är **NOT RUN** för att bevara originalets
drift. Automatisk processåterhämtning verifierades i den isolerade systemd-tjänsten.

Förberedd namngiven tunnel använder Cloudflared 2026.11.1 och systemd
LoadCredential/token-fil; inga återanvändbara hemligheter läggs i URL eller logg.

Ägaren bekräftade **ingen aktiv domän i Cloudflare**. Permanent adress är därför
**NOT RUN / EJ AKTIVERAD**. Nästa externa åtgärd: aktivera en auktoriserad egen
domän i Cloudflare. Därefter kan den förberedda namngivna tunnelrutten till
`http://127.0.0.1:2568` aktiveras och offentligt autentiserings-/WSS-spel verifieras.
Ingen domän köps och ingen domänäganderätt antas. Quick Tunnel förblir tillfällig
och upphör **19 november 2026 06:27 CET**; den förlängs inte till låtsad permanent drift.

## Fysisk evidens och acceptans

**USER-VERIFIED PHYSICAL PLAYTEST, 18 november 2026:** fysisk iPhone, Safari,
mobildata; jobbdator, Chrome Incognito, separat nät. Användaren bekräftade samma
Floor 5-rum, rörelse, skjutning, skada, reload och hörbart ljud. Modeller, OS-version,
FPS och testets längd rapporterades inte. Dessa observationer gäller den tidigare
fungerande PASS 4-stridsreleasen och ska inte tillskrivas det nya matchflödet.

| Kriterium | Status och gräns |
| --- | --- |
| 2/4/10 oberoende människor, högst 5 per lag, ägarskap | PASS, SDK och två renderade klienter med 0/2/8 peers |
| Komplett lobby → match → resultat → rematch | PASS, två separat autentiserade renderade Chromium |
| Poängseger, tidsseger, draw, samtidiga slutkills | PASS, rendering och serverintegration; korta serverfixtures |
| Stale match/liv/epoch, nekad obehörig input, isolerade rum | PASS, protokolltester |
| Saknad/gammal/förfalskad/fördröjd RTT | PASS med konservativ live-fallback och absolut historikgräns |
| Vanlig reconnect och grace/expiry | PASS automatiserat; nytt avbrott mitt i JOIN kräver färsk anslutning |
| Offline/LAN/mobil/karaktär/rendering | PASS, alla sju CI-jobb på det driftsatta paketet; slutlig dokumentationsrevision kräver samma kontroller före merge |
| Pi 2/4/10 kapacitet och verklig termik | PASS, fysisk Pi och protokollklienter |
| Pi 30 min, matchövergångar och ≥20 byten/respawns | PASS, 20 byten, 30 reconnects, 2 730 combat-respawns; serverkod identisk, klientfixens byggidentitet redovisas ovan |
| Strikt tickintervall p99 <16.67 ms | FAIL som prestandamål; total tickarbetskostnad klarar målet |
| Publik aktivering, verklig rollback och HTTPS/WSS efter releasebyte | PASS, två autentiserade SDK-peers per steg; tio anslutningar efter tunnelbytet |
| Publik hel 600-sekundersmatch, resultat och samma-rum-rematch | PASS, två separat autentiserade renderade Chromium på Mac; vanlig levererad UI och standardregler |
| Stoppa offentlig exponering och återöppna | PASS, HTTP 530 vid stopp, HTTP 200 och WSS-spel efteråt |
| Systemd-start/återhämtning utan MacBook | PASS, enabled/PID 1 och isolerat SIGKILL-prov; fysisk Pi-reboot NOT RUN |
| Stabil egen HTTPS/WSS-adress | NOT RUN, aktiv Cloudflare-domän saknas |
| iPhone Safari + Chrome Incognito: grundläggande strid och ljud | USER-VERIFIED PHYSICAL PLAYTEST |
| Fysiskt nytt match/resultat/rematch, död/respawn, bakgrund/reconnect, längre spel | NOT RUN |
| Fysisk Android, fysisk Windows-maskin med specificerat OS | NOT RUN; jobbdatorns OS rapporterades inte |
| TCP-paketförlust/retransmission | NOT RUN |

Kvar att prova fysiskt efter aktivering: det nya hela match/resultat/rematch-
flödet, död och respawn, ett kort bakgrundsavbrott med Fortsätt samt en längre
vanlig spelsession. Android får separat evidens när en enhet faktiskt provas.
