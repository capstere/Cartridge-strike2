# Cartridge Strike

> **Cartridge-Strike 2 — Lovable RC1, separat provspelsversion.** Originalspelet i `capstere/cartridge-strike` påverkas inte.
>
> **[PROVSPELA CARTRIDGE-STRIKE 2](https://capstere.github.io/Cartridge-strike2/)** · [FPS-lobby direkt](https://capstere.github.io/Cartridge-strike2/fps/) · [Karaktärsstudio](https://capstere.github.io/Cartridge-strike2/character-design/) · [Möbelstudio](https://capstere.github.io/Cartridge-strike2/furniture-editor/new.html)
>
> För att publicera denna nya repo: välj **Settings → Pages → Deploy from a branch → main → /(root) → Save**. Om Pages redan är aktiverat behövs ingen ändring. GitHub Pages-länken fungerar först när publiceringen är klar.

## Designa utan att kunna 3D

**[Öppna Studio](https://capstere.github.io/Cartridge-strike2/studio/)** för att välja mellan karaktärsdesign och banbygge. Karaktärsstudion har snabba uppgifter och ett frivilligt fokusläge. Banbyggaren har en större arbetsyta och verktygspaneler som öppnas på mobil, utan att de underliggande spelfilerna eller exportformaten ändras.

Projekten sparas lokalt i webbläsaren. **Ladda alltid ner AI-paket/ZIP** för säkerhetskopia och överlämning till FPS-utvecklingen. Designen publiceras inte automatiskt i spelet.

[Spela Floor 5](https://capstere.github.io/Cartridge-strike2/fps/) · [Designa en FPS-karaktär](https://capstere.github.io/Cartridge-strike2/character-design/) · [Bygg en ny bana](https://capstere.github.io/Cartridge-strike2/furniture-editor/new.html) · [Redigera Floor 5](https://capstere.github.io/Cartridge-strike2/furniture-editor/new.html?mode=edit-floor5) · [Spela syntetisk demobana](https://capstere.github.io/Cartridge-strike2/fps/?level=synthetic-demo)

Designstudion 5.8.0 bygger banprojekt i schema 2 för spelversion 0.18.0. Arkitektur och möbler har spelgeometri och kollision från samma projektdata. Du kan bygga i plan och 3D, visa FPS-utseendet, gå runt, kontrollera spelbarhet och spara/öppna JSON eller ZIP. Ett privat förhandsprov publicerar inte projektet. [Aktuell användarguide](furniture-editor/README.md) och [formatbeslut](docs/level-project-decisions.md).

## Labb, skor och FPS-inredning i Designstudion 5.8

**MÖBLERA** innehåller nu 301 objekt. De 22 nya objekten finns under **Biosäkerhet & skor**, **Whiteboard & Ricoh** och **FPS & labbutrustning**. Där finns Biosafety Cabinet byggd efter referensbilderna, svart golvskoställ, vit vägghylla, färgvalbara skor och de uppladdade whiteboard- och Ricoh-modellerna. FPS-samlingen innehåller bland annat Cartridge med stängt/öppet lock, cartridgebricka, labbvagn, instrument, centrifug, labbfrys, skåp, provrörsställ, pärmar, vakuumugn och torkugn.

Placera först skostället eller vägghyllan och därefter skorna med **Smart placering** påslagen. Markera ett par för att välja **Skornas färg** och **Hyllplan**. Skorna följer sin hylla när den flyttas, och färg, hyllplan och väggfästen sparas i JSON/ZIP och visas i FPS-promenaden. BINDER-vakuumugnen är en ny lågpolymodell; den separata torkugnen är återhämtad från onboard. [Användning](furniture-editor/README.md) · [FPS-objektens ursprung](docs/fps-furniture-library.md) · [Whiteboard och Ricoh](licenses/studio-office-models.md).

Standardmatchen börjar i två hissar på våning 5. Analysts startar i godshissen på norrväggen i I12 och Counter Analysts i Hiss 10 vid ENTRÉ 7. Dörrarna öppnas under köpperiodens sista 1,5 sekunder. I Endless är utgångarna öppna från start. Den tidigare grundbanan finns på [Floor 5 Classic](https://capstere.github.io/Cartridge-strike2/fps/?level=classic-floor5).

## Hitta i repot

| Plats | Innehåll |
| --- | --- |
| `furniture-editor/new.*`, `furniture-editor/build/` | Ny Designstudio, projektformat, byggverktyg och validering. |
| `furniture-editor/library/` | Granskat möbelbibliotek, procedurmodeller och importstöd. |
| `src/fps/`, `fps/` | Spelmotor och webbgränssnitt. Vanlig spelstart läser den möblerade Floor 5-banan från nivåmanifestet. |
| `src/world.js`, `src/floor5-data.js` | Befintligt Floor 5-spår. |
| `levels/` | Tillåtna publika banor och nivåmanifest. |
| `assets/`, `vendor/`, `licenses/` | Publika spelresurser och licensinformation. |
| `tools/`, `.github/workflows/` | Bygg-, hash- och webbläsarverifiering. |
| `frontline/` | Separat historiskt importerat källpaket; rensa inte utan licens- och beroendegranskning. |

## Utveckla säkert

Kör `node --test furniture-editor/build/*.test.mjs src/fps/*.test.mjs` och `node tools/verify-owner-runtime.mjs` för koden och publiceringsmanifestet. GitHub Actions kör dessutom riktiga Chromium/WebGL- och FPS-regressioner. Vid ändring av publicerade runtimefiler ska `build-info.json` regenereras enligt repots verifieringsverktyg och Pages kontrolleras efter merge. Använd [den prioriterade spelplanen](docs/roadmap.md) för nästa förändringar.
