/** In-browser stand-in for API v0.3, built on the committed sample passports.
 *
 * Used when NEXT_PUBLIC_USE_FIXTURE=1 (no API at all) and always for the sample ids, so the landing page's
 * "看示例档案" works anywhere. It simulates the staged reveal (anchors → quick → full), feedback and rerank (a small
 * client-side approximation of the rules layer: hide / demote / boost, hair constraints, style target), paid previews
 * (D33: none free), share links, checkout and deletion. State lives in sessionStorage; an uploaded photo stays in
 * memory only and is never sent anywhere.
 */
import femaleJson from "../fixtures/sample_passport.json";
import maleJson from "../fixtures/sample_passport_male.json";
import geometryJson from "../fixtures/sample_geometry.json";
import geometryMaleJson from "../fixtures/sample_geometry_male.json";
import type { Backend, ContextPatch, FeedbackEvent, PhotoQC } from "../api";
import { ApiError } from "../api";
import type { Passport, PassportResponse, PreviewState } from "../passport";
import type { FaceGeometry } from "../tint";
import { SAMPLE_IDS, isSampleId } from "../flags";
import { demoCaseById } from "../fixtures/demo_cases";
import { freeView } from "./free-view";

const FEMALE = femaleJson as unknown as Passport;
const MALE = maleJson as unknown as Passport;
const GEOMETRY = geometryJson as unknown as FaceGeometry;
const GEOMETRY_MALE = geometryMaleJson as unknown as FaceGeometry;
const T_ANCHORS = 1200;
const T_QUICK = 3800;
const T_FULL = 7500;
const T_PREVIEW = 2600;
const HIDE_REASONS = ["超出预算", "打理时间太长", "暂时不想烫发", "暂时不想染发", "不符合日常场合", "不像我"];
const SAMPLE_PORTRAIT = "/sample/portrait.svg";
const SAMPLE_PORTRAIT_MALE = "/sample/portrait-male.svg";
const SAMPLE_PROFILE = "/sample/profile.svg";
const SAMPLE_PROFILE_MALE = "/sample/profile-male.svg";

interface FxPreview { kind: PreviewState["kind"]; target_id: string; requestedAt: number; paid: boolean }
interface FxState {
  id: string;
  presentation: Passport["user_context"]["presentation"];
  createdAt: number;
  context: ContextPatch;
  events: (FeedbackEvent & { ts: string })[];
  paid: boolean;
  previews: FxPreview[];
  shareToken: string | null;
  deletedAt: string | null;
  derivedVersion: number;
}

const photos = new Map<string, string>(); // id → object URL of the uploaded photo (memory only)
const rolePhotos = new Map<string, Record<string, string>>(); // id → role → object URL (memory only)
const memory = new Map<string, FxState>();

const key = (id: string) => `ap_fx:${id}`;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function load(id: string): FxState | null {
  if (memory.has(id)) return memory.get(id)!;
  try {
    const raw = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(key(id)) : null;
    if (raw) {
      const s = JSON.parse(raw) as FxState;
      memory.set(id, s);
      return s;
    }
  } catch {
    /* storage unavailable */
  }
  if (isSampleId(id)) {
    const demo = demoCaseById(id);
    if (!demo && id !== SAMPLE_IDS.female && id !== SAMPLE_IDS.male) return null;
    const s: FxState = {
      id, presentation: demo ? demo.passport.user_context.presentation : id === SAMPLE_IDS.male ? "masculine" : "feminine",
      createdAt: 0, context: {}, events: [],
      paid: false, previews: [], shareToken: null,
      deletedAt: null, derivedVersion: 1,
    };
    save(s);
    return s;
  }
  return null;
}

function save(s: FxState) {
  memory.set(s.id, s);
  try {
    sessionStorage.setItem(key(s.id), JSON.stringify(s));
  } catch {
    /* private mode: memory only */
  }
}

function must(id: string): FxState {
  const s = load(id);
  if (!s) throw new ApiError(404, { code: "not_found", detail: "找不到这份护照" });
  if (s.deletedAt) throw new ApiError(410, { code: "deleted", detail: "这份护照已被删除", deleted_at: s.deletedAt });
  return s;
}

function mergeContext(base: Passport["user_context"], patch: ContextPatch): Passport["user_context"] {
  const out = clone(base) as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch ?? {})) {
    const cur = out[k];
    out[k] = v && typeof v === "object" && !Array.isArray(v) && cur && typeof cur === "object" ? { ...cur, ...v } : v;
  }
  return out as unknown as Passport["user_context"];
}

/** A compact client-side version of rules.derive's feedback + constraint effects (fixture mode only). */
export function fixturePassport(s: FxState): Passport {
  const p = clone(demoCaseById(s.id)?.passport ?? (s.presentation === "masculine" ? MALE : FEMALE));
  p.passport_id = s.id;
  const contextChanged = Object.keys(s.context).length > 0;
  p.user_context = mergeContext(p.user_context, s.context);
  if (s.presentation !== "masculine") p.user_context.presentation = s.presentation;
  const d = p.derived;
  const latest = new Map<string, FeedbackEvent>();
  for (const e of s.events) latest.set(`${e.target_type}:${e.reaction === "target" ? "*" : e.target_id}`, e);
  const changes: Passport["derived"]["feedback_applied"]["changes"] = [];
  const factor = new Map<string, number>();
  const hidden = new Set<string>();
  const hairOffset = new Map<string, number>();
  const overlay = d.style_profile.preference_overlay;
  overlay.liked = [...(p.user_context.style_preferences?.liked ?? [])];
  overlay.disliked = [...(p.user_context.style_preferences?.disliked ?? [])];
  overlay.target = p.user_context.target_style ?? null;
  for (const e of latest.values()) {
    const t = e.target_type;
    if (t === "recommendation") {
      if (e.reaction === "dislike" && (e.reason_tags ?? []).some((r) => HIDE_REASONS.includes(r))) {
        hidden.add(e.target_id);
        changes.push({ target_type: t, target_id: e.target_id, effect: "hidden" });
      } else if (e.reaction === "like" || e.reaction === "dislike") {
        factor.set(e.target_id, e.reaction === "like" ? 1.35 : 0.45);
        changes.push({ target_type: t, target_id: e.target_id, effect: e.reaction === "like" ? "boosted" : "demoted" });
      }
    } else if (t === "hair_option" && (e.reaction === "like" || e.reaction === "dislike")) {
      hairOffset.set(e.target_id, e.reaction === "like" ? -1.5 : 2.5);
      changes.push({ target_type: t, target_id: e.target_id, effect: e.reaction === "like" ? "boosted" : "demoted" });
    } else if (t === "garment" && (e.reaction === "like" || e.reaction === "dislike")) {
      changes.push({ target_type: t, target_id: e.target_id, effect: e.reaction === "like" ? "boosted" : "demoted" });
    } else if (t === "style") {
      if (e.reaction === "target") {
        overlay.target = e.target_id as typeof overlay.target;
        changes.push({ target_type: t, target_id: e.target_id, effect: "target_set" });
      } else if (e.reaction === "like" && !overlay.liked.includes(e.target_id as never)) {
        overlay.liked.push(e.target_id as never);
        changes.push({ target_type: t, target_id: e.target_id, effect: "boosted" });
      } else if (e.reaction === "dislike" && !overlay.disliked.includes(e.target_id as never)) {
        overlay.disliked.push(e.target_id as never);
        changes.push({ target_type: t, target_id: e.target_id, effect: "demoted" });
      }
    }
  }
  // Recommendations: re-score, drop hidden, rebuild top5 and the plan columns.
  const ranked = d.ranked_recommendations
    .filter((r) => !hidden.has(r.rec_id))
    .map((r) => {
      const f = factor.get(r.rec_id) ?? 1;
      return { ...r, priority_score: +(r.priority_score * f).toFixed(4), score_breakdown: { ...r.score_breakdown, feedback_factor: f } };
    })
    .sort((a, b) => b.priority_score - a.priority_score)
    .map((r, i) => ({ ...r, rank: i + 1 }));
  d.ranked_recommendations = ranked;
  d.top5 = ranked.slice(0, 5).map((r) => r.rec_id);
  d.excluded_recommendations = [
    ...d.excluded_recommendations.filter((x) => x.reason !== "below_top_n"),
    ...[...hidden].map((rec_id) => ({ rec_id, reason: "user_hidden" as const })),
  ];
  for (const col of ["today", "next_haircut", "invest"] as const) d.plan[col] = d.plan[col].filter((x) => !hidden.has(x.rec_id));
  // Hair directions: constraints and feedback order.
  const c = p.user_context.constraints;
  const order = { safe: 0, bold: 1, easy: 2 } as const;
  d.hair_option_checks = d.hair_option_checks
    .map((h) => {
      const opt = p.analysis.hair_options.find((o) => o.tier === h.tier);
      const blocked = (opt?.requires ?? []).filter((r) => (r === "perm" && !c.accepts_perm) || (r === "dye" && !c.accepts_dye)
        || (r === "grow_out" && p.user_context.hair?.grow_out_ok === false));
      const minutes = opt?.maintenance.daily_minutes ?? 0;
      const issues: string[] = [...blocked.map((r) => (r === "perm" ? "需要烫发，与你的条件不符" : r === "dye" ? "需要染发，与你的条件不符" : "需要留长，与你的条件不符"))];
      let status: "ok" | "warn" | "excluded" = blocked.length ? "excluded" : "ok";
      if (!blocked.length && minutes > c.daily_minutes) {
        issues.push(`每天打理约 ${minutes} 分钟，超出你的 ${c.daily_minutes} 分钟`);
        status = "warn";
      }
      return { ...h, status, issues, _r: order[h.tier] + (hairOffset.get(h.tier) ?? 0) + (status === "excluded" ? 100 : 0) };
    })
    .sort((a, b) => a._r - b._r)
    .map(({ _r, ...h }, i) => ({ ...h, rank: i + 1 }));
  const counts = { boosted: 0, demoted: 0, hidden: 0 };
  let target: string | null = null;
  for (const ch of changes) {
    if (ch.effect in counts) counts[ch.effect as keyof typeof counts]++;
    if (ch.effect === "target_set") target = d.style_profile.names_zh[ch.target_id] ?? ch.target_id;
  }
  const parts = [["boosted", "提升"], ["demoted", "降低"], ["hidden", "隐藏"]]
    .filter(([k]) => counts[k as keyof typeof counts])
    .map(([k, label]) => `${label} ${counts[k as keyof typeof counts]} 项`);
  if (target) parts.push(`穿搭与发型向${target}靠拢`);
  if (contextChanged) parts.push("已按新的条件重新排序");
  d.feedback_applied = {
    event_count: latest.size,
    changes,
    note_zh: parts.length ? `${latest.size ? `已按你的 ${latest.size} 条反馈调整：` : "已更新："}${parts.join("、")}` : null,
  };
  d.derived_version = s.derivedVersion;
  return p;
}

/** Fixture previews are illustration art (the drawn sample person), never a photo edit. Look Studio combos
 *  (`bold_hc1`, `current_hc2`, D30) recolour the sample hair via /demo-art. */
export function fixturePreviewArt(p: Passport, targetId: string): string | null {
  const m = /^(safe|bold|easy|current)(?:_hc(\d))?$/.exec(targetId);
  if (!m) return null;
  const base = m[1] === "current" ? "portrait" : `portrait-${m[1]}`;
  const hex = m[2] !== undefined ? p.analysis.color_profile.hair_color_directions[Number(m[2])]?.hex : undefined;
  if (m[2] !== undefined && !hex) return null;
  if (m[1] === "current" && !hex) return null;
  return hex ? `/demo-art/${base}_${hex.slice(1).toLowerCase()}.svg` : `/sample/${base}.svg`;
}

function previewStates(s: FxState, now: number, fullAt: number, p: Passport): PreviewState[] {
  return s.previews
    .map((pv) => {
      const started = Math.max(pv.requestedAt, fullAt);
      const done = now - started >= T_PREVIEW;
      const art = s.presentation !== "masculine" && pv.kind === "hair" && !photos.has(s.id) && !demoCaseById(s.id)
        ? fixturePreviewArt(p, pv.target_id) : null;
      const status: PreviewState["status"] = !done ? "pending" : art ? "succeeded" : "fallback";
      return {
        target_id: pv.target_id, kind: pv.kind, status, image_model: done && art ? "fixture-illustration" : null,
        after_url: status === "succeeded" ? art : null,
        before_url: status === "succeeded" ? SAMPLE_PORTRAIT : null,
        error: status === "fallback" ? "演示模式：上传的照片不会被编辑，这里只能显示文字建议" : null, ai_label: "AI 试看",
        crop_box: status === "succeeded" ? [0, 0, 1, 1] : null,
      };
    })
    .filter((pv) => now >= fullAt || pv.status !== "pending");
}

function response(s: FxState): PassportResponse {
  const now = Date.now();
  const elapsed = now - s.createdAt;
  const full = fixturePassport(s);
  const status: PassportResponse["status"] = elapsed < T_QUICK ? "scanning" : elapsed < T_FULL ? "quick_ready" : "full_ready";
  const fullAt = s.createdAt + T_FULL;
  const previews = status === "full_ready" ? previewStates(s, now, fullAt, full) : [];
  full.previews = previews.map((pv) => ({
    rec_id: null, target_id: pv.target_id, kind: pv.kind, status: pv.status, image_model: pv.image_model,
    before_ref: pv.after_url ? `before_${pv.kind}_${pv.target_id}.jpg` : "front",
    after_ref: pv.after_url ? `preview_${pv.kind}_${pv.target_id}.jpg` : null, identity_check: "unchecked",
    prompt_used: null, ai_label: "AI 试看",
  }));
  let passport: Passport | null = status === "full_ready" ? full : null;
  let locked: string[] = [];
  if (passport && !s.paid) [passport, locked] = freeView(passport);
  const sig = full.analysis.feature_signature;
  const cited = new Set(sig.flatMap((x) => x.observation_ids));
  const quick = elapsed >= T_QUICK ? {
    summary_zh: full.analysis.profile_summary.one_liner,
    feature_signature: sig,
    observations: full.analysis.observations.filter((o) => cited.has(o.id)),
  } : null;
  const demo = demoCaseById(s.id);
  const front = photos.get(s.id) ?? demo?.photos.front ?? (s.presentation === "masculine" ? SAMPLE_PORTRAIT_MALE : SAMPLE_PORTRAIT);
  return {
    id: s.id,
    status,
    stage: status === "full_ready" ? "done" : elapsed < T_ANCHORS ? "qc" : elapsed < T_QUICK ? "quick" : "analysis",
    partial: {
      input_quality: elapsed >= T_ANCHORS ? full.input_quality : null,
      anchors: elapsed >= T_ANCHORS ? full.anchors : null,
      quick,
      analysis: status === "full_ready" ? "ready" : "pending",
      previews,
    },
    passport,
    entitlement: {
      paid: s.paid, unlock_scope: s.paid ? "full" : "free", share_token: s.shareToken,
      free_previews_left: 0, price_cny: 139, locked,
    },
    media: {
      // a sample passport (createdAt 0) is a fixed synthetic image that never expires, like the public sample report;
      // otherwise its photo would "expire" in 1970 and the report would claim a photo that is on screen was deleted
      front, thumb: front, expires_at: s.createdAt ? new Date(s.createdAt + 24 * 3600e3).toISOString() : null, expired: false,
      // uploads: the person's own photos (no geometry → no lines on them); samples: the synthetic illustrations
      photos: photos.has(s.id)
        ? { front, ...(rolePhotos.get(s.id) ?? {}) }
        : demo ? { ...demo.photos }
        : { front, profile90: s.presentation === "masculine" ? SAMPLE_PROFILE_MALE : SAMPLE_PROFILE },
    },
    error: null,
    created_at: demo?.passport.created_at ?? new Date(s.createdAt || Date.parse("2026-10-22T09:00:00Z")).toISOString(),
  };
}

const rand = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, "0")).join("");

export const fixtureBackend: Backend = {
  kind: "fixture",
  async health() {
    return { environment: "development", demo: true, analysis_provider: "fixture", image_edit_provider: "fixture",
      payment_provider: "fake", qc_mode: "fixture", invite_required: false, price_cny: 139 };
  },
  async qc(role): Promise<PhotoQC> {
    await wait(250);
    return { photo_id: role, status: "ok", issues: [], messages: [], face_count: 1, yaw: null, mode: "fixture" };
  },
  async create({ front, context, extra }) {
    const id = `fx_${rand()}`;
    try {
      photos.set(id, URL.createObjectURL(front));
      rolePhotos.set(id, Object.fromEntries(Object.entries(extra ?? {}).filter(([, b]) => b).map(([r, b]) => [r, URL.createObjectURL(b as Blob)])));
    } catch {
      /* non-browser */
    }
    const { presentation, ...rest } = context;
    save({ id, presentation, createdAt: Date.now(), context: rest, events: [], paid: false,
      previews: [], shareToken: null,
      deletedAt: null, derivedVersion: 1 });
    return { id };
  },
  async get(id) {
    return response(must(id));
  },
  async enrich(id, patch, files) {
    const s = must(id);
    const { presentation, ...rest } = (patch ?? {}) as ContextPatch & { presentation?: FxState["presentation"] };
    const reanalyze = Boolean(files && Object.values(files).some(Boolean)) || (presentation !== undefined && presentation !== s.presentation);
    s.context = mergeContext(s.context as never, rest) as unknown as ContextPatch;
    if (presentation) s.presentation = presentation;
    s.derivedVersion += 1;
    if (reanalyze) s.createdAt = Date.now() - T_QUICK; // simulate the model re-run: quick result shown, full arrives again
    save(s);
    return { mode: reanalyze ? "reanalyze" : "rerank", ...response(s) };
  },
  async feedback(id, ev) {
    const s = must(id);
    const dup = ev.client_event_id && s.events.some((e) => e.client_event_id === ev.client_event_id);
    if (!dup) s.events.push({ ...ev, ts: new Date().toISOString() });
    save(s);
    return { ok: true, duplicate: Boolean(dup), event_count: s.events.length };
  },
  async rerank(id, patch) {
    const s = must(id);
    if (patch && Object.keys(patch).length) s.context = mergeContext(s.context as never, patch) as unknown as ContextPatch;
    s.derivedVersion += 1;
    save(s);
    await wait(120);
    return response(s);
  },
  async previews(id, kind, targetIds) {
    const s = must(id);
    const out = [];
    for (const t of targetIds) {
      if (kind === "hair" && !/^(safe|bold|easy|current)(_hc\d)?$/.test(t) || t === "current") {
        throw new ApiError(422, { code: "not_previewable", detail: "这个组合不能生成试看" });
      }
      if (s.previews.some((p) => p.kind === kind && p.target_id === t)) { // fixture results are deterministic
        out.push({ target_id: t, kind, status: "pending" });
        continue;
      }
      // D33: photorealistic previews are paid only.
      if (!s.paid) throw new ApiError(402, { code: "payment_required", detail: "AI 试看包含在完整护照中" });
      s.previews.push({ kind, target_id: t, requestedAt: Date.now(), paid: true });
      out.push({ target_id: t, kind, status: "pending" });
    }
    save(s);
    return { previews: out };
  },
  async geometry(id) {
    must(id);
    // the sample geometry only matches the sample portrait (same synthetic landmarks as the sample's measurements)
    if (photos.has(id)) return null;
    return demoCaseById(id)?.geometry ?? (must(id).presentation === "masculine" ? GEOMETRY_MALE : GEOMETRY);
  },
  async share(id) {
    const s = must(id);
    s.shareToken = s.shareToken ?? `fx-${s.id}`;
    save(s);
    return { share_token: s.shareToken, url: `/s/${s.shareToken}` };
  },
  async shared(token) {
    const id = token.startsWith("fx-") ? token.slice(3) : "";
    const s = id ? load(id) : null;
    if (!s || s.deletedAt) throw new ApiError(404, { code: "not_found", detail: "分享链接已失效" });
    const [view] = freeView(fixturePassport(s));
    view.previews = [];
    return { passport: view, created_at: new Date(s.createdAt || Date.parse("2026-10-22T09:00:00Z")).toISOString() };
  },
  async remove(id) {
    const s = load(id);
    if (!s) throw new ApiError(404, { code: "not_found", detail: "找不到这份护照" });
    s.deletedAt = s.deletedAt ?? new Date().toISOString();
    s.events = [];
    s.previews = [];
    s.shareToken = null;
    const url = photos.get(id);
    if (url) URL.revokeObjectURL(url);
    photos.delete(id);
    save(s);
    return { deleted_at: s.deletedAt };
  },
  async checkout(id) {
    const s = must(id);
    s.paid = true;
    save(s);
    await wait(400);
    return { payment: { status: "paid", order_id: `fake_${rand()}`, pay_url: null }, ...response(s) };
  },
  async event() {
    /* fixture mode records nothing */
  },
};

/** The public full sample report (Issue #33): the synthetic sample passport with the full entitlement, built through
 *  the same fixture response as /p/[sample] so the report renders exactly what a paid passport would. Nothing is
 *  stored: the visitor's own sample state (free view, feedback) stays untouched. The three hair previews are the
 *  drawn sample illustrations (feminine sample) or an honest "not generated" fallback (masculine sample). */
export function sampleReportResponse(variant: "female" | "male" | string = "female"): PassportResponse {
  // Issue #14: a pipeline-backed demo case by sample id. Its previews were never generated, so none are shown.
  const demo = demoCaseById(variant);
  const id = demo ? demo.id : variant === "male" ? SAMPLE_IDS.male : SAMPLE_IDS.female;
  const s: FxState = {
    id, presentation: demo ? demo.passport.user_context.presentation : variant === "male" ? "masculine" : "feminine",
    createdAt: 0, context: {}, events: [], paid: true,
    previews: demo ? [] : (["safe", "bold", "easy"] as const).map((t) => ({ kind: "hair" as const, target_id: t, requestedAt: 0, paid: true })),
    shareToken: null, deletedAt: null, derivedVersion: 1,
  };
  const r = response(s);
  // a sample never expires: it is a drawn illustration, not anyone's photo
  return { ...r, media: { ...r.media, expires_at: null, expired: false } };
}

/** Test helper: forget all fixture state. */
export function resetFixtures() {
  memory.clear();
  photos.clear();
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k?.startsWith("ap_fx:")) sessionStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }
}
