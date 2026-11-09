# Living zombies on Floor 5

Classic and Endless on the published Unit 05 floor start with five neutral residents on desktop and three on touch devices. The ten team slots and the hostages keep their original roles. The Hollow Walker sleeps between lounge chairs in I25. The Tattered Wanderer sits sideways at the end of the desk in I16, facing the open aisle. A limping Hollow Walker starts on the laboratory corridor C03. Desktop adds a retiring Tattered Wanderer in the open office I26 and a resident on the western corridor C15. [Spawn sites and clearance checks](../../src/fps/zombie-sites.mjs)

Each spawn uses the resolved room, solid geometry and navigation graph. The sleeper needs a clear 1.04 m radius. The sitter uses the placed chair's transform and a standing capsule 0.62 m from its centre. The seat-to-aisle offset eases out during the rise. The physical capsule reserves the exit and the gun hitbox follows the visible body. The initial sites clear both squads, hostages, bomb, rescue and active control zones. A Classic round restores the homes. In Endless, a dead resident can be replaced after 55 seconds when the corpse and home are out of sight, the home is clear and all living players and bots are at least seven metres from both points.

## Behavior and combat

Residents listen to the same logical gunshots, grenade blasts and footsteps as the bots. Muting audio preserves perception. A gunshot carries 20 m in the open. A solid obstruction reduces that to 5.4 m. Hearing supplies a last-known position. Seeing a soldier requires the actual visibility ray and clear smoke, with nine metres of sight and shorter peripheral awareness. A sleeper responds to sound or presence within 1.45 m. Stationary residents complete a standing transition before walking. Injury slows pursuit. Residents can investigate soldiers from either team and break off pursuit beyond their territory or near mission interactions.

Patrols use the shared floor navigation graph. At most one zombie requests a route every 0.22 seconds. Each displacement goes through the same swept body and world collision as soldiers. Hinged doors must open to admit a body. An actor stranded in the conservative door-swing margin can probe a short, walkable path back to the graph. This recovery also applies to a hostage following an escort through a crowded doorway.

An aggressive resident turns towards a nearby soldier, gives a spatial audio warning and begins its authored stomp. One impact can deal 12 base damage to a soldier within 0.88 m, after 0.78 s for Tattered or 0.88 s for Hollow. Impact checks height, solid cover, smoke and the original target again. There is a three-second cooldown. Moving out, interrupting, or killing the attacker counters the stomp. Nearby bots can defend themselves through their existing perception and weapon controllers.

Hitscan, knife, rockets and HE use the game's obstruction and damage paths. The low hitbox extends along the lying rig. Living knockdowns can recover. Death stops movement and attacks and holds the final pose. A zombie kill changes no team kill count, credits, streak, bomb state, hostage state, control score or elimination count. [Simulation](../../src/fps/zombies.mjs) · [Weapon and round integration](../../src/fps/game.mjs)

## Original clips and assignments

The cells contain the exact GLB names. Both assets have sixteen clips. The shared rows describe clips that occur on both rigs.

| Context | The Hollow Walker | Tattered Wanderer |
| --- | --- | --- |
| Ordinary travel and sound investigation | `Walking` | `Walking` |
| Pursuit in good health | `Running` | `Running` |
| Slow or injured travel | `Limping_Walk_3_inplace` | `Injured_Walk` |
| Rest at the home site | `Toss_and_Turn` on the lounge floor | `Chair_Sit_Idle_M` at the actual chair |
| Wake and rise | `Stand_Up4` from the floor | `Sit_to_standTransition_Female_2` from the chair |
| Standing and observing | `Idle_8` | First neutral frame of `Angry_Ground_Stomp` held while waiting |
| Warn, then strike within reach | `Angry_Ground_Stomp_2` | `Angry_Ground_Stomp` |
| Bullet hit | `Gunshot_Reaction` | `Gunshot_Reaction` |
| Additional pain and injury | `Head_Hold_in_Pain` for head hits or an ambient pause. `Hit_Reaction` for a close knife strike | — |
| Rare behavior in open floor space | — | `Burpee_Exercise` for a floor contortion, `Skill_01` for a wide-stance arm flare, `mage_soell_cast_2` for a reaching and folding gesture |
| Strong surviving hit | `Knock_Down_1`, then `Stand_Up4` | `Knock_Down`, then reverse the fall to stand |
| Blast | `Shot_and_Blown_Back`, with a low recovery if alive | `Shot_and_Blown_Back`, reversed for a survivor |
| Close, low-body or confined death | `Dead` | `Dead` |
| Fatal abdominal hit | `Fall_Dead_from_Abdominal_Injury` | `Fall_Dead_from_Abdominal_Injury` |
| Directional fatal fall, subject to clearance | `Shot_and_Fall_Forward` or `dying_backwards` | `Shot_and_Fall_Forward` or `Shot_and_Fall_Backward` |

