#!/usr/bin/env python3
"""Import the pinned, MIT-licensed Riposte 5.6.0 engine as Cartridge Strike: Frontline.

Rebuilds playable static files, preserving MIT / third-party attribution while
excluding non-redistributable Riposte artwork, music, and Mixamo animations.
Requires Python 3, Git, Node.js (for upstream JS syntax check).
"""
from __future__ import annotations

import base64
import datetime
import json
import math
import re
import shutil
import struct
import subprocess
import tempfile
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "frontline"
UPSTREAM = "https://github.com/BenDBSS/Riposte-Frontline-Source.git"
UPSTREAM_SHA = "31ca050d8ce59f4885c01a3237f68cdf186c9b60"
PUBLIC_URL = "https://capstere.github.io/cartridge-strike/frontline"
EXCLUDED = {
    "assets/logo.webp",
    "assets/apercu.jpg",
    "assets/rankup.mp3",
    "assets/sfx/fin/m_victory.mp3",
    "assets/sfx/fin/m_defeat.mp3",
}
RESTRICTED_PREFIXES = (
    ".git/", "dist/", "assets/deck/", "assets/icon/", "assets/anim/",
)
TEXT_EXTS = {".py", ".js", ".mjs", ".json", ".html", ".css", ".txt", ".md", ".sh", ".webmanifest"}


def run(*cmd: str, cwd: Path | None = None) -> None:
    subprocess.run(cmd, cwd=cwd, check=True)


def copy_redistributable(src: Path, dst: Path) -> int:
    count = 0
    for entry in src.rglob("*"):
        rel = entry.relative_to(src).as_posix()
        if rel in EXCLUDED or rel == ".git" or any(rel.startswith(prefix) for prefix in RESTRICTED_PREFIXES):
            continue
        if not entry.is_file() or entry.is_symlink():
            continue
        output = dst / rel
        output.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(entry, output)
        count += 1
    return count


def chunk(tag: bytes, data: bytes) -> bytes:
    body = tag + data
    return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xffffffff)


def png_bytes(width: int, height: int, color_at) -> bytes:
    data = bytearray()
    for y in range(height):
        data.append(0)
        for x in range(width):
            data.extend(color_at(x, y, width, height))
    result = b"\x89PNG\r\n\x1a\n"
    result += chunk(b"IHDR", struct.pack(">2I5B", width, height, 8, 6, 0, 0, 0))
    result += chunk(b"IDAT", zlib.compress(bytes(data), 8))
    return result + chunk(b"IEND", b"")


def icon_color(x: int, y: int, w: int, h: int) -> tuple[int, int, int, int]:
    nx, ny = (x - w * .5) / min(w, h), (y - h * .5) / min(w, h)
    radius = math.hypot(nx, ny)
    bg = (int(15 + 12 * x / w), int(22 + 20 * y / h), int(33 + 24 * x / w), 255)
    ring = .285 < radius < .395 and not (nx > .21 and abs(ny) < .18)
    inset = .18 < radius < .27 and nx < -.09 and abs(ny) < .045
    if ring or inset:
        return (255, 192 + int(35 * (1 - y / h)), 56, 255)
    if abs(nx + ny * .32) < .009 and radius < .44:
        return (58, 97, 123, 255)
    return bg


