# Förstapersonens armar och grepp

AR47:s stödhand går från förstocken till magasinets sida medan höger handled stannar vid greppet. På shotgun följer vänster hand det räfflade träet bakåt och framåt efter skottet. Under omladdningen tar tummen och pekfingret patronen medan de övriga fingrarna böjs in. Förebilderna visar en rak ärm som följer med hela handen, glapp mellan höger manschett och handske och en pump som rör sig under ett stillastående grepp. På CR4 bildade vänsterarmen en stor båge tvärs framför siktet under omladdningens sista moment. [Matchade detaljbilder](grepp.jpg)

## Film och spelvy

Varje film visar tretton föremål från vapenbyte till vila, rörelse och inspektion. Alla åtta skjutvapen avfyras med en patron kvar och visas genom hela tomomladdningen. Kniven svingas och de tre kastföremålen kastas. Före visas till vänster och efter till höger. Båda utsnitten har samma förstoring, kamera och ljus. HUD-bilderna visar hela spelytan. [Datorfilm](desktop.mp4) · [Film med emulerad touch](touch.mp4) · [Hela spelytan i tre format](spelvy.jpg) · [Övriga grepp i detalj](ovriga-grepp.jpg)

| Start i filmerna | Föremål | Start i filmerna | Föremål |
| --- | --- | --- | --- |
| 0:00 | AR47 | 0:40 | Sniper |
| 0:07 | Shotgun | 0:48 | Rocket Launcher |
| 0:14 | P9 | 0:55 | Kniv |
| 0:21 | P12 | 1:00 | HE |
| 0:27 | CR4 | 1:05 | Flash |
| 0:34 | SMG | 1:09 / 1:14 | Rök / uppdragsbomb |

Vid P9:s tomomladdning passerar stödhanden över manteln. Handleden håller ihop även där, men underarmen skymmer fortfarande en del av pistolen i ett kort skede. På shotgun syns patronen kort under lådan när handen lämnar eller återtar pumpen. Under de fyra matningsrörelserna sitter den i klämgreppet. Stock och låda skymmer delar av greppet på de längre vapnen ur den ordinarie kameravinkeln.

## Karaktärens material

Två kompatibla testexporter från spelets operatörsrigg användes på samma plats. Den kortärmade spelkopian sparades i IndexedDB och valdes genom spelets ordinarie karaktärsladdare. Ett långärmat paket laddades via det validerade registret för Analysts spelare. Provet jämförde handskarnas färg, hudens färg och tyget vid det reserverade atlasprovet med den inlästa figurens material och kontrollerade materialen på båda händerna och ärmarna i spelscenen. För Counter Analysts matchade den renderade ärmen lagaktörens jacka i färg #9b967c och handsken aktörens material i #3c4042. [Karaktärsbilder](karaktarer.jpg) · [Uppmätta materialvärden](measurements.json)

## Mätning i spelet

Baslinjen är `3afcf30`. Kandidatens spelbygge är `81a46070f94ce2030a3f61d7bc589b1e1ceab896463b0c9391c9cdfca91565be`. De tio ändrade runtimefilerna som renderades har kontrollsumman `964a41278661b12f4f8bfae364b32256a6e428b862a68a96f02da4f47bcd2552`. Raspberry Pi 5 körde Chromium 156.0.8078.79 med ANGLE, Broadcom V3D 7.1.10.2 och OpenGL ES 3.1. Båda revisionerna använde Floor 5, C08, seed 42, Endless och grafikläget Low. Startögat var vid (20, 1,58, −5,4), med yaw −2,36 och pitch 0. Provet använde spelets vanliga simulering, rekyl, utrustningsval, inspektionsvy och de två renderingspassen för spelvärlden och förstapersonsvyn. Övriga lagaktörer hölls stilla och ljudvolymen var noll under bildinsamlingen. Filmens 20 rutor per spelsekund består av tre simuleringssteg per ruta. Detta anger uppspelningshastigheten. [Filernas SHA-256](runtime.sha256)

