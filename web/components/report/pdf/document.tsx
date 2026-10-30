/** 完整面部评估报告 · PDF (Issue #33, Phase 2): the seven-chapter report as a real, paginated, text-based PDF.
 *
 *  Built from exactly what the web report shows: the same `PassportResponse` (already trimmed by the server for a free
 *  entitlement) and the same view models (measureView, regionViews, rankedRecs, aestheticScore, …). Nothing here
 *  measures, scores or recommends, and nothing the server withheld can appear: the PDF only prints what is present
 *  and says plainly what the full passport adds.
 *
 *  Images are optional and come only from `images`, which the caller fills from photos the viewer is already
 *  allowed to see, and only when they asked for a photo-inclusive export. Without them the PDF is complete: every
 *  number and text stays, region crops and try-on images are simply omitted. */
import { Circle, Document, Font, Image, Line, Link, Page, Path, Polygon, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";
import * as React from "react";
import { adviceGroups } from "@/components/advice/advice-page";
import { faceShape } from "@/components/face/face-model";
import { CONFIDENCE_ZH, measureView, type Assessment, type MeasureView } from "@/components/face/measure-model";
import {
  aestheticScore, colorGroups, cover, hairOptions, harmonyRadar, learnedScore, rankedRecs, referenceRank, stripRefs,
  type HairOptionView, type ScoreView, type Tier,
} from "@/lib/adapters";
import type { Passport, PassportResponse } from "@/lib/api";
import { aestheticScore as scoreCopy, entitlements, guidance, learnedAttractiveness as learnedCopy, report as copy } from "@/lib/copy/zh";
import { CHAPTER_KEYS, chapterNo, previewNote, regionViews, type ChapterKey, type PreviewNote, type RegionView } from "../report-model";
import { cjkPieces, prepare } from "./text";
import { densityPaths, radarPoint, radarPolygon, type Density } from "@/components/profile/score-chart-geometry";

// --- fonts -----------------------------------------------------------------------------------------------------

export const FONT = "NotoSansSC";
let registered: string | null = null;

/** Noto Sans SC (SIL OFL 1.1), subset by web/scripts/subset-report-font.py. `base` is a URL path in the browser and a
 *  directory in tests. */
export function registerReportFonts(base: string) {
  if (registered === base) return;
  Font.register({
    family: FONT,
    fonts: [
      { src: `${base}/NotoSansSC-Regular.ttf`, fontWeight: 400 },
      { src: `${base}/NotoSansSC-Bold.ttf`, fontWeight: 700 },
    ],
  });
  Font.registerHyphenationCallback(cjkPieces);
  registered = base;
}

/** After a failed export: react-pdf caches a font's load promise even when the download failed (`Font.reset()` keeps
 *  it), so forget our own family's loads and let the retry fetch the files again. */
export function resetReportFonts() {
  type Source = { data: unknown; loadResultPromise: Promise<void> | null };
  const family = (Font.getRegisteredFonts() as unknown as Record<string, { sources: Source[] }>)[FONT];
  for (const src of family?.sources ?? []) {
    src.data = null;
    src.loadResultPromise = null;
  }
}

// --- inputs ----------------------------------------------------------------------------------------------------

/** Images the viewer explicitly included. All are JPEG/PNG data URLs drawn in the browser; none is uploaded. */
export interface ReportImages {
  portrait: string | null;
  /** Region key → front-photo crop with the measured lines, and its aspect ratio (w / h). */
  regions: Record<string, { src: string; aspect: number; caption: string }>;
  /** Hair tier → succeeded preview (AI try-on or, on the sample, the labeled illustration). */
  hair: Partial<Record<Tier, string>>;
}

export type PhotoMode = "included" | "omitted" | "expired";
/** A real-flow passport whose content is simulated (fixture backend or fake providers): never presented as a result. */
export type DemoKind = "fixture" | "mock" | null;

export interface ReportPdfInput {
  data: PassportResponse;
  sample: boolean;
  /** Simulated content outside the public sample; labeled on every page like the web demo banner. */
  demo?: DemoKind;
  images: ReportImages | null;
  photoMode: PhotoMode;
  /** When the file was generated (also the PDF CreationDate). */
  now?: Date;
}

export const passportNo = (p: Passport) => p.passport_id.replace(/^\w+_/, "").slice(-6).toUpperCase();

export function reportPdfMeta(data: PassportResponse, sample: boolean, demo: DemoKind = null) {
  const p = data.passport!;
  const no = passportNo(p);
  const variant = p.user_context.presentation === "masculine" ? "男性化表达" : "女性化表达";
  const edition = data.entitlement.paid ? "完整版" : "免费版";
  return {
    title: sample ? `${copy.title} · 示例（${variant}）` : `${copy.title} · No.${no}${demo ? "（演示）" : ""}`,
    // ASCII on purpose: several browsers and in-app webviews drop non-ASCII download names ("download")
    filename: sample ? `aesthetic-passport-sample-report-${p.user_context.presentation === "masculine" ? "male" : "female"}.pdf`
      : `aesthetic-passport-report-${data.entitlement.paid ? "full" : "free"}-${no}${demo ? "-demo" : ""}.pdf`,
    edition,
  };
}

// --- styles ----------------------------------------------------------------------------------------------------

const C = {
  ink: "#172125", soft: "#46565d", muted: "#53636b", primary: "#3f625e", primarySoft: "#e0e7e7",
  amber: "#3f625e", amberSoft: "#e6ebed", rule: "#ccd2d3", ruleStrong: "#aab6b9", panel: "#f1f1ee", stage: "#d7dde0",
};

const s = StyleSheet.create({
  page: { fontFamily: FONT, fontSize: 9.5, lineHeight: 1.6, color: C.ink, paddingTop: 58, paddingBottom: 58, paddingHorizontal: 50 },
  running: { position: "absolute", left: 50, right: 50, fontSize: 7.5, lineHeight: 1.3, color: C.muted },
  rule: { position: "absolute", left: 50, right: 50, height: 0.5, backgroundColor: C.rule },
  sampleBand: { color: C.amber, fontWeight: 700 },
  chapterNo: { fontSize: 9, color: C.amber, letterSpacing: 2, lineHeight: 1.3 },
  chapterTitle: { fontSize: 20, fontWeight: 700, lineHeight: 1.3, marginTop: 2 },
  chapterSub: { fontSize: 9.5, color: C.soft, marginTop: 3, marginBottom: 14 },
  h3: { fontSize: 12.5, fontWeight: 700, lineHeight: 1.4, marginBottom: 6 },
  h4: { fontSize: 8.5, color: C.muted, letterSpacing: 1, lineHeight: 1.4, marginBottom: 4 },
  panel: { backgroundColor: C.panel, borderRadius: 2, padding: 10 },
  box: { borderWidth: 0.75, borderColor: C.rule, borderRadius: 2, padding: 10 },
  small: { fontSize: 8, color: C.muted, lineHeight: 1.5 },
  soft: { color: C.soft },
  bold: { fontWeight: 700 },
  row: { flexDirection: "row" },
  note: { backgroundColor: C.amberSoft, borderRadius: 2, padding: 8, fontSize: 8.5 },
  pill: { fontSize: 7.5, borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1, backgroundColor: C.panel, color: C.soft, marginRight: 4, lineHeight: 1.4 },
});

// --- primitives ------------------------------------------------------------------------------------------------

type TextProps = { children?: React.ReactNode; style?: Style | Style[]; minPresenceAhead?: number };

/** Text whose string children are prepared for Chinese line breaking. */
function T({ children, ...rest }: TextProps) {
  const kids = React.Children.map(children, (c) => (typeof c === "string" ? prepare(c) : c));
  return <Text {...rest}>{kids}</Text>;
}

/** react-pdf writes an outline entry for any node with `bookmark`; its types only declare it on <Page>. */
const Section = View as unknown as React.ComponentType<React.ComponentProps<typeof View> & { bookmark?: { title: string; fit?: boolean } }>;

function Gap({ h = 8 }: { h?: number }) {
  return <View style={{ height: h }} />;
}

function Bar({ pct, color = C.primary, h = 4 }: { pct: number; color?: string; h?: number }) {
  const w = Math.max(0, Math.min(100, pct));
  return (
    <View style={{ height: h, borderRadius: h / 2, backgroundColor: C.rule, overflow: "hidden" }}>
      <View style={{ width: `${w}%`, height: h, borderRadius: h / 2, backgroundColor: color }} />
    </View>
  );
}

/** The workbench range bar: middle third = the common range, dot = this measurement. */
function RangeBar({ a }: { a: Assessment }) {
  const left = Math.max(0, Math.min(1, a.position)) * 100;
  return (
    <View style={{ height: 8, justifyContent: "center" }}>
      <View style={{ height: 4, borderRadius: 2, backgroundColor: C.panel, borderWidth: 0.5, borderColor: C.rule }} />
      <View style={{ position: "absolute", left: "33.3%", width: "33.4%", height: 4, top: 2, backgroundColor: C.ruleStrong, opacity: 0.6 }} />
      <View style={{ position: "absolute", left: `${left}%`, marginLeft: -4, top: 0, width: 8, height: 8, borderRadius: 4,
        backgroundColor: a.band === "typical" ? C.soft : C.amber, borderWidth: 1.2, borderColor: "#fff" }} />
    </View>
  );
}

function Swatches({ hexes, size = 11 }: { hexes: string[]; size?: number }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
      {hexes.map((h, i) => (
        <View key={`${h}${i}`} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: h, borderWidth: 0.5, borderColor: "#00000022", marginRight: 3, marginBottom: 3 }} />
      ))}
    </View>
  );
}

