/** What differs between two looks, and how each layer of a look is actually drawn (Issue #4).
 *  Pure functions: the comparison page, the decision card and the tests all read these. Nothing here judges which look is
 *  "better"; it only says what is different and what was or was not rendered. */
import type { MakeupAvailability } from "@/lib/tint/makeup";
import { lookParts, summarizeLook, type LookLike, type LookParts } from "./names";
import type { Passport } from "@/lib/api";

export type LayerKey = keyof LookParts;
export const LAYERS: { key: LayerKey; label: string }[] = [
  { key: "hair", label: "发型" }, { key: "hairColor", label: "发色" }, { key: "eyeshadow", label: "眼影" }, { key: "eyeliner", label: "眼线" },
  { key: "brows", label: "眉形" }, { key: "lip", label: "唇色" }, { key: "blush", label: "腮红" }, { key: "eyewear", label: "眼镜" }, { key: "drape", label: "近脸色" },
];

const up = (h: string | null | undefined) => (h ? h.toUpperCase() : null);
/** The values that decide how a layer looks, so two looks that only share a *name* are still told apart. */
function identity(look: LookLike, layer: LayerKey): string {
  const hide = Boolean(look.eyesObscured);
  switch (layer) {
    case "hair": return look.hair ?? "";
    case "hairColor": return `${up(look.hairHex)}|${look.hairColor ?? ""}|${look.hairHex || look.hairColor !== null ? look.hairStrength ?? 0.8 : ""}`;
    case "eyeshadow": return hide || !look.eyeshadow ? "" : JSON.stringify(look.eyeshadow);
    case "eyeliner": return hide || !look.eyeliner ? "" : JSON.stringify(look.eyeliner);
    case "brows": return look.brows ? JSON.stringify(look.brows) : "";
    case "lip": return look.lip ? `${up(look.lip)}|${look.lipIntensity ?? 0.6}|${look.lipFinish ?? "satin"}` : "";
    case "blush": return look.blush ? `${up(look.blushHex)}|${look.blushPlacement ?? ""}|${look.blushIntensity ?? 0.45}` : "";
    case "eyewear": return hide || !look.eyewear ? "" : JSON.stringify(look.eyewear);
    case "drape": return up(look.drape) ?? "";
  }
}

export interface DiffRow {
  key: LayerKey;
  label: string;
  a: string;
  b: string;
  differs: boolean;
  /** Hair shape is the only AI-generated layer; everything else is a local colour simulation. */
  generated: boolean;
}
export type DifferenceLevel = "none" | "subtle" | "clear";

export interface LookDiff {
  rows: DiffRow[];
  differing: DiffRow[];
  level: DifferenceLevel;
  /** One or two plain sentences: what differs. Never says which is better. */
  summary: string;
}

const NONE = "不加 / 保持现在";
/** Which differences a viewer notices first: the summary leads with these, not with the order of the table. */
const SALIENCE: LayerKey[] = ["hair", "hairColor", "eyewear", "lip", "drape", "eyeshadow", "blush", "brows", "eyeliner"];

export function diffLooks(p: Passport, a: LookLike, b: LookLike): LookDiff {
  const pa = lookParts(p, a), pb = lookParts(p, b);
  const rows: DiffRow[] = LAYERS.map(({ key, label }) => ({
    key, label, a: pa[key] ?? NONE, b: pb[key] ?? NONE, differs: identity(a, key) !== identity(b, key), generated: key === "hair",
  }));
  const differing = rows.filter((r) => r.differs);
  const level: DifferenceLevel = differing.length === 0 ? "none" : differing.length === 1 ? "subtle" : "clear";
  const noticeable = [...differing].sort((x, y) => SALIENCE.indexOf(x.key) - SALIENCE.indexOf(y.key));
  const labels = noticeable.map((r) => r.label);
  const summary = level === "none" ? "这两个造型的设置完全相同，先在实验室改出一点差别再比较。"
    : `A 和 B 的差别在${labels.slice(0, 4).join("、")}${labels.length > 4 ? "等" : ""}。${noticeable.slice(0, 3).map((r) => `${r.label}：A ${r.a}，B ${r.b}。`).join("")}${level === "subtle" ? "只有一处不同，照片上可能不明显。" : ""}`;
  return { rows, differing, level, summary };
}

