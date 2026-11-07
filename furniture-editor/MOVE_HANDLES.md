# Flytta och höjdjustera i 3D

Gäller både **Ny bana** och **Floor 5** i den befintliga Designstudion.

1. Ladda om sidan med **Cmd+Shift+R** (Mac) eller **Ctrl+F5** (Windows).
2. Välj **Möblera**, klicka **Bygg i 3D** och klicka på en placerad möbel.
3. Dra **Flytta** för att flytta på ytan. **Sidled** och **Djup** flyttar längs en riktning. Dra det orange **Höjd** uppåt eller nedåt för att höja/sänka hela möbeln, utan att ändra dess storlek.
4. För en väggmöbel visas **Längs vägg** och **Höjd**. **Flytta** följer väggens plan. Fästet, väggsidan, avståndet från väggen, rotationen och speglingen behålls. Möbler som inte får plats kan inte dras utanför väggens gränser.
5. Släpp för att spara placeringen lokalt. **Esc** avbryter en pågående dragning. **Ångra** återställer hela dragningen; **Gör om** tar tillbaka den. Spara **ZIP** för en separat projektkopia.

Handtagen fungerar med mus och pekdragning. Du kan också fokusera ett handtag med Tab och använda piltangenter för steg om 0,1 modellenheter. Flytta kameran med Ctrl/Cmd/Shift eller mellanslag + drag, höger/mittknapp, eller de befintliga vyknapparna; zooma med rullning. Alt + drag roterar kameran. Det fungerar även när dragningen startar på ett handtag. När en möbeldragning redan pågår låses kameran tills du släpper eller avbryter.

I smal 3D-vy fälls redigeringsrutan ihop för att lämna plats. **Redigera vald möbel** öppnar den igen, med befintliga rotations-, speglings- och måttkontroller. Om en möbel ligger utanför vyn, flytta/zooma kameran så att den syns; handtagen hör till möbelns mittpunkt.

Höjden visas över golvet och flyttningen använder steg om 0,1 modellenheter. Modellenheterna är inte generellt verifierade som meter. Fria möblers botten kan ligga mellan 0 och 6; väggföremål begränsas dessutom av väggens höjd och modellens verkliga utsträckning. Fästa underdelar följer med hela vägen ned i fästträdet. Föremål på en möbelyta begränsas till den ytan och kan inte sänkas genom den. De kan höjas över ytan och behåller då sitt fäste. Vanlig flytt och kopiering av fristående höjda möbler behåller höjden.

Originalets GLB, mesh, UV, material och skalning ändras inte. Handtagen ändrar instansens position i samma projekt och använder samma väggberäkning som tidigare. Förhandsvisningen flyttar befintliga renderingsgrupper utan att läsa om GLB-filer vid varje musrörelse. Projektformatet förblir schema 2 och använder redan befintliga positions-, höjd- och fästfält. Ingen FPS-mekanik, källgeometri i Floor 5 eller karaktärsstudio ändras. Kontrollera fortfarande spelbarhet när du flyttar hinder.

## Verifiering

- `furniture-translation.test.mjs`: fullständiga fästträd, väggsida/orientering, begränsningar, bordsyta, höjd vid kopiering, Floor 5-original genom ZIP och fel utan mutation.
- `tools/furniture-handles-browser.mjs`: riktiga Chromium/WebGL-pekargester i båda lägena, ingen förflyttning vid första trycket, ett Ångra-steg per drag, Gör om, Esc/pekavbrott/fokusförlust, kameragester, tangentbord, verklig TV, spegling/rotation, ZIP-återläsning, oförändrade GLB-bytes, smal viewport med emulerad touch och samma position i FPS-renderaren.
- Befintliga tester för rotation/spegling, väggplacering, studio, format, bibliotek, banor och dörrpassager behålls.

Bilder och körresultat skrivs till `test-results/furniture-handles/`. FPS-bilden är en kontrollerad kamerabild från den verkliga renderaren. Tester i emulerad smal vy/touch ersätter inte test på fysisk telefon. Ingen generell FPS- eller GPU-prestandanivå utlovas.
