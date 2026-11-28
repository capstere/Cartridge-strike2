# Floor 5 Rush input delivery

The corrected Pi touch sample spent 74.5 of the 87.4 ms before the document's pointer callback inside the game's renderer or its simulation update. The renderer occupied parts of three frames while the stick still had its walking value. Their intervals were 0–6.8, 14.8–43.7 and 58.7–83.3 ms relative to the Chromium event timestamp. World submission accounted for 47.2 ms within those draws. The paired touch callback arrived 0.4 ms after the pointer callback. The first shifted simulation step finished 2.1 ms after the pointer callback.

| Fresh process and geometry | Event to pointer or key callback | Renderer, including world | World alone | Game update | Time outside renderer and update |
| --- | ---: | ---: | ---: | ---: | ---: |
| Emulated touch, original | 153.1 ms | 128.4 ms | 114.1 ms | 7.7 ms | 17.0 ms |
| Emulated touch, corrected | 87.4 ms | 60.3 ms | 47.2 ms | 14.2 ms | 12.9 ms |
| Keyboard, original | 56.0 ms | 46.3 ms | 39.9 ms | 6.4 ms | 3.3 ms |
| Keyboard, corrected | 26.1 ms | 24.8 ms | 20.1 ms | 0.0 ms | 1.3 ms |

Each row represents one traced gesture. In the twelve independent continuously running actions, original keyboard callback latency ranged from 51.5–71.6 ms and corrected keyboard from 28.7–31.2 ms. Original emulated touch ranged from 113.6–201.0 ms and corrected touch from 87.0–114.6 ms. The paired touch callback followed the scored pointer by 0.2–0.3 ms in all six untraced touch runs. These measurements cover the normal, moving low-quality Floor 5 Solo game on the same Pi 5 and Chromium version.

## What the saved events establish

The driver sends the second stick move through Chromium's DevTools input API. Its browser-generated event timestamp and the capture-phase listener's performance.now() use the page clock. Desktop uses Playwright's keyboard input. Neither source measures hardware sensing. The Riposte joystick resolves its run threshold in its pointer handling and supplies sprint to updatePlayer. The active CS3 stick owner similarly updates the run state in MobileControls' pointermove handler. Game.update subsequently reads the resolved state. The intervals above finish at document capture, before the stick handler runs.

The page's JavaScript thread was inside synchronous renderer and update calls for most of the measured time. This is wall-clock occupancy and includes any native driver wait inside those calls. Input routing and those calls can overlap in time. The measured 12.9 ms outside the two instrumented calls includes other browser and page work. Both isInputPending samples taken at game-update entry in the corrected touch window returned false.

The saved compositor recorder retained animation frames, presentation feedback and the submitted-weapon mark. It discarded input routing, coalescing, task queues and EventLatency stages. Establishing when a move became dispatchable needs the browser, compositor and renderer input-flow events joined to the exact move and its enclosing main-thread tasks. Physical handset input-to-display still needs separate hardware measurement.

## Reproduce

Run the reducer with the two private capture roots used for the existing door comparisons. It verifies every input against the published SHA-256 digest, pairs each stick move with its pointer by timestamp and coordinates, clips each renderer/update span to the callback window, and rejects overlapping spans before summing. The retained summary includes all four traced and twelve untraced inputs.

```sh
cd docs/cartridge-strike-3/evidence/rush/latency
python3 input-delivery.py /path/to/resume-presentation /path/to/resume-timing > /tmp/cs3-input-delivery.json
cmp input-delivery.json /tmp/cs3-input-delivery.json
```

[Per-input measurements](input-delivery.json) · [Original timing, rendering and presentation methods](https://github.com/capstere/Cartridge-strike2/blob/a1a3ff62e04a3a2174cf989b2880c7c8c2131845/docs/cartridge-strike-3/evidence/rush/latency/README.md)
