"""Labelled evaluation sets. Each keeps its OWN native label scale — scales are never mixed or rescaled here.

    mebeauty      MEBeauty `beauty_score` 1–10, published holdout split (train 1962 / validation 250 / test 250),
                  grouped so the same person never spans two splits (MEBeauty-Benchmark data.py). Gated on the
                  Hugging Face Hub (automatic approval) — needs accepted terms + `hf auth login` + network, or a local
                  snapshot directory passed as --source.
    scut-fbp5500  SCUT-FBP5500 1–5, official 5-fold split files (data/<k>/train_k.txt, test_k.txt in
                  HCIILAB/SCUT-FBP5500-Database-Release) or the 60/40 files from the dataset zip. Images come from the
                  dataset download (Google Drive / Baidu) — non-commercial research use only.
    csv           any local folder + CSV (columns: image, label, split ∈ {train,test}, optional group columns).

Group columns are labels the DATASET publishes (e.g. MEBeauty gender/ethnicity, SCUT AF/AM/CF/CM subsets); this
experiment never infers them from faces (product invariant 5).
"""
from __future__ import annotations

import csv
import os
import re
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

MEBEAUTY_REPO = "dr-irina-lebedeva/MEBeauty-Facial-Beauty-Prediction"


class DatasetUnavailable(RuntimeError):
    def __init__(self, message: str, prerequisite: str) -> None:
        super().__init__(message)
        self.prerequisite = prerequisite


@dataclass
class Item:
    id: str
    split: str
    label: float
    load: Callable[[], Any]          # → PIL image or path; called lazily, never cached to disk
    groups: dict[str, str] = field(default_factory=dict)


@dataclass
class EvalSet:
    name: str
    label_name: str
    label_range: tuple[float, float]
    train: list[Item]
    test: list[Item]
    source: str
    protocol: str
    native_scale: str                 # which model scale is native here ("mebeauty" | "scut" | "custom")
    notes: list[str] = field(default_factory=list)
    blocked: dict[str, str] = field(default_factory=dict)   # method → why evaluating it here would leak

    def check_disjoint(self) -> None:
        overlap = {i.id for i in self.train} & {i.id for i in self.test}
        if overlap:
            raise ValueError(f"{len(overlap)} image ids appear in both train and test — refusing (leakage)")

    def describe(self) -> dict[str, Any]:
        return {"name": self.name, "source": self.source, "label": self.label_name,
                "label_range": list(self.label_range), "protocol": self.protocol,
                "n_train": len(self.train), "n_test": len(self.test), "notes": self.notes}


# --- MEBeauty -----------------------------------------------------------------------------------------------------
def load_mebeauty(source: str | None = None, config: str = "fbp_extended", label: str = "beauty_score",
                  test_split: str = "test") -> EvalSet:
    try:
        from datasets import load_dataset
    except ImportError as e:
        raise DatasetUnavailable("the `datasets` package is not installed",
                                 "pip install -r experiments/aesthetics/requirements.txt") from e
    src = source or MEBEAUTY_REPO
    token = os.environ.get("HF_TOKEN")
    parts = {}
    try:
        for role, hub in (("train", "train"), ("test", test_split)):
            parts[role] = load_dataset(src, config, split=hub, token=token)
    except Exception as e:
        raise DatasetUnavailable(
            f"could not load {src} ({config}): {type(e).__name__}: {str(e)[:300]}",
            f"Accept the terms at https://huggingface.co/datasets/{MEBEAUTY_REPO} (automatic approval), run "
            "`hf auth login` (or set HF_TOKEN), and allow network access to huggingface.co — or pass --source with a "
            "local snapshot directory (`hf download --repo-type dataset ...`).") from e
    if label not in parts["test"].column_names:
        raise DatasetUnavailable(f"no column {label!r}; have {sorted(parts['test'].column_names)}",
                                 "Use label `beauty_score` (the current label version, not legacy plain_mean_score).")

    def items(ds: Any, role: str) -> list[Item]:
        ids = ds["image_id"] if "image_id" in ds.column_names else [f"{role}_{i}" for i in range(len(ds))]
        labels = ds[label]
        meta = {c: ds[c] for c in ("gender", "ethnicity") if c in ds.column_names}
        return [Item(id=str(ids[i]), split=role, label=float(labels[i]),
                     load=(lambda ds=ds, i=i: ds[int(i)]["image"]),
                     groups={c: str(v[i]) for c, v in meta.items()}) for i in range(len(ds))]

    blocked = {} if test_split == "test" else {
        "mebeauty_dinov2": f"leakage: the published weights were trained / early-stopped on `{test_split}`"}
    return EvalSet(
        name="mebeauty", label_name=label, blocked=blocked, label_range=(1.0, 10.0), train=items(parts["train"], "train"),
        test=items(parts["test"], "test"), source=f"{src} [{config}]",
        protocol=f"published holdout: train → {test_split} (validation unused; identity-grouped by the publisher)",
        native_scale="mebeauty",
        notes=[("The published dinov2-partial weights were trained on this holdout's train split and early-stopped on "
                "its validation split, so only `test` is a fair evaluation split for them.")])


