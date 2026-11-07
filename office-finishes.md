## Kontorsmiljöer – fotobaserade, valbara material (Designstudio 5.5)

Tre användarval utan ändring av original-Floor 5:

1. **BYGG → Kontorsdörr**, eller markera dörr och välj **Dörrtyp → Grå kontorsdörr**. Grått slätt dörrblad (ca #817C78), neutral grå karm, metallhandtag; samma riktiga 1,20-öppning, gångjärnsrörelse, 3D/FPS-motor och kollision som vanliga dörrar. Använd på befintliga källdörrar utan att ändra deras exakta positioner.
2. **BYGG → Yta → Kontorsmatta · varmgrå**, eller markera en befintlig golvyta och välj **Golvtyp → Kontorsmatta**. Referensfärg #6E6765 från användarens foto; en återanvänd, redan godkänd Fabric045-struktur lägger ett fint vävt mönster på golvet i FPS-motorn. Valet sparas som `surface='office-carpet'` på nya golv och som `floorFinishes[id]` på ursprungliga Floor 5-rum. Det ändrar **aldrig** polygoner eller kollision.
3. **BYGG → Kontorsglas**, eller markera ett glasparti och välj **Glasutförande → Kontorsglas**. Genomsiktlig helglasvägg med horisontellt frostat mittband och ett egenritat, återkommande blått **signalstrecksmotiv** (inte företagets logotyp). `glazingStyle='office-band'` följer med i schema 2, ZIP/JSON, editor, spelmotor och härledd kollisionskarta. Motivet markeras dekorativt och får **ingen** kollisionsvolym.

**Designreferens:** två privata användarfoton gav färg-, placering- och proportionstolkning. **Inga foton och ingen företagslogotyp publiceras.** Färger är bildskärms-/ljusberoende uppskattningar; inte kalibrerade RAL/NCS-värden. Alla tre val kan ändras i editorn och äldre nivåprojekt med standardmaterial förblir oförändrade.

Test: `node --experimental-loader ./tools/vendor-three-test-loader.mjs --test furniture-editor/build/office-finish.test.mjs`; Chromium `tools/studio-office-finishes-browser.mjs`; befintliga CI-sviter.
