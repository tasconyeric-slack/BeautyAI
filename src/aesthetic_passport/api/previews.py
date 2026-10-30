"""AI preview jobs (B1): targets share a process-wide budget, each retried once, then `fallback`.

- The free preview (the "safe" hair direction, config/pricing.yaml free_previews) starts automatically after the
  passport job. More targets: POST /api/passport/{id}/previews {kind, target_ids} — free quota first, then the paid
  cap once the passport is unlocked.
- Statuses: pending → succeeded | fallback (the model or the quality gate failed twice: the UI shows the style
  illustration) | failed (no usable photo) | skipped (previews disabled). The page never breaks.
- passport.previews[] mirrors the job rows (schema v0.3) so the JSON alone tells what exists.
"""
from __future__ import annotations

import json
import logging
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

from ..assemble import preview_entry
from ..preview import (
    PreviewError,
    PreviewTrace,
    QualityGateFailed,
    hair_source,
    is_previewable,
    load_edit_prompt,
    preview_targets,
    provider_for_attempt,
    read_crop_box,
    render_target,
)
from ..providers.base import load_models_config
from ..providers.image import ImageEditError, image_from_config, resolve_image_provider
from ..qc import load_qc_config
from .entitlement import pricing
from .retention import media_dir, media_expired
from .settings import Settings
from .store import Store

log = logging.getLogger("aesthetic_passport.previews")
DIAG_KEYS = ("stage", "http_status", "code", "request_id", "elapsed_ms", "category", "retryable")


def ensure_stdout_logging() -> None:
    """Uvicorn configures only its own loggers; give ours a stdout handler so Render's log view shows them."""
    root = logging.getLogger("aesthetic_passport")
    if not root.handlers:
        h = logging.StreamHandler(sys.stdout)
        h.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
        root.addHandler(h)
        root.setLevel(logging.INFO)


def edit_diagnostics(exc: BaseException) -> dict[str, Any] | None:
    """The ImageEditError behind `exc` (walking __cause__ / __context__), as safe-to-log fields."""
    seen: set[int] = set()
    cur: BaseException | None = exc
    while cur is not None and id(cur) not in seen:
        seen.add(id(cur))
        if isinstance(cur, ImageEditError):
            d = cur.diagnostics()
            root = cur.__cause__
            d["exception"] = type(root).__name__ if root is not None else None
            return d
        cur = cur.__cause__ or cur.__context__
    return None


def _log_edit_failure(pid: str, kind: str, target: str, attempt: int, exc: BaseException) -> dict[str, Any]:
    """One stdout line per failed image-edit attempt (Render logs). No keys, prompts, images or bodies."""
    d = edit_diagnostics(exc) or {"stage": "pipeline", "category": type(exc).__name__,
                                  "exception": type(exc).__name__}
    fields = " ".join(f"{k}={d.get(k)}" for k in (*DIAG_KEYS, "exception"))
    log.warning("image_edit_failed passport=%s target=%s:%s attempt=%d %s",
                pid, kind, target, attempt, fields)
    return d
ACTIVE = ("pending", "succeeded")
AI_LABEL = "AI 试看"
FREE_TARGETS = {("hair", "safe")}
# Configuration is read once per process, just like the CV model instances. A per-batch executor alone does not
# limit separate HTTP requests (or separate passports), which can otherwise multiply peak memory usage.
_PREVIEW_SLOTS = threading.BoundedSemaphore(load_qc_config()["preview_masks"]["concurrency"])


def image_provider_name() -> str:
    try:
        return resolve_image_provider()
    except Exception:  # noqa: BLE001 — health must not fail on config problems
        return "unknown"


def public_previews(store: Store, pid: str, media_expired: bool, runs_dir: Path | None = None) -> list[dict[str, Any]]:
    out = []
    for p in store.previews(pid):
        url = before = box = None
        if p["status"] == "succeeded" and p["after_name"] and not media_expired:
            url = f"/api/media/{pid}/{p['after_name']}"
            before = url.replace("/preview_", "/before_")
            if runs_dir is not None:
                box = read_crop_box(media_dir(runs_dir, pid) / p["after_name"])
        out.append({"target_id": p["target_id"], "kind": p["kind"], "status": p["status"],
                    "image_model": p["image_model"], "after_url": url, "before_url": before, "error": p["error"],
                    "ai_label": AI_LABEL, "crop_box": box})
    return out


def free_used(store: Store, pid: str) -> int:
    return sum(1 for p in store.previews(pid) if not p["paid"] and p["status"] in ACTIVE)


class PreviewRequestError(Exception):
    def __init__(self, status: int, code: str, detail: str):
        super().__init__(detail)
        self.status, self.code, self.detail = status, code, detail


