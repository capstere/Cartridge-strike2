# GeneXpert-modeller i Designstudion

Två användaruppladdade GLB-modeller är tillgängliga i samma katalog och FPS-flöde
som övriga inredningsobjekt. Originalfilerna är oförändrade.

## Hitta och placera

**MÖBLERA → GeneXpert** eller **Labb**. Sök efter `GeneXpert`, `GX16` eller `Infinity`.

- **Cepheid GeneXpert 16 Module** (`genexpert:gx16`): 0,60 × 0,35 × 0,65
  i bredd × djup × höjd. `Auto` föreslår placering på en tillräckligt stor
  bänk/bordsyta. `På en yta` kräver en passande bänk. `På golvet` åsidosätter
  bänkfästet. Bänkens höjd och rotation följer med fästet.
- **Cepheid GeneXpert Infinity-80** (`genexpert:infinity80`): 2,74 × 0,89 × 2,00.
  Fristående golvmodell i `Auto` — den hoppar inte upp på bänkar.

Måtten följer de uppladdade modellerna; Floor 5:s modellenheter är inte
verifierade verkliga meter. Framsidan i båda originalmodellerna är **+Z**.
Vrid modellen med **R / VRID** och kontrollera att framsidan är vänd mot
arbetsgången. Logotyper och originalfärger ersätts inte av möbelpaletten.

## Spara och spela

Spara som vanlig JSON/ZIP och öppna **GÅ RUNT I BANAN** eller spelets projekt-
förhandsvisning. Katalog-ID, dimensioner, rotation, eventuell bänkhöjd och fäste
bevaras. Modellerna använder samma GLB-laddare i Studio och FPS, med vanlig solid
möbelkollision. De är statiska inredningsmodeller, inte fungerande analysinstrument.
Katalogfiler hämtas från spelets lokala webbplats. Ingen extern modellserver eller
specialdecoder behövs; texturerna är inbäddade.

Inga föremål placeras automatiskt i Floor 5. Ingen befintlig möblering, planlösning,
startpunkt, spelregel eller användar-ZIP ändras av bibliotekstillägget.

## Källa och verifiering

Se `licenses/genexpert-user-supplied.txt` för publiceringsunderlag och original-
hashar. Katalogposterna anger bytes, SHA-256, trianglar och uppmätta XYZ-mått.
GX16: 836 trianglar / 13 meshobjekt. Infinity-80: 940 trianglar / 21 meshobjekt.

Tester: `furniture-editor/library/genexpert.test.mjs` kontrollerar filintegritet,
framsida, mått, bänk-/golvplacering, projektets ZIP-rundtur och fysisk FPS-kollision.
`tools/genexpert-browser.mjs` kontrollerar verklig GLB-/texturladdning i Chromium,
katalogval, bänkfäste, rotation/ångra/gör om, ZIP, autosparning och den riktiga
FPS-renderaren. Bildbevis använder ett syntetiskt labbrum, inte privata Floor 5.
