# Class and arsenal acceptance

The workshop follows the class selection shown in IMG_8151. Riposte modules 06p, 06q and 06r supply the attachment families, finishes and progression rules. Modules 09n and 09o inform editing and inspection. CS3 applies those choices to existing team weapons, normal Solo deployment and the authoritative Classic shop. The program uses a disposable account with seeded entitlements for the unlock tests until CS3-10 connects earned weapon progression.

## Authority and existing content

On the Raspberry Pi, 12 account, two-client class, Classic and equipment tests passed. The final private class refresh through reconnect and map changes passed a second time on local revision 8c10b6e. See [individual test results](authority.json). The account tests opened and restored a private fixture database. The socket tests checked paid Classic classes, rejected choices and purchases, and current public equipment alongside private pending class data. Dropping and recovering a fitted weapon preserved the remaining ammunition, camo and attachments. A later independent check added actual vertical and obstructed pickup cases. All nine focused gameplay and model tests passed on 03068ee.

## Workshop and presentation

The normal HTTPS guest flow reached Solo with the selected Scout Rifle. A different signed-in account saved and reloaded a custom rifle with gear and smoke in its own slot. At 390 by 844 the Solo character panel intercepted the mode button. Source revision 56eee39 corrected the portrait grid, displayed actual aiming FOV, exposed individual team-weapon unlocks and allowed the shared lobby renderer to prepare the weapon thumbnails during admission. On the corrected protocol-21 build at local revision 84289a4, the normal keyboard and pointer journey completed in headed Pi Chromium using V3D. The shared rifle kept its level-two optic locked when only one team weapon had earned it. Selecting that team's variant made the optic available. The signed-in slot survived reload and deployed in Endless with the selected optic, suppressor, Desert finish and one smoke cartridge. The portrait Solo mode and Start controls accepted ordinary clicks. These were resized desktop Chromium trials. Physical-phone experience remains unmeasured.

The [guest workshop](guest-workshop.jpg) shows a Scout Rifle and sidearm from the real model pipeline. The [signed portrait workshop](custom-portrait.jpg) shows the fitted rifle. In [two catalog sweeps](arsenal-fittings.json), all 17 [rendered configurations](arsenal-fittings.jpg) were distinguishable. After each sweep the renderer reported 415 geometries and 127 textures. [Deployment and thumbnail measurements](workshop.json) include rotation and independent primary/sidearm pixels.

Reproduce the complete workshop on the isolated checkout with installed development dependencies. For native Raspberry Pi Chromium use the same headed Wayland and V3D configuration as the previous wardrobe and navigation trials.

```sh
node tools/build-network.mjs --check
node --import ./server/register-shared.mjs --test src/fps/arsenal.test.mjs src/fps/weapon-fittings.test.mjs
node --import ./server/register-shared.mjs --test --test-concurrency=1 server/test/online-arsenal.test.mjs
node tools/arsenal-browser.mjs
```

The last command creates its own TLS room service and disposable account database. FPS_ARSENAL_EVIDENCE selects the destination for normal menu captures, class deployment and fitted-model GPU receipts. The fixture serves its own checkout.

The [joined mobile, navigation and arsenal trial](integrated-workshop.json) repeated both normal journeys with 720 manifest entries. The same five thumbnail comparisons and final equipment matched. The two completed GPU catalog sweeps each ended at 404 geometries and 126 textures on the joined client.
