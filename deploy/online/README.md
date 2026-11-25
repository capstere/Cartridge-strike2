# Drift av den privata onlinereleasen

Spelet och Cloudflare kör som systemd-tjänster på Pi:n. MacBooken och Codex behövs
inte för drift. Originaltjänsten `cartridge-strike2` och port **2567** lämnas kvar.
Onlinetjänsten `cartridge-strike2-pilot` lyssnar endast på **127.0.0.1:2568**.
Namnet behålls för att återanvända den fungerande installationen.

## Status och loggar

```sh
cs2-online status
systemctl status cartridge-strike2-pilot cartridge-strike2-tunnel
journalctl --namespace=cartridge-strike2-online -u cartridge-strike2-pilot --since '15 minutes ago'
curl -fsS http://127.0.0.1:2568/health
sudo cs2-online verify
```

`verify` loggar in två separata officiella SDK-klienter genom den riktiga
HTTPS/WSS-adressen, skapar ett privat rum, väljer Redo/Start och verifierar rörelse,
skott och omladdning på den andra klienten. Klienterna lämnar och rummet städas.
Detta är protokollklienter, inte renderade eller fysiska spelare. Hälsosvaret
ensamt är inte ett godkänt speltest. Bevara minst en ledig rumsplats vid kontroll.

Tjänsternas journal har en egen namnrymd, högst 64 MB beständig och 16 MB tillfällig
lagring samt sju dagars retention. Råa tunnelmeddelanden med eventuella
WebSocket-token skrivs inte till journalen. Tvåminuterskontrollen bevakar både
spelserver och tunnelns readiness. Den ersätter inte gameplay-kontrollen.

## Uppdatera och återställ

Utgå från en granskad commit med godkända CI-kontroller i en separat checkout.
Spara inga inbjudningar eller tunneltoken i repot.

```sh
bash deploy/pilot/stage-release.sh
sudo cs2-online activate FULLSTÄNDIG_GIT_SHA
sudo cs2-online rollback
```

Aktiveringen väntar tills alla rum har stängts, även reserverade platser under
återanslutning. Den sparar tidigare release och privat konfiguration,
byter release atomärt, startar enbart onlinetjänsten och verifierar klient/server-
kontrakt samt publik multiplayer. Om kontrollen misslyckas återställs föregående
release. Konfigurationskopiorna ligger i
`/var/lib/cartridge-strike2-online/backups/` med root-åtkomst. Releaser tas inte
bort automatiskt. Den tidigare fungerande PASS 4-releasen ska behållas.

Vid den första installationen av driftverktygen, efter staging och när spelarna
har lämnat, installeras de granskade systemd-filerna från `deploy/pilot/` och
`deploy/online/journald.conf` som
`/etc/systemd/journald@cartridge-strike2-online.conf`. Kör `systemctl daemon-reload`.
Länka `/usr/local/bin/cs2-online` till den **versionsbestämda** releasefilen
`/opt/cartridge-strike2-pilot/releases/GIT_SHA/deploy/online/manage.py`.
Den länken ska inte gå via `current`: driftverktyget och dess officiella SDK ska
finnas kvar även vid återställning till den äldre piloten. Tjänsterna och
`cartridge-strike2-pilot-check.timer` ska vara enabled vid uppstart.

## Det permanenta familjerummet

