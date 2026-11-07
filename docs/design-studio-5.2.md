# Designstudio 5.2 – markera flera, kopiera och klistra in

Samma funktioner finns i **Ny bana** och **Floor 5**, i plan- och 3D-vyn.

1. Håll **Ctrl** (Windows) eller **⌘ Command** (Mac) och klicka på möblerna. De markerade möblerna färgas orange. Klicka igen med tangenten nedtryckt för att avmarkera en möbel.
2. Tryck **Ctrl/⌘+C**, sedan **Ctrl/⌘+V**. Du kan också använda **Kopiera** och **Klistra in** ovanför vyn, även på mobil.
3. Kopiorna placeras lite bredvid originalen och markeras. Klicka utan extra tangent på en kopia för att flytta, rotera eller höjdjustera den med befintliga handtag. **Esc** avmarkerar. **Ctrl/⌘+Z** ångrar hela inklistringen; **Ctrl/⌘+Shift+Z** eller **Ctrl/⌘+Y** gör om.

Fästa tillbehör följer med sitt bord eller sin hylla och kopplas till kopian, utan dubblering om tillbehöret också är markerat. En ensam kopierad bordsdekoration behåller sitt befintliga bord. Väggmonterade möbler behåller vägg, sida, höjd och riktning. Om hela gruppen inte kan förskjutas med bibehållna fästen klistras den in på samma plats, med ett tydligt meddelande. Ändrade eller borttagna fästytor stoppar inklistringen: kopiera då på nytt.

**Kopieringen gäller möbler och deras tillbehör**, inte väggar, golv, öppningar eller spelmarkörer. Klicka utan Ctrl/⌘ för att redigera sådana byggdelar. Flerval används för kopiering och borttagning; klicka på en enskild möbel för dess andra redigeringsverktyg. Delete tar bort de valda möblerna med deras fästa tillbehör, som en ångringsbar ändring.

Urklippet finns bara i den öppna editorsidan, för samma bana. Det använder inte datorns systemurklipp eller någon server. Vanlig textkopiering i textfält fungerar som tidigare. Spara ZIP för att behålla de inklistrade objekten; projektformatet är oförändrat. GLB-filerna återanvänds och originalmodellerna ändras inte.

**Flytta kameran:** mellanslag eller Shift + dra, alternativt höger/mellersta musknapp. Ctrl/⌘-klick är nu reserverat för flerval. Håll Alt och dra i 3D för att rotera vyn.

Verifiering: automatiska tester för kopieringsögonblick, unika ID:n, fästen, väggsidor, ändrade fästytor, projektgräns och ZIP. Chromium/WebGL provar riktiga Ctrl- och Command-klick i båda vyerna och lägena, tangentbord, textfält, ångra/gör om, ZIP och 390 px bred vy. Testresultat och publiceringskontroll redovisas i PR:n.
