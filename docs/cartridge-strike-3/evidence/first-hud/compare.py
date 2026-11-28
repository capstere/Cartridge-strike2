"""Compare two matched native first-HUD reports and their waiting-room frames."""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageChops, ImageStat

def summary(data, seat):
    view = data[seat]
    marks = {row[0]:row[1] for row in view['markers']}
    return dict(joinToVisibleHudMs=round(view['joinToHud'],1),
                joinToReadyClickMs=round(marks['waiting ready']-marks['join requested'],1),
                worstLoadingRafMs=round(view['loadingWorstRaf'],1),
                worstLoadingPointerMs=round(view['loadingWorstInput'],1),
                firstPostHudRafMs=round(view['gap'],1),
                longestPostHudPointerMs=max((round(e['delay'],1) for e in view['inputs']),default=None),
                postHudPointerCount=len(view['inputs']))

def receipt(path):
    return path / 'first-hud.json' if path.is_dir() else path

def capture(path, seat):
    if path.is_dir():
        return path / (seat + '-waiting.png')
    return path.with_name(path.stem + '-' + seat + '.png')

def compare(before,after):
    previous=json.loads(receipt(before).read_text())
    current=json.loads(receipt(after).read_text())
    assert all(previous[k]==current[k] for k in ['map','protocol','players','bots'])
    assert all(x['ticks']>0 and x['movement']>.08 for x in [previous,current])
    result={'map':current['map'],'reference':previous['build'],'candidate':current['build'],
            'protocol':current['protocol'],'movementMeters':[previous['movement'],current['movement']],
            'rawSHA256':[hashlib.sha256(receipt(d).read_bytes()).hexdigest() for d in [before,after]]}
    for i,seat in enumerate(['desktop','emulated']):
        images=[]
        for folder in [before,after]:
            with Image.open(capture(folder,seat)) as image:images.append(image.convert('RGB'))
        assert images[0].size==images[1].size
        x,y=previous['waiting'][i],current['waiting'][i]
        assert x['pose']==y['pose'] and x['driver']==y['driver']
        assert not x['scissorTest'] and not y['scissorTest']
        diff=ImageChops.difference(*images)
        pixels=list(diff.getdata())
        result[seat]={'original':summary(previous,seat),'candidate':summary(current,seat),
                      'driver':x['driver'],'pose':x['pose'],'canvas':[[row['width'],row['height']] for row in [x,y]],
                      'draws':[x['calls'],y['calls']],'rgbMeanAbsoluteError':[round(n,3) for n in ImageStat.Stat(diff).mean],
                      'pixelsOver15Of255':round(sum(max(p)>15 for p in pixels)*100/len(pixels),3)}
    return result

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('before',type=Path);parser.add_argument('after',type=Path)
    args=parser.parse_args()
    print(json.dumps(compare(args.before,args.after),indent=2))
