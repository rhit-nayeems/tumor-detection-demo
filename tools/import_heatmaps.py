"""Validate a collected SLURM batch, then prepare static website assets. No deployment."""
import argparse
import copy
import hashlib
import json
import math
from pathlib import Path
import shutil
import statistics

ROOT = Path(__file__).resolve().parents[1]
SCANS_SHA256 = 'd3504e8e194151f78e92c9c84930a58a37a74c29ce27e7da6799d6f6eca7d2ac'
VIEWS = ('axial', 'coronal', 'sagittal')


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def asset(root, value):
    path = (root / value).resolve()
    if not path.is_relative_to(root.resolve()) or not path.is_file():
        raise ValueError(f'Missing asset or path outside batch: {value}')
    with path.open('rb') as stream:
        if stream.read(8) != b'\x89PNG\r\n\x1a\n':
            raise ValueError(f'Invalid PNG: {value}')
    return path


def check_sample(sample, case, scan):
    expected = {
        'scanIndex': case['scan_index'], 'scanName': scan['name'],
        'caseId': case['case_id'], 'tracer': case['tracer'], 'actual': case['actual'],
        'checkpoint': case['checkpoint_name'], 'checkpointSha256': case['checkpoint_sha256'],
    }
    for key, value in expected.items():
        if sample.get(key) != value:
            raise ValueError(f"{scan['name']}: mismatched {key}")
    counts = [sample[k] for k in ('truePositiveVoxels', 'falsePositiveVoxels', 'falseNegativeVoxels')]
    if any(type(n) is not int or n < 0 for n in counts):
        raise ValueError('Invalid voxel counts')
    tp, fp, fn = counts
    if sample['predictedVoxels'] != tp + fp or sample['lesionVoxels'] != tp + fn:
        raise ValueError('Inconsistent voxel totals')
    if bool(tp + fn) != bool(case['actual']):
        raise ValueError('Tumor label and voxel count disagree')
    metrics = {
        'dice': 2 * tp / (2 * tp + fp + fn) if tp + fn else None,
        'recall': tp / (tp + fn) if tp + fn else None,
        'precision': tp / (tp + fp) if tp + fp else None,
    }
    for key, expected_value in metrics.items():
        value = sample.get(key)
        if expected_value is not None and (not isinstance(value, (int, float)) or
                not math.isfinite(value) or not math.isclose(value, expected_value, abs_tol=1e-8)):
            raise ValueError(f'Inconsistent {key}')
        if key in ('dice', 'recall') and expected_value is None and value is not None:
            raise ValueError('Empty tumor masks must have null Dice/recall')


def summarize(samples, total):
    summary = {'completed': len(samples), 'expected': total,
               'note': 'Segmentation only. Positive-scan metrics are unweighted per-scan medians. '
                       'Empty tumor masks are excluded from Dice/recall; report false positives separately.',
               'byTracer': {}}
    for tracer in ('fdg', 'psma'):
        group = [s for s in samples if s['tracer'] == tracer]
        positive = [s for s in group if s['actual'] == 1]
        negative = [s for s in group if s['actual'] == 0]
        summary['byTracer'][tracer] = {
            'completed': len(group), 'tumorScans': len(positive), 'tumorFreeScans': len(negative),
            'positiveMedian': {key: statistics.median(values) if values else None
                               for key in ('dice', 'recall', 'precision')
                               for values in [[s[key] for s in positive if s[key] is not None]]},
            'tumorFreeScansWithFalsePositives': sum(s['predictedVoxels'] > 0 for s in negative),
            'tumorFreeFalsePositiveVolumeMl': sum(s['predictedVolumeMl'] for s in negative),
        }
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('batch', type=Path, help='Extracted batch containing all_scan_heatmaps.json and results/')
    parser.add_argument('--allow-partial', action='store_true', help='Explicitly permit a subset for preview')
    parser.add_argument('--dry-run', action='store_true', help='Check everything without writing website files')
    parser.add_argument('--output', type=Path, default=ROOT / 'docs')
    args = parser.parse_args()
    if hashlib.sha256((ROOT / 'docs/scans.json').read_bytes()).hexdigest() != SCANS_SHA256:
        raise ValueError('Website validation rows changed; reverify cases before importing')
    scans = read(ROOT / 'docs/scans.json')
    cases = read(ROOT / 'tools/heatmap_cases.json')
    if len(cases) != len(scans) or any(c['scan_index'] != i or c['actual'] != scans[i]['actual']
                                      for i, c in enumerate(cases)):
        raise ValueError('Case registry does not match website validation rows')
    batch = args.batch.resolve()
    samples = read(batch / 'all_scan_heatmaps.json')['samples']
    if not samples or (len(samples) != len(cases) and not args.allow_partial):
        raise ValueError(f'Expected {len(cases)} scans, got {len(samples)}; use --allow-partial for a preview')
    seen, prepared, copies = set(), [], []
    # Validate the entire import before touching any website files.
    for original in samples:
        sample = copy.deepcopy(original)
        index = sample['scanIndex']
        if type(index) is not int or not 0 <= index < len(scans) or index in seen:
            raise ValueError(f'Duplicate or invalid scan index: {index}')
        seen.add(index)
        check_sample(sample, cases[index], scans[index])
        target = Path('imaging') / f'scan-{index + 1:03d}'
        source_parent = None
        for modality in ('ct', 'pet'):
            for mode in ('plain', 'overlay'):
                for view in VIEWS:
                    source = asset(batch, sample['images'][modality][mode][view])
                    if source_parent is not None and source.parent != source_parent:
                        raise ValueError('All scan images must belong to the same output folder')
                    source_parent = source.parent
                    dest = target / f'{modality}-{mode}-{view}.png'
                    copies.append((source, args.output / dest))
                    sample['images'][modality][mode][view] = dest.as_posix()
        preview = asset(batch, str((source_parent / 'pet-ct-pilot.png').relative_to(batch)))
        copies.append((preview, args.output / target / 'preview.png'))
        sample['preview'] = (target / 'preview.png').as_posix()
        sample['metricsUrl'] = (target / 'metrics.json').as_posix()
        prepared.append(sample)
    summary = summarize(prepared, len(cases))
    print(json.dumps(summary, indent=2))
    print(f'Validated {len(copies)} PNGs ({sum(p.stat().st_size for p, _ in copies) / 1048576:.1f} MiB)')
    if args.dry_run:
        return
    old = read(args.output / 'imaging.json') if (args.output / 'imaging.json').exists() else {'samples': []}
    merged = {s['scanIndex']: s for s in old['samples']}
    merged.update({s['scanIndex']: s for s in prepared})
    for source, dest in copies:
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, dest)
    for sample in prepared:
        (args.output / sample['metricsUrl']).write_text(json.dumps(sample, indent=2), encoding='utf-8')
    manifest = {'model': 'Team epoch-760 segmentation encoder/decoder',
                'samples': sorted(merged.values(), key=lambda s: s['scanIndex'])}
    temporary = args.output / 'imaging.json.tmp'
    temporary.write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    temporary.replace(args.output / 'imaging.json')
    (args.output / 'heatmap-summary.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
    print(f'Prepared {args.output.resolve()}; no Git push or deployment performed.')


if __name__ == '__main__':
    main()
