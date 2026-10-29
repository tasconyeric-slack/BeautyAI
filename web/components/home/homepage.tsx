import { demoCaseByKey } from "@/lib/fixtures/demo_cases";
import { LandingView } from "@/components/landing/client";
import { Landing } from "@/components/landing/landing";
import { DesignMotion } from "@/components/design-motion/design-motion";
import { chapters, heroView } from "./model";

/** R3.1 continuous reading, using the approved measured example and original Hero. */
export function HomePage() {
  const sample = demoCaseByKey("p002");
  const hero = sample && heroView(sample);
  if (!sample || !hero) return <Landing />;
  return <><LandingView topic={null} refCode={null} /><DesignMotion hero={hero} readings={chapters(sample, 0.85)} view="home" production /></>;
}
