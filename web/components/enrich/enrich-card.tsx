"use client";

import { Check, Loader2 } from "lucide-react";
import * as React from "react";
import { Pill } from "@/components/passport/ui";
import { Button } from "@/components/ui/button";
import { ApiError, type ContextPatch } from "@/lib/api";
import { common, feedback } from "@/lib/copy/zh";
import { usePassport } from "@/lib/state/passport-store";
import { cn } from "@/lib/utils";
import s from "./enrich.module.css";
import { enrichCopy as t } from "./copy";

export type CardStatus = "open" | "done" | "skipped";
export type EnrichMode = "rerank" | "reanalyze";
export type PhotoFiles = Partial<Record<"profile45" | "smile" | "hair", Blob>>;
export interface Outcome { mode: EnrichMode; note: string }

/** One card's submit cycle: enrich(patch, files) → the mode the API returned + the change note of that rerank. */
export function useEnrichSubmit() {
  const { enrich, changeNote, passport } = usePassport();
  const [pending, setPending] = React.useState(false);
  const [mode, setMode] = React.useState<EnrichMode | null>(null);
  const [outcome, setOutcome] = React.useState<Outcome | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const live = changeNote ?? passport?.derived.feedback_applied.note_zh ?? null;

  // The render that sets `mode` already sees the store's updated change note: freeze it for this card.
  React.useEffect(() => {
    if (!mode) return;
    setOutcome({ mode, note: mode === "rerank" ? live ?? feedback.applied : t.outcome.reanalyzeDetail });
    setMode(null);
  }, [mode, live]);

  const submit = React.useCallback(async (patch: ContextPatch, files?: PhotoFiles): Promise<boolean> => {
    setPending(true);
    setError(null);
    try {
      const m = await enrich(patch, files);
      setMode(m === "reanalyze" ? "reanalyze" : "rerank");
      return true;
    } catch (e) {
      setError(e instanceof ApiError && e.body.detail ? e.body.detail : t.failed);
      return false;
    } finally {
      setPending(false);
    }
  }, [enrich]);

  return { submit, pending, outcome, error, setError };
}

export function OutcomeNote({ outcome }: { outcome: Outcome }) {
  const re = outcome.mode === "reanalyze";
  return (
    <div role="status" data-mode={outcome.mode} className="ap-rise mt-3 rounded-[4px] bg-paper-sunk px-3 py-2.5">
      <div className="flex items-center gap-2">
        <Pill tone={re ? "amber" : "accent"}>
          {re ? <Loader2 className="mr-1 size-3 animate-spin" /> : <Check className="mr-1 size-3" />}
          {re ? t.outcome.reanalyze : t.outcome.rerank}
        </Pill>
      </div>
      <p className="mt-1.5 text-[13px] leading-6 text-ink">{outcome.note}</p>
      {!re && <p className="text-[12px] leading-5 text-muted">{t.outcome.rerankDetail}</p>}
    </div>
  );
}

export function Chip({ on, children, onClick, disabled, label }: {
  on: boolean; children: React.ReactNode; onClick: () => void; disabled?: boolean; label?: string;
}) {
  return (
    <button type="button" aria-pressed={on} aria-label={label} disabled={disabled} onClick={onClick}
      className={cn("inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] transition-colors disabled:opacity-40",
        on ? "border-accent bg-accent text-[var(--ap-on-primary)]" : "border-rule-strong bg-paper-raised text-ink hover:border-ink/50")}>
      {children}
    </button>
  );
}

/** A picture choice: illustration on top, label (and an optional one-line description) below. */
export function ChoiceTile({ on, onClick, picture, label, desc, dark, disabled, className, pictureClassName }: {
  on: boolean; onClick: () => void; picture: React.ReactNode; label: string; desc?: string; dark?: boolean;
  disabled?: boolean; className?: string; pictureClassName?: string;
}) {
  return (
    <button type="button" aria-pressed={on} disabled={disabled} onClick={onClick}
      className={cn("group flex flex-col overflow-hidden rounded-[4px] border text-left transition-colors disabled:opacity-40",
        on ? "border-accent ring-2 ring-accent/40" : "border-rule hover:border-ink/40", className)}>
      <span className={cn("relative block w-full overflow-hidden", pictureClassName ?? "aspect-square",
        dark ? "bg-stage text-stage-ink" : "bg-paper-sunk text-ink-soft")}>
        {picture}
        {on && (
          <span className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-accent text-[var(--ap-on-primary)]">
            <Check className="size-3" strokeWidth={3} />
          </span>
        )}
      </span>
      <span className="block px-2 py-1.5">
        <span className={cn("block text-[13px] font-medium", on ? "text-accent" : "text-ink")}>{label}</span>
        {desc && <span className="mt-0.5 block whitespace-pre-line text-[11.5px] leading-[1.55] text-muted">{desc}</span>}
      </span>
    </button>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <fieldset className="mt-4 first:mt-0">
      <legend className="mb-2 text-[13px] font-medium text-ink">{label}</legend>
      {children}
      {hint && <p className="mt-1.5 text-[12px] text-muted">{hint}</p>}
    </fieldset>
  );
}

