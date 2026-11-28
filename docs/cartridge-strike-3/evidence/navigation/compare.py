"""Compare matched fixed-step runs made by tools/bot-navigation-load.mjs."""
import argparse
import json
import statistics
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("original", type=Path)
parser.add_argument("candidate", type=Path)
args = parser.parse_args()


def runs(directory):
    groups = {}
    for file in sorted(directory.glob("*.json")):
        measurement = json.loads(file.read_text())
        for run in measurement["runs"]:
            key = (run["mapId"], run["profile"], run["seed"])
            assert key not in groups, f"Duplicate sample {key}"
            groups[key] = {**run, "node": measurement["node"], "cpu": measurement["cpu"]}
    assert groups, directory
    return groups


original, candidate = runs(args.original), runs(args.candidate)
assert original.keys() == candidate.keys(), "Map, profile or seed mismatch"
for key, after in candidate.items():
    before = original[key]
    assert before["sourceHash"] == after["sourceHash"]
    assert before["cpu"] == after["cpu"] and before["node"] == after["node"]
    assert before["tickMs"]["count"] == after["tickMs"]["count"]
    assert before["mode"] == after["mode"] and before["earlyShots"] == after["earlyShots"] == 0
    assert after.get("botStartsPerTick", after["startsPerTick"])["max"] <= 1, f"Bot admission exceeded at {key}"


def measurements(group):
    def m(key, field=None):
        values = [row[key] if field is None else row[key][field] for row in group]
        return round(statistics.median(values), 3)

    return {
        "seeds": sorted(r["seed"] for r in group),
        "medianTickP95Ms": m("tickMs", "p95"),
        "medianTickP99Ms": m("tickMs", "p99"),
        "medianRouteWorkP99Ms": m("routeWorkPerTickMs", "p99"),
        "worstRouteTickMs": max(r["routeWorkPerTickMs"]["max"] for r in group),
        "maxStartsPerTick": max(r["startsPerTick"]["max"] for r in group),
        "medianOverBudgetTicks": m("overBudgetTicks"),
        "medianReadyMs": m("readyMs"),
        "maxBotStartsPerTick": max(r.get("botStartsPerTick", r["startsPerTick"])["max"] for r in group),
        "movingObservations": sum(r["behavior"]["moving"] for r in group),
        "liveBotObservations": sum(r["behavior"]["observations"] for r in group),
        "medianCompletedRouteResponseP95Ticks": m("responseTicks", "p95"),
        "completedRoutes": sum(r["finished"] for r in group),
        "emptyRoutes": sum(r["empty"] for r in group),
        "shots": sum(r["shots"] for r in group),
        "kills": sum(r["kills"] for r in group),
    }


summary = []
for map_id, profile in sorted({key[:2] for key in original}):
    keys = [k for k in original if k[:2] == (map_id, profile)]
    summary.append({
        "map": map_id, "profile": profile,
        "original": measurements([original[k] for k in keys]),
        "candidate": measurements([candidate[k] for k in keys]),
    })
print(json.dumps(summary, indent=2))
