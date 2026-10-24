// Synthetic browser harness used by generate-previews.mjs; not an application route.
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { ProfileCard, type ProfileMode } from "./profile-card";
import { StylistCard } from "./stylist-card";
import { BeforeAfterCard } from "./before-after-card";
import { exportPng } from "./export-png";

const root = createRoot(document.getElementById("app")!);
const syntheticPortrait = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 564 590"><rect width="564" height="590" fill="#202629"/><circle cx="282" cy="246" r="196" fill="#515B58"/><path d="M39 590Q72 406 211 404L352 404Q491 406 525 590" fill="#819796"/><path d="M175 244Q111 82 267 66Q428 69 384 251L412 440Q278 476 151 439Z" fill="#493C36"/><path d="M238 335L235 417Q282 460 329 417L326 333" fill="#CBAA94"/><path d="M181 193Q182 127 281 122Q377 128 380 198L365 292Q343 356 281 374Q217 352 196 292Z" fill="#E4C5AB"/><path d="M169 227Q138 129 221 91Q266 78 281 109Q311 77 351 107Q418 148 391 234Q341 203 304 130L281 113Q240 197 169 227Z" fill="#493C36" stroke="#37312E" stroke-width="3"/><path d="M211 248Q229 258 248 247M313 247Q332 258 350 246M282 257L275 291L289 291M260 320Q283 332 308 319" fill="none" stroke="#72594E" stroke-width="3" stroke-linecap="round"/><path d="M217 425L283 500L346 425M283 500V590" fill="none" stroke="#263B39" stroke-width="3"/><text x="282" y="569" text-anchor="middle" fill="#EAECE7" font-family="sans-serif" font-size="13" letter-spacing="3">SYNTHETIC ILLUSTRATION</text></svg>`)}`;

const content = {
  summary: "以柔和线条，写下清晰的个人表达。",
  face: ["舒展轮廓", "柔和线条", "自然留白"],
  color: { name: "柔夏色彩", swatches: ["#819796", "#BD9492", "#C5C0B4", "#565C66"] },
  style: { name: "自然 × 优雅", plane: { x: 3.1, y: 0.45 } },
  shortLink: "example.test/s/demo?ref=card",
};

type PreviewKind = ProfileMode | "stylist" | "compare-3:4" | "compare-9:16";
declare global {
  interface Window {
    renderCardPreview: (kind: PreviewKind) => Promise<void>;
    exportCardPreview: (kind: PreviewKind) => Promise<string>;
  }
}

window.renderCardPreview = async kind => {
  flushSync(() => root.render(kind === "stylist" ? <StylistCard styleName="锁骨轻层次" scripts={["长度保留在锁骨附近，先不要剪得太短。", "两侧低层次，保留自然的厚度。", "刘海留出弧度，能顺手拨到耳后。"]} params={{ 长度: "锁骨", 刘海: "帘式", 卷度: "自然弧度", 日常打理: "约 5 分钟" }} avoid={["顶部过高", "两侧过薄"]} shortLink={content.shortLink} />
    : kind.startsWith("compare-") ? <BeforeAfterCard beforeSrc={syntheticPortrait} afterSrc={syntheticPortrait} ratio={kind === "compare-9:16" ? "9:16" : "3:4"} shortLink={content.shortLink} />
      : <ProfileCard {...content} mode={kind as ProfileMode} portraitSrc={syntheticPortrait} />));
  await document.fonts.ready;
  await new Promise(requestAnimationFrame);
};
window.exportCardPreview = async kind => {
  await window.renderCardPreview(kind);
  const blob = await exportPng(document.querySelector<HTMLElement>("[data-card]")!, { ContentProducer: "AestheticPassport", ProduceID: `synthetic-${kind}-001` });
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};
