/** The person's outfit decisions on this device (Issue #23): chosen board, the A/B pair, owned pieces, budget, dressing ticks.
 *  localStorage only, never sent anywhere; ids and booleans, no photo data. Cleared with the passport (passport-store remove). */
"use client";

import * as React from "react";
import type { Budget } from "./capsule";
import type { Context } from "./boards";

export interface OutfitState {
  chosen: Context | null;
  compare: [Context, Context] | null;
  owned: Record<string, true>;
  budget: Budget | null;
  /** getting-dressed checklist ticks, keyed by piece key */
  dressed: Record<string, true>;
}
export const EMPTY_OUTFIT: OutfitState = { chosen: null, compare: null, owned: {}, budget: null, dressed: {} };
const CONTEXTS: readonly string[] = ["commute", "date", "formal", "casual"];
const MAX_KEYS = 60;
export const outfitKey = (id: string) => `ap_outfit:${id}`;

const tickMap = (v: unknown): Record<string, true> => {
  if (!v || typeof v !== "object") return {};
  const out: Record<string, true> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>).slice(0, MAX_KEYS)) if (x === true && k.length <= 120) out[k] = true;
  return out;
};

/** Strict read: anything that is not exactly what we wrote falls back to empty (corrupt or foreign data never reaches the UI). */
export function parseOutfit(raw: unknown): OutfitState {
  if (!raw || typeof raw !== "object") return EMPTY_OUTFIT;
  const s = raw as Record<string, unknown>;
  if (s.v !== 1) return EMPTY_OUTFIT;
  const ctx = (x: unknown): Context | null => (typeof x === "string" && CONTEXTS.includes(x) ? (x as Context) : null);
  const pair = Array.isArray(s.compare) && s.compare.length === 2 ? [ctx(s.compare[0]), ctx(s.compare[1])] : null;
  return {
    chosen: ctx(s.chosen),
    compare: pair && pair[0] && pair[1] && pair[0] !== pair[1] ? [pair[0], pair[1]] : null,
    owned: tickMap(s.owned),
    budget: s.budget === "low" || s.budget === "medium" || s.budget === "high" ? s.budget : null,
    dressed: tickMap(s.dressed),
  };
}

export function readOutfit(id: string): OutfitState {
  try {
    const raw = localStorage.getItem(outfitKey(id));
    return raw ? parseOutfit(JSON.parse(raw)) : EMPTY_OUTFIT;
  } catch {
    return EMPTY_OUTFIT;
  }
}

/** Returns false when the browser blocks storage (the choice then lives in this tab only). */
export function writeOutfit(id: string, s: OutfitState): boolean {
  try {
    localStorage.setItem(outfitKey(id), JSON.stringify({ v: 1, ...s }));
    return true;
  } catch {
    return false;
  }
}

export function clearOutfit(id: string) {
  try {
    localStorage.removeItem(outfitKey(id));
  } catch {
    /* ignore */
  }
}

export function useOutfitState(id: string) {
  const [state, setState] = React.useState<OutfitState>(EMPTY_OUTFIT);
  const [loaded, setLoaded] = React.useState(false);
  const [persisted, setPersisted] = React.useState(true);
  const latest = React.useRef(state);   // in-memory truth, so blocked storage still keeps this tab's choices
  React.useEffect(() => {
    const s = readOutfit(id);
    latest.current = s;
    setState(s);
    setLoaded(true);
  }, [id]);
  const update = React.useCallback((fn: (prev: OutfitState) => OutfitState) => {
    const next = fn(latest.current);
    latest.current = next;
    setState(next);
    setPersisted(writeOutfit(id, next));
  }, [id]);
  return {
    state, loaded, persisted,
    choose: (c: Context | null) => update((p) => ({ ...p, chosen: c })),
    setCompare: (pair: [Context, Context]) => update((p) => ({ ...p, compare: pair })),
    setOwned: (key: string, owned: boolean) => update((p) => {
      const next = { ...p.owned };
      if (owned) next[key] = true; else delete next[key];
      return { ...p, owned: next };
    }),
    setDressed: (key: string, on: boolean) => update((p) => {
      const next = { ...p.dressed };
      if (on) next[key] = true; else delete next[key];
      return { ...p, dressed: next };
    }),
    setBudget: (b: Budget) => update((p) => ({ ...p, budget: b })),
  };
}
