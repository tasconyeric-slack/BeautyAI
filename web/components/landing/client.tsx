"use client";

import * as React from "react";
import { trackLandingView } from "@/lib/landing-event";

/** Records one `landing_view` per mount (guarded against the dev double effect). Sends only topic and ref. */
export function LandingView({ topic, refCode }: { topic: string | null; refCode: string | null }) {
  const sent = React.useRef(false);
  React.useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    trackLandingView(topic, refCode).catch(() => {});
  }, [topic, refCode]);
  return null;
}
