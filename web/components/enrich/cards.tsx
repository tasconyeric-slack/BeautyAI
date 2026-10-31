"use client";

import { Briefcase, Coffee, Gem, Heart, ImagePlus, ShieldCheck } from "lucide-react";
import * as React from "react";
import { IllustratedAvatar } from "@/components/cards";
import type { ContextPatch } from "@/lib/api";
import { adjustments, guidance, privacy, style as styleCopy } from "@/lib/copy/zh";
import type { Passport } from "@/lib/passport";
import { preparePhoto } from "@/lib/photo";
import { usePassport } from "@/lib/state/passport-store";
import { cn } from "@/lib/utils";
import { enrichCopy as t } from "./copy";
import { Chip, ChoiceTile, EnrichCard, Field, useCardFlow, type CardStatus } from "./enrich-card";
import { Coins, DensityCrown, FrameGarment, HairStrands, MinutesDial, ProfileGuide } from "./illustrations";
import { STYLE_KEYS, avatarPresentation, impressionLook, styleLook, type ImpressionKey, type StyleKey } from "./looks";

type UC = Passport["user_context"];
export interface EnrichCardSlotProps { n: number; onStatus?: (s: CardStatus) => void }

function useUserContext(): UC | null {
  return usePassport().passport?.user_context ?? null;
}

/* 1 · 侧脸照片（选填）— the only card that sends a photo, so the only one the server re-analyzes. */
export function ProfilePhotoCard({ n, onStatus }: EnrichCardSlotProps) {
  const { data } = usePassport();
  const flow = useCardFlow(onStatus);
  const [photo, setPhoto] = React.useState<{ blob: Blob; url: string | null } | null>(null);
  const [preparing, setPreparing] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const expired = Boolean(data?.media.expired);

  React.useEffect(() => () => { if (photo?.url) URL.revokeObjectURL(photo.url); }, [photo]);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPreparing(true);
    flow.setError(null);
    try {
      setPhoto(await preparePhoto(file));
    } finally {
      setPreparing(false);
    }
  };
  const submit = async () => {
    if (!photo) return;
    await flow.run({}, { profile45: photo.blob });
  };
  React.useEffect(() => {
    // The photo is only needed for the upload; drop the local copy once the server has it.
    if (flow.status === "done") setPhoto(null);
  }, [flow.status]);

  return (
    <EnrichCard id="enrich-profile" n={n} title={t.profile.title} badge={t.profile.badge} why={t.profile.why}
      status={flow.status} pending={flow.pending || preparing} outcome={flow.outcome}
      error={flow.error ? `${flow.error} ${t.profile.qcFailed}` : null}
      canSubmit={Boolean(photo) && !expired} submitLabel={t.profile.submit}
      onSubmit={submit} onSkip={flow.skip} onEdit={flow.edit}>
      <div className="grid grid-cols-[112px_1fr] gap-3">
        <div className="aspect-square overflow-hidden rounded-[4px] bg-stage text-stage-ink">
          {photo?.url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={photo.url} alt="已选择的侧脸照片" className="size-full object-cover" />
            : <ProfileGuide label={t.profile.guide} />}
        </div>
        <ul className="space-y-1.5 text-[12.5px] leading-[1.6] text-ink-soft">
          {t.profile.tips.map((tip) => <li key={tip} className="flex gap-1.5"><span aria-hidden className="text-accent">·</span>{tip}</li>)}
        </ul>
      </div>
      <p className="mt-3 flex items-start gap-1.5 rounded-[4px] bg-amber-soft px-3 py-2 text-[12.5px] leading-[1.6] text-amber">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
        <span>{t.profile.reanalyzeNote} {privacy.facts[0]}</span>
      </p>
      {expired ? (
        <p className="mt-3 text-[13px] text-muted">{t.profile.frontExpired}</p>
      ) : (
        <div className="mt-3">
          <input ref={inputRef} type="file" accept="image/*" className="sr-only" aria-label={t.profile.choose}
            data-testid="profile-input" onChange={onFile} />
          <button type="button" onClick={() => inputRef.current?.click()} disabled={preparing || flow.pending}
            className="inline-flex h-9 items-center gap-2 rounded-full border border-dashed border-rule-strong px-4 text-[13px] text-ink hover:border-ink/50 disabled:opacity-45">
            <ImagePlus className="size-4" />{preparing ? t.profile.preparing : photo ? "换一张" : t.profile.choose}
          </button>
        </div>
      )}
    </EnrichCard>
  );
}