def request_previews(settings: Settings, store: Store, job: dict[str, Any], kind: str,
                     target_ids: list[str]) -> tuple[list[dict[str, Any]], list[tuple[str, str]]]:
    """Validate and register targets. Returns (states, targets to start). Free quota first, then the paid cap."""
    pid, passport = job["id"], job["passport"]
    if kind not in preview_targets(passport):
        raise PreviewRequestError(422, "bad_kind", "不支持的试看类型")
    bad = [t for t in target_ids if not is_previewable(passport, kind, t)]   # incl. Look Studio combos (D30)
    if bad:
        raise PreviewRequestError(422, "not_previewable", f"这些方向不能生成试看：{', '.join(bad)}")
    if any(not (media_dir(settings.runs_dir, pid) / f"{hair_source(t)}.jpg").is_file()
           for t in target_ids if kind == "hair" and hair_source(t) != "front"):
        raise PreviewRequestError(410, "source_unavailable", "所选参考照片已过期或不可用，请切换照片来源")
    existing = {(p["kind"], p["target_id"]): p for p in store.previews(pid)}
    paid = bool(job.get("paid"))
    free_left = max(0, pricing()["free_previews"] - free_used(store, pid))
    paid_used = sum(1 for p in existing.values() if p["paid"] and p["status"] in ACTIVE)
    states, start = [], []
    disabled = resolve_image_provider() == "none"
    for t in dict.fromkeys(target_ids):
        cur = existing.get((kind, t))
        if cur and cur["status"] in ("pending", "succeeded"):     # a fallback may be retried on request (Look Studio)
            states.append({"target_id": t, "kind": kind, "status": cur["status"]})
            continue
        if (kind, t) in FREE_TARGETS and free_left > 0:
            use_paid = False
            free_left -= 1
        elif paid and paid_used < settings.preview_cap:
            use_paid = True
            paid_used += 1
        elif not paid:
            raise PreviewRequestError(402, "payment_required", "这个方向的试看包含在完整护照中")
        else:
            raise PreviewRequestError(429, "preview_cap", f"每份护照最多生成 {settings.preview_cap} 张试看")
        if disabled:
            store.upsert_preview(pid, kind, t, "skipped", paid=use_paid, error="试看功能未启用")
            states.append({"target_id": t, "kind": kind, "status": "skipped"})
            continue
        store.upsert_preview(pid, kind, t, "pending", paid=use_paid, error=None, attempts=0)
        states.append({"target_id": t, "kind": kind, "status": "pending"})
        start.append((kind, t))
    _sync_passport(settings, store, pid)
    return states, start


