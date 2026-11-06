import argparse
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "docs" / "segmentation"
SHEET_PATH = ROOT / "tools" / "out" / "contact_sheet.png"

VIEWS = ["axial", "coronal", "sagittal"]
ROWS = ["peak", "lesion"]
MAX_SIDE = 600
MAX_TOTAL_BYTES = 3 * 1024 * 1024


def find_runs(mask, min_length):
    # return (start, end) for each run of True values at least min_length long
    runs = []
    start = None
    for i, value in enumerate(mask):
        if value and start is None:
            start = i
        if not value and start is not None:
            if i - start > min_length:
                runs.append((start, i))
            start = None
    if start is not None and len(mask) - start > min_length:
        runs.append((start, len(mask)))
    return runs


def find_panels(path):
    pixels = np.array(Image.open(path).convert("RGB"))
    nonwhite = (pixels <= 245).any(axis=2)
    nonwhite[:, 1600:] = False  # colorbar strip

    columns = find_runs(nonwhite.mean(axis=0) > 0.01, 200)
    panels = []
    for x0, x1 in columns:
        rows = find_runs(nonwhite[:, x0:x1].mean(axis=1) > 0.5, 200)
        for y0, y1 in rows:
            panels.append((x0, y0, x1, y1))

    if len(columns) != 3 or len(panels) != 6:
        sys.exit(f"{path.name}: expected 6 panels, found {len(panels)}")
    for x0, y0, x1, y1 in panels:
        if x1 - x0 < 300 or y1 - y0 < 300:
            sys.exit(f"{path.name}: panel too small")
    widths = [p[2] - p[0] for p in panels]
    if max(widths) - min(widths) > 4:
        sys.exit(f"{path.name}: panel widths do not match")

    # panels are in column order, two per column: reorder to [row][column]
    grid = [[panels[col * 2 + row] for col in range(3)] for row in range(2)]
    return grid


def correct(panel, view, spacing, flip, stretch):
    if flip:
        panel = panel.transpose(Image.FLIP_TOP_BOTTOM)
    width, height = panel.size
    if stretch and view != "axial":
        height = round(height * spacing[0] / spacing[1])
    scale = min(1, MAX_SIDE / max(width, height))
    size = (round(width * scale), round(height * scale))
    if size != panel.size:
        panel = panel.resize(size, Image.LANCZOS)
    return panel


def make_contact_sheet(tiles):
    # tiles: list of (sample, row name, view, image)
    cell = 200
    label_height = 18
    samples = sorted({t[0] for t in tiles})
    sheet = Image.new("RGB", (cell * 6, (cell + label_height) * len(samples)), "white")
    draw = ImageDraw.Draw(sheet)
    for sample, row, view, image in tiles:
        thumb = image.copy()
        thumb.thumbnail((cell, cell))
        col = ROWS.index(row) * 3 + VIEWS.index(view)
        y = samples.index(sample) * (cell + label_height)
        sheet.paste(thumb, (col * cell, y + label_height))
        draw.text((col * cell + 4, y + 3), f"{sample} {row} {view}", fill="black")
    SHEET_PATH.parent.mkdir(exist_ok=True)
    sheet.save(SHEET_PATH)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("png_folder")
    parser.add_argument("--spacing", default="3.0,2.036,2.036", help="z,y,x in mm")
    parser.add_argument("--no-flip", action="store_true")
    parser.add_argument("--no-stretch", action="store_true")
    args = parser.parse_args()

    spacing = [float(v) for v in args.spacing.split(",")]
    files = sorted(Path(args.png_folder).glob("scan-*.png"))
    if len(files) != 10:
        sys.exit(f"expected 10 PNGs, found {len(files)}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    tiles = []
    total = 0
    for path in files:
        sample = int(re.match(r"scan-(\d+)-", path.name).group(1))
        image = Image.open(path).convert("RGB")
        grid = find_panels(path)
        for row_index, row in enumerate(ROWS):
            for col_index, view in enumerate(VIEWS):
                panel = image.crop(grid[row_index][col_index])
                panel = correct(panel, view, spacing, not args.no_flip, not args.no_stretch)
                out = OUT_DIR / f"sample-{sample}-{row}-{view}.webp"
                panel.save(out, "WEBP", quality=85)
                total += out.stat().st_size
                tiles.append((sample, row, view, panel))
        print(f"{path.name}: 6 panels")

    if total > MAX_TOTAL_BYTES:
        sys.exit(f"images are {total / 1e6:.2f} MB, over the 3 MB limit")
    make_contact_sheet(tiles)
    print(f"{len(tiles)} images, {total / 1e6:.2f} MB total")
    print(f"contact sheet: {SHEET_PATH}")


main()
