"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/** Per-export consent: unchecked by default, the caller resets it after every export (D23 / PRD B8). */
export function ConsentCheck({ checked, onChange, label, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; id: string }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5 rounded-[12px] border border-amber/40 bg-amber-soft px-3.5 py-3 text-[13px] leading-6">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
        className="mt-1 size-4 shrink-0 accent-[var(--ap-primary)]" />
      <span>{label}<span className="block text-[12px] text-muted">每次导出都需要重新勾选。</span></span>
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T; options: { value: T; label: string; disabled?: boolean }[]; onChange: (v: T) => void; label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-full border border-rule bg-paper-raised p-0.5">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={cn("rounded-full px-3.5 py-1.5 text-[13px] transition-colors disabled:opacity-40",
            value === o.value ? "bg-ink text-paper" : "text-ink-soft hover:text-ink")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function useOrigin() {
  const [origin, setOrigin] = React.useState("");
  React.useEffect(() => setOrigin(window.location.origin), []);
  return origin;
}

/** Shown on cards: no protocol, keeps the ref so a scan / visit can be attributed (PRD F17). */
export const printedLink = (url: string, ref: string) =>
  `${url}${url.includes("?") ? "&" : "?"}ref=${ref}`.replace(/^https?:\/\//, "");

export const withRef = (url: string, ref: string) => `${url}${url.includes("?") ? "&" : "?"}ref=${ref}`;
