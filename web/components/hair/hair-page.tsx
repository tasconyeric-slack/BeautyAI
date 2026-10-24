"use client";

/** 发型建议 (V2.1 §5.1): three full-width recommendation cards stacked vertically on every width.
 *  Cards are advice, not image editors: "试试这个发型" opens the Look Studio with the direction preselected, and
 *  "就选这个" opens a short hairstylist brief (copy / save). */
import { ArrowRight, Check, Copy, Scissors, Sparkles } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";
import { FeedbackFor } from "@/components/adjust/feedback-for";
import { AdjustPanel } from "@/components/adjust/adjust-panel";
import { Sheet } from "@/components/passport/sheet";
import { Locked, NotReady, Page, PageHeader, Pill } from "@/components/passport/ui";
import { Button } from "@/components/ui/button";
import { hairOptions, stylistBrief, type HairOptionView, type Tier } from "@/lib/adapters";
import { useChoices } from "@/lib/state/choices";
import { usePassport } from "@/lib/state/passport-store";
import { cn } from "@/lib/utils";

export function HairPage() {
  const { id, passport, data } = usePassport();
  const { choices } = useChoices(id);
  const [briefFor, setBriefFor] = React.useState<Tier | null>(null);
  if (!passport || !data) return <NotReady />;
  const options = hairOptions(passport, data.partial.previews);
  const locked = data.entitlement.locked.filter((l) => l.startsWith("hair_options."));
  const hd = passport.analysis.hair_direction;
  const c = passport.user_context.constraints;
  const conditions = [
    c.accepts_perm ? "可以烫" : "不烫",
    c.accepts_dye ? "可以染" : "不染",
    passport.user_context.hair?.grow_out_ok === false ? "不留长" : null,
    `每天 ${c.daily_minutes} 分钟内`,
  ].filter(Boolean).join(" · ");
  return (
    <Page>
      <PageHeader kicker="个性化建议 · 发型" title="三个方向，选一个带去发型店"
        sub={`${hd.texture_approach}。稳妥、突破、省心三个方向各有取舍，先看哪个更适合你现在的生活。`} />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-[12px] bg-paper-sunk px-4 py-2.5 text-[13px]">
        <span className="min-w-0 text-ink-soft"><span className="text-muted">按你的条件：</span>{conditions}</span>
        <AdjustPanel trigger={(open) => <button type="button" onClick={open} className="shrink-0 text-accent underline-offset-4 hover:underline">修改条件</button>} />
      </div>

      <ol className="flex flex-col gap-5" aria-label="三个发型方向">
        {options.map((o, i) => (
          <li key={o.tier}>
            <HairCard o={o} first={i === 0} chosen={choices.hair?.tier === o.tier} onChoose={() => setBriefFor(o.tier)} />
          </li>
        ))}
      </ol>
      {locked.length > 0 && <Locked what="其余发型方向" bullets={["三个方向的完整参数与沟通话术", "AI 发型试看与组合造型"]} />}

      <section className="mt-8 rounded-[14px] border border-rule bg-paper-raised p-4">
        <h2 className="font-serif text-[17px] font-semibold">不论选哪个方向</h2>
        <dl className="mt-2 grid gap-2 text-[14px] leading-7">
          {hd.keep.length > 0 && <div><dt className="inline font-medium">保留 · </dt><dd className="inline text-ink-soft">{hd.keep.join("、")}</dd></div>}
          {hd.change.length > 0 && <div><dt className="inline font-medium">改变 · </dt><dd className="inline text-ink-soft">{hd.change.join("、")}</dd></div>}
          {hd.avoid.length > 0 && <div><dt className="inline font-medium">避免 · </dt><dd className="inline text-ink-soft">{hd.avoid.join("、")}</dd></div>}
        </dl>
      </section>

      <StudioEntry id={id} paid={data.entitlement.paid} />
      <StylistBriefSheet tier={briefFor} onClose={() => setBriefFor(null)} />
    </Page>
  );
}

