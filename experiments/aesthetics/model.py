"""Offline adapter for the published MEBeauty `dinov2-partial` checkpoint (dr-irina-lebedeva/MEBeauty-FBP-models).

Architecture (from MEBeauty-Benchmark `methods/foundation.py`, verified against the reference source):
    backbone  transformers Dinov2Model (facebook/dinov2-base: 768 wide, 12 layers, patch 14); last 4 blocks were
              fine-tuned, so the checkpoint stores the WHOLE backbone state dict under "backbone" ("model.*").
    features  concat(CLS token, mean of patch tokens) → 1536
    head      LayerNorm(1536) → Dropout → Linear(1536, 256) → GELU → Dropout → Linear(256, 1)
    output    score on MEBeauty `beauty_score` (1–10), clipped to the score range, flip-averaged.

Fully offline: the Dinov2 config is inferred from checkpoint tensor shapes (or read from a local config.json),
so no `facebook/dinov2-base` download is needed — the checkpoint already carries every backbone weight.
torch / transformers are experiment-only dependencies (experiments/aesthetics/requirements.txt), imported lazily.

`_ATTENTION_RENAMES` / `align_state` are adapted from MEBeauty-Benchmark `src/fbp_benchmark/pretrained.py`:
    MIT License — Copyright (c) 2026 Irina Lebedeva (see THIRD_PARTY.md).
"""
from __future__ import annotations

import hashlib
import json
import os
import time
from pathlib import Path
from typing import Any

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
SOURCE_REPO = "dr-irina-lebedeva/MEBeauty-FBP-models"
METHOD = "dinov2-partial"
WEIGHTS_FILE = f"{METHOD}.pt"
DEFAULT_DIR = ROOT / "models" / "aesthetics" / "mebeauty-fbp"     # models/ is git-ignored
LABEL_SCALE = {"dataset": "MEBeauty", "label": "beauty_score", "min": 1.0, "max": 10.0,
               "meaning": "predicted mean rating of the MEBeauty rater panel (not an objective property)"}
# facebook/dinov2-base, used only when building an untrained architecture for timing (`bench --random-init`).
DINOV2_BASE = {"hidden_size": 768, "num_hidden_layers": 12, "num_attention_heads": 12, "patch_size": 14,
               "image_size": 518, "mlp_ratio": 4, "layerscale_value": 1.0, "layer_norm_eps": 1e-6,
               "qkv_bias": True, "use_swiglu_ffn": False}

# transformers 5.18 renamed Dinov2 attention submodules; left = pre-5.18, right = 5.18+.
_ATTENTION_RENAMES: tuple[tuple[str, str], ...] = (
    ("attention.attention.query.", "attention.q_proj."),
    ("attention.attention.key.", "attention.k_proj."),
    ("attention.attention.value.", "attention.v_proj."),
    ("attention.output.dense.", "attention.o_proj."),
)


class ModelUnavailable(RuntimeError):
    """Weights or their dependencies are not present locally. `.prerequisite` says exactly what is missing."""

    def __init__(self, status: str, message: str, prerequisite: str) -> None:
        super().__init__(message)
        self.status = status
        self.prerequisite = prerequisite


def default_weights() -> Path:
    env = os.environ.get("AESTHETICS_WEIGHTS")
    return Path(env) if env else DEFAULT_DIR / WEIGHTS_FILE


def download_hint() -> str:
    return (f"Download {WEIGHTS_FILE} and config.json from https://huggingface.co/{SOURCE_REPO} into "
            f"{DEFAULT_DIR.relative_to(ROOT)}/ (git-ignored), e.g. `hf download {SOURCE_REPO} {WEIGHTS_FILE} "
            f"config.json --local-dir {DEFAULT_DIR.relative_to(ROOT)}`, or pass --weights / set AESTHETICS_WEIGHTS. "
            "Needs network access to huggingface.co.")


def _rename(state: dict[str, Any], forward: bool) -> dict[str, Any]:
    pairs = _ATTENTION_RENAMES if forward else tuple((new, old) for old, new in _ATTENTION_RENAMES)
    out = {}
    for key, value in state.items():
        for src, dst in pairs:
            if src in key:
                key = key.replace(src, dst)
                break
        out[key] = value
    return out


