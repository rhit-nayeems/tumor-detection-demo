import argparse
import json
import sys
from pathlib import Path

import numpy as np

DOCS = Path(__file__).resolve().parent.parent / "docs"
DEFAULT_NPZ = Path(__file__).resolve().parent.parent.parent / "tumor-detection-model" / "features" / "encoder_features_ep760.npz"

parser = argparse.ArgumentParser()
parser.add_argument("npz", nargs="?", default=str(DEFAULT_NPZ))
args = parser.parse_args()

data = np.load(args.npz, allow_pickle=True)
scans = json.loads((DOCS / "scans.json").read_text())

val = data["split"].astype(str) == "val"
features = data["features"][val]
lesion = data["lesion"][val]
tracer = [str(t).lower() for t in data["tracer"][val]]

if len(tracer) != len(scans):
    sys.exit(f"expected {len(scans)} val rows, found {len(tracer)}")

for i, scan in enumerate(scans):
    if not np.allclose(features[i], scan["features"], atol=1e-6):
        sys.exit(f"features do not match for {scan['name']}")
    if int(lesion[i]) != scan["actual"]:
        sys.exit(f"lesion label does not match for {scan['name']}")

(DOCS / "tracers.json").write_text(json.dumps(tracer))
print(f"matched {len(tracer)} rows: {tracer.count('fdg')} FDG, {tracer.count('psma')} PSMA")
