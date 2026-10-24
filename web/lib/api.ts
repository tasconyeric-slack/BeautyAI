/** API v0.3 client (schema/api.schema.json). One interface, two backends:
 *  - http:    the FastAPI service (NEXT_PUBLIC_API_BASE), fake or real providers behind it
 *  - fixture: in-browser simulation from the committed sample passports (NEXT_PUBLIC_USE_FIXTURE=1, and always
 *             for the sample ids), so every page renders without an API. */
import type { FaceGeometry } from "./tint";
import type { Passport, PassportResponse, PreviewState, QuickAnalysis } from "./passport";
import { flags, isSampleId } from "./flags";
import { fixtureBackend } from "./fixture/backend";
import { API_BASE, apiUrl } from "./utils";

export type { Passport, PassportResponse, PreviewState, QuickAnalysis };
export type UserContext = Passport["user_context"];
export type Presentation = UserContext["presentation"];
export type PreviewKind = PreviewState["kind"];

export interface ApiErrorBody {
  code: string;
  detail: string;
  deleted_at?: string;
}

export class ApiError extends Error {
  constructor(public status: number, public body: ApiErrorBody) {
    super(body.detail);
  }
  get offline() {
    return this.status === 0;
  }
}

export type PhotoQC = {
  photo_id: string;
  status: "ok" | "warn" | "reject";
  issues: string[];
  messages: string[];
  face_count: number;
  yaw: number | null;
  mode: "real" | "stub" | "fixture";
};

export type FeedbackTarget = "recommendation" | "hair_option" | "garment" | "style" | "color" | "profile";
export type Reaction = "like" | "neutral" | "dislike" | "target" | "resemble_yes" | "resemble_no";
export interface FeedbackEvent {
  target_type: FeedbackTarget;
  target_id: string;
  reaction: Reaction;
  reason_tags?: string[];
  client_event_id?: string;
}

/** Upload roles (V3B, D35). Only `front` is required. profile90 / noglasses are measurement-only inputs. */
export type PhotoRole = "front" | "profile90" | "noglasses" | "smile" | "profile45" | "hair";
export type ExtraRole = Exclude<PhotoRole, "front">;
/** The user-confirmed framing: crop box in source pixels (before rotation, about the crop centre), rotation, sizes. */
export interface CaptureRecord {
  crop: [number, number, number, number];
  rotate_deg: number;
  source_w: number;
  source_h: number;
  output_w: number;
  output_h: number;
  edited: boolean;
}
export type PhotoMeta = Partial<Record<PhotoRole, { eyewear?: boolean; capture?: CaptureRecord }>>;

export type ContextPatch = Partial<{ [K in keyof UserContext]: UserContext[K] extends object ? Partial<UserContext[K]> : UserContext[K] }>;
export interface CreateInput {
  front: Blob;
  context: ContextPatch & { presentation: Presentation };
  extra?: Partial<Record<ExtraRole, Blob>>;
  photoMeta?: PhotoMeta;
}
export interface Health {
  environment?: "production" | "development";
  /** True when any answer would come from a mock provider (the UI shows a demo banner). */
  demo?: boolean;
  analysis_provider: string;
  image_edit_provider: string;
  payment_provider: string;
  qc_mode: string;
  invite_required: boolean;
  price_cny: number;
}
export type EventName =
  | "landing_view" | "upload_start" | "qc_fail" | "quick_ready" | "profile_view" | "feedback"
  | "share_card_export" | "score_teaser_click" | "paywall_view" | "checkout_start" | "paid";

export interface Backend {
  kind: "http" | "fixture";
  health(): Promise<Health>;
  qc(role: string, file: Blob): Promise<PhotoQC>;
  create(input: CreateInput): Promise<{ id: string }>;
  get(id: string): Promise<PassportResponse>;
  enrich(id: string, patch: ContextPatch, files?: Partial<Record<ExtraRole, Blob>>, photoMeta?: PhotoMeta):
    Promise<PassportResponse & { mode: "rerank" | "reanalyze" }>;
  feedback(id: string, ev: FeedbackEvent): Promise<{ ok: boolean; duplicate: boolean; event_count: number }>;
  rerank(id: string, patch?: ContextPatch): Promise<PassportResponse>;
  previews(id: string, kind: PreviewKind, targetIds: string[]): Promise<{ previews: { target_id: string; kind: string; status: string }[] }>;
  geometry(id: string): Promise<FaceGeometry | null>;
  share(id: string): Promise<{ share_token: string; url: string }>;
  shared(token: string): Promise<{ passport: Passport; created_at: string }>;
  remove(id: string): Promise<{ deleted_at: string }>;
  checkout(id: string, inviteCode?: string): Promise<PassportResponse & { payment: { status: string; order_id: string | null } }>;
  event(name: EventName, extra?: { passport_id?: string; topic?: string | null; ref?: string | null }): Promise<void>;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { cache: "no-store", ...init });
  } catch {
    throw new ApiError(0, { code: "network", detail: "连接不到服务，请检查网络后重试" });
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, body.error ?? { code: `http_${res.status}`, detail: "服务出错了，请稍后重试" });
  }
  return body as T;
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body ?? {}),
});

