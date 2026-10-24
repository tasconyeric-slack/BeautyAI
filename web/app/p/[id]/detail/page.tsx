"use client";

// TODO(C2): layered annotated photo, observation highlighting, method notes.
import { Card, NotReady, Page, PageHeader, Section } from "@/components/passport/ui";
import { usePassport } from "@/lib/state/passport-store";

export default function DetailPage() {
  const { passport } = usePassport();
  if (!passport) return <NotReady />;
  return (
    <Page>
      <PageHeader kicker="详细分析" title="依据在照片上" sub="测量来自关键点模型，观察来自分析模型，排序与校验来自规则；三者分开记录。" />
      <Section title="观察">
        <ul className="space-y-2">{passport.analysis.observations.map((o) => (
          <li key={o.id}><Card><span className="tnum mr-2 text-[12px] text-muted">{o.id}</span><span className="text-[14px]">{o.text}</span></Card></li>
        ))}</ul>
      </Section>
      <Section title="局限">
        <ul className="list-disc space-y-1 pl-5 text-[13px] text-ink-soft">{passport.analysis.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
      </Section>
    </Page>
  );
}
