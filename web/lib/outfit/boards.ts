/** Decision-ready outfit boards (Issue #23). Pure functions over the existing passport: no model call, no photo.
 *
 *  Provenance of every piece on a board (the UI shows it, nothing is presented as a model finding unless it is one):
 *    report   – named in the model's `outfit_direction.occasions[].look` or a formula, matched to the garment catalog
 *    fill     – an advised `outfit_direction.items` garment the rules add because a required slot is empty (optional)
 *    generic  – no catalog garment fits: an optional, clearly marked slot; the person picks the piece
 *  Colours come from the passport's own colour families / advised item colours; a colour we cannot place stays unpainted. */
import type { Passport } from "@/lib/api";
import { stripRefs } from "@/lib/adapters";
import { adjustments } from "@/lib/copy/zh";
import { CATALOG, catalogGarment, searchTerm, type CatalogGarment, type Slot } from "./catalog";

export type Context = "commute" | "date" | "formal" | "casual";
export type Origin = "report" | "fill" | "generic";

export const SLOT_ORDER: readonly Slot[] = ["dress", "top", "bottom", "outer", "shoes", "bag", "accessory"];
export const SLOT_LABEL: Record<Slot, string> = {
  dress: "连衣裙", top: "上衣", bottom: "下装", outer: "外层", shoes: "鞋", bag: "包", accessory: "配饰",
};
export const CONTEXT_LABEL: Record<Context, string> = adjustments.occasions;

export interface Piece {
  /** Stable key for ownership ticks: garment id + colour, or the generic slot + text. */
  key: string;
  slot: Slot;
  garmentId: string | null;
  name: string;
  colorName: string | null;
  hex: string | null;
  origin: Origin;
  optional: boolean;
  nearFace: boolean;
  /** The report's own reason for this garment (advised items only). */
  why: string | null;
  search: string;
  issues: string[];
  /** The person marked this garment 不喜欢 in the feedback chips. */
  disliked: boolean;
}

/** "通勤 · 柔和通勤", or just "正式场合" when the formula title adds nothing. */
export const boardName = (b: Pick<Board, "label" | "title">) => (b.title === b.label ? b.label : `${b.label} · ${b.title}`);

export interface PaletteChip { hex: string; name: string; kind: "favor" | "neutral" | "other"; reason: string | null }

export interface Board {
  key: Context;
  label: string;
  title: string;
  /** The occasion line as the report wrote it; null when the board comes from a formula only. */
  lookText: string | null;
  pieces: Piece[];
  palette: PaletteChip[];
  why: { text: string; from: "report" | "derived" };
  /** Parts of the report's line that are not garments (hair, lip, details): shown as-is, never dropped. */
  notes: string[];
  /** Why the rules added or marked pieces on this board. */
  caveats: string[];
}

export interface BoardsResult {
  boards: Board[];
  status: "ok" | "single" | "empty";
  /** Plain reason when fewer than two boards could be built. */
  reason: string | null;
  constraintNotes: string[];
}

export interface BuildOptions {
  /** garment ids the person marked 不喜欢. */
  disliked?: ReadonlySet<string>;
}

// --- text → pieces -----------------------------------------------------------------------------------------------
const norm = (s: string) => s.replace(/\s+/g, "").replace(/^(内搭|外搭|里面搭|搭配)/, "").replace(/套装$/, "");
const bigrams = (s: string) => Array.from({ length: Math.max(0, s.length - 1) }, (_, i) => s.slice(i, i + 2));

const SLOT_WORDS: [Slot, RegExp][] = [
  ["dress", /连衣裙|裙装/],
  ["outer", /西装|外套|风衣|大衣|夹克|马甲/],
  ["top", /衬衫|针织|T恤|毛衣|上衣|开衫|卫衣|背心|[Pp]olo|高领/],
  ["bottom", /裤|半身裙|短裙|长裙/],
  ["shoes", /鞋|靴|乐福/],
  ["bag", /包/],
  ["accessory", /项链|耳环|吊坠|手表|腕表|围巾|丝巾|腰带|帽|眼镜/],
];
const slotWord = (s: string): Slot | null => SLOT_WORDS.find(([, re]) => re.test(s))?.[0] ?? null;

