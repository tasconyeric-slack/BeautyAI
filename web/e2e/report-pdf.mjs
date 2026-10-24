// Issue #33, Phase 2 — PDF export critical path (no API needed: sample passports always run on fixtures):
//   sample report (female) → download with the illustrations → sample (male) → image-free download
//   → free sample passport report → image-free free-edition download.
// Each click must start a real file download (never a print dialog); each file is then opened with pdf.js and checked
// for pages, selectable Chinese text, chapters, edition markers and images.
//
//   Web:  cd web && npm run build && npx next start -p 3100
//   Run:  node e2e/report-pdf.mjs   (BASE=http://localhost:3100; OUT=<dir> keeps the PDFs for visual inspection)
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { extractText, getDocumentProxy, getMeta, getResolvedPDFJS } from "unpdf";

const BASE = process.env.BASE ?? "http://localhost:3100";
const OUT = process.env.OUT ?? mkdtempSync(path.join(tmpdir(), "report-pdf-"));
const CHAPTERS = ["总体评估", "面部发现", "解读", "实际改善", "形象方案", "行动计划", "方法、局限与隐私"];
const { OPS } = await getResolvedPDFJS();
const fail = (msg) => { console.error("FAIL: " + msg); process.exit(1); };
const log = (msg) => console.log("ok  " + msg);
const squash = (t) => t.replace(/\s+/g, "");

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
await context.addInitScript(() => { window.print = () => { window.__printed = true; }; });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

async function exportFrom(url, { photos, name }) {
  await page.goto(`${BASE}${url}`);
  const box = page.getByTestId("report-pdf");
  await box.waitFor();
  const check = page.getByTestId("report-pdf-photos");
  if ((await check.isChecked()) !== photos) await check.setChecked(photos);
  const t0 = Date.now();
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 60_000 }),
    page.getByTestId("report-pdf-download").click(),
  ]);
  const file = path.join(OUT, name);
  await download.saveAs(file);
  await page.waitForFunction(() => document.querySelector('[data-testid="report-pdf-status"]')?.dataset.state === "done");
  if (await page.evaluate(() => window.__printed)) fail("export opened the print dialog");
  const bytes = new Uint8Array(readFileSync(file));
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") fail(`${name}: not a PDF`);
  const kb = Math.round(bytes.length / 1024);
  const doc = await getDocumentProxy(bytes);
  const { info } = await getMeta(doc);
  const { totalPages, text } = await extractText(doc, { mergePages: false });
  let images = 0;
  for (let i = 1; i <= totalPages; i++) {
    const ops = await (await doc.getPage(i)).getOperatorList();
    images += ops.fnArray.filter((f) => f === OPS.paintImageXObject).length;
  }
  const pages = text.map((t) => squash(t.replace(/ /g, " ")));
  for (const c of CHAPTERS) if (!pages.slice(1).some((t) => t.includes(squash(c)))) fail(`${name}: chapter ${c} missing`);
  if (pages.some((t) => t.length < 120)) fail(`${name}: a blank page`);
  return { name, file, suggested: download.suggestedFilename(), title: info.Title, totalPages, images, pages, all: pages.join(""), ms: Date.now() - t0, kb };
}

// 1. full sample, female, with the drawn illustrations
const a = await exportFrom("/report/sample", { photos: true, name: "sample-female.pdf" });
if (!a.suggested.endsWith(".pdf") || !a.title?.includes("示例")) fail(`sample metadata: ${a.suggested} / ${a.title}`);
if (!a.pages.slice(1).every((t) => t.includes("示例报告"))) fail("sample pages are not all marked as a sample");
if (a.images < 6) fail(`sample images: ${a.images}`);
if (!a.all.includes(squash("插画示意 · 不是照片编辑"))) fail("sample hair images are not labeled as illustrations");
if (!a.all.includes(squash("完整计划 · 按时间"))) fail("full sample lacks the full plan");
log(`sample (female, illustrations): ${a.totalPages} pages, ${a.images} images, ${a.kb} KB, ${a.ms} ms → ${a.suggested}`);

// 2. full sample, male, image-free
const b = await exportFrom("/report/sample?v=male", { photos: false, name: "sample-male.pdf" });
if (b.images !== 0) fail(`image-free sample has ${b.images} images`);
if (!b.all.includes(squash("本 PDF 为无图版"))) fail("image-free PDF does not say so");
log(`sample (male, image-free): ${b.totalPages} pages, ${b.kb} KB, ${b.ms} ms`);

// 3. free view of a real-flow passport (fixture): image-free by default, free edition, nothing withheld printed
await page.goto(`${BASE}/p/ap_sample_0001/report`);
await page.getByTestId("report-pdf").waitFor();
if (await page.getByTestId("report-pdf-photos").isChecked()) fail("photos are opted in by default for a real passport");
const c = await exportFrom("/p/ap_sample_0001/report", { photos: false, name: "free-female.pdf" });
if (!c.all.includes("免费版") || !c.all.includes("[完整护照]")) fail("free PDF lacks the edition markers");
if (c.all.includes(squash("完整计划 · 按时间"))) fail("free PDF contains the paid plan");
if (c.images !== 0) fail("free default export contains images");
log(`free (image-free default): ${c.totalPages} pages, ${c.kb} KB, ${c.ms} ms → ${c.suggested}`);

// 4. failure is visible and recoverable: fonts unreachable → error with retry → retry downloads
await page.goto(`${BASE}/report/sample`);
await page.getByTestId("report-pdf").waitFor();
await page.route("**/fonts/report/**", (r) => r.abort());
await page.getByTestId("report-pdf-download").click();
await page.getByTestId("report-pdf-error").waitFor({ timeout: 30_000 });
await page.unroute("**/fonts/report/**");
const [retry] = await Promise.all([page.waitForEvent("download", { timeout: 60_000 }), page.getByTestId("report-pdf-error").getByRole("button").click()]);
if (!retry.suggestedFilename().endsWith(".pdf")) fail("retry did not download");
log("error state: fonts blocked → alert with retry → retry downloads");

if (errors.length) fail(`page errors: ${errors.join(" | ")}`);
await browser.close();
console.log(`PASS report PDF export (files in ${OUT})`);