def align_state(module: Any, state: dict[str, Any]) -> dict[str, Any]:
    """Translate a state dict between the two Dinov2 attention layouts; unchanged when it already matches."""
    expected = set(module.state_dict())
    if not expected - set(state):
        return state
    for forward in (True, False):
        candidate = _rename(state, forward)
        if not expected - set(candidate):
            return candidate
    return state


def infer_dinov2_config(backbone_state: dict[str, Any]) -> dict[str, Any]:
    """Dinov2 hyper-parameters from tensor shapes of the checkpoint's backbone ("model.*") state dict."""
    def get(name: str) -> Any:
        if name not in backbone_state:
            raise KeyError(name)
        return backbone_state[name]

    hidden = int(get("model.embeddings.cls_token").shape[-1])
    patch = int(get("model.embeddings.patch_embeddings.projection.weight").shape[-1])
    n_pos = int(get("model.embeddings.position_embeddings").shape[1])
    grid = round((n_pos - 1) ** 0.5)
    if grid * grid != n_pos - 1:
        raise ValueError(f"position embeddings ({n_pos}) are not a square grid + CLS")
    layers = 1 + max(int(k.split(".")[3]) for k in backbone_state if k.startswith("model.encoder.layer."))
    if any(".mlp.weights_in." in k for k in backbone_state):
        raise ValueError("SwiGLU backbone (giant variant): shapes do not determine mlp_ratio exactly")
    mlp_hidden = int(get("model.encoder.layer.0.mlp.fc1.weight").shape[0])
    if mlp_hidden % hidden:
        raise ValueError(f"MLP width {mlp_hidden} is not an integer multiple of {hidden}")
    has_bias = any(k.endswith(("attention.attention.query.bias", "attention.q_proj.bias")) for k in backbone_state)
    return {"hidden_size": hidden, "num_hidden_layers": layers, "num_attention_heads": max(1, hidden // 64),
            "patch_size": patch, "image_size": grid * patch,
            "mlp_ratio": mlp_hidden // hidden, "layerscale_value": 1.0, "layer_norm_eps": 1e-6, "qkv_bias": has_bias,
            "use_swiglu_ffn": False}


def _build(dinov2: dict[str, Any]) -> tuple[Any, Any]:
    import torch
    from torch import nn
    from transformers import Dinov2Config, Dinov2Model

    class Backbone(nn.Module):
        def __init__(self) -> None:
            super().__init__()
            self.model = Dinov2Model(Dinov2Config(**dinov2))

        def forward(self, pixels: torch.Tensor) -> torch.Tensor:
            out = self.model(pixel_values=pixels).last_hidden_state
            return torch.cat([out[:, 0], out[:, 1:].mean(dim=1)], dim=-1)

    width = dinov2["hidden_size"] * 2
    head = nn.Sequential(nn.LayerNorm(width), nn.Dropout(0.2), nn.Linear(width, 256), nn.GELU(), nn.Dropout(0.1),
                         nn.Linear(256, 1))
    return Backbone(), head


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


class MEBeautyDinoV2:
    """Load once, score many. `predict(batch)` takes (N, 3, 224, 224) float32 from preprocess.to_model_input."""

    def __init__(self, weights: str | Path | None = None, *, backbone_config: str | Path | None = None,
                 model_config: str | Path | None = None, device: str = "cpu", threads: int | None = None,
                 random_init: bool = False) -> None:
        t0 = time.perf_counter()
        try:
            import torch
            import transformers
        except ImportError as e:
            raise ModelUnavailable("dependency_missing", f"{e.name or e} is not installed",
                                   "pip install -r experiments/aesthetics/requirements.txt") from e
        if threads:
            torch.set_num_threads(int(threads))
        self.torch = torch
        self.device = torch.device(device)
        self.random_init = random_init
        self.pretrained_config: dict[str, Any] = {}
        self.weights_path: Path | None = None
        self.weights_sha256: str | None = None

        if random_init:
            dinov2, source = dict(DINOV2_BASE), "facebook/dinov2-base hyper-parameters (built-in, random weights)"
            state = None
        else:
            path = Path(weights) if weights else default_weights()
            if not path.is_file():
                raise ModelUnavailable("model_unavailable", f"weights not found at {path}", download_hint())
            self.weights_path = path
            self.weights_sha256 = sha256(path)
            try:
                state = torch.load(path, map_location="cpu", weights_only=True)
            except Exception as e:
                raise ModelUnavailable("model_incompatible", f"could not read checkpoint: {type(e).__name__}: {e}",
                                       "Re-download the checkpoint; a ~130-byte file is a Git-LFS pointer.") from e
            if not isinstance(state, dict) or not {"backbone", "head"} <= set(state):
                keys = sorted(state)[:5] if isinstance(state, dict) else type(state).__name__
                raise ModelUnavailable("model_incompatible", f"checkpoint has {keys}, expected 'backbone' and 'head'",
                                       f"Use {WEIGHTS_FILE} from {SOURCE_REPO}.")
            if backbone_config:
                raw = json.loads(Path(backbone_config).read_text(encoding="utf-8"))
                dinov2 = {k: raw[k] for k in DINOV2_BASE if k in raw}
                source = f"local config {Path(backbone_config).name}"
            else:
                try:
                    dinov2 = infer_dinov2_config(state["backbone"])
                except (KeyError, ValueError) as e:
                    raise ModelUnavailable("model_incompatible", f"cannot infer backbone config: {e}",
                                           "Pass --backbone-config with facebook/dinov2-base's config.json.") from e
                source = "inferred from checkpoint tensor shapes"
            cfg_path = Path(model_config) if model_config else path.with_name("config.json")
            if cfg_path.is_file():
                self.pretrained_config = json.loads(cfg_path.read_text(encoding="utf-8"))

        self.dinov2 = dinov2
        self.backbone_config_source = source
        self.backbone, self.head = _build(dinov2)
        if state is not None:
            for name, module in (("backbone", self.backbone), ("head", self.head)):
                try:
                    module.load_state_dict(align_state(module, state[name]), strict=True)
                except RuntimeError as e:
                    raise ModelUnavailable(
                        "model_incompatible", f"{name} state dict does not match: {str(e)[:400]}",
                        f"transformers {transformers.__version__} may use another Dinov2 layout; "
                        "the reference tested 5.14.1 and 5.18.0.") from e
        for m in (self.backbone, self.head):
            m.to(self.device).eval()
        low, high = self.pretrained_config.get("score_range", (LABEL_SCALE["min"], LABEL_SCALE["max"]))
        self.score_range = (float(low), float(high))
        self.score_range_source = "config.json" if "score_range" in self.pretrained_config else "default (MEBeauty 1–10)"
        self.load_seconds = round(time.perf_counter() - t0, 3)
        self.parameters = int(sum(p.numel() for m in (self.backbone, self.head) for p in m.parameters()))
        self.versions = {"torch": torch.__version__, "transformers": transformers.__version__}

    @property
    def model_version(self) -> str:
        tag = "random-init" if self.random_init else f"sha256:{(self.weights_sha256 or '')[:12]}"
        return f"mebeauty-fbp/{METHOD}@{tag}"

    def describe(self) -> dict[str, Any]:
        return {"name": METHOD, "source_repo": SOURCE_REPO, "weights_file": self.weights_path.name
                if self.weights_path else None, "weights_sha256": self.weights_sha256,
                "random_init": self.random_init, "architecture": "Dinov2Model + CLS‖mean-patch + 2-layer MLP head",
                "backbone_config": self.dinov2, "backbone_config_source": self.backbone_config_source,
                "parameters": self.parameters, "score_range": list(self.score_range),
                "score_range_source": self.score_range_source, "device": str(self.device), **self.versions}

    def predict(self, batch: np.ndarray, flip: bool = True) -> tuple[np.ndarray, np.ndarray]:
        """(clipped, unclipped) scores for a (N, 3, 224, 224) batch. Flip-average = mean of two separate
        passes, as in the reference `predict`."""
        torch = self.torch
        x = torch.from_numpy(np.ascontiguousarray(batch, dtype=np.float32)).to(self.device)
        with torch.no_grad():
            s = self.head(self.backbone(x)).squeeze(-1)
            if flip:
                s = 0.5 * (s + self.head(self.backbone(torch.flip(x, dims=[3]))).squeeze(-1))
        raw = s.detach().cpu().numpy().astype(float)
        return np.clip(raw, *self.score_range), raw