/* 2 · 发质 */
type Texture = NonNullable<UC["hair"]>["texture"];
type Density = NonNullable<UC["hair"]>["density"];
const TEXTURES: Texture[] = ["straight", "wavy", "curly", "coily"];
const DENSITIES: { key: Density; label: string }[] = [
  { key: "fine", label: adjustments.hairDensity.low },
  { key: "medium", label: adjustments.hairDensity.medium },
  { key: "thick", label: adjustments.hairDensity.high },
];

export function HairCard({ n, onStatus }: EnrichCardSlotProps) {
  const uc = useUserContext();
  const flow = useCardFlow(onStatus);
  const [texture, setTexture] = React.useState<Texture>(uc?.hair?.texture ?? "unknown");
  const [density, setDensity] = React.useState<Density>(uc?.hair?.density ?? "unknown");
  const [grow, setGrow] = React.useState<boolean>(uc?.hair?.grow_out_ok ?? true);
  const pres = avatarPresentation(uc?.presentation);
  const submit = () => flow.run({ hair: { texture, density, grow_out_ok: grow } });
  return (
    <EnrichCard id="enrich-hair" n={n} title={t.hair.title} why={t.hair.why} status={flow.status} pending={flow.pending}
      outcome={flow.outcome} error={flow.error} canSubmit onSubmit={submit} onSkip={flow.skip} onEdit={flow.edit}>
      <Field label={t.hair.texture}>
        <div className="grid grid-cols-4 gap-2">
          {TEXTURES.map((k) => (
            <ChoiceTile key={k} on={texture === k} onClick={() => setTexture(texture === k ? "unknown" : k)}
              picture={<HairStrands texture={k} />} label={t.hair.textures[k as keyof typeof t.hair.textures]} />
          ))}
        </div>
      </Field>
      <Field label={t.hair.density}>
        <div className="flex flex-wrap gap-2">
          {DENSITIES.map((d) => (
            <Chip key={d.key} on={density === d.key} onClick={() => setDensity(density === d.key ? "unknown" : d.key)}>
              <span className="w-7 text-current"><DensityCrown level={d.key} /></span>{d.label}
            </Chip>
          ))}
          <Chip on={density === "unknown"} onClick={() => setDensity("unknown")}>{t.hair.unknown}</Chip>
        </div>
      </Field>
      <Field label={t.hair.growOut}>
        <div className="grid grid-cols-2 gap-2">
          {([true, false] as const).map((v) => (
            <ChoiceTile key={String(v)} dark on={grow === v} onClick={() => setGrow(v)}
              label={v ? adjustments.growOut.yes : adjustments.growOut.no}
              picture={<span className="mx-auto block h-full w-1/2 pt-2">
                <IllustratedAvatar presentation={pres} palette={["#5F6B72", "#E5E3DD", "#9AA4A8"]}
                  hair={{ length: v ? (pres === "masculine" ? "ear" : "shoulder") : (pres === "masculine" ? "crop" : "ear"),
                    fringe: "none", curl: "straight", colorHex: "#3A2C26" }}
                  label={v ? adjustments.growOut.yes : adjustments.growOut.no} />
              </span>} pictureClassName="aspect-[4/3]" />
          ))}
        </div>
      </Field>
    </EnrichCard>
  );
}

/* 3 · 想要的感觉（≤ 3） */
type Impression = UC["desired_impression"][number];
const PAIRS = t.impression.pairs as readonly (readonly [ImpressionKey, ImpressionKey])[];
const PAIRED = new Set<string>(PAIRS.flat());
const MORE = (Object.keys(t.impression.labels) as Impression[]).filter((k) => !PAIRED.has(k));
const MAX_IMPRESSIONS = 3;

