// V2.1 + V3B critical path (fake models, real CV): topic entry → consent → front + side photo (independent QC; the
// side photo is rejected and must not block) → front framing (zoom + pan, exact output) → presentation + optional
// questions → analysis screen (stages, no numbers) → profile → advice → hair cards (dislike reasons, stylist brief)
// → face measurement assessment (V3A) → action plan (feedback rerank, saved choice) → Look Studio free (colour layers, hair paywall) → unlock → Look Studio
// paid (hair + colour generation composed with lip) → share card PNG → delete.
//
//   API:  ANALYSIS_PROVIDER=fake IMAGE_EDIT_PROVIDER=fake QC_MODE=real WEB_ORIGINS=http://localhost:3100 make api
//   Web:  cd web && npm run build && npx next start -p 3100
//   Run:  node e2e/critical-path.mjs   (BASE=http://localhost:3100 API=http://localhost:8000; CHROMIUM=<path> optional)
// The uploaded "photo" is the program-drawn sample portrait (no real person).
import { chromium } from "playwright";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3100";
const API = process.env.API ?? "http://localhost:8000";
const t0 = Date.now();
const log = (step, extra = "") => console.log(`${String(((Date.now() - t0) / 1000).toFixed(1)).padStart(5)}s  ${step}${extra ? "  " + extra : ""}`);
const fail = (msg) => { console.error("FAIL: " + msg); process.exit(1); };
const api = async (path, init) => { const r = await fetch(`${API}${path}`, init); return { status: r.status, body: await r.json().catch(() => null) }; };

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

// A synthetic portrait PNG (front) and the synthetic side-profile illustration to upload.
const dir = mkdtempSync(join(tmpdir(), "ap-e2e-"));
const photo = join(dir, "front.png");
const sidePhoto = join(dir, "profile90.png");
await page.setViewportSize({ width: 600, height: 750 });
await page.goto(`${BASE}/sample/portrait.svg`);
await page.screenshot({ path: photo });
await page.setViewportSize({ width: 640, height: 800 });
await page.goto(`${BASE}/sample/profile.svg`);
await page.screenshot({ path: sidePhoto });
await page.setViewportSize({ width: 375, height: 812 });

// --- entry, consent, photo, QC, inputs ------------------------------------------------------------------------
await page.goto(`${BASE}/t/style?ref=e2e01`);
await page.getByRole("link", { name: "上传一张正脸 · 免费" }).first().click();
await page.waitForURL(/\/start\?topic=style/);
log("topic entry → /start", page.url().replace(BASE, ""));
for (const name of ["同意处理我的人脸照片", "已满 14 周岁"]) await page.getByLabel(name).check();
await page.getByRole("button", { name: "同意并选择照片" }).click();
await page.locator('[data-slot="front"] input[type="file"]').setInputFiles(photo);
await page.locator('[data-slot="front"] [data-qc]').waitFor({ timeout: 20000 });
const qcText = await page.locator('[data-slot="front"] [data-qc]').innerText();
if (/太小|模糊/.test(qcText) || (await page.locator('[data-slot="front"] [data-qc="reject"]').count())) fail(`clear portrait flagged: ${qcText}`);
log("QC verdict (front)", qcText.replace(/\s+/g, " ").slice(0, 40));
// framing: zoom in a little and pan; the slot preview becomes the exact rendered output
await page.locator('[data-testid="frame-front"]').click();
await page.locator('input[aria-label="缩放"]').fill("1.25");
const vp = await page.locator('[data-testid="framing-viewport"]').boundingBox();
await page.mouse.move(vp.x + vp.width / 2, vp.y + vp.height / 2);
await page.mouse.down();
await page.mouse.move(vp.x + vp.width / 2 + 12, vp.y + vp.height / 2 + 8, { steps: 4 });
await page.mouse.up();
const outSize = await page.locator('[data-testid="framing-output"]').innerText();
await page.locator('[data-testid="framing-confirm"]').click();
await page.locator('[data-slot="front"] [data-qc]').waitFor({ timeout: 20000 });
log("framing", outSize.replace(/\s+/g, " "));
// optional true side photo: QC'd on its own; a failed one shows role-specific guidance and never blocks
await page.locator('[data-slot="profile90"] input[type="file"]').setInputFiles(sidePhoto);
await page.locator('[data-slot="profile90"] [data-qc]').waitFor({ timeout: 20000 });
const sideQc = await page.locator('[data-slot="profile90"] [data-qc]').getAttribute("data-qc");
log("QC verdict (side)", `${sideQc} · ${(await page.locator('[data-slot="profile90"] [data-qc]').innerText()).replace(/\s+/g, " ").slice(0, 60)}`);
await page.getByRole("button", { name: /女性化/ }).click();
await page.getByRole("button", { name: "发型", exact: true }).click();          // optional goal
await page.getByRole("radio", { name: "10 分钟左右" }).click();                  // optional upkeep
await page.getByRole("button", { name: "开始分析" }).click();
await page.waitForURL(/\/p\/ap_[0-9a-f]{12}$/);
const id = page.url().split("/p/")[1];
log("passport created", id);

