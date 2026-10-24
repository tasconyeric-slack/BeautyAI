import { CardFrame, Kicker, cardPalette, cardTheme } from "./card-frame";
import { IllustratedAvatar, type IllustratedAvatarProps } from "./illustrated-avatar";

export type ProfileMode = "avatar" | "palette" | "portrait";
interface ProfileContent {
  summary: string;
  face: string | readonly string[];
  color: { name: string; swatches: readonly string[] };
  /** Same units as rules and K4: x=visual_weight [1,5], y=angular_rounded [-2,2]. */
  style: { name: string; plane: { x: number; y: number } };
  shortLink: string;
  avatar?: Omit<IllustratedAvatarProps, "palette">;
}
export type ProfileCardProps = ProfileContent & (
  | { mode: "avatar" | "palette"; portraitSrc?: string }
  | { mode: "portrait"; portraitSrc: string }
);

export function isProfileModeAvailable(mode: ProfileMode, portraitSrc?: string) {
  return mode !== "portrait" || Boolean(portraitSrc?.trim());
}

function StyleMap({ plane }: { plane: { x: number; y: number } }) {
  const clamp = (n: number, min: number, max: number, fallback: number) => Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
  const x = 44 + (clamp(plane.x, 1, 5, 3) - 1) / 4 * 212;
  const y = 208 - (clamp(plane.y, -2, 2, 0) + 2) / 4 * 166;
  return <svg viewBox="0 0 300 250" width="290" height="235" role="img" aria-label="你的风格落点，横轴量感轻盈到浓郁，纵轴利落到圆润">
    <path d="M38 125H262 M150 42V210" stroke="#AAAFAA" strokeWidth="1" />
    <circle cx="150" cy="125" r="72" stroke="#D8D8D2" strokeWidth="1" fill="none" />
    <g fill="#5E6869" fontSize="14" fontFamily={cardTheme.sans}>
      <text x="18" y="150">轻盈</text><text x="250" y="150">浓郁</text><text x="150" y="27" textAnchor="middle">圆润</text><text x="150" y="236" textAnchor="middle">利落</text>
    </g>
    <circle cx={x} cy={y} r="18" fill={cardTheme.teal} opacity="0.11" />
    <circle cx={x} cy={y} r="6" fill={cardTheme.teal} />
    <path d={`M${x - 12} ${y}h24 M${x} ${y - 12}v24`} stroke={cardTheme.teal} strokeWidth="1" />
  </svg>;
}

function PaletteArt({ swatches }: { swatches: readonly string[] }) {
  const colors = cardPalette(swatches);
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 540 570" width="100%" height="100%" role="img" aria-label="由你的色卡组成的抽象色彩艺术">
    <rect width="540" height="570" fill="#E6E6E0" />
    <path d="M0 570V270A270 270 0 0 1 540 270V570Z" fill={colors[0]} />
    <path d="M72 570V282A198 198 0 0 1 468 282V570Z" fill={colors[1]} />
    <path d="M144 570V294A126 126 0 0 1 396 294V570Z" fill={colors[2]} />
    <path d="M216 570V306A54 54 0 0 1 324 306V570Z" fill={colors[3]} />
    <circle cx="421" cy="107" r="60" fill={colors[2]} />
    <path d="M0 475H540 M270 0V570" stroke="#F1F1EE" strokeWidth="1" opacity="0.45" />
  </svg>;
}

export function ProfileCard(props: ProfileCardProps) {
  if (!isProfileModeAvailable(props.mode, props.portraitSrc)) throw new Error("ProfileCard portrait mode requires an available portraitSrc and separate sharing consent.");
  const { mode, summary, face, color, style, shortLink, avatar } = props;
  const swatches = cardPalette(color.swatches);
  const traits = typeof face === "string" ? [face] : face;
  return <CardFrame title="我的形象档案卡" kind={`profile-${mode}`} shortLink={shortLink}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <Kicker>AESTHETIC PASSPORT</Kicker><span style={{ fontSize: 18, letterSpacing: 3, color: "#687170" }}>个人形象档案 / 01</span>
    </div>
    <h1 style={{ fontFamily: cardTheme.serif, fontSize: 78, lineHeight: 1.25, fontWeight: 700, letterSpacing: 4, margin: "42px 0 22px" }}>自有风格</h1>
    <p style={{ fontSize: 27, lineHeight: 1.8, margin: "0 0 38px", maxWidth: 850 }}>{summary}</p>
    <div style={{ display: "grid", gridTemplateColumns: "564px 1fr", gap: 38, alignItems: "stretch" }}>
      <div style={{ height: 590, overflow: "hidden", background: mode === "portrait" ? cardTheme.stage : "#E5E5DF", position: "relative" }}>
        {mode === "portrait" ? <img src={props.portraitSrc} alt="本次授权分享的本人肖像" width="564" height="590" style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }} />
          : mode === "palette" ? <PaletteArt swatches={swatches} />
            : <IllustratedAvatar hair={avatar?.hair ?? { length: "collarbone", fringe: "curtain", curl: "wave", colorHex: "#493C36" }} palette={swatches} presentation={avatar?.presentation ?? "neutral"} />}
        <span style={{ position: "absolute", bottom: 18, left: 22, fontFamily: cardTheme.mono, fontSize: 14, letterSpacing: 2, color: mode === "portrait" ? "#FFFFFF" : cardTheme.ink, background: mode === "portrait" ? "#141618" : "#F1F1EE", padding: "6px 9px" }}>{mode === "avatar" ? "参数插画 · 非照片描摹" : mode === "palette" ? "PERSONAL COLOR STUDY" : "本人肖像 · 本次分享"}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", paddingTop: 8 }}>
        <div><Kicker>01 / 色彩</Kicker><h2 style={{ fontFamily: cardTheme.serif, fontSize: 44, lineHeight: 1.4, margin: "20px 0 24px" }}>{color.name}</h2><p style={{ fontSize: 19, color: "#687170", lineHeight: 1.7, margin: 0 }}>属于你的色彩语言</p></div>
        <div><Kicker>02 / 风格</Kicker><h2 style={{ fontFamily: cardTheme.serif, fontSize: 33, lineHeight: 1.5, margin: "18px 0 0" }}>{style.name}</h2><StyleMap plane={style.plane} /></div>
      </div>
    </div>
    <div style={{ display: "flex", gap: 13, marginTop: 35 }}>{swatches.map((hex, i) => <div key={i} style={{ flex: 1 }}><div style={{ height: 75, background: hex }} /><div style={{ fontFamily: cardTheme.mono, fontSize: 15, letterSpacing: 1, marginTop: 12, color: "#5E6869" }}>{hex.toUpperCase()}</div></div>)}</div>
    <div style={{ display: "flex", alignItems: "center", gap: 25, marginTop: 34, paddingTop: 25, borderTop: `1px solid ${cardTheme.line}` }}>
      <span style={{ fontFamily: cardTheme.mono, fontSize: 16, color: cardTheme.teal, letterSpacing: 2 }}>FEATURE NOTES</span>
      <span style={{ fontSize: 23, lineHeight: 1.65 }}>{traits.join(" · ")}</span>
    </div>
  </CardFrame>;
}
