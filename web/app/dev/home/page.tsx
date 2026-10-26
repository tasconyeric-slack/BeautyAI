import { notFound } from "next/navigation";
import { demoCaseByKey } from "@/lib/fixtures/demo_cases";
import { Analysis } from "./analysis";
import { Hero } from "./hero";
import { heroView } from "./model";
import s from "./home.module.css";

export const metadata = { title: "首页视觉预览", robots: { index: false } };

/** Development-only art-direction preview of the homepage hero + first analysis section. Production → 404.
 *  Does not replace or touch the production homepage. */
export default function HomePreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  const c = demoCaseByKey("p002");
  const hero = c ? heroView(c) : null;
  if (!c || !hero) notFound();
  return (
    <div className={s.root} data-home-preview>
      {/* The preview owns the whole canvas: hide the shared site chrome only while this route is mounted. */}
      <style>{`body:has([data-home-preview])>header,body:has([data-home-preview])>footer{display:none}`}</style>
      <Hero v={hero} />
      <Analysis c={c} reportHref={hero.reportHref} />
    </div>
  );
}
