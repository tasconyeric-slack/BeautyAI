import base64
import copy
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from aesthetic_passport.providers import (
    DeepSeekProvider,
    ImageInput,
    ProviderError,
    Repair,
    estimate_cost,
    from_config,
    load_models_config,
)
from aesthetic_passport.providers.deepseek import parse_json_object
from aesthetic_passport.schema_io import analysis_schema_for_prompt

EX = Path(__file__).resolve().parents[1] / "examples"
SCHEMA = {"type": "object", "required": ["ok"], "properties": {"ok": {"type": "boolean"}}}
PRICES = {"input_cache_hit": 0.1, "input_cache_miss": 1.0, "output": 2.0}


class FakeCompletions:
    def __init__(self, content='{"ok": true}', finish_reason="stop", usage=None):
        self.calls: list[dict] = []
        self.content, self.finish_reason = content, finish_reason
        self.usage = usage or SimpleNamespace(prompt_tokens=1000, completion_tokens=200, prompt_cache_hit_tokens=400)

    def create(self, **kwargs):
        self.calls.append(kwargs)
        msg = SimpleNamespace(content=self.content)
        return SimpleNamespace(model=kwargs["model"], usage=self.usage,
                               choices=[SimpleNamespace(message=msg, finish_reason=self.finish_reason)])


def _provider(**fake_kwargs):
    fake = FakeCompletions(**fake_kwargs)
    client = SimpleNamespace(chat=SimpleNamespace(completions=fake))
    return DeepSeekProvider("deepseek-flash", base_url="https://example.invalid", prices=PRICES, client=client), fake


IMG = ImageInput("front", b"\xff\xd8fake-jpeg")


# --- request construction ---------------------------------------------------------

def test_request_uses_json_mode_and_embeds_schema():
    p, fake = _provider()
    p.analyze([IMG], "SYS", "USER", SCHEMA)
    call = fake.calls[0]
    assert call["model"] == "deepseek-flash"
    assert call["response_format"] == {"type": "json_object"}
    system = call["messages"][0]
    assert system["role"] == "system" and system["content"].startswith("SYS")
    assert json.dumps(SCHEMA) in system["content"] and "JSON" in system["content"]


def test_images_are_labelled_data_uris_before_user_text():
    p, fake = _provider()
    smile = ImageInput("smile", b"second")
    p.analyze([IMG, smile], "SYS", "USER", SCHEMA)
    content = fake.calls[0]["messages"][1]["content"]
    assert [c["type"] for c in content] == ["text", "image_url", "text", "image_url", "text"]
    assert content[0]["text"] == "Photo [front]:" and content[2]["text"] == "Photo [smile]:"
    url = content[1]["image_url"]["url"]
    assert url.startswith("data:image/jpeg;base64,")
    assert base64.b64decode(url.split(",", 1)[1]) == IMG.data
    assert content[-1] == {"type": "text", "text": "USER"}


def test_repair_continues_the_same_conversation():
    p, fake = _provider()
    p.analyze([IMG], "SYS", "USER", SCHEMA, repair=Repair('{"ok": 1}', ["ok: 1 is not of type 'boolean'"]))
    msgs = fake.calls[0]["messages"]
    assert [m["role"] for m in msgs] == ["system", "user", "assistant", "user"]
    assert msgs[1]["content"][1]["type"] == "image_url"          # original images resent
    assert msgs[2]["content"] == '{"ok": 1}'                    # previous output
    assert "ok: 1 is not of type 'boolean'" in msgs[3]["content"]


# --- response parsing -------------------------------------------------------------

def test_result_carries_usage_latency_and_cost():
    p, _ = _provider()
    r = p.analyze([IMG], "SYS", "USER", SCHEMA)
    assert r.data == {"ok": True} and r.parse_error is None
    assert (r.input_tokens, r.output_tokens, r.stop_reason) == (1000, 200, "stop")
    assert r.cost_usd_est == pytest.approx((400 * 0.1 + 600 * 1.0 + 200 * 2.0) / 1e6)
    assert r.latency_ms >= 0
    rec = r.log_record()
    assert "raw_text" not in rec and "data" not in rec and rec["model"] == "deepseek-flash"


@pytest.mark.parametrize("text,ok", [
    ('{"a": 1}', True),
    ('```json\n{"a": 1}\n```', True),
    ("", False),
    ('{"a": ', False),
    ("[1, 2]", False),
])
def test_parse_json_object(text, ok):
    data, err = parse_json_object(text)
    assert (data is not None) is ok and (err is None) is ok


def test_truncated_output_returns_no_data_instead_of_raising():
    p, _ = _provider(content='{"ok": tr', finish_reason="length")
    r = p.analyze([IMG], "SYS", "USER", SCHEMA)
    assert r.data is None and r.stop_reason == "length" and r.parse_error


# --- cost / config ----------------------------------------------------------------

