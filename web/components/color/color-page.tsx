"use client";

/** 个人色彩与数字披布 (F7 · A6): three colour groups, a local digital drape, two-colour compare, shopping phrases. */
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
import { DrapeStage, stageNote } from "./drape-stage";
import {
  colorSearchPhrase, colorTargetId, contrastAdvice, contrastZh, GROUP_USE, toChips, type Chip, type GroupKey,
} from "./helpers";
import { useDrape } from "./use-drape";

export function ColorPage() {
  const { id, passport } = usePassport();
  const drape = useDrape();
  const groups = React.useMemo(() => (passport ? colorGroups(passport) : []).map((g) => ({
    ...g, chips: toChips(g.colors, g.key),
  })), [passport]);
  const all = React.useMemo(() => groups.flatMap((g) => g.chips), [groups]);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [compare, setCompare] = React.useState(false);
  const [pair, setPair] = React.useState<[string | null, string | null]>([null, null]);
  const [slot, setSlot] = React.useState(0);


  if (!passport) return <NotReady />;
  const cp = passport.analysis.color_profile;
  const label = passport.derived.display_labels.color;
  const level = confidenceLevel(label.confidence);
  const seasonal = passport.derived.display_labels.seasonal_leaning;
  const find = (hex: string | null) => all.find((c) => c.hex === hex) ?? null;
  const first = (k: GroupKey) => groups.find((g) => g.key === k)?.chips[0] ?? null;
  const current = find(selected) ?? first("favor") ?? all[0] ?? null;
  const left = find(pair[0]) ?? first("favor");
  const right = find(pair[1]) ?? first("caution") ?? first("neutral");
  const photo = drape.status === "ready" || drape.status === "loading";

  const pick = (chip: Chip) => {
    setSelected(chip.hex);
    if (!compare) return;
    setPair((p) => (slot === 0 ? [chip.hex, p[1] ?? right?.hex ?? null] : [p[0] ?? left?.hex ?? null, chip.hex]));
    setSlot((s) => 1 - s);
  };
  const families = { favor: cp.favor_families, neutral: cp.neutral_families, caution: cp.caution_families };
  const reason = (chip: Chip) => families[chip.group].find((f) => f.name === chip.family)?.reason ?? "";
  const hairMeasured = passport.color_measurements?.regions?.hair?.hex;
  const skinMeasured = passport.color_measurements?.regions?.skin?.hex;

  return (
    <Page>
      <PageHeader kicker="个人色彩" title={label.summary_zh}
        sub="点一个色块，照片下巴下方就换一块“布”。同一张脸、同一光线，只换颜色。" />
      <Section title="数字披布" kicker={photo ? (compare ? "两色并排" : "点色块切换") : undefined}
        action={photo ? (
          <div className="flex rounded-full border border-rule bg-paper-raised p-0.5 text-[12px]" role="group" aria-label="披布视图">
            {([[false, "逐个切换"], [true, "两色并排"]] as const).map(([v, t]) => (
              <button key={t} type="button" aria-pressed={compare === v} onClick={() => { setCompare(v); setSlot(0); }}
                className={cn("whitespace-nowrap rounded-full px-3 py-1", compare === v ? "bg-ink text-paper" : "text-ink-soft")}>{t}</button>
            ))}
          </div>
        ) : undefined}>
        {photo ? (
          <DrapeStage status={drape.status} paint={drape.paint} shown={compare ? [left, right] : [current]}
            activeSlot={slot} onSlot={setSlot} />
        ) : (
          <Card className="text-[13px] leading-6 text-ink-soft"><p role="note">{stageNote(drape.status)}</p></Card>
        )}
        {photo && compare && <p className="mt-2 text-[12px] text-muted">点下方色块，填入高亮的一侧；点照片下方的名字可切换要换的一侧。</p>}
        {current && <CurrentColor key={current.hex} chip={current} reason={reason(current)} />}
        <Link href={`/p/${id}/studio${current ? `?drape=${current.hex.slice(1)}` : ""}`}
          className="mt-3 inline-block text-[13px] text-accent underline-offset-4 hover:underline">
          在形象实验室里，和发型、唇色组合着看 →
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
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="group" aria-label={`${g.title}色卡`}>
            {g.chips.map((chip) => {
              const on = compare ? chip.hex === left?.hex || chip.hex === right?.hex : chip.hex === current?.hex;
              return (
                <button key={chip.hex} type="button" aria-pressed={on} onClick={() => pick(chip)}
                  className={cn("rounded-[12px] border bg-paper-raised p-1.5 text-left transition-colors",
                    on ? "border-ink ring-1 ring-ink" : "border-rule hover:border-rule-strong")}>
                  <span className="block h-12 rounded-[8px] border border-black/10" style={{ background: chip.hex }} aria-hidden="true" />
                  <span className="mt-1.5 block truncate px-0.5 text-[13px]">{chip.label}</span>
                  <span className="tnum block px-0.5 text-[10px] uppercase text-muted">{chip.hex}</span>
                </button>
              );
            })}
          </div>
          <ul className="mt-2 space-y-1 text-[13px] leading-6 text-ink-soft">{g.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
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
                <li key={c.name} className="flex items-center gap-3 rounded-[12px] border border-rule bg-paper-raised px-3 py-2.5">
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
              <li key={h.name} className="flex items-start gap-3 rounded-[12px] border border-rule bg-paper-raised p-3">
                <span className="mt-0.5 size-8 shrink-0 rounded-full border border-black/10" style={{ background: h.hex }} aria-hidden="true" />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-[14px]">{h.name}{h.requires_dye ? <Pill>需要染发</Pill> : <Pill tone="accent">不用染</Pill>}</span>
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
    <div className="mt-3 rounded-[14px] border border-rule bg-paper-raised p-3" aria-live="polite">
      <div className="flex items-center gap-3">
        <span className="size-10 shrink-0 rounded-[10px] border border-black/10" style={{ background: chip.hex }} aria-hidden="true" />
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
