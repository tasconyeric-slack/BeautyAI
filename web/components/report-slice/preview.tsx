"use client";

import * as React from "react";
import { sampleReportResponse } from "@/lib/fixture/backend";
import { DEMO_CASES, demoCaseByKey } from "@/lib/fixtures/demo_cases";
import { reportSlice as c } from "@/lib/copy/report-slice";
import { backendFor } from "@/lib/api";
import type { FaceGeometry } from "@/lib/tint";
import { FullReportContent } from "@/components/report/full-report";
import { StaticPassportProvider } from "@/lib/state/passport-store";
import { ReportSlice } from "./report-slice";
import s from "./report-slice.module.css";

const states = { normal: c.normal, expired: c.expiredDemo, "expire-soon": c.expireSoon, "no-geometry": c.noGeometry, "missing-side": "缺侧脸媒体", "broken-preview": "试看结果图片加载失败", "needs-photo": c.needsPhoto, limited: c.limited, unavailable: c.unavailable, pending: c.pending, failed: c.failed };
type State = keyof typeof states;
const subscribeReady = () => () => {};

/** Development host only. Review states are local clones, never written back into the product contract. */
export function ReportPreview({ variant, state: requested, full = false }: { variant: string; state?: string; full?: boolean }) {
  const ready = React.useSyncExternalStore(subscribeReady, () => true, () => false);
  const sample = variant !== "fixture";
  const demo = demoCaseByKey(variant) ?? DEMO_CASES[0];
  const state: State = requested && requested in states ? requested as State : "normal";
  const [theme, setTheme] = React.useState("system");
  const [fixtureGeometry, setFixtureGeometry] = React.useState<FaceGeometry | null>(null);
  React.useEffect(() => {
    if (sample) return;
    let live = true;
    backendFor("ap_sample_0001").geometry("ap_sample_0001").then(g => { if (live) setFixtureGeometry(g); }).catch(() => {});
    return () => { live = false; };
  }, [sample]);
  const data = React.useMemo(() => {
    const r = structuredClone(sampleReportResponse(sample ? demo.id : "female"));
    // The actionable fixture exercises existing persistence, without importing its illustrated success previews.
    r.partial.previews = [];
    if (state === "missing-side" && r.media.photos) r.media.photos.profile90 = null;
    if (state === "broken-preview" && !sample) r.partial.previews = [{ target_id: "safe", kind: "hair", status: "succeeded", before_url: r.media.front, after_url: "/sample/missing-preview.jpg", image_model: "fixture-illustration", error: null, ai_label: "虚构护照示意图" }];
    if (state === "expired") r.media.expired = true;
    if (state === "expire-soon") r.media.expires_at = new Date(Date.now() + 5000).toISOString();
    if ((state === "limited" || state === "unavailable") && r.passport?.aesthetic_score) {
      r.passport.aesthetic_score.status = state; r.passport.aesthetic_score.overall_score = null;
    }
    if (state === "needs-photo") {
      const m = r.passport?.measurement_profile?.metrics.find(m => m.id === "M017");
      if (m) { m.availability = "needs_photo"; m.value = null; m.missing_reason = "upper_third_occluded"; }
    }
    if (!sample && (state === "pending" || state === "failed")) r.partial.previews = [{ target_id: "safe", kind: "hair", status: state, before_url: r.media.front, after_url: null, image_model: null, error: null, ai_label: "AI 试看" }];
    return r;
  }, [sample, demo, state]);
  const geometry = state === "no-geometry" ? null : sample ? demo.geometry : fixtureGeometry;
  const change = (v: string, st: string) => { window.location.href = `/dev/report-${full ? "r2" : "r1"}?v=${encodeURIComponent(v)}&state=${encodeURIComponent(st)}`; };
  if (!ready) return <p role="status">准备开发评审…</p>;
  return <div className={s.host} data-report-slice-host data-slice-theme={theme}>
    <details className={s.review}><summary>{c.review}{state !== "normal" ? ` · ${states[state]}` : ""}</summary><div><p>{c.reviewOnly}</p>
      <label>{c.person}<select value={sample ? demo.key : "fixture"} onChange={e => change(e.target.value, state)}>{DEMO_CASES.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}<option value="fixture">{c.fixture}</option></select></label>
      <label>{c.state}<select value={state} onChange={e => change(variant, e.target.value)}>{Object.entries(states).map(([key, label]) => <option key={key} value={key} disabled={sample && ["pending", "failed", "broken-preview"].includes(key)}>{label}</option>)}</select></label>
      <label>{c.theme}<select value={theme} onChange={e => setTheme(e.target.value)}><option value="system">{c.systemTheme}</option><option value="light">{c.lightTheme}</option><option value="dark">{c.darkTheme}</option></select></label>
      {full && <label>剪贴板粘贴核对<textarea aria-label="剪贴板粘贴核对" placeholder="复制当前话术后，在此粘贴核对" /></label>}
    </div></details>
    {full ? <StaticPassportProvider value={{ data }}><FullReportContent key={`${variant}:${state}`} data={data} geometry={geometry} sample={sample} /></StaticPassportProvider> : <ReportSlice key={`${variant}:${state}`} data={data} geometry={geometry} sample={sample} />}
  </div>;
}
