# Nästa steg för Cartridge Strike

Status 29 oktober 2026. Detta är en prioriterad arbetsplan, inte påståenden om färdiga funktioner. Håll varje spelmekanik i en egen PR med motor-, bot-, render- och webbläsarprov. Floor 5 utan `?level=` och projektformatets schema 2 ska fortsätta fungera.

## 1. Byggbibliotek och objekt

Inventera först vilka vardagliga byggdelar som faktiskt saknas när en syntetisk två-rumsbana byggs med mus: belysning, förvaring, skydd/cover, markörer och smådetaljer. Det finns redan 104 ursprungliga GLB-objekt, ett antal procedurmodeller, egna GLB via ZIP, och dörrar/fönster/glas som arkitektur. Undvik dubbletter som bara skiljer färg; erbjud varianter av befintlig geometri. Varje nytt objekt behöver mått, begriplig kategori, placering/fäste, tillåten rotation, enkel kollisionsform, FPS-förhandsvisning, licenskälla och låg detaljnivå för mobil. Testa att objektet kan placeras, flyttas, ångras, sparas och återöppnas med identisk spelkollision.

Privata `.blend` är arbetsoriginal, `.glb` är möjliga utbytesfiler. Granska rättighet och känsligt innehåll per modell, optimera separat och lägg bara godkända publika derivat i `assets/` eller biblioteket. Ingen automatisk synkronisering från `onboard`.

## 2. Karaktärernas utseende och rörelser

Nuvarande `src/fps/action-visuals.mjs` ritar stiliserade dvärgvarianter med gångrörelse och en kort fallrörelse vid död. `assets/fps/models/` innehåller också operatörsmodeller. Prova två eller tre tydligt skilda silhuetter med teamfärger, läsbara vapen/utrustning och samma träffvolym som motorn. Bygg en tillståndskedja för stå/gå/spring/huk/hopp/träff/död och övergångar som inte återstartar animationen varje bildruta. Dödsrörelsen ska sluta på marken, inte störa sikt eller kollision, återställas på respawn och inte öka antalet drag calls okontrollerat. Testa mot både spelare och bottar, på mobil och i WebGL med reducerad rörelse.

## 3. Hopp under hukning

`src/fps/game.mjs` blockerar i dag hopp när `actor.crouching` är sant. Bestäm avsikten som **hukad start ger ett kortare hopp; kapseln förblir hukad tills det finns plats att stå**. Samma regel ska gälla tangentbord, mobil och bottar där relevant. Pröva under lågt tak, mot dörrkarm, vid landning, på möbler och när hopp+huka hålls samtidigt. Lägg till deterministiska fysiktester före UI-förändringen.

## 4. Köpbart sköldföremål

Lägg till ett köpbart föremål i befintlig utrustningsmodell med tydlig kostnad, lagregel och en hand som upptas. Skölden ska ha en riktad, synlig träffyta: skott och explosioner ska avgöras av samma skott-/siktregler som resten av motorn. Bestäm uttryckligt vilka vapen som kan användas samtidigt, hur man sänker skölden, rörelsehastighet, hållbarhet och vad som händer vid död. Bot-AI behöver val att bära, flankera och skjuta runt skölden. Testa framifrån, sidan, bakom, glas, dörröppning, närstrid och mobilkontroller. Börja med en syntetisk modell, byt till rättighetsklar GLB efter granskning.

## 5. Dvärg-granat

Skapa en separat köpbar granattyp i `src/fps/config.mjs` och den befintliga granat-/kastkedjan. Träff ger en tillfällig **omgångslång** effekt: målet blir litet, tappar tillgång till vapen och får visuell återkoppling. Effekten upphör vid död och återställs vid ny omgång eller respawn. Definiera före implementation radie, varaktighet, lagträffar, skydd, upprepade träffar, gisslan, bottarnas beteende och hur tappade vapen hanteras. Fysisk kapsel, träffyta, kamera, dörrar och navigation måste stämma med den synliga modellen; annars blir effekten orättvis eller fastnar i geometri. Testa köp → kast → träff → obeväpnad dvärg → död → normal respawn i riktig webbläsare och mot botsimulering.

## Leveransordning

Först biblioteksluckor och karaktärsrörelser, sedan hukat hopp som en avgränsad fysikändring. Därefter sköld med AI och sist dvärg-granaten, som påverkar flest system. Publicera inte privat material i någon PR; validera Floor 5 och ny nivå i varje steg.
