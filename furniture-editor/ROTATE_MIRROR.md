# Vrid och spegla möbler

Samma kontroller finns i **Ny bana** och **Floor 5**, i både plan- och 3D-vyn.

1. Ladda om studion med **Cmd+Shift+R** (Mac) eller **Ctrl+F5** (Windows).
2. Klicka på en placerad möbel. Välj **↶ 15°** eller **15° ↷** i redigeringsrutan intill scenen.
3. Klicka **Spegla ↔** för att vända möbeln i sidled. Knappen visar **Spegling på ↔** när spegling är aktiv. Klicka igen för att återställa.
4. **Ångra**, **Gör om**, **Kopiera** och **Spara till Codex · ZIP** behåller resultatet.

Tangentbord: **R** vrider höger, **Shift+R** vänster och **M** speglar en markerad möbel. Genvägarna ändrar inte möbeln när du skriver i ett fält eller går runt i FPS-vyn. Planvyn visar en riktningslinje och en spegelsymbol på det markerade objektet. För att se modellens detaljer, välj **Bygg i 3D**.

Golv- och bordsmöbler vrids runt mitten. Föremål som står på möbeln följer med, inklusive underordnade fästen. Väggföremål vrids i väggens plan, runt fästets mitt; de riktas fortfarande ut från samma väggsida. **Byt väggsida** och modellens framsideskalibrering är separata kontroller. En rotation som inte ryms vid fästet avvisas utan att flytta föremålet. Sänk, flytta eller minska det först. Om du uttryckligen har gjort väggmöbeln till ett hinder för spelaren behöver du välja **Dekoration** under **Finjustera mått och placering** före lutning; spelets kollisionssystem bygger fortfarande på upprätta möbelboxar. En vägghylla med föremål ovanpå kan inte lutas; en redan lutad hylla erbjuds inte som bordsyta.

Spegling vänder hela möbeln i sidled, även eventuell text på dess yta. Det är en transform på den placerade instansen. Originalets GLB-bytes, geometri, UV, material och andra instanser ändras inte. Den gemensamma möbelrenderaren används också av FPS-promenaden. Inga spelmekaniska ändringar ingår.

Projektformatet är fortfarande schema 2. De valfria fälten `mirrored` (boolesk) och `wallRoll` (radianer mellan −π och π, används bara på väggen) har validering och sparas även för befintliga Floor 5-möbler. Äldre projekt utan fälten fungerar som tidigare. Negativ skala används bara på en separat renderingsgrupp; delad meshgeometri eller material skrivs inte om.

## Verifiering

- `furniture-transforms.test.mjs`: fästträd, återställning, fyra modellframsidor, roterade väggmått, oförändrade UV/material/geometri, fördröjd GLB-förhandsvisning, formatvalidering och Floor 5-original genom ZIP.
- `tools/furniture-transform-browser.mjs`: båda ingångarna, verklig asymmetrisk GLB med synligt sidodetaljbyte, TV-väggfäste, två rotationsriktningar, spegling, ångra/gör om, kopiering, ZIP/omladdning, originalbytes, FPS-rendering och smal viewport.
- Befintliga vägg-, studio-, ban-, biblioteks- och dörrtester behålls. Bildresultat sparas lokalt under `test-results/furniture-transforms/`.

Rotation och spegling använder knappar och genvägar i den befintliga editorn. För förflyttning och höjd finns nu även [3D-handtag](MOVE_HANDLES.md). Fysisk telefon/styrplatta och prestandanivåer är inte verifierade av webbläsartesterna.
