"use client";

/** 形象实验室 Look Studio (V2.1 §4, D30): one portrait, every change composed into the same look.
 *
 *  - Hair shape: one Qwen edit of the ORIGINAL photo, only on an explicit "生成这个造型" (paid, D33).
 *    The result is laid back onto the original at its crop_box, so the local layers below still fit the face.
 *  - Hair colour (per-pixel segmentation), near-face colour, blush, lip: deterministic K5 tints in the browser, instant, nothing uploaded.
 *  - One comparison control: 按住看原图 (D31).
 */
import { Bookmark, Check, Loader2, Lock, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Tabs } from "radix-ui";
import { HoldButton, Stage, useHold } from "@/components/ds";
import { NotReady, Page, PageHeader } from "@/components/passport/ui";
import { Button } from "@/components/ui/button";
import { colorGroups, hairOptions, rankedRecs, TIER_ZH } from "@/lib/adapters";
import { ApiError, backendFor, type PreviewState } from "@/lib/api";
import type { BlushPlacement, FaceGeometry } from "@/lib/tint";
import { readChoices, useChoices, type SavedLook } from "@/lib/state/choices";
import { journey } from "@/lib/copy/journey";
import { isSampleId } from "@/lib/flags";
import s from "@/components/journey/journey.module.css";
import { usePassport } from "@/lib/state/passport-store";
import { HAIR_SHADES } from "@/lib/tint/hair-palette";
import { EyewearControls } from "./eyewear-controls";
import { FRAME_SHAPES } from "@/lib/tint/eyewear";
import { EyeMakeupControls, MakeupPresets } from "./eye-makeup-controls";
import { EYESHADOW_SHADES } from "@/lib/tint/eye-palette";
import { MakeupControls } from "./makeup-controls";
import { LIP_SHADES, BROW_SHAPES } from "@/lib/tint/makeup-palette";
import { HairColorControls } from "./hair-color-controls";
import { portraitSource, type PortraitChoice } from "./portrait-source";
import { useStudioCanvas } from "./use-studio-canvas";
import { cn } from "@/lib/utils";
import { describeLook, EMPTY_LOOK, hairTargetId, layersForLook, restoreLook, type HairTier, type LookSelection } from "./compose";

