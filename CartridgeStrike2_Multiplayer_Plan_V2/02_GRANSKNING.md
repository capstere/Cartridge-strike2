# Teknisk bedömning

## Original-ZIP: samtliga 11 filer lästa

Arkivet innehåller 16 poster, varav 11 filer. Filernas storlekar och SHA-256 finns i reference/original-file-inventory.json. Alla sex inkluderade Node-tester passerade här. De provar geometri/logik, inte en startad Colyseus-server eller två nätverksklienter. Testet med namnet “all spawn points are reachable” kontrollerar endast att spawnpunkterna inte är blockerade, inte att det finns en väg mellan dem.

| Del | Bedömning / åtgärd |
| --- | --- |
| README.md | Bra introduktion till separat server och statisk klient. Påståenden om full drift och Pi-kapacitet är inte verifierade av testerna. Behåll drifttanken, ersätt implementationsordningen. |
| server/server.mjs | Serverägd rörelse, skada, cooldown och respawn är rätt. Men snapshot sänds som full egen meddelandelista var 50 ms, utan tick/ack/life-ID. Inte Colyseus Schema-deltas. |
| server/arena-logic.mjs | Ren logik, normaliserad rörelse och enkel väggocklusion är bra. Separata lådor och annan kroppsstorlek än spelet gör den olämplig som permanent fysikmotor. |
| server/test/arena.test.mjs | Sex godkända enhetstester. Saknar protokoll, join, disconnect, återanslutning, samtidiga skott, verklig webbläsare och last. |
| server/package.json | Exakt Colyseus direktversion, men ingen lockfil. engines >=24 skiljer sig från README:s Node 26. Lås hela beroendeträdet och testa klient/server ihop. |
| server/.env.example + .gitignore | Separata hemligheter är rätt. `npm start` laddar inte automatiskt .env i den levererade koden; systemd-guidens EnvironmentFile gör det i just den driftvägen. Dokumentera båda vägarna. |
| server/install-service.sh | Rimlig systemd-startpunkt men inte körd här. Kontrollera installationssätt, sökvägar, exekveringsrättighet, hälsa och rollback på målmaskinen. |
| client/multiplayer/main.mjs | Fristående Three.js-demo, inte återanvändning av spelets FPS-klient. Egen kamera väntar på serverposition och mjukas mot den: märkbar extra rörelsefördröjning. |
| client/multiplayer/index.html | Lokal Three.js men SDK från extern CDN. Installera och paketera testad SDK reproducerbart. |
| client/multiplayer/style.css | Separat test-UI. CSS för liten skärm är inte fulla touchkontroller. Återanvänd spelets presentation i slutmålet. |

### Verifierade brister i prototypen

- **Skott använder gammalt sikte.** input-meddelandet uppdaterar `p.input`; först nästa `movePlayer` överför yaw/pitch till spelaren. `fire` körs direkt i meddelandehanteraren och kan använda föregående riktning. Ren logikreproduktion här missade före tick och träffade efter tick med samma nya indata. Skott ska knytas till den validerade inputram där det avfyrades och behandlas i simulationens ordning.
- **Träffvolymen matchar inte avataren.** Synlig kropp är 0,65 m bred, träffsfären har radie 0,7 m. Ett skott 0,5 m från kroppens centrum träffade i logikprovet trots att det ligger utanför synlig halvbredd 0,325 m. Återanvänd avsedd hitbox från spelet och gör den visuellt testbar.
- **Respawn saknar diskontinuitetssignal.** `receivedSpawn` sätts bara första gången. Senare position mjukas från dödsplats till spawn och kamerans yaw återställs inte uttryckligen. Lägg till lifeId/spawn-event och töm gamla input-/interpoleringsbuffertar.
- **Disconnect lämnar gamla aktörer kvar i scenen** fram till eventuell ny snapshot. Rensa scen, input, callbacks och buffertar vid leave; prova upprepade anslutningar.
- **Gemensam rumskod är inte ett exakt rumsval.** `joinOrCreate('arena')` kan skapa ett till rum när första är fullt. Serverbestämd roomId och uttrycklig “fullt”-hantering behövs om alla ska spela tillsammans.
- **Ingen tidsbuffrad fjärrinterpolering eller prediction/reconciliation.** Lerp till senaste position är bara visuell utjämning.
- **50 ms callback är inte bevis på fast simuleringssteg.** Den skickar vidare verklig delta och klampar rörelsen; ersätt med ett fast, begränsat stegupplägg.
- Origin-kontrollen är villkorlig och saknad origin tillåts. Rumskoden är det verkliga inträdesskyddet. Prova CORS, HTTP-matchmaking, WebSocket-upgrade och payloadgränser i verklig server; anta inte att onAuth automatiskt löser alla transportlager.

## Repot: bra återanvändbar grund, men singleplayer-antaganden

Granskad main-commit: c794a0331e4d3d34cd3d0a01daba0804e14adce3.

