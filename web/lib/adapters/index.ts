/** passport → plain props for the K4 design system, K5 tint and K6 cards (T05).
 * Components never import web/lib/passport.ts; pages call these pure functions instead. */
import type { IllustratedAvatarProps, ProfileCardProps, StylistCardProps } from "@/components/cards";
import type { StylePlaneProps, SwatchColor } from "@/components/ds";
import type { Passport, PassportResponse, PreviewState } from "../passport";

type Analysis = Passport["analysis"];
type HairOption = Analysis["hair_options"][number];
export type Tier = HairOption["tier"];
export type ConfidenceLevel = "high" | "medium" | "low";

export const TIER_ZH: Record<Tier, string> = { safe: "稳妥", bold: "突破", easy: "省心" };
export const LENGTH_ZH: Record<string, string> = {
  buzz: "寸头", very_short: "超短", short: "短发", ear: "齐耳", chin: "下巴", collarbone: "锁骨", shoulder: "及肩", chest: "胸前",
};
export const FRINGE_ZH: Record<string, string> = {
  none: "无刘海", air: "空气刘海", curtain: "八字刘海", blunt: "齐刘海", side: "侧分刘海", light: "碎刘海", swept: "斜刘海",
};
export const CURL_ZH: Record<string, string> = {
  straight: "直发", c_curl: "内扣 C 卷", french_wave: "法式波浪", wool: "羊毛卷", natural: "自然卷度",
};
export const REQUIRES_ZH: Record<string, string> = { perm: "需要烫发", dye: "需要染发", grow_out: "需要留长", straighten: "需要拉直" };
export const COST_ZH: Record<string, string> = { free: "免费", low: "低花费", medium: "中等花费", high: "较高花费" };
export const TIME_ZH: Record<string, string> = { today: "今天就能做", next_haircut: "下次剪发", weeks: "几周内", months: "几个月" };
export const CATEGORY_ZH: Record<string, string> = {
  hairstyle: "发型", brows: "眉形", glasses: "眼镜", facial_hair: "胡须", makeup: "妆容", color_palette: "色彩",
  clothing: "穿搭", accessories: "配饰", photo_presentation: "拍照",
};
/** Recommendation category → the /p/[id]/<sub> page that explains it. */
export const CATEGORY_PAGE: Record<string, string> = {
  hairstyle: "hair", brows: "makeup", glasses: "glasses", facial_hair: "makeup", makeup: "makeup", color_palette: "color",
  clothing: "outfit", accessories: "outfit", photo_presentation: "plan",
};

/** Model text may cite observation ids ("（o7）", "(o3、o6)"); they are provenance, not copy. Display only. */
export const stripRefs = (t: string) => t.replace(/\s*[（(]\s*o\d+(?:\s*[、,，/]\s*o\d+)*\s*[)）]/g, "").trim();

/** analysis effort 1–5 → a plain word (how much work it takes, not how good it is). */
export const EFFORT_ZH = (effort: number) => (effort <= 2 ? "投入低" : effort <= 3 ? "投入中等" : "投入较高");

export function confidenceLevel(x: number): ConfidenceLevel {
  return x >= 0.7 ? "high" : x >= 0.5 ? "medium" : "low";
}

export const recById = (p: Passport, id: string) => p.analysis.recommendations.find((r) => r.id === id) ?? null;
export const obsById = (p: Passport, id: string) => p.analysis.observations.find((o) => o.id === id) ?? null;
export const styleName = (p: Passport, key: string | null | undefined) =>
  key ? p.derived.style_profile.names_zh[key] ?? key : "";

// --- cover / first layer -------------------------------------------------------------------------------------

export function cover(p: Passport) {
  const s = p.derived.style_profile;
  return {
    oneLiner: p.analysis.profile_summary.one_liner,
    bestDirection: p.analysis.profile_summary.best_direction,
    signature: p.analysis.feature_signature.map((f) => ({ title: f.title, implication: f.styling_implication, region: f.region })),
    styleLine: s.between ? `${styleName(p, s.primary)}，靠近${styleName(p, s.secondary)}` : styleName(p, s.primary),
  };
}