Every instance owns its skeleton, mixer and current actions. A 180 ms blend joins actions. The render clock follows authoritative simulation time, including a reverse recovery and a clamped death pose. Playback zeros only horizontal hip translations in a private copy of that track. Vertical movement, rotations and original GLB samplers remain intact. Off-camera mixers skip sampling. Distant visible residents update at 8–15 Hz and catch up to the correct pose on re-entry. Geometry, materials and textures are shared per model. Instance slots are reused across rounds. [Pose definitions](../../src/fps/zombie-poses.mjs) · [Three.js presentation](../../src/fps/zombie-visuals.mjs)

## Asset provenance

The owner supplied both animated Meshy GLBs. For static delivery, the embedded textures were resized to at most 1024 px, encoded as high-quality JPEG, and the GLB gzip-compressed. The two downloads total 6,171,816 bytes. The source comparison checked all non-image buffer views byte for byte and matched animation definitions, accessors, skeletons, node transforms, meshes, texture bindings and materials. The test suite pins the source geometry and animation payload hashes.

| Asset | Source GLB bytes | Original SHA-256 | Packaged bytes |
| --- | ---: | --- | ---: |
| The Hollow Walker | 24,296,488 | `1f2a401b561b4a33572b38f00c7569db91eddef3588838dcca78ef0a0e1d1dbb` | 3,268,124 |
| Tattered Wanderer | 15,391,864 | `4dc2bce9ad1f61144c37faf83a6543b4efc7ef6db93bdb372dafc6517989fe3e` | 2,903,692 |

[Original animation audit](Cartridge_Strike_2_Zombie_Animation_Audit.md) · [Machine-readable source inventory](Cartridge_Strike_2_Zombie_Animations.json)

## Verification

Serve the repo root on port 8765 and install the locked Chromium tooling described in the handover.

```sh
node --experimental-loader ./tools/vendor-three-test-loader.mjs --test src/fps/*.test.mjs tools/*.test.mjs
node tools/verify-owner-runtime.mjs
node --experimental-loader ./tools/vendor-three-test-loader.mjs tools/owner-door-traversal.mjs --prepared
node tools/zombie-match-browser.mjs
node tools/match-lifecycle-browser.mjs
```

The core suite passed 165 tests and the runtime manifest verified 439 files. The seeded Floor 5 tests exercise all 32 model/clip assignments through simulation, including rare gestures, both factions, closed-door hearing and sight, bullet obstruction, interruptible attacks, directional deaths, and off-screen replenishment. Existing objective scenarios cover plant, defuse, rescue and two consecutive Classic rounds. The prepared door sweep crossed all 51 hinges in both directions.

In Chromium, normal lobby selections started desktop Classic and touch-layout Endless. Both residents rendered with their own skeletons. The guided match check positioned the observer at the actual lounge and desk, woke each resident, fired a pistol, and exercised knockdown, recovery and death with the nine team bots present. The plain FPS address also started and returned both modes to the lobby with two shared geometries and two shared materials across the five or three skeletons.

### Frame timing

Apple M1, ANGLE Metal, Chromium 153. Each row sampled 180 rendering callbacks in a populated Endless match with a fixed view of the lounge, after a short warmup. One Hollow Walker was in view on the feature build. The comparison build was main at `2957bed`.

| View | Build | Median / p95 frame interval | Mean FPS | Median draws / triangles |
| --- | --- | ---: | ---: | ---: |
| 1280×720 standard | Comparison | 16.7 / 16.8 ms | 60.0 | 183 / 30,064 |
| 1280×720 standard | With zombies | 16.7 / 16.8 ms | 60.0 | 185 / 54,598 |
| 844×390 low, touch emulation | Comparison | 16.7 / 16.8 ms | 60.0 | 239 / 63,298 |
| 844×390 low, touch emulation | With zombies | 16.7 / 16.8 ms | 60.0 | 241 / 87,832 |

### Match lifecycle

After four warmup matches, 20 measured cycles alternated Classic and Endless in one tab. Each bought armor, switched weapons, rendered both skinned residents, switched to a second tab, resumed, and returned to the lobby. Native backgrounding stopped simulation time and WebGL frames. Forced garbage collection followed each lobby return. The grenade preview now releases its old match reference when reset.

The run settled at one reachable current match, three pooled zombie instances, one gameplay audio context, three persistent audio nodes, zero live voices or ambient loops, 264 JavaScript listeners and one pending frame callback for each of the game and lobby. After warmup, the game renderer held 905 geometries, 224 textures and 104 shader programs. All 20 measured returns matched those counts. The lobby renderer held 29 geometries, 14 textures and 10 programs throughout. The harness prints both sets of counters on every cycle.

No handset was available. These frame samples cover the specified Mac lounge view. Physical iOS and Android input, speaker output, thermal throttling and whole-map frame pacing remain open. Skinning uses posture-based hit volumes, so limb-level hit detection is approximate.
