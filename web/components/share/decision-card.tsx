import { CardFrame, Kicker, cardTheme, safeColor } from "@/components/cards/card-frame";
import type { DecisionContent, DecisionSide } from "./decision";

export interface DecisionCardProps {
  content: DecisionContent;
  /** In-memory snapshots, present only for a consented photo export. Without them the card shows swatches only. */
  photos?: { a: string | null; b: string | null };
  shortLink?: string;
}

/** 3:4 "帮我选 A 还是 B" card. Contains look names, swatches, a difference sentence and the AI-simulation note: no score,
 *  measurement, questionnaire answer or passport reference. */
export function DecisionCard({ content, photos, shortLink }: DecisionCardProps) {
  return <CardFrame title="帮我选 A 还是 B" kind="decision" shortLink={shortLink}>
    <Kicker>HELP ME CHOOSE / 帮我选</Kicker>
    <h1 style={{ fontFamily: cardTheme.serif, fontSize: 72, lineHeight: 1.35, margin: "30px 0 8px" }}>A 还是 B？</h1>
    <p style={{ fontSize: 24, lineHeight: 1.7, margin: "0 0 34px", color: "#5E6869" }}>两个造型的试看，你更想选哪一个？</p>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28 }}>
      <Panel side={content.a} photo={photos?.a ?? null} />
      <Panel side={content.b} photo={photos?.b ?? null} />
    </div>
    {content.level !== "none" && <p data-testid="decision-summary" style={{ fontSize: 23, lineHeight: 1.75, margin: "34px 0 0", color: cardTheme.ink }}>{content.summary}</p>}
    <p style={{ position: "absolute", left: 68, right: 68, bottom: 126, fontSize: 18, lineHeight: 1.7, margin: 0, color: "#687170" }}>
      {photos?.a || photos?.b ? "照片上的效果是 AI 与本地模拟，仅供参考，不代表真实结果。" : "本图只含造型的配色与设置，不含照片和任何测量数据。效果仅供参考。"}
    </p>
  </CardFrame>;
}

function Panel({ side, photo }: { side: DecisionSide; photo: string | null }) {
  return <figure style={{ margin: 0 }}>
    <div style={{ height: 470, background: photo ? cardTheme.stage : "#E8E8E3", overflow: "hidden", position: "relative", display: "flex", flexDirection: "column" }}>
      {photo
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={photo} alt={`造型 ${side.label} 的试看`} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        : side.swatches.length
          ? side.swatches.map((s) => <div key={s.label} style={{ flex: 1, background: safeColor(s.hex), display: "flex", alignItems: "flex-end", padding: "0 14px 8px" }}>
              <span style={{ fontSize: 17, color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,.55)" }}>{s.label}</span></div>)
          : <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, color: "#687170" }}>保持现在的样子</div>}
      <span style={{ position: "absolute", left: 14, top: 14, background: cardTheme.stage, color: "#fff", fontFamily: cardTheme.serif, fontSize: 34, lineHeight: 1, padding: "8px 16px" }}>{side.label}</span>
    </div>
    <figcaption style={{ paddingTop: 16 }}>
      <span style={{ fontFamily: cardTheme.mono, color: cardTheme.teal, fontSize: 15, letterSpacing: 1 }}>{side.method}</span>
      <ul style={{ listStyle: "none", margin: "10px 0 0", padding: 0, fontSize: 19, lineHeight: 1.65 }}>
        {side.lines.slice(0, 6).map((l) => <li key={l}>{l}</li>)}
      </ul>
      {side.undrawn.length > 0 && <p style={{ margin: "8px 0 0", fontSize: 16, color: "#8A5A2E" }}>未画出：{side.undrawn.join("、")}</p>}
    </figcaption>
  </figure>;
}
