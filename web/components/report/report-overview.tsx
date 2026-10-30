"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowDown, ArrowUpRight } from "lucide-react";
import { aestheticScore, learnedScore, rankedRecs, referenceRank } from "@/lib/adapters";
import { PredictedScoreHero } from "@/components/profile/score-hero";
import type { PassportResponse } from "@/lib/api";
import type { FaceGeometry } from "@/lib/tint";
import type { MeasureView } from "@/components/face/measure-model";
import { MissingPhoto } from "@/components/report-slice/measurements";
import { photoExpired } from "@/components/report-slice/model";
import s from "./full-report.module.css";

/** Shared public/personal cover; every personal finding comes from this passport. */
export function ReportOverview({ data, mv, sample, gone, geometry, exportAction }: { data: PassportResponse; mv: MeasureView | null; sample: boolean; gone: boolean; geometry: FaceGeometry | null; exportAction?: React.ReactNode }) {
  const p = data.passport!;
  const score = aestheticScore(p), rank = referenceRank(p);
  const predicted = learnedScore(p);
  const highlight = p.derived.measurement_insights?.items.find(i => i.highlight);
  const first = rankedRecs(p)[0];
  const [failed, setFailed] = React.useState<string | null>(null);
  return <>
    <div className={s.summary}>
      <figure className={s.summaryPortrait}>
        {!gone && data.media.front && failed !== data.media.front ? <div className={s.portraitFrame}>
          <img className={s.portrait} src={data.media.front} alt="正脸分析原图" onError={() => setFailed(data.media.front)} />
          <span className={s.portraitMark}>BeautyAI<span>形象护照</span></span>
        </div> : <MissingPhoto expired={photoExpired(data.media)} />}
      </figure>
      <div className={s.summaryContent}>
        <p className={s.caption}>你的形象护照</p>
        <h1 id="overview-title" tabIndex={-1} className={s.direction}>让特点，<br />成为风格。</h1>
        <p className={s.lead}>{p.analysis.profile_summary.one_liner}</p>
        <p className={s.bestDirection}>{p.analysis.profile_summary.best_direction}</p>
        <div className={s.coverActions}><a href="#improvements">找到适合的改变 <ArrowDown size={16} /></a>{sample ? <Link href="/start">建立我的护照 <ArrowUpRight size={16} /></Link> : <Link href={`/p/${data.id}/studio`}>在照片上试试 <ArrowUpRight size={16} /></Link>}</div>
        {predicted && <PredictedScoreHero view={predicted} />}
        {!predicted && <div className={s.scoreSummary}>
          <div className={s.scoreHeadline}><span>{score?.name ?? "AI 面部美学参考分"}</span><strong data-testid={score?.state === "scored" && score.score !== null ? "score-value" : undefined}>{score?.state === "scored" && score.score !== null ? p.aesthetic_score!.overall_score : score?.state === "limited" ? "部分可用" : "暂不可用"}</strong>{score?.state === "scored" && <small>/ 100</small>}</div>
          <p data-testid="rank-state" className={s.rankLine}>{rank?.state === "ranked" ? <>{rank.label} <span>{rank.note}</span></> : score?.state === "scored" ? "参考人群位置校准中" : "当前照片暂无参考位置"}</p>
          <div className={s.harmonyChart} aria-label="面部几何参考"><span className={s.caption}>几何协调度参考</span>{score?.components.map(c => <div key={c.key}><span>{c.name}</span>{c.score === null ? <small>未测得</small> : <meter min={0} max={100} value={c.score} aria-label={`${c.name} ${c.score}`} />}<small>{c.score ?? "—"}</small></div>)}</div>
        </div>}
        {exportAction}

      </div>
    </div>
    <div className={s.glance} data-testid="report-glance">
      <div><span>值得保留</span><h2>{highlight?.label_zh ?? "看见自己的特点"}</h2><p>{highlight?.seen_zh ?? p.analysis.profile_summary.one_liner}</p><a href="#findings">读懂面部特点 <ArrowUpRight size={14} /></a></div>
      <div><span>风格方向</span><h2>{p.analysis.profile_summary.best_direction}</h2><a href="#options">探索发型与配色 <ArrowUpRight size={14} /></a></div>
      <div><span>从这里开始</span><h2>{first?.action ?? "找到喜欢的表达"}</h2><p>{first?.time}</p><a href={first ? `#rec-${first.id}` : "#plan"}>查看具体做法 <ArrowUpRight size={14} /></a></div>
    </div>
  </>;
}
