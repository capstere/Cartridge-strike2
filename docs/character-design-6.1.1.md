# Character Studio 6.1.1 / 6.1.2 — ankle attachment and no human belt

The approved low shoe shape remains. The old placement used only the foot's X
position and assumed world Z=0. Its ankle collar therefore sat forward of the
real ankle and moved rigidly with the foot while the trouser cuff followed the
calf. A static silhouette check did not catch the visible gap in running poses.

The fitter measures the original bind-space ankle, source sole height and actual
trouser cross-section for each rig. The rigid sole still follows the foot and
remains the engine's support anchor. The existing upper's vertices now blend
from foot to calf; the collar overlaps inside the cuff and follows it through
ankle flexion. Human garment fit is tapered off near the ankles so changing
fit cannot slide the cuff away again. Dwarf fit is unchanged.

The automatically generated `duty-belt` and `belt-buckle` are no longer created
for players or hostages. Original GLB bytes, skeleton hierarchy, original 13
clips, AI, weapons, health and collision dimensions are not changed.

Visual review also exposed small waist gaps at enlarged garment fit: the shirt
changed width while trousers only changed depth. The human trousers now use the
shirt's identical transformation at their shared waist vertices, blending into
the trouser fit below. No replacement belt or cover-up geometry is added.
Two additional tests compare the original shared seam in standing, running and
crouching poses at fit 85/100/120 on both rigs.

Save any current project before reloading. The edition label is **6.1.2**.
Open an existing editable project and export **Exportera för spelet (.zip)**
again to include the new shoes and belt removal. Old baked/exported GLB files
are not silently rewritten. The contract records `footwear: ankle-fitted-v2`;
the existing installer and all three role slots are retained.

Verification: `footwear-fit.test.mjs` samples all 13 original clips for both
human rigs and roles. Independent ray/geometry checks verify the collar lies
inside the trousers and the upper remains connected to the rigid sole, also
after garment-fit extremes, GLB reimport and engine override loading. The
browser journey edits real controls, downloads four ZIPs, reopens projects,
renders the actual FPS avatars and saves side-on running-foot and no-belt images.
The test camera frames both posed feet; earlier fixed-origin images clipped them.
It does not certify all combinations of user-authored accessories or performance
on every device. No owner screenshot or private Floor 5 data is published.
