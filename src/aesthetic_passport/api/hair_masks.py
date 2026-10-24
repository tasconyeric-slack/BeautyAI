"""Unpaid, provider-free masks for the exact Studio base. Files share the photo TTL."""
from __future__ import annotations

import hashlib
import io
import math
import re
import threading

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from PIL import Image

from ..cv import LEFT_BROW, LEFT_EYE, LIPS_OUTER, MODELS, RIGHT_BROW, RIGHT_EYE, SEG_HAIR, Face, hull_mask
from ..masks import NOSE_HULL, feathered_alpha
from ..preview import HAIR_TARGET, hair_source, read_crop_box
from .portrait_sources import STUDIO_ROLES
from .retention import media_dir, media_expired
from .settings import Settings
from .store import Store

_MASK_LOCK = threading.Lock()
_TARGET = HAIR_TARGET


def hair_alpha(rgb: np.ndarray, seg: np.ndarray, faces: list[Face]) -> np.ndarray:
    """Inward feather only: never reuse the generation mask's room for new hair."""
    support = seg == SEG_HAIR
    protected = ~support
    for face in faces:
        for feature in (LEFT_BROW, RIGHT_BROW, LEFT_EYE, RIGHT_EYE, LIPS_OUTER, NOSE_HULL):
            protected |= hull_mask(seg.shape, face.pts(feature)) > 0
    radius = max(2, round(min(seg.shape) * 0.004))
    alpha = feathered_alpha(support, protected, radius, guide=rgb)
    alpha[protected] = 0
    return np.round(alpha * 255).astype(np.uint8)


def install_hair_masks(app: FastAPI, settings: Settings, store: Store) -> None:
    @app.get('/api/passport/{pid}/hair-mask')
    def hair_mask(pid: str, target: str = 'current', source: str = 'front') -> Response:
        job = store.get(pid) if re.fullmatch(r'ap_[0-9a-f]{12}', pid) else None
        if not job:
            raise HTTPException(404, detail={'code': 'not_found', 'detail': '找不到这份护照'})
        if job['status'] == 'deleted' or media_expired(job):
            raise HTTPException(410, detail={'code': 'media_expired', 'detail': '照片已按隐私规则删除'})
        if source not in STUDIO_ROLES or (target != 'current' and hair_source(target) != source):
            raise HTTPException(422, detail={'code': 'bad_source', 'detail': '发型与照片来源不一致'})
        if not _TARGET.fullmatch(target):
            raise HTTPException(422, detail={'code': 'bad_target', 'detail': '发型不可用'})
        directory = media_dir(settings.runs_dir, pid)
        front = directory / f'{source}.jpg'
        source = front
        if target != 'current':
            preview = next((p for p in store.previews(pid) if p['kind'] == 'hair' and p['target_id'] == target
                            and p['status'] == 'succeeded' and p['after_name']), None)
            if not preview:
                raise HTTPException(404, detail={'code': 'no_hair_mask', 'detail': '发型尚未生成'})
            source = directory / preview['after_name']
        if not front.is_file() or not source.is_file():
            raise HTTPException(410, detail={'code': 'media_expired', 'detail': '照片已按隐私规则删除'})
        with _MASK_LOCK:
            latest = store.get(pid)
            if not latest or latest['status'] == 'deleted' or media_expired(latest):
                raise HTTPException(410, detail={'code': 'media_expired', 'detail': '照片已按隐私规则删除'})
            # Content-keyed, so a regenerated preview cannot inherit a previous silhouette's mask.
            try:
                source_bytes, front_bytes = source.read_bytes(), front.read_bytes()
            except FileNotFoundError as exc:
                raise HTTPException(410, detail={'code': 'media_expired', 'detail': '照片已按隐私规则删除'}) from exc
            box = read_crop_box(source) if target != 'current' else None
            digest = hashlib.sha256(b'hair-mask-v1' + front_bytes + source_bytes + repr(box).encode()).hexdigest()[:24]
            path = directory / f'hair_mask_{digest}.png'
            if path.is_file():
                return Response(path.read_bytes(), media_type='image/png', headers={'Cache-Control': 'no-store'})
            with Image.open(io.BytesIO(front_bytes)) as im:
                original = im.convert('RGB')
            scale = min(1, 900 / max(original.size))
            size = tuple(math.floor(n * scale + 0.5) for n in original.size)
            base = original.resize(size, Image.Resampling.LANCZOS)
            if target != 'current':
                with Image.open(io.BytesIO(source_bytes)) as im:
                    generated = im.convert('RGB')
                x0, y0, x1, y1 = box or [0, 0, 1, 1]
                x, y = math.floor(x0 * size[0] + 0.5), math.floor(y0 * size[1] + 0.5)
                w, h = math.floor((x1 - x0) * size[0] + 0.5), math.floor((y1 - y0) * size[1] + 0.5)
                base.paste(generated.resize((w, h), Image.Resampling.LANCZOS), (x, y))
            rgb = np.asarray(base)
            try:
                faces = MODELS.faces(rgb)
                if len(faces) != 1:
                    raise ValueError('one face required')
                alpha = hair_alpha(rgb, MODELS.segment(rgb), faces)
                if np.count_nonzero(alpha) < 25:
                    raise ValueError('no usable hair')
            except Exception as exc:
                # Fail closed: a polygon or the old haircut's mask cannot safely stand in for segmentation.
                raise HTTPException(422, detail={'code': 'no_hair_mask', 'detail': '这张照片暂时无法准确识别头发边缘'}) from exc
            # Do not recreate media after deletion/expiry while segmentation was running.
            latest = store.get(pid)
            if not latest or latest['status'] == 'deleted' or media_expired(latest) or not directory.is_dir():
                raise HTTPException(410, detail={'code': 'media_expired', 'detail': '照片已按隐私规则删除'})
            buffer = io.BytesIO()
            Image.fromarray(alpha).save(buffer, format='PNG')
            path.write_bytes(buffer.getvalue())
            return Response(buffer.getvalue(), media_type='image/png', headers={'Cache-Control': 'no-store'})
