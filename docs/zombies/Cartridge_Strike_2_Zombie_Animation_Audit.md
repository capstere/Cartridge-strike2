# Cartridge-Strike 2 – zombieanimationer, fullständig filanalys

**Källor:** två av användaren uppladdade Meshy GLB-filer (Mixamo-rigg). Granskade som glTF/GLB: 16 animationsklipp i vardera filen, sampling av skelettpositioner, klippens tidsspann och inbäddade bilder. Detta är **inte** ett komplett visuellt renderat speltest.

## Snabb slutsats
- The Hollow Walker: `Toss_and_Turn` (17,633 s) ger en faktisk låg/liggande pose; `Stand_Up4` (1,667 s) börjar lågt och slutar upprätt. Bra för viloscen, men aligna till möbler och golv.
- Tattered Wanderer: `Chair_Sit_Idle_M` (10,667 s) ger sittande pose och `Sit_to_standTransition_Female_2` (2,267 s) en sitt-till-stå-övergång.
- Alla 32 animationer ska **bevaras**. De kan användas som villkorade idle-/ambient-/rörelse-/träff-/dödsekvenser, inte spelas slumpmässigt oavsett spelstate.

## Tattered Wanderer

Fil: `Meshy_AI_Tattered_Wanderer_20261109_animated_mixamo_All_animation.glb` – 15.4 MB; 16 klipp; 66 skin-joints.

| Klipp, exakt GLB-namn | Längd | Föreslagen användning | Uppspelning | Root XZ |
|---|---:|---|---|---:|
| `Running` | 0.63 s | Jakt / snabb förflyttning | Loop | 0.00 m |
| `Walking` | 1.03 s | Vandrar i korridorer | Loop | 0.00 m |
| `Angry_Ground_Stomp` | 1.37 s | Hotsignal: stampning när zombien upptäcker spelaren | Engång | 0.00 m |
| `Burpee_Exercise` | 3.17 s | Oroväckande rörelser upp och ned från golvet; sekvens vid dramatisk plats | Sekvens eller loop | 0.00 m |
| `Chair_Sit_Idle_M` | 10.67 s | Sitter vid stol eller i fikarum, kroppslig oro | Loop | 0.00 m |
| `Dead` | 2.97 s | Vanlig dödsanimation, håll sista posen | Engång | 0.57 m |
| `Fall_Dead_from_Abdominal_Injury` | 3.50 s | Död/fall efter allvarlig kroppsskada | Engång | 0.91 m |
| `Gunshot_Reaction` | 3.00 s | Synlig kulträffsreaktion (begränsad frekvens) | Engång | 0.09 m |
| `Injured_Walk` | 8.67 s | Skadad, långsam förflyttning | Loop | 0.00 m |
| `Knock_Down` | 2.50 s | Blir omkullslagen utan att nödvändigtvis dö | Engång | 0.65 m |
| `Shot_and_Blown_Back` | 2.67 s | Kraftigt kast bakåt vid explosion, kräver kontroll av root movement | Engång | 3.80 m |
| `Shot_and_Fall_Backward` | 3.50 s | Bakåtfallsdöd, välj vid fritt utrymme | Engång | 1.00 m |
| `Shot_and_Fall_Forward` | 2.17 s | Framåtfallsdöd, välj vid fritt utrymme | Engång | 0.85 m |
| `Sit_to_standTransition_Female_2` | 2.27 s | Reser sig ur sittande innan patrull/jakt | Engång | 0.36 m |
| `Skill_01` | 1.07 s | Särskild rörelse, måste förhandsgranskas innan beteendet namnges | Engång | 0.18 m |
| `mage_soell_cast_2` | 3.00 s | Särskild gest, kan bli hot/ryckning efter visuell kontroll | Engång | 0.00 m |

## The Hollow Walker

Fil: `Meshy_AI_The_Hollow_Walker_20261109_animated_mixamo_All_animation.glb` – 24.3 MB; 16 klipp; 68 skin-joints.

| Klipp, exakt GLB-namn | Längd | Föreslagen användning | Uppspelning | Root XZ |
|---|---:|---|---|---:|
| `Running` | 0.63 s | Snabb förföljelse | Loop | 0.00 m |
| `Walking` | 1.03 s | Vanlig vandring | Loop | 0.00 m |
| `Angry_Ground_Stomp_2` | 1.80 s | Aggressivt markstamp, varningsreaktion | Engång | 0.00 m |
| `Dead` | 2.97 s | Vanlig död | Engång | 0.65 m |
| `Fall_Dead_from_Abdominal_Injury` | 3.50 s | Död efter kroppsskada | Engång | 1.06 m |
| `Gunshot_Reaction` | 3.00 s | Kulträffsreaktion | Engång | 0.09 m |
| `Head_Hold_in_Pain` | 3.70 s | Tar sig åt huvudet, oro eller efter huvudskada | Engång | 0.01 m |
| `Hit_Reaction` | 1.63 s | Träffreaktion, har nära 1 m sidledes animationstranslation | Engång | 0.90 m |
| `Idle_8` | 8.00 s | Står stilla, tittar och väntar | Loop | 0.00 m |
| `Knock_Down_1` | 3.27 s | Faller/knuffas ned, kan senare resa sig | Engång | 0.94 m |
| `Limping_Walk_3_inplace` | 2.87 s | Haltar efter skada / sömngångarlik vandring | Loop | 0.00 m |
| `Shot_and_Blown_Back` | 2.67 s | Kraftigt bakåtkast vid explosion, kräver root-motion hantering | Engång | 4.02 m |
| `Shot_and_Fall_Forward` | 2.17 s | Framåtfallsdöd | Engång | 0.93 m |
| `Stand_Up4` | 1.67 s | Reser sig från liggande/låg position | Engång | 0.73 m |
| `Toss_and_Turn` | 17.63 s | Ligger ned och vrider sig; möjlig viloscen i Lounge | Loop | 0.00 m |
| `dying_backwards` | 2.20 s | Bakåtriktad dödsanimation | Engång | 0.73 m |

