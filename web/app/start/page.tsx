import type { Metadata } from "next";
import { Suspense } from "react";
import { StartFlow } from "@/components/upload/start-flow";

export const metadata: Metadata = { title: "上传一张正脸" };

export default function StartPage() {
  return (
    <Suspense>
      <StartFlow />
    </Suspense>
  );
}
