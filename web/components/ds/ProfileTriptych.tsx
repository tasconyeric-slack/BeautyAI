import type { ReactNode } from "react";
import "./tokens.css";

export interface ProfileTriptychProps { face: ReactNode; color: ReactNode; style: ReactNode }

export function ProfileTriptych({ face, color, style }: ProfileTriptychProps) {
  return <div className="ap-triptych ap-ds">
    {([ ["面部特点", face], ["个人色彩", color], ["风格方向", style] ] as const).map(([label, content], index) => <section className="ap-triptych__panel" key={label}>
      <p className="ap-eyebrow"><span className="ap-numeral">0{index + 1}</span>{label}</p>
      <div className="ap-triptych__content">{content}</div>
    </section>)}
  </div>;
}