// --- analysis screen: real stages, measurement visual, no numbers or conclusions ------------------------------
await page.getByRole("list", { name: "分析进度" }).waitFor();
const revealText = await page.locator("main").innerText();
if (/\d\.\d\d|长宽比|三庭|眼距|初见/.test(revealText)) fail("analysis screen shows measurements or conclusions");
log("analysis screen", (await page.getByRole("heading", { level: 1 }).innerText()).trim());
await page.waitForURL(new RegExp(`/p/${id}/style$`), { timeout: 60000 });
log("full passport → topic sub-page", "/style");
const ctxSent = (await api(`/api/passport/${id}`)).body.passport.user_context;
if (!ctxSent.optimize_focus.includes("hair") || ctxSent.constraints.daily_minutes !== 10) fail("optional answers not stored");

// --- profile, advice ------------------------------------------------------------------------------------------
await page.goto(`${BASE}/p/${id}`);
await page.getByText("你的形象档案").waitFor();
await page.getByRole("heading", { name: "接下来" }).waitFor();
await page.getByRole("navigation", { name: "护照导航" }).getByRole("link", { name: "建议" }).click();
await page.waitForURL(new RegExp(`/p/${id}/advice$`));
if ((await page.getByText("选什么 ·").count()) < 5) fail("advice groups missing");
log("profile → advice", `${await page.getByText("选什么 ·").count()} decision groups`);

// --- face: measurement workbench (V3A D34 → V3B D35) — real CV numbers, overlays from the same landmarks -------
const fv = (await api(`/api/passport/${id}`)).body;
const mp = fv.passport.measurement_profile;
if (!mp || mp.coverage.measured < 30) fail(`expected ≥ 30 measured front metrics, got ${mp?.coverage.measured}`);
if (!fv.entitlement.locked.includes("measurement_profile.full")) fail("free passport not marked locked");
if (mp.metrics.some((m) => m.tier !== "free" && (m.value !== null || m.overlay.segments.length))) fail("a locked metric leaked a value or overlay");
if (!mp.metrics.some((m) => m.locked)) fail("locked rows were dropped instead of listed");
if (mp.metrics.some((m) => m.view === "side" && m.value !== null)) fail("a side-profile metric has a value without a usable side photo");
const sideView = mp.views.find((v) => v.role === "profile90");
log("side view", `${sideView.status} · ${sideView.reason}`);
const capture = mp.views.find((v) => v.role === "front").capture;
if (!capture?.edited) fail("the confirmed framing was not recorded");
const geo = (await api(`/api/passport/${id}/geometry`)).body;
if (!geo?.points?.cheek_l) fail("geometry.json has no measurement points");
await page.goto(`${BASE}/p/${id}/face`);
await page.getByTestId("workbench").waitFor();
if (/\d\s*分(?!钟)|\/\s*10|颜值|评分|百分位/.test(await page.locator("main").innerText())) fail("face page shows a score");
await page.setViewportSize({ width: 1280, height: 900 });
await page.locator('[data-metric="M001"]').click();
await page.locator('svg[data-measure-overlay="面长宽比"]').waitFor();
await page.locator('[data-metric="M062"]').hover();                                   // hover previews …
await page.locator('svg[data-measure-overlay="鼻翼宽 / 颧宽"]').waitFor();
const spec = mp.metrics.find((m) => m.id === "M062").overlay.segments.length;
if ((await page.locator('svg[data-measure-overlay] line').count()) !== spec) fail("overlay segments do not match the measurement's own geometry");
await page.mouse.move(5, 5);                                                            // … leaving restores the pin
await page.locator('svg[data-measure-overlay="面长宽比"]').waitFor();
await page.getByRole("tab", { name: /侧脸/ }).click();
if ((await page.getByTestId("workbench").getAttribute("data-view")) !== "profile90") fail("side tab did not switch the view");
if (!(await page.locator('[data-testid="metric-list"] [data-metric="M117"]').count())) fail("side list missing");
await page.getByRole("tab", { name: /正脸/ }).click();
await page.setViewportSize({ width: 375, height: 812 });
log("face", `${mp.coverage.total_measured}/${mp.coverage.total_defined} measured · hover / pin / view switch on real geometry`);