# --- SCUT-FBP5500 -------------------------------------------------------------------------------------------------
_SCUT_LEGACY = re.compile(r"^(?P<sex>[fm])t(?P<grp>[wy])(?P<n>\d+)(?P<ext>\.\w+)$", re.IGNORECASE)


def scut_canonical(name: str) -> str:
    """The release repo's split files use legacy names (`fty12.jpg` = AF12, `mtw3.jpg` = CM3); the image zip uses
    AF/AM/CF/CM. Map legacy → canonical; canonical names pass through."""
    m = _SCUT_LEGACY.match(name)
    if not m:
        return name
    race = "A" if m["grp"].lower() == "y" else "C"
    return f"{race}{m['sex'].upper()}{m['n']}{m['ext']}"


def scut_subset(name: str) -> str | None:
    m = re.match(r"^(AF|AM|CF|CM)\d", scut_canonical(name))
    return m.group(1) if m else None


def _read_split(path: Path) -> list[tuple[str, float]]:
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            name, score = line.split()[:2]
            rows.append((name, float(score)))
    return rows


def load_scut(images_dir: str | Path, *, splits_dir: str | Path | None = None, fold: int = 1,
              train_file: str | Path | None = None, test_file: str | Path | None = None) -> EvalSet:
    images = Path(images_dir)
    if not images.is_dir():
        raise DatasetUnavailable(
            f"SCUT-FBP5500 image folder not found: {images}",
            "Download SCUT-FBP5500 (https://github.com/HCIILAB/SCUT-FBP5500-Database-Release → Google Drive / Baidu "
            "link), unzip outside git (e.g. data/scut-fbp5500/), pass --images-dir <…>/Images.")
    if train_file and test_file:
        tr, te, protocol = Path(train_file), Path(test_file), f"split files {Path(train_file).name} / {Path(test_file).name}"
    elif splits_dir:
        d = Path(splits_dir)
        tr, te = d / str(fold) / f"train_{fold}.txt", d / str(fold) / f"test_{fold}.txt"
        protocol = f"official 5-fold cross-validation, fold {fold} (4400 train / 1100 test)"
    else:
        raise DatasetUnavailable("no split files given",
                                 "Pass --splits-dir <SCUT-FBP5500-Database-Release>/data --fold 1..5, or "
                                 "--train-file/--test-file (e.g. the 60/40 split from the dataset zip).")
    for p in (tr, te):
        if not p.is_file():
            raise DatasetUnavailable(f"split file not found: {p}", "Clone HCIILAB/SCUT-FBP5500-Database-Release.")
    present = {p.name for p in images.iterdir()}

    def items(rows: list[tuple[str, float]], role: str) -> tuple[list[Item], int]:
        out, missing = [], 0
        for name, score in rows:
            for cand in (name, scut_canonical(name)):
                if cand in present:
                    sub = scut_subset(cand)
                    out.append(Item(id=cand, split=role, label=score, load=(lambda p=images / cand: p),
                                    groups={"subset": sub} if sub else {}))
                    break
            else:
                missing += 1
        return out, missing

    train, miss_tr = items(_read_split(tr), "train")
    test, miss_te = items(_read_split(te), "test")
    notes = ["Subsets AF/AM/CF/CM are SCUT's own published file-name labels.",
             "SCUT publishes no identity grouping; folds are used exactly as released."]
    if miss_tr or miss_te:
        notes.append(f"{miss_tr} train / {miss_te} test split entries had no matching image file and were skipped.")
    if not test:
        raise DatasetUnavailable(f"none of the {miss_te} test images were found in {images}",
                                 "Point --images-dir at the folder that contains AF1.jpg … CM750.jpg.")
    return EvalSet(name="scut-fbp5500", label_name="beauty score (mean of 60 raters)", label_range=(1.0, 5.0),
                   train=train, test=test, source=str(images.name), protocol=protocol, native_scale="scut",
                   notes=notes)


# --- generic CSV --------------------------------------------------------------------------------------------------
def load_csv(csv_path: str | Path, images_dir: str | Path | None, label_range: tuple[float, float],
             name: str = "csv") -> EvalSet:
    p = Path(csv_path)
    if not p.is_file():
        raise DatasetUnavailable(f"CSV not found: {p}", "Pass --csv with columns image,label,split[,group…].")
    base = Path(images_dir) if images_dir else p.parent
    with p.open(encoding="utf-8", newline="") as fh:
        rows = list(csv.DictReader(fh))
    if not rows or not {"image", "label", "split"} <= set(rows[0]):
        raise DatasetUnavailable(f"{p.name}: needs columns image,label,split", "Fix the CSV header.")
    sets: dict[str, list[Item]] = {"train": [], "test": []}
    for r in rows:
        role = r["split"].strip().lower()
        if role not in sets:
            continue
        groups = {k: v for k, v in r.items() if k not in ("image", "label", "split") and v}
        sets[role].append(Item(id=r["image"], split=role, label=float(r["label"]),
                               load=(lambda q=base / r["image"]: q), groups=groups))
    if not sets["test"]:
        raise DatasetUnavailable(f"{p.name}: no rows with split=test", "Mark evaluation rows split=test.")
    return EvalSet(name=name, label_name="label", label_range=label_range, train=sets["train"], test=sets["test"],
                   source=p.name, protocol="CSV-declared train/test", native_scale="custom")