export function formulaContext(title: string): Context | null {
  if (/正式|晚宴|典礼|宴会/.test(title)) return "formal";
  if (/约会|聚会|派对/.test(title)) return "date";
  if (/通勤|商务|职场|上班/.test(title)) return "commute";
  if (/周末|休闲|日常|松弛|度假/.test(title)) return "casual";
  return null;
}

interface ColorBook { byName: Map<string, string>; names: string[] }
function colorBook(p: Passport): ColorBook {
  const m = new Map<string, string>();
  const cp = p.analysis.color_profile;
  for (const f of [...cp.favor_families, ...cp.neutral_families, ...cp.caution_families]) if (f.hex_examples[0]) m.set(f.name, f.hex_examples[0]);
  for (const it of p.analysis.outfit_direction.items) m.set(it.color_name, it.hex);
  return { byName: m, names: [...m.keys()].sort((a, b) => b.length - a.length) };
}
function splitColor(text: string, book: ColorBook): { colorName: string | null; hex: string | null; rest: string } {
  const name = book.names.find((n) => text.startsWith(n));
  return name ? { colorName: name, hex: book.byName.get(name) ?? null, rest: text.slice(name.length) } : { colorName: null, hex: null, rest: text };
}

interface Candidate { garment: CatalogGarment; advised: { color_name: string; hex: string; why: string } | null }

function matchGarment(rest: string, advised: Map<string, Candidate>): Candidate | null {
  const r = norm(rest);
  if (r.length < 2) return null;
  const rb = bigrams(r);
  let best: { score: number; cand: Candidate } | null = null;
  const consider = (cand: Candidate) => {
    const name = cand.garment.name_zh;
    let score = 0;
    if (r === name) score = 10;
    else if (r.length >= 3 && (r.includes(name) || name.includes(r))) score = 5 + Math.min(r.length, name.length) / Math.max(r.length, name.length);
    else {
      const nb = new Set(bigrams(name));
      const shared = rb.filter((b) => nb.has(b)).length;
      if (shared >= 2 && shared / rb.length >= 0.6) score = 3 * (shared / rb.length);
    }
    if (!score) return;
    if (cand.advised) score += 1;
    if (!best || score > best.score) best = { score, cand };
  };
  for (const c of advised.values()) consider(c);
  for (const g of CATALOG) if (!advised.has(g.id)) consider({ garment: g, advised: null });
  return (best as { cand: Candidate } | null)?.cand ?? null;
}

function pieceKey(garmentId: string | null, slot: Slot, colorKey: string): string {
  return garmentId ? `${garmentId}:${colorKey.toLowerCase()}` : `generic:${slot}:${colorKey}`;
}

interface Ctx {
  passport: Passport;
  book: ColorBook;
  advised: Map<string, Candidate>;
  checks: Map<string, { issues: string[]; search_zh: string }>;
  cautions: Map<string, string>;
  disliked: ReadonlySet<string>;
  nearFaceKinds: Map<string, PaletteChip["kind"]>;
}

