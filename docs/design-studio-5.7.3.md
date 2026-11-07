# Designstudio 5.7.3 — bygg först, optimera en spelkopia senare

Projektkällan är en byggmaster. Spelbarhet och renderingsprestanda är separata
kontroller; en ofärdig bana behöver inte klara dem för att sparas.

## Felet

Den tidigare gränsen 250 nya byggdelar låg separat i projektparsern,
arkitekturparsern, fönster-/dörrverktyget och rumverktyget. Att lägga ett fönster
mitt i en vägg kan ersätta en del med tre. Ett giltigt projekt med 250 delar
kunde därför sparas men inte byggas vidare på med de verktygen.

## Ändring

Gemensamma resursgränser i `furniture-editor/project-limits.mjs`:

- 5 000 nya byggdelar och 5 000 ändrade/borttagna källdelar per lista.
- 10 000 sammanlagda möbelposter, inklusive borttagningar.
- 1 000 golv per lista, 1 000 affischer och 1 000 gardiner/persienner.
- 10 000 ytöverstyrningar och 16 MiB projekt-JSON (UTF-8 bytes).

Parser, schema och skapandeverktyg använder samma tal. Materialfärger/finish
följer med som tidigare. Byggpanelen visar antal möbler och nya byggdelar samt
påminner om att full detaljgrad sparas och optimering görs på en separat spelkopia.
Ingen kod har lagts till som automatiskt raderar, flyttar, förenklar eller slår
samman användarens föremål.

Säker sparning från 5.7.2 bevaras: vanlig ZIP för strukturellt giltiga projekt,
märkt räddningskopia om ett fel hindrar vanlig export. Giltiga utkast kan vara
ofärdiga och sakna spelmål. En räddningsfil med fel är inte automatiskt körbar.

## Bevarade skydd

Oändliga eller felaktiga koordinater, dubblett-ID, saknade modellfiler,
externa modellreferenser, felaktiga kontrollsummor och osäkra ZIP-sökvägar
är fortfarande fel. ZIP-paketets 96 MiB-gräns och kontrollen av enskilda
GLB-filer är oförändrade. Fler tillåtna poster är inte ett löfte om viss
bildfrekvens eller obegränsat webbläsarminne. Lokal lagringskvot kan fortfarande
bli full; lagringsfelet rapporteras och tidigare utkast skyddas.

## Tester

`authoring-capacity.test.mjs` kontrollerar väggdelning 250 -> 252, nytt rum
över tidigare gränser, båda redigeringslägena, dekorationer, JSON-bytebudget,
fortsatt strikt datakontroll och sparning utan falskt spelklarbesked.
`tools/authoring-capacity-browser.mjs` använder faktiska knappar/klick,
ångra/gör om, ZIP-hämtning/återimport, omladdning och 3D-vyn på en syntetisk bana.
Privata planritningar och ägarens projekt är inte testfixturer i repot.

Slutlig speloptimering (till exempel delad geometri/material, instanser och
avståndsdetaljer) ingår inte i denna ändring och ska göras utan att skriva över
byggmastern när utformningen är klar.
