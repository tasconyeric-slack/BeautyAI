"use client";

/** Passport state for /p/[id]/** (T05). One provider per passport page tree.
 *
 *  - Polls GET /api/passport/{id}: every 1 s, backing off to 3 s, until the full passport and all previews settle.
 *  - Feedback is optimistic (the chip changes at once), then POST feedback → POST rerank; the change note comes from
 *    derived.feedback_applied. Offline feedback is queued in localStorage and re-sent when the browser is online.
 *  - Exposes enrich / rerank / previews / share / delete / checkout as actions that refresh the response.
 */
import * as React from "react";
import {
  ApiError,
  backendFor,
  type ContextPatch,
  type FeedbackEvent,
  type Passport,
  type PassportResponse,
  type PreviewKind,
  type ExtraRole, type PhotoMeta,
} from "../api";
import { clearChoices } from "./choices";

export type FeedbackKey = `${FeedbackEvent["target_type"]}:${string}`;
export interface FeedbackMark {
  reaction: FeedbackEvent["reaction"] | null;
  reasons: string[];
}

export interface PassportStore {
  id: string;
  data: PassportResponse | null;
  passport: Passport | null;
  loading: boolean;
  error: ApiError | null;
  deletedAt: string | null;
  /** Last rerank's one-line change note (derived.feedback_applied.note_zh), shown in a toast / bar. */
  changeNote: string | null;
  busy: boolean;
  queued: number;
  marks: Record<string, FeedbackMark>;
  refresh(): Promise<void>;
  sendFeedback(ev: Omit<FeedbackEvent, "client_event_id">): Promise<void>;
  adjust(patch: ContextPatch): Promise<void>;
  enrich(patch: ContextPatch, files?: Partial<Record<ExtraRole, Blob>>, photoMeta?: PhotoMeta): Promise<"rerank" | "reanalyze">;
  requestPreviews(kind: PreviewKind, targetIds: string[]): Promise<void>;
  share(): Promise<{ share_token: string; url: string }>;
  remove(): Promise<string>;
  unlock(inviteCode?: string): Promise<void>;
}

const Ctx = React.createContext<PassportStore | null>(null);

export function usePassport(): PassportStore {
  const v = React.useContext(Ctx);
  if (!v) throw new Error("usePassport() must be used inside <PassportProvider>");
  return v;
}

/** Non-throwing variant for components that also render outside a passport (e.g. the share card preview). */
export function useMaybePassport(): PassportStore | null {
  return React.useContext(Ctx);
}

const queueKey = (id: string) => `ap_fbq:${id}`;
const marksKey = (id: string) => `ap_fb:${id}`;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked: keep in memory */
  }
}

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

export function settled(r: PassportResponse | null): boolean {
  if (!r) return false;
  if (r.status === "deleted" || r.status === "qc_failed" || r.status === "analysis_failed") return true;
  return r.status === "full_ready" && !r.partial.previews.some((p) => p.status === "pending");
}