export function triptych(p: Passport) {
  const d = p.derived;
  const face = d.display_labels.face_shape;
  const color = d.display_labels.color;
  const s = d.style_profile;
  return {
    face: {
      key: "face" as const,
      value: face.ambiguous_with ? `${face.label_zh}（也接近${faceNameZh(face.ambiguous_with)}）` : face.label_zh,
      note: p.analysis.feature_signature[0]?.title ?? "",
      confidence: confidenceLevel(face.probability),
    },
    color: {
      key: "color" as const,
      value: color.summary_zh,
      note: d.display_labels.seasonal_leaning?.text_zh ?? "",
      swatches: colorGroups(p)[0].colors.slice(0, 4).map((c) => c.hex),
      confidence: confidenceLevel(color.confidence),
    },
    style: {
      key: "style" as const,
      value: s.between ? `${styleName(p, s.primary)} · ${styleName(p, s.secondary)}之间` : styleName(p, s.primary),
      note: "描述视觉印象的风格方向",
      confidence: confidenceLevel(d.display_labels.style.confidence),
    },
  };
}

const FACE_ZH: Record<string, string> = {
  oval: "椭圆脸", oblong: "长脸", round: "圆脸", square: "方脸", rectangle: "长方脸", heart: "心形脸", diamond: "菱形脸", triangle: "梨形脸",
};
export const faceNameZh = (label: string) => FACE_ZH[label] ?? label;

/** The single most useful next step (rank 1 after feedback). */
export function firstThing(p: Passport) {
  const id = p.derived.top5[0];
  const r = id ? recById(p, id) : null;
  if (!r) return null;
  return { id: r.id, action: stripRefs(r.action), why: stripRefs(r.why), successCheck: r.success_check, category: r.category,
    page: CATEGORY_PAGE[r.category] ?? "plan", cost: COST_ZH[r.cost_band], time: TIME_ZH[r.time_to_effect] };
}

export function rankedRecs(p: Passport) {
  return p.derived.ranked_recommendations
    .map((x) => ({ rank: x.rank, rec: recById(p, x.rec_id) }))
    .filter((x): x is { rank: number; rec: Analysis["recommendations"][number] } => x.rec !== null)
    .map(({ rank, rec }) => ({
      rank, id: rec.id, category: rec.category, categoryZh: CATEGORY_ZH[rec.category] ?? rec.category, action: stripRefs(rec.action),
      why: stripRefs(rec.why), howTo: rec.how_to.map(stripRefs), cost: COST_ZH[rec.cost_band], time: TIME_ZH[rec.time_to_effect],
      successCheck: rec.success_check, page: CATEGORY_PAGE[rec.category] ?? "plan", inTop5: p.derived.top5.includes(rec.id),
      effect: stripRefs(rec.expected_effect), avoid: stripRefs(rec.avoid), effort: EFFORT_ZH(rec.effort), costBand: rec.cost_band,
      timeBand: rec.time_to_effect, evidence: rec.evidence.map((o) => obsById(p, o)?.text).filter((t): t is string => Boolean(t)),
    }));
}

// --- color ------------------------------------------------------------------------------------------------------

type Families = Analysis["color_profile"]["favor_families"];
const toSwatches = (families: Families): SwatchColor[] =>
  families.flatMap((f) => f.hex_examples.map((hex, i) => ({ hex, name_zh: f.hex_examples.length > 1 ? `${f.name}${i + 1}` : f.name })));

export function colorGroups(p: Passport): { key: "favor" | "neutral" | "caution"; title: string; colors: SwatchColor[]; reasons: string[] }[] {
  const cp = p.analysis.color_profile;
  return [
    { key: "favor", title: "近脸色", colors: toSwatches(cp.favor_families), reasons: cp.favor_families.map((f) => `${f.name}：${f.reason}`) },
    { key: "neutral", title: "衣橱底色", colors: toSwatches(cp.neutral_families), reasons: cp.neutral_families.map((f) => `${f.name}：${f.reason}`) },
    { key: "caution", title: "慎用", colors: toSwatches(cp.caution_families), reasons: cp.caution_families.map((f) => `${f.name}：${f.reason}`) },
  ];
}

