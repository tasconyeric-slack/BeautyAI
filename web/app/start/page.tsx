import type { Metadata } from "next";
import { Suspense } from "react";
import { StartFlow } from "@/components/upload/start-flow";
import s from "@/components/journey/journey.module.css";

export const metadata: Metadata = { title: "上传一张正脸" };

export default function StartPage() {
  return (
    <div className={s.surface}><Suspense>
      <StartFlow />
    </Suspense></div>
  );
}
