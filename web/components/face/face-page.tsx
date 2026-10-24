"use client";

/** 面部美学 (F6 → V3A, D34). Four layers, shallow to deep:
 *   1. 结构画像: the photo with the selected measurement drawn on it, 3 most telling readings, 2 priority directions;
 *   2. 四个维度: harmony / architecture / features / skin & capture — text summaries, never a 0–10 score;
 *   3. 测量工作台: every measurement by group; tapping one draws exactly the geometry it was computed from;
 *   4. 证据 → 建议: each reading as 看到的 → 意味着 → 所以建议, linked to advice pages and the action plan;
 *   5. 面部图谱 (Issue #32, D39): twelve regions — crop, traits, implications and provenance-tagged evidence.
 *  Passports from before schema 0.4 (no measurement_profile) keep the earlier anchors view.
 *  The workbench itself shows measurements, not the score: the AI 面部美学参考分 (D36) lives on the profile page and
 *  links here, so every number behind it can be traced to its lines. */
import * as React from "react";
import { ResembleFor } from "@/components/adjust/feedback-for";
import { Card, NotReady, Page, PageHeader, Section } from "@/components/passport/ui";
import { backendFor, type Passport } from "@/lib/api";
import { guidance } from "@/lib/copy/zh";
import type { FaceGeometry } from "@/lib/tint";
import { referenceRatios, type RatiosView } from "@/lib/adapters";
import { usePassport } from "@/lib/state/passport-store";
import { faceOverlay, faceShape, measurements, pct, traits } from "./face-model";
import { FaceStage } from "./face-stage";
import { measureView, type MeasureView, type ViewRole } from "./measure-model";
import { EvidenceCard, PillarGrid, PriorityList } from "./measure-sections";
import { AddPhotoPanel } from "./add-photo";
import { atlasView } from "./atlas-model";
import { FaceAtlas } from "./atlas";
import { Workbench2 } from "./workbench";
import { MeasureList } from "./measure-rows";
import { ReferenceRails } from "./reference-rails";
import { TraitCard } from "./trait-list";

export function useGeometry(id: string, enabled: boolean): FaceGeometry | null {
  const [g, setG] = React.useState<FaceGeometry | null>(null);
  React.useEffect(() => {
    if (!enabled) return;
    let live = true;
    backendFor(id).geometry(id).then((x) => live && setG(x)).catch(() => live && setG(null));
    return () => { live = false; };
  }, [id, enabled]);
  return g;
}

