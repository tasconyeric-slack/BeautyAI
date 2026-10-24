import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ProfileCard, isProfileModeAvailable } from "./profile-card";
import { StylistCard } from "./stylist-card";
import { BeforeAfterCard } from "./before-after-card";
import { IllustratedAvatar } from "./illustrated-avatar";

const photo = "https://private.example.test/front.jpg?secret=do-not-share";
const content = {
  summary: "用柔和的线条，留下清晰的自己。",
  face: ["轮廓舒展", "线条柔和"],
  color: { name: "柔夏", swatches: ["#819796", "#BD9492", "#C5C0B4", "#565C66"] },
  style: { name: "自然 × 优雅", plane: { x: 3.1, y: 0.45 } },
  shortLink: "example.test/s/synthetic?ref=card",
};

for (const mode of ["avatar", "palette"] as const) {
  test(`${mode} never renders a supplied photo source, including hidden DOM and preload links`, () => {
    const html = renderToStaticMarkup(<ProfileCard {...content} mode={mode} portraitSrc={photo} />);
    assert.doesNotMatch(html, /<img\b|<image\b|<foreignObject\b|url\(|private\.example|secret=|front\.jpg/i);
    assert.match(html, /AI 生成/);
    assert.match(html, /形象护照/);
    assert.match(html, /example\.test\/s\/synthetic/);
    assert.match(html, /data-export-width="1080"/);
    assert.match(html, /data-export-height="1440"/);
  });
}

test("portrait is unavailable without an explicit source and never silently falls back", () => {
  assert.equal(isProfileModeAvailable("portrait"), false);
  assert.equal(isProfileModeAvailable("portrait", "  "), false);
  assert.equal(isProfileModeAvailable("avatar"), true);
  assert.equal(isProfileModeAvailable("portrait", photo), true);
  assert.throws(() => renderToStaticMarkup(<ProfileCard {...content} mode="portrait" portraitSrc="" />), /portraitSrc/);
  const html = renderToStaticMarkup(<ProfileCard {...content} mode="portrait" portraitSrc={photo} />);
  assert.match(html, /<img\b/);
  assert.match(html, /AI 生成/);
  assert.match(html, /形象护照/);
});

test("profile style map uses rules/K4 visual-weight [1,5] and angular-rounded [-2,2] units", () => {
  const centered = renderToStaticMarkup(<ProfileCard {...content} mode="palette" style={{ name: "古典型", plane: { x: 3, y: 0 } }} />);
  assert.match(centered, /<circle cx="150" cy="125" r="6"/);
  assert.match(centered, /横轴量感轻盈到浓郁，纵轴利落到圆润/);
  const roundedLight = renderToStaticMarkup(<ProfileCard {...content} mode="palette" style={{ name: "少女型", plane: { x: 1, y: 2 } }} />);
  assert.match(roundedLight, /<circle cx="44" cy="42" r="6"/);
});

test("stylist card includes three usable instructions, identity, and shortlink slot", () => {
  const html = renderToStaticMarkup(<StylistCard styleName="锁骨轻层次" scripts={["保留锁骨长度", "两侧低层次", "刘海留出弧度"]} params={{ 长度: "锁骨", 打理: "5 分钟" }} avoid={["顶部过高"]} hideFace previewSrc={photo} />);
  for (const text of ["保留锁骨长度", "两侧低层次", "刘海留出弧度", "AI 生成", "形象护照", "短链位"]) assert.ok(html.includes(text));
  assert.doesNotMatch(html, /private\.example|<img\b|<image\b/);
  const visible = renderToStaticMarkup(<StylistCard styleName="短发" scripts={["一", "二", "三"]} params={{}} avoid={[]} hideFace={false} previewSrc={photo} />);
  assert.match(visible, /<img\b/);
});

for (const ratio of ["3:4", "9:16"] as const) {
  test(`before-after ${ratio} preserves both images and the visible AI label`, () => {
    const html = renderToStaticMarkup(<BeforeAfterCard beforeSrc="/synthetic-before.png" afterSrc="/synthetic-after.png" ratio={ratio} />);
    assert.match(html, /synthetic-before\.png/);
    assert.match(html, /synthetic-after\.png/);
    assert.match(html, /AI 生成/);
    assert.match(html, /形象护照/);
    assert.match(html, /短链位/);
    assert.ok(html.includes(`data-export-height="${ratio === "3:4" ? 1440 : 1920}"`));
  });
}

test("avatar is deterministic parameter-only SVG and supports different hair and expression parameters", () => {
  const hair = { length: "collarbone", fringe: "curtain", curl: "wave", colorHex: "#3C302E" };
  const props = { hair, palette: ["#819796", "#BD9492"], presentation: "feminine" as const };
  const html = renderToStaticMarkup(<IllustratedAvatar {...props} />);
  assert.equal(html, renderToStaticMarkup(<IllustratedAvatar {...props} />));
  assert.match(html, /<svg\b/);
  assert.doesNotMatch(html, /<img\b|<image\b|href=|url\(|filter=|<foreignObject\b/);
  assert.notEqual(html, renderToStaticMarkup(<IllustratedAvatar {...props} hair={{ ...hair, length: "short", fringe: "blunt", curl: "straight" }} presentation="neutral" />));
  assert.doesNotMatch(renderToStaticMarkup(<IllustratedAvatar {...props} hair={{ ...hair, colorHex: "url(https://private.example/photo)" }} palette={["url(https://private.example/photo)"]} />), /private\.example|url\(/);
});
