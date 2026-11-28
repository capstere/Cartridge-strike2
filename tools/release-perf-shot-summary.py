"""Summarize paired unmodified socket rooms instrumented with release-perf-shot-observer."""
import argparse
import gzip
import hashlib
import json
import math
from pathlib import Path


def distribution(values):
    ordered = sorted(values)
    if not ordered:
        return {"n": 0}
    return {"n": len(ordered), **{
        name: round(ordered[math.ceil(p * len(ordered)) - 1], 3)
        for name, p in [("p50", .50), ("p95", .95), ("p99", .99), ("max", 1)]
    }}


def summarize(path, trace_directory):
    source = path.read_bytes()
    [run] = json.loads(source)["results"]
    assert run["count"] == 2 and (run["rttMs"], run["jitterMs"]) in [(0, 0), (100, 20)]
    assert run["status"] == "PASS" and run["cleanup"]["rooms"] == []
    shots = run["perfShots"]
    assert len({s["id"] for s in shots}) == len(shots) == sum(run["shots"])
    assert all(s.get("received") is not None for s in shots)
    for s in shots:
        assert s["firstSent"] <= s["actualSent"] <= s["lastSent"] <= s["first"]["at"]
        assert s["first"]["at"] <= s["queuedAt"] <= s["flushedAt"]
        # A separate process can receive a flushed packet before super.broadcastPatch returns.
        if run["rttMs"]:
            assert s["flushedAt"] < s["received"]
    cohorts = {"all": shots, "afterWarmUp": [s for s in shots if s["actualSent"] >= run["perfStart"]],
               "automaticRepeatInBatch": [s for s in shots if s["count"] >= 2 and not s["hasEdge"]],
               "singleSampleBatch": [s for s in shots if s["count"] == 1],
               "actualTriggerEdge": [s for s in shots if s["hasEdge"]]}
    summaries = {}
    for name, subset in cohorts.items():
        summaries[name] = {
            "actions": len(subset),
            "firstSentToReceivedMs": distribution(s["received"] - s["firstSent"] for s in subset),
            "lastSentToReceivedMs": distribution(s["received"] - s["lastSent"] for s in subset),
            "selectedSentToReceivedMs": distribution(s["received"] - s["actualSent"] for s in subset),
            "firstSentToDequeueMs": distribution(s["first"]["at"] - s["firstSent"] for s in subset),
            "lastSentToDequeueMs": distribution(s["first"]["at"] - s["lastSent"] for s in subset),
            "dequeueToShotMs": distribution(s["queuedAt"] - s["first"]["at"] for s in subset),
            "shotToPatchMs": distribution(s["flushedAt"] - s["queuedAt"] for s in subset),
            "patchToClientMs": distribution(s["received"] - s["flushedAt"] for s in subset),
            "selectedFirst": sum(s["id"] == s["first"]["id"] for s in subset),
            "selectedLast": sum(s["id"] == s["last"]["id"] for s in subset),
            "firstToLastInputMs": distribution(s["lastSent"] - s["firstSent"] for s in subset),
            "endpointsDifferInAim": sum((s["first"]["yaw"],s["first"]["pitch"]) != (s["last"]["yaw"],s["last"]["pitch"]) for s in subset),
        }
    trace_name = "performance-authority-shot-" + path.stem + ".json.gz"
    if trace_directory is not None:
        payload = {"source": path.name, "rawSha256": hashlib.sha256(source).hexdigest(),
                   "startMs": run["perfStart"], "shots": shots}
        data = json.dumps(payload, separators=(",", ":")).encode()
        (trace_directory / trace_name).write_bytes(gzip.compress(data, mtime=0))
    room = run["measured"]["rooms"][0]
    max_first = max(shots, key=lambda s: s["received"] - s["firstSent"])
    return {"file": path.name, "trace": trace_name, "rawSha256": hashlib.sha256(source).hexdigest(),
            "maxFirstOrigin": {"tick": max_first["tick"], "actionId": max_first["id"],
                "firstToDequeueMs": round(max_first["first"]["at"] - max_first["firstSent"], 3),
                "dequeueToShotMs": round(max_first["queuedAt"] - max_first["first"]["at"], 3),
                "shotToPatchMs": round(max_first["flushedAt"] - max_first["queuedAt"], 3),
                "patchToClientMs": round(max_first["received"] - max_first["flushedAt"], 3)},
            "actors": room["actors"], "bots": room["ai"], "residents": room["residents"],
            "transportCounters": room["metrics"], "wholeRun": run["measured"]["wholeRun"],
            "thermal": run["measured"]["thermal"], "emptyRoomsAfterLastLeave": len(run["cleanup"]["rooms"]),
            "contract": run["contract"], "environment": run["environment"], "configuredRttMs": run["rttMs"],
            "jitterMs": run["jitterMs"], "shotsByHuman": run["shots"],
            "baselinePhase": run["baseline"]["rooms"][0]["phase"], "comparisons": summaries}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--trace-directory", type=Path, help="write the individual event timestamps as gzip JSON")
    parser.add_argument("files", nargs="+", type=Path)
    args = parser.parse_args()
    print(json.dumps([summarize(path, args.trace_directory) for path in args.files], indent=2))
