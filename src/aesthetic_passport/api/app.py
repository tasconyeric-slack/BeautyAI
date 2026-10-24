"""FastAPI app, API v0.3 (PRD E3). Run: `uvicorn --factory aesthetic_passport.api.app:create_app`.

    POST   /api/qc                          one photo + role → photo QC (live check on the upload page)
    POST   /api/passport                    front photo (+ optional others) + context → {id}; pipeline in background
    GET    /api/passport/{id}               response shell (schema/api.schema.json): status, partial, passport,
                                            entitlement, media
    POST   /api/passport/{id}/enrich        context patch and/or a new photo → rerank, or re-analysis when the
                                            model's input changes (new photo, presentation)
    POST   /api/passport/{id}/feedback      one preference event (idempotent with client_event_id); ?rerank=1
    POST   /api/passport/{id}/rerank        rules only: user_context patch + all events → new derived version
    POST   /api/passport/{id}/previews      {kind, target_ids} → AI previews (3 at a time; free quota, then paid)
    GET    /api/passport/{id}/geometry      polygons for the browser drape / lip / blush (404 after the photo TTL)
    POST   /api/passport/{id}/share         → read-only share token;  GET /api/share/{token} → view without photos
    DELETE /api/passport/{id}               erase photos, previews, geometry, feedback, JSON → {deleted_at}
    POST   /api/events                      whitelisted funnel events (name, hashed id, topic, ref, time)
    POST   /api/checkout                    single purchase (PAYMENT_PROVIDER=fake settles at once) or invite code
    POST   /api/payments/webhook            provider notification, idempotent
    GET    /api/media/{id}/{name}           front / thumb / preview / before images until the TTL
    GET    /api/health                      which providers are live (the UI shows a demo banner for fakes)
"""
from __future__ import annotations

import asyncio
import contextlib
import hashlib
import json
import re
import secrets
import uuid
from datetime import timedelta
from pathlib import Path
from typing import Annotated, Any

from fastapi import BackgroundTasks, Body, FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from jsonschema import Draft202012Validator

from ..assemble import complete_user_context
from ..cv import CVUnavailable
from ..feedback import REACTIONS, TARGET_TYPES
from ..imaging import UnreadableImage, open_rgb, save_jpeg
from ..payments import PaymentError, payment_from_env
from ..pipeline import MEASURE_ROLES, PHOTO_ROLES, REQUIRED_ROLES, qc_mode
from ..providers import load_models_config, resolve_provider_name
from ..runtime import is_production
from ..schema_io import SCHEMA_DIR
from . import previews as preview_jobs
from . import qc_service
from .entitlement import entitlement, free_view, pricing
from .hair_masks import install_hair_masks
from .jobs import run_passport_job, run_reanalysis_job, uploads_dir
from .portrait_sources import STUDIO_ROLES
from .ratelimit import SlidingWindow, hash_ip
from .rerank import merge_context, needs_model, rerank_passport
from .retention import erase_passport, media_dir, media_expired, purge_expired_media, purge_expired_passports
from .settings import Settings
from .store import Store, now

MEDIA_NAME = re.compile(
    r"^(front|thumb|profile90|noglasses|smile|glasses|(preview|before)_(hair|glasses|neckline)_((safe|bold|easy|current)(_hc[0-9])?(_src(glasses|noglasses))?|r[0-9]{1,2}))\.jpg$")
PASSPORT_ID = re.compile(r"^ap_[0-9a-f]{12}$")
TARGET_ID = re.compile(r"^[a-z0-9_]{1,48}$")
SHARE_TOKEN = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
EVENT_NAMES = ("landing_view", "upload_start", "qc_fail", "quick_ready", "profile_view", "feedback",
               "share_card_export", "score_teaser_click", "paywall_view", "checkout_start", "paid")
TOPICS = ("face", "hair", "style", "color", "outfit")


def _user_context_validator() -> Draft202012Validator:
    schema = json.loads((SCHEMA_DIR / "passport.schema.json").read_text(encoding="utf-8"))
    return Draft202012Validator(schema["properties"]["user_context"])


def api_error(status: int, code: str, detail: str, **extra: Any) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "detail": detail, **extra})


