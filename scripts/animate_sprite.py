#!/usr/bin/env python3
"""Turn a static character sprite into a Pokemon-style overworld walk animation.

Goal: approximate the Nintendo DS Pokemon Platinum overworld look from a single
forward-facing character image. Two things make that look work:

1. Small, chunky pixels. A detailed 1024px render never reads as Pokemon. We hard
   downscale the character to a small pixel height (NEAREST) so it becomes crunchy.
2. Real stepping. Pokemon walks are a short cycle where the legs alternate, with a
   1px vertical bob - not a floating bob of the whole body. We segment the leg
   region and lift each leg on alternating frames.

Single forward sprite limitation: we can only synthesize the DOWN-facing (toward
camera) walk from one front view. Left/right/up need their own source views.

Outputs into assets/anim/<key>/:
- <key>_walk_strip.png  : native-size sprite strip (game-ready frames)
- <key>_walk.gif        : upscaled preview (nearest) so it is visible
- <key>_idle_strip.png / <key>_idle.gif

Run with uv:
    uv run python scripts/animate_sprite.py --input "assets/sprites/daenerys targaryen.png"
"""

from __future__ import annotations

import argparse
import pathlib

from PIL import Image


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Pokemon-style walk animation from a static sprite")
    p.add_argument("--input", required=True, help="Path to the source character PNG")
    p.add_argument("--key", default="", help="Output key/name (defaults to input stem slug)")
    p.add_argument("--out-dir", default="assets/anim", help="Base output directory")
    p.add_argument("--pixel-height", type=int, default=48, help="Character height in real pixels (smaller = chunkier)")
    p.add_argument("--frame-pad", type=int, default=6, help="Transparent padding around the character (px)")
    p.add_argument("--leg-ratio", type=float, default=0.32, help="Fraction of character height treated as legs")
    p.add_argument("--lift", type=int, default=2, help="Leg lift in pixels on each step")
    p.add_argument("--bob", type=int, default=1, help="Body bob in pixels on step frames")
    p.add_argument("--bg-tolerance", type=int, default=36, help="Background color match tolerance (0-255)")
    p.add_argument("--preview-scale", type=int, default=6, help="Nearest upscale factor for the preview GIF")
    p.add_argument("--fps", type=int, default=6, help="GIF playback fps")
    return p.parse_args()


def remove_background(img: Image.Image, tolerance: int) -> Image.Image:
    """Flood-fill transparent from the four corners based on color similarity."""
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


def crop_to_content(img: Image.Image) -> Image.Image:
    bbox = img.getbbox()
    return img.crop(bbox) if bbox else img


def crunch(sprite: Image.Image, pixel_height: int) -> Image.Image:
    """Downscale (NEAREST) so the character is `pixel_height` px tall - the crunchy Pokemon look."""
    w, h = sprite.size
    scale = pixel_height / h
    new_w, new_h = max(1, round(w * scale)), max(1, round(h * scale))
    return sprite.resize((new_w, new_h), Image.NEAREST)


def make_canvas(char_w: int, char_h: int, pad: int) -> tuple[int, int]:
    return char_w + pad * 2, char_h + pad * 2


def place_static(sprite: Image.Image, frame_w: int, frame_h: int, pad: int, dy: int = 0) -> Image.Image:
    frame = Image.new("RGBA", (frame_w, frame_h), (0, 0, 0, 0))
    x = (frame_w - sprite.width) // 2
    y = frame_h - pad - sprite.height + dy
    frame.alpha_composite(sprite, (x, y))
    return frame


