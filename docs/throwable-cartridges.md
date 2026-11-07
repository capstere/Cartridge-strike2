# Cartridge Strike 0.15.1 — kastbara Cartridges

Originalspelets HE-, flash- och rökgranater använder nu en ny, gemensam Cartridge-modell. Den gamla enkla lådan med två utstickande portar ersätts av en avsmalnande vit kropp, blå fot, stängt lock med gångjärn och spärr samt ett stiliserat reaktionsrör baktill.

## I spelet
Modellen är samma i spelarens hand, i andra spelares/botars händer och i luften. HE, FLASH och SMOKE har både text och olika etikettfärger. Två etikettfält gör typen synlig från båda håll. Märkningen är påhittad för spelet.

Kastade Cartridges får olika startorienteringar och tumlar kring kroppens centrum. Rotationens hastighet följer projektilens rörelse. När föremålet når det plana golvet och nästan står still lägger det sig på sidan i stället för att snurra oavbrutet. Paus stoppar även denna animation. Golvanpassningen flyttar bara grafikobjektet, aldrig projektilens simulerade position.

Befintlig kastbanevisning, varningar, KASTA-knapp och mobilens MER-meny fungerar som tidigare. Inga nya HUD-element tillkommer. På datorn: välj en Cartridge med 4 och kasta med vänster musknapp. På mobil: MER → GRAN., därefter KASTA.

## Oförändrat
Kaststyrka, flygbana, kollisioner, studsmodell, säkringstid, ammunition, effekter och skada ändras inte. Den placerbara uppdragsbomben, den separata Frontline-versionen, banans geometri, botarnas beteende och övriga vapen är orörda.

## Modell och prestanda
`src/fps/throwable-cartridge.mjs` bygger egen procedurgeometri med fem sammanslagna materialgrupper per Cartridge. Samma typ delar geometri, material och etiketttextur mellan händer och kastade exemplar. Inga externa grafikfiler, genomskinliga skal eller extra ljuskällor laddas.

En enskild granat som försvinner får inte förstöra material som fortfarande används av ett annat exemplar. Cachen äger därför resurserna och frigör dem vid slutlig renderer-avveckling. Testerna kontrollerar både återanvändning och att varje resurs frigörs exakt en gång.

Modellen är ett originaldesignat fiktivt spelobjekt. Den importerar inte den äldre foto-/måttbaserade cartridge-v11-modellen, tillverkarlogotyper, diagnostiketiketter eller andra externa resurser.

## Verifiering
Regeltester täcker modellens dimensioner, material-/triangelbudget, instansoberoende, deterministisk rotation, pauser, golvkontakt och resursägande. Webbläsartester renderar alla tre varianterna, kastar dem med riktig touch/mus-input och kontrollerar ammunition, kastbanevisning och städning av kastade modeller. Tidigare tester för granater, sikte, mobil och ren/full HUD körs också.

Testbilder sparas i CI-artefakten `cartridge-review-throwable-cartridge`. Chromium-emulering ersätter inte ett test på fysisk iPhone/Safari. Nära väggar kan den kosmetiska formen skilja sig något från den befintliga sfäriska granatkollisionen, som avsiktligt inte ändrats.
