// Package-free render tests. Run: node components/ds/render-tests.mjs
// Kept outside Vitest's filename glob so T05 can add its runner independently.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(here, "../../package.json"));
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const build = mkdtempSync(join(tmpdir(), "passport-ds-"));
symlinkSync(resolve(here, "../../node_modules"), join(build, "node_modules"), "dir");
require.extensions[".css"] = () => {};
for (const file of readdirSync(here).filter((name) => /\.tsx?$/.test(name))) {
  const { outputText } = ts.transpileModule(readFileSync(join(here, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  });
  writeFileSync(join(build, file.replace(/\.tsx?$/, ".js")), outputText);
}
writeFileSync(join(build, "tokens.css"), "");
after(() => rmSync(build, { recursive: true, force: true }));
const ds = require(join(build, "index.js"));
const render = (name, props) => renderToStaticMarkup(React.createElement(ds[name], props));
const noop = () => {};
const colors = [{ hex: "#1F4E5F", name_zh: "墨青" }, { hex: "#DBBDA2", name_zh: "燕麦" }];

test("Stage renders its content on a portrait stage", () => {
  assert.match(render("Stage", { children: "人像区域" }), /人像区域/);
});
test("CompareView shows the preview with a single hold-to-compare control (D31)", () => {
  const html = render("CompareView", { beforeSrc: "/before.svg", afterSrc: "/after.svg", label: "发型方向", aiLabel: "AI 试看" });
  assert.match(html, /按住看原图/);
  assert.doesNotMatch(html, /type="range"/);
  assert.doesNotMatch(html, /拖动对比/);
  assert.equal((html.match(/<button/g) ?? []).length, 1);
  assert.match(html, /AI 试看/);
  assert.match(html, /aria-pressed="false"/);
});
test("StylePlane exposes an accessible chart and distinguishes preference from observation", () => {
  const html = render("StylePlane", { prototypes: [{ key: "elegant", name: "优雅型", x: 3, y: 1.2 }], me: { x: 3, y: 1, r: .4 }, preference: { x: 4, y: 1 }, target: { x: 4, y: -1 }, between: ["优雅型", "古典型"] });
  assert.match(html, /role="img"/);
  for (const label of ["优雅型", "你的特征", "你喜欢", "你想去", "介于优雅型与古典型之间"]) assert.ok(html.includes(label));
});
test("FeedbackChips renders dislike reasons when selected", () => {
  const html = render("FeedbackChips", { value: "dislike", reasons: ["不适合日常", "打理时间长"], onChange: noop });
  assert.match(html, /aria-pressed="true"/);
  assert.ok(html.includes("打理时间长"));
});
test("ResembleToggle renders controlled yes/no state", () => {
  const html = render("ResembleToggle", { value: "yes", onChange: noop });
  assert.match(html, /像我/);
  assert.match(html, /不太像/);
  assert.match(html, /aria-pressed="true"/);
});
for (const name of ["SwatchRow", "SwatchGrid"]) test(`${name} names every color without relying on color alone`, () => {
  const html = render(name, { colors });
  assert.ok(html.includes("墨青") && html.includes("燕麦"));
  assert.match(html, /#1F4E5F/);
});
test("ConfidenceNote explains uncertainty without a numeric score", () => {
  const html = render("ConfidenceNote", { level: "low", tip: "光线偏暖，建议在窗边重新拍摄。" });
  assert.ok(html.includes("方向参考") && html.includes("光线偏暖"));
});
test("PaywallCard renders benefit list and a readable unlock action", () => {
  const html = render("PaywallCard", { title: "继续探索你的方向", bullets: ["查看发型三方向", "保存发型师沟通卡"], onUnlock: noop });
  assert.match(html, /解锁完整护照/);
  assert.match(html, /<li/);
});
test("ScoreTeaserCard contains only approved visible copy, with no rendered digits", () => {
  const html = render("ScoreTeaserCard", { onNotify: noop });
  const visibleText = html.replace(/<[^>]*>/g, "");
  assert.equal(visibleText, "颜值评分 · 即将上线上线时告诉我");
  assert.doesNotMatch(html, /\d/);
});
test("ProfileTriptych renders three independently labelled slots", () => {
  const html = render("ProfileTriptych", { face: "轮廓清晰", color: "柔和冷调", style: "优雅方向" });
  for (const text of ["面部特点", "个人色彩", "风格方向", "轮廓清晰", "柔和冷调", "优雅方向"]) assert.ok(html.includes(text));
});
test("RevealSteps presents ordered results and a waiting state", () => {
  const html = render("RevealSteps", { steps: [{ label: "面部特点", value: "轮廓清晰" }, { label: "色彩方向", value: null }] });
  assert.match(html, /<ol/);
  assert.match(html, /轮廓清晰/);
  assert.match(html, /正在整理/);
});
