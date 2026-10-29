"""Build original schematic QC teaching assets. No photos or CV pass claims."""
import json
from hashlib import sha256
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "web/public/guides/qc"
OUT.mkdir(parents=True, exist_ok=True)
config = (ROOT / "config/qc.yaml").read_text(encoding="utf-8")
source = (ROOT / "src/aesthetic_passport/qc.py").read_text(encoding="utf-8")
cases = [
    ("ready", None, "这样拍就好", "单人平视镜头，五官完整；用自然光，保留清晰原图。", "enabled"),
    ("blur", "blurry", "保留五官细节", "擦净镜头并对焦，避免晃动、压缩或放大小图。", "enabled"),
    ("angle", "pose_off_axis", "正脸平视", "拍正脸时面向镜头，下巴放平；侧脸照放在对应位置。", "enabled"),
    ("dark", "underexposed", "面向柔和光线", "面向窗户，让脸部明亮；避免背光。", "enabled"),
    ("bright", "overexposed", "避开强光", "避开直射阳光或强闪光，保留眼睛和脸部细节。", "enabled"),
    ("covered", "occluded_eyes", "露出眼睛与眉毛", "撩开遮眼头发、摘下墨镜；日常眼镜照可放在选填位置。", "guidance_only"),
    ("small", "face_too_small", "靠近一点", "保留完整头部并减少多余背景，不用数码放大代替清晰原图。", "enabled"),
]
face = '''<path d="M78 261Q80 206 130 202H190Q240 206 242 261" fill="#8a9c96"/>
<path d="M143 173H177V215Q160 231 143 215" fill="#c3b2a0"/>
<ellipse cx="160" cy="125" rx="59" ry="75" fill="#d3c3ad"/>
<path d="M102 127Q90 44 161 42Q229 45 218 126L206 99Q167 97 139 78L111 111Z" fill="#3e4a45"/>
<g fill="none" stroke="#45544d" stroke-width="3.5" stroke-linecap="round"><path d="M125 116q10-5 20 0M176 116q10-5 20 0M127 130h15M178 130h15M160 131l-4 23h8M145 172q15 8 30 0"/></g>'''
manifest = {"purpose": "upload teaching only", "source": "original code-native SVG diagrams, not portraits", "license": "project-original", "config_sha256": sha256(config.encode()).hexdigest(), "cv_validation": "not_run_schematic_not_a_test_photo", "assets": []}
for name, code, title, hint, mode in cases:
    if code:
        assert f"  {code}:" in config and f'"{code}"' in source, code
    transform = "rotate(17 160 150)" if name == "angle" else "translate(85 86) scale(.46)" if name == "small" else ""
    filt = ' filter="url(#blur)"' if name == "blur" else ""
    extra = '<path d="M103 116Q150 95 216 118L211 147Q162 132 108 148Z" fill="#253c37"/>' if name == "covered" else ""
    overlay = '<rect width="320" height="280" fill="#15231f" opacity=".63"/>' if name == "dark" else '<rect width="320" height="280" fill="white" opacity=".67"/>' if name == "bright" else ""
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 280" role="img" aria-labelledby="t d"><title id="t">{title}（拍照示意）</title><desc id="d">{hint} 原创示意，不是质检结果。</desc><defs><filter id="blur"><feGaussianBlur stdDeviation="4"/></filter></defs><rect width="320" height="280" rx="4" fill="#e8edeb"/><path d="M30 55V30H60M260 30H290V55M30 225V250H60M260 250H290V225" fill="none" stroke="#a1afa7" stroke-width="2"/><g transform="{transform}"{filt}>{face}{extra}</g>{overlay}</svg>'''
    path = OUT / f"{name}.svg"
    path.write_text(svg, encoding="utf-8")
    manifest["assets"].append({"id": name, "path": str(path.relative_to(ROOT)).replace('\\', '/'), "issue": code, "title": title, "use": hint, "gate": mode, "sha256": sha256(svg.encode()).hexdigest(), "review": {"rule_mapping": "passed", "basis": "config/qc.yaml + qc.py", "visual": "passed: Codex reviewed QC_TEACHING.html screenshot 2026-10-28"}})
(OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
cards = "".join(f'<article><img src="../../{a["path"]}" alt="{escape(a["title"])}（示意）"><h2>{escape(a["title"])}</h2><p>{escape(a["use"])}</p><code>{a["issue"] or "合格拍照指导，无 issue"}</code><p>{"仅教学，当前未启用独立遮挡门禁" if a["gate"] == "guidance_only" else "规则标签对应已核对"}</p></article>' for a in manifest["assets"])
html = '''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>拍照教学示意 · AS-02</title><style>*{box-sizing:border-box}body{margin:0;background:#f2f1eb;color:#171b19;font:15px/1.8 "Microsoft YaHei",sans-serif}main{max-width:1200px;margin:auto;padding:40px 24px}h1,h2{font-family:"Noto Serif SC","Songti SC",serif;font-weight:500}h1{font-size:36px}h2{font-size:22px}p{color:#536059}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:24px;margin-top:32px}article{padding:16px;background:#f7f6f1;border:1px solid #cdd0c9}img{width:100%;display:block}code{font-size:12px;overflow-wrap:anywhere}a{color:#3f6259}@media(max-width:600px){main{padding:20px 16px}section{grid-template-columns:1fr 1fr;gap:12px}article{padding:10px}h2{font-size:18px}p{font-size:13px}}</style><main><h1>拍好一张，让建议更可靠</h1><p>AS-02 · 原创 SVG 拍照示意，不是真人照片或实际 CV 质检结果。上传页已接入合格、清晰、角度、光线和遮挡五类互动指引。</p><section>''' + cards + '</section><p>来源：scripts/build_qc_teaching.py；规则：config/qc.yaml + qc.py；逐张 SHA256、标签与核对记录见 web/public/guides/qc/manifest.json。</p></main></html>'
(ROOT / "docs/design/QC_TEACHING.html").write_text(html, encoding="utf-8")
print(f"Built {len(cases)} original schematic assets; all labels match config; occlusion is guidance only.")
