"use client";

import "./tokens.css";

export interface ResembleToggleProps {
  value: "yes" | "no" | null;
  onChange: (value: "yes" | "no" | null) => void;
}

export function ResembleToggle({ value, onChange }: ResembleToggleProps) {
  return <div className="ap-segmented ap-ds" role="group" aria-label="这个描述像你吗？">
    <button type="button" aria-pressed={value === "yes"} onClick={() => onChange(value === "yes" ? null : "yes")}>像我</button>
    <button type="button" aria-pressed={value === "no"} onClick={() => onChange(value === "no" ? null : "no")}>不太像</button>
  </div>;
}
