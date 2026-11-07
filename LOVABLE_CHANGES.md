<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

- The Cartridge-Strike game, studios and editors are plain static files in public/ (migrated from GitHub Pages); `/` redirects to /fps/. Why: the source is a no-build static site with browser-local saves and no backend.
- vite.config.ts has a dev-only middleware mapping folder URLs in public/ to their index.html. Why: Vite dev doesn't serve directory indexes; production hosting does.

- Visual identity lives in public/ui/cs-theme.css, loaded after each page stylesheet and scoped by body classes (cs-char, cs-furn, cs-build, cs-hub). Why: restyle without touching DOM IDs the studio scripts depend on.
- The FPS lobby (public/fps/lobby.css + public/src/fps/lobby-stage.mjs) is presentation-only: it reads/drives app.mjs state through the existing DOM IDs and imports character-library.mjs with the same ?v query so the private character install is shared. Why: keep the engine untouched.
- Character Studio layout lives in public/character-design/studio-shell.{mjs,css}: it moves existing DOM (by id) into top bar / rail / stage / panel and drives app.mjs only via its own buttons/selects. Why: redesign without touching the editing engine or export formats.
- Level Studio layout (furniture-editor/new.html) lives in public/furniture-editor/level-shell.{mjs,css}: it moves existing DOM by id into top bar / rail / contextual pane / stage / inspector and drives new.mjs only by clicking its original buttons (tabs, save, preview, stageFocus). Why: redesign without touching the level engine, collision or export formats.
- Phone-landscape layout and the portrait "vrid telefonen" prompt live in public/ui/cs-mobile.{css,mjs}, loaded last on the lobby and both studios; rules only apply at landscape max-height:520px or portrait max-width:600px. Level Studio pinch-zoom is forwarded as wheel events the editor already handles. Why: phone support without touching engines or desktop layouts.
- In-game UI (HUD, buy, pause, scoreboard, results, touch buttons) is restyled by public/fps/hud.css (loaded last) plus public/src/fps/hud-shell.mjs, which only regroups/annotates DOM that app.mjs renders (shop buttons keep their onclick → game.buy) and tags winners/team on <html>. Why: unify the visual identity without touching game logic.
- Lobby theme music and the lobby → loading → match flow live in public/src/fps/match-flow.mjs (+ public/fps/match-loading.css). It intercepts #start clicks in capture phase, shows the loading screen, and re-clicks the original #start once app.mjs hides #loading; music uses its own Web Audio context, the track is a Lovable Assets pointer at public/audio/lobby-theme.mp3.asset.json. Why: immediate start without touching app.mjs match setup or game audio.

## Integration
Copy these files over the root of the original repository (this folder = the GitHub Pages site root). The lobby theme is audio/Preparation.mp3; match-flow.mjs loads it directly on any static host. No new dependencies or build step.
