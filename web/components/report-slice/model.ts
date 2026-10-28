"use client";

import * as React from "react";
import type { PassportResponse } from "@/lib/api";
import { photosGone } from "@/components/report/report-model";

export function photoExpired(media: PassportResponse["media"], now = Date.now()) {
  return media.expired || Boolean(media.expires_at && Date.parse(media.expires_at) <= now);
}

/** Re-check the deadline even when the response has stopped polling. No media is persisted here. */
export function usePhotosGone(media: PassportResponse["media"]) {
  const [now, setNow] = React.useState(Date.now);
  React.useEffect(() => {
    const refresh = () => setNow(Date.now());
    refresh();
    const deadline = media.expires_at ? Date.parse(media.expires_at) : NaN;
    const delay = deadline - Date.now();
    const timer = Number.isFinite(delay) && delay > 0 ? window.setTimeout(refresh, Math.min(delay, 2_147_483_647)) : null;
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      if (timer !== null) clearTimeout(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [media.expires_at, media.expired, media.front]);
  return photosGone(media, Math.max(now, Date.now()));
}