export function ImpressionCard({ n, onStatus }: EnrichCardSlotProps) {
  const uc = useUserContext();
  const flow = useCardFlow(onStatus);
  const pres = avatarPresentation(uc?.presentation);
  const [picked, setPicked] = React.useState<Impression[]>(() => (uc?.desired_impression ?? []).slice(0, MAX_IMPRESSIONS));
  const full = picked.length >= MAX_IMPRESSIONS;
  const pickPair = (pair: readonly [ImpressionKey, ImpressionKey], k: ImpressionKey | null) =>
    setPicked((cur) => {
      const rest = cur.filter((x) => !pair.includes(x as ImpressionKey));
      return k ? [...rest, k].slice(-MAX_IMPRESSIONS) : rest;
    });
  const toggle = (k: Impression) =>
    setPicked((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : cur.length >= MAX_IMPRESSIONS ? cur : [...cur, k]));
  const label = (k: Impression) => t.impression.labels[k];
  return (
    <EnrichCard id="enrich-impression" n={n} title={t.impression.title} why={t.impression.why} status={flow.status}
      pending={flow.pending} outcome={flow.outcome} error={flow.error} canSubmit={picked.length > 0}
      onSubmit={() => flow.run({ desired_impression: picked })} onSkip={flow.skip} onEdit={flow.edit}>
      <div className="space-y-3">
        {PAIRS.map((pair) => {
          const chosen = pair.find((k) => picked.includes(k)) ?? null;
          return (
            <div key={pair.join("-")} role="group" aria-label={`${label(pair[0])} 还是 ${label(pair[1])}`}
              className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
              {[pair[0], null, pair[1]].map((k) => k === null ? (
                <button key="either" type="button" aria-pressed={chosen === null} onClick={() => pickPair(pair, null)}
                  className={cn("self-center rounded-full border px-2.5 py-1 text-[12px]",
                    chosen === null ? "border-ink bg-ink text-paper" : "border-rule-strong text-ink-soft")}>
                  {t.impression.either}
                </button>
              ) : (
                <ChoiceTile key={k} dark on={chosen === k} label={label(k)}
                  disabled={full && chosen === null}
                  onClick={() => pickPair(pair, chosen === k ? null : k)}
                  pictureClassName="aspect-[4/3]"
                  picture={<span className="mx-auto block h-full w-3/5 pt-2"><IllustratedAvatar {...impressionLook(k, pres, `${label(k)} 示意插画`)} /></span>} />
              ))}
            </div>
          );
        })}
      </div>
      <Field label={t.impression.more} hint={full ? t.impression.max : undefined}>
        <div className="flex flex-wrap gap-2">
          {MORE.map((k) => (
            <Chip key={k} on={picked.includes(k)} disabled={full && !picked.includes(k)} onClick={() => toggle(k)}>{label(k)}</Chip>
          ))}
        </div>
      </Field>
      {picked.length === 0 && <p className="mt-2 text-[12px] text-muted">{t.impression.needOne}</p>}
    </EnrichCard>
  );
}

/* 4 · 身形（用户自选，不分析照片） */
type Frame = "straight" | "wave" | "natural";
const FRAMES: Frame[] = ["straight", "wave", "natural"];

