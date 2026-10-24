"use client";

import { Copy, Share2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

/** Copy a plain-text list, or hand it to the system share sheet where the browser has one. No link, no photo. */
export function ShareActions({ text, title, testId }: { text: string; title: string; testId: string }) {
  const [canShare, setCanShare] = React.useState(false);
  React.useEffect(() => setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function"), []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("清单已复制");
    } catch {
      toast.error("复制失败，请长按清单文字手动复制");
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title, text });
    } catch {
      /* dismissed the sheet */
    }
  };
  const cls = "inline-flex min-h-10 items-center gap-1.5 rounded-full border border-rule-strong px-4 text-[13px] text-accent";
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" data-testid={`${testId}-copy`} className={cls} onClick={copy}><Copy className="size-3.5" />复制清单</button>
      {canShare && <button type="button" data-testid={`${testId}-share`} className={cls} onClick={share}><Share2 className="size-3.5" />分享</button>}
    </div>
  );
}
