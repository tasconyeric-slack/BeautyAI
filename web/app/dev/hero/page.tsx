import { notFound } from "next/navigation";
import { demoCaseByKey } from "@/lib/fixtures/demo_cases";
import { HeroPreview } from "./preview";
import { heroInsight } from "./model";

export const metadata = { title: "BeautyAI · Hero 视觉预览", robots: { index: false, follow: false } };

export default function HeroPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  const subject = demoCaseByKey("p002")!;
  return <HeroPreview subject={{ key: subject.key, label: subject.label, photo: subject.photos.front, width: subject.geometry.width, height: subject.geometry.height }} insight={heroInsight(subject)} />;
}
