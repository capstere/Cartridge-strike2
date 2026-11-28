"""Reduce one native cold-sightline.json without publishing room or participant identifiers."""
import hashlib
import json
import math
import sys
from pathlib import Path


def distribution(items):
    values = sorted(items)
    if not values:
        return {"count": 0}
    def percentile(p):
        return round(values[max(0, math.ceil(len(values) * p) - 1)], 2)
    return {"count": len(values), "p50": percentile(.50), "p95": percentile(.95),
            "p99": percentile(.99), "max": percentile(1), "over100": sum(x > 100 for x in values),
            "over250": sum(x > 250 for x in values), "over1000": sum(x > 1000 for x in values)}


def gaps(stamps, begin, end):
    return distribution(b - a for a, b in zip(stamps, stamps[1:]) if begin <= b <= end)


def period(startup, begin, end):
    raf = startup.get("raf", [])
    pointers = [(t, stamp) for t, stamp in startup.get("input", []) if begin <= t <= end]
    return {"duration": round(end-begin, 2),
            "raf": distribution(dt for t, dt in raf if begin <= t <= end),
            "trustedPointerDelay": distribution(t-stamp for t, stamp in pointers),
            "trustedPointerCallbackGap": gaps([t for t, _ in pointers], begin, end)}


def compact(file):
    data = file.read_bytes()
    record = json.loads(data)
    start = record["beforePlacement"]
    server = [t for t, _ in record["server"]]
    shared_end = min(v["origin"] + v["frames"][-1]["end"] for v in record["views"])
    result = {"sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data),
              "build": record.get("build"), "focus": record["focus"], "touchTurn": record.get("turn", False),
              "nodeObserverInterval": gaps(server, start, shared_end), "seats": {}}
    for label, view in zip(["desktop", "touchEmulated"], record["views"]):
        request = start - view["origin"]
        all_frames = view["frames"]
        selected = [f for f in all_frames if f["start"] >= request]
        if not selected:
            continue
        end = selected[-1]["end"]
        visible = [f for f in selected if f["modelVisible"]]
        longest = max(selected, key=lambda f: f["end"]-f["start"])
        renderer = view["renderer"]
        cues = [{"sample": c["take"], "elapsed": round(c["elapsed"]*1000, 2)} for c in view["reload"]["cues"]]
        seat = {"renderer": {k: renderer[k] for k in ["backend", "quality", "mobile", "parallelCompile"] if k in renderer},
                "normal": all(f["visibility"] == "visible" and not f["pausePanel"] and not f["paused"] for f in selected),
                "render": distribution(f["end"]-f["start"] for f in selected),
                "renderStartInterval": gaps([f["start"] for f in all_frames], request, end),
                "rafInterval": gaps([f[0] for f in view["raf"]], request, end),
                "javascriptPatchCallbackInterval": gaps([p[0] for p in view["patches"]], request, end),
                "firstVisibleStartAfterRequest": round(visible[0]["start"]-request, 2) if visible else None,
                "firstVisibleCompletionAfterRequest": round(visible[0]["end"]-request, 2) if visible else None,
                "stationaryTargetXZ": len({tuple(f["actor"][:2]) for f in selected if f["actor"]}) == 1,
                "visibleModel": next((f["mesh"] for f in all_frames if f.get("mesh")), None),
                "slowFrame": {"gpuCountsBefore": longest["before"], "gpuCountsAfter": longest["after"],
                              "calls": longest["calls"]}, "cues": cues}
        warm = renderer.get("actorReady")
        if warm:
            seat["operatorPrepare"] = {k: round(v, 2) for k, v in warm.items()}
        startup = view.get("startup") or {}
        markers = {row[0]: row[1] for row in startup.get("markers", [])}
        if {"join requested", "loadWorld", "waiting ready", "active input"} <= markers.keys():
            join, load, ready, active = [markers[k] for k in ["join requested", "loadWorld", "waiting ready", "active input"]]
            hud = startup["firstHud"]
            admission = {"joinToFirstHud": round(hud-join, 2), "worldLoadToFirstHud": round(hud-load, 2),
                         "firstHudToReadyClick": round(ready-hud, 2), "joinToReadyClick": round(ready-join, 2),
                         "joinToBothActiveInputs": round(active-join, 2), "joinToReady": period(startup, join, ready)}
            for begin, finish in startup.get("warmWindows", []):
                admission["beforeOperatorPrepare"] = period(startup, load, begin)
                admission["operatorPrepare"] = period(startup, begin, finish)
                admission["afterOperatorPrepareToFirstHud"] = period(startup, finish, hud)
            if "roster" in startup:
                admission["rosterOutfits"] = startup["roster"]
            seat["admission"] = admission
        result["seats"][label] = seat
    return result


if __name__ == "__main__":
    print(json.dumps({str(Path(item).parent.name): compact(Path(item)) for item in sys.argv[1:]}, indent=2))
