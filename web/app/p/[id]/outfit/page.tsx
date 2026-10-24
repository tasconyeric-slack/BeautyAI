"use client";

// TODO(B3): neckline / colour comparison on the photo, occasion boards, frame-aware hints.
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { FeedbackFor } from "@/components/adjust/feedback-for";
import { Card, Locked, NotReady, Page, PageHeader, Section } from "@/components/passport/ui";
import { stripRefs } from "@/lib/adapters";
import { adjustments } from "@/lib/copy/zh";
import { usePassport } from "@/lib/state/passport-store";

export default function OutfitPage() {
  const { passport, data } = usePassport();
  if (!passport || !data) return <NotReady />;
  const od = passport.analysis.outfit_direction;
  const checks = new Map(passport.derived.outfit_checks.items.map((i) => [i.garment_id, i]));
  const locked = data.entitlement.locked;
  return (
    <Page>
      <PageHeader kicker="穿搭推荐" title="把风格和色彩变成能照着穿的搭配" sub={passport.user_context.body?.frame ? undefined : "加入身形后更准（在“补充一点”里自行选择，不分析身材照片）。"} />
      <Section title="搭配公式">
        <ol className="space-y-3">
          {od.formulas.map((f, i) => (
            <li key={f.title}><Card>
              <p className="text-[12px] text-muted">公式 {i + 1}</p>
              <p className="font-serif text-[17px]">{f.title}</p>
              <p className="mt-1 text-[14px]">{f.pieces.join(" + ")}</p>
              <p className="mt-1 text-[13px] text-ink-soft">{stripRefs(f.why)}</p>
            </Card></li>
          ))}
        </ol>
        {locked.includes("outfit.formulas") && <Locked what="更多搭配公式与场合方案" />}
      </Section>
      <Section title="核心单品" kicker="点复制，直接去搜">
        <ul className="grid gap-3 sm:grid-cols-2">
          {od.items.map((it) => {
            const c = checks.get(it.garment_id);
            const search = c?.search_zh ?? `${it.color_name} ${it.name_zh}`;
            return (
              <li key={it.garment_id}><Card className="h-full">
                <div className="flex items-start gap-3">
                  <span className="mt-1 size-8 shrink-0 rounded-full border border-black/10" style={{ background: it.hex }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-medium">{it.color_name}{it.name_zh}</p>
                    <p className="text-[13px] text-ink-soft">{stripRefs(it.why)}</p>
                    {c?.issues.map((x) => <p key={x} className="text-[12px] text-amber">{x}</p>)}
                    <button type="button" className="mt-1 inline-flex items-center gap-1 text-[12px] text-accent"
                      onClick={() => navigator.clipboard?.writeText(search).then(() => toast.success("已复制搜索词"), () => toast(search))}>
                      <Copy className="size-3" />{search}
                    </button>
                    <div className="mt-2"><FeedbackFor type="garment" target={it.garment_id} /></div>
                  </div>
                </div>
              </Card></li>
            );
          })}
        </ul>
        {locked.includes("outfit.items") && <Locked what="全部单品清单" />}
      </Section>
      {od.occasions.length > 0 && (
        <Section title="场合方案">
          <ul className="space-y-2">{od.occasions.map((o) => <li key={o.occasion}><Card><p className="text-[12px] text-muted">{adjustments.occasions[o.occasion]}</p><p className="text-[14px]">{o.look}</p></Card></li>)}</ul>
        </Section>
      )}
    </Page>
  );
}
