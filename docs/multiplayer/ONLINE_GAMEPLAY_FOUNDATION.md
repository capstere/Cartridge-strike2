# Online Team Deathmatch på Floor 5

Granskningskandidat i [PR #26](https://github.com/capstere/Cartridge-strike2/pull/26), från main `4d09e578d91c9d1c5642478fa3834b77a926440d`. Spelkoden finns i `0bbe1e20f5ae36ea1e9189beb189716eb6f6e04d`. Klient och server använder protokoll 6 och byggidentiteten `330266ecaeb64803720b517d6bca28e428e03001a2aa98edc24cea1025dac7a4`. Den aktiva internetreleasen på 2568 har protokoll 5 och commit `d886a10060b8fbf9b2d3034e8c8d0ad46a8a39d1`.

## Så spelar man

- Skapa ett rum och låt **Fyll lediga platser med botar** vara ikryssat för att spela ensam eller med vänner. Välj utrustning, tryck **Redo** och starta. Servern fyller upp till fem per lag. En ny människa får en egen identitet på en ledig botplats. En frånkopplad människas reservation gäller i 15 sekunder.
- Välj Pulse SMG, lagets Arc Rifle eller Pulse Carbine, Breach Shotgun eller Scout Rifle. Varje liv ger också lagpistolen Sidearm A eller Sidearm B (p9/p12), kniv och en HE. **B** öppnar utrustning under spel. Ett nytt huvudvapen levereras vid nästa respawn. På mobil finns utrustning och granat under **MER** i ren HUD.
- Håll höger musknapp eller tryck **SIKTA** på mobil. **1–4** väljer medförd utrustning, **R** laddar om och **4 + eld** kastar HE. På mobil växlar **VAPEN** mellan skjutvapen och kniv. Välj granaten och tryck **KASTA**.
- Servern avgör träffspridning, hagel, magasin, reserv, omladdning, kast, explosioner och poäng med spelets befintliga regler. Den replikerar aktiva granater och skadade rutor. Historiska skott läser rutans bryttid. Rutan återställs när rummet återgår till väntrummet för omspel. Trösklar under krossade golvhöga rutor kan passeras där golv finns på båda sidor.

## Starta kandidaten för granskning

Kör i kandidatens checkout på Pi:n. Port 2576 provades separat på loopback.

```sh
npm ci --prefix server --ignore-scripts
npm run build --prefix server -- --check
PORT=2576 npm start --prefix server
```

Öppna [det lokala väntrummet](http://127.0.0.1:2576/fps/?network=local). Vid granskning från en annan dator kan SSH vidarebefordra den lokala porten med `ssh -N -L 2576:127.0.0.1:2576 jesperfredriksson@pi`, med Pi:ns vanliga SSH-namn. Avsluta kandidatprocessen med Ctrl+C.

## Verifiering

- Två renderade Chromium-klienter i CI passerade det nya spelprovet. En ensam värd startade med nio botar. Mobilspelaren anslöt under matchen och ersatte en bot. Högerklick gav siktläge på servern och i vyn. Ett skott krossade samma ruta hos båda, vapenbyte avbröt omladdning och nytt utrustningsval sparades till nästa liv. I liggande mobilvy (844 × 390) fungerade rörelse, sikte och eld samtidigt, liksom HE-val, kast och utrustningsmeny. Den lokala Pi-webbläsaren nådde tidsgränsen under den inledande programvarurenderingen. Det godkända tvåklientsprovet kördes på macOS i CI. [Körning på spelkodens commit](https://github.com/capstere/Cartridge-strike2/actions/runs/44394008231)
- Det riktade serverprovet passerade på Pi:n och i CI. Det kontrollerar bl.a. åtta hagel per patron, halvautomatisk eld, lagets pistol, gammalt eller upprepat kommando, kort avbrott med bibehållen identitet och utrustning, sen anslutning med aktiv HE och krossat glas, poäng när kastaren lämnar, död och respawn, resultat, omspel och rumstömning. Fysikprovet verifierar att skott, spelare och vägval kan passera en tidigare stängd ruta. Skott från före bryttidpunkten möter fortfarande glaset.
- Offline Classic och Endless gav identiska tillstånds- och händelsehashar mot referensen i alla åtta deterministiska körningar, totalt 9 600 tick. Driftens HTTPS/WSS-prov passerade mot en separat loopbackinstans med inbjudan, två klienter, rörelse, skott, omladdning och avslut. Byggkontrollen och kontrollen av driftpaketets 519 runtimefiler passerade. [Kontroller på PR:ns aktuella revision](https://github.com/capstere/Cartridge-strike2/pull/26/checks)

## Belastning på Raspberry Pi 5

Separat serverprocess på en Pi 5, Node 26.13.0, loopback och hela Floor 5. SDK-klienter styrde människoplatserna. Serverns vanliga BotController styrde varje bot. Inget renderingsjobb kördes samtidigt på Pi:n. Baslinjen använde den publika releasens kod i en separat process, med två spelare i C08. AI-körningarna använde normala startplatser. Skillnaden omfattar både AI och fler aktörer.

| Mått | Baslinje, 2 människor, 15 s | 2 människor + 8 botar, 300 s¹ | 1 människa + 9 botar, 300 s |
| --- | ---: | ---: | ---: |
| Simulering p95, ms | 0,23 | 6,56 | 6,91 |
| Hela tick p95 / p99, ms | 0,63 / 1,49 | 7,07 / 22,92 | 7,35 / 27,71 |
| Längsta tick i mätfönstret, ms | 8,25 | 218,36 | 331,08 |
| Arbete per uppdatering inkl. serialisering, medel ms | 0,43 | 2,39 | 2,46 |
| Utgående byte/s per klient | 6 852 | 26 106 | 23 827 |
| CPU, procent av en kärna | 9,1 | 20,9 | 21,1 |
| RSS / använd heap, MiB | 234,9 / 62,7 | 245,3 / 65,6 | 243,9 / 65,4 |

¹ Tvåmänniskoprovet kördes på utvecklingsbygget `6576f748` före den sista glas- och mobiljusteringen. Soloprovet gäller byggidentiteten överst. Tidspercentilerna omfattar upp till de senaste 8 192 uppdateringarna. Medelarbete, trafik och CPU omfattar hela mätperioden.

Soloprovet gav 17 879 uppdateringar (59,6/s), 6 941 m sammanlagd botrörelse, 454 registrerade botskott, 19 kast, nio glasbrott och 41 respawn efter stridsdöd. Med åtta botar registrerades 6 241 m, 229 botskott, 20 kast, sju glasbrott och 35 respawn. Båda rummen tömdes efter sista klienten, med noll nätverksmottryck och ingen rapporterad Pi-strypning. De långsammaste uppdateringarna överskrider budgeten på 16,7 ms och kan märkas som ryck. Nästa prestandaprov bör profilera vägval under de långa uppdateringarna och mäta om utspridda vägberäkningar minskar topparna.

Återskapa soloprovet med `CS2_LOAD_AI=1 CS2_LOAD_COUNTS=1 CS2_LOAD_SECONDS=300 node tools/network-load.mjs`. Använd `CS2_LOAD_COUNTS=2` för två människoplatser.

## Kvar

Fysisk provning av denna kandidat på iPhone och Android är **NOT RUN**. Kontrollera särskilt samtidig rörelse, sikte och eld, ljud, rotation, återanslutning och omspel. Nästa utvecklingssteg är att porta Classics kombinerade regelmodell, lagroller, köpekonomi, rundor, plantering/desarmering och gisslan samt ge botarna uppdragsbeteende. Därefter följer zombies och Dansmannen. Rök, flash och raketkastare återstår online.
