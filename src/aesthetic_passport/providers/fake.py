"""Fake analysis provider: returns the committed fixtures so the whole product runs with no API keys.

Selected with `ANALYSIS_PROVIDER=fake` (or automatically by the API when no key is configured).
Passports built with it carry `meta.analysis_model = "fake-fixture"`, and the UI says so.
- Full analysis: examples/sample_analysis.json (feminine / androgynous) or sample_male_analysis.json (masculine),
  chosen from the `presentation = …` line of the user prompt.
- Quick analysis (schema titled "Quick…"): summary + signature + the cited observations of the same fixture.
"""
from __future__ import annotations

import json
import os
import re
import time
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from .base import ImageInput, ProviderResult, Repair

ROOT = Path(__file__).resolve().parents[3]
FIXTURE = ROOT / "examples" / "sample_analysis.json"
MALE_FIXTURE = ROOT / "examples" / "sample_male_analysis.json"
FAKE_MODEL = "fake-fixture"
PRESENTATION_LINE = re.compile(r"^presentation = (\w+)", re.MULTILINE)


def quick_from_analysis(analysis: dict[str, Any]) -> dict[str, Any]:
    cited = [o for s in analysis["feature_signature"] for o in s["observation_ids"]]
    obs = [o for o in analysis["observations"] if o["id"] in cited]
    extra = [o for o in analysis["observations"] if o["id"] not in cited]
    obs = (obs + extra)[: max(3, min(8, len(obs) + 2))]
    return {"summary_zh": analysis["profile_summary"]["one_liner"], "feature_signature": analysis["feature_signature"],
            "observations": sorted(obs, key=lambda o: int(o["id"][1:]))}


class FakeProvider:
    name = "fake"

    def __init__(self, model: str = FAKE_MODEL, *, delay_s: float | None = None, fixture: Path = FIXTURE,
                 **_ignored: Any):
        self.model = model
        self.delay_s = float(os.environ.get("FAKE_ANALYSIS_DELAY_S", "3")) if delay_s is None else delay_s
        self.fixture = fixture

    def analyze(
        self,
        images: Sequence[ImageInput],
        system: str,
        user: str,
        schema: dict[str, Any],
        *,
        repair: Repair | None = None,
    ) -> ProviderResult:
        t0 = time.perf_counter()
        quick = str(schema.get("title", "")).lower().startswith("quick")
        if self.delay_s:
            time.sleep(self.delay_s / 3 if quick else self.delay_s)
        fixture = self.fixture
        m = PRESENTATION_LINE.search(user)
        if fixture == FIXTURE and m and m.group(1) == "masculine":
            fixture = MALE_FIXTURE
        data = json.loads(fixture.read_text(encoding="utf-8"))
        if quick:
            data = quick_from_analysis(data)
        raw = json.dumps(data, ensure_ascii=False)
        return ProviderResult(
            data=data,
            raw_text=raw,
            provider=self.name,
            model=self.model,
            input_tokens=0,
            output_tokens=0,
            latency_ms=int((time.perf_counter() - t0) * 1000),
            stop_reason="stop",
            cost_usd_est=0.0,
        )