function makePiece(c: Ctx, text: string, origin: Origin, optional = false): Piece | null {
  const t = norm(text);
  if (!t) return null;
  const { colorName, hex, rest } = splitColor(t, c.book);
  const cand = matchGarment(rest, c.advised);
  if (cand) {
    const g = cand.garment;
    // the piece keeps the colour the text names; with none named, the advised item's own colour
    const cName = colorName ?? cand.advised?.color_name ?? null;
    const cHex = (colorName ? hex : cand.advised?.hex) ?? null;
    const check = c.checks.get(g.id);
    const sameColor = !cand.advised || cand.advised.color_name === cName;
    const issues = [...(sameColor ? check?.issues ?? [] : [])];
    const caution = cName ? c.cautions.get(cName) : undefined;
    if (caution) issues.push(`近脸慎用：${caution}`);
    return {
      key: pieceKey(g.id, g.category, cHex ?? cName ?? ""), slot: g.category, garmentId: g.id, name: g.name_zh, colorName: cName, hex: cHex,
      origin, optional, nearFace: g.color_slot === "near_face", why: cand.advised ? stripRefs(cand.advised.why) : null,
      search: sameColor && check?.search_zh ? check.search_zh : searchTerm(g, cName), issues, disliked: c.disliked.has(g.id),
    };
  }
  const slot = slotWord(t);
  if (!slot) return null;
  return {
    key: pieceKey(null, slot, t), slot, garmentId: null, name: rest || t, colorName, hex, origin: "generic", optional: optional || slot === "accessory" || slot === "bag",
    nearFace: slot === "top" || slot === "dress", why: null, search: t, issues: [], disliked: false,
  };
}

// --- board assembly ------------------------------------------------------------------------------------------------
const REQUIRED: Slot[] = ["top", "bottom", "shoes"];
const GENERIC_SLOT: Partial<Record<Slot, string>> = {
  top: "上衣（自选）· 近脸那件从下方色板里选",
  bottom: "下装（自选）· 素色、与上衣同色系",
  shoes: "鞋（自选）· 素色、与下装同色系",
  outer: "外层（可选）· 与下装同色系",
};

function genericPiece(slot: Slot): Piece {
  return {
    key: `generic:${slot}:slot`, slot, garmentId: null, name: GENERIC_SLOT[slot] ?? SLOT_LABEL[slot], colorName: null, hex: null, origin: "generic",
    optional: true, nearFace: slot === "top", why: null, search: "", issues: [], disliked: false,
  };
}

function presentationKey(p: Passport): string {
  const v = p.user_context.presentation;
  return v === "androgynous" ? "neutral" : v;
}

function fillCandidate(c: Ctx, slot: Slot, ctx: Context, used: Piece[]): Piece | null {
  const od = c.passport.analysis.outfit_direction;
  const neutral = new Set(c.passport.analysis.color_profile.neutral_families.map((f) => f.name));
  const favor = new Set(c.passport.analysis.color_profile.favor_families.map((f) => f.name));
  const usedHex = new Set(used.map((u) => u.hex?.toLowerCase()).filter(Boolean));
  let best: { score: number; piece: Piece } | null = null;
  for (const it of od.items) {
    const g = catalogGarment(it.garment_id);
    if (!g || g.category !== slot || !g.occasions.includes(ctx) || !g.presentations.includes(presentationKey(c.passport))) continue;
    if (c.disliked.has(g.id) || used.some((u) => u.garmentId === g.id && u.hex?.toLowerCase() === it.hex.toLowerCase())) continue;
    const piece = makePiece(c, `${it.color_name}${g.name_zh}`, "fill", true);
    if (!piece || piece.issues.length) continue;
    let score = 0;
    if (slot === "top" || slot === "outer") score += favor.has(it.color_name) ? 2 : neutral.has(it.color_name) ? 1 : 0;
    else score += neutral.has(it.color_name) ? 2 : 0;
    if (usedHex.has(it.hex.toLowerCase())) score += 1;
    if (!best || score > best.score) best = { score, piece };
  }
  return best?.piece ?? null;
}

interface RawSource { lookText: string | null; formula: Passport["analysis"]["outfit_direction"]["formulas"][number] | null }

