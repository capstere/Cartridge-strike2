# Add an operator palette

Harbor Crew is a complete optional outfit for the existing male and female operators. It reuses the Commando kit with a teal jacket, orange vest, matching gloves and warm visor detail. The default registry ships empty. The wardrobe continues to offer the five original outfits and six account-earned designs.

## Validate and install

In a disposable checkout, run the commands below from the repository root.

```sh
node tools/appearance-import.mjs content/examples/appearance/harbor-crew.json
node tools/appearance-import.mjs --install content/examples/appearance/harbor-crew.json
node tools/build-network.mjs
node tools/build-network.mjs --check
```

Validation reads the actual male and female GLBs. Both fingerprints must match the package. Each model must contain the named kit anchors, jacket, trousers, vest, gloves, embedded images and all thirteen operator clips. The original character validator checks the GLB container and geometry limits. Each receipt records the measured rig, materials, clip names and image counts. The palette contains only colors and an existing kit ID. Runtime drawing and the existing movement, Rush, animation, collision and hit rules continue to use the original operator.

Installation appends the descriptor to [the versioned registry](../../../assets/fps/outfit-packs.json) and writes the entire file atomically. An identical retry returns `already-installed`. Invalid data, conflicting IDs and failed rig checks leave the previous registry intact. The importer serializes writers using a neighboring lock file. If an interrupted authoring run leaves a lock, first verify that no importer is active and then remove the stale lock. Build and stage the resulting registry and compatibility manifest together to qualify the new content.

Use [the Harbor Crew package](../../../content/examples/appearance/harbor-crew.json) as a starting point. Choose a unique lowercase ID, English display name and description, a supported donor kit, and four six-digit RGB values. Provide the creator and a reviewed rights declaration. The example's colors are original project data. The two underlying Quaternius rigs use CC0. The original Riposte kit and camouflage implementation is credited separately. No custom GLB or image is uploaded or fetched by the palette. [Rig attribution](../../../licenses/quaternius-characters-CC0.txt) and [reference credits](../../../licenses/riposte-NOTICE.md).

## Runtime verification

Open the staged game's Outfits panel. Select Harbor Crew and reload. Its real rig portrait, equipped body and first-person sleeves should show the chosen material, and the outfit should survive reload. The public room authority obtains its public and earned IDs from the same roster as the client. An existing challenge ID cannot be installed as a public palette. Private designs stored on the device take precedence over a selected palette.

```sh
node --test tools/appearance-package.test.mjs src/fps/operator-outfits.test.mjs
FPS_TEST_ORIGIN=http://127.0.0.1:8765 node tools/appearance-browser.mjs
```

Point the browser driver at a locally served staging build with the example installed. It compares real thumbnail pixels, default and installed material texels, independent first- and third-person texture handles, preview resource disposal and the ordinary Solo route. It also opens a version-one IndexedDB record with a compatible authored-avatar T-shirt regression GLB in a fresh browser profile and checks its selected rig after deployment. An unmodified source rig is tested separately as an unsupported private export. The authoring exporter is supplied only to the fixture generation page, then removed before the player opens either saved design. Set `FPS_APPEARANCE_EVIDENCE` to choose the output directory.


## Native staging receipt

On a Raspberry Pi 5, Harbor Crew produced a sixth distinct wardrobe portrait and survived selection, reload and normal Solo deployment. Chromium 156 used Broadcom V3D through ANGLE and an isolated Wayland output. A desktop pass captured the [wardrobe](appearance-evidence/desktop-wardrobe.jpg). The complete run used [emulated landscape touch](appearance-evidence/touch-wardrobe.jpg). Its [96 × 112 portrait](appearance-evidence/harbor-crew.png) comes from the wardrobe's ordinary skinned model renderer.

The live first-person sleeve and third-person jacket held independent texture handles. Both had texel digest `60f4af01`. The Commando donor produced `97cdf472`. The female preview released all 36 observed skeleton, material, geometry and texture owners exactly once. The isolated legacy database migrated a compatible T-shirt export supplied by the project's authored-avatar regression fixture and deployed it with the private model signature. Selecting the unsupported source rig kept Start disabled and showed the English recovery message. The [browser report](appearance-evidence/report.json) records zero page errors. The [import receipt](appearance-evidence/import.json) records both input rig hashes, 65 bones, 13 supported clips and three embedded images per rig.

The native build used the appearance code at `91724e7f` and a staging copy served on loopback with the example installed. The desktop pointer-lock path on this virtual output terminated Chromium after the wardrobe capture. The complete run used touch emulation, with physical input qualification tracked separately. [Reproduction hashes](appearance-evidence/identity.json).
