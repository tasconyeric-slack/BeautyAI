import { notFound } from "next/navigation";
import { V3HomePage } from "@/components/v3/homepage";

export const metadata = {
  title: "BeautyAI V3 · 视觉预览",
  robots: { index: false, follow: false },
};

/** Private-by-environment development/PR-preview route; never replaces the live homepage. */
export default function V3PreviewPage() {
  if (process.env.NODE_ENV !== "development" && process.env.VERCEL_ENV !== "preview") notFound();
  return <V3HomePage />;
}
