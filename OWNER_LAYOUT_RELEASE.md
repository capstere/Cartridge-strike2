# Cartridge Strike 0.16.0 — owner layout v1

This integrates the owner-approved floor plan over public 0.15.3 (e9994b15994104488edd1b20a938c0567c125e03), retaining its mobile input, recoil/ADS, clean HUD, grenade trajectory, throwable-cartridge visuals and rendering/cache improvements.

Only the generated geographical data, shared world builder, doors, furnishings and layout planning change. Visible geometry, movement collision, bullet collision and navigation use the same map. Window banks and full-height glazing remain solid for movement and bullets. D01–D03 are sealed elevator fronts; D04/D06/D07/D08 have readers. D05 has no door (the owner-drawn red wall remains). D01T is a sealed future terrace door. I33 receives lobby furniture. Six WC bays, two lounge groups and five lunch tables are source-authored.

No workplace PDF, marked image, original photo, private source history or original reference documents are distributed. Scale and furniture heights are provisional game units, not a surveyed architectural model. Elevator travel and terrace traversal are intentionally not implemented.

The prior public manifest had seven stale runtime hashes. This release records all 191 present game runtime files from actual bytes. Prior release provenance is retained explicitly as historical; it is not presented as current hash approval.

Verification: deterministic gameplay regressions, 102 bidirectional door traversals, owner geometry contracts, eight existing/current browser suites plus full runtime integrity. Actual CI outcomes belong to the PR/checks; this note alone is not a claim that a pending run passed. Browser screenshots use arranged valid camera fixtures and software rendering, not hardware FPS measurements or manual match balance.
