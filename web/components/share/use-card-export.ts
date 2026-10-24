"use client";

import * as React from "react";
import { toast } from "sonner";
import { exportPng } from "@/components/cards";
import { api } from "@/lib/api";
import { share as copy } from "@/lib/copy/zh";

/** Service name written to the PNG's AIGC metadata (GB 45438 Annex E `ContentProducer`). */
export const CONTENT_PRODUCER = "形象护照 Aesthetic Passport";

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Finds the mounted, unscaled card inside a preview container. */
export function cardNode(container: HTMLElement | null): HTMLElement | null {
  return container?.querySelector<HTMLElement>("[data-card]") ?? null;
}

/**
 * Exports one card as a labelled PNG (visible "AI 生成" mark is part of every card; `exportPng` adds the AIGC tEXt
 * metadata), downloads it and records `share_card_export`. `prepare` runs first (e.g. creating the short link the card
 * prints) and must leave the DOM updated; `after` always runs, success or not (per-export consent resets there).
 */
export function useCardExport(passportId: string) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const run = React.useCallback(async (opts: {
    kind: string;
    container: HTMLElement | null;
    filename: string;
    prepare?: () => Promise<void>;
    after?: () => void;
  }) => {
    setBusy(opts.kind);
    try {
      await opts.prepare?.();
      const node = cardNode(opts.container);
      if (!node) throw new Error("card not mounted");
      const blob = await exportPng(node, {
        ContentProducer: CONTENT_PRODUCER,
        ProduceID: `${passportId}:${opts.kind}:${Date.now().toString(36)}`,
      });
      downloadBlob(blob, opts.filename);
      api.track("share_card_export", { passport_id: passportId });
      toast.success(copy.exported);
      return true;
    } catch {
      toast.error(copy.exportFailed);
      return false;
    } finally {
      setBusy(null);
      opts.after?.();
    }
  }, [passportId]);
  return { busy, run };
}
