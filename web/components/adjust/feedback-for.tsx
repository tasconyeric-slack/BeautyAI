"use client";

import * as React from "react";
import { FeedbackChips, ResembleToggle, type FeedbackValue } from "@/components/ds";
import { api, type FeedbackTarget } from "@/lib/api";
import { feedback as copy } from "@/lib/copy/zh";
import { usePassport } from "@/lib/state/passport-store";

const R = copy.reasons;
/** Reason tags per target kind (labels from web/lib/copy; some hide the item, see config/rules.yaml hide_reasons). */
export const REASONS: Record<FeedbackTarget, string[]> = {
  recommendation: [R.notMyStyle, R.tooBold, R.tooMuchMaintenance, R.tooExpensive, R.notMyOccasion, R.colorPreference],
  hair_option: [R.notMyStyle, R.tooBold, R.tooSubtle, R.tooMuchMaintenance, R.requiresPerm, R.requiresDye, R.wrongLength],
  garment: [R.notMyStyle, R.notMyOccasion, R.tooExpensive, R.colorPreference],
  style: [R.notMyStyle, R.tooBold, R.tooSubtle],
  color: [R.colorPreference, R.notMyStyle],
  profile: [],
};

/** 喜欢 / 还可以 / 不喜欢 (+ reasons) for any recommendation, hair direction, garment, style or color. */
export function FeedbackFor({ type, target }: { type: FeedbackTarget; target: string }) {
  const { id, marks, sendFeedback } = usePassport();
  const mark = marks[`${type}:${target}`];
  const [local, setLocal] = React.useState<FeedbackValue>(null);
  const value = (local ?? (mark?.reaction as FeedbackValue)) ?? null;
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const onChange = (v: FeedbackValue, reasons: string[]) => {
    setLocal(v);
    if (timer.current) clearTimeout(timer.current);
    const send = () => {
      sendFeedback({ target_type: type, target_id: target, reaction: v ?? "neutral", reason_tags: reasons });
      api.track("feedback", { passport_id: id });
    };
    // Reason tags arrive one by one after "不喜欢": wait a moment and send the final set once.
    if (v === "dislike") timer.current = setTimeout(send, reasons.length ? 900 : 300);
    else send();
  };
  return <FeedbackChips value={value} reasons={REASONS[type]} onChange={onChange} />;
}

/** 像我 / 不太像 for a profile conclusion (face / color / style). Changes only the preference layer (D25). */
export function ResembleFor({ target }: { target: "face" | "color" | "style" }) {
  const { marks, sendFeedback } = usePassport();
  const m = marks[`profile:${target}`]?.reaction;
  const value = m === "resemble_yes" ? "yes" : m === "resemble_no" ? "no" : null;
  return (
    <ResembleToggle value={value} onChange={(v) => {
      sendFeedback({ target_type: "profile", target_id: target, reaction: v === "yes" ? "resemble_yes" : v === "no" ? "resemble_no" : "neutral" });
    }} />
  );
}
