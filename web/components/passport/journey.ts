/** The desktop journey through a passport (Issue #2): overview → facial evidence → report → advice → plan → studio.
 *  Pure data and functions, no React: the step bar, the "next step" bridge and the overview's journey section all read
 *  this one list, so the language and the order stay consistent. Nothing here measures, scores or recommends. */

export type JourneyKey = "overview" | "evidence" | "report" | "advice" | "plan" | "studio";

export interface JourneyStep {
  key: JourneyKey;
  /** Short name used by every link to this step. */
  label: string;
  /** Route below /p/[id] ("" is the overview). */
  sub: string;
  /** One line: what this step is for. */
  blurb: string;
  /** Which routes light this step up (the pathname, e.g. /p/ap_x/face). */
  match: RegExp;
}

export const JOURNEY: readonly JourneyStep[] = [
  { key: "overview", label: "概览", sub: "", blurb: "结论一览：参考分、特点，以及最值得先做的一件事", match: /^\/p\/[^/]+(\/(color|style|share|more))?\/?$/ },
  { key: "evidence", label: "面部证据", sub: "/face", blurb: "每个结论怎么量出来的：测量线与十二区面部图谱", match: /\/(face|detail)\/?$/ },
  { key: "report", label: "完整报告", sub: "/report", blurb: "七章读完：发现、解读、改善建议、形象方案与计划", match: /\/report\/?$/ },
  { key: "advice", label: "个性化建议", sub: "/advice", blurb: "发型、妆容、色彩、风格、眼镜、穿搭：选什么、为什么", match: /\/(advice|hair|makeup|outfit|glasses)\/?$/ },
  { key: "plan", label: "行动方案", sub: "/plan", blurb: "最值得先做的 3 件事，可以保存和勾选", match: /\/plan\/?$/ },
  { key: "studio", label: "形象实验室", sub: "/studio", blurb: "把唇色、近脸色和发型方向放到你的照片上试", match: /\/(studio|compare)\/?$/ },
] as const;

export const journeyStep = (key: JourneyKey): JourneyStep => JOURNEY.find((s) => s.key === key) as JourneyStep;
export const journeyHref = (id: string, key: JourneyKey): string => `/p/${id}${journeyStep(key).sub}`;

/** Which step a passport pathname belongs to; null for pages outside the journey (unlock, anything unknown). */
export function currentStep(pathname: string | null | undefined): JourneyKey | null {
  const path = pathname ?? "";
  return JOURNEY.find((s) => s.match.test(path))?.key ?? null;
}

/** The bridge shown below a step: where to go next and why. The overview and the report write their own, richer
 *  bridges (they know the passport), and the last step has nowhere further to go. */
const BRIDGE: Partial<Record<JourneyKey, { to: JourneyKey; lead: string }>> = {
  evidence: { to: "report", lead: "测量看完了？下一步把它们读成一份完整报告：发现 → 解读 → 建议。" },
  advice: { to: "plan", lead: "选好方向后，把最值得先做的几件事存进行动方案。" },
  plan: { to: "studio", lead: "做之前先试试：在你的照片上看看唇色、近脸色和发型方向。" },
};

export function nextStep(key: JourneyKey | null): { step: JourneyStep; lead: string } | null {
  const b = key ? BRIDGE[key] : undefined;
  return b ? { step: journeyStep(b.to), lead: b.lead } : null;
}
