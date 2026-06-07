#!/usr/bin/env python3
"""Generate Westeros character sprites via OpenAI or Azure gpt-image endpoints.

Two providers:
- azure   : Azure gpt-image-2 deployment (default). Used for image gen only.
- openai  : api.openai.com (or OpenAI-compatible) gpt-image-1/2.

Two modes:
- generations : prompt-only generation (cleanest pixel-art output).
- edits       : reference-locked editing against a layout template sheet.

Pixel-art notes:
- The target sprites are real LimeZu pixel-art assets; Phaser runs pixelArt:true,
  antialias:false. Upscaling AI output with a smooth filter (LANCZOS) destroys
  the pixel look. This script uses NEAREST for any resize and offers an explicit
  --pixel-scale pass that snaps the image to a chunky pixel grid.
- A full 56x20 animation sheet is not something gpt-image reproduces coherently;
  generations mode produces a single clean character. Use --resize-to-sheet only
  when you specifically need a loader-sized PNG.

Run with uv from the repo root:
    uv run python scripts/generate_sprites.py --dry-run
    uv run python scripts/generate_sprites.py --character daenerys --overwrite
"""

from __future__ import annotations

import argparse
import base64
import dataclasses
import io
import json
import os
import pathlib
import struct
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Iterable

try:
    from dotenv import load_dotenv
except ImportError:  # dotenv is optional at runtime
    load_dotenv = None


REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
DEFAULT_ASSETS_DIR = REPO_ROOT / "assets" / "sprites"
DEFAULT_CHARSET_DIR = REPO_ROOT / "assets" / "charsets"
DEFAULT_REFERENCE = REPO_ROOT / "assets" / "sprites_reference" / "limezu_layout_reference.png"

# Phaser loader contract (only enforced when --resize-to-sheet is used).
SHEET_WIDTH = 1792
SHEET_HEIGHT = 1280
FRAME_WIDTH = 32
FRAME_HEIGHT = 64
GRID_COLS = 56
GRID_ROWS = 20

DEFAULT_PROVIDER = "azure"
DEFAULT_AZURE_MODEL = "gpt-image-2"
DEFAULT_OPENAI_MODEL = "gpt-image-1"
DEFAULT_SIZE = "1024x1024"


@dataclasses.dataclass(frozen=True)
class CharacterSpec:
    key: str
    display_name: str
    file_name: str
    visual_anchor: str


class RateLimitError(Exception):
    """Raised on HTTP 429. Carries the suggested retry-after delay in seconds."""

    def __init__(self, message: str, retry_after: float):
        super().__init__(message)
        self.retry_after = retry_after