/** `geometry` may be injected (tests, previews); otherwise it is fetched (null once the photo expired). */
export function FacePage({ geometry: injected }: { geometry?: FaceGeometry | null }) {
  const { id, data, passport } = usePassport();
  const expired = Boolean(data?.media.expired);
  const fetched = useGeometry(id, injected === undefined && !expired && Boolean(passport));
  const geometry = injected === undefined ? fetched : injected;
  const locked = data?.entitlement.locked;
  const view = React.useMemo(() => (passport ? measureView(passport, id, locked ?? []) : null), [passport, id, locked]);

  if (!passport) return <NotReady />;
  const src = expired ? null : data?.media.front ?? null;
  const shape = faceShape(passport);
  const { signature, features } = traits(passport, id);

  const shapeAndTraits = (
    <>
      <Section title="脸型" kicker="轮廓">
        <Card>
          <ul className="space-y-2.5" aria-label="脸型候选">
            {shape.candidates.map((c) => (
              <li key={c.key} className="grid grid-cols-[4.5em_1fr_3em] items-center gap-3 text-[14px]">
                <span className={c.primary ? "font-medium" : "text-ink-soft"}>{c.name}</span>
                <span className="relative h-1.5 rounded-full bg-paper-sunk">
                  <span className={c.primary ? "absolute inset-y-0 left-0 rounded-full bg-accent" : "absolute inset-y-0 left-0 rounded-full bg-rule-strong"}
                    style={{ width: `${Math.round(c.probability * 100)}%` }} />
                </span>
                <span className="tnum text-right text-[13px] text-muted">{pct(c.probability)}</span>
              </li>
            ))}
          </ul>
          {shape.traits.length > 0 && <p className="mt-3 text-[14px] text-ink-soft">{shape.traits.join(" · ")}</p>}
          <p className="mt-2 text-[12px] text-muted">只有正脸照时，不判断侧面轮廓。</p>
        </Card>
      </Section>

      <Section title="你的特点" kicker="特点 → 所以">
        <ul className="space-y-3">{signature.map((t) => <TraitCard key={t.key} t={t} />)}</ul>
        {features.length > 0 && (
          <>
            <h3 className="mb-2 mt-6 text-[13px] text-muted">五官细节</h3>
            <ul className="grid gap-3 sm:grid-cols-2">{features.map((t) => <TraitCard key={t.key} t={t} compact />)}</ul>
          </>
        )}
      </Section>
    </>
  );

  if (!view) {
    return (
      <Page>
        <PageHeader kicker="面部美学" title={shape.title} sub="比例、轮廓与五官，是选发型、妆容和领口的依据，不代表好坏。" />
        <div className="mb-6 rounded-[14px] border border-accent/30 bg-accent-soft p-4 text-[13.5px] leading-6" data-testid="legacy-notice">
          <p className="font-medium">这份档案生成于深度测量上线之前。</p>
          <p className="text-ink-soft">现在的面部评估可以测量 100 余项正脸指标，并支持上传 90° 侧脸照测量鼻唇角、E 线等侧面项目。重新上传照片即可获得完整的测量工作台；下面是这份档案原有的比例视图。</p>
          <a href="/start?topic=face" className="mt-2 inline-block text-accent underline-offset-4 hover:underline">重新上传，获得深度测量 →</a>
        </div>
        <LegacyMeasurements geometry={geometry} src={src} expired={expired} />
        {shapeAndTraits}
      </Page>
    );
  }

  return (
    <Page wide>
      <PageHeader kicker="面部美学 · 测量工作台" title={shape.title}
        sub="每个数字都由照片上的关键点或侧面轮廓计算。鼠标移到一项上就能看到它是怎么量的，点击固定；比例描述的是你的结构，不代表好坏。" />
      <Assessment view={view} id={id} geometry={geometry} src={src} expired={expired} photos={data?.media.photos ?? null}
        ratios={referenceRatios(passport)} passport={passport} />
      <div className="mx-auto mt-4 max-w-2xl lg:mx-0">
        {shapeAndTraits}
      </div>
    </Page>
  );
}

