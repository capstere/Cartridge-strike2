# Cartridge Strike 0.14.1 – granatöverblick

Gäller originalspelet i `/fps/`, både mobil och dator. Frontline-versionen och våningens geometri är orörda.

## Kastbana
Välj HE, flash eller rökgranat. En streckad 3D-bana visar det planerade kastet och beräknade studsar. Ringen markerar beräknad plats när säkringen löper ut – inte nödvändigtvis första nedslaget. Avståndet visas i meter.

Förhandsvisningen använder samma startposition, kastvinkel, hastighet, tyngdkraft, studsmodell och tidssteg som den riktiga granaten. Den beräknas på en kopia och förbrukar inte ammunition. Väggar döljer linjen och ringen i 3D; de ritas inte ovanpå hela miljön.

**Det är en prognos av nuvarande miljö.** En dörr som öppnas eller stängs efter kastet kan ändra flygbanan. Kastets hastighet, säkringstid, skada och explosionsradie är inte ändrade.

På mobilen används fortfarande KASTA. På datorn väljer du granat med 4 och kastar med vänster musknapp. Ingen automatisk granatkastning har införts.

## Varning för granater
En liten panel visar **GRANAT NÄRA** eller **FLASH NÄRA**, avstånd, återstående säkringstid och en pil relativt din blick. Varningen bygger på granatens nuvarande position, inte en garanti om var den kommer att detonera.

Väggar, rök, död och paus döljer varningen. HE följer de befintliga reglerna för friendly fire och spawnskydd; ofarlig vänlig HE ger ingen varning när friendly fire är av. Flash kan påverka även lagkamrater och varnar därför oavsett lag. Rökgranater får ingen explosionsvarning. Vid flera hot prioriteras närmaste detonation i tid. Flashvarning begränsas till 8 meter för att inte fylla skärmen med avlägsna hot.

## Inställningar
**Visa granatens kastbana** och **Varning för granater** är på som standard och kan stängas av separat i meny eller paus. Valen sparas i samma lokala inställningar som övriga kontroller.

## Implementation och testning
`grenade-physics.mjs` delas av Game och förhandsvisningen. `grenade-assist.mjs` återanvänder en linje och en ring; beräkningar begränsas till högst 12,5 uppdateringar per simulerad sekund när granaten hålls framme. Ingen ny grafikfil eller skyddad Riposte-resurs används.

Kastbaneidén är inspirerad av Ripostes `nadeArcUpdate` i det MIT-licensierade snapshotet `31ca050d` (`frontline/source/src/08-player.js`). Implementationen här är anpassad till Cartridge Strikes befintliga fysik och inkluderar studsar, till skillnad från referensens förhandsvisning. Ursprungliga licensfiler finns kvar i `licenses/`.

Enhetstester jämför den delade integratorn med den gamla samt med Games verkliga granatuppdatering, inklusive golv, vägg, tak, ammunition och hotfiltrering. Webbläsartester ska kontrollera verkliga kast med touch och mus, prognos mot faktisk slutpunkt i statisk geometri, varningsriktning, paus och sparade inställningar, tillsammans med tidigare mobil- och precisionstester. Chromium-emulering ersätter inte test på en fysisk iPhone/Safari.
