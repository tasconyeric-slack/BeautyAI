"""Batch evaluation contract; model outputs are explicit non-person fixtures."""
import csv
import importlib.util
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture
def evaluator():
    path = ROOT / "scripts/eval_multiview_faces.py"
    assert path.exists(), "Issue #12 batch evaluator is missing"
    spec = importlib.util.spec_from_file_location("eval_multiview_faces", path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


@pytest.mark.parametrize("extension", ["csv", "jsonl"])
def test_manifest_preserves_known_pose_and_relative_photo_path(evaluator, tmp_path, extension):
    path = tmp_path / f"manifest.{extension}"
    row = {"person_id": "p01", "image_path": "photos/left.png", "view": "left90",
           "expected_camera_pose": {"yaw": -90}, "image_quality": "good", "coverage": "full_face"}
    if extension == "jsonl":
        path.write_text(json.dumps(row) + "\n")
    else:
        with path.open("w", newline="") as out:
            writer = csv.DictWriter(out, fieldnames=list(row))
            writer.writeheader()
            writer.writerow({**row, "expected_camera_pose": json.dumps(row["expected_camera_pose"])})
    loaded = evaluator.load_manifest(path)
    assert loaded[0]["expected_camera_pose"] == {"yaw": -90}
    assert loaded[0]["image_path"] == str(tmp_path / "photos/left.png")


@pytest.mark.parametrize("change", [{"view": "profile"}, {"person_id": "Full Name"},
                                    {"expected_camera_pose": {"yaw": float("nan")}},
                                    {"image_path": "https://example.org/face.jpg"}])
def test_manifest_rejects_bad_boundary_values(evaluator, tmp_path, change):
    path = tmp_path / "manifest.jsonl"
    path.write_text(json.dumps({"person_id": "p01", "image_path": "front.png", "view": "front", **change}))
    with pytest.raises(ValueError):
        evaluator.load_manifest(path)


def test_synthetic_cli_exercises_qc_metrics_repeats_and_diagnostics(evaluator, tmp_path, capsys):
    assert evaluator.main(["--synthetic", "--out", str(tmp_path), "--max-overlays", "3"]) == 0
    report = json.loads((tmp_path / "summary.json").read_text())
    assert report["validation_status"] == "fixture_only_live_acceptance_blocked"
    assert report["images"] == 8
    assert report["per_view"]["front"]["accepted"] == 2
    assert report["per_view"]["left90"]["rejected"] == 1
    assert report["rejection_reasons"]["wrong_angle_for_role"] == 1
    assert report["rejection_reasons"]["face_too_small"] == 1
    assert report["pose_confusion"]["45deg"]["rejected"] == 1
    assert report["pose_confusion"]["left90"]["profile_left"] == 1
    assert report["pose_confusion"]["right90"]["profile_right"] == 1
    assert report["true_profile_false_accepts"] == 0
    assert report["invalid_values"] == 0
    assert any(m["view"] == "side" and m["measured"] > 0 for m in report["metric_coverage"])
    assert any(r["view"] == "front" and r["pairs"] == 1 and r["max_abs_difference"] == 0
               for r in report["repeat_consistency"])
    results = json.loads((tmp_path / "results.json").read_text())
    tiny = next(r for r in results if r["sample_id"] == "s0007")
    assert tiny["qc_status"] == "reject" and all(m["value"] is None for m in tiny["metrics"])
    glasses = next(r for r in results if r["view"] == "front_glasses")
    assert any(m["notes"] == ["eyewear"] and m["confidence"] == "low" for m in glasses["metrics"])
    assert len(list((tmp_path / "overlays").glob("*.png"))) == 3
    for name in ["images.csv", "metrics.csv", "views.csv"]:
        with (tmp_path / name).open() as stream:
            assert list(csv.DictReader(stream))
    # Console output is operational only; measurements and identifiers stay in local artifacts.
    console = capsys.readouterr().out
    assert "p01" not in console and "yaw" not in console


def test_unreadable_image_is_a_named_rejection_and_not_a_batch_abort(evaluator, tmp_path):
    manifest = tmp_path / "input.jsonl"
    manifest.write_text(json.dumps({"person_id": "p01", "view": "front", "image_path": "missing.jpg"}))
    out = tmp_path / "out"
    assert evaluator.main(["--manifest", str(manifest), "--out", str(out), "--max-overlays", "0"]) == 0
    report = json.loads((out / "summary.json").read_text())
    assert report["rejection_reasons"] == {"unreadable_image": 1}
    assert report["per_view"]["front"]["rejected"] == 1
    assert all(m["measured"] == 0 for m in report["metric_coverage"])


def test_summary_exposes_false_profile_accepts_and_invalid_numbers(evaluator):
    rows = [{"sample_id": "s0001", "person_id": "p01", "view": "45deg", "qc_status": "ok",
             "observed_pose": "profile_right", "rejection_reasons": [], "issues": [],
             "invalid_metrics": ["M001"], "metrics": [
                 {"id": "M001", "view": "side", "unit": "ratio", "value": None,
                  "availability": "not_measured", "missing_reason": "invalid_value"}]}]
    report = evaluator.summarize(rows, synthetic=False)
    assert report["true_profile_false_accepts"] == 1
    assert report["invalid_values"] == 1
    assert report["pose_confusion"]["45deg"]["profile_right"] == 1


def test_batch_counts_invalid_computations_already_rejected_by_registry(evaluator, tmp_path, monkeypatch):
    from aesthetic_passport.face_metrics.compute import COMPUTE

    spec = next(m for m in evaluator.load_registry()["metrics"] if m["id"] == "M001")
    monkeypatch.setitem(COMPUTE, spec["compute"], lambda *_: (float("nan"), None))
    assert evaluator.main(["--synthetic", "--out", str(tmp_path), "--max-overlays", "0"]) == 0
    results = json.loads((tmp_path / "results.json").read_text())
    metric = next(m for m in results[0]["metrics"] if m["id"] == "M001")
    assert metric["value"] is None and metric["missing_reason"] == "out_of_range"
    assert "M001" in results[0]["invalid_metrics"]
    summary = json.loads((tmp_path / "summary.json").read_text())
    assert summary["invalid_values"] >= 3