function StudioEntry({ id, paid }: { id: string; paid: boolean }) {
  return (
    <Link href={`/p/${id}/studio`} className="mt-4 flex items-center gap-3 rounded-[14px] bg-ink p-4 text-paper">
      <Sparkles className="size-5 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium">在形象实验室里试发型</span>
        <span className="block text-[12px] text-paper/75">{paid ? "发型、发色、唇色和近脸色组合到同一张照片" : "AI 发型试看包含在完整护照中；唇色与近脸色可以先免费试"}</span>
      </span>
      <ArrowRight className="size-4 shrink-0" />
    </Link>
  );
}

function HairCard({ o, first, chosen, onChoose }: { o: HairOptionView; first: boolean; chosen: boolean; onChoose: () => void }) {
  const { id, data } = usePassport();
  const excluded = o.status === "excluded";
  const pv = o.preview?.status === "succeeded" && o.preview.after_url ? o.preview : null;
  return (
    <article aria-labelledby={`hair-${o.tier}`}
      className={cn("rounded-[16px] border bg-paper-raised p-4 sm:p-5", chosen ? "border-accent ring-1 ring-accent" : "border-rule", excluded && "opacity-75")}>
      <header className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Pill tone={o.tier === "safe" ? "accent" : o.tier === "bold" ? "amber" : "muted"}>{o.tierZh}</Pill>
            {first && !excluded && <Pill tone="muted">按你的条件排第一</Pill>}
            {chosen && <Pill tone="accent"><Check className="mr-0.5 size-3" />已选</Pill>}
          </div>
          <h3 id={`hair-${o.tier}`} className="mt-1.5 font-serif text-[20px] font-semibold leading-snug">{o.name}</h3>
          <p className="text-[13px] text-muted">{o.role}</p>
        </div>
        {pv && (
          <Link href={`/p/${id}/studio?hair=${o.tier}`} className="relative block w-[72px] shrink-0 overflow-hidden rounded-[10px] bg-[var(--ap-stage)]" aria-label={`${o.name}的 AI 试看，在实验室打开`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pv.after_url!} alt="" className="block aspect-[4/5] w-full object-cover" />
            <span className="absolute inset-x-0 bottom-0 bg-black/55 py-0.5 text-center text-[10px] text-white">AI 试看</span>
          </Link>
        )}
      </header>

      {o.why.length > 0 && (
        <section className="mt-4">
          <h4 className="text-[12px] tracking-[0.12em] text-muted">为什么适合你</h4>
          <ul className="mt-1 space-y-1 text-[14px] leading-7">
            {o.why.map((w) => <li key={w} className="flex gap-2"><span aria-hidden className="mt-3 h-px w-3 shrink-0 bg-amber" />{w}</li>)}
          </ul>
        </section>
      )}

      <section className="mt-4">
        <h4 className="text-[12px] tracking-[0.12em] text-muted">剪成什么样</h4>
        <dl className="mt-1 grid grid-cols-[4.5em_1fr] gap-x-3 gap-y-1 text-[14px] sm:grid-cols-[4.5em_1fr_4.5em_1fr]">
          {o.params.map((p) => (
            <React.Fragment key={p.label}><dt className="text-muted">{p.label}</dt><dd>{p.value}</dd></React.Fragment>
          ))}
        </dl>
      </section>

      <section className="mt-4">
        <h4 className="text-[12px] tracking-[0.12em] text-muted">打理与代价</h4>
        <p className="mt-1 text-[14px] leading-7">
          每天约 <span className="tnum">{o.minutes}</span> 分钟 · 每 <span className="tnum">{o.trimWeeks}</span> 周修剪
          {o.maintenanceNote && <span className="text-ink-soft"> · {o.maintenanceNote}</span>}
        </p>
        {o.requires.length > 0 && <p className="text-[13px] text-amber">{o.requires.join("、")}</p>}
        {o.issues.map((i) => <p key={i} className="text-[13px] text-[#b4442f]">{i}</p>)}
        <p className="mt-1 text-[13px] text-ink-soft"><span className="text-muted">避免：</span>{o.avoid}</p>
      </section>

      <div className="mt-4 border-t border-rule pt-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="accent" className="sm:flex-1" onClick={onChoose} disabled={excluded}><Scissors />{chosen ? "查看发型师简报" : "就选这个"}</Button>
          {!excluded && !data?.media.expired && (
            <Button asChild variant="outline" className="sm:flex-1">
              <Link href={`/p/${id}/studio?hair=${o.tier}`}><Sparkles />试试这个发型</Link>
            </Button>
          )}
        </div>
        <div className="mt-3"><FeedbackFor type="hair_option" target={o.tier} /></div>
      </div>
    </article>
  );
}