export function BodyCard({ n, onStatus }: EnrichCardSlotProps) {
  const uc = useUserContext();
  const flow = useCardFlow(onStatus);
  const [frame, setFrame] = React.useState<Frame | null>(uc?.body?.frame ?? null);
  const [height, setHeight] = React.useState<string>(uc?.body?.height_cm ? String(uc.body.height_cm) : "");
  const h = height.trim() === "" ? null : Number(height);
  const heightOk = h === null || (Number.isInteger(h) && h >= 120 && h <= 220);
  return (
    <EnrichCard id="enrich-body" n={n} title={t.body.title} badge={t.body.badge} why={t.body.why} status={flow.status}
      pending={flow.pending} outcome={flow.outcome} error={flow.error} canSubmit={heightOk}
      notice={<p data-testid="body-notice" className="mt-1.5 flex items-start gap-1.5 text-[12.5px] leading-[1.6] text-accent">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" /><span>{t.body.notice}{guidance.optionalBody}</span></p>}
      onSubmit={() => flow.run({ body: { frame, height_cm: h } })} onSkip={flow.skip} onEdit={flow.edit}>
      <div className="grid grid-cols-3 gap-2">
        {FRAMES.map((f) => (
          <ChoiceTile key={f} on={frame === f} onClick={() => setFrame(frame === f ? null : f)}
            picture={<span className="block size-full p-3"><FrameGarment frame={f} /></span>}
            label={adjustments.bodyFrame[f]} desc={t.body.frames[f]} />
        ))}
      </div>
      <div className="mt-2">
        <Chip on={frame === null} onClick={() => setFrame(null)}>{adjustments.bodyFrame.unknown}</Chip>
      </div>
      <label className="mt-4 block text-[13px] font-medium">
        {adjustments.height}
        <input type="number" inputMode="numeric" min={120} max={220} value={height} placeholder={t.body.heightPlaceholder}
          onChange={(e) => setHeight(e.target.value)} aria-invalid={!heightOk}
          className="mt-1.5 block h-10 w-36 rounded-[4px] border border-rule-strong bg-paper px-3 font-mono text-[14px] font-normal outline-none focus:border-accent" />
      </label>
      {!heightOk && <p className="mt-1 text-[12px] text-[#b4442f]">{t.body.heightInvalid}</p>}
    </EnrichCard>
  );
}

/* 5 · 风格偏好与目标（喜欢 / 不想尝试 / 平时常穿 / 想尝试） */
type StyleMode = "liked" | "disliked" | "current" | "target";
const MODES: StyleMode[] = ["liked", "disliked", "current", "target"];

export function StyleCard({ n, onStatus }: EnrichCardSlotProps) {
  const uc = useUserContext();
  const flow = useCardFlow(onStatus);
  const pres = avatarPresentation(uc?.presentation);
  const [mode, setMode] = React.useState<StyleMode>("liked");
  const [liked, setLiked] = React.useState<StyleKey[]>([...(uc?.style_preferences?.liked ?? [])]);
  const [disliked, setDisliked] = React.useState<StyleKey[]>([...(uc?.style_preferences?.disliked ?? [])]);
  const [current, setCurrent] = React.useState<StyleKey[]>([...(uc?.current_style_picks ?? [])]);
  const [target, setTarget] = React.useState<StyleKey | null>(uc?.target_style ?? null);

  const tap = (k: StyleKey) => {
    const flip = (list: StyleKey[]) => (list.includes(k) ? list.filter((x) => x !== k) : [...list, k]);
    if (mode === "liked") { setLiked(flip); setDisliked((d) => d.filter((x) => x !== k)); }
    else if (mode === "disliked") {
      setDisliked(flip); setLiked((l) => l.filter((x) => x !== k));
      if (target === k) setTarget(null);
    } else if (mode === "current") setCurrent((c) => (c.includes(k) ? c.filter((x) => x !== k) : c.length >= 3 ? c : [...c, k]));
    else { setTarget(target === k ? null : k); setDisliked((d) => d.filter((x) => x !== k)); }
  };
  const isOn = (k: StyleKey) =>
    mode === "liked" ? liked.includes(k) : mode === "disliked" ? disliked.includes(k) : mode === "current" ? current.includes(k) : target === k;
  const marks = (k: StyleKey) => [
    liked.includes(k) && t.style.modes.liked, disliked.includes(k) && "不想试", current.includes(k) && "常穿", target === k && "目标",
  ].filter(Boolean) as string[];
  const patch: ContextPatch = { style_preferences: { liked, disliked }, target_style: target, current_style_picks: current };

  return (
    <EnrichCard id="enrich-style" n={n} title={t.style.title} why={t.style.why} status={flow.status} pending={flow.pending}
      outcome={flow.outcome} error={flow.error} canSubmit onSubmit={() => flow.run(patch)} onSkip={flow.skip} onEdit={flow.edit}>
      <div role="tablist" aria-label={t.style.title} className="grid grid-cols-2 gap-1.5">
        {MODES.map((m) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
            className={cn("rounded-full px-3 py-1.5 text-[13px]",
              mode === m ? "bg-ink text-paper" : "bg-paper-sunk text-ink-soft")}>
            {t.style.modes[m]}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[12px] text-muted">{t.style.modeHint[mode]}</p>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {STYLE_KEYS.map((k) => {
          const name = styleCopy.names[k];
          const m = marks(k);
          return (
            <ChoiceTile key={k} dark on={isOn(k)} onClick={() => tap(k)} label={name}
              desc={m.length ? m.join("\n") : t.style.tags[k]}
              disabled={mode === "current" && current.length >= 3 && !current.includes(k)}
              picture={<span className="mx-auto block h-full w-[88%] pt-1.5"><IllustratedAvatar {...styleLook(k, pres, `${name} 示意插画`)} /></span>} />
          );
        })}
      </div>
    </EnrichCard>
  );
}

