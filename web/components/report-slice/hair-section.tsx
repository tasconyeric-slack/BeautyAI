"use client";

import * as React from "react";
import Link from "next/link";
import { RadioGroup } from "radix-ui";
import { CompareView } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { hairOptions, rankedRecs, stylistBrief, type Tier } from "@/lib/adapters";
import type { Passport, PassportResponse } from "@/lib/api";
import { reportSlice as c } from "@/lib/copy/report-slice";
import { useChoices } from "@/lib/state/choices";
import { MissingPhoto } from "./measurements";
import { photoExpired } from "./model";
import { previewNote } from "@/components/report/report-model";
import s from "./report-slice.module.css";

/** Photo errors do not turn a broken or missing generated image into a successful comparison. */
function Preview({ data, sample, tier, gone }: { data: PassportResponse; sample: boolean; tier: Tier; gone: boolean }) {
  const pv = sample ? null : data.partial.previews.find(p => p.kind === "hair" && p.target_id === tier);
  const [failed, setFailed] = React.useState(false);
  const [originalFailed, setOriginalFailed] = React.useState(false);
  if (gone) return <div data-testid="preview-state"><MissingPhoto expired={photoExpired(data.media)} /></div>;
  const pair = pv?.status === "succeeded" && pv.before_url && pv.after_url && !failed;
  const text = failed ? c.previewUnavailable : sample ? c.noPreview : pv?.status === "pending" ? c.previewPending
    : pv && ["failed", "fallback", "skipped"].includes(pv.status) ? c.previewFailed : c.previewMissing;
  return <div className={s.preview} data-testid="preview-state" onErrorCapture={() => setFailed(true)}>
    {pair ? <CompareView beforeSrc={pv.before_url!} afterSrc={pv.after_url!} label={c.selected} aiLabel={pv.image_model?.startsWith("fixture") ? c.previewIllustration : pv.ai_label} /> : <>{data.media.front && !originalFailed && !failed && <img src={data.media.front} alt="当前方向的原始正脸照片" className="w-full object-cover" onError={() => setOriginalFailed(true)} />}<p role="status">{text}</p></>}
  </div>;
}

/** Only mounted for an actionable passport. Public samples never instantiate the persistence hook. */
function HairActions({ id, tier, recId }: { id: string; tier: Tier; recId: string | null }) {
  const { choices, chooseHair, setPlan } = useChoices(id);
  const saved = choices.hair?.tier === tier && Boolean(recId && choices.plan[recId]?.saved);
  return <div className={s.actions}>
    <Button type="button" variant="outline" className={s.button} aria-pressed={saved} onClick={() => { chooseHair(tier); if (recId) setPlan(recId, { saved: true }); }}>{saved ? c.saved : c.save}</Button>
    <Link href={`/p/${id}/plan`} className={s.textLink}>{c.openPlan}</Link>
    {saved && <p className={s.caption} role="status">{c.savedNote}</p>}
  </div>;
}

export function HairSection({ p, data, gone, sample, embedded = false, selectedTier, onSelect }: { p: Passport; data: PassportResponse; gone: boolean; sample: boolean; embedded?: boolean; selectedTier?: Tier | null; onSelect?: (tier: Tier) => void }) {
  const options = hairOptions(p, data.partial.previews);
  const [selected, setSelected] = React.useState<Tier | null>(null);
  const tier = selectedTier === undefined ? selected : selectedTier;
  const current = options.find(o => o.tier === tier && o.status !== "excluded") ?? options.find(o => o.status !== "excluded");
  const brief = current ? stylistBrief(p, current.tier) : null;
  const rec = rankedRecs(p).find(r => r.page === "hair");
  return <section id={embedded ? "current-hair-choice" : "advice"} data-embedded-hair={embedded || undefined} data-slice-section={!embedded || undefined} className={embedded ? s.advice : `${s.section} ${s.advice}`} aria-label={embedded ? c.selectHair : undefined} aria-labelledby={embedded ? undefined : "advice-title"}>
    {!embedded && <header className={s.sectionHead}><div><p className={s.kicker}>{c.hair}</p><h2 id="advice-title">{c.hairTitle}</h2></div></header>}
    <div className={s.hairGrid}>
      <div>
        <RadioGroup.Root className={s.hairOptions} aria-label={c.selectHair} value={current?.tier ?? ""} onValueChange={value => { setSelected(value as Tier); onSelect?.(value as Tier); }}>
          {options.map(o => <RadioGroup.Item key={o.tier} data-hair={o.tier} data-preview={gone ? "expired" : sample ? "not_yet" : previewNote({ status: o.preview?.status ?? null, imageModel: o.preview?.image_model ?? null, paid: data.entitlement.paid, expired: false })} value={o.tier} disabled={o.status === "excluded"} className={s.hairOption} aria-label={`${o.tierZh} · ${o.name}${o.status === "excluded" ? ` · ${c.excluded}` : ""}`}>
            <span>{o.tierZh}</span><span><strong>{o.name}</strong><small>{o.status === "excluded" ? [c.excluded, ...o.issues].join(" · ") : `${o.minutes} ${c.minutes} · ${o.role}`}</small></span>
            <span className={s.radioMark} aria-hidden><RadioGroup.Indicator /></span>
          </RadioGroup.Item>)}
        </RadioGroup.Root>
        {current && brief ? <div key={current.tier} data-testid="current-hair" className={s.currentHair} aria-live="polite">
          <p className={s.kicker}>{c.selected} · {current.tierZh}</p><h3>{brief.name}</h3>
          {embedded && <CopyButton key={current.tier} text={brief.text} label={c.copy} className={`${s.button} ${s.copyButton}`} />}
          <div className={s.brief}><h4>{c.currentSteps}</h4><ol>{brief.scripts.map((text, i) => <li key={i}>{text}</li>)}</ol><p>{c.avoid}：{current.avoid}</p></div>
          {!embedded && <CopyButton key={current.tier} text={brief.text} label={c.copy} className={`${s.button} ${s.copyButton}`} />}
          {sample ? <p className={s.caption}>{c.readOnly}</p> : <HairActions id={data.id} tier={current.tier} recId={rec?.id ?? null} />}
          <details className={s.details}><summary>{c.params}</summary><dl className={s.params}>{current.params.map(param => <div key={param.label}><dt>{param.label}</dt><dd>{param.value}</dd></div>)}</dl>
            <p>{c.upkeep}：{current.minutes} {c.minutes} · {current.trimWeeks} {c.trim}</p>
            <p>{current.maintenanceNote}</p>{current.requires.length ? <p>{c.requires}：{current.requires.join("、")}</p> : null}
          </details>
        </div> : <p>{c.noHair}</p>}
      </div>
      <div className={s.hairAside}>
        {current && <Preview key={`${current.tier}:${data.media.front}`} data={data} sample={sample} tier={current.tier} gone={gone} />}
        {!sample && current && !gone && <Link className={s.textLink} href={`/p/${data.id}/studio?hair=${current.tier}`}>{c.openStudio}</Link>}
        {rec && <details className={s.details}><summary>{c.genericDetails}</summary><p className={s.warning}>{c.conflict}</p><h3>{c.generic}</h3><p>{rec.action}</p><p>{rec.why}</p><ul>{rec.evidence.map((text, i) => <li key={i}>{text}</li>)}</ul></details>}
      </div>
    </div>
  </section>;
}
