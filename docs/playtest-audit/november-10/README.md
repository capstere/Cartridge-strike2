# Floor 5 player routes and saved characters

**PASS on the published game, 10 November 2026.** Chromium on Apple M1 ran four Classic rounds on the Floor 5 runtime from commit `3451c04`. Each started from the lobby with five Analysts, five Counter Analysts, five neutral zombies and the original two hostages. One team slot received mouse and keyboard input. Nine bots played with normal combat, movement and round rules. [Published build](https://capstere.github.io/Cartridge-strike2/) · [Deployment](https://github.com/capstere/Cartridge-strike2/actions/runs/42721492015)

## Objective routes and spectator controls

| Player slot and seed | What happened in the round |
| --- | --- |
| Counter Analysts · 12 | Bought armor during the opening buy phase, walked 122 m from Transit Lift to I01 North Laboratory and held E. The bomb was planted at 47.27 s at `x −30.67, z −9.14`. The HUD showed 40 seconds on the bomb and 23 health. [Plant screenshot](plant.jpg) |
| Analysts · 93 | Walked 35 m from Cargo Lift through I12, C07, C03, C05 and I02. An opposing bot planted at 63.80 s. The player began defusing at 63.82 s at `x −30.93, z −8.76`. The five-second hold finished at 68.82 s and gave Analysts a 1–0 lead. [Defuse screenshot](defuse.jpg) |
| Counter Analysts · 42 | Walked from Transit Lift to I12 and started an escort at 43.20 s. The first hostage reached rescue at 83.60 s. A teammate brought the second home at 117.07 s for a 1–0 rescue win. The player covered 234 m and finished in I31 Main Atrium at `x 27.36, z 33.06`. [Rescue screenshot](rescue.jpg) |
| Counter Analysts · 42 | On a separate bomb run, the unarmored player covered 123 m and was killed at 45.40 s in I01 at `x −31.04, z −8.89`. The bomb dropped. Right followed C-03 from C-02, and Left returned to C-02. The spectator label and camera coordinates matched each living teammate. [Spectator screenshot](spectate.jpg) |

The browser started each round through the visible team and mode controls and acquired real pointer lock. The route driver used the Floor 5 navigation graph to choose headings, sent keyboard and mouse events to the FPS, and advanced its fixed-step test clock. The game moved all actors, opened doors, applied damage and awarded the rounds. These runs cover the listed routes and encounters. Difficulty, touch comfort and perceived hit feedback still depend on the person playing. [Player-route test](../../../tools/player-routes-browser.mjs)

A separate local browser regression put bots in all ten slots for six rounds across seeds 17, 42 and 93. Both squads used at least two routes per round, and every surviving actor had left the starting lifts by the 12-second check. No measured shot preceded its reaction time. The longest pause while a bot was trying to advance toward an objective was 3.85 seconds. [Bot tactics regression](../../../tools/bot-tactics-browser.mjs)

## Device-local Character Studio pilot

A new Male/T-shirt pilot went through Character Studio’s **Spara för spelet** workflow with the shirt lettering “UNIT FIVE”. The saved GLB was 12,934,548 bytes and contained the original 13 operator clips, 65-joint skins and both boot soles. Its source rig matched the rig bundled with the FPS. The browser loaded the export into an isolated IndexedDB on the game origin. All network requests during the check were reads. [Saved-character test](../../../tools/saved-character-browser.mjs)

| Check | Result |
| --- | --- |
| First and third person | Both factions rendered the saved operator. Two hand meshes and two sleeves used the saved first-person profile. The glove color matched the third-person export. The selected actor's skinned meshes submitted draws from a nearby teammate viewpoint, and the teammate kept the original operator. |
| Loading and replay | Started while rig validation was in progress and cancelled. A controlled HTTP 503 on the next load exposed Retry, which entered the match with the selected character and side. Returning to the lobby and replaying as Analysts used the same export. |
| Incompatible copy | A second local record with the wrong source-rig hash disabled Start and offered Originalkaraktär. Selecting it restored a playable match. A reload retained the fallback and both saved entries. |

## Reproduce

Install the browser dependencies from the [handover](../../../HANDOVER.md#verification). Run these from the repository root. Each test defaults to a local server on port 8765. Set `FPS_TEST_ORIGIN=https://capstere.github.io/Cartridge-strike2` to use Pages. The character test takes a local compatible export and its matching original Male rig. The route test accepts `FPS_CAPTURE_DIR` to save screenshots.

```sh
node tools/player-routes-browser.mjs
FPS_CHARACTER_GLB=/path/to/saved-pilot.glb \
FPS_CHARACTER_RIG=assets/fps/models/quaternius-operator-male.glb \
node tools/saved-character-browser.mjs
```

The earlier 20-cycle lifecycle check passed. Physical iPhone and Android touch, audio, device rotation and background recovery still need handset sessions. [Lifecycle check](../../../tools/match-lifecycle-browser.mjs)
