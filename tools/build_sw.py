#!/usr/bin/env python3
"""Rewrite the ASSETS array and VERSION constant inside sw.js.

Usage: python3 tools/build_sw.py [--from-fs]

By default the precache list is built from `git ls-files` (so only files the Planner has
actually committed are ever precached). `--from-fs` instead walks the working tree — this
exists ONLY for the e2e test, since at test time nothing has been committed yet.

Excludes: tools/, tests/, docs/, .gitignore, README.md (and the .git directory itself when
walking the filesystem). Idempotent: running it twice with no other changes produces byte-
identical output, because VERSION is hashed from every precached file's content EXCEPT sw.js
itself (sw.js's own bytes change on every run, so including it in the hash would make the
version drift forever).
"""
import hashlib
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SW_PATH = ROOT / "sw.js"

EXCLUDE_PREFIXES = ("tools/", "tests/", "docs/")
EXCLUDE_NAMES = {".gitignore", ".nojekyll", "README.md", "LICENSE"}


def list_files_git():
    try:
        out = subprocess.run(
            ["git", "ls-files"], cwd=ROOT, capture_output=True, text=True, check=True
        )
    except Exception as e:  # noqa: BLE001
        print(f"error: git ls-files failed: {e}", file=sys.stderr)
        sys.exit(1)
    return [line for line in out.stdout.splitlines() if line.strip()]


def list_files_fs():
    files = []
    for p in ROOT.rglob("*"):
        if not p.is_file():
            continue
        rel = p.relative_to(ROOT).as_posix()
        if rel.startswith(".git/"):
            continue
        files.append(rel)
    return files


def is_excluded(rel):
    if rel in EXCLUDE_NAMES:
        return True
    return any(rel.startswith(p) for p in EXCLUDE_PREFIXES)


def build_asset_list(files):
    return sorted(f for f in files if not is_excluded(f))


def compute_version(assets):
    h = hashlib.sha256()
    for rel in assets:
        if rel == "sw.js":
            continue  # exclude sw.js's own (about-to-change) bytes -> idempotent
        p = ROOT / rel
        try:
            data = p.read_bytes()
        except OSError:
            continue
        h.update(rel.encode("utf-8"))
        h.update(b"\0")
        h.update(data)
    return h.hexdigest()[:12]


def rewrite_sw(assets, version):
    text = SW_PATH.read_text(encoding="utf-8")
    text = re.sub(
        r'const VERSION = ".*?"; // build:version',
        f'const VERSION = "{version}"; // build:version',
        text,
        count=1,
    )
    assets_json = "[\n  " + ",\n  ".join(repr(a).replace("'", '"') for a in assets) + "\n]" if assets else "[]"
    text = re.sub(
        r"const ASSETS = \[[\s\S]*?\]; // build:assets",
        f"const ASSETS = {assets_json}; // build:assets",
        text,
        count=1,
    )
    SW_PATH.write_text(text, encoding="utf-8")


def main():
    from_fs = "--from-fs" in sys.argv
    files = list_files_fs() if from_fs else list_files_git()
    assets = build_asset_list(files)
    if "sw.js" not in assets and (ROOT / "sw.js").exists():
        assets.append("sw.js")
        assets.sort()
    version = compute_version(assets)
    rewrite_sw(assets, version)
    print(f"sw.js updated: version={version} assets={len(assets)} mode={'fs' if from_fs else 'git'}")


if __name__ == "__main__":
    main()