/** "就选这个": the concise brief to show or send to a hairstylist (V2.1 §5.3). */
export function StylistBriefSheet({ tier, onClose }: { tier: Tier | null; onClose: () => void }) {
  const { id, passport, sendFeedback } = usePassport();
  const { choices, chooseHair } = useChoices(id);
  const brief = passport && tier ? stylistBrief(passport, tier) : null;
  const saved = Boolean(tier && choices.hair?.tier === tier);
  const copyText = async () => {
    if (!brief) return;
    try {
      await navigator.clipboard.writeText(brief.text);
      toast.success("已复制，可以直接发给发型师");
    } catch {
      toast(brief.text);
    }
  };
  const save = () => {
    if (!tier) return;
    chooseHair(tier);
    sendFeedback({ target_type: "hair_option", target_id: tier, reaction: "like", reason_tags: [] });
    toast.success("已保存到我的行动方案");
  };
  return (
    <Sheet open={Boolean(brief)} onClose={onClose} kicker={brief ? `发型师简报 · ${brief.tierZh}` : undefined} title={brief?.name ?? ""}
      footer={brief && (
        <div className="flex flex-col gap-2">
          <Button variant="accent" size="lg" className="w-full" onClick={copyText} data-autofocus><Copy />复制给发型师</Button>
          <Button variant="outline" size="lg" className="w-full" onClick={save} disabled={saved}>
            {saved ? <><Check />已保存到我的方案</> : "保存到我的方案"}
          </Button>
          <Link href={`/p/${id}/share#stylist`} className="pt-1 text-center text-[12px] text-muted underline-offset-4 hover:underline">导出沟通卡图片</Link>
        </div>
      )}>
      {brief && (
        <div className="space-y-4 text-[14px] leading-7">
          <section>
            <h3 className="text-[12px] tracking-[0.12em] text-muted">直接这样说</h3>
            <ol className="mt-1 space-y-1.5">
              {brief.scripts.map((s, i) => (
                <li key={s} className="flex gap-3"><span className="tnum mt-0.5 text-[13px] text-accent">0{i + 1}</span><span>{s}</span></li>
              ))}
            </ol>
          </section>
          {brief.avoid.length > 0 && (
            <section className="border-l-2 border-amber pl-3">
              <h3 className="text-[12px] tracking-[0.12em] text-amber">请避免</h3>
              <ul className="mt-0.5">{brief.avoid.map((a) => <li key={a}>{a}</li>)}</ul>
            </section>
          )}
          <section>
            <h3 className="text-[12px] tracking-[0.12em] text-muted">打理要求</h3>
            <p>{brief.upkeep}</p>
            {brief.requires.length > 0 && <p className="text-[13px] text-amber">{brief.requires.join("、")}</p>}
          </section>
          <p className="text-[12px] text-muted">具体长度与层次以现场发质为准，可以把这页给发型师看。</p>
        </div>
      )}
    </Sheet>
  );
}
