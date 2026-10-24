/** "Help me choose A or B" decision card content (Issue #4). Pure functions, so privacy rules are testable without a browser.
 *
 *  Default content is only what the person chose to compare: look names, colour swatches and a plain description of the
 *  difference. It never carries a score, a measurement, the personal questionnaire, the passport id or the passport's
 *  read-only link (that page shows the face profile). A real photo needs a fresh, specific consent tick for this one export. */
import type { Passport } from "@/lib/api";
import { diffLooks, LAYERS, renderLabel, type LayerNote } from "@/components/looks/diff";
import { lookParts, lookSwatches, type LookLike } from "@/components/looks/names";
import { hasForbidden } from "./caption";
import { CONTENT_PRODUCER } from "./use-card-export";

export interface DecisionSide {
  label: "A" | "B";
  name: string;
  /** "发型 稳妥 · 锁骨发", "唇色 豆沙粉": what this look sets, in plain words. */
  lines: string[];
  swatches: { label: string; hex: string }[];
  /** "本地模拟" / "AI 生成发型 + 本地模拟" / ... — how the picture of this look was made. */
  method: string;
  /** Layers the look sets but that could not be drawn on the photo. */
  undrawn: string[];
}
export interface DecisionContent { a: DecisionSide; b: DecisionSide; summary: string; level: "none" | "subtle" | "clear" }

const NEUTRAL = "（名称已隐藏）";
const safe = (s: string) => (hasForbidden(s) ? NEUTRAL : s);

function side(p: Passport, label: "A" | "B", look: LookLike, notes: readonly LayerNote[]): DecisionSide {
  const parts = lookParts(p, look);
  const lines = LAYERS.map(({ key, label: l }) => (parts[key] ? safe(`${l}：${parts[key]}`) : null)).filter((x): x is string => Boolean(x));
  return {
    label, name: label === "A" ? "造型 A" : "造型 B",
    lines: lines.length ? lines : ["保持现在的样子"],
    swatches: lookSwatches(p, look).map((s) => ({ ...s, label: safe(s.label) })),
    method: renderLabel(notes),
    undrawn: notes.filter((n) => n.state === "unavailable").map((n) => n.label),
  };
}

export function decisionContent(p: Passport, a: LookLike, b: LookLike, notesA: readonly LayerNote[] = [], notesB: readonly LayerNote[] = []): DecisionContent {
  const d = diffLooks(p, a, b);
  return { a: side(p, "A", a, notesA), b: side(p, "B", b, notesB), summary: safe(d.summary), level: d.level };
}

/** Pasteable text for the message that carries the image. No link: the image itself is the share. */
export function decisionCaption(c: DecisionContent, withPhoto: boolean): string {
  const diff = c.level === "none" ? "" : `\n${c.summary}`;
  return `帮我选一下：A 还是 B？${diff}\n${withPhoto ? "图里是我自己的照片，AI / 本地模拟的试看效果，仅供参考。" : "图里只有造型的配色和设置，不含照片，仅供参考。"}\n告诉我你更想选哪一个，以及原因。`;
}

/** Provenance for the PNG: AIGC label + a random id. Deliberately not the passport id or any photo reference. */
export function decisionExportMeta(random: () => string = () => Math.random().toString(36).slice(2, 10)) {
  return { ContentProducer: CONTENT_PRODUCER, ProduceID: `decision:${Date.now().toString(36)}:${random()}` };
}

export type DecisionMode = "swatches" | "photo";
export const DECISION_CONSENT_LABEL = "同意把我的正脸照片（含造型 A、B 的试看效果）放进这张图，并发给我选择的人。图片发出后无法收回。";

/** What may be drawn on the card right now. Photos appear only for mode "photo" with a tick given for this export. */
export function decisionPhotos(mode: DecisionMode, consent: boolean, snaps: { a: string | null; b: string | null }): { a: string | null; b: string | null } {
  if (mode !== "photo" || !consent) return { a: null, b: null };
  return { a: safeDataImage(snaps.a), b: safeDataImage(snaps.b) };
}

/** Only an in-memory canvas snapshot may become a card image: never a network URL. */
export function safeDataImage(src: string | null | undefined): string | null {
  return src && /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(src) ? src : null;
}

export const canExportDecision = (mode: DecisionMode, consent: boolean, photosAvailable: boolean) =>
  mode === "swatches" || (consent && photosAvailable);