// --- hair: three stacked cards, readable reasons, stylist brief -------------------------------------------------
await page.goto(`${BASE}/p/${id}/hair`);
const cards = page.getByRole("list", { name: "三个发型方向" }).getByRole("article");
await cards.first().waitFor();
if ((await cards.count()) !== 3) fail(`expected 3 hair cards for a free passport, got ${await cards.count()}`);
const boxes = await Promise.all([0, 1, 2].map((i) => cards.nth(i).boundingBox()));
if (!(boxes[0].y < boxes[1].y && boxes[1].y < boxes[2].y && Math.abs(boxes[0].x - boxes[1].x) < 2)) fail("hair cards are not stacked vertically");
await cards.nth(1).getByRole("button", { name: "不喜欢", exact: true }).click();
const chip = cards.nth(1).getByRole("group", { name: /哪里不合适/ }).getByRole("button").first();
const cb = await chip.boundingBox();
if (!cb || cb.width < 60 || cb.height > 60) fail(`reason chip collapsed (${JSON.stringify(cb)})`);
await cards.first().getByRole("button", { name: /就选这个/ }).click();
const dialog = page.getByRole("dialog");
await dialog.getByRole("button", { name: "复制给发型师" }).waitFor();
await dialog.getByRole("button", { name: "保存到我的方案" }).click();
await page.keyboard.press("Escape");
log("hair", "3 stacked cards, reason chips readable, brief sheet saved");

// --- action plan: feedback reranks, the chosen hairstyle is there ---------------------------------------------
await page.goto(`${BASE}/p/${id}/plan`);
await page.getByRole("heading", { name: "先做这 3 件事" }).waitFor();
await page.getByText(/发型：/).first().waitFor();
const first = page.locator("article").first();
const before = await first.locator("h2").innerText();
await first.getByRole("button", { name: "不喜欢", exact: true }).click();
await first.getByRole("button", { name: "超出预算" }).click();
await page.getByRole("status").filter({ hasText: "已按你的" }).waitFor({ timeout: 10000 });
// The dislike is debounced (sent ~0.9 s after a reason) and the status line may already exist from the hair
// feedback, so wait for the reorder itself instead of a fixed delay.
await page.waitForFunction((b) => document.querySelector("article h2")?.textContent !== b, before, { timeout: 10000 }).catch(() => {});
const after = await page.locator("article").first().locator("h2").innerText();
if (before === after) fail("feedback did not change the plan order");
await page.locator("article").first().getByRole("button", { name: "标记完成" }).click();
log("plan", `“${before.slice(0, 12)}…” hidden → “${after.slice(0, 12)}…”; marked done`);