På Jespers Pi går den fasta länken till `JESPERS-ROOM`. Serverns
inbjudningskod öppnar spelsidan, sedan öppnar det separata familjelösenordet
väntrummet. Dela de två koderna via en privat kanal. [Fast länk](https://cs2.capstere.com/room/JESPERS-ROOM)

Familjelösenordet ligger i `/etc/cartridge-strike2-pilot/family.env`, ägt av
root med behörighet 0600. Det finns på en rad med nyckeln
`CS2_FAMILY_ROOM_PASSWORD`. Läs filen med
`sudo cat /etc/cartridge-strike2-pilot/family.env` i en privat terminal.
Använd `sudoedit /etc/cartridge-strike2-pilot/family.env` för att byta
värdet till 24–64 tecken ur base64url. En separat slumpkod med 48 hextecken
går att skapa med `openssl rand -hex 24`. När `sudo cs2-online status`
visar noll rum och spelare, kör
`sudo systemctl restart cartridge-strike2-pilot`. Öppna den fasta länken
för att prova det nya lösenordet. Efter omstart anger spelarna
serverns inbjudningskod igen.

För första installationen läggs lösenordsfilen i samma privata
konfigurationskatalog som `invite.env`. Installera
`deploy/pilot/family-room.conf` som
`/etc/systemd/system/cartridge-strike2-pilot.service.d/family-room.conf`
och kör `sudo systemctl daemon-reload` före vanlig aktivering. Systemd skapar
familjerummets skrivbara tillståndskatalog med behörighet 0700. Servern sparar
spelläge, botfyllnad, botsvårighet, friendly fire och båda residentvalen i
`/var/lib/cartridge-strike2-family-room/settings.json`. Filerna ligger utanför
releasen. Ett rumsbyte eller en omstart skapar ett nytt väntrum med de sparade
valen. Byt lösenord utan att redigera inställningsfilen.

Den första spelaren som slutför anslutningen blir värd. Under ordinarie
15 sekunders återanslutningsfrist kan värden återta sin plats. När platsen
lämnas eller löper ut tar en ansluten spelare över. Värden väljer inställningar
i väntrummet. Familjerummet har en egen plats på servern utöver de två vanliga
rummen och startas när första behöriga spelaren ansluter. Det stängs efter
sista spelarens frånvaro och eventuella platsreservationer.

`sudo cs2-online rollback` byter till föregående revision när rummen är
tomma. Familjens konfiguration och sparade val finns kvar på Pi:n. Om den
föregående versionen är äldre än familjerumsfunktionen blir länken tillgänglig
igen när en version med funktionen aktiveras.

## Stabil adress: namngiven Cloudflare Tunnel

För installationen på Jespers Pi är den auktoriserade adressen
**https://cs2.capstere.com**. Domänen `capstere.com` bekräftades aktiv hos
Cloudflare den 18 november 2026. Den befintliga tunneln `cartridge-strike2-play`
ska publicera enbart detta värdnamn till `http://127.0.0.1:2568`, följt av en
`http_status:404`-regel. Tunnelns interna namn är inte speladressen. Ägaren valde
`cs2.capstere.com` innan aktivering; den förberedda `play`-posten tas bort efter
verifierat byte. Rotdomänen och andra DNS-poster ska lämnas orörda.

Verifiera först mot en separat loopbackprocess med samma release och fast public
origin. Den ordinarie Quick Tunnel kan fortsätta under förprovet. Kontrollera
DNS innan `configure-named` körs. Om hemroutern fortfarande svarar NXDOMAIN men
Cloudflare och Google redan returnerar rätt publika adresser kan driftkontrollen
köras med en separat resolver i en tillfällig systemd-mountnamnrymd. Bind då en
privat `resolv.conf` enbart till kontrollprocessen och dess SDK-barnprocesser.
Verifiera att värdens `/etc/resolv.conf` är oförändrad före och efter. Behåll
kontrollerna av TLS-certifikat, värdnamn, inloggning och WSS; hårdkoda inga IP-adresser.
Kontrollera ordinarie DNS igen och redovisa kvarstående fel separat. Ändra inte
Tailscale, router eller globala DNS-inställningar för att dölja det.
Aktiveringsresultat, kontrakt och verifieringsdata sparas privat på Pi:n i
`/var/lib/cartridge-strike2-online/` och redovisas i den aktuella migrations-PR:n.

HTTPS-kontrollen identifierar sig som `CartridgeStrike2-Readiness/1.0`.
Cloudflare kan neka Pythons standardsignatur med 1010; ändra inte brandvägg eller
Browser Integrity Check för att få mätningen att passera. Se
[Cloudflares rekommendation](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/error-1010/).

En Quick Tunnel har en slumpmässig adress och ett absolut slutdatum. Den är
**tillfällig**, även om systemd återstartar processen. Vi antar inte att operatören
äger en domän. En ny installation behöver en aktiv domän i ett auktoriserat
Cloudflare-konto innan den namngivna rutten kan aktiveras.

Den konkreta kontoåtgärden är att skapa en namngiven Cloudflare Tunnel med en
Published application-route för det valda värdnamnet till
`http://127.0.0.1:2568`. Spara dess connector-token i en privat fil på Pi:n med
behörighet 0600. Skicka inte tokenvärdet i chatt eller som kommandoradsargument.

```sh
sudo cs2-online configure-named https://DITT_AUKTORISERADE_VÄRDNAMN /privat/sökväg/tunnel-token
```

Kommandot kontrollerar att inga spelare är anslutna, säkerhetskopierar
konfigurationen och använder serverns befintliga fasta `CS2_PUBLIC_ORIGIN`.
Systemd `LoadCredential` lämnar token till cloudflared som fil. Ingen tidsgräns
eller Quick Tunnel används i den namngivna tjänsten. Efter omstart provas det
riktiga publika spelet. Ett fel återställer tidigare konfiguration. En återgång
till en Quick Tunnel kan ge en ny tillfällig adress, som då måste delas på nytt.
Den namngivna adressen beror fortfarande på aktiv DNS och ett fungerande
Cloudflare-konto; ingen domän eller tjänst köps av dessa verktyg.

Källor: [Cloudflares token-fil](https://developers.cloudflare.com/tunnel/reference/run-parameters/)
och [publicerade applikationsrutter](https://developers.cloudflare.com/tunnel/get-started/).

## Återkalla och stäng exponeringen

```sh
sudo cs2-online revoke
sudo cs2-online stop-public
```

`revoke` kräver att spelarna lämnar, byter serverinbjudan och startar om enbart
onlinetjänsten så att gamla sessionscookies också upphör. Den nya koden finns
bara i `/etc/cartridge-strike2-pilot/invitation.txt` (root, 0600); dela den privat.
`stop-public` stänger och inaktiverar tunneln utan att röra originalservern.
För omedelbar avstängning även under en match:
`sudo systemctl disable --now cartridge-strike2-tunnel`.
Återöppning görs med `sudo systemctl enable --now cartridge-strike2-tunnel`, följt
av `sudo cs2-online verify`. Kontrollera adressen igen om det fortfarande är en
Quick Tunnel. Lämna aldrig en tidigare inbjudningsfil som instruktion för en ny kod.
