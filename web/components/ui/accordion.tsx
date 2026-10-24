"use client";

import { ChevronDown } from "lucide-react";
import { Accordion as A } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

export const Accordion = A.Root;

export function AccordionItem({ className, ...props }: React.ComponentProps<typeof A.Item>) {
  return <A.Item className={cn("border-t border-rule", className)} {...props} />;
}

export function AccordionTrigger({ className, children, ...props }: React.ComponentProps<typeof A.Trigger>) {
  return (
    <A.Header className="flex">
      <A.Trigger
        className={cn(
          "group flex flex-1 items-center justify-between py-2.5 text-left text-[13px] font-medium text-ink-soft hover:text-ink",
          className,
        )}
        {...props}
      >
        {children}
        <ChevronDown className="size-4 text-muted transition-transform duration-200 group-data-[state=open]:rotate-180" />
      </A.Trigger>
    </A.Header>
  );
}

export function AccordionContent({ className, children, ...props }: React.ComponentProps<typeof A.Content>) {
  return (
    <A.Content
      className="overflow-hidden data-[state=closed]:animate-none"
      {...props}
    >
      <div className={cn("pb-3", className)}>{children}</div>
    </A.Content>
  );
}
