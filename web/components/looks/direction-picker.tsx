"use client";

import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SavedLook } from "@/lib/state/choices";
import type { Passport } from "@/lib/api";
import { savedDirection, type Direction } from "./directions";
import { lookSwatches } from "./names";

export type Slot = "a" | "b";

/** Starting directions built from this passport. Saving one stores it as an ordinary SavedLook (same 12-look list the Studio uses). */
export function DirectionPicker({ passport, directions, looks, slots, onPick }: {
  passport: Passport; directions: Direction[]; looks: readonly SavedLook[]; slots: Record<Slot, string | null>; onPick: (d: Direction, slot: Slot) => void;
}) {
  if (directions.length === 0) return null;
  return (
    <section aria-labelledby="directions" data-testid="directions">
      <h2 id="directions" className="font-serif text-[20px] font-semibold">从你的档案出发的三个完整造型</h2>
      <p className="mt-1 max-w-[42em] text-[13px] leading-6 text-ink-soft">
        每个方向把发型、发色、妆容、近脸色和眼镜配成一套，颜色取自你的个人色卡和报告建议，而不是随机搭配。放进 A 和 B 就能并排比较。
      </p>
      <ul className="mt-4 grid gap-3 md:grid-cols-3">
        {directions.map((d) => {
          const saved = savedDirection(looks, d);
          return (
            <li key={d.key} data-testid={`direction-${d.key}`} className="flex flex-col rounded-[14px] border border-rule bg-paper-raised p-4">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-serif text-[17px] font-semibold">{d.title}</h3>
                {d.matchesGoal && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] text-accent">贴近你的目标</span>}
              </div>
              <p className="mt-1 text-[13px] text-ink-soft">{d.tagline}</p>
              <ul className="mt-3 flex flex-wrap gap-1.5" aria-label={`${d.title}的配色`}>
                {lookSwatches(passport, d.look).map((s) => (
                  <li key={s.label} title={s.label} className="size-6 rounded-full border border-black/10" style={{ background: s.hex }}><span className="sr-only">{s.label}</span></li>
                ))}
              </ul>
              <ul className="mt-3 flex-1 list-disc space-y-1 pl-4 text-[12px] leading-5 text-ink-soft">
                {d.why.map((w) => <li key={w}>{w}</li>)}
                {d.needsHairGeneration && <li>发型是 AI 生成：先比较配色与妆容，要看到发型需在实验室生成。</li>}
              </ul>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {(["a", "b"] as const).map((slot) => {
                  const on = Boolean(saved) && slots[slot] === saved?.id;
                  return (
                    <Button key={slot} variant={on ? "accent" : "outline"} size="sm" aria-pressed={on} onClick={() => onPick(d, slot)}
                      data-testid={`pick-${d.key}-${slot}`}>
                      {on && <Check />}放进 {slot.toUpperCase()}
                    </Button>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
