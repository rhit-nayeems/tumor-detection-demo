"""Exercise imports and rejection paths in disposable folders; no website files change."""
import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import import_heatmaps as importer


class ImportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.batch = self.root / 'batch'
        self.assets = self.batch / 'results/test/images'
        self.assets.mkdir(parents=True)
        # Import checks the file signature. Display fidelity is verified separately.
        (self.assets / 'panel.png').write_bytes(b'\x89PNG\r\n\x1a\nfixture')
        (self.assets / 'pet-ct-pilot.png').write_bytes(b'\x89PNG\r\n\x1a\nfixture')
        self.output = self.root / 'docs'
        self.samples = [self.sample(0), self.sample(305)]

    def sample(self, index):
        case = importer.read(importer.ROOT / 'tools/heatmap_cases.json')[index]
        positive = case['actual'] == 1
        tp, fp, fn = (8, 2, 2) if positive else (0, 2, 0)
        return {
            'scanIndex': index, 'scanName': f'Scan {index + 1:03d}',
            'caseId': case['case_id'], 'tracer': case['tracer'], 'actual': case['actual'],
            'checkpoint': case['checkpoint_name'], 'checkpointSha256': case['checkpoint_sha256'],
            'truePositiveVoxels': tp, 'falsePositiveVoxels': fp, 'falseNegativeVoxels': fn,
            'predictedVoxels': tp + fp, 'lesionVoxels': tp + fn,
            'dice': 0.8 if positive else None, 'recall': 0.8 if positive else None,
            'precision': 0.8 if positive else 0.0, 'predictedVolumeMl': 0.1,
            'images': {modality: {mode: {view: 'results/test/images/panel.png'
                       for view in importer.VIEWS} for mode in ('plain', 'overlay')}
                       for modality in ('ct', 'pet')},
        }

    def run_import(self, *options):
        (self.batch / 'all_scan_heatmaps.json').write_text(json.dumps({'samples': self.samples}))
        argv = ['import_heatmaps.py', str(self.batch), '--output', str(self.output), *options]
        with patch('sys.argv', argv), contextlib.redirect_stdout(io.StringIO()):
            importer.main()

    def test_partial_merge_rerun_and_empty_mask_summary(self):
        self.run_import('--allow-partial')
        first = (self.output / 'imaging.json').read_bytes()
        self.run_import('--allow-partial')
        self.assertEqual(first, (self.output / 'imaging.json').read_bytes())
        summary = importer.read(self.output / 'heatmap-summary.json')
        self.assertEqual(summary['byTracer']['psma']['tumorFreeScansWithFalsePositives'], 1)
        self.assertIsNone(summary['byTracer']['psma']['positiveMedian']['dice'])
        for sample in importer.read(self.output / 'imaging.json')['samples']:
            self.assertTrue((self.output / sample['preview']).exists())
            self.assertTrue((self.output / sample['metricsUrl']).exists())
        self.samples = [self.sample(73)]
        self.run_import('--allow-partial')
        self.assertEqual(len(importer.read(self.output / 'imaging.json')['samples']), 3)

    def test_full_batch_and_dry_run(self):
        self.samples = [self.sample(i) for i in range(315)]
        self.run_import('--dry-run')
        self.assertFalse(self.output.exists())
        self.run_import()
        self.assertEqual(len(importer.read(self.output / 'imaging.json')['samples']), 315)
        self.assertEqual(len(list(self.output.rglob('*.png'))), 4095)

    def test_incomplete_rejected_by_default(self):
        with self.assertRaisesRegex(ValueError, 'Expected 315'):
            self.run_import()
        self.assertFalse(self.output.exists())

    def test_wrong_case_model_metric_duplicate_and_missing_asset_rejected(self):
        for key, value in [('caseId', 'wrong'), ('checkpointSha256', 'wrong'), ('dice', 0.1)]:
            with self.subTest(key=key):
                self.samples = [self.sample(0)]
                self.samples[0][key] = value
                with self.assertRaises(ValueError):
                    self.run_import('--allow-partial')
                self.assertFalse(self.output.exists())
        self.samples = [self.sample(0), self.sample(0)]
        with self.assertRaisesRegex(ValueError, 'Duplicate'):
            self.run_import('--allow-partial')
        self.samples = [self.sample(0)]
        (self.assets / 'panel.png').unlink()
        with self.assertRaisesRegex(ValueError, 'Missing asset'):
            self.run_import('--allow-partial')
        self.assertFalse(self.output.exists())

    def test_path_escape_rejected(self):
        self.samples[0]['images']['ct']['plain']['axial'] = '../outside.png'
        with self.assertRaisesRegex(ValueError, 'outside batch'):
            self.run_import('--allow-partial')
        self.assertFalse(self.output.exists())


if __name__ == '__main__':
    unittest.main()
