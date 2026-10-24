import rulesConfig from "@/lib/generated/rules-config.json";
/** Face aesthetics page (F6): passport + geometry → plain view data. Pure functions, no React.
 *  Overlay positions are derived from the CV numbers in `anchors` so the lines and the printed numbers agree;
 *  geometry only places them on the photo. Everything is normalized to the image (0..1). */
import { CATEGORY_PAGE, CATEGORY_ZH, faceNameZh, rankedRecs } from "@/lib/adapters";
import type { Passport } from "@/lib/api";
import type { FaceGeometry, Pt } from "@/lib/tint";

type Pts = readonly Pt[];
type Anchors = NonNullable<Passport["anchors"]>;

export type LayerKey = "thirds" | "fifths" | "contour" | "features" | "none";

export const LAYERS: { key: LayerKey; label: string; caption: string }[] = [
  { key: "thirds", label: "三庭", caption: "发际线 → 眉间 → 鼻底 → 下巴，三段在纵向上各占多少。" },
  { key: "fifths", label: "五眼", caption: "眼睛高度处的脸宽，以平均眼宽为 1 来比较五段。" },
  { key: "contour", label: "轮廓", caption: "脸的外缘，以及额、颧、下颌三处宽度（以颧骨宽为 1.00）。" },
  { key: "features", label: "五官", caption: "眉、眼、唇的位置与轮廓，五官量感见下方“你的特点”。" },
  { key: "none", label: "原图", caption: "不叠加任何线条。" },
];

export interface Label { x: number; y: number; text: string }
export interface HLine { y: number; x1: number; x2: number }
export interface VLine { x: number; y1: number; y2: number }

export interface FaceOverlay {
  /** Image aspect (width / height) the overlay was measured on. */
  aspect: number;
  thirds: { lines: HLine[]; labels: Label[] } | null;
  fifths: { lines: VLine[]; base: HLine; labels: Label[] } | null;
  contour: { outline: Pts; widths: HLine[]; labels: Label[] };
  features: Pts[];
}

const ys = (p: Pts) => p.map((q) => q[1]);
const xs = (p: Pts) => p.map((q) => q[0]);
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
export const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Where a horizontal line at y crosses a closed polygon: [left, right], or null. */
export function spanAt(poly: Pts, y: number): [number, number] | null {
  const hits: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    if (y1 === y2) continue;
    if ((y1 - y) * (y2 - y) <= 0) hits.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
  }
  return hits.length >= 2 ? [Math.min(...hits), Math.max(...hits)] : null;
}

export function faceOverlay(g: FaceGeometry, a: Anchors | null): FaceOverlay {
  const faceL = Math.min(...xs(g.jaw));
  const faceR = Math.max(...xs(g.jaw));
  const top = Math.min(...ys(g.jaw));
  const chin = Math.max(...ys(g.jaw));
  const browY = mean([...ys(g.brow_l), ...ys(g.brow_r)]);
  const browTop = Math.min(...ys(g.brow_l), ...ys(g.brow_r));
  const [eyeA, eyeB] = mean(xs(g.eye_l)) <= mean(xs(g.eye_r)) ? [g.eye_l, g.eye_r] : [g.eye_r, g.eye_l];
  const eyeTop = Math.min(...ys(eyeA), ...ys(eyeB));
  const eyeBottom = Math.max(...ys(eyeA), ...ys(eyeB));
  const eyeMid = (eyeTop + eyeBottom) / 2;
  const lipTop = Math.min(...ys(g.lip_outer));
  const lipBottom = Math.max(...ys(g.lip_outer));
  const pad = 0.035;

  // 三庭: glabella (brow level) and chin come from the photo; the cut points follow the measured fractions.
  let thirds: FaceOverlay["thirds"] = null;
  const t = a?.thirds;
  if (t) {
    const ml = t.middle + t.lower;
    const unit = (chin - browY) / (ml || 1);
    const nose = browY + t.middle * unit;
    const hl = (y: number) => ({ y, x1: faceL - pad, x2: faceR + pad });
    const lx = faceR + pad + 0.01;
    const lines = [hl(browY), hl(nose), hl(chin)];
    const labels: Label[] = [
      { x: lx, y: (browY + nose) / 2, text: `中 ${pct(t.middle)}` },
      { x: lx, y: (nose + chin) / 2, text: `下 ${pct(t.lower)}` },
    ];
    if (t.upper != null && !t.upper_occluded) {
      const hair = browY - t.upper * unit;
      lines.unshift(hl(hair));
      labels.unshift({ x: lx, y: (hair + browY) / 2, text: `上 ${pct(t.upper)}` });
    } else {
      labels.unshift({ x: lx, y: Math.max(0.04, browY - 0.07), text: "上庭未测量" });
    }
    thirds = { lines, labels };
  }

  // 五眼: the two eyes from the photo; the outer fifths are sized by the measured ratios.
  let fifths: FaceOverlay["fifths"] = null;
  const f = a?.eye_fifths;
  if (f && f.length === 5) {
    const aL = Math.min(...xs(eyeA)), aR = Math.max(...xs(eyeA));
    const bL = Math.min(...xs(eyeB)), bR = Math.max(...xs(eyeB));
    const eyeW = (aR - aL + (bR - bL)) / 2;
    const cuts = [aL - f[0] * eyeW, aL, aR, bL, bR, bR + f[4] * eyeW];
    const y1 = browTop - 0.02;
    const y2 = eyeBottom + 0.05;
    fifths = {
      lines: cuts.map((x) => ({ x, y1, y2 })),
      base: { y: eyeMid, x1: cuts[0], x2: cuts[5] },
      labels: f.map((v, i) => ({ x: (cuts[i] + cuts[i + 1]) / 2, y: browTop - 0.045, text: v.toFixed(2) })),
    };
  }

  // 轮廓: the outline, plus forehead / cheekbone / jaw widths drawn to the measured ratios around the midline.
  let cheekY = eyeBottom;
  let cheekW = 0;
  for (let y = eyeBottom; y <= lipTop; y += 0.005) {
    const s = spanAt(g.jaw, y);
    if (s && s[1] - s[0] > cheekW) { cheekW = s[1] - s[0]; cheekY = y; }
  }
  const mid = (faceL + faceR) / 2;
  const wp = a?.width_profile ?? { forehead: 1, cheekbone: 1, jaw: 1 };
  const foreheadY = browTop - (browTop - top) * 0.25;
  const jawY = lipBottom + (chin - lipBottom) * 0.3;
  const bar = (y: number, r: number): HLine => ({ y, x1: mid - (cheekW * r) / 2, x2: mid + (cheekW * r) / 2 });
  const widths = [bar(foreheadY, wp.forehead / (wp.cheekbone || 1)), bar(cheekY, 1), bar(jawY, wp.jaw / (wp.cheekbone || 1))];
  const lxl = Math.max(0.01, faceL - 0.17);
  const contour = {
    outline: g.jaw,
    widths,
    labels: [
      { x: lxl, y: foreheadY, text: `额 ${wp.forehead.toFixed(2)}` },
      { x: lxl, y: cheekY, text: `颧 ${wp.cheekbone.toFixed(2)}` },
      { x: lxl, y: jawY, text: `颌 ${wp.jaw.toFixed(2)}` },
    ],
  };

  return {
    aspect: g.width / g.height,
    thirds,
    fifths,
    contour,
    features: [g.brow_l, g.brow_r, g.eye_l, g.eye_r, g.lip_outer],
  };
}

