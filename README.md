# Cartridge-Strike 2 — FPS testversion

**[Spela Cartridge-Strike 2](https://capstere.github.io/Cartridge-strike2/)** · [Öppna FPS-lobbyn](https://capstere.github.io/Cartridge-strike2/fps/)

Detta är en separat testversion av **Cartridge-Strike** som endast innehåller det spelbara FPS-spelet och tillhörande spelresurser. Den påverkar inte originalprojektet `capstere/cartridge-strike`.

## Spela

- Välj **Analysts** eller **Counter Analysts**, spelläge och karaktär i lobbyn.
- Tryck **Starta match** direkt. Laddningsskärmen hanterar resten.
- Den egna låten **Preparation** spelas och loopar endast i lobbyn.
- Under matchen: **B** för köpläge, **M** för taktisk karta, **Tab** för resultattavla och **Esc** för paus.
- På mobil rekommenderas **liggande läge**.

## Struktur

- `index.html` — öppnar spelet.
- `fps/` — lobby, HUD, spellägen och responsiv layout.
- `src/fps/` — spelmotor, botar, vapen och spelsystem.
- `levels/` — publicerade banor och manifest.
- `assets/fps/`, `audio/`, `vendor/` — modeller, ljud och Three.js.
- `furniture-editor/build/` och `furniture-editor/library/` — återanvända **nivå- och modellmoduler som FPS-motorn importerar**, inte åtkomliga redigeringssidor.
- `credits.html`, `licenses/` — licenser och attribution.

**OBS:** Den här varianten innehåller inga karaktärs- eller banredigerare. Spelmotorn får fortfarande använda lokalt sparade spelkaraktärer och nivåprojekt som redan är kompatibla.

## Kontroll

Kör från reporoten:

```bash
node --experimental-loader ./tools/vendor-three-test-loader.mjs --test src/fps/*.test.mjs
node tools/verify-owner-runtime.mjs
```

Serva filerna över HTTP(S), inte via `file://`. GitHub Pages serverar `/fps/` automatiskt från projektroten.
