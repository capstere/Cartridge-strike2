# Matchinställningar i privata rum

Värden ändrar inställningarna före start i väntrummet. Välj karta och spelläge, sedan matchlängd och mål. Alla deltagare ser serverns bekräftade värden. Efter slutsignal öppnar **Spela igen** väntrummet med samma val. Det permanenta familjerummet sparar dem även när alla lämnar.

| Spelalternativ | Val | Standard |
| --- | --- | --- |
| Team Deathmatch, matchlängd | 3, 5, 10 eller 15 minuter | 10 minuter |
| Team Deathmatch, poängmål | 10, 25, 50 eller 100 fiendekills | 50 |
| Classic, poängmål | 3, 5 eller 8 rundvinster | 5 |
| Botar per lag | 0–5, separat för Analysts och Counter Analysts | 5 på lediga platser |

Värdet för botar är ett tak. Ett lag med tre människor och taket fem får två botar. Ett lag med tre människor och taket ett får en bot. Classic släpper in sena anslutningar vid nästa rundstart. En återanslutande spelare har kvar sin plats under den ordinarie återanslutningsfristen. Botarnas svårighetsgrader väljs som tidigare.

Floor 5 erbjuder båda spellägena. Compact Arena erbjuder Team Deathmatch. Lobbyn kommer ihåg inställningarna för respektive spelläge när värden växlar mellan lägena och banorna. Zombies och Dansmannen kan ändras oberoende i väntrummet på Floor 5.

Servern validerar värdena och låser värdens ändringar under nedräkning, spel och resultat. Familjens v1-fil får nya numeriska fält och behåller den tidigare botflaggan. En gammal fil får dagens standardvärden. Botflaggan `false` ger 0 på båda lagen. Vid rollback känner den äldre servern igen familjefilen och använder sina tidigare matchregler. En asymmetrisk botfördelning med minst en bot översätts då till fyllnad av lediga platser. Om den äldre servern skriver om filen behöver de nya värdena väljas igen vid uppgradering. En säkerhetskopia kan bevara exakt fördelning.

## Reproducera proven

```sh
node --import ./server/register-shared.mjs --test --test-concurrency=1 server/test/custom-match-settings.test.mjs server/test/family-lifecycle.test.mjs server/test/family-room.test.mjs
node tools/custom-match-browser.mjs
```

Webbläsarprovet använder en isolerad HTTPS/WSS-server, en skrivbordsprofil och en mobilprofil med emulerad touch. Det sparar skärmbilder och en JSON-rapport i `test-results/custom-match-settings/`. På Pi:n kan Chromium köras med `WAYLAND_DISPLAY=wayland-0 CHROMIUM_PATH=/usr/bin/chromium FPS_NETWORK_HEADED=1 FPS_NETWORK_ANGLE=gl-egl`.

På Pi 5 såg båda webbläsarna samma inställningar. Värden valde åtta rundvinster på Floor 5 och växlade sedan till Compact Arena med tre minuter, 25 kills samt en respektive tre botar. Touchklienten tog över som värd, startade matchen, såg tidsresultatet och spelade om. Testet kontrollerade den valda matchlängden innan klockan snabbades upp. Genom omstart av den isolerade servern bekräftades att familjen hade kvar sina val. [Classic på desktop](custom-match-settings/desktop-floor5-classic.jpg) · [Mobilvärd](custom-match-settings/mobile-compact-host.jpg) · [Mobilgäst](custom-match-settings/mobile-compact-tdm.jpg) · [Webbläsarkvitto](custom-match-settings/report.json)

Rollbackprovet körde den äldre installerade koden med en separat v1-fil. Den kunde läsa nya inställningar och tolka en asymmetrisk botfördelning som lediga botplatser i den äldre versionen. Efter en omsparning av den äldre servern använde den nya servern standardgränser och den äldre botflaggan vid nästa läsning. [Kompatibilitetskvitto](custom-match-settings/rollback-settings.json)

I ett separat prov lät två SDK-klienter Compact Arena gå hela den valda tiden med noll botar utan att ändra serverklockan. Båda fick resultatet oavgjort efter 180,07 sekunders uppmätt speltid. [Tidsgräns i realtid](custom-match-settings/natural-match.json)

Vid omkörningen av Floor 5-regressionen i dokumentations-PR:n hann den korta testmatchen ta slut innan omladdningen blev klar. Provet väntar nu på en bekräftad omladdning medan matchen är aktiv och låter sedan serverns ordinarie resultathantering avsluta tidsmatchen.

Via den publika familjelänken startade en emulerad touchklient på Compact Arena med tre minuter, tio kills och två botar hos Analysts samt tre hos Counter Analysts. Servern bekräftade skotten. Värden öppnade familjerummet igen med samma val, återställde familjens tidigare inställningar och lämnade. Servern hade noll öppna rum före bytet och efter provet. [Publikt familjeprov](custom-match-settings/live.json) · [Spelbild från liveprovet](custom-match-settings/live-compact.jpg) · [Aktivering och Floor 5-verifiering](custom-match-settings/activation.json)