// --- Look Studio, free: colour layers work, AI hair is paid -----------------------------------------------------
const free = (await api(`/api/passport/${id}`)).body;
if (free.passport.analysis.hair_options.length !== 3) fail("free view should carry all three hair directions as text");
if (free.partial.previews.length) fail("a free passport must not get an automatic AI preview");
if ((await api(`/api/passport/${id}/previews`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "hair", target_ids: ["safe"] }) })).status !== 402) fail("free preview not refused");
await page.goto(`${BASE}/p/${id}/studio?hair=bold`);
const canvas = page.getByTestId("studio-canvas");
await canvas.waitFor({ timeout: 15000 });
await page.getByRole("link", { name: "解锁后生成发型试看" }).waitFor();
const hash = () => canvas.evaluate((c) => { const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let h = 0; for (let i = 0; i < d.length; i += 97) h = (h * 31 + d[i]) | 0; return h; });
const h0 = await hash();
await page.getByRole("radiogroup", { name: "唇色" }).getByRole("radio").nth(1).click();
await page.getByRole("radiogroup", { name: "近脸色" }).getByRole("radio").nth(1).click();
await page.waitForTimeout(300);
const h1 = await hash();
if (h0 === h1) fail("colour layers did not change the portrait");
log("studio (free)", "lip + near-face colour composed locally; AI hair behind the one-time unlock");

// --- unlock, then hair + colour generation composed with the lip layer -----------------------------------------
await page.goto(`${BASE}/p/${id}/unlock`);
await page.getByRole("button", { name: /¥39/ }).click();
await page.getByRole("heading", { name: "完整护照已解锁" }).waitFor();
log("fake checkout → full passport");
const paidMp = (await api(`/api/passport/${id}`)).body.passport.measurement_profile;
const valued = (x) => x.metrics.filter((m) => m.value !== null).length;
if (valued(paidMp) <= valued(mp) || paidMp.metrics.some((m) => m.locked)) fail("unlocking did not add the detailed measurements");
await page.goto(`${BASE}/p/${id}/studio?hair=bold&hc=1&lip=${free.passport.analysis.color_profile.lip_families[0].hex.slice(1)}`);
await canvas.waitFor({ timeout: 15000 });
await page.getByRole("button", { name: "生成这个造型" }).click();
await page.getByText(/AI 发型模拟已叠加|这次没有生成成功/).first().waitFor({ timeout: 60000 });
const pv = (await api(`/api/passport/${id}`)).body.partial.previews.find((p) => p.target_id === "bold_hc1");
if (!pv || pv.status !== "succeeded" || !pv.crop_box) fail(`combined preview not ready: ${JSON.stringify(pv)}`);
const hold = page.getByRole("button", { name: "按住看原图" });
await hold.focus();
await page.keyboard.down("Space");
if ((await hold.getAttribute("aria-pressed")) !== "true") fail("hold-to-compare did not engage");
await page.keyboard.up("Space");
await page.getByRole("button", { name: /保存/ }).first().click();
log("studio (paid)", `bold + hair colour generated (crop ${pv.crop_box.map((x) => x.toFixed(2)).join(",")}), lip on top, look saved`);

// --- share card, delete -----------------------------------------------------------------------------------------
await page.goto(`${BASE}/p/${id}/share`);
await page.locator("[data-card]").first().waitFor();
const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), page.getByRole("button", { name: /保存为 PNG/ }).click()]);
const png = readFileSync(await dl.path());
if (!png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) fail("export is not a PNG");
if (!png.toString("latin1").includes("AIGC")) fail("PNG has no AIGC metadata");
log("share card exported", `${(png.length / 1024).toFixed(0)} KB, AIGC metadata present`);

await page.goto(`${BASE}/p/${id}`);
await page.getByRole("button", { name: /删除数据/ }).click();
await page.getByRole("button", { name: "删除我的照片与报告" }).click();
await page.getByRole("button", { name: "确认删除" }).click();
await page.getByText("你的照片与报告已删除").waitFor();
const gone = await fetch(`${API}/api/passport/${id}`);
if (gone.status !== 410) fail(`deleted passport still served (${gone.status})`);
log("deleted", "API now answers 410");

if (errors.length) fail("page errors: " + errors.slice(0, 3).join(" | "));
console.log(`PASS critical path in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
await browser.close();
