# Designstudio 5.1 – täta dörrskarvar, frostat glas och golvkanter

Gäller både **Ny bana** och **Floor 5**. Gamla JSON/ZIP-projekt fungerar; valen sparas i den befintliga projektfilen. Inga källmodeller skrivs om.

1. **Svart golv:** välj **BYGG I 3D**, klicka på golvet och välj färgrutan **Svart**. **Originalfärg** återställer. Även andra ytor kan målas svarta.
2. **Passa in golvet:** markera golvet → **Dra bara golvet** → dra ett grönt handtag mot väggen. Nära väggen snäpper kanten till dess fysiska insida, även när väggen inte ligger på rutnätet. Väggar, dörrar och möbler står kvar. Tryck **Esc** för att avbryta eller **ÅNGRA** för att återställa. I Floor 5 visas golvhandtagen direkt på markerade ursprungliga golv. Zooma ut om kanten ligger utanför vyn.
3. **Frostad glasdörr:** klicka på en vanlig dörr → **Dörrtyp → Frostad glasdörr**. **Visa dörren öppen** förhandsgranskar. I **GÅ RUNT I BANAN** öppnas den automatiskt, precis som vanliga dörren. **Vanlig dörr** byter tillbaka. Glaset är ett frostat material, inte en ny importerad modell.
4. **SPARA TILL CODEX · ZIP** sparar färg, dörrtyp och golvkanter. Det publicerar inte din bankopia.

## Korrigering och gränser

De två gliporna ovanför dörren kom från väggkapningens 0,015 extra spel på vardera sidan, medan överstycket bara täckte den nominella dörrbredden. Floor 5-dörr D26 har dessutom ursprungliga avstånd på cirka 0,133 respektive 0,028 till de angränsande väggarnas ändar. Överstycket måste täcka även dessa faktiska avstånd. Det använde även en fast tjocklek. I bankopiorna följer överstycket nu angränsande väggs plan, höjd, tjocklek och färg, täcker kapningen och har en mycket liten djupförskjutning (0,0001 modellenheter) mot överlappningsflimmer. En överkarm täcker springan precis över dörrbladet. Dörröppningens fria bredd, gångjärn och mekanik ändras inte. Spelets kanoniska Floor 5-källa är oförändrad.

**Dra bara golvet** ändrar raka, axelparallella golvkanter med vinkelräta anslutningar. Ogiltiga eller korsande konturer stoppas. Egna rektangulära golv behåller minst 0,5 i bredd/djup. Oregelbundna sneda golv får inga osäkra handtag. När en ursprunglig Floor 5-yta ändras lagras konturen separat i `ground.floorEdits`; originalfilen är kvar. Ersatta ursprungliga golvplattor tas bort ur bankopians golvunderlag så att minskning inte lämnar ett osynligt golv. Där en befintlig dörr eller öppen passage har golv på båda sidor behålls en gångbar remsa under tröskeln, så att golvkanter vid väggens insidor inte skapar en ny osynlig spärr. Andra överlappande golvytor gäller fortfarande och behöver vid behov justeras separat. Väggar och avstängda områden behåller sin kollision.

Byta till frostat glas erbjuds för öppningsbara vanliga dörrar och passerkortsdörrar. Hiss-/terrassdörrar och blockerade dörrar konverteras inte. Glasdörren använder samma svängande kollisionsblad och är inte en krossbar fönsterruta. Inga nya glasbrottsregler införs.

## Testning

- `floor-door-finish.test.mjs`: faktiska överstycken med omvända ändpunkter/rotation, snäppning till icke rutnätsbunden väggyta, bevarade väggar, avvisade golvkonturer, Floor 5-källa oförändrad, korrekt gångyta efter minskning, ZIP och frostade dörrars gångjärn/kollision/spelarpassage.
- `studio-floor-door-browser.mjs`: riktiga musdrag i Chromium/WebGL i båda ingångarna, svart golv, snäppning, ångra/gör om/avbryt, frostad dörr, ZIP/omladdning, 390 px vy och FPS-rendering. Ingår i befintlig CI.
- Befintliga editor-, bygg-, möbel-, dörr- och projektregressioner behålls. Testresultat och publiceringskontroll redovisas i PR:n.
- Närbilder i `test-results/studio-floor-door/` jämför samma kamera och geometri före/efter, samt frostat glas stängt/öppet. Dessa är kontrollerade renderingar; de kompletterar de faktiska gränssnittstesterna.

Nästa uppdatering: [5.2 – flerval och kopiera/klistra in](design-studio-5.2.md).
