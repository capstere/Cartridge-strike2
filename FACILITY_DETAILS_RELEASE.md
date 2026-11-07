# Cartridge Strike 0.17.0 — facility details and breakable glazing

Owner-requested update over 0.16.0 (`e1764d5627f1e8b217d0988abdc800213ad843bb`). Existing mobile, recoil, HUD, grenade, throwable Cartridge, visual-detail and Frontline features are retained.

## Contents

Twelve toilet/basin pairs occupy the actual modelled WC bays. No closet or cold room is reclassified as a toilet. Lunch/pantry chair upholstery is orange, with frames retained. The long I09 wall-side counter receives two fridges, a freezer, dishwasher, sink and two microwaves; the east pantry receives a sink and microwave. These are decorative appliances, not working kitchen simulations.

Generic bench instruments, centrifuges and cold-storage units dress the two inferred view-through labs, X21 across the southern corridor and X06 opposite NEG. These are artistic illustrations, not a verified inventory of real equipment. The original excluded room volumes stay inaccessible. Exterior-only blue cladding follows the building/void boundary and does not repaint indoor walls.

Architectural glazing is split once into 170 pane records. A firearm hit breaks one pane and its frosting; the breaking shot stops, subsequent shots pass. Glass restores at the next round/match, not an Endless actor respawn. Frames/sills and outside/excluded floor restrictions remain. Navigation and grenade-preview caches invalidate on break and restoration. Up to 128 short-lived cosmetic fragments share one instanced batch, consume no gameplay RNG and have no physical shard simulation.

## Performance and regression safeguards

Static detail pieces merge by material and spatial cell. Glass instance matrices upload on state changes, not every stationary frame. The Octree never retains removed glass triangles. New collision proxies match placed fittings. Opening doors use a 1 mm contact margin to avoid narrow-WC approach deadlock; closing retains the larger safety envelope and exact capsule radius is unchanged.

Automated tests and actual browser reports belong to the PR/checks, not this note alone. Local localhost WebGL testing was unavailable due to the execution environment's browser-network policy; CI runs real Chromium/WebGL instead. Screenshots use arranged legal cameras, not manual match-play or consumer-hardware FPS measurements. Original workplace PDFs, photos and marked reference plans are not included.
