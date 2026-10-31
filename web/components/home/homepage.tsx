import { demoCaseByKey } from "@/lib/fixtures/demo_cases";
import { LandingView } from "@/components/landing/client";
import { Landing } from "@/components/landing/landing";
import { DesignMotion } from "@/components/design-motion/design-motion";
import { startHref, type Topic } from "@/components/landing/cases";
import { topics } from "@/lib/copy/zh";
import { chapters, heroView } from "./model";

/** R3.1 continuous reading, using the approved measured example and original Hero. */
export function HomePage({ topic = null, refCode = null }: { topic?: Topic | null; refCode?: string | null }) {
  const sample = demoCaseByKey("p002");
  const hero = sample && heroView(sample);
  if (!sample || !hero) return <Landing topic={topic} refCode={refCode} />;
  return <><LandingView topic={topic} refCode={refCode} /><DesignMotion hero={hero} readings={chapters(sample, 0.85)} view="home" production uploadHref={startHref(topic, refCode)} headline={topic ? topics[topic].title : undefined} subtitle={topic ? topics[topic].subtitle : undefined} /></>;
}
