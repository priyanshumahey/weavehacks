#!/usr/bin/env python3
"""Slice an AI-generated 4x3 Pokemon-style charset into clean game-ready frames.

Input: a single image laid out as a grid of directional walk frames, e.g. the
output of `generate_sprites.py --style walk-sheet`:

    rows (top->bottom): down, left, right, up
    cols (left->right): 3-frame walk cycle (step, stand, step)

The AI grid is only roughly aligned, so per cell we:
1. crop the nominal grid cell,
2. flood-fill the background transparent from the cell corners,
3. trim to the character,
4. paste bottom-centered into a uniform frame (feet aligned across all frames).

Outputs into assets/charsets/<key>/:
- <key>_sheet.png        : uniform spritesheet (cols x rows), Phaser-ready
- <key>_<dir>.gif        : per-direction animated preview (step, stand, step, stand)
- frames/<dir>_<n>.png   : individual frames

Phaser load (frame size printed at the end):
    this.load.spritesheet('<key>', '<key>_sheet.png', { frameWidth: W, frameHeight: H })

Run with uv:
    uv run python scripts/slice_charset.py --input "assets/charsets/daenerys.png" --key daenerys
"""

from __future__ import annotations

import argparse
import pathlib

from PIL import Image

DIRECTIONS = ["down", "left", "right", "up"]


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Slice a 4x3 charset into uniform frames")
    p.add_argument("--input", required=True, help="Path to the charset image")
    p.add_argument("--key", default="", help="Output key (defaults to input stem slug)")
    p.add_argument("--out-dir", default="assets/charsets", help="Base output directory")
    p.add_argument("--rows", type=int, default=4, help="Grid rows (directions)")
    p.add_argument("--cols", type=int, default=3, help="Grid cols (walk frames)")
    p.add_argument("--directions", default=",".join(DIRECTIONS), help="Comma list of row direction names")
    p.add_argument("--frame-height", type=int, default=48, help="Output character height in px (chunky)")
    p.add_argument("--pad", type=int, default=6, help="Transparent padding around the character")
    p.add_argument("--bg-tolerance", type=int, default=36, help="Background match tolerance (0-255)")
    p.add_argument("--cell-inset", type=float, default=0.04, help="Inset fraction to avoid neighboring cells")
    p.add_argument("--gifs", action="store_true", help="Also emit per-direction preview GIFs (rough, off by default)")
    p.add_argument("--frames", action="store_true", help="Also emit individual frame PNGs (off by default)")
    p.add_argument("--fps", type=int, default=6, help="GIF playback fps")
    p.add_argument("--preview-scale", type=int, default=6, help="Nearest upscale factor for preview GIFs")
    return p.parse_args()


def remove_background(img: Image.Image, tolerance: int) -> Image.Image:
    img = img.convert("RGBA")
    width, height = img.size
    px = img.load()
    corners = [(0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1)]
    seeds = [(px[x, y][0], px[x, y][1], px[x, y][2]) for x, y in corners]

    def matches(r: int, g: int, b: int) -> bool:
        for sr, sg, sb in seeds:
            if abs(r - sr) <= tolerance and abs(g - sg) <= tolerance and abs(b - sb) <= tolerance:
                return True
        return False

    visited = bytearray(width * height)
    stack = list(corners)
    while stack:
        x, y = stack.pop()
        if x < 0 or y < 0 or x >= width or y >= height:
            continue
        idx = y * width + x
        if visited[idx]:
            continue
        visited[idx] = 1
        r, g, b, a = px[x, y]
        if not matches(r, g, b):
            continue
        px[x, y] = (r, g, b, 0)
        stack.extend([(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)])
    return img


def trim(img: Image.Image) -> Image.Image:
    bbox = img.getbbox()
    return img.crop(bbox) if bbox else img


def extract_cells(sheet: Image.Image, rows: int, cols: int, inset: float, tol: int) -> list[list[Image.Image]]:
    W, H = sheet.size
    cell_w, cell_h = W / cols, H / rows
    inset_x, inset_y = cell_w * inset, cell_h * inset
    grid: list[list[Image.Image]] = []
    for r in range(rows):
        row_cells = []
        for c in range(cols):
            left = int(round(c * cell_w + inset_x))
            upper = int(round(r * cell_h + inset_y))
            right = int(round((c + 1) * cell_w - inset_x))
            lower = int(round((r + 1) * cell_h - inset_y))
            cell = sheet.crop((left, upper, right, lower))
            cell = remove_background(cell, tol)
            cell = trim(cell)
            row_cells.append(cell)
        grid.append(row_cells)
    return grid


