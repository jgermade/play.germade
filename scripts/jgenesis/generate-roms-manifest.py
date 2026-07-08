#!/usr/bin/env python3
"""Scans a ROMs root directory for per-console subdirectories and generates
a roms.<console>.json manifest for each console.

Usage: generate-roms-manifest.py <roms-root>

The <roms-root> directory (e.g. public/roms) is expected to contain one
subdirectory per console, named after the console slug:

    public/roms/
      megadrive/   <- .md, .gen, .bin, .smd ROMs
      snes/        <- .sfc, .smc ROMs
      nes/         <- .nes ROMs
      ...

For each console subdirectory that contains at least one ROM file, this
script writes a manifest at <roms-root>/roms.<console>.json (e.g.
`public/roms/roms.megadrive.json`).

Each manifest is an array of objects with:
  - filename: the ROM filename (e.g. "Sonic the Hedgehog.gen")
  - title: a human-readable title derived from the filename
  - url: relative URL to fetch the ROM
    (e.g. "/roms/megadrive/Sonic the Hedgehog.gen")
"""

import json
import re
import sys
from pathlib import Path

# Supported ROM extensions grouped by console. The console name is the
# directory name (slug) under <roms-root>. A console directory is scanned
# for ANY of its associated extensions.
CONSOLE_EXTENSIONS = {
    "megadrive": {".md", ".gen", ".bin", ".smd"},  # Genesis/Megadrive
    "snes": {".sfc", ".smc"},                      # SNES
    "nes": {".nes"},                               # NES
    "gba": {".gba"},                               # Game Boy Advance
    "sms": {".sms"},                               # Sega Master System
    "gg": {".gg"},                                 # Game Gear
    "32x": {".32x"},                               # Sega 32X
    "segacd": {".chd"},                            # Sega CD
}

# Fallback: if a console directory is not in CONSOLE_EXTENSIONS, scan for
# any known ROM extension so users can add new consoles without editing
# this script.
ALL_KNOWN_EXTENSIONS = set().union(*CONSOLE_EXTENSIONS.values())


def filename_to_title(filename: str) -> str:
    """Convert a ROM filename to a human-readable title."""
    # Remove extension
    stem = Path(filename).stem
    # Replace underscores/dots with spaces
    title = stem.replace("_", " ").replace(".", " ")
    # Title case but keep already-capitalized words
    title = " ".join(
        word[0].upper() + word[1:] if word and word[0].islower() else word
        for word in title.split()
    )
    # Collapse multiple spaces
    title = re.sub(r"\s+", " ", title).strip()
    return title


def scan_console(console_dir: Path, console: str) -> list[dict] | None:
    """Scan a console subdirectory for ROM files.

    Returns a list of ROM manifest entries, or None if the directory does
    not exist or contains no ROM files.
    """
    if not console_dir.is_dir():
        return None

    allowed = CONSOLE_EXTENSIONS.get(console, ALL_KNOWN_EXTENSIONS)

    roms = []
    for entry in sorted(console_dir.iterdir()):
        if not entry.is_file():
            continue
        if entry.name == ".gitkeep":
            continue
        if entry.suffix.lower() not in allowed:
            continue

        roms.append({
            "filename": entry.name,
            "title": filename_to_title(entry.name),
            "url": f"/roms/{console}/{entry.name}",
        })

    return roms if roms else None


def main() -> None:
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <roms-root>")
        sys.exit(1)

    roms_root = Path(sys.argv[1])
    if not roms_root.is_dir():
        print(f"Error: {roms_root} is not a directory")
        sys.exit(1)

    # Discover console subdirectories. We consider any immediate
    # subdirectory of <roms-root> as a potential console directory.
    console_dirs = sorted(
        entry for entry in roms_root.iterdir() if entry.is_dir()
    )

    if not console_dirs:
        print(f"No console subdirectories found in {roms_root}")
        sys.exit(0)

    generated = 0
    for console_dir in console_dirs:
        console = console_dir.name
        roms = scan_console(console_dir, console)
        if roms is None:
            print(f"  [{console}] no ROMs found, skipping")
            continue

        output_path = roms_root / f"roms.{console}.json"
        output_path.write_text(
            json.dumps(roms, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        generated += 1
        print(f"Generated {output_path} with {len(roms)} ROM(s)")
        for rom in roms:
            print(f"  - {rom['title']} ({rom['filename']})")

    print(f"\nDone. {generated} manifest(s) generated in {roms_root}")


if __name__ == "__main__":
    main()