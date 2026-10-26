/** Supplied 2026-10-26 display crops. Never pass these to a measurement or geometry renderer.
 * Original registered plates for 001/002 remain /sample/demo/person-00{1,2}/{front,profile90}.jpg.
 * Source and restrictions: docs/design/demo-display-assets.md.
 */
export type DemoPersonId = "person-001" | "person-002" | "person-003" | "person-004" | "person-005" | "person-006";
export interface DisplayPortrait {
  src: `/demo/portraits/${string}.webp`;
  width: 960;
  height: 1200;
  alt: string;
  facing: "camera" | "left" | "right";
  purpose: "display-only";
  registeredGeometry: false;
}
type Subject = {
  fictional: true;
  /** These crops are not verified biometric identity pairs, even when the subject has a separate report. */
  identityPairVerified: false;
  frontal: DisplayPortrait;
  profile: DisplayPortrait;
};
export type DemoPortraitPair = Subject & (
  | { reportStatus: "existing-sample"; reportHref: "/report/sample?v=p001" | "/report/sample?v=p002" }
  | { reportStatus: "visual-only"; reportHref: null }
);

/** Metadata only: importing the catalog never preloads image bytes. Default to lazy loading at point of use. */
export const demoPortraits = {
  "person-001": {
    fictional: true, identityPairVerified: false,
    reportStatus: "existing-sample", reportHref: "/report/sample?v=p001",
    frontal: { src: "/demo/portraits/person-001-frontal.webp", width: 960, height: 1200,
      alt: "AI 合成示例人物 001 的正脸肖像，齐肩直发、深色上衣", facing: "camera", purpose: "display-only", registeredGeometry: false },
    profile: { src: "/demo/portraits/person-001-profile.webp", width: 960, height: 1200,
      alt: "AI 合成示例人物 001 的侧脸肖像，齐肩直发、深色上衣", facing: "right", purpose: "display-only", registeredGeometry: false },
  },
  "person-002": {
    fictional: true, identityPairVerified: false,
    reportStatus: "existing-sample", reportHref: "/report/sample?v=p002",
    frontal: { src: "/demo/portraits/person-002-frontal.webp", width: 960, height: 1200,
      alt: "AI 合成示例人物 002 的正脸肖像，短发、深色针织上衣", facing: "camera", purpose: "display-only", registeredGeometry: false },
    profile: { src: "/demo/portraits/person-002-profile.webp", width: 960, height: 1200,
      alt: "AI 合成示例人物 002 的侧脸肖像，短发、深色针织上衣", facing: "left", purpose: "display-only", registeredGeometry: false },
  },
  "person-003": {
    fictional: true, identityPairVerified: false,
    reportStatus: "visual-only", reportHref: null,
    frontal: { src: "/demo/portraits/person-003-frontal.webp", width: 960, height: 1200,
      alt: "AI 合成示例人物 003 的正脸肖像，短发、灰色上衣", facing: "camera", purpose: "display-only", registeredGeometry: false },
    profile: { src: "/demo/portraits/person-003-profile.webp", width: 960, height: 1200,
      alt: "AI 合成示例人物 003 的侧脸肖像，短发、灰色上衣", facing: "left", purpose: "display-only", registeredGeometry: false },
  },
  "person-004": {
    fictional: true, identityPairVerified: false,
    reportStatus: "visual-only", reportHref: null,
    frontal: { src: "/demo/portraits/person-004-frontal.webp", width: 960, height: 1200,
      alt: "AI 合成示例人物 004 的正脸肖像，波浪发、深色上衣", facing: "camera", purpose: "display-only", registeredGeometry: false },
    profile: { src: "/demo/portraits/person-004-profile.webp", width: 960, height: 1200,
      alt: "AI 合成示例人物 004 的侧脸肖像，波浪发、深色上衣", facing: "left", purpose: "display-only", registeredGeometry: false },
  },
  "person-005": {
    fictional: true, identityPairVerified: false,
    reportStatus: "visual-only", reportHref: null,
    frontal: { src: "/demo/portraits/person-005-frontal.webp", width: 960, height: 1200,
      alt: "AI 合成示例人物 005 的正脸肖像，卷发、短胡须、深色上衣", facing: "camera", purpose: "display-only", registeredGeometry: false },
    profile: { src: "/demo/portraits/person-005-profile.webp", width: 960, height: 1200,
      alt: "AI 合成示例人物 005 的侧脸肖像，卷发、短胡须、深色上衣", facing: "left", purpose: "display-only", registeredGeometry: false },
  },
  "person-006": {
    fictional: true, identityPairVerified: false,
    reportStatus: "visual-only", reportHref: null,
    frontal: { src: "/demo/portraits/person-006-frontal.webp", width: 960, height: 1200,
      alt: "AI 合成示例人物 006 的正脸肖像，灰黑中长发、深色上衣", facing: "camera", purpose: "display-only", registeredGeometry: false },
    profile: { src: "/demo/portraits/person-006-profile.webp", width: 960, height: 1200,
      alt: "AI 合成示例人物 006 的侧脸肖像，灰黑中长发、深色上衣", facing: "left", purpose: "display-only", registeredGeometry: false },
  },
} as const satisfies Record<DemoPersonId, DemoPortraitPair>;
