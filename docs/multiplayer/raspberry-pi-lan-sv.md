# Raspberry Pi 5 — två spelare på LAN

För Pi 5 / 16 GB, Bookworm ARM64, Node **26.13.0**, befintlig checkout och
systemd-tjänsten **cartridge-strike2**. Kör först när PASS 3A.2-PR:n har mergats
till main. Ingen Pi-tjänst har ändrats eller startats om under utvecklingen.

HTTP och WebSocket använder **samma privata IP och port**. Rumskoden kontrollerar
inträde; Host/Origin begränsar webbläsaranrop. HTTP/WS är okrypterat: använd bara
ett betrott hem-/kontorsnät och en separat spelkod, aldrig ett personligt lösenord.
Ingen publik bindning, routerändring, tunnel eller portvidarebefordran behövs.

## Förbered uppdateringen

Kör följande i **Bash på Pi:n**, som användaren som äger checkouten. Behåll samma
terminal och variabler genom uppdatering/verifiering. `ExecStart` ska redan starta
det här repots `server/local-server.mjs` (direkt med `--import register-shared.mjs`
eller via `npm start --prefix server`). Om den startar en annan server, avbryt
och anpassa inte den befintliga tjänsten efter gissningar.

```bash
systemctl cat cartridge-strike2
systemctl show cartridge-strike2 -p User -p WorkingDirectory -p ExecStart
node --version
uname -m
ip -4 -brief address show scope global

CS2_WORK=$(systemctl show cartridge-strike2 -p WorkingDirectory --value)
CS2_REPO=$(git -C "$CS2_WORK" rev-parse --show-toplevel)
cd "$CS2_REPO"
test "$(node --version)" = v26.13.0 || { echo 'Fel Node-version'; exit 1; }
test "$(uname -m)" = aarch64 || { echo 'ARM64 förväntas'; exit 1; }
test -z "$(git status --porcelain)" || { echo 'Checkouten har lokala ändringar'; exit 1; }
git fetch origin main
CS2_OLD=$(git rev-parse HEAD)
CS2_NEW=$(git rev-parse origin/main)
git cat-file -e "${CS2_NEW}:server/access.mjs" || { echo 'PASS 3A.2 saknas på main'; exit 1; }
CS2_BACKUP=$(mktemp -d "$HOME/cartridge-strike2-rollback.XXXXXX")
printf '%s\n' "$CS2_OLD" > "$CS2_BACKUP/commit"
printf '%s\n' "$CS2_REPO" > "$CS2_BACKUP/repo"
CS2_DROP=/etc/systemd/system/cartridge-strike2.service.d/60-pass3a2-lan.conf
if sudo test -f "$CS2_DROP"; then
  sudo cp -a "$CS2_DROP" "$CS2_BACKUP/60-pass3a2-lan.conf"
fi
printf 'Rollback finns i: %s\n' "$CS2_BACKUP"
read -r -p 'Pi:ns privata IPv4 från listan ovan: ' CS2_IP
```

Välj exempelvis `192.168.1.50`, inte `0.0.0.0` eller en publik adress. Behåll
adressen i routerns DHCP-reservation om möjligt; ändras den måste även denna
inställning ändras. Programmet vägrar starta om adressen inte är tillåten eller
inte finns på Pi:n. Den befintliga serviceanvändarens Node/PATH ska motsvara
26.13.0 även om din interaktiva terminal använder en versionshanterare.

## Uppdatera och starta

Detta **avbryter pågående matcher**. Kör blocket efter att båda lämnat. Det
använder en fast main-commit i checkouten; ingen lokal branch skrivs om.

```bash
sudo systemctl stop cartridge-strike2
if git switch --detach "$CS2_NEW" &&
   npm ci --prefix server --ignore-scripts &&
   npm run build --prefix server -- --check &&
   node tools/verify-owner-runtime.mjs &&
   CS2_LAN=1 CS2_LAN_HOST="$CS2_IP" node --input-type=module -e \
     'import {configFromEnv} from "./server/access.mjs"; configFromEnv(process.env)'; then
  sudo install -d -m 755 /etc/systemd/system/cartridge-strike2.service.d
  printf '[Service]\nEnvironment="CS2_LAN=1"\nEnvironment="CS2_LAN_HOST=%s"\nEnvironment="PORT=2567"\n' "$CS2_IP" |
    sudo tee "$CS2_DROP" >/dev/null
  sudo systemctl daemon-reload
  sudo systemctl restart cartridge-strike2
else
  echo "Uppdateringen stoppades. Kör rollback nedan. Backup: $CS2_BACKUP"
fi

systemctl is-active cartridge-strike2
sudo journalctl -u cartridge-strike2 -n 40 --no-pager
sudo ss -ltnp 'sport = :2567'
curl --fail --silent --show-error "http://$CS2_IP:2567/health"
printf '\nSpela: http://%s:2567/fps/?network=lan\n' "$CS2_IP"
```