def normalize_frames(grid: list[list[Image.Image]], frame_height: int, pad: int) -> tuple[list[list[Image.Image]], int, int]:
    """Scale every cell to a common character height and paste bottom-centered into uniform frames."""
    scaled: list[list[Image.Image]] = []
    max_w = 0
    for row in grid:
        srow = []
        for cell in row:
            if cell.height == 0:
                srow.append(cell)
                continue
            scale = frame_height / cell.height
            new_w = max(1, round(cell.width * scale))
            s = cell.resize((new_w, frame_height), Image.NEAREST)
            max_w = max(max_w, new_w)
            srow.append(s)
        scaled.append(srow)

    frame_w = max_w + pad * 2
    frame_h = frame_height + pad * 2
    frames: list[list[Image.Image]] = []
    for row in scaled:
        frow = []
        for s in row:
            frame = Image.new("RGBA", (frame_w, frame_h), (0, 0, 0, 0))
            x = (frame_w - s.width) // 2
            y = frame_h - pad - s.height
            frame.alpha_composite(s, (x, y))
            frow.append(frame)
        frames.append(frow)
    return frames, frame_w, frame_h


def save_sheet(frames: list[list[Image.Image]], frame_w: int, frame_h: int, path: pathlib.Path) -> None:
    rows, cols = len(frames), len(frames[0])
    sheet = Image.new("RGBA", (frame_w * cols, frame_h * rows), (0, 0, 0, 0))
    for r, row in enumerate(frames):
        for c, f in enumerate(row):
            sheet.alpha_composite(f, (c * frame_w, r * frame_h))
    sheet.save(path)


def save_dir_gif(row: list[Image.Image], path: pathlib.Path, fps: int, scale: int) -> None:
    # step, stand, step, stand reads as a walk loop.
    seq = [row[0], row[1], row[2], row[1]] if len(row) >= 3 else row
    up = [f.resize((f.width * scale, f.height * scale), Image.NEAREST) for f in seq]
    duration = int(1000 / max(1, fps))
    up[0].save(path, save_all=True, append_images=up[1:], duration=duration, loop=0, disposal=2, transparency=0)


def main() -> int:
    args = parse_args()
    src = pathlib.Path(args.input)
    if not src.exists():
        print(f"Input not found: {src}")
        return 2

    key = args.key or src.stem.lower().replace(" ", "_")
    dirs = [d.strip() for d in args.directions.split(",") if d.strip()]
    out_dir = pathlib.Path(args.out_dir) / key
    out_dir.mkdir(parents=True, exist_ok=True)

    sheet = Image.open(src).convert("RGBA")
    grid = extract_cells(sheet, args.rows, args.cols, args.cell_inset, args.bg_tolerance)
    frames, frame_w, frame_h = normalize_frames(grid, args.frame_height, args.pad)

    sheet_path = out_dir / f"{key}_sheet.png"
    save_sheet(frames, frame_w, frame_h, sheet_path)

    # GIFs and individual frames are opt-in: the AI grid is rough so they read poorly.
    # The assembled sheet is the genuinely good artifact.
    if args.gifs or args.frames:
        frames_dir = out_dir / "frames"
        if args.frames:
            frames_dir.mkdir(parents=True, exist_ok=True)
        for r, row in enumerate(frames):
            dname = dirs[r] if r < len(dirs) else f"row{r}"
            if args.gifs:
                save_dir_gif(row, out_dir / f"{key}_{dname}.gif", args.fps, args.preview_scale)
            if args.frames:
                for c, f in enumerate(row):
                    f.save(frames_dir / f"{dname}_{c}.png")

    print(f"Sheet: {sheet_path}  frame {frame_w}x{frame_h}px  grid {args.cols}x{args.rows}")
    print(f"Phaser: this.load.spritesheet('{key}', '{key}_sheet.png', "
          f"{{ frameWidth: {frame_w}, frameHeight: {frame_h} }})")
    print(f"Output in {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
