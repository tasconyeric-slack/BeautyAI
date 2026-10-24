"use client";

/** Stylist card (face hidden by default) and before/after card (3:4 · 9:16) for the share page. Any variant that puts
 *  the person's photo or AI preview on the card needs a fresh consent tick per export. */
import { Download, Loader2 } from "lucide-react";
import * as React from "react";
import { BeforeAfterCard, StylistCard } from "@/components/cards";
import { Scaled } from "@/components/passport/scaled";
import { Section } from "@/components/passport/ui";
import { Button } from "@/components/ui/button";
import { hairOptions, stylistCardProps, type Tier } from "@/lib/adapters";
import { share as copy } from "@/lib/copy/zh";
import { usePassport } from "@/lib/state/passport-store";
import { ConsentCheck, Segmented } from "./controls";
import type { useCardExport } from "./use-card-export";

type Exporter = ReturnType<typeof useCardExport>;
interface Props { exporter: Exporter; cardLink: string; ensureLink: () => Promise<string | null> }

/** Succeeded hair previews whose source photo still exists. */
function useHairPreviews() {
  const { data } = usePassport();
  if (!data || data.media.expired) return [];
  return data.partial.previews.filter((p) => p.kind === "hair" && p.status === "succeeded" && p.after_url && p.before_url);
}

export function StylistShare({ exporter, cardLink, ensureLink }: Props) {
  const { passport, data } = usePassport();
  const previews = useHairPreviews();
  const options = passport ? hairOptions(passport, data?.partial.previews ?? []).filter((o) => o.status !== "excluded") : [];
  const [tier, setTier] = React.useState<Tier | null>(null);
  const [showFace, setShowFace] = React.useState(false);
  const [consent, setConsent] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  if (!passport || options.length === 0) return null;
  const current = options.find((o) => o.tier === tier) ?? options[0];
  const preview = previews.find((p) => p.target_id === current.tier) ?? null;
  const faceShown = showFace && Boolean(preview?.after_url);
  const card = stylistCardProps(passport, current.tier, { previewSrc: faceShown ? preview?.after_url : null, hideFace: !faceShown, shortLink: cardLink });
  if (!card) return null;
  const reset = () => {
    setShowFace(false);
    setConsent(false);
  };
  return (
    <div id="stylist" className="scroll-mt-4"><Section title={copy.stylistCard} kicker="剪发前带上">
      {options.length > 1 && (
        <div className="mb-3">
          <Segmented label="发型方向" value={current.tier} onChange={(t) => { setTier(t); reset(); }}
            options={options.map((o) => ({ value: o.tier, label: `${o.tierZh} · ${o.name}` }))} />
        </div>
      )}
      <div ref={ref}>
        <Scaled className="mx-auto max-w-sm overflow-hidden rounded-[14px] border border-rule"><StylistCard {...card} /></Scaled>
      </div>
      <div className="mx-auto mt-3 flex max-w-sm flex-col gap-2">
        <label className="flex items-center gap-2.5 text-[13px]">
          <input type="checkbox" checked={!showFace} disabled={!preview} onChange={(e) => { setShowFace(!e.target.checked); setConsent(false); }}
            className="size-4 accent-[var(--ap-primary)]" />
          {copy.hideFace}
          {!preview && <span className="text-[12px] text-muted">（暂无试看图，显示参数插画）</span>}
        </label>
        {faceShown && <ConsentCheck id="consent-stylist" checked={consent} onChange={setConsent} label={copy.portraitConsent} />}
        <Button variant="outline" size="lg" className="w-full" data-testid="export-stylist"
          disabled={exporter.busy !== null || (faceShown && !consent)}
          onClick={() => exporter.run({
            kind: `stylist-${current.tier}`, container: ref.current, filename: `aesthetic-passport-stylist-${current.tier}.png`,
            prepare: async () => { await ensureLink(); }, after: reset,
          })}>
          {exporter.busy?.startsWith("stylist") ? <Loader2 className="animate-spin" /> : <Download />}保存沟通卡
        </Button>
      </div>
    </Section></div>
  );
}

export function BeforeAfterShare({ exporter, cardLink, ensureLink }: Props) {
  const { passport } = usePassport();
  const previews = useHairPreviews();
  const [ratio, setRatio] = React.useState<"3:4" | "9:16">("3:4");
  const [target, setTarget] = React.useState<string | null>(null);
  const [consent, setConsent] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  if (!passport || previews.length === 0) return null;
  const pv = previews.find((p) => p.target_id === target) ?? previews[0];
  const name = passport.analysis.hair_options.find((o) => o.tier === pv.target_id)?.name_zh;
  const tall = ratio === "9:16";
  return (
    <Section title={copy.beforeAfterCard} kicker="发型试看 · 前后对照">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented label="比例" value={ratio} onChange={(r) => { setRatio(r); setConsent(false); }}
          options={[{ value: "3:4", label: "3:4 小红书" }, { value: "9:16", label: "9:16 竖屏" }]} />
        {previews.length > 1 && (
          <Segmented label="试看方向" value={pv.target_id} onChange={(t) => { setTarget(t); setConsent(false); }}
            options={previews.map((p) => ({ value: p.target_id, label: passport.analysis.hair_options.find((o) => o.tier === p.target_id)?.name_zh ?? p.target_id }))} />
        )}
      </div>
      <div ref={ref}>
        <Scaled height={tall ? 1920 : 1440} className={`mx-auto overflow-hidden rounded-[14px] border border-rule ${tall ? "max-w-[18rem]" : "max-w-sm"}`}>
          <BeforeAfterCard beforeSrc={pv.before_url!} afterSrc={pv.after_url!} ratio={ratio} shortLink={cardLink}
            title={name ? `试一试：${name}` : undefined} />
        </Scaled>
      </div>
      <div className="mx-auto mt-3 flex max-w-sm flex-col gap-2">
        <ConsentCheck id="consent-before-after" checked={consent} onChange={setConsent} label={copy.portraitConsent} />
        <Button variant="outline" size="lg" className="w-full" data-testid="export-before-after"
          disabled={exporter.busy !== null || !consent}
          onClick={() => exporter.run({
            kind: `before-after-${ratio === "9:16" ? "9x16" : "3x4"}`, container: ref.current,
            filename: `aesthetic-passport-before-after-${ratio === "9:16" ? "9x16" : "3x4"}.png`,
            prepare: async () => { await ensureLink(); }, after: () => setConsent(false),
          })}>
          {exporter.busy?.startsWith("before-after") ? <Loader2 className="animate-spin" /> : <Download />}保存对比卡
        </Button>
        <p className="text-[12px] leading-5 text-muted">左下角固定“{copy.preview}”标识；AI 试看仅用于比较方向，实际效果取决于发质、光线与日常打理。</p>
      </div>
    </Section>
  );
}
