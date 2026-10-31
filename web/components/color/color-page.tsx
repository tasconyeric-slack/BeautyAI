"use client";

/** Colour guidance and shopping phrases. Photo-based colour exploration lives in the shared Studio. */
import Link from "next/link";
import * as React from "react";
import { FeedbackFor, ResembleFor } from "@/components/adjust/feedback-for";
import { ConfidenceNote } from "@/components/ds";
import { Card, NotReady, Page, PageHeader, Pill, Section } from "@/components/passport/ui";
import { CopyButton } from "@/components/ui/copy-button";
import { colorGroups, confidenceLevel } from "@/lib/adapters";
import { guidance } from "@/lib/copy/zh";
import { usePassport } from "@/lib/state/passport-store";
import { cn } from "@/lib/utils";
import { ArrowRight } from "lucide-react";
import s from "./color.module.css";
import {
  colorSearchPhrase, colorTargetId, contrastAdvice, contrastZh, GROUP_USE, toChips, type Chip, type GroupKey,
} from "./helpers";

export function ColorPage() {
  const { id, passport, data } = usePassport();
  const groups = React.useMemo(() => (passport ? colorGroups(passport) : []).map((g) => ({
    ...g, chips: toChips(g.colors, g.key),
  })), [passport]);
  const all = React.useMemo(() => groups.flatMap((g) => g.chips), [groups]);
  const [selected, setSelected] = React.useState<string | null>(null);
  if (!passport) return <NotReady />;
  const cp = passport.analysis.color_profile;
  const label = passport.derived.display_labels.color;
  const level = confidenceLevel(label.confidence);
  const seasonal = passport.derived.display_labels.seasonal_leaning;
  const find = (hex: string | null) => all.find((c) => c.hex === hex) ?? null;
  const first = (k: GroupKey) => groups.find((g) => g.key === k)?.chips[0] ?? null;
  const current = find(selected) ?? first("favor") ?? all[0] ?? null;
  const families = { favor: cp.favor_families, neutral: cp.neutral_families, caution: cp.caution_families };
  const reason = (chip: Chip) => families[chip.group].find((f) => f.name === chip.family)?.reason ?? "";
  const hairMeasured = passport.color_measurements?.regions?.hair?.hex;
  const skinMeasured = passport.color_measurements?.regions?.skin?.hex;

  return (
    <Page>
      <PageHeader kicker="个人色彩" title={label.summary_zh}
        sub="先读懂适合你的颜色，再把喜欢的色彩带到 Studio，和发型、唇色一起比较。" />
      <Section title="先选一个颜色">
        <p className="text-[14px] leading-7 text-ink-soft">点下方色卡，查看选择理由和购物搜索词；照片上的近脸色预览统一在 Studio 中完成。</p>
        {data?.media.expired && <p role="note" className="mt-3 text-[13px] text-muted">{guidance.photoExpired}</p>}
        {current && <CurrentColor key={current.hex} chip={current} reason={reason(current)} />}
        <Link href={`/p/${id}/studio${current ? `?drape=${current.hex.slice(1)}` : ""}`} className={s.studioLink}>
          <span>{current ? `在 Studio 里试${current.label}` : "在 Studio 里试近脸色"}</span><ArrowRight className="size-4" aria-hidden />
        </Link>
      </Section>

      <div className="mt-6">
        <ConfidenceNote level={level} tip={`${guidance.colorCaution}${cp.lighting_caveat ? ` ${cp.lighting_caveat}` : ""}`} />
        {level !== "high" && (
          <div className="mt-2 text-[12px] leading-5 text-muted">
            <Pill tone="amber">白纸校准即将提供</Pill>
            <p className="mt-1">拿一张白纸放在脸旁拍一张，可校正白平衡、提升色彩判断的可靠度。</p>
          </div>
        )}
        {seasonal && <p className="mt-2 text-[12px] text-muted">{seasonal.text_zh}</p>}
        <div className="mt-4"><p className="mb-2 text-[13px] text-ink-soft">这个色彩结论像你吗？</p><ResembleFor target="color" /></div>
      </div>

      {groups.map((g) => (
        <Section key={g.key} title={g.title} kicker={GROUP_USE[g.key].role}>
          <div className={s.swatches} role="group" aria-label={`${g.title}色卡`}>
            {g.chips.map((chip) => {
              const on = chip.hex === current?.hex;
              return (
                <button key={chip.hex} type="button" aria-pressed={on} onClick={() => setSelected(chip.hex)}
                  className={cn(s.swatch,
                    on && "ring-1 ring-accent")}>
                  <span className="block h-20 rounded-[2px] border border-black/10" style={{ background: chip.hex }} aria-hidden="true" />
                  <span className="mt-1.5 block truncate px-0.5 text-[13px]">{chip.label}</span>
                  <span className="tnum block px-0.5 text-[10px] uppercase text-muted">{chip.hex}</span>
                </button>
              );
            })}
          </div>
          <ul className="mt-2 space-y-1 text-[13px] leading-6 text-ink-soft">{g.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
          {current?.group === g.key && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-4 text-[13px]">
            <p className="text-ink-soft">已选：{current.label}</p>
            <Link href={`/p/${id}/studio?drape=${current.hex.slice(1)}`} className="inline-flex min-h-11 items-center gap-2 text-accent underline underline-offset-4">
              把这个颜色带到 Studio<ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>}
        </Section>
      ))}

      <Section title="你的对比度" kicker={contrastZh(cp.contrast)}>
        <Card>
          {hairMeasured && skinMeasured && (
            <div className="mb-3" aria-hidden="true">
              <div className="h-3 rounded-full" style={{ background: `linear-gradient(90deg, ${hairMeasured}, ${skinMeasured})` }} />
              <div className="mt-1 flex justify-between text-[11px] text-muted"><span>发色</span><span>肤色</span></div>
            </div>
          )}
          <p className="text-[14px] leading-7">{contrastAdvice(cp.contrast)}</p>
        </Card>
      </Section>

      {cp.combos.length > 0 && (
        <Section title="搭配公式" kicker="购物时用">
          <ul className="space-y-2">
            {cp.combos.map((c) => {
              const names = c.hexes.map((h) => find(h)?.family).filter(Boolean) as string[];
              const phrase = `${names.length ? names.join(" ") : c.name} 穿搭`;
              return (
                <li key={c.name} className="flex items-center gap-3 rounded-[4px] border border-rule bg-paper-raised px-3 py-2.5">
                  <span className="flex shrink-0 overflow-hidden rounded-[6px] border border-black/10" aria-hidden="true">
                    {c.hexes.map((h) => <span key={h} className="block h-8 w-6" style={{ background: h }} />)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px]">{c.name}</span>
                    <span className="block text-[12px] text-muted">{c.use}</span>
                  </span>
                  <CopyButton text={phrase} label="搜索词" />
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {cp.hair_color_directions.length > 0 && (
        <Section title="发色方向" kicker="染发前参考" action={<Link href={`/p/${id}/hair`} className="text-[13px] text-accent">看发型 →</Link>}>
          <ul className="grid gap-2 sm:grid-cols-3">
            {cp.hair_color_directions.map((h) => (
              <li key={h.name} className="flex items-start gap-3 rounded-[4px] border border-rule bg-paper-raised p-3">
                <span className="mt-0.5 size-8 shrink-0 rounded-full border border-black/10" style={{ background: h.hex }} aria-hidden="true" />
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-1.5 text-[14px]">{h.name}{h.requires_dye ? <Pill>需要染发</Pill> : <Pill tone="accent">不用染</Pill>}</span>
                  <span className="mt-0.5 block text-[12px] leading-5 text-muted">{h.note}</span>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {cp.lip_families.length > 0 && (
        <Section title="口红色族" action={<Link href={`/p/${id}/makeup`} className="text-[13px] text-accent">去试色 →</Link>}>
          <div className="flex flex-wrap gap-2">
            {cp.lip_families.slice(0, 4).map((l) => (
              <span key={l.hex} className="inline-flex items-center gap-1.5 rounded-full border border-rule bg-paper-raised px-3 py-1 text-[13px]">
                <span className="size-3.5 rounded-full border border-black/10" style={{ background: l.hex }} aria-hidden="true" />{l.name}
              </span>
            ))}
          </div>
        </Section>
      )}
    </Page>
  );
}

function CurrentColor({ chip, reason }: { chip: Chip; reason: string }) {
  const phrase = colorSearchPhrase(chip);
  return (
    <div className={s.current} role="status" aria-live="polite">
      <div className="flex items-center gap-3">
        <span className="size-10 shrink-0 rounded-[4px] border border-black/10" style={{ background: chip.hex }} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium">{chip.label}
            <span className={cn("ml-2 text-[12px] font-normal", chip.group === "caution" ? "text-amber" : "text-muted")}>{GROUP_USE[chip.group].role}</span>
          </p>
          {reason && <p className="text-[12px] leading-5 text-muted">{reason}</p>}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-rule pt-2">
        <span className="flex items-center gap-1 text-[12px] text-ink-soft">搜索词「{phrase}」<CopyButton text={phrase} label="复制" /></span>
        <FeedbackFor type="color" target={colorTargetId(chip.hex)} />
      </div>
    </div>
  );
}