function buildBoard(c: Ctx, ctx: Context, src: RawSource): Board | null {
  const caveats: string[] = [];
  const notes: string[] = [];
  const slots = new Map<Slot, Piece>();
  const place = (piece: Piece | null, from: "look" | "formula"): boolean => {
    if (!piece) return false;
    if (from === "formula") {
      const hasDress = slots.has("dress");
      if (hasDress && (piece.slot === "top" || piece.slot === "bottom")) return false;
      if ((slots.has("top") || slots.has("bottom")) && piece.slot === "dress") return false;
    }
    if (slots.has(piece.slot)) return false;
    slots.set(piece.slot, piece);
    return true;
  };
  if (src.lookText) {
    for (const seg of src.lookText.split(/[+＋，,、；;]/).map((s) => s.trim()).filter(Boolean)) {
      if (!place(makePiece(c, seg, "report"), "look")) notes.push(seg);
    }
  }
  if (src.formula) for (const piece of src.formula.pieces) place(makePiece(c, piece, "report"), "formula");

  // grounded in the report's own text: a dress, or at least two named pieces; the rules never build a board from nothing
  if (!slots.has("dress") && slots.size < 2) return null;

  const used = () => [...slots.values()];
  for (const slot of REQUIRED) {
    if (slots.has(slot)) continue;
    if (slots.has("dress") && (slot === "top" || slot === "bottom")) continue;
    const fill = fillCandidate(c, slot, ctx, used());
    if (fill) {
      slots.set(slot, fill);
      caveats.push(`${SLOT_LABEL[slot]}：报告没写，从你的推荐单品里补了一件，可不选`);
    } else {
      slots.set(slot, genericPiece(slot));
      caveats.push(`${SLOT_LABEL[slot]}：没有合适的单品库匹配，留成自选位`);
    }
  }
  if (ctx === "formal" && !slots.has("outer")) {
    const fill = fillCandidate(c, "outer", ctx, used());
    if (fill) { slots.set("outer", fill); caveats.push("外层：正式场合可加一件，可不选"); }
  }
  if (!slots.has("accessory") && !slots.has("bag")) {
    const extra = fillCandidate(c, "accessory", ctx, used()) ?? fillCandidate(c, "bag", ctx, used());
    if (extra) { slots.set(extra.slot, extra); caveats.push(`${SLOT_LABEL[extra.slot]}：可选的点缀，不是必须`); }
  }

  const pieces = SLOT_ORDER.map((s) => slots.get(s)).filter((p): p is Piece => Boolean(p));
  const palette: PaletteChip[] = [];
  for (const p of pieces) {
    if (!p.nearFace || !p.hex || palette.some((x) => x.hex.toLowerCase() === p.hex!.toLowerCase())) continue;
    const kind = (p.colorName && c.nearFaceKinds.get(p.colorName)) || "other";
    palette.push({ hex: p.hex, name: p.colorName ?? "", kind, reason: familyReason(c.passport, p.colorName) });
  }
  const firstReason = palette.find((x) => x.reason)?.reason ?? null;
  const why = src.formula?.why ? { text: stripRefs(src.formula.why), from: "report" as const }
    : firstReason ? { text: `近脸用${palette.filter((x) => x.kind !== "other").map((x) => x.name).join("、") || palette[0]?.name}：${firstReason}`, from: "derived" as const }
    : { text: "按你的推荐色与单品拼成；报告没有单独写这个场合的理由。", from: "derived" as const };
  return {
    key: ctx, label: CONTEXT_LABEL[ctx], title: src.formula?.title ?? CONTEXT_LABEL[ctx], lookText: src.lookText, pieces, palette, why,
    notes: notes.filter((n) => !pieces.some((p) => n.includes(p.name))), caveats,
  };
}

function familyReason(p: Passport, colorName: string | null): string | null {
  if (!colorName) return null;
  const cp = p.analysis.color_profile;
  return [...cp.favor_families, ...cp.neutral_families].find((f) => f.name === colorName)?.reason ?? null;
}

// --- contexts ------------------------------------------------------------------------------------------------------
const DRESS_CODE_LABEL: Record<string, string> = { business_casual: "商务休闲", formal: "正式", uniform: "有制服", creative: "创意自由" };
const CODE_ORDER: Record<string, Context[]> = {
  business_casual: ["commute", "formal"], formal: ["formal", "commute"], uniform: ["casual", "date"], creative: ["casual", "date"], none: [],
};

