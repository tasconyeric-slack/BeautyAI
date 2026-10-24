import { CardFrame, Kicker, cardTheme } from "./card-frame";
import { IllustratedAvatar, type IllustratedAvatarProps } from "./illustrated-avatar";

export interface StylistCardProps {
  styleName: string;
  scripts: readonly [string, string, string];
  params: Readonly<Record<string, string | number>>;
  avoid: readonly string[];
  previewSrc?: string;
  /** Defaults to true. Photo is entirely omitted, not blurred or hidden with CSS. */
  hideFace?: boolean;
  shortLink?: string;
  avatar?: IllustratedAvatarProps;
}

export function StylistCard({ styleName, scripts, params, avoid, previewSrc, hideFace = true, shortLink, avatar }: StylistCardProps) {
  return <CardFrame title="给发型师的沟通卡" kind="stylist" shortLink={shortLink}>
    <Kicker>THE HAIR BRIEF / 发型沟通卡</Kicker>
    <h1 style={{ fontFamily: cardTheme.serif, fontSize: 62, lineHeight: 1.4, margin: "32px 0 38px", letterSpacing: 2 }}>{styleName}</h1>
    <div style={{ display: "grid", gridTemplateColumns: "390px 1fr", gap: 42, marginBottom: 38 }}>
      <div style={{ width: 390, height: 435, background: "#E5E5DF", overflow: "hidden" }}>
        {!hideFace && previewSrc ? <img src={previewSrc} alt="本次授权分享的发型 AI 试看" width="390" height="435" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <IllustratedAvatar {...(avatar ?? { hair: { length: "collarbone", fringe: "curtain", curl: "wave", colorHex: "#493C36" }, palette: ["#819796", "#BD9492"], presentation: "neutral" })} />}
      </div>
      <div><Kicker>剪前一起确认</Kicker><dl style={{ margin: "20px 0 0" }}>{Object.entries(params).map(([key, value]) => <div key={key} style={{ display: "flex", justifyContent: "space-between", gap: 20, borderBottom: `1px solid ${cardTheme.line}`, padding: "18px 0", fontSize: 24 }}><dt style={{ color: "#5E6869" }}>{key}</dt><dd style={{ margin: 0, textAlign: "right", fontWeight: 500 }}>{value}</dd></div>)}</dl></div>
    </div>
    <Kicker>可以直接这样说</Kicker>
    <ol style={{ listStyle: "none", margin: "22px 0 30px", padding: 0 }}>{scripts.map((script, index) => <li key={index} style={{ display: "flex", gap: 24, padding: "18px 0", borderTop: `1px solid ${cardTheme.line}`, fontSize: 27, lineHeight: 1.7 }}><span style={{ fontFamily: cardTheme.mono, fontSize: 21, color: cardTheme.teal, paddingTop: 3 }}>0{index + 1}</span><span>{script}</span></li>)}</ol>
    {avoid.length > 0 && <div style={{ borderLeft: "3px solid #9A5B1F", padding: "4px 0 4px 22px", fontSize: 22, lineHeight: 1.8 }}><span style={{ color: "#9A5B1F", marginRight: 20 }}>这次先避开</span>{avoid.join(" · ")}</div>}
    <p style={{ color: "#687170", fontSize: 18, lineHeight: 1.7, marginTop: 28 }}>{hideFace || !previewSrc ? "参数插画仅表达发型方向；具体长度与发质请现场沟通。" : "AI 试看仅供沟通方向，实际效果取决于发质与剪裁。"}</p>
  </CardFrame>;
}
