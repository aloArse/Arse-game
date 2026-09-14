#!/usr/bin/env python3
"""Build docs/arse-game.zip — the complete game as one archive.

Contains the full source tree + the shipped build artifacts (APK + web build),
so a single download backs up / restores everything.

NOTE (delivery): every release must regenerate this zip and push it next to
docs/arse-game.apk — the user wants the zip link with every update.

Excludes: .git, node_modules, dist, .signkey (PRIVATE SIGNING KEY — never
ship it), shots, logs, and the zip itself.
"""
import os
import sys
import zipfile

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))
OUT = os.path.join(ROOT, "docs", "arse-game.zip")

SKIP_DIRS = {".git", "node_modules", "dist", ".signkey", "shots", "__pycache__"}
SKIP_FILES = {"arse-game.zip"}
SKIP_EXT = {".log"}


def main() -> None:
    files = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in sorted(filenames):
            if fn in SKIP_FILES or os.path.splitext(fn)[1] in SKIP_EXT:
                continue
            files.append(os.path.join(dirpath, fn))
    files.sort()

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for p in files:
            arc = os.path.join("arse-game", os.path.relpath(p, ROOT))
            z.write(p, arc)

    size = os.path.getsize(OUT)
    print(f"OK {OUT} {size} bytes — {len(files)} files")
    # safety: the private signing key must never be inside
    with zipfile.ZipFile(OUT) as z:
        bad = [n for n in z.namelist() if ".signkey" in n or n.endswith(".pem")]
        assert not bad, f"PRIVATE KEY LEAKED IN ZIP: {bad}"
    print("private-key check: clean")


if __name__ == "__main__":
    sys.exit(main())
