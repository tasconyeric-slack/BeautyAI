"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { FullReport } from "@/components/report/full-report";
import { landTopicKey } from "@/components/upload/start-flow";
import { Reveal } from "@/components/reveal/reveal";
import { usePassport } from "@/lib/state/passport-store";
import { LoadingState } from "@/components/passport/states";

/** Legacy report root: progress while building, then the same full report as /report (D44). */
export default function PassportPage() {
  const { id, data, loading } = usePassport();
  const router = useRouter();
  const ready = data?.status === "full_ready";
  React.useEffect(() => {
    // Topic entry (/t/[topic]) lands on its sub-page once the passport is ready (D1).
    if (!ready) return;
    try {
      const topic = sessionStorage.getItem(landTopicKey(id));
      if (topic) {
        sessionStorage.removeItem(landTopicKey(id));
        router.replace(`/p/${id}/${topic}`);
      }
    } catch {
      /* ignore */
    }
  }, [id, ready, router]);
  if (loading || !data) return <LoadingState />;
  if (data.status === "qc_failed") return <QcFailed />;
  if (data.status !== "full_ready" || !data.passport) return <Reveal />;
  return <FullReport />;
}

function QcFailed() {
  const { data } = usePassport();
  const guidance = data?.partial.input_quality?.retake_guidance ?? [];
  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <h1 className="font-serif text-[22px] font-semibold">这张照片需要重拍</h1>
      <ul className="mt-4 space-y-2 text-[14px] leading-7 text-ink-soft">{guidance.map((g) => <li key={g}>· {g}</li>)}</ul>
      <a href="/start" className="mt-6 inline-block rounded-full bg-accent px-5 py-2.5 text-[14px] text-[var(--ap-on-primary)]">换一张照片</a>
    </div>
  );
}
