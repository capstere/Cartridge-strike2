# Character Design Studio 6.1 — roller och spelexport

## Gör så här

Välj **Roll i spelet**: Spelkaraktär / lagbot, Gisslan eller Bot-dvärg.
Välj därefter **Ersätt i spelet**. Rollbyte sparar först den tidigare designen i
ateljén; det är en ny design, inte en förstörande omriggning. Grundutseende 1–5
för dvärgen skapar likaså en ny sparbar design. Äldre JSON-projekt behålls.

Ändra färger, kläder, ansikte, hår, skulptering och benfästa 3D-delar med studions
verktyg. Spelare och gisslan kan använda manlig eller kvinnlig grundrigg.
Dvärgen använder den befintliga vuxna fantasifigurens former och proportioner,
inte en nedskalad Quaternius-person. Skannat människohuvud kan inte väljas på dvärgen.

**Exportera för spelet (.zip)** skapar:
- `CHARACTER.glb`: den synliga, riggade modellen med inbäddade texturer/rörelser.
- `CHARACTER.json`: roll, målplats, axlar, källidentitet och SHA-256.
- `PROJECT.json`: redigerbart original, inklusive lokalt inbäddade tillbehör.
- `BASE_RIG.glb`, `COMPATIBILITY.json`, `README.txt`.

Spelaren/gisslan behåller källriggens 13 klipp. Den tidigare procedurbyggda dvärgen
har nu en redigerbar 18-bensrigg med tre egna klipp: stå, gå och falla. Dessa
kontrolleras genom faktisk GLB-återimport, hierarki/vikter och provtagning av poser.
Rörelselogik, vapen, hälsa, kollisionskapslar och mål ändras inte.

## Hur många designer?

| Omfattning | Spelare/lagbotar | Gisslan | Dvärgar | Summa |
| --- | ---: | ---: | ---: | ---: |
| En design per lag/roll (utseenden återanvänds) | 2 | 1 | 1 | 4 |
| Alla tio lagplatser, två gisslan och fem dvärgutseenden | 10 | 2 | 5 | 17 |
| Individuell design även för varje möjlig dvärg | 10 | 2 | 14 | 26 |

De tio lagplatserna är **inklusive din spelare**. Dvärgarna kan vara upp till 14,
beroende på tillgängliga rum och spelläget/inställningen. Spelets fem grundutseenden
återanvänds via `variant % 5`. Målplatsen kan vara en hel grupp, ett dvärgutseende
eller en viss individ. Individval går före variantval, som går före gruppval.
Gisslan är uppdragsfigurer i klassiskt läge; deras avsaknad i Endless ändras inte.
Lagfärg är din design, inte en dold övermålning av den färdiga exporten.

## Skor

De gamla påbyggda kängorna (lådor, skaft och fristående snören) och den synliga
ursprungliga skoytan har ersatts i standardkaraktärer och studion. Nya låga skor
har en sammanhängande form och tunn sula. Original-GLB-filerna är oförändrade.
Namn `boot-sole-l/r` behålls bara som kompatibla stödankare för markkontakten.
Gamla redan exporterade privata GLB-kopior ändras inte i efterhand; öppna deras
projekt och exportera på nytt för de nya skorna.

## Installera ett paket utan ny specialkod

Kör från repots rot med Node 22:

```sh
node --experimental-loader ./tools/vendor-three-test-loader.mjs tools/install-character-package.mjs min-design-spel.zip --check
node --experimental-loader ./tools/vendor-three-test-loader.mjs tools/install-character-package.mjs min-design-spel.zip --apply
node tools/verify-owner-runtime.mjs
```

Standardläget är enbart kontroll. `--apply` skriver modellens hashnamngivna fil,
uppdaterar `assets/fps/character-overrides.json` för just målplatsen och uppdaterar
runtime-manifestet. Gamla modellfiler raderas inte. `PROJECT.json`, referenser och
källpaket kopieras inte till det publika repot. Ingen automatisk git-push eller
publicering görs av verktyget. Efter ägarens publicering laddar motorn registret
via samma rolladapter. Saknad/skadad/inkompatibel modell ger ett tydligt startfel,
inte ett tyst byte till fel figur. Skor och utrustning läggs inte dubbelt ovanpå
den exporterade figuren.

## Gränser som fortfarande gäller

Detta är inte generell import av valfri GLB eller en ny spelmotor. Direktvägen
bevarar källben, originalrörelser och normala vikt-/filgränser. Alltför stor eller
strukturellt felaktig export stoppas med en förklaring och designoriginalet finns
kvar. Extra rörelseönskemål i UI är fortfarande önskemål, inte nya animationer.
Dynamisk tygsimulering är fortfarande en studioprototyp: välj Tygplagg **Inget**
för direkt spelexport eller behåll den i Blender-paketet för separat bearbetning.

Förstapersonen återanvänder spelets hand-/armgeometri, med handskar och lång/kort
ärmfärg från spelarens export. Det är inte en automatisk kopia av en fritt
skulpterad handform eller tredjepersonshuvudet. Ansikts-/klädreglage och tillbehör
kan fortfarande behöva konstnärlig justering. Maskinell exportvalidering bevisar
inte att varje möjlig kombination är snygg, klippfri eller har viss bildfrekvens.

Tester: `actor-roles.test.mjs` och `tools/character-roles-browser.mjs`. Browserprovet
använder syntetiska designer, riktig UI-export och reimport samt samma FPS-renderare
för spelare/gisslan och ActionVisuals för fem dvärgvarianter. Isolerad bildgranskning
är inte ett prestandatest av en hel privat Floor 5 eller fysisk mobil.
