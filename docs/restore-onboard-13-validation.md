# PR #55 — local restore validation (2026-10-30)

The restored candidate is held locally, pending the source/redistribution information for `MS Exel.glb`. The public PR still contains the recovery tools and provenance documentation, not the restored binaries.

## Source integrity

- Input: owner-uploaded `Filer.zip`.
- All 13 missing GLBs match exact byte lengths and SHA-256 values pinned to `capstere/onboard@fef84ac9686014ea960346ed60eea17756f81c0e`.
- Restored payload: 33,492,844 bytes. No re-optimization or binary alterations.
- Full catalog: 28 onboard assets, 154 total entries.
- All 28 GLBs passed structure, checksum and real GLTFLoader/WebGL rendering checks.
- Thumbnails generated with `GENERATE_THUMBS=1`; 13 new PNGs and the catalog are included in the finalized manifest.
- `--finalize`: READY_FOR_TESTS; `--plan`: RESTORED_BINARY_VERIFIED; runtime manifest: 284 files PASS.
- Existing manifest entries are unchanged except the onboard catalog. No changes to FPS code, collision, levels, combat, original assets, vendor or Frontline source.

## Executed checks

- 117 editor/library/level unit tests: PASS.
- 102 owner door traversal checks: PASS.
- 4 synthetic level door traversal checks: PASS.
- `tools/onboard-library-smoke.mjs`: PASS, 28 models, zero page errors.
- `furniture-editor/editor-browser.mjs`: PASS.
- `furniture-editor/build/build-browser.mjs`: PASS.
- `tools/level-browser-smoke.mjs`: PASS, including private/public FPS, Floor 5, save/reopen and 2D without WebGL.
- `tools/direct-browser-smoke.mjs`: PASS, including drag, resize, door/window movement, live FPS and ZIP export.

Local browser: Chromium Headless Shell 140.0.7339.186 with SwiftShader, controlled through the repository-pinned Playwright 1.63.0. The pinned Chromium 153 download failed in this environment; an external test-only launch override selected the available Chromium 140 binary. Repository dependencies and test assertions were not relaxed. Fresh GitHub CI on the complete restore commit is still required before merge.

See [model attribution](onboard-model-attribution.md) for the 12 embedded CC BY 4.0 declarations and the unresolved Excel-logo source. No Actions artifacts were uploaded.