def step_frame(sprite: Image.Image, frame_w: int, frame_h: int, pad: int,
               leg_ratio: float, lift: int, bob: int, lift_left: bool) -> Image.Image:
    """Compose one walking frame by lifting one leg and bobbing the body up."""
    w, h = sprite.size
    leg_h = max(1, int(round(h * leg_ratio)))
    body = sprite.crop((0, 0, w, h - leg_h))
    legs = sprite.crop((0, h - leg_h, w, h))
    mid = w // 2
    left_leg = legs.crop((0, 0, mid, leg_h))
    right_leg = legs.crop((mid, 0, w, leg_h))

    frame = Image.new("RGBA", (frame_w, frame_h), (0, 0, 0, 0))
    base_x = (frame_w - w) // 2
    base_y = frame_h - pad - h - bob  # whole body lifts slightly on a step

    # Body
    frame.alpha_composite(body, (base_x, base_y))
    # Legs (lift one)
    legs_y = base_y + (h - leg_h)
    ll_dy = -lift if lift_left else 0
    rl_dy = -lift if not lift_left else 0
    frame.alpha_composite(left_leg, (base_x, legs_y + ll_dy))
    frame.alpha_composite(right_leg, (base_x + mid, legs_y + rl_dy))
    return frame


def build_walk(sprite: Image.Image, frame_w: int, frame_h: int, pad: int,
               leg_ratio: float, lift: int, bob: int) -> list[Image.Image]:
    neutral = place_static(sprite, frame_w, frame_h, pad, dy=0)
    step_l = step_frame(sprite, frame_w, frame_h, pad, leg_ratio, lift, bob, lift_left=True)
    step_r = step_frame(sprite, frame_w, frame_h, pad, leg_ratio, lift, bob, lift_left=False)
    # Classic 4-frame Pokemon cycle: stand, left step, stand, right step.
    return [neutral, step_l, neutral, step_r]


def build_idle(sprite: Image.Image, frame_w: int, frame_h: int, pad: int) -> list[Image.Image]:
    # Subtle 1px breathing reads as a slow bob.
    return [
        place_static(sprite, frame_w, frame_h, pad, dy=0),
        place_static(sprite, frame_w, frame_h, pad, dy=-1),
    ]


def save_strip(frames: list[Image.Image], path: pathlib.Path) -> None:
    fw, fh = frames[0].size
    strip = Image.new("RGBA", (fw * len(frames), fh), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        strip.alpha_composite(f, (i * fw, 0))
    strip.save(path)


def save_gif(frames: list[Image.Image], path: pathlib.Path, fps: int, scale: int) -> None:
    duration = int(1000 / max(1, fps))
    upscaled = [f.resize((f.width * scale, f.height * scale), Image.NEAREST) for f in frames]
    upscaled[0].save(
        path,
        save_all=True,
        append_images=upscaled[1:],
        duration=duration,
        loop=0,
        disposal=2,
        transparency=0,
    )


def main() -> int:
    args = parse_args()
    src = pathlib.Path(args.input)
    if not src.exists():
        print(f"Input not found: {src}")
        return 2

    key = args.key or src.stem.lower().replace(" ", "_")
    out_dir = pathlib.Path(args.out_dir) / key
    out_dir.mkdir(parents=True, exist_ok=True)

    img = Image.open(src)
    img = remove_background(img, args.bg_tolerance)
    img = crop_to_content(img)
    sprite = crunch(img, args.pixel_height)

    frame_w, frame_h = make_canvas(sprite.width, sprite.height, args.frame_pad)

    walk = build_walk(sprite, frame_w, frame_h, args.frame_pad, args.leg_ratio, args.lift, args.bob)
    idle = build_idle(sprite, frame_w, frame_h, args.frame_pad)

    for clip, frames in {"walk": walk, "idle": idle}.items():
        strip_path = out_dir / f"{key}_{clip}_strip.png"
        gif_path = out_dir / f"{key}_{clip}.gif"
        save_strip(frames, strip_path)
        save_gif(frames, gif_path, args.fps, args.preview_scale)
        print(f"{clip}: {len(frames)} frames, frame {frame_w}x{frame_h}px -> {strip_path.name}, {gif_path.name}")

    print(f"Done. Character height {args.pixel_height}px. Output in {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
