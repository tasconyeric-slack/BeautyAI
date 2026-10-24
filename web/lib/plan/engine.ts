/** Read-only adapter: passport/model observations stay unchanged; declared goals select new local candidates. */
import type { Passport } from "@/lib/api";
import { FRINGE_ZH, LENGTH_ZH, PART_ZH } from "@/lib/adapters";
import { CATALOG, GOALS, type Cost, type Goal, type Intervention, type PlanPreferences } from "./catalog";

const costOrder: Record<Cost, number> = { free: 0, low: 1, medium: 2, high: 3 };
export function defaultPreferences(p: Passport): PlanPreferences {
  const goals = p.user_context.desired_impression;
  const goal: Goal = goals.includes("distinctive") ? "bold"
    : goals.some(g => ["professional", "sharp", "refined", "authoritative"].includes(g)) ? "polished" : "relaxed";
  return { goal, budget: p.user_context.constraints.budget_level, minutes: p.user_context.constraints.daily_minutes, declined: [], confirmedOther: "" };
}

/** Written restrictions are never interpreted. Until the user confirms them, every action that changes
 * hair, makeup or clothing is marked for checking; photo-comparison advice touches none of these. */
export const otherConstraint = (p: Passport) => p.user_context.constraints.other.trim();
const KIND_OF = (id: string) => id.startsWith("hair-") ? "hair" : id.startsWith("lip-") ? "lip" : id.startsWith("near-face-") ? "drape"
  : id.startsWith("brow-") ? "brow" : "photo";

function candidatesFor(p: Passport, preferences: PlanPreferences, goal: Goal, declined: ReadonlySet<string>): Intervention[] {
  const constraints = p.user_context.constraints;
  const budget = Math.min(costOrder[preferences.budget], costOrder[constraints.budget_level]);
  const minutes = Math.min(preferences.minutes, constraints.daily_minutes);
  const fits = (c: Cost, m: number) => costOrder[c] <= budget && m <= minutes;
  const goalReason = `你选择了「${GOALS[goal].label}」：${GOALS[goal].reason}。`;
  // Hidden advice is an explicit preference. A cost-excluded report action must not
  // also exclude an independently feasible free action in that category.
  const hidden = new Set(p.derived.excluded_recommendations.filter(r => r.reason === "user_hidden").map(r => r.rec_id));
  const blockedCategory = new Set(p.analysis.recommendations.filter(r => hidden.has(r.id)).map(r => r.category));
  const candidates: Intervention[] = [];
  const cp = p.analysis.color_profile;

  const preferred = goal === "bold" ? ["bold", "safe", "easy"] : goal === "relaxed" ? ["easy", "safe", "bold"] : ["safe", "easy", "bold"];
  const hair = preferred.map(t => p.analysis.hair_options.find(h => h.tier === t)).find(h => {
    if (!h || declined.has(`hair-${h.tier}`) || blockedCategory.has("hairstyle")) return false;
    if (p.derived.hair_option_checks.some(c => c.tier === h.tier && c.status === "excluded")) return false;
    if (!constraints.accepts_perm && h.requires.includes("perm")) return false;
    if (!constraints.accepts_dye && (h.requires.includes("dye") || h.params.color !== "keep")) return false;
    if (p.user_context.hair?.grow_out_ok === false && h.requires.includes("grow_out")) return false;
    if (p.user_context.haircut_budget === "low" || !fits("medium", h.maintenance.daily_minutes)) return false;
    return h.evidence.some(id => p.analysis.observations.some(o => o.id === id));
  });
  if (hair) {
    const evidence = p.analysis.observations.filter(o => hair.evidence.includes(o.id));
    const params = hair.params;
    candidates.push({
      id: `hair-${hair.tier}`, category: "发型", purpose: evidence.some(o => o.polarity === "strength") ? "enhance" : "express", evidence, goalReason,
      action: `与发型师讨论「${hair.name_zh}」：${LENGTH_ZH[params.length]}、${FRINGE_ZH[params.fringe]}${params.part ? `、${PART_ZH[params.part]}` : ""}`,
      mechanism: "长度、分线和刘海改变脸周留白与线条方向；实际效果取决于发质与剪裁。",
      effect: goal === "bold" ? "通过脸周轮廓表达更鲜明的风格" : goal === "relaxed" ? "用易打理的脸周线条表达自然亲近感" : "用有序的脸周线条表达利落感",
      cost: "medium", minutes: hair.maintenance.daily_minutes,
      upkeep: `每 ${hair.maintenance.trim_weeks} 周修剪；${hair.maintenance.note}`,
      alternative: { action: "先保持长度，用梳子临时调整分线，试过再决定是否剪发", cost: "free", minutes: 1, upkeep: "洗发或重新梳理后恢复" },
      steps: [...hair.barber_script], successCheck: "正面和侧面镜中检查脸周线条是否符合目标；也确认每天实际打理时间能接受。",
      limitation: [hair.avoid, ...hair.requires.map(r => ({ perm: "需要烫发", dye: "需要染发", grow_out: "需要留长", straighten: "需要拉直" })[r])].filter(Boolean).join("；"),
      reversibility: "剪短需要等待长回；烫染不能立即恢复，先试临时分线方案", studioQuery: `hair=${hair.tier}`, studioLabel: "在实验室试这个发型",
    });
  }

  for (const entry of CATALOG) {
    if (!entry.goals.includes(goal) || declined.has(entry.id) || blockedCategory.has(entry.sourceCategory) || !fits(entry.cost, entry.minutes)) continue;
    if ((entry.kind === "lip" || entry.kind === "brow") && p.analysis.makeup_direction.mode !== "makeup") continue;
    if (entry.kind === "drape" && constraints.dress_code === "uniform") continue;
    const evidence = p.analysis.observations.filter(entry.matches);
    if (!evidence.length) continue;
    let action = "", studioQuery = "", studioLabel = "在实验室比较";
    if (entry.kind === "lip") {
      const shade = goal === "bold" ? cp.lip_families.at(-1) : cp.lip_families[0];
      if (!shade) continue;
      action = goal === "bold" ? `试「${shade.name}」唇色，其余配色收敛` : `薄涂「${shade.name}」，轻拍开唇缘`;
      studioQuery = `lip=${shade.hex.replace("#", "")}`;
    } else if (entry.kind === "drape") {
      const family = goal === "polished" ? cp.neutral_families[0] : cp.favor_families[0];
      if (!family?.hex_examples[0]) continue;
      action = `用已有的「${family.name}」${goal === "bold" ? "围巾作小面积近脸重点" : "衣领或围巾做近脸色"}`;
      studioQuery = `drape=${family.hex_examples[0].replace("#", "")}`;
    } else if (entry.kind === "brow") {
      action = goal === "relaxed" ? "顺着原眉弧度，轻补稀疏处并梳松边缘" : "保留原眉形，轻补眉尾并梳清毛流边界";
      studioLabel = "在实验室调眉形";
    } else {
      action = "先统一比较造型时的光线与拍摄距离";
    }
    candidates.push({ ...entry, action, evidence, goalReason, studioQuery, studioLabel,
      purpose: evidence.some(o => o.polarity === "strength") ? "enhance" : "express" });
  }
  // Catalog order is intentional editorial priority, not a fabricated score of benefit.
  return candidates;
}