| Befintlig plats | Observerat | Multiplayerarbete |
| --- | --- | --- |
| src/fps/game.mjs: Game.player, start, step | En isPlayer, nio botar; step tar en input; övriga aktörer styrs av bot | Inför controllerType och serverägd session → actorId. Input per aktör. Lokal kameraidentifiering hör till klienten. |
| game.mjs: difficultyProfileFor, damage | Svårighet/lagrelaterad logik utgår från den lokala spelarens lag; botskada kan reduceras mot isPlayer | Samma skaderegler för alla människor. Bottuning får inte ändra PvP-skada. |
| game.mjs: moveActor | Återanvändbar rörelse, hopp, hukning; intern moveWorld kan skriva rörelsedelta | Whitelist nätverksinput. Acceptera aldrig moveWorld, position, damage eller klientvald dt. |
| src/fps/config.mjs | fixedStep 1/60, radie 0,20, höjd 1,70; gemensamma vapendata | Behåll samma kontrakt server/klient; prototypens radie 0,36 och sfär 0,7 ska inte ersätta detta. |
| src/fps/app.mjs | DOM/input/render/audio och direkt Game-kontroll; paus/köp stoppar Game | Inför LocalSession/NetworkSession-adapter; menyer stoppar bara lokal input online. |
| app.mjs: frame | Renderingens budget och synlighet kan stoppa den lokala uppdateringen | Serverklocka måste leva oberoende av rendering och bakgrundsflikar. |
| app.mjs: scoreboard / killfeed | Namn byggs delvis in i HTML; idag lokala aktörer | Använd textContent/säker rendering för nätverksspelarnas namn. |
| app.mjs: selectedLevel + levels/manifest.json | Default är floor5-prepared, inte den gamla direktgenererade classic-floor5 | Servern väljer publicerad karta och hash; klienten måste matcha. localStorage-preview tillåts inte i första onlineversionen. |
| src/fps/world.mjs | createWorld har delade world-/level-cacher; dörrar/glas muteras | Egen mutable world per rum. Dela endast uttryckligen immutabla resurser. `fresh:true` är en startpunkt, inte bevis att alla transitiva cacher är isolerade. |
| src/fps/physics.mjs | Three-matematik, Capsule/Octree och spatial index | Kör i headless Node; Three-matematik är okej, WebGL och DOM är inte okej. Verifiera alla importer. |
| src/fps/level-adapter.mjs | Omvandlar LevelProject till fysik-/världsdata; beroenden i furniture-editor | Behåll dessa delade moduler. Namnet editor betyder inte oanvänd kod. |
| doors.mjs + destructible-glass.mjs | Dörrpose och trasiga rutor påverkar fysisk framkomlighet | Serverägt tillstånd med full snapshot vid join/återanslutning. Händelser ensamma räcker inte. |
| render.mjs + character-actors.mjs | Presentation/aktörsmodeller kan återanvändas | Rendera fjärraktörer utifrån replikerat tillstånd; kör inte deras egna lokala spelregler. |
| HANDOVER.md | Aktiv uppgift är fysisk mobilkontroll; tidigare browser-/simuleringskontroller dokumenterade | Bevara uppgiften. Multiplayer är ett separat uttryckligt uppdrag, inte tillåtelse att radera mobilbackloggen. |
| .github/workflows/fps-regression.yml | Befintlig Node- och browserkontroll | Utöka med multiplayer, bevara offline-regression och runtime-hashkontroll. |

## Vad passar bäst?

| Alternativ | Beslut |
| --- | --- |
| Colyseus + Node + befintlig motor | Rekommenderat. Rum, anslutningslivscykel och nätkod kan nyttjas utan ny grafikmotor. |
| Bygga vidare på ZIP som separat fullständigt spel | Nej. Två fysik-/vapen-/UI-system skulle behöva underhållas och sedan slås ihop. |
| Egen ren WebSocket-server | Möjligt, men mer eget arbete med rum, återanslutning och replikering. Ingen verifierad fördel här. |
| WebRTC med en spelares dator som auktoritet | Inte förstaval för detta FPS: värdberoende, avbrott och egen synk-/migrationslogik. |
| Databas som realtidsmotor | Fel ansvarsfördelning för rörelse/träffar. Eventuell statistikdatabas kommer senare. |
| Byta till Godot för denna uppgift | Separat produktbeslut, inte nödvändigt för multiplayer i detta webbrepo. |
| Pi + tunnel | Bra pilot om du redan har Pi. Inte verifierad tioplayerserver. |
| VPS/managed server | Nästa driftalternativ när nätverk eller Pi begränsar testet; samma spelprotokoll. |

Bäst första spelläge: förenklat tvålagsspel med respawn och ett vapen. Classic kräver också ekonomi, rundprioritet, bomb, gisslan och åskådarläge. Co-op/zombies kräver server-AI och fler replikerade aktörer. Båda blir större första leveranser.