# Westeros MVP cast - sourced from Docs/Project - Storyboard/Cast & Houses.md,
# plus Daenerys. Visual anchors describe stable identity cues only (palette + silhouette).
CHARACTERS: list[CharacterSpec] = [
    CharacterSpec(
        "ned", "Eddard Stark", "ned stark.png",
        "dark grey Northern leathers, fur-trimmed cloak, brown hair and short beard, solemn warden posture",
    ),
    CharacterSpec(
        "cersei", "Cersei Lannister", "cersei lannister.png",
        "crimson and gold Lannister gown, long golden hair, regal proud bearing",
    ),
    CharacterSpec(
        "tyrion", "Tyrion Lannister", "tyrion lannister.png",
        "fine Lannister doublet, short stature silhouette, light hair, sharp confident stance",
    ),
    CharacterSpec(
        "littlefinger", "Petyr Baelish", "littlefinger baelish.png",
        "dark green merchant finery, mockingbird pin cue, dark hair and pointed beard, subtle smirk posture",
    ),
    CharacterSpec(
        "varys", "Varys", "varys.png",
        "soft flowing robes, bald head, smooth composed bearing, muted neutral palette",
    ),
    CharacterSpec(
        "renly", "Renly Baratheon", "renly baratheon.png",
        "Baratheon green and gold armor accents, dark hair and beard, charismatic upright posture",
    ),
    CharacterSpec(
        "stannis", "Stannis Baratheon", "stannis baratheon.png",
        "austere dark armor, close-cropped hair, stern rigid military posture, muted palette",
    ),
    CharacterSpec(
        "daenerys", "Daenerys Targaryen", "daenerys targaryen.png",
        "platinum-blonde hair, regal bearing, ice-blue and pale gold palette, dragon-queen silhouette",
    ),
    CharacterSpec(
        "robert", "Robert Baratheon", "robert baratheon.png",
        "heavy black and gold royal garb, thick black beard, broad burly build, crowned king bearing",
    ),
    CharacterSpec(
        "jaime", "Jaime Lannister", "jaime lannister.png",
        "polished gold Kingsguard armor, white cloak, golden hair, confident swordsman stance",
    ),
    CharacterSpec(
        "tywin", "Tywin Lannister", "tywin lannister.png",
        "rich crimson and gold lord's robes, balding with side hair, stern commanding posture",
    ),
    CharacterSpec(
        "joffrey", "Joffrey Baratheon", "joffrey baratheon.png",
        "gold-trimmed royal doublet, blond curls, thin crown, petulant boy-king sneer",
    ),
    CharacterSpec(
        "catelyn", "Catelyn Stark", "catelyn stark.png",
        "deep blue Tully gown, auburn hair, dignified northern lady bearing",
    ),
    CharacterSpec(
        "robb", "Robb Stark", "robb stark.png",
        "grey Stark armor and fur cloak, auburn curls and short beard, young warrior-lord stance",
    ),
    CharacterSpec(
        "jon", "Jon Snow", "jon snow.png",
        "black Night's Watch leathers and cloak, dark curly hair, brooding solemn posture",
    ),
    CharacterSpec(
        "sansa", "Sansa Stark", "sansa stark.png",
        "elegant grey-blue gown, long auburn hair, poised reserved bearing",
    ),
    CharacterSpec(
        "arya", "Arya Stark", "arya stark.png",
        "plain brown roughspun tunic and breeches, short brown hair, small wiry defiant stance",
    ),
    CharacterSpec(
        "theon", "Theon Greyjoy", "theon greyjoy.png",
        "dark leather jerkin with kraken cue, dark hair, cocky smirking posture",
    ),
    CharacterSpec(
        "jorah", "Jorah Mormont", "jorah mormont.png",
        "weathered exile's mail and travel cloak, balding with short beard, loyal guarded stance",
    ),
    CharacterSpec(
        "brienne", "Brienne of Tarth", "brienne of tarth.png",
        "blue steel plate armor, short blonde hair, very tall broad earnest knight bearing",
    ),
    CharacterSpec(
        "sandor", "Sandor Clegane", "sandor clegane.png",
        "dark battered armor, burn-scarred face cue, tall hulking grim posture",
    ),
    CharacterSpec(
        "margaery", "Margaery Tyrell", "margaery tyrell.png",
        "green Tyrell gown with floral cue, brown curled hair, charming knowing smile",
    ),
    CharacterSpec(
        "melisandre", "Melisandre", "melisandre.png",
        "flowing deep red robe, red hair, ruby choker cue, mysterious upright bearing",
    ),
    CharacterSpec(
        "davos", "Davos Seaworth", "davos seaworth.png",
        "plain seafarer's leathers and cloak, greying short beard, humble steady stance",
    ),
    # --- Extended cast: notable + obscure speaking characters ---
    CharacterSpec(
        "sam", "Samwell Tarly", "samwell tarly.png",
        "black Night's Watch robes, heavyset build, soft round face, timid bookish posture",
    ),
    CharacterSpec(
        "bronn", "Bronn", "bronn.png",
        "worn leather sellsword armor, dark stubble, smirking roguish stance",
    ),
    CharacterSpec(
        "bran", "Bran Stark", "bran stark.png",
        "grey Stark cloak, young boy, dark hair, solemn faraway expression",
    ),
    CharacterSpec(
        "ramsay", "Ramsay Bolton", "ramsay bolton.png",
        "dark Bolton leathers with flayed-man cue, dark hair, cruel cold smile",
    ),
    CharacterSpec(
        "tormund", "Tormund Giantsbane", "tormund giantsbane.png",
        "thick wildling furs, wild red hair and beard, burly grinning stance",
    ),
    CharacterSpec(
        "gilly", "Gilly", "gilly.png",
        "rough wildling dress and shawl, plain brown hair, gentle wary expression",
    ),
    CharacterSpec(
        "gendry", "Gendry", "gendry.png",
        "blacksmith's leather apron over tunic, dark hair, muscular sturdy build",
    ),
    CharacterSpec(
        "missandei", "Missandei", "missandei.png",
        "simple pale Meereenese gown, dark skin, close-cropped hair, poised intelligent bearing",
    ),
    CharacterSpec(
        "ygritte", "Ygritte", "ygritte.png",
        "wildling furs and leathers, fiery red hair, bow on back, fierce stance",
    ),
    CharacterSpec(
        "daario", "Daario Naharis", "daario naharis.png",
        "ornate sellsword leathers, dark hair and trim beard, cocky charming posture",
    ),
    CharacterSpec(
        "podrick", "Podrick Payne", "podrick payne.png",
        "plain squire's tunic and leathers, dark hair, earnest loyal young stance",
    ),
    CharacterSpec(
        "yara", "Yara Greyjoy", "yara greyjoy.png",
        "dark ironborn leathers, short dark hair, hard confident captain bearing",
    ),
    CharacterSpec(
        "olenna", "Olenna Tyrell", "olenna tyrell.png",
        "elegant Tyrell gown and wimple, elderly, sharp shrewd expression",
    ),
    CharacterSpec(
        "oberyn", "Oberyn Martell", "oberyn martell.png",
        "Dornish orange and gold leathers, dark hair, spear, sly sensual stance",
    ),
    CharacterSpec(
        "tommen", "Tommen Baratheon", "tommen baratheon.png",
        "gold royal doublet, young blond boy, thin crown, gentle uncertain bearing",
    ),
    CharacterSpec(
        "qyburn", "Qyburn", "qyburn.png",
        "pale maester-like robes, greying hair, unsettling mild smile",
    ),
    CharacterSpec(
        "greyworm", "Grey Worm", "grey worm.png",
        "Unsullied bronze armor and pointed helm, dark skin, disciplined rigid stance",
    ),
    CharacterSpec(
        "jaqen", "Jaqen H'ghar", "jaqen hghar.png",
        "Braavosi travel cloak, half red half white hair cue, enigmatic calm bearing",
    ),
    CharacterSpec(
        "shireen", "Shireen Baratheon", "shireen baratheon.png",
        "modest blue dress, young girl, greyscale cheek cue, quiet gentle expression",
    ),
    CharacterSpec(
        "euron", "Euron Greyjoy", "euron greyjoy.png",
        "dark ironborn leathers with reaver cues, dark hair and beard, menacing grin",
    ),
    CharacterSpec(
        "roose", "Roose Bolton", "roose bolton.png",
        "dark Bolton furs with flayed-man sigil, pale eyes, cold still posture",
    ),
    CharacterSpec(
        "mance", "Mance Rayder", "mance rayder.png",
        "layered wildling furs, greying dark hair, weathered commanding bearing",
    ),
    CharacterSpec(
        "barristan", "Barristan Selmy", "barristan selmy.png",
        "white-and-gold Kingsguard armor, elderly with white beard, upright noble stance",
    ),
    CharacterSpec(
        "ellaria", "Ellaria Sand", "ellaria sand.png",
        "flowing Dornish gown, dark wavy hair, fierce sensual expression",
    ),
    CharacterSpec(
        "gregor", "Gregor Clegane", "gregor clegane.png",
        "massive heavy plate armor, towering hulking silhouette, faceless brutal menace",
    ),
    CharacterSpec(
        "drogo", "Khal Drogo", "khal drogo.png",
        "bare-chested Dothraki warrior, long dark braided hair, bronze bells, imposing stance",
    ),
    CharacterSpec(
        "viserys", "Viserys Targaryen", "viserys targaryen.png",
        "fine threadbare Targaryen finery, silver-blond hair, petulant arrogant sneer",
    ),
    CharacterSpec(
        "hodor", "Hodor", "hodor.png",
        "rough stableworker's tunic, very tall heavyset build, simple gentle expression",
    ),
    # --- The Others: White Walkers, wights, and dragons ---
    CharacterSpec(
        "nightking", "The Night King", "night king.png",
        "icy blue-grey skin, crown of ice horns, pale glowing blue eyes, dark frost-rimed armor, cold menacing stance",
    ),
    CharacterSpec(
        "whitewalker", "White Walker", "white walker.png",
        "gaunt icy-blue undead skin, jagged frozen features, glowing pale blue eyes, ragged frost armor, ice spear",
    ),
    CharacterSpec(
        "wight", "Wight", "wight.png",
        "rotting reanimated corpse, tattered rags, exposed bone, glowing blue eyes, lurching aggressive pose",
    ),
    CharacterSpec(
        "drogon", "Drogon", "drogon.png",
        "massive black dragon with red-black wings, jagged horns, glowing red eyes, wings spread, fearsome",
    ),
    CharacterSpec(
        "rhaegal", "Rhaegal", "rhaegal.png",
        "large green-and-bronze dragon, emerald scales, bronze wing membranes, sinuous powerful build",
    ),
    CharacterSpec(
        "viserion", "Viserion", "viserion.png",
        "large cream-and-gold dragon, pale ivory scales, golden horns, graceful winged silhouette",
    ),
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate Westeros sprites via OpenAI or Azure gpt-image")
    parser.add_argument("--provider", default=os.getenv("SPRITE_PROVIDER", DEFAULT_PROVIDER), choices=["azure", "openai"])
    parser.add_argument("--mode", default="generations", choices=["generations", "edits"])
    parser.add_argument("--style", default="pokemon", choices=["pokemon", "walk-sheet", "realistic"],
                        help="Visual preset: pokemon chibi overworld, a 4-direction walk sheet, or full-body realistic")
    parser.add_argument("--model", default="", help="Model / deployment name (defaults per provider)")
    parser.add_argument("--assets-dir", default="", help="Target output directory (default: assets/sprites, or assets/charsets for walk-sheet style)")
    parser.add_argument("--reference", default=str(DEFAULT_REFERENCE), help="Reference sheet for edits mode")
    parser.add_argument("--character", default="all", help="Character key to generate (or 'all')")
    parser.add_argument("--size", default=os.getenv("OPENAI_IMAGE_SIZE", DEFAULT_SIZE), help="Generation size (e.g. 1024x1024)")
    parser.add_argument("--quality", default=os.getenv("OPENAI_IMAGE_QUALITY", "high"), help="Image quality (low/medium/high/auto)")
    parser.add_argument("--output-format", default="png", help="Output image format")
    parser.add_argument("--transparent", dest="transparent", action="store_true", default=False,
                        help="Post-process: flood-fill the flat background to transparent (off by default; can leave weird edges)")
    parser.add_argument("--no-transparent", dest="transparent", action="store_false",
                        help="Keep the original opaque background (default)")
    parser.add_argument("--bg-tolerance", type=int, default=36,
                        help="Background color match tolerance for transparency flood-fill (0-255)")
    parser.add_argument("--max-pocket-frac", type=float, default=0.04,
                        help="Max area (fraction of image) of an enclosed background pocket to remove; protects large light regions")
    parser.add_argument("--pixel-scale", type=int, default=0, help="If >1, downscale by this factor then nearest-upscale for chunky pixels")
    parser.add_argument("--resize-to-sheet", action="store_true", help="Resize final output to the sheet size with NEAREST")
    parser.add_argument("--custom-name", default="", help="Display name for a custom single character")
    parser.add_argument("--custom-file", default="", help="Output PNG file name for a custom single character")
    parser.add_argument("--custom-anchor", default="", help="Visual anchor text for a custom single character")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite existing sprite files")
    parser.add_argument("--dry-run", action="store_true", help="Print prompts and planned writes without calling API")
    parser.add_argument("--sleep-seconds", type=float, default=0.6, help="Delay between API calls")
    parser.add_argument("--concurrency", type=int, default=6, help="Number of characters to generate in parallel")
    parser.add_argument("--retries", type=int, default=1, help="Retries per character after first failure")
    parser.add_argument("--timeout-seconds", type=float, default=float(os.getenv("OPENAI_TIMEOUT_SECONDS", "300")))
    parser.add_argument("--manifest-out", default="", help="Optional path for JSON summary report")
    return parser.parse_args()


def read_png_size(path: pathlib.Path) -> tuple[int, int]:
    with path.open("rb") as f:
        header = f.read(24)
    if len(header) < 24 or header[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"Not a valid PNG: {path}")
    width, height = struct.unpack(">II", header[16:24])
    return width, height


def build_prompt(spec: CharacterSpec, mode: str, style: str = "pokemon") -> str:
    is_dragon = spec.key in {"drogon", "rhaegal", "viserion"}

    if mode == "edits":
        return (
            "Edit the uploaded LimeZu-style spritesheet, keeping the exact grid layout, frame order, "
            "and transparent background. Only change the character identity consistently across all frames. "
            f"Canvas stays {SHEET_WIDTH}x{SHEET_HEIGHT}, grid {GRID_COLS}x{GRID_ROWS}, frames {FRAME_WIDTH}x{FRAME_HEIGHT}. "
            "Crisp pixel art, no anti-aliasing, no text, no watermarks. "
            f"Character target: {spec.display_name}. Visual anchor: {spec.visual_anchor}."
        )

    if style == "walk-sheet":
        if is_dragon:
            # Top-down creature sheet: 4 facing directions x 3-frame wing-flap/move cycle.
            return (
                "Pokemon-style overworld creature sprite sheet of a flying dragon on a single transparent image, "
                "arranged as a clean grid of 4 rows and 3 columns. "
                "Row order top to bottom: facing down, facing left, facing right, facing up. "
                "Each row is a 3-frame wing-flapping movement cycle. "
                "Nintendo DS Pokemon Platinum overworld style: compact chibi creature proportions, "
                "spread wings, thick dark outline, flat cel shading, limited palette. "
                "Crisp pixel art, no anti-aliasing, evenly spaced identical-size cells, transparent background, "
                "no text, no labels, no grid lines, no watermark. "
                f"Creature: {spec.display_name}. Visual anchor: {spec.visual_anchor}."
            )
        # RPG Maker / Pokemon Essentials charset: 4 rows (down, left, right, up) x 3 walk frames.
        return (
            "Pokemon-style overworld character walking sprite sheet on a single transparent image, "
            "arranged as a clean grid of 4 rows and 3 columns. "
            "Row order top to bottom: facing down, facing left, facing right, facing up. "
            "Each row is a 3-frame walk cycle (left foot, stand, right foot) with legs clearly stepping. "
            "Nintendo DS Pokemon Platinum overworld style: chibi proportions, big head, small body, "
            "short legs with visible feet, thick dark outline, flat cel shading, limited palette. "
            "Crisp pixel art, no anti-aliasing, evenly spaced identical-size cells, transparent background, "
            "no text, no labels, no grid lines, no watermark. "
            f"Character: {spec.display_name}. Visual anchor: {spec.visual_anchor}."
        )

    if style == "realistic":
        if is_dragon:
            return (
                "16-bit pixel-art creature sprite of a dragon, single dynamic pose with wings spread, "
                "full body, centered, crisp hard pixels, no anti-aliasing, limited retro palette, "
                "clean transparent background, no text, no watermark, no border. "
                "Epic dark-fantasy Westeros style. "
                f"Dragon: {spec.display_name}. Visual anchor: {spec.visual_anchor}."
            )
        return (
            "16-bit pixel-art top-down RPG character sprite, single standing pose facing the camera, "
            "full body, centered, crisp hard pixels, no anti-aliasing, limited retro palette, "
            "clean transparent background, no text, no watermark, no border. "
            "Medieval-fantasy Westeros style. "
            f"Character: {spec.display_name}. Visual anchor: {spec.visual_anchor}."
        )

    # pokemon (default): single chibi overworld trainer, front-facing, visible legs/feet.
    return (
        "Single Nintendo DS Pokemon Platinum overworld character sprite, front-facing standing pose, "
        "chibi proportions with a large head, small body and short legs with clearly visible feet, "
        "thick dark outline, flat cel shading, limited retro palette, crisp pixel art, no anti-aliasing, "
        "centered, clean fully transparent background, no shadow, no text, no watermark, no border. "
        "Medieval-fantasy Westeros outfit. "
        f"Character: {spec.display_name}. Visual anchor: {spec.visual_anchor}."
    )


def iter_targets(key: str) -> Iterable[CharacterSpec]:
    if key == "all":
        return CHARACTERS
    for spec in CHARACTERS:
        if spec.key == key:
            return [spec]
    valid = ", ".join([s.key for s in CHARACTERS] + ["all"])
    raise ValueError(f"Unknown --character '{key}'. Valid values: {valid}")


def resolve_targets(args: argparse.Namespace) -> list[CharacterSpec]:
    known_keys = {spec.key for spec in CHARACTERS}

    if args.character in known_keys or args.character == "all":
        targets = list(iter_targets(args.character))
        # Allow per-field overrides even for known cast keys (e.g. custom output file
        # so a walk-sheet run does not clobber the character portrait).
        if len(targets) == 1:
            base = targets[0]
            targets = [CharacterSpec(
                base.key,
                args.custom_name or base.display_name,
                args.custom_file or base.file_name,
                args.custom_anchor or base.visual_anchor,
            )]
        return targets

    if not args.custom_name or not args.custom_file:
        valid = ", ".join(sorted(known_keys) + ["all"])
        raise ValueError(
            f"Unknown --character '{args.character}'. Provide --custom-name and --custom-file for custom generation. "
            f"Known values: {valid}"
        )

    anchor = args.custom_anchor or "readable silhouette, consistent pixel-art identity"
    return [CharacterSpec(args.character, args.custom_name, args.custom_file, anchor)]


# --- providers -------------------------------------------------------------


def azure_generate(args: argparse.Namespace, prompt: str, reference: pathlib.Path) -> bytes:
    import httpx

    endpoint = os.getenv("AZURE_IMAGE_ENDPOINT", "").rstrip("/")
    deployment = args.model or os.getenv("AZURE_IMAGE_DEPLOYMENT", DEFAULT_AZURE_MODEL)
    api_version = os.getenv("AZURE_IMAGE_API_VERSION", "2024-02-01")
    api_key = os.getenv("AZURE_IMAGE_API_KEY", "")
    if not endpoint or not api_key:
        raise RuntimeError("AZURE_IMAGE_ENDPOINT and AZURE_IMAGE_API_KEY must be set for the azure provider")

    base = f"{endpoint}/openai/deployments/{deployment}/images"
    params = {"api-version": api_version}
    headers = {"Authorization": f"Bearer {api_key}", "api-key": api_key}

    with httpx.Client(timeout=args.timeout_seconds) as client:
        if args.mode == "edits":
            files = {"image": (reference.name, reference.read_bytes(), "image/png")}
            data = {"prompt": prompt, "size": args.size, "n": "1", "output_format": args.output_format}
            resp = client.post(f"{base}/edits", params=params, headers=headers, data=data, files=files)
        else:
            body = {
                "prompt": prompt,
                "size": args.size,
                "quality": args.quality,
                "output_format": args.output_format,
                "n": 1,
            }
            resp = client.post(
                f"{base}/generations",
                params=params,
                headers={**headers, "Content-Type": "application/json"},
                json=body,
            )

    if resp.status_code == 429:
        retry_after = resp.headers.get("retry-after")
        try:
            delay = float(retry_after) if retry_after else 30.0
        except ValueError:
            delay = 30.0
        raise RateLimitError(f"Azure rate limit (429); retry after {delay}s", delay)
    if resp.status_code >= 400:
        raise RuntimeError(f"Azure error {resp.status_code}: {resp.text[:400]}")
    payload = resp.json()
    item = payload["data"][0]
    if item.get("b64_json"):
        return base64.b64decode(item["b64_json"])
    if item.get("url"):
        with httpx.Client(timeout=args.timeout_seconds) as client:
            return client.get(item["url"]).content
    raise RuntimeError("Azure response missing b64_json/url")


def openai_generate(args: argparse.Namespace, prompt: str, reference: pathlib.Path) -> bytes:
    from openai import OpenAI

    model = args.model or DEFAULT_OPENAI_MODEL
    client = OpenAI(
        api_key=os.getenv("OPENAI_API_KEY"),
        base_url=os.getenv("OPENAI_BASE_URL"),
        timeout=args.timeout_seconds,
    )
    if args.mode == "edits":
        with reference.open("rb") as ref_f:
            result = client.images.edit(model=model, image=ref_f, prompt=prompt, size=args.size)
    else:
        result = client.images.generate(model=model, prompt=prompt, size=args.size)

    if not result.data:
        raise RuntimeError("No image data returned")
    item = result.data[0]
    if getattr(item, "b64_json", None):
        return base64.b64decode(item.b64_json)
    if getattr(item, "url", None):
        import urllib.request

        with urllib.request.urlopen(item.url) as r:
            return r.read()
    raise RuntimeError("OpenAI response missing b64_json/url")


def generate_image_bytes(args: argparse.Namespace, prompt: str, reference: pathlib.Path) -> bytes:
    if args.provider == "azure":
        return azure_generate(args, prompt, reference)
    return openai_generate(args, prompt, reference)


# --- post-processing -------------------------------------------------------


def make_transparent(png_bytes: bytes, tolerance: int, max_pocket_frac: float = 0.04) -> bytes:
    """Make the flat generated background transparent.

    gpt-image-2 has no native transparency, but its backgrounds are a near-uniform
    flat color. Two passes:
      1. Corner-seeded flood fill removes the outer background connected to the edges.
      2. Enclosed pockets (background-colored regions trapped inside the silhouette,
         e.g. the gap between an arm and the torso) are removed too -- but only if a
         pocket is smaller than `max_pocket_frac` of the image. That area cap protects
         large light-colored character regions (a near-white gown) from being punched out.
    """
    from PIL import Image

    with Image.open(io.BytesIO(png_bytes)) as src:
        img = src.convert("RGBA")
    width, height = img.size
    px = img.load()

    corners = [(0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1)]
    seeds = [(px[x, y][0], px[x, y][1], px[x, y][2]) for x, y in corners]

    def matches(r: int, g: int, b: int) -> bool:
        for sr, sg, sb in seeds:
            if abs(r - sr) <= tolerance and abs(g - sg) <= tolerance and abs(b - sb) <= tolerance:
                return True
        return False

    # Pass 1: outer background connected to the border.
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
        r, g, b, _ = px[x, y]
        if not matches(r, g, b):
            continue
        px[x, y] = (r, g, b, 0)
        stack.extend([(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)])

    # Pass 2: enclosed background pockets, removed only when smaller than the area cap.
    max_pocket_px = int(max_pocket_frac * width * height)
    for sy in range(height):
        for sx in range(width):
            idx0 = sy * width + sx
            if visited[idx0]:
                continue
            r, g, b, a = px[sx, sy]
            if a == 0 or not matches(r, g, b):
                visited[idx0] = 1
                continue
            # BFS this enclosed background-colored component.
            component = []
            comp_stack = [(sx, sy)]
            visited[idx0] = 1
            while comp_stack:
                x, y = comp_stack.pop()
                cr, cg, cb, ca = px[x, y]
                if ca == 0 or not matches(cr, cg, cb):
                    continue
                component.append((x, y))
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < width and 0 <= ny < height:
                        nidx = ny * width + nx
                        if not visited[nidx]:
                            visited[nidx] = 1
                            comp_stack.append((nx, ny))
            if len(component) <= max_pocket_px:
                for x, y in component:
                    cr, cg, cb, _ = px[x, y]
                    px[x, y] = (cr, cg, cb, 0)

    out = io.BytesIO()
    img.save(out, format="PNG")
    return out.getvalue()


def pixelate(png_bytes: bytes, scale: int) -> bytes:
    """Downscale by `scale` then nearest-upscale to enforce chunky pixels."""
    from PIL import Image

    with Image.open(io.BytesIO(png_bytes)) as img:
        img = img.convert("RGBA")
        small = img.resize((max(1, img.width // scale), max(1, img.height // scale)), Image.NEAREST)
        out_img = small.resize(img.size, Image.NEAREST)
        out = io.BytesIO()
        out_img.save(out, format="PNG")
        return out.getvalue()


def resize_nearest(png_bytes: bytes, width: int, height: int) -> bytes:
    """Resize to exact dimensions with NEAREST to preserve hard pixels."""
    from PIL import Image

    with Image.open(io.BytesIO(png_bytes)) as img:
        img = img.convert("RGBA").resize((width, height), Image.NEAREST)
        out = io.BytesIO()
        img.save(out, format="PNG")
        return out.getvalue()


def main() -> int:
    if load_dotenv is not None:
        load_dotenv(REPO_ROOT / ".env")

    args = parse_args()

    # Auto-route output: walk-sheets go to assets/charsets, big art to assets/sprites,
    # so generating a walk-sheet never clobbers a character portrait. An explicit
    # --assets-dir always wins.
    if args.assets_dir:
        assets_dir = pathlib.Path(args.assets_dir)
    elif args.style == "walk-sheet":
        assets_dir = DEFAULT_CHARSET_DIR
    else:
        assets_dir = DEFAULT_ASSETS_DIR
    reference = pathlib.Path(args.reference)

    if args.mode == "edits" and not reference.exists():
        print(f"Reference sprite does not exist: {reference}", file=sys.stderr)
        return 2

    targets = resolve_targets(args)

    if args.dry_run:
        print(
            f"Dry run: provider={args.provider} mode={args.mode} size={args.size} "
            f"model={args.model or '(default)'} pixel_scale={args.pixel_scale}"
        )
        for spec in targets:
            out_path = assets_dir / spec.file_name
            print(f"- {spec.key:14s} -> {out_path}")
            print(f"  prompt: {build_prompt(spec, args.mode, args.style)}")
        return 0

    assets_dir.mkdir(parents=True, exist_ok=True)
    model_label = args.model or (DEFAULT_AZURE_MODEL if args.provider == "azure" else DEFAULT_OPENAI_MODEL)
    concurrency = max(1, args.concurrency)
    print(
        f"Generating {len(targets)} sprite(s) | provider={args.provider} "
        f"model={model_label} mode={args.mode} size={args.size} concurrency={concurrency}"
    )

    total = len(targets)
    print_lock = threading.Lock()

    def log(msg: str, err: bool = False) -> None:
        with print_lock:
            print(msg, file=sys.stderr if err else sys.stdout, flush=True)

    def worker(idx: int, spec: CharacterSpec) -> dict[str, str]:
        out_path = assets_dir / spec.file_name

        if out_path.exists() and not args.overwrite:
            log(f"[{idx}/{total}] skip {spec.key}: file exists ({out_path})")
            return {"character": spec.key, "status": "skipped", "path": str(out_path)}

        prompt = build_prompt(spec, args.mode, args.style)
        last_err: Exception | None = None
        attempt = 0
        rate_limit_waits = 0
        max_rate_limit_waits = 6

        while attempt <= args.retries:
            try:
                log(f"[{idx}/{total}] {spec.key}: generating (attempt {attempt + 1})")
                png_bytes = generate_image_bytes(args, prompt, reference)

                if args.transparent:
                    png_bytes = make_transparent(png_bytes, args.bg_tolerance, args.max_pocket_frac)
                if args.pixel_scale and args.pixel_scale > 1:
                    png_bytes = pixelate(png_bytes, args.pixel_scale)
                if args.resize_to_sheet:
                    png_bytes = resize_nearest(png_bytes, SHEET_WIDTH, SHEET_HEIGHT)

                if png_bytes[:8] != b"\x89PNG\r\n\x1a\n":
                    raise ValueError("Output is not PNG")

                out_path.write_bytes(png_bytes)
                w, h = read_png_size(out_path)
                log(f"[{idx}/{total}] {spec.key}: wrote {out_path} ({w}x{h})")
                return {"character": spec.key, "status": "ok", "path": str(out_path), "dims": f"{w}x{h}"}
            except RateLimitError as exc:
                # Rate-limit waits do not consume the retry budget (up to a cap).
                last_err = exc
                if rate_limit_waits >= max_rate_limit_waits:
                    log(f"[{idx}/{total}] {spec.key}: giving up after {rate_limit_waits} rate-limit waits", err=True)
                    break
                rate_limit_waits += 1
                wait = exc.retry_after + 1.0
                log(f"[{idx}/{total}] {spec.key}: rate limited, waiting {wait:.0f}s (wait {rate_limit_waits})", err=True)
                time.sleep(wait)
            except Exception as exc:
                last_err = exc
                log(f"[{idx}/{total}] {spec.key}: failed attempt {attempt + 1}: {exc}", err=True)
                attempt += 1
                if attempt <= args.retries:
                    time.sleep(args.sleep_seconds)

        return {"character": spec.key, "status": "failed", "error": str(last_err)}

    manifest = []
    with ThreadPoolExecutor(max_workers=concurrency) as executor:
        futures = {
            executor.submit(worker, idx, spec): spec
            for idx, spec in enumerate(targets, start=1)
        }
        for future in as_completed(futures):
            manifest.append(future.result())

    # Stable order in the manifest by original roster position.
    order = {spec.key: i for i, spec in enumerate(targets)}
    manifest.sort(key=lambda m: order.get(m["character"], 0))

    if args.manifest_out:
        manifest_path = pathlib.Path(args.manifest_out)
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        print(f"Wrote manifest: {manifest_path}")

    failures = [m for m in manifest if m.get("status") == "failed"]
    if failures:
        print(f"Completed with {len(failures)} failure(s)", file=sys.stderr)
        return 1

    print("Completed successfully")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
