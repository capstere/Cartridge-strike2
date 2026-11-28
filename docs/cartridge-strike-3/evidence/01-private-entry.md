# CS3-01 private multiplayer entry

From the normal Pi entry, a guest sees the English server invite form and its separate family password or private-room step. The family deep link, cookie scope, room proof, host preferences and invite-free share URL follow the existing CS2 authority. The admission form uses its own inline styling under the existing nonce policy because static game assets require a pilot session.

The share, roster, ready, map and result panels display server-confirmed room state. The browser maps SDK failures to an English catalog ID and an explicit recovery action. A wrong family password keeps the room form open. An expired server session exposes the working sign-in link. An unknown SDK failure has a fixed fallback. The server and browser share the English access catalog on the runtime allowlist.

IMG_8160 supplies Play → With friends. IMG_8161 supplies the distinction between participant identity, readiness and host start. The source navigation model is in frontline/source/src/09e-menus.js. CS3 preserves its existing Colyseus access and team authority. Optional accounts, invitation exchange and saved authorization belong to CS3-04.

Local verification on the Raspberry Pi used `node --experimental-loader ./tools/vendor-three-test-loader.mjs --test tools/network-lan.test.mjs` (7 passed), `node --import ./server/register-shared.mjs --test server/test/pilot-access.test.mjs` (4 passed), `npm run build --prefix server -- --check` and `node tools/verify-owner-runtime.mjs` (529 files). Full rendered lobby, denied/authorized entry, expiry, re-login and reconnect checks run through the existing FPS regression workflow on the feature PR.
