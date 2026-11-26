# Mobilstyrning, siktesläge och rekyl

Originalspelet i `/fps/` kan spelas med pekskärm utan mus, tangentbord eller Pointer Lock. Den separata Frontline-versionen är oförändrad.

## Välj automatisk eller manuell eld

**Automatisk eld på mobil** finns även online i Classic och Team Deathmatch,
inklusive familjerummet. Öppna matchmenyn med pausknappen, eller **MER → RESULTAT**
i den rena mobilvyn, och ändra inställningen. På avfyrar vapnet när siktet ligger
på en synlig fiende; av visar den manuella **ELD**-knappen. Valet sparas på enheten.
Ett första onlinebesök börjar med manuell eld. Ett tidigare sparat val behålls.
Offline är automatisk eld fortfarande standard.

Automatisk eld riktar inte vapnet åt dig och ändrar inte skada, ammunition,
eldhastighet eller omladdning. Servern avgör fortfarande skotten och träffarna.
Lagkamrater, gisslan och passiva figurer blockerar siktlinjen. Online kan jagande
eller attackerande zombies utlösa eld, men Dansmannen gör det aldrig. Granater och
raketer avfyras alltid manuellt.

## Kontroller
- **Vänster tumme:** Använd den flytande joysticken för att gå och sidoförflytta dig.
- **Höger tumme:** Dra på den öppna högra halvan för att rikta vapnet.
- **SIKTA / dubbeltryck till höger:** Växla precisionsläge. Sniper får kikarsikte. Mindre spridning, lägre känslighet och mjukare rekyl i siktesläget.
- **Automatisk eld:** Välj på eller av i mobilinställningarna. Vapnet avfyras när siktet träffar en synlig fiende. Sniper kräver att kikarsiktet är redo och att siktet hålls på målet en kort stund.
- **ELD (valfritt):** Stäng av Automatisk eld på mobil i inställningarna för manuell skjutknapp.
- **KASTA / AVFYRA:** Visas alltid när granat eller bazooka är vald, även med automatisk eld. Explosiva vapen avfyras aldrig automatiskt.
- **HOPP, HUKA, SMYG:** Håll medan du rör dig.
- **HÅLL E:** Håll för att interagera, plantera, desarmera eller använda dörrar.
- **LADDA:** Ladda om manuellt. Automatisk omladdning vid tomt magasin är också på som standard och kan stängas av.
- **VAPEN:** Växla mellan huvudvapen, pistol och kniv. **GRAN.:** Välj tillgänglig granat. **SLÄPP:** Släpp föremål.
- **KÖP:** Öppna butiken under köpfas eller när som helst i Endless.
- **PAUS:** Pausa och återuppta via FORTSÄTT. **SPELA IGEN:** Starta om efter död.

På datorn finns WASD och mus kvar. Håll höger musknapp för precisionsläge eller växla med **F**. **R** laddar om och **Esc** pausar.

## Sikteshjälp och rekyl
Mild sikteshjälp på mobil saktar ned fingrets rörelse nära en synlig fiende. Den flyttar aldrig siktet åt dig, låser inte på mål och ser inte genom väggar eller rök. Hjälpen kan stängas av. Datorns mus får ingen sådan hjälp.

Den Riposte-inspirerade rekylen gäller båda plattformarna. Långa salvor klättrar och drar i sidled, korta salvor återhämtar sig delvis. Mobilen har mjukare rekyl än datorn. Hukning och siktesläge hjälper; rörelse och hopp gör vapnet svårare att kontrollera. Vapnens skada och eldhastighet samt botarnas beteende är oförändrade i denna uppdatering.

Automatisk omladdning använder vanliga reservskott och samma omladdningstid som manuell omladdning. Ingen extra ammunition tillkommer. Den avbryts vid vapenbyte och startar inte under paus, död eller pågående interaktion.

## Grafik och kompatibilitet
Första besöket på en touch-enhet väljer grafik **Låg** om inget tidigare grafikval är sparat. Spela helst i liggande läge. Fullskärm och orienteringslås är frivilliga webbläsarfunktioner och krävs inte för att spela.

## Testning och källor
Onlinevalet täcks av `tools/network-session.test.mjs` och
`tools/recoil-autofire.test.mjs`. De kontrollerar vanliga nätpaket, upprepade
halvautomatiska skott, oförändrad manuell eld, spärrar och synliga mål.
`node --import ./server/register-shared.mjs tools/online-autofire-browser.mjs` provar det renderade mobilflödet mot den
riktiga lokala servern i Classic och Team Deathmatch, med en separat datorklient.
Webbläsaremulering ersätter inte prov på fysisk iPhone eller Android.

20 deterministiska Node-tester och speltester i Chromium med mobil- respektive datorstyrning verifierar regler, zoom, dubbeltryck, omladdning, manuell granat, vapenbyte, paus och befintlig automatisk eld. Mobil-emulering är inte ett test på fysisk iPhone/Safari.

Detaljer och källhänvisningar finns i [Precision Pack](precision-pack.md). Ripostes MIT-licens och undantag finns i `licenses/riposte-MIT.txt` och `licenses/riposte-NOTICE.md`. Inga skyddade logotyper, Mixamo-animationer eller musik importerades för denna uppdatering.

Se [mobil- och CI-granskningen den 16 november](mobile-ci/README.md) för mätningar, vapenbyte med nedtryckta fingrar, pekarägarskap och paus vid rotation. Fysiska iPhone-/Android-tester återstår.
