"use client";

import * as React from "react";
import { api } from "@/lib/api";

/** Records one `landing_view` per mount (guarded against the dev double effect). Sends only topic and ref. */
export function LandingView({ topic, refCode }: { topic: string | null; refCode: string | null }) {
  const sent = React.useRef(false);
  React.useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    api.track("landing_view", { topic, ref: refCode }).catch(() => {});
  }, [topic, refCode]);
  return null;
}
