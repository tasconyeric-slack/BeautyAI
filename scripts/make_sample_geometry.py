"""Demo fixtures from one synthetic face per sample: geometry, portrait illustration and the measurement profile.

The face is MediaPipe's canonical face mesh (an average model, not a person), reshaped so that its CV numbers match
the anchors already in examples/sample_context.json (female) and examples/sample_male_context.json (male), and given a
synthetic hair mask whose hairline reproduces the fixture's vertical thirds. From that single landmark set we write:

  web/lib/fixtures/sample_geometry[_male].json   polygons (tint / drape / cards) + named measurement points
  web/public/sample/portrait[-male].svg          the illustrated stand-in for the user's photo (fixture mode)
  web/public/sample/portrait-{safe,bold,easy}.svg  fixture "AI 试看" stand-ins (female face)
  examples/sample[_male]_context.json            `measurement_profile` (CV layer) and `aesthetic_score` (scoring layer,
                                                 the same scorer as production) and `reference_percentiles` (#41),
                                                 then `make sample` assembles

So in fixture mode every line the face page draws is the geometry the printed number was computed from.
Run: PYTHONPATH=src python scripts/make_sample_geometry.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from aesthetic_passport.anchors import export_geometry, measure
from aesthetic_passport.cv import FACE_OVAL
from aesthetic_passport.face_metrics import SideIn, measure_all
from aesthetic_passport.face_metrics.profile import trace_profile
from aesthetic_passport.face_metrics.synthetic import synthetic_face, synthetic_profile, synthetic_seg
from aesthetic_passport.percentiles import reference_percentiles
from aesthetic_passport.scoring import score_face

W, H = 600, 750
FIX = ROOT / "web" / "lib" / "fixtures"
PUB = ROOT / "web" / "public" / "sample"
LAYOUT = {"width": W, "height": H, "scale": 20.0}

# Fitted once (coordinate descent on anchors: length/width, forehead, jaw, lower/mid, eye gap); checked below.
SAMPLES = {
    "female": {"context": ROOT / "examples" / "sample_context.json", "geometry": FIX / "sample_geometry.json",
               "svg": PUB / "portrait.svg", "eye_y": 385.0, "profile_svg": PUB / "profile.svg",
               "side": {"lip_protrusion": 0.35, "nose_projection": -0.2},
               "shape": {"stretch_upper": 1.4594, "stretch_lower": 1.05, "jaw_width": 1.0438,
                         "forehead_width": 1.1235, "eye_scale": 1.204, "asymmetry": 0.12}},
    "male": {"context": ROOT / "examples" / "sample_male_context.json", "geometry": FIX / "sample_geometry_male.json",
             "svg": PUB / "portrait-male.svg", "eye_y": 360.0, "profile_svg": PUB / "profile-male.svg",
             "side": {"chin_projection": 0.6, "nose_projection": 0.25},
             "shape": {"stretch_upper": 1.0478, "stretch_lower": 1.3062, "jaw_width": 1.1484,
                       "forehead_width": 1.0984, "eye_scale": 1.1859, "asymmetry": -0.1}},
}

# Hair silhouettes for the fixture "AI 试看" stand-ins (flat illustration paths on the 600×750 canvas).
TIER_HAIR = {
    "safe": ("M100 520 C70 260 150 100 300 96 C450 100 530 260 500 520 Q470 585 430 560 L170 560 Q130 585 100 520 Z",
             ("M126 330 C122 160 210 104 300 104 C392 104 478 160 474 330 C455 300 430 292 415 300 L400 268 L388 300 "
              "L366 270 L352 300 L330 272 L316 302 L296 272 L280 302 L262 272 L246 302 L226 272 L210 302 L190 274 "
              "L180 300 C160 292 140 300 126 330 Z")),
    "bold": (("M90 560 C40 300 140 90 300 92 C460 90 560 300 510 560 C540 600 470 640 440 600 C470 560 430 540 450 500 "
              "L150 500 C170 540 130 560 160 600 C130 640 60 600 90 560 Z"),
             ("M120 360 C118 170 210 100 300 100 C390 100 482 170 480 360 C470 280 420 230 360 222 Q330 225 300 260 "
              "Q270 225 240 222 C180 230 130 280 120 360 Z")),
    "easy": ("M92 640 C70 280 150 104 300 100 C450 104 530 280 508 640 L520 720 L80 720 Z",
             "M126 340 C120 170 220 106 330 112 C430 120 482 190 474 330 C430 240 330 214 250 236 C200 252 150 290 126 340 Z"),
}
BACK_HAIR = {"female": "M95 470 C80 250 150 110 300 105 C450 110 520 250 505 470 L520 700 L80 700 Z",
             "male": "M128 400 C112 220 175 108 300 104 C425 108 488 220 472 400 Q300 330 128 400 Z"}


def _pts(poly: list[list[float]]) -> str:
    return " ".join(f"{x * W:.1f},{y * H:.1f}" for x, y in poly)


def _px(p: dict[str, list[float]], name: str) -> tuple[float, float]:
    x, y = p[name]
    return x * W, y * H


def front_hair(hairline: float, xl: float, xr: float) -> str:
    """The fringe-free front hair: it meets the forehead exactly at the measured hairline."""
    return (f"M{xl:.0f} 370 C{xl - 10:.0f} 190 205 100 300 100 C395 100 {xr + 10:.0f} 190 {xr:.0f} 370 "
            f"C{xr - 14:.0f} 270 {xr - 70:.0f} {hairline:.0f} 300 {hairline:.0f} "
            f"C{xl + 70:.0f} {hairline:.0f} {xl + 14:.0f} 270 {xl:.0f} 370 Z")


def portrait_svg(g: dict, hairline: float, tier: str | None = None, back_hair: str = BACK_HAIR["female"]) -> str:
    """A flat, program-drawn bust drawn from the synthetic landmarks (fixture-mode stand-in for the user's photo)."""
    p = g["points"]
    xl, _ = _px(p, "temple_l")
    xr, _ = _px(p, "temple_r")
    top = min(y for _x, y in g["jaw"]) * H
    fx0, _ = _px(p, "forehead_l")
    fx1, _ = _px(p, "forehead_r")
    back, front = TIER_HAIR[tier] if tier else (back_hair, front_hair(hairline, xl, xr))
    il, ir = _px(p, "iris_l"), _px(p, "iris_r")
    r_iris = abs(_px(p, "iris_l_a")[0] - _px(p, "iris_l_b")[0]) / 2
    (ax, ay), (bx, by) = _px(p, "alar_l"), _px(p, "alar_r")
    tx, ty = _px(p, "nose_tip")
    nx, ny = _px(p, "nasion")
    sx, sy = _px(p, "subnasale")
    y0 = top + 60
    cy = (hairline + 1 - 0.25 * y0) / 0.75          # cubic apex lands exactly on the hairline
    forehead = (f"M{fx0 - 6:.1f} {y0:.1f} C{fx0 - 6:.1f} {cy:.1f} {fx1 + 6:.1f} {cy:.1f} {fx1 + 6:.1f} {y0:.1f} Z")
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img"
 aria-label="插画示意：由平均人脸模型生成的合成人像（非真人照片）">
<defs><radialGradient id="bg" cx="50%" cy="35%" r="75%"><stop offset="0" stop-color="#5a5f63"/><stop offset="1" stop-color="#2a2d30"/></radialGradient>
<linearGradient id="skin" gradientUnits="userSpaceOnUse" x1="0" y1="150" x2="0" y2="700"><stop offset="0" stop-color="#e9c9b4"/><stop offset="1" stop-color="#d9b29b"/></linearGradient></defs>
<rect width="{W}" height="{H}" fill="url(#bg)"/>
<path d="{back}" fill="#3b2a24"/>
<path d="M60 750 C80 660 170 630 240 622 L360 622 C430 630 520 660 540 750 Z" fill="#8a7a70"/>
<path d="M248 560 L242 640 Q300 680 358 640 L352 560 Z" fill="url(#skin)"/>
<polygon points="{_pts(g['jaw'])}" fill="url(#skin)"/>
<path d="{forehead}" fill="url(#skin)"/>
<polygon points="{_pts(g['cheek_l'])}" fill="#e2b9a6" opacity=".35"/>
<polygon points="{_pts(g['cheek_r'])}" fill="#e2b9a6" opacity=".35"/>
<path d="{front}" fill="#3b2a24"/>
<polygon points="{_pts(g['brow_l'])}" fill="#5e4d44"/><polygon points="{_pts(g['brow_r'])}" fill="#5e4d44"/>
<polygon points="{_pts(g['eye_l'])}" fill="#fbf7f2"/><polygon points="{_pts(g['eye_r'])}" fill="#fbf7f2"/>
<circle cx="{il[0]:.1f}" cy="{il[1]:.1f}" r="{r_iris:.1f}" fill="#3d2c25"/><circle cx="{ir[0]:.1f}" cy="{ir[1]:.1f}" r="{r_iris:.1f}" fill="#3d2c25"/>
<path d="M{nx - 4:.1f} {ny + 12:.1f} Q{tx - 9:.1f} {(ny + ty) / 2:.1f} {tx - 5:.1f} {ty:.1f}" fill="none" stroke="#c49a86" stroke-width="2.5" stroke-linecap="round"/>
<path d="M{ax:.1f} {ay:.1f} Q{ax - 2:.1f} {sy + 2:.1f} {sx - 10:.1f} {sy:.1f} Q{sx:.1f} {sy + 4:.1f} {sx + 10:.1f} {sy:.1f} Q{bx + 2:.1f} {sy + 2:.1f} {bx:.1f} {by:.1f}" fill="none" stroke="#b98f7c" stroke-width="2.5" stroke-linecap="round"/>
<polygon points="{_pts(g['lip_outer'])}" fill="#c27f84"/><polygon points="{_pts(g['lip_inner'])}" fill="#8f4f57"/>
</svg>
"""


def synthetic_rgb(face, shape, skin_hex: str) -> np.ndarray:
    """Flat skin inside the face oval with a gentle left→right light falloff (for the cheek light-balance items)."""
    h, w = shape
    rgb = np.full((h, w, 3), 60, np.uint8)
    base = np.array([int(skin_hex[i:i + 2], 16) for i in (1, 3, 5)], np.float32)
    ramp = np.linspace(1.03, 0.97, w, dtype=np.float32)[None, :, None]
    img = np.clip(base[None, None, :] * ramp, 0, 255).astype(np.uint8).repeat(h, axis=0)
    mask = np.zeros((h, w), np.uint8)
    cv2.fillPoly(mask, [np.round(face.pts(FACE_OVAL)).astype(np.int32)], 255)
    rgb[mask > 0] = img[mask > 0]
    return rgb


SEG_FILL = {1: "#3b2a24", 2: "#d9b29b", 3: "#e2bba4", 4: "#5d6676"}


def profile_svg(seg: np.ndarray) -> str:
    """The synthetic side profile as a flat illustration: one path per segmentation class, traced at pixel level, so
    the drawn outline is exactly the outline the side metrics were measured on."""
    h, w = seg.shape
    paths = []
    for cls in (4, 2, 1, 3):
        cs, _ = cv2.findContours((seg == cls).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for c in cs:
            if cv2.contourArea(c) < 30:
                continue
            d = "M" + " L".join(f"{x} {y}" for x, y in c[:, 0, :]) + " Z"
            paths.append(f'<path d="{d}" fill="{SEG_FILL[cls]}"/>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img" '
            f'aria-label="插画示意：由平均人脸模型生成的合成侧脸（非真人照片）">\n'
            f'<rect width="{w}" height="{h}" fill="#e2e0dc"/>\n' + "\n".join(paths) + "\n</svg>\n")


def build(name: str, spec: dict) -> dict:
    ctx = json.loads(spec["context"].read_text(encoding="utf-8"))
    face, shape = synthetic_face(**LAYOUT, eye_y=spec["eye_y"], **spec["shape"])
    a = ctx["anchors"]
    # hairline that reproduces the fixture's thirds (vertical, no roll)
    gy, cy = face.pts(9)[1], face.pts(152)[1]
    t = a["thirds"]
    hairline = float(gy - t["upper"] / (t["middle"] + t["lower"]) * (cy - gy))
    seg = synthetic_seg(face, shape, hairline)
    got, _w = measure(face, None, seg=seg)
    for k, want in (("face_length_width_ratio", a["face_length_width_ratio"]), ("lower_to_mid_ratio", a["lower_to_mid_ratio"]),
                    ("intercanthal_to_eye_width", a["intercanthal_to_eye_width"])):
        assert abs(got[k] - want) < 0.01, (name, k, got[k], want)
    photo = ctx["input_quality"]["photos"][0]
    rgb = synthetic_rgb(face, shape, ctx["color_measurements"]["regions"]["skin"]["hex"])
    side_rgb, side_seg, _truth = synthetic_profile(**spec["side"])
    side = SideIn(shape=side_rgb.shape[:2], trace=trace_profile(side_rgb, side_seg))
    profile, points, views = measure_all(face, shape=shape, yaw=photo.get("yaw"), pitch=photo.get("pitch"), seg=seg,
                                         rgb=rgb, color_measurements=ctx["color_measurements"], side=side)
    spec["profile_svg"].write_text(profile_svg(side_seg), encoding="utf-8")
    geo = {**export_geometry(face, shape), "source": "synthetic_canonical_mesh", "points": points, "views": views}
    geo["width"], geo["height"] = W, H
    body = ",\n".join(f"  {json.dumps(k)}: {json.dumps(v, separators=(',', ':'), ensure_ascii=False)}" for k, v in geo.items())
    spec["geometry"].write_text("{\n" + body + "\n}\n", encoding="utf-8")
    PUB.mkdir(parents=True, exist_ok=True)
    spec["svg"].write_text(portrait_svg(geo, hairline, back_hair=BACK_HAIR[name]), encoding="utf-8")
    if name == "female":
        for tier in TIER_HAIR:
            (PUB / f"portrait-{tier}.svg").write_text(portrait_svg(geo, hairline, tier), encoding="utf-8")
    ctx["measurement_profile"] = profile
    ctx["aesthetic_score"] = score_face(face.landmarks, yaw=photo.get("yaw"), pitch=photo.get("pitch"),
                                        flags=profile["flags"])
    ctx["reference_percentiles"] = reference_percentiles(ctx["aesthetic_score"], face.landmarks, yaw=photo.get("yaw"),
                                                         pitch=photo.get("pitch"))
    spec["context"].write_text(json.dumps(ctx, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    cov = profile["coverage"]
    print(f"{name}: {cov['measured']}/{cov['front_total']} front + {cov['side_measured']}/{cov['side_total']} side metrics"
          f", score {ctx['aesthetic_score']['overall_score']} ({ctx['aesthetic_score']['status']})"
          f" → {spec['geometry'].name}, {spec['svg'].name}, {spec['profile_svg'].name}")
    return geo


def main() -> None:
    for name, spec in SAMPLES.items():
        build(name, spec)


if __name__ == "__main__":
    main()
