# Renderat spelprov på Raspberry Pi 5

Alla fyra matcherna gick till slutsignal. Den lokala mätversionen `7c73b3bfe621995af84e77ce2df2417fe1119088` har samma Git-träd som den publicerade [testrevisionen e3ba03d](https://github.com/capstere/Cartridge-strike2/commit/e3ba03d4ec2e4aeb361f3d64c3a183500d337643). Proven använde protokoll 13 och bygg-ID `09cc3fcc2f9ea016674b5b66be65716f0cf21c0df6deb432cff2f323717192a7` i Chromium 156.0.8078.79 med drivrutinen ANGLE (Broadcom, V3D 7.1.10.2, OpenGL ES 3.1).

[Strid, utslagning och återkomst med nio botar, 12,8 s](compact-arena.mp4) · [Från Blue Intake genom Pulse Chamber till Cryogenics, 18,0 s](compact-runda.mp4) · [Väntrummet](compact-lobby.jpg) · [Desktop](desktop-game.jpg) · [Pixel 7-emulering](mobile-game.jpg) · [Expanderad taktisk karta](compact-map.jpg)

Den 26 november 2026 aktiverades revision `75feffd9360da2380098bfea18f60df12713feff` medan rummen var tomma. Två officiella SDK-klienter verifierade Floor 5 via den publika domänen. På familjelänken startade en renderad klient och nio botar en match på Compact Arena. Manuell touch-eld sänkte magasinet från 30 till 28 på servern. Familjerummet öppnade samma karta vid nästa besök och de sju tidigare inställningarna återställdes. [Aktiveringsprovet](activation.json) · [Publikt spelprov](live.json) · [Skärmbild från familjematchen](live-compact.jpg)

| Bana och klient | Människoplatser + botar | Bildintervall, median/p95 | Ritanrop, median/p95 | Tickarbete, median/p95 | Tickintervall, median/p95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| [Compact, mobil](mobile.json) | 2 + 0 | 18,8 / 25,8 ms | 208 / 209 | 0,57 / 1,58 ms | 16,27 / 20,24 ms |
| [Compact, desktop](four.json) | 4 + 0 | 22,3 / 42,9 ms | 207 / 207 | 0,63 / 1,26 ms | 16,23 / 18,06 ms |
| [Compact, desktop](desktop.json) | 1 + 9 | 30,3 / 56 ms | 259 / 316 | 1,47 / 4,72 ms | 16,17 / 19,39 ms |
| [Floor 5, desktop](floor.json) | 1 + 9 | 60,7 / 79,8 ms | 1159 / 1409 | 1,5 / 7,16 ms | 16,19 / 20,2 ms |

Från tom inloggad klient till det första väntrummet på förvalda Floor 5 tog det 20,0–27,4 s från klicket för att ansluta, inklusive kall kartladdning. I tre separata rum tog bytet till Compact Arena 2,92 s på emulerad mobil och 3,71 respektive 4,75 s på desktop. Från Starta match till knappen Fortsätt tog det 1,53–1,58 s på Compact med testets ensekundsnedräkning.

Familjematchen med en spelare och nio botar slutade 12–14. Desktopklienten bekräftade högerklickssikte, förflyttning och eld på servern. Mobilklienten spelade från motsatt lag, flyttade sig 0,64 m med styrspaken och fick två skott bekräftade. En avsiktligt bruten mobilanslutning återtog platsen på Compact. De tre övriga människoplatserna i fyrspelarprovet anslöt efter kartbytet och fick rätt kartkontrakt. Alla klienter lämnade sina rum efter slutsignal och omspel till väntrummet.

Värden bytte efter omspel Floor 5 → Compact → Floor 5 → Compact i samma familjelobby. På Floor 5 upprepades 358 geometrier och 124 texturer i båda besöken. På Compact upprepades 153 geometrier och 66 texturer. Vid vart och ett av de fyra mättillfällena återstod exakt en nåbar och aktiv renderare efter skräpinsamling. En skadad nivåfil stoppade inträdet innan spel och frigjorde platsen. Samma familjelänk öppnade rätt karta när filen kunde hämtas igen.

Med nio botar tog 0 av 605 tickar på Compact mer än 33 ms. Högsta tickarbete var 14,78 ms. En av 604 intervall mellan tickstarter var längre än 33 ms. På Floor 5 nådde tickarbetet 45,35 ms i motsvarande prov. [Compact](desktop.json) · [Floor 5](floor.json)

Med `FPS_MAP_CASE=desktop FPS_MAP_SWITCH_PAIRS=8` växlade samma klient 16 gånger. Efter varje byte kunde Chromium nå exakt en renderare. Vid det sista bytet hade 17 av 18 skapade renderare frigjorts genom `dispose`. Geometrier, texturer och shaderprogram höll samma antal vid alla åtta återbesök per karta. Kartbytena tog 3,56–4,68 s till Compact och 8,45–8,71 s till Floor 5. [Samtliga 16 byten](stress.json)

Två separat inloggade Chromium-fönster spelade tre matcher utan botar. Båda renderade Compact Arena, det ena med tangentbord och mus och det andra med emulerad touch. För att pröva själva striden placerades spelarna inom sikt i Pulse Chamber. Båda såg samma slutresultat, 2–0 vid poänggränsen och därefter 1–0 och 0–0 vid tidsgränsen. Skott, död, återuppståndelse, omladdning, omspel och värdbyte passerade. Det första försöket utan synligt fönster nådde väntrummet och fick timeout vid Fortsätt. Det godkända provet använde Pi:ns EGL-drivrutin med synliga fönster. Kör `FPS_MATCH_MAP=compact-arena node tools/online-match-browser.mjs` med Pi-inställningarna nedan. [Duell med två renderade klienter](duel.json)

Den andra filmen följer en vanlig spelare med tangentbord och mus, från Blue Intake genom West Lock och Pulse Chamber till Cryogenics. De tre SDK-medspelarna stod kvar. Turen kördes i en extra match med samma spelbygge och `FPS_MAP_CASE=four FPS_MAP_TOUR=1`; bara testverktyget hade ett extra inspelningsval. [Turens spelkvitto](tour.json)

## Mätmetod

Chromium kördes på en Raspberry Pi 5 med V3D och ANGLE via Wayland. Spelserver, TLS-proxy och webbläsarstyrning kördes på samma Pi. Varje prov öppnade en ny webbläsarprofil och en isolerad spelserver. En normal webbläsarklient spelade genom HTTPS och WSS utan `?test`. Grafikkvaliteten var låg, enheten hade en rasterpixel per CSS-pixel och spelets vanliga adaptiva upplösning var aktiv. Mobilprovet använde Chromiums Pixel 7-profil, liggande 915 × 412 och emulerad touch.

Matcherna körde till den konfigurerade tidsgränsen på 45 s med en sekunds nedräkning och ett poängmål på 150. Efter Fortsätt gav provet spelet tre sekunder för uppvärmning, gjorde en riktig förflyttning och avfyrade det utrustade vapnet. Servern bekräftade både rörelse och minskad ammunition. Tiosekundersfönstret började sedan i aktivt spel. Laddtid avser tiden från valet i värdens kartväljare tills servern godkänt klientens kartkontrakt och webbläsaren ritat den valda LevelProject-världen.

Bildintervall mäts mellan två anrop där spelrenderaren faktiskt ritade en bild. Renderanropets tid mäts runt synkront JavaScript och kan inkludera väntan på drivrutinen. Antalet ritanrop kommer från Three.js efter världens och vapnets renderpass. Servertickens exekveringstid och intervallet mellan start av två tickar mäts var för sig. Filmfångst, skärmbilder, tvingad skräpinsamling och videokodning sker utanför mätfönstret. JSON-filerna innehåller urvalsstorlek, percentiler och extrema värden. Avsikligt stillastående SDK-medspelare fyller människoplatserna i två- och fyrspelarfallen.

Samma-karta-jämförelserna mäter Three.js-resurser i väntrummet efter upprepade byten. `reachableOwners` är antalet observerade renderare som fortfarande kan nås via svaga referenser efter Chromiums skräpinsamling. `liveOwners` räknar dem som ännu inte anropat `dispose`. De ger observationer från en kort följd av byten. Långtidsprov av heap, drivrutin och fysisk mobilprestanda återstår.

De körbara proven finns i [mätverktyget](../../../../tools/multimap-browser.mjs) och [nivåfotograferingen](../../../../tools/compact-arena-preview.mjs). I denna miljö sattes `CHROMIUM_PATH=/usr/bin/chromium`, `WAYLAND_DISPLAY=wayland-0`, `FPS_NETWORK_HEADED=1` och `FPS_NETWORK_ANGLE=gl-egl`. [Kommandon och arenaöversikt](../README.md)
