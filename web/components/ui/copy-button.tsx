"use client";

import { Check, Copy } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function CopyButton({ text, label = "复制", className }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = React.useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      toast.success("已复制");
      setTimeout(() => setDone(false), 1600);
    } catch {
      toast.error("复制失败，请长按文字手动复制");
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        "no-print inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[12px] text-muted hover:bg-paper-sunk hover:text-ink",
        className,
      )}
      aria-label={label}
    >
      {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {label}
    </button>
  );
}
