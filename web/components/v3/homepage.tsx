import Link from "next/link";
import { demoCaseByKey } from "@/lib/fixtures/demo_cases";
import { Hero } from "@/components/home/hero";
import { heroView, decisions, chapters } from "@/components/home/model";
import home from "@/components/home/home.module.css";
import { Transformation } from "./transformation";
import { Intelligence } from "./intelligence";
import s from "./v3.module.css";

/** Server-first assembly: current registered measurement masters and report-derived fields only. */
export function V3HomePage() {
  const male = demoCaseByKey("p002");
  const female = demoCaseByKey("p001");
  const maleHero = male ? heroView(male) : null;
  const femaleHero = female ? heroView(female) : null;
  if (!maleHero || !male || !femaleHero || !female) {
    return <main className={s.fallback}><p>示例资料暂不可用。</p><Link href="/">返回首页</Link></main>;
  }

  const femaleDecisions = decisions(female);
  const hair = femaleDecisions.find((item) => item.kicker === "发型") ?? null;
  const hairOptions = female.passport.derived.hair_option_checks.map((item) => ({
    tier: item.tier,
    status: item.status,
    rank: item.rank,
    issue: item.issues[0] ?? null,
  }));

  return (
    <div data-v3-home className={home.root}>
      <style>{"body:has([data-v3-home])>header,body:has([data-v3-home])>footer{display:none}"}</style>
      <Hero v={maleHero} />
      <Transformation plate={femaleHero.plate} hair={hair} options={hairOptions} />
      <Intelligence
        p001={{ plate: femaleHero.plate, chapters: femaleDecisions, reportHref: femaleHero.reportHref }}
        p002={{ plate: maleHero.plate, chapters: chapters(male, 0.82), reportHref: maleHero.reportHref }}
      />
      <footer className={s.footer}>
        <Link href="/" className={s.footerBrand}>BeautyAI</Link>
        <p>示例人物均为 AI 合成。面部标注来自对应分析照片；造型为文字建议，尚无获批的发型变化配对图。</p>
        <div className={s.footerLinks}>
          <Link href="/about">方法与隐私</Link>
          <Link href="/report/sample?v=p001" prefetch={false}>完整示例报告</Link>
          <Link href="/start" prefetch={false}>开始分析 →</Link>
        </div>
      </footer>
    </div>
  );
}
