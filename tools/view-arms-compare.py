"""Build matched before/after contact sheets and MP4s from view-arms-capture.cjs."""
import argparse
import json
import subprocess
from statistics import median
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFont

WEAPONS = ['ar47', 'shotgun', 'p9', 'p12', 'cr4', 'smg', 'sniper', 'bazooka', 'knife', 'he', 'flash', 'smoke', 'bomb']
FONT_DIRECTORY = Path('/usr/share/fonts/truetype/dejavu')
FONT = ImageFont.truetype(str(FONT_DIRECTORY / 'DejaVuSans.ttf'), 19)
BOLD = ImageFont.truetype(str(FONT_DIRECTORY / 'DejaVuSans-Bold.ttf'), 21)
INK = '#eff2f2'
PAPER = '#202b30'


def read_sample(root, side, fmt, weapon):
    return json.loads((root / side / fmt / weapon / 'samples.json').read_text())


def compare_run(old, new):
    assert old['settings'] == new['settings'], 'Viewport, graphics or GPU differs'
    assert old['spec'] == new['spec'] and old['fps'] == new['fps']
    assert len(old['samples']) == len(new['samples'])
    for before, after in zip(old['samples'], new['samples']):
        for key in ['time', 'ammo', 'remaining', 'travel', 'camera']:
            assert before[key] == after[key], f'{key} differs at {before["time"]}'