export interface Replacement { declined: Intervention; replacement: Intervention | null; note: string }
export interface PlanView { cards: Intervention[]; replacements: Replacement[]; needsCheck: boolean; constraintText: string }

/** Cards for the chosen goal, plus a supported alternative (or a truthful "none") for every declined card.
 * Alternatives only come from observed evidence under the same hard limits; nothing is generated or scored. */
export function buildPlanView(p: Passport, preferences: PlanPreferences): PlanView {
  const goal = preferences.goal;
  const declined = new Set(preferences.declined ?? []);
  const constraintText = otherConstraint(p);
  const needsCheck = constraintText !== "" && preferences.confirmedOther !== constraintText;
  const mark = (c: Intervention): Intervention => needsCheck && KIND_OF(c.id) !== "photo" ? { ...c, needsCheck: true } : c;
  const baseline = candidatesFor(p, preferences, goal, new Set());
  const cards = candidatesFor(p, preferences, goal, declined);
  const replacements: Replacement[] = [];
  const elsewhere = (Object.keys(GOALS) as Goal[]).filter(g => g !== goal)
    .flatMap(g => candidatesFor(p, preferences, g, declined)).map(c => ({ ...c, outOfGoal: true }));
  const taken = new Set(cards.map(c => c.id));
  for (const d of baseline.filter(c => declined.has(c.id))) {
    // A declined hair tier is already replaced by the next permitted tier inside `cards`; look for a different kind.
    const alt = elsewhere.find(c => !taken.has(c.id) && !declined.has(c.id) && KIND_OF(c.id) !== KIND_OF(d.id));
    if (alt) taken.add(alt.id);
    replacements.push({ declined: d, replacement: alt ? mark(alt) : null, note: alt
      ? (alt.outOfGoal ? "不在你所选目标内，但同样有报告观察支持、符合你的限制，可作参考。" : "同一目标下、有报告观察支持的另一种做法。")
      : "已跳过。在你的观察与限制下，没有其他有依据的替代项；可以保持现状，或使用卡片里更轻量的替代做法。" });
  }
  return { cards: cards.map(mark), replacements, needsCheck, constraintText };
}

export function buildPlan(p: Passport, preferences: PlanPreferences): Intervention[] {
  return buildPlanView(p, preferences).cards;
}

export function progressKey(goal: Goal, card: Intervention): string {
  return `protocol-v1:${goal}:${card.id}:${card.studioQuery || "manual"}`;
}