def hash_pid(pid: str | None) -> str | None:
    return hashlib.sha256(f"pid:{pid}".encode()).hexdigest()[:16] if pid else None


def api_status(job: dict[str, Any]) -> str:
    if job["status"] == "deleted":
        return "deleted"
    if job["status"] == "done":
        return "full_ready"
    if job["status"] == "failed":
        return "qc_failed" if (job["error"] or {}).get("code") == "qc_failed" else "analysis_failed"
    return "quick_ready" if job["quick"] else "scanning"


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    preview_jobs.ensure_stdout_logging()
    store = Store(settings.db_path)
    ctx_validator = _user_context_validator()
    qc_limiter = SlidingWindow(settings.ip_qc_per_minute, 60)
    preview_limiter = SlidingWindow(30, 3600)
    feedback_limiter = SlidingWindow(240, 3600)

    @contextlib.asynccontextmanager
    async def lifespan(_app: FastAPI):
        async def hourly() -> None:
            while True:
                await asyncio.to_thread(purge_expired_media, store, settings.runs_dir)
                await asyncio.to_thread(purge_expired_passports, store, settings.runs_dir)
                await asyncio.sleep(3600)

        task = asyncio.create_task(hourly())  # runs once at startup, then hourly
        try:
            yield
        finally:
            task.cancel()

    app = FastAPI(title="Aesthetic Passport API", version="0.3", lifespan=lifespan)
    app.state.settings, app.state.store = settings, store
    install_hair_masks(app, settings, store)
    app.add_middleware(CORSMiddleware, allow_origins=settings.web_origins,
                       allow_methods=["GET", "POST", "DELETE"], allow_headers=["*"])

    def client_ip(request: Request) -> str | None:
        fwd = request.headers.get("x-forwarded-for")
        return fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else None)

    def run(background: BackgroundTasks, fn: Any, *args: Any) -> None:
        if settings.run_jobs_inline:
            fn(*args)
        else:
            background.add_task(fn, *args)

    async def read_upload(f: UploadFile) -> bytes:
        limit = settings.max_upload_mb * 1024 * 1024
        data = await f.read(limit + 1)
        if len(data) > limit:
            raise api_error(413, "file_too_large", f"单张照片不能超过 {settings.max_upload_mb} MB")
        return data

    def job_or_404(pid: str, *, allow_deleted: bool = False) -> dict[str, Any]:
        job = store.get(pid) if PASSPORT_ID.match(pid) else None
        if not job:
            raise api_error(404, "not_found", "找不到这份护照")
        if job["status"] == "deleted" and not allow_deleted:
            raise api_error(410, "deleted", "这份护照已被删除", deleted_at=job["deleted_at"])
        return job

    def ready_job(pid: str) -> dict[str, Any]:
        job = job_or_404(pid)
        if job["status"] != "done" or not job["passport"]:
            raise api_error(409, "not_ready", "护照尚未生成完成")
        return job

    def shell(job: dict[str, Any]) -> dict[str, Any]:
        """The schema/api.schema.json response; paid content is trimmed for a free entitlement (D27)."""
        pid = job["id"]
        expired = media_expired(job)
        mdir = media_dir(settings.runs_dir, pid)
        ent = entitlement(job, preview_jobs.free_used(store, pid))
        passport = job["passport"]
        if passport is not None and not ent["paid"]:
            passport, ent["locked"] = free_view(passport)
        partial_anchors = job["anchors"] or {}
        analysis_state = "ready" if passport else ("failed" if job["status"] == "failed" else "pending")
        return {
            "id": pid,
            "status": api_status(job),
            "stage": job["stage"],
            "partial": {
                "input_quality": partial_anchors.get("input_quality") or (job["error"] or {}).get("payload", {}).get("input_quality"),
                "anchors": partial_anchors.get("anchors"),
                "quick": job["quick"],
                "analysis": analysis_state,
                "previews": preview_jobs.public_previews(store, pid, expired, settings.runs_dir),
            },
            "passport": passport,
            "entitlement": ent,
            "media": {
                "front": None if expired or not (mdir / "front.jpg").exists() else f"/api/media/{pid}/front.jpg",
                "thumb": None if expired or not (mdir / "thumb.jpg").exists() else f"/api/media/{pid}/thumb.jpg",
                "photos": {r: (None if expired or not (mdir / f"{r}.jpg").exists() else f"/api/media/{pid}/{r}.jpg")
                           for r in (*MEASURE_ROLES, "glasses")},
                "expires_at": job["media_expires_at"],
                "expired": expired,
            },
            "error": {k: v for k, v in job["error"].items() if k in ("code", "detail")} if job["error"] else None,
            "created_at": job["created_at"],
        }

    # --- health ------------------------------------------------------------------------
    @app.get("/api/health")
    def health() -> dict[str, Any]:
        cfg = load_models_config()
        try:
            pay = payment_from_env().name
        except PaymentError:
            pay = "unavailable"
        analysis = resolve_provider_name(cfg["production"]["analysis"]["provider"], cfg)
        image = preview_jobs.image_provider_name()
        return {
            "ok": True,
            "environment": "production" if is_production() else "development",
            "analysis_provider": analysis,
            "image_edit_provider": image,
            "payment_provider": pay,
            "qc_mode": qc_mode(),
            # True when any answer would come from a mock: the web app shows a demo banner.
            "demo": "fake" in (analysis, image, pay) or qc_mode() == "stub",
            "invite_required": bool(settings.invite_codes),
            "price_cny": pricing()["full_passport_price"],
        }

    # --- QC ------------------------------------------------------------------------------
    @app.post("/api/qc")
    async def qc(request: Request, role: Annotated[str, Form()], file: Annotated[UploadFile, File()]) -> dict:
        if role not in (*PHOTO_ROLES, "glasses"):
            raise api_error(422, "bad_role", f"unknown photo role {role!r}")
        if not qc_limiter.allow(hash_ip(client_ip(request))):
            raise api_error(429, "rate_limited", "检查太频繁，请稍后再试")
        data = await read_upload(file)
        try:
            im = await asyncio.to_thread(open_rgb, data)
        except UnreadableImage as e:
            raise api_error(422, "unreadable_image", str(e)) from e
        try:
            result = await asyncio.to_thread(qc_service.check_one, im, role)
            return {**result, "photo_id": role}
        except CVUnavailable as e:
            raise api_error(503, "cv_unavailable", "照片检测服务暂时不可用，请稍后重试") from e

    # --- passports -------------------------------------------------------------------------
    def parse_context(raw: str) -> dict[str, Any]:
        try:
            ctx = json.loads(raw)
            uc = ctx.get("user_context", ctx)
            if not isinstance(uc, dict):
                raise TypeError
        except (json.JSONDecodeError, AttributeError, TypeError) as e:
            raise api_error(422, "bad_context", "context must be a JSON object") from e
        if "presentation" not in uc:
            raise api_error(422, "bad_context", "presentation is required")
        user_context = complete_user_context(uc)
        errs = [e.message for e in ctx_validator.iter_errors(user_context)]
        if errs:
            raise api_error(422, "bad_context", "; ".join(errs[:5]))
        return user_context

    def parse_photo_meta(raw: str | None) -> dict[str, Any]:
        """Per-role capture info from the upload page: {role: {eyewear?: bool, capture?: {crop, rotate_deg, ...}}}.
        Provenance only; unknown keys are dropped."""
        if not raw:
            return {}
        try:
            data = json.loads(raw)
        except json.JSONDecodeError as e:
            raise api_error(422, "bad_photo_meta", "photo_meta must be JSON") from e
        out: dict[str, Any] = {}
        if not isinstance(data, dict):
            return out
        for role, v in data.items():
            if role not in (*PHOTO_ROLES, "glasses") or not isinstance(v, dict):
                continue
            item: dict[str, Any] = {}
            if isinstance(v.get("eyewear"), bool):
                item["eyewear"] = v["eyewear"]
            cap = v.get("capture")
            if isinstance(cap, dict):
                c: dict[str, Any] = {}
                crop = cap.get("crop")
                if isinstance(crop, list) and len(crop) == 4 and all(isinstance(x, int | float) for x in crop):
                    c["crop"] = [round(float(x), 1) for x in crop]
                for k in ("rotate_deg",):
                    if isinstance(cap.get(k), int | float):
                        c[k] = round(float(cap[k]), 2)
                for k in ("source_w", "source_h", "output_w", "output_h"):
                    if isinstance(cap.get(k), int) and 0 < cap[k] < 20000:
                        c[k] = cap[k]
                if isinstance(cap.get("edited"), bool):
                    c["edited"] = cap["edited"]
                item["capture"] = c
            out[role] = item
        return out

    @app.post("/api/passport", status_code=202)
    async def create_passport(
        request: Request,
        background: BackgroundTasks,
        context: Annotated[str, Form()],
        consent: Annotated[bool, Form()],
        front: Annotated[UploadFile | None, File()] = None,
        profile90: Annotated[UploadFile | None, File()] = None,
        noglasses: Annotated[UploadFile | None, File()] = None,
        glasses: Annotated[UploadFile | None, File()] = None,
        profile45: Annotated[UploadFile | None, File()] = None,
        smile: Annotated[UploadFile | None, File()] = None,
        hair: Annotated[UploadFile | None, File()] = None,
        invite_code: Annotated[str | None, Form()] = None,
        photo_meta: Annotated[str | None, Form()] = None,
    ) -> dict[str, str]:
        if not consent:
            raise api_error(422, "consent_required", "需要先同意照片处理说明")
        if settings.invite_codes and (invite_code or "").strip() not in settings.invite_codes:
            raise api_error(403, "invite_required", "邀请码无效")
        user_context = parse_context(context)

        ip_hash = hash_ip(client_ip(request))
        t = now()
        if settings.daily_passport_limit and store.count_since(t - timedelta(days=1)) >= settings.daily_passport_limit:
            raise api_error(429, "daily_limit", "今日名额已满，请明天再来")
        if ip_hash and settings.ip_passports_per_hour and \
                store.count_since(t - timedelta(hours=1), ip_hash) >= settings.ip_passports_per_hour:
            raise api_error(429, "rate_limited", "提交太频繁，请一小时后再试")

        pid = f"ap_{uuid.uuid4().hex[:12]}"
        up = uploads_dir(settings.runs_dir, pid)
        meta = parse_photo_meta(photo_meta)
        files = {"front": front, "profile90": profile90, "noglasses": noglasses, "glasses": glasses, "profile45": profile45, "smile": smile,
                 "hair": hair}
        for role, f in files.items():
            if f is None or not f.filename:
                continue
            try:
                im = await asyncio.to_thread(open_rgb, await read_upload(f))
            except UnreadableImage as e:
                raise api_error(422, "unreadable_image", f"[{role}] {e}") from e
            await asyncio.to_thread(save_jpeg, im, up / f"{role}.jpg")
        if any(not (up / f"{r}.jpg").exists() for r in REQUIRED_ROLES):
            raise api_error(422, "missing_photos", "请上传一张正脸照片")

        store.create(pid, ip_hash, settings.media_ttl_hours, settings.passport_ttl_days)
        store.add_event("upload_start", hash_pid(pid), user_context.get("topic"), user_context.get("ref"))
        run(background, run_passport_job, settings, store, pid, user_context, meta)
        return {"id": pid}

    @app.get("/api/passport/{pid}")
    def get_passport(pid: str) -> dict[str, Any]:
        return shell(job_or_404(pid))

    @app.post("/api/passport/{pid}/enrich")
    async def enrich(
        pid: str,
        background: BackgroundTasks,
        context: Annotated[str | None, Form()] = None,
        profile90: Annotated[UploadFile | None, File()] = None,
        noglasses: Annotated[UploadFile | None, File()] = None,
        glasses: Annotated[UploadFile | None, File()] = None,
        profile45: Annotated[UploadFile | None, File()] = None,
        smile: Annotated[UploadFile | None, File()] = None,
        hair: Annotated[UploadFile | None, File()] = None,
        photo_meta: Annotated[str | None, Form()] = None,
    ) -> dict[str, Any]:
        job = ready_job(pid)
        passport = job["passport"]
        try:
            patch = json.loads(context) if context else {}
            patch = patch.get("user_context", patch)
            if not isinstance(patch, dict):
                raise TypeError
        except (json.JSONDecodeError, AttributeError, TypeError) as e:
            raise api_error(422, "bad_context", "context must be a JSON object") from e
        new_ctx = merge_context(passport["user_context"], patch)
        errs = [e.message for e in ctx_validator.iter_errors(new_ctx)]
        if errs:
            raise api_error(422, "bad_context", "; ".join(errs[:5]))
        uploads = {r: f for r, f in {"profile90": profile90, "noglasses": noglasses, "glasses": glasses, "profile45": profile45,
                                     "smile": smile, "hair": hair}.items() if f and f.filename}
        meta = parse_photo_meta(photo_meta)
        for role in ("glasses", "noglasses"):
            if role in uploads and any(
                p["target_id"].endswith(f"_src{role}") and p["status"] in ("pending", "succeeded")
                for p in store.previews(pid)
            ):
                raise api_error(409, "source_in_use", "这张来源已有发型试看；替换照片请重新开始，避免错用旧图")
        if uploads or needs_model(passport["user_context"], new_ctx):
            front = media_dir(settings.runs_dir, pid) / "front.jpg"
            if media_expired(job) or not front.exists():
                raise api_error(410, "media_expired", "正脸照片已按隐私规则删除，无法重新分析；其余调整仍可使用")
            up = uploads_dir(settings.runs_dir, pid)
            for role, f in uploads.items():
                try:
                    im = await asyncio.to_thread(open_rgb, await read_upload(f))
                except UnreadableImage as e:
                    raise api_error(422, "unreadable_image", f"[{role}] {e}") from e
                await asyncio.to_thread(save_jpeg, im, up / f"{role}.jpg")
            store.set_stage(pid, "analysis")
            run(background, run_reanalysis_job, settings, store, pid, new_ctx, store.preference_events(pid), meta)
            return {"mode": "reanalyze", **shell(store.get(pid))}
        updated = rerank_passport(passport, new_ctx, store.preference_events(pid), context_changed=bool(patch))
        store.update_passport(pid, updated)
        return {"mode": "rerank", **shell(store.get(pid))}

    @app.post("/api/passport/{pid}/feedback")
    def feedback(pid: str, request: Request, body: Annotated[dict[str, Any], Body()],
                 rerank: Annotated[bool, Query()] = False) -> dict[str, Any]:
        job = ready_job(pid)
        if not feedback_limiter.allow(hash_ip(client_ip(request))):
            raise api_error(429, "rate_limited", "操作太频繁，请稍后再试")
        tt, tid, reaction = body.get("target_type"), body.get("target_id"), body.get("reaction")
        tags = body.get("reason_tags") or []
        if tt not in TARGET_TYPES or reaction not in REACTIONS or not isinstance(tid, str) or not TARGET_ID.match(tid):
            raise api_error(422, "bad_feedback", "target_type / target_id / reaction 不合法")
        if not isinstance(tags, list) or len(tags) > 6 or not all(isinstance(t, str) and len(t) <= 20 for t in tags):
            raise api_error(422, "bad_feedback", "reason_tags 不合法")
        ts = now().isoformat(timespec="milliseconds")
        cid = body.get("client_event_id")
        key = str(cid)[:64] if cid else hashlib.sha256(f"{tt}|{tid}|{reaction}|{tags}|{ts}".encode()).hexdigest()[:32]
        created = store.add_preference_event(pid, key, {"target_type": tt, "target_id": tid, "reaction": reaction,
                                                        "reason_tags": tags, "ts": ts})
        if created:
            store.add_event("feedback", hash_pid(pid), job["passport"]["user_context"].get("topic"), None)
        out: dict[str, Any] = {"ok": True, "duplicate": not created, "event_count": len(store.preference_events(pid))}
        if rerank:
            p = job["passport"]
            store.update_passport(pid, rerank_passport(p, p["user_context"], store.preference_events(pid),
                                                       context_changed=False))
            out.update(shell(store.get(pid)))
        return out

    @app.post("/api/passport/{pid}/rerank")
    def do_rerank(pid: str, body: Annotated[dict[str, Any] | None, Body()] = None) -> dict[str, Any]:
        job = ready_job(pid)
        passport = job["passport"]
        patch = (body or {}).get("user_context") or {}
        if not isinstance(patch, dict):
            raise api_error(422, "bad_context", "user_context must be an object")
        new_ctx = merge_context(passport["user_context"], patch)
        errs = [e.message for e in ctx_validator.iter_errors(new_ctx)]
        if errs:
            raise api_error(422, "bad_context", "; ".join(errs[:5]))
        if needs_model(passport["user_context"], new_ctx):
            raise api_error(409, "needs_reanalysis", "表达方向的变化需要重新分析，请使用补充信息页")
        updated = rerank_passport(passport, new_ctx, store.preference_events(pid), context_changed=bool(patch))
        store.update_passport(pid, updated)
        return shell(store.get(pid))

    @app.post("/api/passport/{pid}/previews", status_code=202)
    def previews(pid: str, request: Request, background: BackgroundTasks,
                 body: Annotated[dict[str, Any], Body()]) -> dict[str, Any]:
        job = ready_job(pid)
        if media_expired(job):
            raise api_error(410, "media_expired", "照片已按隐私规则删除，无法再生成试看")
        kind, targets = body.get("kind", "hair"), body.get("target_ids") or []
        if not isinstance(targets, list) or not targets or len(targets) > 6 or \
                not all(isinstance(t, str) and TARGET_ID.match(t) for t in targets):
            raise api_error(422, "bad_targets", "target_ids 不合法")
        if not preview_limiter.allow(hash_ip(client_ip(request))):
            raise api_error(429, "rate_limited", "生成太频繁，请稍后再试")
        try:
            states, start = preview_jobs.request_previews(settings, store, job, kind, targets)
        except preview_jobs.PreviewRequestError as e:
            raise api_error(e.status, e.code, e.detail) from e
        if start:
            run(background, preview_jobs.run_preview_batch, settings, store, pid, start)
        return {"previews": states}

    @app.get("/api/passport/{pid}/geometry")
    def geometry(pid: str, source: str = "front") -> JSONResponse:
        job = job_or_404(pid)
        if source not in STUDIO_ROLES:
            raise api_error(422, "bad_source", "照片来源不可用")
        if source != "front":
            # Daily eyewear is a styling reference only; never borrow the front's polygons.
            if source == "glasses" or media_expired(job):
                raise api_error(404, "no_geometry", "这张参考照不提供几何叠加")
            photo = media_dir(settings.runs_dir, pid) / f"{source}.jpg"
            if not photo.is_file():
                raise api_error(404, "no_geometry", "照片已删除或未测量")
            from ..anchors import export_geometry
            from ..qc import check_role
            try:
                checked = check_role(open_rgb(photo), source)
                if checked.status == "reject" or checked.face is None or any(
                    i in checked.issues for i in ("eyewear_detected", "pose_off_axis")
                ):
                    raise ValueError("incompatible geometry")
                result = export_geometry(checked.face, checked.rgb.shape[:2])
            except Exception as e:
                raise api_error(404, "no_geometry", "这张照片无法可靠定位五官，已停用叠加") from e
            if media_expired(job_or_404(pid)) or not photo.is_file():
                raise api_error(404, "no_geometry", "照片已删除")
            return JSONResponse(result, headers={"Cache-Control": "no-store"})
        path = media_dir(settings.runs_dir, pid) / "geometry.json"
        if media_expired(job) or not path.exists():
            raise api_error(404, "no_geometry", "照片已删除或未测量，无法在照片上试色")
        return JSONResponse(json.loads(path.read_text(encoding="utf-8")), headers={"Cache-Control": "private, max-age=600"})

    # --- share / delete ---------------------------------------------------------------------------
    @app.post("/api/passport/{pid}/share")
    def share(pid: str) -> dict[str, Any]:
        job = ready_job(pid)
        token = job["share_token"] or secrets.token_urlsafe(12)
        if not job["share_token"]:
            store.set_share_token(pid, token)
        return {"share_token": token, "url": f"{settings.share_base_url}/s/{token}"}

    @app.get("/api/share/{token}")
    def shared(token: str) -> dict[str, Any]:
        job = store.by_share_token(token) if SHARE_TOKEN.match(token) else None
        if not job or not job["passport"] or job["status"] == "deleted":
            raise api_error(404, "not_found", "分享链接已失效")
        view, _locked = free_view(job["passport"])
        view["previews"] = []                      # read-only view never carries photos
        view["user_context"] = {**view["user_context"], "ref": None}
        return {"passport": view, "created_at": job["created_at"]}

    @app.delete("/api/passport/{pid}")
    def delete(pid: str) -> dict[str, Any]:
        job = job_or_404(pid, allow_deleted=True)
        if job["status"] == "deleted":
            return {"deleted_at": job["deleted_at"], "already_deleted": True}
        return {"deleted_at": erase_passport(store, settings.runs_dir, pid), "already_deleted": False}

    # --- events / payments -----------------------------------------------------------------------
    @app.post("/api/events", status_code=204)
    def events(body: Annotated[dict[str, Any], Body()]) -> None:
        name = body.get("name")
        if name not in EVENT_NAMES:
            raise api_error(422, "bad_event", "unknown event")
        topic = body.get("topic") if body.get("topic") in TOPICS else None
        ref = body.get("ref") if isinstance(body.get("ref"), str) and re.match(r"^[A-Za-z0-9_.-]{1,64}$", body["ref"]) else None
        pid = body.get("passport_id")
        store.add_event(name, hash_pid(pid) if isinstance(pid, str) and PASSPORT_ID.match(pid) else None, topic, ref)

    @app.post("/api/checkout")
    def checkout(body: Annotated[dict[str, Any], Body()]) -> dict[str, Any]:
        pid = body.get("passport_id") or ""
        job = ready_job(pid)
        if job["paid"]:
            return {"payment": {"status": "paid", "order_id": None, "pay_url": None}, **shell(job)}
        code = (body.get("invite_code") or "").strip()
        if code:
            if not pricing().get("invite_unlock") or code not in settings.invite_unlock_codes:
                raise api_error(403, "bad_invite", "邀请码无效")
            store.set_paid(pid)
            store.add_event("paid", hash_pid(pid), None, "invite")
            return {"payment": {"status": "paid", "order_id": None, "pay_url": None}, **shell(store.get(pid))}
        try:
            provider = payment_from_env()
        except PaymentError as e:
            raise api_error(503, "payment_unavailable", "支付暂未开放，可以使用邀请码解锁") from e
        amount = float(pricing()["full_passport_price"])
        co = provider.create_checkout(pid, amount)
        store.create_payment(co.order_id, pid, provider.name, amount)
        store.add_event("checkout_start", hash_pid(pid), None, None)
        if co.settled:
            store.mark_payment_paid(co.order_id)
            store.add_event("paid", hash_pid(pid), None, None)
            return {"payment": {"status": "paid", "order_id": co.order_id, "pay_url": None}, **shell(store.get(pid))}
        return {"payment": {"status": "pending", "order_id": co.order_id, "pay_url": co.pay_url}, **shell(job)}

    @app.post("/api/payments/webhook")
    def webhook(request: Request, body: Annotated[dict[str, Any], Body()]) -> dict[str, Any]:
        try:
            order_id, status = payment_from_env().verify_webhook(body, dict(request.headers))
        except PaymentError as e:
            raise api_error(400, "bad_webhook", "invalid notification") from e
        if status != "paid":
            return {"ok": True, "changed": False}
        pid, changed = store.mark_payment_paid(order_id)
        if pid is None:
            raise api_error(404, "unknown_order", "unknown order")
        if changed:
            store.add_event("paid", hash_pid(pid), None, None)
        return {"ok": True, "changed": changed}

    # --- media -----------------------------------------------------------------------------------
    @app.get("/api/media/{pid}/{name}")
    def media(pid: str, name: str) -> FileResponse:
        job = job_or_404(pid)
        if not MEDIA_NAME.match(name):
            raise api_error(404, "not_found", "not found")
        path: Path = media_dir(settings.runs_dir, pid) / name
        if media_expired(job) or not path.exists():
            raise api_error(410, "media_expired", "照片已按隐私规则删除")
        return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": "private, max-age=3600"})

    @app.exception_handler(HTTPException)
    async def http_error(_request: Request, exc: HTTPException) -> JSONResponse:
        body = exc.detail if isinstance(exc.detail, dict) else {"code": "error", "detail": str(exc.detail)}
        return JSONResponse(status_code=exc.status_code, content={"error": body})

    return app