export interface EnrichCardProps {
  id: string;
  n: number;
  title: string;
  badge?: string;
  why: string;
  /** Always-visible notice under the title (e.g. the body card's no-photo statement). */
  notice?: React.ReactNode;
  status: CardStatus;
  pending: boolean;
  outcome: Outcome | null;
  error: string | null;
  canSubmit: boolean;
  submitLabel?: string;
  onSubmit: () => void;
  onSkip: () => void;
  onEdit: () => void;
  children: React.ReactNode;
}

/** Shell shared by the six enrichment cards: submit / skip / outcome / edit again. */
export function EnrichCard({ id, n, title, badge, why, notice, status, pending, outcome, error, canSubmit, submitLabel,
  onSubmit, onSkip, onEdit, children }: EnrichCardProps) {
  const headingId = `${id}-title`;
  return (
    <section id={id} aria-labelledby={headingId} data-status={status}
      className={cn(s.card,
        status === "open" ? "border-rule" : "border-rule/70 bg-paper")}>
      <header className="flex items-start gap-3">
        <span aria-hidden className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-full font-mono text-[12px]",
          status === "done" ? "bg-accent text-[var(--ap-on-primary)]" : "bg-paper-sunk text-ink-soft")}>
          {status === "done" ? <Check className="size-3.5" strokeWidth={3} /> : n}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={headingId} className="font-serif text-[18px] font-semibold leading-7">{title}</h2>
            {badge && <Pill>{badge}</Pill>}
            {status === "done" && <Pill tone="accent">{t.saved}</Pill>}
            {status === "skipped" && <Pill>{t.skipped}</Pill>}
          </div>
          {status === "open" && <p className="mt-0.5 text-[13px] leading-6 text-ink-soft">{why}</p>}
          {notice}
        </div>
        {status !== "open" && (
          <Button variant="ghost" size="sm" className="min-h-11 shrink-0" onClick={onEdit}>
            {status === "skipped" ? t.fillIn : t.edit}
          </Button>
        )}
      </header>
      {status === "done" && outcome && <OutcomeNote outcome={outcome} />}
      {status === "open" && (
        <>
          <div className="mt-4">{children}</div>
          {error && <p role="alert" className="mt-3 text-[13px] text-[#b4442f]">{error}</p>}
          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-rule pt-5">
            <Button size="md" variant="accent" disabled={!canSubmit || pending} onClick={onSubmit}>
              {pending && <Loader2 className="animate-spin" />}
              {pending ? t.submitting : submitLabel ?? common.save}
            </Button>
            <Button size="md" variant="ghost" disabled={pending} onClick={onSkip}>{common.skip}</Button>
          </div>
        </>
      )}
    </section>
  );
}

/** Common card state: open → (submit) done | (skip) skipped → (edit) open. Reports changes up for the progress strip. */
export function useCardFlow(onStatus?: (s: CardStatus) => void) {
  const [status, setStatusRaw] = React.useState<CardStatus>("open");
  const setStatus = React.useCallback((s: CardStatus) => {
    setStatusRaw(s);
    onStatus?.(s);
  }, [onStatus]);
  const sub = useEnrichSubmit();
  const run = React.useCallback(async (patch: ContextPatch, files?: PhotoFiles) => {
    if (await sub.submit(patch, files)) setStatus("done");
  }, [sub, setStatus]);
  return {
    status, run, pending: sub.pending, outcome: sub.outcome, error: sub.error,
    skip: () => setStatus("skipped"), edit: () => setStatus("open"), setError: sub.setError,
  };
}
