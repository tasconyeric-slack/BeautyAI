"use client";

import Link from "next/link";
import * as React from "react";
import { ArrowUpRight } from "lucide-react";
import { sampleReportResponse } from "@/lib/fixture/backend";
import { DEMO_CASES, type DemoCase } from "@/lib/fixtures/demo_cases";
import { StaticPassportProvider } from "@/lib/state/passport-store";
import s from "./full-report.module.css";
import { FullReport } from "./full-report";

export type SampleVariant = "female" | "male" | DemoCase["key"];

/** Public read-only reports share the personal report renderer. */
export function SampleReport({ variant }: { variant: SampleVariant }) {
  const demo = DEMO_CASES.find(c => c.key === variant) ?? null;
  const data = React.useMemo(() => sampleReportResponse(demo ? demo.id : variant), [demo, variant]);
  return <StaticPassportProvider value={{ data }}>
    <div className={s.sampleSurface}>
      <nav aria-label="示例报告" className={s.sampleNav}>
        <Link href="/">发现你的风格</Link><span className={s.sampleNavTitle}>一份报告，新的视角。</span>
      </nav>
      <FullReport sample />
      <section className={s.sampleClosing}><p>看懂特点，找到自己的表达。</p><h2>下一份，属于你。</h2><Link href="/start" data-cta="primary">建立我的形象护照 <ArrowUpRight size={18} /></Link><span>一张正脸，就可以开始。</span></section>
    </div>
  </StaticPassportProvider>;
}
