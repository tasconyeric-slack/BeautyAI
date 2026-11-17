"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowDown, ArrowUpRight } from "lucide-react";
import { harmonyRadar, learnedScore, rankedRecs, type HairOptionView } from "@/lib/adapters";
import { PredictedScoreHero } from "@/components/profile/score-hero";
import type { PassportResponse } from "@/lib/api";
import type { FaceGeometry } from "@/lib/tint";
import type { MeasureView } from "@/components/face/measure-model";
import { MissingPhoto } from "@/components/report-slice/measurements";
import { photoExpired } from "@/components/report-slice/model";
import s from "./full-report.module.css";

/** Shared public/personal cover; every personal finding comes from this passport. */
export function ReportOverview({ data, mv, sample, gone, geometry, exportAction, currentHair }: { data: PassportResponse; mv: MeasureView | null; sample: boolean; gone: boolean; geometry: FaceGeometry | null; exportAction?: React.ReactNode; currentHair?: HairOptionView }) {
  const p = data.passport!;
  const predicted = learnedScore(p);
  const harmony = harmonyRadar(p);
  const strength = p.analysis.works[0];
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
        <h1 id="overview-title" tabIndex={-1} className={s.direction}>一份报告，<br />找到你的变美方向。</h1>
        <p className={s.lead}>{p.analysis.profile_summary.one_liner}</p>
        <p className={s.bestDirection}>{p.analysis.profile_summary.best_direction}</p>
        <div className={s.coverActions}><a href="#improvements">找到适合的改变 <ArrowDown size={16} /></a>{sample ? <Link href="/start">建立我的护照 <ArrowUpRight size={16} /></Link> : <Link href={`/p/${data.id}/studio`}>在照片上试试 <ArrowUpRight size={16} /></Link>}</div>
        {predicted && <PredictedScoreHero view={predicted} harmony={harmony} />}
        {!predicted && <div className={s.scoreSummary} data-testid="ridge-unavailable">
          <div className={s.scoreHeadline}><span>颜值参考分</span><strong>暂不可用</strong><small>/ 10</small></div>
          <p data-testid="rank-state" className={s.rankLine}>本次颜值评分与对应的参考排名暂不可用。</p>
        </div>}
        {exportAction}

      </div>
    </div>
    <div className={s.glance} data-testid="report-glance">
      <div><span>你的优势是什么</span><h2>{strength?.text ?? "看见自己的特点"}</h2><a href="#findings">读懂面部特点 <ArrowUpRight size={14} /></a></div>
      <div><span>什么更适合你</span><h2>{p.analysis.profile_summary.best_direction}</h2><a href="#options">探索发型与配色 <ArrowUpRight size={14} /></a></div>
      <div><span>下一步怎么做</span><h2>{first?.page === "hair" && currentHair ? currentHair.name : first?.action ?? "查看行动计划"}</h2><p>{first?.page === "hair" && currentHair ? currentHair.scripts[0] : first?.time}</p><a href={first ? `#rec-${first.id}` : "#plan"}>查看具体做法 <ArrowUpRight size={14} /></a></div>
    </div>
  </>;
}