// --- measurements ------------------------------------------------------------------------------------------

export interface Measure {
  key: string;
  label: string;
  /** null = not measured. */
  value: number | null;
  display: string;
  /** Illustrative grey band, in the value's own units. */
  band: [number, number];
  bandText: string;
  /** Scale drawn for the bar. */
  domain: [number, number];
  note?: string;
}

/** Illustrative "常见范围" bands for orientation only. They never classify or rate a face.
 *  TODO(shared): move to config/rules.yaml (display.common_ranges) and ship via derived, so every surface agrees. */
// Illustrative "常见范围" bands live in config/rules.yaml (face_common_ranges), exported by `make types` (invariant 4).
const R = rulesConfig.face_common_ranges as unknown as Record<string, [number, number]>;
const BANDS = {
  third: R.third,
  thirdOfTwo: R.third_of_two,
  eyeGap: R.eye_gap,
  lengthWidth: R.length_width,
  forehead: R.forehead,
  jaw: R.jaw,
} as const;

const rangePct = ([lo, hi]: readonly [number, number]) => `${Math.round(lo * 100)}–${Math.round(hi * 100)}%`;
const rangeNum = ([lo, hi]: readonly [number, number]) => `${lo.toFixed(2)}–${hi.toFixed(2)}`;

export function measurements(a: Anchors | null): { thirds: Measure[]; shape: Measure[]; upperMissing: boolean } {
  if (!a) return { thirds: [], shape: [], upperMissing: false };
  const t = a.thirds;
  const upperMissing = Boolean(t && (t.upper == null || t.upper_occluded));
  const thirds: Measure[] = [];
  if (t) {
    const band = upperMissing ? BANDS.thirdOfTwo : BANDS.third;
    const row = (key: string, label: string, v: number | null, note?: string): Measure => ({
      key, label, value: v, display: v == null ? "未测量" : pct(v), band: [band[0], band[1]], bandText: rangePct(band),
      domain: upperMissing ? [0.3, 0.7] : [0.2, 0.46], note,
    });
    thirds.push(
      upperMissing
        ? { ...row("upper", "上庭", null), display: "上庭未测量", note: "被刘海或头发遮挡" }
        : row("upper", "上庭", t.upper, "发际线到眉间"),
      row("middle", "中庭", t.middle, upperMissing ? "眉间到鼻底，按中下庭合计" : "眉间到鼻底"),
      row("lower", "下庭", t.lower, upperMissing ? "鼻底到下巴，按中下庭合计" : "鼻底到下巴"),
    );
  }
  const num = (key: string, label: string, v: number, band: readonly [number, number], domain: [number, number], note: string): Measure => ({
    key, label, value: v, display: v.toFixed(2), band: [band[0], band[1]], bandText: rangeNum(band), domain, note,
  });
  const shape: Measure[] = [
    num("eyeGap", "眼距 / 眼宽", a.intercanthal_to_eye_width, BANDS.eyeGap, [0.6, 1.4], "五眼中间一段"),
    num("lengthWidth", "脸部长宽比", a.face_length_width_ratio, BANDS.lengthWidth, [1.0, 1.7], "脸长 ÷ 颧骨处脸宽"),
    num("forehead", "额宽 / 颧宽", a.width_profile.forehead / (a.width_profile.cheekbone || 1), BANDS.forehead, [0.6, 1.2], "额头相对颧骨"),
    num("jaw", "下颌宽 / 颧宽", a.width_profile.jaw / (a.width_profile.cheekbone || 1), BANDS.jaw, [0.5, 1.1], "下颌相对颧骨"),
  ];
  return { thirds, shape, upperMissing };
}

