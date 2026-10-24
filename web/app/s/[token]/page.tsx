"use client";

import { useParams } from "next/navigation";
import { SharedView } from "@/components/share";

export default function SharedPage() {
  const { token } = useParams<{ token: string }>();
  return <SharedView token={decodeURIComponent(token)} />;
}
