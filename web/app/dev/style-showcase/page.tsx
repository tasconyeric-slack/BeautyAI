import { notFound } from "next/navigation";
import { StyleShowcase } from "@/components/style-showcase/style-showcase";

export const metadata = { title: "造型展示 · BeautyAI", robots: { index: false, follow: false } };

export default function StyleShowcasePage() {
  if (process.env.NODE_ENV !== "development" && process.env.VERCEL_ENV !== "preview") notFound();
  return <StyleShowcase />;
}
