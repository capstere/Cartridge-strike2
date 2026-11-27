# Cartridge-Strike 3 development

Jesper authorized dependency-ordered CS3 development and release after CS3-12. Preparation [PR #47](https://github.com/capstere/Cartridge-strike2/pull/47) and the private recovery and baseline package are verified. The Pi continues to serve its measured CS2 release.

On `develop/cartridge-strike-3`, [Rush #49](https://github.com/capstere/Cartridge-strike2/pull/49), [private access #48](https://github.com/capstere/Cartridge-strike2/pull/48), [English menus and Solo #50](https://github.com/capstere/Cartridge-strike2/pull/50) and [positional firearm audio #51](https://github.com/capstere/Cartridge-strike2/pull/51) are merged. The [first-person countdown #54](https://github.com/capstere/Cartridge-strike2/pull/54) merged at `adb3cdf6` after eight green checks. CS3-01 is VERIFIED and CS3-04 account and room access is active on `cs3/04-account-access`. The integrated slices include [handling and V6 #53](https://github.com/capstere/Cartridge-strike2/pull/53) and [Meltem #52](https://github.com/capstere/Cartridge-strike2/pull/52). Use the [execution handover](docs/cartridge-strike-3/CODEX_HANDOVER.md) and [current status](docs/cartridge-strike-3/PROJECT_STATUS.md) for package gates, native receipts and next checks. The original CS2 recovery records follow.

The [16:04 UTC checkpoint](docs/cartridge-strike-3/PROJECT_STATUS.md#november-27-1604-utc) records the verified handling and Meltem slices. Resume [buffered slide #57](https://github.com/capstere/Cartridge-strike2/pull/57), [accounts #55](https://github.com/capstere/Cartridge-strike2/pull/55) and [map qualification #56](https://github.com/capstere/Cartridge-strike2/pull/56). Once CS3-02 passes review, open CS3-03 and CS3-05. The release remains gated on CS3-12.


---

# Cartridge-Strike 2 handover

## Egna matchinställningar i multiplayer

Värden väljer 3, 5, 10 eller 15 minuter och 10, 25, 50 eller 100 fiendekills i Team Deathmatch. Classic kan spelas till 3, 5 eller 8 rundvinster. Botar ställs in separat för varje lag, upp till ledig lagkapacitet. Värden kan ändra Zombies och Dansmannen oberoende. Matchvalen följer med vid omspel och sparas i familjerummet.

Protokoll 14 skickar inställningarna i auktoritativt rumstillstånd. V1-filen får fem nya värden medan den tidigare botflaggan finns kvar för rollback. [Inställningar, kompatibilitet och testkommandon](docs/multiplayer/custom-match-settings.md)

Live på Pi:n med revision `8307e91118dba4fdca964012d2b0c247a40221fd` och bygg-ID `30f8f4af97b2b082f995196f06f498b132ba9bf8d303671ee8ab8d4b69590385`. Alla åtta CI-jobb passerade, inklusive 258 FPS-tester och 53 servertester. Rummen var tomma vid aktiveringen. Floor 5 verifierades med två klienter via publik HTTPS/WSS. Via familjelänken hade Compact Arena tre minuter, tio kills och två respektive tre botar. Manuell eld bekräftades av servern. Samma matchval öppnades igen. Därefter återställdes familjens val och jämfördes med säkerhetskopian. [PR 45](https://github.com/capstere/Cartridge-strike2/pull/45) · [Aktiveringskvitto](docs/multiplayer/custom-match-settings/activation.json) · [Familjeprov](docs/multiplayer/custom-match-settings/live.json)

Återställ när rummen är tomma med `sudo cs2-online status` och `sudo cs2-online rollback`. Föregående Pi-revision är `75feffd9360da2380098bfea18f60df12713feff`. Den äldre servern läser familjefilen med sina tidigare matchgränser. Exakta nya värden kan bevaras i en separat säkerhetskopia om den äldre versionen sparar om filen. Mobiltesterna använde emulerad touch. Nästa praktiska prov är en match från en fysisk mobil. [Desktopbild](docs/multiplayer/custom-match-settings/desktop-floor5-classic.jpg) · [Mobilbild](docs/multiplayer/custom-match-settings/mobile-compact-host.jpg)

## Kartval i multiplayer · 26 november 2026

Compact Arena är den första nya onlinebanan. Värden väljer karta i väntrummet, alla laddar serverns val och väljer **Redo**. Floor 5 har kvar Classic och Team Deathmatch. Compact Arena har tre stridsvägar, sju namngivna platser och Team Deathmatch för upp till fem spelare per lag. Familjerummet minns kartvalet på samma inbjudningslänk.

Protokoll 13 förhandlar en godkänd kollisionsvärld per rum. De renderade Pi-proven gick till slutsignal med två, fyra och tio aktörer. Med nio botar på Compact Arena var bildintervallet 30,3 ms i median och 56 ms vid p95. Den emulerade mobilmatchen med två människoplatser hade 18,8 respektive 25,8 ms. Fysisk mobil och långtidsmätning av minne återstår. [Film, skärmbilder och mätvärden](docs/multiplayer/compact-arena/evidence/README.md)

Pi:n kör `75feffd9360da2380098bfea18f60df12713feff`, protokoll 13 med bygg-ID `09cc3fcc2f9ea016674b5b66be65716f0cf21c0df6deb432cff2f323717192a7`. Alla åtta CI-jobb passerade, med 258 FPS-tester och 50 servertester. Rummen var tomma vid aktivering. Två klienter verifierade Floor 5 via publik HTTPS/WSS. Genom familjelänken spelade en renderad klient och nio botar Team Deathmatch på Compact Arena. Servern bekräftade två skott och rummet mindes kartan när det öppnades igen. Familjens tidigare val återställdes i väntrummet och jämfördes med den privata säkerhetskopian. Rummen var därefter tomma. [Aktivering](docs/multiplayer/compact-arena/evidence/activation.json) · [Familjeprovet](docs/multiplayer/compact-arena/evidence/live.json) · [Spelbild från driften](docs/multiplayer/compact-arena/evidence/live-compact.jpg)

Vid första liveprovet kom två inställningsändringar i snabb följd. Webbläsarprovet skickade det äldre värdet från grannväljaren när det återställde residenterna. Det upptäcktes vid jämförelsen, korrigerades via väntrummet och hela provet passerade sedan med inväntad bekräftelse i båda väljarna. Det längre Pi-provet gjorde 16 kartbyten och fann en nåbar renderare efter varje byte. Två separat inloggade spelklienter utan botar delade tre slutresultat. [Mätningar och reproduktion](docs/multiplayer/compact-arena/evidence/README.md)

För återställning, kör `sudo cs2-online status` och sedan `sudo cs2-online rollback` när rummen är tomma. Den sparade föregående releasen är `6093bf6d11ccdc79a469ceb430d6d64375dc1379`. Nästa praktiska kontroll är en privat match från en fysisk mobiltelefon. [Kartor och drift](docs/multiplayer/compact-arena/README.md) · [Banan i PR 42](https://github.com/capstere/Cartridge-strike2/pull/42) · [Spelet i PR 43](https://github.com/capstere/Cartridge-strike2/pull/43)

## Landning efter dödande huvudträff · 26 november 2026

I Classic och Team Deathmatch får spelare och lagbotar en bakåtkastning när den dödande kulan träffar de översta 17 procenten av träffvolymen. Servern använder samma kroppsläge som vid skottet och skickar dödstid och variant även vid återanslutning. Den lokala simuleringen använder samma träffregel. Skada och rustning följer tidigare regler. Vanliga dödsfall använder `Death01`.

Prova i ett privat rum med två lag. Minska motståndarens hälsa med kroppsträffar från P9 och sikta på huvudet inför det sista skottet. Skytten kan se hela rörelsen på 2,5 sekunder. Upprepa med sista träffen i bålen för att jämföra. [Familjerummet](https://cs2.capstere.com/room/JESPERS-ROOM) · [Film med båda figurerna](docs/headshot/landning-fore-efter.mp4)

Separata animationsbanker laddas före matchen. Gamla och registrerade kompatibla karaktärer behåller sina 13 originalklipp. Skjutvapen, patronväska, skor och dräkt ingår i det visuella provet. När en kropp ligger still återanvänds slutposen och dess synlighetsgränser. [Kontaktmått, väggprov och prestanda](docs/headshot/README.md)

Spelversion 0.18.0, protokoll **12**, bygg-ID `5a438af3b9d8d19fa82b045f6fb1483261c43b81737c4796ce8be21c112d5376`. Mobilproven på Pi:n använder emulerad touch. Fysisk iPhone och Android återstår. Vid mycket trång placering kan vapnet kort överlappa väggen i övergången från den levande posen. Föregående fungerande Pi-release för rollback är `5f740bf84fe9b16bdaa9fd257569d86f6d62d91f`. Aktivering och återställning går genom `cs2-online` när rummen är tomma. [Driftguide](deploy/online/README.md)

Det isolerade matchprovet på Pi:n följde hela klippet i båda spellägena. Den andra klienten bekräftade samma dödstid och variant. Första P9-träffen lämnade 77 hälsa och den femte dödade. Familjelobbyn öppnades och stängdes med befintliga inställningar. Webbläsarprovet för Dansmannen inväntar nu samma runda och liv på klient och server innan det pausar för testplacering. [PR #41 och driftkvitto](https://github.com/capstere/Cartridge-strike2/pull/41)

## Valbar automatisk eld online · 26 november 2026

Mobilens befintliga **Automatisk eld på mobil** fungerar även i Classic och
Team Deathmatch online, inklusive familjerummet. Välj i matchmenyn (pausknappen,
eller **MER → RESULTAT** i Clean-vyn). På skjuter när siktet ligger på en synlig
fiende; av visar **ELD**. Valet sparas lokalt. Ett nytt onlinebesök börjar med
manuell eld; tidigare sparade val och offlinelägets standard behålls.

Halvautomatiska vapen använder vanliga avtryck och släpp i klientens fasta
inmatningssteg. Serverns skottregler, protokoll, skada, magasin och eldhastighet
är oförändrade. Granater och raketer förblir manuella. Passiva figurer och
Dansmannen är aldrig automatiska mål online och blockerar fortfarande skottlinjen.
[Mobilguide](docs/mobile-controls.md).

Alla 252 grundtester passerade, inklusive de 36 riktade proven för skjutning,
mobilinmatning och nätklienten. Separat kodgranskning gav inga blockerande fynd.
Fyra av fem riktade servertester passerade först; det befintliga provet för
sammanförda avtryck föll en gång och passerade sedan isolerat på både oförändrad
bas och kandidat. Orsaken till det första utfallet är inte fastställd.
Ett separat integrationsprov i `server/test/mobile-autofire.test.mjs` passerade:
den riktiga servern bekräftade minst tre P9-skott, ammunition och skada samt
oförändrad manuell avtryckare, utan ogiltiga indata.

Det nya browserprovet är `tools/online-autofire-browser.mjs` och ingår i CI.
Första CI-försöket verifierade båda skjutlägena i Classic och Team Deathmatch.
Ett senare raketljud uteblev på en klient, som i det äldre dokumenterade CI-felet.
Vid omkörningen missade det nya provet ett manuellt Classic-avtryck direkt efter
återupptagning. Provet inväntar nu en ny neutral inmatning hos servern efter
återupptagning och vapenberedskap före sitt enda manuella tryck; oförändrade
skottkrav samt server- och pekardiagnostik behålls. Nästa körning godkände mobil-
och raketproven men visade att residentprovets datorkamera kunde återta en gammal
riktning efter testplacering. Även den fixturen inväntar nu serverbekräftad paus
och verifierar den verkliga inmatningens kamerariktning. Synlighets-, animations-
och ljudkraven är oförändrade. Alla sju CI-jobb passerade på slutrevisionen.
Den lokala mjukvarurenderingen nådde verklig målmarkering men klarade inte kravet
på tre bekräftade skott; mobilklienten visade cirka en sekunds latens. Det är
inget godkänt browserprov. Det hårdvaruaccelererade CI-provet passerade på slutrevisionen.

**Live på Pi:n sedan 26 november 2026.** Revision
`5f740bf84fe9b16bdaa9fd257569d86f6d62d91f`, bygg-ID
`e1bb12c95cf06c597739e3d8f4d0b6014e23e7f05d0469ccbe47ebc387cd6976`,
spelversion 0.18.0 och protokoll 11. Rollback
`1631e8300946d2a048635ce3e5e4e5ebdad46d0d` finns kvar och klarade det isolerade
förprovet. [Driftkvitto för PR #40](https://github.com/capstere/Cartridge-strike2/pull/40#issuecomment-7189550540)

Två separata inloggningar i familjerummet verifierade automatisk P9-eld mot en
synlig motspelare, stopp vid målförlust och paus, manuell **ELD** samt att valet
låg kvar efter magasins- och sidomladdning. **KASTA** och **AVFYRA** avfyrade
granat och raket manuellt med automatisk eld på. Familjerummets inställningar
återställdes efter provet. Mobilproven kördes med emulerad Pixel 7 i Chromium,
liggande 915 × 412. Fysiska iPhone- och Android-prov återstår.
[Familjelänk](https://cs2.capstere.com/room/JESPERS-ROOM)

## Permanenta familjerummet · 25 november 2026

Den fasta länken öppnar `JESPERS-ROOM`. Spelarna anger serverns inbjudningskod om den efterfrågas och använder sedan det separata familjelösenordet. Första behöriga spelaren som ansluter färdigt blir värd. Om värden lämnar, eller den ordinarie återanslutningsfristen på 15 sekunder löper ut, tar en ansluten spelare över. [Fast länk](https://cs2.capstere.com/room/JESPERS-ROOM)

En enda instans skapas när någon ansluter och stängs när människor och reserverade platser är borta. Spelläge, botfyllnad, botsvårighet, friendly fire, zombies och Dansmannen sparas på Pi:n. Efter omstart öppnar samma länk ett nytt väntrum med de sparade valen. Familjerummet har en egen plats utöver serverns två vanliga rum. Lösenordet ligger i `/etc/cartridge-strike2-pilot/family.env` med root-behörighet 0600. [Driftguide och lösenordsbyte](deploy/online/README.md#det-permanenta-familjerummet)

Spelversion **0.18.0**, protokoll **11**, bygg-ID `4e69d28c8fc1089d83fb9e33ae481a58ed9dd5a06030f93ee9eedf07ac2227a0`. Föregående Pi-release för rollback är `d65b53bb9e0e67f2c90b77a52f9b2a960744cbb8`. Driftkvittot i PR:n anger exakt live-revision, konfigurationskopia och spelprov. Återställ med `sudo cs2-online rollback` när rummen är tomma. Lösenord och sparade inställningar ligger utanför releasen. [PR och driftkvitto](https://github.com/capstere/Cartridge-strike2/pull/39)

**Nästa prov är fysiskt.** Öppna den fasta länken från ett meddelande på iPhone Safari och Android Chrome. Spela en match med två olika deltagare och prova återanslutning efter ett kort appbyte. De riktade regressionsproven finns i `server/test/family-room.test.mjs`, `server/test/family-lifecycle.test.mjs` och `tools/network-family-browser.mjs`.

## Förstapersonens armar och grepp · 25 november 2026

Alla 13 utrustningsmodeller använder samma riggade händer. AR47:s stödhand följer magasinet, shotgun-handen följer pumpen och håller varje patron mellan tumme och pekfinger. Ärmarna böjs vid armbågen och möter handskens manschett även vid inspektion. Båda laguniformerna samt kompatibla sparade och registrerade karaktärer använder sina egna färger och ärmlängder. [Spela](https://cs2.capstere.com/) · [Före och efter i rörelse, material och renderingskostnad](docs/view-arms/README.md)

Releasen har spelversion **0.18.0**, protokoll **11** och bygg-ID `81a46070f94ce2030a3f61d7bc589b1e1ceab896463b0c9391c9cdfca91565be`. Föregående fungerande Pi-release är `d14eed3725b4428fa61cdaa743f6543c8394e661`. Driftkvittot i PR:n anger aktiverad revision, konfigurationskopia och resultat från spelprovet på domänen. Återställ med `sudo cs2-online rollback` när rummen är tomma. [Granskning och driftkvitto](https://github.com/capstere/Cartridge-strike2/pull/38) · [Driftguide](deploy/online/README.md)

I C08 gick AR47 från 21 till 16 ritanrop och shotgun från 20 till 15. Båda fick 2 316 fler trianglar i förstapersonspasset. Alla 13 föremålens vapenytor, tredjepersonsmodeller och rörliga vapendelar matchade baslinjen. [Granskad spelkod](https://github.com/capstere/Cartridge-strike2/commit/307b3fa3ead66267260ed09a0cd6d43cfb6ec740)

**Nästa prov är fysiskt.** Spela AR47 och shotgun på iPhone och Android i liggande läge. Kontrollera greppet genom en hel omladdning och under löpande inspektion. Här provades 844 × 390 och 932 × 430 med emulerad touch i Chromium på Pi 5. P9:s stödarm skymmer kort en del av manteln vid tomomladdning. Raketkastarens kropp skymmer delar av stödhanden längst bak i omladdningen.

## Föregående release på Pi:n · kvalitetsgranskning 22 november 2026

Den 22 november körde [onlinespelet](https://cs2.capstere.com) `d14eed3725b4428fa61cdaa743f6543c8394e661`, spelversion 0.18.0, protokoll **11**, bygg `801c1f926936855e670d958da1c63d1d433e0894fcef28df6873c593cca11bb1`. Återställningsrelease `d8e780acae2d9998b2e2cf0d7f719e0c958b0fb9`, konfigurationskopia `20261122T145255858184Z`. Separat GitHub Pages-kontroll gav samma bygge.

- [#34](https://github.com/capstere/Cartridge-strike2/pull/34) rättade målremsan som överlappade kontrollområdet i offline Endless. [#35](https://github.com/capstere/Cartridge-strike2/pull/35) låter en Classic-överlevare slutföra omladdningen under köpperioden. [#36](https://github.com/capstere/Cartridge-strike2/pull/36) minskade pausen i en redan pågående match när ytterligare ett rum skapas. Alla tre är mergade med oberoende granskning och 7/7 godkända slutjobb vardera.
- I två jämförbara Pi-prov minskade den befintliga klientens patchgap från 2,89–2,98 s till 0,97–0,99 s. Ett kallt första rum tar fortfarande drygt tre sekunder. Botvägval sammanföll med separata långa tickar. Sen radio och raketljud reproducerades med två samtidiga mjukvarurenderare.
- Detaljerade mätfönster, publika verifieringar, testbegränsningar och fem prioriterade nästa steg finns i [kvalitetsrapporten](docs/playtest-audit/QUALITY_AUDIT_2026-11-22.md). Nästa tekniska steg är att mäta det kvarvarande arbetet vid öppning av ett andra rum. Fysisk iPhone och Android **NOT RUN**.

## Tidigare release av botsvårighet, karta och lagradio

**Botsvårighet, förbättrad Floor 5-karta och lagradio är live i Classic och Team Deathmatch.** [Spela på cs2.capstere.com](https://cs2.capstere.com).

- Aktiv release `d8e780acae2d9998b2e2cf0d7f719e0c958b0fb9`, protokoll **11**, byggidentitet `6fb7d34c08d4b36fc26532d6779793eda61443f9081ff42cfc89dbb8919a5785`, protokollhash `6ed5ea19797e9019b7c9a1aa8327d1cbcd669b52e7b05ee0ce375232b975ed1e`.
- Värden väljer **Botsvårighet** i väntrummet. **Normal** är standard. Valet låses vid nedräkning och behålls vid återanslutning och omspel. **Casual** använder 55 procent skada före rustning när en fientlig lagbot träffar en människa.
- Öppna kartan med **M** eller **MER → KARTA**. Den visar den egna riktningen, lagkamrater, hissarna Cargo Lift och Transit Lift samt namngivna platser. Classic visar bombplatsen i North Laboratory (I01), gisslans start i Technical Storage (I12) och räddningszonen i Main Atrium (I31).
- Öppna lagradion med **Z** eller **MER → RADIO**. **Håll ihop** och **Behöver understöd** kan omdirigera en tillgänglig lagbot till avsändarens position i högst åtta sekunder. Botens strid och kritiska uppdrag har företräde. En vanlig ping markerar en fast plats för lagkamraterna. Servern begränsar signaler till en varannan sekund per spelare och minst 250 ms mellan lagets signaler.

### Granskning och testbevis

| Ändring | Granskat PR-huvud | Merge | Alla sju CI-jobb |
| --- | --- | --- | --- |
| [#31 · Botsvårighet](https://github.com/capstere/Cartridge-strike2/pull/31) | `7f398c64878cbc8f285e10f6e75764e4605b3156` | `7b3d6a8cc8ec844d81ab719b7effe7bc5f43eac2` | [44784121146](https://github.com/capstere/Cartridge-strike2/actions/runs/44784121146) |
| [#32 · Floor 5-karta](https://github.com/capstere/Cartridge-strike2/pull/32) | `3a6b0561c14dce2f1a5562c7231f564aabff111f` | `7bb2790a460faae50df1f041aa8ccfb7485de7aa` | [44790243454](https://github.com/capstere/Cartridge-strike2/actions/runs/44790243454) |
| [#33 · Lagradio och pingar](https://github.com/capstere/Cartridge-strike2/pull/33) | `b579884cf9ffb961a2f32736e7a98d80cb3525d2` | `d8e780acae2d9998b2e2cf0d7f719e0c958b0fb9` | [44798442420](https://github.com/capstere/Cartridge-strike2/actions/runs/44798442420) |

Efter merge passerade både Node-kontrollerna och Pages-bygget. [Node-kontroller](https://github.com/capstere/Cartridge-strike2/actions/runs/44804308371), [Pages-bygge](https://github.com/capstere/Cartridge-strike2/actions/runs/44804308145).

- Botproven körde verkliga serverbotars reaktioner och träffar på alla tre nivåer. Separata fall kontrollerade skademultiplikatorn före rustning samt PvP, friendly fire, självskada och zombies. De täckte även värdbehörighet, rumsisolering, reservplatser, respawn, rundgränser och omspel.
- Kartproven täckte båda hissarna, Classic-mål och scenarier för bomb, eskort, rundbyte och återanslutning. Renderad dator- och touchvy testades i **Clean** och **Full**, inklusive liggande bredd med säkra sidomarginaler.
- Radioproven använde två lagkamrater, en motståndare och serverbotar. Bara laget tog emot ping och kommando. Proven täckte också botens strids- och uppdragsprioritet, utgångstid, dubbla kommandon, gamla liv och anslutningar samt omspel. Det renderade provet körde Z, muslås, MER → RADIO, avsiktlig platsmarkering och vapenstatus. Befintliga CI-prov körde även Classic-köp, plantering/desarmering, TDM-omspel, raketkastare, residenter och 24 allmänna Floor 5-livscykler.
- Det första CI-försöket på #33 tappade ett raketljud på en klient. Det efterföljande försöket på samma revision passerade. I separata SwiftShader-prov på Pi:n nådde både ett raketljud och en radioreplik ljudmotorn senare än den befintliga åldersgränsen på 0,4 sekunder. Gränsen gör att klienten kan hoppa över ljud efter ett längre uppehåll i renderingen.
- På speladressen passerade den ordinarie privata inloggningen, HTTPS/WSS, rörelse, skott och omladdning med två SDK-klienter. Tre separat inloggade SDK-klienter provade Hard i TDM och Casual i Classic med tio aktörer per rum. Lagkamraten fick ping och kommando. Motståndaren fick noll sådana meddelanden. Två separat inloggade renderade Chromium 156-klienter valde samma svårigheter i väntrummet, öppnade kartan med M och MER → KARTA och skickade bekräftad radio och touchping mellan klienterna i båda lägena. Det publika renderade provet kördes med ljudet av och SwiftShader på Pi:n. TDM visade tillfälligt cirka 1,19 s i klientens latensindikator under den samtidiga mjukvarurenderingen.
- Fysisk iPhone och Android **NOT RUN**. Nästa steg är ett fysiskt prov med två lagkamrater, M och Z på datorn samt MER-menyn och kartans läsbarhet i liggande på telefon.

### Drift och återställning

Den versionsbundna managern `f685ee759eef4f6183f2c135b6b251abbb3f1cd1` och dess SDK-probe verifierades isolerat mot båda releaserna. Aktivering skedde när rumsantal och spelarantal var noll. Återställningspunkt `a00c57b63425e0ec19cad9dab82c2cf57c55a934` använder protokoll 9. Privat konfigurationskopia `20261120T194154484876Z`. Driftkontrollen bekräftade samma processer för originaltjänsten på port 2567 och Cloudflare-tunneln samt samma privata konfiguration. [Driftguide och rollback](deploy/online/README.md).

### Belastning på Pi 5

Före är release `a00c57b63425e0ec19cad9dab82c2cf57c55a934`, bygg `cc2162185e791bc603a05713f551d0bbd617159360b98a802720a02a10041ae6`. Efter är `b579884cf9ffb961a2f32736e7a98d80cb3525d2`, bygg `6fb7d34c08d4b36fc26532d6779793eda61443f9081ff42cfc89dbb8919a5785`. Belastningsverktygen körde full Floor 5 på samma Pi med Node 26.13.0, en loopback-SDK-klient och nio riktiga Normal-botar. Varje mätning började efter fem sekunders uppvärmning. Classic mättes i 180 s och TDM i 90 s. En körning per scenario och version, med vanlig GC och utan ett samtidigt webbläsarjobb. [Belastningsverktyg](tools/network-load.mjs).

Alla värden är före → efter. Millisekunder gäller hela mätfönstret. Antalen visar >33 / >50 / >100 ms.

| Läge och figurer | Tickarbete p50 / p95 / p99 / max | Långt tickarbete | Tickintervall p50 / p95 / p99 / max | Långa intervall |
| --- | --- | --- | --- | --- |
| Classic av | 0,81 / 1,87 / 3,48 / 95,69 → 0,86 / 1,83 / 3,15 / 65,64 | 4 / 2 / 0 → 4 / 2 / 0 | 16,16 / 17,50 / 32,35 / 97,30 → 16,17 / 17,00 / 32,25 / 65,87 | 28 / 9 / 0 → 24 / 11 / 0 |
| Classic på | 1,13 / 2,22 / 3,59 / 86,95 → 1,21 / 2,21 / 3,65 / 86,71 | 8 / 3 / 0 → 6 / 3 / 0 | 16,14 / 17,01 / 32,30 / 87,39 → 16,16 / 16,96 / 32,27 / 87,10 | 33 / 14 / 0 → 29 / 12 / 0 |
| TDM av | 1,12 / 5,82 / 19,85 / 84,86 → 1,11 / 5,50 / 18,93 / 85,66 | 19 / 9 / 0 → 20 / 12 / 0 | 16,18 / 20,74 / 32,39 / 85,73 → 16,17 / 21,91 / 32,36 / 130,52 | 25 / 9 / 0 → 26 / 14 / 1 |
| TDM på | 1,41 / 5,90 / 18,78 / 82,18 → 1,41 / 5,93 / 19,75 / 93,63 | 20 / 11 / 0 → 21 / 11 / 0 | 16,17 / 21,96 / 32,41 / 82,40 → 16,15 / 21,03 / 32,45 / 113,34 | 26 / 11 / 0 → 24 / 11 / 1 |

| Läge och figurer | Server-CPU % | RSS / använd heap vid slut, MiB | WebSocket ut / in per SDK-klient, KiB/s |
| --- | --- | --- | --- |
| Classic av | 8,8 → 8,8 | 216 / 77 → 219 / 68 | 10,21 / 0,98 → 11,56 / 0,91 |
| Classic på | 10,5 → 10,7 | 225 / 68 → 212 / 82 | 12,72 / 0,88 → 12,66 / 0,86 |
| TDM av | 15,1 → 14,8 | 262 / 88 → 256 / 89 | 24,15 / 1,48 → 24,10 / 1,48 |
| TDM på | 17,3 → 17,5 | 258 / 97 → 266 / 73 | 25,63 / 1,48 → 25,55 / 1,48 |

Server-CPU anges mot en kärnas kapacitet. Trafiken är WebSocket-nyttolast och mätningen avser loopback. Kandidatens Classic-botar sköt 60 gånger i båda körningarna och gisslan förflyttade sig cirka 26 m med figurer av och 67 m med dem på. Kandidatens TDM-botar sköt 153 respektive 118 gånger. Classic-stridens p95 var 2,05 → 2,01 ms med figurer av och 2,39 → 2,44 ms med dem på. Antalet stridstickar och uppdrag varierade. Körningarna mätte normal spelbelastning med vilande lagradio. De två längre TDM-intervallen gäller tid mellan uppdateringarna. Vägval var den största uppmätta delen av de längsta TDM-tickarna, 84,47 av 85,66 ms med figurer av och 79,47 av 93,63 ms med dem på. Orsaken till de två långa intervallen är okänd.

Kartans separata Canvas 2D-prov jämförde bygg `98cc5d8da6db7c02729032c215fed946c74b26e3584e4cb6658a4d07ea8555e0` med `1879db1fb2e88aaaeec643fc0a137c62d3d5fd3b05120a9aaa6fc23d388f9785` på Chromium 156 med SwiftShader. För varm karta var p50 0,025 → 0,025–0,050 ms och p95 0,0375 → 0,0375–0,125 ms per ritkommando. Högsta värde var 0,1375 → 0,500 ms i de separata mätfönstren. Intervallets p95 var 16,7–16,8 ms i båda versionerna. Ett enskilt bildintervall på 116,7 ms förekom i kandidatprovet. Det blev noll dolda ritningar och noll varma cachebyggen. Separat prov med 30 kalla öppningar per läge och vy mätte p95 2,0–3,0 → 5,0–6,9 ms. Provet omfattar kartlagret isolerat i dator- och emulerad touchvy.

## Tidigare leverans av Friendly fire och Rocket Launcher

**Friendly fire och Rocket Launcher är live i Classic och Team Deathmatch på [cs2.capstere.com](https://cs2.capstere.com).**
[PR #30](https://github.com/capstere/Cartridge-strike2/pull/30) mergades som `3de711cdeb4e4bf74abc84e6f08dfe5f709f43f4`.
Releasen för den leveransen `a00c57b63425e0ec19cad9dab82c2cf57c55a934` använder protokoll 9 och
byggidentiteten `cc2162185e791bc603a05713f551d0bbd617159360b98a802720a02a10041ae6`.

Värden väljer **Friendly fire** i väntrummet före **Starta match**. Nya rum
startar med **Av**. I Classic kostar **Rocket Launcher** 3 600 i köpmenyn
under köpperioden. Öppna med **B** på datorn eller **MER → KÖP** på touch.
I Team Deathmatch väljs **Rocket Launcher** under **Utrustning** i väntrummet
eller i utrustningsmenyn under matchen för nästa respawn. **Zombies** och
**Dansmannen** kan fortfarande slås på var för sig i väntrummet.

Alla sju [CI-jobb](https://github.com/capstere/Cartridge-strike2/actions/runs/44530033716)
passerade på exakt releasecommit. Två renderade klienter verifierade menyer,
raketflygning, gemensam explosion och ljud, skada och omladdning i båda lägena
med mus och emulerad touch. TDM-provet täcker också avgörande raket vid matchslut.
På den publika adressen passerade separat inloggning och HTTPS/WSS. Spelprovet
gav 100 HP för lagkamraten med Friendly fire av och 0 med det på i TDM.
Classic-provet tjänade ihop krediter via en riktig runda, köpte vapnet för
3 600 och verifierade samma explosion och lagkamratsskada på två klienter.

Pi 5 körde fyra jämförbara 30-sekunders prov efter 5 sekunders uppvärmning
på hela Floor 5 med tio SDK-aktörer. Med SMG respektive raketkastare mättes
tickarbetets p95 till 1,35 respektive 1,38 ms i TDM och 1,43 respektive 1,47 ms
i Classic. Båda raketkörningarna skickade 60 riktiga raketer. Ingen tickexekvering
överskred 33 ms. Högsta uppmätta tickintervall var 33,50 ms. SDK-aktörerna avfyrade
vapnen i kontrollerade salvor mot ytor i C08.
Jämförelse, CPU, minne, trafik och mätbuild finns i [PR #30](https://github.com/capstere/Cartridge-strike2/pull/30).

Återställningspunkten är `c976c871d783fcfadb298a2e94dfc741d7468a89`
(protokoll 8, [PR #28](https://github.com/capstere/Cartridge-strike2/pull/28)).
Den versionsbundna managern verifierades mot båda paketerade releaserna i
isolerade processer. Driftkonfigurationen sparades i `20261119T133500401188Z`.
Originaltjänsten på 2567, tunneln, adressen och inbjudan behölls.
Följ [driftguiden](deploy/online/README.md) för återställning.

**Nästa steg är Jespers fysiska spelprov på iPhone och dator.** Prova
raketkastarens köp eller utrustningsval, avfyrning och omladdning i båda lägena.
Prova också Friendly fire På och Av med en lagkamrat. Fysisk iPhone och Android
för denna release är **NOT RUN**. Pi:ns mjukvarurendering räckte inte för en
tillförlitlig visuell kontroll. CI använde hårdvaruaccelererad rendering.
[Residenternas driftverifiering och tidigare mätningar](docs/multiplayer/ONLINE_RESIDENTS_REPORT.md).
Rök och flash återstår online.

**Låg prioritet.** Jesper har hittat två lokala kollisionsproblem vid streck
på golvet som ser ut som gamla väggar eller områdesgränser. Möbler ligger
utanför den felrapporten. Exakta positioner återstår.

## Codex i Pi-checkouten

Starta en ny huvudsession med `codex -C /home/jesperfredriksson/Cartridge-strike2`
för att läsa in projektets agentkonfiguration. Huvudagenten kan starta
`performance`, `gameplay` och `reviewer` vid behov. Ge nästa uppdrag till
huvudagenten. Samordningsreglerna finns i [AGENTS.md](AGENTS.md).

En färsk skrivskyddad session i Codex CLI 0.169.0 startade de tre namngivna
rollerna och tog emot rapporter om belastningsproven, serverns matchregler
och begränsningen för fysisk mobilprovning. I provet med `--ephemeral`
gick det att starta rollerna med nya agentkontexter. Agentstart med ärvd
huvudhistorik misslyckades där eftersom sessionshistoriken saknades.

## Historisk internetrelease och tidigare prov

The first private online Team Deathmatch release adds a server-owned waiting
lobby, Ready/Start, countdown, 10-minute/50-kill matches, results and same-room
rematch. See [the online release report](docs/multiplayer/ONLINE_RELEASE_REPORT.md)
and [Swedish status/update/rollback instructions](deploy/online/README.md).
The release payload is `d886a10060b8fbf9b2d3034e8c8d0ad46a8a39d1`, protocol 5,
runtime build `3af2145a3d18bdbd58d53ebeb6f35f3309531892085dfe376b5aaab9098a473c`.
This payload previously served loopback port 2568 and remains the older protocol 5 release. Its seven CI jobs passed in
[44267713626](https://github.com/capstere/Cartridge-strike2/actions/runs/44267713626).
The final server implementation completed a 30-minute ten-SDK-client Pi soak
with 52 match transitions, 30 reconnects and 2,730 measured combat respawns.
Actual public activation, rollback and reactivation passed two-client HTTPS/WSS
gameplay checks. Ten independently authenticated SDK clients joined 5v5 after
the stop/reopen check of public exposure. Services are enabled and owned by
systemd; the MacBook and Codex are not needed for operation. Two separately
authenticated rendered Chromium clients also completed the real public
600-second match, received identical results and fired again in a same-room
rematch. The old PASS 4 release remains available for rollback. See the report
for exact evidence and measurement limits; these browsers were not physical
phone/work-computer players.

**USER-VERIFIED PHYSICAL PLAYTEST — 18 November 2026.** Jesper confirmed that his
physical iPhone using Safari over mobile data and work computer using Chrome
Incognito on a separate network entered the same Floor 5 room. Movement,
shooting, damage, reloading and audible sound worked. This closes the earlier
invitation-flow failure after whitespace-safe handling was activated. It does
not verify physical respawn, background/reconnect, sustained performance or the
new match/results/rematch flow. Android remains **NOT RUN**.

**Domain follow-up, 18 November 2026:** the owner purchased and activated
`capstere.com` and selected **https://cs2.capstere.com** as the permanent address,
replacing the initially prepared `play` hostname before activation. The active
zone and named tunnel were verified through Cloudflare's API. The initial
isolated-origin preflight passed HTTPS/WSS movement, shooting and reload with
two independently authenticated rendered clients. Repeat the public checks on
`cs2.capstere.com` after activation and removal of the temporary connector. Use the
[named-host operations guide](deploy/online/README.md#stabil-adress-namngiven-cloudflare-tunnel)
and the Pi's release receipt for the final activation state. The old Quick Tunnel
is only a rollback option, with its absolute expiry on
**19 November 2026 at 06:27 CET**. Named hosting uses the fixed origin and has no
Quick Tunnel deadline. Keep invitations and connector credentials private.
The original `cartridge-strike2` service on port **2567** must remain available.

PR #23 was reviewed at `1c2041fd2d2ab54b5f83d858bfe6b01f07e74935`, all seven jobs
in run [44255639016](https://github.com/capstere/Cartridge-strike2/actions/runs/44255639016)
passed, and it was merged as `c8aa5b5d15f8d517f0b9a0515eed269b9e68f1d5` without
bypassing checks. The complete release is reviewed in
[PR #24](https://github.com/capstere/Cartridge-strike2/pull/24).

## Historical evidence before the complete online release

Reviewed [PR #22](https://github.com/capstere/Cartridge-strike2/pull/22) at `02f7b8b`. Its [seven CI jobs](https://github.com/capstere/Cartridge-strike2/actions/runs/44209972562) passed and the merge landed at `f7218c2`. The [Pass 4 PR](https://github.com/capstere/Cartridge-strike2/pull/23) adds an invite-only internet service alongside the original Pi service. On the recovered public HTTPS URL, two rendered browsers entered the same room and replicated movement, shots, reload and departure over WSS. A [GitHub-hosted player on a second internet connection](https://github.com/capstere/Cartridge-strike2/actions/runs/44246257389) also joined a Pi player. Both observed remote movement, firing and completed reloads at 25/126 ms measured RTT. The 24-hour pilot expires November 19 at 06:27 CET.

PR #21 was reviewed at `e3d2884`, all six required CI jobs passed, and fresh local
core/server/two-rendered-client launch checks passed. It was merged as **ac87eec**
without bypassing checks. PASS 3B builds on that main with ten human slots (5v5),
bounded authoritative hitscan rewind and a 15-second token-owned reconnection.
Two fully rendered clients plus up to eight SDK peers passed the 2/4/10-player
and 0–250 ms ordered-jitter matrix. A completed 30-minute ten-client SDK soak
passed 20 player replacements, 30 reconnections and 2,658 measured respawns;
retained heap grew 0.55 MiB over the warm comparison and all rooms disposed.
Ten-client simulation p95 was 1.16 ms in the short benchmark and 1.62 ms in the
final soak window; average outgoing payload was 36.30/37.78 KB/s per player.

Before expanding the pilot, resolve or explicitly accept the documented framework
boundary: another interruption during the new-token JOIN handshake loses identity
continuity and requires a fresh authenticated join. Completed reconnects preserve
identity and gameplay state. Strict 16.67 ms scheduling and 60 FPS in every view
were not achieved on the shared development host. The report separates these
limits, hosted browser CI and physical-device work.

Localhost remains the default; LAN needs an explicit private IPv4.
[Swedish Pi update/restart/rollback guide](docs/multiplayer/raspberry-pi-lan-sv.md).
During PASS 3B the running Pi service was not accessed or modified. PASS 4 later
added the isolated port-2568 service and actual Pi measurements. Consult the
current online report above for deployment and physical evidence; the original
port-2567 service remains separate. Browser emulation is not physical testing.

**Physical-device backlog — test mobile controls and audio.** Play on an iPhone and an Android phone in landscape, near 844×390 and 932×430 where available. Record the model, OS, browser, viewport and safe-area clearance. Move, aim and fire together, reload, jump, hold an objective and buy. Rotate, background and resume during the lobby and a match. Listen for the lobby theme stopping on Start and resuming on return. Record any failure with its screen position and steps. [Play the published build](https://capstere.github.io/Cartridge-strike2/)

Floor 5 has neutral Meshy residents in Classic and Endless. The 20-cycle match lifecycle check passed. The feature was merged in [PR #7](https://github.com/capstere/Cartridge-strike2/pull/7) and verified on Pages in [PR #8](https://github.com/capstere/Cartridge-strike2/pull/8). [Living zombies, frame samples and published captures](docs/zombies/gameplay.md)

## Completed — profile the populated Floor 5 Endless spawn

**PASS** on the integrated Floor 5 build. Nine frozen-world camera comparisons matched pixel for pixel. The open elevator saved 352 world draws with the zombie integration present. [Integration results](docs/endless-profile/README.md#november-10-integration-check)

A fixed-camera trace found **1,045 of 2,270 elevator draws came from furniture cells**. Inside two of those cells, four mirrored monitor, keyboard and mouse kits in I04 submitted 88 draws apiece. Each kit fit entirely behind an opaque wall. The change gives dense, rigid mirrored furnishings their own visibility check inside the existing cell. The first-person SMG submitted 19 draws.

| Apple M1 / Metal trace | World draws before → after | First-person draws | Total draws before → after | Triangles before → after |
| --- | ---: | ---: | ---: | ---: |
| Analysts Cargo Lift, 1 s | 2,251 → 1,899 | 19 | 2,270 → 1,918 | 1,061,778 → 1,057,554 |
| C08 firefight, about 24 s | 4,030 → 2,358 | 19 | 4,049 → 2,377 | 932,362 → 912,298 |

To reproduce, serve the repository with `python3 -m http.server 8765` and open `http://127.0.0.1:8765/fps/?test&realtime&seed=42`. Use the default prepared Floor 5, Analysts, Endless Action, Originalkaraktär, Pulse SMG, low graphics, 844×390 and all ten team actors. The untouched spawn eye is `(-20.541, 1.58, -30.03999)` facing `(0, 0, 1)`. The profiler also places an observation camera in C08 at `(20, 1.58, -5.4)` facing `(0.70441, 0, 0.70979)` while the two squads play normally. After installing the locked browser tooling below, run `node tools/endless-floor5-profile.cjs` and `node tools/floor5-workstation-visibility.cjs`.

On the M1, median frame time was 16.7 ms in both views before and after the change. The measurements cover local Chromium with touch emulation. Physical iPhone and Android measurements remain open. [Cold and warm results, pass breakdown and raw samples](docs/endless-profile/README.md)

The November 9 audit verified the earlier launch and replay fixes through gameplay, pause and lobby return on the published site. [Gameplay fixes in PR #3](https://github.com/capstere/Cartridge-strike2/pull/3) · [Verification in PR #4](https://github.com/capstere/Cartridge-strike2/pull/4) · [Audit and screenshots](docs/playtest-audit/README.md)

## November 10 handover checks

| Check | Status |
| --- | --- |
| Both factions and both objective routes | **PASS on Pages.** The browser drove the player slot through a plant and a defuse in North Laboratory. A player escort and a bot escort rescued both hostages. After a combat death, the spectator camera cycled through living teammates in both directions. [Seeds, routes and screenshots](docs/playtest-audit/november-10/README.md#objective-routes-and-spectator-controls) |
| Saved characters | **PASS on Pages.** A fresh Studio export appeared in first and third person on both teams. Cancel, retry, replay and recovery from an incompatible copy passed in an isolated local browser profile. [Character checks and reproduction](docs/playtest-audit/november-10/README.md#device-local-character-studio-pilot) |
| Published rendering | **PASS on Pages.** All nine views matched pixel for pixel. The open Cargo Lift saved 352 world draws. [Rendering PR](https://github.com/capstere/Cartridge-strike2/pull/6) |

## Remaining work

At the November 10 check, physical iPhone and Android controls and audio were **pending** because no handset was available. The dated November 18 online observations at the top of this handover supersede that status only for the explicitly reported iPhone/Chrome combat behavior. Android and the remaining physical checks still need evidence. The historical browser routes cover offline objective outcomes and spectator behavior.

## Verification

Run the core checks from the repository root. If you change runtime files, refresh the affected entries and byte total in `build-info.json` and verify them. The door sweep uses the actual published floor plan.

```sh
node --experimental-loader ./tools/vendor-three-test-loader.mjs --test src/fps/*.test.mjs tools/*.test.mjs
node tools/verify-owner-runtime.mjs
node --experimental-loader ./tools/vendor-three-test-loader.mjs tools/owner-door-traversal.mjs --prepared
```

For browser regression checks, install the locked tooling and matching Chromium once. Start the HTTP server in a separate terminal, then run the relevant smoke tests from the repo root.

```sh
npm ci --prefix frontline/source/tools/dev
node frontline/source/tools/dev/node_modules/playwright-core/cli.js install chromium
node tools/match-flow-browser.mjs
node tools/mobile-smoke.cjs
```

When handing work back, update the first open task, link any measurements or PR, and distinguish published-site play, local browser play, simulation and physical-device observations.

## November 15 — performance pass implementation

See [the 2026-11-15 performance pass](docs/performance-pass.md) for source-verified
rendering changes, tests, the earlier 1,918/2,377 draw-call baseline and explicit
validation limits. Desktop standard pixel ratio is lowered, a gated adaptive
resolution controller samples real active-frame intervals, simulation catch-up
is capped, mirrored opaque furniture can batch with correct face winding, and
non-Floor-5 SSAO is cheaper. **These changes do not yet constitute measured
FPS gains on physical laptops or mobile devices.**

Continue the first open task above and run the after-change
`tools/endless-floor5-profile.cjs` and `tools/floor5-workstation-visibility.cjs`
tests before claiming an improvement. Record before/after frame p95, draws,
triangles, visual differences and device/browser characteristics.

## November 16 — measured rendering and simulation optimization

**PASS in local Chromium / Apple M1 Metal and simulation.** The pass starts at
PR #13's merged main and adds three measured changes: opaque-wall actor draw
culling after posing, spatial-index query reuse, and exact cached bone matrices
for CPU skin sampling. Three matched repetitions reduced active-combat median
CPU work by 20.5% in touch emulation and 14.1% on desktop at identical resolution.
Median display interval remains 16.7 ms; C08 p95 remains about 33 ms.

[Raw measurements, source fingerprints, tests and remaining work](docs/measured-performance/README.md).
Six paired browser traces and 10,800 simulation steps retained identical recorded
state/events. All 192 unit tests, 102 door traversals, 25 pixel comparisons and the
relevant browser/lifecycle checks passed. A floor-interior shortcut was rejected
because isolated measurement did not establish a benefit. The old Danceman and
software-render menu tests now measure the actual simulation/browser clock.

**Next actionable task remains the physical iPhone/Android session at the top.**
GPU execution-time attribution, broader hardware/thermal sampling, shader-variant
cost and whole-map portal culling remain open; no physical-device pass is claimed.

## November 16 — asset loading and memory

Three measured improvements: lossless Danceman gzip loading, shared immutable
operator animation splits, and shared skin palettes within each cloned avatar.
[Measurements, dependency/disposal audit and remaining work](docs/asset-memory/README.md).
Cold recorded model/audio HTTP transfer falls 16.11 → 12.19 MB; active skeletons
102 → 18; track arrays 8.94 → 1.89 MB. Twenty-cycle before/after cleanup is stable;
warmed game/lobby GPU textures fall 230/14 → 163/7. Local readiness timings do
not improve, so no startup-speed gain is claimed. Original GLBs, all clips,
textures and gameplay remain intact. Physical handset testing remains the first
open task; Safari, real network and whole-renderer async teardown stress remain open.


## November 16 — mobile input and CI reliability

Completed emulated reproduction and fixes at 844×390 and 932×430: weapon changes
retain held movement/look pointers, multiple fingers retain a held action until
its last release, and orientation changes pause combat/audio for explicit Resume.
[Before/after samples, CI audit and validation](docs/mobile-ci/README.md).
The CI policy removes the obsolete feature push trigger, cancels stale PR runs,
keeps full pre-merge browser checks, and uses fast integrity/unit/door checks on
main instead of repeating browser suites after merge. No FPS or physical-phone
gain is claimed. The next genuine task remains the physical iPhone/Android
session at the top, with particular attention to three-finger capture, rotations,
safe areas and audio interruptions. Browser emulation does not close that task.


The first focused CI run timed out collecting unasserted pacing samples on its
software renderer (about 2.3 s/frame). The follow-up makes that profiling opt-in
with `MOBILE_PROFILE=1`, preserving all regression assertions and the bounded
step deadline. Main fast CI passed in 1m31s; Pages byte checks and both native
emulated viewport checks passed. Physical-device validation remains open.

## November 17 — multiplayer foundation (pass 1 only)

Implemented from **7e91731**, preserving PRs #14–#17. The shared Game now supports
independent human controllers separately from client-local presentation, preserves
PvP damage, and exposes a single externally clocked fixed step. Capsule movement
is shared with a headless/prediction boundary. Fresh prepared worlds no longer
share nested mutable source data; door, glass, elevator and navigation isolation
is tested. Both manifest maps construct in actual Node without DOM shims.

[Implementation, cache/import audit, framework decision, exact commands and
limitations](docs/multiplayer/README.md). The pinned Colyseus/SDK loopback spike
proves fixed input, acknowledgements, authoritative correction and framework-owned
replay using the existing movement code. It is test-only, bound to localhost.
Eight offline traces (9,600 steps) retain identical recorded state/event hashes.
The existing desktop/touch, match-flow, 20-cycle lifecycle and objective-route
checks pass; physical-device validation remains uncompleted.

**Next multiplayer step:** review this feature PR; authorize pass 2 separately
before implementing `prompts/02_NETWORK_SLICE.txt`. No network game UI, public
server, tunnel, deployment or auto-merge was added. Full online roster/rules,
handshake, life IDs, prediction through dynamic state, combat rewind and reconnect
remain for later passes. **The first open physical-mobile task above is unchanged.**

## November 17 — Foundation merged; local network slice for review

Reviewed Foundation PR #18's implementation, validation, completed review and
both successful CI jobs, then merged the expected head as **20289c50**. No failed
check was bypassed. The new `feat/multiplayer-network-slice` branch starts there
and implements only `prompts/02_NETWORK_SLICE.txt`.

Two human clients can create/join the same private local room in the existing FPS
presentation. Colyseus clocks the shared authoritative Game at 60 Hz with 20 Hz
patches; its SDK owns movement prediction, reconciliation and remote interpolation.
Pulse SMG combat, ammunition, reload, score, death and respawn use existing rules.
The slice uses synthetic-demo with fixed doors/glass and bundled default models;
unsupported online systems are disabled without changing offline Classic/Endless.

[Run commands, actual test results, screenshots, validation limits and remaining
work](docs/multiplayer/network-slice.md). The report distinguishes two-browser
loopback/latency tests from physical devices and internet play, and records
initial validation failures as well as final results. The unchanged offline
state/event traces still match over 9,600 steps.

**Next multiplayer task: review [Pass 2 PR #19](https://github.com/capstere/Cartridge-strike2/pull/19)
and its CI. Do not auto-merge it.** The final local results are 213 core tests,
seven server/protocol tests, full two-browser loopback/100 ms jitter gameplay,
24 join/leave cycles and a normal-launch smoke without test hooks. Follow-up
fixes explicitly remove SDK signal callbacks and prevent late shot confirmations
from duplicating effects after stalls, pause or death. Software-renderer coverage
passes; visible native-window mouse capture on this Mac remains unverified.
The report records initial CI failures, a measured whole-job timeout and the
required final-head checks. Repeated join tests now batch the application call
to avoid retyping identical form fields; all 24 rendered cleanup cycles remain.
Pass 3, dynamic Floor 5 networking, bounded combat rewind, reconnect grace and
public deployment require separate authorization. No public server/tunnel was
started. **The first open physical iPhone/Android task at the top is unchanged.**

## November 17 — Pass 2 merged; real Floor 5 multiplayer for review

Reviewed PR #19 at `014b316e`, its implementation, validation, review threads
and successful required CI. A fresh unchanged 20-cycle lifecycle run and normal
two-browser launch passed. The headed Mac pointer-lock error also reproduced on
a plain canvas without game code; physical-window capture remains unverified.
Merged the expected head as **ad6742ce**, then created `feat/multiplayer-floor5`
from that main. No failed check was bypassed.

Pass 3A.1 uses the exact published prepared Floor 5 on both client and authority,
including the original furniture, materials, collision and FPS presentation.
All 51 hinged doors and both existing spawn-cabin shutters are server owned,
replicated on late join and simulated with the same controller during prediction.
Generated map, resolved collision, configuration, protocol and build hashes gate
admission. Online glass stays intact and solid. The two-human cap and existing
Pulse SMG combat, scoring, respawn and SDK prediction/interpolation remain.
Measured online-only loading of three unused resident models was removed
(7,982,418 compressed bytes per fresh client); offline residents and all assets
remain intact. The network browser test rejects those unnecessary requests.

[Implementation, reproducible tests, measurements and limitations](docs/multiplayer/pass3a-floor5.md).
Offline Classic/Endless state and event traces still match over 9,600 steps;
the existing mobile, objective-route, visibility, shared-animation, compatible
character and 20-cycle lifecycle regressions pass. No original level or asset
was changed. Physical handset testing is still uncompleted.

A later admission-error probe caught an empty-lobby render crash after leaving a
network round. The reset now synchronizes its round/phase markers. Every network
cleanup cycle must actually render in the lobby and again after rejoining; the
normal-launch test also checks for a fatal error after returning. The report
records the original coverage gap and before/after recovery evidence. The empty
network lobby retains its unchanged pixels, invalidating on new lobby, viewport,
quality or WebGL restoration. Native pixel/resize/context-recovery
checks pass; ordinary offline and paused-game cadence stays unchanged.

The first Linux run passed the server and all offline checks but reproduced a
second-scene software GPU startup timeout. The browser harness now uses separate
GPU processes. A documented reduced-resolution software functional profile
passes both complete network scenarios and 24 actually rendered cleanup cycles
locally (237.2 / 199.4 seconds); native performance
is measured separately at full resolution and normal forward view. Required
Linux checks must pass on the final PR head. A later Linux stop-submission
timeout led to matching real controls more closely: the route driver retains
look direction when movement stops. Runtime code and measured native/software
records remain from `ad57289`; these follow-ups change the harness only.
Stop confirmation has a separate five-second bound so a completed long corridor
traversal cannot spend its remaining movement budget awaiting a fresh snapshot.
The movement limit and arrival/collision assertions remain unchanged.

**Next genuine task: review [Pass 3A.1 PR #20](https://github.com/capstere/Cartridge-strike2/pull/20) and its final required CI.
Do not automatically merge it.** Full online 5v5/objectives, bounded hitscan
rewind, reconnect grace, LAN/internet hosting, capacity soak and Raspberry Pi
deployment remain outside this delivery and need their own authorization.
No public multiplayer server or Pass 3A.1 Pages release was deployed.
The first open physical iPhone/Android task above remains open.


## November 17 — PASS 3A.2 trusted LAN

See [the LAN implementation and validation](docs/multiplayer/pass3a2-lan.md).
The authoritative two-human Floor 5 slice now has explicit private-address
hosting, exact HTTP/WS origins, admission budgets and bounded payloads; the
same-origin form handles connection failures. Shared asset/map hash checks work
on ordinary LAN HTTP. Gesture-based Resume, Safari audio interruption recovery,
connection-loss cleanup and server-restart/rejoin regressions are included.
Offline deterministic traces retain all eight hashes across 9,600 steps.
No PASS 3B/4, public hosting, physical-phone/Pi acceptance or automatic merge
is included. The new PR and all required final-head checks must be reviewed
before following the Pi guide. Preserve the physical-mobile backlog above.
