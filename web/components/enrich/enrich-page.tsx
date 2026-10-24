"use client";

import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { NotReady, Page, PageHeader } from "@/components/passport/ui";
import { profile } from "@/lib/copy/zh";
import { usePassport } from "@/lib/state/passport-store";
import { cn } from "@/lib/utils";
import { BodyCard, ConditionsCard, HairCard, ImpressionCard, ProfilePhotoCard, StyleCard, type EnrichCardSlotProps } from "./cards";
import { enrichCopy as t } from "./copy";
import type { CardStatus } from "./enrich-card";

const STEPS: { key: string; short: string; Card: (p: EnrichCardSlotProps) => React.ReactNode }[] = [
  { key: "profile", short: "侧脸", Card: ProfilePhotoCard },
  { key: "hair", short: "发质", Card: HairCard },
  { key: "impression", short: "感觉", Card: ImpressionCard },
  { key: "body", short: "身形", Card: BodyCard },
  { key: "style", short: "风格", Card: StyleCard },
  { key: "conditions", short: "条件", Card: ConditionsCard },
];

/** /p/[id]/more — progressive enrichment (F3): six independent, skippable, picture-first cards. */
export function EnrichPage() {
  const { passport, id } = usePassport();
  const [status, setStatus] = React.useState<Record<string, CardStatus>>({});
  const handlers = React.useMemo(
    () => Object.fromEntries(STEPS.map((s) => [s.key, (v: CardStatus) => setStatus((m) => ({ ...m, [s.key]: v }))])),
    [],
  );
  if (!passport) return <NotReady />;
  const settled = STEPS.filter((s) => status[s.key] && status[s.key] !== "open").length;
  return (
    <Page>
      <PageHeader kicker={t.kicker} title={profile.more} sub={t.sub} />
      <nav aria-label="补充进度" className="mb-4 border-y border-rule py-2">
        <ol className="flex items-center justify-between gap-1">
          {STEPS.map((s, i) => {
            const st = status[s.key] ?? "open";
            return (
              <li key={s.key} className="min-w-0 flex-1">
                <a href={`#enrich-${s.key}`} className="flex flex-col items-center gap-0.5 text-[11px]">
                  <span className={cn("grid size-6 place-items-center rounded-full font-mono text-[11px]",
                    st === "done" ? "bg-accent text-[var(--ap-on-primary)]" : st === "skipped" ? "bg-paper-sunk text-muted line-through" : "border border-rule-strong text-ink-soft")}>
                    {st === "done" ? <Check className="size-3" strokeWidth={3} /> : i + 1}
                  </span>
                  <span className={cn("truncate", st === "open" ? "text-ink-soft" : "text-muted")}>{s.short}</span>
                </a>
              </li>
            );
          })}
        </ol>
      </nav>
      <div className="space-y-4">
        {STEPS.map(({ key, Card }, i) => <Card key={key} n={i + 1} onStatus={handlers[key]} />)}
      </div>
      <div className="mt-8 flex flex-col items-center gap-2 text-center">
        <p className="text-[12px] text-muted">{t.progress(settled, STEPS.length)}</p>
        <Link href={`/p/${id}`}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-ink px-6 text-[14px] font-medium text-paper hover:bg-ink-soft">
          {t.done}<ArrowRight className="size-4" />
        </Link>
      </div>
    </Page>
  );
}