export const searchPhrase = (colorName: string, item: string) => `${colorName} ${item}`;

// --- style plane ---------------------------------------------------------------------------------------------

export function stylePlane(p: Passport): StylePlaneProps {
  const s = p.derived.style_profile;
  const proto = new Map(s.prototypes.map((x) => [x.key, x]));
  const liked = s.preference_overlay.liked.map((k) => proto.get(k)).filter(Boolean) as { x: number; y: number }[];
  const target = s.preference_overlay.target ? proto.get(s.preference_overlay.target) : undefined;
  return {
    prototypes: s.prototypes.map((x) => ({ key: x.key, name: x.name_zh, x: x.x, y: x.y })),
    me: { x: s.face_only.x, y: s.face_only.y, r: s.radius },
    preference: liked.length
      ? { x: liked.reduce((a, b) => a + b.x, 0) / liked.length, y: liked.reduce((a, b) => a + b.y, 0) / liked.length }
      : undefined,
    target: target ? { x: target.x, y: target.y } : undefined,
    between: s.between ? [styleName(p, s.primary), styleName(p, s.secondary)] : undefined,
  };
}

// --- hair ------------------------------------------------------------------------------------------------------

export const VOLUME_ZH: Record<string, string> = { low: "贴顺", moderate: "适中", high: "蓬松", tight: "收紧", controlled: "适度", full: "饱满" };
export const PART_ZH: Record<string, string> = { none: "不分线", center: "中分", soft_off_center: "微偏分", side: "侧分", deep_side: "深侧分" };
/** One line on what each direction is for (tier semantics from analysis.schema: hair_options[].tier). */
export const TIER_ROLE_ZH: Record<Tier, string> = {
  safe: "离现在最近，改动小、最稳妥",
  bold: "一次明显的变化，换一种印象",
  easy: "打理最省事，适合忙的时候",
};

export interface HairOptionView {
  tier: Tier;
  tierZh: string;
  role: string;
  name: string;
  /** Why it suits this face: the observations this direction cites (analysis.hair_options[].evidence). */
  why: string[];
  params: { label: string; value: string }[];
  minutes: number;
  trimWeeks: number;
  maintenanceNote: string;
  requires: string[];
  scripts: string[];
  avoid: string;
  status: "ok" | "warn" | "excluded";
  issues: string[];
  rank: number;
  preview: PreviewState | null;
}

export function hairOptions(p: Passport, previews: PreviewState[] = []): HairOptionView[] {
  const checks = new Map(p.derived.hair_option_checks.map((c) => [c.tier, c]));
  return p.analysis.hair_options
    .map((o) => {
      const c = checks.get(o.tier);
      const params = [
        { label: "长度", value: LENGTH_ZH[o.params.length] ?? o.params.length },
        { label: "刘海", value: FRINGE_ZH[o.params.fringe] ?? o.params.fringe },
        { label: "卷度", value: CURL_ZH[o.params.curl] ?? o.params.curl },
        { label: "发色", value: o.params.color === "keep" ? "保持现有发色" : o.params.color },
      ];
      const vol = [o.params.top_volume && `顶部${VOLUME_ZH[o.params.top_volume]}`, o.params.side_volume && `两侧${VOLUME_ZH[o.params.side_volume]}`].filter(Boolean);
      if (vol.length) params.push({ label: "体积", value: vol.join(" · ") });
      if (o.params.part) params.push({ label: "分线", value: PART_ZH[o.params.part] ?? o.params.part });
      const why = o.evidence.map((id) => obsById(p, id)?.text).filter((t): t is string => Boolean(t)).slice(0, 2);
      return {
        tier: o.tier, tierZh: TIER_ZH[o.tier], role: TIER_ROLE_ZH[o.tier], name: o.name_zh, why, params,
        minutes: o.maintenance.daily_minutes, trimWeeks: o.maintenance.trim_weeks, maintenanceNote: o.maintenance.note,
        requires: o.requires.map((r) => REQUIRES_ZH[r] ?? r), scripts: [...o.barber_script], avoid: o.avoid,
        status: c?.status ?? "ok", issues: c?.issues ?? [], rank: c?.rank ?? 9,
        preview: previews.find((x) => x.kind === "hair" && x.target_id === o.tier) ?? null,
      };
    })
    .sort((a, b) => a.rank - b.rank);
}

