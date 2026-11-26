# Kartor i privata rum

Värden väljer **Karta** i väntrummet. Alla deltagare ser samma spelbild, spelläge och banans namn. När alla har laddat banan och valt **Redo** kan värden starta matchen. **Spela igen** i resultatvyn öppnar samma väntrum. Den fasta [familjeinbjudan](https://cs2.capstere.com/room/JESPERS-ROOM) öppnar familjens senast sparade karta.

| Karta | Spellägen | Start och vägval |
| --- | --- | --- |
| Floor 5 Laboratory | Classic och Team Deathmatch | Cargo Lift och Transit Lift. Värden kan slå på zombies och Dansmannen. |
| Compact Arena | Team Deathmatch | Blue Intake och Amber Intake. Gå genom Pulse Chamber för den korta mittvägen, eller välj Cryogenics eller Turbine Hall för att komma runt motståndarna. |

## Nivåfil och nätverkskontrakt

Compact Arena är en LevelProject v2 med sju zoner, tio startpunkter, två rörliga dörrar och sex patrullmål. Möbler, golvmarkeringar och instrument kommer från projektets befintliga material. Öppna den taktiska kartan med **M** eller **MER → KARTA**. **Z** eller **MER → RADIO** ger platsmarkörer från den aktuella banan.

Spelets vägplanering hittade en väg för alla 25 par av motstående startplatser på båda banorna. Med öppna starthissar och fria gångvägar var medianen 28,69 modellenheter på Compact Arena och 124,97 på Floor 5. Det ger 77 procent kortare väg mellan lagen. Banans två sidovägar ger samtidigt utrymme att gå runt mitten.

En godkänd onlinebana har en nivåfil i `levels/manifest.json` och en post i `shared/multiplayer/maps.mjs`. Registret anger namn, förhandsbild, lägen och stöd för residenter. Kör `node tools/build-network.mjs` efter en ändring. Verktyget läser de riktiga nivåfilerna, bygger deras kollisionsvärldar och skriver nivåfilernas och kollisionernas SHA-256-värden, det gemensamma bygg-ID:t och publiceringsmanifestet. Endast granskade offentliga filer får registreras.

Klienten autentiserar och reserverar en plats. Serverns rum anger kart-ID och en räknare för kartbyten. Klienten bygger världen först när den fått dessa uppgifter. Den verifierar filen, den härledda kollisionen och sina renderingsresurser innan servern släpper in spelaren i simuleringen. Varje rum har egna botar, dörrar, glasrutor och poäng.

Vid kartbyte förbereder servern den nya världen och kontrollerar att värden fortfarande äger väntrummet. Familjens val skrivs atomärt innan den nya världen tas i bruk. Platser och anslutningar består, alla redo-markeringar återställs och äldre laddningskvitton förfaller. Under pågående match, nedräkning och resultat är valet låst. Klienten återanvänder sin senaste verifierade värld vid ny anslutning till samma karta på samma sidladdning. Vid kartbyte släpper den föregående världens inmatning, prediktion och grafikresurser.

## Drift och återställning

Familjens v1-fil utan kart-ID öppnar Floor 5. En äldre release kan läsa en fil som den nya servern sparat och spelar då Floor 5 med ett kompatibelt spelläge. Om den äldre versionen sparar nya inställningar kan kartvalet behöva väljas igen efter uppgradering. Spara familjens inställningsfil separat före byte om valet ska kunna återställas exakt. Lokala sparade karaktärer, nivåer och grafikinställningar använder sina tidigare format.

Kontrollera att rummen är tomma med `sudo cs2-online status`. Återställ föregående Pi-release med `sudo cs2-online rollback`. Kommandot kontrollerar klient och server via den riktiga domänen. [Driftguide](../../../deploy/online/README.md)

## Reproducerbara prov

Från repots rot, med låsta server- och webbläsarberoenden installerade:

```sh
node --import ./server/register-shared.mjs --test tools/compact-arena{,-level}.test.mjs server/test/multiplayer-maps.test.mjs
node --import ./server/register-shared.mjs tools/compact-arena-match.mjs
node --import ./server/register-shared.mjs tools/multimap-recovery-browser.mjs
for scenario in desktop mobile four floor; do
  FPS_MAP_CASE="$scenario" node --import ./server/register-shared.mjs tools/multimap-browser.mjs || break
done
```

Det renderade provet kör Chromium och en isolerad HTTPS/WSS-server. Lägg till `CHROMIUM_PATH=/usr/bin/chromium` för systemets Chromium på Pi:n. Mätningen skiljer renderade bilder från serverns fasta simuleringssteg. En webbläsare renderar, övriga människoplatser där de ingår använder officiella SDK-klienter. Mobilfallet använder touch-emulering.
