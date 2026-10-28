"use client";

import Link from "next/link";
import * as React from "react";
import { report as copy } from "@/lib/copy/zh";
import { sampleReportResponse } from "@/lib/fixture/backend";
import { DEMO_CASES, type DemoCase } from "@/lib/fixtures/demo_cases";
import { StaticPassportProvider } from "@/lib/state/passport-store";
import { cn } from "@/lib/utils";
import s from "./full-report.module.css";
import { EntitlementTable, FullReport } from "./full-report";

export type SampleVariant = "female" | "male" | DemoCase["key"];

const href = (k: SampleVariant) => (k === "p001" ? "/report/sample" : `/report/sample?v=${k}`);

/** The public sample report, fully unlocked, rendered by the same report component as a real passport.
 *  Default: pipeline-backed reports of AI-generated fictional people (Issue #14); the older illustrated female/male
 *  samples stay reachable. Read-only: no feedback, no previews requested, nothing stored. */
export function SampleReport({ variant }: { variant: SampleVariant }) {
  const demo = DEMO_CASES.find((c) => c.key === variant) ?? null;
  const data = React.useMemo(() => sampleReportResponse(demo ? demo.id : variant), [demo, variant]);
  return (
    <StaticPassportProvider value={{ data }}>
      <p role="note" className="bg-amber-soft px-4 py-1.5 text-center text-[12px] text-amber">
        {demo ? `${copy.sampleKicker} · ${copy.demo.disclosureTitle}` : `${copy.sampleKicker} · 虚构档案，不代表任何真人`}
      </p>
      <nav aria-label={copy.demo.selectorLabel} className={s.sampleNav}>
        <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
          <div className="flex gap-1 rounded-full border border-rule p-0.5" data-testid="sample-person-selector">
            {DEMO_CASES.map((c) => (
              <Link key={c.key} href={href(c.key)} aria-current={c.key === variant ? "page" : undefined}
                className={cn("rounded-full px-3 py-1", c.key === variant ? "bg-ink text-paper" : "text-ink-soft hover:text-ink")}>
                {c.label}
              </Link>
            ))}
          </div>
          <details className={s.sampleLegacy}><summary>{copy.demo.illustrated}</summary><div>{(["female", "male"] as const).map((k) => (
            <Link key={k} href={`/report/sample?v=${k}`} aria-current={k === variant ? "page" : undefined}
              className={cn("underline-offset-4 hover:underline", k === variant ? "text-ink" : "text-muted")}>
              {copy.sampleVariants[k]}
            </Link>
          ))}</div></details>
        </div>
      </nav>
      <FullReport sample />
      {demo && <DemoDisclosure c={demo} />}
      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-12">
        <div aria-hidden className="hidden lg:block" />
        <div className="max-w-3xl">
        <EntitlementTable />
        <div className="mt-8 flex flex-col items-center gap-2 rounded-[16px] bg-paper-sunk px-5 py-7 text-center">
          <p className="font-serif text-[18px] font-semibold">{copy.sampleCta}</p>
          <Link href="/start" data-cta="primary"
            className="mt-2 flex h-12 w-full max-w-[320px] items-center justify-center rounded-full bg-accent px-8 text-[15px] font-medium text-[var(--ap-on-primary)]">
            上传一张正脸 · 免费
          </Link>
        </div>
        </div>
      </section>
    </StaticPassportProvider>
  );
}

/** Prominent "AI-generated fictional person" disclosure plus the provenance a visitor can check. */
function DemoDisclosure({ c }: { c: DemoCase }) {
  const L = c.provenance.layers;
  return (
    <aside role="note" data-testid="demo-disclosure"
      className="mx-auto mt-4 max-w-6xl px-4 sm:px-6">
      <div className="rounded-[14px] border border-amber/40 bg-amber-soft px-4 py-3 text-[13px] leading-6 text-ink">
        <p className="font-semibold">{copy.demo.disclosureTitle}</p>
        <p>{copy.demo.disclosureBody}</p>
        <ul className="mt-1 list-disc pl-5 text-[12.5px] text-ink-soft">
          <li>{copy.demo.provenance(L.analysis.model, L.scoring.scoring_version ?? "—", c.provenance.built_at.slice(0, 10))}</li>
          <li>{L.cv.side_view.qc_accepted ? copy.demo.sideMeasured : copy.demo.sideMissing}</li>
          <li>{copy.demo.noPreviews}</li>
          <li>{copy.demo.noLearned}</li>
        </ul>
        <p className="mt-1 text-[11.5px] text-muted">{c.provenance.snapshot_version} · {c.provenance.person_id}</p>
      </div>
    </aside>
  );
}