const AVATAR_LENGTH: Record<string, string> = {
  buzz: "short", very_short: "short", short: "short", ear: "ear", chin: "chin", collarbone: "collarbone", shoulder: "shoulder", chest: "chest",
};

export function avatarProps(p: Passport, tier: Tier = "safe"): IllustratedAvatarProps {
  const opt = p.analysis.hair_options.find((o) => o.tier === tier) ?? p.analysis.hair_options[0];
  const hairHex = p.analysis.color_profile.hair_color_directions[0]?.hex ?? "#3B2A24";
  const pres = p.user_context.presentation === "androgynous" ? "neutral" : p.user_context.presentation;
  return {
    hair: { length: AVATAR_LENGTH[opt?.params.length ?? "collarbone"] ?? "collarbone", fringe: opt?.params.fringe ?? "none",
      curl: opt?.params.curl ?? "straight", colorHex: hairHex },
    palette: colorGroups(p)[0].colors.map((c) => c.hex).slice(0, 4),
    presentation: pres,
  };
}

export function profileCardProps(
  p: Passport,
  opts: { mode: "avatar" | "palette" | "portrait"; shortLink: string; portraitSrc?: string | null },
): ProfileCardProps {
  const t = triptych(p);
  const s = p.derived.style_profile;
  const base = {
    summary: p.analysis.profile_summary.one_liner,
    face: [t.face.value, ...p.analysis.feature_signature.slice(0, 2).map((f) => f.title)],
    color: { name: t.color.value, swatches: colorGroups(p)[0].colors.map((c) => c.hex).slice(0, 5) },
    style: { name: cover(p).styleLine, plane: { x: s.face_only.x, y: s.face_only.y } },
    shortLink: opts.shortLink,
    avatar: (({ palette: _palette, ...rest }) => rest)(avatarProps(p)),
  };
  if (opts.mode === "portrait" && opts.portraitSrc) return { ...base, mode: "portrait", portraitSrc: opts.portraitSrc };
  return { ...base, mode: opts.mode === "portrait" ? "avatar" : opts.mode };
}

export function stylistCardProps(p: Passport, tier: Tier, opts: { previewSrc?: string | null; hideFace?: boolean; shortLink?: string } = {}): StylistCardProps | null {
  const view = hairOptions(p).find((h) => h.tier === tier);
  const opt = p.analysis.hair_options.find((o) => o.tier === tier);
  if (!view || !opt || opt.barber_script.length !== 3) return null;
  return {
    styleName: view.name,
    scripts: [opt.barber_script[0], opt.barber_script[1], opt.barber_script[2]],
    params: Object.fromEntries([...view.params.map((x) => [x.label, x.value]), ["每天打理", `${view.minutes} 分钟`], ["修剪周期", `${view.trimWeeks} 周`]]),
    avoid: [view.avoid, ...p.analysis.hair_direction.avoid].filter(Boolean).slice(0, 3),
    previewSrc: opts.previewSrc ?? undefined,
    hideFace: opts.hideFace ?? true,
    shortLink: opts.shortLink,
    avatar: avatarProps(p, tier),
  };
}

/** The concise brief for the hairstylist (V2.1 §5.3): three instructions, what to avoid, upkeep — also as plain text. */
export function stylistBrief(p: Passport, tier: Tier) {
  const view = hairOptions(p).find((h) => h.tier === tier);
  const opt = p.analysis.hair_options.find((o) => o.tier === tier);
  if (!view || !opt) return null;
  const avoid = [opt.avoid, ...p.analysis.hair_direction.avoid].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).slice(0, 3);
  const upkeep = `每天约 ${view.minutes} 分钟 · 每 ${view.trimWeeks} 周修剪${view.maintenanceNote ? ` · ${view.maintenanceNote}` : ""}`;
  const keep = p.analysis.hair_direction.keep.slice(0, 2);
  const text = [
    `【发型沟通】${view.name}`,
    ...opt.barber_script.map((s, i) => `${i + 1}. ${s}`),
    `参数：${view.params.map((x) => `${x.label}${x.value}`).join("，")}`,
    keep.length ? `保留：${keep.join("、")}` : "",
    avoid.length ? `请避免：${avoid.join("；")}` : "",
    `打理：${upkeep}`,
    view.requires.length ? `需要：${view.requires.join("、")}` : "",
  ].filter(Boolean).join("\n");
  return { tier, name: view.name, tierZh: view.tierZh, scripts: [...opt.barber_script], avoid, keep, upkeep, requires: view.requires, text };
}

