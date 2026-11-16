# Källor och avgränsning

Kontrollerat 2026-11-16. Repo via GitHub-anslutningen, publicerad main vid commit c794a0331e4d3d34cd3d0a01daba0804e14adce3. Alla paths i granskningsrapporten gäller denna version. Main kan ändras efter granskningen.

## Repokällor

- [Granskad commit](https://github.com/capstere/Cartridge-strike2/commit/c794a0331e4d3d34cd3d0a01daba0804e14adce3)
- [AGENTS](https://github.com/capstere/Cartridge-strike2/blob/c794a0331e4d3d34cd3d0a01daba0804e14adce3/AGENTS.md)
- [HANDOVER](https://github.com/capstere/Cartridge-strike2/blob/c794a0331e4d3d34cd3d0a01daba0804e14adce3/HANDOVER.md)
- [Game](https://github.com/capstere/Cartridge-strike2/blob/c794a0331e4d3d34cd3d0a01daba0804e14adce3/src/fps/game.mjs)
- [App](https://github.com/capstere/Cartridge-strike2/blob/c794a0331e4d3d34cd3d0a01daba0804e14adce3/src/fps/app.mjs)
- [World](https://github.com/capstere/Cartridge-strike2/blob/c794a0331e4d3d34cd3d0a01daba0804e14adce3/src/fps/world.mjs)
- [Physics](https://github.com/capstere/Cartridge-strike2/blob/c794a0331e4d3d34cd3d0a01daba0804e14adce3/src/fps/physics.mjs)
- [Level adapter](https://github.com/capstere/Cartridge-strike2/blob/c794a0331e4d3d34cd3d0a01daba0804e14adce3/src/fps/level-adapter.mjs)
- [Levels manifest](https://github.com/capstere/Cartridge-strike2/blob/c794a0331e4d3d34cd3d0a01daba0804e14adce3/levels/manifest.json)
- [Measured performance](https://github.com/capstere/Cartridge-strike2/blob/c794a0331e4d3d34cd3d0a01daba0804e14adce3/docs/measured-performance/README.md)

Även hämtade för granskning: README, docs/README, docs/roadmap, fps-regression.yml, config, match-flow, combat-flow, doors, destructible-glass, render och character-actors. Hela repots sökvägsträd inventerades; detta är en riktad multiplayerarkitekturgranskning, inte en fullständig granskning av varje asset och kodrad. Den stora prepared-mapfilens geometri byggdes inte här; manifestet och dess runtime-laddningsväg verifierades.

## Officiella tekniska källor

- [Colyseus 0.18 netcode](https://docs.colyseus.io/netcode) — auktoritet och ramverkets nätkodsfunktioner.
- [Server input/fixed timestep](https://docs.colyseus.io/netcode/server-input) — startpunkt för API-spiken.
- [Client prediction](https://docs.colyseus.io/netcode/client-prediction) — prediction/reconciliation.
- [Lag compensation](https://docs.colyseus.io/netcode/lag-compensation) — ramverkets historik/rewind-stöd; spelets kollisionsvärld måste fortfarande integreras korrekt.
- [Migration 0.18](https://docs.colyseus.io/migrating/0.18) — API-ändringar; kontrollera valt patchnummer.
- [Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) — tillfällig utvecklings-/testtunnel, inget konto eller domän krävs för grundtest.
- [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages) — statisk hosting, separat spelserver behövs.
- [Node 26 LTS](https://nodejs.org/en/blog/release/v26.13.0) — LTS-status; exakt installations- och beroendekompatibilitet ska verifieras i Codex-passet.

Arkitekturval, föreslagna tick-/patchfrekvenser, kapacitetsbudgetar och passindelning är rekommendationer från denna granskning, inte garanti från ramverkens dokumentation.

## Utfört här

- Läste samtliga 11 filer i uppladdad ZIP.
- Hämtade repoträd och relevanta källfiler från ovanstående fasta commit.
- Körde ZIP:s sex Node-logiktester: 6 PASS, 0 FAIL.
- Körde två rena logikreproduktioner: gammal skottriktning före tick och träff utanför synlig kropp. Resultaten dokumenteras i 02_GRANSKNING.
- Kontrollerade aktuella officiella dokumentationssidor.
- Skapade och validerade det nya ZIP-paketets filer och interna hänvisningar.

## Inte utfört här

Ingen installation/start av Colyseus, inget tvåklientstest, ingen körning av hela repots regressionssvit, inget WebGL-speltest, ingen Pi-/ARM64-lastmätning, ingen tunneldeployment och ingen fysisk mobilkontroll. Originalets versionskombination är inte runtimeverifierad. Det nya paketet är en konkret arbetsplan, inte levererad multiplayerkod.

Ingen ändring av GitHub-repot eller dess publicerade spel har gjorts.
