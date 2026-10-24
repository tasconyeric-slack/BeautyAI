/** Plain-text checklists the person copies or shares (Issue #23). Only garment text, colours and search terms from the
 *  passport; no photo, measurement, passport id or link. */
import { SLOT_LABEL, boardName, type Board, type Piece } from "./boards";
import { BUDGET_LABEL, type Budget, type CapsulePlan } from "./capsule";

const colorOf = (p: Piece) => p.colorName ?? "";
const title = (p: Piece) => `${colorOf(p)}${p.name}`;

function status(p: Piece, owned: Readonly<Record<string, boolean>>): string {
  if (!p.garmentId) return "自选";
  return owned[p.key] ? "已有" : p.optional ? "可选·待找" : "待找";
}

/** Getting-dressed + shopping list for one chosen board. */
export function boardChecklist(board: Board, owned: Readonly<Record<string, boolean>>): string {
  const lines = [`【${boardName(board)}】穿搭清单`, ""];
  board.pieces.forEach((p, i) => {
    const mark = p.origin === "generic" && !p.search ? "（自选位）" : "";
    lines.push(`${i + 1}. [${status(p, owned)}] ${SLOT_LABEL[p.slot]}：${title(p)}${mark}`);
  });
  const find = board.pieces.filter((p) => p.garmentId && !owned[p.key] && p.search && !p.optional);
  if (find.length) {
    lines.push("", "要去找的（可直接搜索）：");
    for (const p of find) lines.push(`- ${p.search}`);
  }
  const near = board.palette.map((c) => c.name).filter(Boolean);
  if (near.length) lines.push("", `近脸颜色：${near.join("、")}`);
  lines.push("", `为什么这样搭：${board.why.text}`);
  lines.push("", "出门前：", "[ ] 近脸的那件是上面的近脸颜色", "[ ] 上衣、下装、鞋的颜色不超过三种", "[ ] 对着镜子看一眼整体，不顺眼就换回你已有的单品");
  return lines.join("\n");
}

export function shoppingChecklist(plan: CapsulePlan, budget: Budget): string {
  const lines = [`入门胶囊购物清单（${BUDGET_LABEL[budget]}）`, ""];
  if (plan.owned.length) lines.push(`已有：${plan.owned.map((c) => title(c.piece)).join("、")}`, "");
  if (plan.buyNow.length) {
    lines.push("先买：");
    plan.buyNow.forEach((c) => lines.push(`[ ] ${title(c.piece)}（${c.usedIn.length} 套搭配用到）· 搜索：${c.piece.search}`));
  }
  if (plan.later.length) {
    lines.push("", "以后再说：");
    plan.later.forEach((c) => lines.push(`[ ] ${title(c.piece)} · 搜索：${c.piece.search}`));
  }
  if (!plan.buyNow.length && !plan.later.length) lines.push("这些单品你都有了，不需要新买。");
  lines.push("", "搜索词来自单品库，不指向任何店铺。");
  return lines.join("\n");
}
