# Designstudio 5.0 – se, måla och möblera din bankopia

Uppdatering: [5.1 – frostad dörr, svart golv och dra bara golvet](design-studio-5.1.md).

Både **NY BANA** och **REDIGERA FLOOR 5** använder samma verktyg. Originalbanan och ursprungsmodellerna ändras inte.

## Prova

1. Öppna `furniture-editor/new.html`, välj **Skapa rum** och **BYGG I 3D**. Väggar visas i full höjd; dörrar har karm, dörrblad, handtag och sparkplåt. Fönster har verklig bröstning och ram. **Sänk väggar** ger bättre överblick.
2. Klicka på en vägg, ett golv eller en dörr. Välj **Färg på vald yta** eller en färgruta. **Originalfärg** återställer. För glaspartier målas ramen, inte glaset. Färgen följer med till ZIP, omladdning och FPS. **×** avmarkerar ytan.
3. På en vanlig, öppningsbar dörr: **Visa dörren öppen/stängd**. Det är en visuell förhandsgranskning; spelets befintliga automatiska dörrfunktion är oförändrad.
4. Välj **MÖBLERA → Visa → Mina husmöbler · 122 modeller**. Klicka exempelvis på **Stol 1**, **Krukväxt 2** eller **Nattduksbord 2**, placera och justera med befintliga handtag. Sök fungerar på svenska och ursprungligt modellnamn.
5. Välj **GÅ RUNT I BANAN** och **SPARA TILL CODEX · ZIP**. Sparandet publicerar inte din bana automatiskt.

## Den osynliga spärren till loungen

I **FLOOR 5**, öppna **Gångbara ytor och osynliga hinder** i verktygspanelen. Välj golvglipan mellan korridoren och loungen (I25/C11) och klicka **Anslut golven**. Kameran visar automatiskt den valda ytan i 3D. **Visa gånghinder** visar glipor i rosa och avstängda golvytor i rött. På en avstängd yta heter knappen **Gör ytan gångbar**. Ångra/Gör om fungerar.

Vid loungeentrén finns en glipa på **0,056 modellenheter**, mellan korridorens x=38,038 och loungens x=38,094. Befintliga tröskelpatchar täcker bara delar av sträckan. Därför kan golvet se sammanhängande ut samtidigt som fysikens golvkontroll stoppar spelaren. Verktyget lägger till en explicit golvanslutning i bankopian. Det flyttar inga väggar och stänger inte av kollisionssystemet. Soffor och riktiga väggar blockerar fortfarande. Avstängda ytor öppnas bara efter ett uttryckligt val.

## Bibliotek och källor

**133 nya valbara objekt**: 122 husmodeller och 11 återanvända industriföremål. Alla får miniatyrbilder från faktisk Three.js-rendering. Modeller laddas när de väljs; hela biblioteket importeras inte i spelet.

- Husmodellerna kommer från `capstere/onboard`, `House interior Blends/`, commit `ccaf58d2b3eca04d1ddb07af9a3989ff0390b33c`. Ägaren bekräftade 2026-11-01: ”lägg in dom i offentliga biblioteket. det är mina”. Detta dokumenterar publiceringsgodkännandet, inte en påhittad CC0-licens.
- Samtliga 123 BLEND-filer granskades i Blender **4.5.3 LTS**. 122 exporterades och återimporterades med oförändrade mått och triangelantal. Originalens SHA-256 kontrollerades efter export. `Drawer_4.blend` saknar meshobjekt och är utesluten.
- Äldre direkta Transparent BSDF-material exporterades annars som ogenomskinligt vitt. Tolv sådana material i exportkopiorna använder dokumenterad glTF-transmission med IOR 1 och ursprunglig färg. Originalfilen sparas inte om. Detaljer och hashvärden finns i [konverteringsrapporten](../furniture-editor/library/models/house-interior/conversion-report.json).
- De 11 industriföremålen återanvänder befintliga MIT-licensierade prefab-funktioner i `src/fps/riposte-procedural-props.mjs`: tunna, betongbarriär, sandsäckar, pallställ, container, ventilation, generator, kabeltrumma, pollare, dunk och arbetsbord. Ingen extra GLB-kopia skapas. Ursprunglig pall är redan representerad i Hissrum-biblioteket.
- Inventeringen omfattade filträdet i 22 spelrelaterade repon. `onboard`, `jedi`, `sw`, `the` och `cartridge-strike` innehöll modeller/arkiv. `jedi`/`sw` innehåller många redan representerade Hissrum-modeller; de duplicerades inte. `the` innehåller främst referens-/industrimaterial. `man/main` kunde inte läsas. Övriga 16 inventerade repon saknade BLEND/GLB/glTF/FBX/OBJ/ZIP i det lästa filträdet. Detta är ingen generell rättighetsbedömning av privata dokument.

**Avgränsningar:** Bibliotekets husdörrar och fönster är statiska dekorobjekt; använd byggverktygens **Dörr**, **Fönster** och **Öppning** för fungerande passager. Lampmodeller kan ha emissiva material men skapar inte nya dynamiska ljus. Speglar har material, ingen ny realtidsspegling. Källornas verkliga mått bevaras, men deras skala är inte verifierad som meter. Inga nya karaktärer eller vapen publiceras här.

## Verifiering

- Automatisk projekt-/biblioteks-/fysikregression, gamla JSON/ZIP, kända originaldörrar och nya dörrpassager.
- `surface-spaces.test.mjs`: färgdata, ram/glas-separation, verklig spelarpassage vid loungen, explicit öppning av stängda ytor, ogiltiga ID:n, golvglipor och färg vid delning av väggar.
- `house.test.mjs`: alla 122 GLB-hashar, Blender-rapport, miniatyrer och projekt-ZIP.
- `tools/studio-spaces-browser.mjs`: båda ingångarna i Chromium/WebGL, färgknappar, dörrlägen, 390 px viewport, ZIP, ångra/gör om och FPS. Testets kameror ställs för jämförbara bilder; inget prestandalöfte görs utifrån skärmbilderna.
- `tools/assets/house-thumbnails.mjs`: faktisk GLTF-/procedurrendering av alla 133 tillagda objekt. Alla fyra kontaktkartor granskades visuellt.
- Befintliga WebGL-tester för TV/väggsida, importerad GLB, rotation/spegling och flytt-/höjdhandtag körs fortsatt. GitHub CI redovisas separat i PR:n.

Reproducerbara konverteringsverktyg finns i `tools/assets/`. Lokala skärmbilder/testresultat finns i `test-results/studio-spaces/`; ingen ny GitHub Actions-artefaktlagring behövs.
