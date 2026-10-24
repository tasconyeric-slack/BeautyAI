import type { CSSProperties, ReactNode, Ref } from "react";

export const cardTheme = {
  paper: "#F1F1EE", ink: "#16181A", stage: "#141618", teal: "#1F4E5F", line: "#D8D8D2",
  serif: '"Noto Serif CJK SC", "Source Han Serif SC", "Songti SC", serif',
  sans: '"Noto Sans CJK SC", "Source Han Sans SC", system-ui, sans-serif',
  mono: '"IBM Plex Mono", ui-monospace, monospace',
};

export interface CardFrameProps {
  children: ReactNode;
  title: string;
  kind: string;
  shortLink?: string;
  height?: 1440 | 1920;
  style?: CSSProperties;
  ref?: Ref<HTMLElement>;
}

/** Intrinsic export canvas. Scale its parent for an on-screen preview. */
export function CardFrame({ children, title, kind, shortLink, height = 1440, style, ref }: CardFrameProps) {
  return <article ref={ref} aria-label={title} data-card={kind} data-export-width="1080" data-export-height={height} style={{
    boxSizing: "border-box", position: "relative", width: 1080, height, overflow: "hidden", isolation: "isolate",
    background: cardTheme.paper, color: cardTheme.ink, fontFamily: cardTheme.sans, padding: "62px 68px 150px", ...style,
  }}>
    {children}
    <footer style={{ position: "absolute", left: 68, right: 68, bottom: 42, borderTop: `1px solid ${cardTheme.line}`, paddingTop: 26, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, fontSize: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20, flexShrink: 0 }}>
        <span style={{ border: `1px solid ${cardTheme.teal}`, borderRadius: 3, padding: "6px 10px", color: cardTheme.teal, fontSize: 18, fontWeight: 500 }}>AI 生成</span>
        <span style={{ fontFamily: cardTheme.serif, fontWeight: 700, letterSpacing: 3 }}>形象护照</span>
      </div>
      <span data-short-link="" style={{ maxWidth: 410, fontFamily: cardTheme.mono, fontSize: 17, overflowWrap: "anywhere", textAlign: "right", color: "#555D60", lineHeight: 1.5 }}>
        {shortLink?.trim() || "短链位 · 分享时生成"}
      </span>
    </footer>
  </article>;
}

export function Kicker({ children }: { children: ReactNode }) {
  return <div style={{ fontFamily: cardTheme.mono, fontSize: 18, letterSpacing: 4, color: cardTheme.teal }}>{children}</div>;
}

// Color props must stay colors: never permit CSS url() to introduce a photo/network reference.
export function safeColor(value: string | undefined, fallback = "#819796") {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

export function cardPalette(swatches: readonly string[]) {
  return [0, 1, 2, 3].map((i) => safeColor(swatches[i], ["#819796", "#BD9492", "#C5C0B4", "#565C66"][i]));
}
