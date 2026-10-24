/** Landing case data (A1). Every case is fictional and labeled 插画示意: two come from the committed sample passports
 * (through the T05 adapters, so the cards match what a real report renders) and one from examples/cases/*.json.
 * Runs on the server only — the passports never ship to the browser, just the plain props below. */
import type { IllustratedAvatarProps, ProfileCardProps } from "@/components/cards";
import type { SwatchColor } from "@/components/ds";
import { aestheticScore, avatarProps, colorGroups, cover, firstThing, hairOptions, profileCardProps, rankedRecs, triptych } from "@/lib/adapters";
import { common, topics } from "@/lib/copy/zh";
import { SAMPLE_IDS } from "@/lib/flags";
import { DEMO_CASES } from "@/lib/fixtures/demo_cases";
import female from "@/lib/fixtures/sample_passport.json";
import male from "@/lib/fixtures/sample_passport_male.json";
import type { Passport } from "@/lib/passport";
// Copy of examples/cases/case_illustrated.json (Turbopack cannot import outside web/); a test keeps them identical.
import illustrated from "./case_illustrated.json";

export type Topic = keyof typeof topics;
export const TOPIC_KEYS = Object.keys(topics) as Topic[];
export const isTopic = (x: string): x is Topic => (TOPIC_KEYS as string[]).includes(x);

/** Short names for the topic line (wireframe D3 · 1). */
export const TOPIC_NAMES: Record<Topic, string> = {
  face: "面部美学", hair: "脸型发型", style: "八型风格", color: "个人色彩", outfit: "穿搭",
};

export interface LandingCase {
  id: string;
  /** A sample passport to open, or null when the case only exists as a card. */
  passportId: string | null;
  label: string;
  expression: string;
  summary: string;
  face: string;
  signature: string[];
  color: string;
  favor: SwatchColor[];
  neutrals: SwatchColor[];
  style: string;
  best: string;
  hair: { tier: string; tierZh: string; name: string }[];
  avatar: IllustratedAvatarProps;
  card: ProfileCardProps;
}

const EXPRESSION: Record<string, string> = { feminine: "女性化表达", masculine: "男性化表达", neutral: "中性表达", androgynous: "中性表达" };
const CARD_LINK = "示例档案 · 插画示意";

function fromPassport(p: Passport): LandingCase {
  const t = triptych(p);
  const groups = colorGroups(p);
  return {
    id: p.passport_id,
    passportId: p.passport_id,
    label: common.syntheticExample,
    expression: EXPRESSION[p.user_context.presentation] ?? "中性表达",
    summary: cover(p).oneLiner,
    face: t.face.value,
    signature: p.analysis.feature_signature.map((f) => f.title),
    color: t.color.value,
    favor: groups[0].colors.slice(0, 4),
    neutrals: groups[1].colors.slice(0, 3),
    style: cover(p).styleLine,
    best: cover(p).bestDirection,
    hair: hairOptions(p).map((h) => ({ tier: h.tier, tierZh: h.tierZh, name: h.name })),
    avatar: avatarProps(p),
    card: profileCardProps(p, { mode: "avatar", shortLink: CARD_LINK }),
  };
}

function fromCaseFile(c: typeof illustrated): LandingCase {
  const favorHex = c.color.favor.map((x) => x.hex);
  const presentation = c.avatar.presentation as IllustratedAvatarProps["presentation"];
  return {
    id: c.id,
    passportId: null,
    label: c.label,
    expression: c.expression,
    summary: c.summary,
    face: c.face,
    signature: c.signature,
    color: c.color.name,
    favor: c.color.favor,
    neutrals: c.color.neutrals,
    style: c.style.name,
    best: c.best_direction,
    hair: c.hair.map((h) => ({ tier: h.tier, tierZh: h.tier_zh, name: h.name })),
    avatar: { hair: c.avatar.hair, palette: favorHex, presentation },
    card: {
      mode: "avatar",
      summary: c.summary,
      face: [c.face, ...c.signature.slice(0, 2)],
      color: { name: c.color.name, swatches: [...favorHex, c.color.neutrals[0].hex] },
      style: c.style,
      shortLink: CARD_LINK,
      avatar: { hair: c.avatar.hair, presentation },
    },
  };
}

/** Female first (the primary audience), then male and neutral expression. */
export const LANDING_CASES: LandingCase[] = [
  fromPassport(female as unknown as Passport),
  fromPassport(male as unknown as Passport),
  fromCaseFile(illustrated),
];

export const heroCase = LANDING_CASES[0];
export const SAMPLE_HREF = `/p/${SAMPLE_IDS.female}`;

export interface HeroRow { label: string; value?: string; swatches?: SwatchColor[] }

/** The first-screen example: the same case, with the rows that answer the topic the visitor came for. */
export function heroRows(c: LandingCase, topic?: Topic | null): HeroRow[] {
  switch (topic) {
    case "face":
      return [{ label: "脸型", value: c.face }, ...c.signature.slice(0, 2).map((s, i) => ({ label: i ? "" : "特点", value: s }))];
    case "hair":
      return c.hair.map((h) => ({ label: h.tierZh, value: h.name }));
    case "style":
      return [{ label: "风格", value: c.style }, { label: "依据", value: c.signature[0] }, { label: "方向", value: c.best }];
    case "color":
      return [{ label: "色彩", value: c.color }, { label: "近脸色", swatches: c.favor }, { label: "衣橱底色", swatches: c.neutrals }];
    case "outfit":
      return [{ label: "方向", value: c.best }, { label: "风格", value: c.style }, { label: "衣橱底色", swatches: c.neutrals }];
    default:
      return [{ label: "面部", value: c.face }, { label: "色彩", value: c.color, swatches: c.favor }, { label: "风格", value: c.style }];
  }
}

