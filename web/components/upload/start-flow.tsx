"use client";

import { ChevronDown, Loader2, ShieldCheck } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { localPhotoKey } from "@/components/reveal/reveal";
import { ApiError, api, backendFor, type ExtraRole, type PhotoMeta, type PhotoRole, type Presentation } from "@/lib/api";
import { consent as consentCopy, onboarding, photos as photoCopy, presentation as presCopy, privacy, topics, upload } from "@/lib/copy/zh";
import { cn } from "@/lib/utils";
import { PhotoSlot, usePhotoSlots } from "./photo-slot";
import { journey } from "@/lib/copy/journey";
import { PhotoGuide } from "./photo-guide";
import s from "@/components/journey/journey.module.css";

type Topic = keyof typeof topics;
const TOPICS = Object.keys(topics) as Topic[];
const PRES: { key: "feminine" | "masculine" | "neutral"; value: Presentation }[] = [
  { key: "feminine", value: "feminine" }, { key: "masculine", value: "masculine" }, { key: "neutral", value: "androgynous" },
];
type Goal = keyof typeof onboarding.goals;
const GOALS_BY_PRES: Record<Presentation, Goal[]> = {
  feminine: ["hair", "makeup", "color_wardrobe", "overall_style", "glasses", "photos"],
  masculine: ["hair", "facial_hair", "color_wardrobe", "overall_style", "glasses", "photos"],
  androgynous: ["hair", "makeup", "color_wardrobe", "overall_style", "glasses", "photos"],
};
export const landTopicKey = (id: string) => `ap_land_topic:${id}`;
const MORE_ROLES: ExtraRole[] = ["smile", "profile45", "hair"];

async function toDataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(typeof r.result === "string" ? r.result : null);
    r.onerror = () => resolve(null);
    r.readAsDataURL(blob);
  });
}

