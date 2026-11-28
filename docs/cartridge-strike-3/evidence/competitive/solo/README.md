# Native Solo competitive modes

The loopback route opens the ordinary homepage, selects Play and Solo, and deploys Free-for-All, Domination and Free-for-All again on Floor 5 Laboratory. It uses a fresh Chromium desktop profile with real mouse and keyboard events, low graphics, muted audio and the normal five-second deployment. All three games ran on the Pi's Broadcom V3D GPU and used unmodified clocks, bots, spawn selection and scores.

The [driver](../../../../../tools/solo-competitive-browser.mjs) observes game construction, movement input and submitted GPU instances. The [full report](report.json) records the frozen head, build, driver digest, initial health and life, measured movement, scoreboard text and capture-zone geometry. The first [individual standings](ffa-standing.jpg), [Domination deployment](domination.jpg) and [fresh individual redeployment](ffa-redeploy.jpg) show the player-facing result. No browser exceptions occurred.

This run requires the FFA scoreboard to label the local player once, display points and describe the individual tie-break order. In Domination it requires readable control-zone status without a competing objective strip, and separation of the visible weapon slots and bonus controls. Each redeployment must reconstruct the game and actor, clear scores and objectives, accept movement input and return to the ordinary setup.

Run the native Wayland driver from the repository with `node --import ./server/register-shared.mjs tools/solo-competitive-browser.mjs`. It writes a fresh report and screenshots under `test-results/solo-competitive/`. The archived report records the script digest before its paths were made repository-relative.