def _sync_passport(settings: Settings, store: Store, pid: str) -> None:
    """passport.previews[] ← preview_jobs rows."""
    job = store.get(pid)
    if not job or not job["passport"]:
        return
    passport = job["passport"]
    entries = []
    for p in store.previews(pid):
        e = preview_entry(p["target_id"], p["kind"], status=p["status"], image_model=p["image_model"],
                          after_ref=p["after_name"] if p["status"] == "succeeded" else None, prompt=p["prompt_used"])
        e["rec_id"] = p["target_id"] if p["target_id"].startswith("r") else None
        entries.append(e)
    known = {(e["kind"], e["target_id"]) for e in entries}
    entries += [e for e in passport.get("previews", []) if (e["kind"], e["target_id"]) not in known
                and e["status"] == "pending" and not job["media_deleted"]]
    # Schema cap (12): keep the active ones first (failed rows are history).
    entries.sort(key=lambda e: e["status"] not in ACTIVE)
    passport["previews"] = entries[:12]
    store.update_passport(pid, passport)
    run_dir = settings.runs_dir / pid
    if run_dir.exists():
        (run_dir / "passport.json").write_text(json.dumps(passport, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _log_call(settings: Settings, pid: str, kind: str, target: str, attempt: int, ok: bool, model: str | None,
              latency_ms: int | None, cost: float | None, error: str | None,
              diag: dict[str, Any] | None = None, trace: PreviewTrace | None = None) -> None:
    rec = {"kind": "image_edit", "target": f"{kind}:{target}", "attempt": attempt, "ok": ok, "model": model,
           "latency_ms": latency_ms, "cost_usd_est": cost, "error": error, "diag": diag,
           "prompt_version": load_models_config()["production"]["image_edit"].get("prompt_version") or
           load_edit_prompt().version}
    if trace is not None:
        rec.update(trace=trace.stages, latency_ms=trace.elapsed_ms, provider_latency_ms=trace.provider_latency_ms,
                   model=trace.model, cost_usd_est=trace.cost_usd_est)
    run_dir = settings.runs_dir / pid
    run_dir.mkdir(parents=True, exist_ok=True)
    with (run_dir / "calls.jsonl").open("a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")


def run_preview_job(settings: Settings, store: Store, pid: str, kind: str, target: str) -> str:
    """Wait for the shared memory budget before reading the job, photo or expiry."""
    with _PREVIEW_SLOTS:
        return _run_preview_job(settings, store, pid, kind, target)


def _run_preview_job(settings: Settings, store: Store, pid: str, kind: str, target: str) -> str:
    """One target with the quality gate: up to max_attempts tries, then `fallback`. Returns the final status."""
    job = store.get(pid)
    if not job or not job["passport"] or job["status"] == "deleted":
        return "failed"
    source = hair_source(target) if kind == "hair" else "front"
    front = media_dir(settings.runs_dir, pid) / f"{source}.jpg"
    if media_expired(job) or not front.exists():
        store.upsert_preview(pid, kind, target, "failed", error="照片已按隐私规则删除")
        return "failed"
    try:
        provider = image_from_config()
    except ImageEditError as e:
        diag = _log_edit_failure(pid, kind, target, -1, e)
        _log_call(settings, pid, kind, target, -1, False, None, None, None, type(e).__name__, diag)
        store.upsert_preview(pid, kind, target, "fallback", error="试看服务暂不可用，先看款式插画")
        return "fallback"
    if provider is None:
        store.upsert_preview(pid, kind, target, "skipped", error="试看功能未启用")
        return "skipped"
    attempts = load_qc_config()["preview_masks"]["max_attempts"]
    last_error = "试看生成失败"
    for attempt in range(attempts):
        trace = PreviewTrace()
        try:
            res = render_target(front, job["passport"], kind, target, provider=provider_for_attempt(provider, attempt),
                                out_dir=media_dir(settings.runs_dir, pid),
                                debug_dir=(settings.runs_dir / pid / "debug") if settings.preview_debug else None,
                                trace=trace)
        except QualityGateFailed as e:       # too little change, or a displaced/duplicated face (Issue #56)
            last_error = e.detail
            _log_call(settings, pid, kind, target, attempt, False, None, None, None, type(e).__name__, trace=trace)
            continue
        except PreviewError as e:
            if "图像模型" not in e.detail:      # no face / not previewable: retrying will not help
                store.upsert_preview(pid, kind, target, "failed", error=e.detail, attempts=attempt + 1)
                _log_call(settings, pid, kind, target, attempt, False, None, None, None, type(e).__name__, trace=trace)
                return "failed"
            last_error = e.detail
            diag = _log_edit_failure(pid, kind, target, attempt, e)
            _log_call(settings, pid, kind, target, attempt, False, None, None, None, type(e).__name__, diag, trace)
            if diag.get("retryable") is False:      # e.g. model / endpoint not found: a second call fails the same way
                store.upsert_preview(pid, kind, target, "fallback", error="试看服务暂不可用，先看款式插画",
                                     attempts=attempt + 1)
                return "fallback"
            continue
        except Exception as e:  # noqa: BLE001 — end a crashed job; never log a traceback containing private inputs
            _log_edit_failure(pid, kind, target, attempt, e)  # no raw traceback: it can contain provider inputs
            last_error = "试看生成失败"
            _log_call(settings, pid, kind, target, attempt, False, None, None, None, type(e).__name__,
                      edit_diagnostics(e), trace)
            continue
        store.upsert_preview(pid, kind, target, "succeeded", image_model=res.image_model, prompt_used=res.prompt,
                             after_name=res.after_path.name, attempts=attempt + 1)
        _log_call(settings, pid, kind, target, attempt, True, res.image_model, res.latency_ms, res.cost_usd_est, None,
                  trace=trace)
        return "succeeded"
    store.upsert_preview(pid, kind, target, "fallback", error=last_error, attempts=attempts)
    return "fallback"


def run_preview_batch(settings: Settings, store: Store, pid: str, targets: list[tuple[str, str]]) -> None:
    if not targets:
        return
    workers = min(len(targets), load_qc_config()["preview_masks"]["concurrency"])
    if workers <= 1 or settings.run_jobs_inline:
        for kind, t in targets:
            run_preview_job(settings, store, pid, kind, t)
    else:
        with ThreadPoolExecutor(max_workers=workers) as pool:
            list(pool.map(lambda kt: run_preview_job(settings, store, pid, *kt), targets))
    _sync_passport(settings, store, pid)


def start_free_preview(settings: Settings, store: Store, pid: str) -> None:
    """After a successful passport job: the free "safe" hair preview (if that direction is allowed)."""
    if pricing()["free_previews"] <= 0:      # D33: no automatic preview when previews are paid only
        return
    job = store.get(pid)
    if not job or not job["passport"]:
        return
    if "safe" not in preview_targets(job["passport"]).get("hair", []):
        return
    try:
        _states, start = request_previews(settings, store, job, "hair", ["safe"])
    except PreviewRequestError:
        return
    run_preview_batch(settings, store, pid, start)
