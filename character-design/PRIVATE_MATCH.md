# Min egen karaktär i en privat provmatch

Den här piloten kopplar ihop Character Design Studio med spelets befintliga karaktärs- och animationssystem. Ingen installation eller kommandorad behövs.

1. Öppna **Character Design Studio** och klicka **Ny Male-pilot · T-shirt & sneakers** under projektvalet. Ditt tidigare projekt sparas i **Min ateljé** innan den nya piloten öppnas.
2. Ge designen ett namn. Välj färger under **Kläder**. Under **Eget tryck eller mönster** kan du skriva egen text eller välja en PNG och justera placeringen.
3. Klicka **Export / privat provmatch ↗**, sedan **Prova i privat match**. Projektet sparas och den synliga designen exporteras automatiskt till en lokal GLB.
4. Klicka **Starta match** i spelet. Du spelar på Analysts. Du och lagkamrat **A-02** använder din design. Se honom framifrån för att kontrollera trycket; följ honom när han går och hukar.
5. För att ändra designen: gå tillbaka till menyn och välj **Tillbaka till min design**. För ett vanligt spel: **Spela med originalkaraktärerna**.

Designen finns bara i den här webbläsaren på den här enheten. Den skickas inte till GitHub eller någon server. URL:en är ingen delningslänk. Spara gärna också **Spara projekt (.json)** som en egen säkerhetskopia. Upp till åtta spelkopior sparas tills du själv tar bort dem. Äldre provkopior visas också i spelmenyn. Spelkopior och ateljéprojekt är separata; radering i spelmenyn tar inte bort projektet i ateljén.

## Verifierad omfattning

- Quaternius Male med originalproportioner, passform 100 %, originalhuvud och originalfrisyr, T-shirt, sneakers, färger och tryck.
- 65 ben och 13 befintliga animationsklipp. Spelet använder sin ordinarie gång, hukning, vapenrörelse och dödsanimation.
- Kläderna använder studions befintliga viktade geometri. T-shirten har färgade korta ärmar och sneakers är studions befintliga skovariant. Detta är inte nysydd klädgeometri. Den gamla triangulerade midjeskarven blir synlig med starkt kontrasterande tröj- och byxfärg; startdesignen använder samma färg.
- Förstapersonshänderna använder handfärgen från din sparade GLB. Armarna visar samma hudfärg och T-shirtfärg, med korta ärmar. Vapengeometri, handrigg och grepp är spelets befintliga; färgmatchningen ändrar inte handformen. Trycket sitter på kroppen och kopieras inte till armarna. Andra botar använder vanliga lagutseenden. Det finns ingen nätverksmultiplayer eller offentlig publicering av din modell i detta flöde.
- Extra delar, ändrade kroppsproportioner, skulpterat huvud, ny frisyr och tygsimulering stoppas med en förklaring i denna pilot. De kan fortfarande användas i studions övriga arbetsflöden. Projektet förenklas aldrig automatiskt.
- SPEL/Procreate är fortfarande en separat väg. Den här knappen laddar studions GLB direkt i provmatchen och utlovar inte generell Procreate-kompatibilitet.

## Tekniskt kontrakt och återställning

Studion sparar först projektet och en GLB med alla bilder inbäddade. En separat IndexedDB-post innehåller källmodellens SHA-256 och exportens SHA-256. Spelet kontrollerar båda före laddning. Exporten begränsas till 24 MiB, 32 mesh, 24 material, 32 bilder och 180 noder; externa resurser och obligatoriska tillägg tillåts inte. Källmodellen eller de vanliga spelmodellerna skrivs aldrig över.

Runtime klonar hela hierarkin och varje skeleton, behåller geometri/UV/texturer samt använder den befintliga AnimationMixer-logiken. Den kör inte vanlig uniformsfärgning eller lägger till nya skor på den privata kopian. Fel vid sparning, ogiltig länk, rensad webbläsarlagring eller ändrad källmodell ger ett tydligt fel och erbjuder ingen tyst ersättningskaraktär. Öppna studion och skapa provmatchen igen.

## Reproducerbar verifiering

Från repots rot, med server på port 8765:

```sh
node --experimental-loader ./tools/vendor-three-test-loader.mjs --test character-design/*.test.mjs src/fps/*.test.mjs
node character-design/private-match-browser.mjs
blender --background --factory-startup --disable-autoexec --python-exit-code 1 --python character-design/private-match-blender.py
```

Webbläsartestet skapar designen via knapparna, sparar/öppnar den, startar matchen, jämför GLB med laddade avatarer och verifierar normal match efteråt. Det sparar bilder av den faktiska runtime-modellen i fem poser. Pointer lock ersätts i headless-testet; detta är ingen mätning av manuell muskontroll eller mobilprestanda.

Blender 4.5 LTS importerar exporten, exporterar en ny GLB och återimporterar i en ren scen. Det jämför geometri, UV, benhierarki, bindpose och skin weights samt verkligt deformerade triangelhörn i fem tidpunkter i vart och ett av de 13 klippen. Bilder och testdata hamnar i ignorerade `test-results/private-character/`. GitHub Actions kör samma flöde utan att ladda upp stora artefakter.

Direktvägen Studio → provmatch behåller vikter och animationskanaler exakt. Blender 4.5.3:s egen exporter tar bort enskilda vikter under 0,0001 och normaliserar om dem. I den kontrollerade returen var största viktskillnaden 0,0000767 och största positionsskillnaden 0,00000762 meter; klipplängderna var oförändrade. Blender-returen är alltså numeriskt jämförd, inte byteidentisk.

