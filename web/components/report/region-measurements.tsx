"use client";

import * as React from "react";
import Link from "next/link";
import { HoldButton, useHold } from "@/components/ds";
import { arcPath, metricRole, VIEW_ZH } from "@/components/face/measure-model";
import { MissingPhoto } from "@/components/report-slice/measurements";
import { photoExpired } from "@/components/report-slice/model";
import type { PassportResponse } from "@/lib/api";
import type { FaceGeometry } from "@/lib/tint";
import { regionPhoto, type RegionView } from "./report-model";
import s from "./full-report.module.css";

export function RegionMeasurements({ r, data, geometry, gone, sample }: { r: RegionView; data: PassportResponse; geometry: FaceGeometry | null; gone: boolean; sample: boolean }) {
  const [selected, setSelected] = React.useState(r.rows[0]?.id);
  const [failed, setFailed] = React.useState<string | null>(null);
  const row = [...r.rows, ...r.additionalRows].find(m => m.id === selected) ?? r.rows[0];
  const role = row ? metricRole(row.metric) : "front";
  const src = gone ? null : role === "front" ? data.media.front : data.media.photos?.[role] ?? null;
  const crop = row && src && failed !== src ? regionPhoto([row.metric], geometry) : null;
  const hold = useHold();
  return <div className={s.regionGrid}>
    <figure className={s.regionPhoto}>
      {src && failed !== src ? <>
        <div className={s.measurementCanvas} data-testid="region-figure" data-photo-role={role} style={{ aspectRatio: "4 / 5" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={`${VIEW_ZH[role]} · ${r.title}测量原图`} onError={() => setFailed(src)} />
          {crop && !hold.holding && <svg key={row?.id} data-measure-overlay={row?.name} viewBox={`0 0 ${crop.width} ${crop.height}`} preserveAspectRatio="xMidYMid meet" aria-hidden>
            {crop.overlays.flatMap((o, k) => <g key={k}>
              {o.segments.map((line, i) => <line key={i} x1={line.a[0] * crop.width} y1={line.a[1] * crop.height} x2={line.b[0] * crop.width} y2={line.b[1] * crop.height} stroke={line.role === "measure" ? "#f5d99c" : "white"} strokeWidth={2} strokeDasharray={line.role === "measure" ? undefined : "5 4"} vectorEffect="non-scaling-stroke" />)}
              {o.arcs.map((a, i) => <path key={i} d={arcPath(a, crop.width, crop.height)} fill="none" stroke="#f5d99c" strokeWidth={2} vectorEffect="non-scaling-stroke" />)}
              {[...o.dots, ...o.segments.filter(line => line.role === "measure").flatMap(line => [line.a, line.b])].map(([x, y], i) => <circle key={i} cx={x * crop.width} cy={y * crop.height} r={crop.width / 150} fill="#f5d99c" stroke="white" strokeWidth={0.8} vectorEffect="non-scaling-stroke" />)}
            </g>)}
          </svg>}
        </div>
        <figcaption className={s.caption}>{row?.name} {row?.value}</figcaption>
        {crop && <HoldButton {...hold} />}
      </> : <MissingPhoto expired={photoExpired(data.media)} recoveryHref={!sample && !photoExpired(data.media) && role !== "front" ? `/p/${data.id}/more` : "/start"} recoveryLabel={!sample && !photoExpired(data.media) && role !== "front" ? `补充${VIEW_ZH[role]}照片` : "重新上传正脸"} />}
    </figure>
    <div>
      <ul className={s.metricRows} data-testid={`region-rows-${r.key}`}>{r.rows.map(m => <li key={m.id} data-metric-row={m.id}>
        <button type="button" aria-pressed={row?.id === m.id} onClick={() => setSelected(m.id)}><span>{m.name}</span><b data-testid="metric-value">{m.value}</b></button>
      </li>)}</ul>
      {r.additionalRows.length > 0 && <details><summary>展开 {r.additionalRows.length} 项测量</summary><ul className={s.metricRows}>{r.additionalRows.map(m => <li key={m.id} data-metric-row={m.id}><button type="button" aria-pressed={row?.id === m.id} onClick={() => setSelected(m.id)}><span><small>{VIEW_ZH[metricRole(m.metric)]}</small>{m.name}</span><b data-testid="metric-value">{m.value}</b></button></li>)}</ul></details>}
      <p className={s.caption}>{r.locked > 0 && <span data-testid={`region-locked-${r.key}`}>{r.locked} 项详细测量未开放；</span>}{r.missing.map(m => <span key={m.reason}>未测 {m.count} 项：{m.reason}；</span>)}</p>

      {r.missing.length > 0 && !sample && <p><Link href={`/p/${data.id}/more`}>补充视角或重新分析 →</Link></p>}
    </div>
  </div>;
}
