"""Background jobs: run the two-stage pipeline for one passport (partial snapshots as they arrive), enforce photo
retention, then start the free preview. Re-analysis (enrich with a new photo) reuses the kept front photo."""
from __future__ import annotations

import json
import logging
import shutil
from pathlib import Path
from typing import Any

from ..imaging import open_rgb, save_jpeg, thumbnail
from ..pipeline import PipelineError, run_pipeline
from ..providers import ProviderError
from .entitlement import pricing
from .portrait_sources import keep_glasses_reference
from .previews import start_free_preview
from .rerank import rerank_passport
from .retention import media_dir
from .settings import Settings
from .store import Store

log = logging.getLogger("aesthetic_passport.jobs")


def uploads_dir(runs_dir: Path, pid: str) -> Path:
    return runs_dir / pid / "uploads"


# Measurement photos shown on the face workbench: kept with the front photo until the media TTL (24 h, D35).
KEPT_ROLES = ("profile90", "noglasses", "smile")


def _run(settings: Settings, store: Store, pid: str, user_context: dict, photos: dict[str, Path],
         photo_meta: dict[str, Any] | None = None) -> bool:
    try:
        passport = run_pipeline(photos, user_context, run_dir=settings.runs_dir / pid, passport_id=pid,
                                on_stage=lambda s: store.set_stage(pid, s),
                                on_partial=lambda k, v: store.set_partial(pid, k, v) if k != "analysis" else None,
                                media_dir=media_dir(settings.runs_dir, pid), photo_meta=photo_meta)
        if pricing()["free_previews"] <= 0:
            # D33: no automatic preview, so no placeholder entry either (a "pending" one would never resolve).
            passport["previews"] = []
        keep_glasses_reference(uploads_dir(settings.runs_dir, pid), media_dir(settings.runs_dir, pid), store, pid)
        store.finish(pid, passport)
        return True
    except PipelineError as e:
        store.fail(pid, e.code, e.detail, e.payload)
    except ProviderError:
        log.exception("provider error for %s", pid)  # message never contains photo data
        store.fail(pid, "provider_error", "分析服务暂时不可用，请稍后重试")
    except Exception:
        log.exception("job %s crashed", pid)
        store.fail(pid, "internal_error", "生成过程中出现意外错误，请稍后重试")
    return False


def _keep_measurement_photos(up: Path, mdir: Path, passport: dict[str, Any] | None) -> None:
    """Keep a measurement photo only when the workbench actually measured on it (else it is deleted with the rest)."""
    views = ((passport or {}).get("measurement_profile") or {}).get("views") or []
    used = {v["role"] for v in views if v.get("status") == "measured"}
    for role in KEPT_ROLES:
        src = up / f"{role}.jpg"
        if role in used and src.exists():
            shutil.move(str(src), mdir / f"{role}.jpg")


def run_passport_job(settings: Settings, store: Store, pid: str, user_context: dict,
                     photo_meta: dict[str, Any] | None = None) -> None:
    up = uploads_dir(settings.runs_dir, pid)
    photos = {p.stem: p for p in up.glob("*.jpg")}
    ok = False
    try:
        ok = _run(settings, store, pid, user_context, photos, photo_meta)
    finally:
        # Retention: on success the front photo (+ thumbnail) and the measurement photos the workbench uses
        # (profile90 / noglasses / smile, D35) are kept until the TTL. Everything else — and everything on
        # failure — is deleted now.
        front = up / "front.jpg"
        mdir = media_dir(settings.runs_dir, pid)
        if ok and front.exists():
            mdir.mkdir(parents=True, exist_ok=True)
            save_jpeg(thumbnail(open_rgb(front)), mdir / "thumb.jpg", quality=85)
            shutil.move(str(front), mdir / "front.jpg")
            _keep_measurement_photos(up, mdir, (store.get(pid) or {}).get("passport"))
        elif not ok:
            shutil.rmtree(mdir, ignore_errors=True)
        shutil.rmtree(up, ignore_errors=True)
    if ok:
        # The profile is already visible; the free preview arrives asynchronously and never blocks it.
        start_free_preview(settings, store, pid)


def run_reanalysis_job(settings: Settings, store: Store, pid: str, user_context: dict[str, Any],
                       preference_events: list[dict[str, Any]], photo_meta: dict[str, Any] | None = None) -> None:
    """Enrich with a new photo (or a model-relevant context change): run the pipeline again on the kept front photo
    plus the new uploads; the previous passport stays visible until the new one validates."""
    job = store.get(pid)
    if not job or not job["passport"]:
        return
    previous = job["passport"]
    up = uploads_dir(settings.runs_dir, pid)
    front = media_dir(settings.runs_dir, pid) / "front.jpg"
    mdir = media_dir(settings.runs_dir, pid)
    photos = {p.stem: p for p in up.glob("*.jpg")}
    # measurement photos supplied earlier stay in use until they expire with the front photo
    for role in KEPT_ROLES:
        if role not in photos and (mdir / f"{role}.jpg").exists():
            photos[role] = mdir / f"{role}.jpg"
    photos["front"] = front
    try:
        passport = run_pipeline(photos, user_context, run_dir=settings.runs_dir / pid, passport_id=pid,
                                on_stage=lambda s: store.set_stage(pid, s), media_dir=mdir, photo_meta=photo_meta)
        if preference_events:
            passport = rerank_passport(passport, user_context, preference_events, context_changed=False)
        passport["previews"] = previous.get("previews", [])
        passport["meta"]["quick"] = passport["meta"].get("quick") or previous["meta"].get("quick")
        keep_glasses_reference(up, mdir, store, pid)
        store.finish(pid, passport)
        _keep_measurement_photos(up, mdir, passport)
        (settings.runs_dir / pid / "passport.json").write_text(json.dumps(passport, ensure_ascii=False, indent=2) + "\n",
                                                               encoding="utf-8")
    except Exception:
        log.exception("re-analysis %s failed", pid)
        store.finish(pid, previous)
    finally:
        shutil.rmtree(up, ignore_errors=True)
