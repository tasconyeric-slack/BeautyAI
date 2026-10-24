"use client";

import "./tokens.css";

export interface ScoreTeaserCardProps { onNotify: () => void }

/** Superseded by the AI 面部美学参考分 hero (D36); no product page renders it. Kept as a design-system primitive.
 * Fixed approved copy only. No score input, number, preview, or placeholder. */
export function ScoreTeaserCard({ onNotify }: ScoreTeaserCardProps) {
  return <aside className="ap-score-teaser ap-ds"><p>颜值评分 · 即将上线</p><button type="button" onClick={onNotify}>上线时告诉我</button></aside>;
}
