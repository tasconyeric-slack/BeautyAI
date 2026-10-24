/** Xiaohongshu caption for the share page (F17 / PRD B8).
 *
 * The template comes from `share.xiaohongshu` in lib/copy/zh.ts; this module only fills its placeholders. Filled values
 * come from the passport, so each one is screened against the loaded / scoring / medical terms of
 * config/rules.yaml `safety_terms` (plus the B8 "效果承诺" words 变美 / 逆袭) and replaced by a neutral phrase when it
 * would carry one into a public post. */
import { share as copy } from "@/lib/copy/zh";

export const CAPTION_FORBIDDEN = [
  "变美", "逆袭", "颜值", "打分", "评分", "美丑", "好看", "难看", "丑", "黄金比例", "标准脸", "完美", "缺陷", "缺点",
  "显老", "显胖", "显瘦", "遮肉", "整容", "医美", "手术", "注射", "玻尿酸", "肉毒", "减肥", "体重",
] as const;

export const hasForbidden = (s: string) => CAPTION_FORBIDDEN.some((t) => s.includes(t));

const clean = (value: string | null | undefined, fallback: string) => {
  const v = (value ?? "").replace(/\s+/g, " ").trim();
  return v && !hasForbidden(v) ? v : fallback;
};

export interface CaptionInput {
  styleName: string;
  colorNames: readonly string[];
  action: string;
  link: string | null;
}

export interface Caption {
  title: string;
  body: string;
  tags: string;
  /** Title + body + tags, ready to paste. */
  text: string;
}

export function buildCaption({ styleName, colorNames, action, link }: CaptionInput): Caption {
  const colors = colorNames.map((c) => c.trim()).filter(Boolean).slice(0, 2).join("、");
  const body = copy.xiaohongshu.body
    .replace("{风格}", clean(styleName, "还在探索中的方向"))
    .replace("{色彩}", clean(colors, "柔和的近脸色"))
    .replace("{行动}", clean(action, "一个小改变"))
    .replace("{链接}", link ?? "（生成只读链接后自动填入）");
  const title = copy.xiaohongshu.title;
  const tags = copy.xiaohongshu.tags;
  return { title, body, tags, text: `${title}\n\n${body}\n\n${tags}` };
}
