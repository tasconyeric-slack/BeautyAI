"use client";

// V2.1: guidance and swatches here; trying colours on the photo happens in the Look Studio (D30).
import { Sparkles } from "lucide-react";
import Link from "next/link";
import { Card, Locked, NotReady, Page, PageHeader, Section } from "@/components/passport/ui";
import { guidance } from "@/lib/copy/zh";
import { usePassport } from "@/lib/state/passport-store";

export default function MakeupPage() {
  const { id, passport, data } = usePassport();
  if (!passport || !data) return <NotReady />;
  const md = passport.analysis.makeup_direction;
  const lips = passport.analysis.color_profile.lip_families;
  const grooming = md.mode === "grooming";
  return (
    <Page>
      <PageHeader kicker={grooming ? "理容" : "妆容方向"} title={grooming ? "干净利落的理容习惯" : md.lip}
        sub={grooming ? md.base_tone : `${md.base_tone}；${md.eye_focus}`} />
      {grooming ? (
        <Section title="日常理容">
          <ul className="space-y-2">{md.grooming.map((g) => <li key={g} className="rounded-[4px] border border-rule bg-paper-raised px-6 py-5 text-[14px]">{g}</li>)}</ul>
        </Section>
      ) : (
        <Section title="唇色" kicker="点一个颜色，在实验室里试">
          <ul className="grid gap-4 sm:grid-cols-2">
            {lips.map((l) => (
              <li key={l.hex}>
                <Link href={`/p/${id}/studio?lip=${l.hex.slice(1)}`}
                  className="flex items-center gap-3 rounded-[4px] border border-rule bg-paper-raised px-5 py-5 hover:border-ink/40">
                  <span className="size-6 shrink-0 rounded-full border border-black/10" style={{ background: l.hex }} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px]">{l.name}</span>
                    <span className="mt-1 block text-[13px] leading-6 text-muted">{l.note}</span>
                  </span>
                  <span className="shrink-0 text-[12px] text-accent">在实验室试</span>
                </Link>
              </li>
            ))}
          </ul>
          <Link href={`/p/${id}/studio${lips[0] ? `?lip=${lips[0].hex.slice(1)}` : ""}`}
            className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-[14px] text-accent underline-offset-4 hover:underline">
            <Sparkles className="size-4" />在形象实验室里和发型、近脸色一起看
          </Link>
          <p className="mt-1 text-[12px] text-muted">{guidance.makeupCaution}</p>
          {data.entitlement.locked.includes("makeup.lip_families") && <Locked what="完整唇色色板与浓度档" />}
        </Section>
      )}
      <Section title="细节">
        <Card>
          <dl className="space-y-2 text-[14px] leading-7">
            <div><dt className="text-[12px] text-muted">腮红</dt><dd className="flex items-center gap-2"><span className="size-4 rounded-full" style={{ background: md.blush.hex }} />{md.blush.note}</dd></div>
            <div><dt className="text-[12px] text-muted">眉形</dt><dd>{md.brow}</dd></div>
          </dl>
        </Card>
      </Section>
    </Page>
  );
}
