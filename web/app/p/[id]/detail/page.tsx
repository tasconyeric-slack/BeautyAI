"use client";

import Link from "next/link";
import { NotReady, Page, PageHeader, Section } from "@/components/passport/ui";
import s from "@/components/detail/detail.module.css";
import { usePassport } from "@/lib/state/passport-store";

export default function DetailPage() {
  const { id, passport } = usePassport();
  if (!passport) return <NotReady />;
  return (
    <Page>
      <PageHeader kicker="详细分析" title="依据在照片上" sub="测量来自关键点模型，观察来自分析模型，排序与校验来自规则；三者分开记录。" />
      <Section title="观察">
        <dl className={s.observations}>{passport.analysis.observations.map((o) => (
          <div key={o.id} className={s.row}><dt>{o.id}</dt><dd>{o.text}</dd></div>
        ))}</dl>
        <Link className={s.next} href={`/p/${id}/face`}>在照片上查看测量依据</Link>
      </Section>
      <Section title="局限">
        <ul className={s.limitations}>{passport.analysis.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
      </Section>
    </Page>
  );
}
