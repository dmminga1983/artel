#!/usr/bin/env python3
"""Packages each Artel skill as a ZIP for uploading to the Claude app (claude.ai).

Usage:  python3 tools/package_skills.py [skill-name ...]
Output: dist/<skill-name>.zip  (each archive contains a <skill-name>/ folder with SKILL.md)

Standard library only. Claude Code users do not need this: install the plugin instead.
Note: ${CLAUDE_PLUGIN_ROOT} paths inside skills only work in Claude Code; in the app,
skills that mention the bundled scanner fall back to the manual git commands they describe.
"""
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKILLS_DIRS = sorted((ROOT / "plugins").glob("*/skills"))
DIST = ROOT / "dist"


def package(skill_dir: Path) -> Path:
    if not (skill_dir / "SKILL.md").is_file():
        raise SystemExit(f"{skill_dir.name}: SKILL.md not found")
    DIST.mkdir(exist_ok=True)
    out = DIST / f"{skill_dir.name}.zip"
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(skill_dir.rglob("*")):
            if path.is_file() and not path.name.startswith("."):
                zf.write(path, Path(skill_dir.name) / path.relative_to(skill_dir))
    return out


def main() -> None:
    found = {d.name: d for sd in SKILLS_DIRS for d in sd.iterdir() if d.is_dir()}
    names = sys.argv[1:] or sorted(found)
    for name in names:
        if name not in found:
            raise SystemExit(f"{name}: skill not found")
        out = package(found[name])
        print(f"packaged {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
