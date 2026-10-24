import type { ReactNode } from "react";
import "./tokens.css";

export interface RevealStepsProps { steps: { label: string; value: ReactNode }[] }

export function RevealSteps({ steps }: RevealStepsProps) {
  return <ol className="ap-reveal ap-ds" aria-label="你的护照正在展开" aria-live="polite" aria-relevant="text additions">
    {steps.map((step, index) => <li key={index} className={step.value == null ? "ap-reveal__pending" : "ap-reveal__ready"}>
      <span className="ap-reveal__number ap-numeral" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
      <div><p className="ap-reveal__label">{step.label}</p><div className="ap-reveal__value">{step.value ?? <span>正在整理<span className="ap-reveal__dots" aria-hidden="true">…</span></span>}</div></div>
    </li>)}
  </ol>;
}
