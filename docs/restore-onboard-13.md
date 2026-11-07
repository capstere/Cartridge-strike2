# Återställ 13 kompletta GLB-modeller från privata onboard

**Syfte:** Lägg tillbaka originalmodellerna, inte trunkerade kopior eller förenklade ersättare. Alla 13 ligger i det privata `capstere/onboard` vid commit `fef84ac9686014ea960346ed60eea17756f81c0e`. Den förberedda källkatalogen ligger i `tools/onboard-large-source-catalog.json`; varje fil har redan bestämd storlek, SHA-256, sökväg och modell-ID. Totalt: **33 492 844 byte (31,94 MiB)**.

Problemet var överföring via GitHub-anslutningen som kapade stora binärfiler till ~786 kB. GitHub har inga problem med originalens filstorlekar. **Använd vanlig Git**, inte GitHub-anslutningens text-/base64-innehållsöverföring, Git LFS, en offentlig kopia av källrepon eller osäkra raw-URL:er.

## En körning i en arbetsmiljö med GitHub-inloggning

Kör i ChatGPT Work med en dator som har behörighet att hämta **båda** repona. Alternativt går samma steg lokalt eller i en Codespace. Om Git-kloning av privata `onboard` inte är tillgänglig kan du hämta ett fullständigt ZIP-arkiv av privata repot i en inloggad GitHub-webbläsare och packa upp det; SHA-256-verifieringen garanterar att filerna är exakt rätt.

1. Klona `capstere/cartridge-strike` och privata `capstere/onboard` sida vid sida med `gh repo clone`/`git clone`, eller packa upp privat `onboard`-arkiv i mappen `../onboard`. Basera återställningsgrenen på senaste `main`. Källan kan vara Git-checkout eller uppackad katalog, men måste innehålla de fullständiga filerna.
2. Från mappen `cartridge-strike`, kör:

```bash
node tools/restore-onboard-large.mjs --plan
node tools/restore-onboard-large.mjs --restore --source ../onboard
```

Skriptet läser **originalbinärer** via `git show` från det fixerade källcommit:et, validerar full storlek och SHA-256 samt glTF 2.0, och vägrar skriva om något avviker. Det återställer originalposterna i katalogen och anpassar testerna till 28 onboard-modeller / 154 totalt. Skriptet skriver inte i källrepon.

3. Installera befintlig låst Playwright/Chromium-miljö och starta HTTP-server i `cartridge-strike`:

```bash
npm ci --prefix frontline/source/tools/dev --ignore-scripts --no-audit --no-fund
node frontline/source/tools/dev/node_modules/playwright-core/cli.js install chromium
python3 -m http.server 8765 --bind 127.0.0.1 &
GENERATE_THUMBS=1 node tools/onboard-library-smoke.mjs
node tools/restore-onboard-large.mjs --finalize
node tools/verify-owner-runtime.mjs
```

På Linux-CI utan skärm används `xvfb-run -a` för webbläsarprovet, precis som i `.github/workflows/level-project.yml`. `--finalize` körs **efter** förhandsbilderna har genererats och räknar om `build-info.json` med fullständiga SHA-256 och bytes för modellerna och PNG-bilderna.

4. Kör repositoryts befintliga enhetstester och Chromium/WebGL-suite (inklusive `tools/level-browser-smoke.mjs`, `tools/direct-browser-smoke.mjs`, `furniture-editor/editor-browser.mjs` och `tools/onboard-library-smoke.mjs`). Pusha till en separat gren, skapa PR och merga först när alla kontroller är gröna. Inga Actions-artifakter behöver laddas upp.

## Säkerhets- och kvalitetsgrindar

- 13 av 13 nya filer ska ha **exakt** verifierad längd och SHA-256; totalt 28 onboard och 154 katalogobjekt.
- Inga externa glTF-resurs-URL:er eller okända dekodrar. Modeller laddas först när de placeras.
- 13 nya faktiska WebGL-förhandsbilder ska finnas, och projekt ska gå att spara/exportera/återöppna.
- FPS-kollision, dörrpassager, spelbalans och befintliga banor får inte ändras.
- Innan publicering i ett öppet repository måste återdistributionsrätten till varje 3D-modell verifieras. Särskilt kändis-/filmfigurer och tredjepartspaket kräver licenskontroll; filinnehav är inte automatiskt publiceringstillstånd.

Se även [Issue #54](https://github.com/capstere/cartridge-strike/issues/54) för komplett lista över de 13 källfilerna och deras SHA-256.

## Verifierad ZIP-återställning 2026-10-30

`Filer.zip` innehåller samtliga 13 rätta original: 33 492 844 byte, exakt matchning mot den fixerade källkatalogens SHA-256. ZIP-filerna har mappats till respektive `asset-portfolio/custom/optimized/` eller `incoming/` utan omkonvertering.

Kandidatens katalog innehåller 28 onboard-modeller och 154 objekt totalt. De 13 nya förhandsbilderna är renderade genom den riktiga GLTFLoader/WebGL-kedjan. Manifestet har 284 poster; befintliga spel- och banfiler är oförändrade.

Källmodellerna i ZIP-arkivets `incoming/` innehåller CC BY 4.0-attribuering för 12 av de 13 återställda modellerna; se [modellattribuering](onboard-model-attribution.md). `MS Exel.glb` är en Excel-logotyp utan inbäddad källa eller licens. Återdistributionsrätten för den posten behöver klarläggas innan publicering enligt kvalitetsgrinden ovan. Filerna har därför endast återställts lokalt, inte publicerats på PR-grenen.
