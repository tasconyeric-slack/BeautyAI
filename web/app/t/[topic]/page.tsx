import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HomePage } from "@/components/home/homepage";
import { TOPIC_KEYS, cleanRef, isTopic } from "@/components/landing/cases";
import { topics } from "@/lib/copy/zh";

/** D1 topic entries: /t/face|hair|style|color|outfit. Same upload; only the first-screen copy and example change.
 * `?ref=` (note / video attribution) is passed through to /start. */
export function generateStaticParams() {
  return TOPIC_KEYS.map((topic) => ({ topic }));
}

export async function generateMetadata({ params }: { params: Promise<{ topic: string }> }): Promise<Metadata> {
  const { topic } = await params;
  return isTopic(topic) ? { title: topics[topic].title, description: topics[topic].subtitle } : {};
}

export default async function TopicPage({ params, searchParams }: {
  params: Promise<{ topic: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { topic } = await params;
  if (!isTopic(topic)) notFound();
  const { ref } = await searchParams;
  return <HomePage topic={topic} refCode={cleanRef(ref)} />;
}
