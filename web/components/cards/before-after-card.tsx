import { CardFrame, Kicker, cardTheme } from "./card-frame";

export interface BeforeAfterCardProps {
  beforeSrc: string;
  afterSrc: string;
  ratio: "3:4" | "9:16";
  shortLink?: string;
  title?: string;
  note?: string;
}

export function BeforeAfterCard({ beforeSrc, afterSrc, ratio, shortLink, title = "看见另一种可能", note = "保持自己的特点，试一个新的方向。" }: BeforeAfterCardProps) {
  const tall = ratio === "9:16";
  return <CardFrame title="前后对比卡" kind="before-after" shortLink={shortLink} height={tall ? 1920 : 1440}>
    <Kicker>A NEW PERSPECTIVE / 方向对照</Kicker>
    <h1 style={{ fontFamily: cardTheme.serif, fontSize: 66, lineHeight: 1.45, margin: "40px 0 22px" }}>{title}</h1>
    <p style={{ fontSize: 25, lineHeight: 1.8, margin: `0 0 ${tall ? 70 : 48}px`, color: "#5E6869" }}>{note}</p>
    <div style={{ display: "grid", gridTemplateColumns: tall ? "1fr" : "1fr 1fr", gap: tall ? 38 : 24 }}>
      {[{ src: beforeSrc, label: "现在", sub: "BEFORE", alt: "本次授权分享的原图" }, { src: afterSrc, label: "新的方向", sub: "AI PREVIEW", alt: "AI 生成的方向试看图" }].map(({ src, label, sub, alt }, index) => <figure key={sub} style={{ margin: 0, display: tall ? "grid" : "block", gridTemplateColumns: "575px 1fr", alignItems: "center", gap: 30 }}>
        <div style={{ background: cardTheme.stage, height: tall ? 590 : 680, overflow: "hidden", position: "relative" }}>
          <img src={src} alt={alt} width={tall ? 575 : 460} height={tall ? 590 : 680} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          {index === 1 && <span style={{ position: "absolute", left: 18, bottom: 18, color: "#FFFFFF", background: cardTheme.stage, fontSize: 17, padding: "6px 10px" }}>AI 试看</span>}
        </div>
        <figcaption style={{ paddingTop: tall ? 0 : 22 }}><span style={{ fontFamily: cardTheme.mono, color: cardTheme.teal, fontSize: 17, letterSpacing: 2 }}>{sub}</span><div style={{ fontFamily: cardTheme.serif, fontSize: 33, marginTop: 12 }}>{label}</div></figcaption>
      </figure>)}
    </div>
    <p style={{ fontSize: 19, color: "#687170", lineHeight: 1.8, marginTop: tall ? 65 : 55 }}>AI 生成的效果仅供参考，实际效果取决于发质、光线与日常打理。</p>
  </CardFrame>;
}
