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

Point the browser driver at a locally served staging build with the example installed. It compares real thumbnail pixels, default and installed material texels, independent first- and third-person texture handles, preview resource disposal and the ordinary Solo route. It also opens an original version-one IndexedDB record with a real operator GLB in a fresh browser profile and checks its selected rig after deployment. Set `FPS_APPEARANCE_EVIDENCE` to choose the output directory.
