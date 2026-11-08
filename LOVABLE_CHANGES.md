# Cartridge-Strike 2 — game-only release notes

This repository is an isolated **FPS-only** playtest build based on Lovable RC1. It is not the original game repository.

- `fps/` and `ui/` contain the Tactical Industrial FPS lobby, HUD, loading, audio, and mobile styling.
- `src/fps/` contains the existing game simulation and player systems.
- `audio/Preparation.mp3` is the original lobby-only theme.
- The reusable level and model code under `furniture-editor/build/` and `furniture-editor/library/` is required by the runtime and remains included. It contains no public editor pages.
- Standalone authoring pages, tools and links were removed for this game-only branch.
- No gameplay data, level geometry, or character-export contracts were modified as part of the UI removal.