def preview_color(x: int, y: int, w: int, h: int) -> tuple[int, int, int, int]:
    gradient = int(12 + 40 * y / h)
    bx = x / w
    c = (12 + int(19 * bx), 19 + gradient // 2, 33 + gradient, 255)
    if .11 < bx < .37:
        s = min(w * .27, h * .52)
        nx, ny = (x - w * .24) / s, (y - h * .5) / s
        rad = math.hypot(nx, ny)
        if .285 < rad < .39 and not (nx > .22 and abs(ny) < .20):
            return (246, 182, 42, 255)
    if x > w * .48 and abs(y - h * .61 + (x - w * .48) * .16) < h * .012:
        return (170, 127, 52, 255)
    return c


def write_branding(assets: Path) -> None:
    (assets / "icon").mkdir(parents=True, exist_ok=True)
    svg = """<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="230" viewBox="0 0 1000 230">
    <rect width="1000" height="230" rx="12" fill="#0c1521"/>
    <path d="M159 41 A70 70 0 1 0 159 189" stroke="#f5bc42" stroke-width="22" stroke-linecap="square" fill="none"/>
    <path d="M175 62 L175 168" stroke="#526d88" stroke-width="8"/>
    <text x="230" y="116" font-family="Arial,Helvetica,sans-serif" font-size="68" font-weight="900" fill="#f7f8f6" letter-spacing="2">CARTRIDGE STRIKE</text>
    <text x="233" y="170" font-family="Arial,Helvetica,sans-serif" font-size="38" font-weight="700" fill="#f5bc42" letter-spacing="13">FRONTLINE</text>
    </svg>"""
    (assets / "logo.svg").write_text(svg, encoding="utf-8")
    for name, size in {
        "favicon-64": 64,
        "favicon-96": 96,
        "apple-touch-icon": 180,
        "icon-192": 192,
        "icon-512": 512,
        "maskable-192": 192,
        "maskable-512": 512,
    }.items():
        (assets / "icon" / (name + ".png")).write_bytes(png_bytes(size, size, icon_color))
    png = (assets / "icon" / "favicon-64.png").read_bytes()
    ico = b"\x00\x00\x01\x00\x01\x00" + struct.pack("<BBBBHHII", 64, 64, 0, 0, 1, 32, len(png), 22) + png
    (assets / "icon" / "favicon.ico").write_bytes(ico)
    (assets / "apercu.png").write_bytes(png_bytes(1200, 630, preview_color))


def replace_once(text: str, before: str, after: str, label: str) -> str:
    if text.count(before) != 1:
        raise RuntimeError(f"{label}: expected exactly one occurrence, got {text.count(before)} of {before[:100]!r}")
    return text.replace(before, after)


def patch_builder(builder: Path) -> None:
    text = builder.read_text(encoding="utf-8")
    text = replace_once(
        text, '"png" if path.endswith(".png") else "webp"',
        '"svg+xml" if path.endswith(".svg") else ("png" if path.endswith(".png") else "webp")',
        "SVG logo support"
    )
    text = replace_once(text, 'data_uri("assets/logo.webp")', 'data_uri("assets/logo.svg")', "new logo")
    text = replace_once(
        text, '"rankup":base64.b64encode(open("assets/rankup.mp3","rb").read()).decode("ascii")',
        '"rankup":""', "restricted music removal"
    )
    text = replace_once(text, 'data=open("assets/apercu.jpg","rb").read()', 'data=open("assets/apercu.png","rb").read()', "new preview")
    text = replace_once(text, '+".jpg"', '+".png"', "preview extension")
    text = replace_once(text, 'dist/icons/apercu.*.jpg', 'dist/icons/apercu.*.png', "preview glob")
    start = text.index('DECK=("installer.sh"')
    end = text.index('shutil.copyfile("assets/icon/favicon.ico"', start)
    text = text[:start] + '# Steam Deck installer and branded artwork are not redistributed. Use the web PWA.\n' + text[end:]
    text = replace_once(text, 'SITE="https://www.playriposte.com"', f'SITE="{PUBLIC_URL}"', "canonical URL")
    text = replace_once(text, 'json.dump({"id":"/","name":', 'json.dump({"id":"/cartridge-strike/frontline/","name":', "PWA app identity")
    builder.write_text(text, encoding="utf-8")


def patch_audio(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    rate, length = 48000, 2304
    samples = bytearray()
    for i in range(length):
        t = i / rate
        env = math.exp(-t * 58)
        tone = (math.sin(2 * math.pi * 196 * t) * .62 + math.sin(2 * math.pi * 294 * t) * .20) * env
        value = max(-127, min(127, round(tone * 127)))
        samples.append(value & 255)
    replacement = "const HIT_SAMPLE = '" + base64.b64encode(samples).decode("ascii") + "';"
    text, count = re.subn(r"const HIT_SAMPLE = '[^']*';", lambda _: replacement, text)
    if count != 1:
        raise RuntimeError(f"Could not replace third-party HIT_SAMPLE: {count} matches")
    path.write_text(text, encoding="utf-8")


def patch_service_worker(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    text = text.replace("const CACHE = 'cod-fichiers-v1';",
                        "const CACHE = 'cartridge-strike-frontline-v1';")
    text = text.replace("const IMMUABLES = /^\\/(tex|sfx|maps|icons)\\//;",
                        "const IMMUABLES = /\\/(tex|sfx|maps|icons)\\//;")
    text = text.replace("if (k !== CACHE) await caches.delete(k);",
                        "if (k.startsWith('cartridge-strike-frontline-') && k !== CACHE) await caches.delete(k);")
    path.write_text(text, encoding="utf-8")


def rebrand_text(src: Path) -> None:
    for path in src.rglob("*"):
        if not path.is_file() or path.suffix not in TEXT_EXTS:
            continue
        rel = path.relative_to(src).as_posix()
        if rel in {"LICENSE", "NOTICE.md", "README.md", "assets/sfx/credits.json"}:
            continue
        contents = path.read_text(encoding="utf-8")
        contents = contents.replace("Riposte: Frontline", "Cartridge Strike: Frontline")
        contents = contents.replace("Riposte Frontline", "Cartridge Strike Frontline")
        contents = contents.replace("Riposte", "Cartridge Strike")
        contents = contents.replace("https://www.playriposte.com", PUBLIC_URL)
        contents = contents.replace("playriposte.com", "capstere.github.io")
        if rel == "shell.html":
            contents = contents.replace('href="/favicon.ico"', 'href="favicon.ico"')
            contents = re.sub(r'<meta name="google-site-verification"[^>]*>\s*', '', contents)
        if contents != path.read_text(encoding="utf-8"):
            path.write_text(contents, encoding="utf-8")


def validate(src: Path, html: Path) -> None:
    for rel in (
        "assets/anim/clips.bin", "assets/anim/clips.json",
        "assets/rankup.mp3", "assets/logo.webp",
        "assets/sfx/fin/m_victory.mp3", "assets/sfx/fin/m_defeat.mp3",
    ):
        if (src / rel).exists():
            raise RuntimeError(f"Restricted original asset still present: {rel}")
    page = html.read_text(encoding="utf-8")
    if "Cartridge Strike: Frontline" not in page or "__BUILD_ID__" in page:
        raise RuntimeError("Built page branding/version marker invalid")
    for ext in ("tex", "sfx", "icons", "maps"):
        if not (TARGET / ext).is_dir():
            raise RuntimeError(f"Missing runtime asset directory: {ext}")


def main() -> None:
    if TARGET.exists():
        shutil.rmtree(TARGET)
    with tempfile.TemporaryDirectory(prefix="riposte-source-") as tmp:
        repo = Path(tmp) / "upstream"
        run("git", "clone", "--quiet", "--depth", "1", UPSTREAM, str(repo))
        sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo, text=True).strip()
        if sha != UPSTREAM_SHA:
            raise RuntimeError(f"Upstream moved from pinned {UPSTREAM_SHA} to {sha}; review and repin explicitly")
        src = TARGET / "source"
        count = copy_redistributable(repo, src)
    print(f"Copied {count} permitted upstream files at commit {UPSTREAM_SHA}")
    write_branding(src / "assets")
    patch_builder(src / "build.py")
    patch_audio(src / "src/05-audio.js")
    patch_service_worker(src / "assets/pwa/sw.js")
    rebrand_text(src)
    (src / "changelog.json").write_text(json.dumps([{
        "version": "5.6.1",
        "date": "2026-10-26",
        "changes": [{
            "t": "new",
            "x": "Édition Cartridge Strike fondée sur le moteur libre du jeu original.",
            "x_en": "Cartridge Strike edition based on the original MIT-licensed engine."
        }]
    }], ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    run("python3", "build.py", cwd=src)
    dist = src / "dist"
    html_candidates = sorted(dist.glob("*.html"))
    if len(html_candidates) != 1:
        raise RuntimeError(f"Expected one built game HTML, found: {html_candidates}")
    shutil.copy2(html_candidates[0], TARGET / "index.html")
    for item in dist.iterdir():
        if item == html_candidates[0]:
            continue
        target = TARGET / item.name
        if item.is_dir():
            shutil.copytree(item, target)
        else:
            shutil.copy2(item, target)
    shutil.rmtree(dist)
    (TARGET / "README.md").write_text(
        "# Cartridge Strike: Frontline\n\n"
        "Playable standalone FPS version using the published Riposte: Frontline 5.6.0 engine.\n"
        "Play: [Frontline](./index.html) | Existing game: [Cartridge Strike](../fps/).\n\n"
        "The original JavaScript, procedural maps, weapons, bots, combat, UI, mobile/gamepad controls "
        "and browser-to-browser PeerJS multiplayer are provided in source/.\n"
        "An original brand, logos, app icons, OG preview and synthetic hit sound are substituted. "
        "Restricted music and Mixamo-derived animation clips are not redistributed. "
        "The game's procedural animation fallback is used. The official accounts, leaderboard, "
        "friend system and server-hosted public matchmaking are not in the upstream release. "
        "PeerJS online play requires an internet connection and a compatible browser.\n\n"
        "**Attribution:** original engine Copyright (c) 2026 BenDBSS, under MIT. "
        "See [LICENSE](./source/LICENSE), [NOTICE.md](./source/NOTICE.md) and "
        "[recorded audio credits](./source/assets/sfx/credits.json). "
        "Original project: https://github.com/BenDBSS/Riposte-Frontline-Source\n\n"
        "To rebuild: python3 tools/import_riposte.py from the repository root. "
        f"Pinned upstream commit: {UPSTREAM_SHA}.\n",
        encoding="utf-8"
    )
    (TARGET / "import-manifest.json").write_text(json.dumps({
        "name": "Cartridge Strike: Frontline",
        "source": "BenDBSS/Riposte-Frontline-Source",
        "upstream_sha": UPSTREAM_SHA,
        "upstream_license": "MIT with NOTICE.md exclusions",
        "imported": datetime.date.today().isoformat(),
        "original_sfx_credits": "source/assets/sfx/credits.json",
        "excluded": sorted(EXCLUDED) + list(RESTRICTED_PREFIXES),
        "runtime": "frontline/index.html",
    }, indent=2) + "\n", encoding="utf-8")
    validate(src, TARGET / "index.html")
    print("Standalone Frontline build prepared at frontline/index.html")


if __name__ == "__main__":
    main()
