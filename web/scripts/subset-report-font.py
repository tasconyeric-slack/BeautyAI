"""Build the PDF report font (Issue #33, Phase 2): Noto Sans SC (SIL OFL 1.1) subset to the characters a report can use.

The PDF is generated in the browser, so the font is downloaded on the first export. The full font is ~10 MB per
weight; this keeps GB 2312 (6,763 hanzi + its symbols, ~99.9% of modern simplified text), Latin, CJK and general
punctuation, plus every character in the repo's own copy, fixtures and configs — the model writes in that vocabulary.
@react-pdf (fontkit) subsets again per document, so the PDF itself only carries the glyphs it prints.

Source: the static TTF instances Google Fonts serves for Noto Sans SC (fonts.google.com/noto/specimen/Noto+Sans+SC).

    pip install fonttools
    python web/scripts/subset-report-font.py NotoSansSC-Regular.ttf NotoSansSC-Bold.ttf
"""

from __future__ import annotations

import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "web" / "public" / "fonts" / "report"
TEXT_GLOBS = [
    "web/lib/**/*.ts",
    "web/lib/**/*.json",
    "web/components/**/*.ts",
    "web/components/**/*.tsx",
    "web/app/**/*.tsx",
    "config/*.yaml",
    "config/*.json",
    "examples/*.json",
    "prompts/*.md",
    "src/aesthetic_passport/**/*.py",
]
RANGES = [
    (0x20, 0x7E),  # ASCII
    (0xA0, 0xFF),  # Latin-1 (°, ±, ×, ·)
    (0x2000, 0x206F),  # general punctuation (– — ‘ ’ “ ” … ‰)
    (0x2190, 0x21FF),  # arrows
    (0x2200, 0x22FF),  # math operators (≈ ≤ ≥)
    (0x2460, 0x24FF),  # enclosed numerals
    (0x25A0, 0x25FF),  # geometric shapes
    (0x2600, 0x27BF),  # symbols, dingbats (✓)
    (0x3000, 0x303F),  # CJK punctuation
    (0xFF00, 0xFFEF),  # full-width forms
]


def gb2312() -> set[str]:
    chars: set[str] = set()
    for hi in range(0xA1, 0xF8):
        for lo in range(0xA1, 0xFF):
            try:
                chars.add(bytes([hi, lo]).decode("gb2312"))
            except UnicodeDecodeError:
                pass
    return chars


def repo_chars() -> set[str]:
    chars: set[str] = set()
    for pattern in TEXT_GLOBS:
        for path in ROOT.glob(pattern):
            if "node_modules" in path.parts:
                continue
            chars.update(path.read_text(encoding="utf-8", errors="ignore"))
    return {c for c in chars if ord(c) >= 0x80}


def build(src: Path, name: str, chars: set[str]) -> Path:
    font = TTFont(src)
    cmap = font.getBestCmap()
    unicodes = sorted(ord(c) for c in chars if ord(c) in cmap)
    opts = subset.Options()
    opts.layout_features = ["*"]
    opts.name_IDs = ["*"]  # keep copyright / licence names
    opts.notdef_outline = True
    opts.hinting = False
    opts.desubroutinize = True
    s = subset.Subsetter(opts)
    s.populate(unicodes=unicodes)
    s.subset(font)
    out = OUT / name
    font.save(out)
    return out


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    chars = gb2312() | repo_chars()
    for a, b in RANGES:
        chars.update(chr(c) for c in range(a, b + 1))
    OUT.mkdir(parents=True, exist_ok=True)
    for src, name in zip(sys.argv[1:], ["NotoSansSC-Regular.ttf", "NotoSansSC-Bold.ttf"], strict=True):
        out = build(Path(src), name, chars)
        print(f"{out.relative_to(ROOT)}: {out.stat().st_size / 1e6:.2f} MB")


if __name__ == "__main__":
    main()
