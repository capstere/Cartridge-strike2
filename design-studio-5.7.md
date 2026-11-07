# Designstudio 5.7 – tätare fönster, gardiner och valbara golvmaterial

## Användning

Öppna `furniture-editor/new.html?mode=edit-floor5` (Floor 5) eller `new.html` (ny bana).
Markera golvet: **Golvmaterial** finns direkt i färgpanelen. Kakel, blankt laminat och
stora rektangulära stenplattor är material, inte färgrutor. Val av material tar bort
föregående enfärgade överstyrning. **Återställ materialfärg** visar mönstret igen.
Detta fungerar även på uttryckligen återöppnade rum, utan att andra stängda ytor öppnas.

Under BYGG finns **Vit gardin**, **Genomskinlig gardin** och **Mönstrad gardin**.
Klicka därefter på fönstret/väggen. Gardintyp och väggsida kan ändras efter placering.
Den mönstrade varianten är en nyskapad tolkning med blågrå blad, roströda och beige
former på skir botten. Referensfotot, fönstret och radiatorn ingår inte i spelet.
Alla tre gardiner använder samma sammanhängande veckade tyg i Studio och FPS.
Skira varianter använder en enda genomskinlig yta, inte flera överlappande lådor.
Gardiner/persienner skapar fortfarande ingen kollision.

## Tekniska rättningar

- Fönster/glasväggar klipper inte längre bort dörrarnas extra 0,015 spelrum ur
  solida väggar. Riktiga dörrar/öppningar behåller sitt befintliga spelrum.
- Bröstning och överstycke får en minimal överlappning vid exakta väggskarvar.
  Detta täcker inte riktiga hål, korsar inte dörrar och ändrar inte källkartan.
- Golvmaterial i öppnade excluded/uncertain-ytor accepteras av projektparsern.
  Tidigare kunde gränssnittet välja ett material som sedan nekades vid export.
- Kollisionskartan har `geometryRevision: 2`. Gamla ZIP-kartor kontrolleras mot
  exakt den tidigare klippalgoritmen innan import; felaktiga kartor ignoreras inte.
  Ny export räknar alltid fram den nya kartan.
- Cacheversioner och det publika runtime-manifestet är uppdaterade.

## Gräns och verifiering

Inga privata projekt, geometriändringar i ägarens ZIP eller originalfoton ingår i
repot. Små ändpunktsglipor i ägarens möblerade projekt levereras som separat ZIP.
Ingen automatisk utfyllnad av godtyckliga luckor, breddning av korridorer eller
förändring av spawns/mål görs av denna release.

Riktade regressioner: `furniture-editor/build/window-curtain-regression.test.mjs`.
WebGL/UI/ZIP/FPS-prov: `tools/studio-seams-browser.mjs`, med en liten syntetisk
bildartefakt som sparas i en dag. Aktuella resultat finns i PR:ens testkörningar.
