# Det du behöver göra

## Nu — innan första Codex-passet

1. Öppna capstere/Cartridge-strike2 i Codex på datorn. Använd rätt repo: inte cartridge-strike och inte onboard.
2. Packa upp detta paket bredvid din lokala repomapp eller bifoga det till Codex. Klistra in prompts/01_FOUNDATION.txt. Om Codex inte kan läsa bilagan, lägg dokumenten under docs/multiplayer-plan/ i arbetskopian. Ersätt inte befintlig AGENTS.md eller HANDOVER.md.
3. Utgångsvalen är redan gjorda: webbläsarspel, privata matcher, PC/Mac först, två spelare först, tio som senare måltal, befintliga modeller och bana. Inga konton, ranking eller databas behövs i första versionen.
4. Ha två webbläsarfönster för lokal kontroll. För riktigt nätverkstest behöver du två datorer och en medspelare, helst också ett test där en spelare sitter på ett annat nätverk. Du behöver inte samla nya GLB-filer eller ljud.

Du behöver inte köpa server, domän eller installera originalprototypen för att Codex ska kunna börja. Första tre passen kan utvecklas och testas lokalt.

## Före pilot på Raspberry Pi

Originalpaketet föreslår Pi 5. Vi har inte verifierat din faktiska Pi, dess minne, operativsystem, kylning eller internetanslutning. Om du redan har den: använd den som pilotserver. Köp inte extra RAM utifrån påståendet att det behövs 16 GB; huvudfrågorna är CPU-tid per tick, nätverk och stabilitet.

Ordna:

- Raspberry Pi OS/Linux 64-bit, stabil ström och kylning, helst Ethernet.
- SSH-åtkomst från din egen dator. Behåll lösenord och nycklar privat.
- Stöd för en aktuell LTS-version av Node. Node 26 är LTS enligt kontrollerad officiell källa; Codex ska låsa och testa en specifik patchversion som också fungerar på Pi/ARM64. Originalrepots CI kör Node 22, vilket måste hanteras uttryckligen.
- En plats för serverrelease och en lokal miljöfil på Pi. Codex ska skapa installations- och uppdateringspaketet i pass 4.
- Två testdatorer och en avtalad kort spelsession, därefter en längre lastsession.

Fyll i följande utan hemligheter och ge till Codex inför pass 4:

| Uppgift | Ditt svar |
| --- | --- |
| Server: Pi hemma eller annan befintlig dator | |
| Modell, RAM, OS och 64-bit/ARM64 | |
| Trådbundet nätverk eller Wi-Fi | |
| Ungefärlig uppladdningshastighet | |
| Kan du ansluta via SSH? ja/nej | |
| Har du redan Cloudflare/domän? ja/nej/okänt | |
| Testdatorer och webbläsare | |

## Publicera för inbjudna spelare

Codex ska först leverera ett verifierat releasepaket och exakta kommandon för just din valda driftmiljö. Kör inte två olika installationsguider ovanpå varandra.

- Spelklienten kan fortsätta ligga på GitHub Pages. Pages kör inte Node-servern.
- Quick Tunnel räcker för ett tillfälligt test, utan domänköp. Adressen är tillfällig; återanslutning och ändrad adress måste hanteras.
- För återkommande test väljer ni stabil tunneladress eller en separat host med WSS. Valet ska baseras på uppmätt nätverkslatens och driftbehov.
- Rumskod och eventuella tunnel-token stannar i privata miljövariabler på servern. De ska inte ligga i ZIP som publiceras, repo, klientkod eller delad URL.
- Server-URL är inte en hemlighet. Dela klientlänk och rumskod separat med medspelaren.

Det som du testar manuellt: gå och sikta samtidigt, skjut på varandra, ladda om, dö/respawna, öppna pausmenyn, lämna/anslut igen och jämför båda skärmarna. Kontrollera att den andre fortsätter spela när du öppnar menyn.

## Senare

Om Pi eller hemnätet inte klarar mätkraven: flytta samma serverpaket till en närliggande VPS eller managed Colyseus-host. Byt inte spelmotor av det skälet. Mobiltest, botutfyllnad, Classic med bomb/gisslan och egna karaktärer läggs till efter att kärnan är stabil.
