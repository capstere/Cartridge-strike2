# Inspect or qualify a content package

Run these commands from the repository root. The first prints the current catalog. The second resolves a reviewed attachment and shows the compatible Arc Rifle loadout. Both read the checkout and leave saved players, profiles and LevelProjects untouched.

```sh
node tools/content/catalog.mjs list
node tools/content/catalog.mjs check docs/cartridge-strike-3/content/catalog-examples/attachment.json
node --test tools/content-catalog.test.mjs
```

The five small examples cover an [operator and rig](catalog-examples/character.json), [attachment](catalog-examples/attachment.json), [map and ambience](catalog-examples/map.json), [streak reward](catalog-examples/bonus.json) and [mode](catalog-examples/mode.json). A successful check returns each resolved ID, its digest, normalized options, the linked definitions and their digests, public asset paths, a package digest and the catalog digest. A package describing a locked attachment or outfit grants no entitlement. Actual purchases and challenge unlocks use the existing authoritative game paths.

## Package format

A JSON package has exactly four fields. Set `format` to `cartridge-strike-content`, `version` to `1`, choose a stable `id`, and list 1–64 `entries`. Every entry takes `kind` and `id`. A `digest` optionally pins the SHA-256 of the reviewed entry. Unknown properties, versions, duplicate identities and IDs containing paths fail validation. Copy stable IDs from the catalog. Labels are for display.

| Kind | Optional constraints | Runtime source and qualification |
| --- | --- | --- |
| character | rig, outfit | Stock male and female operators support public outfits. Business visitors use the shipped hostage rig. Local customized avatars stay on the existing private import path. |
| rig | | The GLB inspector checks bounded embedded metadata, skin accessors and binary tables. The registry hashes actual joint hierarchy, transforms and inverse bind matrices and requires semantic idle, walk, jog, Rush, air, crouch and death clips. |
| outfit | rig | Public choices come from OUTFITS and EARNED_OUTFITS. An installed palette retains its signed-off creator, license and original rig digests. Challenge outfits reference the exact authority counters they require. |
| weapon | attachments | The displayed stats, Classic price, model system and fitting rules come from the game. At most four compatible attachments can occupy distinct slots. |
| attachment | weapon | The same weaponFits and weaponDefinition used by the arsenal determine compatible families and derived statistics. |
| map | mode plus surface | Valid surfaces are `solo` and `online`. Match the map's exact source and collision digests, preview, version, units, bounds, team starts and existing approved capabilities. |
| mode | map plus surface | Solo and room capabilities are evaluated independently. For example, Compact permits online Free-for-All, and Floor 5 permits Solo Classic. |
| bonus | | Streak ID, slot, threshold, state version and duration come from the existing charge registry. |
| audio | | Firearm recording variants and all three coastal/volcanic ambience banks refer to the released bytes, original recording creator and individual license. Source pack and take distinguish similarly named recordings. |
| bot | | Difficulty and teammate profiles expose existing reaction, burst and damage bounds. |
| theme | | Tactical Industrial reads the game stylesheet's design tokens and full content digest. |
| progression | outfit | The shared definitions list actual counters, targets and earned outfits. Private account state stays outside the package. |

To add a new item, register it in the owning runtime definition and supply the model, recorded footage of ordinary play or match evidence appropriate to that kind. Rebuild the network manifest, validate its referenced package, and check the public distribution and playable surface. A new renderer, simulation mode, navigation solver or authoritative reward needs its own behavior coverage. The existing version-one save, rig and outfit IDs keep their meaning. When changing compatible data, rerun the package with its original pins before adopting updated digests. Changing a package version requires an explicit reader for that version.

## Build and attribution

The build-time adapter imports the existing game IDs and reads the assets those definitions identify. Binary assets and map files have their own byte lengths and SHA-256 values. Each entry's digest covers its attributes and referenced asset hashes. The catalog digest covers the sorted complete result, including map and collision fingerprints. Passing freshly computed map fingerprints keeps the generated network build hash out of its own input. Each entry identifies its runtime source, license or rights record and resource owner. The [catalog adapter](../../../tools/content/catalog.mjs) runs in Node. The browser continues to execute the game modules listed below.

The reference tree is pinned at `d7661a36d439a246464b0d1c060b5f19715ac7ea`. These Git blob prefixes identify the actual donor files used by the ports. The preparation [integration matrix](../RIPOSTE_INTEGRATION_MATRIX.md) carries the full behavior mapping.

| Donor source under frontline/source/src | Exercised CS3 implementation |
| --- | --- |
| 06p-accessoires e481066f6a09 and 06r-arsenal 9bcd314c476d | arsenal.mjs derives compatibility, modifiers and Classic prices. weapon-fittings.mjs renders the loaded configuration. |
| 06ga-tenues 48989b2df0ce, 06gc-tenues-defi fbc67ae6bf25 and 06s-defis 5622e26fe0f8 | operator-outfits.mjs retains the stable wardrobe IDs. character-library.mjs dresses the actual operator. server/progression.mjs awards the trusted counters. |
| 08b-killstreaks 8d4864bf2a6c and 09i-modes 7f8d1258ad7e | bonuses.mjs maintains per-life charges. match-modes.mjs, the Solo catalog and the room use the qualified modes. |
| 02yf-meltem 16f541c40afc, 02u-embruns 6d87b9a4ffa2 and 02yh-tephra d4bd2b3b8f47 | Five reviewed network maps use LevelProjects and server collision fingerprints. The three donor ports use the active reference world and environment implementations. |
| 05-audio e80b7ffcd1f3, 05a-sfx f081b91e470b and 05c-ambiance b55b7a59113b | shotSound selects weapon banks by listener and distance. coastalClipPath selects map-owned ambience with individual attribution from the shipped credits file. |

Catalog inspection reads GLB data through CS3's existing Three r180 character contract. No r147 runtime is loaded. The donor's branding, music, Mixamo clips, reference screenshots, recordings, private GLBs and user profiles have no import route through a descriptor. Compile the existing content from the released asset paths and preserve the [Riposte notice](../../../licenses/riposte-NOTICE.md), [recording credits](../../../licenses/riposte-sfx-credits.json) and [Quaternius attribution](../../../licenses/quaternius-characters-CC0.txt).
