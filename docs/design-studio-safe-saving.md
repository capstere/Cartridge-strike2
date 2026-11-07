# Designstudio 5.7.2 – spara arbetet även när banan inte är spelklar

Sparning och spelgodkännande är två olika saker. Vanlig SPARA ZIP kräver inte ett grönt motorprov. TESTA OM BANAN ÄR SPELKLAR kör fortfarande de vanliga kontrollerna före spel.

## Användning

- **SPARA ZIP** sparar ett vanligt importerbart projekt när filstrukturen och modellfilerna är giltiga, även om banan saknar spelpunkter eller har byggfel.
- Vid formatfel eller saknad modell skapas automatiskt **SAKERHETSKOPIA.zip**. Den innehåller hela projektets ursprungliga JSON och alla tillgängliga lokala modeller. `RECOVERY.json` redovisar orsaken och eventuella saknade filer. Inga objekt raderas eller flyttas av sparfunktionen.
- **SÄKERHETSKOPIA · ÄVEN VID FEL** väljer samma råbackup direkt.
- **SPARA JSON-UTKAST** kräver inte godkänd bana. JSON innehåller inga separata GLB-bilder/modellfiler.
- Öppna JSON, JSON.TXT eller ZIP. En recovery-ZIP kan återimporteras direkt när dess projekt är strukturellt giltigt och alla modellfiler finns. Verkligt felaktiga data behöver repareras innan redigering/spel; originaldata behålls.

## Skydd vid omladdning och autosparning

Ett avvisat autosparat utkast ersätts inte med en tom standardbana. En dialog låter användaren hämta originalutkastet eller öppna en reparerad fil. Föregående lokala version sparas under en separat nyckel. Samtidiga flikar får inte tyst skriva över varandras ändringar. Full/blockerad lokal lagring visas som fel, inte som lyckad sparning. En lokal import säkerhetskopierar tidigare utkast innan byte.

Lokal lagring är inte en extern säkerhetskopia. Webbläsaren kan fortfarande rensas eller krascha. Kontrollera att ZIP/JSON faktiskt har hämtats och behåll originalmodeller vid rapport om saknade tillgångar.

## Gränser och säkerhet

Den tidigare summagränsen på 350 möbelposter var för låg och räknade även borttagna basmöbler. Strikt projektimport tillåter nu 2 000 poster. Detta är inte en prestandagaranti. Över denna gräns kan råutkast fortfarande säkerhetskopieras, med en JSON-budget på 16 MiB och det befintliga ZIP-skyddet på 96 MiB och 260 filer. Inga ID-, hash-, geometri-, ZIP-sökvägs- eller spelkontroller har tagits bort.

Normal export återställer inaktuell spelbarhetsmetadata och säger uttryckligen att motorn inte testats vid sparningen. Ett utkast får aldrig användas som bevis på godkänd spelbarhet. Ett återställt felaktigt projekt blir inte tillåtet i FPS förrän det klarar de vanliga kontrollerna.

## Tester

`furniture-editor/build/draft-save.test.mjs` och `tools/draft-save-browser.mjs` täcker över 350 poster, för stor mängd, oförändrad råexport vid formatfel, modeller/kontrollsummor, saknade tillgångar, kvotfel, flera flikar, skyddad omladdning och återimport. Webbläsartesterna använder en syntetisk scen; användarens privata ritningar och räddningsfil publiceras inte.
