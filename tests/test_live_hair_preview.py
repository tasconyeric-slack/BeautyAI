"""Live acceptance tooling must never delete user-selected directories or reuse old media."""
import importlib.util
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("live_hair_preview", ROOT / "scripts" / "live_hair_preview.py")
live = importlib.util.module_from_spec(spec)
spec.loader.exec_module(live)


@pytest.fixture
def repo(tmp_path, monkeypatch):
    root = tmp_path / "repo"
    root.mkdir()
    monkeypatch.setattr(live, "ROOT", root)
    return root


@pytest.mark.parametrize("location", ["root", "ancestor", "data", "other_run", "existing", "symlink"])
def test_output_rejection_preserves_existing_files(repo, location):
    base = repo / "runs" / "live-hair-preview"
    existing = base / "previous"
    existing.mkdir(parents=True)
    (existing / "keep.txt").write_text("previous acceptance evidence")
    unrelated = repo / "data"
    unrelated.mkdir()
    (unrelated / "keep.txt").write_text("authorized inputs")
    (base / "redirect").symlink_to(unrelated, target_is_directory=True)
    out = {"root": repo, "ancestor": repo.parent, "data": unrelated / "new",
           "other_run": repo / "runs" / "production", "existing": existing,
           "symlink": base / "redirect" / "new"}[location]

    with pytest.raises(ValueError):
        live.prepare_output(out)

    assert (existing / "keep.txt").read_text() == "previous acceptance evidence"
    assert (unrelated / "keep.txt").read_text() == "authorized inputs"
    assert not (unrelated / "new").exists()
    assert not (repo / "runs" / "production").exists()


def test_new_outputs_are_exclusive_and_defaults_are_unique(repo):
    explicit = repo / "runs" / "live-hair-preview" / "comparison"
    assert live.prepare_output(explicit) == explicit
    (explicit / "keep.txt").write_text("first run")
    with pytest.raises(ValueError):
        live.prepare_output(explicit)
    first, second = live.prepare_output(None), live.prepare_output(None)
    assert first != second
    assert first.parent == second.parent == explicit.parent
    assert first.is_dir() and second.is_dir()
    assert (explicit / "keep.txt").read_text() == "first run"


def test_cli_rejects_unsafe_output_before_provider_or_input_access(repo, monkeypatch):
    monkeypatch.setattr("sys.argv", ["live_hair_preview.py", "--out", str(repo)])
    with pytest.raises(SystemExit) as exc:
        live.main()
    assert exc.value.code == 2