// --- reveal ---------------------------------------------------------------------------------------------------

export function revealMeasurements(r: PassportResponse): { label: string; value: string }[] {
  const a = r.partial.anchors;
  if (!a) return [];
  const out = [{ label: "脸部长宽比", value: a.face_length_width_ratio.toFixed(2) }];
  out.push({ label: "额 · 颧 · 颌", value: `${a.width_profile.forehead.toFixed(2)} · 1.00 · ${a.width_profile.jaw.toFixed(2)}` });
  if (a.thirds) {
    out.push({
      label: "三庭",
      value: a.thirds.upper == null
        ? `上庭未测量 · ${Math.round(a.thirds.middle * 100)}% · ${Math.round(a.thirds.lower * 100)}%`
        : `${Math.round(a.thirds.upper * 100)}% · ${Math.round(a.thirds.middle * 100)}% · ${Math.round(a.thirds.lower * 100)}%`,
    });
  }
  out.push({ label: "眼距 / 眼宽", value: a.intercanthal_to_eye_width.toFixed(2) });
  return out;
}

export function shortLinkFor(origin: string, shareToken: string | null, passportId: string) {
  return shareToken ? `${origin}/s/${shareToken}` : `${origin}/p/${passportId}`;
}

// --- AI 面部美学参考分 (Issue #31, D36) --------------------------------------------------------------------------

export type ScoreState = "scored" | "limited" | "unavailable";
export interface ScoreComponentView {
  key: "symmetry" | "thirds" | "fifths" | "golden_ratio";
  name: string;
  about: string;
  weightPct: number;
  /** Rounded 0–100, or null when this part could not be measured on the photo. */
  score: number | null;
  /** The measured geometry behind the number, in words. */
  detail: string;
}
export interface ScoreView {
  state: ScoreState;
  name: string;
  /** Rounded overall 0–100; null unless all four parts were measured. */
  score: number | null;
  tier: string | null;
  statusText: string;
  scaleNote: string;
  flags: string[];
  components: ScoreComponentView[];
  strengths: string[];
  improvement: { component: string; text: string } | null;
  version: string;
}

const pct = (x: number) => Math.round(x * 100);

function componentDetail(key: ScoreComponentView["key"], m: Record<string, unknown> | null | undefined): string {
  if (!m) return "未测量";
  if (key === "symmetry") return `测得平均偏差 ${((m.mean_residual as number) * 100).toFixed(1)}%（${m.pairs as number} 对）`;
  if (key === "thirds") {
    const [u, mi, lo] = m.shares as number[];
    return `测得 ${pct(u)} / ${pct(mi)} / ${pct(lo)}`;
  }
  if (key === "fifths") return `测得 ${(m.segments_eye_widths as number[]).map((x) => x.toFixed(2)).join(" · ")} 个眼宽`;
  return `测得 ${(m.ratio as number).toFixed(2)}`;
}

