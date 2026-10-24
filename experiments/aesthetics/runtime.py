"""Process memory / environment facts recorded with every result (measured, never estimated)."""
from __future__ import annotations

import os
import platform
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]


def peak_rss_mb() -> float | None:
    """Peak resident set size of this process so far (Linux/macOS)."""
    try:
        import resource
    except ImportError:   # Windows
        return None
    peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return round(peak / (1024 * 1024 if sys.platform == "darwin" else 1024), 1)


def current_rss_mb() -> float | None:
    try:
        for line in Path("/proc/self/status").read_text().splitlines():
            if line.startswith("VmRSS:"):
                return round(int(line.split()[1]) / 1024, 1)
    except OSError:
        pass
    return None


def git_commit() -> str | None:
    try:
        return subprocess.run(["git", "-C", str(ROOT), "rev-parse", "--short=12", "HEAD"], capture_output=True,
                              text=True, timeout=5, check=True).stdout.strip() or None
    except (OSError, subprocess.SubprocessError):
        return None


def environment() -> dict[str, Any]:
    env: dict[str, Any] = {"python": platform.python_version(), "platform": f"{platform.system()} {platform.machine()}",
                           "cpu_count": os.cpu_count(), "repo_commit": git_commit()}
    cpu = None
    try:
        for line in Path("/proc/cpuinfo").read_text().splitlines():
            if line.startswith("model name"):
                cpu = line.split(":", 1)[1].strip()
                break
    except OSError:
        pass
    env["cpu_model"] = cpu or platform.processor() or None
    if "torch" in sys.modules:
        torch = sys.modules["torch"]
        env["torch"] = torch.__version__
        env["torch_threads"] = torch.get_num_threads()
        env["cuda_available"] = bool(torch.cuda.is_available())
    return env