const TIERS: HairTier[] = ["safe", "bold", "easy"];
const normHex = (v: string | null) => (v && /^#?[0-9a-fA-F]{6}$/.test(v) ? `#${v.replace("#", "").toUpperCase()}` : null);

export function LookStudio() {
  const { id } = usePassport();
  if (isSampleId(id)) return <Page><p role="note">{journey.sampleReadOnly}</p><Link href="/start">开始自己的分析</Link><Link href="/report/sample" className="ml-4">返回示例报告</Link></Page>;
  return <div className={s.surface}><StudioEditor key={id} /></div>;
}

function StudioEditor() {
  const [panel, setPanel] = React.useState("hair");
  const { id, passport, data, requestPreviews, sendFeedback } = usePassport();
  const params = useSearchParams();
  const hold = useHold();
  const { choices, saveLook, removeLook, chooseHair, setPlan } = useChoices(id);
  const [measured, setMeasured] = React.useState<{ key: string; value: FaceGeometry | null } | null>(null);
  const [portrait, setPortrait] = React.useState<PortraitChoice>("front");
  const [look, setLook] = React.useState<LookSelection>(EMPTY_LOOK);
  const [err, setErr] = React.useState<string | null>(null);
  const [requestedTarget, setRequestedTarget] = React.useState<string | null>(null);
  const [reload, setReload] = React.useState(0);
  const [ttlExpired, setTtlExpired] = React.useState(false);
  const expired = Boolean(data?.media.expired) || ttlExpired;
  React.useEffect(() => {
    setTtlExpired(false);
    if (!data?.media.expires_at) return;
    const remaining = Date.parse(data.media.expires_at) - Date.now();
    if (remaining <= 0) { setTtlExpired(true); return; }
    const timer = window.setTimeout(() => setTtlExpired(true), remaining);
    return () => window.clearTimeout(timer);
  }, [id, data?.media.expires_at]);
  const history = React.useRef<LookSelection[]>([]);
  const lastEdit = React.useRef({key:"",at:0});

  const frontEyewear = Boolean(passport?.measurement_profile?.flags.eyewear
    || data?.partial.input_quality?.photos.some(p => p.photo_id === "front" && p.issues.includes("eyewear_detected"))
    || data?.media.photos?.noglasses);
  const source = portraitSource(data ? { ...data.media, expired } : { front: null, expired }, portrait, Boolean(look.eyewear), frontEyewear);
  const geometryKey = `${id}|${source.role}|${source.url}`;
  const geometry = source.role === "glasses" ? null : measured?.key === geometryKey ? measured.value : undefined;
  React.useEffect(() => {
    if (expired || !source.url || source.role === "glasses") return;
    let live = true;
    backendFor(id).geometry(id, source.role).then((g) => live && setMeasured({ key: geometryKey, value: g }))
      .catch(() => live && setMeasured({ key: geometryKey, value: null }));
    return () => { live = false; };
  }, [id, expired, source.role, source.url, geometryKey]);

  // Preselection from the URL (/studio?hair=bold&hc=1&lip=B5707A&drape=1F4E5F) — e.g. "试试这个发型".
  const seeded = React.useRef(false);
  React.useEffect(() => {
    if (seeded.current || !passport) return;
    seeded.current = true;
    const saved = readChoices(id).looks.find(l => l.id === params.get("look"));
    if (saved) { setLook(restoreLook({ ...saved, hair: saved.hair as HairTier | null })); return; }
    const h = params.get("hair");
    const hc = params.get("hc");
    setLook({
      ...EMPTY_LOOK,
      hair: (TIERS as string[]).includes(h ?? "") ? (h as HairTier) : null,
      hairColor: hc !== null && /^\d$/.test(hc) && Number(hc) < passport.analysis.color_profile.hair_color_directions.length ? Number(hc) : null,
      lip: normHex(params.get("lip")),
      drape: normHex(params.get("drape")),
    });
  }, [params, passport, id]);

  const hairTarget = hairTargetId(look.hair, look.hairColor, source.role);
  const requesting = Boolean(hairTarget && requestedTarget === hairTarget);
  const previews = React.useMemo(() => data?.partial.previews ?? [], [data?.partial.previews]);
  const pv: PreviewState | null = hairTarget ? previews.find((p) => p.kind === "hair" && p.target_id === hairTarget) ?? null : null;
  const hairReady = React.useMemo(() => !expired && pv?.status === "succeeded" && pv.after_url
    ? { src: reload ? `${pv.after_url}${pv.after_url.includes("?") ? "&" : "?"}reload=${reload}` : pv.after_url, box: pv.crop_box ?? null, target: pv.target_id } : null, [pv, reload, expired]);
  const colorDir = look.hairColor !== null ? passport?.analysis.color_profile.hair_color_directions[look.hairColor] : null;
  const hairHex = look.hairHex ?? colorDir?.hex ?? null;
  const md = passport?.analysis.makeup_direction;
  const recommendedBlush = React.useMemo(() => md ? {hex:md.blush.hex,placement:md.blush.placement as BlushPlacement} : undefined,[md]);
  const layers = React.useMemo(() => layersForLook({ ...look, eyewear: source.framesAllowed ? look.eyewear : null },recommendedBlush),[look,recommendedBlush,source.framesAllowed]);
  const front = source.url;
  const { canvas, status, hairState, maskState, approximate, makeup, eyewearReason, eyewearControlsReason } = useStudioCanvas({ id, front, source: source.role, expired, geometry, hair: hairReady,
    layers, hex: hairHex, strength: look.hairStrength ?? 0.8, holding: hold.holding, fixture: backendFor(id).kind === "fixture" });

  if (!passport || !data) return <NotReady />;
  const cp = passport.analysis.color_profile;
  const options = hairOptions(passport, previews);
  const paid = data.entitlement.paid;
  const groups = colorGroups(passport);
  const nearFace = [...groups[0].colors, ...groups[1].colors.slice(0, 4), ...groups[2].colors.slice(0, 2)];
  const drapeGroup = (hex: string) => groups.find((g) => g.colors.some((c) => c.hex === hex))?.key;
  const layersOk = Boolean(geometry) && status === "ready";
  const hairOpt = options.find((o) => o.tier === look.hair);
  const colorName = look.hairHex ? HAIR_SHADES.find(h => h.hex === look.hairHex)?.name
    ?? cp.hair_color_directions.find(h => h.hex.toUpperCase() === look.hairHex)?.name ?? '自选发色' : colorDir?.name;
  const lipName = cp.lip_families.find((l) => l.hex.toUpperCase() === look.lip?.toUpperCase())?.name ?? LIP_SHADES.find(l=>l.hex===look.lip)?.name ?? (look.lip ? "自选" : null);
  const drapeName = nearFace.find((c) => c.hex.toUpperCase() === look.drape?.toUpperCase())?.name_zh ?? null;
  const summary = describeLook({
    hairName: hairOpt ? `${hairOpt.tierZh} · ${hairOpt.name}` : null, hairColorName: hairHex ? colorName : null,
    eyeshadowName: !look.eyesObscured && !makeup.eyeshadow && look.eyeshadow ? EYESHADOW_SHADES.find(s=>s.hex===look.eyeshadow?.hex)?.name ?? "自选" : null,
    eyelinerName: !look.eyesObscured && !makeup.eyeliner && look.eyeliner ? look.eyeliner.style === "wing" ? "微翘眼线" : "自然眼线" : null,
    eyewearName: !eyewearReason && !look.eyesObscured && look.eyewear ? FRAME_SHAPES.find(s=>s.id===look.eyewear?.shape)?.name : null,
    lipName, blush: look.blush, browName: BROW_SHAPES.find(b=>b.id===look.brows?.shape)?.name, drapeName,
  });
  const hasEdits = summary !== "原图" || Boolean(look.eyewear || look.eyeshadow || look.eyeliner || look.eyesObscured);
  const set = (patch: Partial<LookSelection>, continuous?: string) => {
    setErr(null);
    const key=continuous ?? Object.keys(patch).join(","), now=Date.now();
    if (!continuous || lastEdit.current.key!==key || now-lastEdit.current.at>700)
      history.current = [...history.current.slice(-29), look];
    lastEdit.current = {key:continuous ? key:"",at:now};
    setLook(l => ({ ...l, ...patch }));
  };

  const generate = async () => {
    if (!hairTarget) return;
    setErr(null);
    setRequestedTarget(hairTarget);
    try {
      await requestPreviews("hair", [hairTarget]);
    } catch (e) {
      setErr(e instanceof ApiError ? e.body.detail : "生成暂时没有成功，请稍后再试");
    } finally {
      setRequestedTarget(current => current === hairTarget ? null : current);
    }
  };
  const save = () => {
    const saved = { name: summary === "原图" ? (look.eyewear ? "眼镜设置（未叠加预览）" : "眼妆设置（未叠加预览）") : summary, ...look, hairHex, hairStrength: look.hairStrength ?? 0.8 };
    saveLook(saved);
    if (look.hair) {
      chooseHair(look.hair);
      const rec = rankedRecs(passport).find(r => r.page === "hair");
      if (rec) setPlan(rec.id, { saved: true });
      sendFeedback({ target_type: "hair_option", target_id: look.hair, reaction: "like", reason_tags: [] });
    }
    toast.success("已保存这个造型，可以在行动方案里找到");
  };
  const apply = (saved: SavedLook) => {
    const {id: _savedId, name: _savedName, savedAt: _savedAt, ...selection} = saved;
    set(restoreLook({...selection,hair: selection.hair as HairTier | null}));
  };

  // What the hair layer is doing right now (state machine shown under the stage).
  const hairStatus: { tone: "muted" | "busy" | "ok" | "warn"; text: string } =
    !hairTarget ? { tone: "muted", text: "现在的发型与发色" }
    : pv?.status === "pending" || requesting ? { tone: "busy", text: journey.generating }
    : hairReady && hairState === "loading" ? { tone: "busy", text: "正在载入生成结果" }
    : hairReady && hairState === "error" ? { tone: "warn", text: journey.brokenResult }
    : hairReady && hairState === "ready" ? { tone: "ok", text: "AI 发型模拟已叠加" }
    : pv?.status === "fallback" || pv?.status === "failed" ? { tone: "warn", text: `这次没有生成成功${pv.error ? `：${pv.error}` : ""}` }
    : { tone: "muted", text: "发型尚未生成，照片上仍是现在的发型" };

  return (
    <Page wide>
      <PageHeader kicker="形象实验室 · Look Studio" title="把变化放在同一张脸上看"
        sub="发型、发色、眼影、眼线、腮红、唇色、眉形、眼镜和近脸色叠加成同一个造型。颜色即时在本地计算；发型需要点“生成”。" />
      <div className="md:grid md:grid-cols-[minmax(0,420px)_minmax(0,1fr)] md:items-start md:gap-8">
        {/* Stage: sticky under the site header on phones, so controls scroll beneath it. */}
        <div className="sticky top-12 z-20 -mx-4 bg-paper px-4 pb-3 pt-1 md:top-16 md:mx-0 md:px-0">
          <details className="mb-3 rounded-[4px] border border-rule p-3">
          <summary className="min-h-8 cursor-pointer text-[13px] text-ink-soft">照片来源 · {source.role === "glasses" ? "日常眼镜参考照" : source.role === "noglasses" ? "无眼镜补充照" : "分析正脸照"}</summary>
          <fieldset className="mt-3 border-t border-rule pt-3">
            <legend className="px-1 text-[13px] font-medium">照片来源</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="照片来源">
              <Choice on={portrait === "front"} onClick={() => setPortrait("front")}>分析正脸照</Choice>
              <Choice on={portrait === "glasses"} disabled={expired || !data.media.photos?.glasses}
                onClick={() => setPortrait("glasses")}>日常眼镜参考照</Choice>
            </div>
            <p className="mt-2 text-[12px] text-muted" aria-live="polite">
              {expired ? "照片已过期，请重新上传。" : source.notice ?? (source.role === "glasses"
                ? "当前使用日常戴镜照；用于发型和发色，不叠加测量线、眼妆或新镜框。"
                : source.role === "noglasses" ? "当前使用原有的无眼镜补充照，定位来自这张照片。"
                : frontEyewear ? "分析照戴镜：眼睛和眉毛测量受限。试新镜框需要无眼镜照片。" : "当前使用无眼镜分析照，保留日常自然发型。")}
            </p>
            {!data.media.photos?.glasses && !expired && <p className="mt-1 text-[12px] text-muted">未提供可用的日常眼镜参考照，仍可使用分析正脸照。</p>}
          </fieldset>
          </details>
          <Stage className="relative mx-auto w-full max-w-[min(100%,calc(32dvh*0.8))] overflow-hidden rounded-[14px] md:max-w-none">
            <div className="relative aspect-[4/5] w-full">
              {status === "ready" ? (
                <canvas ref={canvas} className="absolute inset-0 size-full object-cover" role="img"
                  aria-label={`当前造型：${hold.holding ? "原图" : summary}`} data-testid="studio-canvas" />
              ) : status === "plain" && front ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={hold.holding || !hairReady ? front : hairReady.src} alt={summary} className="absolute inset-0 size-full object-cover" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-[13px] leading-6 text-stage-muted">
                  {status === "loading" ? <Loader2 className="size-5 animate-spin" />
                    : status === "expired" ? "照片已按隐私规则在 24 小时后删除。实验室需要你的正脸照片，可以重新上传一张再试。"
                    : "暂时读不到照片，下方的建议仍然可以参考。"}
                </div>
              )}
              {status === "ready" && (
                <span className="absolute left-2.5 top-2.5 rounded-full bg-black/55 px-2.5 py-1 text-[11px] text-white">
                  {hold.holding ? "原图" : hairReady && hairState === "ready" ? "AI 试看 · 发型为近似模拟" : summary === "原图" ? "原图" : look.eyewear && !eyewearReason && !look.eyesObscured ? "眼镜与颜色模拟" : "颜色模拟"}
                </span>
              )}
              {(pv?.status === "pending" || requesting) && !hold.holding && (
                <span className="absolute inset-x-2.5 bottom-2.5 flex items-center justify-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-[12px] text-white">
                  <Loader2 className="size-3.5 animate-spin" />正在生成发型
                </span>
              )}
            </div>
          </Stage>
          {backendFor(id).kind === "fixture" && <p className="mt-2 text-[12px] text-muted">示例插画 · 不代表真人妆效；请在上传的正脸照片上试妆。</p>}
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="min-w-0 truncate text-[12px] text-ink-soft" aria-live="polite">{summary}</p>
            <HoldButton holding={hold.holding} props={hold.props} disabled={status !== "ready" || summary === "原图"} className="shrink-0 !min-h-9 !px-3.5" />
          </div>
        </div>

        {/* scroll-margin: anything scrolled into view (keyboard focus) lands below the sticky portrait on phones */}
        <Tabs.Root value={panel} onValueChange={setPanel} className="mt-2 space-y-6 md:mt-0 [&_section]:scroll-mt-[calc(32dvh+9rem)] [&_button]:scroll-mt-[calc(32dvh+9rem)] [&_a]:scroll-mt-[calc(32dvh+9rem)] md:[&_section]:scroll-mt-20 md:[&_button]:scroll-mt-20 md:[&_a]:scroll-mt-20">
          <Tabs.List aria-label="造型工具" className={s.studioNav}>
            {[["hair", "发型与发色"], ["makeup", "妆容与配色"], ["eyewear", "眼镜"], ["saved", "我的造型"]].map(([key, label]) => <Tabs.Trigger key={key} value={key}>{label}</Tabs.Trigger>)}
          </Tabs.List>
          <Tabs.Content value="hair" forceMount hidden={panel !== "hair"} className={s.studioPanel}>
          {/* Hair shape only → explicit generation */}
          <Group title="发型" hint="三个推荐方向，或保持现在">
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="发型">
              <Choice on={look.hair === null} onClick={() => set({ hair: null })}>现在的发型</Choice>
              {options.map((o) => (
                <Choice key={o.tier} on={look.hair === o.tier} disabled={o.status === "excluded"} onClick={() => set({ hair: o.tier as HairTier })}
                  title={o.status === "excluded" ? o.issues.join("；") : undefined}>
                  {TIER_ZH[o.tier]} · {o.name}
                </Choice>
              ))}
            </div>
            {hairOpt?.status === "excluded" && <p className="mt-1 text-[12px] text-[#b4442f]">{hairOpt.issues.join("；")}</p>}
          </Group>

          <HairColorControls hex={hairHex} strength={look.hairStrength ?? 0.8} ready={maskState === 'ready' && !expired}
            state={expired ? 'expired' : maskState} approximate={approximate} recommended={cp.hair_color_directions} set={set} />

          <HairAction target={hairTarget} paid={paid} status={hairStatus} ready={Boolean(hairReady)} expired={expired}
            busy={requesting || pv?.status === "pending"} onGenerate={generate} unlockHref={`/p/${id}/unlock`} error={err} />
          {hairReady && hairState === "error" && <Button variant="outline" onClick={() => setReload(n => n + 1)}>{journey.reloadResult}</Button>}
          {(expired || !source.url || status === "unavailable") && <Link href="/start" className="inline-flex min-h-11 items-center text-accent underline">{journey.reupload}</Link>}
          </Tabs.Content>

          <Tabs.Content value="makeup" forceMount hidden={panel !== "makeup"} className={s.studioPanel}>
          {!layersOk && status === "ready" && geometry === null && (
            <p className="rounded-[12px] bg-paper-sunk px-4 py-3 text-[13px] leading-6 text-ink-soft">
              这张照片没有可用的唇部与下颌测量，唇色、腮红、眉形和近脸色暂时不能叠加；发色识别与发型生成不受影响。
            </p>
          )}

          <MakeupPresets look={look} set={set} availability={makeup} />
          <EyeMakeupControls look={look} set={set} availability={makeup} />
          <MakeupControls look={look} set={set} availability={makeup} recommendedBlush={recommendedBlush} recommendedLips={cp.lip_families} />

          <Group title="近脸色" hint="衣领或围巾的颜色，看它对气色的影响">
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="近脸色">
              <Choice on={look.drape === null} onClick={() => set({ drape: null })}>不加</Choice>
              {nearFace.map((c) => (
                <Choice key={c.hex} on={look.drape?.toUpperCase() === c.hex.toUpperCase()} disabled={!layersOk} onClick={() => set({ drape: c.hex })} swatch={c.hex}>
                  {c.name_zh}{drapeGroup(c.hex) === "caution" ? "（慎用）" : ""}
                </Choice>
              ))}
            </div>
          </Group>
          </Tabs.Content>
          <Tabs.Content value="eyewear" forceMount hidden={panel !== "eyewear"} className={s.studioPanel}>
            <EyewearControls look={look} set={set} reason={expired ? "照片已过期，请重新上传后试戴。" : status !== "ready" ? "照片载入后才能试戴眼镜。" : frontEyewear && !data.media.photos?.noglasses ? "没有无眼镜来源，不能在已有眼镜上叠加新镜框。" : (source.role === "glasses" || (frontEyewear && data.media.photos?.noglasses && !look.eyewear)) ? null : eyewearControlsReason}
              warning={look.eyewear && eyewearReason ? "当前调整超出照片或可靠定位范围，请缩小镜框或调回高低；也可重置眼镜。" : null} />
          </Tabs.Content>

          <div className="flex gap-2">
            <Button variant="outline" disabled={!history.current.length} onClick={() => { lastEdit.current={key:"",at:0}; const previous = history.current.pop(); if (previous) setLook(previous); }}>撤销</Button>
            <Button variant="outline" disabled={!hasEdits} onClick={() => set({ ...EMPTY_LOOK, hairHex: null, hairStrength: 0.8 })}><RotateCcw />重置全部</Button>
          </div>
          <Tabs.Content value="saved" forceMount hidden={panel !== "saved"} className={cn(s.studioPanel, "rounded-[14px] border border-rule bg-paper-raised p-5")}>
            <p className="mb-2 text-[12px] text-muted">{journey.savedSettings}</p>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 className="font-serif text-[17px] font-semibold">保存这个造型</h2>
                <p className="truncate text-[12px] text-muted">{summary}</p>
              </div>
              <Button variant="outline" onClick={save} disabled={!hasEdits}><Bookmark />保存</Button>
            </div>
            {choices.looks.length > 0 && (
              <ul className="mt-3 space-y-1.5 border-t border-rule pt-3">
                {choices.looks.map((l) => (
                  <li key={l.id} className="flex items-center gap-2 text-[13px]">
                    <button type="button" onClick={() => apply(l)} className="min-w-0 flex-1 truncate text-left text-accent underline-offset-4 hover:underline">{l.name}</button>
                    <button type="button" aria-label={`删除造型：${l.name}`} onClick={() => removeLook(l.id)} className="p-1 text-muted hover:text-ink"><Trash2 className="size-3.5" /></button>
                  </li>
                ))}
              </ul>
            )}
          </Tabs.Content>
          {panel !== "saved" && <Button variant="accent" className="w-full" onClick={() => { save(); setPanel("saved"); }} disabled={!hasEdits}><Bookmark />保存这个造型</Button>}

          <p className={cn(s.studioFooter, "text-[12px] leading-6 text-muted")}>
            发型是 AI 近似模拟；发色、眼影、眼线、唇色、腮红、眉形、眼镜和近脸色在本地计算。试色不会调用 AI 生成或产生生成费用。
            每次生成都从你的原照片出发，照片、生成图和头发蒙版 24 小时后自动删除；浏览器仅在当前页面内存保留像素，保存造型只记录选项。
          </p>
          <div className="flex flex-wrap gap-3 text-[13px]">
            <Link href={`/p/${id}/hair`} className="text-accent underline-offset-4 hover:underline">发型建议 →</Link>
            <Link href={`/p/${id}/color`} className="text-accent underline-offset-4 hover:underline">个人色彩 →</Link>
            <Link href={`/p/${id}/plan`} className="text-accent underline-offset-4 hover:underline">我的行动方案 →</Link>
            <Link href={`/p/${id}/compare`} className="text-accent underline-offset-4 hover:underline">比较两个造型 →</Link>
          </div>
        </Tabs.Root>
      </div>
    </Page>
  );
}

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-[17px] font-semibold">{title}</h2>
        {hint && <p className="min-w-0 truncate text-[12px] text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Choice({ on, onClick, children, swatch, disabled, title }: {
  on: boolean; onClick: () => void; children: React.ReactNode; swatch?: string; disabled?: boolean; title?: string;
}) {
  return (
    <button type="button" role="radio" aria-checked={on} onClick={onClick} disabled={disabled} title={title}
      className={cn("inline-flex min-h-10 max-w-full items-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-45",
        on ? "border-accent bg-accent-soft text-accent" : "border-rule-strong bg-paper-raised text-ink hover:border-ink/50")}>
      {swatch && <span aria-hidden className="size-4 shrink-0 rounded-full border border-black/10" style={{ background: swatch }} />}
      <span className="truncate">{children}</span>
      {on && <Check className="size-3.5 shrink-0" />}
    </button>
  );
}