def panel(source, size, crop):
    with Image.open(source) as image:
        w, h = image.size
        if crop:
            # Uniform crop anchored in screen space, shared by all weapons, frames and builds.
            image = image.crop((round(w * .27), round(h * .33), w, h))
        image.thumbnail(size, Image.Resampling.LANCZOS)
        background = Image.new('RGB', size, PAPER)
        background.paste(image, ((size[0] - image.width) // 2, (size[1] - image.height) // 2))
        return background


def pair(root, folder, weapon, filename, size, crop=True):
    left = panel(root / 'before' / folder / weapon / filename, size, crop)
    right = panel(root / 'after' / folder / weapon / filename, size, crop)
    result = Image.new('RGB', (size[0] * 2 + 2, size[1]), PAPER)
    result.paste(left, (0, 0))
    result.paste(right, (size[0] + 2, 0))
    return result


def sheet(root, output, name, rows, size, crop=True):
    w, h = size
    heading, label = 38, 32
    result = Image.new('RGB', (2 * w + 2, heading + (h + label) * len(rows)), PAPER)
    pen = ImageDraw.Draw(result)
    pen.text((12, 6), 'Före', font=BOLD, fill=INK)
    pen.text((w + 14, 6), 'Efter', font=BOLD, fill=INK)
    for i, (folder, weapon, filename, caption) in enumerate(rows):
        top = heading + (h + label) * i
        result.paste(pair(root, folder, weapon, filename, size, crop), (0, top))
        pen.text((12, top + h + 3), caption, font=FONT, fill=INK)
    result.save(output / name, quality=90, optimize=True)


def phase(frame, spec, count):
    if frame < 7:
        return 'Vapenbyte'
    if frame < 13:
        return 'Vila'
    if frame < 27:
        return 'Rörelse'
    if frame < 40:
        if spec['duration']:
            return 'Skott och återgång'
        if spec['name'] == 'Kniv':
            return 'Knivslag'
        return 'Vila'
    if frame < 86:
        return 'Inspektion'
    if spec['duration'] and frame < count - 8:
        return f'Omladdning  {(frame - 85) / 20:.2f} s'
    if 'Cartridge' in spec['name']:
        return 'Kast och vapenbyte'
    return 'Vila'


def film(root, output, fmt):
    size = (506, 238) if fmt == 'touch' else (674, 346)
    w, h = size
    # The source native game buffer is .78x on touch, .85x on desktop in Low.
    frame_size = (2 * w + 2, h + 38)
    process = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24',
        '-s', f'{frame_size[0]}x{frame_size[1]}', '-framerate', '20', '-i', '-', '-an',
        '-c:v', 'libx264', '-threads', '2', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart', str(output / f'{fmt}.mp4')], stdin=subprocess.PIPE)
    chapters = []
    total = 0
    try:
        for weapon in WEAPONS:
            before, after = [read_sample(root, side, fmt, weapon) for side in ('before', 'after')]
            compare_run(before, after)
            chapters.append([weapon, total / before['fps']])
            n = len(before['samples'])
            for i in range(n):
                frame = Image.new('RGB', frame_size, PAPER)
                frame.paste(pair(root, fmt, weapon, f'{i:03}.jpg', size), (0, 38))
                pen = ImageDraw.Draw(frame)
                pen.text((10, 5), f'Före   ·   {before["spec"]["name"]}', font=BOLD, fill=INK)
                pen.text((w + 12, 5), f'Efter   ·   {phase(i, before["spec"], n)}', font=BOLD, fill=INK)
                process.stdin.write(frame.tobytes())
            total += n
    finally:
        process.stdin.close()
        if process.wait():
            raise RuntimeError('ffmpeg failed')
    print(fmt, chapters, f'{total / 20:.2f} s')


def measurements(root, output):
    result = {'camera': 'Floor 5 C08, seed 42', 'devices': {}, 'idle': {}, 'reloadPoseCpuUs': {}, 'appearance': {}}
    for fmt in ['desktop', 'touch', 'wide']:
        result['devices'][fmt] = read_sample(root, 'after', fmt, 'ar47')['settings']
    result['backgroundChecks'] = {}
    for fmt in ['desktop', 'touch']:
        matched = 0
        for weapon in WEAPONS:
            for frame in [12, 21, 27, 54, 91]:
                filename = f'{frame:03}.jpg'
                with Image.open(root / 'before' / fmt / weapon / filename) as a, Image.open(root / 'after' / fmt / weapon / filename) as b:
                    assert a.size == b.size
                    # Unobstructed wall/light reference outside the moving arm silhouette.
                    box = (0, 0, a.width // 2, a.height // 3)
                    assert ImageChops.difference(a.crop(box), b.crop(box)).getbbox() is None
                    matched += 1
        result['backgroundChecks'][fmt] = matched
    result['sprintInspection'] = {side: json.loads((root / side / 'stress' / 'shotgun' / 'metrics.json').read_text())
                                  for side in ('before', 'after')}
    for weapon in WEAPONS:
        old, new = [read_sample(root, side, 'desktop', weapon) for side in ('before', 'after')]
        compare_run(old, new)
        result['idle'][weapon] = {}
        for side, record in [('before', old), ('after', new)]:
            sample = record['samples'][12]
            result['idle'][weapon][side] = {key: sample[key] for key in ('calls', 'triangles')}
    for weapon in ['ar47', 'shotgun', 'p9', 'cr4']:
        result['reloadPoseCpuUs'][weapon] = {}
        for side in ('before', 'after'):
            values = read_sample(root, side, 'wide', weapon)['poseMicroseconds']
            result['reloadPoseCpuUs'][weapon][side] = {
                'median': round(median(values), 2), 'blockMeans': [round(v, 2) for v in values],
            }
    for character in ['short', 'long', 'counters']:
        result['appearance'][character] = {side: read_sample(root, side, character, 'ar47')['appearance']
                                            for side in ('before', 'after')}
    (output / 'measurements.json').write_text(json.dumps(result, indent=2) + '\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', type=Path, help='Directory containing before and after captures')
    parser.add_argument('output', type=Path)
    parser.add_argument('--films', action='store_true')
    args = parser.parse_args()
    root, output = args.root, args.output
    output.mkdir(parents=True, exist_ok=True)
    detail = [
        ('desktop', 'ar47', '012.jpg', 'AR47 · vila'),
        ('desktop', 'ar47', '099.jpg', 'AR47 · magasinet på väg ut, 0,70 s in i omladdningen'),
        ('desktop', 'shotgun', '033.jpg', 'Shotgun · pumpen i bakre läget'),
        ('desktop', 'shotgun', '103.jpg', 'Shotgun · patronen på väg till vapnet'),
        ('desktop', 'p9', '054.jpg', 'P9 · inspektion'),
        ('desktop', 'cr4', '120.jpg', 'CR4 · sista manöver vid tom omladdning'),
    ]
    sheet(root, output, 'grepp.jpg', detail, (550, 251))
    sheet(root, output, 'ovriga-grepp.jpg', [
        ('desktop', 'smg', '012.jpg', 'SMG · grepp under handskyddet'),
        ('desktop', 'sniper', '054.jpg', 'Sniper · inspektion'),
        ('desktop', 'bazooka', '110.jpg', 'Rocket Launcher · omladdning'),
        ('desktop', 'knife', '032.jpg', 'Kniv · sving'),
        ('desktop', 'he', '012.jpg', 'HE · tvåhandsgrepp inför kast'),
        ('desktop', 'bomb', '054.jpg', 'Uppdragsbomb · inspektion'),
    ], (430, 188))
    sheet(root, output, 'spelvy.jpg', [
        ('desktop', 'ar47', 'hud.png', 'Dator · 1280 × 720 · AR47'),
        ('touch', 'shotgun', 'hud.png', 'Emulerad touch · 844 × 390 · shotgun'),
        ('wide', 'ar47', 'hud.png', 'Emulerad touch · 932 × 430 · AR47'),
        ('stress', 'shotgun', 'hud.png', 'Dator · sprint och inspektion under sväng · shotgun'),
    ], (635, 356), False)
    sheet(root, output, 'karaktarer.jpg', [
        ('short', 'ar47', '012.jpg', 'Sparad karaktär med kort ärm · AR47'),
        ('long', 'ar47', '012.jpg', 'Exporterad karaktär med lång ärm · AR47'),
        ('short', 'shotgun', '103.jpg', 'Kort ärm · shotgun under patronmatning'),
        ('counters', 'ar47', '012.jpg', 'Originalkaraktär · Counter Analysts'),
    ], (550, 251))
    measurements(root, output)
    if args.films:
        for fmt in ['desktop', 'touch']:
            film(root, output, fmt)


if __name__ == '__main__':
    main()