Verifiera `lan:true`, rätt `host`, `floor5-prepared`, samt lyssning på just din
privata IP, **inte** `0.0.0.0`/`[::]`. Hälsosvaret visar kontraktets build/map-hash
och antal rum/spelare; det bevisar inte att WebSocket eller spelet fungerar.
Miljöfilsexemplet laddas inte av `npm start`; systemd får inställningarna genom
drop-in-filen ovan. Ingen ny tjänst installeras. Om din befintliga unit använder
`EnvironmentFile` med samma variabelnamn har den filen företräde: ta bort de
konflikterande namnen där innan du startar, och spara filen för rollback först.

## Spela och verifiera på Mac och iPhone

1. Öppna den utskrivna **HTTP-länken från Pi:n** på båda enheterna, i vanliga
   webbläsarflikar. Använd samma Wi-Fi/LAN; gästnät med klientisolering fungerar
   inte. GitHub Pages-länken ska inte användas mot Pi:n.
2. På Mac: fyll i namn och en privat kod (6–64 bokstäver/siffror/bindestreck),
   välj **Skapa rum**. På iPhone: skriv samma kod och det exakta rums-ID som
   visas på Macens HUD/meny, välj **Anslut**. Tryck **Fortsätt** på båda.
3. Mac/Windows: WASD, mus, vänsterklick, R, Space, Ctrl och Shift. Escape öppnar
   menyn och släpper musen. Fortsätt kräver ett nytt klick för muslås/ljud.
   Helskärm är frivilligt: välj **Aktivera helskärm** i menyn och sedan Fortsätt.
   iPhone/Android: liggande skärm, vänstertumme för
   rörelse, högertumme för sikte, ELD/LADDA/HOPP/HUKA. Safari kan sakna vanlig
   helskärm; spelet fungerar i fliken med säkra skärmkanter.
4. Möt varandra på Floor 5. Prova samtidiga rörelser, sikte, skott, omladdning,
   dörrar, träffar, död/respawn och poäng. När en spelare öppnar menyn fortsätter
   den andra och servern; den pausade spelaren är fortfarande sårbar.
5. Rotera, byt app och återvänd. Tryck Fortsätt och kontrollera ljudet. Bryt
   Wi-Fi kort och anslut igen. Efter ett avbrott krävs **explicit återanslutning**;
   ingen poäng-/platsgaranti ges. Efter serveromstart skapas ett nytt rum.

`rooms:0` efter att båda lämnat är slutkontrollen. Vid fel: läs lobbyfelet och
`journalctl` ovan. Kontrollera IP, Wi-Fi-isolering och eventuell befintlig lokal
brandvägg. Stäng inte av webbläsarsäkerhet eller brandvägg för att få det att gå.
En vanlig driftomstart är `sudo systemctl restart cartridge-strike2`.

## Rollback (kod, beroenden och LAN-inställning)

Om du öppnat en ny terminal: sätt `CS2_BACKUP` till den utskrivna backupmappen.
Återställ även en eventuell EnvironmentFile som du själv ändrade.

```bash
CS2_REPO=$(cat "$CS2_BACKUP/repo")
CS2_OLD=$(cat "$CS2_BACKUP/commit")
CS2_DROP=/etc/systemd/system/cartridge-strike2.service.d/60-pass3a2-lan.conf
cd "$CS2_REPO"
test -z "$(git status --porcelain)" || { echo 'Spara lokala ändringar först'; exit 1; }
sudo systemctl stop cartridge-strike2
git switch --detach "$CS2_OLD" && npm ci --prefix server --ignore-scripts || exit 1
if sudo test -f "$CS2_BACKUP/60-pass3a2-lan.conf"; then
  sudo cp -a "$CS2_BACKUP/60-pass3a2-lan.conf" "$CS2_DROP"
else
  sudo rm -f "$CS2_DROP"
fi
sudo systemctl daemon-reload
sudo systemctl restart cartridge-strike2
systemctl is-active cartridge-strike2
sudo journalctl -u cartridge-strike2 -n 30 --no-pager
sudo ss -ltnp 'sport = :2567'
curl --fail http://127.0.0.1:2567/health
```

Sista URL:en gäller din tidigare localhost-tjänst. Om backupen redan använde LAN,
använd dess tidigare privata IP. För att återgå till localhost med den **nya**
koden, sätt `CS2_LAN=0` och `CS2_LAN_HOST=127.0.0.1` i drop-in-filen, ladda om
systemd och starta om; andra enheter kan då inte ansluta.

**Valideringsgräns:** automatiserade Mac/Linux/Windows- och mobilwebbläsarprov
redovisas separat i [PASS 3A.2-rapporten](pass3a2-lan.md). Ingen fysisk Pi,
iPhone, Android eller Wi-Fi-förbindelse mellan två fysiska enheter har verifierats
av utvecklingsmiljön. Anteckna modell, OS, webbläsare, säker skärmkant, ljud och
resultat från din spelsession. Detta ändrar inte den befintliga mobilbackloggen.
