"use client";

import * as React from "react";
import Link from "next/link";
import { display, measureView, metricOverlay, metricRole, missingText } from "@/components/face/measure-model";
import { MeasureStage } from "@/components/face/measure-stage";
import { referenceRatios } from "@/lib/adapters";
import type { Passport, PassportResponse } from "@/lib/api";
import { reportSlice as c } from "@/lib/copy/report-slice";
import type { FaceGeometry } from "@/lib/tint";
import { photoExpired } from "./model";
import s from "./report-slice.module.css";

export function MissingPhoto({ expired }: { expired: boolean }) {
  return <div className={s.missing} role="note">
    <h3>{expired ? c.expired : c.noPhoto}</h3><p>{expired ? c.expiredNote : c.noPhotoNote}</p>
    <Link href="/start" className={s.textLink}>{c.reupload}</Link>
  </div>;
}

export function Measurements({ p, data, geometry, gone, sample, fullHref }: { p: Passport; data: PassportResponse; geometry: FaceGeometry | null; gone: boolean; sample: boolean; fullHref: string }) {
  const mv = React.useMemo(() => measureView(p, data.id, data.entitlement.locked), [p, data.id, data.entitlement.locked]);
  const metrics = ["M001", "M017", "M025"].flatMap(id => mv?.byId[id] ? [mv.byId[id]] : []);
  const [selected, setSelected] = React.useState("M001");
  const [failedSource, setFailedSource] = React.useState<string | null>(null);
  const m = metrics.find(m => m.id === selected) ?? metrics[0];
  const insight = m && mv?.insights[m.id];
  const role = m ? metricRole(m) : "front";
  const src = gone ? null : role === "front" ? data.media.front : data.media.photos?.[role] ?? null;
  const overlay = m && !gone ? metricOverlay(m, geometry) : null;
  // Only compare the exact metric whose registered definition is verified. M017/M025 have no matching rail.
  const railId = m?.id === "M001" ? "face_length_width" : null;
  const rawRail = p.reference_percentiles?.ratios.rails.find(r => r.id === railId);
  const rail = rawRail?.definition_verified ? referenceRatios(p)?.rails.find(r => r.id === railId) : null;
  const measured = m && !m.locked && m.availability === "measured" && m.value !== null;
  return <section id="structure" data-slice-section className={`${s.section} ${s.structure}`} aria-labelledby="structure-title">
    <header className={s.sectionHead}><div><p className={s.kicker}>{c.structure}</p><h2 id="structure-title">{c.structureTitle}</h2></div><p>{c.structureAbout}</p></header>
    {!m ? <p>{c.noProfile}</p> : <div className={s.measureGrid}>
      <div className={s.measureStage} onErrorCapture={event => { if (event.target instanceof HTMLImageElement) setFailedSource(src); }}>
        {src && failedSource !== src ? <MeasureStage key={`${role}:${src}`} src={src} overlay={overlay} title={m.name_zh} tag={measured ? display(m) : null} expired={false} /> : <MissingPhoto expired={photoExpired(data.media)} />}
        <p className={s.caption}>{c.photo}</p>
      </div>
      <div>
        <div className={s.metricChoices} aria-label={c.selectMetric}>
          {metrics.map(metric => <button key={metric.id} type="button" aria-pressed={metric.id === m.id} onClick={() => setSelected(metric.id)}>
            <span>{metric.id}</span><span>{metric.name_zh}</span><b>{!metric.locked && metric.availability === "measured" ? display(metric) : "—"}</b>
          </button>)}
        </div>
        <div className={s.measureReading} data-testid="selected-measurement" aria-live="polite">
          <h3>{m.name_zh}<strong className={s.number}>{measured ? display(m) : "—"}</strong></h3>
          {!measured ? <div><p>{m.locked ? c.locked : missingText(mv!.profile, m) ?? c.missingMeasurement}</p>{!m.locked && m.availability === "needs_photo" && <Link href="/start" className={s.textLink}>{c.reupload}</Link>}</div> : <dl className={s.reading}>
            {insight && <><div><dt>{c.seen}</dt><dd>{insight.seen}</dd></div><div><dt>{c.means}</dt><dd>{insight.means}</dd></div></>}
            <div><dt>{c.definition}</dt><dd>{m.definition_zh}</dd></div>
            <div><dt>{c.comparison}</dt><dd>{rawRail && !rawRail.definition_verified ? c.unverified : rail?.text ?? c.noComparison}</dd></div>
            {insight?.advice.length ? <div><dt>{c.advice}</dt><dd>{insight.advice.map((a, i) => <p key={i}><a href={a.href.endsWith("/hair") ? "#advice" : sample ? `${fullHref}#improvements` : a.href} className={s.textLink}>{a.text}</a></p>)}</dd></div> : null}
          </dl>}
        </div>
      </div>
    </div>}
  </section>;
}