def test_cost_is_none_while_prices_unset():
    unset = {"input_cache_hit": None, "input_cache_miss": None, "output": None}
    assert estimate_cost(unset, input_tokens=10, output_tokens=5) is None
    assert estimate_cost(None, input_tokens=10, output_tokens=5) is None


def test_cost_without_cache_split_counts_all_input_as_miss():
    assert estimate_cost(PRICES, input_tokens=1_000_000, output_tokens=0) == pytest.approx(1.0)


def test_missing_api_key_fails_loudly(monkeypatch):
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    with pytest.raises(ProviderError, match="DEEPSEEK_API_KEY"):
        DeepSeekProvider("deepseek-flash", base_url="https://example.invalid")


def test_from_config_builds_deepseek_production_provider(monkeypatch):
    monkeypatch.setenv("ANALYSIS_PROVIDER", "deepseek")
    cfg = copy.deepcopy(load_models_config())
    fake = SimpleNamespace(chat=SimpleNamespace(completions=FakeCompletions()))
    p = from_config(cfg=cfg, client=fake)
    assert (p.name, p.model) == ("deepseek", cfg["production"]["analysis"]["model"])
    assert cfg["providers"]["deepseek"]["api_key_env"] == "DEEPSEEK_API_KEY"


def test_exactly_one_production_analysis_model():
    # Invariant 3 (D1/D10): one analysis model per request. Image editing is a separate role (D17).
    cfg = load_models_config()
    assert cfg["production"]["analysis"]["provider"] == "deepseek"
    assert cfg["production"]["analysis"]["model"] == "deepseek-flash"
    assert set(cfg["production"]) == {"analysis", "quick", "image_edit"}
    assert "provider" not in cfg["production"]["quick"]          # the quick call reuses the analysis provider (D21)
    assert cfg["production"]["analysis"]["image_max_long_side"] == 1568


# --- images -----------------------------------------------------------------------

def test_image_is_downscaled_and_exif_rotated(tmp_path):
    from PIL import Image

    src = tmp_path / "front.jpg"
    exif = Image.Exif()
    exif[0x0112] = 6  # orientation: rotate 90° CW to display
    Image.new("RGB", (3000, 2000), "gray").save(src, exif=exif)
    img = ImageInput.from_path("front", src, max_long_side=1568)
    with Image.open(__import__("io").BytesIO(img.data)) as out:
        assert out.size == (1045, 1568)          # portrait after EXIF transpose, long side capped


def test_prompt_schema_is_the_full_analysis_schema():
    schema = analysis_schema_for_prompt()
    assert schema["$id"].endswith("analysis.schema.json") and "$defs" in schema


# --- thinking mode (D16) --------------------------------------------------------------

def test_thinking_disabled_by_default_and_sent_explicitly():
    p, fake = _provider()
    p.analyze([IMG], "SYS", "USER", SCHEMA)
    call = fake.calls[0]
    assert call["extra_body"] == {"thinking": {"type": "disabled"}}
    assert "reasoning_effort" not in call and call["temperature"] == 0.2


def test_thinking_enabled_sends_effort_and_drops_temperature():
    fake = FakeCompletions()
    client = SimpleNamespace(chat=SimpleNamespace(completions=fake))
    p = DeepSeekProvider("deepseek-flash", base_url="x", client=client, thinking="enabled", reasoning_effort="low")
    p.analyze([IMG], "SYS", "USER", SCHEMA)
    call = fake.calls[0]
    assert call["extra_body"] == {"thinking": {"type": "enabled"}}
    assert call["reasoning_effort"] == "low" and "temperature" not in call


def test_invalid_thinking_value_rejected():
    with pytest.raises(ProviderError):
        DeepSeekProvider("deepseek-flash", base_url="x", client=object(), thinking="maybe")


def test_config_thinking_flows_into_provider(monkeypatch):
    monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-test")
    monkeypatch.delenv("ANALYSIS_PROVIDER", raising=False)
    p = from_config("analysis")
    assert p.thinking == load_models_config()["production"]["analysis"]["thinking"] == "disabled"


def test_env_selects_fake_provider(monkeypatch):
    monkeypatch.setenv("ANALYSIS_PROVIDER", "fake")
    p = from_config("analysis", delay_s=0)
    result = p.analyze([IMG], "SYS", "USER", SCHEMA)
    assert p.name == "fake" and result.data["recommendations"]


def test_auto_falls_back_to_fake_without_key(monkeypatch):
    monkeypatch.setenv("ANALYSIS_PROVIDER", "auto")
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    monkeypatch.setattr("dotenv.load_dotenv", lambda *a, **k: False)
    assert from_config("analysis", delay_s=0).name == "fake"


def test_default_is_auto_so_keyless_deploys_run_in_demo_mode(monkeypatch):
    monkeypatch.delenv("ANALYSIS_PROVIDER", raising=False)
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    monkeypatch.setattr("dotenv.load_dotenv", lambda *a, **k: False)
    assert from_config("analysis", delay_s=0).name == "fake"
    monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-test")
    assert from_config("analysis").name == "deepseek"
