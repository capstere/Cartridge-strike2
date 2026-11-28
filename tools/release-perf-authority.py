"""Compare the six full Pi socket receipts with the retained CS3-00 distributions."""

import argparse
import hashlib
import json
import runpy
import statistics
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASELINE = ROOT / "docs/cartridge-strike-3/baseline/performance"


def compare(reference, candidate):
    comparisons = {}
    for metric, fields in {
        "tickMs": ["p95", "p99", "above16_67", "above33", "above50", "above100"],
        "intervalMs": ["p95", "p99"],
        "inputToConfirmationMs": ["p95", "p99"],
    }.items():
        for field in fields:
            before = [row[metric][field] for row in reference]
            after = [row[metric][field] for row in candidate]
            middle = statistics.median(after)
            comparisons[f"{metric}.{field}"] = {
                "baselineRange": [min(before), max(before)],
                "candidateRange": [min(after), max(after)],
                "candidateMedian": middle,
                "aboveBaselineUpperEndpoint": middle > max(before),
            }
    return comparisons


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="Contains server-1.json through server-6.json")
    parser.add_argument("expected_revision")
    parser.add_argument("expected_build")
    args = parser.parse_args()
    baseline = json.loads((BASELINE / "network.json").read_text())
    summarize_server = runpy.run_path(str(BASELINE / "summarize.py"))["server"]
    rows = []
    for index, reference in enumerate(baseline, start=1):
        path = args.directory / f"server-{index}.json"
        [row] = summarize_server(path)
        assert row["git"] == args.expected_revision and row["releaseBuild"] == args.expected_build
        for field in ["humanSDKSeats", "bots", "residents", "jitterMs", "rttSettingMs", "pacer", "environment"]:
            assert row[field] == reference[field], f"{row['case']} has a different {field}"
        assert row["status"] == "PASS" and row["emptyRoomsAfterLeave"] == 0
        assert row["elapsedSeconds"] >= 90 and row["inputToConfirmationMs"]["n"] > 0
        assert row["nTicks"] == row["tickMs"]["n"]
        assert row["thermal"]["throttled"] == "throttled=0x0"
        row["rawSha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
        rows.append(row)
    comparisons = {}
    for rtt in [0, 100]:
        original = [row for row in baseline if row["rttSettingMs"] == rtt]
        current = [row for row in rows if row["rttSettingMs"] == rtt]
        assert len(original) == len(current) == 3
        comparisons[str(rtt)] = compare(original, current)
    print(json.dumps({"runs": rows, "baselineComparison": comparisons}, indent=2))


if __name__ == "__main__":
    main()