## Föreslagna encounters på Floor 5

1. **Vilande Hollow Walker:** vila på golv/liggplats; loop `Toss_and_Turn` (liggande) → upptäck ljud/ljus → `Stand_Up4` (reser sig) → `Idle_8` → `Walking`/`Limping_Walk_3_inplace` → `Running`. Ståplats och collision måste vara fri innan animationen påbörjas.
2. **Sittande Tattered Wanderer:** `Chair_Sit_Idle_M` → ljud reagera → `Sit_to_standTransition_Female_2` → `Angry_Ground_Stomp` → `Walking` eller `Injured_Walk` → `Running`. Låt modellens höft förankras på sittplatsen och ändra fysisk kollisionsposition först när figuren reser sig.
3. **Golvstörning:** `Burpee_Exercise` hos Tattered är en rörelse från låg till stående och tillbaka; kan användas som groteskt slumpbeteende, men är ingen ren krypanimation.
4. **Skada och återhämtning:** `Gunshot_Reaction` och `Head_Hold_in_Pain`, sedan skadad gång, `Knock_Down_1` följt av `Stand_Up4` endast om NPC överlever. Om den dör används en av dödsanimationerna och sistaposen hålls.
5. **Ovanliga specialrörelser:** `Skill_01` och `mage_soell_cast_2` är ospecifika namn; förhandsgranska visuellt innan de tilldelas attacker eller andra handlingar.

## Kartläge och spelarkitektur

I originaldata `src/floor5-data.js` finns rum **I25 LOUNGE** med flera soffor. Det är en möjlig scenplats, men inte verifierat att detta är det vilorum användaren avser.
`Game.fire()` och `Game.reticleTarget()` tar redan hänsyn till `state.wanderers` när funktionen är på, men full zombiestyrning/spawning/rendering finns inte färdig. `src/fps/navigation.mjs` har en Yuka-baserad sökväg som kan återanvändas. Spelets befintliga collider och dödssystem behöver explicit kompatibilitetsanpassning för zombies.
`src/fps/character-runtime-contract.mjs` är avsedd för Quaternius-/dvärgriggar och ska inte användas som importkontrakt för dessa Meshy-zombies.

## Tekniska risker

- **Root-motion:** Hollow Walker `Shot_and_Blown_Back` (~4,0 m), Tattered Wanderer `Shot_and_Blown_Back` (~3,8 m), Tattered `Knock_Down` (upp till ~1,8 m från startpositionen) och Hollow `Hit_Reaction` (~0,9 m) flyttar skelettroten. Separera visuell pose från verklig fysikförflyttning för att undvika glidning genom väggar.
- **Möbelkontakt:** `Toss_and_Turn` är liggande men ingen säng finns inbyggd i GLB; `Chair_Sit_Idle_M` kräver korrekt stol och förankring. `Stand_Up4` är en uppresning från låg pose och är inte garanterat sömlös från soffhöjd.
- **AI:** Använd villkorsstyrd state machine med särskilda `sleeping`, `seated`, `investigate`, `wander`, `chase`, `hurt`, `knockdown`, `dead`; undvik att varje träff avbryter och återstartar en 3 sekunder lång reaktionsanimation.
- **Balansering:** Zombies får inte räknas som Analysts/Counter Analysts eller påverka rundvinstlogik av misstag. Mobil auto-fire filtrerar i nuläget mål utan team.
- **Prestanda:** två filer ~39,7 MB okomprimerade GLB; Hollow Walker har en 4096² metallic/roughness PNG. Dela geometri/texur och använda separata skinned clones och AnimationMixers, LOD/avståndsstyrd animation.
- **Attackklipp:** Ingen explicit namngiven `Bite` eller `Claw`-animation finns. En fungerande närstridsattack kräver en lämplig verifierad gest eller nytt attackklipp.

## Prioriterad implementering

A. Bygg en karaktärs-/animationspreview där samtliga 32 klipp kan spelas separat, med slow motion, kamera och synlig root-motion-diagnostik.
B. Implementera två skriptade scen-NPC:er i begränsat testläge: liggande Hollow och sittande Tattered.
C. Koppla in AI-sökrutter, hörsel, upptäckt, chase, fysiskt träff- och dödssystem; tester för kollisioner och upprepade omladdningar.
D. Gör ett konfigurabelt encountersystem som kan återanvända alla klipp efter trigger och kontext – inga hårdkodade clips som bara begränsar modellen till fyra animationer.