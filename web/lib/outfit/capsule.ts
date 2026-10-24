/** The starter capsule (Issue #23): a small mix-and-match set derived from the boards' catalog-matched garments.
 *  Reuse across boards decides what to buy first; budget only changes how many "need to find" pieces are called first buys.
 *  No prices, no shops: the numbers are counts of pieces, not money. */
import type { Slot } from "./catalog";
import type { Board, Context, Piece } from "./boards";

export type Budget = "low" | "medium" | "high";
export const BUDGET_LABEL: Record<Budget, string> = { low: "预算紧", medium: "预算适中", high: "预算宽松" };
/** How many not-yet-owned pieces are called "first buys" per budget level. */
export const FIRST_BUY: Record<Budget, number> = { low: 3, medium: 5, high: 8 };
export const CAPSULE_CAP = 8;

const SLOT_PRIORITY: Record<Slot, number> = { top: 0, bottom: 1, dress: 2, shoes: 3, outer: 4, bag: 5, accessory: 6 };
/** Categories people usually spend more on; used only to defer them under a tight budget, never to state a price. */
const BIGGER_SPEND: ReadonlySet<Slot> = new Set(["outer", "bag", "shoes"]);

export interface CapsulePiece {
  piece: Piece;
  /** boards (contexts) this piece appears in */
  usedIn: Context[];
  /** needed to wear at least one board's core (not an optional extra) */
  essential: boolean;
}
export interface Capsule { pieces: CapsulePiece[]; covered: number; dropped: number }

export function buildCapsule(boards: readonly Board[], cap = CAPSULE_CAP): Capsule {
  const byKey = new Map<string, CapsulePiece>();
  for (const b of boards) for (const p of b.pieces) {
    if (!p.garmentId) continue;                       // only actual catalog matches
    const cur = byKey.get(p.key) ?? { piece: p, usedIn: [], essential: false };
    cur.usedIn.push(b.key);
    cur.essential ||= !p.optional && p.origin === "report";
    byKey.set(p.key, cur);
  }
  const all = [...byKey.values()].sort((a, b) =>
    b.usedIn.length - a.usedIn.length || Number(b.essential) - Number(a.essential) || SLOT_PRIORITY[a.piece.slot] - SLOT_PRIORITY[b.piece.slot]);
  // optional extras used by one board only are the first to go; essentials always stay
  const keep = all.filter((c) => c.essential || c.usedIn.length > 1);
  for (const c of all) if (!keep.includes(c) && keep.length < cap) keep.push(c);
  const pieces = keep.slice(0, Math.max(cap, keep.filter((c) => c.essential).length));
  const covered = boards.filter((b) => b.pieces.some((p) => pieces.some((c) => c.piece.key === p.key))).length;
  return { pieces, covered, dropped: all.length - pieces.length };
}

export interface CapsulePlan {
  owned: CapsulePiece[];
  buyNow: CapsulePiece[];
  later: CapsulePiece[];
  /** boards whose catalog-matched core pieces are all owned */
  wearableNow: Context[];
}

export function planCapsule(capsule: Capsule, boards: readonly Board[], owned: Readonly<Record<string, boolean>>, budget: Budget): CapsulePlan {
  const need = capsule.pieces.filter((c) => !owned[c.piece.key]).sort((a, b) =>
    b.usedIn.length - a.usedIn.length || Number(b.essential) - Number(a.essential) ||
    (budget === "low" ? Number(BIGGER_SPEND.has(a.piece.slot)) - Number(BIGGER_SPEND.has(b.piece.slot)) : 0) ||
    SLOT_PRIORITY[a.piece.slot] - SLOT_PRIORITY[b.piece.slot]);
  const k = FIRST_BUY[budget];
  const wearableNow = boards.filter((b) => b.pieces.filter((p) => p.garmentId && !p.optional).every((p) => owned[p.key]) &&
    b.pieces.some((p) => p.garmentId && !p.optional)).map((b) => b.key);
  return { owned: capsule.pieces.filter((c) => owned[c.piece.key]), buyNow: need.slice(0, k), later: need.slice(k), wearableNow };
}

/** Pieces of a board the person still has to find (catalog-matched, not owned, not an optional extra). */
export const missingFor = (board: Board, owned: Readonly<Record<string, boolean>>) =>
  board.pieces.filter((p) => p.garmentId && !p.optional && !owned[p.key]);