function Bullet({ children, mark = "·", color = C.muted }: { children: React.ReactNode; mark?: string; color?: string }) {
  return (
    <View style={{ flexDirection: "row", marginBottom: 2.5 }} wrap={false}>
      <Text style={{ width: 10, color }}>{mark}</Text>
      <View style={{ flex: 1 }}>{typeof children === "string" ? <T>{children}</T> : children}</View>
    </View>
  );
}

function Pill({ children, tone }: { children: string; tone?: "accent" | "amber" }) {
  const t = tone === "accent" ? { backgroundColor: C.primarySoft, color: C.primary } : tone === "amber" ? { backgroundColor: C.amberSoft, color: C.amber } : {};
  return <T style={[s.pill, t]}>{children}</T>;
}

function Locked({ text }: { text: string }) {
  return <T style={[s.small, { marginTop: 3 }]}>[完整护照] {text}</T>;
}

function Chapter({ k, children }: { k: ChapterKey; children: React.ReactNode }) {
  return (
    <Section break id={k} bookmark={{ title: `${chapterNo(k)} ${copy.chapters[k].title}`, fit: true }}>
      <View wrap={false}>
        <Text style={s.chapterNo}>{chapterNo(k)}</Text>
        <T style={s.chapterTitle}>{copy.chapters[k].title}</T>
        <T style={s.chapterSub}>{copy.chapters[k].sub}</T>
      </View>
      {children}
    </Section>
  );
}

/** A titled block whose heading never ends a page alone: it travels with the first child (`keep`: the whole block,
 *  for short blocks; `glue={false}` for one tall child that must be free to split). */
function Sub({ title, children, first, keep, glue = true }: { title: string; children: React.ReactNode; first?: boolean; keep?: boolean; glue?: boolean }) {
  const kids = React.Children.toArray(children);
  const head = <T style={s.h3}>{title}</T>;
  return (
    <View style={{ marginTop: first ? 0 : 14 }} wrap={!keep}>
      {glue && !keep ? <View wrap={false}>{head}{kids[0]}</View> : head}
      {glue && !keep ? kids.slice(1) : kids}
    </View>
  );
}

/** A small label glued to the first of its items. */
function Labeled({ label, items, style }: { label: string; items: React.ReactNode[]; style?: Style }) {
  if (!items.length) return null;
  return (
    <View style={style}>
      <View wrap={false}><T style={s.h4}>{label}</T>{items[0]}</View>
      {items.slice(1)}
    </View>
  );
}

// --- document --------------------------------------------------------------------------------------------------

export function ReportDocument({ data, sample, demo = null, images, photoMode, now = new Date() }: ReportPdfInput) {
  const p = data.passport!;
  const meta = reportPdfMeta(data, sample, demo);
  if (sample) demo = null;
  const mv = measureView(p, data.id, data.entitlement.locked);
  const paid = data.entitlement.paid;
  const no = passportNo(p);
  return (
    <Document title={meta.title} author="形象护照 Aesthetic Passport" creator="形象护照 Aesthetic Passport" producer="形象护照 · react-pdf"
      subject={`${scoreCopy.title}、面部测量、解读、改善建议、形象方案与行动计划（${meta.edition}）`}
      keywords="形象护照, 面部评估报告, AI 面部美学参考分, 面部测量, 发型, 个人色彩, 行动计划"
      language="zh-CN" creationDate={now} pageMode="useOutlines">
      <Page size="A4" style={s.page}>
        <View fixed style={[s.rule, { top: 40 }]} />
        <Text fixed style={[s.running, { top: 27 }]} render={({ pageNumber }) => (pageNumber === 1 ? "" : prepare(`形象护照 · ${copy.title} · ${meta.edition}`))} />
        <Text fixed style={[s.running, { top: 27, textAlign: "right" }, sample || demo ? s.sampleBand : {}]}
          render={({ pageNumber }) => (pageNumber === 1 ? "" : prepare(sample ? copy.sampleKicker
            : demo ? `${copy.pdf.demoBand[demo]} · No.${no}` : `No.${no}`))} />
        <View fixed style={[s.rule, { top: 801 }]} />
        <Text fixed style={[s.running, { top: 805 }]}>{prepare(sample ? "形象护照 · 风格与行动" : "仅描述照片上可测量、可观察的特点，不判断长相好坏，不提供医疗建议")}</Text>
        <Text fixed style={[s.running, { top: 805, textAlign: "right" }]} render={({ pageNumber, totalPages }) => prepare(`第 ${pageNumber} / ${totalPages} 页`)} />

        <Cover data={data} sample={sample} demo={demo} images={images} photoMode={photoMode} now={now} />
        <Overview p={p} sample={sample} demo={demo} />
        <Interpretation p={p} />
        <Findings p={p} mv={mv} images={images} photoMode={photoMode} />
        <Improvements p={p} />
        <Options p={p} data={data} images={images} photoMode={photoMode} />
        <Plan p={p} data={data} />
        <Methods p={p} data={data} mv={mv} sample={sample} demo={demo} paid={paid} photoMode={photoMode} />
      </Page>
    </Document>
  );
}

// --- cover -----------------------------------------------------------------------------------------------------

const PHOTO_NOTE: Record<PhotoMode, string> = {
  included: "本 PDF 包含你选择加入的照片局部图与发型试看图。PDF 在你的浏览器中生成，照片没有再次上传或另存。",
  omitted: "本 PDF 为无图版：不含任何照片，测量数字、解读与建议完整保留。",
  expired: "照片已按承诺删除，本 PDF 为无图版；测量数字、解读与建议完整保留。",
};

function Cover({ data, sample, demo, images, photoMode, now }: {
  data: PassportResponse; sample: boolean; demo: DemoKind; images: ReportImages | null; photoMode: PhotoMode; now: Date;
}) {
  const p = data.passport!;
  const c = cover(p);
  const shape = faceShape(p);
  const score = aestheticScore(p);
  const predicted = learnedScore(p);
  const rank = referenceRank(p);
  const created = new Date(data.created_at);
  const fmt = (d: Date) => (Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("zh-CN"));
  const facts: [string, string][] = [
    ["脸型", shape.title], ["色彩倾向", p.derived.display_labels.color.summary_zh], ["风格方向", c.styleLine],
    ...(!sample ? [["档案编号", `No.${passportNo(p)}`], ["分析时间", fmt(created)]] as [string, string][] : []), ["导出时间", fmt(now)],
  ];
  const portrait = images?.portrait ?? null;
  return (
    <Section bookmark={{ title: "封面与目录", fit: true }}>
      <Text style={{ fontSize: 9, color: sample ? C.amber : C.muted, letterSpacing: 2, lineHeight: 1.3 }}>{prepare(sample ? copy.sampleKicker : `形象护照 · ${copy.kicker}`)}</Text>
      <View style={[s.row, { marginTop: 10 }]}>
        <View style={{ flex: 1, paddingRight: portrait ? 18 : 0 }}>
          <T style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.25 }}>你的形象护照</T>
          <T style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>{reportPdfMeta(data, sample, demo).edition}{sample ? " · 示例" : demo ? " · 演示" : ""}</T>
          <T style={{ fontSize: 12, lineHeight: 1.7, color: C.soft, marginTop: 12 }}>{c.oneLiner}</T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 14 }}>
            {facts.map(([k, v]) => (
              <View key={k} style={{ width: "50%", marginBottom: 8, paddingRight: 8 }}>
                <T style={s.small}>{k}</T>
                <T style={{ fontSize: 10, fontWeight: 700, lineHeight: 1.4 }}>{v}</T>
              </View>
            ))}
          </View>
        </View>
        {portrait && (
          <View style={{ width: 190 }}>
            <Image src={portrait} style={{ width: 190, height: 237.5, borderRadius: 2, objectFit: "cover" }} />
            <T style={[s.small, { marginTop: 3 }]}>{sample ? "面部细节" : "你的正脸照片（按你的选择加入）"}</T>
          </View>
        )}
      </View>

      {predicted && <View style={[s.box, { marginTop: 10 }]} wrap={false}>
        <View style={s.row}>
        <View style={{ width: "50%" }}>
          <T style={s.small}>{learnedCopy.title}</T>
          <T style={{ fontSize: 24 }}>{predicted.available ? `${predicted.score} /10` : learnedCopy.unavailable}</T>
        </View>
        <View style={{ width: "50%", borderLeftWidth: 0.5, borderLeftColor: C.rule, paddingLeft: 12 }}>
          <T style={s.small}>{learnedCopy.rank}</T>
          <T style={{ fontSize: 24 }}>{predicted.available && predicted.rank ? `前 ${predicted.rank.top}%` : learnedCopy.rankMissing}</T>
        </View>
        </View>
        {predicted.available && predicted.rank?.distribution && <DensityChart curve={predicted.rank.distribution} score={predicted.score!} />}
      </View>}
      {!predicted && score && score.score != null && (
        <View style={[s.box, s.row, { marginTop: 10, alignItems: "center" }]} wrap={false}>
          <View style={{ width: 110, alignItems: "center" }}>
            <T style={s.small}>{score.name}</T>
            <Text style={{ fontSize: 34, fontWeight: 700, lineHeight: 1.15, color: C.primary }}>{score.score}</Text>
            <T style={s.small}>{scoreCopy.outOf}{score.state === "scored" && score.tier ? ` · ${score.tier}` : ""}</T>
          </View>
          <View style={{ flex: 1, paddingLeft: 12, borderLeftWidth: 0.5, borderLeftColor: C.rule }}>
            {score.state === "limited" && <T style={[s.small, { marginBottom: 5 }]}>{scoreCopy.limited} · {score.statusText}{score.flags.length ? ` · ${score.flags.join("；")}` : ""}</T>}
            {score.components.map((x) => (
              <View key={x.key} style={[s.row, { alignItems: "center", marginBottom: 3 }]}>
                <T style={{ width: 70, fontSize: 8.5 }}>{x.name}</T>
                <View style={{ flex: 1 }}><Bar pct={x.score ?? 0} /></View>
                <Text style={{ width: 28, textAlign: "right", fontSize: 8.5 }}>{x.score ?? "—"}</Text>
              </View>
            ))}
            {rank && <T style={[s.small, { marginTop: 4 }]}>{rank.state === "ranked" ? `${rank.title}：${rank.label}（约）` : "参考人群位置校准中"}</T>}
            {demo && <T style={[s.small, { marginTop: 2, color: C.amber }]}>{copy.pdf.demoScore}</T>}
          </View>
        </View>
      )}

      {!predicted && (!score || score.score === null) && <View style={[s.panel, { marginTop: 10 }]}><T style={s.bold}>{scoreCopy.unavailable}</T><T style={s.small}>{score?.statusText}{score?.flags.length ? ` · ${score.flags.join("；")}` : ""}</T><T style={s.small}>{scoreCopy.retake}</T></View>}
      {demo && <View style={[s.note, { marginTop: 10 }]}><T>{copy.pdf.demo[demo]}</T></View>}
      {!data.entitlement.paid && <T style={[s.small, { marginTop: 12 }]}>免费版报告</T>}
      <View style={{ marginTop: 16 }}>
        <T style={s.h4}>{copy.toc}</T>
        {CHAPTER_KEYS.map((k) => (
          <Link key={k} src={`#${k}`} style={{ textDecoration: "none", color: C.ink }}>
            <View style={[s.row, { borderBottomWidth: 0.5, borderBottomColor: C.rule, paddingVertical: 4 }]}>
              <Text style={{ width: 26, color: C.amber, fontSize: 9 }}>{chapterNo(k)}</Text>
              <T style={{ width: 120, fontWeight: 700 }}>{copy.chapters[k].title}</T>
              <T style={{ flex: 1, color: C.muted, fontSize: 8.5 }}>{copy.chapters[k].sub}</T>
            </View>
          </Link>
        ))}
      </View>
    </Section>
  );
}

// --- 01 overview -----------------------------------------------------------------------------------------------

function Overview({ p, sample, demo }: { p: Passport; sample: boolean; demo: DemoKind }) {
  const first = rankedRecs(p)[0];
  return (
    <Chapter k="overview">
      <View style={[s.row, { marginTop: 12 }]}>
        <View style={[s.box, { flex: 1, marginRight: 6 }]}>
          <T style={s.h4}>{copy.strengths}</T>
          {p.analysis.feature_signature.map((f) => (
            <View key={f.title} style={{ marginBottom: 5 }} wrap={false}>
              <T style={s.bold}>✓ {f.title}</T>
              <T style={[s.soft, { fontSize: 8.5, paddingLeft: 9 }]}>{stripRefs(f.styling_implication)}</T>
            </View>
          ))}
        </View>
        {first && (
          <View style={{ flex: 1, marginLeft: 6, backgroundColor: C.ink, borderRadius: 2, padding: 10 }} wrap={false}>
            <T style={[s.h4, { color: "#c1c7c7" }]}>{copy.leverage}</T>
            <T style={{ color: "#fff", fontSize: 12, fontWeight: 700, lineHeight: 1.55 }}>{first.action}</T>
            <T style={{ color: "#e6e6e2", fontSize: 8.5, marginTop: 5 }}>{first.why}</T>
            <T style={{ color: "#c1c7c7", fontSize: 8, marginTop: 6 }}>{[first.categoryZh, first.time, first.cost].filter(Boolean).join(" · ")} · 怎么检查：{first.successCheck}</T>
          </View>
        )}
      </View>
    </Chapter>
  );
}

// --- 02 findings -----------------------------------------------------------------------------------------------

function Findings({ p, mv, images, photoMode }: { p: Passport; mv: MeasureView | null; images: ReportImages | null; photoMode: PhotoMode }) {
  const regions = mv ? regionViews(p, mv) : [];
  const shape = faceShape(p);
  return (
    <Chapter k="findings">
      <View style={s.box} wrap={false}>
        <T style={s.h3}>脸型：{shape.title}</T>
        {shape.candidates.map((c) => (
          <View key={c.key} style={[s.row, { alignItems: "center", marginBottom: 2 }]}>
            <T style={{ width: 60, fontWeight: c.primary ? 700 : 400 }}>{c.name}</T>
            <View style={{ flex: 1 }}><Bar pct={c.probability * 100} color={c.primary ? C.primary : C.ruleStrong} /></View>
            <Text style={{ width: 34, textAlign: "right", fontSize: 8.5, color: C.muted }}>{Math.round(c.probability * 100)}%</Text>
          </View>
        ))}
        {shape.traits.length > 0 && <T style={[s.soft, { marginTop: 4 }]}>{shape.traits.join(" · ")}</T>}
      </View>
      {mv && (
        <Sub title={copy.pillars}>
          {mv.pillars.map((pl) => (
            <View key={pl.key} style={{ marginBottom: 6 }} wrap={false}>
              <View style={[s.row, { justifyContent: "space-between" }]}>
                <T style={s.bold}>{pl.name}</T>
                <T style={s.small}>{copy.measuredOf} {pl.measured} / {pl.total}</T>
              </View>
              <T style={s.soft}>{pl.summary || pl.about}</T>
            </View>
          ))}
        </Sub>
      )}
      {photoMode !== "included" && mv && (
        <T style={[s.small, { marginTop: 6 }]}>
          {photoMode === "expired" ? copy.cropExpired : "无图版：各部位的照片局部图与测量线只在网页报告中显示，下列数值不受影响。"}
        </T>
      )}
      {!mv && (
        <View style={[s.panel, { marginTop: 10 }]}>
          <T>这份档案生成于深度测量上线之前，按部位的测量不可用；后面的解读与建议仍然来自这份档案。</T>
        </View>
      )}
      {regions.map((r) => <Region key={r.key} r={r} crop={images?.regions[r.key] ?? null} />)}
    </Chapter>
  );
}

function MetricRow({ row }: { row: RegionView["rows"][number] }) {
  return (
    <View style={{ paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: C.rule }} wrap={false}>
      <View style={[s.row, { alignItems: "center" }]}>
        <T style={{ flex: 1, fontWeight: 700 }}>{row.name}</T>
        <T style={{ width: 70, textAlign: "right", fontSize: 10.5, fontWeight: 700 }}>{row.value}</T>
      </View>
      {row.assessment && (
        <View style={[s.row, { alignItems: "center", marginTop: 2 }]}>
          <View style={{ flex: 1 }}><RangeBar a={row.assessment} /></View>
          <T style={{ width: 70, textAlign: "right", fontSize: 8, color: row.assessment.band === "typical" ? C.muted : C.amber }}>{row.assessment.label_zh}</T>
        </View>
      )}

    </View>
  );
}

function Region({ r, crop }: { r: RegionView; crop: ReportImages["regions"][string] | null }) {
  const cropW = 120;
  // the heading, the crop and the first rows form one block, so a region never starts at the foot of a page
  const leadRows = crop ? 3 : 2;
  const rows = r.rows.map((row) => <MetricRow key={row.id} row={row} />);
  return (
    <View style={{ marginTop: 16 }}>
      <View wrap={false}>
        <View style={[s.row, { justifyContent: "space-between", alignItems: "flex-end", borderBottomWidth: 0.75, borderBottomColor: C.ink, paddingBottom: 3, marginBottom: 6 }]}>
          <T style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.35 }}>{r.title}</T>
          <T style={s.small}>{copy.measuredOf} {r.measured} / {r.total}</T>
        </View>
        <View style={s.row}>
          {crop && (
            <View style={{ width: cropW, marginRight: 12 }}>
              <Image src={crop.src} style={{ width: cropW, height: cropW / crop.aspect, borderRadius: 5 }} />
              <T style={[s.small, { marginTop: 2 }]}>{crop.caption}</T>
            </View>
          )}
          <View style={{ flex: 1 }}>
            {rows.length ? rows.slice(0, leadRows) : <T style={[s.small, s.panel]}>{copy.regionNoData}</T>}
          </View>
        </View>
      </View>
      <View style={{ marginLeft: crop ? cropW + 12 : 0 }}>
        {rows.slice(leadRows)}
        <View style={{ marginTop: 3 }} wrap={false}>
          {r.more > 0 && <T style={s.small}>另有 {r.more} 项已测 · {copy.regionMore}</T>}
          {r.locked > 0 && <T style={s.small}>[完整护照] {r.locked} {copy.regionLocked}</T>}
          {r.missing.map((m) => <T key={m.reason} style={s.small}>{copy.regionMissing} {m.count} 项：{m.reason}</T>)}
        </View>
      </View>
      {r.insights.length > 0 && <View style={{ marginTop: 12 }}>
        <View style={[s.row, { borderBottomWidth: 0.5, borderBottomColor: C.rule, paddingBottom: 5 }]}><T style={[s.small, { width: "42%" }]}>面部特点</T><T style={s.small}>造型启发</T></View>
        {r.insights.map(i => <View key={i.metricId} style={[s.row, { borderBottomWidth: 0.5, borderBottomColor: C.rule }]} wrap={false}>
          <View style={{ width:"42%", padding:8, backgroundColor:C.panel }}><T style={s.bold}>{i.label}</T><T style={s.small}>{i.seen}</T></View>
          <View style={{ flex:1,padding:8 }}><T>{i.means}</T></View>
        </View>)}
      </View>}
      {!r.insights.length && r.observations.length > 0 && <Labeled label={copy.regionObservations} style={{ marginTop: 6 }} items={r.observations.map(o => <Bullet key={o.text}>{o.text}</Bullet>)} />}
    </View>
  );
}

// --- 03 interpretation -----------------------------------------------------------------------------------------

const SEVERITY: Record<string, string> = { high: "影响较大", medium: "影响中等", low: "影响较小" };

function DensityChart({ curve, score }: { curve: Density; score: number }) {
  const d = densityPaths(curve, score);
  return <View style={{ alignItems: "center", marginTop: 8 }}>
    <Svg width={300} height={130} viewBox="0 0 320 150">
      <Path d={d.area} fill="#edf2f1" />
      <Path d={d.rightArea} fill="#c8d8d5" />
      <Path d={d.line} fill="none" stroke={C.primary} strokeWidth={1.8} />
      <Line x1={d.left} x2={d.right} y1={d.baseline} y2={d.baseline} stroke={C.rule} />
      <Line x1={d.markerX} x2={d.markerX} y1={d.top} y2={d.baseline} stroke={C.primary} strokeWidth={1.5} />
      <Circle cx={d.markerX} cy={d.markerY} r={3.5} fill="#ffffff" stroke={C.primary} />
      <Line x1={d.meanX} x2={d.meanX} y1={d.baseline} y2={d.baseline + 5} stroke={C.muted} />
      <Text x={d.left} y={138} style={{ fontSize: 10 }}>1</Text><Text x={d.right - 12} y={138} style={{ fontSize: 10 }}>10</Text>
      <Text x={d.meanX} y={138} textAnchor="middle" style={{ fontFamily: FONT, fontSize: 10 }}>{`均值 ${curve.mean.toFixed(1)}`}</Text>
    </Svg>
  </View>;
}

function RadarChart({ p }: { p: Passport }) {
  const axes = harmonyRadar(p);
  if (!axes) return null;
  return <View style={{ alignItems: "center", marginBottom: 12 }} wrap={false}>
    <T style={s.h4}>几何协调度 /100</T>
    <Svg width={300} height={258} viewBox="0 0 360 310">
      {[22, 44, 66, 88].map(r => <Polygon key={r} points={axes.map((_, i) => { const q = radarPoint(i, axes.length, r); return `${q.x},${q.y}`; }).join(" ")} fill="none" stroke={C.rule} strokeWidth={0.8} />)}
      {axes.map((a, i) => { const q = radarPoint(i, axes.length, 88); return <Line key={a.id} x1={180} y1={150} x2={q.x} y2={q.y} stroke={C.rule} strokeWidth={0.8} />; })}
      {axes.every(a => a.value !== null) && <Polygon points={radarPolygon(axes)} fill="#c8d8d5" stroke={C.primary} strokeWidth={1.6} />}
      {axes.map((a, i) => { const q = radarPoint(i, axes.length, 119), dot = radarPoint(i, axes.length, 88 * (a.value ?? 0) / 100); return <React.Fragment key={a.id}>
        {a.value !== null && <Circle cx={dot.x} cy={dot.y} r={2.5} fill={C.primary} />}
        <Text x={q.x} y={q.y - 3} textAnchor="middle" style={{ fontSize: 11, fontFamily: FONT }} fill={C.soft}>{a.label}</Text>
        <Text x={q.x} y={q.y + 12} textAnchor="middle" style={{ fontSize: 12, fontFamily: FONT }} fill={C.ink}>{a.value ?? "—"}</Text>
      </React.Fragment>; })}
    </Svg>
  </View>;
}

function Interpretation({ p }: { p: Passport }) {
  const an = p.analysis;
  return (
    <Chapter k="interpretation">
      <RadarChart p={p} />
      <View style={s.row}>
        <View style={[s.box, { flex: 1, marginRight: 6 }]}>
          <T style={s.h4}>{copy.works}</T>
          {an.works.map((w) => <Bullet key={w.text} mark="✓" color={C.primary}>{stripRefs(w.text)}</Bullet>)}
        </View>
        <View style={[s.box, { flex: 1, marginLeft: 6 }]}>
          <T style={s.h4}>{copy.doesntWork}</T>
          {an.doesnt_work.map((w) => (
            <View key={w.text} style={{ marginBottom: 4 }} wrap={false}>
              <View style={s.row}><Pill tone={w.severity === "high" ? "amber" : undefined}>{SEVERITY[w.severity] ?? "影响较小"}</Pill></View>
              <T>{stripRefs(w.text)}</T>
            </View>
          ))}
          <T style={[s.small, { marginTop: 3 }]}>从发型、配色与光线入手，调整视觉重心。</T>
        </View>
      </View>
      <Sub title={copy.signature}>
        {an.feature_signature.map((f, i) => (
          <View key={f.title} style={[s.box, s.row, { marginBottom: 6 }]} wrap={false}>
            <Text style={{ width: 20, fontSize: 15, fontWeight: 700, color: C.amber, lineHeight: 1.2 }}>{i + 1}</Text>
            <View style={{ flex: 1 }}>
              <T style={s.bold}>{f.title}</T>
              <T style={s.soft}>所以：{stripRefs(f.styling_implication)}</T>
            </View>
          </View>
        ))}
      </Sub>
      {p.derived.display_labels.color.confidence < 0.5 && <View style={[s.note, { marginTop: 8 }]}><T>{guidance.colorCaution}</T></View>}
    </Chapter>
  );
}

// --- 04 improvements -------------------------------------------------------------------------------------------

function Improvements({ p }: { p: Passport }) {
  const recs = rankedRecs(p).slice(0, 5);
  return (
    <Chapter k="improvements">
      {recs.length === 0 && <T style={s.soft}>这份档案没有可排序的建议。</T>}
      {recs.map((r, i) => (
        <View key={r.id} style={[s.box, s.row, { marginBottom: 8 }]} wrap={false}>
          <Text style={{ width: 22, fontSize: 16, fontWeight: 700, color: C.amber, lineHeight: 1.2 }}>{i + 1}</Text>
          <View style={{ flex: 1 }}>
            <View style={[s.row, { flexWrap: "wrap" }]}>
              <Pill tone="accent">{r.categoryZh}</Pill>{r.time ? <Pill>{r.time}</Pill> : null}{r.cost ? <Pill>{r.cost}</Pill> : null}<Pill>{r.effort}</Pill>
            </View>
            <T style={{ fontSize: 11.5, fontWeight: 700, lineHeight: 1.5, marginTop: 3 }}>{r.action}</T>
            <T style={{ marginTop: 2 }}><Text style={{ color: C.muted }}>为什么 · </Text>{prepare(r.why)}</T>
            <T><Text style={{ color: C.muted }}>能带来 · </Text>{prepare(r.effect)}</T>
            {r.howTo.length > 0 && (
              <View style={{ marginTop: 2 }}>
                <T style={{ color: C.muted }}>怎么做</T>
                {r.howTo.map((h, k) => <Bullet key={h} mark={`${k + 1}.`}>{h}</Bullet>)}
              </View>
            )}
            <T><Text style={{ color: C.muted }}>怎么检查 · </Text>{prepare(r.successCheck)}</T>
            {r.avoid ? <T style={s.soft}><Text style={{ color: C.muted }}>避免 · </Text>{prepare(r.avoid)}</T> : null}
            {r.evidence.length > 0 && <T style={s.small}>依据 · {r.evidence.join("；")}</T>}
          </View>
        </View>
      ))}
    </Chapter>
  );
}

// --- 05 options ------------------------------------------------------------------------------------------------

const PREVIEW_COPY: Record<PreviewNote, string> = {
  ai: copy.previewAi, illustration: copy.previewIllustration, locked: copy.previewLocked, not_yet: copy.previewNotYet,
  expired: copy.previewExpired, failed: copy.previewFailed,
};

function Options({ p, data, images, photoMode }: { p: Passport; data: PassportResponse; images: ReportImages | null; photoMode: PhotoMode }) {
  const groups = colorGroups(p);
  const dl = p.derived.display_labels;
  const hair = hairOptions(p, data.partial.previews);
  const advice = adviceGroups(p).filter((g) => g.key !== "hair" && g.key !== "color" && g.key !== "style");
  const hairColors = p.analysis.color_profile.hair_color_directions;
  return (
    <Chapter k="options">
      <Sub title={copy.colorTitle} first keep>
        <View style={s.box} wrap={false}>
          <T style={{ fontSize: 12, fontWeight: 700 }}>{dl.color.summary_zh}</T>
          {dl.seasonal_leaning && <T style={s.soft}>{dl.seasonal_leaning.text_zh}</T>}
          <View style={[s.row, { marginTop: 8 }]}>
            {groups.map((g) => (
              <View key={g.key} style={{ flex: 1, paddingRight: 8 }}>
                <T style={s.h4}>{g.title}</T>
                <Swatches hexes={g.colors.slice(0, 8).map((c) => c.hex)} />
                <T style={[s.small, { color: C.soft }]}>{g.colors.slice(0, 4).map((c) => c.name_zh).join("、")}</T>
              </View>
            ))}
          </View>
          {hairColors.length > 0 && (
            <View style={[s.row, { marginTop: 6, paddingTop: 6, borderTopWidth: 0.5, borderTopColor: C.rule, alignItems: "center", flexWrap: "wrap" }]}>
              <T style={[s.small, { marginRight: 6 }]}>发色方向</T>
              {hairColors.map((h) => (
                <View key={h.hex} style={[s.row, { alignItems: "center", marginRight: 8 }]}>
                  <Swatches hexes={[h.hex]} size={9} /><T style={{ fontSize: 8.5 }}>{h.name}</T>
                </View>
              ))}
            </View>
          )}
          <T style={[s.small, { marginTop: 4 }]}>色彩判断受拍摄光线影响，可信度 {Math.round(dl.color.confidence * 100)}%。</T>
        </View>
      </Sub>

      <Sub title={copy.styleTitle} keep>
        <View style={s.box} wrap={false}>
          <T style={{ fontSize: 12, fontWeight: 700 }}>{cover(p).styleLine}</T>
          <T style={s.soft}>{p.analysis.profile_summary.best_direction}</T>
          <T style={[s.small, { marginTop: 3 }]}>风格描述的是视觉印象（量感与线条），不是性格或身份。</T>
        </View>
      </Sub>

      <Sub title={copy.hairTitle} keep>
        <T style={[s.soft, { marginBottom: 6 }]}>{p.analysis.hair_direction.texture_approach}</T>
        <View style={s.row}>
          {hair.map((h, i) => (
            <HairTile key={h.tier} h={h} last={i === hair.length - 1} img={images?.hair[h.tier] ?? null}
              paid={data.entitlement.paid} expired={data.media.expired} photoMode={photoMode} />
          ))}
        </View>
      </Sub>

      <Sub title={copy.makeoverTitle}>
        {pairs(advice).map((pair) => (
          <View key={pair[0].key} style={[s.row, { justifyContent: "space-between" }]} wrap={false}>
            {pair.map((g) => (
              <View key={g.key} style={[s.box, { width: "49%", marginBottom: 8 }]}>
                <View style={[s.row, { justifyContent: "space-between" }]}>
                  <T style={{ fontSize: 11, fontWeight: 700 }}>{g.title}</T>
                  {g.swatches && g.swatches.length > 0 && <Swatches hexes={g.swatches.slice(0, 5)} size={9} />}
                </View>
                <T style={[s.bold, { marginTop: 2 }]}>{g.choose}</T>
                {g.why && <T style={s.soft}>{g.why}</T>}
                {g.avoid && <T style={s.small}>避免：{g.avoid}</T>}
              </View>
            ))}
          </View>
        ))}
        <MakeoverDetails p={p} data={data} />
      </Sub>
    </Chapter>
  );
}

const pairs = <X,>(xs: X[]): X[][] => xs.reduce<X[][]>((acc, x, i) => (i % 2 ? acc[acc.length - 1].push(x) : acc.push([x]), acc), []);

function HairTile({ h, img, last, paid, expired, photoMode }: {
  h: HairOptionView; img: string | null; last: boolean; paid: boolean; expired: boolean; photoMode: PhotoMode;
}) {
  const pv = h.preview;
  const note = previewNote({ status: pv?.status ?? null, imageModel: pv?.image_model ?? null, paid, expired });
  const hasImage = (note === "ai" || note === "illustration") && Boolean(img);
  // a succeeded try-on the viewer chose not to include is described, not shown
  const caption = hasImage ? PREVIEW_COPY[note]
    : (note === "ai" || note === "illustration") ? (photoMode === "expired" ? copy.previewExpired : `${PREVIEW_COPY[note]}：已生成，本 PDF 未包含图片`)
      : PREVIEW_COPY[note];
  return (
    <View style={[s.box, { flex: 1, marginRight: last ? 0 : 8, padding: 0, overflow: "hidden" }]} wrap={false}>
      {hasImage ? (
        <View>
          <Image src={img!} style={{ width: "100%", height: 150, objectFit: "cover" }} />
          <T style={{ fontSize: 7.5, color: "#fff", backgroundColor: "#000000aa", textAlign: "center", paddingVertical: 2 }}>{caption}</T>
        </View>
      ) : (
        <View style={{ backgroundColor: C.panel, padding: 8 }}><T style={s.small}>{note === "locked" ? "[完整护照] " : ""}{caption}</T></View>
      )}
      <View style={{ padding: 8 }}>
        <View style={s.row}><Pill tone={h.tier === "safe" ? "accent" : h.tier === "bold" ? "amber" : undefined}>{h.tierZh}</Pill></View>
        <T style={{ fontSize: 11, fontWeight: 700, lineHeight: 1.4, marginTop: 3 }}>{h.name}</T>
        <T style={s.small}>{h.role}</T>
        {h.why[0] && <T style={[s.soft, { fontSize: 8.5, marginTop: 3 }]}>{h.why[0]}</T>}
        <T style={[s.small, { marginTop: 3 }]}>{h.params.slice(0, 3).map((x) => x.value).join(" · ")} · 每天约 {h.minutes} 分钟</T>
        {h.issues.map((i) => <T key={i} style={{ fontSize: 8, color: "#b4442f" }}>{i}</T>)}
      </View>
    </View>
  );
}

function MakeoverDetails({ p, data }: { p: Passport; data: PassportResponse }) {
  const an = p.analysis;
  const md = an.makeup_direction;
  const od = an.outfit_direction;
  const gs = p.derived.glasses_size;
  const lk = data.entitlement.locked;
  const pd = an.photo_direction;
  const cell = { width: "49%", marginBottom: 8 } as Style;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
      <View style={[s.panel, cell]} wrap={false}>
        <T style={s.bold}>{md.mode === "grooming" ? "理容细节" : "妆容细节"}</T>
        {md.mode === "grooming"
          ? [md.base_tone, md.brow, ...md.grooming].filter(Boolean).map((x) => <Bullet key={x}>{x}</Bullet>)
          : ([["底妆", md.base_tone], ["唇", md.lip], ["腮红", md.blush.note], ["眉", md.brow], ["眼", md.eye_focus]] as const)
            .filter(([, v]) => Boolean(v)).map(([k, v]) => <T key={k} style={s.soft}><Text style={{ color: C.muted }}>{k} · </Text>{prepare(v as string)}</T>)}
        {an.color_profile.lip_families.length > 0 && (
          <View style={[s.row, { flexWrap: "wrap", alignItems: "center", marginTop: 3 }]}>
            <T style={[s.small, { marginRight: 4 }]}>唇色</T>
            {an.color_profile.lip_families.map((l) => (
              <View key={l.hex} style={[s.row, { alignItems: "center", marginRight: 6 }]}><Swatches hexes={[l.hex]} size={9} /><T style={{ fontSize: 8.5 }}>{l.name}</T></View>
            ))}
          </View>
        )}
        {lk.includes("makeup.lip_families") && <Locked text="其余唇色" />}
      </View>
      <View style={[s.panel, cell]} wrap={false}>
        <T style={s.bold}>穿搭公式</T>
        {od.formulas.map((f) => <T key={f.title} style={s.soft}><Text style={{ fontWeight: 700, color: C.ink }}>{prepare(f.title)}</Text>：{prepare(f.pieces.join(" + "))}</T>)}
        {od.occasions.length > 0 && <T style={s.small}>场合：{od.occasions.map((o) => o.look).join("；")}</T>}
        {(lk.includes("outfit.formulas") || lk.includes("outfit.occasions") || lk.includes("outfit.items")) && <Locked text="其余公式、单品与场合方案" />}
      </View>
      {an.glasses_direction && (
        <View style={[s.panel, cell]} wrap={false}>
          <T style={s.bold}>镜框尺寸</T>
          {gs ? (
            <>
              <T style={s.soft}>{([["总宽", gs.total_width_mm], ["镜片", gs.lens_width_mm], ["鼻梁", gs.bridge_mm]] as [string, unknown][])
                .filter((x): x is [string, number[]] => Array.isArray(x[1])).map(([k, v]) => `${k} ${v.join("–")} 毫米`).join(" · ")}</T>
              <T style={s.small}>{gs.note_zh}</T>
            </>
          ) : lk.includes("glasses_size") ? <Locked text="镜框毫米尺寸" /> : <T style={s.small}>这次没有测得可靠的尺寸。</T>}
        </View>
      )}
      <View style={[s.panel, cell]} wrap={false}>
        <T style={s.bold}>拍照</T>
        <T style={s.soft}>{[pd.best_angle, pd.camera_height, pd.lighting, pd.expression].filter(Boolean).join(" · ")}</T>
        {pd.avoid.length > 0 && <T style={s.small}>避免：{pd.avoid.join("、")}</T>}
      </View>
    </View>
  );
}

// --- 06 plan ---------------------------------------------------------------------------------------------------

function Plan({ p, data }: { p: Passport; data: PassportResponse }) {
  const top = rankedRecs(p).slice(0, 3);
  const plan = p.derived.plan;
  const has = plan.today.length + plan.next_haircut.length + plan.invest.length > 0;
  const cols = ["today", "next_haircut", "invest"] as const;
  return (
    <Chapter k="plan">
      <Sub title={copy.planTop} first keep>
        <View style={s.row}>
          {top.map((r, i) => (
            <View key={r.id} style={[s.box, { flex: 1, marginRight: i === top.length - 1 ? 0 : 8 }]} wrap={false}>
              <Text style={{ fontSize: 15, fontWeight: 700, color: C.amber, lineHeight: 1.2 }}>{i + 1}</Text>
              <T style={[s.bold, { marginTop: 2 }]}>{r.action}</T>
              <T style={s.small}>{[r.time, r.cost].filter(Boolean).join(" · ")}</T>
              <T style={[s.small, { marginTop: 2 }]}>怎么检查：{r.successCheck}</T>
            </View>
          ))}
        </View>
      </Sub>
      {has ? (
        <Sub title={copy.planFull} glue={false}>
          <View style={s.row}>
            {cols.map((k, i) => (
              <View key={k} style={{ flex: 1, marginRight: i === cols.length - 1 ? 0 : 8 }}>
                <T style={s.h4}>{copy.planColumns[k]}</T>
                {plan[k].length ? plan[k].map((x) => (
                  <View key={x.rec_id} style={[s.box, { marginBottom: 5, padding: 7 }]} wrap={false}>
                    <T>{stripRefs(x.action)}</T>
                    <T style={s.small}>怎么检查：{x.success_check}</T>
                  </View>
                )) : <T style={s.small}>这一栏暂时没有。</T>}
              </View>
            ))}
          </View>
        </Sub>
      ) : data.entitlement.locked.includes("plan") ? (
        <View style={[s.panel, { marginTop: 12 }]}><T>[完整护照] 按“今天 / 下次剪发 / 值得投入”排好的完整计划包含在完整护照中。</T></View>
      ) : null}
      <View style={[s.box, { marginTop: 14 }]} wrap={false}>
        <T style={s.h4}>打印后勾选</T>
        {top.map((r) => <Bullet key={r.id} mark="□">{r.action}</Bullet>)}
      </View>
    </Chapter>
  );
}

// --- 07 methods ------------------------------------------------------------------------------------------------

function Methods({ p, demo }: {
  p: Passport; data: PassportResponse; mv: MeasureView | null; sample: boolean; demo: DemoKind; paid: boolean; photoMode: PhotoMode;
}) {
  return <Chapter k="methods">
    <View style={s.panel}>{p.analysis.limitations.length ? p.analysis.limitations.map(l => <Bullet key={l}>{l}</Bullet>) : <T style={s.soft}>这次没有额外的局限说明。</T>}</View>
    {demo && <T style={[s.small, { marginTop: 10 }]}>{copy.pdf.demo[demo]}</T>}
    <Link src="https://github.com/tasconyeric-slack/BeautyAI/blob/main/THIRD_PARTY.md" style={[s.small, { marginTop: 14 }]}>数据来源</Link>
  </Chapter>;
}