/* 6 · 现实条件 */
type Budget = "low" | "medium" | "high";
type Occasion = "commute" | "date" | "formal" | "casual";
const OCCASIONS: { key: Occasion; icon: typeof Briefcase }[] = [
  { key: "commute", icon: Briefcase }, { key: "date", icon: Heart }, { key: "formal", icon: Gem }, { key: "casual", icon: Coffee },
];
const BASE_MINUTES = [0, 5, 10, 20, 30];

export function ConditionsCard({ n, onStatus }: EnrichCardSlotProps) {
  const uc = useUserContext();
  const flow = useCardFlow(onStatus);
  const [budget, setBudget] = React.useState<Budget>(uc?.haircut_budget ?? uc?.constraints.budget_level ?? "medium");
  const [minutes, setMinutes] = React.useState<number>(uc?.constraints.daily_minutes ?? 10);
  const [perm, setPerm] = React.useState<boolean>(uc?.constraints.accepts_perm ?? true);
  const [dye, setDye] = React.useState<boolean>(uc?.constraints.accepts_dye ?? true);
  const [occasions, setOccasions] = React.useState<Occasion[]>([...(uc?.occasions ?? [])]);
  const minuteOptions = React.useMemo(() => {
    const base = new Set(BASE_MINUTES);
    if (uc) base.add(uc.constraints.daily_minutes);
    return [...base].sort((a, b) => a - b);
  }, [uc]);
  const toggleOcc = (o: Occasion) => setOccasions((c) => (c.includes(o) ? c.filter((x) => x !== o) : [...c, o]));
  const submit = () => flow.run({
    haircut_budget: budget,
    constraints: { daily_minutes: minutes, accepts_perm: perm, accepts_dye: dye },
    occasions,
  });
  return (
    <EnrichCard id="enrich-conditions" n={n} title={t.conditions.title} why={t.conditions.why} status={flow.status}
      pending={flow.pending} outcome={flow.outcome} error={flow.error} canSubmit onSubmit={submit} onSkip={flow.skip} onEdit={flow.edit}>
      <Field label={adjustments.maintenance}>
        <div className="flex flex-wrap gap-2">
          {minuteOptions.map((m) => (
            <Chip key={m} on={minutes === m} onClick={() => setMinutes(m)}><MinutesDial minutes={m} />{t.conditions.minutes(m)}</Chip>
          ))}
        </div>
      </Field>
      <Field label={adjustments.haircutBudget}>
        <div className="flex flex-wrap gap-2">
          {(["low", "medium", "high"] as Budget[]).map((b, i) => (
            <Chip key={b} on={budget === b} onClick={() => setBudget(b)}><Coins n={(i + 1) as 1 | 2 | 3} />{t.conditions.budget[b]}</Chip>
          ))}
        </div>
      </Field>
      <Field label="烫发与染发">
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-2">
            <Chip on={perm} onClick={() => setPerm(true)}>{adjustments.perm.yes}</Chip>
            <Chip on={!perm} onClick={() => setPerm(false)}>{adjustments.perm.no}</Chip>
          </div>
          <div className="flex flex-col gap-2">
            <Chip on={dye} onClick={() => setDye(true)}>{adjustments.dye.yes}</Chip>
            <Chip on={!dye} onClick={() => setDye(false)}>{adjustments.dye.no}</Chip>
          </div>
        </div>
      </Field>
      <Field label={t.conditions.occasions}>
        <div className="flex flex-wrap gap-2">
          {OCCASIONS.map(({ key, icon: Icon }) => (
            <Chip key={key} on={occasions.includes(key)} onClick={() => toggleOcc(key)}><Icon className="size-4" />{adjustments.occasions[key]}</Chip>
          ))}
        </div>
      </Field>
    </EnrichCard>
  );
}
