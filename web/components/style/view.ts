/** Passport → style-page view (A7 · F8 four layers, D25).
 *
 *  Pure mapping, no React. Kept next to the page because web/lib/adapters is shared; it can move there unchanged.
 *  ① 你的特征  = analysis.style_dimensions.{visual_weight, angular_rounded} + the observations they cite
 *  ② 看起来像  = derived.style_profile face_only / overall / radius / primary / secondary / between
 *  ③ 你喜欢    = derived.style_profile.preference_overlay.liked / disliked
 *  ④ 你想去    = derived.style_profile.preference_overlay.target
 */
import { confidenceLevel, obsById, styleName, type ConfidenceLevel } from "@/lib/adapters";
import type { Passport } from "@/lib/api";

export type StyleKey = Passport["derived"]["style_profile"]["primary"];
export interface Pt { x: number; y: number }

/** Plane words, same axes as StylePlane: x = 量感 1..5, y = 曲直 −2 (直) … +2 (曲). Display bands only. */
export function weightWord(x: number): string {
  if (x < 1.8) return "量感偏小";
  if (x < 2.5) return "量感中等偏小";
  if (x <= 3.3) return "量感中等";
  if (x < 4.0) return "量感中等偏大";
  return "量感偏大";
}
export function lineWord(y: number): string {
  if (y <= -1.0) return "线条偏直";
  if (y < -0.3) return "线条略偏直";
  if (y <= 0.3) return "曲直均衡";
  if (y < 1.0) return "线条略偏柔和";
  return "线条偏柔和";
}

/** How to get from one plane point to another, in words (used for target and for overall vs face). */
export function moveWords(from: Pt, to: Pt, eps = 0.3): string[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const out: string[] = [];
  if (dx > eps) out.push("量感加大一些");
  else if (dx < -eps) out.push("量感收小一些");
  if (dy > eps) out.push("多一点曲线与柔和感");
  else if (dy < -eps) out.push("多一点直线与利落感");
  return out;
}

export interface FeatureRow {
  key: "visual_weight" | "angular_rounded";
  axis: string;
  word: string;
  value: number;
  evidence: { id: string; text: string }[];
}

export interface StyleView {
  names: { key: StyleKey; name: string }[];
  features: FeatureRow[];
  looks: {
    primary: { key: StyleKey; name: string };
    secondary: { key: StyleKey; name: string };
    between: boolean;
    region: string;
    confidence: ConfidenceLevel;
    radius: number;
    face: Pt;
    overall: Pt | null;
    overallWords: string[];
    frame: string | null;
  };
  liked: { key: StyleKey; name: string }[];
  disliked: { key: StyleKey; name: string }[];
  target: { key: StyleKey; name: string; words: string[] } | null;
  rules: { key: string; label: string; text: string }[];
  note: string | null;
}

const RULE_LABELS: [string, string][] = [
  ["fabric", "面料"], ["silhouette", "廓形"], ["pattern", "图案"], ["accessories", "配饰"], ["neckline", "领口"],
  ["hair_hint", "发型"], ["makeup_hint", "妆容"],
];
const FRAME_ZH: Record<string, string> = { straight: "直线型", wave: "曲线型", natural: "自然型" };

export function styleView(p: Passport): StyleView {
  const s = p.derived.style_profile;
  const dims = p.analysis.style_dimensions;
  const named = (key: StyleKey) => ({ key, name: styleName(p, key) });
  const evidence = (ids: string[]) =>
    ids.map((id) => obsById(p, id)).filter((o): o is NonNullable<typeof o> => Boolean(o)).map((o) => ({ id: o.id, text: o.text }));
  const features: FeatureRow[] = [
    { key: "visual_weight", axis: "量感", word: weightWord(dims.visual_weight.value), value: dims.visual_weight.value,
      evidence: evidence(dims.visual_weight.evidence) },
    { key: "angular_rounded", axis: "曲直", word: lineWord(dims.angular_rounded.value), value: dims.angular_rounded.value,
      evidence: evidence(dims.angular_rounded.evidence) },
  ];
  const frameKey = p.user_context.body?.frame ?? null;
  const frame = frameKey ? FRAME_ZH[frameKey] ?? null : null;
  const moved = Math.abs(s.overall.x - s.face_only.x) + Math.abs(s.overall.y - s.face_only.y) > 1e-6;
  const conf = Math.min(dims.visual_weight.confidence, dims.angular_rounded.confidence, p.derived.display_labels.style.confidence);
  const t = s.preference_overlay.target;
  const tp = t ? s.prototypes.find((x) => x.key === t) : undefined;
  return {
    names: s.prototypes.map((x) => ({ key: x.key, name: x.name_zh })),
    features,
    looks: {
      primary: named(s.primary),
      secondary: named(s.secondary),
      between: s.between,
      region: `${lineWord(s.face_only.y)} · ${weightWord(s.face_only.x)}`,
      confidence: confidenceLevel(conf),
      radius: s.radius,
      face: s.face_only,
      overall: frame || moved ? s.overall : null,
      overallWords: frame || moved ? moveWords(s.face_only, s.overall, 0.1) : [],
      frame,
    },
    liked: s.preference_overlay.liked.map(named),
    disliked: s.preference_overlay.disliked.map(named),
    target: t && tp ? { ...named(t), words: moveWords(s.face_only, { x: tp.x, y: tp.y }) } : null,
    rules: RULE_LABELS.filter(([k]) => s.rules_zh[k]).map(([key, label]) => ({ key, label, text: s.rules_zh[key] })),
    note: p.derived.feedback_applied.note_zh ?? null,
  };
}
