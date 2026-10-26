import { notFound } from "next/navigation";
import { HomePage } from "@/components/home/homepage";

export const metadata = { title: "首页视觉预览", robots: { index: false } };

/** Development entry uses the same components as the production homepage. */
export default function HomePreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <HomePage />;
}
