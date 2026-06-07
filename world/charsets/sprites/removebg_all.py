"""
Remove backgrounds from all character sprites using remove.bg API.
Run from anywhere — saves results to [character]_removebg folders inside the sprites directory.

Usage:
    python removebg_all.py
"""

import os
import time
import requests

API_KEY = "jttnuVPwdMfDNx8xBrAxBszX"
SPRITES_DIR = os.path.dirname(os.path.abspath(__file__))

characters = sorted([
    d for d in os.listdir(SPRITES_DIR)
    if os.path.isdir(os.path.join(SPRITES_DIR, d))
    and not d.endswith("_removebg")
])

print(f"Found {len(characters)} characters\n")

total_ok, total_fail = 0, 0

for char in characters:
    char_dir = os.path.join(SPRITES_DIR, char)
    out_dir = os.path.join(SPRITES_DIR, f"{char}_removebg")
    os.makedirs(out_dir, exist_ok=True)

    images = sorted([f for f in os.listdir(char_dir) if f.lower().endswith(".png")])
    print(f"[{char}] {len(images)} images")

    for img_name in images:
        out_path = os.path.join(out_dir, img_name)
        if os.path.exists(out_path):
            print(f"  SKIP {img_name}")
            total_ok += 1
            continue

        try:
            with open(os.path.join(char_dir, img_name), "rb") as f:
                r = requests.post(
                    "https://api.remove.bg/v1.0/removebg",
                    files={"image_file": f},
                    data={"size": "preview"},
                    headers={"X-Api-Key": API_KEY},
                    timeout=30,
                )
            if r.status_code == 200:
                with open(out_path, "wb") as out:
                    out.write(r.content)
                print(f"  OK  {img_name}")
                total_ok += 1
            else:
                print(f"  ERR {img_name} — {r.status_code}: {r.text.strip()}")
                total_fail += 1
        except Exception as e:
            print(f"  EXC {img_name} — {e}")
            total_fail += 1

        time.sleep(0.2)

    print()

print(f"All done. {total_ok} succeeded, {total_fail} failed.")
