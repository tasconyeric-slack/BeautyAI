"use client";

import Link from "next/link";
import { Card, Locked, NotReady, Page, PageHeader, Section } from "@/components/passport/ui";
import { usePassport } from "@/lib/state/passport-store";
import s from "@/components/advice/advice.module.css";

const SHAPE_ZH: Record<string, string> = { round: "圆框", oval: "椭圆框", rectangular: "长方框", square: "方框", cat_eye: "猫眼框",
  aviator: "飞行员框", browline: "眉线框", geometric: "多边形框", rimless: "无框" };

export default function GlassesPage() {
  const { id, passport, data } = usePassport();
  if (!passport || !data) return <NotReady />;
  const gd = passport.analysis.glasses_direction;
  const size = passport.derived.glasses_size;
  return (
    <Page>
      <PageHeader kicker="眼镜与配饰" title={gd ? gd.frame_shapes.map((s) => SHAPE_ZH[s] ?? s).join(" · ") : "暂不需要换镜框"} />
      <div className="my-5 rounded-[4px] border border-rule bg-paper-raised p-6 sm:p-8">
        <p className="mb-2 text-[13px] text-ink-soft">把圆框、长方框和猫眼框放到自己的正脸上比较，可调颜色、宽度和位置。</p>
        <Link href={`/p/${id}/studio#eyewear`} className="inline-flex min-h-11 items-center text-accent underline underline-offset-4">进入实验室试戴眼镜 →</Link>
      </div>
      <div className={s.details}>{gd && (
        <Section title="镜框方向">
          <Card>
            <p className="text-[14px]">宽度：{gd.frame_width === "matched" ? "与颧骨同宽" : gd.frame_width === "wider" ? "略宽于颧骨" : "略窄于颧骨"} · 粗细：{gd.frame_weight === "thin" ? "细" : gd.frame_weight === "medium" ? "中等" : "粗"}</p>
            <div className="mt-4 flex flex-wrap gap-3">{gd.colors.map((c) => <span key={c.hex} className="flex items-center gap-1 text-[13px]"><span className="size-4 rounded-full" style={{ background: c.hex }} />{c.name}</span>)}</div>
            <p className="mt-2 text-[13px] text-muted">避免：{gd.avoid.join("、")}</p>
          </Card>
        </Section>
      )}
      <Section title="尺寸">
        {size ? (
          <Card>
            {size.total_width_mm ? (
              <dl className="grid grid-cols-3 gap-2 text-center">
                <div><dt className="text-[12px] text-muted">镜框总宽</dt><dd className="tnum font-serif text-[20px]">{size.total_width_mm[0]}–{size.total_width_mm[1]}</dd></div>
                <div><dt className="text-[12px] text-muted">镜片宽</dt><dd className="tnum font-serif text-[20px]">{size.lens_width_mm?.[0]}–{size.lens_width_mm?.[1]}</dd></div>
                <div><dt className="text-[12px] text-muted">鼻梁</dt><dd className="tnum font-serif text-[20px]">{size.bridge_mm?.[0]}–{size.bridge_mm?.[1]}</dd></div>
              </dl>
            ) : null}
            <p className="mt-2 text-[13px] text-ink-soft">{size.note_zh}</p>
          </Card>
        ) : data.entitlement.locked.includes("glasses_size") ? <Locked what="镜框 mm 尺寸" /> : <p className="text-[13px] text-muted">需要清晰的正脸测量才能换算尺寸。</p>}
      </Section>
      </div>
    </Page>
  );
}
