import argparse
import json
import re
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
VIEWS = ["axial", "coronal", "sagittal"]
ROWS = ["peak", "lesion"]


def check(condition, message):
    if not condition:
        sys.exit(f"check failed: {message}")


def precision_from(dice, recall):
    # P = D*R / (2R - D)
    bottom = 2 * recall - dice
    return dice * recall / bottom if bottom > 0 else 0.0


def group_stats(samples):
    return {
        "scans": len(samples),
        "recall": float(np.median([s["recall"] for s in samples])),
        "precision": float(np.median([s["precision"] for s in samples])),
        "dice": float(np.median([s["dice"] for s in samples])),
        "peakInside": sum(s["peakInsideLesion"] for s in samples),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("metrics_folder")
    args = parser.parse_args()
    folder = Path(args.metrics_folder)

    files = sorted(folder.glob("scan-*.json"))
    check(len(files) == 10, f"expected 10 scan files, found {len(files)}")
    check((folder / "summary.json").exists(), "summary.json is missing")
    summary = json.loads((folder / "summary.json").read_text())

    samples = []
    hashes = set()
    for path in files:
        match = re.match(r"scan-(\d+)-(\w+)\.json", path.name)
        number, tracer = int(match.group(1)), match.group(2)
        data = json.loads(path.read_text())
        check(data["split"] == "val", f"{path.name} is not a val scan")
        check(data["map"] == "decoder_tumor_probability", f"{path.name} has the wrong map")
        check(data["tracer"] == tracer, f"{path.name} tracer does not match the file name")
        hashes.add(data["checkpoint_sha256"])

        recall = data["coverage_at_0_5"] / 100
        dice = data["dice_at_0_5"]
        samples.append({
            "sample": number,
            "tracer": tracer,
            "lesionVoxels": data["lesion_voxels"],
            "recall": recall,
            "precision": precision_from(dice, recall),
            "dice": dice,
            "peakInsideLesion": bool(data["peak_inside_lesion"]),
        })
    check(len(hashes) == 1, "scans use different checkpoints")
    samples.sort(key=lambda s: s["sample"])

    groups = {
        "all": group_stats(samples),
        "fdg": group_stats([s for s in samples if s["tracer"] == "fdg"]),
        "psma": group_stats([s for s in samples if s["tracer"] == "psma"]),
    }
    for name, stats in groups.items():
        expected = summary[name]
        check(stats["scans"] == expected["scans"], f"{name} scan count")
        check(stats["peakInside"] == expected["peak_inside"], f"{name} peak inside")
        check(abs(stats["recall"] - expected["median_recall"]) < 1e-6, f"{name} median recall")
        check(abs(stats["precision"] - expected["median_precision"]) < 1e-6, f"{name} median precision")
        check(abs(stats["dice"] - expected["median_dice"]) < 1e-6, f"{name} median dice")

    for sample in samples:
        images = {}
        for row in ROWS:
            images[row] = {}
            for view in VIEWS:
                name = f"sample-{sample['sample']}-{row}-{view}.webp"
                check((DOCS / "segmentation" / name).exists(), f"{name} is missing")
                images[row][view] = f"segmentation/{name}"
        sample["images"] = images

    def rounded(value):
        if isinstance(value, float):
            return round(value, 3)
        if isinstance(value, dict):
            return {k: rounded(v) for k, v in value.items()}
        if isinstance(value, list):
            return [rounded(v) for v in value]
        return value

    result = {
        "model": "nnU-Net segmentation decoder",
        "checkpoint": "checkpoint_best.pth",
        "checkpointSha256Short": hashes.pop()[:8],
        "threshold": 0.5,
        "samples": samples,
        "groups": groups,
    }
    (DOCS / "segmentation.json").write_text(json.dumps(rounded(result), indent=1))
    print("all checks passed")
    print(f"median precision (all): {groups['all']['precision']:.4f}")


main()
