"use client";

import * as React from "react";
import Link from "next/link";
import { HoldButton, useHold } from "@/components/ds";
import { arcPath, BASIS_ZH, CONFIDENCE_ZH, metricRole, VIEW_ZH } from "@/components/face/measure-model";
import { RangeBar } from "@/components/face/workbench";
import { MissingPhoto } from "@/components/report-slice/measurements";
import { photoExpired } from "@/components/report-slice/model";
import { referenceRatios } from "@/lib/adapters";
import type { PassportResponse } from "@/lib/api";
import type { FaceGeometry } from "@/lib/tint";
import { regionCrop, type RegionView } from "./report-model";
import s from "./full-report.module.css";

export function RegionMeasurements({ r, data, geometry, gone, sample }: { r: RegionView; data: PassportResponse; geometry: FaceGeometry | null; gone: boolean; sample: boolean }) {
  const [selected, setSelected] = React.useState(r.rows[0]?.id);
  const [failed, setFailed] = React.useState<string | null>(null);
  const row = [...r.rows, ...r.additionalRows].find(m => m.id === selected) ?? r.rows[0];
  const role = row ? metricRole(row.metric) : "front";
  const src = gone ? null : role === "front" ? data.media.front : data.media.photos?.[role] ?? null;
  const crop = row && src && failed !== src ? regionCrop([row.metric], geometry) : null;
  const hold = useHold();
  // Map only equal, registered measurement definitions; all other rails stay explicitly unavailable.
  const railId = ({ M001: "face_length_width", M018: "midface_length", M019: "lower_face_length" } as Record<string, string>)[row?.id ?? ""];
  const rawRail = data.passport?.reference_percentiles?.ratios.rails.find(x => x.id === railId);
  const rail = rawRail?.definition_verified ? referenceRatios(data.passport!)?.rails.find(x => x.id === railId) : null;
  return <div className={s.regionGrid}>
    <figure className={s.regionPhoto}>
      {src && failed !== src ? <>
        <div className={s.crop} data-testid="region-figure" data-photo-role={role} style={{ aspectRatio: crop ? ((crop.box[2] - crop.box[0]) * crop.width) / ((crop.box[3] - crop.box[1]) * crop.height) : "1" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={`${VIEW_ZH[role]} · ${r.title}测量原图`} onError={() => setFailed(src)} style={crop ? { width: `${100 / (crop.box[2] - crop.box[0])}%`, height: `${100 / (crop.box[3] - crop.box[1])}%`, left: `${-crop.box[0] / (crop.box[2] - crop.box[0]) * 100}%`, top: `${-crop.box[1] / (crop.box[3] - crop.box[1]) * 100}%` } : undefined} />
          {crop && !hold.holding && <svg data-measure-overlay={row?.name} viewBox={`${crop.box[0] * crop.width} ${crop.box[1] * crop.height} ${(crop.box[2] - crop.box[0]) * crop.width} ${(crop.box[3] - crop.box[1]) * crop.height}`} aria-hidden>
            {crop.overlays.flatMap((o, k) => <g key={k}>
              {o.segments.map((line, i) => <line key={i} x1={line.a[0] * crop.width} y1={line.a[1] * crop.height} x2={line.b[0] * crop.width} y2={line.b[1] * crop.height} stroke={line.role === "measure" ? "var(--ap-amber)" : "white"} strokeWidth={2} strokeDasharray={line.role === "measure" ? undefined : "5 4"} vectorEffect="non-scaling-stroke" />)}
              {o.arcs.map((a, i) => <path key={i} d={arcPath(a, crop.width, crop.height)} fill="none" stroke="var(--ap-amber)" strokeWidth={2} vectorEffect="non-scaling-stroke" />)}
              {o.dots.map(([x, y], i) => <circle key={i} cx={x * crop.width} cy={y * crop.height} r={crop.width / 150} fill="var(--ap-amber)" />)}
            </g>)}
          </svg>}
        </div>
        <figcaption className={s.caption}>{VIEW_ZH[role]} · {crop ? `正在显示：${row?.name}` : "本项没有可用的测量线，保留测量数字"}</figcaption>
        {crop && <HoldButton {...hold} />}
      </> : <MissingPhoto expired={photoExpired(data.media)} recoveryHref={!sample && !photoExpired(data.media) && role !== "front" ? `/p/${data.id}/more` : "/start"} recoveryLabel={!sample && !photoExpired(data.media) && role !== "front" ? `补充${VIEW_ZH[role]}照片` : "重新上传正脸"} />}
    </figure>
    <div>
      <ul className={s.metricRows} data-testid={`region-rows-${r.key}`}>{r.rows.map(m => <li key={m.id} data-metric-row={m.id}>
        <button type="button" aria-pressed={row?.id === m.id} onClick={() => setSelected(m.id)}><span><small>{m.id}</small>{m.name}</span><b data-testid="metric-value">{m.value}</b></button>
      </li>)}</ul>
      {r.additionalRows.length > 0 && <details><summary>其余 {r.additionalRows.length} 项测量（含已测视角）</summary><ul className={s.metricRows}>{r.additionalRows.map(m => <li key={m.id} data-metric-row={m.id}><button type="button" aria-pressed={row?.id === m.id} onClick={() => setSelected(m.id)}><span><small>{m.id} · {VIEW_ZH[metricRole(m.metric)]}</small>{m.name}</span><b data-testid="metric-value">{m.value}</b></button></li>)}</ul></details>}
      {row && <div className={s.reading} aria-live="polite" data-testid={`region-reading-${r.key}`}>
        <h4>{row.name} <strong>{row.value}</strong></h4>
        <p>{row.definition} · {row.confidence && CONFIDENCE_ZH[row.confidence]}</p>
        {row.assessment && <><RangeBar a={row.assessment} m={row.metric} /><p>{row.assessment.label_zh} · {BASIS_ZH[row.assessment.basis]}</p></>}
        <p>{rawRail && !rawRail.definition_verified ? "此项定义尚未验证，暂无可比对照。" : rail?.text ?? "此项暂无可比对照。"}</p>
      </div>}
      <p className={s.caption}>{r.more > 0 && `另有 ${r.more} 项；`}{r.locked > 0 && <span data-testid={`region-locked-${r.key}`}>{r.locked} 项详细测量未开放；</span>}{r.missing.map(m => <span key={m.reason}>未测 {m.count} 项：{m.reason}；</span>)}</p>
      {sample ? <a href="#methods">查看测量方法与局限</a> : <Link href={`/p/${data.id}/face`}>在测量台查看全部指标 →</Link>}
      {r.missing.length > 0 && !sample && <p><Link href={`/p/${data.id}/more`}>补充视角或重新分析 →</Link></p>}
    </div>
  </div>;
}
