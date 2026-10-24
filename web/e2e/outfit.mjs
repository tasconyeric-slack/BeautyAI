// Issue #23 critical path (fixtures, no API keys): outfit boards → compare two → "I'll wear this" → copy checklist →
// capsule owned/budget toggles → refresh keeps every choice → delete-style clear. Checked at 375px and desktop.
//
//   Web:  cd web && NEXT_PUBLIC_USE_FIXTURE=1 npx next dev -p 3100
//   Run:  BASE=http://localhost:3100 node e2e/outfit.mjs      (CHROMIUM=<path> optional; SHOTS=<dir> for screenshots)
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3100";
const ID = "ap_sample_0001";
const SHOTS = process.env.SHOTS;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
try {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, permissions: ["clipboard-read", "clipboard-write"] });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const noOverflow = async (label) => {
    const w = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
    assert.ok(w.s <= w.c + 1, `${label}: horizontal overflow ${w.s} > ${w.c}`);
  };
  const shot = (name) => SHOTS && page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });

  await page.goto(`${BASE}/p/${ID}/outfit`);
  await page.getByTestId("boards").waitFor();
  // the fixture serves the free view (occasions locked → boards from the two free formulas); a paid passport gives three
  const keys = await page.locator('[data-testid^="board-"][data-testid$="-gap"]').evaluateAll((els) => els.map((e) => e.dataset.testid.slice(6, -4)));
  assert.ok(keys.length >= 2 && keys.length <= 3, `2–3 boards, got ${keys.length}`);
  const [A, B] = [keys[0], keys[keys.length - 1]];
  for (const k of keys) assert.ok(await page.getByTestId(`board-${k}`).isVisible(), `${k} board`);
  assert.ok((await page.getByTestId(`board-${A}`).innerText()).includes("近脸色板"), "near-face palette");
  await noOverflow("mobile boards");
  await shot("mobile-boards");

  // compare the first with the last board and choose B
  await page.getByLabel("对比 B").selectOption(B);
  assert.match(await page.getByTestId("compare-summary").innerText(), /共用单品：/);
  await noOverflow("mobile compare");
  await page.getByTestId("compare-pick-b").click();
  await page.getByTestId("outfit-decision").waitFor();
  assert.match(await page.getByTestId("decision-text").innerText(), /】穿搭清单/);

  // owned toggle changes the checklist; copy puts it on the clipboard
  await page.getByTestId(`board-${B}`).getByLabel("我已有").first().check();
  assert.match(await page.getByTestId("decision-text").innerText(), /\[已有\]/);
  await page.getByTestId("decision-copy").click();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(clip, /穿搭清单/);
  assert.doesNotMatch(clip, /https?:|\/p\//, "no link in the shared text");

  // capsule: budget + owned
  await page.getByTestId("budget-low").click();
  const before = await page.getByTestId("capsule-summary").innerText();
  await page.getByTestId("outfit-capsule").getByLabel("我已有").first().check();
  assert.notEqual(await page.getByTestId("capsule-summary").innerText(), before, "summary reacts to owned");
  await noOverflow("mobile capsule");
  await shot("mobile-decision-capsule");

  // refresh keeps everything, no login
  const summary = await page.getByTestId("capsule-summary").innerText();
  await page.reload();
  await page.getByTestId("boards").waitFor();
  assert.equal(await page.getByTestId(`choose-${B}`).getAttribute("aria-pressed"), "true", "choice survives refresh");
  assert.equal(await page.getByLabel("对比 B").inputValue(), B, "pair survives refresh");
  assert.equal(await page.getByTestId("budget-low").getAttribute("aria-checked"), "true", "budget survives refresh");
  assert.equal(await page.getByTestId("capsule-summary").innerText(), summary, "capsule survives refresh");
  assert.ok(await page.getByTestId("outfit-decision").isVisible());

  // existing behaviour is still there: formulas, core items with feedback
  assert.ok(await page.getByRole("heading", { name: "搭配公式" }).isVisible());
  assert.ok(await page.getByRole("heading", { name: "核心单品" }).isVisible());

  // desktop layout
  await page.setViewportSize({ width: 1280, height: 900 });
  await noOverflow("desktop");
  await shot("desktop");
  assert.deepEqual(errors, [], "no page errors");
  console.log("outfit e2e ok");
} finally {
  await browser.close();
}
