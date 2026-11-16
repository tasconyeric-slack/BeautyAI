/** Keep raw probabilities in the API; round only at the display boundary. */
export function formatTopPercent(top: number | null): string {
  if (top == null || !Number.isFinite(top) || top <= 0 || top > 100) return "—";
  if (top < 1e-6) return top.toExponential(2);
  const digits = top >= 1 ? 1 : Math.max(2, 1 - Math.floor(Math.log10(top)));
  return String(Number(top.toFixed(digits)));
}

export function rankUnavailable(reason?: string | null): string {
  if (reason === "model_reference_mismatch") return "评分模型与参考样本版本不匹配，暂不可用。";
  if (reason === "image_quality_limited") return "照片质量不足，暂无法计算参考位置。";
  if (reason?.includes("authorized")) return "参考样本尚未获授权，暂不可用。";
  if (reason === "invalid_tail_reference") return "参考样本不足以拟合尾部，暂不可用。";
  return "参考数据缺失或不可用，暂无法计算参考位置。";
}

/** One short scope note shared by the web score card, free report and PDF: names the real reference sample and its limits. */
export function rankScopeNote(label?: string | null, unit: string | null = "image"): string {
  const sample = label?.trim() || "参考照片样本";
  return unit === "subject"
    ? `参考样本：${sample}。仅与该样本比较，并非全人群排名。`
    : `参考样本：${sample}。按照片比较，主体与年龄未核验，并非全人群排名。`;
}
