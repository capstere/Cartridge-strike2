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

Aktiveringen kräver ett tomt rum, sparar tidigare release och privat konfiguration,
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

## Stabil adress: namngiven Cloudflare Tunnel

En Quick Tunnel har en slumpmässig adress och ett absolut slutdatum. Den är
**tillfällig**, även om systemd återstartar processen. Vi antar inte att operatören
äger en domän. Den permanenta adressen kräver en aktiv domän i ett auktoriserat
Cloudflare-konto; tills den finns är denna del **INTE AKTIVERAD**.

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
