#!/usr/bin/env python3
"""Small, offline multi-view QC/measurement evaluation. See docs/validation/multiview.md.

No analysis providers, scoring, network downloads, demographic inference, or photo-derived console logs.
--synthetic supplies explicit canonical-mesh detector/segmenter fixtures; it never claims real-photo validation.
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import re
import sys
from collections import Counter, defaultdict
from contextlib import ExitStack
from itertools import combinations
from pathlib import Path
from typing import Any
from unittest.mock import patch

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from aesthetic_passport.cv import MODELS, CVUnavailable, Face
from aesthetic_passport.face_metrics import SideIn, load_registry, measure_all, measure_side
from aesthetic_passport.face_metrics.profile import side_points
from aesthetic_passport.imaging import UnreadableImage, open_rgb
from aesthetic_passport.qc import PhotoCheck, check_role

VIEWS = ("front", "left90", "right90", "45deg", "front_glasses")
SIDE_VIEWS = ("left90", "right90", "45deg")
FIELDS = {"person_id", "image_path", "view", "expected_camera_pose", "image_quality", "coverage", "cohort"}
METRIC_FIELDS = ("id", "key", "view", "unit", "value", "availability", "missing_reason", "confidence", "notes")


def load_manifest(path: Path) -> list[dict[str, Any]]:
    """Read JSONL or CSV. Paths are local and relative to the manifest, never downloaded."""
    with path.open(encoding="utf-8-sig", newline="") as stream:
        if path.suffix.lower() == ".csv":
            rows = list(csv.DictReader(stream))
        elif path.suffix.lower() == ".jsonl":
            rows = [json.loads(line) for line in stream if line.strip()]
        else:
            raise ValueError("Manifest must be JSONL or CSV")
    if not rows or len(rows) > 100:
        raise ValueError("Use a small manifest containing 1–100 images")
    for i, row in enumerate(rows, 1):
        if not isinstance(row, dict) or not set(row) <= FIELDS:
            raise ValueError(f"Row {i}: unsupported manifest fields")
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", str(row.get("person_id", ""))):
            raise ValueError(f"Row {i}: use an anonymized person_id without spaces")
        if row.get("view") not in VIEWS:
            raise ValueError(f"Row {i}: unsupported view")
        image = row.get("image_path")
        if not isinstance(image, str) or not image.strip() or "://" in image:
            raise ValueError(f"Row {i}: image_path must be a local path")
        row["image_path"] = str((path.parent / image).resolve())
        pose = row.get("expected_camera_pose") or {}
        if isinstance(pose, str):
            pose = json.loads(pose)
        if not isinstance(pose, dict) or not set(pose) <= {"yaw", "pitch", "roll"}:
            raise ValueError(f"Row {i}: expected_camera_pose must contain known yaw/pitch/roll degrees")
        for value in pose.values():
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
                raise ValueError(f"Row {i}: camera pose must be finite numeric degrees")
            if not -180 <= value <= 180:
                raise ValueError(f"Row {i}: camera pose outside degree range")
        row["expected_camera_pose"] = pose
        for key in ("image_quality", "coverage", "cohort"):
            value = row.get(key) or "unknown"
            if not isinstance(value, str) or len(value) > 80:
                raise ValueError(f"Row {i}: {key} must be a short supplied label")
            row[key] = value
    # Re-reading the same image is not repeat-photo evidence.
    if len({r["image_path"] for r in rows}) != len(rows):
        raise ValueError("Duplicate image paths are not independent repeat photos")
    return rows


def _empty_metrics(view: str, reason: str) -> list[dict[str, Any]]:
    target = "side" if view in SIDE_VIEWS else "front"
    return [{"id": m["id"], "key": m["key"], "view": target, "unit": m["unit"], "value": None,
             "availability": "not_measured", "missing_reason": reason, "confidence": None, "notes": []}
            for m in load_registry()["metrics"] if m["view"] == target]


def _evaluate(row: dict[str, Any], index: int) -> tuple[dict[str, Any], PhotoCheck | None, dict]:
    side = row["view"] in SIDE_VIEWS
    result = {k: row[k] for k in ("person_id", "view", "expected_camera_pose", "image_quality", "coverage", "cohort")}
    result.update(sample_id=f"s{index:04d}", qc_status="reject", issues=[], rejection_reasons=[],
                  observed_pose="rejected", measured_pose={}, pose_error_degrees={}, invalid_metrics=[],
                  metrics=_empty_metrics(row["view"], "qc_rejected"))
    check, points = None, {}
    try:
        rgb = np.asarray(open_rgb(Path(row["image_path"])))
        check = check_role(rgb, "profile90" if side else "front")
        result.update(qc_status=check.status, issues=check.issues, rejection_reasons=sorted(check.rejects),
                      measured_pose={"yaw": check.yaw, "pitch": check.pitch, "roll": check.roll},
                      face_h_px=check.extra.get("face_h_px"), face_box_px=check.face_box_px,
                      blur_score=check.blur_score, trace_reason=check.extra.get("reason"),
                      trace_detail=check.extra.get("reason_detail"),
                      nose_gap=check.extra.get("nose_gap"), facing=check.extra.get("facing"))
        result["pose_error_degrees"] = {
            k: round(result["measured_pose"][k] - v, 3) for k, v in row["expected_camera_pose"].items()
            if result["measured_pose"][k] is not None}
        if side:
            first = next((i for i in check.issues if i in check.rejects), None)
            reason = {"wrong_angle_for_role": "side_not_true_profile", "face_too_small": "resolution_too_low",
                      "profile_unclear": "landmarks_unclear"}.get(first, "side_photo_rejected")
            trace = check.extra.get("trace")
            metrics = measure_side(SideIn(shape=rgb.shape[:2], trace=trace if check.status != "reject" else None,
                                         reason=reason))
            if trace is not None:
                points = side_points(trace)
                result["nose_gap"] = trace.nose_gap
        elif check.status != "reject":
            profile, normalized, _ = measure_all(
                check.face, shape=rgb.shape[:2], yaw=check.yaw, pitch=check.pitch,
                seg=MODELS.segment(rgb), rgb=rgb,
                eyewear="user" if row["view"] == "front_glasses" else (
                    "detected" if "eyewear_detected" in check.issues else None))
            metrics = [m for m in profile["metrics"] if m["view"] == "front"]
            points = {k: np.array(v) * (rgb.shape[1], rgb.shape[0]) for k, v in normalized.items()}
        else:
            metrics = _empty_metrics(row["view"], "qc_rejected")
        specs = {m["id"]: m for m in load_registry()["metrics"]}
        for metric in metrics:
            # Registry gates already null invalid computations; count these without changing their honest reason.
            if metric["missing_reason"] == "out_of_range":
                result["invalid_metrics"].append(metric["id"])
            value = metric["value"]
            components = (metric.get("components") or {}).values()
            if metric["availability"] == "measured" and (
                value is None or not math.isfinite(value) or not specs[metric["id"]]["valid_range"][0]
                <= value <= specs[metric["id"]]["valid_range"][1] or any(not math.isfinite(v) for v in components)
            ):
                result["invalid_metrics"].append(metric["id"])
                metric.update(value=None, availability="not_measured", missing_reason="invalid_value", confidence=None)
        # Retain product overlay specs locally; CSV outputs below remain compact.
        result["metrics"] = [{k: m.get(k) for k in (*METRIC_FIELDS, "overlay")} for m in metrics]
        if check.status != "reject":
            result["observed_pose"] = f"profile_{check.extra['facing']}" if side else "front"
    except (UnreadableImage, OSError, CVUnavailable, ValueError, cv2.error) as exc:
        reason = ("cv_unavailable" if isinstance(exc, CVUnavailable) else
                  "unreadable_image" if isinstance(exc, (UnreadableImage, OSError)) else
                  f"evaluation_error_{type(exc).__name__}")
        result.update(qc_status="reject", observed_pose="rejected", issues=[reason], rejection_reasons=[reason],
                      metrics=_empty_metrics(row["view"], reason))
    return result, check, points


def summarize(rows: list[dict[str, Any]], *, synthetic: bool) -> dict[str, Any]:
    per_view, confusion = {}, defaultdict(Counter)
    reasons, issues, coverage = Counter(), Counter(), {}
    repeats = defaultdict(list)
    for row in rows:
        view = row["view"]
        counts = per_view.setdefault(view, {"total": 0, "accepted": 0, "rejected": 0, "warned": 0})
        counts["total"] += 1
        counts["rejected" if row["qc_status"] == "reject" else "accepted"] += 1
        counts["warned"] += row["qc_status"] == "warn"
        confusion[view][row["observed_pose"]] += 1
        reasons.update(row["rejection_reasons"])
        issues.update(row["issues"])
        for m in row["metrics"]:
            key = (view, m["id"])
            entry = coverage.setdefault(key, {"input_view": view, "id": m["id"], "view": m["view"],
                                             "unit": m["unit"], "eligible": 0, "measured": 0,
                                             "availability": Counter(), "missing_reasons": Counter()})
            entry["eligible"] += 1
            entry["measured"] += m["availability"] == "measured"
            entry["availability"][m["availability"]] += 1
            if m["missing_reason"]:
                entry["missing_reasons"][m["missing_reason"]] += 1
            if m["availability"] == "measured" and row["qc_status"] != "reject":
                repeats[(row["person_id"], view, m["id"], m["unit"])].append(m["value"])
    consistency = {}
    for (_person, view, mid, unit), values in repeats.items():
        if len(values) < 2:
            continue
        entry = consistency.setdefault((view, mid), {"view": view, "id": mid, "unit": unit,
                                                   "repeat_groups": 0, "pairs": 0, "differences": []})
        entry["repeat_groups"] += 1
        diffs = [abs(a - b) for a, b in combinations(values, 2)]
        entry["pairs"] += len(diffs)
        entry["differences"].extend(diffs)
    for entry in consistency.values():
        diffs = entry.pop("differences")
        entry.update(mean_abs_difference=float(np.mean(diffs)), max_abs_difference=max(diffs))
    return {
        "validation_status": "fixture_only_live_acceptance_blocked" if synthetic else "real_sample_requires_review",
        "images": len(rows), "people": len({r["person_id"] for r in rows}), "per_view": per_view,
        "rejection_reasons": dict(reasons), "issue_counts": dict(issues),
        "pose_confusion": {k: dict(v) for k, v in confusion.items()},
        "true_profile_false_accepts": sum(r["view"] == "45deg" and r["qc_status"] != "reject" for r in rows),
        "profile_direction_mismatches": sum(r["view"] in ("left90", "right90") and r["qc_status"] != "reject"
                                            and r["observed_pose"] != f"profile_{r['view'][:-2]}" for r in rows),
        "invalid_values": sum(len(r["invalid_metrics"]) for r in rows),
        "metric_coverage": list(coverage.values()), "repeat_consistency": list(consistency.values()),
        "supplied_cohorts": dict(Counter(r.get("cohort", "unknown") for r in rows)),
        "limitations": ["Camera pose and MediaPipe pose are not interchangeable, especially at 90 degrees.",
                        "Acceptance, identity pairing, adult status and cohort labels require dataset review.",
                        "Repeats compare only the same person, input view and metric; no 3D or mm ground truth."]}


def _overlay(path: Path, result: dict, check: PhotoCheck, points: dict) -> None:
    from aesthetic_passport.cv import SEG_FACE_SKIN

    canvas = cv2.cvtColor(check.rgb, cv2.COLOR_RGB2BGR)
    seg = check.extra.get("seg")
    if seg is not None:
        contours, _ = cv2.findContours((seg == SEG_FACE_SKIN).astype(np.uint8), cv2.RETR_EXTERNAL,
                                      cv2.CHAIN_APPROX_SIMPLE)
        cv2.drawContours(canvas, contours, -1, (200, 100, 200), 1)
    trace = check.extra.get("trace")
    if trace is not None:
        cv2.polylines(canvas, [np.round(trace.path).astype(np.int32)], False, (0, 220, 255), 2)
    if check.face is not None:
        tip = check.face.landmarks[1, :2]
        if np.isfinite(tip).all():
            cv2.circle(canvas, tuple(np.round(tip).astype(int)), 6, (255, 80, 30), 2)
    for m in result["metrics"]:
        for segment in (m.get("overlay") or {}).get("segments", []):
            a, b = points.get(segment["from"]), points.get(segment["to"])
            if a is not None and b is not None and np.isfinite([a, b]).all():
                cv2.line(canvas, tuple(np.round(a).astype(int)), tuple(np.round(b).astype(int)), (100, 180, 80), 1)
    for key, value in points.items():
        if key.startswith("p_") and key in {"p_pronasale", "p_nasion", "p_subnasale", "p_pogonion", "p_glabella"}:
            pos = tuple(np.round(value).astype(int))
            cv2.circle(canvas, pos, 3, (20, 30, 240), -1)
            cv2.putText(canvas, key[2:], pos, cv2.FONT_HERSHEY_SIMPLEX, 0.4, (10, 10, 10), 1)
    caption = f"{result['sample_id']} {result['view']} {result['qc_status']} {','.join(result['rejection_reasons'])}"
    cv2.putText(canvas, caption, (10, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 0), 2)
    cv2.putText(canvas, caption, (10, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1)
    path.parent.mkdir(parents=True, exist_ok=True)
    if not cv2.imwrite(str(path), canvas):
        raise OSError("Could not save local diagnostic overlay")


def _write_csv(path: Path, rows: list[dict], fields: list[str]) -> None:
    with path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            cells = {k: json.dumps(v, allow_nan=False) if isinstance(v, (list, dict)) else v for k, v in row.items()}
            # Dataset labels are untrusted spreadsheet cells.
            writer.writerow({k: "'" + v if isinstance(v, str) and v.startswith(("=", "+", "-", "@")) else v
                             for k, v in cells.items()})


def _synthetic_sample(out: Path) -> tuple[Path, list[tuple[list[Face], np.ndarray]]]:
    """Generate eight explicit CV-output fixtures, not photographs or demographic evidence."""
    from aesthetic_passport.cv import LEFT_BROW, LEFT_EYE, RIGHT_BROW, RIGHT_EYE, SEG_FACE_SKIN, SEG_OTHERS, hull_mask
    from aesthetic_passport.face_metrics.synthetic import synthetic_face, synthetic_profile, synthetic_seg

    fixtures, records = [], []
    fixture_dir = out / "synthetic_inputs"
    fixture_dir.mkdir(parents=True, exist_ok=True)
    face, shape = synthetic_face()
    face.matrix = np.eye(4)
    seg = synthetic_seg(face, shape, 150)
    noise = np.random.default_rng(12).normal(0, 18, (*shape, 1))
    rgb = np.clip(np.full((*shape, 3), 155) + noise, 0, 255).astype(np.uint8)

    def add(view: str, image: np.ndarray, mask: np.ndarray, faces: list[Face], person: str = "p01") -> None:
        filename = f"{len(records) + 1:04d}.png"
        Image.fromarray(image).save(fixture_dir / filename)
        records.append({"person_id": person, "image_path": f"synthetic_inputs/{filename}", "view": view,
                        "expected_camera_pose": {}, "image_quality": "synthetic_cv_fixture", "coverage": "controlled",
                        "cohort": "non_person"})
        fixtures.append((faces, mask))

    add("front", rgb, seg, [face])
    add("front", rgb.copy(), seg.copy(), [face])
    glasses_seg = seg.copy()
    band = hull_mask(shape, face.pts(LEFT_EYE + RIGHT_EYE + LEFT_BROW + RIGHT_BROW)) > 0
    glasses_seg[band] = SEG_OTHERS
    add("front_glasses", rgb.copy(), glasses_seg, [face])
    for facing in ("left", "right"):
        image, mask, _ = synthetic_profile(facing=facing)
        add(f"{facing}90", image, mask, [])
    image, mask, truth = synthetic_profile()
    landmarks = np.zeros((478, 3))
    landmarks[:, :2] = (300, 350)
    landmarks[1, :2] = np.array(truth["mesh_1"]) - (60, 0)
    a = math.radians(45)
    matrix = np.array([[math.cos(a), 0, math.sin(a), 0], [0, 1, 0, 0],
                       [-math.sin(a), 0, math.cos(a), 0], [0, 0, 0, 1]])
    add("45deg", image, mask, [Face(landmarks, matrix)])
    image, mask, _ = synthetic_profile(scale=6.5, facing="left")
    mask[10:20, 600:620] = SEG_FACE_SKIN
    add("left90", image, mask, [], "p02")
    add("front", np.full((300, 300, 3), 150, np.uint8), np.zeros((300, 300), np.uint8), [], "p02")
    manifest = out / "synthetic_manifest.jsonl"
    manifest.write_text("".join(json.dumps(r) + "\n" for r in records), encoding="utf-8")
    return manifest, fixtures


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--manifest", type=Path)
    source.add_argument("--synthetic", action="store_true", help="Explicit non-person CV fixtures; live acceptance blocked")
    parser.add_argument("--out", type=Path, default=ROOT / "runs/multiview")
    parser.add_argument("--max-overlays", type=int, choices=range(7), default=3, metavar="0..6")
    args = parser.parse_args(argv)
    args.out.mkdir(parents=True, exist_ok=True)
    fixtures = None
    if args.synthetic:
        args.manifest, fixtures = _synthetic_sample(args.out)
    try:
        rows = load_manifest(args.manifest)
    except (ValueError, OSError, TypeError):
        parser.exit(2, "Invalid/unreadable manifest; see docs/validation/multiview.md for the local format.\n")
    results, diagnostics = [], []
    for index, row in enumerate(rows, 1):
        with ExitStack() as stack:
            if fixtures is not None:
                faces, seg = fixtures[index - 1]
                stack.enter_context(patch.object(MODELS, "faces", return_value=faces))
                stack.enter_context(patch.object(MODELS, "segment", return_value=seg))
            result, check, points = _evaluate(row, index)
        results.append(result)
        if check is not None and args.max_overlays:
            # Bound retained image memory and prioritize the QC/contour failures over repeated fronts.
            rank = (0 if check.status == "reject" and "trace" in check.extra else
                    1 if "face_too_small" in check.rejects else 2 if row["view"] in SIDE_VIEWS else 3)
            diagnostics.append((rank, index, result, check, points))
            diagnostics.sort(key=lambda x: x[:2])
            diagnostics = diagnostics[:args.max_overlays]
    for _, _, result, check, points in diagnostics:
        _overlay(args.out / "overlays" / f"{result['sample_id']}.png", result, check, points)
    report = summarize(results, synthetic=args.synthetic)
    for filename, content in (("summary.json", report), ("results.json", results)):
        (args.out / filename).write_text(json.dumps(content, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    _write_csv(args.out / "images.csv", results, ["sample_id", "person_id", "view", "qc_status", "issues",
               "rejection_reasons", "observed_pose", "measured_pose", "expected_camera_pose", "pose_error_degrees",
               "image_quality", "coverage", "cohort", "face_h_px", "face_box_px", "blur_score", "nose_gap",
               "trace_reason", "trace_detail", "invalid_metrics"])
    _write_csv(args.out / "views.csv", [{"view": k, **v} for k, v in report["per_view"].items()],
               ["view", "total", "accepted", "rejected", "warned"])
    _write_csv(args.out / "metrics.csv", report["metric_coverage"],
               ["input_view", "id", "view", "unit", "eligible", "measured", "availability", "missing_reasons"])
    print("Evaluation saved locally (summary.json, results.json, images.csv, views.csv, metrics.csv).")
    if args.synthetic:
        print("Explicit fixtures only: real-photo acceptance remains blocked.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