// --- face shape --------------------------------------------------------------------------------------------

const JAW_DEF: Record<string, string> = { soft: "下颌线条柔和", moderate: "下颌线条适中", defined: "下颌线条清晰" };
const JAW_SHAPE: Record<string, string> = { rounded: "转角圆润", tapered: "向下巴收窄", angular: "转角有棱线", square: "下颌偏方" };
const CHEEK: Record<string, string> = { flat: "颧骨平缓", moderate: "颧骨适中", prominent: "颧骨立体" };

export function faceShape(p: Passport) {
  const label = p.derived.display_labels.face_shape;
  const fs = p.analysis.face_structure;
  const candidates = [...fs.shape_candidates]
    .sort((x, y) => y.probability - x.probability)
    .map((c) => ({ key: c.label, name: faceNameZh(c.label), probability: c.probability, primary: c.label === label.label }));
  return {
    title: label.ambiguous_with ? `介于${label.label_zh}与${faceNameZh(label.ambiguous_with)}之间` : label.label_zh,
    candidates,
    traits: [JAW_DEF[fs.jawline.definition], JAW_SHAPE[fs.jawline.shape], CHEEK[fs.cheekbones]].filter(Boolean) as string[],
  };
}

// --- "你的特点" → "所以" ----------------------------------------------------------------------------------

/** Region / feature → the recommendation page it informs (fallback when no recommendation cites the evidence). */
export const REGION_PAGE: Record<string, string> = {
  hair: "hair", hairline: "hair", forehead: "hair", crown: "hair",
  lip: "makeup", lips: "makeup", cheek: "makeup", cheekbone: "makeup", brow: "makeup", brows: "makeup",
  eye: "makeup", eyes: "makeup", nose: "makeup",
  skin: "color",
  jaw: "outfit", chin: "outfit", neck: "outfit",
  overall: "style",
};
export const PAGE_ZH: Record<string, string> = {
  hair: "发型", makeup: "妆容", color: "色彩", outfit: "穿搭", glasses: "眼镜", style: "风格", plan: "计划",
};
const FEATURE_ZH: Record<string, string> = {
  eyes: "眼睛", brows: "眉毛", nose: "鼻子", lips: "嘴唇", forehead: "额头", chin: "下巴", hairline: "发际线", neck: "颈部",
};

export interface SoLink { href: string; label: string; detail?: string }
export interface Trait { key: string; title: string; text?: string; evidence: string[]; so: SoLink[] }

function soLinks(p: Passport, id: string, evidenceIds: string[], region: string): SoLink[] {
  const ev = new Set(evidenceIds);
  const recs = rankedRecs(p).filter((r) => p.analysis.recommendations.find((x) => x.id === r.id)?.evidence.some((e) => ev.has(e)));
  const seen = new Set<string>();
  const out: SoLink[] = [];
  for (const r of recs) {
    const page = CATEGORY_PAGE[r.category] ?? "plan";
    if (seen.has(page)) continue;
    seen.add(page);
    out.push({ href: `/p/${id}/${page}`, label: CATEGORY_ZH[r.category] ?? PAGE_ZH[page], detail: r.action });
    if (out.length === 2) break;
  }
  if (!out.length) {
    const page = REGION_PAGE[region] ?? "plan";
    out.push({ href: `/p/${id}/${page}`, label: PAGE_ZH[page] ?? page });
  }
  return out;
}

export function traits(p: Passport, id: string): { signature: Trait[]; features: Trait[] } {
  const obs = new Map(p.analysis.observations.map((o) => [o.id, o]));
  const texts = (ids: readonly string[]) => ids.map((i) => obs.get(i)?.text).filter((x): x is string => Boolean(x));
  const signature = p.analysis.feature_signature.map((f, i) => ({
    key: `sig${i}`, title: f.title, text: f.styling_implication, evidence: texts(f.observation_ids),
    so: soLinks(p, id, [...f.observation_ids], f.region),
  }));
  const features = p.analysis.feature_characteristics.map((f) => ({
    key: f.feature, title: FEATURE_ZH[f.feature] ?? f.feature, text: f.descriptors.join("、"), evidence: texts(f.evidence),
    so: soLinks(p, id, [...f.evidence], f.feature),
  }));
  return { signature, features };
}
