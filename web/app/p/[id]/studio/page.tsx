"use client";

import { Suspense } from "react";
import { LookStudio } from "@/components/studio/look-studio";

export default function StudioPage() {
  return <Suspense><LookStudio /></Suspense>;
}
