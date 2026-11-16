# Cartridge-Strike 2: vägen till multiplayer

Granskad 16 november 2026. Repo: capstere/Cartridge-strike2.
Bas: c794a0331e4d3d34cd3d0a01daba0804e14adce3 (main, PR #14).

## Beslut
Ja, Colyseus + separat spelserver är rätt riktning. Den gamla ZIP-filen är ett nätverksexperiment, inte en färdig multiplayerport av ditt spel. Använd den som referens, inte som grund för en andra permanent spelmotor.

Behåll Three.js, spelets utseende, modeller, ljud och den befintliga rörelse-/kollisionslogiken. Lägg till en headless Node.js-server med Colyseus och en tydlig gräns mellan simulering och presentation. Servern bestämmer position, träffar, hälsa, ammunition och matchresultat. Klienten förutsäger egen rörelse för omedelbar respons.

Första spelbara målet: två riktiga spelare i en privat match, två lag, ett gemensamt vapen, respawn och poängtavla. Börja på befintliga synthetic-demo som tekniskt test; leveransen ska sedan fungera på den riktiga publicerade floor5-prepared. Öka till fyra och därefter tio spelare endast efter mätning. Det är ett förenklat online-lagläge inspirerat av Endless, inte en fullständig nätverksport av Endless.

## Läsordning

1. **01_DINA_FORBEREDELSER.md** — vad du behöver ordna; inget programmeringsarbete krävs.
2. **02_GRANSKNING.md** — konkreta fynd i ZIP och repo.
3. **03_ARCHITECTURE.md** — tekniskt kontrakt för Codex, på engelska.
4. **04_ACCEPTANCE_AND_OPERATIONS.md** — hur fungerande och optimerat ska bevisas.
5. **prompts/** — fyra avgränsade Codex-pass, körs i nummerordning.
6. **05_KALLOR_OCH_GRANSKNINGSGRANS.md** — källor och vad som faktiskt kontrollerats.

Starta Codex med prompts/01_FOUNDATION.txt. Ge Codex åtkomst till repot och detta uppackade paket. Låt det slutföra och dokumentera varje pass före nästa. Kör inte alla fyra parallellt.

Detta är ett granskat implementations- och förberedelsepaket. Det innehåller inte en färdig ny multiplayerimplementation. Inga repoändringar, deploymenter eller köp har gjorts i denna granskning. Original-ZIP ligger oförändrad i reference/ för spårbarhet; dess installationsguide ersätts av planen här.
