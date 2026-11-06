import json
from pathlib import Path

import numpy as np

DOCS = Path(__file__).resolve().parent.parent / "docs"
REPEATS = 20
SEED = 0

model = json.loads((DOCS / "model.json").read_text())
scans = json.loads((DOCS / "scans.json").read_text())

mean = np.array(model["mean"])
std = np.array(model["std"])
hidden_weight = np.array(model["hiddenWeight"])
hidden_bias = np.array(model["hiddenBias"])
output_weight = np.array(model["outputWeight"])
output_bias = model["outputBias"]

X = np.array([scan["features"] for scan in scans])
y = np.array([scan["actual"] for scan in scans])
half = model["inputSize"] // 2


def bce_loss(X):
    scaled = (X - mean) / std
    hidden = np.maximum(0, scaled @ hidden_weight.T + hidden_bias)
    logit = hidden @ output_weight + output_bias
    p = 1 / (1 + np.exp(-logit))
    p = np.clip(p, 1e-7, 1 - 1e-7)
    return float(np.mean(-(y * np.log(p) + (1 - y) * np.log(1 - p))))


def label(index):
    pooling = "patch-mean" if index < half else "patch-max"
    return f"Channel {index % half} · {pooling}"


base_loss = bce_loss(X)
rng = np.random.default_rng(SEED)
increase = np.zeros(X.shape[1])

for _ in range(REPEATS):
    for j in range(X.shape[1]):
        shuffled = X.copy()
        shuffled[:, j] = rng.permutation(X[:, j])
        increase[j] += bce_loss(shuffled) - base_loss
increase /= REPEATS

order = np.argsort(-increase)
rank = {str(int(index)): position + 1 for position, index in enumerate(order)}
top = [{"index": int(i), "lossIncrease": round(float(increase[i]), 6)} for i in order[:10]]

result = {
    "scans": len(scans),
    "repeats": REPEATS,
    "seed": SEED,
    "baseLoss": round(base_loss, 6),
    "top": top,
    "rank": rank,
}
(DOCS / "importance.json").write_text(json.dumps(result))

print(f"Base loss: {base_loss:.6f}")
for position, item in enumerate(top, start=1):
    print(f"{position:2}. index {item['index']:3}  {label(item['index']):28} +{item['lossIncrease']:.4f}")
