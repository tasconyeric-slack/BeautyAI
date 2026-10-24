"use client";

import { useCallback, useEffect, useState, type ButtonHTMLAttributes } from "react";
import "./tokens.css";

/** The one comparison control used everywhere (D31): press and hold to see the original.
 *  Pointer (mouse, pen, touch) with capture, plus Space / Enter for keyboards. Releasing, cancelling, losing capture
 *  or focus always ends the hold, so the view can never get stuck on the original. */
export function useHold() {
  const [holding, setHolding] = useState(false);
  const start = useCallback(() => setHolding(true), []);
  const stop = useCallback(() => setHolding(false), []);
  useEffect(() => {
    if (!holding) return;
    window.addEventListener("blur", stop);
    return () => window.removeEventListener("blur", stop);
  }, [holding, stop]);
  const props: ButtonHTMLAttributes<HTMLButtonElement> = {
    type: "button",
    "aria-pressed": holding,
    onPointerDown: (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      start();
    },
    onPointerUp: stop,
    onPointerCancel: stop,
    onLostPointerCapture: stop,
    onBlur: stop,
    onContextMenu: (e) => e.preventDefault(),
    onKeyDown: (e) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (!e.repeat) start();
      }
    },
    onKeyUp: (e) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        stop();
      }
    },
  };
  return { holding, props };
}

export interface HoldButtonProps {
  holding: boolean;
  props: ButtonHTMLAttributes<HTMLButtonElement>;
  label?: string;
  className?: string;
  disabled?: boolean;
}

export function HoldButton({ props, label = "按住看原图", className, disabled }: HoldButtonProps) {
  return (
    <button {...props} disabled={disabled} className={["ap-hold-btn", className].filter(Boolean).join(" ")}>
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="M8 1.8v12.4" stroke="currentColor" strokeWidth="1.3" /><path d="M8 1.8a6.2 6.2 0 0 1 0 12.4z" fill="currentColor" /></svg>
      {label}
    </button>
  );
}