/** Media paths from the API are relative; make them absolute for <img>. */
export function absolutize<T extends PassportResponse>(r: T): T {
  return {
    ...r,
    media: {
      ...r.media, front: apiUrl(r.media.front), thumb: apiUrl(r.media.thumb),
      photos: r.media.photos ? Object.fromEntries(Object.entries(r.media.photos).map(([k, v]) => [k, apiUrl(v ?? null)])) : undefined,
    },
    partial: {
      ...r.partial,
      previews: r.partial.previews.map((p) => ({ ...p, after_url: apiUrl(p.after_url), before_url: apiUrl(p.before_url) })),
    },
  };
}

const enc = encodeURIComponent;

export const httpBackend: Backend = {
  kind: "http",
  health: () => call("/api/health"),
  qc(role, file) {
    const fd = new FormData();
    fd.append("role", role);
    fd.append("file", file, `${role}.jpg`);
    return call("/api/qc", { method: "POST", body: fd });
  },
  create({ front, context, extra, photoMeta }) {
    const fd = new FormData();
    fd.append("context", JSON.stringify({ user_context: context }));
    fd.append("consent", "true");
    fd.append("front", front, "front.jpg");
    for (const [role, blob] of Object.entries(extra ?? {})) if (blob) fd.append(role, blob, `${role}.jpg`);
    if (photoMeta && Object.keys(photoMeta).length) fd.append("photo_meta", JSON.stringify(photoMeta));
    return call("/api/passport", { method: "POST", body: fd });
  },
  get: async (id) => absolutize(await call<PassportResponse>(`/api/passport/${enc(id)}`)),
  async enrich(id, patch, files, photoMeta): Promise<PassportResponse & { mode: "rerank" | "reanalyze" }> {
    const fd = new FormData();
    fd.append("context", JSON.stringify(patch ?? {}));
    for (const [role, blob] of Object.entries(files ?? {})) if (blob) fd.append(role, blob, `${role}.jpg`);
    if (photoMeta && Object.keys(photoMeta).length) fd.append("photo_meta", JSON.stringify(photoMeta));
    return absolutize(await call<PassportResponse & { mode: "rerank" | "reanalyze" }>(`/api/passport/${enc(id)}/enrich`, { method: "POST", body: fd }));
  },
  feedback: (id, ev) => call(`/api/passport/${enc(id)}/feedback`, json(ev)),
  rerank: async (id, patch) => absolutize(await call(`/api/passport/${enc(id)}/rerank`, json({ user_context: patch ?? {} }))),
  previews: (id, kind, targetIds) => call(`/api/passport/${enc(id)}/previews`, json({ kind, target_ids: targetIds })),
  async geometry(id) {
    try {
      return await call<FaceGeometry>(`/api/passport/${enc(id)}/geometry`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  },
  share: (id) => call(`/api/passport/${enc(id)}/share`, { method: "POST" }),
  shared: (token) => call(`/api/share/${enc(token)}`),
  remove: (id) => call(`/api/passport/${enc(id)}`, { method: "DELETE" }),
  checkout: async (id, inviteCode) =>
    absolutize(await call<PassportResponse & { payment: { status: string; order_id: string | null } }>(
      `/api/checkout`, json({ passport_id: id, invite_code: inviteCode || undefined }))),
  async event(name, extra) {
    try {
      await call("/api/events", json({ name, ...extra }));
    } catch {
      /* analytics never break the page */
    }
  },
};

/** The backend for a passport id (or for new passports when id is omitted). */
export function backendFor(id?: string | null): Backend {
  if (flags.useFixture || (id && (isSampleId(id) || id.startsWith("fx_")))) return fixtureBackend;
  return httpBackend;
}

export const api = {
  for: backendFor,
  /** Funnel events go to the live API unless the product runs on fixtures. */
  track: (name: EventName, extra?: Parameters<Backend["event"]>[1]) => backendFor(extra?.passport_id).event(name, extra),
};