export function StartFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const topic = (TOPICS as string[]).includes(params.get("topic") ?? "") ? (params.get("topic") as Topic) : null;
  const ref = (params.get("ref") ?? "").replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 64) || null;
  const [agreed, setAgreed] = React.useState({ processing: false, age: false });
  const [step, setStep] = React.useState<"consent" | "photo">("consent");
  const [eyewear, setEyewear] = React.useState(false);
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [pres, setPres] = React.useState<Presentation | null>(null);
  const [goals, setGoals] = React.useState<Goal[]>([]);
  const [minutes, setMinutes] = React.useState<number | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const backend = backendFor();
  const onReject = React.useCallback(() => api.track("qc_fail", { topic, ref }), [topic, ref]);
  const { slots, choose, reframe, remove } = usePhotoSlots(backend, onReject);
  const front = slots.front;
  const qc = front?.qc ?? null;
  const checking = Object.values(slots).some((s) => s?.checking);
  const eyewearDetected = Boolean(qc?.issues.includes("eyewear_detected"));
  const restricted = eyewear || eyewearDetected;

  const submit = async () => {
    if (!front || !pres || !qc || qc.status === "reject" || checking || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      // Only what the person actually answered is sent; everything else keeps its default (V2.1 §2).
      const context: Parameters<typeof backend.create>[0]["context"] = { presentation: pres, topic, ref };
      const chosen = goals.filter((g) => GOALS_BY_PRES[pres].includes(g));
      if (chosen.length) context.optimize_focus = chosen;
      if (minutes !== null) context.constraints = { daily_minutes: minutes };
      // Optional photos that failed their own check are not sent: they could never block the front-only path.
      const extra: Partial<Record<ExtraRole, Blob>> = {};
      const photoMeta: PhotoMeta = {};
      for (const [role, st] of Object.entries(slots) as [PhotoRole, NonNullable<typeof front>][]) {
        if (!st) continue;
        if (role !== "front") {
          if (!st.qc || st.qc.status === "reject" || st.error) continue;
          extra[role] = st.blob;
        }
        if (st.capture) photoMeta[role] = { ...(photoMeta[role] ?? {}), capture: st.capture };
      }
      photoMeta.front = { ...(photoMeta.front ?? {}), eyewear: restricted };
      const { id } = await backend.create({ front: front.blob, context, extra, photoMeta });
      const dataUrl = await toDataUrl(front.blob);
      try {
        if (dataUrl) sessionStorage.setItem(localPhotoKey(id), dataUrl);
        if (topic) sessionStorage.setItem(landTopicKey(id), topic);
      } catch {
        /* storage full or blocked: the reveal shows the stage without the photo */
      }
      router.push(`/p/${id}/report`);
    } catch (e) {
      setSubmitError(e instanceof ApiError ? e.body.detail : upload.uploadFailed);
      setSubmitting(false);
    }
  };

  const canUse = qc && qc.status !== "reject";
  return (
    <div data-step={step} className={cn("mx-auto px-4 pb-16 pt-6 sm:px-6", s.flow)}>
      {topic && <p className="mb-2 text-[12px] tracking-[0.14em] text-accent">{topics[topic].title}</p>}
      {step === "consent" ? (
        <section aria-labelledby="consent-title">
          <h1 id="consent-title" className="font-serif text-[24px] font-semibold leading-snug">{consentCopy.title}</h1>
          <div className="mt-5 space-y-3 rounded-[4px] border border-rule bg-paper-raised p-4 text-[14px] leading-7">
            <p><b className="font-medium">用途</b> · {consentCopy.purpose}</p>
            <p><b className="font-medium">保留</b> · {consentCopy.retention}</p>
            <p><b className="font-medium">删除</b> · {consentCopy.deleteInstruction}</p>
            <p className="text-[13px] text-muted">{privacy.noTraining}</p>
          </div>
          <div className="mt-5 space-y-3">
            {([["processing", consentCopy.processingConfirmation], ["age", consentCopy.ageConfirmation]] as const).map(([k, label]) => (
              <label key={k} className="flex cursor-pointer items-center gap-3 rounded-[4px] border border-rule bg-paper-raised px-4 py-3 text-[14px]">
                <input type="checkbox" className="size-4 accent-[var(--ap-primary)]" checked={agreed[k]}
                  onChange={(e) => setAgreed((a) => ({ ...a, [k]: e.target.checked }))} />
                {label}
              </label>
            ))}
            <p className="text-[12px] text-muted">{consentCopy.separateConsentHint}</p>
          </div>
          <Button variant="accent" size="lg" className="mt-6 w-full" disabled={!agreed.processing || !agreed.age} onClick={() => setStep("photo")}>
            <ShieldCheck />{consentCopy.continue}
          </Button>
        </section>
      ) : (
        <section aria-labelledby="photo-title">
          <h1 id="photo-title" className="font-serif text-[22px] font-semibold leading-snug">{photoCopy.heading}</h1>
          <p className="mt-1 text-[13.5px] leading-6 text-ink-soft">{photoCopy.intro}</p>
          <p className="mt-1 text-[13.5px] font-medium text-accent">{photoCopy.frontOnly}</p>
          <PhotoGuide />
          {/* Local files only (album or the system camera through the file picker, D20). Each role is independent. */}
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            <PhotoSlot role="front" state={front} required prominent onChoose={(f) => choose("front", f)}
              onReframe={(f) => reframe("front", f)} onRemove={() => remove("front")}>
              <label className="flex cursor-pointer items-start gap-2 text-[12.5px] leading-5">
                <input type="checkbox" className="mt-0.5 size-4 accent-[var(--ap-primary)]" checked={eyewear}
                  onChange={(e) => setEyewear(e.target.checked)} data-testid="eyewear" />
                <span>{photoCopy.eyewearLabel}{(eyewear || eyewearDetected) && <span className="block text-muted">{photoCopy.eyewearHint}</span>}</span>
              </label>
            </PhotoSlot>
            <PhotoSlot role="profile90" state={slots.profile90} prominent onChoose={(f) => choose("profile90", f)}
              onReframe={(f) => reframe("profile90", f)} onRemove={() => remove("profile90")} />
            <PhotoSlot role="glasses" state={slots.glasses} onChoose={(f) => choose("glasses", f)}
              onReframe={(f) => reframe("glasses", f)} onRemove={() => remove("glasses")} />
          </div>

          <div className="mt-3 rounded-[4px] border border-rule">
            <button type="button" aria-expanded={moreOpen} onClick={() => setMoreOpen((v) => !v)}
              className="flex min-h-12 w-full items-center justify-between gap-2 px-4 text-left text-[14px] font-medium">
              <span>{photoCopy.more}<span className="ml-2 text-[12px] font-normal text-muted">{photoCopy.moreHint}</span></span>
              <ChevronDown className={cn("size-4 shrink-0 transition-transform", moreOpen && "rotate-180")} />
            </button>
            {moreOpen && (
              <div className="grid gap-3 px-3 pb-3 lg:grid-cols-2">
                {MORE_ROLES.map((r) => (
                  <PhotoSlot key={r} role={r} state={slots[r]} onChoose={(f) => choose(r, f)}
                    onReframe={(f) => reframe(r, f)} onRemove={() => remove(r)} />
                ))}
              </div>
            )}
          </div>

          {!front && (
            <ul className="mt-5 space-y-1.5 text-[13px] leading-6 text-ink-soft">
              {upload.tips.map((t) => <li key={t}>· {t}</li>)}
              <li className="text-muted">· {upload.glassesTip}</li>
            </ul>
          )}

          {/* One question: presentation (user-selected, never inferred) */}
          {(canUse || (qc?.status === "reject" && front)) && (
            <fieldset className="mt-6">
              <legend className="font-serif text-[17px] font-semibold">{presCopy.question}</legend>
              <p className="mb-3 text-[12px] text-muted">{presCopy.hint}</p>
              <div className="grid gap-2">
                {PRES.map((p) => (
                  <button key={p.key} type="button" aria-pressed={pres === p.value} onClick={() => setPres(p.value)}
                    className={cn("rounded-[4px] border px-4 py-3 text-left transition-colors",
                      pres === p.value ? "border-accent bg-accent-soft" : "border-rule bg-paper-raised hover:border-ink/40")}>
                    <span className="block text-[15px] font-medium">{presCopy.options[p.key].label}</span>
                    <span className="block text-[12px] text-muted">{presCopy.options[p.key].description}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          {pres && (
            <fieldset className="mt-6 rounded-[4px] border border-rule bg-paper-raised p-4">
              <legend className="px-1 font-serif text-[16px] font-semibold">{onboarding.optionalTitle}</legend>
              <p className="text-[12px] leading-5 text-muted">{onboarding.optionalHint}</p>
              <p className="mt-4 text-[14px] font-medium">{onboarding.goalQuestion}<span className="ml-2 text-[12px] font-normal text-muted">{onboarding.goalHint}</span></p>
              <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={onboarding.goalQuestion}>
                {GOALS_BY_PRES[pres].map((g) => {
                  const on = goals.includes(g);
                  return (
                    <button key={g} type="button" aria-pressed={on}
                      onClick={() => setGoals((cur) => on ? cur.filter((x) => x !== g) : [...cur, g].slice(-2))}
                      className={cn("whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[13px]", on ? "border-accent bg-accent-soft text-accent" : "border-rule-strong bg-paper")}>
                      {onboarding.goals[g]}
                    </button>
                  );
                })}
              </div>
              <p className="mt-4 text-[14px] font-medium">{onboarding.minutesQuestion}</p>
              <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={onboarding.minutesQuestion}>
                {([5, 10, 20] as const).map((m) => (
                  <button key={m} type="button" role="radio" aria-checked={minutes === m} onClick={() => setMinutes(minutes === m ? null : m)}
                    className={cn("whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[13px]", minutes === m ? "border-accent bg-accent-soft text-accent" : "border-rule-strong bg-paper")}>
                    {onboarding.minutes[m]}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          {submitError && <p className="mt-4 text-[13px] text-[#b4442f]">{submitError}</p>}
          {front && qc && (
            <div className="mt-6 flex flex-col gap-2">
              <Button variant="accent" size="lg" className="w-full" disabled={!pres || submitting || checking || qc.status === "reject"} onClick={submit}>
                {submitting ? <Loader2 className="animate-spin" /> : null}
                {qc.status === "reject" ? journey.replaceFront : restricted ? "以受限模式开始" : onboarding.start}
              </Button>
              {!pres && <p className="text-center text-[12px] text-muted">选择一个表达方向后开始</p>}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
