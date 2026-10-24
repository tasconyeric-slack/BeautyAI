"""Single-photo QC for the live upload checks (`POST /api/qc`)."""
from __future__ import annotations

from typing import Any

from PIL import Image

from ..pipeline import qc_mode


def check_one(im: Image.Image, role: str) -> dict[str, Any]:
    """Return {photo_id, status, issues, messages, metrics...} for one photo."""
    if qc_mode() == "stub":
        return {"photo_id": role, "status": "ok", "face_count": 1, "yaw": None, "pitch": None, "roll": None,
                "blur_score": None, "face_luma_mean": None, "face_box_px": None, "issues": [], "messages": [],
                "mode": "stub"}
    from ..qc import check_photo_with_messages, messages_for  # real MediaPipe QC (S3)

    result = check_photo_with_messages(im, "front" if role == "glasses" else role)
    if role == "glasses":
        result["photo_id"] = role
        result["messages"] = messages_for(result["issues"], role=role, face_box_px=result.get("face_box_px"))
    return {**result, "mode": "real"}
