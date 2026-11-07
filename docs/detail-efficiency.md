# Cartridge Strike 0.15.3 — avgränsade detaljoptimeringar

Gäller originalspelet `/fps/`. Ingen ändring av fysik, spelregler, AI, kollisioner, vapenskada, upplösning eller skärmvisning. Frontline är orört.

## Kastbanan räknas om bara när underlaget ändras

En enda beräknad bana återanvänds när position, spelarhöjd, siktesvinkel, Cartridge-typ, fysikinställningar och samtliga rörliga dörrblad är exakt oförändrade. Ingen avrundning eller förenklad flygbana används. Vid förändring körs samma `predictGrenade` och samma kollisionskontroller som tidigare.

Befintlig uppdateringstakt på högst 12,5 beräkningstillfällen per sekund behålls vid rörelse. Vapenbyte visas direkt. Paus, återstart, avstängd guide och tillbakaställd spelklocka tömmer cachevärdet. Varningar för verkliga granater är inte cachelagrade av denna ändring.

Cachen jämför dörrbladens verkliga kollisionsmått/transformer, inte bara öppet/stängt. Den känner också av ny värld, ny raycast-funktion, nytt statiskt boxregister och ändrat antal statiska boxar. Den aktuella våningens statiska geometri är oföränderlig under matchen. Framtida funktioner som redigerar statisk geometri på plats måste anropa `predictionCache.clear()`. Främmande världar utan detta dörr-/golvkontrakt använder vanlig omberäkning. Högst 256 dörrblad kan cachelagras; större uppsättningar faller tillbaka utan att allokera en större cache.

## Mindre arbete med grafikbuffertar och texter

När banan återanvänds lämnas dess geometri och GPU-attribut orörda. Ingen identisk position-/avståndsbuffert markeras för ny uppladdning. Vid en riktig förändring skrivs koordinater direkt i befintliga typade arrayer i stället för att skapa en liten temporär array per punkt. Fyra återkommande DOM-uppslag för kastbane- och varningstexter är flyttade till konstruktionen.

## Billigare FPS-statistik

Samma senaste 120 bildtider lagras i en fast ringbuffert. Ett löpande totalvärde ersätter `shift` och omsummering av hela listan varje bildruta. Återstart tömmer statistiken utan ny buffert. Detta påverkar bara räknaren: det är ingen FPS-begränsare och påverkar inte spelklockan.

## Testning och avgränsade mätningar

15 nya regeltester tillsammans med 60 tidigare tester. I det reproducerbara testet på den riktiga våningens kollisionsmodell gör 125 identiska förfrågningar **13 625 raycasts före och 109 efter**, med exakt samma predikterade punkter/slutpunkt. Detta gäller stillastående sikte och oförändrade dörrar — inte alla spelsituationer.

Webbläsartestet kontrollerar 125 cacheträffar utan ny prediktion eller nya GPU-attributversioner, siktesförändring, fyra verkliga dörrlägen, oförändrad uppdateringstakt vid rörelse, paus, spelklocka, typbyte och återstart. Det körs på mobil-emulerad och desktop-Chromium. Tidigare sex webbläsarsviter körs också, inklusive riktiga kast och jämförelse med detonationens slutpunkt.

FPS-fönstret jämförs mot den tidigare uträkningen över 10 000 bildtider och testas separat med fraktionella tider, återställning och ogiltiga värden. Mätningarna gäller delsystem och säger inte hur många FPS eller hur mycket batteritid hela spelet vinner. Fysisk iPhone/Safari har inte testats.

## Byggkontroll

Den äldre engångsmigreringen för Cartridge-modeller känner nu igen en redan färdig integration även i nyare versioner. Den lämnar då alla filer orörda i stället för att försöka återställa versionsnumret. Befintliga modell-/fysiktester körs fortfarande.

Återanvändning av oförändrat underlag och fasta buffertar fortsätter samma inriktning som föregående Riposte-inspirerade renderinguppdatering. Ingen ny extern spelkod eller bildresurs importeras.

Teknisk referens för buffertar: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Typed_arrays
