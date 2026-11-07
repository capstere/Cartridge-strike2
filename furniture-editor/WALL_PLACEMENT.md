# Väggmontering och direkt möblering

Samma förbättringar används i **NY BANA** (`new.html`) och **FLOOR 5** (`new.html?mode=edit-floor5`). Inga nya editorer eller modeller publiceras. Floor 5 redigeras som en lokal projektkopia; originalgolv och spelregler bevaras.

## Så använder du det

1. Ladda om studion med **Cmd+Shift+R** på Mac eller **Ctrl+F5** på Windows.
2. Välj **Möblera → TV med väggfäste**. Vänta tills modellen är klar.
3. Välj **Bygg i 3D** och peka på väggens rumssida. Den riktiga, genomskinliga modellen och den gröna fästytan visar placeringen före klicket. I planvyn visas modellens fotavtryck.
4. Klicka. **Esc** avslutar placeringsverktyget. Dra den markerade TV:n längs väggen; i 3D kan du också dra den uppåt/nedåt. Fästet behålls.
5. **Byt väggsida** flyttar hela föremålet till andra sidan. **Höj/Sänk** flyttar det 0,1 modellenheter. **Kopiera**, **Ångra** och **Gör om** behåller fästet.
6. För en egen GLB som visar baksidan: **Vänd modellens framsida** bläddrar mellan fyra lokala horisontella riktningar. Välj den som visar framsidan utåt. Detta är kalibrering på projektkopian, inte ändring av GLB-filen. Måtten kan begränsa vilka riktningar som ryms.
7. **Finjustera mått och placering** visar de numeriska inställningarna. **Placera objektet → Fritt på golvet** väljer bort vägg-/bordssnapping; **Smart** väljer automatiskt. Separat kryssruta styr hjälp att hitta en ledig golvplats.
8. **Gå runt i banan** använder FPS-spelets renderare och kollision. **Spara till Codex · ZIP** sparar även lokalt importerade GLB-filer. Ingenting publiceras automatiskt.

**Vrid ↻ / R** vrider föremål under fri placering. Väggföremål riktas efter fästet. Höger-/mittknapp, mellanslag eller Ctrl/Cmd/Shift + drag panorerar kameran; Alt + drag roterar 3D-kameran. Dessa drag flyttar inte möbler. **Visa allt** ramar nu in byggda golv, i stället för den tomma grundytan. Pekknapparna, höjdknapparna och katalogvalen finns även i den smala layouten. Fysisk mobil/styrplatta är inte verifierad i denna leverans.

## Vad orsakade TV-felet?

Tre oberoende problem fanns:

- **Orientering:** monteringen antog lokal −Z som framsida. Den verkliga TV:n och Kenneys badrumsspegel har framsidan i +Z, vilket har kontrollerats med renderade fram-/baksidor. Det är katalogmetadata (`wallFacing`), inte en specialgren på TV:ns filnamn. Andra GLB-filer kan kalibreras i samma kod.
- **Väggsida:** 3D-träffen avrundades till ett 0,1-rutnät och träffnormalen kastades bort. På tunna väggar kunde träffen därför hamna på mittlinjen, där A/B-ordningen avgjorde sidan. Nu används den exakta träffen och ytans normal. Planvyn använder golvets insida för ett mittlinjeklick; vid golv på båda sidor väljer man sida med muspositionen eller Byt väggsida.
- **Avstånd/utrymme:** nominala katalogmått användes som om de alltid var den renderade modellens mått. Nu mäts GLB-bounds, skalan beräknas som i renderaren och baksidan placeras 0,012 modellenheter från den fysiska väggytan. Centrerad/bottenjusterad normalisering bevarar modellens egna rottransformer. TV-originalets bounds är X ±1,532732, Y −0,002391…1,786406, Z −0,237308…0,013114; pivoten är alltså inte mitt i djupet.

Dörrar och fönster delar upp den användbara väggbredden. För breda/höga föremål får ett konkret felmeddelande. Ett uttryckligt vägg-/bordsval faller aldrig tyst tillbaka till golvet. Saknade eller för små väggar lämnar befintliga objekt kvar, utan att förstöra deras data; välj en annan fästyta om du tar bort väggen.

En separat regression hittades vid stora rumsdrag: varierande statustext ändrade canvasens höjd mellan tryck och släpp. Statusraden har nu fast höjd. Kontrollen att ett 94 × 94-rum verkligen blir 94 × 94 finns kvar och kompletteras med oförändrade canvasmått under dragningen.

## Format och verifiering

Projektformatet är fortfarande schema 2. `wallFacing`, `modelSize` och `wallMount.frame` är valfria, validerade tillägg. Nya fästen använder en kanonisk ändpunktsordning (`frame: 1`); gamla fästen utan fältet läses med sin tidigare koordinatkonvention. Gamla JSON/ZIP- och schema 1-migrationstester behålls. GLB-binarierna, texturerna och ursprungsmodellerna ändras inte. Ny import av privata tillgångar ingår inte i publiceringen.

`tools/wall-placement-browser.mjs` kör verkliga Chromium/WebGL-flöden: rum med standarddörr; TV på fyra väggar; utpekad 3D-yta; förhandsvisning kontra slutlig transform; uppmätt väggavstånd; sidbyte, höjd, kopiering, Ångra/Gör om och dragning; bord/stol; spegel/tavla; ZIP/omladdning; importerad syntetisk vägglampa med annan framsida och förskjuten pivot; Floor 5 och FPS-promenadrendering. Katalogen innehåller ingen verifierad vägglamps-GLB, så lampfallet använder en uttryckligen syntetisk fixture. Originalbytes jämförs för den importerade GLB:n. TV:ns publicerade SHA-256 verifieras av katalogtestet.

Bilder och resultat skrivs till `test-results/wall-placement/` och kan granskas lokalt. Före-bilderna togs på `039adc89cb0b96b602bd058ce38396bd189e4e87`. Testernas FPS-kamera är en kontrollerad granskningsvy; det är inte en mätning av manuell spelkänsla eller mobilprestanda. Den befintliga CI-kedjan för editorer, banor och dörrpassager körs också, utan nya Actions-artefakter.

## Avgränsning

Modeller ska vara upprätta med Y uppåt. Fri tredimensionell axelkalibrering, geometrisk spegling, nya material-/riggverktyg och automatiskt identifierad framsida ingår inte. Väggmontering gäller hela solida väggytor, inte glas eller en speciell del av ett fönster. Möbler kan fortfarande avsiktligt överlappa varandra; verktyget garanterar väggfästet och väggutrymmet, inte en kollisionsfri möblering. Befintliga rumshandtag, gemensamma väggar, dörrverktyg och lågväggsläge återanvänds. Karaktärsstudion, PR #69:s spelkaraktärsflöde och FPS-spelmekaniken är oförändrade.
