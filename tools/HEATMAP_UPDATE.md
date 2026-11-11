# Add the completed CT/PET validation batch

This updates the local GitHub Pages files only. It does not train, change model weights,
alter classifier predictions, push commits, or publish the website.

## 1. On SLURM, after all scans finish

```bash
cd ~/autopet-team-315-heatmaps
python3 check_progress.py --collect
```

Proceed when this reports **315 / 315** and writes `all_scan_heatmaps.json`.
Package only the manifest and referenced images, without raw medical volumes or weights:

```bash
python3 - <<'PY'
import json
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
root = Path.cwd().resolve()
manifest = json.loads((root / 'all_scan_heatmaps.json').read_text())
assert len(manifest['samples']) == 315, 'Batch incomplete'
paths = {'all_scan_heatmaps.json'}
for sample in manifest['samples']:
    for modality in ('ct', 'pet'):
        for mode in ('plain', 'overlay'):
            for filename in sample['images'][modality][mode].values():
                paths.add(filename)
                paths.add(str(Path(filename).parent / 'pet-ct-pilot.png'))
with ZipFile('website-heatmaps-315.zip', 'w', ZIP_DEFLATED) as archive:
    for filename in sorted(paths):
        source = (root / filename).resolve()
        assert source.is_relative_to(root) and source.is_file(), filename
        archive.write(source, filename)
print('Created website-heatmaps-315.zip')
PY
```

Download `website-heatmaps-315.zip` through the HPC Files page and extract it.
The extracted folder must contain `all_scan_heatmaps.json` and `results/` together.

## 2. In the local tumor-detection-demo folder

Use the path to the extracted folder (not the ZIP). Python's standard library is sufficient.

```powershell
python tools/import_heatmaps.py "$env:USERPROFILE/Downloads/website-heatmaps-315" --dry-run
python tools/import_heatmaps.py "$env:USERPROFILE/Downloads/website-heatmaps-315"
python -m http.server 8000 --directory docs
```

Open <http://localhost:8000/?scan=74>. Review Scan 001, Scan 074, a PSMA tumor scan,
and a tumor-free PSMA scan (306). Switch scans and toggle overlays; confirm that CT
and PET change together, and a pending scan never retains another scan's pictures.
Verify enlargement, image downloads, and JSON downloads.

The importer checks the saved validation-row fingerprint, scan index, case ID,
tracer, label, checkpoint hash, voxel totals, derived metrics, and all 13 PNG assets
per scan before copying files. Duplicate scans, missing assets, mismatched models,
and paths outside the extracted folder fail before changing the website.

Outputs:

- `docs/imaging/scan-NNN/`: 12 modality/view images, a combined preview, and metrics.
- `docs/imaging.json`: dropdown-to-image mapping, merged with existing previews.
- `docs/heatmap-summary.json`: FDG/PSMA positive-scan median Dice/recall/precision
  and tumor-free false-positive counts/volume for the imported batch.

An incomplete preview requires explicit `--allow-partial`. It preserves other
registered scans. Its summary describes only the imported subset. The default
requires all 315; rerunning the same import safely replaces the same scan assets.

## 3. Review before publishing

```bash
git status --short
git diff --stat
```

Inspect asset sizes before committing: all 315 cases include 4,095 PNG files.
No publishing command is included here. Coordinate the final Git update with the
website owner and review all existing local edits before creating a commit.

## Interpretation

Both modalities display the same joint segmentation probability map. These are not
individual encoder-channel activations or classifier attribution maps. Report
full-volume segmentation metrics separately from classification accuracy. Empty
tumor masks have no Dice/recall value; use false-positive counts and volume instead.
Selected slices cannot show every missed lesion or false-positive region.

`tools/heatmap_cases.json` records the verified batch order for these exact 315
validation rows. If `docs/scans.json` changes, reverify that mapping rather than
editing the saved fingerprint merely to make an import pass.
