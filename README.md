# Tumor Detection

For the 315-scan CT/PET batch, follow [the heatmap update instructions](tools/HEATMAP_UPDATE.md).
The importer validates the scan mapping and frozen checkpoint before preparing local website assets.

PET/CT tumor classification demo using 315 AutoPET validation scans and precomputed encoder features.

[Live demo](https://rhit-nayeems.github.io/tumor-detection-demo/) | [Project code](https://github.com/rhit-steelevw/tumor-detection-model)

Run locally:

```bash
python -m http.server 8000 --directory docs
```

Open http://localhost:8000.

## Feature explanations

After you press Predict, the page shows which of the 640 features the classifier relies on. There are two kinds of importance, and they answer different questions.

- **Per scan (local):** each feature is "removed" by setting it to its training mean, and the prediction is recalculated. The change in tumor probability is that feature's effect on this scan. It is computed live in the browser.
- **Dataset-wide (global):** permutation importance. A feature is shuffled across all 315 scans, and the rise in mean BCE loss is recorded. This is computed ahead of time and stored in `docs/importance.json`.

Feature layout (from `extract_features.py`):

- Indices 0–319 are the patch-mean of channel `i`.
- Indices 320–639 are the patch-max of channel `i - 320`.
- Channel 286 patch-max is index 606.

Regenerate `docs/importance.json` after `model.json` or `scans.json` changes (needs numpy):

```bash
python tools/permutation_importance.py
```

## Archived 10-scan segmentation gallery

The archived gallery used a separate nnU-Net model on 10 validation scans. The commands below regenerate the archived images and metrics and build the tracer labels used by the demo. Pillow and numpy are needed.

```bash
python tools/build_segmentation_images.py <unzipped heatmap PNG folder>
python tools/build_segmentation_metrics.py <unzipped metrics folder>
python tools/build_tracers.py <path to encoder_features.npz>
```

- `build_segmentation_images.py` crops the six panels out of each PNG, flips them so the head is at the top, stretches the coronal and sagittal views to the real voxel spacing, and writes WebP files. It also writes `tools/out/contact_sheet.png` for a quick visual check. Use `--no-flip` or `--no-stretch` if a future run already has those fixes.
- `build_segmentation_metrics.py` checks the files, computes precision from Dice and recall, and checks the medians against `summary.json`. Run it after the images script.
- `build_tracers.py` checks that the validation rows in `encoder_features.npz` match `docs/scans.json`, then writes the tracer for each scan.

## CT/PET heatmaps

Select any of the 315 validation scans to view its axial, coronal, and sagittal CT and PET slices, with downloadable comparisons and metrics. The heatmaps show the joint segmentation model's tumor probability from the epoch-760 checkpoint. Both modalities use the same slices and probability map. The overlay toggle shows the underlying scans.

The [batch summary](docs/heatmap-summary.json) reports median Dice, recall, and precision on scans with labeled tumors and false positives on tumor-free scans.
