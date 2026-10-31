"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { ResembleFor } from "@/components/adjust/feedback-for";
import { ConfidenceNote, StylePlane } from "@/components/ds";
import { Card, NotReady, Page, PageHeader, Pill, Section } from "@/components/passport/ui";
import { cover, stylePlane } from "@/lib/adapters";
import { api } from "@/lib/api";
import { style as copy } from "@/lib/copy/zh";
import { usePassport } from "@/lib/state/passport-store";
import { cn } from "@/lib/utils";
import s from "./style.module.css";
import { styleLocal as L } from "./copy";
import { styleView, type StyleKey, type StyleView } from "./view";

/** /p/[id]/style — F8 风格方向: plane, four layers kept apart (D25), rules, and "我更喜欢另一种". */
export function StylePage() {
  const { passport, id } = usePassport();
  if (!passport) return <NotReady />;
  const v = styleView(passport);
  const plane = stylePlane(passport);
  const low = v.looks.confidence === "low";
  return (
    <Page>
      <PageHeader kicker={L.kicker} title={low ? v.looks.region : cover(passport).styleLine} sub={L.disclaimer} />
      <div data-testid="style-plane" className={s.plane}>
        <StylePlane {...plane} between={low ? undefined : plane.between} />
      </div>

      <div className={s.layers}>
        <FeaturesLayer v={v} />
        <LooksLayer v={v} low={low} id={id} />
        <LikesLayer v={v} />
        <WantsLayer v={v} />
      </div>

      <Section title={copy.preferAnother}>
        <StylePicker v={v} />
      </Section>

      {v.rules.length > 0 && (
        <Section title={L.rulesTitle}>
          <Card>
            <p className="mb-3 text-[13px] leading-6 text-muted">{L.rulesSub(v.looks.primary.name)}</p>
            <dl className="divide-y divide-rule">
              {v.rules.map((r) => (
                <div key={r.key} className="grid grid-cols-[3.2em_1fr] gap-3 py-2.5 text-[14px] leading-7">
                  <dt className="font-medium text-ink-soft">{r.label}</dt>
                  <dd>{r.text}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Link href={`/p/${id}/outfit`}
            className="mt-3 inline-flex items-center gap-1 text-[14px] text-accent underline-offset-4 hover:underline">
            {L.toOutfit}<ArrowRight className="size-3.5" />
          </Link>
        </Section>
      )}
    </Page>
  );
}

function Layer({ which, children, testId }: { which: keyof typeof L.layers; children: React.ReactNode; testId: string }) {
  const meta = L.layers[which];
  return (
    <section aria-label={meta.title} data-testid={testId}
      className={s.layer}>
      <p className="text-[11px] tracking-[0.18em] text-muted">{meta.n} {meta.kicker}</p>
      <h2 className="mb-2 font-serif text-[18px] font-semibold">{meta.title}</h2>
      {children}
    </section>
  );
}

function FeaturesLayer({ v }: { v: StyleView }) {
  return (
    <Layer which="features" testId="layer-features">
      <ul className="space-y-3">
        {v.features.map((f) => (
          <li key={f.key}>
            <p className="text-[14px] font-medium">{f.word}</p>
            {f.evidence.length ? (
              <ul className="mt-1 space-y-1">
                {f.evidence.map((o) => (
                  <li key={o.id} className="flex gap-2 text-[13px] leading-6 text-ink-soft">
                    <span className="mt-[3px] h-fit shrink-0 rounded bg-paper-sunk px-1.5 font-mono text-[11px] leading-5 text-muted">{o.id}</span>
                    <span>{o.text}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-1 text-[13px] text-muted">{L.noEvidence}</p>}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[12px] text-muted">{L.featuresHint}</p>
    </Layer>
  );
}

function LooksLayer({ v, low, id }: { v: StyleView; low: boolean; id: string }) {
  const { primary, secondary, between, frame, overall, overallWords } = v.looks;
  return (
    <Layer which="looks" testId="layer-looks">
      {low ? (
        <>
          <p className="text-[16px] font-medium">{v.looks.region}</p>
          <div className="mt-2"><ConfidenceNote level="low" tip={L.lowConfidence} /></div>
        </>
      ) : (
        <>
          <p className="text-[16px] font-medium">{primary.name}</p>
          <p className="mt-0.5 text-[14px] text-ink-soft">
            {between ? L.between(primary.name, secondary.name) : L.near(primary.name, secondary.name)}
          </p>
          <Guide />
        </>
      )}
      <p className="mt-2 text-[13px] leading-6 text-muted">{L.circle}</p>
      <p className="mt-2 text-[13px] leading-6 text-ink-soft">
        {frame && overall ? L.overall(frame, overallWords) : (
          <>{L.overallMissing} <Link href={`/p/${id}/more`} className="text-accent underline-offset-4 hover:underline">{L.overallLink}</Link></>
        )}
      </p>
      <div className="mt-3"><ResembleFor target="style" /></div>
    </Layer>
  );
}

function LikesLayer({ v }: { v: StyleView }) {
  return (
    <Layer which="likes" testId="layer-likes">
      {v.liked.length ? (
        <div className="flex flex-wrap gap-1.5">{v.liked.map((s) => <Pill key={s.key} tone="accent">{s.name}</Pill>)}</div>
      ) : <p className="text-[13px] leading-6 text-muted">{L.likesEmpty}</p>}
      {v.disliked.length > 0 && (
        <p className="mt-2 text-[13px] text-ink-soft">{L.dislikedPrefix}{v.disliked.map((s) => s.name).join("、")}</p>
      )}
    </Layer>
  );
}

function WantsLayer({ v }: { v: StyleView }) {
  return (
    <Layer which="wants" testId="layer-wants">
      {v.target ? (
        <>
          <div><Pill tone="amber">{v.target.name}</Pill></div>
          <p className="mt-2 text-[13px] leading-6 text-ink-soft">{L.transition(v.looks.primary.name, v.target.name, v.target.words)}</p>
          <Transition />
        </>
      ) : <p className="text-[13px] leading-6 text-muted">{L.wantsEmpty}</p>}
    </Layer>
  );
}

type Mode = "like" | "target" | "dislike";

export function StylePicker({ v }: { v: StyleView }) {
  const { id, busy, sendFeedback } = usePassport();
  const [mode, setMode] = React.useState<Mode>("like");
  const liked = new Set<string>(v.liked.map((s) => s.key));
  const disliked = new Set<string>(v.disliked.map((s) => s.key));
  const selected = (key: StyleKey) =>
    mode === "like" ? liked.has(key) : mode === "dislike" ? disliked.has(key) : v.target?.key === key;
  const pick = (key: StyleKey) => {
    const on = selected(key);
    // like / dislike toggle; a target is replaced by choosing another one.
    const reaction = mode === "target" ? "target" : on ? "neutral" : mode;
    if (mode === "target" && on) return;
    void sendFeedback({ target_type: "style", target_id: key, reaction });
    api.track("feedback", { passport_id: id });
  };
  return (
    <Card>
      <div role="radiogroup" aria-label="选择方式" className="mb-3 inline-flex rounded-full bg-paper-sunk p-1">
        {(Object.keys(L.picker.modes) as Mode[]).map((m) => (
          <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)}
            className={cn("min-h-11 rounded-full px-3 py-1.5 text-[13px] transition-colors",
              mode === m ? "bg-paper-raised font-medium text-ink shadow-sm" : "text-muted")}>
            {L.picker.modes[m]}
          </button>
        ))}
      </div>
      <p className="mb-3 text-[13px] text-muted">{L.picker.hint[mode]}</p>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="八种风格方向">
        {v.names.map((s) => {
          const on = selected(s.key);
          const isLooks = s.key === v.looks.primary.key;
          return (
            <li key={s.key}>
              <button type="button" aria-pressed={on} disabled={busy} onClick={() => pick(s.key)}
                data-style={s.key}
                className={cn("flex h-full min-h-[60px] w-full flex-col items-start rounded-[4px] border px-3 py-2.5 text-left transition-colors disabled:opacity-60",
                  on
                    ? mode === "target" ? "border-amber bg-amber-soft" : mode === "dislike" ? "border-rule-strong bg-paper-sunk" : "border-accent bg-accent-soft"
                    : "border-rule bg-paper hover:bg-paper-sunk")}>
                <span className="text-[15px] font-medium">{s.name}</span>
                {isLooks && <span className="text-[11px] text-muted">{L.picker.looks}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[12px] leading-5 text-muted">{copy.explanation}</p>
      {v.note && (
        <p role="status" data-testid="style-change-note" className="mt-3 rounded-[4px] bg-accent-soft px-3 py-2 text-[13px] text-accent">
          {L.picker.lastChange}：{v.note}
        </p>
      )}
    </Card>
  );
}

/** config/styles.yaml guidance from derived.style_profile.guide (examples follow the user's presentation). */
function Guide() {
  const g = usePassport().passport?.derived.style_profile.guide;
  if (!g || (!g.summary_zh && !g.examples_zh.length)) return null;
  return (
    <div className="mt-3 border-t border-rule pt-3">
      {g.summary_zh && <p className="text-[13px] leading-6 text-ink-soft">{g.summary_zh}</p>}
      {g.examples_zh.length > 0 && (
        <ul className="mt-2 space-y-1 text-[13px] leading-6">
          {g.examples_zh.map((e) => <li key={e} className="flex gap-2"><span className="mt-2.5 h-px w-3 shrink-0 bg-amber" aria-hidden />{e}</li>)}
        </ul>
      )}
    </div>
  );
}

function Transition() {
  const t = usePassport().passport?.derived.style_profile.guide.transition;
  if (!t) return null;
  return (
    <dl className="mt-3 grid gap-2 text-[13px] leading-6">
      {t.keep_zh.length > 0 && <div><dt className="text-muted">保留</dt><dd>{t.keep_zh.join("；")}</dd></div>}
      {t.add_zh.length > 0 && <div><dt className="text-muted">加入</dt><dd>{t.add_zh.join("；")}</dd></div>}
    </dl>
  );
}