function Assessment({ view, id, geometry, src, expired, photos, ratios, passport }: {
  view: MeasureView; id: string; geometry: FaceGeometry | null; src: string | null; expired: boolean;
  photos: Record<string, string | null> | null; ratios: RatiosView | null; passport: Passport;
}) {
  const [adding, setAdding] = React.useState(false);
  const addRef = React.useRef<HTMLDivElement>(null);
  const urls: Partial<Record<ViewRole, string | null>> = { front: src, ...(photos ?? {}) };
  if (!urls.front) urls.front = src;
  const openAdd = React.useCallback(() => {
    setAdding(true);
    requestAnimationFrame(() => addRef.current?.scrollIntoView?.({ behavior: "smooth", block: "center" }));
  }, []);
  /** Pin a metric in the workbench; side / smile metrics first switch the workbench to their own photo. */
  const show = React.useCallback((metricId: string, role?: ViewRole) => {
    const pin = () => {
      document.querySelector<HTMLButtonElement>(`[data-metric="${metricId}"]`)?.click();
      document.querySelector('[data-testid="workbench"]')?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    };
    const tab = role ? document.querySelector<HTMLButtonElement>(`[data-view-tab="${role}"][aria-selected="false"]`) : null;
    if (!tab) return pin();
    tab.click();
    requestAnimationFrame(pin);
  }, []);
  const atlas = React.useMemo(() => atlasView(passport, view, id), [passport, view, id]);
  return (
    <>
      <Workbench2 v={view} id={id} geometry={geometry} photos={urls} expired={expired} onAddSide={openAdd} />
      <div ref={addRef}>{adding && <AddPhotoPanel role="profile90" onDone={() => setAdding(false)} />}</div>
      <div className="mt-6 flex items-center gap-3">
        <div className="max-w-sm flex-1"><ResembleFor target="face" /></div>
      </div>

      <FaceAtlas a={atlas} v={view} id={id} geometry={geometry} photos={urls} expired={expired} onShowMetric={show} onAddSide={openAdd} />

      <div className="mt-10 grid gap-x-10 lg:grid-cols-2">
        <div className="min-w-0">
          {view.highlights.length > 0 && (
            <Section title="最能说明你的三点" kicker="结构画像">
              <div className="space-y-3">
                {view.highlights.map((h) => <EvidenceCard key={h.metricId} id={id} v={h} metric={view.byId[h.metricId]} onShow={show} />)}
              </div>
            </Section>
          )}
          {view.priorities.length > 0 && (
            <Section title="先从这两件事开始" kicker="优先方向">
              <PriorityList items={view.priorities} />
            </Section>
          )}
        </div>
        <div className="min-w-0">
          <Section title="四个观察维度" kicker="概览" className="lg:mt-0">
            <PillarGrid pillars={view.pillars} onShow={show} />
          </Section>
          {ratios && <ReferenceRails v={ratios} />}
        </div>
      </div>
      {Object.keys(view.insights).length > view.highlights.length && (
        <Section title="从测量到建议" kicker="证据 → 建议">
          <p className="mb-3 text-[13px] leading-6 text-ink-soft">{guidance.commonRange}</p>
          <div className="grid gap-3 lg:grid-cols-2">
            {Object.values(view.insights).filter((i) => !i.highlight).map((i) => (
              <EvidenceCard key={i.metricId} id={id} v={i} metric={view.byId[i.metricId]} onShow={show} />
            ))}
          </div>
        </Section>
      )}
    </>
  );
}

/** Pre-0.4 passports: the anchors-based thirds / fifths / contour view. */
function LegacyMeasurements({ geometry, src, expired }: { geometry: FaceGeometry | null; src: string | null; expired: boolean }) {
  const { passport } = usePassport();
  const anchors = passport?.anchors ?? null;
  const overlay = React.useMemo(() => {
    if (!geometry) return null;
    try {
      return faceOverlay(geometry, anchors);
    } catch {
      return null;
    }
  }, [geometry, anchors]);
  const m = measurements(anchors);
  return (
    <>
      <FaceStage src={src} overlay={overlay} expired={expired} />
      <div className="mx-auto mt-3 max-w-sm"><ResembleFor target="face" /></div>
      {anchors && (
        <Section title="比例" kicker="照片测量">
          <Card>
            {m.thirds.length > 0 ? (
              <>
                <h3 className="text-[13px] text-muted">三庭</h3>
                <MeasureList items={m.thirds} />
                {m.upperMissing && <p className="mt-1 text-[12.5px] leading-6 text-ink-soft">{guidance.foreheadOccluded}</p>}
              </>
            ) : (
              <p className="text-[13px] text-muted">三庭本次未测量。</p>
            )}
            <h3 className="mt-4 text-[13px] text-muted">五眼与宽度</h3>
            {anchors.eye_fifths ? (
              <p className="tnum mt-2 text-[13px] text-ink-soft" aria-label="五眼，以平均眼宽为 1">
                {anchors.eye_fifths.map((v) => v.toFixed(2)).join(" · ")}
                <span className="mt-0.5 block font-sans text-[12px] text-muted">从左到右五段，以平均眼宽为 1</span>
              </p>
            ) : (
              <p className="mt-2 text-[12.5px] text-muted">头部角度较大，五眼本次未测量，只给轮廓结论。</p>
            )}
            <MeasureList items={m.shape} />
            <p className="mt-2 flex items-start gap-2 text-[12px] leading-6 text-muted"><span aria-hidden className="mt-[7px] inline-block h-2.5 w-5 shrink-0 rounded-[2px] bg-paper-sunk" />{guidance.commonRange}</p>
          </Card>
        </Section>
      )}
    </>
  );
}
