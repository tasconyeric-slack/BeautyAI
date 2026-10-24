/** The person's own decisions on this device: chosen hairstyle, saved Look Studio combinations, action-plan state.
 *  localStorage only (never sent anywhere, no photo data — option ids and colour values), cleared with the passport. */
"use client";

import type { EyewearOptions } from "@/lib/tint/eyewear";
import type { MakeupSelection } from "@/lib/tint/makeup";
import * as React from "react";

export interface SavedLook extends MakeupSelection {
  eyewear?: EyewearOptions | null;
  hairHex?: string | null;
  hairStrength?: number;
  id: string;
  name: string;
  savedAt: string;
  hair: string | null;          // tier (safe | bold | easy) or null = keep current
  hairColor: number | null;     // index into color_profile.hair_color_directions, null = keep
  lip: string | null;           // hex
  blush: boolean;
  drape: string | null;         // hex
}
export interface Choices {
  hair: { tier: string; at: string } | null;
  looks: SavedLook[];
  plan: Record<string, { saved?: boolean; done?: boolean }>;
}

const EMPTY: Choices = { hair: null, looks: [], plan: {} };
export const choicesKey = (id: string) => `ap_choices:${id}`;
const EVENT = "ap-choices";

export function readChoices(id: string): Choices {
  try {
    const raw = localStorage.getItem(choicesKey(id));
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<Choices>) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

function write(id: string, c: Choices) {
  try {
    localStorage.setItem(choicesKey(id), JSON.stringify(c));
  } catch {
    /* storage blocked: this tab only */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { id, c } }));
}

export function clearChoices(id: string) {
  try {
    localStorage.removeItem(choicesKey(id));
  } catch {
    /* ignore */
  }
}

/** Shared across components on the page (one event bus), persisted per passport. */
export function useChoices(id: string) {
  const [c, setC] = React.useState<Choices>(EMPTY);
  React.useEffect(() => {
    setC(readChoices(id));
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ id: string; c: Choices }>).detail;
      if (d.id === id) setC(d.c);
    };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, [id]);
  const update = React.useCallback((fn: (prev: Choices) => Choices) => {
    const next = fn(readChoices(id));
    setC(next);
    write(id, next);
  }, [id]);
  return {
    choices: c,
    chooseHair: (tier: string) => update((p) => ({ ...p, hair: { tier, at: new Date().toISOString() } })),
    saveLook: (look: Omit<SavedLook, "id" | "savedAt">) =>
      update((p) => ({ ...p, looks: [{ ...look, id: `look_${Date.now().toString(36)}`, savedAt: new Date().toISOString() }, ...p.looks].slice(0, 12) })),
    removeLook: (lookId: string) => update((p) => ({ ...p, looks: p.looks.filter((l) => l.id !== lookId) })),
    setPlan: (recId: string, patch: { saved?: boolean; done?: boolean }) =>
      update((p) => ({ ...p, plan: { ...p.plan, [recId]: { ...p.plan[recId], ...patch } } })),
  };
}
