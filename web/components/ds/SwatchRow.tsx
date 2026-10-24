import "./tokens.css";

export interface SwatchColor { hex: string; name_zh: string }
export interface SwatchProps { colors: SwatchColor[] }

/** Restricts styles to literal hex colors; names remain readable without color perception. */
export function colorValue(hex: string) {
  return /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(hex) ? hex : "transparent";
}

export function Swatches({ colors, grid }: SwatchProps & { grid: boolean }) {
  return <ul className={`ap-swatches ap-ds ${grid ? "ap-swatches--grid" : "ap-swatches--row"}`} aria-label="色彩组合">
    {colors.map((color, index) => <li key={`${color.hex}-${index}`}>
      <span className="ap-swatches__color" style={{ backgroundColor: colorValue(color.hex) }} aria-hidden="true" />
      <span className="ap-swatches__name">{color.name_zh}</span>
      <span className="ap-swatches__hex">{color.hex}</span>
    </li>)}
  </ul>;
}

export function SwatchRow(props: SwatchProps) { return <Swatches {...props} grid={false} />; }