/** passport.aesthetic_score → plain props for the score hero. null when the passport predates schema 0.6. */
export function aestheticScore(p: Passport): ScoreView | null {
  const s = p.aesthetic_score;
  if (!s) return null;
  const names = Object.fromEntries(s.components.map((c) => [c.key, c.name_zh]));
  return {
    state: s.status === "full" ? "scored" : s.status,
    name: s.copy_zh.name,
    score: s.overall_score == null ? null : Math.round(s.overall_score),
    tier: s.tier?.label_zh ?? null,
    statusText: s.copy_zh.status,
    scaleNote: s.copy_zh.scale_note,
    flags: s.quality_flags.map((f) => s.copy_zh.flags[f]).filter((x): x is string => Boolean(x)),
    components: s.components.map((c) => ({
      key: c.key, name: c.name_zh, about: c.about_zh, weightPct: Math.round(c.weight * 100),
      score: c.score == null ? null : Math.round(c.score),
      detail: componentDetail(c.key, c.measured as Record<string, unknown> | null),
    })),
    strengths: s.strengths.map((x) => x.text_zh),
    improvement: s.improvement ? { component: names[s.improvement.component] ?? "", text: s.improvement.text_zh } : null,
    version: s.scoring_version,
  };
}

// --- Reference-cohort position (Issue #41) -----------------------------------------------------------------------

export interface CohortView { n: number; date: string; publisher: string; url: string; kind?: string }
export interface RankView {
  title: string;
  /** "ranked" if an authorized source-aligned rank or labeled provisional academic estimate exists. */
  state: "ranked" | "unavailable";
  /** e.g. 参考扫描人群中约前 30% — approximate, from published aggregates. */
  label: string | null;
  higherThan: string | null;
  /** Why there is no position (calibration gap, limited photo, no score). */
  reason: string | null;
  note: string | null;
  cohort: CohortView | null;
}

/** passport.reference_percentiles.rank → hero props. null on passports older than schema 0.7. */
export function referenceRank(p: Passport): RankView | null {
  const r = p.reference_percentiles;
  if (!r) return null;
  const k = r.rank;
  const ranked = k.status === "ok";
  return {
    title: r.copy_zh.rank_title,
    state: ranked ? "ranked" : "unavailable",
    label: ranked ? k.label_zh ?? null : null,
    higherThan: ranked ? k.higher_than_zh ?? null : null,
    reason: ranked ? null : k.reason_zh ?? null,
    note: k.note_zh ?? null,
    cohort: k.cohort ? { n: k.cohort.n, date: k.cohort.source_date, publisher: k.cohort.publisher.split(" (")[0], url: k.cohort.source_url, kind: k.cohort.kind } : null,
  };
}

export interface RatioRailView {
  id: string;
  name: string;
  value: string;
  /** Rounded percentile 0–100 within the reference scans (position only, not quality). */
  pct: number;
  band: string;
  text: string;
  /** Published p5 / p50 / p95 for the rail labels, formatted like `value`. */
  p5: string; p50: string; p95: string;
  unit: "deg" | "ratio" | "fraction";
}
export interface RatiosView { title: string; rails: RatioRailView[]; unverifiedNote: string | null; note: string; attribution: string; sourceUrl: string }

const fmtRatio = (v: number, unit: RatioRailView["unit"]) =>
  unit === "fraction" ? `${Math.round(v * 100)}%` : unit === "deg" ? `${v.toFixed(1)}°` : v.toFixed(2);

/** Only rails with a verified definition and a measured value are returned; the rest are summarised in one note. */
export function referenceRatios(p: Passport): RatiosView | null {
  const r = p.reference_percentiles;
  if (!r) return null;
  const rails: RatioRailView[] = r.ratios.rails
    .filter((x) => x.status === "ok" && x.value != null && x.percentile_estimate != null)
    .map((x) => ({
      id: x.id, name: x.name_zh, unit: x.unit, value: fmtRatio(x.value as number, x.unit),
      pct: x.percentile_estimate as number, band: x.band_zh ?? "", text: x.text_zh,
      p5: fmtRatio(x.rail.p5, x.unit), p50: fmtRatio(x.rail.p50, x.unit), p95: fmtRatio(x.rail.p95, x.unit),
    }));
  const unverified = r.ratios.rails.some((x) => !x.definition_verified);
  if (rails.length === 0 && !unverified) return null;
  return { title: r.copy_zh.ratios_title, rails, unverifiedNote: unverified ? r.copy_zh.ratios_unverified_note : null,
    note: r.ratios.note_zh, attribution: r.ratios.attribution, sourceUrl: r.ratios.source_url };
}
