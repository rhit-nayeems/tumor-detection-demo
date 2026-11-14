# Tumor Detection

PET/CT tumor classification demo using 315 AutoPET validation scans and precomputed encoder features. The encoder does not run in the browser.

[Live demo](https://rhit-nayeems.github.io/tumor-detection-demo/) | [Project code](https://github.com/rhit-steelevw/tumor-detection-model)

## Run locally

```bash
python -m http.server 8000 --directory docs
```

Open [localhost:8000](http://localhost:8000).

## Scan images and explanations

The demo includes CT/PET images, segmentation heatmaps, expert tumor outlines, and classifier feature importance. Heatmaps come from the epoch-760 segmentation model; they do not explain the classifier's prediction.

For asset updates, see the [heatmap instructions](tools/HEATMAP_UPDATE.md). After changing `docs/model.json` or `docs/scans.json`, regenerate feature importance:

```bash
python tools/permutation_importance.py
```

## AI assistance

AI tools assisted with parts of the code and demo interface. The team reviewed and tested the implementation.
