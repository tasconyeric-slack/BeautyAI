"use client";

import { SlidersHorizontal } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/passport/sheet";
import type { ContextPatch } from "@/lib/api";
import { adjustments as copy, style as styleCopy } from "@/lib/copy/zh";
import { usePassport } from "@/lib/state/passport-store";
import { cn } from "@/lib/utils";

type Occasion = "commute" | "date" | "formal" | "casual";
const STYLE_KEYS = ["sweet", "boyish", "modern", "elegant", "classic", "natural", "romantic", "dramatic"] as const;
const MINUTES = [5, 10, 15, 20, 30];
const BUDGET = { low: "300 元以内", medium: "300–800 元", high: "800 元以上" } as const;

function Chip({ on, children, onClick }: { on: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      className={cn("min-h-11 rounded-full border px-3 py-1.5 text-[13px] transition-colors",
        on ? "border-accent bg-accent text-[var(--ap-on-primary)]" : "border-rule-strong bg-paper-raised text-ink hover:border-ink/50")}>
      {children}
    </button>
  );
}

/** "调整": budget, upkeep time, perm / dye, occasions, target style → rules-only rerank in < 1 s (A9). */
export function AdjustPanel({ trigger }: { trigger?: (open: () => void) => React.ReactNode }) {
  const { passport, adjust, busy } = usePassport();
  const [open, setOpen] = React.useState(false);
  const close = React.useCallback(() => setOpen(false), []);
  const uc = passport?.user_context;
  const [draft, setDraft] = React.useState<{ minutes: number; perm: boolean; dye: boolean; budget: "low" | "medium" | "high";
    occasions: Occasion[]; target: string | null }>({ minutes: 15, perm: true, dye: true, budget: "medium", occasions: [], target: null });
  React.useEffect(() => {
    if (!uc) return;
    setDraft({ minutes: uc.constraints.daily_minutes, perm: uc.constraints.accepts_perm, dye: uc.constraints.accepts_dye,
      budget: uc.haircut_budget ?? "medium", occasions: [...(uc.occasions ?? [])] as Occasion[], target: uc.target_style ?? null });
  }, [uc, open]);
  if (!uc) return null;
  const apply = async () => {
    const patch: ContextPatch = {
      constraints: { daily_minutes: draft.minutes, accepts_perm: draft.perm, accepts_dye: draft.dye },
      haircut_budget: draft.budget, occasions: draft.occasions, target_style: draft.target as never,
    };
    await adjust(patch);
    setOpen(false);
  };
  const toggleOcc = (o: Occasion) =>
    setDraft((d) => ({ ...d, occasions: d.occasions.includes(o) ? d.occasions.filter((x) => x !== o) : [...d.occasions, o] }));
  return (
    <>
      {trigger ? trigger(() => setOpen(true)) : (
        <Button variant="outline" size="sm" className="min-h-11" onClick={() => setOpen(true)}><SlidersHorizontal />调整</Button>
      )}
      {open && (
        <Sheet open onClose={close} title={copy.title}>
            <fieldset className="mb-5">
              <legend className="mb-2 text-[13px] text-muted">{copy.maintenance}</legend>
              <div className="flex flex-wrap gap-2">
                {MINUTES.map((m) => <Chip key={m} on={draft.minutes === m} onClick={() => setDraft((d) => ({ ...d, minutes: m }))}>{m} 分钟</Chip>)}
              </div>
            </fieldset>
            <fieldset className="mb-5">
              <legend className="mb-2 text-[13px] text-muted">{copy.haircutBudget}</legend>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(BUDGET) as (keyof typeof BUDGET)[]).map((b) => (
                  <Chip key={b} on={draft.budget === b} onClick={() => setDraft((d) => ({ ...d, budget: b }))}>{BUDGET[b]}</Chip>
                ))}
              </div>
            </fieldset>
            <fieldset className="mb-5 flex flex-wrap gap-2">
              <legend className="mb-2 w-full text-[13px] text-muted">烫染</legend>
              <Chip on={draft.perm} onClick={() => setDraft((d) => ({ ...d, perm: !d.perm }))}>{draft.perm ? copy.perm.yes : copy.perm.no}</Chip>
              <Chip on={draft.dye} onClick={() => setDraft((d) => ({ ...d, dye: !d.dye }))}>{draft.dye ? copy.dye.yes : copy.dye.no}</Chip>
            </fieldset>
            <fieldset className="mb-5">
              <legend className="mb-2 text-[13px] text-muted">常去的场合</legend>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(copy.occasions) as Occasion[]).map((o) => <Chip key={o} on={draft.occasions.includes(o)} onClick={() => toggleOcc(o)}>{copy.occasions[o]}</Chip>)}
              </div>
            </fieldset>
            <fieldset className="mb-6">
              <legend className="mb-2 text-[13px] text-muted">{copy.targetStyle}</legend>
              <div className="flex flex-wrap gap-2">
                <Chip on={draft.target === null} onClick={() => setDraft((d) => ({ ...d, target: null }))}>暂不设定</Chip>
                {STYLE_KEYS.map((k) => <Chip key={k} on={draft.target === k} onClick={() => setDraft((d) => ({ ...d, target: k }))}>{styleCopy.names[k]}</Chip>)}
              </div>
            </fieldset>
            <Button variant="accent" size="lg" className="w-full" disabled={busy} onClick={apply}>{busy ? "正在更新" : copy.apply}</Button>
            <p className="mt-3 text-center text-[12px] text-muted">调整只改变推荐顺序与筛选，面部观察保持原样。</p>
        </Sheet>
      )}
    </>
  );
}