function HairAction({ target, paid, status, ready, expired, busy, onGenerate, unlockHref, error }: {
  target: string | null; paid: boolean; status: { tone: "muted" | "busy" | "ok" | "warn"; text: string }; ready: boolean;
  expired: boolean; busy: boolean; onGenerate: () => void; unlockHref: string; error: string | null;
}) {
  if (!target) return null;
  const failed = status.tone === "warn";
  return (
    <div className={cn("rounded-[14px] border p-4", failed ? "border-amber/40 bg-amber-soft" : "border-rule bg-paper-raised")} aria-live="polite">
      <p className="flex items-center gap-1.5 text-[13px] text-ink-soft">
        {status.tone === "busy" ? <Loader2 className="size-3.5 animate-spin" /> : status.tone === "ok" ? <Check className="size-3.5 text-accent" /> : null}
        {status.text}
      </p>
      {!ready && !busy && (paid ? (
        <Button variant="accent" className="mt-3 w-full" onClick={onGenerate} disabled={expired}>
          {failed ? <><RotateCcw />重试生成</> : <><Sparkles />生成这个造型</>}
        </Button>
      ) : (
        <div className="mt-3">
          <p className="flex items-center gap-1.5 text-[13px]"><Lock className="size-3.5" />AI 发型试看包含在完整护照中（一次性购买）</p>
          <Link href={unlockHref} className="mt-2 inline-flex w-full items-center justify-center rounded-full bg-accent px-4 py-2.5 text-[14px] font-medium text-[var(--ap-on-primary)]">
            解锁后生成发型试看
          </Link>
          <p className="mt-2 text-[12px] text-muted">发色、唇色、腮红与近脸色可以免费试。</p>
        </div>
      ))}
      {error && <p className="mt-2 text-[13px] text-[#b4442f]">{error}</p>}
    </div>
  );
}