## Matchande händer och korta ärmar

Befintliga privata provmodeller får färgmatchningen när matchsidan laddas om. Ingen ny export behövs. Vill du ändra färger: **Tillbaka till min design → Kläder → Händer / färger → Prova i privat match → Starta match**. Prova att skjuta, ladda om och byta mellan pistol, gevär och kniv. Vapenhanteringen ska vara densamma.

Färgerna läses från den validerade GLB:n: handmaterialet, tröjans reserverade otryckta UV-område och de viktade underarmarnas vertexfärg. Två material och två små 1 × 128-texturer återanvänds för alla vapen. Inga extra mesh läggs till. Vid åskådning används den betraktade spelarens utseende; vanliga lagkamrater får originalmaterialen tillbaka. Material/UV på karaktären och originalfilerna ändras inte.

Detta är fortsatt Male/T-shirt-piloten, inte generell överföring av tatuerade händer, nya handformer eller godtyckliga Procreate-texturer. Handmodellens befintliga form och manschett behålls för att bevara grepp och fingerrörelse. Ingen ny prestandanivå eller fysisk mobilkontroll utlovas.

`view-character-appearance.test.mjs` jämför vapen-, magasin-, hand- och fingertransforms samt mynningsposition vid 16 omladdnings-/skottlägen per vapentyp, för alla 13 utrustningstyper. Det kontrollerar färgrymd, oförändrad källdata, återställning av cachade modeller, resursstädning och att världsvapen inte påverkas. Det befintliga webbläsarflödet testar också privat/vanlig åskådarvy för alla 13, verklig ammunitionsförbrukning och omladdning samt sparar förstapersonsbilder för pistol, CR4, SMG och kniv. Bilderna med valda vapen är kontrollerade renderingsfall; `match.png` visar ordinarie matchstart.

## Välj din karaktär i vanliga matcher

1. Öppna ditt projekt i **Min ateljé** i Character Design Studio. Välj **Export / privat provmatch ↗ → Spara för spelet**. Studion använder samma kontrollerade GLB-export som provmatchen. Ett ateljéprojekt behöver sparas för spelet en gång innan det kan väljas där.
2. Klicka **Öppna spelmenyn ↗**. Under **Min karaktär** väljer du din sparade design. Befintliga provkopior finns redan i listan.
3. Spelet laddar och kontrollerar kopian. Välj valfritt lag och **Klassiska rundor** eller **Endless Action**, sedan **Starta match**. Bara din egen spelare får designen; botarnas lagutseenden behålls. Händerna följer samma val.
4. Valet koms ihåg på denna enhet och i denna webbläsare. **Originalkaraktär** återställer standardutseendet. **Ta bort spelkopian** tar bort endast GLB-kopian, efter bekräftelse. Projektet i ateljén finns kvar.
5. För att ändra en spelkopia: öppna det namngivna projektet från ateljéns lista, ändra designen och välj **Spara för spelet** igen. Då uppdateras samma spelkopia. Har du studion och spelet öppna i olika flikar behöver spelmenyn laddas om för att läsa den nya kopian.

Ingen modell eller design skickas till en server. Dessa vanliga matcher är fortfarande spelets lokala botmatcher, inte nätverksmultiplayer. Stödet är samma verifierade Male/T-shirt-pilot; menyn lovar inte stöd för godtyckliga GLB-filer. Den separata **Prova i privat match**-knappen behåller Analysts + A-02 som tidigare för att inspektera designen utifrån.

Biblioteket begränsas till åtta GLB-kopior, högst 24 MiB per kopia. Samma ateljéprojekt uppdateras på samma ID, även när biblioteket är fullt. Inga äldre modeller raderas automatiskt. Listan behåller bara metadata; endast vald modell parsas och laddas i GPU-minnet. Ett modellbyte laddar om spelvyn innan matchstart för att släppa den tidigare modellens resurser. Lagbyte i samma vy byter endast kosmetisk avatar; skelett/animationskällor, spelobjekt, vapenfästen och träfflogik förblir desamma.

Saknad kopia, fel kontrollsumma eller ändrad källmodell blockerar **Starta match** med en svensk förklaring. Menyn förblir tillgänglig för att välja originalet eller en annan kopia. Det blir aldrig ett tyst byte till en annan figur. Nekad lokal lagring hindrar inte en vanlig match med originalkaraktären.

`private-match-browser.mjs` kör också `saved-character-menu-browser.mjs`: Spara för spelet, val från menyn, båda lag, klassisk död/åskådarvy/ny runda, Endless-död/respawn, ihågkommet val, originalåterställning, skadad kontrollsumma, radering utan förlust av ateljéprojekt och kontroll att ingen uppladdning sker. Separata IndexedDB-transaktionstester kontrollerar åttagränsen, uppdatering vid fullt bibliotek och avsaknad av automatisk radering. Menybilder i bred och smal viewport samt en matchbild sparas lokalt. Headless-/viewporttester är inte verifiering på fysisk telefon.

Lagringsversion 2 behåller befintliga provkopior men stoppar den gamla versionens automatiska radering. Ladda om både studion och spelet efter uppdateringen. Gamla flikar kan inte skriva till det uppdaterade biblioteket förrän de laddas om. Migration och blockering av äldre skrivare regressionstestas med verklig IndexedDB.
