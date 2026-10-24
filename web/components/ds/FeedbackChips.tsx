"use client";

import { useState } from "react";
import "./tokens.css";

export type FeedbackValue = "like" | "neutral" | "dislike" | null;
export interface FeedbackChipsProps {
  value: FeedbackValue;
  /** Available reason labels. Selected reasons are returned in onChange's second argument. */
  reasons: string[];
  onChange: (value: FeedbackValue, reasons: string[]) => void;
}

export function FeedbackChips({ value, reasons, onChange }: FeedbackChipsProps) {
  const [selected, setSelected] = useState<string[]>([]);
  function choose(next: Exclude<FeedbackValue, null>) {
    const reaction = value === next ? null : next;
    setSelected([]);
    onChange(reaction, []);
  }
  return <div className="ap-feedback ap-ds">
    <div className="ap-chips" role="group" aria-label="这个方向你喜欢吗？">
      {([ ["like", "喜欢"], ["neutral", "还可以"], ["dislike", "不喜欢"] ] as const).map(([reaction, text]) => <button className="ap-chip" type="button" key={reaction} aria-pressed={value === reaction} onClick={() => choose(reaction)}>{text}</button>)}
    </div>
    {value === "dislike" && reasons.length > 0 && <fieldset className="ap-feedback__reasons">
      <legend>哪里不合适？选了会少推荐类似方向<span>可多选，可跳过</span></legend>
      <div className="ap-chips">{Array.from(new Set(reasons)).map((reason) => <button className="ap-chip ap-chip--reason" type="button" key={reason} aria-pressed={selected.includes(reason)} onClick={() => {
        const next = selected.includes(reason) ? selected.filter((item) => item !== reason) : [...selected, reason];
        setSelected(next);
        onChange("dislike", next);
      }}>{reason}</button>)}</div>
      {selected.length > 0 && <p className="ap-feedback__note" aria-live="polite">已记下：{selected.join("、")}</p>}
    </fieldset>}
  </div>;
}