export function pickContexts(p: Passport): Context[] {
  const od = p.analysis.outfit_direction;
  const all: Context[] = [];
  for (const o of od.occasions) if (!all.includes(o.occasion)) all.push(o.occasion);
  for (const f of od.formulas) { const c = formulaContext(f.title); if (c && !all.includes(c)) all.push(c); }
  const mine = p.user_context.occasions ?? [];
  const code = CODE_ORDER[p.user_context.constraints?.dress_code ?? "none"] ?? [];
  const rank = (c: Context) => {
    const a = mine.indexOf(c);
    const b = code.indexOf(c);
    return (a >= 0 ? a : 10) * 100 + (b >= 0 ? b : 10) * 10 + all.indexOf(c) / 10;
  };
  return [...all].sort((x, y) => rank(x) - rank(y)).slice(0, 3);
}

export function buildBoards(p: Passport, opts: BuildOptions = {}): BoardsResult {
  const od = p.analysis.outfit_direction;
  const cp = p.analysis.color_profile;
  const advised = new Map<string, Candidate>();
  for (const it of od.items) {
    const g = catalogGarment(it.garment_id);
    if (g) advised.set(g.id, { garment: g, advised: { color_name: it.color_name, hex: it.hex, why: it.why } });
  }
  const kinds = new Map<string, PaletteChip["kind"]>();
  for (const f of cp.neutral_families) kinds.set(f.name, "neutral");
  for (const f of cp.favor_families) kinds.set(f.name, "favor");
  const ctx: Ctx = {
    passport: p, book: colorBook(p), advised, disliked: opts.disliked ?? new Set(),
    checks: new Map((p.derived.outfit_checks?.items ?? []).map((i) => [i.garment_id, i])),
    cautions: new Map(cp.caution_families.map((f) => [f.name, f.reason])),
    nearFaceKinds: kinds,
  };

  const boards: Board[] = [];
  for (const key of pickContexts(p)) {
    const lookText = od.occasions.find((o) => o.occasion === key)?.look ?? null;
    const formulas = od.formulas.filter((f) => formulaContext(f.title) === key);
    const formula = bestFormula(ctx, lookText, formulas);
    if (!lookText && !formula) continue;
    const board = buildBoard(ctx, key, { lookText, formula });
    if (board) boards.push(board);
  }
  const c = p.user_context.constraints;
  const constraintNotes: string[] = [];
  if (c?.dress_code && DRESS_CODE_LABEL[c.dress_code]) constraintNotes.push(`着装要求：${DRESS_CODE_LABEL[c.dress_code]}，场合已按它排序。`);
  if (c?.other?.trim()) constraintNotes.push(`你写的额外限制「${c.other.trim()}」系统不会据此改搭配，请自行核对。`);
  const status = boards.length >= 2 ? "ok" : boards.length === 1 ? "single" : "empty";
  const reason = status === "ok" ? null : status === "single"
    ? "目前只有一个场合有足够的搭配信息，没法做对比。"
    : "报告里没有足够的场合搭配信息，先看下面的公式与核心单品。";
  return { boards, status, reason, constraintNotes };
}

/** With several formulas for one context, the one that shares the most garments with the occasion line. */
function bestFormula(c: Ctx, look: string | null, formulas: RawSource["formula"][]): RawSource["formula"] {
  if (formulas.length <= 1 || !look) return formulas[0] ?? null;
  const inLook = new Set(look.split(/[+＋，,、；;]/).map((seg) => makePiece(c, seg.trim(), "report")?.garmentId).filter(Boolean));
  const overlap = (f: NonNullable<RawSource["formula"]>) => f.pieces.filter((pc) => inLook.has(makePiece(c, pc, "report")?.garmentId)).length;
  return [...formulas].sort((a, b) => overlap(b!) - overlap(a!))[0] ?? null;
}
