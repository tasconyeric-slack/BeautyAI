/** Original, deliberately small non-surgical styling catalog. Times/costs are planning estimates,
 * not measured outcomes or promises. All personal evidence is supplied by the engine. */
import type { Passport } from "@/lib/api";

export const GOALS = {
  relaxed: { label: "柔和亲近", reason: "用柔和过渡与较少的打理步骤表达亲近感" },
  polished: { label: "利落精致", reason: "用清晰边界与统一配色表达利落感" },
  bold: { label: "鲜明表达", reason: "选择一个醒目的视觉重点表达个性" },
} as const;
export type Goal = keyof typeof GOALS;
export type Budget = "low" | "medium" | "high";
export type Cost = "free" | Budget;
export type Observation = Passport["analysis"]["observations"][number];
/** declined: card ids the user skipped. confirmedOther: the exact free-text restriction the user checked the plan against. */
export interface PlanPreferences { goal: Goal; budget: Budget; minutes: number; declined?: string[]; confirmedOther?: string }
export interface ActionOption { action: string; cost: Cost; minutes: number; upkeep: string }
export interface Intervention extends ActionOption {
  id: string;
  category: string;
  purpose: "enhance" | "balance" | "express";
  evidence: Observation[];
  goalReason: string;
  mechanism: string;
  effect: string;
  alternative: ActionOption;
  steps: string[];
  successCheck: string;
  limitation: string;
  reversibility: string;
  studioQuery: string;
  studioLabel: string;
  /** Set when a written restriction has not been confirmed against this action. */
  needsCheck?: boolean;
  /** Supported by observations but outside the selected goal; only used as an alternative. */
  outOfGoal?: boolean;
}

interface CatalogEntry {
  id: string;
  goals: readonly Goal[];
  category: string;
  sourceCategory: "makeup" | "brows" | "clothing" | "photo_presentation";
  matches: (o: Observation) => boolean;
  kind: "lip" | "drape" | "brow" | "photo";
  mechanism: string;
  effect: string;
  alternative: ActionOption;
  steps: string[];
  successCheck: string;
  upkeep: string;
  limitation: string;
  reversibility: string;
  minutes: number;
  cost: Cost;
}

const lip = (o: Observation) => o.region === "lip";
const color = (o: Observation) => o.category === "color" || o.category === "clothing";
const brow = (o: Observation) => o.region === "brow";
const LIP_BASE = {
  category: "唇色", sourceCategory: "makeup", matches: lip, kind: "lip", cost: "low", minutes: 2,
  mechanism: "唇部颜色和边缘清晰度会改变视线落点；保持原有唇形。",
  alternative: { action: "保持原唇色，把视觉重点留给近脸衣物", cost: "free", minutes: 0, upkeep: "无额外打理" },
  steps: ["先薄涂一层，在自然光下看整体配色", "满意后再决定是否购买，不叠加多个抢眼重点"],
  successCheck: "在同样光线、距离和表情下比较，是否更符合你选的印象？不喜欢就保留原唇色。",
  upkeep: "进食后按需补色", limitation: "屏幕试色受拍摄光线影响，不能预测实物显色。", reversibility: "卸妆即可恢复",
} satisfies Partial<CatalogEntry>;
const DRAPE_BASE = {
  category: "近脸衣物", sourceCategory: "clothing", matches: color, kind: "drape", cost: "free", minutes: 1,
  mechanism: "衣领或围巾形成脸周色块，改变整体的明暗过渡与视觉重点。",
  alternative: { action: "保留现有上衣，打开领口或把围巾移离脸部", cost: "free", minutes: 1, upkeep: "每次穿搭时调整" },
  steps: ["先用衣橱里已有的相近颜色，不必购买", "把色块放在衣领位置，与原色在同一光线下比较"],
  successCheck: "固定光线与相机曝光，比较两种衣领色；选择自己更喜欢、也符合场合的一种。",
  upkeep: "每天搭配时选择", limitation: "色彩方向来自当前照片；室内偏色时先在窗边确认。", reversibility: "换回衣物即可",
} satisfies Partial<CatalogEntry>;
const BROW_BASE = {
  category: "眉形", sourceCategory: "brows", matches: brow, kind: "brow", cost: "low", minutes: 2,
  mechanism: "眉毛的方向和边界改变眉眼的线条印象，不改变面部骨骼。",
  alternative: { action: "用干净眉刷顺着原生眉毛梳理，保持原眉形", cost: "free", minutes: 1, upkeep: "每天梳理即可" },
  steps: ["先梳顺原生眉毛，只在稀疏处轻补", "退到一臂距离观察，不靠修剪追求左右完全相同"],
  successCheck: "从日常交流距离看，眉眼是否更符合目标印象，且仍保留自然毛流？",
  upkeep: "每天约 2 分钟；卸妆后恢复", limitation: "实验室的眉形是局部颜色模拟，不是拔眉或永久定妆建议。", reversibility: "可洗去；不建议为试验拔眉",
} satisfies Partial<CatalogEntry>;

export const CATALOG: readonly CatalogEntry[] = [
  { ...LIP_BASE, id: "lip-soft", goals: ["relaxed", "polished"], effect: "柔化唇部边缘，让配色自然衔接" },
  { ...LIP_BASE, id: "lip-statement", goals: ["bold"], effect: "把唇色作为单一、清楚的视觉重点" },
  { ...DRAPE_BASE, id: "near-face-soft", goals: ["relaxed"], effect: "用推荐色在脸周形成柔和过渡" },
  { ...DRAPE_BASE, id: "near-face-neutral", goals: ["polished"], effect: "用衣橱底色建立简洁、统一的近脸配色" },
  { ...DRAPE_BASE, id: "near-face-accent", goals: ["bold"], effect: "用推荐色做小面积焦点，其余衣物保持简洁" },
  { ...BROW_BASE, id: "brow-soft", goals: ["relaxed"], effect: "保留原生弧度与毛流，减少生硬边界" },
  { ...BROW_BASE, id: "brow-defined", goals: ["polished", "bold"], effect: "轻补稀疏区域，让眉眼边界更清晰" },
  {
    id: "photo-light", goals: ["relaxed", "polished", "bold"], category: "拍照呈现", sourceCategory: "photo_presentation",
    matches: o => o.category === "photo", kind: "photo", cost: "free", minutes: 2,
    mechanism: "柔和正面光能改变照片中的阴影；拍摄条件的变化不等于面部结构变化。",
    effect: "让你在比较造型时更容易区分光线变化与搭配效果",
    alternative: { action: "保留原照，只在实验室按住看原图比较单项变化", cost: "free", minutes: 1, upkeep: "无需拍摄新照片" },
    steps: ["线下对镜尝试：面向窗户，镜头与眼睛同高", "比较时固定距离、表情与曝光，不使用美颜滤镜"],
    successCheck: "同一光线下比较真实搭配，是否喜欢目标印象？AI 预览不能作为实际进步证据。",
    upkeep: "每次比较时保持条件一致", limitation: "这里只提供拍摄步骤，不上传或保留新照片。",
    reversibility: "随时恢复拍摄设置",
  },
];
