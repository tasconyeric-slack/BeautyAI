"use client";

import { Popover as P } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;

export function PopoverContent({
  className,
  align = "start",
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content
        align={align}
        sideOffset={sideOffset}
        collisionPadding={12}
        className={cn(
          "z-50 w-[min(20rem,calc(100vw-24px))] rounded-sm border border-rule-strong bg-paper-raised p-3 text-[13px] leading-relaxed text-ink shadow-[0_8px_24px_-12px_rgba(0,0,0,0.25)] outline-none",
          className,
        )}
        {...props}
      />
    </P.Portal>
  );
}