/** Keep `ref` short and URL-safe (same rule as the upload page). */
export function cleanRef(raw: unknown): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (typeof v !== "string") return null;
  return v.replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 64) || null;
}

export function startHref(topic?: Topic | null, ref?: string | null): string {
  const q = new URLSearchParams();
  if (topic) q.set("topic", topic);
  if (ref) q.set("ref", ref);
  const s = q.toString();
  return s ? `/start?${s}` : "/start";
}

// --- "你会看见" -------------------------------------------------------------------------------------------------

export interface Showcase {
  hair: { tierZh: string; name: string; avatar: IllustratedAvatarProps }[];
  lip: { text: string; shades: string[] };
  drape: { label: string; color: SwatchColor; avatar: IllustratedAvatarProps }[];
  outfit: { title: string; pieces: string[]; search: string | null };
}

function buildShowcase(p: Passport): Showcase {
  const groups = colorGroups(p);
  const base = avatarProps(p, "safe");
  const views = new Map(hairOptions(p).map((h) => [h.tier, h]));
  const hair = (["safe", "bold", "easy"] as const).flatMap((tier) => {
    const v = views.get(tier);
    return v ? [{ tierZh: v.tierZh, name: v.name, avatar: avatarProps(p, tier) }] : [];
  });
  const md = p.analysis.makeup_direction;
  const pinks = groups[0].colors.filter((c) => c.name_zh.includes("粉")).map((c) => c.hex);
  const shades = [...new Set([md.blush?.hex, ...pinks, ...groups[0].colors.map((c) => c.hex)]
    .filter((x): x is string => Boolean(x)))].slice(0, 3);
  const drapeOf = (label: string, color: SwatchColor | undefined) =>
    color ? [{ label, color, avatar: { ...base, palette: [color.hex, ...base.palette.slice(1)] } }] : [];
  const formula = p.analysis.outfit_direction.formulas[0];
  return {
    hair,
    lip: { text: md.lip ?? "", shades },
    drape: [...drapeOf("近脸色", groups[0].colors[0]), ...drapeOf("衣橱底色", groups[1].colors[0]), ...drapeOf("慎用", groups[2].colors[0])],
    outfit: { title: formula?.title ?? "", pieces: formula?.pieces ?? [], search: p.derived.outfit_checks.items[0]?.search_zh ?? null },
  };
}

export const SHOWCASE: Showcase = buildShowcase(female as unknown as Passport);

/** The landing score demo: the female sample passport's score, computed by the production scorer on the synthetic
 * (canonical-mesh) sample face — not a hand-written number. */
export const SAMPLE_SCORE = aestheticScore(female as unknown as Passport);
export const SAMPLE_SCORE_HREF = `/p/${SAMPLE_IDS.female}`;

/** The first-screen deliverable (Issue #2): the same synthetic sample passport the visitor can open — its drawn face,
 * its computed score and its first action. Read from the passport, never hand-written. */
export const HERO_SAMPLE = {
  /** The program-drawn synthetic portrait (no photo of a real person is ever involved). */
  portrait: "/sample/portrait.svg",
  score: SAMPLE_SCORE,
  firstAction: firstThing(female as unknown as Passport)?.action ?? null,
};

/** Landing preview of the full sample report (Issue #33): one real line per chapter, read from the sample passport. */
export const SAMPLE_REPORT_HREF = "/report/sample";
/** The landing's report preview summarises the first pipeline-backed sample (Issue #14), the same one
 *  /report/sample opens by default. */
export function sampleReportPreview(p: Passport = DEMO_CASES[0].passport) {
  const score = aestheticScore(p);
  const cov = p.measurement_profile?.coverage;
  const recs = rankedRecs(p);
  const plan = p.derived.plan;
  return {
    overview: score?.score != null ? `参考分 ${score.score} · ${score.tier ?? ""} · 四项构成` : "参考分与四项构成",
    findings: cov ? `6 个部位 · 已测 ${cov.total_measured ?? cov.measured} / ${cov.total_defined ?? cov.front_total} 项` : "按部位的照片测量",
    interpretation: `${p.analysis.works.length} 条正在帮你的搭配，${p.analysis.doesnt_work.length} 条可以调整`,
    improvements: recs[0] ? recs[0].action : "按优先级排好的建议",
    options: hairOptions(p).map((h) => `${h.tierZh} · ${h.name}`).join(" / "),
    swatches: colorGroups(p)[0].colors.slice(0, 6),
    plan: `今天 ${plan.today.length} 项 · 下次剪发 ${plan.next_haircut.length} 项 · 值得投入 ${plan.invest.length} 项`,
    methods: `${p.analysis.limitations.length} 条局限说明 · 方法与版本 · 照片 24 小时删除`,
  };
}
