"use client";
import * as React from "react";
import Link from "next/link";
import { aestheticScore, rankedRecs, referenceRank } from "@/lib/adapters";
import type { PassportResponse } from "@/lib/api";
import { reportSlice as c } from "@/lib/copy/report-slice";
import type { FaceGeometry } from "@/lib/tint";
import { HairSection } from "./hair-section";
import { Measurements, MissingPhoto } from "./measurements";
import { photoExpired, usePhotosGone } from "./model";
import s from "./report-slice.module.css";

export function ReportSlice({ data, geometry, sample }: { data: PassportResponse; geometry: FaceGeometry | null; sample: boolean }) {
  const gone = usePhotosGone(data.media);
  const [failedPhoto, setFailedPhoto] = React.useState<string | null>(null);
  const [active, setActive] = React.useState("overview");
  React.useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const update = () => {
      const sections = [...document.querySelectorAll<HTMLElement>("[data-slice-section]")].map(el => ({ id: el.id, top: el.getBoundingClientRect().top })).sort((a, b) => a.top - b.top);
      setActive(sections.filter(el => el.top <= 160).at(-1)?.id ?? sections[0]?.id ?? "overview");
    };
    const observer = new IntersectionObserver(update, { rootMargin: "-100px 0px -50% 0px", threshold: [0, 0.1, 0.5, 1] });
    document.querySelectorAll("[data-slice-section]").forEach(el => observer.observe(el));
    update();
    return () => observer.disconnect();
  }, [data.id]);
  const p = data.passport;
  if (!p) return <p role="status">{c.noPassport}</p>;
  const score = aestheticScore(p);
  const rank = referenceRank(p);
  const recs = rankedRecs(p).slice(0, 3);
  const highlight = p.derived.measurement_insights?.items.find(i => i.highlight);
  const direction = p.analysis.profile_summary.best_direction;
  const clauses = direction.split(/[、，]/).filter(Boolean);
  const compactDirection = clauses.length > 2 && direction.endsWith("。");
  const fullHref = sample ? `/report/sample?v=${data.id.endsWith("p002") ? "p002" : "p001"}` : `/p/${data.id}/report`;
  return <article className={s.root} aria-label={c.title} data-testid="report-slice" data-sample={sample}>
    <header className={s.topbar}><Link href="/" className={s.brand}>BeautyAI <span>{c.title}</span></Link><p>{sample ? c.sample : c.fixture}</p><Link href="/start" className={s.outlineButton}>{c.start}</Link></header>
    <div className={s.frame}>
      <aside className={s.rail}><nav aria-label="报告目录">{c.nav.map(([id, title], i) => <a key={id} href={`#${id}`} aria-current={active === id ? "location" : undefined} onClick={() => setActive(id)}><span>{String(i + 1).padStart(2, "0")}</span>{title}</a>)}</nav><p className={s.caption}>{sample ? c.sample : c.fixture}</p></aside>
      <div className={s.sections}>
        <section id="overview" data-slice-section className={`${s.section} ${s.overview}`} aria-labelledby="overview-title">
          <div className={s.summaryText}>
            <p className={s.kicker}>{c.overview}</p><h1 id="overview-title">{compactDirection ? <>{clauses[0]}，<span>{clauses.at(-1)}</span></> : direction}</h1><p className={s.lead}>{p.analysis.profile_summary.one_liner}</p>
            <div className={s.facts}>
              <div><p className={s.caption}>{score?.name ?? "AI 面部美学参考分"}</p>{score?.state === "scored" && score.score !== null ? <strong className={s.number} data-testid="score-value">{p.aesthetic_score!.overall_score}<small> / 100</small></strong> : <strong>{score?.state === "limited" ? c.scoreLimited : c.scoreMissing}</strong>}<p className={s.caption}>{c.scoreBoundary}</p><a href="#methods" className={s.textLink} onClick={() => { const el = document.getElementById("methods"); if (el instanceof HTMLDetailsElement) el.open = true; }}>{c.scoreAbout}</a></div>
              <div data-testid="rank-state"><p className={s.caption}>{rank?.title ?? c.rank}</p><strong>{rank?.state === "ranked" ? rank.label : p.reference_percentiles?.rank.reason === "score_scale_unverified" ? c.rankCalibrating : c.rankMissing}</strong><p className={s.caption}>{rank?.reason ?? rank?.note}</p></div>
              <div><p className={s.caption}>{c.highlight}</p><strong>{highlight?.label_zh ?? c.noHighlight}</strong><a href="#structure" className={s.textLink}>{c.measureLink}</a></div>
            </div>
            <div className={s.priorities}><h2>{c.priorities}</h2><p className={s.caption}>{c.generic}</p><ol>{recs.map((r, i) => <li key={r.id}><span className={s.number}>{String(i + 1).padStart(2, "0")}</span><span className={s.caption}>{r.categoryZh}</span><a href={r.page === "hair" ? "#advice" : `${fullHref}#improvements`}>{r.action}</a><span className={s.caption}>{r.time}</span></li>)}</ol></div>
          </div>
          <figure className={s.summaryPhoto}>{!gone && data.media.front && failedPhoto !== data.media.front ? <>
            {/* Private photos keep their exact source; no image optimizer or cache. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={data.media.front} alt={c.generalPhoto} onError={() => setFailedPhoto(data.media.front)} />
            <figcaption className={s.caption}>{c.photo} · {sample ? c.sample : c.fixture}</figcaption>
          </> : <MissingPhoto expired={photoExpired(data.media)} />}
            {score?.strengths.length ? <ul className={s.basis}>{score.strengths.map((text, i) => <li key={i}>{text}</li>)}</ul> : null}
          </figure>
        </section>
        <Measurements key={`measure:${data.id}`} p={p} data={data} geometry={gone ? null : geometry} gone={gone} sample={sample} fullHref={fullHref} />
        <HairSection key={`hair:${data.id}`} p={p} data={data} gone={gone} sample={sample} />
        <section className={`${s.section} ${s.methods}`}>
          <details id="methods" className={s.details}><summary>{c.methods}</summary><p>{score?.scaleNote ?? c.scoreMissing}</p><ul>{score?.components.map(component => <li key={component.key}>{component.name} · {component.weightPct}% · {component.detail}</li>)}</ul><p>{rank?.note}</p><h3>{c.sourceDirection}</h3><p>{direction}</p></details>
          <p className={s.caption}>{p.analysis.limitations.join(" ")}</p><Link href={fullHref} className={s.textLink}>{c.fullReport}</Link>
        </section>
      </div>
    </div>
  </article>;
}
