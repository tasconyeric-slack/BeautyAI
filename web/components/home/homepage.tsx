import Link from "next/link";
import { demoCaseByKey } from "@/lib/fixtures/demo_cases";
import { privacy } from "@/lib/copy/zh";
import { LandingView } from "@/components/landing/client";
import { Landing } from "@/components/landing/landing";
import { Analysis } from "./analysis";
import { Choices } from "./choices";
import { Hero } from "./hero";
import { ProductJourney } from "./product-journey";
import { chapters, decisions, heroView } from "./model";
import s from "./home.module.css";

/** Approved Hero and measured evidence, followed by the existing product journey. */
export function HomePage() {
  const male = demoCaseByKey("p002");
  const female = demoCaseByKey("p001");
  const hero = male ? heroView(male) : null;
  const femalePlate = female ? heroView(female)?.plate : null;
  if (!male || !hero) return <Landing />;
  return (
    <div className={s.root} data-homepage>
      <style>{`body:has([data-homepage])>header,body:has([data-homepage])>footer{display:none}`}</style>
      <LandingView topic={null} refCode={null} />
      <Hero v={hero} />
      <Analysis plate={hero.plate} chapters={chapters(male, 0.8)} reportHref={hero.reportHref} />
      {female && femalePlate && <Choices plate={femalePlate} decisions={decisions(female)} reportHref="/report/sample?v=p001" />}
      <ProductJourney sample={female ?? male} />
      <footer className={s.privacy} aria-label="照片与数据说明">
        <Link href="/" className={s.brandMark}>BeautyAI</Link>
        <ul>{privacy.facts.map((fact) => <li key={fact}>{fact}</li>)}</ul>
        <p>造型建议供个人选择参考，不提供医疗建议。</p>
        <Link href="/about">分析方法与照片隐私 ↗</Link>
      </footer>
    </div>
  );
}
