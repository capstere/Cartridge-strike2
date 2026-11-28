# CS3-10 competitive match acceptance

The two rendered players register separate accounts through the cold profile route, enter a disposable HTTPS pilot, and join the same Compact Arena room. One uses native Chromium with a keyboard and mouse. The second uses native Chromium emulating a landscape touch phone. Both render on the Pi's Broadcom V3D GPU.

In Free-for-All both players wear the Analysts uniform. Coast equips a Scout Rifle, aims down the scope and fires through the shipped input path. Harbor receives the private killer card and historical scope, returns with a new life, and takes a second shot. Both players see the final replay and their own account rewards. The driver observes actual decoded Web Audio source starts, terminal hit-marker draws and room UI. A short CDP screencast captures the victim's scoped frame before the authoritative respawn.

In the same room, the players start a Domination rematch on opposing teams. They contest B until Harbor uses the touch stick to leave. Coast completes the capture and holds it for the winning score. Both clients submit three capture rings, poles and flags at the authoritative positions. The report records the ring radii, traveled distance and account summaries.

The fixture sets a two-point target and a long timeout. It places each new life on a known clear duel or capture lane. The test checks the original respawn position for collision and overlap before placement. Normal game code owns damage, scoped aim, respawn timing, capture duration, score, replay presentation and account writes.

See [the native report](report.json) for the exact runtime revision, compatibility hash, driver digest, browser, framebuffers, controls, scores, private rewards and rendering observations. The [browser driver](../../../../tools/competitive-browser.mjs) recreates both matches. The [competitive mode tests](../../../../server/test/competitive-modes.test.mjs) also check all fifteen capture points against paths from both bases, Solo outcomes, disconnected occupants and a mode change back to TDM.

## Native result

The complete run passed on runtime `1b3d5643`, protocol 22, with Chromium 156 on Broadcom V3D 7.1.10.2. Both rendered clients reported zero page errors. The death replay drew the confirmed hit at 1,970 ms, following a 1,155 ms cold-frame interval. It played one recorded Scout Rifle shot at volume 0.55. The victim's actual next spawn was clear and did not overlap another player. Both clients presented the final hit and one recorded shot each.

| Match | Shooter account | Opponent account | Observed presentation |
| --- | --- | --- | --- |
| Free-for-All | Two eliminations, two headshots, 55 XP, 300 Scout Rifle XP | Two deaths, 0 XP | [Individual scoreboard](ffa-scoreboard.jpg), [private death scope](mobile-scoped-death.jpg), [public final](desktop-final.jpg), [touch result](mobile-ffa-results.jpg) |
| Domination | One capture, 75 match points, two holding ticks, 25 XP | 0 XP | [Contested B](mobile-contested.jpg), [held B](desktop-held.jpg), [desktop result](desktop-dom-results.jpg), [touch result](mobile-dom-results.jpg) |

Both clients drew three instances of each flag shape, with each ring at the authoritative 2.243 m radius. A touch stick movement of 1.339 m cleared the contest, allowing normal capture and score timing. The verdict and personal receipt fit within the initial 844 × 390 mobile viewport in both matches. Device input was Chromium touch emulation. Physical handset display and touch latency are tracked separately.

## Replay timing regression

On the Pi, the original first scoped death frame appeared 812 ms after delivery. The next draw opportunity arrived 1,255 ms later. Another 877 ms passed before the viewer discarded the clip, even though its current authoritative snapshot still showed the original dead life. The recording contained the lethal hit at 2.733 s. The ordinary respawn, both final replays and both Domination clients continued to work. This occurred on runtime `2807ed95`.

The [timing regression](../../../../server/test/replay.test.mjs) exercises those same intervals. The viewer compares the observed frame cost with the remaining death window and can show the recorded finishing pose early when another draw would miss it. A slow final can also cross the finishing pose. In both cases it presents only a matching firearm shot recorded at the hit time, once. A new life, changed recipient, match change or replay skip still invalidates the clip immediately.

On the corrected runtime `a1698a9f`, the victim saw the scope at 813 ms, then at 2,071 ms the renderer drew the lethal marker at full opacity and began one 1.6 s Scout Rifle buffer at volume 0.55. The viewer still belonged to the original dead life. The victim's subsequent life cleared playback. The compositor selector was updated to read the unobstructed side masks after the compact replay moved its controls into the lower corners.

The [timing comparison](timing-comparison.json) preserves the receipt, first and subsequent scoped frames, terminal WebGL marker and Web Audio observations from both diagnostic runs. The complete passing report includes every sampled playback update.

## Final results, Solo and earned outfits

The [signed final verdicts](verdicts/summary.json) show the individual winner and both account receipts in the initial mobile viewport. [Free-for-All](verdicts/mobile-ffa-results.jpg) lists individual points. [Domination](verdicts/mobile-dom-results.jpg) credits the successful capture to Coast and displays the team’s final score. The [native Solo journey](solo/README.md) exercised Free-for-All, Domination and a second Free-for-All on Floor 5 using actual inputs, and verified fresh actors and zone cleanup on each return.

The [wardrobe result](wardrobe/earned-wardrobe.json) records 11 distinct portraits, all six earned outfits, equipped Yellow Vest in Solo and guest fallback on logout. The [first- and third-person swatch measurements](wardrobe/wardrobe-run.json) used separate textures with matching pixels on the real loaded rig.
