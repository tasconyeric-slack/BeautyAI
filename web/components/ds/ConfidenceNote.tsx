import "./tokens.css";

export interface ConfidenceNoteProps { level: "high" | "medium" | "low"; tip: string }
const labels = { high: "依据较充分", medium: "可作参考", low: "方向参考" };

export function ConfidenceNote({ level, tip }: ConfidenceNoteProps) {
  return <aside className={`ap-confidence ap-confidence--${level} ap-ds`}>
    <span className="ap-confidence__mark" aria-hidden="true">i</span>
    <div><strong>{labels[level]}</strong><p>{tip}</p></div>
  </aside>;
}
