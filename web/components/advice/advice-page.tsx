"use client";

/** 个性化建议 (V2.1 §3B): one decision per group — what to choose, why, what to avoid, what it takes — with entry
 *  points to the detail page and, where it can be seen on the photo, the Look Studio. Text advice, free (D33). */
import { ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { AdjustPanel } from "@/components/adjust/adjust-panel";
import { NotReady, Page, PageHeader, Pill } from "@/components/passport/ui";
import { colorGroups, cover, hairOptions, rankedRecs, stripRefs } from "@/lib/adapters";
import type { Passport } from "@/lib/api";
import { usePassport } from "@/lib/state/passport-store";

const SHAPE_ZH: Record<string, string> = { round: "圆框", oval: "椭圆框", rectangular: "长方框", square: "方框", cat_eye: "猫眼框",
  aviator: "飞行员框", browline: "眉线框", geometric: "多边形框", rimless: "无框" };

interface AdviceGroup {
  key: string;
  title: string;
  choose: string;
  why?: string;
  avoid?: string;
  needs?: string[];
  swatches?: string[];
  page: string;
  studio?: string;
}

export function adviceGroups(p: Passport): AdviceGroup[] {
  const recs = rankedRecs(p);
  const recFor = (...cats: string[]) => recs.find((r) => cats.includes(r.category));
  const an = p.analysis;
  const hair = hairOptions(p).filter((h) => h.status !== "excluded");
  const top = hair[0];
  const hairRec = recFor("hairstyle");
  const md = an.makeup_direction;
  const grooming = md.mode === "grooming";
  const makeupRec = recFor("makeup", "brows", "facial_hair");
  const colorRec = recFor("color_palette");
  const glassesRec = recFor("glasses", "accessories");
  const outfitRec = recFor("clothing");
  const groups = colorGroups(p);
  const gd = an.glasses_direction;
  const od = an.outfit_direction;
  const out: AdviceGroup[] = [
    {
      key: "hair", title: "发型与发色",
      choose: top ? `${top.tierZh}方向：${top.name}${hair.length > 1 ? `（另有 ${hair.length - 1} 个方向可比较）` : ""}` : an.hair_direction.texture_approach,
      why: hairRec?.why ?? top?.why[0], avoid: an.hair_direction.avoid.join("、") || top?.avoid,
      needs: top ? [`每天约 ${top.minutes} 分钟`, `每 ${top.trimWeeks} 周修剪`, ...top.requires] : undefined,
      swatches: an.color_profile.hair_color_directions.map((h) => h.hex), page: "hair", studio: top ? `?hair=${top.tier}` : "",
    },
    {
      key: "makeup", title: grooming ? "理容" : "妆容",
      choose: grooming ? md.grooming[0] ?? md.base_tone : md.lip, why: makeupRec?.why ?? md.eye_focus,
      avoid: makeupRec?.avoid, needs: makeupRec ? [makeupRec.effort, makeupRec.cost, makeupRec.time].filter(Boolean) as string[] : undefined,
      swatches: grooming ? undefined : an.color_profile.lip_families.slice(0, 4).map((l) => l.hex), page: "makeup",
      studio: grooming || !an.color_profile.lip_families[0] ? undefined : `?lip=${an.color_profile.lip_families[0].hex.slice(1)}`,
    },
    {
      key: "color", title: "个人色彩", choose: p.derived.display_labels.color.summary_zh,
      why: colorRec?.why ?? groups[0].reasons[0], avoid: groups[2].colors.slice(0, 3).map((c) => c.name_zh).join("、") || undefined,
      swatches: groups[0].colors.slice(0, 5).map((c) => c.hex), page: "color",
      studio: groups[0].colors[0] ? `?drape=${groups[0].colors[0].hex.slice(1)}` : undefined,
    },
    { key: "style", title: "风格方向", choose: cover(p).styleLine, why: an.profile_summary.best_direction, page: "style" },
    {
      key: "glasses", title: "眼镜与配饰",
      choose: gd ? gd.frame_shapes.map((s) => SHAPE_ZH[s] ?? s).join(" · ") : "暂不需要换镜框",
      why: glassesRec?.why, avoid: gd?.avoid.join("、"), swatches: gd?.colors.map((c) => c.hex), page: "glasses",
    },
    {
      key: "outfit", title: "穿搭", choose: od.formulas[0] ? `${od.formulas[0].title}：${od.formulas[0].pieces.join(" + ")}` : "看穿搭公式",
      why: outfitRec?.why ?? od.formulas[0]?.why, avoid: outfitRec?.avoid, swatches: od.items.slice(0, 5).map((i) => i.hex), page: "outfit",
    },
  ];
  return out.map((g) => ({ ...g, why: g.why && stripRefs(g.why), avoid: g.avoid && stripRefs(g.avoid) }));
}

export function AdvicePage() {
  const { id, passport } = usePassport();
  if (!passport) return <NotReady />;
  const groups = adviceGroups(passport);
  const base = `/p/${id}`;
  return (
    <Page>
      <PageHeader back={false} kicker="个性化建议" title="选什么、为什么、需要什么"
        sub="每组只给一个最值得先试的选择；点进去看完整说明，能在照片上看的可以直接去实验室。" />
      <div className="mb-4 flex justify-end"><AdjustPanel /></div>
      <ol className="space-y-3">
        {groups.map((g) => (
          <li key={g.key}>
            <article className="rounded-[16px] border border-rule bg-paper-raised p-4">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-serif text-[18px] font-semibold">{g.title}</h2>
                {g.swatches && g.swatches.length > 0 && (
                  <span className="flex shrink-0 gap-1" aria-hidden>{g.swatches.slice(0, 5).map((h, i) => <span key={`${h}${i}`} className="size-4 rounded-full border border-black/10" style={{ background: h }} />)}</span>
                )}
              </div>
              <dl className="mt-2 space-y-1.5 text-[14px] leading-7">
                <div><dt className="inline text-muted">选什么 · </dt><dd className="inline font-medium">{g.choose}</dd></div>
                {g.why && <div><dt className="inline text-muted">为什么 · </dt><dd className="inline text-ink-soft">{g.why}</dd></div>}
                {g.avoid && <div><dt className="inline text-muted">避免 · </dt><dd className="inline text-ink-soft">{g.avoid}</dd></div>}
              </dl>
              {g.needs && g.needs.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{g.needs.map((n) => <Pill key={n}>{n}</Pill>)}</div>}
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 border-t border-rule pt-3 text-[14px]">
                <Link href={`${base}/${g.page}`} className="inline-flex items-center gap-1 text-accent underline-offset-4 hover:underline">怎么做 <ArrowRight className="size-3.5" /></Link>
                {g.studio !== undefined && (
                  <Link href={`${base}/studio${g.studio}`} className="inline-flex items-center gap-1 text-ink-soft underline-offset-4 hover:underline"><Sparkles className="size-3.5" />在实验室里试</Link>
                )}
              </div>
            </article>
          </li>
        ))}
      </ol>
      <Link href={`${base}/plan`} className="mt-6 flex items-center justify-between rounded-[14px] bg-ink p-4 text-paper">
        <span><span className="block text-[15px] font-medium">把建议变成行动方案</span><span className="block text-[12px] text-paper/75">按优先级排好的 3 件事，可以保存和勾选完成</span></span>
        <ArrowRight className="size-4" />
      </Link>
    </Page>
  );
}
