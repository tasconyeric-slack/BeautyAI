"use client";

import { X } from "lucide-react";
import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/** Bottom sheet on phones, centred dialog from `sm` up. Esc, the backdrop and the close button dismiss it; focus moves
 *  into the sheet on open, is kept inside while open, and returns to the opener on close. */
export function Sheet({ open, onClose, title, kicker, children, footer, className }: {
  open: boolean; onClose: () => void; title: string; kicker?: string; children: React.ReactNode; footer?: React.ReactNode;
  className?: string;
}) {
  const panel = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  React.useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => panel.current?.querySelector<HTMLElement>("[data-autofocus], button, a[href]")?.focus(), 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab" || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input, [tabindex]:not([tabindex='-1'])")];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      opener?.focus?.();
    };
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 sm:items-center sm:p-6" onClick={onClose}>
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(e) => e.stopPropagation()}
        className={cn("ap-rise flex max-h-[90dvh] w-full max-w-lg flex-col rounded-t-[20px] bg-paper shadow-xl sm:rounded-[18px]", className)}>
        <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-5">
          <div className="min-w-0">
            {kicker && <p className="text-[11px] tracking-[0.18em] text-muted">{kicker}</p>}
            <h2 id={titleId} className="font-serif text-[20px] font-semibold leading-snug">{title}</h2>
          </div>
          <button type="button" aria-label="关闭" onClick={onClose} className="-mr-1 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-paper-sunk hover:text-ink">
            <X className="size-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>
        {footer && <div className="border-t border-rule px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