export type LayerState = "generated" | "local" | "unavailable";
export interface LayerNote { key: LayerKey; label: string; state: LayerState; detail?: string }

export interface RenderContext {
  expired: boolean;
  /** Whether the browser can read the photo's pixels, which every local simulation needs. */
  canvas: "loading" | "ready" | "plain" | "unavailable";
  /** Face measurements for the photo: undefined while loading, null when this photo has none. */
  geometry: object | null | undefined;
  /** Status of the AI hair preview for the look's tier. */
  hairPreview: "succeeded" | "pending" | "failed" | "fallback" | "none" | undefined;
  hairShapeLoaded: boolean;
  maskState: "loading" | "ready" | "error";
  makeup: MakeupAvailability;
  eyewearReason: string | null;
}

const EXPIRED = "照片已按隐私规则在 24 小时后删除，没有画出这一项。";
const NO_GEOMETRY = "这张照片没有可用的面部测量，没有画出这一项。";

/** For every layer a look sets: drawn by an AI preview, drawn locally, or not drawn (with the reason). */
export function layerNotes(p: Passport, look: LookLike, ctx: RenderContext): LayerNote[] {
  const parts = lookParts(p, look);
  const out: LayerNote[] = [];
  const need = (key: LayerKey, label: string, check: () => string | null | undefined) => {
    if (!parts[key]) return;
    const reason = ctx.expired ? EXPIRED : ctx.canvas === "loading" ? "照片还在载入，稍后会叠加。"
      : ctx.canvas !== "ready" ? "暂时读不到这张照片的像素，没有叠加本地模拟。" : check();
    out.push(reason ? { key, label, state: "unavailable", detail: reason } : { key, label, state: "local" });
  };
  if (parts.hair) {
    if (ctx.expired) out.push({ key: "hair", label: "发型", state: "unavailable", detail: EXPIRED });
    else if (ctx.hairPreview === "succeeded") {
      out.push(ctx.hairShapeLoaded ? { key: "hair", label: "发型", state: "generated", detail: "AI 近似模拟" }
        : { key: "hair", label: "发型", state: "unavailable", detail: "生成图还在载入或载入失败，画面仍是现在的发型。" });
    } else {
      const why = ctx.hairPreview === "pending" ? "发型还在生成中" : ctx.hairPreview === "failed" || ctx.hairPreview === "fallback" ? "这个发型没有生成成功"
        : "这个发型还没有生成（需要在实验室点“生成这个造型”）";
      out.push({ key: "hair", label: "发型", state: "unavailable", detail: `${why}，画面仍是现在的发型。` });
    }
  }
  need("hairColor", "发色", () => ctx.maskState === "ready" ? null : ctx.maskState === "loading" ? "头发识别还在进行，稍后会叠加。" : "这张照片无法分割头发，没有叠加发色。");
  need("eyeshadow", "眼影", () => ctx.geometry ? ctx.makeup.eyeshadow : NO_GEOMETRY);
  need("eyeliner", "眼线", () => ctx.geometry ? ctx.makeup.eyeliner : NO_GEOMETRY);
  need("brows", "眉形", () => ctx.geometry ? ctx.makeup.brows : NO_GEOMETRY);
  need("lip", "唇色", () => ctx.geometry ? ctx.makeup.lip : NO_GEOMETRY);
  need("blush", "腮红", () => ctx.geometry ? ctx.makeup.blush : NO_GEOMETRY);
  need("eyewear", "眼镜", () => ctx.geometry ? ctx.eyewearReason : NO_GEOMETRY);
  need("drape", "近脸色", () => ctx.geometry ? null : NO_GEOMETRY);
  return out;
}

/** The honest one-line label under a picture: generated vs local simulation vs not drawn. */
export function renderLabel(notes: readonly LayerNote[]): string {
  if (notes.length === 0) return "原图";
  const generated = notes.some((n) => n.state === "generated");
  const local = notes.some((n) => n.state === "local");
  const missing = notes.filter((n) => n.state === "unavailable");
  const base = generated && local ? "AI 生成发型 + 本地模拟" : generated ? "AI 生成发型" : local ? "本地模拟" : "没有可画出的内容";
  return missing.length ? `${base} · ${missing.length} 项未画出` : base;
}

export { summarizeLook };