export function PassportProvider({ id, initial, children }: { id: string; initial?: PassportResponse; children: React.ReactNode }) {
  const backend = React.useMemo(() => backendFor(id), [id]);
  const [data, setData] = React.useState<PassportResponse | null>(initial ?? null);
  const [error, setError] = React.useState<ApiError | null>(null);
  const [deletedAt, setDeletedAt] = React.useState<string | null>(null);
  const [changeNote, setChangeNote] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [marks, setMarks] = React.useState<Record<string, FeedbackMark>>({});
  const [queued, setQueued] = React.useState(0);
  const [pollTick, setPollTick] = React.useState(0);

  React.useEffect(() => {
    setMarks(readJson(marksKey(id), {}));
    setQueued(readJson<FeedbackEvent[]>(queueKey(id), []).length);
  }, [id]);

  const apply = React.useCallback((r: PassportResponse) => {
    setData(r);
    setError(null);
  }, []);

  const refresh = React.useCallback(async () => {
    try {
      apply(await backend.get(id));
    } catch (e) {
      if (e instanceof ApiError && e.body.code === "deleted") setDeletedAt(e.body.deleted_at ?? null);
      setError(e instanceof ApiError ? e : new ApiError(0, { code: "unknown", detail: String(e) }));
    }
  }, [apply, backend, id]);

  // Polling: 1 s at first, then 1.5×, capped at 3 s; stops once everything has settled.
  React.useEffect(() => {
    let cancelled = false;
    let delay = 1000;
    let timer: ReturnType<typeof setTimeout>;
    const loop = async () => {
      if (cancelled) return;
      try {
        const r = await backend.get(id);
        if (cancelled) return;
        apply(r);
        if (settled(r)) return;
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError) {
          if (e.body.code === "deleted") setDeletedAt(e.body.deleted_at ?? null);
          setError(e);
          if (e.status === 404 || e.status === 410) return;
        }
      }
      delay = Math.min(3000, delay * 1.5);
      timer = setTimeout(loop, delay);
    };
    loop();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [apply, backend, id, pollTick]);

  const restartPolling = React.useCallback(() => setPollTick((t) => t + 1), []);

  const flushQueue = React.useCallback(async () => {
    const q = readJson<FeedbackEvent[]>(queueKey(id), []);
    if (!q.length) return;
    const rest: FeedbackEvent[] = [];
    for (const ev of q) {
      try {
        await backend.feedback(id, ev);
      } catch (e) {
        if (e instanceof ApiError && e.offline) rest.push(ev);
      }
    }
    writeJson(queueKey(id), rest);
    setQueued(rest.length);
    if (rest.length < q.length) {
      const r = await backend.rerank(id);
      apply(r);
      setChangeNote(r.passport?.derived.feedback_applied.note_zh ?? null);
    }
  }, [apply, backend, id]);

  React.useEffect(() => {
    flushQueue();
    const on = () => flushQueue();
    window.addEventListener("online", on);
    return () => window.removeEventListener("online", on);
  }, [flushQueue]);

  const sendFeedback = React.useCallback(async (ev: Omit<FeedbackEvent, "client_event_id">) => {
    const k = `${ev.target_type}:${ev.target_id}`;
    const mark: FeedbackMark = { reaction: ev.reaction, reasons: ev.reason_tags ?? [] };
    setMarks((m) => {
      const next = { ...m, [k]: mark };
      writeJson(marksKey(id), next);
      return next;
    });
    const full: FeedbackEvent = { ...ev, client_event_id: uid() };
    setBusy(true);
    try {
      await backend.feedback(id, full);
      const r = await backend.rerank(id);
      apply(r);
      setChangeNote(r.passport?.derived.feedback_applied.note_zh ?? null);
    } catch (e) {
      if (e instanceof ApiError && e.offline) {
        const q = [...readJson<FeedbackEvent[]>(queueKey(id), []), full];
        writeJson(queueKey(id), q);
        setQueued(q.length);
        setChangeNote("网络不稳定，反馈已保存，联网后自动发送");
      } else {
        setChangeNote(e instanceof ApiError ? e.body.detail : "调整暂未保存，请稍后重试。");
      }
    } finally {
      setBusy(false);
    }
  }, [apply, backend, id]);

  const adjust = React.useCallback(async (patch: ContextPatch) => {
    setBusy(true);
    try {
      const r = await backend.rerank(id, patch);
      apply(r);
      setChangeNote(r.passport?.derived.feedback_applied.note_zh ?? "已按新的条件更新建议");
    } finally {
      setBusy(false);
    }
  }, [apply, backend, id]);

  const enrich = React.useCallback(async (patch: ContextPatch, files?: Partial<Record<ExtraRole, Blob>>, photoMeta?: PhotoMeta) => {
    setBusy(true);
    try {
      const r = await backend.enrich(id, patch, files, photoMeta);
      apply(r);
      if (r.mode === "reanalyze") restartPolling();
      else setChangeNote(r.passport?.derived.feedback_applied.note_zh ?? "已更新建议");
      return r.mode;
    } finally {
      setBusy(false);
    }
  }, [apply, backend, id, restartPolling]);

  const requestPreviews = React.useCallback(async (kind: PreviewKind, targetIds: string[]) => {
    await backend.previews(id, kind, targetIds);
    await refresh();
    restartPolling();
  }, [backend, id, refresh, restartPolling]);

  const share = React.useCallback(() => backend.share(id), [backend, id]);

  const remove = React.useCallback(async () => {
    const r = await backend.remove(id);
    setDeletedAt(r.deleted_at);
    setData(null);
    try {
      localStorage.removeItem(marksKey(id));
      localStorage.removeItem(queueKey(id));
      localStorage.removeItem(`ap_plan:${id}`);
      clearChoices(id); // chosen hairstyle, saved looks, plan state
    } catch {
      /* ignore */
    }
    return r.deleted_at;
  }, [backend, id]);

  const unlock = React.useCallback(async (inviteCode?: string) => {
    setBusy(true);
    try {
      const r = await backend.checkout(id, inviteCode);
      apply(r);
    } finally {
      setBusy(false);
    }
  }, [apply, backend, id]);

  const value: PassportStore = {
    id, data, passport: data?.passport ?? null, loading: !data && !error, error, deletedAt, changeNote, busy, queued,
    marks, refresh, sendFeedback, adjust, enrich, requestPreviews, share, remove, unlock,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Test/preview helper: a static store with no network. */
export function StaticPassportProvider({ value, children }: { value: Partial<PassportStore> & { data: PassportResponse }; children: React.ReactNode }) {
  const noop = async () => {};
  const store: PassportStore = {
    id: value.data.id, passport: value.data.passport, loading: false, error: null, deletedAt: null, changeNote: null,
    busy: false, queued: 0, marks: {}, refresh: noop, sendFeedback: noop, adjust: noop, enrich: async () => "rerank",
    requestPreviews: noop, share: async () => ({ share_token: "t", url: "/s/t" }), remove: async () => "", unlock: noop,
    ...value,
  };
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
