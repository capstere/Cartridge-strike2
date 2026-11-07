# Cartridge Strike 0.15.0 — Ren skärmvisning

Gäller originalspelet `/fps/`. Frontline, banans geometri, kollisioner, botar, vapenregler och fysik ändras inte.

## Standardläget Ren
Hälsa, rustning, ammunition, tid, lagställning och faktiska uppdrag finns kvar. Diagnostik/FPS, permanent tangentguide, separat sessionsruta, tom Endless-uppdragsrad och den vanliga texten TRÄFF visas inte hela tiden. Träffmarkören, huvudträffar, elimineringar och farovarningar finns kvar. Desktop visar högst tre killfeed-rader; mobil högst två.

Desktop får mindre karta och kompakta statusfält. Vapenraden visas kort vid vapenbyte. Mobilens siffror och knappar skalas inte ned med CSS-transform; stora tryckytor bibehålls. Granatens kastbana finns kvar, men förklaringsrutan flyttas bort från siktet. Skydd och belöningar placeras i utkanten i stället för ovanpå siktesområdet.

## Mobil
Vänster joystick och höger siktyta fungerar som tidigare. PAUS, SIKTA, HOPP, HUKA och VAPEN ligger lättåtkomligt. **MER** öppnar KÖP, GRAN., SMYG och SLÄPP samt KARTA och RESULTAT. RESULTAT öppnar paus med sessionssammanfattning. KARTA växlar den befintliga taktiska kartan.

LADDA visas när magasinet inte är fullt eller omladdning pågår. HÅLL E visas vid interaktion eller en närliggande dörr. En redan nedtryckt knapp försvinner inte mitt under ett fingertryck. Manuell ELD och KASTA/AVFYRA finns fortfarande när respektive läge/vapen kräver det. Automatisk eld avvaktar medan MER-menyn är öppen. Att stänga menyn, pausa, dö eller förlora fokus släpper kvarhållna mobilkommandon.

MER är en liten verktygspanel, inte en paus. Pausa med PAUS eller RESULTAT när du behöver stanna matchen.

## Full visning
Välj **Skärmvisning → Full** i huvudmenyn eller paus för den tidigare layouten och alla knappar/paneler. Läget sparas lokalt. Byte av läge återanvänder samma DOM-knappar och eventlyssnare; inga duplicerade skott eller hängande hold-kommandon ska uppstå.

## Designunderlag
- W3C WCAG 2.2, Understanding 2.5.5 (Target Size Enhanced): stora touchmål, här minst 44 × 44 CSS-pixlar i det rena läget. Detta är ett layoutmål, inte ett påstående att hela spelet uppfyller WCAG AAA.
  https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html
- Xbox Accessibility Guideline 109 (Objective clarity): uppdrag och framsteg måste fortfarande vara möjliga att läsa; mindre plotter får inte betyda att uppdragsinformationen försvinner.
  https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/109

## Testning
`tools/focus-hud-smoke.cjs` provar den renderade mobil- och datorversionen, rent/fullt läge, faktisk granatkastning från MER, originalknapparnas identitet, sparade inställningar, karta, statistik i paus, knappstorlek och överlapp vid 844×390, 667×375 och 390×844. Före-/efterbilder sparas i testartefakten. Befintliga mobil-, precision- och granattester samt regeltester ingår i CI.

Chromium-emulering är inte ett praktiskt test på en fysisk iPhone/Safari. Testresultaten och eventuella återstående begränsningar redovisas i pull request.
