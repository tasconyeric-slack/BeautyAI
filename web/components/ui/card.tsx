import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-sm border border-rule bg-paper-raised", className)} {...props} />;
}

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[2px] border border-rule-strong px-1.5 py-px text-[11px] leading-5 text-ink-soft",
        className,
      )}
      {...props}
    />
  );
}