- Datorns vy var 1280 × 720 med en renderingsbuffert på 1088 × 612. Liggande Chromium med touch emulerades vid 844 × 390 respektive 932 × 430, med buffertar på 658 × 304 respektive 726 × 335. Spelets startvärde för pixelkvoten låstes i provet för att få jämförbara bilder även under avläsning.
- Dator och 844-vyn har vardera 1 574 matchade rutor per revision. Simuleringstid, kameraposition, förflyttning, kvarvarande omladdningstid och ammunition jämförs ruta för ruta. Ett fritt bakgrundsutsnitt kontrollerades pixel för pixel i 65 bilder per format. I 932-vyn samplades AR47, shotgun, P9 och CR4 i tretton nyckelrutor var. Samtliga mobilprov är webbläsaremulering på Pi:n. Fysisk iPhone och Android återstår.
- Shotgun i full fart kontrollerades också under inspektion vid 4,20 m/s och en sväng på −3 rad/s. Efter 0,367 sekunder var den översta punkten på ärmens öppna axelände vid y = 740,09 i den 720 pixlar höga vyn. Hela änden låg under bilden.
- Draw calls och trianglar är differensen i Three.js faktiska räknare före och efter vapenpassets dragning. CPU-provet mäter den publika modellanimationen genom en tomomladdning, med tre uppvärmningsblock och nio mätblock om 120 poser. Medelvärden per block och alla vapnens inlämnade geometrier finns i mätfilen. GPU-tid och bildfrekvens på spelarnas enheter ingick inte. [Mätdata](measurements.json)

| Vapen | Draw calls i vila, före → efter | Trianglar i vila, före → efter | CPU per omladdningspose, median i ms |
| --- | ---: | ---: | ---: |
| AR47 | 21 → 16 | 6 918 → 9 234 | 0,013 → 0,365 |
| Shotgun | 20 → 15 | 6 542 → 8 858 | 0,013 → 0,362 |
| P9 | 17 → 17 | 46 220 → 35 696 | 0,252 → 0,380 |
| CR4 | 17 → 17 | 40 808 → 30 284 | 0,252 → 0,365 |

För AR47 och shotgun kostar den rörliga armformen därmed runt 0,35 ms mer CPU per omladdningspose i detta Pi-prov. Båda vapnen skickar fem färre ritanrop och 2 316 fler trianglar i vila.

## Upprepa

Servera de två revisionerna på olika lokala portar. Installera repots låsta Playwright-verktyg och kör insamlingen mot var och en. På Pi:n användes systemets Chromium med `CHROMIUM_PATH=/usr/bin/chromium ARM_ANGLE=gl-egl ARM_WAYLAND=1` och användarens Wayland-session. Följande exempel skriver råbilder och mätserier utanför repot. [Insamlingsverktyg](../../tools/view-arms-capture.cjs) · [Bild- och filmverktyg](../../tools/view-arms-compare.py)

```sh
ARM_STRESS=1 FPS_TEST_ORIGIN=http://127.0.0.1:8883 ARM_OUTPUT=/tmp/grepp/before node tools/view-arms-capture.cjs
ARM_STRESS=1 FPS_TEST_ORIGIN=http://127.0.0.1:8884 ARM_OUTPUT=/tmp/grepp/after node tools/view-arms-capture.cjs
```

Kör även följande mot respektive revision med samma `FPS_TEST_ORIGIN` och `ARM_OUTPUT` exporterade. Ange sökvägen till varje kompatibel export. Den kortärmade prov-GLB:n genererades med repots exportverktyg. Långärmsvarianten använder samma rigg, animationer, handskar och jackmaterial med jackans färgattribut för bara underarmar borttaget. [Generator för den kortärmade testexporten](../../tools/export-private-character-fixture.mjs)

```sh
ARM_PREVIEW=1 ARM_FORMATS=wide ARM_WEAPONS=ar47,shotgun,p9,cr4 ARM_TIMING=1 node tools/view-arms-capture.cjs
ARM_PREVIEW=1 ARM_FORMATS=desktop ARM_WEAPONS=ar47,shotgun ARM_SLEEVES=short ARM_GLB=/tmp/kortarm.glb node tools/view-arms-capture.cjs
ARM_PREVIEW=1 ARM_FORMATS=desktop ARM_WEAPONS=ar47,shotgun ARM_SLEEVES=long ARM_GLB=/tmp/langarm.glb node tools/view-arms-capture.cjs
ARM_PREVIEW=1 ARM_FORMATS=desktop ARM_WEAPONS=ar47 ARM_TEAM=counterAnalysts node tools/view-arms-capture.cjs
python3 tools/view-arms-compare.py /tmp/grepp docs/view-arms --films
```
