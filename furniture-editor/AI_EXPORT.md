# Designstudion – tom bana, automatiska kollisioner och AI-export

**NY TOM BANA · TÖM ALLT** rensar det nya banprojektet på golv, väggar, möbler, spawns och mål. Klicka ÅNGRA direkt om du ångrar dig. Din befintliga Floor 5-bana påverkas inte.

**Byggläge:** Rita rum och golv i planvyn, sedan väggar, fönster, glas, dörrar och öppna passager. Nya dörrar och passager har **1,20 modellenheter** som standard, men kan ändras genom att markera byggdelen och ange Bredd (minst 1,10). Öppningar utan dörrblad klipper bort själva väggens kollisionsyta. Normala dörrar har dynamisk dörrbladskollision.

**Möbler:** Markera ett objekt för att välja *Solid – blockerar spelaren* eller *Dekoration – ingen gångkollision*. Även dekorativa objekt finns kvar visuellt. Kollisioner för fasta väggar, fönster och glas skapas automatiskt från den faktiska geometrin; du behöver inte rita en separat osynlig kollisionskarta.

**EXPORTERA TILL AI / FPS · ZIP** sparar `project.json` (källan), `COLLISION_MAP.json` (härledd, integritetskontrollerad karta), `AGENT_BRIEF.md` (instruktioner till en AI-utvecklare) och eventuella lokala GLB-modeller. Paketet är ett AI-handoff, **inte automatisk AI-spelgenerering**. Import av äldre ZIP utan collision-map stöds. Modeller med osäker rättighet publiceras inte automatiskt.

**Provspelning:** Lägg 5+5 spawns, bombmål, gisslan och räddningszon. Kontrollera gångbarhet via KONTROLLERA BANAN, sedan privat provspelning i WebGL. Välj REDIGERA FLOOR 5 i samma studio för att bygga på den befintliga banan. Befintliga startpunkter och mål följer med, och dess ändringar kan också sparas och provspelas privat. Skalan använder modellenheter – den är inte verifierad i meter.

**Bygg som i ett byggspel:** Använd verktygsknapparna. Dra ut ett RUM för golv och fyra väggar. Klicka med DÖRR, FÖNSTER eller GLAS på en vägg för att fästa byggdelen och ersätta den berörda väggen. Välj PLACERA VALD MÖBEL och klicka där den ska stå; grönt/rött fotavtryck visar om den ryms. R vrider, Esc avslutar. DUPLICERA låter dig placera en ny kopia med musen och tar med objekt som sitter på stödet.

**Plan och 3D:** Samma möbler syns i båda vyerna och i FPS. Låga väggar påverkar bara redigeringsvyn. Visa fysik markerar automatiskt härledda väggar och möbelfotavtryck. Affisch, Gardin och Persienn finns under Fler byggverktyg; klicka på väggen/fönstret. De följer väggens fäste och är dekorativa.

**Filer för Codex:** ZIP innehåller både källprojektet och en härledd kollisionskarta. Floor 5-exporten anger vad som ärvs och vilka objekt som ändrats eller tagits bort. En export är inte ett löfte om att godtycklig ny kod blir felfri: kontrollera alltid banan i motorn och provspela innan publicering. Ursprungliga Floor 5-golv bevaras i detta läge; lägg till rektangulära golv eller välj Ny bana för en helt egen värld.
