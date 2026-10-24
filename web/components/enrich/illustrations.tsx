/** Original inline-SVG pictograms for the enrichment cards. No photos, no external resources.
 *  Colors use currentColor so tiles can sit on the light reading surface or the dark stage. */
import * as React from "react";

const S = { fill: "none", stroke: "currentColor", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

/** About-45° head turn: head outline, the visible jaw line highlighted, an arc arrow for the turn. */
export function ProfileGuide({ label }: { label: string }) {
  return (
    <svg viewBox="0 0 160 160" width="100%" height="100%" role="img" aria-label={label}>
      <title>{label}</title>
      <circle cx="80" cy="82" r="66" fill="currentColor" opacity="0.06" />
      {/* neck + shoulders */}
      <path d="M64 120 L62 138 M92 118 L96 138 M34 156 Q44 136 62 138 L96 138 Q116 138 126 156" {...S} strokeWidth="2.2" opacity="0.7" />
      {/* hair back */}
      <path d="M48 70 Q46 34 82 30 Q114 30 116 64 Q118 86 104 96" {...S} strokeWidth="2.4" />
      {/* face turned to the right: forehead → nose tip → lips → chin */}
      <path d="M58 52 Q72 44 90 48 L108 60 Q112 70 110 76 L118 86 L110 90 Q112 96 108 98 Q110 104 104 106" {...S} strokeWidth="2.4" />
      {/* jaw line (what the photo is for) */}
      <path d="M104 106 Q96 118 80 120 Q66 118 60 104" fill="none" stroke="var(--ap-amber, #9A5B1F)" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M58 52 Q50 74 60 104" {...S} strokeWidth="2.4" />
      {/* ear + eye */}
      <path d="M66 74 Q60 72 60 80 Q60 90 68 90" {...S} strokeWidth="2" />
      <path d="M94 70 Q99 67 103 70" {...S} strokeWidth="2.2" />
      {/* turn arrow */}
      <path d="M30 40 Q42 18 70 14" {...S} strokeWidth="1.6" strokeDasharray="3 4" />
      <path d="M64 9 L71 14 L64 19" {...S} strokeWidth="1.6" />
      <text x="20" y="58" fontSize="13" fontFamily="ui-monospace, monospace" fill="currentColor">45°</text>
    </svg>
  );
}

/** Close-up of hair strands: straight / wavy / curly / coily. */
export function HairStrands({ texture }: { texture: "straight" | "wavy" | "curly" | "coily" | "unknown" }) {
  const xs = [26, 40, 54, 68, 82];
  const strand = (x: number) => {
    switch (texture) {
      case "straight":
        return `M${x} 14 L${x + 2} 86`;
      case "wavy":
        return `M${x} 14 Q${x + 9} 32 ${x} 50 Q${x - 9} 68 ${x} 86`;
      case "curly":
        return `M${x} 14 q8 6 0 12 q-8 6 0 12 q8 6 0 12 q-8 6 0 12 q8 6 0 12 q-8 6 0 12`;
      case "coily":
        return `M${x} 14 l5 4 -9 4 9 4 -9 4 9 4 -9 4 9 4 -9 4 9 4 -9 4 9 4 -9 4 9 4 -9 4 9 4 -5 4`;
      default:
        return `M${x} 14 L${x} 86`;
    }
  };
  return (
    <svg viewBox="0 0 108 100" width="100%" height="100%" aria-hidden>
      {texture === "unknown"
        ? <text x="54" y="62" textAnchor="middle" fontSize="34" fill="currentColor" opacity="0.5">?</text>
        : xs.map((x, i) => <path key={x} d={strand(x)} {...S} strokeWidth={2.2} opacity={0.55 + (i % 2) * 0.35} />)}
    </svg>
  );
}

/** Top-down crown with more or fewer strands for hair density. */
export function DensityCrown({ level }: { level: "fine" | "medium" | "thick" | "unknown" }) {
  const n = { fine: 5, medium: 9, thick: 15, unknown: 0 }[level];
  const lines = Array.from({ length: n }, (_, i) => {
    const a = Math.PI * (0.12 + (0.76 * i) / Math.max(1, n - 1));
    const x1 = 50 - Math.cos(a) * 22, y1 = 58 - Math.sin(a) * 22;
    const x2 = 50 - Math.cos(a) * 36, y2 = 58 - Math.sin(a) * 36;
    return <path key={i} d={`M${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}`} {...S} strokeWidth={2} />;
  });
  return (
    <svg viewBox="0 0 100 70" width="100%" height="100%" aria-hidden>
      <path d="M22 60 Q22 30 50 28 Q78 30 78 60" {...S} strokeWidth={1.6} opacity={0.4} />
      {level === "unknown" ? <text x="50" y="56" textAnchor="middle" fontSize="22" fill="currentColor" opacity="0.5">?</text> : lines}
    </svg>
  );
}

/** Garment-on-hanger pictograms for the three self-selected frames: they describe clothes, not bodies. */
export function FrameGarment({ frame }: { frame: "straight" | "wave" | "natural" | "none" }) {
  const hanger = <path d="M50 10 q0 -6 5 -6 q5 0 5 5 q0 4 -5 6 L50 18 L18 30 L82 30 L50 18" {...S} strokeWidth={1.8} opacity={0.65} />;
  let body: React.ReactNode;
  switch (frame) {
    case "straight": // structured jacket: square shoulders, straight hem, lapels
      body = <>
        <path d="M22 32 L40 30 L50 44 L60 30 L78 32 L80 92 L20 92 Z" {...S} strokeWidth={2.2} />
        <path d="M40 30 L46 58 L50 44 M60 30 L54 58 L50 44 M50 58 L50 92" {...S} strokeWidth={1.8} />
        <path d="M22 32 L12 78 M78 32 L88 78" {...S} strokeWidth={2.2} />
      </>;
      break;
    case "wave": // soft wrap top: rounded shoulders, curved neckline and hem
      body = <>
        <path d="M26 34 Q38 28 42 30 Q50 46 58 30 Q62 28 74 34 Q78 60 72 66 Q80 80 76 92 Q50 98 24 92 Q20 80 28 66 Q22 60 26 34 Z" {...S} strokeWidth={2.2} />
        <path d="M42 30 Q48 60 70 70 M28 66 Q50 62 72 66" {...S} strokeWidth={1.6} />
        <path d="M26 34 Q16 50 18 72 M74 34 Q84 50 82 72" {...S} strokeWidth={2.2} />
      </>;
      break;
    case "natural": // relaxed shirt: dropped shoulders, roomy body, rolled sleeves
      body = <>
        <path d="M16 40 L38 30 L50 38 L62 30 L84 40 L86 94 L14 94 Z" {...S} strokeWidth={2.2} />
        <path d="M16 40 L6 70 L16 72 M84 40 L94 70 L84 72 M50 38 L50 94 M8 64 L18 66 M92 64 L82 66" {...S} strokeWidth={1.8} />
        <path d="M58 52 h10 v10 h-10 z" {...S} strokeWidth={1.4} />
      </>;
      break;
    default:
      body = <text x="50" y="70" textAnchor="middle" fontSize="26" fill="currentColor" opacity="0.5">?</text>;
  }
  return <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden>{hanger}{body}</svg>;
}

/** Clock face with a filled wedge for daily upkeep minutes (0–30). */
export function MinutesDial({ minutes }: { minutes: number }) {
  const frac = Math.min(1, minutes / 30);
  const a = frac * 2 * Math.PI;
  const x = 24 + 18 * Math.sin(a), y = 24 - 18 * Math.cos(a);
  return (
    <svg viewBox="0 0 48 48" width="28" height="28" aria-hidden>
      <circle cx="24" cy="24" r="20" {...S} strokeWidth={2} opacity={0.5} />
      {frac > 0 && frac < 1 && <path d={`M24 24 L24 6 A18 18 0 ${frac > 0.5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)} Z`} fill="currentColor" opacity={0.75} />}
      {frac >= 1 && <circle cx="24" cy="24" r="18" fill="currentColor" opacity={0.75} />}
    </svg>
  );
}

/** One to three stacked coins for a budget tier. */
export function Coins({ n }: { n: 1 | 2 | 3 }) {
  return (
    <svg viewBox="0 0 40 40" width="26" height="26" aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <ellipse key={i} cx="20" cy={30 - i * 7} rx="13" ry="5" fill="currentColor" fillOpacity={0.15 + i * 0.2} stroke="currentColor" strokeWidth={1.6} />
      ))}
    </svg>
  );
}
