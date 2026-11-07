# Cartridge Strike 0.15.2 — mindre onödigt renderingsarbete

Gäller originalspelet `/fps/`. Frontline, spelregler, geometri/kollisioner, AI, vapenskada, rekyl och granatfysik ändras inte. Inga nya HUD-element, externa beroenden eller bildfiler.

## Ändringar

### Skottspår i en gemensam buffert
`TracerBatch` återanvänder en geometri, ett material och fasta numeriska buffertar för högst 128 samtidiga spår. Alla aktiva spår kan ritas med ett WebGL-anrop i stället för ett per spår. Den befintliga linjestilen och 45 ms livslängden i simuleringstid behålls. Varje spår tonas ut separat; väggarnas djuptest finns kvar. Kapacitetstaket påverkar enbart den kortlivade grafiken, aldrig skott, ammunition eller träffregistrering.

Poolen töms vid rund-/matchåterställning men resurserna behålls. Slutlig avveckling frigör dem en gång. Inga nya geometrier, material eller vektorer skapas per skott. Inspiration: Ripostes `Tracers` i `src/04-fx.js`, men den lokala implementationen använder befintliga linjer, inte Ripostes quad-shader.

### Återanvänd kartbakgrund
Golv, väggar, fasta uppdragsbokstäver och taktiska linjer ritas till en mellanlagrad canvas. Liten och stor karta har varsin cachepost (högst två); ny värld eller storlek återskapar motsvarande bakgrund. Levande lagkamrater och spelarens riktning uppdateras fortfarande med den ordinarie HUD-takten. Fiender tillkommer inte på kartan.

En dold karta gör inga canvas-ritningar. Det gäller särskilt mobilens vanliga spelläge. MER → KARTA respektive M visar fortsatt den taktiska kartan direkt. Inspiration: Ripostes `buildMinimapStatic` i `src/09ga-minicarte.js`.

### Paus/meny och resultattabell
Den pausade 3D-bakgrunden och huvudmenyn ritas högst omkring tio gånger per sekund. Händelsestyrda menyknappar fortsätter fungera. En dold flik gör inget renderings-/spelarbete i bildloopen; befintlig automatisk paus vid fokusförlust finns kvar. Pågående synliga matcher släpper igenom varje bildruta som webbläsaren levererar: ingen ny FPS-gräns, upplösningssänkning eller ändring av spelklockan.

Resultattabellens HTML ersätts endast när dess innehåll faktiskt ändrats, genom appens befintliga HTML-cache.

## Verifierade avgränsade mätningar

CI-körning: https://github.com/capstere/cartridge-strike/actions/runs/40487650919

- Isolerat WebGL-test med 32 samtidigt synliga skottspår: **32 → 1 ritningsanrop**. Efter utgång: 0. Antalet spårgeometrier förblir 1 genom 250 skott-/renderingscykler.
- Enhetstest med 5 000 skott behåller samma buffertar, geometri och material.
- Båda kartstorlekarna återanvänds över 100 ytterligare ritningar utan en ny bakgrundsbyggning. Den riktiga banan har 325 väggsegment. Den dolda mobilkartan gör 0 ritningar i det testade fallet.
- Kartans statiska ritkommandon/koordinater är identiska med version 0.15.1. Cachelagring innebär en extra rasterkomposition: i Chromium-testet av båda storlekarna var RGB-RMSE 0,173 på skalan 0–255 och 0,0085 % av pixlarna avvek mer än två färgsteg. Skärmbilderna granskades; detta är inte ett påstående om bitidentiska pixlar i alla grafikmotorer.
- Menytestet gjorde 6 respektive 7 omritningar under en observation om 650 ms på desktop/mobil. Ren regeltestning verifierar varje aktiv bildruta vid 30, 60, 120 och 144 Hz.

Detta är delsystemsmätningar, inte en uppmätt procentuell ökning av hela spelets FPS eller batteritid. Chromium med mjukvarurendering/touchemulering är inte ett fysiskt iPhone-/Safari-test.

## Testning och källor

`tools/render-performance.test.mjs`: 11 nya regel-/resurstester, tillsammans med 49 tidigare tester. `tools/render-performance-smoke.cjs` provar riktig spelstart, skjutning, kartknappar och WebGL-rendering. De fem tidigare webbläsarsviterna för mobil, precision, HUD, granater och Cartridges ingår i samma CI-matris. Alla 60 regeltester och sex webbläsarsviter passerade före merge.

- Riposte: https://github.com/BenDBSS/Riposte-Frontline-Source/blob/main/src/04-fx.js
- Riposte minimap: https://github.com/BenDBSS/Riposte-Frontline-Source/blob/main/src/09ga-minicarte.js
- MDN canvas-cacheprincip: https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas
