# Landning efter en dödande huvudträff

[Se filmen med båda originalfigurerna](landning-fore-efter.mp4). Vänster bild visar den levererade pilotbanken med dess tidigare golvspärr. Höger bild visar den justerade animationen. Figurer, kläder, skor, kamera och tidpunkt är desamma inom varje bildpar. Filmen spelades in i en lokal provscen med spelets figurbyggare. Den är 8,55 sekunder lång.

## Kontakt med golvet

Händerna var den lägsta punkten i den tidigare slutposen. När hela kroppen lyftes över golvet lämnade det ungefär en decimeter under ryggen. Landningen är nu inbakad i respektive bank. Överarmar och underarmar vrids så att handskarna kan vila på underlaget. Bäcken, rygg, nacke och ben fördelar stödet mellan överkroppen och hälarna.

| Avstånd till golvet i slutpose, millimeter | Rygg | Bäcken | Vänster / höger handske | Vänster / höger sko |
| --- | ---: | ---: | ---: | ---: |
| Man, pilot | 91 | 106 | 0 / 53 | 113 / 99 |
| Man, färdig | 2 | 3 | 2 / 2 | 5 / 2 |
| Kvinna, pilot | 102 | 80 | 0 / 50 | 105 / 89 |
| Kvinna, färdig | 3 | 2 | 3 / 3 | 2 / 2 |

Mätningen använder de synliga, animerade hörnpunkterna efter spelets skalanpassning. Ryggmåttet inkluderar jackans rygg och ryggutrustningen. Båda figurerna bär spelets individanpassade skor och ordinarie utrustning. Vid sampling med 120 Hz över 2,5 sekunder var lägsta punkten över golvet i samtliga bilder, med minsta marginal 0,4 mm för mannen och 0,7 mm för kvinnan.

Båda bankerna har kvar klippets 25 spår och 76 nyckeltider. De första 28 nycklarna genom 0,90 sekunder är byteidentiska med piloten i alla spår. Både `hand_l` och `hand_r` är byteidentiska genom hela klippet. Det fokuserade regressionstestet kontrollerar de ursprungliga kontrollsummorna, båda figurernas luftfas och markkontakten i den färdiga posen. [Regressionstest för animationsbankerna](../../tools/headshot-landing.test.mjs)

## Uppspelning med vapen

Chromium 156 på Raspberry Pi 5 körde spelets riktiga figurbyggare och uppspelningskod. Proven använde AR47 och den manliga originalfiguren, P9 och den kvinnliga originalfiguren samt shotgun och en sparad kompatibel kortärmad karaktär. Samtliga började från stående, löpande eller hukande pose. Vid övergångens första bild stämde bäckenets och vapenhandens position med den sista levande bilden inom mätprecisionen. Den lägsta punkten på kroppen vid 0,60 sekunder var 1,42–1,43 m. Utrustningsväskan följde bäckenet genom luftfasen. I slutposen låg både väskans och vapnets lägsta punkt 4 mm över golvet. Kroppens position var stabil mellan 2,50 och 4,00 sekunder. Alla tre återgick till levande pose och följde likens 18-sekundersgräns.

Ett separat väggprov placerade planet 55 cm bakom spelarens centrum och mätte den verkliga kroppen och vapnet med 60 Hz. Uppspelningens första bild behöll både kroppens och vapnets position från den levande posen. Efter den 180 ms långa övergången nådde mannen som mest 30 cm mot väggen, kvinnan 31 cm och den sparade karaktären 44 cm. Vapnen stannade inom 40 cm. Den snäva placeringen exponerade redan före döden ett utstick på 15 cm för den springande mannens bakre sko och 9 cm för den sparade figurens shotgun. Under övergångens första 67 ms nådde den sparade figurens vapen ytterligare 4 cm in i väggen. Det kom fritt innan övergången avslutades.

Mobilvyn emulerade touch i liggande 844 × 390 på Chromium med SwiftShader. Fysisk iPhone och Android återstår.

## Kostnad för sex samtidiga lik

Pi 5 körde samma sex modeller i ett isolerat klientprov med plan fri golvyta, tre P9 och tre AR47. Varje simulerat bildsteg på 1/60 sekund anropade renderarens `corpsePose` för alla sex. En serie om 241 steg värmde upp JavaScript och modeller. Tabellen omfattar fyra ytterligare serier om 241 steg. Klockan omslöt bara uppdateringen av de sex liken. GPU-ritning, serverns tickar och nätverkstrafik ingick inte. Webbläsarklockans upplösning var 0,1 ms.

Baslinjen använde PR #40, revision `5f740bf`, bygg `e1bb12c95cf06c597739e3d8f4d0b6014e23e7f05d0469ccbe47ebc387cd6976`. Alla sex spelade Death01. Den mätta kandidaten använde bygg `5a438af3b9d8d19fa82b045f6fb1483261c43b81737c4796ce8be21c112d5376`. Alla sex spelade huvudträffsklippet. Väggutrymmet och utrustningsväskans placering ingick i den uppmätta versionen. Baslinjen mäter upp den animerade geometrin i varje tidig bild. Kandidaten använder bakade kontaktpunkter och behåller den färdigspelade posen.

| Tid efter döden | Antal steg | Median före → efter, ms | p95 före → efter, ms | Max före → efter, ms | Steg över 33 ms före → efter |
| --- | ---: | ---: | ---: | ---: | ---: |
| Första bilden | 4 | 104,4 → 1,2 | 105,0 → 1,2 | 105,0 → 1,2 | 4 → 0 |
| Till och med 0,85 s | 204 | 104,2 → 0,3 | 105,4 → 0,8 | 132,8 → 1,6 | 204 → 0 |
| 0,85–2,50 s | 396 | 0,5 → 0,3 | 0,7 → 0,6 | 104,3 → 1,8 | 1 → 0 |
| 2,50–4,00 s | 360 | 0,5 → <0,1 | 0,5 → <0,1 | 0,8 → 0,1 | 0 → 0 |

Under fallets första 0,85 sekunder varierade p95 mellan 104,8 och 105,7 ms i baslinjens fyra serier och mellan 0,5 och 0,8 ms i kandidatens fyra serier. Kostnaden avser sex samtidigt synliga fall på webbläsarens huvudtråd.
