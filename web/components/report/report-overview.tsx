"use client";

import * as React from "react";
import { aestheticScore, rankedRecs, referenceRank } from "@/lib/adapters";
import type { PassportResponse } from "@/lib/api";
import type { FaceGeometry } from "@/lib/tint";
import type { MeasureView } from "@/components/face/measure-model";
import { MissingPhoto } from "@/components/report-slice/measurements";
import { photoExpired } from "@/components/report-slice/model";
import s from "./full-report.module.css";

/** R2 summary, using exactly the same adapters as the merged interactive slice. */
export function ReportOverview({ data, mv, sample, gone, geometry }: { data: PassportResponse; mv: MeasureView | null; sample: boolean; gone: boolean; geometry: FaceGeometry | null }) {
  const p = data.passport!;
  const score = aestheticScore(p), rank = referenceRank(p);
  const highlight = p.derived.measurement_insights?.items.find(i => i.highlight);
  const [failed, setFailed] = React.useState<string | null>(null);
  const desktop = React.useSyncExternalStore(React.useCallback((update) => {
    const media = window.matchMedia?.("(min-width: 1100px)"); media?.addEventListener("change", update);
    return () => media?.removeEventListener("change", update);
  }, []), () => window.matchMedia?.("(min-width: 1100px)").matches ?? false, () => false);
  const direction = p.analysis.profile_summary.best_direction;
  const clauses = direction.split(/[、，]/).filter(Boolean);
  const compact = clauses.length > 2 && direction.endsWith("。");
  return <div className={s.summary}>
    <div>
      <p className={s.caption}>01　总体评估</p>
      <h1 id="overview-title" tabIndex={-1} className={s.direction}>{compact ? <>{clauses[0]}、{clauses[1]}，<span>{clauses.at(-1)}</span></> : direction}</h1>
      <p className={s.lead}>{p.analysis.profile_summary.one_liner}</p>
      {compact && <p className={s.caption}>完整方向 · {direction}</p>}
      <dl className={s.facts} data-testid="report-glance">
        <div><dt>{score?.name ?? "AI 面部美学参考分"}</dt><dd>{score?.state === "scored" && score.score !== null ? <><strong data-testid="score-value" className={s.score}>{p.aesthetic_score!.overall_score}</strong><small> / 100</small></> : <strong>{score?.state === "limited" ? "部分测量可用" : "暂不能给出参考分"}</strong>}<p>{score?.tier} · 仅为面部几何协调度参考，不代表整体外貌评价</p><a href="#methods">怎么算的</a></dd></div>
        <div data-testid="rank-state"><dt>{rank?.title ?? "参考扫描人群中的位置"}</dt><dd><strong>{rank?.state === "ranked" ? rank.label : p.reference_percentiles?.rank.reason === "score_scale_unverified" ? "校准中" : "暂不可用"}</strong><p>{rank?.reason ?? rank?.note}</p></dd></div>
        <div><dt>最突出的特点</dt><dd><strong>{highlight?.label_zh ?? "查看具体测量"}</strong><p>{highlight?.seen_zh}</p><a href="#area-proportions">看测量 ↓</a></dd></div>
      </dl>
      <div className={s.priorities}><p>最值得先做的事 <small>按最终排序取前 3</small></p><ol>{rankedRecs(p).slice(0, 3).map((r, i) => <li key={r.id}><span>{String(i + 1).padStart(2, "0")}</span><small>{r.categoryZh}</small><a href={`#rec-${r.id}`}>{r.action}</a><small>{r.time}</small><a href={`#rec-${r.id}`} aria-label={`查看建议 ${i + 1}`}>→</a></li>)}</ol></div>
    </div>
    <aside className={s.summaryAside}>
      <figure><div className={s.photoLabel}>正脸 · 测量原图 <span>{sample ? "合成示例" : "分析原图"}</span></div>{!gone && data.media.front && failed !== data.media.front ? <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <div className={s.portraitFrame} style={{ aspectRatio: geometry ? .84 * geometry.width / (.76 * geometry.height) : 3 / 4 }}><img className={s.portrait} src={data.media.front} alt="正脸分析原图" onError={() => setFailed(data.media.front)} style={geometry ? { width: `${100 / .84}%`, height: `${100 / .76}%`, left: `${-.08 / .84 * 100}%`, top: `${-.12 / .76 * 100}%` } : undefined} /></div>
      </> : <MissingPhoto expired={photoExpired(data.media)} />}
        <figcaption className={s.caption}>{sample ? "虚构人物 · 示例只读" : "原图仅在保存期限内显示"}</figcaption>
      </figure>
      <details key={desktop ? "desktop" : "mobile"} open={desktop || undefined} className={s.scoreDetails}><summary>四项几何构成 · 测量覆盖</summary><ul>{score?.components.map(c => <li key={c.key}><span>{c.name}</span><small>{c.weightPct}%</small><meter min={0} max={100} value={c.score ?? 0} aria-label={`${c.name} ${c.score ?? "未测得"}`} /><span>{p.aesthetic_score?.components.find(x => x.key === c.key)?.score?.toFixed(1) ?? "—"}</span></li>)}</ul>
        {score?.strengths.map(text => <p key={text} className={s.caption}>{text}</p>)}
        <p className={s.caption}>测量覆盖 {mv ? `${mv.totalMeasured} / ${mv.totalDefined}` : "不可用"} · {sample ? "示例" : "当前护照"}</p>
      </details>
    </aside>
  </div>;
}
