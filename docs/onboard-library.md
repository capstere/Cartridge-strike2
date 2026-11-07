# Objekt från onboard · 30 oktober 2026

**15 kompletta och verifierade GLB-modeller** från `capstere/onboard` finns nu i Designstudion. Välj **Nytt från onboard** under Möblera. Tillsammans med befintliga objekt finns nu **141 katalogobjekt** (104 kuraterade möbler, 22 procedurmodeller och 15 nya). Flera sökord, svenska och engelska namn samt accentfri sökning stöds.

Varje objekt har 3D-renderad förhandsbild, bredd/djup/höjd, källfil och källcommit samt kontrollsumma (SHA-256). Modellerna laddas först när de används. Figurer, vapen och dörrmodeller är statisk dekor. Skapa en fungerande öppning med byggverktyget **Dörr**.

## Varför 15 i stället för 28?

Astra importerade 28 modeller men GitHub-överföringen trunkerade **13 större GLB-binära filer** till cirka 786 kB. En verifiering mot originalblobbarna i det privata `capstere/onboard` visade att endast 15 filer var identiska med originalen. För att undvika trasiga modeller har de 13 ofullständiga kopiorna och deras förhandsbilder tagits bort från denna PR. De fullständiga originalen finns kvar i `onboard` och kan importeras i ett separat steg med binärsäker överföring.

Tester granskar filstorlek, SHA-256, GLB-format, projektsparning och visning i riktig Chromium/WebGL. Inga ändringar av FPS-kampbalans eller befintlig layout.

## Ny användarvänlighet

- Filtret **Används i banan** hjälper dig återanvända placerade föremål.
- **Rensa sökning och filter** nollställer endast bibliotekets visning.
- Nya kort visar verkliga miniatyrbilder och alla tre måtten.
- Sök med flera ord i valfri ordning, även utan svenska accenttecken.

## Återstående önskemål

1. Återför de 13 större GLB-filerna med fullständiga binärdata.
2. Dela samlingsmodeller till enskilda föremål.
3. Konvertera och optimera återstående Blender-filer.
4. Inför gruppmarkering och sparbara möbelgrupper för återkommande rum.
