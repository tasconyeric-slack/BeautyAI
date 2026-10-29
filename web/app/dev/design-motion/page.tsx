import { notFound } from "next/navigation";
import { demoCaseByKey } from "@/lib/fixtures/demo_cases";
import { chapters, heroView } from "@/components/home/model";
import { DesignMotion } from "@/components/design-motion/design-motion";

export const metadata = { title: "BeautyAI · R3.1 整站体验", robots: { index: false, follow: false } };

export default async function DesignMotionPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  if (process.env.NODE_ENV !== "development" && process.env.VERCEL_ENV !== "preview") notFound();
  const sample = demoCaseByKey("p002");
  const hero = sample && heroView(sample);
  if (!sample || !hero) notFound();
  const { view } = await searchParams;
  return <DesignMotion hero={hero} readings={chapters(sample, 0.85)} view={view === "studio" || view === "report" ? view : "home"} />;
}
