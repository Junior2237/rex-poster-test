"""Embed a compact offline verification index from approved files (Pillow required)."""
import argparse
import base64
import concurrent.futures
import json
import re
import time
import urllib.request
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageOps

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("--cache", type=Path, required=True)
args = parser.parse_args()
args.cache.mkdir(parents=True, exist_ok=True)
registry = json.loads((root / "face_safe_posters.json").read_text())["overrides"]
paths = sorted({c["posterPath"] for row in registry.values() for c in row["layouts"].values()})


def fingerprint(path):
    dest = args.cache / path.lstrip("/")
    if not dest.exists():
        for attempt in range(4):
            try:
                with urllib.request.urlopen("https://image.tmdb.org/t/p/w185" + path, timeout=25) as response:
                    data = response.read()
                Image.open(BytesIO(data)).verify()
                dest.write_bytes(data)
                break
            except OSError:
                if attempt == 3:
                    raise
                time.sleep(1 + attempt)
    with Image.open(dest) as image:
        grid = ImageOps.exif_transpose(image).convert("RGB").resize((4, 6), Image.Resampling.BOX)
    levels = [value // 16 for value in grid.tobytes()]
    packed = bytes((a << 4) | b for a, b in zip(levels[::2], levels[1::2]))
    return base64.b64encode(packed).decode()


with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
    signatures = dict(zip(paths, pool.map(fingerprint, paths)))
index = {}
for key, row in registry.items():
    index[key] = [row["title"], {
        layout: [choice["posterPath"], signatures[choice["posterPath"]]]
        for layout, choice in row["layouts"].items()
    }]
    if index[key][1].get("top20") == index[key][1].get("trending"):
        index[key][1]["trending"] = 0
source = (root / "artwork" / "verify-poster.js").read_text()
encoded = json.dumps(index, ensure_ascii=True, separators=(",", ":")).replace("<", "\\u003c")
source = source.replace("/* REGISTRY */ {}", encoded)
for name in ("rex_top20_regular_logo_renderer.html","rex_top20_logo_renderer.html","rex_oversized_apple_style_unnumbered.html"):
    file = root / name
    text = file.read_text()
    begin, end = "/* BEGIN POSTER VERIFICATION */", "/* END POSTER VERIFICATION */"
    generated = begin + "\n" + source + end + "\n"
    if begin in text:
        text = re.sub(re.escape(begin) + r".*?" + re.escape(end) + r"\n", lambda _: generated, text, flags=re.S)
    else:
        text = text.replace("function approvedFile(value){", generated + "function approvedFile(value){")
    file.write_text(text)
print(f"Indexed {len(registry)} titles and {len(paths)} distinct posters")
